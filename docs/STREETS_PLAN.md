# Streets as boards, and how chases run on them (plan)

Status: all five phases are built (see "As built" at the end). Decisions taken: 12 tiles to a hex cell; no movement in the log except when something spatial happens; off-screen chases stay on the abstract engine; new rolls use their own `Rng`s so existing seeds keep their stories; and every kind of street has its own layout (below). Builds on `BOARDS.md` (persistent place boards, clock-driven positions, sight), `STEALTH.md` (awareness, cones, losing them) and `VEHICLE_COMBAT.md` (the chase engine, `chase.ts`).

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

A street's layout is chosen by what kind of street it is. That is data on the street (`Location.street`, a `StreetType`, `streettypes.ts`), set when the street is made (a made street gets the type its name says, a highway its flag; the hand-built ones are written out in `world.ts`) and read from there by everything that cares: how a car takes the street (`roadClass`, through `CLASS_OF`) and what its board looks like. Renaming a street does not change what it is, and a save from before streets had types is given them when it is brought forward. Two of the layouts below, the crossing and the shanty, are not types: a street of any of the long kinds turns into a crossing when it meets several others, and the slums turn some lanes into shanties. The layout varies with the seed. Size is 12 tiles to a hex cell along the way it runs.

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
| terrace | a hillside street in three tiers (levels 0 to 2), reached at the foot and left at the top, with steps, low walls, a ladder and a pipe between the tiers |
| shanty | (in the slums, for a lane, row, run, street or alley) shacks on shacks: roofs at levels 1 to 3 to walk across, ladders and drainpipes to get onto them, lanes between |
| crossing | when a street meets three or more others, usually: two strips crossing in a wider open space, an arm out to each side, blocks of building in the corners with doors in them |

The neighbouring streets on the hex grid become the ways on and off, on the side that faces them relative to the way the street runs: at an end, an open edge (every walkable tile is the exit); to the side, a mouth in the frontage. The doors of the places on the street are in the frontage. Cameras are on poles looking down the street. A street's people and parked cars are the same entities as everywhere else; positions follow the clock.

Several of the others have a raised part now and then (loading docks, a gantry over the market, a bandstand, a fire escape, a plant room on a roof); see `BOARDS.md`, "Height". Chases will use it: a way up is a way to lose someone, and a drop is a way down in a hurry.

## Things still to decide

- **Plazas that span several hex cells** are bigger squares (14 + 5 per cell). If that is too small a space to run across, scale up.

## As built

Phases 1 to 5 are in (`chaseboard.ts`, with the chase itself in `chase.ts`). Where the plan above and this differ, this is what the code does.

- **The line.** A chase on a street has a `ChaseBoard`: the line she runs along the street's board from where she came on (the door of the street she came from) to the way off she is making for, and how far along it she is. Each round she runs `pace x 2.2` tiles along it (`TILES_PER_PACE`), so a street is a round or two. A chaser is `gap` tiles back along the same line, or still on the street before if the gap is more than she has run (`chaserTile`). `gap` is still what the rolls use; the board is where it is.
- **How tight it is** is partly the street and partly what is round the line over the next dozen tiles (walls, stalls, parked cars, people): `squeeze` is 0.6 of the first and 0.4 of the second (`localSqueeze`). Where the line pinches between things (`pinches`), a crash or a stumble is a quarter more likely for each pinch, to two.
- **Ways out** (`outsFrom`): within ten tiles, a doorway into a building (a place that is open), an alley mouth, a way up (steps, a ladder, a pipe), or a knot of people to lose herself in. `lose_them` is on offer when the street is tight or there is a door, mouth or way up, and a doorway or a way up is a little more attractive. When it works she is where she went: inside the building, in the alley, up on the roof; she is not taken a few streets on as she was before. Cars cannot follow into either of the first two.
- **Turning off.** With a board, she turns off the street where the line runs out (after the first round), onto the street the route says or the one the old rule picks (an alley as soon as a car is behind her), and arrives in the door she left the last street by, with the chasers behind her on the street she left. A place with no board turns now and then as it did.
- **Fences, ducts and the rest.** The ways across the hex grid that are not doors (`Location.links`: a fence, a wall, a barricade, a duct, a way through a building, a ramp) are tiles on the street board, in the frontage like a door, with what is in the way marked beside them (`Door.via`). When she cuts across (`cutAcross`) she runs to the way across first (the chase event says which, `gate`), then goes over it as before (`cross`), and comes onto the far street by the matching tile. A way across is also an escape when she is looking for one (`lose_them`): she goes over the fence or through the duct, whatever is in the way is still in the way for what she is in (a car cannot take a wall), and if she is stuck on it they catch up. They are never the way on she is running for.
- **Sight** (`chaserSees`): a chaser sees her if they are within three tiles of her, or there is a line between them and she is within range for the light (a flyer sees over everything but a roof). If none can for two rounds, she has lost them (`escaped` when pursued, `lost` when she was the pursuer); the ones who lost her are left on the street alert and searching from where they last had her (`leaveSearching`), and stay there for the board to play out. Cameras that have her are eyes for the police.
- **The law ahead.** Police and Atlas chasers on a street she is running down sometimes (12 per cent, plus 4 for each point of heat, to 45) are already across the way on: when she is within fourteen tiles she sees it (`chase_block:ahead`), and at the block she gets through (a scrape) or is stopped (the chasers close to half a tile, and a car takes a heavy hit). A way out within reach makes `lose_them` much more attractive.
- **Not done**: bystanders as things to run down (the existing stumble still picks them from the street); catching a runner with a stealth takedown during a chase.
