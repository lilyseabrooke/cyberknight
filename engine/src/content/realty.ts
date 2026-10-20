import type { Rng } from '../rng';
import type { District } from '../types';

/**
 * Property offices, and the homes they sell. Data only; `realty.ts` is what happens in one.
 *
 * An office's listings are a pure function of the office (its id, district and depth), so the same save always shows the same
 * board; what has been sold is in `Legacy.deeds`. A deed is the home she bought, and it is hers through every death.
 * Two kinds of home, and the district decides which an office has and what they cost:
 *  - a **pod apartment** in a megablock tower: small, cheap, a lock of her own.
 *  - a **townhouse** in a gated district: a great deal of money for a great deal of quiet.
 */

export type HomeKind = 'pod' | 'townhouse';

export interface HomeType {
  id: HomeKind;
  noun: string;
  /** The kind of building, for the listing. */
  setting: string;
  /** Neodollars, before the district. */
  price: [number, number];
  /** 0..1: how good a night is here (see `content/lodging.ts`), before the district. */
  quality: [number, number];
  security: [number, number];
  cameras: number;
  /** How many companions she can post here to work while she is out (see crew.ts). */
  berths: number;
  blurbs: string[];
}

export const HOMES: Record<HomeKind, HomeType> = {
  pod: {
    id: 'pod', noun: 'pod apartment', setting: 'megablock tower', price: [700, 2200], quality: [0.76, 0.9], security: [1, 2], cameras: 0, berths: 1,
    blurbs: [
      '{name}: three metres by two, a real mattress, a hot plate and a window onto an air shaft. The lock beeps when it sees her. Nothing else in the city does.',
      '{name}: a drawer in a tower the size of a district. Hers, though. The key is on a string round her neck.',
      '{name}: a bunk, a shelf and a ventilation grille that hums in B-flat. It is quiet in the way a held breath is quiet.',
    ],
  },
  townhouse: {
    id: 'townhouse', noun: 'townhouse', setting: 'gated district', price: [6000, 20000], quality: [0.92, 1], security: [3, 5], cameras: 1, berths: 3,
    blurbs: [
      '{name}: three floors behind a gate, pale stairs, a kitchen nobody has burnt anything in and a bedroom with blackout glass and a mattress that remembers her.',
      '{name}: quiet money. A lawn the size of a parking space, a door that logs everything that touches it, and nobody at all outside.',
      '{name}: a stair, a landing, a bed designed by someone who has never once been tired in a bad way.',
    ],
  },
};

/** What the offices in a district have to sell, as odds. */
export const HOME_ODDS: Record<District, Record<HomeKind, number>> = {
  tenement: { pod: 9, townhouse: 0.3 },
  slum: { pod: 9, townhouse: 0.1 },
  industrial: { pod: 9, townhouse: 0.2 },
  market: { pod: 6, townhouse: 3 },
  nightlife: { pod: 5, townhouse: 4 },
  corporate: { pod: 2, townhouse: 8 },
};

/** What the district does to the price (x) and to how good the bed is (added). */
export const DISTRICT_PRICE: Record<District, number> = { slum: 0.55, industrial: 0.7, tenement: 0.8, market: 1.1, nightlife: 1.25, corporate: 1.7 };
export const DISTRICT_QUALITY: Record<District, number> = { slum: -0.06, industrial: -0.04, tenement: -0.02, market: 0, nightlife: -0.01, corporate: 0.03 };

/** Chance a street has a property office on it, by district. */
export const REALTY_CHANCE: Record<District, number> = { market: 0.2, nightlife: 0.12, tenement: 0.18, industrial: 0.08, corporate: 0.22, slum: 0.1 };

const OFFICE_NAMES = ['Dwell-Right Realty', 'Keyturn Property', 'Halfway Home Realty', 'Stack & Latch Lettings', 'Lintel & Sons Property', 'Nest Egg Residential', 'Deed Dept. Property Co.', 'Kerning Estates', 'Open Door Realty', 'Four Walls & A Lock'];
export const officeName = (rng: Rng): string => rng.pick(OFFICE_NAMES);

export const OFFICE_BLURBS = [
  '{name}: a glass front papered in photos of rooms, a wall screen cycling prices, and a desk with a single plant that is being kept alive on purpose.',
  '{name}: a waiting room with one chair, a coffee machine that has not worked since the spring and a framed sign that reads EVERYBODY NEEDS A DOOR.',
  '{name}: spotless, beige and quiet. Every surface has a brochure on it. Every brochure has a price in the corner, smaller than it should be.',
];

const TOWER = ['Kestrel', 'Marigold', 'Paragon', 'Sparrow', 'Lotus', 'Cobalt', 'Tangerine', 'Harmony', 'Sunrise', 'Pinwheel'];
const TOWER_TAIL = ['Megablock', 'Tower', 'Hab-Stack', 'Spire', 'Block 9'];
const GATED = ['Halcyon', 'Linden', 'Quillon', 'Meadowbank', 'Ashgrove', 'Tessellate', 'Larkspur', 'Wren'];
const GATED_TAIL = ['Row', 'Close', 'Gardens', 'Terrace', 'Mews', 'Gate'];

export interface Listing {
  /** Stable: the office and the place on its board. */
  id: string;
  kind: HomeKind;
  /** The building: "the Kestrel Megablock", "Larkspur Close". */
  building: string;
  /** What the deed calls the home: "pod 14C, Kestrel Megablock". */
  name: string;
  price: number;
  quality: number;
  security: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** One office's board. Pure: the same office always lists the same homes, in the same order. */
export function rollListings(rng: Rng, officeId: string, district: District, depth: number): Listing[] {
  const count = rng.int(2, 4);
  const odds = HOME_ODDS[district];
  const out: Listing[] = [];
  for (let i = 0; i < count; i++) {
    const kind = rng.weighted(['pod', 'townhouse'] as HomeKind[], (k) => odds[k]);
    const t = HOMES[kind];
    const skew = rng.next();
    const price = Math.round(((t.price[0] + (t.price[1] - t.price[0]) * skew * skew) * DISTRICT_PRICE[district] * (1 + 0.04 * Math.min(depth, 8))) / 10) * 10;
    // A dearer one is the better one, more often than not.
    const quality = clamp(t.quality[0] + (t.quality[1] - t.quality[0]) * (0.6 * skew + 0.4 * rng.next()) + DISTRICT_QUALITY[district], 0.55, 1);
    const building = kind === 'pod' ? `the ${rng.pick(TOWER)} ${rng.pick(TOWER_TAIL)}` : `${rng.pick(GATED)} ${rng.pick(GATED_TAIL)}`;
    const unit = kind === 'pod' ? `pod ${rng.int(2, 60)}${'ABCDEF'[rng.int(0, 5)]}` : `no. ${rng.int(1, 40)}`;
    out.push({
      id: `${officeId}#${i}`, kind, building,
      name: kind === 'pod' ? `${unit}, ${building.replace(/^the /, '')}` : `${unit} ${building}`,
      price: Math.max(50, price), quality: Math.round(quality * 100) / 100, security: rng.int(t.security[0], t.security[1]),
    });
  }
  return out;
}
