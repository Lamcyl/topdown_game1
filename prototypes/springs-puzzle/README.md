# Springs puzzle demo

A 2D placeholder demo of the puzzle direction in `docs/design/orbforge.md`: one continuous medieval valley (meadows divided by woods, with a river) and nine small goals fed by conveyors from wellsprings at the start. Trees are the obstacles: nothing can be built on them or tunnelled under them. The Oak Narrows can only be solved with an Underpass. The 3D look is previewed in `prototypes/level-3d`. Everything fits on one phone screen.

## How it plays
- **Starting point:** one fire wellspring on a spring spot in the Spring Meadow (the start clearing).
- **Laying belts:** pick ➜ Belt and drag to lay a line. Tapping a belt with the Belt tool re-aims it.
- **Running:** press **▶ Start run** to set the flow going.
  - Each goal shows its rate (orbs per second over the last 8 s) against its target.
  - Doors open for good once they hold the rate for 4 s.
- **Between runs** (after **■ End run**): tap a wellspring to choose its element, or place new wellsprings on the spring spots. During a run they're fixed; everything else can be rebuilt freely.
- **Pieces:** belts are unlimited; Splitter, Joiner, Mixer, Demerger, Underpass and Wellspring are counted. Goals give more, and 🧹 Pick up returns pieces.
- **Underpass:** tap its entrance, then its exit 2–4 tiles straight ahead (dots show valid spots). Orbs go under belts and pieces in between, but never under trees, the river, doors or gates.
- **The Sluice** is a held gate: it stays up only while water keeps flowing in, and drops when the run ends.
- **🎯** lists the goals you've found, with hints and rewards. **?** explains everything.

Progress (layout, unlocks, opened doors) is saved in this browser. "Reset the level" is in the help panel.

## Files
- `logic.js`: the level, pieces and flow rules, with no page code.
- `check.js`: run `node check.js`. It builds each goal's intended solution using only the pieces available at that point and confirms it opens. It also confirms that tempting shortcuts fail, that wellsprings can't change element mid-run, that an Underpass carries one line under another (and refuses trees and gates), and that opened gates take belts. An exhaustive search confirms the Oak Narrows has no solution without a tunnel.
- `ui.js` and `page.html`: the page.
- `build.mjs`: run `node build.mjs` to produce the self-contained `springs-puzzle.html`.
