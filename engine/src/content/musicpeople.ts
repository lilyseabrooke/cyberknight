import type { PersonSpec } from '../people';
import type { ArchetypeDef } from './archetypes';

/**
 * The people of the music venues (content/venues.ts): who runs a studio, who sits on its couch, who stamps the lyrics.
 * Spread into ARCHETYPES (content/archetypes.ts), so they spawn like anyone else.
 */
export const MUSIC_ARCHETYPES: Record<string, ArchetypeDef> = {
  // ---------------- Recording studios (content/studios.ts) ----------------
  studio_producer: {
    role: 'producer', level: [3, 6], tags: ['owner', 'staff', 'producer', 'musician'], faction: null,
    names: 'person', weapons: ['judgment', 'zip_pistol'], loot: ['credchip', 'walkman', 'memory_shard'], lootChance: 0.5, cash: [80, 300],
    desc: ['a producer in sunglasses indoors, nodding at a take nobody else can hear yet', 'a producer who says "one more" in a way that means eleven', 'a producer with a scarf, a theory about snare drums and a long memory for who owes her a session', 'a producer eating a sandwich over the most expensive desk in the district'],
  },
  studio_engineer: {
    role: 'engineer', level: [2, 5], tags: ['staff', 'engineer', 'tinker'], faction: null,
    names: 'person', weapons: ['switchblade'], loot: ['solder_kit', 'memory_shard', 'credchip'], lootChance: 0.45, cash: [30, 140],
    desc: ['an engineer with one headphone on and one off, permanently, like a man listening to two worlds', 'an engineer who has labelled every cable with a joke', 'an engineer who can hear a fridge in the next building and will tell you so'],
  },
  studio_runner: {
    role: 'studio runner', level: [1, 2], tags: ['staff', 'runner'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman'], lootChance: 0.3, cash: [5, 40],
    desc: ['a runner with a tray of teas and a demo tape in every pocket', 'a runner who knows the lyrics to everything recorded here and pretends not to', 'a runner on the phone, a sandwich and a pen in the other hand'],
  },
  studio_session: {
    role: 'session player', level: [2, 5], tags: ['musician', 'session', 'band', 'regular'], faction: null,
    names: 'person', weapons: ['broken_bottle'], loot: ['credchip', 'walkman'], lootChance: 0.35, cash: [20, 120],
    desc: ['a session guitarist who has played on a thousand records and is credited on none of them', 'a session player with a case in each hand and a rate card in her back pocket', 'a session bassist reading a paperback between takes, never once looking at the neck'],
  },
  session_legend: {
    role: 'session legend', level: [4, 6], tags: ['musician', 'session', 'band', 'regular', 'legend'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman'], lootChance: 0.4, cash: [30, 160],
    desc: ['an old session legend on the couch who played on everything, and says so, and is right', 'a white-haired guitarist with hands like roots, who once taught a famous person a chord and still bills for it'],
  },
  studio_client: {
    role: 'client', level: [1, 3], tags: ['customer', 'regular', 'musician'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman'], lootChance: 0.3, cash: [10, 90],
    desc: ['a hopeful with a demo on a cassette and a haircut that is doing a lot of the work', 'a band\'s worth of people sharing one sandwich', 'a singer warming up in the corridor at a pitch only dogs should hear'],
  },
  studio_guard: {
    role: 'studio security', level: [2, 4], tags: ['staff', 'strong', 'security', 'guard'], faction: null,
    names: 'person', weapons: ['judgment', 'service_pistol'], armors: ['leather_jacket'], armorChance: 0.4, loot: ['credchip'], lootChance: 0.3, cash: [15, 70],
    desc: ['a large man in a studio-crew T-shirt who has thrown out three famous people this year', 'a guard who checks the guest list against the names on the gold records'],
  },
  studio_bot: {
    role: 'robot producer', level: [2, 4], tags: ['robot', 'owner', 'staff', 'producer'], faction: null,
    names: 'robot', weapons: [], loot: ['drone_core', 'memory_shard'], lootChance: 0.6, cash: [0, 0], hp: 70, power: 8,
    desc: ['a robot producer behind glass with a face of two blinking dots and a voice that says "nice energy" about everything', 'a robot producer that moves its own faders and hums the lockdown chime when it thinks no one is listening'],
  },
  jingle_client: {
    role: 'brand manager', level: [1, 3], tags: ['corp', 'client', 'customer'], faction: null,
    names: 'person', weapons: [], loot: ['corp_creds', 'credchip'], lootChance: 0.5, cash: [60, 260],
    desc: ['a brand manager with a brief that says "warm, but compliant" and a deadline written on her hand', 'a client in a suit the colour of a logo, who wants it to sound "like trust, but faster"'],
  },
  clearance_officer: {
    role: 'Muse Clearance officer', level: [2, 4], tags: ['muse', 'clearance', 'staff'], faction: 'muse',
    names: 'person', weapons: ['stunner_mk3'], loot: ['muse_lanyard', 'credchip', 'bootleg_tapes'], lootChance: 0.5, cash: [30, 110],
    desc: ['a Muse Clearance officer with a pastel clipboard and a stamp holster', 'a Clearance officer who calls every song "brave" before confiscating it', 'a Clearance officer humming a LUMINA chorus, highlighting lyrics in pink'],
  },

  // ---------------- Cutting rooms (content/cuttings.ts) ----------------
  cutting_host: {
    role: 'host', level: [3, 6], tags: ['owner', 'staff', 'host'], faction: null,
    names: 'person', weapons: ['judgment', 'zip_pistol'], loot: ['credchip', 'walkman'], lootChance: 0.5, cash: [80, 300],
    desc: ['a host with a microphone, a bell and a voice that could start a riot or end one', 'a host in a sequinned jacket three sizes too loud, who calls every bout like a prize fight', 'a host with a clipboard of grudges and the patience of a landmine'],
  },
  cutting_champ: {
    role: 'house champion', level: [4, 7], tags: ['musician', 'champion', 'regular'], faction: null,
    names: 'person', weapons: ['broken_bottle', 'judgment'], loot: ['credchip', 'walkman'], lootChance: 0.4, cash: [40, 200],
    desc: ['the house champion, leaning on the bar with a guitar across the back like a sword', 'the house champion: calm, scarred, two fingers taped, and nobody has seen them lose', 'the house champion, signing a fan\'s arm without looking up'],
  },
  cutting_robot: {
    role: 'house robot', level: [4, 7], tags: ['robot', 'musician', 'champion'], faction: null,
    names: 'robot', weapons: [], loot: ['drone_core', 'memory_shard', 'lumina_chip'], lootChance: 0.5, cash: [0, 0], hp: 120, power: 14,
    desc: ['the house robot, a chrome guitarist with six arms and a face like a polite mirror', 'a robot champion humming a LUMINA chorus at a frequency only amps can hear'],
  },
  cutting_judge: {
    role: 'judge', level: [2, 4], tags: ['staff', 'judge'], faction: null,
    names: 'person', weapons: [], loot: ['credchip'], lootChance: 0.3, cash: [20, 90],
    desc: ['a judge with ear defenders around the neck and a scorecard in very small writing', 'a judge who has heard everything and liked eleven of it'],
  },
  cutting_challenger: {
    role: 'challenger', level: [2, 5], tags: ['musician', 'challenger', 'regular'], faction: null,
    names: 'person', weapons: ['broken_bottle'], loot: ['credchip', 'walkman'], lootChance: 0.35, cash: [10, 90],
    desc: ['a challenger tuning by the side of the stage with the face of someone who has practised for this in a mirror', 'a challenger with a borrowed guitar and an enormous amount of hair', 'a challenger doing finger exercises at the bar, muttering a setlist'],
  },
  cutting_fan: {
    role: 'punter', level: [1, 3], tags: ['regular', 'customer', 'crowd'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman'], lootChance: 0.3, cash: [5, 60],
    desc: ['a punter with a drink in each hand and an opinion in each ear', 'a punter in a T-shirt of a band that lost here last week', 'a punter who has seen every final for ten years and says the old champion was better'],
  },
  cutting_bouncer: {
    role: 'bouncer', level: [3, 5], tags: ['staff', 'strong', 'security', 'guard'], faction: null,
    names: 'person', weapons: ['judgment', 'service_pistol'], armors: ['leather_jacket'], armorChance: 0.5, loot: ['credchip'], lootChance: 0.3, cash: [15, 70],
    desc: ['a bouncer who escorts the losers out with a hand on the shoulder, gently, like an undertaker', 'a bouncer with ear defenders and a look that says he has already heard the bad guitarist'],
  },
  muse_scout: {
    role: 'Muse A&R scout', level: [2, 4], tags: ['muse', 'scout'], faction: 'muse',
    names: 'person', weapons: ['stunner_mk3'], loot: ['muse_lanyard', 'credchip'], lootChance: 0.6, cash: [60, 220],
    desc: ['a Muse A&R scout with a pastel lanyard and a pen already uncapped', 'a Muse scout taking notes in a notebook with a heart on it, smiling at nobody'],
  },
  crossroads_stranger: {
    role: 'stranger', level: [8, 8], tags: ['musician', 'stranger', 'champion'], faction: null,
    names: 'person', weapons: ['judgment'], loot: ['credchip', 'walkman'], lootChance: 0.5, cash: [100, 400],
    desc: ['a stranger at the end of the bar in a good suit, with a guitar case that is very old and very clean, who knows her name'],
  },

  // ---------------- Muse buildings (content/musehqs.ts) ----------------
  muse_exec: {
    role: 'Muse executive', level: [4, 7], tags: ['owner', 'staff', 'muse', 'exec'], faction: 'muse',
    names: 'person', weapons: ['stunner_mk3', 'service_pistol'], armors: ['leather_jacket'], armorChance: 0.4, loot: ['corp_creds', 'muse_lanyard', 'credchip'], lootChance: 0.7, cash: [150, 500],
    desc: ['a Muse executive in a cashmere pastel suit, smiling at everything with the same exact smile', 'a Muse executive who says "we\'re a family here" and means the other kind of family', 'a Muse executive with a heart pin and a calendar full of acquisitions'],
  },
  muse_receptionist: {
    role: 'Muse receptionist', level: [1, 3], tags: ['staff', 'muse', 'clerk'], faction: 'muse',
    names: 'person', weapons: [], loot: ['muse_lanyard', 'credchip'], lootChance: 0.5, cash: [10, 60],
    desc: ['a receptionist with a ring light, a headset and a voice like a LUMINA B-side', 'a receptionist who greets everyone by name and nobody by choice'],
  },
  muse_staffer: {
    role: 'Muse staffer', level: [1, 3], tags: ['staff', 'muse', 'regular'], faction: 'muse',
    names: 'person', weapons: [], loot: ['muse_lanyard', 'credchip', 'data_slate'], lootChance: 0.45, cash: [15, 90],
    desc: ['a Muse staffer in a pastel cardigan, carrying a spreadsheet of feelings', 'a staffer with three lanyards, all different colours, and a tired face', 'a staffer humming a LUMINA chorus against their will'],
  },
  muse_visitor: {
    role: 'visitor', level: [1, 2], tags: ['customer', 'regular'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman'], lootChance: 0.3, cash: [10, 80],
    desc: ['a tourist in a LUMINA T-shirt, filming the fountain', 'a nervous young singer with a demo and a parent', 'a fan holding a sign for LUMINA, and another, folded, for Blackbird'],
  },
  atlas_consultant: {
    role: 'Atlas M&A consultant', level: [3, 5], tags: ['corp', 'atlas', 'consultant'], faction: 'atlas',
    names: 'person', weapons: ['service_pistol'], loot: ['corp_creds', 'data_slate', 'credchip'], lootChance: 0.8, cash: [120, 400],
    desc: ['an Atlas Mergers & Acquisitions consultant measuring the lobby with his eyes, and possibly a tape', 'a consultant from Atlas M&A, smiling the hungry smile of somebody who works for Gluttony'],
  },

  // ---------------- Luthiers (content/luthiers.ts) ----------------
  luthier: {
    role: 'luthier', level: [3, 6], tags: ['owner', 'staff', 'luthier', 'tinker', 'musician'], faction: null,
    names: 'person', weapons: ['cleaver', 'judgment'], loot: ['solder_kit', 'credchip', 'walkman'], lootChance: 0.5, cash: [60, 260],
    desc: ['a luthier with sawdust in her eyebrows and a pencil behind each ear', 'a luthier who taps every board and listens to it like a doctor with a stethoscope', 'a luthier with glue on his fingers, varnish on his apron and very strong views about necks'],
  },
  luthier_bot: {
    role: 'robot luthier', level: [3, 5], tags: ['robot', 'owner', 'staff', 'luthier'], faction: null,
    names: 'robot', weapons: [], loot: ['drone_core', 'memory_shard', 'solder_kit'], lootChance: 0.6, cash: [0, 0], hp: 80, power: 9,
    desc: ['a robot luthier with six careful arms, humming a dead master\'s favourite song in a dead master\'s voice'],
  },
  luthier_apprentice: {
    role: 'apprentice', level: [1, 3], tags: ['staff', 'apprentice', 'tinker'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'solder_kit'], lootChance: 0.35, cash: [5, 40],
    desc: ['an apprentice sanding the same neck for the third day, very carefully', 'an apprentice with a plaster on every finger and a look of total dedication'],
  },
  luthier_customer: {
    role: 'customer', level: [1, 3], tags: ['customer', 'regular', 'musician'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman'], lootChance: 0.3, cash: [20, 120],
    desc: ['a customer holding a guitar in two pieces like a wounded pet', 'a customer trying every guitar on the wall and buying none of them', 'a touring guitarist with a broken neck (the guitar\'s) and a show tonight'],
  },

  // ---------------- Fan clubs (content/fanclubs.ts) ----------------
  club_president: {
    role: 'fan club president', level: [2, 4], tags: ['owner', 'staff', 'fan', 'superfan'], faction: null,
    names: 'person', weapons: ['judgment'], loot: ['bootleg_tapes', 'credchip', 'walkman'], lootChance: 0.6, cash: [30, 150], startAffinity: 40,
    desc: ['the fan club president, with a lanyard of every show she has played and a clipboard of every one she will', 'the president, in a T-shirt of her face from three bodies ago, who has not missed a show since', 'the president, crying slightly, because she is here'],
  },
  superfan: {
    role: 'superfan', level: [1, 4], tags: ['fan', 'superfan', 'regular'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman', 'bootleg_tapes'], lootChance: 0.5, cash: [20, 120], startAffinity: 35,
    desc: ['a superfan in a work uniform under a Blackbird hoodie, who has come straight from a shift', 'a superfan with her lyrics on a forearm and a very important job they are about to mention', 'a superfan who has been waiting years to do her a favour'],
  },
  club_member: {
    role: 'fan', level: [1, 3], tags: ['fan', 'regular', 'customer'], faction: null,
    names: 'person', weapons: [], loot: ['credchip', 'walkman'], lootChance: 0.3, cash: [5, 60], startAffinity: 25,
    desc: ['a fan in a T-shirt of her, from a body she does not have now', 'a member humming one of her B-sides', 'a fan who goes completely still when she walks in'],
  },
  tribute_guitarist: {
    role: 'tribute guitarist', level: [3, 6], tags: ['musician', 'band', 'tribute', 'fan'], faction: null,
    names: 'person', weapons: ['broken_bottle'], loot: ['credchip', 'walkman'], lootChance: 0.4, cash: [20, 120], startAffinity: 30,
    desc: ['the guitarist from her tribute band, in her old haircut, who plays her riffs better than she can right now and knows it', 'a tribute guitarist with a wig, a borrowed swagger and her exact hand position from three bodies ago'],
  },
};

/** Who these archetypes tend to be, beyond the job. */
export const MUSIC_PEOPLE: Record<string, PersonSpec> = {
  studio_producer: { women: 0.5, age: [28, 66] },
  studio_engineer: { women: 0.4, age: [24, 70] },
  studio_runner: { age: [19, 28] },
  studio_session: { women: 0.5, age: [24, 62] },
  session_legend: { women: 0.3, age: [58, 82] },
  studio_client: { age: [19, 44] },
  studio_guard: { women: 0.3, age: [24, 52] },
  jingle_client: { women: 0.55, age: [26, 54] },
  clearance_officer: { women: 0.55, age: [24, 50] },
  cutting_host: { women: 0.45, age: [30, 64] },
  cutting_champ: { women: 0.5, age: [24, 66] },
  cutting_judge: { age: [40, 78] },
  cutting_challenger: { women: 0.5, age: [19, 52] },
  cutting_bouncer: { women: 0.3, age: [26, 54] },
  muse_scout: { women: 0.55, age: [26, 48] },
  crossroads_stranger: { women: 0.5, age: [40, 90] },
  muse_exec: { women: 0.55, age: [32, 62] },
  muse_receptionist: { women: 0.6, age: [21, 40] },
  muse_staffer: { women: 0.55, age: [22, 55] },
  atlas_consultant: { women: 0.35, age: [30, 60] },
  luthier: { women: 0.45, age: [30, 80] },
  luthier_apprentice: { women: 0.5, age: [18, 30] },
  luthier_customer: { women: 0.45, age: [18, 66] },
  club_president: { women: 0.6, age: [22, 70] },
  superfan: { women: 0.55, age: [20, 64] },
  club_member: { women: 0.55, age: [18, 70] },
  tribute_guitarist: { women: 0.6, age: [20, 50] },
};
