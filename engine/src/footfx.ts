import type { Ctx, Location, Npc } from './types';
import { addHeat, maybeInjure, npcsAt } from './combat';
import { spawnGroup, clamp } from './candidate';
import { scene, trafficAt, trafficWord, type RoadClass } from './roads';
import { skillValue, train } from './skills';

/**
 * Running down the street. The same idea as driving (drivefx.ts), with her legs: a class of street says how hard it is, traffic how
 * much is in the way, going flat out makes it worse, and a practised runner (athletics, where a driver has driving) makes it better.
 * What goes wrong depends on the street. On the small ones and the crowded ones it is people: she runs into someone, loses a step, and
 * might make them angry enough to come after her (or hurt a police officer or an Atlas agent, which is heat). On the big roads it is
 * traffic: she gets hit by a car, which hurts, and has to stay on her feet or lose ground.
 */

/** On these the trouble is people. On the others it is cars. */
const BUMPS: RoadClass[] = ['alley', 'pedestrian', 'small'];

export const isBump = (cls: RoadClass): boolean => BUMPS.includes(cls);

/**
 * How it is on foot, per class: the base odds, how much running harder matters, and how much traffic does. A highway is not made to be
 * run across, and a street has cars on it; crowds are what make the small ones hard.
 */
const FOOT: Record<RoadClass, { base: number; sens: number; k: number }> = {
  alley: { base: 0.03, sens: 1, k: 0.6 },
  small: { base: 0.05, sens: 1.2, k: 1.2 },
  pedestrian: { base: 0.1, sens: 1.5, k: 1.5 },
  street: { base: 0.04, sens: 1, k: 1.5 },
  highway: { base: 0.08, sens: 1.6, k: 3 },
};

/** The odds of a mishap on one street. `s` is how hard she is running, 0 to 1. */
export function footChance(w: Ctx['w'], cls: RoadClass, s: number, traffic: number): number {
  const r = FOOT[cls];
  const h = w.hero;
  const speed = 0.3 + r.sens * 2.4 * Math.pow(s, 3);
  const busy = 0.1 + r.k * Math.pow(traffic, 1.5);
  let p = r.base * speed * busy;
  p /= 1 + 0.1 * skillValue(h, 'athletics'); // a practised runner
  p *= 1 + 0.25 * h.drunk;
  if (w.situation.weather === 'acid_rain') p *= 1.2;
  return clamp(p, 0, 0.9);
}

export interface Stumble {
  /** How much ground she loses, in the chase's tiles. */
  lost: number;
  /** She was put on the ground. */
  down: boolean;
  /** Somebody who is now after her. */
  angry: Npc | null;
}

const isLaw = (n: Npc): boolean => n.tags.includes('cop') || n.tags.includes('security') || n.faction === 'npd' || n.faction === 'atlas';

/** Something goes wrong on this street, on foot. Tells it, applies it, and says what it cost her. */
export function stumble(c: Ctx, loc: Location, cls: RoadClass, s: number): Stumble {
  const { w, rng } = c;
  const h = w.hero;
  train(c, 'athletics', 1);

  if (isBump(cls)) {
    // Into somebody.
    const crowd = npcsAt(w, loc.id).filter((n) => n.alive && !n.hostile && !n.tags.some((x) => ['robot', 'dragon', 'boss'].includes(x)) && n.archetype !== 'puppy' && !h.companions.some((a) => a.npcId === n.id));
    const who = crowd.length ? rng.pick(crowd) : spawnGroup(c, 'patron', 1)[0]!;
    return bump(c, who, loc, cls, s);
  }

  // Into traffic: a car hits her.
  const t = trafficAt(w, loc);
  const data = { road: cls, place: loc.name, speed: Math.round(s * 100), traffic: trafficWord(t), scene: scene(cls, t), body: 'foot' };
  const dmg = Math.round(8 + 10 * t + (cls === 'highway' ? 14 : 0) + 6 * s);
  h.hp -= dmg;
  maybeInjure(c, dmg, 0.35);
  // Staying on her feet is a matter of athletics and nerve, and of how hard she was going.
  const stay = clamp(0.5 + 0.04 * skillValue(h, 'athletics') + 0.02 * h.reflex - 0.2 * (s - 0.5) - 0.15 * t, 0.1, 0.9);
  const up = rng.chance(stay);
  c.emit('accident', up ? 'mixed' : 'bad', { variant: up ? 'struck' : 'struck_down', dmg, ...data });
  return { lost: up ? 1 : 2.8, down: !up, angry: null };
}

/** She goes into somebody in particular. */
export function bump(c: Ctx, who: Npc, loc: Location, cls: RoadClass, s: number): Stumble {
  const { w, rng } = c;
  const t = trafficAt(w, loc);
  const data = { road: cls, place: loc.name, speed: Math.round(s * 100), traffic: trafficWord(t), scene: scene(cls, t), body: 'foot' };
  const law = isLaw(who);
  // She puts a police officer or an Atlas agent on the ground more often than not, and that is the sort of thing that is noticed.
  const hurt = law ? rng.chance(0.7) : rng.chance(0.25);
  const angry = rng.chance(clamp(0.3 + 0.35 * t + (law ? 0.3 : 0) + (hurt ? 0.2 : 0), 0, 0.95));
  who.affinity -= hurt ? 15 : 5;
  if (hurt && law) {
    const faction = who.faction === 'atlas' || who.tags.includes('corp') ? 'atlas' : 'npd';
    addHeat(w, faction, 1);
    c.emit('heat_up', 'bad', { variant: faction, gain: 1, level: w.heat[faction] ?? 0, source: 'crash', calls: 0 });
  }
  c.emit('accident', angry ? 'bad' : 'mixed', { variant: 'bump', who: who.name, role: who.role, law, hurt, angry, ...data });
  return { lost: 1 + (hurt ? 0.5 : 0) + t, down: false, angry: angry ? who : null };
}
