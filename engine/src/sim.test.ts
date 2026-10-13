import { describe, expect, it } from 'vitest';
import { Rng, rollPersonality, runToEnd, ARCHETYPES } from './index.js';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng('neo');
    const b = new Rng('neo');
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('forks are independent of parent consumption', () => {
    const a = new Rng(1).fork('x');
    const b = new Rng(1).fork('x');
    expect(a.next()).toBe(b.next());
  });
});

describe('personality', () => {
  it('rolls a known archetype with clamped weights', () => {
    const p = rollPersonality(new Rng(7));
    expect(ARCHETYPES.map((a) => a.id)).toContain(p.archetypeId);
    for (const w of Object.values(p.weights)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});

describe('sim', () => {
  const personality = rollPersonality(new Rng(3));
  it('same seed gives identical runs', () => {
    const a = runToEnd({ seed: 's1', personality, competence: 0.2 });
    const b = runToEnd({ seed: 's1', personality, competence: 0.2 });
    expect(a.events).toEqual(b.events);
  });
  it('higher competence wins more often', () => {
    const rate = (c: number) => {
      let wins = 0;
      for (let i = 0; i < 300; i++) if (runToEnd({ seed: `r${i}`, personality, competence: c }).state.won) wins++;
      return wins / 300;
    };
    expect(rate(0.95)).toBeGreaterThan(rate(0.05));
  });
});
