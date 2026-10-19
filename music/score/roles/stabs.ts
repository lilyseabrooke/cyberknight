/**
 * Darksynth chord stabs (docs/MUSIC_PLAN.md §7.5). They either lock to the bass's accents (rhythmic unison with the riff) or answer
 * in its gaps; low syncopation locks, high syncopation answers. Thirds go once the drive is up: power chords under distortion.
 */
import type { MacroValues } from '../axes/macros';
import { Gate } from '../axes/state';
import { chordAt } from '../harmony';
import { fifthOf, pc } from '../theory';
import type { HarmonyBar, NoteEvent } from '../types';
import { voice, type Window } from '../voicing';

export const STAB_WINDOW: Window = { lo: 48, hi: 67 };

export type StabFeel = 'lock' | 'answer';

/** Steps the stabs answer on, in order of preference: syncopated, and spread across the bar. */
const ANSWER_STEPS = [3, 11, 6, 14, 7, 15, 10, 2];

export class StabPart {
  private prev: number[] | null = null;
  private readonly answer = new Gate(0.5, 0.05);
  private readonly power = new Gate(0.6, 0.05);
  /** Pinned by hand in MusicLab; otherwise syncopation decides. */
  forced: StabFeel | null = null;
  feel: StabFeel = 'lock';

  render(h: HarmonyBar, m: MacroValues, bass: readonly NoteEvent[]): NoteEvent[] {
    const auto: StabFeel = this.answer.update(m.syncopation ?? 0) ? 'answer' : 'lock';
    this.feel = this.forced ?? auto;
    const power = this.power.update(m.aggression ?? 0);
    const count = 2 + Math.round(2 * (m.density ?? 0));
    const onsets = new Set(bass.map((n) => n.t));
    // Where the bass is sounding: answering stabs go where it isn't.
    const sounding = (step: number): boolean => bass.some((n) => step >= n.t && step < n.t + n.dur);

    let steps: number[];
    if (this.feel === 'lock') {
      const accents = bass.filter((n) => n.accent).map((n) => n.t);
      const strong = bass.map((n) => n.t).sort((a, b) => (a % 4) - (b % 4) || a - b);
      steps = [...new Set([...accents, ...strong])].slice(0, count);
      if (!bass.length) steps = [0, 8];
    } else {
      steps = ANSWER_STEPS.filter((s) => !onsets.has(s) && !sounding(s)).slice(0, count);
      if (!steps.length) steps = ANSWER_STEPS.filter((s) => !onsets.has(s)).slice(0, Math.min(2, count));
    }

    const out: NoteEvent[] = [];
    for (const t of steps.sort((a, b) => a - b)) {
      const chord = chordAt(h, t);
      // A power chord keeps the chord's own fifth (a ♭5 on a diminished chord), so it stays in key.
      const pcs = power ? [chord.root, pc(chord.root + fifthOf(chord)), chord.root] : chord.tones;
      const notes = voice(pcs, this.prev, STAB_WINDOW);
      this.prev = notes;
      for (const note of notes) out.push({ t, role: 'stabs', note, vel: t % 4 === 0 ? 0.95 : 0.85, dur: 1.5 });
    }
    return out;
  }
}
