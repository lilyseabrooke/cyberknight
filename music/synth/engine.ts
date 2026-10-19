/**
 * Live playback: owns the AudioContext. It is created on a user gesture (autoplay policy) and fades out and suspends while the tab
 * is hidden (docs/MUSIC_PLAN.md §3).
 */
import { Conductor, type ConductorOptions } from '../score/conductor';
import type { Bar } from '../score/types';
import { Graph, LiveScheduler } from './graph';

export class MusicEngine {
  readonly conductor: Conductor;
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private scheduler: LiveScheduler | null = null;
  private volume = 0.8;
  playing = false;
  onBar?: (bar: Bar) => void;

  constructor(opts: ConductorOptions) {
    this.conductor = new Conductor(opts);
  }

  /** Call from a click handler. */
  async start(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'playback' });
      this.graph = new Graph(this.ctx);
      this.scheduler = new LiveScheduler(this.graph, this.conductor);
      this.scheduler.onBar = (bar) => this.onBar?.(bar);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    await this.ctx.resume();
    const g = this.graph!.mixer.volume.gain;
    g.setValueAtTime(0, this.ctx.currentTime);
    g.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    this.scheduler!.start();
    this.playing = true;
  }

  stop(): void {
    this.scheduler?.stop();
    this.playing = false;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.graph) this.graph.mixer.volume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  get analyser(): AnalyserNode | null {
    return this.graph?.mixer.analyser ?? null;
  }

  async dispose(): Promise<void> {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    await this.ctx?.close();
    this.ctx = null;
  }

  private readonly onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.graph || !this.playing) return;
    const g = this.graph.mixer.volume.gain;
    if (document.hidden) {
      g.setTargetAtTime(0, ctx.currentTime, 0.08);
      setTimeout(() => void ctx.suspend(), 400);
    } else {
      void ctx.resume().then(() => g.setTargetAtTime(this.volume, ctx.currentTime, 0.15));
    }
  };
}
