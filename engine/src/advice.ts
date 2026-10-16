import type { Ask, AskKind, AskOption, Ctx, GoalSpec, World } from './types';
import type { EventData } from './events';
import { clamp } from './candidate';
import { cool, cooling, goalById } from './mind';
import { adoptSpec } from './goals';

/**
 * Asking the lab.
 *
 * Now and then, at a fork in the road, Blackbird stops and asks the lab tech what to do: save up for that, raid this or
 * work the street, kick in that door. The question sits in `mind.ask` for a few beats. The player can answer it
 * (`advise`, in run.ts); if nobody does, she decides for herself, going with `lean`, which is what she'd have done had
 * she not asked. So the headless sim, offline catch-up and a player who isn't watching all play the same game as before,
 * just a few beats later.
 *
 * Questions come from the places where the mind already makes these choices (goals.ts). Each of them hands over a
 * builder, and `maybeAsk` decides whether she asks at all: not while a question is open, not too soon after the last
 * one, and not if she's the sort who never asks. When she doesn't, the caller carries on and does it herself.
 */

/** How many beats a question waits before she answers it herself. */
export const ASK_BEATS = 10;
/** She doesn't ask in the first few beats of a night. */
const FIRST_ASK = 8;
/** Beats between one question and the next. */
export const ASK_GAP = 45;

/** How readily she asks, 0.12..0.85. Chatty, loyal girls check in; vain, impulsive ones tell the lab what she's doing. */
export function askiness(w: World): number {
  const t = w.hero.personality.traits;
  return clamp(0.45 + 0.5 * (t.sociable - 0.5) + 0.4 * (t.loyalty - 0.5) - 0.4 * (t.vanity - 0.5) - 0.3 * (t.impulsive - 0.5), 0.12, 0.85);
}

/** Is she waiting to hear back? While she is, nothing else should be deciding the thing she asked about. */
export const waiting = (w: World): boolean => w.mind.ask !== undefined;

export interface Proposal {
  question: string;
  options: AskOption[];
  /** The option she goes with if the lab says nothing. */
  lean: string;
  /** The goal she's asking about, if it is one. */
  about?: number;
  /** What the log needs to say it: item, place, amount. */
  data?: EventData;
}

/**
 * Open a question, if she's the asking kind right now. `build` is only called if she is. Returns false when she
 * doesn't ask, and the caller does what it would have done anyway.
 */
export function maybeAsk(c: Ctx, kind: AskKind, build: () => Proposal | null): boolean {
  const { w, rng } = c;
  // She has only just walked in: nothing to ask about yet, and a night should start with her already on the move.
  if (w.over || w.beat < FIRST_ASK || w.mind.ask || cooling(w, 'advice') || !rng.chance(askiness(w))) return false;
  const p = build();
  if (!p || p.options.length < 2 || !p.options.some((o) => o.id === p.lean)) return false;
  const adv = (w.mind.advice ??= { asked: 0, taken: 0, lapsed: 0, nextId: 1 });
  const ask: Ask = { id: adv.nextId++, kind, asked: w.beat, until: w.beat + ASK_BEATS, question: p.question, options: p.options, lean: p.lean, about: p.about, data: p.data };
  w.mind.ask = ask;
  adv.asked++;
  cool(w, 'advice', ASK_GAP);
  c.emit('advice_ask', 'mixed', { variant: kind, ...p.data, question: p.question, options: p.options.length });
  return true;
}

/**
 * The question is answered, by the lab or by her. Tells the log, puts off what she was told to put off, takes on what she
 * was told to take on. A question about a goal that has since gone away is answered and forgotten.
 */
export function resolveAsk(c: Ctx, pick: string, by: 'lab' | 'self'): boolean {
  const { w } = c;
  const ask = w.mind.ask;
  const opt = ask?.options.find((o) => o.id === pick);
  if (!ask || !opt) return false;
  w.mind.ask = undefined;
  const adv = (w.mind.advice ??= { asked: 0, taken: 0, lapsed: 0, nextId: 1 });
  if (by === 'lab') adv.taken++;
  else adv.lapsed++;
  c.emit(by === 'lab' ? 'advice_taken' : 'advice_lapsed', by === 'lab' ? 'good' : 'mixed', { ...ask.data, variant: ask.kind, pick: opt.id, label: opt.label });
  if (ask.about !== undefined && !goalById(w, ask.about)) return true;
  for (const [key, beats] of Object.entries(opt.cool ?? {})) cool(w, key, beats);
  if (opt.spec) adoptSpec(c, withBackup(opt.spec, by === 'lab'));
  return true;
}

/** Somebody to back her up makes her want it a little more. */
const withBackup = (s: GoalSpec, backed: boolean): GoalSpec => (backed ? { ...s, desire: clamp(s.desire + 0.1, 0.1, 1) } : s);

/** Each beat: if nobody has answered in time, she goes with her gut. */
export function adviceTick(c: Ctx): void {
  const ask = c.w.mind.ask;
  if (ask && c.w.beat >= ask.until) resolveAsk(c, ask.lean, 'self');
}
