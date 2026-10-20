import type { Rng } from './rng';
import type { Personality } from './personality';
import type { EventData, GameEvent, Outcome } from './events';
import type { Phase } from './clock';
import type { StreetType } from './streettypes';
import type { Trait } from './personality';
import type { Faction } from './factions';
import type { HomeKind } from './content/realty';

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
  /** Upgrades a workbench has put into this (each is +1 power; the name carries the count). See bench.ts. */
  mods?: number;
  /** Weapons: the traits that make this one different from the next. See weapons.ts. Named classics without it get plain defaults. */
  fx?: WeaponFx;
  /** Instruments: what it is and what it does besides make noise. See instruments.ts. Classics without it get plain defaults. */
  inst?: InstrumentFx;
  /** Car keys: the car this opens (`Vehicle.id`), and whether it belonged to gangers (their cars don't keep). See cars.ts. */
  carId?: string;
  ownerGang?: boolean;
}

/** What an instrument is, and the traits that open doors. Every trait is 0..3ish. */
export interface InstrumentFx {
  /** acoustic, electric, bass, twelve_string, double_neck, keytar, flying_v, cigar_box, chainsaw. */
  cls: string;
  /** How good it is for its price, 0..9ish. */
  tier: number;
  /** Levels it adds to the skills it's played with (guitar; a keytar also DJs). */
  tone: number;
  /** How far it carries: bigger crowds, more fame and fans from a set, and loud enough to draw people out of a building. */
  volume: number;
  /** It carries a famous player's name: crowds give her the benefit of the doubt. */
  signature: number;
  /** It plugs into city systems: billboards, PA towers. */
  jacked: number;
  /** Swinging it at someone doesn't break it. */
  hardened: number;
  /** It finds things' frequencies: a bonus against robots, or dragons. */
  resonance: number;
  resonates?: 'robot' | 'dragon';
  /** A held note that can floor a person: stun when it's swung, or played at them. */
  feedback: number;
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
  stat?: 'muscle' | 'reflex' | 'int' | 'charm';
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

/** A car she is in. It goes with her along the streets and is parked where she walks into a building. See vehicles.ts and cars.ts. */
export interface Vehicle {
  /** Which car this is. A key opens the car with this id. */
  id: string;
  /** A car is a box she sits in; a bike is something she sits on, with nothing between her and the street. */
  body: 'car' | 'bike';
  /** Whose it was, and so who comes looking: a civilian's, the NPD's, Atlas's. */
  kind: 'civilian' | 'police' | 'atlas';
  name: string;
  /** How much further it takes her than a civilian car does. */
  speed: number;
  /** Top speed on the fight-board scale (tiles a round). */
  pace: number;
  hp: number;
  maxHp: number;
  /** Flat cut from gunfire; also what makes the bang bigger when it goes. */
  armor: number;
  /** Everyone aboard, counting Blackbird. */
  seats: number;
  /** The companions aboard right now (ids). They get out when she parks. */
  riders: Id[];
  mounted?: 'gun' | 'ram';
}

/** A car she took and left on a street. It is hers until it is towed, recovered or stripped (`until`, a world minute). */
export interface ParkedVehicle extends Vehicle {
  at: Id;
  until: number;
}

export interface Hero {
  name: string;
  /** Sneaking: only then is anyone's awareness of her tracked. Out of stealth everyone in the room knows exactly where she is. See stealth.ts. */
  stealth?: boolean;
  /** Hack and Override techniques she has picked up beyond the ones she starts with (see `LEARNABLE` in techniques.ts). */
  techniques?: string[];
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
  /** 0..1. How worked over her body is from training. Trims her in a fight and makes injuries likelier; a sauna or a physio helps. See gym.ts. */
  sore?: number;
  /** 0..100, full to empty. Falls slowly with world time; eating refills it; at zero she starves. Absent (an older save) means full. See needs.ts. */
  hunger?: number;
  /** 0..100, rested to wrecked. Falls with world time while she is awake; sleeping refills it; at zero she passes out. Absent means rested. See needs.ts. */
  sleep?: number;
  /** The world minute her hunger and sleep were last brought up to date. */
  needsAt?: number;
  /** What hunger and tiredness are taking off her right now: power in a fight, and points off each stat (already deducted from the stat itself). See needs.ts. */
  needsFx?: { power: number; muscle: number; reflex: number; int: number; charm: number };
  /** The tier each meter was last announced at, so a slide down the bar is remarked on once per step. */
  needTier?: { hunger: string; sleep: string };
  /** Stacks of lingering tiredness from poor beds: poor nights add them, good ones take them off, and they don't wear off with time. See needs.ts. */
  sleepDebt?: number;
  muscle: number;
  reflex: number;
  int: number;
  charm: number;
  injuries: Injury[];
  weapon: Item;
  armor: Item | null;
  inventory: Item[];
  /** The vehicle she is driving, if any. */
  vehicle?: Vehicle;
  /** Cars of hers parked around the city; she gets back in without hijacking again. */
  parked?: ParkedVehicle[];
  /** Companions she left behind when she drove off, who chose to wait where they were (`at`). They rejoin when she comes back. */
  waiting?: (Companion & { at: Id })[];
  /** Rounds on hand by ammo type (see content/ammo.ts). Shooting spends them; no rounds, no shooting. */
  ammo: Record<string, number>;
  /** Components on hand by part id (see content/parts.ts): what a workbench takes things apart into and builds them from. Absent means none. */
  parts?: Record<string, number>;
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
  /** Muscle, reflex, intelligence and charm, like hers. Rolled from level, tags and archetype the first time anyone looks (see npcstats.ts). */
  stats?: Record<'muscle' | 'reflex' | 'int' | 'charm', number>;
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
  /** Hurt past saving unless somebody does something: they die when the world clock reaches `dieAt`. See dying.ts. */
  dying?: { dieAt: number; severity: number };
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
  /** What they know about Blackbird, tracked while she sneaks. See stealth.ts. */
  aware?: Awareness;
  /** The dungeon (its entrance's id) they are garrisoned in. Until they have noticed her, she can't deal with them one at a time; see dungeons.ts. */
  post?: Id;
  /** A job they have for Blackbird, once they've told her about it. Persists with them: the world remembers a job even when she doesn't. See quests.ts. */
  quest?: Quest;
  /** What Blackbird has talked them into wanting, tonight. See influence.ts. */
  goals?: NpcGoal[];
}

export type NpcGoalKind = 'give_cash' | 'cover' | 'back_me_up' | 'go_after' | 'spill' | 'kiss' | 'steal_car' | 'take_deck' | 'buy_round' | 'tag_wall' | 'karaoke';
/** The four ways she gets round somebody: the skills under Charm that make people do things. */
export type InfluenceMethod = 'persuasion' | 'intimidation' | 'romance' | 'grifting';

/** Something Blackbird has put in somebody's head. They carry it out in their own way, for as long as it lasts. */
export interface NpcGoal {
  id: number;
  kind: NpcGoalKind;
  /** How she got them to take it on. */
  method: InfluenceMethod;
  /** go_after: the person they are going after. spill: the person whose business it is, if it's somebody else's. */
  target?: Id;
  /** give_cash: how much. */
  amount?: number;
  born: number;
  /** The beat it wears off. */
  until: number;
  /** They did it because they were frightened. Fear leaves a grudge. */
  coerced?: boolean;
  /** They did it because she lied. They may work that out. */
  conned?: boolean;
  /** go_after: they are on their way. */
  sent?: boolean;
  /** Errands: where it is to be done, when it needs a place of its own. */
  loc?: Id;
  /** Errands: how many ways they have tried and failed. */
  tries?: number;
  /** Errands: not before this beat. */
  wait?: number;
  /** People a speech moved along with them who are not simulated: they follow, and lend whoever is carrying this their numbers. See speaking.ts. */
  followers?: Id[];
}

/**
 * How much one person (or camera) knows about Blackbird. `v` runs 0..1; with `fix` (they know where she is) a high `v`
 * is Aware, without it Alert. Having lost her, they stay Alert until `floorUntil`, then slowly forget. See stealth.ts.
 */
export interface Awareness {
  v: number;
  fix: boolean;
  /** Alert is the floor until this beat. */
  floorUntil: number;
  /** Where they last had her. */
  seenAt?: Id;
  /** When they last called for help, and whether anyone has had her since (if not, they don't call again). */
  calledAt?: number;
  calledSince?: boolean;
  /** Hushed: no communicator or optics link until this beat. Silenced: no call at all, not even a shout. */
  hushUntil?: number;
  silenced?: boolean;
}

export type QuestKind = 'flatline' | 'retrieve' | 'hack';

/**
 * A job somebody wants done: go to a place that was made for it and do one thing there. The place (a spot or a dungeon at the end
 * of a trail of new streets) is built when the job is first described and is part of the map from then on.
 */
export interface Quest {
  kind: QuestKind;
  /** The want (a fact on the giver) it grew out of. */
  fact: string;
  /** The entrance of the place (also the key into `World.dungeons`). */
  site: Id;
  /** The role of the room the objective is in (`spot` for a spot, which is one room). */
  room: string;
  /** Neodollars, on delivery. */
  reward: number;
  /** flatline: who has to go (set once the place has been built and they are in it), and what they are. */
  target?: Id;
  targetGender?: Gender;
  /** What it is, for the log: the target's name, the thing to bring back, the system to get into. */
  what: string;
  /** open: not done yet. ready: done, waiting to be reported. done: paid. failed: spoiled for tonight. */
  state: 'open' | 'ready' | 'done' | 'failed';
  /** Run the job was described in. */
  run: number;
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
  /** Across the hex grid rather than through a door: what is in the way (see hexmap.ts). Absent on ordinary exits. */
  via?: Via;
  /** For `through` and `ramp`: the building the way goes through or over. */
  over?: Id;
}

/**
 * What it takes to cross between two places that touch on the hex grid. `open` is a plain cut-through. `fence` is vaulted on foot
 * and smashed by a car; `wall` is climbed and nothing with wheels gets over it; `barricade` is broken down on foot and rammed by a
 * vehicle; `duct` is crawled through; `through` runs straight through a building between two streets; `ramp` takes a vehicle up
 * and over a building (on foot it is only stairs).
 */
export type Via = 'open' | 'fence' | 'wall' | 'barricade' | 'duct' | 'through' | 'ramp';

/** What a home does to people who break in. Rolled from its security the first time anyone does. See hazards.ts. */
export interface Hazards {
  /** Robotic guard dogs: the BARK model number (100 to 530), and how many. */
  dogs?: { model: number; count: number; cleared?: boolean };
  trap?: { kind: string; spent?: boolean };
}

export interface Location {
  id: Id;
  /** Set on highways only. (Their `street` type is 'highway' too.) */
  road?: 'highway';
  /** What sort of street this is, for streets: how a car takes it (`roadClass`, roads.ts) and what its board looks like (streets.ts). Set when it is made. */
  street?: StreetType;
  name: string;
  kind: 'bar' | 'street' | 'club' | 'corp' | 'tunnel' | 'boss' | 'shop' | 'home' | 'lair' | 'clinic' | 'gym' | 'pawn' | 'realty' | 'chop';
  exits: Exit[];
  /** Where it stands on the hex grid (outdoor places only): every cell it covers, and the cell it is anchored on. See hexmap.ts. */
  hex?: { q: number; r: number; cells: [number, number][]; /** The way it runs, for streets: the direction it grew in. */ dir: number };
  /** Ways onto the neighbours it touches on the grid that are not doors: over fences, through barricades, along ducts. Set apart from `exits` because they depend on what stands next to it. */
  links?: Exit[];
  /** 0..10. Raises the chance of being spotted while sneaking. */
  security: number;
  crowded: boolean;
  outdoors: boolean;
  /** Where the hero ends up when thrown out. */
  tossTo: Id;
  /** Where the hero scrambles when fleeing. */
  fleeTo: Id;
  visits: number;
  /** Things she has done here (arriving doesn't count). Familiarity breeds boredom; see `restlessness` in run.ts. */
  doings?: number;
  /** Security cameras. They see everything she does, unless the power is out. */
  cameras: number;
  /** Cameras Blackbird has shut down for now (Blackout), and the beat they come back on. */
  camsDown?: { n: number; until: number };
  /** Particular cameras she has Overridden (by id), and until when: the ones that were looking at her. */
  camHacked?: { ids: string[]; until: number };
  /** How much there is to hide behind, 0..1 (the crowd, the dark and the weather add to it). Absent means a little. See stealth.ts. */
  cover?: number;
  /** What the cameras here know about Blackbird while she sneaks, 0..1. */
  camAware?: number;
  /** How tired this place's crowd is of her, per skill she performs with (singing, guitar...). Recovers with time. */
  fatigue?: Record<string, number>;
  /** How wary this place is of tricks she's pulled here (scams, fake goods, fortune-telling). Fades. */
  wary?: Record<string, number>;
  /** People who saw her play here and liked it: her fans, as Neo counts them. Outlives her, like the place does. See renown.ts. */
  fans?: number;
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
  /** Nobody gets in until this beat: the owner's been put down, or the police have taped the door. See shutdown.ts. */
  shutUntil?: number;
  shutBy?: 'owner' | 'police';
  /** Open from, to (hours of the day; a close before the open runs past midnight). See hours.ts. */
  hours?: [number, number];
  /** The owner is dead. The whole building stays shut, night after night, until this run, then reopens under somebody new (and maybe a new name). See shutdown.ts. */
  sealed?: { reopenRun: number; main: Id; former: string; faction?: Id; staff: Id[]; muscle: boolean };
  /** Somebody who works here has been laid out and the police are on their way. */
  pendingShut?: { due: number; who: Id };
  /** The house has lost its muscle and is looking for more. */
  pendingHire?: { due: number };
  /** Part of a dungeon: the id of its entrance, which is also the key into `World.dungeons`. See dungeons.ts. */
  dungeon?: Id;
  /** A gym's makeup: what it is, what building it's in, what it has. Rolled with the place. See content/gyms.ts. */
  gym?: GymInfo;
  /** A room of a gym (locker room, pit, sauna...): which gym, and which room. */
  gymRoom?: { main: Id; room: string };
  /** The gym's fight ladder: the rung she has reached and how many bouts she has won here. See gym.ts. */
  ladder?: { rank: number; wins: number };
  /** A pawn shop's makeup: what it is, what building it's in, what it has. Rolled with the place. See content/pawns.ts. */
  pawn?: PawnInfo;
  /** A room of a pawn shop (vault, workshop, parlour...): which shop, and which room. */
  pawnRoom?: { main: Id; room: string };
  /** A chop shop's makeup: what it is built in, how good the bench is, what the door costs. Rolled with the place. See content/chops.ts. */
  chop?: ChopInfo;
  /** A pawn shop's shelf: what is on it, including whatever she hocked and may still buy back. Made the first time it is looked at. See pawnkit.ts. */
  shelf?: PawnLot[];
}

/** What a chop shop is. Small on purpose: a shell, a bench and a door. (content/chops.ts says what each id means.) */
export interface ChopInfo {
  shell: string;
  /** 1..5. How good the bench is: it gates the harder recipes and nudges every roll. */
  tier: number;
  /** The flat fee for a day at the bench, in nd. */
  fee: number;
  /** Who minds the door: a person, or a machine that does not take bribes. */
  door: 'guard' | 'bot';
  /** Quirks, by id (0 to 2 of them; content/chops.ts). */
  traits: string[];
}

/**
 * What a pawn shop is. Every field is rolled independently from the shop's own stream, so any combination can turn up.
 * (content/pawns.ts says what each id means; ids that are no longer known are ignored, so the tables can grow.)
 */
export interface PawnInfo {
  variant: string;
  shell: string;
  /** 0 (a closet) to 4 (a sprawl). */
  size: number;
  /** 0 (derelict) to 4 (immaculate). */
  condition: number;
  /** 1..5. How good the appraiser is, how rich the stock and the till are. Independent of everything else. */
  tier: number;
  traits: string[];
  /** Feature ids present anywhere in the building, as "room:feature". */
  features: string[];
  /** Room ids it has (the rooms themselves are places off the main floor). */
  rooms: string[];
  /** A one-in-a-dozen oddity that breaks the rules. */
  wild?: string;
}

/**
 * One thing on a pawn shop's shelf. Hers (she hocked it: `paid` is what she took, `since` is the day) or the house's.
 * Whether it is still held for her, forfeit, or gone is a function of the day (`until`), so it cannot drift.
 */
export interface PawnLot {
  item: Item;
  hers: boolean;
  /** What she was paid for it (hers only). */
  paid: number;
  /** The day it went on the shelf. */
  since: number;
  /** The day it is gone (sold on). */
  until: number;
  /** Hers: the day the hold ends and it goes up for retail. */
  held?: number;
  /** Where it sits: the main floor if absent. */
  room?: string;
  /** Stolen from this shop once; it is hot to them for good. */
  hot?: boolean;
  /** It comes back (the cursed item). */
  cursed?: boolean;
}

/**
 * What a gym is. Every field is rolled independently from the gym's own stream, so any combination can turn up.
 * (content/gyms.ts says what each id means; ids that are no longer known are ignored, so the tables can grow.)
 */
export interface GymInfo {
  variant: string;
  shell: string;
  /** 0 (a closet) to 4 (a sprawl). */
  size: number;
  /** 0 (derelict) to 4 (immaculate). */
  condition: number;
  /** 1..5. Trainer quality, pit fighters, prices. Independent of everything else. */
  tier: number;
  traits: string[];
  /** Feature ids present anywhere in the building (each lives in a room; see FEATURES). */
  features: string[];
  /** Room ids it has (the rooms themselves are places off the main floor). */
  rooms: string[];
  /** A one-in-a-dozen oddity that breaks the rules. */
  wild?: string;
}

export type District = 'market' | 'nightlife' | 'tenement' | 'industrial' | 'corporate' | 'slum';

/** What kind of generated place this is; decides what grows off it. */
export type GenRole = 'street' | 'clinic' | 'shop' | 'bar' | 'club' | 'corp' | 'flat' | 'unit' | 'tunnel' | 'backroom' | 'cellar' | 'vip' | 'outpost' | 'hideout' | 'spot' | 'chamber' | 'gym' | 'gymroom' | 'pawn' | 'pawnroom' | 'realty' | 'chop';

/** Where a generated place came from, enough to grow the next ring of the map and nothing else. */
export interface GenInfo {
  role: GenRole;
  parent: Id;
  /** Which of the parent's children this is. The id is the parent's id plus this, so a place's id says where it is. */
  slot: number;
  /** Steps of street from the hand-built district. */
  depth: number;
  district: District;
  /** How dangerous it is, on the grade scale (grade.ts). Streets walk it from their parent; everything on a street shares it. Absent on maps made before danger existed. */
  danger?: number;
  /** An outermost street of the starting district: nothing runs on past it until the gate is open (mapgen.ts `liftCordon`). */
  cordon?: boolean;
  /** Roads that already ran on past a cordon when the cordon was added to an older save, held back until it comes down. */
  sealed?: Exit[];
  /** Its own neighbours have been made. */
  expanded: boolean;
  /** For things that run on (corporate floors, tunnels): how far in this is, and how far it goes. */
  rank?: number;
  max?: number;
  /** Dungeon entrances: how hard it is, 1 (a few thugs) to 5 (a fortress). Rolled with the place, so it's known before anyone has been inside. */
  tier?: number;
  /** Small encounter spots: which one it is (content/spots.ts). */
  spot?: string;
  /** Made for a job: the id of the person who wants it done. See quests.ts. */
  quest?: Id;
}

export type DungeonKind = 'outpost' | 'hideout' | 'spot';

/** What a room's spoils are, and so what it takes to get at them. */
export type CacheKind = 'cash' | 'stash' | 'arms' | 'armor' | 'supplies' | 'data' | 'vault';

/** Something worth taking, left lying in a room. */
export interface Cache {
  kind: CacheKind;
  /** Roughly what it's worth, in neodollars. */
  value: number;
  taken: boolean;
  /** Spots: how much richer this is for being kept by people with no paper on them (1 or absent is usual). */
  rich?: number;
  /** Failed attempts. Two and whatever was in it is ruined. */
  fails: number;
}

export interface DungeonRoom {
  id: Id;
  /** What the room is (barracks, data core...). Picks its blurb and what's in it. */
  role: string;
  cache?: Cache;
  /** What a job needs doing in here: a thing to take or a system to get into (flatline jobs are a person, not a fixture). */
  objective?: { kind: 'item' | 'terminal'; done: boolean; fails: number };
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
  /** Spots: which one (content/spots.ts), and how many people were posted in this garrisoning (none means it was only ever a stash). */
  spot?: string;
  posted?: number;
  /** Spots: what is going on in this garrisoning (the setup it was dealt). */
  scene?: string;
  /** Made for a job: the person who wants it done (their `quest` says what). */
  quest?: Id;
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
  /** The family: picks the text and the behaviour. The model within it (and its mark) is `model`. */
  kind: 'artemis' | 'hera' | 'hermes' | 'demeter' | 'ares' | 'apollo';
  /** The archetype flying, e.g. `ares4`. Absent means the family's own first model (`artemis`, `hera`). See dragonmodels.ts. */
  model?: string;
  ids: Id[];
  locationId: Id;
  until: number;
  hidden: boolean;
  noticed: boolean;
  /** Where it is in its routine: a Demeter making its demand, an Ares screaming ahead of a raid or raiding. */
  phase?: 'scream' | 'raid' | 'demand';
  /** The beat a scream gives way to the dragon itself. */
  arrives?: number;
  /** What a Demeter is asking for. */
  demand?: number;
  /** How far it has got towards her, in hops, while it chases a hero who has moved on. */
  reach?: number;
  /** The beat it first turned up, so a dragon that keeps up with her can't do it forever. */
  born?: number;
  /** What a courier is carrying. */
  cargo?: string;
  /** The world minute it was last seen to, so a long wait (laying low) counts for the ground it covers. */
  clock?: number;
  /** She has chosen to wait out an Ares in the open. */
  stand?: boolean;
  /** She got indoors ahead of an Ares. */
  sheltered?: boolean;
  /** Where she took cover from one that hadn't reached her yet; she is still hidden when it does. */
  coverIn?: Id;
  /** Roams the streets of a district on its own errands (see `Roam`). Absent means it just hangs over where she is. */
  roam?: Roam;
  /** Kept from one night to the next, and never forgotten for being far away: it leaves the district and comes back later. See dragons.ts. */
  persist?: boolean;
  /** What this one is like, so two of a kind needn't behave alike. Absent means the family's average. See `DragonTemper`. */
  temper?: DragonTemper;
  /** She has seen this one on this visit (so it is in `Legacy.dragonLog`, once). */
  logged?: boolean;
}

/** A dragon she has seen: enough to bring it back later, and for her to know it when it comes. See dragonlog.ts. */
export interface DragonRecord {
  /** Its callsign, which is how she knows it. */
  name: string;
  /** The archetype it is, e.g. `ares2`. */
  model: string;
  temper: DragonTemper;
  /** Visits she has seen it on, the run it was first and last seen on, and the times she has fought it. */
  seen: number;
  first: number;
  last: number;
  fought: number;
  /** Where she last saw it. */
  place?: string;
  /** She killed it. It will not be back. */
  killed?: boolean;
}

/**
 * A dragon's personality: five dials, each 0..1 with 0.5 about average for dragons in general (a family has its own
 * leanings, and each dragon is its own variation on them). See dragonmodels.ts for how they're rolled and dragons.ts for
 * what each does.
 */
export interface DragonTemper {
  /** How much of the district it wants to see: goes to streets it hasn't been to, makes more stops. */
  curiosity: number;
  /** How readily it hurts people for no reason. */
  aggression: number;
  /** How much it would sooner pick a spot and hold it, attacking whoever comes near. */
  territoriality: number;
  /** How long it stays, and how long it'll go on without something to do. */
  patience: number;
  /** How quick it is to notice her. */
  alertness: number;
}

/**
 * A dragon's visit to a district: it flies in, goes through the pattern of its kind (a prowl, a rampage, a round of
 * deliveries, a sweep), takes off, and is forgotten once it is far enough from her. Times are world minutes.
 */
export interface Roam {
  /** `stay` runs its pattern; `leave` has taken off and is flying out of the district; `away` is a persistent one that has gone for now. */
  stage: 'stay' | 'leave' | 'away';
  /** The outdoor places of the district it came to, and the one it came in at. */
  district: Id[];
  entry: Id;
  /** When it next moves, and when it will have had enough. */
  nextAt: number;
  until: number;
  /** Where it has been, where it means to go, and (for an Ares) when it last had someone to hurt. */
  visited: Id[];
  goals: Id[];
  lastHit: number;
  /** Places an Ares has already raided on this visit. */
  raided: Id[];
  /** Hops it has flown off since taking off. */
  away: number;
  /** When a persistent one comes back. */
  returnAt?: number;
  /** She was with it at the end of the last beat, and when she last heard it close by. */
  met?: boolean;
  nearAt?: number;
  /** The world minute it was last tended, for the ground it covers while she waits. */
  tended?: number;
  /** Where she was when it was last tended, to tell who moved when they part. */
  heroAt?: Id;
  /** A territorial one's chosen spot. */
  den?: Id;
  /** A fast one went through where she is during the beat, and (once it leaves) where it went next. */
  passed?: boolean;
  flash?: Id;
  /** The last time she saw it flash through, and which way it went: what she knows about it. */
  seen?: { at: Id; toward: Id; beat: number };
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
  /** Dragons that are kept from night to night (`Flight.persist`), asleep until the next one begins. */
  dragons?: Flight[];
  /** Every dragon she has seen, newest sightings last. New dragons are now and then one of these again. */
  dragonLog?: DragonRecord[];
  deaths: DeathRecord[];
  /** Who she is. The backup in the lab restores the same personality and the same name into each new body. */
  personality: Personality;
  realName: string;
  /** Neodollars in her account: what she's put in at drop points, plus what she carried home. Spent in the lab. */
  account: number;
  /** The starting district's lockdown: `'open'` once CINDERJAW is dead. It carries over between runs. */
  gate?: 'open';
  /** Her fame as Neo remembers it. She is rebuilt from a cached copy, so to everyone else she never left: each new body starts with it. */
  fame?: number;
  /** The in-game clock when her fame last faded (see renown.ts `fadeFame`). */
  fameAt?: number;
  /** The part of her fame that is about one performing skill ("Blackbird, the guitarist"), which sets what a crowd expects of her. See renown.ts. */
  renown?: Record<string, number>;
  /** The skill grade Neo has seen her perform at, per skill: what a crowd expects of her (0-100, like the skill). See renown.ts. */
  repute?: Record<string, number>;
  /** Letdowns in a row per skill, and the fame they cost, so a set that finally delivers can be a comeback. */
  slump?: Record<string, { sets: number; lost: number }>;
  /** Gigs she's been booked for. They wait for her through a death: the calendar doesn't know. See bookings.ts. */
  bookings?: Booking[];
  /** What Muse, the entertainment conglomerate, makes of her. Absent until she's worth a letter. See muse.ts. */
  muse?: MuseFile;
  /** Lab upgrades she has, by node id, with the number of ranks bought. See content/tree.ts. */
  upgrades: Record<string, number>;
  /** Neodollars spent in the lab, ever. */
  spent: number;
  /** Deeds she owns (see content/deeds.ts): bought once, kept through every death. Absent before the first. */
  deeds?: Deed[];
  /** How the last night went, money-wise; the lab shows it when she's rebuilt. Absent before the first death. */
  report?: RunReport;
}

/** Muse's file on her. Like her fame, it outlives her: a new body is the same Blackbird to Muse. */
export interface MuseFile {
  /** The Clearance letter has been sent ("We noticed you're making music! That's so brave"). */
  lettered?: boolean;
  /** The run in which the A&R scout last made an offer, and whether she signed. */
  offered?: number;
  /** She signed with Muse. The contract survives her death. */
  signed?: boolean;
  /** She said no, this many times. Muse takes the legal route after the first. */
  refused?: number;
  /** The death (a `DeathRecord.run`) Muse has already posted a tribute for. */
  tributeFor?: number;
}

/** A night she's been booked to play somewhere. */
export interface Booking {
  id: string;
  /** Where she plays. */
  loc: Id;
  /** The night it's for (a `legacy.runs` number). */
  night: number;
  /** What they booked her for: guitar, singing, DJing, beatboxing. */
  skill: string;
  /** 'gig': a stage at a bar or club. 'private': the entertainment, somewhere she couldn't otherwise get into. */
  kind: 'gig' | 'private';
  /** Her fee, if it goes well. */
  pay: number;
  /** Who booked her, when somebody in particular did. */
  host?: Id;
  played?: boolean;
}

/** A home she bought from a property office. It is on the map for good and hers through every death. See realty.ts. */
export interface Deed {
  /** The listing it was: the office and the place on its board. Once sold, it is off the board. */
  id: string;
  kind: HomeKind;
  /** What the deed calls it. */
  name: string;
  /** The place on the map. */
  home: Id;
  /** 0..1: how good a night in it is, like a bed's (see content/lodging.ts). */
  quality: number;
  price: number;
  district: District;
  /** The run she bought it in. */
  run: number;
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
  /** What she was chasing when the night ended, for the lab's wall. Shown once; it does not carry into the next body. */
  calling?: { label: string; progress: number };
  /** Balance before and after. */
  before: number;
  after: number;
}

/**
 * Somebody on a place's board: where they are, which way they are facing, and what they were last doing about her (a post, a patrol
 * route, a search). It lasts as long as the board does, so a guard who was halfway round a patrol when she left is still on it.
 */
export interface Ent {
  x: number;
  y: number;
  facing: number;
  home?: { x: number; y: number };
  homeFacing?: number;
  route?: { x: number; y: number }[];
  leg?: number;
  pause?: number;
  behavior?: string;
  last?: { x: number; y: number } | null;
  looked?: number;
  searched?: number[];
  calm?: number;
  sweep?: 1 | -1;
  /** Which stretch of a club patron's evening they are in (see placeboard.ts), so they move on when it changes. */
  slot?: number;
  /** When a scene last left them in the middle of something (a search, a look), so they go back to their rounds after a while. */
  sceneAt?: number;
}

/**
 * The one board a place has, for the run (see placeboard.ts). Whatever she is doing there (walking about, sneaking, fighting) it is
 * this: where she is, where everyone else is, what is lying on the floor and what has been used. The layout itself is worked out from
 * the place's id and never stored.
 */
export interface PlaceBoard {
  loc: Id;
  hero: { x: number; y: number };
  /** Where she is, coarsely: `door:<place>`, `fixture:<id>`, `near:<person>`, or `floor`. */
  at: string;
  ents: Record<Id, Ent>;
  /** People who are down or dead, where they fell, and whether anyone has found them. */
  bodies: { npcId: Id; x: number; y: number; found: boolean }[];
  /** Things in the room she can get into, and how many goes they have left. */
  props: { kind: string; x: number; y: number; charges: number }[];
  /** Lights out around a point until a round of a scene. */
  dark: { x: number; y: number; r: number; until: number }[];
  /** The beat everyone was last put at their stations. */
  placedAt: number;
}

export interface World {
  /** This run's seed: the stream of luck Blackbird's night draws on. */
  seed: string;
  /** The world's own seed. People and places are derived from it, so they're the same in every run. */
  worldSeed: string;
  /** Persistent across runs; see Universe in universe.ts. */
  legacy: Legacy;
  /** People who got away in a car, and the cars they took: she can go after them for a beat or two. See getaway.ts. */
  getaways?: { npcId: Id; /** The car they took. Absent when they ran. */ vehicle?: Vehicle; from: Id; beat: number }[];
  /** Cars left on a street by a chase (the cruiser that was still running when it ended), by street. They are what is parked there until somebody takes them. */
  strays?: Record<Id, Vehicle>;
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
  /** The dragon she is with, if any: whichever of `flights` shares her place. */
  flight: Flight | null;
  /** Every dragon in the world right now: the ones roaming a district, and any hanging over her. */
  flights: Flight[];
  /** Who is dying right now (see `Npc.dying`), so the clock only has to look at them. */
  dying: Id[];
  /** Recently chosen action keys, used to discourage loops. */
  recent: string[];
  brawlUntil: number;
  blackoutUntil: number;
  /** Where everyone is in the places she has been, this run. See placeboard.ts. */
  boards?: Record<Id, PlaceBoard>;
  /** How long she (or whoever she is after) has been running, across chases and the searches between them: it wears everyone down. */
  chaseTire?: { rounds: number; beat: number };
  /** Everyone whose awareness of Blackbird is currently worth tracking, so the beat only has to look at them. */
  watchers?: Id[];
  /** Everyone carrying a goal Blackbird gave them, so the beat only has to look at them. See influence.ts. */
  influenced?: Id[];
  stats: { kills: number; fights: number; maxLevel: number; deposited: number; fees: number };
  over: boolean;
  ending: null | 'dead' | 'victory' | 'dawn';
}

export type GoalKind = 'cash' | 'buy' | 'weapon' | 'kill' | 'romance' | 'burgle' | 'heist' | 'fame' | 'dragon' | 'raid' | 'explore' | 'quest' | 'scavenge' | 'craft' | 'booking';

/**
 * Something Blackbird has decided she wants. Goals nest (`parent`): a grudge needs a better
 * weapon, which needs a shop's price in cash, which needs a heist. Only the innermost open goals
 * steer her; the ones above them wait. See goals.ts.
 */
export interface Goal {
  id: number;
  kind: GoalKind;
  parent: number | null;
  /** The person (kill, romance). For a quest, the one who wants it done. */
  npc?: Id;
  /** The thing (buy): a key into `Mind.wares`. */
  ware?: string;
  /** The place (heist, raid, explore, quest). */
  loc?: Id;
  /** cash: the money she wants on hand. weapon: the power she wants to be swinging. */
  amount?: number;
  /** kill: 'kill' | 'beat_up'. heist: 'approach' | 'loot' | 'escape'. raid: 'approach' | 'raid' | 'out' (it's done) | 'retreat' (it's too much).
   *  quest: 'approach' | 'sneak' | 'clear' (how she's going about it, once inside) | 'retreat' | 'return' (the job is done; go and tell them). */
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
  /** Made because of her Calling: harder to drop, and not the first thing to go when she's overloaded. */
  calling?: boolean;
  /** Quest: she has been inside the place (so coming back through the door isn't news). */
  entered?: boolean;
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
/** A goal she could take on, as plain data: what `adopt` needs, so it can wait in an `Ask` until somebody answers. */
/**
 * A long-term goal Blackbird sets for herself and carries until she dies. One at a time; it does not carry over to
 * the next body. Not a Goal: it steers the goals, and what she does for fun. Plain JSON. See callings.ts and
 * docs/CALLINGS_PLAN.md.
 */
export interface Calling {
  id: string;
  since: number;
  /** 0..1, how hard it has hold of her. Rises on progress and big moments, drifts down when nothing happens. */
  fervor: number;
  /** The finish line, rolled when she took it up. */
  goal: number;
  /** Where the counter stood when she took it up, for callings that count from there. */
  base: number;
  /** Who or what it is about. `text` is how she names it ("the Chrome Vipers", "Pip"). */
  target?: { npc?: Id; faction?: Id; skill?: string; text?: string };
  origin: { kind: 'spark' | 'wound' | 'whim'; text: string; beat: number; /** A wound is a loss (someone died) or a brush (she nearly did). */ cause?: 'loss' | 'brush' };
  /** The last beat it moved, to tell a calling that's merely quiet from one she has forgotten. */
  lastProgress: number;
  /** Progress at the last look, to notice when it moves. */
  last: number;
  /** Quarter-marks already said out loud, 0..3. */
  said: number;
  wavering?: boolean;
  sequel?: boolean;
}

export interface GoalSpec {
  kind: GoalKind;
  parent?: number | null;
  npc?: Id;
  ware?: string;
  loc?: Id;
  amount?: number;
  mode?: string;
  why: string;
  desire: number;
  /** Which line of the log introduces it. */
  variant: string;
  extra?: EventData;
  /** Made because of her Calling. */
  calling?: boolean;
}

export type AskKind = 'want' | 'earn' | 'door' | 'idle' | 'calling';

/** One thing the lab can tell her. */
export interface AskOption {
  id: string;
  /** The button. */
  label: string;
  /** Small print under it. */
  hint?: string;
  /** She takes this on if it's the answer. */
  spec?: GoalSpec;
  /** She takes this on as her Calling if it's the answer. See callings.ts. */
  calling?: Calling;
  /** Things she puts off if it's the answer: cooldown key -> beats. */
  cool?: Record<string, number>;
}

/**
 * Blackbird has stopped and asked the lab tech what to do. It waits a few beats; if nobody answers, she goes with `lean`,
 * which is what she'd have done anyway. See advice.ts. Plain JSON, like the rest of the world.
 */
export interface Ask {
  id: number;
  kind: AskKind;
  asked: number;
  /** The beat she decides for herself. */
  until: number;
  /** What she says, in her own words. */
  question: string;
  options: AskOption[];
  /** The option she goes with if nobody answers. */
  lean: string;
  /** The goal she's asking about, if she's asking about one (earn), so a stale answer can be told from a live one. */
  about?: number;
  /** What the log needs to tell it (item, place, amount). */
  data?: EventData;
}

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
  /** What she has decided to do with her life, if anything. At most one, and it ends when she does. See callings.ts. */
  calling?: Calling;
  /** What she expects each kind of act to do for her fame, learned from experience. */
  fame?: Record<string, number>;
  /** What she has made of people's stat distributions with Analyze: NPC id -> estimated shares of their stats, and how sure she is. See npcstats.ts. */
  reads?: Record<Id, { shares: Record<'muscle' | 'reflex' | 'int' | 'charm', number>; quality: number }>;
  /** What she has found out about people: NPC id -> ids of their facts. Her side only; this resets with her body. */
  known?: Record<Id, string[]>;
  /** Scores she has agreed to settle. */
  contracts?: Contract[];
  /** Jobs she has said yes to but hasn't made a goal yet, by the id of whoever wants them done. She considers them when she has room for a new goal. See quests.ts. */
  quests?: Id[];
  /** How she feels about the people she's got something with. Her side only; this resets with her body. */
  bonds?: Record<Id, Feelings>;
  /** Bounties she knows about, by NPC id, and how she found out. Nobody's bounty is visible until she's seen it. */
  bounties?: Record<Id, 'scan' | 'scanner' | 'tip'>;
  /** What she is waiting to hear from the lab about. See advice.ts. */
  ask?: Ask;
  /** How the lab's advice has gone this night. */
  advice?: { asked: number; taken: number; lapsed: number; nextId: number };
}

export interface Ctx {
  w: World;
  rng: Rng;
  emit(type: string, outcome: Outcome, data?: EventData): void;
  /**
   * Emit an event that opens a group, then run `fn`: everything emitted inside it is nested under that event.
   * Optional, so a bare test context still works; use the `nested` helper rather than calling this directly.
   */
  nest?(type: string, outcome: Outcome, data: EventData, fn: () => void): void;
}

export type { GameEvent };
