import type { Rng } from '../rng';
import type { Hazards } from '../types';

/**
 * What a home keeps against people who let themselves in. Both scale with how well the place is secured (0..9, see
 * mapgen.ts): the better the lock, the better the dog and the nastier the trap.
 */

/** A guard dog by model number. Higher is worse. BARK-100 is a pound-shop toy; BARK-530 is not a fight she can win. */
export interface BarkModel {
  model: number;
  hp: number;
  power: number;
}

export const BARKS: BarkModel[] = [
  { model: 100, hp: 22, power: 5 },
  { model: 210, hp: 40, power: 9 },
  { model: 320, hp: 70, power: 14 },
  { model: 430, hp: 90, power: 17 },
  { model: 530, hp: 220, power: 38 },
];
export const barkOf = (model: number): BarkModel => BARKS.find((b) => b.model === model) ?? BARKS[0]!;

export interface TrapDef {
  id: string;
  /** How hard it is to disarm before any skill. */
  disarm: number;
  /** Straight damage when it goes off (none for a turret, which is a fight). */
  damage?: [number, number];
}

export const TRAPS: Record<string, TrapDef> = {
  grenade_string: { id: 'grenade_string', disarm: 0.55, damage: [16, 30] },
  shock_mat: { id: 'shock_mat', disarm: 0.45, damage: [12, 20] },
  gas_vent: { id: 'gas_vent', disarm: 0.4, damage: [6, 10] },
  sentry_turret: { id: 'sentry_turret', disarm: 0.2 },
};

/** The same home always keeps the same things; `rng` is seeded by the home. */
export function rollHazards(rng: Rng, security: number): Hazards {
  const out: Hazards = {};
  if (rng.chance(0.08 + 0.12 * security)) {
    const rank = Math.max(0, Math.min(BARKS.length - 1, security - 1 + rng.int(-1, 1)));
    const count = rank >= 3 ? (rank === 3 && rng.chance(0.25) ? 2 : 1) : rank === 2 ? (rng.chance(0.3) ? 2 : 1) : rng.int(1, 2);
    out.dogs = { model: BARKS[rank]!.model, count };
  }
  if (rng.chance(0.15 + 0.13 * security)) {
    const kind = security <= 1 ? 'grenade_string' : security === 2 ? (rng.chance(0.3) ? 'grenade_string' : 'shock_mat') : security === 3 ? (rng.chance(0.3) ? 'shock_mat' : 'gas_vent') : rng.chance(0.8) ? 'sentry_turret' : 'gas_vent';
    out.trap = { kind };
  }
  return out;
}
