import type { Ctx, Id, Location, Npc, VenueInfo, VenueKind, World } from './types';
import type { Candidate } from './candidate';
import { affordancesFor, anyOf, capabilityPull, type Affordance, type Where } from './affordances';
import { featuresOf, venueSituation, type SituationDef, type VariantDef, type VenueTables } from './content/venues';
import { VENUES } from './content/venuetables';
import { dayOf } from './clock';
import { isFairGame } from './people';
import { npcsAt } from './population';
import { friendly, runCheckAs, sayAs, type Check, type Kit, type PlaceView, type Result } from './placekit';

export { friendly };

/**
 * Everything the music venues share: how to read the one she is standing in, who is in it, how to run a row described as
 * data, how the registry rows become candidates. Each kind (studio.ts, cutting.ts...) adds its own system on top, and its
 * own rows (`register(kind, rows)`), and nothing here knows which kind it is looking at.
 *
 * Candidate keys are `<kind>` (a session), `<kind>quick` (a glance), `<kind>fight` (a scrap) and `<kind>deal` (the place's
 * core business), so the clock and the AI treat them right.
 */

export interface VenueView extends PlaceView {
  kind: VenueKind;
  info: VenueInfo;
  sit?: { id: string; def: SituationDef };
  v: VariantDef;
  t: VenueTables;
  day: number;
}

export const tablesOf = (kind: VenueKind): VenueTables => VENUES[kind]!;

/** The venue at `at` (where she is, by default), if it is one, and optionally only of one kind. */
export function venueAt(w: World, kind?: VenueKind, at: Id = w.hero.locationId): VenueView | undefined {
  const loc = w.locations[at];
  const info = loc?.venue;
  if (!loc || !info || (kind && info.kind !== kind)) return undefined;
  const t = VENUES[info.kind];
  const v = t?.variants[info.variant];
  if (!t || !v) return undefined;
  return { loc, main: loc, room: 'floor', features: featuresOf(t, info), sit: venueSituation(t, w, loc), people: npcsAt(w, loc.id), info, v, t, kind: info.kind, day: dayOf(w.clock) };
}

/**
 * Who: `owner`, `staff`, `guard`, `regular`, `fair`, `any`, `none`, or `tag:<t>` / `arch:<archetype>` for anyone more
 * particular (the engineer, the session player).
 */
export function find(v: PlaceView, who: string | undefined, rng?: { pick<T>(xs: T[]): T }): Npc | undefined {
  if (!who || who === 'none') return undefined;
  const pool = v.people.filter(friendly);
  let xs: Npc[];
  if (who.startsWith('tag:')) xs = pool.filter((n) => n.tags.includes(who.slice(4)));
  else if (who.startsWith('arch:')) xs = pool.filter((n) => n.archetype === who.slice(5));
  else if (who === 'owner') xs = pool.filter((n) => n.tags.includes('owner'));
  else if (who === 'staff') xs = pool.filter((n) => n.tags.includes('staff'));
  else if (who === 'guard') xs = pool.filter((n) => n.tags.includes('guard') || n.tags.includes('security'));
  else if (who === 'regular') xs = pool.filter((n) => n.tags.includes('regular') || n.ephemeral);
  else if (who === 'fair') xs = pool.filter((n) => isFairGame(n));
  else if (who === 'any') xs = pool;
  else return undefined;
  if (!xs.length) return undefined;
  return rng ? rng.pick(xs) : xs[0];
}

export const hasSituation = (v: PlaceView, tag: string): boolean => !!v.sit?.def.tags.includes(tag);
export const banned = (w: Pick<World, 'counters'>, main: Location): boolean => !!w.counters[`venueban:${main.id}`];
export const ban = (c: Ctx, v: PlaceView): void => {
  c.w.counters[`venueban:${v.main.id}`] = 1;
};

/** Tell a line under the venue's own event. */
export const say = (c: Ctx, v: VenueView, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[] | undefined, tok: Record<string, string | number>, extra: Record<string, string | number | boolean> = {}): void =>
  sayAs(v.kind, c, id, outcome, lines, thoughts, { venue: v.main.name, ...tok }, { place: v.main.name, ...extra });

const KITS: Partial<Record<VenueKind, Kit<VenueView>>> = {};
export function kitOf(kind: VenueKind): Kit<VenueView> {
  return (KITS[kind] ??= {
    event: kind,
    name: 'venue',
    fame: kind,
    cause: `a scene at ${tablesOf(kind)?.label ?? 'a venue'}`,
    messed: `was messed about by Blackbird at ${tablesOf(kind)?.label ?? 'a venue'}`,
    find,
    owner: (v) => v.people.find((n) => n.tags.includes('owner')),
    trap: (v) => v.info.wild === 'cursed' || v.info.wild === 'haunted',
    trapText: 'Something in the place bit back.',
  });
}

export const runCheck = (c: Ctx, v: VenueView, id: string, k: Check): void => runCheckAs(kitOf(v.kind), c, v, id, k);

export const R = (text: string[], o: Partial<Result> = {}): Result => ({ text, ...o });

type RowIn = Omit<Affordance<VenueView>, 'place' | 'run'> & { check?: Check; run?: Affordance<VenueView>['run'] };
/** A row-maker for one kind of venue. Rows with a `check` run it; the rest bring their own `run`. */
export const rowFor = (kind: VenueKind) => (a: RowIn): Affordance<VenueView> => ({ ...a, place: kind, run: a.run ?? ((c, v) => runCheck(c, v, a.id, a.check!)) });

const KEY = (kind: VenueKind) => ({ quick: `${kind}quick`, session: kind, fight: `${kind}fight`, deal: `${kind}deal` }) as const;

function matchingFeatures(where: Where, v: Pick<VenueView, 'features' | 't'>): string[] | null {
  if (where.feature === undefined) return [];
  const want = Array.isArray(where.feature) ? where.feature : [where.feature];
  const have = v.features.filter((f) => want.includes(f) && v.t.features[f]);
  return have.length ? have : null;
}

export function fits(where: Where, v: Pick<VenueView, 'room' | 'info' | 'sit'>): boolean {
  if (!anyOf(where.room, [v.room])) return false;
  if (!anyOf(where.variant, [v.info.variant])) return false;
  if (where.trait !== undefined && !anyOf(where.trait, v.info.traits)) return false;
  if (where.situation !== undefined && !anyOf(where.situation, v.sit?.def.tags ?? [])) return false;
  if (where.wild !== undefined && !anyOf(where.wild, v.info.wild ? [v.info.wild] : [])) return false;
  return true;
}

/** The registry rows of the venue she is standing in, as candidates. The kind's own deals are added by its module. */
export function rowCandidates(w: World, v: VenueView): Candidate[] {
  const out: Candidate[] = [];
  const keys = KEY(v.kind);
  for (const a of affordancesFor(v.kind) as Affordance<VenueView>[]) {
    if (!fits(a.where, v)) continue;
    const feats = matchingFeatures(a.where, v);
    if (feats === null) continue;
    const list: (string | undefined)[] = a.each ? feats : [undefined];
    for (const f of list) {
      if (a.ok && !a.ok(w, v, f)) continue;
      const appeal = a.appeal ? a.appeal(w, v, f) : 0;
      if (appeal <= -1) continue;
      const needs = [...a.needs, ...(f && a.needsFrom ? a.needsFrom(f) : [])];
      const line = a.intent?.length ? a.intent[w.beat % a.intent.length]!.replace('{venue}', v.main.name) : undefined;
      out.push({
        key: `${keys[a.pace ?? 'session']}:${a.id}${f ? `:${f}` : ''}`,
        drives: a.drives,
        bonus: (a.bonus ?? 0) + appeal + capabilityPull(w.hero, needs),
        ...(a.risk !== undefined ? { risk: a.risk } : {}),
        ...(line ? { intent: { text: line } } : {}),
        run: (c) => {
          const now = venueAt(c.w, v.kind) ?? v;
          a.run(c, now, f);
        },
      });
    }
  }
  return out;
}

/** What a venue of this makeup offers (for tools and tests): the rows that fit, ignoring money and who is standing there. */
export function describeVenue(info: VenueInfo, situation: string[] = []): string[] {
  const t = VENUES[info.kind]!;
  const v = { info, room: 'floor', features: featuresOf(t, info), t, sit: situation.length ? { id: situation[0]!, def: { tags: situation } } : undefined } as unknown as VenueView;
  const rows: string[] = [];
  for (const a of affordancesFor(info.kind) as Affordance<VenueView>[]) {
    if (!fits(a.where, v)) continue;
    const feats = matchingFeatures(a.where, v);
    if (feats === null) continue;
    rows.push(a.each ? `${a.id}×${feats.length}` : a.id);
  }
  return rows;
}

/** A tidy number: never below five, rounded to fives. */
export const nearest5 = (n: number): number => Math.max(5, Math.round(n / 5) * 5);
