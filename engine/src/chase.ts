import type { Ctx, Npc, Vehicle } from './types';
import { ALL_MAKES, MAKES, SPILL, blastInside, carKey, hitCar, keyTo, lifeOf, makesOf, normalize, parkIt, stateOf, vehicleOf } from './cars';
import { fight, heroPower, kill, maybeInjure, relocate } from './combat';
import { spawnGroup, clamp } from './candidate';
import { heroSpeed } from './dragonmodels';
import { nested } from './events';
import { roadClass, roadsFrom, scene, squeezeOf, trafficAt, trafficWord } from './roads';
import { isShut } from './shutdown';
import { foeProfile } from './tactics';
import { footChance, stumble } from './footfx';
import { grabVehicle, vehicleHere } from './vehicles';
import { accident, hopChance } from './drivefx';
import { KINDS, removeCompanion } from './companions';
import { skillValue, train } from './skills';
import { hasImplantFlag } from './skills';

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
}

export interface ChaseOpts {
  /** `pursued`: they are after her and she wants away. `pursuer`: she is after something that is running. */
  mode: 'pursued' | 'pursuer';
  cause: string;
  foes: Chaser[];
  maxRounds?: number;
}

const ESCAPE_GAP = 14;

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
  const maxRounds = o.maxRounds ?? 8;
  const place = w.locations[h.locationId]!.name;
  const mounted = (): Vehicle | null => (h.vehicle && h.vehicle.hp > 0 ? normalize(h.vehicle) : null);
  let last = mounted();
  let rounds = 0;
  // People she knocked into who are coming after her when this is over.
  const owed: Npc[] = [];
  // The road she is on decides how a chase goes, by what kind of street it is and how busy it is right now: a narrow street or a
  // crowded one squeezes everybody (pace counts for less, skill for more, and there are gaps to lose them in); an open, empty one is
  // a race. Not rolled: the same street at the same hour is the same chase.
  // And a chase moves: now and then it turns into the next street along, and the road is whatever that one is.
  let here = w.locations[h.locationId]!;
  let cls = roadClass(here);
  let traffic = trafficAt(w, here);
  let squeeze = squeezeOf(cls, traffic);
  let tight = squeeze >= 0.45;
  let setting = scene(cls, traffic);
  const refresh = (): void => {
    here = w.locations[h.locationId]!;
    cls = roadClass(here);
    traffic = trafficAt(w, here);
    squeeze = squeezeOf(cls, traffic);
    tight = squeeze >= 0.45;
    setting = scene(cls, traffic);
  };

  nested(c, 'chase_start', 'mixed', { cause: o.cause, mode: o.mode, car: last?.name ?? 'on foot', body: last?.body ?? 'foot', foes: o.foes.map((f) => f.name).join(', '), count: o.foes.length, place, wings: o.foes.some(wings), foot: o.foes.every((f) => f.foot) }, () => {
    for (let round = 1; round <= maxRounds && !result; round++) {
      rounds = round;
      const live = o.foes.filter((f) => f.alive);
      if (!live.length) {
        result = 'won';
        break;
      }
      // The chase goes on down the road. A runner will go where a car cannot, and if she follows on wheels she has to get out.
      if (!result) {
        const mine = mounted();
        const adj = streetsFrom(w, h.locationId);
        const alleys = adj.filter((id) => roadClass(w.locations[id]!) === 'alley');
        const carless = !!mine && mine.body !== 'bike'; // an alley is no road for a car
        const driveable = carless ? adj.filter((id) => !alleys.includes(id)) : adj;
        const leadNow = live[0];
        const runnerEscapes = o.mode === 'pursuer' && !!leadNow?.foot && carless && alleys.length > 0;
        const fleeing = o.mode === 'pursued' && !mine && o.foes.some((f) => f.alive && !!f.car && f.car.body !== 'bike') && alleys.length > 0;
        // (A runner ducks into an alley as soon as there is a car behind them; otherwise the chase only turns after the first round.)
        if (rng.chance(runnerEscapes ? 0.6 : fleeing ? 0.5 : round > 1 ? 0.4 : 0)) {
          const to = (runnerEscapes || fleeing) && rng.chance(0.75) ? rng.pick(alleys) : (driveable.length ? rng.pick(driveable) : adj.length ? rng.pick(adj) : null);
          if (to) {
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
          }
        }
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
      if (o.mode === 'pursuer') {
        scores.floor_it = 6;
        scores.shoot = armedBack && (band === 'near' || band === 'close') ? 4.5 : 0;
        scores.swerve = 0.5;
        // On foot, a car on the street is a much better way to catch a car. In a car, a runner in a crowded street is best caught on foot.
        if (foot && ride && faster) scores.grab = 7;
        if (car && lead.foot && squeeze >= 0.55 && band !== 'far') scores.dismount = 2 + 6 * squeeze;
      } else {
        scores.floor_it = 3 + (band === 'close' || band === 'locked' ? 3 : 0);
        scores.swerve = 1.5 + (band !== 'far' ? 2 : 0);
        scores.lose_them = tight && lead.gap >= 3 ? (foot ? 7.5 : 6.5) : 0;
        scores.shoot = armedBack && (band === 'near' || band === 'close') ? 4 : 0;
        if (foot && ride && faster) scores.grab = 8;
        if (car) {
          // A bike fits where a car does not: it can stay out of reach without ending the chase.
          if (bike) scores.lane_split = tight && band !== 'far' ? 5.5 : 0;
          // A bike against anything bigger gets the worst of a ram.
          scores.ram = (band === 'close' || band === 'locked') && lead.car ? (bike && lead.car.body !== 'bike' ? 0.2 : 3 + car.armor * 0.4) : 0;
          scores.bail = carRatio <= 0.25 || (hpRatio < 0.3 && carRatio < 0.5) || (bike && hpRatio < 0.4) ? 3 + 10 * (0.25 - Math.min(carRatio, 0.25)) : 0;
        }
      }
      if (car && carRatio <= 0.25) scores.bail = (scores.bail ?? 0) + 3 + h.competence * 4; // smoking: it is about to go
      const slack = (1 - h.competence) * 4;
      const action = Object.keys(scores).map((k) => ({ k, s: scores[k]! + rng.next() * (1 + slack) })).sort((a, b) => b.s - a.s)[0]!.k;
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
          dmgChaser(c, t, dmg, told);
          told.push(`shot:${t.name}`);
        } else told.push('miss');
        train(c, 'marksmanship', 1);
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
        if (car && h.vehicle) {
          if (rng.chance(hopChance(w, car, cls, pace, traffic) * 0.5)) {
            const crash = accident(c, car, here, cls, pace, true);
            told.push(`crash:${crash.kind}`);
            if (crash.over) {
              // Thrown, or the end of it: either way she may still be able to carry on, on foot.
              if (dead(c)) result = 'wrecked';
              else if (!fit(h)) result = !h.vehicle && car.hp > 0 ? 'bailed' : 'wrecked';
              else c.emit('chase_mount', 'mixed', { variant: car.hp > 0 ? 'thrown' : 'wrecked', car: car.name, body: car.body, place: here.name });
            }
          }
        } else if (foot && rng.chance(footChance(w, cls, pace, traffic) * 0.5)) {
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
      const caughtOnFoot = foot && o.mode === 'pursued' && live.some((f) => bandOf(f.gap) === 'locked') && rng.chance(0.7);
      if (!result && o.mode === 'pursued' && live.every((f) => f.gap >= ESCAPE_GAP)) result = 'escaped';
      else if (!result && o.mode === 'pursuer' && live.every((f) => f.gap >= ESCAPE_GAP)) result = 'lost';
      else if (!result && o.mode === 'pursuer' && live.some((f) => bandOf(f.gap) === 'locked') && action !== 'shoot') result = 'caught';
      else if (!result && (caughtOnFoot || (o.mode === 'pursued' && live.some((f) => bandOf(f.gap) === 'locked') && round >= maxRounds - 1 && rng.chance(0.5)))) result = 'caught';

      c.emit('chase_round', hurt > 0 ? 'bad' : action === 'floor_it' || action === 'lose_them' ? 'good' : 'mixed', {
        variant: action,
        scene: setting,
        road: cls,
        traffic: trafficWord(traffic),
        body: car?.body ?? 'foot',
        round,
        band: bandOf(nearest().gap),
        gap: Math.round(nearest().gap),
        car: car?.name ?? 'on foot',
        state: car ? stateOf(car) : 'sound',
        hurt,
        foe: o.foes.filter((f) => f.alive)[0]?.name ?? 'them',
        events: told.join(','),
      });
      const now = mounted();
      if (now && now.hp / now.maxHp <= 0.25 && round < maxRounds && !result) c.emit('car_hit', 'bad', { variant: 'smoking', car: now.name, body: now.body, mine: true });
    }
    if (!result) result = o.mode === 'pursuer' ? 'lost' : o.foes.some((f) => f.alive && f.gap < 3) ? 'caught' : 'escaped';
    finish(c, o, result, last, rounds);
  });
  // Anybody she knocked into on the way, who has had enough.
  if (!w.over && owed.length && result !== 'wrecked') {
    const crowd = owed.filter((n) => n.alive).slice(0, 2).map((n) => onFoot(n, 2));
    if (crowd.length && w.hero.hp > 0) {
      const after = runChase(c, { mode: 'pursued', cause: 'somebody she ran into', foes: crowd, maxRounds: 4 });
      if (after === 'caught' && !w.over) fight(c, crowd.flatMap((f) => f.crew).filter((n) => n.alive), { cause: 'somebody she ran into', joiners: false });
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

function dmgChaser(c: Ctx, t: Chaser, dmg: number, told: string[]): void {
  if (t.car) {
    const hit = hitCar(t.car, dmg, 'gun');
    if (hit.wrecked) wreckChaser(c, t, told);
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
function finish(c: Ctx, o: ChaseOpts, result: ChaseResult, car: Vehicle | null, rounds: number): void {
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
    const far = roadsFrom(w, loc, 4, car?.body ?? 'bike').filter((r) => r.hops >= 3);
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
