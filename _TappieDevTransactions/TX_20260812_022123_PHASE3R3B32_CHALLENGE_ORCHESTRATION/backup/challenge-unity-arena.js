(() => {
  'use strict';

  const HOST_OBJECT = 'Tappie_Challenge_Production_Runtime';
  const CLEAN_OBJECT = 'TappieChallengeCleanCoordinator';
  const DEFAULT_ARENA = 'football-field';
  const CATALOG_PATH = './unity/arenas/catalog.json';
  const params = new URLSearchParams(location.search);
  const requestedArena = (params.get('arena') || '').trim();
  const debugEnabled = params.get('arenaDebug') === '1';
  let arenaId = requestedArena || DEFAULT_ARENA;
  let arenaLabel = arenaId;
  let runtimeProfileId = arenaId;
  let arenaDisabled = ['off', 'none'].includes(arenaId.toLowerCase());
  let manifestPath = `./unity/arenas/${encodeURIComponent(arenaId)}/arena-runtime-manifest.json`;
  let arenaSelectionResolved = false;

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
    catalogEntry: null,
    unityInstance: null,
    runtimeReady: false,
    pendingRuntimeReady: false,
    lastRuntimeEvent: null,
    error: null,
    qualityProfile: 'balanced',
    devicePixelRatio: 1,
    timings: { loaderStartedAt: performance.now() },
    controlMode: 'legacy-alpha9',
    capabilityContract: null
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

  function isSelectableArena(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const id = String(entry.id || '').trim();
    if (!id) return false;
    const status = String(entry.status || '').trim().toLowerCase();
    return !['disabled', 'off', 'archived', 'hidden', 'failed'].includes(status);
  }

  function setRuntimeArenaUrl(value) {
    try {
      const url = new URL(location.href);
      const preserved = [...url.searchParams.entries()].filter(([key]) => key !== 'arenaRuntime');
      url.search = '';
      url.searchParams.set('arenaRuntime', value);
      for (const [key, itemValue] of preserved) url.searchParams.append(key, itemValue);
      history.replaceState(history.state, '', url.href);
    } catch (_) {}
  }

  async function resolveArenaSelection() {
    if (arenaSelectionResolved) return arenaId;
    arenaSelectionResolved = true;
    if (arenaDisabled) return arenaId;
    try {
      const catalogUrl = new URL(CATALOG_PATH, location.href);
      const response = await fetch(catalogUrl.href, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Arena catalog HTTP ${response.status}`);
      const catalog = await response.json();
      if (catalog?.schema !== 'tappie.challenge.arena-catalog.v1') {
        throw new Error(`Arena catalog schema 不符：${catalog?.schema || 'missing'}`);
      }
      const selectable = Array.isArray(catalog.arenas) ? catalog.arenas.filter(isSelectableArena) : [];
      if (!selectable.length) throw new Error('Arena catalog 沒有可用場景');
      let selected = null;
      if (requestedArena) {
        selected = selectable.find(item => String(item.id).trim() === requestedArena);
        if (!selected) throw new Error(`指定 Arena 不存在或已停用：${requestedArena}`);
      } else {
        selected = selectable[Math.floor(Math.random() * selectable.length)];
      }
      arenaId = String(selected.id).trim();
      arenaLabel = String(selected.label || arenaId).trim();
      runtimeProfileId = String(selected.profileId || arenaId).trim();
      manifestPath = String(selected.runtimeManifest || `./unity/arenas/${encodeURIComponent(arenaId)}/arena-runtime-manifest.json`).trim();
      arenaDisabled = false;
      state.arenaId = arenaId;
      state.catalogEntry = selected;
      state.runtimeProfileId = runtimeProfileId;
      setRuntimeArenaUrl(runtimeProfileId);
      emit('tappie:challenge-arena-selected', {
        arenaId,
        label: arenaLabel,
        source: requestedArena ? 'catalog-forced' : 'catalog-random',
        eligibleArenaIds: selectable.map(item => item.id),
        sharedWorld: Boolean(selected.worldId || selected.profileId)
      });
      updateDebug(`selected ${arenaId}`);
      return arenaId;
    } catch (error) {
      arenaId = DEFAULT_ARENA;
      arenaLabel = DEFAULT_ARENA;
      runtimeProfileId = DEFAULT_ARENA;
      manifestPath = `./unity/arenas/${encodeURIComponent(arenaId)}/arena-runtime-manifest.json`;
      arenaDisabled = false;
      state.arenaId = arenaId;
      state.catalogError = error instanceof Error ? error.message : String(error);
      state.runtimeProfileId = runtimeProfileId;
      setRuntimeArenaUrl(runtimeProfileId);
      console.warn('[Tappie Challenge Arena] catalog fallback', error);
      emit('tappie:challenge-arena-selected', {
        arenaId,
        label: arenaLabel,
        source: 'default-fallback',
        error: state.catalogError
      });
      return arenaId;
    }
  }

  function chooseQualityProfile() {
    const explicit = String(params.get('arenaQuality') || '').trim().toLowerCase();
    if (['high', 'balanced', 'cool'].includes(explicit)) return explicit;
    const mobile = matchMedia?.('(pointer: coarse)')?.matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (!mobile) return 'high';
    const cores = Number(navigator.hardwareConcurrency || 4);
    const memory = Number(navigator.deviceMemory || 0);
    return cores >= 6 && (!memory || memory >= 4) ? 'high' : 'balanced';
  }

  function computeDevicePixelRatio(profile) {
    const canvas = elements.canvas;
    const width = Math.max(1, canvas?.clientWidth || innerWidth || 390);
    const height = Math.max(1, canvas?.clientHeight || Math.round((innerHeight || 844) * .64));
    const longCss = Math.max(width, height);
    const nativeDpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const targetLong = profile === 'high' ? 2048 : profile === 'cool' ? 1440 : 2048;
    const cap = profile === 'high' ? 2.5 : profile === 'cool' ? 1.75 : 2.5;
    return Math.max(1, Math.min(nativeDpr, cap, targetLong / longCss));
  }

  function updateDebug(message) {
    if (!elements.debug) return;
    elements.debug.hidden = !debugEnabled;
    const dpr = Number(state.devicePixelRatio || 1).toFixed(2);
    elements.debug.value = `${state.phase} · ${Math.round(state.progress * 100)}% · ${arenaId} · ${state.qualityProfile}@${dpr} · ${message || ''}`;
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
      elements.loadingLabel.textContent = `正在載入 ${arenaLabel || arenaId} ${Math.round(state.progress * 100)}%`;
    }
    emit('tappie:challenge-arena-progress', { arenaId, progress: state.progress });
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
      state.timings.runtimeReadyAt = performance.now();
      state.timings.totalReadyMs = Math.round(state.timings.runtimeReadyAt - state.timings.loaderStartedAt);
      setProgress(1);
      setPhase('ready', `Runtime ready ${state.timings.totalReadyMs}ms`);
      readyResolve(api);
      emit('tappie:challenge-arena-ready', { arenaId, runtime: detail, api, diagnostics: diagnostics() });
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
    await resolveArenaSelection();
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
      const shared = manifest.sharedMultiArena === true || manifest.schema === 'tappie.challenge.shared-arena-runtime.v1';
      if (!shared && manifest.arenaId && manifest.arenaId !== arenaId) {
        throw new Error(`Arena manifest ID 不符：${manifest.arenaId}`);
      }
      if (shared && Array.isArray(manifest.arenas) && !manifest.arenas.some(item => item?.id === runtimeProfileId)) {
        throw new Error(`Shared Arena manifest 未包含 runtime profile：${runtimeProfileId}`);
      }
      state.manifest = manifest;
      state.sharedMultiArena = shared;
      const caps = { ...(state.catalogEntry?.capabilities || {}), ...(manifest.capabilities || {}) };
      state.controlMode = String(caps.gameplayControlMode || manifest.gameplayControlMode || 'legacy-alpha9');
      state.capabilityContract = String(caps.contract || manifest.capabilityContract || '');
      const loaderUrl = resolveAsset(manifestUrl, manifest.loaderUrl);
      await loadScript(loaderUrl);
      if (typeof window.createUnityInstance !== 'function') throw new Error('Unity Loader 未提供 createUnityInstance');

      state.qualityProfile = chooseQualityProfile();
      state.devicePixelRatio = computeDevicePixelRatio(state.qualityProfile);
      state.timings.instanceStartedAt = performance.now();
      const config = {
        dataUrl: resolveAsset(manifestUrl, manifest.dataUrl),
        frameworkUrl: resolveAsset(manifestUrl, manifest.frameworkUrl),
        codeUrl: resolveAsset(manifestUrl, manifest.codeUrl),
        streamingAssetsUrl: manifest.streamingAssetsUrl
          ? new URL(manifest.streamingAssetsUrl, manifestUrl).href
          : 'StreamingAssets',
        companyName: manifest.companyName || 'Tappie',
        productName: manifest.productName || 'Tappie Challenge Mega City Arena',
        productVersion: manifest.productVersion || '1.0.0-alpha9',
        devicePixelRatio: state.devicePixelRatio,
        showBanner(message, type) {
          if (type === 'error') console.error('[Unity]', message);
          else if (debugEnabled) console.warn('[Unity]', message);
        }
      };
      state.unityInstance = await window.createUnityInstance(elements.canvas, config, setProgress);
      window.TappieAlpha11Controls?.bind?.(state.unityInstance);
      state.timings.instanceCreatedAt = performance.now();
      state.timings.instanceCreateMs = Math.round(state.timings.instanceCreatedAt - state.timings.instanceStartedAt);
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

  function sendTo(objectName, method, payload = '') {
    if (!state.unityInstance) return Promise.reject(new Error('Unity Arena 尚未建立'));
    const value = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    try { state.unityInstance.SendMessage(objectName, method, value); return Promise.resolve(); }
    catch (error) { return Promise.reject(error); }
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


  async function sendAndWait(method, payload, eventKind, timeoutMs = 6000, fallbackMs = 2200) {
    const runtimeEvent = eventKind
      ? waitForRuntime(eventKind, null, timeoutMs).catch(() => null)
      : Promise.resolve(null);
    await send(method, payload);
    if (!eventKind) return null;
    return Promise.race([
      runtimeEvent,
      new Promise(resolve => setTimeout(() => resolve(null), fallbackMs))
    ]);
  }

  async function initialize(config = {}) {
    await readyPromise;
    await send('SetQualityProfile', state.qualityProfile).catch(() => {});
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

  function diagnostics() {
    return {
      arenaId,
      runtimeProfileId,
      label: arenaLabel,
      phase: state.phase,
      progress: state.progress,
      sharedMultiArena: Boolean(state.sharedMultiArena),
      qualityProfile: state.qualityProfile,
      devicePixelRatio: state.devicePixelRatio,
      canvasCss: {
        width: elements.canvas?.clientWidth || 0,
        height: elements.canvas?.clientHeight || 0
      },
      canvasPixels: {
        width: elements.canvas?.width || 0,
        height: elements.canvas?.height || 0
      },
      timings: { ...state.timings },
      controlMode: state.controlMode,
      capabilityContract: state.capabilityContract,
      alpha11ControlBound: Boolean(window.TappieAlpha11Controls?.isBound?.()),
      cleanStateContract: window.TappieChallengeState?.contract || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null
    };
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

  const isCleanAlpha11 = () => state.controlMode === 'alpha11-single-motor-v1';
  const cleanState = value => {
    if (!isCleanAlpha11()) return Promise.resolve();
    const next = String(value || '').trim().toUpperCase();
    // REWARD_GAMEPLAY is atomically entered by BeginReward so state and socket creation cannot race.
    if (next === 'REWARD_GAMEPLAY') return Promise.resolve();
    return sendTo(CLEAN_OBJECT, 'SetChallengeState', next);
  };
  const beginReward = payload => {
    if (!isCleanAlpha11()) return send('BeginRewardSelection', payload || '');
    window.TappieAlpha11Controls?.clearAll?.();
    return sendTo(CLEAN_OBJECT, 'BeginReward', payload || {});
  };
  const endReward = reason => {
    if (!isCleanAlpha11()) return send('EndRewardSelection', reason || '');
    window.TappieAlpha11Controls?.clearAll?.();
    return sendTo(CLEAN_OBJECT, 'EndReward', reason || 'frontend');
  };

  const api = {
    contract: 'TAPPIE-CHALLENGE-ALPHA11-PHASE2F-PRODUCTION-GROUNDING-FRAMING-V1.0',
    state,
    load,
    retry,
    unload,
    ready: () => readyPromise,
    isReady: () => state.runtimeReady,
    send,
    initialize,
    playCue: cue => send('PlayCue', cue),
    playCueAndWait: (cue, eventKind, timeoutMs, fallbackMs) =>
      sendAndWait('PlayCue', cue, eventKind, timeoutMs, fallbackMs),
    setCamera: camera => send('SetCamera', camera),
    resetRoundPose: () => send('ResetRoundPose', ''),
    playActorAnimation: (actor, animation) =>
      send(actor === 'opponent' ? 'PlayOpponentAnimation' : 'PlayPlayerAnimation', animation || 'Stand_Idle1'),
    playMatchIntro: () => send('PlayMatchIntro', ''),
    suspendStableCamera: () => send('SuspendStableCamera', ''),
    resumeStableCamera: mode => send('ResumeStableCamera', mode || 'BATTLE_MAIN'),
    setChallengeState: cleanState,
    beginRewardSelection: beginReward,
    setRewardMoveInput: input => isCleanAlpha11()
      ? Promise.resolve(window.TappieAlpha11Controls?.move?.(Number(input?.x || 0), Number(input?.y || 0), Math.hypot(Number(input?.x || 0), Number(input?.y || 0)) >= .70))
      : send('SetRewardMoveInput', input || { x: 0, y: 0 }),
    setRewardLookInput: input => isCleanAlpha11()
      ? Promise.resolve(window.TappieAlpha11Controls?.look?.(Number(input?.x || 0), Number(input?.y || 0), true))
      : send('SetRewardLookInput', input || { x: 0, y: 0 }),
    endRewardLook: () => isCleanAlpha11()
      ? Promise.resolve(window.TappieAlpha11Controls?.endLook?.())
      : Promise.resolve(),
    rewardJump: () => isCleanAlpha11()
      ? Promise.resolve(window.TappieAlpha11Controls?.jump?.())
      : send('RewardJump', ''),
    confirmRewardSelection: () => isCleanAlpha11()
      ? sendTo(CLEAN_OBJECT, 'ConfirmRewardSelection', '')
      : send('ConfirmRewardSelection', ''),
    endRewardSelection: () => endReward('frontend'),
    clearRewardZone: () => isCleanAlpha11() ? endReward('clear') : send('ClearRewardZone', ''),
    setQualityProfile: profile => send('SetQualityProfile', profile),
    diagnostics,
    waitForRuntime,
    readStoredLoadout
  };

  window.TappieChallengeArena = api;
  window.TappieChallengeState?.bind?.(api);
  window.__TAPPIE_ARENA_DIAGNOSTICS__ = diagnostics;
  window.addEventListener('tappie:challenge-runtime', handleRuntimeEvent);
  window.addEventListener('pagehide', () => {
    if (state.unityInstance) {
      try { window.TappieAlpha11Controls?.clearAll?.(); window.TappieAlpha11Controls?.enableGameplay?.(false); } catch (_) {}
      try { state.unityInstance.SendMessage(CLEAN_OBJECT, 'EndReward', 'pagehide'); } catch (_) {}
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
