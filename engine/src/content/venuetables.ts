import type { VenueKind } from '../types';
import type { VenueTables } from './venues';
import { STUDIO } from './studios';
import { CUTTING } from './cuttings';
import { MUSEHQ } from './musehqs';
import { LUTHIER } from './luthiers';
import { FANCLUB } from './fanclubs';
import { ARENA } from './arenas';

/**
 * Every kind of music venue, by kind. mapgen rolls them in `VENUE_ORDER`, each on its own stream and in its own slot after
 * everything else on a street, so adding one never changes a map that already exists. Append new kinds at the end.
 */
export const VENUES: Partial<Record<VenueKind, VenueTables>> = {
  studio: STUDIO,
  cutting: CUTTING,
  musehq: MUSEHQ,
  luthier: LUTHIER,
  // Never rolled with the map (its chance is 0 everywhere and it is not in VENUE_ORDER): her fans open them (fanclub.ts).
  fanclub: FANCLUB,
  arena: ARENA,
};

/** The order they are rolled onto a street. Never reorder: append. */
export const VENUE_ORDER: VenueKind[] = ['studio', 'cutting', 'musehq', 'luthier', 'arena'];
