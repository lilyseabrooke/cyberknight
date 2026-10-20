import type { Ctx, GameMemory, Id, Location, World } from './types';
import { CAB_FEATURES, cabinetOf } from './content/halls';
import { clamp } from './candidate';

/**
 * Games: what Blackbird makes of each one she has tried. A game is a title (the same title is the same game on every
 * cabinet that runs it, a cracked copy included), and she keeps a memory of it for the rest of her life: how many times she
 * has played, how it went, and above all **how much she likes it**, a number from -1 to 1. Her temper and her appetite for
 * a thrill move it. The number is what the Callings read: a game she loves is a wound if a spider flattens it
 * (`game_lost`), and one she hates, or keeps losing at, is a reason to find out who made it.
 *
 * This file is the light half (reading and rating). Who made a game, and finding them, is creators.ts.
 */

/** "Rage Quit Alley (cracked)" and "Rage Quit Alley" are the same game. */
export function gameId(title: string): string {
  return baseTitle(title).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** A title without the marks a changed cabinet carries. */
export const baseTitle = (title: string): string => title.replace(/\s*\((cracked|Muse edition)\)\s*$/, '');

/** She likes it enough for it to matter when it dies. */
export const LOVES = 0.3;
/** She has had enough of it. */
export const HATES = -0.4;

export const memoryOf = (w: World, gid: string): GameMemory | undefined => w.mind.games?.[gid];

/** Her memory of a game, made the first time she plays it. */
export function remember(w: World, gid: string, title: string, genre: string, legal: 'muse' | 'bootleg'): GameMemory {
  const g = (w.mind.games ??= {});
  return (g[gid] ??= { title, genre, legal, plays: 0, wins: 0, records: 0, streak: 0, like: 0 });
}

/** The main floor of the arcade she is in, whichever room, if she is in one. */
export function hallHere(w: Pick<World, 'locations' | 'hero'>): Location | undefined {
  const loc = w.locations[w.hero.locationId];
  return loc?.gamehall ? loc : loc?.hallRoom ? w.locations[loc.hallRoom.main] : undefined;
}

/** The game on the cabinet at this feature in the room she is standing in, if there is one (even a wrecked one). */
export function gameAtFeature(w: World, feature: string | undefined): string | undefined {
  const main = hallHere(w);
  const info = main?.gamehall;
  if (!main || !info || !feature || !CAB_FEATURES[feature]) return undefined;
  const room = w.locations[w.hero.locationId]?.hallRoom?.room ?? 'floor';
  const key = `${room}:${feature}`;
  if (!info.features.includes(key)) return undefined;
  const st = main.cabs?.[key];
  const base = cabinetOf(w.worldSeed, main, info, key, st?.gen ?? 0);
  return base ? gameId(base.title) : undefined;
}

/** Does she hold #1 on a cabinet that is still standing? */
export const heldBy = (st: { topBy?: string; wrecked?: number } | undefined, clock: number): boolean => st?.topBy === 'BLK' && !(st.wrecked !== undefined && clock < st.wrecked);

/** How many leaderboards she is at the top of right now, in every arcade in the city. */
export function boardsHeld(w: World): number {
  let n = 0;
  for (const l of Object.values(w.locations)) if (l.cabs) for (const st of Object.values(l.cabs)) if (heldBy(st, w.clock)) n++;
  return n;
}

/** The game she likes least, if she hates one. */
export function hatedGame(w: World, below = HATES): (GameMemory & { id: string }) | undefined {
  const all = Object.entries(w.mind.games ?? {}).filter(([, g]) => g.like <= below && g.plays >= 3).map(([id, g]) => ({ ...g, id }));
  return all.sort((a, b) => a.like - b.like)[0];
}

export const lovedGames = (w: World): (GameMemory & { id: string })[] => Object.entries(w.mind.games ?? {}).filter(([, g]) => g.like >= LOVES && g.plays >= 3).map(([id, g]) => ({ ...g, id }));

// ===================================================================== rating a play

export type Went = 'record' | 'good' | 'bad';

/**
 * She has played a game. It goes into her memory, and the number moves: a record is a thrill, a good run is pleasant, a loss
 * stings, and a run of losses sours it faster the shorter her temper. Returns the event to tell if it tipped her over.
 */
export function ratePlay(c: Ctx, gid: string, title: string, genre: string, legal: 'muse' | 'bootleg', went: Went, at?: Id): void {
  const { w } = c;
  const t = w.hero.personality.traits;
  const g = remember(w, gid, title, genre, legal);
  g.plays++;
  g.legal = legal;
  if (at && !g.where?.includes(at)) (g.where ??= []).push(at);
  if (went === 'bad') {
    g.streak++;
    g.like -= (0.06 + 0.015 * Math.min(g.streak, 8)) * (0.7 + 0.8 * t.temper);
  } else {
    g.streak = 0;
    g.wins++;
    g.like += went === 'record' ? 0.32 + 0.1 * (t.thrill - 0.5) : 0.1 + 0.06 * (t.thrill - 0.5);
    if (went === 'record') g.records++;
  }
  g.like = clamp(g.like, -1, 1);
  if (g.like >= 0.45 && g.plays >= 3 && g.felt !== 'love') {
    g.felt = 'love';
    c.emit('game_feeling', 'good', { variant: 'love', title: g.title, game: gid, like: Math.round(g.like * 100) / 100 });
  } else if (g.like <= HATES && g.plays >= 4 && g.felt !== 'hate') {
    g.felt = 'hate';
    c.emit('game_feeling', 'bad', { variant: 'hate', title: g.title, game: gid, like: Math.round(g.like * 100) / 100, streak: g.streak });
  } else if (g.felt === 'love' && g.like < 0.2) delete g.felt;
  else if (g.felt === 'hate' && g.like > -0.2) delete g.felt;
}

/** A cabinet of a game she liked has just been stamped on, with her watching. */
export function gameDied(c: Ctx, gid: string, byName: string, byId: Id): boolean {
  const g = memoryOf(c.w, gid);
  if (!g || g.like < LOVES || g.plays < 3) return false;
  g.lost = (g.lost ?? 0) + 1;
  c.emit('game_lost', 'bad', { variant: 'spider', name: g.title, title: g.title, game: gid, by: byName, by_id: byId, like: Math.round(g.like * 100) / 100 });
  return true;
}

/** A game of hers that died while she was away: she hears about it the next time she is in the hall. */
export function mournLater(w: World, gid: string): void {
  const g = memoryOf(w, gid);
  if (!g || g.like < LOVES || g.plays < 3) return;
  g.lost = (g.lost ?? 0) + 1;
  const m = (w.mind.mourn ??= []);
  if (!m.includes(gid)) m.push(gid);
}

/** For lines and the status panel: how she feels about it in words. */
export function feeling(g: GameMemory): string {
  return g.like >= 0.45 ? "loves it" : g.like >= LOVES ? 'likes it' : g.like <= -0.7 ? 'cannot stand it' : g.like <= HATES ? 'hates it' : g.like <= -0.2 ? 'is not a fan' : 'has not made up her mind';
}


// ===================================================================== for display

export interface GameView {
  title: string;
  plays: number;
  /** -100..100 */
  like: number;
  feeling: string;
  /** Who made it, if she knows, and where, if she knows that too. */
  maker?: string;
  where?: string;
}

/** The games she has played most, for the status panel. */
export function gameViews(w: World, limit = 6): GameView[] {
  return Object.values(w.mind.games ?? {})
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit)
    .map((g) => {
      const n = g.creator ? w.npcs[g.creator] : undefined;
      const loc = n && g.located && n.alive ? w.locations[n.locationId] : undefined;
      return { title: g.title, plays: g.plays, like: Math.round(g.like * 100), feeling: feeling(g), ...(n ? { maker: n.alive ? n.name : `${n.name} (dead)` } : {}), ...(loc ? { where: loc.name } : {}) };
    });
}
