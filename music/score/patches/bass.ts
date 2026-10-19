/**
 * The bass sounds. Each bass style picks between a couple of these per piece (`SOUNDS_FOR` in roles/bass.ts), so the low end
 * changes character from song to song as well as pattern. All of them share the band split (a 72 Hz highpass that keeps them off the
 * sub's floor, a lowpass around 2.2-2.6 kHz that keeps the fizz off) and stay mono below a few hundred Hz; any width is side-only,
 * above `width.hp`. Every number is a first guess, to be tuned by ear.
 */
import type { ModRoute, Patch } from '../types';

export type BassSound = 'classic' | 'reese' | 'talker' | 'fm' | 'growl' | 'knock' | 'acid';
export const BASS_SOUNDS_LIST: BassSound[] = ['classic', 'reese', 'talker', 'fm', 'growl', 'knock', 'acid'];

const SPLIT = { hp: 72, lp: 2400 };
const aggr = (dst: string, range: [number, number], curve?: ModRoute['curve'], window?: [number, number]): ModRoute => {
  const r: ModRoute = { src: 'macro:aggression', dst, range };
  if (curve) r.curve = curve;
  if (window) r.window = window;
  return r;
};

/** The phase-2 bass, kept as the reference: two saws and a square through a plain lowpass and a drive. */
const classic: Patch = {
  id: 'bass-classic',
  poly: 1,
  osc: [
    { wave: 'saw', octave: 0, detune: -4, level: 0.45 },
    { wave: 'saw', octave: 0, detune: 4, level: 0.35 },
    { wave: 'square', octave: 0, detune: 0, level: 0.35 },
  ],
  filter: { type: 'lowpass', cutoff: 220, q: 0.8, env: 0.8 },
  env: { amp: { a: 0.004, d: 0.25, s: 0.85, r: 0.07 }, filterDecay: 0.22 },
  drive: { amount: 1.5, crush: 0 },
  post: SPLIT,
  glide: 0.05,
  accent: 0,
  bus: 'bass',
  monoBelow: 200,
  level: 1.25,
  mods: [
    aggr('filter.cutoff', [200, 560], 'exp'),
    aggr('filter.q', [0.7, 5], 'exp'),
    aggr('filter.env', [0.6, 2.1]),
    aggr('env.filterDecay', [0.26, 0.12], 'exp'),
    aggr('drive.amount', [1.5, 16], 'exp'),
    aggr('drive.crush', [0, 0.18], undefined, [0.85, 1]),
    aggr('osc.0.detune', [-3, -12]),
    aggr('osc.1.detune', [3, 12]),
    aggr('osc.2.level', [0.3, 0.45]),
    aggr('accent', [0, 0.3]),
  ],
};

/**
 * Reese: two stacks of detuned saws that drift against each other on slow, unrelated LFOs, so the phasing never repeats, over a
 * square for body. Wide on top, a mid band driven in parallel for grit. The held bass's natural voice.
 */
const reese: Patch = {
  id: 'bass-reese',
  poly: 1,
  osc: [
    { wave: 'saw', octave: 0, detune: -7, level: 0.5, unison: { voices: 3, spread: 18, pan: 0.6 } },
    { wave: 'saw', octave: 0, detune: 7, level: 0.5, unison: { voices: 3, spread: 22, pan: 0.6 } },
    { wave: 'square', octave: 0, detune: 0, level: 0.22 },
  ],
  filter: { type: 'lowpass', cutoff: 320, q: 0.7, env: 0.35 },
  env: { amp: { a: 0.01, d: 0.3, s: 0.9, r: 0.18 }, filterDecay: 0.3 },
  drive: { amount: 2, crush: 0 },
  parallel: { freq: 600, q: 0.9, drive: 6, mix: 0.2 },
  lfo: [
    { rate: 0.13, shape: 'sine', dst: 'detune', layer: 0, depth: 9 },
    { rate: 0.21, shape: 'sine', dst: 'detune', layer: 1, depth: 11 },
  ],
  width: { amount: 0.5, hp: 350 },
  post: { hp: 72, lp: 2200 },
  glide: 0.08,
  accent: 0,
  bus: 'bass',
  monoBelow: 250,
  level: 1.05,
  mods: [
    aggr('filter.cutoff', [240, 700], 'exp'),
    aggr('filter.q', [0.7, 3]),
    aggr('drive.amount', [2, 14], 'exp'),
    aggr('parallel.mix', [0.1, 0.45]),
    aggr('lfo.0.depth', [7, 16]),
    aggr('lfo.1.depth', [9, 19]),
  ],
};

/** Talker: a reese through a vowel bank, its wobble moving the vowel (oo-ah-oo) instead of the cutoff. The "yoy" growl. */
const talker: Patch = {
  id: 'bass-talker',
  poly: 1,
  osc: [
    { wave: 'saw', octave: 0, detune: -6, level: 0.55, unison: { voices: 2, spread: 16, pan: 0.5 } },
    { wave: 'saw', octave: 0, detune: 6, level: 0.55, unison: { voices: 2, spread: 20, pan: 0.5 } },
    { wave: 'square', octave: 0, detune: 0, level: 0.25 },
  ],
  filter: { type: 'lowpass', cutoff: 300, q: 0.7, env: 0.3 },
  formant: { vowel: 0.2, mix: 0.7 },
  wobbleTo: 'vowel',
  env: { amp: { a: 0.01, d: 0.3, s: 0.9, r: 0.18 }, filterDecay: 0.3 },
  drive: { amount: 2.5, crush: 0 },
  lfo: [
    { rate: 0.17, shape: 'sine', dst: 'detune', layer: 0, depth: 8 },
    { rate: 0.11, shape: 'sine', dst: 'detune', layer: 1, depth: 10 },
  ],
  width: { amount: 0.45, hp: 350 },
  post: { hp: 72, lp: 2400 },
  glide: 0.08,
  accent: 0,
  bus: 'bass',
  monoBelow: 250,
  level: 1.1,
  mods: [
    aggr('filter.cutoff', [220, 520], 'exp'),
    aggr('formant.vowel', [0.1, 0.55]),
    aggr('formant.mix', [0.55, 0.85]),
    aggr('drive.amount', [2.5, 12], 'exp'),
  ],
};

/**
 * FM: a sine carrier modulated at 1:1 (which leans it toward a saw), the index flaring at every attack and settling: round when
 * calm, snarling when it isn't. A thin saw underneath for buzz, a mid band driven in parallel.
 */
const fm: Patch = {
  id: 'bass-fm',
  poly: 1,
  osc: [
    { wave: 'sine', octave: 0, detune: 0, level: 0.75, fm: { ratio: 1, index: 1.5, env: 2.4, decay: 0.12 } },
    { wave: 'saw', octave: 0, detune: 5, level: 0.14 },
  ],
  filter: { type: 'lowpass', cutoff: 900, q: 0.5, env: 0.4 },
  env: { amp: { a: 0.003, d: 0.25, s: 0.8, r: 0.08 }, filterDecay: 0.18 },
  drive: { amount: 2, crush: 0 },
  parallel: { freq: 500, q: 1, drive: 8, mix: 0.3 },
  width: { amount: 0.3, hp: 400 },
  post: SPLIT,
  glide: 0.05,
  accent: 0,
  bus: 'bass',
  monoBelow: 200,
  level: 1.15,
  mods: [
    aggr('osc.0.fm', [0.8, 4.2]),
    aggr('filter.cutoff', [500, 1400], 'exp'),
    aggr('drive.amount', [1.5, 9], 'exp'),
    aggr('parallel.mix', [0.15, 0.5]),
    aggr('accent', [0, 0.3]),
  ],
};

/**
 * Growl: saws and a square through a resonant lowpass that a fast (38 Hz) LFO shakes, which reads as a growl rather than a
 * wobble, a comb tuned to each note for a metallic snarl, and a hard parallel mid drive.
 */
const growl: Patch = {
  id: 'bass-growl',
  poly: 1,
  osc: [
    { wave: 'saw', octave: 0, detune: -6, level: 0.45 },
    { wave: 'saw', octave: 0, detune: 6, level: 0.4 },
    { wave: 'square', octave: 0, detune: 0, level: 0.3 },
  ],
  filter: { type: 'lowpass', cutoff: 380, q: 3, env: 0.9 },
  env: { amp: { a: 0.004, d: 0.25, s: 0.85, r: 0.07 }, filterDecay: 0.2 },
  drive: { amount: 3, crush: 0 },
  parallel: { freq: 700, q: 1.2, drive: 10, mix: 0.35 },
  comb: { feedback: 0.5, mix: 0.3 },
  lfo: [{ rate: 38, shape: 'sine', dst: 'filter.cutoff', depth: 60 }],
  width: { amount: 0.35, hp: 400 },
  post: SPLIT,
  glide: 0.05,
  accent: 0,
  bus: 'bass',
  monoBelow: 200,
  level: 1.1,
  mods: [
    aggr('filter.cutoff', [260, 700], 'exp'),
    aggr('lfo.0.depth', [40, 420], 'exp'),
    aggr('comb.feedback', [0.3, 0.75]),
    aggr('drive.amount', [2, 14], 'exp'),
    aggr('parallel.mix', [0.2, 0.55]),
  ],
};

/** Knock: a punchy square-and-saw pluck with a pitch drop and a click at every note, so a pulse hits instead of thudding. */
const knock: Patch = {
  id: 'bass-knock',
  poly: 1,
  osc: [
    { wave: 'square', octave: 0, detune: 0, level: 0.6 },
    { wave: 'saw', octave: 0, detune: -5, level: 0.3 },
  ],
  filter: { type: 'lowpass', cutoff: 260, q: 1, env: 1.6 },
  env: { amp: { a: 0.002, d: 0.18, s: 0.55, r: 0.05 }, filterDecay: 0.1 },
  drive: { amount: 1.8, crush: 0 },
  parallel: { freq: 650, q: 1, drive: 5, mix: 0.15 },
  knock: { semis: 12, decay: 0.03, click: 0.25 },
  width: { amount: 0.25, hp: 450 },
  post: SPLIT,
  glide: 0.04,
  accent: 0,
  bus: 'bass',
  monoBelow: 200,
  level: 1.25,
  mods: [
    aggr('filter.cutoff', [220, 520], 'exp'),
    aggr('filter.env', [1.2, 2.4]),
    aggr('drive.amount', [1.5, 8], 'exp'),
    aggr('parallel.mix', [0.1, 0.35]),
    aggr('accent', [0, 0.3]),
  ],
};

/** Acid: one saw through a resonant lowpass with a deep, fast pluck: the squelch, held down by the band split. */
const acid: Patch = {
  id: 'bass-acid',
  poly: 1,
  osc: [
    { wave: 'saw', octave: 0, detune: 0, level: 0.9 },
    { wave: 'square', octave: 0, detune: 0, level: 0.15 },
  ],
  filter: { type: 'lowpass', cutoff: 260, q: 6, env: 2.6 },
  env: { amp: { a: 0.003, d: 0.2, s: 0.8, r: 0.05 }, filterDecay: 0.14 },
  drive: { amount: 2, crush: 0 },
  width: { amount: 0.3, hp: 450 },
  post: { hp: 72, lp: 2600 },
  glide: 0.06,
  accent: 0,
  bus: 'bass',
  monoBelow: 200,
  level: 1.1,
  mods: [
    aggr('filter.cutoff', [220, 600], 'exp'),
    aggr('filter.q', [4, 11]),
    aggr('filter.env', [1.6, 3.2]),
    aggr('env.filterDecay', [0.18, 0.1], 'exp'),
    aggr('drive.amount', [2, 12], 'exp'),
    aggr('accent', [0, 0.4]),
  ],
};

export const BASS_SOUNDS: Readonly<Record<BassSound, Patch>> = { classic, reese, talker, fm, growl, knock, acid };

/** A bass patch by its id, for the synth. */
export const bassPatchById = (id: string): Patch | undefined => Object.values(BASS_SOUNDS).find((p) => p.id === id);
