import type { Location } from './types';
import type { RoadClass } from './roads';

/**
 * What sort of street a street is. It is data on the street (`Location.street`), set when the street is made, and everything that
 * cares (how a car takes it, what its board looks like) reads it from there. The city names its streets for what they are, so a made
 * street's type comes from its name when it is born; after that the name is only a name.
 */
export type StreetType =
  | 'highway' | 'avenue' | 'boulevard' | 'street' | 'freightway' | 'wharf'
  | 'lane' | 'row' | 'terrace' | 'run' | 'yard'
  | 'walk' | 'arcade' | 'plaza' | 'concourse' | 'bazaar'
  | 'alley' | 'passage' | 'roof';

export const STREET_TYPES: readonly StreetType[] = [
  'highway', 'avenue', 'boulevard', 'street', 'freightway', 'wharf', 'lane', 'row', 'terrace', 'run', 'yard',
  'walk', 'arcade', 'plaza', 'concourse', 'bazaar', 'alley', 'passage', 'roof',
];

/** The last word of a name, for the words that say what a street is. */
const BY_WORD: Record<string, StreetType> = {
  avenue: 'avenue', boulevard: 'boulevard', street: 'street', freightway: 'freightway', wharf: 'wharf',
  lane: 'lane', row: 'row', terrace: 'terrace', run: 'run', way: 'run', yard: 'yard',
  walk: 'walk', arcade: 'arcade', plaza: 'plaza', concourse: 'concourse', bazaar: 'bazaar', market: 'bazaar',
  alley: 'alley', passage: 'passage', roof: 'roof',
};

/** What a name says about a street: what the city calls it. A made street with a name that says nothing is an ordinary street; a hand-built one a small one. */
export function typeFromName(name: string, made: boolean): StreetType {
  const last = name.split(/[\s,]+/).filter(Boolean).pop()?.toLowerCase() ?? '';
  return BY_WORD[last] ?? (made ? 'street' : 'lane');
}

/** How a car takes each kind of street (see `roadClass` in roads.ts). */
export const CLASS_OF: Record<StreetType, RoadClass> = {
  highway: 'highway',
  street: 'street', avenue: 'street', boulevard: 'street', freightway: 'street', wharf: 'street',
  lane: 'small', row: 'small', terrace: 'small', run: 'small', yard: 'small', roof: 'small',
  walk: 'pedestrian', arcade: 'pedestrian', plaza: 'pedestrian', concourse: 'pedestrian', bazaar: 'pedestrian',
  alley: 'alley', passage: 'alley',
};

/** The type of this street: the one it was given, or (for a place made before streets had one) what its name says. */
export function streetTypeOf(loc: Pick<Location, 'name' | 'road' | 'gen' | 'street'>): StreetType {
  return loc.street ?? (loc.road === 'highway' ? 'highway' : typeFromName(loc.name, !!loc.gen));
}
