# Crossroads map demo

A 2D placeholder demo of the Orbforge map and run loop from `docs/design/orbforge.md`. It is for testing exploration, route choice and progress between runs. Belts, towers and combat are abstracted.

## What it does
- **Map:** one handmade 41×41 map around the Keep.
  - Four regions: Stonereach (north, earth), Ember Wastes (east, fire), Tidemarsh (south, water), Skyspire (west, air).
  - Each region has three rings.
  - Enemy roads run from the lairs to the Keep.
- **Fog:** beacons, bought with gold, push back the fog and must be placed inside your light. Lairs wake when the light reaches them.
- **Mining:** extractors on veins mine raw orbs into the Keep, and the veins run dry.
- **The Keep panel:**
  - Alchemy (10 + 10 → 10, can't be undone).
  - Buying Sources and choosing the front each one defends.
  - Selling Sources for half their price.
- **Fronts:** each front compares pressure (awake lairs × nightfall, plus the dark itself after 2 minutes) with defence (Keep 1, +1 per blueprint, + Sources). A Source counts double on a front its element counters.
  - Pressure higher than defence damages the Keep.
  - Spare defence besieges that front's nearest lair.
- **Hidden things:**
  - lore stones with hints
  - gates fed with another region's orbs, which unlock rich veins
  - buried veins, shown as odd markings until you find the Dowsing Rod
  - blueprints, recipe tablets, relics, three seals, waystones, an Ancient Source
  - the Sky Gate, which needs all three seals and leads to the final lair, the Storm Eyrie
- **Between runs:** when the Keep falls you earn Echoes.
  - Map memory (sketched under the fog), permanent finds and attuned waystones are kept.
  - The Echo shop sells Keep health, starting gold, cheaper beacons and a founding Source.
  - Progress is saved in this browser's localStorage. "Reset all progress" clears it.

## Files
- `logic.js`: the map, rules and progress between runs, with no page code, so it runs in Node.
- `ui.js` and `page.html`: the canvas page (drag to pan, pinch or wheel to zoom, tap to select).
- `build.mjs`: run `node build.mjs` to produce the self-contained `crossroads-map.html`.
