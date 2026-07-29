(() => {
  'use strict';

  const VERSION = 'M2.5B4R3A-PRODUCTION';
  const OVERLAY_ID = 'dressing-room-overlay';
  const TABS_ID = 'd32-tabs';
  const TOOLBAR_ID = 'd32-subtabs';
  const GRID_ID = 'd32-grid';
  const LOADING_ID = 'd32-loading';
  const SAVE_ID = 'd32-save';
  const RESULT_ID = 'd32-save-result';
  const HANDLE_ID = 'd32-drawer-handle';

  if (window.TappieLayerLabOfficialWardrobe?.version === VERSION) return;

  const model = {
    open: false,
    busy: false,
    dirty: false,
    catalog: null,
    state: null,
    activeType: null,
    originalSelections: new Map(),
    workingSelections: new Map(),
    previousOverflow: '',
    openSequence: 0,
    mutationSequence: 0,
    lastMutation: null,
    lastError: null
  };

  const $ = id => document.getElementById(id);
  const portal = () => window.TappieLayerLabPortal;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function officialPartType(part) {
    return text(part?.type);
  }

  function officialPartLabel(part) {
    // Use only names supplied by the authoritative LayerLab Catalog.
    return text(part?.displayName) ||
      text(part?.label) ||
      text(part?.name) ||
      officialPartType(part);
  }

  function officialItemLabel(item, index, part) {
    const supplied = text(item?.displayName) ||
      text(item?.label) ||
      text(item?.name) ||
      text(item?.title);
    if (supplied) return supplied;
    if (index === 0 && part?.useEmpty) return 'Empty · 0';
    return String(index).padStart(2, '0');
  }

  function numeric(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  function readDisplayIndex(part) {
    if (!part) return null;
    const keys = [
      'displayIndex',
      'selectedDisplayIndex',
      'currentDisplayIndex',
      'selectedIndex',
      'currentIndex',
      'activeDisplayIndex',
      'equippedDisplayIndex',
      'visibleDisplayIndex',
      'activeIndex',
      'index',
      'value'
    ];
    for (const key of keys) {
      const value = numeric(part[key]);
      if (value != null) return value;
    }
    return null;
  }

  function stateSelections(state) {
    const map = new Map();
    for (const part of state?.parts || []) {
      const type = officialPartType(part);
      const index = readDisplayIndex(part);
      if (type && index != null) map.set(type, index);
    }
    return map;
  }

  function sameSelections(a, b) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (b.get(key) !== value) return false;
    }
    return true;
  }

  function catalogPart(type) {
    return (model.catalog?.parts || []).find(
      part => officialPartType(part) === type
    ) || null;
  }

  function officialOptions(part) {
    const supplied =
      (Array.isArray(part?.items) && part.items) ||
      (Array.isArray(part?.options) && part.options) ||
      (Array.isArray(part?.variants) && part.variants) ||
      null;

    if (supplied) {
      const normalized = [];
      for (let position = 0; position < supplied.length; position += 1) {
        const item = supplied[position] || {};
        const index =
          numeric(item.displayIndex) ??
          numeric(item.index) ??
          numeric(item.value) ??
          position + (part?.useEmpty ? 0 : 1);
        normalized.push({ index, item });
      }
      return normalized;
    }

    const count = Math.max(0, Number(part?.count) || 0);
    const first = part?.useEmpty ? 0 : 1;
    const values = [];
    for (let index = first; index <= count; index += 1) {
      values.push({ index, item: null });
    }
    return values;
  }

  function itemThumbnail(item) {
    return text(item?.thumbnailUrl) ||
      text(item?.thumbnail) ||
      text(item?.previewUrl) ||
      text(item?.imageUrl) ||
      '';
  }

  function setBusy(value, message = '正在更換…') {
    model.busy = !!value;
    const loading = $(LOADING_ID);
    if (loading) {
      loading.textContent = message;
      loading.classList.toggle('show', model.busy);
    }
    const save = $(SAVE_ID);
    if (save) save.disabled = model.busy;
    const random = document.getElementById('d32-layerlab-random');
    if (random) random.disabled = model.busy;
  }

  function setDirty(value) {
    model.dirty = !!value;
    $(SAVE_ID)?.classList.toggle('is-dirty', model.dirty);
  }

  function showResult(message) {
    const result = $(RESULT_ID);
    if (!result) return;
    result.textContent = message;
    result.classList.add('show');
    clearTimeout(showResult.timer);
    showResult.timer = setTimeout(
      () => result.classList.remove('show'),
      1200
    );
  }

  function showError(message) {
    const grid = $(GRID_ID);
    if (grid) {
      grid.className = 'd32-grid d32-official-message-grid';
      grid.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'd32-official-message is-error';
      card.textContent = message;
      grid.appendChild(card);
    }
  }

  function selectedIndex(type) {
    return model.workingSelections.get(type);
  }

  function renderTabs() {
    const host = $(TABS_ID);
    if (!host) return;
    host.innerHTML = '';

    for (const part of model.catalog?.parts || []) {
      const type = officialPartType(part);
      if (!type) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'd32-tab' + (model.activeType === type ? ' active' : '');
      button.dataset.layerlabType = type;
      button.textContent = officialPartLabel(part);
      button.title = type;
      button.addEventListener('click', () => {
        model.activeType = type;
        render();
        $(GRID_ID)?.scrollTo(0, 0);
      });
      host.appendChild(button);
    }
  }

  function renderToolbar() {
    const host = $(TOOLBAR_ID);
    if (!host) return;
    host.className = 'd32-subtabs show d32-official-toolbar';
    host.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = 'd32-official-summary';
    const count = model.catalog?.parts?.length || 0;
    summary.textContent = `LayerLab Official Catalog · ${count}`;

    const random = document.createElement('button');
    random.id = 'd32-layerlab-random';
    random.type = 'button';
    random.className = 'd32-official-random';
    random.textContent = 'Random';
    random.addEventListener('click', randomize);

    host.append(summary, random);
  }

  function renderGrid() {
    const grid = $(GRID_ID);
    if (!grid) return;

    const part = catalogPart(model.activeType);
    grid.className = 'd32-grid d32-layerlab-official-grid';
    grid.innerHTML = '';

    if (!part) {
      const message = document.createElement('div');
      message.className = 'd32-official-message';
      message.textContent = '等待 LayerLab 官方 Catalog…';
      grid.appendChild(message);
      return;
    }

    const type = officialPartType(part);
    const selected = selectedIndex(type);
    const options = officialOptions(part);

    for (const { index, item } of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'd32-item d32-layerlab-option' +
        (selected === index ? ' selected' : '') +
        (index === 0 && part.useEmpty ? ' is-empty' : '');
      button.dataset.layerlabType = type;
      button.dataset.displayIndex = String(index);
      button.title = `${type} · ${index}`;
      button.setAttribute(
        'aria-label',
        `${officialPartLabel(part)} ${officialItemLabel(item, index, part)}`
      );

      const thumbUrl = itemThumbnail(item);
      const visual = document.createElement('span');
      visual.className = 'd32-layerlab-option-visual';

      if (thumbUrl) {
        const image = document.createElement('img');
        image.className = 'd32-layerlab-official-thumb';
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.src = thumbUrl;
        image.addEventListener('error', () => {
          image.remove();
          visual.classList.add('no-thumb');
          visual.textContent = index === 0 ? 'Ø' : String(index);
        }, { once: true });
        visual.appendChild(image);
      } else {
        visual.classList.add('no-thumb');
        visual.textContent = index === 0 ? 'Ø' : String(index);
      }

      const label = document.createElement('span');
      label.className = 'd32-label';
      label.textContent = officialItemLabel(item, index, part);

      button.append(visual, label);
      button.addEventListener('click', () => selectPart(type, index));
      grid.appendChild(button);
    }
  }

  function render() {
    renderTabs();
    renderToolbar();
    renderGrid();
  }

  function applyReturnedState(state, options = {}) {
    if (!state) return;
    model.state = clone(state);

    const authoritative = stateSelections(state);
    if (authoritative.size) {
      if (options.replace === true) {
        model.workingSelections = authoritative;
      } else {
        for (const [type, index] of authoritative) {
          model.workingSelections.set(type, index);
        }
      }
    }

    setDirty(
      !sameSelections(
        model.originalSelections,
        model.workingSelections
      )
    );
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function withTimeout(promise, timeoutMs, label) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)),
        timeoutMs
      );
    });

    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function recordMutation(detail) {
    model.lastMutation = {
      ...clone(detail),
      at: new Date().toISOString()
    };
    window.__TAPPIE_LAYERLAB_WARDROBE_LAST_MUTATION__ =
      clone(model.lastMutation);
  }

  function recordError(error, detail = {}) {
    const normalized = {
      ...clone(detail),
      message: error?.message || String(error),
      at: new Date().toISOString()
    };
    model.lastError = normalized;
    window.__TAPPIE_LAYERLAB_WARDROBE_LAST_ERROR__ = clone(normalized);
    window.dispatchEvent(
      new CustomEvent('tappie:layerlab-wardrobe-error', {
        detail: clone(normalized)
      })
    );
    return normalized;
  }

  async function recoverState(timeoutMs = 2600) {
    try {
      return await withTimeout(
        portal().getState(),
        timeoutMs,
        'LayerLab getState recovery'
      );
    } catch (error) {
      console.warn('[LayerLab Official Wardrobe state recovery]', error);
      return null;
    }
  }

  async function selectPart(type, displayIndex) {
    if (model.busy) {
      showResult('上一個選項仍在確認');
      return;
    }

    const requestedIndex = Number(displayIndex);
    const previousIndex = model.workingSelections.get(type);

    // Selecting the already active official index is an idempotent no-op.
    // Do not wait for a Unity state-sequence change that may never occur.
    if (previousIndex === requestedIndex) {
      showResult('已是目前選項');
      return;
    }

    const mutationId = ++model.mutationSequence;
    recordMutation({
      id: mutationId,
      command: 'setPart',
      type,
      displayIndex: requestedIndex,
      phase: 'start'
    });

    // Optimistic selected-state feedback. Authoritative state will merge back
    // when Unity responds; failure restores the previous selection.
    model.workingSelections.set(type, requestedIndex);
    setDirty(
      !sameSelections(
        model.originalSelections,
        model.workingSelections
      )
    );
    render();
    setBusy(true, `正在更換 ${type}…`);

    let state = null;
    let accepted = false;

    try {
      state = await withTimeout(
        portal().setPart(type, requestedIndex),
        3600,
        `${type} ${requestedIndex}`
      );
      accepted = true;
    } catch (error) {
      console.warn(
        '[LayerLab Official Wardrobe setPart primary response]',
        { type, displayIndex: requestedIndex, error }
      );

      // Some official combinations can be a visual no-op or may not emit the
      // mutation response expected by the Browser Contract. Ask for a fresh
      // authoritative state before declaring failure, but never leave the
      // whole wardrobe locked.
      state = await recoverState(2400);
      const recovered = stateSelections(state);
      const recoveredIndex = recovered.get(type);

      if (recoveredIndex === requestedIndex) {
        accepted = true;
      } else {
        const detail = recordError(error, {
          id: mutationId,
          command: 'setPart',
          type,
          displayIndex: requestedIndex,
          recoveredIndex:
            Number.isInteger(recoveredIndex) ? recoveredIndex : null
        });
        console.error('[LayerLab Official Wardrobe setPart]', detail);
      }
    } finally {
      // A stale response must never relock or rewrite a newer operation.
      if (mutationId === model.mutationSequence) {
        setBusy(false);
      }
    }

    if (state) applyReturnedState(state);

    if (!accepted) {
      if (previousIndex == null) model.workingSelections.delete(type);
      else model.workingSelections.set(type, previousIndex);

      setDirty(
        !sameSelections(
          model.originalSelections,
          model.workingSelections
        )
      );
      render();
      showResult(`${type} 未被官方 Runtime 套用，已解除鎖定`);
      return;
    }

    // Preserve the requested index when the returned state is partial and
    // does not expose a parsable entry for this official type.
    if (!model.workingSelections.has(type)) {
      model.workingSelections.set(type, requestedIndex);
    }

    recordMutation({
      id: mutationId,
      command: 'setPart',
      type,
      displayIndex: requestedIndex,
      phase: 'accepted'
    });

    render();
    window.dispatchEvent(
      new CustomEvent('tappie:layerlab-wardrobe-preview', {
        detail: {
          type,
          displayIndex: requestedIndex,
          state: clone(model.state)
        }
      })
    );
  }

  async function randomize() {
    if (model.busy) {
      showResult('上一個選項仍在確認');
      return;
    }

    const mutationId = ++model.mutationSequence;
    recordMutation({
      id: mutationId,
      command: 'randomize',
      phase: 'start'
    });
    setBusy(true, '正在隨機搭配…');

    try {
      let state = null;
      try {
        state = await withTimeout(
          portal().randomize(),
          4200,
          'LayerLab Random'
        );
      } catch (primaryError) {
        state = await recoverState(2600);
        if (!state) throw primaryError;
      }

      applyReturnedState(state);
      render();
      recordMutation({
        id: mutationId,
        command: 'randomize',
        phase: 'accepted'
      });
      showResult('已套用官方 Random');
    } catch (error) {
      const detail = recordError(error, {
        id: mutationId,
        command: 'randomize'
      });
      console.error('[LayerLab Official Wardrobe Random]', detail);
      showResult('Random 未完成，已解除鎖定');
    } finally {
      if (mutationId === model.mutationSequence) {
        setBusy(false);
      }
    }
  }

  async function restoreOriginal() {
    if (!model.catalog || !model.originalSelections.size) return;
    setBusy(true, '正在還原…');
    try {
      for (const part of model.catalog.parts || []) {
        const type = officialPartType(part);
        if (!type || !model.originalSelections.has(type)) continue;
        const original = model.originalSelections.get(type);
        if (model.workingSelections.get(type) === original) continue;
        const state = await withTimeout(
          portal().setPart(type, original),
          4200,
          `restore ${type} ${original}`
        );
        applyReturnedState(state);
      }
      setDirty(false);
      render();
    } finally {
      setBusy(false);
    }
  }

  function showOverlay() {
    const overlay = $(OVERLAY_ID);
    if (!overlay) throw new Error('dressing-room-overlay missing.');
    model.previousOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    window.initD322Drawer?.(true);
    portal()?.refreshLayout?.();
    setTimeout(() => portal()?.refreshLayout?.(), 60);
    setTimeout(() => portal()?.refreshLayout?.(), 220);
  }

  function hideOverlay() {
    const overlay = $(OVERLAY_ID);
    overlay?.classList.remove('show');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = model.previousOverflow || '';
    model.open = false;
    portal()?.refreshLayout?.();
    setTimeout(() => portal()?.refreshLayout?.(), 80);
  }

  async function open() {
    const sequence = ++model.openSequence;
    showOverlay();
    model.open = true;
    setBusy(true, '正在讀取 LayerLab 官方 Catalog…');

    try {
      await portal().ready();
      const truth = await portal().requestSourceTruth();
      if (sequence !== model.openSequence) return;

      model.catalog = clone(truth.catalog);
      model.state = clone(truth.state);
      model.originalSelections = stateSelections(truth.state);
      model.workingSelections = new Map(model.originalSelections);

      const officialTypes = (truth.catalog?.parts || [])
        .map(officialPartType)
        .filter(Boolean);

      if (!officialTypes.length) {
        throw new Error('LayerLab catalog.parts is empty.');
      }

      if (!officialTypes.includes(model.activeType)) {
        model.activeType = officialTypes[0];
      }

      setDirty(false);
      render();
      window.dispatchEvent(
        new CustomEvent('tappie:layerlab-official-catalog-ready', {
          detail: {
            catalog: clone(model.catalog),
            state: clone(model.state)
          }
        })
      );
    } catch (error) {
      console.error('[LayerLab Official Wardrobe open]', error);
      showError('無法讀取 LayerLab 官方 Catalog');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    ++model.openSequence;
    if (model.dirty) {
      try {
        await restoreOriginal();
      } catch (error) {
        console.error('[LayerLab Official Wardrobe restore]', error);
      }
    }
    hideOverlay();
  }

  async function commit() {
    if (model.busy) return;
    setBusy(true, '正在確認…');

    try {
      const state = await portal().getState();
      applyReturnedState(state);

      const detail = {
        contract: VERSION,
        provider: state?.provider || model.catalog?.provider || 'layerlab-casual',
        providerAssetVersion:
          state?.providerAssetVersion ||
          model.catalog?.providerAssetVersion ||
          null,
        catalog: clone(model.catalog),
        state: clone(state),
        selections: Object.fromEntries(model.workingSelections),
        committedAt: new Date().toISOString(),
        persistence: 'session-only-until-adapter'
      };

      if (window.TappieLayerLabWardrobeAdapter?.save) {
        await window.TappieLayerLabWardrobeAdapter.save(clone(detail));
        detail.persistence = 'adapter';
      }

      model.originalSelections = new Map(model.workingSelections);
      setDirty(false);

      window.__TAPPIE_LAYERLAB_WARDROBE_COMMIT__ = clone(detail);
      window.dispatchEvent(
        new CustomEvent('tappie:layerlab-wardrobe-commit', {
          detail: clone(detail)
        })
      );

      showResult(
        detail.persistence === 'adapter'
          ? '已儲存目前造型'
          : '已套用目前造型'
      );

      setTimeout(hideOverlay, 420);
    } catch (error) {
      console.error('[LayerLab Official Wardrobe commit]', error);
      showResult('確認失敗');
    } finally {
      setBusy(false);
    }
  }

  // Replace the old drawer implementation because its pointer-up callback
  // rerendered the removed Chibiz catalog.
  let drawerBound = false;
  let pointerId = null;
  let startY = 0;
  let startHeight = 0;

  function drawerMetrics() {
    const shell = document.querySelector(
      '#dressing-room-overlay .dressing-room-shell'
    );
    const catalog = document.querySelector(
      '#dressing-room-overlay .d32-catalog'
    );
    if (!shell || !catalog) return null;

    const shellHeight = shell.getBoundingClientRect().height;
    const available = Math.max(260, shellHeight - 58);

    return {
      shell,
      catalog,
      available,
      min: 32,
      max: Math.max(80, available - 8)
    };
  }

  function setDrawerHeight(value) {
    const metrics = drawerMetrics();
    if (!metrics) return;

    const height = Math.max(
      metrics.min,
      Math.min(metrics.max, value)
    );

    metrics.shell.style.setProperty(
      '--d323-drawer-height',
      `${height}px`
    );
    metrics.shell.style.setProperty(
      '--d322-drawer-height',
      `${height}px`
    );

    window.__TAPPIE_D322_DRAWER_RATIO__ =
      Math.max(0, Math.min(1, height / metrics.available));

    requestAnimationFrame(() => portal()?.refreshLayout?.());
  }

  function initDrawer(reset = false) {
    const handle = $(HANDLE_ID);
    const metrics = drawerMetrics();
    if (!handle || !metrics) return;

    if (
      reset ||
      !metrics.shell.style.getPropertyValue(
        '--d323-drawer-height'
      )
    ) {
      setDrawerHeight(metrics.available * 0.34);
    }

    if (drawerBound) return;
    drawerBound = true;

    handle.addEventListener('pointerdown', event => {
      const current = drawerMetrics();
      if (!current) return;
      pointerId = event.pointerId;
      startY = event.clientY;
      startHeight = current.catalog.getBoundingClientRect().height;
      handle.classList.add('dragging');
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener('pointermove', event => {
      if (pointerId !== event.pointerId) return;
      setDrawerHeight(
        startHeight - (event.clientY - startY)
      );
      event.preventDefault();
    });

    const end = event => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      handle.classList.remove('dragging');
      try {
        handle.releasePointerCapture?.(event.pointerId);
      } catch (_) {}
      portal()?.refreshLayout?.();
    };

    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);

    handle.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        return;
      }
      const current = drawerMetrics();
      if (!current) return;
      event.preventDefault();
      const height = current.catalog.getBoundingClientRect().height;
      if (event.key === 'ArrowUp') setDrawerHeight(height + 56);
      if (event.key === 'ArrowDown') setDrawerHeight(height - 56);
      if (event.key === 'Home') setDrawerHeight(current.min);
      if (event.key === 'End') setDrawerHeight(current.max);
    });
  }

  function installIdleState() {
    const tabs = $(TABS_ID);
    const toolbar = $(TOOLBAR_ID);
    const grid = $(GRID_ID);
    if (tabs) tabs.innerHTML = '';
    if (toolbar) {
      toolbar.className = 'd32-subtabs';
      toolbar.innerHTML = '';
    }
    if (grid) {
      grid.className = 'd32-grid d32-official-message-grid';
      grid.innerHTML =
        '<div class="d32-official-message">開啟更衣室後載入 LayerLab 官方 Catalog</div>';
    }
  }

  const api = {
    version: VERSION,
    open,
    cancel,
    commit,
    randomize,
    selectPart,
    getCatalog: () => clone(model.catalog),
    getState: () => clone(model.state),
    snapshot() {
      return {
        version: VERSION,
        open: model.open,
        busy: model.busy,
        dirty: model.dirty,
        activeType: model.activeType,
        officialTypes: (model.catalog?.parts || [])
          .map(officialPartType)
          .filter(Boolean),
        selections: Object.fromEntries(model.workingSelections),
        lastMutation: clone(model.lastMutation),
        lastError: clone(model.lastError)
      };
    }
  };

  window.TappieLayerLabOfficialWardrobe = api;
  window.initD322Drawer = initDrawer;

  installIdleState();

  window.addEventListener(
    'tappie:avatar-runtime-ready',
    () => {
      if (model.open && !model.catalog && !model.busy) {
        open();
      }
    }
  );

  console.info(
    '[Tappie LayerLab M2.5B4R3A-PRODUCTION] official Catalog-driven wardrobe installed'
  );
})();
