import { Rng } from './rng';
import { DIRS, dist, keyOf, neighbors, ring, step, type Hex } from './hex';
import { roadClass } from './roads';
import type { Exit, GenRole, Id, Location, Via, World } from './types';

/**
 * The hex grid under the city. Every outdoor place (a street, and the buildings on it) stands on one or more hexes, and the
 * places that touch are neighbours whether or not a door joins them: a fence, a wall, a barricade, a stretch of ductwork or a
 * building you can run straight through. Doors and streets stay as `exits`, which is how the city has always been joined; what the
 * grid adds is `links`: every other way across, each with its own price (see `VIA`). So there are as many ways to a place as
 * there are places to go through to reach it, and a chase can cut across them.
 *
 * The grid is as old as the place on it: a place is put on the grid when it is sketched, beside the one it was sketched from.
 * Which links there are depends only on which places touch and the world seed.
 */

type HexWorld = Pick<World, 'worldSeed' | 'locations'>;

// ===================================================================== occupancy

const index = new WeakMap<object, Map<string, Id>>();

/** Who stands on which hex. Kept beside the locations (derived from them, so a save never has to store it). */
export function occupancy(w: Pick<World, 'locations'>): Map<string, Id> {
  let m = index.get(w.locations);
  if (!m) {
    m = new Map();
    for (const loc of Object.values(w.locations)) for (const [q, r] of loc.hex?.cells ?? []) m.set(keyOf({ q, r }), loc.id);
    index.set(w.locations, m);
  }
  return m;
}

export const cellsOf = (loc: Pick<Location, 'hex'>): Hex[] => (loc.hex?.cells ?? []).map(([q, r]) => ({ q, r }));

export function placeAt(w: Pick<World, 'locations'>, h: Hex): Location | undefined {
  const id = occupancy(w).get(keyOf(h));
  return id ? w.locations[id] : undefined;
}

/** Every other place that touches this one on the grid. */
export function touching(w: Pick<World, 'locations'>, loc: Location): Location[] {
  const seen = new Set<Id>([loc.id]);
  const out: Location[] = [];
  for (const c of cellsOf(loc)) {
    for (const n of neighbors(c)) {
      const o = placeAt(w, n);
      if (o && !seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
    }
  }
  return out;
}

/** Hex steps between the nearest cells of two places, or Infinity if either is off the grid. */
export function hexDist(a: Location, b: Location): number {
  let best = Infinity;
  for (const x of cellsOf(a)) for (const y of cellsOf(b)) best = Math.min(best, dist(x, y));
  return best;
}

/** Every way out of a place: its doors and streets, then its links. */
export const edgesOf = (loc: Location): Exit[] => (loc.links?.length ? [...loc.exits, ...loc.links] : loc.exits);

// ===================================================================== what each way costs

/** What a link is made of. Roads (and cars) can use some; people on foot can use most. */
export const VIA: Record<Via, { foot: number; bike: number; car: number; label: string }> = {
  // The cost is in the chase's currency: rounds spent. Infinity means it can't be done that way.
  open: { foot: 1, bike: 1, car: 1, label: 'a cut-through' },
  fence: { foot: 1.4, bike: Infinity, car: 1.6, label: 'a fence' },
  wall: { foot: 2.6, bike: Infinity, car: Infinity, label: 'a wall' },
  barricade: { foot: 2.4, bike: 1.8, car: 1.5, label: 'a barricade' },
  duct: { foot: 2.2, bike: Infinity, car: Infinity, label: 'ductwork' },
  through: { foot: 1.3, bike: Infinity, car: Infinity, label: 'a building' },
  ramp: { foot: 1.2, bike: 0.7, car: 0.8, label: 'a ramp' },
};

/** Is it the sort of place you don't just walk through? */
export const restricted = (loc: Location): boolean => loc.gen?.role === 'corp' || loc.gen?.role === 'outpost' || loc.gen?.role === 'hideout' || loc.kind === 'corp' || loc.kind === 'lair' || loc.security >= 5;

// ===================================================================== sizes

/** How many hexes a place covers. Streets run (and a highway runs on); the big places take more room. */
function sizeFor(rng: Rng, role: GenRole, loc: Location): number {
  switch (role) {
    case 'street': {
      const cls = roadClass(loc);
      if (cls === 'highway') return rng.int(3, 4);
      if (cls === 'alley' || cls === 'small') return 1;
      if (cls === 'pedestrian') return rng.chance(0.4) ? 2 : 1;
      return rng.weighted([1, 2, 3], (n) => (n === 1 ? 0.5 : n === 2 ? 0.32 : 0.18));
    }
    case 'club': return rng.chance(0.4) ? 3 : 2;
    case 'corp': return rng.chance(0.5) ? 3 : 2;
    case 'gym': return 2;
    case 'outpost': return rng.chance(0.5) ? 2 : 1;
    case 'bar': return rng.chance(0.35) ? 2 : 1;
    case 'flat': return rng.weighted([1, 2, 3], (n) => (n === 1 ? 0.5 : n === 2 ? 0.3 : 0.2));
    case 'pawn': return rng.chance(0.4) ? 2 : 1;
    case 'chop': return 1;
    default: return 1;
  }
}

/** Roles that stand on the street rather than inside something. */
const FRONTAGE: GenRole[] = ['street', 'shop', 'bar', 'club', 'corp', 'flat', 'clinic', 'tunnel', 'outpost', 'hideout', 'spot', 'gym', 'pawn', 'realty', 'chop'];

// ===================================================================== placing

function claim(w: Pick<World, 'locations'>, loc: Location, cells: Hex[], dir: number): void {
  const o = occupancy(w);
  loc.hex = { q: cells[0]!.q, r: cells[0]!.r, cells: cells.map((c) => [c.q, c.r]), dir };
  for (const c of cells) o.set(keyOf(c), loc.id);
}

/** Free cells at the given distance from any of the anchor cells, nearest ring first. */
function freeAround(w: Pick<World, 'locations'>, anchor: Hex[], radius: number): Hex[] {
  const o = occupancy(w);
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const a of anchor) {
    for (const c of ring(a, radius)) {
      const k = keyOf(c);
      if (o.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

/** Grow a footprint from its first cell. Streets run in the direction they are going; buildings spread out. */
function grow(w: Pick<World, 'locations'>, first: Hex, size: number, rng: Rng, dir: number, line: boolean): Hex[] {
  const o = occupancy(w);
  const cells = [first];
  while (cells.length < size) {
    const tail = cells[cells.length - 1]!;
    let next: Hex | undefined;
    if (line) {
      // Straight on, or a little to either side.
      for (const d of rng.chance(0.5) ? [0, 1, -1] : [0, -1, 1]) {
        const c = step(tail, dir + d);
        if (!o.has(keyOf(c)) && !cells.some((x) => keyOf(x) === keyOf(c))) {
          next = c;
          break;
        }
      }
    } else {
      const options = cells.flatMap((x) => neighbors(x)).filter((c) => !o.has(keyOf(c)) && !cells.some((x) => keyOf(x) === keyOf(c)));
      if (options.length) next = rng.pick(options);
    }
    if (!next) break;
    cells.push(next);
  }
  return cells;
}

/**
 * Put a newly sketched place on the grid, beside the one it came from (or the nearest ancestor that has a place of its own), and
 * link it to whatever it touches. Places with no room nearby are left off the grid; nothing else cares.
 */
export function placeOnHex(w: HexWorld, loc: Location, parent: Location, role: GenRole, interior: boolean): void {
  if (loc.hex || interior || !FRONTAGE.includes(role)) return;
  let anchor: Location | undefined = parent;
  for (let i = 0; i < 8 && anchor && !anchor.hex; i++) anchor = anchor.gen ? w.locations[anchor.gen.parent] : undefined;
  if (!anchor?.hex) return;
  const rng = new Rng(`hex:${w.worldSeed}:${loc.id}`);
  const street = role === 'street';
  // A road goes on the way its parent was going, give or take; a building looks for any free side.
  const heading = anchor.hex.dir;
  const dir = street ? (heading + rng.pick([0, 0, 0, 1, -1, 1, -1, 2, -2])) : rng.int(0, 5);
  const size = sizeFor(rng, role, loc);
  const base = cellsOf(anchor);
  const center = base[Math.floor(base.length / 2)]!;
  for (let radius = 1; radius <= 4; radius++) {
    const free = freeAround(w, base, radius);
    if (!free.length) continue;
    // Roads like the cell straight ahead; the rest are shuffled.
    const want = step(center, dir, radius);
    // Roads like the cell straight ahead, and like running alongside another road (which is how a city gets blocks and loops);
    // buildings keep out of the way of the road going on.
    const order = free
      .map((c) => {
        let s = rng.next() * 2;
        if (street) {
          s += dist(c, want) * 1.4;
          const others = new Set<Id>();
          for (const n of neighbors(c)) {
            const o = placeAt(w, n);
            if (o && o.id !== anchor!.id && isStreet(o)) others.add(o.id);
          }
          s -= 1.3 * Math.min(2, others.size);
        } else if (dist(c, want) <= 1) s += 1.8;
        return { c, s };
      })
      .sort((a, b) => a.s - b.s);
    const cells = grow(w, order[0]!.c, size, rng, dir, street);
    claim(w, loc, cells, dir);
    relink(w, loc);
    return;
  }
}

// ===================================================================== links

const pairRng = (w: HexWorld, a: Id, b: Id, tag: string): Rng => new Rng(`link:${tag}:${w.worldSeed}:${a < b ? `${a}|${b}` : `${b}|${a}`}`);

const linked = (a: Location, b: Location): boolean => a.exits.some((e) => e.to === b.id) || b.exits.some((e) => e.to === a.id) || !!a.links?.some((e) => e.to === b.id);

function addLink(a: Location, b: Location, via: Via, labelAB: string, labelBA: string, over?: Id): void {
  (a.links ??= []).push({ to: b.id, label: labelAB, hidden: false, gate: null, via, ...(over ? { over } : {}) });
  (b.links ??= []).push({ to: a.id, label: labelBA, hidden: false, gate: null, via, ...(over ? { over } : {}) });
}

const isStreet = (l: Location): boolean => l.kind === 'street' && l.road !== 'highway' && !!l.hex;
const isBuilding = (l: Location): boolean => l.kind !== 'street' && l.kind !== 'tunnel' && !!l.hex;

const BLOCKS = ['stacked pallets', 'a burned-out van', 'welded rebar', 'riot shields and razor wire', 'a wall of shipping crates', 'a rolled-over dumpster'];

/**
 * Make the links this place has by touching the ones around it. Each pair rolls from its own stream, so a link is the same
 * whichever of the two was put on the grid last.
 */
export function relink(w: HexWorld, loc: Location): void {
  if (!loc.hex) return;
  const near = touching(w, loc);
  for (const o of near) {
    if (linked(loc, o)) continue;
    const rng = pairRng(w, loc.id, o.id, 'pair');
    if (isStreet(loc) && isStreet(o)) {
      const alley = roadClass(loc) === 'alley' || roadClass(o) === 'alley';
      const r = rng.next();
      const via: Via = r < (alley ? 0.5 : 0.3) ? 'open' : r < 0.55 ? 'fence' : r < 0.85 ? 'barricade' : 'wall';
      const [a, b] = [loc, o];
      const phrase = (to: Location): string =>
        via === 'open' ? `a cut-through to ${to.name}` : via === 'fence' ? `over a chain-link fence to ${to.name}` : via === 'barricade' ? `through a barricade of ${BLOCKS[rng.int(0, BLOCKS.length - 1)]} to ${to.name}` : `up and over a sheer wall to ${to.name}`;
      addLink(a, b, via, phrase(b), phrase(a));
    } else if (isBuilding(loc) && isBuilding(o)) {
      if (rng.chance(restricted(loc) || restricted(o) ? 0.12 : 0.3)) addLink(loc, o, 'duct', `through the ductwork into ${o.name}`, `through the ductwork into ${loc.name}`);
    }
  }
  // Straight through (or up and over) a building to the street on its far side.
  const cells = cellsOf(loc);
  if (isStreet(loc)) {
    for (const c of cells) {
      for (let d = 0; d < 6; d++) {
        const mid = placeAt(w, step(c, d));
        const far = placeAt(w, step(c, d, 2));
        if (mid && far && isBuilding(mid)) throughLink(w, loc, mid, far);
      }
    }
  } else if (isBuilding(loc)) {
    for (const c of cells) {
      for (let d = 0; d < 3; d++) {
        const a = placeAt(w, step(c, d));
        const b = placeAt(w, step(c, d + 3));
        if (a && b) throughLink(w, a, loc, b);
      }
    }
  }
}

function throughLink(w: HexWorld, a: Location, mid: Location, b: Location): void {
  if (a.id === b.id || !isStreet(a) || !isStreet(b) || linked(a, b)) return;
  const rng = pairRng(w, a.id, b.id, `through:${mid.id}`);
  const r = rng.next();
  if (r < 0.14) addLink(a, b, 'ramp', `up a ramp and over ${mid.name} to ${b.name}`, `up a ramp and over ${mid.name} to ${a.name}`, mid.id);
  else if (r < 0.7) addLink(a, b, 'through', `straight through ${mid.name} to ${b.name}`, `straight through ${mid.name} to ${a.name}`, mid.id);
}

// ===================================================================== the hand-built district

/** Where the hand-built places stand. */
const HAND_BUILT: [Id, [number, number][], number][] = [
  ['street_main', [[0, 0], [1, 0]], 0],
  ['halo_alley', [[0, 1]], 5],
  ['club_backlot', [[1, 1]], 0],
  ['overpass', [[2, 0]], 0],
  ['halo_floor', [[-1, 0]], 0],
  ['gun_shop', [[-1, 1]], 0],
  ['paint_shop', [[0, -1]], 0],
  ['neon_pharaoh', [[1, -1], [1, -2]], 0],
  ['chem_mart', [[2, -1]], 0],
];

/** Stand the hand-built district on the grid. Safe to call again. */
export function seedHexes(w: HexWorld): void {
  let changed = false;
  for (const [id, cells, dir] of HAND_BUILT) {
    const loc = w.locations[id];
    if (!loc || loc.hex) continue;
    claim(w, loc, cells.map(([q, r]) => ({ q, r })), dir);
    changed = true;
  }
  if (changed) for (const [id] of HAND_BUILT) if (w.locations[id]) relink(w, w.locations[id]!);
}

export { DIRS };
