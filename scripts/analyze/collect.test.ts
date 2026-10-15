import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { slow } from '../../engine/src/testkit';
import { collect } from './collect';

const root = path.resolve(__dirname, '../..');

describe('collecting nights', () => {
  slow('wn to numbers; the same seeds give the same numbers', async () => {
    const a = await collect(root, 0.6, 4, 'test');
    const b = await collect(root, 0.6, 4, 'test');
    expect(a).toHaveLength(4);
    expect(a).toEqual(b);
    for (const n of a) {
      expect(n.beats).toBeGreaterThan(0);
      expect(['dead', 'dawn', 'victory', 'cap']).toContain(n.ending);
      expect(n.goalsDone).toBe(Object.values(n.done).reduce((x, y) => x + y, 0));
      expect(n.noGoalBeats).toBeLessThanOrEqual(n.beats);
      expect(n.flips).toBeLessThanOrEqual(n.goBeats);
      expect(n.weaponRating).toBeGreaterThan(0);
      expect(JSON.parse(JSON.stringify(n))).toEqual(n);
    }
    const c = await collect(root, 0.6, 4, 'other');
    expect(c).not.toEqual(a);
  });
});
