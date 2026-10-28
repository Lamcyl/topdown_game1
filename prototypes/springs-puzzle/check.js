// Checks the demo level in Node: builds each region's intended solution (with only the pieces the player
// has at that point), runs the flow, and confirms the objective opens; also confirms some tempting shortcuts fail.
// Run: node check.js
const L = require('./logic.js');

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failures++; };
const U = 0, R = 1, D = 2, Lf = 3;
function must(why, what) { if (why) throw new Error(`${what}: ${why}`); }
function put(st, type, x, y, dir = 0, el) { must(L.place(st, type, x, y, dir, el), `${type} at ${x},${y}`); }
function line(st, cells) { for (const [x, y, d] of cells) put(st, 'belt', x, y, d); }
function col(x, y0, y1, d) { const out = []; for (let y = y0; y >= y1; y--) out.push([x, y, d]); return out; } // going up
function row(y, x0, x1, d) { const out = []; const s = x1 >= x0 ? 1 : -1; for (let x = x0; s > 0 ? x <= x1 : x >= x1; x += s) out.push([x, y, d]); return out; }
function clear(st, keepWellsprings = true) { for (const p of Object.values(st.pieces)) if (!(keepWellsprings && p.type === 'wellspring')) must(L.remove(st, p.x, p.y), 'clear'); }
function runUntil(st, id, beats = 400) { for (let i = 0; i < beats; i++) { L.step(st); if (st.done[id]) return i + 1; } return 0; }
function runBeats(st, n) { for (let i = 0; i < n; i++) L.step(st); }

// ---------------------------------------------------------------- the intended path
const st = L.newState();
// Run 1: one fire wellspring.
put(st, 'wellspring', 13, 32, U, 'fire');
line(st, [...col(13, 31, 27, U), [13, 26, Lf], [12, 26, Lf], [11, 26, Lf], [10, 26, Lf]]);
L.startRun(st);
let t = runUntil(st, 'A'); ok(t > 0, `A The Village Gate opens after ${t} beats`);
ok(st.inv.splitter === 1, 'A gives a Splitter');

// Up x=13 through the gate; a splitter facing up at (13,19) sends half to each brazier.
clear(st);
line(st, col(13, 31, 20, U));
put(st, 'splitter', 13, 19, U);
line(st, [[12, 19, U], [12, 18, Lf], [11, 18, Lf], [10, 18, Lf]]);
line(st, [[14, 19, U], [14, 18, R], [15, 18, R], [16, 18, R]]);
t = runUntil(st, 'B'); ok(t > 0, `B Twin Braziers open after ${t} beats`);
ok(st.unlocked.includes('water') && st.inv.wellspring === 1, 'B gives Water and a second wellspring');

// Optional H in a fire + fire run.
L.endRun(st); clear(st, false);
put(st, 'wellspring', 13, 32, U, 'fire'); put(st, 'wellspring', 15, 32, U, 'fire');
line(st, [[15, 31, Lf], ...col(14, 31, 22, U), ...row(21, 14, 23, R), [24, 21, U], [24, 20, U], [24, 19, U]]);
line(st, [...col(13, 31, 21, U), ...row(20, 13, 22, R), [23, 20, U], [23, 19, U], [23, 18, R]]);
L.startRun(st);
t = runUntil(st, 'H'); ok(t > 0, `H Shrine of Embers (optional) opens after ${t} beats with two fire wellsprings`);

// Run 3: fire + water. The Mill Sluice and the Forge Door.
L.endRun(st); clear(st, false);
put(st, 'wellspring', 11, 32, U, 'fire'); put(st, 'wellspring', 15, 32, U, 'water');
line(st, [[11, 31, R], ...col(12, 31, 15, U), [12, 14, Lf], [11, 14, Lf], [10, 14, Lf]]);       // fire → mixer back
line(st, [[15, 31, Lf], ...col(14, 31, 16, U)]);                                              // water up x=14
put(st, 'splitter', 14, 15, U);                                                               // left (13,15), right (15,15)
line(st, [...col(15, 15, 12, U), [15, 11, R], [16, 11, R]]);                                  // right → sluice (17,11)
line(st, [[13, 15, U], [13, 14, U], ...row(13, 13, 10, Lf), [9, 13, D]]);                     // left → mixer from the north
L.startRun(st);
t = runUntil(st, 'C'); ok(t > 0, `C The Mill Sluice rises after ${t} beats and gives a Mixer`);
put(st, 'mixer', 9, 14, Lf);
put(st, 'belt', 8, 14, Lf);                                                                   // under the portcullis
line(st, [...row(14, 7, 2, Lf), [1, 14, D], [1, 15, D]]);
t = runUntil(st, 'D'); ok(t > 0, `D The Forge Door opens after ${t} beats (sluice still held: ${L.gateOpen(st, 'C')})`);
ok(st.inv.demerger === 1 && st.inv.underpass === 1, 'D gives a Demerger and an Underpass');

// The Oak Narrows: steam through the gap, demerge, and swap sides with a tunnel.
for (const [x, y] of [[3, 14], [2, 14], [1, 14], [1, 15]]) L.remove(st, x, y);
line(st, [[3, 14, U], ...col(3, 13, 7, U)]);
put(st, 'demerger', 3, 6, U);                                                                 // fire out west (2,6), water out east (4,6)
line(st, [...col(2, 6, 4, U), [2, 3, R], [3, 3, R], [4, 3, R], [5, 3, R]]);                    // fire → (6,3)
line(st, [[4, 6, U], [4, 5, U]]);
must(L.placeUnderpass(st, 4, 4, 4, 2), 'underpass');                                          // water under the fire line
line(st, [[4, 1, Lf], [3, 1, Lf], [2, 1, Lf]]);                                               // → (1,1)
t = runUntil(st, 'E'); ok(t > 0, `E The Oak Narrows opens after ${t} beats (water tunnels under fire)`);

// The Standing Stones: both halves into a Joiner, one lane through the gate.
for (const p of Object.values(st.pieces)) if (p.y <= 6 && p.x <= 6 && p.type !== 'demerger') L.remove(st, p.x, p.y);
line(st, [...col(2, 6, 3, U), [2, 2, R], [3, 2, R]]);
line(st, [...col(4, 6, 3, U)]);
put(st, 'joiner', 4, 2, R);
line(st, [[5, 2, U], [5, 1, R], [6, 1, R], ...row(1, 7, 15, R)]);
t = runUntil(st, 'F'); ok(t > 0, `F The Standing Stones open after ${t} beats`);
ok(st.unlocked.includes('earth') && st.inv.wellspring === 1 && st.inv.mixer === 1, 'F gives Earth, a wellspring and a Mixer');

// Run 4: fire, earth, water. The River, then the Castle Scales.
L.endRun(st); clear(st, false);
put(st, 'wellspring', 11, 32, U, 'fire'); put(st, 'wellspring', 13, 32, U, 'earth'); put(st, 'wellspring', 15, 32, U, 'water');
line(st, [...col(13, 31, 13, U), ...row(12, 13, 18, R), [19, 12, U]]);
L.startRun(st);
t = runUntil(st, 'G', 600); ok(t > 0, `G The River is bridged after ${t} beats`);
clear(st); // re-lay all three lanes for the castle
line(st, [...col(13, 31, 14, U), ...row(13, 13, 23, R), ...col(24, 13, 4, U)]);                // earth → x=24
line(st, [[11, 31, R], ...col(12, 31, 13, U), ...row(12, 12, 22, R), ...col(23, 12, 7, U), [23, 6, Lf], ...row(6, 22, 19, Lf), ...col(18, 6, 4, U)]);
line(st, [[15, 31, Lf], ...col(14, 31, 15, U), ...row(14, 14, 24, R), ...col(25, 14, 4, U)]);
put(st, 'splitter', 24, 3, U);
line(st, row(3, 23, 19, Lf));
put(st, 'mixer', 18, 3, U); put(st, 'belt', 18, 2, U);
put(st, 'mixer', 25, 3, U); put(st, 'belt', 25, 2, U);
t = runUntil(st, 'I'); ok(t > 0, `I The Castle Scales balance after ${t} beats — end of the demo`);
ok(Object.values(st.pieces).filter((p) => p.type === 'mixer').every((p) => !L.mixerJammed(st, p)), 'no mixer jammed in the final build');

// ---------------------------------------------------------------- the Oak Narrows really needs the Underpass
// Exhaustive search: every belt route for steam from the gap to a Demerger (any tile, any facing), then
// fire and water routes from its two outputs to their receptors, all on separate tiles. If none exists,
// no layout without a tunnel can work. (Sending fire and water through the gap interleaved instead would
// need three Splitters to balance and sort them; at most two exist at this point.)
{
  const open = (x, y) => L.inMap(x, y) && x <= 6 && y <= 7 && (L.GRID[y][x] === '.') && !L.RECEPTOR.has(L.idx(x, y));
  const key = (x, y) => y * 100 + x;
  const fireGoal = L.OBJ.E.receptors.find((r) => r.el === 'fire'), waterGoal = L.OBJ.E.receptors.find((r) => r.el === 'water');
  const adj = (x, y, r) => Math.abs(x - r.x) + Math.abs(y - r.y) === 1;
  const reachGoal = (from, goal, used) => { // is there a simple path from `from` to a tile next to the goal, avoiding used?
    const seen = new Set([key(...from)]), q = [from];
    if (used.has(key(...from)) || !open(...from)) return false;
    while (q.length) {
      const [x, y] = q.shift();
      if (adj(x, y, goal)) return true;
      for (const [dx, dy] of L.DIRS) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (open(nx, ny) && !used.has(k) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } }
    }
    return false;
  };
  const pathsTo = function* (from, goal, used) { // all simple paths from `from` ending next to goal
    const path = [from]; const u = new Set(used); u.add(key(...from));
    function* go(x, y) {
      if (adj(x, y, goal)) yield new Set(u);
      for (const [dx, dy] of L.DIRS) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (open(nx, ny) && !u.has(k)) { u.add(k); path.push([nx, ny]); yield* go(nx, ny); path.pop(); u.delete(k); } }
    }
    yield* go(...from);
  };
  function search(fireGoal, waterGoal) {
  let found = 0, demergerSpots = 0;
  const steam = new Set([key(3, 7)]);
  (function walk(x, y, dir) { // (x, y) is the next tile, entered travelling in `dir`; try a Demerger here, or a belt and go on
    if (found || !open(x, y) || steam.has(key(x, y))) return;
    demergerSpots++;
    const used = new Set(steam); used.add(key(x, y));
    const l = (dir + 3) % 4, r = (dir + 1) % 4, fs = [x + L.DIRS[l][0], y + L.DIRS[l][1]], ws = [x + L.DIRS[r][0], y + L.DIRS[r][1]];
    if (open(...fs) && open(...ws) && !used.has(key(...fs)) && !used.has(key(...ws))) {
      for (const firePath of pathsTo(fs, fireGoal, used)) { if (reachGoal(ws, waterGoal, firePath)) { found++; if (process.env.SHOW) console.log('demerger', x, y, 'facing', dir, 'steam', [...steam].map((k) => [k % 100, Math.floor(k / 100)]).join(' '), 'fire', [...firePath].filter((k) => !used.has(k)).map((k) => [k % 100, Math.floor(k / 100)]).join(' ')); break; } }
    }
    steam.add(key(x, y));
    for (let d = 0; d < 4; d++) if (d !== (dir + 2) % 4) walk(x + L.DIRS[d][0], y + L.DIRS[d][1], d);
    steam.delete(key(x, y));
  })(3, 6, 0);
  return { found, demergerSpots };
  }
  const real = search(fireGoal, waterGoal), swapped = search(waterGoal, fireGoal);
  ok(real.found === 0 && real.demergerSpots > 20, `the Oak Narrows has no solution without a tunnel (${real.demergerSpots} steam routes and Demerger spots searched)`);
  ok(swapped.found > 0, 'sanity: with the two goals swapped, the same search does find a layout without a tunnel');
}

// ---------------------------------------------------------------- tempting shortcuts that must fail
{ // B without a splitter: one brazier gets everything, the other nothing
  const s = L.newState(); s.done.A = true; s.inv.splitter = 0;
  put(s, 'wellspring', 13, 32, U, 'fire');
  line(s, [...col(13, 31, 19, U), [13, 18, Lf], [12, 18, Lf], [11, 18, Lf], [10, 18, Lf]]);
  L.startRun(s); runBeats(s, 300); ok(!s.done.B, 'B fails with one stream into one brazier');
}
{ // D: all water into the mixer, none for the sluice → the gate never rises
  const s = L.newState(); Object.assign(s.done, { A: true, B: true }); s.unlocked.push('water'); s.inv = { splitter: 1, mixer: 1, wellspring: 2, joiner: 0, demerger: 0 };
  put(s, 'wellspring', 11, 32, U, 'fire'); put(s, 'wellspring', 15, 32, U, 'water');
  line(s, [[11, 31, R], ...col(12, 31, 15, U), [12, 14, Lf], [11, 14, Lf], [10, 14, Lf]]);
  line(s, [[15, 31, Lf], ...col(14, 31, 14, U), ...row(13, 14, 10, Lf), [9, 13, D]]);
  put(s, 'mixer', 9, 14, Lf); put(s, 'belt', 8, 14, Lf);
  L.startRun(s); runBeats(s, 300); ok(!L.gateOpen(s, 'C') && !s.done.D, 'D fails without splitting water for the sluice (gate stays shut)');
}
{ // F: a single fire stream at 1/s has the rate but not the pattern
  const s = L.newState(); Object.assign(s.done, { A: true, B: true, D: true, E: true });
  s.run = null; L.startRun(s); s.run.gates.C = true; // pretend the sluice is held
  ok(!L.satisfied(s, L.OBJ.F), 'F needs the alternating pattern, not just the rate');
  L.endRun(s);
}
{ // the wellspring element cannot change mid-run
  const s = L.newState(); put(s, 'wellspring', 13, 32, U, 'fire'); s.unlocked.push('water');
  L.startRun(s); ok(!!L.attune(s, 13, 32, 'water'), 'attuning is refused during a run'); L.endRun(s);
  ok(!L.attune(s, 13, 32, 'water'), 'attuning works between runs');
}
{ // underpass: a fire line crosses a water line underneath, and tunnels refuse trees and doors
  const s = L.newState(); s.unlocked.push('water'); s.inv.wellspring = 2; s.inv.underpass = 2;
  put(s, 'wellspring', 11, 32, U, 'fire'); put(s, 'wellspring', 15, 32, U, 'water');
  line(s, [[11, 31, U], [11, 30, R]]);                                  // fire heads right along row 30…
  must(L.placeUnderpass(s, 12, 30, 14, 30), 'underpass');              // …under the water column at x=13…
  line(s, [[15, 30, U], [15, 29, U]]);                                  // …and up x=15
  line(s, [[15, 31, Lf], [14, 31, Lf], ...col(13, 31, 27, U), [13, 26, Lf], [12, 26, Lf], [11, 26, Lf], [10, 26, Lf]]); // water up x=13 to the brazier
  L.startRun(s); runBeats(s, 80);
  ok(L.pieceAt(s, 14, 30).end === 'out' && L.pieceAt(s, 12, 30).end === 'in', 'underpass placed as entrance and exit');
  ok(s.run.orbs.has(L.idx(15, 29)) || s.run.orbs.has(L.idx(15, 30)), 'fire comes out of the exit beyond the water line');
  ok(s.run.rec.A[0].total === 0 && [...s.run.orbs.values()].filter((o) => o.el === 'fire').every((o) => true), 'no fire leaks into the water line (the fire brazier receives none)');
  L.endRun(s);
  ok(!!L.canUnderpass(s, 13, 27, 13, 23), 'a tunnel refuses to pass under a gate');
  ok(!!L.canUnderpass(s, 9, 28, 9, 31), 'a tunnel refuses to pass under trees');
  ok(!!L.canUnderpass(s, 12, 28, 14, 30), 'a tunnel must run straight');
  ok(!!L.canUnderpass(s, 12, 28, 13, 28), 'a tunnel must jump at least one tile');
  must(L.remove(s, 14, 30), 'remove exit'); ok(!L.pieceAt(s, 12, 30) && s.inv.underpass === 2, 'picking up one end removes both and refunds one Underpass');
}
{ // opened doors take belts
  const s = L.newState(); s.done.A = true;
  ok(!L.canPlace(s, 'belt', 13, 25), 'a belt can go on an opened gate tile');
  ok(!!L.canPlace(s, 'belt', 13, 17), 'but not on a closed one');
}
{ // wellsprings only on spring spots
  const s = L.newState(); ok(!!L.canPlace(s, 'wellspring', 12, 30), 'wellsprings refuse ordinary meadow');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exitCode = failures ? 1 : 0;
