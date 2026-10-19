/** The beds: the pad and the drone (docs/MUSIC_PLAN.md §7.4, §7.13). */
import type { MacroValues } from '../axes/macros';
import { Gate } from '../axes/state';
import { unit } from '../rng';
import { fifthOf, foldInto, pc, scalePcs } from '../theory';
import type { Chord, HarmonyBar, NoteEvent } from '../types';
import { voice, type Window } from '../voicing';

export const PAD_WINDOW: Window = { lo: 48, hi: 72 };

/** How the pad articulates its chords. Part of the pad's material: chosen once per seed. */
export type PadRhythm = 'held' | 'swell' | 'reartic';

export const padRhythmFor = (seed: number): PadRhythm => {
  const u = unit(seed, 0x9ad);
  return u < 0.45 ? 'held' : u < 0.8 ? 'swell' : 'reartic';
};

export type PadShape = 'add9' | 'full' | 'thin';

/**
 * What the pad voices: add9 when it's calm (the ninth is the scale's next note above the root, so it stays in key), a full triad
 * most of the time, and when it's dark an open fifth under a rub held on the key's ♭2: the fifth moves with the chords while the rub
 * stays put, a sustained unease rather than the whole pad lurching in parallel.
 */
export function padPcs(chord: Chord, shape: PadShape, scale: readonly number[] = [], key = chord.root): { pcs: number[]; rub?: number } {
  const [r, third, fifth] = chord.tones;
  if (shape === 'thin' || chord.tones.length < 3) {
    const rub = pc(key + 1);
    return { pcs: [r!, pc(r! + fifthOf(chord)), rub], rub };
  }
  if (shape === 'add9') {
    const ninth = [1, 2].map((d) => pc(r! + d)).find((p) => scale.includes(p));
    if (ninth !== undefined) return { pcs: [r!, third!, fifth!, ninth] };
  }
  return { pcs: [r!, third!, fifth!, r!] };
}

export class PadPart {
  private prev: number[] | null = null;
  private readonly calm = new Gate(0.3, 0.04, true);
  private readonly dark = new Gate(0.72, 0.04);

  constructor(public rhythm: PadRhythm) {}

  render(h: HarmonyBar, m: MacroValues): NoteEvent[] {
    const d = m.darkness ?? 0;
    const calm = !this.calm.update(d);
    const shape: PadShape = this.dark.update(d) ? 'thin' : calm ? 'add9' : 'full';
    const out: NoteEvent[] = [];
    const scale = scalePcs(h.key, h.mode);
    for (const s of h.segments) {
      const { pcs, rub } = padPcs(s.chord, shape, scale, h.key);
      const notes = voice(pcs, this.prev, PAD_WINDOW);
      this.prev = notes;
      const len = s.to - s.from;
      const hits: { t: number; dur: number; vel: number }[] =
        this.rhythm === 'held'
          ? [{ t: s.from, dur: len, vel: 0.8 }]
          : this.rhythm === 'swell'
            ? [{ t: s.from, dur: Math.max(2, len - 2), vel: 0.8 }]
            : s.to - 2 > s.from + 4
              ? [{ t: s.from, dur: len - 2.5, vel: 0.8 }, { t: s.to - 2, dur: 2, vel: 0.65 }]
              : [{ t: s.from, dur: len, vel: 0.8 }];
      // The rub plays as an ordinary note where the scale has it, as a tagged tension where the bar allows one, and not at all otherwise.
      const rubIs = rub === undefined || scale.includes(rub) ? 'plain' : h.tension.includes(rub) ? 'tension' : 'drop';
      for (const hit of hits) {
        for (const note of notes) {
          const isRub = rub !== undefined && pc(note) === rub;
          if (isRub && rubIs === 'drop') continue;
          const n: NoteEvent = { t: hit.t, role: 'pad', note, vel: hit.vel, dur: hit.dur };
          if (isRub && rubIs === 'tension') n.tension = true;
          out.push(n);
        }
      }
    }
    return out;
  }
}

/** The drone: the tonic, held under everything (its patch adds the fifth). It ties bar to bar. */
export const renderDrone = (h: HarmonyBar): NoteEvent[] => [{ t: 0, role: 'drone', note: foldInto(40 + pc(h.key - 4), 40, 51), vel: 0.9, dur: 16 }];
