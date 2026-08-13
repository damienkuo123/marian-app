(() => {
  'use strict';
  const OBJECT='TappieGlobalVisualReadabilityCore';
  const EXPECT={exposureEV:1.25,shadowLift:0,midtoneGamma:0.2,contrast:5,saturation:10};
  const PAIRS=[
    ['football-field','football-field'],
    ['ferry-deck','ferry-deck'],
    ['parking-garage','rooftop-crane'],
    ['airport-runway','low-poly-mega-city-01']
  ];
  let connected=false,status=null,receivedAt=0,pollTimer=0;
  const send=(m,p='')=>{const i=window.TappieChallengeArena?.state?.unityInstance;if(!i)return false;try{i.SendMessage(OBJECT,m,p);return true}catch(e){console.error(e);return false}};
  const close=(a,b)=>Number.isFinite(+a)&&Math.abs((+a)-b)<.001;
  const root=document.createElement('aside'); root.id='tappie-r3b33-accept'; root.innerHTML=`<style>
  #tappie-r3b33-accept{position:fixed;right:12px;top:145px;z-index:999999;width:330px;background:rgba(255,255,255,.98);border:1px solid #cbd5e1;border-radius:15px;padding:13px;font:12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0f172a;box-shadow:0 14px 38px rgba(15,23,42,.18)}
  #tappie-r3b33-accept .ok{color:#047857;font-weight:800}#tappie-r3b33-accept .bad{color:#b91c1c;font-weight:800}#tappie-r3b33-accept .wait{color:#92400e;font-weight:800}
  #tappie-r3b33-accept .row{display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid #f1f5f9}#tappie-r3b33-accept .row span:first-child{color:#64748b}
  #tappie-r3b33-accept .arena{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:8px 0}#tappie-r3b33-accept button{border:0;border-radius:8px;padding:6px;background:#eef2ff;color:#3730a3;font-weight:700;cursor:pointer}
  #tappie-r3b33-accept pre{font:9px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;background:#f8fafc;padding:7px;border-radius:8px;max-height:105px;overflow:auto}.hint{font-size:10px;color:#475569;margin-top:6px}</style>
  <b>R3B.3.3 Browser Final</b><div id="gate" class="wait">UNITY: waiting for live render…</div><div id="rows"></div><div class="arena">${PAIRS.map(([a,p])=>`<button data-arena="${a}" data-profile="${p}">${a}</button>`).join('')}</div><pre id="out"></pre><div class="hint">Operator checks: Round→BATTLE_MAIN once · Final→Reward 0.72s blend · Reward「回到寶箱」. ONE active WebGL tab only.</div>`;
  document.body.appendChild(root);
  const gate=root.querySelector('#gate'),rows=root.querySelector('#rows'),out=root.querySelector('#out');
  function render(){
    const age=receivedAt?performance.now()-receivedAt:Infinity;
    const values=!!status&&Object.entries(EXPECT).every(([k,v])=>close(status[k],v));
    const fresh=age<1400;
    const hook=!!status?.renderHookInstalled&&status?.cameraLifecycleAuthority==='RENDER_PIPELINE_BEGIN_CAMERA_RENDERING';
    const live=!!status?.currentRenderCompliant&&!!status?.currentCameraRenderPostProcessing&&!!status?.currentCameraVolumeMaskContainsDedicated&&!!status?.globalVolumeEnabled&&(+status?.globalVolumeWeight)>=.999&&(+status?.lastRenderFrame)>0;
    const active=status?.state==='UNITY_URP_TUNING_ACTIVE';
    const pass=connected&&fresh&&values&&hook&&live&&active;
    const btn=document.getElementById('rewardReturnButton');
    const publicArena=new URL(location.href).searchParams.get('arena')||'—';
    const runtimeArena=window.TappieChallengeArena?.state?.runtimeProfileId||new URL(location.href).searchParams.get('arenaRuntime')||'—';
    gate.className=pass?'ok':(connected?'bad':'wait');
    gate.textContent=pass?'PASS · CURRENT UNITY RENDER COMPLIANT':(connected?'FAIL · CURRENT RENDER NOT COMPLIANT':'UNITY: waiting for live render…');
    const items=[
      ['PUBLIC ARENA',publicArena],['RUNTIME PROFILE',runtimeArena],['GLOBAL DEFAULT',values?'PASS':'FAIL'],['BRIDGE',connected&&fresh?'CONNECTED':'STALE/DISCONNECTED'],['LIFECYCLE',hook?'BEGIN_CAMERA_RENDERING':'FAIL'],['ACTIVE CAMERA',status?.lastRenderedCameraName||'—'],['POST PROCESSING',status?.currentCameraRenderPostProcessing?'ON':'OFF'],['GLOBAL VOLUME',status?.globalVolumeEnabled&&(+status?.globalVolumeWeight)>=.999?'ACTIVE':'INACTIVE'],['CURRENT RENDER',status?.currentRenderCompliant?'COMPLIANT':'FAIL'],['RETURN BUTTON DOM',btn?'PRESENT':'MISSING'],['RETURN BUTTON',btn?(btn.hidden?'HIDDEN':'VISIBLE'):'—'],['FRAME',status?.lastRenderFrame??0]
    ];
    rows.innerHTML=items.map(([a,b])=>`<div class="row"><span>${a}</span><b>${b}</b></div>`).join('');
    out.textContent=JSON.stringify({expected:EXPECT,statusAgeMs:Math.round(age),unityStatus:status},null,2);
  }
  function request(){send('RequestVisualTuningStatus','');render()}
  function startPolling(){if(pollTimer)return;request();pollTimer=setInterval(request,350)}
  window.addEventListener('tappie:visual-tuning-status',e=>{connected=true;receivedAt=performance.now();status=e.detail||null;render()});
  root.querySelectorAll('button[data-arena]').forEach(btn=>btn.addEventListener('click',()=>{
    const old=new URL(location.href), nu=new URL(old.origin+old.pathname), params=new URLSearchParams();
    params.append('arenaRuntime',btn.dataset.profile); params.append('arena',btn.dataset.arena); params.append('arenaDebug','1');
    nu.search=params.toString(); location.href=nu.toString();
  }));
  const observer=new MutationObserver(render); const watch=()=>{const b=document.getElementById('rewardReturnButton');if(b)observer.observe(b,{attributes:true,attributeFilter:['hidden','class','style']});else setTimeout(watch,500)};watch();
  const connect=()=>{if(window.TappieChallengeArena?.state?.unityInstance)startPolling();else setTimeout(connect,250)};
  window.addEventListener('tappie:challenge-arena-ready',connect,{once:true});setTimeout(connect,500);setInterval(render,500);render();
})();
