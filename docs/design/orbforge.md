# Orbforge — game design

Status: working draft. The numbers are placeholders to tune in prototypes.

## Pitch

Your Keep stands at the centre of a fogged, handmade map. Each direction leads to a different element's land. Every run you choose which way to push, mine that land's veins, and turn what you mine into firepower. You keep the waves off with towers fed by belts of glowing orbs. When the Keep falls, the run ends. You keep a few permanent gains, restart on the same map, and try another route.

- Genre: real-time base defence with exploration, played as a roguelite. Runs are 12–20 minutes long, retries are unlimited, and each run leaves permanent gains.
- Setting: medieval fantasy, elemental magic.
- Platform: phones first (Godot 4, Mobile renderer). A web build for test links comes later (see `docs/decisions/0001-game-engine.md`).

## Run structure

1. **Build phase.** The game is paused. Place extractors, belts, towers and beacons.
2. **Play.** Everything runs in real time. You can **pause** at any time to rebuild, and you can **speed up** (×2).
3. **Nightfall clock.** Waves on the Keep grow stronger over time, so standing still eventually loses. You have to expand.
4. **The run ends** when the Keep falls. You then earn Echoes (see Meta progression).

## The map

One handmade map, the same every run. Enemy waves vary slightly between runs.

| Direction | Region | Veins | Enemies | Counter |
|---|---|---|---|---|
| North | Stonereach | Earth | Armoured | Fire, cracking effects |
| East | Ember Wastes | Fire | Fire-shielded | Water |
| South | Tidemarsh | Water | Fast swarms | Splash and slow (earth/mud) |
| West | Skyspire | Air | Fliers | Opened late (see Hidden things) |

- **Regions lean on each other:** each region's veins counter another region's enemies, so the order you explore in matters. Going east first is hard unless you've already brought water up from the south.
- **Rings:** each region has three rings outward from the Keep. Outer rings have richer veins, stronger lairs and more hidden things.
- **Roads:** enemies come from **lairs** along fixed roads. A road appears as the fog over it lifts.
- **Building on roads:** you can build on roads.
  - Flat tiles (belts, splitters) can be walked over.
  - Solid tiles (towers, walls, Sources) block the road and get attacked.

### Exploring during a run

- **Fog** covers everything outside your lit area. You can only build inside the light.
- **Beacons** are bought with gold and light a radius around them. A beacon must be placed inside existing light, so the light grows outward a step at a time. Pushing outward is the main decision you make all run.
- **The trade-off:** pushing further reaches richer veins and secrets, but it also wakes more lairs and stretches your belts, which are harder to defend.
- **Lairs** wake when the light reaches them and then send enemies down their road.
  - Destroying a lair stops its stream and pays out gold.
  - A destroyed lair stays destroyed for the rest of the run, and comes back next run.

## Economy

### Two currencies

| Currency | Comes from | Buys |
|---|---|---|
| **Gold** | Killing mobs, destroying lairs | Structures: towers, belts, splitters, Mixer, Joiner, extractors, beacons, walls |
| **Raw orbs** | Veins, through extractors and belts, banked at the Keep | Sources and Keep alchemy |

Mobs drop gold only, never orbs.

### Two kinds of orb (they must look different)

- **Raw orbs** are rough, faceted crystal shards. They are matte, dimly glowing and tumble along belts. They are currency, and the Keep accepts only these.
- **Forged orbs** are ammo, made by Sources. They use the chosen orb art:
  - primaries are Glowing Cores with a dark, outline-only symbol
  - secondaries add the Elemental Aura animation
  - tertiaries get bigger effects (still to design)

  Towers accept only forged orbs.
- A belt that carries the wrong kind into the Keep or a tower jams and shows ⚠.

### Veins

- A vein holds a fixed number of raw orbs, for example 120 fire. It is used up when empty.
- An extractor placed on a vein outputs raw orbs at a fixed rate onto a belt toward the Keep.
- Starting veins are near the Keep and safe, but small. Rich veins sit near or on roads.
- Each map has a capped total of orbs, which keeps balance under control.

### Keep alchemy (merging raw orbs)

- Done by hand in the Keep panel: **50 + 50 → 50** of the secondary (for example, fire + water → steam).
- A merge can't be undone.
- Before you confirm, the panel shows what you'll have afterwards, for example: "After this: 50 steam → enough for 1 Steam Source; fire left: 20."
- Tertiary recipes are unlocked by recipe tablets (see Hidden things).

### Sources

- Bought with raw orbs from the Keep wallet. They produce **forged orbs forever** at a fixed rate.
- Picking a Source up puts it back in your inventory for free. Selling one refunds 50% of its orb price.
- A Source moved during a wave goes dormant for 3 s.
- Prices (placeholders):

  | Source | Price | Raw input | Output |
  |---|---|---|---|
  | Primary (fire) | 40 fire | 40 | 1 orb/s |
  | Secondary (steam) | 30 steam | 60 | 1 orb/s, stronger effect |
  | Tertiary (eruption) | 20 eruption | about 120 | 0.7 orb/s, big effect |

### Moving forged orbs

- **Belts** move orbs.
- **Splitters** split a flow, they don't copy it: a 1/s flow becomes 0.5/s per branch.
- The **Joiner** merges two belts, taking from each in turn, which makes fire, water, fire, water sequences.
- The **Mixer** (field merge) takes two forged streams in and sends one secondary stream out. The comparison with Keep alchemy:

  | | Keep alchemy | Mixer tile |
  |---|---|---|
  | Merges | raw orbs, in your wallet | forged ammo, on the belts |
  | Cost | 50 + 50 → 50, permanent | free to run, but two streams become one (2 in → 1 out) |
  | Use | buying secondary and tertiary Sources | flexible on-the-spot combos |
  | Undo | never | any time (rebuild it) |

  A Mixer takes at most two inputs. A third input, or anything feeding its output side, jams it and shows ⚠.
- **Amplifier and Lens** tiles boost the orbs that pass through them, as in the earlier Orbforge prototype.

## Towers

The tower type decides how a projectile is delivered; the orb's element decides its effect.

- Tower types:
  - Bolt Thrower: single target
  - Beam Spire: a line
  - Mortar: splash
  - Lance: pierces
  - Spray Fountain: a cone
  - Rune Trap: triggers when walked over
- Each tower has a small magazine (about 6 orbs), shown as a stack of orbs on the tower.
- **Towers fire in arrival order.** Effects set each other up, so sequences matter. For example:
  - water then lightning gives "soaked ×2"
  - ice then earth gives "brittle ×2"

## Elements

| Tier | Orbs |
|---|---|
| Primary | Fire, Water, Earth; Air (late) |
| Secondary | Steam, Magma, Mud; Lightning, Ice, Dust (need Air) |
| Tertiary | Eruption, Obsidian, Quagmire, Storm (need recipe tablets) |

Effects: burn (damage over time), soak, crack armour, slow/mire, freeze/brittle, knockback, fire shield (enemy).

## Hidden things

| Secret | How to find it | Reward |
|---|---|---|
| Blueprint ruins | Light their area and reach them | **Permanent** unlock: a new tower or tile type |
| Recipe tablets | Deep ring of a region | **Permanent** tertiary recipe |
| Sealed gates | Feed them N raw orbs of an element (e.g. 30 ice melts the frost gate) | A shortcut, a rich vein, or the way to Skyspire |
| Buried veins | Dowsing Rod relic, or odd tile markings | Bonus orbs |
| Ancient Sources | Ruins in the outer rings | A free Source you can claim for this run |
| Relic caches | Behind lairs or puzzles | **Permanent** relic, e.g. "Extractors +20%", "start with a Steam Source" |
| Lore stones | Scattered | Hints pointing at other secrets |
| Waystones | One per region, mid ring | Once activated, later runs can start with that region's first ring already lit |

Air is the late-game discovery. Opening Skyspire takes items from at least two other regions, so it gets solved over several runs.

## Meta progression (between runs)

| Resets every run | Kept forever |
|---|---|
| Gold, raw orbs, Sources, all buildings | Blueprints, recipes, relics |
| Light (fog returns) | Map memory: revealed areas stay sketched on the map (veins, lairs, roads, found secrets), but the fog returns |
| Lairs | Found secrets stay found |
| | Activated waystones |
| | Echoes and the Keep upgrades bought with them |

- **Echoes** are earned for distance explored, lairs destroyed, secrets found, and time survived.
- **The Echo shop:** Keep upgrades such as starting gold, a starting Source, cheaper beacons, a bigger magazine and more Keep health.

## Progression arc

1. **Runs 1–3:** the south (Tidemarsh) is the tutorial region. You learn veins, the Keep, Sources, towers and splitters, and usually die around ring 2.
2. **Runs 4–8:** you pick north or east. Echo upgrades make ring 1 quick. Keep alchemy and the Mixer come in here.
3. **Mid-game:** recipe tablets bring tertiaries in. Sealed gates need elements from other regions, so you plan routes across several runs.
4. **Late game:** opening Skyspire unlocks Air, and the map's final lair is out west.

New systems are introduced one at a time:

1. A given Source and towers only.
2. Veins and the Keep.
3. Buying Sources.
4. Splitters.
5. Keep alchemy.
6. Mixer and Joiner.

## Art direction (decided)

- **Style:** Quiet Kingdom.
  - soft ambient occlusion
  - rounded, filleted shapes
  - fixed camera with no rotation
  - thin seams between tiles, antialiasing
  - real moving conveyors
- **Forged orbs:** Glowing Core primaries with dark, outline-only symbols, and the Elemental Aura animation on secondaries.
- **Raw orbs:** faceted crystal shards (to design).
- **Tile designs:** picks are pending from `prototypes/art-styles/tile-designs.html`.

## Open questions

- Run length target and how fast the Nightfall clock ramps.
- How many Echoes a typical run gives, and the Echo shop prices.
- Map size: how many tiles per ring, and whether the whole map fits on screen or needs a scrolling camera.
