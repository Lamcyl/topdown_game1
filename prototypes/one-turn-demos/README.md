# One-turn fight demos

Placeholder prototypes of five one-turn fight ideas. Each runs a three-fight loop (fights 4–6): set up, press Unleash, watch it resolve, keep one reward on a win, restart the loop on a loss.

- **Spark:** place items, light one spark, and watch the chain reaction.
- **Ambush:** lay traps on a war party's road.
- **Vanguard:** deploy and equip up to 3 units for an automatic battle.
- **Mirror Duel:** place counters to block and bounce the enemy's beams.
- **Heist:** draw a route and place tools, then watch the night play out.

Files:
- `logic.js`: game rules and fight data, with no page code, so solvers can run it in Node.
- `ui.js` and `page.html`: the page.
- `build.mjs`: run `node build.mjs` to produce the self-contained `one-turn-demos.html`.

Every fight was checked with brute-force solvers to make sure it is winnable, that cheap one-item answers don't exist, and that the whole loop can be won with the starting satchel plus rewards.
