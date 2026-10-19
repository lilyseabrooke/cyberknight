/** The kick and the sub (docs/MUSIC_PLAN.md §7.1, §7.3): the floor everything else stands on. */
import type { MacroValues } from '../axes/macros';
import { Gate } from '../axes/state';
import { SUB_HI, SUB_LO, foldInto } from '../theory';
import type { HarmonyBar, NoteEvent } from '../types';

export type KickFeel = 'half' | 'four' | 'four+';

/** Picks the kick pattern family, with hysteresis so a value at the edge doesn't flip it every bar. */
export class KickChooser {
  private readonly half = new Gate(0.42, 0.05);
  private readonly plus = new Gate(0.7, 0.05);

  choose(m: MacroValues): KickFeel {
    const dread = (m.darkness ?? 0) * (1 - (m.density ?? 0));
    if (this.half.update(dread)) return 'half';
    if (this.plus.update(m.drive ?? 0)) return 'four+';
    return 'four';
  }
}

/** The kick is tuned near the key's tonic, low, so it sits in tune with the sub without changing pitch at every chord. */
export const kickNote = (key: number): number => foldInto(28 + ((key - 4 + 12) % 12), 28, 39);

export function renderKick(feel: KickFeel, key: number): NoteEvent[] {
  const note = kickNote(key);
  const hit = (t: number, vel: number): NoteEvent => ({ t, role: 'kick', note, vel, dur: 1 });
  if (feel === 'half') return [hit(0, 1), hit(8, 0.9)];
  const four = [hit(0, 1), hit(4, 0.95), hit(8, 0.97), hit(12, 0.95)];
  if (feel === 'four') return four;
  return [...four, hit(7, 0.45), hit(15, 0.55)].sort((x, y) => x.t - y.t);
}

/**
 * The sub holds each chord's root (or the tonic under a pedal) for as long as the chord lasts, so a repeated root ties into one long
 * clean tone; the kick's sidechain duck gives it its pulse. It never leaves E1-E2.
 */
export function renderSub(h: HarmonyBar): NoteEvent[] {
  return h.segments.map((s) => ({
    t: s.from,
    role: 'sub' as const,
    note: foldInto(SUB_LO + (((h.pedal ? h.key : s.chord.root) - SUB_LO) % 12 + 12) % 12, SUB_LO, SUB_HI),
    vel: 1,
    dur: s.to - s.from,
  }));
}
