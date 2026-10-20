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
};
