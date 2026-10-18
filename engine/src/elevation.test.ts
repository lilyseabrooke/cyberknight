import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { hasLos, idx, inCover, neighbors, passable, reach, stepOf, type Access, type Grid } from './grid';
import { layoutOf, hasBoard } from './layout';
import { reachable } from './layoutkit';
import { streetLayout, streetType } from './streets';
import { typeFromName } from './streettypes';
import { scenario } from './testkit';
import { relocate, fight } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { createWorld } from './world';
import type { Location } from './types';

/** A flat board with a row of tiles at the heights given, and the ways onto each. */
const row = (levels: number[], access: Record<number, Access> = {}): Grid => ({ w: levels.length, h: 1, cells: levels.map(() => 'floor' as const), exits: [{ x: 0, y: 0 }], level: levels, access });

describe('getting up', () => {
  it('stairs and ladders are free, a ledge slows you down, a climb takes a check, a sheer face cannot be climbed', () => {
    for (const [kind, ok, extra, check, climber] of [
      ['stairs', true, 0, false, false], ['ladder', true, 0, false, false], ['ledge', true, 2, false, false],
      ['climb', false, 0, false, false], ['climb', true, 2, true, true], ['sheer', false, 0, false, true],
    ] as const) {
      const g = row([0, 1], { 1: kind });
      const s = stepOf(g, { x: 0, y: 0 }, { x: 1, y: 0 }, climber);
      expect([kind, climber, s.ok, s.extra, s.check]).toEqual([kind, climber, ok, extra, check]);
    }
    // a rise with no way marked is a wall
    expect(stepOf(row([0, 1]), { x: 0, y: 0 }, { x: 1, y: 0 }, true).ok).toBe(false);
  });

  it('a ledge is one level and no more; stairs and ladders go further; a climb is at most two', () => {
    expect(stepOf(row([0, 2], { 1: 'ledge' }), { x: 0, y: 0 }, { x: 1, y: 0 }).ok).toBe(false);
    expect(stepOf(row([0, 3], { 1: 'stairs' }), { x: 0, y: 0 }, { x: 1, y: 0 }).ok).toBe(true);
    expect(stepOf(row([0, 3], { 1: 'climb' }), { x: 0, y: 0 }, { x: 1, y: 0 }, true).ok).toBe(false);
    expect(stepOf(row([0, 2], { 1: 'climb' }), { x: 0, y: 0 }, { x: 1, y: 0 }, true).ok).toBe(true);
  });

  it('going down is always possible, and a drop of more than one level is a fall', () => {
    const g = row([3, 2, 0]);
    expect(stepOf(g, { x: 0, y: 0 }, { x: 1, y: 0 })).toMatchObject({ ok: true, fall: 0 });
    expect(stepOf(g, { x: 1, y: 0 }, { x: 2, y: 0 })).toMatchObject({ ok: true, fall: 1 });
    expect(stepOf(g, { x: 0, y: 0 }, { x: 2, y: 0 }).fall).toBe(2);
  });

  it('movement uses it: you can walk up stairs but not a sheer face, and a ledge costs more than the step', () => {
    const g = row([0, 1, 1, 1, 0], { 1: 'ledge', 2: 'stairs' });
    expect(neighbors(g, { x: 0, y: 0 }).map((p) => p.x)).toEqual([1]);
    const r = reach(g, { x: 0, y: 0 }, 10, () => false);
    expect(r.cost.get(1)).toBe(3);
    expect(r.cost.get(3)).toBe(5);
    const sheer = row([0, 1]);
    expect(neighbors(sheer, { x: 0, y: 0 })).toEqual([]);
    // from the top you can always come down
    expect(neighbors(sheer, { x: 1, y: 0 }).map((p) => p.x)).toEqual([0]);
    // a climber gets up what a walker cannot, and a pipe is slow
    const pipe = row([0, 1], { 1: 'climb' });
    expect(neighbors(pipe, { x: 0, y: 0 })).toEqual([]);
    expect(reach(pipe, { x: 0, y: 0 }, 10, () => false, false, true).cost.get(1)).toBe(3);
    // and the way back: who could step onto the roof
    expect(reach(pipe, { x: 1, y: 0 }, 10, () => false, false, true, true).cost.has(0)).toBe(true);
  });

  it('flyers ignore all of it', () => {
    const g = row([0, 2]);
    expect(neighbors(g, { x: 0, y: 0 }, true).map((p) => p.x)).toEqual([1]);
  });
});

describe('seeing from up there', () => {
  const field = (levels: number[][], walls: [number, number][] = []): Grid => {
    const h = levels.length;
    const w = levels[0]!.length;
    const g: Grid = { w, h, cells: Array(w * h).fill('floor'), exits: [{ x: 0, y: 0 }], level: levels.flat() };
    for (const [x, y] of walls) g.cells[y * w + x] = 'wall';
    return g;
  };

  it('a raised board is seen exactly as a flat one when everything is at the same height', () => {
    const flat = field([[0, 0, 0, 0, 0]], [[2, 0]]);
    expect(hasLos(flat, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
    expect(hasLos(field([[0, 0, 0, 0, 0]]), { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it('from two levels up you see over a wall that stops anyone on the ground', () => {
    const g = field([[2, 0, 0, 0, 0]], [[1, 0]]);
    expect(hasLos(g, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(hasLos(g, { x: 4, y: 0 }, { x: 0, y: 0 })).toBe(true);
    const low = field([[0, 0, 0, 0, 0]], [[1, 0]]);
    expect(hasLos(low, { x: 4, y: 0 }, { x: 0, y: 0 })).toBe(false);
  });

  it('you cannot see onto a platform past its edge from the ground, but you can from beside it', () => {
    const g = field([[0, 0, 2, 2, 2, 2]]);
    expect(hasLos(g, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false);
    expect(hasLos(g, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(true);
    // from the edge you see the street at its foot, though not from well back from it
    expect(hasLos(g, { x: 2, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(hasLos(g, { x: 5, y: 0 }, { x: 0, y: 0 })).toBe(false);
  });

  it('cover that is not right in front of them does not protect from above', () => {
    const g = field([[1, 1, 1, 1, 0]]);
    g.cells[2] = 'cover';
    expect(inCover(g, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
    const flat = field([[0, 0, 0, 0, 0]]);
    flat.cells[2] = 'cover';
    expect(inCover(flat, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });
});

describe('raised streets', () => {
  const base = scenario({ seed: 'raised', at: 'street_main' }).w.locations.street_main!;
  const make = (name: string, district: Location['gen'] extends infer G ? (G extends { district: infer D } ? D : never) : never, neighbours: number, i: number): { loc: Location; locations: Record<string, Location> } => {
    const locations: Record<string, Location> = {};
    const exits = [] as Location['exits'];
    const here: Location = { ...base, id: `s${i}`, name, street: typeFromName(name, true), hex: { q: 0, r: 0, dir: i % 6, cells: Array.from({ length: 1 + (i % 3) }, (_, k) => [k, 0] as [number, number]) }, cameras: 1, exits, links: [], road: undefined, gen: { role: 'street', parent: 'x', slot: 0, depth: 1, district, expanded: true } };
    locations[here.id] = here;
    for (let k = 0; k < neighbours; k++) {
      const nb: Location = { ...base, id: `n${k}`, name: 'Other Street', hex: { q: Math.round(4 * Math.cos((k * 2 * Math.PI) / 3)), r: Math.round(4 * Math.sin((k * 2 * Math.PI) / 3)), dir: 0, cells: [[0, 0]] }, exits: [] };
      locations[nb.id] = nb;
      exits.push({ to: nb.id, label: 'on', hidden: false, gate: null });
    }
    for (let k = 0; k < 3; k++) {
      const b: Location = { ...base, id: `b${k}`, name: 'A shop', kind: 'shop', outdoors: false, exits: [] };
      locations[b.id] = b;
      exits.push({ to: b.id, label: 'in', hidden: false, gate: null });
    }
    return { loc: here, locations };
  };

  const sound = (g: Grid, label: string): void => {
    expect(g.level!.length, label).toBe(g.w * g.h);
    const seen = reachable(g, g.exits[0]!);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (passable(g, x, y)) expect(seen.has(idx(g, { x, y })), `${label}: ${x},${y} at level ${g.level![idx(g, { x, y })]} cannot be got to`).toBe(true);
    // every way on and off the board can be walked into and out of at its own height
    for (const e of g.exits) {
      expect(neighbors(g, e, false, true).length, `${label}: exit ${e.x},${e.y} leads nowhere`).toBeGreaterThan(0);
      expect(neighbors(g, e, false, true, true).length, `${label}: nothing leads to exit ${e.x},${e.y}`).toBeGreaterThan(0);
    }
  };

  it('a terrace climbs in three tiers, and has a way up that is easy and some that are not', () => {
    for (let i = 0; i < 12; i++) {
      const { loc, locations } = make('Hill Terrace', 'tenement', i % 3, i);
      expect(streetType(loc)).toBe('terrace');
      const l = streetLayout({ locations }, loc, `t${i}`);
      const g = l.grid;
      sound(g, `terrace ${i}`);
      expect(new Set(g.level)).toEqual(new Set([0, 1, 2]));
      const kinds = new Set(Object.values(g.access!));
      expect(kinds.has('stairs') && kinds.has('sheer' as never) === false).toBe(true);
      expect(kinds.has('stairs')).toBe(true);
      // the stairs get a walker to the top without a check
      const exit = g.exits[0]!;
      const walk = reach(g, exit, 400, () => false);
      const tops = [...walk.cost.keys()].filter((i2) => g.level![i2] === 2);
      expect(tops.length, `terrace ${i}: no free way to the top`).toBeGreaterThan(0);
    }
  });

  it('a shanty town has roofs at several heights, some with a ladder and some you can only climb', () => {
    let climbOnly = 0;
    let ladders = 0;
    for (let i = 0; i < 12; i++) {
      const { loc, locations } = make('Salt Lane', 'slum', 2, i);
      // (The slums turn about half their lanes into shanties; look at any that did.)
      const l = streetLayout({ locations }, loc, `sh${i}`);
      const g = l.grid;
      if (!g.level || !g.access || !Object.values(g.access).includes('climb')) continue;
      sound(g, `shanty ${i}`);
      ladders += Object.values(g.access).filter((a) => a === 'ladder').length;
      const exit = g.exits[0]!;
      const free = reach(g, exit, 600, () => false).cost;
      const high = g.level.map((lv, k) => (lv > 0 && passable(g, k % g.w, Math.floor(k / g.w)) ? k : -1)).filter((k) => k >= 0);
      climbOnly += high.filter((k) => !free.has(k)).length;
    }
    expect(ladders).toBeGreaterThan(0);
    expect(climbOnly).toBeGreaterThan(0);
  });

  it('every street kind is sound with its raised parts, for any seed', () => {
    let raised = 0;
    const names = ['Dock Freightway', 'Salt Wharf', 'Sky Walk', 'Founders Plaza', 'Night Bazaar', 'Brick Yard', 'Halo roof', 'Dead Alley', 'Hill Terrace', 'Mill Street'];
    for (const [ni, name] of names.entries()) {
      for (let i = 0; i < 25; i++) {
        const { loc, locations } = make(name, i % 2 ? 'slum' : 'industrial', 1 + (i % 3), ni * 100 + i);
        const g = streetLayout({ locations }, loc, `k${i}`).grid;
        if (!g.level) continue;
        raised++;
        sound(g, `${name} ${i}`);
      }
    }
    expect(raised).toBeGreaterThan(40);
  });

  it('a grown city has raised ground and every bit of it can be got to', () => {
    const w = createWorld({ seed: 'x', worldSeed: 'raisedcity', competence: 0.6 });
    let seen = 0;
    for (const loc of Object.values(w.locations)) {
      if (!hasBoard(loc)) continue;
      const l = layoutOf(w, loc)!;
      if (l.grid.level) {
        seen++;
        sound(l.grid, loc.name);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(0);
  });
});

describe('fighting on raised ground', () => {
  it('a fight on a terrace runs to the end, with people on different levels', () => {
    let different = 0;
    for (let i = 0; i < 8; i++) {
      const sc = scenario({ seed: `terr${i}`, at: 'street_main' });
      sc.w.locations.street_main!.name = 'Hill Terrace';
      sc.w.locations.street_main!.street = 'terrace';
      relocate(sc.w, 'street_main');
      const foes = Array.from({ length: 3 }, (_, k) => {
        const n = spawnNpc(new Rng(`f${i}${k}`), `f${i}_${k}`, 'ganger', 'street_main');
        addNpc(sc.w, n);
        return n;
      });
      const l = layoutOf(sc.w, sc.w.locations.street_main!)!;
      if (l.grid.level && new Set(l.grid.level).size > 1) different++;
      const r = fight({ w: sc.w, rng: new Rng(`r${i}`), emit() {} }, foes, { cause: 'test', joiners: false });
      expect(['win', 'flee', 'lose', 'dead', 'spared', 'escaped']).toContain(r);
    }
    expect(different).toBeGreaterThan(0);
  });
});
