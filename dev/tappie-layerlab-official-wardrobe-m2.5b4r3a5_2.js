(() => {
  'use strict';

  const VERSION = 'M2.5B4R3A5.2-NO-RANDOM-THUMB-RELOAD';
  const OVERLAY_ID = 'dressing-room-overlay';
  const TABS_ID = 'd32-tabs';
  const TOOLBAR_ID = 'd32-subtabs';
  const GRID_ID = 'd32-grid';
  const LOADING_ID = 'd32-loading';
  const SAVE_ID = 'd32-save';
  const RESULT_ID = 'd32-save-result';
  const THUMBNAIL_CATALOG_URL =
    'https://assets.tappieapp.com/avatars/layerlab/casual/catalog/2026.08.01-r1/catalog.json';
  const THUMBNAIL_ASSET_ORIGIN = 'https://assets.tappieapp.com';

  if (window.TappieLayerLabOfficialWardrobe?.version === VERSION) return;


  const OFFICIAL_ANIMATION_CATALOG = Object.freeze([
    Object.freeze({
      category: 'Action',
      animations: Object.freeze([
        'Action_Jump',
        'Action_Punch',
        'Action_Run',
        'Action_Walk'
      ])
    }),
    Object.freeze({
      category: 'Dance',
      animations: Object.freeze([
        'Dance_1',
        'Dance_2',
        'Dance_3',
        'Dance_4'
      ])
    }),
    Object.freeze({
      category: 'Emoji',
      animations: Object.freeze([
        'Emoji_Aghast',
        'Emoji_Angry',
        'Emoji_Applaud',
        'Emoji_Be_Bashful',
        'Emoji_Cheer',
        'Emoji_Cry',
        'Emoji_Gas',
        'Emoji_Hi',
        'Emoji_Nice',
        'Emoji_Pester',
        'Emoji_Putter_Around',
        'Emoji_Showmanship',
        'Emoji_SideToSide',
        'Emoji_Sigh',
        'Emoji_Smile1',
        'Emoji_Smile2'
      ])
    }),
    Object.freeze({
      category: 'Interaction',
      animations: Object.freeze([
        'Interaction_Item_Put',
        'Interaction_Pickup',
        'Interaction_Shovel',
        'Interaction_Sickle'
      ])
    }),
    Object.freeze({
      category: 'Reaction',
      animations: Object.freeze([
        'Reaction_Agonize',
        'Reaction_Knockout',
        'Reaction_Struck'
      ])
    }),
    Object.freeze({
      category: 'Stand',
      animations: Object.freeze([
        'Stand_Idle1',
        'Stand_Idle2',
        'Stand_idle3',
        'Stand_Idle4',
        'Stand_Idle5',
        'Stand_Idle6'
      ])
    })
  ]);

  const ANIMATION_TAB_PREFIX = 'animation:';
  const PREVIEW_IDLE_ANIMATION = 'Stand_Idle1';

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
    lastError: null,
    activeAnimation: null,
    lastAnimation: null,
    thumbnailCatalog: null,
    thumbnailCatalogSource: 'none',
    thumbnailCatalogError: null,
    thumbnailRefreshPromise: null
  };

  const $ = id => document.getElementById(id);
  const portal = () => window.TappieLayerLabPortal;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return value == null ? '' : String(value).trim();
  }


  function normalizeThumbnailCatalog(raw, source = 'embedded') {
    const entries = Array.isArray(raw?.entries) ? raw.entries : [];
    const byInternalKey = new Map();

    for (const original of entries) {
      if (!original) continue;
      const entry = { ...original };
      const key = text(entry.internalKey);
      if (!key) continue;
      const thumbnailUrl = text(entry.thumbnailUrl);
      entry.thumbnailUrl = thumbnailUrl
        ? new URL(thumbnailUrl, THUMBNAIL_ASSET_ORIGIN).href
        : '';
      byInternalKey.set(key, entry);
    }

    return {
      source,
      schema: text(raw?.schema),
      version: text(raw?.catalogVersion || raw?.version),
      generatedAt: text(raw?.generatedAt),
      provider: text(raw?.provider),
      entries: [...byInternalKey.values()],
      byInternalKey
    };
  }

  function installEmbeddedThumbnailCatalog() {
    const embedded = window.TappieLayerLabThumbnailCatalog;
    if (!embedded?.entries?.length) return false;
    model.thumbnailCatalog = normalizeThumbnailCatalog(
      embedded,
      'embedded-js'
    );
    model.thumbnailCatalogSource = 'embedded-js';
    model.thumbnailCatalogError = null;
    return true;
  }

  function thumbnailEntry(internalKey) {
    return model.thumbnailCatalog?.byInternalKey?.get(
      text(internalKey)
    ) || null;
  }

  function partThumbnailEntry(type, index) {
    return thumbnailEntry(`${text(type)}:${index}`);
  }

  function animationThumbnailEntry(animationName) {
    return thumbnailEntry(`animation:${text(animationName)}`);
  }

  async function refreshRemoteThumbnailCatalog() {
    if (model.thumbnailRefreshPromise) {
      return model.thumbnailRefreshPromise;
    }

    model.thumbnailRefreshPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch(THUMBNAIL_CATALOG_URL, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-cache',
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`Thumbnail catalog HTTP ${response.status}`);
        }
        const payload = await response.json();
        const normalized = normalizeThumbnailCatalog(payload, 'remote-r2');
        if (!normalized.entries.length) {
          throw new Error('Thumbnail catalog entries is empty.');
        }

        // The checked-in JS remains the editable naming layer. Remote R2 may
        // refresh URLs/versions, but it must not overwrite local name fixes.
        const localByInternalKey = model.thumbnailCatalog?.byInternalKey;
        if (localByInternalKey) {
          for (const entry of normalized.entries) {
            const local = localByInternalKey.get(entry.internalKey);
            if (!local) continue;
            entry.displayNameZh = text(local.displayNameZh) ||
              text(entry.displayNameZh);
            entry.displayNameEn = text(local.displayNameEn) ||
              text(entry.displayNameEn);
          }
        }

        model.thumbnailCatalog = normalized;
        model.thumbnailCatalogSource = 'remote-r2+local-labels';
        model.thumbnailCatalogError = null;
        if (model.open) render();
        return normalized;
      } catch (error) {
        model.thumbnailCatalogError = error?.message || String(error);
        console.warn(
          '[LayerLab Thumbnail Catalog] remote refresh failed; embedded fallback remains active.',
          error
        );
        return model.thumbnailCatalog;
      } finally {
        clearTimeout(timeout);
        model.thumbnailRefreshPromise = null;
      }
    })();

    return model.thumbnailRefreshPromise;
  }

  function itemCatalogLabel(entry) {
    return text(entry?.displayNameZh) ||
      text(entry?.displayNameEn) ||
      text(entry?.internalName);
  }

  function entryThumbnailUrl(entry) {
    const url = text(entry?.thumbnailUrl);
    if (!url) return '';
    const version = text(entry?.thumbnailVersion);
    if (!version) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(version)}`;
  }

  function createProhibitedPlaceholder(visual, reason = 'empty') {
    visual.innerHTML = '';
    visual.classList.add(
      'no-thumb',
      'd32-layerlab-placeholder',
      reason === 'empty' ? 'is-empty-placeholder' : 'is-missing-placeholder'
    );
    visual.dataset.placeholderReason = reason;

    const icon = document.createElement('span');
    icon.className = 'd32-layerlab-prohibit-icon';
    icon.setAttribute('aria-hidden', 'true');
    visual.appendChild(icon);
  }

  function appendThumbnailOrPlaceholder(visual, url, options = {}) {
    const empty = !!options.empty;
    if (empty || !text(url)) {
      createProhibitedPlaceholder(
        visual,
        empty ? 'empty' : 'missing'
      );
      return;
    }

    const image = document.createElement('img');
    image.className = 'd32-layerlab-official-thumb';
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.src = url;
    image.addEventListener('error', () => {
      image.remove();
      createProhibitedPlaceholder(visual, 'missing');
    }, { once: true });
    visual.classList.add('has-thumb');
    visual.appendChild(image);
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
    const type = officialPartType(part);
    const authored = partThumbnailEntry(type, index);
    const catalogLabel = itemCatalogLabel(authored);
    if (catalogLabel) return catalogLabel;

    const supplied = text(item?.displayName) ||
      text(item?.label) ||
      text(item?.name) ||
      text(item?.title);
    if (supplied) return supplied;
    if (index === 0 && part?.useEmpty) return '不裝備';
    return String(index).padStart(2, '0');
  }





  function animationTabKey(category) {
    return `${ANIMATION_TAB_PREFIX}${category}`;
  }

  function animationCategoryFromActiveType() {
    const active = text(model.activeType);
    if (!active.startsWith(ANIMATION_TAB_PREFIX)) return null;
    const name = active.slice(ANIMATION_TAB_PREFIX.length);
    return OFFICIAL_ANIMATION_CATALOG.find(
      entry => entry.category === name
    ) || null;
  }

  function animationDisplayLabel(name) {
    const authored = animationThumbnailEntry(name);
    const catalogLabel = itemCatalogLabel(authored);
    if (catalogLabel) return catalogLabel;

    const raw = text(name);
    const prefix = raw.includes('_') ? raw.split('_')[0] : '';
    let label = prefix ? raw.slice(prefix.length + 1) : raw;
    label = label
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(\D)(\d+)$/g, '$1 $2');
    return label.trim() || raw;
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

    // Keep the mutation lock but never draw a floating black Busy pill over
    // the avatar. The message remains in data attributes for diagnostics and
    // assistive technology.
    const overlay = $(OVERLAY_ID);
    if (overlay) {
      overlay.setAttribute('aria-busy', String(model.busy));
      overlay.dataset.busyMessage = model.busy ? message : '';
    }

    const save = $(SAVE_ID);
    if (save) save.disabled = model.busy;

    const random = document.getElementById('d32-layerlab-random');
    if (random) random.disabled = model.busy;

    const tabs = $(TABS_ID);
    tabs?.querySelectorAll('button').forEach(button => {
      button.disabled = model.busy;
    });

    const grid = $(GRID_ID);
    grid?.querySelectorAll('button').forEach(button => {
      button.disabled = model.busy;
    });

    // Compatibility cleanup if cached HTML still contains the old node.
    const loading = $(LOADING_ID);
    if (loading) {
      loading.textContent = '';
      loading.classList.remove('show');
      loading.hidden = true;
    }
  }

  function setDirty(value) {
    model.dirty = !!value;
    $(SAVE_ID)?.classList.toggle('is-dirty', model.dirty);
  }

  function showResult(message) {
    // Success/fallback state remains available for diagnostics but is no
    // longer shown as a floating pill over the avatar preview.
    const result = $(RESULT_ID);
    if (!result) return;
    result.textContent = message || '';
    result.classList.remove('show');
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

    OFFICIAL_ANIMATION_CATALOG.forEach((entry, index) => {
      const key = animationTabKey(entry.category);
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'd32-tab d32-animation-tab' +
        (index === 0 ? ' is-first-animation' : '') +
        (model.activeType === key ? ' active' : '');
      button.dataset.layerlabAnimationCategory = entry.category;
      button.textContent = entry.category;
      button.title = `Animation · ${entry.category}`;
      button.addEventListener('click', () => {
        model.activeType = key;
        render();
        $(GRID_ID)?.scrollTo(0, 0);
      });
      host.appendChild(button);
    });
  }

  let topbarRandomBound = false;

  function bindTopbarRandom() {
    const random = document.getElementById('d32-layerlab-random');
    if (!random || topbarRandomBound) return;
    topbarRandomBound = true;
    random.addEventListener('click', randomize);
  }

  function renderToolbar() {
    // The secondary catalog toolbar is intentionally removed. Random now
    // lives in the top bar, leaving more vertical space for selector items.
    const host = $(TOOLBAR_ID);
    if (host) {
      host.className = 'd32-subtabs';
      host.innerHTML = '';
    }
    bindTopbarRandom();
  }


  function renderAnimationGrid(categoryEntry) {
    const grid = $(GRID_ID);
    if (!grid) return;

    grid.className =
      'd32-grid d32-layerlab-official-grid d32-animation-grid';
    grid.innerHTML = '';

    for (const animationName of categoryEntry.animations) {
      const authored = animationThumbnailEntry(animationName);
      const labelText = animationDisplayLabel(animationName);
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'd32-item d32-layerlab-option d32-animation-option' +
        (model.activeAnimation === animationName ? ' selected' : '');
      button.dataset.animationName = animationName;
      button.dataset.animationCategory = categoryEntry.category;
      button.setAttribute(
        'aria-pressed',
        String(model.activeAnimation === animationName)
      );
      button.title = labelText;
      button.setAttribute(
        'aria-label',
        `${categoryEntry.category} ${labelText}`
      );

      const visual = document.createElement('span');
      visual.className =
        'd32-layerlab-option-visual d32-animation-visual';
      appendThumbnailOrPlaceholder(
        visual,
        entryThumbnailUrl(authored),
        { empty: false }
      );

      const label = document.createElement('span');
      label.className = 'd32-label';
      label.textContent = labelText;

      button.append(visual, label);
      button.addEventListener(
        'click',
        () => previewAnimation(
          categoryEntry.category,
          animationName
        )
      );
      grid.appendChild(button);
    }
  }

  function renderGrid() {
    const grid = $(GRID_ID);
    if (!grid) return;

    const animationCategory = animationCategoryFromActiveType();
    if (animationCategory) {
      renderAnimationGrid(animationCategory);
      return;
    }

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
      button.setAttribute('aria-pressed', String(selected === index));
      button.title = `${type} · ${index}`;
      button.setAttribute(
        'aria-label',
        `${officialPartLabel(part)} ${officialItemLabel(item, index, part)}`
      );

      const authored = partThumbnailEntry(type, index);
      const thumbUrl = entryThumbnailUrl(authored) || itemThumbnail(item);
      const isEmpty = index === 0 && !!part.useEmpty;
      const visual = document.createElement('span');
      visual.className = 'd32-layerlab-option-visual';
      appendThumbnailOrPlaceholder(
        visual,
        thumbUrl,
        { empty: isEmpty }
      );

      const label = document.createElement('span');
      label.className = 'd32-label';
      label.textContent = officialItemLabel(item, index, part);

      button.append(visual, label);
      button.addEventListener('click', () => selectPart(type, index));
      grid.appendChild(button);
    }
  }

  function syncPartSelectionUi(type) {
    const grid = $(GRID_ID);
    if (!grid) return;
    const selected = selectedIndex(type);
    grid.querySelectorAll(
      `.d32-layerlab-option[data-layerlab-type="${CSS.escape(type)}"]`
    ).forEach(button => {
      const index = Number(button.dataset.displayIndex);
      const active = index === selected;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function syncAnimationSelectionUi() {
    const grid = $(GRID_ID);
    if (!grid) return;
    grid.querySelectorAll(
      '.d32-animation-option[data-animation-name]'
    ).forEach(button => {
      const active =
        button.dataset.animationName === model.activeAnimation;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function syncVisibleSelectionUi() {
    if (animationCategoryFromActiveType()) {
      syncAnimationSelectionUi();
      return;
    }

    const type = text(model.activeType);
    if (type) syncPartSelectionUi(type);
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


  async function previewAnimation(category, animationName) {
    if (model.busy) {
      showResult('上一個動作仍在啟動');
      return;
    }

    const knownCategory = OFFICIAL_ANIMATION_CATALOG.find(
      entry => entry.category === category
    );
    if (!knownCategory ||
        !knownCategory.animations.includes(animationName)) {
      const error = new Error(
        `Unknown official LayerLab animation: ${animationName}`
      );
      recordError(error, {
        command: 'playAnimation',
        category,
        animationName
      });
      return;
    }

    const mutationId = ++model.mutationSequence;
    recordMutation({
      id: mutationId,
      command: 'playAnimation',
      category,
      animationName,
      phase: 'start'
    });

    model.activeAnimation = animationName;
    model.lastAnimation = {
      category,
      animationName,
      startedAt: new Date().toISOString()
    };
    syncAnimationSelectionUi();
    setBusy(true, `正在播放 ${animationName}…`);

    try {
      await withTimeout(
        portal().playAnimation(animationName),
        2600,
        `animation ${animationName}`
      );

      recordMutation({
        id: mutationId,
        command: 'playAnimation',
        category,
        animationName,
        phase: 'accepted'
      });

      window.__TAPPIE_LAYERLAB_LAST_ANIMATION__ =
        clone(model.lastAnimation);

      window.dispatchEvent(
        new CustomEvent('tappie:layerlab-animation-preview', {
          detail: clone(model.lastAnimation)
        })
      );
    } catch (error) {
      const detail = recordError(error, {
        id: mutationId,
        command: 'playAnimation',
        category,
        animationName
      });
      console.error('[LayerLab Official Animation]', detail);
    } finally {
      if (mutationId === model.mutationSequence) {
        setBusy(false);
      }
      syncAnimationSelectionUi();
    }
  }

  async function returnToPreviewIdle() {
    if (!portal()?.playAnimation) return;
    try {
      await withTimeout(
        portal().playAnimation(PREVIEW_IDLE_ANIMATION),
        1800,
        'return to preview idle'
      );
      model.activeAnimation = PREVIEW_IDLE_ANIMATION;
    } catch (error) {
      console.warn(
        '[LayerLab Official Animation idle recovery]',
        error
      );
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
    syncPartSelectionUi(type);
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
      syncPartSelectionUi(type);
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

    syncPartSelectionUi(type);
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

      // Random can update every official part, but only the currently visible
      // category needs an immediate selected-state refresh. Reusing the
      // existing buttons preserves all loaded <img> nodes, so thumbnails do
      // not disappear and reload after Random.
      syncVisibleSelectionUi();

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

    const page = overlay.querySelector('.dressing-room-page');
    if (page) page.scrollTop = 0;

    const grid = overlay.querySelector('.d32-grid');
    if (grid) grid.scrollTop = 0;

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
    installEmbeddedThumbnailCatalog();
    refreshRemoteThumbnailCatalog();
    setBusy(true, '正在讀取 LayerLab 官方 Catalog…');

    try {
      await portal().ready();
      const truth = await portal().requestSourceTruth();
      if (sequence !== model.openSequence) return;

      model.catalog = clone(truth.catalog);
      model.state = clone(truth.state);
      model.originalSelections = stateSelections(truth.state);
      model.workingSelections = new Map(model.originalSelections);
      model.activeAnimation = null;
      model.lastAnimation = null;

      const officialTypes = (truth.catalog?.parts || [])
        .map(officialPartType)
        .filter(Boolean);

      if (!officialTypes.length) {
        throw new Error('LayerLab catalog.parts is empty.');
      }

      const activeAnimationCategory =
        animationCategoryFromActiveType();

      if (!officialTypes.includes(model.activeType) &&
          !activeAnimationCategory) {
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
    await returnToPreviewIdle();
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

      await returnToPreviewIdle();
      setTimeout(hideOverlay, 420);
    } catch (error) {
      console.error('[LayerLab Official Wardrobe commit]', error);
      showResult('確認失敗');
    } finally {
      setBusy(false);
    }
  }

  // M2.5B4R3A4A: fixed preview + scrollable Selector grid.
  // Keep the historical compatibility function because older inline
  // Dashboard code may still call initD322Drawer().
  function initFixedWardrobe(reset = false) {
    const grid = document.querySelector(
      '#dressing-room-overlay .d32-grid'
    );
    if (reset && grid) grid.scrollTop = 0;
    requestAnimationFrame(() => portal()?.refreshLayout?.());
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
    bindTopbarRandom();
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
    previewAnimation,
    getAnimationCatalog: () => clone(OFFICIAL_ANIMATION_CATALOG),
    getCatalog: () => clone(model.catalog),
    getState: () => clone(model.state),
    snapshot() {
      return {
        version: VERSION,
        open: model.open,
        busy: model.busy,
        dirty: model.dirty,
        activeType: model.activeType,
        activeAnimation: model.activeAnimation,
        lastAnimation: clone(model.lastAnimation),
        animationCategories: OFFICIAL_ANIMATION_CATALOG.map(
          entry => entry.category
        ),
        animationCount: OFFICIAL_ANIMATION_CATALOG.reduce(
          (total, entry) => total + entry.animations.length,
          0
        ),
        thumbnailCatalogSource: model.thumbnailCatalogSource,
        thumbnailCatalogVersion: model.thumbnailCatalog?.version || null,
        thumbnailEntryCount: model.thumbnailCatalog?.entries?.length || 0,
        thumbnailCatalogError: model.thumbnailCatalogError,
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
  window.initD322Drawer = initFixedWardrobe;

  installEmbeddedThumbnailCatalog();
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
    '[Tappie LayerLab M2.5B4R3A5] R2 thumbnail wardrobe installed'
  );
})();
