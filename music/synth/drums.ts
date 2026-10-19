/**
 * Synth drums: the stand-ins until the author's samples arrive (docs/MUSIC_PLAN.md §16). Metallic 808-style hats, a three-burst
 * clap, a noise-and-tone snare, and two percussion sounds: an FM clank and a rim.
 */
import type { DrumRole } from '../score/types';
import { SynthKick } from './kick';

/** The 808's six square-wave hat partials, in Hz. */
const HAT_PARTIALS = [205.3, 304.4, 369.6, 522.7, 540, 800];

export class DrumSynth {
  private readonly noise: AudioBuffer;
  readonly kick: SynthKick;
  /** Where the hits sit in the stereo field: kick, clap and snare centred; hats and percussion off to the sides. */
  private readonly pans: Record<'hat' | 'openhat' | 'clank' | 'rim', StereoPannerNode>;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
  ) {
    this.kick = new SynthKick(ctx, dest);
    const pan = (p: number): StereoPannerNode => {
      const n = ctx.createStereoPanner();
      n.pan.value = p;
      n.connect(dest);
      return n;
    };
    this.pans = { hat: pan(0.3), openhat: pan(-0.25), clank: pan(-0.45), rim: pan(0.5) };
    // One second of fixed pseudo-random noise, so renders are repeatable.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let x = 0x6d2b79f5;
    for (let i = 0; i < d.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      d[i] = (x >>> 0) / 2147483648 - 1;
    }
  }

  hit(role: DrumRole, t: number, vel: number, note = 28, variant = 0): void {
    switch (role) {
      case 'kick':
        return this.kick.hit(t, vel, note);
      case 'hat':
        return this.hat(t, vel, 0.045, this.pans.hat);
      case 'openhat':
        return this.hat(t, vel, 0.26, this.pans.openhat);
      case 'clap':
        return this.clap(t, vel);
      case 'snare':
        return this.snare(t, vel);
      case 'perc':
        return variant === 0 ? this.clank(t, vel) : this.rim(t, vel);
    }
  }

  private env(t: number, peak: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.001);
    g.gain.setTargetAtTime(0, t + 0.002, decay / 3);
    return g;
  }

  private noiseSource(t: number, len: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    // Start somewhere different each time (but deterministically), so repeated hits don't comb-filter into a tone.
    src.start(t, ((t * 7.31) % 0.8) + 0.01, len);
    return src;
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  private hat(t: number, vel: number, decay: number, out: AudioNode): void {
    const sum = this.ctx.createGain();
    sum.gain.value = 0.18;
    for (const f of HAT_PARTIALS) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(sum);
      o.start(t);
      o.stop(t + decay * 3 + 0.05);
    }
    const env = this.env(t, vel * 0.5, decay);
    sum.connect(this.filter('bandpass', 10000, 0.8)).connect(this.filter('highpass', 7000)).connect(env).connect(out);
  }

  private clap(t: number, vel: number): void {
    const bp = this.filter('bandpass', 1400, 1.4);
    const out = this.ctx.createGain();
    out.gain.value = vel * 0.9;
    bp.connect(out).connect(this.dest);
    // Three quick bursts, then a tail: a room full of hands, slightly out of sync.
    for (const [k, dt] of [0, 0.011, 0.023].entries()) {
      const g = this.env(t + dt, k === 2 ? 1 : 0.7, k === 2 ? 0.16 : 0.012);
      this.noiseSource(t + dt, 0.3).connect(g).connect(bp);
    }
  }

  private snare(t: number, vel: number): void {
    const n = this.env(t, vel * 0.55, 0.15);
    this.noiseSource(t, 0.4).connect(this.filter('highpass', 1600)).connect(n).connect(this.dest);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(175, t + 0.05);
    const tone = this.env(t, vel * 0.5, 0.07);
    o.connect(tone).connect(this.dest);
    o.start(t);
    o.stop(t + 0.3);
  }

  private clank(t: number, vel: number): void {
    const car = this.ctx.createOscillator();
    car.frequency.value = 520;
    const mod = this.ctx.createOscillator();
    mod.frequency.value = 520 * 1.414;
    const idx = this.ctx.createGain();
    idx.gain.setValueAtTime(900, t);
    idx.gain.setTargetAtTime(0, t, 0.04);
    mod.connect(idx).connect(car.frequency);
    const g = this.env(t, vel * 0.35, 0.12);
    car.connect(this.filter('bandpass', 2200, 1)).connect(g).connect(this.pans.clank);
    car.start(t);
    mod.start(t);
    car.stop(t + 0.5);
    mod.stop(t + 0.5);
  }

  private rim(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 1700;
    const g = this.env(t, vel * 0.4, 0.025);
    o.connect(this.filter('highpass', 500)).connect(g).connect(this.pans.rim);
    o.start(t);
    o.stop(t + 0.15);
    const c = this.env(t, vel * 0.3, 0.008);
    this.noiseSource(t, 0.05).connect(this.filter('highpass', 3000)).connect(c).connect(this.pans.rim);
  }
}
