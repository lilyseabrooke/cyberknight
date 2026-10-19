/**
 * The character bass (docs/MUSIC_PLAN.md §7.2). A riff is material: a seed and a few choices made once. Each bar it is rendered
 * against the current macros by threshold sampling: every step of the riff owns fixed random numbers, and a note sounds when its
 * number falls under the step's probability. Moving aggression only moves the probabilities, so notes appear and vanish at stable
 * places and the riff stays recognisably itself from locked to feral.
 */
import type { MacroValues } from '../axes/macros';
import { chordAt } from '../harmony';
import { unit } from '../rng';
import { MODES, buildChord, fifthOf, foldInto, pc } from '../theory';
import { STEPS_PER_BAR, type Chord, type HarmonyBar, type NoteEvent } from '../types';

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

/** The bass register: E2 to D#3. Its fundamental sits above the sub's; the band split keeps the two apart. */
export const BASS_LO = 40;
export const BASS_HI = 51;

interface Choice {
  iv: number;
  w: number;
  tension?: boolean;
}

/**
 * What the bass may play over a chord, with weights at this aggression: the root always; then the octave, the chord's fifth, the
 * diatonic seventh above the root, and the ♭2 above it where the scale has one (or, over the tonic in danger, as a tagged rub).
 */
export function vocabulary(chord: Chord, h: HarmonyBar, a: number, dark: number): Choice[] {
  const scale = MODES[h.mode].map((x) => pc(h.key + x));
  const out: Choice[] = [
    { iv: 0, w: 1 },
    { iv: 12, w: 0.8 * a },
    { iv: fifthOf(chord), w: 0.5 * a },
  ];
  const deg = scale.indexOf(chord.root);
  if (deg >= 0) out.push({ iv: (scale[(deg + 6) % 7]! - chord.root + 12) % 12, w: 0.35 * a });
  const flat2 = pc(chord.root + 1);
  if (scale.includes(flat2)) out.push({ iv: 1, w: 0.5 * a * dark });
  else if (chord.root === h.key && h.tension.includes(flat2)) out.push({ iv: 1, w: 0.5 * a * dark, tension: true });
  return out;
}

function pick(u: number, choices: Choice[]): Choice {
  const total = choices.reduce((x, c) => x + c.w, 0);
  let acc = 0;
  for (const c of choices) {
    acc += c.w / total;
    if (u < acc) return c;
  }
  return choices[0]!;
}

/** The bass root for a step: the chord's, or the tonic under a pedal, folded into the bass register. */
export const bassRoot = (h: HarmonyBar, step: number): number => foldInto(BASS_LO + pc((h.pedal ? h.key : chordAt(h, step).root) - pc(BASS_LO)), BASS_LO, BASS_HI);

/** One bar of the riff over the bar's harmony. */
export function renderBass(riff: Riff, m: MacroValues, bar: number, h: HarmonyBar): NoteEvent[] {
  const a = m.aggression ?? 0;
  const dark = m.darkness ?? 0;
  const rb = bar % RIFF_BARS;
  const probs = stepProbabilities(riff, m, bar);
  const on: number[] = [];
  for (let i = 0; i < STEPS_PER_BAR; i++) if (unit(riff.seed, 0x5e7, rb, i) < probs[i]!) on.push(i);

  const notes: NoteEvent[] = on.map((t, k) => {
    // Under a pedal the bass stays on the tonic, so it speaks the tonic chord's vocabulary, whatever moves above.
    const chord = h.pedal ? buildChord({ degree: 0 }, h.key, h.mode) : chordAt(h, t);
    // The first note of a riff bar, a downbeat, and the first note over a new chord all anchor on the root.
    const prev = on[k - 1];
    const anchor = k === 0 || t === 0 || (prev !== undefined && chordAt(h, prev) !== chordAt(h, t));
    const c = anchor ? { iv: 0, w: 1 } : pick(unit(riff.seed, 0x917c, rb, t), vocabulary(chord, h, a, dark));
    const accent = a > 0 && unit(riff.seed, 0xacc, rb, t) < 0.35 * a;
    const n: NoteEvent = { t, role: 'bass', note: bassRoot(h, t) + c.iv, vel: accent ? 1 : 0.8, dur: 0, accent };
    if (c.tension) n.tension = true;
    return n;
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
