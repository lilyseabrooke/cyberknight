import { describe, expect, it } from 'vitest';
import { createRun, personalityFrom } from './index';
import { restlessness } from './run';

const go = (to: string) => ({ key: `go:${to}`, drives: {} });

describe('novelty-seeking', () => {
  it('prefers places she has done less in, and tires of where she is', () => {
    const { world: w } = createRun({ seed: 'novelty' });
    const here = w.hero.locationId;
    const exit = w.locations[here]!.exits.find((e) => !e.hidden)!.to;
    expect(restlessness(w, go(exit))).toBeCloseTo(0, 5); // equally fresh: no pull
    w.locations[here]!.doings = 12;
    const bored = restlessness(w, go(exit));
    expect(bored).toBeGreaterThan(0);
    w.locations[exit]!.doings = 12;
    expect(restlessness(w, go(exit))).toBeCloseTo(0, 5);
    expect(restlessness(w, { key: 'chat:x', drives: {} })).toBe(0);
  });

  it('curious girls feel it more than incurious ones', () => {
    const a = createRun({ seed: 'novelty' }).world;
    const b = createRun({ seed: 'novelty' }).world;
    a.hero.personality = personalityFrom({ curiosity: 0.9 });
    b.hero.personality = personalityFrom({ curiosity: 0.1 });
    const exit = a.locations[a.hero.locationId]!.exits.find((e) => !e.hidden)!.to;
    a.locations[a.hero.locationId]!.doings = 12;
    b.locations[b.hero.locationId]!.doings = 12;
    expect(restlessness(a, go(exit))).toBeGreaterThan(restlessness(b, go(exit)));
  });
});
