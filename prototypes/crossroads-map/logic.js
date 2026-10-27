// Crossroads map demo: the map, run rules and between-run progress (no DOM), shared by the page and the Node checks.
/* eslint-disable no-unused-vars */
const MAP_N = 41, MAP_C = 20; // 41×41 tiles, the Keep's centre tile at (20, 20)

const REGIONS = {
  N: { name: 'Stonereach', dir: 'North', vein: 'earth', foe: 'Armoured', counter: 'earth-cracking fire', counterEl: 'fire' },
  E: { name: 'Ember Wastes', dir: 'East', vein: 'fire', foe: 'Fire-shielded', counter: 'water', counterEl: 'water' },
  S: { name: 'Tidemarsh', dir: 'South', vein: 'water', foe: 'Swarms', counter: 'earth (mud and splash)', counterEl: 'earth' },
  W: { name: 'Skyspire', dir: 'West', vein: 'air', foe: 'Fliers', counter: 'air', counterEl: 'air' },
};
const FRONTS = ['N', 'E', 'S', 'W'];

// tier 1 primaries, 2 secondaries, 3 tertiaries; parts = the primaries an orb is made of (decides which fronts it counters)
const ORBS = {
  fire: { name: 'Fire', icon: '🔥', tier: 1 }, water: { name: 'Water', icon: '💧', tier: 1 },
  earth: { name: 'Earth', icon: '🪨', tier: 1 }, air: { name: 'Air', icon: '🌪️', tier: 1 },
  steam: { name: 'Steam', icon: '☁️', tier: 2 }, magma: { name: 'Magma', icon: '🌋', tier: 2 }, mud: { name: 'Mud', icon: '🟫', tier: 2 },
  lightning: { name: 'Lightning', icon: '⚡', tier: 2 }, ice: { name: 'Ice', icon: '❄️', tier: 2 }, dust: { name: 'Dust', icon: '🌫️', tier: 2 },
  eruption: { name: 'Eruption', icon: '🌠', tier: 3 }, obsidian: { name: 'Obsidian', icon: '🖤', tier: 3 },
  quagmire: { name: 'Quagmire', icon: '🫧', tier: 3 }, storm: { name: 'Storm', icon: '⛈️', tier: 3 },
};
const RECIPES = {
  'fire+water': 'steam', 'earth+fire': 'magma', 'earth+water': 'mud',
  'air+fire': 'lightning', 'air+water': 'ice', 'air+earth': 'dust',
  'magma+steam': 'eruption', 'magma+mud': 'obsidian', 'mud+steam': 'quagmire', 'ice+lightning': 'storm',
};
const recipeKey = (a, b) => [a, b].sort().join('+');
function orbParts(el) {
  if (ORBS[el].tier === 1) return [el];
  const key = Object.keys(RECIPES).find((k) => RECIPES[k] === el);
  return [...new Set(key.split('+').flatMap(orbParts))];
}

const TUNING = {
  keepHp: 100, startGold: 40, goldPerSec: 1, killGold: 0.8,
  keepLight: 4.5, beaconLight: 3.5, beaconCost: 20, beaconStep: 10,
  extractorCost: 15, mineRate: 1.5,
  sourcePrice: { 1: 40, 2: 30, 3: 20 }, sourcePower: { 1: 1, 2: 2, 3: 4 }, counterMult: 2,
  mergeStep: 10, lairHp: 30, lairBounty: 25,
  nightfall: 300, // waves grow by 100% every this many seconds
  ambientStart: 120, ambientPer: 360, // the dark itself starts pressing on every front after 2 minutes
};

// ---------------------------------------------------------------- the handmade map
// dx, dy are offsets from the Keep (north = negative dy). gate: id of the gate that must be opened first.
const FEATURES = [
  // North: Stonereach (earth, armoured foes)
  { id: 'n-vein1', type: 'vein', el: 'earth', amount: 80, dx: -2, dy: -5 },
  { id: 'n-vein2', type: 'vein', el: 'earth', amount: 60, dx: 3, dy: -6 },
  { id: 'n-lore', type: 'lore', dx: 1, dy: -4, text: 'Carved in the stone: “The Stone Gate drinks only fire.”' },
  { id: 'n-lair1', type: 'lair', name: 'Gravel Den', p: 1, dx: 0, dy: -10, via: [[-3, -7]] },
  { id: 'n-vein3', type: 'vein', el: 'earth', amount: 150, dx: -5, dy: -11 },
  { id: 'n-gate', type: 'gate', name: 'Stone Gate', need: 'fire', n: 40, dx: 5, dy: -11 },
  { id: 'n-vein4', type: 'vein', el: 'earth', amount: 250, dx: 7, dy: -13, gate: 'n-gate' },
  { id: 'n-way', type: 'waystone', dx: -2, dy: -13 },
  { id: 'n-blue', type: 'blueprint', name: 'Mortar blueprint', dx: -8, dy: -14 },
  { id: 'n-buried', type: 'vein', el: 'earth', amount: 120, buried: true, dx: -9, dy: -9 },
  { id: 'n-lair2', type: 'lair', name: 'Iron Barrow', p: 2, dx: 2, dy: -17, via: [[5, -15], [2, -12]] },
  { id: 'n-recipe', type: 'recipe', orb: 'obsidian', dx: -5, dy: -18 },
  { id: 'n-seal', type: 'seal', name: 'Seal of Stone', dx: 7, dy: -18 },
  // East: Ember Wastes (fire, fire-shielded foes)
  { id: 'e-vein1', type: 'vein', el: 'fire', amount: 80, dx: 5, dy: 1 },
  { id: 'e-vein2', type: 'vein', el: 'fire', amount: 60, dx: 6, dy: -2 },
  { id: 'e-lore', type: 'lore', dx: 4, dy: 2, text: 'Scratched on a charred post: “Water quenches the Wastes. The Ember Gate thirsts.”' },
  { id: 'e-lair1', type: 'lair', name: 'Cinder Hollow', p: 1, dx: 10, dy: 0, via: [[8, 3]] },
  { id: 'e-vein3', type: 'vein', el: 'fire', amount: 150, dx: 11, dy: 5 },
  { id: 'e-gate', type: 'gate', name: 'Ember Gate', need: 'water', n: 40, dx: 12, dy: -4 },
  { id: 'e-vein4', type: 'vein', el: 'fire', amount: 250, dx: 14, dy: -6, gate: 'e-gate' },
  { id: 'e-way', type: 'waystone', dx: 9, dy: 6 },
  { id: 'e-blue', type: 'blueprint', name: 'Beam Spire blueprint', dx: 14, dy: 8 },
  { id: 'e-buried', type: 'vein', el: 'fire', amount: 120, buried: true, dx: 9, dy: -7 },
  { id: 'e-lair2', type: 'lair', name: 'Ashen Maw', p: 2, dx: 17, dy: 1, via: [[15, -2]] },
  { id: 'e-recipe', type: 'recipe', orb: 'eruption', dx: 18, dy: -5 },
  { id: 'e-seal', type: 'seal', name: 'Seal of Embers', dx: 18, dy: 6 },
  // South: Tidemarsh (water, swarms) — the gentlest direction
  { id: 's-vein1', type: 'vein', el: 'water', amount: 80, dx: -1, dy: 5 },
  { id: 's-vein2', type: 'vein', el: 'water', amount: 60, dx: 2, dy: 6 },
  { id: 's-lore', type: 'lore', dx: -2, dy: 4, text: 'A half-sunk marker: “Earth holds back the Sluice. A rod finds what the marsh hides.”' },
  { id: 's-lair1', type: 'lair', name: 'Reed Nest', p: 1, dx: 0, dy: 10, via: [[3, 8]] },
  { id: 's-vein3', type: 'vein', el: 'water', amount: 150, dx: 5, dy: 11 },
  { id: 's-gate', type: 'gate', name: 'Tide Sluice', need: 'earth', n: 40, dx: -5, dy: 11 },
  { id: 's-vein4', type: 'vein', el: 'water', amount: 250, dx: -7, dy: 13, gate: 's-gate' },
  { id: 's-way', type: 'waystone', dx: 2, dy: 13 },
  { id: 's-ancient', type: 'ancient', orb: 'steam', dx: 6, dy: 15 },
  { id: 's-rod', type: 'relic', key: 'rod', name: 'Dowsing Rod', info: 'Reveals buried veins on every run.', dx: -3, dy: 15 },
  { id: 's-buried', type: 'vein', el: 'water', amount: 120, buried: true, dx: -7, dy: 8 },
  { id: 's-lair2', type: 'lair', name: 'Mire Hive', p: 2, dx: -1, dy: 17, via: [[-3, 13]] },
  { id: 's-recipe', type: 'recipe', orb: 'quagmire', dx: -8, dy: 18 },
  { id: 's-seal', type: 'seal', name: 'Seal of Tides', dx: 5, dy: 19 },
  // West: Skyspire (air, fliers) — behind the Sky Gate, which needs all three seals
  { id: 'w-lore', type: 'lore', dx: -3, dy: 1, text: 'Wind sings through the gate: “Three seals, from stone, ember and tide, open the sky.”' },
  { id: 'w-gate', type: 'skygate', name: 'Sky Gate', dx: -5, dy: 0 },
  { id: 'w-vein1', type: 'vein', el: 'air', amount: 120, dx: -9, dy: 2 },
  { id: 'w-lair1', type: 'lair', name: 'Gale Roost', p: 2, dx: -11, dy: -2, via: [[-8, -5]] },
  { id: 'w-lantern', type: 'relic', key: 'lantern', name: 'Storm Lantern', info: 'Beacons light 1 tile further, every run.', dx: -12, dy: 6 },
  { id: 'w-vein2', type: 'vein', el: 'air', amount: 200, dx: -14, dy: -4 },
  { id: 'w-blue', type: 'blueprint', name: 'Lance blueprint', dx: -15, dy: 9 },
  { id: 'w-recipe', type: 'recipe', orb: 'storm', dx: -16, dy: -9 },
  { id: 'w-lair2', type: 'lair', name: 'Storm Eyrie', p: 4, final: true, dx: -18, dy: 0, via: [[-15, 3]] },
];
for (const f of FEATURES) { f.x = MAP_C + f.dx; f.y = MAP_C + f.dy; }
const FEATURE_BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
const PERMANENT = new Set(['blueprint', 'recipe', 'relic', 'seal', 'waystone']);

const idx = (x, y) => y * MAP_N + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_N && y < MAP_N;
function noise(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function regionOf(x, y) {
  const dx = x - MAP_C, dy = y - MAP_C;
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) return 'K';
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'N' : 'S';
  return dx > 0 ? 'E' : 'W';
}
function ringOf(x, y) { const d = Math.max(Math.abs(x - MAP_C), Math.abs(y - MAP_C)); return d <= 1 ? 0 : d <= 7 ? 1 : d <= 13 ? 2 : 3; }
const isKeep = (x, y) => regionOf(x, y) === 'K';
// Beyond the Sky Gate the west is veiled: no light gets in until the gate opens.
const isVeiled = (x, y) => regionOf(x, y) === 'W' && x < MAP_C - 5;

const featureAt = new Map(FEATURES.map((f) => [idx(f.x, f.y), f]));

// Roads: each lair's path to the Keep, bending through its handmade waypoints (via) and preferring roads already laid so they join up.
function shortestPath(road, from, isGoal, own) {
  const dist = new Float64Array(MAP_N * MAP_N).fill(Infinity), prev = new Int32Array(MAP_N * MAP_N).fill(-1);
  const heap = [[0, idx(from[0], from[1])]];
  dist[heap[0][1]] = 0;
  while (heap.length) {
    let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [d, i] = heap.splice(bi, 1)[0];
    if (d > dist[i]) continue;
    const x = i % MAP_N, y = (i - x) / MAP_N;
    if (isGoal(x, y)) {
      const path = [];
      for (let k = i; k !== -1; k = prev[k]) path.push([k % MAP_N, Math.floor(k / MAP_N)]);
      return path.reverse();
    }
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny), f = featureAt.get(j);
      if (f && f !== own) continue; // roads go round features
      const step = road[j] ? 0.5 : 1 + noise(Math.floor(nx / 2), Math.floor(ny / 2)) * 3;
      if (d + step < dist[j]) { dist[j] = d + step; prev[j] = i; heap.push([dist[j], j]); }
    }
  }
  return [];
}
function buildRoads() {
  const road = new Uint8Array(MAP_N * MAP_N), paths = {};
  const lairs = FEATURES.filter((f) => f.type === 'lair').sort((a, b) => ringOf(a.x, a.y) - ringOf(b.x, b.y));
  for (const lair of lairs) {
    let at = [lair.x, lair.y], path = [at];
    for (const [vx, vy] of lair.via || []) {
      const leg = shortestPath(road, at, (x, y) => x === MAP_C + vx && y === MAP_C + vy, lair);
      path.push(...leg.slice(1)); at = path[path.length - 1];
    }
    path.push(...shortestPath(road, at, isKeep, lair).slice(1)); // lair → Keep
    for (const [x, y] of path) if (!isKeep(x, y) && !(x === lair.x && y === lair.y)) road[idx(x, y)] = 1;
    paths[lair.id] = path;
  }
  return { road, paths };
}
const ROADS = buildRoads();

// ---------------------------------------------------------------- between-run progress (meta)
const SHOP = [
  { key: 'walls', name: 'Stout Walls', info: 'Keep health +25.', costs: [10, 20, 35, 50] },
  { key: 'chest', name: 'War Chest', info: 'Start each run with +25 gold.', costs: [10, 20, 35, 50] },
  { key: 'surveyor', name: 'Surveyor’s Guild', info: 'Beacons cost 5 gold less.', costs: [15, 30] },
  { key: 'founding', name: 'Founding Source', info: 'Start each run with a free primary Source (pick its element before the run).', costs: [30] },
];
function newMeta() {
  return { runs: 0, echoes: 0, seen: new Array(MAP_N * MAP_N).fill(0), found: [], upgrades: {}, foundingEl: 'fire', startAt: [], best: 0 };
}
const has = (meta, id) => meta.found.includes(id);
const relic = (meta, key) => FEATURES.some((f) => f.type === 'relic' && f.key === key && has(meta, f.id));
const recipeKnown = (meta, orb) => ORBS[orb].tier < 3 || FEATURES.some((f) => f.type === 'recipe' && f.orb === orb && has(meta, f.id));
const blueprints = (meta) => FEATURES.filter((f) => f.type === 'blueprint' && has(meta, f.id)).length;
const seals = (meta) => FEATURES.filter((f) => f.type === 'seal' && has(meta, f.id)).length;
const upg = (meta, key) => meta.upgrades[key] || 0;
function shopCost(meta, item) { const lvl = upg(meta, item.key); return lvl < item.costs.length ? item.costs[lvl] : null; }
function buyUpgrade(meta, key) {
  const item = SHOP.find((s) => s.key === key), cost = shopCost(meta, item);
  if (cost == null || meta.echoes < cost) return false;
  meta.echoes -= cost; meta.upgrades[key] = upg(meta, key) + 1; return true;
}

// ---------------------------------------------------------------- a run
function newRun(meta) {
  const run = {
    t: 0, gold: TUNING.startGold + 25 * upg(meta, 'chest'), hpMax: TUNING.keepHp + 25 * upg(meta, 'walls'),
    wallet: {}, beacons: [], extractors: {}, veins: {}, lairs: {}, opened: [], skyOpen: false,
    sources: [], claimed: [], touched: [], newFound: [], destroyed: 0, maxLit: 0, over: false, log: [],
    lit: new Uint8Array(MAP_N * MAP_N), beaconsBought: 0,
  };
  run.hp = run.hpMax;
  for (const f of FEATURES) {
    if (f.type === 'vein') run.veins[f.id] = f.amount;
    if (f.type === 'lair') run.lairs[f.id] = { hp: TUNING.lairHp * f.p, dead: false };
  }
  if (upg(meta, 'founding')) run.sources.push({ el: meta.foundingEl, front: REGION_FOR_COUNTER[meta.foundingEl] || 'N', free: true });
  for (const id of meta.startAt) if (has(meta, id)) run.beacons.push({ x: FEATURE_BY_ID[id].x, y: FEATURE_BY_ID[id].y, free: true });
  computeLit(run, meta);
  return run;
}
const REGION_FOR_COUNTER = { fire: 'N', water: 'E', earth: 'S', air: 'W' };

function lightRadius(meta) { return TUNING.beaconLight + (relic(meta, 'lantern') ? 1 : 0); }
function computeLit(run, meta) {
  const lights = [{ x: MAP_C, y: MAP_C, r: TUNING.keepLight }, ...run.beacons.map((b) => ({ x: b.x, y: b.y, r: lightRadius(meta) }))];
  let n = 0;
  for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
    const on = (!isVeiled(x, y) || run.skyOpen) && lights.some((l) => (x - l.x) ** 2 + (y - l.y) ** 2 <= l.r * l.r);
    run.lit[idx(x, y)] = on ? 1 : 0;
    if (on) { n++; meta.seen[idx(x, y)] = 1; }
  }
  run.maxLit = Math.max(run.maxLit, n);
  return n;
}
const isLit = (run, x, y) => inMap(x, y) && run.lit[idx(x, y)] === 1;
const isSeen = (meta, x, y) => meta.seen[idx(x, y)] === 1;

function beaconCost(run, meta) { return Math.max(5, TUNING.beaconCost + TUNING.beaconStep * run.beaconsBought - 5 * upg(meta, 'surveyor')); }
function canBeacon(run, meta, x, y) {
  if (!inMap(x, y)) return 'Off the map.';
  if (!isLit(run, x, y)) return 'Beacons must go inside your light.';
  if (isKeep(x, y)) return 'That’s the Keep.';
  if (featureAt.has(idx(x, y))) return 'Something is already here.';
  if (run.beacons.some((b) => b.x === x && b.y === y)) return 'There’s a beacon here.';
  if (run.gold < beaconCost(run, meta)) return `Needs ${beaconCost(run, meta)} gold.`;
  return null;
}
function placeBeacon(run, meta, x, y) {
  const why = canBeacon(run, meta, x, y);
  if (why) return why;
  run.gold -= beaconCost(run, meta); run.beaconsBought++;
  run.beacons.push({ x, y });
  computeLit(run, meta);
  return null;
}

function veinOpen(run, meta, f) {
  if (f.gate && !run.opened.includes(f.gate)) return false;
  if (f.buried && !relic(meta, 'rod')) return false;
  return true;
}
function buildExtractor(run, meta, f) {
  if (!isLit(run, f.x, f.y) || !veinOpen(run, meta, f) || run.extractors[f.id]) return 'Not possible here.';
  if (run.gold < TUNING.extractorCost) return `Needs ${TUNING.extractorCost} gold.`;
  run.gold -= TUNING.extractorCost; run.extractors[f.id] = true; return null;
}
function feedGate(run, f) {
  if ((run.wallet[f.need] || 0) < f.n) return `Needs ${f.n} ${ORBS[f.need].name.toLowerCase()} orbs at the Keep.`;
  run.wallet[f.need] -= f.n; run.opened.push(f.id); touch(run, f); return null;
}
function openSky(run, meta, f) {
  if (seals(meta) < 3) return `Needs all three seals (${seals(meta)}/3 found).`;
  run.skyOpen = true; run.opened.push(f.id); touch(run, f); computeLit(run, meta); return null;
}
// Permanent finds (blueprints, recipes, relics, seals, waystones) are kept forever.
function take(run, meta, f) {
  if (!isLit(run, f.x, f.y) || has(meta, f.id)) return 'Nothing to take.';
  meta.found.push(f.id); run.newFound.push(f.id); touch(run, f);
  if (f.type === 'relic' && f.key === 'lantern') computeLit(run, meta);
  return null;
}
function claimAncient(run, f) {
  if (run.claimed.includes(f.id)) return 'Already claimed this run.';
  run.claimed.push(f.id); run.sources.push({ el: f.orb, front: 'N', free: true }); touch(run, f); return null;
}
function touch(run, f) { if (!run.touched.includes(f.id)) run.touched.push(f.id); }

// Keep alchemy: raw orbs, in steps of 10 + 10 → 10. Can't be undone.
function mergeResult(meta, a, b) {
  const out = RECIPES[recipeKey(a, b)];
  return out && recipeKnown(meta, out) ? out : null;
}
function merge(run, meta, a, b) {
  const out = mergeResult(meta, a, b), s = TUNING.mergeStep;
  if (!out) return 'Those don’t combine (or you haven’t found that recipe).';
  if ((run.wallet[a] || 0) < s || (run.wallet[b] || 0) < s) return `Needs ${s} of each.`;
  run.wallet[a] -= s; run.wallet[b] -= s; run.wallet[out] = (run.wallet[out] || 0) + s; return null;
}
const sourcePrice = (el) => TUNING.sourcePrice[ORBS[el].tier];
function buySource(run, el, front) {
  if ((run.wallet[el] || 0) < sourcePrice(el)) return `Needs ${sourcePrice(el)} ${ORBS[el].name.toLowerCase()} orbs.`;
  run.wallet[el] -= sourcePrice(el); run.sources.push({ el, front }); return null;
}
function sellSource(run, i) {
  const s = run.sources[i];
  if (!s.free) run.wallet[s.el] = (run.wallet[s.el] || 0) + Math.floor(sourcePrice(s.el) / 2);
  run.sources.splice(i, 1);
}

// ---------------------------------------------------------------- fronts and time
const nightfall = (t) => 1 + t / TUNING.nightfall;
const ambient = (t) => Math.max(0, (t - TUNING.ambientStart) / TUNING.ambientPer);
function sourceDefense(s, front) {
  const power = TUNING.sourcePower[ORBS[s.el].tier];
  return s.front !== front ? 0 : power * (orbParts(s.el).includes(REGIONS[front].counterEl) ? TUNING.counterMult : 1);
}
function fronts(run, meta) {
  const out = {};
  for (const fr of FRONTS) {
    const awake = FEATURES.filter((f) => f.type === 'lair' && regionOf(f.x, f.y) === fr && isLit(run, f.x, f.y) && !run.lairs[f.id].dead);
    const pressure = awake.reduce((a, f) => a + f.p, 0) * nightfall(run.t) + ambient(run.t);
    const defense = 1 + blueprints(meta) + run.sources.reduce((a, s) => a + sourceDefense(s, fr), 0);
    out[fr] = { awake, pressure, defense };
  }
  return out;
}

// Advance the run by dt seconds. Returns events for the page.
function tick(run, meta, dt) {
  if (run.over) return [];
  const ev = [];
  run.t += dt;
  for (const [id, on] of Object.entries(run.extractors)) {
    if (!on || run.veins[id] <= 0) continue;
    const got = Math.min(run.veins[id], TUNING.mineRate * dt), el = FEATURE_BY_ID[id].el;
    run.veins[id] -= got; run.wallet[el] = (run.wallet[el] || 0) + got;
    if (run.veins[id] <= 1e-6) { run.veins[id] = 0; ev.push({ type: 'depleted', id }); }
  }
  let income = TUNING.goldPerSec, damage = 0;
  const fr = fronts(run, meta);
  for (const k of FRONTS) {
    const { awake, pressure, defense } = fr[k];
    income += Math.min(pressure, defense) * TUNING.killGold;
    damage += Math.max(0, pressure - defense);
    // Spare defense pushes out to siege the nearest awake lair on this front.
    const spare = defense - pressure;
    if (spare > 0 && awake.length) {
      const lair = awake.sort((a, b) => ringOf(a.x, a.y) - ringOf(b.x, b.y))[0], st = run.lairs[lair.id];
      st.hp -= spare * dt;
      if (st.hp <= 0) {
        st.dead = true; run.destroyed++; run.gold += TUNING.lairBounty * lair.p;
        ev.push({ type: 'lair', id: lair.id, final: !!lair.final });
      }
    }
  }
  run.gold += income * dt;
  run.hp -= damage * dt;
  if (run.hp <= 0) { run.hp = 0; run.over = true; ev.push({ type: 'fallen' }); }
  return ev;
}

// Echoes for a finished run; also banks them and counts the run.
function endRun(run, meta) {
  const parts = {
    explored: Math.floor(run.maxLit / 10), lairs: 6 * run.destroyed,
    secrets: 2 * run.touched.filter((id) => !PERMANENT.has(FEATURE_BY_ID[id].type)).length + 10 * run.newFound.length,
    survived: Math.floor(run.t / 20),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  meta.echoes += total; meta.runs++; meta.best = Math.max(meta.best, Math.floor(run.t));
  return { parts, total };
}

if (typeof module !== 'undefined') module.exports = {
  MAP_N, MAP_C, REGIONS, FRONTS, ORBS, RECIPES, TUNING, FEATURES, FEATURE_BY_ID, ROADS, SHOP, PERMANENT,
  idx, inMap, noise, regionOf, ringOf, isKeep, isVeiled, featureAt, orbParts, recipeKey,
  newMeta, has, relic, recipeKnown, blueprints, seals, upg, shopCost, buyUpgrade,
  newRun, lightRadius, computeLit, isLit, isSeen, beaconCost, canBeacon, placeBeacon, veinOpen, buildExtractor, feedGate, openSky,
  take, claimAncient, mergeResult, merge, sourcePrice, buySource, sellSource, nightfall, ambient, sourceDefense, fronts, tick, endRun,
};
