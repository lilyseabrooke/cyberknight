import { Rng } from './rng';
import type { Gender, Npc } from './types';

/**
 * Who people are, beyond what they do for a living. Everyone has an age (and everyone is an
 * adult: 18 is the floor, always) and a gender, rolled when they're made.
 *
 * These come from a stream of their own, keyed on who they are, never from the stream the
 * caller hands in: adding a trait to every person mustn't shuffle anybody's dice.
 */

export const MIN_AGE = 18;
/** Blackbird's own age, for how far apart two people are. */
export const HERO_AGE = 26;

export interface PersonSpec {
  /** Chance of being a woman (the rest are men, with a few non-binary people among them). Default 0.5. */
  women?: number;
  /** Age range, inclusive. Default 22-55. */
  age?: [number, number];
  /** Machines and monsters. */
  machine?: boolean;
}

export function rollPerson(id: string, name: string, spec: PersonSpec = {}, over: { gender?: Gender; age?: number } = {}): { gender: Gender; age: number } {
  if (spec.machine) return { gender: 'none', age: Math.max(MIN_AGE, over.age ?? 30) };
  const rng = new Rng(`person:${id}:${name}`);
  const [lo, hi] = spec.age ?? [22, 55];
  // A bit of a bell: most people cluster nearer the middle than the ends.
  const age = over.age ?? Math.round(lo + (hi - lo) * (rng.next() + rng.next()) / 2);
  const roll = rng.next();
  const women = spec.women ?? 0.5;
  const gender: Gender = over.gender ?? (roll < women ? 'woman' : roll < women + (1 - women) * 0.06 ? 'nonbinary' : 'man');
  return { gender, age: Math.max(MIN_AGE, age) };
}

/**
 * Who Blackbird considers fair game: every woman, whatever her situation, whatever her age.
 * Whether it works out is another matter. This is the one place that decides who she goes for.
 *
 * Street kids are left out until the archetype is rewritten as adults; see the note in DESIGN.md.
 */
export function isFairGame(n: Npc): boolean {
  if (!n.alive || n.gender !== 'woman' || n.age < MIN_AGE) return false;
  if (n.archetype === 'street_kid' || n.archetype === 'puppy') return false;
  return !n.tags.some((t) => ['robot', 'pet', 'boss', 'dragon', 'kid'].includes(t));
}

/** Years between two people. */
export const ageGap = (n: Npc): number => Math.abs(n.age - HERO_AGE);
