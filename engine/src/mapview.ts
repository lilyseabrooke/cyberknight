import type { Id, Location, Npc, World } from './types';
import { layoutOf, type Layout } from './layout';
import { placeOf } from './placeboard';
import { everyoneAt } from './population';
import type { Pos } from './grid';

/**
 * What the night viewer draws: the board of the place she is in (the main view) and the city as far as she has seen it (the
 * minimap). Read-only and made fresh each beat; nothing here is stored or changes the world.
 */

/** Which side someone is on, as the map colours them. */
export type MapSide = 'house' | 'gang' | 'atlas' | 'npd' | 'civ';

export interface BoardPerson {
  id: Id;
  name: string;
  role: string;
  side: MapSide;
  /** Who they are with, in words ("the house at Club Hex", "Atlas", "nobody in particular"). */
  with: string;
  level: number;
  tags: string[];
  robot: boolean;
  security: boolean;
  hostile: boolean;
  x: number;
  y: number;
  /** 0 is up the board, clockwise in eighths (see grid.ts `dirOf`). */
  facing: number;
}

export interface BoardBody {
  id: Id;
  name: string;
  dead: boolean;
  x: number;
  y: number;
}

export interface BoardView {
  loc: Id;
  name: string;
  /** "club", "passage", "spot"... */
  kind: string;
  district: string;
  /** Null for the few places with no floor plan. The layout only has the doors she can see. */
  layout: Layout | null;
  hero: Pos | null;
  people: BoardPerson[];
  bodies: BoardBody[];
}

export interface CityPlace {
  id: Id;
  name: string;
  kind: string;
  district: string;
  cells: [number, number][];
  /** She has been here, as against only seeing the way in. */
  been: boolean;
  /** For a street: the places along it she knows of. */
  along: string[];
  /** For a building: the streets it opens onto. */
  off: string[];
}

export interface CityView {
  places: CityPlace[];
  /** The place on the grid she is in, or the one round her (a back room is drawn on its building). */
  here: Id | null;
}

export const districtOf = (loc: Location): string => loc.gen?.district ?? 'halo';

export function kindLabel(loc: Location): string {
  if (loc.kind === 'street') return loc.street ?? 'street';
  if (loc.kind === 'lair') return loc.gen?.role === 'spot' ? 'spot' : 'hideout';
  return loc.kind;
}

export function sideOf(w: Pick<World, 'factions'>, n: Pick<Npc, 'faction' | 'tags'>): MapSide {
  const kind = n.faction ? w.factions[n.faction]?.kind : undefined;
  if (kind === 'venue' || kind === 'shop') return 'house';
  if (kind === 'gang' || n.tags.includes('ganger')) return 'gang';
  if (kind === 'corp' || n.faction === 'atlas') return 'atlas';
  if (kind === 'police' || n.faction === 'npd') return 'npd';
  if (n.tags.includes('staff')) return 'house';
  return 'civ';
}

function withWhom(w: World, n: Npc): string {
  if (!n.faction) return 'nobody in particular';
  const f = w.factions[n.faction];
  if (f?.kind === 'venue' && n.faction.startsWith('v:')) return `the house at ${w.locations[n.faction.slice(2)]?.name ?? f.name}`;
  return f?.name ?? n.faction;
}

/** The board of the place she is in, with everyone on it. */
export function boardView(w: World): BoardView | null {
  const loc = w.locations[w.hero.locationId];
  if (!loc) return null;
  const placed = placeOf(w, loc);
  const layout = placed?.layout ?? layoutOf(w, loc);
  const ents = placed?.board.ents ?? {};
  const people: BoardPerson[] = [];
  for (const n of everyoneAt(w, loc.id)) {
    const e = ents[n.id];
    if (!e || !n.alive || n.downUntil > w.clock) continue;
    people.push({
      id: n.id, name: n.name, role: n.role, side: sideOf(w, n), with: withWhom(w, n), level: n.level, tags: n.tags.slice(0, 6),
      robot: n.tags.includes('robot'), security: n.tags.includes('security'), hostile: n.hostile, x: e.x, y: e.y, facing: e.facing,
    });
  }
  const bodies = (placed?.board.bodies ?? []).map((b) => ({ id: b.npcId, name: w.npcs[b.npcId]?.name ?? 'somebody', dead: !w.npcs[b.npcId]?.alive, x: b.x, y: b.y }));
  return {
    loc: loc.id, name: loc.name, kind: kindLabel(loc), district: districtOf(loc), layout,
    hero: placed ? { ...placed.board.hero } : null, people, bodies,
  };
}

/** The nearest place round this one that stands on the hex grid: itself, or the building or street it is part of. */
function anchorOf(w: World, loc: Location | undefined): Location | undefined {
  for (let i = 0; loc && i < 12; i++) {
    if (loc.hex) return loc;
    loc = w.locations[loc.gen?.parent ?? loc.tossTo];
  }
  return undefined;
}

/**
 * The city as she has seen it: every place on the grid she has been to, and every one she has seen the way into from there
 * (an exit or a way across that isn't hidden). Nothing else, so the minimap never shows what she can't know.
 */
export function cityView(w: World): CityView {
  const locs = w.locations;
  const seen = new Set<Id>();
  const onGrid = (id: Id) => (locs[id]?.hex ? id : anchorOf(w, locs[id])?.id);
  for (const l of Object.values(locs)) {
    if (l.visits <= 0) continue;
    const a = onGrid(l.id);
    if (a) seen.add(a);
    for (const e of [...l.exits, ...(l.links ?? [])]) {
      if (e.hidden) continue;
      const to = locs[e.to];
      if (to?.hex) seen.add(to.id);
    }
  }
  const places: CityPlace[] = [];
  for (const id of seen) {
    const l = locs[id]!;
    const street = l.kind === 'street';
    places.push({
      id, name: l.name, kind: kindLabel(l), district: districtOf(l), cells: l.hex!.cells, been: l.visits > 0,
      along: [],
      off: street ? [] : l.exits.filter((e) => !e.hidden && locs[e.to]?.kind === 'street' && seen.has(e.to)).map((e) => locs[e.to]!.name),
    });
  }
  // what is along each street: the buildings she knows of that open onto it
  const byId = new Map(places.map((p) => [p.id, p]));
  for (const p of places) {
    const l = locs[p.id]!;
    if (l.kind === 'street') continue;
    for (const e of l.exits) {
      const s = byId.get(e.to);
      if (s && locs[e.to]!.kind === 'street' && !e.hidden && !s.along.includes(p.name)) s.along.push(p.name);
    }
  }
  return { places, here: anchorOf(w, locs[w.hero.locationId])?.id ?? null };
}
