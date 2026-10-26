// Orbforge prototype: page. Level select, building, playback, carry-over tiles, recipe book.
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
const btn = (label, onclick, opts = {}) => el('button', { class: 'btn' + (opts.primary ? ' primary' : '') + (opts.small ? ' small' : ''), onclick, disabled: opts.disabled }, label);
const badge = (txt, cls = '') => `<span class="badge ${cls}">${txt}</span>`;
const SPECIALS = ['fuser', 'amp', 'lens', 'splitter', 'delay'];
const ROTATE = { '↑': '→', '→': '↓', '↓': '←', '←': '↑' };

// ---------------------------------------------------------------- saved progress
const SAVE_KEY = 'orbforge-proto-v1';
let save = { best: {}, layouts: {}, known: [], sandbox: null };
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) save = { ...save, ...JSON.parse(raw) }; } catch (e) { /* storage unavailable */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable */ } };
// best[i] = { stars, left: {tile: n} } — tiles left over from the best clear of level i
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
function startInventory(i) {
  const inv = {};
  if (i > 0 && save.best[i - 1]) for (const [k, n] of Object.entries(save.best[i - 1].left)) inv[k] = (inv[k] || 0) + n;
  for (const [k, n] of Object.entries(LEVELS[i].grant)) inv[k] = (inv[k] || 0) + n;
  return inv;
}
const unlocked = (i) => i === 0 || !!save.best[i - 1];

// ---------------------------------------------------------------- sandbox: every tile, every element, training dummies
const DUMMIES = {
  none: { label: 'Empty', e: null },
  plain: { label: 'Training Dummy', e: { type: 'dummy', hp: 99 } },
  armored: { label: 'Armoured (🛡️3)', e: { type: 'dummy', hp: 99, armor: 3 } },
  warded: { label: 'Fire-warded', e: { type: 'dummy', hp: 99, shield: true } },
  both: { label: 'Armoured + warded', e: { type: 'dummy', hp: 99, armor: 3, shield: true } },
};
const SB = () => (save.sandbox ||= { wells: [{ el: 'fire', n: 1 }, { el: 'water', n: 1 }, { el: 'earth', n: 1 }, { el: 'air', n: 1 }], L: 'plain', R: 'armored', perWell: 1 });
function sandboxLevel() {
  const sb = SB(), enemies = {};
  for (const side of ['L', 'R']) if (DUMMIES[sb[side]].e) enemies[side] = DUMMIES[sb[side]].e;
  return { name: 'Sandbox', par: 0, map: Array(7).fill('......'), wells: sb.wells, grant: {}, enemies, sandbox: true,
    teach: ['Everything is unlocked here: all tiles (unlimited), all four elements, every recipe including tertiary ones.',
      'Add wells of any element below. Each well holds as many orbs as you choose when you add it.',
      'The dummies have 99 HP. After each play you get the damage totals and a full battle log, so you can test one tile or one combination at a time.',
      'Tertiary recipes: Magma + Steam = Eruption, Magma + Mud = Obsidian, Mud + Steam = Quagmire, Lightning + Ice = Storm.'] };
}
const isSandbox = () => S.li === 'sandbox';

// ---------------------------------------------------------------- state
const S = { view: 'levels', li: 0, layout: {}, tool: null, dir: '↑', target: 'L', last: null, msg: '', play: null, fi: 0, timer: null, result: null };
const app = document.getElementById('app');
const lvl = () => (isSandbox() ? sandboxLevel() : LEVELS[S.li]);
const keyOf = (r, c) => r + ',' + c;
function inv() { return isSandbox() ? Object.fromEntries(SPECIALS.map((k) => [k, 99])) : startInventory(S.li); }
function avail(k) { return isSandbox() ? 99 : (inv()[k] || 0) - Object.values(S.layout).filter((t) => t.t === k).length; }

function openLevel(i) {
  clearTimeout(S.timer);
  S.view = 'level'; S.li = i; S.layout = { ...(save.layouts[i] || {}) }; S.tool = null; S.last = null; S.play = null; S.result = null;
  S.target = 'L';
  S.msg = lvl().teach[0];
  render();
}
function storeLayout() { save.layouts[S.li] = S.layout; persist(); }

function tap(r, c) {
  if (S.play) return;
  const L = lvl(), k = keyOf(r, c), cur = S.layout[k];
  if (L.map[r][c] === '#') { S.msg = 'Rock. Nothing can be built here.'; return render(); }
  const tool = S.tool;
  if (!tool) {
    S.msg = cur ? (cur.t === 'well' ? `${ELEMENTS[L.wells[cur.well].el].name} well with ${L.wells[cur.well].n} orb${L.wells[cur.well].n > 1 ? 's' : ''}. It releases one every 2 beats out of its arrow.` : TILES[cur.t].info) : 'Pick something from the toolbox below, then tap here.';
    return render();
  }
  if (tool === 'erase') { if (cur) { delete S.layout[k]; S.msg = 'Removed.'; } storeLayout(); return render(); }
  // same tool on the same tile: rotate or retarget
  const sameKind = cur && (cur.t === tool || (tool.startsWith('well') && cur.t === 'well' && 'well' + cur.well === tool));
  if (sameKind) {
    if (cur.t === 'launcher') cur.target = Object.keys(L.enemies).length > 1 ? (cur.target === 'L' ? 'R' : 'L') : 'L';
    else cur.dir = ROTATE[cur.dir];
    S.msg = cur.t === 'launcher' ? `Launcher now aims at the ${cur.target === 'L' ? 'left' : 'right'} enemy.` : `Turned to ${cur.dir}.`;
    storeLayout(); return render();
  }
  let tile;
  if (tool === 'belt') tile = { t: 'belt', dir: S.dir };
  else if (tool === 'launcher') tile = { t: 'launcher', target: L.enemies[S.target] ? S.target : 'L' };
  else if (tool.startsWith('well')) {
    const wi = +tool.slice(4);
    for (const [kk, t] of Object.entries(S.layout)) if (t.t === 'well' && t.well === wi) delete S.layout[kk];
    tile = { t: 'well', well: wi, dir: S.dir };
  } else {
    if (avail(tool) <= 0 && !(cur && cur.t === tool)) { S.msg = `No ${TILES[tool].name}s left.`; return render(); }
    tile = { t: tool, dir: S.dir };
  }
  // bend the previous belt/well/tile toward this one, so taps draw a line
  if (S.last && S.layout[S.last] && S.last !== k) {
    const [pr, pc] = S.last.split(',').map(Number), prev = S.layout[S.last];
    if (Math.abs(pr - r) + Math.abs(pc - c) === 1 && prev.dir && prev.t !== 'splitter') {
      const d = r < pr ? '↑' : r > pr ? '↓' : c < pc ? '←' : '→';
      prev.dir = d; if (tile.dir && tool === 'belt') tile.dir = d;
    }
  }
  S.layout[k] = tile; S.last = k;
  S.msg = tool.startsWith('well') ? 'Well placed. Tap it again with the well selected to turn it.' : `${TILES[tile.t].name} placed. Tap it again to ${tile.t === 'launcher' ? 'switch target' : 'turn it'}.`;
  if (SPECIALS.includes(tool) && avail(tool) <= 0) S.tool = null;
  storeLayout(); render();
}

function play() {
  const L = lvl();
  const placedWells = Object.values(S.layout).filter((t) => t.t === 'well').length;
  if (!placedWells) { S.msg = 'Place at least one well first.'; return render(); }
  S.result = simulate(L, S.layout, { unlockAll: !!L.sandbox });
  S.play = S.result.frames; S.fi = 0; S.tool = null;
  for (const e of S.result.made) if (!save.known.includes(e)) save.known.push(e);
  persist();
  step();
}
function step() {
  render();
  if (S.fi >= S.play.length - 1) { S.timer = setTimeout(finish, 500); return; }
  S.timer = setTimeout(() => { S.fi++; step(); }, 420);
}
function skip() { if (!S.play) return; clearTimeout(S.timer); S.fi = S.play.length - 1; finish(); }
function finish() {
  const r = S.result, L = lvl();
  if (L.sandbox) { S.view = 'result'; render(); return; }
  if (r.win) {
    const used = sum(r.usedTiles);
    const stars = used <= L.par ? 3 : used <= L.par + 1 ? 2 : 1;
    const start = inv(), left = {};
    for (const [k, n] of Object.entries(start)) { const rem = n - (r.usedTiles[k] || 0); if (rem > 0) left[k] = rem; }
    const prev = save.best[S.li];
    const better = !prev || stars > prev.stars || (stars === prev.stars && sum(left) > sum(prev.left));
    if (better) save.best[S.li] = { stars, left, used };
    r.stars = stars; r.used = used; r.left = left; r.better = better;
    persist();
  }
  S.view = 'result'; render();
}

// ---------------------------------------------------------------- rendering
function enemyCard(side, en, fx) {
  if (!en) return el('div', { class: 'foe empty' }, el('span', { class: 'sub' }, side === 'L' ? 'Left: empty' : 'Right: empty'));
  const d = ENEMIES[en.type], pct = Math.max(0, en.hp / en.max * 100);
  const tags = [];
  if (en.armor) tags.push(`🛡️${en.armor}`);
  if (en.shield && !en.soaked) tags.push('🔥🛡️ fire shield');
  if (en.soaked) tags.push('💧 soaked');
  if (en.mired) tags.push('🟫 mired ×2');
  if (en.burn) tags.push(`🔥 burning ${en.burn.per}×${en.burn.left}`);
  return el('div', { class: 'foe' + (fx ? ' hitfx' : '') + (en.hp <= 0 ? ' dead' : '') },
    el('div', { class: 'foe-top' }, el('span', { class: 'foe-ic' }, en.hp > 0 ? d.icon : '💀'), el('div', {}, el('b', {}, d.name), el('div', { class: 'sub' }, side === 'L' ? 'Left' : 'Right'))),
    el('div', { class: 'hpbar' }, el('div', { class: 'hpfill', style: `width:${pct}%` })), el('div', { class: 'hptext' }, `${en.hp} / ${en.max} HP`),
    tags.length ? el('div', { class: 'tags' }, tags.join(' · ')) : null);
}
function boardView(frame) {
  const L = lvl(), tiles = frame ? frame.tiles : S.layout;
  const b = el('div', { class: 'board' });
  for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) {
    const k = keyOf(r, c), t = tiles[k];
    let cls = 'cell' + (L.map[r][c] === '#' ? ' rock' : '');
    let html = L.map[r][c] === '#' ? '🪨' : '';
    if (t) {
      if (t.t === 'belt') { cls += ' belt'; html = `<span class="arrow">${t.dir}</span>`; }
      else if (t.t === 'launcher') { cls += ' launch'; html = '🏹' + badge(t.target === 'L' ? '◤L' : 'R◥', 'gold'); }
      else if (t.t === 'well') { cls += ' well el-' + L.wells[t.well].el; html = ELEMENTS[L.wells[t.well].el].icon + badge(t.dir, 'dir') + badge('×' + L.wells[t.well].n, 'l top'); }
      else { cls += ' special'; html = TILES[t.t].icon + badge(t.dir, 'dir'); if (t.held) html += badge(ELEMENTS[t.held.el].icon + t.held.pow, 'l top hold'); }
    }
    if (frame) {
      const here = frame.orbs.filter((o) => o.r === r && o.c === c);
      if (here.length) { const o = here[here.length - 1]; html = `<span class="orb el-${o.el}">${ELEMENTS[o.el].icon}</span>` + badge(o.pow, 'pow') + (t && t.t !== 'belt' ? badge(t.t === 'launcher' ? '🏹' : (TILES[t.t] || {}).icon || '', 'l top') : ''); }
      if (frame.fx.includes(k)) cls += ' flash';
    } else if (S.tool && S.tool !== 'erase' && L.map[r][c] !== '#') cls += ' target';
    b.append(el('button', { class: cls, html, 'aria-label': `row ${r + 1} column ${c + 1}`, onclick: () => tap(r, c) }));
  }
  return b;
}
function toolbox() {
  const L = lvl(), box = el('div', { class: 'tools' });
  const tool = (id, icon, name, count, disabled) => el('button', { class: 'item', 'aria-pressed': S.tool === id ? 'true' : 'false', disabled,
    onclick: () => { S.tool = S.tool === id ? null : id; S.last = null; S.msg = id === 'erase' ? 'Tap a tile to clear it.' : id.startsWith('well') ? 'Tap a tile to put the well there. Placing it again moves it.' : TILES[id].info; render(); } },
  count != null ? el('span', { class: 'ct' }, count) : null, el('span', { class: 'ic' }, icon), el('span', { class: 'nm' }, name));
  box.append(el('h3', {}, L.sandbox ? 'Wells (add as many as you like)' : 'Wells (this stage only)'));
  L.wells.forEach((w, i) => { const placed = Object.values(S.layout).some((t) => t.t === 'well' && t.well === i); box.append(tool('well' + i, ELEMENTS[w.el].icon, `${ELEMENTS[w.el].name} well${placed ? ' ✓' : ''}`, '×' + w.n)); });
  if (L.sandbox) {
    const sb = SB();
    box.append(el('div', { class: 'sbrow' },
      el('span', { class: 'sub' }, 'Add a well with'),
      el('select', { id: 'sb-per', 'aria-label': 'Orbs per new well', onchange: (e) => { sb.perWell = +e.target.value; persist(); } },
        [1, 2, 3, 4].map((n) => el('option', { value: n, selected: sb.perWell === n }, `${n} orb${n > 1 ? 's' : ''}`))),
      ['fire', 'water', 'earth', 'air'].map((k) => btn(`+ ${ELEMENTS[k].icon}`, () => { sb.wells.push({ el: k, n: sb.perWell }); persist(); S.tool = 'well' + (sb.wells.length - 1); S.msg = `New ${ELEMENTS[k].name} well with ${sb.perWell} orb${sb.perWell > 1 ? 's' : ''}. Tap a tile to place it.`; render(); }, { small: true })),
      sb.wells.length ? btn('Remove last well', () => { const i = sb.wells.length - 1; for (const [kk, t] of Object.entries(S.layout)) if (t.t === 'well' && t.well === i) delete S.layout[kk]; sb.wells.pop(); S.tool = null; storeLayout(); render(); }, { small: true }) : null));
  }
  box.append(el('h3', {}, 'Free'));
  box.append(tool('belt', '⬆️', 'Belt'), tool('launcher', '🏹', 'Launcher'), tool('erase', '🧽', 'Clear'));
  const inventory = inv();
  const specials = SPECIALS.filter((k) => inventory[k]);
  if (specials.length) { box.append(el('h3', {}, L.sandbox ? 'Special tiles (unlimited in the sandbox)' : 'Your tiles (used up when an orb touches them; the rest carry over)')); for (const k of specials) box.append(tool(k, TILES[k].icon, TILES[k].name, L.sandbox ? '∞' : '×' + avail(k), avail(k) <= 0)); }
  return box;
}
function dirPicker() {
  if (!S.tool || S.tool === 'erase') return null;
  if (S.tool === 'launcher') {
    const sides = Object.keys(lvl().enemies);
    return el('div', { class: 'actions' }, el('span', { class: 'sub' }, 'Aim at:'), sides.map((s) => el('button', { class: 'btn small' + (S.target === s ? ' primary' : ''), onclick: () => { S.target = s; render(); } }, s === 'L' ? '◤ Left' : 'Right ◥')));
  }
  return el('div', { class: 'actions' }, el('span', { class: 'sub' }, 'Facing:'), ['↑', '→', '↓', '←'].map((d) => el('button', { class: 'btn small' + (S.dir === d ? ' primary' : ''), onclick: () => { S.dir = d; render(); } }, d)));
}
function recipeBook() {
  const row = (a, b, out) => {
    const known = save.known.includes(out), locked = ELEMENTS[out].locked && !known;
    return el('li', {}, `${ELEMENTS[a].icon} + ${ELEMENTS[b].icon} → `, locked ? el('span', { class: 'sub' }, '🔒 unlocks later (try it in the Sandbox)') : known ? el('span', {}, `${ELEMENTS[out].icon} ${ELEMENTS[out].name}: ${ELEMENTS[out].info}`) : el('span', { class: 'sub' }, '??? (mix it to find out)'));
  };
  return el('details', { class: 'help' }, el('summary', {}, `Recipe book (${save.known.length} found)`),
    el('ul', {},
      ['fire', 'water', 'earth'].map((e) => el('li', {}, `${ELEMENTS[e].icon} ${ELEMENTS[e].name} (${ELEMENTS[e].base}): ${ELEMENTS[e].info}`)),
      el('li', {}, `🌪️ Air (1): ${ELEMENTS.air.info} The fourth element; in the campaign it unlocks in a later chapter.`),
      el('li', {}, 'Same + same: concentrates, adding both orbs’ power.'),
      row('fire', 'water', 'steam'), row('fire', 'earth', 'magma'), row('water', 'earth', 'mud'),
      row('fire', 'air', 'lightning'), row('water', 'air', 'ice'), row('earth', 'air', 'dust'),
      row('magma', 'steam', 'eruption'), row('magma', 'mud', 'obsidian'), row('mud', 'steam', 'quagmire'), row('lightning', 'ice', 'storm')));
}

function render() {
  const L = lvl();
  if (S.view === 'levels') {
    app.replaceChildren(
      el('p', { class: 'sub' }, 'Build a little orb factory, press Play once, and see if it brings the enemy down. Retry as often as you like, even after a win. Unused tiles carry over to the next level.'),
      el('div', { class: 'levels' }, LEVELS.map((lv, i) => {
        const b = save.best[i], open = unlocked(i);
        return el('button', { class: 'lvl', disabled: !open, onclick: () => openLevel(i) },
          el('span', { class: 'num' }, i + 1), el('span', { class: 'lname' }, open ? lv.name : 'Locked'),
          el('span', { class: 'stars' }, b ? '★'.repeat(b.stars) + '☆'.repeat(3 - b.stars) : open ? 'new' : '🔒'));
      })),
      el('button', { class: 'lvl sandbox', onclick: () => openLevel('sandbox') }, el('span', { class: 'num' }, '⚗️'), el('span', { class: 'lname' }, 'Sandbox: every tile and element'), el('span', { class: 'stars' }, 'test')),
      el('div', { class: 'locked-note' }, save.best[5] ? '✨ Level 6 cleared. In the full game this unlocks tertiary recipes; the fourth element 🌪️ arrives in chapter 2.' : 'Tertiary recipes unlock after level 6. The fourth element 🌪️ comes in a later chapter.'),
      recipeBook(),
      btn('Reset all progress', () => { save = { best: {}, layouts: {}, known: [], sandbox: null }; persist(); render(); }, { small: true }));
    return;
  }
  const frame = S.play ? S.play[S.fi] : null;
  const enemies = frame ? frame.enemies : makeEnemies(L);
  const fx = frame ? frame.fx : [];
  const head = el('div', { class: 'lvlhead' }, btn('← Levels', () => { clearTimeout(S.timer); S.view = 'levels'; S.play = null; render(); }, { small: true }),
    el('h2', {}, L.sandbox ? 'Sandbox' : `${S.li + 1}. ${L.name}`));
  const foes = el('div', { class: 'foes' }, enemyCard('L', enemies.L, fx.includes('enemy-L')), enemyCard('R', enemies.R, fx.includes('enemy-R')));
  let top;
  const sbFoes = L.sandbox && !S.play ? el('div', { class: 'sbrow' }, ['L', 'R'].map((side) => el('label', { class: 'sub' }, side === 'L' ? 'Left: ' : 'Right: ',
    el('select', { id: 'sb-' + side, onchange: (e) => { SB()[side] = e.target.value; persist(); for (const t of Object.values(S.layout)) if (t.t === 'launcher' && !sandboxLevel().enemies[t.target]) t.target = Object.keys(sandboxLevel().enemies)[0] || 'L'; render(); } },
      Object.entries(DUMMIES).map(([k, d]) => el('option', { value: k, selected: SB()[side] === k }, d.label)))))) : null;
  if (S.view === 'result' && L.sandbox) {
    const last = S.play[S.play.length - 1].enemies;
    const lines = S.play.map((f) => (f.log ? `Beat ${Math.max(0, f.beat + 1)}: ${f.log}` : null)).filter(Boolean);
    top = el('div', { class: 'result win' }, el('strong', {}, 'Damage dealt'),
      el('span', {}, ['L', 'R'].filter((s) => last[s]).map((s) => `${s === 'L' ? 'Left' : 'Right'}: ${last[s].taken || 0}`).join(' · ') || 'No targets.'),
      S.result.made.length ? el('span', { class: 'sub' }, 'Made this run: ' + S.result.made.map((e) => `${ELEMENTS[e].icon} ${ELEMENTS[e].name}`).join(', ')) : null,
      el('details', { class: 'log' }, el('summary', {}, `Battle log (${lines.length} beats)`), el('ol', {}, lines.map((l) => el('li', {}, l)))),
      el('div', { class: 'actions' }, btn('Edit and play again', () => { S.view = 'level'; S.play = null; render(); }, { primary: true }), btn('Watch again', () => { S.view = 'level'; S.fi = 0; step(); })));
  } else if (S.view === 'result') {
    const r = S.result;
    top = r.win
      ? el('div', { class: 'result win' }, el('strong', {}, `Victory ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}`),
        el('span', {}, `Tiles used: ${r.used} (par ${L.par}). ${sum(r.left) ? `Carrying over: ${Object.entries(r.left).map(([k, n]) => `${TILES[k].icon}×${n}`).join(' ')}.` : 'Nothing left to carry over.'}${r.better ? '' : ' (Your earlier result was better, so that one counts.)'}`),
        el('div', { class: 'actions' }, S.li < LEVELS.length - 1 ? btn('Next level', () => openLevel(S.li + 1), { primary: true }) : btn('Back to levels', () => { S.view = 'levels'; S.play = null; render(); }, { primary: true }),
          btn('Retry', () => { S.view = 'level'; S.play = null; render(); })))
      : el('div', { class: 'result lose' }, el('strong', {}, 'Not this time'), el('span', {}, r.reason + ' Your layout is still here. Adjust it and try again.'),
        el('div', { class: 'actions' }, btn('Retry', () => { S.view = 'level'; S.play = null; render(); }, { primary: true }), btn('Watch again', () => { S.view = 'level'; S.fi = 0; step(); })));
  } else top = el('p', { class: 'msg', 'aria-live': 'polite' }, frame ? (frame.log || `Beat ${frame.beat + 1}`) : S.msg);
  const teach = S.play ? null : el('details', { class: 'help', open: L.sandbox ? !save.layouts.sandbox : S.li < 5 && !save.best[S.li] }, el('summary', {}, 'How this level works'), el('ul', {}, L.teach.map((t) => el('li', {}, t))));
  app.replaceChildren(...[head, foes, sbFoes, top, boardView(frame),
    S.play ? (S.view === 'result' ? null : el('div', { class: 'actions' }, el('span', { class: 'sub' }, `Beat ${Math.max(0, frame.beat + 1)}`), btn('Skip to the end', skip, { small: true })))
      : el('div', { class: 'actions' }, btn('▶ Play', play, { primary: true }), btn('Clear board', () => { S.layout = {}; storeLayout(); S.msg = 'Board cleared.'; render(); }, { small: true })),
    S.play ? null : dirPicker(), S.play ? null : toolbox(), teach, recipeBook()].filter(Boolean));
}
render();
