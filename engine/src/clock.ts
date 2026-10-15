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
/** World minutes in one ordinary beat. */
export const BASE_MIN_PER_BEAT = 1;

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
  return minutes;
}
