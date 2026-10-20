import type { Candidate } from './candidate';
import type { Ctx, Id, Location, Mission, Npc, World } from './types';
import type { Trait } from './personality';
import type { Rng } from './rng';
import { clamp } from './candidate';
import { sayAs } from './placekit';
import { bestTrait } from './instruments';
import { skillValue } from './skills';
import { routeTo } from './plans';

/**
 * What a mission is made of, and the small tools its stages are written with. A mission's definition (content/missions/) is data
 * plus a handful of functions; the runtime that steps them, hooks them into her mind and remembers them is missions.ts.
 */

/** How a mission first reaches her. */
export type MissionEntry = 'after_set' | 'grapevine' | 'object';

/** One stage: what she'd call it, where it wants her, what she can do about it, and what the world does meanwhile. */
export interface StageDef {
  /** As a goal, in her words. */
  label(w: World, m: Mission): string;
  /** Where it wants her, if anywhere. Nothing pulls while the stage is waiting (`Mission.waitUntil`). */
  where?(w: World, m: Mission): Id | null;
  /** What she can do about it here and now. Keys from `actKey`, so the mission goal leans on them. */
  candidates?(w: World, m: Mission): Candidate[];
  /** Each beat, while she knows about it: the world's side of the stage (a fork to decide, something done elsewhere). */
  tick?(c: Ctx, m: Mission): void;
  /** She has just played a set somewhere. */
  afterSet?(c: Ctx, m: Mission, act: string, good: boolean): void;
}

export interface MissionDef {
  id: string;
  title: string;
  /** The track it hangs off, if any. A mission is never boxed in by it: anything can happen in one. */
  track?: string;
  /** The ways it can reach her, and how keen each is when the moment comes (a chance, per chance). */
  entries: Partial<Record<MissionEntry, number>>;
  /** Could one start now? (Has she the name for it; is one already going.) */
  eligible(w: World): boolean;
  /** Cast and places, rolled on the mission's own stream. False if the world can't host it yet. */
  roll(w: World, rng: Rng, m: Mission): boolean;
  /** The stage it starts at. */
  first: string;
  stages: Record<string, StageDef>;
  /** Traits that make her want to see it through. */
  stick: Partial<Record<Trait, number>>;
  /** The names a line can use. */
  tokens(w: World, m: Mission): Record<string, string | number>;
  /** How she hears of it, by way in ('reminded' is somebody bringing it up with a body that doesn't know). */
  hook(w: World, m: Mission, via: string): { text: readonly string[]; thought?: readonly string[]; npc?: Npc };
  /** The cast roles who bring it up again with a new body that has never heard of it. */
  remembers: string[];
  /** Every beat, known or not: the world's side of the whole mission (somebody in it has died). */
  watch?(c: Ctx, m: Mission): void;
  /** A fork has been decided, by the lab or by her. */
  resolve?(c: Ctx, m: Mission, pick: string): void;
}

// ===================================================================== reading a mission

export const castOf = (w: World, m: Mission, role: string): Npc | undefined => (m.cast[role] ? w.npcs[m.cast[role]!] : undefined);
export const placeOf = (w: World, m: Mission, role: string): Location | undefined => (m.places[role] ? w.locations[m.places[role]!] : undefined);
/** Is the stage on hold (somebody needs a day; the gig is tomorrow)? */
export const waiting = (w: World, m: Mission): boolean => (m.waitUntil ?? 0) > w.clock;
/** Somebody in it is standing where she is, alive and on their feet. */
export const presentHere = (w: World, n: Npc | undefined): n is Npc => !!n && n.alive && n.locationId === w.hero.locationId && !((n.downUntil ?? 0) > w.clock);
export const flag = (m: Mission, k: string): number => Number(m.flags[k] ?? 0);
export const bump = (m: Mission, k: string, by = 1): number => (m.flags[k] = flag(m, k) + by);

/** A candidate's key: the mission family, the mission, and what she does. The mission goal leans on the family and the id. */
export const actKey = (m: Mission, act: string): string => `mission:${m.id}:${act}`;

// ===================================================================== moving it along

/** On to the next stage, maybe not before some world minutes have gone by. */
export function advance(w: World, m: Mission, stage: string, waitMinutes = 0): void {
  m.stage = stage;
  m.waitUntil = waitMinutes > 0 ? w.clock + waitMinutes : undefined;
  m.flags[`at_${stage}`] = w.clock;
}

/** Not yet: come back after this many world minutes. */
export function hold(w: World, m: Mission, minutes: number): void {
  m.waitUntil = w.clock + minutes;
}

/** It's over, one way or another. Her mind lets go of it on the next look (missions.ts). */
export function finish(w: World, m: Mission, ending: string): void {
  m.ending = ending;
  m.waitUntil = undefined;
  m.flags.endedAt = w.clock;
}

/** Tell the log, in the mission's own words: `{token}` from the definition's tokens, `{they}` for the person in `npc`. */
export function tell(c: Ctx, def: MissionDef, m: Mission, variant: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts?: readonly string[], extra: Record<string, string | number | boolean> = {}): void {
  const tok = def.tokens(c.w, m);
  // The tokens ride along as data, for whatever else reads the event (a song title). `npc` names the person `{they}` and the like
  // are about: the emit stamps their pronouns from it.
  sayAs('mission', c, variant, outcome, lines, thoughts, tok, { ...tok, mission: m.id, title: def.title, ...extra });
}

// ===================================================================== rolls and places

/**
 * Her guitar against a grade, the way she plays a dragon (dragonsong.ts): about even when she's as good as the bar is high, and
 * a loud or signature guitar in her hands helps. No gates: anyone with a guitar can try.
 */
export function guitarOdds(w: World, grade: number, bonus = 0): number {
  const h = w.hero;
  const gear = bestTrait(h, 'guitar', 'tone') + bestTrait(h, 'guitar', 'signature') + 0.5 * bestTrait(h, 'guitar', 'volume');
  return clamp(0.45 + 0.03 * (skillValue(h, 'guitar') - grade) + 0.04 * gear + bonus, 0.03, 0.92);
}

/**
 * A place for a mission, picked from the ones that already exist and pass `ok`: somewhere she can walk to from `from`, best at
 * between `near[0]` and `near[1]` steps. The list is sorted before the pick so the same stream gives the same place.
 */
export function pickPlace(w: World, rng: Rng, from: Id, ok: (l: Location) => boolean, near: [number, number], not: Id[] = []): Location | undefined {
  const options: [Location, number][] = [];
  for (const l of Object.values(w.locations)) {
    if (!ok(l) || not.includes(l.id) || l.id === from) continue;
    const r = routeTo(w, from, l.id);
    if (r) options.push([l, r.dist]);
  }
  if (!options.length) return undefined;
  options.sort((a, b) => (a[0].id < b[0].id ? -1 : a[0].id > b[0].id ? 1 : 0));
  const [lo, hi] = near;
  return rng.weighted(options, ([, d]) => (d >= lo && d <= hi ? 4 : 1) / (1 + Math.max(0, d - hi)))[0];
}
