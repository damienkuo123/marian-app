(() => {
  'use strict';
  const OBJECT = 'TappieGlobalVisualReadabilityCore';
  const KEY = 'tappie.phase3r3b2.visual-candidate.v1';
  const ARENAS = ['football-field','ferry-deck','rooftop-crane','low-poly-mega-city-01'];
  let state = { enabled:true, before:false, exposureEV:0, shadowLift:0, midtoneGamma:0, contrast:0, saturation:0, connected:false, unityStatus:null };
  try { const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s) Object.assign(state,s,{before:false,connected:false,unityStatus:null}); } catch(_) {}
  const send = (method,payload='') => {
    const inst = window.TappieChallengeArena?.state?.unityInstance;
    if (!inst) return false;
    try { inst.SendMessage(OBJECT, method, typeof payload==='string'?payload:JSON.stringify(payload)); return true; } catch(e){ console.error('[R3B.2]',e); return false; }
  };
  const payload=()=>({enabled:!state.before,exposureEV:+state.exposureEV,shadowLift:+state.shadowLift,midtoneGamma:+state.midtoneGamma,contrast:+state.contrast,saturation:+state.saturation});
  const candidate=()=>({contract:'TAPPIE-PHASE3R3B2-VISUAL-CANDIDATE-V1.0',scope:'GLOBAL_ALL_ARENAS',implementation:'UNITY_URP_RUNTIME',baseline:'PHASE3R3A2_ACCEPTED',...payload(),unityAcknowledged:!!state.connected});
  function apply(){
    if(state.before) send('SetVisualTuningEnabled','false'); else send('SetVisualTuning',payload());
    setTimeout(()=>send('RequestVisualTuningStatus',''),50);
  }
  const root=document.createElement('aside'); root.id='tappie-r3b2-studio'; root.innerHTML=`<style>
  #tappie-r3b2-studio{position:fixed;right:14px;top:200px;z-index:999999;width:292px;font:12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1f2937;background:rgba(255,255,255,.97);border:1px solid rgba(15,23,42,.12);border-radius:16px;box-shadow:0 16px 44px rgba(15,23,42,.2);padding:14px;backdrop-filter:blur(16px)}
  #tappie-r3b2-studio *{box-sizing:border-box} #tappie-r3b2-studio h3{font-size:14px;margin:0 0 3px}.sub{font-size:10.5px;color:#64748b;margin-bottom:9px}.gate{padding:7px 8px;border-radius:9px;font-weight:700;font-size:10.5px;margin:7px 0;background:#fff7ed;color:#9a3412}.gate.ok{background:#ecfdf5;color:#047857}.row{margin:8px 0}.line{display:flex;justify-content:space-between;gap:8px}.val{font-weight:700;font-variant-numeric:tabular-nums}.row input{width:100%;margin-top:3px}.buttons,.arenas{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.buttons button,.arenas button{border:0;border-radius:9px;padding:8px;background:#eef2ff;color:#3730a3;font-weight:650;cursor:pointer}.buttons .primary{background:#4f46e5;color:#fff}.json{font:9.5px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;background:#f8fafc;border-radius:9px;padding:7px;margin-top:8px;max-height:105px;overflow:auto}.foot{font-size:9.5px;color:#64748b;margin-top:7px}@media(max-width:900px){#tappie-r3b2-studio{right:5px;top:60px;transform:scale(.9);transform-origin:top right}}</style>
  <h3>R3B.2 Unity Visual Tuning</h3><div class="sub">ONE Global URP Core · no per-Arena values</div><div id="gate" class="gate">UNITY BRIDGE: waiting…</div>
  <div class="row"><div class="line"><span>Exposure (EV)</span><span class="val" id="v-exp">0.00</span></div><input id="s-exp" type="range" min="-0.75" max="1.25" step="0.05"></div>
  <div class="row"><div class="line"><span>Shadow Lift</span><span class="val" id="v-lift">0.00</span></div><input id="s-lift" type="range" min="-0.15" max="0.35" step="0.01"></div>
  <div class="row"><div class="line"><span>Midtone / Gamma</span><span class="val" id="v-gamma">0.00</span></div><input id="s-gamma" type="range" min="-0.15" max="0.45" step="0.01"></div>
  <div class="row"><div class="line"><span>Contrast</span><span class="val" id="v-con">0</span></div><input id="s-con" type="range" min="-20" max="30" step="1"></div>
  <div class="row"><div class="line"><span>Saturation</span><span class="val" id="v-sat">0</span></div><input id="s-sat" type="range" min="-20" max="40" step="1"></div>
  <div class="buttons"><button id="before">Before</button><button id="neutral">Reset Neutral</button><button class="primary" id="save">Save Candidate</button><button id="copy">Copy JSON</button></div><div class="arenas" id="arenas"></div><div id="json" class="json"></div><div class="foot">Neutral = exact bypass. Camera/FOV/PC1/PC2/Reward untouched.</div>`;
  document.body.appendChild(root);
  ['pointerdown','pointermove','pointerup','wheel','touchstart','touchmove','touchend'].forEach(ev=>root.addEventListener(ev,e=>e.stopPropagation(),{passive:false}));
  const q=id=>root.querySelector('#'+id); const inputs={exposureEV:q('s-exp'),shadowLift:q('s-lift'),midtoneGamma:q('s-gamma'),contrast:q('s-con'),saturation:q('s-sat')};
  Object.entries(inputs).forEach(([k,el])=>el.value=state[k]);
  function render(){
    q('v-exp').textContent=(+state.exposureEV).toFixed(2); q('v-lift').textContent=(+state.shadowLift).toFixed(2); q('v-gamma').textContent=(+state.midtoneGamma).toFixed(2); q('v-con').textContent=(+state.contrast).toFixed(0); q('v-sat').textContent=(+state.saturation).toFixed(0);
    const g=q('gate'); if(state.connected){g.classList.add('ok');g.textContent=`UNITY BRIDGE CONNECTED · ${state.unityStatus?.state||'ACK'}`;} else {g.classList.remove('ok');g.textContent='UNITY BRIDGE: waiting for acknowledgement…';}
    q('before').textContent=state.before?'Show Tuned':'Before'; q('json').textContent=JSON.stringify(candidate(),null,2);
  }
  let timer=0; function queueApply(){clearTimeout(timer); timer=setTimeout(()=>{apply();render();},35);}
  Object.entries(inputs).forEach(([k,el])=>el.addEventListener('input',()=>{state[k]=+el.value;state.before=false;queueApply();}));
  q('before').onclick=()=>{state.before=!state.before;apply();render();};
  q('neutral').onclick=()=>{Object.assign(state,{before:false,exposureEV:0,shadowLift:0,midtoneGamma:0,contrast:0,saturation:0});Object.entries(inputs).forEach(([k,el])=>el.value=state[k]);send('ResetVisualTuningNeutral','');setTimeout(()=>send('RequestVisualTuningStatus',''),50);render();};
  q('save').onclick=()=>{localStorage.setItem(KEY,JSON.stringify(candidate()));q('save').textContent='Saved ✓';setTimeout(()=>q('save').textContent='Save Candidate',900);};
  q('copy').onclick=async()=>{const t=JSON.stringify(candidate(),null,2);try{await navigator.clipboard.writeText(t);q('copy').textContent='Copied ✓';}catch(_){prompt('Copy candidate JSON',t);}setTimeout(()=>q('copy').textContent='Copy JSON',900);};
  const ab=q('arenas'); ARENAS.forEach(a=>{const b=document.createElement('button');b.textContent=a;b.onclick=()=>{localStorage.setItem(KEY,JSON.stringify(candidate()));const u=new URL(location.href);u.searchParams.set('arena',a);u.searchParams.set('arenaRuntime',a);location.href=u.toString();};ab.appendChild(b);});
  window.addEventListener('tappie:visual-tuning-status',e=>{state.connected=true;state.unityStatus=e.detail||null; if(e.detail){['exposureEV','shadowLift','midtoneGamma','contrast','saturation'].forEach(k=>{if(Number.isFinite(+e.detail[k])) state[k]=+e.detail[k];});} render();});
  const connect=()=>{if(window.TappieChallengeArena?.state?.unityInstance){apply();send('RequestVisualTuningStatus','');} else setTimeout(connect,250);};
  window.addEventListener('tappie:challenge-arena-ready',connect,{once:true}); setTimeout(connect,500); render();
})();
