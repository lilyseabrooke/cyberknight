/** A pool of prebuilt voices for a polyphonic patch (docs/MUSIC_PLAN.md §6.2). No node churn per note. */
import type { NoteEvent, Patch } from '../score/types';
import { allocate } from './alloc';
import { MonoVoice } from './voice';

export class VoicePool {
  private readonly voices: MonoVoice[];
  private readonly started: number[];

  constructor(ctx: BaseAudioContext, patch: Patch, dest: AudioNode, sends: { reverb?: AudioNode }) {
    this.voices = Array.from({ length: patch.poly }, () => new MonoVoice(ctx, patch, dest, sends));
    this.started = this.voices.map(() => -Infinity);
  }

  setParams(values: Record<string, number>, t: number, ramp: number): void {
    for (const v of this.voices) v.setParams(values, t, ramp);
  }

  /** Play every note that starts at `t` together, so held common tones tie and the rest re-attack on fresh voices. */
  playChord(notes: readonly NoteEvent[], t: number, stepDur: number): void {
    const slots = this.voices.map((v, i) => ({ note: v.note, endsAt: v.endsAt(), quietAt: v.quietAt(), startedAt: this.started[i]! }));
    const plan = allocate(slots, notes.map((n) => n.note ?? 60), t);
    const used = new Set(plan.map((a) => a.slot));
    // Anything ending now that wasn't tied releases now.
    this.voices.forEach((v, i) => {
      if (!used.has(i)) v.commit(t);
    });
    plan.forEach((a) => {
      const n = notes[a.index]!;
      this.voices[a.slot]!.play(n, t, n.dur * stepDur, a.tie, stepDur);
      if (!a.tie) this.started[a.slot] = t;
    });
  }

  commit(before = Infinity): void {
    for (const v of this.voices) v.commit(before);
  }

  stop(t: number): void {
    for (const v of this.voices) v.stop(t);
  }
}
