import { Rng, hashString } from './rng';
import type { Awareness, Ctx, Dungeon, Id, Location, Npc, World } from './types';
import { clamp } from './candidate';
import { angDiff, dirOf, dist, hasLos, idx, inCover, line, neighbors, passable, pathTo, posOf, reach, stepOf, terrainAt, type Grid, type Pos } from './grid';
import { spawnGroup } from './candidate';
import { witnessBodies, witnessTakedown } from './witnesses';
import { ambientNoise, carries, eased, follow, heroCover, trackerOf } from './tracking';
import { V, atLeast, awareness, bucketOf, callForHelp, callWeight, heroPerception, heroStealth, keenness, npcPerception } from './stealth';
import { PROPS, type PropKind } from './content/props';
import { commitBoard, placeOf, syncPlace, viewOf } from './placeboard';
import type { CamMount } from './layout';
import { overrideChance } from './override';
import { skillLevel, skillValue, train, hasImplantFlag } from './skills';
import { gainXp } from './combat';
import { wielded } from './arms';
import { fxOf } from './weapons';
import { downFor } from './shutdown';
import { moveNpc } from './population';
import { nested } from './events';

/**
 * The board for getting past people. When she goes into a room of a dungeon sneaking, the room is laid out as a small
 * board (the same kind a fight is played on) and played out round by round: each person in it has a facing and a cone
 * they can see down, light and cover change how far, and everything she does makes some noise. How much each of them
 * notices comes out of that, into the same awareness numbers as everywhere else (stealth.ts): when anyone has her, the
 * board stops and it is a fight.
 *
 * Her side of it is a planner: where to stand, when to wait for a patrol to turn its back, who to take out and from
 * which side, when to set something off on the other side of the room. Their side is a few simple habits by how much
 * they know: stand a post and look around, walk a patrol, go and see about a noise, search where they last had her.
 *
 * The board is not drawn anywhere. It is told as a few lines in the log.
 */

export type Light = 0 | 1 | 2;
export type Posture = 'hold' | 'sneak' | 'walk' | 'dash';
export type Behavior = 'post' | 'patrol' | 'investigate' | 'search' | 'return' | 'flee';
/** `evaded`: she was going for the way out, and got there unseen. */
export type ProwlOutcome = 'cleared' | 'detected' | 'stalled' | 'evaded';

/** Eight directions, clockwise from north. */
const DIRS: Pos[] = [{ x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }];

export { angDiff, dirOf };

export interface PUnit {
  npc: Npc;
  x: number;
  y: number;
  facing: number;
  home: Pos;
  homeFacing: number;
  route?: Pos[];
  leg: number;
  pause: number;
  behavior: Behavior;
  /** Where the last thing that drew their attention was. */
  last: Pos | null;
  /** Rounds spent at it. */
  looked: number;
  searched: Set<number>;
  /** Rounds since they last saw or heard anything. */
  calm: number;
  /** Which way their sweep is turning. */
  sweep: 1 | -1;
  /** Stands where it is: a turret, an officer at a desk. They turn to look but do not go and see. */
  holds: boolean;
  /** Sensors and not eyes: a wider cone. */
  wide: boolean;
  down: boolean;
  /** Gone out the door rather than put down. */
  fled?: boolean;
  /** Not looking, just running somewhere along a line of tiles (a chase going past): until something reaches them, which makes them stop and look. */
  runner?: { path: Pos[]; i: number; step: number; v: number };
  /** Has had a hunch about where she went (said once). */
  hunched?: boolean;
  /** How much of her noise has reached them since they last tried to pick up her trail. */
  heard?: number;
}

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  charges: number;
}
export interface Body {
  npcId: Id;
  x: number;
  y: number;
  found: boolean;
}

export interface Board {
  w: World;
  grid: Grid;
  light: Light[];
  units: PUnit[];
  hero: Pos;
  posture: Posture;
  props: Prop[];
  bodies: Body[];
  round: number;
  /** Lights out around a point until a round. */
  dark: { x: number; y: number; r: number; until: number }[];
  /** The room's role in the dungeon (picks the lights and the props). */
  role: string;
  /** The cameras that are working, bolted where they are. They sweep (see `camFacing`). */
  cams?: CamMount[];
  /** What she is doing here: putting them down (the default), or getting out without being seen. */
  goal?: 'clear' | 'leave' | 'hide';
  /** The ways out of the room, and what is beyond them. */
  ways?: { at: Pos; to: Id }[];
  /** Searchers can follow her trail (see `tracking.ts`): the better the tracker, the nearer they look. */
  tracking?: boolean;
  /** People about who are not what she is here for: they see things, and react (see `witnesses.ts`). */
  others?: PUnit[];
  /** Police on their way to somewhere on the board: when, where, how many (maybe none). */
  arrivals?: { round: number; at: Pos; count: number; force: 'npd' | 'atlas' }[];
  /** Bystanders who have gone for her. */
  joined?: Npc[];
  /** A bystander has made it a fight. */
  exposed?: boolean;
  /** The way she took out, if she took one. */
  left?: Id;
  /** Those who ran for it. */
  fled?: { npc: Npc; to: Id }[];
}

// ------------------------------------------------------------------ the board

const SPEED: Record<Posture, number> = { hold: 0, sneak: 2, walk: 3, dash: 5 };
/** How much noise one step makes. */
const STEP_NOISE: Record<Posture, number> = { hold: 0, sneak: 0.04, walk: 0.14, dash: 0.4 };
/** How much of her shows, by what she is doing. */
const POSTURE_SHOWS: Record<Posture, number> = { hold: 0.3, sneak: 0.65, walk: 1, dash: 2 };
const MAX_ROUNDS = 30;
/** How far she can reach into a machine from where she stands. */
const JACK_RANGE = 6;

const posKey = (g: Grid, p: Pos): number => idx(g, p);
const same = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

export function lightAt(b: Board, p: Pos): Light {
  if (b.w.flags.blackout) return 0;
  for (const d of b.dark) if (b.round < d.until && dist(d, p) <= d.r) return 0;
  return b.light[posKey(b.grid, p)] ?? 1;
}

export const holdsPost = (n: Npc): boolean => n.tags.includes('commander') || /turret/i.test(n.role) || n.tags.includes('boss');
export const sensors = (n: Npc): boolean => n.tags.includes('robot');

/** A person on the board. */
export function makeUnit(npc: Npc, at: Pos, facing: number, o: { route?: Pos[] } = {}): PUnit {
  return {
    npc,
    x: at.x,
    y: at.y,
    facing,
    home: { ...at },
    homeFacing: facing,
    ...(o.route ? { route: o.route } : {}),
    leg: 0,
    pause: 0,
    behavior: o.route ? 'patrol' : 'post',
    last: null,
    looked: 0,
    searched: new Set(),
    calm: 99,
    sweep: 1,
    holds: holdsPost(npc) || /turret/i.test(npc.role),
    wide: sensors(npc),
    down: false,
  };
}

const walkableFor = (g: Grid, p: Pos): boolean => passable(g, p.x, p.y) && terrainAt(g, p.x, p.y) !== 'hazard';

// ------------------------------------------------------------------ what they can see and hear

const live = (b: Board): PUnit[] => b.units.filter((u) => !u.down);

/** How far this one can see her, by how well lit she is. */
export function viewRange(b: Board, u: PUnit, at: Pos): number {
  const lit = lightAt(b, at);
  return clamp(2 + 0.4 * npcPerception(u.npc) + (u.wide ? 1 : 0) + (lit === 2 ? 2 : lit === 0 ? -1.5 : 0), 1, 9);
}

/** Is `at` sheltered from this unit: behind cover, so only someone right up to it would find her. */
export const sheltered = (b: Board, u: Pos, at: Pos): boolean => inCover(b.grid, u, at);

/** How much of the way someone's eyes cover a point: 1 in front of them, less to the side when it is close, nothing behind. */
export function coneFactor(u: Pick<PUnit, 'x' | 'y' | 'facing' | 'wide'>, at: Pos): number {
  const d = dist(u, at);
  if (d === 0) return 1;
  const ang = angDiff(u.facing, dirOf(u, at));
  const cone = u.wide ? 2 : 1;
  let f = ang <= cone ? 1 : d <= 2 && ang <= cone + 1 ? 0.4 : 0;
  if (d <= 1) f = Math.max(f, 0.5);
  return f;
}

/** A camera turns a little either way as it goes, so it covers a wider patch of the room over time. */
const SWEEP = [0, 1, 1, 0, 0, 7, 7, 0];
export const camFacing = (cam: Pick<CamMount, 'id' | 'facing'>, t: number): number => (cam.facing + SWEEP[(t + hashString(cam.id)) % 8]!) % 8;

/**
 * How well a camera at this facing covers a point (0 if it doesn't: out of its cone, too far, or something in the way). Cameras
 * see further than people and are not fooled by a dark room as much, but they have a cone like anyone's and cannot see round a thing.
 */
export function camView(g: Grid, cam: Pos & { facing: number }, at: Pos, lit: Light): number {
  const d = dist(cam, at);
  const range = clamp(8 + (lit === 2 ? 1 : lit === 0 ? -3 : 0), 4, 10);
  if (d > range || !hasLos(g, cam, at)) return 0;
  // (A slice of the room about a camera's width; the sweep is what moves it.)
  if (angDiff(cam.facing, dirOf(cam, at)) > 0) return 0;
  return 1 - 0.5 * (d / range);
}

/** How much more a camera makes of her this round, in the same terms as a person's. */
export function camGain(b: Board, cam: CamMount, at: Pos, posture: Posture, t: number): number {
  const lit = lightAt(b, at);
  const c = camView(b.grid, { x: cam.x, y: cam.y, facing: camFacing(cam, t) }, at, lit);
  if (!c) return 0;
  // Crouched behind a crate, a camera on the ceiling doesn't see her.
  if (posture === 'hold' && sheltered(b, cam, at)) return 0;
  const h = b.w.hero;
  const mine = (1 - 0.05 * Math.min(10, skillLevel(h, 'sneak'))) * (hasImplantFlag(h, 'glow') ? 1.3 : 1);
  return 0.3 * c * POSTURE_SHOWS[posture] * (lit === 2 ? 1.2 : lit === 1 ? 0.8 : 0.4) * mine * 1.1;
}

/**
 * How much more aware of her this unit gets in a round if she stands at `at` doing `posture`. Nothing if she is out of
 * their sight; otherwise more the nearer, the more she moves, the better lit she is and the sharper they are.
 */
export function sightGain(b: Board, u: Pick<PUnit, 'x' | 'y' | 'facing' | 'wide' | 'npc' | 'behavior'>, at: Pos, posture: Posture): number {
  const d = dist(u, at);
  if (d === 0) return 1;
  const range = viewRange(b, u as PUnit, at);
  if (d > range) return 0;
  if (!hasLos(b.grid, u, at)) return 0;
  const facing = coneFactor(u, at);
  if (!facing) return 0;
  // Behind something, only someone close enough to look round it, or searching for exactly that, finds her.
  let hidden = 1;
  if (sheltered(b, u, at)) hidden = posture === 'hold' ? (d <= 1 ? 1 : u.behavior === 'search' && d <= 2 ? 0.5 : 0) : 0.5;
  if (!hidden) return 0;
  const lit = lightAt(b, at);
  const h = b.w.hero;
  const mine = (1 - 0.05 * Math.min(10, skillLevel(h, 'sneak'))) * (hasImplantFlag(h, 'glow') ? 1.3 : 1);
  const close = 1 - 0.6 * (d / range);
  return 0.3 * close * facing * hidden * POSTURE_SHOWS[posture] * (lit === 2 ? 1.2 : lit === 1 ? 0.8 : 0.4) * mine * keenness(u.npc);
}

/**
 * The noise a thing makes where it is, and who it reaches. Nobody gets a fix from a sound, but they know something is there.
 * A noise of hers makes them wary; a noise from a machine only makes them curious, so they go and look without thinking of her.
 */
export function makeNoise(b: Board, at: Pos, level: number, from: 'her' | 'object' = 'her'): PUnit[] {
  const heard: PUnit[] = [];
  if (level <= 0) return heard;
  for (const u of live(b)) {
    const d = dist(u, at);
    const walls = line(u, at).filter((p) => ['wall', 'void'].includes(terrainAt(b.grid, p.x, p.y) ?? '')).length;
    const hear = level * (1 - d / (5 + 6 * level)) * clamp(keenness(u.npc), 0.5, 1.6) - 0.07 * walls;
    if (hear < 0.1) continue;
    const a = awareness(b.w, u.npc);
    if (from === 'her') {
      u.heard = (u.heard ?? 0) + hear * carries(ambientNoise(b.w, b.w.locations[b.w.hero.locationId]));
      // A sound they can make out is at least a reason to wonder.
      a.v = Math.min(V.aware - 0.01, Math.max(a.v + hear * 0.8, V.suspicious + 0.01));
    } else {
      a.v = Math.min(V.aware - 0.01, a.v + (a.v >= V.suspicious ? hear * 0.3 : Math.min(hear * 0.3, V.suspicious - 0.01 - a.v)));
      if (!u.holds && a.v < V.alert) u.behavior = 'investigate';
    }
    if (from === 'object') u.searched.clear();
    u.last = { x: at.x, y: at.y };
    u.looked = 0;
    u.calm = 0;
    heard.push(u);
  }
  return heard;
}

// ------------------------------------------------------------------ moving about

/** Steps from the sources to everywhere. `into`: steps *to* the sources, which is not the same thing where there is a climb in the way. */
function distFrom(g: Grid, sources: { p: Pos; c: number }[], blocked: (p: Pos) => boolean, o: { climber?: boolean; into?: boolean } = {}): Map<number, number> {
  const out = new Map<number, number>();
  const open = sources.map((s) => ({ ...s }));
  for (const s of open) out.set(idx(g, s.p), s.c);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.c < open[bi]!.c) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    if (out.get(idx(g, cur.p))! < cur.c) continue;
    for (const n of neighbors(g, cur.p, false, !!o.climber, !!o.into)) {
      if (blocked(n) && !same(n, cur.p)) continue;
      const nc = cur.c + (terrainAt(g, n.x, n.y) === 'hazard' ? 2 : 1) + (o.into ? stepOf(g, n, cur.p, !!o.climber) : stepOf(g, cur.p, n, !!o.climber)).extra;
      if (out.get(idx(g, n)) === undefined || nc < out.get(idx(g, n))!) {
        out.set(idx(g, n), nc);
        open.push({ p: n, c: nc });
      }
    }
  }
  return out;
}

const occupied = (b: Board, p: Pos, except?: PUnit): boolean => live(b).some((u) => u !== except && same(u, p)) || same(b.hero, p);

/** One step toward `to`, if there is a way. */
function stepToward(b: Board, u: PUnit, to: Pos): Pos | null {
  const dm = distFrom(b.grid, [{ p: to, c: 0 }], (p) => occupied(b, p, u) && !same(p, to), { into: true });
  let best: Pos | null = null;
  let bd = dm.get(idx(b.grid, u)) ?? Infinity;
  for (const n of neighbors(b.grid, u)) {
    if (occupied(b, n, u)) continue;
    const dn = dm.get(idx(b.grid, n));
    if (dn !== undefined && dn < bd) {
      bd = dn;
      best = n;
    }
  }
  return best;
}

function turnToward(u: PUnit, to: Pos, steps = 2): void {
  const want = dirOf(u, to);
  for (let i = 0; i < steps && u.facing !== want; i++) {
    const cw = (want - u.facing + 8) % 8;
    u.facing = (u.facing + (cw <= 4 ? 1 : 7)) % 8;
  }
}

/** Where they will most likely be looking or standing next round, for planning around. */
function predict(b: Board, u: PUnit): Pick<PUnit, 'x' | 'y' | 'facing' | 'wide' | 'npc' | 'behavior'>[] {
  const base = { wide: u.wide, npc: u.npc, behavior: u.behavior };
  if (u.behavior === 'post') return [{ ...base, x: u.x, y: u.y, facing: (u.facing + u.sweep + 8) % 8 }];
  if (u.behavior === 'patrol' && u.route) {
    const to = u.route[(u.leg + 1) % u.route.length]!;
    const step = u.pause > 0 ? null : stepToward(b, u, to);
    return [{ ...base, x: step?.x ?? u.x, y: step?.y ?? u.y, facing: step ? dirOf(u, step) : u.facing }];
  }
  return [];
}

/** How much of her they would get if she were at `at`, now and next round. */
export function exposure(b: Board, at: Pos, posture: Posture): number {
  let s = 0;
  for (const u of live(b)) {
    const now = sightGain(b, u, at, posture);
    const next = Math.max(0, ...predict(b, u).map((p) => sightGain(b, p, at, posture)));
    s += Math.max(now, next * 0.8);
  }
  const t = b.w.beat + b.round;
  for (const cam of b.cams ?? []) s += Math.max(camGain(b, cam, at, posture, t), camGain(b, cam, at, posture, t + 1) * 0.8);
  return s;
}

/** Would standing here put somebody over the line? */
function nearlyCaught(b: Board, at: Pos, posture: Posture, except?: PUnit): boolean {
  for (const u of live(b)) {
    if (u === except) continue;
    const v = u.npc.aware?.v ?? 0;
    const gain = Math.max(sightGain(b, u, at, posture), ...predict(b, u).map((p) => sightGain(b, p, at, posture)));
    if (gain > 0 && v + gain >= V.aware - 0.05) return true;
  }
  const seen = b.w.locations[b.w.hero.locationId]?.camAware ?? 0;
  const t = b.w.beat + b.round;
  for (const cam of b.cams ?? []) {
    const gain = Math.max(camGain(b, cam, at, posture, t), camGain(b, cam, at, posture, t + 1));
    if (gain > 0 && seen + gain >= V.aware - 0.05) return true;
  }
  return false;
}

// ------------------------------------------------------------------ their habits

export type Sink = (type: string, outcome: 'good' | 'bad' | 'mixed', data: Record<string, string | number | boolean>) => void;

function walkTo(b: Board, u: PUnit, to: Pos, steps = 1): boolean {
  for (let i = 0; i < steps && !same(u, to); i++) {
    const n = stepToward(b, u, to);
    if (!n) return false;
    u.facing = dirOf(u, n);
    u.x = n.x;
    u.y = n.y;
  }
  return same(u, to);
}

/** Those who run rather than look: people with nothing to fight with and no reason to stay. */
const TIMID = new Set(['patron', 'drifter', 'street_kid', 'noodler', 'shopkeeper', 'bartender', 'dancer', 'gym_regular', 'gym_desk', 'scientist', 'doc', 'cook', 'tourist']);
export const timid = (n: Npc): boolean => TIMID.has(n.archetype) && !n.hostile;

/**
 * Somebody who has lost her and is searching: every few rounds they try to pick up her trail. A good result puts them near her, a poor one
 * only turns them roughly her way, and none leaves them searching where they were. (Not a fix: they do not know where she is, only where
 * to look.)
 */
function hunch(c: Ctx, b: Board, u: PUnit, say: Sink): void {
  const { w, rng } = c;
  const cover = eased(heroCover(w, 0.3) + (b.posture === 'hold' ? 1.5 : 0) + (lightAt(b, b.hero) === 0 ? 1 : 0), u.heard ?? 0);
  u.heard = 0;
  const r = follow(rng, trackerOf(u.npc), cover);
  if (r.trail === 'none') return;
  const spread = r.trail === 'hot' ? 1 : r.trail === 'warm' ? 4 : 7;
  // (A cold trail is only which way: halfway there, give or take.)
  const mid = r.trail === 'cold' ? { x: Math.round((u.x + b.hero.x) / 2), y: Math.round((u.y + b.hero.y) / 2) } : { ...b.hero };
  const spots: Pos[] = [];
  for (let dy = -spread; dy <= spread; dy++) for (let dx = -spread; dx <= spread; dx++) {
    const q = { x: mid.x + dx, y: mid.y + dy };
    if (walkableFor(b.grid, q) && !occupied(b, q, u)) spots.push(q);
  }
  if (!spots.length) return;
  u.last = { ...spots[rng.int(0, spots.length - 1)]! };
  u.looked = 0;
  u.searched = new Set();
  if (!u.hunched) {
    u.hunched = true;
    say('prowl_track', 'bad', { variant: r.trail, npc: u.npc.name });
  }
}

/**
 * Police called to a body turn up at it. They come looking for whoever did it, so each tries to pick up her trail the way anyone searching does, from
 * where the body is.
 */
function arrive(c: Ctx, b: Board, say: Sink): void {
  const due = (b.arrivals ?? []).filter((a) => b.round >= a.round);
  if (!due.length) return;
  b.arrivals = (b.arrivals ?? []).filter((a) => !due.includes(a));
  for (const a of due) {
    if (!a.count) {
      say('prowl_police', 'good', { variant: 'nobody', count: 0 });
      continue;
    }
    const cops = spawnGroup(c, a.force === 'atlas' ? 'atlas_trooper' : 'npd_officer', a.count, a.force);
    for (const n of cops) {
      const spot = nearestFree(b, a.at);
      const u = makeUnit(n, spot, 0);
      u.behavior = 'search';
      u.last = { ...a.at };
      awareness(b.w, n).v = V.alert + 0.05;
      b.units.push(u);
      b.tracking = true;
      hunch(c, b, u, say);
    }
    say('prowl_police', 'bad', { variant: 'arrive', count: cops.length, force: a.force });
  }
}

function nearestFree(b: Board, p: Pos): Pos {
  if (walkableFor(b.grid, p) && !occupied(b, p)) return p;
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (walkableFor(b.grid, q) && !occupied(b, q)) return q;
    }
  }
  return p;
}

/** Somebody going by along a line, not looking for anything: on along it, until something reaches them (a sight, a sound) and they stop and look. */
function runAlong(b: Board, u: PUnit): void {
  const r = u.runner!;
  if ((u.npc.aware?.v ?? 0) > r.v + 0.04) {
    delete u.runner;
    u.behavior = 'investigate';
    u.last = u.last ?? { ...b.hero };
    return;
  }
  r.i += r.step;
  if (r.i >= r.path.length - 1) {
    u.down = true;
    u.fled = true;
    return;
  }
  const at = r.path[r.i]!;
  u.facing = dirOf({ x: u.x, y: u.y } as never, r.path[Math.min(r.path.length - 1, r.i + 1)]!);
  u.x = at.x;
  u.y = at.y;
}

/** What one unit does with its round, by how much it knows. */
function act(b: Board, u: PUnit, rng: Rng): void {
  const bucket = bucketOf(b.w, u.npc);
  // Somebody who has realised something is wrong, with no stomach for it, makes for the door.
  if ((bucket === 'alert' || bucket === 'aware') && timid(u.npc) && !u.holds && b.ways?.length) u.behavior = 'flee';
  if (u.behavior === 'flee') {
    const way = [...(b.ways ?? [])].sort((x, y) => dist(u, x.at) - dist(u, y.at))[0];
    if (way) {
      walkTo(b, u, way.at, 2);
      if (same(u, way.at)) {
        u.down = true;
        u.fled = true;
        moveNpc(b.w, u.npc, way.to);
        (b.fled ??= []).push({ npc: u.npc, to: way.to });
      }
      return;
    }
    u.behavior = 'search';
  }
  if (bucket === 'alert') {
    u.behavior = 'search';
    if (u.holds) {
      if (u.last) turnToward(u, u.last);
      u.facing = (u.facing + (b.round % 2 ? 1 : 7)) % 8;
      return;
    }
    if (u.last && !same(u, u.last) && !u.searched.has(idx(b.grid, u.last))) {
      walkTo(b, u, u.last, 1);
      return;
    }
    // At the place, or it is searched: look about, then work outwards.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) u.searched.add(idx(b.grid, { x: u.x + dx, y: u.y + dy }));
    const next = nearestUnsearched(b, u);
    if (next) {
      walkTo(b, u, next, 1);
    } else {
      u.behavior = 'return';
      u.last = null;
      u.searched.clear();
    }
    return;
  }
  const curious = u.behavior === 'investigate' && !!u.last;
  if ((bucket === 'suspicious' || curious) && u.last) {
    u.behavior = 'investigate';
    turnToward(u, u.last);
    if (same(u, u.last)) {
      u.looked++;
      if (u.looked >= 4) {
        u.behavior = 'return';
        u.last = null;
        u.looked = 0;
      } else {
        u.facing = (u.facing + (u.looked % 2 ? 1 : 7)) % 8;
      }
      return;
    }
    if (!u.holds && (u.looked >= 1 || curious)) walkTo(b, u, u.last, 1);
    else u.looked++;
    return;
  }
  if (u.behavior === 'investigate' || u.behavior === 'search') {
    // It was nothing, they decide, after a look about.
    if (u.looked < 3 && u.last && same(u, u.last)) {
      u.looked++;
      u.facing = (u.facing + 1) % 8;
      return;
    }
    u.behavior = 'return';
  }
  if (u.behavior === 'return') {
    if (walkTo(b, u, u.home, 1) || same(u, u.home)) {
      u.behavior = u.route ? 'patrol' : 'post';
      u.facing = u.homeFacing;
      u.last = null;
    }
    return;
  }
  if (u.behavior === 'patrol' && u.route) {
    if (u.pause > 0) {
      u.pause--;
      u.facing = (u.facing + u.sweep + 8) % 8;
      return;
    }
    const to = u.route[(u.leg + 1) % u.route.length]!;
    if (!same(u, to)) walkTo(b, u, to, 1);
    if (same(u, to)) {
      u.leg = (u.leg + 1) % u.route.length;
      u.pause = 1 + (hashString(`${u.npc.id}:${u.leg}`) % 3); // (the same every time round, so a patrol can be learned)
    }
    return;
  }
  // Standing a post: look about, a quarter turn each way.
  if (b.round % 2 === 0) {
    const off = angDiff(u.facing, u.homeFacing);
    if (off >= 2) u.sweep = u.sweep === 1 ? -1 : 1;
    u.facing = (u.facing + u.sweep + 8) % 8;
  }
}

/** They settle if nothing more happens: a while as they are, then they let it go. */
function settle(u: PUnit, a: Awareness): void {
  u.calm++;
  if (u.calm > 8 && a.v > 0) a.v = Math.max(0, a.v - 0.03);
  else if (u.calm > 3 && a.v < V.alert && a.v > 0) a.v = Math.max(0, a.v - 0.02);
  // (One who is on their way to look at something finishes the trip first.)
  if (a.v < V.suspicious && (u.behavior === 'search' || (u.behavior === 'investigate' && !u.last))) u.behavior = 'return';
}

/** Everyone's habits for one round, with nothing else going on (and no sign of her). */
export function advanceHabits(b: Board, rng: Rng): void {
  for (const u of live(b)) {
    act(b, u, rng);
    settle(u, awareness(b.w, u.npc));
  }
  b.round++;
}

function nearestUnsearched(b: Board, u: PUnit): Pos | null {
  const dm = distFrom(b.grid, [{ p: u, c: 0 }], (p) => occupied(b, p, u));
  let best: Pos | null = null;
  let bd = 99;
  for (const [i, c] of dm) {
    const p = posOf(b.grid, i);
    if (c === 0 || c > 5 || u.searched.has(i) || !walkableFor(b.grid, p)) continue;
    // Behind cover is where she would be.
    const covered = neighbors(b.grid, p).some((n) => terrainAt(b.grid, n.x, n.y) === 'cover') ? 1 : 0;
    const score = c - covered;
    if (score < bd) {
      bd = score;
      best = p;
    }
  }
  return best;
}

// ------------------------------------------------------------------ her side

interface Plan {
  kind: 'hold' | 'move' | 'takedown' | 'prop' | 'drag';
  to?: Pos;
  target?: PUnit;
  prop?: Prop;
  body?: Body;
}

/** Tiles from which a takedown of this one is best: behind them. */
function behindTiles(b: Board, t: PUnit): { p: Pos; c: number }[] {
  const out: { p: Pos; c: number }[] = [];
  for (const n of neighbors(b.grid, t)) {
    if (!walkableFor(b.grid, n) || (occupied(b, n) && !same(n, b.hero))) continue;
    const behind = angDiff(t.facing, dirOf(t, n));
    out.push({ p: n, c: behind >= 3 ? 0 : behind === 2 ? 1.5 : 3 });
  }
  return out;
}

/** Who to go for: the closest that is not watched over by too many others. */
function pickTarget(b: Board): { target: PUnit; dm: Map<number, number> } | null {
  const units = live(b);
  let best: { target: PUnit; dm: Map<number, number>; cost: number } | null = null;
  for (const t of units) {
    const goals = behindTiles(b, t);
    if (!goals.length) continue;
    const dm = distFrom(b.grid, goals, (p) => units.some((o) => same(o, p)), { climber: true, into: true });
    const mine = dm.get(idx(b.grid, b.hero));
    if (mine === undefined) continue;
    const others = units.filter((o) => o !== t && dist(o, t) <= 5 && hasLos(b.grid, o, t)).length;
    const cost = mine + 2.5 * others + (bucketOf(b.w, t.npc) === 'alert' ? 2 : 0);
    if (!best || cost < best.cost) best = { target: t, dm, cost };
  }
  return best;
}

const bodySeen = (b: Board, body: Body): PUnit | null => {
  for (const u of live(b)) {
    if (u.behavior === 'search' || bucketOf(b.w, u.npc) === 'unaware' || bucketOf(b.w, u.npc) === 'suspicious') {
      const r = viewRange(b, u, body);
      const ang = angDiff(u.facing, dirOf(u, body));
      if (dist(u, body) <= r && hasLos(b.grid, u, body) && (ang <= (u.wide ? 2 : 1) || dist(u, body) <= 1)) return u;
    }
  }
  return null;
};

/** The best way to be heard far from where she means to go. */
function bestProp(b: Board, target: PUnit): Prop | null {
  const h = b.hero;
  let best: { p: Prop; score: number } | null = null;
  for (const p of b.props) {
    if (p.charges <= 0 || dist(h, p) > JACK_RANGE) continue;
    const def = PROPS[p.kind];
    let score = 0;
    for (const u of live(b)) {
      if (u.holds) continue;
      const d = dist(u, p);
      const hear = def.noise * (1 - d / (5 + 6 * def.noise)) * clamp(keenness(u.npc), 0.5, 1.6);
      if (hear < 0.15) continue;
      // Worth it to draw off whoever is in the way, and away from where she is.
      if (dist(p, h) > dist(u, h) - 1 || u === target) score += u === target ? 3 : 1;
    }
    if (def.darkens) score += 0.5;
    if (!best || score > best.score) best = { p, score };
  }
  return best && best.score >= 1 ? best.p : null;
}

/**
 * Getting out unseen: for each tile she could reach, how far it leaves her from the nearest way out against how much of her the room would
 * see there, now and next round. She waits when waiting is better, and only runs when running is.
 */
function planLeave(b: Board): Plan {
  const h = b.hero;
  const goals = (b.ways ?? []).map((x) => ({ p: x.at, c: 0 }));
  if (!goals.length) return { kind: 'hold' };
  const dm = distFrom(b.grid, goals, (p) => live(b).some((u) => same(u, p)), { climber: true, into: true });
  const blocked = (p: Pos) => live(b).some((u) => same(u, p));
  const walk = reach(b.grid, h, SPEED.sneak, blocked, false, true);
  const here = dm.get(idx(b.grid, h)) ?? 99;
  const stayScore = -5 * here - 14 * (exposure(b, h, 'hold') + (nearlyCaught(b, h, 'hold') ? 3 : 0));
  let best: { to: Pos; score: number } | null = null;
  for (const [i] of walk.cost) {
    const to = posOf(b.grid, i);
    if (same(to, h) || occupied(b, to) || terrainAt(b.grid, to.x, to.y) === 'hazard') continue;
    const left = dm.get(i);
    if (left === undefined) continue;
    const score = -5 * left - 14 * exposure(b, to, 'sneak') - (nearlyCaught(b, to, 'sneak') ? 40 : 0);
    if (!best || score > best.score) best = { to, score };
  }
  return best && best.score > stayScore + 1 ? { kind: 'move', to: best.to } : { kind: 'hold' };
}

/** What she does with a round. */
function plan(b: Board, state: { holds: number; sinceProp: number }): Plan {
  const h = b.hero;
  // A body in sight of somebody wants moving.
  for (const body of b.bodies) {
    if (body.found) continue;
    if (dist(h, body) <= 1 && bodySeen(b, body)) return { kind: 'drag', body };
  }
  // Whoever is in reach and has not seen her, whatever else she is doing: she takes them, if nobody else is about to see.
  const close = live(b)
    .filter((u) => dist(h, u) <= 1 && !atLeast(bucketOf(b.w, u.npc), 'aware') && sightGain(b, u, h, 'hold') < 0.05)
    .sort((x, y) => (x.npc.aware?.v ?? 0) - (y.npc.aware?.v ?? 0))[0];
  if (close && !nearlyCaught(b, h, 'hold', close)) return { kind: 'takedown', target: close };
  if (b.goal === 'hide') return { kind: 'hold' };
  if (b.goal === 'leave') return planLeave(b);
  const choice = pickTarget(b);
  if (!choice) return { kind: 'hold' };
  const { target, dm } = choice;

  // Next to the one she wants, and nobody about to see: now.
  if (dist(h, target) <= 1 && !nearlyCaught(b, h, 'hold')) return { kind: 'takedown', target };

  // If the only way at them is in their face, something else should have their attention first.
  if (state.sinceProp >= 2 && dist(h, target) > 1) {
    const reachable = distFrom(b.grid, [{ p: h, c: 0 }], (p) => live(b).some((u) => same(u, p)), { climber: true });
    let bestChance = 0;
    for (const g of behindTiles(b, target)) {
      if (!reachable.has(idx(b.grid, g.p))) continue;
      const was = b.hero;
      b.hero = g.p;
      bestChance = Math.max(bestChance, takedownChance(b, target));
      b.hero = was;
    }
    if (bestChance < 0.65) {
      const prop = bestProp(b, target);
      if (prop) return { kind: 'prop', prop };
    }
  }

  // Where she could stand this round.
  const blocked = (p: Pos) => live(b).some((u) => same(u, p));
  const walk = reach(b.grid, h, SPEED.sneak, blocked, false, true);
  const pick: { to: Pos | null; score: number; exp: number } = { to: null, score: -Infinity, exp: 0 };
  const stay = exposure(b, h, 'hold') + (nearlyCaught(b, h, 'hold') ? 3 : 0);
  const here = dm.get(idx(b.grid, h)) ?? 99;
  const consider = (to: Pos, posture: Posture) => {
    const left = dm.get(idx(b.grid, to));
    if (left === undefined) return;
    const exp = exposure(b, to, posture);
    const score = -5 * left - 14 * exp - (nearlyCaught(b, to, posture) ? 40 : 0);
    if (score > pick.score) {
      pick.to = to;
      pick.score = score;
      pick.exp = exp;
    }
  };
  for (const [i] of walk.cost) {
    const to = posOf(b.grid, i);
    if (same(to, h) || occupied(b, to) || terrainAt(b.grid, to.x, to.y) === 'hazard') continue;
    consider(to, 'sneak');
  }
  const stayScore = -5 * here - 14 * stay;

  // Stuck behind somebody's eyes: make a noise somewhere else.
  const wantMove = pick.to !== null && pick.score > stayScore + 1;
  if ((!wantMove || pick.exp > 0.18) && state.sinceProp >= 2) {
    const prop = bestProp(b, target);
    if (prop) return { kind: 'prop', prop };
  }
  if (wantMove && pick.to) return { kind: 'move', to: pick.to };
  return { kind: 'hold' };
}

// ------------------------------------------------------------------ playing a room

export interface ProwlOpts {
  /** For the log: "three drones and a trooper". */
  describe?: (foes: Npc[]) => string;
  /** Slip away rather than clear the place: she is looking for a way out, not for fights. */
  goal?: 'clear' | 'leave' | 'hide';
  /** Told as a hunt: they are looking for her, not just standing about. */
  hunt?: boolean;
  /** Those searching for her can track her (see `tracking.ts`). */
  track?: boolean;
  /** Filled in: where she slipped away to. */
  left?: Id;
  /** Filled in: bystanders who made it a fight. */
  joined?: Npc[];
}

function sync(b: Board, u: PUnit, from: Pos | null): void {
  if (!u.last && from) u.last = { ...from };
}

/** The wording of where she came at them from. */
const arcOf = (t: PUnit, from: Pos): 'behind' | 'side' | 'front' => {
  const a = angDiff(t.facing, dirOf(t, from));
  return a >= 3 ? 'behind' : a === 2 ? 'side' : 'front';
};

export function takedownChance(b: Board, t: PUnit): number {
  const bucket = bucketOf(b.w, t.npc);
  const base = bucket === 'unaware' ? 0.93 : bucket === 'suspicious' ? 0.72 : 0.5;
  const arc = arcOf(t, b.hero);
  const lit = lightAt(b, b.hero);
  const skill = clamp(0.03 * (heroStealth(b.w) - npcPerception(t.npc)), -0.2, 0.2);
  return clamp(base + (arc === 'behind' ? 0.1 : arc === 'front' ? -0.3 : 0) + (lit === 0 ? 0.07 : lit === 2 ? -0.05 : 0) + skill, 0.1, 0.97);
}

export function takedown(c: Ctx, b: Board, t: PUnit, say: Sink): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const arc = arcOf(t, b.hero);
  const bucket = bucketOf(w, t.npc);
  if (!rng.chance(takedownChance(b, t))) {
    const a = awareness(w, t.npc);
    a.v = 1;
    a.fix = true;
    a.seenAt = h.locationId;
    train(c, 'sneak', 1);
    say('prowl_takedown', 'bad', { variant: 'fail', npc: t.npc.name, from: arc, state: bucket });
    return false;
  }
  const arm = wielded(h);
  const lethal = arm.tags.includes('melee') && arm.id !== 'fists' && !t.npc.tags.includes('robot') && !t.npc.tags.includes('nonlethal');
  const loud = lethal ? clamp(fxOf(arm).noise * 0.5, 0.05, 0.5) : 0.1;
  t.down = true;
  if (lethal) {
    t.npc.alive = false;
    t.npc.hp = 0;
    w.stats.kills++;
  } else {
    t.npc.downUntil = w.clock + downFor(t.npc, rng, false);
  }
  h.cash += t.npc.cash;
  t.npc.cash = 0;
  gainXp(c, 2 + t.npc.level);
  train(c, 'sneak', 2);
  b.bodies.push({ npcId: t.npc.id, x: t.x, y: t.y, found: false });
  say('prowl_takedown', 'good', { variant: lethal ? 'kill' : 'ko', npc: t.npc.name, from: arc, state: bucket });
  makeNoise(b, b.hero, loud);
  return true;
}

/** Set something off. */
export function useProp(c: Ctx, b: Board, prop: Prop, say: Sink): void {
  const { w, rng } = c;
  const def = PROPS[prop.kind];
  train(c, 'tinkering', 1);
  if (!rng.chance(def.override === false ? clamp(0.75 + 0.02 * skillValue(w.hero, 'athletics'), 0.4, 0.95) : overrideChance(w, 0.45))) {
    makeNoise(b, prop, 0.12, 'object');
    say('prowl_distract', 'bad', { variant: 'fail', prop: prop.kind, label: def.label });
    return;
  }
  prop.charges--;
  if (def.darkens) b.dark.push({ x: prop.x, y: prop.y, r: def.darkens, until: b.round + 8 });
  const heard = makeNoise(b, prop, def.noise, 'object');
  say('prowl_distract', 'good', { variant: 'ok', prop: prop.kind, label: def.label, count: heard.length });
}

/**
 * Play out her way through a room of people who haven't seen her. Returns how it ended: she put every one of them down
 * unseen (`cleared`), one of them has her (`detected`: the caller takes it from there), or it has gone on long enough
 * and she is still in the room unseen (`stalled`).
 */
export function prowlBoard(c: Ctx, b: Board, say: Sink): ProwlOutcome {
  const { w, rng } = c;
  const h = w.hero;
  const state = { holds: 0, sinceProp: 9 };
  let told = 0;
  for (b.round = 1; b.round <= MAX_ROUNDS; b.round++) {
    if (!live(b).length) return 'cleared';
    state.sinceProp++;
    told = 0;
    // On the way out and there: gone.
    if (b.goal === 'leave') {
      const way = b.ways?.find((x) => same(x.at, b.hero));
      if (way) {
        b.left = way.to;
        return 'evaded';
      }
    }

    arrive(c, b, say);

    // Her turn.
    const p = plan(b, state);
    b.posture = 'hold';
    let waited = false;
    if (p.kind === 'takedown' && p.target) {
      if (takedown(c, b, p.target, say)) witnessTakedown(c, b, p.target, say);
      state.holds = 0;
    } else if (p.kind === 'move' && p.to) {
      b.posture = 'sneak';
      // Any climbing on the way is a check; a slip stops her where she was, and makes a noise.
      const way = reach(b.grid, b.hero, SPEED.sneak, (q) => occupied(b, q), false, true);
      let at: Pos = b.hero;
      let slipped = false;
      for (const step of pathTo(b.grid, way, p.to)) {
        if (stepOf(b.grid, at, step, true).check) {
          train(c, 'athletics', 1);
          if (!rng.chance(clamp(0.6 + 0.05 * skillValue(h, 'athletics') + 0.02 * heroStealth(w), 0.25, 0.95))) {
            slipped = true;
            break;
          }
        }
        at = step;
      }
      b.hero = { ...at };
      if (slipped) {
        say('prowl_climb', 'bad', { variant: 'slip' });
        makeNoise(b, b.hero, 0.3);
      } else makeNoise(b, b.hero, STEP_NOISE.sneak);
      state.holds = 0;
    } else if (p.kind === 'prop' && p.prop) {
      useProp(c, b, p.prop, say);
      state.sinceProp = 0;
    } else if (p.kind === 'drag' && p.body) {
      const spot = hideTile(b, p.body);
      if (spot) {
        p.body.x = spot.x;
        p.body.y = spot.y;
        makeNoise(b, b.hero, 0.04);
        say('prowl_body', 'good', { variant: 'hidden', npc: w.npcs[p.body.npcId]?.name ?? 'the body' });
      }
    } else {
      waited = true;
      state.holds++;
    }
    if (waited && state.holds === 2) {
      const watcher = live(b).find((u) => sightGain(b, u, b.hero, 'walk') > 0 || exposure(b, b.hero, 'walk') > 0) ?? live(b)[0];
      if (watcher) say('prowl_wait', 'mixed', { variant: watcher.behavior === 'patrol' ? 'patrol' : bucketOf(w, watcher.npc) === 'alert' ? 'search' : 'turn', npc: watcher.npc.name });
    }

    // Their turn, and what they make of her.
    for (const u of live(b)) {
      const before = bucketOf(w, u.npc);
      if (b.tracking && !u.runner && !u.holds && u.behavior === 'search' && !u.npc.aware?.fix && b.round % 3 === 1) hunch(c, b, u, say);
      if (u.runner) runAlong(b, u);
      else act(b, u, rng);
      if (u.down) continue;
      const a = awareness(w, u.npc);
      const seen = sightGain(b, u, b.hero, b.posture);
      if (seen > 0) {
        a.v = Math.min(1, a.v + seen * (0.85 + 0.3 * rng.next()));
        u.calm = 0;
        sync(b, u, b.hero);
        u.last = { ...b.hero };
        u.looked = 0;
        if (a.v >= V.aware) {
          a.fix = true;
          a.seenAt = h.locationId;
        }
      } else {
        settle(u, a);
      }
      const now = bucketOf(w, u.npc);
      if (RANK[now] > RANK[before] && told < 2 && (now !== 'suspicious' || heroPerception(w) >= 4)) {
        told++;
        train(c, 'perception', 1);
        say('stealth_notice', now === 'aware' ? 'bad' : 'mixed', { variant: now, npc: u.npc.name, role: u.npc.role });
      }
      if (!u.runner && RANK[now] >= RANK.alert && !a.calledSince) maybeCall(c, b, u);
    }
    for (const f of b.fled?.splice(0) ?? []) say('prowl_flee', 'mixed', { npc: f.npc.name, to: w.locations[f.to]?.name ?? 'the door' });

    // Bodies get found.
    for (const body of b.bodies) {
      if (body.found) continue;
      const finder = bodySeen(b, body);
      if (!finder) continue;
      body.found = true;
      const a = awareness(w, finder.npc);
      a.v = Math.max(a.v, V.alert + 0.05);
      finder.last = { x: body.x, y: body.y };
      finder.looked = 0;
      finder.calm = 0;
      say('prowl_body', 'bad', { variant: 'found', npc: w.npcs[body.npcId]?.name ?? 'somebody', finder: finder.npc.name });
    }

    witnessBodies(c, b, say);

    // And the cameras.
    if (b.cams?.length) {
      const loc = w.locations[h.locationId];
      let g = 0;
      for (const cam of b.cams) g = Math.max(g, camGain(b, cam, b.hero, b.posture, w.beat + b.round));
      if (loc && g > 0) {
        const before = loc.camAware ?? 0;
        loc.camAware = Math.min(1, before + g * (0.85 + 0.3 * rng.next()));
        if (before < V.aware && loc.camAware >= V.aware) {
          say('stealth_notice', 'bad', { variant: 'camera', place: loc.name });
          return 'detected';
        }
      } else if (loc) loc.camAware = Math.max(0, (loc.camAware ?? 0) - 0.03);
    }
    if (b.exposed || live(b).some((u) => u.behavior !== 'flee' && atLeast(bucketOf(w, u.npc), 'aware'))) return 'detected';
    if (state.holds >= 9 && !live(b).some((u) => u.runner)) return 'stalled';
  }
  return 'stalled';
}

const RANK = { unaware: 0, suspicious: 1, alert: 2, aware: 3 } as const;

/** Somebody who has twigged that something is wrong decides whether to call it in. */
function maybeCall(c: Ctx, b: Board, u: PUnit): void {
  const present = live(b).filter((o) => o !== u && !!u.npc.faction && o.npc.faction === u.npc.faction).length;
  const wgt = callWeight(c.w, u.npc, 1, present);
  if (wgt <= 0 || !c.rng.chance(clamp(wgt * 0.3, 0, 0.7))) return;
  const heard = callForHelp(c, u.npc);
  for (const o of live(b)) if (heard.includes(o.npc)) {
    o.last = o.last ?? (u.last ? { ...u.last } : { x: u.x, y: u.y });
    o.looked = 0;
    o.calm = 0;
  }
}

/** Somewhere to put a body where nobody will see it: behind cover, in the dark, out of the cones. */
function hideTile(b: Board, body: Body): Pos | null {
  let best: { p: Pos; s: number } | null = null;
  for (const n of neighbors(b.grid, body)) {
    if (!walkableFor(b.grid, n) || occupied(b, n)) continue;
    let s = lightAt(b, n) === 0 ? 1 : 0;
    s += neighbors(b.grid, n).some((m) => terrainAt(b.grid, m.x, m.y) === 'cover') ? 1 : 0;
    for (const u of live(b)) s -= sightGain(b, u, n, 'walk') > 0 ? 1 : 0;
    if (!best || s > best.s) best = { p: n, s };
  }
  return best?.p ?? null;
}

/** The whole of it, from the door: take the room's board as it stands, play it, keep what lasts and tell how it ended. */
export function prowlRoom(c: Ctx, d: Dungeon, loc: Location, foes: Npc[], o: ProwlOpts = {}): ProwlOutcome {
  void d;
  const { w } = c;
  const placed = placeOf(w, loc)!;
  syncPlace(w, placed);
  const b = viewOf(w, placed, { foes, goal: o.goal });
  if (o.track) b.tracking = true;
  const say: Sink = (type, outcome, data) => c.emit(type, outcome, data);
  let out: ProwlOutcome = 'stalled';
  nested(c, 'prowl_start', 'mixed', { variant: o.hunt ? 'hunt' : 'quiet', place: loc.name, count: foes.length, foes: o.describe ? o.describe(foes) : `${foes.length} of them`, lit: b.light.reduce<number>((a, x) => a + x, 0) / b.light.length > 1.3 }, () => {
    out = prowlBoard(c, b, say);
    commitBoard(b, placed);
    if (b.left) o.left = b.left;
    if (b.joined) o.joined = b.joined;
    w.clock += Math.ceil(b.round / 4);
    say('prowl_end', out === 'detected' ? 'bad' : out === 'cleared' || out === 'evaded' ? 'good' : 'mixed', { variant: out, place: loc.name, count: live(b).length, to: b.left ? w.locations[b.left]?.name ?? 'the next street' : '' });
  });
  return out;
}
