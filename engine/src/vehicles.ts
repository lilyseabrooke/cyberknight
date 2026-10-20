import { Rng } from './rng';
import { addHeat, npcsAt, relocate, remember } from './combat';
import { sneakBonus } from './extras';
import { clamp, type Candidate } from './candidate';
import { roadsFrom, driveMinutes, parkedVehicle, isPerson, roadClass } from './roads';
import { chooseSpeed, daringOf, driveAlong, routeChance, routeMinutes, routesFrom, rushOf } from './drivefx';
import { bankPull } from './bank';
import { needsUrge } from './rest';
import { supplyUrge } from './supply';
import { condition, keyTo, normalize } from './cars';
import { KINDS, assistOf, removeCompanion } from './companions';
import { policeChase } from './chase';
import { skillValue, synergy, train, skillRoot } from './skills';
import { workingCameras } from './witness';
import type { Companion, Ctx, Id, Location, ParkedVehicle, Vehicle, World } from './types';

/**
 * Cars. Simple on purpose: a street may have one parked on it, she can steal it (hijacking), and while she is in it the
 * streets are short (driving). It stays with her from street to street and is left at the kerb when she walks into a
 * building. Where the city has been opened up (CINDERJAW dead, the cordon down), that is what makes the other districts
 * a few minutes away instead of an evening's walk.
 *
 * What she takes decides who is angry: anyone who sees it, or a camera, is the police's business; an NPD car is the
 * police's business whoever saw; an Atlas car is Atlas's.
 */

/** A car of hers that is parked on this street and hasn't been taken away yet. */
export const ownedHere = (w: World, loc: Location): ParkedVehicle | undefined => w.hero.parked?.find((p) => p.at === loc.id && p.until > w.clock);

/** How many streets one drive covers. Skill and the car both stretch it. */
export const reachOf = (w: World, v: Vehicle): number => clamp(Math.round((3 + skillRoot(w.hero, 'driving') / 2) * v.speed * (0.6 + 0.4 * condition(v))), 3, 12);

export { roadsFrom, driveMinutes, parkedVehicle };

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
          const { at: _at, until: _until, ...car } = mine;
          w.hero.vehicle = normalize({ ...car, riders: [] });
          w.hero.parked = w.hero.parked!.filter((p) => p !== mine);
          c.emit('vehicle', 'good', { variant: 'back', car: mine.name, body: mine.body ?? 'car', place: loc.name });
          boardParty(c, w.hero.vehicle, loc);
        },
      });
      return out;
    }
    const car = parkedVehicle(w, loc);
    // With its key she just gets in: no lock to beat, nobody to see her do it.
    if (car && keyTo(h, car.id)) {
      out.push({
        key: `usekey:${loc.id}`, drives: { curiosity: 0.4, greed: 0.3 }, bonus: 1.0,
        run: (c) => {
          takeCar(c.w, loc, car);
          c.emit('vehicle', 'good', { variant: 'keyed', car: car.name, kind: car.kind, body: car.body, place: loc.name });
          train(c, 'driving', 1);
          boardParty(c, c.w.hero.vehicle!, loc);
        },
      });
      return out;
    }
    if (car) {
      out.push({
        key: `hijack:${loc.id}`, drives: { greed: 0.45, curiosity: 0.5, bravery: 0.25 }, bonus: 0.15,
        risk: 0.4 + (car.kind === 'civilian' ? 0 : 0.8),
        run: (c) => hijack(c, loc, car),
      });
    }
    return out;
  }

  const car = normalize(h.vehicle);
  const here = loc.gen?.district;
  const rush = rushOf(w);
  for (const r of routesFrom(w, loc.id, reachOf(w, car), car.body)) {
    if (r.hops < 2) continue; // one street is just a walk
    const dest = w.locations[r.id]!;
    const crossing = !!dest.gen?.district && dest.gen.district !== here;
    // Where she wants to be: somewhere new, somewhere else, and wherever she needs something.
    const supply = supplyUrge(w, r.id);
    const need = needsUrge(w, r.id);
    const pull = bankPull(w, r.id);
    // Two ways there (the quick one and the careful one, often the same road), weighed on what each costs her and risks.
    for (const style of ['fast', 'safe'] as const) {
      const route = r[style];
      if (style === 'safe' && route.path.join() === r.fast.path.join()) continue;
      const s = chooseSpeed(w, route.path);
      const chance = routeChance(w, car, route.path, s);
      const minutes = routeMinutes(w, car, route.path, s);
      // What being quick is worth to her, against walking it, when she is in a hurry.
      const saved = Math.max(0, 3 * route.path.length - minutes);
      out.push({
        key: `drive:${r.id}:${style}`, drives: { curiosity: 0.5, bravery: 0.1 },
        bonus: 0.4 + (dest.visits === 0 ? 0.35 : 0) + (crossing ? 0.4 : 0) + 0.1 * r.hops + 0.05 * saved * rush + 0.25 * Math.max(0, daringOf(w)) * s + supply.bonus + need.bonus + pull.bonus,
        smart: supply.smart + need.smart + pull.smart,
        risk: chance * 8,
        run: (c) => drive(c, route.path, s, style),
      });
    }
  }
  return out;
}

// =============================================================== resolvers

/** The car is hers now: gone from the street, in her hands. */
export function takeCar(w: World, loc: Location, car: Vehicle): void {
  w.flags[`stolen:${loc.id}`] = true;
  if (w.strays?.[loc.id]) delete w.strays[loc.id];
  w.hero.vehicle = normalize({ ...car, riders: [] });
}

export function hijack(c: Ctx, loc: Location, car: Vehicle, inChase = false): void {
  const { w, rng } = c;
  const h = w.hero;
  const hard = (car.kind === 'civilian' ? 0 : 0.1) - (car.body === 'bike' ? 0.1 : 0); // no door to beat on a bike
  const p = clamp(0.322 + h.reflex * 0.015 + 0.05 * synergy(h, ['hijack', ['stat:reflex', 0.5], ['lockpicking', 0.3]]) - hard - h.drunk * 0.03, 0.08, 0.9);
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
    takeCar(w, loc, car);
    train(c, 'driving', 1);
  }
  c.emit('hijack', ok ? (seen ? 'mixed' : 'good') : 'bad', { variant: ok ? 'ok' : 'fail', car: car.name, kind: car.kind, body: car.body, seen, witnesses: people.length, place: loc.name });

  // Whose business it is. The police's own car is theirs whoever saw; Atlas's is Atlas's. Anyone's car is the police's if she was seen.
  const heat: [string, number][] = [];
  if (car.kind === 'police') heat.push(['npd', seen ? 3 : 2]);
  else if (car.kind === 'atlas') heat.push(['atlas', seen ? 3 : 2], ...(seen ? [['npd', 1] as [string, number]] : []));
  else if (seen) heat.push(['npd', people.length >= 3 ? 2 : 1]);
  for (const [faction, gain] of heat) {
    addHeat(w, faction, gain);
    c.emit('heat_up', 'bad', { variant: faction, gain, level: w.heat[faction] ?? 0, source: 'hijack', calls: 0 });
  }
  // (In the middle of a chase there is no time to sort out who sits where, and the police are already after her.)
  if (ok && !inChase) {
    boardParty(c, h.vehicle!, loc);
    // Stealing a cruiser in front of the people it belongs to: they don't let it go.
    if (car.kind === 'police' && seen && rng.chance(0.5)) policeChase(c, 'hijack');
  }
}

// =============================================================== grabbing one on the run

/** A vehicle she could get hold of where she stands: one of hers parked here, one she has the key to, or one that is just there. */
export interface Ride {
  car: Vehicle;
  how: 'own' | 'key' | 'hijack';
  parked?: ParkedVehicle;
}

export function vehicleHere(w: World, loc: Location): Ride | null {
  if (loc.kind !== 'street') return null;
  const mine = ownedHere(w, loc);
  if (mine) return { car: mine, how: 'own', parked: mine };
  const car = parkedVehicle(w, loc);
  if (!car) return null;
  return { car, how: keyTo(w.hero, car.id) ? 'key' : 'hijack' };
}

/** She gets onto it, in the middle of a chase: no questions for her own, no lock for a key, and a quick hijack for the rest. */
export function grabVehicle(c: Ctx, loc: Location, ride: Ride): boolean {
  const { w } = c;
  const h = w.hero;
  const car = ride.car;
  if (ride.how === 'own' && ride.parked) {
    const { at: _at, until: _until, ...own } = ride.parked;
    h.vehicle = normalize({ ...own, riders: [] });
    h.parked = (h.parked ?? []).filter((p) => p !== ride.parked);
    c.emit('chase_mount', 'good', { variant: 'remount', car: car.name, body: car.body, place: loc.name });
    return true;
  }
  if (ride.how === 'key') {
    takeCar(w, loc, car);
    c.emit('chase_mount', 'good', { variant: 'key', car: car.name, kind: car.kind, body: car.body, place: loc.name });
    return true;
  }
  hijack(c, loc, car, true);
  return !!h.vehicle;
}

// =============================================================== riders

const seatsOf = (comp: Companion, body: Vehicle['body'] = 'car'): number => (body === 'bike' && KINDS[comp.kind]?.flies ? 0 : KINDS[comp.kind]?.seats ?? 1);

/** What a companion is worth in the car: guns, a guard, a jammer; healthy, and loyal. */
function riderScore(comp: Companion): number {
  const a = assistOf(comp);
  return (a.dmg ?? 0) * 0.6 + (a.absorb ?? 0) * 0.5 + (a.disable ? 6 : 0) + (comp.hp / comp.maxHp) * 3 + comp.loyalty / 25;
}

/**
 * She gets in with her party. The car has `seats - 1` seats for them (a few take two, a few none): she brings the ones
 * worth the most, and each who is left behind decides for itself whether to wait where it is or go home.
 */
export function boardParty(c: Ctx, car: Vehicle, street: Location): void {
  const { w, rng } = c;
  const h = w.hero;
  normalize(car);
  const room = car.seats - 1;
  let used = 0;
  const aboard: Companion[] = [];
  const left: Companion[] = [];
  for (const comp of [...h.companions].filter((a) => a.hp > 0).sort((a, b) => riderScore(b) - riderScore(a))) {
    if (used + seatsOf(comp, car.body) <= room) {
      used += seatsOf(comp, car.body);
      aboard.push(comp);
    } else left.push(comp);
  }
  car.riders = aboard.map((a) => a.id);
  if (!aboard.length && !left.length) return;
  c.emit('vehicle', left.length ? 'mixed' : 'good', { variant: 'riders', car: car.name, body: car.body, riders: aboard.map((a) => a.name).join(' and '), left: left.map((a) => a.name).join(' and '), count: aboard.length, place: street.name });
  for (const comp of left) {
    // Loyal ones, and ones with nowhere to go, wait. The rest go home.
    const stays = !comp.npcId && !comp.home ? true : rng.chance(0.15 + 0.7 * (comp.loyalty / 100));
    if (stays) {
      h.companions = h.companions.filter((a) => a !== comp);
      (h.waiting ??= []).push(Object.assign(comp, { at: street.id }));
      c.emit('companion_waits', 'mixed', { name: comp.name, kind: comp.kind, place: street.name });
    } else removeCompanion(c, comp, 'left');
  }
}

function drive(c: Ctx, path: Id[], s: number, style: 'fast' | 'safe'): void {
  const { w } = c;
  const h = w.hero;
  const from = w.locations[h.locationId]!;
  const car = h.vehicle!;
  // Each street she passes through is arrived at properly, so the city grows ahead of her and the road keeps going. Any of them might be where it goes wrong.
  const { done, over } = driveAlong(c, path, s);
  w.clock += routeMinutes(w, car, path.slice(0, done), s);
  if (over || !h.vehicle) return; // an accident has told its own story
  const last = w.locations[h.locationId]!;
  c.emit('drive', 'good', {
    variant: from.gen?.district && last.gen?.district && from.gen.district !== last.gen.district ? 'across' : 'along',
    car: car.name,
    body: car.body,
    from: from.name,
    to: last.name,
    toId: last.id,
    hops: path.length,
    style,
    speed: Math.round(s * 100),
    highway: path.some((id) => roadClass(w.locations[id]!) === 'highway'),
    first: last.visits === 1,
    ...(last.visits === 1 && last.blurb ? { blurb: last.blurb } : {}),
  });
  train(c, 'driving', 1 + (s > 0.85 ? 1 : 0));
}
