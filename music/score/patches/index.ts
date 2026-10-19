/**
 * Instrument definitions as data (docs/MUSIC_PLAN.md §6, §7). The synth builds voices from these; nothing about an instrument
 * lives in the audio code. Every number here is a first guess, to be tuned by ear.
 */
import type { Patch, PatchedRole } from '../types';
import { BASS_SOUNDS } from './bass';

export { BASS_SOUNDS, bassPatchById, BASS_SOUNDS_LIST, type BassSound } from './bass';

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

/** The bass patch the score falls back on. The bass part picks its own sound per piece from `BASS_SOUNDS`. */
export const BASS: Patch = BASS_SOUNDS.classic;

/** Detuned saws in unison, a slow swell and a long tail, lowpassed darker as danger rises, washed in reverb and pumped by the kick. */
export const PAD: Patch = {
  id: 'pad',
  poly: 8,
  osc: [
    { wave: 'saw', octave: 0, detune: -6, level: 0.4, unison: { voices: 3, spread: 22, pan: 0.75 } },
    { wave: 'saw', octave: 0, detune: 5, level: 0.3, unison: { voices: 2, spread: 12, pan: 0.5 } },
    { wave: 'tri', octave: -1, detune: 0, level: 0.2 },
  ],
  filter: { type: 'lowpass', cutoff: 2600, q: 0.5, env: 0 },
  env: { amp: { a: 0.9, d: 0.6, s: 0.85, r: 1.6 } },
  lfo: [{ rate: 0.11, shape: 'sine', dst: 'filter.cutoff', depth: 260 }],
  sends: { reverb: 0.5 },
  monoBelow: 150,
  bus: 'beds',
  level: 0.07,
  mods: [{ src: 'macro:darkness', dst: 'filter.cutoff', range: [3800, 650], curve: 'exp' }],
};

/** The big 80s brass gone wrong: two saws, a fast filter blip, a little drive, short and punchy. */
export const STABS: Patch = {
  id: 'stabs',
  poly: 6,
  osc: [
    { wave: 'saw', octave: 0, detune: -11, level: 0.5, pan: -0.35 },
    { wave: 'saw', octave: 0, detune: 11, level: 0.5, pan: 0.35 },
  ],
  filter: { type: 'lowpass', cutoff: 800, q: 4, env: 2.4 },
  env: { amp: { a: 0.002, d: 0.22, s: 0.15, r: 0.12 }, filterDecay: 0.12 },
  drive: { amount: 2, crush: 0 },
  sends: { reverb: 0.3 },
  monoBelow: 180,
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
    { wave: 'saw', octave: 0, detune: 703, level: 0.16, pan: -0.35 },
    { wave: 'saw', octave: 0, detune: 696, level: 0.12, pan: 0.35 },
  ],
  filter: { type: 'lowpass', cutoff: 600, q: 2, env: 0 },
  env: { amp: { a: 2.5, d: 0.5, s: 1, r: 3 } },
  lfo: [{ rate: 0.045, shape: 'sine', dst: 'filter.cutoff', depth: 220 }],
  post: { hp: 70 },
  sends: { reverb: 0.55 },
  monoBelow: 200,
  bus: 'beds',
  level: 0.22,
  mods: [{ src: 'macro:darkness', dst: 'filter.cutoff', range: [900, 380], curve: 'exp' }],
};

export const PATCHES: Readonly<Record<PatchedRole, Patch>> = { sub: SUB, bass: BASS, pad: PAD, stabs: STABS, drone: DRONE };
