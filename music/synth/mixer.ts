/**
 * Buses, the faked sidechain, the shared reverb and the master chain (docs/MUSIC_PLAN.md §17). Web Audio has no sidechain input, so
 * the kick's duck is gain automation scheduled at each kick time.
 */
import type { BusId } from '../score/types';
import { impulse } from './impulse';

const BUSES: BusId[] = ['sub', 'bass', 'drums', 'beds', 'music'];

export class Mixer {
  readonly buses: Record<BusId, GainNode>;
  /** Where the buses meet, before the master chain. */
  readonly input: GainNode;
  /** The shared reverb, fed through one send stage per bus (voices send to their bus's), so soloing a bus solos its reverb too. */
  readonly sends: Record<BusId, GainNode>;
  readonly volume: GainNode;
  readonly analyser: AnalyserNode;
  /** Each bus's duck stage, separate from its level so soloing and ducking don't fight. */
  private readonly ducks: Record<BusId, GainNode>;
  /** A trance gate on the beds, chopping them in 16ths when the drive is up. */
  private readonly bedGate: GainNode;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.input = ctx.createGain();
    // Headroom: the buses sum well past full scale, and the master should shape the mix, not flatten it.
    this.input.gain.value = 0.22;
    const mk = (): GainNode => ctx.createGain();
    this.buses = Object.fromEntries(BUSES.map((b) => [b, mk()])) as Record<BusId, GainNode>;
    this.ducks = Object.fromEntries(BUSES.map((b) => [b, mk()])) as Record<BusId, GainNode>;
    this.bedGate = mk();
    for (const id of BUSES) {
      const chain = id === 'beds' ? this.buses[id].connect(this.bedGate) : this.buses[id];
      chain.connect(this.ducks[id]).connect(this.input);
    }

    // One shared reverb. Its return isn't ducked, so the tails bloom between kicks.
    const reverb = mk();
    this.sends = Object.fromEntries(BUSES.map((b) => [b, mk()])) as Record<BusId, GainNode>;
    for (const id of BUSES) this.sends[id].connect(reverb);
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = impulse(ctx, 2.8, 3.2, 1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const ret = mk();
    ret.gain.value = 0.55;
    reverb.connect(hp).connect(conv).connect(ret).connect(this.input);

    const masterHp = ctx.createBiquadFilter();
    masterHp.type = 'highpass';
    masterHp.frequency.value = 25;
    masterHp.Q.value = 0.7;
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
    this.input.connect(masterHp).connect(glue).connect(clip).connect(limit).connect(this.volume).connect(dest);
    this.volume.connect(this.analyser);
  }

  /** At a kick: duck the sub briefly, and the bass, beds and stabs for about an 8th, deeper when the groove is dense. */
  duck(t: number, density: number, stepDur: number): void {
    const sub = this.ducks.sub.gain;
    sub.setTargetAtTime(0.45, t, 0.002);
    sub.setTargetAtTime(1, t + 0.012, 0.018);
    const depth = 0.35 + 0.25 * density;
    for (const id of ['bass', 'beds', 'music'] as const) {
      const g = this.ducks[id].gain;
      const d = id === 'beds' ? depth * 0.9 : id === 'music' ? depth * 0.6 : depth;
      g.setTargetAtTime(1 - d, t, 0.003);
      g.setTargetAtTime(1, t + 0.015, (2 * stepDur) / 3);
    }
  }

  /** Chop the beds in 16ths for one bar: open for the first part of each step, down by `depth` for the rest. */
  gateBeds(start: number, stepDur: number, depth: number): void {
    const g = this.bedGate.gain;
    if (depth <= 0) {
      g.setTargetAtTime(1, start, 0.01);
      return;
    }
    for (let i = 0; i < 16; i++) {
      const t = start + i * stepDur;
      g.setTargetAtTime(1, t, 0.003);
      g.setTargetAtTime(1 - depth, t + stepDur * 0.55, 0.006);
    }
  }

  /** Solo some buses, with their reverb (for stem renders). */
  solo(only: readonly BusId[] | null): void {
    for (const id of BUSES) {
      const on = !only || only.includes(id) ? 1 : 0;
      this.buses[id].gain.value = on;
      this.sends[id].gain.value = on;
    }
  }
}
