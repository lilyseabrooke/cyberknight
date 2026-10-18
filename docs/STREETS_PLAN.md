# Streets as boards, and how chases run on them (plan)

Status: phase 0 (street layouts and boards) is built; the chase phases are not. Decisions taken: 12 tiles to a hex cell; no movement in the log except when something spatial happens; off-screen chases stay on the abstract engine; new rolls use their own `Rng`s so existing seeds keep their stories; and every kind of street has its own layout (below). Builds on `BOARDS.md` (persistent place boards, clock-driven positions, sight), `STEALTH.md` (awareness, cones, losing them) and `VEHICLE_COMBAT.md` (the chase engine, `chase.ts`).

## What a chase is today

`runChase` has no board. Each chaser has a `gap` (tiles behind her) and a `band` (`locked` ≤0.5, `close` ≤2.5, `near` ≤6, `far`). Each round everyone picks an action (`floor_it`, `swerve`, `lose_them`, `shoot`, `ram`, `board`, `bail`...) by score and dice. Where she is decides the odds, not a map: the street's `roadClass` and `trafficAt` give a `squeeze` (and `tight`, `setting`), and now and then the chase turns into the next street along a `Route` (`shortcut.ts`), which she or the cutters can short-circuit over a fence, through a barricade, along a ramp (`VIA`, `cutAcross`). A chase is over at `ESCAPE_GAP` (14), when she is caught (a scene fight on a random street grid), or on a wreck/bail. Dragons are chasers with wings.

So the chase already has all the right ideas (squeeze, hiding places, shortcuts, getting cut off) but none of them are anywhere. The street board should make them places.

## The street board

A street is a **strip**: long axis along the street, with a carriageway down the middle and frontage either side.

- **Size** from the street's hex cells (`loc.hex.cells.length`, `lengthOf` in `shortcut.ts`) and its `roadClass`: a highway is long and wide with lanes and a verge; a street a lane each way and pavements; a small street one lane; a pedestrian way or market is all open floor; an alley is two tiles wide.
- **Frontage**: building fronts as walls with a door tile for each non-street exit (shops, bars, clubs, homes: each door is the real exit, as in `Layout.doors`), gaps where alleys meet it, and now and then a fence or barricade tile (the `VIA` kinds for hex neighbours that are not doors).
- **Ends and sides = junctions**: one per neighbouring street (`edgesOf`), put on the end or side facing that neighbour on the hex grid. Each is a door tile into the next strip, so "the chase turns into the next street" becomes a real arrival.
- **Furniture**: parked cars (`roads.ts` already knows what is parked where; they become `BoardObject`s and cover), stalls, kiosks, bins, lamp posts (light), cameras on poles, billboards (`large`: block sight). Crowd density from `trafficAt`: people as entities in a market, a thin scatter elsewhere.
- **Moving things are clock functions**, like `routeAt`: lane traffic loops along the carriageway, pedestrians stroll between shopfronts, delivery vans stop at kerbs. Nothing is stepped; a chase asks for the state at (clock + sub-tick), so time skipped costs nothing.
- Layout is pure from seed + id (never stored), per `layoutOf`; `hasBoard` stops excluding streets. Hours/crowd curves already exist for streets.
- Light: lamps and shopfronts at night, a base by district; the hour matters (`phaseOf`).

This alone (phase 0) replaces the random grid fights get on a street with the street itself, and puts people on streets where sneaking, cones and cameras work.

## How a chase uses it

Principle: **the board makes the existing chase concrete, it does not replace it**. The `gap`/`band` interface stays; the rolls gain a place to come from. The log stays abstract (one line a round), as for movement on any board, with the odd spatial mention.

1. **Gap is distance along the strip.** Every `Chaser` gets a board entity (cars as ents with a footprint; wings free in 2D). A round, each side moves its `pace` in tiles along the best path; `gap` is path distance to her, so `bandOf`, `standP`, `boardP`, and `ESCAPE_GAP` keep working. Pace is already on the fight board's scale (`foeProfile(n).speed`, `heroSpeed`).
2. **`squeeze`, `tight`, `setting` come from the tiles around her**, not a street-wide number: width of the carriageway and pavements ahead, crowd and parked cars in the next few tiles, cover. A chase down a market passage is tight at the crush and open at the plaza.
3. **Hazards are on the path.** `swerve`, `accident`, `stumble` (`drivefx.ts`, `footfx.ts`) trigger on an obstacle actually ahead (a parked car, a stall, a knot of people, traffic crossing) and the chance depends on speed vs its distance; a swerve picks a free lane. `hopChance` over a barrier is a barrier tile in the way.
4. **`lose_them` has somewhere to go.** It needs a real way out in reach: an alley mouth, a doorway, a gap in the fence, a car park ramp, a roof ladder. Choosing it routes her to the nearest, and the outcome is spatial:
   - *Alley mouth*: the strip of the alley (an ordinary street) with the chasers behind by `gap`.
   - *Doorway*: she goes in; the place's board is her hiding place. The pursuers arrive after `gap` rounds and the stealth system takes over (below).
   - *Out of sight round a corner / behind something `large`*: feeds the awareness model.
5. **Shortcuts are physical.** `cutAcross` and `cross` (`shortcut.ts`) cross a strip-side feature tile (fence, wall, barricade, duct, ramp, through-building = a door and out the other side). The skill/mode checks stay (`VIA` by mode); what changes is that the crossing exists on the strip, and a cutter ahead of her is an entity waiting at the far end.
6. **Street changes.** Reaching a junction runs the existing transition (`relocate` + `refresh`), then places her at the matching junction of the next strip and each chaser `gap` tiles back along it (or, if they cut across, ahead of her). The route (`Route`) still decides which junction.
7. **Escape is losing sight, not a number.** Chasers in view with a fix are Aware; ESCAPE_GAP becomes "no chaser has a line to her and nobody has had one for N rounds" (`seesHer`, cones, `loseContact`). Out of sight they drop to Alert and search from `last` by the prowl habits (`advanceHabits`): she can wait it out, hide in a doorway, or take one down quietly as they split up. This is where "options to lose their attention" lives. Distance still helps (`ESCAPE_GAP` stays as an automatic out on a long clear run).
8. **Caught = the same board.** The scene fight starts from the strip positions (`SimOpts.board`) with the real cars as `BoardObject`s, so a chase ends in the street she was running down, in the places she was running through.

## Who else the strip gives a hand to

- **Police and Atlas set up ahead** (the "setting up defenses" idea): with a route reading, cruisers park across lanes (obstacles she has to find a way round), cops take the next junction, drones watch from poles (cameras). They are entities placed from `cutAcross`'s prediction.
- **Dragons**: wings ignore obstacles and cover but not `large` objects for sight; roofs and canopies break their line. Fleeing on foot stays hopeless in the open, possible through a market or into a building.
- **Bystanders**: crowd entities scatter, get run down (`run_down`), block pursuers, or call for help (`callWeight`). Traffic honks into noise (`makeNoise`), which travels along the strip.
- **Cameras along the street** log her (`camerasSeeHer`), with the same `camsDown` and blackout rules, so a chase is something a corp can watch.

## Phases (each shippable, tests green between)

0. **Street layouts and boards.** `streetLayout` builder (`layouts.ts` style, a `Draft` per class), `hasBoard` includes streets, ambient people and traffic as clock functions, fights on streets use the board. No chase change. Test: every street in sampled cities has one connected strip, junction per neighbour, doors for every exit.
1. **Chase reads it, advisory.** Chasers get ents; `gap` is derived from them but still moved by the old rolls; `squeeze/tight/setting` read local tiles. Existing chase tests must not move.
2. **Spatial hazards and `lose_them` destinations.** Obstacles ahead drive swerve/accident; `lose_them` picks a real feature; doorways and alleys hand over to the next board.
3. **Junction transitions and physical shortcuts** (`cross`/`cutAcross`), pursuers placed behind/ahead.
4. **Sight-based escape and search**: awareness drives losing a tail; search/hide/takedown; hand-off to the stealth board.
5. **Setting up ahead** (roadblocks, cutters, drones) and the dragon and crowd cases.

## Street types (phase 0, built: `streets.ts`)

A street's layout is chosen by what kind of street it is, from the last word of its name (the city names streets for what they are), a highway by its flag, and it varies with the seed. Size is 12 tiles to a hex cell along the way it runs.

| Kind | Layout |
|---|---|
| street, avenue, boulevard | strip with pavements, kerbside parked cars, lamps; the avenue has trees and kiosks, the boulevard a planted median with gaps to cross by |
| freightway | wide industrial strip with loading yards of container stacks either side |
| wharf | strip with a quay edge, the water beyond (off the map), bollards, a crane, containers against the warehouses |
| lane, row, run | narrow strips: parked cars and junk; a row has front steps; a run is two tiles wide and dark |
| walk, arcade | a broad promenade with trees, benches and kiosks; a covered arcade with rows of columns and lit shopfronts |
| plaza, concourse | open squares: fountain or statue with benches, trees and kiosks; a station hall with a grid of pillars and counters |
| bazaar, market | a maze of stall blocks with one-tile aisles and canopy that blocks sight |
| yard | a walled courtyard with one way in, a tree, crates and wrecks |
| alley, passage | cut out of solid building: a narrow dogleg with dumpsters and fire escapes, back doors in the walls; a passage is the same, dark, with pools of light |
| roof | a rooftop with a water tank, vents and aerials, and the stairheads for ways down |
| highway | lanes either side of a concrete barrier with gaps, wrecks, dark |
| crossing | when a street meets three or more others, usually: two strips crossing in a wider open space, an arm out to each side, blocks of building in the corners with doors in them |

The neighbouring streets on the hex grid become the ways on and off, on the side that faces them relative to the way the street runs: at an end, an open edge (every walkable tile is the exit); to the side, a mouth in the frontage. The doors of the places on the street are in the frontage. Cameras are on poles looking down the street. A street's people and parked cars are the same entities as everywhere else; positions follow the clock.

## Things still to decide

- **Plazas that span several hex cells** are bigger squares (14 + 5 per cell). If that is too small a space to run across, scale up.
