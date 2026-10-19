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
 * The character bass: two lightly detuned saws and a square at pitch for body, through a lowpass that stays low (the growl lives
 * between 100 Hz and 1 kHz), a tanh drive, a little crush at the very top, then a band split: a highpass at 72 Hz that lets the
 * bass's own fundamental through but keeps it off the sub's floor, and a lowpass at 2.4 kHz that takes the fizz off the drive.
 * Aggression mostly adds weight and teeth (drive, resonance, a deeper pluck), not brightness.
 */
export const BASS: Patch = {
  id: 'bass',
  poly: 1,
  osc: [
    { wave: 'saw', octave: 0, detune: -4, level: 0.45 },
    { wave: 'saw', octave: 0, detune: 4, level: 0.35 },
    { wave: 'square', octave: 0, detune: 0, level: 0.35 },
  ],
  filter: { type: 'lowpass', cutoff: 220, q: 0.8, env: 0.8 },
  env: { amp: { a: 0.004, d: 0.25, s: 0.85, r: 0.07 }, filterDecay: 0.22 },
  drive: { amount: 1.5, crush: 0 },
  post: { hp: 72, lp: 2400 },
  glide: 0.05,
  accent: 0,
  bus: 'bass',
  level: 1.25,
  mods: [
    { src: 'macro:aggression', dst: 'filter.cutoff', range: [200, 560], curve: 'exp' },
    { src: 'macro:aggression', dst: 'filter.q', range: [0.7, 5], curve: 'exp' },
    { src: 'macro:aggression', dst: 'filter.env', range: [0.6, 2.1] },
    { src: 'macro:aggression', dst: 'env.filterDecay', range: [0.26, 0.12], curve: 'exp' },
    { src: 'macro:aggression', dst: 'drive.amount', range: [1.5, 16], curve: 'exp' },
    { src: 'macro:aggression', dst: 'drive.crush', range: [0, 0.18], window: [0.85, 1] },
    { src: 'macro:aggression', dst: 'osc.0.detune', range: [-3, -12] },
    { src: 'macro:aggression', dst: 'osc.1.detune', range: [3, 12] },
    { src: 'macro:aggression', dst: 'osc.2.level', range: [0.3, 0.45] },
    { src: 'macro:aggression', dst: 'accent', range: [0, 0.3] },
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
