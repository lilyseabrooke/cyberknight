import { dist, hasLos, idx, passable, pathTo, reach, terrainAt, type Pos } from './grid';
import { moveNpc } from './population';
import { V, lose } from './stealth';
import { placeOf, syncPlace, viewOf, type Placed } from './placeboard';
import { dirOf, makeUnit, sightGain } from './prowl';
import type { Rng } from './rng';
import { roadClass } from './roads';
import { isClosed } from './hours';
import type { Id, Npc, Via, World } from './types';
import type { Door } from './layout';

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
  /** Whoever got ahead of her has put something across the way on: where, and whether it has been told or dealt with. */
  block?: { at: Pos[]; told: boolean; done: boolean };
}

/** Cruisers across the street ahead, the last stretch before the way on. */
export function setBlock(cb: ChaseBoard): void {
  const g = cb.placed.layout.grid;
  const k = Math.max(1, cb.path.length - 5);
  const mid = cb.path[Math.min(cb.path.length - 1, k)]!;
  const at: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (passable(g, mid.x + dx, mid.y + dy)) at.push({ x: mid.x + dx, y: mid.y + dy });
  cb.block = { at, told: false, done: false };
}

/** How many tiles along the line it is from where she is to the block, if there is one still ahead. */
export function blockIn(cb: ChaseBoard): number | null {
  if (!cb.block || cb.block.done) return null;
  return Math.max(0, cb.path.length - 5 - Math.round(cb.s));
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
  // (A way through is a street's real way on; a fence is only a way across it.)
  if (exitTo) pick(doors.filter((d) => d.exit === exitTo && !d.via).length ? doors.filter((d) => d.exit === exitTo && !d.via) : doors.filter((d) => d.exit === exitTo));
  if (!target) {
    // No way of her own choosing: the way off that is farthest from where she came on.
    const away = doors.filter((d) => !d.via && reachable(d.at) && dist(d.at, from) >= 3);
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

export type OutKind = 'door' | 'mouth' | 'up' | 'crowd' | 'over' | 'cover';

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
  climb?: 'stairs' | 'ladder' | 'climb';
  /** For a way over: what is in the way, and the building it goes through or over. */
  via?: Via;
  over?: Id;
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
    if (d.via) outs.push({ kind: 'over', at: d.at, to: to.id, label: d.label, d: c, via: d.via, ...(d.over ? { over: d.over } : {}) });
    else if (to.kind !== 'street') outs.push({ kind: 'door', at: d.at, to: to.id, label: d.label, d: c });
    else if (roadClass(to) === 'alley') outs.push({ kind: 'mouth', at: d.at, to: to.id, label: d.label, d: c });
  }
  if (g.access && g.level) {
    for (const [k, how] of Object.entries(g.access)) {
      if (how !== 'stairs' && how !== 'ladder' && how !== 'climb') continue;
      const at = { x: Number(k) % g.w, y: Math.floor(Number(k) / g.w) };
      // (Reached from a tile beside it that is lower.)
      const from = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: at.x + dx, y: at.y + dy }))).filter((q) => passable(g, q.x, q.y) && g.level![idx(g, q)]! < g.level![Number(k)]! && cost(q) !== undefined);
      const best = from.sort((a, b) => cost(a)! - cost(b)!)[0];
      if (best && cost(best)! <= reachTiles) outs.push({ kind: 'up', at, label: how === 'climb' ? 'a drainpipe up to the roofs' : how === 'ladder' ? 'a ladder' : 'a flight of steps', d: cost(best)!, climb: how });
    }
  }
  // A knot of people is somewhere to lose herself.
  const people = Object.values(board.ents).filter((e) => dist(e, here) <= reachTiles);
  const knot = people.find((e) => people.filter((o) => dist(o, e) <= 2).length >= 3);
  if (knot) outs.push({ kind: 'crowd', at: { x: knot.x, y: knot.y }, label: 'the crowd', d: dist(knot, here) });
  const spot = hideSpot(cb, reachTiles);
  if (spot) outs.push({ kind: 'cover', at: spot.at, label: 'a dark corner off the line', d: spot.d });
  return outs.sort((a, b) => a.d - b.d || a.kind.localeCompare(b.kind));
}

/** Somewhere off her line to go to ground: beside something she can get behind, or in the dark, a little way from where they will run. */
function hideSpot(cb: ChaseBoard, reachTiles: number): { at: Pos; d: number } | null {
  const { layout } = cb.placed;
  const g = layout.grid;
  const here = tileAt(cb, cb.s);
  const r = reach(g, here, reachTiles + 2, () => false);
  const line = cb.path.slice(Math.max(0, cb.s - 14), cb.s + 14);
  let best: { at: Pos; d: number; s: number } | null = null;
  for (const [k, c] of r.cost) {
    if (c < 1 || c > reachTiles) continue;
    const at = { x: k % g.w, y: Math.floor(k / g.w) };
    if (!passable(g, at.x, at.y) || Object.values(cb.placed.board.ents).some((e) => e.x === at.x && e.y === at.y)) continue;
    const off = Math.min(...line.map((q) => dist(q, at)));
    if (off < 1 || off > 4) continue;
    const dark = (layout.light[k] ?? 1) === 0;
    const behind = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => terrainAt(g, at.x + dx, at.y + dy) === 'cover'));
    if (!dark && !behind) continue;
    const s = (dark ? 2 : 0) + (behind ? 2 : 0) + off - 0.3 * c;
    if (!best || s > best.s) best = { at, d: c, s };
  }
  return best ? { at: best.at, d: best.d } : null;
}

/**
 * She is down in the dark and they run by: along the line, from where they are to well past her, each of them looking as they go.
 * Whoever sees enough of her has her; if nobody does they have gone on, and are somewhere beyond.
 */
export function passBy(w: World, cb: ChaseBoard, foes: { crew: Npc[]; gap: number }[], spot: Pos, rng: Rng): Npc[] {
  const p = cb.placed;
  const b = viewOf(w, p, { foes: [] });
  b.hero = { ...spot };
  b.posture = 'hold';
  const found: Npc[] = [];
  for (const f of foes) {
    for (const n of f.crew) {
      if (!n.alive || n.downUntil > w.beat) continue;
      let seen = 0;
      for (let i = Math.floor(cb.s - f.gap); i <= cb.s + 12; i++) {
        const at = tileAt(cb, i);
        const ahead = tileAt(cb, i + 1);
        const u = makeUnit(n, at, dirOf({ x: at.x, y: at.y } as never, ahead), {});
        u.behavior = 'patrol';
        seen += sightGain(b, u, spot, 'hold') * (0.85 + 0.3 * rng.next());
      }
      if (seen >= V.aware * 0.4) found.push(n);
    }
  }
  return found;
}

/** They ran past: on along the line and off the end of it, still looking, with no idea where she went. */
export function runPast(w: World, cb: ChaseBoard, foes: { crew: Npc[] }[]): void {
  for (const f of foes) {
    for (const n of f.crew) {
      if (!n.alive || n.downUntil > w.beat) continue;
      lose(w, n);
      if (cb.exitTo && w.locations[cb.exitTo]) moveNpc(w, n, cb.exitTo);
    }
  }
}

// ------------------------------------------------------------------ who can see her

/** How far a runner can be made out: less in the dark. */
const SIGHT = 14;

/**
 * Whether a chaser, that many tiles back along her line, can see her: a line between them that nothing solid or big is in the way of, and
 * near enough for the light. Those right behind her need no line (they hear her and are on her heels), and things with wings see
 * over all of it.
 */
export function chaserSees(w: World, cb: ChaseBoard, gap: number, wings = false): boolean {
  if (gap < 3) return true;
  // (Nothing flying sees into a street with a roof on it.)
  if (wings && ['arcade', 'passage', 'concourse'].includes(w.locations[cb.loc]?.street ?? '')) return false;
  const g = cb.placed.layout.grid;
  const her = tileAt(cb, cb.s);
  const them = chaserTile(cb, gap).at;
  const lit = w.flags.blackout ? 0 : cb.placed.layout.light[idx(g, her)] ?? 1;
  const range = lit === 0 ? SIGHT * 0.55 : lit === 2 ? SIGHT * 1.15 : SIGHT;
  if (dist(them, her) > range) return false;
  return wings || hasLos(g, them, her);
}

/**
 * They lost her, and they are still on the street: alert and looking, from where they last had her. If she comes back this way they are
 * still here.
 */
export function leaveSearching(w: World, cb: ChaseBoard, foes: { crew: Npc[]; gap: number }[], lastSeen: Pos): void {
  const { board } = cb.placed;
  for (const f of foes) {
    const at = chaserTile(cb, f.gap).at;
    for (const n of f.crew) {
      if (!n.alive || n.downUntil > w.beat) continue;
      if (n.locationId !== cb.loc) moveNpc(w, n, cb.loc);
      lose(w, n);
      syncPlace(w, cb.placed);
      const e = board.ents[n.id];
      if (!e) continue;
      e.x = at.x;
      e.y = at.y;
      e.behavior = 'search';
      e.last = { ...lastSeen };
      e.sceneAt = undefined;
      e.calm = 0;
    }
  }
}

/** The tile where she crosses over to this street (a way across with something in it if she means one), if the board has it. */
export function doorTo(cb: ChaseBoard, to: Id, via?: Via | null): Door | undefined {
  const ds = cb.placed.layout.doors.filter((d) => d.exit === to);
  return (via ? ds.find((d) => d.via === via) : undefined) ?? ds.find((d) => !!d.via === !!via) ?? ds[0];
}
