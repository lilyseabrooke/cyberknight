import type { Item, ItemKind } from '../types';
import { AMMO, AMMO_IDS, WEAPON_AMMO } from './ammo';
import { STIMS } from './stims';
import { MEDS } from './meds';

type Def = Omit<Item, 'id'>;
const w = (name: string, power: number, value: number, tags: string[] = []): Def => ({ name, kind: 'weapon', power, value, tags });
const a = (name: string, power: number, value: number): Def => ({ name, kind: 'armor', power, value, tags: [] });
const l = (name: string, value: number, tags: string[] = []): Def => ({ name, kind: 'loot', power: 0, value, tags });
const c = (name: string, power: number, value: number, tags: string[] = []): Def => ({ name, kind: 'consumable', power, value, tags });

export const ITEMS: Record<string, Def> = {
  // ---- weapons ----
  excalibur: w('"Excalibur" (a tire iron)', 4, 3),
  broken_bottle: w('broken bottle', 3, 1),
  pool_cue: w('pool cue', 4, 5),
  cleaver: w('kitchen cleaver', 6, 15),
  judgment: w('baseball bat named "Judgment"', 8, 40),
  switchblade: w('chrome switchblade', 5, 20),
  zip_pistol: w('zip pistol', 7, 35),
  arc_gauntlet: w('arc gauntlet', 9, 80),
  service_pistol: w('NPD service pistol', 9, 60),
  stunner_mk3: w('Stunner Mk.III', 12, 150),
  monowhip: w('monofilament whip', 14, 260),
  riot_shotgun: w('NPD riot shotgun', 17, 220),
  rail_revolver: w('rail revolver', 18, 400),
  gauss_smg: w('gauss SMG', 20, 520),
  thermal_katana: w('thermal katana', 22, 700),
  pulse_rifle: w('Helix pulse rifle', 26, 900),
  hiccup: {
    name: 'Singularity Hiccup (experimental, do not point at anything you like)',
    kind: 'gadget',
    power: 45,
    value: 5000,
    unstable: true,
    tags: ['experimental'],
  },
  // ---- armor ----
  leather_jacket: a('pleather jacket', 1, 20),
  kevlar_duster: a('kevlar duster', 3, 150),
  riot_vest: a('NPD riot vest', 5, 260),
  corp_plate: a('Helix subdermal plating', 7, 800),
  artemis_plate: a('Artemis wing plating', 6, 500),
  courier_plate: a('Hermes courier plating', 4, 300),
  harvest_plate: a('Demeter harvest plating', 7, 650),
  ram_plate: a('Ares ram plating', 8, 900),
  champ_vest: a('NEON KNIGHTS championship vest (blinks)', 2, 40),
  // ---- loot ----
  credchip: l('dented credchip', 30),
  memory_shard: l('black-market memory shard', 80),
  walkman: l('pre-Fall walkman (works!)', 45),
  gold_tooth: l('gold tooth (not hers)', 25),
  fake_id: l('counterfeit Atlas ID', 60),
  eyeballs: l('jar of suspicious eyeballs', 15),
  neural_gum: l('neural chewing gum', 10),
  mom_photo: l("holo-photo of someone's mother", 5),
  corp_creds: l('Atlas executive credentials', 350, ['corp']),
  helix_sample: l('vial of glowing Helix sample', 200, ['corp']),
  dragon_scale: l('Artemis scale (still warm)', 250, ['dragon']),
  courier_scale: l('Hermes courier scale (light as foil)', 180, ['dragon']),
  tithe_ledger: l('Demeter tithe ledger (your name is in it)', 320, ['dragon']),
  hunter_optics: l('Artemis Mk. II hunter optics (still tracking)', 420, ['dragon']),
  scream_core: l('Ares scream core (faintly, still screaming)', 700, ['dragon']),
  vipers_patch: l('Chrome Vipers colors', 20, ['gang']),
  scrap_metal: l('bundle of salvaged scrap metal', 35),
  drone_core: l('scavenged drone core', 90, ['corp']),
  // ---- fishing (hobbies.ts): the rod turns up in scrap, the rest comes out of the water ----
  fishing_rod: l('fishing rod (an aerial, a drone winch, and a hook that used to be a paperclip)', 12, ['tool', 'rod']),
  sodden_boot: l('sodden boot (left, size unknowable)', 2),
  drowned_phone: l('waterlogged phone (it still buzzes)', 22, ['tech']),
  glow_carp: l('three-eyed carp (glows; not for eating)', 12),
  chrome_eel: l('chrome eel (alive, annoyed)', 55),
  // ---- consumables ----

  ...Object.fromEntries(Object.entries(MEDS).map(([id, m]) => [id, c(m.name, m.heal, m.price, ['med'])])),
  stim: c(STIMS.stim!.name, 6, 40, ['stim']),
  stim_iron: c(STIMS.stim_iron!.name, 0, 50, ['stim']),
  stim_twitch: c(STIMS.stim_twitch!.name, 0, 45, ['stim']),
  stim_cortex: c(STIMS.stim_cortex!.name, 0, 45, ['stim']),
  stim_silver: c(STIMS.stim_silver!.name, 0, 35, ['stim']),
  noodles: c('mystery-meat noodle bowl', 12, 5),
  protein_tub: c('tub of protein of uncertain provenance', 8, 14),
  spray_can: c('can of spray paint (5 left)', 5, 15, ['paint']),
  dish_good: c('a plated noodle special (it is, shockingly, good)', 30, 40, ['dish']),
  cocktail_molotov: c('Molotov Mule (the cocktail, mostly)', 18, 25, ['throwable', 'fire']),
  ...Object.fromEntries(AMMO_IDS.map((t) => [`ammo_${t}`, c(`box of ${AMMO[t]!.label}`, 0, Math.round(AMMO[t]!.price / 2), ['ammo'])])),
  loudspeaker: l('riot-control loudspeaker (NPD surplus, one dent)', 90, ['loudspeaker']),
  vintage_guitar: l('vintage guitar (previous owner: a band)', 400, ['instrument']),
  // ---- gyms ----
  speed_gloves: w('speed gloves (weighted)', 6, 55, ['gloves']),
  boxing_wraps: a('hand wraps and a mouthguard', 1, 12),
  champ_belt: l('championship belt (the gold is mostly paint)', 120, ['trophy']),
  forged_pass: l('forged gym pass (laminated, very convincing)', 20, ['key']),
  society_card: l('plain card with a number and no name', 45, ['key']),
  // ---- pawn shops (content/pawns.ts): what sits on the shelves and in the vault ----
  signet_ring: l('signet ring (someone else\'s crest)', 90, ['jewellery']),
  gold_band: l('plain gold band (inscribed, worn smooth)', 60, ['jewellery']),
  pearl_string: l('string of pearls (a few are real)', 140, ['jewellery']),
  chrono_watch: l('chronograph watch (stops at the same minute daily)', 160, ['jewellery', 'tech']),
  diamond_stud: l('single diamond stud (lab-grown, the tag insists)', 110, ['jewellery']),
  brass_horn: l('dented brass horn', 70, ['instrument']),
  drum_pad: l('drum pad, barely used', 55, ['instrument']),
  synth_keys: l('two-octave synth with one dead key', 120, ['instrument']),
  ukulele: l('ukulele with a sticker of a sun', 40, ['instrument']),
  torque_wrench: l('torque wrench (calibrated, it claims)', 45, ['tool']),
  plasma_torch: l('handheld plasma torch', 110, ['tool']),
  solder_kit: l('soldering kit in a biscuit tin', 60, ['tool']),
  lockpick_set: l('folding lockpick set (a gift, officially)', 75, ['tool']),
  data_slate: l('cracked data slate', 70, ['tech']),
  vr_visor: l('second-hand VR visor (the previous owner is still in it)', 95, ['tech']),
  spare_forearm: l('spare chrome forearm', 260, ['tech', 'chrome']),
  optic_lens: l('boxed optical implant, tier unclear', 210, ['tech', 'chrome']),
  signed_poster: l('signed poster (the signature is on the back)', 85, ['collectible']),
  prop_sword: l('prop sword from a film nobody finished', 50, ['collectible']),
  vinyl_record: l('pre-Fall vinyl record (sleeve only)', 40, ['collectible']),
  trading_cards: l('sealed tin of trading cards', 130, ['collectible']),
  match_shirt: l('match-worn sports shirt (which match is unclear)', 70, ['collectible']),
  antique_clock: l('antique clock (right twice a day)', 95, ['antique']),
  snow_globe: l('snow globe of a city that no longer exists', 25, ['antique']),
  stuffed_gull: l('stuffed gull in a small hat', 18, ['antique']),
  atlas_umbrella: l('Atlas-branded umbrella (reassuring)', 7, ['corp']),
  relic_jacket: l('stage jacket of a singer nobody will name', 520, ['collectible', 'relic']),
  relic_guitar: l('guitar with a famous dent', 680, ['instrument', 'relic']),
  relic_ring: l('ring with a famous finger-shaped dent', 560, ['jewellery', 'relic']),
  relic_belt: l('belt from a title fight that was later "reviewed"', 600, ['trophy', 'relic']),
  // ---- arcades (content/halls.ts): tickets, prizes, boards and what falls off a spider ----
  joy_tickets: l('strip of Joy tickets (redeemable for joy)', 12, ['tickets']),
  token_roll: l('roll of arcade tokens', 18, ['tokens']),
  lumi_plush: l('Lumi-Bear plush (it says "I believe in you")', 38, ['prize', 'plush']),
  prize_headset: l('prize headset (tier: cheerful)', 62, ['prize', 'tech']),
  prize_keyring: l('LUMINA keyring', 7, ['prize']),
  prize_fist: l('prize trophy shaped like a fist', 45, ['prize', 'trophy']),
  highscore_trophy: l('brass trophy, engraved with initials', 70, ['trophy']),
  cracked_board: l('cracked arcade board (no licence, no mercy)', 60, ['tech', 'contraband', 'board']),
  bootleg_cart: l('bootleg game cartridge in a hand-labelled case', 45, ['contraband', 'tech']),
  arcade_stick: l('custom arcade stick, clicky', 55, ['tech', 'controller']),
  debug_dongle: l('debug dongle (opens a service menu)', 90, ['tech', 'tool']),
  fun_sticker: l('FUN VERIFIED sticker, peeled whole', 6, ['forgery', 'paper']),
  spider_leg: l('spider leg (still pointing at something)', 130, ['tech', 'part', 'robot']),
  cursed_charm: l('charm bracelet (it comes back)', 15, ['cursed']),
  fake_watch: l('convincing watch (it is not)', 4, ['fake']),
};

export function makeItem(id: string): Item {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item ${id}`);
  return { id, ...d, tags: [...d.tags] };
}

export function isKind(i: Item, k: ItemKind): boolean {
  return i.kind === k;
}

/** Weapon style tags drive the combat skills; throwables can be flung in fights. */
const STYLE: Record<string, string[]> = {
  zip_pistol: ['gun'], service_pistol: ['gun'], stunner_mk3: ['gun'], riot_shotgun: ['gun'], rail_revolver: ['gun'],
  gauss_smg: ['gun'], pulse_rifle: ['gun'], hiccup: ['gun'],
  excalibur: ['melee'], broken_bottle: ['melee', 'throwable'], pool_cue: ['melee', 'throwable', 'cue'], cleaver: ['melee', 'throwable'],
  judgment: ['melee'], switchblade: ['melee', 'throwable'], arc_gauntlet: ['melee'], monowhip: ['melee'], thermal_katana: ['melee'],
};
for (const [id, tags] of Object.entries(STYLE)) ITEMS[id]!.tags.push(...tags);

for (const [id, a] of Object.entries(WEAPON_AMMO)) Object.assign(ITEMS[id]!, { ammoType: a.type, perRound: a.perRound });
for (const t of AMMO_IDS) ITEMS[`ammo_${t}`]!.ammoType = t;

/** A full box of the given ammo type (rounds default to the shop box size). */
export function makeAmmoBox(type: string, rounds: number = AMMO[type]!.box): Item {
  const it = makeItem(`ammo_${type}`);
  it.rounds = rounds;
  it.name = `${rounds} ${AMMO[type]!.label}`;
  return it;
}

/** Bare fists: what she swings when the gun is dry and there is nothing else in her pockets. */
export const FISTS: Item = { id: 'fists', name: 'bare fists', kind: 'weapon', power: 1, value: 0, tags: ['melee'] };
