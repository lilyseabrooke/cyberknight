import { Rng } from './rng';
import type { Ctx, Id, Location, Npc, PlaceBoard, World } from './types';
import { dist, passable, type Pos } from './grid';
import { npcsAt } from './population';
import { layoutOf, type Door, type Fixture, type Layout, type Zones } from './layout';
import { dirOf, angDiff, makeUnit, sightGain, type Board } from './prowl';
import { V, awareness, stir } from './stealth';

/**
 * Where everyone is in a place she is in: a club today. The layout (layout.ts) is the same every time; this is what moves
 * on it, kept for the run: her, and each person present. It is the answer to "where in the room are they?" for everything
 * that cares, so a fight at the bar starts at the bar and one started from the doorway starts in the doorway.
 *
 * Between scenes it is deliberately coarse. People are put at stations by what they are (the bartender behind the bar, the DJ
 * on the decks, security by the door, the rest on the floor, at the bar or in the booths), and every so often a few drift
 * to a different one. Nobody walks about unless a fight or a sneak is on. Most of this is never in the log.
 */

export interface Placed {
  board: PlaceBoard;
  layout: Layout;
}

/** The board for the place she is in (or the one given), made the first time it's wanted. Null for a place without a layout. */
export function placeOf(w: World, loc: Location | undefined = w.locations[w.hero.locationId]): Placed | null {
  if (!loc) return null;
  const layout = layoutOf(w, loc);
  if (!layout) return null;
  const boards = (w.boards ??= {});
  let board = boards[loc.id];
  if (!board) {
    const front = layout.doors.find((d) => d.front) ?? layout.doors[0];
    board = boards[loc.id] = { loc: loc.id, hero: { ...(front?.at ?? layout.grid.exits[0] ?? { x: 0, y: 0 }) }, at: front ? `door:${front.exit}` : 'floor', pos: {}, facing: {}, placedAt: -999 };
  }
  return { board, layout };
}

const occupied = (b: PlaceBoard, p: Pos, except?: Id): boolean => (b.hero.x === p.x && b.hero.y === p.y) || Object.entries(b.pos).some(([id, q]) => id !== except && q.x === p.x && q.y === p.y);
const walkableAt = (l: Layout, p: Pos): boolean => passable(l.grid, p.x, p.y);

/** Everyone who is here and could be on the board: not her own company. */
const presentAt = (w: World, locId: Id): Npc[] => npcsAt(w, locId).filter((n) => !w.hero.companions.some((a) => a.npcId === n.id));

type Station = keyof Zones;

/** Those who stay where they work. */
const fixedStation = (n: Npc): boolean => n.archetype === 'bartender' || n.archetype === 'dj' || n.archetype === 'bouncer' || n.role === 'DJ' || /bartender|barkeep/i.test(n.role) || n.tags.includes('security') || n.tags.includes('cop');

/** Where someone of this sort is when nothing is happening. */
function stationOf(n: Npc, rng: Rng): Station {
  const arch = n.archetype;
  if (arch === 'bartender' || /bartender|barkeep/i.test(n.role)) return 'behindBar';
  if (arch === 'dj' || n.role === 'DJ') return 'deck';
  if (n.tags.includes('security') || n.tags.includes('cop') || arch === 'bouncer') return 'front';
  if (/dancer/i.test(n.role)) return 'floor';
  const r = rng.next();
  return r < 0.5 ? 'floor' : r < 0.75 ? 'stools' : 'seats';
}

const facingFor = (l: Layout, station: Station, at: Pos): number => {
  switch (station) {
    case 'behindBar': return l.bar === 'east' ? 6 : 2;
    case 'stools': return l.bar === 'east' ? 2 : 6;
    case 'deck': return 4;
    case 'front': return 4;
    case 'seats': return l.bar === 'east' ? 2 : 6;
    default: return dirOf(at, { x: Math.floor(l.grid.w / 2), y: 1 });
  }
};

/** The first free spot in a station, or failing that anywhere on the floor, or anywhere at all. */
function freeSpot(l: Layout, b: PlaceBoard, station: Station, rng: Rng, who: Id): { at: Pos; station: Station } | null {
  const tryZone = (z: Station): Pos | null => {
    const free = l.zones[z].filter((p) => walkableAt(l, p) && !occupied(b, p, who));
    return free.length ? free[rng.int(0, free.length - 1)]! : null;
  };
  for (const z of [station, 'floor', 'wall'] as Station[]) {
    const p = tryZone(z);
    if (p) return { at: p, station: z };
  }
  for (let y = 0; y < l.grid.h; y++) for (let x = 0; x < l.grid.w; x++) if (walkableAt(l, { x, y }) && !occupied(b, { x, y }, who)) return { at: { x, y }, station: 'floor' };
  return null;
}

function assign(l: Layout, b: PlaceBoard, n: Npc, rng: Rng): void {
  const s = freeSpot(l, b, stationOf(n, rng), rng, n.id);
  if (!s) return;
  b.pos[n.id] = s.at;
  b.facing[n.id] = facingFor(l, s.station, s.at);
}

/** Keep the board true to who is here: newcomers get a station, people who've gone lose theirs, and every so often a few drift. */
export function syncPlace(w: World, p: Placed): void {
  const { board, layout } = p;
  const here = presentAt(w, board.loc);
  const ids = new Set(here.map((n) => n.id));
  for (const id of Object.keys(board.pos)) if (!ids.has(id)) {
    delete board.pos[id];
    delete board.facing[id];
  }
  const rng = new Rng(`board:${board.loc}:${w.beat}`);
  // After a long while away everyone has moved on.
  const stale = w.beat - board.placedAt > 24;
  if (stale) for (const id of Object.keys(board.pos)) delete board.pos[id];
  for (const n of here) if (!board.pos[n.id]) assign(layout, board, n, rng);
  if (stale || board.placedAt < 0) board.placedAt = w.beat;
  // And a few of the patrons wander to somewhere else, now and then.
  if (w.beat % 6 === 0) {
    for (const n of here) {
      if (n.hostile || fixedStation(n)) continue;
      if (rng.chance(0.25)) {
        delete board.pos[n.id];
        assign(layout, board, n, rng);
      }
    }
  }
}

/** Once a beat, for the place she is in. */
export function tickPlace(w: World): void {
  const p = placeOf(w);
  if (p) syncPlace(w, p);
}

/** She has come in by `from`'s door: she is in the doorway, and everyone is where they were. */
export function enterPlace(w: World, from: Id, to: Id): void {
  const p = placeOf(w, w.locations[to]);
  if (!p) return;
  syncPlace(w, p);
  const door = p.layout.doors.find((d) => d.exit === from) ?? p.layout.doors.find((d) => d.front) ?? p.layout.doors[0];
  if (door) {
    p.board.hero = { ...door.at };
    p.board.at = `door:${door.exit}`;
  }
}

// ------------------------------------------------------------------ where she is

export type Spot =
  | { kind: 'fixture'; fixture: string }
  | { kind: 'near'; npc: Npc; behind?: boolean }
  | { kind: 'door'; exit?: Id }
  | { kind: 'floor' };

const nearest = (from: Pos, ps: Pos[]): Pos | null => ps.slice().sort((a, b) => dist(a, from) - dist(b, from))[0] ?? null;

/** What a coarse position means for the log: a variant and a way of saying it. */
export function describeSpot(p: Placed, w: World): { variant: string; label: string } {
  const at = p.board.at;
  const [kind, id] = at.split(':') as [string, string | undefined];
  if (kind === 'door') {
    const door = p.layout.doors.find((d) => d.exit === id);
    return { variant: door?.front ? 'door' : 'back_door', label: door?.label ?? 'the door' };
  }
  if (kind === 'fixture') {
    const f = p.layout.fixtures.find((x: Fixture) => x.id === id);
    const v = f?.kind === 'bar' ? 'bar' : f?.kind === 'dj_booth' ? 'deck' : f?.kind === 'booth' ? 'booth' : f?.kind === 'dancefloor' ? 'floor' : 'cover';
    return { variant: v, label: f?.label ?? 'somewhere' };
  }
  if (kind === 'near') return { variant: 'near', label: w.npcs[id ?? '']?.name ?? 'somebody' };
  return { variant: 'floor', label: 'the middle of the room' };
}

/** Get her to where she needs to be, wherever she is in the room. Returns how far that was. */
export function goTo(c: Ctx, p: Placed, spot: Spot, o: { tell?: boolean } = {}): number {
  const { w, rng } = c;
  const { board, layout } = p;
  syncPlace(w, p);
  const from = board.hero;
  let target: Pos | null = null;
  let at = 'floor';
  if (spot.kind === 'fixture') {
    const f = layout.fixtures.find((x) => x.id === spot.fixture || x.kind === spot.fixture);
    if (!f) return 0;
    target = nearest(from, f.use.filter((q) => walkableAt(layout, q) && !occupied(board, q)));
    at = `fixture:${f.id}`;
  } else if (spot.kind === 'near') {
    const them = board.pos[spot.npc.id];
    if (!them) return 0;
    const facing = board.facing[spot.npc.id] ?? 0;
    const ring: Pos[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = { x: them.x + dx, y: them.y + dy };
      if ((dx || dy) && walkableAt(layout, q) && !occupied(board, q)) ring.push(q);
    }
    const behind = ring.filter((q) => angDiff(facing, dirOf(them, q)) >= 3);
    target = nearest(from, spot.behind && behind.length ? behind : ring);
    at = `near:${spot.npc.id}`;
  } else if (spot.kind === 'door') {
    const d: Door | undefined = layout.doors.find((x) => x.exit === spot.exit) ?? layout.doors.find((x) => x.front);
    target = d ? { ...d.at } : null;
    at = d ? `door:${d.exit}` : 'floor';
  } else {
    target = nearest(from, layout.zones.floor.filter((q) => walkableAt(layout, q) && !occupied(board, q)));
  }
  if (!target) return 0;
  const moved = dist(from, target);
  board.hero = target;
  board.at = at;
  // Now and then the move is worth a line.
  if (o.tell !== false && moved >= 3 && rng.chance(0.35)) {
    const d = describeSpot(p, w);
    c.emit('place_spot', 'mixed', { variant: 'walk', spot: d.variant, label: d.label, place: w.locations[board.loc]?.name ?? '' });
  }
  return moved;
}

const NEAR = new Set(['chat', 'flirt', 'kiss', 'pickpocket', 'threaten', 'armwrestle', 'analyze', 'ask_work']);

/** Before she does something that needs her somewhere: put her there. (A fight, which she starts from where she stands, is left alone.) */
export function positionFor(c: Ctx, key: string): void {
  const p = placeOf(c.w);
  if (!p) return;
  const [family, id] = key.split(':') as [string, string | undefined];
  if (NEAR.has(family) && id) {
    const n = c.w.npcs[id];
    if (n) goTo(c, p, { kind: 'near', npc: n, behind: family === 'pickpocket' });
  } else if (family === 'dj_booth') goTo(c, p, { kind: 'fixture', fixture: 'dj_booth' });
  else if (family === 'dancefloor') goTo(c, p, { kind: 'fixture', fixture: 'dancefloor' });
  else if (family === 'settle_tab') goTo(c, p, { kind: 'fixture', fixture: 'bar' });
}

// ------------------------------------------------------------------ seeing and being seen

/** The board as the sneaking code sees it: this room, with these people in it, facing these ways. */
export function viewOf(w: World, p: Placed, near: number, except: Id[] = []): Board {
  const { board, layout } = p;
  const units = Object.entries(board.pos)
    .filter(([id, q]) => !except.includes(id) && w.npcs[id] && dist(q, board.hero) <= near)
    .map(([id, q]) => makeUnit(w.npcs[id]!, q, board.facing[id] ?? 0));
  return { w, grid: layout.grid, light: layout.light, units, hero: board.hero, posture: 'sneak', props: [], bodies: [], round: 0, dark: [], role: 'club' };
}

/**
 * Something she does is noticed by whoever can actually see it: people facing her, near enough, in good enough light, with
 * nothing in the way. Without a board it's everyone in the room a little.
 */
export function spatialStir(c: Ctx, amount: number, skip: Npc[] = []): void {
  const p = placeOf(c.w);
  if (!p) {
    stir(c, amount, skip);
    return;
  }
  syncPlace(c.w, p);
  const b = viewOf(c.w, p, 9, skip.map((n) => n.id));
  for (const u of b.units) {
    const g = sightGain(b, u, b.hero, 'sneak');
    if (g <= 0) continue;
    const a = awareness(c.w, u.npc);
    a.v = Math.min(1, a.v + g * amount * 5);
    if (a.v >= V.aware) {
      a.fix = true;
      a.seenAt = c.w.hero.locationId;
    }
  }
}

/** Where everyone ended up after a fight. */
export function keepPositions(p: Placed, hero: Pos, others: Record<Id, Pos>): void {
  p.board.hero = { ...hero };
  for (const [id, q] of Object.entries(others)) p.board.pos[id] = { ...q };
}

