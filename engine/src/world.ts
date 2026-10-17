import { Rng } from './rng';
import { genShelf } from './weapons';
import { rollGovernmentName, rollPersonality, type Personality } from './personality';
import { GANGS, spawnNpc } from './content/archetypes';
import { makeItem } from './content/items';
import { newMind } from './mind';
import { assignBounties } from './bounty';
import { newFactions, setRelation } from './factions';
import { link } from './ties';
import { START_MINUTE } from './clock';
import { DROPS } from './content/drops';
import { seedFrontier } from './mapgen';
import type { Exit, Feature, Gender, Hero, Id, Location, Npc, World } from './types';

const ex = (to: Id, label: string, o: Partial<Exit> = {}): Exit => ({ to, label, hidden: false, gate: null, ...o });

type LocDef = Omit<Location, 'visits' | 'id' | 'graffiti' | 'territory' | 'cameras'>;

/** Security cameras by location. Anything she does in view of one gets reported. */
const CAMERAS: Record<Id, number> = {
  halo_floor: 1, halo_arcade: 1, halo_backroom: 1, street_main: 3, neon_pharaoh: 3, club_greenroom: 1, paint_shop: 1,
  chem_mart: 2, gun_shop: 3, helix_dock: 3, helix_lobby: 4, helix_lab: 4, overpass: 2,
};

const LOCATIONS: Record<Id, LocDef> = {
  halo_floor: {
    name: 'The Rusty Halo', kind: 'bar', security: 1, crowded: true, outdoors: false, tossTo: 'street_main', fleeTo: 'halo_alley',
    exits: [
      ex('halo_restroom', 'the bathroom (the door says "SANITARY-ISH")'),
      ex('halo_kitchen', 'the kitchen'),
      ex('halo_arcade', 'the basement laser-tag arena'),
      ex('halo_backroom', 'the private backroom', { gate: 'locked' }),
      ex('street_main', 'the front door'),
    ],
  },
  halo_restroom: {
    name: 'Halo restroom', kind: 'bar', security: 0, crowded: false, outdoors: false, tossTo: 'halo_floor', fleeTo: 'halo_floor',
    exits: [ex('halo_floor', 'back to the bar')],
  },
  halo_kitchen: {
    name: 'Halo kitchen', kind: 'bar', security: 1, crowded: false, outdoors: false, tossTo: 'halo_alley', fleeTo: 'halo_alley',
    exits: [
      ex('halo_floor', 'the bar floor'),
      ex('halo_alley', 'the grease-slick back door'),
      ex('halo_roof', 'the service stairs to the roof'),
    ],
  },
  halo_arcade: {
    name: 'Halo basement arcade', kind: 'bar', security: 0, crowded: false, outdoors: false, tossTo: 'halo_floor', fleeTo: 'halo_floor',
    exits: [ex('halo_floor', 'the stairs up')],
  },
  halo_backroom: {
    name: 'Halo backroom', kind: 'bar', security: 3, crowded: false, outdoors: false, tossTo: 'halo_floor', fleeTo: 'halo_floor',
    exits: [ex('halo_floor', 'the bar floor')],
  },
  halo_roof: {
    name: 'Halo roof', kind: 'street', security: 0, crowded: false, outdoors: true, tossTo: 'halo_kitchen', fleeTo: 'halo_kitchen',
    exits: [
      ex('halo_kitchen', 'the service stairs'),
      ex('neon_pharaoh', "a running leap at the Neon Pharaoh's skylight", { gate: 'jump' }),
    ],
  },
  halo_alley: {
    name: 'Halo alley', kind: 'street', security: 2, crowded: false, outdoors: true, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [
      ex('street_main', 'Strand Street'),
      ex('halo_kitchen', 'the kitchen door'),
      ex('club_maintenance', 'a maintenance hatch behind the dumpster', { hidden: true, misroute: 'helix_dock' }),
      ex('club_backlot', 'a gap in the chain-link fence'),
    ],
  },
  street_main: {
    name: 'Strand Street', kind: 'street', security: 3, crowded: true, outdoors: true, tossTo: 'halo_alley', fleeTo: 'halo_alley',
    exits: [
      ex('halo_floor', 'the Rusty Halo'),
      ex('halo_alley', 'the alley beside the Halo'),
      ex('neon_pharaoh', 'the Neon Pharaoh nightclub', { gate: 'bouncer' }),
      ex('paint_shop', 'Spray & Pray Paint Supply'),
      ex('chem_mart', 'Lucky Seven Chem-Mart (open 24 hours, regrets sold separately)'),
      ex('gun_shop', 'Bullets & Bagels'),
      ex('overpass', 'the Kowloon Overpass (where the dragon patrols)'),
    ],
  },
  neon_pharaoh: {
    name: 'The Neon Pharaoh', kind: 'club', security: 5, crowded: true, outdoors: false, tossTo: 'street_main', fleeTo: 'club_maintenance',
    exits: [
      ex('street_main', 'the front doors'),
      ex('club_maintenance', 'a staff door marked MAINTENANCE', { hidden: true, misroute: 'helix_dock' }),
      ex('club_backlot', "the club's back door, propped open with a milk crate"),
      ex('club_greenroom', 'a door marked BAND & STAFF ONLY (propped open with an amp)'),
    ],
  },
  club_greenroom: {
    name: "The Neon Pharaoh's green room", kind: 'club', security: 4, crowded: false, outdoors: false, tossTo: 'club_backlot', fleeTo: 'club_backlot',
    exits: [
      ex('neon_pharaoh', 'the door back to the club floor'),
      ex('club_backlot', 'the fire exit'),
    ],
  },
  home_stacks: {
    name: 'The Stacks, unit 4C', kind: 'home', security: 0, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [ex('street_main', 'the stairwell down to Strand Street')],
  },
  home_hab: {
    name: 'a capsule hab in the Honeycomb', kind: 'home', security: 0, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [ex('street_main', 'the corridor out to Strand Street')],
  },
  home_penthouse: {
    name: 'a corporate penthouse with a view of the dragon patrols', kind: 'home', security: 0, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [ex('street_main', 'the express lift down to Strand Street')],
  },
  paint_shop: {
    name: 'Spray & Pray Paint Supply', kind: 'shop', security: 1, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [ex('street_main', 'the street')],
  },
  chem_mart: {
    name: 'Lucky Seven Chem-Mart', kind: 'shop', security: 2, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [ex('street_main', 'the street')],
  },
  gun_shop: {
    name: 'Bullets & Bagels', kind: 'shop', security: 4, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [ex('street_main', 'the street')],
  },
  club_backlot: {
    name: 'The lot behind the Neon Pharaoh', kind: 'street', security: 1, crowded: false, outdoors: true, tossTo: 'street_main', fleeTo: 'halo_alley',
    exits: [
      ex('halo_alley', 'the gap in the fence'),
      ex('neon_pharaoh', "the club's back door"),
    ],
  },
  club_maintenance: {
    name: 'Maintenance crawlspace', kind: 'tunnel', security: 2, crowded: false, outdoors: false, tossTo: 'halo_alley', fleeTo: 'halo_alley',
    exits: [
      ex('neon_pharaoh', 'the staff door up to the club', { misroute: 'helix_dock' }),
      ex('halo_alley', 'the hatch to the alley'),
      ex('helix_dock', 'a ventilation duct stenciled HELIX BIOTECH, AUTHORIZED PERSONNEL ONLY'),
    ],
  },
  helix_dock: {
    name: 'Helix Biotech loading dock', kind: 'corp', security: 6, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'club_maintenance',
    exits: [
      ex('club_maintenance', 'the ventilation duct'),
      ex('helix_lobby', 'the freight corridor to the lobby', { gate: 'guarded' }),
      ex('helix_lab', 'the freight elevator to Research', { gate: 'guarded' }),
    ],
  },
  helix_lobby: {
    name: 'Helix Biotech lobby', kind: 'corp', security: 7, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [
      ex('street_main', 'the revolving doors to Strand Street'),
      ex('helix_dock', 'the freight corridor', { gate: 'guarded' }),
      ex('helix_lab', 'the executive elevator to Research', { gate: 'guarded' }),
    ],
  },
  helix_lab: {
    name: 'Helix Research Wing', kind: 'corp', security: 8, crowded: false, outdoors: false, tossTo: 'street_main', fleeTo: 'helix_dock',
    exits: [
      ex('helix_dock', 'the freight elevator'),
      ex('helix_lobby', 'the executive elevator'),
    ],
  },
  overpass: {
    name: 'Kowloon Overpass', kind: 'boss', security: 0, crowded: false, outdoors: true, tossTo: 'street_main', fleeTo: 'street_main',
    exits: [ex('street_main', 'back down to Strand Street')],
  },
};

const FEATURES: [Id, string, string][] = [
  ['halo_floor', 'the cash register', 'till'],
  ['halo_floor', 'the jukebox / karaoke stage', 'karaoke'],
  ['halo_floor', 'the pool table', 'pool'],
  ['halo_restroom', 'the cracked mirror', 'mirror'],
  ['halo_kitchen', 'the walk-in fridge', 'fridge'],
  ['halo_arcade', 'the laser-tag arena', 'laser_tag'],
  ['halo_backroom', 'the wall safe', 'safe'],
  ['halo_roof', 'the skyline', 'skyline'],
  ['halo_alley', 'the overflowing dumpster', 'dumpster'],
  ['neon_pharaoh', 'the DJ booth', 'dj_booth'],
  ['street_main', 'an Atlas billboard', 'billboard'],
  ['halo_roof', 'a very judgmental pigeon', 'pigeon'],
  ['helix_lab', 'a Helix research terminal', 'terminal'],
  ['halo_backroom', 'the poker table', 'poker'],
  ['club_greenroom', 'a vintage guitar on a stand', 'guitar'],
  ['halo_floor', 'the dartboard', 'darts'],
  ['halo_floor', 'the bar taps', 'taps'],
  ['halo_kitchen', 'the stove', 'stove'],
  ['halo_roof', 'the rooftop gaps', 'parkour'],
  ['street_main', 'a battered vending machine', 'vending'],
  ['neon_pharaoh', 'the dance floor', 'dancefloor'],
  ['club_maintenance', 'the fuse panel', 'fuse_panel'],
  ['helix_dock', 'a stack of unmarked crates', 'crates'],
  ['helix_lab', 'the prototype vault', 'vault'],
  ['club_backlot', 'a heap of salvageable scrap', 'scrap_pile'],
  ['club_maintenance', 'an Atlas signal relay', 'relay'],
  ['street_main', 'a corkboard of handwritten gig flyers', 'job_board'],
  ...Object.entries(DROPS).map(([kind, d]): [Id, string, string] => [d.at, d.name, kind]),
];

const GANG_IDS = Object.keys(GANGS);
export const CRACKDOWNS = [
  'unlicensed synth-whiskey',
  'unregistered cyberware',
  'live music without a permit',
  'loitering (defined this week as "standing")',
  'unlicensed laser-tag',
];

export interface RunOptions {
  seed: string;
  /** The world this run happens in. Defaults to the run's own seed (a one-off world). */
  worldSeed?: string;
  personality?: Personality;
  competence?: number;
  realName?: string;
}

/** A fresh Blackbird. Every run starts from the same lab-bench body; what carries over is in `competence` (meta-progression). */
export function makeHero(personality: Personality, realName: string, competence = 0.1): Hero {
  return {
    name: 'Blackbird',
    realName,
    hp: 90,
    maxHp: 90,
    level: 1,
    xp: 0,
    cash: 60,
    drunk: 0,
    satiety: 0,
    hunger: 85,
    sleep: 100,
    muscle: 3,
    reflex: 3,
    hack: 2,
    charm: 3,
    injuries: [],
    weapon: makeItem('excalibur'),
    armor: null,
    inventory: ['patch_kit', 'patch_kit', 'med_pack'].map((id) => makeItem(id)),
    ammo: {},
    buffs: [],
    companions: [],
    skills: {},
    fame: 0,
    tab: 0,
    implants: [],
    locationId: 'halo_floor',
    previousLocationId: 'street_main',
    personality,
    competence,
  };
}

/** Who the people of the Halo have always felt what about. Everyone else's ties are rolled when they start to matter. */
function authoredTies(w: World): void {
  const ties: [string, string, Parameters<typeof link>[3], number, number][] = [
    ['tiny', 'dutch', 'boss', 60, 45],
    ['nyx', 'dutch', 'boss', 25, 50],
    ['bao', 'dutch', 'boss', 40, 45],
    ['nyx', 'juno', 'friend', 55, 50],
    ['skeeter', 'madame', 'boss', -20, 25],
    ['juno', 'skeeter', 'rival', -35, -30],
    ['doc', 'ray', 'friend', 35, 30],
    ['dutch', 'madame', 'friend', 20, 25],
  ];
  for (const [a, b, kind, ab, ba] of ties) if (w.npcs[a] && w.npcs[b]) link(w, a, b, kind, ab, ba);
}

export function createWorld(opts: RunOptions): World {
  const rng = new Rng(`world:${opts.seed}`);
  const personality = opts.personality ?? rollPersonality(rng.fork('personality'));
  const realName = opts.realName ?? rollGovernmentName(rng.fork('name'));

  const gangs = [...GANG_IDS];
  const g1 = gangs.splice(rng.int(0, gangs.length - 1), 1)[0]!;
  const g2 = gangs.splice(rng.int(0, gangs.length - 1), 1)[0]!;

  const locations: Record<Id, Location> = {};
  for (const [id, d] of Object.entries(LOCATIONS)) {
    // The hand-built places are already furnished with their people (below); `populate` is for the ones that are generated.
    locations[id] = { id, visits: 0, cameras: CAMERAS[id] ?? 0, graffiti: 0, territory: null, ...d, exits: d.exits.map((e) => ({ ...e })), populated: true };
  }
  locations.halo_alley!.territory = g1;
  locations.club_backlot!.territory = g2;

  const features: Record<Id, Feature> = {};
  for (const [loc, name, kind] of FEATURES) {
    features[kind] = { id: kind, name, kind, locationId: loc, uses: 0, flags: [] };
  }

  const npcs: Record<Id, Npc> = {};
  const nrng = rng.fork('npcs');
  let n = 0;
  const add = (arch: string, loc: Id, o: { id?: string; faction?: string; name?: string; gender?: Gender; single?: boolean } = {}) => {
    const id = o.id ?? `${arch}_${n++}`;
    // Straight into the record is fine here: the population indexes are built on first use, after this is done.
    npcs[id] = spawnNpc(nrng, id, arch, loc, { faction: o.faction, name: o.name, gender: o.gender });
    if (o.single) npcs[id]!.flags.push('single');
    npcs[id]!.authored = true;
    npcs[id]!.home = loc; // where they go back to between runs
    return npcs[id]!;
  };

  add('barkeep', 'halo_floor', { id: 'dutch', name: 'Dutch Okonkwo', gender: 'man' });
  add('bartender', 'halo_floor', { id: 'nyx', gender: 'woman', single: true });
  add('hacker', 'halo_floor', { id: 'juno', gender: 'woman', single: true });
  add('puppy', 'halo_floor', { id: 'sprocket', name: 'Sprocket' });
  add('bouncer', 'halo_floor', { id: 'tiny', name: 'Tiny', gender: 'man' });
  add('ganger', 'halo_floor', { faction: g1 });
  add('ganger', 'halo_floor', { faction: g1 });
  add('ganger', 'halo_floor', { faction: g2 });
  add('ganger', 'halo_floor', { faction: g2 });
  add('corpo', 'halo_floor');
  add('cop', 'halo_floor');
  add('dealer', 'halo_floor', { id: 'skeeter', name: 'Skeeter', gender: 'man' });
  add('prophet', 'halo_floor', { id: 'ray', name: 'Prophet Ray', gender: 'man' });
  add('patron', 'halo_floor');
  add('patron', 'halo_floor');
  add('doc', 'halo_restroom', { id: 'doc', name: 'Doc Hexamer' });
  add('cook', 'halo_kitchen', { id: 'bao', name: 'Chef Bao' });
  add('fixer', 'halo_backroom', { id: 'madame', name: 'Madame Zero', gender: 'woman' });
  add('drone', 'halo_alley');
  add('noodler', 'street_main');
  add('paint_clerk', 'paint_shop', { id: 'clerk', gender: 'woman', single: true });
  add('pharmacist', 'chem_mart', { id: 'pharmacist' });
  add('gunsmith', 'gun_shop', { id: 'gunsmith' });
  for (let i = 0; i < 3; i++) add('club_security', 'neon_pharaoh');
  add('dj', 'neon_pharaoh', { id: 'kilobyte', name: 'DJ Kilobyte' });
  for (let i = 0; i < 3; i++) add('street_kid', 'club_backlot');
  add('dancer', 'neon_pharaoh');
  add('dancer', 'neon_pharaoh');
  add('heir', 'neon_pharaoh');
  add('bandmate', 'club_greenroom');
  add('bandmate', 'club_greenroom');
  add('scrapper', 'club_maintenance');
  add('helix_guard', 'helix_dock');
  add('helix_guard', 'helix_dock');
  add('helix_guard', 'helix_lobby');
  add('helix_guard', 'helix_lobby');
  add('helix_guard', 'helix_lab');
  add('lab_bot', 'helix_lab');
  add('scientist', 'helix_lab');
  add('apollo', 'overpass', { id: 'dragon' });

  assignBounties(npcs, rng.fork('bounties'));

  const hero = makeHero(personality, realName, opts.competence);

  const factions = newFactions();
  setRelation(factions, g1, g2, -70);

  const world: World = {
    seed: opts.seed,
    worldSeed: opts.worldSeed ?? opts.seed,
    legacy: { runs: 1, deaths: [], personality, realName, account: 0, upgrades: {}, spent: 0 },
    beat: 0,
    clock: START_MINUTE,
    rngPosition: new Rng(`run:${opts.seed}`).position,
    hero,
    mind: newMind(),
    npcs,
    ties: [],
    stubs: {},
    factions,
    features,
    locations,
    dungeons: {},
    heat: { npd: 0, atlas: 0, halo: 0, club: 0 },
    arsenal: Object.fromEntries(genShelf(new Rng(`arsenal:${opts.seed}`), hero.weapon).map((it) => [it.id, it])),
    situation: { warringGangs: [g1, g2], crackdown: rng.pick(CRACKDOWNS), weather: rng.pick(['acid_rain', 'neon_fog', 'heatwave'] as const) },
    flags: {},
    counters: { paint_stock: 8 },
    damsel: null,
    flight: null,
    flights: [],
    dying: [],
    recent: [],
    brawlUntil: 0,
    blackoutUntil: 0,
    stats: { kills: 0, fights: 0, maxLevel: 1, deposited: 0, fees: 0 },
    over: false,
    ending: null,
  };
  authoredTies(world);
  seedFrontier(world); // the hand-built district opens onto a city that gets made as she walks into it
  return world;
}

export const gangName = (id: string): string => GANGS[id] ?? id;
