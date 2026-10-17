# Motorcycles: plan

Status: **plan, nothing built**. Feel over balance: every number is a first guess, to be tuned by feel (or not at all).

Motorcycles are the other way to be fast. A car is a box: it takes the hits for her, hides her behind a door and kills her when it goes. A bike is the opposite: faster, thinner, nothing between her and the street. The point of the plan is that **a bike should feel like a different bet, not a smaller car**: more speed, more reach, hit-and-run, squeezing through traffic, and no cover to hide in. Everything below reuses the vehicle code as built (`docs/VEHICLE_COMBAT.md`), adding one idea (a vehicle has a *body*) and a short list of places where the body changes the rule.

## What exists today (what we are extending)

- `cars.ts`: `Make` / `MAKES` (per-name entries with `pace`, `maxHp`, `armor`, `seats`, `mounted`), `vehicleOf`, `normalize`, `hitCar` (guns lose armor off each hit), `blastInside` / `blastOutside` (flat 100 + 25 per armor inside, 40 + 10 outside), `SPILL` (30% of gunfire gets through the car), `carKey` / `keyTo` / `lifeOf` (keys, and how long a parked car keeps).
- `roads.ts`: `parkedVehicle` (one car per street from the run seed, or a chase stray), `assignKeys`, `roadsFrom` (street-to-street graph), `driveMinutes`.
- `vehicles.ts`: `hijack`, `getin`, `usekey`, `drive` (several streets a beat; `reachOf` from skill, car speed and condition), `boardParty` (companions fill `seats - 1`; the rest choose to wait or go home).
- `tactics.ts` / `techniques.ts` / `grid.ts`: cars as `BoardObject`s on cover cells (2 or 3 cells), `Unit.aboard`, `sheltered()` (shut doors: gunfire hits the car first), `get_in`, `drive_off`, `run_down`, `force_door` (melee foes), `explode`.
- `chase.ts`: `runChase` with a gap, `Stretch` (open / traffic / tight / bridge), range bands, her actions (`floor_it`, `swerve`, `shoot`, `ram`, `lose_them`, `bail`), `policeChase`, `dragonChase`, strays and keys on cruisers.
- `dragonmodels.ts`: `heroSpeed` reads the car (`paceOf` plus `driving / 10`); `legSpeed` is the board speed.
- Companions (`companions.ts`): `KindDef.seats` (scrapper 2, pigeon 0), `hero.waiting`.

## The design in one table

| | Car | Motorcycle |
|---|---|---|
| Seats (counting Blackbird) | 4 / 6 / 8 | **1 (solo) or 2 (with a pillion)** |
| Pace (board tiles a round) | 8 civilian, 10-12 police / Atlas | **11 civilian, 13-14 police / courier, 12 ganger** |
| Hit points | 60-200 | **20-50** |
| Armor | 0-5 | **0-1** (a bike has nothing to hide behind) |
| Cover on the board | 2-3 cells, a place to sit with doors | **1 cell, ordinary low cover; no doors, nobody sits inside** |
| Gunfire at the rider | hits the car first, 30% gets through | **hits the rider; the bike takes a share** (see below) |
| When it is destroyed | everyone inside takes 100 + 25/armor | **a smaller flat bang, `BIKE_BLAST = 35` + 10/armor, plus being thrown** |
| Forcing the door | melee foes spend an action to open it | **no door: melee just hits her** |
| Bailing at speed | big fall, likely injury | **cheaper fall; she can always do it** |
| Traffic and tight streets | skill helps | **skill and the bike's size help a lot** (`lane_split`) |
| Hijack | roll, harder for police and Atlas | **easier (no doors to beat), same heat rules** |
| Left parked | `CAR_LIFE_MIN` (2 days civilian), x3 with the key | **three quarters of that** (bikes walk off), same key rule |

The explosion rule stays "flat, so a tougher Blackbird crawls out", it is just a smaller flat number: a level 1 Blackbird (90 hp) survives a bike going up, a hurt one doesn't. Bikes are survivable and frequent; cars are rare and lethal. That is the risk and reward flipped.

## Data

```ts
// cars.ts
type Body = 'car' | 'bike';

interface Make {
  // ...existing
  body: Body;                 // NEW. default 'car', so every existing make is unchanged
}

// types.ts
interface Vehicle {
  // ...existing
  body: Body;                 // NEW. `normalize` fills 'car' for an old save
}
```

New makes (`MAKES` gets a `body: 'bike'` group per `kind`, or a `bikes` list on each kind):

| Name | Kind | Pace | hp | Armor | Seats | Notes |
|---|---|---|---|---|---|---|
| a rattling delivery scooter | civilian | 9 | 20 | 0 | 2 | the slowest, the commonest |
| a battered commuter bike | civilian | 11 | 30 | 0 | 2 | |
| a street-tuned crotch-rocket with a neon spoiler | civilian | 13 | 25 | 0 | 1 | the fast one, the fragile one |
| a ganger's chopper with a skull on the tank | civilian | 12 | 40 | 1 | 2 | `ownerGang`: its keys come off a ganger |
| an NPD patrol cycle | police | 13 | 40 | 1 | 1 | mounted: `ram` |
| an Atlas courier bike, white and humming | atlas | 14 | 35 | 1 | 1 | the fastest thing on the street |

`kind` keeps its meaning (whose it is, so who is angry); `body` says what it is. A "ganger's chopper" is a civilian make whose keyed owner is tagged `ganger`; no new kind is needed.

## Rules by place

### Parking and hijacking (`roads.ts`, `vehicles.ts`)

- `parkedVehicle` rolls a body after the kind: bikes are commoner in tenement, slum and market streets, rare in corporate ones (a weight per district, first guess 35% / 35% / 25% / 10%). One vehicle per street still (a second slot is an open choice below). The id suffix gets the body so keys and flags don't collide.
- `hijack`: bikes get `+0.1` on the chance (no door to beat), police and Atlas bikes keep the `-0.1`. The heat rules do not change: seen means NPD heat, an NPD bike is NPD heat, an Atlas bike is Atlas heat, always. Getting on is one action, quicker than getting into a car (`hijack` minutes 6 to 4 for a bike).
- `assignKeys` / `driverOf` work unchanged: the rider is the driver; a bike with nobody around is keyed to a bystander at random, as for a car. The ganger rule already covers a chopper.
- `lifeOf` multiplies by `0.75` for a bike before the key rule. A ganger's or a cop's bike still gets no key bonus.

### Getting around (`vehicles.ts`, `roads.ts`, `dragonmodels.ts`)

- Bikes are quick: `Make.speed` 1.4 (civilian), 1.6 (police), 1.7 (Atlas courier) in the existing `reachOf` multiplier, and `driveMinutes` for a bike is `ceil(hops / 6)` (cars `/ 4`). `heroSpeed` needs no change: it already reads `pace`.
- One new reach: **bikes can use the narrow ways** (`tunnel`-kind exits and the alley streets a car can't take). `roadsFrom` gets a `body` argument and lets a bike through exits a car can't (an open choice below says which exits). That is what makes the district feel closer on a bike, not just faster.
- **Weather matters**: acid rain and neon fog are one line each on bikes (`situation.weather`): rain slows a bike (`pace * 0.85`) and doubles the fall injury chance; fog doesn't matter. Heatwave nothing. (Optional; first to cut.)

### Riders (`vehicles.ts`, `companions.ts`)

- `seats` counts Blackbird, so a solo bike has no room for anyone and a pillion bike room for one companion.
- Companions that **fly** (the drone, the cyber-pigeon) don't need a seat: they follow alongside, and a pigeon already takes 0. This gives bikes a party that is not empty. A `KindDef.flies` flag (a drone, a pigeon) makes `boardParty` skip the seat count for them; they are `aboard`-less on the board and arrive at the street with her.
- Everyone else who doesn't fit chooses to wait or go home, exactly as with a car (`boardParty` is unchanged apart from `flies`).

### The board (`tactics.ts`, `techniques.ts`, `grid.ts`)

- A bike is a `BoardObject` of **one cell** (`size: 1` in `parkCars`: cars use `seats >= 6 ? 3 : 2`). `grid.addObjects` already handles size.
- **No shelter.** `sheltered(u)` is already `doors === 'shut'`; a bike's object gets `doors: 'forced'` from the start, so nobody is ever "aboard and protected", and `force_door` is never offered for one (it needs `sheltered`). `Unit.aboard` still exists and means *mounted*, see below.
- **Cover as before**: a bike is ordinary cover while she stands behind it (the existing `coverObject` rule: a shot that misses behind it hits it). It has little hp, so it goes quickly.
- **Mounted** (`Unit.aboard` on a bike): replaces sitting-inside with riding. A mounted unit gets `+3` board speed (a bike under her), `-0.1` to hit with ranged weapons, can't throw, and is *not* in cover: `sheltered()` is false. Getting on is `mount` (renamed `get_in` for a bike) for a move action; getting off is walking, as now.
- **Gunfire at a mounted rider**: no shut door, so no car-first rule. Instead each hit splits: 50% of the damage lands on the bike (`hitObject`, 'gun') and 50% on the rider. That keeps the bike in the fight (a shot can wreck it under her) without making it armour.
- **`ride_by` (new)**: the bike's signature technique. With a clear run of 3+ tiles she moves, makes one attack at the end at `+0.1` to hit (ranged or melee), and takes the rest of the movement as a free move the next turn (`stagger` for the foe if it was a melee hit and she kept going). This is the feel of a bike in a fight: in, hit, out. Scored like any other technique (`strikeValue` plus a bonus for ending the move out of reach).
- `drive_off` (`ride_off`): as for a car but works from beside the bike *or* mounted and never fails; it is also the cheapest way out of a fight she is losing. `run_down` works from a bike with `pace * 3` damage and a lower car-hp cost (a bike takes more: `maxHp * 0.15`).
- **When the bike is destroyed** (`explode`): the bang is `BIKE_BLAST = 35` flat plus `10` per armor to the rider and the pillion (`blastInside` becomes `blastFor(v)`: car formula for a car, bike formula for a bike); `blastOutside` for a bike is `15` (adjacent only). **She is also thrown**: if mounted, she takes a fall (`pace` times a small factor) on top, lands on the nearest free tile, `stagger = 2`, and a `broken_leg` / `cracked_ribs` roll at the existing `maybeInjure` chance. The wreck flag and the permanent shell work as for cars, as a 1-cell shell.

### Chases (`chase.ts`)

- The `Chaser` / `Chase` shapes don't change. The `Make`'s `pace` is already what moves the gap; **bikes win it on pace** (13 against a cruiser's 11) and **on the road**: `Stretch` modifiers get a `body` term.
  - `tight` and `traffic`: a bike adds `+1` to the skill term in the drift (it fits where cars don't) and `+0.15` to `lose_them`.
  - `open` and `bridge`: no bike bonus.
  - A bike against a heavier foe loses `ram` outright: it takes `rel * 1.2` where a car takes `rel * 0.5`, and the foe takes `rel * 0.3`.
- **No car-first shelter**: the spill rule is replaced for a bike by the same 50/50 split as on the board: half of each hit damages the bike (`hitCar`), half the rider (`h.hp -= taken`). Her `hp` goes down faster than in a car; the bike goes down slower.
- **`lane_split` (new action, bikes only)**: in `tight` or `traffic`, cuts the nearest car-chaser's gap advantage for a round (`gap += 1.5 + skill * 0.2`) and makes it miss (`hit chance -0.2`); on a bike it is the cheap version of `lose_them` that doesn't end the chase but keeps her out of range. Listed in the action table beside `swerve`.
- **`bail` is cheap and always there**: bikes use `heroSpeed * 0.7` for the fall (cars use `* 1.2`) and the bike isn't lost to the pursuers; it is left in place, a stray, hers to come back for. A bail from a bike is the usual way a bike chase ends well.
- **Being rammed or shot down** dumps her (`bailed`) rather than ending in a bang: a car ramming a bike at `locked` has a `power`-based chance to throw her, like a door forced on a car.
- **New foes**: police on bikes (`NPD patrol cycle`, one rider each, pace 13) are a chase archetype: `cruisers()` becomes `pursuers()` (cars carry two officers, a bike one). At high NPD heat in a city with fast streets they are the ones who can keep up with a bike.
- Dragons need nothing new: `dragonChase` takes `heroSpeed`, so a civilian bike (11 + driving) is a better chance at Hermes Mk. III (12) than a civilian car (8), though not as good as a police car or an Atlas courier bike (14).

### Text and UI

- Every car line in `text.ts` keys on `d.car`/`d.kind` and a car's name; bikes need their own verbs ("swings a leg over", "the engine catches", "lays it down", "straddles", "the bike goes out from under her"). Add a `body` field to `car_hit`, `car_wreck`, `car_drive_off`, `car_run_down`, `vehicle:*`, `hijack:*`, `drive:*` events and pick between two sets of lines the way `heat_up` already branches on `source`. New events: `ride_by`, `lane_split`, `car_thrown` (the fall when the bike goes). A test that renders every event keeps these honest.
- `NightViewer`'s status line already says `{name} ({state}, hp/maxHp)`; it needs nothing, since a bike's `name` reads right.
- No new skill. `driving` covers bikes (an open choice below asks about a `riding` skill).

## Phases

0. **Data, no behaviour change**: `Body`, `Make.body` / `Vehicle.body` with `'car'` defaults and `normalize`; `blastFor`; per-body `lifeOf` factor; the bike makes in `MAKES`; `KindDef.flies`. Everything existing passes untouched; bikes can't be seen yet.
1. **Parking, hijack, keys, drive**: bikes on streets (`parkedVehicle` rolls a body), the easier hijack, `boardParty` with `flies`, `reachOf` / `driveMinutes` for bikes, the narrow-ways exits. Text for `hijack`, `drive`, `vehicle` events with `body`.
2. **The board**: 1-cell objects, `mount` / `ride_off`, the 50/50 split, `ride_by`, the bike bang and the throw, `run_down` from a bike, text.
3. **Chases**: `body` terms in `Stretch`, `lane_split`, the cheap `bail`, being thrown, `pursuers()` and NPD bikes, text.
4. **Tests, text, UI**: a render test for every new event; save compat (an old save with no `body`); the sim run with bikes enabled in `npm test`-sized samples.

Order is the order above; each phase stands alone and `npm test` stays green between them.

## Tests

- Cars are unchanged: the existing vehicle and combat tests pass with no edits, because every default is `'car'`.
- Parking: bikes appear by district, one vehicle a street, ids don't collide with a car's, a bike's key opens a bike and not the car beside it.
- Bang: `blastFor(bike) = 35 + 10 * armor`; a level 1 Blackbird (90 hp) survives a bike going up at full health; she is thrown and staggered; an NPD bike is more than a civilian one.
- Board: a bike is one cell, never `sheltered`, never offers `force_door`; gunfire at a mounted rider splits between the bike and her; `ride_by` moves, hits once, and can be chosen; `ride_off` works from beside the bike.
- Chase: a bike beats a cruiser's gap in `traffic` more often than a car does; `lane_split` appears only on a bike; a bail from a bike leaves a stray bike (keyed to its owner); a car ramming a bike can throw her.
- Seats: a solo bike takes no companion and says so; a pillion bike takes one; a drone and a pigeon come along either way.
- Dragons: Hermes Mk. III is catchable in a fast bike (14) and not in a delivery scooter (9).
- Text: every new event renders with no `[type:variant]` placeholder.

## Open choices (defaults assumed unless you say otherwise)

- **A second vehicle slot per street**: no, one a street for now, so a street has a car *or* a bike. (A second slot is easy once `parkedVehicle` returns a list.)
- **Which exits only a bike can take**: `tunnel`-kind streets and the alley-roles; nothing with a `gate` and no hidden ones. If it makes the city feel too small, narrow it to tunnels.
- **A `riding` skill**: not yet. Bikes use `driving`; if it should be its own, it spills 0.4 into `driving` and the other way, and `hijack` keeps spilling into both.
- **Helmets**: not in this plan. A helmet as armor that cuts the fall and the concussion chance is the obvious next item.
- **Weather**: rain slowing a bike is in as optional; cut it first if it clutters.
- **Wheeling a bike indoors**: no. It is left on the street like a car, three quarters as long.
- **Balance**: a bike makes her fast and the cheapest to get out of a fight with, but the first to be shot. If she turns out to be nearly uncatchable on a bike in a chase, that is the intended fantasy; note it and carry on.

## As built

Everything above is in, with these differences and choices:

- **Makes**: `Make.body` / `Vehicle.body` (`'car'` by default; `normalize` fills it for an older car). Bikes are appended after the cars in `MAKES`, so every car kept its place. `makesOf(kind, body)` picks a body's makes. Civilian: delivery scooter (9, 20 hp, 2 seats), commuter bike (11, 30), crotch-rocket (13, 25, solo), a ganger's chopper (12, 40, armor 1); NPD patrol cycle (13, 40, armor 1, solo); Atlas courier bike (14, 35, armor 1, solo).
- **Bang**: `blastInside` is body-aware: `BIKE_BLAST = 35` plus 10 per armor, outside 15. A bike also throws her: `pace * 0.8` fall damage on top, a `stagger` of 2, and a 50% injury roll (cars: 100%). A level 1 Blackbird at full health lives through it.
- **Parking and hijack**: `parkedVehicle` rolls the body from its own stream (so the cars kept their luck), by district (tenement and slum 35%, market and nightlife 25%, industrial 20%, corporate 10%, near police 10%); a bike's id ends `:bike`. Hijack is `+0.1` easier on a bike. `lifeOf` multiplies by `BIKE_LIFE = 0.75`; the key rules are unchanged. (The hijack action still takes the same six minutes: the action-minutes table is keyed by action, not by body.)
- **Driving**: bikes have a bigger `Make.speed` multiplier, `driveMinutes(hops, body)` is `ceil(hops / 6)` for a bike, and `roadsFrom(..., body)` lets a bike through tunnels (never stopping in one: `drive` restores the bike if `relocate` would park it there).
- **Riders**: `KindDef.flies` (the drone and the cyber-pigeon). On a bike a flyer takes no seat and comes alongside; on a car nothing changes.
- **Board**: a bike is a one-cell `BoardObject` with `doors: 'forced'` from the start, so it is never somewhere to hide and a foe's `force_door` finds nothing to open. `mount` (a move action) puts her on it; mounted she has `+3` board speed, `-0.1` to hit with ranged weapons, can't throw, and **the bike moves where she moves** (`rideTo`: it stays behind only if she ends on an exit or hazard). Gunfire at a mounted rider is split 50/50 with the bike. `drive_off` and `run_down` work from a bike (a bike pays `15%` of its hp for a run-down, a car `7%`).
- **`ride_by`**: a technique offered only when mounted, and only for a run of three or more tiles: one attack at `+0.1` to hit and `x1.25` damage, with a bonus to its score. (The plan's "free move on the next turn" was left out: the planner already lets her run again on her next turn.)
- **Chase**: `lane_split` (bikes only, in tight streets and traffic: the nearest chaser's gap grows and its fire is worse), `+1` to the skill term and `+0.15` to `lose_them` for a bike in tight streets and traffic, the 50/50 split instead of the car-first shelter, a ram that costs a bike `1.2x` and the foe `0.3x` against anything bigger, and a car ramming her bike can throw her (`bailed`). `bail` from a bike is the cheaper fall (`heroSpeed * 0.7`) and leaves the bike as a stray on that street.
- **Pursuers**: `pursuers(cops, rng)` replaces `cruisers` (kept as an alias without a bike): one cop in three comes alone on an NPD patrol cycle (pace 13).
- **Text**: `type:variant:bike` and `type:bike` lines are looked up first when an event carries `body: 'bike'`, so a bike gets its own words where it differs and falls through to the car lines where it does not. New lines for `ride_by` and `lane_split`.
- **Not built**: the rain penalty (weather), a `riding` skill (bikes use `driving`), helmets, a second vehicle slot per street.
