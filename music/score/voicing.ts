/**
 * Voice leading (docs/MUSIC_PLAN.md §8.3): turn a chord's pitch classes into notes inside a role's register window, moving as little
 * as possible from the previous voicing, with no muddy close intervals down low.
 */
import { pc } from './theory';

export interface Window {
  lo: number;
  hi: number;
}

/** Below this (E3), neighbouring notes must be at least a fifth apart. */
export const LOW_INTERVAL_FLOOR = 52;
const LOW_INTERVAL_MIN = 7;
/** The widest a voicing may spread. */
const MAX_SPAN = 24;

/** Total semitone movement from one voicing to the next. Equal sizes pair voice by voice; otherwise each note to its nearest. */
export function movement(prev: readonly number[], next: readonly number[]): number {
  if (prev.length === next.length) return next.reduce((s, n, i) => s + Math.abs(n - prev[i]!), 0);
  return next.reduce((s, n) => s + Math.min(...prev.map((p) => Math.abs(n - p))), 0);
}

export function respectsLowLimit(notes: readonly number[]): boolean {
  for (let i = 1; i < notes.length; i++) if (notes[i - 1]! < LOW_INTERVAL_FLOOR && notes[i]! - notes[i - 1]! < LOW_INTERVAL_MIN) return false;
  return true;
}

/**
 * Voice `pcs` (repeats allowed: a doubled root takes another octave) in `w`. With a previous voicing, the smallest total movement
 * wins; without one, the voicing nearest the middle of the window. Ties go to the closer (narrower) voicing.
 */
export function voice(pcs: readonly number[], prev: readonly number[] | null, w: Window): number[] {
  const options = pcs.map((p) => {
    const out: number[] = [];
    for (let n = w.lo; n <= w.hi; n++) if (pc(n) === pc(p)) out.push(n);
    return out;
  });
  const mid = (w.lo + w.hi) / 2;
  let best: number[] | null = null;
  let bestCost = Infinity;
  const pick: number[] = [];
  const walk = (i: number): void => {
    if (i === options.length) {
      const notes = [...pick].sort((a, b) => a - b);
      for (let k = 1; k < notes.length; k++) if (notes[k] === notes[k - 1]) return;
      if (notes[notes.length - 1]! - notes[0]! > MAX_SPAN || !respectsLowLimit(notes)) return;
      const spread = notes[notes.length - 1]! - notes[0]!;
      const centre = notes.reduce((s, n) => s + n, 0) / notes.length;
      const cost = (prev?.length ? movement(prev, notes) : Math.abs(centre - mid) * notes.length) + spread * 0.01;
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
      return;
    }
    for (const n of options[i]!) {
      pick.push(n);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  if (best) return best;
  // A doubled note that can't fit (a power chord's octave on a high root) is dropped rather than the chord.
  const unique = [...new Set(pcs.map(pc))];
  if (unique.length < pcs.length) return voice(unique, prev, w);
  throw new Error(`no voicing of [${pcs.join(',')}] fits ${w.lo}-${w.hi}`);
}
