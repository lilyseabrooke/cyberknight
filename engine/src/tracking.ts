import type { Npc, World } from './types';
import type { Rng } from './rng';
import { skillValue } from './skills';
import { skillOf, statsOf } from './npcstats';

/**
 * Tracking: having lost sight of somebody, working out where they went from what they left. A check against how well they covered their
 * trail. The better the result, the more specific the sense of where they are, from only which way they went (cold) to nearly where they
 * are now (hot). It is what makes losing sight of somebody not the same as losing them.
 */
export type Trail = 'none' | 'cold' | 'warm' | 'hot';

/** How good a tracker somebody is. */
export const trackerOf = (n: Npc): number => 1 + 0.7 * skillOf(n, 'tracking') + 0.5 * statsOf(n).int + (n.tags.includes('cop') ? 1 : 0) + (n.tags.includes('robot') ? 2 : 0);
export const heroTracker = (w: World): number => 1 + 0.7 * skillValue(w.hero, 'tracking') + 0.5 * w.hero.int;

/** How hard they are to follow: the quicker and quieter, the harder; a tight, crowded street muddies every trail. */
export const coverOf = (n: Npc, squeeze: number): number => 3 + 0.5 * skillOf(n, 'sneak') + 3 * squeeze;
export const heroCover = (w: World, squeeze: number): number => 3 + 0.5 * skillValue(w.hero, 'sneak') + 3 * squeeze;

/** Noise she makes after they have lost her gives them something to follow: the cover is that much thinner, more the louder it was. */
export const eased = (cover: number, noise: number): number => Math.max(0, cover - Math.min(6, 5 * noise));

export const trailOf = (q: number): Trail => (q < 0.3 ? 'none' : q < 0.55 ? 'cold' : q < 0.8 ? 'warm' : 'hot');

/** One check: the result as 0 to 1. */
export function follow(rng: Rng, tracker: number, cover: number): { q: number; trail: Trail } {
  const q = Math.max(0, Math.min(1, 0.5 + 0.08 * (tracker - cover) + (rng.next() - 0.5) * 0.5));
  return { q, trail: trailOf(q) };
}

/** How far behind a trail leaves them, as a share of the distance at which a chase is lost: the more specific, the closer. */
export const BEHIND: Record<Trail, number> = { none: 1, cold: 0.85, warm: 0.65, hot: 0.45 };

// ------------------------------------------------------------------ escape fatigue

/** Beats of quiet after which the running is forgotten. */
const REST = 8;

/** How long somebody has been running, in rounds, across chases and the searches between them. */
export function tire(w: World): number {
  const t = w.chaseTire;
  return t && w.beat - t.beat <= REST ? t.rounds : 0;
}

export function addTire(w: World, rounds: number): void {
  w.chaseTire = { rounds: tire(w) + rounds, beat: w.beat };
}

/** A fight, or a clean getaway, ends the running. */
export function rest(w: World): void {
  delete w.chaseTire;
}

/** The chance, each round, that the one who has been running the longest stops and stands: nothing for a while, then steadily more. */
export const standTired = (w: World): number => Math.max(0, Math.min(0.7, 0.035 * (tire(w) - 6)));
