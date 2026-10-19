import type { Deed, Id, Location, World } from './types';

/**
 * Deeds: the homes she has bought (realty.ts), kept in `legacy.deeds` so they outlive her. The home itself is a place on the
 * map like any other, made when she bought it; this is just the book of what is hers.
 */

export const deedsOf = (w: Pick<World, 'legacy'>): Deed[] => w.legacy.deeds ?? [];

/** The deed whose home this is, if it is hers. */
export const homeDeed = (w: Pick<World, 'legacy'>, loc: Pick<Location, 'id'>): Deed | null => deedsOf(w).find((d) => d.home === loc.id) ?? null;

export const isSold = (w: Pick<World, 'legacy'>, listing: Id): boolean => deedsOf(w).some((d) => d.id === listing);

/** The homes she owns, best bed first. */
export const ownedHomes = (w: Pick<World, 'legacy'>): Deed[] => [...deedsOf(w)].sort((a, b) => b.quality - a.quality);
