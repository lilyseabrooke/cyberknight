/**
 * Progressions, harmonic rhythm, cadences, mode and pedal (docs/MUSIC_PLAN.md §8.2). Phase 2 plays one progression as a fixed
 * 8-bar loop with a turnaround in its last bar; sections choosing progressions arrive with form in phase 3.
 */
import { Gate } from './axes/state';
import type { MacroValues } from './axes/macros';
import { buildChord, pc, type ChordSpec } from './theory';
import type { HarmonyBar, ModeName } from './types';

const D = (degree: number): ChordSpec => ({ degree });
const FLAT_II: ChordSpec = { semis: 1, quality: 'maj', numeral: '♭II' };
const HARMONIC_V: ChordSpec = { semis: 7, quality: 'maj', numeral: 'V' };

export type BankId = 'rest' | 'tense' | 'peak';

/** The progression banks, as scale degrees (0 = i). Degrees take their quality from the mode, so a shift to Phrygian darkens them. */
export const BANKS: Record<BankId, { name: string; chords: ChordSpec[] }[]> = {
  rest: [
    { name: 'i–VI–III–VII', chords: [D(0), D(5), D(2), D(6)] },
    { name: 'i–iv–VI–v', chords: [D(0), D(3), D(5), D(4)] },
  ],
  tense: [
    { name: 'i–♭II pedal', chords: [D(0), FLAT_II, D(0), FLAT_II] },
    { name: 'i–♭VI–♭II–i', chords: [D(0), D(5), FLAT_II, D(0)] },
  ],
  peak: [
    { name: 'i–VI–VII–i', chords: [D(0), D(5), D(6), D(0)] },
    { name: 'i–VII–VI–V', chords: [D(0), D(6), D(5), HARMONIC_V] },
  ],
};

export const LOOP_BARS = 8;

/** Chooses the mode, the pedal and the tension notes from the macros, with hysteresis. */
export class HarmonyState {
  private readonly phrygian = new Gate(0.6, 0.05);
  private readonly pedal = new Gate(0.8, 0.04);

  constructor(public chords: ChordSpec[]) {}

  bar(index: number, key: number, m: MacroValues): HarmonyBar {
    const dark = m.darkness ?? 0;
    const mode: ModeName = this.phrygian.update(dark) ? 'phrygian' : 'aeolian';
    const pos = index % LOOP_BARS;
    const spec = this.chords[pos % this.chords.length]!;
    const chord = buildChord(spec, key, mode);
    const segments = [{ from: 0, to: 16, chord }];
    // The loop's last bar turns around into the top: ♭VII -> i, or v -> i if the bar is already on VII, or ♭II -> i under danger.
    if (pos === LOOP_BARS - 1) {
      const next = buildChord(this.chords[0]!, key, mode);
      const dark2 = dark > 0.6;
      let cad: ChordSpec = dark2 ? FLAT_II : D(6);
      if (!dark2 && chord.root === buildChord(D(6), key, mode).root) cad = D(4);
      const turn = buildChord(cad, key, mode);
      // Only split when the cadence chord is something new: not the bar's own chord, not the chord the loop lands on.
      if (turn.root !== chord.root && turn.root !== next.root) segments.splice(0, 1, { from: 0, to: 8, chord }, { from: 8, to: 16, chord: turn });
    }
    return {
      key: pc(key),
      mode,
      segments,
      pedal: this.pedal.update(dark),
      // The ♭2 and ♭5 are allowed as rubs once danger is up.
      tension: dark > 0.5 ? [pc(key + 1), pc(key + 6)] : [],
    };
  }
}

export const chordAt = (h: HarmonyBar, step: number) => (h.segments.find((s) => step >= s.from && step < s.to) ?? h.segments[0]!).chord;
