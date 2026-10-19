import { Rng } from './rng';
import type { Id, Location, Via } from './types';
import { Draft, pt, type DoorPlan } from './layoutkit';
import type { Fixture, FixtureKind, Layout, LightLevel } from './layout';
import type { PropKind } from './content/props';
import { dist, idx, passable, type Pos } from './grid';
import { DIRS } from './hex';
import { streetTypeOf, type StreetType } from './streettypes';

/**
 * Streets as boards. What a street is like inside depends on what kind of street it is, and there is a different layout for
 * each: a boulevard is a long strip with a planted median; a market is a maze of stalls; a plaza is an open square round a
 * fountain; an alley is a narrow dogleg; a crossing is two strips meeting in a wider open space. Twelve tiles to a hex cell.
 *
 * Each street's neighbours on the hex grid (`edgesOf`) become the ways onto and off the board, put on the side that faces them
 * (`bearing`): a street at either end of the way it runs is an open end, one to the side is an alley mouth in the frontage. The
 * doors of the places on it are in the frontage. See docs/STREETS_PLAN.md.
 */

/** The kinds of street that are one of the stored types, and the two layouts a street can turn into when it meets several others or is in the slums. */
type Form = StreetType | 'crossing' | 'shanty';

export const streetType = streetTypeOf;

type Side = 'W' | 'E' | 'N' | 'S';
type Role = 'wall' | 'pav' | 'lane' | 'verge' | 'median' | 'water';
type Locs = { locations: Record<Id, Location> };

interface Way {
  exit: Id;
  label: string;
  /** Not a way through but something in the way between this street and the next: a fence, a duct. */
  via?: Via;
  over?: Id;
  /** Which side it is on, if it is a street (a building door has none). */
  side?: Side;
}

/** What stands in the way, on the board: the fixture that marks it. */
const OBSTACLE: Record<Via, { kind: FixtureKind; label: string }> = {
  open: { kind: 'fence', label: 'a gap' },
  fence: { kind: 'fence', label: 'a chain-link fence' },
  wall: { kind: 'fence', label: 'a high wall' },
  barricade: { kind: 'barricade', label: 'a barricade' },
  duct: { kind: 'duct', label: 'a ventilation duct' },
  through: { kind: 'duct', label: 'a way through the building' },
  ramp: { kind: 'ramp', label: 'a ramp' },
};

const px = (q: number, r: number): [number, number] => [Math.sqrt(3) * (q + r / 2), 1.5 * r];
const centre = (l: Location): [number, number] => {
  const cells = l.hex?.cells ?? [];
  if (!cells.length) return [0, 0];
  const ps = cells.map(([q, r]) => px(q, r));
  return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
};

/** The ways on and off: each neighbouring street on the side that faces it (relative to the way this one runs), and the doors of the places on it. */
function waysOf(w: Locs, loc: Location, rng: Rng): { streets: Way[]; buildings: Way[] } {
  const streets: Way[] = [];
  const buildings: Way[] = [];
  const axis = loc.hex ? px(DIRS[((loc.hex.dir % 6) + 6) % 6]!.q, DIRS[((loc.hex.dir % 6) + 6) % 6]!.r) : ([1, 0] as [number, number]);
  const axisA = Math.atan2(axis[1], axis[0]);
  const here = centre(loc);
  const taken = new Set<Side>();
  const free = (s: Side): boolean => !taken.has(s);
  const scored: { way: Way; c: number; s: number }[] = [];
  for (const e of [...loc.exits, ...(loc.links ?? [])]) {
    if (e.hidden) continue;
    const to = w.locations[e.to];
    if (!to) continue;
    // Across the hex grid with something in the way: a fence to climb, a duct to crawl along. It is a tile in the frontage, like a door.
    if (e.via && e.via !== 'open') {
      buildings.push({ exit: e.to, label: e.label, via: e.via, ...(e.over ? { over: e.over } : {}) });
      continue;
    }
    if (to.kind !== 'street') {
      buildings.push({ exit: e.to, label: e.label });
      continue;
    }
    const [x, y] = centre(to);
    const a = Math.atan2(y - here[1], x - here[0]) - axisA;
    scored.push({ way: { exit: e.to, label: e.label }, c: loc.hex && to.hex ? Math.cos(a) : 0, s: loc.hex && to.hex ? Math.sin(a) : 0 });
  }
  scored.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
  for (const { way, c, s } of scored) {
    const pref: Side[] = Math.abs(c) >= 0.5 ? [c > 0 ? 'E' : 'W', s > 0 ? 'S' : 'N'] : [s > 0 ? 'S' : 'N', c > 0 ? 'E' : 'W'];
    // A quiet street with no geometry to go on takes the next free end.
    const side = (loc.hex ? pref : (['W', 'E', 'N', 'S'] as Side[])).find(free) ?? (['W', 'E', 'N', 'S'] as Side[]).find(free);
    if (side) taken.add(side);
    streets.push({ ...way, side: side ?? (rng.chance(0.5) ? 'N' : 'S') });
  }
  return { streets, buildings };
}

const SIDE_TILES = (W: number, H: number, side: Side): Pos[] => {
  const out: Pos[] = [];
  if (side === 'W' || side === 'E') for (let y = 0; y < H; y++) out.push(pt(side === 'W' ? 0 : W - 1, y));
  else for (let x = 0; x < W; x++) out.push(pt(x, side === 'N' ? 0 : H - 1));
  return out;
};

/** Evenly spread `n` positions between `lo` and `hi`, nudged a little. */
const spread = (rng: Rng, n: number, lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.max(lo, Math.min(hi, Math.round(lo + ((i + 1) * (hi - lo)) / (n + 1) + rng.int(-1, 1)))));
  return out;
};

const walkableRole = (r: Role): boolean => r !== 'wall' && r !== 'water';

/** Everything a builder needs to put the ways in and then furnish round them. */
class Site {
  readonly plans: DoorPlan[] = [];
  /** Tiles beside a door that nothing is put on. */
  readonly keep = new Set<number>();
  constructor(readonly d: Draft, readonly ways: { streets: Way[]; buildings: Way[] }, readonly rng: Rng) {}

  /** A street at an end that is open: all the walkable tiles on that side are the way. */
  openSide(side: Side, way: Way, tiles: Pos[], front: boolean): void {
    const ok = tiles.filter((p) => this.d.at(p) === 'floor' || this.d.at(p) === 'wall' || this.d.at(p) === 'cover');
    if (!ok.length) return;
    const mid = ok[Math.floor(ok.length / 2)]!;
    ok.sort((a, b) => dist(a, mid) - dist(b, mid));
    this.plans.push({ exit: way.exit, label: way.label, front, tiles: ok });
    for (const p of ok) this.reserve(p);
    void side;
  }

  /** A single door in the wall, at the tile `at`, as long as there is floor just inside it. */
  doorAt(at: Pos, inside: Pos, way: Way, front: boolean): boolean {
    if (this.d.at(inside) !== 'floor' || this.d.at(at) === null) return false;
    this.plans.push({ exit: way.exit, label: way.label, front, tiles: [at], ...(way.via ? { via: way.via } : {}), ...(way.over ? { over: way.over } : {}) });
    if (way.via) this.d.fixture(OBSTACLE[way.via].kind, `way${at.x}_${at.y}`, OBSTACLE[way.via].label, [inside], { solid: false });
    // A door is as high as the ground just inside it.
    this.d.setLevel(at, this.d.levelOf(inside));
    this.reserve(at);
    this.reserve(inside);
    return true;
  }

  reserve(p: Pos): void {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.keep.add((p.y + dy) * 1000 + p.x + dx);
  }
  reserved(p: Pos): boolean { return this.keep.has(p.y * 1000 + p.x); }

  /** Put something down unless it would sit on a door or on something already there. */
  put(kind: FixtureKind, id: string, label: string, tiles: Pos[], o: { large?: boolean } = {}): boolean {
    if (tiles.some((p) => this.d.at(p) !== 'floor' || this.reserved(p))) return false;
    this.d.fixture(kind, id, label, tiles, { large: o.large, decor: true });
    return true;
  }
}

/** The frontage doors along a wall row: spread the ways evenly, a few tiles in from the ends. */
function frontage(site: Site, d: Draft, ways: Way[], rows: { north: boolean; south: boolean }, lo: number, hi: number, depth = 1): void {
  if (!ways.length) return;
  const north: Way[] = [];
  const south: Way[] = [];
  ways.forEach((wy, i) => {
    const pick = wy.side === 'N' ? 'N' : wy.side === 'S' ? 'S' : rows.north && rows.south ? (i % 2 ? 'N' : 'S') : rows.north ? 'N' : 'S';
    (pick === 'N' ? north : south).push(wy);
  });
  const lay = (list: Way[], y: number, inY: number) => {
    const xs = spread(site.rng, list.length, lo, hi);
    list.forEach((wy, i) => {
      const x = xs[i]!;
      // Nudge along until there is floor inside the door.
      for (let k = 0; k < 6; k++) {
        const tx = x + (k % 2 ? k : -k) / 2 | 0;
        if (site.doorAt(pt(tx, y), pt(tx, inY), wy, false)) return;
      }
    });
  };
  lay(north, 0, depth);
  lay(south, d.H - 1, d.H - 1 - depth);
}

const LIT: LightLevel = 2;

/** Lamp posts along a row every so often, each with a pool of light. */
function lamps(site: Site, d: Draft, y: number, every: number, from = 3): void {
  for (let x = from, i = 0; x < d.W - 1; x += every, i++) {
    if (site.put('lamp', `lamp${y}_${i}`, 'a street lamp', [pt(x, y)])) {
      const pool: Pos[] = [];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) <= 3) pool.push(pt(x + dx, y + dy));
      d.lit(pool, LIT);
    }
  }
}

/** A row of parked cars, each two tiles long, here and there. */
function parked(site: Site, d: Draft, y: number, chance: number, tag: string): void {
  for (let x = 2; x < d.W - 3; x += 3) if (site.rng.chance(chance)) site.put('vehicle', `${tag}${x}`, 'a parked car', [pt(x, y), pt(x + 1, y)]);
}

function trees(site: Site, d: Draft, y: number, every: number, tag: string, from = 2): void {
  for (let x = from, i = 0; x < d.W - 1; x += every, i++) site.put('tree', `${tag}${i}`, 'a tree', [pt(x, y)], { large: true });
}

const rowsOf = (roles: Role[], r: Role): number[] => roles.map((v, y) => (v === r ? y : -1)).filter((y) => y >= 0);

/** A strip: rows of terrain across, the street running along. Doors in the ends and the frontage. */
function strip(loc: Location, rng: Rng, ways: { streets: Way[]; buildings: Way[] }, L: number, roles: Role[], furnish: (site: Site, d: Draft, roles: Role[]) => void, o: { base?: LightLevel; dark?: boolean } = {}): Layout {
  const H = roles.length;
  const d = new Draft(L, H, rng);
  roles.forEach((r, y) => {
    if (r === 'wall') d.rect(0, y, L - 1, y, 'wall');
    else if (r === 'water') d.rect(0, y, L - 1, y, 'void');
  });
  const site = new Site(d, ways, rng);
  const walk = roles.map((r, y) => (walkableRole(r) ? y : -1)).filter((y) => y >= 0);
  let front = true;
  for (const side of ['W', 'E'] as const) {
    const way = ways.streets.find((s) => s.side === side);
    if (way) {
      site.openSide(side, way, SIDE_TILES(L, H, side).filter((p) => walk.includes(p.y)), front);
      front = false;
    } else for (const y of walk) d.put(pt(side === 'W' ? 0 : L - 1, y), 'wall');
  }
  const north = roles[0] === 'wall';
  const south = roles[H - 1] === 'wall';
  // Streets to the side are mouths in the frontage; buildings have doors in it. (A strip with no frontage has neither.)
  const sideways = ways.streets.filter((s) => s.side === 'N' || s.side === 'S');
  frontage(site, d, [...sideways, ...ways.buildings], { north, south }, 3, L - 4, 1);
  furnish(site, d, roles);
  return finishStreet(loc, d, site, o);
}

function finishStreet(loc: Location, d: Draft, site: Site, o: { base?: LightLevel; dark?: boolean }): Layout {
  const l = d.finish(loc, 'street', { doors: site.plans, base: o.base ?? (o.dark ? 0 : 1), flip: true });
  // Cameras on poles along the frontage, looking down the street one way or the other.
  const poles = l.fixtures.filter((f) => f.kind === 'lamp').map((f) => f.tiles[0]!);
  if (poles.length) l.cams = poles.filter((_, i) => i % 2 === 0).slice(0, Math.max(0, loc.cameras)).map((p, i) => ({ id: `cam${i}`, x: p.x, y: p.y, facing: i % 2 ? 2 : 6 }));
  // The things that stand about on a street are things to pull down, push over or switch off.
  const FIXTURE_PROP: Partial<Record<Fixture['kind'], PropKind>> = { crate: 'crates', container: 'crates', stall: 'stall', lamp: 'lamp', pipe: 'vent', machine: 'vending' };
  const taken = new Set<string>();
  const counts: Partial<Record<PropKind, number>> = {};
  for (const f of l.fixtures) {
    const kind = FIXTURE_PROP[f.kind];
    if (!kind || (counts[kind] ?? 0) >= 2 || l.props.length >= 6) continue;
    const at = f.use.find((p) => passable(l.grid, p.x, p.y) && !taken.has(`${p.x},${p.y}`) && l.grid.cells[p.y * l.grid.w + p.x] !== 'exit');
    if (!at) continue;
    taken.add(`${at.x},${at.y}`);
    counts[kind] = (counts[kind] ?? 0) + 1;
    l.props.push({ kind, x: at.x, y: at.y });
  }
  return l;
}

// ===================================================================== the long ways

function street(site: Site, d: Draft, roles: Role[]): void {
  const lane = rowsOf(roles, 'lane');
  lamps(site, d, 1, 7);
  lamps(site, d, d.H - 2, 7, 6);
  parked(site, d, lane[0]!, 0.25, 'carN');
  parked(site, d, lane[lane.length - 1]!, 0.25, 'carS');
  for (let x = 4; x < d.W - 3; x += 9) site.put('crate', `bin${x}`, 'a bin', [pt(x, site.rng.chance(0.5) ? 1 : d.H - 2)]);
}

function avenue(site: Site, d: Draft, roles: Role[]): void {
  lamps(site, d, 2, 8);
  lamps(site, d, d.H - 3, 8, 7);
  trees(site, d, 1, 5, 'treeN');
  trees(site, d, d.H - 2, 5, 'treeS', 4);
  const lane = rowsOf(roles, 'lane');
  parked(site, d, lane[0]!, 0.15, 'carN');
  for (let x = 6; x < d.W - 4; x += 14) site.put('machine', `kiosk${x}`, 'a news kiosk', [pt(x, 2), pt(x + 1, 2)]);
}

function boulevard(site: Site, d: Draft, roles: Role[]): void {
  avenue(site, d, roles);
  const med = rowsOf(roles, 'median')[0]!;
  for (let x = 3, i = 0; x < d.W - 2; x += 4, i++) {
    // Planted, with a gap every so often to cross by.
    if (i % 4 === 3) continue;
    site.put('tree', `med${i}`, 'a planted median', [pt(x, med), pt(x + 1, med)], { large: true });
  }
  for (let x = 8; x < d.W - 6; x += 18) site.put('bench', `bench${x}`, 'a bench', [pt(x, 1), pt(x + 1, 1)]);
}

function freightway(site: Site, d: Draft, roles: Role[]): void {
  const lane = rowsOf(roles, 'lane');
  lamps(site, d, lane[0]! - 1, 9);
  // Loading docks along the warehouse fronts, a step up from the yard, now and then.
  if (site.rng.chance(0.6)) raisedFrontage(site, d, { rows: [1, 2], stairs: 2, ladders: 1, ledges: 1 });
  // Loading yards either side: stacks of containers with aisles between them.
  for (const [y0, y1] of [[1, lane[0]! - 2], [lane[lane.length - 1]! + 2, d.H - 2]] as const) {
    for (let x = 2; x < d.W - 5; x += 5) {
      if (site.rng.chance(0.3)) continue;
      for (let y = y0; y + 1 <= y1; y += 3) if (site.rng.chance(0.75)) site.put('container', `box${x}_${y}`, 'a stack of containers', [pt(x, y), pt(x + 1, y), pt(x + 2, y), pt(x, y + 1), pt(x + 1, y + 1), pt(x + 2, y + 1)], { large: true });
    }
  }
  parked(site, d, lane[1]!, 0.2, 'truck');
}

function wharf(site: Site, d: Draft, roles: Role[]): void {
  const quay = rowsOf(roles, 'pav').slice(-1)[0]!;
  lamps(site, d, quay, 8);
  if (site.rng.chance(0.6)) raisedFrontage(site, d, { rows: [1, 2], stairs: 1, ladders: 2, ledges: 2 });
  // Bollards along the water's edge, a crane, and stacks of crates against the warehouses.
  for (let x = 2; x < d.W - 2; x += 4) site.put('crate', `bollard${x}`, 'a bollard', [pt(x, quay)]);
  site.put('machine', 'crane', 'a quayside crane', [pt(site.rng.int(6, d.W - 8), quay - 1), pt(site.rng.int(0, 1) + 7, quay - 1)], { large: true });
  for (let x = 3; x < d.W - 4; x += 6) if (site.rng.chance(0.7)) site.put('container', `box${x}`, 'a shipping container', [pt(x, 1), pt(x + 1, 1), pt(x + 2, 1)], { large: true });
  parked(site, d, 3, 0.15, 'van');
}

function lane(site: Site, d: Draft, roles: Role[]): void {
  lamps(site, d, 1, 9, 4);
  parked(site, d, rowsOf(roles, 'lane')[0]!, 0.3, 'car');
  for (let x = 3; x < d.W - 3; x += 6) if (site.rng.chance(0.6)) site.put('crate', `junk${x}`, 'a pile of junk', [pt(x, site.rng.chance(0.5) ? 1 : d.H - 2)]);
}

function row(site: Site, d: Draft, roles: Role[]): void {
  lane(site, d, roles);
  // A step up at each front door, and bins out for collection.
  for (let x = 2; x < d.W - 2; x += 4) site.put('crate', `step${x}`, 'a front step', [pt(x, 1)]);
}

function run(site: Site, d: Draft): void {
  for (let x = 3; x < d.W - 3; x += 7) if (site.rng.chance(0.7)) site.put('crate', `junk${x}`, 'a stack of crates', [pt(x, site.rng.chance(0.5) ? 1 : 2)]);
}

function walk(site: Site, d: Draft, roles: Role[]): void {
  lamps(site, d, 1, 8);
  lamps(site, d, d.H - 2, 8, 7);
  const mid = Math.floor(d.H / 2);
  // Now and then the north side is a raised bank above the walk, with a low wall along it.
  if (site.rng.chance(0.4)) raisedFrontage(site, d, { rows: [1, 2], stairs: 2, ledgeAll: true });
  trees(site, d, mid - 2, 6, 'treeN', 3);
  trees(site, d, mid + 2, 6, 'treeS', 6);
  for (let x = 4; x < d.W - 4; x += 8) site.put('bench', `bench${x}`, 'a bench', [pt(x, mid), pt(x + 1, mid)]);
  for (let x = 10; x < d.W - 8; x += 20) site.put('machine', `kiosk${x}`, 'a kiosk', [pt(x, mid - 1), pt(x + 1, mid - 1)]);
  void roles;
}

function arcade(site: Site, d: Draft): void {
  for (const y of [1, d.H - 2]) for (let x = 3, i = 0; x < d.W - 2; x += 4, i++) site.put('column', `col${y}_${i}`, 'a column', [pt(x, y)], { large: true });
  for (let x = 6; x < d.W - 6; x += 12) site.put('machine', `cart${x}`, 'a vendor\'s cart', [pt(x, Math.floor(d.H / 2)), pt(x + 1, Math.floor(d.H / 2))]);
  d.lit(d.g.cells.map((_, i) => pt(i % d.W, Math.floor(i / d.W))), LIT);
}

function highway(site: Site, d: Draft, roles: Role[]): void {
  const med = rowsOf(roles, 'median')[0]!;
  // A concrete barrier down the middle with a gap or two, and what has been left on the road.
  for (let x = 1; x < d.W - 1; x++) if (x % 9 !== 4) site.put('barrier', `jersey${x}`, 'a concrete barrier', [pt(x, med)]);
  const lane = rowsOf(roles, 'lane');
  for (let x = 4; x < d.W - 4; x += 7) if (site.rng.chance(0.35)) site.put('vehicle', `wreck${x}`, 'an abandoned car', [pt(x, lane[site.rng.int(0, lane.length - 1)]!), pt(x + 1, lane[0]!)].slice(0, 1));
  lamps(site, d, 1, 12, 5);
}

// ===================================================================== open places and mazes

/** A walled rectangle with the ways on at the sides that have a street. */
function room(loc: Location, rng: Rng, ways: { streets: Way[]; buildings: Way[] }, W: number, H: number, furnish: (site: Site, d: Draft) => void, o: { base?: LightLevel; dark?: boolean; gap?: number } = {}): Layout {
  const d = new Draft(W, H, rng);
  d.rect(0, 0, W - 1, 0, 'wall');
  d.rect(0, H - 1, W - 1, H - 1, 'wall');
  d.rect(0, 0, 0, H - 1, 'wall');
  d.rect(W - 1, 0, W - 1, H - 1, 'wall');
  const site = new Site(d, ways, rng);
  let front = true;
  const gap = o.gap ?? 3;
  for (const way of ways.streets) {
    const side = way.side ?? 'N';
    const along = side === 'W' || side === 'E' ? Math.floor(H / 2) : Math.floor(W / 2);
    const tiles = SIDE_TILES(W, H, side).filter((p) => Math.abs((side === 'W' || side === 'E' ? p.y : p.x) - along) <= gap / 2);
    for (const p of tiles) d.put(p, 'floor');
    site.openSide(side, way, tiles, front);
    front = false;
  }
  frontage(site, d, ways.buildings, { north: true, south: true }, 3, W - 4, 1);
  // Buildings on the east and west faces too.
  furnish(site, d);
  return finishStreet(loc, d, site, o);
}

function plaza(site: Site, d: Draft): void {
  const cx = d.cx;
  const cy = d.cy;
  // A bandstand: a dais at the north end with steps up and a low rail.
  if (site.rng.chance(0.5)) {
    d.platform(cx - 4, 2, cx + 4, 4, 1, { stairs: 2, ledges: 2 });
    landDoors(site, d);
  }
  // A fountain or a statue in the middle, with benches round it, trees at the corners and a kiosk or two.
  const statue = site.rng.chance(0.5);
  site.put(statue ? 'statue' : 'fountain', 'centre', statue ? 'a statue' : 'the fountain', [pt(cx, cy), pt(cx + 1, cy), pt(cx, cy + 1), pt(cx + 1, cy + 1)], { large: true });
  for (const [i, p] of [pt(cx - 3, cy), pt(cx + 4, cy), pt(cx, cy - 3), pt(cx + 1, cy + 4)].entries()) site.put('bench', `bench${i}`, 'a bench', [p, pt(p.x + (i < 2 ? 0 : 1), p.y + (i < 2 ? 1 : 0))]);
  for (const [i, p] of [pt(3, 3), pt(d.W - 4, 3), pt(3, d.H - 4), pt(d.W - 4, d.H - 4)].entries()) site.put('tree', `tree${i}`, 'a tree', [p], { large: true });
  for (let x = 5; x < d.W - 5; x += 7) site.put('machine', `kiosk${x}`, 'a kiosk', [pt(x, 2), pt(x + 1, 2)]);
  lamps(site, d, 2, 8, 6);
}

function yard(site: Site, d: Draft): void {
  // A fire escape: an iron landing against one wall with a ladder up to it and a bad pipe.
  const fe = d.patch(4, 2, (p) => site.reserved(p));
  if (fe) d.platform(fe.x, fe.y, fe.x + 3, fe.y + 1, 1, { stairs: 0, ladders: 1, climbs: 1 });
  site.put('tree', 'tree', 'an old tree', [pt(d.cx, d.cy)], { large: true });
  site.d.scatter('crate', 'stack', 'a stack of crates', 1, 2, 3, { large: true });
  site.d.scatter('vehicle', 'wreck', 'a parked wreck', 2, 1, 2);
  site.d.scatter('crate', 'junk', 'a heap of junk', 1, 1, 4);
}

function concourse(site: Site, d: Draft): void {
  for (let y = 3; y < d.H - 3; y += 4) for (let x = 4; x < d.W - 3; x += 5) site.put('column', `pillar${x}_${y}`, 'a pillar', [pt(x, y)], { large: true });
  for (let x = 6; x < d.W - 6; x += 9) site.put('counter', `desk${x}`, 'a ticket counter', [pt(x, 1), pt(x + 1, 1), pt(x + 2, 1)]);
  for (let x = 3; x < d.W - 4; x += 6) site.put('bench', `bench${x}`, 'a bench', [pt(x, d.H - 3), pt(x + 1, d.H - 3)]);
  d.lit(d.g.cells.map((_, i) => pt(i % d.W, Math.floor(i / d.W))), LIT);
}

/** A market: stalls in blocks with narrow aisles between, and canopy over them. */
function bazaar(site: Site, d: Draft): void {
  const vendors: Pos[] = [];
  // A gantry along the north wall, over the stalls' heads.
  if (site.rng.chance(0.6)) raisedFrontage(site, d, { rows: [1, 1], stairs: 2, ladders: 2, ledges: 2 });
  for (let y = 2; y + 2 < d.H - 1; y += 3) {
    for (let x = 2; x + 3 < d.W - 1; x += 4) {
      if (site.rng.chance(0.12)) continue;
      if (site.put('stall', `stall${x}_${y}`, 'a market stall', [pt(x, y), pt(x + 1, y), pt(x + 2, y), pt(x, y + 1), pt(x + 1, y + 1), pt(x + 2, y + 1)], { large: true })) vendors.push(pt(x + 1, y + 2));
    }
  }
  d.zone('behindBar', vendors.filter((p) => d.at(p) === 'floor'));
  d.faces.behindBar = 0;
  d.lit(d.g.cells.map((_, i) => pt(i % d.W, Math.floor(i / d.W))).filter((p) => (p.x + p.y) % 5 === 0), LIT);
}

/** A rooftop: a parapet round the edge, vents, a water tank, a stairhead for the way down. */
function roof(site: Site, d: Draft): void {
  // The plant room's deck stands a level up, and its tank another.
  d.platform(7, 3, 11, 5, 1, { stairs: 0, ladders: 1, climbs: 1 });
  d.platform(9, 4, 10, 4, 2, { climbOnly: true, climbs: 1 });
  landDoors(site, d);
  site.put('machine', 'tank', 'a water tank', [pt(2, 2), pt(3, 2), pt(2, 3), pt(3, 3)], { large: true });
  site.d.scatter('machine', 'vent', 'a vent stack', 2, 1, 3, { large: true });
  site.d.scatter('crate', 'aerial', 'an aerial mast', 1, 1, 3);
}

// ===================================================================== carved places

/** An alley is cut out of solid building: a narrow way that kinks, with dumpsters and fire escapes. A passage is the same under a roof. */
function alleyLayout(loc: Location, rng: Rng, ways: { streets: Way[]; buildings: Way[] }, L: number, covered: boolean): Layout {
  const W = L + 2;
  const H = 12;
  const d = new Draft(W, H, rng);
  d.fillVoid();
  // Two or three legs: along, up or down, along.
  const y0 = rng.int(2, 3);
  const kinkAt = rng.int(Math.floor(W / 3), Math.floor((2 * W) / 3));
  const y1 = rng.chance(0.5) ? y0 + rng.int(4, 7) : Math.max(1, y0 - 0);
  d.carve(1, y0, kinkAt + 1, y0 + 1);
  d.carve(kinkAt, Math.min(y0, y1), kinkAt + 1, Math.max(y0, y1) + 1);
  d.carve(kinkAt, y1, W - 2, y1 + 1);
  d.seal();
  const site = new Site(d, ways, rng);
  const mouths = [pt(0, y0), pt(0, y0 + 1)];
  const ends = [pt(W - 1, y1), pt(W - 1, y1 + 1)];
  let front = true;
  for (const [side, tiles] of [['W', mouths], ['E', ends]] as const) {
    const way = ways.streets.find((s) => s.side === side) ?? (side === 'W' ? ways.streets[0] : ways.streets[1]);
    if (way && !site.plans.some((p) => p.exit === way.exit)) {
      for (const p of tiles) d.put(p, 'floor');
      site.openSide(side, way, tiles, front);
      front = false;
    }
  }
  // Back doors in the walls beside the legs.
  const spots: [Pos, Pos][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d.at(pt(x, y)) !== 'wall') continue;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) if (d.at(pt(x + dx, y + dy)) === 'floor' && d.at(pt(x - dx, y - dy)) !== 'floor') spots.push([pt(x, y), pt(x + dx, y + dy)]);
  }
  const rest = [...ways.streets.filter((s) => !site.plans.some((p) => p.exit === s.exit)), ...ways.buildings];
  for (const way of rest) {
    for (let k = 0; k < 30 && spots.length; k++) {
      const [at, inside] = spots[rng.int(0, spots.length - 1)]!;
      if (site.plans.some((p) => dist(p.tiles[0]!, at) < 3)) continue;
      if (site.doorAt(at, inside, way, false)) break;
    }
  }
  // A loading step or a fire escape landing.
  // (One row of a two-wide way, so there is still a way past it at the bottom.)
  const landing = rng.chance(0.55) ? d.patch(3, 1, (p) => site.reserved(p)) : null;
  if (landing) d.platform(landing.x, landing.y, landing.x + 2, landing.y, 1, { stairs: 0, ladders: 1, climbs: 1 });
  d.scatter('container', 'dumpster', 'a dumpster', 2, 1, 3, { large: true });
  d.scatter('crate', 'junk', 'a heap of junk', 1, 1, 4);
  for (let x = 4; x < W - 3; x += 8) {
    const p = d.cells().find((q) => q.x === x && d.at(q) === 'floor');
    if (p && covered) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) d.lit([pt(p.x + dx, p.y + dy)], LIT);
  }
  return finishStreet(loc, d, site, { dark: true });
}

/** Two strips crossing: an open space in the middle, arms out to each side, and blocks of building in the corners. */
function crossing(loc: Location, rng: Rng, ways: { streets: Way[]; buildings: Way[] }, arm: number): Layout {
  const W = 2 * arm + 9;
  const H = 2 * arm + 9;
  const d = new Draft(W, H, rng);
  d.rect(0, 0, W - 1, H - 1, 'wall');
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  d.carve(0, cy - 2, W - 1, cy + 2);
  d.carve(cx - 2, 0, cx + 2, H - 1);
  d.carve(cx - 4, cy - 4, cx + 4, cy + 4);
  const site = new Site(d, ways, rng);
  let front = true;
  for (const way of ways.streets) {
    const side = way.side ?? 'N';
    site.openSide(side, way, SIDE_TILES(W, H, side).filter((p) => d.at(p) === 'floor'), front);
    front = false;
  }
  // Doors to buildings along the faces of the corner blocks.
  const faces: [Pos, Pos][] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (d.at(pt(x, y)) !== 'wall') continue;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) if (d.at(pt(x + dx, y + dy)) === 'floor' && d.at(pt(x - dx, y - dy)) === 'wall') faces.push([pt(x, y), pt(x + dx, y + dy)]);
  }
  for (const way of ways.buildings) {
    for (let k = 0; k < 40 && faces.length; k++) {
      const [at, inside] = faces[rng.int(0, faces.length - 1)]!;
      if (site.plans.some((p) => p.tiles.some((t) => dist(t, at) < 3))) continue;
      if (site.doorAt(at, inside, way, false)) break;
    }
  }
  // A crossing has its lamps, a signal post, and cars waiting.
  for (const [i, p] of [pt(cx - 4, cy - 4), pt(cx + 4, cy - 4), pt(cx - 4, cy + 4), pt(cx + 4, cy + 4)].entries()) {
    if (site.put('lamp', `lamp${i}`, 'a signal post', [p])) d.lit(Array.from({ length: 49 }, (_, k) => pt(p.x + (k % 7) - 3, p.y + Math.floor(k / 7) - 3)), LIT);
  }
  for (let k = 0; k < 4; k++) site.d.scatter('vehicle', `car${k}`, 'a waiting car', 2, 1, 1);
  site.put('machine', 'kiosk', 'a news kiosk', [pt(cx + 3, cy - 2), pt(cx + 4, cy - 2)]);
  return finishStreet(loc, d, site, {});
}

// ===================================================================== raised ground

/** A flight of steps or two up one face of a tier, a low wall along another stretch of it, a ladder and a pipe; the rest is retaining wall. */
function retainingWall(d: Draft, rng: Rng, row: number, x0: number, x1: number, o: { flights: number; ledge: number; ladders: number; pipes: number }): void {
  const free = Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i);
  const take = (n: number, width: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const ok = free.filter((x) => Array.from({ length: width }, (_, j) => x + j).every((v) => free.includes(v)));
      if (!ok.length) break;
      const x = ok[rng.int(0, ok.length - 1)]!;
      for (let j = -1; j <= width; j++) {
        const i = free.indexOf(x + j);
        if (i >= 0) free.splice(i, 1);
      }
      out.push(x);
    }
    return out;
  };
  for (const x of take(o.flights, 2)) for (const dx of [0, 1]) {
    d.reach(pt(x + dx, row), 'stairs');
    d.fixture('stairs', `steps${x + dx}_${row}`, 'a flight of steps', [pt(x + dx, row)], { solid: false });
  }
  for (const x of take(o.ledge, 4)) for (let dx = 0; dx < 4; dx++) d.reach(pt(x + dx, row), 'ledge');
  for (const x of take(o.ladders, 1)) {
    d.reach(pt(x, row), 'ladder');
    d.fixture('ladder', `ladder${x}_${row}`, 'a ladder', [pt(x, row)], { solid: false });
  }
  for (const x of take(o.pipes, 1)) d.reach(pt(x, row), 'climb');
}

/** A hillside street: three tiers, one above the next, with the way up at the far end. Steps, low walls and the odd drainpipe between them. */
function terrace(loc: Location, rng: Rng, ways: { streets: Way[]; buildings: Way[] }, L: number): Layout {
  const H = 11;
  const d = new Draft(L, H, rng);
  d.rect(0, 0, L - 1, 0, 'wall');
  d.rect(0, H - 1, L - 1, H - 1, 'wall');
  d.raise(0, 1, L - 1, 3, 2);
  d.raise(0, 4, L - 1, 6, 1);
  retainingWall(d, rng, 3, 2, L - 3, { flights: 2, ledge: 1, ladders: 1, pipes: 1 });
  retainingWall(d, rng, 6, 2, L - 3, { flights: 2, ledge: 2, ladders: 0, pipes: 1 });
  const site = new Site(d, ways, rng);
  let front = true;
  for (const [side, rows] of [['W', [7, 8, 9]], ['E', [1, 2, 3]]] as const) {
    const way = ways.streets.find((s) => s.side === side);
    const tiles = rows.map((y) => pt(side === 'W' ? 0 : L - 1, y));
    if (way) {
      site.openSide(side, way, tiles, front);
      front = false;
    }
  }
  for (const side of ['W', 'E'] as const) if (!ways.streets.some((s) => s.side === side)) for (let y = 1; y <= 9; y++) d.put(pt(side === 'W' ? 0 : L - 1, y), 'wall');
  // The tiers that have an end of their own to reach it by are not shut in: the other two are walled off at that end.
  for (const y of [1, 2, 3, 4, 5, 6]) d.put(pt(0, y), 'wall');
  for (const y of [4, 5, 6, 7, 8, 9]) d.put(pt(L - 1, y), 'wall');
  frontage(site, d, [...ways.streets.filter((s) => s.side === 'N' || s.side === 'S'), ...ways.buildings], { north: true, south: true }, 3, L - 4, 1);
  lamps(site, d, 1, 8);
  lamps(site, d, 4, 9, 5);
  lamps(site, d, 9, 8, 4);
  trees(site, d, 2, 7, 'treeU', 4);
  parked(site, d, 8, 0.2, 'car');
  for (let x = 5; x < L - 5; x += 9) site.put('bench', `bench${x}`, 'a bench', [pt(x, 5), pt(x + 1, 5)]);
  return finishStreet(loc, d, site, {});
}

/**
 * A shanty town: shacks built on shacks, roofs you can walk across, ladders and drainpipes and stacked crates to get onto them, narrow lanes
 * between at the bottom. Some roofs have a ladder and some can only be climbed.
 */
function shanty(loc: Location, rng: Rng, ways: { streets: Way[]; buildings: Way[] }, L: number): Layout {
  const H = 20;
  const W = Math.max(30, L);
  const d = new Draft(W, H, rng);
  d.rect(0, 0, W - 1, 0, 'wall');
  d.rect(0, H - 1, W - 1, H - 1, 'wall');
  d.rect(0, 0, 0, H - 1, 'wall');
  d.rect(W - 1, 0, W - 1, H - 1, 'wall');
  const hy = Math.floor(H / 2) - 1;
  // Vertical lanes cut the two bands of shacks into rows of blocks; where there is no lane the roofs run on into one another.
  const cuts: number[] = [];
  for (let x = rng.int(6, 9); x < W - 7; x += rng.int(8, 12)) cuts.push(x);
  const spans: [number, number][] = [];
  let from = 1;
  for (const x of cuts) {
    if (x - from >= 3) spans.push([from, x - 1]);
    from = x + 2;
  }
  if (W - 2 - from >= 3) spans.push([from, W - 2]);
  const blocks: { x0: number; y0: number; x1: number; y1: number; level: number }[] = [];
  for (const [x0, x1] of spans) {
    blocks.push({ x0, y0: 1, x1, y1: hy - 1, level: rng.chance(0.65) ? 1 : 2 });
    blocks.push({ x0, y0: hy + 2, x1, y1: H - 2, level: rng.chance(0.65) ? 1 : 2 });
  }
  for (const b of blocks) d.raise(b.x0, b.y0, b.x1, b.y1, b.level);
  for (const b of blocks) {
    const kind = rng.next();
    d.ways(b.x0, b.y0, b.x1, b.y1, b.level, kind < 0.45 ? { stairs: 0, ladders: 1, ledges: 1 } : kind < 0.8 ? { climbOnly: true, climbs: 2 } : { stairs: 1, climbs: 1 });
    // Another storey on the bigger ones.
    if (b.x1 - b.x0 >= 4 && b.y1 - b.y0 >= 3 && rng.chance(0.4) && b.level < 3) {
      d.raise(b.x0 + 1, b.y0 + 1, b.x1 - 1, b.y1 - 1, b.level + 1);
      d.ways(b.x0 + 1, b.y0 + 1, b.x1 - 1, b.y1 - 1, b.level + 1, rng.chance(0.5) ? { stairs: 0, ladders: 1 } : { climbOnly: true, climbs: 1 });
    }
  }
  const site = new Site(d, ways, rng);
  let front = true;
  for (const side of ['W', 'E'] as const) {
    const way = ways.streets.find((s) => s.side === side);
    const tiles = [pt(side === 'W' ? 0 : W - 1, hy), pt(side === 'W' ? 0 : W - 1, hy + 1)];
    for (const p of tiles) d.put(p, 'floor');
    if (way) {
      site.openSide(side, way, tiles, front);
      front = false;
    } else for (const p of tiles) d.put(p, 'wall');
  }
  // Streets to either side come in down the vertical lanes; the doors of the shacks open on the lanes.
  const lanes = cuts.map((x) => x).filter((x) => d.at(pt(x, 1)) === 'floor');
  for (const way of ways.streets.filter((s) => s.side === 'N' || s.side === 'S')) {
    const x = lanes[rng.int(0, Math.max(0, lanes.length - 1))];
    if (x === undefined) break;
    if (way.side === 'N') site.doorAt(pt(x, 0), pt(x, 1), way, false);
    else site.doorAt(pt(x, H - 1), pt(x, H - 2), way, false);
  }
  for (const way of ways.buildings) {
    for (let k = 0; k < 60; k++) {
      const b = blocks[rng.int(0, blocks.length - 1)]!;
      const north = b.y0 === 1;
      const x = rng.int(b.x0, b.x1);
      // On the face of the shack that opens on the lane running along the middle.
      const at = pt(x, north ? b.y1 : b.y0);
      const inside = pt(x, north ? b.y1 + 1 : b.y0 - 1);
      if (site.plans.some((p) => p.tiles.some((t) => dist(t, at) < 3))) continue;
      if (site.doorAt(at, inside, way, false)) break;
    }
  }
  // Roof clutter: a water tank, an aerial; on the ground, junk and the odd lamp.
  d.scatter('machine', 'tank', 'a water tank', 2, 2, 4, { large: true });
  d.scatter('crate', 'aerial', 'a dish and a tangle of wire', 1, 1, 6);
  d.scatter('crate', 'junk', 'a heap of junk', 1, 1, 6);
  return finishStreet(loc, d, site, { dark: true });
}

/** A raised stretch along the frontage of a strip: loading docks, a gantry, a bank above the street. */
function raisedFrontage(site: Site, d: Draft, o: { rows: [number, number]; level?: number; stairs?: number; ladders?: number; ledges?: number; ledgeAll?: boolean }): void {
  const [y0, y1] = o.rows;
  const level = o.level ?? 1;
  d.platform(2, y0, d.W - 3, y1, level, { stairs: o.stairs ?? 2, ladders: o.ladders ?? 1, ledges: o.ledges ?? 0, ledgeAll: o.ledgeAll });
  landDoors(site, d);
}

/** A door that opens onto raised ground is as high as the ground it opens onto. */
function landDoors(site: Site, d: Draft): void {
  for (const plan of site.plans) {
    for (const t of plan.tiles) {
      const inside = [pt(t.x, t.y + 1), pt(t.x, t.y - 1), pt(t.x + 1, t.y), pt(t.x - 1, t.y)].find((q) => d.at(q) === 'floor' && d.levelOf(q) > 0);
      if (inside && d.levelOf(t) < d.levelOf(inside)) d.setLevel(t, d.levelOf(inside));
    }
  }
}

// ===================================================================== entry

const strips: Partial<Record<Form, { roles: Role[]; furnish: (site: Site, d: Draft, roles: Role[]) => void; dark?: boolean; base?: LightLevel }>> = {
  street: { roles: ['wall', 'pav', 'lane', 'lane', 'pav', 'wall'], furnish: street },
  avenue: { roles: ['wall', 'pav', 'pav', 'lane', 'lane', 'lane', 'lane', 'pav', 'pav', 'wall'], furnish: avenue },
  boulevard: { roles: ['wall', 'pav', 'pav', 'lane', 'lane', 'median', 'lane', 'lane', 'pav', 'pav', 'wall'], furnish: boulevard },
  freightway: { roles: ['wall', 'pav', 'pav', 'pav', 'lane', 'lane', 'lane', 'pav', 'pav', 'pav', 'wall'], furnish: freightway, base: 1 },
  wharf: { roles: ['wall', 'pav', 'pav', 'lane', 'lane', 'pav', 'pav', 'water', 'water'], furnish: wharf },
  lane: { roles: ['wall', 'pav', 'lane', 'pav', 'wall'], furnish: lane },
  row: { roles: ['wall', 'pav', 'lane', 'pav', 'wall'], furnish: row },
  run: { roles: ['wall', 'lane', 'lane', 'wall'], furnish: (s, d) => run(s, d), dark: true },
  walk: { roles: ['wall', 'pav', 'pav', 'pav', 'pav', 'pav', 'pav', 'pav', 'wall'], furnish: walk },
  arcade: { roles: ['wall', 'pav', 'pav', 'pav', 'pav', 'pav', 'wall'], furnish: (s, d) => arcade(s, d), base: 2 },
  highway: { roles: ['wall', 'verge', 'lane', 'lane', 'lane', 'median', 'lane', 'lane', 'lane', 'verge', 'wall'], furnish: highway, dark: true },
};

/** A made layout for a street, by what sort of street it is. */
export function streetLayout(w: Locs, loc: Location, seed: string): Layout {
  const rng = new Rng(`street:${seed}:${loc.id}`);
  const ways = waysOf(w, loc, rng);
  const n = Math.max(1, Math.min(6, loc.hex?.cells.length ?? 1));
  const L = 12 * n;
  let type: Form = streetType(loc);
  const district = loc.gen?.district;
  // Streets that meet several others at once are often a crossing: two strips making a wider open space.
  const longWay: Form[] = ['street', 'avenue', 'boulevard', 'lane', 'row'];
  if (ways.streets.length >= 3 && longWay.includes(type) && rng.chance(0.7)) type = 'crossing';
  // In the slums the lanes and rows are shacks on shacks.
  if (district === 'slum' && ['lane', 'row', 'run', 'street', 'alley'].includes(type) && rng.chance(0.45)) type = 'shanty';
  const base = strips[type];
  if (base) return strip(loc, rng, ways, Math.max(L, 24), base.roles, base.furnish, { base: base.base, dark: base.dark });
  switch (type) {
    case 'plaza': return room(loc, rng, ways, 14 + 5 * n, 12 + 4 * n, plaza, { base: 1 });
    case 'yard': return room(loc, rng, ways, 14, 11, yard, { dark: true, gap: 2 });
    case 'concourse': return room(loc, rng, ways, 20 + 4 * n, 14, concourse, { base: 2 });
    case 'bazaar': return room(loc, rng, ways, Math.max(24, L), 16, bazaar, { base: 1, gap: 2 });
    case 'roof': return room(loc, rng, ways, 14, 10, roof, { gap: 2 });
    case 'alley': return alleyLayout(loc, rng, ways, Math.max(16, L), false);
    case 'passage': return alleyLayout(loc, rng, ways, Math.max(16, L), true);
    case 'terrace': return terrace(loc, rng, ways, Math.max(L, 24));
    case 'shanty': return shanty(loc, rng, ways, L);
    case 'crossing': return crossing(loc, rng, ways, Math.max(6, Math.min(14, n * 4)));
    default: return strip(loc, rng, ways, L, strips.street!.roles, strips.street!.furnish, {});
  }
}

void idx;
