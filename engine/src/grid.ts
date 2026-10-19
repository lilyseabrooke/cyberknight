import type { Location, ParkedVehicle, Vehicle } from './types';
import type { Rng } from './rng';
import { planShape, type Shape } from './shapes';

/**
 * The board a fight is played on. Small (4x4 up to 8x8), thrown together from the kind of place it happens in, and
 * thrown away afterwards. Eight-way movement; distance is Chebyshev. Plain data: nothing here knows about people.
 *
 * - floor: walk on it.
 * - wall: blocks movement and sight.
 * - cover: crates, cars, pillars. Blocks movement; shots pass over it but the person behind it is harder to hit.
 * - hazard: passable and nasty (live wire, burning barrel, spilled coolant).
 * - void: not part of the room at all (the outside of an L-shaped room). Nobody stands on it and nothing is seen through it.
 * - exit: a door, a stairwell, the mouth of an alley. The only way off the board, and the way newcomers get on.
 */
export type Terrain = 'floor' | 'wall' | 'cover' | 'hazard' | 'exit' | 'void';

export interface Pos {
  x: number;
  y: number;
}

/** What a car can take and give: a real car's own numbers, or the numbers of one that is only scenery. */
export interface CarLike {
  hp: number;
  maxHp: number;
  armor: number;
}

/**
 * A car on the board. Its cells are `cover` (so movement, sight and shelter work the way they always have); the object
 * is what takes the damage. A car that is hers keeps its hit points in `ref`, so what happens to it here is still true after.
 */
export interface BoardObject {
  id: string;
  name: string;
  cells: Pos[];
  car: CarLike;
  /** The real car, when it is hers (driven or parked), so damage and destruction persist. */
  ref?: Vehicle | ParkedVehicle;
  kind: Vehicle['kind'];
  /** A car is a box she sits in; a bike one cell she rides, with no door and nothing to hide in. */
  body: Vehicle['body'];
  /** Which car it is (`Vehicle.id`), so a key in somebody's pocket can be matched to it. */
  carId?: string;
  mine: boolean;
  team: 'hero' | 'foe' | 'neutral';
  /** Shut doors make a car a place to hide; forced ones are open for the rest of the fight. */
  doors: 'shut' | 'forced';
  dents: number;
  /** Rounds of fire left once it has gone up; after that the shell is cover for good. */
  burn: number;
  wrecked: boolean;
}

/**
 * How a raised tile is got up onto from a lower one beside it. Set on the upper tile (`Grid.access`).
 * - stairs, ladder: free, whatever the height (a flight of stairs or a ladder is a way up).
 * - ledge: a waist-high wall or a crate to haul yourself over. One level only, and it slows you down.
 * - climb: a drainpipe, a fence, a bad wall. Up to two levels, slow, and it takes a check; those who cannot climb (machines, dogs) cannot.
 * - sheer (or nothing): no way up from here. Going down is always possible.
 */
export type Access = 'stairs' | 'ladder' | 'ledge' | 'climb' | 'sheer';

export interface Grid {
  w: number;
  h: number;
  cells: Terrain[];
  /** Height of each tile in levels (0 is the ground). Absent on a flat board. */
  level?: number[];
  /** By the index of the higher tile: how to get up onto it from beside it. A rise with nothing here cannot be climbed. */
  access?: Record<number, Access>;
  exits: Pos[];
  objects?: BoardObject[];
  /** Tiles (by index) of things big enough to block sight but not walls: a speaker tower, a rack, a pillar. A crate or a table is cover and does not. */
  tall?: number[];
}

interface Spec {
  w: [number, number];
  h: [number, number];
  cover: [number, number];
  walls: [number, number];
  hazards: [number, number];
  exits: [number, number];
}

const SPECS: Record<Location['kind'], Spec> = {
  home: { w: [4, 4], h: [4, 4], cover: [1, 2], walls: [0, 1], hazards: [0, 0], exits: [1, 1] },
  shop: { w: [4, 5], h: [4, 5], cover: [2, 3], walls: [0, 1], hazards: [0, 0], exits: [1, 2] },
  clinic: { w: [4, 5], h: [4, 5], cover: [2, 3], walls: [0, 1], hazards: [0, 0], exits: [1, 1] },
  bar: { w: [5, 6], h: [5, 6], cover: [3, 5], walls: [0, 2], hazards: [0, 1], exits: [2, 2] },
  club: { w: [6, 7], h: [6, 7], cover: [4, 6], walls: [0, 2], hazards: [0, 2], exits: [2, 3] },
  street: { w: [6, 7], h: [5, 6], cover: [3, 5], walls: [0, 2], hazards: [0, 1], exits: [2, 3] },
  tunnel: { w: [8, 8], h: [4, 4], cover: [2, 3], walls: [1, 3], hazards: [0, 1], exits: [2, 2] },
  corp: { w: [6, 7], h: [6, 7], cover: [3, 5], walls: [2, 4], hazards: [0, 1], exits: [2, 2] },
  boss: { w: [8, 8], h: [8, 8], cover: [5, 7], walls: [0, 2], hazards: [2, 4], exits: [2, 2] },
  lair: { w: [6, 8], h: [5, 7], cover: [3, 6], walls: [1, 3], hazards: [0, 1], exits: [2, 2] },
  gym: { w: [6, 7], h: [5, 6], cover: [3, 5], walls: [0, 1], hazards: [0, 1], exits: [1, 2] },
  pawn: { w: [5, 6], h: [4, 5], cover: [3, 4], walls: [0, 1], hazards: [0, 0], exits: [1, 2] },
  chop: { w: [6, 7], h: [4, 5], cover: [3, 5], walls: [0, 1], hazards: [0, 1], exits: [1, 2] },
};

export const idx = (g: Grid, p: Pos): number => p.y * g.w + p.x;
export const inBounds = (g: Grid, x: number, y: number): boolean => x >= 0 && y >= 0 && x < g.w && y < g.h;
export const terrainAt = (g: Grid, x: number, y: number): Terrain | null => (inBounds(g, x, y) ? g.cells[y * g.w + x]! : null);
export const dist = (a: Pos, b: Pos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const same = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** How high a tile is, in levels. */
export const levelAt = (g: Grid, x: number, y: number): number => (g.level ? g.level[y * g.w + x] ?? 0 : 0);

export interface Step {
  ok: boolean;
  /** Extra movement it costs on top of the step itself. */
  extra: number;
  /** Going up this way takes a check. */
  check: boolean;
  /** Levels fallen past the first (a jump down more than one level hurts). */
  fall: number;
}

const FLAT: Step = { ok: true, extra: 0, check: false, fall: 0 };

/** Can you step from `a` onto the next tile `b`, and what does the height do to it? */
export function stepOf(g: Grid, a: Pos, b: Pos, climber = false): Step {
  if (!g.level) return FLAT;
  const d = levelAt(g, b.x, b.y) - levelAt(g, a.x, a.y);
  if (d === 0) return FLAT;
  if (d < 0) return { ok: true, extra: d <= -2 ? 9 * (-d - 1) : 0, check: false, fall: d <= -2 ? -d - 1 : 0 };
  switch (g.access?.[b.y * g.w + b.x] ?? 'sheer') {
    case 'stairs':
    case 'ladder': return d <= 3 ? FLAT : { ok: false, extra: 0, check: false, fall: 0 };
    case 'ledge': return d === 1 ? { ok: true, extra: 2, check: false, fall: 0 } : { ok: false, extra: 0, check: false, fall: 0 };
    case 'climb': return d <= 2 && climber ? { ok: true, extra: 2, check: true, fall: 0 } : { ok: false, extra: 0, check: false, fall: 0 };
    default: return { ok: false, extra: 0, check: false, fall: 0 };
  }
}

export const walkable = (t: Terrain | null): boolean => t === 'floor' || t === 'hazard' || t === 'exit';

/** Can anything walk through here (flyers go over cover)? */
export const passable = (g: Grid, x: number, y: number, flying = false): boolean => {
  const t = terrainAt(g, x, y);
  return walkable(t) || (flying && t === 'cover');
};

export function neighbors(g: Grid, p: Pos, flying = false, climber = false, into = false): Pos[] {
  const out: Pos[] = [];
  for (const [dx, dy] of DIRS) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (!passable(g, x, y, flying)) continue;
    // No squeezing diagonally between two solid corners.
    if (dx && dy && !passable(g, p.x + dx, p.y, flying) && !passable(g, p.x, p.y + dy, flying)) continue;
    // `into`: the tiles from which you could step onto `p`, as against the ones you could step to from it.
    if (!flying && !(into ? stepOf(g, { x, y }, p, climber) : stepOf(g, p, { x, y }, climber)).ok) continue;
    out.push({ x, y });
  }
  return out;
}

export interface Reach {
  cost: Map<number, number>;
  prev: Map<number, number>;
}

/**
 * Everywhere you can get to for `budget` movement. Hazard tiles cost double. `blocked` marks tiles you cannot enter
 * (other people's feet); stepping through a friend is the caller's business, so it simply isn't blocked here.
 */
export function reach(g: Grid, from: Pos, budget: number, blocked: (p: Pos) => boolean, flying = false, climber = false, into = false): Reach {
  const cost = new Map<number, number>([[idx(g, from), 0]]);
  const prev = new Map<number, number>();
  const open: Pos[] = [from];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (cost.get(idx(g, open[i]!))! < cost.get(idx(g, open[bi]!))!) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    const cc = cost.get(idx(g, cur))!;
    for (const n of neighbors(g, cur, flying, climber, into)) {
      if (blocked(n)) continue;
      const step = (terrainAt(g, n.x, n.y) === 'hazard' ? 2 : 1) + (flying ? 0 : (into ? stepOf(g, n, cur, climber) : stepOf(g, cur, n, climber)).extra);
      const nc = cc + step;
      if (nc > budget) continue;
      const ni = idx(g, n);
      if (cost.get(ni) === undefined || nc < cost.get(ni)!) {
        cost.set(ni, nc);
        prev.set(ni, idx(g, cur));
        open.push(n);
      }
    }
  }
  return { cost, prev };
}

export const posOf = (g: Grid, i: number): Pos => ({ x: i % g.w, y: Math.floor(i / g.w) });

/** The steps from the start of a `reach` to `to` (not including the start). */
export function pathTo(g: Grid, r: Reach, to: Pos): Pos[] {
  const out: Pos[] = [];
  let i = idx(g, to);
  while (r.prev.has(i)) {
    out.push(posOf(g, i));
    i = r.prev.get(i)!;
  }
  return out.reverse();
}

/** Cells strictly between two points (Bresenham). */
export function line(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x !== b.x || y !== b.y) out.push({ x, y });
  }
  return out;
}

export const isTall = (g: Grid, p: Pos): boolean => !!g.tall && g.tall.includes(p.y * g.w + p.x);

/** Eye height above the ground of the level one stands on, and how tall a level is, in the same units. */
const EYE = 1.5;
const LEVEL = 2;

export function hasLos(g: Grid, a: Pos, b: Pos): boolean {
  const pts = line(a, b);
  if (!g.level) return pts.every((p) => terrainAt(g, p.x, p.y) !== 'wall' && terrainAt(g, p.x, p.y) !== 'void' && !isTall(g, p));
  // On a raised board the line has a height: from one pair of eyes to the other. Walls, big things and the ground itself get in the way
  // if they reach that high, so a roof sees over a wall and a street cannot see onto a platform past its edge.
  const ea = levelAt(g, a.x, a.y) * LEVEL + EYE;
  const eb = levelAt(g, b.x, b.y) * LEVEL + EYE;
  return pts.every((p, i) => {
    const t = terrainAt(g, p.x, p.y);
    if (t === 'void') return false;
    const h = ea + ((eb - ea) * (i + 1)) / (pts.length + 1);
    const ground = levelAt(g, p.x, p.y) * LEVEL;
    const top = ground + (t === 'wall' ? 4 : isTall(g, p) ? 3 : 0);
    return top < h - 0.2 + (top > ground ? 0.2 : 0);
  });
}

/** The direction (0..7, clockwise from north) that points most nearly from `a` at `b`. */
export function dirOf(a: Pos, b: Pos): number {
  const ang = Math.atan2(b.x - a.x, -(b.y - a.y));
  return ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
}
/** How far apart two directions are: 0 (the same) to 4 (opposite). */
export const angDiff = (a: number, b: number): number => Math.min((a - b + 8) % 8, (b - a + 8) % 8);

/** Is `target` sheltered from `from`? Cover on the line of fire, or right in front of them. */
export function inCover(g: Grid, from: Pos, target: Pos): boolean {
  if (dist(from, target) <= 1) return false;
  const mid = line(from, target);
  // Shooting down over cover that is not right in front of them: it does not help.
  const above = levelAt(g, from.x, from.y) > levelAt(g, target.x, target.y);
  if (mid.some((p, i) => terrainAt(g, p.x, p.y) === 'cover' && (!above || i >= mid.length - 1))) return true;
  const sx = Math.sign(from.x - target.x);
  const sy = Math.sign(from.y - target.y);
  return terrainAt(g, target.x + sx, target.y + sy) === 'cover';
}

const edgeCells = (w: number, h: number): Pos[] => {
  const out: Pos[] = [];
  for (let x = 1; x < w - 1; x++) out.push({ x, y: 0 }, { x, y: h - 1 });
  for (let y = 1; y < h - 1; y++) out.push({ x: 0, y }, { x: w - 1, y });
  return out;
};

/** Everything that can be walked to from the first exit. */
function connected(g: Grid): Set<number> {
  const seen = new Set<number>();
  const start = g.exits[0]!;
  const stack: Pos[] = [start];
  seen.add(idx(g, start));
  while (stack.length) {
    const p = stack.pop()!;
    for (const n of neighbors(g, p)) {
      const i = idx(g, n);
      if (!seen.has(i)) {
        seen.add(i);
        stack.push(n);
      }
    }
  }
  return seen;
}

/** Where a way out could go in an irregular room: a floor tile with the outside (the edge of the map, or void) straight beside it. */
function shapeEdge(g: Grid, only?: Pos[]): Pos[] {
  if (only?.length) return only;
  const out: Pos[] = [];
  const outside = (x: number, y: number): boolean => terrainAt(g, x, y) === null || terrainAt(g, x, y) === 'void';
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (g.cells[y * g.w + x] !== 'floor') continue;
    const sides = [outside(x - 1, y), outside(x + 1, y), outside(x, y - 1), outside(x, y + 1)].filter(Boolean).length;
    if (sides === 1) out.push({ x, y });
  }
  return out;
}

/** A fresh board for a fight in this kind of place. Every walkable tile can be reached from every exit. */
export function makeGrid(rng: Rng, kind: Location['kind'], crowded = false, shape: Shape = 'rect'): Grid {
  const s = SPECS[kind];
  const plan = shape === 'rect' ? null : planShape(rng.fork(`shape:${shape}`), shape);
  const w = plan ? plan.w : rng.int(...s.w);
  const h = plan ? plan.h : rng.int(...s.h);
  const g: Grid = { w, h, cells: plan ? plan.cells.slice() : Array<Terrain>(w * h).fill('floor'), exits: [] };

  if (kind === 'tunnel') {
    const row = rng.int(1, h - 2);
    g.exits.push({ x: 0, y: row }, { x: w - 1, y: rng.int(1, h - 2) });
  } else {
    const edge = plan ? shapeEdge(g, plan.exitCells) : edgeCells(w, h);
    const want = rng.int(...s.exits);
    for (let tries = 0; g.exits.length < want && tries < 60; tries++) {
      const p = rng.pick(edge);
      if (g.exits.every((e) => dist(e, p) >= 3)) g.exits.push(p);
    }
    if (!g.exits.length) g.exits.push(edge[0]!);
  }
  for (const e of g.exits) g.cells[idx(g, e)] = 'exit';

  // Keep the doorways and the two tiles in front of them clear.
  const clearOf = (p: Pos) => g.exits.some((e) => dist(e, p) <= 1) || !!plan?.keep.some((k) => k.x === p.x && k.y === p.y);
  const spots: Pos[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g.cells[y * w + x] === 'floor' && !clearOf({ x, y })) spots.push({ x, y });
  const drop = (t: Terrain, n: number) => {
    for (let i = 0; i < n && spots.length; i++) {
      const k = rng.int(0, spots.length - 1);
      const p = spots.splice(k, 1)[0]!;
      g.cells[idx(g, p)] = t;
    }
  };
  drop('wall', plan ? 0 : rng.int(...s.walls));
  drop('cover', rng.int(...s.cover) + (crowded ? 1 : 0) + (plan ? 2 : 0));
  drop('hazard', rng.int(...s.hazards));

  // Never wall anyone off: turn obstacles back into floor until the whole board is one piece.
  const walkables = () => g.cells.map((c, i) => (walkable(c) ? i : -1)).filter((i) => i >= 0);
  for (let guard = 0; guard < 40; guard++) {
    const reachable = connected(g);
    const stranded = walkables().filter((i) => !reachable.has(i));
    if (!stranded.length) break;
    let blockers = g.cells.map((c, i) => (c === 'wall' || c === 'cover' ? i : -1)).filter((i) => i >= 0);
    // A room drawn to a plan keeps its walls: it is the furniture that gets moved.
    if (plan) blockers = blockers.filter((i) => g.cells[i] === 'cover');
    if (!blockers.length) break;
    g.cells[rng.pick(blockers)] = 'floor';
  }
  return g;
}

/** Floor-ish tiles, nearest first from `anchor` (ties shuffled), for dropping a team on the board. */
export function nearestFree(g: Grid, rng: Rng, anchor: Pos, taken: (p: Pos) => boolean, flying = false): Pos[] {
  const tiles: { p: Pos; d: number; r: number }[] = [];
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const t = terrainAt(g, x, y);
      if ((t !== 'floor' && !(flying && t === 'cover')) || taken({ x, y })) continue;
      // On a raised board people start on her level, not up on a roof over her head.
      tiles.push({ p: { x, y }, d: dist(anchor, { x, y }) + 6 * Math.abs(levelAt(g, x, y) - levelAt(g, anchor.x, anchor.y)), r: rng.next() });
    }
  }
  tiles.sort((a, b) => a.d - b.d || a.r - b.r);
  return tiles.map((t) => t.p);
}

// ===================================================================== cars on the board

/** The car (not already a wreck) whose cell is exactly here. */
export const objectAt = (g: Grid, p: Pos): BoardObject | undefined => g.objects?.find((o) => o.cells.some((c) => same(c, p)));

/** The car a shot at `target` from `from` would run into, if the cover on the line is a car. */
export function coverObject(g: Grid, from: Pos, target: Pos): BoardObject | undefined {
  if (!g.objects?.length || dist(from, target) <= 1) return undefined;
  for (const p of line(from, target)) {
    const o = objectAt(g, p);
    if (o && !o.wrecked) return o;
  }
  const behind = { x: target.x + Math.sign(from.x - target.x), y: target.y + Math.sign(from.y - target.y) };
  const o = objectAt(g, behind);
  return o && !o.wrecked ? o : undefined;
}

/**
 * Park cars on a street: each takes two (or three) neighbouring floor tiles away from the doorways, and turns them into cover.
 * One that would wall somebody off is taken away again. Returns the ones that fit.
 */
export function addObjects(g: Grid, rng: Rng, objs: (Omit<BoardObject, 'cells'> & { size: number })[]): BoardObject[] {
  const placed: BoardObject[] = [];
  const nearDoor = (p: Pos) => g.exits.some((e) => dist(e, p) <= 1);
  for (const spec of objs) {
    const { size, ...rest } = spec;
    for (let tries = 0; tries < 40; tries++) {
      const at = { x: rng.int(0, g.w - 1), y: rng.int(0, g.h - 1) };
      const horizontal = rng.chance(0.5);
      const cells = Array.from({ length: size }, (_, i) => ({ x: at.x + (horizontal ? i : 0), y: at.y + (horizontal ? 0 : i) }));
      if (!cells.every((p) => terrainAt(g, p.x, p.y) === 'floor' && !nearDoor(p))) continue;
      for (const p of cells) g.cells[idx(g, p)] = 'cover';
      if (connected(g).size === g.cells.filter(walkable).length) {
        const o: BoardObject = { ...rest, cells };
        (g.objects ??= []).push(o);
        placed.push(o);
        break;
      }
      for (const p of cells) g.cells[idx(g, p)] = 'floor';
    }
  }
  return placed;
}
