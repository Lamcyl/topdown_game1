// Tiny LCG. Same algorithm and seed as godot/scripts/rng.gd, so both builds
// place every tree, tower and unit in the same spot.
export function makeRng(seed) {
  let state = seed & 0x7fffffff;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    return state / 2147483648;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next() };
}
