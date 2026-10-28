// Orbforge puzzle demo: the level, pieces and flow rules (no DOM), shared by the page and the Node checks.
/* eslint-disable no-unused-vars */
const BEAT = 0.25;   // seconds per beat; belts move an orb one tile per beat (4 orbs/s per lane at most)
const WINDOW = 32;   // rates are measured over the last 32 beats (8 s)
const SPRING_EVERY = 4; // a wellspring emits one orb every 4 beats (1 orb/s)
const HOLD = 16;     // permanent objectives must stay satisfied this many beats (4 s) in a row
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
const ARROWS = ['↑', '→', '↓', '←'];

const ORBS = {
  fire: { name: 'Fire', tier: 1 }, water: { name: 'Water', tier: 1 }, earth: { name: 'Earth', tier: 1 }, air: { name: 'Air', tier: 1 },
  steam: { name: 'Steam', tier: 2 }, magma: { name: 'Magma', tier: 2 }, mud: { name: 'Mud', tier: 2 },
  lightning: { name: 'Lightning', tier: 2 }, ice: { name: 'Ice', tier: 2 }, dust: { name: 'Dust', tier: 2 },
};
const RECIPES = { 'fire+water': 'steam', 'earth+fire': 'magma', 'earth+water': 'mud', 'air+fire': 'lightning', 'air+water': 'ice', 'air+earth': 'dust' };
const recipeKey = (a, b) => [a, b].sort().join('+');
const PARTS = Object.fromEntries(Object.entries(RECIPES).map(([k, v]) => [v, k.split('+')])); // steam → ['fire', 'water']

// Pieces. Belts are unlimited; everything else is counted in the inventory.
const PIECES = {
  belt: { name: 'Belt', icon: '➜', unlimited: true, info: 'Moves orbs one tile per beat. Takes from behind or the sides. Drag to lay a line.' },
  splitter: { name: 'Splitter', icon: '⑂', info: 'Takes from behind; sends orbs left and right in turn, so each side gets half.' },
  joiner: { name: 'Joiner', icon: '⑃', info: 'Takes from behind and both sides, alternating between them, and sends forward. Makes sequences.' },
  mixer: { name: 'Mixer', icon: '⚗️', info: 'Takes one orb from each of two inputs and sends one merged orb out of the gold notch (fire + water → steam). A third input jams it.' },
  demerger: { name: 'Demerger', icon: '⚖', info: 'Takes a merged orb from behind and splits it: first part out the left, second out the right (steam → fire left, water right).' },
  underpass: { name: 'Underpass', icon: '🕳️', pair: true, info: 'A tunnel: tap the entrance, then the exit 2–4 tiles straight ahead. Orbs go under whatever is between (belts, pieces, goals) but never under rock, chasms, doors or gates.' },
  wellspring: { name: 'Wellspring', icon: '⛲', info: 'Goes on a spring spot by the start. Emits 1 orb a second of the element you chose for this run.' },
};
const PIECE_ORDER = ['belt', 'splitter', 'joiner', 'mixer', 'demerger', 'underpass', 'wellspring'];
const UNDERPASS_MIN = 2, UNDERPASS_MAX = 4; // exit distance from the entrance, in tiles

// ---------------------------------------------------------------- the level
// Tiles: '#' rock, '.' floor, 'S' spring spot, '~' chasm, 'B' barrier (owned by an objective).
const W = 25, H = 27, START = [12, 23];
function carve() {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  const room = (x0, y0, x1, y1, ch = '.') => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch; };
  room(9, 21, 15, 25);            // A: the Spring Grounds (start)
  for (const x of [10, 12, 14]) g[25][x] = 'S';
  room(9, 14, 15, 19);            // B: Twin Braziers
  room(16, 16, 16, 17); room(17, 15, 21, 18); // H: side shrine, open from B
  room(9, 8, 15, 12);             // C: the Sluice
  room(16, 9, 16, 11);            // open passage C → G
  room(2, 8, 7, 12);              // D: Steam Door
  room(1, 1, 3, 6); room(5, 1, 7, 6); room(4, 4, 4, 4); // E: the Narrow (one-tile gap at 4,4)
  room(9, 1, 15, 6);              // F: Rune Lock
  room(17, 8, 23, 12); room(19, 8, 20, 12, '~'); // G: the Chasm
  room(21, 7, 23, 7);             // open passage G (far side) → I
  room(17, 1, 23, 6);             // I: the Scales
  return g;
}
// Objectives. kind: door (rate, opens forever) · held (rate, open only while fed) · bridge (total, built forever)
// · rune (alternating sequence at a rate, opens forever) · scales (two equal rates, opens forever) · shrine (rate, reward only)
const OBJECTIVES = [
  { id: 'A', name: 'The First Door', kind: 'door', receptors: [{ x: 9, y: 21, el: 'fire', rate: 1 }], barrier: [[11, 20], [12, 20], [13, 20]],
    reward: { splitter: 1 }, hint: 'Belt your fire wellspring into the brazier at 1 orb a second.' },
  { id: 'B', name: 'Twin Braziers', kind: 'door', receptors: [{ x: 9, y: 14, el: 'fire', rate: 0.5 }, { x: 15, y: 14, el: 'fire', rate: 0.5 }], barrier: [[11, 13], [12, 13], [13, 13]],
    reward: { water: true, wellspring: 1 }, hint: 'Each brazier needs half a fire a second. One stream, two braziers…' },
  { id: 'H', name: 'Shrine of Embers', kind: 'shrine', optional: true, receptors: [{ x: 21, y: 15, el: 'fire', rate: 1.5 }],
    reward: { splitter: 1 }, hint: 'More fire than one wellspring can give.' },
  { id: 'C', name: 'The Sluice', kind: 'held', receptors: [{ x: 15, y: 8, el: 'water', rate: 0.5 }], barrier: [[8, 9], [8, 10], [8, 11]],
    reward: { mixer: 1 }, hint: 'The sluice stays up only while water keeps flowing in. Everything west passes under it.' },
  { id: 'D', name: 'The Steam Door', kind: 'door', receptors: [{ x: 2, y: 12, el: 'steam', rate: 0.5 }], barrier: [[2, 7], [3, 7]],
    reward: { demerger: 1, underpass: 1 }, hint: 'Steam is fire and water mixed. Keep the sluice fed too.' },
  { id: 'E', name: 'The Narrow', kind: 'door', receptors: [{ x: 7, y: 1, el: 'fire', rate: 0.5 }, { x: 7, y: 6, el: 'water', rate: 0.5 }], barrier: [[8, 2], [8, 3], [8, 4]],
    reward: { joiner: 1 }, hint: 'Only one lane fits through the gap. What goes in merged can come out apart.' },
  { id: 'F', name: 'The Rune Lock', kind: 'rune', pattern: ['fire', 'water'], receptors: [{ x: 15, y: 1, els: ['fire', 'water'], rate: 1 }],
    reward: { earth: true, wellspring: 1, mixer: 1 }, hint: 'Fire, water, fire, water… one a second, never two the same in a row.' },
  { id: 'G', name: 'The Chasm', kind: 'bridge', receptors: [{ x: 17, y: 8, el: 'earth', total: 30 }], barrier: [],
    reward: { splitter: 1 }, hint: 'Pour 30 earth into the bridge-works to span the chasm.' },
  { id: 'I', name: 'The Scales', kind: 'scales', receptors: [{ x: 17, y: 1, el: 'magma', rate: 0.5 }, { x: 23, y: 1, el: 'mud', rate: 0.5 }], barrier: [],
    reward: { end: true }, hint: 'Magma and mud, half a second each, perfectly balanced.' },
];
const OBJ = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));
const GRID = carve();
const idx = (x, y) => y * W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const BARRIER = new Map();  // tile → objective id
const RECEPTOR = new Map(); // tile → [objective id, receptor index]
for (const o of OBJECTIVES) {
  o.barrier = o.barrier || [];
  for (const [x, y] of o.barrier) { GRID[y][x] = 'B'; BARRIER.set(idx(x, y), o.id); }
  o.receptors.forEach((r, i) => { RECEPTOR.set(idx(r.x, r.y), [o.id, i]); if (!r.els) r.els = [r.el]; });
}
const CHASM = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (GRID[y][x] === '~') CHASM.push([x, y]);
OBJ.G.barrier = CHASM; // the bridge turns the chasm into floor

// ---------------------------------------------------------------- state
function newState() {
  return {
    unlocked: ['fire'], inv: { splitter: 0, joiner: 0, mixer: 0, demerger: 0, underpass: 0, wellspring: 1 },
    pieces: {},       // tile index → piece
    done: {},         // objective id → true once completed (reward given; permanent ones stay open)
    seen: {},         // tile index → true once seen
    runs: 0, run: null, // run: { beat, orbs: Map, rec, gates } while flowing
  };
}
const pieceAt = (st, x, y) => st.pieces[idx(x, y)];
function gateOpen(st, id) { return st.run ? !!st.run.gates[id] : false; }
// Can orbs (and the player) pass this tile?
function passable(st, x, y) {
  if (!inMap(x, y)) return false;
  const t = GRID[y][x];
  if (t === '.' || t === 'S') return true;
  if (t === '~') return !!st.done.G;
  if (t === 'B') { const o = OBJ[BARRIER.get(idx(x, y))]; return o.kind === 'held' ? gateOpen(st, o.id) : !!st.done[o.id]; }
  return false;
}
// Tiles you can reach (and build on): flood from the start. Held-gate tiles are buildable when next to a reachable tile.
function reachable(st) {
  const r = new Uint8Array(W * H), q = [START];
  r[idx(...START)] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny) || r[idx(nx, ny)]) continue;
      if (passable(st, nx, ny)) { r[idx(nx, ny)] = 1; q.push([nx, ny]); }
      else if (GRID[ny][nx] === 'B' && OBJ[BARRIER.get(idx(nx, ny))].kind === 'held') r[idx(nx, ny)] = 2; // gate tile: build only
    }
  }
  for (let i = 0; i < W * H; i++) if (r[i]) markSeen(st, i);
  return r;
}
function markSeen(st, i) { // a reachable tile reveals its 8 neighbours too (walls, receptors)
  const x = i % W, y = (i - x) / W;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy)) st.seen[idx(x + dx, y + dy)] = 1;
}

// ---------------------------------------------------------------- building
function canPlace(st, type, x, y) {
  if (!inMap(x, y)) return 'Off the map.';
  const i = idx(x, y), reach = reachable(st)[i];
  if (!reach) return GRID[y][x] === '#' ? 'Solid rock.' : 'You can’t reach there yet.';
  if (RECEPTOR.has(i)) return 'That’s an objective.';
  if (st.pieces[i]) return 'Something is already here.';
  if (type === 'wellspring') {
    if (GRID[y][x] !== 'S') return 'Wellsprings only go on the spring spots in the Spring Grounds.';
    if (st.run) return 'End the run to place wellsprings.';
  } else if (GRID[y][x] === 'S') return 'Spring spots are for wellsprings.';
  if (!PIECES[type].unlimited && !(st.inv[type] > 0)) return `No ${PIECES[type].name}s left.`;
  return null;
}
// An underpass is placed as a pair: entrance and exit in a straight line, 2–4 tiles apart.
function canUnderpass(st, x1, y1, x2, y2) {
  const why = canPlace(st, 'underpass', x1, y1) || canPlace(st, 'underpass', x2, y2);
  if (why) return why;
  const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1), dist = Math.abs(x2 - x1) + Math.abs(y2 - y1);
  if (dx && dy) return 'The exit must be straight ahead of the entrance.';
  if (dist < UNDERPASS_MIN || dist > UNDERPASS_MAX) return `The exit must be ${UNDERPASS_MIN}–${UNDERPASS_MAX} tiles from the entrance.`;
  for (let k = 1; k < dist; k++) {
    const x = x1 + dx * k, y = y1 + dy * k, t = GRID[y][x];
    if (t === '#' || t === '~' || t === 'B') return 'Tunnels can’t pass under rock, chasms, doors or gates.';
  }
  return null;
}
function placeUnderpass(st, x1, y1, x2, y2) {
  const why = canUnderpass(st, x1, y1, x2, y2);
  if (why) return why;
  const dir = x2 > x1 ? 1 : x2 < x1 ? 3 : y2 > y1 ? 2 : 0, dist = Math.abs(x2 - x1) + Math.abs(y2 - y1);
  st.inv.underpass--;
  st.pieces[idx(x1, y1)] = { type: 'underpass', end: 'in', x: x1, y: y1, dir, link: idx(x2, y2), dist, tunnel: [] };
  st.pieces[idx(x2, y2)] = { type: 'underpass', end: 'out', x: x2, y: y2, dir, link: idx(x1, y1), dist };
  return null;
}
function place(st, type, x, y, dir = 0, el = null) {
  if (PIECES[type].pair) return 'Underpasses are placed as a pair: entrance, then exit.';
  const why = canPlace(st, type, x, y);
  if (why) return why;
  if (!PIECES[type].unlimited) st.inv[type]--;
  const p = { type, x, y, dir };
  if (type === 'wellspring') { p.el = el && st.unlocked.includes(el) ? el : st.unlocked[0]; p.timer = 0; }
  if (type === 'splitter') p.flip = 0;
  if (type === 'joiner') p.last = -1;
  if (type === 'mixer') p.slots = {};
  if (type === 'demerger') p.out = null;
  st.pieces[idx(x, y)] = p;
  return null;
}
function remove(st, x, y) {
  const i = idx(x, y), p = st.pieces[i];
  if (!p) return 'Nothing here.';
  if (p.type === 'wellspring' && st.run) return 'End the run to move wellsprings.';
  if (!PIECES[p.type].unlimited) st.inv[p.type]++;
  delete st.pieces[i];
  if (st.run) st.run.orbs.delete(i);
  if (p.type === 'underpass') { delete st.pieces[p.link]; if (st.run) st.run.orbs.delete(p.link); } // both ends go together
  return null;
}
function rotate(st, x, y, dir) {
  const p = pieceAt(st, x, y);
  if (!p) return 'Nothing here.';
  if (p.type === 'wellspring' && st.run) return 'Wellsprings are fixed during a run.';
  if (p.type === 'underpass') return 'A tunnel runs from its entrance to its exit; pick it up to re-lay it.';
  p.dir = dir; return null;
}
function attune(st, x, y, el) {
  const p = pieceAt(st, x, y);
  if (!p || p.type !== 'wellspring') return 'Not a wellspring.';
  if (st.run) return 'A wellspring’s element can only change between runs.';
  if (!st.unlocked.includes(el)) return 'You haven’t unlocked that element.';
  p.el = el; return null;
}

// ---------------------------------------------------------------- runs
function startRun(st) {
  if (st.run) return 'Already running.';
  st.runs++;
  st.run = { beat: 0, orbs: new Map(), nextId: 1, gates: {}, rec: {}, held: {} };
  for (const o of OBJECTIVES) st.run.rec[o.id] = o.receptors.map(() => ({ hist: new Array(WINDOW).fill(0), count: 0, cur: 0, total: 0, seq: [] }));
  for (const p of Object.values(st.pieces)) { p.timer = 0; if (p.type === 'mixer') p.slots = {}; if (p.type === 'demerger') p.out = null; if (p.type === 'splitter') p.flip = 0; if (p.type === 'joiner') p.last = -1; if (p.type === 'underpass') p.tunnel = []; }
  return null;
}
function endRun(st) { st.run = null; return null; } // orbs vanish, held gates drop, layout stays

// ---------------------------------------------------------------- flow (one beat)
const stepFrom = (x, y, d) => [x + DIRS[d][0], y + DIRS[d][1]];
function outDirs(p) {
  if (p.type === 'splitter') { const l = (p.dir + 3) % 4, r = (p.dir + 1) % 4; return p.flip ? [r, l] : [l, r]; }
  if (p.type === 'belt' || p.type === 'joiner' || p.type === 'wellspring' || p.type === 'mixer') return [p.dir];
  if (p.type === 'underpass') return p.end === 'out' ? [p.dir] : [];
  if (p.type === 'demerger') return [(p.dir + 3) % 4, (p.dir + 1) % 4];
  return [];
}
function feeders(st, x, y) { // pieces pointing into (x, y), as [piece, direction of travel]
  const out = [];
  for (let d = 0; d < 4; d++) {
    const [nx, ny] = stepFrom(x, y, (d + 2) % 4), q = inMap(nx, ny) && pieceAt(st, nx, ny);
    if (q && outDirs(q).includes(d)) out.push([q, d]);
  }
  return out;
}
function mixerJammed(st, p) {
  const f = feeders(st, p.x, p.y);
  return f.length > 2 || f.some(([, d]) => d === (p.dir + 2) % 4);
}
// Would the tile ti take this orb, arriving travelling in direction d?
function accepts(st, ti, d, orb, want) {
  const x = ti % W, y = (ti - x) / W;
  if (!passable(st, x, y)) return false;
  const rc = RECEPTOR.get(ti);
  if (rc) return OBJ[rc[0]].receptors[rc[1]].els.includes(orb.el);
  const p = st.pieces[ti];
  if (!p) return false;
  const fromFront = d === (p.dir + 2) % 4, busy = st.run.orbs.has(ti);
  switch (p.type) {
    case 'belt': return !busy && !fromFront;
    case 'splitter': return !busy && d === p.dir;
    case 'joiner': { if (busy || fromFront) return false; const w = want.get(ti); return !(w && w.size > 1 && d === p.last); }
    case 'mixer': return !fromFront && !mixerJammed(st, p) && !p.slots[d] && Object.keys(p.slots).length < 2;
    case 'demerger': return d === p.dir && !p.out && !!PARTS[orb.el];
    case 'underpass': return p.end === 'in' && d === p.dir && p.tunnel.length < p.dist; // the tunnel holds one orb per tile
    default: return false;
  }
}
function deliver(st, ti, orb, d, ev) {
  const rc = RECEPTOR.get(ti);
  if (rc) { const r = st.run.rec[rc[0]][rc[1]]; r.cur++; r.total++; r.seq.push(orb.el); if (r.seq.length > 16) r.seq.shift(); return; }
  const p = st.pieces[ti];
  if (p.type === 'mixer') p.slots[d] = orb;
  else if (p.type === 'demerger') p.out = { l: PARTS[orb.el][0], r: PARTS[orb.el][1] };
  else if (p.type === 'underpass') p.tunnel.push({ orb, wait: p.dist - 1 });
  else { st.run.orbs.set(ti, orb); if (p.type === 'joiner') p.last = d; }
}
function step(st) {
  const run = st.run, ev = [];
  if (!run) return ev;
  const pending = [...run.orbs.entries()];
  for (const [ti, orb] of pending) { orb.px = ti % W; orb.py = Math.floor(ti / W); }
  // who wants into each joiner this beat (for alternation)
  const want = new Map();
  const wantInto = (x, y, d) => { const [nx, ny] = stepFrom(x, y, d); if (!inMap(nx, ny)) return; const tj = idx(nx, ny), q = st.pieces[tj]; if (q && q.type === 'joiner') { if (!want.has(tj)) want.set(tj, new Set()); want.get(tj).add(d); } };
  for (const [ti] of pending) { const p = st.pieces[ti]; if (p) for (const d of outDirs(p)) wantInto(p.x, p.y, d); }
  for (const p of Object.values(st.pieces)) {
    if ((p.type === 'wellspring' && p.timer <= 0) || (p.type === 'mixer' && Object.keys(p.slots).length === 2)) wantInto(p.x, p.y, p.dir);
    if (p.type === 'demerger' && p.out) { if (p.out.l) wantInto(p.x, p.y, (p.dir + 3) % 4); if (p.out.r) wantInto(p.x, p.y, (p.dir + 1) % 4); }
  }
  // move orbs already on belts, repeatedly, so whole trains advance together
  const moved = new Set();
  for (let progress = true; progress;) {
    progress = false;
    for (const [ti, orb] of pending) {
      if (moved.has(orb.id)) continue;
      const p = st.pieces[ti];
      if (!p || run.orbs.get(ti) !== orb) { moved.add(orb.id); continue; }
      for (const d of outDirs(p)) {
        const [nx, ny] = stepFrom(p.x, p.y, d);
        if (!inMap(nx, ny) || !accepts(st, idx(nx, ny), d, orb, want)) continue;
        run.orbs.delete(ti); deliver(st, idx(nx, ny), orb, d, ev);
        if (p.type === 'splitter') p.flip = d === (p.dir + 3) % 4 ? 1 : 0;
        moved.add(orb.id); progress = true; break;
      }
    }
  }
  // makers: wellsprings, mixers, demergers
  for (const p of Object.values(st.pieces)) {
    const push = (d, orb) => { const [nx, ny] = stepFrom(p.x, p.y, d); if (inMap(nx, ny) && accepts(st, idx(nx, ny), d, orb, want)) { orb.px = p.x; orb.py = p.y; deliver(st, idx(nx, ny), orb, d, ev); return true; } return false; };
    if (p.type === 'wellspring') {
      p.timer--;
      if (p.timer <= 0 && push(p.dir, { id: run.nextId++, el: p.el })) p.timer = SPRING_EVERY;
    } else if (p.type === 'mixer' && Object.keys(p.slots).length === 2) {
      const [a, b] = Object.values(p.slots), out = RECIPES[recipeKey(a.el, b.el)];
      if (!out) { p.slots = {}; ev.push({ type: 'fizzle', x: p.x, y: p.y }); }
      else if (push(p.dir, { id: run.nextId++, el: out })) p.slots = {};
    } else if (p.type === 'underpass' && p.end === 'in' && p.tunnel.length) {
      for (const t of p.tunnel) if (t.wait > 0) t.wait--;
      const head = p.tunnel[0], ex = st.pieces[p.link];
      if (head.wait <= 0 && ex && !run.orbs.has(p.link)) { head.orb.px = ex.x; head.orb.py = ex.y; run.orbs.set(p.link, head.orb); p.tunnel.shift(); }
    } else if (p.type === 'demerger' && p.out) {
      if (p.out.l && push((p.dir + 3) % 4, { id: run.nextId++, el: p.out.l })) p.out.l = null;
      if (p.out.r && push((p.dir + 1) % 4, { id: run.nextId++, el: p.out.r })) p.out.r = null;
      if (!p.out.l && !p.out.r) p.out = null;
    }
  }
  // receptors: slide the 8-second window, then check every objective
  for (const o of OBJECTIVES) for (const r of run.rec[o.id]) { r.count += r.cur - r.hist[run.beat % WINDOW]; r.hist[run.beat % WINDOW] = r.cur; r.cur = 0; }
  run.beat++;
  for (const o of OBJECTIVES) {
    const ok = satisfied(st, o);
    if (o.kind === 'held') {
      if (ok !== !!run.gates[o.id]) { run.gates[o.id] = ok; ev.push({ type: 'gate', id: o.id, open: ok }); }
      if (ok && !st.done[o.id]) { st.done[o.id] = true; ev.push({ type: 'done', id: o.id, reward: grant(st, o) }); }
    } else if (!st.done[o.id]) {
      run.held[o.id] = ok && o.kind !== 'bridge' ? (run.held[o.id] || 0) + 1 : 0;
      if ((ok && o.kind === 'bridge') || run.held[o.id] >= HOLD) { st.done[o.id] = true; ev.push({ type: 'done', id: o.id, reward: grant(st, o) }); }
    }
  }
  return ev;
}
const rateOf = (r) => r.count * 4 / WINDOW; // orbs per second over the window
function satisfied(st, o) {
  const recs = st.run.rec[o.id];
  const full = st.run.beat >= WINDOW;
  if (o.kind === 'bridge') return recs.every((r, i) => r.total >= o.receptors[i].total);
  if (!full) return false;
  const rateOk = recs.every((r, i) => rateOf(r) >= o.receptors[i].rate - 1e-9);
  if (o.kind === 'rune') {
    const s = recs[0].seq.slice(-8);
    return rateOk && s.length === 8 && s.every((e, k) => e === o.pattern[(o.pattern.indexOf(s[0]) + k) % o.pattern.length]);
  }
  if (o.kind === 'scales') return rateOk && Math.abs(recs[0].count - recs[1].count) <= 1;
  return rateOk;
}
function grant(st, o) {
  const got = [];
  for (const [k, v] of Object.entries(o.reward)) {
    if (k === 'end') { got.push('the end of the demo'); continue; }
    if (v === true) { if (!st.unlocked.includes(k)) st.unlocked.push(k); got.push(`${ORBS[k].name} element`); }
    else { st.inv[k] = (st.inv[k] || 0) + v; got.push(`${PIECES[k].name}${v > 1 ? ' ×' + v : ''}`); }
  }
  return got;
}
// Progress for display: [shown value, target, unit] per receptor.
function progress(st, o) {
  return o.receptors.map((r, i) => {
    const rec = st.run && st.run.rec[o.id][i];
    if (o.kind === 'bridge') return { value: st.done[o.id] ? r.total : rec ? rec.total : 0, target: r.total, unit: '' };
    return { value: rec ? rateOf(rec) : 0, target: r.rate, unit: '/s' };
  });
}

// ---------------------------------------------------------------- save / load (layout and progress only; a run never persists)
function serialize(st) { return JSON.stringify({ ...st, run: null, pieces: Object.values(st.pieces).map(({ type, x, y, dir, el, end, link, dist }) => ({ type, x, y, dir, el, end, link, dist })) }); }
function deserialize(json) {
  const raw = JSON.parse(json), st = { ...newState(), ...raw, run: null, pieces: {} };
  st.inv = { ...newState().inv, underpass: 0, ...raw.inv };
  for (const p of raw.pieces || []) { const q = { ...p, timer: 0, flip: 0, last: -1, slots: {}, out: null, tunnel: [] }; st.pieces[idx(p.x, p.y)] = q; }
  return st;
}

if (typeof module !== 'undefined') module.exports = {
  BEAT, WINDOW, SPRING_EVERY, HOLD, UNDERPASS_MIN, UNDERPASS_MAX, DIRS, ARROWS, ORBS, RECIPES, PARTS, PIECES, PIECE_ORDER, W, H, START, GRID, OBJECTIVES, OBJ, BARRIER, RECEPTOR, CHASM,
  idx, inMap, newState, pieceAt, gateOpen, passable, reachable, canPlace, place, canUnderpass, placeUnderpass, remove, rotate, attune, startRun, endRun,
  outDirs, feeders, mixerJammed, step, rateOf, satisfied, progress, serialize, deserialize,
};
