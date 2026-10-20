import { Rng, hashString } from './rng';
import type { Ctx, Ent, Id, Location, Npc, PlaceBoard, World } from './types';
import { dist, hasLos, idx, passable, pathTo, reach, type Pos } from './grid';
import { everyoneAt } from './population';
import { layoutOf, type CamMount, type Door, type Fixture, type Layout, type Zones } from './layout';
import { PROPS, type PropKind } from './content/props';
import { dirOf, angDiff, camFacing, camView, coneFactor, holdsPost, makeUnit, sensors, sightGain, type Board, type PUnit } from './prowl';
import { V, awareness, npcPerception, stir } from './stealth';
import { workingCameras } from './witness';
import { isShut } from './shutdown';

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
const presentAt = (w: World, locId: Id): Npc[] => everyoneAt(w, locId).filter((n) => n.alive && n.downUntil <= w.clock && !w.hero.companions.some((a) => a.npcId === n.id));

type Station = keyof Zones;

// ------------------------------------------------------------------ rounds, and who is where when


const paths = new Map<string, Pos[]>();

/** The tiles from one end of a beat to the other, the same every time. */
function pathBetween(key: string, l: Layout, a: Pos, b: Pos): Pos[] {
  const k = `${key}:${a.x},${a.y}>${b.x},${b.y}:${l.grid.w}x${l.grid.h}`;
  let out = paths.get(k);
  if (!out) {
    const steps = pathTo(l.grid, reach(l.grid, a, 80, () => false), b);
    out = [{ ...a }, ...steps];
    paths.set(k, out);
  }
  return out;
}

/**
 * Where someone walking a beat is at tick `t`, which is only a function of the tick: a pause at the near end, the walk to the far end,
 * a pause there, the walk back. `rest` is how long the pause has still to run; `dir` is the way they are walking (or last walked).
 */
export function routeAt(path: Pos[], pauseA: number, pauseB: number, t: number): { at: Pos; dir: number; leg: 0 | 1; rest: number } {
  const L = path.length - 1;
  if (L < 1) return { at: path[0]!, dir: 0, leg: 0, rest: 0 };
  const total = pauseA + L + pauseB + L;
  const k = ((t % total) + total) % total;
  if (k < pauseA) return { at: path[0]!, dir: dirOf(path[1]!, path[0]!), leg: 1, rest: pauseA - k };
  if (k < pauseA + L) {
    const j = k - pauseA + 1;
    return { at: path[j]!, dir: dirOf(path[j - 1]!, path[j]!), leg: 0, rest: 0 };
  }
  if (k < pauseA + L + pauseB) return { at: path[L]!, dir: dirOf(path[L - 1]!, path[L]!), leg: 0, rest: pauseA + L + pauseB - k };
  const j = L - (k - (pauseA + L + pauseB)) - 1;
  return { at: path[j]!, dir: dirOf(path[j + 1]!, path[j]!), leg: 1, rest: 0 };
}

/** The pauses and the starting tick of a given person's round: their own, so a room is not marching in step. */
const roundOf = (id: Id): { pauseA: number; pauseB: number; offset: number } => {
  const h = hashString(`round:${id}`);
  return { pauseA: 1 + (h % 3), pauseB: 1 + ((h >> 3) % 3), offset: (h >> 6) % 64 };
};

/** Everyone on a beat is where their round puts them at this beat. (The clock says; nothing is stepped through.) */
function walkRounds(w: World, p: Placed): void {
  const { board, layout } = p;
  for (const [id, e] of Object.entries(board.ents)) {
    if (e.behavior !== 'patrol' || !e.route || e.route.length < 2 || w.npcs[id]?.hostile) continue;
    const { pauseA, pauseB, offset } = roundOf(id);
    const path = pathBetween(`${w.worldSeed}:${board.loc}`, layout, e.route[0]!, e.route[1]!);
    const r = routeAt(path, pauseA, pauseB, tickOf(w) + offset);
    const blocked = occupied(board, r.at, id);
    if (!blocked) {
      e.x = r.at.x;
      e.y = r.at.y;
    }
    // Waiting at an end, they look about; walking, they look where they are going.
    e.facing = r.rest ? (r.dir + LOOK[(r.rest * 3 + hashString(id)) % 8]!) % 8 : r.dir;
    e.leg = r.leg;
    e.pause = r.rest;
  }
}

/** How many beats it takes someone to go the whole way round their beat and come back to where they started (null if they don't walk one). */
export function patrolPeriod(w: World, p: Placed, id: Id): number | null {
  const e = p.board.ents[id];
  if (!e?.route || e.route.length < 2) return null;
  const { pauseA, pauseB } = roundOf(id);
  const path = pathBetween(`${w.worldSeed}:${p.board.loc}`, p.layout, e.route[0]!, e.route[1]!);
  return pauseA + pauseB + 2 * (path.length - 1);
}

/** Which stretch of the evening a person is in, for those who move about: every so often, a little different for each. */
const slotOf = (id: Id, beat: number): number => {
  const h = hashString(`slot:${id}`);
  const stay = 20 + (h % 25);
  return Math.floor((beat + ((h >> 4) % stay)) / stay);
};

/** World minutes after a scene left someone in the middle of something before they give up and go back to their rounds. */
const RESUME = 10;

const COUNTER = /bartender|barkeep|shopkeeper|broker|clerk|desk|barista|cook|owner|reception/i;
const POSTED = /\bdoc\b|physio|surgeon|scientist|pit_boss|\bdj\b/i;
const GUARD = /security|bouncer|guard|\bcop\b|turret|\bdog\b|bark|atlas_rep|helix|sentry/i;
const FIGHTER = /sparr|fighter|trainer|coach/i;
const describe = (n: Npc): string => `${n.archetype} ${n.role}`;

/** Those who stay where they work: they have a post, and do not wander off to a booth. */
const fixedStation = (n: Npc, loc?: Id): boolean => {
  if (n.ephemeral || /dancer/i.test(n.role)) return false;
  const t = describe(n);
  return COUNTER.test(t) || POSTED.test(t) || GUARD.test(t) || FIGHTER.test(t) || n.tags.includes('security') || n.tags.includes('cop') || (!!loc && n.home === loc);
};

/** Where someone of this sort is when nothing is happening, in a place with stations. */
function stationOf(n: Npc, rng: Rng): Station {
  const t = describe(n);
  if (COUNTER.test(t)) return 'behindBar';
  if (POSTED.test(t)) return 'deck';
  if (GUARD.test(t) || n.tags.includes('security') || n.tags.includes('cop')) return 'front';
  if (FIGHTER.test(t)) return 'stage';
  if (/dancer/i.test(n.role)) return 'floor';
  const r = rng.next();
  return r < 0.5 ? 'floor' : r < 0.75 ? 'stools' : 'seats';
}

const facingFor = (l: Layout, station: Station, at: Pos): number => {
  const set = l.faces?.[station];
  if (set !== undefined) return set;
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
  if (!s) return;
  const e = entAt(s.at, facingFor(l, s.station, s.at));
  b.ents[n.id] = e;
  // The bartender works up and down the bar and security walk the floor; the DJ stays on the decks.
  if (s.station === 'behindBar' && l.zones.behindBar.length >= 3) {
    const ends = [l.zones.behindBar[0]!, l.zones.behindBar[l.zones.behindBar.length - 1]!];
    e.route = ends.map((q) => ({ ...q }));
    e.behavior = 'patrol';
  } else if (s.station === 'front') {
    const far = l.zones.floor.filter((q) => dist(q, s.at) >= 4);
    if (far.length) {
      e.route = [{ ...s.at }, { ...far[rng.int(0, far.length - 1)]! }];
      e.behavior = 'patrol';
    }
  }
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
    if (!pool.length) {
      // Nothing at that distance (walls, or the outside of an odd-shaped room, are in the way): as near as there is.
      const rest = floor.filter((p) => dist(p, b.hero) >= 2);
      const nearest = Math.min(...rest.map((p) => dist(p, b.hero)));
      pool = rest.filter((p) => dist(p, b.hero) <= nearest + 1);
    }
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
  if (!holdsPost(n) && !n.id.startsWith('tmp_') && !n.hostile && (sensors(n) || n.tags.includes('security') || rng.chance(0.35))) {
    const far = floor.filter((p) => dist(p, at) >= 3 && !occupied(b, p, n.id));
    if (far.length) {
      e.route = [{ ...at }, { ...far[rng.int(0, far.length - 1)]! }];
      e.behavior = 'patrol';
    }
  }
  b.ents[n.id] = e;
}

function assign(l: Layout, b: PlaceBoard, n: Npc, rng: Rng): void {
  if (l.stations) stationAssign(l, b, n, rng);
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
    return !!n && n.locationId === board.loc && (!n.alive || n.downUntil > w.clock);
  });
  const rng = new Rng(`board:${board.loc}:${tickOf(w)}`);
  // After a long while away, those who were on a post are back on it.
  const away = tickOf(w) - board.placedAt;
  if (away > 60 && !layout.stations) for (const e of Object.values(board.ents)) standDown(e);
  board.placedAt = tickOf(w);
  for (const n of here) if (!board.ents[n.id]) assign(layout, board, n, rng);

  // Where people have stations (a club, a shop, a gym), the customers move on to somewhere else when their stretch is up.
  if (layout.stations) {
    for (const n of here) {
      const e = board.ents[n.id];
      if (!e || n.hostile || fixedStation(n, board.loc)) continue;
      const slot = slotOf(n.id, tickOf(w));
      if (e.slot === undefined) e.slot = slot;
      else if (e.slot !== slot) {
        delete board.ents[n.id];
        assign(layout, board, n, new Rng(`slot:${board.loc}:${n.id}:${slot}`));
        const moved = board.ents[n.id];
        if (moved) moved.slot = slot;
      }
    }
  }

  // Somebody a scene left in the middle of something gives it up after a while and goes back to their rounds.
  for (const e of Object.values(board.ents)) {
    if (e.behavior === 'investigate' || e.behavior === 'search' || e.behavior === 'return') {
      if (e.sceneAt === undefined) e.sceneAt = tickOf(w);
      else if (tickOf(w) - e.sceneAt >= RESUME) {
        e.sceneAt = undefined;
        standDown(e);
      }
    } else e.sceneAt = undefined;
  }

  walkRounds(w, p);
}

/** The tick everything on a board runs on: one per world minute, so an hour-long odd job moves the room along far more than a glance does. */
export const tickOf = (w: Pick<World, 'clock'>): number => Math.floor(w.clock);

/** Once a beat, for the place she is in. */
export function tickPlace(w: World): void {
  const p = placeOf(w);
  if (!p) return;
  syncPlace(w, p);
  // Those standing a post look about, so where they are looking changes from beat to beat.
  for (const [id, e] of Object.entries(p.board.ents)) {
    if (e.behavior && e.behavior !== 'post') continue;
    if (w.npcs[id]?.hostile) continue;
    e.facing = ((e.homeFacing ?? e.facing) + LOOK[(tickOf(w) + hashString(id)) % 8]!) % 8;
  }
}

/** A quarter turn one way, then the other, then back. */
const LOOK = [0, 1, 1, 0, 0, 7, 7, 0];

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

// ------------------------------------------------------------------ who can see her

/**
 * Whether this person can see her, from where each of them stands and facing the way they face on the room's board: nothing solid or
 * big in the way, and she is inside their cone. With `turn`, they have turned to look (something loud happened), so only the line
 * matters. With `ranged`, she is also near enough to make out, which depends on how sharp they are and how well lit she is. With no
 * board to say, or nobody placed, it is anyone in the room.
 */
export function seesHer(w: World, n: Npc, o: { ranged?: boolean; turn?: boolean } = {}): boolean {
  const h = w.hero;
  if (n.locationId !== h.locationId) return false;
  const board = w.boards?.[h.locationId];
  const layout = board ? layoutOf(w, w.locations[h.locationId]!) : undefined;
  const e = board?.ents[n.id];
  if (!board || !layout || !e) return true;
  if (e.x === board.hero.x && e.y === board.hero.y) return true;
  if (!hasLos(layout.grid, e, board.hero)) return false;
  if (!o.turn && coneFactor({ x: e.x, y: e.y, facing: e.facing, wide: sensors(n) }, board.hero) <= 0) return false;
  if (!o.ranged) return true;
  const lit = w.flags.blackout ? 0 : layout.light[idx(layout.grid, board.hero)] ?? 1;
  const range = Math.max(1, Math.min(9, 2 + 0.4 * npcPerception(n) + (sensors(n) ? 1 : 0) + (lit === 2 ? 2 : lit === 0 ? -1.5 : 0)));
  return dist(e, board.hero) <= range;
}

/** The cameras here that are working: not the ones a Blackout took, and none at all in a power cut. */
export function workingCams(w: World, loc: Location): CamMount[] {
  if (w.flags.blackout) return [];
  const layout = layoutOf(w, loc);
  if (!layout) return [];
  const down = loc.camsDown && w.beat < loc.camsDown.until ? loc.camsDown.n : 0;
  const hacked = loc.camHacked && w.beat < loc.camHacked.until ? loc.camHacked.ids : [];
  return layout.cams.slice(down).filter((cam) => !hacked.includes(cam.id));
}

/** The working cameras that have her right now, from where they are and the way each is turned. */
export function camsOnHer(w: World): CamMount[] {
  const loc = w.locations[w.hero.locationId];
  const board = loc ? w.boards?.[loc.id] : undefined;
  const layout = board && loc ? layoutOf(w, loc) : undefined;
  if (!loc || !board || !layout) return [];
  const lit = w.flags.blackout ? 0 : (layout.light[idx(layout.grid, board.hero)] ?? 1);
  return workingCams(w, loc).filter((cam) => camView(layout.grid, { x: cam.x, y: cam.y, facing: camFacing(cam, tickOf(w)) }, board.hero, lit as 0 | 1 | 2) > 0);
}

/** Whether a camera has her right now, from where it is and the way it is turned. Where there is no board to say, any working camera does. */
export function camerasSeeHer(w: World): boolean {
  const loc = w.locations[w.hero.locationId];
  if (!loc || !workingCameras(w, loc.id)) return false;
  const board = w.boards?.[loc.id];
  const layout = board ? layoutOf(w, loc) : undefined;
  if (!board || !layout) return true;
  const lit = w.flags.blackout ? 0 : (layout.light[idx(layout.grid, board.hero)] ?? 1);
  return workingCams(w, loc).some((cam) => camView(layout.grid, { x: cam.x, y: cam.y, facing: camFacing(cam, tickOf(w)) }, board.hero, lit as 0 | 1 | 2) > 0);
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
    const v = f?.kind === 'bar' ? 'bar' : f?.kind === 'counter' ? 'counter' : f?.kind === 'dj_booth' ? 'deck' : f?.kind === 'booth' ? 'booth' : f?.kind === 'dancefloor' ? 'floor' : 'cover';
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

const COUNTER_ACTS = new Set(['buy_ware', 'buy_stim', 'buy_med', 'buy_info', 'buy_gear', 'buy_loudspeaker', 'buy_ammo', 'pawn', 'pawndeal', 'fence']);
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
  else if (family === 'settle_tab' || family === 'order_drink') goTo(c, p, { kind: 'fixture', fixture: 'bar' });
  else if (COUNTER_ACTS.has(family)) goTo(c, p, { kind: 'fixture', fixture: 'counter' });
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
export function viewOf(w: World, p: Placed, o: { foes?: Npc[]; near?: number; except?: Id[]; goal?: 'clear' | 'leave' | 'hide' } = {}): Board {
  const { board, layout } = p;
  const who: Npc[] = o.foes ?? Object.keys(board.ents).filter((id) => w.npcs[id] && !(o.except ?? []).includes(id) && dist(board.ents[id]!, board.hero) <= (o.near ?? 99)).map((id) => w.npcs[id]!);
  const units = who.filter((n) => board.ents[n.id]).map((n) => unitOf(n, board.ents[n.id]!));
  // Everyone else on the board who is only a person: they watch, and they react.
  const others = Object.keys(board.ents)
    .filter((id) => w.npcs[id] && !who.includes(w.npcs[id]!) && !(o.except ?? []).includes(id))
    .map((id) => w.npcs[id]!)
    .filter((n) => n.alive && !n.hostile && n.downUntil <= w.clock && !n.tags.some((t) => ['robot', 'dragon', 'boss'].includes(t)) && n.archetype !== 'puppy' && !w.hero.companions.some((a) => a.npcId === n.id))
    .map((n) => unitOf(n, board.ents[n.id]!));
  return {
    w,
    grid: layout.grid,
    light: layout.light,
    units,
    others,
    hero: { ...board.hero },
    posture: 'sneak',
    props: board.props as Board['props'],
    bodies: board.bodies,
    round: 0,
    dark: board.dark,
    role: layout.role,
    cams: workingCams(w, w.locations[board.loc]!),
    ...(o.goal ? { goal: o.goal } : {}),
    ...(o.goal === 'leave' ? { ways: layout.doors.filter((d) => !d.via && w.locations[d.exit] && !isShut(w, d.exit)).map((d) => ({ at: { ...d.at }, to: d.exit })) } : {}),
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
    if (!n.alive || n.downUntil > w.clock) p.board.bodies.push({ npcId: id, x: q.x, y: q.y, found: true });
  }
}

export type { PropKind };
