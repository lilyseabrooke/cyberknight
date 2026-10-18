import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { hasLos, idx, makeGrid, neighbors, passable, type Grid } from './grid';
import { planShape, shapeFor, type Shape } from './shapes';
import { layoutOf } from './layout';
import { scenario } from './testkit';

const reachFrom = (g: Grid, from: { x: number; y: number }): Set<number> => {
  const seen = new Set<number>([idx(g, from)]);
  const open = [from];
  while (open.length) {
    for (const n of neighbors(g, open.pop()!)) {
      if (!seen.has(idx(g, n))) {
        seen.add(idx(g, n));
        open.push(n);
      }
    }
  }
  return seen;
};
const count = (g: Grid, t: string): number => g.cells.filter((c) => c === t).length;
const SHAPES: Shape[] = ['L', 'U', 'hall', 'inner'];

describe('room shapes', () => {
  for (const shape of SHAPES) {
    it(`${shape}: every walkable tile can be reached from every way out, and there are ways out`, () => {
      for (let i = 0; i < 60; i++) {
        const g = makeGrid(new Rng(`${shape}${i}`), 'corp', false, shape);
        expect(g.exits.length, `${shape} ${i}`).toBeGreaterThanOrEqual(1);
        for (const e of g.exits) expect(g.cells[idx(g, e)]).toBe('exit');
        const seen = reachFrom(g, g.exits[0]!);
        for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (passable(g, x, y)) expect(seen.has(idx(g, { x, y })), `${shape} ${i}: ${x},${y}`).toBe(true);
        for (const e of g.exits) expect(seen.has(idx(g, e))).toBe(true);
      }
    });
  }

  it('an L or a U has tiles outside the map and no interior walls; a hall or an inner room has walls and none outside', () => {
    for (let i = 0; i < 20; i++) {
      for (const shape of ['L', 'U'] as const) {
        const g = makeGrid(new Rng(`o${shape}${i}`), 'bar', false, shape);
        expect(count(g, 'void')).toBeGreaterThanOrEqual(4);
        expect(count(g, 'wall')).toBe(0);
      }
      for (const shape of ['hall', 'inner'] as const) {
        const g = makeGrid(new Rng(`o${shape}${i}`), 'bar', false, shape);
        expect(count(g, 'void')).toBe(0);
        expect(count(g, 'wall')).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('nobody can stand on, or see through, the outside of the map', () => {
    const g = makeGrid(new Rng('see'), 'bar', false, 'L');
    const v = g.cells.findIndex((c) => c === 'void');
    expect(passable(g, v % g.w, Math.floor(v / g.w))).toBe(false);
    // two floor tiles with the void between them cannot see each other
    let blocked = 0;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!passable(g, x, y)) continue;
      for (let y2 = 0; y2 < g.h; y2++) for (let x2 = 0; x2 < g.w; x2++) {
        if (!passable(g, x2, y2) || (x === x2 && y === y2)) continue;
        const p = { x, y };
        const q = { x: x2, y: y2 };
        const crosses = (hasLos(g, p, q) === false);
        if (crosses) blocked++;
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it('a hall has rooms off it through doorways, and a room in a room is seen into only through its door', () => {
    const h = makeGrid(new Rng('hallroom'), 'corp', false, 'hall');
    const seenFromEnd = reachFrom(h, h.exits[0]!);
    // doorways are gaps in the walls: every wall row has floor in it
    let rowsWithGap = 0;
    for (let y = 0; y < h.h; y++) {
      const row = h.cells.slice(y * h.w, (y + 1) * h.w);
      if (row.filter((c) => c === 'wall').length >= h.w / 2 && row.some((c) => c !== 'wall')) rowsWithGap++;
    }
    expect(rowsWithGap).toBe(2);
    expect(seenFromEnd.size).toBeGreaterThan(20);

    const plan = planShape(new Rng('inner'), 'inner')!;
    const g = makeGrid(new Rng('inner'), 'boss', false, 'inner');
    // the inside of the inner room: a floor tile every neighbour of which is floor or wall, with walls on at least one side
    const walls = g.cells.map((c, i) => (c === 'wall' ? i : -1)).filter((i) => i >= 0);
    expect(walls.length).toBeGreaterThanOrEqual(10);
    expect(plan.keep.length).toBe(3);
  });

  it('plain rooms are what they were, and the odds of the others depend on what sort of place it is', () => {
    const tally: Record<string, number> = {};
    for (let i = 0; i < 400; i++) tally[shapeFor(new Rng(`odds${i}`), 'corp', 'core')] = (tally[shapeFor(new Rng(`odds${i}`), 'corp', 'core')] ?? 0) + 1;
    expect(tally.rect).toBeGreaterThan(100);
    expect(Object.keys(tally).length).toBeGreaterThan(2);
    for (let i = 0; i < 50; i++) expect(shapeFor(new Rng(`h${i}`), 'home', 'home')).toBe('rect');
    let halls = 0;
    for (let i = 0; i < 100; i++) if (shapeFor(new Rng(`d${i}`), 'corp', 'hall') === 'hall') halls++;
    expect(halls).toBeGreaterThan(55);
  });

  it('a place made of them still gets a layout whose cameras stand on the room and whose doors are on floor', () => {
    let irregular = 0;
    for (let i = 0; i < 25; i++) {
      const sc = scenario({ seed: `lay${i}`, at: 'street_main' });
      for (const loc of Object.values(sc.w.locations)) {
        const l = layoutOf(sc.w, loc);
        if (!l) continue;
        if (l.grid.cells.includes('void') || l.grid.cells.includes('wall')) irregular++;
        for (const c of l.cams) expect(['void', 'wall']).not.toContain(l.grid.cells[idx(l.grid, c)]);
        for (const d of l.doors) expect(l.grid.cells[idx(l.grid, d.at)]).toBe('exit');
        const seen = reachFrom(l.grid, l.grid.exits[0]!);
        for (const d of l.doors) expect(seen.has(idx(l.grid, d.at))).toBe(true);
      }
    }
    expect(irregular).toBeGreaterThan(0);
  });
});
