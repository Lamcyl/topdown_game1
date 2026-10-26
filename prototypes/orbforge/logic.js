// Orbforge prototype: rules and levels (no DOM), shared by the page and the Node checks.
/* eslint-disable no-unused-vars */
const OF_DIRS = { '↑': [-1, 0], '→': [0, 1], '↓': [1, 0], '←': [0, -1] };
const OF_LEFT = { '↑': '←', '←': '↓', '↓': '→', '→': '↑' };
const OF_RIGHT = { '↑': '→', '→': '↓', '↓': '←', '←': '↑' };
const ofClone = (o) => JSON.parse(JSON.stringify(o));

const ELEMENTS = {
  fire:  { name: 'Fire', icon: '🔥', base: 2, tier: 1, info: 'Burns: 1 more damage on each of the next 3 beats.' },
  water: { name: 'Water', icon: '💧', base: 1, tier: 1, info: 'Soaks: puts out fire shields (and any burning).' },
  earth: { name: 'Earth', icon: '🪨', base: 3, tier: 1, info: 'Cracks armour: ignores it and breaks it for good.' },
  steam: { name: 'Steam', icon: '☁️', base: 4, tier: 2, info: 'Scalds through armour and soaks.' },
  magma: { name: 'Magma', icon: '🌋', base: 6, tier: 2, info: 'Burns hard: 2 more damage on each of the next 3 beats.' },
  mud:   { name: 'Mud', icon: '🟫', base: 2, tier: 2, info: 'Cracks armour, soaks, and mires: every later hit does double.' },
  // Locked in this prototype: shown in the recipe book as ???
  eruption: { name: 'Eruption', icon: '🌠', base: 10, tier: 3, locked: true, info: 'Hits both enemies.' },
  obsidian: { name: 'Obsidian', icon: '🖤', base: 12, tier: 3, locked: true, info: 'A huge armour-breaking hit.' },
  quagmire: { name: 'Quagmire', icon: '🫧', base: 3, tier: 3, locked: true, info: 'Mires and soaks both enemies.' },
  air: { name: 'Air', icon: '🌪️', base: 1, tier: 1, locked: true, info: 'The fourth element.' },
};
const RECIPES = {
  'fire+water': 'steam', 'earth+fire': 'magma', 'earth+water': 'mud',
  'magma+steam': 'eruption', 'magma+mud': 'obsidian', 'mud+steam': 'quagmire',
};
const TILES = {
  belt:     { name: 'Belt', icon: '▫️', free: true, dir: true, info: 'Carries orbs one tile per beat in its arrow’s direction. Free and unlimited.' },
  launcher: { name: 'Launcher', icon: '🏹', free: true, info: 'Fires every orb that enters it at its target. Tap it again to switch target. Free.' },
  fuser:    { name: 'Fuser', icon: '⚗️', dir: true, info: 'Holds the first orb until a second arrives, then mixes them and sends the result out its arrow side. Same + same adds their power.' },
  amp:      { name: 'Amplifier', icon: '➕', dir: true, info: '+3 power to every orb that passes.' },
  lens:     { name: 'Prism Lens', icon: '🔍', dir: true, info: '×2 power. Multiply last for the biggest numbers.' },
  splitter: { name: 'Splitter', icon: '🔀', dir: true, info: 'Sends orbs out to its left, then its right, alternating. Its arrow is the way it faces.' },
  delay:    { name: 'Delay Coil', icon: '⏳', dir: true, info: 'Holds each orb for 2 beats before passing it on. Use it to change the order of hits.' },
};
const ENEMIES = {
  goblin: { name: 'Goblin', icon: '👺' },
  ogre: { name: 'Ogre', icon: '👹' },
  troll: { name: 'Bridge Troll', icon: '🧌' },
  knight: { name: 'Iron Knight', icon: '🤺' },
  wyrm: { name: 'Ember Wyrm', icon: '🐉' },
  golem: { name: 'Stone Golem', icon: '🗿' },
};

// map legend: '.' floor, '#' rock
const LEVELS = [
  { name: 'The Lone Goblin', par: 0, map: ['......', '......', '......', '......', '......', '......', '......'],
    wells: [{ el: 'fire', n: 1 }], grant: {}, enemies: { L: { type: 'goblin', hp: 4 } },
    teach: ['Place the 🔥 well: tap it in the Wells tray, then tap a tile. Its arrow is where orbs come out.',
      'Lay Belts from the well, and end the line in a Launcher aimed at the goblin. Each tap on the next tile bends the previous belt toward it.',
      'Press Play. Fire hits for 2 and burns for 3 more.'] },
  { name: 'The Ogre at the Gate', par: 1, map: ['......', '......', '......', '#....#', '......', '......', '......'],
    wells: [{ el: 'fire', n: 1 }, { el: 'earth', n: 1 }], grant: { fuser: 1 }, enemies: { L: { type: 'ogre', hp: 10 } },
    teach: ['Fire and earth alone won’t bring down 10 HP. Mixed, they make 🌋 Magma: 6 damage and a fierce burn.',
      'Point both wells into a Fuser. Whatever arrives second is mixed with the first, and Magma leaves through the Fuser’s arrow.',
      'Special tiles like the Fuser are used up once an orb touches them. Ones you don’t use carry over to the next level.'] },
  { name: 'Troll Bridge', par: 3, map: ['......', '......', '#....#', '......', '......', '......', '......'],
    wells: [{ el: 'fire', n: 1 }, { el: 'earth', n: 1 }], grant: { fuser: 1, amp: 1, lens: 1 }, enemies: { L: { type: 'troll', hp: 22 } },
    teach: ['The Amplifier adds 3, the Prism Lens doubles.', 'Order matters: add first, then multiply.',
      'Retry as often as you like. Your layout stays put between tries.'] },
  { name: 'Two Goblins', par: 1, map: ['......', '......', '......', '......', '##..##', '......', '......'],
    wells: [{ el: 'fire', n: 2 }], grant: { splitter: 1 }, enemies: { L: { type: 'goblin', hp: 4 }, R: { type: 'goblin', hp: 4 } },
    teach: ['This well holds 2 orbs and releases one every 2 beats.', 'A Splitter sends the first orb out its left and the next out its right.',
      'Give each goblin its own Launcher. Tap a Launcher to switch it between the left and right enemy.'] },
  { name: 'The Iron Knight', par: 3, map: ['......', '......', '......', '......', '......', '......', '......'],
    wells: [{ el: 'fire', n: 1 }, { el: 'water', n: 1 }, { el: 'earth', n: 1 }], grant: { fuser: 1, lens: 1, delay: 1 },
    enemies: { L: { type: 'knight', hp: 13, armor: 3 } },
    teach: ['Armour 🛡️3 takes 3 off every hit. Earth and 🟫 Mud crack it for good.', 'Mud also mires: every hit after it does double.',
      'So hit with Mud first, then something big. A Delay Coil holds an orb for 2 beats to get the order right.'] },
  { name: 'Wyrm and Golem', par: 4, map: ['......', '......', '......', '......', '......', '......', '......'],
    wells: [{ el: 'fire', n: 2 }, { el: 'water', n: 1 }, { el: 'earth', n: 1 }], grant: { fuser: 1, splitter: 1, lens: 1, amp: 1 },
    enemies: { L: { type: 'wyrm', hp: 8, shield: true }, R: { type: 'golem', hp: 12, armor: 2 } },
    teach: ['The Ember Wyrm’s fire shield blocks fire and magma until something soaks it.', 'The Golem has armour 🛡️2.',
      'Everything you’ve learned, together. This is the last level of the prototype.'] },
];

function combine(a, b) {
  if (a.el === b.el) return { el: a.el, pow: a.pow + b.pow, note: `${ELEMENTS[a.el].name} concentrates` };
  const key = [a.el, b.el].sort().join('+');
  const out = RECIPES[key];
  if (!out) return { fizzle: `${ELEMENTS[a.el].name} and ${ELEMENTS[b.el].name} don’t mix. Fizzle!` };
  if (ELEMENTS[out].locked) return { fizzle: `${ELEMENTS[a.el].name} + ${ELEMENTS[b.el].name} reacts, but you haven’t learned that recipe yet. Fizzle!` };
  return { el: out, pow: ELEMENTS[out].base + (a.pow - ELEMENTS[a.el].base) + (b.pow - ELEMENTS[b.el].base), note: `${ELEMENTS[out].name}!` };
}

function makeEnemies(level) {
  const out = {};
  for (const [side, e] of Object.entries(level.enemies)) out[side] = { side, type: e.type, hp: e.hp, max: e.hp, armor: e.armor || 0, shield: !!e.shield, soaked: false, mired: false, burn: null };
  return out;
}

function applyHit(en, orb, log) {
  const name = ENEMIES[en.type].name, el = orb.el;
  if (en.hp <= 0) { log.push(`The orb sails over the fallen ${name}.`); return; }
  const fiery = el === 'fire' || el === 'magma';
  if (en.shield && !en.soaked && fiery) { log.push(`The ${name}’s fire shield swallows the ${ELEMENTS[el].name}!`); return; }
  let armor = en.armor;
  if (el === 'earth' || el === 'mud') { if (en.armor) log.push(`${ELEMENTS[el].name} cracks the armour!`); en.armor = 0; armor = 0; }
  if (el === 'steam') armor = 0;
  let dmg = Math.max(0, orb.pow - armor);
  if (en.mired) dmg *= 2;
  en.hp = Math.max(0, en.hp - dmg);
  log.push(`${ELEMENTS[el].icon} ${ELEMENTS[el].name} ${orb.pow} hits the ${name} for ${dmg}${en.mired ? ' (mired ×2)' : ''}${armor && dmg < orb.pow ? ` (armour −${armor})` : ''}.`);
  if (el === 'water' || el === 'steam' || el === 'mud') { if (en.shield && !en.soaked) log.push('The fire shield hisses out!'); en.soaked = true; if (en.burn) { en.burn = null; log.push('The burning is put out.'); } }
  if (el === 'mud') en.mired = true;
  if (el === 'fire' && en.hp > 0) en.burn = { per: 1, left: 3 };
  if (el === 'magma' && en.hp > 0) en.burn = { per: 2, left: 3 };
}

// layout: { "r,c": { t: 'belt'|'launcher'|'well'|<special>, dir, target, well } }
function simulate(level, layout) {
  const frames = [], enemies = makeEnemies(level);
  const tiles = ofClone(layout);
  const wells = Object.entries(tiles).filter(([, t]) => t.t === 'well').map(([k, t]) => ({ k, r: +k.split(',')[0], c: +k.split(',')[1], dir: t.dir, el: level.wells[t.well].el, left: level.wells[t.well].n }));
  const used = new Set(), made = new Set();
  let orbs = [], pending = [], log = [], nextId = 1;
  const snap = (beat) => { frames.push({ beat, orbs: orbs.map((o) => ({ el: o.el, pow: o.pow, r: o.r, c: o.c })), enemies: ofClone(enemies), tiles: ofClone(tiles), log: log.join(' '), fx: [...fxNow] }); log = []; fxNow = []; };
  let fxNow = [];
  snap(-1);
  for (let beat = 0; beat < 80; beat++) {
    for (const w of wells) if (beat % 2 === 0 && w.left > 0) { w.left--; orbs.push({ id: nextId++, el: w.el, pow: ELEMENTS[w.el].base, r: w.r, c: w.c, dir: w.dir, wait: 0 }); }
    for (const p of pending) orbs.push({ id: nextId++, ...p, wait: 0 });
    pending = [];
    for (const o of orbs) {
      if (o.gone) continue;
      if (o.wait > 0) { o.wait--; continue; }
      const [dr, dc] = OF_DIRS[o.dir], r = o.r + dr, c = o.c + dc;
      o.r = r; o.c = c;
      const key = r + ',' + c, t = tiles[key];
      if (r < 0 || r >= 7 || c < 0 || c >= 6) { o.gone = true; log.push(`${ELEMENTS[o.el].icon} rolls off the edge and is lost.`); continue; }
      if (!t || t.t === 'well' || level.map[r][c] === '#') { o.gone = true; fxNow.push(key); log.push(`${ELEMENTS[o.el].icon} spills onto the ground and is lost.`); continue; }
      if (t.t === 'belt') { o.dir = t.dir; continue; }
      if (t.t === 'launcher') {
        o.gone = true; fxNow.push(key);
        const en = enemies[t.target];
        if (!en) { log.push('The launcher fires at empty air.'); continue; }
        applyHit(en, o, log); fxNow.push('enemy-' + t.target); continue;
      }
      used.add(key); fxNow.push(key);
      if (t.t === 'amp') { o.pow += 3; o.dir = t.dir; }
      else if (t.t === 'lens') { o.pow *= 2; o.dir = t.dir; }
      else if (t.t === 'delay') { o.wait = 2; o.dir = t.dir; }
      else if (t.t === 'splitter') { t.flip = !t.flip; o.dir = t.flip ? OF_LEFT[t.dir] : OF_RIGHT[t.dir]; }
      else if (t.t === 'fuser') {
        o.gone = true;
        if (!t.held) { t.held = { el: o.el, pow: o.pow }; continue; }
        const res = combine(t.held, o); t.held = null;
        if (res.fizzle) { log.push(res.fizzle); continue; }
        log.push(res.note); made.add(res.el);
        pending.push({ el: res.el, pow: res.pow, r, c, dir: t.dir });
      }
    }
    orbs = orbs.filter((o) => !o.gone);
    for (const en of Object.values(enemies)) if (en.burn && en.hp > 0) {
      en.hp = Math.max(0, en.hp - en.burn.per); log.push(`The ${ENEMIES[en.type].name} burns for ${en.burn.per}.`);
      if (--en.burn.left <= 0) en.burn = null;
      fxNow.push('enemy-' + en.side);
    }
    for (const en of Object.values(enemies)) if (en.hp <= 0 && !en.dead) { en.dead = true; en.burn = null; log.push(`The ${ENEMIES[en.type].name} falls!`); }
    snap(beat);
    const busy = orbs.length || pending.length || wells.some((w) => w.left > 0) || Object.values(enemies).some((e) => e.burn);
    if (!busy) break;
  }
  const held = Object.values(tiles).filter((t) => t.held);
  if (held.length) { log.push(`${held.length} orb${held.length > 1 ? 's' : ''} left waiting in a Fuser fizzle${held.length > 1 ? '' : 's'} out.`); snap(frames.length); }
  const alive = Object.values(enemies).filter((e) => e.hp > 0);
  const usedTiles = {}; for (const k of used) { const t = tiles[k]; usedTiles[t.t] = (usedTiles[t.t] || 0) + 1; }
  return { frames, win: !alive.length, usedTiles, made: [...made], reason: alive.length ? alive.map((e) => `The ${ENEMIES[e.type].name} survives with ${e.hp} HP.`).join(' ') : 'Every enemy is down.' };
}

if (typeof module !== 'undefined') module.exports = { ELEMENTS, RECIPES, TILES, ENEMIES, LEVELS, simulate, combine };
