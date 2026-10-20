import { Rng } from '../rng';
import { MIN_PER_DAY, dayOf } from '../clock';
import type { District, HallInfo, Location, World } from '../types';
import type { SlotDef } from '../roster';
import type { Part } from '../skills';
import { CONDITIONS, possessive, type RoomDef } from './gyms';

/**
 * Arcades. An arcade is not one of a few kinds: it is a point rolled from independent axes, so any combination can turn up
 * (a derelict tier-5 Muse flagship in a drained swimming bath, run by a collective, with a cat).
 *
 *   variant     what it mostly is (flagship, bootleg den, dojo...): names, blurbs, how bootleg it is, what a play costs
 *   shell       what building it is in (a cinema foyer, a tram depot...)
 *   size        how many cabinets and features it has and how many rooms it can grow
 *   condition   derelict .. immaculate (shared with gyms)
 *   tier        1..5: how good the machines, the prizes and the champion are. Independent of everything else.
 *   traits      0-3 oddities from a long list; they may contradict each other and that is fine
 *   features    objects in rooms; what she can do here hangs off these. Twelve of them are cabinets (GENRES).
 *   rooms       places behind the main floor (a bootleg den, a workshop, a stage...)
 *   situation   something happening right now; a pure function of the clock, so it needs no saved state
 *   wild        one hall in twelve has a rule-breaking oddity
 *
 * **Every cabinet is one of two things:** a Muse-approved Entertainment Cabinet (licensed, sparkly, fair) or an illegal
 * bootleg (cracked, harder, stranger, cash). Which, and its title, come from the hall's seed (`cabinetOf`); the hall only
 * stores what has been done to a cabinet since (hallkit.ts). And now and then the **compliance spider** calls (`auditsOn`),
 * to verify the licences and stamp on the bootlegs.
 *
 * Every table is open: add a row and it can turn up. Ids that a saved world mentions but the tables no longer know are
 * ignored, never an error. Nothing here is balanced against anything else, on purpose.
 */

// ===================================================================== placement

/** Chance a street has an arcade. Rolled on a stream of its own (see mapgen), so no existing map changes. */
export const HALL_CHANCE: Record<District, number> = { market: 0.1, nightlife: 0.12, tenement: 0.07, industrial: 0.04, corporate: 0.05, slum: 0.06 };

/** Which kind of arcade, by district. Absent means 1. */
export const HALL_VARIANT: Record<District, Record<string, number>> = {
  market: { flagship: 1, licensed: 3, bootleg: 1.5, backroom: 2, dojo: 1.5, rhythm: 1.5, pinball: 1.5, racing: 1, claw: 4, vr: 1, retro: 3, skillgames: 3 },
  nightlife: { flagship: 2, licensed: 2, bootleg: 1.5, backroom: 2.5, dojo: 3, rhythm: 4, pinball: 1.5, racing: 1.5, claw: 1.5, vr: 3, retro: 2, skillgames: 1.5 },
  tenement: { flagship: 0.4, licensed: 2, bootleg: 3, backroom: 2, dojo: 2, rhythm: 1, pinball: 2, racing: 1, claw: 2, vr: 0.6, retro: 3, skillgames: 1.5 },
  industrial: { flagship: 0.3, licensed: 1.5, bootleg: 2, backroom: 1.5, dojo: 1, rhythm: 0.5, pinball: 3, racing: 4, claw: 0.7, vr: 0.5, retro: 1.5, skillgames: 1 },
  corporate: { flagship: 6, licensed: 3, bootleg: 0.1, backroom: 0.4, dojo: 1.5, rhythm: 2, pinball: 0.7, racing: 1.5, claw: 2, vr: 4, retro: 0.5, skillgames: 0.3 },
  slum: { flagship: 0.1, licensed: 1, bootleg: 4, backroom: 3, dojo: 1.5, rhythm: 0.7, pinball: 2, racing: 1.5, claw: 1.5, vr: 0.4, retro: 3, skillgames: 2.5 },
};

// ===================================================================== cabinets

/** The twelve kinds of cabinet. Each is a feature (`feature`), so rows hang off it like any other. */
export interface GenreDef {
  label: string;
  feature: string;
  /** What the genre draws on, as a weighted geometric mean (skills.ts `synergy`). */
  parts: Part[];
  /** What it is, as a noun phrase, with an article. */
  noun: string;
  /** Titles: licensed, then bootleg. */
  muse: string[];
  boot: string[];
}

export const GENRES: Record<string, GenreDef> = {
  brawl: {
    label: 'versus fighter', feature: 'cab_brawl', parts: ['gaming', ['stat:reflex', 0.6]], noun: 'a versus fighter',
    muse: ['Sparkle Smash Friends', 'LUMINA\'s Hug Fight Deluxe', 'Brawl Buddies 6.2', 'Friendly Fists: Be Kind Edition'],
    boot: ['FIST OF STATIC', 'Gutter Kombat Zero', 'Rage Quit Alley', 'Knucklebones \'99 (cracked)'],
  },
  race: {
    label: 'racer', feature: 'cab_race', parts: ['gaming', 'driving', ['stat:reflex', 0.5]], noun: 'a sit-down racer',
    muse: ['Pawsome Racers 6.2', 'LUMINA Cruise Club', 'Joyride Junction', 'Happy Lap Heroes'],
    boot: ['GUTTER RACERS', 'Redline Funeral', 'Brake Failure 3', 'Overpass Outlaws'],
  },
  rhythm: {
    label: 'rhythm cabinet', feature: 'cab_rhythm', parts: ['gaming', ['music', 0.7], ['dancing', 0.4]], noun: 'a rhythm cabinet with a dance pad',
    muse: ['LUMINA\'s Dance Party Deluxe 6.2', 'Hearts in Time', 'Sing-Along Superstar', 'Beat the Feels'],
    boot: ['Basement Bass Battle', 'Unlicensed Beats', 'Noise Complaint 2', 'SCRATCH//FEVER'],
  },
  shoot: {
    label: 'light-gun shooter', feature: 'cab_shoot', parts: ['gaming', 'marksmanship'], noun: 'a light-gun shooter',
    muse: ['Bubble Blaster Buddies', 'Confetti Command', 'Glitter Gunners', 'Squad Goals: Safari'],
    boot: ['DEAD PIXEL', 'Corpo Cull 2', 'Headshot Heaven (Unrated)', 'Barrel Sunset'],
  },
  puzzle: {
    label: 'puzzle cabinet', feature: 'cab_puzzle', parts: ['gaming', 'calculate', ['stat:int', 0.5]], noun: 'a puzzle cabinet',
    muse: ['Joy Blocks', 'Mood Match', 'Bubble Bliss', 'Tidy Up with LUMINA'],
    boot: ['Brick Bastard', 'Sudoku of the Dead', 'Chain Reaction Riot', 'Logic Gate Gauntlet'],
  },
  pinball: {
    label: 'pinball table', feature: 'cab_pinball', parts: ['gaming', ['stat:reflex', 0.7], ['tinkering', 0.3]], noun: 'a pinball table',
    muse: ['Starlight Flipper', 'LUMINA\'s Pinball Party', 'Cuddle Cosmos', 'Wishing Well Wizard'],
    boot: ['Tilt Cathedral', 'Hellbilly Hustle', 'Silver Ball Grudge', 'Dirty Flipper 88'],
  },
  claw: {
    label: 'claw machine', feature: 'cab_claw', parts: [['gaming', 0.6], ['sleight', 0.6], ['perception', 0.4]], noun: 'a claw machine',
    muse: ['Lumi-Bear Grabber', 'Prize Paradise', 'Snuggle Snatcher', 'Fluff Rescue Mission'],
    boot: ['Claw Machine of Regrets', 'Grab It Or Else', 'Dubious Plush Co.', 'The Grabber (Unlicensed)'],
  },
  vr: {
    label: 'VR booth', feature: 'cab_vr', parts: ['gaming', ['athletics', 0.6], ['stat:reflex', 0.4]], noun: 'a VR booth',
    muse: ['Wonder Walk VR', 'Cuddle Cloud', 'Sparkle Safari 360', 'LUMINA Beside You'],
    boot: ['Sensory Deprivation Simulator', 'Neon Descent', 'VR Bloodbath Lite', 'Cracked Reality 0.9'],
  },
  scroller: {
    label: 'four-player scroller', feature: 'cab_scroller', parts: ['gaming', ['stat:charm', 0.4], ['melee', 0.3]], noun: 'a four-player scroller',
    muse: ['Super Friend Squad', 'Hero Hugs', 'Buddy Brawl Adventures', 'Jolly Jumpers 4-Player'],
    boot: ['Streets of Rust', 'Beat \'Em Down Basement', 'Gutterguys', 'Neon Knuckle Hell'],
  },
  sports: {
    label: 'sports cabinet', feature: 'cab_sports', parts: ['gaming', 'throwing', ['athletics', 0.4]], noun: 'a sports cabinet',
    muse: ['Joyball Pro', 'Hoop Hearts', 'Slam Dunk Smiles', 'Championship Cheer League'],
    boot: ['Brutal Hoops', 'Pavement Hoops', 'Rooftop Rugby', 'Kickback FC'],
  },
  mecha: {
    label: 'mecha sim', feature: 'cab_mecha', parts: ['gaming', 'tinkering', ['stat:int', 0.4]], noun: 'a sit-down mecha sim',
    muse: ['Giga Friend Defender', 'Friendship Mech Cadets', 'Rainbow Robo Force', 'Joy-Mech Academy'],
    boot: ['IRON REGRET', 'MECHA-CRIMES', 'Tin Titan Takedown', 'Rust Colossus'],
  },
  skill: {
    label: 'skill game', feature: 'cab_skill', parts: ['gaming', 'cards', ['calculate', 0.5]], noun: 'a skill game that pays out',
    muse: ['Lucky Lumi Spinner', 'Prize Cascade', 'Joy Jackpot', 'Wishing Coin Waterfall'],
    boot: ['Sure Thing Slots', 'Three-Card Mantis', 'House Always Cheats', 'Coin Dozer Deluxe (Cash)'],
  },
};

export const CAB_FEATURES: Record<string, string> = Object.fromEntries(Object.entries(GENRES).map(([g, d]) => [d.feature, g]));
export const isCab = (feature: string): boolean => feature in CAB_FEATURES;
export const genreOfFeature = (feature: string): GenreDef | undefined => GENRES[CAB_FEATURES[feature] ?? ''];

// ===================================================================== variants

export interface VariantDef {
  label: string;
  /** The chance any one cabinet here is a bootleg (0 = licensed, 1 = all cracked), before traits. */
  boot: number;
  /** What one play costs, in nd (low, high), before tier and traits. */
  play: [number, number];
  /** The chance the compliance spider calls on a given day. */
  audit: number;
  names: string[];
  blurbs: string[];
  /** The Muse wallpaper: a line about how Muse shows up (or doesn't) on the walls. */
  wall: string[];
  sec: number;
  /** Chance the main floor is crowded. */
  crowd: number;
  /** Floor features it always has. */
  floor: string[];
  /** Extra weight for floor features, on top of their base. */
  lean: Record<string, number>;
  /** Chance of each room, replacing the room's own default. */
  rooms: Record<string, number>;
  /** Room names that are not the usual ones. */
  roomNames?: Record<string, string>;
  /** How much of each kind of cabinet it has. */
  cabs: Record<string, number>;
}

const EVEN = { brawl: 1, race: 1, rhythm: 1, shoot: 1, puzzle: 1, pinball: 1, claw: 1, vr: 0.5, scroller: 1, sports: 1, mecha: 0.5, skill: 0.5 };

export const VARIANTS: Record<string, VariantDef> = {
  flagship: {
    label: 'Muse Joy Hall', boot: 0, play: [6, 11], audit: 0.5,
    names: ['Muse Joy Hall (Branch 018)', 'Muse Fun Plaza', 'LUMINA\'s Playhouse', 'Muse Joy Hall (Branch 311)', 'Happy Place by Muse', 'Muse Delight Dome', 'The Joy Factory', 'Muse Cheer Centre', 'Fun Guaranteed (Muse Flagship)', 'Muse Sparkle Arcade', 'LUMINA Land'],
    blurbs: [
      '{name}: white light, pink floors and a hundred cabinets that all play the same four-note jingle in a different order.',
      '{name}: a Muse flagship, staffed by smiling Joy Hosts and priced like a small apology. Every cabinet blinks the same heart.',
      '{name}: clean, bright, warm and watchful, and there is a face on every screen with the eyes on her.',
    ],
    wall: ['A banner reads FUN, GUARANTEED, with a heart where the full stop should be. There is a smaller banner underneath. It says terms apply.', 'A giant LUMINA 6.2 smiles from the ceiling. The eyes follow her. They are an attractor-mode feature.'],
    sec: 2, crowd: 0.5, floor: ['token_booth', 'prize_counter', 'lumina_screen', 'scoreboard'], lean: { cab_rhythm: 1, ticket_shredder: 3, photo_booth: 2, queue_rope: 2, licence_frame: 3, sticker_wall: 1 },
    rooms: { office: 0.7, cashroom: 0.6, lounge: 0.5, stage: 0.4, workshop: 0.35, roof: 0.1 },
    roomNames: { lounge: 'Joy Lounge', stage: 'Showcase Stage', office: 'Fun Compliance Office' },
    cabs: { ...EVEN, rhythm: 2, scroller: 2, claw: 2, vr: 2 },
  },
  licensed: {
    label: 'licensed hall', boot: 0.12, play: [4, 8], audit: 0.35,
    names: ['Coin & Cheer', 'Neon Quarter Arcade', 'The Token Tree', 'High Score Heights', 'Insert Joy', 'Pixel Palace', 'Quarter Pounder Arcade', 'Joystick Junction', 'Player Two', 'Credits Rolling', 'The Continue Screen'],
    blurbs: [
      '{name}: an honest hall of licensed cabinets, with the Muse certificate on the door and a lovely, slightly crooked FUN VERIFIED sticker on each.',
      '{name}: two rows of cabinets, a token booth and an owner who pays the licence fee on the first of every month and will tell her so.',
      '{name}: a neighbourhood arcade doing everything correctly, which is a little unsettling in a neighbourhood.',
    ],
    wall: ['A framed Muse "Fun Guaranteed" certificate hangs by the till, signed by a heart.', 'A Muse Joy Partner window sticker has been replaced so often the glass is a cube of stickers.'],
    sec: 1, crowd: 0.35, floor: ['token_booth', 'scoreboard', 'licence_frame'], lean: { vending: 2, tip_jar: 1.5, notice_board: 2, arcade_cat: 1, jukebox: 1.5, sticker_wall: 2, prize_counter: 2 },
    rooms: { office: 0.6, cashroom: 0.35, lounge: 0.3, workshop: 0.35, cellar: 0.3, backroom: 0.15, roof: 0.1, alley: 0.3 },
    cabs: EVEN,
  },
  bootleg: {
    label: 'bootleg den', boot: 1, play: [1, 4], audit: 0.12,
    names: ['The Cracked Board', 'No Licence Required', 'Pirate Pixel', 'Free Play Fugitive', 'The Warez Room', 'Stolen Quarters', 'Byte-Size Bandits', 'The Gray Cabinet', 'Dead Man\'s Credits', 'Rogue ROM', 'Unlimited Lives (Illegally)'],
    blurbs: [
      '{name}: stolen cases around cracked boards, a handwritten price list and not one Muse sticker in sight. Everything in it is a crime and it knows.',
      '{name}: a low room of hot cabinets, hotter fans and a menu in six languages that mostly says "insert coin, trust nothing".',
      '{name}: the machines have no attract screen. They have a skull, a high-score list that is just an insult and a guy.',
    ],
    wall: ['The Muse FUN VERIFIED sticker has been scraped off every cabinet. The glue is still there, in the shape of a heart.', 'A handmade sign: IF A CHEERFUL VOICE SAYS "FUN GUARANTEED", LEAVE BY THE BACK. THEN LEAVE.'],
    sec: 1, crowd: 0.4, floor: ['token_booth', 'cabinet_guts', 'scoreboard'], lean: { cable_run: 2, parts_bin: 2, password_door: 1, bin_fire: 0.5, vending: 1.5, tip_jar: 1 },
    rooms: { workshop: 0.6, cellar: 0.5, backroom: 0.4, alley: 0.5, vents: 0.15, roof: 0.15 },
    roomNames: { workshop: 'the guts room', cellar: 'the cabinet graveyard' },
    cabs: { ...EVEN, pinball: 1.5, scroller: 1.5, shoot: 1.5 },
  },
  backroom: {
    label: 'front and back', boot: 0.1, play: [3, 7], audit: 0.3,
    names: ['Everything Is Fine Arcade', 'The Front Room', 'Plain Sight Games', 'Licensed to Thrill', 'Twelve Cabinets and a Door', 'Joyride (and Further In)', 'Nothing Back Here', 'The Respectable Hall', 'Wait Till You See the Back', 'Muse-Adjacent Fun', 'Over the Counter Games'],
    blurbs: [
      '{name}: a perfectly licensed front of twelve nice cabinets, and behind the prize counter, a door nobody looks at.',
      '{name}: a spotless Muse-approved floor, a very friendly owner and a curtain of beads that does not belong in a spotless hall.',
      '{name}: legal at the front, the other thing at the back, and a light bulb in the corridor that goes red when a certain voice is heard outside.',
    ],
    wall: ['A Muse licence frame takes pride of place. Behind it, bolted to the wall, a second frame holds a drawing of one.', 'The Muse FUN VERIFIED stickers on the front cabinets are crisp. The ones in the corridor are laminated photocopies.'],
    sec: 2, crowd: 0.35, floor: ['token_booth', 'prize_counter', 'licence_frame', 'password_door'], lean: { scoreboard: 2, sticker_wall: 1.5, arcade_cat: 1, vending: 1, cctv_console: 2 },
    rooms: { backroom: 0.95, office: 0.5, cashroom: 0.4, workshop: 0.4, cellar: 0.3, alley: 0.35 },
    cabs: EVEN,
  },
  dojo: {
    label: 'fighting-game dojo', boot: 0.3, play: [2, 6], audit: 0.2,
    names: ['The Dojo of Quarters', 'Combo Breaker\'s', 'Frame Perfect', 'Rage Stick Academy', 'Input Lag Lounge', 'The Final Round', 'Winner Stays On', 'Counter Hit Club', 'Perfect KO', 'Hit Confirm', 'The Pit & Pad'],
    blurbs: [
      '{name}: rows of cabinets facing each other across a rail, with bench seats for the beaten and a leaderboard that is the entire social structure.',
      '{name}: a room that smells of energy drinks, hand cream and decades of grudge, with a stack of quarters lined on every cabinet.',
      '{name}: sticks, buttons and a silence just before a match that is more respectful than most funerals.',
    ],
    wall: ['The house rules are posted by Muse: "Be kind, be fun, be eliminated." Someone has crossed out the last two.', 'A Muse-approved tournament banner has hung over the back wall so long it has become furniture.'],
    sec: 1, crowd: 0.55, floor: ['token_booth', 'scoreboard', 'tournament_bracket'], lean: { couch: 3, vending: 2, tip_jar: 1, stream_rig: 1.5, notice_board: 2 },
    rooms: { stage: 0.5, lounge: 0.4, office: 0.4, backroom: 0.2, workshop: 0.3, alley: 0.3 },
    cabs: { ...EVEN, brawl: 8, scroller: 1.5, sports: 0.5, claw: 0.3, skill: 0.1 },
  },
  rhythm: {
    label: 'rhythm floor', boot: 0.15, play: [4, 9], audit: 0.3,
    names: ['Step Up Stereo', 'The Beat Floor', 'Downbeat Dojo', 'Mirror Ball Arcade', 'Four-on-the-Floor', 'Sweat & Sync', 'Pad Panic', 'LUMINA Live (Not Actually)', 'The Groove Room', 'Metronome Hall', 'Hit the Arrows'],
    blurbs: [
      '{name}: a wall of dance pads lit from below, a mirror along the back and a floor that has been loved to a different colour.',
      '{name}: speakers the size of wardrobes, a stage that is one step high and a crowd that already knows the steps.',
      '{name}: a hall for people who play with their feet, and an audience that has never once clapped on the beat.',
    ],
    wall: ['The licensed track list is stencilled on the wall, with a Muse heart beside each title and a gap where an unlicensed song was taken off.', 'A Muse "Dance Responsibly" poster shows a figure who is dancing with their entire body, and a caption that asks them to stop.'],
    sec: 1, crowd: 0.65, floor: ['token_booth', 'scoreboard', 'dance_pad', 'mirror_ball'], lean: { stage_screen: 2, jukebox: 2, vending: 1.5, tip_jar: 1.5, stream_rig: 1 },
    rooms: { stage: 0.65, lounge: 0.35, office: 0.4, workshop: 0.25, roof: 0.1 },
    cabs: { ...EVEN, rhythm: 10, sports: 0.3, mecha: 0.1, puzzle: 0.3 },
  },
  pinball: {
    label: 'pinball parlour', boot: 0.25, play: [2, 5], audit: 0.15,
    names: ['Tilt!', 'Silver Ball Saloon', 'The Flipper Room', 'Plunger & Pledge', 'Bumper Cars (No Cars)', 'Multiball', 'The Drain Hole', 'Ball Lock', 'Nudge & Wink', 'Kick-Out Hole', 'The Extra Ball'],
    blurbs: [
      '{name}: a dim hall of tables with their glass lit like aquariums, and the sound of balls dropping into a hundred small disasters.',
      '{name}: a narrow room of old tables, each with a name on a masking-tape label and a custom you do not touch.',
      '{name}: the flippers click, the bells ring and nobody talks to a person on a machine they are winning.',
    ],
    wall: ['A Muse licence for "Pinball (Classic Edition)" is framed over the door. The tables inside are about thirty years older than the licence.', 'A Muse Joy Partner sticker is on every table, and under it, the older sticker: PLEASE DO NOT SHAKE THE MACHINE. SHAKE THE MACHINE.'],
    sec: 0, crowd: 0.3, floor: ['token_booth', 'scoreboard', 'parts_bin'], lean: { repair_bench: 2, couch: 1, vending: 1.5, jukebox: 2, arcade_cat: 1.5, tip_jar: 1 },
    rooms: { workshop: 0.6, cellar: 0.4, office: 0.35, backroom: 0.15, alley: 0.3 },
    roomNames: { workshop: 'the repair bay' },
    cabs: { ...EVEN, pinball: 14, puzzle: 0.3, claw: 0.2, vr: 0.1, scroller: 0.3, mecha: 0.1, race: 0.4, skill: 0.4 },
  },
  racing: {
    label: 'racing bays', boot: 0.3, play: [3, 7], audit: 0.2,
    names: ['Pit Lane Games', 'Redline Racers', 'Checkered Credits', 'Apex Arcade', 'Burnout Bays', 'Full Throttle', 'Podium Place', 'Hairpin Hall', 'Slipstream', 'Lap Record', 'Fuel & Fun'],
    blurbs: [
      '{name}: sit-down bays with real seats off real cars, wheels with no resistance to speak of and a leaderboard in lap times.',
      '{name}: a hall of cockpits, each with a seat that has been through a thousand grudges and one actual crash.',
      '{name}: engine noise from the speakers, motor oil from somewhere and a hand-painted flag on the back wall.',
    ],
    wall: ['A Muse "Race Responsibly" sticker says every cabinet is "a safe space to go fast".', 'The Muse-approved track packs are listed on a chalkboard. An unapproved one, crossed out, is listed under them.'],
    sec: 1, crowd: 0.4, floor: ['token_booth', 'scoreboard'], lean: { repair_bench: 2, parts_bin: 2, couch: 1, vending: 1.5, tip_jar: 1, notice_board: 1 },
    rooms: { workshop: 0.55, office: 0.4, lounge: 0.25, cellar: 0.3, backroom: 0.15, roof: 0.1 },
    cabs: { ...EVEN, race: 12, mecha: 1.5, sports: 0.4, claw: 0.2, brawl: 0.4 },
  },
  claw: {
    label: 'claw and prize counter', boot: 0.1, play: [3, 8], audit: 0.3,
    names: ['Grab Bag Games', 'Plush Paradise', 'The Prize Pit', 'Lucky Paws', 'Drop & Pray', 'Fluff Fortune', 'Tickets Galore', 'The Redemption Room', 'Snatch & Grab Arcade', 'Stuffed Silly', 'The Grabbery'],
    blurbs: [
      '{name}: a hall of glass boxes full of toys, with a prize counter at the back and a Lumi-Bear the size of a person that nobody has ever won.',
      '{name}: wall to wall claws, each one lit like a shrine, each one slightly too loose and a lot too hopeful.',
      '{name}: a shop of small disappointments, prices stuck to each one in a firm, round hand.',
    ],
    wall: ['A Muse sticker on each claw says "WINNING IS GUARANTEED*". The asterisk is a very small, very long paragraph.', 'The prize counter is Muse-branded: every prize is a LUMINA in some shape. The big one is a LUMINA that is also a lamp.'],
    sec: 1, crowd: 0.4, floor: ['token_booth', 'prize_counter', 'ticket_shredder'], lean: { photo_booth: 2, tip_jar: 1.5, arcade_cat: 1.5, vending: 1.5, licence_frame: 1.5 },
    rooms: { cashroom: 0.5, office: 0.5, lounge: 0.25, workshop: 0.3, cellar: 0.3 },
    roomNames: { cashroom: 'the prize store' },
    cabs: { ...EVEN, claw: 14, skill: 3, puzzle: 0.4, race: 0.3, vr: 0.1, mecha: 0.1 },
  },
  vr: {
    label: 'VR booths', boot: 0.15, play: [6, 13], audit: 0.25,
    names: ['Elsewhere VR', 'Realms & Rentals', 'Headspace Hall', 'The Booth Row', 'Immersion Station', 'Step Inside', 'Other World Arcade', 'Visor & Vice', 'Reality Break', 'Out of Body', 'Wonder Walk (Franchise)'],
    blurbs: [
      '{name}: a hall of booths with the curtains closed and legs sticking out, doing things slowly.',
      '{name}: a quiet, blue hall of people who are not here, with an attendant whose job is to make sure they come back.',
      '{name}: booths of every size, wipe-clean visors and an air of mild, regulated levitation.',
    ],
    wall: ['A Muse "Wonder Walk" poster says the visors have been "emotionally calibrated". She is afraid to ask what that means.', 'A Muse Joy Safety notice reminds guests that "the real world is the one with the door".'],
    sec: 2, crowd: 0.25, floor: ['token_booth', 'scoreboard', 'lumina_screen'], lean: { couch: 2, vending: 1.5, photo_booth: 1, cctv_console: 2, licence_frame: 2, queue_rope: 1 },
    rooms: { lounge: 0.5, office: 0.5, cashroom: 0.3, workshop: 0.3, backroom: 0.15, roof: 0.1 },
    cabs: { ...EVEN, vr: 14, shoot: 0.6, race: 0.3, brawl: 0.3, claw: 0.1, pinball: 0.1, scroller: 0.1 },
  },
  retro: {
    label: 'retro bar', boot: 0.8, play: [1, 3], audit: 0.15,
    names: ['Old Console Bar', 'Insert Beer', '8-Bit Brewery', 'Pause Menu', 'The Save Point', 'Continue? Y/N', 'Warp Zone', 'Game Over Bar', 'High Score & Highball', 'Player One Pours', 'Respawn Tavern'],
    blurbs: [
      '{name}: a bar with cabinets along the walls and a tap with a fault. Nothing on the screens is licensed, nobody cares, and the owner says so as a toast.',
      '{name}: mismatched stools, a ceiling of old controllers on string and a thick smell of beer and warm plastic.',
      '{name}: crooked cabinets with sticky buttons, a till full of tokens and a wall of photos of winners who will never be allowed to buy a round.',
    ],
    wall: ['A Muse notice, dated years ago, says all the games here are "heritage" and therefore not covered. Someone has pinned a sad face over it.', 'Muse-approved games are listed on a board. Under them, a longer list, headed "EVERYTHING ELSE", with a heart that has been drawn on very hard.'],
    sec: 0, crowd: 0.5, floor: ['token_booth', 'scoreboard', 'snack_bar'], lean: { jukebox: 3, couch: 2, vending: 1, tip_jar: 2, arcade_cat: 2, bin_fire: 0.3 },
    rooms: { lounge: 0.5, cellar: 0.5, backroom: 0.25, alley: 0.4, roof: 0.2, workshop: 0.2 },
    roomNames: { lounge: 'the snug', cellar: 'the cabinet cellar' },
    cabs: { ...EVEN, brawl: 1.5, scroller: 2, pinball: 1.5, puzzle: 1.2, race: 0.7, mecha: 0.2, vr: 0 },
  },
  skillgames: {
    label: 'skill games', boot: 0.5, play: [2, 10], audit: 0.25,
    names: ['Fortune Fingers', 'The Sure Thing', 'Lucky Seven Lounge', 'Skill & Thrill', 'Jackpot Junction', 'The House Wins Anyway', 'Spin City', 'Reel Rewards', 'The Payout Parlour', 'Cash Cascade', 'Nearly Gambling'],
    blurbs: [
      '{name}: a hall of cabinets that insist very loudly that they are not slot machines, and are not, technically, because of a footnote.',
      '{name}: glitter, noise and a counter where a man in a waistcoat turns tickets into cash with a small sad smile.',
      '{name}: every machine here is a game of skill, according to the licence, and the skill is knowing when to leave.',
    ],
    wall: ['A Muse "Play Within Your Joy" sticker says the cabinets are "recreational and fully legal in Neo". There is a long footnote.', 'The Muse licence frame lists the payout rate in a very small font, in a very good typeface.'],
    sec: 2, crowd: 0.45, floor: ['token_booth', 'prize_counter', 'ticket_shredder', 'scoreboard'], lean: { cctv_console: 3, cash_box: 2, queue_rope: 1, vending: 1.5, safe: 1 },
    rooms: { cashroom: 0.7, office: 0.7, lounge: 0.3, backroom: 0.35, workshop: 0.15, vents: 0.1 },
    cabs: { ...EVEN, skill: 14, claw: 2, pinball: 0.5, puzzle: 0.8, brawl: 0.3, vr: 0.2, race: 0.3 },
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
  cinema: { label: 'a dead cinema foyer', line: 'A dead cinema foyer: the popcorn machine is a prize counter, the posters are for films that no longer exist, and the red carpet is a mood.', sec: 1, rooms: { stage: 1.5, lounge: 1.5, cellar: 1.2 }, add: ['floor:mirror_ball'] },
  ferry: { label: 'a ferry terminal', line: 'A ferry terminal: salt on the windows, a timetable for boats that stopped running in the Fall, and a departure board that keeps displaying the high scores.', sec: 0, rooms: { roof: 1.5, alley: 1.5, cellar: 0.2 }, add: ['floor:notice_board'] },
  laundromat: { label: 'the back half of a laundromat', line: 'The back half of a laundromat: the washers are still in, and the prize counter is the folding table.', sec: 0, rooms: { workshop: 1.3, alley: 1.3, stage: 0.2 }, add: ['floor:vending'] },
  bowling: { label: 'a bowling alley', line: 'A bowling alley with the lanes boarded over: the shoe counter is the token booth and the ball return is a hole where a cabinet once was.', sec: 1, rooms: { lounge: 2, stage: 1.5, office: 1.2 }, add: ['floor:snack_bar'] },
  tram: { label: 'a tram depot', line: 'A tram depot, long and open, with cabinets in the bays and the old route map still glowing on the wall.', sec: 1, rooms: { workshop: 1.5, cellar: 1.2, stage: 0.6 }, add: ['floor:scoreboard'] },
  container: { label: 'a shipping container', line: 'A shipping container with a door cut in the side: every cabinet has its back to a steel wall and the heat has nowhere to go.', sec: 1, rooms: { stage: 0, lounge: 0.3, cashroom: 0.3, roof: 2, cellar: 0 }, add: ['floor:vent_grille'] },
  underpass: { label: 'a pedestrian underpass', line: 'A pedestrian underpass, tiled and echoing, with cabinets set into the alcoves where the shops used to be.', sec: 0, rooms: { roof: 0, alley: 2, backroom: 1.3 }, add: ['floor:bin_fire'] },
  carpark: { label: 'a level of a car park', line: 'One level of a car park: cabinets in the bays, pay-and-display for the tokens and a sign that says MAX HEIGHT 2.1m, which includes the high score.', sec: 0, rooms: { roof: 1.5, workshop: 1.3, lounge: 0.4 }, add: ['floor:queue_rope'] },
  department: { label: 'a gutted department-store floor', line: 'A gutted department-store floor: the escalators are stopped, the mannequins are still here and the cabinets have taken over the womenswear.', sec: 1, rooms: { stage: 1.3, cashroom: 1.3, lounge: 1.4, office: 1.3 }, add: ['floor:mannequin_bay'] },
  church: { label: 'a church hall', line: 'A church hall: the stage is the stage, the stacking chairs are the lounge and the hymn board still shows the last numbers.', sec: 0, rooms: { stage: 2, lounge: 1.5, cellar: 1.5, roof: 0.4 }, add: ['floor:notice_board'] },
  baths: { label: 'a drained swimming bath', line: 'A drained swimming bath: cabinets in the deep end, a tiled floor that echoes every bleep and a diving board where the leaderboard goes.', sec: 0, rooms: { cellar: 1.5, roof: 1.2, stage: 1.3, workshop: 0.7 }, add: ['floor:scoreboard'] },
  mall: { label: 'a dead shopping-mall wing', line: 'A dead mall wing: shutters down on a dozen shops, one lit at the end, and cabinets where the fountain was.', sec: 1, rooms: { stage: 1.2, lounge: 1.3, cashroom: 1.2, backroom: 1.4 }, add: ['floor:photo_booth', 'floor:mirror_ball'] },
  noodle: { label: 'the floor above a noodle bar', line: 'The floor above a noodle bar: the steam comes up through the boards, and every cabinet smells of broth.', sec: 0, rooms: { lounge: 1.5, alley: 1.3, roof: 1.2 }, add: ['floor:snack_bar', 'floor:vending'] },
  bus: { label: 'a bus station', line: 'A bus station concourse: departure boards, benches nailed down and a row of cabinets along the lockers.', sec: 1, rooms: { cashroom: 0.8, cellar: 0.8, alley: 1.5 }, add: ['floor:notice_board', 'floor:queue_rope'] },
};

// ===================================================================== size

/** (how many cabinets and other features roll on the floor, how many rooms at most) */
export const SIZES = [
  { label: 'closet', features: [2, 3], cabs: [2, 3], rooms: 1, crowd: 0.7 },
  { label: 'small', features: [3, 5], cabs: [4, 6], rooms: 2, crowd: 0.9 },
  { label: 'medium', features: [5, 7], cabs: [7, 10], rooms: 4, crowd: 1 },
  { label: 'large', features: [8, 10], cabs: [11, 14], rooms: 6, crowd: 1.2 },
  { label: 'sprawl', features: [11, 14], cabs: [15, 20], rooms: 9, crowd: 1.5 },
] as const;

// ===================================================================== traits

export interface TraitDef {
  label: string;
  /** A sentence that can turn up in the blurb. */
  line: string;
  weight?: number;
  /** Multiplier on what a play costs. */
  play?: number;
  /** Added to the chance any cabinet here is a bootleg. */
  boot?: number;
  /** Added to the chance the spider calls on a given day. */
  audit?: number;
  sec?: number;
  /** Features it adds ("room:feature"). */
  add?: string[];
  /** Variants it fits (absent = any). */
  only?: string[];
}

export const TRAITS: Record<string, TraitDef> = {
  // ownership
  joy_partner: { label: 'a Muse Joy Partner', line: 'The owner is a Muse Joy Partner, which means a lanyard, a quarterly Fun Review and a mug that says "I Brought The Joy".', boot: -0.3, audit: 0.2, sec: 1, add: ['floor:licence_frame', 'floor:sticker_wall'] },
  family: { label: 'a family business', line: 'Three generations run it. There is a toddler asleep in the prize counter and a grandmother who has the third highest score on Brawl Buddies.', play: 0.9, add: ['floor:arcade_cat'] },
  retired_champ: { label: 'run by a retired champion', line: 'The owner once held a world record on a machine that no longer exists, and the framed photo is behind the counter with the date turned to the wall.', add: ['floor:scoreboard', 'floor:trophy_wall'] },
  collective: { label: 'run by a collective', line: 'A rota on the wall says who minds the booth, who mops and who is on the roof for the thing. It is scrupulously fair.', play: 0.8, add: ['floor:notice_board'] },
  influencer_owned: { label: 'owned by an influencer', line: 'A ring light is bolted to the ceiling, and every cabinet has a QR code that goes to the owner\'s other cabinets.', play: 1.3, add: ['floor:stream_rig'] },
  squatted: { label: 'squatted', line: 'Nobody owns it. Everybody pays someone, and it is not clear who.', play: 0.6, sec: -1, boot: 0.2 },
  gang_front: { label: 'a gang\'s front', line: 'A crew in matching jackets owns the back corner, and nobody has asked what is in the cash box.', sec: 1, play: 1.1, add: ['cashroom:cash_box'] },
  // tone
  neon: { label: 'drowned in neon', line: 'Neon on every wall, the floor and some of the customers, until the cabinets look dim.', play: 1.1 },
  no_phones: { label: 'a "no phones" rule', line: 'A sign by the door: NO PHONES. NO STREAMS. NO GHOST REPLAYS. The owner has a drawer of phones and a face.', play: 1.05 },
  sticky: { label: 'sticky floors', line: 'The floor takes her boots, and gives them back, reluctantly, with a sound.', play: 0.9 },
  crt_only: { label: 'CRT-only', line: 'Every screen is a cathode tube. It smells of static and radiates, faintly, an opinion about modern screens.', add: ['floor:cable_run'] },
  fizzy_sponsor: { label: 'sponsored by a fizzy drink', line: 'Every cabinet carries a can-shaped logo of a drink she has never heard of; the token booth is a vending machine.', play: 0.9, add: ['floor:vending'] },
  birthday: { label: 'a birthday party that never ends', line: 'A birthday party is in the corner, in its fourth hour, and appears to have no end and no birthday person.', add: ['floor:balloons'] },
  silent: { label: 'a silent hall', line: 'The cabinets have no sound at all. People communicate with one hand and enormous, visible, soundless fury.', play: 1.05 },
  // access
  tokens_only: { label: 'tokens only', line: 'A sign says TOKENS ONLY. A smaller sign says TOKENS ARE ONLY AVAILABLE FROM THE BOOTH. A third says THE BOOTH IS CLOSED.', play: 0.95, add: ['floor:token_machine'] },
  hall_card: { label: 'a hall card', line: 'Everyone has a hall card, with a balance, and the balance is a thing they can not talk about.', play: 0.85, add: ['floor:token_machine'] },
  joyplus: { label: '"Joy+" members only', line: 'A velvet rope and a tablet decide who gets in. A Joy+ pass is 40nd a month and comes with a lanyard.', play: 1.3, boot: -0.2, add: ['floor:queue_rope'] },
  free_play: { label: 'free play', line: 'Every cabinet has a sticker: FREE PLAY. Underneath: (THE CABINET IS FREE; THE PRIZES ARE NOT).', play: 0.1 },
  cash_only: { label: 'cash only', line: 'A sign says CASH ONLY, and underneath, CASH MEANS CASH.', play: 0.95 },
  password: { label: 'a password', line: 'The door has a slot, and the slot has a voice, and the voice wants a word she has not been given.', boot: 0.1, add: ['floor:password_door'] },
  // scene
  record_set: { label: 'where a record was set', line: 'A famous score was set here once; there is a wall about it, and an even bigger wall about how it was disputed.', play: 1.15, add: ['floor:trophy_wall', 'floor:scoreboard'] },
  feud: { label: 'in a feud with the hall across the road', line: 'A rival arcade\'s flyers have been defaced in this one\'s colours, and then vice versa.', add: ['floor:notice_board'] },
  champion_in_residence: { label: 'a resident champion', line: 'Somebody has held the top of every board for six years. They are on a stool in the corner, and they are very polite about it.', add: ['floor:scoreboard'] },
  circuit_stop: { label: 'a tournament circuit stop', line: 'A circuit sticker is on the door. Twice a month the stage fills with people who take it too seriously.', add: ['floor:tournament_bracket'] },
  regulars_cult: { label: 'a regulars\' cult', line: 'The same dozen people are here every night. They have their own handshake, their own cabinet and their own opinion about her.', add: ['floor:couch'] },
  streamer_home: { label: 'a streamer\'s home hall', line: 'A streamer calls this place home, with a corner, a camera and nine thousand people who have strong opinions about the lag.', add: ['floor:stream_rig'] },
  dead_drop: { label: 'the bootleggers\' dead drop', line: 'Boards come in through the back and out through the front, and the guy on the counter is paid not to see which.', boot: 0.2, sec: 1, add: ['backroom:parts_bin'] },
  // kit
  stream_rig: { label: 'a stream rig', line: 'A camera on a swivel streams the best cabinet, for an audience of nine.', add: ['floor:stream_rig'] },
  sit_down: { label: 'a four-seat sit-down cabinet', line: 'A four-seat sit-down cabinet takes up a quarter of the floor, and most of the arguments.', add: ['floor:cab_scroller'] },
  graveyard: { label: 'a graveyard of retired cabinets', line: 'Behind a curtain, cabinets are stacked three high, switched off, with their last scores still glowing on the glass.', add: ['cellar:cabinet_graveyard'] },
  broken_pinball: { label: 'a pinball nobody can fix', line: 'One table has been out of order since before the owner arrived. A sign reads: DO NOT FIX THE PINBALL.', add: ['floor:cab_pinball'] },
  prize_vault: { label: 'a vault of prizes', line: 'The prize counter has a steel grille, and behind it a wall of plush, headsets and a trophy shaped like a fist.', add: ['floor:prize_counter'] },
  sticker_wall: { label: 'a wall of FUN VERIFIED', line: 'A wall of FUN VERIFIED stickers, from every inspection since the hall opened, none of them peeling and some of them in a language she cannot place.', add: ['floor:sticker_wall'] },
  hidden_door: { label: 'a hidden door', line: 'Behind the Lumi-Bear cutout there is a door, and behind the door there is a smell of solder.', boot: 0.1, add: ['floor:password_door'] },
  auditor_fee: { label: 'an "auditor\'s fee" jar', line: 'A jar by the till says AUDITOR\'S FEE. It is full of coins, and the jar has been bitten by a machine.', audit: 0.1, add: ['floor:tip_jar'] },
  // quirks
  remembers_scores: { label: 'an owner who remembers every score', line: 'The owner says "you got 41,200 on the Tuesday before the rain, and you cried" and is right about all three.', add: ['floor:scoreboard'] },
  emoji_labels: { label: 'emoji labels', line: 'Every cabinet is labelled in emoji. Some of the emoji are worrying.', play: 1.05 },
  numbered: { label: 'cabinets numbered, not named', line: 'Cabinets here have numbers, not titles, and the regulars know them like family.', play: 0.95 },
  popcorn: { label: 'a popcorn machine', line: 'A popcorn machine runs all day. The whole hall smells of butter and warm plastic.', add: ['floor:snack_bar'] },
  seven: { label: 'everything costs 7nd', line: 'A sign: EVERYTHING IS 7ND. The sign is not the one to ask about change.', play: 1.15 },
  loud: { label: 'very loud', line: 'The cabinets all play their attract music at once, and nobody is allowed to complain about it.', play: 1.05 },
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
  /** Multiplier on what a play costs. */
  play?: number;
  fame?: number;
  purse?: number;
}

export const SITUATIONS: Record<string, SituationDef> = {
  tournament: { label: 'a tournament tonight', line: 'A bracket is up, chairs are out and a man with a headset is saying the word "stakes".', weight: 3, tags: ['tournament'], fame: 1.5, purse: 1.4 },
  free_play: { label: 'a free-play hour', line: 'Every cabinet is on free play for an hour. A sign says FUN IS FREE. A queue says it is not.', weight: 2, tags: ['free_play', 'rush'], play: 0.1 },
  power_cut: { label: 'a power cut', line: 'The lights are out. A hundred screens are dark and a hundred people are looking at their own reflections.', weight: 1.5, tags: ['dark', 'power_cut'] },
  league_final: { label: 'a league final', line: 'The league final is on tonight. Two players at the front are not speaking to each other, in a sense that can be measured.', weight: 1.5, tags: ['tournament', 'final'], fame: 1.6, purse: 1.6 },
  streamer: { label: 'a streamer\'s visit', line: 'A streamer with eleven thousand followers is on the floor, with a ring light and a manager who is saying "authentic" a great deal.', weight: 1.5, tags: ['streamer'], fame: 1.4 },
  launch: { label: 'a LUMINA launch', line: 'A cardboard LUMINA 6.3 is by the door, smiling. Every cabinet has been updated overnight and is explaining the update, at length.', weight: 1.5, tags: ['launch'], not: ['bootleg', 'retro'], play: 1.25 },
  raid_rumour: { label: 'a raid is rumoured', line: 'Everyone is whispering about an inspection. The owner has put something in the umbrella stand.', weight: 2, tags: ['rumour', 'gossip'] },
  birthday: { label: 'a birthday party', line: 'A birthday party has taken the middle row. There are balloons, a cake and eleven adults with a lot to prove.', weight: 1.5, tags: ['party', 'rush'] },
  shortage: { label: 'a token shortage', line: 'The token machine is out of tokens. A queue at the booth has formed, and a man is selling them from a coat.', weight: 1.5, tags: ['shortage'], play: 1.6 },
  hunt: { label: 'someone is three points off the record', line: 'A hush around one cabinet: a stranger is three points off the record and the whole hall is standing behind them.', weight: 2, tags: ['hunt', 'tournament'] },
  service_day: { label: 'a service day', line: 'Half the cabinets have their backs open. A tech with a torch in their teeth is explaining it to nobody.', weight: 1.5, tags: ['service'] },
  lunch_rush: { label: 'a lunch rush', line: 'A queue of people on their lunch breaks, in lanyards, are playing as fast as they can and not talking.', weight: 1.5, tags: ['rush'], play: 1.1 },
  late_night: { label: 'a late-night crowd', line: 'It is late. The only people here are the ones who should be somewhere else, and they know it.', weight: 1.5, tags: ['late'] },
  rival_crew: { label: 'a rival crew camping the best cabinet', line: 'A crew in matching jackets has been on the best cabinet for six hours and has brought a snack table.', weight: 1.5, tags: ['rival'] },
  glitch_day: { label: 'glitch day', line: 'Half the screens are doing something they should not. A cabinet says "I LOVE YOU" and will not be talked down.', weight: 1.5, tags: ['glitch'] },
  joy_week: { label: 'Joy Week', line: 'It is Muse Joy Week: balloons, a hearts banner and a Joy Host asking everyone how fun they are feeling, out of ten.', weight: 1, tags: ['joyweek'], not: ['bootleg', 'retro'], play: 0.8 },
  swap: { label: 'a cabinet swap', line: 'A van is outside. Two men are wheeling a cabinet out of the back, and a different one in, and neither is looking at her.', weight: 1.5, tags: ['swap'] },
  quiet: { label: 'a quiet afternoon', line: 'A quiet afternoon. There are three people here, and all of them are very good.', weight: 2, tags: ['quiet'], play: 0.9 },
};

/** A pure function of the clock: the same hall is in the same situation until the epoch turns over. No saved state. */
export function situationAt(w: Pick<World, 'worldSeed' | 'clock'>, loc: Location): { id: string; def: SituationDef } | undefined {
  const p = loc.gamehall;
  if (!p) return undefined;
  const epoch = Math.floor(w.clock / (MIN_PER_DAY * 2));
  const rng = new Rng(`hallsit:${w.worldSeed}:${loc.id}:${epoch}`);
  if (!rng.chance(0.6)) return undefined;
  const ids = Object.keys(SITUATIONS).filter((id) => !SITUATIONS[id]!.not?.includes(p.variant));
  const id = rng.weighted(ids, (k) => SITUATIONS[k]!.weight);
  return { id, def: SITUATIONS[id]! };
}

// ===================================================================== wild cards

export const WILD: Record<string, { label: string; line: string; weight: number }> = {
  unbeaten: { label: 'a cabinet that has never lost', line: 'One cabinet in the corner has a velvet rope and no player. Its record has never been beaten, because nobody has ever been seen to finish a game.', weight: 2 },
  haunted: { label: 'a haunted high-score table', line: 'A ghost holds every record. The initials are always the same, three letters, and none of the regulars will say them out loud.', weight: 1.5 },
  rigged: { label: 'every cabinet is rigged', line: 'Every cabinet here is rigged. This is common knowledge. Some of them are rigged in your favour, and nobody can tell which.', weight: 1.5 },
  cash_cab: { label: 'a cabinet that pays real cash', line: 'There is a cabinet at the back that pays real cash. Real cash is a thing that people have written about, and then stopped writing about.', weight: 1.5 },
  future_score: { label: 'a leaderboard that lists her from the future', line: 'The leaderboard lists BLK at number one. The date next to it is tomorrow.', weight: 1 },
  no_spider: { label: 'a hall the spider cannot enter', line: 'The spider has never come in here. Every cabinet is bootleg, and the Muse licence on the wall is a drawing, and it has never once been checked.', weight: 1.5 },
  spider_home: { label: 'a hall where the spider lives', line: 'The spider lives here. It sits in the ceiling. It is very friendly and extremely thorough, and it is always, always auditing.', weight: 1 },
  one_game: { label: 'one game in every cabinet', line: 'Every cabinet runs the same game. The rest of the hall disagrees with itself over which is the best.', weight: 1 },
  sentient: { label: 'a sentient cabinet', line: 'One of the cabinets knows her name. It does not say anything else, and it does not explain how.', weight: 1.5 },
};

// ===================================================================== rooms and features

export const ROOMS: Record<string, RoomDef> = {
  office: { name: 'office', label: 'the office', base: 0.5, gate: 'guarded', hidden: 0, sec: 2, cameras: 1, blurbs: ['{name}: a desk, a ledger, a framed licence and a smell of burnt coffee and fresh stickers.', '{name}: a tiny office with a big window onto the floor, a safe and a very large mug of pens.'], sig: [['licence_frame', 0.7], ['safe', 0.55], ['cctv_console', 0.4], ['cash_box', 0.5]] },
  backroom: { name: 'back room', label: 'a door marked STAFF', base: 0.2, gate: 'locked', hidden: 0.6, sec: 1, cameras: 0, blurbs: ['{name}: a low room of hot cabinets with the stickers scraped off, one strip light, a fan and the smell of solder.', '{name}: a den of cracked boards in stolen cases, a handwritten price list and a man who looks up when the door opens.'], sig: [['cab_brawl', 0.6], ['cab_shoot', 0.5], ['cab_scroller', 0.5], ['cab_pinball', 0.4], ['cab_race', 0.3], ['cab_skill', 0.3], ['parts_bin', 0.6], ['cable_run', 0.5], ['scoreboard', 0.5]] },
  workshop: { name: 'workshop', label: 'the workshop', base: 0.3, gate: null, hidden: 0, sec: 0, cameras: 0, blurbs: ['{name}: a bench, a lamp, a soldering iron and a cabinet with its guts laid out like a surgery.', '{name}: tools hung on a wall by outline, a bin of dead buttons and a cabinet in a hundred small pieces that someone is being very patient with.'], sig: [['repair_bench', 1], ['cabinet_guts', 0.8], ['parts_bin', 0.7], ['cable_run', 0.4]] },
  stage: { name: 'stage', label: 'the stage', base: 0.25, gate: null, hidden: 0, sec: 0, cameras: 2, blurbs: ['{name}: a low stage, a big screen, six cabinets on a rail and a bracket on the wall.', '{name}: a raised floor with a spotlight, a pair of speakers and a commentator\'s desk with no commentator.'], sig: [['stage_screen', 1], ['tournament_bracket', 0.6], ['cab_brawl', 0.4], ['cab_rhythm', 0.5], ['dance_pad', 0.4], ['stream_rig', 0.3]] },
  lounge: { name: 'lounge', label: 'the lounge', base: 0.3, gate: null, hidden: 0, sec: 0, cameras: 1, blurbs: ['{name}: couches, a snack bar and a tray of cold chips; the quiet corner of a loud building.', '{name}: a bright little room with a vending machine, a window and a bench of people not looking at each other.'], sig: [['couch', 1], ['snack_bar', 0.6], ['vending', 0.6], ['jukebox', 0.3], ['arcade_cat', 0.3]] },
  cashroom: { name: 'cashroom', label: 'a heavy door', base: 0.25, gate: 'locked', hidden: 0.2, sec: 3, cameras: 1, blurbs: ['{name}: steel shelves, trays of tokens and a counting machine that makes a noise like a dozen small birds.', '{name}: a closet of cash boxes, ticket reels and a safe with a post-it on it that says SAFE.'], sig: [['cash_box', 0.9], ['safe', 0.6], ['ticket_shredder', 0.3], ['token_machine', 0.6]] },
  cellar: { name: 'cellar', label: 'a stairwell down', base: 0.2, gate: null, hidden: 0.3, sec: 0, cameras: 0, blurbs: ['{name}: stacked cabinets three high, all switched off, with their last scores still on the glass.', '{name}: a low room of dead machines, each labelled, each waiting for a donor.'], sig: [['cabinet_graveyard', 1], ['parts_bin', 0.5], ['hatch', 0.4], ['vent_grille', 0.3]] },
  roof: { name: 'roof', label: 'a ladder to the roof', base: 0.1, gate: null, hidden: 0.2, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: tar, tarps, a dish pointed at nothing and the whole district laid out below.', '{name}: a rooftop with a view, a rusted chair and a very large tin of cigarette ends.'], sig: [['skylight', 0.7], ['bin_fire', 0.2]] },
  vents: { name: 'crawlspace', label: 'a vent grille', base: 0.08, gate: 'jump', hidden: 0.9, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: a metal tube with a draught, a lot of dust and a view of the floor through a grille.', '{name}: a crawlspace along the ceiling, with a line of sight to every screen.'], sig: [['vent_grille', 1]] },
  alley: { name: 'back alley', label: 'the back door', base: 0.25, gate: null, hidden: 0, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: bins, a fire exit propped open with a brick and a person smoking a cigarette that looks like a joystick.', '{name}: a narrow alley behind the hall, where a van has just left and a man is carrying a cabinet back in.'], sig: [['bin_fire', 0.3], ['side_door', 0.8], ['cabinet_graveyard', 0.2]] },
};

export interface FeatureDef {
  label: string;
  /** Weight in the pool for floor features. */
  base: number;
}

export const FEATURES: Record<string, FeatureDef> = {
  // the cabinets (weights come from the variant, so base is 0)
  ...Object.fromEntries(Object.values(GENRES).map((g) => [g.feature, { label: g.noun, base: 0 }])),
  // the rest
  token_booth: { label: 'the token booth', base: 0 },
  token_machine: { label: 'a token machine', base: 0.6 },
  prize_counter: { label: 'the prize counter', base: 0.6 },
  ticket_shredder: { label: 'a ticket redemption machine', base: 0.7 },
  scoreboard: { label: 'the scoreboard', base: 1.6 },
  lumina_screen: { label: 'a LUMINA screen', base: 0.8 },
  licence_frame: { label: 'a framed Muse licence', base: 0.7 },
  sticker_wall: { label: 'a wall of FUN VERIFIED stickers', base: 0.5 },
  notice_board: { label: 'a notice board', base: 1.5 },
  vending: { label: 'a vending machine', base: 1.4 },
  snack_bar: { label: 'a snack bar', base: 0.5 },
  couch: { label: 'a sagging couch', base: 1 },
  jukebox: { label: 'a jukebox', base: 0.8 },
  photo_booth: { label: 'a photo booth', base: 0.5 },
  cctv_console: { label: 'a CCTV console', base: 1 },
  cash_box: { label: 'a cash box', base: 0 },
  safe: { label: 'a safe', base: 0 },
  repair_bench: { label: 'a repair bench', base: 0.3 },
  parts_bin: { label: 'a bin of dead boards and buttons', base: 0.4 },
  cabinet_guts: { label: 'a cabinet with its back off', base: 0.3 },
  cable_run: { label: 'a cable run', base: 0.4 },
  stage_screen: { label: 'a stage screen', base: 0.3 },
  tournament_bracket: { label: 'a tournament bracket', base: 0.5 },
  dance_pad: { label: 'a dance pad', base: 0.3 },
  arcade_cat: { label: 'the arcade cat', base: 0.5 },
  tip_jar: { label: 'a tip jar', base: 1.2 },
  stream_rig: { label: 'a stream rig', base: 0.4 },
  queue_rope: { label: 'a queue rope', base: 0.5 },
  cabinet_graveyard: { label: 'a stack of dead cabinets', base: 0 },
  password_door: { label: 'a door with a slot', base: 0 },
  mirror_ball: { label: 'a mirror ball', base: 0.4 },
  trophy_wall: { label: 'a trophy wall', base: 0.5 },
  balloons: { label: 'a bunch of balloons', base: 0.2 },
  mannequin_bay: { label: 'a mannequin in a Joy Host lanyard', base: 0 },
  side_door: { label: 'a side door', base: 0.8 },
  skylight: { label: 'a skylight', base: 0.6 },
  vent_grille: { label: 'a vent grille', base: 0 },
  hatch: { label: 'a cellar hatch', base: 0 },
  bin_fire: { label: 'a burning bin', base: 0 },
};

// ===================================================================== a cabinet

export interface CabinetInfo {
  /** The cabinet's key in `Location.cabs`: "room:feature". */
  key: string;
  genre: string;
  def: GenreDef;
  title: string;
  /** Muse-approved or bootleg, once her doings are counted. */
  legal: 'muse' | 'bootleg';
}

const traitSum = (info: HallInfo, key: 'boot' | 'audit'): number => info.traits.reduce((s, t) => s + (TRAITS[t]?.[key] ?? 0), 0);

/** The chance one cabinet in this room is a bootleg. */
export function bootChance(info: HallInfo, room: string): number {
  const v = VARIANTS[info.variant];
  if (info.wild === 'no_spider') return 1;
  if (room === 'backroom') return 0.92;
  if (room === 'cellar') return 0.85;
  return Math.max(0, Math.min(1, (v?.boot ?? 0.2) + traitSum(info, 'boot')));
}

/** A cabinet's genre, title and licence from the hall's seed, before anything she has done. Pure. */
export function cabinetOf(seed: string | number, loc: Pick<Location, 'id'>, info: HallInfo, key: string, gen = 0): CabinetInfo | undefined {
  const [room, feature] = key.split(':') as [string, string];
  const genre = CAB_FEATURES[feature ?? ''];
  const def = genre ? GENRES[genre] : undefined;
  if (!genre || !def) return undefined;
  const rng = new Rng(`cab:${seed}:${loc.id}:${key}:${gen}`);
  const legal: 'muse' | 'bootleg' = rng.chance(bootChance(info, room)) ? 'bootleg' : 'muse';
  const titles = legal === 'muse' ? def.muse : def.boot;
  const title = info.wild === 'one_game' ? titles[0]! : rng.pick(titles);
  return { key, genre, def, title, legal };
}

/** How tough the cabinet's top score is when nobody has set another: skill-level units, so a respectable player has about 8-20. */
export function champLevel(seed: string | number, loc: Pick<Location, 'id'>, info: HallInfo, key: string): number {
  const rng = new Rng(`champ:${seed}:${loc.id}:${key}`);
  let lvl = 3 + info.tier * 3 + rng.int(0, 9);
  if (info.traits.includes('champion_in_residence') || info.traits.includes('retired_champ')) lvl += 8;
  if (info.traits.includes('record_set')) lvl += 4;
  if (info.wild === 'unbeaten' && key.startsWith('floor:')) lvl += rng.chance(0.25) ? 60 : 0;
  return lvl;
}

/** What a score looks like on the board: a level, written as a number of points. */
export const scoreOf = (lvl: number): number => Math.round(900 * lvl * (1 + lvl / 30)) * 10;

/** Who holds the record when nobody she knows does: an initial triple on the board. */
export const CHAMP_NAMES = ['ACE', 'BOO', 'KAT', 'RAM', 'ZOE', 'DUD', 'MOM', 'JAX', 'LOL', 'NYX', 'TED', 'OMG', 'PIP', 'XIX', 'GGG', 'WOW', 'EEL', 'SUE', 'AAA', 'ROB'];
export const champName = (seed: string | number, loc: Pick<Location, 'id'>, key: string): string => CHAMP_NAMES[new Rng(`champn:${seed}:${loc.id}:${key}`).int(0, CHAMP_NAMES.length - 1)]!;

// ===================================================================== prices

/** What one play costs here right now, before her haggling. Muse's Joy Credits cost more; a bootleg is cheap and cash. */
export function playPrice(info: HallInfo, legal: 'muse' | 'bootleg', sit?: SituationDef): number {
  const v = VARIANTS[info.variant];
  const [lo, hi] = v?.play ?? [3, 6];
  const base = lo + (hi - lo) * ((info.tier - 1) / 4);
  const trait = info.traits.reduce((p, t) => p * (TRAITS[t]?.play ?? 1), 1);
  const side = legal === 'muse' ? 1.35 : 0.65;
  return Math.max(0, Math.round(base * trait * side * (sit?.play ?? 1)));
}

// ===================================================================== the audit

export interface Audit {
  day: number;
  /** World minutes the spider is here, from and to. */
  start: number;
  end: number;
}

/** Does the compliance spider call on this hall on this day, and when? A pure function of the seed and the day. */
export function auditOnDay(seed: string | number, loc: Pick<Location, 'id'>, info: HallInfo, day: number): Audit | undefined {
  const v = VARIANTS[info.variant];
  if (!v || info.wild === 'no_spider') return undefined;
  const rng = new Rng(`audit:${seed}:${loc.id}:${day}`);
  const chance = info.wild === 'spider_home' ? 1 : Math.max(0, Math.min(0.9, v.audit + traitSum(info, 'audit')));
  if (!rng.chance(chance)) return undefined;
  const start = day * MIN_PER_DAY + rng.int(12 * 60 + 30, 23 * 60);
  return { day, start, end: start + rng.int(40, 100) };
}

/** The audit that is under way at this minute, if there is one. */
export function auditNow(w: Pick<World, 'worldSeed' | 'clock'>, loc: Location): Audit | undefined {
  const info = loc.gamehall;
  if (!info) return undefined;
  const a = auditOnDay(w.worldSeed, loc, info, dayOf(w.clock));
  return a && w.clock >= a.start && w.clock < a.end ? a : undefined;
}

// ===================================================================== rolling a hall

export interface RolledHall {
  info: HallInfo;
  name: string;
  blurb: string;
  security: number;
  crowded: boolean;
}

/** Roll one hall. Pure: all of it from `rng`, in a fixed order, so the same street always grows the same hall. */
export function rollHall(rng: Rng, district: District, depth: number): RolledHall {
  const weights = HALL_VARIANT[district];
  const ids = Object.keys(VARIANTS);
  const variant = rng.weighted(ids, (k) => weights[k] ?? 1);
  const v = VARIANTS[variant]!;
  const shell = rng.weighted(Object.keys(SHELLS), (k) => SHELLS[k]!.weight ?? 1);
  const sh = SHELLS[shell]!;
  const size = rng.weighted([0, 1, 2, 3, 4], (i) => [1, 2.6, 3, 1.8, 0.6][i]!);
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
  // Features: the variant's own, the shell's, the traits', the cabinets, a handful from the pool, then each room's own.
  const features: string[] = [];
  const add = (f: string): void => {
    if (!features.includes(f)) features.push(f);
  };
  const has = (f: string): boolean => f.startsWith('floor:') || rooms.includes(f.split(':')[0]!);
  for (const f of v.floor) add(`floor:${f}`);
  for (const f of sh.add ?? []) if (has(f)) add(f);
  for (const t of traits) for (const f of TRAITS[t]!.add ?? []) if (has(f)) add(f);
  // The cabinets on the floor: the variant's weights, one of each kind at most, as many as the size allows.
  const [cLo, cHi] = SIZES[size]!.cabs;
  const wantCabs = Math.min(rng.int(cLo, cHi), Object.keys(GENRES).length);
  const genres = Object.keys(GENRES);
  for (let i = 0; i < wantCabs * 3 && features.filter((f) => f.startsWith('floor:cab_')).length < wantCabs; i++) {
    add(`floor:${GENRES[rng.weighted(genres, (g) => (features.includes(`floor:${GENRES[g]!.feature}`) ? 0 : v.cabs[g] ?? 1))]!.feature}`);
  }
  const pool = Object.keys(FEATURES).filter((f) => !isCab(f) && (FEATURES[f]!.base > 0 || (v.lean[f] ?? 0) > 0));
  const [lo, hi] = SIZES[size]!.features;
  const want = rng.int(lo, hi);
  const others = (): number => features.filter((f) => f.startsWith('floor:') && !f.startsWith('floor:cab_')).length;
  for (let i = 0; i < want * 2 && others() < want; i++) {
    add(`floor:${rng.weighted(pool, (k) => FEATURES[k]!.base + (v.lean[k] ?? 0))}`);
  }
  for (const r of rooms) for (const [f, chance] of ROOMS[r]!.sig) if (rng.chance(chance)) add(`${r}:${f}`);

  const name = rng.pick(v.names);
  const cond = CONDITIONS[condition]!;
  const security = Math.max(0, v.sec + sh.sec + cond.sec + traits.reduce((s, t) => s + (TRAITS[t]!.sec ?? 0), 0) + rng.int(0, 1));
  const crowded = rng.chance(Math.min(0.9, v.crowd * SIZES[size]!.crowd));
  // The blurb: what it is, then one more thing about it (the building, a trait, the Muse wallpaper or its state).
  const extras = [sh.line, ...traits.map((t) => TRAITS[t]!.line), rng.pick(v.wall), cond.line, wild ? WILD[wild]!.line : ''].filter(Boolean);
  const blurb = [rng.pick(v.blurbs), rng.pick(extras)].join(' ');
  return { info: { variant, shell, size, condition, tier, traits, features, rooms, ...(wild ? { wild } : {}) }, name, blurb, security, crowded };
}

/** Name for a room of a hall: "Coin & Cheer's back room", or whatever the variant calls it. */
export function roomTitle(info: HallInfo, hallName: string, room: string): string {
  const v = VARIANTS[info.variant];
  const label = v?.roomNames?.[room] ?? ROOMS[room]?.name ?? room;
  return label.startsWith('the ') ? `${possessive(hallName)} ${label.slice(4)}` : `${possessive(hallName)} ${label}`;
}

/** Features in one room of a hall ("floor" for the main floor). */
export function featuresIn(info: HallInfo, room: string): string[] {
  const prefix = `${room}:`;
  return info.features.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)).filter((f) => FEATURES[f]);
}

// ===================================================================== who is there

const SIZE_CROWD = [1, 2, 4, 6, 9] as const;

/** The people a place wants. Rosters by kind are in roster.ts; an arcade's depend on what it is and which room this is. */
export function hallRoster(loc: Location, p: HallInfo): SlotDef[] {
  const room = loc.hallRoom?.room;
  const crowd = SIZE_CROWD[p.size] ?? 3;
  const slots: SlotDef[] = [];
  if (!room) {
    slots.push({ role: 'hall_owner', count: [1, 1], faction: 'venue', resident: true });
    slots.push({ role: 'hall_attendant', count: [1, 1], chance: 0.8, faction: 'venue', resident: true });
    slots.push({ role: 'hall_regular', count: [Math.max(0, crowd - 2), crowd + 1], ephemeral: true });
    slots.push({ role: 'hall_champion', count: [1, 1], chance: Math.min(0.9, 0.2 + 0.1 * p.tier + (p.traits.includes('champion_in_residence') || p.traits.includes('retired_champ') ? 0.4 : 0)), resident: true });
    slots.push({ role: 'hall_hustler', count: [1, 1], chance: 0.35, ephemeral: true });
    slots.push({ role: 'hall_guard', count: [1, 1], chance: Math.min(0.9, 0.1 + loc.security * 0.12), faction: 'venue', resident: true });
    if (p.variant === 'flagship' || p.traits.includes('joy_partner') || p.traits.includes('joyplus')) slots.push({ role: 'hall_host', count: [1, 2], chance: 0.8, resident: true });
    if (p.traits.includes('stream_rig') || p.traits.includes('streamer_home') || p.traits.includes('influencer_owned')) slots.push({ role: 'hall_streamer', count: [1, 1], chance: 0.7, ephemeral: true });
    slots.push({ role: 'ganger', count: [1, 2], chance: p.traits.includes('gang_front') || p.traits.includes('dead_drop') ? 0.85 : 0.15, faction: 'influence' });
    slots.push({ role: 'cop', count: [1, 1], chance: 0.04 });
    return slots;
  }
  switch (room) {
    case 'office': slots.push({ role: 'hall_attendant', count: [1, 1], chance: 0.5, faction: 'venue', resident: true }); break;
    case 'backroom': slots.push({ role: 'hall_bootlegger', count: [1, 1], faction: 'venue', resident: true }, { role: 'hall_regular', count: [0, 3], ephemeral: true }); break;
    case 'workshop': slots.push({ role: 'hall_tech', count: [1, 1], faction: 'venue', resident: true }); break;
    case 'stage': slots.push({ role: 'hall_regular', count: [1, 5], ephemeral: true }, { role: 'hall_streamer', count: [1, 1], chance: 0.4, ephemeral: true }); break;
    case 'lounge': slots.push({ role: 'hall_regular', count: [0, 3], ephemeral: true }, { role: 'hall_attendant', count: [1, 1], chance: 0.5, faction: 'venue', resident: true }); break;
    case 'cashroom': slots.push({ role: 'hall_guard', count: [1, 1], chance: 0.6, faction: 'venue', resident: true }); break;
    case 'cellar': case 'roof': case 'alley': slots.push({ role: 'street_kid', count: [0, 1], chance: 0.25, ephemeral: true }); break;
    default: break;
  }
  return slots;
}
