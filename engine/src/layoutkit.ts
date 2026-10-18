import type { Rng } from './rng';
import type { Id, Location } from './types';
import { dirOf, dist, idx, neighbors, walkable, type Grid, type Pos, type Terrain } from './grid';
import { PROPS_BY_ROOM } from './content/props';
import type { CamMount, Door, Fixture, FixtureKind, Layout, LightLevel, PropSpec, Zones } from './layout';

/** The little helpers every layout builder uses. */

export const pt = (x: number, y: number): Pos => ({ x, y });
export const same = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

export function reachable(g: Grid, from: Pos): Set<number> {
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

/** Cameras go up in the corners first, then the middles of the walls, facing into the room. */
export function mountCams(g: Grid, n: number): CamMount[] {
  const cx = Math.floor(g.w / 2);
  const cy = Math.floor(g.h / 2);
  const spots: Pos[] = [{ x: 0, y: 0 }, { x: g.w - 1, y: g.h - 1 }, { x: g.w - 1, y: 0 }, { x: 0, y: g.h - 1 }, { x: cx, y: 0 }, { x: cx, y: g.h - 1 }];
  // In a room that is not a rectangle the corner may be outside the map: the camera goes on the nearest tile that is not.
  const onRoom = (p: Pos): Pos => {
    let best = p;
    let bd = Infinity;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const t = g.cells[y * g.w + x];
      if (t === 'void' || t === 'wall') continue;
      const d = dist(p, { x, y });
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  };
  return spots.slice(0, Math.max(0, Math.min(n, spots.length))).map((q, i) => {
    const p = onRoom(q);
    return { id: `cam${i}`, x: p.x, y: p.y, facing: dirOf(p, { x: cx, y: cy }) };
  });
}

/** Mark the tiles of the big things on the grid, so sight stops at them. */
export function markTall(g: Grid, fixtures: Fixture[]): void {
  g.tall = fixtures.filter((f) => f.large).flatMap((f) => f.tiles.map((t) => idx(g, t)));
}

type ZoneName = keyof Zones;

/**
 * A room being drawn. Put walls and furniture on it, name the things people use, say where the staff stand and the customers
 * wait, then `finish` it: doors, a way through to everything, the light, the cameras and the machines.
 */
export class Draft {
  readonly g: Grid;
  readonly fixtures: Fixture[] = [];
  /** Furniture that can go if it would shut someone in. */
  private readonly decor: Pos[] = [];
  readonly zones: Partial<Zones> = {};
  /** Which way each sort of station faces, looking at the room from where the staff stand. */
  readonly faces: Partial<Record<ZoneName, number>> = {};
  private readonly lights: [Pos[], LightLevel][] = [];
  bar: 'east' | 'west' | null = null;

  constructor(readonly W: number, readonly H: number, readonly rng: Rng) {
    this.g = { w: W, h: H, cells: Array<Terrain>(W * H).fill('floor'), exits: [] };
  }

  get cx(): number { return Math.floor(this.W / 2); }
  get cy(): number { return Math.floor(this.H / 2); }
  at(p: Pos): Terrain | null { return p.x < 0 || p.y < 0 || p.x >= this.W || p.y >= this.H ? null : this.g.cells[idx(this.g, p)]!; }
  put(p: Pos, t: Terrain): void { if (this.at(p) !== null) this.g.cells[idx(this.g, p)] = t; }
  free(p: Pos): boolean { return this.at(p) === 'floor'; }
  rect(x0: number, y0: number, x1: number, y1: number, t: Terrain): Pos[] {
    const out: Pos[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.at(pt(x, y)) === null) continue;
      this.put(pt(x, y), t);
      out.push(pt(x, y));
    }
    return out;
  }
  /** A line of tiles from one end to the other (straight, horizontal or vertical). */
  line(a: Pos, b: Pos): Pos[] {
    const out: Pos[] = [];
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let i = 0; i <= n; i++) out.push(pt(a.x + Math.sign(b.x - a.x) * i, a.y + Math.sign(b.y - a.y) * i));
    return out;
  }
  wall(a: Pos, b: Pos, gaps: Pos[] = []): void {
    for (const p of this.line(a, b)) if (!gaps.some((q) => same(q, p))) this.put(p, 'wall');
  }

  /** Put a named thing down. Solid things are cover (the person behind them is hard to shoot, and nobody walks through). */
  fixture(kind: FixtureKind, id: string, label: string, tiles: Pos[], o: { use?: Pos[]; large?: boolean; solid?: boolean; decor?: boolean } = {}): Fixture {
    const live = tiles.filter((p) => this.at(p) !== null);
    if (o.solid !== false) for (const p of live) this.put(p, 'cover');
    if (o.decor) this.decor.push(...live);
    const f: Fixture = { id, kind, label, tiles: live, use: o.use ?? [], ...(o.large ? { large: true } : {}) };
    this.fixtures.push(f);
    return f;
  }
  /**
   * Furnish at random: `n` things each `fw` by `fh` tiles, on open floor with a tile to walk round them (against a wall they
   * may touch it). Whatever does not fit is left out.
   */
  scatter(kind: FixtureKind, id: string, label: string, fw: number, fh: number, n: number, o: { large?: boolean; along?: boolean; decor?: boolean } = {}): Fixture[] {
    const out: Fixture[] = [];
    const clearAround = (x: number, y: number): boolean => {
      for (let yy = y - 1; yy <= y + fh; yy++) for (let xx = x - 1; xx <= x + fw; xx++) {
        const inside = xx >= x && xx < x + fw && yy >= y && yy < y + fh;
        const t = this.at(pt(xx, yy));
        if (inside ? t !== 'floor' : t === 'cover' || t === 'exit') return false;
      }
      return true;
    };
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = this.rng.int(o.along ? 0 : 1, this.W - fw - (o.along ? 0 : 1));
        const y = this.rng.int(o.along ? 0 : 1, this.H - fh - (o.along ? 0 : 1));
        if (o.along && x !== 0 && y !== 0 && x + fw !== this.W && y + fh !== this.H) continue;
        if (!clearAround(x, y)) continue;
        const tiles = this.rect(x, y, x + fw - 1, y + fh - 1, 'floor');
        out.push(this.fixture(kind, `${id}${out.length}`, label, tiles, { large: o.large, decor: o.decor !== false }));
        break;
      }
    }
    return out;
  }
  zone(name: ZoneName, ps: Pos[]): void { this.zones[name] = ps.filter((p) => this.at(p) !== null); }
  lit(ps: Pos[], l: LightLevel): void { this.lights.push([ps, l]); }

  /**
   * Doors, a way through to every tile, the light, the machines, and a flip left to right now and then so the same sort of room
   * does not always open the same way.
   */
  finish(loc: Location, role: string, o: { front?: Pos; slots?: Pos[]; base?: LightLevel; flip?: boolean; cams?: number } = {}): Layout {
    const { g, W, H, rng } = this;
    const inward = (p: Pos): Pos => (p.y === H - 1 ? pt(p.x, p.y - 1) : p.y === 0 ? pt(p.x, p.y + 1) : p.x === 0 ? pt(p.x + 1, p.y) : pt(p.x - 1, p.y));
    const onEdge = (p: Pos): boolean => p.x === 0 || p.y === 0 || p.x === W - 1 || p.y === H - 1;
    const doors: Door[] = [];
    const taken = (p: Pos): boolean => g.exits.some((e) => dist(e, p) < 3);
    const usable = (p: Pos): boolean => this.at(p) === 'floor' && onEdge(p) && this.at(inward(p)) === 'floor' && !taken(p);
    const takeDoor = (at: Pos, exit: Id | null, label: string, front: boolean): void => {
      this.put(at, 'exit');
      g.exits.push(at);
      if (exit) doors.push({ exit, at, label, front });
    };
    const visible = loc.exits.filter((e) => !e.hidden);
    const frontExit = visible.find((e) => e.to === loc.tossTo) ?? visible[0];
    let front = o.front ?? pt(this.cx, H - 1);
    if (!usable(front)) {
      const border: Pos[] = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (onEdge(pt(x, y))) border.push(pt(x, y));
      front = border.filter((p) => this.at(p) === 'floor' && this.at(inward(p)) === 'floor').sort((a, b) => dist(a, front) - dist(b, front))[0] ?? front;
    }
    takeDoor(front, frontExit?.to ?? null, frontExit?.label ?? 'the door', true);
    for (const e of visible.filter((x) => x !== frontExit)) {
      const at = (o.slots ?? []).find(usable);
      if (at) takeDoor(at, e.to, e.label, false);
    }

    // Never wall anyone in: furniture goes before a person is cut off, and what is still cut off is not part of the room.
    const from = g.exits[0]!;
    const cutOff = (): number[] => {
      const seen = reachable(g, from);
      return g.cells.map((t, i) => (walkable(t) && !seen.has(i) ? i : -1)).filter((i) => i >= 0);
    };
    while (cutOff().length && this.decor.length) {
      const p = this.decor.pop()!;
      this.put(p, 'floor');
      for (const f of this.fixtures) f.tiles = f.tiles.filter((q) => !same(q, p));
    }
    for (const i of cutOff()) g.cells[i] = 'void';
    for (let i = this.fixtures.length - 1; i >= 0; i--) if (!this.fixtures[i]!.tiles.length && this.fixtures[i]!.kind !== 'dancefloor') this.fixtures.splice(i, 1);

    const flip = o.flip ?? rng.chance(0.5);
    if (flip) this.mirror(doors);

    const ok = (p: Pos): boolean => g.cells[idx(g, p)] === 'floor';
    for (const f of this.fixtures) f.use = f.use.filter((p) => ok(p));
    for (const f of this.fixtures) if (!f.use.length) f.use = f.tiles.flatMap((t) => neighbors(g, t).filter((n) => ok(n))).filter((p, i, a) => a.findIndex((q) => same(p, q)) === i);
    const spare: Pos[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ok(pt(x, y))) spare.push(pt(x, y));
    const staffed = new Set((this.zones.behindBar ?? []).concat(this.zones.deck ?? []).map((p) => idx(g, p)));
    const clean = (ps: Pos[] | undefined): Pos[] => (ps ?? []).filter((p) => g.cells[idx(g, p)] !== undefined && walkable(g.cells[idx(g, p)] ?? null) && g.cells[idx(g, p)] !== 'exit');
    const floor = clean(this.zones.floor ?? spare.filter((p) => !staffed.has(idx(g, p))));
    const wallZone = clean(this.zones.wall ?? spare.filter((p) => (p.x === 0 || p.y === 0 || p.x === W - 1 || p.y === H - 1 || [pt(p.x + 1, p.y), pt(p.x - 1, p.y), pt(p.x, p.y + 1), pt(p.x, p.y - 1)].some((q) => this.at(q) === 'wall')) && !staffed.has(idx(g, p))));
    const frontDoor = g.exits[0]!;
    const frontZone = clean(this.zones.front ?? spare.filter((p) => dist(p, frontDoor) <= 2 && !staffed.has(idx(g, p))));
    const zones: Zones = { floor, behindBar: clean(this.zones.behindBar), stools: clean(this.zones.stools), seats: clean(this.zones.seats), stage: clean(this.zones.stage), deck: clean(this.zones.deck), wall: wallZone, front: frontZone };

    const light: LightLevel[] = Array<LightLevel>(W * H).fill(o.base ?? 1);
    for (const [ps, l] of this.lights) for (const p of ps) if (g.cells[idx(g, p)] !== undefined) light[idx(g, p)] = l;

    // The machines she can get into, on tiles away from the doors.
    const far = spare.filter((p) => g.exits.every((e) => dist(e, p) >= 3));
    const spots = (far.length >= 3 ? far : spare).slice();
    for (let i = spots.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [spots[i], spots[j]] = [spots[j]!, spots[i]!];
    }
    const props: PropSpec[] = (PROPS_BY_ROOM[role] ?? []).slice(0, spots.length).map((kind, i) => ({ kind, x: spots[i]!.x, y: spots[i]!.y }));

    markTall(g, this.fixtures);
    return { grid: g, role, props, cams: mountCams(g, o.cams ?? loc.cameras), fixtures: this.fixtures, doors, zones, light, bar: this.bar, stations: true, faces: this.faces };
  }

  /** Left to right: everything that has a place, a side or a way it faces. */
  private mirror(doors: Door[]): void {
    const { W, g } = this;
    const m = (p: Pos): Pos => pt(W - 1 - p.x, p.y);
    const row = (y: number) => g.cells.slice(y * W, (y + 1) * W).reverse();
    for (let y = 0; y < this.H; y++) g.cells.splice(y * W, W, ...row(y));
    g.exits.splice(0, g.exits.length, ...g.exits.map(m));
    for (const d of doors) d.at = m(d.at);
    for (const f of this.fixtures) {
      f.tiles = f.tiles.map(m);
      f.use = f.use.map(m);
    }
    for (const k of Object.keys(this.zones) as ZoneName[]) this.zones[k] = this.zones[k]!.map(m);
    for (const l of this.lights) l[0] = l[0].map(m);
    for (const k of Object.keys(this.faces) as ZoneName[]) this.faces[k] = (8 - this.faces[k]!) % 8;
    if (this.bar) this.bar = this.bar === 'east' ? 'west' : 'east';
  }
}
