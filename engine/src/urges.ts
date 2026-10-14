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
