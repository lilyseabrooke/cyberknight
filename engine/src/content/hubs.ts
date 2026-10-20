import { Rng } from '../rng';
import { MIN_PER_DAY } from '../clock';
import type { District, HubInfo, Location, SyllabusEntry, World } from '../types';
import type { SlotDef } from '../roster';
import { CONDITIONS, possessive } from './gyms';

/**
 * Hacker hubs. A hub is where Hacks and Overrides are sold, and like every other place it is not one of a few kinds: it is a
 * point rolled from independent axes, so any combination can turn up (a derelict tier-5 seminar mill in a flooded data-centre
 * annex that is leased by a surveillance corp and has a parrot that knows a password).
 *
 *   variant     what it mostly is (data café, exchange, seminar mill, crew den, arcade, Titanware Academy...)
 *   shell       what building it is in
 *   size        how many things it has and how long the syllabus can be
 *   condition   derelict .. immaculate (shared with gyms)
 *   tier        1..5: teacher quality and prices. Independent of everything else
 *   traits      0-3 oddities from a long list; they may contradict each other and that is fine
 *   features    objects on the floor; what she can do here hangs off these (content/hubafford.ts and friends)
 *   syllabus    the techniques it teaches, and how (a route and a price each): the thing she comes for
 *   situation   something happening right now; a pure function of the clock, so it needs no saved state
 *   wild        one hub in twelve has a rule-breaking oddity
 *
 * Every table is open: add a row and it can turn up. Ids that a saved world mentions but the tables no longer know are
 * ignored, never an error. Nothing here is balanced against anything else, on purpose.
 */

const pick = <T>(rng: Rng, xs: readonly T[]): T => rng.pick(xs as T[]);

// ===================================================================== placement

/** Chance a street has a hub. Rolled on a stream of its own (see mapgen), so no existing map changes. */
export const HUB_CHANCE: Record<District, number> = { market: 0.05, nightlife: 0.08, tenement: 0.04, industrial: 0.06, corporate: 0.07, slum: 0.03 };

/** Which kind of hub, by district. Absent means 1. */
export const HUB_VARIANT: Record<District, Record<string, number>> = {
  market: { cafe: 3, exchange: 1, mill: 2.5, den: 1, arcade: 1.5, academy: 1, lockers: 1, garage: 1 },
  nightlife: { cafe: 3, exchange: 1, mill: 0.8, den: 2.5, arcade: 3, academy: 0.4, lockers: 1.5, garage: 0.5 },
  tenement: { cafe: 1.5, exchange: 1.5, mill: 1, den: 3, arcade: 2, academy: 0.5, lockers: 2.5, garage: 1.5 },
  industrial: { cafe: 0.5, exchange: 3, mill: 0.6, den: 1.5, arcade: 0.8, academy: 0.5, lockers: 1.5, garage: 4 },
  corporate: { cafe: 1.5, exchange: 0.3, mill: 4, den: 0.3, arcade: 0.5, academy: 6, lockers: 0.5, garage: 0.3 },
  slum: { cafe: 0.6, exchange: 4, mill: 0.5, den: 3, arcade: 1, academy: 0.2, lockers: 3, garage: 2 },
};

// ===================================================================== the techniques

export interface TechDef {
  label: string;
  /** Hacks go after quick, mobile systems (robots, guns, the chrome in people); Overrides go after big fixed ones. */
  kind: 'hack' | 'override';
  /** What it does, in a few words. */
  line: string;
  /** The going rate in nd for a tier-3 shop. */
  price: number;
  /** What a lesson in it looks like (the board's one-line blurb). */
  taught: string;
}

/** Everything that can be on a syllabus. A new Hack or Override (techniques.ts `LEARNABLE`) needs one row here to turn up. */
export const TECHS: Record<string, TechDef> = {
  gun_jam: { label: 'Gun Jam', kind: 'hack', line: 'a smart gun forgets how to fire', price: 120, taught: 'smart-gun handshakes' },
  limb_lock: { label: 'Limb Lock', kind: 'hack', line: 'an augmented limb locks at the joint', price: 140, taught: 'servo interrupts' },
  pain_spike: { label: 'Pain Spike', kind: 'hack', line: 'feedback through a pain-dampener, turned up', price: 160, taught: 'nerve-bus feedback' },
  rewrite: { label: 'Rewrite', kind: 'hack', line: 'a robot gets new orders', price: 260, taught: 'robot routine surgery' },
  hot_wire: { label: 'Hot-Wire', kind: 'hack', line: 'a getaway car starts from across the room', price: 90, taught: 'remote ignition' },
  overclock: { label: 'Overclock', kind: 'hack', line: 'an ally bot is pushed past its sticker', price: 150, taught: 'clock-speed abuse' },
  door_lock: { label: 'Door Lock', kind: 'override', line: 'every door in the building seals', price: 110, taught: 'building-bus control' },
  lights_out: { label: 'Lights Out', kind: 'override', line: 'the lights go, and everyone with them', price: 130, taught: 'lighting-grid takeover' },
  power_cut: { label: 'Power Cut', kind: 'override', line: 'the whole grid drops, cameras too', price: 240, taught: 'substation etiquette' },
  turret_takeover: { label: 'Turret Takeover', kind: 'hack', line: 'a sentry turret changes sides', price: 300, taught: 'sentry firmware' },
  alarm_spoof: { label: 'Alarm Spoof', kind: 'override', line: 'patrols are sent to the wrong address', price: 100, taught: 'dispatch spoofing' },
  hush: { label: 'Hush', kind: 'hack', line: 'a foe cannot call for backup', price: 130, taught: 'channel jamming' },
};

// ===================================================================== routes

export interface RouteDef {
  label: string;
  /** What a line on the board says (`{price}` is the cost). */
  board: string;
  /** Is the price a cost in nd she pays (the rest are free or paid in other things)? */
  cash: boolean;
}

export const ROUTES: Record<string, RouteDef> = {
  cash: { label: 'for cash', board: '{price}nd, cash', cash: true },
  lessons: { label: 'by lessons', board: '{steps} evenings of chores', cash: false },
  barter: { label: 'for parts', board: '{parts} components, any kind', cash: false },
  trial: { label: 'by trial', board: 'a live test, {fee}nd to sit', cash: true },
  steal: { label: 'if you can lift it', board: 'not for sale, the rig is right there', cash: false },
  referral: { label: 'by referral', board: 'on a good word from the teacher', cash: false },
  enrol: { label: 'by enrolment', board: 'free, modules apply', cash: false },
};

// ===================================================================== variants

export interface VariantDef {
  label: string;
  /** Names, plain or with a `{n}` that becomes a three-digit branch number. */
  names: string[];
  blurbs: string[];
  /** The wallpaper: the Atlas poster, or the Titanware eye. */
  wall: string[];
  /** What an hour at a terminal costs in nd (0 means members only, or barter). */
  pass: number;
  /** Multiplier on the going rate for a technique. */
  price: number;
  /** Weights of the ways it teaches, by route. */
  routes: Record<string, number>;
  /** Weights of what it teaches, by technique (absent means 1). */
  lean: Record<string, number>;
  /** Features it always has. */
  floor: string[];
  /** Weights on the features it draws at random (absent means the feature's own). */
  more: Record<string, number>;
  /** Security before condition, shell and traits. */
  sec: number;
  /** Chance it is crowded, before size. */
  crowd: number;
}

export const VARIANTS: Record<string, VariantDef> = {
  cafe: {
    label: 'a data café',
    names: ['Dial-Up & Dumplings', 'Cold Brew & Cold Boot', 'The Last Free Seat', 'Latency Lounge', 'Refresh Rate', 'Page Fault Café', 'Hot Spot Espresso', 'The Quiet Tab', 'Open Tab, Open Port', 'Packet & Pastry', 'Cache Me Outside', 'Byte Club Bistro'],
    blurbs: [
      '{name}: a café with eleven seats and one good chair. The chair is not for sale, and everyone knows whose it is.',
      '{name}: a menu of coffees and a second menu of exploits, in smaller type, behind the first.',
      '{name}: a steam-fogged window, a kettle with its own surge protector and a regular at every terminal who does not look up.',
    ],
    wall: ['A poster on the wall says SAFE-T BROWSING STARTS WITH YOU. Someone has added "and ends with a subpoena".', 'A drone sits on the shelf above the till with its light taped over.', 'A Titanware Verified sticker in the window: a small, open eye. The eye is also over the till.'],
    pass: 9, price: 1, routes: { cash: 4, lessons: 3, barter: 1, trial: 1.5, steal: 1, referral: 1.5, enrol: 0 },
    lean: { hot_wire: 1.4, alarm_spoof: 1.3, hush: 1.3, gun_jam: 1.2 },
    floor: ['terminal_row', 'membership_desk', 'tip_jar'], more: { noodle_counter: 3, forum_terminal: 2, vending_machine: 2 },
    sec: 2, crowd: 0.5,
  },
  exchange: {
    label: 'a warez exchange',
    names: ['Null Route Noodles', 'The No-Names Exchange', 'The Swap Meet', 'Barter Bay', 'Handshake & Co.', 'Hash & Trade', 'Parts For Favours', 'The Open Palm Exchange', 'Mirror Site', 'Dead Link Market', 'Torrent Row', 'Seed & Leech'],
    blurbs: [
      '{name}: a hall of folding tables and no names. Everything is for sale, and what it is for sale for is rarely money.',
      '{name}: a crate of cables on every table, a handwritten board of wants, and a rule that nobody says who sent them.',
      '{name}: you bring something, you take something. The rate of exchange is somebody\'s mood.',
    ],
    wall: ['A cracked Atlas wellness poster, with a barcode on it that does not scan.', 'A camera in the corner, turned to the wall and labelled in marker: MY GOOD EYE.', 'A Titanware Verified sticker on the door, unpeeled and half scratched off. Underneath it, the eye is still open.'],
    pass: 0, price: 0.8, routes: { cash: 1.5, lessons: 1, barter: 5, trial: 1.5, steal: 3, referral: 1.2, enrol: 0 },
    lean: { rewrite: 1.3, overclock: 1.4, limb_lock: 1.2, turret_takeover: 1.2 },
    floor: ['junk_bin', 'notice_board', 'tip_jar'], more: { solder_bench: 2, cable_drum: 3, locker_wall: 1.5 },
    sec: 1, crowd: 0.6,
  },
  mill: {
    label: 'a seminar mill',
    names: ["Pemberton's Evening Classes", 'Bright Futures Institute of Applied Hacking', 'Learn-A-Lot Seminars', 'Certified Intrusion Academy', 'Evening Exploits (Terms Apply)', 'Brightside Continuing Education', 'Zero Day Learning Centre', 'Syntax & Sons', 'Applied Skills Centre, Annex 3', 'The Pay-As-You-Go College', 'Credential Corner', 'Mastery By Monday'],
    blurbs: [
      '{name}: a lecture room with a whiteboard, a lanyard rack and a payment plan. Nobody has ever seen the exam.',
      '{name}: a glossy prospectus on every chair, in a font that has been very carefully chosen to look expensive.',
      '{name}: three rows of chairs facing a man who has said "industry standard" eleven times since she came in.',
    ],
    wall: ['An Atlas poster: LIFELONG SAFETY IS LIFELONG LEARNING. A smaller sign under it says NO REFUNDS.', 'A framed certificate from the Institute of Certificates. It is, as far as she can tell, the Institute.', 'A Titanware Verified Provider plaque. It is the most expensive-looking thing in the room.'],
    pass: 14, price: 1.3, routes: { cash: 5, lessons: 1.5, barter: 0.6, trial: 3, steal: 1, referral: 1, enrol: 0 },
    lean: { power_cut: 1.2, alarm_spoof: 1.3, door_lock: 1.3, lights_out: 1.2 },
    floor: ['whiteboard', 'membership_desk', 'terminal_row', 'notice_board'], more: { vending_machine: 2, brochure_rack: 2, camera_console: 1.5 },
    sec: 2, crowd: 0.7,
  },
  den: {
    label: 'a crew den',
    names: ['Root Cellar Collective', 'The Basement Syndicate', 'Crew Nine', 'Kernel Crew Clubhouse', 'The Shell Company', 'Backdoor Society', 'The Daisy Chain', 'Last Resort Crew', 'The Tin Foil Hat Club', 'Mutex Moot', 'Ghost in the Cellar', 'The Forkbomb Social'],
    blurbs: [
      '{name}: a door with no handle on the outside and a knock that changes weekly. Inside, six people who look up in unison.',
      '{name}: a sofa, a rack of salvaged rigs and a whiteboard of names with a line through most of them.',
      '{name}: warm, cluttered, and extremely sure it does not need new members.',
    ],
    wall: ['An Atlas "See Something, Say Something" poster, with the "Say" scratched out.', 'A stack of old Atlas drone parts used as a bookshelf.', 'A Titanware vitals scanner on the door that someone has taped over, twice.'],
    pass: 0, price: 0.7, routes: { cash: 0.6, lessons: 4, barter: 1, trial: 1, steal: 1.5, referral: 5, enrol: 0 },
    lean: { pain_spike: 1.4, hush: 1.3, turret_takeover: 1.3, gun_jam: 1.2 },
    floor: ['forum_terminal', 'rack', 'vending_machine'], more: { whiteboard: 2, cat_bed: 2, patch_panel: 2, hall_of_fame: 1.5 },
    sec: 3, crowd: 0.35,
  },
  arcade: {
    label: 'an arcade backroom',
    names: ['Cold Boot Arcade', 'High Score Hole', 'Continue? Arcade', 'Insert Coin Backroom', 'Pixel Pit', 'Extra Life Lounge', "Button Masher's", 'The Last Quarter', 'Joystick & Jargon', 'Free Play Basement', 'Game Over Games', 'Tilt'],
    blurbs: [
      '{name}: cabinets in the front, a curtain, and behind the curtain the rack that is the actual business.',
      '{name}: a wall of cabinets with their sound turned down and one with a line at it that nobody is playing.',
      '{name}: the high-score board is written in a language that is not initials.',
    ],
    wall: ['An Atlas "Play Safe" decal on every cabinet. Under the decal, one cabinet has a keyhole.', 'A drone with a camera hangs over the change machine, and the change machine is the only thing it records.', 'A Titanware engagement counter on the door: how long you stayed, how fast your pulse went.'],
    pass: 6, price: 1, routes: { cash: 1, lessons: 1.5, barter: 1, trial: 5, steal: 2, referral: 1, enrol: 0 },
    lean: { lights_out: 1.4, gun_jam: 1.2, overclock: 1.3, hush: 1.2 },
    floor: ['arcade_cab', 'pinball', 'tip_jar', 'scoreboard'], more: { vent: 2, stage: 1.5, camera_console: 1.5 },
    sec: 2, crowd: 0.8,
  },
  academy: {
    label: 'a Titanware Training Academy',
    names: ['Titanware Training Academy (Branch {n})', 'Titanware Aptitude Academy (Branch {n})', 'Titanware Wellness & Skills Academy (Branch {n})', 'Titanware Think Centre (Branch {n})', 'The Titanware Institute, Branch {n}', 'Titanware Right-Thinking Academy (Branch {n})', 'Titanware Career Pathways Centre {n}', 'Titanware Potential Hub {n}'],
    blurbs: [
      '{name}: a glass front, a rack of glossy brochures that say THINK THE RIGHT WAY and a vitals scanner at the door that says hello by name.',
      '{name}: warm light, calm voices and a large open eye on every wall. A counsellor offers her a mug. The mug is also a sensor.',
      '{name}: a reception in the colour of a nice dentist. The brochure says free, and the quiz after the lesson says gratitude.',
    ],
    wall: ['The Titanware eye, open, over the reception desk. It does not blink. A sign underneath says "Titanware Sees You".', 'Posters of smiling people with a number in the corner: their resting heart rate, in green.', 'A framed customer testimonial: "I used to worry. Now I just feel monitored." Five stars.'],
    pass: 0, price: 0.9, routes: { cash: 0, lessons: 0, barter: 0, trial: 0, steal: 0.5, referral: 1, enrol: 8 },
    lean: { pain_spike: 1.3, limb_lock: 1.3, rewrite: 1.3, hush: 1.4, power_cut: 1.2 },
    floor: ['brochure_rack', 'vitals_scanner', 'terminal_row', 'whiteboard', 'membership_desk', 'camera_console'], more: { vending_machine: 1.5, hall_of_fame: 1.5, mural_wall: 1 },
    sec: 4, crowd: 0.6,
  },
  lockers: {
    label: 'a dead-drop locker wall',
    names: ['Locker Nine-Nine', 'The Drop Wall', 'Dead Letter Lockers', 'Left Luggage (Left Alone)', 'Wall of Doors', 'Claim Ticket Corner', "Safe Deposit Sally's", 'Bay of Boxes', 'The Quiet Wall', 'Combination Row', "Nobody's Lockers", 'Drop Zone Lockers'],
    blurbs: [
      '{name}: a wall of two hundred numbered lockers and nobody to be seen. A terminal at one end asks for a number and says nothing about who to ask.',
      '{name}: a corridor of doors, all the same colour, and a ledger on a string. Somebody has been here recently, and is not here now.',
      '{name}: a hush, a line of keypads and a smell of old coins. What it sells is in the locker you can open.',
    ],
    wall: ['An Atlas "Unattended Items Will Be Removed" sign, and the items are neatly unremoved.', 'A drone is parked on a shelf, plugged in, switched off, labelled "DECOY".', 'A Titanware Verified eye in each corner of the room, with a note: "Your locker is monitored for your comfort".'],
    pass: 5, price: 0.9, routes: { cash: 1, lessons: 0.5, barter: 3, trial: 1, steal: 5, referral: 1.5, enrol: 0 },
    lean: { alarm_spoof: 1.4, door_lock: 1.3, hot_wire: 1.3 },
    floor: ['locker_wall', 'camera_console'], more: { safe: 3, vent: 2, side_door: 2, cable_drum: 1 },
    sec: 3, crowd: 0.1,
  },
  garage: {
    label: 'a teardown garage',
    names: ['The Third Hand Garage', 'Teardown & Tutorial', 'Spare Cycles', 'Hot Iron Hackspace', 'Rewire Row', 'Breaker Bay', 'Torque & Terminal', 'Overclock Motors', 'Solder & Soul', 'Chip Shop Garage', 'Open-Case Workshop', 'Rack & Ruin'],
    blurbs: [
      '{name}: hardware first, theory later. A bench with a dozen opened machines and one teacher who says "again".',
      '{name}: a garage that fixes the thing you plug into the car, not the car. Every wall has a pegboard and every pegboard has a name.',
      '{name}: oily, loud and patient. The teacher does not explain; she hands you a screwdriver and a bad idea.',
    ],
    wall: ['A scratched Atlas "Defensive Hardware" calendar, three years out of date.', 'A repossessed Atlas sentry head on a shelf, used as a lamp.', 'A Titanware field-service eye over the door, painted over once and not very hard.'],
    pass: 8, price: 1, routes: { cash: 1.5, lessons: 4, barter: 4, trial: 1.5, steal: 1.5, referral: 1, enrol: 0 },
    lean: { overclock: 1.6, rewrite: 1.4, turret_takeover: 1.4, hot_wire: 1.5 },
    floor: ['solder_bench', 'junk_bin', 'rack'], more: { cable_drum: 3, router_cage: 1.5, whiteboard: 1 },
    sec: 2, crowd: 0.35,
  },
};

// ===================================================================== shells, size

export interface ShellDef {
  label: string;
  line: string;
  sec: number;
  weight?: number;
  add?: string[];
}

export const SHELLS: Record<string, ShellDef> = {
  netcafe: { label: 'a converted internet café', line: 'It was an internet café, and has been one on and off since the first one.', sec: 0, weight: 1.6, add: ['terminal_row'] },
  busdepot: { label: 'a bus depot office', line: 'A bus depot office, still with the timetable on the wall and the destination board stuck on SOMEWHERE ELSE.', sec: 0 },
  noodlecloset: { label: 'a server closet behind a noodle bar', line: 'A server closet behind a noodle bar. Everything here smells of broth and warm plastic.', sec: 1, weight: 1.3, add: ['noodle_counter', 'rack'] },
  laundromat: { label: 'a laundromat', line: 'A laundromat. The rack is in the dryers, which is why they are always on.', sec: 0, add: ['vent'] },
  datacentre: { label: 'a flooded data-centre annex', line: 'The annex of a data centre that flooded in a good year. The racks are on blocks and everyone wears boots.', sec: 1, weight: 0.8, add: ['rack', 'patch_panel'] },
  tramcar: { label: 'a tram-car office', line: 'A tram carriage on a siding with the seats ripped out and a row of terminals where they were.', sec: 0, add: ['terminal_row'] },
  organloft: { label: 'a church organ loft', line: 'The organ loft of a church that is now mostly storage. The pipes carry cable.', sec: 1, weight: 0.8, add: ['cable_drum', 'skylight'] },
  junction: { label: 'a cable junction under a flyover', line: 'A cable junction under a flyover, with a door that is not on any plan and a hum you feel in your teeth.', sec: 1, add: ['patch_panel', 'router_cage'] },
  videostore: { label: 'a shuttered video-rental store', line: 'A video-rental store that closed before she was born. The shelves are rigs, and the sign still says BE KIND, REWIND.', sec: 0, weight: 1.2, add: ['crt_wall'] },
  storage: { label: 'a row of self-storage units', line: 'A row of self-storage units with a roller door each. The one at the end has a light on, and a queue.', sec: 1, add: ['locker_wall', 'side_door'] },
  watertank: { label: 'a rooftop water-tank hut', line: 'A hut on a rooftop next to the water tank. It rains in a different place every day.', sec: 0, weight: 0.8, add: ['skylight', 'pigeon_roost'] },
  carpark: { label: 'a car-park deck', line: 'The top deck of a multistory car park, with the bays full of rigs and a security booth full of tea.', sec: 0, add: ['side_door'] },
};

export const SIZES = [
  { label: 'a closet', features: [2, 3], syllabus: [1, 2], crowd: 0.4, people: 2 },
  { label: 'small', features: [3, 5], syllabus: [2, 3], crowd: 0.7, people: 3 },
  { label: 'medium', features: [5, 7], syllabus: [3, 4], crowd: 1, people: 4 },
  { label: 'large', features: [7, 10], syllabus: [4, 5], crowd: 1.3, people: 5 },
  { label: 'a sprawl', features: [10, 14], syllabus: [5, 6], crowd: 1.6, people: 7 },
] as const;

// ===================================================================== features

export interface FeatureDef {
  label: string;
  /** Weight in the random draw. 0 = only when something adds it. */
  base: number;
  /** What a glance at it tells you. */
  line: string;
}

export const FEATURES: Record<string, FeatureDef> = {
  terminal_row: { label: 'a row of terminals', base: 3, line: 'A row of rented terminals, each with a timer and a sticky note.' },
  rack: { label: 'a server rack', base: 1.2, line: 'A server rack with more cable than metal.' },
  patch_panel: { label: 'a patch panel', base: 1, line: 'A patch panel wired by someone with a sense of humour and no labels.' },
  crt_wall: { label: 'a wall of old monitors', base: 1, line: 'A wall of mismatched monitors, each on a different feed.' },
  scoreboard: { label: 'a scoreboard', base: 1, line: 'A scoreboard of handles and numbers that goes up when someone is clever.' },
  ctf_board: { label: 'a challenge board', base: 1, line: 'A board of challenges with a purse next to each. Some have been scratched out.' },
  notice_board: { label: 'a notice board', base: 2, line: 'A notice board: gigs, wants, a lost cat and a paper pinned face-down.' },
  forum_terminal: { label: 'a forum terminal', base: 1.5, line: 'A terminal that shows only the house forum, open all night, mostly insults.' },
  membership_desk: { label: 'a membership desk', base: 1.5, line: 'A desk with a ledger, a card reader and someone who has said "terms apply" today.' },
  tip_jar: { label: 'a tip jar', base: 1.5, line: 'A tip jar with a note that reads FEED THE SYSOP.' },
  vending_machine: { label: 'a vending machine', base: 1.5, line: 'A vending machine of energy drinks in colours that do not occur in nature.' },
  noodle_counter: { label: 'a noodle counter', base: 1, line: 'A counter with a pot, a ladle and a line.' },
  solder_bench: { label: 'a solder bench', base: 1.2, line: 'A bench with an iron, a vice and a rig being taken apart one screw at a time.' },
  junk_bin: { label: 'a junk bin', base: 1.3, line: 'A bin of dead chips, bent cables and one very good capacitor.' },
  cable_drum: { label: 'a drum of cable', base: 0.7, line: 'A drum of cable the size of a small car, unspooled across the floor.' },
  locker_wall: { label: 'a wall of lockers', base: 0.8, line: 'A wall of numbered lockers with keypads, a few of them ajar.' },
  safe: { label: 'a safe', base: 0.9, line: 'A safe with a dent in the door and a combination written on the wall behind it, upside down.' },
  camera_console: { label: 'a camera console', base: 1, line: 'A console of grainy feeds, one of which is of the console.' },
  router_cage: { label: 'a router cage', base: 0.7, line: 'A cage of routers with a padlock, a sign and a cat inside the cage.' },
  house_ai_kiosk: { label: 'a house-AI kiosk', base: 0.5, line: 'A kiosk with a cheerful voice that grades everyone who comes in.' },
  arcade_cab: { label: 'an arcade cabinet', base: 0.6, line: 'An arcade cabinet with a high-score table nobody beats and everybody pays to try.' },
  pinball: { label: 'a pinball table', base: 0.5, line: 'A pinball table that tilts in a pattern. The pattern is a message.' },
  stage: { label: 'a small stage', base: 0.5, line: 'A small stage for challenge nights, with a rug on it that has seen worse.' },
  hall_of_fame: { label: 'a hall of fame', base: 0.6, line: 'A wall of handles and dates. The top spot has been vacant for a long time.' },
  mural_wall: { label: 'a blank wall', base: 0.8, line: 'A wall that is almost blank, and a tin of paint that has been left open.' },
  cat_bed: { label: 'a cat bed', base: 0.5, line: 'A cat bed on the warmest rack. The cat has been here longer than the sysop.' },
  pigeon_roost: { label: 'a pigeon roost', base: 0.4, line: 'A roost of pigeons with little tags on their legs. Do not ask.' },
  skylight: { label: 'a skylight', base: 0.8, line: 'A skylight that does not quite close.' },
  vent: { label: 'a vent', base: 1, line: 'A vent grille at about the height of a determined person.' },
  side_door: { label: 'a side door', base: 1, line: 'A side door with a bar across it and a sign saying ALARMED.' },
  fire_cabinet: { label: 'a fire cabinet', base: 0.4, line: 'A fire cabinet with an axe behind glass and a laptop where the extinguisher should be.' },
  whiteboard: { label: 'a whiteboard', base: 0.8, line: 'A whiteboard covered in a diagram of a network and a smaller diagram of the first one.' },
  brochure_rack: { label: 'a brochure rack', base: 0, line: 'A rack of glossy brochures: THINK THE RIGHT WAY. Under the tagline, a smiling person. Over the person, an eye.' },
  vitals_scanner: { label: 'a vitals scanner', base: 0, line: 'A scanner at the door that reads your pulse, your gait and your mood, and says welcome by name.' },
};

// ===================================================================== traits

export interface TraitDef {
  label: string;
  line: string;
  /** Multiplies the price of everything on the syllabus. */
  price?: number;
  /** Adds to the security of the place. */
  sec?: number;
  weight?: number;
  /** Features it adds. */
  add?: string[];
  /** Only these variants. */
  only?: string[];
}

export const TRAITS: Record<string, TraitDef> = {
  house_ai: { label: 'a house AI that grades everyone', line: 'A voice on the ceiling grades everybody who comes in, out loud, to two decimal places.', sec: 1, add: ['house_ai_kiosk'] },
  no_names: { label: 'a no-names rule', line: 'A sign by the door: NO NAMES. A smaller one: IF YOU SAID YOURS, LEAVE.', price: 1.1, sec: 1 },
  favours: { label: 'pays in favours', line: 'Prices are quoted in favours, with a ledger, and the ledger is thicker than the Bible.', price: 0.8 },
  ghost_router: { label: 'a ghost in the router', line: 'There is a ghost in the router. It has opinions. It is sometimes right.', add: ['router_cage'] },
  newbie_tax: { label: 'a newbie tax', line: 'A card by the till: FIRST TIMERS PAY DOUBLE. Under it, someone has crossed out DOUBLE and written TRIPLE.', price: 1.4 },
  rival_across: { label: 'a rival hub across the road', line: 'The place across the road has a better sign, worse tea and a grudge older than the lease.', price: 0.9 },
  tw_verified: { label: 'Titanware Verified', line: 'A Titanware Verified sticker in the window and a vitals scanner on the door, both blinking in time. It has been logging her heart rate since the corner.', add: ['vitals_scanner'], sec: 1, price: 0.9 },
  tw_leased: { label: 'Titanware leases the rack', line: 'The rack is leased from Titanware. A technician in a polo shirt comes on Fridays to read it, and is very nice about it.', add: ['brochure_rack'], sec: 1, price: 0.85 },
  recruiting: { label: 'a crew is recruiting', line: 'A crew is recruiting. Their table has a bowl of sweets and an application form with a tick-box for "willing to be loyal".', weight: 1.2 },
  membership: { label: 'membership tiers', line: 'A tiered membership: Guest, Associate, Fellow and Fellow Plus. Each has a different coloured lanyard.', price: 1.2, add: ['membership_desk'] },
  blackout_wing: { label: 'a blackout wing', line: 'A blackout wing, no cameras and no windows, where nobody goes without a reason.', sec: -1 },
  rig_cat: { label: 'a rig cat', line: 'A cat sleeps on the warmest rack and has opinions about heat.', add: ['cat_bed'] },
  soundproof: { label: 'soundproofed', line: 'The walls are soundproofed with egg cartons and optimism.', sec: 0 },
  free_tea: { label: 'free tea', line: 'A kettle that is always on. Tea is free. Nothing else is.', weight: 1.4 },
  cash_only: { label: 'cash only', line: 'A sign: CASH ONLY. The card reader on the desk is a decoy.', price: 1 },
  bring_cable: { label: 'bring your own cable', line: 'A sign: BRING YOUR OWN CABLE. A box of cables by the door is labelled TERMS.', price: 0.9 },
  live_stream: { label: 'a live stream', line: 'A camera on a tripod streams the room to four hundred strangers who comment on the typing.', sec: 1, price: 1.1 },
  locked_forum: { label: 'a locked forum', line: 'A forum terminal in the corner has a padlock on it. The padlock is the interesting part.', add: ['forum_terminal'] },
  retired_breaker: { label: 'owned by a retired ICE-breaker', line: 'The owner is a retired ICE-breaker who tells the same story, and the story is getting better.', price: 1.15 },
  hall_of_fame_wall: { label: 'a hall of fame', line: 'A wall of handles with dates, and a corner that is just a bare nail.', add: ['hall_of_fame'] },
  hot_hardware: { label: 'hot hardware', line: 'Half the rigs are very new and none of the serial numbers match.', sec: 1, price: 0.85, add: ['junk_bin'] },
  gang_taxed: { label: 'taxed by a gang', line: 'A gang comes on Thursdays for a cut. The cut is on a laminated card at the desk.', price: 1.25 },
  bounty_board: { label: 'a bug-bounty board', line: 'A board of bugs and the purses for finding them, some of them already crossed out in red.', add: ['ctf_board'] },
  dead_terminal: { label: "a dead man's terminal", line: 'One terminal is switched off, with flowers on it. Nobody uses it. Nobody switches it on.', price: 1 },
  rain_leaks: { label: 'rain on the rack', line: 'Rain gets in over the rack. There is a bucket, a tarp and a rota.', price: 0.9 },
  parrot: { label: 'a parrot that knows a password', line: 'A parrot in a cage by the door says a password every few minutes. It is never the right one, and it is never the same.', weight: 1.2 },
  all_caps: { label: 'everything labelled in capitals', line: 'EVERYTHING IS LABELLED IN CAPITALS. THE LABELS ARE NOT ALWAYS ON THE THING THEY NAME.' },
  energy_sponsor: { label: 'sponsored by an energy drink', line: 'Every fridge is full of the same energy drink, and the logo is on the ceiling for the benefit of people lying down.', price: 1.05, add: ['vending_machine'] },
  silence_rule: { label: 'a silence rule', line: 'A sign: SILENCE. A sign under it: WE MEAN IT. A sign under that is in sign language.', price: 1.1 },
  tutor_on_tap: { label: 'a tutor on tap', line: 'A tutor sits at the end of the row, hourly, and will answer any question as long as it is a good one.', price: 1.2 },
};

// ===================================================================== situations

export interface SituationDef {
  label: string;
  line: string;
  weight: number;
  /** Tags rows can require (`where.situation`). */
  tags: string[];
  /** Variants it cannot happen at. */
  not?: string[];
  /** Variants it can only happen at. */
  only?: string[];
  /** Multiplier on what a technique costs. */
  price?: number;
  fame?: number;
  purse?: number;
}

export const SITUATIONS: Record<string, SituationDef> = {
  ctf_night: { label: 'a challenge night', line: 'It is challenge night. Every terminal is occupied, the board is chalked up with purses, and someone is selling noodles at a mark-up.', weight: 3, tags: ['ctf', 'crowd'], fame: 1.4, purse: 1.4, not: ['lockers'] },
  zero_day_auction: { label: 'a zero-day auction', line: 'A zero-day is going under the hammer in the back. Everyone is pretending to be there for the tea.', weight: 2, tags: ['auction', 'crowd'], price: 1.2, purse: 1.5, not: ['academy'] },
  raid_rumour: { label: 'a raid is rumoured', line: 'Everyone is whispering about a raid. A box has been moved from under a table to under a different table.', weight: 2, tags: ['raid', 'gossip'] },
  sysop_feud: { label: 'a sysop feud', line: 'The sysop and the teacher are not speaking. They are each speaking to everyone else about it.', weight: 1.5, tags: ['feud', 'gossip'] },
  free_lesson_day: { label: 'a free lesson day', line: 'A banner says FREE LESSON DAY. A smaller banner says IN SELECT SUBJECTS.', weight: 1.5, tags: ['free_lesson'], price: 0.5 },
  rig_bricked: { label: 'the main rig is bricked', line: 'The main rig is dead. Everyone is standing around it with the faces of people at a bedside.', weight: 1.5, tags: ['bricked'] },
  wipe_night: { label: 'wipe night', line: 'It is wipe night: every drive in the place is being scrubbed, and the sysop is pacing.', weight: 1, tags: ['wipe', 'dark'] },
  titan_audit: { label: 'a Titanware wellness audit', line: 'A Titanware auditor in a lanyard is walking the room with a tablet. Every terminal has a small, new, open eye.', weight: 1.5, tags: ['audit', 'titan', 'inspector'], not: ['den'] },
  open_day: { label: 'an open day', line: 'It is open day. There are paper cups, a banner, and a very bright young person with a clipboard.', weight: 1.5, tags: ['open_day', 'crowd'], price: 0.8, only: ['academy', 'mill', 'cafe'] },
  power_cut: { label: 'a power cut', line: 'The power is out. The racks are dead, the room is lit by phones and the sysop is lit by anger.', weight: 1.5, tags: ['dark', 'power_cut'] },
  newbie_surge: { label: 'a surge of newcomers', line: 'A coach-load of newcomers has come in with the same flyer. They are lovely, and they are lost.', weight: 1.5, tags: ['surge', 'crowd'], price: 1.2 },
  teacher_away: { label: 'the teacher is away', line: 'The teacher is away. A handwritten sign says BACK SOON and has said so since Tuesday.', weight: 1.5, tags: ['away'], price: 1.1 },
  poaching: { label: 'a rival is poaching', line: 'A rival crew is leaning on the door pretending to read the board. They are reading the faces.', weight: 1, tags: ['poach'] },
  heist_planning: { label: 'a heist is being planned', line: 'A group at the back is pretending to play cards and has a floor plan under the deck.', weight: 1.2, tags: ['heist', 'gossip'] },
  pizza_night: { label: 'pizza night', line: 'It is pizza night. The room smells of it, and everyone is a bit nicer than usual.', weight: 1.2, tags: ['party', 'crowd'], only: ['cafe', 'den', 'arcade', 'garage', 'mill'] },
  bounty_posted: { label: 'a bounty posted on the board', line: 'A bounty is pinned to the board with a photo, a number and a note: DO NOT SHOUT ABOUT THIS.', weight: 1.5, tags: ['bounty', 'gossip'] },
};

/** Today's situation at a hub: a pure function of the clock and the hub's own id (rerolled every two days), so it can never desync. */
export function situationAt(w: Pick<World, 'worldSeed' | 'clock'>, loc: Location): { id: string; def: SituationDef } | undefined {
  const h = loc.hub;
  if (!h) return undefined;
  const epoch = Math.floor(w.clock / (MIN_PER_DAY * 2));
  const rng = new Rng(`hubsit:${w.worldSeed}:${loc.id}:${epoch}`);
  if (!rng.chance(0.6)) return undefined;
  const ids = Object.keys(SITUATIONS).filter((id) => {
    const s = SITUATIONS[id]!;
    return !s.not?.includes(h.variant) && (!s.only || s.only.includes(h.variant));
  });
  if (!ids.length) return undefined;
  const id = rng.weighted(ids, (k) => SITUATIONS[k]!.weight);
  return { id, def: SITUATIONS[id]! };
}

// ===================================================================== wild cards

export const WILD: Record<string, { label: string; line: string; weight: number }> = {
  master: { label: 'the Master', line: 'There is a Master. The Master teaches anything on the board, once, for a fee that nobody should pay. Nobody has been seen to refuse.', weight: 2 },
  cursed_course: { label: 'a cursed course', line: 'The course is cursed. Every lesson takes. Every failure is worse than it should be.', weight: 1.5 },
  honeypot: { label: 'a honeypot', line: 'Everything is free, and everything is logged. The friendliness is a script and the script is from Titanware.', weight: 1.5 },
  ghost_teacher: { label: 'a ghost instructor', line: 'The instructor died last year. The lessons go on, on a loop, and the loop knows your name.', weight: 1.2 },
  all_you_can_learn: { label: 'all you can learn', line: 'A subscription: ALL-YOU-CAN-LEARN. The cancellation form is a separate course.', weight: 1.5 },
  trapped_terminals: { label: 'every terminal is trapped', line: 'Every terminal is wired to something. The sysop says it is a feature.', weight: 1 },
  three_for_one: { label: 'three for one', line: 'The syllabus is longer than the room. Nobody knows how it fits.', weight: 1.2 },
  branch_zero: { label: 'Branch Zero', line: 'This is Branch Zero, the flagship. The eye is on everything, including the eye.', weight: 1 },
};

// ===================================================================== rolling one

export interface RolledHub {
  info: HubInfo;
  name: string;
  blurb: string;
  security: number;
  crowded: boolean;
}

const nearest5 = (n: number): number => Math.max(5, Math.round(n / 5) * 5);

const traitProd = (info: Pick<HubInfo, 'traits'>, key: 'price'): number => info.traits.reduce((m, t) => m * (TRAITS[t]?.[key] ?? 1), 1);

/** What a technique costs here, before the day's situation: the going rate, the tier, the variant and the traits, with a bit of luck. */
export function rollPrice(rng: Rng, info: Pick<HubInfo, 'variant' | 'tier' | 'traits' | 'wild'>, tech: string): number {
  const v = VARIANTS[info.variant];
  const base = TECHS[tech]?.price ?? 120;
  const jitter = 0.85 + rng.next() * 0.35;
  const master = info.wild === 'master' ? 4 : 1;
  return nearest5(base * (0.6 + 0.2 * info.tier) * (v?.price ?? 1) * traitProd(info, 'price') * jitter * master);
}

function rollSyllabus(rng: Rng, info: Omit<HubInfo, 'syllabus'>): SyllabusEntry[] {
  const v = VARIANTS[info.variant]!;
  const [lo, hi] = SIZES[info.size]!.syllabus;
  let n = rng.int(lo, hi);
  if (info.wild === 'three_for_one') n += 2;
  if (info.wild === 'master') n = Math.max(n, 3);
  const techs = Object.keys(TECHS);
  const out: SyllabusEntry[] = [];
  for (let i = 0; i < n && out.length < techs.length; i++) {
    const tech = rng.weighted(techs, (k) => (out.some((e) => e.tech === k) ? 0 : v.lean[k] ?? 1));
    if (out.some((e) => e.tech === tech)) continue;
    const route = info.wild === 'master' ? 'cash' : info.wild === 'branch_zero' && rng.chance(0.6) ? 'enrol' : rng.weighted(Object.keys(ROUTES), (k) => v.routes[k] ?? 0);
    const price = route === 'cash' || route === 'trial' || route === 'barter' ? rollPrice(rng, info, tech) : 0;
    const steps = route === 'lessons' ? rng.int(2, 4) : route === 'enrol' ? rng.int(2, 3) : 0;
    out.push({ tech, route, price, steps });
  }
  return out;
}

/** How a syllabus line reads on the board. */
export function boardLine(e: SyllabusEntry): string {
  const t = TECHS[e.tech]?.label ?? e.tech;
  const r = ROUTES[e.route];
  const fee = Math.max(5, Math.round(e.price / 4 / 5) * 5);
  const parts = Math.max(1, Math.round(e.price / 10));
  const how = (r?.board ?? e.route).replace('{price}', String(e.price)).replace('{steps}', String(e.steps)).replace('{parts}', String(parts)).replace('{fee}', String(fee));
  return `${t} (${how})`;
}

/** A hub, whole, from its own stream and in a fixed order. Pure. */
export function rollHub(rng: Rng, district: District, depth: number): RolledHub {
  const weights = HUB_VARIANT[district];
  const variant = rng.weighted(Object.keys(VARIANTS), (k) => weights[k] ?? 1);
  const v = VARIANTS[variant]!;
  const shell = rng.weighted(Object.keys(SHELLS), (k) => SHELLS[k]!.weight ?? 1);
  const sh = SHELLS[shell]!;
  const size = rng.weighted([0, 1, 2, 3, 4], (i) => [1.2, 2.6, 3, 1.6, 0.5][i]!);
  const condition = rng.weighted([0, 1, 2, 3, 4], (i) => [1, 2.5, 3, 1.4, 0.6][i]! * (district === 'corporate' ? (i >= 3 ? 3 : 0.4) : district === 'slum' ? (i <= 1 ? 3 : 0.4) : 1));
  const tier = Math.max(1, Math.min(5, rng.int(1, 5) + (depth >= 6 ? 1 : 0) - (depth <= 1 ? 1 : 0)));
  const traitIds = Object.keys(TRAITS).filter((t) => !TRAITS[t]!.only || TRAITS[t]!.only!.includes(variant));
  const nTraits = rng.weighted([0, 1, 2, 3], (i) => [3, 4, 2.5, 1][i]!);
  const traits: string[] = [];
  for (let i = 0; i < nTraits; i++) {
    const t = rng.weighted(traitIds, (k) => (traits.includes(k) ? 0 : TRAITS[k]!.weight ?? 1));
    if (!traits.includes(t)) traits.push(t);
  }
  const wild = rng.chance(1 / 12) ? rng.weighted(Object.keys(WILD), (k) => WILD[k]!.weight) : undefined;

  // Features: the variant's own, the shell's, the traits', a handful from the pool.
  const features: string[] = [];
  const add = (f: string): void => {
    if (FEATURES[f] && !features.includes(f)) features.push(f);
  };
  for (const f of v.floor) add(f);
  for (const f of sh.add ?? []) add(f);
  for (const t of traits) for (const f of TRAITS[t]!.add ?? []) add(f);
  if (wild === 'branch_zero') for (const f of ['brochure_rack', 'vitals_scanner', 'camera_console']) add(f);
  if (wild === 'trapped_terminals') add('terminal_row');
  const pool = Object.keys(FEATURES).filter((f) => FEATURES[f]!.base > 0 || (v.more[f] ?? 0) > 0);
  const [flo, fhi] = SIZES[size]!.features;
  const want = rng.int(flo, fhi);
  for (let i = 0; i < want * 3 && features.length < want; i++) add(rng.weighted(pool, (k) => (v.more[k] ?? FEATURES[k]!.base)));

  const base: Omit<HubInfo, 'syllabus'> = { variant, shell, size, condition, tier, traits, features, ...(wild ? { wild } : {}) };
  const syllabus = rollSyllabus(rng, base);
  const info: HubInfo = { ...base, syllabus };

  const raw = rng.pick(v.names);
  const name = raw.replace('{n}', String(rng.int(100, 999)));
  const cond = CONDITIONS[condition]!;
  const security = Math.max(0, v.sec + sh.sec + cond.sec + traits.reduce((s, t) => s + (TRAITS[t]!.sec ?? 0), 0) + (wild === 'branch_zero' ? 2 : 0) + rng.int(0, 1));
  const crowded = rng.chance(Math.min(0.9, v.crowd * SIZES[size]!.crowd));
  const extras = [sh.line, ...traits.map((t) => TRAITS[t]!.line), pick(rng, v.wall), cond.line, wild ? WILD[wild]!.line : ''].filter(Boolean);
  const board = `On the board: ${syllabus.map(boardLine).join('; ')}.`;
  const blurb = [pick(rng, v.blurbs).replace('{name}', name), pick(rng, extras), board].join(' ');
  return { info, name, blurb, security, crowded };
}

export const featuresIn = (info: HubInfo): string[] => info.features.filter((f) => FEATURES[f]);

// ===================================================================== prices

/** What a line on the syllabus costs right now: the board price, the day's situation, and what the house thinks of her. */
export function priceNow(info: HubInfo, e: SyllabusEntry, sit?: SituationDef, alumna = false): number {
  if (!ROUTES[e.route]?.cash && e.route !== 'barter') return 0;
  const m = (sit?.price ?? 1) * (alumna && info.variant === 'academy' ? 0.7 : 1);
  return Math.max(0, Math.round(e.price * m));
}

/** The fee to sit a trial: a quarter of the price. */
export const trialFee = (e: SyllabusEntry, sit?: SituationDef): number => Math.max(5, Math.round((e.price * (sit?.price ?? 1)) / 4 / 5) * 5);

/** Components a barter takes: a tenth of the price, at least one. */
export const barterParts = (e: SyllabusEntry, sit?: SituationDef): number => Math.max(1, Math.round((e.price * (sit?.price ?? 1)) / 10));

/** The hourly rate for a terminal here. */
export function hourly(info: HubInfo): number {
  const v = VARIANTS[info.variant];
  return v?.pass ? Math.max(1, Math.round(v.pass * (0.8 + 0.1 * info.tier) * traitProd(info, 'price'))) : 0;
}

// ===================================================================== people

export function hubRoster(loc: Location, info: HubInfo): SlotDef[] {
  const crowd = SIZES[info.size]?.people ?? 3;
  const academy = info.variant === 'academy' || info.wild === 'branch_zero';
  const slots: SlotDef[] = [
    { role: academy ? 'hub_dean' : 'hub_sysop', count: [1, 1], chance: 0.9, faction: 'venue', resident: true },
    { role: 'hub_teacher', count: [1, 1], faction: 'venue', resident: true },
    { role: 'hub_desk', count: [1, 1], chance: 0.6, faction: 'venue', resident: true },
    { role: 'hub_regular', count: [Math.max(0, crowd - 2), crowd + 1], ephemeral: true },
    { role: 'hub_guard', count: [1, 1], chance: Math.min(0.9, 0.1 + loc.security * 0.1), faction: 'venue', resident: true },
  ];
  if (academy) slots.push({ role: 'hub_counsellor', count: [1, 1], chance: 0.85, faction: 'venue', resident: true }, { role: 'tw_liaison', count: [1, 1], chance: 0.6, resident: true });
  else if (info.traits.includes('tw_verified') || info.traits.includes('tw_leased') || info.wild === 'honeypot') slots.push({ role: 'tw_liaison', count: [1, 1], chance: 0.35, resident: true });
  if (info.traits.includes('house_ai')) slots.push({ role: 'hub_bot', count: [1, 1], faction: 'venue', resident: true });
  slots.push({ role: 'ganger', count: [1, 2], chance: info.traits.includes('gang_taxed') || info.traits.includes('hot_hardware') ? 0.8 : 0.1, faction: 'influence' });
  slots.push({ role: 'cop', count: [1, 1], chance: 0.04 });
  return slots;
}

export { possessive };
