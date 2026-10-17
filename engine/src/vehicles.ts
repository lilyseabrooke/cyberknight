import { Rng } from './rng';
import { addHeat, npcsAt, relocate, remember } from './combat';
import { sneakBonus } from './extras';
import { clamp, type Candidate } from './candidate';
import { isShut } from './shutdown';
import { skillValue, synergy, train } from './skills';
import { workingCameras } from './witness';
import type { Ctx, Id, Location, ParkedVehicle, Vehicle, World } from './types';

/**
 * Cars. Simple on purpose: a street may have one parked on it, she can steal it (hijacking), and while she is in it the
 * streets are short (driving). It stays with her from street to street and is left at the kerb when she walks into a
 * building. Where the city has been opened up (CINDERJAW dead, the cordon down), that is what makes the other districts
 * a few minutes away instead of an evening's walk.
 *
 * What she takes decides who is angry: anyone who sees it, or a camera, is the police's business; an NPD car is the
 * police's business whoever saw; an Atlas car is Atlas's.
 */

type Make = Pick<Vehicle, 'kind' | 'name' | 'speed'>;

const CARS: Record<Vehicle['kind'], { names: string[]; speed: number }> = {
  civilian: {
    names: ['a dented hatchback with a cracked neon underglow', 'a rust-colored delivery van', 'a hover-sedan that smells of pine and regret', 'a three-wheeled noodle cart with an engine', 'a salvaged taxi with the meter still running', 'a sun-faded coupe with a dragon sticker on the bumper'],
    speed: 1,
  },
  police: {
    names: ['an NPD patrol cruiser, lights dark', 'an NPD interceptor with the engine ticking', 'an unmarked NPD sedan that fools nobody'],
    speed: 1.5,
  },
  atlas: {
    names: ['an Atlas security SUV, white and humming', 'an Atlas executive hover-limo with the seat still warm', 'an Atlas fleet van, barcode on every panel'],
    speed: 1.3,
  },
};

const PARKED_CHANCE = 0.45;

const isPerson = (tags: string[], archetype: string): boolean => !tags.includes('robot') && !tags.includes('dragon') && !tags.includes('boss') && archetype !== 'puppy';

/** The car waiting on this street, if any. A pure function of the run and the place, minus ones already taken. */
export function parkedVehicle(w: World, loc: Location): Make | null {
  if (loc.kind !== 'street' || w.flags[`stolen:${loc.id}`]) return null;
  const rng = new Rng(`car:${w.seed}:${loc.id}`);
  const cop = npcsAt(w, loc.id).some((n) => n.tags.includes('cop'));
  if (!cop && !rng.chance(PARKED_CHANCE)) return null;
  const district = loc.gen?.district;
  const kind: Vehicle['kind'] = cop ? 'police' : rng.chance(district === 'corporate' ? 0.4 : 0.07) ? 'atlas' : rng.chance(0.1) ? 'police' : 'civilian';
  return { kind, name: rng.pick(CARS[kind].names), speed: CARS[kind].speed };
}

/** A car of hers that is parked on this street and hasn't been taken away yet. */
export const ownedHere = (w: World, loc: Location): ParkedVehicle | undefined => w.hero.parked?.find((p) => p.at === loc.id && p.until > w.clock);

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

/** How many streets one drive covers. Skill and the car both stretch it. */
export const reachOf = (w: World, v: Vehicle): number => clamp(Math.round((3 + skillValue(w.hero, 'driving') / 2) * v.speed), 3, 10);

/** World minutes a drive of this many streets takes, past the beat it starts in. Walking costs a whole beat per street. */
export const driveMinutes = (hops: number): number => Math.ceil(hops / 4);

export function vehicleCandidates(w: World): Candidate[] {
  const h = w.hero;
  const loc = w.locations[h.locationId];
  if (!loc || loc.kind !== 'street') return [];
  const out: Candidate[] = [];

  if (!h.vehicle) {
    // One of hers is parked here: no need to steal it again.
    const mine = ownedHere(w, loc);
    if (mine) {
      out.push({
        key: `getin:${loc.id}`, drives: { curiosity: 0.4, greed: 0.2 }, bonus: 0.9,
        run: (c) => {
          const { w } = c;
          w.hero.vehicle = { kind: mine.kind, name: mine.name, speed: mine.speed };
          w.hero.parked = w.hero.parked!.filter((p) => p !== mine);
          c.emit('vehicle', 'good', { variant: 'back', car: mine.name, place: loc.name });
        },
      });
      return out;
    }
    const car = parkedVehicle(w, loc);
    if (car) {
      out.push({
        key: `hijack:${loc.id}`, drives: { greed: 0.45, curiosity: 0.5, bravery: 0.25 }, bonus: 0.15,
        risk: 0.4 + (car.kind === 'civilian' ? 0 : 0.8),
        run: (c) => hijack(c, loc, car),
      });
    }
    return out;
  }

  const car = h.vehicle;
  const here = loc.gen?.district;
  for (const r of roadsFrom(w, loc.id, reachOf(w, car))) {
    if (r.hops < 2) continue; // one street is just a walk
    const dest = w.locations[r.id]!;
    const crossing = !!dest.gen?.district && dest.gen.district !== here;
    out.push({
      key: `drive:${r.id}`, drives: { curiosity: 0.5, bravery: 0.1 },
      bonus: 0.4 + (dest.visits === 0 ? 0.35 : 0) + (crossing ? 0.4 : 0) + 0.1 * r.hops,
      run: (c) => drive(c, r.path),
    });
  }
  return out;
}

// =============================================================== resolvers

function hijack(c: Ctx, loc: Location, car: Make): void {
  const { w, rng } = c;
  const h = w.hero;
  const hard = car.kind === 'civilian' ? 0 : 0.1;
  const p = clamp(0.3 + h.reflex * 0.015 + 0.05 * synergy(h, ['hijack', ['stat:reflex', 0.5], ['lockpicking', 0.3]]) - hard - h.drunk * 0.03, 0.08, 0.9);
  train(c, 'hijack', 2);
  const ok = rng.chance(p);

  // Who sees: people on the street, cameras, drones. A failed attempt sets off the alarm, so everyone does.
  const bystanders = npcsAt(w, loc.id).filter((n) => !n.hostile && !h.companions.some((a) => a.npcId === n.id));
  const noticeP = clamp(0.7 - sneakBonus(w), 0.2, 0.95);
  const people = bystanders.filter((n) => isPerson(n.tags, n.archetype) && (!ok || rng.chance(noticeP)));
  const cams = workingCameras(w, loc.id) > 0 || bystanders.some((n) => n.tags.includes('robot') && !n.tags.includes('dragon'));
  const seen = !ok || people.length > 0 || cams;
  for (const n of people) {
    n.affinity -= 4;
    remember(n, 'saw Blackbird jack a car');
  }

  if (ok) {
    w.flags[`stolen:${loc.id}`] = true;
    h.vehicle = { kind: car.kind, name: car.name, speed: car.speed };
    train(c, 'driving', 1);
  }
  c.emit('hijack', ok ? (seen ? 'mixed' : 'good') : 'bad', { variant: ok ? 'ok' : 'fail', car: car.name, kind: car.kind, seen, witnesses: people.length, place: loc.name });

  // Whose business it is. The police's own car is theirs whoever saw; Atlas's is Atlas's. Anyone's car is the police's if she was seen.
  const heat: [string, number][] = [];
  if (car.kind === 'police') heat.push(['npd', seen ? 3 : 2]);
  else if (car.kind === 'atlas') heat.push(['atlas', seen ? 3 : 2], ...(seen ? [['npd', 1] as [string, number]] : []));
  else if (seen) heat.push(['npd', people.length >= 3 ? 2 : 1]);
  for (const [faction, gain] of heat) {
    addHeat(w, faction, gain);
    c.emit('heat_up', 'bad', { variant: faction, gain, level: w.heat[faction] ?? 0, source: 'hijack', calls: 0 });
  }
}

function drive(c: Ctx, path: Id[]): void {
  const { w } = c;
  const h = w.hero;
  const from = w.locations[h.locationId]!;
  const car = h.vehicle!;
  // Each street she passes through is arrived at properly, so the city grows ahead of her and the road keeps going.
  for (const id of path) relocate(w, id);
  const last = w.locations[h.locationId]!;
  c.emit('drive', 'good', {
    variant: from.gen?.district && last.gen?.district && from.gen.district !== last.gen.district ? 'across' : 'along',
    car: car.name,
    from: from.name,
    to: last.name,
    toId: last.id,
    hops: path.length,
    first: last.visits === 1,
    ...(last.visits === 1 && last.blurb ? { blurb: last.blurb } : {}),
  });
  train(c, 'driving', 1);
  w.clock += driveMinutes(path.length);
}
