import type { World } from './types';

/**
 * The in-game clock. It's what NPC routines, movement and catch-up run on, not `beat` (a beat is
 * one decision of Blackbird's; the clock is how much world time went by while she made it).
 *
 * The clock is not tied to the wall clock. Normal play advances it a fixed amount per beat; things
 * that take time (a fight, an odd job, sleeping it off) `elapse` more. When the player closes the
 * game and comes back, `offlineMinutes` converts the real time away into world time at its own,
 * slower rate, and NPCs catch up lazily (see movement.ts): positions are a pure function of the
 * clock, so a long absence costs nothing until somebody looks.
 */

export const MIN_PER_DAY = 24 * 60;
/** A world's first moment: eight in the evening on day 0. */
export const START_MINUTE = 20 * 60;
/** World minutes in one ordinary beat (a glance, a word, a few steps). */
export const BASE_MIN_PER_BEAT = 3;

/**
 * How long a beat's chosen action takes, by the part of its key before the colon, when it isn't an ordinary beat.
 * Walking is quick; a gig, a job, a heist or sleeping it off eats the evening. Anything not listed takes BASE_MIN_PER_BEAT.
 */
export const ACTION_MINUTES: Record<string, number> = {
  go: 2, chat: 2, ask_around: 4, ask_work: 4,
  buy_ware: 4, buy_stim: 4, buy_med: 4, buy_info: 4, buy_gear: 4, buy_loudspeaker: 4, buy_ammo: 4,
  eat_noodles: 12, eat_dish: 15, cook: 25, order_drink: 10, buy_round: 10, sober_up: 40, hangout: 30, darts: 20, poker: 45, jam: 30,
  flirt: 15, kiss: 20, pool_date: 60, serenade: 20, serenade_girl: 20,
  fish: 45, reel_in: 6, reel_girl: 6, rod_lift: 6, rod_tug: 8, rod_swing: 6, rod_bait: 30, busk: 30, sing_busk: 30, karaoke: 30, gig: 60, dj_set: 90, crash_gig: 60, guitar_duel: 30, beat_battle: 30, stump_speech: 5, keep_speaking: 6, wrap_up: 2, rally_allies: 15, mirror_speech: 10,
  odd_jobs: 90, odd_request: 30, security_shift: 120, bodyguard_gig: 120, tend_bar: 90, courier_run: 45, take_contract: 15,
  lay_low: 120, hide_flight: 45, chase_flight: 12, duck_inside: 5, shelter_scream: 20, pay_tithe: 5, haggle_tithe: 8, get_patched: 30, use_med_pack: 10, patch_up: 20,
  burgle_home: 25, burgle_flat: 25, rob_paint_shop: 20, pickpocket: 10, scam_mark: 20, sell_fake_goods: 20, hack: 20, jack: 20,
  eat_stall: 15, eat_bagel: 8, eat_plate: 25, scrounge: 20,
  raid_loot: 40, raid_ambush: 30, graffiti: 25, tail: 30, hunt_drone: 30, fence: 10, implant: 60,
  gym: 35, gymfight: 15, gymquick: 6,
  hijack: 6,
  pawn: 30, pawnfight: 15, pawnquick: 6, pawndeal: 20,
  hall: 30, hallfight: 15, hallquick: 6, halldeal: 20,
  chopin: 8, bench: 45,
  hub: 30, hubfight: 15, hubquick: 6, hubdeal: 25, benchcraft: 60, scavenge: 30,
  realtybuy: 45, realtyview: 10,
};

/** How long a car she has left on a street stays hers, by whose it was: the police and Atlas come for their own sooner. */
export const CAR_LIFE_MIN = { civilian: 2 * MIN_PER_DAY, police: 6 * 60, atlas: 12 * 60 } as const;

/** Extra world minutes a fight adds to the beat it happens in. */
export const FIGHT_MINUTES = 15;

/** World minutes the beat's action takes (before any fight). */
export const actionMinutes = (key: string): number => ACTION_MINUTES[key.replace(/:.*$/, '')] ?? BASE_MIN_PER_BEAT;

/** True when the clock has just passed 05:00, the hour night gives way to dawn. */
export const crossedDawn = (before: number, after: number): boolean => {
  const dawn = (t: number) => Math.floor((t - 5 * 60) / MIN_PER_DAY);
  return dawn(after) > dawn(before);
};

/** World minutes per real second while the game is closed (about 5 days for a night away). */
export const OFFLINE_MIN_PER_REAL_SEC = 0.25;
/** The most world time a single absence can account for. */
export const OFFLINE_CAP_MIN = 7 * MIN_PER_DAY;

export type Phase = 'night' | 'dawn' | 'day' | 'dusk';

export const dayOf = (clock: number): number => Math.floor(clock / MIN_PER_DAY);
export const minuteOfDay = (clock: number): number => ((clock % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
export const hourOf = (clock: number): number => Math.floor(minuteOfDay(clock) / 60);

export function phaseOf(clock: number): Phase {
  const h = hourOf(clock);
  if (h >= 22 || h < 5) return 'night';
  if (h < 9) return 'dawn';
  if (h < 18) return 'day';
  return 'dusk';
}

/** "21:40", for logs and the status panel. */
export function clockLabel(clock: number): string {
  const m = minuteOfDay(clock);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
}

/** The next time it's evening (the start of a night) at least `minGap` minutes after `clock`. */
export function nextEvening(clock: number, minGap = 6 * 60): number {
  const t = clock + minGap;
  return t + ((START_MINUTE - minuteOfDay(t) + MIN_PER_DAY) % MIN_PER_DAY);
}

/**
 * How many whole `period`-minute spans of world clock have gone by since this was last asked about `key`
 * (0 on the first ask). The span boundaries are kept, so nothing is lost or counted twice, whether a beat was
 * a few seconds or a night's sleep. This is what a "every so often" tick should use instead of `w.beat % N`.
 */
export function every(w: World, key: string, period: number): number {
  const marks = (w.every ??= {});
  let last = marks[key];
  if (last === undefined || last > w.clock) last = marks[key] = w.clock;
  const n = Math.floor((w.clock - last) / period);
  if (n > 0) marks[key] = last + n * period;
  return n;
}

/** Let world time pass: a fight, an odd job, a long sleep. Minutes are never negative. */
export function elapse(w: World, minutes: number): void {
  w.clock += Math.max(0, minutes);
}

/** World time that passed while the game was closed for `realMs`. */
export function offlineMinutes(realMs: number): number {
  return Math.min(OFFLINE_CAP_MIN, Math.max(0, (realMs / 1000) * OFFLINE_MIN_PER_REAL_SEC));
}

/**
 * Apply an absence. Returns the world minutes that went by. Nothing else is simulated here on
 * purpose: NPCs settle to wherever the new time puts them the next time somebody looks.
 */
export function catchUp(w: World, realMs: number): number {
  const minutes = offlineMinutes(realMs);
  elapse(w, minutes);
  // She doesn't get hungry or tired while the game is closed.
  // (Between runs there is no hero, only a world, and nothing to protect.)
  const h = (w as Partial<World>).hero;
  if (h?.needsAt !== undefined) h.needsAt += minutes;
  return minutes;
}
