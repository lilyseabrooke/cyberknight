# Active world: one board, many relationships

Status: **proposed, not started.** This is a plan for a future task, not a description of anything built. Nothing here has been prototyped. Feel over balance applies throughout (see `CLAUDE.md`): the point is that fights, chases, sneaking and ordinary life stop being separate scenes and become things that can happen to different people on the same board at the same time, not that any number is tuned.

Builds on `BOARDS.md` (persistent place boards), `STEALTH.md` (awareness, takedowns, tracking, witnesses, props, cameras), `STREETS_PLAN.md` (street boards, the chase on a line) and `VEHICLE_COMBAT.md` (cars as combatants).

## Why

Today there are three resolvers, entered one at a time:

- `fight()` / `Sim` (`tactics.ts`, `combat.ts`): turn-by-turn on the place's grid, with its own `Unit`, a boolean `alert`, and a cloned grid. A car is a `BoardObject` that never moves.
- `prowlRoom()` / `prowlBoard()` (`prowl.ts`, `witnesses.ts`, `streethunt.ts`): awareness over a few tiles, with `PUnit`, buckets and a `fix` flag.
- `runChase()` (`chase.ts`, `chaseboard.ts`): an abstract `gap`/band model, with the street board as a lens (a pursuer is "that many tiles back along her line").

They share the layout, the persistent `Ent`s, the awareness buckets and a few services, and they hand off through `fight()`, `runChase()`, `streetHunt()`. The seams are where bugs and glue code live:

- Four unit representations (`Unit`, `PUnit`, `Chaser`, `Ent`) with lossy conversions between them.
- The chase has two sources of truth (`gap` and board position): `leaveSearching`, `hideScene` and `streetHunt` all convert between them, with magic numbers.
- Two or three noise systems (`stealth.makeNoise`, `prowl.makeNoise`, the chase's `loud`).
- Several clocks (beat, the minute tick, stealth round, chase round, fight round).
- Mode-scoped state in closures (`loud`, `decoy`, `trails`, `said`) that dies with the chase.
- Fighting does not use buckets, bystanders, props, cameras, Override machines or tracking, and cannot end in an escape.
- Pace is "tiles a round on the fight-board scale" in `VEHICLE_COMBAT.md` but the chase multiplies by 2.2 (`TILES_PER_PACE`).

What the game cannot do at all: fight one enemy while chasing another, sneak past one person while being hunted by another, or step out of a fight into a chase without a scene boundary.

## The target

**Modes belong to relationships, not to the scene.** An entity has a *stance* (what it is doing) and a sparse set of *relationships* (what it is doing about each other entity):

- Stances: `idle`, `working`, `patrolling`, `searching`, `hiding`, `fleeing`, `driving`, `fighting`.
- Relationships: `unaware`, `watching`, `searching` (with a trail), `pursuing`, `engaged`, `fleeing`, `allied`/`ignoring`.

The scene is whatever the relationships add up to. Fighting one enemy while chasing another is two relationships on one board. Each tick an entity chooses from the union of the actions its relationships allow.

All of it lives on the persistent board (`World.boards`): entities, bodies, props, cameras, light, ambient noise, and *events in the world* (a noise, a sighting, a shot, a fallen body) with a position and a loudness, not function calls into a mode.

## Principles for the work

1. **Every step ships and leaves the game playable.** No big-bang merge. Each phase has a done-when and can be stopped after.
2. **State before loop.** Unify who and where first, then what they know, then what they can do. Merge the loops last, only if the per-relationship resolvers have come to look the same.
3. **Existing seeds keep their stories** where feasible: new rolls use derived `Rng`s (`CLAUDE.md`). Statistical tests broke on nearly every change in the last round of work; expect the same, and fix by widening trials or moving seeds, not by adding balance tests.
4. **Measure before deciding it is too slow or too fine.** The previous assumption that a unified tick would be too slow was never measured; phase 0 measures it.
5. **Keep the abstract chase for off-screen and city-scale runs** (decision in `STREETS_PLAN.md`) until phase 6 shows stitched boards can replace it.

## Phases

### Phase 0: Measure and settle the units

*Goal:* know the costs and fix the one inconsistency that would poison everything else.

- Write a timing harness (a test-only script, not run in `npm test`) for 200 chases, 200 fights and 200 hunts: events, rounds, wall time.
- Settle the pace scale: one definition of "tiles per round" for foot, car, bike, fight movement and `TILES_PER_PACE`. Decide whether a car crosses a 30-tile street in one round on purpose.
- Decide the tick: how many world seconds a round is, and how it maps to the minute tick that drives clock-based positions.
- List every place awareness is read or written (`awareness()`, `bucketOf`, `lose`, `enterStealth`, `slip`, `loseContact`, `fix`, `seenAt`, `calledSince`) so phase 4 knows the surface.

*Done when:* a short doc section with the numbers and the three decisions; no behaviour changes.

### Phase 1: One participant record

*Goal:* a single `Actor` shape on the board; adapters, not rewrites.

- Extend `Ent` (`types.ts`) into the one record: position, facing, speed, hp reference (`ref`), status effects, stance, crew, vehicle reference, mover state (heading, momentum, unused until phase 6).
- Write adapters `toUnit` / `fromUnit`, `toPUnit` / `fromPUnit`, `toChaser` so each mode builds its working view from the record and writes it back, replacing the ad hoc `unitOf` / `storeUnit` / `foeUnit` conversions.
- No mode loses a field; the adapters are the only place conversions live.

*Done when:* `unitOf`/`storeUnit`, the chase's crew bookkeeping and the fight's `foeUnit`/`ended` all go through the adapters; `npm test` green.

### Phase 2: Pursuers on the board

*Goal:* remove the chase's double truth.

- Chasers become entities on the street board at their real tiles, moving at their own speed each round along (or toward) her line. `gap` becomes a derived value (tiles along the line / `TILES_PER_PACE`), kept only as an input to the existing roll formulas.
- Delete the conversions: `leaveSearching` (gap to tile), `hideScene`'s runner synthesis, `streetHunt`'s tile-to-gap, `chaserTile`'s inverse.
- The abstract engine stays for chases that are off-screen or run across more than one street.

*Done when:* a foot chase has no `gap` field of its own; hand-offs between chase, hunt and hide read positions off the board; chase/hunt tests pass with widened trials.

### Phase 3: Shared services

*Goal:* one implementation of each thing the modes duplicate.

- **Perception:** one module for sight, cones, light and view range (today split across `prowl.sightGain`, `chaseboard.chaserSees`, `stealth.seesHer`, `placeboard.camerasSeeHer`).
- **Noise:** one spatial noise with ambient masking (`prowl.makeNoise` generalised; retire `stealth.makeNoise(w, level)` and the chase's `loud` as separate concepts). A noise is a world event with position and loudness; any entity may perceive it.
- **Witnesses and bystanders:** `witness.ts`, `witnesses.ts` and `bystanders.ts` become one reaction service called from any mode when something visible happens.
- **Props, cameras, Override:** one API for using a prop or camera (`useProp`, the chase's `use_prop`, `hack_cam`, `blackout`, `hackCamera`) that any mode's actions call.
- **Fight consumes them:** the fight reads the same awareness, lets bystanders flee or join, and can use props, Override machines and cameras.

*Done when:* each service has a single definition used by at least two modes, and the fight uses three of them.

### Phase 4: Relationships as data

*Goal:* knowledge about each other becomes first-class and sparse.

- Add `Relationship` records between entities (kind, since-when, what each knows of the other: position, certainty, trail), stored sparsely (only non-default pairs).
- Re-home awareness: buckets and `fix` become a view of the relationship (`unaware`/`watching`/`searching`/`pursuing`); `Npc.aware` keeps working through a compatibility getter until the end of the plan.
- Move chase-scoped state onto relationships and the board: trails (`trails`), who has had their say (`said`), decoys, hacked cameras, fatigue (`chaseTire` becomes per-entity).
- Define transitions in one table (sight gained/lost, noise, hit, body found, call heard) instead of scattered code.

*Done when:* nothing reads `aware` directly except the compatibility getter; trail and fatigue state survive the end of a chase.

### Phase 5: Actions per relationship; the first multi-relationship case

*Goal:* an entity can be in two relationships at once.

- Express each mode's actions as a set keyed by relationship: `engaged` gets the fight techniques (`tactics.ts`, `techniques.ts`); `pursuing`/`fleeing` gets the chase actions; `unaware`/`searching` gets takedown, pass-by, hunch and the hide scene.
- Entities pick across the union each tick. Start with the smallest case: she is `engaged` with one ganger while another is `fleeing` from her; she can finish the fight, give chase, or let him go.
- Resolve conflicts with simple rules (one move per tick; engaged entities cannot break away without a disengage action).

*Done when:* a test sets up one fight and one flight on the same board and both advance in the same tick.

### Phase 6: Movers and vehicles

*Goal:* a car is an entity that moves.

- Add heading, speed and a small movement model (accelerate, brake, turn, a skid) to the mover state; foot movement is the degenerate case.
- Vehicles become entities (a `BoardObject` that moves), with seats (driver, gunner, passenger) affecting available actions, and the existing hit points, state, blast and crash rules unchanged.
- `ram`, `run_down` and `ram_cover` become real collisions; `accident` becomes a collision with whatever is in the path (cover, bystanders, other vehicles).
- Stitched boards: a mover that reaches a door or mouth enters the next street's board at its entry; the arena is the set of boards entities are on. Compare against the abstract city-scale chase; if stitching holds up, the abstract chase can be retired to off-screen resolution only.

*Done when:* a car chase on one street board is resolved by movement and collisions, and a chase can cross into a second street without leaving the board model.

### Phase 7: One tick, one narrator, an active set

*Goal:* merge the loops, if the previous phases have made them similar.

- A single tick function: choose actions, move, update perception, apply relationship transitions, run reactions. `fight()`, `runChase()`, `prowlRoom()` and `streetHunt()` become thin wrappers that start a tick loop with the right relationships set up.
- An **active set** budget: simulate only entities near her or in a relationship with something that is; everyone else stays on the clock-driven route.
- A **narrator** with priorities: always tell her own action, hits, notices, deaths and arrivals; compress the rest to a line a round (as the abstract chase does now).
- An off-screen resolver on the same relationships with a coarse distance (replaces the abstract chase and abstract fight for things not on her board).

*Done when:* the three entry points are wrappers; the active-set size is measured and bounded; the log for a mixed fight-and-chase reads in order.

### Phase 8: Cleanup

- Remove the compatibility getter for `aware`, the adapters, dead conversion helpers, `ChaseOpts.noSearch`, and the closure state in `chase.ts`.
- Update `BOARDS.md`, `STEALTH.md`, `STREETS_PLAN.md`, `VEHICLE_COMBAT.md` and this document ("As built").
- Split `chase.ts` (one very large function) and fix the import cycles (`chase` / `streethunt`, `prowl` / `witnesses`).

## Cross-cutting concerns

- **Tests:** keep `npm test` as the check (`CLAUDE.md`); never run `test:full` without asking. Add scenario tests for the multi-relationship cases (fight plus flight, sneak plus hunt) per phase. Widen or move seeds when statistical tests shift.
- **Text:** every event type needs a template (`hasTemplate` tests); new events for the narrator need lines.
- **Saves:** the board and relationships need a migration for existing worlds (old boards have no relationships; fall back to the compatibility getter).
- **RNG:** new rolls on derived `Rng`s so earlier seeds keep their stories.
- **Performance:** phase 0's harness is the baseline; each phase compares against it.

## Open questions

- Is a tick the same length for a fight round, a sneak step and a chase round, or does speed alone account for the differences?
- How does she *choose* between relationships when more than one is active (a prompt each tick, a priority rule, an automatic policy with overrides)?
- What does an NPC do when it has two relationships (a ganger who is `engaged` with her and `pursuing` someone else)? A simple priority, a personality weight, or a utility score?
- Do the abstract off-screen resolvers stay forever, or become a coarse mode of the same tick?
- How much of `tactics.ts` (techniques, statuses, the AI) can be expressed as actions keyed by relationship without a rewrite?

## Abort criteria

Stop and reassess if: phase 0 shows the unified tick is far slower than the current resolvers; phase 2 cannot reproduce chase feel from tile movement without re-tuning most of `chase.ts`; or phase 5's multi-relationship case needs special cases in every action. Each phase is useful on its own, so stopping early still leaves fewer seams than today.

## Out of scope

Rebalancing (feel over balance), new content (vehicles, weapons, locations), a UI for choosing between relationships, and any change to the setting bible.
