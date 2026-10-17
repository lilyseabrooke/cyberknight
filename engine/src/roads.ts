import { Rng } from './rng';
import { isShut } from './shutdown';
import { npcsAt } from './population';
import { carKey, makesOf, vehicleOf, type Body } from './cars';
import type { District, Id, Location, Npc, Vehicle, World } from './types';

const isPerson = (tags: string[], archetype: string): boolean => !tags.includes('robot') && !tags.includes('dragon') && !tags.includes('boss') && archetype !== 'puppy';
export { isPerson };

const PARKED_CHANCE = 0.45;
/** How likely a parked vehicle is a bike, by district. */
const BIKES: Partial<Record<District, number>> = { tenement: 0.35, slum: 0.35, market: 0.25, nightlife: 0.25, industrial: 0.2, corporate: 0.1 };

/** The car waiting on this street, if any: a stray left by a chase, else one the street grew. A pure function of the run and the place, minus ones already taken. */
export function parkedVehicle(w: World, loc: Location): Vehicle | null {
  if (loc.kind !== 'street') return null;
  const stray = w.strays?.[loc.id];
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
