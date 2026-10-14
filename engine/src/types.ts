import type { Rng } from './rng';
import type { Personality } from './personality';
import type { EventData, GameEvent, Outcome } from './events';

/**
 * All world state is plain JSON (no classes, Sets or Maps) so a run can be saved to
 * Supabase, resumed on another device, and fast-forwarded for offline catch-up.
 */
export type Id = string;

export type Injury = 'broken_leg' | 'cracked_ribs' | 'fried_optics' | 'concussion';

export type ItemKind = 'weapon' | 'armor' | 'gadget' | 'loot' | 'consumable';

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  /** Weapons: damage power. Armor: flat damage reduction per hit. */
  power: number;
  value: number;
  /** Experimental tech: huge power, but it may bite back. */
  unstable?: boolean;
  tags: string[];
}

export interface Buff {
  id: string;
  until: number;
  power: number;
}

export interface Companion {
  id: Id;
  name: string;
  kind: string;
  hp: number;
  maxHp: number;
  power: number;
  /** 0..100. At zero they leave. */
  loyalty: number;
  abilities: string[];
  /** The NPC this companion used to be, if any (they go home if they leave). */
  npcId?: Id;
  home?: Id;
}

export interface Hero {
  name: string;
  /** Randomly generated, astonishingly uncool. */
  realName: string;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  cash: number;
  drunk: number;
  muscle: number;
  reflex: number;
  hack: number;
  charm: number;
  injuries: Injury[];
  weapon: Item;
  armor: Item | null;
  inventory: Item[];
  buffs: Buff[];
  companions: Companion[];
  /** Skill XP by id; see skills.ts for levels. */
  skills: Record<string, number>;
  /** Street fame. Bouncers, bartenders and fans notice. */
  fame: number;
  /** What she owes the Rusty Halo. */
  tab: number;
  implants: string[];
  locationId: Id;
  previousLocationId: Id;
  personality: Personality;
  /** 0..1. Raised by Firmware upgrades (meta-progression). */
  competence: number;
}

export interface Npc {
  id: Id;
  name: string;
  archetype: string;
  role: string;
  locationId: Id;
  hp: number;
  maxHp: number;
  level: number;
  power: number;
  tags: string[];
  faction: string | null;
  /** How they feel about Blackbird, -100..100. Persisted; the world remembers. */
  affinity: number;
  alive: boolean;
  hostile: boolean;
  loadout: Item[];
  cash: number;
  /** Things that have happened between this NPC and the hero. */
  memories: string[];
  flags: string[];
  /** Knocked out until this beat (non-lethal fights). */
  downUntil: number;
}

export interface Feature {
  id: Id;
  name: string;
  kind: string;
  locationId: Id;
  uses: number;
  flags: string[];
}

export interface Exit {
  to: Id;
  label: string;
  hidden: boolean;
  /** How hard it is to get through. */
  gate: null | 'bouncer' | 'locked' | 'guarded' | 'jump';
  /** Wrong-turn destination for ductwork, etc. */
  misroute?: Id;
}

export interface Location {
  id: Id;
  name: string;
  kind: 'bar' | 'street' | 'club' | 'corp' | 'tunnel' | 'boss' | 'shop';
  exits: Exit[];
  /** 0..10. Raises the chance of being spotted while sneaking. */
  security: number;
  crowded: boolean;
  outdoors: boolean;
  /** Where the hero ends up when thrown out. */
  tossTo: Id;
  /** Where the hero scrambles when fleeing. */
  fleeTo: Id;
  visits: number;
  /** Pieces of her graffiti up here. Drives diminishing fame and local consequences. */
  graffiti: number;
  /** Gang that claims this turf this run (a per-run situational variable). */
  territory: string | null;
}

/** Per-run situational variables, layered on the persistent macro-Neo. */
export interface Situation {
  warringGangs: [string, string];
  crackdown: string;
  weather: 'acid_rain' | 'neon_fog' | 'heatwave';
}

/** A damsel in distress, available to be rescued for a short window. */
export interface Damsel {
  npcId: Id;
  foeIds: Id[];
  locationId: Id;
  until: number;
}

/** A dragon flight overhead. She has a few beats to decide what to do about it. */
export interface Flight {
  kind: 'artemis' | 'hera';
  ids: Id[];
  locationId: Id;
  until: number;
  hidden: boolean;
  noticed: boolean;
}

export interface World {
  seed: string;
  beat: number;
  rngPosition: number;
  hero: Hero;
  npcs: Record<Id, Npc>;
  features: Record<Id, Feature>;
  locations: Record<Id, Location>;
  /** Wanted level per faction, decays over time. */
  heat: Record<string, number>;
  situation: Situation;
  flags: Record<string, boolean>;
  /** Misc numeric counters (laser-tag wins, ads seen, etc.). */
  counters: Record<string, number>;
  damsel: Damsel | null;
  flight: Flight | null;
  /** Recently chosen action keys, used to discourage loops. */
  recent: string[];
  brawlUntil: number;
  blackoutUntil: number;
  stats: { kills: number; fights: number; maxLevel: number };
  over: boolean;
  ending: null | 'dead' | 'victory' | 'dawn';
}

export interface Ctx {
  w: World;
  rng: Rng;
  emit(type: string, outcome: Outcome, data?: EventData): void;
}

export type { GameEvent };
