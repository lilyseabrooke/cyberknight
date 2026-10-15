import { Rng } from './rng';
import { inheritInfluence, pickFaction } from './factions';
import type { District, Exit, GenRole, Id, Location, World } from './types';

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

type Lot = Exclude<GenRole, 'street' | 'backroom' | 'cellar' | 'vip'>;

/** What stands along a street, by district. */
const LOTS: Record<District, Record<Lot, number>> = {
  market: { shop: 5, bar: 2, club: 0.5, corp: 0.4, flat: 1, tunnel: 0.5 },
  nightlife: { shop: 1.5, bar: 4, club: 3, corp: 0.3, flat: 0.5, tunnel: 0.5 },
  tenement: { shop: 2, bar: 2, club: 0.2, corp: 0.2, flat: 5, tunnel: 1 },
  industrial: { shop: 1, bar: 1, club: 0.2, corp: 2, flat: 1, tunnel: 3 },
  corporate: { shop: 1.5, bar: 1, club: 1, corp: 4, flat: 0.5, tunnel: 0.3 },
  slum: { shop: 1.5, bar: 2, club: 0.3, corp: 0.1, flat: 3, tunnel: 2 },
};

const STREET_SECURITY: Record<District, number> = { market: 2, nightlife: 2, tenement: 1, industrial: 1, corporate: 3, slum: 1 };
const CROWDED: Record<District, number> = { market: 0.5, nightlife: 0.6, tenement: 0.25, industrial: 0.05, corporate: 0.2, slum: 0.2 };

// ===================================================================== names and words

const STREET_ADJ = ['Cinder', 'Sodium', 'Lantern', 'Hollow', 'Copper', 'Static', 'Drowned', 'Velvet', 'Paper', 'Brass', 'Orchid', 'Tin', 'Gutter', 'Saffron', 'Ember', 'Quiet', 'Rust', 'Midnight', 'Ghost', 'Lucky', 'Glass', 'Kerosene', 'Soda', 'Slate'];
const STREET_NOUN = ['Dumpling', 'Pylon', 'Heron', 'Cable', 'Anchor', 'Lotus', 'Wire', 'Foundry', 'Mule', 'Eel', 'Relay', 'Ledger', 'Kettle', 'Sparrow', 'Tram', 'Abacus', 'Moth', 'Switch', 'Kiln', 'Pagoda', 'Fuse', 'Rickshaw', 'Barge', 'Lamp'];
const STREET_SUFFIX = ['Street', 'Row', 'Lane', 'Alley', 'Way', 'Avenue', 'Walk', 'Run', 'Arcade', 'Terrace', 'Passage'];
const STREET_SUFFIX_BY: Partial<Record<District, string[]>> = {
  market: ['Bazaar', 'Market', 'Arcade', 'Row'],
  industrial: ['Yard', 'Freightway', 'Run', 'Wharf'],
  corporate: ['Plaza', 'Boulevard', 'Concourse', 'Avenue'],
};
const STREET_TAIL = ['running off east', 'heading west under the sodium lights', 'bending away out of sight', 'where the signs get louder', 'where the lights get fewer', 'sloping down toward the water', 'climbing between the stacks', 'that Blackbird has never noticed before'];

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
const MOOD: Record<District, string[]> = {
  market: ['Hawkers, steam and a hundred hand-lettered signs, none of them accurate.', 'Every doorway is selling something, and most of it is the doorway.', 'A haggle in six languages is going on at a volume nobody asked for.'],
  nightlife: ['Neon, bass through the walls, and a queue of people dressed for a worse idea than they know.', 'Every other window is a bar, and every bar has a bouncer who has already judged her boots.', 'The gutters are full of confetti and something that used to be a cocktail.'],
  tenement: ['Laundry on every balcony, a thousand small windows, and a smell of someone else\'s dinner.', 'Stacked homes lean over the street like they\'re eavesdropping.', 'Kids\' chalk on the pavement, and a drone from the management company watching it fade.'],
  industrial: ['Freight rails, chain-link and the hum of machines that run all night for no one.', 'Everything here is matte, heavy and labelled with a barcode.', 'A crane the size of a church turns slowly overhead, carrying nothing.'],
  corporate: ['Glass, steel and a security camera for every window, all of them polite.', 'The pavement is cleaner than anything in the Halo, which feels like an accusation.', 'Holographic mission statements drift down the street at head height.'],
  slum: ['Tarps, tin and a fire in a barrel; everyone here has learned to look at nothing.', 'The streetlights are out and nobody has bothered to report it.', 'Somebody has built a house out of other houses.'],
};

const BLURB: Record<Exclude<GenRole, 'street'>, string[]> = {
  shop: ['{name}: shelves to the ceiling, a bell on the door, and a proprietor who has already priced everything on you.', '{name}: fluorescent, narrow and crammed, and everything has a handwritten tag that says PROBABLY FINE.', '{name}: a shop that is very proud of itself and has no right to be.'],
  bar: ['{name}: low light, sticky floor, a regular for every stool and the same song on the jukebox it was playing yesterday.', '{name}: a bar that has decided to be a mood. The taps are mostly decorative.', '{name}: dark wood, bad neon and a bartender who looks at her once and remembers it.'],
  club: ['{name}: bass you can feel in your implants, light that has opinions, and a crowd that has paid to forget.', '{name}: a dance floor, a strobe, and a ceiling covered in someone\'s old holiday lights.', '{name}: sweat, glitter and a velvet rope that hasn\'t decided about her yet.'],
  corp: ['{name}: a lobby of pale stone and soft carpet, and a receptionist hologram that smiles at her without moving its eyes.', '{name}: everything is white and quiet and has a barcode, and she can feel the cameras agreeing about her.', '{name}: a corporate front office in the sense that it fronts, and an office in no sense at all.'],
  flat: ['{name}: a stairwell, a lot of doors, and one of them is very probably someone\'s.', '{name}: tiny, humming, tidy in a way that costs effort; somebody\'s plant is trying its best.', '{name}: a landing that smells of rice, ozone and rent.'],
  tunnel: ['{name}: pipes, drips and a distant hum that is either machinery or a very patient animal.', '{name}: a long concrete throat, lit by one working strip and a lot of graffiti.', '{name}: damp, close and echoing, and everything she steps on goes crunch.'],
  backroom: ['{name}: smoke, a card table and the feeling of a conversation that stopped when she opened the door.', '{name}: crates, a lock on the inside and a single bulb. The kind of room with a reason.'],
  cellar: ['{name}: kegs, damp and a single bulb on a string. The ceiling hums with whoever is above it.', '{name}: stairs down, stairs down, and then a room that is mostly bottles and spiders.'],
  vip: ['{name}: leather, a mirrored ceiling and a minibar that costs more than her armor.', '{name}: a velvet cage above the dance floor, where the people who matter are being watched by the people who don\'t.'],
};

// ===================================================================== ids

/** A child's id is its parent's plus the slot it was born in. Stable, and says where the place is. */
export const childId = (parent: Id, slot: number): Id => (parent.includes('~') ? `${parent}.${slot}` : `${parent}~${slot}`);

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
  { at: 'club_backlot', roads: [{ label: 'a service road behind the lots', districts: ['industrial', 'slum'] }] },
  { at: 'halo_alley', roads: [{ label: 'a narrow cut between the buildings', districts: ['slum', 'tenement'] }] },
];

/**
 * Open the hand-built district onto the rest of the city. Safe to call again (it only adds what's
 * missing), which is how a save from before the map grew gets its edges.
 */
export function seedFrontier(w: Pick<World, 'worldSeed' | 'locations' | 'factions'>): void {
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
}

// ===================================================================== growing

/**
 * Make the neighbours of a place she has just reached. Idempotent: a place that has been
 * expanded does nothing. Hand-built places have nothing to grow (their edges were seeded).
 */
export function expand(w: Pick<World, 'worldSeed' | 'locations' | 'factions'>, loc: Location): void {
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
      const onward = rng.chance(0.5) ? 2 : 1;
      const lots = rng.int(2, 4);
      const taken: Lot[] = [];
      const fronts: Location[] = [];
      const roads: Location[] = [];
      for (let i = 0; i < lots; i++) {
        const weights = LOTS[here];
        const role = rng.weighted(Object.keys(weights) as Lot[], (r) => weights[r] * (taken.includes(r) ? 0.4 : 1) * (r === 'corp' && g.depth < 2 && here !== 'corporate' ? 0.3 : 1));
        taken.push(role);
        fronts.push(add(role, here, g.depth));
      }
      for (let i = 0; i < onward; i++) {
        const next = rng.chance(0.7) ? here : pick(rng, NEXT_TO[here]);
        roads.push(add('street', next, g.depth + 1, { label: `{name}, ${pick(rng, STREET_TAIL)}` }));
      }
      // Loops. Everything here is decided now, from this street's own stream, between places that
      // already exist, so the shortcuts are the same whichever end of them she finds first.
      if (roads.length === 2 && rng.chance(LOOP_ROADS)) join(roads[0]!, roads[1]!, `a cut-through to ${roads[1]!.name}`, `a cut-through to ${roads[0]!.name}`);
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
    case 'tunnel': {
      // A tunnel goes somewhere: on along itself for a stretch, then up into a street.
      const max = g.max ?? rng.int(1, 3);
      const rank = g.rank ?? 1;
      g.max = max;
      g.rank = rank;
      if (rank < max) add('tunnel', g.district, g.depth, { rank: rank + 1, max });
      else add('street', rng.chance(0.5) ? g.district : pick(rng, NEXT_TO[g.district]), g.depth + 1, { label: '{name}, up a ladder into daylight (such as it is)' });
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
}

const KIND: Record<GenRole, Location['kind']> = {
  street: 'street', shop: 'shop', bar: 'bar', club: 'club', corp: 'corp', flat: 'home', tunnel: 'tunnel', backroom: 'bar', cellar: 'tunnel', vip: 'club',
};

const clampSec = (n: number): number => Math.max(0, Math.min(9, Math.round(n)));

/** Make the place on the far side of an exit: its description, and the door back. */
function sketch(
  w: Pick<World, 'worldSeed' | 'locations' | 'factions'>,
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
  const interior = role === 'backroom' || role === 'cellar' || role === 'vip' || (role === 'corp' && o.rank !== undefined) || (role === 'tunnel' && o.rank !== undefined);
  const name = nameFor(rng, role, district, parent, o.rank);
  const deep = Math.min(2, Math.floor(depth / 4));

  let security: number;
  switch (role) {
    case 'street': security = STREET_SECURITY[district] + rng.int(0, 1) + (deep > 1 ? 1 : 0); break;
    case 'shop': security = 1 + (district === 'market' ? 1 : 0) + (district === 'corporate' ? 1 : 0) + rng.int(0, 1); break;
    case 'bar': security = 1 + (district === 'nightlife' ? 1 : 0) + rng.int(0, 1); break;
    case 'club': security = 3 + (district === 'nightlife' ? 1 : 0) + rng.int(0, 1); break;
    case 'corp': security = o.rank ? parent.security + rng.int(1, 2) : 5 + rng.int(0, 1) + deep; break;
    case 'flat': security = 0; break;
    case 'tunnel': security = o.rank ? parent.security : 1 + rng.int(0, 1); break;
    case 'backroom': security = parent.security + 2; break;
    case 'cellar': security = 1; break;
    case 'vip': security = parent.security + 1; break;
  }
  security = clampSec(Math.min(security, role === 'corp' || role === 'backroom' || role === 'vip' ? 9 : 6));

  const crowded = role === 'bar' ? rng.chance(0.3 + (district === 'nightlife' ? 0.3 : 0)) : role === 'club' || role === 'vip' ? true : street ? rng.chance(CROWDED[district]) : false;
  const noCameras = role === 'flat' || role === 'tunnel' || role === 'cellar' || role === 'backroom';
  const blurbs = street ? [`${name}. ${pick(rng, MOOD[district])}`] : BLURB[role as Exclude<GenRole, 'street'>];

  // Its own corner of the city: a whiff of whoever is round about, and the owners where there are owners.
  const influence = inheritInfluence(w as World, [parent], rng.fork('influence'));
  const gang = street ? pickFaction(w as World, rng.fork('turf'), influence, ['gang']) : null;
  let faction: Id | undefined;
  if (role === 'shop') faction = 'shop';
  else if (role === 'corp') faction = 'atlas';
  else if (role === 'bar' || role === 'club') {
    faction = `v:${id}`;
    w.factions[faction] ??= { id: faction, name, kind: 'venue', relations: {} };
  } else if (role === 'backroom' || role === 'vip' || role === 'cellar') faction = parent.faction;

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
    cameras: noCameras ? 0 : clampSec(security / 2),
    graffiti: 0,
    territory: gang && (influence[gang] ?? 0) >= 0.5 ? gang : null,
    influence,
    populated: false,
    blurb: pick(rng, blurbs).replace('{name}', name.charAt(0).toUpperCase() + name.slice(1)),
    gen: { role, parent: parent.id, slot, depth, district, expanded: false, ...(o.rank !== undefined ? { rank: o.rank } : {}), ...(o.max !== undefined ? { max: o.max } : {}) },
  };
  if (faction) loc.faction = faction;
  w.locations[id] = loc;

  const label = (o.label ?? name).replace('{name}', name);
  parent.exits.push({ to: id, label, hidden: !!o.hidden, gate: o.gate ?? null });
  return loc;
}

/** The nearest outdoor place back up the tree, for being thrown out onto. */
function streetOf(w: Pick<World, 'locations'>, from: Location): Id {
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
    case 'shop': return rng.chance(0.6) ? `${possessive(pick(rng, OWNER))} ${pick(rng, SHOP_THING)}` : pick(rng, SHOP_THING);
    case 'bar': return `The ${pick(rng, BAR_ADJ)} ${pick(rng, BAR_NOUN)}`;
    case 'club': return pick(rng, CLUB_NAME);
    case 'corp': return rank ? `${parent.name.split(' ').slice(0, 2).join(' ')} ${FLOOR[(rng.int(0, FLOOR.length - 1) + rank) % FLOOR.length]}` : `${pick(rng, CORP)} ${pick(rng, DIVISION)}`;
    case 'flat': return `${pick(rng, FLAT_WORD)} ${pick(rng, FLAT_NAME)}`;
    case 'tunnel': return rank ? `${parent.name.replace(/, further in$/, '')}, further in` : `the ${pick(rng, TUNNEL_ADJ)} ${pick(rng, TUNNEL_NAME)}`;
    case 'backroom': return `${possessive(parent.name)} back room`;
    case 'cellar': return `${possessive(parent.name)} cellar`;
    case 'vip': return `${possessive(parent.name)} VIP lounge`;
  }
}

/** Is this place a district of the generated city (and how far out)? For tests and tooling. */
export const generated = (loc: Location): boolean => !!loc.gen;
export const allDistricts = (): District[] => [...DISTRICTS];
