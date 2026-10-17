import type { DragonTemper, Flight, Id, World } from './types';
import type { Rng } from './rng';
import { normalize, paceOf } from './cars';
import { skillValue } from './skills';

/**
 * The dragons that fly: which family each belongs to, how fast it goes, and what sets it apart. Hera and Artemis are here
 * too; CINDERJAW isn't, because he doesn't go anywhere. The numbers on the fight board (hp, power) are on the archetypes.
 *
 * Speed is one number on the scale the fight board uses: tiles a round. The city runs on it too, as a ratio to the hero's
 * (see `reachPerBeat`). That is the whole of "can she keep up with it, or get away": nothing else decides it, so when she
 * gets faster (or gets a vehicle), `heroSpeed` is the only thing that has to learn.
 */

export type DragonFamily = Flight['kind'];
export type DragonTrait =
  /** Won't hold still to be fought: it has to be run down first. */
  | 'swift'
  /** The fight board won't let her flee it while it's faster than she is. */
  | 'relentless'
  /** Follows her from place to place at its own speed. */
  | 'tracks'
  /** Announces itself before it arrives. */
  | 'screams';

/** What a dragon does with a district it has flown into. Hera has none: she hangs over wherever she is. */
export type Pattern = 'prowl' | 'rampage' | 'deliver' | 'sweep';

export interface DragonModel {
  family: DragonFamily;
  mark: number;
  speed: number;
  traits: DragonTrait[];
  pattern?: Pattern;
}

const PATTERN: Partial<Record<DragonFamily, Pattern>> = { demeter: 'prowl', ares: 'rampage', hermes: 'deliver', artemis: 'sweep' };
const m = (family: DragonFamily, mark: number, speed: number, ...traits: DragonTrait[]): DragonModel => ({ family, mark, speed, traits, pattern: PATTERN[family] });

/** On the fight board an ordinary person goes 3 and Blackbird 3-7, so these read against her. */
export const DRAGON_MODELS: Record<string, DragonModel> = {
  artemis: m('artemis', 1, 3),
  hera: m('hera', 5, 3),
  hermes: m('hermes', 1, 4),
  hermes3: m('hermes', 3, 12, 'swift'),
  demeter: m('demeter', 1, 2),
  demeter2: m('demeter', 2, 2),
  demeter3: m('demeter', 3, 2),
  demeter4: m('demeter', 4, 3),
  artemis2: m('artemis', 2, 5, 'tracks'),
  ares2: m('ares', 2, 4),
  ares4: m('ares', 4, 10, 'relentless', 'screams'),
};

/** What the board assumes for a dragon it has no entry for (CINDERJAW). */
export const DEFAULT_DRAGON_SPEED = 3;

export const modelOf = (archetype: string | undefined): DragonModel | undefined => (archetype ? DRAGON_MODELS[archetype] : undefined);
export const flightModel = (f: Pick<Flight, 'kind' | 'model'>): DragonModel => DRAGON_MODELS[f.model ?? f.kind]!;
export const dragonSpeed = (archetype: string): number => DRAGON_MODELS[archetype]?.speed ?? DEFAULT_DRAGON_SPEED;
export const hasTrait = (archetype: string | undefined, t: DragonTrait): boolean => !!modelOf(archetype)?.traits.includes(t);

/** How fast her legs take her, on the same scale. The fight board adds her footwork on top for the round itself. */
export function legSpeed(w: World): number {
  const h = w.hero;
  return Math.max(1, Math.min(7, 3 + (h.reflex >= 6 ? 1 : 0) + (h.implants.includes('hydraulic_calves') ? 1 : 0) - (h.injuries.includes('broken_leg') ? 1 : 0)));
}

/**
 * How fast she gets around, on the same scale: her legs, or the car she is driving (its top speed less what the damage has
 * cost it, and a good driver gets more out of it). This is the seam vehicles plug into: what makes a Hermes Mk. III
 * catchable and an Ares Mk. IV escapable.
 */
export function heroSpeed(w: World): number {
  const v = w.hero.vehicle;
  const legs = legSpeed(w);
  if (!v) return legs;
  return Math.max(legs, Math.min(20, paceOf(normalize(v)) + skillValue(w.hero, 'driving') / 10));
}

/** How far ahead of her a dragon starts when she sets off after it, in tiles. */
export const HEAD_START = 8;
/** How many beats she can keep a chase up. */
export const CHASE_BEATS = 4;

/** Does she close the gap? She gains on it by the difference in speed each beat, or loses ground if it is the faster. */
export function runsDown(w: World, speed: number): boolean {
  const gain = heroSpeed(w) - speed;
  return gain > 0 && gain * CHASE_BEATS >= HEAD_START;
}

/** Hops a dragon makes up on her in one beat, as she goes about her business: its speed against hers. */
export const reachPerBeat = (w: World, speed: number): number => speed / heroSpeed(w);

/** World minutes a dragon takes to cross one hop of street, at its speed. Blackbird at speed 3 does it in three. */
export const hopMinutes = (speed: number): number => 9 / Math.max(1, speed);

/** A flight is over (it was fought, or it left): it is no longer in the world's list, nor the one she is with. */
export function dropFlights(w: World, ids: Id[]): void {
  w.flights = (w.flights ?? []).filter((f) => !f.ids.some((i) => ids.includes(i)));
  if (w.flight && w.flight.ids.some((i) => ids.includes(i))) w.flight = null;
}

// ===================================================================== personality

export const TEMPER_KEYS = ['curiosity', 'aggression', 'territoriality', 'patience', 'alertness'] as const;

/** What a family is like on average. Each dragon is a variation. */
export const FAMILY_TEMPER: Record<DragonFamily, DragonTemper> = {
  artemis: { curiosity: 0.5, aggression: 0.5, territoriality: 0.3, patience: 0.3, alertness: 0.8 },
  hera: { curiosity: 0.4, aggression: 0.7, territoriality: 0.2, patience: 0.5, alertness: 0.5 },
  hermes: { curiosity: 0.5, aggression: 0.1, territoriality: 0.1, patience: 0.2, alertness: 0.4 },
  demeter: { curiosity: 0.4, aggression: 0.3, territoriality: 0.5, patience: 0.8, alertness: 0.6 },
  ares: { curiosity: 0.3, aggression: 0.85, territoriality: 0.4, patience: 0.3, alertness: 0.5 },
};

/** A dragon's own temper: its family's, each dial moved by up to about a third either way. */
export function rollTemper(rng: Rng, family: DragonFamily): DragonTemper {
  const base = FAMILY_TEMPER[family];
  const out = { ...base };
  for (const k of TEMPER_KEYS) out[k] = Math.max(0, Math.min(1, Math.round((base[k] + (rng.int(-1000, 1000) / 1000) * 0.35) * 100) / 100));
  return out;
}

/** The temper a flight goes by: its own, or its family's if it was made without one. */
export const temperOf = (f: Pick<Flight, 'kind' | 'temper'>): DragonTemper => f.temper ?? FAMILY_TEMPER[f.kind];

/** Past this, a dragon takes a spot and holds it. */
export const TERRITORIAL = 0.6;
