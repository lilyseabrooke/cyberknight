import type { Ctx, GameMemory, Id, Location, Npc, World } from './types';
import { Rng } from './rng';
import { spawnNpc } from './content/archetypes';
import { addNpc, AWAY } from './population';
import { rehome } from './roster';
import { dangerOf } from './grade';
import { isShut } from './shutdown';
import { memoryOf } from './games';

/**
 * Creators: every game was made by somebody. Whoever it was is rolled from the world and the title (a Muse designer for a
 * licensed game, a cracker for a bootleg), so it is the same person in every run of the same city, and **they exist nowhere
 * until she goes looking**: the person is made, and settled in a flat or a shop or a bar somewhere out in Neo, the first time
 * she finds out who they are. Until then they are only a name the world has not said.
 *
 * She can find out five ways, each from a row somewhere (see content/hall*.ts and records.ts): being number one on the
 * game's board (the credits roll), an Override on the cabinet (the build's own files), asking the pro gamers, digging for
 * intel, or taking it out of a records office. Some tell her who; some tell her where; the ones that matter tell her both.
 */

export const creatorId = (gid: string): Id => `creator@${gid}`;
export const creatorOf = (w: World, gid: string): Npc | undefined => w.npcs[creatorId(gid)];

export type Route = 'record' | 'override' | 'pros' | 'intel' | 'records';

/** Where in Neo somebody might have set up to make games: a flat, a shop, a bar, a club, a hall. Further out is likelier. */
const HOMES = new Set(['flat', 'shop', 'bar', 'club', 'gamehall']);

function homeFor(w: World, rng: Rng): Location | undefined {
  const here = w.hero.locationId;
  const options = Object.values(w.locations)
    .filter((l) => l.gen && HOMES.has(l.gen.role) && l.id !== here && !isShut(w, l.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!options.length) return undefined;
  return rng.weighted(options, (l) => 1 + dangerOf(l) / 8 + (l.visits === 0 ? 0.5 : 0));
}

/** The person who made this game, made and settled the first time anyone needs them. */
export function ensureCreator(w: World, gid: string, g: Pick<GameMemory, 'legal'>): Npc {
  const id = creatorId(gid);
  const existing = w.npcs[id];
  if (existing) return existing;
  const rng = new Rng(`creator:${w.worldSeed}:${gid}`);
  const home = homeFor(w, new Rng(`creatorhome:${w.worldSeed}:${gid}`));
  const npc = spawnNpc(rng, id, g.legal === 'muse' ? 'game_designer' : 'game_cracker', home?.id ?? AWAY, home ? { grade: dangerOf(home) } : {});
  npc.tags.push(`made:${gid}`);
  addNpc(w, npc);
  if (home) rehome(w, npc, home, true);
  return npc;
}

export interface Learned {
  who: Npc;
  /** She did not know who before this. */
  newName: boolean;
  /** She did not know where before this. */
  newPlace: boolean;
}

/**
 * She finds something out about who made a game. `pros` gives a name and nothing else; every other route gives the name
 * and, if she did not have it, where they are (the name alone is the easy part). Returns what was news.
 */
export function learnCreator(c: Ctx, gid: string, route: Route): Learned | undefined {
  const { w } = c;
  const g = memoryOf(w, gid);
  if (!g) return undefined;
  const who = ensureCreator(w, gid, g);
  const newName = !g.creator;
  g.creator = who.id;
  const place = who.locationId !== AWAY ? w.locations[who.locationId] : undefined;
  const newPlace = !g.located && route !== 'pros' && !!place;
  if (newPlace) {
    g.located = true;
    w.mind.lastSeen[who.id] = who.locationId;
  }
  if (newName) c.emit('creator_learned', 'good', { variant: route, title: g.title, game: gid, name: who.name, job: who.role, ...(newPlace && place ? { place: place.name } : {}) });
  else if (newPlace && place) c.emit('creator_located', 'good', { variant: route, title: g.title, game: gid, name: who.name, place: place.name });
  return { who, newName, newPlace };
}

/** Does she know who made this game? Where? */
export const knowsCreator = (w: World, gid: string): boolean => !!memoryOf(w, gid)?.creator;
export const knowsWhere = (w: World, gid: string): boolean => !!memoryOf(w, gid)?.located;
