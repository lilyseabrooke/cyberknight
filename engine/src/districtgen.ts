import { Rng } from './rng';
import { CLINIC_CHANCE, CROWDED, LOTS, MOOD, STREET_SECURITY, type Lot } from './mapgen';
import type { District } from './types';

/**
 * Random districts, described by a vector rather than a label.
 *
 * A district is a point in a space of eight independent 0..1 axes (how rich, how packed, how policed, ...). Nothing
 * says "this is a market". Instead there are archetypes, which are just well-known points in that space, and a
 * district is whatever it lands near: a loud, over-policed market that is also a bit slum is simply a point that sits
 * between three of them. `blend` says how much of each it is, `dominant` is the nearest, and everything the game wants
 * to know (security, crowds, what's on the street) is read off the blend, so a mixed district behaves like a mixed
 * district rather than snapping to whichever label won.
 *
 * Pure and deterministic: the same Rng gives the same district. The prose is rolled on a fork, so rewording a line
 * never moves a district through the space. Nothing here is wired into mapgen yet (that would reshuffle every save);
 * it reads mapgen's tables, it doesn't change them.
 */

export const AXES = ['wealth', 'density', 'order', 'vice', 'industry', 'commerce', 'decay', 'underworld'] as const;
export type Axis = (typeof AXES)[number];
/** Each axis 0..1, 0.5 unremarkable. */
export type DistrictVector = Record<Axis, number>;

export const AXIS_NOTES: Record<Axis, string> = {
  wealth: 'who can afford it: 0 is scavenging, 1 is a lobby with a fountain',
  density: 'how many people per square metre of street and stairwell',
  order: 'how policed and surveilled: 0 is nobody coming, 1 is a camera per window',
  vice: 'nightlife and appetite: bars, clubs, bad ideas after dark',
  industry: 'things being made, hauled or stored',
  commerce: 'things being bought and sold, out loud',
  decay: 'neglect: broken lights, patched walls, buildings leaning on each other',
  underworld: 'how much the gangs, not the landlords, run the place',
};

const vec = (wealth: number, density: number, order: number, vice: number, industry: number, commerce: number, decay: number, underworld: number): DistrictVector =>
  ({ wealth, density, order, vice, industry, commerce, decay, underworld });

export interface Archetype {
  id: string;
  /** What to call a district that's mostly this. */
  nouns: string[];
  at: DistrictVector;
  /** The mapgen district whose tables this stands in for (lots, clinics, security, crowds). */
  base: District;
}

/** Reference points in the space, not bins: a district is described by how near it is to each. */
export const ARCHETYPES: Archetype[] = [
  { id: 'market', nouns: ['bazaar', 'market quarter', 'shopping maze', 'trading strip'], at: vec(0.45, 0.7, 0.4, 0.3, 0.2, 0.95, 0.35, 0.3), base: 'market' },
  { id: 'nightlife', nouns: ['entertainment strip', 'club district', 'after-hours quarter', 'neon mile'], at: vec(0.55, 0.65, 0.45, 0.95, 0.05, 0.55, 0.3, 0.45), base: 'nightlife' },
  { id: 'tenement', nouns: ['hab-stacks', 'tenement blocks', 'residential maze', 'rent warren'], at: vec(0.3, 0.95, 0.35, 0.2, 0.15, 0.3, 0.5, 0.3), base: 'tenement' },
  { id: 'industrial', nouns: ['freight yards', 'works', 'factory belt', 'depot zone'], at: vec(0.35, 0.2, 0.55, 0.1, 0.95, 0.3, 0.45, 0.3), base: 'industrial' },
  { id: 'corporate', nouns: ['business park', 'plaza district', 'glass canyon', 'campus quarter'], at: vec(0.95, 0.5, 0.9, 0.2, 0.3, 0.5, 0.05, 0.05), base: 'corporate' },
  { id: 'slum', nouns: ['shanty sprawl', 'tin-roof warren', 'scrap town', 'forgotten blocks'], at: vec(0.05, 0.7, 0.1, 0.3, 0.2, 0.2, 0.95, 0.7), base: 'slum' },
  { id: 'dockside', nouns: ['docks', 'wharfside', 'smugglers\' quay', 'container maze'], at: vec(0.3, 0.35, 0.3, 0.4, 0.8, 0.55, 0.6, 0.8), base: 'industrial' },
  { id: 'bohemian', nouns: ['arts quarter', 'studio rows', 'squat-and-gallery quarter', 'noodle-bar maze'], at: vec(0.4, 0.6, 0.3, 0.6, 0.2, 0.5, 0.55, 0.2), base: 'nightlife' },
  { id: 'enclave', nouns: ['gated enclave', 'secured gardens', 'managed community', 'safe-T estate'], at: vec(0.8, 0.4, 0.95, 0.05, 0.05, 0.3, 0.05, 0.05), base: 'corporate' },
  { id: 'salvage', nouns: ['salvage town', 'chop-shop flats', 'junk bazaar', 'fence alley'], at: vec(0.15, 0.45, 0.15, 0.35, 0.5, 0.8, 0.8, 0.75), base: 'market' },
];

export const archetype = (id: string): Archetype => {
  const a = ARCHETYPES.find((x) => x.id === id);
  if (!a) throw new Error(`no such district archetype: ${id}`);
  return a;
};

// ===================================================================== the space

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Mean squared difference over the axes, 0 (same place) to 1 (opposite corners). */
export function distance2(a: DistrictVector, b: DistrictVector): number {
  let sum = 0;
  for (const k of AXES) sum += (a[k] - b[k]) ** 2;
  return sum / AXES.length;
}

/** How sharply a district belongs to its nearest archetypes. Smaller is more decisive. */
const BLEND_TEMPERATURE = 0.05;

export interface BlendEntry { id: string; weight: number }

/** How much of each archetype a point is, strongest first, weights summing to 1. */
export function blendOf(v: DistrictVector): BlendEntry[] {
  const raw = ARCHETYPES.map((a) => ({ id: a.id, weight: Math.exp(-distance2(v, a.at) / BLEND_TEMPERATURE) }));
  const total = raw.reduce((s, e) => s + e.weight, 0);
  return raw.map((e) => ({ id: e.id, weight: e.weight / total })).sort((a, b) => b.weight - a.weight);
}

/** Weights collapsed onto mapgen's six districts, since that's what its tables are keyed on. */
export function districtWeights(blend: BlendEntry[]): Record<District, number> {
  const out: Record<District, number> = { market: 0, nightlife: 0, tenement: 0, industrial: 0, corporate: 0, slum: 0 };
  for (const e of blend) out[archetype(e.id).base] += e.weight;
  return out;
}

/** Normal-ish noise (Box-Muller) on the district's own stream. */
function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
}

// ===================================================================== words

/** Proper names: a first word and a place word, by archetype. The first words are shared by everywhere; the place words say what kind of place it is. */
const NAME_FIRST = ['Lantern', 'Sodium', 'Cinder', 'Copper', 'Hollow', 'Velvet', 'Kerosene', 'Saffron', 'Tin', 'Glass', 'Static', 'Orchid', 'Brass', 'Paper', 'Ember', 'Heron', 'Moth', 'Kiln', 'Pinwheel', 'Abacus', 'Quiet', 'Lucky', 'Drowned', 'Slate'];
const NAME_FIRST_BY: Record<string, string[]> = {
  market: ['Dumpling', 'Haggle', 'Tangerine', 'Abacus', 'Soda'],
  nightlife: ['Afterglow', 'Ultraviolet', 'Strobe', 'Neon', 'Last-Call'],
  tenement: ['Marigold', 'Laundry', 'Sparrow', 'Harmony', 'Rent'],
  industrial: ['Coolant', 'Rivet', 'Conveyor', 'Gantry', 'Foundry'],
  corporate: ['Meridian', 'Quorum', 'Obelisk', 'Tessellate', 'Paragon'],
  slum: ['Tarp', 'Patch', 'Scrap', 'Gutter', 'Rust'],
  dockside: ['Barge', 'Eel', 'Anchor', 'Tide', 'Container'],
  bohemian: ['Easel', 'Mixtape', 'Noodle', 'Zine', 'Paintcan'],
  enclave: ['Serenity', 'Halcyon', 'Sunrise', 'Aegis', 'Lavender'],
  salvage: ['Spare', 'Hot', 'Bargain', 'Cannibal', 'Scrapheap'],
};
const NAME_LAST_BY: Record<string, string[]> = {
  market: ['Bazaar', 'Market', 'Arcade', 'Row', 'Exchange'],
  nightlife: ['Strip', 'Mile', 'Quarter', 'Row', 'Promenade'],
  tenement: ['Stacks', 'Terraces', 'Court', 'Blocks', 'Warren'],
  industrial: ['Yards', 'Works', 'Freightway', 'Depot', 'Flats'],
  corporate: ['Plaza', 'Concourse', 'Heights', 'Boulevard', 'Park'],
  slum: ['Flats', 'Warren', 'Hollow', 'Sprawl', 'Bottoms'],
  dockside: ['Docks', 'Wharf', 'Quay', 'Slip', 'Basin'],
  bohemian: ['Quarter', 'Row', 'Lofts', 'Alley', 'Commons'],
  enclave: ['Gardens', 'Estate', 'Close', 'Green', 'Terrace'],
  salvage: ['Yard', 'Heap', 'Alley', 'Flats', 'Market'],
};

/** Words for an axis at its extremes. The extreme that a district has *beyond* its nearest archetype is what makes it itself. */
const WORDS: Record<Axis, { high: string[]; low: string[] }> = {
  wealth: { high: ['affluent', 'gilded', 'well-heeled'], low: ['impoverished', 'threadbare', 'hand-to-mouth'] },
  density: { high: ['crammed', 'elbow-to-elbow', 'overstacked'], low: ['half-empty', 'sprawling', 'echoing'] },
  order: { high: ['over-policed', 'tightly surveilled', 'spotless'], low: ['lawless', 'unwatched', 'nobody-in-charge'] },
  vice: { high: ['rowdy', 'neon-soaked', 'sleepless'], low: ['sober', 'early-to-bed', 'dry'] },
  industry: { high: ['grinding', 'smoke-stacked', 'heavy'], low: ['workless', 'quiet-machined', 'idle'] },
  commerce: { high: ['bustling', 'hawker-choked', 'price-tagged'], low: ['shuttered', 'unmarketed', 'nothing-for-sale'] },
  decay: { high: ['crumbling', 'rust-eaten', 'patched-together'], low: ['pristine', 'freshly painted', 'suspiciously clean'] },
  underworld: { high: ['gang-run', 'turf-marked', 'protection-racket'], low: ['legit', 'gang-free', 'nobody-pays-protection'] },
};

/** One sentence about what the district is like on this axis. Only said when the axis is notable. */
const TRAIT_LINES: Record<Axis, { high: string[]; low: string[] }> = {
  wealth: {
    high: ['The money here has a doorman.', 'Even the bins have a brand.', 'Nobody has looked at a price tag in years.'],
    low: ['Nothing here has been new since before the rain.', 'The cheapest thing on sale is the hope.', 'Every belt has been tightened past the last hole.'],
  },
  density: {
    high: ['You can hear three neighbours\' arguments without leaving the pavement.', 'Every floor of every building is somebody\'s kitchen.'],
    low: ['The streets are wide, and the quiet in them is not restful.', 'Plenty of room, and a good echo.'],
  },
  order: {
    high: ['The cameras here are friendly, which is worse.', 'A patrol drone hums past every ninety seconds, apologising.'],
    low: ['If anybody is coming, they are taking their time.', 'The last patrol was a rumour, and it was cancelled.'],
  },
  vice: {
    high: ['Half the doors are open for business and the business is a bad idea.', 'The signs are brighter than the plans of the people under them.'],
    low: ['By ten the shutters are down and the only light is security lights.', 'Nobody has had a good time here on purpose.'],
  },
  industry: {
    high: ['Something heavy is being made behind every wall, loudly.', 'The air tastes of coolant and overtime.'],
    low: ['The machines here are for show.', 'Whatever got made here has long since moved somewhere cheaper.'],
  },
  commerce: {
    high: ['Everything is for sale, including the directions.', 'A haggle is going on in every doorway.'],
    low: ['There is nothing to buy and nobody to buy it from.', 'The few stalls are selling to each other.'],
  },
  decay: {
    high: ['Half the signs are missing letters, and the other half are wrong about it.', 'The walls are held up by posters.'],
    low: ['The graffiti is removed within the hour and billed to somebody.', 'Everything is the colour the lease says it should be.'],
  },
  underworld: {
    high: ['Everybody knows whose corner it is, and nobody says.', 'Somebody\'s colours are on every second wall, freshly sprayed.'],
    low: ['The only protection here is the subscription kind.', 'The gangs gave up on this district; the rent was too high.'],
  },
};

// ===================================================================== a district

/** A generated district: the point, and everything read off it. (`District` is already mapgen's six-way label.) */
export interface DistrictProfile {
  /** The point itself. This is the district; everything else is read from it. */
  vector: DistrictVector;
  /** Archetypes by how near, strongest first, weights summing to 1. */
  blend: BlendEntry[];
  /** The nearest archetype's id. */
  dominant: string;
  /** The next-nearest if it has a real share (a quarter or more), else absent. */
  secondary?: string;
  /** How decisively it's its dominant: 1 is a textbook example, near 0 means it's between several. */
  purity: number;
  /** What it's called: "Lantern Bazaar". The first word may come from anywhere; the last says what kind of place it is. */
  name: string;
  /** A brief description to go with the name: "Over-policed bazaar". */
  description: string;
  /** "Mostly market, some slum." */
  mix: string;
  /** Two or three sentences. */
  blurb: string;
  /** Gameplay, blended from mapgen's tables by `blend` and nudged by the vector. */
  security: number;
  crowded: number;
  clinicChance: number;
  lots: Record<Lot, number>;
  /** 0..1 summaries, for deciding what to put in it. */
  danger: number;
  richness: number;
  /** The mapgen district the whole thing is closest to, for anything that still wants a single label. */
  district: District;
}

export interface GenOptions {
  /** Aim at this archetype instead of choosing one. Still blends with a neighbour and still drifts. */
  lean?: string;
  /** Start from an existing district's point instead of an archetype, so adjacent districts shade into each other. */
  near?: DistrictVector;
  /** Per-axis noise, in the units of the axis. Default 0.12; more makes odder places. */
  spread?: number;
  /** For `near`: how far to wander from it. Default 0.2. */
  drift?: number;
  /** Chance of pulling a second archetype into the mix. Default 0.7. */
  hybrid?: number;
}

/** Pick a point: an archetype (or two, mixed), plus noise. */
export function rollVector(rng: Rng, o: GenOptions = {}): DistrictVector {
  const spread = o.spread ?? 0.12;
  const centre: DistrictVector = { ...vec(0, 0, 0, 0, 0, 0, 0, 0) };
  if (o.near) {
    const d = o.drift ?? 0.2;
    for (const k of AXES) centre[k] = o.near[k] + gauss(rng) * d;
  } else {
    const a = o.lean ? archetype(o.lean) : rng.pick(ARCHETYPES);
    const useSecond = rng.chance(o.hybrid ?? 0.7);
    const b = useSecond ? rng.pick(ARCHETYPES.filter((x) => x.id !== a.id)) : a;
    const t = useSecond ? rng.next() * 0.5 : 0; // how far toward the second one: never past halfway, so `a` stays the main thing
    for (const k of AXES) centre[k] = a.at[k] * (1 - t) + b.at[k] * t;
  }
  const out = { ...centre };
  for (const k of AXES) out[k] = round2(clamp01(centre[k] + gauss(rng) * spread));
  return out;
}

/** Roll one district. `rng` is consumed for the point only; the prose uses a fork. */
export function generateDistrict(rng: Rng, o: GenOptions = {}): DistrictProfile {
  const vector = rollVector(rng, o);
  return describeDistrict(vector, rng.fork('district-words'));
}

/** Read everything else off a point. Also how to describe a district someone placed by hand. */
export function describeDistrict(vector: DistrictVector, words: Rng): DistrictProfile {
  const blend = blendOf(vector);
  const top = archetype(blend[0]!.id);
  const second = blend[1]!;
  const secondary = second.weight >= 0.25 ? second.id : undefined;
  const w = districtWeights(blend);

  // What makes this one itself: the axis where it differs most from its nearest archetype.
  let axis: Axis = AXES[0];
  let gap = 0;
  for (const k of AXES) {
    const g = vector[k] - top.at[k];
    if (Math.abs(g) > Math.abs(gap)) { gap = g; axis = k; }
  }
  const adjective = Math.abs(gap) >= 0.15 ? words.pick(WORDS[axis][gap > 0 ? 'high' : 'low']) : '';
  const noun = words.pick(top.nouns);
  const description = cap([adjective, noun].filter(Boolean).join(' '));
  const first = words.pick([...NAME_FIRST, ...(NAME_FIRST_BY[top.id] ?? []), ...(NAME_FIRST_BY[top.id] ?? [])]);
  const name = `${first} ${words.pick(NAME_LAST_BY[top.id]!)}`;

  const share = (id: string) => Math.round((blend.find((e) => e.id === id)?.weight ?? 0) * 100);
  const mix = secondary
    ? `Mostly ${top.id}, with a good deal of ${secondary}.`
    : share(top.id) >= 60 ? `Pure ${top.id}.` : `Mostly ${top.id}.`;

  // Blurb: how the nearest district feels, then what stands out most about this one.
  const base = districtLine(words, top.base);
  // Said about the axes where it departs most from what its archetypes would lead you to expect.
  const notable = AXES.map((k) => ({ k, off: vector[k] - blendedAxis(blend, k) })).sort((a, b) => Math.abs(b.off) - Math.abs(a.off)).slice(0, 2)
    .filter((e) => Math.abs(e.off) >= 0.15)
    .map((e) => words.pick(TRAIT_LINES[e.k][e.off > 0 ? 'high' : 'low']));
  const blurb = [base, ...notable].join(' ');

  const blendNum = (table: Record<District, number>) => (Object.keys(w) as District[]).reduce((s, d) => s + w[d] * table[d], 0);
  // Mapgen's tables, blended; then nudged by the axes the tables don't know about.
  const security = Math.max(0, Math.round(blendNum(STREET_SECURITY) + (vector.order - blendedAxis(blend, 'order')) * 2));
  const crowded = round2(clamp01(blendNum(CROWDED) + (vector.density - blendedAxis(blend, 'density')) * 0.5));
  const clinicChance = round2(clamp01(blendNum(CLINIC_CHANCE)));
  const lots = {} as Record<Lot, number>;
  for (const lot of Object.keys(LOTS.market) as Lot[]) {
    lots[lot] = round2((Object.keys(w) as District[]).reduce((s, d) => s + w[d] * LOTS[d][lot], 0));
  }

  const district = (Object.keys(w) as District[]).sort((a, b) => w[b] - w[a])[0]!;
  return {
    vector,
    blend,
    dominant: top.id,
    ...(secondary ? { secondary } : {}),
    purity: round2(blend[0]!.weight),
    name,
    description,
    mix,
    blurb,
    security,
    crowded,
    clinicChance,
    lots,
    danger: round2(clamp01(vector.underworld * 0.5 + (1 - vector.order) * 0.3 + vector.decay * 0.2)),
    richness: round2(clamp01(vector.wealth * 0.6 + vector.commerce * 0.4)),
    district,
  };
}

/** What the blend of archetypes would say about an axis. The gap between this and the real value is what the tables miss. */
function blendedAxis(blend: BlendEntry[], k: Axis): number {
  return blend.reduce((s, e) => s + e.weight * archetype(e.id).at[k], 0);
}

const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

const districtLine = (rng: Rng, d: District): string => rng.pick(MOOD[d]);

/** n districts from one stream, each rolled independently, and no two with the same name. */
export function generateDistricts(rng: Rng, n: number, o: GenOptions = {}): DistrictProfile[] {
  const out: DistrictProfile[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < n; i++) {
    let d = generateDistrict(rng.fork(`district-${i}`), o);
    // A repeat is the same point reworded; the point stays, only the name is rerolled.
    for (let tries = 1; taken.has(d.name) && tries < 20; tries++) d = describeDistrict(d.vector, rng.fork(`district-${i}-name-${tries}`));
    taken.add(d.name);
    out.push(d);
  }
  return out;
}
