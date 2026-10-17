# Fighting from vehicles: schema sketch

Status: **built** (see "As built" at the end for where it differs). Feel over balance: every number is a first guess, to be tuned by feel (or not at all).

Vehicles exist (`engine/src/vehicles.ts`): she can hijack a parked car, drive it several streets a beat, and a car she
took stays hers, parked where she walked into a building, until it is towed or recovered (`CAR_LIFE_MIN`). This sketch adds
fighting from them, in two modes that share one damage model:

1. **Running fight** (a chase): it happens *at speed*. A car chase with the police, tailing Hermes Mk. III, bailing from an
   Ares Mk. IV. No board; a gap and a handful of range bands.
2. **Scene fight** (the car as a thing on the board): an ordinary fight on the fight grid, on a street, with the car as
   cover that can be shot to pieces, driven off in, or used as a weapon.

Both: the car **has hit points, takes damage, and is eventually destroyed** (and stays destroyed).

## What exists today (what we are extending)

- `Vehicle` / `ParkedVehicle` / `Hero.vehicle` / `Hero.parked` (`types.ts`): kind (`civilian | police | atlas`), name,
  `speed` (a reach multiplier, not a board speed). `relocate` (`combat.ts`) parks the car when she goes indoors.
- The fight board (`grid.ts`, `tactics.ts`): a small grid, eight-way movement, `Terrain = floor | wall | cover | hazard | exit`.
  **Cover** blocks movement, shots pass over it, and a unit behind it is harder to hit (`grid.ts`, the line-of-sight/cover check).
  `Unit` has `speed`, `flying`, `reach`, status effects (`burning`, `slow`, `pinned`, ...). `Sim` is built from `SimOpts`
  and driven by `fight()` in `combat.ts`, which wraps it in a nested `fight_start` event.
- **Speed is already one number on one scale**: `dragonmodels.ts` documents `heroSpeed(w)` as "the seam for vehicles";
  `runsDown(w, speed)` decides whether she closes the head start on a `swift` dragon (Hermes Mk. III, speed 12, is
  uncatchable on foot, "until vehicles exist"); `relentless` dragons (Ares Mk. IV, speed 10) can't be fled on foot.
- Police response (`npdResponse` in `run.ts`), ambush groups (`spawnGroup`), witnesses and heat (`witness.ts`, `addHeat`).
- Injuries (`hasInjury`, `maybeInjure`) and `burning` already exist for crash and explosion fallout.

## Shared model: the car as a combatant

```ts
// types.ts: extend Vehicle (and so ParkedVehicle). Damage persists, parked or driven.
interface Vehicle {
  kind: 'civilian' | 'police' | 'atlas';
  name: string;
  speed: number;        // today: reach multiplier for drive(); stays as is
  pace: number;         // NEW: top speed on the fight-board scale (tiles a round). civilian 8, police 11, atlas 10
  hp: number;           // NEW
  maxHp: number;        // NEW: civilian 60, police 140, atlas 120
  armor: number;        // NEW: flat cut from gunfire, not from rams or fire. civilian 0, police 3, atlas 2
  mounted?: 'gun' | 'ram';  // NEW: police and Atlas fleet cars may have one; a civilian car never does
  seats: number;        // NEW: everyone aboard, counting Blackbird. 4 for most cars, 6 for larger ones, 8 for a few (vans, fleet vans)
  riders: Id[];         // NEW: the companions aboard right now, at most seats - 1 seat-units (see "Riders")
  // and the existing fields; ParkedVehicle adds at / until
}

type CarState = 'sound' | 'scuffed' | 'battered' | 'smoking' | 'wrecked';   // by hp fraction: >.75 / >.5 / >.25 / >0 / 0
```

- **Condition changes how it drives**: `pace` and her drive reach scale by `0.5 + 0.5 * hp/maxHp`; `smoking` can stall a
  chase round. Condition is also the text key (`car_hit:scuffed`, `car_hit:smoking`), so damage is visible in the log.
- **Destroyed means destroyed**: at 0 hp the car leaves `hero.vehicle` / `hero.parked` for good and the street gets a
  `w.flags['wreck:<locId>']` (a burnt-out shell that later scenes on that street get as permanent cover). A wreck is never
  recovered and never towed.
- **The explosion is what makes a car dangerous to sit in.** A car that reaches 0 hp *explodes* (every kind of car; fuel,
  batteries, a mounted gun's magazine), and **everyone inside takes the same flat damage**: her and every rider. It ignores
  `armor` as protection, cover and level, but **the car's armor makes the bang bigger**: `CAR_BLAST = 100` plus
  `CAR_BLAST_PER_ARMOR = 25` per point of armor (`blastInside` in `cars.ts`). A civilian car (armor 0) is 100: Blackbird starts at
  90 max hp and gains about 13 a level, so **it flatlines a level 1 outright, a level 2 at full health crawls out with a few hp, and
  anyone tougher walks out hurt**. A police cruiser (armor 3) is 175 and an NPD riot van (armor 5) is 225: a good car soaks gunfire
  all night and then takes a level 5 with it. The risk is the price of the reward. A hurt character of any level can still die: it is
  flat, not a share of max hp. It also sets the occupants `burning` and rolls an injury. A companion with fewer than 100 hp (every
  kind in `companions.ts` today) is simply killed. Anyone *outside* the car takes a smaller flat blast, `CAR_BLAST_OUTSIDE = 40` plus
  10 per armor, adjacent cells only (Mode 2). Speed in a chase doesn't change it.
- **She gets a warning.** `smoking` (below 25% hp) is the cue: text says so, and getting out is a `smart` desire the AI feels
  strongly. Bailing from a smoking car at speed costs fall damage but not the blast, and she can drag riders out only if she
  has a free action for each (`bail` takes one rider per round, the rest stay in and go up with it).
- **Repair** is a `tinkering` action at a street with her car (and, later, a garage place): spend cash/time for hp.
  Optional for the first version: a damaged car simply stays damaged.
- **Whose car it was still matters**: damaging or wrecking an NPD car adds NPD heat; an Atlas car, Atlas heat (reuse
  `addHeat`, source `'vehicle'`). A civilian car has an owner nobody models yet: no heat, a memory line on witnesses.
- **`heroSpeed` learns vehicles** (`dragonmodels.ts`): `max(legs, car.pace * condition)` while `hero.vehicle` is set. That one
  change makes Hermes Mk. III catchable (police car 11 plus driving skill against its 12) and lets her outrun an Ares Mk. IV
  (10). Skill nudges it: `pace + driving / 10`, so a good driver in a civilian car is quick but never quicker than a police car.

## Mode 1: running fight (a chase)

A chase is its own small engine, `engine/src/chase.ts`, parallel to `Sim` but with no grid. It reuses `Hooks`, `foeProfile`,
the nested-event pattern from `fight()`, and the same `Unit`-style damage routing (`ref.hp` takes the damage directly).

```ts
type Band = 'far' | 'near' | 'close' | 'locked';     // locked: bumper to bumper, boarding and ramming
type Stretch = 'open' | 'traffic' | 'tight' | 'bridge';  // from the street kind and district; who it favours

interface Chaser {
  id: Id;
  name: string;
  side: 'hero' | 'foe';
  ref: { hp: number; maxHp: number };     // Hero, Npc or Companion: what a bullet lands on
  ride?: Vehicle | 'wings';               // a car, or a dragon flying (flyers ignore Stretch)
  pace: number;                           // board-scale speed this round (car pace x condition, or dragon speed)
  band: Band;                             // relative to the hero (hero's own entry is 'locked' to herself)
  alive: boolean;
}

interface Chase {
  chasers: Chaser[];
  gap: number;                            // tiles between the hero and the lead foe; maps to Band
  stretch: Stretch;                       // rerolled every round or two
  rounds: number;
  maxRounds: number;
  result: null | 'caught' | 'escaped' | 'wrecked' | 'bailed' | 'won' | 'arrested';
  from: Id; to: Id;                       // where it began, and the street it ends on (a few hops on)
}
```

**Round.** Gap moves by pace difference plus a driving check (`synergy(h, ['driving', ['stat:reflex', .5]])`, with `Stretch`
modifying: `open` favours pace, `traffic` and `tight` favour skill, `bridge` is a straight pace race with a fall for the loser).
Then each chaser takes one action from what its band allows:

| Action | Band | Does | Skill |
|---|---|---|---|
| `floor_it` / `drop_back` | any | change gap by ±pace/2 at a hp cost to the car if redlining | driving |
| `swerve` | any | dodge this round's incoming fire/ram, costs a little gap | driving, reflex |
| `shoot` | near, close | weapon fires from the window; `weaponReach` mapped to bands; pistols close, rifles near; accuracy minus speed | marksmanship |
| `ram` | close, locked | car-on-car: damage both by relative pace, bigger car wins, may spin the loser (loses a round) | driving, muscle |
| `board` / `jump` | locked | leap to the other vehicle or onto a flyer; ends the chase in a scene fight there (Mode 2, on a moving platform) | athletics |
| `bail` | any | jump out; fall damage by pace, likely injury, ends chase as `bailed`; the car is lost to the pursuers (wrecked in place) | athletics |
| `lose_them` | tight, traffic | break line of sight into a side street; ends as `escaped` on a successful check against the leader's `alertness` | driving, sneak |

**Damage routing.** A shot at the hero first checks the car: roll against `Vehicle.armor`, then the car takes the hit
(`hp -= dmg - armor`) and a spill-through share lands on her (30% on a clean hit, more on a crit or when the car is
`smoking`). That's the whole "car as armor": she is safer in a good car and in much more trouble as it falls apart, and the end of the car is the end of her cover *and* a bomb. Fire and
rams ignore `armor`. At `hp <= 0` the car wrecks (above), the chase ends as `wrecked`, and she is thrown out into the
nearest street to carry on on foot (or into a scene fight with whoever survived and is still on their wheels).

**Chase vs dragons.** `chase_flight` (`dragons.ts`) today is `runsDown(w, m.speed)` and a bad outcome. With a vehicle it
becomes a `Chase` with the dragon as a `ride: 'wings'` chaser: flyers ignore `Stretch`, don't get `swerve` penalties, and a
`swift` dragon starts at `HEAD_START` tiles. To win she needs to reach `locked` (then `board`, or shoot at point blank). A
Hermes Mk. III (`untouchable` on foot) is now an event with a payoff: cargo, fame, a dragon kill. Ares Mk. IV (`relentless`):
fleeing it on foot is impossible; in a car it is a chase she can lose, so the scream becomes "run to the car".

**Chase vs police/Atlas.** `npdResponse` / the Atlas retrieval ambush (`run.ts`) gain a vehicle branch: if she is driving at
heat >= 3, spawn cruisers as foe `Chaser`s (`pace` 11, `mounted: 'gun'`), `Chase` starts, `escaped` drops heat a step, `arrested`
is the old arrest result. Hijacking a *police* car while a cop stands by starts a chase on the spot.

**Event shape**, to match `fight_start`/`fight_round`: `chase_start` (nested group), `chase_round` (one line a round: gap, stretch,
what happened), `car_hit` (variant = `CarState`), `car_wreck`, `chase_end` (variant = result). Text keys per family so
the "every event has text" test stays green: `chase_round:ram`, `chase_round:swerve`, ...

## Mode 2: scene fight (the car as part of the board)

The fight stays an ordinary `Sim` on an ordinary street grid. A vehicle becomes a **board object** laid over `cover` cells, so
movement, line of sight and cover already work and nothing in `tactics.ts` has to learn a new terrain.

```ts
// grid.ts
interface BoardObject {
  id: string;
  cells: Pos[];                 // a car is 2x1 or 1x2 cover cells, a van 3x1
  ref?: Vehicle | ParkedVehicle;// the real car (hp lives on it, so damage persists)
  hp: number; maxHp: number;    // for wrecks and other props with no ref: the wreck's own hp
  explosive: boolean;           // fuel and batteries: true on a car with hp left
  mine: boolean;                // hers (she can drive it)
  team?: 'hero' | 'foe';        // a cruiser the police are sheltering behind
}
interface Grid { /* ...existing */ objects?: BoardObject[] }
```

- **Placement**: `makeGrid`/`Sim.place()` put her own car (`hero.vehicle` or a parked one on this street) beside her start,
  other parked cars on the street (`parkedVehicle`) as neutral objects, and foe vehicles (police cruisers, a gang's van) by their
  side. Buildings have no cars. A `wreck:<locId>` flag adds a burnt-out shell as permanent, hp-less cover.
- **Cover that takes damage**: today a unit behind cover is simply harder to hit. Now when a shot would have been absorbed by
  the cover (the existing "mid cell is cover" check) the **damage lands on the object** instead of being thrown away, reduced by
  `armor`. The object's `ref.hp` is updated directly, so the car carries the damage out of the fight. Area attacks and fire hit
  every object in the blast. Stray fire can wreck *other* people's cars too (witnesses, owners, a heat line).
- **Wrecking**: at 0 hp the cells turn from `cover` to `hazard` (burning wreck) for a few rounds, **if `explosive`** adjacent units take
  a blast (`burning` plus damage by `maxHp`), and the car is gone from her garage as in the shared model. A wreck that still
  stands afterwards is hp-less cover.
- **New actions for the car on the board**, in `Sim`'s option scoring alongside the existing ones:
  - `take_cover`: scored higher the closer a car is and the more shots are incoming (cover scoring already exists).
  - `drive_off`: if she is adjacent to her own car with hp, she can get in and leave the fight. It's a new `TacticalResult`,
    `'drove_off'`, resolved like `flee` but never failing against foes without a vehicle (and a chase starts if they have one).
  - `run_down`: the car moves in a straight line this turn at `pace` tiles, hits whatever is in the path (damage by pace and
    weight, a shove into the next cell), at a cost to the car's hp. Needs a clear line of cells, so a crowded street resists it.
  - `ram_cover`: smash a foe's cruiser out of position (moves the object; units it was covering lose cover).
  - `shoot_from_car`: when inside, she fires over the door: the car is hers as cover with no cell between, and `flying`-style
    reach. Foes can still hit her through it; damage is routed as in the chase (car first, a share spills through).
  - `force_door` (a foe's action, see "Doors"): a melee opponent adjacent to the car pries it open and she loses the car as cover.
- **Foe vehicles** are the same object. Police cruisers have `team: 'foe'` and cover foes; destroying one is NPD heat; a
  dead cruiser is a wreck for the rest of the fight.

## Doors: melee gets her out of the car

Being *inside* the car (aboard) is the strongest cover, so it has a counter that doesn't need a gun: **melee opponents can force
the door as an action.** On the board, a unit is either *behind* the car (ordinary cover, as above) or *aboard* it:

```ts
// tactics.ts: Unit
aboard?: string;            // BoardObject id: the car she (or a rider) is sitting in
// grid.ts: BoardObject
doors: 'shut' | 'forced';   // forced is permanent for the fight; the car can be got back into, but gives no cover
```

- **Why aboard is good**: foes that aren't adjacent have to damage the car to get at her (damage routed car-first, spill-through
  a share), and `shoot_from_car` needs no cell between her and the window. Armor and `hp` matter.
- **`force_door`** (any foe with melee reach, adjacent to the car, aboard targets only): the action's chance is
  `base - car.armor*k - (door already dented? bonus)` plus `muscle` (the bigger the foe the better) and gets a bonus once the car
  is `battered`; a failure dents it (`+bonus` next time) and costs the foe its action. **On success `doors` becomes `'forced'`
  and every unit aboard is hauled out onto the nearest free cell beside the car**, losing in-car cover (they're now just
  standing next to ordinary cover) and taking a round of `stagger`. The car can be got back into (`get_in`, a move action, no
  cover while the doors hang open), still burns, and can still be driven off, so she can race the foes back to it.
- **Counters**: driving off (`drive_off`) before they're adjacent; a rider with `absorb` assist (a scrapper-bot) can `interpose`
  at the door (the existing `interposed` flag) to absorb the first forced attempt; killing the foe first.
- **In a chase**, `locked` band is the same thing: a melee foe (or a dragon with a claw) in the `locked` band can `force_door`;
  success ends the chase as `bailed` (she is dumped out at speed: fall damage by `pace`, a chance of injury) and the car is
  left to whoever took it. Driving at speed is the counter: `pace` above the foe's removes the chance (`locked` is only
  reachable if the gap closes).
- **Dragons**: flyers and `ares4` can force doors too. A ram-plated Ares is the one that does it with a roof-first rip.

## Riders: companions in the car

Companions already travel with her (`hero.companions`, up to `MAX_COMPANIONS = 3`, `companions.ts`). A car adds a *seating limit*:
`Vehicle.seats`, the number of **seats**, counting Blackbird (so **4 seats = her and up to 3 companions**; 6 seats = up to 5; 8
seats = up to 7), and she **chooses who comes**. Companions take **seat-units** from the rest.

```ts
// companions.ts: KindDef
seats?: number;             // seat-units it takes; default 1. scrapper-bot 2 (it's big), pigeon 0 (it rides her shoulder)
// With MAX_COMPANIONS at 3, a 4-seater takes the whole party; the 6 and 8 seaters are for a bigger party later.
// types.ts: Companion
at?: Id;                    // NEW: set when she left them behind: they wait on that street, not with her
```

- **Choosing**: when she gets in a car (a hijack she wins, or `getin`) with more companions than seats, she picks within capacity.
  The AI chooses by a score (the same ones `Sim` uses to value an ally: `assist.dmg` / `absorb` / `disable`, hp fraction, and
  `loyalty`); the big tanks lose out only to small gunners if seats are short. She can also prefer to leave a wounded one
  safe. A `choose_riders` step emits a `riders` event ("Blackbird squeezes in the drone and the kids; the scrapper-bot
  stays on the kerb and watches them go") and `Vehicle.riders` holds the ids.
- **Left behind**: those not chosen get `Companion.at = <street>` and stop counting as in her party for fights (they aren't
  units on the board). **Each one decides for itself whether to go home or stay where it is**, once, when she drives off: a
  weighted choice from the companion (`loyalty` and the kind: loyal ones and anything with no home stay put and wait; low-loyalty
  or homebody ones, `Companion.home`, and NPC-born ones go home). **Stay**: it waits on that street and rejoins on its own if she
  comes back to it (arrival check, `companion_waits` / `companion_rejoins`). **Go home**: `removeCompanion(c, comp, 'left')`, as
  today, and they return to wherever `home`/`npcId` says. No catching up on foot, and no timer: waiting ones wait for the rest of
  the run.
- **Parking indoors**: she goes in and riders go with her (they were never the car's); no separate state. Only the *drive*
  and the *scene fight on the street* care who is aboard.
- **In combat**: riders are `Unit`s with `aboard` set, so they share the car's cover, take the explosion with her, and can
  be hauled out when the door is forced. In a chase each rider with an `assist.dmg` adds a small shot to her `shoot` action
  (a drone out the window); `absorb` riders absorb damage that spills through (the pigeon takes it, then it dies). Riders
  are lost with the car (an explosion can kill them and they're simply gone from `hero.companions`), which is the other
  half of why bringing everyone is a choice, not free value.
- **Capacity by car**: 4 seats for most cars (civilian cars, police cruisers, Atlas SUVs), 6 for larger ones (taxis, delivery vans,
  Atlas executive limos), 8 for a few (fleet vans, minibuses). Which make has which is a field on the make table in `vehicles.ts`
  (today every car is rolled from `CARS[kind]`; this becomes a per-name entry).

## Where the two modes meet

- A scene fight can become a chase (`drive_off` with a pursuer who has wheels or wings), and a chase can become a scene fight
  (`board`, `bail`, a crash into a street, `locked` at a standstill). Both pass the same `Vehicle` and `Hero`, so hp and
  damage carry over.
- A chase's *last* round is the scene fight's *first*: the new `FightOpts.arrival: 'crash' | 'boarded' | 'dismounted'` seeds the
  starting positions and a round or two of `stagger`.
- All three of: `Chase`, `Sim` and the drive/heat code share one `damageCar(c, car, dmg, kind)` helper in `vehicles.ts` that
  applies armor, updates `hp`, emits `car_hit`/`car_wreck`, and routes heat. The two engines never touch `hp` directly.

## AI hooks (so she actually does it)

New candidate families, in `vehicleCandidates` and through the usual drives: `shoot_from_car`, `run_down`, `floor_it`, `swerve`,
`lose_them`, `bail`, `board`, `take_cover` (scene), `drive_off` (scene). Aggressive ones join `AGGRESSIVE` (`run.ts`), `CRIMES`
(`laylow.ts`) and `NOISY` (`goals.ts`). A hurt car is a `smart` desire to leave a fight (`hp` fraction, as for her own hp). Getting
into her car when a fight starts next to it is the first thing a smart hero does (`take_cover` / `drive_off` score high).

## Phases

0. **Data** (no visible behaviour): `Vehicle.pace/hp/maxHp/armor/mounted/seats/riders`, `KindDef.seats`, `Companion.at`; `damageCar`; wreck handling and the `wreck:` flag;
   persist damage on parked cars; `heroSpeed` reads the car. Existing hijack/drive behaviour must not change.
1. **Cover mode**: `BoardObject` (with `doors`), `Unit.aboard`, placement, damage-to-object, wrecks and *the explosion that hurts everyone aboard*, `take_cover`, `drive_off`, `force_door`, `get_in`. Text for `car_hit` /
   `car_wreck`. Ordinary fights on streets with a parked car already read as richer, and nothing else changes.
2. **Chase engine** with a dragon as the first opponent (`chase_flight` with a vehicle); Hermes Mk. III becomes catchable.
3. **Foe vehicles and pursuit**: police/Atlas cruisers, the chase from `npdResponse`, hijack-triggered chases; `run_down`, `ram_cover`.
4. **Tests, text, UI**: every event kind has templates; status panel shows the car and its condition; a wrecks-persist test; a
   save-compat test (an old save has no `hp`: default from `maxHp` by kind on load).

## Open choices (defaults assumed unless you say otherwise)

- **Seats and companions**: riders are her companions within `seats`; she chooses (above). Nobody else rides, and nobody takes the wheel.
- **Does she get a gun mount?** Police and Atlas cars can have one; hers only if she steals one. No fitting a civilian car.
- **Wrecks as permanent cover**: yes, cheap and satisfying; they never expire.
- **Repair**: not in the first cut. A battered car stays battered until it dies.
- **RNG**: new rolls (cars on boards, chase rounds) draw from a derived `Rng` per concern, so existing seeds keep their stories;
  verify with `npm test` before and after (see the same note in `DRAGONS_PLAN.md`).
- **Balance**: the explosion, forced doors and seats are what stop the car being a safe room. It's still the best cover she has
  and Hermes Mk. III is still easy for a skilled driver. Fine for now; note it and carry on.

## As built

Everything above is in, with these differences and choices:

- **Files**: `cars.ts` (makes, damage, `hitCar`, the blast), `roads.ts` (street graph, parked cars), `vehicles.ts` (hijack, drive, riders),
  `chase.ts` (the running fight, police and dragon chases), and the scene-fight parts in `tactics.ts` / `techniques.ts` / `grid.ts`.
- **Makes**: each car is a named entry in `MAKES` (`cars.ts`) with its own `pace`, `maxHp`, `armor`, `seats` (4 for most, 6 for taxis,
  vans and Atlas limos, 8 for the church minibus, the NPD riot van and the Atlas fleet van) and optional `mounted`.
- **Armor-scaled blast**: `blastInside = 100 + 25 * armor`, outside `40 + 10 * armor`.
- **Scene fight**: a street fight now has cars on it: hers (driven or parked there), a parked civilian one if the street has one, a police
  cruiser if there are police, and the shell of anything that blew up before. She starts beside her own car. Techniques: `get_in`,
  `drive_off`, `run_down` (the foe's `force_door` is in `techniques.ts` too). Shots that miss behind a car hit the car; gunfire at someone in a
  shut car hits the car first with 30% (`SPILL`) getting through.
- **Not built**: `ram_cover` (shoving a foe's cruiser out of place) and the car actually moving on the board for `run_down` (the car stays
  put; the hit and the cost are real). Repair. Companions firing from the car on the board (they ride and take the blast, and add shots in a chase).
- **Chase**: `runChase` with `pursued` (police) and `pursuer` (a dragon) modes; actions `floor_it`, `swerve`, `shoot`, `ram`, `lose_them`,
  `bail`, and a dragon or cop at the door (`locked` band) can force it for a `bailed` ending. `caught` hands over to an ordinary fight (the
  cops, or `engage` for the dragon). Police chases start from `npdResponse` when she is driving at high heat, from a `drive_off` with a
  cruiser still standing, and half the time a cruiser is hijacked in front of its owners.
- **Left-behind companions**: `Hero.waiting` rather than a field on `Companion`, so everything that walks `hero.companions` is untouched;
  they rejoin on arrival at the street (`companion_rejoins`).
- **Status panel** shows the car, its condition and hp, and how many are aboard.

## Keys

- **Who has one**: a car with people with it has a key, and the driver carries it among their loot (`assignKeys` in `roads.ts`, once
  per car, when she arrives on the street or a squad turns up). The driver is whoever would be in it: an officer for a police car (the
  squad car at a spot with NPD officers), a guard for an Atlas one, any bystander for a civilian car, picked by chance when nobody is
  actually in it. No driver around, no key (an abandoned car). A cruiser in a police chase is keyed to its driver too, and if it is
  still running when the chase ends it is left on the street (`World.strays`) for her to take.
- **The key**: an item (`tags: ['key']`, `Item.carId` = `Vehicle.id`, `Item.ownerGang` if the driver was a ganger). It comes off the
  driver however she deals with them: killed, beaten, or pickpocketed. It can't be sold.
- **What it does**: with the key to the car in front of her she gets in (`usekey`): no hijack check, no failed attempt, nobody to see
  it, no heat from taking it. Without one the street offers a hijack as before.
- **How long it keeps**: a parked car she has the key to lasts three times as long (`KEY_LIFE`), unless it is an NPD or Atlas car, or
  its owners were gangers: those are hunted or somebody's to take back, key or no key.
- A car on the board is the same car: the police car at a spot with officers is the squad car the officers shelter behind, and a stray
  from a chase keeps the damage it took.

## Routing

How hard a street is to drive, how fast she goes, what goes wrong, and which way she goes. (`roads.ts`, `drivefx.ts`, `vehicles.ts`.)

- **Road classes** (`roadClass`, `ROAD`): a street is a `highway`, a `street`, a `small` street, a `pedestrian` way or an `alley`. The class
  comes from the last word of its name (the city names its streets for what they are: Alley and Passage are alleys; Walk, Arcade, Plaza,
  Concourse, Bazaar and Market are pedestrian; Lane, Row, Terrace, Run, Way and Yard are small; Street, Avenue, Boulevard, Freightway and
  Wharf are streets), except highways, which are marked (`Location.road`). Each class has a difficulty, a crossing time, how much of a
  drive's reach it uses up, how much going fast matters on it, and its base odds of an accident. **Alleys are no road for a car**: cars
  never route down one. Bikes can.
- **Accidents** (`hopChance`): every street she drives through is a chance. The odds rise with the street's difficulty and climb steeply
  toward top speed (a quartic in the share of top speed: a small street flat out is about five times the ordinary pace), fall with driving
  skill, rise with drink, a damaged car and acid rain. A bike has a smaller chance, especially at speed and on the hard streets. A highway
  barely cares how fast she goes.
- **What goes wrong** (`accident`): a scrape (some damage), a collision (more damage, a little to her, and heat if anyone could have seen),
  somebody calls it in (heat and a police chase), being thrown (a fall and an injury roll; the vehicle is left on the street as a stray),
  or the end of the vehicle (the same bang as in a fight). The faster she was going, the worse it is; the more people about, the likelier a
  call. A drive stops where it goes wrong.
- **Speed** (`chooseSpeed`): she picks what share of top speed to use, per drive. About 55 to 65 percent when nothing is pressing; up with a
  hurry (the law after her, a body that needs mending) and with daring (`reckless`, `thrill`, `impulsive`), down on hard streets, up on a
  highway. **Every make is a quarter faster than it was** (`SPEED_BOOST`) so there is room above the ordinary pace.
- **Which way** (`routesFrom`): two Dijkstra runs, one on time and one on difficulty. Each destination offers the quick way and the careful
  way (when they differ); each is a candidate (`drive:<street>:fast` / `:safe`), scored on where it goes, how much time it saves against
  walking weighed by how much of a hurry she is, how daring she is, and its accident risk through the usual risk term.
- **The highway**: a `highway` street is generated as an on-ramp from some streets (more often industrial and corporate ones), runs on as
  a highway most of the time, and lets off by off-ramps. It has no buildings (no clinic, spot, gym or pawn shop), no people, no parked
  cars, and no events but the police: on one she can walk on or drive, nothing else. It is cheap to reach along (half a street's worth of
  reach) and its accident odds are tiny even at speed.
- **Traffic** (`trafficAt` in `roads.ts`): how busy a street is, 0 (empty) to 1 (packed), a function of the district, the time of day, the
  kind of street, whether it is a crowded one, and acid rain (which empties it). Not rolled: the same street at the same hour is as busy
  as it was. Each district has a rhythm: nightlife fills after dark, corporate streets at the morning and evening commute, markets by day,
  industrial streets at the shift changes, tenements in the evening, and the slums are never very busy. A pedestrian way fills with people
  more than a street does; an alley hardly at all. Traffic multiplies the accident odds (`0.1 + trafficK * traffic^1.5`, with a large
  `trafficK` for highways: everything on them is going fast), so **an empty pedestrian way can be a safer drive than a packed highway at an
  ordinary pace**, though not flat out. It also slows a drive (`0.85 + 0.6 * traffic` on each street), pulls her speed down a little, and
  feeds both route costs (the quick way and the careful way).
- **Chases** use the road class and the traffic together. `squeezeOf(class, traffic)` is how much the street squeezes everybody: half the
  road's difficulty plus 0.7 times its traffic. Squeeze takes pace away (a pace edge counts for `0.6 + 0.7 * (1 - squeeze)`) and gives skill
  and a bike's small size more (`skill * 0.2 * squeeze`, plus `1.2 * squeeze` on a bike). From a squeeze of 0.45 up there are gaps to lose
  them in (`lose_them`, and a bike's `lane_split`); below 0.3 the foes shoot a little straighter. Every round also has a chance of a crash
  of its own (the same `accident` as an ordinary drive, without a bystander calling the police: they already are), likelier flat out and on
  a narrow or packed street. A chase moves: now and then it turns into the next street along, and the road changes with it. The old random
  `Stretch` (open, traffic, tight, bridge) is gone; the telling names the road instead ("a packed pedestrian way").
- **Not built**: weather other than acid rain, speed choices as separate candidates (she picks speed herself), a way to pick the highway on
  foot, and a chase leaving a highway for a street on purpose (it turns into a random neighbour).

## Getaways and pursuit

- **Who runs for a car** (`tactics.ts`): a foe who can flee (not police, security, robots, dragons or bosses) and has the key to a car on the
  board that isn't hers (`keyCar`, matched by `Item.carId`) runs for the car instead of a door. How early depends on how near they think
  they are to dying: `dread` is what her next hit would do as a share of what they have left, and from 0.45 up they go, likelier the
  nearer it is to 1 and the more hurt they are. (The ordinary low-morale panic goes to the car too.) Standing beside it, they get in and
  go: the car leaves the street with them (`foe_flees:drove`), and they leave the fight like anyone who ran.
- **After** (`getaway.ts`, `registerGetaways`): the car is theirs and gone from the street, they are gone from the place (`AWAY`), and a
  `getaway` record (`World.getaways`: who, the car, where, which beat) is kept for `GETAWAY_BEATS` (2) beats.
- **Going after them** (`pursue:<npc>`): a candidate while she is still where it happened. How much she wants it: a kill goal, a hunt or a
  flatline job on them (`wantedDead`) most, a bounty she knows of too; much less if she has no wheels and her legs can't do it.
  - **In a car** (hers, or one parked close by that she takes first): a real chase, with her as the pursuer (`runChase` in `pursuer` mode)
    against their car: gap, road, traffic, shooting, crashes. Caught: they are cornered and it is a fight they can't drive away from (the
    `cornered` flag stops a second getaway). Their car blowing up kills them, which counts as a kill.
  - **On foot**: `runsDown(w, pace)` in `dragonmodels.ts`, which compares her speed (`heroSpeed`, so her legs while she has no vehicle) to their
    car's. **This is the seam her own speed plugs into**: today her legs never beat a car, so it is a lost chase every time; the day she
    gets faster the same call starts to catch some.
  - Lost: they are away for a while and have opinions (the ordinary rules for somebody who ran).

## Chasing and fleeing on foot

The chase engine (`chase.ts`) is one framework for every mount. She can be in a car, on a bike or on her own feet; so can each thing she is
chasing or fleeing (a chaser has a `car`, is `foot`, or has wings). Nothing in it asks "is this a vehicle chase?": it asks what each side is on
this round, and that can change in the middle.

- **Pace** is one scale. On foot she runs at `heroSpeed(w)`, which with no vehicle is `legSpeed` (3 to 5; **the one place her own speed plugs
  in**: an implant, a buff or training that raises it changes every foot chase and the `runsDown` check). A person on foot runs at the fight
  board's speed for them (3, usually). Her skill is athletics instead of driving. A frightened runner pushes as hard as she does (a burst each
  round), so a foot chase between equals is close and she does not always win it.
- **Actions** on foot: `floor_it` (sprint), `swerve` (jink), `lose_them` (duck into a crowd or a doorway; easier on foot), `shoot`, and
  `grab` (take a vehicle at the kerb). No ram, no lane-split, no bail.
- **What goes wrong** (`footfx.ts`): the same idea as an accident while driving, with the same road class and traffic, and athletics for skill.
  On the small streets, the pedestrian ways and the alleys it is **people**: she runs into someone and loses a step; they may be angry enough
  to come after her (in a chase where she is fleeing they join it on foot; in one where she is the pursuer they are waiting when it ends);
  knock over a police officer or an Atlas agent and it is heat (and they are angry). On the big roads (a street, a highway) it is **cars**:
  one hits her (damage, an injury roll), and she has to stay on her feet (athletics, reflex, how fast she was running and how busy the
  road is) or lose ground. A highway is much worse to run on than a street.
- **Foes on foot**: they can't touch a car she is in, only throw things at it. A cruiser that catches her on foot can hit her, which is
  damage and a check to stay up; failing it puts them on her.
- **Changing mount, in the middle of a chase**:
  - *Thrown or bailed from a vehicle*: the vehicle is left where it fell (hers, parked, if it is in one piece; a wreck for good if it is
    not) and **if she is in shape (above 30% and no broken leg) the chase goes on, with her on foot**. A wrecked vehicle that she survives
    the same.
  - *Grabbing a vehicle*: on foot, with a vehicle on the street (one of hers, one she has the key to, or any parked one, which is a quick
    hijack), `grab` takes it, at the cost of a step, and the chase goes on in it.
  - *Getting out*: a runner who goes into an **alley** (no road for a car) forces her out of a car. She leaves it parked (hers, with the usual
    life) and follows on foot. She can also choose to get out (`dismount`) when the one she is after is on foot in a crowded or narrow street,
    where a car is more trouble than help. Cars chasing her into an alley can't follow either: the crew get out and come on foot, and leave
    the car on the street.
  - A chase **moves**: it turns into the next street along now and then, and a runner heads for an alley when there is one and a car behind
    them.
- **Where they start**: any chase. A foe who got away on foot (when she most wants them: a kill goal, a hunt, a flatline job) is something she can
  go after now (`getaway` with no car), on wheels or on her feet; a bike accident leaves her in the road and the chase on; a runner who
  ducks into an alley turns her car chase into a foot chase.
- **Not built**: cars that decide to chase a runner by themselves (only she chooses), the people she bumps into being met again later in
  the same place, and a foot chase being broken off by walking into a building.

## Attacked by a vehicle

`engine/src/driveby.ts`. Two things can pull up on her: an **NPD patrol car** (from the ordinary police response when she is on foot on a street a car can come down, 45% of officer responses) and a **ganger drive-by** (gang territory, more likely the more heat that gang has on her; a little in the slum, tenement and industrial districts). Never indoors, in an alley or on a highway. Rolls use their own derived streams so a quiet beat changes nothing else.

The attackers arrive in a vehicle (a chopper for a lone ganger), the driver carries its key, and a drive-by gets a free pass at her first. Then she chooses (`standsAndFights`, from their strength against hers, her health, competence, courage and recklessness):

- **Stand**: the vehicle stops on the street as a stray (cover for them, and a way out for a loser with the key) and it is an ordinary fight.
- **Run**: the normal chase engine, pursued, **on foot with them tailing her in the vehicle** (or in her own if she is driving). Police use the usual `pursuers`; the gang is one car with its crew. If she is caught, bails or they wreck, the surviving crew fight her; outrunning the police still costs 2 NPD heat.

Events: `vehicle_attack` (`npd`/`gang`, `gang:bike`), `attack_choice` (`stand`/`run`).

## Fighting during a chase (boarding)

A chase no longer ends because she got close. It ends when everyone chasing or running is **down**, when she **loses them**, or when somebody **stops running** (`caught`, and then the usual fight). Dragons and other wing-borne foes keep the old rule (locked on = caught) until they have a body to climb on (Hera Mk. V will use the machinery below).

- **Standing** (`standP` in `chase.ts`): each round a runner may stop and fight. The odds go up with how strong their crew is against her, being cornered (close, and no faster than her), a half-wrecked vehicle, and her being on their roof; they are scaled down while they are far ahead. Anyone left within reach when the rounds run out stops too.
- **Weapons**: shooting while chasing picks the driver (through the glass; likelier on thin vehicles and with armor-piercing weapons) or the vehicle itself (a wreck takes its crew with it). A runner on foot just takes it. Close enough to touch with a runner on foot, she swings (`strike`).
- **Boarding**: locked onto a vehicle (melee range), she can try to climb on: an athletics + reflex check, harder the faster it is and the tighter the road. Success leaves her own vehicle parked behind and puts her on theirs; the chase carries her along their route. Failure costs a bruise and ground.
- **Aboard**, each round she picks one of: `hijack_door` (Hijack skill, much easier than a real hijack, gets her inside), `break_door` (damage the door; with enough it gives and she is in), `attack_driver` (easier on low-armor vehicles, with piercing weapons and more attack power; trivial from inside), or `jump_off`.
- **They** choose: stop and fight (ends the chase), fight back (a lone driver who fights swerves and can hit things), or drive hard to shake her. Every round she is outside there is an athletics check to hang on, easier than boarding, harder if they are trying to throw her; inside, none. A thrown fall hurts by speed. A dead driver means a vehicle that coasts to a stop (it is left as a stray with the crew's key on the body).
- **Her own vehicle follows.** If companions are riding in the vehicle she leaves to board, it does not stay behind where she jumped: it follows the chase, and when the chase is over it pulls up (parked, hers) on the street she ends up on, with the party still with her (`vehicle:catches_up`). With nobody in it, it is simply left where she boarded.
- If their vehicle blows up with her on it, she takes the outside blast; inside it, the inside one.

Events: `chase_round` variants `board`, `strike`, `hijack_door`, `break_door`, `attack_driver`, `jump_off`; `chase_mount:foe_stands`.

## The hex grid, shortcuts, and Calculate

**The grid** (`hex.ts`, `hexmap.ts`). Every outdoor generated place (a street, and the buildings and spots on it) stands on one or more hexes (`Location.hex`), placed when it is sketched, beside the place it grew from. Places come in different sizes: a pedestrian way or a small street is one hex, an avenue two or three, a highway three or four; a shop is one hex, a club or a corporate lobby two or three, a tenement tower up to three. The hand-built district is placed by hand (`seedHexes`). Which hexes a place gets depends on what was built beside it first, so unlike the tree of ids it is part of the save, not a function of the seed: exploring in a different order gives a different layout (the tests that compare cities "however explored" ignore `hex` and `links`).

**Links** (`Location.links`). The doors and streets of the old tree stay as `exits`. What the grid adds is `links`: ways across between places that touch, each with a `via` and a price (`VIA`, per body: foot, bike, car):

| via | what it is | foot | bike | car |
|---|---|---|---|---|
| `open` | a cut-through between touching streets | free | free | free |
| `fence` | chain-link | vault (athletics) | no | smashes through |
| `wall` | sheer wall | climb (athletics, muscle) | no | no |
| `barricade` | crates, wrecks, razor wire | break through (muscle, melee) | may crash | rams through, damaging the vehicle |
| `duct` | between two touching buildings | crawl (sneak) | no | no |
| `through` | straight through a building to the street on its far side | free, or sneak past the guards if it is restricted (a failure is heat) | no | no |
| `ramp` | up and over a building (`over`) | stairs | jump (driving, speed) | jump |

Open links count as roads for driving and routing. The hero can also walk the other links in ordinary play (`go:` candidates, `moveThrough` -> `crossLink`; on wheels only `open` and `ramp`).

**Chases move through the grid.** A chase has a **route** (`shortcut.ts`): the fleeing side's plain road (no obstacles) to somewhere reasonably far away, in the fleeing side's own mode (a runner can use alleys, a car can't). The chase advances along it, a longer street taking longer; whoever is behind is put back on the route at the start of every round.

**Cutting across.** Whoever is behind and not catching up can work out where the runner is going (a point two or three streets on) and take the quickest way there with obstacles allowed, for what they are (a car, a bike, or on foot; she can also get out of her vehicle if the way across is only open to a runner). The guess is right with probability `readingOf`: Calculate (a skill that feeds off the Hack stat) plus Hack. A wrong guess sends them to a street the runner does not use. If the cut gets there at about the same time as the runner or before, it is a cut-off: the runner is right in front of them (`locked`). If it is late, they have lost ground. The obstacles are resolved with real consequences: a car through a barricade is damaged, a bike can crash, a runner can fall off a wall or be seen cutting through a guarded building. The same applies to the other side: police in cruisers (or anybody chasing her) will guess where she is going and try to cut her off. Events: `chase_cut` (`cut_off`, `late`, `wrong`), and `chase_round:shortcut`.
