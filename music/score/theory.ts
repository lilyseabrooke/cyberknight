/** Notes, modes and chords (docs/MUSIC_PLAN.md §8). */
import type { Chord, ModeName, Quality } from './types';

export const midiToHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const pc = (note: number): number => ((note % 12) + 12) % 12;

export const noteName = (note: number): string => `${NOTE_NAMES[pc(note)]}${Math.floor(note / 12) - 1}`;

/** Semitones above the root. */
export const MODES: Record<ModeName, readonly number[]> = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

export const scalePcs = (key: number, mode: ModeName): number[] => MODES[mode].map((s) => pc(key + s));

export const inScale = (note: number, key: number, mode: ModeName): boolean => scalePcs(key, mode).includes(pc(note));

/** Move a note by octaves until it sits in [lo, hi]. The range must span at least an octave. */
export function foldInto(note: number, lo: number, hi: number): number {
  let n = note;
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}

/** E1 and E2: where the sub lives (41-82 Hz). */
export const SUB_LO = 28;
export const SUB_HI = 40;

const SHAPES: Record<Quality, number[]> = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  dim: [0, 3, 6],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  power: [0, 7],
};

export function qualityOf(intervals: number[]): Quality {
  const key = intervals.join(',');
  for (const [q, shape] of Object.entries(SHAPES) as [Quality, number[]][]) if (shape.join(',') === key) return q;
  return 'min';
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * A chord as the progression banks write it: a scale degree (its quality comes from the mode, so a modal shift re-colours it), or a
 * chord borrowed by semitones above the tonic with an explicit quality (♭II, the harmonic-minor V).
 */
export type ChordSpec = { degree: number } | { semis: number; quality: Quality; numeral: string };

export function buildChord(spec: ChordSpec, key: number, mode: ModeName): Chord {
  if ('degree' in spec) {
    const scale = MODES[mode];
    const at = (k: number): number => scale[(spec.degree + k) % 7]! + 12 * Math.floor((spec.degree + k) / 7);
    const root = at(0);
    const intervals = [0, at(2) - root, at(4) - root];
    const quality = qualityOf(intervals);
    const n = NUMERALS[spec.degree]!;
    const label = quality === 'maj' ? n : quality === 'dim' ? `${n.toLowerCase()}°` : n.toLowerCase();
    return { root: pc(key + root), quality, tones: intervals.map((i) => pc(key + root + i)), label };
  }
  const root = pc(key + spec.semis);
  return { root, quality: spec.quality, tones: SHAPES[spec.quality].map((i) => pc(root + i)), label: spec.numeral };
}

/** The interval from a chord's root up to its fifth (a ♭5 for diminished chords). */
export const fifthOf = (c: Chord): number => (c.quality === 'dim' ? 6 : 7);
