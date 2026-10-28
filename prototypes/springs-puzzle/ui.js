// Orbforge puzzle demo: page. Run controls on top, the level (canvas) in the middle, the piece bar at the bottom; sheets for inspect, goals and help.
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
const btn = (label, onclick, opts = {}) => el('button', { class: 'btn' + (opts.primary ? ' primary' : '') + (opts.small ? ' small' : '') + (opts.on ? ' on' : ''), onclick, disabled: opts.disabled, title: opts.title }, label);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmtRate = (v) => (Math.round(v * 100) / 100).toString();

// ---------------------------------------------------------------- saved progress (layout and unlocks)
const SAVE_KEY = 'orbforge-springs-v1';
let st = newState();
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) st = deserialize(raw); } catch (e) { /* storage unavailable or old save */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, serialize(st)); } catch (e) { /* storage unavailable */ } };

let sheet = null, sel = null, tool = 'inspect', toolDir = 0, speed = 1, acc = 0, toastMsg = '', toastUntil = 0, reach = reachable(st);
const ORB_COL = { fire: '#ff7a33', water: '#3d9be8', earth: '#b8864a', air: '#d6f0fa', steam: '#dfe6ee', magma: '#ff4a1a', mud: '#7d5a38', lightning: '#ffe04b', ice: '#a6ecff', dust: '#d9c08a' };
const TOOL_ORDER = ['inspect', 'belt', 'splitter', 'joiner', 'mixer', 'demerger', 'underpass', 'wellspring', 'erase', 'facing'];
let tunnelStart = null; // first tap of an underpass: its entrance
const KIND_TEXT = {
  door: 'Door: keep the flow at the rate for 4 s and it opens for good.',
  held: 'Held gate: open only while the flow keeps coming. It drops when the run ends.',
  bridge: 'Bridge: pour in the total and the bridge is built for good.',
  rune: 'Rune lock: an alternating sequence at the rate, held for 4 s, opens it for good.',
  scales: 'Scales: both pans at the rate and equal to each other, held for 4 s.',
  shrine: 'Shrine (optional): no door, just a reward.',
};

// ---------------------------------------------------------------- layout
const app = document.getElementById('app');
const bar1 = el('div', { class: 'bar1' }), bar2 = el('div', { class: 'row' });
const canvas = el('canvas');
const toast = el('div', { class: 'toast' }), hint = el('div', { class: 'hint' }), sheetBox = el('div', { class: 'sheet', hidden: true });
const mapbox = el('div', { class: 'mapbox' }, canvas, toast, hint, sheetBox);
const tools = el('div', { class: 'tools' });
app.append(bar1, bar2, mapbox, tools);
const ctx = canvas.getContext('2d');

const cam = { cx: 13.5, cy: 28.5, z: 0 };
let Wc = 360, Hc = 360, DPR = 1;
function resize() {
  const r = canvas.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2);
  Wc = r.width || 360; Hc = r.height || 360;
  canvas.width = Math.round(Wc * DPR); canvas.height = Math.round(Hc * DPR);
  if (!cam.z) cam.z = Math.min(Wc / 9.5, Hc / 9);
  clampCam();
}
const minZ = () => Math.min(Wc / (W + 1), Hc / (H + 1)), maxZ = () => Math.min(Wc, Hc) / 5;
function clampCam() {
  cam.z = Math.max(minZ(), Math.min(maxZ(), cam.z));
  const hw = Wc / cam.z / 2, hh = Hc / cam.z / 2, m = 1.5; // a little margin so edges can be pulled clear of the sheets
  cam.cx = hw * 2 >= W + 2 * m ? W / 2 : Math.max(hw - m, Math.min(W + m - hw, cam.cx));
  cam.cy = hh * 2 >= H + 2 * m ? H / 2 : Math.max(hh - m, Math.min(H + m - hh, cam.cy));
}
const sx = (tx) => (tx - cam.cx) * cam.z + Wc / 2, sy = (ty) => (ty - cam.cy) * cam.z + Hc / 2;
const toTile = (px, py) => [Math.floor((px - Wc / 2) / cam.z + cam.cx), Math.floor((py - Hc / 2) / cam.z + cam.cy)];
function zoomAt(f, px = Wc / 2, py = Hc / 2) {
  const wx = (px - Wc / 2) / cam.z + cam.cx, wy = (py - Hc / 2) / cam.z + cam.cy;
  cam.z = Math.max(minZ(), Math.min(maxZ(), cam.z * f));
  cam.cx = wx - (px - Wc / 2) / cam.z; cam.cy = wy - (py - Hc / 2) / cam.z; clampCam();
}

// ---------------------------------------------------------------- input: tap builds or inspects; drag pans (Belt lays a line, Erase wipes); pinch or wheel zooms
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
  } else if (tool === 'belt' || tool === 'erase') drag.paint = { last: toTile(e.offsetX, e.offsetY), painted: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !drag) return;
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (drag.pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], p = drag.pinch;
    const z = Math.max(minZ(), Math.min(maxZ(), p.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, p.d)));
    const wx = (p.mx - Wc / 2) / p.z + p.cx, wy = (p.my - Hc / 2) / p.z + p.cy;
    cam.z = z; cam.cx = wx - ((a.x + b.x) / 2 - Wc / 2) / z; cam.cy = wy - ((a.y + b.y) / 2 - Hc / 2) / z; clampCam();
  } else if (pointers.size === 1) {
    if (drag.paint) { paintTo(toTile(e.offsetX, e.offsetY)); if (drag.paint.painted) drag.moved = true; return; }
    const dx = e.offsetX - drag.x0, dy = e.offsetY - drag.y0;
    if (Math.hypot(dx, dy) > 7) drag.moved = true;
    if (drag.moved) { cam.cx = drag.cx - dx / cam.z; cam.cy = drag.cy - dy / cam.z; clampCam(); }
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (drag && !drag.moved && pointers.size === 0) tapTile(...toTile(e.offsetX, e.offsetY));
  if (pointers.size === 0) { if (drag && drag.paint && drag.paint.painted) changed(); drag = null; }
  else if (drag) { const [p] = pointers.values(); drag = { moved: true, x0: p.x, y0: p.y, cx: cam.cx, cy: cam.cy, pinch: null, paint: null }; }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });

// Belt painting: each step points the belt you leave toward the tile you enter. Erase wipes what you drag over.
function paintTo([tx, ty]) {
  const p = drag.paint;
  if (tool === 'erase') { if (p.last[0] !== tx || p.last[1] !== ty) { eraseAt(...p.last); eraseAt(tx, ty); p.last = [tx, ty]; p.painted = true; } return; }
  while (p.last[0] !== tx || p.last[1] !== ty) {
    const [lx, ly] = p.last, dx = tx - lx, dy = ty - ly;
    const d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    const nx = lx + DIRS[d][0], ny = ly + DIRS[d][1];
    layBelt(lx, ly, d); layBelt(nx, ny, d);
    p.last = [nx, ny]; p.painted = true;
  }
}
function layBelt(x, y, d) {
  const p = inMap(x, y) && pieceAt(st, x, y);
  if (p) { if (p.type === 'belt') p.dir = d; return; }
  place(st, 'belt', x, y, d);
}
function eraseAt(x, y) { const p = inMap(x, y) && pieceAt(st, x, y); if (p && p.type !== 'wellspring') remove(st, x, y); }

function tapTile(x, y) {
  if (!inMap(x, y)) return;
  const i = idx(x, y), p = st.pieces[i];
  if (tool === 'inspect' || tool === 'facing' || RECEPTOR.has(i)) { sel = { x, y }; openSheet('tile'); return; }
  if (tool === 'erase') { if (p) { const why = remove(st, x, y); if (why) say(why); else changed(); } return; }
  if (tool === 'underpass' && !p) {
    if (!tunnelStart) { const why = canPlace(st, 'underpass', x, y); if (why) say(why); else { tunnelStart = { x, y }; renderBars(); } return; }
    if (tunnelStart.x === x && tunnelStart.y === y) { tunnelStart = null; renderBars(); return; }
    const why = placeUnderpass(st, tunnelStart.x, tunnelStart.y, x, y);
    if (why) say(why); else { tunnelStart = null; changed(); }
    return;
  }
  if (p) {
    if (p.type === tool && p.type !== 'wellspring' && p.type !== 'underpass') { p.dir = toolDir; changed(); return; } // same piece: re-aim it
    sel = { x, y }; openSheet('tile'); return;
  }
  const why = place(st, tool, x, y, toolDir);
  if (why && BARRIER.has(i)) { sel = { x, y }; openSheet('tile'); say(why); } // a closed door: show what opens it
  else if (why) say(why);
  else { changed(); if (tool === 'wellspring') { sel = { x, y }; openSheet('tile'); } }
}
function say(msg, ms = 3200) { toastMsg = msg; toastUntil = performance.now() + ms; }
function openSheet(kind) { sheet = kind; renderSheet(true); renderBars(); }
function closeSheet() { sheet = null; sel = null; renderSheet(true); renderBars(); }
function changed() { reach = reachable(st); persist(); renderBars(); renderTools(); renderSheet(true); }

// ---------------------------------------------------------------- drawing
function draw(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0b0a0f'; ctx.fillRect(0, 0, Wc, Hc);
  const z = cam.z, k = st.run ? Math.min(1, acc / (BEAT / speed)) : 0;
  const x0 = Math.max(0, Math.floor(cam.cx - Wc / z / 2) - 1), x1 = Math.min(W - 1, Math.ceil(cam.cx + Wc / z / 2) + 1);
  const y0 = Math.max(0, Math.floor(cam.cy - Hc / z / 2) - 1), y1 = Math.min(H - 1, Math.ceil(cam.cy + Hc / z / 2) + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y);
    if (!st.seen[i]) continue;
    drawTile(x, y, z, now);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y);
    if (!st.seen[i]) continue;
    if (RECEPTOR.has(i)) drawReceptor(x, y, z, now);
    const p = st.pieces[i];
    if (p) drawPiece(p, z, now);
  }
  if (st.run) for (const [i, orb] of st.run.orbs) {
    const x = i % W, y = (i - x) / W, px = orb.px ?? x, py = orb.py ?? y;
    drawOrb(sx(px + (x - px) * k + 0.5), sy(py + (y - py) * k + 0.5), z * 0.17, orb.el);
  }
  // dim what you can see but not reach
  ctx.fillStyle = 'rgba(8,6,12,.5)';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = idx(x, y); if (st.seen[i] && !reach[i] && GRID[y][x] !== '#') ctx.fillRect(sx(x), sy(y), z + 0.5, z + 0.5); }
  if (tunnelStart && tool === 'underpass') {
    const { x: tx, y: ty } = tunnelStart; ctx.strokeStyle = '#9fd6ef'; ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
    ctx.strokeRect(sx(tx) + 1, sy(ty) + 1, z - 2, z - 2);
    for (const [dx, dy] of DIRS) for (let k = UNDERPASS_MIN; k <= UNDERPASS_MAX; k++) { const nx = tx + dx * k, ny = ty + dy * k; if (inMap(nx, ny) && !canUnderpass(st, tx, ty, nx, ny)) { circle(sx(nx + 0.5), sy(ny + 0.5), z * 0.12, 'rgba(159,214,239,.7)'); } }
    ctx.setLineDash([]);
  }
  if (sel && sheet === 'tile') { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.strokeRect(sx(sel.x) + 1, sy(sel.y) + 1, z - 2, z - 2); }
}
function drawTile(x, y, z, now) {
  const t = GRID[y][x], X = sx(x), Y = sy(y), n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
  if (t === '#') { // a tree on dark grass
    ctx.fillStyle = '#3f5a36'; ctx.fillRect(X, Y, z + 0.5, z + 0.5);
    circle(X + z * 0.55, Y + z * 0.6, z * 0.42, 'rgba(0,0,0,.25)');
    circle(X + z / 2, Y + z * 0.45, z * (0.38 + Math.abs(n) * 0.08), Math.abs(n) > 0.5 ? '#5f8a4a' : '#6f9a52');
    circle(X + z * 0.4, Y + z * 0.35, z * 0.14, 'rgba(255,255,220,.18)');
    return;
  }
  const floor = () => { ctx.fillStyle = (x + y) % 2 ? '#8fae6a' : '#97b571'; ctx.fillRect(X, Y, z + 0.5, z + 0.5); ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.abs(n) * 0.04})`; ctx.fillRect(X + z * 0.06, Y + z * 0.06, z * 0.88, z * 0.88); };
  if (t === '.' ) { floor(); return; }
  if (t === 'S') { floor(); circle(X + z / 2, Y + z / 2, z * 0.42, '#5d6f7a'); circle(X + z / 2, Y + z / 2, z * 0.34, '#2d4552'); ctx.strokeStyle = '#9fd6ef'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X + z / 2, Y + z / 2, z * 0.38, 0, Math.PI * 2); ctx.stroke(); return; }
  if (t === '~') {
    if (st.done.G) { ctx.fillStyle = '#6b4a2e'; ctx.fillRect(X, Y, z + 0.5, z + 0.5); ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 1; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(X + k * z / 4, Y); ctx.lineTo(X + k * z / 4, Y + z); ctx.stroke(); } return; }
    ctx.fillStyle = '#3f7fb0'; ctx.fillRect(X, Y, z + 0.5, z + 0.5);
    ctx.strokeStyle = 'rgba(220,240,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); const o = (now / 900 + y * 0.3) % 1; ctx.moveTo(X, Y + z * o); ctx.lineTo(X + z, Y + z * o); ctx.stroke();
    return;
  }
  if (t === 'B') {
    floor();
    const o = OBJ[BARRIER.get(idx(x, y))], open = passable(st, x, y), col = barrierColor(o);
    if (o.kind === 'held') { // portcullis
      ctx.globalAlpha = open ? 0.25 : 1;
      ctx.fillStyle = '#3a3440'; ctx.fillRect(X, Y + (open ? 0 : z * 0.1), z, open ? z * 0.18 : z * 0.8);
      ctx.strokeStyle = '#c9c0d8'; ctx.lineWidth = Math.max(1.5, z * 0.06);
      for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(X + k * z / 4, Y + z * 0.1); ctx.lineTo(X + k * z / 4, Y + (open ? z * 0.2 : z * 0.9)); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.fillRect(X, Y, z, z * 0.08);
    } else if (!open) { // door slab
      roundRect(X + z * 0.04, Y + z * 0.04, z * 0.92, z * 0.92, z * 0.12, '#4d4456', '#2a2430');
      circle(X + z / 2, Y + z / 2, z * 0.16, col);
    } else { ctx.fillStyle = 'rgba(255,230,160,.12)'; ctx.fillRect(X, Y, z, z); }
  }
}
function barrierColor(o) { const r = o.receptors[0]; return ORB_COL[r.el || r.els[0]]; }
function drawReceptor(x, y, z, now) {
  const [id, ri] = RECEPTOR.get(idx(x, y)), o = OBJ[id], r = o.receptors[ri], X = sx(x) + z / 2, Y = sy(y) + z / 2;
  const prog = progress(st, o)[ri], frac = Math.max(0, Math.min(1, prog.value / prog.target)), done = !!st.done[id] && o.kind !== 'held';
  const ok = done || (o.kind === 'held' ? gateOpen(st, id) : frac >= 1);
  circle(X, Y, z * 0.46, '#3b3346');
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = z * 0.08; ctx.beginPath(); ctx.arc(X, Y, z * 0.38, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = ok ? '#7be39a' : '#ffd27a'; ctx.beginPath(); ctx.arc(X, Y, z * 0.38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (done ? 1 : frac)); ctx.stroke();
  if (o.kind === 'rune') { drawOrb(X - z * 0.12, Y, z * 0.12, 'fire'); drawOrb(X + z * 0.12, Y, z * 0.12, 'water'); }
  else drawOrb(X, Y, z * 0.17, r.els[0]);
  const tag = { door: '', held: '⛓', bridge: '🌉', rune: '', scales: '⚖️', shrine: '✨' }[o.kind];
  if (tag) emoji(tag, X + z * 0.32, Y - z * 0.32, z * 0.3);
  if (z > 24) label(o.kind === 'bridge' ? `${Math.floor(prog.value)}/${prog.target}` : `${fmtRate(prog.value)}/${fmtRate(prog.target)}`, X, Y + z * 0.56, z, ok ? '#c8ffd6' : '#fff');
}
function drawOrb(x, y, r, e) {
  const c = ORB_COL[e];
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.1);
  g.addColorStop(0, c + 'aa'); g.addColorStop(1, c + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();
  circle(x, y, r, 'rgba(20,14,24,.85)'); circle(x, y, r * 0.8, c);
  if (PARTS[e]) { // merged orbs wear a ring of their two parts
    ctx.lineWidth = Math.max(1, r * 0.28);
    PARTS[e].forEach((p, k) => { ctx.strokeStyle = ORB_COL[p]; ctx.beginPath(); ctx.arc(x, y, r * 1.25, k * Math.PI, (k + 1) * Math.PI); ctx.stroke(); });
  }
  circle(x - r * 0.25, y - r * 0.25, r * 0.3, 'rgba(255,255,255,.8)');
}
function inLocal(p, fn) { ctx.save(); ctx.translate(sx(p.x + 0.5), sy(p.y + 0.5)); ctx.rotate((p.dir || 0) * Math.PI / 2); fn(); ctx.restore(); }
function chevron(x, y, s, col) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.35); ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x, y - s * 0.4); ctx.lineTo(x + s, y + s * 0.6); ctx.stroke(); }
function sideArrow(s, h, col) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, h * 0.12); ctx.beginPath(); ctx.moveTo(s * h * 0.2, 0); ctx.lineTo(s * h * 0.85, 0); ctx.moveTo(s * h * 0.6, -h * 0.25); ctx.lineTo(s * h * 0.85, 0); ctx.lineTo(s * h * 0.6, h * 0.25); ctx.stroke(); }
function drawPiece(p, z, now) {
  const cx = sx(p.x + 0.5), cy = sy(p.y + 0.5), h = z / 2;
  const flow = st.run ? (acc / (BEAT / speed)) * z : 0;
  if (p.type === 'belt' || p.type === 'splitter' || p.type === 'joiner') {
    inLocal(p, () => {
      ctx.beginPath(); ctx.roundRect(-h * 0.86, -h, h * 1.72, z, z * 0.1); ctx.fillStyle = '#4b4038'; ctx.fill();
      ctx.fillStyle = '#3a3029'; ctx.fillRect(-h * 0.6, -h, h * 1.2, z);
      ctx.save(); ctx.beginPath(); ctx.rect(-h, -h, z, z); ctx.clip();
      for (let k = -1; k < 2; k++) chevron(0, h - ((flow + k * h) % z + z) % z + h * 0.1, z * 0.13, 'rgba(230,205,150,.5)');
      ctx.restore();
      if (p.type === 'splitter') { circle(0, 0, z * 0.22, '#6a5a8a'); sideArrow(-1, h, '#e2d6ff'); sideArrow(1, h, '#e2d6ff'); }
      if (p.type === 'joiner') { circle(0, 0, z * 0.22, '#3f6a55'); chevron(0, -h * 0.05, z * 0.14, '#c8f0d6'); }
    });
    return;
  }
  if (p.type === 'wellspring') {
    inLocal(p, () => { ctx.fillStyle = '#d9c39a'; ctx.beginPath(); ctx.moveTo(-z * 0.14, -h * 0.75); ctx.lineTo(0, -h * 1.02); ctx.lineTo(z * 0.14, -h * 0.75); ctx.fill(); });
    circle(cx, cy, z * 0.36, '#2d4552');
    drawOrb(cx, cy, z * 0.2 * (1 + 0.06 * Math.sin(now / 300)), p.el);
    return;
  }
  if (p.type === 'mixer') {
    const jam = mixerJammed(st, p);
    inLocal(p, () => {
      ctx.beginPath(); ctx.roundRect(-h * 0.88, -h * 0.88, z * 0.88, z * 0.88, z * 0.2); ctx.fillStyle = '#3d3a2e'; ctx.fill();
      ctx.fillStyle = '#e0b55c'; ctx.beginPath(); ctx.moveTo(-z * 0.14, -h * 0.88); ctx.lineTo(0, -h * 1.1); ctx.lineTo(z * 0.14, -h * 0.88); ctx.fill();
    });
    emoji('⚗️', cx, cy, z * 0.5);
    Object.values(p.slots || {}).forEach((o, k) => drawOrb(cx + (k ? 1 : -1) * z * 0.24, cy + z * 0.28, z * 0.09, o.el));
    if (jam) emoji('⚠️', cx + z * 0.3, cy - z * 0.3, z * 0.36);
    return;
  }
  if (p.type === 'underpass') {
    if (p.end === 'in') { // dashed line underground, with orbs in transit shown faintly
      const ex = st.pieces[p.link];
      if (ex) {
        ctx.strokeStyle = 'rgba(159,214,239,.35)'; ctx.setLineDash([z * 0.1, z * 0.12]); ctx.lineWidth = Math.max(1, z * 0.05);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx(ex.x + 0.5), sy(ex.y + 0.5)); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.45;
        for (const t of p.tunnel || []) { const f = 1 - t.wait / p.dist; drawOrb(cx + (sx(ex.x + 0.5) - cx) * f, cy + (sy(ex.y + 0.5) - cy) * f, z * 0.1, t.orb.el); }
        ctx.globalAlpha = 1;
      }
    }
    inLocal(p, () => {
      ctx.beginPath(); ctx.roundRect(-h * 0.86, -h, h * 1.72, z, z * 0.1); ctx.fillStyle = '#4b4038'; ctx.fill();
      // the arch: entrance mouth at the far side, exit mouth at the near side
      const my = p.end === 'in' ? -h * 0.15 : h * 0.15;
      ctx.fillStyle = '#6a6070'; ctx.beginPath(); ctx.arc(0, my, h * 0.62, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#120f18'; ctx.beginPath(); ctx.arc(0, my, h * 0.42, Math.PI, 0); ctx.fill();
      chevron(0, p.end === 'in' ? h * 0.55 : -h * 0.55, z * 0.12, 'rgba(230,205,150,.7)');
    });
    return;
  }
  if (p.type === 'demerger') {
    inLocal(p, () => {
      ctx.beginPath(); ctx.roundRect(-h * 0.88, -h * 0.88, z * 0.88, z * 0.88, z * 0.2); ctx.fillStyle = '#2e3a44'; ctx.fill();
      chevron(0, h * 0.55, z * 0.12, '#9fd6ef'); sideArrow(-1, h, '#cfeaff'); sideArrow(1, h, '#cfeaff');
      ctx.fillStyle = '#cfeaff'; ctx.font = `700 ${Math.max(8, z * 0.2)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('1', -h * 0.55, -h * 0.4); ctx.fillText('2', h * 0.55, -h * 0.4);
    });
    if (p.out) { if (p.out.l) drawOrb(cx - z * 0.15, cy, z * 0.08, p.out.l); if (p.out.r) drawOrb(cx + z * 0.15, cy, z * 0.08, p.out.r); }
  }
}
function emoji(ch, x, y, size) { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(ch, x, y + size * 0.05); }
function circle(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill(); }
function label(txt, x, y, z, col = '#fff') { ctx.font = `600 ${Math.max(9, z * 0.24)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y); }
function roundRect(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }

// ---------------------------------------------------------------- bars
const orbDot = (e) => el('i', { class: 'forged', style: `color:${ORB_COL[e]};background:${ORB_COL[e]}` });
function renderBars() {
  const main = OBJECTIVES.filter((o) => !o.optional), doneN = main.filter((o) => st.done[o.id]).length;
  bar1.replaceChildren(
    st.run ? btn('■ End run', () => { endRun(st); acc = 0; reach = reachable(st); say('Run ended. Tap a wellspring to change its element, then start a new run.'); changed(); }, { small: true, title: 'Stop the flow: orbs vanish, held gates drop, your layout stays' })
      : btn(`▶ Start run ${st.runs + 1}`, () => { const ws = Object.values(st.pieces).filter((p) => p.type === 'wellspring'); if (!ws.length) { say('Place a wellspring on a spring spot first.'); return; } startRun(st); acc = 0; changed(); }, { small: true, primary: true }),
    el('span', { class: 'sub', style: 'text-align:center' }, st.run ? `Run ${st.runs} · ${clock(st.run.beat * BEAT)}` : 'Between runs'),
    btn(`×${speed}`, () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; renderBars(); }, { small: true, title: 'Flow speed' }),
    btn(`🎯 ${doneN}/${main.length}`, () => openSheet(sheet === 'goals' ? null : 'goals'), { small: true, on: sheet === 'goals', title: 'Goals' }),
    btn('?', () => openSheet(sheet === 'help' ? null : 'help'), { small: true, title: 'How to play' }),
  );
  const ws = Object.values(st.pieces).filter((p) => p.type === 'wellspring');
  bar2.replaceChildren(
    el('span', { class: 'sub' }, 'Elements:'), ...st.unlocked.map((e) => el('span', { class: 'chip' }, orbDot(e), ORBS[e].name)),
    el('span', { class: 'sub' }, '· Springs:'), ...(ws.length ? ws.map((p) => el('span', { class: 'chip' }, orbDot(p.el))) : [el('span', { class: 'sub' }, 'none placed')]),
  );
  hint.replaceChildren(...(!sheet ? [el('span', {}, toolHint())] : []));
}
function toolHint() {
  if (tool === 'inspect') return st.run ? 'Tap anything to inspect it.' : 'Tap a wellspring to set its element, then ▶.';
  if (tool === 'facing') return 'New pieces face this way. Tap again to turn.';
  if (tool === 'erase') return 'Tap or drag to pick pieces up.';
  if (tool === 'underpass') return tunnelStart ? 'Now tap the exit: 2–4 tiles straight ahead (dots show where).' : `Underpass · ${st.inv.underpass || 0} left · tap the entrance first`;
  const P = PIECES[tool];
  return `${P.name} ${ARROWS[toolDir]} · ${P.unlimited ? 'unlimited' : `${st.inv[tool] || 0} left`}${tool === 'belt' ? ' · drag to lay a line' : ''}${tool === 'wellspring' ? ' · spring spots only, between runs' : ''}`;
}
function renderTools() {
  tools.replaceChildren(...TOOL_ORDER.map((k) => {
    if (k === 'inspect') return el('button', { class: 'tool' + (tool === k ? ' on' : ''), onclick: () => { tool = k; renderTools(); renderBars(); } }, el('span', { class: 'ic' }, '👆'), el('span', { class: 'cost' }, 'Look'));
    if (k === 'erase') return el('button', { class: 'tool' + (tool === k ? ' on' : ''), onclick: () => { tool = k; renderTools(); renderBars(); } }, el('span', { class: 'ic' }, '🧹'), el('span', { class: 'cost' }, 'Pick up'));
    if (k === 'facing') return el('button', { class: 'tool', title: 'Facing for new pieces', onclick: () => { toolDir = (toolDir + 1) % 4; renderTools(); renderBars(); } }, el('span', { class: 'ic' }, ARROWS[toolDir]), el('span', { class: 'cost' }, 'Facing'));
    const P = PIECES[k], n = P.unlimited ? '∞' : (st.inv[k] || 0), placed = Object.values(st.pieces).filter((p) => p.type === k).length;
    const locked = !P.unlimited && !n && !placed;
    return el('button', { class: 'tool' + (tool === k ? ' on' : '') + (locked ? ' locked' : ''), title: P.name, onclick: () => { if (locked) { say(`🔒 ${P.name}: earn one from a goal.`); return; } tool = k; tunnelStart = null; if (sheet === 'tile') closeSheet(); renderTools(); renderBars(); } },
      locked ? el('span', { class: 'lock' }, '🔒') : null, el('span', { class: 'ic' }, P.icon), el('span', { class: 'cost' }, `${n}`));
  }));
}

// ---------------------------------------------------------------- sheets
let sheetSig = '';
function renderSheet(force) {
  let node = null;
  if (sheet === 'goals') node = goalsSheet();
  else if (sheet === 'help') node = helpSheet();
  else if (sheet === 'tile' && sel) node = tileSheet();
  sheetBox.hidden = !node;
  sheetBox.classList.toggle('full', sheet === 'help');
  if (!node) { sheetSig = ''; hint.hidden = false; return; }
  const sig = sheet + node.outerHTML;
  if (!force && sig === sheetSig) return;
  sheetSig = sig; const top = sheetBox.scrollTop; sheetBox.replaceChildren(node); sheetBox.scrollTop = top;
}
const act = (fn) => () => { const why = fn(); if (why) say(why); changed(); };
const head = (title, sub) => el('div', { class: 'title' }, el('h2', {}, title), el('div', { class: 'row' }, sub ? el('span', { class: 'sub' }, sub) : null, btn('✕', closeSheet, { small: true })));
function rewardText(o) {
  return Object.entries(o.reward).map(([k, v]) => k === 'end' ? 'the end of the demo' : v === true ? `${ORBS[k].name} element` : `${PIECES[k].name}${v > 1 ? ' ×' + v : ''}`).join(', ');
}
function objectiveCard(o, withHead = true) {
  const card = el('div', {});
  if (withHead) card.append(head(o.name, o.optional ? 'optional' : null));
  const status = o.kind === 'held' ? (gateOpen(st, o.id) ? el('span', { class: 'good' }, 'Open — keep it fed') : el('span', { class: 'bad' }, 'Closed')) : st.done[o.id] ? el('span', { class: 'good' }, 'Done') : el('span', { class: 'muted' }, 'Not yet');
  card.append(el('p', {}, status, ' · ', el('span', { class: 'sub' }, KIND_TEXT[o.kind])));
  const pr = progress(st, o);
  o.receptors.forEach((r, i) => card.append(el('p', {}, ...r.els.map(orbDot), ' ',
    o.kind === 'bridge' ? `${r.els.map((e) => ORBS[e].name).join(' / ')}: ${Math.floor(pr[i].value)} / ${r.total} delivered` : `${r.els.map((e) => ORBS[e].name).join(' / ')}: ${fmtRate(pr[i].value)} / ${fmtRate(r.rate)} per second`)));
  if (o.kind === 'rune') card.append(el('p', { class: 'sub' }, `Sequence: ${o.pattern.map((e) => ORBS[e].name).join(', ')}, repeating.`));
  card.append(el('p', { class: 'sub' }, '💡 ', o.hint), el('p', { class: 'sub' }, '🎁 ', rewardText(o), st.done[o.id] ? ' (received)' : ''));
  return card;
}
function goalsSheet() {
  const card = el('div', {}, head('Goals', `${st.runs} run${st.runs === 1 ? '' : 's'}`));
  const visible = OBJECTIVES.filter((o) => o.receptors.some((r) => st.seen[idx(r.x, r.y)]));
  if (!st.runs) card.append(el('p', {}, 'Your wellspring sits on a spring spot in the Spring Meadow. Lay belts from it to the brazier, then press ▶ Start run. Doors open when the flow holds its rate.'));
  for (const o of visible) {
    const item = el('div', { class: 'item', style: 'grid-template-columns: 1fr' }, el('div', {}, el('b', {}, o.name), o.optional ? el('span', { class: 'tag' }, ' optional') : null), objectiveCard(o, false));
    item.addEventListener('click', () => { const r = o.receptors[0]; cam.cx = r.x + 0.5; cam.cy = r.y + 2; clampCam(); });
    card.append(item);
  }
  const hidden = OBJECTIVES.length - visible.length;
  if (hidden) card.append(el('p', { class: 'sub' }, `${hidden} more beyond the doors.`));
  return card;
}
function tileSheet() {
  const { x, y } = sel, i = idx(x, y), p = st.pieces[i];
  if (RECEPTOR.has(i)) return objectiveCard(OBJ[RECEPTOR.get(i)[0]]);
  if (BARRIER.has(i) && !p) return objectiveCard(OBJ[BARRIER.get(i)]);
  if (!p) {
    const t = GRID[y][x];
    const name = { '#': 'Trees', '.': 'Meadow', S: 'Spring spot', '~': st.done.G ? 'Bridge' : 'River' }[t];
    const text = { '#': 'Nothing can be built here.', '.': reach[i] ? 'Pick a piece in the bar below, then tap here.' : 'Out of reach for now.', S: 'Wellsprings go here, between runs.', '~': st.done.G ? 'Built by the river’s bridge-works.' : 'Too deep to build over. The bridge-works nearby can span it.' }[t];
    return el('div', {}, head(name), el('p', { class: 'sub' }, text));
  }
  const P = PIECES[p.type], card = el('div', {}, head(p.type === 'wellspring' ? `${ORBS[p.el].name} Wellspring` : P.name));
  card.append(el('p', { class: 'sub' }, P.info));
  if (p.type === 'mixer') card.append(el('p', { class: mixerJammed(st, p) ? 'bad' : '' }, mixerJammed(st, p) ? '⚠ Jammed: more than two inputs, or something feeds its gold notch.' : `Holding: ${Object.values(p.slots || {}).map((o) => ORBS[o.el].name).join(' + ') || 'nothing'}`));
  if (p.type === 'wellspring') {
    card.append(el('h3', {}, st.run ? 'Element (fixed until the run ends)' : 'Element for the next run'),
      el('div', { class: 'row' }, ...st.unlocked.map((e) => btn([orbDot(e), ' ', ORBS[e].name], act(() => attune(st, x, y, e)), { small: true, on: p.el === e, disabled: !!st.run }))));
  }
  if (p.type === 'underpass') {
    card.append(el('p', {}, p.end === 'in' ? `Entrance: orbs go under ${p.dist - 1} tile${p.dist > 2 ? 's' : ''} and come up at the exit.` : 'Exit: orbs come up here and carry on forward.'),
      el('div', { class: 'row' }, btn('Pick up both ends', act(() => { const why = remove(st, x, y); if (!why) closeSheet(); return why; }), { small: true })));
    return card;
  }
  const fixed = p.type === 'wellspring' && st.run;
  card.append(el('h3', {}, 'Facing'), el('div', { class: 'row' }, ...ARROWS.map((a, d) => btn(a, act(() => rotate(st, x, y, d)), { small: true, on: p.dir === d, disabled: fixed })),
    btn('Pick up', act(() => { const why = remove(st, x, y); if (!why) closeSheet(); return why; }), { small: true, disabled: fixed })));
  return card;
}
function helpSheet() {
  return el('div', {}, head('How to play'),
    el('p', {}, 'Wellsprings by the start pour out orbs, one a second. Belt them through the level into braziers, basins and locks. Each goal asks for an element at a rate; hold it and a door opens, a bridge forms, or a gate rises.'),
    el('h3', {}, 'Runs'),
    el('p', { class: 'sub' }, 'A run is one session of flow. Between runs you place wellsprings on the spring spots and choose each one’s element; during a run they are fixed. You can build and rewire freely during a run. Ending a run clears the orbs and drops held gates; your layout and everything opened for good stay.'),
    el('h3', {}, 'Pieces'), el('div', { class: 'list', style: 'font-size:12px' }, ...PIECE_ORDER.map((k) => el('div', {}, `${PIECES[k].icon} `, el('b', {}, PIECES[k].name), PIECES[k].unlimited ? ' (unlimited)' : '', ` — ${PIECES[k].info}`))),
    el('p', { class: 'sub' }, 'Belts are unlimited; every other piece is counted. Goals give more. Pick a piece up to reuse it — a door that stays open doesn’t need its pieces any more.'),
    el('h3', {}, 'Goals'), el('div', { class: 'list', style: 'font-size:12px' }, ...Object.entries(KIND_TEXT).map(([, t]) => el('div', {}, t))),
    el('h3', {}, 'Rates'), el('p', { class: 'sub' }, 'A belt lane carries up to 4 orbs a second. Rates are measured over the last 8 seconds, so give a new line a moment. A splitter halves a stream; a mixer turns one of each input into one merged orb; a demerger does the reverse.'),
    el('h3', {}, 'Controls'), el('p', { class: 'sub' }, 'Tap to place the selected piece (tapping the same piece re-aims it). Drag pans; with Belt it lays a line, with Pick up it wipes. Pinch or scroll to zoom. 🎯 lists the goals you’ve found.'),
    el('div', { class: 'row', style: 'margin-top:10px' }, btn('Reset the level', () => { if (confirm('Forget all progress in this level?')) { st = newState(); reach = reachable(st); persist(); sheet = 'goals'; renderAll(); } }, { small: true })));
}

// ---------------------------------------------------------------- loop
function renderAll() { renderBars(); renderTools(); renderSheet(true); }
let last = performance.now(), uiClock = 0;
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  if (st.run) {
    acc += real;
    const per = BEAT / speed;
    while (acc >= per) {
      acc -= per;
      for (const ev of step(st)) {
        if (ev.type === 'done') {
          const o = OBJ[ev.id];
          say(`✨ ${o.name}${o.kind === 'held' ? ' rises' : o.kind === 'bridge' ? ' is bridged' : ' opens'}! You gained: ${ev.reward.join(', ')}.${ev.reward.some((r) => / element/.test(r)) || ev.reward.some((r) => /Wellspring/.test(r)) ? ' End the run to use it.' : ''}`, 6000);
          persist(); reach = reachable(st); renderTools();
          if (o.reward.end) { sheet = 'goals'; renderSheet(true); }
        }
        if (ev.type === 'gate') { reach = reachable(st); if (!ev.open) say(`⛓ ${OBJ[ev.id].name} dropped — it needs steady flow.`); }
        if (ev.type === 'fizzle') say('💨 Those two don’t mix. The Mixer fizzled them.');
      }
    }
    uiClock += real;
    if (uiClock > 0.3) { uiClock = 0; renderBars(); renderSheet(false); }
  }
  const shown = toastMsg && now < toastUntil ? toastMsg : '';
  if (shown !== toast.dataset.msg) { toast.dataset.msg = shown; toast.replaceChildren(...(shown ? [el('span', {}, shown)] : [])); hint.style.visibility = shown ? 'hidden' : ''; }
  draw(now);
  requestAnimationFrame(frame);
}
// First visit: put the starting wellspring on the middle spring spot, facing up.
if (!Object.keys(st.pieces).length && !st.runs) { place(st, 'wellspring', 13, 32, 0, 'fire'); reach = reachable(st); say('Lay belts from your fire wellspring to the brazier, then ▶ Start run. 🎯 shows goals.', 9000); }
new ResizeObserver(() => resize()).observe(canvas);
resize(); renderAll();
requestAnimationFrame(frame);
