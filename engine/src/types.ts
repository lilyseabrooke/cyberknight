import type { Rng } from './rng';
import type { Personality } from './personality';
import type { EventData, GameEvent, Outcome } from './events';
import type { Phase } from './clock';
import type { Trait } from './personality';
import type { Faction } from './factions';

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
  /** Weapons: the traits that make this one different from the next. See weapons.ts. Named classics without it get plain defaults. */
  fx?: WeaponFx;
}

/** What a weapon does besides hit. Every number is a trade against the base damage in `Item.power`. */
export interface WeaponFx {
  /** What it is, for names and for who can use it: blade, club, pistol... */
  cls: string;
  /** How good it is for its price, 0..9ish (a tire iron is about 0, a pulse rifle about 9). */
  tier: number;
  /** Chance of a critical hit per round, and what a crit multiplies damage by. */
  crit: number;
  critMult: number;
  /** Armor the target's plating loses against this weapon. */
  pierce: number;
  /** 0 is silent, 1 is a gunshot in a cathedral. Witnesses notice loud weapons. */
  noise: number;
  /** Armor she gains while holding it. */
  armor: number;
  /** Damage multipliers against kinds of enemy, by tag or archetype (robot, cop, ganger, dragon...). */
  vs: Record<string, number>;
  /** Chance per hit that the target loses its next attack. */
  stun: number;
  /** Chance per hit that the target catches fire and keeps taking damage. */
  burn: number;
  /** A skill that is better while she holds it. */
  skill?: { id: string; bonus: number };
  /** For when there's encumbrance. */
  weight: number;
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

/** 'none' is for machines and monsters, who don't come into it. */
export type Gender = 'woman' | 'man' | 'nonbinary' | 'none';

/** How far along a romance is, as one side sees it. Each side keeps its own; they needn't agree. */
export type Stage = 'interest' | 'fling' | 'seeing' | 'together' | 'ex';

/** One person's feelings about the other. See bonds.ts. */
export interface Feelings {
  stage: Stage;
  /** 0..100: how much they want this, right now. Fades with time apart; flares with attention. */
  ardor: number;
  /** World minute the stage last changed. */
  since: number;
  /** World minute they were last together in person. */
  seen: number;
  /** World minute decay was last applied. */
  checked: number;
  /** Nights spent together. */
  nights: number;
  /** How it ended, from this side's point of view (stage 'ex'). */
  ended?: { how: 'left' | 'was_left' | 'drifted' | 'caught' | 'chose_partner'; at: number };
  /** Hers only: she knows the other has someone. */
  knowsPartner?: boolean;
  /** The stage the other side was in when this side last noticed they disagree, so it's remarked on once. */
  noticed?: Stage;
}

export interface Partner {
  name: string;
  kind: 'husband' | 'wife' | 'boyfriend' | 'girlfriend' | 'partner';
  years: number;
  /** Set once the partner turns up in the world as a person. */
  id?: Id;
}

/** What someone is like in love, rolled the first time it matters. */
export interface Heart {
  /** 0..1: how hard it is to get them to cheat or leave. */
  loyal: number;
  /** 0..1: how happy they are with what they have. */
  content: number;
  /** 0..1: how much Blackbird does it for them, before anything she does. */
  spark: number;
  /** 0..1: how fast a good night turns into "we're together". */
  clingy: number;
  partner?: Partner;
  /** Names of people they used to be with. */
  exes: string[];
}

/** How someone is as a person, apart from their job. Only the traits that matter for an NPC; unlisted ones are unremarkable (0.5). */
export interface Character {
  traits: Partial<Record<Trait, number>>;
  /** A habit of manner, written with pronoun tokens ("hums jingles under {their} breath"). */
  quirk: string;
}

export type FactKind =
  | 'ex_member' | 'owes' | 'veteran' | 'lost_someone' | 'arrested_once' | 'was_somebody'
  | 'wants_money' | 'wants_revenge' | 'wants_out' | 'wants_to_find' | 'wants_peace';

/** How easily Blackbird could find a fact out. */
export type Vis = 'visible' | 'overheard' | 'asked' | 'secret';

/** Something true about a person: their past, or what they want. Hidden from Blackbird until she learns it. */
export interface Fact {
  id: string;
  kind: FactKind;
  vis: Vis;
  /** Another person it involves: a real NPC, or a stub. */
  about?: Id;
  data: Record<string, string | number>;
}

export type TieKind = 'kin' | 'friend' | 'rival' | 'crew' | 'boss' | 'partner';

/** One person's feeling about another. Ties are directed: each direction is its own record, and the two needn't match. */
export interface Tie {
  from: Id;
  to: Id;
  kind: TieKind;
  /** -100..100: how `from` feels about `to`. */
  regard: number;
}

/** Someone who exists only as a name on somebody else's life, until Blackbird (or the world) needs them in a room. */
export interface Stub {
  id: Id;
  name: string;
  gender: Gender;
  age: number;
  archetype: string;
  faction: Id | null;
  lastKnown?: Id;
}

/** A score someone has asked her to settle, and what it pays. */
export interface Contract {
  client: Id;
  target: Id;
  reward: number;
  mode: 'kill' | 'beat_up';
  taken: number;
}

export interface Npc {
  id: Id;
  name: string;
  /** Everyone is an adult. */
  age: number;
  gender: Gender;
  archetype: string;
  role: string;
  /** Where they are. Read-only here: `moveNpc` (population.ts) is the only thing that moves anyone, so the indexes stay true. */
  readonly locationId: Id;
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
  /** Where they live and work. Absent for people who never go anywhere. */
  home?: Id;
  /** Where they sleep: a dwelling somewhere on the map, once somebody has gone looking for it. Not the same as `home`, which is where they work. See homes.ts. */
  residence?: Id;
  /** Places they turn up, by weight. Absent means they stay where they are. See movement.ts. */
  haunts?: Record<Id, number>;
  /** Where they like to be at each time of day, overriding their haunts. */
  routine?: Partial<Record<Phase, Id>>;
  /** World minute their position was last brought up to date. */
  settledAt?: number;
  /** A bystander: nobody who matters until something makes them matter. May be dropped when far away. */
  ephemeral?: boolean;
  /** Written by hand into the world rather than rolled. */
  authored?: boolean;
  /** Present once they've mattered (see deepen.ts): they have a character, facts and ties. Absent means just somebody she's seen. */
  depth?: 'deep';
  character?: Character;
  facts?: Fact[];
  /** Word that's reached them about what she did to someone they care about: [about, what, world minute]. */
  heard?: [Id, 'hurt' | 'killed' | 'helped', number][];
  /** Their love life: set up the first time it matters (bonds.ts), then it persists with them. */
  heart?: Heart;
  /** How they feel about Blackbird. Persists: they remember even when she doesn't. */
  bond?: Feelings;
  /** What they know about Blackbird's past runs that she might not expect them to. See universe.ts. */
  knows?: { died?: number; saw?: boolean; reacted?: boolean };
  /** The dungeon (its entrance's id) they are garrisoned in. Until they have noticed her, she can't deal with them one at a time; see dungeons.ts. */
  post?: Id;
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

/** What a home does to people who break in. Rolled from its security the first time anyone does. See hazards.ts. */
export interface Hazards {
  /** Robotic guard dogs: the BARK model number (100 to 530), and how many. */
  dogs?: { model: number; count: number; cleared?: boolean };
  trap?: { kind: string; spent?: boolean };
}

export interface Location {
  id: Id;
  name: string;
  kind: 'bar' | 'street' | 'club' | 'corp' | 'tunnel' | 'boss' | 'shop' | 'home' | 'lair';
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
  /** How tired this place's crowd is of her, per skill she performs with (singing, guitar...). Recovers with time. */
  fatigue?: Record<string, number>;
  /** How wary this place is of tricks she's pulled here (scams, fake goods, fortune-telling). Fades. */
  wary?: Record<string, number>;
  /** Pieces of her graffiti up here. Drives diminishing fame and local consequences. */
  graffiti: number;
  /** Guard dogs and traps. Absent until somebody has had to find out. */
  hazards?: Hazards;
  /** Gang that claims this turf this run (a per-run situational variable). */
  territory: string | null;
  /** Which factions lean on this place, summing to 1. Absent means just whoever holds `territory`. */
  influence?: Record<Id, number>;
  /** The faction the place itself belongs to (its staff are drawn from it). */
  faction?: Id;
  /** Its people have been made. See roster.ts. */
  populated?: boolean;
  /** Present on places the city grew rather than the hand-built district. See mapgen.ts. */
  gen?: GenInfo;
  /** One line about what she sees the first time she walks in (generated places only). */
  blurb?: string;
  /** Part of a dungeon: the id of its entrance, which is also the key into `World.dungeons`. See dungeons.ts. */
  dungeon?: Id;
}

export type District = 'market' | 'nightlife' | 'tenement' | 'industrial' | 'corporate' | 'slum';

/** What kind of generated place this is; decides what grows off it. */
export type GenRole = 'street' | 'shop' | 'bar' | 'club' | 'corp' | 'flat' | 'unit' | 'tunnel' | 'backroom' | 'cellar' | 'vip' | 'outpost' | 'hideout' | 'chamber';

/** Where a generated place came from, enough to grow the next ring of the map and nothing else. */
export interface GenInfo {
  role: GenRole;
  parent: Id;
  /** Which of the parent's children this is. The id is the parent's id plus this, so a place's id says where it is. */
  slot: number;
  /** Steps of street from the hand-built district. */
  depth: number;
  district: District;
  /** Its own neighbours have been made. */
  expanded: boolean;
  /** For things that run on (corporate floors, tunnels): how far in this is, and how far it goes. */
  rank?: number;
  max?: number;
  /** Dungeon entrances: how hard it is, 1 (a few thugs) to 5 (a fortress). Rolled with the place, so it's known before anyone has been inside. */
  tier?: number;
}

export type DungeonKind = 'outpost' | 'hideout';

/** What a room's spoils are, and so what it takes to get at them. */
export type CacheKind = 'cash' | 'stash' | 'arms' | 'armor' | 'supplies' | 'data' | 'vault';

/** Something worth taking, left lying in a room. */
export interface Cache {
  kind: CacheKind;
  /** Roughly what it's worth, in neodollars. */
  value: number;
  taken: boolean;
  /** Failed attempts. Two and whatever was in it is ruined. */
  fails: number;
}

export interface DungeonRoom {
  id: Id;
  /** What the room is (barracks, data core...). Picks its blurb and what's in it. */
  role: string;
  cache?: Cache;
}

/**
 * A facility with rooms of its own, a garrison, traps and spoils: an Atlas outpost or a ganger hideout. It is part of
 * the map like any other place and persists with it. See dungeons.ts.
 */
export interface Dungeon {
  /** The entrance's location id. */
  id: Id;
  kind: DungeonKind;
  name: string;
  /** 1..5. Decided when the place is made and never changes: it sets how tough the garrison is, how nasty the traps and how rich the spoils. */
  tier: number;
  /** Who holds it. */
  faction: Id;
  /** Entrance first. */
  rooms: DungeonRoom[];
  /** Everyone posted here, in this garrisoning. */
  garrison: Id[];
  /** How many times it has been garrisoned. The first is 1. */
  occupation: number;
  /** Noise this run: the louder it has been, the less the rooms stay asleep. */
  alert: number;
  /** Rooms whose garrison knows she is in the building. */
  aware: Id[];
  /** The run (`legacy.runs`) in which the last of the garrison fell, and the run it fills up again. Both null while it's held. */
  clearedRun: number | null;
  returnsRun: number | null;
  /** How many times it has been cleared out. */
  clears: number;
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

/** A run that ended in her death, and who was there. The world remembers; so do the people who saw or heard. */
export interface DeathRecord {
  run: number;
  clock: number;
  locationId: Id;
  /** Who she was fighting, by faction. */
  killers: Id[];
  witnesses: Id[];
}

/** What the world keeps about the runs that have happened in it. */
export interface Legacy {
  /** How many runs have begun. */
  runs: number;
  deaths: DeathRecord[];
  /** Who she is. The backup in the lab restores the same personality and the same name into each new body. */
  personality: Personality;
  realName: string;
  /** Neodollars in her account: what she's put in at drop points, plus what she carried home. Spent in the lab. */
  account: number;
  /** Lab upgrades she has, by node id, with the number of ranks bought. See content/tree.ts. */
  upgrades: Record<string, number>;
  /** Neodollars spent in the lab, ever. */
  spent: number;
  /** How the last night went, money-wise; the lab shows it when she's rebuilt. Absent before the first death. */
  report?: RunReport;
}

/** The books on one night, settled when it ends. */
export interface RunReport {
  run: number;
  ending: 'dead' | 'victory' | 'dawn';
  /** What she put in at drop points, after their cut. */
  deposited: number;
  /** What the drop points took. */
  fees: number;
  /** What she was carrying when it ended. */
  carried: number;
  /** Of that, what made it into the account (all of it if she walked home; a share if she died; none otherwise). */
  recovered: number;
  /** Interest paid on the balance when she was rebuilt. */
  interest: number;
  /** Level, kills and length of the night, for the lab's wall. */
  level: number;
  kills: number;
  beats: number;
  /** Balance before and after. */
  before: number;
  after: number;
}

export interface World {
  /** This run's seed: the stream of luck Blackbird's night draws on. */
  seed: string;
  /** The world's own seed. People and places are derived from it, so they're the same in every run. */
  worldSeed: string;
  /** Persistent across runs; see Universe in universe.ts. */
  legacy: Legacy;
  beat: number;
  /** World minutes. Advances a little every beat, and more when something takes time. See clock.ts. */
  clock: number;
  rngPosition: number;
  hero: Hero;
  mind: Mind;
  npcs: Record<Id, Npc>;
  /** Who cares about whom, and how. Directed; see ties.ts. */
  ties: Tie[];
  /** People who exist only as names in other people's lives. */
  stubs: Record<Id, Stub>;
  factions: Record<Id, Faction>;
  features: Record<Id, Feature>;
  locations: Record<Id, Location>;
  /** Outposts and hideouts, by the id of their entrance. Persistent, like the places they are in. */
  dungeons: Record<Id, Dungeon>;
  /** Wanted level per faction, decays over time. */
  heat: Record<string, number>;
  /** What the gunsmith has on the shelf tonight (and any other generated gear for sale), by item id. */
  arsenal?: Record<string, Item>;
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
  stats: { kills: number; fights: number; maxLevel: number; deposited: number; fees: number };
  over: boolean;
  ending: null | 'dead' | 'victory' | 'dawn';
}

export type GoalKind = 'cash' | 'buy' | 'weapon' | 'kill' | 'romance' | 'burgle' | 'heist' | 'fame' | 'dragon' | 'raid';

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
  /** kill: 'kill' | 'beat_up'. heist: 'approach' | 'loot' | 'escape'. raid: 'approach' | 'raid' | 'out' (it's done) | 'retreat' (it's too much). */
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
  plan: 'hunt' | 'bounty' | 'odd_jobs' | 'ask' | 'perform';
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
  /** Fame: the act she's going to put on, and when she got to the venue without managing it. */
  act?: string;
  arrived?: number;
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
  /** Weapons: what's actually on the shelf, so she can judge it against a particular enemy. */
  item?: Item;
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
  /** What she's currently inspired to get good at, if anything. See stage.ts. */
  passion?: { skill: string; level: number; since: number };
  /** What she expects each kind of act to do for her fame, learned from experience. */
  fame?: Record<string, number>;
  /** What she has found out about people: NPC id -> ids of their facts. Her side only; this resets with her body. */
  known?: Record<Id, string[]>;
  /** Scores she has agreed to settle. */
  contracts?: Contract[];
  /** How she feels about the people she's got something with. Her side only; this resets with her body. */
  bonds?: Record<Id, Feelings>;
  /** Bounties she knows about, by NPC id, and how she found out. Nobody's bounty is visible until she's seen it. */
  bounties?: Record<Id, 'scan' | 'scanner' | 'tip'>;
}

export interface Ctx {
  w: World;
  rng: Rng;
  emit(type: string, outcome: Outcome, data?: EventData): void;
}

export type { GameEvent };
