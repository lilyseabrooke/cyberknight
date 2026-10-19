import { DEEDS, DEED_IDS, type DeedDef, type DeedId } from './content/deeds';
import type { Exit, Id, Legacy, Location, World } from './types';

/**
 * Deeds. Bought in the lab out of the account and kept in `legacy.deeds`, so they carry over between deaths. For now every deed is
 * a home: a place on Strand Street that is hers, that she can sleep in for free (see `rest.ts`), and that is made the first time
 * the city needs it and is there for good.
 */

const FROM: Id = 'street_main';

export const deedsOf = (l: Pick<Legacy, 'deeds'>): DeedId[] => l.deeds ?? [];
export const ownsDeed = (l: Pick<Legacy, 'deeds'>, id: DeedId): boolean => deedsOf(l).includes(id);

/** The deed whose home this is, if she owns it. */
export function homeDeed(w: Pick<World, 'legacy'>, loc: Pick<Location, 'id'>): DeedDef | null {
  for (const id of deedsOf(w.legacy)) if (DEEDS[id].home.id === loc.id) return DEEDS[id];
  return null;
}

/** The homes she owns, best bed first. */
export const ownedHomes = (w: Pick<World, 'legacy'>): DeedDef[] =>
  deedsOf(w.legacy).map((id) => DEEDS[id]).sort((a, b) => b.quality - a.quality);

type Map = Pick<World, 'locations'> & { legacy: Legacy };

const exit = (to: Id, label: string): Exit => ({ to, label, hidden: false, gate: null });

/** Put every home she owns on the map, and a way to it from Strand Street. Safe to call any time; it only adds what is missing. */
export function ensureHomes(u: Map): void {
  const street = u.locations[FROM];
  for (const id of deedsOf(u.legacy)) {
    const d = DEEDS[id].home;
    if (!u.locations[d.id]) {
      u.locations[d.id] = {
        id: d.id, name: d.name, kind: 'home', exits: [exit(FROM, d.out)], security: d.security, crowded: false, outdoors: false,
        tossTo: FROM, fleeTo: FROM, visits: 0, cameras: d.cameras, graffiti: 0, territory: null, populated: true, blurb: d.blurb,
      };
    }
    if (street && !street.exits.some((e) => e.to === d.id)) street.exits.push(exit(d.id, d.door));
  }
}

export type DeedResult = { ok: true; paid: number } | { ok: false; reason: 'unknown' | 'owned' | 'poor'; need?: number };

/** Buy a deed out of the account. It is hers from now on, and so is the door. */
export function buyDeed(u: Map, id: string): DeedResult {
  const def = DEEDS[id as DeedId];
  if (!def) return { ok: false, reason: 'unknown' };
  const l = u.legacy;
  if (ownsDeed(l, def.id)) return { ok: false, reason: 'owned' };
  if (l.account < def.price) return { ok: false, reason: 'poor', need: def.price - l.account };
  l.account -= def.price;
  l.spent += def.price;
  l.deeds = [...deedsOf(l), def.id];
  ensureHomes(u);
  return { ok: true, paid: def.price };
}

export { DEEDS, DEED_IDS };
export type { DeedDef, DeedId };
