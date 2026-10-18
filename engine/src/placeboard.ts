import { Rng } from './rng';
import type { Ctx, Ent, Id, Location, Npc, PlaceBoard, World } from './types';
import { dist, passable, type Pos } from './grid';
import { everyoneAt } from './population';
import { layoutOf, type Door, type Fixture, type Layout, type Zones } from './layout';
import { PROPS, type PropKind } from './content/props';
import { dirOf, angDiff, holdsPost, makeUnit, sensors, sightGain, type Board, type PUnit } from './prowl';
import { V, awareness, stir } from './stealth';

/**
 * The one board a place has. Whatever she is doing in a place (walking about, sneaking, fighting) it is this: where she is,
 * where each person is and which way they face, what they were last doing about her, who is on the floor, what has been used.
 * The layout (layout.ts) is the same every time and is never stored; this is what moves on it, kept for the run.
 *
 * Between scenes it is deliberately coarse. In a club people are put at stations by what they are (the bartender behind the bar, the DJ
 * on the decks, security by the door, the rest on the floor, at the bar or in the booths) and every so often a few drift to another;
 * anywhere else they stand scattered away from the doors, a guard on a post or walking a short beat. Nobody walks about unless a fight
 * or a sneak is on, and none of this is in the log. The sneaking board (prowl.ts) and the fight (tactics.ts) both start from it and
 * leave it as they find it, so a body dropped in the dark is still there when the shooting starts.
 */

export interface Placed {
  board: PlaceBoard;
  layout: Layout;
}

/** The board for the place she is in (or the one given), made the first time it's wanted. Null for a place with none (the streets). */
export function placeOf(w: World, loc: Location | undefined = w.locations[w.hero.locationId]): Placed | null {
  if (!loc) return null;
  const layout = layoutOf(w, loc);
  if (!layout) return null;
  const boards = (w.boards ??= {});
  let board = boards[loc.id];
  if (!board || !board.ents) {
    const front = layout.doors.find((d) => d.front) ?? layout.doors[0];
    board = boards[loc.id] = {
      loc: loc.id,
      hero: { ...(front?.at ?? layout.grid.exits[0] ?? { x: 0, y: 0 }) },
      at: front ? `door:${front.exit}` : 'floor',
      ents: {},
      bodies: [],
      props: layout.props.map((p) => ({ kind: p.kind, x: p.x, y: p.y, charges: PROPS[p.kind].charges })),
      dark: [],
      placedAt: -999,
    };
  }
  return { board, layout };
}

const occupied = (b: PlaceBoard, p: Pos, except?: Id): boolean => (b.hero.x === p.x && b.hero.y === p.y) || Object.entries(b.ents).some(([id, e]) => id !== except && e.x === p.x && e.y === p.y);
const walkableAt = (l: Layout, p: Pos): boolean => passable(l.grid, p.x, p.y);

/** Everyone here who could be on the board: not her own company, and not on the floor. (A dungeon's garrison is there before it has noticed her.) */
const presentAt = (w: World, locId: Id): Npc[] => everyoneAt(w, locId).filter((n) => n.alive && n.downUntil <= w.beat && !w.hero.companions.some((a) => a.npcId === n.id));

type Station = keyof Zones;

/** Those who stay where they work. */
const fixedStation = (n: Npc): boolean => n.archetype === 'bartender' || n.archetype === 'dj' || n.archetype === 'bouncer' || n.role === 'DJ' || /bartender|barkeep/i.test(n.role) || n.tags.includes('security') || n.tags.includes('cop');

/** Where someone of this sort is when nothing is happening, in a club. */
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

const entAt = (at: Pos, facing: number): Ent => ({ x: at.x, y: at.y, facing, home: { ...at }, homeFacing: facing, leg: 0, pause: 0, behavior: 'post', last: null, looked: 0, searched: [], calm: 99, sweep: 1 });

/** In a club: to a station by job. */
function stationAssign(l: Layout, b: PlaceBoard, n: Npc, rng: Rng): void {
  const s = freeSpot(l, b, stationOf(n, rng), rng, n.id);
  if (s) b.ents[n.id] = entAt(s.at, facingFor(l, s.station, s.at));
}

/** Anywhere else: scattered away from the doors, a guard on a post or walking a short beat. Those who turn up in the middle of it (a mugging) start a few tiles from her. */
function scatterAssign(l: Layout, b: PlaceBoard, n: Npc): void {
  const rng = new Rng(`ent:${b.loc}:${n.id}`);
  const floor = l.zones.floor.filter((p) => !occupied(b, p, n.id));
  if (!floor.length) return stationAssign(l, b, n, rng);
  const apart = (p: Pos) => l.grid.exits.every((e) => dist(e, p) >= 3);
  const spaced = (p: Pos) => Object.entries(b.ents).every(([id, e]) => id === n.id || dist(e, p) >= 2);
  let pool: Pos[];
  if (n.id.startsWith('tmp_') || n.hostile) {
    pool = floor.filter((p) => dist(p, b.hero) >= 3 && dist(p, b.hero) <= 4);
    if (!pool.length) pool = floor.filter((p) => dist(p, b.hero) >= 2);
  } else {
    pool = floor.filter((p) => apart(p) && spaced(p));
    if (!pool.length) pool = floor.filter(apart);
  }
  if (!pool.length) pool = floor;
  const at = pool[rng.int(0, pool.length - 1)]!;
  const toward = l.grid.exits[0] ? dirOf(at, l.grid.exits[0]) : 0;
  const facing = rng.chance(0.5) ? toward : rng.int(0, 7);
  const e = entAt(at, facing);
  // Some of them walk a beat.
  if (!holdsPost(n) && (sensors(n) || n.tags.includes('security') || rng.chance(0.35))) {
    const far = floor.filter((p) => dist(p, at) >= 3 && !occupied(b, p, n.id));
    if (far.length) {
      e.route = [{ ...at }, { ...far[rng.int(0, far.length - 1)]! }];
      e.behavior = 'patrol';
    }
  }
  b.ents[n.id] = e;
}

function assign(l: Layout, b: PlaceBoard, n: Npc, rng: Rng): void {
  if (l.role === 'club') stationAssign(l, b, n, rng);
  else scatterAssign(l, b, n);
}

/** Put them back where they started and what they were doing. */
function standDown(e: Ent): void {
  const home = e.home ?? { x: e.x, y: e.y };
  e.x = home.x;
  e.y = home.y;
  e.facing = e.homeFacing ?? e.facing;
  e.behavior = e.route ? 'patrol' : 'post';
  e.last = null;
  e.looked = 0;
  e.searched = [];
  e.calm = 99;
  e.leg = 0;
  e.pause = 0;
}

/**
 * Keep the board true to who is here: newcomers get a place, people who've gone lose theirs, the fallen stay where they fell until they
 * get up or are taken away, and (in a club) every so often a few drift.
 */
export function syncPlace(w: World, p: Placed): void {
  const { board, layout } = p;
  const here = presentAt(w, board.loc);
  const ids = new Set(here.map((n) => n.id));
  for (const id of Object.keys(board.ents)) if (!ids.has(id)) delete board.ents[id];
  board.bodies = board.bodies.filter((x) => {
    const n = w.npcs[x.npcId];
    return !!n && n.locationId === board.loc && (!n.alive || n.downUntil > w.beat);
  });
  const rng = new Rng(`board:${board.loc}:${w.beat}`);
  // After a long while away everyone has moved on, or gone back to their post.
  const away = w.beat - board.placedAt;
  if (away > 24) {
    if (layout.role === 'club') for (const id of Object.keys(board.ents)) delete board.ents[id];
    else for (const e of Object.values(board.ents)) standDown(e);
  }
  board.placedAt = w.beat;
  for (const n of here) if (!board.ents[n.id]) assign(layout, board, n, rng);
  // And a few of a club's patrons wander to somewhere else, now and then.
  if (layout.role === 'club' && w.beat % 6 === 0) {
    for (const n of here) {
      if (n.hostile || fixedStation(n)) continue;
      if (rng.chance(0.25)) {
        delete board.ents[n.id];
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
    const them = board.ents[spot.npc.id];
    if (!them) return 0;
    const ring: Pos[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = { x: them.x + dx, y: them.y + dy };
      if ((dx || dy) && walkableAt(layout, q) && !occupied(board, q)) ring.push(q);
    }
    const behind = ring.filter((q) => angDiff(them.facing, dirOf(them, q)) >= 3);
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

// ------------------------------------------------------------------ the sneaking board is this one

/** A person's entry on the board as the sneaking code wants them. */
export function unitOf(npc: Npc, e: Ent): PUnit {
  const u = makeUnit(npc, { x: e.x, y: e.y }, e.facing, e.route ? { route: e.route.map((r) => ({ ...r })) } : {});
  if (e.home) u.home = { ...e.home };
  if (e.homeFacing !== undefined) u.homeFacing = e.homeFacing;
  u.leg = e.leg ?? 0;
  u.pause = e.pause ?? 0;
  if (e.behavior) u.behavior = e.behavior as PUnit['behavior'];
  u.last = e.last ? { ...e.last } : null;
  u.looked = e.looked ?? 0;
  u.searched = new Set(e.searched ?? []);
  u.calm = e.calm ?? 99;
  u.sweep = e.sweep ?? 1;
  return u;
}

/** And back. */
export function storeUnit(u: PUnit, e: Ent): void {
  e.x = u.x;
  e.y = u.y;
  e.facing = u.facing;
  e.home = { ...u.home };
  e.homeFacing = u.homeFacing;
  if (u.route) e.route = u.route.map((r) => ({ ...r }));
  e.leg = u.leg;
  e.pause = u.pause;
  e.behavior = u.behavior;
  e.last = u.last ? { ...u.last } : null;
  e.looked = u.looked;
  e.searched = [...u.searched];
  e.calm = u.calm;
  e.sweep = u.sweep;
}

/**
 * The board as the sneaking code plays it: this room as it stands, with these people (or everyone near enough) in it. The bodies, the
 * machines and the darkened patches are the board's own, so whatever happens to them stays happened.
 */
export function viewOf(w: World, p: Placed, o: { foes?: Npc[]; near?: number; except?: Id[] } = {}): Board {
  const { board, layout } = p;
  const who: Npc[] = o.foes ?? Object.keys(board.ents).filter((id) => w.npcs[id] && !(o.except ?? []).includes(id) && dist(board.ents[id]!, board.hero) <= (o.near ?? 99)).map((id) => w.npcs[id]!);
  const units = who.filter((n) => board.ents[n.id]).map((n) => unitOf(n, board.ents[n.id]!));
  return {
    w,
    grid: layout.grid,
    light: layout.light,
    units,
    hero: { ...board.hero },
    posture: 'sneak',
    props: board.props as Board['props'],
    bodies: board.bodies,
    round: 0,
    dark: board.dark,
    role: layout.role,
  };
}

/** Keep what a scene did: where she ended up and where everyone is and what they were doing. */
export function commitBoard(b: Board, p: Placed): void {
  p.board.hero = { ...b.hero };
  p.board.at = 'floor';
  for (const u of b.units) {
    const e = p.board.ents[u.npc.id];
    if (!e) continue;
    // Whoever she put down is on the floor now, not on their feet.
    if (u.down) delete p.board.ents[u.npc.id];
    else storeUnit(u, e);
  }
}

/**
 * Something she does is noticed by whoever can actually see it: people facing her, near enough, in good enough light, with
 * nothing in the way. In a place with no board it's everyone in the room a little.
 */
export function spatialStir(c: Ctx, amount: number, skip: Npc[] = []): void {
  const p = placeOf(c.w);
  if (!p) {
    stir(c, amount, skip);
    return;
  }
  syncPlace(c.w, p);
  const b = viewOf(c.w, p, { near: 9, except: skip.map((n) => n.id) });
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

// ------------------------------------------------------------------ the fight is this one too

/** Where everyone ended up after a fight. */
export function keepPositions(p: Placed, hero: Pos, others: Record<Id, Pos>): void {
  p.board.hero = { ...hero };
  p.board.at = 'floor';
  for (const [id, q] of Object.entries(others)) {
    const e = p.board.ents[id];
    if (e) {
      e.x = q.x;
      e.y = q.y;
    } else p.board.ents[id] = entAt(q, 0);
  }
}

/** Those the fight left on the floor stay where they fell, and everyone in the room knows about it. */
export function layBodies(p: Placed, w: World, fallen: Iterable<Id>, at: Record<Id, Pos>): void {
  for (const id of fallen) {
    const q = at[id];
    const n = w.npcs[id];
    if (!q || !n || p.board.bodies.some((x) => x.npcId === id)) continue;
    if (!n.alive || n.downUntil > w.beat) p.board.bodies.push({ npcId: id, x: q.x, y: q.y, found: true });
  }
}

export type { PropKind };
