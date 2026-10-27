// Crossroads demo: page. One screen: status bars, the map (canvas), the build bar; sheets for inspect, the Keep, help and between runs.
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
const SAVE_KEY = 'orbforge-crossroads-v2';
let meta = newMeta();
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) meta = { ...meta, ...JSON.parse(raw) }; } catch (e) { /* storage unavailable */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* storage unavailable */ } };

let run = newRun(meta);
let screen = 'between'; // 'between' or 'run'
let sheet = null;       // null | 'tile' | 'keep' | 'help'
let lastResult = null, speed = 0, lastSpeed = 1, sel = null, toastMsg = '', toastUntil = 0;
let tool = 'inspect', toolDir = 1, toolEl = null;
const live = () => screen === 'run' && speed > 0;

// ---------------------------------------------------------------- art (placeholder)
const REGION_COL = { N: [104, 116, 100], E: [138, 92, 60], S: [62, 108, 104], W: [118, 112, 160], K: [130, 118, 92] };
const ORB_COL = { fire: '#ff7a33', water: '#3d9be8', earth: '#c08a4a', air: '#d6f0fa', steam: '#c9d3de', magma: '#ff4a1a', mud: '#8a6a40', lightning: '#ffe04b', ice: '#a6ecff', dust: '#d9c08a', eruption: '#ff8a3a', obsidian: '#8a6ab0', quagmire: '#6f9a6a', storm: '#7a8cff' };
const MOB_COL = { N: '#b9b2a2', E: '#ff8a4a', S: '#7ae0a0', W: '#c8b8ff' };
const ICON = { lore: '🪧', gate: '🚪', skygate: '⛩️', waystone: '🗿', blueprint: '📐', recipe: '📖', seal: '💠', ancient: '✨' };
const iconOf = (f) => f.type === 'relic' ? (f.key === 'rod' ? '🪄' : '🏮') : ICON[f.type];
const TOOL_ORDER = ['inspect', 'beacon', 'extractor', 'belt', 'splitter', 'joiner', 'mixer', 'wall', 'bolt', 'beam', 'mortar', 'lance', 'spray', 'trap', 'source', 'rotate'];

// ---------------------------------------------------------------- layout
const app = document.getElementById('app');
const bar1 = el('div', { class: 'bar1' });
const bar2 = el('div', { class: 'row' });
const canvas = el('canvas');
const toast = el('div', { class: 'toast' }), hint = el('div', { class: 'hint' }), sheetBox = el('div', { class: 'sheet', hidden: true });
const mapbox = el('div', { class: 'mapbox' }, canvas, toast, hint, sheetBox);
const tools = el('div', { class: 'tools' });
app.append(bar1, bar2, mapbox, tools);
const ctx = canvas.getContext('2d');
const fogCanvas = document.createElement('canvas'); fogCanvas.width = MAP_N; fogCanvas.height = MAP_N;
const fogCtx = fogCanvas.getContext('2d'), fogImg = fogCtx.createImageData(MAP_N, MAP_N);

// camera in tile units: centre (cx, cy) and zoom z (screen px per tile)
const cam = { cx: MAP_C + 0.5, cy: MAP_C + 0.5, z: 0 };
let W = 360, H = 360, DPR = 1;
function resize() {
  const r = canvas.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width || 360; H = r.height || 360;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  if (!cam.z) cam.z = Math.min(W, H) / 13;
  clampCam();
}
const minZ = () => Math.min(W, H) / (MAP_N + 1), maxZ = () => Math.min(W, H) / 6;
function clampCam() {
  cam.z = Math.max(minZ(), Math.min(maxZ(), cam.z));
  const hw = W / cam.z / 2, hh = H / cam.z / 2;
  cam.cx = hw * 2 >= MAP_N ? MAP_N / 2 : Math.max(hw, Math.min(MAP_N - hw, cam.cx));
  cam.cy = hh * 2 >= MAP_N ? MAP_N / 2 : Math.max(hh, Math.min(MAP_N - hh, cam.cy));
}
const sx = (tx) => (tx - cam.cx) * cam.z + W / 2, sy = (ty) => (ty - cam.cy) * cam.z + H / 2;
const toTile = (px, py) => [Math.floor((px - W / 2) / cam.z + cam.cx), Math.floor((py - H / 2) / cam.z + cam.cy)];
function zoomAt(f, px = W / 2, py = H / 2) {
  const wx = (px - W / 2) / cam.z + cam.cx, wy = (py - H / 2) / cam.z + cam.cy;
  cam.z = Math.max(minZ(), Math.min(maxZ(), cam.z * f));
  cam.cx = wx - (px - W / 2) / cam.z; cam.cy = wy - (py - H / 2) / cam.z; clampCam();
}

// ---------------------------------------------------------------- input: tap to build or inspect; drag pans (or lays belts with the Belt tool); pinch or wheel zooms
const pointers = new Map();
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  drag = { moved: false, x0: e.offsetX, y0: e.offsetY, cx: cam.cx, cy: cam.cy, pinch: null, paint: null };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.cx, cy: cam.cy };
    drag.moved = true;
  } else if (tool === 'belt' && screen === 'run') drag.paint = { last: toTile(e.offsetX, e.offsetY) };
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !drag) return;
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (drag.pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], p = drag.pinch;
    const z = Math.max(minZ(), Math.min(maxZ(), p.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, p.d)));
    const wx = (p.mx - W / 2) / p.z + p.cx, wy = (p.my - H / 2) / p.z + p.cy;
    cam.z = z; cam.cx = wx - ((a.x + b.x) / 2 - W / 2) / z; cam.cy = wy - ((a.y + b.y) / 2 - H / 2) / z; clampCam();
  } else if (pointers.size === 1) {
    if (drag.paint) { paintTo(toTile(e.offsetX, e.offsetY)); drag.moved = drag.moved || drag.paint.painted; return; }
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
  else if (drag) { const [p] = pointers.values(); drag = { moved: true, x0: p.x, y0: p.y, cx: cam.cx, cy: cam.cy, pinch: null, paint: null }; }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });

// Belt painting: each step from one tile to the next points the belt you leave toward the one you enter.
function paintTo([tx, ty]) {
  const p = drag.paint;
  while (p.last[0] !== tx || p.last[1] !== ty) {
    const [lx, ly] = p.last, dx = tx - lx, dy = ty - ly;
    const d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    const [nx, ny] = [lx + DIRS[d][0], ly + DIRS[d][1]];
    layBelt(lx, ly, d); layBelt(nx, ny, d);
    p.last = [nx, ny]; p.painted = true;
  }
}
function layBelt(x, y, d) {
  const bd = inMap(x, y) && run.b.get(idx(x, y));
  if (bd) { if (bd.type === 'belt') bd.dir = d; return; }
  const why = place(run, meta, 'belt', x, y, d, null, live());
  if (why && why.startsWith('Needs')) say(why);
}

function tapTile(x, y) {
  if (!inMap(x, y)) return;
  if (isKeep(x, y)) { openSheet('keep'); return; }
  if (screen !== 'run' || tool === 'inspect' || tool === 'rotate') { sel = { x, y }; openSheet('tile'); return; }
  const bd = run.b.get(idx(x, y));
  if (bd && BUILD[bd.type].dir && bd.type === tool && tool !== 'source') { bd.dir = toolDir; return; } // same piece: re-aim it
  if (bd || (featureAt.get(idx(x, y)) && !(tool === 'extractor'))) { sel = { x, y }; openSheet('tile'); return; }
  const why = place(run, meta, tool, x, y, toolDir, toolEl, live());
  if (why) say(why); else { if (tool === 'source' && !(run.inv[toolEl] > 0)) pickSourceEl(); renderBars(); renderTools(); }
}
function say(msg) { toastMsg = msg; toastUntil = performance.now() + 3200; }
function openSheet(kind) { sheet = kind; renderSheet(true); }
function closeSheet() { sheet = null; sel = null; renderSheet(true); }

// ---------------------------------------------------------------- drawing
function draw(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0c0a10'; ctx.fillRect(0, 0, W, H);
  const z = cam.z, beatK = Math.min(1, run.beatClock / TUNING.beat);
  const x0 = Math.max(0, Math.floor(cam.cx - W / z / 2) - 1), x1 = Math.min(MAP_N - 1, Math.ceil(cam.cx + W / z / 2) + 1);
  const y0 = Math.max(0, Math.floor(cam.cy - H / z / 2) - 1), y1 = Math.min(MAP_N - 1, Math.ceil(cam.cy + H / z / 2) + 1);
  // ground, decoration, roads
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const r = regionOf(x, y), ring = ringOf(x, y), n = noise(x, y), c = REGION_COL[r];
    const k = 1 - ring * 0.07 + (n - 0.5) * 0.08;
    ctx.fillStyle = `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`;
    ctx.fillRect(sx(x), sy(y), z + 0.6, z + 0.6);
    if (n > 0.8 && !ROADS.road[idx(x, y)] && !featureAt.has(idx(x, y)) && !run.b.has(idx(x, y)) && r !== 'K') drawDeco(r, sx(x) + z / 2, sy(y) + z / 2, z, n);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
  for (const d of [7.5, 13.5]) ctx.strokeRect(sx(MAP_C + 0.5 - d), sy(MAP_C + 0.5 - d), 2 * d * z, 2 * d * z);
  ctx.fillStyle = '#cdb98e';
  const rw = z * 0.5;
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
  // extractor lines home (raw orbs are abstracted)
  ctx.setLineDash([z * 0.1, z * 0.2]); ctx.lineWidth = Math.max(1, z * 0.05);
  for (const bd of run.b.values()) {
    if (bd.type !== 'extractor') continue;
    const f = FEATURE_BY_ID[bd.vein]; ctx.strokeStyle = run.veins[bd.vein] > 0 ? ORB_COL[f.el] + '99' : 'rgba(200,200,200,.25)';
    ctx.lineDashOffset = -(now / 40) % (z * 0.3);
    ctx.beginPath(); ctx.moveTo(sx(f.x + 0.5), sy(f.y + 0.5)); ctx.lineTo(sx(MAP_C + 0.5), sy(MAP_C + 0.5)); ctx.stroke();
  }
  ctx.setLineDash([]);
  // the Keep
  const kx = sx(MAP_C - 1), ky = sy(MAP_C - 1);
  roundRect(kx + z * 0.15, ky + z * 0.15, z * 2.7, z * 2.7, z * 0.5, '#5b4e3a', '#d9c39a');
  emoji('🏰', kx + z * 1.5, ky + z * 1.5, z * 1.7);
  // fog (one pixel per tile, scaled up smoothly)
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
  // features
  for (const f of FEATURES) {
    if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
    const lit = isLit(run, f.x, f.y), seen = isSeen(meta, f.x, f.y);
    if (!lit && !seen && !(f.type === 'lair' && lairAwake(run, f))) continue;
    ctx.globalAlpha = lit ? 1 : 0.5;
    drawFeature(f, sx(f.x) + z / 2, sy(f.y) + z / 2, z, lit, now);
    ctx.globalAlpha = 1;
  }
  // buildings, then orbs on belts
  for (const bd of run.b.values()) if (bd.x >= x0 && bd.x <= x1 && bd.y >= y0 && bd.y <= y1) drawBuilding(bd, z, now);
  for (const [i, orb] of run.orbs) {
    const x = i % MAP_N, y = (i - x) / MAP_N, px = orb.px ?? x, py = orb.py ?? y;
    drawOrb(sx(px + (x - px) * beatK + 0.5), sy(py + (y - py) * beatK + 0.5), z * 0.17 * (orb.power > 1 ? 1.25 : 1), orb.el);
  }
  // foes
  for (const m of run.mobs) {
    if (!isLit(run, Math.floor(m.x), Math.floor(m.y))) continue;
    drawMob(m, sx(m.x), sy(m.y), z, now);
  }
  // shots
  for (const s of run.shots) {
    if (s.kind === 'mortar') { circle(sx(s.x), sy(s.y), z * 0.12, 'rgba(0,0,0,.35)'); drawOrb(sx(s.x), sy(s.y - s.h * 1.2), z * 0.16, s.orb.el); }
    else if (s.kind === 'lance') { ctx.strokeStyle = ORB_COL[s.orb.el]; ctx.lineWidth = z * 0.12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx(s.x - s.ux * 0.6), sy(s.y - s.uy * 0.6)); ctx.lineTo(sx(s.x), sy(s.y)); ctx.stroke(); ctx.lineCap = 'butt'; }
    else drawOrb(sx(s.x), sy(s.y), z * 0.13, s.orb.el);
  }
  for (const f of run.fx) drawFx(f, z);
  // selection and tower range
  if (sel && sheet === 'tile') {
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.strokeRect(sx(sel.x) + 1, sy(sel.y) + 1, z - 2, z - 2);
    const bd = run.b.get(idx(sel.x, sel.y));
    if (bd && BUILD[bd.type].tower) { ctx.strokeStyle = 'rgba(255,210,122,.6)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(sx(bd.x + 0.5), sy(bd.y + 0.5), BUILD[bd.type].range * z, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  }
}
function drawDeco(r, cx, cy, z, n) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = Math.max(1, z * 0.05);
  if (r === 'N') { ctx.beginPath(); ctx.moveTo(cx - z * 0.25, cy + z * 0.2); ctx.lineTo(cx, cy - z * 0.25); ctx.lineTo(cx + z * 0.25, cy + z * 0.2); ctx.fill(); }
  else if (r === 'E') { for (let k = 0; k < 3; k++) circle(cx + (k - 1) * z * 0.2, cy + ((k * 7 + n * 10) % 3 - 1) * z * 0.12, z * 0.05, 'rgba(255,170,90,0.45)'); }
  else if (r === 'S') { ctx.beginPath(); ctx.moveTo(cx - z * 0.3, cy); ctx.quadraticCurveTo(cx - z * 0.15, cy - z * 0.12, cx, cy); ctx.quadraticCurveTo(cx + z * 0.15, cy + z * 0.12, cx + z * 0.3, cy); ctx.stroke(); }
  else { circle(cx - z * 0.1, cy, z * 0.15, 'rgba(255,255,255,0.12)'); circle(cx + z * 0.1, cy - z * 0.05, z * 0.12, 'rgba(255,255,255,0.12)'); }
}
function drawFeature(f, cx, cy, z, lit, now) {
  if (f.type === 'vein') {
    if (f.buried && !relic(meta, 'rod')) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = `${z * 0.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⁂', cx, cy); return; }
    const left = run.veins[f.id], locked = f.gate && !run.opened.includes(f.gate);
    const s = z * (0.2 + 0.14 * Math.min(1, f.amount / 150));
    ctx.globalAlpha *= left <= 0 ? 0.35 : 1;
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 1.3); ctx.lineTo(cx + s, cy - s * 0.2); ctx.lineTo(cx + s * 0.6, cy + s); ctx.lineTo(cx - s * 0.6, cy + s); ctx.lineTo(cx - s, cy - s * 0.2); ctx.closePath();
    ctx.fillStyle = ORB_COL[f.el]; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(1, z * 0.05); ctx.stroke();
    if (locked) emoji('🔒', cx + z * 0.28, cy - z * 0.28, z * 0.32);
    if (lit && z > 22) label(`${fmt(left)}`, cx, cy + z * 0.42, z);
    return;
  }
  if (f.type === 'lair') {
    const st = run.lairs[f.id], awake = lairAwake(run, f);
    if (awake) { const p = 0.5 + 0.5 * Math.sin(now / 250); ctx.strokeStyle = `rgba(255,80,80,${0.4 + 0.4 * p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, z * (0.48 + 0.06 * p), 0, Math.PI * 2); ctx.stroke(); }
    circle(cx, cy, z * 0.42, st.dead ? '#3a3440' : f.final ? '#5a1830' : '#4a1c22');
    emoji(st.dead ? '✖️' : f.final ? '🐉' : '💀', cx, cy, z * 0.5);
    if (!st.dead && st.hp < TUNING.lairHp * f.p) bar(cx, cy - z * 0.58, z * 0.8, st.hp / (TUNING.lairHp * f.p), '#e0627a');
    return;
  }
  const done = has(meta, f.id) || run.opened.includes(f.id) || run.claimed.includes(f.id);
  if (f.type === 'gate') circle(cx, cy, z * 0.4, done ? 'rgba(255,255,255,.1)' : ORB_COL[f.need]);
  if (f.type === 'skygate') circle(cx, cy, z * 0.44, run.skyOpen ? 'rgba(255,255,255,.1)' : '#7a5ac8');
  if (PERMANENT.has(f.type) && !done && lit) { const p = 0.5 + 0.5 * Math.sin(now / 400 + f.x); circle(cx, cy, z * (0.36 + 0.05 * p), `rgba(255,214,120,${0.25 + 0.2 * p})`); }
  ctx.globalAlpha *= done && f.type !== 'waystone' ? 0.45 : 1;
  emoji(iconOf(f), cx, cy, z * 0.6);
}
// Forged orb: Glowing Core look (bright core, coloured glow, dark rim).
function drawOrb(x, y, r, elName) {
  const c = ORB_COL[elName];
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, c + 'aa'); g.addColorStop(1, c + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
  circle(x, y, r, 'rgba(20,14,24,.85)'); circle(x, y, r * 0.8, c); circle(x - r * 0.2, y - r * 0.2, r * 0.35, 'rgba(255,255,255,.75)');
}
function inLocal(bd, z, fn) { // draw in a frame where "up" is the building's facing
  ctx.save(); ctx.translate(sx(bd.x + 0.5), sy(bd.y + 0.5)); ctx.rotate((bd.dir || 0) * Math.PI / 2); fn(); ctx.restore();
}
function chevron(x, y, s, col) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.35); ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x, y - s * 0.4); ctx.lineTo(x + s, y + s * 0.6); ctx.stroke(); }
function drawBuilding(bd, z, now) {
  const T = BUILD[bd.type], cx = sx(bd.x + 0.5), cy = sy(bd.y + 0.5), h = z / 2;
  const flow = (run.beatClock / TUNING.beat) * z; // chevrons slide with the beat
  if (['belt', 'splitter', 'joiner'].includes(bd.type)) {
    inLocal(bd, z, () => {
      roundRectPath(-h * 0.86, -h, h * 1.72, z, z * 0.1); ctx.fillStyle = '#4b4038'; ctx.fill();
      ctx.fillStyle = '#3a3029'; ctx.fillRect(-h * 0.6, -h, h * 1.2, z);
      ctx.save(); ctx.beginPath(); ctx.rect(-h, -h, z, z); ctx.clip();
      for (let k = -1; k < 2; k++) chevron(0, h - ((flow + k * h) % z + z) % z + h * 0.1, z * 0.13, 'rgba(230,205,150,.45)');
      ctx.restore();
      if (bd.type === 'splitter') { ctx.fillStyle = '#7a6a9a'; circle(0, 0, z * 0.2, '#6a5a8a'); chevronSide(-1); chevronSide(1); }
      if (bd.type === 'joiner') { circle(0, 0, z * 0.2, '#4a6a5a'); chevron(0, -h * 0.55, z * 0.12, '#bfe8c9'); }
    });
    if (bd.type === 'joiner' || bd.type === 'splitter') emoji(T.icon, cx, cy, z * 0.3);
    return;
  }
  if (bd.type === 'beacon') {
    const pulse = 0.85 + 0.15 * Math.sin(now / 300 + bd.x);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, z * 0.9);
    g.addColorStop(0, `rgba(255,214,120,${0.55 * pulse})`); g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, z * 0.9, 0, Math.PI * 2); ctx.fill();
    circle(cx, cy + z * 0.12, z * 0.2, '#4a3a20'); circle(cx, cy - z * 0.05, z * 0.14 * pulse, '#ffd27a');
  } else if (bd.type === 'extractor') {
    emoji('⛏️', cx + z * 0.22, cy + z * 0.2, z * 0.42);
  } else if (bd.type === 'wall') {
    roundRect(cx - h * 0.85, cy - h * 0.85, z * 0.85, z * 0.85, z * 0.12, '#7a6a5a', '#3a3029'); emoji('🧱', cx, cy, z * 0.55);
  } else if (bd.type === 'source') {
    inLocal(bd, z, () => { ctx.fillStyle = '#d9c39a'; ctx.beginPath(); ctx.moveTo(-z * 0.14, -h * 0.72); ctx.lineTo(0, -h * 1.0); ctx.lineTo(z * 0.14, -h * 0.72); ctx.fill(); });
    roundRect(cx - h * 0.7, cy - h * 0.7, z * 0.7, z * 0.7, z * 0.18, '#3b3346', '#8a7aa0');
    const dim = bd.dormant > 0;
    ctx.globalAlpha = dim ? 0.45 : 1; drawOrb(cx, cy, z * 0.2 * (bd.ready ? 1.1 : 0.9), bd.el); ctx.globalAlpha = 1;
    if (dim) emoji('💤', cx + z * 0.25, cy - z * 0.25, z * 0.3);
  } else if (bd.type === 'mixer') {
    inLocal(bd, z, () => {
      roundRectPath(-h * 0.85, -h * 0.85, z * 0.85, z * 0.85, z * 0.2); ctx.fillStyle = '#3d3a2e'; ctx.fill();
      ctx.fillStyle = '#e0b55c'; ctx.beginPath(); ctx.moveTo(-z * 0.12, -h * 0.85); ctx.lineTo(0, -h * 1.05); ctx.lineTo(z * 0.12, -h * 0.85); ctx.fill();
    });
    emoji('⚗️', cx, cy, z * 0.5);
    bd.slots.forEach((o, k) => drawOrb(cx + (k ? 1 : -1) * z * 0.24, cy + z * 0.28, z * 0.09, o.el));
    if (mixerJammed(run, bd)) emoji('⚠️', cx + z * 0.3, cy - z * 0.3, z * 0.36);
  } else if (T.tower) {
    if (bd.type === 'trap') { ctx.globalAlpha = 0.9; circle(cx, cy, z * 0.38, 'rgba(60,40,80,.7)'); ctx.globalAlpha = 1; emoji(T.icon, cx, cy, z * 0.45); }
    else { circle(cx, cy, z * 0.44, '#2e2838'); ctx.strokeStyle = '#a89ac0'; ctx.lineWidth = Math.max(1, z * 0.05); ctx.stroke(); emoji(T.icon, cx, cy - z * 0.04, z * 0.52); }
    // magazine: next shot on the left
    const n = TUNING.magazine, w = z * 0.13;
    for (let k = 0; k < n; k++) {
      const ox = cx + (k - (n - 1) / 2) * w, oy = cy + z * 0.4, o = bd.mag[k];
      circle(ox, oy, w * 0.45, 'rgba(0,0,0,.55)');
      if (o) circle(ox, oy, w * 0.38, ORB_COL[o.el]);
    }
  }
  if (bd.hp < bd.maxHp) bar(cx, cy - z * 0.55, z * 0.7, bd.hp / bd.maxHp, '#e0b55c');
}
function chevronSide(s) { // splitter outputs, in the local frame
  const h = cam.z / 2; ctx.strokeStyle = '#d8c8ff'; ctx.lineWidth = Math.max(1.5, cam.z * 0.06);
  ctx.beginPath(); ctx.moveTo(s * h * 0.25, 0); ctx.lineTo(s * h * 0.85, 0); ctx.moveTo(s * h * 0.6, -h * 0.25); ctx.lineTo(s * h * 0.85, 0); ctx.lineTo(s * h * 0.6, h * 0.25); ctx.stroke();
}
function drawMob(m, x, y, z, now) {
  const r = z * (m.region === 'S' ? 0.17 : 0.24);
  if (m.flies) { circle(x, y + z * 0.25, r * 0.8, 'rgba(0,0,0,.3)'); y -= z * 0.12; ctx.fillStyle = MOB_COL[m.region]; ctx.beginPath(); ctx.moveTo(x - r * 2, y - r * 0.4); ctx.lineTo(x, y); ctx.lineTo(x + r * 2, y - r * 0.4); ctx.lineTo(x, y + r * 0.4); ctx.fill(); }
  circle(x, y, r + 1.5, '#1a0e12'); circle(x, y, r, m.freeze > 0 ? '#e6f7ff' : MOB_COL[m.region]);
  if (m.armour > 0) { ctx.strokeStyle = '#6a6a6a'; ctx.lineWidth = Math.max(2, z * 0.07); ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.stroke(); }
  if (m.shield) { ctx.strokeStyle = `rgba(255,140,40,${0.6 + 0.3 * Math.sin(now / 120)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + z * 0.1, 0, Math.PI * 2); ctx.stroke(); }
  if (m.soak > 0) circle(x + r * 0.6, y - r * 0.6, r * 0.32, '#3d9be8');
  if (m.burn) circle(x - r * 0.6, y - r * 0.6, r * (0.28 + 0.08 * Math.sin(now / 60)), '#ff7a33');
  if (m.slow) circle(x, y + r * 0.75, r * 0.28, '#8a6a40');
  if (m.attacking) emoji('⚔️', x + r, y - r, z * 0.25);
  if (m.hp < m.max) bar(x, y - r - z * 0.16, z * 0.5, m.hp / m.max, '#e0627a');
}
function drawFx(f, z) {
  const col = f.el ? ORB_COL[f.el] : '#e8e0c8', a = Math.min(1, f.ttl * 4);
  ctx.globalAlpha = a;
  if (f.type === 'line' || f.type === 'beam') { ctx.strokeStyle = col; ctx.lineWidth = f.type === 'beam' ? z * 0.16 : Math.max(1, z * 0.05); ctx.beginPath(); ctx.moveTo(sx(f.x), sy(f.y)); ctx.lineTo(sx(f.x2), sy(f.y2)); ctx.stroke(); }
  if (f.type === 'cone') { ctx.fillStyle = col + '66'; ctx.beginPath(); ctx.moveTo(sx(f.x), sy(f.y)); ctx.arc(sx(f.x), sy(f.y), f.r * z, f.a - f.cone, f.a + f.cone); ctx.closePath(); ctx.fill(); }
  if (f.type === 'ring') { ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, z * 0.08); ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), f.r * z * (1.1 - a * 0.3), 0, Math.PI * 2); ctx.stroke(); }
  if (f.type === 'pop') { circle(sx(f.x), sy(f.y), z * 0.3 * (1.4 - a), 'rgba(255,240,200,.5)'); }
  if (f.type === 'hurt') { circle(sx(f.x), sy(f.y), z * 0.5, 'rgba(255,60,60,.5)'); }
  if (f.type === 'blocked') emoji('🛡️', sx(f.x), sy(f.y) - z * 0.4, z * 0.3);
  if (f.type === 'fizzle') emoji('💨', sx(f.x), sy(f.y) - z * 0.3, z * 0.4);
  ctx.globalAlpha = 1;
}
function emoji(ch, x, y, size) { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(ch, x, y + size * 0.05); }
function circle(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill(); }
function bar(cx, y, w, frac, col) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(cx - w / 2, y, w, 3); ctx.fillStyle = col; ctx.fillRect(cx - w / 2, y, w * Math.max(0, frac), 3); }
function label(txt, x, y, z) { ctx.font = `600 ${Math.max(9, z * 0.26)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(txt, x, y); ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y); }
function roundRectPath(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function roundRect(x, y, w, h, r, fill, stroke) { roundRectPath(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }

// ---------------------------------------------------------------- status bars and build bar
const rawChip = (k, n) => el('span', { class: 'chip', title: `${ORBS[k].name}: raw orbs at the Keep` }, el('i', { class: 'raw', style: `background:${ORB_COL[k]}` }), fmt(n));
function renderBars() {
  const hpFrac = run.hp / run.hpMax, playing = speed > 0, canPlay = screen === 'run' && !run.over;
  const nextStir = Math.max(0, run.nextStir - run.t);
  bar1.replaceChildren(
    el('span', { class: 'gold' }, `🪙 ${fmt(run.gold)}`),
    el('div', { class: 'hp', title: 'Keep health' }, el('i', { style: `width:${(hpFrac * 100).toFixed(1)}%` }), el('span', {}, `🏰 ${fmt(run.hp)}/${run.hpMax}`)),
    el('span', { class: 'chip', title: `Nightfall ×${nightfall(run.t).toFixed(2)}. A sleeping lair stirs in ${clock(nextStir)}.` }, `🌙 ${clock(run.t)}`),
    btn(playing ? '❚❚' : '▶', () => { if (!canPlay) return; speed = playing ? 0 : lastSpeed; renderBars(); }, { primary: !playing && canPlay, disabled: !canPlay, small: true, title: playing ? 'Pause (build freely)' : 'Play' }),
    btn(`×${lastSpeed}`, () => { lastSpeed = lastSpeed === 1 ? 2 : lastSpeed === 2 ? 4 : 1; if (speed) speed = lastSpeed; renderBars(); }, { small: true, title: 'Game speed' }),
    btn('?', () => openSheet(sheet === 'help' ? null : 'help'), { small: true, title: 'How to play' }),
  );
  const raw = Object.keys(ORBS).filter((k) => (run.wallet[k] || 0) >= 1);
  const inv = Object.keys(ORBS).filter((k) => run.inv[k] > 0);
  bar2.replaceChildren(...[
    ...(raw.length ? raw.map((k) => rawChip(k, run.wallet[k])) : [el('span', { class: 'sub' }, 'No raw orbs yet')]),
    inv.length ? el('span', { class: 'sub' }, '· in hand:') : null,
    ...inv.map((k) => el('span', { class: 'chip', title: `${ORBS[k].name} Source ready to place` }, el('i', { class: 'forged', style: `color:${ORB_COL[k]};background:${ORB_COL[k]}` }), `×${run.inv[k]}`)),
    el('span', { style: 'flex:1' }),
    btn('🏰 Keep', () => openSheet(sheet === 'keep' ? null : 'keep'), { small: true, on: sheet === 'keep' }),
  ].filter(Boolean));
  hint.replaceChildren(...(screen === 'run' && !sheet ? [el('span', {}, toolHint())] : []));
}
function toolHint() {
  if (tool === 'inspect') return speed ? 'Tap anything to inspect it.' : 'Paused: pick a piece, tap the map, then ▶.';
  if (tool === 'rotate') return 'Pieces face this way when placed. Tap again to turn.';
  const T = BUILD[tool];
  const extra = tool === 'belt' ? ' · drag to lay a line' : tool === 'source' ? (toolEl ? ` · ${ORBS[toolEl].name} (tap 🔮 again to switch)` : ' · buy one at the Keep first') : '';
  return `${T.name}${T.dir ? ' ' + ARROWS[toolDir] : ''} · ${buildCost(run, meta, tool)} 🪙${extra}`;
}
function pickSourceEl() {
  const have = Object.keys(ORBS).filter((k) => run.inv[k] > 0);
  if (!have.length) { toolEl = null; return; }
  toolEl = have[(have.indexOf(toolEl) + 1) % have.length];
}
function renderTools() {
  tools.replaceChildren(...TOOL_ORDER.map((k) => {
    if (k === 'inspect') return el('button', { class: 'tool' + (tool === k ? ' on' : ''), onclick: () => { tool = k; renderTools(); renderBars(); } }, el('span', { class: 'ic' }, '👆'), el('span', {}, 'Inspect'));
    if (k === 'rotate') return el('button', { class: 'tool', onclick: () => { toolDir = (toolDir + 1) % 4; renderTools(); renderBars(); }, title: 'Facing for new pieces' }, el('span', { class: 'ic' }, ARROWS[toolDir]), el('span', {}, 'Facing'));
    const T = BUILD[k], locked = T.blueprint && !towerKnown(meta, k);
    const cost = k === 'source' ? `×${Object.values(run.inv).reduce((a, b) => a + b, 0)}` : buildCost(run, meta, k);
    return el('button', {
      class: 'tool' + (tool === k ? ' on' : '') + (locked ? ' locked' : ''), title: T.name,
      onclick: () => {
        if (locked) { say(`🔒 ${T.name}: find its blueprint out in ${REGIONS[regionOf(FEATURE_BY_ID[T.blueprint].x, FEATURE_BY_ID[T.blueprint].y)].name}.`); return; }
        if (k === 'source') { if (tool === 'source' || !toolEl || !(run.inv[toolEl] > 0)) pickSourceEl(); }
        tool = k; if (sheet === 'tile') closeSheet(); renderTools(); renderBars();
      },
    }, locked ? el('span', { class: 'lock' }, '🔒') : null, el('span', { class: 'ic', style: k === 'source' && toolEl ? `filter: drop-shadow(0 0 4px ${ORB_COL[toolEl]})` : null }, T.icon), el('span', { class: 'cost' }, k === 'source' ? cost : `${cost}`));
  }));
}

// ---------------------------------------------------------------- sheets
let sheetSig = '';
function renderSheet(force) {
  let node = null;
  if (screen === 'between') node = betweenSheet();
  else if (sheet === 'keep') node = keepSheet();
  else if (sheet === 'help') node = helpSheet();
  else if (sheet === 'tile' && sel) node = tileSheet();
  sheetBox.hidden = !node;
  sheetBox.classList.toggle('full', screen === 'between' || sheet === 'help');
  if (!node) { sheetSig = ''; return; }
  const sig = sheet + node.outerHTML;
  if (!force && sig === sheetSig) return;
  sheetSig = sig; const top = sheetBox.scrollTop; sheetBox.replaceChildren(node); sheetBox.scrollTop = top;
  renderBars();
}
const act = (fn) => () => { const why = fn(); if (why) say(why); persist(); renderSheet(true); renderBars(); renderTools(); };
const head = (title, sub) => el('div', { class: 'title' }, el('h2', {}, title), el('div', { class: 'row' }, sub ? el('span', { class: 'sub' }, sub) : null, btn('✕', closeSheet, { small: true })));

function tileSheet() {
  const { x, y } = sel, r = regionOf(x, y), f = featureAt.get(idx(x, y)), bd = run.b.get(idx(x, y));
  const lit = isLit(run, x, y), seen = isSeen(meta, x, y), canAct = screen === 'run' && !run.over;
  const where = `${REGIONS[r] ? REGIONS[r].name : 'Keep'} · ring ${ringOf(x, y)}`;
  if (bd) return buildingCard(bd, where, canAct);
  const card = el('div', {}, head(f ? featureName(f) : isRoad(x, y) ? 'Road' : 'Open ground', where));
  if (!lit) {
    if (isVeiled(x, y) && !run.skyOpen) card.append(el('p', { class: 'muted' }, 'Veiled by the storm. Light can’t reach here until the Sky Gate opens.'));
    else if (!seen) { card.append(el('p', { class: 'muted' }, 'Lost in the fog. Push your light out with beacons.')); return card; }
    else card.append(el('p', { class: 'muted' }, 'Remembered from an earlier run. Light it again to use it.'));
    if (!f || !seen) return card;
  }
  if (!f) {
    card.append(el('p', { class: 'sub' }, isRoad(x, y) ? 'Foes walk this road to the Keep. Solid pieces here block them (and get attacked); belts and Rune Traps can be walked over.' : 'Pick a piece in the build bar, then tap here.'));
    return card;
  }
  switch (f.type) {
    case 'vein': {
      if (f.buried && !relic(meta, 'rod')) { card.append(el('p', {}, 'Odd markings in the ground… something lies buried here. A dowsing rod would find it.')); break; }
      const left = run.veins[f.id];
      card.append(el('p', {}, `${ORBS[f.el].name} vein: ${fmt(left)} / ${f.amount} raw orbs left.`));
      if (f.gate && !run.opened.includes(f.gate)) card.append(el('p', { class: 'bad' }, `Sealed behind the ${FEATURE_BY_ID[f.gate].name}.`));
      else card.append(btn(`⛏ Build extractor · ${BUILD.extractor.cost} 🪙`, act(() => place(run, meta, 'extractor', x, y, 0, null, live())), { primary: true, disabled: !canAct || !lit }));
      break;
    }
    case 'lair': {
      const st = run.lairs[f.id], k = MOBS[regionOf(f.x, f.y)];
      card.append(el('p', {}, `Sends ${k.name}s (strength ${f.p})${f.final ? ' — the map’s final lair' : ''}.`));
      card.append(el('p', { class: st.dead ? 'good' : lairAwake(run, f) ? 'bad' : 'muted' }, st.dead ? 'Destroyed this run.' : lairAwake(run, f) ? `Awake. Health ${fmt(st.hp)}/${TUNING.lairHp * f.p}. Towers in range shell it when no foe is near.` : 'Asleep. It wakes when your light reaches it, or when the dark stirs it.'));
      card.append(el('p', { class: 'sub' }, `Counter: ${REGIONS[regionOf(f.x, f.y)].counter}.`));
      break;
    }
    case 'gate': {
      const open = run.opened.includes(f.id);
      card.append(el('p', {}, open ? 'Open for this run.' : `Feed it ${f.n} raw ${ORBS[f.need].name.toLowerCase()} orbs from the Keep.`));
      if (!open) card.append(btn(`Feed ${f.n} (have ${fmt(run.wallet[f.need] || 0)})`, act(() => feedGate(run, f)), { primary: true, disabled: !canAct || !lit || (run.wallet[f.need] || 0) < f.n }));
      break;
    }
    case 'skygate':
      card.append(el('p', {}, run.skyOpen ? 'Open: the Skyspire is lit for this run.' : `Opens with the three seals. You hold ${seals(meta)}/3.`));
      if (!run.skyOpen) card.append(btn('Open the Sky Gate', act(() => openSky(run, meta, f)), { primary: true, disabled: !canAct || !lit || seals(meta) < 3 }));
      break;
    case 'lore': card.append(el('p', {}, el('i', {}, f.text))); break;
    case 'ancient':
      card.append(el('p', {}, `An Ancient ${ORBS[f.orb].name} Source sleeps here. Claim it into your hand for this run.`));
      card.append(btn(run.claimed.includes(f.id) ? 'Claimed' : 'Claim (free)', act(() => claimAncient(run, f)), { primary: true, disabled: !canAct || !lit || run.claimed.includes(f.id) }));
      break;
    default: {
      const got = has(meta, f.id);
      const what = { blueprint: `Unlocks the ${BUILD[f.tower] ? BUILD[f.tower].name : ''} for every run.`, recipe: `Unlocks the ${ORBS[f.orb || 'storm'].name} recipe (Keep alchemy and Mixers).`, relic: f.info, seal: 'One of three seals for the Sky Gate.', waystone: 'Attune it, and later runs can start with light here.' }[f.type];
      card.append(el('p', {}, what, ' ', el('span', { class: 'tag perm' }, 'kept forever')));
      card.append(btn(got ? (f.type === 'waystone' ? 'Attuned' : 'Found') : f.type === 'waystone' ? 'Attune' : 'Take', act(() => take(run, meta, f)), { primary: !got, disabled: !canAct || !lit || got }));
    }
  }
  return card;
}
function buildingCard(bd, where, canAct) {
  const T = BUILD[bd.type], card = el('div', {}, head(bd.type === 'source' ? `${ORBS[bd.el].name} Source` : T.name, where));
  card.append(el('p', { class: 'sub' }, T.info));
  if (T.tower) {
    card.append(el('p', {}, `Range ${T.range} · every ${T.cd}s · damage ×${T.mult}${T.radius ? ` · splash ${T.radius}` : ''}`));
    card.append(el('p', {}, 'Magazine (fires left first): ', bd.mag.length ? bd.mag.map((o) => ORBS[o.el].icon + (o.power > 1 ? '⁺' : '')).join(' ') : el('span', { class: 'bad' }, 'empty — feed it from a Source or belt')));
  }
  if (bd.type === 'source') card.append(el('p', {}, `${sourceRate(bd.el)} forged orb a second, out of its front. ${EFFECTS[bd.el].info}`, bd.dormant > 0 ? el('span', { class: 'bad' }, ' Dormant (just moved).') : ''));
  if (bd.type === 'mixer') card.append(el('p', { class: mixerJammed(run, bd) ? 'bad' : '' }, mixerJammed(run, bd) ? '⚠ Jammed: more than two inputs, or something feeds its output side.' : `Holding: ${bd.slots.map((o) => ORBS[o.el].icon).join(' ') || 'nothing'}`));
  if (bd.type === 'extractor') card.append(el('p', {}, `${fmt(run.veins[bd.vein])} raw orbs left in the vein.`));
  if (bd.hp < bd.maxHp) card.append(el('p', { class: 'sub' }, `Health ${fmt(bd.hp)}/${bd.maxHp}`));
  const row = el('div', { class: 'row' });
  if (T.dir) row.append(...ARROWS.map((a, d) => btn(a, act(() => rotateAt(run, bd.x, bd.y, d)), { small: true, on: bd.dir === d, disabled: !canAct })));
  const refund = bd.type === 'source' ? 'Pick up' : `Remove (+${live() ? Math.floor(bd.paid / 2) : bd.paid} 🪙)`;
  row.append(btn(refund, act(() => { const why = removeAt(run, meta, bd.x, bd.y, live()); closeSheet(); return why; }), { small: true, disabled: !canAct }));
  card.append(row);
  if (bd.type === 'source') card.append(el('p', { class: 'sub' }, 'Picking up is free; place it again from the 🔮 tool. Moved while playing, it sleeps 3 s.'));
  else card.append(el('p', { class: 'sub' }, 'Full refund while paused, half while playing.'));
  return card;
}
function featureName(f) {
  if (f.type === 'vein') return f.buried && !relic(meta, 'rod') ? 'Odd markings' : `${ORBS[f.el].name} vein`;
  if (['lair', 'gate', 'skygate', 'blueprint', 'relic', 'seal'].includes(f.type)) return f.name;
  if (f.type === 'recipe') return `Recipe tablet: ${ORBS[f.orb].name}`;
  return { lore: 'Lore stone', waystone: 'Waystone', ancient: 'Ancient Source' }[f.type];
}

let mergeA = 'fire', mergeB = 'water';
function keepSheet() {
  const card = el('div', {}, head('🏰 The Keep', `${run.kills} foes felled`));
  const can = screen === 'run' && !run.over;
  const have = Object.keys(ORBS).filter((k) => (run.wallet[k] || 0) >= 1);
  const opts = (cur) => Object.keys(ORBS).filter((k) => have.includes(k) || k === cur).map((k) => el('option', { value: k, selected: k === cur }, `${ORBS[k].name} (${fmt(run.wallet[k] || 0)})`));
  const out = mergeResult(meta, mergeA, mergeB), s = TUNING.mergeStep;
  card.append(el('h3', {}, 'Buy a Source (it goes into your hand)'));
  if (!have.length) card.append(el('p', { class: 'sub' }, 'Bank raw orbs first: build extractors on veins.'));
  const list = el('div', { class: 'list' });
  for (const k of have) {
    const price = sourcePrice(k), ok = (run.wallet[k] || 0) >= price;
    list.append(el('div', { class: 'item' },
      el('div', {}, rawChip(k, run.wallet[k]), ` → ${ORBS[k].name} Source · ${price}`, el('div', { class: 'info' }, EFFECTS[k].info)),
      el('div', { class: 'row' }, btn('Buy', act(() => buySource(run, k)), { small: true, primary: ok, disabled: !can || !ok }),
        run.inv[k] > 0 ? btn(`Sell 1 (+${Math.floor(price / 2)})`, act(() => sellSource(run, k)), { small: true, disabled: !can }) : null)));
  }
  card.append(list);
  card.append(el('h3', {}, 'Alchemy (raw orbs, can’t be undone)'),
    el('div', { class: 'row' },
      el('select', { onchange: (e) => { mergeA = e.target.value; renderSheet(true); } }, opts(mergeA)), '+',
      el('select', { onchange: (e) => { mergeB = e.target.value; renderSheet(true); } }, opts(mergeB)),
      el('span', {}, '→ ', out ? ORBS[out].name : RECIPES[recipeKey(mergeA, mergeB)] ? '🔒 recipe not found' : '✖ no recipe'),
      btn(`Merge ${s}+${s}→${s}`, act(() => merge(run, meta, mergeA, mergeB)), { small: true, primary: !!out, disabled: !can || !out || (run.wallet[mergeA] || 0) < s || (run.wallet[mergeB] || 0) < s })));
  if (can) card.append(el('div', { class: 'row', style: 'margin-top:8px' }, btn('Abandon run', () => { if (confirm('End this run now? You still earn Echoes.')) finishRun(); }, { small: true })));
  return card;
}
function helpSheet() {
  const rows = TOOL_ORDER.filter((k) => BUILD[k]).map((k) => el('div', {}, `${BUILD[k].icon} `, el('b', {}, BUILD[k].name), ` — ${BUILD[k].info}`));
  return el('div', {}, head('How to play'),
    el('p', {}, 'Light the fog with beacons, put extractors on veins to bank raw orbs at the Keep, buy Sources there, place them, and belt their forged orbs into towers. Towers fire their orbs in the order they arrived. Lairs wake when your light reaches them, and every 2½ minutes the dark stirs one anyway.'),
    el('p', { class: 'sub' }, 'Drag pans the map (with the Belt tool, dragging lays belts). Pinch or scroll to zoom. ⏸ pauses: building while paused refunds in full.'),
    el('h3', {}, 'Pieces'), el('div', { class: 'list', style: 'font-size:12px' }, ...rows),
    el('h3', {}, 'Elements'), el('div', { class: 'list', style: 'font-size:12px' }, ...Object.keys(EFFECTS).map((k) => el('div', {}, el('i', { class: 'forged', style: `color:${ORB_COL[k]};background:${ORB_COL[k]}` }), ` ${ORBS[k].name}: ${EFFECTS[k].info}`))),
    el('h3', {}, 'Foes'), el('div', { class: 'list', style: 'font-size:12px' }, ...FRONTS.map((r) => el('div', {}, el('b', {}, `${REGIONS[r].name}: ${MOBS[r].name}s. `), `Counter: ${REGIONS[r].counter}.`))),
    el('h3', {}, 'Map'), el('div', { class: 'grid2' }, ...[['💀', 'Lair'], ['◆', 'Vein'], ['🚪', 'Gate (feed orbs)'], ['📐', 'Blueprint'], ['📖', 'Recipe tablet'], ['🪄🏮', 'Relics'], ['💠', 'Seal'], ['🗿', 'Waystone'], ['✨', 'Ancient Source'], ['🪧', 'Lore stone'], ['⁂', 'Odd markings'], ['⛩️', 'Sky Gate']].map(([i, t]) => el('span', {}, `${i} ${t}`))));
}
function betweenSheet() {
  const card = el('div', {});
  if (lastResult) {
    const p = lastResult.parts;
    card.append(el('h2', {}, `The Keep has fallen — run ${meta.runs}`),
      el('p', {}, `Survived ${clock(lastResult.t)}, felled ${lastResult.kills} foes. Echoes: `, el('b', { class: 'goldc' }, `+${lastResult.total}`)),
      el('p', { class: 'sub' }, `Explored ${p.explored} · lairs ${p.lairs} · foes ${p.foes} · secrets ${p.secrets} · survival ${p.survived}`));
    if (lastResult.found.length) card.append(el('p', {}, 'Kept forever: ', lastResult.found.map((id) => featureName(FEATURE_BY_ID[id])).join(', ')));
  } else {
    card.append(el('h2', {}, meta.runs ? 'Between runs' : 'Orbforge · The Crossroads'),
      el('p', {}, 'Four lands surround your Keep. Push your light outward, mine veins, buy Sources, and belt glowing orbs into towers to hold the roads as night deepens.'),
      el('p', { class: 'sub' }, 'When the Keep falls, the run ends. Map memory, finds and Echoes stay, so the next run can take another road. Tap ? in game for help.'));
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
  if (upg(meta, 'founding')) card.append(el('h3', {}, 'Founding Source'), el('div', { class: 'row' }, ...['fire', 'water', 'earth'].map((k) => btn(ORBS[k].name, act(() => { meta.foundingEl = k; }), { small: true, on: meta.foundingEl === k }))));
  const ways = FEATURES.filter((f) => f.type === 'waystone' && has(meta, f.id));
  if (ways.length) card.append(el('h3', {}, 'Start with light at'), el('div', { class: 'row' }, ...ways.map((f) => {
    const on = meta.startAt.includes(f.id);
    return btn(`🗿 ${REGIONS[regionOf(f.x, f.y)].name}`, act(() => { meta.startAt = on ? meta.startAt.filter((i) => i !== f.id) : [...meta.startAt, f.id]; }), { small: true, on });
  })), el('p', { class: 'sub' }, 'Careful: light far out wakes lairs early.'));
  const found = FEATURES.filter((f) => PERMANENT.has(f.type) && f.type !== 'waystone' && has(meta, f.id));
  card.append(el('h3', {}, `Finds kept forever (${found.length})`), el('p', { class: 'sub' }, found.length ? found.map(featureName).join(' · ') : 'None yet. Blueprints, recipe tablets, relics and seals hide out in the rings.'));
  card.append(el('label', { class: 'row sub', style: 'margin-top:8px' }, el('input', { type: 'checkbox', checked: meta.testAll, onchange: (e) => { meta.testAll = e.target.checked; persist(); renderTools(); } }), 'Test mode: every tower and recipe unlocked'));
  card.append(el('div', { class: 'row', style: 'margin-top:10px' }, btn(meta.runs ? `Begin run ${meta.runs + 1}` : 'Begin first run', startRun, { primary: true }),
    meta.runs ? btn('Reset all progress', () => { if (confirm('Forget every run, find and Echo?')) { meta = newMeta(); lastResult = null; persist(); run = newRun(meta); renderAll(); } }, { small: true }) : null));
  return card;
}

// ---------------------------------------------------------------- run lifecycle
function startRun() {
  run = newRun(meta); screen = 'run'; speed = 0; sheet = null; sel = null; lastResult = null; tool = 'inspect'; toolEl = null;
  say('Paused for building. Light the fog, mine veins, then ▶.');
  persist(); renderAll();
}
function finishRun() {
  speed = 0;
  const res = endRun(run, meta);
  lastResult = { ...res, t: run.t, kills: run.kills, found: run.newFound.slice() };
  screen = 'between'; sheet = null; persist(); renderAll();
}
function renderAll() { renderBars(); renderTools(); renderSheet(true); }

let last = performance.now(), uiClock = 0, saveClock = 0;
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  if (screen === 'run' && speed > 0 && !run.over) {
    let left = real * speed;
    while (left > 1e-6) {
      const dt = Math.min(0.05, left); left -= dt;
      for (const ev of tick(run, meta, dt)) {
        if (ev.type === 'lair') say(ev.final ? '🐉 The Storm Eyrie falls! The Crossroads are yours (end of the demo map).' : `💀 ${FEATURE_BY_ID[ev.id].name} destroyed! +${TUNING.lairBounty * FEATURE_BY_ID[ev.id].p} 🪙`);
        if (ev.type === 'stir') say(`🌙 The dark stirs: ${FEATURE_BY_ID[ev.id].name} wakes in ${REGIONS[regionOf(FEATURE_BY_ID[ev.id].x, FEATURE_BY_ID[ev.id].y)].name}.`);
        if (ev.type === 'depleted') say(`${ORBS[FEATURE_BY_ID[ev.id].el].name} vein drawn dry.`);
        if (ev.type === 'broken') say(`Foes broke your ${BUILD[ev.what].name}!`);
      }
      if (run.over) { finishRun(); break; }
    }
    uiClock += real; saveClock += real;
    if (uiClock > 0.25) { uiClock = 0; renderBars(); renderSheet(false); }
    if (saveClock > 5) { saveClock = 0; persist(); }
  }
  const shown = toastMsg && now < toastUntil ? toastMsg : '';
  if (shown !== toast.dataset.msg) { toast.dataset.msg = shown; toast.replaceChildren(...(shown ? [el('span', {}, shown)] : [])); }
  draw(now);
  requestAnimationFrame(frame);
}
new ResizeObserver(() => resize()).observe(canvas);
resize(); renderAll();
requestAnimationFrame(frame);
