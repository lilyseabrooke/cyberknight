import { Rng } from './rng.js';

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

export interface Archetype {
  id: string;
  label: string;
  /** Additive perturbation to the baseline drive weights. */
  shift: Partial<DriveWeights>;
}

export const ARCHETYPES: readonly Archetype[] = [
  { id: 'ditz', label: 'Airheaded ditz', shift: { curiosity: 0.45, quest: -0.2 } },
  { id: 'hothead', label: 'Hothead', shift: { bravery: 0.35, pride: 0.2, quest: -0.1 } },
  { id: 'romantic', label: 'Hopeless romantic', shift: { lust: 0.5, thirst: 0.1 } },
  { id: 'lush', label: 'Lush', shift: { thirst: 0.55, lust: 0.1 } },
  { id: 'gambler', label: 'Gambler', shift: { greed: 0.4, curiosity: 0.2 } },
];

export interface Personality {
  archetypeId: string;
  weights: DriveWeights;
}

export function rollPersonality(rng: Rng): Personality {
  const a = rng.pick(ARCHETYPES);
  const weights = { ...BASELINE };
  for (const d of DRIVES) {
    // archetype shift plus a little individual jitter
    weights[d] = clamp01(weights[d] + (a.shift[d] ?? 0) + (rng.next() - 0.5) * 0.1);
  }
  return { archetypeId: a.id, weights };
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
