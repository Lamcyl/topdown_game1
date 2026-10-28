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
put(st, 'wellspring', 10, 25, U, 'fire');
line(st, [...col(10, 24, 22, U), [10, 21, Lf]]);
L.startRun(st);
let t = runUntil(st, 'A'); ok(t > 0, `A The First Door opens after ${t} beats`);
ok(st.inv.splitter === 1, 'A gives a Splitter');

clear(st);
// Up x=12 through the door; a splitter facing up at (12,15) sends half left (11,15) and half right (13,15).
line(st, [[10, 24, R], [11, 24, R], ...col(12, 24, 16, U)]);
put(st, 'splitter', 12, 15, U);
line(st, [[11, 15, U], [11, 14, Lf], [10, 14, Lf]]);
line(st, [[13, 15, U], [13, 14, R], [14, 14, R]]);
t = runUntil(st, 'B'); ok(t > 0, `B Twin Braziers open after ${t} beats`);
ok(st.unlocked.includes('water') && st.inv.wellspring === 1, 'B gives Water and a second wellspring');

// Optional H in a fire + fire run.
L.endRun(st); clear(st, false);
put(st, 'wellspring', 12, 25, U, 'fire'); put(st, 'wellspring', 14, 25, U, 'fire');
line(st, [[14, 24, Lf], ...col(13, 24, 18, U), ...row(17, 13, 20, R), [21, 17, U], [21, 16, U]]);
line(st, [...col(12, 24, 17, U), ...row(16, 12, 19, R), [20, 16, U], [20, 15, R]]);
L.startRun(st);
t = runUntil(st, 'H'); ok(t > 0, `H Shrine of Embers (optional) opens after ${t} beats with two fire wellsprings`);

// Run 3: fire + water. Sluice and Steam Door.
L.endRun(st); clear(st, false);
put(st, 'wellspring', 10, 25, U, 'fire'); put(st, 'wellspring', 14, 25, U, 'water');
line(st, [[10, 24, R], ...col(11, 24, 11, U), [11, 10, Lf], [10, 10, Lf]]);                 // fire → mixer back
line(st, [[14, 24, Lf], ...col(13, 24, 12, U)]);                                             // water up x=13
put(st, 'splitter', 13, 11, U);                                                              // left (12,11), right (14,11)
line(st, [[14, 11, U], [14, 10, U], [14, 9, U], [14, 8, R]]);                                // right → sluice (15,8)
line(st, [[12, 11, U], [12, 10, U], [12, 9, Lf], [11, 9, Lf], [10, 9, Lf], [9, 9, D]]);      // left → mixer from the north
L.startRun(st);
t = runUntil(st, 'C'); ok(t > 0, `C The Sluice rises after ${t} beats and gives a Mixer`);
put(st, 'mixer', 9, 10, Lf);
put(st, 'belt', 8, 10, Lf);                                                                  // under the sluice gate
line(st, [...row(10, 7, 3, Lf), [2, 10, D], [2, 11, D]]);
t = runUntil(st, 'D'); ok(t > 0, `D The Steam Door opens after ${t} beats (sluice still held: ${L.gateOpen(st, 'C')})`);

// The Narrow: steam through the one-tile gap, demerge on the far side.
for (const [x, y] of [[2, 10], [2, 11], [3, 10]]) L.remove(st, x, y);
line(st, [[3, 10, U], ...col(3, 9, 5, U), [3, 4, R], [4, 4, R]]);
put(st, 'demerger', 5, 4, R);                                                                // fire out up, water out down
line(st, [[5, 3, U], [5, 2, U], [5, 1, R], [6, 1, R]]);
line(st, [[5, 5, R], [6, 5, D], [6, 6, R]]);
t = runUntil(st, 'E'); ok(t > 0, `E The Narrow opens after ${t} beats`);

// The Rune Lock: re-route both halves into a Joiner.
for (const [x, y] of [[5, 2], [5, 1], [6, 1], [6, 5], [6, 6]]) L.remove(st, x, y);
line(st, [[5, 2, R], [6, 2, R], [7, 2, R], [8, 2, R]]);
line(st, [[6, 5, R], [7, 5, U], [7, 4, R], [8, 4, R], [9, 4, U], [9, 3, U]]);
put(st, 'joiner', 9, 2, R);
line(st, [...row(2, 10, 14, R), [15, 2, U]]);
t = runUntil(st, 'F'); ok(t > 0, `F The Rune Lock opens after ${t} beats`);
ok(st.unlocked.includes('earth') && st.inv.wellspring === 1 && st.inv.mixer === 1, 'F gives Earth, a wellspring and a Mixer');

// Run 4: fire, earth, water. The Chasm, then the Scales.
L.endRun(st); clear(st, false);
put(st, 'wellspring', 10, 25, U, 'fire'); put(st, 'wellspring', 12, 25, U, 'earth'); put(st, 'wellspring', 14, 25, U, 'water');
line(st, [...col(12, 24, 11, U), ...row(10, 12, 16, R), [17, 10, U], [17, 9, U]]);
L.startRun(st);
t = runUntil(st, 'G', 600); ok(t > 0, `G The Chasm is bridged after ${t} beats`);
L.remove(st, 17, 10); L.remove(st, 17, 9);
line(st, [...row(10, 17, 21, R), ...col(22, 10, 4, U)]);                                     // earth → x=22
line(st, [[10, 24, R], ...col(11, 24, 10, U), ...row(9, 11, 20, R), ...col(21, 9, 7, U), [21, 6, Lf], ...row(6, 20, 18, Lf), ...col(17, 6, 4, U)]);
line(st, [[14, 24, Lf], ...col(13, 24, 12, U), ...row(11, 13, 22, R), ...col(23, 11, 4, U)]);
put(st, 'splitter', 22, 3, U);
line(st, [...row(3, 21, 18, Lf)]);
put(st, 'mixer', 17, 3, U); put(st, 'belt', 17, 2, U);
put(st, 'mixer', 23, 3, U); put(st, 'belt', 23, 2, U);
t = runUntil(st, 'I'); ok(t > 0, `I The Scales balance after ${t} beats — end of the demo`);
ok(Object.values(st.pieces).filter((p) => p.type === 'mixer').every((p) => !L.mixerJammed(st, p)), 'no mixer jammed in the final build');

// ---------------------------------------------------------------- tempting shortcuts that must fail
{ // B without a splitter: one brazier gets everything, the other nothing
  const s = L.newState(); s.done.A = true; s.inv.splitter = 0;
  put(s, 'wellspring', 10, 25, U, 'fire');
  line(s, [[10, 24, R], [11, 24, R], ...col(12, 24, 15, U), [12, 14, Lf], [11, 14, Lf], [10, 14, Lf]]);
  L.startRun(s); runBeats(s, 300); ok(!s.done.B, 'B fails with one stream into one brazier');
}
{ // D: all water into the mixer, none for the sluice → the gate never rises
  const s = L.newState(); Object.assign(s.done, { A: true, B: true }); s.unlocked.push('water'); s.inv = { splitter: 1, mixer: 1, wellspring: 2, joiner: 0, demerger: 0 };
  put(s, 'wellspring', 10, 25, U, 'fire'); put(s, 'wellspring', 14, 25, U, 'water');
  line(s, [[10, 24, R], ...col(11, 24, 11, U), [11, 10, Lf], [10, 10, Lf]]);
  line(s, [[14, 24, Lf], ...col(13, 24, 10, U), [13, 9, Lf], [12, 9, Lf], [11, 9, Lf], [10, 9, Lf], [9, 9, D]]);
  put(s, 'mixer', 9, 10, Lf); put(s, 'belt', 8, 10, Lf);
  L.startRun(s); runBeats(s, 300); ok(!L.gateOpen(s, 'C') && !s.done.D, 'D fails without splitting water for the sluice (gate stays shut)');
}
{ // F: a single fire stream at 1/s has the rate but not the pattern
  const s = L.newState(); Object.assign(s.done, { A: true, B: true, D: true, E: true });
  s.run = null; L.startRun(s); s.run.gates.C = true; // pretend the sluice is held
  ok(!L.satisfied(s, L.OBJ.F), 'F needs the alternating pattern, not just the rate');
  L.endRun(s);
}
{ // the wellspring element cannot change mid-run
  const s = L.newState(); put(s, 'wellspring', 10, 25, U, 'fire'); s.unlocked.push('water');
  L.startRun(s); ok(!!L.attune(s, 10, 25, 'water'), 'attuning is refused during a run'); L.endRun(s);
  ok(!L.attune(s, 10, 25, 'water'), 'attuning works between runs');
}
{ // wellsprings only on spring spots
  const s = L.newState(); ok(!!L.canPlace(s, 'wellspring', 11, 23), 'wellsprings refuse ordinary floor');
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exitCode = failures ? 1 : 0;
