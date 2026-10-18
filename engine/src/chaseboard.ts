import { dist, idx, passable, pathTo, reach, type Pos } from './grid';
import { placeOf, syncPlace, type Placed } from './placeboard';
import type { Id, World } from './types';

/**
 * A chase on the street she is running down. The chase is still the chase (`chase.ts`): a gap to each chaser, a round at a time. The
 * board is where that is: she runs a line along the street from where she came on to the way off it, and each chaser is that many
 * tiles back along it. Everything about the street that matters to a chase (how tight it is, what she could duck into, who can see
 * her) is read off the tiles round that line. See docs/STREETS_PLAN.md.
 */

/** Tiles of street covered in a round for each point of pace: a street is gone through in a round or two. */
export const TILES_PER_PACE = 2.2;

export interface ChaseBoard {
  loc: Id;
  placed: Placed;
  /** The tiles she runs along, from where she came onto the street to the way off it she is making for (or as far as she can go). */
  path: Pos[];
  /** Where it ends: the street (or building) beyond the last tile, if it ends at a way off. */
  exitTo: Id | null;
  /** How far along it she is, in tiles. */
  s: number;
}

/** The tile at this distance along the line (the ends if it is off either). */
export const tileAt = (cb: ChaseBoard, s: number): Pos => cb.path[Math.max(0, Math.min(cb.path.length - 1, Math.round(s)))]!;

/** Whether this far back is still on the street she came from. */
export const offBoard = (cb: ChaseBoard, back: number): boolean => cb.s - back < -0.5;

/** Set the line she runs along, from where she is now to the way off toward `exitTo` (or, with none, the way off farthest from where she came on). */
export function openBoard(w: World, exitTo: Id | null): ChaseBoard | null {
  const placed = placeOf(w);
  if (!placed) return null;
  syncPlace(w, placed);
  const g = placed.layout.grid;
  const from = { ...placed.board.hero };
  const r = reach(g, from, 800, () => false);
  const reachable = (p: Pos): boolean => r.cost.has(idx(g, p));
  const doors = placed.layout.doors;
  let target: Pos | null = null;
  let to: Id | null = null;
  const pick = (ds: typeof doors): void => {
    const best = ds.filter((d) => reachable(d.at)).sort((a, b) => dist(a.at, from) - dist(b.at, from) || a.exit.localeCompare(b.exit))[0];
    if (best) {
      target = best.at;
      to = best.exit;
    }
  };
  if (exitTo) pick(doors.filter((d) => d.exit === exitTo));
  if (!target) {
    // No way of her own choosing: the way off that is farthest from where she came on.
    const far = doors.filter((d) => reachable(d.at) && dist(d.at, from) >= 3).sort((a, b) => dist(b.at, from) - dist(a.at, from) || a.exit.localeCompare(b.exit))[0];
    if (far) {
      target = far.at;
      to = far.exit;
    }
  }
  if (!target) {
    // A street with no way off at all: the farthest tile.
    let bd = -1;
    for (const i of r.cost.keys()) {
      const p = { x: i % g.w, y: Math.floor(i / g.w) };
      if (passable(g, p.x, p.y) && dist(p, from) > bd) {
        bd = dist(p, from);
        target = p;
      }
    }
  }
  const path = [from, ...(target ? pathTo(g, r, target) : [])];
  return { loc: placed.board.loc, placed, path, exitTo: to, s: 0 };
}

/** She runs on. Her tile on the board is where the line says. Returns whether she has come to the end of the street. */
export function runOn(cb: ChaseBoard, tiles: number): boolean {
  cb.s = Math.min(cb.path.length - 1, cb.s + Math.max(0, tiles));
  const at = tileAt(cb, cb.s);
  cb.placed.board.hero = { ...at };
  cb.placed.board.at = 'floor';
  return cb.s >= cb.path.length - 1;
}

/** Where a chaser is on the street: that many tiles back along her line, or still on the street she came from. */
export function chaserTile(cb: ChaseBoard, gap: number): { at: Pos; off: boolean } {
  return { at: tileAt(cb, cb.s - gap), off: offBoard(cb, gap) };
}
