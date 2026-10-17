import { Rng } from './rng';
import { isShut } from './shutdown';
import { npcsAt } from './population';
import { MAKES, type Make } from './cars';
import type { Id, Location, Vehicle, World } from './types';

const isPerson = (tags: string[], archetype: string): boolean => !tags.includes('robot') && !tags.includes('dragon') && !tags.includes('boss') && archetype !== 'puppy';
export { isPerson };

const PARKED_CHANCE = 0.45;

/** The car waiting on this street, if any. A pure function of the run and the place, minus ones already taken. */
export function parkedVehicle(w: World, loc: Location): Make | null {
  if (loc.kind !== 'street' || w.flags[`stolen:${loc.id}`]) return null;
  const rng = new Rng(`car:${w.seed}:${loc.id}`);
  const cop = npcsAt(w, loc.id).some((n) => n.tags.includes('cop'));
  if (!cop && !rng.chance(PARKED_CHANCE)) return null;
  const district = loc.gen?.district;
  const kind: Vehicle['kind'] = cop ? 'police' : rng.chance(district === 'corporate' ? 0.4 : 0.07) ? 'atlas' : rng.chance(0.1) ? 'police' : 'civilian';
  return rng.pick(MAKES[kind]);
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
