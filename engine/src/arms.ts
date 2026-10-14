import type { Hero, Item, Npc } from './types';
import { FISTS } from './content/items';
import { rating } from './weapons';

/** Pure helpers for what she is carrying and whether it will actually go bang. No world, no RNG. */

export const ammoOf = (h: Hero, type: string): number => h.ammo[type] ?? 0;

export const isArm = (it: Item): boolean => it.kind === 'weapon' || it.kind === 'gadget';

/** Melee weapons are always ready; guns need at least one round of their type. */
export const loaded = (h: Hero, it: Item): boolean => !it.ammoType || ammoOf(h, it.ammoType) > 0;

/**
 * What she is actually swinging or firing. Her preferred weapon if it works; otherwise the best
 * thing in her pockets that does; otherwise her fists. A dry rail revolver is a very expensive club.
 */
export function wielded(h: Hero, foes?: Npc[]): Item {
  if (!foes?.length) {
    if (loaded(h, h.weapon)) return h.weapon;
    let best: Item = FISTS;
    for (const it of h.inventory) if (isArm(it) && loaded(h, it) && rating(it) > rating(best)) best = it;
    return best;
  }
  // Against these particular people: whichever of her weapons that works suits the job best. Her usual one gets the benefit of the doubt.
  const score = (it: Item) => foes.reduce((a, f) => a + rating(it, f), 0) / foes.length;
  let best: Item = loaded(h, h.weapon) ? h.weapon : FISTS;
  let bestScore = loaded(h, h.weapon) ? score(h.weapon) * 1.06 : score(FISTS);
  for (const it of h.inventory) {
    if (!isArm(it) || !loaded(h, it)) continue;
    const sc = score(it);
    if (sc > bestScore) {
      best = it;
      bestScore = sc;
    }
  }
  return best;
}

/** Burn the rounds for one round of shooting. Returns how many were spent. */
export function spendAmmo(h: Hero, it: Item): number {
  if (!it.ammoType) return 0;
  const spent = Math.min(ammoOf(h, it.ammoType), it.perRound ?? 1);
  h.ammo[it.ammoType] = ammoOf(h, it.ammoType) - spent;
  return spent;
}

export function addAmmo(h: Hero, type: string, rounds: number): void {
  h.ammo[type] = ammoOf(h, type) + rounds;
}

/** Every gun she owns (preferred weapon included), in case she is dry on one and flush on another. */
export const gunsOwned = (h: Hero): Item[] => [h.weapon, ...h.inventory].filter((i) => isArm(i) && !!i.ammoType);

/** How many full rounds of shooting a gun has left. */
export const shotsLeft = (h: Hero, it: Item): number => (it.ammoType ? Math.floor(ammoOf(h, it.ammoType) / (it.perRound ?? 1)) : Infinity);

/** Every medical item she carries, of any tier. */
export const medPacks = (h: Hero): Item[] => h.inventory.filter((i) => i.tags.includes('med'));

/** Total HP her pockets could restore. */
export const medStock = (h: Hero): number => medPacks(h).reduce((a, i) => a + i.power, 0);
