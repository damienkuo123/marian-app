import * as THREE from './vendor/three/build/three.module.js';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';

const DEFAULT_MODEL_URL = './chibiz3d/assets/male_mvp_fixed.glb';
const DEFAULT_CATALOG_URL = './chibiz3d/assets/male_mvp_fixed_catalog.json';
const STORAGE_KEY = 'tappie_chibiz_loadout_v2';
const SLOT_LABELS = { hair: '髮型', outfit: '服裝', accessory: '配件', skin: '膚色' };

class ChibizViewer {
  constructor(container, { compact = false } = {}) {
    this.container = container;
    this.compact = compact;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.01, 200);
    this.camera.position.set(0, 1.4, 7.2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 2.45;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 14;
    this.controls.target.set(0, 1.3, 0);
    this.controls.autoRotate = compact;
    this.controls.autoRotateSpeed = 0.42;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7e9db7, 2.15));
    const key = new THREE.DirectionalLight(0xffffff, 3.35);
    key.position.set(4, 7, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcdcff, 1.25);
    fill.position.set(-5, 3, 3);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe7ce, 1.1);
    rim.position.set(2, 4, -5);
    this.scene.add(rim);

    this.root = null;
    this.catalog = null;
    this.nodeMap = new Map();
    this.loadout = { hair: null, outfit: null, accessory: null, skin: 'skin-white' };
    this.clock = new THREE.Clock();
    this.mixer = null;
    this.initialCameraPosition = new THREE.Vector3();
    this.initialTarget = new THREE.Vector3();
    this.raf = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.animate();
  }

  get isVariantCatalog() {
    return Boolean(this.catalog?.schemaVersion >= 2 && this.catalog?.variants?.length);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  }

  animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.mixer?.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  clearModel() {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          Object.values(mat).forEach((value) => value?.isTexture && value.dispose?.());
          mat.dispose?.();
        });
      }
    });
    this.root = null;
    this.nodeMap.clear();
  }

  async loadFromUrl(modelUrl, catalogUrl = null) {
    const [catalog, gltf] = await Promise.all([
      catalogUrl ? fetch(catalogUrl, { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`Catalog HTTP ${r.status}`);
        return r.json();
      }) : Promise.resolve(null),
      new GLTFLoader().loadAsync(modelUrl),
    ]);
    this.install(gltf, catalog);
  }

  async loadFromFiles(modelFile, catalogFile = null) {
    const buffer = await modelFile.arrayBuffer();
    const catalog = catalogFile ? JSON.parse(await catalogFile.text()) : null;
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
    this.install(gltf, catalog);
  }

  install(gltf, catalog) {
    this.clearModel();
    this.catalog = normalizeCatalog(catalog, gltf.scene);
    this.root = gltf.scene;
    this.nodeMap.clear();
    this.root.traverse((obj) => {
      this.nodeMap.set(obj.name, obj);
      if (!obj.isMesh) return;
      obj.frustumCulled = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.filter(Boolean).forEach((mat) => {
        mat.side = THREE.FrontSide;
        mat.needsUpdate = true;
      });
    });
    this.scene.add(this.root);
    this.mixer = null;
    this.applyInitialVisibility();
    this.restoreLoadout();
    this.frameModel();
  }

  activeVariant() {
    return this.catalog?.variants?.find((variant) => variant.id === this.loadout.outfit) || null;
  }

  applyInitialVisibility() {
    if (!this.catalog) return;
    if (this.isVariantCatalog) {
      this.loadout.outfit = this.catalog.defaultOutfit || this.catalog.variants[0]?.id || null;
      this.loadout.hair = this.catalog.defaultHair || this.catalog.items.find((item) => item.slot === 'hair')?.id || null;
      this.loadout.accessory = null;
      this.applyVariantVisibility();
      this.setSkin(this.loadout.skin, false);
      return;
    }
    for (const slot of ['hair', 'outfit', 'accessory']) {
      const items = this.catalog.items.filter((item) => item.slot === slot);
      for (const item of items) this.setItemVisible(item, Boolean(item.defaultVisible));
      const selected = items.find((item) => item.defaultVisible) || items[0] || null;
      if (selected) {
        this.loadout[slot] = selected.id;
        this.select(slot, selected.id, false);
      }
    }
    this.setSkin(this.loadout.skin, false);
  }

  setNodeTreeVisible(node, visible) {
    if (!node) return;
    node.visible = visible;
  }

  applyVariantVisibility() {
    if (!this.isVariantCatalog) return;
    const active = this.activeVariant();
    for (const variant of this.catalog.variants) {
      const root = this.nodeMap.get(variant.rootNode);
      this.setNodeTreeVisible(root, variant.id === active?.id);
    }
    if (!active?.hairEnabled) return;
    const hairs = this.catalog.items.filter((item) => item.slot === 'hair');
    for (const hair of hairs) {
      const nodeNames = hair.variantNodeNames?.[active.id] || [];
      for (const name of nodeNames) this.setNodeTreeVisible(this.nodeMap.get(name), hair.id === this.loadout.hair);
    }
  }

  setItemVisible(item, visible) {
    for (const name of item.objectNames || []) {
      const node = this.nodeMap.get(name);
      if (node) node.visible = visible;
    }
  }

  select(slot, id, persist = true) {
    if (!this.catalog) return;
    const slotItems = this.catalog.items.filter((item) => item.slot === slot);
    if (!slotItems.some((item) => item.id === id)) return;

    if (this.isVariantCatalog && slot === 'outfit') {
      this.loadout.outfit = id;
      this.applyVariantVisibility();
      this.frameModel(false);
    } else if (this.isVariantCatalog && slot === 'hair') {
      this.loadout.hair = id;
      this.applyVariantVisibility();
    } else {
      for (const item of slotItems) this.setItemVisible(item, item.id === id);
      this.loadout[slot] = id;
    }
    if (persist) this.saveLoadout();
  }

  setSkin(id, persist = true) {
    const swatch = this.catalog?.skinColors?.find((x) => x.id === id) || this.catalog?.skinColors?.[0];
    if (!swatch) return;
    const color = new THREE.Color(swatch.hex);
    let changed = 0;
    this.root?.traverse((obj) => {
      if (!obj.isMesh || obj.userData?.tappie_skin_target !== true) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials.filter(Boolean)) {
        if (!mat.color) continue;
        mat.color.copy(color);
        mat.needsUpdate = true;
        changed += 1;
      }
    });
    this.loadout.skin = id;
    this.lastSkinMaterialCount = changed;
    if (persist) this.saveLoadout();
  }

  saveLoadout() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.loadout));
  }

  restoreLoadout() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      if (saved.outfit && this.catalog.items.some((item) => item.slot === 'outfit' && item.id === saved.outfit)) this.loadout.outfit = saved.outfit;
      if (saved.hair && this.catalog.items.some((item) => item.slot === 'hair' && item.id === saved.hair)) this.loadout.hair = saved.hair;
      this.applyVariantVisibility();
      if (saved.skin) this.setSkin(saved.skin, false);
      this.loadout = { ...this.loadout, ...saved };
    } catch (error) {
      console.warn('[Chibiz3D] Invalid saved loadout', error);
    }
  }

  visibleBox() {
    const box = new THREE.Box3();
    let hasVisibleMesh = false;
    this.root?.traverse((obj) => {
      if (!obj.isMesh || !obj.visible) return;
      let parent = obj.parent;
      while (parent) {
        if (!parent.visible) return;
        parent = parent.parent;
      }
      box.expandByObject(obj);
      hasVisibleMesh = true;
    });
    return hasVisibleMesh ? box : new THREE.Box3().setFromObject(this.root);
  }

  frameModel(saveInitial = true) {
    if (!this.root) return;
    const box = this.visibleBox();
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = Math.max(sphere.radius, 0.1);
    this.controls.target.copy(center);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (radius / Math.sin(fov / 2)) * (this.compact ? 0.88 : 1.03);
    this.camera.position.set(center.x + radius * 0.03, center.y + radius * 0.02, center.z + distance);
    this.camera.near = Math.max(distance / 100, 0.01);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = radius * 0.8;
    this.controls.maxDistance = radius * 5;
    this.controls.update();
    if (saveInitial) {
      this.initialCameraPosition.copy(this.camera.position);
      this.initialTarget.copy(this.controls.target);
    }
  }

  resetView() {
    if (!this.root) return;
    if (!this.initialCameraPosition.lengthSq()) this.frameModel(true);
    this.camera.position.copy(this.initialCameraPosition);
    this.controls.target.copy(this.initialTarget);
    this.controls.update();
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

function normalizeCatalog(catalog, scene) {
  if (catalog?.items?.length) return catalog;
  const groups = new Map();
  scene.traverse((obj) => {
    const slot = obj.userData?.tappie_slot;
    const assetId = obj.userData?.tappie_asset_id;
    if (!slot || !assetId) return;
    const key = `${slot}:${assetId}`;
    if (!groups.has(key)) groups.set(key, { id: assetId, slot, name: assetId, objectNames: [], defaultVisible: false });
    const group = groups.get(key);
    group.objectNames.push(obj.name);
    group.defaultVisible ||= Boolean(obj.userData?.tappie_default_visible);
  });
  return {
    schemaVersion: 1,
    source: 'GLB embedded metadata',
    skinColors: [
      { id: 'skin-white', name: '自然膚色', hex: '#E79D83' },
      { id: 'skin-brown', name: '棕色膚色', hex: '#815647' },
      { id: 'skin-black', name: '深色膚色', hex: '#39251C' },
    ],
    items: [...groups.values()],
  };
}

const state = {
  mainViewer: null,
  studioViewer: null,
  activeSlot: 'hair',
  modelFile: null,
  catalogFile: null,
  loaded: false,
};

function studioMarkup() {
  return `
    <div class="chibiz3d-overlay" id="chibiz3d-overlay" aria-hidden="true">
      <section class="chibiz3d-studio" role="dialog" aria-modal="true" aria-label="Chibiz 3D 角色工作室">
        <header class="chibiz3d-header">
          <div class="chibiz3d-title-wrap">
            <div class="chibiz3d-kicker">Tappie Avatar System · Fixed Visual Preview</div>
            <div class="chibiz3d-title">Chibiz 3D 角色工作室</div>
            <div class="chibiz3d-subtitle">已套用原廠身體遮罩、固定站姿與帽子相容規則</div>
          </div>
          <button class="chibiz3d-icon-btn" id="chibiz3d-close" type="button" aria-label="關閉">×</button>
        </header>
        <div class="chibiz3d-main">
          <div class="chibiz3d-stage-card">
            <div class="chibiz3d-stage" id="chibiz3d-stage"></div>
            <div class="chibiz3d-stage-hint"><span>拖曳旋轉 · 滾輪或雙指縮放</span><button id="chibiz3d-reset-view" type="button">回到正面</button></div>
            <div class="chibiz3d-status" id="chibiz3d-status">
              <strong>等待 Chibiz 網頁模型</strong>
              <p>請使用本 ZIP 內的固定視覺模型，或自行選擇相容的 GLB 與 Catalog。</p>
              <label class="chibiz3d-file-label">選擇 GLB 與 Catalog<input id="chibiz3d-file-input" type="file" accept=".glb,.json" multiple></label>
            </div>
          </div>
          <div class="chibiz3d-control-card">
            <div class="chibiz3d-tabs" id="chibiz3d-tabs"></div>
            <div class="chibiz3d-meta" id="chibiz3d-meta">尚未載入模型。</div>
            <div class="chibiz3d-items" id="chibiz3d-items"></div>
          </div>
        </div>
        <footer class="chibiz3d-footer">
          <button class="chibiz3d-button secondary" id="chibiz3d-export-json" type="button">匯出造型 JSON</button>
          <button class="chibiz3d-button secondary" id="chibiz3d-reset" type="button">恢復預設</button>
          <button class="chibiz3d-button primary" id="chibiz3d-save" type="button">儲存造型</button>
        </footer>
      </section>
    </div>
    <div class="chibiz3d-toast" id="chibiz3d-toast"></div>`;
}

function ensureUi() {
  if (!document.getElementById('chibiz3d-overlay')) document.body.insertAdjacentHTML('beforeend', studioMarkup());
  const stage = document.getElementById('chibiz3d-stage');
  if (!state.studioViewer) state.studioViewer = new ChibizViewer(stage);
  document.getElementById('chibiz3d-close').onclick = closeStudio;
  document.getElementById('chibiz3d-reset-view').onclick = () => state.studioViewer?.resetView();
  document.getElementById('chibiz3d-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'chibiz3d-overlay') closeStudio();
  });
  document.getElementById('chibiz3d-file-input').onchange = handleFiles;
  document.getElementById('chibiz3d-save').onclick = () => {
    state.studioViewer?.saveLoadout();
    syncMainLoadout();
    toast('造型已儲存在這台裝置');
  };
  document.getElementById('chibiz3d-reset').onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    state.studioViewer?.applyInitialVisibility();
    state.studioViewer?.frameModel(true);
    renderItems();
    syncMainLoadout();
    toast('已恢復預設造型');
  };
  document.getElementById('chibiz3d-export-json').onclick = exportLoadoutJson;
  renderTabs();
}

function renderTabs() {
  const tabs = document.getElementById('chibiz3d-tabs');
  if (!tabs) return;
  const available = ['hair', 'outfit', 'accessory', 'skin'];
  tabs.innerHTML = available.map((slot) => `<button class="chibiz3d-tab ${state.activeSlot === slot ? 'is-active' : ''}" data-slot="${slot}">${SLOT_LABELS[slot]}</button>`).join('');
  tabs.querySelectorAll('button').forEach((button) => {
    button.onclick = () => {
      state.activeSlot = button.dataset.slot;
      renderTabs();
      renderItems();
    };
  });
}

function renderItems() {
  const itemsEl = document.getElementById('chibiz3d-items');
  const meta = document.getElementById('chibiz3d-meta');
  if (!itemsEl || !meta) return;
  const viewer = state.studioViewer;
  const catalog = viewer?.catalog;
  if (!catalog) {
    itemsEl.innerHTML = '';
    meta.textContent = '尚未載入模型。';
    return;
  }
  if (state.activeSlot === 'skin') {
    const skins = catalog.skinColors || [];
    meta.textContent = `原廠提供 ${skins.length} 種膚色；目前已鎖定 ${viewer.lastSkinMaterialCount ?? 0} 個身體材質。`;
    itemsEl.innerHTML = skins.map((item) => `
      <button class="chibiz3d-item ${viewer.loadout.skin === item.id ? 'is-selected' : ''}" data-skin="${item.id}">
        <span class="chibiz3d-swatch"><span class="chibiz3d-swatch-dot" style="background:${item.hex}"></span><span><span class="chibiz3d-item-name">${escapeHtml(item.name)}</span><span class="chibiz3d-item-code">${item.hex}</span></span></span>
      </button>`).join('');
    itemsEl.querySelectorAll('[data-skin]').forEach((button) => {
      button.onclick = () => {
        viewer.setSkin(button.dataset.skin);
        renderItems();
      };
    });
    return;
  }

  if (state.activeSlot === 'hair' && viewer.isVariantCatalog && viewer.activeVariant()?.hairEnabled === false) {
    meta.textContent = viewer.activeVariant()?.note || '目前服裝使用固定帽子造型，髮型已停用以避免穿模。';
    itemsEl.innerHTML = `<div class="chibiz3d-compat-note"><strong>髮型固定</strong><span>切回一般服裝後，會自動恢復你原本選擇的髮型。</span></div>`;
    return;
  }

  const items = catalog.items.filter((item) => item.slot === state.activeSlot);
  meta.textContent = items.length ? `目前提供 ${items.length} 組${SLOT_LABELS[state.activeSlot]}。` : `這一階段尚未加入${SLOT_LABELS[state.activeSlot]}。`;
  itemsEl.innerHTML = items.map((item) => `
    <button class="chibiz3d-item ${viewer.loadout[state.activeSlot] === item.id ? 'is-selected' : ''}" data-item="${escapeAttr(item.id)}">
      <span class="chibiz3d-item-name">${escapeHtml(item.name)}</span>
      <span class="chibiz3d-item-code">${escapeHtml(item.note || item.id)}</span>
    </button>`).join('');
  itemsEl.querySelectorAll('[data-item]').forEach((button) => {
    button.onclick = () => {
      viewer.select(state.activeSlot, button.dataset.item);
      renderItems();
    };
  });
}

async function handleFiles(event) {
  const files = [...event.target.files];
  const model = files.find((file) => /\.glb$/i.test(file.name));
  const catalog = files.find((file) => /\.json$/i.test(file.name));
  if (!model) return toast('請至少選擇一個 .glb 模型');
  setStatus('正在解析 Chibiz GLB…', true);
  try {
    await state.studioViewer.loadFromFiles(model, catalog || null);
    state.modelFile = model;
    state.catalogFile = catalog || null;
    state.loaded = true;
    setStatus('', false);
    renderItems();
    await loadMainFromFiles();
    toast(`已載入 ${model.name}`);
  } catch (error) {
    console.error(error);
    setStatus(`模型載入失敗：${error.message}`, true);
  }
}

function setStatus(message, show) {
  const el = document.getElementById('chibiz3d-status');
  if (!el) return;
  if (show && message) el.innerHTML = `<strong>處理中</strong><p>${escapeHtml(message)}</p>`;
  el.hidden = !show;
}

async function tryDefaultAssets() {
  ensureUi();
  try {
    await state.studioViewer.loadFromUrl(DEFAULT_MODEL_URL, DEFAULT_CATALOG_URL);
    state.loaded = true;
    setStatus('', false);
    renderItems();
    await loadMainFromUrl();
  } catch (error) {
    console.info('[Chibiz3D] Default generated assets are not present yet:', error.message);
    setStatus('', true);
  }
}

function mountMainViewer() {
  const host = document.getElementById('challenge-hub-main-avatar');
  if (!host) return false;
  host.classList.add('is-chibiz3d');
  host.innerHTML = `<div class="chibiz3d-main-mount" id="chibiz3d-main-mount"><div class="chibiz3d-main-badge">CHIBIZ 3D · FIXED PREVIEW</div></div>`;
  state.mainViewer?.resizeObserver?.disconnect();
  state.mainViewer = new ChibizViewer(document.getElementById('chibiz3d-main-mount'), { compact: true });
  if (state.modelFile) loadMainFromFiles();
  else if (state.loaded) loadMainFromUrl();
  return true;
}

async function loadMainFromFiles() {
  if (!state.mainViewer || !state.modelFile) return;
  await state.mainViewer.loadFromFiles(state.modelFile, state.catalogFile);
  syncMainLoadout();
}

async function loadMainFromUrl() {
  if (!state.mainViewer) return;
  try {
    await state.mainViewer.loadFromUrl(DEFAULT_MODEL_URL, DEFAULT_CATALOG_URL);
    syncMainLoadout();
  } catch (error) {
    console.info('[Chibiz3D] Main model waiting for generated asset:', error.message);
  }
}

function syncMainLoadout() {
  if (!state.mainViewer || !state.studioViewer?.catalog) return;
  if (state.studioViewer.loadout.outfit) state.mainViewer.select('outfit', state.studioViewer.loadout.outfit, false);
  if (state.studioViewer.loadout.hair) state.mainViewer.select('hair', state.studioViewer.loadout.hair, false);
  state.mainViewer.setSkin(state.studioViewer.loadout.skin, false);
}

function openStudio() {
  ensureUi();
  const overlay = document.getElementById('chibiz3d-overlay');
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  state.studioViewer.resize();
}

function closeStudio() {
  const overlay = document.getElementById('chibiz3d-overlay');
  overlay?.classList.remove('is-open');
  overlay?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function exportLoadoutJson() {
  if (!state.studioViewer) return;
  const payload = {
    schemaVersion: 2,
    provider: 'threedee-chibiz',
    baseModel: 'male',
    modelProfile: state.studioViewer.catalog?.profile || null,
    ...state.studioViewer.loadout,
    savedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tappie-chibiz-loadout-v2.json';
  a.click();
  URL.revokeObjectURL(url);
}

function toast(message) {
  const el = document.getElementById('chibiz3d-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('is-show'), 2100);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }

function installChallengeHubHooks() {
  const originalRenderMain = window.challengeHubRenderMain;
  if (typeof originalRenderMain === 'function') {
    window.challengeHubRenderMain = function (...args) {
      const result = originalRenderMain.apply(this, args);
      queueMicrotask(mountMainViewer);
      return result;
    };
  }
  window.challengeHubOpenWardrobe = openStudio;
  const wardrobeButton = document.querySelector('.challenge-hub-utility-button.is-wardrobe');
  if (wardrobeButton) wardrobeButton.onclick = openStudio;
  const observer = new MutationObserver(() => {
    const host = document.getElementById('challenge-hub-main-avatar');
    if (host && !host.querySelector('.chibiz3d-main-mount')) mountMainViewer();
  });
  const hub = document.getElementById('challenge-hub-screen');
  if (hub) observer.observe(hub, { childList: true, subtree: true });
  setTimeout(mountMainViewer, 0);
}

async function boot() {
  ensureUi();
  installChallengeHubHooks();
  await tryDefaultAssets();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();

window.TappieChibiz3D = { open: openStudio, close: closeStudio, state };
