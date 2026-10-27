# Orbforge prototype

Placeholder-art prototype of the conveyor-alchemy idea: place orb wells, belts, fusers and multipliers, aim launchers at one or two stationary enemies, then press Play once.

- 6 levels. Levels 1–5 each teach a tile (wells/belts/launchers, Fuser, Amplifier + Lens, Splitter, Delay + armour/mire); level 6 combines them.
- Start with 3 elements (fire, water, earth) and their secondary mixes (steam, magma, mud). Tertiary recipes and the fourth element (air) are shown as locked.
- Retry any level any time. Special tiles touched by an orb are used up; unused ones carry to the next level (the best clear of each level counts). Orbs and wells belong to the stage.

Sandbox (on the level list): every tile unlimited, wells of any element including Air, every recipe unlocked, and training dummies (plain, armoured, fire-warded) on either side. After each play it shows damage totals and a full battle log.

Elements and recipes:
- Primary: Fire, Water, Earth; Air (moves 2 tiles per beat) unlocks later.
- Secondary: Steam, Magma, Mud; Lightning, Ice, Dust from Air.
- Tertiary: Eruption, Obsidian, Quagmire, Storm.

Visual decisions so far: Quiet Kingdom art style; primary orbs are plain Glowing Cores; secondary orbs get the Elemental Aura effect; tertiary orbs get bigger effects (still to design).

Building: tap a tile tool then an empty square to place; tap a placed piece to open its settings (facing, launcher target, remove); drag a placed piece to move it (dropping on another piece swaps them). A Mixer takes at most two inputs: green notches mark its inputs, a gold notch its output, and a third input (or anything feeding its output side) jams it, shown with a ⚠ above it.

Files:
- `logic.js`: rules and levels, with no page code, so the checks run in Node.
- `ui.js` and `page.html`: the page.
- `build.mjs`: run `node build.mjs` to produce the self-contained `orbforge.html`.

Each level's intended solution was checked to win, and the tempting shortcuts to lose (e.g. no Fuser in level 2, Lens before Amplifier in level 3, no Delay in level 5).
