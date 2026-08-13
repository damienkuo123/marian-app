(() => {
  'use strict';
  const OBJECT='TappieGlobalVisualReadabilityCore';
  const EXPECT={exposureEV:1.25,shadowLift:0,midtoneGamma:0.2,contrast:5,saturation:10};
  let connected=false,status=null;
  const send=(m,p='')=>{const i=window.TappieChallengeArena?.state?.unityInstance;if(!i)return false;try{i.SendMessage(OBJECT,m,p);return true}catch(e){console.error(e);return false}};
  const root=document.createElement('aside'); root.id='tappie-r3b3-accept'; root.innerHTML=`<style>
  #tappie-r3b3-accept{position:fixed;right:12px;top:190px;z-index:999999;width:285px;background:rgba(255,255,255,.97);border:1px solid #cbd5e1;border-radius:15px;padding:13px;font:12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0f172a;box-shadow:0 14px 38px rgba(15,23,42,.18)}
  #tappie-r3b3-accept .ok{color:#047857;font-weight:800}.bad{color:#b91c1c;font-weight:800}pre{font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;background:#f8fafc;padding:8px;border-radius:9px;max-height:190px;overflow:auto}</style>
  <b>R3B.3 Visual Production Lock</b><div id="gate" class="bad">UNITY: waiting…</div><pre id="out"></pre><div>Diagnostic only: <code>&visualCore=0</code> shows the original baseline.</div>`; document.body.appendChild(root);
  const gate=root.querySelector('#gate'),out=root.querySelector('#out');
  function render(){const pass=connected&&status&&Object.entries(EXPECT).every(([k,v])=>Math.abs((+status[k])-v)<.001)&&status.state==='UNITY_URP_TUNING_ACTIVE';gate.className=pass?'ok':'bad';gate.textContent=pass?'PASS · UNITY DEFAULT ACKNOWLEDGED':'WAIT/FAIL · default mismatch';out.textContent=JSON.stringify({expected:EXPECT,unityStatus:status},null,2)}
  window.addEventListener('tappie:visual-tuning-status',e=>{connected=true;status=e.detail||null;render()});
  const connect=()=>{if(window.TappieChallengeArena?.state?.unityInstance){send('RequestVisualTuningStatus','')}else setTimeout(connect,250)};
  window.addEventListener('tappie:challenge-arena-ready',connect,{once:true}); setTimeout(connect,500); render();
})();
