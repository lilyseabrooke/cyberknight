import { Rng } from '../rng';
import { MIN_PER_DAY } from '../clock';
import type { District, Exit, GymInfo, Location, World } from '../types';
import type { SlotDef } from '../roster';

/**
 * Gyms. A gym is not one of a few kinds: it is a point rolled from independent axes, so any combination can turn up
 * (a derelict tier-5 dojo in a flooded basement that is run by the gang next door and sponsored by a beverage).
 *
 *   variant     what it mostly is (boxing, dojo, chrome...): names, blurbs, what it trains, its day pass
 *   shell       what building it is in (a church, a car park, the old baths...)
 *   size        how many things it has and how many rooms it can grow
 *   condition   derelict .. immaculate
 *   tier        1..5: how good the trainer is, how hard the fighters are, what it costs. Independent of everything else.
 *   traits      0-3 oddities from a long list; they may contradict each other and that is fine
 *   features    objects in rooms; what she can do here hangs off these (see content/gymafford.ts)
 *   rooms       places behind the main floor (locker room, office, pit...)
 *   situation   something happening right now; it is a pure function of the clock, so it needs no saved state
 *   wild        one gym in twelve has a rule-breaking oddity
 *
 * Every table is open: add a row and it can turn up. Ids that a saved world mentions but the tables no longer know are
 * ignored, never an error. Nothing here is balanced against anything else, on purpose.
 */

export const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const pick = <T>(rng: Rng, xs: readonly T[]): T => rng.pick(xs as T[]);

// ===================================================================== placement

/** Chance a street has a gym on it. Rolled on a stream of its own (see mapgen), so no existing map changes. */
export const GYM_CHANCE: Record<District, number> = { market: 0.05, nightlife: 0.08, tenement: 0.12, industrial: 0.1, corporate: 0.06, slum: 0.08 };

/** Which kind of gym, by district. Absent means 1. */
export const GYM_VARIANT: Record<District, Record<string, number>> = {
  market: { boxing: 2, dojo: 2, chrome: 1, atlasfit: 1, climb: 1, range: 0.5, cage: 1, studio: 2, wellness: 2, youth: 1 },
  nightlife: { boxing: 1, dojo: 1, chrome: 3, atlasfit: 1, climb: 1, range: 1, cage: 2, studio: 4, wellness: 1, youth: 0.2 },
  tenement: { boxing: 4, dojo: 2, chrome: 1, atlasfit: 1, climb: 1, range: 0.5, cage: 2, studio: 1, wellness: 1, youth: 3 },
  industrial: { boxing: 3, dojo: 0.5, chrome: 3, atlasfit: 0.5, climb: 2, range: 2, cage: 3, studio: 0.3, wellness: 0.2, youth: 1 },
  corporate: { boxing: 0.5, dojo: 3, chrome: 3, atlasfit: 4, climb: 1, range: 1, cage: 0.5, studio: 2, wellness: 4, youth: 0.1 },
  slum: { boxing: 4, dojo: 1, chrome: 0.5, atlasfit: 0.1, climb: 2, range: 1, cage: 3, studio: 0.5, wellness: 0.5, youth: 3 },
};

// ===================================================================== variants

export interface VariantDef {
  label: string;
  /** Skills a session here trains, first is the main one. */
  trains: string[];
  /** Day pass in nd, before tier and traits. */
  pass: number;
  /** The archetype that coaches here. */
  trainer: string;
  names: string[];
  blurbs: string[];
  /** The Atlas wallpaper: a line about how Atlas shows up (or doesn't) on the walls. */
  wall: string[];
  sec: number;
  /** Chance the main floor is crowded. */
  crowd: number;
  /** Rungs on the ladder, fewest..most. */
  rungs: [number, number];
  /** Floor features it always has. */
  floor: string[];
  /** Extra weight for floor features, on top of their base. */
  lean: Record<string, number>;
  /** Chance of each room, replacing the room's own default. */
  rooms: Record<string, number>;
  /** Room names that are not the usual ones. */
  roomNames?: Record<string, string>;
}

export const VARIANTS: Record<string, VariantDef> = {
  boxing: {
    label: 'boxing gym', trains: ['melee', 'athletics'], pass: 15, trainer: 'gym_coach', sec: 1, crowd: 0.25, rungs: [4, 6],
    names: ['Glass Jaw Gym', 'The Last Round', 'Southpaw Social Club', 'Knuckle Sandwich Boxing', 'Eight-Count Athletic', 'Ringside & Co', 'The Canvas', 'Corner Pocket Boxing', 'Sweet Science Supply (and Gym)', 'Rope-a-Dope Rec', 'The Third Round', 'Cut Man Athletic', 'Haymaker Hall', 'Bell & Towel'],
    blurbs: [
      '{name}: heavy bags stitched with tape, a ring with one loose rope and a coach who has said "again" since before she was born.',
      '{name}: it smells of liniment and ambition, in that order of strength.',
      '{name}: a ring, a speed bag and a framed poster of a boxer nobody will name.',
      '{name}: the ring has been repaired with someone\'s old banner, and the banner still has a sponsor on it.',
    ],
    wall: ['A laminated Safe-T poster by the door says "Atlas recommends consulting a physician before consulting a fist."', 'Atlas has sent a camera. The coach has put a towel on it.'],
    floor: ['ring', 'heavy_bags'], lean: { pullup_rack: 2, hall_of_fame: 2, trophy_case: 2, water_cooler: 1 },
    rooms: { locker: 0.9, office: 0.5, pit: 0.35, sauna: 0.3, physio: 0.3, juice: 0.15 },
  },
  dojo: {
    label: 'dojo', trains: ['melee', 'sneak'], pass: 40, trainer: 'sensei', sec: 1, crowd: 0.1, rungs: [3, 5],
    names: ['The Humble Crane (est. last spring)', 'Iron Heron Dojo', 'Way of the Open Palm (Annual Tier)', "Sensei Kettle's Quiet Fist", 'Dojo of the Ninth Belt', 'The Empty Cup Academy', 'Still Water Martial Arts', 'The Folded Paper Dojo', 'Seven Rules Dojo', 'Gentle Thunder Hall', 'The Patient Mantis', 'Respectful Distance Academy', 'Way of the Returned Deposit', 'Dojo of Mild Consequences'],
    blurbs: [
      '{name}: shoes off at the door, a spotless mat, and a sign listing nine rules, four of which contradict.',
      '{name}: paper screens, a gong, and a tablet at reception where she is asked to accept the Code of Honour.',
      '{name}: very quiet, very clean, and everyone bows to her at a slightly different angle.',
      '{name}: a hall of mats, a wall of belts in colours the school made up, and a smell of floor polish and certainty.',
    ],
    wall: ['The Code of Honour is on an Atlas-provided terms-of-service tablet; nobody has read past clause 3.', 'A wing-and-halo sticker on the shoe rack says SAFE-T FOOTWEAR. The shoes are not.'],
    floor: ['mats'], lean: { mirror_wall: 2, sound_system: 0.5, notice_board: 1, trophy_case: 1.5 },
    rooms: { locker: 0.9, office: 0.4, pit: 0.1, sauna: 0.5, hall: 0.4, roof: 0.2 },
    roomNames: { pit: 'Lower Hall', sauna: 'bathhouse', hall: 'tea room' },
  },
  chrome: {
    label: 'chrome gym', trains: ['athletics', 'melee'], pass: 55, trainer: 'rig_tech', sec: 2, crowd: 0.35, rungs: [3, 5],
    names: ["Hydraulic Hank's Lift & Lube", 'Torque & Tonic', 'Overclock Fitness', 'Piston Pump', 'Rig & Rep', 'Servo Social', 'Titanium Temple', 'Rated 11 Athletics', 'Coolant & Curls', 'Gigawatt Gym', 'Spare Parts Strength', 'Rebar & Rewire', 'Tolerance Zero', 'Load Bearing'],
    blurbs: [
      '{name}: lifting rigs with hydraulic spotters, a coolant fountain by the door and a rack of weights labelled in tonnes.',
      '{name}: mirrors on every wall and a man in the corner benching a vending machine.',
      '{name}: half gym, half pit lane, and everyone is mid-upgrade.',
      '{name}: the weights are cold, the people are warm, and both are slightly too shiny.',
    ],
    wall: ['A Care+ Injury Plan kiosk offers her cover for injuries she has not had yet.', 'An Atlas "Reminder: Your Body Is Insured" banner hangs over the squat racks, upside down.'],
    floor: ['rigs'], lean: { mirror_wall: 3, robot_spotter: 4, vending: 2, member_terminal: 2, cctv_console: 1.5, stream_rig: 2, treadmill_wall: 2 },
    rooms: { locker: 0.9, office: 0.5, pit: 0.25, sauna: 0.5, physio: 0.5, juice: 0.4, shop: 0.4, studio: 0.3 },
    roomNames: { pit: 'the Cage', sauna: 'coolant sauna', physio: 'tune-up bay' },
  },
  atlasfit: {
    label: 'Atlas fitness franchise', trains: ['athletics'], pass: 0, trainer: 'instructor', sec: 3, crowd: 0.4, rungs: [2, 3],
    names: ['Safe-T Fit (Branch 4,117)', 'Atlas Wellness Hub', 'Safe-T Strength & Reassurance', 'Bastion Body Studio', 'Halcyon Health Club', 'Aegis Active', 'Care+ Conditioning', 'Plus-Tier Fitness', 'Premier Pulse', 'Basic Burn (Basic Tier)', 'Atlas Active Living', 'Reassurance Reps', 'Safe-T Stretch', 'Comfort Zone Cardio'],
    blurbs: [
      '{name}: white walls, soft music, a camera over every machine and a screen that tells her she is doing great.',
      '{name}: a franchise in the sense that it franchises; the smiling instructor says "Welcome back" to someone she is not.',
      '{name}: the first session is free, the second session is a plan, and the plan has tiers.',
      '{name}: very clean, very bright, and every treadmill has her name on it, spelled correctly, which is the worrying part.',
    ],
    wall: ['Every machine carries an Atlas wing-and-halo and a wellness score.', 'A banner says "Atlas cares about your cardiovascular safety." The defibrillator is behind glass and needs a subscription.'],
    floor: ['rigs', 'treadmill_wall', 'member_terminal', 'cctv_console'], lean: { mirror_wall: 3, vending: 2, scoreboard: 2, robot_spotter: 3, sound_system: 2, stream_rig: 1 },
    rooms: { locker: 0.95, office: 0.7, sauna: 0.4, physio: 0.5, juice: 0.5, shop: 0.5, studio: 0.4, hall: 0.4 },
    roomNames: { office: 'Customer Care Office', juice: 'Wellness Bar', physio: 'Recovery Suite' },
  },
  climb: {
    label: 'climbing hall', trains: ['athletics', 'sneak'], pass: 25, trainer: 'gym_coach', sec: 1, crowd: 0.2, rungs: [3, 4],
    names: ['Chalk & Consequences', 'Rooftop in a Box', 'Route Nine', 'The Vertical Argument', 'Grip & Regret', 'Skyline Simulator', 'Ledge Lounge', 'Fall Rate Zero (Terms Apply)', 'Pigeon Perch Climbing', 'Overhang & Out', 'The Long Reach', 'Highline Habits', 'Tether & Tonic', 'Crux'],
    blurbs: [
      '{name}: a wall the height of a small tower, studded with coloured holds, each route named like a threat.',
      '{name}: chalk in the air, a crash mat the size of a car, and a bell for people who reach the top.',
      '{name}: a rooftop in a warehouse, with the pigeons removed and the vertigo left in.',
      '{name}: ropes, harnesses and a notice that says falls are the customer\'s responsibility, in a very small font.',
    ],
    wall: ['The routes are graded by Atlas "Reassurance Level". Grade 9 is a mountain of reassurance.', 'An Atlas harness-check drone circles the wall at ankle height, apologising.'],
    floor: ['climbing_wall'], lean: { skylight: 3, trampoline: 3, pullup_rack: 2, side_door: 1.5, stream_rig: 1.5, notice_board: 1 },
    rooms: { locker: 0.8, office: 0.3, roof: 0.6, storeroom: 0.4, juice: 0.2, vents: 0.3 },
  },
  range: {
    label: 'shooting range', trains: ['marksmanship', 'throwing'], pass: 30, trainer: 'range_officer', sec: 2, crowd: 0.1, rungs: [3, 4],
    names: ['Lane Nine', 'Brass & Bullseye', 'Hole in One Hundred', 'Quiet Zone Range', 'The Safe Distance', 'Sight Line', 'Sixty Paces', 'Shell Game Range', 'Cease & Desist Shooting Club', 'Paper Tiger Range', 'Windage', 'Zero Point', 'The Backstop', 'Muzzle & Mop'],
    blurbs: [
      '{name}: a long concrete corridor of lanes, a ringing in the air and a safety lecture longer than most sessions.',
      '{name}: paper targets, ear defenders and a man behind glass who has been told he is not allowed to say "bang".',
      '{name}: each lane has a little screen showing a score, and the scores are all lies by one point.',
      '{name}: brass on the floor, a smell of gun oil, and a rule board with more rules than rounds.',
    ],
    wall: ['Atlas safety stickers on every firearm: "THIS IS A DEFENSIVE TOOL."', 'The target silhouettes are all in Atlas uniform; the range officer pretends not to notice.'],
    floor: ['shooting_lane', 'dart_board'], lean: { cctv_console: 2, trophy_case: 1.5, scoreboard: 2, member_terminal: 1 },
    rooms: { locker: 0.7, office: 0.6, storeroom: 0.5, shop: 0.5, basement: 0.3 },
    roomNames: { shop: 'armoury counter', storeroom: 'ammo cage' },
  },
  cage: {
    label: 'cage gym', trains: ['melee', 'intimidation'], pass: 20, trainer: 'gym_coach', sec: 2, crowd: 0.3, rungs: [4, 6],
    names: ['Teeth & Mat', 'The Tap-Out', 'Blood Is Lighting', 'Choke Chapel', 'Cageside Social', 'Pin & Pay', 'Submission Station', 'Stoppage Time', 'Double Underhook', 'The Ground Floor', 'Ref Is Asleep', 'Mount & Mortgage', 'Clinch Club', 'Takedown Tuesday (Every Day)'],
    blurbs: [
      '{name}: a chain-link cage, a grimy mat and a bell that is a vending machine\'s dispenser bell.',
      '{name}: wrestling mats wall to wall and a smell that has opinions about her soul.',
      '{name}: the cage is the only clean thing in the room and it is not clean.',
      '{name}: a gym where everyone is gently strangling someone, with consent, probably.',
    ],
    wall: ['A medical waiver the size of a flag hangs by the door; the signature box is already ticked.', 'Atlas "Wellness Check Station" in the corner is a first-aid kit with a lock and no key.'],
    floor: ['mats', 'cage_ring'], lean: { pool_table: 1.5, heavy_bags: 3, scoreboard: 2, bet_book: 3, trophy_case: 1.5, water_cooler: 1.5 },
    rooms: { locker: 0.9, office: 0.5, pit: 0.45, sauna: 0.3, physio: 0.4, storeroom: 0.3 },
    roomNames: { pit: 'the Basement Cage' },
  },
  studio: {
    label: 'dance studio', trains: ['dancing', 'athletics'], pass: 20, trainer: 'instructor', sec: 1, crowd: 0.35, rungs: [2, 3],
    names: ['Spin Cycle Studio', 'Beat & Burn', 'Hip Check Dance Co.', 'The Pole Position', 'Mirror Mirror Movement', 'Sway Collective', 'Downbeat Fitness', 'Jazzercise-ish', 'Rhythm & Rent', 'Sixteen Counts', 'Leotard Lounge', 'Step Aside Aerobics', 'Tempo Tempo', 'Twirl Society'],
    blurbs: [
      '{name}: sprung floor, mirrors from end to end and a playlist that insists she can do it.',
      '{name}: a stack of towels, a rack of speakers and an instructor with a headset and a following.',
      '{name}: the mirrors make the room twice as big and the crowd four times as judgemental.',
      '{name}: neon strip-lights, a pole that has seen things and a poster for a recital that is on tonight.',
    ],
    wall: ['Atlas "Posture Reminder" mirrors say "Stand up straight, citizen" in tasteful grey.', 'An Atlas-sponsored playlist runs on a loop; every third song is a safety announcement with a beat.'],
    floor: ['mirror_wall', 'sound_system'], lean: { stream_rig: 3, vending: 1.5, notice_board: 2, hall_of_fame: 1, scoreboard: 0.5 },
    rooms: { locker: 0.9, office: 0.4, studio: 0.5, juice: 0.5, sauna: 0.3, hall: 0.5 },
  },
  wellness: {
    label: 'wellness centre', trains: ['medicine', 'tolerance'], pass: 60, trainer: 'instructor', sec: 2, crowd: 0.05, rungs: [2, 3],
    names: ['Still Water (Terms Apply)', 'Breathe Easy (Premium)', 'Float On', 'The Quiet Tide', 'Salt & Silence', 'Inner Peace Inc.', 'Calm Collective (Cancellation Fee)', 'Lotus & Ledger', 'Mindful Minutes', 'Serene Subscription', 'Om Moderate', 'Hush Hall', 'The Soft Reset', 'Namaste Financial'],
    blurbs: [
      '{name}: soft light, soft music, soft carpet, and a front desk that will gently hold her card.',
      '{name}: a cult with a cancellation policy, and a very nice smell.',
      '{name}: floating pods, yoga mats and a waiting list for enlightenment that has a waiting list.',
      '{name}: everything is the colour of oatmeal and costs a great deal of money.',
    ],
    wall: ['Atlas "Calm Is Compulsory" posters hang beside the meditation timetable.', 'The meditation app is Atlas. It sometimes says things in the quiet.'],
    floor: ['yoga_mats', 'member_terminal'], lean: { mirror_wall: 1, sound_system: 1.5, vending: 1, cctv_console: 1, water_cooler: 2, scoreboard: 0 },
    rooms: { locker: 0.8, office: 0.6, sauna: 0.7, physio: 0.6, juice: 0.6, shop: 0.5, hall: 0.4, studio: 0.2, roof: 0.2 },
    roomNames: { sauna: 'float room', physio: 'treatment room', hall: 'meditation hall' },
  },
  youth: {
    label: 'outreach gym', trains: ['athletics', 'streetwise'], pass: 0, trainer: 'gym_coach', sec: 0, crowd: 0.35, rungs: [2, 4],
    names: ['The Open Door Rec', 'Second Chance Rec', 'Corner Crew Athletic', 'Free Hour Hall', 'Donated Ring Club', 'Rooftop Rec', 'Anything Goes Athletic', 'The Wobbly Gym', 'Hand-Me-Down Hall', 'Sparrow Street Outreach', 'Chalk Line Club', 'Tin Roof Rec', 'Penny Pass Athletic', 'Bandage & Biscuits'],
    blurbs: [
      '{name}: a donated ring, a ping-pong table with one leg and a wall of paint-pen portraits that are better than they should be.',
      '{name}: loud, scuffed and warm, and every bag in it was somebody else\'s first.',
      '{name}: a kettle, a first-aid kit with a lot of plasters in it and a coach who is too tired to stop caring.',
      '{name}: the floor is taped into courts for six different games, and the games are all being played at once by young punks who should be elsewhere.',
    ],
    wall: ['A hand-painted "Atlas Cares" sign has been defaced, kindly, with a small drawing of a dragon in a hat.', 'The Atlas grant letter is framed by the door. The grant is a very small cheque.'],
    floor: ['heavy_bags', 'mats'], lean: { pool_table: 4, notice_board: 3, donation_tin: 3, gym_cat: 3, water_cooler: 2, trophy_case: 1, hall_of_fame: 1.5, side_door: 1 },
    rooms: { locker: 0.7, office: 0.4, storeroom: 0.5, roof: 0.3, hall: 0.5, juice: 0.4, basement: 0.2 },
    roomNames: { juice: 'tea counter', hall: 'common room' },
  },
};

// ===================================================================== shells

export interface ShellDef {
  label: string;
  line: string;
  sec: number;
  /** Multipliers on room chances. */
  rooms?: Record<string, number>;
  /** Features it comes with ("room:feature"). */
  add?: string[];
  weight?: number;
}

export const SHELLS: Record<string, ShellDef> = {
  church: { label: 'a converted church', line: 'It is a converted church: the ring is where the altar was, and the echo has not forgiven anyone.', sec: 0, rooms: { basement: 2, roof: 1.5 }, add: ['floor:hall_of_fame'] },
  containers: { label: 'a stack of shipping containers', line: 'Four shipping containers, welded together and ventilated with a grinder.', sec: 1, rooms: { storeroom: 2, pit: 0.8 } },
  tram: { label: 'an old tram depot', line: 'An old tram depot, with the rails still in the floor and a ring built across them.', sec: 1, rooms: { storeroom: 1.5, basement: 1.5 }, add: ['floor:side_door'] },
  carpark: { label: 'a multistory car park', line: 'Level three of a car park. The bays are marked; the bags hang from the ramps.', sec: 0, rooms: { roof: 3, vents: 1.5, locker: 0.6 }, add: ['floor:side_door'] },
  flooded: { label: 'a half-flooded basement', line: 'A basement with an inch of water that everyone insists is "humidity".', sec: 0, rooms: { vents: 2, pit: 1.5, sauna: 0.5 }, add: ['floor:vent_grille'] },
  rooftop: { label: 'a rooftop under tarps', line: 'A rooftop under tarps: the weather is the third sparring partner.', sec: 0, rooms: { roof: 5, basement: 0, locker: 0.5 }, add: ['roof:pigeon_coop', 'floor:skylight'] },
  cinema: { label: 'a shuttered cinema', line: 'A shuttered cinema: the ring is on the stage, and the old seats are bleachers.', sec: 1, rooms: { office: 1.3, studio: 2, storeroom: 1.5 }, add: ['floor:sound_system', 'floor:hall_of_fame'] },
  baths: { label: 'the old municipal baths', line: 'The old municipal baths, drained: the deep end is the sparring pit.', sec: 1, rooms: { pit: 2.5, sauna: 2.5, locker: 1.3 }, add: ['sauna:steam_bench'] },
  atlasdepot: { label: 'a decommissioned Atlas depot', line: 'A decommissioned Atlas depot, with a wing-and-halo stencil painted over, badly.', sec: 2, rooms: { office: 1.5, storeroom: 2, vents: 1.5 }, add: ['floor:cctv_console'] },
  marketfloor: { label: "a market's upper floor", line: 'The upper floor of a market: stalls underneath, stamping above.', sec: 1, rooms: { shop: 2, juice: 1.5 }, add: ['floor:notice_board'] },
  vault: { label: 'a bank vault', line: 'A bank vault. The door is a foot thick and now serves as a changing-room partition.', sec: 3, rooms: { office: 2, locker: 1.3, vents: 0.3, roof: 0 }, add: ['office:safe'] },
  warehouse: { label: 'a warehouse with half a roof', line: 'A warehouse with half a roof; it rains on the left-hand bags.', sec: 0, rooms: { storeroom: 2, roof: 1.5 }, add: ['floor:skylight'] },
};

// ===================================================================== size, condition

/** (how many floor features roll, how many rooms at most) */
export const SIZES = [
  { label: 'closet', features: [2, 3], rooms: 1, crowd: 0.7 },
  { label: 'small', features: [4, 5], rooms: 2, crowd: 0.9 },
  { label: 'medium', features: [6, 8], rooms: 4, crowd: 1 },
  { label: 'large', features: [9, 12], rooms: 6, crowd: 1.2 },
  { label: 'sprawl', features: [14, 18], rooms: 9, crowd: 1.5 },
] as const;

export const CONDITIONS = [
  { label: 'derelict', line: 'Half of it is held together with gaffer tape.', graffiti: 3, sec: -1 },
  { label: 'scruffy', line: 'Everything is a little bent and a lot loved.', graffiti: 2, sec: 0 },
  { label: 'decent', line: '', graffiti: 1, sec: 0 },
  { label: 'gleaming', line: 'The floor is clean enough to eat off, which someone has.', graffiti: 0, sec: 1 },
  { label: 'immaculate', line: 'Everything is polished, labelled and faintly suspicious of her boots.', graffiti: 0, sec: 1 },
] as const;

// ===================================================================== traits

export interface TraitDef {
  label: string;
  /** A sentence that can turn up in the blurb. */
  line: string;
  weight?: number;
  /** Day-pass multiplier. */
  pass?: number;
  sec?: number;
  /** Features it adds ("room:feature"). */
  add?: string[];
  /** Variants it fits (absent = any). */
  only?: string[];
}

export const TRAITS: Record<string, TraitDef> = {
  // ownership
  champ_owned: { label: 'run by a retired champion', line: 'The owner\'s old title belt hangs behind the desk, in a case, with a lock.', add: ['floor:trophy_case', 'floor:hall_of_fame'] },
  gang_front: { label: 'a gang\'s front', line: 'A gang\'s colours are on the lockers, and nobody has been asked to pay for them.', sec: 1, pass: 0.6, add: ['office:ledger'] },
  atlas_owned: { label: 'quietly Atlas-owned', line: 'The lease is Atlas. Everyone knows. Nobody says.', sec: 2, add: ['floor:cctv_console'] },
  manager_never_lifted: { label: 'a manager who has never lifted', line: 'The manager has a clipboard, a lanyard and no visible muscle.', pass: 1.3 },
  trust_of_regulars: { label: 'run by a trust of regulars', line: 'A rota on the wall decides who locks up, and it is scrupulously fair.', pass: 0.5, add: ['floor:notice_board'] },
  squatted: { label: 'squatted', line: 'Nobody owns it. Everybody pays someone, and it isn\'t clear who.', pass: 0.3, sec: -1 },
  influencer_owned: { label: 'owned by an influencer', line: 'A ring light is bolted to the ceiling, and every wall is a backdrop.', pass: 1.5, add: ['floor:stream_rig'] },
  // tone
  celebrity_trainer: { label: 'a celebrity trainer', line: 'The trainer\'s face is on every wall, slightly larger each year.', pass: 1.8, add: ['floor:hall_of_fame', 'floor:stream_rig'] },
  hygienic: { label: 'obsessively hygienic', line: 'There are more cleaners than customers, and they are all armed with bleach.', pass: 1.2, add: ['floor:cleaning_cart'] },
  filthy_loved: { label: 'filthy and loved', line: 'It is filthy and everyone adores it; the stains are named.', pass: 0.8 },
  silent: { label: 'a silent gym', line: 'Nobody speaks. A sign says why, and the sign is in sign language.', pass: 1.1 },
  loud: { label: 'always loud', line: 'The music is a wall; the shouting is the music.', add: ['floor:sound_system'] },
  sponsored: { label: 'sponsored by a beverage', line: 'Every surface is branded with a fizzy drink that she has never heard of.', pass: 0.7, add: ['floor:vending'] },
  themed: { label: 'a themed gym', line: 'Everything in it is on a single joke, and the joke is in the lockers too.', pass: 1.1 },
  // access
  members_only: { label: 'members only', line: 'A velvet rope and a tablet decide who she is.', pass: 1.6, add: ['floor:member_terminal'] },
  pay_what_you_can: { label: 'pay what you can', line: 'A tin by the door says PAY WHAT YOU CAN, and underneath, in smaller print, WE COUNT.', pass: 0.2, add: ['floor:donation_tin'] },
  no_phones: { label: 'no phones', line: 'Phones go in lockers at the door, which is good, because the lockers go in a vault.', pass: 1.2, add: ['locker:lockers'] },
  open_all_night: { label: 'open all night', line: 'The lights never go off; neither do the people.', pass: 1.2 },
  invite_only: { label: 'invite only', line: 'No walk-ins. A member brings a guest, and the guest brings a story.', pass: 1.5, sec: 1, add: ['floor:member_terminal'] },
  guest_system: { label: 'a guest-of-a-member system', line: 'Every visitor is somebody\'s guest, and every somebody is on a list.', pass: 1.3 },
  // scene
  famous_origin: { label: 'where a famous fighter began', line: 'A famous fighter started here; there is a wall about it, and a bigger wall about the fighter\'s other gym.', pass: 1.4, add: ['floor:hall_of_fame', 'floor:trophy_case'] },
  being_sold: { label: 'about to be sold', line: 'A SOLD sign leans against the wall, and the owner keeps turning it face down.', pass: 0.7 },
  feud: { label: 'in a feud with the gym across the street', line: 'A rival gym\'s poster has been defaced in this one\'s colours, and then vice versa.', add: ['floor:notice_board'] },
  inspected: { label: 'an Atlas inspection regular', line: 'An Atlas inspector turns up unannounced on a schedule published in advance.', sec: 1, add: ['floor:cctv_console'] },
  gang_camp: { label: 'a gang\'s training camp', line: 'A crew in matching jackets owns the back row of bags.', sec: 1 },
  cult: { label: 'a cult', line: 'Every member has the same haircut and the same smile; the waiting list has a waiting list.', pass: 1.5 },
  // kit
  streaming: { label: 'live-streamed', line: 'A camera on a swivel records everyone, for an audience of eleven.', add: ['floor:stream_rig'] },
  hydraulics: { label: 'all hydraulics', line: 'Every weight is on a hydraulic arm; every arm has a name.', add: ['floor:rigs'], only: ['chrome', 'atlasfit', 'boxing', 'cage'] },
  has_sauna: { label: 'a sauna', line: 'There is a sauna, and it is much better than the gym.', add: ['sauna:steam_bench'] },
  has_pool: { label: 'a pool', line: 'A pool, in the middle of the floor, that nobody trusts.', add: ['floor:trampoline'] },
  rooftop_coop: { label: 'a rooftop pigeon coop', line: 'There are pigeons on the roof, and they are in charge.', add: ['roof:pigeon_coop'] },
  robot_spotter: { label: 'a robot spotter', line: 'A robot spotter hovers by the bench, saying "You have got this" in a voice that does not mean it.', add: ['floor:robot_spotter'] },
  real_ring: { label: 'a real ring', line: 'A proper ring, sprung, taut and unreasonably proud of itself.', add: ['floor:ring'] },
  boxing_robot: { label: 'a boxing robot', line: 'A sparring robot stands in the corner with its hands up, patient and a little menacing.', add: ['floor:robot_spotter'] },
  dubious_protein: { label: 'a vending machine of dubious protein', line: 'The vending machine sells protein of uncertain provenance and certain flavour.', add: ['floor:vending', 'floor:supplement_counter'] },
  // quirks
  robot_trainer: { label: 'a robot trainer', line: 'The trainer is a robot, and the robot has a following.', pass: 0.8 },
  pet_owner: { label: 'an owner with a pet', line: 'The owner has an extremely large pet, sleeping in an extremely small basket.', add: ['floor:gym_cat'] },
  dead_language: { label: 'labelled in a dead language', line: 'All the signs are in a language nobody speaks, and the weights are in a unit nobody uses.', pass: 1.1 },
  cursed_currency: { label: 'tokens only', line: 'Prices are in gym tokens, minted nowhere, spent everywhere.', pass: 0.9 },
  tab_system: { label: 'a tab system', line: 'Everyone has a tab; the tab has everyone.', pass: 1.0, add: ['office:ledger'] },
  rooftop_view: { label: 'a view', line: 'There is, on a clear day, a view of the whole district.', add: ['floor:skylight'] },
  night_class: { label: 'night classes', line: 'The timetable is all nights; the mornings are for cleaning.', add: ['floor:notice_board'] },
};

// ===================================================================== situations

export interface SituationDef {
  label: string;
  line: string;
  weight: number;
  /** Tags affordances can require (`where.situation`). */
  tags: string[];
  /** Variants it can't happen at (absent = anywhere). */
  not?: string[];
  pass?: number;
  fame?: number;
  purse?: number;
}

export const SITUATIONS: Record<string, SituationDef> = {
  tournament: { label: 'a tournament this week', line: 'Banners are up for a tournament; the purse is on the wall.', weight: 3, tags: ['tournament'], purse: 2, fame: 1.5 },
  open_day: { label: 'an open day', line: 'It is an open day: free passes, free tea, and a recruiter at the door.', weight: 2, tags: ['open_day'], pass: 0 },
  collector: { label: 'a gang collecting', line: 'Two people in matching jackets are standing very close to the owner.', weight: 2, tags: ['collector'] },
  inspector: { label: 'an Atlas inspector visiting', line: 'An inspector with a tablet is going from machine to machine, nodding.', weight: 2, tags: ['inspector'] },
  trainer_missing: { label: 'the trainer is missing', line: 'The trainer has not turned up for three days, and the coach\'s whistle is still on its hook.', weight: 1.5, tags: ['missing_trainer'], pass: 0.6 },
  filming: { label: 'a celebrity is filming here', line: 'Lights, a crew and a very tanned person doing push-ups at the camera.', weight: 1.5, tags: ['filming'], fame: 2 },
  break_in: { label: 'a break-in last night', line: 'The lockers were jemmied last night, and the owner is writing a list.', weight: 1.5, tags: ['break_in'] },
  aftermath: { label: 'a brawl just ended', line: 'The place is a wreck. Someone is already sweeping glass.', weight: 1.5, tags: ['aftermath'], pass: 0.5 },
  challenge: { label: 'a rival gym\'s challenge is posted', line: 'A challenge from the gym across town is pinned up, and the owner has circled it in red.', weight: 1.5, tags: ['challenge'], purse: 1.5 },
  recruitment: { label: 'a recruitment drive', line: 'The staff are watching who can fight, quietly, with clipboards.', weight: 1.5, tags: ['scouts'], fame: 1.5 },
  power_cut: { label: 'a power cut', line: 'The power is out: the rigs are dead, the lights are emergency, and the sparring goes on in the dark.', weight: 1.5, tags: ['power_cut', 'dark'], pass: 0.5 },
  heist: { label: 'a heist being planned', line: 'A group in the sauna is whispering over a drawing of the building across the street.', weight: 1, tags: ['heist'] },
  wedding: { label: 'a wedding reception in the hall', line: 'Someone has rented the floor for a wedding; the ring is the dance floor.', weight: 0.5, tags: ['party'], pass: 0.5 },
  lost_dog: { label: 'a lost dog', line: 'A small dog is under the bench press, and a poster promises a reward.', weight: 1, tags: ['lost_dog'] },
  funeral: { label: 'a funeral for a regular', line: 'The gym is quiet, with a photo on the front desk and every glove laid out in a row.', weight: 0.5, tags: ['funeral'], pass: 0.3 },
  boiler_out: { label: 'the boiler is out', line: 'The boiler is out: everything is cold and everybody is stamping.', weight: 1, tags: ['cold'] },
  scouts: { label: 'a scout in the corner', line: 'A scout from a better gym is in the corner, pretending to stretch.', weight: 1.5, tags: ['scouts'], fame: 1.5 },
  free_for_all: { label: 'an open challenge night', line: 'A chalkboard says OPEN CHALLENGE TONIGHT: anyone may fight anyone.', weight: 1.5, tags: ['tournament', 'free_for_all'], purse: 1.5 },
  health_week: { label: 'Safe-T wellness week', line: 'Atlas wellness week: free pamphlets, free cheerfulness, and a clipboard at every machine.', weight: 1, tags: ['inspector', 'wellness_week'], not: ['youth'] },
  rumours: { label: 'a lot of whispering', line: 'Everyone is whispering, and none of them will say what about.', weight: 2, tags: ['gossip'] },
};

/** A pure function of the clock: the same gym is in the same situation until the epoch turns over. No saved state. */
export function situationAt(w: Pick<World, 'worldSeed' | 'clock'>, loc: Location): { id: string; def: SituationDef } | undefined {
  const g = loc.gym;
  if (!g) return undefined;
  const epoch = Math.floor(w.clock / (MIN_PER_DAY * 2));
  const rng = new Rng(`gymsit:${w.worldSeed}:${loc.id}:${epoch}`);
  if (!rng.chance(0.6)) return undefined;
  const ids = Object.keys(SITUATIONS).filter((id) => !SITUATIONS[id]!.not?.includes(g.variant));
  const id = rng.weighted(ids, (k) => SITUATIONS[k]!.weight);
  return { id, def: SITUATIONS[id]! };
}

// ===================================================================== wild cards

export const WILD: Record<string, { label: string; line: string; weight: number }> = {
  legendary_coach: { label: 'a legendary coach', line: 'Rumour has it that one coach here can teach in a night what takes others a year. The fee is a lot.', weight: 2 },
  cursed_rig: { label: 'a cursed rig', line: 'One rig in the corner is roped off. People say it is the best in the district. People also say other things.', weight: 2 },
  atlas_promo: { label: 'an Atlas promotion', line: 'A banner: THE FIRST FIFTY MEMBERS GET LIFETIME REASSURANCE. There are fifty-one people in the queue.', weight: 1.5 },
  rigged_tournament: { label: 'a rigged tournament', line: 'Every bout on the board is fixed. Everyone knows. Nobody has told the new fighters.', weight: 1.5 },
  battle_royale: { label: 'a pit that never closes', line: 'The pit has a purse that grows every night nobody wins it.', weight: 1.5 },
  ghost: { label: 'a ghost', line: 'The mats creak when no one is on them. The students call it Sensei, to be safe.', weight: 1 },
  trap_gym: { label: 'every feature is a trap', line: 'Every rig is wired; every locker is rigged. It is a gym built by a paranoid.', weight: 1 },
  secret_society: { label: 'a secret society', line: 'The best sparrer here gets a card. The card has no name on it, and a number.', weight: 1.5 },
};

// ===================================================================== rooms and features

export interface RoomDef {
  /** What the room is called ("locker room"). */
  name: string;
  /** The exit label. */
  label: string;
  base: number;
  gate: Exit['gate'];
  hidden: number;
  /** Added to the gym's security (absolute if `abs`). */
  sec: number;
  abs?: boolean;
  cameras: number;
  blurbs: string[];
  /** Features it has, each with a chance. */
  sig: [string, number][];
}

export const ROOMS: Record<string, RoomDef> = {
  locker: { name: 'locker room', label: 'the locker room', base: 0.85, gate: null, hidden: 0, sec: 0, cameras: 0, blurbs: ['{name}: benches, a damp smell and eighty lockers with a wall of chat on the other side.', '{name}: one working shower, one that thinks it is, and a bench where everyone knows everything.'], sig: [['lockers', 1], ['lost_found', 0.5], ['water_cooler', 0.2]] },
  office: { name: 'office', label: 'the office', base: 0.45, gate: 'guarded', hidden: 0, sec: 2, cameras: 1, blurbs: ['{name}: a desk, a ledger, a safe with a sticker on it and the smell of an old cigar.', '{name}: a tiny office with a big desk, and a window onto the gym floor that only goes one way.'], sig: [['safe', 0.65], ['ledger', 0.85], ['cctv_console', 0.35], ['member_terminal', 0.3]] },
  pit: { name: 'pit', label: 'a door marked STAFF', base: 0.25, gate: 'guarded', hidden: 0.7, sec: 1, cameras: 0, blurbs: ['{name}: a sunken ring under bare bulbs, a crowd that has paid to forget and a man with a ledger.', '{name}: concrete steps down into a bowl of light, with a ring at the bottom and a smell of old blood and new money.'], sig: [['pit_ring', 1], ['bet_book', 0.6], ['scoreboard', 0.3]] },
  sauna: { name: 'sauna', label: 'the sauna', base: 0.35, gate: null, hidden: 0, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: steam, pine and a bench where nobody is wearing anything that can hold a secret.', '{name}: hot and quiet, with a thermostat set to "forgiveness".'], sig: [['steam_bench', 1], ['water_cooler', 0.2]] },
  juice: { name: 'juice bar', label: 'the juice bar', base: 0.2, gate: null, hidden: 0, sec: 0, cameras: 1, blurbs: ['{name}: a counter, a blender with a cult following and a menu of drinks named after muscles.', '{name}: blenders, a tap of something green and a menu that has opinions.'], sig: [['juice_tap', 1], ['supplement_counter', 0.6], ['vending', 0.2]] },
  shop: { name: 'pro shop', label: 'the pro shop', base: 0.25, gate: null, hidden: 0, sec: 0, cameras: 1, blurbs: ['{name}: wraps, gloves, mouthguards and a rack of T-shirts that say things like "NO REGRETS (CONDITIONS APPLY)".', '{name}: a little shop of gear, with a till and a man behind it who is exactly as flexible on prices as his stock.'], sig: [['pro_shop_rack', 1], ['tool_bench', 0.3]] },
  physio: { name: 'physio room', label: 'the physio room', base: 0.25, gate: null, hidden: 0, sec: 0, cameras: 0, blurbs: ['{name}: a treatment table, a poster of a skeleton and a physio who can find the bruise she has not met yet.', '{name}: ice, tape and a chart of body parts, all of which are going to hurt.'], sig: [['physio_table', 1], ['supplement_counter', 0.2]] },
  studio: { name: 'stream studio', label: 'the stream studio', base: 0.15, gate: null, hidden: 0, sec: 0, cameras: 3, blurbs: ['{name}: a green screen, a ring light and a chair for being sweaty at the lens.', '{name}: cameras, cables and a backdrop of a gym, in a gym.'], sig: [['stream_rig', 1], ['sound_system', 0.4]] },
  hall: { name: 'class hall', label: 'the class hall', base: 0.25, gate: null, hidden: 0, sec: 0, cameras: 1, blurbs: ['{name}: a big empty room with a mirror, stacked chairs and a timetable of classes for every kind of person.', '{name}: a hall for classes, with mats stacked in the corner and a sound system on a trolley.'], sig: [['mirror_wall', 0.7], ['sound_system', 0.7], ['mats', 0.4]] },
  roof: { name: 'roof', label: 'a ladder to the roof', base: 0.1, gate: null, hidden: 0.2, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: tar, tarps, a water tank and the whole district laid out below.', '{name}: a rooftop with a view and a bucket of balls someone has hit at passing drones.'], sig: [['pigeon_coop', 0.4], ['skylight', 0.5], ['trampoline', 0.15]] },
  basement: { name: 'basement', label: 'a stairwell down', base: 0.12, gate: null, hidden: 0.3, sec: 0, cameras: 0, blurbs: ['{name}: a low room of pipes and old kit, with the hum of something that should have been switched off.', '{name}: damp, close, lit by one strip. A heavy bag swings by itself.'], sig: [['junk_pile', 0.5], ['bin_fire', 0.1], ['vent_grille', 0.3]] },
  storeroom: { name: 'storeroom', label: 'the storeroom', base: 0.25, gate: 'locked', hidden: 0, sec: 1, cameras: 0, blurbs: ['{name}: racks of spare kit, mismatched plates and a tool bench with a vice on it.', '{name}: crates, spare benches and an uncomfortable number of old trophies.'], sig: [['tool_bench', 0.7], ['junk_pile', 0.7], ['trophy_case', 0.15]] },
  vents: { name: 'crawlspace', label: 'a vent grille', base: 0.08, gate: 'jump', hidden: 0.9, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: a metal tube with a draught, a lot of dust and a view of the floor through a grille.', '{name}: a crawlspace along the ceiling, with a line of sight to every locker.'], sig: [['vent_grille', 1]] },
  alley: { name: 'back alley', label: 'the back door', base: 0.2, gate: null, hidden: 0, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: bins, a fire exit propped open with a brick and a person smoking a cigarette that looks like a protein bar.', '{name}: a narrow alley behind the gym, where people go to say the things they could not say inside.'], sig: [['bin_fire', 0.35], ['side_door', 0.8]] },
};

export interface FeatureDef {
  label: string;
  /** What the room it sits in is when it's a floor feature: weight in the pool. */
  base: number;
  /** Skills a session at this trains. */
  trains?: string[];
}

export const FEATURES: Record<string, FeatureDef> = {
  heavy_bags: { label: 'heavy bags', base: 3, trains: ['melee'] },
  ring: { label: 'a ring', base: 1.5, trains: ['melee'] },
  cage_ring: { label: 'a cage', base: 0, trains: ['melee', 'intimidation'] },
  mats: { label: 'mats', base: 2, trains: ['melee', 'sneak'] },
  yoga_mats: { label: 'yoga mats', base: 0, trains: ['medicine', 'tolerance'] },
  rigs: { label: 'lifting rigs', base: 2, trains: ['athletics'] },
  treadmill_wall: { label: 'a wall of treadmills', base: 1, trains: ['athletics'] },
  climbing_wall: { label: 'a climbing wall', base: 0.8, trains: ['athletics', 'sneak'] },
  shooting_lane: { label: 'a shooting lane', base: 0.4, trains: ['marksmanship', 'throwing'] },
  pullup_rack: { label: 'a pull-up rack', base: 2, trains: ['athletics'] },
  dart_board: { label: 'a dartboard', base: 1, trains: ['throwing'] },
  pool_table: { label: 'a pool table', base: 0.4 },
  mirror_wall: { label: 'a mirror wall', base: 2, trains: ['dancing'] },
  hall_of_fame: { label: 'a hall-of-fame wall', base: 1 },
  notice_board: { label: 'a notice board', base: 3 },
  member_terminal: { label: 'a membership terminal', base: 2 },
  cctv_console: { label: 'a CCTV console', base: 1.2 },
  scoreboard: { label: 'a scoreboard', base: 1 },
  bet_book: { label: 'a betting book', base: 0.8 },
  water_cooler: { label: 'a water cooler', base: 2 },
  vending: { label: 'a vending machine', base: 2 },
  robot_spotter: { label: 'a robot spotter', base: 0.8 },
  gym_cat: { label: 'a gym cat', base: 0.7 },
  trophy_case: { label: 'a trophy case', base: 1 },
  donation_tin: { label: 'a donation tin', base: 1 },
  fire_cabinet: { label: 'a fire cabinet', base: 1 },
  cleaning_cart: { label: 'a cleaning cart', base: 1 },
  skylight: { label: 'a skylight', base: 1 },
  side_door: { label: 'a side door', base: 1.5 },
  trampoline: { label: 'a trampoline', base: 0.6, trains: ['athletics'] },
  sound_system: { label: 'a sound system', base: 1.5, trains: ['dancing'] },
  stream_rig: { label: 'a stream rig', base: 0.8 },
  vent_grille: { label: 'a vent grille', base: 0 },
  lockers: { label: 'lockers', base: 0 },
  lost_found: { label: 'a lost-and-found', base: 0 },
  safe: { label: 'the owner\'s safe', base: 0 },
  ledger: { label: 'the ledger', base: 0 },
  steam_bench: { label: 'a steam bench', base: 0 },
  pit_ring: { label: 'the pit ring', base: 0, trains: ['melee'] },
  juice_tap: { label: 'a juice tap', base: 0 },
  supplement_counter: { label: 'a supplement counter', base: 0.4 },
  pro_shop_rack: { label: 'a pro-shop rack', base: 0 },
  physio_table: { label: 'a physio table', base: 0 },
  tool_bench: { label: 'a tool bench', base: 0.3 },
  junk_pile: { label: 'a junk pile', base: 0 },
  pigeon_coop: { label: 'a pigeon coop', base: 0 },
  bin_fire: { label: 'a burning bin', base: 0 },
};

// ===================================================================== rolling a gym

export interface RolledGym {
  info: GymInfo;
  name: string;
  blurb: string;
  security: number;
  crowded: boolean;
}

/** Day pass in nd for a gym right now. */
export function passPrice(info: GymInfo, sit?: SituationDef): number {
  const v = VARIANTS[info.variant];
  if (!v) return 0;
  let p = v.pass * (0.7 + 0.15 * info.tier) * (sit?.pass ?? 1);
  for (const t of info.traits) p *= TRAITS[t]?.pass ?? 1;
  return Math.max(0, Math.round(p));
}

/** Roll one gym. Pure: all of it from `rng`, in a fixed order, so the same street always grows the same gym. */
export function rollGym(rng: Rng, district: District, depth: number): RolledGym {
  const weights = GYM_VARIANT[district];
  const ids = Object.keys(VARIANTS);
  const variant = rng.weighted(ids, (k) => weights[k] ?? 1);
  const v = VARIANTS[variant]!;
  const shell = rng.weighted(Object.keys(SHELLS), (k) => SHELLS[k]!.weight ?? 1);
  const sh = SHELLS[shell]!;
  const size = rng.weighted([0, 1, 2, 3, 4], (i) => [0.8, 2.5, 3, 2, 0.8][i]!);
  const condition = rng.weighted([0, 1, 2, 3, 4], (i) => [1, 2.5, 3, 1.2, 0.5][i]! * (district === 'corporate' ? (i >= 3 ? 3 : 0.4) : district === 'slum' ? (i <= 1 ? 3 : 0.4) : 1));
  const tier = Math.max(1, Math.min(5, rng.int(1, 5) + (depth >= 6 ? 1 : 0) - (depth <= 1 ? 1 : 0)));
  const traitIds = Object.keys(TRAITS).filter((t) => !TRAITS[t]!.only || TRAITS[t]!.only!.includes(variant));
  const nTraits = rng.weighted([0, 1, 2, 3], (i) => [3, 4, 2.5, 1][i]!);
  const traits: string[] = [];
  for (let i = 0; i < nTraits; i++) {
    const t = rng.weighted(traitIds, (k) => (traits.includes(k) ? 0 : TRAITS[k]!.weight ?? 1));
    if (!traits.includes(t)) traits.push(t);
  }
  const wild = rng.chance(1 / 12) ? rng.weighted(Object.keys(WILD), (k) => WILD[k]!.weight) : undefined;

  // Rooms, in a fixed order, up to what the size allows.
  const rooms: string[] = [];
  for (const r of Object.keys(ROOMS)) {
    const chance = Math.min(0.95, (v.rooms[r] ?? ROOMS[r]!.base * 0.5) * (sh.rooms?.[r] ?? 1) * (0.6 + 0.2 * size));
    if (rooms.length < SIZES[size]!.rooms && rng.chance(chance)) rooms.push(r);
  }
  // Features: the variant's own, the shell's, the traits', then a handful drawn from the pool, then each room's own.
  const features: string[] = [];
  const add = (f: string): void => {
    if (!features.includes(f)) features.push(f);
  };
  for (const f of v.floor) add(`floor:${f}`);
  for (const f of sh.add ?? []) if (f.startsWith('floor:') || rooms.includes(f.split(':')[0]!)) add(f);
  for (const t of traits) for (const f of TRAITS[t]!.add ?? []) if (f.startsWith('floor:') || rooms.includes(f.split(':')[0]!)) add(f);
  const pool = Object.keys(FEATURES).filter((f) => FEATURES[f]!.base > 0 || (v.lean[f] ?? 0) > 0);
  const [lo, hi] = SIZES[size]!.features;
  const want = rng.int(lo, hi);
  for (let i = 0; i < want * 2 && features.filter((f) => f.startsWith('floor:')).length < want; i++) {
    add(`floor:${rng.weighted(pool, (k) => FEATURES[k]!.base + (v.lean[k] ?? 0))}`);
  }
  for (const r of rooms) for (const [f, chance] of ROOMS[r]!.sig) if (rng.chance(chance)) add(`${r}:${f}`);

  const name = rng.pick(v.names);
  const cond = CONDITIONS[condition]!;
  const security = Math.max(0, v.sec + sh.sec + cond.sec + traits.reduce((s, t) => s + (TRAITS[t]!.sec ?? 0), 0) + rng.int(0, 1));
  const crowded = rng.chance(Math.min(0.9, v.crowd * SIZES[size]!.crowd));
  // The blurb: what it is, then one more thing about it (the building, a trait, the Atlas wallpaper or its state).
  const extras = [sh.line, ...traits.map((t) => TRAITS[t]!.line), rng.pick(v.wall), cond.line, wild ? WILD[wild]!.line : ''].filter(Boolean);
  const blurb = [rng.pick(v.blurbs), rng.pick(extras)].join(' ');
  return { info: { variant, shell, size, condition, tier, traits, features, rooms, ...(wild ? { wild } : {}) }, name, blurb, security, crowded };
}

/** Name for a room of a gym: "Glass Jaw Gym's locker room", or whatever the variant calls it. */
export function roomTitle(info: GymInfo, gymName: string, room: string): string {
  const v = VARIANTS[info.variant];
  const label = v?.roomNames?.[room] ?? ROOMS[room]?.name ?? room;
  return label.startsWith('the ') ? `${possessive(gymName)} ${label.slice(4)}` : `${possessive(gymName)} ${label}`;
}

/** Features in one room of a gym ("floor" for the main floor). */
export function featuresIn(info: GymInfo, room: string): string[] {
  const prefix = `${room}:`;
  return info.features.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)).filter((f) => FEATURES[f]);
}

// ===================================================================== who is there

const SIZE_CROWD = [1, 2, 4, 6, 9] as const;

/** The people a place wants. Rosters by kind are in roster.ts; a gym's depend on what it is and which room this is. */
export function gymRoster(loc: Location, g: GymInfo): SlotDef[] {
  const room = loc.gymRoom?.room;
  const v = VARIANTS[g.variant]!;
  const crowd = SIZE_CROWD[g.size] ?? 4;
  const slots: SlotDef[] = [];
  if (!room) {
    slots.push({ role: 'gym_owner', count: [1, 1], faction: 'venue', resident: true });
    slots.push({ role: v.trainer, count: [1, 1], faction: 'venue', resident: true });
    slots.push({ role: 'gym_desk', count: [1, 1], chance: 0.75, faction: 'venue', resident: true });
    slots.push({ role: 'gym_sparrer', count: [1, 1 + Math.floor(g.size / 2)], chance: 0.85, faction: 'venue', resident: true });
    slots.push({ role: 'gym_regular', count: [Math.max(0, crowd - 2), crowd + 2], ephemeral: true });
    slots.push({ role: 'gym_cleaner', count: [1, 1], chance: 0.35, faction: 'venue', resident: true });
    slots.push({ role: 'ganger', count: [1, 2], chance: g.traits.includes('gang_front') || g.traits.includes('gang_camp') ? 0.9 : 0.25, faction: 'influence' });
    if (g.variant === 'atlasfit' || g.traits.includes('atlas_owned') || g.traits.includes('inspected')) slots.push({ role: 'atlas_rep', count: [1, 1], chance: 0.6, resident: true });
    if (g.variant === 'youth') slots.push({ role: 'street_kid', count: [2, 5], ephemeral: true });
    if (g.traits.includes('celebrity_trainer') || g.traits.includes('influencer_owned')) slots.push({ role: 'gym_influencer', count: [1, 1], faction: 'venue', resident: true });
    if (g.traits.includes('robot_trainer') || g.traits.includes('boxing_robot')) slots.push({ role: 'sparring_bot', count: [1, 1], faction: 'venue', resident: true });
    slots.push({ role: 'cop', count: [1, 1], chance: 0.05 });
    return slots;
  }
  switch (room) {
    case 'locker': slots.push({ role: 'gym_regular', count: [0, 3], ephemeral: true }); break;
    case 'office': slots.push({ role: 'pit_boss', count: [1, 1], chance: g.rooms.includes('pit') ? 0.6 : 0.3, faction: 'venue', resident: true }); break;
    case 'pit': {
      slots.push({ role: 'pit_boss', count: [1, 1], faction: 'venue', resident: true });
      slots.push({ role: 'pit_fighter', count: [v.rungs[0], v.rungs[1]], faction: 'venue', resident: true });
      slots.push({ role: 'gym_regular', count: [3, 8], ephemeral: true });
      break;
    }
    case 'sauna': slots.push({ role: 'gym_regular', count: [0, 3], ephemeral: true }); break;
    case 'juice': slots.push({ role: 'gym_barista', count: [1, 1], faction: 'venue', resident: true }); break;
    case 'shop': slots.push({ role: 'gym_desk', count: [1, 1], faction: 'venue', resident: true }); break;
    case 'physio': slots.push({ role: 'gym_physio', count: [1, 1], faction: 'venue', resident: true }); break;
    case 'studio': slots.push({ role: 'gym_influencer', count: [1, 1], faction: 'venue', resident: true }); break;
    case 'hall': slots.push({ role: 'instructor', count: [1, 1], chance: 0.6, faction: 'venue', resident: true }, { role: 'gym_regular', count: [1, 5], ephemeral: true }); break;
    case 'roof': case 'basement': case 'alley': slots.push({ role: 'street_kid', count: [0, 1], chance: 0.25, ephemeral: true }); break;
    default: break;
  }
  return slots;
}
