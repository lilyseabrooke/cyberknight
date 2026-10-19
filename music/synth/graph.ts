/**
 * The playable graph and the code that turns a conductor's bars into scheduled audio. It runs against any BaseAudioContext, so the
 * live engine and offline renders (scripts/music-render.ts) share every line.
 */
import type { Conductor } from '../score/conductor';
import { PATCHES } from '../score/patches';
import { STEPS_PER_BAR, type Bar, type DrumRole, type NoteEvent, type PatchedRole } from '../score/types';
import { DrumSynth } from './drums';
import { Mixer } from './mixer';
import { VoicePool } from './pool';
import { MonoVoice } from './voice';

/** How long a bar's new parameter values take to glide in. */
const PARAM_RAMP_STEPS = 2;

const isPatched = (role: string): role is PatchedRole => role in PATCHES;

export class Graph {
  readonly mixer: Mixer;
  readonly voices: Record<PatchedRole, MonoVoice | VoicePool>;
  readonly drums: DrumSynth;

  constructor(readonly ctx: BaseAudioContext, dest: AudioNode = ctx.destination) {
    this.mixer = new Mixer(ctx, dest);
    this.voices = Object.fromEntries(
      (Object.entries(PATCHES) as [PatchedRole, (typeof PATCHES)[PatchedRole]][]).map(([role, patch]) => {
        const sends = { reverb: this.mixer.sends[patch.bus] };
        const dest = this.mixer.buses[patch.bus];
        return [role, patch.poly > 1 ? new VoicePool(ctx, patch, dest, sends) : new MonoVoice(ctx, patch, dest, sends)];
      }),
    ) as Record<PatchedRole, MonoVoice | VoicePool>;
    this.drums = new DrumSynth(ctx, this.mixer.buses.drums);
  }

  /** Schedule one bar starting at `start` (context seconds). Returns the bar's length in seconds. */
  schedule(bar: Bar, start: number): number {
    const stepDur = 60 / bar.bpm / 4;
    const barDur = stepDur * STEPS_PER_BAR;

    // Parameter events in time order: bar-line values first, then any contour points later in the bar.
    const params = [...bar.params].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    for (const p of params) {
      if (!isPatched(p.role)) continue;
      this.voices[p.role].setParams({ [p.path]: p.value }, start + (p.t ?? 0) * stepDur, (p.glide ?? PARAM_RAMP_STEPS) * stepDur);
    }

    for (const t of bar.kicks) this.mixer.duck(start + t * stepDur, bar.macros.density ?? 0, stepDur);
    this.mixer.gateBeds(start, stepDur, bar.bedGate);

    const notes = [...bar.notes].sort((a, b) => a.t - b.t);
    for (const role of Object.keys(this.voices) as PatchedRole[]) {
      if (!notes.some((n) => n.role === role)) this.voices[role].commit(start);
    }
    // Poly notes that start together are played as one chord, so the pool can tie common tones.
    const chords = new Map<string, NoteEvent[]>();
    for (const n of notes) {
      const t = start + n.t * stepDur;
      if (!isPatched(n.role)) {
        this.drums.hit(n.role as DrumRole, t, n.vel, n.note, n.variant);
        continue;
      }
      const v = this.voices[n.role];
      if (v instanceof MonoVoice) v.play(n, t, n.dur * stepDur, undefined, stepDur);
      else {
        const k = `${n.role}@${n.t}`;
        chords.set(k, [...(chords.get(k) ?? []), n]);
      }
    }
    for (const group of chords.values()) (this.voices[group[0]!.role as PatchedRole] as VoicePool).playChord(group, start + group[0]!.t * stepDur, stepDur);
    return barDur;
  }

  release(t: number): void {
    for (const v of Object.values(this.voices)) v.stop(t);
  }
}

/** Live playback: a lookahead timer that renders and schedules each bar just before it is due. */
export class LiveScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  onBar?: (bar: Bar, at: number) => void;

  constructor(
    private readonly graph: Graph,
    private readonly conductor: Conductor,
    private readonly lookahead = 0.2,
  ) {}

  start(): void {
    if (this.timer) return;
    this.nextBar = this.graph.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.graph.release(this.graph.ctx.currentTime);
  }

  private tick(): void {
    const now = this.graph.ctx.currentTime;
    // After a stall (a suspended context, a hidden tab), start again from now rather than catching up on missed bars.
    if (this.nextBar < now) this.nextBar = now + 0.05;
    while (this.nextBar < now + this.lookahead) {
      const bar = this.conductor.renderBar();
      const at = this.nextBar;
      this.nextBar += this.graph.schedule(bar, at);
      this.onBar?.(bar, at);
    }
  }
}
