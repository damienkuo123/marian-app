(() => {
  'use strict';

  const STORAGE_KEY = 'tappie.challenge.layerlab-loadout.v1';
  const CONTRACT = 'TAPPIE-CHALLENGE-DASHBOARD-ARENA-HANDOFF-V0.7.0';

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function normalize(detail) {
    if (!detail || typeof detail !== 'object') return null;
    const state = detail.state && typeof detail.state === 'object' ? detail.state : detail;
    const selections = detail.selections && typeof detail.selections === 'object'
      ? detail.selections
      : state.selections && typeof state.selections === 'object'
        ? state.selections
        : null;
    const parts = Array.isArray(state.parts)
      ? state.parts
      : selections
        ? Object.entries(selections).map(([type, displayIndex]) => ({
            type,
            displayIndex: Number(displayIndex?.displayIndex ?? displayIndex?.index ?? displayIndex)
          }))
        : [];
    const cleanParts = parts
      .map(item => ({
        type: String(item?.type || '').trim(),
        displayIndex: Number(item?.displayIndex ?? item?.index)
      }))
      .filter(item => item.type && Number.isFinite(item.displayIndex));
    if (!cleanParts.length) return null;
    return {
      contract: CONTRACT,
      sourceContract: detail.contract || state.contract || null,
      provider: detail.provider || state.provider || 'layerlab-casual',
      providerAssetVersion: detail.providerAssetVersion || state.providerAssetVersion || null,
      actorId: 'player',
      animation: 'Stand_Idle1',
      parts: cleanParts,
      capturedAt: new Date().toISOString()
    };
  }

  function persist(detail) {
    const loadout = normalize(detail);
    if (!loadout) return false;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(loadout));
      window.__TAPPIE_CHALLENGE_ARENA_HANDOFF__ = clone(loadout);
      return true;
    } catch (error) {
      console.warn('[Challenge Arena handoff] sessionStorage unavailable', error);
      return false;
    }
  }

  async function captureCurrentState() {
    if (persist(window.__TAPPIE_LAYERLAB_WARDROBE_COMMIT__)) return true;
    const portal = window.TappieLayerLabPortal;
    if (!portal || typeof portal.getState !== 'function') return false;
    try { return persist({ state: await portal.getState() }); }
    catch (error) {
      console.warn('[Challenge Arena handoff] getState failed', error);
      return false;
    }
  }

  window.addEventListener('tappie:layerlab-wardrobe-commit', event => persist(event.detail));

  function wrapChallengeLaunch() {
    const original = window.selectChallengeAI;
    if (typeof original !== 'function' || original.__tappieArenaHandoffWrapped) return;
    const wrapped = async function (...args) {
      await Promise.race([
        captureCurrentState(),
        new Promise(resolve => setTimeout(() => resolve(false), 1200))
      ]);
      return original.apply(this, args);
    };
    wrapped.__tappieArenaHandoffWrapped = true;
    wrapped.__tappieArenaHandoffOriginal = original;
    window.selectChallengeAI = wrapped;
  }

  window.TappieChallengeArenaHandoff = {
    contract: CONTRACT,
    storageKey: STORAGE_KEY,
    persist,
    captureCurrentState
  };
  wrapChallengeLaunch();
  window.addEventListener('load', wrapChallengeLaunch, { once: true });
})();
