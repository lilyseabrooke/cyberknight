import type { Ctx, Location, World } from './types';
import { addHeat } from './combat';
import { CLEARANCE } from './content/musehqs';
import { genInstrument } from './instruments';
import { block, streetOf } from './renown';
import { shiftPull } from './musescene';
import { ban, type VenueView } from './venuekit';

/**
 * What Muse buildings share between their rows and their system: the clearance ladder, and what being caught on the wrong
 * floor costs. (musehq.ts registers the rows; content/musehq*.ts are the rows.)
 *
 * Clearance is a rung a night (0 the lobby, 1 staff floors, 2 secure, 3 the executive level), counted on the world for the
 * building she is in (`museclear:<id>`) and raised by whatever she has: a Muse lanyard is staff, a forged badge or Inspiration
 * armour is secure, a contract is an artist's pass. A fire drill, a walkout or a power cut opens one more rung for everybody.
 */

export const clearKey = (v: Pick<VenueView, 'main'>): string => `museclear:${v.main.id}`;

export function clearance(w: World, v: Pick<VenueView, 'main' | 'sit'>): number {
  let c = w.counters[clearKey(v)] ?? 0;
  const has = (id: string): boolean => w.hero.inventory.some((i) => i.id === id) || w.hero.armor?.id === id;
  if (has('muse_lanyard')) c = Math.max(c, 1);
  if (has('muse_badge') || has('inspiration_armour')) c = Math.max(c, 2);
  if (w.legacy.muse?.signed) c = Math.max(c, 2);
  if (v.sit?.def.tags.includes('empty')) c += 1;
  return Math.min(3, c);
}

/** She is up to this rung, for tonight. */
export function raise(c: Ctx, v: VenueView, to: number): void {
  const k = clearKey(v);
  c.w.counters[k] = Math.max(c.w.counters[k] ?? 0, Math.min(3, to));
}

/** Can she reach this feature from the rung she is on? */
export const reach = (w: World, v: VenueView, feature: string): boolean => clearance(w, v) >= (CLEARANCE[feature] ?? 0);

/** Caught on a floor she should not be on: back down to the lobby, and Muse heat. (The row brings the Inspiration team.) */
export function caught(c: Ctx, v: VenueView): void {
  c.w.counters[clearKey(v)] = 0;
  addHeat(c.w, 'muse', 2);
  if (c.rng.chance(0.25)) ban(c, v);
}

/** Muse forgets her a little, all round her block and the next one. */
export function loosen(w: World, loc: Location, d: number): void {
  for (const id of block(w, streetOf(w, loc))) shiftPull(w, id, -d);
}

/** A guitar Clearance took "for safekeeping", from a previous Blackbird, one way or another. */
export function confiscated(c: Ctx, v: VenueView): ReturnType<typeof genInstrument> {
  const g = genInstrument(c.rng.fork(`evidence:${v.main.id}:${c.w.legacy.runs}`), Math.min(9, v.info.tier + 2));
  if (g.inst) g.inst.signature = Math.max(1, g.inst.signature);
  g.name = `${g.name}, tagged CONFISCATED (FOR SAFEKEEPING), and very much hers`;
  return g;
}
