import { Rng } from './rng';
import { rollGovernmentName, rollPersonality, type Personality } from './personality';
import { GANGS, spawnNpc } from './content/archetypes';
import { makeItem } from './content/items';
import type { Exit, Feature, Id, Location, Npc, World } from './types';

const ex = (to: Id, label: string, o: Partial<Exit> = {}): Exit => ({ to, label, hidden: false, gate: null, ...o });

type LocDef = Omit<Location, 'visits' | 'id'>;

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
      ex('overpass', 'the Kowloon Overpass (where the dragon patrols)'),
    ],
  },
  neon_pharaoh: {
    name: 'The Neon Pharaoh', kind: 'club', security: 5, crowded: true, outdoors: false, tossTo: 'street_main', fleeTo: 'club_maintenance',
    exits: [
      ex('street_main', 'the front doors'),
      ex('club_maintenance', 'a staff door marked MAINTENANCE', { hidden: true, misroute: 'helix_dock' }),
      ex('club_backlot', "the club's back door, propped open with a milk crate"),
    ],
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
  ['street_main', 'a battered vending machine', 'vending'],
  ['neon_pharaoh', 'the dance floor', 'dancefloor'],
  ['club_maintenance', 'the fuse panel', 'fuse_panel'],
  ['helix_dock', 'a stack of unmarked crates', 'crates'],
  ['helix_lab', 'the prototype vault', 'vault'],
];

const GANG_IDS = Object.keys(GANGS);
const CRACKDOWNS = [
  'unlicensed synth-whiskey',
  'unregistered cyberware',
  'live music without a permit',
  'loitering (defined this week as "standing")',
  'unlicensed laser-tag',
];

export interface RunOptions {
  seed: string;
  personality?: Personality;
  competence?: number;
  realName?: string;
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
    locations[id] = { id, visits: 0, ...d, exits: d.exits.map((e) => ({ ...e })) };
  }

  const features: Record<Id, Feature> = {};
  for (const [loc, name, kind] of FEATURES) {
    features[kind] = { id: kind, name, kind, locationId: loc, uses: 0, flags: [] };
  }

  const npcs: Record<Id, Npc> = {};
  const nrng = rng.fork('npcs');
  let n = 0;
  const add = (arch: string, loc: Id, o: { id?: string; faction?: string; name?: string } = {}) => {
    const id = o.id ?? `${arch}_${n++}`;
    npcs[id] = spawnNpc(nrng, id, arch, loc, { faction: o.faction, name: o.name });
    return npcs[id]!;
  };

  add('barkeep', 'halo_floor', { id: 'dutch', name: 'Dutch Okonkwo' });
  add('bartender', 'halo_floor', { id: 'nyx' });
  add('hacker', 'halo_floor', { id: 'juno' });
  add('puppy', 'halo_floor', { id: 'sprocket', name: 'Sprocket' });
  add('bouncer', 'halo_floor', { id: 'tiny', name: 'Tiny' });
  add('ganger', 'halo_floor', { faction: g1 });
  add('ganger', 'halo_floor', { faction: g1 });
  add('ganger', 'halo_floor', { faction: g2 });
  add('ganger', 'halo_floor', { faction: g2 });
  add('corpo', 'halo_floor');
  add('cop', 'halo_floor');
  add('dealer', 'halo_floor', { id: 'skeeter', name: 'Skeeter' });
  add('prophet', 'halo_floor', { id: 'ray', name: 'Prophet Ray' });
  add('patron', 'halo_floor');
  add('patron', 'halo_floor');
  add('doc', 'halo_restroom', { id: 'doc', name: 'Doc Hexamer' });
  add('cook', 'halo_kitchen', { id: 'bao', name: 'Chef Bao' });
  add('fixer', 'halo_backroom', { id: 'madame', name: 'Madame Zero' });
  add('drone', 'halo_alley');
  add('noodler', 'street_main');
  for (let i = 0; i < 3; i++) add('club_security', 'neon_pharaoh');
  add('dj', 'neon_pharaoh', { id: 'kilobyte', name: 'DJ Kilobyte' });
  for (let i = 0; i < 3; i++) add('street_kid', 'club_backlot');
  add('dancer', 'neon_pharaoh');
  add('dancer', 'neon_pharaoh');
  add('heir', 'neon_pharaoh');
  add('scrapper', 'club_maintenance');
  add('helix_guard', 'helix_dock');
  add('helix_guard', 'helix_dock');
  add('helix_guard', 'helix_lobby');
  add('helix_guard', 'helix_lobby');
  add('helix_guard', 'helix_lab');
  add('lab_bot', 'helix_lab');
  add('scientist', 'helix_lab');
  add('apollo', 'overpass', { id: 'dragon' });

  const hero = {
    name: 'Blackbird',
    realName,
    hp: 90,
    maxHp: 90,
    level: 1,
    xp: 0,
    cash: 60,
    drunk: 0,
    muscle: 3,
    reflex: 3,
    hack: 2,
    charm: 3,
    injuries: [],
    weapon: makeItem('excalibur'),
    armor: null,
    inventory: [],
    buffs: [],
    companions: [],
    skills: {},
    fame: 0,
    tab: 0,
    implants: [],
    locationId: 'halo_floor',
    previousLocationId: 'street_main',
    personality,
    competence: opts.competence ?? 0.1,
  };

  return {
    seed: opts.seed,
    beat: 0,
    rngPosition: new Rng(`run:${opts.seed}`).position,
    hero,
    npcs,
    features,
    locations,
    heat: { npd: 0, atlas: 0, halo: 0, club: 0 },
    situation: { warringGangs: [g1, g2], crackdown: rng.pick(CRACKDOWNS), weather: rng.pick(['acid_rain', 'neon_fog', 'heatwave'] as const) },
    flags: {},
    counters: {},
    damsel: null,
    flight: null,
    recent: [],
    brawlUntil: 0,
    blackoutUntil: 0,
    stats: { kills: 0, fights: 0, maxLevel: 1 },
    over: false,
    ending: null,
  };
}

export const gangName = (id: string): string => GANGS[id] ?? id;
