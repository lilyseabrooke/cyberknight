import type { Ctx, Npc, Vehicle } from './types';
import { ALL_MAKES, MAKES, SPILL, blastInside, blastOutside, carKey, hitCar, keyTo, lifeOf, makesOf, normalize, parkIt, stateOf, vehicleOf } from './cars';
import { fight, heroPower, kill, maybeInjure, relocate } from './combat';
import { spawnGroup, clamp } from './candidate';
import { heroSpeed } from './dragonmodels';
import { nested } from './events';
import { roadClass, roadsFrom, scene, squeezeOf, trafficAt, trafficWord } from './roads';
import { isShut } from './shutdown';
import { foeProfile } from './tactics';
import { bump, footChance, stumble } from './footfx';
import { grabVehicle, vehicleHere } from './vehicles';
import { accident, hopChance } from './drivefx';
import { KINDS, removeCompanion } from './companions';
import { skillValue, train } from './skills';
import { hasImplantFlag } from './skills';
import { fxOf } from './weapons';
import { Rng } from './rng';
import { streetHunt } from './streethunt';
import { bystand } from './bystanders';
import { patrolArrives, sendAway, shootEveryone } from './callins';
import { BEHIND, addTire, ambientNoise, carries, coverOf, eased, follow, rest, standTired, heroCover, heroTracker, trackerOf, type Trail } from './tracking';
import { camerasSeeHer } from './placeboard';
import { behindOf, cross, cutAcross, readingOf, startRoute, type Crosser, type Mode, type Route } from './shortcut';
import { VIA } from './hexmap';
import { TILES_PER_PACE, blockIn, doorTo, chaserSees, setBlock, leaveSearching, localSqueeze, hideGuess, hideScene, inTheWay, stepAside, openBoard, outsFrom, seesFrom, runPast, pinches, runOn, tileAt, type ChaseBoard, type Out } from './chaseboard';
import type { Pos } from './grid';

/**
 * A chase: a fight at speed. There is no board, only how far apart everybody is, what the road is like, and what each side
 * does about it this round. Police cruisers and dragons are the ones after her (or the ones she is after). The car she is in
 * takes the hits first and a share gets through to her; when it is done it goes up, and everyone in it with it.
 * See docs/VEHICLE_COMBAT.md.
 */

export type Band = 'far' | 'near' | 'close' | 'locked';
export type ChaseResult = 'caught' | 'escaped' | 'lost' | 'wrecked' | 'bailed' | 'won';

export const bandOf = (gap: number): Band => (gap <= 0.5 ? 'locked' : gap <= 2.5 ? 'close' : gap <= 6 ? 'near' : 'far');

export interface Chaser {
  name: string;
  /** The people in it (or the dragon itself). */
  crew: Npc[];
  /** A car, if it is in one. On foot (`foot`) or with wings (neither) it has none. */
  car?: { id: string; body?: Vehicle['body']; kind: Vehicle['kind']; name: string; hp: number; maxHp: number; armor: number };
  /** Running. Its pace is its own legs. */
  foot?: boolean;
  pace: number;
  /** Tiles between it and her. */
  gap: number;
  alive: boolean;
  /** Gave up the chase to search the street instead: still about, no longer after her. */
  off?: boolean;
}

export interface ChaseOpts {
  /** `pursued`: they are after her and she wants away. `pursuer`: she is after something that is running. */
  mode: 'pursued' | 'pursuer';
  cause: string;
  foes: Chaser[];
  maxRounds?: number;
  /** Do not play out the search afterwards when some of them are left looking for her (it is the search that started this). */
  noSearch?: boolean;
  /** Told each round, with the board as it stands, for tests and tooling. */
  watch?: (board: ChaseBoard | null, round: number) => void;
}

const ESCAPE_GAP = 30;

const power = (ch: Chaser): number => ch.crew.reduce((a, n) => a + n.power, 0);
const wings = (ch: Chaser): boolean => !ch.car && !ch.foot;

/** Someone on foot, as a chaser. Their pace is the fight board's, the same scale as hers. */
export function onFoot(n: Npc, gap: number): Chaser {
  return { name: n.name, crew: [n], foot: true, pace: foeProfile(n).speed, gap, alive: true };
}

/** Is she in shape to go on? Not if she is badly hurt or has a broken leg. */
const fit = (h: Ctx['w']['hero']): boolean => h.hp / h.maxHp >= 0.3 && !h.injuries.includes('broken_leg');

/** Run the chase and tell it. The caller deals with what comes of it (a fight when she is caught, a dragon that gets away). */
export function runChase(c: Ctx, o: ChaseOpts): ChaseResult {
  const { w, rng } = c;
  const h = w.hero;
  let result: ChaseResult | null = null;
  const maxRounds = o.maxRounds ?? 12;
  const place = w.locations[h.locationId]!.name;
  const mounted = (): Vehicle | null => (h.vehicle && h.vehicle.hp > 0 ? normalize(h.vehicle) : null);
  let last = mounted();
  let rounds = 0;
  // Where she went to lose them, if she went somewhere (through a door, into an alley, up onto a roof): she is there, not a few streets on.
  let hid = false;
  // Rounds in a row that none of them could see her, and the last place they could.
  let unseen = 0;
  // Those left on the street looking for her when it ends.
  const searching = new Set<Npc>();
  let searchStreet = '';
  // What each of them has made of the trail, and how many times they have tried to pick it up.
  // The noise she (or whoever is running) has made since they were last in sight of her: it all helps whoever is following.
  let loud = 0;
  let lost = false;
  // Bystanders who have already had their say.
  const said = new Set<string>();
  // The round a patrol will turn up, if somebody called it in.
  let patrolAt: number | null = null;
  const trails = new Map<Chaser, Trail>();
  const tries = new Map<Chaser, number>();
  // A chaser's check on her trail: the best of their crew. They get three goes in a chase.
  const tracked = (f: Chaser, why: 'sight' | 'far'): Trail => {
    const n = (tries.get(f) ?? 0) + (why === 'far' ? 1 : 0);
    if (n > 3) return 'none';
    if (why === 'far') tries.set(f, n);
    const cover = eased(heroCover(w, squeeze) + (hid ? 2 : 0), loud);
    const best = f.crew.filter((x) => x.alive).reduce((a, x) => Math.max(a, trackerOf(x)), f.crew.some((x) => x.alive) ? 0 : -9) + (f.foot ? 0 : -1);
    const r = follow(rng, best, cover);
    trails.set(f, r.trail);
    return r.trail;
  };
  // Hers on theirs, when it is her doing the chasing: she picks up what they left, or she does not.
  const trackedByHer = (live: Chaser[]): Chaser[] => {
    const lead0 = live[0];
    if (!lead0) return [];
    const n = (tries.get(lead0) ?? 0) + 1;
    if (n > 3) return [];
    for (const f of live) tries.set(f, n);
    train(c, 'tracking', 1);
    const r = follow(rng, heroTracker(w), Math.max(...live.map((f) => Math.max(...f.crew.map((x) => eased(coverOf(x, squeeze), loud))))));
    for (const f of live) trails.set(f, r.trail);
    return r.trail === 'none' ? [] : live;
  };
  let lastSeen: Pos | null = null;
  // People she knocked into who are coming after her when this is over.
  const owed: Npc[] = [];
  // The vehicle she is riding on the outside of (or the inside of, once she is in), and how much door is left between her and the driver.
  let boarded: Chaser | null = null;
  let inside = false;
  let doors = 0;
  // Her own vehicle, when she has left it for theirs with companions in it: it follows, and is close by when the chase ends.
  let follower: Vehicle | null = null;
  // The road she is on decides how a chase goes, by what kind of street it is and how busy it is right now: a narrow street or a
  // crowded one squeezes everybody (pace counts for less, skill for more, and there are gaps to lose them in); an open, empty one is
  // a race. Not rolled: the same street at the same hour is the same chase.
  // And a chase moves: now and then it turns into the next street along, and the road is whatever that one is.
  let here = w.locations[h.locationId]!;
  let cls = roadClass(here);
  let traffic = trafficAt(w, here);
  let streetSqueeze = squeezeOf(cls, traffic);
  let squeeze = streetSqueeze;
  let tight = squeeze >= 0.45;
  let setting = scene(cls, traffic);
  let board: ChaseBoard | null = null;
  const nextOnRoute = (): string | null => (route && route.i < route.path.length - 1 ? route.path[route.i + 1]! : null);
  let boardTried = false;
  // Where the street she is on lets out, when no route says: by the old rule, a runner takes an alley as soon as there is a car behind her.
  const chooseExit = (): string | null => {
    const mine = mounted();
    const adj = streetsFrom(w, h.locationId);
    const alleys = adj.filter((id) => roadClass(w.locations[id]!) === 'alley');
    const carless = !!mine && mine.body !== 'bike';
    const driveable = carless ? adj.filter((id) => !alleys.includes(id)) : adj;
    const lead = o.foes.find((f) => f.alive);
    const runnerEscapes = o.mode === 'pursuer' && !!lead?.foot && carless && alleys.length > 0;
    const fleeing = o.mode === 'pursued' && !mine && o.foes.some((f) => f.alive && !!f.car && f.car.body !== 'bike') && alleys.length > 0;
    if ((runnerEscapes || fleeing) && rng.chance(0.75)) return rng.pick(alleys);
    return driveable.length ? rng.pick(driveable) : adj.length ? rng.pick(adj) : null;
  };
  const boardNow = (): ChaseBoard | null => {
    if (!board && !boardTried) {
      boardTried = true;
      board = openBoard(w, nextOnRoute() ?? chooseExit());
      // The law reads the road as well as she does. Now and then they are already there, across the way on.
      if (board && o.mode === 'pursued' && board.exitTo && o.foes.some((f) => f.alive && (f.car?.kind === 'police' || f.car?.kind === 'atlas' || f.crew.some((n) => n.tags.includes('cop'))))) {
        const heat = Math.max(w.heat.npd ?? 0, w.heat.atlas ?? 0);
        if (new Rng(`block:${w.worldSeed}:${w.beat}:${board.loc}:${rounds}`).chance(Math.min(0.45, 0.12 + 0.04 * heat))) setBlock(board);
      }
    }
    return board;
  };
  const refresh = (): void => {
    board = null;
    boardTried = false;
    here = w.locations[h.locationId]!;
    cls = roadClass(here);
    traffic = trafficAt(w, here);
    streetSqueeze = squeezeOf(cls, traffic);
    squeeze = streetSqueeze;
    tight = squeeze >= 0.45;
    setting = scene(cls, traffic);
  };

  // Where the running side is going. Whoever is behind can work out where, and cut across to it (see shortcut.ts).
  const modeOf = (v: { body?: Vehicle['body'] } | null | undefined): Mode => (v ? (v.body === 'bike' ? 'bike' : 'car') : 'foot');
  const chaserMode = (f: Chaser): Mode => (f.car ? modeOf(f.car) : 'foot');
  const first = o.foes.find((f) => f.alive && !wings(f));
  let route: Route | null = null;
  if (o.mode === 'pursued' || first) {
    route = startRoute(w, new Rng(`route:${w.seed}:${w.beat}:${h.locationId}:${o.cause}`), h.locationId, o.mode === 'pursued' ? modeOf(last) : chaserMode(first!));
  }
  const heroCrosser = (car: Vehicle | null): Crosser => ({ mode: modeOf(car), hero: true, car, pace: car ? car.pace : heroSpeed(w) });
  const foeCrosser = (f: Chaser): Crosser => ({ mode: chaserMode(f), hero: false, car: f.car ?? null, pace: f.pace, skill: 0.5 });

  // One line of the chase, told.
  const tell = (action: string, told: string[], hurt: number, round: number, car: Vehicle | null, foe: Chaser | undefined): void => {
    const lead = o.foes.filter((f) => f.alive && !f.off).reduce<Chaser | undefined>((a, f) => (!a || f.gap < a.gap ? f : a), undefined) ?? foe;
    c.emit('chase_round', hurt > 0 ? 'bad' : action === 'floor_it' || action === 'lose_them' || action === 'board' ? 'good' : 'mixed', {
      variant: action,
      scene: setting,
      road: cls,
      traffic: trafficWord(traffic),
      body: car?.body ?? 'foot',
      round,
      band: bandOf(lead?.gap ?? 9),
      gap: Math.round(lead?.gap ?? 9),
      car: car?.name ?? 'on foot',
      state: car ? stateOf(car) : 'sound',
      hurt,
      foe: lead?.name ?? 'them',
      events: told.join(','),
      boarded: !!boarded,
      inside,
    });
  };
  // How likely they are to stop running and fight: when they are the stronger, when they are cornered, when she is on their car, when
  // the car is nearly gone.
  const standP = (f: Chaser, onBoard: boolean): number => {
    const b = bandOf(f.gap);
    const mine = power(f) / (heroPower(w) * clamp(h.hp / h.maxHp, 0.3, 1));
    const cornered = (b === 'locked' || b === 'close') && f.pace <= heroSpeed(w) + 1.5 ? 1 : 0;
    const carRatio = f.car ? f.car.hp / f.car.maxHp : 1;
    let p = -0.15 + 0.45 * (mine - 0.7) + 0.25 * cornered + (onBoard ? 0.2 : 0) + (carRatio < 0.35 ? 0.2 : 0);
    if (b === 'far') p *= 0.2;
    else if (b === 'near') p *= 0.5;
    return clamp(p + (o.mode === 'pursuer' ? standTired(w) : 0), 0, 0.85);
  };
  // Her chance to get onto a moving vehicle: athletics and reflexes, against how fast it is going.
  const boardP = (f: Chaser): number => clamp(0.45 + 0.04 * skillValue(h, 'athletics') + 0.02 * h.reflex - 0.04 * Math.max(0, f.pace - heroSpeed(w)) - 0.1 * squeeze, 0.1, 0.85);

  // A round spent on their vehicle. She chooses what to do about the doors and the driver, they choose whether to stop, to fight back, or
  // to try to shake her off, and every round she is hanging on outside is a chance to be thrown.
  const boardedRound = (round: number): ChaseResult | null => {
    const t = boarded!;
    const told: string[] = [];
    let hurt = 0;
    let res: ChaseResult | null = null;
    const fx = fxOf(h.weapon);
    const melee = h.weapon.tags.includes('melee');
    const hero = heroSpeed(w);
    const armor = Math.max(0, (t.car?.armor ?? 0) - fx.pierce * 0.5);
    const swing = (): number => Math.round(heroPower(w) * (melee ? 0.65 : 0.5) * (0.6 + rng.next() * 0.8));
    // Through the glass and the door: easier on a thin car, with something that bites armor, and with more behind it. From inside, there is no door.
    const driverP = inside ? 0.85 : clamp(0.2 + 0.0035 * heroPower(w) - armor * 0.05 + fx.pierce * 0.04, 0.05, 0.85);
    const hpRatio = h.hp / h.maxHp;
    // She comes off the vehicle: it is wrecked, the driver is dead and it has coasted to a stop, or she has let go.
    const getOff = (gap: number): void => {
      boarded = null;
      inside = false;
      for (const f of o.foes) if (f === t) f.gap = gap;
    };
    // Their vehicle goes up with her on it (or in it).
    const goesUp = (): void => {
      wreckChaser(c, t, told);
      const blast = t.car ? (inside ? blastInside({ armor: t.car.armor, body: t.car.body }) : blastOutside({ armor: t.car.armor, body: t.car.body })) : 0;
      h.hp -= blast;
      hurt += blast;
      maybeInjure(c, blast, inside ? 1 : 0.5);
      w.flags[`wreck:${h.locationId}`] = true;
      if (dead(c)) res = 'wrecked';
      getOff(1);
    };

    const sc: Record<string, number> = {};
    if (!inside) {
      sc.hijack_door = 4 + 0.3 * skillValue(h, 'hijack');
      sc.break_door = 3 + (doors <= 8 ? 3 : 0) + (melee ? 1 : 0);
    }
    sc.attack_driver = (inside ? 8 : 3) + 5 * driverP;
    if (hpRatio < 0.35) sc.jump_off = 6;
    const action = Object.keys(sc).map((k) => ({ k, s: sc[k]! + rng.next() * (1 + (1 - h.competence) * 3) })).sort((a, b) => b.s - a.s)[0]!.k;

    if (action === 'hijack_door') {
      // The lock, not the car: a good deal easier than taking one.
      const p = clamp(0.5 + 0.06 * skillValue(h, 'hijack') + 0.02 * h.reflex - armor * 0.03, 0.15, 0.92);
      train(c, 'hijack', 1);
      if (rng.chance(p)) {
        inside = true;
        told.push('inside');
      } else told.push('door_locked');
    } else if (action === 'break_door') {
      const dmg = swing() + fx.pierce;
      doors -= dmg;
      if (t.car && hitCar(t.car, dmg * 0.2, 'ram').wrecked) goesUp();
      else if (doors <= 0) {
        inside = true;
        told.push('inside');
      } else told.push('door_dented');
      train(c, melee ? 'melee' : 'marksmanship', 1);
    } else if (action === 'attack_driver') {
      if (rng.chance(driverP)) {
        hurtCrew(c, t, Math.round(swing() * (inside ? 1.2 : 0.8) + fx.pierce * 0.3), told);
        told.push('driver_hit');
        if (!t.alive) {
          // Nobody is driving it any more. It coasts to a stop and she steps off.
          getOff(0);
          told.push('coasts');
        }
      } else told.push('miss');
      train(c, melee ? 'melee' : 'marksmanship', 1);
    } else if (action === 'jump_off') {
      const fall = Math.round(t.pace * 0.5);
      h.hp -= fall;
      hurt += fall;
      maybeInjure(c, fall, 0.2);
      getOff(1.5 + rng.next() * 1.5);
      told.push('jump');
    }

    // Whoever is still driving it.
    if (!res && boarded && t.alive) {
      if (rng.chance(standP(t, true))) {
        res = 'caught';
        told.push(`stand:${t.name}`);
        c.emit('chase_mount', 'mixed', { variant: 'foe_stands', foe: t.crew[0]?.name ?? t.name, car: t.car?.name ?? '', body: t.car?.body ?? 'foot', place: h.locationId && w.locations[h.locationId]!.name });
      } else {
        // Fight back, or drive. One person cannot do both well: a lone driver who fights swerves, and hits a wall now and then.
        const fighters = t.crew.filter((n) => n.alive);
        const fightBack = rng.chance(0.5 + 0.1 * (fighters.length - 1));
        if (fightBack) {
          const shooters = fighters.length > 1 ? fighters.slice(1) : fighters;
          for (const n of shooters) {
            if (!rng.chance(0.55 * (fighters.length === 1 ? 0.7 : 1))) continue;
            const dmg = Math.max(1, Math.round(n.power * 0.35 * (0.6 + rng.next() * 0.8) * (inside ? 1.3 : 1)) - (h.armor?.power ?? 0));
            h.hp -= dmg;
            hurt += dmg;
            maybeInjure(c, dmg, 0.2);
            told.push(`hit:${n.name}`);
          }
          if (fighters.length === 1 && t.car && rng.chance(0.25)) {
            told.push('swerved_into');
            const r = hitCar(t.car, t.car.maxHp * 0.08, 'ram');
            h.hp -= 3;
            hurt += 3;
            if (r.wrecked) goesUp();
          }
        } else told.push('shake');
        // Hanging on to the outside: harder if they are trying to throw her, and no trouble at all from the inside.
        if (!res && boarded && !inside) {
          const stay = clamp(boardP(t) + 0.2 - (fightBack ? 0 : 0.2), 0.2, 0.95);
          train(c, 'athletics', 1);
          if (!rng.chance(stay)) {
            const fall = Math.round(t.pace * 0.9 + rng.next() * 4);
            h.hp -= fall;
            hurt += fall;
            maybeInjure(c, fall, 0.35);
            getOff(2 + rng.next() * 1.5);
            told.push('thrown_off');
          }
        }
      }
    }
    if (!res && dead(c)) res = 'wrecked';
    if (!res && !boarded && !fit(h)) res = 'bailed';
    if (!res && o.foes.every((f) => !f.alive)) res = 'won';
    tell(action, told, hurt, round, null, t);
    // The road goes on under them.
    if (!res && boarded && route && route.i < route.path.length - 1 && rng.chance(0.35)) {
      route.i++;
      relocate(w, route.path[route.i]!);
      refresh();
    } else if (!res && boarded && rng.chance(0.35)) {
      const adj = streetsFrom(w, h.locationId).filter((id) => roadClass(w.locations[id]!) !== 'alley');
      if (adj.length) {
        relocate(w, rng.pick(adj));
        refresh();
      }
    }
    return res;
  };

  nested(c, 'chase_start', 'mixed', { cause: o.cause, mode: o.mode, car: last?.name ?? 'on foot', body: last?.body ?? 'foot', foes: o.foes.map((f) => f.name).join(', '), count: o.foes.length, place, wings: o.foes.some(wings), foot: o.foes.every((f) => f.foot) }, () => {
    for (let round = 1; round <= maxRounds && !result; round++) {
      rounds = round;
      addTire(w, 1);
      const live = o.foes.filter((f) => f.alive && !f.off);
      let ran: [number, number] | null = null;
      if (!live.length) {
        result = o.foes.some((f) => f.alive) ? 'escaped' : 'won';
        break;
      }
      // She is where the route says she is (a cut across it that went wrong has put her somewhere else for a moment).
      if (route && !boarded && h.locationId !== route.path[route.i]!) {
        relocate(w, route.path[route.i]!);
        refresh();
      }
      // On the street: she runs on along it.
      if (!boarded) {
        const cb0 = boardNow();
        const s0 = cb0?.s ?? 0;
        if (cb0) runOn(cb0, heroSpeed(w) * TILES_PER_PACE);
        ran = cb0 ? [s0, cb0.s] : null;
        // The chase goes on down the road. A runner will go where a car cannot, and if she follows on wheels she has to get out.
        if (!result) {
          const mine = mounted();
          const adj = streetsFrom(w, h.locationId);
          const alleys = adj.filter((id) => roadClass(w.locations[id]!) === 'alley');
          const carless = !!mine && mine.body !== 'bike'; // an alley is no road for a car
          const leadNow = live[0];
          const go = (to: string): void => {
            const from = h.locationId;
            const intoAlley = roadClass(w.locations[to]!) === 'alley';
            if (mine && carless && intoAlley) {
              // After a runner into an alley: out of the car and on after them.
              leaveBehind(c, mine, 'parked');
              c.emit('chase_mount', 'mixed', { variant: 'dismount_alley', car: mine.name, body: mine.body, foe: leadNow?.name ?? 'them', place: w.locations[to]!.name });
            }
            relocate(w, to);
            refresh();
            // And cars can't follow her into one either.
            if (intoAlley) for (const f of o.foes) if (f.alive && f.car && f.car.body !== 'bike') getOut(c, f, from);
          };
          const onward = route && route.i < route.path.length - 1 ? route.path[route.i + 1]! : null;
          if (cb0) {
            // She turns off where the street runs out: at the way on she was running for. (After the first round, so a chase is at least a street long.)
            const dest = onward ?? cb0.exitTo;
            if (round > 1 && cb0.s >= cb0.path.length - 1 && dest && w.locations[dest]?.kind === 'street') {
              if (onward && route) route.i++;
              go(dest);
            }
          } else {
            // (A place with no board to run along: it turns now and then.)
            const driveable = carless ? adj.filter((id) => !alleys.includes(id)) : adj;
            const runnerEscapes = o.mode === 'pursuer' && !!leadNow?.foot && carless && alleys.length > 0;
            const fleeing = o.mode === 'pursued' && !mine && o.foes.some((f) => f.alive && !!f.car && f.car.body !== 'bike') && alleys.length > 0;
            // (A runner ducks into an alley as soon as there is a car behind them; otherwise the chase only turns after the first round.)
            // On a route they go the way it goes, a longer street taking longer to get down.
            const turn = onward ? (round > 1 ? 0.9 / (here.hex?.cells.length ?? 1) : 0) : runnerEscapes ? 0.6 : fleeing ? 0.5 : round > 1 ? 0.4 : 0;
            if (rng.chance(turn)) {
              const to = onward ?? ((runnerEscapes || fleeing) && rng.chance(0.75) ? rng.pick(alleys) : (driveable.length ? rng.pick(driveable) : adj.length ? rng.pick(adj) : null));
              if (to) {
                if (onward && route) route.i++;
                go(to);
              }
            }
          }
        }
        const cb = boardNow();
        if (cb) {
          // How tight it is is what is round her now, as well as what sort of street it is.
          squeeze = clamp(0.6 * streetSqueeze + 0.4 * localSqueeze(cb), 0, 1);
          tight = squeeze >= 0.45;
        }
        o.watch?.(cb, round);
      }
      // On their vehicle: a round of its own.
      if (boarded) {
        const r = boardedRound(round);
        if (r) result = r;
        if (result) break;
        continue;
      }
      // What she is on this round: a car, a bike, or her own two feet. It can change in the middle.
      const car = mounted();
      if (car) last = car;
      const foot = !car;
      const skillId = foot ? 'athletics' : 'driving';
      const skill = skillValue(h, skillId) * 0.5 + h.reflex * 0.3;
      const hero = heroSpeed(w);
      const nearest = () => live.reduce((a, f) => (f.gap < a.gap ? f : a));
      const lead = nearest();
      const band = bandOf(lead.gap);
      const armedBack = h.weapon.tags.includes('gun') || (!!car && h.companions.some((a) => a.hp > 0 && KINDS[a.kind]?.assist.dmg && car.riders.includes(a.id)));
      const hpRatio = h.hp / h.maxHp;
      const carRatio = car ? car.hp / car.maxHp : 1;
      const bike = car?.body === 'bike';
      // A vehicle close by that she could get hold of, if she is on foot.
      const ride = foot ? vehicleHere(w, here) : null;
      const faster = live.some((f) => f.pace > hero + 2);

      // What she does this round.
      const scores: Record<string, number> = {};
      let outs: Out[] = [];
      if (o.mode === 'pursuer') {
        scores.floor_it = 6;
        scores.shoot = armedBack && (band === 'near' || band === 'close') ? 4.5 : 0;
        scores.swerve = 0.5;
        // On foot, a car on the street is a much better way to catch a car. In a car, a runner in a crowded street is best caught on foot.
        if (foot && ride && faster) scores.grab = 7;
        if (car && lead.foot && squeeze >= 0.55 && band !== 'far') scores.dismount = 2 + 6 * squeeze;
        // Close enough to touch: onto the vehicle, or a swing at the runner.
        if (band === 'locked' && hpRatio > 0.35) {
          if (lead.car) scores.board = 5.5;
          else if (lead.foot) scores.strike = 6;
        }
      } else {
        scores.floor_it = 3 + (band === 'close' || band === 'locked' ? 3 : 0);
        scores.swerve = 1.5 + (band !== 'far' ? 2 : 0);
        // Somewhere to duck into: a doorway, a side street, a way up, or a crowd or a tight street to lose herself in.
        outs = board ? outsFrom(w, board).filter((x) => x.kind !== 'cover' || !car) : [];
        scores.lose_them = (tight || outs.some((x) => x.kind !== 'crowd')) && lead.gap >= 3 ? (foot ? 7.5 : 6.5) + (outs.some((x) => x.kind === 'door' || x.kind === 'up') ? 1 : 0) + (board && blockIn(board) !== null && outs.some((x) => x.kind !== 'crowd') ? 3 : 0) : 0;
        scores.shoot = armedBack && (band === 'near' || band === 'close') ? 4 : 0;
        if (band === 'locked' && lead.car && hpRatio > 0.5) scores.board = 2;
        if (foot && ride && faster) scores.grab = 8;
        if (car) {
          // A bike fits where a car does not: it can stay out of reach without ending the chase.
          if (bike) scores.lane_split = tight && band !== 'far' ? 5.5 : 0;
          // A bike against anything bigger gets the worst of a ram.
          scores.ram = (band === 'close' || band === 'locked') && lead.car ? (bike && lead.car.body !== 'bike' ? 0.2 : 3 + car.armor * 0.4) : 0;
          scores.bail = carRatio <= 0.25 || (hpRatio < 0.3 && carRatio < 0.5) || (bike && hpRatio < 0.4) ? 3 + 10 * (0.25 - Math.min(carRatio, 0.25)) : 0;
        }
      }
      // Work out where they are going and cut across to it.
      if (route && !boarded && o.mode === 'pursuer' && route.path.length - 1 - route.i >= 2 && band !== 'locked') scores.shortcut = (band === 'far' ? 7 : band === 'near' ? 5 : 2.5) + 0.2 * skillValue(h, 'calculate');
      if (car && carRatio <= 0.25) scores.bail = (scores.bail ?? 0) + 3 + h.competence * 4; // smoking: it is about to go
      const slack = (1 - h.competence) * 4;
      let action = Object.keys(scores).map((k) => ({ k, s: scores[k]! + rng.next() * (1 + slack) })).sort((a, b) => b.s - a.s)[0]!.k;
      const told: string[] = [];
      let hurt = 0;

      // Out of the saddle: she is off, the vehicle is left, and if she is in shape she goes on on foot.
      const unseat = (why: 'bail' | 'door' | 'thrown'): void => {
        if (!car) return;
        if (h.vehicle) {
          const fall = Math.round(heroSpeed(w) * (car.body === 'bike' ? 0.7 : 1.2));
          h.hp -= fall;
          hurt += fall;
          maybeInjure(c, fall);
          leaveBehind(c, car, 'stray');
        }
        train(c, 'athletics', 2);
        told.push(why);
        if (dead(c)) result = 'wrecked';
        else if (fit(h)) c.emit('chase_mount', 'mixed', { variant: why, car: car.name, body: car.body, place: here.name });
        else result = 'bailed';
      };

      // A cut across: over a fence, through a barricade, up a ramp, through a building. It is the whole round.
      if (action === 'shortcut' && route) {
        const cut = cutAcross(c, { who: car ? [heroCrosser(car), heroCrosser(null)] : [heroCrosser(null)], from: h.locationId, route, accuracy: readingOf(w), behind: behindOf(lead.gap) });
        if (cut.kind === 'none') action = 'floor_it';
        else {
          const from = here.name;
          train(c, 'calculate', cut.kind === 'wrong' ? 1 : 2);
          hurt += cut.hurt;
          told.push(`cut:${cut.kind}`, ...cut.told);
          // (Out of the car to do it on foot: the car stays where she left it.)
          if (car && h.vehicle && cut.mode === 'foot') leaveBehind(c, car, 'parked');
          else if (cut.thrown && car && h.vehicle) {
            leaveBehind(c, car, 'stray');
            c.emit('chase_mount', 'mixed', { variant: 'thrown', car: car.name, body: car.body, place: here.name });
          }
          // She runs to the way across on the street's board (the fence, the duct, the gap) and goes over it; she comes out by the way back from the far side.
          let gate = '';
          if (board && cut.first) {
            const door = doorTo(board, cut.first.to, cut.first.via);
            if (door) {
              board.placed.board.hero = { ...door.at };
              gate = door.label;
            }
          }
          relocate(w, cut.at);
          refresh();
          const ahead = route.path.length - 1;
          if (cut.kind === 'cut_off') {
            route.i = cut.idx;
            lead.gap = Math.min(lead.gap, 0.4);
          } else if (cut.kind === 'late') {
            route.i = Math.min(ahead, cut.idx + 1);
            for (const f of live) f.gap += 1 + Math.max(0, -cut.margin) * 1.5;
          } else {
            route.i = Math.min(ahead, route.i + Math.floor(cut.took));
            for (const f of live) f.gap += 1.5 + 0.8 * cut.took;
          }
          c.emit('chase_cut', cut.kind === 'cut_off' ? 'good' : cut.hurt ? 'bad' : 'mixed', { variant: cut.kind, hero: true, gate, mode: cut.mode, body: car?.body ?? 'foot', obstacles: cut.told.join(','), via: cut.told[0] ?? '', from, place: w.locations[cut.at]!.name, foe: lead.name, hurt: cut.hurt, read: Math.round(readingOf(w) * 100) });
          if (cut.wrecked && car && h.vehicle && car.hp <= 0) {
            wreckHeroCar(c, car);
            if (dead(c) || !fit(h)) result = 'wrecked';
            else c.emit('chase_mount', 'mixed', { variant: 'wrecked', car: car.name, body: car.body, place: here.name });
          }
          if (dead(c)) result = 'wrecked';
          else if (!result && !fit(h)) result = 'bailed';
          tell('shortcut', told, hurt, round, car, lead);
          continue;
        }
      }

      // Onto their vehicle. She leaves her own wherever it is; if she misses she is left with a bruise and some ground to make up.
      if (action === 'board' && lead.car) {
        if (rng.chance(boardP(lead))) {
          if (car) {
            if (h.companions.some((a) => a.hp > 0 && car.riders.includes(a.id))) {
              follower = car;
              delete h.vehicle;
            } else leaveBehind(c, car, 'parked');
          }
          boarded = lead;
          inside = false;
          doors = 10 + lead.car.armor * 8;
          last = null;
          lead.gap = 0;
          train(c, 'athletics', 2);
          told.push('board');
          tell('board', told, 0, round, car, lead);
          continue;
        }
        h.hp -= 3;
        hurt += 3;
        lead.gap += 1.5;
        train(c, 'athletics', 1);
        told.push('board_failed');
      }

      // Cruisers across the way on: seen from a way off, and run at when it comes to it.
      if (board?.block && !board.block.done) {
        const ahead = blockIn(board)!;
        if (!board.block.told && ahead <= 14) {
          board.block.told = true;
          c.emit('chase_block', 'bad', { variant: 'ahead', place: here.name, car: car?.name ?? 'on foot', body: car?.body ?? 'foot' });
        }
        if (ahead <= 0) {
          board.block.done = true;
          const br = new Rng(`blockrun:${w.worldSeed}:${w.beat}:${board.loc}:${round}`);
          const p = car ? clamp(0.4 + 0.04 * skill + (bike ? 0.25 : 0) - 0.3 * squeeze, 0.1, 0.85) : clamp(0.6 + 0.03 * skillValue(h, 'athletics') + 0.01 * h.reflex - 0.2 * squeeze, 0.2, 0.9);
          if (br.chance(p)) {
            if (car) hitCar(car, car.maxHp * 0.03, 'ram');
            told.push('block:through');
            c.emit('chase_block', 'good', { variant: 'through', place: here.name, car: car?.name ?? 'on foot', body: car?.body ?? 'foot' });
          } else {
            for (const f of live) f.gap = Math.min(f.gap, 0.5);
            if (car) hurt += hitCar(car, car.maxHp * 0.18, 'ram').taken;
            else {
              h.hp -= 4;
              hurt += 4;
            }
            told.push('block:stopped');
            c.emit('chase_block', 'bad', { variant: 'stopped', place: here.name, car: car?.name ?? 'on foot', body: car?.body ?? 'foot' });
          }
        }
      }

      // The road moves everybody: the faster closes on the slower, skill matters when it is tight, and speed when it is open.
      for (const f of live) {
        const edge = ((f.pace - hero) * 0.5) * (0.6 + 0.7 * (1 - squeeze));
        const sk = skill * 0.2 * squeeze + (bike ? 1.2 * squeeze : 0);
        const drift = o.mode === 'pursuer' ? edge - sk : -edge + sk;
        // Somebody running for their life gives it everything they have: a runner is never just standing there.
        const burst = o.mode === 'pursuer' && f.foot ? 0.4 + rng.next() * 1.8 : 0;
        f.gap = Math.max(0, f.gap + drift + burst + (rng.next() - 0.5) * 1.5);
      }
      if (action === 'floor_it') {
        const push = (foot ? 1.2 : 1.5) + skill * 0.25;
        for (const f of live) f.gap = Math.max(0, f.gap + (o.mode === 'pursuer' ? -push : push));
        if (car) hitCar(car, car.maxHp * 0.02, 'fire'); // redlining
        told.push('floor');
      }

      // What she does to them.
      if (action === 'lane_split') {
        const t = nearest();
        t.gap += 1.5 + skill * 0.2;
        told.push('split');
      } else if (action === 'shoot') {
        const t = nearest();
        const dmg = Math.round((heroPower(w) * 0.3 + (car ? riderShots(h, car) : 0)) * (0.6 + rng.next() * 0.8));
        if (rng.chance(0.6 - (t.gap > 3 ? 0.1 : 0) - (foot ? 0.1 : 0))) {
          dmgChaser(c, t, dmg, told, fxOf(h.weapon).pierce);
          told.push(`shot:${t.name}`);
        } else told.push('miss');
        train(c, 'marksmanship', 1);
      } else if (action === 'strike') {
        const t = nearest();
        const fx = fxOf(h.weapon);
        const melee = h.weapon.tags.includes('melee');
        const dmg = Math.round(heroPower(w) * (melee ? 0.7 : 0.45) * (0.6 + rng.next() * 0.8) + fx.pierce * 0.3);
        if (rng.chance(clamp(0.6 + 0.02 * h.reflex - 0.05 * (t.pace - hero), 0.25, 0.9))) {
          dmgChaser(c, t, dmg, told, fx.pierce);
          told.push(`struck:${t.name}`);
        } else told.push('miss');
        train(c, melee ? 'melee' : 'marksmanship', 1);
      } else if (action === 'ram' && car) {
        const t = nearest();
        const rel = (hero + t.pace) * 0.9 + car.armor;
        if (t.car) {
          const hit = hitCar(t.car, rel * (bike && t.car.body !== 'bike' ? 0.3 : 0.9), 'ram');
          if (hit.wrecked) wreckChaser(c, t, told);
        }
        const mine = hitCar(car, rel * (bike ? 1.2 : 0.5), 'ram');
        hurt += mine.taken;
        train(c, 'driving', 1);
        told.push('ram');
      } else if (action === 'lose_them' && rng.chance(clamp(0.28 + skill * 0.05 - (squeeze < 0.7 ? 0.1 : 0) + (bike ? 0.12 : 0) + (foot ? 0.1 : 0) - 0.05 * (live.length - 1), 0.1, 0.85))) {
        result = 'escaped';
        told.push('lost');
        // The surest way first: a door or an alley, then a way up, and a fence or a duct only if it is much nearer (it can go wrong, and for a car it can be no way at all).
        const mode0: Mode = car ? (car.body === 'bike' ? 'bike' : 'car') : 'foot';
        const rank = (x: Out): number => x.d + (x.kind === 'over' ? 5 : x.kind === 'up' ? 2 : x.kind === 'cover' ? 9 : 0) + (x.kind === 'over' && x.via && !Number.isFinite(VIA[x.via][mode0]) ? 99 : 0);
        const out = outs.filter((x) => x.kind !== 'crowd').sort((a, b) => rank(a) - rank(b))[0] ?? outs.find((x) => x.kind === 'crowd');
        if (out) {
          told.push(`lost:${out.kind}`);
          if (out.kind === 'over' && out.to && out.via && board) {
            // Over the fence, through the duct: whatever is in the way is still in the way. A car cannot take what it cannot take, and she can come to grief on it.
            const mode: Mode = car ? (car.body === 'bike' ? 'bike' : 'car') : 'foot';
            if (Number.isFinite(VIA[out.via][mode])) {
              const r = cross(c, heroCrosser(car), { from: h.locationId, to: out.to, via: out.via, ...(out.over ? { over: out.over } : {}), cost: 0 });
              hurt += r.hurt;
              told.push(`over:${r.told}`);
              if (r.wrecked && car && h.vehicle && car.hp <= 0) {
                wreckHeroCar(c, car);
                if (dead(c) || !fit(h)) result = 'wrecked';
              }
              if (!result || result === 'escaped') {
                board.placed.board.hero = { ...out.at };
                if (r.delay >= 1.5) {
                  // Stuck on it: they catch up.
                  result = null;
                  for (const f of live) f.gap = Math.min(f.gap, 1);
                  told.splice(0, told.length, ...told.filter((t) => !t.startsWith('lost')), 'over:stuck');
                } else {
                  relocate(w, out.to);
                  refresh();
                  hid = true;
                }
              }
            } else {
              result = null;
              told.splice(0, told.length, ...told.filter((t) => !t.startsWith('lost')), 'over:no_way');
            }
          } else if ((out.kind === 'door' || out.kind === 'mouth') && out.to) {
            relocate(w, out.to);
            refresh();
            hid = true;
          } else if (out.kind === 'cover' && board) {
            // Down in the dark off the line, and still: they run by, and it is the same scene as anywhere else people have not seen her.
            board.placed.board.hero = { ...out.at };
            h.stealth = true;
            const r = hideScene(c, board, live, out.at);
            for (const f of live) {
              const mine = (xs: Npc[]): boolean => f.crew.some((n) => xs.includes(n));
              if (mine(r.seen)) f.gap = Math.min(f.gap, 1.5);
              else {
                f.off = true;
                f.gap = ESCAPE_GAP + 1;
                if (f.crew.every((n) => !n.alive)) f.alive = false;
                else if (mine(r.left)) {
                  leaveSearching(w, board, [f], out.at);
                  for (const n of r.left) searching.add(n);
                  searchStreet = h.locationId;
                }
              }
            }
            runPast(w, board, [{ crew: r.gone }]);
            if (r.down.length) told.push('ambush');
            if (r.seen.length) {
              result = null;
              h.stealth = false;
              told.splice(0, told.length, ...told.filter((t) => !t.startsWith('lost')), 'hide:found');
            } else {
              hid = true;
              if (!o.foes.some((f) => f.alive && !f.off)) result = o.foes.some((f) => f.alive) ? 'escaped' : 'won';
            }
          } else if (out.kind === 'up' && board) {
            board.placed.board.hero = { ...out.at };
            hid = true;
          }
        }
      } else if (action === 'bail') {
        unseat('bail');
      } else if (action === 'grab' && ride) {
        // A vehicle on the street: hers, one she has the key to, or one she can take. It costs her a step either way.
        const got = grabVehicle(c, here, ride);
        for (const f of live) f.gap = Math.max(0, f.gap + (o.mode === 'pursuer' ? 1.2 : -1.2));
        told.push(got ? 'grab' : 'grab_failed');
      } else if (action === 'dismount' && car) {
        // The one she is after is on foot in a place a car is no good for.
        leaveBehind(c, car, 'parked');
        c.emit('chase_mount', 'mixed', { variant: 'dismount', car: car.name, body: car.body, foe: lead.name, place: here.name, scene: setting });
        told.push('dismount');
      }

      // The road itself: flat out down a narrow or a crowded street is how a chase ends in a wall. On foot, it is people, or it is cars.
      if (!result) {
        const pace = action === 'floor_it' ? 1 : action === 'swerve' || action === 'lane_split' ? 0.8 : 0.7;
        if (foot && ran && board) {
          // The people on the line: round them if there is room, through them if there is not.
          const crew = o.foes.flatMap((f) => f.crew.map((n) => n.id));
          const people = inTheWay(board, ran[0], ran[1], [...crew, ...h.companions.flatMap((a) => (a.npcId ? [a.npcId] : []))]).slice(0, 2);
          let slowed = 0;
          let closed = 0;
          for (const p of people) {
            const who = w.npcs[p.id];
            if (!who) continue;
            // Charm: some of them get out of her way, and then close up behind her where her pursuers are going. Officers are harder to talk round.
            const law = who.tags.includes('cop') || who.tags.includes('security');
            const charm = clamp(0.06 * (h.charm - 2) * (law ? 0.4 : 1), 0, 0.85);
            if (o.mode === 'pursued' && rng.chance(charm)) {
              closed++;
              c.emit('chase_crowd', 'good', { variant: 'clear', who: who.name, role: who.role, place: here.name });
              continue;
            }
            const skill = clamp(0.6 + 0.03 * skillValue(h, 'athletics') + 0.01 * h.reflex - 0.2 * squeeze, 0.2, 0.92);
            if (p.room && rng.chance(skill + 0.1)) {
              slowed += 0.3;
              c.emit('chase_crowd', 'mixed', { variant: 'weave', who: who.name, role: who.role, place: here.name });
              continue;
            }
            // No room: she goes through. Most times it's a shoulder and a shout; sometimes they both go down.
            if (rng.chance(skill)) {
              if (!rng.chance(charm)) who.affinity -= 3;
              slowed += 0.2;
              c.emit('chase_crowd', 'mixed', { variant: 'shove', who: who.name, role: who.role, place: here.name });
              stepAside(board, p.id);
            } else {
              const st = bump(c, who, here, cls, pace, rng.chance(charm));
              slowed += st.lost;
              told.push('down');
              if (st.angry && !o.foes.some((f) => f.crew.includes(st.angry!))) {
                st.angry.hostile = true;
                if (o.mode === 'pursued') o.foes.push(onFoot(st.angry, 1.5));
                else owed.push(st.angry);
              }
              if (dead(c)) result = 'wrecked';
              break;
            }
          }
          if (slowed) for (const f of live) f.gap = Math.max(0, f.gap + (o.mode === 'pursuer' ? slowed : -slowed));
          // The ones who let her by are not letting them by.
          if (closed && o.mode === 'pursued') {
            for (const f of live) if (f.foot || f.car) f.gap += 0.6 * closed;
            c.emit('chase_crowd', 'mixed', { variant: 'ranks', who: live[0]?.name ?? 'them', place: here.name, count: closed });
          }
          // Whoever is still on the line behind her is in their way too.
          if (!result && o.mode === 'pursued') {
            for (const f of live) {
              if (!f.foot) continue;
              const back = inTheWay(board, board.s - f.gap, board.s, crew).length;
              if (back) f.gap += Math.min(2, back) * 0.3;
            }
          }
        }
        // And whoever else is watching has an opinion.
        if (!result && board) {
          const crew = o.foes.flatMap((f) => f.crew.map((n) => n.id));
          for (const r of bystand(c, board, { except: crew, done: said, chased: o.mode === 'pursued', lost, limit: 2 })) {
            c.emit('chase_bystander', r.kind === 'trip' || r.kind === 'point' || r.kind === 'call' ? 'bad' : r.kind === 'help' ? 'good' : 'mixed', { variant: r.kind, who: r.who.name, role: r.who.role, place: here.name, foe: lead.name });
            if (r.kind === 'trip') for (const f of live) f.gap = Math.max(0, f.gap - 0.8);
            else if (r.kind === 'help') for (const f of live) f.gap += 1;
            else if (r.kind === 'point') loud += 0.8;
            else if (r.kind === 'call') {
              // They can tell what they can see, which is that something is going on. A patrol takes a few rounds, and the law calling it in gets one there sooner.
              const eta = round + (r.who.tags.includes('cop') || r.who.tags.includes('security') ? rng.int(2, 3) : rng.int(3, 6));
              patrolAt = patrolAt === null ? eta : Math.max(round + 1, Math.min(patrolAt, eta) - 1);
            }
          }
          // And if it goes on long enough for them to get here, they do.
          if (!result && patrolAt !== null && round >= patrolAt) {
            patrolAt = null;
            const foes = live.flatMap((f) => f.crew.filter((n) => n.alive));
            const a = patrolArrives(c, foes, here);
            c.emit('chase_police', a.side === 'her' ? 'bad' : a.side === 'all' ? 'bad' : 'good', { variant: a.side, force: a.force, kind: a.kind, place: here.name, count: a.officers.length, foe: lead.name });
            if (a.side === 'her') {
              for (const n of a.officers) o.foes.push(onFoot(n, 2.5));
            } else if (a.side === 'foes') {
              for (const f of live) {
                if (!rng.chance(0.6)) continue;
                f.off = true;
                f.gap = ESCAPE_GAP + 1;
                for (const n of f.crew) n.downUntil = Math.max(n.downUntil, w.beat + 20);
              }
              sendAway(c, a.officers);
            } else if (a.side === 'all') {
              shootEveryone(c, foes);
              if (dead(c)) result = 'wrecked';
              sendAway(c, a.officers);
            } else sendAway(c, a.officers);
          }
        }
        if (car && h.vehicle) {
          if (rng.chance(hopChance(w, car, cls, pace, traffic) * 0.5 * (1 + 0.25 * Math.min(2, board ? pinches(board) : 0)))) {
            const crash = accident(c, car, here, cls, pace, true);
            told.push(`crash:${crash.kind}`);
            if (crash.over) {
              // Thrown, or the end of it: either way she may still be able to carry on, on foot.
              if (dead(c)) result = 'wrecked';
              else if (!fit(h)) result = !h.vehicle && car.hp > 0 ? 'bailed' : 'wrecked';
              else c.emit('chase_mount', 'mixed', { variant: car.hp > 0 ? 'thrown' : 'wrecked', car: car.name, body: car.body, place: here.name });
            }
          }
        } else if (foot && rng.chance(footChance(w, cls, pace, traffic) * 0.5 * (1 + 0.25 * Math.min(2, board ? pinches(board) : 0)))) {
          const st = stumble(c, here, cls, pace);
          for (const f of live) f.gap = Math.max(0, f.gap + (o.mode === 'pursuer' ? st.lost : -st.lost));
          told.push(st.down ? 'down' : 'stumble');
          if (st.angry && !o.foes.some((f) => f.crew.includes(st.angry!))) {
            st.angry.hostile = true;
            if (o.mode === 'pursued') o.foes.push(onFoot(st.angry, 1.5));
            else owed.push(st.angry);
          }
          if (dead(c)) result = 'wrecked';
        }
      }

      // They work out where she is going, and some of them cut across to it.
      if (!result && o.mode === 'pursued' && route && !boarded) {
        for (const f of o.foes) {
          if (!f.alive || wings(f) || bandOf(f.gap) === 'locked' || !rng.chance(0.1 + (f.gap > 3 ? 0.1 : 0))) continue;
          const cop = f.crew.some((n) => n.tags.includes('cop'));
          const cut = cutAcross(c, { who: foeCrosser(f), from: h.locationId, route, accuracy: cop ? 0.45 : 0.35, behind: behindOf(f.gap) });
          if (cut.kind === 'none') continue;
          c.emit('chase_cut', cut.kind === 'cut_off' ? 'bad' : 'good', { variant: cut.kind, hero: false, mode: cut.mode, body: car?.body ?? 'foot', obstacles: cut.told.join(','), via: cut.told[0] ?? '', from: here.name, place: w.locations[cut.at]!.name, foe: f.name, hurt: 0, read: 0 });
          told.push(`cut:${cut.kind}`);
          if (cut.wrecked && f.car) wreckChaser(c, f, told);
          if (cut.kind === 'cut_off' && f.alive) {
            // They are waiting where she was going.
            route.i = cut.idx;
            relocate(w, cut.waypoint);
            refresh();
            f.gap = 0.4;
          } else f.gap += 1.5 + 0.5 * Math.max(0, cut.took);
          break;
        }
      }

      // What they do to her.
      if (!result) {
        for (const f of o.foes.filter((x) => x.alive)) {
          const b = bandOf(f.gap);
          const hit = (action === 'swerve' || action === 'lane_split' ? 0.3 : 0.55) + (squeeze < 0.3 ? 0.05 : 0);
          if (!foot && car && f.foot) {
            // On foot, they cannot touch a car; all they have is whatever they throw.
            if ((b === 'near' || b === 'close') && rng.chance(hit * 0.4)) {
              const dmg = Math.round(power(f) * 0.3 * (0.6 + rng.next() * 0.8));
              const r = hitCar(car, bike ? dmg * 0.5 : dmg, 'gun');
              hurt += r.taken;
              h.hp -= Math.round(bike ? dmg * 0.5 : r.taken * SPILL);
              told.push(`hit:${f.name}`);
            }
            continue;
          }
          if (wings(f) && b === 'locked' && car) {
            // At the door.
            const p = clamp(0.3 + power(f) * 0.002 - car.armor * 0.06, 0.1, 0.7);
            if (rng.chance(p)) {
              unseat('door');
              break;
            }
            hurt += hitCar(car, power(f) * 0.15, 'ram').taken;
          } else if (b === 'near' || b === 'close' || b === 'locked') {
            if (rng.chance(hit)) {
              const dmg = Math.round(power(f) * (wings(f) ? 0.3 : 0.5) * (0.6 + rng.next() * 0.8));
              if (car) {
                // In a car the car takes it and a share gets through; on a bike it is split between her and the bike.
                const r = hitCar(car, bike ? dmg * 0.5 : dmg, 'gun');
                hurt += r.taken;
                h.hp -= Math.round(bike ? dmg * 0.5 : r.taken * SPILL);
              } else {
                h.hp -= Math.round(dmg * 0.8);
                hurt += Math.round(dmg * 0.8);
              }
              told.push(`hit:${f.name}`);
            }
          }
          if (f.car && (b === 'close' || b === 'locked') && rng.chance(0.4)) {
            if (car) {
              const rel = (f.pace + hero) * 0.7;
              hurt += hitCar(car, rel, 'ram').taken;
              const x = hitCar(f.car, rel * 0.5, 'ram');
              if (x.wrecked) wreckChaser(c, f, told);
              told.push('rammed');
              // A car that hits a bike can throw her off it.
              if (bike && f.car.body !== 'bike' && rng.chance(0.35)) {
                unseat('thrown');
                break;
              }
            } else {
              // On foot, in front of a car.
              const dmg = Math.round(f.pace * 1.1);
              h.hp -= dmg;
              hurt += dmg;
              maybeInjure(c, dmg, 0.35);
              told.push('struck');
              if (!rng.chance(clamp(0.5 + 0.04 * skillValue(h, 'athletics') + 0.02 * h.reflex, 0.1, 0.9))) {
                f.gap = 0;
                told.push('down');
              }
            }
          }
        }
        if (dead(c) && !result) result = 'wrecked';
      }

      // A wrecked ride is the end of the ride, and of the chase only if she can't go on.
      if (!result && car && h.vehicle && car.hp <= 0) {
        wreckHeroCar(c, car);
        if (dead(c) || !fit(h)) result = 'wrecked';
        else c.emit('chase_mount', 'mixed', { variant: 'wrecked', car: car.name, body: car.body, place: here.name });
      }
      // Anybody who can see they are not getting away, or who thinks they would do better standing, stops running. Then it is a fight.
      if (!result && o.mode === 'pursuer') {
        const f = o.foes.find((x) => x.alive && !wings(x) && rng.chance(standP(x, false)));
        if (f) {
          result = 'caught';
          told.push(`stand:${f.name}`);
          c.emit('chase_mount', 'mixed', { variant: 'foe_stands', foe: f.crew[0]?.name ?? f.name, car: f.car?.name ?? '', body: f.car?.body ?? 'foot', place: here.name });
        }
      }
      // Running wears everybody down: the longer it goes on, the likelier she is to stop and turn round.
      if (!result && o.mode === 'pursued' && !boarded && round > 1 && rng.chance(standTired(w))) {
        result = 'caught';
        told.push('stand:tired');
        c.emit('chase_mount', 'mixed', { variant: 'hero_stands', foe: lead.name, place: here.name, body: car?.body ?? 'foot', car: car?.name ?? '' });
      }
      if (!result && o.foes.every((f) => !f.alive)) result = 'won';
      // Out of sight for a couple of rounds with nobody on her heels: she has lost them. (They look for her where they last had her.)
      if (!result && board && !boarded && round > 1 && o.mode === 'pursued') {
        const eyes = camerasSeeHer(w);
        const seen = live.some((f) => chaserSees(w, board!, f.gap, wings(f)) || (eyes && (f.car?.kind === 'police' || f.car?.kind === 'atlas' || f.crew.some((n) => n.tags.includes('cop')))));
        lost = !seen;
        if (seen) {
          unseen = 0;
          lost = false;
          loud = 0;
          lastSeen = tileAt(board, board.s);
        } else if (++unseen >= 2) {
          // They go to where they last had her, and look from there.
          const from = lastSeen ?? tileAt(board, 0);
          unseen = 0;
          if (seesFrom(w, board, from)) {
            for (const f of live) f.gap = Math.min(f.gap, 2.5);
            c.emit('chase_search', 'bad', { variant: 'found', place: here.name, foe: lead.name });
          } else {
            // Not there. Did she keep running, or stop to hide? Each of them makes the guess for themselves: on after her, or out to search.
            // Whoever can track her has some idea which it was, and she kept running.
            const guess = hideGuess(w, board, from);
            const fan = live.filter((f) => {
              const t = tracked(f, 'sight');
              return rng.chance(t === 'hot' ? 0 : t === 'warm' ? guess * 0.35 : guess);
            });
            const names = (fs: Chaser[]): string => fs.map((f) => f.name).join(' and ');
            if (fan.length) {
              leaveSearching(w, board, fan, from);
              for (const f of fan) for (const n of f.crew) if (n.alive) searching.add(n);
              searchStreet = h.locationId;
            }
            for (const f of fan) {
              f.off = true;
              f.gap = ESCAPE_GAP + 1;
            }
            if (fan.length === live.length) {
              result = 'escaped';
              told.push('lost:sight');
              hid = true;
              c.emit('chase_search', 'good', { variant: 'fan', place: here.name, foe: names(fan), count: fan.length });
            } else if (fan.length) {
              c.emit('chase_search', 'mixed', { variant: 'split', place: here.name, foe: names(fan), count: fan.length, other: names(live.filter((f) => !fan.includes(f))) });
            } else {
              for (const f of live) f.gap += 1.5;
              c.emit('chase_search', 'mixed', { variant: 'onward', place: here.name, foe: names(live), count: live.length });
            }
          }
        }
      }
      const caughtOnFoot = foot && o.mode === 'pursued' && live.some((f) => bandOf(f.gap) === 'locked') && rng.chance(0.7);
      // So far behind that nobody can see anything: unless somebody can follow the trail.
      if (!result && live.every((f) => f.gap >= ESCAPE_GAP)) {
        const kept = o.mode === 'pursued' ? live.filter((f) => tracked(f, 'far') !== 'none') : trackedByHer(live);
        if (kept.length) {
          for (const f of kept) f.gap = Math.min(f.gap, ESCAPE_GAP * BEHIND[trails.get(f) ?? 'cold']);
          c.emit('chase_track', 'mixed', { variant: trails.get(kept[0]!) ?? 'cold', hero: o.mode === 'pursuer', foe: kept.map((f) => f.name).join(' and '), place: here.name, count: kept.length });
        } else result = o.mode === 'pursued' ? 'escaped' : 'lost';
      }
      else if (!result && o.mode === 'pursuer' && live.some((f) => wings(f) && bandOf(f.gap) === 'locked') && action !== 'shoot') result = 'caught';
      else if (!result && (caughtOnFoot || (o.mode === 'pursued' && live.some((f) => bandOf(f.gap) === 'locked') && round >= maxRounds - 1 && rng.chance(0.5)))) result = 'caught';

      // Whatever she does while they cannot see her, they can hear.
      if (lost && !result) loud += carries(ambientNoise(w, here)) * (action === 'shoot' ? 1 : action === 'strike' || action === 'ram' ? 0.6 : action === 'floor_it' ? (car ? 0.7 : 0.45) : car ? 0.45 : 0.3);
      tell(action, told, hurt, round, car, lead);
      const now = mounted();
      if (now && now.hp / now.maxHp <= 0.25 && round < maxRounds && !result) c.emit('car_hit', 'bad', { variant: 'smoking', car: now.name, body: now.body, mine: true });
    }
    if (!result) result = o.mode === 'pursuer' ? (o.foes.some((f) => f.alive && !wings(f) && f.gap < 3) ? 'caught' : 'lost') : o.foes.some((f) => f.alive && f.gap < 3) ? 'caught' : 'escaped';
    finish(c, o, result, last, rounds, hid);
    if (result === 'caught' || result === 'won' || result === 'bailed' || result === 'wrecked') rest(w);
  });
  // Anybody left looking for her on the street she is hiding on: that is a scene of its own.
  if (!w.over && !o.noSearch && result === 'escaped' && hid && h.hp > 0 && searching.size && h.locationId === searchStreet) {
    const crew = [...searching].filter((n) => n.alive && n.locationId === h.locationId && n.downUntil <= w.beat);
    if (crew.length) streetHunt(c, crew, o.cause, { keepSpot: true });
  }
  // Anybody she knocked into on the way, who has had enough.
  if (!w.over && owed.length && result !== 'wrecked') {
    const crowd = owed.filter((n) => n.alive).slice(0, 2).map((n) => onFoot(n, 2));
    if (crowd.length && w.hero.hp > 0) {
      const after = runChase(c, { mode: 'pursued', cause: 'somebody she ran into', foes: crowd, maxRounds: 4 });
      if (after === 'caught' && !w.over) fight(c, crowd.flatMap((f) => f.crew).filter((n) => n.alive), { cause: 'somebody she ran into', joiners: false });
    }
  }
  // The vehicle her companions were in has been following all the way: it pulls up beside her.
  if (follower && !w.over) {
    const f: Vehicle = follower;
    if (f.hp > 0) {
      const names = h.companions.filter((a) => f.riders.includes(a.id)).map((a) => a.name).join(' and ');
      (h.parked ??= []).push(parkIt(f, h.locationId, w.clock + lifeOf(f, keyTo(h, f.id))));
      c.emit('vehicle', 'good', { variant: 'catches_up', car: f.name, body: f.body, riders: names, place: w.locations[h.locationId]!.name });
    }
  }
  return result ?? 'lost';
}

/** Streets she could step onto from here. */
function streetsFrom(w: Ctx['w'], from: string): string[] {
  return (w.locations[from]?.exits ?? []).filter((e) => !e.hidden && !e.gate && w.locations[e.to]?.kind === 'street' && !isShut(w, e.to)).map((e) => e.to);
}

/** The vehicle she leaves: parked, hers to come back for, or lying where it fell (a stray, damaged as it is). */
function leaveBehind(c: Ctx, car: Vehicle, how: 'parked' | 'stray'): void {
  const { w } = c;
  const h = w.hero;
  const at = h.locationId;
  delete h.vehicle;
  // (Either way it is hers to come back for: left at the kerb, or lying where it fell. Not for the taking by the first stray that was already there.)
  if (how === 'parked' || car.hp > 0) (h.parked ??= []).push(parkIt(car, at, w.clock + lifeOf(car, keyTo(h, car.id))));
  else {
    // Totalled behind her: a wreck on the street for good.
    w.flags[`wreck:${at}`] = true;
    w.flags[`stolen:${at}`] = true;
  }
}

/** A chaser's crew get out of their car and go on on foot. It is left on the street where they stopped. */
function getOut(c: Ctx, f: Chaser, at: string): void {
  const { w } = c;
  if (!f.car) return;
  const mk = ALL_MAKES.find((m) => m.name === f.car!.name);
  if (mk && f.car.hp > 0 && !w.strays?.[at] && !w.flags[`stolen:${at}`]) (w.strays ??= {})[at] = { ...vehicleOf(mk, f.car.id), hp: f.car.hp };
  c.emit('chase_mount', 'mixed', { variant: 'foe_out', foe: f.crew[0]?.name ?? f.name, car: f.car.name, body: f.car.body ?? 'car', place: w.locations[at]!.name });
  delete f.car;
  f.foot = true;
  f.pace = f.crew[0] ? foeProfile(f.crew[0]).speed : 3;
  f.gap += 1;
}

/** What a rider with a gun adds to hers. */
function riderShots(h: Ctx['w']['hero'], car: Vehicle): number {
  let d = 0;
  for (const a of h.companions) if (a.hp > 0 && car.riders.includes(a.id)) d += (KINDS[a.kind]?.assist.dmg ?? 0) * 0.4;
  return d;
}

/** The front crew member takes it. When the last one goes down nobody is driving: the vehicle coasts to a stop where it is. */
function hurtCrew(c: Ctx, t: Chaser, dmg: number, told: string[]): void {
  const n = t.crew.find((x) => x.alive);
  if (!n) return;
  n.hp -= dmg;
  if (n.hp <= 0) {
    kill(c, c.w, n, 'a chase');
    told.push(`down:${n.name}`);
  }
  if (!t.crew.some((x) => x.alive)) {
    t.alive = false;
    if (t.car && t.car.hp > 0) {
      const { w } = c;
      const at = w.hero.locationId;
      const mk = ALL_MAKES.find((m) => m.name === t.car!.name);
      if (mk && !w.strays?.[at] && !w.flags[`stolen:${at}`]) (w.strays ??= {})[at] = { ...vehicleOf(mk, t.car.id), hp: t.car.hp };
    }
  }
}

/**
 * What she puts into a chaser. A vehicle can be shot through the glass at whoever is driving (easier on thin ones, and with something
 * that bites armor) or at the vehicle itself, which is how it goes up. Someone on foot just takes it.
 */
function dmgChaser(c: Ctx, t: Chaser, dmg: number, told: string[], pierce = 0): void {
  if (t.car) {
    const armor = Math.max(0, t.car.armor - pierce * 0.5);
    if (c.rng.chance(clamp(0.45 - 0.05 * armor + 0.03 * pierce, 0.1, 0.8))) {
      hurtCrew(c, t, Math.round(dmg * 0.8), told);
      told.push('at_driver');
      return;
    }
    const keep = t.car.armor;
    t.car.armor = armor;
    const hit = hitCar(t.car, dmg, 'gun');
    t.car.armor = keep;
    if (hit.wrecked) wreckChaser(c, t, told);
  } else if (t.foot) {
    hurtCrew(c, t, dmg, told);
  } else {
    // A dragon takes it on the hide; it never drops out of a chase, only out of the sky when she gets it into a fight.
    for (const n of t.crew) n.hp = Math.max(1, n.hp - dmg);
  }
}


/** Their car goes up with them in it. */
function wreckChaser(c: Ctx, t: Chaser, told: string[]): void {
  t.alive = false;
  if (t.car) t.car.hp = 0;
  told.push(`wreck:${t.name}`);
  c.emit('car_wreck', 'good', { car: t.car?.name ?? t.name, kind: t.car?.kind ?? 'police', body: t.car?.body ?? 'car', inside: t.crew.map((n) => n.name).join(' and '), hero: false, count: t.crew.length, mine: false });
  for (const n of t.crew) if (n.alive) kill(c, c.w, n, 'a car going up');
}

/** The end of it: what happened to the car, to her, and to where she is. */
function finish(c: Ctx, o: ChaseOpts, result: ChaseResult, car: Vehicle | null, rounds: number, hid = false): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = h.locationId;
  w.clock += rounds;
  let taken = 0;
  // She may have been killed on the way, by a car she ran into or one that was wrecked.
  if (dead(c)) {
    c.emit('chase_end', 'bad', { variant: 'wrecked', mode: o.mode, taken: 0, car: car?.name ?? 'on foot', body: car?.body ?? 'foot', rounds });
    c.emit('death', 'bad', { killer: car ? 'a burning car' : 'the road', place: w.locations[loc]!.name, cause: o.cause, level: h.level });
    return;
  }
  if (result === 'wrecked' && car) {
    // Up it goes, with her in it, and everyone with her. (If a crash has already done it, it is done.)
    taken = !h.vehicle && car.hp <= 0 ? 0 : wreckHeroCar(c, car);
    if (dead(c)) {
      c.emit('chase_end', 'bad', { variant: result, mode: o.mode, taken, car: car.name, rounds });
      c.emit('death', 'bad', { killer: 'a burning car', place: w.locations[loc]!.name, cause: o.cause, level: h.level });
      return;
    }
  } else if (result === 'bailed') {
    // Out of the car at speed, and the car is lost to whoever was after her.
    // (If a crash threw her, the fall has been taken and the vehicle left.)
    const fall = h.vehicle && car ? Math.round(heroSpeed(w) * (car.body === 'bike' ? 0.7 : 1.2)) : 0;
    taken = fall;
    if (fall) {
      h.hp -= fall;
      maybeInjure(c, fall);
    }
    delete h.vehicle;
    // A bike goes down where she left it, and is hers to come back for.
    if (car && car.body === 'bike' && car.hp > 0 && h.vehicle) (h.parked ??= []).push(parkIt(car, loc, w.clock + lifeOf(car, keyTo(h, car.id))));
    train(c, 'athletics', 2);
  } else if (result === 'escaped') {
    // Out of sight: a few streets on.
    // (Unless she went somewhere to do it, and is there.)
    const far = hid ? [] : roadsFrom(w, loc, 4, car?.body ?? 'bike').filter((r) => r.hops >= 3);
    if (far.length) for (const id of rng.pick(far).path) relocate(w, id);
    if (o.foes.some((f) => f.car?.kind === 'police' || f.crew.some((n) => n.tags.includes('cop')))) w.heat.npd = Math.max(0, (w.heat.npd ?? 0) - 2);
    train(c, car ? 'driving' : 'athletics', 2);
  } else if (result === 'won') train(c, car ? 'driving' : 'athletics', 2);
  // A cruiser still running when it ends is left where it stopped: hers for the taking, and its driver has the key.
  if (result === 'caught' || result === 'bailed' || result === 'wrecked') {
    const left = o.foes.find((f) => f.alive && f.car && f.car.hp > 0);
    const mk = left?.car && ALL_MAKES.find((m) => m.name === left.car!.name);
    if (left?.car && mk && !w.strays?.[loc] && !w.flags[`stolen:${loc}`]) (w.strays ??= {})[loc] = { ...vehicleOf(mk, left.car.id), hp: left.car.hp };
  }
  for (const a of [...h.companions]) if (a.hp <= 0) removeCompanion(c, a, 'lost');
  c.emit('chase_end', result === 'escaped' || result === 'won' ? 'good' : result === 'lost' ? 'mixed' : 'bad', { variant: result, mode: o.mode, taken, car: car?.name ?? 'on foot', body: car?.body ?? 'foot', rounds, foe: o.foes[0]?.name ?? 'them', state: car ? stateOf(car) : 'sound' });
}

// =============================================================== the police

/** Cops in cruisers, two to a car, as chasers. */
export function pursuers(cops: Npc[], rng?: { chance(p: number): boolean }): Chaser[] {
  const out: Chaser[] = [];
  let i = 0;
  let k = 0;
  while (i < cops.length) {
    // One in three comes alone, on a bike: the one that can keep up.
    const alone = !!rng && rng.chance(0.3);
    const crew = cops.slice(i, i + (alone ? 1 : 2));
    i += crew.length;
    const bike = alone || crew.length === 1 && cops.length % 2 === 1 && i >= cops.length && !!rng && rng.chance(0.5);
    const mk = bike ? makesOf('police', 'bike')[0]! : MAKES.police[k % 2]!;
    k++;
    const id = `chase:${crew[0]!.id}`;
    // Whoever is driving has the key to it.
    crew[0]!.loadout.push(carKey({ id, name: mk.name }, crew[0]!.tags.includes('ganger')));
    out.push({ name: `${bike ? 'an NPD patrol cycle' : 'an NPD cruiser'} (${crew.map((n) => n.name).join(' and ')})`, crew, car: { id, body: mk.body ?? 'car', kind: 'police', name: mk.name, hp: mk.maxHp, maxHp: mk.maxHp, armor: mk.armor }, pace: mk.pace, gap: 3 + out.length, alive: true });
  }
  return out;
}

/** Two officers to a car. (The old name.) */
export const cruisers = (cops: Npc[]): Chaser[] => pursuers(cops);

/**
 * The police come after her in cars. If they catch her it ends in the street, with the cops; if she gets away the heat drops;
 * if she wrecks them, they are down and the police take that personally.
 */
export function policeChase(c: Ctx, why: 'hijack' | 'ambush' | 'drive_off' | 'crash', cops?: Npc[]): ChaseResult | null {
  const { w } = c;
  const h = w.hero;
  if (!h.vehicle || h.vehicle.hp <= 0) return null;
  const npd = w.heat.npd ?? 0;
  const squad = cops ?? spawnGroup(c, 'npd_officer', npd >= 6 ? 4 : 2);
  const foes = pursuers(squad.filter((n) => n.alive), c.rng);
  if (!foes.length) return null;
  c.emit('ambush', 'bad', { variant: 'npd_chase', count: squad.length, heat: npd, why });
  const result = runChase(c, { mode: 'pursued', cause: 'an NPD pursuit', foes });
  if (w.over) return result;
  if (result === 'caught' || result === 'bailed' || result === 'wrecked') {
    const left = squad.filter((n) => n.alive);
    if (left.length && h.hp > 0) fight(c, left, { cause: 'the end of a police chase', joiners: false });
  } else if (result === 'won') {
    // Cruisers in pieces. The police take that personally.
    w.heat.npd = Math.min(10, (w.heat.npd ?? 0) + 2);
  }
  return result;
}

/** She has been after a dragon in a car: can she get her bumper to it? */
export function dragonChase(c: Ctx, foe: Npc, speed: number, cause: string): ChaseResult {
  return runChase(c, { mode: 'pursuer', cause, foes: [{ name: foe.name, crew: [foe], pace: speed, gap: 8, alive: true }] });
}

// =============================================================== the end of her own car

/**
 * Her car goes up with her in it and everyone with her. A bike throws her as well, a fall on top of the bang. Returns what it did
 * to her; the caller tells it and sees whether she is dead (`dead`).
 */
export function wreckHeroCar(c: Ctx, car: Vehicle): number {
  const { w } = c;
  const h = w.hero;
  const loc = h.locationId;
  const blast = blastInside(car) + (car.body === 'bike' ? Math.round(car.pace * 0.8) : 0);
  h.hp -= blast;
  maybeInjure(c, blast, car.body === 'bike' ? 0.5 : 1);
  const riders = h.companions.filter((a) => car.riders.includes(a.id));
  for (const a of riders) a.hp = 0;
  delete h.vehicle;
  w.flags[`wreck:${loc}`] = true;
  w.flags[`stolen:${loc}`] = true;
  c.emit('car_wreck', 'bad', { car: car.name, kind: car.kind, body: car.body, inside: ['Blackbird', ...riders.map((a) => a.name)].join(' and '), hero: true, count: 1 + riders.length, mine: true });
  if (car.kind === 'police') w.heat.npd = Math.min(10, (w.heat.npd ?? 0) + 2);
  else if (car.kind === 'atlas') w.heat.atlas = Math.min(10, (w.heat.atlas ?? 0) + 2);
  for (const a of [...h.companions]) if (a.hp <= 0) removeCompanion(c, a, 'lost');
  return blast;
}

/** She is dead, and nothing is going to bring her back (the defibrillator is for the generic path to handle). Marks the run over. */
export function dead(c: Ctx): boolean {
  const { w } = c;
  const h = w.hero;
  if (h.hp > 0 || (hasImplantFlag(h, 'defib') && !w.flags.defib_used)) return false;
  w.over = true;
  w.ending = 'dead';
  return true;
}
