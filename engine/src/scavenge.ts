import type { Candidate } from './candidate';
import { capabilityPull } from './affordances';
import { dayOf } from './clock';
import { spotParts } from './content/spots';
import { billText, totalParts, type Bill } from './content/parts';
import { dungeonOf, standing } from './dungeons';
import { addParts } from './bench';
import { sayAs } from './placekit';
import { odds, synergy, train } from './skills';
import type { Ctx, Location, World } from './types';

/**
 * Parts lying about. Most spots (a stripped car, a drone boneyard, a relay box with its panel off) have bits worth taking, and
 * nobody minds if the people who held them are gone. It costs nothing but time: she picks through the place, takes what
 * she can carry and the spot is picked over for a few days. Where the parts are depends on the place (content/spots.ts); how much
 * depends on the place's tier and how well she knows junk. This is where most of her components are meant to come from; the
 * bench (bench.ts) turns them into things.
 */

/** Days before a spot has anything worth taking again. */
const REFILL_DAYS = 3;

const key = (loc: Location): string => `scav:${loc.id}`;

/** The spot she is standing in, if it has parts and nobody holding it. */
function here(w: World): { loc: Location; spot: string; tier: number } | undefined {
  const loc = w.locations[w.hero.locationId];
  const d = dungeonOf(w, loc);
  if (!loc || !d || d.kind !== 'spot' || !d.spot || loc.id !== d.id) return undefined;
  if (spotParts(d.spot).rich <= 0 || standing(w, d, loc.id).length) return undefined;
  const last = w.counters[key(loc)];
  if (last !== undefined && dayOf(w.clock) - last < REFILL_DAYS) return undefined;
  return { loc, spot: d.spot, tier: d.tier };
}

const GOOD = [
  'Blackbird goes through {place} like a raccoon with a plan. Into the bag: {got}.',
  'Nobody is around to mind, so she takes her time. {place} gives up {got}.',
  'She pulls panels, lifts lids and reaches into places she would rather not. {got}, for the price of a bad back.',
];
const THIN = [
  'Blackbird picks through {place}. Someone got here first. She finds {got}.',
  '{place} has been stripped by people with better eyes. She goes home with {got}.',
];
const THOUGHT = ['Free is my favourite price.', 'One person\'s junk is a better gun.', 'Scavenging. Basically archaeology, with fewer certificates.'];

export function scavenge(c: Ctx, loc: Location, spot: string, tier: number): void {
  const { w, rng } = c;
  const h = w.hero;
  const def = spotParts(spot);
  const win = rng.chance(odds(0.75, 0.04, synergy(h, ['scavenging', ['stat:int', 0.3]]), 0.4, 0.95));
  const picks = win ? 2 + Math.round(def.rich) + rng.int(0, 1) : 1;
  const ids = Object.keys(def.weights);
  const got: Bill = {};
  for (let i = 0; i < picks; i++) {
    const p = rng.weighted(ids, (k) => def.weights[k]!);
    got[p] = (got[p] ?? 0) + Math.max(1, Math.round((1 + rng.int(0, 2) + tier * 0.5) * def.rich * (win ? 1 : 0.5)));
  }
  addParts(h, got);
  w.counters[key(loc)] = dayOf(w.clock);
  train(c, 'scavenging', win ? 2 : 1);
  train(c, 'tinkering', 1);
  sayAs('chop', c, 'scavenge', win ? 'good' : 'mixed', win ? GOOD : THIN, win ? THOUGHT : [], { place: loc.name, got: billText(got) });
}

export function scavengeCandidates(w: World): Candidate[] {
  const s = here(w);
  if (!s) return [];
  const h = w.hero;
  const low = totalParts(h.parts) < 14 ? 0.35 : totalParts(h.parts) > 40 ? -0.6 : 0;
  return [{
    key: `scavenge:${s.loc.id}`, drives: { curiosity: 0.25, greed: 0.25 }, smart: 0.3,
    bonus: 0.35 + low + spotParts(s.spot).rich * 0.2 + capabilityPull(h, ['skill:scavenging', 'skill:tinkering']),
    run: (c) => {
      const now = here(c.w);
      if (now) scavenge(c, now.loc, now.spot, now.tier);
    },
  }];
}
