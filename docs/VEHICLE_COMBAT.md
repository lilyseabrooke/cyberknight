# Fighting from vehicles: schema sketch

Status: **sketch, nothing built**. Feel over balance: every number is a first guess, to be tuned by feel (or not at all).

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
  // and the existing fields; ParkedVehicle adds at / until
}

type CarState = 'sound' | 'scuffed' | 'battered' | 'smoking' | 'wrecked';   // by hp fraction: >.75 / >.5 / >.25 / >0 / 0
```

- **Condition changes how it drives**: `pace` and her drive reach scale by `0.5 + 0.5 * hp/maxHp`; `smoking` can stall a
  chase round. Condition is also the text key (`car_hit:scuffed`, `car_hit:smoking`), so damage is visible in the log.
- **Destroyed means destroyed**: at 0 hp the car leaves `hero.vehicle` / `hero.parked` for good, the street gets a
  `w.flags['wreck:<locId>']` (a burnt-out shell that later scenes on that street get as permanent cover), and she takes a
  **crash** if she was in it (damage, a chance of `broken_leg`, `burning` if it blew; worse the faster she was going). A
  wreck is never recovered and never towed.
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
`smoking`). That's the whole "car as armor": she is safer in a good car and in much more trouble as it falls apart. Fire and
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
- **Foe vehicles** are the same object. Police cruisers have `team: 'foe'` and cover foes; destroying one is NPD heat; a
  dead cruiser is a wreck for the rest of the fight.

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

0. **Data** (no visible behaviour): `Vehicle.pace/hp/maxHp/armor/mounted`; `damageCar`; wreck handling and the `wreck:` flag;
   persist damage on parked cars; `heroSpeed` reads the car. Existing hijack/drive behaviour must not change.
1. **Cover mode**: `BoardObject`, placement, damage-to-object, wrecks and blasts, `take_cover`, `drive_off`. Text for `car_hit` /
   `car_wreck`. Ordinary fights on streets with a parked car already read as richer, and nothing else changes.
2. **Chase engine** with a dragon as the first opponent (`chase_flight` with a vehicle); Hermes Mk. III becomes catchable.
3. **Foe vehicles and pursuit**: police/Atlas cruisers, the chase from `npdResponse`, hijack-triggered chases; `run_down`, `ram_cover`.
4. **Tests, text, UI**: every event kind has templates; status panel shows the car and its condition; a wrecks-persist test; a
   save-compat test (an old save has no `hp`: default from `maxHp` by kind on load).

## Open choices (defaults assumed unless you say otherwise)

- **Seats and companions**: she drives alone for now; companions don't ride. (Later: a passenger shoots while she drives.)
- **Does she get a gun mount?** Police and Atlas cars can have one; hers only if she steals one. No fitting a civilian car.
- **Wrecks as permanent cover**: yes, cheap and satisfying; they never expire.
- **Repair**: not in the first cut. A battered car stays battered until it dies.
- **RNG**: new rolls (cars on boards, chase rounds) draw from a derived `Rng` per concern, so existing seeds keep their stories;
  verify with `npm test` before and after (see the same note in `DRAGONS_PLAN.md`).
- **Balance**: a good car makes her nearly untouchable in a fight and Hermes Mk. III trivial for a skilled driver. That's fine
  for now; mention it and carry on.
