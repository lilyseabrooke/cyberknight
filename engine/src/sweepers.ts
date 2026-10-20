import type { Ctx } from './types';
import { fight, here } from './combat';
import { scoutSaves } from './extras';

/**
 * Street sweepers: the cheapest drones in Neo patrol the streets (see the street roster) and now and then pick a fight with
 * whoever is standing there. They are built to lose to a level 1, so this is the early game's bread and butter: a small,
 * frequent, winnable fight that comes to her. (She can also go after one herself; see `hunt_drone` in hustles.ts.)
 */
export const SWEEPER_CHANCE = 0.05;

export function sweeperRoll(c: Ctx): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  if (!loc.outdoors || h.stealth || h.vehicle) return false;
  const bots = here(w).filter((n) => n.alive && !n.hostile && n.tags.includes('sweeper') && n.downUntil <= w.clock);
  if (!bots.length || !rng.chance(SWEEPER_CHANCE)) return false;
  if (scoutSaves(c)) return true;
  const mob = bots.slice(0, 2);
  c.emit('sweeper_accost', 'mixed', { npc: mob[0]!.name, count: mob.length, place: loc.name });
  fight(c, mob, { cause: 'a street sweeper drone picking a fight', joiners: false });
  return true;
}
