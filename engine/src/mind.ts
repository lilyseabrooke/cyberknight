import type { Goal, Id, Mind, World } from './types';
import { clamp } from './candidate';

/** Data operations on Blackbird's goals. The thinking lives in goals.ts. */

export const MAX_DEPTH = 5;

export const newMind = (): Mind => ({
  goals: [],
  nextId: 1,
  wares: {},
  lastSeen: {},
  earn: {},
  drive: [],
  hops: {},
  cooldown: {},
  focus: null,
  tally: { done: 0, dropped: 0, revised: 0, delayed: 0 },
  bounties: {},
  known: {},
  contracts: [],
  fame: {},
});

export const goalById = (w: World, id: number | null): Goal | undefined => (id === null ? undefined : w.mind.goals.find((g) => g.id === id));
export const childrenOf = (w: World, g: Goal): Goal[] => w.mind.goals.filter((x) => x.parent === g.id);
export const isLeaf = (w: World, g: Goal): boolean => !w.mind.goals.some((x) => x.parent === g.id);
export const topLevel = (w: World): Goal[] => w.mind.goals.filter((g) => g.parent === null);

export function depth(w: World, g: Goal): number {
  let d = 0;
  for (let p = goalById(w, g.parent); p; p = goalById(w, p.parent)) d++;
  return d;
}

export const hasGoal = (w: World, kind: Goal['kind'], subject?: string): boolean =>
  w.mind.goals.some((g) => g.kind === kind && (subject === undefined || g.npc === subject || g.ware === subject || g.game === subject || g.loc === subject));

/**
 * Cooldowns come in two kinds. `cool` counts beats, for pacing her own decisions ("don't ask again for 25 more choices").
 * `coolFor` counts world minutes, for anything that is true of the world while time passes (a door she has written off, a job
 * she has put down). A beat is anything from a few seconds to a night's sleep, so the two don't convert.
 */
export const cooling = (w: World, key: string): boolean => (w.mind.cooldown[key] ?? 0) > w.beat || (w.mind.coolUntil?.[key] ?? 0) > w.clock;
export const cool = (w: World, key: string, beats: number): void => {
  w.mind.cooldown[key] = w.beat + beats;
};
export const coolFor = (w: World, key: string, minutes: number): void => {
  (w.mind.coolUntil ??= {})[key] = w.clock + minutes;
};

/** Delayed goals (and everything beneath them) are on hold. */
export function isHeld(w: World, g: Goal): boolean {
  for (let x: Goal | undefined = g; x; x = goalById(w, x.parent)) if (x.delayUntil > w.beat) return true;
  return false;
}

/** The subject a goal is about, for deduping and cooldowns. */
export const subjectOf = (g: Goal): string => g.mission ?? g.npc ?? g.ware ?? g.game ?? g.loc ?? String(g.amount ?? '');

/** How much she wants it now, 0..1: her own desire, or her parent's if she's only doing this for them. Frustration saps it. */
export function priority(w: World, g: Goal): number {
  const parent = goalById(w, g.parent);
  const base = parent ? Math.max(g.desire, priority(w, parent) * 0.92) : g.desire;
  return clamp(base * (1 - 0.6 * g.frustration), 0, 1);
}

/** How many separate ambitions she'll juggle before she starts dropping things. Sharper heads handle more; impulsive ones overpromise. */
export function capacity(w: World): number {
  const h = w.hero;
  return clamp(Math.round(3 + h.competence * 2 + 1.2 * (h.personality.traits.impulsive - 0.5)), 2, 6);
}

/** How strongly her goals sway the next choice. Competence and a deliberate mind keep her on task. */
export function focusFactor(w: World): number {
  const h = w.hero;
  return clamp(0.62 + 0.7 * h.competence - 0.5 * (h.personality.traits.impulsive - 0.5), 0.35, 1.3);
}

const NOVELTY_HALF_LIFE = 4;

/** How interesting a place still is: untouched is 1, and every thing she does there wears it down. */
export const interest = (w: World, id: string): number => 1 / (1 + (w.locations[id]?.doings ?? 0) / NOVELTY_HALF_LIFE);
