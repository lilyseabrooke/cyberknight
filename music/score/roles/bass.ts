/**
 * The character bass (docs/MUSIC_PLAN.md §7.2). Its material is a *style* plus the shapes it plays in, chosen once from a seed, so
 * different pieces get genuinely different basslines rather than variations of one groove:
 *
 * - `hold`: a huge, modulating note held for half a bar or a whole one, its filter opening across it with a tempo-synced wobble on
 *   top, and then it drops out.
 * - `roll`: a growly, straight 8th-note roll on the root.
 * - `pulse`: locked offbeats (or 8ths, or on the kick), the classic techno bass.
 * - `riff`: a syncopated line, rendered by threshold sampling so it keeps its identity as the macros move it.
 *
 * Every style plays a 4-bar *shape* (full bars, half bars, full bars of silence, a pickup into the next bar) that low intensity
 * thins toward silence and high intensity fills. Aggression mostly changes the sound (drive, growl, wobble), not how busy the line
 * is. Velocity follows curves across the phrase and the bar, and the cutoff follows a contour across the phrase, so the bass is
 * shaped over time and not just note by note.
 *
 * It stays low and heavy: mostly roots, moving by dark near neighbours (the ♭2 above, the seventh below) rather than bright leaps.
 */
import type { MacroValues } from '../axes/macros';
import { chordAt } from '../harmony';
import { unit } from '../rng';
import { MODES, buildChord, fifthOf, foldInto, pc } from '../theory';
import { STEPS_PER_BAR, type Chord, type HarmonyBar, type NoteEvent, type ParamEvent } from '../types';

export type BassStyle = 'hold' | 'roll' | 'pulse' | 'riff';
export const BASS_STYLES: BassStyle[] = ['hold', 'roll', 'pulse', 'riff'];

/** What a bar of the shape does: all of it, its first half, nothing, a pickup on beat 4, or a busier bar (riffs). */
export type BarShape = 'full' | 'half' | 'rest' | 'tail' | 'fill';

/** Velocity across the 4-bar phrase. */
export type PhraseCurve = 'flat' | 'rise' | 'fall' | 'arch';
/** Velocity inside the bar: each beat pumping down from its downbeat, or the bar swelling toward its end. */
export type BarCurve = 'none' | 'pump' | 'swell';
/** The cutoff across the phrase: opening up, closing down, or breathing. */
export type Contour = 'none' | 'open' | 'close' | 'breathe';

/** Where a pulse or riff sits when it's locked: the offbeat 8ths, every 8th, or on the kick. */
export type LockedFeel = 'offbeat' | 'eighths' | 'onKick';

export const PHRASE_BARS = 4;
/** Bars before a riff's step pattern repeats. */
export const RIFF_BARS = 2;

export interface BassMaterial {
  seed: number;
  style: BassStyle;
  shape: BarShape[];
  phraseCurve: PhraseCurve;
  barCurve: BarCurve;
  contour: Contour;
  locked: LockedFeel;
}

const SHAPES: Record<BassStyle, BarShape[][]> = {
  hold: [
    ['half', 'rest', 'half', 'rest'],
    ['full', 'half', 'full', 'rest'],
    ['half', 'half', 'half', 'tail'],
    ['full', 'rest', 'half', 'tail'],
  ],
  roll: [
    ['full', 'full', 'full', 'full'],
    ['full', 'full', 'full', 'half'],
    ['full', 'rest', 'full', 'full'],
    ['half', 'full', 'half', 'full'],
  ],
  pulse: [
    ['full', 'full', 'full', 'full'],
    ['full', 'full', 'full', 'rest'],
    ['full', 'full', 'half', 'tail'],
  ],
  riff: [
    ['full', 'full', 'full', 'fill'],
    ['full', 'full', 'rest', 'full'],
    ['full', 'half', 'full', 'fill'],
  ],
};

const pickOf = <T>(u: number, xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(u * xs.length))]!;

/** A new bassline. The style is the seed's unless given; riffs are the rarest, so most pieces don't groove the same way. */
export function newBass(seed: number, style?: BassStyle): BassMaterial {
  const u = unit(seed, 0x57e1);
  const s: BassStyle = style ?? (u < 0.3 ? 'hold' : u < 0.6 ? 'roll' : u < 0.8 ? 'pulse' : 'riff');
  const lu = unit(seed, 0x10c);
  return {
    seed,
    style: s,
    shape: pickOf(unit(seed, 0x5a9e), SHAPES[s]),
    phraseCurve: pickOf<PhraseCurve>(unit(seed, 0xc0a1), ['flat', 'rise', 'fall', 'arch']),
    // Rolls pump by nature; the others mostly don't.
    barCurve: s === 'roll' ? 'pump' : pickOf<BarCurve>(unit(seed, 0xc0a2), ['none', 'none', 'swell', 'pump']),
    contour: pickOf<Contour>(unit(seed, 0xc0a3), s === 'hold' ? ['none', 'breathe'] : ['none', 'open', 'close', 'breathe']),
    locked: lu < 0.5 ? 'offbeat' : lu < 0.8 ? 'eighths' : 'onKick',
  };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The bar's shape after the macros have had their say: quiet thins toward silence, busy fills the gaps. */
export function barShape(b: BassMaterial, m: MacroValues, bar: number): BarShape {
  const i = bar % PHRASE_BARS;
  const s = b.shape[i]!;
  const dens = m.density ?? 0;
  const thin = clamp01((0.35 - dens) / 0.35) * 0.65;
  const fill = clamp01((dens - 0.7) / 0.3) * 0.7;
  if (unit(b.seed, 0x7417, i) < thin) return s === 'full' ? 'half' : s === 'fill' ? 'full' : 'rest';
  if (unit(b.seed, 0xf111, i) < fill) return s === 'rest' ? 'half' : s === 'half' || s === 'tail' ? 'full' : s;
  return s;
}

const RANGES: Record<BarShape, [number, number] | null> = { full: [0, 16], fill: [0, 16], half: [0, 8], rest: null, tail: [12, 16] };

/** The steps a bar shape sounds over, or null for a bar of silence. The sub follows it, so the whole low end drops out together. */
export const shapeRange = (s: BarShape): [number, number] | null => RANGES[s];

// ------------------------------------------------------------------ pitch

/** The bass register: E2 to D#3. Its fundamental sits above the sub's; the band split keeps the two apart. */
export const BASS_LO = 40;
export const BASS_HI = 51;

interface Choice {
  iv: number;
  w: number;
  tension?: boolean;
}

/**
 * What the bass may play over a chord, with weights. The root dominates, and at aggression 0 it is all there is. With aggression,
 * darkness brings in the near neighbours: the ♭2 above (where the scale has one, or over the tonic as a tagged rub) and the diatonic
 * seventh below. Only riffs leap, and only a little, to the octave and the fifth: big leaps are what made the old bass bounce.
 */
export function vocabulary(chord: Chord, h: HarmonyBar, style: BassStyle, a: number, dark: number): Choice[] {
  const scale = MODES[h.mode].map((x) => pc(h.key + x));
  const out: Choice[] = [{ iv: 0, w: 1 }];
  if (style === 'hold') return out;
  if (style === 'riff') out.push({ iv: 12, w: 0.25 * a }, { iv: fifthOf(chord), w: 0.2 * a });
  const near = a * (0.3 + 0.7 * dark);
  const deg = scale.indexOf(chord.root);
  if (deg >= 0) out.push({ iv: ((scale[(deg + 6) % 7]! - chord.root + 12) % 12) - 12, w: 0.2 * near });
  const flat2 = pc(chord.root + 1);
  if (scale.includes(flat2)) out.push({ iv: 1, w: 0.3 * near });
  else if (chord.root === h.key && h.tension.includes(flat2)) out.push({ iv: 1, w: 0.3 * near, tension: true });
  return out;
}

function pick(u: number, choices: Choice[]): Choice {
  const total = choices.reduce((x, c) => x + c.w, 0);
  let acc = 0;
  for (const c of choices) {
    acc += c.w / total;
    if (u < acc) return c;
  }
  return choices[0]!;
}

/** The bass root for a step: the chord's, or the tonic under a pedal, folded into the bass register. */
export const bassRoot = (h: HarmonyBar, step: number): number => foldInto(BASS_LO + pc((h.pedal ? h.key : chordAt(h, step).root) - pc(BASS_LO)), BASS_LO, BASS_HI);

/** Under a pedal the bass stays on the tonic, so it speaks the tonic chord's vocabulary, whatever moves above. */
const bassChord = (h: HarmonyBar, step: number): Chord => (h.pedal ? buildChord({ degree: 0 }, h.key, h.mode) : chordAt(h, step));

// ------------------------------------------------------------------ rhythm

const steps = (on: number[], w = 1): number[] => Array.from({ length: STEPS_PER_BAR }, (_, i) => (on.includes(i) ? w : 0));

export const KICK_STEPS = [0, 4, 8, 12];

const LOCKED: Record<LockedFeel, number[]> = {
  offbeat: steps([2, 6, 10, 14]),
  eighths: steps([0, 2, 4, 6, 8, 10, 12, 14]),
  onKick: steps(KICK_STEPS),
};

/** The syncopated templates a riff blends toward. */
const TEMPLATES = {
  rolling: Array.from({ length: STEPS_PER_BAR }, (_, i) => (i % 4 === 0 ? 0 : 0.8)),
  stab: steps([0, 3, 6, 8, 11, 14]).map((w, i) => (w ? (i % 4 === 0 ? 0.7 : 1) : 0.05)),
  acid: Array.from({ length: STEPS_PER_BAR }, (_, i) => (i % 4 === 0 ? 0.4 : 0.75)),
  broken: steps([0, 3, 7, 10, 13], 0.9).map((w) => w || 0.04),
};

/**
 * A riff's per-step probabilities. At aggression 0 it is exactly the locked feel; aggression and syncopation pull it off the grid. A
 * fill bar locks to every 8th and adds a little more off-grid push, scaled by aggression.
 */
export function riffProbabilities(b: BassMaterial, m: MacroValues, bar: number, fill = false): number[] {
  const a = m.aggression ?? 0;
  const s = m.syncopation ?? 0;
  const dark = m.darkness ?? 0;
  const dens = m.density ?? 0;
  const w = { rolling: a * (1 - s), stab: s * (1 - 0.8 * a), acid: a * s, broken: 0.8 * dark * (1 - dens) };
  const total = w.rolling + w.stab + w.acid + w.broken || 1;
  const extra = fill ? 0.25 * a : 0;
  return LOCKED[fill ? 'eighths' : b.locked].map((l, i) => {
    let busy = 0;
    for (const k of Object.keys(w) as (keyof typeof w)[]) busy += (w[k] / total) * TEMPLATES[k][i]!;
    if (w.acid > 0 && unit(b.seed, 0xac1d, bar % RIFF_BARS, i) < 0.22) busy *= 1 - w.acid / total;
    // The locked spine and the busy part combine as an OR; the spine holds until aggression is well up (1 - a^2).
    const spine = (1 - a * a) * l;
    const wild = clamp01(a * busy * (0.55 + 0.25 * dens) + extra);
    return clamp01(1 - (1 - spine) * (1 - wild));
  });
}

// ------------------------------------------------------------------ dynamics

/** Velocity multiplier at a point in the phrase (`pos`, 0..1) and the bar (`step`). */
export function velocityAt(b: BassMaterial, pos: number, step: number): number {
  const phrase = b.phraseCurve === 'rise' ? 0.6 + 0.4 * pos : b.phraseCurve === 'fall' ? 1 - 0.38 * pos : b.phraseCurve === 'arch' ? 0.68 + 0.32 * Math.sin(Math.PI * pos) : 1;
  const inBar = b.barCurve === 'pump' ? 1 - 0.3 * ((step % 4) / 4) : b.barCurve === 'swell' ? 0.74 + 0.26 * (step / 16) : 1;
  return phrase * inBar;
}

/** The cutoff multiplier at a point in the phrase. */
export function contourAt(c: Contour, pos: number): number {
  if (c === 'open') return 0.55 + 0.9 * pos;
  if (c === 'close') return 1.4 - 0.75 * pos;
  if (c === 'breathe') return 1 + 0.35 * Math.sin(4 * Math.PI * pos);
  return 1;
}

// ------------------------------------------------------------------ the part

export interface BassBar {
  notes: NoteEvent[];
  /** The held bass's swell, in steps, for the sub to share; absent when the bass attacks normally. */
  attack?: number;
  /** Timed parameter events: the cutoff contour across the bar. */
  params: ParamEvent[];
  shape: BarShape;
}

export class BassPart {
  constructor(public material: BassMaterial) {}

  /** One bar over the bar's harmony. `cutoff` is the patch's cutoff for this bar, from its mod routes; the contour rides on it. */
  render(h: HarmonyBar, m: MacroValues, bar: number, cutoff: number): BassBar {
    const b = this.material;
    const shape = barShape(b, m, bar);
    const range = RANGES[shape];
    const phraseBar = bar % PHRASE_BARS;
    const pos = (step: number): number => (phraseBar + step / STEPS_PER_BAR) / PHRASE_BARS;

    const params: ParamEvent[] = [];
    if (b.contour !== 'none') {
      for (const t of [0, 4, 8, 12]) params.push({ role: 'bass', path: 'filter.cutoff', value: cutoff * contourAt(b.contour, pos(t)), t, glide: t === 0 && phraseBar === 0 ? 1 : 4 });
    }
    if (!range) return { notes: [], params, shape };

    const notes = this.notes(h, m, bar, shape, range);
    for (const n of notes) n.vel = Math.min(1, n.vel * velocityAt(b, pos(n.t), n.t));
    const attack = b.style === 'hold' ? notes[0]?.shape?.attack : undefined;
    return attack === undefined ? { notes, params, shape } : { notes, params, shape, attack };
  }

  private notes(h: HarmonyBar, m: MacroValues, bar: number, shape: BarShape, [from, to]: [number, number]): NoteEvent[] {
    const b = this.material;
    const a = m.aggression ?? 0;
    const dark = m.darkness ?? 0;
    const dens = m.density ?? 0;
    const drive = m.drive ?? 0;
    const rb = bar % RIFF_BARS;
    const note = (t: number, iv = 0, extra: Partial<NoteEvent> = {}): NoteEvent => ({ t, role: 'bass', note: bassRoot(h, t) + iv, vel: 0.85, dur: 1, ...extra });

    if (b.style === 'hold') {
      // One note per chord inside the range, held to its end: a swell when it's quiet, a punch when it isn't, a filter that opens
      // across it, and a wobble that speeds up as the heat comes on.
      const out: NoteEvent[] = [];
      const cuts = [from, ...h.segments.map((s) => s.from).filter((x) => x > from && x < to), to];
      const period = drive < 0.35 ? 4 : drive < 0.65 ? 2 : 1;
      for (let k = 0; k < cuts.length - 1; k++) {
        const t = cuts[k]!;
        const len = cuts[k + 1]! - t;
        out.push(
          note(t, 0, {
            dur: len,
            vel: 0.95,
            slide: k > 0,
            shape: {
              attack: Math.max(0.15, 2.5 * (1 - dens) * (len / 8)),
              sweep: 1.5 + 2.5 * a,
              wobble: a > 0.2 || drive > 0.3 ? { period, periodTo: dens > 0.6 ? period / 2 : undefined, depth: 0.4 + 1.4 * Math.max(a, drive) } : undefined,
            },
          }),
        );
      }
      return out;
    }

    let on: number[];
    let gate: number;
    if (b.style === 'roll') {
      on = [];
      for (let t = from; t < to; t += 2) on.push(t);
      // Roll-ins when it's busy: a 16th leading into beats 3 and 1.
      if (dens > 0.7) for (const t of [7, 15]) if (t >= from && t < to && unit(b.seed, 0x7011, rb, t) < (dens - 0.7) * 3) on.push(t);
      on.sort((x, y) => x - y);
      gate = 0.85;
    } else if (b.style === 'pulse') {
      on = [];
      for (let t = from; t < to; t++) if (LOCKED[b.locked][t]) on.push(t);
      if (a > 0.6) for (let t = from; t < to; t++) if (!LOCKED[b.locked][t] && t % 2 === 1 && unit(b.seed, 0x9a15, rb, t) < (a - 0.6) * 0.6) on.push(t);
      on.sort((x, y) => x - y);
      gate = 0.5 + 0.3 * dark;
    } else {
      const probs = riffProbabilities(b, m, bar, shape === 'fill');
      on = [];
      for (let t = from; t < to; t++) if (unit(b.seed, 0x5e7, rb, t) < probs[t]!) on.push(t);
      gate = 0.5 + 0.35 * dark;
    }

    const out: NoteEvent[] = on.map((t, k) => {
      const prev = on[k - 1];
      // The first note, a downbeat, the first note over a new chord, and (in a roll) every beat anchor on the root.
      const anchor = k === 0 || t === 0 || (prev !== undefined && chordAt(h, prev) !== chordAt(h, t)) || (b.style === 'roll' && t % 4 === 0);
      const c = anchor ? { iv: 0, w: 1 } : pick(unit(b.seed, 0x917c, rb, t), vocabulary(bassChord(h, t), h, b.style, a, dark));
      const accent = b.style === 'riff' && a > 0 && unit(b.seed, 0xacc, rb, t) < 0.3 * a;
      const n = note(t, c.iv, { vel: accent ? 1 : t % 2 === 1 ? 0.7 : 0.85, accent });
      if (c.tension) n.tension = true;
      return n;
    });

    for (let k = 0; k < out.length; k++) {
      const n = out[k]!;
      const gap = (out[k + 1]?.t ?? to) - n.t;
      const g = unit(b.seed, 0x6a7e, rb, n.t);
      const gl = b.style === 'riff' ? (1 - a) * gate + a * (n.accent ? 0.6 + 0.3 * g : 0.25 + 0.5 * g) : gate;
      n.dur = Math.max(0.25, Math.min(gap, gap * gl));
      const next = out[k + 1];
      // Riffs slide a little when they're rough; nothing else slides.
      if (next && b.style === 'riff' && a > 0 && unit(b.seed, 0x511d, rb, next.t) < 0.25 * a) {
        next.slide = true;
        n.dur = gap;
      }
    }
    return out;
  }
}
