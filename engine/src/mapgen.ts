import { typeFromName } from './streettypes';
import { Rng, hashString } from './rng';
import { placeOnHex, seedHexes } from './hexmap';
import { inheritInfluence, pickFaction } from './factions';
import { ENTRANCE_BLURB, OUTPOST_CODE, hideoutName, outpostName, rollTier } from './content/dungeons';
import { SPOTS, SPOT_AGAIN, SPOT_CHANCE, pickSpot, rollSpotTier, type SpotDef } from './content/spots';
import { CONDITIONS, GYM_CHANCE, ROOMS, rollGym, roomTitle } from './content/gyms';
import { OFFICE_BLURBS, REALTY_CHANCE, officeName } from './content/realty';
import { PAWN_CHANCE, ROOMS as PAWN_ROOMS, rollPawn, roomTitle as pawnRoomTitle } from './content/pawns';
import { HALL_CHANCE, ROOMS as HALL_ROOMS, rollHall, roomTitle as hallRoomTitle } from './content/halls';
import { CHOP_CHANCE, rollChop } from './content/chops';
import { HUB_CHANCE, rollHub } from './content/hubs';
import { DISTRICT_DANGER, START_DEPTH, dangerOf, meanDanger, stepDanger } from './grade';
import { HERITAGES, type Heritage } from './content/names';
import type { District, Exit, GenRole, Id, Legacy, Location, World } from './types';

/** What the map generator needs from a world. (`legacy` is optional so a bare test map works: no gate, so it is sealed.) */
type MapWorld = Pick<World, 'worldSeed' | 'locations' | 'factions'> & { legacy?: Pick<Legacy, 'gate'> };

export { START_DEPTH, dangerOf };

/** Has CINDERJAW been put down, so the cordon is open? */
export const gateOpen = (w: { legacy?: Pick<Legacy, 'gate'> }): boolean => w.legacy?.gate === 'open';

/**
 * Neo builds itself around Blackbird. The hand-built Rusty Halo district is the seed; everything
 * past its edges is grown as she gets there and then belongs to the save, so the map is the same
 * in every run.
 *
 * How it works:
 *
 *  - A place is **sketched** when the place next to it is expanded: it gets a name, a kind, a
 *    security level, a blurb and one exit, back to where it came from. Sketched places are real
 *    (they're in `w.locations`, they can be routed to, people can be cast into them) but have
 *    nothing beyond them yet.
 *  - A place is **expanded** the first time she arrives (`relocate` calls `expand`): it grows its
 *    own neighbours, which are sketched in turn. So the map is always exactly one step wider than
 *    anywhere she's been, and every exit she can see leads somewhere that already has a name.
 *  - Streets branch into more streets and into buildings; buildings have a few rooms of their own;
 *    tunnels run on and come up in a street somewhere else.
 *
 * **Ids say where a place is.** A child's id is its parent's id plus the slot it was born in
 * (`street_main~0`, `street_main~0.2`), and all of its attributes come from a random stream seeded
 * with the world and that id, never the run or the order places were found in. So the same save
 * grows the same city however it's explored, and roster ids (`bartender@street_main~0.2.0.0`) mean
 * the same person every time.
 */

const DISTRICTS: District[] = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'];

/** Which districts bleed into which. A street usually stays what it is, and sometimes turns into a neighbour. */
const NEXT_TO: Record<District, District[]> = {
  market: ['nightlife', 'tenement', 'slum'],
  nightlife: ['market', 'slum', 'corporate'],
  tenement: ['market', 'slum', 'industrial'],
  industrial: ['tenement', 'slum', 'corporate'],
  corporate: ['nightlife', 'industrial', 'market'],
  slum: ['tenement', 'industrial', 'nightlife'],
};

export type Lot = Exclude<GenRole, 'street' | 'clinic' | 'unit' | 'backroom' | 'cellar' | 'vip' | 'chamber' | 'spot' | 'gym' | 'gymroom' | 'pawn' | 'pawnroom' | 'realty' | 'chop' | 'hub' | 'gamehall' | 'gamehallroom'>;

/** What stands along a street, by district. */
export const LOTS: Record<District, Record<Lot, number>> = {
  market: { shop: 5, bar: 2, club: 0.5, corp: 0.4, flat: 1, tunnel: 0.5, outpost: 0, hideout: 0.1 },
  nightlife: { shop: 1.5, bar: 4, club: 3, corp: 0.3, flat: 0.5, tunnel: 0.5, outpost: 0, hideout: 0.2 },
  tenement: { shop: 2, bar: 2, club: 0.2, corp: 0.2, flat: 5, tunnel: 1, outpost: 0.1, hideout: 0.3 },
  industrial: { shop: 1, bar: 1, club: 0.2, corp: 2, flat: 1, tunnel: 3, outpost: 0.6, hideout: 0.35 },
  corporate: { shop: 1.5, bar: 1, club: 1, corp: 4, flat: 0.5, tunnel: 0.3, outpost: 0.7, hideout: 0 },
  slum: { shop: 1.5, bar: 2, club: 0.3, corp: 0.1, flat: 3, tunnel: 2, outpost: 0, hideout: 0.55 },
};

/** Chance a street has a street clinic on it, by district. Rolled on a stream of its own so it never reshuffles the rest of the map. */
export const CLINIC_CHANCE: Record<District, number> = { market: 0.25, nightlife: 0.2, tenement: 0.3, industrial: 0.2, corporate: 0.12, slum: 0.4 };

export const STREET_SECURITY: Record<District, number> = { market: 2, nightlife: 2, tenement: 1, industrial: 1, corporate: 3, slum: 1 };
export const CROWDED: Record<District, number> = { market: 0.5, nightlife: 0.6, tenement: 0.25, industrial: 0.05, corporate: 0.2, slum: 0.2 };

// ===================================================================== names and words

const STREET_ADJ = ['Cinder', 'Sodium', 'Lantern', 'Hollow', 'Copper', 'Static', 'Drowned', 'Velvet', 'Paper', 'Brass', 'Orchid', 'Tin', 'Gutter', 'Saffron', 'Ember', 'Quiet', 'Rust', 'Midnight', 'Ghost', 'Lucky', 'Glass', 'Kerosene', 'Soda', 'Slate'];
const STREET_NOUN = ['Dumpling', 'Pylon', 'Heron', 'Cable', 'Anchor', 'Lotus', 'Wire', 'Foundry', 'Mule', 'Eel', 'Relay', 'Ledger', 'Kettle', 'Sparrow', 'Tram', 'Abacus', 'Moth', 'Switch', 'Kiln', 'Pagoda', 'Fuse', 'Rickshaw', 'Barge', 'Lamp'];
const STREET_SUFFIX = ['Street', 'Row', 'Lane', 'Alley', 'Way', 'Avenue', 'Walk', 'Run', 'Arcade', 'Terrace', 'Passage'];
const STREET_SUFFIX_BY: Partial<Record<District, string[]>> = {
  market: ['Bazaar', 'Market', 'Arcade', 'Row'],
  industrial: ['Yard', 'Freightway', 'Run', 'Wharf'],
  corporate: ['Plaza', 'Boulevard', 'Concourse', 'Avenue'],
};
const HIGHWAY_SUFFIX = ['Expressway', 'Freeway', 'Causeway', 'Skyway', 'Beltway', 'Flyover'];
const HIGHWAY_BLURB = [
  '{name}: a raised highway of grey concrete and sodium light, six lanes wide and empty, with the whole city going by underneath. No doors. No stops. Nothing here wants her.',
  '{name}: a long straight run of tarmac between crash barriers, lit by one orange lamp in every ten, and a wind that has come a very long way.',
  '{name}: an elevated road with no buildings, no corners and no reasons to slow down. Far below, the city hums.',
];
/** Chance a street has an on-ramp, so one of its roads onward is a highway, by district. (Its own stream, so no other street changes.) */
const RAMP_CHANCE: Record<District, number> = { market: 0.06, nightlife: 0.04, tenement: 0.05, industrial: 0.16, corporate: 0.14, slum: 0.03 };
const STREET_TAIL = ['running off east', 'heading west under the sodium lights', 'bending away out of sight', 'where the signs get louder', 'where the lights get fewer', 'sloping down toward the water', 'climbing between the stacks', 'that Blackbird has never noticed before'];

const CLINIC_NAME = ['Walk-In Patch & Stitch', 'Sutures & Suds', 'No Questions Clinic', 'Cut-Rate Chrome Repair', 'The Back-Alley Infirmary', 'Cash-Only Care', 'Stitch in Time', 'Ward 9½', 'Dr. Pho\'s Patch Shop', 'Last Resort Medical', 'Bleed-Through Urgent Care', 'The Mending Room'];
const OWNER = ['Mama Qwerty', 'Honest Ito', 'Big Vera', 'Two-Finger Sam', 'Uncle Ohm', 'Dr. Pho', 'Lucky Wen', 'Grandma Kernel', 'Nine-Lives Nadia', 'Cousin Bit', 'Old Man Baud', 'Auntie Vex', 'Slim Tolliver', 'Madame Fizz', 'Brother Voltage'];
const SHOP_THING = ['Used Limbs', 'Pawn & Prayer', 'Cable & Cord', 'Discount Ammo', 'Vape Emporium', 'Synth Silks', 'Hot Parts', 'Battery Barn', 'Dumpling Depot', '24-Hour Everything', 'Fixes & Fabrics', 'Gadget Grave', 'Noodle Mart', 'Bootleg Bonsai', 'Secondhand Eyes', 'Tattoo & Tax Prep'];
const BAR_ADJ = ['Drowned', 'Chrome', 'Hollow', 'Sleepy', 'Leaky', 'Tipsy', 'Burnt', 'Velvet', 'Laughing', 'Crooked', 'Last', 'Electric', 'Lonesome', 'Wet'];
const BAR_NOUN = ['Vat', 'Anchor', 'Mule', 'Lantern', 'Pylon', 'Eel', 'Cog', 'Gutter', 'Static', 'Ferret', 'Orders', 'Valve', 'Heron', 'Bucket'];
const CLUB_NAME = ['Club Hex', 'The Velvet Void', 'Ultraviolet', 'Sodium', 'Static Cathedral', 'Club Zero', 'The Glass Orchid', 'Hertz', 'Afterimage', 'The Black Lotus', 'Overclock', 'Moth & Flame'];
const CORP = ['Kintaro', 'Voss-Hale', 'Ambrosia', 'Tessellate', 'Obelisk', 'Nakamura-Reyes', 'Halcyon', 'Quorum', 'Meridian', 'Okonjo-Brandt', 'Vantablack'];
const DIVISION = ['Logistics', 'Biosolutions', 'Holdings', 'Dynamics', 'Analytics', 'Provisions', 'Systems', 'Futures'];
const FLOOR = ['records floor', 'server farm', 'executive suite', 'research annex', 'data vault', 'security hub'];
const FLAT_NAME = ['Court', 'Tower', 'Mansions', 'Heights', 'Gardens', 'Hab-Stack', 'Block'];
const FLAT_WORD = ['Pinwheel', 'Sparrow', 'Lotus', 'Cobalt', 'Marigold', 'Tangerine', 'Paragon', 'Kestrel', 'Harmony', 'Meridian', 'Sunrise'];
const TUNNEL_NAME = ['storm drain', 'service duct', 'old metro platform', 'cable run', 'pedestrian underpass', 'coolant culvert', 'bricked-up arcade', 'maintenance tunnel'];
const TUNNEL_ADJ = ['flooded', 'humming', 'forgotten', 'dripping', 'sealed-off', 'warm', 'echoing'];

const pick = <T>(rng: Rng, xs: readonly T[]): T => rng.pick(xs);

/** "Joe's" / "Mama Qwerty's" / "Bullets & Bagels'" */
export const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

/** The words along the way: one sentence about what she sees the first time she's there. */
export const MOOD: Record<District, string[]> = {
  market: ['Hawkers, steam and a hundred hand-lettered signs, none of them accurate.', 'Every doorway is selling something, and most of it is the doorway.', 'A haggle in six languages is going on at a volume nobody asked for.'],
  nightlife: ['Neon, bass through the walls, and a queue of people dressed for a worse idea than they know.', 'Every other window is a bar, and every bar has a bouncer who has already judged her boots.', 'The gutters are full of confetti and something that used to be a cocktail.'],
  tenement: ['Laundry on every balcony, a thousand small windows, and a smell of someone else\'s dinner.', 'Stacked homes lean over the street like they\'re eavesdropping.', 'Kids\' chalk on the pavement, and a drone from the management company watching it fade.'],
  industrial: ['Freight rails, chain-link and the hum of machines that run all night for no one.', 'Everything here is matte, heavy and labelled with a barcode.', 'A crane the size of a church turns slowly overhead, carrying nothing.'],
  corporate: ['Glass, steel and a security camera for every window, all of them polite.', 'The pavement is cleaner than anything in the Halo, which feels like an accusation.', 'Holographic mission statements drift down the street at head height.'],
  slum: ['Tarps, tin and a fire in a barrel; everyone here has learned to look at nothing.', 'The streetlights are out and nobody has bothered to report it.', 'Somebody has built a house out of other houses.'],
};

const BLURB: Record<Exclude<GenRole, 'street'>, string[]> = {
  unit: ['{name}: a door, a lock and everything somebody owns.'],
  shop: ['{name}: shelves to the ceiling, a bell on the door, and a proprietor who has already priced everything on you.', '{name}: fluorescent, narrow and crammed, and everything has a handwritten tag that says PROBABLY FINE.', '{name}: a shop that is very proud of itself and has no right to be.'],
  bar: ['{name}: low light, sticky floor, a regular for every stool and the same song on the jukebox it was playing yesterday.', '{name}: a bar that has decided to be a mood. The taps are mostly decorative.', '{name}: dark wood, bad neon and a bartender who looks at her once and remembers it.'],
  clinic: ['{name}: a counter behind a grille, a smell of antiseptic and old cigarettes, and a small red light that tracks her from the ceiling.', '{name}: two chairs, a surgical lamp and a sign in four languages that says NO REFUNDS. Something hums behind the door.', '{name}: bright white tile in a dark street, a bell on the door, and a chrome shape lying very still by the desk. It is not asleep.'],
  club: ['{name}: bass you can feel in your implants, light that has opinions, and a crowd that has paid to forget.', '{name}: a dance floor, a strobe, and a ceiling covered in someone\'s old holiday lights.', '{name}: sweat, glitter and a velvet rope that hasn\'t decided about her yet.'],
  corp: ['{name}: a lobby of pale stone and soft carpet, and a receptionist hologram that smiles at her without moving its eyes.', '{name}: everything is white and quiet and has a barcode, and she can feel the cameras agreeing about her.', '{name}: a corporate front office in the sense that it fronts, and an office in no sense at all.'],
  flat: ['{name}: a stairwell, a lot of doors, and one of them is very probably someone\'s.', '{name}: tiny, humming, tidy in a way that costs effort; somebody\'s plant is trying its best.', '{name}: a landing that smells of rice, ozone and rent.'],
  tunnel: ['{name}: pipes, drips and a distant hum that is either machinery or a very patient animal.', '{name}: a long concrete throat, lit by one working strip and a lot of graffiti.', '{name}: damp, close and echoing, and everything she steps on goes crunch.'],
  backroom: ['{name}: smoke, a card table and the feeling of a conversation that stopped when she opened the door.', '{name}: crates, a lock on the inside and a single bulb. The kind of room with a reason.'],
  cellar: ['{name}: kegs, damp and a single bulb on a string. The ceiling hums with whoever is above it.', '{name}: stairs down, stairs down, and then a room that is mostly bottles and spiders.'],
  vip: ['{name}: leather, a mirrored ceiling and a minibar that costs more than her armor.', '{name}: a velvet cage above the dance floor, where the people who matter are being watched by the people who don\'t.'],
  // Dungeons write their own (content/dungeons.ts); these are only here so nothing is ever blank.
  outpost: ['{name}: a grey Atlas block with its lights on.'],
  hideout: ['{name}: a door with someone\'s colors on it.'],
  spot: ['{name}: a corner of the street where something is going on.'],
  chamber: ['{name}: a room in somebody else\'s building.'],
  // Gyms write their own (content/gyms.ts).
  gym: ['{name}: a gym, of sorts.'],
  gymroom: ['{name}: a room in a gym.'],
  // Pawn shops write their own (content/pawns.ts).
  pawn: ['{name}: a pawn shop, of sorts.'],
  pawnroom: ['{name}: a room in a pawn shop.'],
  // Chop shops write their own (content/chops.ts).
  chop: ['{name}: a chop shop, of sorts.'],
  // Hacker hubs write their own (content/hubs.ts).
  hub: ['{name}: a hacker hub, of sorts.'],
  // Arcades write their own (content/halls.ts).
  gamehall: ['{name}: an arcade, of sorts.'],
  gamehallroom: ['{name}: a room in an arcade.'],
  realty: OFFICE_BLURBS,
};

// ===================================================================== ids

/** A child's id is its parent's plus the slot it was born in. Stable, and says where the place is. */
export const childId = (parent: Id, slot: number): Id => (parent.includes('~') ? `${parent}.${slot}` : `${parent}~${slot}`);

/** Chance that a new street is the heart of a quarter with a heritage of its own (about one street in eight). */
const QUARTER_CHANCE = 0.12;
function rollQuarter(w: Pick<World, 'worldSeed'>, id: Id): Heritage | undefined {
  const rng = new Rng(`quarter:${w.worldSeed}:${id}`);
  return rng.chance(QUARTER_CHANCE) ? rng.pick(HERITAGES.filter((h) => h !== 'anglo')) : undefined;
}

const stream = (w: Pick<World, 'worldSeed'>, id: Id): Rng => new Rng(`map:${w.worldSeed}:${id}`);

// ===================================================================== the hand-built edge

interface Road {
  label: string;
  districts: District[];
}

/** Where the hand-built district opens onto the rest of Neo. */
const ANCHORS: { at: Id; roads: Road[] }[] = [
  {
    at: 'street_main',
    roads: [
      { label: 'Strand Street, running east under the signs', districts: ['market', 'nightlife'] },
      { label: 'Strand Street, west toward the freight yards', districts: ['industrial', 'tenement', 'slum'] },
    ],
  },
  { at: 'lab_lot', roads: [{ label: 'a narrow lane running off from the lab', districts: ['market', 'tenement', 'nightlife'] }] },
  { at: 'club_backlot', roads: [{ label: 'a service road behind the lots', districts: ['industrial', 'slum'] }] },
  { at: 'halo_alley', roads: [{ label: 'a narrow cut between the buildings', districts: ['slum', 'tenement'] }] },
];

/**
 * Open the hand-built district onto the rest of the city. Safe to call again (it only adds what's
 * missing), which is how a save from before the map grew gets its edges.
 */
export function seedFrontier(w: MapWorld): void {
  seedHexes(w); // the hand-built district gets its place on the hex grid first, so what grows from it has somewhere to stand
  for (const a of ANCHORS) {
    const from = w.locations[a.at];
    if (!from || from.gen) continue;
    a.roads.forEach((road, i) => {
      const id = childId(a.at, i);
      if (w.locations[id]) return;
      const rng = stream(w, id);
      const district = pick(rng, road.districts);
      sketch(w, from, i, 'street', district, 1, { label: road.label });
    });
  }
  wireOverpass(w);
}

/**
 * The Kowloon Overpass is not on Strand Street. Its one way in is the first road east off Strand (`street_main~0`), and the lab
 * lot's own road meets that street too, so the dragon is Strand Street, then a street, then the Overpass, or the lab lot's lane,
 * then that street, then the Overpass. Safe to call again (a save from before this gets the old door off Strand taken away).
 */
function wireOverpass(w: MapWorld): void {
  const pass = w.locations.overpass;
  const gate = w.locations[childId('street_main', 0)];
  if (!pass || !gate) return;
  const strand = w.locations.street_main;
  if (strand) strand.exits = strand.exits.filter((e) => e.to !== pass.id);
  pass.exits = pass.exits.filter((e) => e.to === gate.id);
  pass.tossTo = gate.id;
  pass.fleeTo = gate.id;
  join(gate, pass, 'the Kowloon Overpass (where the dragon patrols)', `back down to ${gate.name}`);
  const lane = w.locations[childId('lab_lot', 0)];
  if (lane) join(lane, gate, `a cut-through to ${gate.name}`, `a cut-through to ${lane.name}`);
}

// ===================================================================== the cordon

/**
 * The lockdown comes down: every cordon street gets its roads onward (or gets back the ones an older save had already
 * grown). Safe to call again. Called when CINDERJAW dies.
 */
export function liftCordon(w: MapWorld & { legacy: Legacy }): void {
  w.legacy.gate = 'open';
  for (const loc of Object.values(w.locations)) {
    const g = loc.gen;
    if (!g?.cordon && !g?.sealed) continue;
    const street = g.role === 'street' && g.cordon;
    g.cordon = false;
    if (g.sealed?.length) {
      for (const e of g.sealed) if (!loc.exits.some((x) => x.to === e.to)) loc.exits.push(e);
      delete g.sealed;
      continue;
    }
    if (!street) continue;
    const rng = new Rng(`cordon:${w.worldSeed}:${loc.id}`);
    let slot = firstFreeSlot(loc);
    for (let i = rng.chance(0.5) ? 2 : 1; i > 0; i--) {
      const next = rng.chance(0.7) ? g.district : pick(rng, NEXT_TO[g.district]);
      sketch(w, loc, slot++, 'street', next, g.depth + 1, { label: `{name}, ${pick(rng, STREET_TAIL)}` });
    }
  }
}

/**
 * Put the cordon on a map that was grown without one: whatever ran on past the edge of the starting district (a road, a
 * tunnel's ladder) is held back until the gate is open. Idempotent.
 */
export function sealCordon(w: MapWorld): void {
  if (gateOpen(w)) return;
  for (const loc of Object.values(w.locations)) {
    const g = loc.gen;
    if (!g || g.depth > START_DEPTH) continue;
    const past = loc.exits.filter((e) => (w.locations[e.to]?.gen?.depth ?? 0) > START_DEPTH);
    if (past.length) {
      g.sealed = [...(g.sealed ?? []), ...past];
      loc.exits = loc.exits.filter((e) => !past.includes(e));
    }
    if (g.role === 'street' && g.depth === START_DEPTH && (past.length || g.expanded)) g.cordon = true;
  }
}

// ===================================================================== growing

/**
 * Make the neighbours of a place she has just reached. Idempotent: a place that has been
 * expanded does nothing. Hand-built places have nothing to grow (their edges were seeded).
 */
export function expand(w: MapWorld, loc: Location): void {
  const g = loc.gen;
  if (!g || g.expanded) return;
  g.expanded = true;
  const rng = stream(w, loc.id);
  let slot = firstFreeSlot(loc);
  const add = (role: GenRole, district: District, depth: number, o: ChildOpts = {}): Location => sketch(w, loc, slot++, role, district, depth, o);

  switch (g.role) {
    case 'street': {
      const here = g.district;
      // Streets run on. Always at least one way further out, sometimes two.
      const wanted = rng.chance(g.depth <= START_DEPTH ? 0.15 : 0.5) ? 2 : 1; // the starting district runs long and narrow, the city beyond it branches
      // The outermost streets of the starting district are the lockdown cordon: nothing runs on past them until it comes down.
      const cordon = g.depth >= START_DEPTH && !gateOpen(w);
      const onward = cordon ? 0 : wanted;
      if (cordon) {
        g.cordon = true;
        loc.blurb = `${loc.blurb ?? ''} The street ends at an Atlas lockdown cordon: barriers, drones, and a sign saying the district is closed until further notice. Nobody has been through in weeks.`.trim();
      }
      const highway = loc.road === 'highway';
      const lots = highway ? (rng.int(2, 4), 0) : rng.int(2, 4); // (a highway has no buildings; the draw is kept so nothing else shifts)
      const taken: Lot[] = [];
      const fronts: Location[] = [];
      const roads: Location[] = [];
      for (let i = 0; i < lots; i++) {
        const weights = LOTS[here];
        const role = rng.weighted(Object.keys(weights) as Lot[], (r) => weights[r] * (taken.includes(r) ? 0.4 : 1) * (r === 'corp' && g.depth < 2 && here !== 'corporate' ? 0.3 : 1));
        taken.push(role);
        fronts.push(add(role, here, g.depth));
      }
      const ramp = new Rng(`ramp:${w.worldSeed}:${loc.id}`);
      for (let i = 0; i < onward; i++) {
        const next = rng.chance(0.7) ? here : pick(rng, NEXT_TO[here]);
        // A highway runs on as a highway, mostly; any street might have an on-ramp to one.
        const onto = i === 0 && (highway ? ramp.chance(0.75) : g.depth >= 1 && ramp.chance(RAMP_CHANCE[here]));
        const tail = highway && !onto ? `an off-ramp down to {name}` : onto ? `the on-ramp up to {name}` : `{name}, ${pick(rng, STREET_TAIL)}`;
        roads.push(add('street', next, g.depth + 1, { label: tail, ...(onto ? { highway: true } : {}) }));
      }
      // Somebody has opened a clinic. (Its own stream, and its slot comes after everything else, so the street looks as it did before.)
      if (!highway && new Rng(`clinic:${w.worldSeed}:${loc.id}`).chance(CLINIC_CHANCE[here])) add('clinic', here, g.depth);
      // And somewhere on it, something small is going on: a drop, a den, a repair bay. (Also its own stream, and after the clinic, for the same reason.)
      const spotRng = new Rng(`spots:${w.worldSeed}:${loc.id}`);
      for (let i = 0, p = SPOT_CHANCE[here]; !highway && i < 2 && spotRng.chance(p); i++, p = SPOT_AGAIN) {
        add('spot', here, g.depth, { spot: pickSpot(spotRng, here).key });
      }
      // And, now and then, a gym. (Its own stream and its slot after all of those, for the same reason.)
      if (!highway && new Rng(`gymchance:${w.worldSeed}:${loc.id}`).chance(GYM_CHANCE[here])) add('gym', here, g.depth);
      // And, a little less often, a pawn shop. (Its own stream, and its slot after the gym's, for the same reason.)
      if (!highway && new Rng(`pawnchance:${w.worldSeed}:${loc.id}`).chance(PAWN_CHANCE[here])) add('pawn', here, g.depth);
      // And, now and then, somebody selling homes. (Its own stream, and its slot after the pawn shop's, for the same reason.)
      if (!highway && new Rng(`realtychance:${w.worldSeed}:${loc.id}`).chance(REALTY_CHANCE[here])) add('realty', here, g.depth);
      // And a chop shop, now and then, after that one for the same reason. (Its own stream again.)
      if (!highway && new Rng(`chopchance:${w.worldSeed}:${loc.id}`).chance(CHOP_CHANCE[here])) add('chop', here, g.depth);
      // And a hacker hub, rarer, after that one for the same reason. (Its own stream again.)
      if (!highway && new Rng(`hubchance:${w.worldSeed}:${loc.id}`).chance(HUB_CHANCE[here])) add('hub', here, g.depth);
      // And an arcade, after that one for the same reason. (Its own stream again.)
      if (!highway && new Rng(`gamehallchance:${w.worldSeed}:${loc.id}`).chance(HALL_CHANCE[here])) add('gamehall', here, g.depth);
      // Loops. Everything here is decided now, from this street's own stream, between places that
      // already exist, so the shortcuts are the same whichever end of them she finds first.
      if (roads.length === 2 && rng.chance(LOOP_ROADS) && !highway) join(roads[0]!, roads[1]!, `a cut-through to ${roads[1]!.name}`, `a cut-through to ${roads[0]!.name}`);
      for (let i = 0; i + 1 < fronts.length; i++) {
        const a = fronts[i]!;
        const b = fronts[i + 1]!;
        if (!LINKABLE.includes(a.gen!.role) || !LINKABLE.includes(b.gen!.role) || !rng.chance(LOOP_DOORS)) continue;
        const secret = rng.chance(0.4);
        join(a, b, `a ${secret ? 'concealed ' : ''}side door through to ${b.name}`, `a ${secret ? 'concealed ' : ''}side door through to ${a.name}`, secret);
      }
      break;
    }
    case 'bar': {
      if (rng.chance(0.45)) add('backroom', g.district, g.depth, { hidden: rng.chance(0.3), gate: 'guarded' });
      if (rng.chance(0.35)) add('cellar', g.district, g.depth);
      break;
    }
    case 'club': {
      if (rng.chance(0.6)) add('vip', g.district, g.depth, { gate: 'guarded' });
      break;
    }
    case 'corp': {
      // The lobby decides how far in the building goes; every floor is more guarded than the last.
      const max = g.max ?? rng.int(1, 3);
      const rank = g.rank ?? 0;
      g.max = max;
      g.rank = rank;
      if (rank < max) add('corp', g.district, g.depth, { rank: rank + 1, max, gate: 'guarded' });
      break;
    }
    case 'gym': {
      // The rooms it rolled, each as the gym said: how hidden, how guarded, what it looks like.
      const info = loc.gym;
      if (!info) break;
      for (const room of info.rooms) {
        const def = ROOMS[room];
        if (!def) continue;
        const sec = def.abs ? Math.max(0, def.sec + 9) : loc.security + def.sec;
        const title = roomTitle(info, loc.name, room);
        add('gymroom', g.district, g.depth, {
          name: title,
          hidden: rng.chance(def.hidden),
          gate: def.gate,
          security: def.abs ? Math.min(sec, 2) : sec,
          cameras: def.cameras,
          blurb: pick(rng, def.blurbs).replace('{name}', title.charAt(0).toUpperCase() + title.slice(1)),
          label: def.label,
          gymRoom: { main: loc.id, room },
        });
      }
      break;
    }
    case 'pawn': {
      // The rooms it rolled, each as the shop said: how hidden, how guarded, what it looks like.
      const info = loc.pawn;
      if (!info) break;
      for (const room of info.rooms) {
        const def = PAWN_ROOMS[room];
        if (!def) continue;
        const sec = def.abs ? Math.max(0, def.sec + 9) : loc.security + def.sec;
        const title = pawnRoomTitle(info, loc.name, room);
        add('pawnroom', g.district, g.depth, {
          name: title,
          hidden: rng.chance(def.hidden),
          gate: def.gate,
          security: def.abs ? Math.min(sec, 2) : sec,
          cameras: def.cameras,
          blurb: pick(rng, def.blurbs).replace('{name}', title.charAt(0).toUpperCase() + title.slice(1)),
          label: def.label,
          pawnRoom: { main: loc.id, room },
        });
      }
      break;
    }
    case 'gamehall': {
      // The rooms it rolled, each as the hall said: how hidden, how guarded, what it looks like.
      const info = loc.gamehall;
      if (!info) break;
      for (const room of info.rooms) {
        const def = HALL_ROOMS[room];
        if (!def) continue;
        const sec = def.abs ? Math.max(0, def.sec + 9) : loc.security + def.sec;
        const title = hallRoomTitle(info, loc.name, room);
        add('gamehallroom', g.district, g.depth, {
          name: title,
          hidden: rng.chance(def.hidden),
          gate: def.gate,
          security: def.abs ? Math.min(sec, 2) : sec,
          cameras: def.cameras,
          blurb: pick(rng, def.blurbs).replace('{name}', title.charAt(0).toUpperCase() + title.slice(1)),
          label: def.label,
          hallRoom: { main: loc.id, room },
        });
      }
      break;
    }
    case 'tunnel': {
      // A tunnel goes somewhere: on along itself for a stretch, then up into a street.
      const max = g.max ?? rng.int(1, 3);
      const rank = g.rank ?? 1;
      g.max = max;
      g.rank = rank;
      if (rank < max) add('tunnel', g.district, g.depth, { rank: rank + 1, max });
      else if (g.depth < START_DEPTH || gateOpen(w)) add('street', rng.chance(0.5) ? g.district : pick(rng, NEXT_TO[g.district]), g.depth + 1, { label: '{name}, up a ladder into daylight (such as it is)' });
      // (At the cordon a tunnel's far end is bricked up: it would come out on the wrong side.)
      break;
    }
    default:
      break; // shops, flats, back rooms, cellars and VIP lounges are as far as it goes
  }
}

/** Chance two roads leaving a street are joined by a cut-through, and that neighbours along it share a side door. */
const LOOP_ROADS = 0.7;
const LOOP_DOORS = 0.25;
/** Only places with a front room somebody could slip out of. */
const LINKABLE: GenRole[] = ['shop', 'bar', 'club'];

/** A two-way connection between places that already exist (never adds the same one twice). */
export function join(a: Location, b: Location, labelAtoB: string, labelBtoA: string, hidden = false): void {
  if (!a.exits.some((e) => e.to === b.id)) a.exits.push({ to: b.id, label: labelAtoB, hidden, gate: null });
  if (!b.exits.some((e) => e.to === a.id)) b.exits.push({ to: a.id, label: labelBtoA, hidden, gate: null });
}

/** Child slots are numbered from the first one not already used by an exit (hand-built exits don't count). */
const firstFreeSlot = (loc: Location): number => {
  let n = 0;
  while (loc.exits.some((e) => e.to === childId(loc.id, n))) n++;
  return n;
};

interface ChildOpts {
  hidden?: boolean;
  gate?: Exit['gate'];
  label?: string;
  rank?: number;
  max?: number;
  /** Dwellings are made to order: what it's called, how well it's locked, what it looks like. */
  name?: string;
  security?: number;
  cameras?: number;
  blurb?: string;
  /** Rooms of a dungeon: the entrance it belongs to. */
  dungeon?: Id;
  /** Dungeon entrances: how hard it is, when the dice shouldn't decide. */
  tier?: number;
  /** Spots: which one (content/spots.ts). */
  spot?: string;
  /** Rooms of a gym: which gym, and which room. */
  gymRoom?: { main: Id; room: string };
  /** Rooms of a pawn shop: which shop, and which room. */
  pawnRoom?: { main: Id; room: string };
  /** Rooms of an arcade: which arcade, and which room. */
  hallRoom?: { main: Id; room: string };
  /** A street that is a highway: no buildings, no people, and a road a car can really use. */
  highway?: boolean;
}

const KIND: Record<GenRole, Location['kind']> = {
  street: 'street', clinic: 'clinic', shop: 'shop', bar: 'bar', club: 'club', corp: 'corp', flat: 'home', unit: 'home', tunnel: 'tunnel', backroom: 'bar', cellar: 'tunnel', vip: 'club',
  outpost: 'lair', hideout: 'lair', spot: 'lair', chamber: 'lair', gym: 'gym', gymroom: 'gym', pawn: 'pawn', pawnroom: 'pawn', realty: 'realty', chop: 'chop', hub: 'hub', gamehall: 'gamehall', gamehallroom: 'gamehall',
};

const clampSec = (n: number): number => Math.max(0, Math.min(9, Math.round(n)));

/** Make the place on the far side of an exit: its description, and the door back. */
function sketch(
  w: MapWorld,
  parent: Location,
  slot: number,
  role: GenRole,
  district: District,
  depth: number,
  o: ChildOpts = {},
): Location {
  const id = childId(parent.id, slot);
  const existing = w.locations[id];
  if (existing) return existing;
  const rng = stream(w, id);
  const street = role === 'street';
  // While the cordon holds, no road gets past the end of the starting district (a tunnel's ladder, a job's trail).
  if (street && !gateOpen(w)) depth = Math.min(depth, START_DEPTH);
  // How dangerous: a street walks from its parent's danger toward what its depth should be; everything else shares its street's.
  const parentDanger = dangerOf(parent);
  const danger = street ? stepDanger(parentDanger, meanDanger(depth, START_DEPTH), DISTRICT_DANGER[district] ?? 0, new Rng(`danger:${w.worldSeed}:${id}`)) : parentDanger;
  const interior = role === 'unit' || role === 'backroom' || role === 'cellar' || role === 'vip' || role === 'chamber' || role === 'gymroom' || role === 'pawnroom' || role === 'gamehallroom' || (role === 'corp' && o.rank !== undefined) || (role === 'tunnel' && o.rank !== undefined);
  const entrance = role === 'outpost' || role === 'hideout' || role === 'spot';
  const spot: SpotDef | undefined = role === 'spot' ? SPOTS[o.spot ?? '']! : undefined;
  // Dungeons draw on a stream of their own, so adding them to the map doesn't reshuffle anything else.
  const drng = entrance ? new Rng(`dungeon:${w.worldSeed}:${id}`) : null;
  // A gym is rolled whole, on a stream of its own.
  const rolled = role === 'gym' ? rollGym(new Rng(`gym:${w.worldSeed}:${id}`), district, depth) : undefined;
  // And so is a pawn shop.
  const rolledPawn = role === 'pawn' ? rollPawn(new Rng(`pawn:${w.worldSeed}:${id}`), district, depth) : undefined;
  // And a chop shop.
  // And a hub.
  const rolledHub = role === 'hub' ? rollHub(new Rng(`hub:${w.worldSeed}:${id}`), district, depth) : undefined;
  // And an arcade.
  const rolledHall = role === 'gamehall' ? rollHall(new Rng(`gamehall:${w.worldSeed}:${id}`), district, depth) : undefined;
  const rolledChop = role === 'chop' ? rollChop(new Rng(`chop:${w.worldSeed}:${id}`), district, depth) : undefined;
  const tier = spot ? o.tier ?? rollSpotTier(drng!, spot, danger) : entrance ? o.tier ?? rollTier(drng!, role as 'outpost' | 'hideout', danger, district) : undefined;
  // (An entrance is named once it's known whose it is, below.)
  let name = o.name ?? rolled?.name ?? rolledPawn?.name ?? rolledChop?.name ?? rolledHub?.name ?? rolledHall?.name ?? (entrance ? '' : o.highway ? `${rng.chance(0.5) ? pick(rng, STREET_ADJ) : pick(rng, STREET_NOUN)} ${pick(rng, HIGHWAY_SUFFIX)}` : nameFor(rng, role, district, parent, o.rank));
  const deep = Math.min(2, Math.floor(depth / 4));

  let security: number;
  switch (role) {
    case 'street': security = o.highway ? 1 : STREET_SECURITY[district] + rng.int(0, 1) + (deep > 1 ? 1 : 0); break;
    case 'clinic': security = 2 + (district === 'corporate' ? 1 : 0) + rng.int(0, 1); break;
    case 'shop': security = 1 + (district === 'market' ? 1 : 0) + (district === 'corporate' ? 1 : 0) + rng.int(0, 1); break;
    case 'bar': security = 1 + (district === 'nightlife' ? 1 : 0) + rng.int(0, 1); break;
    case 'club': security = 3 + (district === 'nightlife' ? 1 : 0) + rng.int(0, 1); break;
    case 'corp': security = o.rank ? parent.security + rng.int(1, 2) : 5 + rng.int(0, 1) + deep; break;
    case 'flat': security = 0; break;
    case 'unit': security = o.security ?? 1; break;
    case 'realty': security = 1 + (district === 'corporate' ? 1 : 0) + rng.int(0, 1); break;
    case 'tunnel': security = o.rank ? parent.security : 1 + rng.int(0, 1); break;
    case 'backroom': security = parent.security + 2; break;
    case 'cellar': security = 1; break;
    case 'vip': security = parent.security + 1; break;
    case 'outpost': security = 3 + tier!; break;
    case 'hideout': security = 2 + tier!; break;
    case 'spot': security = 1 + tier!; break;
    case 'chamber': security = o.security ?? parent.security; break;
    case 'gym': security = rolled!.security; break;
    case 'gymroom': security = o.security ?? parent.security; break;
    case 'pawn': security = rolledPawn!.security; break;
    case 'pawnroom': security = o.security ?? parent.security; break;
    case 'chop': security = rolledChop!.security; break;
    case 'hub': security = rolledHub!.security; break;
    case 'gamehall': security = rolledHall!.security; break;
    case 'gamehallroom': security = o.security ?? parent.security; break;
  }
  security = clampSec(Math.min(security, role === 'unit' || role === 'chamber' || role === 'gymroom' || role === 'pawnroom' || role === 'gamehallroom' ? 9 : role === 'corp' || role === 'backroom' || role === 'vip' ? 9 : 6));

  const crowded = role === 'gym' ? rolled!.crowded : role === 'pawn' ? rolledPawn!.crowded : role === 'chop' ? false : role === 'hub' ? rolledHub!.crowded : role === 'gamehall' ? rolledHall!.crowded : role === 'bar' ? rng.chance(0.3 + (district === 'nightlife' ? 0.3 : 0)) : role === 'club' || role === 'vip' ? true : street ? (o.highway ? false : rng.chance(CROWDED[district])) : false;
  const noCameras = role === 'flat' || (role === 'unit' && o.cameras === undefined) || role === 'tunnel' || role === 'cellar' || role === 'backroom' || entrance || role === 'chamber';

  // Its own corner of the city: a whiff of whoever is round about, and the owners where there are owners.
  const influence = inheritInfluence(w as World, [parent], rng.fork('influence'));
  const gang = street ? pickFaction(w as World, rng.fork('turf'), influence, ['gang']) : null;
  let faction: Id | undefined;
  if (role === 'outpost') {
    faction = 'atlas';
    name = o.name ?? outpostName(drng!);
  } else if (role === 'hideout') {
    const crews = Object.values(w.factions).filter((f) => f.kind === 'gang' && f.id !== 'ganger');
    // Whose it is is the world's business, not the run's: the turf around it can differ from one run's setup to the next.
    faction = crews.length ? drng!.pick(crews).id : 'ganger';
    name = o.name ?? hideoutName(drng!, w.factions[faction]?.name ?? 'Street gang');
  } else if (spot) {
    if (spot.crew === 'gang') {
      const crews = Object.values(w.factions).filter((f) => f.kind === 'gang' && f.id !== 'ganger');
      faction = crews.length ? drng!.pick(crews).id : 'ganger';
    } else if (spot.crew === 'atlas') faction = 'atlas';
    else if (spot.crew === 'npd') faction = 'npd';
    name = o.name ?? spotName(spot, drng!, faction ? w.factions[faction]?.name : undefined);
  } else if (role === 'shop') faction = 'shop';
  else if (role === 'clinic') faction = undefined;
  else if (role === 'realty') faction = 'shop';
  else if (role === 'corp') faction = 'atlas';
  else if (role === 'bar' || role === 'club') {
    faction = `v:${id}`;
    w.factions[faction] ??= { id: faction, name, kind: 'venue', relations: {} };
  } else if (role === 'gym' || role === 'pawn' || role === 'chop' || role === 'hub' || role === 'gamehall') {
    faction = `v:${id}`;
    w.factions[faction] ??= { id: faction, name, kind: 'venue', relations: {} };
  } else if (role === 'backroom' || role === 'vip' || role === 'cellar' || role === 'chamber' || role === 'gymroom' || role === 'pawnroom' || role === 'gamehallroom') faction = parent.faction;
  const blurbs = o.highway ? HIGHWAY_BLURB : street ? [`${name}. ${pick(rng, MOOD[district])}`] : rolled ? [rolled.blurb] : rolledPawn ? [rolledPawn.blurb] : rolledChop ? [rolledChop.blurb] : rolledHub ? [rolledHub.blurb] : rolledHall ? [rolledHall.blurb] : spot ? spot.blurbs : entrance ? ENTRANCE_BLURB[role as 'outpost' | 'hideout'] : BLURB[role as Exclude<GenRole, 'street'>];

  // A street is sometimes a quarter with a heritage of its own, on a stream of its own; everything off it shares that.
  const heritage = parent.gen?.heritage ?? (street && !o.highway ? rollQuarter(w, id) : undefined);
  const toStreet = streetOf(w, parent);
  const loc: Location = {
    id,
    name,
    kind: KIND[role],
    exits: [{ to: parent.id, label: street || role === 'tunnel' ? `back to ${parent.name}` : interior ? 'the way back out' : `back out to ${parent.name}`, hidden: false, gate: null }],
    security,
    crowded,
    outdoors: street,
    tossTo: toStreet,
    fleeTo: parent.id,
    visits: 0,
    cameras: noCameras ? 0 : o.cameras ?? (o.highway ? 1 : clampSec(security / 2)),
    graffiti: 0,
    territory: gang && (influence[gang] ?? 0) >= 0.5 ? gang : null,
    influence,
    populated: false,
    blurb: o.blurb ?? pick(rng, blurbs).replace('{name}', name.charAt(0).toUpperCase() + name.slice(1)),
    gen: { role, parent: parent.id, slot, depth, district, danger, expanded: false, ...(heritage ? { heritage } : {}), ...(o.rank !== undefined ? { rank: o.rank } : {}), ...(o.max !== undefined ? { max: o.max } : {}), ...(tier !== undefined ? { tier } : {}), ...(spot ? { spot: spot.key } : {}) },
  };
  if (faction) loc.faction = faction;
  if (o.highway) loc.road = 'highway';
  if (street) loc.street = o.highway ? 'highway' : typeFromName(loc.name, true);
  if (rolled) {
    loc.gym = rolled.info;
    loc.graffiti = CONDITIONS[rolled.info.condition]?.graffiti ?? 0;
  }
  if (rolledChop) loc.chop = rolledChop.info;
  if (rolledHub) {
    loc.hub = rolledHub.info;
    if (rolledHub.info.variant === 'academy') loc.hours = [8, 20];
    loc.graffiti = CONDITIONS[rolledHub.info.condition]?.graffiti ?? 0;
  }
  if (rolledPawn) {
    loc.pawn = rolledPawn.info;
    loc.graffiti = CONDITIONS[rolledPawn.info.condition]?.graffiti ?? 0;
  }
  if (rolledHall) {
    loc.gamehall = rolledHall.info;
    loc.graffiti = CONDITIONS[rolledHall.info.condition]?.graffiti ?? 0;
  }
  if (o.hallRoom) loc.hallRoom = o.hallRoom;
  if (o.gymRoom) loc.gymRoom = o.gymRoom;
  if (o.pawnRoom) loc.pawnRoom = o.pawnRoom;
  if (entrance) loc.dungeon = id;
  else if (o.dungeon) loc.dungeon = o.dungeon;
  w.locations[id] = loc;

  const label = (o.label ?? name).replace('{name}', name);
  parent.exits.push({ to: id, label, hidden: !!o.hidden, gate: o.gate ?? null });
  placeOnHex(w, loc, parent, role, interior);
  return loc;
}

/** An outpost or a hideout on a street that already exists. (Streets grow them on their own; this is for putting one somewhere on purpose.) */
export function addDungeon(w: MapWorld, street: Location, kind: 'outpost' | 'hideout', slot: number, tier?: number): Location {
  expand(w, street);
  return sketch(w, street, slot, kind, street.gen?.district ?? 'industrial', street.gen?.depth ?? 1, { tier });
}

/** A spot on a street that already exists. (Streets grow them on their own; this is for putting one somewhere on purpose.) */
export function addSpot(w: MapWorld, street: Location, key: string, slot: number, tier?: number): Location {
  expand(w, street);
  return sketch(w, street, slot, 'spot', street.gen?.district ?? 'industrial', street.gen?.depth ?? 1, { tier, spot: key });
}

/** Child slots from here up are for places made to order (a job's trail and site), so they can't land on a slot a street grows on its own. */
const MADE_TO_ORDER = 1000;

const TRAIL_TAIL = ['that the map has stopped bothering with', 'where the streetlights give up', 'that nobody has fixed in years', 'running out past the last shuttered stall', 'with more drains than doors', 'where the signs are mostly warnings'];

export interface SiteSpec {
  role: 'outpost' | 'hideout' | 'spot';
  /** Spots: which one (content/spots.ts). */
  spot?: string;
  tier: number;
}

/**
 * A place made for a job: a trail of `length` new streets leading off `from`, and a spot or a dungeon on the last of them.
 * Everything comes from `key` (and the world), so the same job is in the same place however the save got there. The streets
 * are ordinary streets and grow when she reaches them; the site is an ordinary spot or dungeon, built when she reaches its door,
 * with `giver` written on it so the building knows what it is for. Idempotent: asking again returns what is already there.
 */
export function addQuestSite(
  w: MapWorld,
  from: Location,
  key: string,
  length: number,
  site: SiteSpec,
  giver: Id,
): { streets: Location[]; entrance: Location } {
  const rng = new Rng(`trail:${w.worldSeed}:${key}`);
  const streets: Location[] = [];
  let at = from;
  let district: District = from.gen?.district ?? 'slum';
  for (let i = 0; i < length; i++) {
    district = rng.chance(0.7) ? district : pick(rng, NEXT_TO[district]);
    at = sketch(w, at, MADE_TO_ORDER + (hashString(`${key}:${i}`) % 9000), 'street', district, (at.gen?.depth ?? 0) + 1, { label: `{name}, ${pick(rng, TRAIL_TAIL)}` });
    streets.push(at);
  }
  // The street the site is on is lived in like any other: it grows its own lots, and the site is one more thing on it.
  expand(w, at);
  const depth = at.gen?.depth ?? 1;
  const entrance = sketch(w, at, MADE_TO_ORDER + (hashString(`${key}:site`) % 9000), site.role, district, depth, { tier: site.tier, ...(site.spot ? { spot: site.spot } : {}) });
  entrance.gen!.quest = giver;
  return { streets, entrance };
}

/** "the Chrome Vipers' dead drop", "Atlas drone repair bay 4-B". */
function spotName(def: SpotDef, rng: Rng, crew: string | undefined): string {
  return rng.pick(def.names).replace('{gang}', `the ${possessive(crew ?? 'Street gang')}`).replace('{code}', rng.pick(OUTPOST_CODE));
}

/** A room inside a dungeon, off `parent`. Dungeons say what it's called, how well it's guarded and what it looks like. */
export function addChamber(
  w: MapWorld,
  parent: Location,
  slot: number,
  o: { name: string; security: number; blurb: string; label: string; dungeon: Id },
): Location {
  return sketch(w, parent, slot, 'chamber', parent.gen?.district ?? 'industrial', parent.gen?.depth ?? 1, { name: o.name, security: o.security, cameras: 0, blurb: o.blurb, label: o.label, dungeon: o.dungeon });
}

/** The nearest outdoor place back up the tree, for being thrown out onto. */
export function streetOf(w: Pick<World, 'locations'>, from: Location): Id {
  let cur: Location | undefined = from;
  for (let i = 0; cur && i < 40; i++) {
    if (cur.outdoors) return cur.id;
    cur = cur.gen ? w.locations[cur.gen.parent] : undefined;
  }
  return from.tossTo;
}

function nameFor(rng: Rng, role: GenRole, district: District, parent: Location, rank?: number): string {
  switch (role) {
    case 'street': {
      const suffix = rng.chance(0.5) && STREET_SUFFIX_BY[district] ? pick(rng, STREET_SUFFIX_BY[district]!) : pick(rng, STREET_SUFFIX);
      return rng.chance(0.5) ? `${pick(rng, STREET_ADJ)} ${suffix}` : `${pick(rng, STREET_NOUN)} ${suffix}`;
    }
    case 'clinic': return pick(rng, CLINIC_NAME);
    case 'shop': return rng.chance(0.6) ? `${possessive(pick(rng, OWNER))} ${pick(rng, SHOP_THING)}` : pick(rng, SHOP_THING);
    case 'bar': return `The ${pick(rng, BAR_ADJ)} ${pick(rng, BAR_NOUN)}`;
    case 'club': return pick(rng, CLUB_NAME);
    case 'realty': return officeName(rng);
    case 'corp': return rank ? `${parent.name.split(' ').slice(0, 2).join(' ')} ${FLOOR[(rng.int(0, FLOOR.length - 1) + rank) % FLOOR.length]}` : `${pick(rng, CORP)} ${pick(rng, DIVISION)}`;
    case 'flat': return `${pick(rng, FLAT_WORD)} ${pick(rng, FLAT_NAME)}`;
    case 'tunnel': return rank ? `${parent.name.replace(/, further in$/, '')}, further in` : `the ${pick(rng, TUNNEL_ADJ)} ${pick(rng, TUNNEL_NAME)}`;
    case 'unit': return `a flat in ${parent.name}`;
    case 'backroom': return `${possessive(parent.name)} back room`;
    case 'cellar': return `${possessive(parent.name)} cellar`;
    case 'vip': return `${possessive(parent.name)} VIP lounge`;
    case 'outpost': case 'hideout': case 'spot': case 'chamber': case 'gym': case 'gymroom': case 'pawn': case 'pawnroom': case 'chop': case 'hub': case 'gamehall': case 'gamehallroom': return parent.name; // dungeons, gyms, pawn shops and chop shops name themselves; see sketch
  }
}

/** A name for a new bar or club, the way the city makes them up. */
export const venueName = (rng: Rng, kind: 'bar' | 'club'): string => (kind === 'bar' ? `The ${pick(rng, BAR_ADJ)} ${pick(rng, BAR_NOUN)}` : pick(rng, CLUB_NAME));

/** What she sees the first time she walks into it. */
export const venueBlurb = (rng: Rng, kind: 'bar' | 'club', name: string): string => pick(rng, BLURB[kind]).replace('{name}', name);

/** Is this place a district of the generated city (and how far out)? For tests and tooling. */
export const generated = (loc: Location): boolean => !!loc.gen;
export const allDistricts = (): District[] => [...DISTRICTS];

// ===================================================================== dwellings

export type Dwelling = 'capsule' | 'flat' | 'penthouse';

/** What a person can afford to sleep in. It is a cramped megacity: most people get a capsule. */
export const dwellingFor = (cash: number, corp: boolean): Dwelling => (corp || cash >= 450 ? 'penthouse' : cash >= 160 ? 'flat' : 'capsule');

const DWELLING: Record<Dwelling, { label: string; security: [number, number]; blurbs: string[] }> = {
  capsule: {
    label: 'capsule hab',
    security: [0, 1],
    blurbs: ['{name}: a bunk, a hot plate and a shelf that is doing the work of a wardrobe. Everything within arm\'s reach, which is the point.', '{name}: two metres by three, one window onto an air shaft, and a lock that has seen worse.'],
  },
  flat: {
    label: 'flat',
    security: [1, 2],
    blurbs: ['{name}: one room and a half, a kitchenette and a real door. Somebody has made it theirs.', '{name}: small, tidy and humming, with a plant in the window that is trying its best.'],
  },
  penthouse: {
    label: 'penthouse',
    security: [3, 5],
    blurbs: ['{name}: glass on three sides, a view of the dragon patrols and a lock that costs more than a flat.', '{name}: quiet money. Pale floors, soft light and a door that logs everything that touches it.'],
  },
};

/**
 * Somewhere for somebody to live, on a street that already exists: the building (an existing flat lot if the street
 * has one, else a new one) and their own door inside it. Ids come from the owner, not the order things were found
 * in, so the same person lives in the same place in every run of the same save.
 */
export function addDwelling(w: MapWorld, street: Location, owner: { id: Id; name: string }, size: Dwelling): Location {
  expand(w, street);
  const district: District = street.gen?.district ?? 'tenement';
  const depth = street.gen?.depth ?? 1;
  const tag = hashString(`dwelling:${owner.id}`);
  let block = street.exits.map((e) => w.locations[e.to]).find((l): l is Location => l?.gen?.role === 'flat' && l.gen.parent === street.id);
  if (!block) block = sketch(w, street, 200 + (tag % 700), 'flat', district, depth);
  const name = `${possessive(owner.name)} ${DWELLING[size].label}`;
  return addUnit(w, block, 100 + (tag % 900), size, name, `${possessive(owner.name)} door`, owner.id);
}

/**
 * A home somebody has bought, on a street that already exists: a door in the street's apartment block (made if it has none).
 * `key` is the deed, so the same purchase is the same place; if the slot it hashes to is taken, it takes the next.
 */
export function addHome(w: MapWorld, street: Location, key: string, o: { name: string; label: string; blurb: string; security: number; cameras: number }): Location {
  expand(w, street);
  const district: District = street.gen?.district ?? 'tenement';
  const depth = street.gen?.depth ?? 1;
  let block = street.exits.map((e) => w.locations[e.to]).find((l): l is Location => l?.gen?.role === 'flat' && l.gen.parent === street.id);
  if (!block) block = sketch(w, street, 200 + (hashString(`dwelling:${key}`) % 700), 'flat', district, depth);
  let slot = 100 + (hashString(`dwelling:${key}`) % 900);
  while (w.locations[childId(block.id, slot)]) slot++;
  return sketch(w, block, slot, 'unit', district, depth, { name: o.name, security: o.security, cameras: o.cameras, blurb: o.blurb, label: o.label });
}

/** A door in an apartment block: somebody's home, made to order. `key` seeds how it looks and how well it's locked. */
export function addUnit(w: MapWorld, block: Location, slot: number, size: Dwelling, name: string, label: string, key: string): Location {
  const district: District = block.gen?.district ?? 'tenement';
  const depth = block.gen?.depth ?? 1;
  const d = DWELLING[size];
  const rng = stream(w, `${block.id}:${key}`);
  const security = rng.int(d.security[0], d.security[1]);
  return sketch(w, block, slot, 'unit', district, depth, {
    name,
    security,
    cameras: size === 'penthouse' ? clampSec(security / 2) : 0,
    blurb: pick(rng, d.blurbs).replace('{name}', name.charAt(0).toUpperCase() + name.slice(1)),
    label,
  });
}

/** What a block's doors are like, by district: the poor end of town is capsules, the rich end is not. */
export function sizeOfDoor(w: Pick<World, 'worldSeed'>, block: Location, slot: number): Dwelling {
  const rng = stream(w, `${block.id}:size:${slot}`);
  switch (block.gen?.district) {
    case 'corporate': return rng.chance(0.4) ? 'penthouse' : 'flat';
    case 'market': case 'nightlife': return rng.chance(0.2) ? 'capsule' : 'flat';
    default: return rng.chance(0.7) ? 'capsule' : 'flat';
  }
}

export const flatName = (w: Pick<World, 'worldSeed'>, block: Location, slot: number): string => {
  const rng = stream(w, `${block.id}:flat:${slot}`);
  return `flat ${rng.int(1, 9)}${'ABCDEF'[rng.int(0, 5)]}`;
};
