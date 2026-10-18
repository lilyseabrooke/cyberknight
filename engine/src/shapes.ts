import type { Rng } from './rng';
import type { Pos, Terrain } from './grid';

/**
 * The outline of a room. Most rooms are a plain rectangle; the rest are drawn from a plan: tiles outside the map (`void`, which
 * nobody can stand on and nothing can be seen through), interior walls, and the gaps in them.
 *
 * - `L`: a corner of the rectangle is outside the map.
 * - `U`: a notch is cut into one side.
 * - `hall`: a corridor along the middle with rooms off both sides, each reached by a doorway in the wall.
 * - `inner`: a smaller walled room inside the larger one, with one door.
 */
export type Shape = 'rect' | 'L' | 'U' | 'hall' | 'inner';

export interface Plan {
  w: number;
  h: number;
  cells: Terrain[];
  /** Doorways in interior walls and the tiles by them: left clear when the room is furnished. */
  keep: Pos[];
  /** Where the ways out of the room may be, when it is not simply the edge. */
  exitCells?: Pos[];
}

const blank = (w: number, h: number): Terrain[] => Array<Terrain>(w * h).fill('floor');

/** Turn the plan around: a mirror either way, so the same shape does not always open the same direction. */
function flip(p: Plan, rng: Rng): Plan {
  const fx = rng.chance(0.5);
  const fy = rng.chance(0.5);
  if (!fx && !fy) return p;
  const map = (q: Pos): Pos => ({ x: fx ? p.w - 1 - q.x : q.x, y: fy ? p.h - 1 - q.y : q.y });
  const cells = blank(p.w, p.h);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const q = map({ x, y });
    cells[q.y * p.w + q.x] = p.cells[y * p.w + x]!;
  }
  return { ...p, cells, keep: p.keep.map(map), ...(p.exitCells ? { exitCells: p.exitCells.map(map) } : {}) };
}

export function planShape(rng: Rng, shape: Shape): Plan | null {
  switch (shape) {
    case 'L': {
      const w = rng.int(7, 9);
      const h = rng.int(6, 8);
      const bw = rng.int(2, w - 4);
      const bh = rng.int(2, h - 4);
      const cells = blank(w, h);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) cells[y * w + x] = 'void';
      return flip({ w, h, cells, keep: [] }, rng);
    }
    case 'U': {
      const w = rng.int(8, 9);
      const h = rng.int(6, 7);
      const nw = rng.int(2, w - 6);
      const nd = rng.int(2, h - 3);
      const x0 = Math.floor((w - nw) / 2);
      const cells = blank(w, h);
      for (let y = 0; y < nd; y++) for (let x = x0; x < x0 + nw; x++) cells[y * w + x] = 'void';
      return flip({ w, h, cells, keep: [] }, rng);
    }
    case 'hall': {
      const w = rng.int(10, 12);
      const h = 8;
      const cells = blank(w, h);
      const keep: Pos[] = [];
      const set = (x: number, y: number, t: Terrain) => void (cells[y * w + x] = t);
      // Walls either side of the corridor (rows 2 and 5), and the partitions between the rooms.
      for (let x = 0; x < w; x++) {
        set(x, 2, 'wall');
        set(x, 5, 'wall');
      }
      for (const [wallY, rooms, from, to] of [[2, rng.int(2, 3), 0, 1], [5, rng.int(2, 3), 6, 7]] as const) {
        const cuts: number[] = [-1];
        for (let i = 1; i < rooms; i++) {
          const cut = Math.round((i * (w + 1)) / rooms) - 1;
          cuts.push(cut);
          for (let y = from; y <= to; y++) set(cut, y, 'wall');
        }
        cuts.push(w);
        for (let i = 0; i < rooms; i++) {
          const mid = Math.floor((cuts[i]! + 1 + cuts[i + 1]! - 1) / 2);
          set(mid, wallY, 'floor');
          for (const dy of [-1, 0, 1]) keep.push({ x: mid, y: wallY + dy });
        }
      }
      const exitCells = [{ x: 0, y: 3 }, { x: 0, y: 4 }, { x: w - 1, y: 3 }, { x: w - 1, y: 4 }];
      return flip({ w, h, cells, keep, exitCells }, rng);
    }
    case 'inner': {
      const w = rng.int(9, 10);
      const h = rng.int(8, 9);
      const iw = rng.int(3, 4);
      const ih = rng.int(3, 4);
      const bx = rng.int(1, w - iw - 3);
      const by = rng.int(1, h - ih - 3);
      const cells = blank(w, h);
      for (let y = by; y <= by + ih + 1; y++) for (let x = bx; x <= bx + iw + 1; x++) cells[y * w + x] = 'wall';
      for (let y = by + 1; y <= by + ih; y++) for (let x = bx + 1; x <= bx + iw; x++) cells[y * w + x] = 'floor';
      // One door, in the middle of one side.
      const side = rng.int(0, 3);
      const door: Pos = side === 0 ? { x: bx + 1 + Math.floor(iw / 2), y: by } : side === 1 ? { x: bx + 1 + Math.floor(iw / 2), y: by + ih + 1 } : side === 2 ? { x: bx, y: by + 1 + Math.floor(ih / 2) } : { x: bx + iw + 1, y: by + 1 + Math.floor(ih / 2) };
      cells[door.y * w + door.x] = 'floor';
      const out = side === 0 ? { x: 0, y: -1 } : side === 1 ? { x: 0, y: 1 } : side === 2 ? { x: -1, y: 0 } : { x: 1, y: 0 };
      const keep = [door, { x: door.x + out.x, y: door.y + out.y }, { x: door.x - out.x, y: door.y - out.y }];
      return flip({ w, h, cells, keep }, rng);
    }
    default:
      return null;
  }
}

/** The odds of a room being something other than a rectangle, by what kind of place it is. */
const ODDS: Record<string, [Shape, number][]> = {
  bar: [['L', 0.2], ['inner', 0.1]],
  shop: [['L', 0.15]],
  clinic: [['hall', 0.2], ['L', 0.1]],
  pawn: [['L', 0.15], ['inner', 0.15]],
  gym: [['L', 0.15], ['U', 0.1]],
  corp: [['hall', 0.25], ['inner', 0.2], ['L', 0.15]],
  lair: [['L', 0.2], ['U', 0.15], ['inner', 0.1]],
  boss: [['inner', 0.3]],
  club: [['L', 0.2]],
};

/** Which shape a room takes, drawn from its own dice so a plain room is exactly what it always was. */
export function shapeFor(rng: Rng, kind: string, role: string): Shape {
  const odds = role === 'hall' ? ([['hall', 0.8]] as [Shape, number][]) : ODDS[kind] ?? [];
  let r = rng.next();
  for (const [shape, p] of odds) {
    if (r < p) return shape;
    r -= p;
  }
  return 'rect';
}
