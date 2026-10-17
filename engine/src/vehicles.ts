import { Rng } from './rng';
import { addHeat, npcsAt, relocate, remember } from './combat';
import { sneakBonus } from './extras';
import { clamp, type Candidate } from './candidate';
import { roadsFrom, driveMinutes, parkedVehicle, isPerson } from './roads';
import { MAKES, condition, normalize, vehicleOf, type Make } from './cars';
import { KINDS, removeCompanion } from './companions';
import { policeChase } from './chase';
import { skillValue, synergy, train } from './skills';
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
export const reachOf = (w: World, v: Vehicle): number => clamp(Math.round((3 + skillValue(w.hero, 'driving') / 2) * v.speed * (0.6 + 0.4 * condition(v))), 3, 10);

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
          c.emit('vehicle', 'good', { variant: 'back', car: mine.name, place: loc.name });
          boardParty(c, w.hero.vehicle, loc);
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

  const car = normalize(h.vehicle);
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
    h.vehicle = vehicleOf(car);
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
  if (ok) {
    boardParty(c, h.vehicle!, loc);
    // Stealing a cruiser in front of the people it belongs to: they don't let it go.
    if (car.kind === 'police' && seen && rng.chance(0.5)) policeChase(c, 'hijack');
  }
}

// =============================================================== riders

const seatsOf = (comp: Companion): number => KINDS[comp.kind]?.seats ?? 1;

/** What a companion is worth in the car: guns, a guard, a jammer; healthy, and loyal. */
function riderScore(comp: Companion): number {
  const a = KINDS[comp.kind]?.assist ?? {};
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
    if (used + seatsOf(comp) <= room) {
      used += seatsOf(comp);
      aboard.push(comp);
    } else left.push(comp);
  }
  car.riders = aboard.map((a) => a.id);
  if (!aboard.length && !left.length) return;
  c.emit('vehicle', left.length ? 'mixed' : 'good', { variant: 'riders', car: car.name, riders: aboard.map((a) => a.name).join(' and '), left: left.map((a) => a.name).join(' and '), count: aboard.length, place: street.name });
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
