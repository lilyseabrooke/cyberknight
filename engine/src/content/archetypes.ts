import type { Rng } from '../rng';
import type { Item, Npc } from '../types';
import { makeItem } from './items';

export interface ArchetypeDef {
  role: string;
  level: [number, number];
  tags: string[];
  faction: string | null;
  names: 'person' | 'robot' | 'monster';
  weapons: string[];
  armors?: string[];
  armorChance?: number;
  loot: string[];
  lootChance: number;
  cash: [number, number];
  /** Short intro the text layer can drop in ("a hulking bouncer with chromed knuckles"). */
  desc: string[];
  /** Overrides for bosses and robots. */
  hp?: number;
  power?: number;
  startAffinity?: number;
}

export const ARCHETYPES: Record<string, ArchetypeDef> = {
  // ---------------- The Rusty Halo ----------------
  barkeep: {
    role: 'owner of the Rusty Halo', level: [7, 7], tags: ['owner', 'strong', 'staff'], faction: 'halo',
    names: 'person', weapons: ['judgment'], loot: ['credchip', 'walkman'], lootChance: 0.5, cash: [120, 300],
    desc: ['a barrel-chested ex-merc with a prosthetic jaw and a bat under the counter'],
  },
  bartender: {
    role: 'bartender', level: [3, 3], tags: ['romanceable', 'staff', 'augmented'], faction: 'halo',
    names: 'person', weapons: ['broken_bottle', 'zip_pistol'], loot: ['neural_gum'], lootChance: 0.4, cash: [30, 90],
    desc: ['a bartender with electric-blue hair and eyes that glow when she pours'],
    startAffinity: 5,
  },
  hacker: {
    role: 'hacker', level: [3, 3], tags: ['romanceable', 'augmented', 'jealous'], faction: null,
    names: 'person', weapons: ['arc_gauntlet'], loot: ['memory_shard', 'fake_id'], lootChance: 0.8, cash: [20, 120],
    desc: ['a hacker in the corner booth, one arm a mess of exposed cabling'],
  },
  puppy: {
    role: 'robot puppy', level: [1, 1], tags: ['pet', 'robot'], faction: 'halo',
    names: 'robot', weapons: [], loot: [], lootChance: 0, cash: [0, 0], hp: 25, power: 3,
    desc: ['a chrome robot puppy with one flickering LED ear'], startAffinity: 10,
  },
  bouncer: {
    role: 'bouncer', level: [6, 6], tags: ['strong', 'rowdy', 'augmented', 'security'], faction: 'halo',
    names: 'person', weapons: ['arc_gauntlet', 'judgment'], armors: ['kevlar_duster'], armorChance: 0.7,
    loot: ['gold_tooth'], lootChance: 0.4, cash: [20, 80],
    desc: ['a bouncer roughly the size and shape of a vending machine'],
  },
  ganger: {
    role: 'ganger', level: [2, 3], tags: ['rowdy', 'ganger'], faction: 'ganger',
    names: 'person', weapons: ['switchblade', 'zip_pistol', 'pool_cue', 'broken_bottle'], armors: ['leather_jacket'],
    armorChance: 0.5, loot: ['vipers_patch', 'credchip', 'gold_tooth'], lootChance: 0.6, cash: [10, 60],
    desc: ['a ganger in a jacket covered in more patches than a quilt'],
  },
  corpo: {
    role: 'off-the-clock corporate drone', level: [2, 2], tags: ['augmented', 'corp', 'monitored'], faction: 'atlas',
    names: 'person', weapons: ['zip_pistol'], armors: ['kevlar_duster'], armorChance: 0.3,
    loot: ['corp_creds', 'credchip'], lootChance: 0.9, cash: [150, 400],
    desc: ['a corpo with a very expensive haircut and an even more expensive spine'],
  },
  cop: {
    role: 'off-duty NPD officer', level: [4, 4], tags: ['cop', 'rowdy', 'augmented'], faction: 'npd',
    names: 'person', weapons: ['service_pistol'], armors: ['riot_vest'], armorChance: 0.6,
    loot: ['credchip'], lootChance: 0.5, cash: [40, 120],
    desc: ['an off-duty cop nursing a synth-whiskey and a grudge'],
  },
  fixer: {
    role: 'fixer', level: [5, 5], tags: ['fixer', 'augmented'], faction: null,
    names: 'person', weapons: ['stunner_mk3'], armors: ['kevlar_duster'], armorChance: 1,
    loot: ['memory_shard', 'fake_id', 'corp_creds'], lootChance: 1, cash: [300, 800],
    desc: ['a fixer with silver eyes who knows what everything in Neo costs'],
  },
  doc: {
    role: 'street doc', level: [2, 2], tags: ['doc'], faction: null,
    names: 'person', weapons: ['cleaver'], loot: ['medkit', 'eyeballs'], lootChance: 1, cash: [40, 100],
    desc: ['a street doc who runs an illegal clinic out of the bathroom stall'],
  },
  dealer: {
    role: 'twitchy dealer', level: [1, 1], tags: ['dealer'], faction: 'ganger',
    names: 'person', weapons: ['switchblade'], loot: ['stim', 'neural_gum'], lootChance: 0.9, cash: [5, 40],
    desc: ['a twitchy dealer who vibrates at a frequency just above human hearing'],
  },
  prophet: {
    role: 'street prophet', level: [1, 1], tags: ['rumor'], faction: null,
    names: 'person', weapons: [], loot: ['mom_photo', 'eyeballs'], lootChance: 0.7, cash: [0, 15],
    desc: ['a street prophet who has been wired to the wrong radio frequency since the Fall'],
  },
  cook: {
    role: 'line cook', level: [3, 3], tags: ['staff', 'strong'], faction: 'halo',
    names: 'person', weapons: ['cleaver'], loot: ['noodles'], lootChance: 0.8, cash: [5, 30],
    desc: ['a line cook with six arms, four of them clean'],
  },
  patron: {
    role: 'regular', level: [1, 2], tags: ['rowdy'], faction: null,
    names: 'person', weapons: ['broken_bottle', 'pool_cue'], loot: ['credchip', 'walkman', 'eyeballs'], lootChance: 0.5,
    cash: [5, 50], desc: ['a regular who has been in the same stool since the previous administration'],
  },
  // ---------------- Streets & alley ----------------
  drone: {
    role: 'surveillance drone', level: [3, 3], tags: ['robot', 'patrol', 'augmented'], faction: 'atlas',
    names: 'robot', weapons: ['stunner_mk3'], loot: ['memory_shard'], lootChance: 0.5, cash: [0, 0], hp: 55, power: 12,
    desc: ['an Atlas surveillance drone, hovering with the confidence of something that has never been punched'],
  },
  mugger: {
    role: 'mugger', level: [2, 3], tags: ['ganger', 'rowdy'], faction: 'ganger',
    names: 'person', weapons: ['switchblade', 'zip_pistol'], loot: ['credchip', 'gold_tooth'], lootChance: 0.6, cash: [10, 50],
    desc: ['a mugger with a knife and a deadline'],
  },
  noodler: {
    role: 'noodle vendor', level: [1, 1], tags: ['staff'], faction: null,
    names: 'person', weapons: ['cleaver'], loot: ['noodles'], lootChance: 1, cash: [10, 40],
    desc: ['a noodle vendor who has seen things and is selling them as toppings'],
  },
  // ---------------- Neon Pharaoh ----------------
  club_security: {
    role: 'Neon Pharaoh security', level: [4, 5], tags: ['security', 'strong', 'augmented', 'nonlethal'], faction: 'club',
    names: 'person', weapons: ['stunner_mk3'], armors: ['kevlar_duster'], armorChance: 0.8,
    loot: ['gold_tooth'], lootChance: 0.3, cash: [30, 100],
    desc: ['a club security guard in mirrored shades, at night, indoors, because he is a professional'],
  },
  dj: {
    role: 'DJ', level: [1, 1], tags: ['augmented', 'rumor'], faction: 'club',
    names: 'person', weapons: [], loot: ['memory_shard', 'walkman'], lootChance: 0.7, cash: [50, 150],
    desc: ['a DJ whose head is mostly speaker'],
  },
  dancer: {
    role: 'dancer', level: [2, 2], tags: ['romanceable', 'augmented'], faction: 'club',
    names: 'person', weapons: ['switchblade'], loot: ['credchip'], lootChance: 0.5, cash: [30, 120],
    desc: ['a dancer whose tattoos are animated and a little judgmental'],
  },
  heir: {
    role: 'corporate heir', level: [1, 1], tags: ['corp', 'augmented', 'monitored'], faction: 'atlas',
    names: 'person', weapons: ['rail_revolver'], armors: ['kevlar_duster'], armorChance: 1,
    loot: ['corp_creds', 'memory_shard'], lootChance: 1, cash: [600, 1500],
    desc: ['an Atlas heir in a jacket that cost more than the building you grew up in'],
  },
  // ---------------- maintenance / Helix ----------------
  scrapper: {
    role: 'maintenance scrapper-bot', level: [3, 3], tags: ['robot', 'patrol'], faction: null,
    names: 'robot', weapons: [], loot: ['gold_tooth', 'credchip'], lootChance: 0.6, cash: [0, 0], hp: 60, power: 11,
    desc: ['a maintenance scrapper-bot with one working eye and a lot of opinions about trespassers'],
  },
  helix_guard: {
    role: 'Helix security', level: [6, 7], tags: ['security', 'corp', 'augmented'], faction: 'atlas',
    names: 'person', weapons: ['pulse_rifle'], armors: ['corp_plate'], armorChance: 0.8,
    loot: ['corp_creds', 'memory_shard'], lootChance: 0.6, cash: [60, 200],
    desc: ['a Helix guard in matte-black plating, visor down, personality off'],
  },
  scientist: {
    role: 'Helix researcher', level: [2, 2], tags: ['corp', 'augmented', 'rumor'], faction: 'atlas',
    names: 'person', weapons: ['stunner_mk3'], loot: ['helix_sample', 'memory_shard'], lootChance: 1, cash: [100, 300],
    desc: ['a researcher who has not slept since the previous fiscal quarter'],
  },
  lab_bot: {
    role: 'Helix lab-bot', level: [6, 6], tags: ['robot', 'corp', 'security'], faction: 'atlas',
    names: 'robot', weapons: [], loot: ['memory_shard'], lootChance: 0.7, cash: [0, 0], hp: 120, power: 24,
    desc: ['a lab-bot built for moving crates and, apparently, throwing people'],
  },
  // ---------------- police & boss ----------------
  npd_officer: {
    role: 'NPD officer', level: [4, 5], tags: ['cop', 'security', 'augmented'], faction: 'npd',
    names: 'person', weapons: ['riot_shotgun', 'service_pistol'], armors: ['riot_vest'], armorChance: 0.9,
    loot: ['credchip'], lootChance: 0.4, cash: [30, 90],
    desc: ['a Neo Protective Division officer in full riot kit'],
  },
  npd_sergeant: {
    role: 'NPD sergeant', level: [7, 7], tags: ['cop', 'security', 'augmented', 'strong'], faction: 'npd',
    names: 'person', weapons: ['gauss_smg'], armors: ['riot_vest'], armorChance: 1,
    loot: ['credchip', 'memory_shard'], lootChance: 0.7, cash: [80, 200],
    desc: ['an NPD sergeant with the thousand-yard stare of a man who bills overtime'],
  },
  cyberdragon: {
    role: 'cyberdragon', level: [10, 10], tags: ['robot', 'dragon', 'boss'], faction: 'atlas',
    names: 'monster', weapons: [], loot: ['helix_sample'], lootChance: 1, cash: [0, 0], hp: 1000, power: 88,
    desc: ['CINDERJAW, an Atlas Protection Platform, forty tons of wings, plasma and customer-service branding'],
  },
};

export const GANGS: Record<string, string> = {
  vipers: 'Chrome Vipers',
  sixers: 'Saint Sixers',
  marrow: 'Neon Marrow',
  choir: 'Rust Choir',
};

const FIRST = [
  'Nyx', 'Juno', 'Kestrel', 'Mox', 'Rook', 'Zed', 'Vesper', 'Jinx', 'Sable', 'Dex', 'Marlowe', 'Echo', 'Pike',
  'Lux', 'Ono', 'Fennec', 'Cass', 'Tarn', 'Ripley', 'Nova', 'Bishop', 'Quill', 'Raze', 'Odalys', 'Hex',
];
const LAST = [
  'Calloway', 'Okonkwo-Vance', 'Vantablack', 'Ibarra', 'Kowalczyk', 'Nakamura-Reyes', 'Dross', 'Maddox', 'Sterling-9',
  'Voss', 'Larkspur', 'Quint', 'Ashgrove', 'Tanaka-Bell', 'Lovelace', 'Achebe', 'Mercer', 'Hollis',
];
const ROBOT = ['UNIT', 'MK', 'BOT', 'SENTRY', 'AUTO'];

export function rollNpcName(rng: Rng, kind: 'person' | 'robot' | 'monster'): string {
  if (kind === 'robot') return `${rng.pick(ROBOT)}-${rng.int(100, 999)}`;
  if (kind === 'monster') return 'CINDERJAW';
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

export function spawnNpc(rng: Rng, id: string, archetype: string, locationId: string, opts: { name?: string; faction?: string } = {}): Npc {
  const def = ARCHETYPES[archetype];
  if (!def) throw new Error(`unknown archetype ${archetype}`);
  const level = rng.int(def.level[0], def.level[1]);
  const loadout: Item[] = [];
  let weaponPower = 0;
  if (def.weapons.length) {
    const wpn = makeItem(rng.pick(def.weapons));
    loadout.push(wpn);
    weaponPower = wpn.power;
  }
  if (def.armors && rng.chance(def.armorChance ?? 0)) loadout.push(makeItem(rng.pick(def.armors)));
  if (def.loot.length && rng.chance(def.lootChance)) loadout.push(makeItem(rng.pick(def.loot)));
  const hp = def.hp ?? 18 + level * 12;
  return {
    id,
    name: opts.name ?? rollNpcName(rng, def.names),
    archetype,
    role: def.role,
    locationId,
    hp,
    maxHp: hp,
    level,
    power: def.power ?? level * 2 + weaponPower,
    tags: [...def.tags],
    faction: opts.faction ?? def.faction,
    affinity: def.startAffinity ?? 0,
    alive: true,
    hostile: false,
    loadout,
    cash: rng.int(def.cash[0], def.cash[1]),
    memories: [],
    flags: [],
    downUntil: 0,
  };
}
