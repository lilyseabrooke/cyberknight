import type { Rng } from './rng';
import type { Ctx, Exit, Id, Location, Vehicle, Via, World } from './types';
import { hitCar, SPILL } from './cars';
import { addHeat, maybeInjure } from './combat';
import { clamp } from './candidate';
import { VIA, edgesOf, restricted } from './hexmap';
import { roadClass } from './roads';
import { isShut } from './shutdown';
import { skillValue, synergy, train } from './skills';

/**
 * Getting through the city the quick way. A chase has a route (the fleeing side's road to wherever it is going), and the other side
 * can try to work out where that is and cut across to it: over a fence, through a barricade, along a ramp, straight through a
 * building. Whether a way is open depends on what is doing the crossing; see `VIA` in hexmap.ts. See docs/VEHICLE_COMBAT.md.
 */

export type Mode = 'foot' | 'bike' | 'car';

/** The route one side of a chase is on: streets in order, and where it is now. */
export interface Route {
  path: Id[];
  i: number;
}

/** Rounds of travel to cross a street, by what is crossing. (A car is quickest and a runner slowest.) */
const SCALE: Record<Mode, number> = { foot: 1, bike: 0.8, car: 0.7 };

/** A street she can be on, for this mode: a car does not go down an alley. */
function usable(w: World, loc: Location | undefined, mode: Mode): loc is Location {
  if (!loc || loc.kind !== 'street' || isShut(w, loc.id)) return false;
  return !(mode === 'car' && roadClass(loc) === 'alley');
}

/** How long it takes to go through one street: longer ones take longer. */
const lengthOf = (loc: Location): number => 1 + 0.5 * ((loc.hex?.cells.length ?? 1) - 1);

export interface Leg {
  from: Id;
  to: Id;
  via: Via | null;
  over?: Id;
  cost: number;
}

export interface Plan {
  path: Id[];
  legs: Leg[];
  cost: number;
}

/** What is in the way of a leg, other than a street. */
export const obstacleOf = (leg: Leg): boolean => leg.via !== null && leg.via !== 'open';

function legsFrom(w: World, loc: Location, mode: Mode, obstacles: boolean): Leg[] {
  const out: Leg[] = [];
  for (const e of edgesOf(loc) as Exit[]) {
    const dest = w.locations[e.to];
    if (e.hidden || (e.gate && !e.via) || !usable(w, dest, mode)) continue;
    const via = e.via ?? null;
    if (via && via !== 'open' && !obstacles) continue;
    const mult = via ? VIA[via][mode] : 1;
    if (!Number.isFinite(mult)) continue;
    out.push({ from: loc.id, to: e.to, via, ...(e.over ? { over: e.over } : {}), cost: lengthOf(dest) * SCALE[mode] * mult });
  }
  return out;
}

/** The quickest way from one street to another, or null. Obstacles are only used if you say so. */
export function planRoute(w: World, from: Id, to: Id, mode: Mode, obstacles: boolean, limit = 400): Plan | null {
  if (!w.locations[from] || !w.locations[to]) return null;
  const best = new Map<Id, number>([[from, 0]]);
  const prev = new Map<Id, Leg>();
  const open: Id[] = [from];
  const done = new Set<Id>();
  for (let n = 0; n < limit && open.length; n++) {
    let k = 0;
    for (let j = 1; j < open.length; j++) if (best.get(open[j]!)! < best.get(open[k]!)!) k = j;
    const id = open.splice(k, 1)[0]!;
    if (done.has(id)) continue;
    done.add(id);
    if (id === to) break;
    for (const leg of legsFrom(w, w.locations[id]!, mode, obstacles)) {
      const c = best.get(id)! + leg.cost;
      if (c < (best.get(leg.to) ?? Infinity)) {
        best.set(leg.to, c);
        prev.set(leg.to, leg);
        open.push(leg.to);
      }
    }
  }
  if (!best.has(to)) return null;
  const legs: Leg[] = [];
  for (let at = to; at !== from; at = prev.get(at)!.from) legs.unshift(prev.get(at)!);
  return { path: [from, ...legs.map((l) => l.to)], legs, cost: best.get(to)! };
}

/** Where a runner is going and the plain road to it (no climbing, no ramps). Null if there is nowhere much to go. */
export function startRoute(w: World, rng: Rng, from: Id, mode: Mode): Route | null {
  // Everywhere reachable by plain streets within a few steps; they head for somewhere reasonably far.
  const seen = new Map<Id, number>([[from, 0]]);
  let ring: Id[] = [from];
  for (let d = 1; d <= 8; d++) {
    const next: Id[] = [];
    for (const id of ring) {
      for (const leg of legsFrom(w, w.locations[id]!, mode, false)) {
        if (seen.has(leg.to)) continue;
        seen.set(leg.to, d);
        next.push(leg.to);
      }
    }
    ring = next;
  }
  const far = [...seen.entries()].filter(([, d]) => d >= 4);
  const pool = far.length ? far : [...seen.entries()].filter(([, d]) => d >= 2);
  if (!pool.length) return null;
  const [dest] = rng.pick(pool);
  const plan = planRoute(w, from, dest, mode, false);
  return plan && plan.path.length >= 3 ? { path: plan.path, i: 0 } : null;
}

/** Rounds from where the route is now to a point further along it. */
export function remainingTo(w: World, r: Route, idx: number, mode: Mode): number {
  let t = 0;
  for (let k = r.i + 1; k <= idx && k < r.path.length; k++) t += lengthOf(w.locations[r.path[k]!]!) * SCALE[mode];
  return t;
}

// ===================================================================== crossing

/** Who is crossing, and what with. */
export interface Crosser {
  mode: Mode;
  /** The hero herself (her skills count and she bears the cost) or one of theirs (a fixed hand, and the vehicle takes it). */
  hero: boolean;
  car?: (Pick<Vehicle, 'hp' | 'maxHp' | 'armor'> & { body?: Vehicle['body'] }) | null;
  pace: number;
  /** For anybody but her, how good they are at this, 0..1. */
  skill?: number;
}

export interface Crossing {
  /** Rounds lost (or gained, when negative) crossing it. */
  delay: number;
  hurt: number;
  /** What happened, for telling. */
  told: string;
  /** The vehicle did not survive it. */
  wrecked?: boolean;
  /** She came off her vehicle. */
  thrown?: boolean;
}

/** Resolve one obstacle. Her skills decide for her; for anyone else it is a flat hand. */
export function cross(c: Ctx, who: Crosser, leg: Leg): Crossing {
  const { w, rng } = c;
  const h = w.hero;
  const mid = leg.over ? w.locations[leg.over] : undefined;
  const via = leg.via as Via;
  const them = who.skill ?? 0.5;
  const ath = who.hero ? skillValue(h, 'athletics') : 0;
  const refl = who.hero ? h.reflex : 5 * them;
  const heroHurt = (n: number, injure = 0.2): number => {
    if (!who.hero) return 0;
    h.hp -= n;
    maybeInjure(c, n, injure);
    return n;
  };
  switch (via) {
    case 'fence': {
      if (who.mode === 'foot') {
        const p = who.hero ? clamp(0.55 + 0.04 * ath + 0.02 * refl, 0.2, 0.92) : 0.5 + 0.4 * them;
        if (who.hero) train(c, 'athletics', 1);
        return rng.chance(p) ? { delay: 0.2, hurt: 0, told: 'vault' } : { delay: 1.5, hurt: heroHurt(3), told: 'vault_failed' };
      }
      // A car goes through a fence like it is not there, and the fence takes a bit of it with it.
      const r = who.car ? hitCar(who.car, 8 + who.pace * 0.8, 'ram') : null;
      return { delay: 0.3, hurt: who.hero && r ? heroHurt(Math.round(r.taken * SPILL * 0.5), 0.1) : 0, told: 'smash_fence', wrecked: !!r?.wrecked };
    }
    case 'wall': {
      const p = who.hero ? clamp(0.4 + 0.04 * ath + 0.015 * h.muscle, 0.15, 0.85) : 0.35 + 0.4 * them;
      if (who.hero) train(c, 'athletics', 2);
      return rng.chance(p) ? { delay: 0.6, hurt: 0, told: 'climb' } : { delay: 2.5, hurt: heroHurt(6 + rng.int(0, 5), 0.35), told: 'climb_failed' };
    }
    case 'barricade': {
      if (who.mode === 'foot') {
        const p = who.hero ? clamp(0.45 + 0.03 * h.muscle + 0.03 * skillValue(h, 'melee'), 0.15, 0.9) : 0.4 + 0.4 * them;
        if (who.hero) train(c, 'melee', 1);
        return rng.chance(p) ? { delay: 0.8, hurt: 0, told: 'breach' } : { delay: 2, hurt: heroHurt(3), told: 'breach_failed' };
      }
      const bike = who.mode === 'bike';
      const r = who.car ? hitCar(who.car, (bike ? 18 : 22) + who.pace * 1.5, 'ram') : null;
      const down = bike && rng.chance(0.35);
      if (down && who.hero) return { delay: 2, hurt: heroHurt(Math.round(who.pace * 0.9), 0.35), told: 'barricade_crash', wrecked: !!r?.wrecked, thrown: true };
      return { delay: bike ? 0.5 : 0.3, hurt: who.hero && r ? heroHurt(Math.round(r.taken * (bike ? 0.5 : SPILL)), 0.15) : 0, told: 'ram_barricade', wrecked: !!r?.wrecked };
    }
    case 'duct': {
      const p = who.hero ? clamp(0.6 + 0.03 * skillValue(h, 'sneak') + 0.02 * refl, 0.2, 0.92) : 0.55 + 0.35 * them;
      if (who.hero) train(c, 'sneak', 1);
      return rng.chance(p) ? { delay: 0.8, hurt: 0, told: 'crawl' } : { delay: 2, hurt: heroHurt(2, 0.1), told: 'crawl_stuck' };
    }
    case 'through': {
      // A shop is just a shop. A building somebody is guarding is not.
      if (!mid || !restricted(mid)) return { delay: 0.2, hurt: 0, told: 'through' };
      const p = who.hero ? clamp(0.5 + 0.05 * skillValue(h, 'sneak') + 0.02 * refl - 0.04 * mid.security, 0.1, 0.9) : 0.5;
      if (who.hero) train(c, 'sneak', 1);
      if (rng.chance(p)) return { delay: 0.4, hurt: 0, told: 'through' };
      if (who.hero) {
        const faction = mid.faction === 'atlas' || mid.kind === 'corp' ? 'atlas' : 'npd';
        addHeat(w, faction, 1);
        c.emit('heat_up', 'bad', { variant: faction, gain: 1, level: w.heat[faction] ?? 0, source: 'trespass', calls: 0 });
      }
      return { delay: 1.5, hurt: heroHurt(4, 0.15), told: 'through_spotted' };
    }
    case 'ramp': {
      if (who.mode === 'foot') return { delay: 0.2, hurt: 0, told: 'stairs' };
      const p = who.hero ? clamp(0.45 + 0.04 * skillValue(h, 'driving') + 0.025 * who.pace, 0.15, 0.92) : 0.4 + 0.4 * them;
      if (who.hero) train(c, 'driving', 2);
      if (rng.chance(p)) return { delay: -0.2, hurt: 0, told: 'jump' };
      const r = who.car ? hitCar(who.car, 22 + who.pace, 'ram') : null;
      return { delay: 1.8, hurt: who.hero && r ? heroHurt(Math.round(r.taken * (who.mode === 'bike' ? 0.7 : SPILL)), 0.3) : 0, told: 'jump_failed', wrecked: !!r?.wrecked, thrown: who.mode === 'bike' };
    }
    default:
      return { delay: 0, hurt: 0, told: 'open' };
  }
}

// ===================================================================== guessing

/** How well she works out where somebody is going: Calculate, helped by the Hack stat. */
export function readingOf(w: World): number {
  const h = w.hero;
  return clamp(0.3 + 0.06 * synergy(h, ['calculate', ['stat:int', 0.5]]) + 0.01 * h.int, 0.15, 0.92);
}

export interface Cut {
  /** What came of it. `none` means there was no way across that was quicker. */
  kind: 'none' | 'cut_off' | 'late' | 'wrong';
  /** The street she made for, and how far along the route it is. */
  waypoint: Id;
  idx: number;
  /** Rounds she took, and how many ahead of (positive) or behind the runner she got there. */
  took: number;
  margin: number;
  hurt: number;
  told: string[];
  wrecked?: boolean;
  thrown?: boolean;
  /** Where she ended up. */
  at: Id;
  /** What she crossed it as: if that is not what she started as, she got off. */
  mode: Mode;
}

/**
 * Work out where the runner is going and take the quick way there. `accuracy` is the chance of guessing right; a wrong guess
 * sends the cutter to a street the runner does not use.
 */
export function cutAcross(c: Ctx, o: { who: Crosser | Crosser[]; from: Id; route: Route; accuracy: number; /** How far behind them the cutter is, in rounds. */ behind: number }): Cut {
  const { w, rng } = c;
  const { route } = o;
  const options = Array.isArray(o.who) ? o.who : [o.who];
  const left = route.path.length - 1 - route.i;
  const none = (at: Id): Cut => ({ kind: 'none', waypoint: at, idx: route.i, took: 0, margin: 0, hurt: 0, told: [], at, mode: options[0]!.mode });
  if (left < 2) return none(o.from);
  // A point two or three streets on.
  const idx = Math.min(route.path.length - 1, route.i + rng.int(2, Math.min(3, left)));
  let waypoint = route.path[idx]!;
  let right = rng.chance(o.accuracy);
  if (!right) {
    const near = legsFrom(w, w.locations[waypoint]!, options[0]!.mode, false).map((l) => l.to).filter((id) => !route.path.includes(id));
    if (near.length) waypoint = rng.pick(near);
    else right = true;
  }
  // The quickest way for whichever she could be: a car is no good for a wall, but she can get out and run (which costs her the car, so it has to be worth it).
  let best: { who: Crosser; plan: Plan; score: number } | null = null;
  for (const who of options) {
    const plan = planRoute(w, o.from, waypoint, who.mode, true);
    if (!plan || plan.path.length < 2) continue;
    const score = plan.cost + (who === options[0] ? 0 : 0.8);
    if (!best || score < best.score) best = { who, plan, score };
  }
  if (!best) return none(o.from);
  const { who, plan } = best;
  // The runner takes the plain road. If the cutter would not be quicker anyway, there is nothing to cut.
  const runner = remainingTo(w, route, idx, who.mode) - o.behind;
  if (best.score >= runner + 0.9) return none(o.from);
  let took = 0;
  let hurt = 0;
  let wrecked = false;
  let thrown = false;
  const told: string[] = [];
  let at = o.from;
  for (const leg of plan.legs) {
    took += leg.cost;
    at = leg.to;
    if (!obstacleOf(leg)) continue;
    const r = cross(c, who, leg);
    took += r.delay;
    hurt += r.hurt;
    told.push(r.told);
    if (r.wrecked) wrecked = true;
    if (r.thrown) thrown = true;
    if (r.wrecked || r.thrown || (who.hero && c.w.hero.hp <= 0)) break;
  }
  const margin = runner - took;
  const arrived = at === waypoint && !wrecked && !thrown;
  const kind: Cut['kind'] = !right ? 'wrong' : arrived && margin >= -0.7 ? 'cut_off' : 'late';
  return { kind, waypoint, idx, took, margin, hurt, told, wrecked, thrown, at, mode: who.mode };
}

/** A gap in tiles, as rounds behind. */
export const behindOf = (gap: number): number => gap * 0.3;
