import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { createWorld } from './world';
import { hobbyCandidates } from './hobbies';
import { CATCH_TIERS, tierFor } from './content/fishing';
import { makeItem } from './content/items';
import { hasTemplate } from './text';
import { rodCandidates, ROD_TRICKS } from './rodwork';
import { moveNpc } from './population';
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

  describe('rod work', () => {
    const XP = (lvl: number) => (lvl <= 10 ? 2 * lvl * lvl : (lvl * lvl * lvl) / 5) + 1;
    const arm = (seed: string, lvl: number, at: string) => {
      const w = createWorld({ seed, competence: 0.3 });
      w.hero.locationId = at;
      w.hero.skills.fishing = XP(lvl);
      w.hero.inventory.push(makeItem('fishing_rod'));
      for (const id of ['nyx', 'dutch']) if (w.npcs[id]) moveNpc(w, w.npcs[id]!, at);
      return w;
    };
    const keys = (w: World) => rodCandidates(w).map((x) => x.key);

    it('does nothing without a rod, and opens tricks as she levels', () => {
      const w = arm('rod-1', 100, 'halo_floor');
      w.hero.inventory = w.hero.inventory.filter((i) => !i.tags.includes('rod'));
      expect(keys(w)).toEqual([]);
      w.hero.inventory.push(makeItem('fishing_rod'));
      expect(keys(w)).toContain('rod_tug:till');
      expect(keys(arm('rod-1', ROD_TRICKS.till - 1, 'halo_floor'))).not.toContain('rod_tug:till');
      expect(keys(arm('rod-1', ROD_TRICKS.tap, 'halo_floor'))).toContain('rod_tug:tap');
      const none = keys(arm('rod-1', ROD_TRICKS.lift - 1, 'halo_floor'));
      expect(none.some((k) => k.startsWith('rod_lift'))).toBe(false);
      expect(keys(arm('rod-1', ROD_TRICKS.lift, 'halo_floor')).some((k) => k.startsWith('rod_lift'))).toBe(true);
    });

    it('every trick runs, and the legendary one picks pockets from across the room', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const w = arm(`rod-run-${i}`, 100, ['halo_floor', 'halo_alley', 'halo_roof'][i % 3]!);
        const patron = Object.values(w.npcs).find((n) => n.alive && n.id !== 'nyx' && n.id !== 'dutch');
        if (patron) { moveNpc(w, patron, w.hero.locationId); patron.cash = 100; patron.hostile = i % 5 === 0; patron.affinity = i % 5 === 0 ? -20 : 0; }
        for (const cand of rodCandidates(w)) {
          const { c, events } = ctxOf(w, `${cand.key}-${i}`);
          const cash = w.hero.cash;
          cand.run(c);
          for (const e of events) seen.add(`${e.type}:${e.data.variant ?? ''}`);
          if (events.some((e) => e.type === 'rod_lift' && e.data.variant === 'cash')) expect(w.hero.cash).toBeGreaterThan(cash);
        }
      }
      for (const k of ['rod_lift:cash', 'rod_tug:till', 'rod_tug:tap', 'reel_girl:smooth', 'rod_tug:dumpster', 'rod_swing:clean', 'reel_in:haul']) expect(seen.has(k), k).toBe(true);
    });

    it('has a line for every rod-work outcome', () => {
      const lines: [string, string[]][] = [
        ['reel_in', ['haul', 'snag']], ['reel_girl', ['smooth', 'swoon', 'slapped', 'tangle']], ['rod_lift', ['item', 'cash', 'nothing', 'abort', 'noticed']],
        ['rod_tug', ['tap', 'tap_seen', 'tap_miss', 'vending_coins', 'vending_snack', 'vending_miss', 'dumpster', 'dumpster_miss', 'panel', 'panel_miss', 'till', 'till_caught']],
        ['rod_swing', ['loot', 'clean', 'swing']], ['rod_bait', ['bite', 'landed']],
      ];
      for (const [type, variants] of lines) for (const variant of variants) {
        expect(hasTemplate({ beat: 1, type, outcome: 'good', data: { variant, npc: 'x', item: 'y', amount: 1 } }), `${type}:${variant}`).toBe(true);
      }
      for (const v of ['reel_in', 'reel_girl', 'rod_lift']) expect(hasTemplate({ beat: 1, type: 'intent', outcome: 'mixed', data: { variant: v, npc: 'x' } }), v).toBe(true);
    });
  });
});
