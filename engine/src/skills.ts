import type { Ctx, Hero } from './types';
import { IMPLANTS } from './content/implants';
import { growthPct } from './lab';
import { GENERIC_TITLES, LEVEL_MILESTONES, SKILLS, SKILL_IDS, type SkillId, type StatId } from './content/skills';
import { levelOfXp } from './grade';
import { instrumentBonus } from './instruments';

export type { SkillId, StatId };
export { SKILL_IDS };

export const SKILL_LABELS: Record<SkillId, string> = Object.fromEntries(SKILL_IDS.map((k) => [k, SKILLS[k].label])) as Record<SkillId, string>;

/**
 * Continuous skill value on the grade scale (grade.ts): 0 and up, 100 being as good as anyone gets. XP is a sqrt curve to
 * level 10 and steeper after (`levelOfXp`); implants, a held weapon and a good instrument add flat levels. Used for synergy math.
 */
export function skillValue(h: Hero, id: SkillId): number {
  const base = levelOfXp(h.skills[id] ?? 0);
  const bonus = h.implants.reduce((a, i) => a + (IMPLANTS[i]?.skills?.[id] ?? 0), 0);
  const held = h.weapon?.fx?.skill?.id === id ? h.weapon.fx.skill.bonus : 0;
  return Math.max(0, base + bonus + held + instrumentBonus(h, id));
}

export const skillLevel = (h: Hero, id: SkillId): number => Math.floor(skillValue(h, id));

export type Part = SkillId | `stat:${StatId}` | [SkillId | `stat:${StatId}`, number];

const partValue = (h: Hero, p: SkillId | `stat:${StatId}`): number => (p.startsWith('stat:') ? Math.min(10, Math.max(0, h[p.slice(5) as StatId])) : skillValue(h, p as SkillId));

/**
 * Layered skills. A weighted geometric mean of every relevant skill and stat on a 0..10 scale.
 * - Any factor at zero makes the whole thing zero ("zero guitar makes her music skill useless").
 * - Related skill improves a new skill ("music 8 + guitar 3" beats "guitar 3 alone": sqrt(24) > 3).
 */
export function synergy(h: Hero, parts: Part[]): number {
  let log = 0;
  let total = 0;
  for (const p of parts) {
    const [id, w] = Array.isArray(p) ? p : [p, 1];
    const v = partValue(h, id);
    if (v <= 0) return 0;
    log += w * Math.log(v);
    total += w;
  }
  return total ? Math.exp(log / total) : 0;
}

/** Train a skill. A share of the XP spills into related skills. Emits milestone events. */
export function train(c: Ctx, id: SkillId, xp = 1): void {
  const h = c.w.hero;
  const touched: [SkillId, number][] = [[id, xp]];
  for (const [other, ratio] of Object.entries((SKILLS[id] as { spill?: Record<string, number> }).spill ?? {})) {
    touched.push([other as SkillId, xp * ratio]);
  }
  let announced = 0;
  for (const [sk, amount] of touched) {
    const before = skillLevel(h, sk);
    h.skills[sk] = (h.skills[sk] ?? 0) + amount * (1 + growthPct(c.w.legacy, sk) / 100);
    const after = skillLevel(h, sk);
    // Only milestone levels make the log; the status panel tracks the rest.
    const idx = after > before ? LEVEL_MILESTONES.findIndex((m) => before < m && after >= m) : -1;
    if (idx >= 1 && announced < 2) {
      announced++;
      c.emit('skill_up', 'good', { skill: SKILLS[sk].label, level: after, id: sk, title: SKILLS[sk].titles[idx] ?? GENERIC_TITLES[idx - SKILLS[sk].titles.length] ?? '' });
    }
  }
}

export const hasImplantFlag = (h: Hero, flag: string): boolean => h.implants.some((i) => IMPLANTS[i]?.flag === flag);

/** Linear helper: baseline chance plus a per-point bonus from a synergy value, clamped. */
export const odds = (base: number, perPoint: number, syn: number, lo = 0.03, hi = 0.93): number => Math.max(lo, Math.min(hi, base + perPoint * syn));
