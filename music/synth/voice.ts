/**
 * A persistent mono voice built from a Patch (docs/MUSIC_PLAN.md §6). Oscillators run for the voice's whole life; notes move their
 * frequency and gate the envelopes, so there is no node churn and legato and glide come for free.
 *
 * Envelopes use only `setTargetAtTime`, which starts from wherever the value is, so events compose without cancelling (Firefox has
 * no `cancelAndHoldAtTime`). That needs events in time order, which the score guarantees: a note never overlaps the next one.
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

export class MonoVoice {
  readonly out: GainNode;
  /** One entry per patch layer; a unison layer has several oscillators, each with its offset from the layer's detune. */
  private readonly oscs: { nodes: { node: OscillatorNode; offset: number }[]; gain: GainNode; octave: number }[] = [];
  private readonly filter?: BiquadFilterNode;
  private readonly pre?: GainNode;
  private readonly make?: GainNode;
  private readonly dry?: GainNode;
  private readonly wet?: GainNode;
  private readonly amp: GainNode;
  /** The current value of every parameter, as set by the bar's mod routes. */
  private readonly p: Record<string, number> = {};
  /** When the last note's release is due, if it hasn't been committed: a note starting exactly then ties onto it instead. */
  private pendingOff: number | null = null;

  /** The note it is playing (or last played), for the pool's allocator. */
  note: number | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly patch: Patch,
    dest: AudioNode,
    sends: { reverb?: AudioNode } = {},
  ) {
    for (const path of paramPaths(patch)) this.p[path] = baseValue(patch, path);

    const sum = ctx.createGain();
    for (const layer of patch.osc) {
      const gain = ctx.createGain();
      const count = layer.unison?.voices ?? 1;
      gain.gain.value = layer.level / Math.sqrt(count);
      const nodes: { node: OscillatorNode; offset: number }[] = [];
      for (let i = 0; i < count; i++) {
        const node = ctx.createOscillator();
        node.type = OSC_TYPE[layer.wave];
        const offset = count > 1 ? (i / (count - 1) - 0.5) * (layer.unison?.spread ?? 0) : 0;
        node.detune.value = layer.detune + offset;
        node.connect(gain);
        node.start();
        nodes.push({ node, offset });
      }
      gain.connect(sum);
      this.oscs.push({ nodes, gain, octave: layer.octave });
    }

    let chain: AudioNode = sum;
    if (patch.filter) {
      this.filter = ctx.createBiquadFilter();
      this.filter.type = patch.filter.type;
      this.filter.frequency.value = patch.filter.cutoff;
      // For lowpass and highpass, Web Audio's Q is the resonance peak in dB.
      this.filter.Q.value = patch.filter.q;
      chain = chain.connect(this.filter);
    }
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
    if (patch.post?.hp) {
      // Two poles' worth (24 dB/oct): the band split has to be steep, or a sub-octave oscillator leaks into the sub's floor.
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
    chain.connect(this.amp).connect(this.out).connect(dest);
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
      else if (l.dst === 'pitch') for (const o of this.oscs) for (const n of o.nodes) depth.connect(n.node.detune);
      lfo.start();
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

  private lastOff = -Infinity;

  /** Apply the bar's mod-route values, gliding to them over `ramp` seconds from `t`. */
  setParams(values: Record<string, number>, t: number, ramp: number): void {
    const tc = Math.max(0.005, ramp / 3);
    for (const [path, v] of Object.entries(values)) {
      if (!(path in this.p)) continue;
      this.p[path] = v;
      const [head, a, b] = path.split('.');
      if (head === 'level') this.out.gain.setTargetAtTime(v, t, tc);
      else if (head === 'osc') {
        const o = this.oscs[Number(a)];
        if (o && b === 'level') o.gain.gain.setTargetAtTime(v / Math.sqrt(o.nodes.length), t, tc);
        if (o && b === 'detune') for (const n of o.nodes) n.node.detune.setTargetAtTime(v + n.offset, t, tc);
      } else if (path === 'filter.q') this.filter?.Q.setTargetAtTime(v, t, tc);
      else if (path === 'filter.cutoff') this.filter?.frequency.setTargetAtTime(v, t, tc);
      else if (path === 'drive.amount') {
        this.pre?.gain.setTargetAtTime(v / DRIVE_SPAN, t, tc);
        this.make?.gain.setTargetAtTime(makeup(v), t, tc);
      } else if (path === 'drive.crush') {
        const c = v < CRUSH_EPS ? 0 : v;
        this.dry?.gain.setTargetAtTime(1 - c, t, tc);
        this.wet?.gain.setTargetAtTime(c, t, tc);
      }
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
  play(n: NoteEvent, t: number, dur: number, tie?: boolean): void {
    const { amp } = this.patch.env;
    const touching = this.pendingOff !== null && Math.abs(this.pendingOff - t) < 1e-4;
    const legato = tie ?? touching;
    if (!legato) this.commit();
    this.pendingOff = null;

    const hz = midiToHz(n.note ?? 60);
    this.note = n.note ?? null;
    const glide = n.slide ? Math.max(0.005, this.p.glide ?? 0.03) : 0;
    for (const o of this.oscs) {
      const f = hz * 2 ** o.octave;
      for (const { node } of o.nodes) {
        if (glide) node.frequency.setTargetAtTime(f, t, glide / 3);
        else node.frequency.setValueAtTime(f, t);
      }
    }

    const accent = n.accent ? (this.p.accent ?? 0) : 0;
    const peak = n.vel * (1 + accent);
    if (!legato) {
      this.amp.gain.setTargetAtTime(peak, t, Math.max(0.001, amp.a / 3));
      if (amp.a < dur) this.amp.gain.setTargetAtTime(peak * amp.s, t + amp.a, amp.d / 3);
    }

    if (this.filter && this.patch.filter && (this.p['filter.env'] ?? 0) > 0) {
      const base = this.p['filter.cutoff'] ?? this.patch.filter.cutoff;
      const depth = (this.p['filter.env'] ?? 0) * (1 + 1.5 * accent) * n.vel;
      const top = Math.min(16000, base * 2 ** depth);
      const decay = this.p['env.filterDecay'] ?? 0.15;
      // Legato notes don't re-pluck the filter: a slide is one gesture.
      if (!legato) {
        this.filter.frequency.setTargetAtTime(top, t, 0.001);
        this.filter.frequency.setTargetAtTime(base, t + 0.004, decay / 3);
      }
    }
    this.pendingOff = t + dur;
  }

  stop(t: number): void {
    this.commit();
    this.amp.gain.setTargetAtTime(0, t, 0.02);
  }
}
