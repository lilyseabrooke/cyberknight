import { dist, idx, passable, pathTo, reach, type Pos } from './grid';
import { placeOf, syncPlace, type Placed } from './placeboard';
import { roadClass } from './roads';
import { isClosed } from './hours';
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
    const away = doors.filter((d) => reachable(d.at) && dist(d.at, from) >= 3);
    const far = (away.some((d) => w.locations[d.exit]?.kind === 'street') ? away.filter((d) => w.locations[d.exit]?.kind === 'street') : away).sort((a, b) => dist(b.at, from) - dist(a.at, from) || a.exit.localeCompare(b.exit))[0];
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

// ------------------------------------------------------------------ what the street is like round her

const AHEAD = 12;

/** How many of the eight tiles round this one are in the way: solid, or somebody is standing on them. */
function blockedAround(cb: ChaseBoard, p: Pos): number {
  const g = cb.placed.layout.grid;
  const ents = cb.placed.board.ents;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = p.x + dx;
      const y = p.y + dy;
      if (!passable(g, x, y) || Object.values(ents).some((e) => e.x === x && e.y === y)) n++;
    }
  }
  return n;
}

/** The stretch of the line she is about to run. */
function window(cb: ChaseBoard, ahead = AHEAD): Pos[] {
  const out: Pos[] = [];
  for (let k = Math.round(cb.s); k <= Math.min(cb.path.length - 1, Math.round(cb.s) + ahead); k++) out.push(cb.path[k]!);
  return out;
}

/**
 * How tight the street is where she is running, 0 (all the room in the world) to 1 (none): how much of what is round the line over the
 * next stretch is wall, stalls, cars and people.
 */
export function localSqueeze(cb: ChaseBoard, ahead = AHEAD): number {
  const tiles = window(cb, ahead);
  if (!tiles.length) return 0;
  const mean = tiles.reduce((a, p) => a + blockedAround(cb, p), 0) / tiles.length / 8;
  // A wall down one side is just a street; it takes more than that to squeeze.
  return Math.max(0, Math.min(1, (mean - 0.25) * 1.7));
}

/** Places on the line ahead where it pinches: a gap she has to get through, between things. */
export function pinches(cb: ChaseBoard, ahead = AHEAD): number {
  return window(cb, ahead).filter((p) => blockedAround(cb, p) >= 5).length;
}

// ------------------------------------------------------------------ ways out of it

export type OutKind = 'door' | 'mouth' | 'up' | 'crowd';

/** Somewhere to go that is not along the line: a doorway, a side street, a way up onto a roof, a crowd to lose herself in. */
export interface Out {
  kind: OutKind;
  /** Where it is on the board. */
  at: Pos;
  /** The place beyond a door or a mouth. */
  to?: Id;
  label: string;
  /** How many tiles away. */
  d: number;
  /** For a way up: how it is climbed. */
  via?: 'stairs' | 'ladder' | 'climb';
}

/** What she could duck into within a few tiles of where she is. */
export function outsFrom(w: World, cb: ChaseBoard, reachTiles = 10): Out[] {
  const { layout, board } = cb.placed;
  const g = layout.grid;
  const here = tileAt(cb, cb.s);
  const r = reach(g, here, reachTiles + 4, () => false);
  const cost = (p: Pos): number | undefined => r.cost.get(idx(g, p));
  const outs: Out[] = [];
  for (const d of layout.doors) {
    const c = cost(d.at);
    if (c === undefined || c > reachTiles || d.exit === cb.exitTo) continue;
    const to = w.locations[d.exit];
    if (!to || isClosed(w, to.id)) continue;
    if (to.kind !== 'street') outs.push({ kind: 'door', at: d.at, to: to.id, label: d.label, d: c });
    else if (roadClass(to) === 'alley') outs.push({ kind: 'mouth', at: d.at, to: to.id, label: d.label, d: c });
  }
  if (g.access && g.level) {
    for (const [k, how] of Object.entries(g.access)) {
      if (how !== 'stairs' && how !== 'ladder' && how !== 'climb') continue;
      const at = { x: Number(k) % g.w, y: Math.floor(Number(k) / g.w) };
      // (Reached from a tile beside it that is lower.)
      const from = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: at.x + dx, y: at.y + dy }))).filter((q) => passable(g, q.x, q.y) && g.level![idx(g, q)]! < g.level![Number(k)]! && cost(q) !== undefined);
      const best = from.sort((a, b) => cost(a)! - cost(b)!)[0];
      if (best && cost(best)! <= reachTiles) outs.push({ kind: 'up', at, label: how === 'climb' ? 'a drainpipe up to the roofs' : how === 'ladder' ? 'a ladder' : 'a flight of steps', d: cost(best)!, via: how });
    }
  }
  // A knot of people is somewhere to lose herself.
  const people = Object.values(board.ents).filter((e) => dist(e, here) <= reachTiles);
  const knot = people.find((e) => people.filter((o) => dist(o, e) <= 2).length >= 3);
  if (knot) outs.push({ kind: 'crowd', at: { x: knot.x, y: knot.y }, label: 'the crowd', d: dist(knot, here) });
  return outs.sort((a, b) => a.d - b.d || a.kind.localeCompare(b.kind));
}
