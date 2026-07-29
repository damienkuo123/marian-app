(() => {
  'use strict';

  const VERSION = 'M2.5B4R3A4A1-PRODUCTION-R2';
  const RUNTIME_URL =
    'https://assets.tappieapp.com/avatars/layerlab/casual/2026.07.29-m2.5b4r2/index.html';
  const RUNTIME_ORIGIN = 'https://assets.tappieapp.com';

  const PORTAL_ID = 'layerlab-runtime-portal';
  const MOTION_ID = 'layerlab-runtime-motion-b3';
  const FRAME_ID = 'layerlab-runtime-frame-b3';
  const CHALLENGE_TARGET = 'challenge-golden-viewer';
  const WARDROBE_TARGET = 'd32-viewer';

  if (window.TappieLayerLabPortal?.version === VERSION) return;

  let resolveReady;
  let rejectReady;
  let readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const state = {
    version: VERSION,
    runtimeErrorCount: 0,
    iframeCreateCount: 0,
    iframeLoadCount: 0,
    runtimeReadyCount: 0,
    responseCount: 0,
    commandSeq: 0,
    target: null,
    visible: false,
    lastRect: null,
    lastRuntimeEvent: null,
    pending: new Map(),
    layoutRaf: 0,
    ready: false,
    legacyMountCallsSuppressed: 0
  };

  function progress(text, ready = false) {
    const el = document.getElementById('challenge-runtime-progress');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('ready', !!ready);
  }

  function debugEnabled() {
    try {
      return new URLSearchParams(location.search).get('layerlabPortalDebug') === '1';
    } catch (_) {
      return false;
    }
  }

  function ensurePortal() {
    let portal = document.getElementById(PORTAL_ID);
    if (portal) return portal;

    portal = document.createElement('div');
    portal.id = PORTAL_ID;
    portal.setAttribute('aria-label', 'LayerLab permanent runtime portal');

    const motion = document.createElement('div');
    motion.id = MOTION_ID;
    motion.setAttribute('aria-hidden', 'false');

    const frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    frame.title = 'Tappie LayerLab avatar runtime';
    frame.src = RUNTIME_URL;
    frame.loading = 'eager';
    frame.setAttribute('allow', 'fullscreen; autoplay');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('scrolling', 'no');
    frame.style.background = 'transparent';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';

    frame.addEventListener('load', () => {
      state.iframeLoadCount += 1;
      progress('角色引擎已連線，等待 READY…', false);
      renderDiagnostic();
    });

    motion.appendChild(frame);
    portal.appendChild(motion);
    document.body.appendChild(portal);
    state.iframeCreateCount += 1;
    progress('LayerLab 角色載入中…', false);
    return portal;
  }

  function motionLayer() {
    return document.getElementById(MOTION_ID);
  }

  function frame() {
    return document.getElementById(FRAME_ID);
  }

  function isWardrobeOpen() {
    const overlay = document.getElementById('dressing-room-overlay');
    return !!overlay?.classList.contains('show') &&
      overlay.getAttribute('aria-hidden') !== 'true';
  }

  function isChallengeActive() {
    return document.body.classList.contains('challenge-route-active') ||
      document.getElementById('tab-challenge')?.classList.contains('active');
  }

  function targetInfo() {
    if (isWardrobeOpen()) {
      const el = document.getElementById(WARDROBE_TARGET);
      if (el) return { id: WARDROBE_TARGET, el, wardrobe: true };
    }

    if (isChallengeActive()) {
      const el = document.getElementById(CHALLENGE_TARGET);
      if (el) return { id: CHALLENGE_TARGET, el, wardrobe: false };
    }

    return null;
  }

  function rectForTarget(target) {
    const r = target.el.getBoundingClientRect();

    // M2.5B4R3A4A: the wardrobe preview is a fixed viewport. It never
    // participates in Selector scrolling, so the permanent Runtime can use
    // the target rectangle directly without scroll projection or clipping.
    return {
      left: r.left,
      top: r.top,
      width: Math.max(0, r.width),
      height: Math.max(0, r.height),
      renderHeight: Math.max(0, r.height)
    };
  }

  function sameRect(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.left - b.left) < 0.5 &&
      Math.abs(a.top - b.top) < 0.5 &&
      Math.abs(a.width - b.width) < 0.5 &&
      Math.abs(a.height - b.height) < 0.5 &&
      Math.abs((a.renderHeight || a.height) -
        (b.renderHeight || b.height)) < 0.5;
  }

  function placePortal() {
    state.layoutRaf = 0;
    const portal = ensurePortal();
    const target = targetInfo();

    portal.classList.toggle('is-wardrobe-target', !!target?.wardrobe);

    if (!target) {
      portal.classList.remove('is-visible');
      portal.dataset.target = '';
      state.target = null;
      state.visible = false;
      renderDiagnostic();
      return;
    }

    const rect = rectForTarget(target);

    if (rect.width < 2 || rect.height < 2) {
      portal.classList.remove('is-visible');
      state.visible = false;
      state.target = target.id;
      renderDiagnostic();
      return;
    }

    if (!sameRect(state.lastRect, rect) || state.target !== target.id) {
      portal.style.left = `${rect.left}px`;
      portal.style.top = `${rect.top}px`;
      portal.style.width = `${rect.width}px`;
      portal.style.height = `${rect.height}px`;

      const runtimeMotion = motionLayer();
      if (runtimeMotion) {
        runtimeMotion.style.width = `${rect.width}px`;
        runtimeMotion.style.height =
          `${rect.renderHeight || rect.height}px`;
        runtimeMotion.style.transform = 'translate3d(0,0,0)';
      }

      const runtimeFrame = frame();
      if (runtimeFrame) {
        runtimeFrame.style.width = `${rect.width}px`;
        runtimeFrame.style.height = `${rect.renderHeight || rect.height}px`;
        runtimeFrame.style.top = '0px';
      }

      portal.dataset.target = target.id;
      portal.dataset.visibleHeight = String(rect.height);
      portal.dataset.renderHeight =
        String(rect.renderHeight || rect.height);
      portal.dataset.fixedPreview = target.wardrobe ? 'true' : 'false';

      state.lastRect = rect;
      state.target = target.id;
    }

    portal.classList.add('is-visible');
    state.visible = true;
    renderDiagnostic();
  }

  function schedulePlace() {
    if (state.layoutRaf) return;
    state.layoutRaf = requestAnimationFrame(placePortal);
  }

  function rawCommand(command, args = {}) {
    const runtimeFrame = frame();
    if (!runtimeFrame?.contentWindow) {
      return Promise.reject(new Error('R2 permanent runtime iframe missing.'));
    }

    const id = `r2-${Date.now()}-${++state.commandSeq}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        reject(new Error(`R2 command timeout: ${command}`));
      }, 8000);

      state.pending.set(id, { resolve, reject, timer, command });

      runtimeFrame.contentWindow.postMessage({
        source: 'tappie-layerlab-parent-command',
        id,
        command,
        args
      }, RUNTIME_ORIGIN);
    });
  }

  async function command(commandName, args = {}, options = {}) {
    if (!options.skipReady) await waitReady();
    return rawCommand(commandName, args);
  }

  async function waitReady() {
    ensurePortal();
    if (state.ready) return snapshot();
    return readyPromise;
  }

  function onRuntimeMessage(event) {
    const runtimeFrame = frame();
    if (!runtimeFrame || event.source !== runtimeFrame.contentWindow) return;
    if (event.origin !== RUNTIME_ORIGIN) return;

    const msg = event.data;
    if (!msg || msg.source !== 'tappie-layerlab-browser-contract') return;

    state.lastRuntimeEvent = {
      kind: msg.kind || null,
      event: msg.event || null,
      command: msg.command || null,
      at: Date.now()
    };

    if (msg.kind === 'event' && msg.event === 'ready') {
      state.runtimeReadyCount += 1;
      state.ready = true;
      progress('角色準備完成', true);
      resolveReady?.(snapshot());
      window.dispatchEvent(
        new CustomEvent('tappie:avatar-runtime-ready', { detail: snapshot() })
      );
    }

    if (msg.kind === 'event' && msg.event === 'error') {
      state.runtimeErrorCount += 1;
      progress('角色引擎載入失敗，請重新整理', false);
      rejectReady?.(new Error(msg?.payload?.message || 'LayerLab R2 runtime error.'));
      window.dispatchEvent(
        new CustomEvent('tappie:avatar-runtime-error', {
          detail: { portal: snapshot(), runtime: msg.payload || null }
        })
      );
    }

    if (msg.kind === 'response') {
      state.responseCount += 1;
      const pending = state.pending.get(msg.id);
      if (pending) {
        state.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.ok) pending.resolve(msg.result);
        else pending.reject(
          new Error(msg.error || `R2 ${pending.command} failed`)
        );
      }
    }

    renderDiagnostic();
  }

  function installLifecycleShim() {
    window.TappieD1R1 = {
      onTabChange(tabId) {
        const active = tabId === 'challenge';
        document.body.classList.toggle('challenge-route-active', active);
        schedulePlace();
      },
      rerunDiagnostic() {
        return selfTest();
      },
      getState() {
        return snapshot();
      }
    };
  }

  function suppressLegacyChibizMounts() {
    const legacy = window.TappieChibizRuntime;
    if (!legacy || legacy.__TAPPIE_M25B3_SUPPRESSED__) return;

    const originalMount =
      typeof legacy.mountTo === 'function' ? legacy.mountTo.bind(legacy) : null;

    legacy.mountTo = function(hostId) {
      if (hostId === CHALLENGE_TARGET || hostId === WARDROBE_TARGET) {
        state.legacyMountCallsSuppressed += 1;
        schedulePlace();
        renderDiagnostic();
        return true;
      }
      return originalMount ? originalMount(hostId) : false;
    };

    legacy.__TAPPIE_M25B3_SUPPRESSED__ = true;
  }

  function openWardrobeShell() {
    const overlay = document.getElementById('dressing-room-overlay');
    if (!overlay) return;

    document.body.dataset.m25b3PrevOverflow =
      document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';

    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');

    try { window.initD322Drawer?.(true); } catch (_) {}

    schedulePlace();
    setTimeout(schedulePlace, 50);
    setTimeout(schedulePlace, 220);
  }

  function closeWardrobeShell() {
    const overlay = document.getElementById('dressing-room-overlay');
    if (!overlay) return;

    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');

    document.body.style.overflow =
      document.body.dataset.m25b3PrevOverflow || '';

    schedulePlace();
    setTimeout(schedulePlace, 80);
  }

  function installWardrobeLifecycleShim() {
    // M2.5B4R3A: delegate at call time so the Portal remains responsible for
    // the single iframe lifecycle while the wardrobe UI is driven only by
    // LayerLab's authoritative catalog.parts.
    const callController = (method, fallback) => (...args) => {
      const controller = window.TappieLayerLabOfficialWardrobe;
      if (controller && typeof controller[method] === 'function') {
        return controller[method](...args);
      }
      return fallback(...args);
    };

    window.openChallengeDressingRoomV301 =
      callController('open', openWardrobeShell);
    window.openChallengeDressingRoom =
      callController('open', openWardrobeShell);
    window.cancelD32DressingRoom =
      callController('cancel', closeWardrobeShell);
    window.saveD32DressingRoom =
      callController('commit', closeWardrobeShell);
    window.closeChallengeDressingRoom =
      window.cancelD32DressingRoom;
  }

  function compatibilityApi() {
    const api = {
      version: VERSION,
      runtimeUrl: RUNTIME_URL,
      enter() {
        document.body.classList.add('challenge-route-active');
        schedulePlace();
      },
      leave() {
        document.body.classList.remove('challenge-route-active');
        schedulePlace();
      },
      ready: waitReady,
      call: (name, payload) => command(name, payload || {}),
      getCatalog: () => command('getCatalog'),
      getState: () => command('getState', { refresh: true }),
      getMirrorState: () => command('getState', { refresh: true }),
      getCapabilities: () => command('getContractInfo'),
      requestSourceTruth: () => command('requestSourceTruth'),
      randomize: () => command('randomize'),
      setPart: (type, displayIndex) =>
        command('setPart', { type, displayIndex }),
      playAnimation: name => command('playAnimation', { name }),
      resetRotation: () => command('resetRotation'),
      applyState: async config => {
        const parts = config?.parts || config?.selections || {};
        const entries = Array.isArray(parts)
          ? parts.map(x => [x?.type, x?.displayIndex])
          : Object.entries(parts);
        for (const [type, displayIndex] of entries) {
          if (type == null || displayIndex == null) continue;
          await command('setPart', { type, displayIndex });
        }
        if (config?.animation) {
          await command('playAnimation', { name: config.animation });
        }
        if (config?.resetRotation === true) {
          await command('resetRotation');
        }
        return command('getState', { refresh: true });
      },
      reload() {
        throw new Error(
          'M2.5B4R2 invariant forbids runtime reload during UI lifecycle.'
        );
      },
      destroy() {
        throw new Error(
          'M2.5B4R2 invariant forbids runtime destroy during UI lifecycle.'
        );
      },
      selfTest,
      snapshot
    };

    window.TappieLayerLabRuntimeHost = api;
    window.TappieAvatarHost = api;
    return api;
  }

  function diagnosticHost() {
    if (!debugEnabled()) return null;

    let el = document.getElementById('layerlab-b3-diagnostic');
    if (!el) {
      el = document.createElement('div');
      el.id = 'layerlab-b3-diagnostic';
      document.body.appendChild(el);
    }
    return el;
  }

  function renderDiagnostic() {
    const el = diagnosticHost();
    if (!el) return;

    const healthy =
      state.iframeCreateCount === 1 &&
      state.iframeLoadCount <= 1 &&
      state.runtimeReadyCount <= 1 &&
      state.runtimeErrorCount === 0;

    el.innerHTML = `
      <strong>M2.5B4R2 ${healthy ? 'PORTAL OK' : 'CHECK'}</strong>
      <span>target: ${state.target || 'hidden'}</span>
      <span>iframe create: ${state.iframeCreateCount}</span>
      <span>iframe load: ${state.iframeLoadCount}</span>
      <span>runtime READY: ${state.runtimeReadyCount}</span>
      <span>runtime errors: ${state.runtimeErrorCount}</span>
      <span>responses: ${state.responseCount}</span>
      <span>legacy mount suppressed: ${state.legacyMountCallsSuppressed}</span>
    `;
    el.classList.toggle('is-warning', !healthy);
  }

  function bindGeometry() {
    const resizeObserver = new ResizeObserver(schedulePlace);

    [CHALLENGE_TARGET, WARDROBE_TARGET].forEach(id => {
      const el = document.getElementById(id);
      if (el) resizeObserver.observe(el);
    });

    const catalog = document.querySelector('#dressing-room-overlay .d32-catalog');
    if (catalog) resizeObserver.observe(catalog);

    const mutationObserver = new MutationObserver(schedulePlace);
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true
    });

    window.addEventListener('resize', schedulePlace, { passive: true });
    window.addEventListener('orientationchange', schedulePlace, { passive: true });
    document.getElementById('content-viewport')?.addEventListener(
      'scroll',
      schedulePlace,
      { passive: true }
    );

  }

  async function selfTest() {
    await waitReady();
    const contractInfo = await command('getContractInfo');
    const runtimeState = await command('getState', { refresh: true });

    return {
      ok: true,
      portal: snapshot(),
      contractInfo,
      state: runtimeState
    };
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({
      version: state.version,
      iframeCreateCount: state.iframeCreateCount,
      iframeLoadCount: state.iframeLoadCount,
      runtimeReadyCount: state.runtimeReadyCount,
      runtimeErrorCount: state.runtimeErrorCount,
      responseCount: state.responseCount,
      legacyMountCallsSuppressed: state.legacyMountCallsSuppressed,
      target: state.target,
      visible: state.visible,
      frameParent: frame()?.parentElement?.id || null,
      frameSrc: frame()?.src || null,
      ready: state.ready
    }));
  }

  function install() {
    ensurePortal();
    installLifecycleShim();
    suppressLegacyChibizMounts();
    installWardrobeLifecycleShim();
    compatibilityApi();
    bindGeometry();

    const challengeTab = document.getElementById('tab-challenge');
    const challengeInitiallyActive = challengeTab
      ? challengeTab.classList.contains('active')
      : document.body.classList.contains('challenge-route-active');

    // Standalone smoke pages do not have #tab-challenge. Preserve an explicitly
    // supplied challenge-route-active marker instead of clearing it.
    document.body.classList.toggle(
      'challenge-route-active',
      !!challengeInitiallyActive
    );

    schedulePlace();
    setTimeout(schedulePlace, 100);
    setTimeout(schedulePlace, 500);
    renderDiagnostic();

    // Reclaim shims after older DOMContentLoaded/load hooks have fired.
    document.addEventListener('DOMContentLoaded', () => {
      installLifecycleShim();
      suppressLegacyChibizMounts();
      installWardrobeLifecycleShim();
      compatibilityApi();
      schedulePlace();
    }, { once: true });

    window.addEventListener('load', () => {
      installLifecycleShim();
      suppressLegacyChibizMounts();
      installWardrobeLifecycleShim();
      compatibilityApi();
      schedulePlace();
    }, { once: true });
  }

  window.addEventListener('message', onRuntimeMessage);

  window.TappieLayerLabPortal = {
    version: VERSION,
    runtimeUrl: RUNTIME_URL,
    ready: waitReady,
    command,
    getCatalog: () => command('getCatalog'),
    getState: () => command('getState', { refresh: true }),
    requestSourceTruth: () => command('requestSourceTruth'),
    randomize: () => command('randomize'),
    setPart: (type, displayIndex) =>
      command('setPart', { type, displayIndex }),
    playAnimation: name => command('playAnimation', { name }),
    resetRotation: () => command('resetRotation'),
    selfTest,
    snapshot,
    refreshLayout: schedulePlace,
    openWardrobe: openWardrobeShell,
    closeWardrobe: closeWardrobeShell
  };

  // Script is injected at the end of BODY, so the target DOM already exists.
  // Install immediately so older DOMContentLoaded handlers resolve to the B3
  // lifecycle shim rather than starting Chibiz or the old M2.4A2 iframe.
  install();

  console.info(
    '[Tappie LayerLab M2.5B4R3A4A1 Production] permanent portal installed',
    RUNTIME_URL
  );
})();
