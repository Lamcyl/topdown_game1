// One-turn demos: page shell. Runs a 3-fight loop per game on top of logic.js.
const $tab = (k) => document.getElementById('tab-' + k);
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
const stat = (label, value, tone = '') => el('span', { class: 'stat ' + tone }, label + ' ', el('b', {}, String(value)));
const btn = (label, onclick, opts = {}) => el('button', { class: 'btn' + (opts.primary ? ' primary' : ''), onclick, disabled: opts.disabled }, label);
const badge = (txt, cls = '') => `<span class="badge ${cls}">${txt}</span>`;
function boardEl(rows, cols, cellFn, onTap) {
  const b = el('div', { class: 'board', style: `--cols:${cols}` });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const s = cellFn(r, c);
    const cell = el('button', { class: 'cell ' + (s.cls || ''), 'aria-label': s.label || `row ${r + 1}, column ${c + 1}`, onclick: () => onTap(r, c) });
    cell.innerHTML = s.html || '';
    b.append(cell);
  }
  return b;
}

// ---------------------------------------------------------------- per-game cell renderers
const RENDER = {
  spark(st, r, c) {
    const x = st.cells[r][c];
    let cls = { wall: 't-wall', water: 't-water', hay: 'sp-hay', oil: 'sp-oil', ash: 'sp-ash' }[x.t] || '';
    if (x.frozen) cls += ' sp-frozen';
    if (x.fire) cls += ' sp-fire';
    if (x.fx) cls += ' flash';
    let html = { barrel: '🛢️', pillar: '🏛️', metal: '⛓️', rubble: '<span style="opacity:.5">🪨</span>' }[x.obj] || '';
    if (x.unit) {
      const u = SPARK_UNITS[x.unit.type];
      html = x.unit.hp > 0 ? `<span class="${u.ally ? 'ally' : 'enemy'}">${u.icon}</span>` + badge(x.unit.hp, u.ally ? 'good' : 'bad') : '<span style="opacity:.45">💀</span>';
    }
    if (x.item && Spark.items[x.item.k] && x.item.k !== 'oil' && x.item.k !== 'frost') html = Spark.items[x.item.k].icon + (x.item.dir ? badge(x.item.dir, 'gold') : '');
    if (x.fire && !x.unit && !x.obj) html = '🔥';
    if (x.frozen) html += badge('❄️', 'l top');
    if (x.t === 'oil' && !x.fire) html += badge('oil', 'l');
    return { cls, html };
  },
  ambush(st, r, c, L) {
    const enc = L.enc, x = st.cells[r][c], P = enc.path, last = P.length - 1;
    let cls = x.t === 'rock' ? 't-wall' : x.path >= 0 ? 'am-road' : 'am-grass', html = '';
    if (x.fx) cls += ' flash';
    if (x.path === last) html = '🏠';
    if (x.path >= 0 && x.path < last) {
      const [nr, nc] = P[x.path + 1];
      html = `<span class="road-arrow">${nr < r ? '↑' : nr > r ? '↓' : nc < c ? '←' : '→'}</span>`;
    }
    if (x.item && !(x.item.k === 'wall' && x.item.spent) && !(x.item.k === 'glyph' && x.item.spent)) html = `<span style="${x.item.spent ? 'opacity:.4' : ''}">${Ambush.items[x.item.k].icon}</span>`;
    const f = st.foes.find((f) => f.hp > 0 && f.idx === x.path && x.path >= 0);
    if (f) html = `<span class="enemy">${AMBUSH_UNITS[f.type].icon}</span>` + badge(f.hp, 'bad') + (f.held ? badge('🪤', 'l') : '');
    if (x.path === 0) { const waiting = st.foes.filter((f) => f.hp > 0 && f.idx < 0).length; if (waiting) html += badge('+' + waiting, 'l top gold'); }
    return { cls, html };
  },
  vanguard(st, r, c) {
    let cls = r >= 3 ? 'vg-home' : 'vg-foe', html = '';
    const u = st.units.find((u) => u.hp > 0 && u.r === r && u.c === c);
    if (u) {
      html = `<span class="${u.side === 'ally' ? 'ally' : 'enemy'}">${VG_UNITS[u.type].icon}</span>` + badge(u.hp, u.side === 'ally' ? 'good' : 'bad');
      if (u.gear) html += badge(Vanguard.items[u.gear].icon, 'l top');
    }
    if (st.fx.some(([fr, fc]) => fr === r && fc === c)) cls += ' flash';
    return { cls, html };
  },
  duel(st, r, c, L) {
    let cls = r >= 2 && r <= 5 ? 'du-zone' : '', html = '';
    const tr = st.trail.find(([tr, tc]) => tr === r && tc === c);
    if (tr) cls += ' du-' + tr[2];
    else if (L.phase === 'setup' && L.intent && L.intent.has(r * 6 + c)) cls += ' du-intent';
    const b = st.beams.find((b) => b.r === r && b.c === c);
    if (b) html = `${EL[b.el]}${badge(b.dir + b.pow, 'gold')}${badge('#' + b.n, 'l top')}`;
    if (st.walls.some(([wr, wc]) => wr === r && wc === c)) { cls += ' t-wall'; html = '🧱'; }
    const it = st.items.find((x) => x.r === r && x.c === c);
    if (it) html = it.ice ? '🧊' : `<span style="${it.used ? 'opacity:.35' : ''}">${it.k === 'mirror' ? `<b class="mirror">${it.dir === '/' ? '╱' : '╲'}</b>` : Duel.items[it.k].icon}</span>`;
    const u = st.units.find((u) => u.r === r && u.c === c);
    if (u) html = u.hp > 0 ? `<span class="${u.side === 'you' ? 'ally' : 'enemy'}">${u.side === 'you' ? '🧙' : DUEL_FOES[u.type].icon}</span>` + badge(u.hp, u.side === 'you' ? 'good' : 'bad') : '<span style="opacity:.45">💀</span>';
    if (st.fx.some(([fr, fc]) => fr === r && fc === c)) cls += ' flash';
    return { cls, html };
  },
  heist(st, r, c, L) {
    const enc = L.enc, ch = enc.map[r][c];
    let cls = ch === '#' ? 't-wall' : '', html = '';
    if (ch === 'R') html = '💎';
    if (ch === 'E') html = '🚪';
    if (ch === 'D') html = L.placements.some((p) => p.k === 'key' && p.r === r && p.c === c) ? '🗝️' : '🔒';
    const steps = L.route.map(([rr, cc], i) => (rr === r && cc === c ? i : -1)).filter((i) => i > 0);
    if (steps.length) { cls += ' he-route'; html += badge(steps[steps.length - 1], 'gold'); }
    for (const p of L.placements) if (p.r === r && p.c === c && p.k !== 'key' && p.k !== 'dart') html = Heist.items[p.k].icon + (steps.length ? badge(steps[steps.length - 1], 'gold') : '');
    if (st.cones.some((cone, i) => !st.guards[i].asleep && cone.some(([cr, cc]) => cr === r && cc === c))) cls += ' he-seen';
    if (st.smoke.some(([sr, sc]) => Math.abs(sr - r) <= 1 && Math.abs(sc - c) <= 1)) cls += ' he-smoke';
    const g = st.guards.find((g) => g.r === r && g.c === c);
    if (g) html = (g.asleep ? '💤' : g.type === 'hound' ? '🐕' : '💂') + (g.face && !g.asleep ? badge(g.face, 'bad') : '') + (g.lure ? badge('🎭', 'l top') : '');
    if (st.thief && st.thief[0] === r && st.thief[1] === c) { html = `<span class="ally" style="${st.invis ? 'opacity:.45' : ''}">🥷</span>` + (html.includes('badge') ? '' : ''); if (st.caught) cls += ' attack'; }
    return { cls, html };
  },
};

const HELP = {
  spark: ['Pick an item, then tap a tile to place it. Tap a placed item to take it back. For the Gust Charm, pick its direction first.',
    'Press <b>Unleash</b>. Gusts blow first, then lightning strikes, then every Spark Stone lights. Fire spreads one tile per beat.',
    'Barrels explode (2 damage around them) and topple pillars next to them. Pillars crush the 2 tiles they fall on for 3, and can knock over the next pillar.',
    'Lightning runs through connected water and iron chains. Frost makes a tile immune to everything, and frozen water stops carrying lightning.'],
  ambush: ['Pick a trap, then tap a road tile. The totem goes on grass beside the road. Tap a placed trap to take it back.',
    'Press <b>Unleash</b> and the war party marches one tile per step in the order shown (+N on the first road tile). Wolves move 2.',
    'An enemy can’t pass another on the road, so a trapped enemy holds up everyone behind it. That is how you bunch them up for a Fire Glyph.',
    'The shaman heals everyone next to it by 1 each step. The troll breaks thorn walls at once and only stays trapped for 1 step.'],
  vanguard: ['Pick a unit, then tap a tile in the bottom 3 rows (up to 3 units). Then pick gear and tap one of your units to equip it.',
    'Press <b>Unleash</b>. Every step, each unit attacks the nearest enemy in range or walks toward it. Units at the top act first each step.',
    'Units that fall are gone for the rest of the loop. Gear is used up either way. Survivors return to your satchel.',
    'Enemies within 2 tiles of your Shieldbearer must attack it. Bombers explode for 2 on everything around them.'],
  duel: ['The numbered beams on the board are the enemy spell: element, direction and power. They fire in order, 1 then 2 then 3. Faint tiles show where each beam is aimed.',
    'Place counters in the middle rows. For a mirror, choose ╱ or ╲ first. Tap a placed counter to take it back.',
    'A beam stops at the first creature it reaches, friend or foe. Mirrors bend it 90°, the Leech sends the first beam back 1 stronger, and prisms split it left and right.',
    'Your HP carries from duel to duel, so a cheap win that costs HP can lose you the next one.'],
  heist: ['Tap tiles next to your thief to draw a route from the exit. Tap the last tile to undo a step, or press Wait to stand still for a step.',
    'Use ◀ ▶ to preview each step: where the guards walk and what they see (red). The route must pass the relic and end back at the exit within the step limit.',
    'Guards see 3 tiles straight ahead. Hounds smell the 4 tiles around them, through smoke and shadow. Walls and locked doors block sight.',
    'Smoke and the Shadow Draught trigger when your route reaches them. Darts go on a guard, keys on a door, the decoy on open floor.'],
};

// ---------------------------------------------------------------- loop shell
function makeLoop(G, root) {
  const L = { G, root, loopNo: 1, idx: 0, seen: new Set([0]), satchel: {}, persist: {}, placements: [], route: [], sel: null, dirIdx: 0,
    phase: 'setup', frames: null, fi: 0, res: null, msg: '', preview: 0, timer: null, history: [] };
  L.newLoop = () => { L.idx = 0; L.satchel = { ...G.satchel }; L.persist = G.persist ? { ...G.persist } : {}; L.history = []; startEnc(L); };
  L.newLoop();
  return L;
}
function startEnc(L) {
  const G = L.G; L.enc = G.encounters[L.idx];
  L.placements = []; L.sel = null; L.phase = 'setup'; L.frames = null; L.res = null; L.fi = 0; L.preview = 0;
  if (G.route) L.route = [Heist.exit(L.enc)];
  L.msg = `${L.enc.name}: ${L.enc.goal}`;
  computeIntent(L);
}
const avail = (L, k) => (L.satchel[k] || 0) - L.placements.filter((p) => p.k === k).length;
function computeIntent(L) {
  if (L.G !== Duel) return;
  const set = new Set(), enc = L.enc;
  for (const b of enc.beams) {
    let [r, c] = [b.r, b.c]; const [dr, dc] = ARROW[b.dir];
    for (;;) { r += dr; c += dc; if (r < 0 || r >= 7 || c < 0 || c >= 6) break; if (enc.walls.some(([wr, wc]) => wr === r && wc === c)) break; set.add(r * 6 + c); if (enc.foes.some(([, fr, fc]) => fr === r && fc === c) || (enc.you[0] === r && enc.you[1] === c)) break; }
  }
  L.intent = set;
}
function setupState(L) {
  const G = L.G;
  if (G === Heist) { const f = G.sim(L.enc, L.placements, null, L.route, false).frames; return f[Math.min(L.preview, f.length - 1)].st; }
  return G.setupState(L.enc, L.placements, L.persist);
}
function removeAt(L, r, c) {
  const i = L.placements.map((p, j) => (p.r === r && p.c === c ? j : -1)).filter((j) => j >= 0).pop();
  if (i == null) return false;
  const p = L.placements[i];
  if (L.G.items[p.k].unit) L.placements = L.placements.filter((q) => !(q.r === r && q.c === c));
  else L.placements.splice(i, 1);
  L.msg = `${L.G.items[p.k].name} returned to your satchel.`;
  return true;
}
function tap(L, r, c) {
  const G = L.G, enc = L.enc;
  if (L.phase !== 'setup') return;
  if (G === Heist && !L.sel) {
    const rt = L.route, last = rt[rt.length - 1];
    if (last[0] === r && last[1] === c && rt.length > 1) {
      rt.pop(); L.placements = L.placements.filter((p) => !((p.k === 'smoke' || p.k === 'invis') && !rt.some(([a, b], i) => i > 0 && a === p.r && b === p.c)));
      L.preview = rt.length - 1; L.msg = 'Step removed.';
    } else if (Math.abs(last[0] - r) + Math.abs(last[1] - c) === 1 && G.passable(enc, L.placements, r, c)) {
      if (rt.length - 1 >= enc.maxSteps) L.msg = `That’s all ${enc.maxSteps} steps. Dawn comes after that.`;
      else { rt.push([r, c]); L.preview = rt.length - 1; L.msg = `Step ${rt.length - 1} of ${enc.maxSteps}.`; }
    } else if (removeAt(L, r, c)) { /* removed */ } else L.msg = G.describe(enc, L.placements, r, c);
    return render(L);
  }
  if (!L.sel) { if (!removeAt(L, r, c)) L.msg = G.describe(enc, L.placements, r, c); return render(L); }
  const k = L.sel;
  if (avail(L, k) <= 0) { L.sel = null; L.msg = 'None left.'; return render(L); }
  const ok = G.canPlace(enc, L.placements, k, r, c, L.route);
  if (ok !== true) { if (!removeAt(L, r, c)) L.msg = ok; return render(L); }
  L.placements.push({ k, r, c, dir: G.items[k].dirs ? G.items[k].dirs[L.dirIdx] : undefined });
  L.msg = `${G.items[k].name} placed. Tap it to take it back.`;
  if (avail(L, k) <= 0) L.sel = null;
  render(L);
}
function unleash(L) {
  const G = L.G;
  L.res = G === Heist ? G.sim(L.enc, L.placements, null, L.route, true) : G.sim(L.enc, L.placements, L.persist);
  L.frames = L.res.frames; L.fi = 0; L.phase = 'resolving'; L.sel = null;
  play(L);
}
function play(L) {
  clearTimeout(L.timer);
  render(L);
  if (L.fi >= L.frames.length - 1) { L.timer = setTimeout(() => finish(L), 500); return; }
  L.timer = setTimeout(() => { L.fi++; play(L); }, L.G.frameMs);
}
function skip(L) { clearTimeout(L.timer); L.fi = L.frames.length - 1; finish(L); }
function finish(L) {
  if (L.phase !== 'resolving') return;
  const G = L.G, res = L.res;
  for (const p of L.placements) L.satchel[p.k]--;
  for (const [k, n] of Object.entries(res.returned || {})) L.satchel[k] += n;
  if (res.persist) L.persist = res.persist;
  L.history.push({ name: L.enc.name, win: res.win });
  if (!res.win) L.phase = 'failed';
  else if (L.idx === G.encounters.length - 1) L.phase = 'complete';
  else L.phase = 'reward';
  L.fi = L.frames.length - 1;
  render(L);
}
function replay(L) { L.phase = 'replay'; L.fi = 0; const step = () => { render(L); if (L.fi < L.frames.length - 1) { L.fi++; L.timer = setTimeout(step, L.G.frameMs); } else L.timer = setTimeout(() => { L.phase = 'failed'; render(L); }, 600); }; step(); }
function takeReward(L, k) { L.satchel[k] = (L.satchel[k] || 0) + 1; L.idx++; L.seen.add(L.idx); startEnc(L); render(L); }
function restartLoop(L) { clearTimeout(L.timer); L.loopNo++; L.newLoop(); render(L); }

function render(L) {
  const G = L.G, enc = L.enc, root = L.root;
  const st = L.phase === 'setup' ? setupState(L) : L.frames[L.fi].st;
  const track = el('div', { class: 'track' }, G.encounters.map((e, i) => {
    const state = i < L.idx ? 'done' : i === L.idx ? 'now' : '';
    return el('span', { class: 'step ' + state }, `${i + 4}. ${i < L.idx ? '✓ ' : ''}${L.seen.has(i) ? e.name : '???'}`);
  }));
  const stats = [stat('Loop', L.loopNo, 'gold')];
  if (G === Duel) stats.push(stat('Your HP', `${(L.phase === 'setup' ? L.persist.hp : st.units.find((u) => u.type === 'you').hp)}/6`, 'good'), stat(DUEL_FOES[enc.foes[0][0]].name, st.units[0].hp, 'bad'));
  if (G === Ambush) stats.push(stat('Marching order', enc.enemies.map((e) => AMBUSH_UNITS[e.type].icon).join(''), 'bad'));
  if (G === Vanguard) stats.push(stat('Deployed', `${L.placements.filter((p) => G.items[p.k].unit).length}/${G.deploy}`, 'gold'));
  if (G === Heist) stats.push(stat('Steps', `${L.route.length - 1}/${enc.maxSteps}`, 'gold'), stat('Showing step', L.phase === 'setup' ? L.preview : st.t, ''));
  if (L.phase !== 'setup') stats.push(stat('Beat', `${L.fi + 1}/${L.frames.length}`, ''));

  let top;
  if (L.phase === 'reward') top = el('div', { class: 'result win' }, el('strong', {}, 'Victory'), el('span', {}, L.res.reason + ' Pick one thing you found to keep:'),
    el('div', { class: 'actions' }, enc.reward.map((k) => btn(`${G.items[k].icon} ${G.items[k].name}`, () => takeReward(L, k), { primary: true }))));
  else if (L.phase === 'failed') top = el('div', { class: 'result lose' }, el('strong', {}, 'The loop resets to dusk'), el('span', {}, `${L.res.reason} Everything you used is gone; your satchel goes back to how it was at fight 4. You remember what you saw.`),
    el('div', { class: 'actions' }, btn('Restart loop', () => restartLoop(L), { primary: true }), btn('Watch again', () => replay(L))));
  else if (L.phase === 'complete') top = el('div', { class: 'result win' }, el('strong', {}, 'Loop broken!'), el('span', {}, `${L.res.reason} You cleared fights 4–6 on loop ${L.loopNo}. In the full game you would push on to fight 7.`),
    el('div', { class: 'actions' }, btn('Play the loop again', () => { L.loopNo = 0; L.seen = new Set([0]); restartLoop(L); }, { primary: true })));
  else top = el('p', { class: 'msg', 'aria-live': 'polite' }, L.phase === 'setup' ? L.msg : (L.frames[L.fi].log || '…'));

  const board = boardEl(G.R, G.C, (r, c) => {
    const s = RENDER[G.key](st, r, c, L);
    if (L.phase === 'setup' && L.sel && G.canPlace(enc, L.placements, L.sel, r, c, L.route) === true) s.cls += ' target';
    if (L.phase === 'setup' && G === Heist && !L.sel) { const last = L.route[L.route.length - 1]; if (Math.abs(last[0] - r) + Math.abs(last[1] - c) === 1 && G.passable(enc, L.placements, r, c)) s.cls += ' target'; }
    return s;
  }, (r, c) => tap(L, r, c));

  const setup = L.phase === 'setup';
  const items = el('div', { class: 'satchel' }, el('h3', {}, 'Satchel (everything you have left this loop)'),
    Object.keys(G.items).map((k) => {
      const n = setup ? avail(L, k) : L.satchel[k] || 0;
      if (!(L.satchel[k] > 0) && !L.placements.some((p) => p.k === k)) return null;
      return el('button', { class: 'item', 'aria-pressed': L.sel === k ? 'true' : 'false', disabled: !setup || n <= 0,
        onclick: () => { L.sel = L.sel === k ? null : k; L.msg = G.items[k].info; render(L); } },
      G.anchored.includes(k) ? el('span', { class: 'anc', title: 'Carried over from an earlier loop' }, '⚓') : null,
      el('span', { class: 'ct' }, '×' + n), el('span', { class: 'ic' }, G.items[k].icon), el('span', { class: 'nm' }, G.items[k].name));
    }));
  const extra = [];
  if (setup && L.sel && G.items[L.sel].dirs) extra.push(el('div', { class: 'actions' }, el('span', { class: 'sub' }, 'Direction:'),
    G.items[L.sel].dirs.map((d, i) => el('button', { class: 'btn' + (L.dirIdx === i ? ' primary' : ''), onclick: () => { L.dirIdx = i; render(L); } }, d === '/' ? '╱' : d === '\\' ? '╲' : d))));
  if (setup && G === Heist) extra.push(el('div', { class: 'actions' },
    btn('◀', () => { L.preview = Math.max(0, L.preview - 1); render(L); }), btn('▶', () => { L.preview = Math.min(Math.max(L.route.length - 1, 20), L.preview + 1); render(L); }),
    btn('Wait a step', () => { if (L.route.length - 1 >= enc.maxSteps) { L.msg = 'No steps left.'; } else { L.route.push(L.route[L.route.length - 1].slice()); L.preview = L.route.length - 1; L.msg = 'You wait one step.'; } render(L); }),
    btn('Clear route', () => { L.route = [L.route[0]]; L.placements = L.placements.filter((p) => p.k !== 'smoke' && p.k !== 'invis'); L.preview = 0; render(L); })));

  const actions = el('div', { class: 'actions' },
    setup ? btn('Unleash', () => unleash(L), { primary: true }) : null,
    setup && (L.placements.length || (G === Heist && L.route.length > 1)) ? btn('Clear all', () => { L.placements = []; if (G === Heist) { L.route = [L.route[0]]; L.preview = 0; } render(L); }) : null,
    L.phase === 'resolving' ? btn('Skip to the end', () => skip(L)) : null,
    setup ? btn('Restart loop', () => restartLoop(L)) : null);

  root.replaceChildren(...[
    el('h2', {}, G.title), el('p', { class: 'tagline' }, G.tagline),
    track, el('div', { class: 'stats' }, stats),
    el('div', { class: 'objective' }, el('b', {}, `Fight ${L.idx + 4} · ${enc.name}`), ' ', enc.goal),
    top, board, setup ? items : null, ...extra, actions,
    el('details', { class: 'help' }, el('summary', {}, 'How to play'), el('ul', {}, HELP[G.key].map((l) => el('li', { html: l })))),
  ].filter(Boolean));
}

// ---------------------------------------------------------------- tabs
const LOOPS = {};
for (const [k, G] of Object.entries(ONE_TURN_GAMES)) LOOPS[k] = makeLoop(G, document.getElementById('game-' + k));
function show(key) {
  if (!LOOPS[key]) key = 'spark';
  for (const k of Object.keys(LOOPS)) { document.getElementById('game-' + k).hidden = k !== key; $tab(k).setAttribute('aria-selected', String(k === key)); }
  render(LOOPS[key]);
  try { localStorage.setItem('one-turn-tab', key); } catch (e) { /* storage unavailable */ }
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.game)));
let firstTab = location.hash.slice(1);
if (!LOOPS[firstTab]) { try { firstTab = localStorage.getItem('one-turn-tab') || ''; } catch (e) { firstTab = ''; } }
show(firstTab);
