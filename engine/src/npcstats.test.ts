import { describe, expect, it } from 'vitest';
import { lopsided, skillOf, statsOf, statTotal } from './npcstats';
import { spawnNpc } from './content/archetypes';
import { Rng } from './rng';

describe('npc stats', () => {
  it('are stable, scale with level, and some people are lopsided', () => {
    const mk = (i: number, arch: string) => spawnNpc(new Rng(`s${i}`), `n${i}`, arch, 'halo_floor');
    const a = mk(1, 'barkeep');
    expect(statsOf(a)).toEqual(statsOf({ ...a, stats: undefined }));
    const total = (n: ReturnType<typeof mk>) => Object.values(statsOf(n)).reduce((x, y) => x + y, 0);
    expect(total(a)).toBeGreaterThan(statTotal(a.level) - 4);
    const spreads = Array.from({ length: 40 }, (_, i) => lopsided(statsOf(mk(i, 'bartender'))));
    expect(Math.max(...spreads)).toBeGreaterThan(Math.min(...spreads) + 0.2);
    expect(skillOf(a, 'athletics')).toBe(skillOf(a, 'athletics'));
  });
});
