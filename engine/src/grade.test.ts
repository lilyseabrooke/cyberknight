import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { GRADE, baseHp, basePower, fightTraining, levelOfXp, meanDanger, skillXp, stepDanger, tierOfDanger } from './grade';

describe('grade scale', () => {
  it('keeps the old skill curve up to level 10 and goes steeper after', () => {
    expect(skillXp(10)).toBe(200);
    expect(levelOfXp(18)).toBeCloseTo(3, 5);
    expect(levelOfXp(skillXp(10) + 0.001)).toBeCloseTo(10, 2);
    for (const L of [11, 25, 50, 80, 100]) expect(levelOfXp(skillXp(L))).toBeCloseTo(L, 6);
    expect(skillXp(80)).toBeGreaterThan(100_000);
  });

  it('stays near the old enemy numbers at the bottom and grows without bound', () => {
    expect(baseHp(1)).toBeCloseTo(30, 0);
    expect(basePower(2)).toBeCloseTo(4, 0);
    expect(basePower(GRADE.ceo)).toBeGreaterThan(basePower(GRADE.plateau));
    expect(basePower(120)).toBeGreaterThan(basePower(100));
  });

  it('pays more for harder fights, almost nothing for trivial ones', () => {
    expect(fightTraining(2, 10, 30)).toBeGreaterThan(fightTraining(2, 10, 10));
    expect(fightTraining(2, 40, 2)).toBeLessThan(fightTraining(2, 40, 40) / 5);
  });

  it('ramps through the starting district, steps up past the cordon, then flattens at the plateau', () => {
    expect(meanDanger(1, 6)).toBe(2);
    expect(meanDanger(6, 6)).toBeCloseTo(GRADE.gate, 5);
    expect(meanDanger(7, 6)).toBe(GRADE.firstBeyond);
    expect(meanDanger(200, 6)).toBeLessThan(GRADE.plateau + 0.01);
    expect(meanDanger(200, 6)).toBeGreaterThan(GRADE.plateau - 1);
  });

  it('walks smoothly but with surprises, deterministically', () => {
    const walk = (seed: string): number[] => {
      const rng = new Rng(seed);
      const out = [2];
      for (let step = 2; step <= 60; step++) out.push(stepDanger(out.at(-1)!, meanDanger(step, 6), 0, rng));
      return out;
    };
    expect(walk('a')).toEqual(walk('a'));
    // Over many walks the typical hop is small, and some hop is big.
    const hops: number[] = [];
    for (let s = 0; s < 40; s++) {
      const w = walk(`seed${s}`);
      for (let i = 1; i < w.length; i++) hops.push(Math.abs(w[i]! - w[i - 1]!));
    }
    hops.sort((a, b) => a - b);
    expect(hops[Math.floor(hops.length / 2)]!).toBeLessThan(5);
    expect(hops.at(-1)!).toBeGreaterThan(12);
  });

  it('buckets danger into the five dungeon tiers', () => {
    expect([0, 12, 30, 50, 90].map(tierOfDanger)).toEqual([1, 2, 3, 4, 5]);
  });
});
