import { Rng } from './rng';
import { minuteOfDay } from './clock';
import { isShut } from './shutdown';
import { npcsAt } from './population';
import { carKey, makesOf, vehicleOf, type Body } from './cars';
import type { District, Id, Location, Npc, Vehicle, World } from './types';

/**
 * How a street takes a car. A highway is the easy road even at speed; a street is ordinary; a small street is harder; a pedestrian
 * way harder still; and an alley is no road for a car at all (a bike can still get down one).
 */
export type RoadClass = 'highway' | 'street' | 'small' | 'pedestrian' | 'alley';

const BY_SUFFIX: Record<string, RoadClass> = {
  alley: 'alley', passage: 'alley',
  walk: 'pedestrian', arcade: 'pedestrian', plaza: 'pedestrian', concourse: 'pedestrian', bazaar: 'pedestrian', market: 'pedestrian',
  lane: 'small', row: 'small', terrace: 'small', run: 'small', way: 'small', yard: 'small',
  street: 'street', avenue: 'street', boulevard: 'street', freightway: 'street', wharf: 'street',
};

/** What a street is, for driving: a highway if it is one, else by the last word of its name (the city names its streets for what they are). */
export function roadClass(loc: Pick<Location, 'name' | 'road' | 'gen'>): RoadClass {
  if (loc.road) return loc.road;
  const last = loc.name.split(/[\s,]+/).filter(Boolean).pop()?.toLowerCase() ?? '';
  return BY_SUFFIX[last] ?? (loc.gen ? 'street' : 'small');
}

/** Per class: how hard it is (0 easy to 1 hopeless), minutes a car takes to cross it flat out, how much of a drive's reach it uses up, how much going faster matters on it, and the odds of a mishap at an ordinary pace. */
export const ROAD: Record<RoadClass, { hard: number; minutes: number; effort: number; speedSens: number; base: number; trafficK: number }> = {
  highway: { hard: 0.1, minutes: 0.25, effort: 0.5, speedSens: 0.15, base: 0.006, trafficK: 5 },
  street: { hard: 0.35, minutes: 0.5, effort: 1, speedSens: 1, base: 0.024, trafficK: 1.5 },
  small: { hard: 0.6, minutes: 0.8, effort: 1, speedSens: 1.2, base: 0.065, trafficK: 1.2 },
  pedestrian: { hard: 0.85, minutes: 1.0, effort: 1.5, speedSens: 1.4, base: 0.16, trafficK: 1.5 },
  alley: { hard: 1, minutes: 0.8, effort: 1, speedSens: 1.5, base: 0.24, trafficK: 0.6 },
};

// =============================================================== how busy

/** How much of the day each district's streets are full, as bumps on the 24-hour clock: [hour, width in hours, height]. */
const RHYTHM: Record<District, { floor: number; scale: number; bumps: [number, number, number][] }> = {
  market: { floor: 0.25, scale: 1, bumps: [[13, 5, 0.75]] },
  nightlife: { floor: 0.15, scale: 1, bumps: [[0.5, 4, 0.85]] },
  tenement: { floor: 0.3, scale: 0.9, bumps: [[18.5, 3, 0.6], [7.5, 2, 0.45]] },
  industrial: { floor: 0.3, scale: 0.8, bumps: [[6, 2, 0.6], [18, 2, 0.6], [12, 5, 0.25]] },
  corporate: { floor: 0.15, scale: 1, bumps: [[8, 1.5, 0.85], [17.5, 1.5, 0.85], [13, 3, 0.25]] },
  slum: { floor: 0.2, scale: 0.6, bumps: [[22, 4, 0.4]] },
};

/** Hours between two times of day, round the clock. */
const gap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
};

/** What the road is like for traffic: a pedestrian way fills with people, an alley with almost nobody. */
const CLASS_TRAFFIC: Record<RoadClass, number> = { highway: 0.9, street: 1, small: 0.8, pedestrian: 1.1, alley: 0.5 };

/**
 * How busy a street is, 0 (empty) to 1 (packed), by its district and the time of day: nightlife fills up after dark, corporate streets at the
 * commute, markets by day. The kind of street scales it (a pedestrian way fills with people, an alley hardly at all), and so do the
 * weather and whether the street is a crowded one. Not rolled: the same street at the same time is as busy as it was.
 */
export function trafficAt(w: Pick<World, 'clock' | 'situation'>, loc: Pick<Location, 'name' | 'road' | 'gen' | 'crowded'>, clock = w.clock): number {
  const r = RHYTHM[loc.gen?.district ?? 'tenement'];
  const hour = minuteOfDay(clock) / 60;
  let t = r.floor;
  for (const [at, width, height] of r.bumps) t += height * Math.exp(-Math.pow(gap(hour, at) / width, 2));
  t *= r.scale * CLASS_TRAFFIC[roadClass(loc)];
  if (loc.crowded) t += 0.1;
  if (w.situation.weather === 'acid_rain') t *= 0.8;
  return clamp01(t);
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** How a level of traffic reads. */
export const trafficWord = (t: number): 'empty' | 'quiet' | 'busy' | 'packed' => (t < 0.2 ? 'empty' : t < 0.4 ? 'quiet' : t < 0.65 ? 'busy' : 'packed');

const CLASS_WORD: Record<RoadClass, string> = { highway: 'highway', street: 'street', small: 'little street', pedestrian: 'pedestrian way', alley: 'alley' };

/** "an empty pedestrian way", "a packed highway": what she is driving down, for the telling. */
export function scene(cls: RoadClass, t: number): string {
  const word = trafficWord(t);
  return `${word === 'empty' ? 'an' : 'a'} ${word} ${CLASS_WORD[cls]}`;
}

/** How much a street squeezes her: the narrowness of the road and how much is on it. 0 is all the room in the world; 1 is none. */
export const squeezeOf = (cls: RoadClass, t: number): number => clamp01(0.5 * ROAD[cls].hard + 0.7 * t);

export const isHighway = (loc: Pick<Location, 'road'> | undefined): boolean => loc?.road === 'highway';

const isPerson = (tags: string[], archetype: string): boolean => !tags.includes('robot') && !tags.includes('dragon') && !tags.includes('boss') && archetype !== 'puppy';
export { isPerson };

const PARKED_CHANCE = 0.45;
/** How likely a parked vehicle is a bike, by district. */
const BIKES: Partial<Record<District, number>> = { tenement: 0.35, slum: 0.35, market: 0.25, nightlife: 0.25, industrial: 0.2, corporate: 0.1 };

/** The car waiting on this street, if any: a stray left by a chase, else one the street grew. A pure function of the run and the place, minus ones already taken. */
export function parkedVehicle(w: World, loc: Location): Vehicle | null {
  if (loc.kind !== 'street') return null;
  const stray = w.strays?.[loc.id];
  if (!stray && isHighway(loc)) return null; // nobody parks on a highway
  if (stray) return stray;
  if (w.flags[`stolen:${loc.id}`]) return null;
  const rng = new Rng(`car:${w.seed}:${loc.id}`);
  const cop = npcsAt(w, loc.id).some((n) => n.tags.includes('cop'));
  if (!cop && !rng.chance(PARKED_CHANCE)) return null;
  const district = loc.gen?.district;
  const kind: Vehicle['kind'] = cop ? 'police' : rng.chance(district === 'corporate' ? 0.4 : 0.07) ? 'atlas' : rng.chance(0.1) ? 'police' : 'civilian';
  // Bikes are commoner where the streets are narrow and poor. (Its own stream, so the cars keep the luck they always had.)
  const bikeP = (district && BIKES[district]) ?? 0.25;
  const body: Body = new Rng(`bike:${w.seed}:${loc.id}`).chance(cop ? 0.1 : bikeP) ? 'bike' : 'car';
  return vehicleOf(rng.pick(makesOf(kind, body)), `car:${w.seed}:${loc.id}:${kind}${body === 'bike' ? ':bike' : ''}`);
}

/** Somebody who would be driving this kind of car: the officers with the squad car, the guards with the Atlas one, any bystander with a civilian one. */
function driverOf(car: Vehicle, folk: Npc[]): Npc | undefined {
  const people = folk.filter((n) => n.alive && !n.tags.some((t) => ['robot', 'dragon', 'boss'].includes(t)) && n.archetype !== 'puppy');
  const pool = car.kind === 'police' ? people.filter((n) => n.tags.includes('cop')) : car.kind === 'atlas' ? people.filter((n) => n.faction === 'atlas' || n.tags.includes('security') || n.tags.includes('corp')) : people.filter((n) => !n.tags.includes('cop') && !n.tags.includes('security'));
  return pool.length ? new Rng(`driver:${car.id}`).pick(pool) : undefined;
}

/**
 * A car that has people with it has a key, and the driver has it: whoever is in it, or else somebody connected to it, picked by
 * chance. It goes among their loot, so it comes off them however she deals with them. Once per car.
 */
export function assignKeys(w: World, loc: Location): void {
  const car = parkedVehicle(w, loc);
  if (!car || w.flags[`keyed:${car.id}`]) return;
  const driver = driverOf(car, npcsAt(w, loc.id));
  if (!driver) return;
  w.flags[`keyed:${car.id}`] = true;
  driver.loadout.push(carKey(car, driver.tags.includes('ganger')));
}

/** Streets she can get to from here by road: only street to street, nothing locked, shut or in the way. Fewest hops first. */
export function roadsFrom(w: World, from: Id, reach: number, body: Body = 'car'): { id: Id; hops: number; path: Id[] }[] {
  const seen = new Map<Id, Id[]>([[from, []]]);
  const out: { id: Id; hops: number; path: Id[] }[] = [];
  let ring: Id[] = [from];
  for (let hop = 1; hop <= reach; hop++) {
    const next: Id[] = [];
    for (const id of ring) {
      for (const e of w.locations[id]?.exits ?? []) {
        const dest = w.locations[e.to];
        // A bike goes through the narrow ways a car can't: a tunnel is a road to it, though it never stops in one.
        const narrow = body === 'bike' && dest?.kind === 'tunnel';
        if (!dest || e.hidden || e.gate || seen.has(e.to) || (dest.kind !== 'street' && !narrow) || isShut(w, e.to)) continue;
        if (!narrow && body !== 'bike' && roadClass(dest) === 'alley') continue; // no road for a car at all
        const path = [...seen.get(id)!, e.to];
        seen.set(e.to, path);
        next.push(e.to);
        if (!narrow) out.push({ id: e.to, hops: hop, path });
      }
    }
    ring = next;
  }
  return out;
}

/** World minutes a drive of this many streets takes, past the beat it starts in. Walking costs a whole beat per street. */
export const driveMinutes = (hops: number, body: Body = 'car'): number => Math.ceil(hops / (body === 'bike' ? 6 : 4));
