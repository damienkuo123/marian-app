/* Frontend Challenge state coordinator. It declares state only; Unity remains the authority for Motor/Camera/Reward sockets. */
(function (global) {
  'use strict';
  const CONTRACT = 'TAPPIE-CHALLENGE-FRONTEND-STATE-COORDINATOR-V1.0-CLEAN';
  const VALID = new Set(['LOADING','READY_GATE','MATCH_INTRO','ROUND_PRESENTATION','ROUND_INPUT','ROUND_RESULT','REWARD_GAMEPLAY','REWARD_SELECTED','EXIT']);
  let current = 'LOADING';
  let arenaApi = null;
  function normalize(value) { const v=String(value||'LOADING').trim().toUpperCase(); return VALID.has(v)?v:'LOADING'; }
  async function transition(next, meta = {}) {
    const state = normalize(next);
    if (state !== 'REWARD_GAMEPLAY') global.TappieAlpha11Controls?.clearAll?.();
    if (arenaApi?.setChallengeState) await arenaApi.setChallengeState(state);
    current = state;
    global.dispatchEvent(new CustomEvent('tappie:challenge-state', { detail: { contract: CONTRACT, state, meta } }));
    return state;
  }
  const api = {
    contract: CONTRACT,
    bind(api) { arenaApi = api || null; return api; },
    transition,
    get state() { return current; },
    diagnostics() { return { contract: CONTRACT, state: current, arenaBound: !!arenaApi }; }
  };
  global.TappieChallengeState = api;
})(window);
