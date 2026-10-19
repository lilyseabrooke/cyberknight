/**
 * The character bass (docs/MUSIC_PLAN.md §7.2). A riff is material: a seed and a few choices made once. Each bar it is rendered
 * against the current macros by threshold sampling: every step of the riff owns fixed random numbers, and a note sounds when its
 * number falls under the step's probability. Moving aggression only moves the probabilities, so notes appear and vanish at stable
 * places and the riff stays recognisably itself from locked to feral.
 */
import type { MacroValues } from '../axes/macros';
import { unit } from '../rng';
import { STEPS_PER_BAR, type NoteEvent } from '../types';

/** Bars before a riff repeats. */
export const RIFF_BARS = 2;

/** Where a locked bass sits: the offbeat 8ths, every 8th, or on the kick. */
export type LockedFeel = 'offbeat' | 'eighths' | 'onKick';

export interface Riff {
  seed: number;
  locked: LockedFeel;
}

export function newRiff(seed: number): Riff {
  const u = unit(seed, 0x10c);
  return { seed, locked: u < 0.5 ? 'offbeat' : u < 0.8 ? 'eighths' : 'onKick' };
}

const steps = (on: number[], w = 1): number[] => Array.from({ length: STEPS_PER_BAR }, (_, i) => (on.includes(i) ? w : 0));

export const KICK_STEPS = [0, 4, 8, 12];

const LOCKED: Record<LockedFeel, number[]> = {
  offbeat: steps([2, 6, 10, 14]),
  eighths: steps([0, 2, 4, 6, 8, 10, 12, 14]),
  onKick: steps(KICK_STEPS),
};

/** The busy templates aggression blends toward. Weights are per-step probabilities before density scaling. */
const TEMPLATES = {
  /** Three 16ths a beat, skipping the kick. */
  rolling: Array.from({ length: STEPS_PER_BAR }, (_, i) => (i % 4 === 0 ? 0 : 1)),
  /** 3-3-2 stabs. */
  stab: steps([0, 3, 6, 8, 11, 14]).map((w, i) => (w ? (i % 4 === 0 ? 0.7 : 1) : 0.08)),
  /** Dense with holes; the riff's seed decides where the holes go. */
  acid: Array.from({ length: STEPS_PER_BAR }, (_, i) => (i % 4 === 0 ? 0.45 : 0.9)),
  /** Off-grid and sparse, for dread. */
  broken: steps([0, 3, 7, 10, 13], 0.9).map((w) => w || 0.05),
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The probability of a note on each step, for these macros. At aggression 0 it is exactly the locked feel. */
export function stepProbabilities(riff: Riff, m: MacroValues, bar: number): number[] {
  const a = m.aggression ?? 0;
  const s = m.syncopation ?? 0;
  const dark = m.darkness ?? 0;
  const dens = m.density ?? 0;
  const w = {
    rolling: a * (1 - s),
    stab: s * (1 - 0.8 * a),
    acid: a * s,
    broken: 0.8 * dark * (1 - dens),
  };
  const total = w.rolling + w.stab + w.acid + w.broken || 1;
  const locked = LOCKED[riff.locked];
  return locked.map((l, i) => {
    let busy = 0;
    for (const k of Object.keys(w) as (keyof typeof w)[]) busy += (w[k] / total) * TEMPLATES[k][i]!;
    // The acid template's holes move with the riff, not the bar.
    if (w.acid > 0 && unit(riff.seed, 0xac1d, bar % RIFF_BARS, i) < 0.22) busy *= 1 - w.acid / total;
    // Either the locked spine or the busy part can place a note (a probabilistic OR), so the middle of a sweep is never sparser
    // than either end. The spine holds on until aggression is well up (1 - a^2), so syncopation arrives before the roots leave.
    // Density thins the busy part a little.
    const spine = (1 - a * a) * l;
    const wild = a * busy * (0.7 + 0.3 * dens);
    return clamp01(1 - (1 - spine) * (1 - wild));
  });
}

/** Semitones above the bar's root, with their weight at full aggression (scaled by aggression; the root is always 1). */
const VOCAB: { iv: number; w: (a: number, dark: number) => number }[] = [
  { iv: 0, w: () => 1 },
  { iv: 12, w: (a) => 0.8 * a },
  { iv: 7, w: (a) => 0.5 * a },
  { iv: 10, w: (a) => 0.35 * a },
  { iv: 1, w: (a, dark) => 0.5 * a * dark },
];

function pickInterval(u: number, a: number, dark: number): number {
  const ws = VOCAB.map((v) => v.w(a, dark));
  const total = ws.reduce((x, y) => x + y, 0);
  let acc = 0;
  for (let i = 0; i < VOCAB.length; i++) {
    acc += ws[i]! / total;
    if (u < acc) return VOCAB[i]!.iv;
  }
  return 0;
}

/** One bar of the riff. `root` is the bar's root as a MIDI note in the bass register. */
export function renderBass(riff: Riff, m: MacroValues, bar: number, root: number): NoteEvent[] {
  const a = m.aggression ?? 0;
  const dark = m.darkness ?? 0;
  const rb = bar % RIFF_BARS;
  const probs = stepProbabilities(riff, m, bar);
  const on: number[] = [];
  for (let i = 0; i < STEPS_PER_BAR; i++) if (unit(riff.seed, 0x5e7, rb, i) < probs[i]!) on.push(i);

  const notes: NoteEvent[] = on.map((t, k) => {
    // The first note of a riff bar, and anything on the downbeat, anchors on the root.
    const anchor = k === 0 || t === 0;
    const iv = anchor ? 0 : pickInterval(unit(riff.seed, 0x917c, rb, t), a, dark);
    const accent = a > 0 && unit(riff.seed, 0xacc, rb, t) < 0.35 * a;
    return { t, role: 'bass', note: root + iv, vel: accent ? 1 : 0.8, dur: 0, accent };
  });

  // Gate lengths: a tidy 50% when locked; mixed shorts and accented longs as it gets aggressive. Slides tie a note into the next.
  for (let k = 0; k < notes.length; k++) {
    const n = notes[k]!;
    const gap = (notes[k + 1]?.t ?? STEPS_PER_BAR) - n.t;
    const g = unit(riff.seed, 0x6a7e, rb, n.t);
    const gate = (1 - a) * 0.5 + a * (n.accent ? 0.6 + 0.3 * g : 0.15 + 0.6 * g);
    n.dur = Math.max(0.25, Math.min(gap, gap * gate));
    const next = notes[k + 1];
    if (next && a > 0 && unit(riff.seed, 0x511d, rb, next.t) < 0.35 * a) {
      next.slide = true;
      n.dur = gap;
    }
  }
  return notes;
}
