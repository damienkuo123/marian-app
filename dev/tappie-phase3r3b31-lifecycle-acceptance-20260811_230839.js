(() => {
  'use strict';
  const OBJECT='TappieGlobalVisualReadabilityCore';
  const EXPECT={exposureEV:1.25,shadowLift:0,midtoneGamma:0.2,contrast:5,saturation:10};
  const ARENAS=['football-field','ferry-deck','rooftop-crane','low-poly-mega-city-01'];
  let connected=false,status=null,receivedAt=0,pollTimer=0;
  const send=(m,p='')=>{const i=window.TappieChallengeArena?.state?.unityInstance;if(!i)return false;try{i.SendMessage(OBJECT,m,p);return true}catch(e){console.error(e);return false}};
  const close=(a,b)=>Number.isFinite(+a)&&Math.abs((+a)-b)<.001;
  const root=document.createElement('aside'); root.id='tappie-r3b31-accept'; root.innerHTML=`<style>
  #tappie-r3b31-accept{position:fixed;right:12px;top:150px;z-index:999999;width:320px;background:rgba(255,255,255,.98);border:1px solid #cbd5e1;border-radius:15px;padding:13px;font:12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0f172a;box-shadow:0 14px 38px rgba(15,23,42,.18)}
  #tappie-r3b31-accept .ok{color:#047857;font-weight:800}#tappie-r3b31-accept .bad{color:#b91c1c;font-weight:800}#tappie-r3b31-accept .wait{color:#92400e;font-weight:800}
  #tappie-r3b31-accept .row{display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid #f1f5f9}#tappie-r3b31-accept .row span:first-child{color:#64748b}#tappie-r3b31-accept .arena{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:8px 0}#tappie-r3b31-accept button{border:0;border-radius:8px;padding:6px;background:#eef2ff;color:#3730a3;font-weight:700;cursor:pointer}#tappie-r3b31-accept pre{font:9px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;background:#f8fafc;padding:7px;border-radius:8px;max-height:130px;overflow:auto}</style>
  <b>R3B.3.1 Visual Lifecycle Browser Final</b><div id="gate" class="wait">UNITY: waiting for live render…</div><div id="rows"></div><div class="arena">${ARENAS.map(a=>`<button data-arena="${a}">${a}</button>`).join('')}</div><pre id="out"></pre><div>PASS is test-only and requires CURRENT render compliance. Production originals are not replaced.</div>`; document.body.appendChild(root);
  const gate=root.querySelector('#gate'),rows=root.querySelector('#rows'),out=root.querySelector('#out');
  function render(){
    const age=receivedAt?performance.now()-receivedAt:Infinity;
    const values=!!status&&Object.entries(EXPECT).every(([k,v])=>close(status[k],v));
    const fresh=age<1400;
    const hook=!!status?.renderHookInstalled&&status?.cameraLifecycleAuthority==='RENDER_PIPELINE_BEGIN_CAMERA_RENDERING';
    const live=!!status?.currentRenderCompliant&&!!status?.currentCameraRenderPostProcessing&&!!status?.currentCameraVolumeMaskContainsDedicated&&!!status?.globalVolumeEnabled&&(+status?.globalVolumeWeight)>=.999&&(+status?.lastRenderFrame)>0;
    const active=status?.state==='UNITY_URP_TUNING_ACTIVE';
    const pass=connected&&fresh&&values&&hook&&live&&active;
    gate.className=pass?'ok':(connected?'bad':'wait');
    gate.textContent=pass?'PASS · CURRENT UNITY RENDER COMPLIANT':(connected?'FAIL · CURRENT RENDER NOT COMPLIANT':'UNITY: waiting for live render…');
    const items=[
      ['GLOBAL DEFAULT',values?'PASS':'FAIL'],['BRIDGE',connected&&fresh?'CONNECTED':'STALE/DISCONNECTED'],['LIFECYCLE HOOK',hook?'BEGIN_CAMERA_RENDERING':'FAIL'],['ACTIVE CAMERA',status?.lastRenderedCameraName||'—'],['CAMERA TYPE',status?.lastRenderedCameraType||'—'],['POST PROCESSING',status?.currentCameraRenderPostProcessing?'ON':'OFF'],['VISUAL VOLUME MASK',status?.currentCameraVolumeMaskContainsDedicated?'PRESENT':'MISSING'],['GLOBAL VOLUME',status?.globalVolumeEnabled&&(+status?.globalVolumeWeight)>=.999?'ACTIVE':'INACTIVE'],['CURRENT RENDER',status?.currentRenderCompliant?'COMPLIANT':'FAIL'],['REASON',status?.currentRenderReason||'—'],['FRAME',status?.lastRenderFrame??0],['SEQ',status?.renderComplianceSequence??0]
    ];
    rows.innerHTML=items.map(([a,b])=>`<div class="row"><span>${a}</span><b>${b}</b></div>`).join('');
    out.textContent=JSON.stringify({expected:EXPECT,statusAgeMs:Math.round(age),unityStatus:status},null,2);
  }
  function request(){if(send('RequestVisualTuningStatus','')){} render()}
  function startPolling(){if(pollTimer)return;request();pollTimer=setInterval(request,350)}
  window.addEventListener('tappie:visual-tuning-status',e=>{connected=true;receivedAt=performance.now();status=e.detail||null;render()});
  root.querySelectorAll('button[data-arena]').forEach(btn=>btn.addEventListener('click',()=>{const u=new URL(location.href);u.searchParams.set('arena',btn.dataset.arena);u.searchParams.set('arenaRuntime',btn.dataset.arena);location.href=u.toString()}));
  const connect=()=>{if(window.TappieChallengeArena?.state?.unityInstance)startPolling();else setTimeout(connect,250)};
  window.addEventListener('tappie:challenge-arena-ready',connect,{once:true}); setTimeout(connect,500); render();
})();
