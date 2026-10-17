import type { Ctx, Id, Location, Vehicle, World } from './types';
import { condition, hitCar, paceOf } from './cars';
import { addHeat, maybeInjure, npcsAt, relocate } from './combat';
import { clamp } from './candidate';
import { dead, policeChase, wreckHeroCar } from './chase';
import { heatUrge } from './laylow';
import { ROAD, roadClass, type RoadClass } from './roads';
import { isShut } from './shutdown';
import { skillValue, train } from './skills';

/**
 * How hard it is to get a car down a street, how fast she chooses to go, and what happens when it goes wrong. See
 * docs/VEHICLE_COMBAT.md ("Routing").
 *
 * A street's class says how hard it is (roads.ts `ROAD`): a highway is easy at any speed, a street is ordinary, a small street is
 * harder, a pedestrian way harder still, and an alley is no road for a car at all (a bike gets down it). Every street she drives
 * through is a chance of an accident: more on harder streets, much more as she nears the car's top speed, less with practice,
 * and less on a bike, especially at speed and on the narrow ways.
 */

/** The ordinary pace: about 55 to 65 percent of the top speed. */
export const DEFAULT_SPEED = 0.58;

/** The odds of an accident on one street. `s` is how much of the car's top speed she is using, 0 to 1. */
export function hopChance(w: World, car: Pick<Vehicle, 'body' | 'hp' | 'maxHp'>, cls: RoadClass, s: number): number {
  const r = ROAD[cls];
  const bike = car.body === 'bike';
  // Going faster matters a great deal, and nearly nothing on a highway. A bike is less sensitive to it, and to hard streets.
  const speed = 0.3 + r.speedSens * (bike ? 1.5 : 3) * Math.pow(s, 4);
  let p = r.base * (bike ? 0.6 : 1) * speed;
  if (bike && r.hard >= 0.6) p *= 0.75;
  const h = w.hero;
  p /= 1 + 0.12 * skillValue(h, 'driving'); // practice
  p *= 1 + 0.25 * h.drunk;
  p *= 1 + 0.6 * (1 - condition(car)); // a car in a bad way is a bad car
  if (w.situation.weather === 'acid_rain') p *= 1.25;
  return clamp(p, 0, 0.95);
}

/** The odds of at least one accident down the whole of a route. */
export function routeChance(w: World, car: Vehicle, path: Id[], s: number): number {
  let ok = 1;
  for (const id of path) ok *= 1 - hopChance(w, car, roadClass(w.locations[id]!), s);
  return 1 - ok;
}

/** World minutes a drive takes at this share of top speed. A faster car, or a higher share, gets through each street sooner. */
export function routeMinutes(w: World, car: Vehicle, path: Id[], s: number): number {
  const rate = Math.max(0.3, s) * (paceOf(car) / 10);
  let m = 0;
  for (const id of path) m += ROAD[roadClass(w.locations[id]!)].minutes / rate;
  return Math.max(1, Math.ceil(m));
}

// =============================================================== which way

export interface Route {
  path: Id[];
  /** How much of the drive's reach it takes up: a highway is cheap, a pedestrian way dear. */
  effort: number;
}

export interface Routes {
  id: Id;
  hops: number;
  /** The quickest way there, and the one with the fewest chances for things to go wrong (often the same road). */
  fast: Route;
  safe: Route;
}

/**
 * Where she can get to by road, and by which way. Cars stay off alleys; bikes take them, and the tunnels too (without stopping in
 * one). Two Dijkstra runs: one on time, one on how hard each street is.
 */
export function routesFrom(w: World, from: Id, reach: number, body: Vehicle['body'] = 'car'): Routes[] {
  const run = (cost: (cls: RoadClass) => number): Map<Id, Route> => {
    const best = new Map<Id, { w: number; effort: number; path: Id[] }>([[from, { w: 0, effort: 0, path: [] }]]);
    const done = new Set<Id>();
    for (;;) {
      let cur: Id | null = null;
      for (const [id, v] of best) if (!done.has(id) && (cur === null || v.w < best.get(cur)!.w)) cur = id;
      if (cur === null) break;
      done.add(cur);
      const here = best.get(cur)!;
      for (const e of w.locations[cur]?.exits ?? []) {
        const dest = w.locations[e.to];
        if (!dest || e.hidden || e.gate || done.has(e.to) || isShut(w, e.to)) continue;
        const narrow = body === 'bike' && dest.kind === 'tunnel';
        if (dest.kind !== 'street' && !narrow) continue;
        const cls: RoadClass = narrow ? 'small' : roadClass(dest);
        if (cls === 'alley' && body !== 'bike') continue; // no road for a car at all
        const effort = here.effort + ROAD[cls].effort;
        if (effort > reach) continue;
        const wt = here.w + cost(cls);
        const known = best.get(e.to);
        if (!known || wt < known.w) best.set(e.to, { w: wt, effort, path: [...here.path, e.to] });
      }
    }
    const out = new Map<Id, Route>();
    for (const [id, v] of best) if (id !== from && w.locations[id]?.kind === 'street' && v.path.length >= 1) out.set(id, { path: v.path, effort: v.effort });
    return out;
  };
  const fast = run((c) => ROAD[c].minutes);
  const safe = run((c) => 0.2 * ROAD[c].minutes + 2 * Math.pow(ROAD[c].hard, 1.5) * (body === 'bike' ? 0.6 : 1) + 0.05);
  const out: Routes[] = [];
  for (const [id, f] of fast) {
    const s = safe.get(id) ?? f;
    out.push({ id, hops: f.path.length, fast: f, safe: s });
  }
  return out;
}

// =============================================================== how fast

/** How much she wants to be somewhere else: the law after her, a body that needs mending. 0 to 1. */
export function rushOf(w: World): number {
  const h = w.hero;
  return clamp(0.9 * heatUrge(w) + (h.hp / h.maxHp < 0.4 ? 0.3 : 0) + (w.flight ? 0.15 : 0), 0, 1);
}

/** How much of a risk she is willing to take: -1 for a careful one, +1 for a daredevil. */
export function daringOf(w: World): number {
  const t = w.hero.personality.traits;
  return clamp(1.4 * (t.reckless - 0.5) + 0.8 * (t.thrill - 0.5) + 0.4 * (t.impulsive - 0.5) - 0.4 * (w.hero.competence - 0.5), -1, 1);
}

/**
 * What share of top speed she goes at. About 55 to 65 percent when nothing is pressing; more when she is in a hurry or the sort
 * to enjoy it, less down streets that are hard, and more on a highway, where there is nothing to hit.
 */
export function chooseSpeed(w: World, path: Id[]): number {
  const h = w.hero;
  const classes = path.map((id) => roadClass(w.locations[id]!));
  const hard = classes.reduce((a, c) => a + ROAD[c].hard, 0) / Math.max(1, classes.length);
  const open = classes.filter((c) => c === 'highway').length / Math.max(1, classes.length);
  const s = DEFAULT_SPEED + 0.28 * rushOf(w) + 0.14 * daringOf(w) + 0.1 * open - 0.14 * hard * (0.5 + h.competence) + 0.03 * Math.min(1, skillValue(h, 'driving') / 10);
  return clamp(s, 0.4, 1);
}

// =============================================================== when it goes wrong

type Accident = 'scrape' | 'collision' | 'chase' | 'thrown' | 'wreck';

/** Who might have seen: people on the street, a camera, an officer. */
function seenOn(w: World, loc: Location): boolean {
  return loc.crowded || loc.cameras > 0 || npcsAt(w, loc.id).some((n) => n.tags.includes('cop'));
}

/**
 * Something goes wrong on this street. A scrape, a proper crash, somebody calling it in and the police on her tail, being thrown
 * from the car or off the bike, or the end of it. The faster she was going the worse it is. Returns whether the drive is over.
 */
function accident(c: Ctx, car: Vehicle, loc: Location, cls: RoadClass, s: number): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const bike = car.body === 'bike';
  const seen = seenOn(w, loc);
  const hard = ROAD[cls].hard;
  const weights: [Accident, number][] = [
    ['scrape', 55 * (1 - 0.6 * s)],
    ['collision', 28 + 10 * hard],
    ['chase', seen ? 10 + (loc.crowded ? 8 : 0) : 1],
    ['thrown', (3 + 16 * s * s) * (bike ? 2.5 : 1)],
    ['wreck', (0.4 + 10 * Math.pow(s, 3)) * (bike ? 0.6 : 1) * (cls === 'highway' ? 1.5 : 1)],
  ];
  const kind = rng.weighted(weights, (x) => x[1])[0];
  const data = { car: car.name, body: car.body, road: cls, place: loc.name, speed: Math.round(s * 100) };
  train(c, 'driving', 1); // you learn from it, hard

  if (kind === 'wreck') {
    car.hp = 0;
  } else if (kind === 'scrape') {
    hitCar(car, car.maxHp * (0.08 + 0.12 * s), 'ram');
    c.emit('accident', 'mixed', { variant: 'scrape', ...data });
  } else if (kind === 'collision') {
    const dmg = car.maxHp * (0.2 + 0.25 * s);
    hitCar(car, dmg, 'ram');
    h.hp -= Math.round(dmg * (bike ? 0.4 : 0.1));
    c.emit('accident', 'bad', { variant: 'collision', ...data });
    if (seen) heat(c, 'npd', s > 0.8 ? 2 : 1);
  } else if (kind === 'thrown') {
    const fall = Math.round(paceOf(car) * s * 0.9);
    hitCar(car, car.maxHp * 0.25, 'ram');
    h.hp -= fall;
    maybeInjure(c, fall, 0.6);
    c.emit('accident', 'bad', { variant: 'thrown', fall, ...data });
    if (car.hp > 0) {
      // Left where it fell, hers to come back for.
      delete h.vehicle;
      if (!w.strays?.[loc.id]) (w.strays ??= {})[loc.id] = { ...car, riders: [] };
      return true;
    }
  } else if (kind === 'chase') {
    hitCar(car, car.maxHp * (0.1 + 0.1 * s), 'ram');
    c.emit('accident', 'bad', { variant: 'chase', ...data });
    heat(c, 'npd', 2);
    if (car.hp > 0 && !dead(c)) {
      policeChase(c, 'crash');
      return true;
    }
  }
  // Whatever it was, a car with nothing left is the end of it.
  if (car.hp <= 0) {
    c.emit('accident', 'bad', { variant: 'wreck', ...data });
    const taken = wreckHeroCar(c, car);
    if (dead(c)) c.emit('death', 'bad', { killer: 'a burning car', place: loc.name, cause: 'a crash', level: h.level, taken });
    return true;
  }
  return dead(c);
}

function heat(c: Ctx, faction: string, gain: number): void {
  addHeat(c.w, faction, gain);
  c.emit('heat_up', 'bad', { variant: faction, gain, level: c.w.heat[faction] ?? 0, source: 'crash', calls: 0 });
}

/**
 * Drive the route, a street at a time, at this share of top speed. Each street she enters might be where it goes wrong. Returns how
 * many streets she got through before it did (all of them, if it didn't).
 */
export function driveAlong(c: Ctx, path: Id[], s: number): { done: number; over: boolean } {
  const { w, rng } = c;
  const h = w.hero;
  const car = h.vehicle!;
  let done = 0;
  for (const id of path) {
    // (A bike goes through a tunnel without leaving itself behind in it.)
    const through = car.body === 'bike' && w.locations[id]?.kind === 'tunnel';
    relocate(w, id);
    if (through && !h.vehicle) {
      h.parked = (h.parked ?? []).filter((p) => p.id !== car.id);
      h.vehicle = car;
    }
    done++;
    const loc = w.locations[id]!;
    if (loc.kind !== 'street') continue;
    if (rng.chance(hopChance(w, car, roadClass(loc), s)) && accident(c, car, loc, roadClass(loc), s)) return { done, over: true };
  }
  return { done, over: false };
}
