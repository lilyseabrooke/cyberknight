import type { Rng } from '../rng';
import type { Gender, Item, Npc } from '../types';
import { makeAmmoBox, makeItem } from './items';
import { rating, variantOf } from '../weapons';
import { rollPerson, type PersonSpec } from '../people';
import { baseHp, basePower } from '../grade';
import { CALLSIGNS, callsign } from './callsigns';
import { MUSIC_ARCHETYPES, MUSIC_PEOPLE } from './musicpeople';

export interface ArchetypeDef {
  role: string;
  level: [number, number];
  tags: string[];
  faction: string | null;
  names: 'person' | 'robot' | 'monster' | 'kid' | 'artemis' | 'hera' | 'hermes' | 'nextday' | 'demeter' | 'ares';
  weapons: string[];
  armors?: string[];
  armorChance?: number;
  loot: string[];
  lootChance: number;
  cash: [number, number];
  /** Short intro the text layer can drop in ("a hulking bouncer with chromed knuckles"). */
  desc: string[];
  /** Overrides for bosses and robots. */
  hp?: number;
  power?: number;
  startAffinity?: number;
}

export const ARCHETYPES: Record<string, ArchetypeDef> = {
  // ---------------- The Rusty Halo ----------------
  barkeep: {
    role: 'owner of the Rusty Halo', level: [7, 7], tags: ['owner', 'strong', 'staff'], faction: 'halo',
    names: 'person', weapons: ['judgment'], loot: ['credchip', 'walkman'], lootChance: 0.5, cash: [120, 300],
    desc: ['a barrel-chested ex-merc with a prosthetic jaw and a bat under the counter'],
  },
  bartender: {
    role: 'bartender', level: [3, 3], tags: ['staff', 'augmented'], faction: 'halo',
    names: 'person', weapons: ['broken_bottle', 'zip_pistol'], loot: ['neural_gum'], lootChance: 0.4, cash: [30, 90],
    desc: ['a bartender with electric-blue hair and eyes that glow when she pours'],
    startAffinity: 5,
  },
  hacker: {
    role: 'hacker', level: [3, 3], tags: ['augmented', 'jealous'], faction: null,
    names: 'person', weapons: ['arc_gauntlet'], loot: ['memory_shard', 'fake_id'], lootChance: 0.8, cash: [20, 120],
    desc: ['a hacker in the corner booth, one arm a mess of exposed cabling'],
  },
  puppy: {
    role: 'robot puppy', level: [1, 1], tags: ['pet', 'robot'], faction: 'halo',
    names: 'robot', weapons: [], loot: [], lootChance: 0, cash: [0, 0], hp: 25, power: 3,
    desc: ['a chrome robot puppy with one flickering LED ear'], startAffinity: 10,
  },
  // ---------------- what homes keep (stats are set by model and security; see hazards.ts) ----------------
  guard_dog: {
    role: 'robotic guard dog', level: [1, 1], tags: ['robot', 'guard'], faction: null,
    names: 'robot', weapons: [], loot: ['memory_shard'], lootChance: 0.2, cash: [0, 0], hp: 25, power: 5,
    desc: ['a chrome guard dog with a low, patient hum and a jaw like a vice'],
  },
  sentry_turret: {
    role: 'automated sentry turret', level: [1, 1], tags: ['robot', 'guard'], faction: null,
    names: 'robot', weapons: [], loot: ['memory_shard'], lootChance: 0.4, cash: [0, 0], hp: 60, power: 16,
    desc: ['a sentry turret in a ceiling housing, tracking her with a small red eye'],
  },
  bouncer: {
    role: 'bouncer', level: [6, 6], tags: ['strong', 'rowdy', 'augmented', 'security'], faction: 'halo',
    names: 'person', weapons: ['arc_gauntlet', 'judgment'], armors: ['kevlar_duster'], armorChance: 0.7,
    loot: ['gold_tooth'], lootChance: 0.4, cash: [20, 80],
    desc: ['a bouncer roughly the size and shape of a vending machine'],
  },
  ganger: {
    role: 'ganger', level: [2, 3], tags: ['rowdy', 'ganger'], faction: 'ganger',
    names: 'person', weapons: ['switchblade', 'zip_pistol', 'pool_cue', 'broken_bottle'], armors: ['leather_jacket'],
    armorChance: 0.5, loot: ['vipers_patch', 'credchip', 'gold_tooth', 'med_pack', 'patch_kit'], lootChance: 0.6, cash: [10, 60],
    desc: ['a ganger in a jacket covered in more patches than a quilt'],
  },
  corpo: {
    role: 'off-the-clock corporate drone', level: [2, 2], tags: ['augmented', 'corp', 'monitored'], faction: 'atlas',
    names: 'person', weapons: ['zip_pistol'], armors: ['kevlar_duster'], armorChance: 0.3,
    loot: ['corp_creds', 'credchip'], lootChance: 0.9, cash: [150, 400],
    desc: ['a corpo with a very expensive haircut and an even more expensive spine'],
  },
  cop: {
    role: 'off-duty NPD officer', level: [4, 4], tags: ['cop', 'rowdy', 'augmented'], faction: 'npd',
    names: 'person', weapons: ['service_pistol'], armors: ['riot_vest'], armorChance: 0.6,
    loot: ['credchip'], lootChance: 0.5, cash: [40, 120],
    desc: ['an off-duty cop nursing a synth-whiskey and a grudge'],
  },
  fixer: {
    role: 'fixer', level: [5, 5], tags: ['fixer', 'augmented'], faction: null,
    names: 'person', weapons: ['stunner_mk3'], armors: ['kevlar_duster'], armorChance: 1,
    loot: ['memory_shard', 'fake_id', 'corp_creds'], lootChance: 1, cash: [300, 800],
    desc: ['a fixer with silver eyes who knows what everything in Neo costs'],
  },
  doc: {
    role: 'street doc', level: [2, 2], tags: ['doc'], faction: null,
    names: 'person', weapons: ['cleaver'], loot: ['med_pack', 'eyeballs'], lootChance: 1, cash: [40, 100],
    desc: ['a street doc who runs an illegal clinic out of the bathroom stall'],
  },
  dealer: {
    role: 'twitchy dealer', level: [1, 1], tags: ['dealer'], faction: 'ganger',
    names: 'person', weapons: ['switchblade'], loot: ['stim', 'neural_gum'], lootChance: 0.9, cash: [5, 40],
    desc: ['a twitchy dealer who vibrates at a frequency just above human hearing'],
  },
  prophet: {
    role: 'street prophet', level: [1, 1], tags: ['rumor'], faction: null,
    names: 'person', weapons: [], loot: ['mom_photo', 'eyeballs'], lootChance: 0.7, cash: [0, 15],
    desc: ['a street prophet who has been wired to the wrong radio frequency since the Fall'],
  },
  cook: {
    role: 'line cook', level: [3, 3], tags: ['staff', 'strong'], faction: 'halo',
    names: 'person', weapons: ['cleaver'], loot: ['noodles'], lootChance: 0.8, cash: [5, 30],
    desc: ['a line cook with six arms, four of them clean'],
  },
  patron: {
    role: 'regular', level: [1, 2], tags: ['rowdy'], faction: null,
    names: 'person', weapons: ['broken_bottle', 'pool_cue'], loot: ['credchip', 'walkman', 'eyeballs'], lootChance: 0.5,
    cash: [5, 50], desc: ['a regular who has been in the same stool since the previous administration'],
  },
  // ---------------- Streets & alley ----------------
  drone: {
    role: 'surveillance drone', level: [3, 3], tags: ['robot', 'patrol', 'augmented'], faction: 'atlas',
    names: 'robot', weapons: ['stunner_mk3'], loot: ['memory_shard'], lootChance: 0.5, cash: [0, 0], hp: 55, power: 12,
    desc: ['an Atlas surveillance drone, hovering with the confidence of something that has never been punched'],
  },
  npd_drone: {
    role: 'NPD patrol drone', level: [3, 3], tags: ['robot', 'patrol', 'nonlethal'], faction: 'npd',
    names: 'robot', weapons: ['stunner_mk3'], loot: ['memory_shard'], lootChance: 0.4, cash: [0, 0], hp: 42, power: 9,
    desc: ['an NPD patrol drone with a stun-net launcher and a voice like a parking ticket'],
  },
  mugger: {
    role: 'mugger', level: [2, 3], tags: ['ganger', 'rowdy'], faction: 'ganger',
    names: 'person', weapons: ['switchblade', 'zip_pistol'], loot: ['credchip', 'gold_tooth', 'med_pack', 'patch_kit'], lootChance: 0.6, cash: [10, 50],
    desc: ['a mugger with a knife and a deadline'],
  },
  noodler: {
    role: 'noodle vendor', level: [1, 1], tags: ['staff'], faction: null,
    names: 'person', weapons: ['cleaver'], loot: ['noodles'], lootChance: 1, cash: [10, 40],
    desc: ['a noodle vendor who has seen things and is selling them as toppings'],
  },
  // ---------------- Neon Pharaoh ----------------
  club_security: {
    role: 'Neon Pharaoh security', level: [4, 5], tags: ['security', 'strong', 'augmented', 'nonlethal'], faction: 'club',
    names: 'person', weapons: ['stunner_mk3'], armors: ['kevlar_duster'], armorChance: 0.8,
    loot: ['gold_tooth', 'med_pack', 'patch_kit'], lootChance: 0.3, cash: [30, 100],
    desc: ['a club security guard in mirrored shades, at night, indoors, because he is a professional'],
  },
  dj: {
    role: 'DJ', level: [1, 1], tags: ['augmented', 'rumor'], faction: 'club',
    names: 'person', weapons: [], loot: ['memory_shard', 'walkman'], lootChance: 0.7, cash: [50, 150],
    desc: ['a DJ whose head is mostly speaker'],
  },
  dancer: {
    role: 'dancer', level: [2, 2], tags: ['augmented'], faction: 'club',
    names: 'person', weapons: ['switchblade'], loot: ['credchip'], lootChance: 0.5, cash: [30, 120],
    desc: ['a dancer whose tattoos are animated and a little judgmental'],
  },
  heir: {
    role: 'corporate heir', level: [1, 1], tags: ['corp', 'augmented', 'monitored'], faction: 'atlas',
    names: 'person', weapons: ['rail_revolver'], armors: ['kevlar_duster'], armorChance: 1,
    loot: ['corp_creds', 'memory_shard'], lootChance: 1, cash: [600, 1500],
    desc: ['an Atlas heir in a jacket that cost more than the building you grew up in'],
  },
  // ---------------- maintenance / Helix ----------------
  scrapper: {
    role: 'maintenance scrapper-bot', level: [3, 3], tags: ['robot', 'patrol'], faction: null,
    names: 'robot', weapons: [], loot: ['gold_tooth', 'credchip'], lootChance: 0.6, cash: [0, 0], hp: 60, power: 11,
    desc: ['a maintenance scrapper-bot with one working eye and a lot of opinions about trespassers'],
  },
  helix_guard: {
    role: 'Helix security', level: [6, 7], tags: ['security', 'corp', 'augmented'], faction: 'atlas',
    names: 'person', weapons: ['pulse_rifle'], armors: ['corp_plate'], armorChance: 0.8,
    loot: ['corp_creds', 'memory_shard', 'med_pack', 'trauma_kit'], lootChance: 0.6, cash: [60, 200],
    desc: ['a Helix guard in matte-black plating, visor down, personality off'],
  },
  scientist: {
    role: 'Helix researcher', level: [2, 2], tags: ['corp', 'augmented', 'rumor'], faction: 'atlas',
    names: 'person', weapons: ['stunner_mk3'], loot: ['helix_sample', 'memory_shard'], lootChance: 1, cash: [100, 300],
    desc: ['a researcher who has not slept since the previous fiscal quarter'],
  },
  lab_bot: {
    role: 'Helix lab-bot', level: [6, 6], tags: ['robot', 'corp', 'security'], faction: 'atlas',
    names: 'robot', weapons: [], loot: ['memory_shard'], lootChance: 0.7, cash: [0, 0], hp: 120, power: 24,
    desc: ['a lab-bot built for moving crates and, apparently, throwing people'],
  },
  bandmate: {
    role: 'bandmate', level: [2, 2], tags: ['rowdy', 'band'], faction: 'club',
    names: 'person', weapons: ['broken_bottle', 'switchblade'], loot: ['walkman', 'credchip', 'gold_tooth'], lootChance: 0.6, cash: [10, 60],
    desc: ['a bandmate in smudged eyeliner and total confidence, between sets'],
  },
  paint_clerk: {
    role: 'paint-shop clerk', level: [2, 2], tags: ['staff', 'shopkeeper'], faction: 'shop',
    names: 'person', weapons: ['switchblade'], loot: ['memory_shard', 'credchip'], lootChance: 0.5, cash: [40, 120],
    desc: ['a paint-shop clerk with a neon-pink streak in her hair and paint to the elbows'],
  },
  pharmacist: {
    role: 'night pharmacist', level: [3, 3], tags: ['staff', 'shopkeeper'], faction: 'shop',
    names: 'person', weapons: ['switchblade'], loot: ['med_pack', 'stim_cortex'], lootChance: 1, cash: [60, 160],
    desc: ['a night pharmacist with a laminated license, a lanyard of expired keycards and the calm of someone who has seen every possible rash'],
  },
  gunsmith: {
    role: 'gunsmith', level: [5, 5], tags: ['staff', 'shopkeeper', 'strong'], faction: 'shop',
    names: 'person', weapons: ['riot_shotgun'], armors: ['kevlar_duster'], armorChance: 1, loot: [], lootChance: 0, cash: [150, 400],
    desc: ['a gunsmith with forearms like cargo cranes who sells bagels out of the same display case as the grenades'],
  },
  // ---------------- what dungeons keep (the base stats are tier 1; dungeons.ts scales them by how hard the place is) ----------------
  atlas_drone: {
    role: 'Atlas sentry drone', level: [3, 3], tags: ['robot', 'patrol', 'sentry'], faction: 'atlas',
    names: 'robot', weapons: [], loot: ['drone_core', 'memory_shard'], lootChance: 0.55, cash: [0, 0], hp: 36, power: 9,
    desc: ['an Atlas sentry drone, ticking quietly on its charging cradle with one lens half-open'],
  },
  atlas_walker: {
    role: 'Atlas enforcer walker', level: [5, 5], tags: ['robot', 'security', 'strong'], faction: 'atlas',
    names: 'robot', weapons: [], loot: ['drone_core', 'memory_shard', 'scrap_metal'], lootChance: 0.7, cash: [0, 0], hp: 95, power: 18,
    desc: ['an Atlas enforcer walker: two and a half metres of grey alloy on hydraulic legs, built to hold a door and enjoy it'],
  },
  atlas_trooper: {
    role: 'Atlas security trooper', level: [3, 4], tags: ['security', 'augmented'], faction: 'atlas',
    names: 'person', weapons: ['service_pistol', 'stunner_mk3'], armors: ['riot_vest'], armorChance: 0.45,
    loot: ['corp_creds', 'memory_shard', 'med_pack', 'patch_kit'], lootChance: 0.4, cash: [30, 110],
    desc: ['an Atlas trooper in grey plating with a company-issue haircut and a company-issue stare'],
  },
  atlas_officer: {
    role: 'Atlas outpost commander', level: [6, 6], tags: ['security', 'augmented', 'strong', 'commander'], faction: 'atlas',
    names: 'person', weapons: ['pulse_rifle'], armors: ['corp_plate'], armorChance: 0.8,
    loot: ['corp_creds', 'helix_sample', 'memory_shard'], lootChance: 1, cash: [200, 500],
    desc: ['an Atlas commander with a cybernetic jaw, three service stripes and an expression like a closed ledger'],
  },
  // ---------------- Muse's Inspiration teams (muse.ts) ----------------
  inspiration_trooper: {
    role: 'Muse Inspiration operative', level: [4, 5], tags: ['security', 'augmented', 'muse'], faction: 'muse',
    names: 'person', weapons: ['heart_smg', 'heart_smg', 'service_pistol'], armors: ['inspiration_armour'], armorChance: 0.6,
    loot: ['glitter_grenade', 'muse_lanyard', 'med_pack', 'patch_kit'], lootChance: 0.55, cash: [40, 120],
    desc: ['a Muse Inspiration operative in pastel tactical armour, a heart decal on the visor and a very large gun', 'an Inspiration operative humming the Muse jingle under a mirrored visor, safety catch off'],
  },
  lumina: {
    role: 'Muse idol', level: [40, 40], tags: ['robot', 'muse', 'idol', 'boss'], faction: 'muse',
    names: 'robot', weapons: [], loot: ['lumina_chip'], lootChance: 1, cash: [0, 0], hp: 700, power: 55,
    desc: ['LUMINA, Muse\'s synthetic idol: chrome and light and a smile tuned in a lab to be exactly as warm as a hug from a stranger'],
  },
  muse_artist: {
    role: 'Muse recording artist', level: [3, 5], tags: ['muse', 'performer'], faction: 'muse',
    names: 'person', weapons: [], loot: ['muse_lanyard', 'credchip'], lootChance: 0.6, cash: [60, 200],
    desc: ['a Muse recording artist in approved pastel, smiling the contractual smile'],
  },
  muse_bot_artist: {
    role: 'Muse performer unit', level: [3, 5], tags: ['robot', 'muse', 'performer'], faction: 'muse',
    names: 'robot', weapons: [], loot: ['memory_shard', 'scrap_metal'], lootChance: 0.7, cash: [0, 0],
    desc: ['a Muse performer unit, all mirrored panels and auto-tune, with a serial number for a surname'],
  },
  muse_drone: {
    role: 'Muse noise-abatement drone', level: [2, 2], tags: ['robot', 'patrol', 'muse', 'nonlethal'], faction: 'muse',
    names: 'robot', weapons: [], loot: ['memory_shard', 'scrap_metal'], lootChance: 0.45, cash: [0, 0], hp: 30, power: 6,
    desc: ['a pastel Muse noise-abatement drone with a tear-gas canister under each rotor and a speaker that only knows one sentence'],
  },
  muse_tech: {
    role: 'Muse Broadcast technician', level: [2, 3], tags: ['muse', 'staff'], faction: 'muse',
    names: 'person', weapons: ['stunner_mk3'], loot: ['memory_shard', 'solder_kit', 'muse_lanyard'], lootChance: 0.6, cash: [20, 70],
    desc: ['a Muse Broadcast technician in a pastel hi-vis vest, guarding a relay mast with a stun gun and a lanyard'],
  },
  encore: {
    role: 'Inspiration commander', level: [8, 8], tags: ['security', 'augmented', 'muse', 'commander', 'strong'], faction: 'muse',
    names: 'person', weapons: ['sparkle_rifle'], armors: ['inspiration_armour'], armorChance: 1,
    loot: ['glitter_grenade', 'memory_shard', 'muse_lanyard'], lootChance: 1, cash: [300, 600],
    desc: ['ENCORE, the Inspiration commander: pastel plate with a gold trim nobody else is allowed, a glitter rifle with a kill count in hearts, and a smile she saves for Blackbird'],
  },
  inspiration_lead: {
    role: 'Muse Inspiration team lead', level: [6, 7], tags: ['security', 'augmented', 'muse', 'commander', 'strong'], faction: 'muse',
    names: 'person', weapons: ['sparkle_rifle'], armors: ['inspiration_armour'], armorChance: 1,
    loot: ['glitter_grenade', 'muse_lanyard', 'memory_shard'], lootChance: 1, cash: [150, 400],
    desc: ['an Inspiration team lead with a glitter-finish rifle and the smile of somebody about to post a heartfelt tribute'],
  },
  gang_runner: {
    role: 'gang runner', level: [1, 2], tags: ['rowdy', 'ganger'], faction: 'ganger',
    names: 'person', weapons: ['broken_bottle', 'pool_cue', 'switchblade', 'zip_pistol'], armors: ['leather_jacket'], armorChance: 0.3,
    loot: ['vipers_patch', 'credchip', 'gold_tooth', 'patch_kit', 'neural_gum'], lootChance: 0.5, cash: [5, 35],
    desc: ['a gang runner with fresh colors, a borrowed weapon and something to prove'],
  },
  gang_enforcer: {
    role: 'gang enforcer', level: [3, 4], tags: ['rowdy', 'ganger', 'strong'], faction: 'ganger',
    names: 'person', weapons: ['cleaver', 'arc_gauntlet', 'zip_pistol'], armors: ['leather_jacket', 'kevlar_duster'], armorChance: 0.55,
    loot: ['gold_tooth', 'credchip', 'med_pack', 'stim'], lootChance: 0.55, cash: [25, 80],
    desc: ['a gang enforcer with the jacket sleeves cut off and the knuckles chromed'],
  },
  gang_captain: {
    role: 'gang captain', level: [6, 6], tags: ['rowdy', 'ganger', 'strong', 'commander'], faction: 'ganger',
    names: 'person', weapons: ['rail_revolver', 'gauss_smg', 'riot_shotgun'], armors: ['kevlar_duster', 'riot_vest'], armorChance: 1,
    loot: ['gold_tooth', 'credchip', 'med_pack', 'memory_shard', 'stim'], lootChance: 1, cash: [150, 400],
    desc: ['the captain, a mountain of a person in a coat of stitched-together colors, with the calm of someone who has never had to raise a voice'],
  },
  // ---------------- what the small encounter spots keep (content/spots.ts) ----------------
  street_chemist: {
    role: 'street chemist', level: [2, 2], tags: ['rowdy'], faction: null,
    names: 'person', weapons: ['cleaver', 'zip_pistol'], loot: ['stim', 'stim_twitch', 'neural_gum'], lootChance: 0.9, cash: [20, 90],
    desc: ['a street chemist with stained gloves, a respirator round the neck and the cheerful fatalism of the trade'],
  },
  bookie: {
    role: 'bookie', level: [2, 2], tags: ['staff'], faction: null,
    names: 'person', weapons: ['zip_pistol'], loot: ['credchip', 'gold_tooth'], lootChance: 0.8, cash: [80, 220],
    desc: ['a bookie with a ledger tattooed up one forearm and a very good memory for who owes what'],
  },
  salvager: {
    role: 'salvager', level: [2, 3], tags: ['rowdy'], faction: null,
    names: 'person', weapons: ['pool_cue', 'cleaver', 'switchblade'], armors: ['leather_jacket'], armorChance: 0.4,
    loot: ['scrap_metal', 'gold_tooth', 'credchip'], lootChance: 0.6, cash: [5, 40],
    desc: ['a salvager in a welding mask pushed up on their forehead, with a rucksack that clinks'],
  },
  hunter: {
    role: 'licensed bounty hunter', level: [4, 4], tags: ['strong', 'security', 'augmented'], faction: null,
    names: 'person', weapons: ['riot_shotgun', 'rail_revolver'], armors: ['kevlar_duster'], armorChance: 0.8,
    loot: ['credchip', 'med_pack'], lootChance: 0.6, cash: [60, 180],
    desc: ['a bounty hunter with an NPD license on a lanyard, a long coat and a very short temper for competition'],
  },
  feral_bot: {
    role: 'feral work-bot', level: [2, 2], tags: ['robot'], faction: null,
    names: 'robot', weapons: [], loot: ['scrap_metal', 'drone_core'], lootChance: 0.6, cash: [0, 0], hp: 50, power: 9,
    desc: ['a work-bot that has stopped taking orders and started taking an interest, with a loader arm and a cracked lens'],
  },
  contractor: {
    role: 'Atlas contractor', level: [1, 2], tags: ['staff', 'corp'], faction: 'atlas',
    names: 'person', weapons: ['cleaver'], loot: ['corp_creds', 'credchip'], lootChance: 0.4, cash: [30, 100],
    desc: ['an Atlas contractor in a hi-vis vest with a tablet, a lanyard and no wish to be here'],
  },
  suit: {
    role: 'corporate bodyguard', level: [3, 4], tags: ['security', 'corp', 'augmented'], faction: 'atlas',
    names: 'person', weapons: ['service_pistol', 'stunner_mk3'], armors: ['kevlar_duster'], armorChance: 0.7,
    loot: ['corp_creds', 'memory_shard', 'med_pack'], lootChance: 0.5, cash: [50, 150],
    desc: ['a bodyguard in a very good suit with an earpiece and a very bad attitude to strangers'],
  },
  acolyte: {
    role: 'Rust Choir acolyte', level: [2, 2], tags: ['rowdy', 'ganger'], faction: 'choir',
    names: 'person', weapons: ['cleaver', 'switchblade'], loot: ['mom_photo', 'eyeballs', 'vipers_patch'], lootChance: 0.6, cash: [5, 40],
    desc: ['a robed acolyte with a hymn-book in one hand, a hatchet in the other and a face of perfect, frightening calm'],
  },
  // ---------------- generic people for places nobody wrote by hand ----------------
  shopkeeper: {
    role: 'shopkeeper', level: [2, 3], tags: ['staff', 'shopkeeper'], faction: 'shop',
    names: 'person', weapons: ['switchblade', 'zip_pistol'], armors: ['kevlar_duster'], armorChance: 0.3,
    loot: ['credchip', 'med_pack'], lootChance: 0.4, cash: [40, 160],
    desc: ['a shopkeeper who has priced everything in the room, including you'],
  },
  realtor: {
    role: 'property agent', level: [2, 3], tags: ['staff', 'shopkeeper'], faction: 'shop',
    names: 'person', weapons: ['switchblade', 'zip_pistol'], armors: ['kevlar_duster'], armorChance: 0.3,
    loot: ['credchip', 'forged_pass'], lootChance: 0.4, cash: [60, 220],
    desc: ['an agent in a cheap suit with an expensive smile, who can tell what you can afford from the way you stand', 'a property agent holding a tablet like a hymnal and a keyring like a rosary', 'an agent who has sold the same eleven square metres to four different people and sleeps fine'],
  },
  turned_fan: {
    role: 'fan turned mob', level: [2, 4], tags: ['rowdy'], faction: null,
    names: 'person', weapons: ['broken_bottle', 'pool_cue', 'switchblade'], loot: ['credchip', 'neural_gum', 'bootleg_tapes'], lootChance: 0.3, cash: [0, 30],
    desc: ['a fan with a bloody nose and her face on their T-shirt, who followed her to the gate and blames her for the rubber bullets', 'somebody who was singing along ten minutes ago and is now holding a bottle by the neck'],
  },
  drifter: {
    role: 'passer-by', level: [1, 2], tags: [], faction: null,
    names: 'person', weapons: ['broken_bottle', 'switchblade'], loot: ['credchip', 'neural_gum'], lootChance: 0.3, cash: [0, 40],
    desc: ['someone on their way somewhere else, hood up'],
  },
  // ---------------- street life ----------------
  street_kid: {
    role: 'street kid', level: [1, 1], tags: ['kid'], faction: null,
    names: 'kid', weapons: ['broken_bottle'], loot: ['credchip', 'neural_gum', 'gold_tooth'], lootChance: 0.6, cash: [1, 15],
    desc: ['a street kid in a stolen leather jacket, a very serious expression and a haircut done by someone with a grudge'],
  },
  damsel: {
    role: 'courier in distress', level: [1, 1], tags: ['damsel'], faction: null,
    names: 'person', weapons: ['zip_pistol'], loot: ['memory_shard', 'fake_id'], lootChance: 0.8, cash: [40, 120],
    desc: ['a courier with a blue streak in her hair and a package she will not stop clutching'],
  },
  // ---------------- police & boss ----------------
  npd_officer: {
    role: 'NPD officer', level: [4, 5], tags: ['cop', 'security', 'augmented'], faction: 'npd',
    names: 'person', weapons: ['riot_shotgun', 'service_pistol'], armors: ['riot_vest'], armorChance: 0.9,
    loot: ['credchip', 'med_pack'], lootChance: 0.4, cash: [30, 90],
    desc: ['a Neo Protective Division officer in full riot kit'],
  },
  npd_sergeant: {
    role: 'NPD sergeant', level: [7, 7], tags: ['cop', 'security', 'augmented', 'strong'], faction: 'npd',
    names: 'person', weapons: ['gauss_smg'], armors: ['riot_vest'], armorChance: 1,
    loot: ['credchip', 'memory_shard', 'med_pack', 'trauma_kit'], lootChance: 0.7, cash: [80, 200],
    desc: ['an NPD sergeant with the thousand-yard stare of a man who bills overtime'],
  },
  apollo: {
    role: 'Apollo Mk. II cyberdragon', level: [15, 15], tags: ['robot', 'dragon', 'boss', 'apollo'], faction: 'atlas',
    names: 'monster', weapons: [], loot: ['helix_sample'], lootChance: 1, cash: [0, 0], hp: 1100, power: 105,
    desc: ['CINDERJAW, an Apollo Mk. II Atlas Protection Platform: forty tons of wings, plasma and customer-service branding'],
  },
  artemis: {
    role: 'Artemis Mk. I cyberdragon', level: [12, 12], tags: ['robot', 'dragon', 'artemis'], faction: 'atlas',
    names: 'artemis', weapons: [], loot: ['dragon_scale', 'artemis_plate'], lootChance: 0.8, cash: [0, 0], hp: 210, power: 38,
    desc: ['an Artemis Mk. I patrol dragon: fast, lean, built to hunt in packs and bill by the hour'],
  },
  hera: {
    role: 'Hera Mk. V cyberdragon', level: [60, 60], tags: ['robot', 'dragon', 'hera'], faction: 'atlas',
    names: 'hera', weapons: [], loot: [], lootChance: 0, cash: [0, 0], hp: 8000, power: 900,
    desc: ['a Hera Mk. V: a city-scale Atlas pacification platform, with a presence like weather'],
  },
  // The second batch (docs/DRAGONS_PLAN.md). How fast each goes is in dragonmodels.ts.
  hermes: {
    role: 'Hermes Mk. I cyberdragon', level: [8, 8], tags: ['robot', 'dragon', 'hermes', 'skittish'], faction: 'atlas',
    names: 'hermes', weapons: [], loot: ['courier_scale', 'courier_plate'], lootChance: 0.8, cash: [20, 90], hp: 100, power: 18,
    desc: ['a Hermes Mk. I courier dragon: small, quick, and carrying a clipboard it has no hands for'],
  },
  hermes3: {
    role: 'Hermes Mk. III cyberdragon', level: [30, 30], tags: ['robot', 'dragon', 'hermes'], faction: 'atlas',
    names: 'nextday', weapons: [], loot: ['courier_scale', 'courier_plate'], lootChance: 1, cash: [400, 1500], hp: 900, power: 120,
    desc: ['a Hermes Mk. III express dragon: a thin white blade of a thing that is never where you are looking'],
  },
  demeter: {
    role: 'Demeter Mk. I cyberdragon', level: [14, 14], tags: ['robot', 'dragon', 'demeter'], faction: 'atlas',
    names: 'demeter', weapons: [], loot: ['tithe_ledger', 'harvest_plate'], lootChance: 0.8, cash: [150, 400], hp: 260, power: 50,
    desc: ['a Demeter Mk. I bounty dragon: broad, slow, and hung with collection baskets'],
  },
  demeter2: {
    role: 'Demeter Mk. II cyberdragon', level: [24, 24], tags: ['robot', 'dragon', 'demeter'], faction: 'atlas',
    names: 'demeter', weapons: [], loot: ['tithe_ledger', 'harvest_plate'], lootChance: 0.8, cash: [400, 900], hp: 520, power: 92,
    desc: ['a Demeter Mk. II bounty dragon, its baskets welded shut and its manners worse'],
  },
  demeter3: {
    role: 'Demeter Mk. III cyberdragon', level: [36, 36], tags: ['robot', 'dragon', 'demeter'], faction: 'atlas',
    names: 'demeter', weapons: [], loot: ['tithe_ledger', 'harvest_plate'], lootChance: 0.8, cash: [900, 2000], hp: 860, power: 165,
    desc: ['a Demeter Mk. III bounty dragon, armored like a bank vault that learned to fly'],
  },
  demeter4: {
    role: 'Demeter Mk. IV cyberdragon', level: [50, 50], tags: ['robot', 'dragon', 'demeter'], faction: 'atlas',
    names: 'demeter', weapons: [], loot: ['tithe_ledger', 'harvest_plate'], lootChance: 0.8, cash: [2000, 5000], hp: 1350, power: 270,
    desc: ['a Demeter Mk. IV bounty dragon: the last word in taxation, and the last word, generally'],
  },
  artemis2: {
    role: 'Artemis Mk. II cyberdragon', level: [22, 22], tags: ['robot', 'dragon', 'artemis', 'hunter'], faction: 'atlas',
    names: 'artemis', weapons: [], loot: ['hunter_optics', 'artemis_plate'], lootChance: 0.8, cash: [0, 0], hp: 460, power: 82,
    desc: ['an Artemis Mk. II hunter dragon: an Artemis with the patience and the thermal optics to take an interest in one citizen'],
  },
  ares2: {
    role: 'Ares Mk. II cyberdragon', level: [28, 28], tags: ['robot', 'dragon', 'ares'], faction: 'atlas',
    names: 'ares', weapons: [], loot: ['ram_plate', 'dragon_scale'], lootChance: 0.8, cash: [0, 0], hp: 650, power: 115,
    desc: ['an Ares Mk. II gang-buster dragon: a wedge of armor with a loudspeaker for a face'],
  },
  ares4: {
    role: 'Ares Mk. IV cyberdragon', level: [48, 48], tags: ['robot', 'dragon', 'ares'], faction: 'atlas',
    names: 'ares', weapons: [], loot: ['scream_core', 'ram_plate'], lootChance: 1, cash: [0, 0], hp: 1700, power: 320,
    desc: ['an Ares Mk. IV gang-buster dragon, which comes in faster than its own sound'],
  },
  // ---------------- Gyms (content/gyms.ts) ----------------
  gym_owner: {
    role: 'gym owner', level: [5, 6], tags: ['owner', 'strong', 'staff'], faction: null,
    names: 'person', weapons: ['judgment'], loot: ['champ_belt', 'credchip', 'mom_photo'], lootChance: 0.6, cash: [80, 260],
    desc: ['a retired champion with a cauliflower ear, a bad knee and a belt in a case behind the desk', 'a barrel-chested owner who still wraps his own hands, out of spite', 'a sharp-eyed owner in a tracksuit that has outlasted three business plans', 'a former fighter whose nose has been broken in more ways than the building has fire exits'],
  },
  gym_coach: {
    role: 'coach', level: [3, 5], tags: ['staff', 'strong', 'trainer'], faction: null,
    names: 'person', weapons: [], loot: ['boxing_wraps', 'protein_tub'], lootChance: 0.3, cash: [15, 70],
    desc: ['a coach with a whistle on a string, a towel on one shoulder and the word "again" permanently on his lips', 'a tired, patient coach who has seen every kind of mistake and fixed most of them', 'a coach with arms like bridge cables and the gentlest voice in the district'],
  },
  sensei: {
    role: 'sensei', level: [4, 6], tags: ['staff', 'strong', 'trainer'], faction: null,
    names: 'person', weapons: [], loot: ['boxing_wraps', 'society_card'], lootChance: 0.2, cash: [20, 90],
    desc: ['a very upright sensei in a belt that has seen things', 'a sensei who bows at an angle that is clearly a rank', 'a quiet sensei who looks at her once, and has already written a report'],
  },
  rig_tech: {
    role: 'rig technician', level: [3, 5], tags: ['staff', 'augmented', 'trainer'], faction: null,
    names: 'person', weapons: ['speed_gloves'], loot: ['memory_shard', 'neural_gum'], lootChance: 0.35, cash: [30, 100],
    desc: ['a rig tech with hydraulic forearms and a laminated "Tune-Up Tuesday" menu', 'a rig tech whose shoulders are more engineering than anatomy', 'a rig tech who calls every customer by their load rating'],
  },
  instructor: {
    role: 'instructor', level: [2, 4], tags: ['staff', 'trainer'], faction: null,
    names: 'person', weapons: [], loot: ['neural_gum', 'protein_tub'], lootChance: 0.3, cash: [20, 80],
    desc: ['an instructor with a headset, an astonishing smile and a following', 'an instructor with a calm voice and a clipboard of everyone\'s weaknesses', 'a relentlessly encouraging instructor in a branded vest'],
  },
  range_officer: {
    role: 'range officer', level: [3, 5], tags: ['staff', 'trainer'], faction: null,
    names: 'person', weapons: ['zip_pistol'], loot: ['credchip', 'walkman'], lootChance: 0.3, cash: [20, 80],
    desc: ['a range officer in ear defenders with a laminated safety card in his top pocket', 'a very still range officer who has not blinked since Tuesday'],
  },
  gym_desk: {
    role: 'front desk', level: [1, 2], tags: ['staff', 'shopkeeper'], faction: null,
    names: 'person', weapons: ['broken_bottle'], loot: ['credchip', 'forged_pass'], lootChance: 0.4, cash: [10, 60],
    desc: ['a front-desk attendant with a tablet and an unreadable smile', 'someone behind the desk eating protein out of a tub with a spoon the size of a trowel'],
  },
  gym_sparrer: {
    role: 'sparring regular', level: [2, 4], tags: ['regular', 'strong'], faction: null,
    names: 'person', weapons: [], loot: ['boxing_wraps', 'mom_photo'], lootChance: 0.3, cash: [5, 40],
    desc: ['a regular with a gap-toothed grin who will spar with anyone for the price of a drink', 'a lean, quiet fighter with a bruise that has been the same shape for a month', 'a sparring regular who talks nonstop and punches in silence'],
    startAffinity: 3,
  },
  gym_regular: {
    role: 'gym-goer', level: [1, 2], tags: ['regular'], faction: null,
    names: 'person', weapons: [], loot: ['protein_tub', 'neural_gum', 'credchip'], lootChance: 0.3, cash: [3, 40],
    desc: ['a gym-goer mid-set, staring at nothing', 'a gym-goer who has been on the same machine for an hour and a half', 'someone in a vest that has a slogan on it she can\'t quite read'],
  },
  gym_cleaner: {
    role: 'cleaner', level: [1, 1], tags: ['staff'], faction: null,
    names: 'person', weapons: ['broken_bottle'], loot: ['credchip', 'mom_photo', 'gold_tooth'], lootChance: 0.4, cash: [2, 20],
    desc: ['a cleaner with a mop and a very long memory', 'a cleaner who knows what is behind every locker'],
  },
  gym_barista: {
    role: 'juice bar attendant', level: [1, 2], tags: ['staff'], faction: null,
    names: 'person', weapons: ['broken_bottle'], loot: ['protein_tub', 'neural_gum'], lootChance: 0.4, cash: [10, 50],
    desc: ['an attendant at the blender, who has opinions about kale', 'someone behind the counter making a drink that is a colour she has not seen'],
  },
  gym_physio: {
    role: 'physio', level: [2, 3], tags: ['staff', 'doc'], faction: null,
    names: 'person', weapons: [], loot: ['patch_kit', 'neural_gum'], lootChance: 0.4, cash: [20, 90],
    desc: ['a physio with strong thumbs and a quiet, merciless professional smile', 'a physio who can find the bruise she has not met yet'],
  },
  gym_influencer: {
    role: 'gym influencer', level: [1, 2], tags: ['staff', 'influencer'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'neural_gum', 'walkman'], lootChance: 0.4, cash: [15, 90],
    desc: ['an influencer with a ring light on a stick and an audience of eleven', 'a tanned influencer filming a set from three angles, one of which is her own'],
  },
  atlas_rep: {
    role: 'Atlas wellness rep', level: [2, 3], tags: ['corp', 'staff'], faction: 'atlas',
    names: 'person', weapons: ['zip_pistol'], loot: ['corp_creds', 'fake_id'], lootChance: 0.3, cash: [40, 150],
    desc: ['a cheerful Atlas wellness rep with a lanyard, a clipboard and a smile that has never been tested', 'an Atlas rep in a branded vest, delighted to inform her that she is, technically, covered'],
  },
  sparring_bot: {
    role: 'sparring robot', level: [3, 4], tags: ['robot', 'guard', 'staff'], faction: null,
    names: 'robot', weapons: [], loot: ['drone_core', 'scrap_metal'], lootChance: 0.5, cash: [0, 0], hp: 70, power: 10,
    desc: ['a sparring robot with padded hands and a calm, unblinking sensor', 'a sparring bot in boxing gloves, standing in the corner like a very good idea'],
  },
  pit_boss: {
    role: 'pit boss', level: [5, 6], tags: ['staff', 'strong', 'bookie'], faction: null,
    names: 'person', weapons: ['judgment', 'switchblade'], loot: ['credchip', 'champ_belt', 'fake_id'], lootChance: 0.6, cash: [100, 320],
    desc: ['a pit boss with a ledger, a patient stare and a ring of keys', 'a pit boss in a very good suit who has been splashed with something and does not mention it'],
  },
  pit_fighter: {
    role: 'pit fighter', level: [3, 7], tags: ['strong', 'pit', 'fighter'], faction: null,
    names: 'person', weapons: ['speed_gloves'], armors: ['boxing_wraps'], armorChance: 0.4, loot: ['champ_belt', 'credchip', 'gold_tooth'], lootChance: 0.35, cash: [30, 160],
    desc: ['a pit fighter with a shaved head, taped knuckles and a face that is mostly scar tissue', 'a pit fighter who smiles at her like an old friend and holds the smile like a guard', 'a fighter with a bandaged hand and a tattoo of the number of fights she has won'],
  },
  // ---------------- Pawn shops (content/pawns.ts) ----------------
  pawn_broker: {
    role: 'pawnbroker', level: [3, 5], tags: ['owner', 'staff', 'broker'], faction: null,
    names: 'person', weapons: ['judgment', 'switchblade'], loot: ['credchip', 'signet_ring', 'chrono_watch', 'gold_band'], lootChance: 0.6, cash: [90, 320],
    desc: ['a pawnbroker with a loupe pushed up into grey hair and a ledger that has outlived two marriages', 'a pawnbroker who weighs everything she says before saying it', 'a broker in a cardigan with a bat under the counter and no visible reason for it', 'a pawnbroker with a ring on every finger and a price for each of them'],
  },
  pawn_clerk: {
    role: 'clerk', level: [1, 3], tags: ['staff', 'clerk'], faction: null,
    names: 'person', weapons: ['broken_bottle'], loot: ['credchip', 'walkman', 'gold_tooth'], lootChance: 0.4, cash: [10, 60],
    desc: ['a clerk with a tag gun and a face like a closed shutter', 'a clerk on a stool, pricing a lamp with great care', 'a clerk who has seen everything and has been told to smile anyway'],
  },
  pawn_appraiser: {
    role: 'appraiser', level: [2, 5], tags: ['staff', 'appraiser'], faction: null,
    names: 'person', weapons: [], loot: ['chrono_watch', 'diamond_stud', 'credchip'], lootChance: 0.35, cash: [30, 130],
    desc: ['an appraiser with a loupe, a lamp and a stare that takes everything apart', 'a quiet appraiser who weighs her coat before weighing her words', 'an appraiser with a clipboard and a tilt of the head that means no', 'a very still appraiser who has priced everything she owns, and has not mentioned it'],
  },
  pawn_tinker: {
    role: 'repair tech', level: [2, 4], tags: ['staff', 'tinker'], faction: null,
    names: 'person', weapons: ['cleaver'], loot: ['solder_kit', 'torque_wrench', 'scrap_metal'], lootChance: 0.4, cash: [15, 70],
    desc: ['a repair tech with a soldering iron and a radio on a single station', 'a tech elbow-deep in a thing that used to be a speaker', 'a tinker with ten screwdrivers in a belt and not one of them is the right one'],
  },
  pawn_guard: {
    role: 'shop guard', level: [2, 4], tags: ['staff', 'strong', 'security', 'guard'], faction: null,
    names: 'person', weapons: ['judgment', 'service_pistol'], armors: ['leather_jacket'], armorChance: 0.4, loot: ['credchip', 'switchblade'], lootChance: 0.3, cash: [10, 70],
    desc: ['a guard on a stool by the grille with an expression he has been practising', 'a large, tired guard who greets every customer as a suspect and every suspect as a customer', 'a guard with a keyring the size of a fist and the patience of a stone'],
  },
  pawn_regular: {
    role: 'customer', level: [1, 2], tags: ['regular', 'customer'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman', 'mom_photo', 'gold_tooth'], lootChance: 0.3, cash: [2, 45],
    desc: ['a customer holding a small box and a large worry', 'a customer comparing two identical watches with total conviction', 'someone turning a brass horn over and over, quietly pricing it in their head', 'a person at the counter with a coat over one arm and a shrug in the other'],
  },
  pawn_fence: {
    role: 'fence', level: [3, 5], tags: ['strong', 'fence'], faction: null,
    names: 'person', weapons: ['switchblade', 'zip_pistol'], loot: ['credchip', 'fake_id', 'gold_tooth', 'memory_shard'], lootChance: 0.5, cash: [60, 220],
    desc: ['a fence in a long coat with an inside pocket that clinks', 'a fence leaning on a crate with a look that says everything is for sale and nothing is yours', 'a very friendly fence who has never once asked where anything came from'],
  },
  pawn_bot: {
    role: 'clerk robot', level: [2, 3], tags: ['robot', 'staff', 'clerk'], faction: null,
    names: 'robot', weapons: [], loot: ['drone_core', 'scrap_metal'], lootChance: 0.5, cash: [0, 0], hp: 60, power: 8,
    desc: ['a clerk robot with a lanyard, a name tag and a smile painted on', 'a counter bot that says "valued customer" in a voice that has never met one'],
  },
  // ---------------- Chop shops (content/chops.ts) ----------------
  chop_mechanic: {
    role: 'mechanic', level: [2, 5], tags: ['owner', 'staff', 'tinker', 'mechanic'], faction: null,
    names: 'person', weapons: ['cleaver', 'excalibur'], loot: ['solder_kit', 'torque_wrench', 'scrap_metal', 'credchip'], lootChance: 0.5, cash: [40, 180],
    desc: ['a mechanic with oil to the elbows and a cigarette that went out an hour ago', 'a mechanic who talks to the engine more kindly than to anyone else', 'a mechanic with a welding mask pushed up like a second forehead', 'a mechanic who wipes her hands on a rag that is dirtier than her hands'],
  },
  chop_guard: {
    role: 'door guard', level: [2, 4], tags: ['staff', 'strong', 'security', 'guard'], faction: null,
    names: 'person', weapons: ['judgment', 'service_pistol', 'excalibur'], armors: ['leather_jacket'], armorChance: 0.4, loot: ['credchip', 'switchblade'], lootChance: 0.3, cash: [15, 80],
    desc: ['a guard on a milk crate with a tire iron across his knees and a tin for the day rate', 'a guard who has a laminated price list and the face to enforce it', 'a large, calm guard eating noodles at the door, who stops eating only for the part about the fee'],
  },
  chop_bot: {
    role: 'door bot', level: [2, 3], tags: ['robot', 'staff', 'security', 'guard'], faction: null,
    names: 'robot', weapons: [], loot: ['drone_core', 'scrap_metal'], lootChance: 0.6, cash: [0, 0], hp: 70, power: 10,
    desc: ['a door bot with a card reader where its face should be and a voice that says "day rate, please" in four tones', 'a squat gate bot, welded to the floor on one leg, that does not accept bribes or compliments', 'a turnstile with opinions and a hydraulic arm'],
  },
  chop_regular: {
    role: 'customer', level: [1, 2], tags: ['regular', 'customer'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'scrap_metal', 'walkman'], lootChance: 0.3, cash: [5, 60],
    desc: ['a customer taking a stolen scooter apart one panel at a time', 'someone hunched over a vice, extremely careful with something that looks like a toaster', 'a regular with a bag of mismatched bolts, sorting them by feel'],
  },

  // ---------------- Hacker hubs (content/hubs.ts) ----------------
  hub_sysop: {
    role: 'sysop', level: [3, 6], tags: ['owner', 'staff', 'tinker', 'hacker'], faction: null,
    names: 'person', weapons: ['judgment', 'zip_pistol', 'excalibur'], loot: ['data_slate', 'memory_shard', 'solder_kit', 'credchip'], lootChance: 0.55, cash: [60, 260],
    desc: ['a sysop with four monitors reflected in her glasses and a mug that says WORLD\'S OKAYEST ADMIN', 'a sysop who answers every question with a link', 'a sysop in a hoodie older than most of the customers, eating noodles with a screwdriver', 'a sysop who has not looked up from the terminal since the last government'],
  },
  hub_dean: {
    role: 'dean of aptitude', level: [3, 6], tags: ['owner', 'staff', 'hacker', 'titan'], faction: null,
    names: 'person', weapons: ['service_pistol', 'stunner_mk3'], armors: ['leather_jacket'], armorChance: 0.4, loot: ['data_slate', 'credchip', 'memory_shard'], lootChance: 0.5, cash: [90, 320],
    desc: ['a dean in a soft grey suit with a lanyard, a warm smile and a small eye on the lapel', 'a dean who asks how she is feeling and appears to hear the answer', 'a dean who has not stopped smiling since orientation, which was a long time ago'],
  },
  hub_teacher: {
    role: 'instructor', level: [3, 5], tags: ['staff', 'tinker', 'hacker', 'teacher'], faction: null,
    names: 'person', weapons: ['switchblade', 'excalibur'], loot: ['data_slate', 'memory_shard', 'solder_kit', 'credchip'], lootChance: 0.5, cash: [40, 160],
    desc: ['an instructor with a laser pointer and the patience of someone who has explained it eleven times', 'an instructor who says "obviously" and then goes slowly', 'an instructor with a mug of cold tea and a very long, very quiet sigh', 'an instructor who teaches with their hands and never with a slide'],
  },
  hub_desk: {
    role: 'front desk', level: [1, 3], tags: ['staff', 'clerk'], faction: null,
    names: 'person', weapons: ['broken_bottle'], loot: ['credchip', 'walkman'], lootChance: 0.35, cash: [8, 50],
    desc: ['a front-desk clerk with a ledger, a lanyard and a face that says "terms apply"', 'a clerk at the desk doing three things at once, none of them with eye contact', 'a clerk who knows everyone\'s membership tier and nothing about what they are for'],
  },
  hub_regular: {
    role: 'regular', level: [1, 3], tags: ['regular', 'customer', 'hacker'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'data_slate', 'walkman'], lootChance: 0.3, cash: [3, 55],
    desc: ['a regular hunched at a terminal, typing with the intensity of prayer', 'a regular with a pair of headphones the size of a small dog', 'a regular who has been here since yesterday and is not leaving until the thing compiles', 'a regular in a hoodie, eating cold noodles with one hand and typing with the other'],
  },
  hub_guard: {
    role: 'door guard', level: [2, 4], tags: ['staff', 'strong', 'security', 'guard'], faction: null,
    names: 'person', weapons: ['judgment', 'service_pistol', 'excalibur'], armors: ['leather_jacket'], armorChance: 0.4, loot: ['credchip', 'switchblade'], lootChance: 0.3, cash: [12, 70],
    desc: ['a guard on a stool by the door with a list of handles and no photos', 'a large, calm guard who has heard every excuse for not having a pass', 'a guard who checks the bag and the face and, absurdly, the pulse'],
  },
  hub_bot: {
    role: 'house AI', level: [2, 3], tags: ['robot', 'staff', 'clerk'], faction: null,
    names: 'robot', weapons: [], loot: ['drone_core', 'memory_shard'], lootChance: 0.6, cash: [0, 0], hp: 60, power: 8,
    desc: ['a house AI in a squat kiosk with a screen for a face that grades everyone to two decimal places', 'a cheerful kiosk that says "welcome, 6.2" to people it likes less'],
  },
  hub_counsellor: {
    role: 'aptitude counsellor', level: [2, 4], tags: ['staff', 'titan', 'hacker'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'data_slate'], lootChance: 0.35, cash: [20, 90],
    desc: ['a counsellor with a clipboard, a mug and a way of tilting their head that makes it hard to lie', 'a counsellor who wants to know how she feels about her feelings, with a small, happy eye on the lanyard', 'a counsellor with a lovely voice and a form for everything'],
  },
  tw_liaison: {
    role: 'Titanware liaison', level: [2, 4], tags: ['staff', 'titan', 'liaison'], faction: null,
    names: 'person', weapons: ['stunner_mk3'], armors: ['leather_jacket'], armorChance: 0.5, loot: ['data_slate', 'credchip', 'memory_shard'], lootChance: 0.5, cash: [30, 130],
    desc: ['a Titanware liaison in a polo shirt with a small, open eye on the chest and a tablet that has already read her', 'a liaison with a lanyard and a laugh a half-second after the joke', 'a liaison who looks at her pulse before her face'],
  },
  ...MUSIC_ARCHETYPES,
};

/** Who these archetypes tend to be, beyond the job. Anything not listed is anyone between 22 and 55. */
const PEOPLE: Record<string, PersonSpec> = {
  barkeep: { women: 0, age: [42, 62] },
  bartender: { women: 0.6, age: [24, 42] },
  hacker: { women: 0.6, age: [20, 38] },
  bouncer: { women: 0.25, age: [26, 48] },
  ganger: { age: [18, 36] },
  mugger: { age: [18, 38] },
  dealer: { age: [18, 42] },
  corpo: { age: [26, 52] },
  cop: { age: [26, 54] },
  fixer: { age: [35, 66] },
  doc: { age: [34, 72] },
  prophet: { age: [40, 82] },
  cook: { age: [28, 62] },
  patron: { age: [21, 78] },
  noodler: { age: [30, 72] },
  club_security: { women: 0.3, age: [24, 46] },
  dj: { age: [22, 46] },
  dancer: { women: 0.8, age: [20, 40] },
  heir: { age: [19, 36] },
  helix_guard: { women: 0.4, age: [25, 52] },
  scientist: { age: [28, 62] },
  bandmate: { age: [20, 42] },
  paint_clerk: { women: 0.6, age: [20, 40] },
  pharmacist: { age: [30, 62] },
  gunsmith: { age: [34, 64] },
  street_kid: { age: [18, 26] },
  damsel: { women: 1, age: [20, 36] },
  npd_officer: { age: [24, 56] },
  npd_sergeant: { age: [38, 60] },
  shopkeeper: { age: [26, 68] },
  realtor: { age: [28, 60] },
  atlas_trooper: { women: 0.4, age: [24, 48] },
  atlas_officer: { women: 0.4, age: [34, 58] },
  gang_runner: { age: [18, 30] },
  gang_enforcer: { age: [22, 40] },
  gang_captain: { age: [30, 52] },
  drifter: { age: [19, 72] },
  pawn_broker: { age: [38, 72] },
  pawn_appraiser: { age: [30, 70] },
  pawn_fence: { age: [26, 60] },
  pawn_guard: { women: 0.3, age: [24, 56] },
  chop_mechanic: { women: 0.5, age: [28, 66] },
  chop_guard: { women: 0.3, age: [24, 56] },
  hub_sysop: { women: 0.45, age: [24, 62] },
  hub_dean: { women: 0.5, age: [34, 64] },
  hub_teacher: { women: 0.5, age: [26, 66] },
  hub_counsellor: { women: 0.55, age: [26, 58] },
  tw_liaison: { women: 0.5, age: [24, 52] },
  ...MUSIC_PEOPLE,
};

export const GANGS: Record<string, string> = {
  vipers: 'Chrome Vipers',
  sixers: 'Saint Sixers',
  marrow: 'Neon Marrow',
  choir: 'Rust Choir',
};

const FIRST = [
  'Nyx', 'Juno', 'Kestrel', 'Mox', 'Rook', 'Zed', 'Vesper', 'Jinx', 'Sable', 'Dex', 'Marlowe', 'Echo', 'Pike',
  'Lux', 'Ono', 'Fennec', 'Cass', 'Tarn', 'Ripley', 'Nova', 'Bishop', 'Quill', 'Raze', 'Odalys', 'Hex',
];
const LAST = [
  'Calloway', 'Okonkwo-Vance', 'Vantablack', 'Ibarra', 'Kowalczyk', 'Nakamura-Reyes', 'Dross', 'Maddox', 'Sterling-9',
  'Voss', 'Larkspur', 'Quint', 'Ashgrove', 'Tanaka-Bell', 'Lovelace', 'Achebe', 'Mercer', 'Hollis',
];
const ROBOT = ['UNIT', 'MK', 'BOT', 'SENTRY', 'AUTO'];

const KID = ['Pixel', 'Wire', "Lil' Static", 'Moth', 'Bytes', 'Glitch', 'Noodle', 'Zip', 'Tick', 'Dot', 'Rust', 'Mouse'];

export function rollNpcName(rng: Rng, kind: ArchetypeDef['names']): string {
  if (kind === 'kid') return rng.pick(KID);
  if (kind === 'robot') return `${rng.pick(ROBOT)}-${rng.int(100, 999)}`;
  if (kind === 'monster') return 'CINDERJAW';
  if (kind === 'artemis') return callsign(rng, 'ARTEMIS', 'artemis');
  if (kind === 'hera') return `HERA-V "${rng.pick(CALLSIGNS.hera!)}"`;
  if (kind === 'hermes') return callsign(rng, 'HERMES', 'hermes');
  if (kind === 'nextday') return callsign(rng, 'HERMES', 'express');
  if (kind === 'demeter') return callsign(rng, 'DEMETER', 'demeter');
  if (kind === 'ares') return callsign(rng, 'ARES', 'ares');
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

export function spawnNpc(rng: Rng, id: string, archetype: string, locationId: string, opts: { name?: string; faction?: string; gender?: Gender; age?: number; grade?: number } = {}): Npc {
  const def = ARCHETYPES[archetype];
  if (!def) throw new Error(`unknown archetype ${archetype}`);
  const rolled = rng.int(def.level[0], def.level[1]);
  // (The dragons are landmarks on the grade scale, not locals: they are the same wherever they fly.)
  if (def.tags.includes('dragon')) opts = { ...opts, grade: undefined };
  // Given a local grade (how dangerous the place is, see grade.ts), the archetype's level says where it stands among its
  // neighbours: a barkeep is a notch above a drifter wherever they are, and the gap widens as the grades climb.
  const level = opts.grade === undefined ? rolled : Math.max(1, Math.round(opts.grade + (rolled - 3) * (1 + opts.grade / 40)));
  const loadout: Item[] = [];
  let weaponPower = 0;
  if (def.weapons.length) {
    const wpn = variantOf(rng, makeItem(rng.pick(def.weapons)));
    loadout.push(wpn);
    weaponPower = Math.round(rating(wpn) * (opts.grade === undefined ? 1 : 1 + level / 25));
  }
  // Shooters carry spare rounds, which is how she ends up with any.
  const gun = loadout[0];
  if (gun?.ammoType && rng.chance(0.65)) loadout.push(makeAmmoBox(gun.ammoType, (gun.perRound ?? 1) * rng.int(3, 7)));
  if (def.armors && rng.chance(def.armorChance ?? 0)) loadout.push(makeItem(rng.pick(def.armors)));
  if (def.loot.length && rng.chance(def.lootChance)) loadout.push(makeItem(rng.pick(def.loot)));
  // Fixed-stat things (dogs, turrets, bots) are scaled from the grade they were written for.
  const ref = Math.max(5, (def.level[0] + def.level[1]) / 2);
  const hp = opts.grade === undefined ? def.hp ?? 18 + level * 12 : def.hp ? Math.round(def.hp * Math.max(1, baseHp(level) / baseHp(ref))) : Math.round(baseHp(level));
  const name = opts.name ?? rollNpcName(rng, def.names);
  const machine = def.names !== 'person' && def.names !== 'kid';
  const person = rollPerson(id, name, { ...PEOPLE[archetype], machine }, { gender: opts.gender, age: opts.age });
  return {
    id,
    name,
    age: person.age,
    gender: person.gender,
    archetype,
    role: def.role,
    locationId,
    hp,
    maxHp: hp,
    level,
    power: opts.grade === undefined ? def.power ?? level * 2 + weaponPower : def.power ? Math.round(def.power * Math.max(1, basePower(level) / basePower(ref))) : Math.round(basePower(level)) + weaponPower,
    tags: [...def.tags],
    faction: opts.faction ?? def.faction,
    affinity: def.startAffinity ?? 0,
    alive: true,
    hostile: false,
    loadout,
    cash: rng.int(def.cash[0], def.cash[1]),
    memories: [],
    flags: [],
    downUntil: 0,
  };
}
