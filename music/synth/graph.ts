/**
 * The playable graph and the code that turns a conductor's bars into scheduled audio. It runs against any BaseAudioContext, so the
 * live engine and offline renders (scripts/music-render.ts) share every line.
 */
import type { Conductor } from '../score/conductor';
import { PATCHES } from '../score/patches';
import { STEPS_PER_BAR, type Bar, type RoleId } from '../score/types';
import { SynthKick } from './kick';
import { Mixer } from './mixer';
import { MonoVoice } from './voice';

/** How long a bar's new parameter values take to glide in. */
const PARAM_RAMP_STEPS = 2;

export class Graph {
  readonly mixer: Mixer;
  readonly voices: Partial<Record<RoleId, MonoVoice>> = {};
  readonly kick: SynthKick;

  constructor(readonly ctx: BaseAudioContext, dest: AudioNode = ctx.destination) {
    this.mixer = new Mixer(ctx, dest);
    for (const [role, patch] of Object.entries(PATCHES) as [RoleId, (typeof PATCHES)[keyof typeof PATCHES]][]) {
      this.voices[role] = new MonoVoice(ctx, patch, this.mixer.buses[patch.bus]);
    }
    this.kick = new SynthKick(ctx, this.mixer.buses.drums);
  }

  /** Schedule one bar starting at `start` (context seconds). Returns the bar's length in seconds. */
  schedule(bar: Bar, start: number): number {
    const stepDur = 60 / bar.bpm / 4;
    const barDur = stepDur * STEPS_PER_BAR;

    const byRole = new Map<RoleId, Record<string, number>>();
    for (const p of bar.params) {
      const m = byRole.get(p.role) ?? {};
      m[p.path] = p.value;
      byRole.set(p.role, m);
    }
    for (const [role, values] of byRole) this.voices[role]?.setParams(values, start, PARAM_RAMP_STEPS * stepDur);

    for (const t of bar.kicks) this.mixer.duck(start + t * stepDur, bar.macros.density ?? 0, stepDur);

    const notes = [...bar.notes].sort((a, b) => a.t - b.t);
    for (const role of Object.keys(this.voices) as RoleId[]) {
      if (!notes.some((n) => n.role === role)) this.voices[role]!.commit(start);
    }
    for (const n of notes) {
      const t = start + n.t * stepDur;
      if (n.role === 'kick') this.kick.hit(t, n.vel, n.note ?? 33);
      else this.voices[n.role]?.play(n, t, n.dur * stepDur);
    }
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
