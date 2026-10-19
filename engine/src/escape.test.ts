import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { scenario } from './testkit';
import { spawnGroup } from './candidate';
import { onFoot, runChase } from './chase';
import { streetHunt } from './streethunt';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { awareness } from './stealth';
import { makeUnit, prowlBoard, type Board, type Light } from './prowl';
import { placeOf, syncPlace } from './placeboard';
import type { Ctx } from './types';

const ctxOf = (w: World, rng: Rng): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

describe('a hunt on the street', () => {
  it('starts with them not knowing where she is, and ends with her gone, chased or fought', () => {
    const ends: Record<string, number> = {};
    for (let i = 0; i < 40; i++) {
      const sc = scenario({ seed: `hunt-${i}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      const { c, events } = ctxOf(w, new Rng(`h-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      const from = w.hero.locationId;
      const r = streetHunt(c, crew, 'test');
      ends[r] = (ends[r] ?? 0) + 1;
      if (r === 'evaded') {
        expect(w.hero.locationId).not.toBe(from);
        expect(events.some((e) => e.type === 'prowl_end' && e.data.variant === 'evaded')).toBe(true);
        for (const n of crew) expect(w.npcs[n.id]?.aware?.fix ?? false).toBe(false);
      }
      if (r === 'chased') expect(events.some((e) => e.type === 'chase_start')).toBe(true);
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(ends.evaded ?? 0).toBeGreaterThan(0);
  });

  it('someone who stumbles onto her turns it into a fight or a chase, not a vanishing', () => {
    const ends: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const sc = scenario({ seed: `stumble-${i}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      const { c, events } = ctxOf(w, new Rng(`s-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      const p = placeOf(w)!;
      syncPlace(w, p);
      const g = p.layout.grid;
      const mid = { x: Math.floor(g.w / 2), y: Math.floor(g.h / 2) };
      p.board.hero = mid;
      crew.forEach((n, k) => {
        const e = p.board.ents[n.id];
        if (!e) return;
        e.x = mid.x + (k === 0 ? 1 : 0);
        e.y = mid.y + (k === 0 ? 0 : 1);
      });
      const r = streetHunt(c, crew, 'test', { keepSpot: true });
      ends[r] = (ends[r] ?? 0) + 1;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect((ends.fought ?? 0) + (ends.chased ?? 0)).toBeGreaterThan(0);
  });

  it('a timid bystander who has seen her runs for the nearest way out instead of coming for her', () => {
    const sc = scenario({ seed: 'timid', at: 'street_main', competence: 0.6 });
    const { w } = sc;
    w.hero.stealth = true;
    const n = spawnNpc(new Rng('pat'), 'pat', 'patron', w.hero.locationId);
    addNpc(w, n);
    const a = awareness(w, n);
    a.v = 1;
    a.fix = true;
    const cells = Array(8 * 3).fill('floor') as never;
    const b: Board = { w, grid: { w: 8, h: 3, cells, exits: [{ x: 7, y: 1 }] }, light: Array<Light>(24).fill(2), units: [makeUnit(n, { x: 3, y: 1 }, 2)], hero: { x: 2, y: 1 }, posture: 'sneak', props: [], bodies: [], round: 1, dark: [], role: 'test', ways: [{ at: { x: 7, y: 1 }, to: 'club_backlot' }] };
    const events: string[] = [];
    prowlBoard({ w, rng: new Rng('t'), emit: (t) => events.push(t) }, b, (t) => events.push(t));
    expect(events).toContain('prowl_flee');
    expect(b.units[0]!.fled).toBe(true);
  });

  it('she can go to ground off the line while they run by, and they either find her or go on past', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const sc = scenario({ seed: `ground-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const { c, events } = ctxOf(w, new Rng(`g-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 4)) });
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      const told = events.filter((e) => e.type === 'chase_round').map((e) => String(e.data.events)).join(' ');
      if (told.includes('lost:cover')) {
        seen.past = (seen.past ?? 0) + 1;
        expect(w.hero.stealth).toBe(true);
        if (!events.some((e) => e.type === 'chase_search')) for (const n of crew) if (n.alive) expect(n.locationId).not.toBe(w.hero.locationId);
      }
      if (told.includes('hide:found')) seen.found = (seen.found ?? 0) + 1;
      w.over = undefined as never;
    }
    expect(seen.past ?? 0).toBeGreaterThan(0);
    expect(seen.found ?? 0).toBeGreaterThan(0);
  });

  it('when they lose sight of her they go to where they last saw her, then either press on or fan out to search', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const sc = scenario({ seed: `lost-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const { c, events } = ctxOf(w, new Rng(`l-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 9)) });
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'chase_search') seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
      }
    }
    expect(Object.keys(seen).length).toBeGreaterThanOrEqual(2);
  });

  it('people standing on her line are gone round, shoved through or run into, and everything is told', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const sc = scenario({ seed: `crowd-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.clock = 20 * 60;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const { c, events } = ctxOf(w, new Rng(`c-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      for (let k = 0; k < 8; k++) spawnGroup(c, 'patron', 1);
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 4)) });
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'chase_crowd') seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
      }
    }
    expect((seen.weave ?? 0) + (seen.shove ?? 0)).toBeGreaterThan(0);
  });

  it('with the Charm for it, people let her through and then close up on her pursuers; without, they do not', () => {
    const run = (charm: number): { clear: number; ranks: number; angry: number } => {
      const out = { clear: 0, ranks: 0, angry: 0 };
      for (let i = 0; i < 120; i++) {
        const sc = scenario({ seed: `charm-${i % 40}`, at: 'street_main', competence: 0.6 });
        const { w } = sc;
        w.clock = 20 * 60;
        w.hero.charm = charm;
        w.hero.level = 8;
        w.hero.maxHp = w.hero.hp = 180;
        const { c, events } = ctxOf(w, new Rng(`ch-${i}`));
        const crew = spawnGroup(c, 'ganger', 2, 'vipers');
        for (let k = 0; k < 8; k++) spawnGroup(c, 'patron', 1);
        runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 4)) });
        for (const e of events) {
          expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
          if (e.type === 'chase_crowd' && e.data.variant === 'clear') out.clear++;
          if (e.type === 'chase_crowd' && e.data.variant === 'ranks') out.ranks++;
          if (e.type === 'accident' && e.data.variant === 'bump' && e.data.angry) out.angry++;
        }
      }
      return out;
    };
    const low = run(0);
    const high = run(14);
    expect(low.clear).toBe(0);
    expect(high.clear).toBeGreaterThan(5);
    expect(high.ranks).toBeGreaterThan(0);
    expect(high.angry).toBeLessThanOrEqual(low.angry);
  });
});
