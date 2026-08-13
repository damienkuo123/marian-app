(() => {
  'use strict';
  const ARENAS = ['football-field','ferry-deck','rooftop-crane','low-poly-mega-city-01'];
  const KEY='tappie.phase3r3b1.visualCandidate.v1';
  const state={ exposure:0, contrast:0, saturation:0, before:false };
  try { const saved=JSON.parse(localStorage.getItem(KEY)||'{}'); if(Number.isFinite(+saved.exposureEV)) state.exposure=+saved.exposureEV; if(Number.isFinite(+saved.contrast)) state.contrast=+saved.contrast; if(Number.isFinite(+saved.saturation)) state.saturation=+saved.saturation; } catch(_) {}
  state.before=false;

  const root=document.createElement('div'); root.id='tappie-r3b1-visual-studio';
  root.innerHTML=`<style>
  #tappie-r3b1-visual-studio{position:fixed;right:16px;top:82px;width:292px;z-index:2147483647;font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937;background:rgba(255,255,255,.96);border:1px solid rgba(15,23,42,.12);border-radius:16px;box-shadow:0 14px 40px rgba(15,23,42,.18);padding:14px;backdrop-filter:blur(16px)}
  #tappie-r3b1-visual-studio *{box-sizing:border-box} #tappie-r3b1-visual-studio h3{font-size:14px;margin:0 0 4px} .r3b1-sub{font-size:11px;color:#64748b;margin-bottom:10px}.r3b1-row{margin:10px 0}.r3b1-line{display:flex;justify-content:space-between;gap:8px;align-items:center}.r3b1-val{font-variant-numeric:tabular-nums;font-weight:700} .r3b1-row input{width:100%;margin-top:4px}.r3b1-buttons{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}.r3b1-buttons button,.r3b1-arenas button{border:0;border-radius:9px;padding:8px;background:#eef2ff;color:#3730a3;font-weight:650;cursor:pointer}.r3b1-buttons button.primary{background:#4f46e5;color:white}.r3b1-gate{padding:7px 8px;border-radius:9px;background:#ecfdf5;color:#047857;font-size:11px;margin:8px 0}.r3b1-json{font:10px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;background:#f8fafc;border-radius:9px;padding:8px;margin-top:8px;max-height:115px;overflow:auto}.r3b1-arenas{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:8px}.r3b1-foot{font-size:10px;color:#64748b;margin-top:8px}
  @media(max-width:900px){#tappie-r3b1-visual-studio{right:6px;top:60px;width:250px;transform:scale(.92);transform-origin:top right}}
  </style><h3>R3B.1 Visual Tuning Studio</h3><div class="r3b1-sub">Accepted R3A.2 baseline · ONE global candidate</div><div class="r3b1-gate" id="r3b1-gate">Neutral gate: 0 / 0 / 0 = ORIGINAL</div>
  <div class="r3b1-row"><div class="r3b1-line"><span>Exposure (EV)</span><span class="r3b1-val" id="v-exp">0.00</span></div><input id="s-exp" type="range" min="-0.75" max="1.25" step="0.05"></div>
  <div class="r3b1-row"><div class="r3b1-line"><span>Contrast</span><span class="r3b1-val" id="v-con">0</span></div><input id="s-con" type="range" min="-20" max="30" step="1"></div>
  <div class="r3b1-row"><div class="r3b1-line"><span>Saturation</span><span class="r3b1-val" id="v-sat">0</span></div><input id="s-sat" type="range" min="-20" max="40" step="1"></div>
  <div class="r3b1-buttons"><button id="btn-before">Before</button><button id="btn-reset">Reset Original</button><button class="primary" id="btn-save">Save Candidate</button><button id="btn-copy">Copy Candidate JSON</button></div>
  <div class="r3b1-arenas" id="arena-buttons"></div><div class="r3b1-json" id="r3b1-json"></div><div class="r3b1-foot">Studio preview only. No per-Arena values. No camera/FOV change.</div>`;
  document.body.appendChild(root);
  ['pointerdown','pointermove','pointerup','wheel','touchstart','touchmove','touchend'].forEach(ev=>root.addEventListener(ev,e=>e.stopPropagation(),{passive:false}));
  const q=id=>root.querySelector('#'+id), exp=q('s-exp'), con=q('s-con'), sat=q('s-sat'); exp.value=state.exposure; con.value=state.contrast; sat.value=state.saturation;
  const candidate=()=>({contract:'TAPPIE-PHASE3R3B1-VISUAL-CANDIDATE-V1.0',scope:'GLOBAL_ALL_ARENAS',exposureEV:+state.exposure,contrast:+state.contrast,saturation:+state.saturation,previewMapping:{brightness:'2^EV',contrast:'1+c/100',saturation:'1+s/100'},baseline:'PHASE3R3A2_ACCEPTED',productionImplementation:'UNDECIDED'});
  function targets(){ const a=document.getElementById('arena'); const cs=a?[...a.querySelectorAll('canvas')]:[]; if(cs.length)return cs; const u=document.getElementById('unity-canvas'); if(u)return [u]; return a?[a]:[]; }
  function apply(){
    q('v-exp').textContent=(+state.exposure).toFixed(2); q('v-con').textContent=(+state.contrast).toFixed(0); q('v-sat').textContent=(+state.saturation).toFixed(0);
    const neutral=(+state.exposure===0 && +state.contrast===0 && +state.saturation===0); const before=state.before;
    let f='none'; if(!before && !neutral){ const b=Math.pow(2,+state.exposure); const c=Math.max(.1,1+(+state.contrast/100)); const s=Math.max(0,1+(+state.saturation/100)); f=`brightness(${b}) contrast(${c}) saturate(${s})`; }
    targets().forEach(t=>{t.style.filter=f;t.style.webkitFilter=f;});
    q('r3b1-gate').textContent=before?'BEFORE: original baseline':neutral?'Neutral gate: filter:none = ORIGINAL':'AFTER: global preview active'; q('r3b1-gate').style.background=(before||neutral)?'#ecfdf5':'#eff6ff'; q('r3b1-gate').style.color=(before||neutral)?'#047857':'#1d4ed8';
    q('btn-before').textContent=before?'Show After':'Before'; q('r3b1-json').textContent=JSON.stringify(candidate(),null,2); window.__TAPPIE_PHASE3R3B1_CANDIDATE__=candidate();
  }
  [exp,con,sat].forEach(el=>el.addEventListener('input',()=>{ state.exposure=+exp.value; state.contrast=+con.value; state.saturation=+sat.value; state.before=false; apply(); }));
  q('btn-before').onclick=()=>{state.before=!state.before;apply();}; q('btn-reset').onclick=()=>{state.exposure=0;state.contrast=0;state.saturation=0;state.before=false;exp.value=0;con.value=0;sat.value=0;localStorage.removeItem(KEY);apply();};
  q('btn-save').onclick=()=>{localStorage.setItem(KEY,JSON.stringify(candidate())); q('btn-save').textContent='Saved ✓'; setTimeout(()=>q('btn-save').textContent='Save Candidate',900);};
  q('btn-copy').onclick=async()=>{const text=JSON.stringify(candidate(),null,2); try{await navigator.clipboard.writeText(text);q('btn-copy').textContent='Copied ✓';}catch(_){prompt('Copy candidate JSON',text);}setTimeout(()=>q('btn-copy').textContent='Copy Candidate JSON',900);};
  const ab=q('arena-buttons'); ARENAS.forEach(a=>{const b=document.createElement('button');b.textContent=a;b.onclick=()=>{localStorage.setItem(KEY,JSON.stringify(candidate()));const u=new URL(location.href);u.searchParams.set('arena',a);u.searchParams.set('arenaRuntime',a);location.href=u.toString();};ab.appendChild(b);});
  const obs=new MutationObserver(()=>apply()); const arena=document.getElementById('arena'); if(arena)obs.observe(arena,{childList:true,subtree:true}); setInterval(apply,800); apply();
})();
