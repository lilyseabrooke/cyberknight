/**
 * The grade scale. Skill level, enemy threat, place danger and gear all sit on one 0..100+ line (see docs/PROGRESSION.md),
 * so "melee 30 against a grade-30 enemy" means something. Pure functions only: nothing here touches a World.
 *
 *  - 0..15   the starting district, rising toward its cordon
 *  - 15      CINDERJAW, who keeps the cordon shut
 *  - 18      the first streets past the cordon
 *  - 60      Hera Mk. V
 *  - 70      the plateau: ordinary endgame mooks
 *  - 80      the Atlas CEO, the final boss and the benchmark everything else is measured against
 *  - 100     where a skill stops being believable; enemies only get there through stacked outliers
 */

import type { Rng } from './rng';
import type { Id, Location } from './types';

export const GRADE = { gate: 15, firstBeyond: 18, hera: 60, plateau: 70, ceo: 80, ceiling: 100 } as const;

/** Base punch of a grade-g fighter, before the weapon in their hand. Close to the old `2 x level` at the low end. */
export const basePower = (g: number): number => 2 * g * (1 + g / 40);

/** Base toughness of a grade-g fighter. Close to the old `18 + 12 x level` at the low end. */
export const baseHp = (g: number): number => 18 + 12 * g * (1 + g / 60);

/** What a bigger-than-its-grade boss does to its numbers: power and hp multipliers, by archetype tag. */
export const BOSS_MULT: Record<string, { power: number; hp: number }> = {
  apollo: { power: 3.5, hp: 4.5 },
  hera: { power: 3, hp: 6 },
  ceo: { power: 3.5, hp: 8 },
};

// ===================================================================== skills

/**
 * XP for a skill to reach a level. `2 L^2` up to level 10 (exactly the old curve, so old levels keep their meaning), then
 * steeper: `L^3 / 5`, which is 102k at level 80 and 200k at level 100. Continuous at 10.
 */
export const skillXp = (level: number): number => (level <= 10 ? 2 * level * level : (level * level * level) / 5);

/** The inverse of `skillXp`: a skill's level, fractional, from its XP. Unbounded. */
export const levelOfXp = (xp: number): number => {
  if (xp <= 0) return 0;
  return xp <= 200 ? Math.sqrt(xp / 2) : Math.cbrt(5 * xp);
};

/**
 * How much XP a fight is worth to a skill: harder than she is is worth the most, trivial is worth almost nothing, and
 * the same relative challenge pays more at higher grades because each level costs more.
 */
export function fightTraining(base: number, skillGrade: number, foeGrade: number): number {
  const rel = Math.max(0.1, Math.min(2.5, foeGrade / Math.max(3, skillGrade)));
  return base * (1 + foeGrade / 5) * rel;
}

/** XP from one hero level to the next. The old `24 x level`, bending upward so the high levels take a long time. */
export const levelCost = (level: number): number => Math.round(24 * level * (1 + level / 20));

/** Max HP a hero gains on reaching a level: tracks the enemy curve, so her tank keeps pace with theirs. */
export const hpPerLevel = (level: number): number => Math.round(baseHp(level) - baseHp(level - 1));

// ===================================================================== places

/** Danger at the hand-built heart of the starting district. */
export const HEART_DANGER = 2;

/** The danger a street should hover around, `step` streets out from the heart, when the starting district is `span` streets deep. */
export function meanDanger(step: number, span: number): number {
  if (step <= span) return HEART_DANGER + ((GRADE.gate - HEART_DANGER) * Math.max(0, step - 1)) / Math.max(1, span - 1);
  const past = step - span;
  return GRADE.firstBeyond + (GRADE.plateau - GRADE.firstBeyond) * (1 - Math.exp(-(past - 1) / 14));
}

/** Per-district nudge to the walk: some quarters run hot, some run cool. */
export const DISTRICT_DANGER: Record<string, number> = { market: -1.5, nightlife: 0, tenement: 0, industrial: 1, corporate: 2.5, slum: 2 };

/** How often a street is a surprise, and how big. */
export const SPIKE_CHANCE = 1 / 12;

/**
 * One step of the danger field: the child street drifts from its parent toward what that depth should be, with noise and
 * the occasional big swing (a hot pocket, or a strangely quiet one). Unbounded above, floored at 0.
 */
export function stepDanger(parent: number, mean: number, bias: number, rng: Rng): number {
  const gauss = (rng.next() + rng.next() + rng.next() - 1.5) * 2 * 1.7; // about sigma 3.5
  let d = parent + 0.35 * (mean - parent) + gauss + bias;
  if (rng.chance(SPIKE_CHANCE)) d += (rng.chance(0.65) ? 1 : -1) * (10 + rng.next() * 15);
  return Math.max(0, Math.round(d * 10) / 10);
}

/** Which of the dungeon tables (1..5) a danger falls into. */
export const tierOfDanger = (danger: number): number => (danger < 10 ? 1 : danger < 25 ? 2 : danger < 45 ? 3 : danger < 65 ? 4 : 5);

/**
 * How many streets deep the starting district goes. Its outermost streets are the Atlas lockdown cordon: they have lots
 * and clinics like any street, but nothing runs on past them until CINDERJAW is dead (mapgen.ts `liftCordon`). Sized so
 * the district comes to roughly ten times the hand-built part; `npm run district-size` counts it.
 */
export const START_DEPTH = 4;

/** The danger the hand-built streets hand to their first generated neighbours. */
const HAND_DANGER: Record<Id, number> = { street_main: 2, club_backlot: 3, halo_alley: 2 };

/** How dangerous a place is: what it was made with, or what its depth says for places made before danger existed. */
export function dangerOf(loc: Location | undefined): number {
  if (!loc) return HEART_DANGER;
  if (loc.gen) return loc.gen.danger ?? meanDanger(loc.gen.depth, START_DEPTH);
  return HAND_DANGER[loc.id] ?? HEART_DANGER;
}
