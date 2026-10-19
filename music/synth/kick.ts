/**
 * The synth kick: a sine with a fast pitch drop to a fundamental tuned near the root, plus a short noise click. The sub carries
 * the low end, so the body is short. This is the stand-in until the author's kick samples arrive (docs/MUSIC_PLAN.md §16).
 */
import { midiToHz } from '../score/theory';

export class SynthKick {
  private readonly click: AudioBuffer;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
  ) {
    const len = Math.round(ctx.sampleRate * 0.006);
    this.click = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.click.getChannelData(0);
    // A fixed pseudo-random burst, so renders are repeatable.
    let x = 0x2545f491;
    for (let i = 0; i < len; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      d[i] = ((x >>> 0) / 4294967296 - 0.5) * 2 * (1 - i / len);
    }
  }

  hit(t: number, vel: number, note: number): void {
    const { ctx } = this;
    const end = midiToHz(note);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(end * 3.2, t);
    osc.frequency.exponentialRampToValueAtTime(end, t + 0.07);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0, t);
    body.gain.linearRampToValueAtTime(vel, t + 0.0015);
    body.gain.setTargetAtTime(0, t + 0.03, 0.07);
    osc.connect(body).connect(this.dest);
    osc.start(t);
    osc.stop(t + 0.6);

    const click = ctx.createBufferSource();
    click.buffer = this.click;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const cg = ctx.createGain();
    cg.gain.value = 0.35 * vel;
    click.connect(hp).connect(cg).connect(this.dest);
    click.start(t);
  }
}
