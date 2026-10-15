import type { Rng } from '../rng';
import type { CacheKind, District, DungeonKind, Hazards } from '../types';
import { BARKS } from './hazards';

/**
 * What dungeons are made of. Two kinds, both a building on a street with rooms of its own behind the door:
 *
 *  - **Atlas outposts**: depots, relay stations and checkpoints. A garrison of robots with a few human troopers
 *    to give them orders. Fewer bodies, harder ones; turrets and guard dogs in the corridors; data and gear in the vaults.
 *  - **Ganger hideouts**: a crew's den in a scrapyard or an old chapel. A lot of weak, loud people in every room,
 *    a couple of real fighters, a captain at the back, and a stash.
 *
 * Every dungeon has a **tier** from 1 to 5, rolled once when the place is made. It is the only dial: garrison size and
 * toughness, how many rooms there are, what the traps are, and how rich the spoils are all read it.
 */

export const MAX_TIER = 5;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** How hard a new place is. Nearer the hand-built district is easier; the dice, and the district, move it a notch either way. */
export function rollTier(rng: Rng, kind: DungeonKind, depth: number, district: District): number {
  let t = 1 + (depth - 1) * 0.42 + (rng.next() - 0.5) * 2.3;
  if (kind === 'outpost' && district === 'corporate') t += 0.5;
  if (kind === 'hideout' && (district === 'slum' || district === 'tenement')) t -= 0.2;
  return clamp(Math.round(t), 1, MAX_TIER);
}

// ===================================================================== names

const OUTPOST_TYPE = ['Depot', 'Relay Station', 'Checkpoint', 'Freight Annex', 'Signal Annex', 'Patrol Post', 'Pacification Annex', 'Supply Cache'];
export const OUTPOST_CODE = ['K-7', '12', '4-B', 'Nine', 'R-31', '88', 'Delta', '3-C', 'Q-2', '40', 'Sigma', 'T-19'];
const HIDEOUT_PLACE = ['scrapyard', 'old chapel', 'drained pool hall', 'boiler room', 'chop shop', 'burnt-out cinema', 'grain silo', 'tram depot', 'tower-block floor', 'bottling plant'];

export const outpostName = (rng: Rng): string => `Atlas ${rng.pick(OUTPOST_TYPE)} ${rng.pick(OUTPOST_CODE)}`;
export const hideoutName = (rng: Rng, gang: string): string => `${gang.startsWith('The ') ? gang : `the ${gang}`}${gang.endsWith('s') ? "'" : "'s"} ${rng.pick(HIDEOUT_PLACE)}`;

/** What she sees of it from the street. */
export const ENTRANCE_BLURB: Record<'outpost' | 'hideout', string[]> = {
  outpost: [
    '{name}: a windowless grey block with a roller door, a camera on every corner and the Atlas wing-and-halo stencilled over the lintel. A drone sits on the awning like a pigeon with a budget.',
    '{name}: chain-link, razor wire and a gatehouse that is lit and empty, which is somehow worse. The sign says AUTHORIZED PERSONNEL ONLY in six languages and a threat.',
  ],
  hideout: [
    '{name}: a door with fresh colors sprayed over it, a speaker playing something with too much bass, and a lookout who is trying very hard to look like he is not one.',
    '{name}: a building that is pretending to be closed. There are bikes out front, a light on upstairs and a lot of people not looking at the street.',
  ],
};

// ===================================================================== rooms

export interface GarrisonSlot {
  arch: string;
  /** How many, at tier 1. */
  count: [number, number];
  /** And how many more for every tier above the first (rounded). */
  perTier?: number;
  chance?: number;
  minTier?: number;
  /** Spots: no bounty on this one even in a place where everyone else has paper (the hired, the licensed). */
  clean?: boolean;
}

export interface RoomDef {
  key: string;
  label: string;
  /** The room it opens off: the first of these that exists in this tier's layout. Null for the entrance. */
  parent: string[] | null;
  minTier: number;
  garrison: GarrisonSlot[];
  /** What's lying around: the kinds it picks from (by weight) and the chance there is anything. */
  cache?: { kinds: CacheKind[]; chance: number };
  /** How much of what the place keeps against intruders (dogs, traps) ends up in here. 1 is usual. */
  hazard: number;
  /** What she sees on first walking in. The entrance has none: it is described from the street (`ENTRANCE_BLURB`). */
  blurbs?: string[];
}

export const OUTPOST_ROOMS: RoomDef[] = [
  {
    key: 'gate', label: 'gatehouse', parent: null, minTier: 1, hazard: 0,
    garrison: [{ arch: 'atlas_drone', count: [1, 2], perTier: 0.5 }, { arch: 'atlas_trooper', count: [0, 1], chance: 0.5, minTier: 2 }],
  },
  {
    key: 'hall', label: 'checkpoint corridor', parent: ['gate'], minTier: 1, hazard: 1,
    garrison: [{ arch: 'atlas_drone', count: [2, 2], perTier: 0.4 }],
    blurbs: ['{name}: a long white corridor with a scanner arch every ten metres and a floor that has been mopped by something with no opinions.'],
  },
  {
    key: 'barracks', label: 'barracks', parent: ['hall'], minTier: 1, hazard: 0.6,
    garrison: [{ arch: 'atlas_trooper', count: [1, 1], perTier: 0.4 }],
    cache: { kinds: ['supplies', 'cash'], chance: 0.55 },
    blurbs: ['{name}: bunks in grey rows, a locker for every trooper and a poster that says YOU ARE THE FIRST LINE OF CUSTOMER SATISFACTION.'],
  },
  {
    key: 'garage', label: 'motor pool', parent: ['hall'], minTier: 2, hazard: 1,
    garrison: [{ arch: 'atlas_walker', count: [1, 1], perTier: 0.3 }, { arch: 'atlas_drone', count: [0, 1], chance: 0.6 }],
    cache: { kinds: ['arms', 'supplies'], chance: 0.4 },
    blurbs: ['{name}: charging cradles, a gantry and an acrid smell of hot coolant. Half the bays are empty. The other half are looking at her.'],
  },
  {
    key: 'armory', label: 'armory', parent: ['barracks', 'hall'], minTier: 2, hazard: 1.4,
    garrison: [{ arch: 'atlas_drone', count: [1, 1], perTier: 0.2 }, { arch: 'atlas_trooper', count: [0, 1], chance: 0.5 }],
    cache: { kinds: ['arms', 'armor'], chance: 0.9 },
    blurbs: ['{name}: steel racks behind a mesh cage, every weapon tagged and every tag bar-coded, and a single red light that has noticed her.'],
  },
  {
    key: 'core', label: 'data core', parent: ['garage', 'hall'], minTier: 3, hazard: 1.3,
    garrison: [{ arch: 'atlas_drone', count: [1, 2], perTier: 0.3 }, { arch: 'sentry_turret', count: [1, 1], chance: 0.55, minTier: 4 }],
    cache: { kinds: ['data'], chance: 0.95 },
    blurbs: ['{name}: a cold room of black racks and blue light, humming the way a very expensive thing hums when it is awake and thinking about her.'],
  },
  {
    key: 'command', label: 'command post', parent: ['core', 'armory', 'barracks', 'hall'], minTier: 1, hazard: 1.2,
    garrison: [
      { arch: 'atlas_officer', count: [1, 1] },
      { arch: 'atlas_walker', count: [0, 1], perTier: 0.3, minTier: 2 },
      { arch: 'atlas_trooper', count: [0, 1], chance: 0.5, minTier: 2 },
    ],
    cache: { kinds: ['vault'], chance: 1 },
    blurbs: ['{name}: a horseshoe of consoles, a wall of feeds and a commander\'s desk with a tidy tray, a mug that says WORLD\'S OKAYEST PROTECTION and a very large safe.'],
  },
];

export const HIDEOUT_ROOMS: RoomDef[] = [
  {
    key: 'door', label: 'front door', parent: null, minTier: 1, hazard: 0,
    garrison: [{ arch: 'gang_runner', count: [1, 2], perTier: 0.6 }],
  },
  {
    key: 'hangout', label: 'common room', parent: ['door'], minTier: 1, hazard: 0.6,
    garrison: [{ arch: 'gang_runner', count: [2, 3], perTier: 1.2 }, { arch: 'gang_enforcer', count: [1, 1], chance: 0.6, minTier: 3 }],
    cache: { kinds: ['cash'], chance: 0.4 },
    blurbs: ['{name}: a pool table with a leg missing, a sound system bigger than the room and a lot of people who all go quiet at once.', '{name}: smoke, a couch that has seen things, a wall of tags and a hot plate with something burning on it.'],
  },
  {
    key: 'bunks', label: 'bunk room', parent: ['hangout'], minTier: 1, hazard: 0.6,
    garrison: [{ arch: 'gang_runner', count: [1, 3], perTier: 1 }],
    cache: { kinds: ['stash'], chance: 0.35 },
    blurbs: ['{name}: mattresses on the floor, boots in a pile and someone\'s whole life in a gym bag. A dozen people sleep here in shifts.'],
  },
  {
    key: 'workshop', label: 'chop shop', parent: ['hangout'], minTier: 2, hazard: 1,
    garrison: [{ arch: 'gang_runner', count: [1, 2], perTier: 0.7 }, { arch: 'gang_enforcer', count: [0, 1], chance: 0.5, minTier: 3 }],
    cache: { kinds: ['arms', 'armor'], chance: 0.5 },
    blurbs: ['{name}: stripped bikes, a cutting torch and an open drawer of other people\'s implants. Somebody is welding something that should not be welded.'],
  },
  {
    key: 'stash', label: 'stash room', parent: ['bunks', 'hangout'], minTier: 2, hazard: 1.5,
    garrison: [{ arch: 'gang_runner', count: [0, 1], perTier: 0.3 }],
    cache: { kinds: ['stash', 'supplies'], chance: 0.9 },
    blurbs: ['{name}: a steel door with three bolts on it, shelves of shrink-wrapped something, and a mattress on top of a lockbox for reasons of security.'],
  },
  {
    key: 'pit', label: 'fight pit', parent: ['workshop', 'hangout'], minTier: 3, hazard: 0.8,
    garrison: [{ arch: 'gang_runner', count: [2, 3], perTier: 1 }, { arch: 'gang_enforcer', count: [1, 1], perTier: 0.3 }],
    cache: { kinds: ['cash'], chance: 0.6 },
    blurbs: ['{name}: a sunken ring with a chain-link fence, a ring of benches and a crowd that has been waiting all night for something to happen to somebody.'],
  },
  {
    key: 'den', label: 'captain\'s den', parent: ['pit', 'stash', 'bunks', 'hangout'], minTier: 1, hazard: 1.2,
    garrison: [{ arch: 'gang_captain', count: [1, 1] }, { arch: 'gang_enforcer', count: [1, 2], perTier: 0.5 }],
    cache: { kinds: ['vault'], chance: 1 },
    blurbs: ['{name}: an armchair like a throne, a wall of trophies from other crews, and a safe with the gang\'s colors painted on the door.'],
  },
];

/** (A spot is one room and picks it from its setups each garrisoning, so it has no fixed layout: see content/spots.ts.) */
export const LAYOUTS: Record<DungeonKind, RoomDef[]> = { outpost: OUTPOST_ROOMS, hideout: HIDEOUT_ROOMS, spot: [] };

/** The rooms a tier-`tier` place has, in order, each with the key of the one it opens off (null for the entrance). */
export function layoutFor(kind: DungeonKind, tier: number): { def: RoomDef; parent: string | null }[] {
  const rooms = LAYOUTS[kind].filter((r) => r.minTier <= tier);
  const have = new Set(rooms.map((r) => r.key));
  return rooms.map((def) => ({ def, parent: def.parent ? def.parent.find((k) => have.has(k)) ?? rooms[0]!.key : null }));
}

/** How many of a slot, at this tier. */
export function slotCount(rng: Rng, slot: GarrisonSlot, tier: number): number {
  if ((slot.minTier ?? 1) > tier) return 0;
  if (slot.chance !== undefined && !rng.chance(slot.chance)) return 0;
  const up = Math.round((slot.perTier ?? 0) * (tier - 1));
  return rng.int(slot.count[0] + up, slot.count[1] + up);
}

// ===================================================================== how tough the garrison is

/**
 * Scale a freshly spawned garrison member to the tier of the place. Machines get harder to break and hit harder; people
 * get more experience (and so more health and more punch). Tier 1 is what the archetype says it is.
 */
export function scaleForTier(n: { hp: number; maxHp: number; power: number; level: number; tags: string[]; cash: number }, tier: number): void {
  const up = tier - 1;
  if (!up) return;
  if (n.tags.includes('robot')) {
    const m = 1 + 0.3 * up;
    n.hp = n.maxHp = Math.round(n.maxHp * m);
    n.power = Math.round(n.power * m);
    n.level += up;
    return;
  }
  const lv = Math.round(up * (n.tags.includes('commander') ? 1.4 : n.tags.includes('strong') ? 1.1 : 0.9));
  n.level += lv;
  n.hp = n.maxHp = n.maxHp + lv * 12;
  n.power += lv * 2;
  n.cash = Math.round(n.cash * (1 + 0.3 * up));
}

/**
 * What a typical room of a place of this tier is worth in a fight (see `menace` in dungeons.ts), for deciding whether to
 * go in at all before anyone has seen inside. Measured: rooms are fought one at a time, so it's the room that counts,
 * not the building. Not the boss's room, which is a lot worse.
 */
export const TIER_MENACE: Record<DungeonKind, number[]> = {
  outpost: [0, 170, 245, 350, 470, 600],
  hideout: [0, 145, 160, 250, 345, 430],
  // A spot is the one room, so this is about what a single room of it is worth.
  spot: [0, 80, 120, 180, 260, 350],
};

/** The weapons the people in charge carry, by tier. (Anyone else carries what their archetype says.) */
export const LEADER_ARMS: string[][] = [[], ['stunner_mk3'], ['stunner_mk3', 'riot_shotgun'], ['riot_shotgun', 'rail_revolver'], ['rail_revolver', 'gauss_smg'], ['gauss_smg', 'pulse_rifle']];

// ===================================================================== spoils

/** What a cache is worth, roughly, at a tier. (What's inside it is made when it's opened.) */
export function cacheValue(kind: CacheKind, tier: number): number {
  const t = tier;
  switch (kind) {
    case 'cash': return 50 + 40 * t;
    case 'stash': return 70 + 45 * t;
    case 'arms': return 60 + 55 * t;
    case 'armor': return 50 + 55 * t;
    case 'supplies': return 40 + 20 * t;
    case 'data': return 90 + 90 * t;
    case 'vault': return 150 + 170 * t;
  }
}

export const CACHE_LABEL: Record<CacheKind, string> = {
  cash: 'a cash box',
  stash: 'a stash',
  arms: 'a weapons rack',
  armor: 'a rack of armor',
  supplies: 'a supply locker',
  data: 'the data racks',
  vault: 'the safe',
};

/** Armor by tier. */
export const ARMOR_BY_TIER = ['leather_jacket', 'kevlar_duster', 'kevlar_duster', 'riot_vest', 'corp_plate'];
/** Loot by tier, for the data racks and the safes. */
export const DATA_LOOT: string[][] = [[], ['memory_shard', 'drone_core'], ['memory_shard', 'drone_core'], ['memory_shard', 'helix_sample'], ['helix_sample', 'corp_creds'], ['helix_sample', 'corp_creds']];
export const STASH_LOOT = ['gold_tooth', 'credchip', 'stim', 'neural_gum', 'med_pack'];

// ===================================================================== what the place keeps against intruders

/** Dogs and traps for a room, from the tier. A room with a `hazard` of 0 keeps nothing. */
export function rollRoomHazards(rng: Rng, kind: DungeonKind, tier: number, hazard: number): Hazards {
  const out: Hazards = {};
  if (hazard <= 0) return out;
  if (rng.chance(clamp((0.04 + 0.07 * tier) * hazard * (kind === 'outpost' ? 1.2 : 1), 0, 0.6))) {
    const rank = clamp(tier - 2 + rng.int(-1, 1), 0, tier >= 5 ? 3 : 2);
    out.dogs = { model: BARKS[rank]!.model, count: rank >= 2 ? 1 : rng.int(1, 2) };
  }
  if (rng.chance(clamp((0.1 + 0.08 * tier) * hazard, 0, 0.7))) {
    const roll = rng.next();
    const k = tier <= 1 ? 'grenade_string'
      : tier === 2 ? (roll < 0.5 ? 'grenade_string' : 'shock_mat')
      : tier === 3 ? (roll < 0.4 ? 'shock_mat' : 'gas_vent')
      : kind === 'outpost' ? (roll < 0.7 ? 'sentry_turret' : 'gas_vent') : (roll < 0.4 ? 'sentry_turret' : roll < 0.7 ? 'gas_vent' : 'shock_mat');
    out.trap = { kind: k };
  }
  return out;
}

/** Atlas holds its heat longer than the street does. */
export const ATLAS_HEAT_ON_ALARM = 1;
export const ATLAS_HEAT_ON_CLEAR = 2;
/** The police take it more personally than Atlas does. */
export const NPD_HEAT_ON_CLEAR = 3;
