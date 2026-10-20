import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, runToEnd, hasTemplate, type GameEvent } from './index';
import { createWorld } from './world';
import { spawnGroup } from './candidate';
import { fight } from './combat';
import { sweeperRoll } from './sweepers';

const ctxOf = (w: ReturnType<typeof createWorld>, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

describe('street sweepers: the fight a level 1 can count on, on the street', () => {
  it('a fresh level 1 beats one or two of them every time', () => {
    let wins = 0;
    for (let i = 0; i < 60; i++) {
      const w = createWorld({ seed: `sw${i}`, competence: 0.5, personality: personalityFrom({}) });
      w.hero.locationId = 'street_main';
      const r = ctxOf(w, `s${i}`);
      const bots = spawnGroup(r.c as any, 'sweeper', 1 + (i % 2));
      expect(w.hero.level).toBe(1);
      if (fight(r.c as any, bots, { cause: 'test', joiners: false }) === 'win') wins++;
    }
    expect(wins).toBe(60);
  });

  it('they roll up on her on the street, not indoors', () => {
    let picked = 0;
    for (let i = 0; i < 400; i++) {
      const w = createWorld({ seed: `sr${i}`, competence: 0.5, personality: personalityFrom({}) });
      w.hero.locationId = 'street_main';
      const r = ctxOf(w, `r${i}`);
      spawnGroup(r.c as any, 'sweeper', 1);
      if (sweeperRoll(r.c as any)) picked++;
    }
    expect(picked).toBeGreaterThan(5);
    const w = createWorld({ seed: 'in', competence: 0.5, personality: personalityFrom({}) });
    w.hero.locationId = 'halo_floor';
    const r = ctxOf(w, 'in');
    spawnGroup(r.c as any, 'sweeper', 1);
    for (let i = 0; i < 200; i++) expect(sweeperRoll(r.c as any)).toBe(false); // the Halo's floor
  });

  it('shows up in the sim with text', () => {
    let seen = 0;
    for (let i = 0; i < 10; i++) {
      const { events } = runToEnd({ seed: `sv-${i}`, competence: 0.3 });
      for (const e of events) if (e.type === 'sweeper_accost') { seen++; expect(hasTemplate(e)).toBe(true); }
    }
    expect(seen).toBeGreaterThan(0);
  }, 60_000);
});
