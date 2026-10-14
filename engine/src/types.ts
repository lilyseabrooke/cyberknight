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
  /** Guns: the kind of ammunition they burn, and how much each round of shooting costs. */
  ammoType?: string;
  perRound?: number;
  /** Ammo boxes: how many rounds are inside. Picking one up pours it into `hero.ammo`. */
  rounds?: number;
}

export interface Buff {
  id: string;
  until: number;
  power: number;
  /** Stimulants that raise a stat: applied on use, taken back off when the buff lapses. */
  stat?: 'muscle' | 'reflex' | 'hack' | 'charm';
  amount?: number;
  /** Power penalty she eats once it wears off. */
  crash?: number;
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
  /** 0..1. How content she is, romantically, for now. Decays slowly; amorous company speeds it up. */
  satiety?: number;
  muscle: number;
  reflex: number;
  hack: number;
  charm: number;
  injuries: Injury[];
  weapon: Item;
  armor: Item | null;
  inventory: Item[];
  /** Rounds on hand by ammo type (see content/ammo.ts). Shooting spends them; no rounds, no shooting. */
  ammo: Record<string, number>;
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
  /** An outstanding NPD bounty. Hitting someone who has one doesn't bring the police down on her. See bounty.ts. */
  bounty?: { amount: number; hidden: boolean };
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
  kind: 'bar' | 'street' | 'club' | 'corp' | 'tunnel' | 'boss' | 'shop' | 'home';
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
  /** Security cameras. They see everything she does, unless the power is out. */
  cameras: number;
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
  mind: Mind;
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

export type GoalKind = 'cash' | 'buy' | 'weapon' | 'kill' | 'romance' | 'heist';

/**
 * Something Blackbird has decided she wants. Goals nest (`parent`): a grudge needs a better
 * weapon, which needs a shop's price in cash, which needs a heist. Only the innermost open goals
 * steer her; the ones above them wait. See goals.ts.
 */
export interface Goal {
  id: number;
  kind: GoalKind;
  parent: number | null;
  /** The person (kill, romance). */
  npc?: Id;
  /** The thing (buy): a key into `Mind.wares`. */
  ware?: string;
  /** The place (heist). */
  loc?: Id;
  /** cash: the money she wants on hand. weapon: the power she wants to be swinging. */
  amount?: number;
  /** kill: 'kill' | 'beat_up'. heist: 'approach' | 'loot' | 'escape'. */
  mode?: string;
  /** Her reason, in her own words-ish; shown in the log and the status panel. */
  why: string;
  /** 0..1, how much she wants it right now. Decays as she gets bored of it. */
  desire: number;
  /** 0..1, how fed up she is with how it's going. */
  frustration: number;
  born: number;
  lastProgress: number;
  /** Last measure of how close she is (higher is nearer), to notice progress. */
  metric: number;
  /** On hold until this beat (0 = not delayed). */
  delayUntil: number;
  delayWhy?: string;
  setbacks: number;
  /** How many times she has reworked what she's after instead of quitting. */
  revisions: number;
  /** Kill: she has actually thrown a punch at them. */
  struck?: boolean;
  /** Heist bookkeeping. */
  heat0?: number;
  looted?: boolean;
  blown?: boolean;
  /** Last beat this goal was steering her, to notice when she has drifted off it. */
  lastFocus: number;
  /** The opportunity she is working right now. See pursuit.ts. */
  pursuit?: Pursuit;
}

/** Decide what to do, then look for the chance to do it: who she's after, how, and how far along she is. */
export interface Pursuit {
  /** hunt: the goal's own target. bounty / odd_jobs: ways to raise cash. ask: looking for a lead. */
  plan: 'hunt' | 'bounty' | 'odd_jobs' | 'ask';
  npc?: Id;
  /** search: where is he? approach: on the way. assess: in the room, sizing him up. act: doing it. */
  phase: 'search' | 'approach' | 'assess' | 'act';
  since: number;
  /** Her read on the fight, from the last time she sized the target up. */
  verdict?: 'take' | 'lure' | 'wait' | 'prep';
  assessedAt?: number;
  lureBeats?: number;
  /** People she has written off as too much for her right now, until this beat. */
  passed: Record<Id, number>;
  /** Rooms she has already looked in while searching. */
  searched: Id[];
  /** The best option's score when she committed, so she only switches for something clearly better. */
  eff?: number;
}

/** Something she's seen for sale. */
export interface Ware {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'implant';
  loc: Id;
  price: number;
  /** What it adds. Weapons and armor: power. */
  power: number;
  seen: number;
}

/** What she knows, what she wants, and how she's going about it. All plain JSON. */
export interface Mind {
  goals: Goal[];
  nextId: number;
  wares: Record<string, Ware>;
  /** Where she last saw each person. */
  lastSeen: Record<Id, Id>;
  /** What she believes each kind of action earns her, by candidate family (learned from experience). */
  earn: Record<string, number>;
  /** Recomputed every beat: the goals steering her right now, and how hard. */
  drive: { id: number; weight: number }[];
  /** Recomputed every beat: the next step towards where her goals want her (location id -> pull). */
  hops: Record<Id, number>;
  /** Goals that ended, by `kind:subject`, so she doesn't pick the same one straight back up. */
  cooldown: Record<string, number>;
  /** The leaf goal that has been steering her most lately (so she doesn't flip-flop). */
  focus: number | null;
  tally: { done: number; dropped: number; revised: number; delayed: number };
  /** Bounties she knows about, by NPC id, and how she found out. Nobody's bounty is visible until she's seen it. */
  bounties?: Record<Id, 'scan' | 'scanner' | 'tip'>;
}

export interface Ctx {
  w: World;
  rng: Rng;
  emit(type: string, outcome: Outcome, data?: EventData): void;
}

export type { GameEvent };
