import type { Hero, Legacy, World } from './types';
import { perk } from './lab';

/**
 * Hunger and Sleep: two meters that run down with the world's clock, not with her beats, so a long job or a long sleep costs
 * what it should. This file is only the arithmetic: how fast they fall, what being low on either one does to her, and how the
 * lab softens all of it. What she does about it (eating, finding a bed, passing out, starving) is in `rest.ts`.
 *
 *   Hunger: 100 -> 0 in 60 hours, so she can go a couple of days without a meal before it kills her. It bites slowly, in steps
 *           (every tenth of the bar below 90% costs a little, and the cost grows; the remarks come at 70, 45, 20 and 8).
 *   Sleep:  100 -> 0 in 20 hours awake, so she wants about eight hours of bed in every day, and passes out if she never gets them.
 *
 * Both are plain numbers on the hero, absent in older saves (absent means full).
 */

export const MAX_METER = 100;

/** Hunger lost per world minute awake: empty after 60 hours. */
export const HUNGER_PER_MIN = MAX_METER / (60 * 60);
/** Sleep lost per world minute awake: empty after 20 hours. */
export const SLEEP_PER_MIN = MAX_METER / (20 * 60);
/** Asleep, she burns food at this fraction of the awake rate. */
export const HUNGER_WHILE_ASLEEP = 0.5;
/** Hunger never falls below this while she sleeps: it wakes her before it kills her. */
export const HUNGER_WAKE = 3;

/** Hours in a full night's sleep. */
export const NIGHT_HOURS = 8;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export const hungerOf = (h: Hero): number => h.hunger ?? MAX_METER;
export const sleepOf = (h: Hero): number => h.sleep ?? MAX_METER;

type Owned = Pick<Legacy, 'upgrades'>;

/** How fast each runs down once the lab has had its say, per world minute awake. */
export const hungerRate = (l: Owned): number => HUNGER_PER_MIN * clamp(1 - perk(l, 'hungerSlow') / 100, 0.35, 1);
export const sleepRate = (l: Owned): number => SLEEP_PER_MIN * clamp(1 - perk(l, 'sleepSlow') / 100, 0.4, 1);

/** Hours a night takes: eight, less what the lab's sleep module saves her (never under four). */
export const nightHours = (l: Owned): number => clamp(Math.round(NIGHT_HOURS / (1 + perk(l, 'sleepFast') / 100)), 4, NIGHT_HOURS);

/** How much of a full night's sleep a bed of this quality really gives, once the lab has made up some of what's missing. */
export const effectiveQuality = (l: Owned, quality: number): number => clamp(quality + (1 - quality) * clamp(perk(l, 'restQuality'), 0, 100) / 100, 0, 1);

// ===================================================================== tiers

export type HungerTier = 'fed' | 'hungry' | 'famished' | 'starving' | 'wasting';
export type SleepTier = 'rested' | 'tired' | 'exhausted' | 'spent';

export const hungerTier = (v: number): HungerTier => (v >= 70 ? 'fed' : v >= 45 ? 'hungry' : v >= 20 ? 'famished' : v >= 8 ? 'starving' : 'wasting');
export const sleepTier = (v: number): SleepTier => (v >= 40 ? 'rested' : v >= 22 ? 'tired' : v >= 10 ? 'exhausted' : 'spent');

export interface Penalty {
  /** Off her power in a fight. */
  power: number;
  muscle: number;
  reflex: number;
  hack: number;
  charm: number;
}

const NONE: Penalty = { power: 0, muscle: 0, reflex: 0, hack: 0, charm: 0 };
const pen = (power: number, muscle = 0, reflex = 0, hack = 0, charm = 0): Penalty => ({ power, muscle, reflex, hack, charm });

/** Hunger starts to cost her the moment she is below this. */
export const HUNGER_FREE = 90;

/**
 * How many tenths of the bar she is down from "well fed": 0 at 90 and over, 1 anywhere from 89 to 80, up to 9 below 10.
 * Every one of them costs a little, and the cost grows: staying topped up is cheap, putting it off is not, and it takes
 * days of putting it off to be fatal.
 */
export const hungerSteps = (v: number): number => (v >= HUNGER_FREE ? 0 : Math.min(9, Math.ceil((HUNGER_FREE - v) / 10)));

/** What the hunger bar costs her at this many steps down (see `hungerSteps`). Power first, then the body, muscle before the mind. */
export function hungerPenalty(steps: number): Penalty {
  return pen(Math.round((steps * steps) / 12), Math.floor(steps / 3), Math.floor(steps / 4), Math.floor(steps / 5), Math.floor(steps / 6));
}

/**
 * And each step down the sleep bar. Tiredness hits the head and the hands before the muscles. Being a little tired is just
 * what the day is like (she is most of the way down the bar by the time she thinks of a bed), so *tired* only costs a remark.
 */
export const SLEEP_PENALTY: Record<SleepTier, Penalty> = {
  rested: NONE,
  tired: NONE,
  exhausted: pen(1, 0, 1),
  spent: pen(3, 0, 1, 2, 1),
};

/** A bed this good neither adds nor removes sleep debt: a pod falls short of it, an average hostel clears it, a hotel clears more. */
export const DEBT_PIVOT = 0.8;
export const MAX_DEBT = 10;
export const debtOf = (h: Hero): number => h.sleepDebt ?? 0;

/** What the debt costs her: a few points off power and the head and hands, growing with the stacks. */
export const debtPenalty = (stacks: number): Penalty => pen(Math.round(stacks / 2.5), 0, Math.floor(stacks / 3), Math.floor(stacks / 3), Math.floor(stacks / 5));

/**
 * One night's sleep at this realised quality (0..1, after the lab's help) changes her debt. Poor beds add stacks, the worse
 * the more; good ones take them off, the better the more. `fraction` is how much of a full night she got. Returns the change.
 */
export function settleDebt(h: Hero, quality: number, fraction: number): number {
  const before = debtOf(h);
  const delta = quality < DEBT_PIVOT ? (DEBT_PIVOT - quality) * 8 * fraction : -(quality - DEBT_PIVOT) * 12 * fraction;
  h.sleepDebt = clamp(before + delta, 0, MAX_DEBT);
  return h.sleepDebt - before;
}

const KEYS = ['power', 'muscle', 'reflex', 'hack', 'charm'] as const;

/** What she is losing at these levels, after the lab's softening. */
export function penaltyFor(h: Hero, l: Owned): Penalty {
  const hungerSoft = clamp(1 - perk(l, 'hungerSoft') / 100, 0.2, 1);
  const sleepSoft = clamp(1 - perk(l, 'sleepSoft') / 100, 0.2, 1);
  const a = hungerPenalty(hungerSteps(hungerOf(h)));
  const b = SLEEP_PENALTY[sleepTier(sleepOf(h))];
  const d = debtPenalty(debtOf(h));
  const out = { ...NONE };
  for (const k of KEYS) out[k] = Math.round(a[k] * hungerSoft) + Math.round((b[k] + d[k]) * sleepSoft);
  return out;
}

/**
 * Put the penalty on her: stats come down by the difference between what she is carrying now and what she should be. A stat
 * never goes below 1, and what was never taken is never given back.
 */
export function refreshFx(w: Pick<World, 'hero' | 'legacy'>): void {
  const h = w.hero;
  const want = penaltyFor(h, w.legacy);
  const have = h.needsFx ?? NONE;
  const next = { ...have, power: want.power };
  for (const k of ['muscle', 'reflex', 'hack', 'charm'] as const) {
    const base = h[k] + have[k];
    next[k] = Math.min(want[k], Math.max(0, base - 1));
    h[k] = base - next[k];
  }
  h.needsFx = next;
}

// ===================================================================== time passing

/** Let `minutes` of world time wear on her. Hunger and sleep never go below zero; the caller decides what zero means. */
export function wearDown(w: Pick<World, 'hero' | 'legacy'>, minutes: number, asleep = false): void {
  if (minutes <= 0) return;
  const h = w.hero;
  h.hunger = Math.max(0, hungerOf(h) - hungerRate(w.legacy) * minutes * (asleep ? HUNGER_WHILE_ASLEEP : 1));
  if (!asleep) h.sleep = Math.max(0, sleepOf(h) - sleepRate(w.legacy) * minutes);
}

/** Hours she can sleep before hunger wakes her, from here. At least one: she is never woken before she has closed her eyes. */
export function hoursBeforeHungerWakes(w: Pick<World, 'hero' | 'legacy'>): number {
  const perHour = hungerRate(w.legacy) * 60 * HUNGER_WHILE_ASLEEP;
  return Math.max(1, Math.floor((hungerOf(w.hero) - HUNGER_WAKE) / perHour));
}
