import type { Ctx, Hero } from './types';
import { IMPLANTS, type SkillId } from './content/implants';

export type { SkillId };

export const SKILL_LABELS: Record<SkillId, string> = {
  music: 'music',
  tolerance: 'drinking',
  tinkering: 'tinkering',
  sneak: 'sneaking',
};

/** Skills grow with use: level = floor(sqrt(xp / 2)), capped at 10. Implants add flat levels. */
export function skillLevel(h: Hero, id: SkillId): number {
  const base = Math.min(10, Math.floor(Math.sqrt((h.skills[id] ?? 0) / 2)));
  const bonus = h.implants.reduce((a, i) => a + (IMPLANTS[i]?.skills?.[id] ?? 0), 0);
  return Math.max(0, Math.min(12, base + bonus));
}

export function train(c: Ctx, id: SkillId, xp = 1): void {
  const h = c.w.hero;
  const before = skillLevel(h, id);
  h.skills[id] = (h.skills[id] ?? 0) + xp;
  const after = skillLevel(h, id);
  if (after > before) c.emit('skill_up', 'good', { skill: SKILL_LABELS[id], level: after, id });
}

export const hasImplantFlag = (h: Hero, flag: string): boolean => h.implants.some((i) => IMPLANTS[i]?.flag === flag);
