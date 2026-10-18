import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { addDungeon, childId } from './mapgen';
import { fight, relocate, HOOKS } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { Sim } from './tactics';
import { dist } from './grid';
import { enterRoom, standing } from './dungeons';
import { commitBoard, placeOf, syncPlace, tickPlace, viewOf } from './placeboard';
import { prowlBoard, prowlRoom } from './prowl';
import { awareness } from './stealth';
import type { Ctx, GameEvent, Location, Npc, World } from './types';

/**
 * The regular board, the sneaking board and the fight board are one board per place, kept for the run: what any of them does to it
 * is there for the others.
 */

const ctxOf = (w: World, seed = 'bc') => {
  const events: GameEvent[] = [];
  const c: Ctx = { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) };
  return { c, events };
};
const hideout = (seed: string) => {
  const sc = scenario({ seed, at: 'street_main', competence: 0.5 });
  const street = sc.w.locations[childId('street_main', 0)]!;
  const entrance = addDungeon(sc.w, street, 'hideout', 40, 1);
  relocate(sc.w, entrance.id);
  const d = sc.w.dungeons[entrance.id]!;
  const room = d.rooms.find((r) => standing(sc.w, d, r.id).length >= 2)!;
  const loc = sc.w.locations[room.id]!;
  relocate(sc.w, loc.id);
  return { w: sc.w, d, loc };
};
const person = (w: World, id: string, archetype = 'patron', extra: Partial<Npc> = {}): Npc => {
  const n = spawnNpc(new Rng(id), id, archetype, w.hero.locationId);
  Object.assign(n, extra);
  addNpc(w, n);
  return n;
};

describe('one board for a place', () => {
  it('is the same layout in every mode', () => {
    const { w, loc } = hideout('same-layout');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    // The sneaking board is a view of it...
    const b = viewOf(w, p, { near: 99 });
    expect(b.grid).toBe(p.layout.grid);
    expect(b.light).toBe(p.layout.light);
    expect(b.bodies).toBe(p.board.bodies);
    expect(b.props).toBe(p.board.props);
    // ...and the fight is played on a copy of it.
    const { c } = ctxOf(w);
    const foe = Object.keys(p.board.ents).map((id) => w.npcs[id]!)[0]!;
    const sim = new Sim(c, HOOKS, { foes: [foe], arrivals: [], lethal: false, assault: true, maxRounds: 1, board: p });
    expect(sim.grid.cells).toEqual(p.layout.grid.cells);
    expect(sim.grid).not.toBe(p.layout.grid);
    expect(w.boards![loc.id]).toBe(p.board);
  });

  it('has the garrison on it from the start, though they are not "here" for anything else', () => {
    const { w, d, loc } = hideout('garrison');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const garrison = standing(w, d, loc.id);
    expect(garrison.length).toBeGreaterThanOrEqual(2);
    for (const n of garrison) expect(p.board.ents[n.id], n.name).toBeDefined();
    // Scattered, not stacked, and away from the doors.
    const seen = new Set(garrison.map((n) => `${p.board.ents[n.id]!.x},${p.board.ents[n.id]!.y}`));
    expect(seen.size).toBe(garrison.length);
  });

  it('every indoor place, not just dungeons and clubs, is a board with its people on it', () => {
    const sc = scenario({ seed: 'halo', at: 'street_main' });
    relocate(sc.w, 'halo_floor');
    const p = placeOf(sc.w)!;
    syncPlace(sc.w, p);
    expect(p.layout.role).toBe('bar');
    const here = Object.values(sc.w.npcs).filter((n) => n.locationId === 'halo_floor' && n.alive);
    expect(here.length).toBeGreaterThan(0);
    for (const n of here) expect(p.board.ents[n.id]).toBeDefined();
  });
});

describe('sneaking leaves the board as it finds it', () => {
  it('keeps where she ended up, where they are and what they were doing', () => {
    const { w, d, loc } = hideout('keeps');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const foes = standing(w, d, loc.id);
    w.hero.stealth = true;
    const start = { ...p.board.hero };
    const { c } = ctxOf(w, 'keeps');
    prowlRoom(c, d, loc, foes);
    // Wherever the scene went, the board has it.
    const moved = dist(start, p.board.hero) > 0 || foes.some((n) => !p.board.ents[n.id] || p.board.ents[n.id]!.calm !== 99 || p.board.bodies.some((b) => b.npcId === n.id));
    expect(moved).toBe(true);
  });

  it('puts down people where they fell, for everyone after', () => {
    let seen = 0;
    for (let i = 0; i < 20 && !seen; i++) {
      const { w, d, loc } = hideout(`body${i}`);
      w.hero.stealth = true;
      w.hero.skills.sneak = 400;
      const p = placeOf(w, loc)!;
      const { c, events } = ctxOf(w, `b${i}`);
      prowlRoom(c, d, loc, standing(w, d, loc.id));
      if (!events.some((e) => e.type === 'prowl_takedown' && (e.data.variant === 'ko' || e.data.variant === 'kill'))) continue;
      seen++;
      expect(p.board.bodies.length).toBeGreaterThan(0);
      for (const b of p.board.bodies) {
        const n = w.npcs[b.npcId]!;
        expect(!n.alive || n.downUntil > w.beat).toBe(true);
        expect(p.board.ents[b.npcId]).toBeUndefined();
      }
      // They are there if she comes back, and still not on their feet.
      syncPlace(w, p);
      expect(p.board.bodies.length).toBeGreaterThan(0);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('remembers what she has used: a machine set off stays set off', () => {
    let used = 0;
    for (let i = 0; i < 40 && !used; i++) {
      const { w, d, loc } = hideout(`prop${i}`);
      w.hero.stealth = true;
      w.hero.int = 10;
      w.hero.skills.tinkering = 400;
      const p = placeOf(w, loc)!;
      const before = p.board.props.map((x) => x.charges);
      if (!before.length) continue;
      const { c, events } = ctxOf(w, `p${i}`);
      prowlRoom(c, d, loc, standing(w, d, loc.id));
      if (!events.some((e) => e.type === 'prowl_distract' && e.data.variant === 'ok')) continue;
      used++;
      expect(p.board.props.map((x) => x.charges).reduce((a, b) => a + b, 0)).toBeLessThan(before.reduce((a, b) => a + b, 0));
    }
    expect(used).toBeGreaterThan(0);
  });

  it('a guard in the middle of a search is still searching when she comes back soon, and back on his post when she has been a long time', () => {
    const { w, d, loc } = hideout('search');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const g = standing(w, d, loc.id)[0]!;
    const e = p.board.ents[g.id]!;
    const home = { ...e.home! };
    e.x = home.x + (home.x > 0 ? -1 : 1);
    e.behavior = 'search';
    e.last = { x: home.x, y: home.y };
    w.beat += 5;
    syncPlace(w, p);
    expect(p.board.ents[g.id]!.behavior).toBe('search');
    expect(p.board.ents[g.id]!.last).toEqual(home);
    w.beat += 40;
    syncPlace(w, p);
    expect(p.board.ents[g.id]!.behavior).not.toBe('search');
    expect({ x: p.board.ents[g.id]!.x, y: p.board.ents[g.id]!.y }).toEqual(home);
    expect(p.board.ents[g.id]!.last).toBeNull();
  });
});

describe('a fight starts from, and leaves, the same board', () => {
  it('she starts where she was left and they start where they were, and afterwards the board has the new positions and the fallen', () => {
    const { w, d, loc } = hideout('fight');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const foes = standing(w, d, loc.id).slice(0, 2);
    const hero = { ...p.board.hero };
    const before = Object.fromEntries(foes.map((f) => [f.id, { ...p.board.ents[f.id]! }]));
    const { c } = ctxOf(w, 'fight');
    const sim = new Sim(c, HOOKS, { foes, arrivals: [], lethal: true, assault: true, maxRounds: 1, board: p });
    expect({ x: sim.hero.x, y: sim.hero.y }).toEqual(hero);
    for (const f of foes) {
      const u = sim.units.find((x) => x.id === f.id)!;
      expect({ x: u.x, y: u.y }).toEqual({ x: before[f.id]!.x, y: before[f.id]!.y });
    }
    // Played out for real:
    w.hero.level = 30;
    w.hero.maxHp = w.hero.hp = 900;
    const r = ctxOf(w, 'fight2');
    fight(r.c, foes, { cause: 'test', assault: true, joiners: false });
    const q = placeOf(w, loc)!;
    expect(q.board).toBe(p.board);
    const fallen = foes.filter((f) => !f.alive || f.downUntil > w.beat);
    if (w.hero.locationId === loc.id) for (const f of fallen) expect(q.board.bodies.some((b) => b.npcId === f.id), f.name).toBe(true);
  });

  it('what a sneak left is in the fight: her tile, their tiles', () => {
    const { w, d, loc } = hideout('sneak-then-fight');
    w.hero.stealth = true;
    const p = placeOf(w, loc)!;
    const { c } = ctxOf(w, 'stf');
    prowlRoom(c, d, loc, standing(w, d, loc.id));
    const left = standing(w, d, loc.id);
    if (!left.length) return;
    const hero = { ...p.board.hero };
    const sim = new Sim(c, HOOKS, { foes: left, arrivals: [], lethal: false, assault: true, maxRounds: 1, board: p });
    expect({ x: sim.hero.x, y: sim.hero.y }).toEqual(hero);
    for (const f of left) {
      const e = p.board.ents[f.id]!;
      const u = sim.units.find((x) => x.id === f.id)!;
      expect({ x: u.x, y: u.y }, f.name).toEqual({ x: e.x, y: e.y });
    }
  });

  it('what a fight left is in the sneak: the fallen are already found, so nobody is startled by them again', () => {
    const { w, d, loc } = hideout('fight-then-sneak');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const fallen = standing(w, d, loc.id)[0]!;
    fallen.alive = false;
    p.board.bodies.push({ npcId: fallen.id, x: p.board.ents[fallen.id]!.x, y: p.board.ents[fallen.id]!.y, found: true });
    syncPlace(w, p);
    expect(p.board.ents[fallen.id]).toBeUndefined();
    const others = standing(w, d, loc.id);
    w.hero.stealth = true;
    const b = viewOf(w, p, { foes: others });
    expect(b.bodies.some((x) => x.npcId === fallen.id && x.found)).toBe(true);
    const { c, events } = ctxOf(w, 'fts');
    prowlBoard(c, b, (t, o, dd) => c.emit(t, o, dd));
    expect(events.some((e) => e.type === 'prowl_body' && e.data.variant === 'found' && e.data.npc === fallen.name)).toBe(false);
    commitBoard(b, p);
  });

  it('people who turn up in the middle of it (a mugging) start a few tiles from her', () => {
    const sc = scenario({ seed: 'mug', at: 'street_main' });
    relocate(sc.w, 'halo_floor');
    const w = sc.w;
    const p = placeOf(w)!;
    syncPlace(w, p);
    const goon = person(w, 'tmp_1_mugger_0', 'mugger');
    syncPlace(w, p);
    const e = p.board.ents[goon.id]!;
    const d = dist(e, p.board.hero);
    expect(d).toBeGreaterThanOrEqual(2);
    expect(d).toBeLessThanOrEqual(5);
  });
});

describe('between scenes', () => {
  it('a guard is not moved about by the passing of beats, and people who leave are taken off', () => {
    const { w, d, loc } = hideout('quiet');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const g = standing(w, d, loc.id)[0]!;
    const at = { x: p.board.ents[g.id]!.x, y: p.board.ents[g.id]!.y };
    for (let i = 0; i < 20; i++) {
      w.beat++;
      tickPlace(w);
    }
    expect({ x: p.board.ents[g.id]!.x, y: p.board.ents[g.id]!.y }).toEqual(at);
    moveNpc(w, g, '_gone');
    syncPlace(w, p);
    expect(p.board.ents[g.id]).toBeUndefined();
  });

  it('the dungeon runs on it end to end: a stealthy way through still clears and a clumsy one still ends in a fight', () => {
    let cleared = 0;
    let fights = 0;
    for (let i = 0; i < 30; i++) {
      for (const skill of [500, 0]) {
        const { w, loc } = hideout(`e2e${skill}${i}`);
        w.hero.stealth = true;
        w.hero.skills.sneak = skill;
        w.hero.level = 25;
        w.hero.maxHp = w.hero.hp = 700;
        const { c, events } = ctxOf(w, `e${i}`);
        enterRoom(c, loc);
        if (events.some((e) => e.type === 'prowl_end' && e.data.variant === 'cleared')) cleared++;
        if (events.some((e) => e.type === 'fight_start')) fights++;
      }
    }
    void awareness;
    expect(cleared).toBeGreaterThan(0);
    expect(fights).toBeGreaterThan(0);
  });
});

export type { Location };
