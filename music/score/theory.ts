/** Just enough music theory for phase 1: notes, a couple of modes and folding a note into a register. Harmony proper is phase 2. */

export const midiToHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const noteName = (note: number): string => `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;

/** Semitones above the root. */
export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
} as const;

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
