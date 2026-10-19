/**
 * Instrument definitions as data (docs/MUSIC_PLAN.md §6, §7). The synth builds voices from these; nothing about an instrument
 * lives in the audio code. Every number here is a first guess, to be tuned by ear.
 */
import type { Patch, RoleId } from '../types';

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
  level: 1,
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

export const PATCHES: Readonly<Record<Exclude<RoleId, 'kick'>, Patch>> = { sub: SUB, bass: BASS };
