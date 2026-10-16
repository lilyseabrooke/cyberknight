import { DRIVES, type Drive } from './personality';
import { SKILL_IDS, SKILLS } from './content/skills';
import { skillLevel } from './skills';
import type { Ctx, Hero, World } from './types';

/**
 * Affordances: what a place lets you do, written down as data so it can be read as well as run.
 *
 * Every kind of location (a gym, a bar, a clinic...) has a list of rows. A row says where it applies, which
 * capabilities it draws on, what that capability notices about the place, what it does and what it can cost. The
 * capabilities are an **open set**: skills, stats, drives, items, implants, tags, goals. Nothing here (or in a row) names
 * a class of player. Requirements are *soft*: anyone can try anything, and the skills named in `needs` move the odds
 * (see `odds` and `synergy` in skills.ts). New capabilities and new rows can be added at any time; `coverage` then shows
 * which capabilities a kind of place still has nothing for.
 *
 * Rows are turned into `Candidate`s by the place's own module (gym.ts for gyms), which knows how to read its places.
 *
 *     affordance:
 *       id            unique, kebab-case
 *       place         the kind of location it belongs to ('gym')
 *       where         the features / rooms / variants / traits / situations that switch it on (all optional, ANDed)
 *       needs         capabilities it draws on: skill:x  stat:x  drive:x  item:x  implant:x  tag:x  goal:x
 *       sees          one line: what that capability notices here (the "lens")
 *       stakes        what it can win and lose, in the world's terms
 *       consequence   what the world remembers
 *       drives        what makes it appealing to her right now
 *       ok / run      extra availability; what it does
 */

/** `kind:id`, e.g. `skill:lockpicking`, `stat:hack`, `drive:greed`, `item:vintage_guitar`, `goal:kill`. */
export type Need = `${'skill' | 'stat' | 'drive' | 'item' | 'implant' | 'tag' | 'goal'}:${string}`;

export interface Where {
  /** Any of these features must be in the room she's in. */
  feature?: string | string[];
  /** She must be in one of these rooms ("floor" is the main floor). */
  room?: string | string[];
  /** Any of these variants. */
  variant?: string | string[];
  /** The place has any of these traits. */
  trait?: string | string[];
  /** Any of these situation tags is happening right now. */
  situation?: string | string[];
  /** The place has any of these wild cards. */
  wild?: string | string[];
}

export interface Affordance<V = unknown> {
  id: string;
  place: string;
  where: Where;
  needs: Need[];
  sees: string;
  stakes: string;
  consequence?: string;
  drives: Partial<Record<Drive, number>>;
  bonus?: number;
  /** A desire adjustment that depends on the moment (what she is carrying, what is on the shelf). Added to `bonus`. */
  appeal?(w: World, v: V, feature?: string): number;
  risk?: number;
  /** A line told when she sets about it. */
  intent?: string[];
  /** How long it takes and how the AI treats it: a glance, a session (the default), or a scrap. */
  pace?: 'quick' | 'session' | 'fight';
  /** One candidate per matching feature rather than one for the lot. `run` is told which. */
  each?: boolean;
  /** For `each` rows: capabilities that depend on the feature (a rig trains different things than a bag). */
  needsFrom?(feature: string): Need[];
  ok?(w: World, v: V, feature?: string): boolean;
  run(c: Ctx, v: V, feature?: string): void;
}

const registry: Record<string, Affordance<any>[]> = {};

/** Add rows for a kind of place. Ids must be unique within it. */
export function register<V>(place: string, rows: Affordance<V>[]): void {
  const list = (registry[place] ??= []);
  for (const r of rows) {
    if (list.some((x) => x.id === r.id)) throw new Error(`duplicate affordance ${place}/${r.id}`);
    list.push(r);
  }
}

export const affordancesFor = (place: string): Affordance<any>[] => registry[place] ?? [];
export const places = (): string[] => Object.keys(registry);

const asArray = (x: string | string[] | undefined): string[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
export const anyOf = (want: string | string[] | undefined, have: readonly string[]): boolean => {
  const w = asArray(want);
  return !w.length || w.some((x) => have.includes(x));
};

/**
 * How strongly her abilities pull her toward something: the average of her relevant skill levels (0..8) and stats
 * (0..10), scaled to a small desire bonus. A thief notices the lockers more than a singer does, without anyone
 * writing "thief" anywhere.
 */
export function capabilityPull(h: Hero, needs: readonly Need[]): number {
  const vals: number[] = [];
  for (const n of needs) {
    const [kind, id] = n.split(':') as [string, string];
    if (kind === 'skill' && id in SKILLS) vals.push(skillLevel(h, id as keyof typeof SKILLS) / 8);
    else if (kind === 'stat') vals.push(Math.min(10, Math.max(0, (h as unknown as Record<string, number>)[id] ?? 0)) / 10);
    else if (kind === 'implant') vals.push(id === 'any' ? Math.min(1, h.implants.length / 2) : h.implants.some((i) => i === id) ? 1 : 0);
    else if (kind === 'item') vals.push(h.inventory.some((i) => i.id === id || i.tags.includes(id)) ? 1 : 0);
  }
  if (!vals.length) return 0;
  return Math.min(0.6, (vals.reduce((s, x) => s + x, 0) / vals.length) * 0.6);
}

// ===================================================================== coverage

/** Everything a place could be asked about: the live skills, stats and drives. Grows with the game. */
export function knownCapabilities(): Need[] {
  const out: Need[] = [];
  for (const s of SKILL_IDS) out.push(`skill:${s}`);
  for (const s of ['muscle', 'reflex', 'hack', 'charm']) out.push(`stat:${s}`);
  for (const d of DRIVES) out.push(`drive:${d}`);
  return out;
}

export interface CoverageRow {
  capability: Need;
  /** How many rows draw on it, by place. */
  counts: Record<string, number>;
}

/** capability x place matrix. `ids` lists the rows behind each count. */
export function coverage(featureIds: Record<string, string[]> = {}): { rows: CoverageRow[]; places: string[]; ids: Record<string, string[]> } {
  const ps = places();
  const ids: Record<string, string[]> = {};
  const rows = knownCapabilities().map((capability) => {
    const counts: Record<string, number> = {};
    for (const p of ps) {
      const hit = affordancesFor(p).filter((a) => {
        const needs = [...a.needs, ...(a.each && a.needsFrom ? (featureIds[p] ?? []).flatMap((f) => a.needsFrom!(f)) : [])];
        return needs.includes(capability);
      });
      counts[p] = hit.length;
      ids[`${capability}@${p}`] = hit.map((a) => a.id);
    }
    return { capability, counts };
  });
  return { rows, places: ps, ids };
}

/** Capabilities with nothing at all at a place. */
export const uncovered = (place: string, featureIds: string[] = []): Need[] => coverage({ [place]: featureIds }).rows.filter((r) => !r.counts[place]).map((r) => r.capability);
