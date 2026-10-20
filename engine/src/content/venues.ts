import { Rng } from '../rng';
import { MIN_PER_DAY } from '../clock';
import type { District, Location, VenueInfo, VenueKind, World } from '../types';
import type { SlotDef } from '../roster';
import { CONDITIONS } from './gyms';

/**
 * The music venues: a recording studio, a cutting room, a luthier, Muse Tower, an arena, a fan club. They are six kinds of
 * place with one shape, so they share the machinery here (what a table looks like, how a place is rolled from it, what is
 * happening there today) and in venuekit.ts (how she reads one and what she can do there). Each kind brings its own tables
 * (content/studios.ts and friends), its own rows and its own system on top.
 *
 * Like every other place, a venue is not one of a few kinds: it is a point rolled from independent axes, so any combination
 * can turn up (an immaculate tier-1 pressing plant in a flooded chapel that is secretly a Muse front and has a ghost on tape).
 *
 *   variant     what it mostly is
 *   shell       what building it is in
 *   size        how many things it has (0 a closet .. 4 a sprawl)
 *   condition   derelict .. immaculate (shared with gyms)
 *   tier        1..5: staff quality and prices. Independent of everything else
 *   traits      0-3 oddities from a long list; they may contradict each other and that is fine
 *   features    objects on the floor; what she can do here hangs off these
 *   situation   something happening right now; a pure function of the clock, so it needs no saved state
 *   wild        one in twelve has a rule-breaking oddity
 *
 * Every table is open: add a row and it can turn up. Ids that a saved world mentions but the tables no longer know are
 * ignored, never an error. Nothing here is balanced against anything else, on purpose.
 */

export interface VariantDef {
  label: string;
  /** Names, plain or with a `{n}` that becomes a number. */
  names: string[];
  blurbs: string[];
  /** The wallpaper: the Atlas poster, the Muse sticker. */
  wall: string[];
  /** Multiplier on what things cost here. */
  price: number;
  /** Features it always has. */
  floor: string[];
  /** Weights on the features it draws at random (absent means the feature's own). */
  more: Record<string, number>;
  /** Security before condition, shell and traits. */
  sec: number;
  /** Chance it is crowded, before size. */
  crowd: number;
  /** Opening hours, if not the kind's own. */
  hours?: [number, number];
}

export interface ShellDef {
  label: string;
  line: string;
  sec: number;
  weight?: number;
  add?: string[];
}

export interface FeatureDef {
  label: string;
  /** Weight in the random draw. 0 = only when something adds it. */
  base: number;
  /** What a glance at it tells you. */
  line: string;
}

export interface TraitDef {
  label: string;
  line: string;
  price?: number;
  sec?: number;
  weight?: number;
  add?: string[];
  /** Only these variants. */
  only?: string[];
}

export interface SituationDef {
  label: string;
  line: string;
  weight: number;
  /** Tags rows can require (`where.situation`). */
  tags: string[];
  not?: string[];
  only?: string[];
  price?: number;
  fame?: number;
  purse?: number;
}

export interface WildDef {
  label: string;
  line: string;
  weight: number;
  /** Features it adds. */
  add?: string[];
}

/** Everything one kind of venue is made of. */
export interface VenueTables {
  kind: VenueKind;
  /** "a recording studio". */
  label: string;
  /** Chance a street has one, by district. 0 everywhere for a kind that is not rolled with the map (the fan club). */
  chance: Record<District, number>;
  /** Which variant, by district. Absent means 1. */
  lean: Record<District, Record<string, number>>;
  variants: Record<string, VariantDef>;
  shells: Record<string, ShellDef>;
  features: Record<string, FeatureDef>;
  traits: Record<string, TraitDef>;
  situations: Record<string, SituationDef>;
  wild: Record<string, WildDef>;
  /** Who works and drinks there. */
  roster(loc: Location, info: VenueInfo): SlotDef[];
  /** Opening hours. */
  hours: [number, number];
  /** How much a set here is worth (stage.ts `prestige`). */
  prestige: number;
  /** How long a situation lasts, in days. */
  epoch?: number;
  /** Chance there is any situation at all. */
  sitChance?: number;
  /** Anything else the kind rolls once with the place (a gate, a bench), from the same stream, after everything else. */
  extra?(rng: Rng, info: VenueInfo): Record<string, number | string>;
  /** A last line for the blurb, from the finished info. */
  tail?(info: VenueInfo): string;
  /** Tags the hour of the day adds to whatever is on (an arena's load-in, doors, encore). A pure function of the clock. */
  phase?(clock: number): string[];
  /** How likely each size is (closet .. sprawl), if not the usual. */
  sizes?: [number, number, number, number, number];
  /** Every tag `phase` can add, so rows can name them. */
  phaseTags?: readonly string[];
}

export const SIZES = [
  { label: 'a closet', features: [2, 3], crowd: 0.4, people: 2 },
  { label: 'small', features: [3, 5], crowd: 0.7, people: 3 },
  { label: 'medium', features: [5, 7], crowd: 1, people: 4 },
  { label: 'large', features: [7, 10], crowd: 1.3, people: 5 },
  { label: 'a sprawl', features: [10, 14], crowd: 1.6, people: 7 },
] as const;

export interface RolledVenue {
  info: VenueInfo;
  name: string;
  blurb: string;
  security: number;
  crowded: boolean;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => rng.pick(xs as T[]);

export const traitProd = (t: VenueTables, info: Pick<VenueInfo, 'traits'>, key: 'price'): number => info.traits.reduce((m, id) => m * (t.traits[id]?.[key] ?? 1), 1);

/** A venue, whole, from its own stream and in a fixed order. Pure. */
export function rollVenue(t: VenueTables, rng: Rng, district: District, depth: number): RolledVenue {
  const weights = t.lean[district] ?? {};
  const variant = rng.weighted(Object.keys(t.variants), (k) => weights[k] ?? 1);
  const v = t.variants[variant]!;
  const shell = rng.weighted(Object.keys(t.shells), (k) => t.shells[k]!.weight ?? 1);
  const sh = t.shells[shell]!;
  const size = rng.weighted([0, 1, 2, 3, 4], (i) => (t.sizes ?? [1.2, 2.6, 3, 1.6, 0.5])[i]!);
  const condition = rng.weighted([0, 1, 2, 3, 4], (i) => [1, 2.5, 3, 1.4, 0.6][i]! * (district === 'corporate' ? (i >= 3 ? 3 : 0.4) : district === 'slum' ? (i <= 1 ? 3 : 0.4) : 1));
  const tier = Math.max(1, Math.min(5, rng.int(1, 5) + (depth >= 6 ? 1 : 0) - (depth <= 1 ? 1 : 0)));
  const traitIds = Object.keys(t.traits).filter((id) => !t.traits[id]!.only || t.traits[id]!.only!.includes(variant));
  const nTraits = rng.weighted([0, 1, 2, 3], (i) => [3, 4, 2.5, 1][i]!);
  const traits: string[] = [];
  for (let i = 0; i < nTraits; i++) {
    const id = rng.weighted(traitIds, (k) => (traits.includes(k) ? 0 : t.traits[k]!.weight ?? 1));
    if (!traits.includes(id)) traits.push(id);
  }
  const wild = rng.chance(1 / 12) ? rng.weighted(Object.keys(t.wild), (k) => t.wild[k]!.weight) : undefined;

  const features: string[] = [];
  const add = (f: string): void => {
    if (t.features[f] && !features.includes(f)) features.push(f);
  };
  for (const f of v.floor) add(f);
  for (const f of sh.add ?? []) add(f);
  for (const id of traits) for (const f of t.traits[id]!.add ?? []) add(f);
  for (const f of (wild && t.wild[wild]!.add) || []) add(f);
  const pool = Object.keys(t.features).filter((f) => t.features[f]!.base > 0 || (v.more[f] ?? 0) > 0);
  const [flo, fhi] = SIZES[size]!.features;
  const want = rng.int(flo, fhi);
  for (let i = 0; i < want * 3 && features.length < want; i++) add(rng.weighted(pool, (k) => v.more[k] ?? t.features[k]!.base));

  const info: VenueInfo = { kind: t.kind, variant, shell, size, condition, tier, traits, features, ...(wild ? { wild } : {}) };
  const keep = t.extra?.(rng, info);
  if (keep && Object.keys(keep).length) info.keep = keep;

  const name = pick(rng, v.names).replace('{n}', String(rng.int(2, 99)));
  const cond = CONDITIONS[condition]!;
  const security = Math.max(0, v.sec + sh.sec + cond.sec + traits.reduce((s, id) => s + (t.traits[id]!.sec ?? 0), 0) + rng.int(0, 1));
  const crowded = rng.chance(Math.min(0.9, v.crowd * SIZES[size]!.crowd));
  const extras = [sh.line, ...traits.map((id) => t.traits[id]!.line), pick(rng, v.wall), cond.line, wild ? t.wild[wild]!.line : ''].filter(Boolean);
  const blurb = [pick(rng, v.blurbs).replace('{name}', name), pick(rng, extras), t.tail?.(info) ?? ''].filter(Boolean).join(' ');
  return { info, name, blurb, security, crowded };
}

/** Today's situation at a venue: a pure function of the clock and the place's own id, so it can never desync. */
export function venueSituation(t: VenueTables, w: Pick<World, 'worldSeed' | 'clock'>, loc: Location): { id: string; def: SituationDef } | undefined {
  const info = loc.venue;
  if (!info) return undefined;
  const epoch = Math.floor(w.clock / (MIN_PER_DAY * (t.epoch ?? 2)));
  const rng = new Rng(`${t.kind}sit:${w.worldSeed}:${loc.id}:${epoch}`);
  if (!rng.chance(t.sitChance ?? 0.6)) return undefined;
  const ids = Object.keys(t.situations).filter((id) => {
    const s = t.situations[id]!;
    return !s.not?.includes(info.variant) && (!s.only || s.only.includes(info.variant));
  });
  if (!ids.length) return undefined;
  const id = rng.weighted(ids, (k) => t.situations[k]!.weight);
  const def = t.situations[id]!;
  const phase = t.phase?.(w.clock);
  return { id, def: phase?.length ? { ...def, tags: [...def.tags, ...phase] } : def };
}

export const featuresOf = (t: VenueTables, info: VenueInfo): string[] => info.features.filter((f) => t.features[f]);
