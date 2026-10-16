import { Rng } from '../rng';
import { MIN_PER_DAY } from '../clock';
import type { District, Item, Location, PawnInfo, PawnLot, World } from '../types';
import type { SlotDef } from '../roster';
import { CONDITIONS, possessive, type RoomDef } from './gyms';

/**
 * Pawn shops. A pawn shop is not one of a few kinds: it is a point rolled from independent axes, so any combination can
 * turn up (a derelict tier-5 instrument exchange in a flooded crypt that is run by a gang's front and has a parrot who
 * appraises).
 *
 *   variant     what it mostly is (classic, jeweller, instruments...): names, blurbs, what it pays, what it stocks
 *   shell       what building it is in (a bank branch, a tram ticket office, a van...)
 *   size        how many things it has and how many rooms it can grow
 *   condition   derelict .. immaculate (shared with gyms)
 *   tier        1..5: how good the appraiser is, how rich the stock and the till are. Independent of everything else.
 *   traits      0-3 oddities from a long list; they may contradict each other and that is fine
 *   features    objects in rooms; what she can do here hangs off these (see content/pawnafford.ts)
 *   rooms       places behind the front counter (vault, workshop, parlour...)
 *   situation   something happening right now; a pure function of the clock, so it needs no saved state
 *   wild        one shop in twelve has a rule-breaking oddity
 *
 * Every table is open: add a row and it can turn up. Ids that a saved world mentions but the tables no longer know are
 * ignored, never an error. Nothing here is balanced against anything else, on purpose.
 *
 * The shelf (what is for sale, and what she hocked) is state on the shop: see pawnkit.ts. The prices are here.
 */

const pick = <T>(rng: Rng, xs: readonly T[]): T => rng.pick(xs as T[]);

// ===================================================================== placement

/** Chance a street has a pawn shop. Rolled on a stream of its own (see mapgen), so no existing map changes. */
export const PAWN_CHANCE: Record<District, number> = { market: 0.1, nightlife: 0.06, tenement: 0.1, industrial: 0.05, corporate: 0.02, slum: 0.12 };

/** Which kind of pawn shop, by district. Absent means 1. */
export const PAWN_VARIANT: Record<District, Record<string, number>> = {
  market: { classic: 3, jeweller: 3, instruments: 1.5, hardware: 1, chrome: 1, arms: 0.5, collectibles: 3, atlasasset: 1, consignment: 3, stall: 2 },
  nightlife: { classic: 1.5, jeweller: 2, instruments: 4, hardware: 0.4, chrome: 3, arms: 0.8, collectibles: 2, atlasasset: 1, consignment: 2, stall: 1.5 },
  tenement: { classic: 4, jeweller: 1, instruments: 1.5, hardware: 3, chrome: 1, arms: 1, collectibles: 1, atlasasset: 0.8, consignment: 1, stall: 3 },
  industrial: { classic: 2, jeweller: 0.3, instruments: 0.5, hardware: 4, chrome: 3, arms: 3, collectibles: 0.4, atlasasset: 0.6, consignment: 0.3, stall: 2 },
  corporate: { classic: 0.5, jeweller: 3, instruments: 1, hardware: 0.3, chrome: 2, arms: 1, collectibles: 2, atlasasset: 5, consignment: 4, stall: 0.1 },
  slum: { classic: 4, jeweller: 0.5, instruments: 1, hardware: 3, chrome: 1.5, arms: 2, collectibles: 0.5, atlasasset: 0.1, consignment: 0.3, stall: 4 },
};

// ===================================================================== variants

export interface VariantDef {
  label: string;
  /** What fraction of an item's value they pay for it (low, high), before tier, traits and her haggling. */
  offer: [number, number];
  /** Interest per day on a hocked item she wants back, as a fraction of what she was paid. */
  rate: number;
  /** Days an item is held for her, fewest..most. */
  hold: [number, number];
  /** Days it stays on the shelf for retail after the hold, before it is sold on. */
  grace: number;
  /** Retail price as a multiple of an item's value. */
  markup: number;
  names: string[];
  blurbs: string[];
  /** The Atlas wallpaper: a line about how Atlas shows up (or doesn't) on the walls. */
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
  /** What the house keeps on its shelves: item id -> weight. Unknown ids are skipped. */
  stock: Record<string, number>;
}

export const VARIANTS: Record<string, VariantDef> = {
  classic: {
    label: 'hock shop', offer: [0.28, 0.42], rate: 0.06, hold: [3, 7], grace: 3, markup: 1.6, sec: 1, crowd: 0.3,
    names: ['Nine-Lives Hock & Loan', 'Second-Hand Prophet', 'Gimme-Back Pawn', 'Pledge & Pocket', 'The Last Resort Loan Co.', 'Hock Around the Clock', 'Fair Offer Exchange', 'Borrowed Time Pawnbrokers', 'Deal & Dusk', 'Lien On Me Loans', 'Fine Print Pawn', 'Backup Plan Loans', 'Spare Change Collateral', 'Cash for Almost Anything'],
    blurbs: [
      '{name}: a grille, a counter and a window full of other people\'s Tuesdays, each with a tag in biro.',
      '{name}: a bell on the door, a broker behind glass and a smell of dust, brass polish and quiet arithmetic.',
      '{name}: three brass balls over the door that used to mean something and now mean "yes, we are open".',
      '{name}: shelves to the ceiling, every item with a handwritten tag that says what it was worth and what it is now.',
    ],
    wall: ['An Atlas "Asset Wellness Partner" sticker is on the door, slightly crooked, as if applied under protest.', 'A mandatory Atlas serial scanner sits on the counter. The broker keeps a mug on it.'],
    floor: ['counter', 'window_display', 'display_case'], lean: { bargain_bin: 2, grille: 2, notice_board: 1, door_bell: 2, tip_jar: 1 },
    rooms: { office: 0.6, vault: 0.3, workshop: 0.2, showroom: 0.2, parlour: 0.2, bay: 0.25, cellar: 0.25, alley: 0.3 },
    stock: { walkman: 3, gold_tooth: 2, credchip: 2, signet_ring: 2, chrono_watch: 1, brass_horn: 1, torque_wrench: 2, data_slate: 2, pool_cue: 1, switchblade: 1, leather_jacket: 2, snow_globe: 2, vinyl_record: 2, antique_clock: 1, ukulele: 1, mom_photo: 1, plasma_torch: 0.5, zip_pistol: 0.5 },
  },
  jeweller: {
    label: 'jewellery pawn', offer: [0.35, 0.5], rate: 0.05, hold: [5, 10], grace: 4, markup: 1.8, sec: 2, crowd: 0.2,
    names: ['Carat & Stick', 'The Glittering Excuse', 'Gold Standard (Approximately)', 'Loupe & Bloop', 'Hallmark Heist', 'Prong & Pledge', 'Setting Sun Jewellers', 'Rose Gold Rush', 'Carbon Copy Diamonds', 'Ring-a-Ding Hock', 'Bezel & Bezel', 'Karat Cake Jewellery', 'Tick-Tock Pawn', 'Facet Value'],
    blurbs: [
      '{name}: velvet trays, a loupe on a chain and a broker who looks at her wrist before her face.',
      '{name}: glass cases lit like a surgery and every ring has its own small spotlight and its own small story.',
      '{name}: a narrow shop of watches, rings and a rack of chains that are almost certainly gold.',
      '{name}: very quiet, very clean, and everything of value is behind two sheets of something that is not glass.',
    ],
    wall: ['An Atlas Heirloom Registry plaque promises to "reunite families with their valuables". It does not say which families.', 'Every ring tag carries an Atlas serial. The broker covers the ones that matter with a small sticker of a cat.'],
    floor: ['counter', 'jewellery_case', 'display_case', 'scale'], lean: { appraisal_bench: 3, try_on_mirror: 3, antique_clock: 2, grille: 2, cctv_console: 2, serial_scanner: 1 },
    rooms: { office: 0.7, vault: 0.55, workshop: 0.35, showroom: 0.4, cage: 0.1, alley: 0.15 },
    roomNames: { workshop: 'setting room', showroom: 'viewing room' },
    stock: { signet_ring: 3, gold_band: 3, pearl_string: 2, chrono_watch: 3, diamond_stud: 3, gold_tooth: 2, antique_clock: 1 },
  },
  instruments: {
    label: 'instrument exchange', offer: [0.3, 0.45], rate: 0.05, hold: [4, 9], grace: 4, markup: 1.7, sec: 1, crowd: 0.25,
    names: ['The Quiet Chord', 'Fret & Forfeit', 'Second Verse Exchange', 'Hock Rock', 'Brass Knuckle Brass', 'Out-of-Tune Pawn', 'Feedback Loans', 'Bridge & Burn Music', 'Capo & Collateral', 'Amp Up & Out', 'The Lost Note', 'Sustain Pawn', 'Reed & Receipt', 'Tuned-Down Pawn'],
    blurbs: [
      '{name}: a wall of guitars hung by their necks, a drum kit with a sold sticker and a broker who strums while pricing.',
      '{name}: every instrument has been somebody\'s last resort, and several are still in tune with the feeling.',
      '{name}: horns, keys, a tuba in a shopping trolley and a hand-written sign: PLEASE DO NOT PLAY THE EXPENSIVE ONE.',
      '{name}: cables, cases and a practice amp in the corner that has heard the same four chords for eleven years.',
    ],
    wall: ['An Atlas "Noise Reassurance" notice limits amplified playing to 40 decibels, the volume of a very polite argument.', 'A poster for an Atlas Community Talent Hour is pinned up. Nobody has applied. Nobody has ever applied.'],
    floor: ['counter', 'instrument_wall', 'display_case'], lean: { practice_amp: 4, jukebox: 2, notice_board: 2, tip_jar: 2, vending: 1, try_on_mirror: 0.5 },
    rooms: { office: 0.5, vault: 0.25, workshop: 0.5, showroom: 0.3, parlour: 0.3, cellar: 0.3, roof: 0.15 },
    roomNames: { workshop: 'luthier\'s bench', parlour: 'rehearsal back room' },
    stock: { brass_horn: 3, drum_pad: 2, synth_keys: 2, ukulele: 3, vintage_guitar: 0.5, vinyl_record: 2, walkman: 1 },
  },
  hardware: {
    label: 'tool and kit exchange', offer: [0.3, 0.4], rate: 0.07, hold: [3, 6], grace: 2, markup: 1.5, sec: 1, crowd: 0.2,
    names: ['Torque & Take', 'Spanner in the Works Loans', 'Nuts, Bolts & Debts', 'Tool-Shed Hock', 'Rust & Redemption', 'The Rented Drill', 'Wrench Pledge', 'Sparks & Spares', 'Claw & Pawn', 'Level Best Loans', 'Plumb Line Pawn', 'Gauge & Gouge', 'Used Voltage', 'Bit & Brace Exchange'],
    blurbs: [
      '{name}: a wall of hung tools, a counter made from a door and a broker who knows every torque by its first name.',
      '{name}: crates of cable, tins of screws and a very large wrench that is, on balance, a threat.',
      '{name}: everything here has been used to fix something that is still broken.',
      '{name}: orange light, a hum of old extension cords and a notice that says NO, YOU CANNOT TRY THE DRILL.',
    ],
    wall: ['An Atlas "Defensive Tools Only" poster explains which spanners are for defence. All of them, apparently.', 'A mandatory Atlas safety label is stuck on every blade. The labels are the sharpest things in the shop.'],
    floor: ['counter', 'tool_wall', 'bargain_bin'], lean: { repair_bench: 2, scrap_bin: 3, junk_pile: 2, grille: 1.5, loading_door: 1, scale: 1 },
    rooms: { office: 0.4, vault: 0.2, workshop: 0.75, bay: 0.5, cellar: 0.35, roof: 0.1, alley: 0.35 },
    roomNames: { workshop: 'bench room', bay: 'trade counter' },
    stock: { torque_wrench: 3, plasma_torch: 2, solder_kit: 3, lockpick_set: 2, scrap_metal: 3, cleaver: 1, excalibur: 1, pool_cue: 1, drone_core: 0.4 },
  },
  chrome: {
    label: 'chrome buy-back', offer: [0.4, 0.55], rate: 0.08, hold: [3, 6], grace: 3, markup: 1.9, sec: 2, crowd: 0.3,
    names: ['Chrome Hearts Buyback', 'Second-Skin Exchange', 'Implant Bargain', 'Spare Parts Pawn', 'Wetware Wants Cash', 'Upgrade Undo', 'Gigabyte Hock', 'Optic Exchange 24', 'Bionic Buyback', 'Used Augment Mart', 'Servo & Sell', 'Neural Net Loans', 'Metal Mercy Pawn', 'Cache & Carry'],
    blurbs: [
      '{name}: rows of boxed lenses, a shelf of limbs under a dust sheet and a counter that scans her at the door.',
      '{name}: a clinical little shop where everyone has paid in instalments for something they now want rid of.',
      '{name}: bright, cold and humming, with a sign that says WE BUY WHAT YOU OUTGREW.',
      '{name}: chrome on every shelf, and a broker whose left hand is for sale.',
    ],
    wall: ['An Atlas "Upgrade Responsibly" sticker is on every limb. Every limb has a serial. Every serial has a database.', 'An Atlas Compliance kiosk offers "buy-back protection" for implants she has not yet regretted.'],
    floor: ['counter', 'chrome_shelf', 'display_case', 'serial_scanner'], lean: { cctv_console: 2, vending: 1.5, appraisal_bench: 2, grille: 2, scale: 1, try_on_mirror: 1.5 },
    rooms: { office: 0.6, vault: 0.4, workshop: 0.5, showroom: 0.3, cage: 0.45, bay: 0.3, cellar: 0.2 },
    roomNames: { workshop: 'fitting bay', cage: 'cold store', showroom: 'demo room' },
    stock: { spare_forearm: 2, optic_lens: 2, data_slate: 3, vr_visor: 2, memory_shard: 2, neural_gum: 1, drone_core: 1, arc_gauntlet: 0.4 },
  },
  arms: {
    label: 'weapons locker', offer: [0.35, 0.5], rate: 0.07, hold: [3, 6], grace: 3, markup: 1.8, sec: 3, crowd: 0.15,
    names: ['Safe Hands Securities', 'Lock, Barrel & Pledge', 'The Licensed Locker', 'Calibre Credit', 'Bullet Pointless', 'Hammer & Tong Holdings', 'Last Stand Loans', 'Barrel & Bond', 'Trigger-Happy Collateral', 'Blunt & Sharp Exchange', 'Holster & Hold', 'Standing Order Pawn', 'Magazine Money', 'Ricochet Loans'],
    blurbs: [
      '{name}: a cage behind the counter, a grille on the door and a broker who has a licence for everything but mirth.',
      '{name}: racks, a case of knuckledusters labelled "gloves" and a sign that says all weapons are decorative.',
      '{name}: quiet, tidy, very secure, and every item has been explained to her twice in writing.',
      '{name}: steel shutters, a buzzer, and a safety lecture that is a plain threat in a nicer tone of voice.',
    ],
    wall: ['Every firearm carries an Atlas "THIS IS A DEFENSIVE TOOL" sticker. The sticker is the only part that has been tested.', 'A wing-and-halo stencil above the cage says PROTECTED. It does not say from what.'],
    floor: ['counter', 'grille', 'gun_rack'], lean: { cctv_console: 3, serial_scanner: 2, scale: 1, display_case: 1, notice_board: 1 },
    rooms: { office: 0.6, vault: 0.4, workshop: 0.3, bay: 0.4, cage: 0.85, cellar: 0.3 },
    roomNames: { cage: 'armoury', bay: 'goods-in' },
    stock: { switchblade: 2, zip_pistol: 2, service_pistol: 1.5, arc_gauntlet: 1, stunner_mk3: 0.5, riot_shotgun: 0.4, kevlar_duster: 1.5, riot_vest: 1, cleaver: 1, judgment: 0.5, speed_gloves: 1, rail_revolver: 0.2 },
  },
  collectibles: {
    label: 'collectibles dealer', offer: [0.25, 0.4], rate: 0.04, hold: [6, 12], grace: 5, markup: 2.0, sec: 1, crowd: 0.2,
    names: ['Mint-in-Box Memorabilia', 'Provenance Pending', 'Nostalgia Nook', 'Relic & Receipt', 'Autograph Agency (Unverified)', 'Curio & Cash', 'Dust Is Value', 'The Maybe-Original', 'Variant Cover Hock', 'Pre-Fall Pawn', 'Authentic-ish', 'Signed, Probably', 'Shelf Life Collectibles', 'Rare as Rent'],
    blurbs: [
      '{name}: a wall of posters in sleeves, a case of toy cars and a broker who uses the word "provenance" like a weapon.',
      '{name}: every item has a story, and the stories do not match the tags.',
      '{name}: shelves of things that mattered to someone, and a very polite sign saying nothing here is a toy.',
      '{name}: glass, dust, a plastic crown and a rope that has been roped off for no reason she can find.',
    ],
    wall: ['An Atlas "Cultural Heritage Partner" plaque. The partner is a sticker. The heritage is a poster of a dragon in a hat.', 'The Atlas authenticity seal on every item is a hologram of the same item, which is not how holograms work.'],
    floor: ['counter', 'curio_shelf', 'display_case', 'trophy_wall'], lean: { window_display: 2, formal_rail: 1, stuffed_thing: 3, antique_clock: 2, mannequin: 2, returns_box: 1 },
    rooms: { office: 0.5, vault: 0.5, showroom: 0.4, workshop: 0.25, parlour: 0.2, cellar: 0.3, roof: 0.1 },
    roomNames: { vault: 'strongroom', showroom: 'the good room' },
    stock: { signed_poster: 3, prop_sword: 2, vinyl_record: 3, trading_cards: 2, match_shirt: 2, antique_clock: 2, snow_globe: 2, stuffed_gull: 2, champ_belt: 0.4, vintage_guitar: 0.3 },
  },
  atlasasset: {
    label: 'Atlas asset franchise', offer: [0.2, 0.3], rate: 0.12, hold: [2, 4], grace: 2, markup: 2.2, sec: 4, crowd: 0.35,
    names: ['Safe-T Asset Partner (Branch 2,206)', 'Atlas Asset Wellness Hub', 'Bastion Collateral Care', 'Halcyon Holdings Kiosk', 'Aegis Asset Reassurance', 'Care+ Valuables Plan', 'Plus-Tier Pledge Point', 'Premier Possessions Protection', 'Basic Valuation (Basic Tier)', 'Safe-T Exchange Reassurance', 'Comfort Collateral', 'Reassurance Ledger Branch 9', 'Safe-T Stash & Swap', 'Atlas Heirloom Hub'],
    blurbs: [
      '{name}: white counters, soft music, a camera over every shelf and an app that has already priced her coat.',
      '{name}: a franchise in the sense that it franchises; the smiling clerk says "welcome back" to someone she is not.',
      '{name}: every item is scanned, logged and protected; the protection is a fee, and the fee has tiers.',
      '{name}: bright, tidy and reassuring, and every offer is within one percent of what she was already going to accept.',
    ],
    wall: ['Every shelf carries an Atlas wing-and-halo and a Wellness Score for the object on it.', 'A banner says "Atlas cares about your possessions." A second, smaller banner says terms apply.'],
    floor: ['counter', 'serial_scanner', 'cctv_console', 'display_case', 'partner_portal'], lean: { vending: 2, queue_rope: 3, try_on_mirror: 1.5, notice_board: 1, door_bell: 0 },
    rooms: { office: 0.8, vault: 0.5, showroom: 0.4, cage: 0.35, bay: 0.3 },
    roomNames: { office: 'Customer Care Office', vault: 'Protection Suite', cage: 'Secure Reassurance Cage' },
    stock: { atlas_umbrella: 3, chrono_watch: 2, data_slate: 2, vr_visor: 2, walkman: 1, leather_jacket: 1, kevlar_duster: 1, credchip: 1, snow_globe: 1 },
  },
  consignment: {
    label: 'consignment boutique', offer: [0.45, 0.6], rate: 0.03, hold: [8, 14], grace: 6, markup: 1.5, sec: 1, crowd: 0.25,
    names: ['Second-Chance Boutique', 'Velvet & Vintage Consignment', 'Gently Used Glamour', 'The Pre-Loved Parlour', 'Hand-Me-Up Couture', 'Tag & Return', 'Once Worn, Once Loved', 'Second-Glance Gallery', 'Consigned & Confident', 'Sold on Sunday', 'Rack & Reason', 'Fair Share Finery', 'Twice-Told Boutique', 'Cut & Commission'],
    blurbs: [
      '{name}: rails of coats, a mirror in a gilt frame and a proprietor who says "we do not call it a pawn shop" in three different tones.',
      '{name}: soft light, scented candles, and a rack of leather that has been through more than she has.',
      '{name}: very pleasant, very civilised, and every garment has a small tag with a very precise sum on it.',
      '{name}: a curtain for changing, a bell for the till and a cabinet of "estate pieces" that have been priced by a very patient aunt.',
    ],
    wall: ['An Atlas "Responsible Reuse" window sticker, and under it a rack of last season\'s Atlas-issue jackets nobody is allowed to say anything about.', 'An Atlas "Style Compliance" scanner by the door checks her coat against a list. She passes, which is the insult.'],
    floor: ['counter', 'formal_rail', 'try_on_mirror', 'display_case'], lean: { jewellery_case: 2, mannequin: 3, curio_shelf: 1.5, tip_jar: 1, antique_clock: 1, door_bell: 2, umbrella_stand: 2 },
    rooms: { office: 0.5, vault: 0.2, showroom: 0.55, workshop: 0.25, cellar: 0.25, alley: 0.2 },
    roomNames: { workshop: 'alterations room', showroom: 'fitting salon' },
    stock: { pearl_string: 2, signet_ring: 2, leather_jacket: 3, kevlar_duster: 1, antique_clock: 1, synth_keys: 1, signed_poster: 1, diamond_stud: 2, champ_vest: 1, atlas_umbrella: 1 },
  },
  stall: {
    label: 'van stall', offer: [0.3, 0.45], rate: 0.09, hold: [2, 5], grace: 2, markup: 1.4, sec: 0, crowd: 0.4,
    names: ['Van Hock', 'Rolling Pledge', 'Tail-Gate Pawn', 'Drive-By Deals', 'The Wandering Loan', 'Boot-Sale Brokers', 'Mobile Collateral', 'Pawn on Wheels', 'Exhaust & Exchange', 'Traffic-Cone Trading', 'Back of the Van', 'Hock & Roll', 'Axle & Anvil', 'Park & Pledge'],
    blurbs: [
      '{name}: the back of a van, a folding table and a laminated sign that says WE BUY GOLD, GADGETS AND GRIEVANCES.',
      '{name}: a hatchback with the boot open, a tarp full of objects and a broker on a camping chair.',
      '{name}: wherever it parked last night, with the engine on in case of questions.',
      '{name}: a stall off a tailgate, all of it loose and some of it warm.',
    ],
    wall: ['The van has an Atlas "Approved Trader" sticker on the bumper, and nothing about it is approved or traded as such.', 'A little Atlas drone circles overhead, issuing a polite fine to the van. The van pays in coins and does not look up.'],
    floor: ['counter', 'bargain_bin', 'loading_door'], lean: { junk_pile: 3, notice_board: 1, tip_jar: 2, vending: 1, door_bell: 0, window_display: 0.5 },
    rooms: { bay: 0.4, alley: 0.45, cellar: 0.05 },
    roomNames: { bay: 'cab', alley: 'the next pitch' },
    stock: { walkman: 2, gold_tooth: 2, credchip: 2, scrap_metal: 2, snow_globe: 1, stuffed_gull: 2, atlas_umbrella: 2, vinyl_record: 1, mom_photo: 1, eyeballs: 1, brass_horn: 1, signet_ring: 1, switchblade: 1 },
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
  bank: { label: 'a shuttered bank branch', line: 'A shuttered bank branch: the teller windows are the counter, and the vault door is a footnote.', sec: 3, rooms: { vault: 3, office: 1.5, cellar: 0.5, roof: 0 }, add: ['vault:vault_door'] },
  laundromat: { label: 'the back half of a laundromat', line: 'The back half of a laundromat, where the machines still turn and the shelves are dusty with softener.', sec: 0, rooms: { bay: 1.5, workshop: 1.2, cellar: 1.3 }, add: ['floor:door_bell'] },
  container: { label: 'a shipping container', line: 'A shipping container with a door cut in the side, a counter welded to it and a fan in the roof.', sec: 1, rooms: { vault: 0.2, showroom: 0, roof: 2, bay: 1.5, cellar: 0 }, add: ['floor:grille'] },
  tram: { label: 'an old tram ticket office', line: 'An old tram ticket office: the counter is the ticket window and the tram times are still on the wall.', sec: 1, rooms: { office: 1.3, cellar: 1.5, vault: 0.5 }, add: ['floor:antique_clock', 'floor:grille'] },
  betting: { label: 'a closed-down betting shop', line: 'A closed-down betting shop: the screens are dead, the counter is a till bank, and the odds are still chalked on the wall.', sec: 1, rooms: { parlour: 2, office: 1.2 }, add: ['floor:notice_board', 'floor:grille'] },
  crypt: { label: 'a church crypt', line: 'A church crypt: arched stone, low light and a hush that makes every price sound like a confession.', sec: 0, rooms: { vault: 2, cellar: 2.5, roof: 0, vents: 0.3 }, add: ['floor:umbrella_stand'] },
  carpark: { label: 'the ground floor of a car park', line: 'The ground floor of a car park, partitioned with shelving and one buzzing tube light.', sec: 0, rooms: { bay: 2, roof: 1.5, vents: 1.5, showroom: 0.3 }, add: ['floor:loading_door'] },
  shopfront: { label: 'a tenement shopfront', line: 'A tenement shopfront: a flat above, a bell that rings upstairs and a shutter that goes up with a groan.', sec: 0, rooms: { cellar: 1.5, roof: 1.5, alley: 1.5 }, add: ['floor:door_bell'] },
  atlaskiosk: { label: 'a decommissioned Atlas kiosk', line: 'A decommissioned Atlas kiosk, with the wing-and-halo painted over badly and the cameras left on.', sec: 2, rooms: { office: 0.5, vault: 0.5, bay: 0.5, showroom: 0.3 }, add: ['floor:cctv_console', 'floor:serial_scanner'] },
  boxoffice: { label: 'an old cinema box office', line: 'An old cinema box office: the ticket window is the counter and the posters are for films that no longer exist.', sec: 1, rooms: { showroom: 1.5, office: 1.3, cellar: 1.5 }, add: ['floor:window_display', 'floor:grille'] },
  ferry: { label: 'a ferry-terminal kiosk', line: 'A ferry-terminal kiosk, salt on the windows, a timetable for boats that stopped running in the Fall.', sec: 0, rooms: { bay: 1.5, roof: 1.5, cellar: 0.2 }, add: ['floor:antique_clock', 'floor:door_bell'] },
  arch: { label: 'a market stall under a railway arch', line: 'A market stall under a railway arch: every train is a tremor, every tremor is a sale.', sec: 0, rooms: { bay: 1.2, alley: 2, office: 0.3, vault: 0.2, showroom: 0 }, add: ['floor:bargain_bin'] },
};

// ===================================================================== size

/** (how many floor features roll, how many rooms at most) */
export const SIZES = [
  { label: 'closet', features: [2, 3], rooms: 1, crowd: 0.7, shelf: [3, 5] },
  { label: 'small', features: [4, 6], rooms: 2, crowd: 0.9, shelf: [5, 8] },
  { label: 'medium', features: [7, 9], rooms: 4, crowd: 1, shelf: [8, 12] },
  { label: 'large', features: [10, 13], rooms: 6, crowd: 1.2, shelf: [12, 18] },
  { label: 'sprawl', features: [14, 18], rooms: 9, crowd: 1.5, shelf: [18, 26] },
] as const;

// ===================================================================== traits

export interface TraitDef {
  label: string;
  /** A sentence that can turn up in the blurb. */
  line: string;
  weight?: number;
  /** Multiplier on what they pay for things. */
  offer?: number;
  /** Multiplier on retail prices. */
  price?: number;
  /** Multiplier on daily interest. */
  rate?: number;
  /** Days added to how long things are held. */
  hold?: number;
  sec?: number;
  /** Features it adds ("room:feature"). */
  add?: string[];
  /** Variants it fits (absent = any). */
  only?: string[];
}

export const TRAITS: Record<string, TraitDef> = {
  // ownership
  fence_front: { label: 'a fence\'s front', line: 'The broker never asks where anything came from, and the shelf is a little too fresh.', sec: 1, offer: 1.2, add: ['bay:loading_door', 'office:ledger'] },
  fighter_owned: { label: 'run by a retired fighter', line: 'The owner\'s old title belt hangs behind the counter, in a case with a lock and a very faded sticker.', add: ['floor:trophy_wall'] },
  atlas_owned: { label: 'quietly Atlas-owned', line: 'The lease is Atlas. Everyone knows. Nobody says. The scanner is the new carpet.', sec: 2, offer: 0.85, add: ['floor:cctv_console', 'floor:serial_scanner'] },
  old_family: { label: 'a very old family business', line: 'Four generations of the same family have priced the same shelf; the portrait behind the counter is looking at her.', price: 1.15, add: ['floor:antique_clock', 'floor:trophy_wall'] },
  trust: { label: 'run by a trust of customers', line: 'A rota on the wall says whose turn it is to mind the till, and it is scrupulously fair.', offer: 1.1, rate: 0.6, add: ['floor:notice_board'] },
  squatted: { label: 'squatted', line: 'Nobody owns it. Everybody pays someone, and it is not clear who.', offer: 0.8, price: 0.8, sec: -1 },
  influencer_owned: { label: 'owned by an influencer', line: 'A ring light is bolted to the ceiling, and every item gets a short, loving video before it is priced.', price: 1.4, add: ['floor:stream_rig'] },
  // tone
  parrot_appraiser: { label: 'a parrot that appraises', line: 'A parrot on the counter calls out a price for everything that comes in. It is, annoyingly, close.', add: ['floor:parrot'] },
  hygienic: { label: 'obsessively hygienic', line: 'Every item is wiped before it is priced, and some of them have been wiped out of existence.', price: 1.1, add: ['floor:umbrella_stand'] },
  as_is: { label: '"as is, as was"', line: 'A sign on every item says AS IS, AS WAS, in a font that suggests the owner has been sued.', price: 0.85, rate: 1.1 },
  silent: { label: 'a silent shop', line: 'Nobody speaks. Prices are held up on a card. The card is polite and absolutely final.', price: 1.05 },
  themed: { label: 'a themed shop', line: 'Everything in it is on a single joke, and the joke is on every tag.', price: 1.1 },
  sponsored: { label: 'sponsored by a beverage', line: 'Every surface is branded with a fizzy drink she has never heard of; the till is a vending machine.', price: 0.9, add: ['floor:vending'] },
  // access
  cash_only: { label: 'cash only', line: 'A sign says CASH ONLY, and underneath, CASH MEANS CASH.', offer: 1.1, add: ['floor:grille'] },
  no_cameras: { label: 'no cameras', line: 'There are no cameras, and a notice with a drawing of a camera with a line through it.', sec: -1, offer: 1.1 },
  members_only: { label: 'members only', line: 'A velvet rope and a tablet decide who she is.', price: 1.3, offer: 1.1, add: ['floor:queue_rope'] },
  open_all_night: { label: 'open all night', line: 'The lights never go off; neither do the people with things to sell.', offer: 1.05 },
  store_credit: { label: 'store credit only', line: 'Everything pays out in store credit. The credit is in cash, but the speech is in credit.', offer: 1.25, price: 0.9 },
  tab_system: { label: 'a tab system', line: 'Everyone has a tab; the tab has everyone.', rate: 0.8, add: ['office:ledger'] },
  // scene
  famous_hock: { label: 'where a famous thing was hocked', line: 'A famous thing was hocked here once; there is a wall about it, and a bigger wall about where it went.', price: 1.25, add: ['floor:trophy_wall', 'floor:curio_shelf'] },
  being_sold: { label: 'about to be sold', line: 'A SOLD sign leans against the counter, and the broker keeps turning it face down.', price: 0.8, offer: 0.9 },
  feud: { label: 'in a feud with the shop across the road', line: 'A rival pawn shop\'s window card has been defaced in this one\'s colours, and then vice versa.', add: ['floor:notice_board'] },
  inspected: { label: 'an Atlas inspection regular', line: 'An Atlas inspector turns up on a schedule published in advance, and the shop is spotless on those days only.', sec: 1, add: ['floor:cctv_console', 'floor:serial_scanner'] },
  gang_drop: { label: 'a gang\'s drop', line: 'A crew in matching jackets owns the back corner, and nobody has priced what is in it.', sec: 1, offer: 1.1, add: ['bay:loading_door'] },
  collectors_cult: { label: 'a cult of collectors', line: 'Every regular here has the same gloves and the same quiet fanaticism; the waiting list has a waiting list.', price: 1.4 },
  // kit
  appraisal_bench: { label: 'a proper appraisal bench', line: 'A bench with a lamp, a scale, a loupe and an air of a laboratory that has never found anything out.', add: ['floor:appraisal_bench', 'floor:scale'] },
  robot_clerk: { label: 'a robot clerk', line: 'The clerk is a robot, and the robot has a name tag, a lanyard and a smile painted on.', add: ['floor:serial_scanner'] },
  streaming: { label: 'live-streamed', line: 'A camera on a swivel streams the counter, for an audience of nine.', add: ['floor:stream_rig'] },
  huge_safe: { label: 'a huge safe', line: 'A safe the size of a wardrobe sits in the office, and everybody assumes it is empty.', sec: 1, add: ['office:safe'] },
  deep_vault: { label: 'a deep vault', line: 'A vault goes down further than the building does.', sec: 1, add: ['vault:vault_door', 'vault:safe'] },
  pigeon_coop: { label: 'a rooftop pigeon coop', line: 'There are pigeons on the roof, and the pigeons run the roof.', add: ['roof:pigeon_coop'] },
  mirror_showroom: { label: 'a mirrored showroom', line: 'A room of mirrors makes the stock look double and her look worried.', add: ['showroom:try_on_mirror'] },
  amp_corner: { label: 'an amp corner', line: 'There is a practice amp in the corner with a handwritten sign: TRY IT. NOT THAT LOUD.', add: ['floor:practice_amp'] },
  // quirks
  remembers_everything: { label: 'a broker who remembers everything', line: 'The broker says "you were here on a Tuesday, in a green jacket, and you owe me 4nd" and is right about all three.', offer: 0.95, add: ['office:ledger'] },
  dead_language: { label: 'labelled in a dead language', line: 'All the tags are in a language nobody speaks, and every price is in a unit nobody uses.', price: 1.1 },
  cursed_currency: { label: 'tokens only', line: 'Prices are in shop tokens, minted nowhere, spent everywhere.', offer: 0.9 },
  shop_pet: { label: 'a shop pet', line: 'The broker has an extremely large pet, asleep in an extremely small basket.', add: ['floor:shop_cat'] },
  no_returns: { label: 'a "no returns" tattoo', line: 'The broker has NO RETURNS tattooed on a forearm, and it is not a joke the broker is in on.', price: 1.1, hold: -1 },
  big_clock: { label: 'a very loud clock', line: 'A clock the size of a door ticks over the till, and every sale is on the beat.', add: ['floor:antique_clock'] },
  weigh_all: { label: 'weighs everything', line: 'Everything that comes through the door is weighed first, on principle, including the people.', add: ['floor:scale'] },
  haggle_welcome: { label: 'haggling welcome', line: 'A sign says NO PRICE IS FINAL. A smaller sign says THAT SIGN IS ALSO NOT FINAL.', offer: 1.1 },
  no_haggle: { label: 'no haggling, ever', line: 'A sign says NO HAGGLING in four languages and a drawing of a fist.', price: 1.1 },
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
  /** Multiplier on what they pay for things. */
  offer?: number;
  /** Multiplier on retail prices. */
  price?: number;
  fame?: number;
  purse?: number;
}

export const SITUATIONS: Record<string, SituationDef> = {
  forfeit_sale: { label: 'a forfeit sale this week', line: 'A hand-written banner says FORFEIT SALE: EVERYTHING MUST GO, and it has said that since the week before.', weight: 3, tags: ['sale'], price: 0.6 },
  serial_sweep: { label: 'an Atlas serial-number sweep', line: 'An Atlas sweep is running: every item is scanned twice, and the broker is smiling the way people smile at a tax form.', weight: 2, tags: ['inspector', 'sweep'], offer: 0.8 },
  hot_goods: { label: 'a rival\'s hot goods in the back', line: 'There is a crate in the back with a new lock, and nobody is saying whose it is.', weight: 2, tags: ['hot_goods'] },
  celeb_guitar: { label: 'a celebrity\'s guitar is in the window', line: 'A guitar that was famous last week is in the window with a very large number on a very small card.', weight: 1.5, tags: ['celebrity'], price: 1.3, fame: 1.5 },
  collector: { label: 'a gang collecting', line: 'Two people in matching jackets are standing very close to the broker.', weight: 2, tags: ['collector'] },
  vault_flood: { label: 'the vault is flooded', line: 'The vault has an inch of water and a broker with a mop and a face like a closed ledger.', weight: 1, tags: ['flood'], not: ['stall'] },
  quiet_week: { label: 'a "buy nothing" week', line: 'A banner says BUY NOTHING WEEK. The broker is not smiling, and has put the prices down regardless.', weight: 1.5, tags: ['quiet'], offer: 0.8, price: 0.85 },
  ring_rush: { label: 'a wedding-ring rush', line: 'A queue of people with small boxes and large faces. The broker is working at speed.', weight: 1, tags: ['rush'], offer: 1.15 },
  heist_case: { label: 'a heist being cased', line: 'A group at the window is pretending to look at the watches, and is looking at the door hinges.', weight: 1, tags: ['heist'] },
  power_cut: { label: 'a power cut', line: 'The lights are out: the scanner is dead, the till is a biscuit tin and everyone is lit by a torch.', weight: 1.5, tags: ['dark', 'power_cut'], offer: 0.9 },
  lost_dog: { label: 'a lost dog', line: 'A small dog is under the counter, and a poster promises a reward.', weight: 1, tags: ['lost_dog'] },
  clear_out: { label: 'a house clear-out', line: 'A van\'s worth of boxes from a house clearance are on the counter. Someone is going through them carefully, with a very small pencil.', weight: 1, tags: ['clear_out'], offer: 1.1 },
  stock_take: { label: 'a stock-take', line: 'The broker is counting every item aloud, from the top, and has been since morning.', weight: 1.5, tags: ['stocktake'] },
  auction_night: { label: 'an auction night', line: 'Chairs are out and a gavel is on the counter; the broker has put on a tie.', weight: 1, tags: ['auction'], price: 1.3, purse: 1.4 },
  raid_rumour: { label: 'a raid is rumoured', line: 'Everyone is whispering about a raid, and the broker has hidden something in the umbrella stand.', weight: 1.5, tags: ['raid', 'gossip'] },
  new_broker: { label: 'a new broker on trial', line: 'A new broker is on the counter, very eager and very wrong about almost everything.', weight: 1.5, tags: ['new_broker'], offer: 1.3 },
  shipment: { label: 'a shipment has just come in', line: 'Crates are being unpacked behind the counter, and the shelves have things on them that were not there yesterday.', weight: 1.5, tags: ['shipment'], price: 0.9 },
  tourists: { label: 'a tourist coach outside', line: 'A coach of tourists in matching hats has been let loose on the shelves; the prices have gone up to meet them.', weight: 1, tags: ['tourists'], price: 1.4, not: ['atlasasset'] },
  rumours: { label: 'a lot of whispering', line: 'Everyone is whispering, and none of them will say what about.', weight: 2, tags: ['gossip'] },
  wellness_week: { label: 'Safe-T asset wellness week', line: 'Atlas asset wellness week: free pamphlets, free reassurance, and a clipboard at every shelf.', weight: 1, tags: ['inspector', 'wellness_week'], not: ['stall'] },
};

/** A pure function of the clock: the same shop is in the same situation until the epoch turns over. No saved state. */
export function situationAt(w: Pick<World, 'worldSeed' | 'clock'>, loc: Location): { id: string; def: SituationDef } | undefined {
  const p = loc.pawn;
  if (!p) return undefined;
  const epoch = Math.floor(w.clock / (MIN_PER_DAY * 2));
  const rng = new Rng(`pawnsit:${w.worldSeed}:${loc.id}:${epoch}`);
  if (!rng.chance(0.6)) return undefined;
  const ids = Object.keys(SITUATIONS).filter((id) => !SITUATIONS[id]!.not?.includes(p.variant) && !(id === 'vault_flood' && !p.rooms.includes('vault')));
  const id = rng.weighted(ids, (k) => SITUATIONS[k]!.weight);
  return { id, def: SITUATIONS[id]! };
}

// ===================================================================== wild cards

export const WILD: Record<string, { label: string; line: string; weight: number }> = {
  savant: { label: 'a broker who is always right', line: 'The broker has never been wrong about a price. This has not made anyone happier.', weight: 2 },
  boomerang: { label: 'an item that comes back', line: 'One thing on the shelf has been sold nineteen times. It is always back by morning, and it is always cheaper.', weight: 2 },
  sting: { label: 'a sting', line: 'The scanner is a very good one. The broker is very friendly, and the friendliness is a script.', weight: 1.5 },
  famous_vault: { label: 'one famous person\'s things', line: 'Rumour says the strongroom holds everything one very famous person ever owned, and a lot of it is not labelled.', weight: 1.5 },
  counterfeit: { label: 'the counterfeit shop that beats the real thing', line: 'Everything here is a copy, and the copies are better. Only the tags are honest, and only some of them.', weight: 1.5 },
  fire_sale: { label: 'a fire sale that never ends', line: 'The banner has said EVERYTHING MUST GO for eleven years, and the shelves have never been fuller.', weight: 1.5 },
  bottomless: { label: 'a bottomless till', line: 'Nobody has ever seen the till empty. Nobody has ever asked where it fills from.', weight: 1.5 },
  trap_shop: { label: 'every display is a trap', line: 'Every case is wired, every drawer is weighted, every mannequin has a hand on something. It was built by a very careful person.', weight: 1 },
};

// ===================================================================== rooms and features

export const ROOMS: Record<string, RoomDef> = {
  office: { name: 'office', label: 'the office', base: 0.5, gate: 'guarded', hidden: 0, sec: 2, cameras: 1, blurbs: ['{name}: a desk, a ledger, a safe with a sticker that says SAFE and the smell of an old cigar and an older argument.', '{name}: a tiny office with a big desk, and a window onto the shop floor that goes one way.'], sig: [['ledger', 0.9], ['safe', 0.55], ['ledger_terminal', 0.4], ['cctv_console', 0.35]] },
  vault: { name: 'vault', label: 'a heavy door marked STAFF', base: 0.3, gate: 'locked', hidden: 0.5, sec: 3, cameras: 1, blurbs: ['{name}: steel shelves, a smell of cold metal and a thousand small tags in biro, each one a bad week.', '{name}: a room of items nobody has come back for, each in a numbered bag and each, a little, watching.'], sig: [['vault_door', 0.8], ['safe', 0.5], ['layaway_shelf', 0.7], ['scale', 0.3]] },
  workshop: { name: 'workshop', label: 'the workshop', base: 0.3, gate: null, hidden: 0, sec: 0, cameras: 0, blurbs: ['{name}: a bench, a lamp, a soldering iron and a radio that has only ever been on one station.', '{name}: tools hung on a wall by outline, and a broken thing on the bench that someone is being very patient with.'], sig: [['repair_bench', 1], ['scrap_bin', 0.6], ['junk_pile', 0.4]] },
  showroom: { name: 'showroom', label: 'the showroom', base: 0.25, gate: null, hidden: 0, sec: 0, cameras: 2, blurbs: ['{name}: glass cases, mirrors, a carpet that has opinions about shoes and a velvet rope that does not hold anyone.', '{name}: the nice room, where the good things are laid out like a funeral for a coat.'], sig: [['display_case', 1], ['try_on_mirror', 0.6], ['jewellery_case', 0.4], ['mannequin', 0.4]] },
  parlour: { name: 'back parlour', label: 'a beaded curtain', base: 0.2, gate: null, hidden: 0.4, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: a card table, a hanging lamp and a stack of chairs that has not moved since Tuesday.', '{name}: smoke, a radio and a conversation that stops when the curtain moves.'], sig: [['card_table', 1], ['jukebox', 0.3], ['dartboard', 0.3], ['pool_table', 0.25], ['bin_fire', 0.05]] },
  bay: { name: 'loading bay', label: 'the loading door', base: 0.25, gate: null, hidden: 0, sec: 0, cameras: 1, blurbs: ['{name}: a shutter, a trolley and a stack of crates with labels that say nothing at all.', '{name}: a van-sized gap with a pallet jack, a ramp and a person who is very busy not looking at her.'], sig: [['loading_door', 1], ['scrap_bin', 0.4], ['junk_pile', 0.4]] },
  cellar: { name: 'cellar', label: 'a stairwell down', base: 0.2, gate: null, hidden: 0.3, sec: 0, cameras: 0, blurbs: ['{name}: a low room of pipes and boxes, a smell of damp card and one strip light that comes and goes.', '{name}: stairs, then crates, then more crates, and a hum from something that was not meant to hum.'], sig: [['junk_pile', 0.6], ['hatch', 0.5], ['vent_grille', 0.3], ['layaway_shelf', 0.3]] },
  roof: { name: 'roof', label: 'a ladder to the roof', base: 0.1, gate: null, hidden: 0.2, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: tar, tarps, a water tank and the whole district laid out below.', '{name}: a rooftop with a view, a rusted chair and a very large tin full of cigarette ends.'], sig: [['skylight', 0.7], ['pigeon_coop', 0.3]] },
  vents: { name: 'crawlspace', label: 'a vent grille', base: 0.08, gate: 'jump', hidden: 0.9, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: a metal tube with a draught, a lot of dust and a view of the counter through a grille.', '{name}: a crawlspace along the ceiling, with a line of sight to every case.'], sig: [['vent_grille', 1]] },
  alley: { name: 'back alley', label: 'the back door', base: 0.25, gate: null, hidden: 0, sec: -9, abs: true, cameras: 0, blurbs: ['{name}: bins, a fire exit propped open with a brick and a person smoking a cigarette that looks like a pen.', '{name}: a narrow alley behind the shop, where people go to say the prices they could not say inside.'], sig: [['bin_fire', 0.3], ['side_door', 0.8], ['scrap_bin', 0.3]] },
  cage: { name: 'cage', label: 'a grilled door', base: 0.2, gate: 'guarded', hidden: 0, sec: 2, cameras: 1, blurbs: ['{name}: a chain-link room of racks, a smell of gun oil and polish and a lot of things that have been marked "decorative".', '{name}: bars to the ceiling, a hatch for passing things through and a guard who has been told not to enjoy it.'], sig: [['gun_rack', 0.8], ['chrome_shelf', 0.4], ['safe', 0.3]] },
};

export interface FeatureDef {
  label: string;
  /** Weight in the pool for floor features. */
  base: number;
}

export const FEATURES: Record<string, FeatureDef> = {
  counter: { label: 'the counter', base: 0 },
  window_display: { label: 'a window display', base: 2 },
  display_case: { label: 'a display case', base: 2.5 },
  jewellery_case: { label: 'a jewellery case', base: 1 },
  instrument_wall: { label: 'an instrument wall', base: 0.6 },
  tool_wall: { label: 'a wall of tools', base: 0.6 },
  gun_rack: { label: 'a rack of weapons', base: 0.3 },
  chrome_shelf: { label: 'a chrome shelf', base: 0.7 },
  curio_shelf: { label: 'a curio shelf', base: 2.5 },
  bargain_bin: { label: 'a bargain bin', base: 2.5 },
  scale: { label: 'the scale', base: 1.4 },
  appraisal_bench: { label: 'an appraisal bench', base: 1 },
  ledger: { label: 'the ledger', base: 0 },
  ledger_terminal: { label: 'a ledger terminal', base: 0 },
  safe: { label: 'a safe', base: 0 },
  vault_door: { label: 'the vault door', base: 0 },
  grille: { label: 'a grille', base: 1.5 },
  cctv_console: { label: 'a CCTV console', base: 1.2 },
  serial_scanner: { label: 'the serial scanner', base: 1.4 },
  partner_portal: { label: 'the partner portal', base: 0 },
  notice_board: { label: 'a notice board', base: 2 },
  parrot: { label: 'an appraising parrot', base: 0.4 },
  shop_cat: { label: 'the shop cat', base: 0.7 },
  vending: { label: 'a vending machine', base: 1.4 },
  card_table: { label: 'a card table', base: 0.15 },
  jukebox: { label: 'a jukebox', base: 0.6 },
  try_on_mirror: { label: 'a try-on mirror', base: 1.2 },
  practice_amp: { label: 'a practice amp', base: 0.4 },
  tip_jar: { label: 'a tip jar', base: 1.4 },
  repair_bench: { label: 'a repair bench', base: 0.2 },
  scrap_bin: { label: 'a scrap bin', base: 0.4 },
  junk_pile: { label: 'a junk pile', base: 0.5 },
  hatch: { label: 'a cellar hatch', base: 0 },
  skylight: { label: 'a skylight', base: 1 },
  vent_grille: { label: 'a vent grille', base: 0 },
  side_door: { label: 'a side door', base: 1.2 },
  loading_door: { label: 'a loading door', base: 0.3 },
  bin_fire: { label: 'a burning bin', base: 0 },
  mannequin: { label: 'a mannequin', base: 0.7 },
  antique_clock: { label: 'an antique clock', base: 0.8 },
  stuffed_thing: { label: 'a stuffed thing', base: 0.5 },
  trophy_wall: { label: 'a trophy wall', base: 0.7 },
  formal_rail: { label: 'a rail of formal wear', base: 0.7 },
  umbrella_stand: { label: 'an umbrella stand', base: 0.8 },
  returns_box: { label: 'a returns box', base: 0.8 },
  door_bell: { label: 'the door bell', base: 1.4 },
  dartboard: { label: 'a dartboard', base: 0.4 },
  pool_table: { label: 'a pool table', base: 0.1 },
  lost_property: { label: 'a box of unclaimed bags', base: 0.6 },
  layaway_shelf: { label: 'a layaway shelf', base: 0.3 },
  queue_rope: { label: 'a queue rope', base: 0.4 },
  price_gun: { label: 'a price gun', base: 0.6 },
  stream_rig: { label: 'a stream rig', base: 0.5 },
  pigeon_coop: { label: 'a pigeon coop', base: 0 },
};

// ===================================================================== rolling a shop

export interface RolledPawn {
  info: PawnInfo;
  name: string;
  blurb: string;
  security: number;
  crowded: boolean;
}

/** Roll one shop. Pure: all of it from `rng`, in a fixed order, so the same street always grows the same shop. */
export function rollPawn(rng: Rng, district: District, depth: number): RolledPawn {
  const weights = PAWN_VARIANT[district];
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
  // A shop that is famous for a vault has one (if it has room for it).
  if (wild === 'famous_vault' && !rooms.includes('vault') && rooms.length < SIZES[size]!.rooms) rooms.push('vault');
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

/** Name for a room of a shop: "Nine-Lives Hock & Loan's vault", or whatever the variant calls it. */
export function roomTitle(info: PawnInfo, shopName: string, room: string): string {
  const v = VARIANTS[info.variant];
  const label = v?.roomNames?.[room] ?? ROOMS[room]?.name ?? room;
  return label.startsWith('the ') ? `${possessive(shopName)} ${label.slice(4)}` : `${possessive(shopName)} ${label}`;
}

/** Features in one room of a shop ("floor" for the main floor). */
export function featuresIn(info: PawnInfo, room: string): string[] {
  const prefix = `${room}:`;
  return info.features.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)).filter((f) => FEATURES[f]);
}

// ===================================================================== prices

const traitProd = (info: PawnInfo, key: 'offer' | 'price' | 'rate'): number => info.traits.reduce((p, t) => p * (TRAITS[t]?.[key] ?? 1), 1);

/** What fraction of an item's value they will pay for it, before her haggling: the variant's range (tier moves along it), traits, today's situation. */
export function offerFraction(info: PawnInfo, sit?: SituationDef): number {
  const v = VARIANTS[info.variant];
  if (!v) return 0.3;
  const [lo, hi] = v.offer;
  const f = lo + (hi - lo) * ((info.tier - 1) / 4);
  const wild = info.wild === 'savant' ? 1 / f : 1;
  return f * wild * traitProd(info, 'offer') * (sit?.offer ?? 1) * (info.wild === 'bottomless' ? 1.5 : 1);
}

/** Retail price of an item here right now: the variant's markup on its value, traits, tier, situation, wild cards. */
export function retailPrice(info: PawnInfo, item: Item, sit?: SituationDef): number {
  const v = VARIANTS[info.variant];
  const m = (v?.markup ?? 1.6) * (0.9 + 0.05 * info.tier) * traitProd(info, 'price') * (sit?.price ?? 1) * (info.wild === 'fire_sale' ? 0.3 : 1);
  return Math.max(1, Math.round(item.value * m));
}

/** Days an item is held for her after she hocks it. */
export function holdDays(info: PawnInfo, rng: Rng): number {
  const v = VARIANTS[info.variant];
  const [lo, hi] = v?.hold ?? [3, 7];
  const extra = info.traits.reduce((s, t) => s + (TRAITS[t]?.hold ?? 0), 0);
  return Math.max(1, rng.int(lo, hi) + extra);
}

export const graceDays = (info: PawnInfo): number => VARIANTS[info.variant]?.grace ?? 3;

/** Where a lot stands today. */
export type LotState = 'held' | 'forfeit' | 'house' | 'gone';

export function lotState(lot: PawnLot, day: number): LotState {
  if (day >= lot.until) return 'gone';
  if (!lot.hers) return 'house';
  return day < (lot.held ?? lot.since) ? 'held' : 'forfeit';
}

/** What it costs her to get her own item back today: what she was paid plus interest for every day it has sat there. */
export function redeemPrice(info: PawnInfo, lot: PawnLot, day: number): number {
  const v = VARIANTS[info.variant];
  const days = Math.max(1, day - lot.since);
  const rate = (v?.rate ?? 0.06) * traitProd(info, 'rate');
  const base = lot.paid * (1 + rate * days);
  return Math.max(lot.paid + 1, Math.round(info.wild === 'savant' ? base * 2 : base));
}

/** What a lot costs to buy today: her own forfeit item and the house's stock are both at retail. */
export const shelfPrice = (info: PawnInfo, lot: PawnLot, sit?: SituationDef): number => retailPrice(info, lot.item, sit);

// ===================================================================== who is there

const SIZE_CROWD = [1, 2, 3, 5, 8] as const;

/** The people a place wants. Rosters by kind are in roster.ts; a pawn shop's depend on what it is and which room this is. */
export function pawnRoster(loc: Location, p: PawnInfo): SlotDef[] {
  const room = loc.pawnRoom?.room;
  const crowd = SIZE_CROWD[p.size] ?? 3;
  const slots: SlotDef[] = [];
  if (!room) {
    slots.push({ role: 'pawn_broker', count: [1, 1], faction: 'venue', resident: true });
    slots.push({ role: 'pawn_appraiser', count: [1, 1], chance: 0.85, faction: 'venue', resident: true });
    slots.push({ role: 'pawn_clerk', count: [1, 1], chance: 0.7, faction: 'venue', resident: true });
    slots.push({ role: 'pawn_regular', count: [Math.max(0, crowd - 2), crowd + 1], ephemeral: true });
    slots.push({ role: 'pawn_guard', count: [1, 1], chance: Math.min(0.9, 0.15 + loc.security * 0.12), faction: 'venue', resident: true });
    slots.push({ role: 'ganger', count: [1, 2], chance: p.traits.includes('gang_drop') || p.traits.includes('fence_front') ? 0.85 : 0.2, faction: 'influence' });
    if (p.variant === 'atlasasset' || p.traits.includes('atlas_owned') || p.traits.includes('inspected')) slots.push({ role: 'atlas_rep', count: [1, 1], chance: 0.6, resident: true });
    if (p.traits.includes('robot_clerk')) slots.push({ role: 'pawn_bot', count: [1, 1], faction: 'venue', resident: true });
    slots.push({ role: 'cop', count: [1, 1], chance: 0.05 });
    return slots;
  }
  switch (room) {
    case 'office': slots.push({ role: 'pawn_clerk', count: [1, 1], chance: 0.5, faction: 'venue', resident: true }); break;
    case 'vault': slots.push({ role: 'pawn_guard', count: [1, 1], chance: 0.6, faction: 'venue', resident: true }); break;
    case 'workshop': slots.push({ role: 'pawn_tinker', count: [1, 1], faction: 'venue', resident: true }); break;
    case 'showroom': slots.push({ role: 'pawn_clerk', count: [1, 1], chance: 0.6, faction: 'venue', resident: true }, { role: 'pawn_regular', count: [0, 3], ephemeral: true }); break;
    case 'parlour': slots.push({ role: 'pawn_fence', count: [1, 1], chance: 0.6, faction: 'influence' }, { role: 'pawn_regular', count: [1, 4], ephemeral: true }); break;
    case 'bay': slots.push({ role: 'pawn_fence', count: [1, 1], chance: 0.5, faction: 'influence' }, { role: 'pawn_guard', count: [1, 1], chance: 0.3, faction: 'venue', resident: true }); break;
    case 'cage': slots.push({ role: 'pawn_guard', count: [1, 1], faction: 'venue', resident: true }); break;
    case 'cellar': case 'roof': case 'alley': slots.push({ role: 'street_kid', count: [0, 1], chance: 0.25, ephemeral: true }); break;
    default: break;
  }
  return slots;
}
