import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { createWorld } from './world';
import { hobbyCandidates } from './hobbies';
import { CATCH_TIERS, tierFor } from './content/fishing';
import { makeItem } from './content/items';
import { hasTemplate } from './text';
import type { Ctx, GameEvent, World } from './index';

const ctxOf = (w: World, seed: string): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) }, events };
};
const fishAt = (w: World) => hobbyCandidates(w).find((x) => x.key === 'fish');

describe('fishing', () => {
  it('needs both a rod and some water', () => {
    const w = createWorld({ seed: 'fish-1', competence: 0.3 });
    w.hero.locationId = 'club_backlot';
    expect(fishAt(w)).toBeUndefined();
    w.hero.inventory.push(makeItem('fishing_rod'));
    expect(fishAt(w)).toBeDefined();
    w.hero.locationId = 'halo_floor';
    expect(fishAt(w)).toBeUndefined();
  });

  it('opens up better catches as she levels, and every item exists', () => {
    for (const t of CATCH_TIERS) for (const id of t.items) if (id !== 'ammo') expect(() => makeItem(id), id).not.toThrow();
    expect(tierFor(1.4, 0).variant).toBe('junk');
    expect(tierFor(1.4, 10).variant).toBe('haul');
    expect(tierFor(1.4, 40).variant).toBe('legend')
    expect(tierFor(1.4, 39).variant).toBe('prize');
    expect(tierFor(0.1, 100).variant).toBe('junk');
  });

  it('trains the skill, and the best things only come to the best', () => {
    const seen = (xp: number) => {
      const got = new Set<string>();
      for (let i = 0; i < 400; i++) {
        const w = createWorld({ seed: `fish-${xp}-${i}`, competence: 0.3 });
        w.hero.locationId = 'club_backlot';
        w.hero.skills.fishing = xp;
        w.hero.inventory.push(makeItem('fishing_rod'));
        const { c, events } = ctxOf(w, `cast-${i}`);
        fishAt(w)!.run(c);
        for (const e of events) if (e.type === 'fish') got.add(String(e.data.variant));
        expect(w.hero.skills.fishing).toBeGreaterThan(xp);
      }
      return got;
    };
    const novice = seen(0);
    expect(novice.has('legend')).toBe(false);
    expect(novice.has('junk')).toBe(true);
    const master = seen(30000);
    expect(master.has('legend') || master.has('ammo')).toBe(true);
    expect(master.has('prize')).toBe(true);
  });

  it('has a line for every outcome', () => {
    for (const variant of ['junk', 'trinket', 'haul', 'prize', 'legend', 'ammo', 'nothing', 'splash', 'snap']) {
      for (const npc of ['', 'Nyx']) expect(hasTemplate({ beat: 1, type: 'fish', outcome: 'good', data: { variant, item: 'x', npc } }), variant).toBe(true);
    }
    expect(hasTemplate({ beat: 1, type: 'intent', outcome: 'mixed', data: { variant: 'fish' } })).toBe(true);
  });
});
