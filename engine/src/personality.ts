import { Rng } from './rng';

export type Drive = 'quest' | 'thirst' | 'lust' | 'greed' | 'bravery' | 'curiosity' | 'pride';

export const DRIVES: readonly Drive[] = [
  'quest',
  'thirst',
  'lust',
  'greed',
  'bravery',
  'curiosity',
  'pride',
];

export type DriveWeights = Record<Drive, number>;

/** Baseline: cocky, self-assured hero who knows she's the hero. */
export const BASELINE: DriveWeights = {
  quest: 0.6,
  thirst: 0.4,
  lust: 0.4,
  greed: 0.5,
  bravery: 0.6,
  curiosity: 0.4,
  pride: 0.7,
};

/**
 * Blackbird's personality is a vector of independent 0..1 traits, 0.5 being "unremarkable".
 * Every save rolls its own. Nothing is a category; a girl can be a vain, romantic, short-fused
 * lush who also happens to be terrifyingly honest.
 */
export const TRAITS = [
  // What she wants out of the night
  'fame', //        wants the whole city to know her name
  'justice', //     wants to put bad guys through walls
  'impress', //     wants to impress girls (plural, all of them)
  'romantic', //    wants The One, singular, and to be a good partner to her
  'drink', //       loves a drink, and then another
  'gamble', //      loves the odds, especially the bad ones
  'temper', //      how fast she goes from fine to swinging
  // Nerve and judgement
  'courage', //     how scary a thing has to be before she notices
  'reckless', //    how little she weighs the consequences
  'impulsive', //   how little she thinks before she does
  'thrill', //      adrenaline: she'll jump off things for fun
  // Appetites and curiosity
  'curiosity', //   pokes everything
  'greed', //       wants stuff, preferably other people's
  'appetite', //    loves to eat (and cook, and be fed)
  'techy', //       loves a terminal, a drone, a bad idea with wires
  'artistry', //    spray cans, guitars, anything that makes a mark
  // Character
  'vanity', //      pleased with her reflection
  'kindness', //    soft spot for strangers, strays and the helpless
  'honesty', //     doesn't steal, doesn't scam, doesn't lie (much)
  'loyalty', //     looks after her crew
  'grudge', //      never forgets who wronged her
  'mischief', //    chaos for its own sake
  'sociable', //    can't pass a stranger without talking to them
  'animal', //      loves dogs, pigeons, and drones that look like dogs
] as const;

export type Trait = (typeof TRAITS)[number];
export type Traits = Record<Trait, number>;

/** Short, in-fiction description of a trait when it's turned up high or down low. */
const TRAIT_LABEL: Record<Trait, [low: string, high: string]> = {
  fame: ['content to be anonymous', 'famewhore'],
  justice: ['not her problem', 'crusader'],
  impress: ['unbothered by girls', 'showboat'],
  romantic: ['commitment-phobe', 'hopeless romantic'],
  drink: ['teetotal-ish', 'lush'],
  gamble: ['risk-averse', 'gambler'],
  temper: ['unflappable', 'hothead'],
  courage: ['jumpy', 'fearless'],
  reckless: ['cautious', 'reckless'],
  impulsive: ['deliberate', 'impulsive'],
  thrill: ['homebody', 'adrenaline junkie'],
  curiosity: ['incurious', 'nosy'],
  greed: ['unmaterialistic', 'greedy'],
  appetite: ['picky eater', 'glutton'],
  techy: ['luddite', 'tech-fetishist'],
  artistry: ['philistine', 'artist'],
  vanity: ['self-effacing', 'vain'],
  kindness: ['hard-hearted', 'soft touch'],
  honesty: ['sticky-fingered', 'scrupulously honest'],
  loyalty: ['lone wolf', 'ride-or-die'],
  grudge: ['lets it go', 'grudge-keeper'],
  mischief: ['sensible', 'agent of chaos'],
  sociable: ['loner', 'chatterbox'],
  animal: ['indifferent to pets', 'animal lover'],
};

export interface Personality {
  traits: Traits;
  /** Drive weights derived from the traits at roll time, so the decision AI has one stable view. */
  weights: DriveWeights;
}

/** How each trait moves each drive, per unit of distance from 0.5. */
const DRIVE_LOADINGS: Record<Drive, Partial<Record<Trait, number>>> = {
  quest: { justice: 0.5, fame: 0.2, impulsive: -0.2 },
  thirst: { drink: 1.1 },
  lust: { impress: 0.6, romantic: 0.4, sociable: 0.1 },
  greed: { greed: 1.0, gamble: 0.3, honesty: -0.3 },
  bravery: { courage: 0.8, temper: 0.3, reckless: 0.3, justice: 0.2 },
  curiosity: { curiosity: 1.0, mischief: 0.3, techy: 0.2, impulsive: 0.2 },
  pride: { vanity: 0.6, fame: 0.5, temper: 0.2 },
};

export function driveWeights(traits: Traits): DriveWeights {
  const out = { ...BASELINE };
  for (const d of DRIVES) {
    let v = BASELINE[d];
    for (const [t, k] of Object.entries(DRIVE_LOADINGS[d])) v += k * (traits[t as Trait] - 0.5);
    out[d] = clamp01(v);
  }
  return out;
}

/** A trait's offset from unremarkable, -0.5..0.5. */
export const lean = (p: Personality, t: Trait): number => p.traits[t] - 0.5;

/**
 * Roll a personality. Each trait is the mean of two uniforms (a gentle bell), stretched so
 * that real extremes turn up often enough to be a character without every save being a cartoon.
 */
export function rollPersonality(rng: Rng): Personality {
  const traits = {} as Traits;
  for (const t of TRAITS) {
    const bell = (rng.next() + rng.next()) / 2;
    traits[t] = round2(clamp01(0.5 + (bell - 0.5) * 1.5));
  }
  return { traits, weights: driveWeights(traits) };
}

/** Build a personality from partial traits (the rest unremarkable). For tests and tools. */
export function personalityFrom(partial: Partial<Traits>): Personality {
  const traits = Object.fromEntries(TRAITS.map((t) => [t, partial[t] ?? 0.5])) as Traits;
  return { traits, weights: driveWeights(traits) };
}

/** The traits she's most and least defined by, as short labels for display. */
export function describePersonality(p: Personality, count = 3): string {
  return [...TRAITS]
    .sort((a, b) => Math.abs(p.traits[b] - 0.5) - Math.abs(p.traits[a] - 0.5))
    .slice(0, count)
    .map((t) => TRAIT_LABEL[t][p.traits[t] >= 0.5 ? 1 : 0])
    .join(', ');
}

const FIRST = ['Brenda', 'Gary-Ann', 'Doreen', 'Marjorie', 'Kevin', 'Sharon', 'Bernadette', 'Trevor'];
const LAST = ['Pilchard', 'Fosdyke', 'Throgmorton', 'Biddlecombe', 'Higgenbottom', 'Plunkett', 'Wetherby'];

/** Astonishingly uncool government name. */
export function rollGovernmentName(rng: Rng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
