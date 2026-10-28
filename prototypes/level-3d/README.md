# Valley visual designs (3D)

A three.js preview of the demo level from `prototypes/springs-puzzle`, used to choose the 3D look. It is reference art for the Godot build, not the game (see `CLAUDE.md`).

- **What it shows:** the real level data (`../springs-puzzle/logic.js` is inlined) with the flow running live. The state is a fire + water run with the Mill Sluice held open, the Forge Door open, and the Oak Narrows crossing built: steam through the gap between the oaks, a Demerger, and water tunnelling under the fire line through an Underpass.
- **Styles:** A Quiet Kingdom (round oaks, soft daylight), B Storybook Woodland (faceted firs and birches, cool light), C Autumn Hearth (clustered autumn canopies, golden low sun).
- **Views:** Oak Narrows, Mill Sluice, Spring Meadow, the whole Valley. The camera is fixed in angle; drag to pan, pinch or scroll to zoom.
- **Readability rule tried here:** trees standing just south of a goal or gate are drawn low, so the fixed camera can always see the goal.

Build: `node build.mjs` writes the self-contained `level-3d.html`. It loads three.js 0.170.0 from jsDelivr.
