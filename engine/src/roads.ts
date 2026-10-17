import { Rng } from './rng';
import { isShut } from './shutdown';
import { npcsAt } from './population';
import { MAKES, carKey, vehicleOf } from './cars';
import type { Id, Location, Npc, Vehicle, World } from './types';

const isPerson = (tags: string[], archetype: string): boolean => !tags.includes('robot') && !tags.includes('dragon') && !tags.includes('boss') && archetype !== 'puppy';
export { isPerson };

const PARKED_CHANCE = 0.45;

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
  return vehicleOf(rng.pick(MAKES[kind]), `car:${w.seed}:${loc.id}:${kind}`);
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
export function roadsFrom(w: World, from: Id, reach: number): { id: Id; hops: number; path: Id[] }[] {
  const seen = new Map<Id, Id[]>([[from, []]]);
  const out: { id: Id; hops: number; path: Id[] }[] = [];
  let ring: Id[] = [from];
  for (let hop = 1; hop <= reach; hop++) {
    const next: Id[] = [];
    for (const id of ring) {
      for (const e of w.locations[id]?.exits ?? []) {
        const dest = w.locations[e.to];
        if (!dest || e.hidden || e.gate || seen.has(e.to) || dest.kind !== 'street' || isShut(w, e.to)) continue;
        const path = [...seen.get(id)!, e.to];
        seen.set(e.to, path);
        next.push(e.to);
        out.push({ id: e.to, hops: hop, path });
      }
    }
    ring = next;
  }
  return out;
}

/** World minutes a drive of this many streets takes, past the beat it starts in. Walking costs a whole beat per street. */
export const driveMinutes = (hops: number): number => Math.ceil(hops / 4);
