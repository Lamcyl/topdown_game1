# Crossroads demo

> Superseded: this demo follows the archived defence design (`docs/design/archive/orbforge-defence.md`). The current direction is the puzzle demo in `prototypes/springs-puzzle`.

A 2D placeholder demo of the Orbforge map and real-time defence from `docs/design/archive/orbforge-defence.md`. Everything fits on one phone screen: status bars on top, the map in the middle, the build bar at the bottom. Panels open as sheets over the map.

## What it does
- **Map:** one handmade 41×41 map around the Keep.
  - Four regions: Stonereach (north, earth), Ember Wastes (east, fire), Tidemarsh (south, water), Skyspire (west, air, behind the Sky Gate).
  - Each region has three rings.
  - Enemy roads run from the lairs to the Keep.
- **Fog and lairs:**
  - Beacons light the fog and must be placed inside your light.
  - Lairs wake when lit. Every 2½ minutes the dark also stirs one anyway.
  - Map memory stays sketched under the fog between runs.
- **Economy:**
  - Gold comes from kills and a trickle, and buys buildings.
  - Extractors on veins bank **raw orbs** at the Keep. The crystal chips in the status bar show your stock. The raw-orb belt to the Keep is abstracted as a dotted line.
  - At the Keep you buy **Sources** with raw orbs into your hand, sell them back for half, or merge raw orbs (10 + 10 → 10, can't be undone).
- **Placing Sources:** place them with the 🔮 tool. They make **forged orbs** (glowing cores) out of their front at 1 a second. Picking one up is free; one moved while playing sleeps for 3 s.
- **Logistics:**
  - **Belt:** drag with the Belt tool to lay a line.
  - **Splitter:** sends orbs left and right in turn.
  - **Joiner:** takes from the back and both sides, alternating, which makes sequences such as fire, water, fire.
  - **Mixer:** two inputs, one secondary out of the gold notch. Same + same makes a stronger orb, a third input jams it (⚠), and an unknown recipe fizzles.
- **Towers:** each holds a 6-orb magazine (dots under it, next shot on the left) and fires orbs in arrival order.
  - Bolt Thrower: single target.
  - Beam Spire: a line.
  - Mortar: lobbed splash.
  - Lance: pierces.
  - Spray Fountain: cone.
  - Rune Trap: on the road, bursts when walked over.
  - Walls block the road.
  - Solid pieces on the road stop foes, which attack them; belts and traps can be walked over.
  - Towers shell a lair in range when no foe is near.
  - Mortar, Beam Spire and Lance need their blueprints. "Test mode" on the start screen unlocks every tower and recipe.
- **Elements decide effects:**
  - fire burns
  - water soaks, which puts out fire shields
  - earth cracks armour
  - air knocks back
  - steam pierces armour
  - mud slows
  - lightning does double against soaked foes
  - ice freezes and makes foes brittle
  - tertiaries are bigger
- **Foes by region:**
  - armoured brutes (north)
  - fire-shielded imps (east)
  - fast swarms (south)
  - fliers that ignore walls and traps (west)
- **Hidden things:**
  - lore stones
  - gates fed with another region's orbs
  - buried veins, found with the Dowsing Rod
  - blueprints, recipe tablets, relics, three seals, waystones, an Ancient Source
  - the Sky Gate and the final lair
- **Between runs:** Echoes for an Echo shop. Permanent finds and attuned waystones are kept. Progress is saved in this browser.

## Controls
- **Tap:** builds with the selected piece (or inspects, with 👆).
- **Drag:** pans, or lays belts with the Belt tool.
- **Pinch or scroll:** zooms.
- **Facing:** sets which way new pieces point. Inspect a piece to turn, remove or pick it up.
- **❚❚:** pauses. Removing a piece while paused refunds in full; while playing, half.

## Files
- `logic.js`: the map, rules (belts, towers, foes) and progress between runs, with no page code, so it runs in Node.
- `ui.js` and `page.html`: the page.
- `build.mjs`: run `node build.mjs` to produce the self-contained `crossroads-map.html`.
