(() => {
  'use strict';

  const HOST_OBJECT = 'Tappie_Challenge_Production_Runtime';
  const DEFAULT_ARENA = 'low-poly-mega-city-01';
  const params = new URLSearchParams(location.search);
  const arenaId = (params.get('arena') || DEFAULT_ARENA).trim();
  const arenaDisabled = arenaId === 'off' || arenaId === 'none';
  const debugEnabled = params.get('arenaDebug') === '1';
  const manifestPath = `./unity/arenas/${encodeURIComponent(arenaId)}/arena-runtime-manifest.json`;

  const elements = {
    shell: document.getElementById('arenaShell'),
    canvas: document.getElementById('unityArenaCanvas'),
    loading: document.getElementById('unityArenaLoading'),
    loadingLabel: document.getElementById('unityArenaLoadingLabel'),
    progress: document.getElementById('unityArenaProgress'),
    error: document.getElementById('unityArenaError'),
    retry: document.getElementById('unityArenaRetry'),
    debug: document.getElementById('unityArenaDebug')
  };

  const state = {
    arenaId,
    phase: arenaDisabled ? 'disabled' : 'idle',
    progress: 0,
    manifest: null,
    unityInstance: null,
    runtimeReady: false,
    pendingRuntimeReady: false,
    lastRuntimeEvent: null,
    error: null
  };

  let loadPromise = null;
  let readyResolve;
  let readyReject;
  let readyPromise = createReadyPromise();

  function createReadyPromise() {
    const promise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    promise.catch(() => {});
    return promise;
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function updateDebug(message) {
    if (!elements.debug) return;
    elements.debug.hidden = !debugEnabled;
    elements.debug.value = `${state.phase} · ${Math.round(state.progress * 100)}% · ${message || ''}`;
    elements.debug.textContent = elements.debug.value;
  }

  function setPhase(phase, message) {
    state.phase = phase;
    if (elements.shell) {
      elements.shell.classList.toggle('unity-arena-loading', phase === 'loading');
      elements.shell.classList.toggle('unity-arena-active', phase === 'ready');
      elements.shell.classList.toggle('unity-arena-error', phase === 'error');
    }
    updateDebug(message);
  }

  function setProgress(value) {
    state.progress = Math.max(0, Math.min(1, Number(value) || 0));
    if (elements.progress) elements.progress.style.width = `${Math.round(state.progress * 100)}%`;
    if (elements.loadingLabel) {
      elements.loadingLabel.textContent = `正在載入 Mega City Arena ${Math.round(state.progress * 100)}%`;
    }
    updateDebug('WebGL');
  }

  function resolveAsset(manifestUrl, value) {
    if (!value) throw new Error('Arena manifest 缺少 WebGL 檔案路徑');
    return new URL(value, manifestUrl).href;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const existing = [...document.querySelectorAll('script[data-tappie-unity-loader]')]
        .find(item => item.dataset.tappieUnityLoader === url);
      if (existing) {
        if (typeof window.createUnityInstance === 'function') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.dataset.tappieUnityLoader = url;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error(`無法載入 Unity Loader：${url}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function runtimeKind(detail) {
    if (!detail || typeof detail !== 'object') return '';
    return String(detail.kind || detail.type || detail.event || '').toLowerCase();
  }

  function handleRuntimeEvent(event) {
    const detail = event.detail;
    state.lastRuntimeEvent = detail;
    const kind = runtimeKind(detail);
    updateDebug(kind || 'runtime');
    if (kind === 'ready') {
      state.pendingRuntimeReady = true;
      activateRuntimeReady(detail);
    }
    if (kind === 'error') console.error('[Tappie Challenge Arena] Unity Runtime', detail);
  }

  function activateRuntimeReady(detail) {
    if (state.pendingRuntimeReady && state.unityInstance && !state.runtimeReady) {
      state.runtimeReady = true;
      setProgress(1);
      setPhase('ready', 'Runtime ready');
      readyResolve(api);
      emit('tappie:challenge-arena-ready', { arenaId, runtime: detail, api });
    }
  }

  function fail(error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    state.error = normalized;
    setPhase('error', normalized.message);
    if (elements.error) elements.error.hidden = false;
    readyReject(normalized);
    emit('tappie:challenge-arena-fallback', { arenaId, error: normalized });
    console.error('[Tappie Challenge Arena] fallback', normalized);
    return Promise.reject(normalized);
  }

  async function load() {
    if (arenaDisabled) {
      emit('tappie:challenge-arena-fallback', { arenaId, reason: 'disabled' });
      return null;
    }
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      if (!elements.canvas || !elements.shell) throw new Error('Challenge 頁面缺少 Unity Arena 容器');
      setPhase('loading', 'Manifest');
      setProgress(0);
      if (elements.error) elements.error.hidden = true;

      const manifestUrl = new URL(manifestPath, location.href);
      const response = await fetch(manifestUrl.href, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Arena manifest HTTP ${response.status}`);
      const manifest = await response.json();
      if (manifest.arenaId && manifest.arenaId !== arenaId) {
        throw new Error(`Arena manifest ID 不符：${manifest.arenaId}`);
      }
      state.manifest = manifest;
      const loaderUrl = resolveAsset(manifestUrl, manifest.loaderUrl);
      await loadScript(loaderUrl);
      if (typeof window.createUnityInstance !== 'function') throw new Error('Unity Loader 未提供 createUnityInstance');

      const config = {
        dataUrl: resolveAsset(manifestUrl, manifest.dataUrl),
        frameworkUrl: resolveAsset(manifestUrl, manifest.frameworkUrl),
        codeUrl: resolveAsset(manifestUrl, manifest.codeUrl),
        streamingAssetsUrl: manifest.streamingAssetsUrl
          ? new URL(manifest.streamingAssetsUrl, manifestUrl).href
          : 'StreamingAssets',
        companyName: manifest.companyName || 'Tappie',
        productName: manifest.productName || 'Tappie Challenge Mega City Arena 01',
        productVersion: manifest.productVersion || '0.7.0',
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        showBanner(message, type) {
          if (type === 'error') console.error('[Unity]', message);
          else if (debugEnabled) console.warn('[Unity]', message);
        }
      };
      state.unityInstance = await window.createUnityInstance(elements.canvas, config, setProgress);
      setPhase('loading', 'Runtime initialization');
      activateRuntimeReady(state.lastRuntimeEvent);
      if (state.runtimeReady) setPhase('ready', 'Runtime ready');
      if (!state.runtimeReady) {
        await Promise.race([
          readyPromise,
          new Promise((_, reject) => setTimeout(
            () => reject(new Error('Unity Arena Runtime 95 秒內未準備完成')),
            95000
          ))
        ]);
      }
      return state.unityInstance;
    })().catch(fail);
    return loadPromise;
  }

  function send(method, payload = '') {
    if (!state.unityInstance) return Promise.reject(new Error('Unity Arena 尚未建立'));
    const value = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    try {
      state.unityInstance.SendMessage(HOST_OBJECT, method, value);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function normalizeLoadout(input) {
    if (!input || typeof input !== 'object') return { parts: [] };
    const source = input.parts || input.selections || input;
    const parts = [];
    if (Array.isArray(source)) {
      source.forEach(item => {
        const type = String(item?.type || '').trim();
        const displayIndex = Number(item?.displayIndex ?? item?.index);
        if (type && Number.isFinite(displayIndex)) parts.push({ type, displayIndex });
      });
    } else {
      Object.entries(source).forEach(([type, raw]) => {
        const displayIndex = Number(raw?.displayIndex ?? raw?.index ?? raw);
        if (type && Number.isFinite(displayIndex)) parts.push({ type, displayIndex });
      });
    }
    return {
      actorId: String(input.actorId || ''),
      animation: String(input.animation || 'Stand_Idle1'),
      parts
    };
  }

  function waitForRuntime(kind, messageToken, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('tappie:challenge-runtime', listener);
        reject(new Error(`Unity Runtime 等待逾時：${kind}`));
      }, timeoutMs);
      const listener = event => {
        const detail = event.detail;
        if (runtimeKind(detail) !== String(kind).toLowerCase()) return;
        if (messageToken && !String(detail?.message || '').toLowerCase().includes(String(messageToken).toLowerCase())) return;
        clearTimeout(timer);
        window.removeEventListener('tappie:challenge-runtime', listener);
        resolve(detail);
      };
      window.addEventListener('tappie:challenge-runtime', listener);
    });
  }

  async function initialize(config = {}) {
    await readyPromise;
    const player = normalizeLoadout(config.playerLoadout || readStoredLoadout());
    const opponent = normalizeLoadout(config.opponentLoadout || {});
    if (player.parts.length) {
      const rebuilt = waitForRuntime('actor-rebuilt', 'player');
      await send('SetPlayerLoadout', player);
      await rebuilt.catch(error => console.warn('[Tappie Challenge Arena]', error));
    }
    if (opponent.parts.length) {
      const rebuilt = waitForRuntime('actor-rebuilt', 'opponent');
      await send('SetOpponentLoadout', opponent);
      await rebuilt.catch(error => console.warn('[Tappie Challenge Arena]', error));
    }
    await send('SetArenaState', 'HYBRID');
    await send('SetCamera', 'BATTLE_MAIN');
    if (config.playMatchIntro !== false) await send('PlayMatchIntro', '');
  }

  function readStoredLoadout() {
    try {
      const value = sessionStorage.getItem('tappie.challenge.layerlab-loadout.v1');
      return value ? JSON.parse(value) : {};
    } catch (_) { return {}; }
  }

  async function unload() {
    if (!state.unityInstance) return;
    try { await send('DisposeRuntime', 'challenge-page-unload'); } catch (_) {}
    const instance = state.unityInstance;
    state.unityInstance = null;
    state.runtimeReady = false;
    state.pendingRuntimeReady = false;
    if (typeof instance.Quit === 'function') await instance.Quit();
    setPhase('idle', 'unloaded');
  }

  async function retry() {
    if (state.unityInstance) await unload().catch(() => {});
    loadPromise = null;
    state.error = null;
    state.runtimeReady = false;
    state.pendingRuntimeReady = false;
    readyPromise = createReadyPromise();
    return load();
  }

  const api = {
    contract: 'TAPPIE-CHALLENGE-HTML-MEGA-CITY-ARENA-V0.7.0',
    state,
    load,
    retry,
    unload,
    ready: () => readyPromise,
    isReady: () => state.runtimeReady,
    send,
    initialize,
    playCue: cue => send('PlayCue', cue),
    setCamera: camera => send('SetCamera', camera),
    resetRoundPose: () => send('ResetRoundPose', ''),
    playMatchIntro: () => send('PlayMatchIntro', ''),
    waitForRuntime,
    readStoredLoadout
  };

  window.TappieChallengeArena = api;
  window.addEventListener('tappie:challenge-runtime', handleRuntimeEvent);
  window.addEventListener('pagehide', () => {
    if (state.unityInstance) {
      try { state.unityInstance.SendMessage(HOST_OBJECT, 'DisposeRuntime', 'pagehide'); } catch (_) {}
    }
  });
  if (elements.retry) elements.retry.addEventListener('click', () => { void retry().catch(() => {}); });

  if (arenaDisabled) {
    queueMicrotask(() => emit('tappie:challenge-arena-fallback', { arenaId, reason: 'disabled' }));
  } else {
    void load().catch(() => {});
  }
})();
