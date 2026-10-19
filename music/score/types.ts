/**
 * The music's shared vocabulary. Everything in `music/score/` is pure: no Web Audio types, so it runs under vitest in node.
 * See docs/MUSIC_PLAN.md.
 */

/** Sixteen 16th-note steps to a bar. Times inside a bar are in steps (fractions allowed). */
export const STEPS_PER_BAR = 16;

/** Pitched roles played by patches. */
export type PatchedRole = 'sub' | 'bass' | 'pad' | 'stabs' | 'drone';
/** Unpitched hits, played by the drum synth (or samples, later). */
export type DrumRole = 'kick' | 'hat' | 'openhat' | 'clap' | 'snare' | 'perc';
export type RoleId = PatchedRole | DrumRole;
export type BusId = 'sub' | 'bass' | 'drums' | 'beds' | 'music';

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
  /** A deliberate note outside the scale (a ♭2 rub, a ♭5): the scale check lets these through. */
  tension?: boolean;
  /** Which sound, for roles with more than one (perc: 0 clank, 1 rim). */
  variant?: number;
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
  /** Trance-gate depth on the beds this bar, 0 = off. */
  bedGate: number;
  /** What the harmony was doing, for readouts and tests. */
  harmony: HarmonyBar;
}

/** A chord, as pitch classes. */
export interface Chord {
  /** Pitch class of the chord's root, 0 = C. */
  root: number;
  quality: Quality;
  /** Pitch classes, root first. */
  tones: number[];
  /** Roman numeral against the key, e.g. `i`, `VI`, `♭II`. */
  label: string;
}

export type Quality = 'min' | 'maj' | 'dim' | 'sus2' | 'sus4' | 'power';

/** The harmony of one bar: one or more chords, each over a span of steps. */
export interface HarmonyBar {
  /** Pitch class of the key's root. */
  key: number;
  mode: ModeName;
  segments: { from: number; to: number; chord: Chord }[];
  /** The bass, sub and drone are pinned to the tonic while the chords move above. */
  pedal: boolean;
  /** Pitch classes allowed as tension notes this bar (beyond the scale and the chord). */
  tension: number[];
}

export type ModeName = 'aeolian' | 'phrygian' | 'dorian' | 'harmonic';

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
  /** Cents. 700 is a fifth up. */
  detune: number;
  /** 0..1. */
  level: number;
  /** Several oscillators spread around `detune`: supersaw and friends. */
  unison?: { voices: number; /** Total spread, in cents. */ spread: number };
}

/** A free-running low-frequency oscillator into a parameter. */
export interface Lfo {
  /** Hz. */
  rate: number;
  shape: 'sine' | 'tri';
  dst: 'filter.cutoff' | 'pitch' | 'level';
  /** In the destination's units: Hz for the cutoff, cents for pitch, gain for level. */
  depth: number;
}

export interface Patch {
  id: string;
  /** 1 = a mono voice (glide and legato allowed); more = a pool of that many voices. */
  poly: number;
  osc: OscLayer[];
  filter?: { type: 'lowpass' | 'bandpass' | 'highpass'; cutoff: number; q: number; /** Envelope depth, in octaves above the cutoff. */ env: number };
  env: { amp: Adsr; /** Filter envelope decay, seconds. */ filterDecay?: number };
  /** tanh saturation: `amount` is the pre-gain (1 = clean); `crush` is the wet mix of a stepped-curve crusher, 0..1. */
  drive?: { amount: number; crush: number };
  /** Band split after the drive, e.g. the bass's highpass that keeps its low end out of the sub's way. */
  post?: { hp?: number; lp?: number };
  /** Glide time constant, seconds. */
  glide?: number;
  lfo?: Lfo[];
  /** How much goes to the shared reverb, 0..1. */
  sends?: { reverb?: number };
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
