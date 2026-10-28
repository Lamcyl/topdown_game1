// Valley visual designs: renders the real puzzle level (logic.js) in 3D in three candidate styles, with the flow running.
// Reference art for the Godot build; the shapes and palettes here are what we'd model there.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- styles
const STYLES = {
  quiet: {
    name: 'Quiet Kingdom', short: 'Quiet', blurb: 'Soft daylight, round lollipop oaks, pale stone and honey-coloured wood. Calm and readable: the orbs are the brightest thing on screen.',
    sky: '#cfe3ee', fog: ['#cfe3ee', 40, 95], grass: ['#a3c97a', '#9ac173', '#aed083'], under: '#6f8f52', leaves: ['#6fa552', '#7fb65c', '#639a4c', '#88bd63'],
    trunk: '#7a5a3c', stone: '#d8d0c0', stoneDark: '#a99f8c', wood: '#b48552', woodDark: '#7d5838', iron: '#4a4650', water: '#6fb4dc', roof: '#b4553f',
    tree: 'round', flat: false, sun: ['#fff4e0', 2.4, [-14, 26, 12]], hemi: ['#eef6ff', '#6f8a52', 1.15], exposure: 1.0,
  },
  wood: {
    name: 'Storybook Woodland', short: 'Storybook', blurb: 'Deeper greens and tall layered firs with a few birches; faceted, papercraft shading and cool morning light. Feels like an old illustrated map.',
    sky: '#b9cfd6', fog: ['#b9cfd6', 36, 88], grass: ['#7fa860', '#77a05a', '#88b068'], under: '#3f5f3a', leaves: ['#3f7a4a', '#4a8752', '#356b40', '#5b9a5a'],
    trunk: '#5e4532', stone: '#c9c3b6', stoneDark: '#8f8a80', wood: '#9c7048', woodDark: '#5f4330', iron: '#3c3a44', water: '#4f95b8', roof: '#5b6f8a',
    tree: 'pine', flat: true, sun: ['#f2f6ff', 2.1, [12, 24, 14]], hemi: ['#e6f0ff', '#3c5a3a', 1.0], exposure: 1.0,
  },
  autumn: {
    name: 'Autumn Hearth', short: 'Autumn', blurb: 'Golden low sun and long shadows; copper, amber and crimson canopies in soft clusters. Warm and cosy, with the fire orbs feeling at home.',
    sky: '#f2d3a8', fog: ['#f0cfa2', 38, 92], grass: ['#9fb06a', '#a7b672', '#97a964'], under: '#6f6a3e', leaves: ['#d9822b', '#e3a53a', '#c4572a', '#b8892e', '#cf6a33'],
    trunk: '#5e4030', stone: '#dccbb0', stoneDark: '#a8957a', wood: '#a8683c', woodDark: '#6e4328', iron: '#47403f', water: '#5f9fc2', roof: '#7a3b2e',
    tree: 'blob', flat: false, sun: ['#ffd9a0', 2.6, [-22, 14, 6]], hemi: ['#ffe9cc', '#7a5a35', 0.95], exposure: 1.05,
  },
};
const ORB_COL = { fire: '#ff7a33', water: '#3d9be8', earth: '#c08a4a', air: '#d6f0fa', steam: '#e8eef4', magma: '#ff4a1a', mud: '#8a6a40', lightning: '#ffe04b', ice: '#a6ecff', dust: '#d9c08a' };

// ---------------------------------------------------------------- the level state on show: fire + water run with the Sluice, Forge Door and Oak Narrows built
function showcase() {
  const st = newState();
  Object.assign(st.done, { A: true, B: true });
  st.unlocked.push('water');
  st.inv = { splitter: 1, joiner: 0, mixer: 1, demerger: 1, underpass: 1, wellspring: 2 };
  const U = 0, R = 1, D = 2, L = 3;
  const put = (t, x, y, d, e) => { const why = place(st, t, x, y, d, e); if (why) console.warn(t, x, y, why); };
  const col = (x, y0, y1, d) => { for (let y = y0; y >= y1; y--) put('belt', x, y, d); };
  const row = (y, x0, x1, d) => { const s = x1 >= x0 ? 1 : -1; for (let x = x0; s > 0 ? x <= x1 : x >= x1; x += s) put('belt', x, y, d); };
  put('wellspring', 11, 32, U, 'fire'); put('wellspring', 15, 32, U, 'water');
  put('belt', 11, 31, R); col(12, 31, 15, U); row(14, 12, 10, L);
  put('belt', 15, 31, L); col(14, 31, 16, U); put('splitter', 14, 15, U);
  col(15, 15, 12, U); row(11, 15, 16, R);
  put('belt', 13, 15, U); put('belt', 13, 14, U); row(13, 13, 10, L); put('belt', 9, 13, D);
  startRun(st); for (let i = 0; i < 70; i++) step(st);           // the sluice rises
  st.done.D = true;                                               // the forge door already opened in an earlier session
  put('mixer', 9, 14, L); put('belt', 8, 14, L); row(14, 7, 4, L); put('belt', 3, 14, U); col(3, 13, 7, U);
  put('demerger', 3, 6, U); col(2, 6, 4, U); row(3, 2, 5, R);
  put('belt', 4, 6, U); put('belt', 4, 5, U); placeUnderpass(st, 4, 4, 4, 2); row(1, 4, 2, L);
  for (let i = 0; i < 160; i++) step(st);
  return st;
}

// ---------------------------------------------------------------- renderer, camera, controls
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const cam = { tx: 13.5, tz: 22, dist: 26, want: null }; // target on the ground; fixed pitch, no rotation
const PITCH = THREE.MathUtils.degToRad(56);
function placeCamera() {
  camera.position.set(cam.tx, Math.sin(PITCH) * cam.dist, cam.tz + Math.cos(PITCH) * cam.dist);
  camera.lookAt(cam.tx, 0, cam.tz);
}
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
const pointers = new Map(); let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { renderer.domElement.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, tx: cam.tx, tz: cam.tz, d: pinchDist(), dist: cam.dist }; cam.want = null; });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size >= 2 && drag.d) { cam.dist = THREE.MathUtils.clamp(drag.dist * drag.d / pinchDist(), 8, 62); return; }
  const k = cam.dist / view.clientHeight * 0.8;
  cam.tx = THREE.MathUtils.clamp(drag.tx - (e.clientX - drag.x) * k, 0, W); cam.tz = THREE.MathUtils.clamp(drag.tz - (e.clientY - drag.y) * k / Math.sin(PITCH), 0, H);
});
const up = (e) => { pointers.delete(e.pointerId); if (pointers.size) { const [p] = pointers.values(); drag = { x: p[0], y: p[1], tx: cam.tx, tz: cam.tz, d: 0, dist: cam.dist }; } };
renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', up);
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 8, 62); cam.want = null; }, { passive: false });
function pinchDist() { if (pointers.size < 2) return 0; const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }

const VIEWS = [
  { name: 'Oak Narrows', tx: 4.6, tz: 5, dist: 13.5, note: 'The crossing puzzle: steam squeezes between the oaks, the Demerger splits it, and water tunnels under the fire line through an Underpass.' },
  { name: 'Mill Sluice', tx: 11, tz: 13.5, dist: 15, note: 'Water is split: half keeps the mill portcullis raised, half meets fire in the cauldron Mixer to make steam for the forge.' },
  { name: 'Spring Meadow', tx: 13.5, tz: 28.5, dist: 14, note: 'The start: two wellsprings in their stone fonts, belts heading north through the opened village gate.' },
  { name: 'Valley', tx: 13.5, tz: 16, dist: 56, note: 'The whole valley: clearings divided by woods, the river to the east, the castle green in the north-east.' },
];
let viewIdx = 0;

// ---------------------------------------------------------------- shared helpers
const C = (hex) => new THREE.Color(hex);
const tiles = (x, y) => new THREE.Vector3(x + 0.5, 0, y + 0.5);
function mat(hex, opts = {}) { return new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.85, metalness: 0, flatShading: !!opts.flat, ...opts.extra }); }
function shadow(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();
function beltTexture() { // chevrons pointing along +v, scrolled to show flow
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#3a2c20'; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(240,215,160,.55)'; g.lineWidth = 7; g.lineJoin = 'round';
  for (const y of [40, 104]) { g.beginPath(); g.moveTo(14, y); g.lineTo(32, y - 18); g.lineTo(50, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BELT_TEX = beltTexture();
function waterTexture(hex) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = hex; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const y = i * 22 + 6, x = (i * 23) % 40; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 5, x + 20, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function label(text) {
  const c = document.createElement('canvas'); const g = c.getContext('2d'); const f = '600 40px Cinzel, Georgia, serif';
  g.font = f; const w = Math.ceil(g.measureText(text).width) + 40; c.width = w; c.height = 64;
  g.font = f; g.fillStyle = 'rgba(25,20,30,.62)'; g.beginPath(); g.roundRect(0, 4, w, 56, 28); g.fill();
  g.fillStyle = '#fff6df'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(w / 64 * 0.55, 0.55, 1); s.renderOrder = 10; return s;
}
const noise = (x, y, k = 0) => { const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- scene building
let world = null, S = null, st = null, dyn = null;
const orbGeo = new THREE.SphereGeometry(0.13, 18, 12);
function build(styleKey) {
  S = STYLES[styleKey];
  if (world) { scene.remove(world); world.traverse((o) => { if (o.geometry && o.geometry !== orbGeo) o.geometry.dispose(); }); }
  world = new THREE.Group(); scene.add(world);
  dyn = { belts: [], gates: [], rings: [], orbs: new Map(), river: null, wheel: null, spin: [] };
  scene.background = C(S.sky); scene.fog = new THREE.Fog(C(S.fog[0]), S.fog[1], S.fog[2]);
  renderer.toneMappingExposure = S.exposure;
  // light
  const hemi = new THREE.HemisphereLight(C(S.hemi[0]), C(S.hemi[1]), S.hemi[2]); world.add(hemi);
  const sun = new THREE.DirectionalLight(C(S.sun[0]), S.sun[1]);
  sun.position.set(13.5 + S.sun[2][0], S.sun[2][1], 17 + S.sun[2][2]); sun.target.position.set(13.5, 0, 17);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
  world.add(sun, sun.target);
  // ground: forest floor, then rounded meadow tiles with thin seams
  const under = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, H + 30), mat(S.under)); under.rotation.x = -Math.PI / 2; under.position.set(W / 2, -0.12, H / 2); under.receiveShadow = true; world.add(under);
  const meadow = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ('.SB'.includes(GRID[y][x])) meadow.push([x, y]);
  const tileGeo = new RoundedBoxGeometry(0.97, 0.16, 0.97, 2, 0.05);
  const tileMesh = new THREE.InstancedMesh(tileGeo, mat('#ffffff', { flat: S.flat }), meadow.length);
  const m4 = new THREE.Matrix4();
  meadow.forEach(([x, y], i) => { m4.makeTranslation(x + 0.5, -0.08, y + 0.5); tileMesh.setMatrixAt(i, m4); tileMesh.setColorAt(i, C(S.grass[Math.floor(noise(x, y) * S.grass.length)])); });
  tileMesh.receiveShadow = true; world.add(tileMesh);
  buildTrees();
  buildRiver();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (GRID[y][x] === 'S') world.add(springSpot(x, y));
  for (const o of OBJECTIVES) { buildGate(o); o.receptors.forEach((r, i) => world.add(receptor(o, r, i))); }
  for (const p of Object.values(st.pieces)) { const g = piece(p); if (g) world.add(g); }
  for (const [name, x, y] of [['Spring Meadow', 13.5, 30.6], ['Ember Glade', 13.5, 21.5], ['Mill Pond', 13, 15.8], ['Forge Yard', 4.5, 15.8], ['Oak Narrows', 3.6, 0.6], ['Standing Stones', 12, 6.4], ['The River', 21.5, 9.6], ['Castle Green', 22, 5], ['Shrine', 21.5, 22.7]]) {
    const s = label(name); s.position.set(x, 1.6, y); world.add(s);
  }
}
function buildTrees() {
  const spots = [];
  for (let y = -4; y < H + 4; y++) for (let x = -4; x < W + 4; x++) {
    const inside = x >= 0 && y >= 0 && x < W && y < H;
    if (inside && GRID[y][x] !== '#') continue;
    if (!inside && noise(x, y, 3) < 0.25) continue;
    // readability: a tree standing just in front of (south of) a goal or gate is kept low, so the fixed camera can see past it
    const shields = inside && y > 0 && (RECEPTOR.has(idx(x, y - 1)) || BARRIER.has(idx(x, y - 1)));
    spots.push([x + 0.5 + (noise(x, y, 1) - 0.5) * 0.3, y + 0.5 + (noise(x, y, 2) - 0.5) * 0.3, (0.8 + noise(x, y, 4) * 0.45) * (shields ? 0.5 : 1), noise(x, y, 5)]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.6, 7); trunkGeo.translate(0, 0.3, 0);
  const parts = [];
  if (S.tree === 'round') parts.push([new THREE.IcosahedronGeometry(0.42, 2), [0, 0.85, 0], 1], [new THREE.IcosahedronGeometry(0.26, 2), [0.18, 1.12, 0.05], 1.08]);
  if (S.tree === 'pine') parts.push([new THREE.ConeGeometry(0.42, 0.6, 7), [0, 0.65, 0], 1], [new THREE.ConeGeometry(0.33, 0.55, 7), [0, 0.98, 0], 1.06], [new THREE.ConeGeometry(0.22, 0.48, 7), [0, 1.28, 0], 1.12]);
  if (S.tree === 'blob') parts.push([new THREE.IcosahedronGeometry(0.33, 1), [-0.13, 0.78, 0.05], 1], [new THREE.IcosahedronGeometry(0.3, 1), [0.16, 0.86, -0.06], 1.06], [new THREE.IcosahedronGeometry(0.27, 1), [0, 1.08, 0.04], 1.12]);
  const trunks = new THREE.InstancedMesh(trunkGeo, mat(S.trunk, { flat: S.flat }), spots.length);
  const crowns = parts.map(([g]) => new THREE.InstancedMesh(g, mat('#ffffff', { flat: S.flat || S.tree !== 'round' }), spots.length));
  const birch = S.tree === 'pine' ? new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 1), mat('#9fbf62', { flat: true }), spots.length) : null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach(([x, z, s, n], i) => {
    e.set(0, n * Math.PI * 2, 0); q.setFromEuler(e);
    const isBirch = birch && n > 0.82;
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (isBirch ? 1.3 : 1), s)); trunks.setMatrixAt(i, m4);
    trunks.setColorAt(i, isBirch ? C('#e8e2d6') : C(S.trunk));
    const leaf = C(S.leaves[Math.floor(n * 997) % S.leaves.length]);
    parts.forEach(([, off, shade], k) => {
      const v = new THREE.Vector3(...off).applyQuaternion(q).multiplyScalar(s);
      m4.compose(new THREE.Vector3(x + v.x, v.y, z + v.z), q, new THREE.Vector3(s, s, s));
      if (isBirch) m4.makeScale(0, 0, 0);
      crowns[k].setMatrixAt(i, m4); crowns[k].setColorAt(i, leaf.clone().multiplyScalar(shade));
    });
    if (birch) { m4.compose(new THREE.Vector3(x, isBirch ? 1.05 * s : 0, z), q, isBirch ? new THREE.Vector3(s, s * 1.3, s) : new THREE.Vector3(0, 0, 0)); birch.setMatrixAt(i, m4); }
  });
  for (const m of [trunks, ...crowns, birch].filter(Boolean)) { m.castShadow = true; m.receiveShadow = true; world.add(m); }
}
function buildRiver() {
  const xs = RIVER.map(([x]) => x), ys = RIVER.map(([, y]) => y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 9; // the stream runs on through the woods
  const tex = waterTexture(S.water); tex.repeat.set(1, (y1 - y0) / 2);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92 }));
  water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, -0.06, (y0 + y1) / 2); water.receiveShadow = true;
  world.add(water); dyn.river = tex;
  const bank = mat(S.stoneDark, { flat: true });
  for (let y = y0; y < y1; y += 0.5) for (const x of [x0 - 0.05, x1 + 0.05]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + noise(x, y) * 0.08, 0), bank); r.position.set(x, -0.02, y + noise(y, x) * 0.4); world.add(shadow(r));
  }
}
function springSpot(x, y) {
  const g = new THREE.Group(); g.position.copy(tiles(x, y));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.08, 10, 28), mat(S.stone)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.33, 24), new THREE.MeshStandardMaterial({ color: C(S.water), roughness: 0.2 })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.02; g.add(pool);
  return shadow(g);
}
// Gates: wooden double gates for doors, a stone gatehouse with a portcullis for the held sluice.
function buildGate(o) {
  if (!o.barrier.length || o.kind === 'bridge') { if (o.kind === 'bridge') buildBridge(o); return; }
  const xs = o.barrier.map(([x]) => x), ys = o.barrier.map(([, y]) => y);
  const horiz = new Set(ys).size === 1, n = o.barrier.length;
  const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, cz = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
  const g = new THREE.Group(); g.position.set(cx, 0, cz); if (!horiz) g.rotation.y = Math.PI / 2;
  const half = n / 2;
  if (o.kind === 'held') {
    for (const s of [-1, 1]) { const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 1.7, 10), mat(S.stone)); tower.position.set(s * (half + 0.2), 0.85, 0); g.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 10), mat(S.roof)); cap.position.set(s * (half + 0.2), 1.95, 0); g.add(cap); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(n + 0.6, 0.35, 0.5), mat(S.stone)); lintel.position.y = 1.5; g.add(lintel);
    const port = new THREE.Group();
    for (let i = 0; i <= n * 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.06), mat(S.iron)); b.position.set(-half + i / 3, 0.62, 0); port.add(b); }
    for (const h of [0.3, 0.75, 1.15]) { const b = new THREE.Mesh(new THREE.BoxGeometry(n, 0.05, 0.06), mat(S.iron)); b.position.y = h; port.add(b); }
    g.add(port); dyn.gates.push({ o, port, kind: 'held', t: 0 });
  } else {
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.25, 0.26), mat(S.stone, { flat: true })); post.position.set(s * (half + 0.05), 0.62, 0); g.add(post); }
    const leaves = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(s * half, 0, 0);
      const leaf = new THREE.Mesh(new RoundedBoxGeometry(half, 0.95, 0.1, 2, 0.03), mat(S.wood)); leaf.position.set(-s * half / 2, 0.52, 0); hinge.add(leaf);
      for (const h of [0.25, 0.8]) { const strap = new THREE.Mesh(new THREE.BoxGeometry(half * 0.9, 0.06, 0.12), mat(S.iron)); strap.position.set(-s * half / 2, h, 0); hinge.add(strap); }
      g.add(hinge); leaves.push([hinge, s]);
    }
    const r = o.receptors[0]; const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshStandardMaterial({ color: C(ORB_COL[r.els[0]]), emissive: C(ORB_COL[r.els[0]]), emissiveIntensity: 0.8 })); gem.position.set(0, 1.18, 0); g.add(gem);
    dyn.gates.push({ o, leaves, gem, kind: 'door', t: 0 });
  }
  world.add(shadow(g));
}
function buildBridge(o) {
  const g = new THREE.Group();
  const xs = RIVER.map(([x]) => x), ys = RIVER.map(([, y]) => y);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(xs.length ? Math.max(...xs) - Math.min(...xs) + 1.4 : 2, 0.08, 0.9), mat(noise(y, 1) > 0.5 ? S.wood : S.woodDark, { flat: true }));
    plank.position.set((Math.min(...xs) + Math.max(...xs) + 1) / 2, 0.02, y + 0.5); g.add(plank);
  }
  world.add(shadow(g)); dyn.gates.push({ o, bridge: g, kind: 'bridge', t: 0 });
}
// Receptors: braziers for fire, basins for water, a forge for steam, standing stones for the rune lock, crucibles at the castle.
function receptor(o, r, i) {
  const g = new THREE.Group(); g.position.copy(tiles(r.x, r.y));
  const el = r.els[0], glowCol = C(ORB_COL[el]);
  const stone = mat(S.stone), dark = mat(S.stoneDark, { flat: true }), iron = mat(S.iron);
  let top = 0.7;
  if (o.kind === 'rune') {
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7 + noise(k, 3) * 0.3, 0.1), dark); m.position.set(Math.cos(a) * 0.42, 0.38, Math.sin(a) * 0.42); m.rotation.y = -a; g.add(m); }
    top = 0.35;
  } else if (o.kind === 'bridge') {
    for (const [lx, lz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.07), mat(S.woodDark)); leg.position.set(lx, 0.4, lz); g.add(leg); }
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.22, 0.4, 4, 1, true), mat(S.wood, { flat: true, extra: { side: THREE.DoubleSide } })); hopper.position.y = 0.95; hopper.rotation.y = Math.PI / 4; g.add(hopper);
    top = 0.95;
  } else if (el === 'water' || el === 'mud') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.35, 12), stone); base.position.y = 0.17; g.add(base);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.26, 0.22, 16), stone); bowl.position.y = 0.45; g.add(bowl);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.33, 20), new THREE.MeshStandardMaterial({ color: glowCol, roughness: 0.2 })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.565; g.add(pool);
    top = 0.68;
  } else if (el === 'steam') {
    const forge = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.6, 0.8, 2, 0.06), dark); forge.position.y = 0.3; g.add(forge);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.9, 8), stone); chim.position.set(0.22, 0.95, -0.22); g.add(chim);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: '#ffb070', emissive: '#ff7a33', emissiveIntensity: 1.2 })); mouth.position.set(0, 0.3, 0.41); g.add(mouth);
    top = 0.85;
  } else if (o.kind === 'shrine') {
    const altar = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.4, 0.5, 2, 0.05), stone); altar.position.y = 0.2; g.add(altar);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: glowCol, emissive: glowCol, emissiveIntensity: 0.6, flatShading: true })); crystal.position.y = 0.65; crystal.scale.y = 1.6; g.add(crystal); dyn.spin.push(crystal);
    top = 1.0;
  } else { // brazier (fire, magma)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.55, 10), stone); base.position.y = 0.27; g.add(base);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), iron); bowl.rotation.x = Math.PI; bowl.position.y = 0.78; g.add(bowl);
    top = 0.82;
  }
  // a glowing orb shows what it wants; a ring of 12 studs shows how full its rate is
  const want = orb(el); want.position.y = top + 0.12; want.scale.setScalar(o.kind === 'rune' ? 1.1 : 0.9); g.add(want);
  if (o.kind === 'rune') { const w2 = orb('water'); w2.position.set(0.18, top + 0.12, 0); want.position.x = -0.18; g.add(w2); }
  const studs = [];
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 - Math.PI / 2; const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: '#555', emissive: '#000' })); s.position.set(Math.cos(a) * 0.48, 0.03, Math.sin(a) * 0.48); g.add(s); studs.push(s); }
  dyn.rings.push({ o, i, studs });
  return shadow(g);
}
function orb(el) {
  const g = new THREE.Group(), col = C(ORB_COL[el]);
  const core = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4, roughness: 0.3 })); g.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 })); glow.scale.setScalar(0.75); g.add(glow);
  if (PARTS[el]) PARTS[el].forEach((p, k) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 6, 20, Math.PI), new THREE.MeshBasicMaterial({ color: C(ORB_COL[p]) })); ring.rotation.set(Math.PI / 2, 0, k * Math.PI); g.add(ring); });
  return g;
}
// Pieces: wooden belt troughs with sliding chevrons, a cauldron Mixer, a stone Demerger, arch mouths for the Underpass, a stone font for wellsprings.
const ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2]; // facing up(north/-z), right(+x), down, left
function piece(p) {
  const g = new THREE.Group(); g.position.copy(tiles(p.x, p.y)); g.rotation.y = ROT[p.dir || 0];
  const wood = mat(S.woodDark), stone = mat(S.stone), iron = mat(S.iron);
  const trough = () => { const b = new THREE.Mesh(new RoundedBoxGeometry(0.84, 0.14, 1.0, 2, 0.04), wood); b.position.y = 0.07; g.add(b);
    const tex = BELT_TEX; const top = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); top.rotation.x = -Math.PI / 2; top.position.y = 0.145; g.add(top); };
  if (p.type === 'belt') trough();
  else if (p.type === 'splitter' || p.type === 'joiner') {
    trough();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.2, 16), mat(p.type === 'splitter' ? '#7a6a9a' : '#4f7a62')); hub.position.y = 0.22; g.add(hub);
    const arrow = (ang) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), mat('#f2ead8')); c.rotation.set(-Math.PI / 2, 0, 0); const a = new THREE.Group(); a.add(c); c.position.z = -0.34; a.rotation.y = ang; a.position.y = 0.26; g.add(a); };
    if (p.type === 'splitter') { arrow(Math.PI / 2); arrow(-Math.PI / 2); } else arrow(0);
  } else if (p.type === 'mixer') {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.3, 0.02), new THREE.Vector2(0.38, 0.2), new THREE.Vector2(0.36, 0.42), new THREE.Vector2(0.3, 0.48)];
    const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: C(S.iron), roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide })); g.add(pot);
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.29, 20), new THREE.MeshStandardMaterial({ color: '#dfe8ee', emissive: '#9fd6ef', emissiveIntensity: 0.6 })); brew.rotation.x = -Math.PI / 2; brew.position.y = 0.4; g.add(brew);
    const notch = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), mat('#e0b55c', { extra: { metalness: 0.5, roughness: 0.4 } })); notch.rotation.x = -Math.PI / 2; notch.position.set(0, 0.25, -0.45); g.add(notch);
  } else if (p.type === 'demerger') {
    const block = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.5, 0.66, 2, 0.08), stone); block.position.y = 0.25; g.add(block);
    for (const s of [-1, 1]) { const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 8), iron); spout.rotation.z = Math.PI / 2; spout.position.set(s * 0.42, 0.28, 0); g.add(spout); }
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 16), new THREE.MeshStandardMaterial({ color: '#9fd6ef', emissive: '#9fd6ef', emissiveIntensity: 0.9 })); rune.rotation.x = -Math.PI / 2; rune.position.y = 0.51; g.add(rune);
  } else if (p.type === 'underpass') {
    trough();
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 16, Math.PI), stone); arch.position.set(0, 0.12, p.end === 'in' ? -0.25 : 0.25); g.add(arch);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#120f14' })); hole.position.set(0, 0.12, p.end === 'in' ? -0.26 : 0.26); if (p.end === 'out') hole.rotation.y = Math.PI; g.add(hole);
  } else if (p.type === 'wellspring') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 14), stone); base.position.y = 0.15; g.add(base);
    const basin = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 20), stone); basin.rotation.x = -Math.PI / 2; basin.position.y = 0.32; g.add(basin);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), stone); spout.position.set(0, 0.22, -0.42); g.add(spout);
    const o = orb(p.el); o.position.y = 0.62; o.scale.setScalar(1.6); g.add(o); dyn.spin.push(o);
  } else return null;
  if (p.type === 'belt' || p.type === 'underpass' || p.type === 'splitter' || p.type === 'joiner') dyn.belts.push(g);
  return shadow(g);
}

// ---------------------------------------------------------------- animation
let acc = 0, last = performance.now();
const tmp = new THREE.Vector3();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt;
  while (acc >= BEAT) { acc -= BEAT; step(st); }
  const k = acc / BEAT;
  BELT_TEX.offset.y = -((now / 1000) / BEAT) % 1; // one chevron spacing per beat
  if (dyn.river) dyn.river.offset.y = (now / 6000) % 1;
  for (const s of dyn.spin) s.rotation.y += dt * 0.8;
  // gates ease toward their state
  for (const gt of dyn.gates) {
    const open = gt.kind === 'held' ? gateOpen(st, gt.o.id) : !!st.done[gt.o.id];
    gt.t += ((open ? 1 : 0) - gt.t) * Math.min(1, dt * 3);
    if (gt.kind === 'held') gt.port.position.y = gt.t * 1.05;
    if (gt.kind === 'door') { for (const [hinge, s] of gt.leaves) hinge.rotation.y = s * gt.t * 1.7; gt.gem.material.emissiveIntensity = open ? 1.6 : 0.6; }
    if (gt.kind === 'bridge') { gt.bridge.visible = gt.t > 0.02; gt.bridge.scale.set(1, 1, Math.max(0.01, gt.t)); }
  }
  // rate studs
  for (const r of dyn.rings) {
    const pr = progress(st, r.o)[r.i], frac = r.o.kind !== 'held' && st.done[r.o.id] ? 1 : Math.min(1, pr.value / pr.target);
    const ok = frac >= 1;
    r.studs.forEach((s, j) => { const lit = j < Math.round(frac * 12); s.material.color.set(lit ? (ok ? '#7be39a' : '#ffd27a') : '#55505a'); s.material.emissive.set(lit ? (ok ? '#2f8a4a' : '#8a6a20') : '#000000'); });
  }
  // orbs on belts (orbs inside an Underpass are underground, so hidden)
  const seen = new Set();
  for (const [i, o] of st.run.orbs) {
    seen.add(o.id);
    let g = dyn.orbs.get(o.id);
    if (!g) { g = orb(o.el); dyn.orbs.set(o.id, g); world.add(g); }
    const x = i % W, y = (i - x) / W, px = o.px ?? x, py = o.py ?? y;
    g.position.set(px + (x - px) * k + 0.5, 0.3, py + (y - py) * k + 0.5);
  }
  for (const [id, g] of dyn.orbs) if (!seen.has(id)) { world.remove(g); dyn.orbs.delete(id); }
  // camera glide
  if (cam.want) { cam.tx += (cam.want.tx - cam.tx) * Math.min(1, dt * 3); cam.tz += (cam.want.tz - cam.tz) * Math.min(1, dt * 3); cam.dist += (cam.want.dist - cam.dist) * Math.min(1, dt * 3); }
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- UI
let styleKey = 'quiet';
const caption = document.getElementById('caption');
function renderUi() {
  const styles = document.getElementById('styles');
  styles.replaceChildren(...Object.entries(STYLES).map(([k, s], i) => { const b = document.createElement('button'); b.className = 'btn' + (k === styleKey ? ' on' : ''); b.textContent = `${String.fromCharCode(65 + i)} · ${s.short}`; b.onclick = () => { styleKey = k; build(k); renderUi(); }; return b; }));
  const views = document.getElementById('views');
  views.replaceChildren(...VIEWS.map((v, i) => { const b = document.createElement('button'); b.className = 'btn' + (i === viewIdx ? ' on' : ''); b.textContent = v.name; b.onclick = () => { viewIdx = i; cam.want = v; renderUi(); }; return b; }));
  caption.innerHTML = '';
  const b = document.createElement('b'); b.textContent = STYLES[styleKey].name; caption.append(b, ` — ${STYLES[styleKey].blurb} `, document.createElement('br'), VIEWS[viewIdx].note);
}
st = showcase();
build(styleKey);
Object.assign(cam, VIEWS[0]); cam.want = null;
renderUi(); resize();
document.getElementById('loading').remove();
window.__ready = true;
requestAnimationFrame(frame);
