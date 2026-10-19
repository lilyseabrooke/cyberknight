/**
 * A persistent mono voice built from a Patch (docs/MUSIC_PLAN.md §6). Oscillators run for the voice's whole life; notes move their
 * frequency and gate the envelopes, so there is no node churn and legato and glide come for free.
 *
 * Envelopes use only `setTargetAtTime`, which starts from wherever the value is, so events compose without cancelling (Firefox has
 * no `cancelAndHoldAtTime`). That needs events in time order, which the score guarantees: a note never overlaps the next one.
 *
 * Anything a note does to a parameter rides on a separate ConstantSource offset added to it (the cutoff's envelope, sweep and
 * wobble; the formants' wobble; the pitch knock), so it never fights the parameter's own automation from the bar's events.
 *
 * The chain, with every stage optional:
 *   layers (panned, unison, FM) -> lowpass + vowel bank -> drive (+ crush) -> + parallel band drive -> + comb -> band split
 *   -> amp -> level -> out (centre) + side-only width above `width.hp`
 */
import { baseValue, paramPaths } from '../score/mods';
import { midiToHz } from '../score/theory';
import type { NoteEvent, Patch } from '../score/types';

const OSC_TYPE = { sine: 'sine', tri: 'triangle', saw: 'sawtooth', square: 'square' } as const;

/** tanh over [-1, 1] standing in for [-DRIVE_SPAN, DRIVE_SPAN], so a pre-gain of amount/DRIVE_SPAN gives tanh(amount * x). */
const DRIVE_SPAN = 8;
/** Below this the crusher's wet path is switched off entirely. */
const CRUSH_EPS = 0.001;

function tanhCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * DRIVE_SPAN);
  return c;
}

function crushCurve(levels: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.round(((i / (n - 1)) * 2 - 1) * levels) / levels;
  return c;
}

/** Makeup gain after the drive, so turning it up adds teeth more than volume. */
const makeup = (amount: number): number => amount ** -0.4;

/** Formant frequencies (F1, F2, F3) for oo, oh, ah, eh: a vowel at 0..1 slides along them. */
const VOWELS = [
  [325, 700, 2530],
  [450, 800, 2830],
  [730, 1090, 2440],
  [530, 1840, 2480],
];
const FORMANT_GAIN = [1, 0.55, 0.22];
const FORMANT_Q = [7, 8, 10];

export function vowelFreqs(v: number): number[] {
  const x = Math.min(1, Math.max(0, v)) * (VOWELS.length - 1);
  const i = Math.min(VOWELS.length - 2, Math.floor(x));
  const f = x - i;
  return [0, 1, 2].map((k) => VOWELS[i]![k]! + (VOWELS[i + 1]![k]! - VOWELS[i]![k]!) * f);
}

interface Layer {
  nodes: { node: OscillatorNode; offset: number; mod?: OscillatorNode; modGain?: GainNode }[];
  gain: GainNode;
  octave: number;
  fm?: { ratio: number; env: number; decay: number };
}

export class MonoVoice {
  readonly out: GainNode;
  private readonly layers: Layer[] = [];
  private readonly filter?: BiquadFilterNode;
  private readonly pre?: GainNode;
  private readonly make?: GainNode;
  private readonly dry?: GainNode;
  private readonly wet?: GainNode;
  private readonly formants: BiquadFilterNode[] = [];
  private readonly formantOffsets: ConstantSourceNode[] = [];
  private readonly formantWet?: GainNode;
  private readonly lowpassDry?: GainNode;
  private readonly comb?: { delay: DelayNode; fb: GainNode; wet: GainNode };
  private readonly parallel?: { pre: GainNode; out: GainNode };
  private readonly lfoDepths: GainNode[] = [];
  private readonly amp: GainNode;
  /** Every parameter's value over time, as set by the bar's parameter events: notes read the value at their own start. */
  private readonly track: Record<string, { t: number; v: number }[]> = {};
  /** Added to the filter cutoff: the per-note envelope, sweep and wobble. */
  private readonly offset?: ConstantSourceNode;
  /** Added to every oscillator's detune, in cents: the knock's pitch drop. */
  private readonly pitch: ConstantSourceNode;
  /** -cos: a wave that starts at its trough, so a wobble opens from the note's own cutoff. */
  private readonly trough: PeriodicWave;
  private click?: AudioBuffer;
  /** When the last note's release is due, if it hasn't been committed: a note starting exactly then ties onto it instead. */
  private pendingOff: number | null = null;
  private lastOff = -Infinity;

  /** The note it is playing (or last played), for the pool's allocator. */
  note: number | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly patch: Patch,
    dest: AudioNode,
    sends: { reverb?: AudioNode } = {},
  ) {
    for (const path of paramPaths(patch)) this.track[path] = [{ t: -Infinity, v: baseValue(patch, path) }];
    this.trough = ctx.createPeriodicWave(new Float32Array([0, -1]), new Float32Array([0, 0]), { disableNormalization: true });
    this.pitch = ctx.createConstantSource();
    this.pitch.offset.value = 0;
    this.pitch.start();

    // ---- the layers
    const sum = ctx.createGain();
    for (const layer of patch.osc) {
      const gain = ctx.createGain();
      const count = layer.unison?.voices ?? 1;
      gain.gain.value = layer.level / Math.sqrt(count);
      const nodes: Layer['nodes'] = [];
      for (let i = 0; i < count; i++) {
        const node = ctx.createOscillator();
        node.type = OSC_TYPE[layer.wave];
        const spread = count > 1 ? i / (count - 1) - 0.5 : 0;
        const offset = spread * (layer.unison?.spread ?? 0);
        node.detune.value = layer.detune + offset;
        this.pitch.connect(node.detune);
        const pan = (layer.pan ?? 0) + spread * 2 * (layer.unison?.pan ?? 0);
        if (pan) {
          const p = ctx.createStereoPanner();
          p.pan.value = Math.max(-1, Math.min(1, pan));
          node.connect(p).connect(gain);
        } else node.connect(gain);
        const entry: Layer['nodes'][number] = { node, offset };
        if (layer.fm) {
          const mod = ctx.createOscillator();
          const modGain = ctx.createGain();
          modGain.gain.value = 0;
          this.pitch.connect(mod.detune);
          mod.connect(modGain).connect(node.frequency);
          mod.start();
          entry.mod = mod;
          entry.modGain = modGain;
        }
        node.start();
        nodes.push(entry);
      }
      gain.connect(sum);
      const l: Layer = { nodes, gain, octave: layer.octave };
      if (layer.fm) l.fm = { ratio: layer.fm.ratio, env: layer.fm.env ?? 1, decay: layer.fm.decay ?? 0.1 };
      this.layers.push(l);
    }

    // ---- the lowpass, and the vowel bank beside it
    let tone: AudioNode = sum;
    if (patch.filter) {
      this.filter = ctx.createBiquadFilter();
      this.filter.type = patch.filter.type;
      this.filter.frequency.value = patch.filter.cutoff;
      // For lowpass and highpass, Web Audio's Q is the resonance peak in dB.
      this.filter.Q.value = patch.filter.q;
      this.offset = ctx.createConstantSource();
      this.offset.offset.value = 0;
      this.offset.connect(this.filter.frequency);
      this.offset.start();
      tone = sum.connect(this.filter);
    }
    if (patch.formant) {
      const mixed = ctx.createGain();
      this.lowpassDry = ctx.createGain();
      this.lowpassDry.gain.value = 1 - patch.formant.mix;
      tone.connect(this.lowpassDry).connect(mixed);
      this.formantWet = ctx.createGain();
      this.formantWet.gain.value = patch.formant.mix;
      const fs = vowelFreqs(patch.formant.vowel);
      for (let k = 0; k < 3; k++) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fs[k]!;
        bp.Q.value = FORMANT_Q[k]!;
        const off = ctx.createConstantSource();
        off.offset.value = 0;
        off.connect(bp.frequency);
        off.start();
        const g = ctx.createGain();
        // Narrow bandpasses lose a lot of level: make it back up so the vowel can stand next to the lowpass.
        g.gain.value = FORMANT_GAIN[k]! * 3;
        sum.connect(bp).connect(g).connect(this.formantWet);
        this.formants.push(bp);
        this.formantOffsets.push(off);
      }
      this.formantWet.connect(mixed);
      tone = mixed;
    }

    // ---- drive and crush
    let chain: AudioNode = tone;
    if (patch.drive) {
      this.pre = ctx.createGain();
      this.pre.gain.value = patch.drive.amount / DRIVE_SPAN;
      const shaper = ctx.createWaveShaper();
      shaper.curve = tanhCurve();
      shaper.oversample = '4x';
      chain.connect(this.pre).connect(shaper);
      this.dry = ctx.createGain();
      this.wet = ctx.createGain();
      this.dry.gain.value = 1 - patch.drive.crush;
      this.wet.gain.value = patch.drive.crush;
      const crusher = ctx.createWaveShaper();
      crusher.curve = crushCurve(6);
      this.make = ctx.createGain();
      this.make.gain.value = makeup(patch.drive.amount);
      shaper.connect(this.dry).connect(this.make);
      shaper.connect(crusher).connect(this.wet).connect(this.make);
      chain = this.make;
    }

    // ---- parallel band drive and the comb, both mixed back over the dry signal
    if (patch.parallel || patch.comb) {
      const mix = ctx.createGain();
      chain.connect(mix);
      if (patch.parallel) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = patch.parallel.freq;
        bp.Q.value = patch.parallel.q;
        const pre = ctx.createGain();
        pre.gain.value = patch.parallel.drive / DRIVE_SPAN;
        const shaper = ctx.createWaveShaper();
        shaper.curve = tanhCurve();
        shaper.oversample = '4x';
        const out = ctx.createGain();
        out.gain.value = patch.parallel.mix;
        chain.connect(bp).connect(pre).connect(shaper).connect(out).connect(mix);
        this.parallel = { pre, out };
      }
      if (patch.comb) {
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = 0.01;
        const fb = ctx.createGain();
        fb.gain.value = patch.comb.feedback;
        const wet = ctx.createGain();
        wet.gain.value = patch.comb.mix;
        chain.connect(delay);
        delay.connect(fb).connect(delay);
        delay.connect(wet).connect(mix);
        this.comb = { delay, fb, wet };
      }
      chain = mix;
    }

    // ---- the band split
    if (patch.post?.hp) {
      // Two poles' worth (24 dB/oct): the band split has to be steep, or the low end leaks onto the sub's floor.
      for (let i = 0; i < 2; i++) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = patch.post.hp;
        hp.Q.value = 0.707;
        chain = chain.connect(hp);
      }
    }
    if (patch.post?.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = patch.post.lp;
      chain = chain.connect(lp);
    }

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    this.out = ctx.createGain();
    this.out.gain.value = patch.level;
    chain.connect(this.amp).connect(this.out);
    if (patch.monoBelow) {
      // Linkwitz-Riley at monoBelow: each band is two Butterworth stages, so the bands sum flat. The low band is downmixed to mono.
      const stage = (type: BiquadFilterType, from: AudioNode): AudioNode => {
        let n = from;
        for (let i = 0; i < 2; i++) {
          const f = ctx.createBiquadFilter();
          f.type = type;
          f.frequency.value = patch.monoBelow!;
          f.Q.value = Math.SQRT1_2;
          n = n.connect(f);
        }
        return n;
      };
      const mono = ctx.createGain();
      mono.channelCount = 1;
      mono.channelCountMode = 'explicit';
      mono.channelInterpretation = 'speakers';
      stage('lowpass', this.out).connect(mono).connect(dest);
      stage('highpass', this.out).connect(dest);
    } else this.out.connect(dest);

    // ---- width: a side-only signal (a delayed copy minus the direct one, opposite in each ear), so it cancels in mono
    if (patch.width && patch.width.amount > 0) {
      // Two stages (24 dB/oct): the side signal must carry nothing low, or the low end smears across the field.
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = patch.width.hp;
      hp.Q.value = Math.SQRT1_2;
      const hp2 = ctx.createBiquadFilter();
      hp2.type = 'highpass';
      hp2.frequency.value = patch.width.hp;
      hp2.Q.value = Math.SQRT1_2;
      hp.connect(hp2);
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 0.011;
      const plus = ctx.createGain();
      plus.gain.value = patch.width.amount;
      const minus = ctx.createGain();
      minus.gain.value = -patch.width.amount;
      const side = ctx.createGain();
      this.out.connect(hp);
      hp2.connect(delay).connect(plus).connect(side);
      hp2.connect(minus).connect(side);
      const flip = ctx.createGain();
      flip.gain.value = -1;
      const merge = ctx.createChannelMerger(2);
      side.connect(merge, 0, 0);
      side.connect(flip).connect(merge, 0, 1);
      merge.connect(dest);
    }

    if (patch.sends?.reverb && sends.reverb) {
      const send = ctx.createGain();
      send.gain.value = patch.sends.reverb;
      this.out.connect(send).connect(sends.reverb);
    }

    for (const l of patch.lfo ?? []) {
      const lfo = ctx.createOscillator();
      lfo.type = l.shape === 'tri' ? 'triangle' : 'sine';
      lfo.frequency.value = l.rate;
      const depth = ctx.createGain();
      depth.gain.value = l.depth;
      lfo.connect(depth);
      if (l.dst === 'filter.cutoff' && this.filter) depth.connect(this.filter.frequency);
      else if (l.dst === 'level') depth.connect(this.out.gain);
      else if (l.dst === 'pitch') for (const o of this.layers) for (const n of o.nodes) depth.connect(n.node.detune);
      else if (l.dst === 'detune') for (const n of this.layers[l.layer ?? 0]?.nodes ?? []) depth.connect(n.node.detune);
      lfo.start();
      this.lfoDepths.push(depth);
    }
  }

  /** When this voice will be silent: its last note's end plus a generous release tail. */
  quietAt(): number {
    return (this.pendingOff ?? this.lastOff) + 2 * this.patch.env.amp.r;
  }

  /** When its last note ends (or ended). */
  endsAt(): number {
    return this.pendingOff ?? this.lastOff;
  }

  /** A parameter's value at time `t`: the last one set at or before it. */
  private at(path: string, t: number): number {
    const tr = this.track[path];
    if (!tr) return 0;
    let v = tr[0]!.v;
    for (const e of tr) {
      if (e.t > t + 1e-6) break;
      v = e.v;
    }
    return v;
  }

  /** Apply parameter values at `t`, gliding to them over `ramp` seconds. Calls must come in time order. */
  setParams(values: Record<string, number>, t: number, ramp: number): void {
    const tc = Math.max(0.005, ramp / 3);
    for (const [path, v] of Object.entries(values)) {
      const tr = this.track[path];
      if (!tr) continue;
      tr.push({ t, v });
      // Keep a few seconds of history: enough for any note scheduled ahead to find its value.
      while (tr.length > 2 && tr[1]!.t < t - 8) tr.shift();
      const [head, a, b] = path.split('.');
      if (head === 'level') this.out.gain.setTargetAtTime(v, t, tc);
      else if (head === 'osc') {
        const o = this.layers[Number(a)];
        if (o && b === 'level') o.gain.gain.setTargetAtTime(v / Math.sqrt(o.nodes.length), t, tc);
        if (o && b === 'detune') for (const n of o.nodes) n.node.detune.setTargetAtTime(v + n.offset, t, tc);
        // osc.<i>.fm is read per note.
      } else if (head === 'lfo') this.lfoDepths[Number(a)]?.gain.setTargetAtTime(v, t, tc);
      else if (path === 'filter.q') this.filter?.Q.setTargetAtTime(v, t, tc);
      else if (path === 'filter.cutoff') this.filter?.frequency.setTargetAtTime(v, t, tc);
      else if (path === 'drive.amount') {
        this.pre?.gain.setTargetAtTime(v / DRIVE_SPAN, t, tc);
        this.make?.gain.setTargetAtTime(makeup(v), t, tc);
      } else if (path === 'drive.crush') {
        const c = v < CRUSH_EPS ? 0 : v;
        this.dry?.gain.setTargetAtTime(1 - c, t, tc);
        this.wet?.gain.setTargetAtTime(c, t, tc);
      } else if (path === 'formant.vowel') {
        const fs = vowelFreqs(v);
        this.formants.forEach((bp, k) => bp.frequency.setTargetAtTime(fs[k]!, t, tc));
      } else if (path === 'formant.mix') {
        this.formantWet?.gain.setTargetAtTime(v, t, tc);
        this.lowpassDry?.gain.setTargetAtTime(1 - v, t, tc);
      } else if (path === 'comb.feedback') this.comb?.fb.gain.setTargetAtTime(Math.min(0.92, v), t, tc);
      else if (path === 'comb.mix') this.comb?.wet.gain.setTargetAtTime(v, t, tc);
      else if (path === 'parallel.drive') this.parallel?.pre.gain.setTargetAtTime(v / DRIVE_SPAN, t, tc);
      else if (path === 'parallel.mix') this.parallel?.out.gain.setTargetAtTime(v, t, tc);
      // glide, accent, filter.env and env.filterDecay are read per note.
    }
  }

  /** Release the last note now, unless the next note ties onto it. Call before a bar with no notes for this voice. */
  commit(before = Infinity): void {
    if (this.pendingOff === null || this.pendingOff > before) return;
    this.amp.gain.setTargetAtTime(0, this.pendingOff, this.patch.env.amp.r / 3);
    this.lastOff = this.pendingOff;
    this.pendingOff = null;
  }

  /**
   * Play a note. A mono voice ties a note that starts exactly when the last one ends; a pool passes `tie` to decide for itself
   * (a held common tone ties, a voice taken for a new note re-attacks).
   */
  play(n: NoteEvent, t: number, dur: number, tie?: boolean, stepDur = 0.125): void {
    const { amp } = this.patch.env;
    const touching = this.pendingOff !== null && Math.abs(this.pendingOff - t) < 1e-4;
    const legato = tie ?? touching;
    if (!legato) this.commit();
    this.pendingOff = null;
    const end = t + dur;

    const hz = midiToHz(n.note ?? 60);
    this.note = n.note ?? null;
    const glide = n.slide ? Math.max(0.005, this.at('glide', t) || 0.03) : 0;
    this.layers.forEach((o, li) => {
      const f = hz * 2 ** o.octave;
      for (const { node, mod, modGain } of o.nodes) {
        if (glide) node.frequency.setTargetAtTime(f, t, glide / 3);
        else node.frequency.setValueAtTime(f, t);
        if (mod && modGain && o.fm) {
          const mf = f * o.fm.ratio;
          if (glide) mod.frequency.setTargetAtTime(mf, t, glide / 3);
          else mod.frequency.setValueAtTime(mf, t);
          // The modulation index in Hz of deviation, flaring at each attack and settling: the FM growl's bite.
          const dev = this.at(`osc.${li}.fm`, t) * mf;
          if (!legato) {
            modGain.gain.setTargetAtTime(dev * o.fm.env * n.vel, t, 0.002);
            modGain.gain.setTargetAtTime(dev, t + 0.004, o.fm.decay / 3);
          } else modGain.gain.setTargetAtTime(dev, t, 0.02);
        }
      }
    });
    if (this.comb) this.comb.delay.delayTime.setValueAtTime(Math.max(128 / this.ctx.sampleRate, 1 / hz), t);

    const shape = n.shape;
    const accent = n.accent ? this.at('accent', t) : 0;
    const peak = n.vel * (1 + accent);
    const attack = shape?.attack ? shape.attack * stepDur : amp.a;
    if (!legato) {
      this.amp.gain.setTargetAtTime(peak, t, Math.max(0.001, attack / 3));
      // A swelled note holds at its peak instead of decaying: the swell is the gesture.
      if (attack < dur && !shape?.attack) this.amp.gain.setTargetAtTime(peak * amp.s, t + attack, amp.d / 3);
      if (this.patch.knock) this.knock(t, n.vel);
    }

    const toVowel = this.patch.wobbleTo === 'vowel' && this.formants.length > 0;
    const off = this.offset?.offset;
    if (off && this.filter) {
      const base = this.at('filter.cutoff', t);
      if (shape?.sweep || (shape?.wobble && !toVowel)) {
        // The held bass's gesture: the filter opens across the whole note, with a wobble riding on top, then closes at the end.
        const sweepHz = base * ((shape.sweep ?? 1) - 1);
        const wob = shape.wobble && !toVowel ? (base * (2 ** shape.wobble.depth - 1)) / 2 : 0;
        off.setTargetAtTime(Math.min(12000, sweepHz + wob), t, Math.max(0.01, dur / 3));
        off.setTargetAtTime(0, end, 0.06);
        if (shape.wobble && wob > 0) this.wobble([this.filter.frequency], [wob], shape.wobble, t, end, stepDur);
      } else if (!legato && this.at('filter.env', t) > 0) {
        // A pluck. Legato notes don't re-pluck the filter: a slide is one gesture.
        const depth = this.at('filter.env', t) * (1 + 1.5 * accent) * n.vel;
        const top = Math.min(16000, base * 2 ** depth);
        off.setTargetAtTime(top - base, t, 0.001);
        off.setTargetAtTime(0, t + 0.004, this.at('env.filterDecay', t) / 3);
      }
    }
    if (toVowel && shape?.wobble) {
      // The talking growl: the wobble slides the vowel from where it is toward ah and eh, then back.
      const v = this.at('formant.vowel', t);
      const lo = vowelFreqs(v);
      const hi = vowelFreqs(Math.min(1, v + 0.25 + 0.35 * Math.min(1, shape.wobble.depth / 1.8)));
      const amps = lo.map((f, k) => (hi[k]! - f) / 2);
      this.formantOffsets.forEach((o, k) => {
        o.offset.setTargetAtTime(amps[k]!, t, 0.02);
        o.offset.setTargetAtTime(0, end, 0.05);
      });
      this.wobble(this.formants.map((b) => b.frequency), amps, shape.wobble, t, end, stepDur);
    }
    this.pendingOff = end;
  }

  /** A tempo-synced wobble on some parameters for one note: it starts at its trough, so it opens from where the note sits. */
  private wobble(params: AudioParam[], depths: number[], w: { period: number; periodTo?: number }, t: number, end: number, stepDur: number): void {
    const lfo = this.ctx.createOscillator();
    lfo.setPeriodicWave(this.trough);
    lfo.frequency.setValueAtTime(1 / (w.period * stepDur), t);
    if (w.periodTo) lfo.frequency.linearRampToValueAtTime(1 / (w.periodTo * stepDur), end);
    params.forEach((p, k) => {
      const depth = this.ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setTargetAtTime(depths[k]!, t, Math.min(0.05, (end - t) / 6));
      depth.gain.setTargetAtTime(0, end, 0.04);
      lfo.connect(depth).connect(p);
    });
    lfo.start(t);
    lfo.stop(end + 0.3);
  }

  /** The knock: a quick pitch drop into the note and a click on top. */
  private knock(t: number, vel: number): void {
    const k = this.patch.knock!;
    this.pitch.offset.setValueAtTime(k.semis * 100, t);
    this.pitch.offset.setTargetAtTime(0, t + 0.001, k.decay / 3);
    if (k.click <= 0) return;
    if (!this.click) {
      const len = Math.round(this.ctx.sampleRate * 0.004);
      this.click = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.click.getChannelData(0);
      let x = 0x51ed27;
      for (let i = 0; i < len; i++) {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        d[i] = ((x >>> 0) / 2147483648 - 1) * (1 - i / len);
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.click;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.value = k.click * vel;
    src.connect(hp).connect(g).connect(this.out);
    src.start(t);
  }

  stop(t: number): void {
    this.commit();
    this.amp.gain.setTargetAtTime(0, t, 0.02);
  }
}
