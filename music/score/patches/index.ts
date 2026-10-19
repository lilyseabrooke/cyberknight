/**
 * Instrument definitions as data (docs/MUSIC_PLAN.md §6, §7). The synth builds voices from these; nothing about an instrument
 * lives in the audio code. Every number here is a first guess, to be tuned by ear.
 */
import type { Patch, PatchedRole } from '../types';

/** A sine and a whisper of its octave, so small speakers still hear it. Never driven, never sent to reverb. */
export const SUB: Patch = {
  id: 'sub',
  poly: 1,
  osc: [
    { wave: 'sine', octave: 0, detune: 0, level: 1 },
    { wave: 'sine', octave: 1, detune: 0, level: 0.03 },
  ],
  filter: { type: 'lowpass', cutoff: 90, q: 0.5, env: 0 },
  env: { amp: { a: 0.006, d: 0.1, s: 1, r: 0.08 } },
  glide: 0.02,
  bus: 'sub',
  level: 0.52,
  mods: [],
};

/**
 * The character bass: two detuned saws and a square an octave down, through a resonant lowpass, a tanh drive and a crusher,
 * then a highpass so the drive never muddies the sub's floor. Aggression takes it from round and clean to feral.
 */
export const BASS: Patch = {
  id: 'bass',
  poly: 1,
  osc: [
    { wave: 'saw', octave: 0, detune: -6, level: 0.5 },
    { wave: 'saw', octave: 0, detune: 6, level: 0.5 },
    { wave: 'square', octave: -1, detune: 0, level: 0.15 },
  ],
  filter: { type: 'lowpass', cutoff: 300, q: 1, env: 1 },
  env: { amp: { a: 0.003, d: 0.12, s: 0.7, r: 0.04 }, filterDecay: 0.18 },
  drive: { amount: 1, crush: 0 },
  post: { hp: 110 },
  glide: 0.04,
  accent: 0,
  bus: 'bass',
  level: 1.25,
  mods: [
    { src: 'macro:aggression', dst: 'filter.cutoff', range: [300, 900], curve: 'exp' },
    { src: 'macro:aggression', dst: 'filter.q', range: [1, 12], curve: 'exp' },
    { src: 'macro:aggression', dst: 'filter.env', range: [0.8, 3.2] },
    { src: 'macro:aggression', dst: 'env.filterDecay', range: [0.22, 0.09], curve: 'exp' },
    { src: 'macro:aggression', dst: 'drive.amount', range: [1, 20], curve: 'exp' },
    { src: 'macro:aggression', dst: 'drive.crush', range: [0, 0.45], window: [0.75, 1] },
    { src: 'macro:aggression', dst: 'osc.0.detune', range: [-2, -18] },
    { src: 'macro:aggression', dst: 'osc.1.detune', range: [2, 18] },
    { src: 'macro:aggression', dst: 'osc.2.level', range: [0.1, 0.4] },
    { src: 'macro:aggression', dst: 'accent', range: [0, 0.4] },
  ],
};

/** Detuned saws in unison, a slow swell and a long tail, lowpassed darker as danger rises, washed in reverb and pumped by the kick. */
export const PAD: Patch = {
  id: 'pad',
  poly: 8,
  osc: [
    { wave: 'saw', octave: 0, detune: -6, level: 0.4, unison: { voices: 3, spread: 22 } },
    { wave: 'saw', octave: 0, detune: 5, level: 0.3, unison: { voices: 2, spread: 12 } },
    { wave: 'tri', octave: -1, detune: 0, level: 0.2 },
  ],
  filter: { type: 'lowpass', cutoff: 2600, q: 0.5, env: 0 },
  env: { amp: { a: 0.9, d: 0.6, s: 0.85, r: 1.6 } },
  lfo: [{ rate: 0.11, shape: 'sine', dst: 'filter.cutoff', depth: 260 }],
  sends: { reverb: 0.5 },
  bus: 'beds',
  level: 0.07,
  mods: [{ src: 'macro:darkness', dst: 'filter.cutoff', range: [3800, 650], curve: 'exp' }],
};

/** The big 80s brass gone wrong: two saws, a fast filter blip, a little drive, short and punchy. */
export const STABS: Patch = {
  id: 'stabs',
  poly: 6,
  osc: [
    { wave: 'saw', octave: 0, detune: -11, level: 0.5 },
    { wave: 'saw', octave: 0, detune: 11, level: 0.5 },
  ],
  filter: { type: 'lowpass', cutoff: 800, q: 4, env: 2.4 },
  env: { amp: { a: 0.002, d: 0.22, s: 0.15, r: 0.12 }, filterDecay: 0.12 },
  drive: { amount: 2, crush: 0 },
  sends: { reverb: 0.3 },
  bus: 'music',
  level: 0.3,
  mods: [
    { src: 'macro:aggression', dst: 'filter.cutoff', range: [650, 2000], curve: 'exp' },
    { src: 'macro:aggression', dst: 'drive.amount', range: [1.5, 7], curve: 'exp' },
  ],
};

/** The tonic and its fifth, slowly beating against each other, under a lowpass that breathes over many bars. */
export const DRONE: Patch = {
  id: 'drone',
  poly: 1,
  osc: [
    { wave: 'sine', octave: 0, detune: 0, level: 0.5 },
    { wave: 'saw', octave: 0, detune: 4, level: 0.22 },
    { wave: 'saw', octave: 0, detune: 703, level: 0.16 },
    { wave: 'saw', octave: 0, detune: 696, level: 0.12 },
  ],
  filter: { type: 'lowpass', cutoff: 600, q: 2, env: 0 },
  env: { amp: { a: 2.5, d: 0.5, s: 1, r: 3 } },
  lfo: [{ rate: 0.045, shape: 'sine', dst: 'filter.cutoff', depth: 220 }],
  post: { hp: 70 },
  sends: { reverb: 0.55 },
  bus: 'beds',
  level: 0.22,
  mods: [{ src: 'macro:darkness', dst: 'filter.cutoff', range: [900, 380], curve: 'exp' }],
};

export const PATCHES: Readonly<Record<PatchedRole, Patch>> = { sub: SUB, bass: BASS, pad: PAD, stabs: STABS, drone: DRONE };
