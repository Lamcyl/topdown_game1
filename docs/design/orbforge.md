# Orbforge — game design (puzzle direction)

Status: working draft. Numbers are placeholders to tune in prototypes. The earlier tower-defence version is archived in `archive/orbforge-defence.md`.

## Pitch

A calm logistics puzzle on one continuous handmade map. Wellsprings by the start pour out glowing orbs. You lay conveyors through the level to feed braziers, basins and locks. Each one asks for a certain element at a certain rate. Feed it and a door opens, a bridge forms, or a gate rises, revealing the next small puzzle.

There are no monsters and no failure. The fun is in the tiles: splitting, joining, merging and demerging orb streams to hit exact rates through tight spaces.

- Genre: rate-based conveyor puzzle (in the spirit of Factorio's logistics, kept small and readable).
- Setting: medieval fantasy, elemental magic. Quiet Kingdom art style (see Art direction).
- Platform: phones first (Godot 4, Mobile renderer). A web build for test links comes later (see `docs/decisions/0001-game-engine.md`).

## Core rules

1. **Wellsprings** sit on spring spots in the **Spring Grounds**, the start area. Each emits **1 orb a second** of its element. Veins never run dry.
2. **Wellsprings can be placed only on spring spots near the start.** All flow begins there and has to be piped out through the level, so the network grows from the start.
3. **Wellsprings are earned.** You start with one, and goals give more. The demo has 3 spring spots and up to 3 wellsprings.
4. **Runs:**
   - A run is one session of flow.
   - **Between runs** you place or move wellsprings and choose each one's element from the elements you've unlocked.
   - **During a run** wellsprings are fixed, but every other piece can be built, moved or picked up freely.
   - **Ending a run** clears all orbs and drops held gates. Your layout and everything opened for good stay.
5. **Belts are unlimited. Every other piece is limited** and counted in the inventory. Goals give more pieces.
   - Picking a piece up returns it to the inventory.
   - A door that's open for good no longer needs its pieces, so solving a puzzle often frees pieces for the next one.
6. **Lane capacity:** a belt moves an orb one tile per beat (0.25 s), so one lane carries at most 4 orbs a second.
7. **Rates are measured** over the last 8 seconds. Permanent goals must also stay satisfied for 4 seconds in a row, so a burst of backed-up orbs can't open them.

## Elements and recipes

| Tier | Orbs | Made by |
|---|---|---|
| Primary | Fire, Water, Earth, Air | Wellsprings |
| Secondary | Steam (fire + water), Magma (earth + fire), Mud (earth + water), Lightning (air + fire), Ice (air + water), Dust (air + earth) | Mixer |
| Tertiary (later) | Eruption, Obsidian, Quagmire, Storm | Mixer, after finding recipes |

- **Merged orbs look different:** each wears a ring in its two parts' colours.
- **You start with only Fire.** More elements are unlocked by goals: Water, then Earth (and Air later in the full game). Elements are only the *choices* for wellsprings. You can still only run as many streams as you own wellsprings.

## Pieces

| Piece | Limited? | What it does |
|---|---|---|
| Belt | Unlimited | Moves orbs forward. Takes from behind or the sides. |
| Splitter | Yes | Takes from behind and sends out left and right in turn: each side gets half. If one side is blocked, the other gets everything. |
| Joiner | Yes | Takes from behind and both sides, alternating whenever more than one is waiting. Makes sequences (fire, water, fire, water). |
| Mixer | Yes | One orb from each of two inputs → one merged orb out of its gold notch (1 fire/s + 1 water/s → 1 steam/s). A third input, or anything feeding its notch, **jams** it (⚠). An unknown pair fizzles. |
| Demerger | Yes | Takes a merged orb from behind and splits it: first part out the left, second out the right (steam → fire left, water right). |
| Wellspring | Yes | On spring spots only, between runs only. 1 orb/s of the chosen element. |
| Underpass (planned) | Yes | A belt tunnel that jumps 2–3 tiles, for crossing another line or a wall. |

Rate maths the puzzles are built on:
- a Splitter halves a stream
- a Joiner adds streams together
- a Mixer turns 2 in into 1 out
- a Demerger turns 1 in into 2 out

## Goals (what you pipe into)

| Kind | Looks like | Rule | Once done |
|---|---|---|---|
| **Door** | A stone door with a brazier or basin | Hold the rate for 4 s | Open forever |
| **Held gate** | A portcullis on a water wheel | Open only while the rate keeps coming | Drops when the flow stops or the run ends |
| **Bridge** | Bridge-works by a chasm | Deliver a total (e.g. 30 earth) | Built forever |
| **Rune lock** | A ring of glyphs | An alternating sequence at a rate, held for 4 s | Open forever |
| **Scales** | Two pans | Two elements at the rate **and** equal to each other, held 4 s | Open forever |
| **Shrine** (optional) | A glowing altar | A rate | Reward only |

- **Every goal gives a reward:** pieces, a wellspring or an element.
- **Held gates are a standing tax.** Everything beyond one needs it kept fed, which uses up part of your flow. Late puzzles must keep earlier gates fed while solving the new one, so the network grows without any single region being big.
- **Pieces stuck behind a closed gate** can still be picked up from anywhere, so nothing is ever stranded.

## Puzzle ingredients (each region is small, about 5×5 to 7×7)

- **Narrow pass:** a one-tile gap fits one lane. Merge two elements, pass them through, then demerge on the far side.
- **Not enough flow:** a goal needs more than one wellspring gives, so join streams. A held gate already taking part of a stream leaves less for the rest.
- **One element at a time:** a held gate needs water while the door beyond needs fire. That forces a second wellspring and a new run with both elements.
- **Sequences:** a rune lock needs fire and water alternating, which only a balanced Joiner gives.
- **Balance:** scales need two products at equal rates, so streams must be split evenly.
- **Space:** tight rooms, crossing lines, and receptors and doors placed so belts have to wind around them.
- **Terrain:**
  - rock: can't build
  - chasm: needs a bridge
  - later: lava (burns any orb that isn't fire), ice (belts run double speed)

## The demo level (`prototypes/springs-puzzle`)

One continuous map, 25×27 tiles, with nine goals. It starts with one fire wellspring and no other pieces.

| # | Region | Goal | Needs | Reward |
|---|---|---|---|---|
| A | The First Door | Door: fire 1/s | Belts | Splitter |
| B | Twin Braziers | Door: two braziers, fire 0.5/s each | Splitter | Water, a second wellspring |
| H | Shrine of Embers (optional) | Shrine: fire 1.5/s | Two fire wellsprings | Splitter |
| C | The Sluice | **Held gate**: water 0.5/s | A fire + water run | Mixer |
| D | The Steam Door | Door: steam 0.5/s, beyond the sluice | Splitting water between sluice and Mixer | Demerger |
| E | The Narrow | Door: fire 0.5 + water 0.5 past a one-tile gap | Mixer → gap → Demerger | Joiner |
| F | The Rune Lock | Rune: fire, water alternating at 1/s | Demerger → Joiner | Earth, a third wellspring, a second Mixer |
| G | The Chasm | Bridge: 30 earth | A run with earth | Splitter |
| I | The Scales | Scales: magma 0.5 and mud 0.5, equal | Earth split between two Mixers | End of the demo |

Every region's intended solution is built and checked by `prototypes/springs-puzzle/check.js`, using only the pieces you have at that point. It also checks that tempting shortcuts fail:
- B with one stream fails.
- D without splitting water for the sluice fails.
- F with the rate but not the pattern fails.

## Progression in the full game

- **Map:** one continuous map of many small regions, with branches and optional side shrines.
- **Rewards:**
  - more wellsprings (more parallel streams)
  - new elements (more combinations)
  - new piece types (Demerger, Underpass)
  - recipe tablets for tertiaries
- **Order:**
  1. Early regions teach one piece each.
  2. Middle regions combine two pieces under a held-gate tax.
  3. Late regions use three or four elements with tight space.
- **Hidden things:**
  - side shrines with harder optional goals, giving extra pieces
  - lore stones with hints
  - secret spring spots that hold an extra wellspring

## Art direction (decided)

- **Style:** Quiet Kingdom.
  - soft ambient occlusion
  - rounded, filleted shapes
  - fixed camera with no rotation
  - thin seams, antialiasing
  - real moving conveyors
- **Orbs:** primaries are Glowing Cores with dark, outline-only symbols. Secondaries add the Elemental Aura animation. Tertiaries get bigger effects (still to design).
- **Tile designs:** picks are pending from `prototypes/art-styles/tile-designs.html`.

## Open questions

- Should the Underpass be in the core set, or stay a rare reward?
- Should the rate window (8 s) and the hold (4 s) be shown as a visible "filling" meter on each goal?
- Should held gates show their tax on the overview map so the network's load is readable?
