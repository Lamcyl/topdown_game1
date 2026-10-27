// Crossroads demo: the map, real-time run rules (belts, towers, mobs) and between-run progress (no DOM), shared by the page and the Node checks.
/* eslint-disable no-unused-vars */
const MAP_N = 41, MAP_C = 20; // 41×41 tiles, the Keep's centre tile at (20, 20)

const REGIONS = {
  N: { name: 'Stonereach', dir: 'North', vein: 'earth', foe: 'Armoured', counter: 'earth or mud cracks armour; steam scalds through it' },
  E: { name: 'Ember Wastes', dir: 'East', vein: 'fire', foe: 'Fire-shielded', counter: 'water soaks the shield away; fire does nothing until then' },
  S: { name: 'Tidemarsh', dir: 'South', vein: 'water', foe: 'Swarms', counter: 'splash (Mortar, Spray, Rune Trap) and mud to slow them' },
  W: { name: 'Skyspire', dir: 'West', vein: 'air', foe: 'Fliers', counter: 'fliers ignore walls and traps; ice freezes them' },
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
  keepHp: 100, startGold: 70, goldPerSec: 0.5,
  keepLight: 4.5, beaconLight: 3.5, beaconCost: 20, beaconStep: 10,
  extractorCost: 15, mineRate: 1.5,
  sourcePrice: { 1: 40, 2: 30, 3: 20 }, sourceRate: { 1: 1, 2: 1, 3: 0.7 }, // forged orbs per second
  mergeStep: 10, lairHp: 60, lairBounty: 25,
  beat: 0.25, // belts move orbs one tile per beat
  magazine: 6, dormant: 3,
  nightfall: 300, // waves grow by 100% every this many seconds
  stirEvery: 150, // every 150 s the dark stirs a sleeping lair, lit or not
  keepGun: { range: 3.5, cd: 1, dmg: 1 }, // the Keep's own weak bolt, needs no orbs
};

// Element effects (real time): dmg per hit; burn [per second, seconds]; soak/slow/freeze in seconds.
const EFFECTS = {
  fire: { dmg: 2, burn: [1, 3], fiery: true, info: 'Burns: 1 a second for 3 s.' },
  water: { dmg: 1, soak: 4, info: 'Soaks: puts out fire shields; lightning does double.' },
  earth: { dmg: 3, crack: true, info: 'Cracks armour for good.' },
  air: { dmg: 1, knock: 1, info: 'Knocks the foe back a tile.' },
  steam: { dmg: 4, pierce: true, soak: 4, info: 'Scalds through armour and soaks.' },
  magma: { dmg: 6, burn: [2, 3], fiery: true, info: 'Burns hard: 2 a second for 3 s.' },
  mud: { dmg: 2, crack: true, soak: 4, slow: [0.5, 3], info: 'Cracks armour, soaks, and slows to half speed.' },
  lightning: { dmg: 4, zap: true, info: 'Double damage against a soaked foe.' },
  ice: { dmg: 3, freeze: 1.2, brittle: true, info: 'Freezes for 1.2 s; the next hit does double.' },
  dust: { dmg: 2, crack: true, unshield: true, info: 'Sandblasts away armour and fire shields.' },
  eruption: { dmg: 10, splash: 1.5, burn: [2, 3], fiery: true, info: 'Bursts over an area and sets it burning.' },
  obsidian: { dmg: 14, crack: true, info: 'A huge hit that cracks armour.' },
  quagmire: { dmg: 3, splash: 1.5, soak: 4, slow: [0.5, 3], info: 'Bursts over an area, soaking and slowing.' },
  storm: { dmg: 9, zap: true, brittle: true, info: 'Double damage against a soaked foe, and leaves it brittle.' },
};

// Foes by region. hp grows with nightfall.
const MOBS = {
  N: { name: 'Armoured brute', hp: 12, speed: 0.8, armour: 2, dmg: 8, gold: 4, every: 4 },
  E: { name: 'Shielded imp', hp: 9, speed: 1.0, shield: true, dmg: 6, gold: 4, every: 4 },
  S: { name: 'Marsh swarmer', hp: 4, speed: 1.5, dmg: 2, gold: 1, every: 1.6 },
  W: { name: 'Sky raider', hp: 8, speed: 1.2, flies: true, dmg: 6, gold: 4, every: 4 },
};

// Buildings. solid = blocks the road (and gets attacked); flat ones can be walked over.
const BUILD = {
  beacon: { name: 'Beacon', icon: '🕯️', solid: true, hp: 25, info: 'Lights the fog around it. Must go inside your light.' },
  extractor: { name: 'Extractor', icon: '⛏️', cost: 15, solid: true, hp: 25, info: 'Goes on a vein; sends raw orbs to the Keep.' },
  belt: { name: 'Belt', icon: '➜', cost: 2, dir: true, info: 'Moves forged orbs one tile per beat. Drag to lay a line.' },
  splitter: { name: 'Splitter', icon: '⑂', cost: 6, dir: true, info: 'Takes orbs from behind, sends them out left and right in turn.' },
  joiner: { name: 'Joiner', icon: '⑃', cost: 6, dir: true, info: 'Takes from the back and both sides, alternating, and sends forward. Makes sequences.' },
  mixer: { name: 'Mixer', icon: '⚗️', cost: 12, dir: true, solid: true, hp: 30, info: 'Two forged inputs in, one secondary out the front. Same + same makes a stronger orb. More than two inputs jams it.' },
  wall: { name: 'Wall', icon: '🧱', cost: 8, solid: true, hp: 80, info: 'Blocks the road. Foes stop to break it.' },
  bolt: { name: 'Bolt Thrower', icon: '🏹', cost: 25, tower: true, solid: true, hp: 40, range: 4, cd: 0.8, mult: 1.5, info: 'Single target, quick.' },
  beam: { name: 'Beam Spire', icon: '🗼', cost: 40, tower: true, solid: true, hp: 40, range: 5, cd: 1.4, mult: 1.2, blueprint: 'e-blue', info: 'Instant beam through everything in a line.' },
  mortar: { name: 'Mortar', icon: '☄️', cost: 40, tower: true, solid: true, hp: 40, range: 5.5, min: 1.5, cd: 1.8, mult: 1.3, radius: 1.3, blueprint: 'n-blue', info: 'Slow lob that splashes an area. Can’t hit up close.' },
  lance: { name: 'Lance', icon: '🔱', cost: 35, tower: true, solid: true, hp: 40, range: 4.5, cd: 1.2, mult: 1.2, blueprint: 'w-blue', info: 'A bolt that pierces every foe on its way.' },
  spray: { name: 'Spray Fountain', icon: '⛲', cost: 30, tower: true, solid: true, hp: 40, range: 2.5, cd: 0.7, mult: 0.7, cone: 0.6, info: 'Short cone that hits everything in front.' },
  trap: { name: 'Rune Trap', icon: '✴️', cost: 15, tower: true, flat: true, hp: 40, range: 0.7, cd: 0.8, mult: 2, radius: 1, roadOnly: true, info: 'Goes on the road. Bursts when walked over (fliers pass above).' },
  source: { name: 'Source', icon: '🔮', dir: true, solid: true, hp: 30, info: 'Makes forged orbs forever, out of its front.' },
};
const TOWERS = Object.keys(BUILD).filter((k) => BUILD[k].tower);
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
const ARROWS = ['↑', '→', '↓', '←'];

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
  { id: 'n-blue', type: 'blueprint', tower: 'mortar', name: 'Mortar blueprint', dx: -8, dy: -14 },
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
  { id: 'e-blue', type: 'blueprint', tower: 'beam', name: 'Beam Spire blueprint', dx: 14, dy: 8 },
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
  { id: 'w-blue', type: 'blueprint', tower: 'lance', name: 'Lance blueprint', dx: -15, dy: 9 },
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
  return { runs: 0, echoes: 0, seen: new Array(MAP_N * MAP_N).fill(0), found: [], upgrades: {}, foundingEl: 'fire', startAt: [], best: 0, testAll: false };
}
const has = (meta, id) => meta.found.includes(id);
const relic = (meta, key) => FEATURES.some((f) => f.type === 'relic' && f.key === key && has(meta, f.id));
const recipeKnown = (meta, orb) => ORBS[orb].tier < 3 || meta.testAll || FEATURES.some((f) => f.type === 'recipe' && f.orb === orb && has(meta, f.id));
const towerKnown = (meta, type) => !BUILD[type].blueprint || meta.testAll || has(meta, BUILD[type].blueprint);
const seals = (meta) => FEATURES.filter((f) => f.type === 'seal' && has(meta, f.id)).length;
const upg = (meta, key) => meta.upgrades[key] || 0;
function shopCost(meta, item) { const lvl = upg(meta, item.key); return lvl < item.costs.length ? item.costs[lvl] : null; }
function buyUpgrade(meta, key) {
  const item = SHOP.find((s) => s.key === key), cost = shopCost(meta, item);
  if (cost == null || meta.echoes < cost) return false;
  meta.echoes -= cost; meta.upgrades[key] = upg(meta, key) + 1; return true;
}

// ---------------------------------------------------------------- a run
// ---------------------------------------------------------------- a run
function newRun(meta) {
  const run = {
    t: 0, gold: TUNING.startGold + 25 * upg(meta, 'chest'), hpMax: TUNING.keepHp + 25 * upg(meta, 'walls'),
    wallet: {}, inv: {}, b: new Map(), orbs: new Map(), mobs: [], shots: [], fx: [],
    veins: {}, lairs: {}, opened: [], skyOpen: false, claimed: [], touched: [], newFound: [],
    destroyed: 0, kills: 0, maxLit: 0, over: false, won: false, freeLights: [],
    lit: new Uint8Array(MAP_N * MAP_N), beaconsBought: 0, beatClock: 0, keepCd: 0, nextStir: TUNING.stirEvery, stirs: 0, nextId: 1,
  };
  run.hp = run.hpMax;
  for (const f of FEATURES) {
    if (f.type === 'vein') run.veins[f.id] = f.amount;
    if (f.type === 'lair') run.lairs[f.id] = { hp: TUNING.lairHp * f.p, dead: false, stirred: false, clock: 3 };
  }
  if (upg(meta, 'founding')) run.inv[meta.foundingEl] = 1;
  for (const id of meta.startAt) if (has(meta, id)) run.freeLights.push({ x: FEATURE_BY_ID[id].x, y: FEATURE_BY_ID[id].y });
  computeLit(run, meta);
  return run;
}

function lightRadius(meta) { return TUNING.beaconLight + (relic(meta, 'lantern') ? 1 : 0); }
function computeLit(run, meta) {
  const r = lightRadius(meta);
  const lights = [{ x: MAP_C, y: MAP_C, r: TUNING.keepLight }, ...run.freeLights.map((l) => ({ ...l, r }))];
  for (const bd of run.b.values()) if (bd.type === 'beacon') lights.push({ x: bd.x, y: bd.y, r });
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
const isRoad = (x, y) => inMap(x, y) && ROADS.road[idx(x, y)] === 1;

// ---------------------------------------------------------------- building
function beaconCost(run, meta) { return Math.max(5, TUNING.beaconCost + TUNING.beaconStep * run.beaconsBought - 5 * upg(meta, 'surveyor')); }
function buildCost(run, meta, type) { return type === 'beacon' ? beaconCost(run, meta) : type === 'source' ? 0 : BUILD[type].cost; }
function veinOpen(run, meta, f) {
  if (f.gate && !run.opened.includes(f.gate)) return false;
  if (f.buried && !relic(meta, 'rod')) return false;
  return true;
}
// Why a building can't go here, or null if it can.
function canPlace(run, meta, type, x, y, el) {
  if (!inMap(x, y)) return 'Off the map.';
  if (isKeep(x, y)) return 'That’s the Keep.';
  if (!isLit(run, x, y)) return 'You can only build inside your light.';
  const i = idx(x, y), f = featureAt.get(i), T = BUILD[type];
  if (run.b.has(i)) return 'Something is built here. Use Inspect to move or remove it.';
  if (type === 'extractor') { if (!f || f.type !== 'vein') return 'Extractors go on veins.'; if (!veinOpen(run, meta, f)) return f.gate ? 'This vein is sealed behind a gate.' : 'Nothing to mine here.'; }
  else if (f) return 'Something is already here.';
  if (T.roadOnly && !isRoad(x, y)) return `${T.name}s go on the road.`;
  if (T.blueprint && !towerKnown(meta, type)) return `Find the ${T.name} blueprint first (${REGIONS[regionOf(FEATURE_BY_ID[T.blueprint].x, FEATURE_BY_ID[T.blueprint].y)].name}).`;
  if (type === 'source' && !(run.inv[el] > 0)) return 'Buy a Source at the Keep first.';
  const cost = buildCost(run, meta, type);
  if (run.gold < cost) return `Needs ${cost} gold.`;
  return null;
}
// live = the run is playing (not paused): Sources placed live start dormant, removals refund half.
function place(run, meta, type, x, y, dir = 0, el = null, live = false) {
  const why = canPlace(run, meta, type, x, y, el);
  if (why) return why;
  const cost = buildCost(run, meta, type), T = BUILD[type];
  run.gold -= cost;
  const bd = { id: run.nextId++, type, x, y, dir, hp: T.hp || 20, maxHp: T.hp || 20, paid: cost };
  if (T.tower) { bd.mag = []; bd.cd = 0; }
  if (type === 'mixer') bd.slots = [];
  if (type === 'splitter') bd.flip = 0;
  if (type === 'joiner') bd.last = -1;
  if (type === 'extractor') bd.vein = featureAt.get(idx(x, y)).id;
  if (type === 'source') { bd.el = el; run.inv[el]--; bd.timer = 1 / sourceRate(el); bd.ready = false; bd.dormant = live ? TUNING.dormant : 0; }
  run.b.set(idx(x, y), bd);
  if (type === 'beacon') { run.beaconsBought++; computeLit(run, meta); }
  return null;
}
function removeAt(run, meta, x, y, live = false) {
  const i = idx(x, y), bd = run.b.get(i);
  if (!bd) return 'Nothing here.';
  if (bd.type === 'source') run.inv[bd.el] = (run.inv[bd.el] || 0) + 1; // picked up, never lost
  else run.gold += live ? Math.floor(bd.paid / 2) : bd.paid;
  dropBuilding(run, meta, bd);
  return null;
}
function dropBuilding(run, meta, bd) {
  const i = idx(bd.x, bd.y);
  run.b.delete(i); run.orbs.delete(i);
  if (bd.type === 'beacon') computeLit(run, meta);
}
function rotateAt(run, x, y, dir) { const bd = run.b.get(idx(x, y)); if (bd && BUILD[bd.type].dir) bd.dir = dir; }

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
  run.claimed.push(f.id); run.inv[f.orb] = (run.inv[f.orb] || 0) + 1; touch(run, f); return null;
}
function touch(run, f) { if (!run.touched.includes(f.id)) run.touched.push(f.id); }

// ---------------------------------------------------------------- the Keep: alchemy and Sources
function mergeResult(meta, a, b) {
  const out = RECIPES[recipeKey(a, b)];
  return out && recipeKnown(meta, out) ? out : null;
}
function merge(run, meta, a, b) { // raw orbs, 10 + 10 → 10; can't be undone
  const out = mergeResult(meta, a, b), s = TUNING.mergeStep;
  if (!out) return 'Those don’t combine (or you haven’t found that recipe).';
  if ((run.wallet[a] || 0) < s || (run.wallet[b] || 0) < s) return `Needs ${s} of each.`;
  run.wallet[a] -= s; run.wallet[b] -= s; run.wallet[out] = (run.wallet[out] || 0) + s; return null;
}
const sourcePrice = (el) => TUNING.sourcePrice[ORBS[el].tier];
const sourceRate = (el) => TUNING.sourceRate[ORBS[el].tier];
function buySource(run, el) {
  if ((run.wallet[el] || 0) < sourcePrice(el)) return `Needs ${sourcePrice(el)} ${ORBS[el].name.toLowerCase()} orbs.`;
  run.wallet[el] -= sourcePrice(el); run.inv[el] = (run.inv[el] || 0) + 1; return null;
}
function sellSource(run, el) { // from the inventory, for half its price in raw orbs
  if (!(run.inv[el] > 0)) return 'None in hand.';
  run.inv[el]--; run.wallet[el] = (run.wallet[el] || 0) + Math.floor(sourcePrice(el) / 2); return null;
}

// ---------------------------------------------------------------- belts: forged orbs move one tile per beat
const stepFrom = (x, y, d) => [x + DIRS[d][0], y + DIRS[d][1]];
function outDirs(bd) {
  if (bd.type === 'splitter') { const l = (bd.dir + 3) % 4, r = (bd.dir + 1) % 4; return bd.flip ? [r, l] : [l, r]; }
  if (['belt', 'joiner', 'source', 'mixer'].includes(bd.type)) return [bd.dir];
  return [];
}
// Buildings pushing into the tile at (x, y), as [building, direction of travel].
function feeders(run, x, y) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const [nx, ny] = stepFrom(x, y, (d + 2) % 4), nb = inMap(nx, ny) && run.b.get(idx(nx, ny));
    if (nb && outDirs(nb).includes(d)) out.push([nb, d]);
  }
  return out;
}
function mixerJammed(run, mx) {
  const f = feeders(run, mx.x, mx.y);
  return f.length > 2 || f.some(([, d]) => d === (mx.dir + 2) % 4);
}
const isTowerish = (t) => BUILD[t.type].tower;
function accepts(run, tj, d, want) {
  const t = run.b.get(tj);
  if (!t) return false;
  const fromFront = d === (t.dir + 2) % 4;
  switch (t.type) {
    case 'belt': return !run.orbs.has(tj) && !fromFront;
    case 'splitter': return !run.orbs.has(tj) && d === t.dir;
    case 'joiner': {
      if (run.orbs.has(tj) || fromFront) return false;
      const w = want.get(tj); // alternate: if another side is waiting, don't take the same side twice in a row
      return !(w && w.size > 1 && d === t.last);
    }
    case 'mixer': return t.slots.length < 2 && !fromFront && !mixerJammed(run, t);
    default: return isTowerish(t) && t.mag.length < TUNING.magazine;
  }
}
function deliver(run, tj, orb, d) {
  const t = run.b.get(tj);
  if (t.type === 'mixer') t.slots.push(orb);
  else if (isTowerish(t)) t.mag.push(orb);
  else { run.orbs.set(tj, orb); if (t.type === 'joiner') t.last = d; }
}
function mixOrbs(meta, a, b) {
  if (a.el === b.el) return { el: a.el, power: a.power + b.power };
  const out = RECIPES[recipeKey(a.el, b.el)];
  return out && recipeKnown(meta, out) ? { el: out, power: 1 } : null;
}
function beltStep(run, meta) {
  const pending = [...run.orbs.entries()];
  for (const [ti, orb] of pending) { orb.px = ti % MAP_N; orb.py = Math.floor(ti / MAP_N); }
  const want = new Map();
  const wantInto = (x, y, d) => { const [nx, ny] = stepFrom(x, y, d); if (!inMap(nx, ny)) return; const tj = idx(nx, ny); if ((run.b.get(tj) || {}).type === 'joiner') { if (!want.has(tj)) want.set(tj, new Set()); want.get(tj).add(d); } };
  for (const [ti] of pending) { const bd = run.b.get(ti); if (bd) for (const d of outDirs(bd)) wantInto(bd.x, bd.y, d); }
  for (const bd of run.b.values()) if ((bd.type === 'source' && bd.ready && !(bd.dormant > 0)) || (bd.type === 'mixer' && bd.slots.length === 2)) wantInto(bd.x, bd.y, bd.dir);
  const moved = new Set();
  for (let progress = true; progress;) {
    progress = false;
    for (const [ti, orb] of pending) {
      if (moved.has(orb.id)) continue;
      const bd = run.b.get(ti);
      if (!bd || run.orbs.get(ti) !== orb) { moved.add(orb.id); continue; }
      for (const d of outDirs(bd)) {
        const [nx, ny] = stepFrom(bd.x, bd.y, d);
        if (!inMap(nx, ny) || !accepts(run, idx(nx, ny), d, want)) continue;
        run.orbs.delete(ti); deliver(run, idx(nx, ny), orb, d);
        if (bd.type === 'splitter') bd.flip = d === (bd.dir + 3) % 4 ? 1 : 0;
        moved.add(orb.id); progress = true; break;
      }
    }
  }
  for (const bd of run.b.values()) {
    if (bd.type === 'source' && bd.ready && !(bd.dormant > 0)) {
      const [nx, ny] = stepFrom(bd.x, bd.y, bd.dir);
      if (inMap(nx, ny) && accepts(run, idx(nx, ny), bd.dir, want)) {
        deliver(run, idx(nx, ny), { id: run.nextId++, el: bd.el, power: 1, px: bd.x, py: bd.y }, bd.dir);
        bd.ready = false; bd.timer = 1 / sourceRate(bd.el);
      }
    }
    if (bd.type === 'mixer' && bd.slots.length === 2) {
      const res = mixOrbs(meta, bd.slots[0], bd.slots[1]);
      if (!res) { bd.slots = []; run.fx.push({ type: 'fizzle', x: bd.x + 0.5, y: bd.y + 0.5, ttl: 0.6 }); continue; }
      const [nx, ny] = stepFrom(bd.x, bd.y, bd.dir);
      if (inMap(nx, ny) && accepts(run, idx(nx, ny), bd.dir, want)) {
        deliver(run, idx(nx, ny), { id: run.nextId++, ...res, px: bd.x, py: bd.y }, bd.dir);
        bd.slots = [];
      }
    }
  }
}

// ---------------------------------------------------------------- mobs and combat
const nightfall = (t) => 1 + t / TUNING.nightfall;
function lairAwake(run, f) {
  const st = run.lairs[f.id];
  if (st.dead) return false;
  if (isVeiled(f.x, f.y) && !run.skyOpen) return false;
  return st.stirred || isLit(run, f.x, f.y);
}
function mobPos(m) {
  const p = ROADS.paths[m.lair], i = Math.min(p.length - 1, Math.floor(m.s)), j = Math.min(p.length - 1, i + 1), f = m.s - i;
  return [p[i][0] + (p[j][0] - p[i][0]) * f + 0.5, p[i][1] + (p[j][1] - p[i][1]) * f + 0.5];
}
function spawnMob(run, f) {
  const region = regionOf(f.x, f.y), k = MOBS[region], scale = (1 + 0.4 * (nightfall(run.t) - 1)) * (1 + 0.25 * (f.p - 1));
  const hp = k.hp * scale;
  run.mobs.push({ id: run.nextId++, lair: f.id, region, s: 0, hp, max: hp, speed: k.speed, armour: k.armour || 0, shield: !!k.shield, flies: !!k.flies, dmg: k.dmg, gold: k.gold, burn: null, soak: 0, slow: null, freeze: 0, brittle: false });
}
function hitMob(run, m, orb, mult) {
  if (m.hp <= 0) return;
  const e = EFFECTS[orb.el];
  let d = e.dmg * mult * (1 + 0.5 * (orb.power - 1));
  const shielded = e.fiery && m.shield;
  if (shielded) { d = 0; run.fx.push({ type: 'blocked', x: m.x, y: m.y, ttl: 0.5 }); }
  if (e.zap && m.soak > 0) d *= 2;
  if (m.brittle && d > 0) { d *= 2; m.brittle = false; }
  if (m.armour && !e.pierce && d > 0) d = Math.max(0.5, d - m.armour);
  m.hp -= d;
  if (e.crack) m.armour = 0;
  if (e.soak) { m.soak = e.soak; m.shield = false; m.burn = null; }
  if (e.unshield) m.shield = false;
  if (e.burn && !shielded) m.burn = { dps: e.burn[0], t: e.burn[1] };
  if (e.slow) m.slow = { f: e.slow[0], t: e.slow[1] };
  if (e.freeze) m.freeze = e.freeze;
  if (e.brittle) m.brittle = true;
  if (e.knock) m.s = Math.max(0, m.s - e.knock);
}
function hitArea(run, x, y, r, orb, mult, groundOnly = false) {
  for (const m of run.mobs) if (!(groundOnly && m.flies) && (m.x - x) ** 2 + (m.y - y) ** 2 <= r * r) hitMob(run, m, orb, mult);
}
function hitOne(run, m, orb, mult) { // single-target hits still splash for eruption/quagmire
  const sp = EFFECTS[orb.el].splash;
  if (sp) { hitArea(run, m.x, m.y, sp, orb, mult); run.fx.push({ type: 'ring', x: m.x, y: m.y, r: sp, el: orb.el, ttl: 0.4 }); } else hitMob(run, m, orb, mult);
}
const orbDamage = (orb) => EFFECTS[orb.el].dmg * (1 + 0.5 * (orb.power - 1));
function hitLair(run, f, dmg, ev) {
  const st = run.lairs[f.id];
  if (st.dead) return;
  st.hp -= dmg;
  if (st.hp <= 0) {
    st.dead = true; run.destroyed++; run.gold += TUNING.lairBounty * f.p;
    ev.push({ type: 'lair', id: f.id, final: !!f.final });
    if (f.final) run.won = true;
  }
}
function distToSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
function fireTower(run, bd, ev) {
  const T = BUILD[bd.type], cx = bd.x + 0.5, cy = bd.y + 0.5;
  if (bd.type === 'trap') {
    if (!run.mobs.some((m) => !m.flies && Math.hypot(m.x - cx, m.y - cy) <= T.range)) return false;
    const orb = bd.mag.shift();
    hitArea(run, cx, cy, T.radius, orb, T.mult, true);
    run.fx.push({ type: 'ring', x: cx, y: cy, r: T.radius, el: orb.el, ttl: 0.4 });
    return true;
  }
  let best = null, bestProg = -1;
  for (const m of run.mobs) {
    const dd = Math.hypot(m.x - cx, m.y - cy);
    if (dd > T.range || dd < (T.min || 0)) continue;
    const prog = m.s / ROADS.paths[m.lair].length; // aim at whoever is closest to the Keep
    if (prog > bestProg) { bestProg = prog; best = m; }
  }
  if (!best) { // nothing walking: shell a lair in range
    const lair = FEATURES.find((f) => f.type === 'lair' && lairAwake(run, f) && Math.hypot(f.x + 0.5 - cx, f.y + 0.5 - cy) <= T.range);
    if (!lair) return false;
    const orb = bd.mag.shift();
    hitLair(run, lair, orbDamage(orb) * T.mult, ev);
    run.fx.push({ type: 'line', x: cx, y: cy, x2: lair.x + 0.5, y2: lair.y + 0.5, el: orb.el, ttl: 0.25 });
    return true;
  }
  const orb = bd.mag.shift();
  const ang = Math.atan2(best.y - cy, best.x - cx), ux = Math.cos(ang), uy = Math.sin(ang);
  switch (bd.type) {
    case 'bolt': run.shots.push({ kind: 'bolt', x: cx, y: cy, target: best.id, orb, mult: T.mult, speed: 9 }); break;
    case 'lance': run.shots.push({ kind: 'lance', x: cx, y: cy, ux, uy, left: T.range + 0.5, hit: [], orb, mult: T.mult, speed: 10 }); break;
    case 'mortar': run.shots.push({ kind: 'mortar', x0: cx, y0: cy, x: cx, y: cy, tx: best.x, ty: best.y, t: 0, dur: 0.9, orb, mult: T.mult, r: T.radius }); break;
    case 'beam': {
      const x2 = cx + ux * T.range, y2 = cy + uy * T.range;
      for (const m of run.mobs) if (distToSeg(m.x, m.y, cx, cy, x2, y2) < 0.45) hitMob(run, m, orb, T.mult);
      run.fx.push({ type: 'beam', x: cx, y: cy, x2, y2, el: orb.el, ttl: 0.25 });
      break;
    }
    case 'spray':
      for (const m of run.mobs) {
        const dd = Math.hypot(m.x - cx, m.y - cy); let da = Math.abs(Math.atan2(m.y - cy, m.x - cx) - ang); if (da > Math.PI) da = 2 * Math.PI - da;
        if (dd <= T.range && da <= T.cone) hitMob(run, m, orb, T.mult);
      }
      run.fx.push({ type: 'cone', x: cx, y: cy, a: ang, r: T.range, cone: T.cone, el: orb.el, ttl: 0.3 });
      break;
  }
  return true;
}
function stepShots(run, dt) {
  const byId = new Map(run.mobs.map((m) => [m.id, m]));
  run.shots = run.shots.filter((s) => {
    if (s.kind === 'bolt') {
      const m = byId.get(s.target);
      if (!m || m.hp <= 0) return false;
      const dx = m.x - s.x, dy = m.y - s.y, dd = Math.hypot(dx, dy), step = s.speed * dt;
      if (dd <= step + 0.2) { hitOne(run, m, s.orb, s.mult); return false; }
      s.x += dx / dd * step; s.y += dy / dd * step; return true;
    }
    if (s.kind === 'lance') {
      const step = s.speed * dt; s.x += s.ux * step; s.y += s.uy * step; s.left -= step;
      for (const m of run.mobs) if (!s.hit.includes(m.id) && Math.hypot(m.x - s.x, m.y - s.y) < 0.45) { s.hit.push(m.id); hitOne(run, m, s.orb, s.mult); }
      return s.left > 0;
    }
    if (s.kind === 'mortar') {
      s.t += dt; const k = Math.min(1, s.t / s.dur);
      s.x = s.x0 + (s.tx - s.x0) * k; s.y = s.y0 + (s.ty - s.y0) * k; s.h = Math.sin(Math.PI * k);
      if (k >= 1) { hitArea(run, s.tx, s.ty, s.r + (EFFECTS[s.orb.el].splash || 0) * 0.5, s.orb, s.mult); run.fx.push({ type: 'ring', x: s.tx, y: s.ty, r: s.r, el: s.orb.el, ttl: 0.45 }); return false; }
      return true;
    }
    return false;
  });
}

// Advance the run by dt seconds (call with small dt, ≤ 0.1). Returns events for the page.
function tick(run, meta, dt) {
  if (run.over) return [];
  const ev = [];
  run.t += dt;
  // nightfall: every so often the dark stirs the nearest sleeping lair, lit or not
  if (run.t >= run.nextStir) {
    run.nextStir += TUNING.stirEvery;
    const asleep = FEATURES.filter((f) => f.type === 'lair' && !lairAwake(run, f) && !run.lairs[f.id].dead && (!isVeiled(f.x, f.y) || run.skyOpen))
      .sort((a, b) => ringOf(a.x, a.y) - ringOf(b.x, b.y) || ((FRONTS.indexOf(regionOf(a.x, a.y)) - run.stirs + 8) % 4) - ((FRONTS.indexOf(regionOf(b.x, b.y)) - run.stirs + 8) % 4));
    if (asleep.length) { run.lairs[asleep[0].id].stirred = true; run.stirs++; ev.push({ type: 'stir', id: asleep[0].id }); }
  }
  // economy
  run.gold += TUNING.goldPerSec * dt;
  for (const bd of run.b.values()) {
    if (bd.type === 'extractor' && run.veins[bd.vein] > 0) {
      const got = Math.min(run.veins[bd.vein], TUNING.mineRate * dt), el = FEATURE_BY_ID[bd.vein].el;
      run.veins[bd.vein] -= got; run.wallet[el] = (run.wallet[el] || 0) + got;
      if (run.veins[bd.vein] <= 1e-6) { run.veins[bd.vein] = 0; ev.push({ type: 'depleted', id: bd.vein }); }
    }
    if (bd.type === 'source') {
      if (bd.dormant > 0) bd.dormant -= dt;
      else if (!bd.ready) { bd.timer -= dt; if (bd.timer <= 0) bd.ready = true; }
    }
  }
  run.beatClock += dt;
  while (run.beatClock >= TUNING.beat) { run.beatClock -= TUNING.beat; beltStep(run, meta); }
  // lairs send foes
  for (const f of FEATURES) {
    if (f.type !== 'lair' || !lairAwake(run, f)) continue;
    const st = run.lairs[f.id];
    st.clock -= dt;
    if (st.clock <= 0 && run.mobs.length < 250) { spawnMob(run, f); st.clock = MOBS[regionOf(f.x, f.y)].every / (Math.sqrt(f.p) * nightfall(run.t)); }
  }
  // foes walk; solid buildings on the road stop them until broken
  for (const m of run.mobs) {
    const path = ROADS.paths[m.lair], len = path.length - 1;
    if (m.burn) { m.hp -= m.burn.dps * dt; m.burn.t -= dt; if (m.burn.t <= 0) m.burn = null; }
    if (m.soak > 0) m.soak -= dt;
    if (m.slow) { m.slow.t -= dt; if (m.slow.t <= 0) m.slow = null; }
    let speed = m.speed * (m.slow ? m.slow.f : 1);
    if (m.freeze > 0) { m.freeze -= dt; speed = 0; }
    const next = Math.floor(m.s) + 1;
    const blocker = !m.flies && next <= len && run.b.get(idx(path[next][0], path[next][1]));
    if (blocker && BUILD[blocker.type].solid && m.s + speed * dt > next - 0.6) {
      m.s = Math.max(m.s, Math.min(m.s + speed * dt, next - 0.6));
      blocker.hp -= m.dmg * 0.5 * dt; m.attacking = true;
      if (blocker.hp <= 0) { dropBuilding(run, meta, blocker); ev.push({ type: 'broken', what: blocker.type }); }
    } else { m.s += speed * dt; m.attacking = false; }
    [m.x, m.y] = mobPos(m);
    if (m.s >= len - 0.4 && m.hp > 0) { run.hp -= m.dmg; m.hp = -999; m.leaked = true; run.fx.push({ type: 'hurt', x: m.x, y: m.y, ttl: 0.5 }); }
  }
  // towers
  for (const bd of run.b.values()) {
    if (!isTowerish(bd)) continue;
    bd.cd -= dt;
    if (bd.cd <= 0 && bd.mag.length && fireTower(run, bd, ev)) bd.cd = BUILD[bd.type].cd;
  }
  // the Keep's own bolt
  run.keepCd -= dt;
  if (run.keepCd <= 0) {
    const k = TUNING.keepGun, m = run.mobs.find((q) => q.hp > 0 && Math.hypot(q.x - MAP_C - 0.5, q.y - MAP_C - 0.5) <= k.range);
    if (m) { m.hp -= k.dmg; run.keepCd = k.cd; run.fx.push({ type: 'line', x: MAP_C + 0.5, y: MAP_C + 0.5, x2: m.x, y2: m.y, el: null, ttl: 0.15 }); }
  }
  stepShots(run, dt);
  // the fallen
  run.mobs = run.mobs.filter((m) => {
    if (m.hp > 0) return true;
    if (!m.leaked) { run.gold += m.gold; run.kills++; run.fx.push({ type: 'pop', x: m.x, y: m.y, ttl: 0.35 }); }
    return false;
  });
  for (const f of run.fx) f.ttl -= dt;
  run.fx = run.fx.filter((f) => f.ttl > 0);
  if (run.hp <= 0) { run.hp = 0; run.over = true; ev.push({ type: 'fallen' }); }
  return ev;
}

// Echoes for a finished run; also banks them and counts the run.
function endRun(run, meta) {
  const parts = {
    explored: Math.floor(run.maxLit / 10), lairs: 6 * run.destroyed, foes: Math.floor(run.kills / 10),
    secrets: 2 * run.touched.filter((id) => !PERMANENT.has(FEATURE_BY_ID[id].type)).length + 10 * run.newFound.length,
    survived: Math.floor(run.t / 20),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  meta.echoes += total; meta.runs++; meta.best = Math.max(meta.best, Math.floor(run.t));
  run.over = true;
  return { parts, total };
}

if (typeof module !== 'undefined') module.exports = {
  MAP_N, MAP_C, REGIONS, FRONTS, ORBS, RECIPES, TUNING, EFFECTS, MOBS, BUILD, TOWERS, DIRS, ARROWS, FEATURES, FEATURE_BY_ID, ROADS, SHOP, PERMANENT,
  idx, inMap, noise, regionOf, ringOf, isKeep, isVeiled, isRoad, featureAt, orbParts, recipeKey,
  newMeta, has, relic, recipeKnown, towerKnown, seals, upg, shopCost, buyUpgrade,
  newRun, lightRadius, computeLit, isLit, isSeen, beaconCost, buildCost, veinOpen, canPlace, place, removeAt, rotateAt,
  feedGate, openSky, take, claimAncient, mergeResult, merge, sourcePrice, sourceRate, buySource, sellSource,
  feeders, mixerJammed, beltStep, nightfall, lairAwake, mobPos, hitMob, tick, endRun,
};
