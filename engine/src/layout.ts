import { Rng } from './rng';
import type { Id, Location, World } from './types';
import { dist, idx, makeGrid, neighbors, passable, walkable, type Grid, type Pos, type Terrain } from './grid';
import { PROPS, PROPS_BY_ROOM, type PropKind } from './content/props';

/**
 * What a place is like inside, as a board. The layout is worked out from the place's id and the world's seed alone, so it is
 * the same every time and is never stored: only what moves on it is (see placeboard.ts). Every indoor place has one; clubs have a
 * made one (a bar, booths, decks) and everywhere else a plain room of the right kind, which the dungeons' rooms also use.
 *
 * A layout is a grid, the named things on it (the bar, the DJ booth, the booths), where the doors are and which exit
 * each one is, and zones: the sorts of spot a person might be standing in (behind the bar, on the floor, in a booth).
 */

export type FixtureKind = 'bar' | 'dj_booth' | 'speaker' | 'booth' | 'dancefloor' | 'pillar';

export interface Fixture {
  id: string;
  kind: FixtureKind;
  /** How she might say it: "the bar", "a booth". */
  label: string;
  /** The tiles it takes up (cover, for the ones you can't walk through). */
  tiles: Pos[];
  /** Where someone stands to use it. */
  use: Pos[];
}

/** A door tile on the board, and the exit it is. */
export interface Door {
  exit: Id;
  at: Pos;
  label: string;
  /** The way in from the street, as against a back door or the way to somewhere else. */
  front: boolean;
}

export type LightLevel = 0 | 1 | 2;

export interface Zones {
  /** The dance floor. */
  floor: Pos[];
  behindBar: Pos[];
  stools: Pos[];
  /** Booth seats. */
  seats: Pos[];
  /** Down in front of the DJ. */
  stage: Pos[];
  /** Behind the DJ booth, where the DJ stands. */
  deck: Pos[];
  /** Along the walls. */
  wall: Pos[];
  /** By the front door. */
  front: Pos[];
}

/** A machine on the board that an Override can set off: where it is and what it is. */
export interface PropSpec {
  kind: PropKind;
  x: number;
  y: number;
}

export interface Layout {
  grid: Grid;
  /** What sort of room it is (a dungeon's `barracks`, a `club`...): picks the light and the machines. */
  role: string;
  props: PropSpec[];
  fixtures: Fixture[];
  doors: Door[];
  zones: Zones;
  light: LightLevel[];
  /** Which side the bar is on, for the places that have one. */
  bar: 'east' | 'west' | null;
}

/** Which places have a board: every one indoors. (Streets are laid out on the hex grid and will get strips of their own.) */
export const hasBoard = (loc: Location): boolean => !loc.outdoors && loc.kind !== 'street';

/** The clubs with a made layout. */
export const isClub = (loc: Location): boolean => loc.kind === 'club' && !loc.dungeon && (loc.gen?.role === 'club' || loc.id === 'neon_pharaoh');

const cache = new Map<string, Layout>();

type Seeded = Pick<World, 'worldSeed' | 'locations' | 'dungeons'>;

/** The layout of a place: always the same for the same place (and, in a dungeon, the same garrisoning of it). */
export function layoutOf(w: Seeded, loc: Location): Layout | null {
  if (!hasBoard(loc)) return null;
  const visible = loc.exits.filter((e) => !e.hidden);
  const occupied = loc.dungeon ? w.dungeons?.[loc.dungeon]?.occupation ?? 0 : 0;
  const key = `${w.worldSeed}:${loc.id}:${occupied}:${visible.map((e) => e.to).join(',')}`;
  let l = cache.get(key);
  if (!l) {
    l = isClub(loc) ? clubLayout(w, loc) : plainLayout(w, loc);
    cache.set(key, l);
  }
  return l;
}

export const cloneGrid = (g: Grid): Grid => ({ w: g.w, h: g.h, cells: g.cells.slice(), exits: g.exits.map((p) => ({ ...p })) });

const pt = (x: number, y: number): Pos => ({ x, y });
const same = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

function reachable(g: Grid, from: Pos): Set<number> {
  const seen = new Set<number>([idx(g, from)]);
  const open = [from];
  while (open.length) {
    const p = open.pop()!;
    for (const n of neighbors(g, p)) {
      const i = idx(g, n);
      if (!seen.has(i)) {
        seen.add(i);
        open.push(n);
      }
    }
  }
  return seen;
}

/** A club: the DJ booth at the back, the bar down one side, booths down the other, the dance floor between, the door at the front. */
function clubLayout(w: Seeded, loc: Location): Layout {
  const rng = new Rng(`layout:${w.worldSeed}:${loc.id}`);
  const W = 12 + rng.int(0, 2);
  const H = 9 + rng.int(0, 1);
  const g: Grid = { w: W, h: H, cells: Array<Terrain>(W * H).fill('floor'), exits: [] };
  const put = (p: Pos, t: Terrain) => void (g.cells[idx(g, p)] = t);
  const cx = Math.floor(W / 2);
  const east = rng.chance(0.5);
  const barX = east ? W - 3 : 2;
  const behindX = east ? W - 2 : 1;
  const stoolX = east ? W - 4 : 3;
  const tableX = east ? 1 : W - 2;
  const wallSeatX = east ? 0 : W - 1;
  const innerSeatX = east ? 2 : W - 3;
  const fixtures: Fixture[] = [];

  // The DJ booth, and a stack of speakers either side of it.
  const boothTiles = [pt(cx - 1, 1), pt(cx, 1), pt(cx + 1, 1)];
  for (const p of boothTiles) put(p, 'cover');
  const deck = [pt(cx - 1, 0), pt(cx, 0), pt(cx + 1, 0)];
  fixtures.push({ id: 'dj_booth', kind: 'dj_booth', label: 'the DJ booth', tiles: boothTiles, use: deck });
  for (const [i, x] of [cx - 4, cx + 4].entries()) {
    put(pt(x, 1), 'cover');
    fixtures.push({ id: `speaker${i}`, kind: 'speaker', label: 'a speaker stack', tiles: [pt(x, 1)], use: [] });
  }

  // The bar down one side: the counter, the stools on the floor side of it, the bartender's side behind it.
  const barRows: number[] = [];
  for (let y = 2; y <= H - 4; y++) barRows.push(y);
  const counter = barRows.map((y) => pt(barX, y));
  for (const p of counter) put(p, 'cover');
  const stools = barRows.map((y) => pt(stoolX, y));
  const behindBar = barRows.map((y) => pt(behindX, y));
  fixtures.push({ id: 'bar', kind: 'bar', label: 'the bar', tiles: counter, use: stools });

  // Booths down the other: a table with a seat each side.
  const seats: Pos[] = [];
  const nb = rng.int(2, 3);
  for (let i = 0; i < nb; i++) {
    const y = 2 + 2 * i;
    put(pt(tableX, y), 'cover');
    const mine = [pt(wallSeatX, y), pt(innerSeatX, y)];
    seats.push(...mine);
    fixtures.push({ id: `booth${i}`, kind: 'booth', label: 'a booth', tiles: [pt(tableX, y)], use: mine });
  }

  // The dance floor in the middle, with a couple of pillars.
  const floor: Pos[] = [];
  for (let y = 3; y <= H - 3; y++) for (let x = 4; x <= W - 5; x++) floor.push(pt(x, y));
  const inner = floor.filter((p) => p.x > 4 && p.x < W - 5 && p.y > 3 && p.y < H - 3);
  const pillars: Pos[] = [];
  for (let i = 0; i < 2 && inner.length; i++) {
    const p = inner.splice(rng.int(0, inner.length - 1), 1)[0]!;
    pillars.push(p);
  }
  for (const p of pillars) put(p, 'cover');

  // The doors: the front one in the middle of the south wall, the others where they fit.
  const visible = loc.exits.filter((e) => !e.hidden);
  const frontExit = visible.find((e) => e.to === loc.tossTo) ?? visible[0];
  const doors: Door[] = [];
  const takeDoor = (exit: Id, label: string, at: Pos, front: boolean) => {
    put(at, 'exit');
    g.exits.push(at);
    doors.push({ exit, at, label, front });
  };
  if (frontExit) takeDoor(frontExit.to, frontExit.label, pt(cx, H - 1), true);
  const slots = [pt(wallSeatX, H - 2), pt(east ? W - 1 : 0, H - 2), pt(cx - 5, 0), pt(cx + 5, 0), pt(wallSeatX, 0), pt(east ? W - 1 : 0, 0)];
  const others = visible.filter((e) => e !== frontExit);
  for (const e of others) {
    const at = slots.find((s) => g.cells[idx(g, s)] === 'floor' && g.exits.every((x) => dist(x, s) >= 3) && !seats.some((q) => same(q, s)) && !stools.some((q) => same(q, s)) && !behindBar.some((q) => same(q, s)));
    if (at) takeDoor(e.to, e.label, at, false);
  }

  // Never wall anyone off: a pillar that cuts the room in two goes.
  const from = g.exits[0] ?? pt(cx, H - 1);
  const open = (): boolean => {
    const seen = reachable(g, from);
    return g.cells.every((t, i) => !walkable(t) || seen.has(i));
  };
  for (const p of pillars) if (!open()) put(p, 'floor');
  const livePillars = pillars.filter((p) => g.cells[idx(g, p)] === 'cover');
  for (const [i, p] of livePillars.entries()) fixtures.push({ id: `pillar${i}`, kind: 'pillar', label: 'a pillar', tiles: [p], use: neighbors(g, p).filter((n) => walkable(g.cells[idx(g, n)] ?? null)) });
  for (const f of fixtures) if (f.kind === 'speaker') f.use = neighbors(g, f.tiles[0]!).filter((n) => walkable(g.cells[idx(g, n)] ?? null));
  const dancing = floor.filter((p) => g.cells[idx(g, p)] === 'floor');
  fixtures.push({ id: 'dancefloor', kind: 'dancefloor', label: 'the dance floor', tiles: dancing, use: dancing });

  // Along the walls, in front of the DJ, by the door, behind the decks.
  const wall: Pos[] = [];
  for (let y = 2; y <= H - 2; y++) for (const x of [0, W - 1]) if (g.cells[idx(g, pt(x, y))] === 'floor' && !seats.some((s) => same(s, pt(x, y)))) wall.push(pt(x, y));
  const stage = [-2, -1, 0, 1, 2].map((d) => pt(cx + d, 2)).filter((p) => g.cells[idx(g, p)] === 'floor');
  const front = [-1, 0, 1].map((d) => pt(cx + d, H - 2)).filter((p) => g.cells[idx(g, p)] === 'floor');

  // The light: bright at the bar, the door and the decks, dark in the booths, a strobe on the floor.
  const light: LightLevel[] = Array<LightLevel>(W * H).fill(1);
  const lit = (ps: Pos[], l: LightLevel) => ps.forEach((p) => void (light[idx(g, p)] = l));
  lit(stools, 2);
  lit(behindBar, 2);
  lit(stage, 2);
  lit(front, 2);
  lit(deck, 2);
  lit(seats, 0);
  lit(dancing.filter(() => rng.chance(0.4)), 0);
  lit(dancing.filter((p) => light[idx(g, p)] === 1 && rng.chance(0.35)), 2);

  const props: PropSpec[] = fixtures.filter((f) => f.kind === 'speaker').map((f) => ({ kind: 'speaker', x: f.tiles[0]!.x, y: f.tiles[0]!.y }));
  return { grid: g, role: 'club', props, fixtures, doors, zones: { floor: dancing, behindBar, stools, seats, stage, deck, wall, front }, light, bar: east ? 'east' : 'west' };
}

/** How lit a room usually is, by kind, for the rooms that have a say. */
const LIT: Record<string, LightLevel> = { hall: 2, gate: 2, command: 2, door: 2, hangout: 2, core: 1, pit: 2 };

/**
 * An ordinary room: a board of the right kind for the place, seeded from its id so it is always the same, with a few lamps and
 * dark corners, the machines a dungeon room keeps, and a door tile for each way out that fits.
 */
function plainLayout(w: Seeded, loc: Location): Layout {
  const d = loc.dungeon ? w.dungeons?.[loc.dungeon] : undefined;
  const role = d?.rooms.find((r) => r.id === loc.id)?.role ?? loc.gen?.role ?? loc.kind;
  const rng = new Rng(`prowl:${w.worldSeed}:${loc.id}:${d?.occupation ?? 0}`);
  const grid = makeGrid(rng, loc.kind, !!loc.crowded);
  const floor: Pos[] = [];
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (passable(grid, x, y) && grid.cells[idx(grid, { x, y })] !== 'hazard' && grid.cells[idx(grid, { x, y })] !== 'exit') floor.push({ x, y });

  // Light: a base by kind of room, with a few lamps and a few dark corners.
  const light: LightLevel[] = Array<LightLevel>(grid.w * grid.h).fill(LIT[role] ?? 1);
  const patch = (n: number, lvl: LightLevel, r: number) => {
    for (let i = 0; i < n && floor.length; i++) {
      const c = floor[rng.int(0, floor.length - 1)]!;
      for (const p of floor) if (dist(p, c) <= r) light[idx(grid, p)] = lvl;
    }
  };
  patch(rng.int(1, 2), 2, 1);
  patch(rng.int(1, 2), 0, 1);

  // The machines, on tiles away from the doors.
  const away = floor.filter((p) => grid.exits.every((e) => dist(e, p) >= 3));
  const spots = (away.length >= 3 ? away : floor).slice();
  for (let i = spots.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [spots[i], spots[j]] = [spots[j]!, spots[i]!];
  }
  const props: PropSpec[] = (PROPS_BY_ROOM[role] ?? []).slice(0, spots.length).map((kind, i) => ({ kind, x: spots[i]!.x, y: spots[i]!.y }));
  void PROPS;

  // Doors: the way out to the street (or back the way you came) first, then the others, onto the exit tiles there are.
  const visible = loc.exits.filter((e) => !e.hidden);
  const front = visible.find((e) => e.to === loc.tossTo) ?? visible[0];
  const ordered = front ? [front, ...visible.filter((e) => e !== front)] : [];
  const doors: Door[] = ordered.slice(0, grid.exits.length).map((e, i) => ({ exit: e.to, at: grid.exits[i]!, label: e.label, front: e === front }));

  const empty: Pos[] = [];
  return { grid, role, props, fixtures: [], doors, zones: { floor, behindBar: empty, stools: empty, seats: empty, stage: empty, deck: empty, wall: empty, front: empty }, light, bar: null };
}
