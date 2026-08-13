/* Canonical Phase2B Alpha11 browser adapter. No Reward, grounding, collision or camera model lives here. */
(function (global) {
  'use strict';
  const OBJECT_NAME = 'TappieAlpha11WebGLControlBridge';
  const CONTRACT = 'TAPPIE-ALPHA11-WEBGL-DESKTOP-MOBILE-CONTROL-BRIDGE-V1.0-CANONICAL-PHASE2B';
  let unityInstance = null;
  function send(method, payload) {
    if (!unityInstance || typeof unityInstance.SendMessage !== 'function') return false;
    unityInstance.SendMessage(OBJECT_NAME, method, payload == null ? '' : String(payload));
    return true;
  }
  const api = {
    contract: CONTRACT,
    objectName: OBJECT_NAME,
    bind(instance) { unityInstance = instance; return api; },
    unbind() { unityInstance = null; return api; },
    isBound() { return !!unityInstance; },
    enableGameplay(enabled = true) { return send('SetGameplayEnabled', enabled ? '1' : '0'); },
    move(x, y, sprint = false) { return send('SetMoveInput', JSON.stringify({ x, y, sprint: !!sprint })); },
    stopMove() { return send('ClearMoveInput', ''); },
    sprint(enabled) { return send('SetSprint', enabled ? '1' : '0'); },
    jump() { return send('Jump', ''); },
    look(dx, dy, active = true) { return send('SetLookInput', JSON.stringify({ x: dx, y: dy, active: !!active })); },
    endLook() { return send('EndLookInput', ''); },
    zoom(delta) { return send('SetZoomInput', delta); },
    resetCamera() { return send('ResetCameraBehindPlayer', ''); },
    requestStatus() { return send('RequestStatus', ''); },
    clearAll() { api.stopMove(); api.endLook(); api.sprint(false); }
  };
  global.TappieAlpha11Controls = api;
})(window);
