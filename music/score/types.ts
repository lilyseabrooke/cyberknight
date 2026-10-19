/**
 * The music's shared vocabulary. Everything in `music/score/` is pure: no Web Audio types, so it runs under vitest in node.
 * See docs/MUSIC_PLAN.md.
 */

/** Sixteen 16th-note steps to a bar. Times inside a bar are in steps (fractions allowed). */
export const STEPS_PER_BAR = 16;

export type RoleId = 'sub' | 'bass' | 'kick';
export type BusId = 'sub' | 'bass' | 'drums';

/** One thing to play in the coming bar. */
export interface NoteEvent {
  /** Step within the bar, 0..15 (fractions allowed). */
  t: number;
  role: RoleId;
  /** MIDI note number. Absent for unpitched hits. */
  note?: number;
  /** 0..1. */
  vel: number;
  /** Length in steps. */
  dur: number;
  /** Glide into this note from the previous one (mono voices). */
  slide?: boolean;
  /** An accented note: louder and brighter. */
  accent?: boolean;
}

/** A patch parameter set for the coming bar, ramped to over the first part of the bar. */
export interface ParamEvent {
  role: RoleId;
  path: string;
  value: number;
}

/** What the conductor hands the scheduler for one bar. */
export interface Bar {
  index: number;
  bpm: number;
  notes: NoteEvent[];
  params: ParamEvent[];
  /** Steps the kick lands on, for the sidechain duck. */
  kicks: number[];
  /** The macro values the bar was rendered with. */
  macros: Readonly<Record<string, number>>;
}

// ------------------------------------------------------------------ patches

export interface Adsr {
  /** Seconds. */
  a: number;
  d: number;
  /** 0..1. */
  s: number;
  r: number;
}

export type Wave = 'sine' | 'tri' | 'saw' | 'square';

export interface OscLayer {
  wave: Wave;
  /** Octaves from the played note. */
  octave: number;
  /** Cents. */
  detune: number;
  /** 0..1. */
  level: number;
}

export interface Patch {
  id: string;
  /** 1 = mono (glide and legato allowed). Poly pools arrive in phase 2. */
  poly: 1;
  osc: OscLayer[];
  filter?: { type: 'lowpass' | 'bandpass' | 'highpass'; cutoff: number; q: number; /** Envelope depth, in octaves above the cutoff. */ env: number };
  env: { amp: Adsr; /** Filter envelope decay, seconds. */ filterDecay?: number };
  /** tanh saturation: `amount` is the pre-gain (1 = clean); `crush` is the wet mix of a stepped-curve crusher, 0..1. */
  drive?: { amount: number; crush: number };
  /** Band split after the drive, e.g. the bass's highpass that keeps its low end out of the sub's way. */
  post?: { hp?: number; lp?: number };
  /** Glide time constant, seconds. */
  glide?: number;
  bus: BusId;
  /** Output level, 0..1. */
  level: number;
  /** Accent depth: how much louder (and brighter) an accented note is, 0..1. */
  accent?: number;
  mods: ModRoute[];
}

/**
 * How the music bends a patch. Sources name a macro, a raw axis or a song trait by id, so axes and traits added later plug in
 * without code changes. Per-note and arranger sources arrive with the phases that produce them.
 */
export type ModSource = `macro:${string}` | `axis:${string}` | `trait:${string}`;

export interface ModRoute {
  src: ModSource;
  /** A parameter path, e.g. `filter.cutoff`. See `paramPaths`. */
  dst: string;
  range: [number, number];
  curve?: 'lin' | 'exp' | 'scurve';
  /** The part of the source's 0..1 that sweeps the range; below it the route sits at range[0], above it at range[1]. Default [0, 1]. */
  window?: [number, number];
}
