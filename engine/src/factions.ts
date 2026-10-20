import type { Rng } from './rng';
import type { Id, Location, Npc, World } from './types';

/**
 * Factions as records. People belong to one (`Npc.faction`), places lean towards some
 * (`Location.influence`), and factions have standing with each other. The default opinion of one
 * person for another comes from that standing, so nobody needs a stored opinion of everybody.
 * Personal opinions (ties) only exist where something made them; see the notes in DESIGN.md.
 */

export type FactionKind = 'gang' | 'corp' | 'police' | 'venue' | 'shop';

export interface Faction {
  id: Id;
  name: string;
  kind: FactionKind;
  /** Standing with other factions, -100 (at war) to 100 (one family). Looked up either way round. */
  relations: Record<Id, number>;
}

export const SAME_FACTION = 60;

const GANGS = ['ganger', 'vipers', 'sixers', 'marrow', 'choir'];

/** The factions that exist when a world begins. Generated places and people draw on these. */
export function newFactions(): Record<Id, Faction> {
  const f: Record<Id, Faction> = {
    halo: { id: 'halo', name: 'The Rusty Halo', kind: 'venue', relations: { club: -15, npd: -10 } },
    club: { id: 'club', name: 'The Neon Pharaoh', kind: 'venue', relations: { npd: 5 } },
    shop: { id: 'shop', name: 'Strand Street shopkeepers', kind: 'shop', relations: { npd: 20 } },
    atlas: { id: 'atlas', name: 'Atlas', kind: 'corp', relations: { npd: 25, muse: 30 } },
    muse: { id: 'muse', name: 'Muse', kind: 'corp', relations: { npd: 20, atlas: 30 } },
    npd: { id: 'npd', name: 'Neo Protective Division', kind: 'police', relations: {} },
    ganger: { id: 'ganger', name: 'Street gangs', kind: 'gang', relations: {} },
    vipers: { id: 'vipers', name: 'Chrome Vipers', kind: 'gang', relations: {} },
    sixers: { id: 'sixers', name: 'Saint Sixers', kind: 'gang', relations: {} },
    marrow: { id: 'marrow', name: 'Neon Marrow', kind: 'gang', relations: {} },
    choir: { id: 'choir', name: 'Rust Choir', kind: 'gang', relations: {} },
  };
  for (const a of GANGS) {
    f[a]!.relations.npd = -40;
    f[a]!.relations.atlas = -20;
    for (const b of GANGS) if (a < b) f[a]!.relations[b] = -20;
  }
  return f;
}

/** Standing is mutual for now: both sides are written, so the lookup agrees from either end. */
export function setRelation(factions: Record<Id, Faction>, a: Id, b: Id, value: number): void {
  const v = Math.max(-100, Math.min(100, value));
  const fa = factions[a];
  const fb = factions[b];
  if (fa) fa.relations[b] = v;
  if (fb) fb.relations[a] = v;
}

/** How two factions stand. Same faction is family; strangers are 0. */
export function relation(w: World, a: Id | null, b: Id | null): number {
  if (!a || !b) return 0;
  if (a === b) return SAME_FACTION;
  return w.factions[a]?.relations[b] ?? w.factions[b]?.relations[a] ?? 0;
}

/**
 * What `a` makes of `b` before anything personal has happened: faction loyalty and faction
 * grudges, softened. Callers add personal history on top.
 */
export function defaultOpinion(w: World, a: Npc, b: Npc): number {
  return Math.round(relation(w, a.faction, b.faction) * 0.6);
}

/** Which factions lean on a place, summing to 1 (or empty if none do). Gang turf counts for most. */
export function influenceOf(loc: Location): Record<Id, number> {
  if (loc.influence) return loc.influence;
  return loc.territory ? { [loc.territory]: 1 } : {};
}

/**
 * Influence for a place that has just come into being: its neighbours' influence, thinned out,
 * with now and then a stranger's tag on the wall. Border districts end up mixed; the middle of a
 * territory stays itself.
 */
export function inheritInfluence(w: World, neighbours: Location[], rng: Rng): Record<Id, number> {
  const out: Record<Id, number> = {};
  for (const n of neighbours) for (const [f, v] of Object.entries(influenceOf(n))) out[f] = (out[f] ?? 0) + v / neighbours.length;
  for (const f of Object.keys(out)) out[f]! *= 0.85;
  if (rng.chance(0.2)) {
    const gangs = Object.values(w.factions).filter((f) => f.kind === 'gang' && f.id !== 'ganger' && !(f.id in out));
    if (gangs.length) out[rng.pick(gangs).id] = 0.2;
  }
  return normalise(out);
}

function normalise(m: Record<Id, number>): Record<Id, number> {
  const total = Object.values(m).reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v / total]));
}

/** A faction drawn from a place's influence, optionally limited to some kinds (gang members from gangs). */
export function pickFaction(w: World, rng: Rng, influence: Record<Id, number>, kinds?: FactionKind[]): Id | null {
  const entries = Object.entries(influence).filter(([id]) => !kinds || kinds.includes(w.factions[id]?.kind as FactionKind));
  if (!entries.length) return null;
  return rng.weighted(entries, ([, v]) => v)[0];
}
