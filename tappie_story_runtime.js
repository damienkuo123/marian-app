(()=>{
'use strict';
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=(t,k)=>{t=clamp(t,0,1);if(k==='easeInOut')return t*t*(3-2*t);if(k==='easeOut')return 1-Math.pow(1-t,3);if(k==='easeIn')return t*t*t;if(k==='fastPass')return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;return t};
const qs=new URLSearchParams(location.search);
const editorMode=qs.has('editor');
const embedMode=qs.has('embed');
const fixedProgress=qs.has('progress')?clamp(Number(qs.get('progress'))||0,0,100):null;
if(editorMode)document.documentElement.classList.add('tappie-editor');
if(embedMode||fixedProgress!==null)document.documentElement.classList.add('tappie-fixed-preview');

let project=window.TAPPIE_EMBEDDED_PROJECT;
let projectRevision=0;
let device=matchMedia('(max-width:760px)').matches?'mobile':'desktop';
let forcedDevice=null;
let splineApp=null,splineTarget=null,splineBase=null,splineLoadKey='';
let lastRendered=-1;
let scrollRaf=0,renderRaf=0,pendingRender=null;
let pointsCacheKey='',pointsCache=[];
let viewportCacheKey='',viewportCache=null;
let textCacheKey='',textEntries=[];

const master=$('#master'),shell=$('#viewportShell'),stage=$('#designStage'),shellBg=$('#shellBg');
const cardStage=$('#cardStage'),cssCard=$('#cssCard'),debug=$('#debug');
const textBehind=$('#textBehind'),textFront=$('#textFront');
const debugOn=qs.has('debug');
if(debugOn)debug.classList.add('show');

function activeDevice(){return forcedDevice||device}
function track(){return project.tracks[activeDevice()]||project.tracks.desktop}
function cacheToken(){return `${projectRevision}|${activeDevice()}`}
function invalidateCaches(){pointsCacheKey='';viewportCacheKey='';viewportCache=null;textCacheKey=''}
function parseViewport(){
  const key=cacheToken();
  if(viewportCacheKey===key&&viewportCache)return viewportCache;
  const mobile=activeDevice()==='mobile';
  const raw=project.viewport?.[activeDevice()]||(mobile?'390x844':'1440x900');
  let [w,h]=String(raw).split('x').map(Number);
  if(!w||!h||(mobile&&(w>=h||w>760))||(!mobile&&w<h)){w=mobile?390:1440;h=mobile?844:900}
  viewportCacheKey=key;
  viewportCache={w,h};
  return viewportCache;
}
function renderConfig(){return project.render||{}}
function points(){
  const key=cacheToken();
  if(pointsCacheKey!==key){pointsCache=[...(track().points||[])].sort((a,b)=>a.progress-b.progress);pointsCacheKey=key}
  return pointsCache;
}
function sample(p){
  const a=points();
  if(!a.length)return {...(track().working||{})};
  if(p<=a[0].progress)return {...a[0]};
  if(p>=a.at(-1).progress+a.at(-1).hold)return {...a.at(-1)};
  for(let i=0;i<a.length-1;i++){
    const A=a[i],B=a[i+1],start=Number(A.progress)+Number(A.hold||0);
    if(p<=start)return {...A};
    if(p<=B.progress){
      const q=ease((p-start)/Math.max(Number(B.progress)-start,.001),A.easing),o={...A};
      for(const k of ['x','y','z','scale','rotX','rotY','rotZ','opacity','brightness','contrast','saturation'])o[k]=lerp(Number(A[k]??0),Number(B[k]??0),q);
      o.layer=q<.5?A.layer:B.layer;
      return o;
    }
  }
  return {...a.at(-1)};
}
function edgeOpacity(p,s,e){const feather=1.45;if(p<s||p>e)return 0;if(p<s+feather)return (p-s)/feather;if(p>e-feather)return (e-p)/feather;return 1}

function updateLayout(){
  const {w,h}=parseViewport();
  const r=shell.getBoundingClientRect();
  const cfg=renderConfig();
  const mode=activeDevice()==='mobile'?(cfg.mobileFitMode||'width'):(cfg.desktopFitMode||'width');
  const sx=r.width/w,sy=r.height/h;
  let fit=mode==='cover'?Math.max(sx,sy):mode==='contain'?Math.min(sx,sy):sx;
  fit=Math.max(.05,fit);
  stage.style.width=w+'px';stage.style.height=h+'px';stage.style.setProperty('--fit',String(fit));
  stage.style.top=(Number(cfg.stageAlignY??50))+'%';stage.dataset.device=activeDevice();stage.dataset.fitMode=mode;
  stage.style.setProperty('--card-base',(activeDevice()==='mobile'?cfg.mobileCardBase||350:cfg.desktopCardBase||390)+'px');
  stage.style.setProperty('--title-size',(activeDevice()==='mobile'?cfg.mobileTitleSize||62:cfg.desktopTitleSize||86)+'px');
  stage.style.setProperty('--body-size',(activeDevice()==='mobile'?cfg.mobileBodySize||16:cfg.desktopBodySize||19)+'px');
  stage.style.setProperty('--kicker-size',(activeDevice()==='mobile'?11:14)+'px');
  if(!editorMode&&!embedMode&&fixedProgress===null){const vh=activeDevice()==='mobile'?cfg.mobileScrollVh||390:cfg.desktopScrollVh||420;master.style.height=vh+'vh'}else master.style.height='100%';
  if(window.parent!==window)window.parent.postMessage({type:'TAPPIE_RUNTIME_LAYOUT',device:activeDevice(),viewportW:r.width,viewportH:r.height,designW:w,designH:h,fit,mode},'*');
  return{w,h,fit,mode};
}

function ensureTextNodes(){
  const key=cacheToken();
  if(textCacheKey===key)return;
  textCacheKey=key;textEntries=[];
  textBehind.replaceChildren();textFront.replaceChildren();
  for(const t of (track().texts||[])){
    const d=document.createElement('div');
    d.className='copy';d.dataset.wrap=t.titleWrap||'manual';d.dataset.align=t.align||'left';
    d.style.cssText=`--x:${t.x}%;--y:${t.y}%;--w:${t.width}%;--tw:${t.titleWidth??100}%;--s:${t.scale};--o:0;--align:${t.align};--origin:${t.align==='right'?'right center':t.align==='center'?'center center':'left center'}`;
    d.innerHTML=`<div class="kicker">${t.kicker||''}</div><h2>${t.title||''}</h2><p>${t.note||''}</p>`;
    (t.layer==='front'?textFront:textBehind).appendChild(d);
    textEntries.push({el:d,start:Number(t.start),end:Number(t.end),opacity:Number(t.opacity??1),lastOpacity:-1});
  }
}
function renderTexts(p){
  ensureTextNodes();
  for(const entry of textEntries){
    const o=clamp(edgeOpacity(p,entry.start,entry.end)*entry.opacity,0,1);
    if(Math.abs(o-entry.lastOpacity)<.002)continue;
    entry.lastOpacity=o;
    entry.el.style.setProperty('--o',String(o));
    entry.el.style.visibility=o<=.001?'hidden':'visible';
  }
}

function applyCard(f){
  const {w,h}=parseViewport();
  const layer=f.layer||'front';
  if(cardStage.dataset.layer!==layer)cardStage.dataset.layer=layer;
  const x=Number(f.x||0)/100*w,y=Number(f.y||0)/100*h;
  cardStage.style.transform=`translate3d(${x}px,${y}px,0)`;
  const br=Number(f.brightness??1),ct=Number(f.contrast??1),sat=Number(f.saturation??1);
  const hasEffects=Math.abs(br-1)>.001||Math.abs(ct-1)>.001||Math.abs(sat-1)>.001;
  cardStage.classList.toggle('has-color-effects',hasEffects);
  if(hasEffects){cardStage.style.setProperty('--br',br);cardStage.style.setProperty('--ct',ct);cardStage.style.setProperty('--sat',sat)}
  const opacity=Number(f.opacity??1);
  cardStage.style.opacity=String(opacity);cardStage.style.visibility=opacity<=.001?'hidden':'visible';

  if(!splineTarget||!splineBase){
    cssCard.style.setProperty('--z',Number(f.z||0)+'px');cssCard.style.setProperty('--rx',Number(f.rotX||0)+'deg');
    cssCard.style.setProperty('--ry',Number(f.rotY||0)+'deg');cssCard.style.setProperty('--rz',Number(f.rotZ||0)+'deg');
    cssCard.style.setProperty('--scale',Number(f.scale??1));cssCard.style.setProperty('--opacity',opacity);
    return;
  }
  splineTarget.position.x=splineBase.px;splineTarget.position.y=splineBase.py;splineTarget.position.z=splineBase.pz+Number(f.z||0);
  splineTarget.rotation.x=splineBase.rx+Number(f.rotX||0)*Math.PI/180;
  splineTarget.rotation.y=splineBase.ry+Number(f.rotY||0)*Math.PI/180;
  splineTarget.rotation.z=splineBase.rz+Number(f.rotZ||0)*Math.PI/180;
  const scale=Number(f.scale??1);
  splineTarget.scale.x=splineBase.sx*scale;splineTarget.scale.y=splineBase.sy*scale;splineTarget.scale.z=splineBase.sz*scale;
  splineApp.requestRender?.();
}

async function loadSplineIfNeeded(force=false){
  if(project.engine!=='spline'){cardStage.classList.remove('spline-ready');return}
  const key=(project.sceneUrl||'')+'|'+(project.objectName||'');
  if(!force&&key===splineLoadKey&&splineTarget)return;
  splineLoadKey=key;
  try{
    const mod=await import('https://unpkg.com/@splinetool/runtime@1.12.98/build/runtime.js');
    splineApp?.dispose?.();splineApp=new mod.Application($('#canvas3d'));
    await Promise.race([splineApp.load(project.sceneUrl),new Promise((_,rej)=>setTimeout(()=>rej(Error('timeout')),15000))]);
    splineTarget=splineApp.findObjectByName(project.objectName)||splineApp.findObjectByName('tappie_card_group')||splineApp.findObjectByName('card_movement')||splineApp.findObjectByName('card_rotation');
    if(!splineTarget)throw Error('object');
    splineBase={px:splineTarget.position.x,py:splineTarget.position.y,pz:splineTarget.position.z,rx:splineTarget.rotation.x,ry:splineTarget.rotation.y,rz:splineTarget.rotation.z,sx:splineTarget.scale.x,sy:splineTarget.scale.y,sz:splineTarget.scale.z};
    cardStage.classList.add('spline-ready');
    renderNow(lastRendered<0?0:lastRendered,null,true);
  }catch(e){console.warn('Spline fallback active',e);splineTarget=null;cardStage.classList.remove('spline-ready')}
}
function ambientFor(p){const bg=project.background||{};const start=Number(bg.glowStart??.06)*100,end=Number(bg.glowEnd??.94)*100,peak=Number(bg.glowPeak??.92);if(p<=start||p>=end)return 0;const q=clamp((p-start)/(end-start),0,1);return Math.sin(q*Math.PI)*peak}
function renderNow(p,overrideFrame=null,force=false){
  p=clamp(Number(p)||0,0,100);
  if(!force&&!overrideFrame&&Math.abs(p-lastRendered)<.0001)return;
  lastRendered=p;
  const f=overrideFrame||sample(p);
  shell.style.setProperty('--ambient',String(ambientFor(p)));
  renderTexts(p);applyCard(f);
  if(debugOn){const view=parseViewport();debug.textContent=`${activeDevice()} · ${p.toFixed(2)}% · THIRD SCREEN · ${view.w}×${view.h} · ${stage.dataset.fitMode||'width'}`}
}
function queueRender(p,overrideFrame=null){
  pendingRender={p,overrideFrame};
  if(renderRaf)return;
  renderRaf=requestAnimationFrame(()=>{renderRaf=0;const next=pendingRender;pendingRender=null;if(next)renderNow(next.p,next.overrideFrame)});
}
function scrollProgress(){const r=master.getBoundingClientRect(),max=Math.max(master.offsetHeight-innerHeight,1);return clamp(-r.top/max*100,0,100)}
function scheduleScrollRender(){if(scrollRaf)return;scrollRaf=requestAnimationFrame(()=>{scrollRaf=0;queueRender(scrollProgress())})}
async function loadProject(){
  if(editorMode)return;
  try{const r=await fetch('./tappie-motion-keyframes.json?ts='+Date.now(),{cache:'no-store'});if(r.ok){project=await r.json();projectRevision++;invalidateCaches()}}
  catch(e){console.warn('Using embedded project',e)}
}
function setExternalProgress(p,nextDevice){
  if(nextDevice&&nextDevice!==forcedDevice){forcedDevice=nextDevice;invalidateCaches();updateLayout()}
  queueRender(Number(p||0));
}
async function boot(){
  await loadProject();device=matchMedia('(max-width:760px)').matches?'mobile':'desktop';updateLayout();await loadSplineIfNeeded();
  if(editorMode){renderNow(0,null,true);window.parent!==window&&window.parent.postMessage({type:'TAPPIE_RUNTIME_READY'},'*')}
  else if(embedMode){renderNow(fixedProgress!==null?fixedProgress:0,null,true);window.parent!==window&&window.parent.postMessage({type:'TAPPIE_RUNTIME_READY'},'*')}
  else if(fixedProgress!==null)renderNow(fixedProgress,null,true);
  else{renderNow(scrollProgress(),null,true);addEventListener('scroll',scheduleScrollRender,{passive:true})}
}
window.addEventListener('message',async e=>{
  const d=e.data;if(!d)return;
  if(d.type==='TAPPIE_STORY_PROGRESS'){setExternalProgress(d.progress,d.device);return}
  if(d.type!=='TAPPIE_EDITOR_STATE')return;
  const oldScene=(project.sceneUrl||'')+'|'+(project.objectName||'')+'|'+(project.engine||'');
  project=d.project||project;projectRevision++;forcedDevice=d.device||forcedDevice;invalidateCaches();updateLayout();
  const newScene=(project.sceneUrl||'')+'|'+(project.objectName||'')+'|'+(project.engine||'');
  if(oldScene!==newScene)await loadSplineIfNeeded(true);
  queueRender(Number(d.progress||0),d.frameOverride||null);
});
addEventListener('resize',()=>{device=matchMedia('(max-width:760px)').matches?'mobile':'desktop';invalidateCaches();updateLayout();queueRender(fixedProgress!==null?fixedProgress:lastRendered<0?scrollProgress():lastRendered)});
window.TappieStoryRuntime={render:(p,overrideFrame=null)=>queueRender(p,overrideFrame),setProgress:setExternalProgress,getProject:()=>project,getDevice:activeDevice,updateLayout};
boot();
})();
