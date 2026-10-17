import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { expand, liftCordon } from './mapgen';
import { edgesOf } from './hexmap';
import { START_DEPTH } from './grade';
import type { Id, World } from './types';

/** Everywhere she could reach by doors, streets and every kind of link at all. */
function reach(w: World, cap = 100000): Id[] {
  const seen = new Set<Id>(['street_main']);
  const stack: Id[] = ['street_main'];
  while (stack.length && seen.size < cap) {
    const loc = w.locations[stack.pop()!]!;
    expand(w, loc);
    for (const e of edgesOf(loc)) {
      if (!seen.has(e.to) && w.locations[e.to]) {
        seen.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return [...seen];
}

describe('the cordon and the hex grid', () => {
  it('no link gets past the cordon while CINDERJAW lives', () => {
    for (const seed of ['cord-a', 'cord-b', 'cord-c']) {
      const w = createWorld({ seed: 'x', worldSeed: seed });
      const ids = reach(w);
      expect(ids.length).toBeGreaterThan(30);
      for (const id of ids) {
        const g = w.locations[id]!.gen;
        if (g) expect(g.depth, `${id} is past the cordon`).toBeLessThanOrEqual(START_DEPTH);
      }
    }
  });

  it('once it is lifted the city (and its links) go on past it', () => {
    const w = createWorld({ seed: 'x', worldSeed: 'cord-d' });
    const before = reach(w).length;
    w.legacy.gate = 'open';
    liftCordon(w as World & { legacy: World['legacy'] });
    expect(reach(w, before + 60).length).toBeGreaterThan(before);
  });
});
