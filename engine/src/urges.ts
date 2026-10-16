import type { Hero } from './types';

/**
 * How badly she wants healing, as a function of how hurt she is. It is steep on purpose: a scratch is
 * nothing, but down near the bottom of the bar nothing competes with it, not even money she's saving up.
 * Drink flattens it. A wasted Blackbird is quite sure she's fine.
 *
 *   hp 90% -> 0.05   hp 70% -> 0.6   hp 50% -> 1.8   hp 30% -> 3.7   hp 20% -> 5.1   hp 10% -> 7.0
 */
export function healUrge(h: Hero): number {
  const hurt = Math.max(0, Math.min(1, 1 - h.hp / h.maxHp));
  const wasted = Math.max(0, Math.min(1, (h.drunk - 1) / 4));
  return 9 * hurt ** 2.3 * (1 - 0.7 * wasted);
}

/**
 * How badly she wants a meal: one point for every tenth of the bar she is down from 90, which is where hunger starts to cost
 * her. She has made up her mind by 80 and goes to eat, rather than waiting until it hurts:
 *
 *   hunger 85 -> 0.5   hunger 80 -> 1   hunger 60 -> 3   hunger 30 -> 6   hunger 0 -> 9
 */
export function hungerUrge(h: Hero): number {
  return Math.max(0, Math.min(9, (90 - (h.hunger ?? 100)) / 10));
}

/**
 * How badly she wants a bed. Nothing above 35, then steeply, well before she drops:
 *
 *   sleep 30 -> 0.9   sleep 25 -> 2.0   sleep 20 -> 3.2   sleep 10 -> 6.0   sleep 0 -> 9
 */
export function sleepUrge(h: Hero): number {
  const empty = Math.max(0, Math.min(1, (35 - (h.sleep ?? 100)) / 35));
  return 9 * empty ** 1.2;
}
