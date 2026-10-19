/**
 * Buses, the faked sidechain and the master chain (docs/MUSIC_PLAN.md §17). Web Audio has no sidechain input, so the kick's duck
 * is gain automation scheduled at each kick time.
 */
import type { BusId } from '../score/types';

export class Mixer {
  readonly buses: Record<BusId, GainNode>;
  /** Where the buses meet, before the master chain. */
  readonly input: GainNode;
  readonly volume: GainNode;
  readonly analyser: AnalyserNode;
  /** Each bus's duck stage, separate from its level so soloing and ducking don't fight. */
  private readonly ducks: Record<BusId, GainNode>;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.input = ctx.createGain();
    // Headroom: the buses sum well past full scale, and the master should shape the mix, not flatten it.
    this.input.gain.value = 0.22;
    const mk = (): GainNode => ctx.createGain();
    this.buses = { sub: mk(), bass: mk(), drums: mk() };
    this.ducks = { sub: mk(), bass: mk(), drums: mk() };
    for (const id of Object.keys(this.buses) as BusId[]) this.buses[id].connect(this.ducks[id]).connect(this.input);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 25;
    hp.Q.value = 0.7;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.ratio.value = 2;
    glue.knee.value = 8;
    glue.attack.value = 0.02;
    glue.release.value = 0.2;
    const clip = ctx.createWaveShaper();
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.2 * x) / Math.tanh(1.2);
    }
    clip.curve = curve;
    clip.oversample = '2x';
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -2;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.08;
    this.volume = ctx.createGain();
    this.volume.gain.value = 0.8;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.input.connect(hp).connect(glue).connect(clip).connect(limit).connect(this.volume).connect(dest);
    this.volume.connect(this.analyser);
  }

  /** Duck the sub briefly and the bass for about an 8th note at a kick, deeper when the groove is dense. */
  duck(t: number, density: number, stepDur: number): void {
    const sub = this.ducks.sub.gain;
    sub.setTargetAtTime(0.45, t, 0.002);
    sub.setTargetAtTime(1, t + 0.012, 0.018);
    const bass = this.ducks.bass.gain;
    bass.setTargetAtTime(1 - (0.35 + 0.25 * density), t, 0.003);
    bass.setTargetAtTime(1, t + 0.015, (2 * stepDur) / 3);
  }

  solo(only: readonly BusId[] | null): void {
    for (const id of Object.keys(this.buses) as BusId[]) this.buses[id].gain.value = !only || only.includes(id) ? 1 : 0;
  }
}
