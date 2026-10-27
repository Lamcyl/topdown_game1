// Crossroads map demo: page. Canvas map with fog and map memory, tile panel, Keep panel, between-run shop.
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
const btn = (label, onclick, opts = {}) => el('button', { class: 'btn' + (opts.primary ? ' primary' : '') + (opts.small ? ' small' : '') + (opts.on ? ' on' : ''), onclick, disabled: opts.disabled, title: opts.title }, label);
const fmt = (n) => Math.floor(n + 1e-9);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- saved progress
const SAVE_KEY = 'orbforge-crossroads-v1';
let meta = newMeta();
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) meta = { ...meta, ...JSON.parse(raw) }; } catch (e) { /* storage unavailable */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* storage unavailable */ } };

let run = newRun(meta);
let screen = 'between'; // 'between' (shop, start options) or 'run'
let lastResult = null, speed = 0, lastSpeed = 1, sel = null, panel = 'tile', toastMsg = '', toastUntil = 0;
const mobs = [];
let spawnClock = {};

// ---------------------------------------------------------------- art (placeholder)
const REGION_COL = { N: [104, 116, 100], E: [138, 92, 60], S: [62, 108, 104], W: [118, 112, 160], K: [130, 118, 92] };
const ORB_COL = { fire: '#e8692c', water: '#3d92da', earth: '#a8804c', air: '#d6ecf5', steam: '#b9c4d0', magma: '#d8461a', mud: '#7a5c3a', lightning: '#f2d64b', ice: '#9fe0f0', dust: '#c9b48a', eruption: '#ff7a3a', obsidian: '#4a3a5a', quagmire: '#5f7a5a', storm: '#6a7ad8' };
const ICON = { lore: '🪧', gate: '🚪', skygate: '⛩️', waystone: '🗿', blueprint: '📐', recipe: '📖', seal: '💠', ancient: '✨' };
const iconOf = (f) => f.type === 'relic' ? (f.key === 'rod' ? '🪄' : '🏮') : ICON[f.type];

// ---------------------------------------------------------------- layout
const app = document.getElementById('app');
const hud = el('div', { class: 'hud' });
const wallet = el('div', { class: 'row' });
const frontsBox = el('div', { class: 'fronts' });
const canvas = el('canvas');
const toast = el('div', { class: 'toast' });
const mapbox = el('div', { class: 'mapbox' }, canvas, toast);
const controls = el('div', { class: 'controls' });
const panelBox = el('div');
app.append(
  el('div', {}, el('h1', {}, 'Orbforge · Crossroads'), el('div', { class: 'sub' }, 'Map demo: explore outward from the Keep, choose a direction, survive, and come back stronger.')),
  hud, wallet, frontsBox, mapbox, controls, panelBox,
);
const ctx = canvas.getContext('2d');
const fogCanvas = document.createElement('canvas'); fogCanvas.width = MAP_N; fogCanvas.height = MAP_N;
const fogCtx = fogCanvas.getContext('2d'), fogImg = fogCtx.createImageData(MAP_N, MAP_N);

// camera in tile units: centre (cx, cy) and zoom z (screen px per tile)
const cam = { cx: MAP_C + 0.5, cy: MAP_C + 0.5, z: 24 };
let W = 360, DPR = 1;
function resize() {
  const r = canvas.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2);
  const firstFit = W === 360 && r.width;
  W = r.width || 360; canvas.width = Math.round(W * DPR); canvas.height = Math.round(W * DPR);
  if (firstFit) cam.z = W / 17;
  clampCam();
}
const minZ = () => W / (MAP_N + 1), maxZ = () => W / 7;
function clampCam() {
  cam.z = Math.max(minZ(), Math.min(maxZ(), cam.z));
  const half = W / cam.z / 2;
  cam.cx = Math.max(Math.min(half, MAP_N / 2), Math.min(Math.max(MAP_N - half, MAP_N / 2), cam.cx));
  cam.cy = Math.max(Math.min(half, MAP_N / 2), Math.min(Math.max(MAP_N - half, MAP_N / 2), cam.cy));
}
const sx = (tx) => (tx - cam.cx) * cam.z + W / 2, sy = (ty) => (ty - cam.cy) * cam.z + W / 2;
const toTile = (px, py) => [Math.floor((px - W / 2) / cam.z + cam.cx), Math.floor((py - W / 2) / cam.z + cam.cy)];

// ---------------------------------------------------------------- input: drag to pan, pinch or wheel to zoom, tap to select
const pointers = new Map();
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  drag = { moved: false, x0: e.offsetX, y0: e.offsetY, cx: cam.cx, cy: cam.cy, pinch: null };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.cx, cy: cam.cy };
    drag.moved = true;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !drag) return;
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (drag.pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], p = drag.pinch;
    const z = Math.max(minZ(), Math.min(maxZ(), p.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, p.d)));
    const wx = (p.mx - W / 2) / p.z + p.cx, wy = (p.my - W / 2) / p.z + p.cy; // keep the pinch midpoint fixed
    cam.z = z; cam.cx = wx - ((a.x + b.x) / 2 - W / 2) / z; cam.cy = wy - ((a.y + b.y) / 2 - W / 2) / z; clampCam();
  } else if (pointers.size === 1) {
    const dx = e.offsetX - drag.x0, dy = e.offsetY - drag.y0;
    if (Math.hypot(dx, dy) > 7) drag.moved = true;
    if (drag.moved) { cam.cx = drag.cx - dx / cam.z; cam.cy = drag.cy - dy / cam.z; clampCam(); }
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (drag && !drag.moved && pointers.size === 0) tapTile(...toTile(e.offsetX, e.offsetY));
  if (pointers.size === 0) drag = null;
  else if (drag) { const [p] = pointers.values(); drag = { moved: true, x0: p.x, y0: p.y, cx: cam.cx, cy: cam.cy, pinch: null }; }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });
function zoomAt(f, px = W / 2, py = W / 2) {
  const wx = (px - W / 2) / cam.z + cam.cx, wy = (py - W / 2) / cam.z + cam.cy;
  cam.z = Math.max(minZ(), Math.min(maxZ(), cam.z * f));
  cam.cx = wx - (px - W / 2) / cam.z; cam.cy = wy - (py - W / 2) / cam.z; clampCam();
}

function tapTile(x, y) {
  if (!inMap(x, y)) return;
  if (isKeep(x, y)) { sel = null; panel = 'keep'; renderPanel(true); return; }
  sel = { x, y }; panel = 'tile'; renderPanel(true);
}
function say(msg) { toastMsg = msg; toastUntil = performance.now() + 3500; }

// ---------------------------------------------------------------- drawing
function draw(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0c0a10'; ctx.fillRect(0, 0, W, W);
  const z = cam.z;
  const x0 = Math.max(0, Math.floor(cam.cx - W / z / 2) - 1), x1 = Math.min(MAP_N - 1, Math.ceil(cam.cx + W / z / 2) + 1);
  const y0 = Math.max(0, Math.floor(cam.cy - W / z / 2) - 1), y1 = Math.min(MAP_N - 1, Math.ceil(cam.cy + W / z / 2) + 1);
  // ground, decoration and roads
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const r = regionOf(x, y), ring = ringOf(x, y), n = noise(x, y), c = REGION_COL[r];
    const k = 1 - ring * 0.07 + (n - 0.5) * 0.08;
    ctx.fillStyle = `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`;
    ctx.fillRect(sx(x), sy(y), z + 0.6, z + 0.6);
    if (ROADS.road[idx(x, y)]) continue;
    if (n > 0.8 && !featureAt.has(idx(x, y)) && r !== 'K') drawDeco(r, sx(x) + z / 2, sy(y) + z / 2, z, n);
  }
  // ring borders (thin), so the three rings read on the ground
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
  for (const d of [7.5, 13.5]) ctx.strokeRect(sx(MAP_C + 0.5 - d), sy(MAP_C + 0.5 - d), 2 * d * z, 2 * d * z);
  ctx.fillStyle = '#cdb98e';
  const rw = z * 0.42;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!ROADS.road[idx(x, y)]) continue;
    const cx = sx(x) + z / 2, cy = sy(y) + z / 2;
    ctx.fillRect(cx - rw / 2, cy - rw / 2, rw, rw);
    for (const [ox, oy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (inMap(nx, ny) && (ROADS.road[idx(nx, ny)] || isKeep(nx, ny) || (featureAt.get(idx(nx, ny)) || {}).type === 'lair'))
        ctx.fillRect(ox ? cx + (ox > 0 ? 0 : -z / 2) : cx - rw / 2, oy ? cy + (oy > 0 ? 0 : -z / 2) : cy - rw / 2, ox ? z / 2 + 0.5 : rw, oy ? z / 2 + 0.5 : rw);
    }
  }
  // extractor belts (abstracted: a dotted line home)
  ctx.setLineDash([z * 0.12, z * 0.18]); ctx.lineWidth = Math.max(1, z * 0.07);
  for (const id of Object.keys(run.extractors)) {
    const f = FEATURE_BY_ID[id]; ctx.strokeStyle = run.veins[id] > 0 ? ORB_COL[f.el] : 'rgba(200,200,200,.3)';
    ctx.lineDashOffset = -(now / 40) % (z * 0.3);
    ctx.beginPath(); ctx.moveTo(sx(f.x + 0.5), sy(f.y + 0.5)); ctx.lineTo(sx(MAP_C + 0.5), sy(MAP_C + 0.5)); ctx.stroke();
  }
  ctx.setLineDash([]);
  // the Keep
  const kx = sx(MAP_C - 1), ky = sy(MAP_C - 1);
  roundRect(kx + z * 0.15, ky + z * 0.15, z * 2.7, z * 2.7, z * 0.5, '#5b4e3a', '#d9c39a');
  emoji('🏰', kx + z * 1.5, ky + z * 1.5, z * 1.7);
  // fog: one pixel per tile, scaled up smoothly for soft edges
  const d = fogImg.data;
  for (let i = 0; i < MAP_N * MAP_N; i++) {
    const x = i % MAP_N, y = (i - x) / MAP_N, veil = isVeiled(x, y) && !run.skyOpen;
    let a = 0, col = [12, 10, 16];
    if (!run.lit[i]) {
      if (meta.seen[i]) { a = 150; col = [26, 22, 34]; } else a = 255;
      if (veil) { col = [58, 40, 92]; a = meta.seen[i] ? 170 : 255; }
    }
    d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = a;
  }
  fogCtx.putImageData(fogImg, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, sx(0), sy(0), MAP_N * z, MAP_N * z);
  // features: full when lit, faded when only remembered
  for (const f of FEATURES) {
    if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
    const lit = isLit(run, f.x, f.y), seen = isSeen(meta, f.x, f.y);
    if (!lit && !seen) continue;
    ctx.globalAlpha = lit ? 1 : 0.5;
    drawFeature(f, sx(f.x) + z / 2, sy(f.y) + z / 2, z, lit, now);
    ctx.globalAlpha = 1;
  }
  // beacons
  for (const b of run.beacons) {
    const cx = sx(b.x) + z / 2, cy = sy(b.y) + z / 2, pulse = 0.85 + 0.15 * Math.sin(now / 300 + b.x);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, z * 0.9);
    g.addColorStop(0, `rgba(255,214,120,${0.55 * pulse})`); g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, z * 0.9, 0, Math.PI * 2); ctx.fill();
    circle(cx, cy + z * 0.12, z * 0.2, '#4a3a20'); circle(cx, cy - z * 0.05, z * 0.14 * pulse, '#ffd27a');
  }
  // mobs walking the roads
  for (const m of mobs) {
    const p = ROADS.paths[m.lair], i = Math.min(p.length - 1, Math.floor(m.s)), j = Math.min(p.length - 1, i + 1), t = m.s - i;
    const x = p[i][0] + (p[j][0] - p[i][0]) * t, y = p[i][1] + (p[j][1] - p[i][1]) * t;
    if (!isLit(run, Math.round(x), Math.round(y))) continue;
    ctx.globalAlpha = m.dying ? Math.max(0, 1 - m.dying * 3) : 1;
    circle(sx(x + 0.5), sy(y + 0.5), z * 0.17, '#2a1418'); circle(sx(x + 0.5), sy(y + 0.5), z * 0.12, MOB_COL[regionOf(FEATURE_BY_ID[m.lair].x, FEATURE_BY_ID[m.lair].y)]);
    ctx.globalAlpha = 1;
  }
  // selection
  if (sel) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.strokeRect(sx(sel.x) + 1, sy(sel.y) + 1, z - 2, z - 2); }
}
const MOB_COL = { N: '#b8b0a0', E: '#ff8a4a', S: '#7ae0a0', W: '#c8b8ff' };
function drawDeco(r, cx, cy, z, n) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = Math.max(1, z * 0.05);
  if (r === 'N') { ctx.beginPath(); ctx.moveTo(cx - z * 0.25, cy + z * 0.2); ctx.lineTo(cx, cy - z * 0.25); ctx.lineTo(cx + z * 0.25, cy + z * 0.2); ctx.fill(); }
  else if (r === 'E') { for (let k = 0; k < 3; k++) circle(cx + (k - 1) * z * 0.2, cy + ((k * 7 + n * 10) % 3 - 1) * z * 0.12, z * 0.05, 'rgba(255,170,90,0.45)'); }
  else if (r === 'S') { ctx.beginPath(); ctx.moveTo(cx - z * 0.3, cy); ctx.quadraticCurveTo(cx - z * 0.15, cy - z * 0.12, cx, cy); ctx.quadraticCurveTo(cx + z * 0.15, cy + z * 0.12, cx + z * 0.3, cy); ctx.stroke(); }
  else { circle(cx - z * 0.1, cy, z * 0.15, 'rgba(255,255,255,0.12)'); circle(cx + z * 0.1, cy - z * 0.05, z * 0.12, 'rgba(255,255,255,0.12)'); }
}
function drawFeature(f, cx, cy, z, lit, now) {
  if (f.type === 'vein') {
    if (f.buried && !relic(meta, 'rod')) { // odd markings only
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = `${z * 0.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⁂', cx, cy); return;
    }
    const left = run.veins[f.id], frac = left / f.amount, locked = f.gate && !run.opened.includes(f.gate);
    const s = z * (0.22 + 0.16 * Math.min(1, f.amount / 150));
    ctx.globalAlpha *= left <= 0 ? 0.35 : 1;
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 1.3); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s * 1.1); ctx.lineTo(cx - s, cy); ctx.closePath();
    ctx.fillStyle = ORB_COL[f.el]; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(1, z * 0.05); ctx.stroke();
    if (locked) emoji('🔒', cx + z * 0.28, cy - z * 0.28, z * 0.35);
    if (run.extractors[f.id]) emoji('⛏️', cx + z * 0.3, cy + z * 0.28, z * 0.34);
    if (lit && z > 18) label(`${fmt(left)}`, cx, cy + z * 0.5, z);
    if (lit && frac < 1 && left > 0) bar(cx, cy - z * 0.48, z * 0.7, frac, ORB_COL[f.el]);
    return;
  }
  if (f.type === 'lair') {
    const st = run.lairs[f.id], awake = lit && !st.dead;
    if (awake) { const p = 0.5 + 0.5 * Math.sin(now / 250); ctx.strokeStyle = `rgba(255,80,80,${0.4 + 0.4 * p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, z * (0.48 + 0.06 * p), 0, Math.PI * 2); ctx.stroke(); }
    circle(cx, cy, z * 0.42, st.dead ? '#3a3440' : f.final ? '#5a1830' : '#4a1c22');
    emoji(st.dead ? '✖️' : f.final ? '🐉' : '💀', cx, cy, z * 0.5);
    if (lit && !st.dead && st.hp < TUNING.lairHp * f.p) bar(cx, cy - z * 0.55, z * 0.8, st.hp / (TUNING.lairHp * f.p), '#e0627a');
    return;
  }
  const done = has(meta, f.id) || run.opened.includes(f.id) || run.claimed.includes(f.id);
  if (f.type === 'gate') circle(cx, cy, z * 0.4, done ? 'rgba(255,255,255,.1)' : ORB_COL[f.need]);
  if (f.type === 'skygate') circle(cx, cy, z * 0.44, run.skyOpen ? 'rgba(255,255,255,.1)' : '#7a5ac8');
  if (PERMANENT.has(f.type) && !done && lit) { const p = 0.5 + 0.5 * Math.sin(now / 400 + f.x); circle(cx, cy, z * (0.36 + 0.05 * p), `rgba(255,214,120,${0.25 + 0.2 * p})`); }
  ctx.globalAlpha *= done && f.type !== 'waystone' ? 0.45 : 1;
  emoji(iconOf(f), cx, cy, z * 0.62);
}
function emoji(ch, x, y, size) { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x, y + size * 0.05); }
function circle(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function bar(cx, y, w, frac, col) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(cx - w / 2, y, w, 4); ctx.fillStyle = col; ctx.fillRect(cx - w / 2, y, w * Math.max(0, frac), 4); }
function label(txt, x, y, z) { ctx.font = `600 ${Math.max(9, z * 0.3)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(txt, x, y); ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y); }
function roundRect(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }

// ---------------------------------------------------------------- cosmetic mobs: each awake lair sends walkers down its road
function stepMobs(dt) {
  const fr = fronts(run, meta);
  for (const f of FEATURES) {
    if (f.type !== 'lair' || run.lairs[f.id].dead || !isLit(run, f.x, f.y)) continue;
    spawnClock[f.id] = (spawnClock[f.id] || 0) - dt;
    if (spawnClock[f.id] > 0) continue;
    spawnClock[f.id] = 2.6 / f.p / nightfall(run.t);
    const front = fr[regionOf(f.x, f.y)], len = ROADS.paths[f.id].length - 1, ratio = front.defense / Math.max(0.01, front.pressure);
    const dies = ratio >= 1 || Math.random() < ratio;
    mobs.push({ lair: f.id, s: 0, dieAt: dies ? len * (0.25 + 0.5 * Math.random()) : Infinity, dying: 0 });
  }
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i], len = ROADS.paths[m.lair].length - 1;
    if (m.dying) { m.dying += dt; if (m.dying > 0.35) mobs.splice(i, 1); continue; }
    m.s += 1.4 * dt;
    if (m.s >= m.dieAt) m.dying = 0.001;
    else if (m.s >= len) mobs.splice(i, 1);
  }
}

// ---------------------------------------------------------------- status bars
function renderHud() {
  const hpFrac = run.hp / run.hpMax;
  hud.replaceChildren(
    el('span', { class: 'gold' }, `🪙 ${fmt(run.gold)}`),
    el('div', {}, el('div', { class: 'hpbar', title: 'Keep health' }, el('i', { style: `width:${(hpFrac * 100).toFixed(1)}%` })), el('div', { class: 'sub' }, `Keep ${fmt(run.hp)}/${run.hpMax}`)),
    el('span', { class: 'chip', title: 'Nightfall: waves grow stronger over time' }, `🌙 ${clock(run.t)} · ×${nightfall(run.t).toFixed(2)}`),
  );
  const orbs = Object.keys(ORBS).filter((k) => (run.wallet[k] || 0) >= 1);
  wallet.replaceChildren(
    el('span', { class: 'sub' }, 'Keep:'),
    ...(orbs.length ? orbs.map((k) => el('span', { class: 'chip', title: ORBS[k].name + ' (raw)' }, `${ORBS[k].icon} ${fmt(run.wallet[k])}`)) : [el('span', { class: 'sub' }, 'no raw orbs yet: put extractors on veins')]),
  );
  const fr = fronts(run, meta);
  frontsBox.replaceChildren(...FRONTS.map((k) => {
    const f = fr[k], quiet = f.pressure < 0.01, bad = f.pressure > f.defense;
    return el('div', { class: 'front ' + (quiet ? 'quiet' : bad ? 'bad' : 'ok'), title: `${REGIONS[k].name}: pressure vs defence` },
      el('b', {}, REGIONS[k].name), el('div', { class: 'sub' }, REGIONS[k].dir),
      `⚔ ${f.pressure.toFixed(1)} 🛡 ${f.defense.toFixed(0)}`);
  }));
}
function renderControls() {
  const playing = speed > 0;
  controls.replaceChildren(
    btn(playing ? '⏸ Pause' : '▶ Play', () => { if (screen !== 'run' || run.over) return; speed = playing ? 0 : lastSpeed; renderControls(); }, { primary: !playing && screen === 'run', disabled: screen !== 'run' || run.over }),
    btn(`×${lastSpeed}`, () => { lastSpeed = lastSpeed === 1 ? 2 : lastSpeed === 2 ? 4 : 1; if (speed) speed = lastSpeed; renderControls(); }, { title: 'Game speed' }),
    btn('🏰 Keep', () => { panel = 'keep'; sel = null; renderPanel(true); }, { on: panel === 'keep' }),
    el('span', { class: 'grow' }),
    btn('−', () => zoomAt(1 / 1.3), { title: 'Zoom out' }), btn('+', () => zoomAt(1.3), { title: 'Zoom in' }),
    btn('⌖', () => { cam.cx = MAP_C + 0.5; cam.cy = MAP_C + 0.5; clampCam(); }, { title: 'Centre on the Keep' }),
  );
}

// ---------------------------------------------------------------- panels
let panelSig = '';
function renderPanel(force) {
  const node = screen === 'between' ? el('div', { class: 'list' }, sel ? tilePanel() : null, betweenPanel()) : panel === 'keep' ? keepPanel() : tilePanel();
  const sig = node.outerHTML;
  if (!force && sig === panelSig) return;
  panelSig = sig; panelBox.replaceChildren(node);
}
const act = (fn) => () => { const why = fn(); if (why) say(why); persist(); renderPanel(true); renderHud(); };
const kindTag = (perm) => el('span', { class: 'tag' + (perm ? ' perm' : '') }, perm ? 'kept forever' : 'this run');

function tilePanel() {
  if (!sel) return el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Tap a lit tile to place a beacon, tap a vein to mine it, tap the Keep to buy Sources. Drag to pan; pinch or use − + to zoom.'), legend());
  const { x, y } = sel, r = regionOf(x, y), ring = ringOf(x, y), f = featureAt.get(idx(x, y));
  const lit = isLit(run, x, y), seen = isSeen(meta, x, y), reg = REGIONS[r];
  const head = el('div', { class: 'title' }, el('h2', {}, f ? featureName(f) : ROADS.road[idx(x, y)] ? 'Road' : 'Open ground'), el('span', { class: 'sub' }, `${reg.name} · ring ${ring}`));
  const card = el('div', { class: 'card' }, head);
  if (!lit) {
    if (isVeiled(x, y) && !run.skyOpen) card.append(el('p', { class: 'muted' }, 'Veiled by the storm. Light can’t reach here until the Sky Gate opens.'));
    else if (!seen) { card.append(el('p', { class: 'muted' }, 'Lost in the fog. Push your light out with beacons to see what’s here.')); return card; }
    else card.append(el('p', { class: 'muted' }, 'Remembered from an earlier run (map memory). Light it again to use it.'));
    if (!f || !seen) return card;
  }
  if (!f) {
    if (ROADS.road[idx(x, y)]) card.append(el('p', { class: 'sub' }, 'Enemies walk this road to the Keep. You can still build on it.'));
    const why = canBeacon(run, meta, x, y);
    card.append(el('div', { class: 'row' }, btn(`🕯 Place beacon · ${beaconCost(run, meta)} 🪙`, act(() => placeBeacon(run, meta, x, y)), { primary: !why, disabled: !!why || run.over || screen !== 'run' }), why && el('span', { class: 'sub' }, why)));
    card.append(el('p', { class: 'sub' }, `Lights ${lightRadius(meta)} tiles around it. Each beacon costs ${TUNING.beaconStep} more than the last.`));
    return card;
  }
  const can = lit && screen === 'run' && !run.over;
  switch (f.type) {
    case 'vein': {
      if (f.buried && !relic(meta, 'rod')) { card.append(el('p', {}, 'Odd markings in the ground… something lies buried here. A dowsing rod would find it.')); break; }
      const left = run.veins[f.id];
      card.append(el('p', {}, `${ORBS[f.el].icon} ${ORBS[f.el].name} vein: ${fmt(left)} / ${f.amount} raw orbs left.${f.buried ? ' (Found with the Dowsing Rod.)' : ''}`));
      if (f.gate && !run.opened.includes(f.gate)) card.append(el('p', { class: 'bad' }, `Sealed behind the ${FEATURE_BY_ID[f.gate].name}.`));
      else if (run.extractors[f.id]) card.append(el('p', { class: left > 0 ? 'good' : 'muted' }, left > 0 ? `⛏ Extractor mining ${TUNING.mineRate}/s to the Keep.` : 'Drawn dry.'));
      else card.append(btn(`⛏ Build extractor · ${TUNING.extractorCost} 🪙`, act(() => buildExtractor(run, meta, f)), { primary: true, disabled: !can || run.gold < TUNING.extractorCost }));
      break;
    }
    case 'lair': {
      const st = run.lairs[f.id], front = fronts(run, meta)[regionOf(f.x, f.y)];
      card.append(el('p', {}, `${REGIONS[regionOf(f.x, f.y)].foe} foes, strength ${f.p}${f.final ? ' — the map’s final lair' : ''}.`));
      card.append(el('p', { class: st.dead ? 'good' : lit ? 'bad' : 'muted' }, st.dead ? 'Destroyed this run.' : lit ? `Awake! Lair health ${fmt(st.hp)}/${TUNING.lairHp * f.p}.` : 'Asleep. It wakes when your light reaches it.'));
      if (!st.dead) card.append(el('p', { class: 'sub' }, `Counter: ${REGIONS[regionOf(f.x, f.y)].counter}. When this front’s defence beats its pressure (now ${front.defense.toFixed(0)} vs ${front.pressure.toFixed(1)}), the spare defence besieges the nearest lair.`));
      break;
    }
    case 'gate': {
      const open = run.opened.includes(f.id);
      card.append(el('p', {}, open ? 'Open for this run.' : `Feed it ${f.n} raw ${ORBS[f.need].name.toLowerCase()} orbs from the Keep to open it.`));
      if (!open) card.append(btn(`Feed ${f.n} ${ORBS[f.need].icon} (have ${fmt(run.wallet[f.need] || 0)})`, act(() => feedGate(run, f)), { primary: true, disabled: !can || (run.wallet[f.need] || 0) < f.n }));
      break;
    }
    case 'skygate':
      card.append(el('p', {}, run.skyOpen ? 'Open: the Skyspire is lit for this run.' : `Opens with the three seals. You hold ${seals(meta)}/3.`));
      if (!run.skyOpen) card.append(btn('Open the Sky Gate', act(() => openSky(run, meta, f)), { primary: true, disabled: !can || seals(meta) < 3 }));
      break;
    case 'lore': card.append(el('p', {}, el('i', {}, f.text))); break;
    case 'ancient':
      card.append(el('p', {}, `An Ancient ${ORBS[f.orb].name} Source sleeps in the ruins.`), kindTag(false));
      card.append(el('div', { class: 'row' }, btn(run.claimed.includes(f.id) ? 'Claimed' : `Claim ${ORBS[f.orb].icon} Source (free)`, act(() => claimAncient(run, f)), { primary: true, disabled: !can || run.claimed.includes(f.id) })));
      break;
    default: { // permanent finds
      const got = has(meta, f.id);
      const what = { blueprint: '+1 defence on every front, every run.', recipe: `Unlocks the ${ORBS[f.orb || 'storm'].name} recipe at the Keep.`, relic: f.info, seal: 'One of three seals for the Sky Gate.', waystone: 'Once attuned, later runs can start with a free beacon here.' }[f.type];
      card.append(el('p', {}, what), kindTag(true));
      card.append(el('div', { class: 'row' }, btn(got ? (f.type === 'waystone' ? 'Attuned' : 'Found') : f.type === 'waystone' ? 'Attune' : 'Take', act(() => take(run, meta, f)), { primary: !got, disabled: !can || got })));
    }
  }
  return card;
}
function featureName(f) {
  if (f.type === 'vein') return f.buried && !relic(meta, 'rod') ? 'Odd markings' : `${ORBS[f.el].name} vein`;
  if (f.type === 'lair' || f.type === 'gate' || f.type === 'skygate' || f.type === 'blueprint' || f.type === 'relic' || f.type === 'seal') return f.name;
  if (f.type === 'recipe') return `Recipe tablet: ${ORBS[f.orb].name}`;
  return { lore: 'Lore stone', waystone: 'Waystone', ancient: 'Ancient Source' }[f.type];
}
function legend() {
  const rows = [['🏰', 'Keep'], ['🕯', 'Beacon (lights the fog)'], ['◆', 'Vein (raw orbs)'], ['⛏️', 'Extractor'], ['💀', 'Lair (wakes when lit)'], ['🚪', 'Gate (feed it orbs)'], ['📐', 'Blueprint'], ['📖', 'Recipe tablet'], ['🪄🏮', 'Relics'], ['💠', 'Seal'], ['🗿', 'Waystone'], ['✨', 'Ancient Source'], ['🪧', 'Lore stone'], ['⁂', 'Odd markings'], ['⛩️', 'Sky Gate']];
  return el('details', {}, el('summary', {}, 'Legend'), el('div', { class: 'legend' }, ...rows.map(([i, t]) => el('span', {}, `${i} ${t}`))));
}

let mergeA = 'fire', mergeB = 'water', buyEl = null;
function keepPanel() {
  const card = el('div', { class: 'card' }, el('div', { class: 'title' }, el('h2', {}, '🏰 The Keep'), btn('Close', () => { panel = 'tile'; renderPanel(true); renderControls(); }, { small: true })));
  const can = screen === 'run' && !run.over;
  // alchemy
  const have = Object.keys(ORBS).filter((k) => (run.wallet[k] || 0) >= 1);
  const opts = (cur) => Object.keys(ORBS).filter((k) => have.includes(k) || k === cur).map((k) => el('option', { value: k, selected: k === cur }, `${ORBS[k].icon} ${ORBS[k].name} (${fmt(run.wallet[k] || 0)})`));
  const out = mergeResult(meta, mergeA, mergeB), s = TUNING.mergeStep;
  card.append(el('h3', {}, 'Alchemy (raw orbs)'),
    el('div', { class: 'row' },
      el('select', { onchange: (e) => { mergeA = e.target.value; renderPanel(true); } }, opts(mergeA)), '+',
      el('select', { onchange: (e) => { mergeB = e.target.value; renderPanel(true); } }, opts(mergeB)),
      el('span', {}, '→ ', out ? `${ORBS[out].icon} ${ORBS[out].name}` : RECIPES[recipeKey(mergeA, mergeB)] ? '🔒 recipe not found yet' : '✖ no recipe')),
    el('div', { class: 'row' }, btn(`Merge ${s} + ${s} → ${s}`, act(() => merge(run, meta, mergeA, mergeB)), { primary: !!out, disabled: !can || !out || (run.wallet[mergeA] || 0) < s || (run.wallet[mergeB] || 0) < s }), el('span', { class: 'sub' }, 'Can’t be undone.')));
  // buy sources
  card.append(el('h3', {}, 'Buy a Source (makes forged ammo forever)'));
  const buyable = Object.keys(ORBS).filter((k) => (run.wallet[k] || 0) >= 1);
  if (!buyable.length) card.append(el('p', { class: 'sub' }, 'Bank raw orbs first: extractors on veins send them here.'));
  const list = el('div', { class: 'list' });
  for (const k of buyable) {
    const price = sourcePrice(k), ok = (run.wallet[k] || 0) >= price;
    list.append(el('div', { class: 'item' },
      el('div', {}, `${ORBS[k].icon} ${ORBS[k].name} Source · ${price} ${ORBS[k].icon}`, el('div', { class: 'info' }, `Power ${TUNING.sourcePower[ORBS[k].tier]}, ×2 vs ${FRONTS.filter((fr) => orbParts(k).includes(REGIONS[fr].counterEl)).map((fr) => REGIONS[fr].name).join(', ') || 'nobody'}`)),
      el('div', { class: 'row' }, ...FRONTS.map((fr) => btn(fr, act(() => buySource(run, k, fr)), { small: true, disabled: !can || !ok, title: `Defend ${REGIONS[fr].name}` })))));
  }
  card.append(list);
  // owned sources
  card.append(el('h3', {}, `Your Sources (${run.sources.length})`));
  if (!run.sources.length) card.append(el('p', { class: 'sub' }, 'None yet. In the full game you place them by towers; here you pick the front each one defends.'));
  const owned = el('div', { class: 'list' });
  run.sources.forEach((src, i) => owned.append(el('div', { class: 'item' },
    el('div', {}, `${ORBS[src.el].icon} ${ORBS[src.el].name}${src.free ? ' (free)' : ''}`, el('div', { class: 'info' }, `Defending ${REGIONS[src.front].name}: +${sourceDefense(src, src.front)}`)),
    el('div', { class: 'row' }, ...FRONTS.map((fr) => btn(fr, act(() => { src.front = fr; }), { small: true, on: src.front === fr, disabled: !can })),
      btn('Sell', act(() => sellSource(run, i)), { small: true, disabled: !can, title: src.free ? 'No refund for free Sources' : `Refund ${Math.floor(sourcePrice(src.el) / 2)}` })))));
  card.append(owned);
  card.append(el('p', { class: 'sub' }, `Defence on every front: Keep 1 + blueprints ${blueprints(meta)} + Sources.`));
  if (screen === 'run' && !run.over) card.append(el('div', { class: 'row' }, btn('Abandon run', () => { if (confirm('End this run now? You still earn Echoes.')) finishRun(); }, { small: true })));
  return card;
}

function betweenPanel() {
  const card = el('div', { class: 'card' });
  if (lastResult) {
    const p = lastResult.parts;
    card.append(el('h2', {}, `The Keep has fallen — run ${meta.runs}`),
      el('p', {}, `Survived ${clock(lastResult.t)}. Echoes earned: `, el('b', { class: 'goldc' }, `+${lastResult.total}`)),
      el('p', { class: 'sub' }, `Explored ${p.explored} · lairs ${p.lairs} · secrets ${p.secrets} · survival ${p.survived}`));
    if (lastResult.found.length) card.append(el('p', {}, 'Kept forever: ', lastResult.found.map((id) => featureName(FEATURE_BY_ID[id])).join(', ')));
  } else {
    card.append(el('h2', {}, meta.runs ? 'Between runs' : 'The Keep at the Crossroads'),
      el('p', {}, 'Four lands surround your Keep. Each direction has its own veins, foes and secrets. Push your light outward with beacons, mine veins, buy Sources at the Keep, and hold every front as nightfall deepens.'),
      el('p', { class: 'sub' }, 'When the Keep falls, the run ends. Your map memory, finds and Echoes stay, so the next run can take another road.'));
  }
  card.append(el('h3', {}, `Echo shop · ${meta.echoes} Echoes`));
  const shop = el('div', { class: 'list' });
  for (const item of SHOP) {
    const cost = shopCost(meta, item), lvl = upg(meta, item.key);
    shop.append(el('div', { class: 'item' },
      el('div', {}, `${item.name}${item.costs.length > 1 ? ` (${lvl}/${item.costs.length})` : lvl ? ' ✓' : ''}`, el('div', { class: 'info' }, item.info)),
      btn(cost == null ? 'Max' : `${cost} ✦`, act(() => (buyUpgrade(meta, item.key) ? null : 'Not enough Echoes.')), { small: true, disabled: cost == null || meta.echoes < cost })));
  }
  card.append(shop);
  if (upg(meta, 'founding')) card.append(el('h3', {}, 'Founding Source'), el('div', { class: 'row' }, ...['fire', 'water', 'earth'].map((k) => btn(`${ORBS[k].icon} ${ORBS[k].name}`, act(() => { meta.foundingEl = k; }), { small: true, on: meta.foundingEl === k }))));
  const ways = FEATURES.filter((f) => f.type === 'waystone' && has(meta, f.id));
  if (ways.length) card.append(el('h3', {}, 'Start with a free beacon at'), el('div', { class: 'row' }, ...ways.map((f) => {
    const on = meta.startAt.includes(f.id);
    return btn(`🗿 ${REGIONS[regionOf(f.x, f.y)].name}`, act(() => { meta.startAt = on ? meta.startAt.filter((i) => i !== f.id) : [...meta.startAt, f.id]; }), { small: true, on });
  })), el('p', { class: 'sub' }, 'Careful: lighting far out early wakes lairs early.'));
  const found = FEATURES.filter((f) => PERMANENT.has(f.type) && f.type !== 'waystone' && has(meta, f.id));
  card.append(el('h3', {}, `Finds kept forever (${found.length})`), el('p', { class: 'sub' }, found.length ? found.map(featureName).join(' · ') : 'None yet. Blueprints, recipe tablets, relics and seals hide out in the rings.'));
  card.append(el('div', { class: 'row', style: 'margin-top:10px' }, btn(meta.runs ? `Begin run ${meta.runs + 1}` : 'Begin first run', startRun, { primary: true }),
    meta.runs ? btn('Reset all progress', () => { if (confirm('Forget every run, find and Echo?')) { meta = newMeta(); lastResult = null; persist(); run = newRun(meta); renderAll(); } }, { small: true }) : null));
  return card;
}

// ---------------------------------------------------------------- run lifecycle
function startRun() {
  run = newRun(meta); screen = 'run'; speed = 0; panel = 'tile'; sel = null; mobs.length = 0; spawnClock = {}; lastResult = null;
  say('Build phase: place beacons, then press ▶ Play.');
  persist(); renderAll();
}
function finishRun() {
  run.over = true; speed = 0;
  const res = endRun(run, meta);
  lastResult = { ...res, t: run.t, found: run.newFound.slice() };
  screen = 'between'; persist(); renderAll();
}
function renderAll() { renderHud(); renderControls(); renderPanel(true); }

let last = performance.now(), hudClock = 0, saveClock = 0;
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  if (screen === 'run' && speed > 0 && !run.over) {
    const dt = real * speed;
    for (const ev of tick(run, meta, dt)) {
      if (ev.type === 'lair') say(ev.final ? '🐉 The Storm Eyrie falls! You have conquered the Crossroads (end of the demo map).' : `💀 ${FEATURE_BY_ID[ev.id].name} destroyed! +${TUNING.lairBounty * FEATURE_BY_ID[ev.id].p} gold`);
      if (ev.type === 'depleted') say(`${FEATURE_BY_ID[ev.id].el[0].toUpperCase() + FEATURE_BY_ID[ev.id].el.slice(1)} vein drawn dry.`);
      if (ev.type === 'fallen') { finishRun(); }
    }
    stepMobs(dt);
    hudClock += real; saveClock += real;
    if (hudClock > 0.25) { hudClock = 0; renderHud(); renderPanel(false); }
    if (saveClock > 5) { saveClock = 0; persist(); }
  } else if (mobs.length) mobs.length = 0;
  const shown = toastMsg && now < toastUntil ? toastMsg : '';
  if (shown !== toast.dataset.msg) { toast.dataset.msg = shown; toast.replaceChildren(...(shown ? [el('span', {}, shown)] : [])); }
  draw(now);
  requestAnimationFrame(frame);
}
new ResizeObserver(() => resize()).observe(canvas);
resize(); renderAll();
requestAnimationFrame(frame);
