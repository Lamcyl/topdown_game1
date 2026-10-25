// One-turn demo games: pure logic (no DOM), shared by the page and the solver script.
// Each game: items, starting satchel, encounters, setupState(enc, placements), canPlace(...), sim(...) -> { frames, win, reason }.
/* eslint-disable no-unused-vars */
const DIR4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIR8 = [...DIR4, [-1, -1], [-1, 1], [1, -1], [1, 1]];
const ARROW = { '↑': [-1, 0], '→': [0, 1], '↓': [1, 0], '←': [0, -1] };
const clone = (o) => JSON.parse(JSON.stringify(o));
const sgn = Math.sign;

// ======================================================================== SPARK
const SPARK_UNITS = {
  goblin: { icon: '👺', name: 'Goblin', hp: 1 },
  ogre: { icon: '👹', name: 'Ogre', hp: 3 },
  cultist: { icon: '🧟', name: 'Cultist', hp: 2 },
  chief: { icon: '🧌', name: 'Ogre Chieftain', hp: 5 },
  prisoner: { icon: '🧑', name: 'Prisoner', hp: 1, ally: true },
};
const SPARK_LEGEND = {
  '.': ['floor'], '"': ['hay'], '~': ['water'], '#': ['wall'], B: ['floor', 'barrel'], P: ['floor', 'pillar'], M: ['floor', 'metal'],
  g: ['floor', null, 'goblin'], h: ['hay', null, 'goblin'], O: ['floor', null, 'ogre'], c: ['floor', null, 'cultist'], w: ['water', null, 'cultist'],
  x: ['water', null, 'prisoner'], X: ['floor', null, 'prisoner'], K: ['floor', null, 'chief'],
};
const Spark = {
  key: 'spark', title: 'Spark', R: 6, C: 6, frameMs: 420,
  tagline: 'Set up the room, then light one spark. Everything that burns, falls or conducts goes off in a chain.',
  items: {
    spark: { name: 'Spark Stone', icon: '✴️', info: 'Lights its tile when you Unleash. Fire spreads to touching hay, oil and barrels.' },
    oil: { name: 'Oil Flask', icon: '🫗', info: 'Turns a tile into oil: it catches fire and burns harder (2 damage).' },
    gust: { name: 'Gust Charm', icon: '🌀', dirs: ['↑', '→', '↓', '←'], info: 'Blows in a direction when you Unleash. Topples the first pillar, rolls a barrel, or shoves a creature.' },
    rod: { name: 'Lightning Rod', icon: '⚡', info: 'Calls lightning. It runs through touching water and metal: 2 damage to anyone in the water or next to the metal, and it sets off barrels by the metal.' },
    frost: { name: 'Frost Shard', icon: '❄️', info: 'Freezes a tile, even one with a creature on it. Frozen things can’t burn, be hurt or conduct.' },
  },
  satchel: { spark: 2, gust: 2, rod: 1, oil: 2, frost: 1 },
  anchored: ['frost'],
  encounters: [
    { name: 'Goblin Camp', goal: 'Kill every goblin and the ogre.', reward: ['oil', 'rod', 'frost'],
      map: ['.h""..', '."B"h.', '.."..P', '.."..O', 'P.....', '......'] },
    { name: 'The Drowned Shrine', goal: 'Kill the three cultists. The prisoner must survive.', reward: ['spark', 'oil', 'gust'],
      map: ['......', '.w~~w.', '.~x~..', '.~~~MB', '....c.', '......'] },
    { name: 'Chieftain’s Hall', goal: 'Kill the Ogre Chieftain (5 HP) and his two guards.', reward: [],
      map: ['......', '..P...', '..KB.h', '..".""', 'h""...', '......'] },
  ],
  setupState(enc, placements) {
    const cells = enc.map.map((row) => [...row].map((ch) => {
      const [t, obj, u] = SPARK_LEGEND[ch];
      return { t, obj: obj || null, unit: u ? { type: u, hp: SPARK_UNITS[u].hp } : null, fire: false, burnt: false, frozen: false, item: null, fx: null };
    }));
    for (const p of placements) {
      const x = cells[p.r][p.c]; x.item = { k: p.k, dir: p.dir };
      if (p.k === 'oil') x.t = 'oil';
      if (p.k === 'frost') x.frozen = true;
    }
    return { cells };
  },
  canPlace(enc, placements, k, r, c) {
    const x = this.setupState(enc, placements).cells[r][c];
    if (x.item) return 'Something is already placed there.';
    if (x.t === 'wall') return 'Nothing can go on a wall.';
    if (k === 'frost') return true;
    if (x.unit || x.obj) return 'Place it on an empty tile.';
    if (x.t === 'water') return 'That can’t go in water.';
    return true;
  },
  describe(enc, placements, r, c) {
    const x = this.setupState(enc, placements).cells[r][c];
    if (x.unit) return `${SPARK_UNITS[x.unit.type].name}: ${x.unit.hp} HP.${SPARK_UNITS[x.unit.type].ally ? ' Keep them alive.' : ''}`;
    return { barrel: 'Barrel: explodes when lit, 2 damage to the 3×3 around it. Lights and topples things nearby.', pillar: 'Pillar: falls 2 tiles when toppled, crushing for 3.', metal: 'Iron chains: carry lightning to everything touching them.' }[x.obj]
      || { hay: 'Hay: burns (1 damage) and spreads fire.', water: 'Water: stops fire, carries lightning.', oil: 'Oil: burns for 2.' }[x.t] || 'Empty floor.';
  },
  sim(enc, placements) {
    const st = this.setupState(enc, placements), frames = [];
    let log = [], next = [], topples = [];
    const cell = (r, c) => (r >= 0 && r < 6 && c >= 0 && c < 6 ? st.cells[r][c] : null);
    const hurt = (x, n, why) => {
      if (!x || !x.unit || x.unit.hp <= 0) return;
      if (x.frozen) { x.fx = 'hit'; return; }
      x.unit.hp = Math.max(0, x.unit.hp - n); x.fx = 'hit';
      if (x.unit.hp <= 0) log.push(`${SPARK_UNITS[x.unit.type].name} ${why}.`);
    };
    const flammable = (x) => x && !x.frozen && !x.fire && !x.burnt && (x.obj === 'barrel' || x.t === 'hay' || x.t === 'oil');
    const snap = () => { frames.push({ st: clone(st), log: log.join(' ') }); log = []; for (const row of st.cells) for (const x of row) x.fx = null; };
    const topple = (r, c, dr, dc, later) => {
      const x = cell(r, c); if (!x || x.obj !== 'pillar') return;
      x.obj = 'rubble'; log.push('A pillar topples!');
      for (let k = 1; k <= 2; k++) {
        const y = cell(r + dr * k, c + dc * k); if (!y || y.t === 'wall') break;
        y.fx = 'crush'; hurt(y, 3, 'is crushed');
        if (y.obj === 'barrel' && !y.frozen) next.push([r + dr * k, c + dc * k]);
        if (y.obj === 'pillar') { later.push([r + dr * k, c + dc * k, dr, dc]); break; }
      }
    };
    const ignite = (r, c, fromSpark) => {
      const x = cell(r, c); if (!x || x.frozen) return;
      if (x.obj === 'barrel') {
        x.obj = null; log.push('A barrel explodes!');
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const y = cell(r + dr, c + dc); if (!y) continue;
          y.fx = 'boom'; hurt(y, 2, 'is caught in the blast');
          if (dr || dc) { if (flammable(y)) next.push([r + dr, c + dc]); if (y.obj === 'pillar' && !y.frozen) topples.push([r + dr, c + dc, dr, dc]); }
        }
        return;
      }
      if (x.fire || x.burnt) return;
      if (x.t === 'hay' || x.t === 'oil') { x.fire = true; hurt(x, x.t === 'oil' ? 2 : 1, 'burns'); }
      else if (fromSpark) x.fire = true;
      else return;
      for (const [dr, dc] of DIR4) if (flammable(cell(r + dr, c + dc))) next.push([r + dr, c + dc]);
    };
    snap();
    // t0: gusts, then lightning, then sparks
    const now = [];
    for (const p of placements.filter((p) => p.k === 'gust')) {
      const [dr, dc] = ARROW[p.dir]; st.cells[p.r][p.c].item = null; log.push('The gust blows!');
      for (let k = 1; k <= 4; k++) {
        const r = p.r + dr * k, c = p.c + dc * k, y = cell(r, c);
        if (!y || y.t === 'wall' || y.obj === 'metal') break;
        if (y.obj === 'pillar') { if (!y.frozen) topple(r, c, dr, dc, topples); break; }
        if (y.obj === 'barrel') {
          let cr = r, cc = c;
          for (;;) { const z = cell(cr + dr, cc + dc); if (!z || z.t === 'wall' || z.obj || (z.unit && z.unit.hp > 0) || z.t === 'water') break; z.obj = 'barrel'; cell(cr, cc).obj = null; cr += dr; cc += dc; }
          if (cr !== r || cc !== c) log.push('A barrel rolls.');
          break;
        }
        if (y.unit && y.unit.hp > 0) {
          if (y.frozen) break;
          const z = cell(r + dr, c + dc);
          if (!z || z.t === 'wall' || z.obj || (z.unit && z.unit.hp > 0)) { hurt(y, 1, 'is slammed into something'); if (z && z.unit) hurt(z, 1, 'is slammed'); }
          else { z.unit = y.unit; y.unit = null; z.fx = 'hit'; log.push(`${SPARK_UNITS[z.unit.type].name} is shoved.`); }
          break;
        }
      }
    }
    for (const p of placements.filter((p) => p.k === 'rod')) {
      st.cells[p.r][p.c].item = null;
      const key = (r, c) => r * 6 + c, seen = new Set([key(p.r, p.c)]), q = [[p.r, p.c]], hit = [];
      while (q.length) {
        const [r, c] = q.pop();
        for (const [dr, dc] of DIR4) {
          const y = cell(r + dr, c + dc);
          if (!y || seen.has(key(r + dr, c + dc))) continue;
          if ((y.t === 'water' && !y.frozen) || y.obj === 'metal') { seen.add(key(r + dr, c + dc)); q.push([r + dr, c + dc]); hit.push([r + dr, c + dc]); }
        }
      }
      log.push(hit.length ? 'Lightning strikes the rod and races through the water and iron!' : 'Lightning strikes the rod, but nothing carries it.');
      for (const [r, c] of hit) {
        const y = cell(r, c); y.fx = 'zap';
        if (y.t === 'water') hurt(y, 2, 'is electrocuted');
        if (y.obj === 'metal') for (const [dr, dc] of DIR4) { const z = cell(r + dr, c + dc); if (!z) continue; hurt(z, 2, 'is shocked'); if (z.obj === 'barrel' && !z.frozen) next.push([r + dr, c + dc]); }
      }
    }
    for (const p of placements.filter((p) => p.k === 'spark')) now.push([p.r, p.c]);
    for (const [r, c] of now) { st.cells[r][c].item = null; ignite(r, c, true); }
    for (const t of topples.splice(0)) topple(...t, topples);
    if (now.length) log.unshift('Spark!');
    snap();
    for (let step = 0; step < 40 && (next.length || topples.length); step++) {
      for (const row of st.cells) for (const x of row) if (x.fire) { x.fire = false; x.burnt = true; if (x.t === 'hay' || x.t === 'oil') x.t = 'ash'; }
      const cur = next, tp = topples; next = []; topples = [];
      for (const [r, c] of cur) ignite(r, c, false);
      const later = [];
      for (const t of tp) topple(...t, later);
      topples.push(...later);
      snap();
    }
    for (const row of st.cells) for (const x of row) if (x.fire) { x.fire = false; x.burnt = true; if (x.t === 'hay' || x.t === 'oil') x.t = 'ash'; }
    frames.push({ st: clone(st), log: 'The smoke clears.' });
    const units = st.cells.flat().filter((x) => x.unit).map((x) => x.unit);
    const foes = units.filter((u) => !SPARK_UNITS[u.type].ally && u.hp > 0);
    const allyDead = units.some((u) => SPARK_UNITS[u.type].ally && u.hp <= 0);
    const win = !foes.length && !allyDead;
    const reason = allyDead ? 'The prisoner died.' : foes.length ? `${foes.length} enem${foes.length > 1 ? 'ies' : 'y'} survived: ${foes.map((u) => SPARK_UNITS[u.type].name).join(', ')}.` : 'Every enemy is down.';
    return { frames, win, reason };
  },
};

// ======================================================================== AMBUSH
const AMBUSH_UNITS = {
  goblin: { icon: '👺', name: 'Goblin', hp: 2, spd: 1 },
  orc: { icon: '👹', name: 'Orc', hp: 3, spd: 1 },
  wolf: { icon: '🐺', name: 'Wolf', hp: 2, spd: 2 },
  troll: { icon: '🧌', name: 'Troll', hp: 4, spd: 1, smash: true },
  shaman: { icon: '🧙‍♂️', name: 'Shaman', hp: 2, spd: 1, heal: true },
};
const Ambush = {
  key: 'ambush', title: 'Ambush', R: 8, C: 6, frameMs: 380,
  tagline: 'A war party marches on the village along the marked road. Lay your traps, then let them march.',
  items: {
    bear: { name: 'Bear Trap', icon: '🪤', info: 'On the road. Holds the first enemy for 3 steps (a troll for 1). Everyone behind it has to wait.' },
    glyph: { name: 'Fire Glyph', icon: '🔥', info: 'On the road. Bursts when stepped on: 2 damage to that tile and the 4 touching it. One use.' },
    spikes: { name: 'Spikes', icon: '🗡️', info: 'On the road. 1 damage to every enemy that steps on it.' },
    totem: { name: 'Arrow Totem', icon: '🏹', info: 'Beside the road. Every other step it shoots the most advanced enemy on the 8 tiles around it for 1.' },
    wall: { name: 'Thorn Wall', icon: '🌵', info: 'On the road. Blocks it until smashed (2 hits; a troll breaks it at once).' },
  },
  satchel: { bear: 2, glyph: 2, spikes: 2, totem: 2, wall: 1 },
  anchored: ['wall'],
  encounters: [
    { name: 'Goblin Raiders', goal: 'Stop the orc and three goblins before they reach the village 🏠.', reward: ['glyph', 'totem', 'spikes'],
      map: ['#.####', '#..#.#', '......', '......', '#.....', '..#...', '......', '##..##'],
      path: [[0, 1], [1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3]],
      enemies: [{ type: 'orc', start: 0 }, { type: 'goblin', start: 1 }, { type: 'goblin', start: 2 }, { type: 'goblin', start: 3 }] },
    { name: 'Wolf Pack', goal: 'Three wolves (2 tiles a step) run ahead of a troll. Stop them all.', reward: ['spikes', 'totem', 'glyph'],
      map: ['####.#', '.....#', '......', '.#....', '.....#', '......', '#.....', '##.###'],
      path: [[0, 4], [1, 4], [2, 4], [2, 3], [2, 2], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [6, 2], [7, 2]],
      enemies: [{ type: 'wolf', start: 0 }, { type: 'wolf', start: 1 }, { type: 'wolf', start: 2 }, { type: 'troll', start: 3 }] },
    { name: 'Shaman’s Warband', goal: 'The shaman heals everyone beside it each step. Break the warband.', reward: [],
      map: ['##.###', '......', '......', '......', '#.....', '......', '......', '###.##'],
      path: [[0, 2], [1, 2], [2, 2], [3, 2], [3, 3], [3, 4], [4, 4], [5, 4], [5, 3], [6, 3], [7, 3]],
      enemies: [{ type: 'orc', start: 0 }, { type: 'shaman', start: 1 }, { type: 'orc', start: 2 }, { type: 'goblin', start: 3 }] },
  ],
  pathIndex(enc, r, c) { return enc.path.findIndex(([pr, pc]) => pr === r && pc === c); },
  setupState(enc, placements) {
    const cells = enc.map.map((row, r) => [...row].map((ch, c) => ({ t: ch === '#' ? 'rock' : 'grass', path: this.pathIndex(enc, r, c), item: null, fx: null })));
    for (const p of placements) cells[p.r][p.c].item = { k: p.k, hp: p.k === 'wall' ? 2 : undefined, spent: false };
    const foes = enc.enemies.map((e, i) => ({ id: i, type: e.type, start: e.start, hp: AMBUSH_UNITS[e.type].hp, idx: -1, held: 0 }));
    return { cells, foes, tick: 0 };
  },
  canPlace(enc, placements, k, r, c) {
    const x = this.setupState(enc, placements).cells[r][c];
    if (x.item) return 'Something is already placed there.';
    if (x.t === 'rock') return 'Rocks can’t hold anything.';
    const onRoad = x.path > 0 && x.path < enc.path.length - 1;
    if (k === 'totem') return x.path < 0 ? true : 'The totem goes beside the road, not on it.';
    return onRoad ? true : 'This goes on the road (not the first tile or the village).';
  },
  describe(enc, placements, r, c) {
    const x = this.setupState(enc, placements).cells[r][c];
    if (x.path === enc.path.length - 1) return 'The village. If any enemy reaches it, you fail.';
    if (x.path === 0) return 'Where the war party enters, in the order shown above.';
    return x.path > 0 ? 'The road. Enemies march along it one tile per step (wolves two).' : x.t === 'rock' ? 'Rock.' : 'Grass beside the road.';
  },
  sim(enc, placements) {
    const st = this.setupState(enc, placements), frames = [], P = enc.path, last = P.length - 1;
    let log = [];
    const at = (i) => st.foes.find((f) => f.hp > 0 && f.idx === i);
    const cellOf = (i) => st.cells[P[i][0]][P[i][1]];
    const snap = () => { frames.push({ st: clone(st), log: log.join(' ') }); log = []; for (const row of st.cells) for (const x of row) x.fx = null; };
    const hurt = (f, n, why) => { if (!f || f.hp <= 0) return; f.hp = Math.max(0, f.hp - n); if (f.idx >= 0) cellOf(f.idx).fx = 'hit'; if (f.hp <= 0) log.push(`${AMBUSH_UNITS[f.type].name} ${why}.`); };
    snap();
    let lost = null;
    for (let tick = 0; tick < 80 && !lost; tick++) {
      st.tick = tick;
      for (const f of st.foes) {
        if (f.hp <= 0 || tick < f.start || lost) continue;
        if (f.held > 0) { f.held--; continue; }
        for (let s = 0; s < AMBUSH_UNITS[f.type].spd; s++) {
          const ni = f.idx + 1, x = cellOf(ni);
          if (at(ni)) break;
          if (x.item && x.item.k === 'wall' && !x.item.spent) {
            x.fx = 'hit';
            if (AMBUSH_UNITS[f.type].smash) { x.item.spent = true; log.push('The troll smashes the thorn wall!'); }
            else if (--x.item.hp <= 0) { x.item.spent = true; log.push('The thorn wall is torn down.'); }
            break;
          }
          f.idx = ni;
          if (ni === last) { lost = `${AMBUSH_UNITS[f.type].name} reached the village.`; break; }
          const it = x.item;
          if (it && !it.spent) {
            if (it.k === 'bear') { it.spent = true; f.held = AMBUSH_UNITS[f.type].smash ? 1 : 3; x.fx = 'hit'; log.push(`The bear trap snaps shut on the ${AMBUSH_UNITS[f.type].name}!`); break; }
            if (it.k === 'glyph') {
              it.spent = true; log.push('The fire glyph bursts!');
              const [r, c] = P[ni];
              for (const [dr, dc] of [[0, 0], ...DIR4]) {
                const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 5) continue;
                st.cells[rr][cc].fx = 'boom';
                for (const g of st.foes) if (g.hp > 0 && g.idx >= 0 && P[g.idx][0] === rr && P[g.idx][1] === cc) hurt(g, 2, 'burns');
              }
            }
            if (it.k === 'spikes') hurt(f, 1, 'is impaled');
          }
          if (f.hp <= 0) break;
        }
      }
      if (lost) { log.push(lost); snap(); break; }
      st.cells.forEach((row, r) => row.forEach((x, c) => {
        if (!x.item || x.item.k !== 'totem' || tick % 2 === 1) return;
        const inRange = st.foes.filter((f) => f.hp > 0 && f.idx >= 0 && Math.max(Math.abs(P[f.idx][0] - r), Math.abs(P[f.idx][1] - c)) <= 1);
        if (inRange.length) { inRange.sort((a, b) => b.idx - a.idx); hurt(inRange[0], 1, 'is shot down'); }
      }));
      for (const s of st.foes.filter((f) => f.hp > 0 && f.idx >= 0 && AMBUSH_UNITS[f.type].heal)) {
        for (const g of st.foes) if (g !== s && g.hp > 0 && g.idx >= 0 && g.hp < AMBUSH_UNITS[g.type].hp && Math.max(Math.abs(P[g.idx][0] - P[s.idx][0]), Math.abs(P[g.idx][1] - P[s.idx][1])) <= 1) g.hp++;
      }
      snap();
      if (st.foes.every((f) => f.hp <= 0)) break;
    }
    const alive = st.foes.filter((f) => f.hp > 0);
    const win = !lost && !alive.length;
    return { frames, win, reason: lost || (alive.length ? 'The war party is still coming.' : 'The war party is broken.') };
  },
};

// ======================================================================== VANGUARD
const VG_UNITS = {
  shield: { icon: '🛡️', name: 'Shieldbearer', hp: 6, atk: 1, rng: 1, taunt: true, info: '6 HP. Enemies within 2 tiles must attack it.' },
  pyro: { icon: '🧙', name: 'Pyromancer', hp: 2, atk: 2, rng: 3, splash: true, info: '2 HP. Fires 3 tiles for 2, plus 1 to enemies touching the target.' },
  thief: { icon: '🥷', name: 'Thief', hp: 3, atk: 2, rng: 1, leap: true, info: '3 HP. Leaps behind the enemy back line at the start.' },
  cleric: { icon: '😇', name: 'Cleric', hp: 3, atk: 0, rng: 2, heal: 2, info: '3 HP. Heals the most hurt ally within 2 tiles for 2. Never attacks.' },
  golem: { icon: '🗿', name: 'Golem', hp: 8, atk: 2, rng: 1, slow: true, info: '8 HP. Hits for 2, but acts only every other step.' },
  spear: { icon: '👺', name: 'Goblin Spear', hp: 3, atk: 1, rng: 1, foe: true },
  brute: { icon: '👹', name: 'Orc Brute', hp: 6, atk: 3, rng: 1, foe: true },
  archer: { icon: '🎯', name: 'Goblin Archer', hp: 2, atk: 2, rng: 3, foe: true },
  bomber: { icon: '💣', name: 'Bomber', hp: 1, atk: 0, rng: 1, bomb: true, foe: true },
  warlock: { icon: '🔮', name: 'Warlock', hp: 8, atk: 3, rng: 3, foe: true },
};
const Vanguard = {
  key: 'vanguard', title: 'Vanguard', R: 6, C: 6, frameMs: 330, deploy: 3,
  tagline: 'Deploy up to 3 of your company and give them gear. Then the battle plays out on its own. The fallen stay dead.',
  items: {
    shield: { ...VG_UNITS.shield, unit: true },
    pyro: { ...VG_UNITS.pyro, unit: true },
    thief: { ...VG_UNITS.thief, unit: true },
    cleric: { ...VG_UNITS.cleric, unit: true },
    golem: { ...VG_UNITS.golem, unit: true },
    thorns: { name: 'Thorn Mail', icon: '🌵', attach: true, info: 'Gear. Anyone who hits the wearer in melee takes 1 back.' },
    haste: { name: 'Haste Feather', icon: '🪶', attach: true, info: 'Gear. The wearer acts twice every step.' },
    lantern: { name: 'Soul Lantern', icon: '🏮', attach: true, info: 'Gear. The wearer comes back once with 2 HP.' },
  },
  satchel: { shield: 1, pyro: 1, thief: 1, cleric: 1, golem: 1, thorns: 1, haste: 1, lantern: 1 },
  anchored: ['golem'],
  encounters: [
    { name: 'Goblin Skirmishers', goal: 'Defeat every enemy. Bombers explode on everything around them.', reward: ['haste', 'lantern', 'thorns'],
      foes: [['spear', 2, 1], ['spear', 2, 4], ['archer', 0, 1], ['archer', 0, 4], ['bomber', 1, 2]] },
    { name: 'Orc Shield Wall', goal: 'Defeat every enemy. The brutes hit hard; the archers hang back.', reward: ['shield', 'cleric', 'pyro'],
      foes: [['brute', 2, 1], ['brute', 2, 4], ['spear', 2, 2], ['archer', 0, 1], ['archer', 0, 4]] },
    { name: 'The Warlock’s Guard', goal: 'Defeat every enemy, including the Warlock (8 HP) at the back.', reward: [],
      foes: [['warlock', 0, 3], ['brute', 2, 1], ['brute', 2, 4], ['archer', 0, 1], ['bomber', 2, 2], ['bomber', 1, 4]] },
  ],
  setupState(enc, placements) {
    const units = enc.foes.map(([type, r, c], i) => ({ id: 'f' + i, type, r, c, hp: VG_UNITS[type].hp, side: 'foe', gear: null }));
    for (const p of placements) {
      if (this.items[p.k].unit) units.push({ id: 'a' + units.length, type: p.k, r: p.r, c: p.c, hp: VG_UNITS[p.k].hp, side: 'ally', gear: null });
    }
    for (const p of placements) if (this.items[p.k].attach) { const u = units.find((u) => u.r === p.r && u.c === p.c && u.side === 'ally'); if (u) u.gear = p.k; }
    return { units, fx: [] };
  },
  canPlace(enc, placements, k, r, c) {
    const st = this.setupState(enc, placements), u = st.units.find((u) => u.r === r && u.c === c);
    if (this.items[k].attach) return u && u.side === 'ally' ? (u.gear ? 'That unit already has gear.' : true) : 'Gear goes on one of your deployed units.';
    if (r < 3) return 'Deploy on your half (the bottom 3 rows).';
    if (u) return 'That tile is taken.';
    if (placements.filter((p) => this.items[p.k].unit).length >= this.deploy) return `You can deploy only ${this.deploy} units per battle.`;
    return true;
  },
  describe(enc, placements, r, c) {
    const u = this.setupState(enc, placements).units.find((u) => u.r === r && u.c === c);
    if (!u) return r < 3 ? 'Enemy ground.' : 'Your half. Pick a unit, then tap here to deploy it.';
    const d = VG_UNITS[u.type];
    return `${d.name}: ${u.hp} HP, hits for ${d.atk} at range ${d.rng}.${d.info ? ' ' + d.info : ''}${d.bomb ? ' Explodes for 2 on everything around it when it reaches you or dies.' : ''}${u.gear ? ` Wearing ${this.items[u.gear].name}.` : ''}`;
  },
  sim(enc, placements) {
    const st = this.setupState(enc, placements), frames = [];
    let log = [];
    const alive = (u) => u.hp > 0;
    const dist = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
    const occ = (r, c) => st.units.find((u) => alive(u) && u.r === r && u.c === c);
    const free = (r, c) => r >= 0 && r < 6 && c >= 0 && c < 6 && !occ(r, c);
    const snap = () => { frames.push({ st: clone(st), log: log.join(' ') }); log = []; st.fx = []; };
    const kill = (u) => {
      if (u.gear === 'lantern' && !u.revived) { u.revived = true; u.hp = 2; log.push(`${VG_UNITS[u.type].name} rises again!`); return; }
      log.push(`${VG_UNITS[u.type].name} falls.`);
      if (VG_UNITS[u.type].bomb) explode(u);
    };
    const hurt = (u, n) => { if (!alive(u) || n <= 0) return; u.hp -= n; st.fx.push([u.r, u.c]); if (u.hp <= 0) kill(u); };
    const explode = (u) => { log.push('BOOM!'); for (const [dr, dc] of DIR8) { const o = occ(u.r + dr, u.c + dc); if (o) hurt(o, 2); st.fx.push([u.r + dr, u.c + dc]); } };
    const act = (u, tick) => {
      const d = VG_UNITS[u.type];
      if (d.slow && tick % 2 === 1) return;
      if (d.heal) {
        const hurtAllies = st.units.filter((o) => alive(o) && o.side === u.side && o !== u && o.hp < VG_UNITS[o.type].hp && dist(o, u) <= d.rng);
        if (hurtAllies.length) { hurtAllies.sort((a, b) => a.hp / VG_UNITS[a.type].hp - b.hp / VG_UNITS[b.type].hp); const t = hurtAllies[0]; t.hp = Math.min(VG_UNITS[t.type].hp, t.hp + d.heal); st.fx.push([t.r, t.c]); return; }
      }
      const foes = st.units.filter((o) => alive(o) && o.side !== u.side);
      if (!foes.length) return;
      if (d.leap && !u.leapt) {
        u.leapt = true;
        const back = u.side === 'ally' ? Math.min(...foes.map((f) => f.r)) : Math.max(...foes.map((f) => f.r));
        for (const f of foes.filter((f) => f.r === back)) {
          const behind = u.side === 'ally' ? -1 : 1;
          const spot = [[f.r + behind, f.c], [f.r, f.c - 1], [f.r, f.c + 1]].find(([r, c]) => free(r, c));
          if (spot) { [u.r, u.c] = spot; log.push('The thief leaps behind their lines!'); break; }
        }
      }
      const taunters = foes.filter((f) => VG_UNITS[f.type].taunt && dist(f, u) <= 2);
      const pool = taunters.length ? taunters : foes;
      pool.sort((a, b) => dist(a, u) - dist(b, u) || a.hp - b.hp || a.r - b.r || a.c - b.c);
      const t = pool[0];
      if (dist(t, u) <= d.rng) {
        if (d.bomb) { u.hp = 0; log.push('A bomber charges in!'); explode(u); return; }
        hurt(t, d.atk);
        if (t.gear === 'thorns' && d.rng === 1) hurt(u, 1);
        if (d.splash) for (const [dr, dc] of DIR4) { const o = occ(t.r + dr, t.c + dc); if (o && o.side === t.side) hurt(o, 1); }
        return;
      }
      let best = null;
      for (const [dr, dc] of DIR4) {
        const r = u.r + dr, c = u.c + dc; if (!free(r, c)) continue;
        const nd = Math.abs(t.r - r) + Math.abs(t.c - c);
        if (nd < dist(t, u) && (!best || nd < best.nd || (nd === best.nd && dr !== 0))) best = { r, c, nd };
      }
      if (best) { u.r = best.r; u.c = best.c; }
    };
    snap();
    let result = null;
    for (let tick = 0; tick < 40 && !result; tick++) {
      const order = st.units.filter(alive).sort((a, b) => (b.gear === 'haste') - (a.gear === 'haste') || a.r - b.r || a.c - b.c);
      for (const u of order) {
        for (let n = 0; n < (u.gear === 'haste' ? 2 : 1); n++) if (alive(u)) act(u, tick);
        if (!st.units.some((o) => alive(o) && o.side === 'foe')) { result = 'win'; break; }
        if (!st.units.some((o) => alive(o) && o.side === 'ally')) { result = 'lose'; break; }
      }
      snap();
    }
    const survivors = st.units.filter((u) => u.side === 'ally' && alive(u));
    const returned = {}; for (const u of survivors) returned[u.type] = (returned[u.type] || 0) + 1;
    const win = result === 'win';
    const fallen = st.units.filter((u) => u.side === 'ally' && !alive(u)).map((u) => VG_UNITS[u.type].name);
    return { frames, win, returned: win ? returned : {}, reason: win ? `Victory.${fallen.length ? ' Lost for good: ' + fallen.join(', ') + '.' : ' No losses.'}` : result === 'lose' ? 'Your whole company fell.' : 'The battle stalled. The enemy holds the field.' };
  },
};

// ======================================================================== MIRROR DUEL
const DUEL_FOES = {
  adept: { icon: '🧝', name: 'Fire Adept', hp: 3 },
  witch: { icon: '🧙‍♀️', name: 'Frost Witch', hp: 4, immune: 'frost', weak: 'lightning' },
  lich: { icon: '💀', name: 'Storm Lich', hp: 6, immune: 'lightning', weak: 'fire' },
  golem: { icon: '🗿', name: 'Ice Golem', hp: 3, immune: 'frost' },
};
const EL = { fire: '🔥', frost: '❄️', lightning: '⚡', arcane: '✨' };
const MIRROR = { '/': { '↑': '→', '→': '↑', '↓': '←', '←': '↓' }, '\\': { '↑': '←', '←': '↑', '↓': '→', '→': '↓' } };
const REV = { '↑': '↓', '↓': '↑', '←': '→', '→': '←' };
const LEFT = { '↑': '←', '←': '↓', '↓': '→', '→': '↑' };
const Duel = {
  key: 'duel', title: 'Mirror Duel', R: 7, C: 6, frameMs: 110,
  tagline: 'The enemy’s spell is already drawn on the floor. Place counters to block, bend and bounce it back.',
  items: {
    mirror: { name: 'Mirror', icon: '🪞', dirs: ['/', '\\'], info: 'Bends a beam 90°. Choose / or \\ before placing.' },
    shield: { name: 'Shield Stone', icon: '🪨', info: 'Stops one beam completely, then crumbles.' },
    prism: { name: 'Prism', icon: '🔺', info: 'Splits a beam into two, out to its left and right. Breaks after one use.' },
    ward: { name: 'Water Ward', icon: '💧', info: 'Fire: snuffed out. Frost: freezes into an ice wall that blocks later beams. Lightning: shocks everything touching the ward for 2 and carries on.' },
    leech: { name: 'Leech Rune', icon: '🌀', info: 'Sends the first beam straight back the way it came, 1 stronger.' },
  },
  satchel: { mirror: 3, shield: 1, prism: 1, ward: 1, leech: 1 },
  anchored: ['leech'],
  persist: { hp: 6 },
  encounters: [
    { name: 'The Fire Adept', goal: 'Bring the Fire Adept (3 HP) down. Your HP carries between duels.', reward: ['mirror', 'shield', 'ward'],
      you: [6, 2], foes: [['adept', 0, 2]], walls: [],
      beams: [{ r: 1, c: 2, dir: '↓', el: 'fire', pow: 2 }, { r: 1, c: 4, dir: '↓', el: 'fire', pow: 2 }] },
    { name: 'The Frost Witch', goal: 'Bring down the Frost Witch (4 HP). Immune to frost, takes double from lightning.', reward: ['prism', 'mirror', 'leech'],
      you: [6, 3], foes: [['witch', 0, 2], ['golem', 1, 0]], walls: [],
      beams: [{ r: 1, c: 3, dir: '↓', el: 'frost', pow: 3 }, { r: 3, c: 5, dir: '←', el: 'lightning', pow: 2 }] },
    { name: 'The Storm Lich', goal: 'Bring down the Storm Lich (6 HP). Immune to lightning, takes double from fire.', reward: [],
      you: [6, 2], foes: [['lich', 0, 3], ['golem', 0, 5]], walls: [[5, 0]],
      beams: [{ r: 1, c: 2, dir: '↓', el: 'lightning', pow: 3 }, { r: 1, c: 4, dir: '↓', el: 'fire', pow: 3 }, { r: 4, c: 5, dir: '←', el: 'arcane', pow: 2 }] },
  ],
  setupState(enc, placements, persist) {
    const units = enc.foes.map(([type, r, c]) => ({ type, r, c, hp: DUEL_FOES[type].hp, side: 'foe' }));
    units.push({ type: 'you', r: enc.you[0], c: enc.you[1], hp: persist ? persist.hp : 6, side: 'you' });
    return { units, items: placements.map((p) => ({ k: p.k, r: p.r, c: p.c, dir: p.dir, used: false, ice: false })), walls: enc.walls.map((w) => w.slice()),
      beams: enc.beams.map((b, i) => ({ ...b, n: i + 1 })), trail: [], fx: [] };
  },
  canPlace(enc, placements, k, r, c) {
    if (r < 2 || r > 5) return 'Counters go in the middle rows (rows 3–6).';
    if (placements.some((p) => p.r === r && p.c === c)) return 'Something is already placed there.';
    if (enc.walls.some(([wr, wc]) => wr === r && wc === c) || enc.beams.some((b) => b.r === r && b.c === c) || enc.foes.some(([, fr, fc]) => fr === r && fc === c)) return 'That tile is taken.';
    return true;
  },
  describe(enc, placements, r, c) {
    const b = enc.beams.find((b) => b.r === r && b.c === c);
    if (b) return `Beam ${enc.beams.indexOf(b) + 1}: ${b.el} ${b.pow}, fires ${b.dir}. Beams fire in number order.`;
    const f = enc.foes.find(([, fr, fc]) => fr === r && fc === c);
    if (f) { const d = DUEL_FOES[f[0]]; return `${d.name}: ${d.hp} HP.${d.immune ? ` Immune to ${d.immune}.` : ''}${d.weak ? ` Takes double from ${d.weak}.` : ''}`; }
    if (enc.you[0] === r && enc.you[1] === c) return 'You. Every beam that reaches you hurts, and your HP carries to the next duel.';
    if (enc.walls.some(([wr, wc]) => wr === r && wc === c)) return 'Stone pillar: stops beams.';
    return r >= 2 && r <= 5 ? 'Open floor. Counters can go here.' : 'Out of your reach.';
  },
  sim(enc, placements, persist) {
    const st = this.setupState(enc, placements, persist), frames = [];
    let log = [];
    const snap = () => { frames.push({ st: clone(st), log: log.join(' ') }); log = []; st.fx = []; };
    const unitAt = (r, c) => st.units.find((u) => u.hp > 0 && u.r === r && u.c === c);
    const name = (u) => (u.type === 'you' ? 'You' : DUEL_FOES[u.type].name);
    const dmg = (u, n, el) => {
      const d = DUEL_FOES[u.type] || {};
      const m = d.immune === el ? 0 : d.weak === el ? 2 : 1;
      u.hp = Math.max(0, u.hp - n * m); st.fx.push([u.r, u.c]);
      log.push(m === 0 ? `${name(u)} shrugs off the ${el}.` : `${name(u)} take${u.type === 'you' ? '' : 's'} ${n * m}${m === 2 ? ' (weak!)' : ''}.`);
    };
    snap();
    const queue = st.beams.map((b) => ({ r: b.r, c: b.c, dir: b.dir, el: b.el, pow: b.pow, n: b.n }));
    let guard = 0;
    while (queue.length && guard++ < 30) {
      const b = queue.shift(); st.trail = [];
      log.push(`Beam ${b.n}: ${b.el} ${b.pow} ${EL[b.el]}`);
      let r = b.r, c = b.c, dir = b.dir;
      for (let step = 0; step < 60; step++) {
        const [dr, dc] = ARROW[dir]; r += dr; c += dc;
        if (r < 0 || r >= 7 || c < 0 || c >= 6) break;
        st.trail.push([r, c, b.el]);
        if (st.walls.some(([wr, wc]) => wr === r && wc === c)) { log.push('It hits stone.'); snap(); break; }
        const u = unitAt(r, c);
        if (u) { dmg(u, b.pow, b.el); snap(); break; }
        const it = st.items.find((x) => x.r === r && x.c === c);
        if (it) {
          if (it.ice) { log.push('It shatters on the ice wall.'); snap(); break; }
          if (it.k === 'shield' && !it.used) { it.used = true; log.push('The shield stone absorbs it and crumbles.'); snap(); break; }
          if (it.k === 'mirror') { dir = MIRROR[it.dir][dir]; log.push('Reflected!'); }
          if (it.k === 'prism' && !it.used) {
            it.used = true; log.push('The prism splits it!');
            queue.unshift({ r, c, dir: REV[LEFT[dir]], el: b.el, pow: b.pow, n: b.n + 'b' });
            queue.unshift({ r, c, dir: LEFT[dir], el: b.el, pow: b.pow, n: b.n + 'a' });
            snap(); break;
          }
          if (it.k === 'leech' && !it.used) { it.used = true; dir = REV[dir]; b.pow += 1; log.push(`The leech rune hurls it back at ${b.pow}!`); }
          if (it.k === 'ward') {
            if (b.el === 'fire') { log.push('The water ward snuffs the fire.'); snap(); break; }
            if (b.el === 'frost') { it.ice = true; log.push('The ward freezes into an ice wall.'); snap(); break; }
            if (b.el === 'lightning') { log.push('The ward crackles!'); for (const [ddr, ddc] of DIR8) { const o = unitAt(r + ddr, c + ddc); if (o) dmg(o, 2, 'lightning'); } }
          }
        }
        snap();
      }
      st.trail = [];
      if (st.units.find((u) => u.type === 'you').hp <= 0) break;
    }
    snap();
    const you = st.units.find((u) => u.type === 'you');
    const boss = st.units[0];
    const win = you.hp > 0 && boss.hp <= 0;
    return { frames, win, persist: { hp: you.hp },
      reason: you.hp <= 0 ? 'The spell killed you.' : boss.hp > 0 ? `The ${DUEL_FOES[boss.type].name} survived with ${boss.hp} HP.` : `The ${DUEL_FOES[boss.type].name} falls. You keep ${you.hp} HP.` };
  },
};

// ======================================================================== HEIST
const Heist = {
  key: 'heist', title: 'One-Night Heist', R: 8, C: 6, frameMs: 360, route: true,
  tagline: 'Draw your thief’s route through the tower, place your tools, then watch the night play out. One sighting and it’s over.',
  items: {
    smoke: { name: 'Smoke Vial', icon: '💨', info: 'Put it on your route. When you reach it, smoke fills the 3×3 around you for 4 steps. Guards can’t see into or through smoke.' },
    dart: { name: 'Sleep Dart', icon: '💤', info: 'Put it on a guard or hound. It sleeps all night.' },
    decoy: { name: 'Illusion Decoy', icon: '🎭', info: 'Put it on open floor. Guards and hounds within 4 tiles walk over to it and stare at it all night.' },
    key: { name: 'Skeleton Key', icon: '🗝️', info: 'Put it on a locked door 🚪 so your route can pass through.' },
    invis: { name: 'Shadow Draught', icon: '🧪', info: 'Put it on your route. From that step you are invisible to guards (not hounds) for 3 steps.' },
  },
  satchel: { smoke: 1, dart: 1, decoy: 1, key: 1, invis: 1 },
  anchored: ['invis'],
  encounters: [
    { name: 'The Gallery', goal: 'Steal the relic 💎 and get back to the exit within 16 steps.', reward: ['smoke', 'dart', 'decoy'], maxSteps: 16,
      map: ['######', '#.R..#', '#....#', '#....#', '#.##.#', '#....#', '#....#', '##E###'],
      guards: [{ type: 'guard', patrol: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 3], [3, 2]], start: 0 }] },
    { name: 'The Kennels', goal: 'Steal the relic and get out within 20 steps. The hound smells you on touching tiles, smoke or not.', reward: ['invis', 'smoke', 'key'], maxSteps: 20,
      map: ['######', '#R..##', '#.#..#', '#....#', '##D#.#', '#....#', '#.#..#', '###E##'],
      guards: [
        { type: 'hound', patrol: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 3], [3, 2]], start: 0 },
        { type: 'guard', patrol: [[5, 1], [5, 2], [5, 3], [5, 4], [6, 4], [6, 3], [5, 3], [5, 2]], start: 0 },
      ] },
    { name: 'The Vault', goal: 'Steal the crown jewel and escape within 20 steps.', reward: [], maxSteps: 20,
      map: ['#.R..#', '#.##.#', '#....#', '##D#.#', '#....#', '#....#', '#....#', '##E###'],
      guards: [
        { type: 'guard', patrol: [[0, 1], [1, 1], [2, 1], [2, 2], [2, 3], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2]], start: 0 },
        { type: 'guard', patrol: [[4, 1], [4, 2], [4, 3], [4, 4], [5, 4], [6, 4], [6, 3], [6, 2], [6, 1], [5, 1]], start: 0 },
      ] },
  ],
  tile(enc, r, c) { return r >= 0 && r < 8 && c >= 0 && c < 6 ? enc.map[r][c] : '#'; },
  exit(enc) { for (let r = 0; r < 8; r++) { const c = enc.map[r].indexOf('E'); if (c >= 0) return [r, c]; } return null; },
  relic(enc) { for (let r = 0; r < 8; r++) { const c = enc.map[r].indexOf('R'); if (c >= 0) return [r, c]; } return null; },
  guardAt(enc, i, t) { const g = enc.guards[i]; return g.patrol[(g.start + t) % g.patrol.length]; },
  canPlace(enc, placements, k, r, c, route) {
    const ch = this.tile(enc, r, c);
    if (placements.some((p) => p.r === r && p.c === c && p.k !== 'smoke' && p.k !== 'invis')) return 'Something is already placed there.';
    if (k === 'key') return ch === 'D' ? true : 'Keys go on a locked door 🚪.';
    if (k === 'dart') return enc.guards.some((g, i) => { const [gr, gc] = this.guardAt(enc, i, 0); return gr === r && gc === c; }) ? true : 'Darts go on a guard or hound.';
    if (k === 'decoy') return ch !== '#' && ch !== 'D' && !route.some(([rr, cc]) => rr === r && cc === c) ? true : 'Decoys go on open floor off your route.';
    return route.some(([rr, cc], i) => i > 0 && rr === r && cc === c) ? true : 'Put this on a tile of your route.';
  },
  passable(enc, placements, r, c) {
    const ch = this.tile(enc, r, c);
    if (ch === '#') return false;
    if (ch === 'D') return placements.some((p) => p.k === 'key' && p.r === r && p.c === c);
    return true;
  },
  describe(enc, placements, r, c) {
    const ch = this.tile(enc, r, c);
    const gi = enc.guards.findIndex((g, i) => { const [gr, gc] = this.guardAt(enc, i, 0); return gr === r && gc === c; });
    if (gi >= 0) return enc.guards[gi].type === 'hound' ? 'Hound: smells you on its own tile and the 4 touching it. Smoke doesn’t stop it.' : 'Guard: walks the dotted route and sees 3 tiles ahead.';
    return { R: 'The relic. Your route must pass here.', E: 'The exit. Your route starts here and must end here.', D: 'Locked door. Needs a Skeleton Key on it.', '#': 'Wall.' }[ch] || 'Floor.';
  },
  // Runs the night. With detect=false it just plays guard movement (used for the planning preview).
  sim(enc, placements, persist, route, detect = true) {
    const frames = [], n = route.length;
    const guards = enc.guards.map((g, i) => {
      const [r, c] = this.guardAt(enc, i, 0);
      return { i, type: g.type, r, c, face: null, asleep: placements.some((p) => p.k === 'dart' && p.r === r && p.c === c), lure: null };
    });
    const decoy = placements.find((p) => p.k === 'decoy');
    const smoke = [];
    let invisUntil = -1, caught = null, log = [];
    const blocked = (r, c) => !this.passable(enc, placements, r, c);
    const smoky = (r, c, t) => smoke.some((s) => t >= s.t0 && t < s.t0 + 4 && Math.abs(s.r - r) <= 1 && Math.abs(s.c - c) <= 1);
    if (decoy) for (const g of guards) if (!g.asleep && Math.abs(g.r - decoy.r) + Math.abs(g.c - decoy.c) <= 4) { g.lure = [decoy.r, decoy.c]; log.push(`A ${g.type} turns toward the decoy.`); }
    const stepToward = (g, [tr, tc]) => {
      const key = (r, c) => r * 6 + c, prev = new Map([[key(g.r, g.c), null]]), q = [[g.r, g.c]];
      while (q.length) {
        const [r, c] = q.shift();
        if (Math.abs(r - tr) + Math.abs(c - tc) === 1) {
          let cur = [r, c]; while (prev.get(key(...cur)) && (prev.get(key(...cur))[0] !== g.r || prev.get(key(...cur))[1] !== g.c)) cur = prev.get(key(...cur));
          return cur[0] === g.r && cur[1] === g.c ? null : cur;
        }
        for (const [dr, dc] of DIR4) { const nr = r + dr, nc = c + dc; if (!blocked(nr, nc) && !prev.has(key(nr, nc)) && !(nr === tr && nc === tc)) { prev.set(key(nr, nc), [r, c]); q.push([nr, nc]); } }
      }
      return null;
    };
    const faceTo = (g, r, c) => { const dr = r - g.r, dc = c - g.c; if (dr || dc) g.face = Math.abs(dr) >= Math.abs(dc) ? (dr < 0 ? '↑' : '↓') : (dc < 0 ? '←' : '→'); };
    const vision = (g, t) => {
      if (g.asleep) return [];
      if (g.type === 'hound') return [[g.r, g.c], ...DIR4.map(([dr, dc]) => [g.r + dr, g.c + dc])];
      const out = [[g.r, g.c]];
      if (!g.face) return out;
      const [dr, dc] = ARROW[g.face];
      for (let k = 1; k <= 3; k++) { const r = g.r + dr * k, c = g.c + dc * k; if (this.tile(enc, r, c) === '#' || this.tile(enc, r, c) === 'D' || smoky(r, c, t)) break; out.push([r, c]); }
      return out;
    };
    // initial facing for patrols
    guards.forEach((g, i) => { if (!g.lure) { const [nr, nc] = this.guardAt(enc, i, 1); faceTo(g, nr, nc); } else faceTo(g, ...g.lure); });
    const snapshot = (t, thief) => frames.push({ st: { t, thief, guards: clone(guards), cones: guards.map((g) => vision(g, t)), smoke: smoke.filter((s) => t >= s.t0 && t < s.t0 + 4).map((s) => [s.r, s.c]), invis: t <= invisUntil, caught, steps: n - 1 }, log: log.join(' ') });
    snapshot(0, route[0]); log = [];
    const T = Math.max(n - 1, detect ? 0 : 20);
    for (let t = 1; t <= T && !caught; t++) {
      const prevThief = route[Math.min(t - 1, n - 1)], thief = route[Math.min(t, n - 1)];
      const before = guards.map((g) => [g.r, g.c]);
      guards.forEach((g, i) => {
        if (g.asleep) return;
        if (g.lure) { const s = stepToward(g, g.lure); if (s) { faceTo(g, ...s); [g.r, g.c] = s; } faceTo(g, ...g.lure); return; }
        const [nr, nc] = this.guardAt(enc, i, t); faceTo(g, nr, nc); g.r = nr; g.c = nc;
        const [ar, ac] = this.guardAt(enc, i, t + 1); faceTo(g, ar, ac);
      });
      if (t < n) {
        for (const p of placements) if (p.r === thief[0] && p.c === thief[1]) {
          if (p.k === 'smoke' && !smoke.some((s) => s.p === p)) { smoke.push({ r: p.r, c: p.c, t0: t, p }); log.push('Smoke!'); }
          if (p.k === 'invis' && invisUntil < 0) { invisUntil = t + 2; log.push('You fade into shadow.'); }
        }
      }
      if (detect && t < n) {
        guards.forEach((g, i) => {
          if (caught || g.asleep) return;
          const swapped = g.r === prevThief[0] && g.c === prevThief[1] && before[i][0] === thief[0] && before[i][1] === thief[1];
          const sees = vision(g, t).some(([r, c]) => r === thief[0] && c === thief[1]);
          const hidden = g.type === 'guard' && (t <= invisUntil || smoky(thief[0], thief[1], t));
          if (swapped || (g.r === thief[0] && g.c === thief[1]) || (sees && !hidden)) { caught = `A ${g.type} ${g.type === 'hound' ? 'sniffed you out' : 'spotted you'} on step ${t}.`; log.push(caught); }
        });
      }
      snapshot(t, thief); log = [];
    }
    const [rr, rc] = this.relic(enc), [er, ec] = this.exit(enc);
    const gotRelic = route.some(([r, c]) => r === rr && c === rc);
    const end = route[n - 1];
    const out = end[0] === er && end[1] === ec;
    const win = !caught && gotRelic && out && n - 1 <= enc.maxSteps;
    return { frames, win, reason: caught || (!gotRelic ? 'You never took the relic.' : !out ? 'You never made it back out.' : n - 1 > enc.maxSteps ? 'Too slow: dawn broke.' : 'Clean getaway.') };
  },
};

const ONE_TURN_GAMES = { spark: Spark, ambush: Ambush, vanguard: Vanguard, duel: Duel, heist: Heist };
if (typeof module !== 'undefined') module.exports = { ONE_TURN_GAMES, SPARK_UNITS, AMBUSH_UNITS, VG_UNITS, DUEL_FOES, EL, ARROW };
