import type { Location, VenueInfo } from '../types';
import type { SlotDef } from '../roster';
import type { VenueTables } from './venues';
import { MIN_PER_DAY } from '../clock';

/**
 * Arenas: the biggest rooms in Neo, and a show day run like an operation. Every day an arena has a bill (LUMINA, a Muse act, an
 * Atlas safety rally, a laser-league match, monster trucks, a prize fight, a festival, nothing at all) and every hour of a show day
 * is a phase that opens different doors: load-in (past security with the crew), soundcheck (sightlines), doors (the queue), the show
 * (the vault, the boxes, while everyone is looking at the stage), the encore (the stage itself, the jumbotron) and load-out (the
 * trucks). See arena.ts and content/arenaafford.ts.
 */

/** The phase of a show day, by the hour. A pure function of the clock. */
export function arenaPhase(clock: number): string[] {
  const m = ((clock % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const h = m / 60;
  if (h >= 14 && h < 17) return ['load_in'];
  if (h >= 17 && h < 19) return ['soundcheck'];
  if (h >= 19 && h < 20.5) return ['doors'];
  if (h >= 20.5 && h < 23) return ['show'];
  if (h >= 23) return ['encore'];
  if (h < 2.5) return ['load_out'];
  return ['between'];
}

export const PHASES = ['load_in', 'soundcheck', 'doors', 'show', 'encore', 'load_out', 'between'] as const;
const PHASES_LIST: readonly string[] = PHASES;

export const ARENA: VenueTables = {
  kind: 'arena',
  label: 'an arena',
  chance: { market: 0.01, nightlife: 0.016, tenement: 0.005, industrial: 0.008, corporate: 0.014, slum: 0.004 },
  lean: {
    market: { stadium: 1, dome: 2, amphitheatre: 1.5, velodrome: 1, hangar: 1, muse_arena: 2, atlas_dome: 0.5, quarry: 0.5 },
    nightlife: { stadium: 1, dome: 3, amphitheatre: 1, velodrome: 1, hangar: 2, muse_arena: 4, atlas_dome: 0.5, quarry: 0.5 },
    tenement: { stadium: 2, dome: 1, amphitheatre: 2, velodrome: 1, hangar: 1, muse_arena: 0.5, atlas_dome: 0.3, quarry: 2 },
    industrial: { stadium: 2, dome: 1, amphitheatre: 1, velodrome: 1.5, hangar: 4, muse_arena: 0.5, atlas_dome: 1, quarry: 3 },
    corporate: { stadium: 1, dome: 2, amphitheatre: 1, velodrome: 0.5, hangar: 0.5, muse_arena: 4, atlas_dome: 4, quarry: 0.1 },
    slum: { stadium: 2, dome: 0.5, amphitheatre: 1, velodrome: 1, hangar: 2, muse_arena: 0.2, atlas_dome: 0.2, quarry: 4 },
  },
  hours: [14, 2],
  prestige: 2.2,
  epoch: 1,
  sitChance: 1,
  phase: arenaPhase,
  // Nobody builds a small arena.
  sizes: [0.05, 0.3, 1.5, 2.5, 2],
  phaseTags: PHASES_LIST,
  variants: {
    stadium: {
      label: 'a stadium',
      names: ['The Concrete Bowl', 'Neo Municipal Stadium', 'The Old Ground', 'Stand Twelve Stadium', 'The Pitch', 'Floodlight Park', 'The Terraces', 'The People\'s Ground'],
      blurbs: [
        '{name}: forty thousand seats round a pitch, floodlights like dragons\' eyes, and a stage at one end on show nights.',
        '{name}: a stadium older than Atlas, with terraces that remember being stood on and a tunnel the players used to come out of.',
        '{name}: a bowl of concrete and noise. On show nights you can hear it three districts away.',
      ],
      wall: ['An Atlas safety banner round the whole top tier: YOUR SAFETY IS OUR STADIUM.', 'A Muse screen the size of a building, playing LUMINA between everything.', 'An Atlas drone over every stand, counting heads.'],
      price: 1.2, floor: ['main_stage', 'stands', 'loading_dock', 'green_room', 'turnstiles', 'merch_stand', 'car_park'], more: { jumbotron: 2, corporate_boxes: 2, vault: 1.5, pyro_rig: 1.5, open_roof: 2, merch_stand: 2, production_booth: 1.5 }, sec: 5, crowd: 1,
    },
    dome: {
      label: 'a dome',
      names: ['The Heartline Dome', 'Neo Dome', 'The Bubble', 'The Glass Hat', 'Dome Seven', 'The Arena Dome', 'The Big Top (Concrete)', 'The Shell'],
      blurbs: [
        '{name}: a dome of glass and girders over twenty thousand seats, and an echo that does half the work.',
        '{name}: the most famous indoor room in Neo, where every big name has played and every big name has been booed.',
        '{name}: a dome with a roof that opens on clear nights, and a sound like the inside of a bell.',
      ],
      wall: ['A Muse sponsorship ring round the rim: EVERY SEAT A FEELING 🥰.', 'An Atlas evacuation map on every door, with a cartoon dragon pointing the way.', 'An Atlas safety reel on the big screen, set to LUMINA.'],
      price: 1.3, floor: ['main_stage', 'stands', 'loading_dock', 'green_room', 'jumbotron', 'merch_stand', 'car_park'], more: { corporate_boxes: 2, vault: 1.5, production_booth: 2, open_roof: 1.5, catwalk: 2, merch_stand: 2 }, sec: 5, crowd: 1,
    },
    amphitheatre: {
      label: 'an open-air amphitheatre',
      names: ['The Bowl', 'The Old Amphitheatre', 'Stone Steps', 'The Hollow', 'The Hillside Stage', 'Moonbowl', 'The Rings', 'The Open Room'],
      blurbs: [
        '{name}: tiers of stone cut into a hill, older than the city, with a stage at the bottom and the sky on top.',
        '{name}: an open-air bowl where the acoustics were designed by someone long dead who knew exactly what they were doing.',
        '{name}: you can hear a whisper from the stage at the back. You can hear a scream from the back on the stage.',
      ],
      wall: ['An Atlas weather-warning siren on a pole at the top, for acid storms.', 'A Muse screen bolted to ancient stone, playing an advert.', 'A drone perched on a stone column like a crow.'],
      price: 1, floor: ['main_stage', 'stands', 'open_roof', 'loading_dock', 'merch_stand', 'car_park'], more: { merch_stand: 2, green_room: 1.5, pyro_rig: 1, food_stalls: 2 }, sec: 3, crowd: 0.9,
    },
    velodrome: {
      label: 'an old velodrome',
      names: ['The Velodrome', 'The Banked Track', 'Cycle Hall', 'The Oval', 'The Spin', 'The Track', 'The Old Velodrome', 'The Curve'],
      blurbs: [
        '{name}: a banked wooden track round a stage in the infield, with a crowd on the slopes like a wave about to break.',
        '{name}: an old velodrome where the races stopped years ago and the shows started. The boards still creak in time.',
        '{name}: you can run the whole banked track during a show, and people do.',
      ],
      wall: ['An Atlas "No Cycling" sign on a velodrome.', 'A Muse banner across the finish line.', 'An Atlas lap counter, repurposed to count encores.'],
      price: 0.9, floor: ['main_stage', 'banked_track', 'loading_dock', 'stands', 'merch_stand', 'car_park'], more: { green_room: 2, merch_stand: 2, catwalk: 1, vault: 1 }, sec: 3, crowd: 0.9,
    },
    hangar: {
      label: 'an airship hangar',
      names: ['Hangar Nine', 'The Airship Shed', 'The Big Shed', 'Hangar One', 'The Zeppelin Hall', 'The Cathedral of Rust', 'The Long Hangar', 'Gantry Hall'],
      blurbs: [
        '{name}: a hangar built for airships that never came, big enough to have its own weather, with a stage on a flatbed.',
        '{name}: girders, gantries and a crowd of thousands under a roof so high the bats have bats.',
        '{name}: the Rust Choir\'s favourite venue. It is loud in here. It is loud in here even when it is empty.',
      ],
      wall: ['An Atlas aviation notice, forty years out of date.', 'A Muse drone stuck in the roof girders since the last show.', 'A Rust Choir tag forty metres up, nobody knows how.'],
      price: 0.8, floor: ['main_stage', 'loading_dock', 'catwalk', 'gantry', 'merch_stand', 'car_park'], more: { stands: 1.5, pyro_rig: 2, merch_stand: 2, food_stalls: 1.5 }, sec: 3, crowd: 0.9,
    },
    muse_arena: {
      label: 'the Muse Arena',
      names: ['The Muse Arena', 'LUMINA Live', 'Muse Heartline Arena', 'The Muse Experience Arena', 'Muse Stadium {n}', 'The Feelings Arena', 'Muse Moments Arena', 'The Pastel Bowl'],
      blurbs: [
        '{name}: Muse\'s own arena, pastel inside and out, with a stage shaped like a heart and a security budget shaped like a war.',
        '{name}: every seat has a LUMINA light-stick in the cupholder and a camera in the armrest.',
        '{name}: where LUMINA plays her residency. The merch stand has its own postcode.',
      ],
      wall: ['A Muse banner: WE LIGHT UP YOUR WORLD 🥰, in letters a storey high.', 'An Atlas partnership plaque on the main entrance: Safety by Atlas, Feelings by Muse.', 'An Inspiration team in the lobby, posing for photos.'],
      price: 1.6, floor: ['main_stage', 'stands', 'green_room', 'jumbotron', 'corporate_boxes', 'production_booth', 'turnstiles', 'merch_stand', 'car_park'], more: { vault: 2, pyro_rig: 2, catwalk: 1.5, merch_stand: 2 }, sec: 7, crowd: 1,
    },
    atlas_dome: {
      label: 'the Atlas Safety Dome',
      names: ['The Atlas Safety Dome', 'Atlas Arena', 'The Reassurance Bowl', 'Atlas Rally Hall', 'The Safe-T Dome', 'The Compliance Coliseum', 'Atlas Assembly Arena', 'The Dome of Calm'],
      blurbs: [
        '{name}: Atlas\'s own arena, for safety rallies, award nights and, when Muse rents it, concerts with an evacuation drill in the interval.',
        '{name}: a grey dome with a dragon on top that turns to watch the queue.',
        '{name}: forty thousand seats, every one with a safety card and a little speaker that says "remain seated".',
      ],
      wall: ['A banner: YOUR SAFETY IS OUR SHOW.', 'The CEO\'s face on the screen between acts, smiling at the cameras.', 'An Atlas trooper at every exit, and a dragon on the roof.'],
      price: 1.5, floor: ['main_stage', 'stands', 'corporate_boxes', 'jumbotron', 'turnstiles', 'merch_stand', 'car_park'], more: { vault: 2, production_booth: 2, green_room: 1.5 }, sec: 8, crowd: 0.9,
    },
    quarry: {
      label: 'a quarry stage',
      names: ['The Quarry', 'The Pit Stage', 'Rock Bottom', 'The Cut', 'The Deep End', 'The Old Workings', 'Stone Hall', 'The Hole'],
      blurbs: [
        '{name}: a flooded quarry with a stage on a raft, and a crowd on the terraces cut into the rock.',
        '{name}: the echo off the quarry walls makes every guitar sound like twelve. The Rust Choir love it.',
        '{name}: no roof, no walls, no licence, and every show sells out.',
      ],
      wall: ['An Atlas "Danger: Deep Water" sign, used as a set list.', 'A Muse drone at the bottom of the quarry, visible through the water.', 'An Atlas mining licence, forty years expired, nailed to a post.'],
      price: 0.6, floor: ['main_stage', 'open_roof', 'stands', 'merch_stand', 'car_park'], more: { loading_dock: 1, food_stalls: 2, pyro_rig: 1, merch_stand: 1 }, sec: 2, crowd: 0.8,
    },
  },
  shells: {
    concrete: { label: 'raw concrete', line: 'Raw concrete, everywhere, and a smell of last night\'s beer.', sec: 0 },
    glass: { label: 'glass and girders', line: 'Glass and girders and a lot of maintenance.', sec: 1 },
    stone: { label: 'old stone', line: 'Old stone, cut before the city was a city.', sec: 0 },
    rust: { label: 'rusted steel', line: 'Rusted steel that sings when the wind is right.', sec: 0 },
    pastel: { label: 'pastel cladding', line: 'Pastel cladding over something much older and greyer.', sec: 1 },
    brick: { label: 'Victorian brick', line: 'Victorian brick and a clock tower that has stopped at the same time for decades.', sec: 0 },
    timber: { label: 'timber', line: 'Timber, creaking, warm, and a fire officer who never sleeps.', sec: 0 },
    flood: { label: 'half-flooded', line: 'Half-flooded on the lower levels; the dressing rooms have duckboards.', sec: 0 },
    bunker: { label: 'an old bunker', line: 'Built on an old bunker, and the bunker is still down there, under the stage.', sec: 2, add: ['vault'] },
    rooftop: { label: 'a rooftop', line: 'On a roof: the city all round it, and a long way down.', sec: 0, add: ['open_roof'] },
    ship: { label: 'a ship\'s hull', line: 'Built inside the hull of a ship that was never launched.', sec: 1 },
    mall: { label: 'a dead mall', line: 'Inside a dead mall, with the escalators as stands.', sec: 0 },
  },
  features: {
    main_stage: { label: 'the main stage', base: 0, line: 'The main stage: forty metres wide, lights like a weather system, and a mark on the floor where the star stands.' },
    stands: { label: 'the stands', base: 0.5, line: 'The stands, rising into the dark, and on show nights full of people waving lights.' },
    loading_dock: { label: 'the loading dock', base: 0.4, line: 'The loading dock: trucks, flight cases, roadies, and a gate that is open while the gear goes in.' },
    green_room: { label: 'a green room', base: 0.4, line: 'A green room with a rider on the table and a star\'s name on the door.' },
    turnstiles: { label: 'turnstiles', base: 0, line: 'Turnstiles, ticket scanners and a queue round the block.' },
    jumbotron: { label: 'a jumbotron', base: 0.6, line: 'A screen the size of a building, wired to every camera in the room and a feed that goes out to the block.' },
    corporate_boxes: { label: 'corporate boxes', base: 0.3, line: 'A row of glass boxes over the stands, where the people who own things watch the people who make things.' },
    vault: { label: 'the box office vault', base: 0.3, line: 'The box office vault, where the night\'s takings go, in bags, behind a door with a dragon sticker.' },
    pyro_rig: { label: 'a pyro rig', base: 0.4, line: 'The pyrotechnics rig: fifty charges wired to a board, and a technician who counts them.' },
    open_roof: { label: 'an open roof', base: 0.3, line: 'An open roof, or no roof at all, and a sky that could do anything.' },
    merch_stand: { label: 'a merch stand', base: 1, line: 'A merch stand doing more business than most banks.' },
    production_booth: { label: 'the production booth', base: 0.8, line: 'The production booth in the middle of the stands: the desk, the lights, the cues, and the person who decides when the show ends.' },
    catwalk: { label: 'a catwalk', base: 0.4, line: 'A catwalk in the rigging, forty metres up, with a view of everything and a rail that is mostly decorative.' },
    gantry: { label: 'a gantry', base: 0, line: 'A gantry of lights you could walk along, if you were the walking-along type.' },
    banked_track: { label: 'the banked track', base: 0, line: 'The banked wooden track, steep enough to run round, if you are brave and the crowd is in the way.' },
    food_stalls: { label: 'food stalls', base: 0.9, line: 'Food stalls selling noodles, hot sugar and something on a stick.' },
    tunnel: { label: 'the players\' tunnel', base: 0.3, line: 'The tunnel the players used to come out of, now the way the star walks on.' },
    medical_bay: { label: 'a medical bay', base: 0.7, line: 'A medical bay for crowd crushes and nosebleeds, with a medic who has seen everything.' },
    car_park: { label: 'a car park', base: 0.9, line: 'A car park the size of a district, full of buses and touts.' },
    tout_corner: { label: 'the touts\' corner', base: 0.4, line: 'The corner where the touts stand, selling tickets that may or may not exist.' },
    rigging: { label: 'the rigging', base: 0.3, line: 'Rigging over the stage: chains, motors and a hundred lights hanging on hope.' },
    dressing_rooms: { label: 'dressing rooms', base: 0.8, line: 'A corridor of dressing rooms with stars on the doors and something going on behind each.' },
    security_office: { label: 'a security office', base: 0.6, line: 'A security office with every camera and every radio, and a kettle.' },
    under_stage: { label: 'under the stage', base: 0.6, line: 'The space under the stage: lifts, trapdoors, cables, and a crew member asleep.' },
  },
  traits: {
    sold_out: { label: 'sold out', line: 'Every show here sells out. The touts are richer than the band.' },
    atlas_security: { label: 'Atlas security', line: 'Security is contracted to Atlas. Troopers at every gate, a dragon on the roof on big nights.', sec: 2 },
    muse_owned: { label: 'Muse-owned', line: 'Muse owns the building. Every show here is a Muse show, whoever is playing it.', sec: 1 },
    leaky_roof: { label: 'a leaky roof', line: 'The roof leaks over the stage. Every star has played at least one song in a puddle.' },
    legendary_acoustics: { label: 'legendary acoustics', line: 'The acoustics are legendary. A whisper from the stage reaches the back row with feeling.' },
    bad_sightlines: { label: 'bad sightlines', line: 'Half the seats are behind pillars. The other half are behind the half that stand up.' },
    crowd_surfers: { label: 'crowd surfing', line: 'Crowd surfing is tradition here. The stewards have given up, and so has the medical bay.' },
    pyro_crazy: { label: 'pyro-happy', line: 'Every show here uses too much pyro. The ceiling has scorch marks shaped like encores.', add: ['pyro_rig'] },
    touts: { label: 'touts', line: 'The touts here are organised, uniformed and unionised.', add: ['tout_corner'] },
    old_ghost: { label: 'a ghost', line: 'The arena is haunted by a roadie who died during an encore. The lights flicker on the last chorus.' },
    vip_culture: { label: 'VIP culture', line: 'There are seven tiers of VIP. The top one has a lift to a box with its own weather.', add: ['corporate_boxes'] },
    union_crew: { label: 'a union crew', line: 'The crew is union. They break for tea mid-load-in whatever is on fire.' },
    cheap_seats: { label: 'cheap seats', line: 'There are always cheap seats in the gods. The people in them are the loudest.' },
    big_screen: { label: 'a huge screen', line: 'The screen here is so big it has its own weather warnings.', add: ['jumbotron'] },
    sticky_floor: { label: 'a sticky floor', line: 'The floor is sticky in a way that is now part of the building\'s listed status.' },
    rider_famous: { label: 'famous riders', line: 'The green room riders here are famous: once, a star asked for a live swan. They got one.' },
    tunnel_entrance: { label: 'a tunnel walk-on', line: 'Stars walk on through the old players\' tunnel, to a roar.', add: ['tunnel'] },
    dragon_overhead: { label: 'a dragon overhead', line: 'A dragon circles overhead on show nights, for "safety". It sometimes hums along.' },
    cheap_beer: { label: 'cheap beer', line: 'The beer is cheap, warm and everywhere.' },
    strict_curfew: { label: 'a strict curfew', line: 'There is a strict curfew. At 23:00 the power goes off, whoever is mid-song.' },
    rain_shows: { label: 'rain shows', line: 'Shows happen in all weather. The acid-rain shows are the stuff of legend.' },
    medics: { label: 'good medics', line: 'The medical bay is excellent. They have patched up more stage-divers than any clinic in the city.', add: ['medical_bay'] },
    secret_tunnels: { label: 'secret tunnels', line: 'There are tunnels under the stands from when it was something else. The crew use them. So do other people.', add: ['under_stage'] },
    merch_empire: { label: 'a merch empire', line: 'The merch operation is so big it has a warehouse, a fleet and a lawyer.', add: ['merch_stand'] },
    dressing_room_drama: { label: 'dressing-room drama', line: 'Something is always going on in the dressing rooms. Something is going on right now.', add: ['dressing_rooms'] },
  },
  situations: {
    lumina: { label: 'LUMINA live', line: 'Tonight: LUMINA, live, in the round. Pastel everything, Inspiration teams at every gate, and forty thousand light-sticks.', weight: 2, tags: ['lumina', 'muse', 'concert', 'crowd'], fame: 1.5, purse: 2 },
    muse_act: { label: 'a Muse act', line: 'Tonight: a Muse act everyone has heard of and nobody can name, with a support act that is the same act in a hat.', weight: 3, tags: ['muse', 'concert', 'crowd'], purse: 1.5 },
    rally: { label: 'an Atlas safety rally', line: 'Tonight: an Atlas safety rally. Forty thousand people who were told to come, a dragon on the roof and the CEO on the big screen.', weight: 1.5, tags: ['rally', 'atlas', 'crowd'], purse: 1.2 },
    sport: { label: 'a laser-league final', line: 'Tonight: the laser-league final. Two teams in light-up armour, a ball nobody can see, and a crowd betting everything.', weight: 1.5, tags: ['sport', 'crowd', 'bets'], purse: 1.5 },
    trucks: { label: 'monster trucks', line: 'Tonight: monster trucks. Eight of them, a pile of crushed cars, and a smell of petrol you can taste in the stands.', weight: 1, tags: ['trucks', 'crowd'] },
    fight: { label: 'a prize fight', line: 'Tonight: a prize fight. A ring in the middle of the floor, and the purse on a board for everyone to see.', weight: 1, tags: ['fight_night', 'crowd', 'bets'], purse: 1.8 },
    festival: { label: 'an indie festival', line: 'Tonight: an indie festival, three stages, sixty acts, a fringe in the car park and Clearance at every gate.', weight: 1.5, tags: ['festival', 'concert', 'crowd'], fame: 1.3 },
    dark: { label: 'a dark night', line: 'Nothing on tonight. The arena is dark, the stage is bare, and a single security guard is doing a crossword.', weight: 2.5, tags: ['dark_night', 'empty'] },
    talent_final: { label: 'the talent final', line: 'Tonight: the live final of Neo\'s Next Star. A Muse contract for the winner, and Pride, from the Atlas board, handing over the trophy in person.', weight: 0.8, tags: ['talent', 'muse', 'crowd', 'pride'], fame: 2, purse: 2 },
    gala: { label: 'a Muse–Atlas gala', line: 'Tonight: the Muse–Atlas partnership gala. Black tie, pastel napkins, and the board in the corporate boxes, smiling at each other like knives.', weight: 0.8, tags: ['gala', 'atlas', 'muse', 'crowd'], purse: 2 },
    charity: { label: 'a charity concert', line: 'Tonight: a charity concert for the flood districts. Ten acts, one cause, and a donation bucket the size of a car.', weight: 1, tags: ['charity', 'concert', 'crowd'], fame: 1.3 },
    auction: { label: 'a memorabilia auction', line: 'Tonight: a memorabilia auction on the main stage: costumes, setlists, and guitars that belonged to the famous and the dead.', weight: 0.8, tags: ['auction', 'crowd'] },
  },
  wild: {
    her_poster: { label: 'her poster', line: 'Her face is on a poster in the tunnel, from a show a previous Blackbird headlined here. The crew still talk about it.', weight: 2 },
    cursed: { label: 'a cursed stage', line: 'The stage is cursed: everything that goes wrong on it goes very wrong, and everything that goes right becomes a legend.', weight: 1.2 },
    hera_roof: { label: 'a Hera on the roof', line: 'A Hera-class dragon is parked on the roof tonight, "for security", watching the crowd with one enormous lens.', weight: 1 },
    double_booked: { label: 'double-booked', line: 'The arena is double-booked tonight: two acts, one stage, and a promoter hiding in a cupboard.', weight: 1.2 },
    dead_crowd: { label: 'the crowd who think she\'s dead', line: 'Tonight\'s crowd is full of fans who think she is dead. There are candles in the stands.', weight: 1.2 },
    ceo_box: { label: 'the CEO in a box', line: 'The CEO of Atlas is in one of the corporate boxes tonight, watching, through glass, with a drink she has not touched.', weight: 0.8 },
    open_mic_arena: { label: 'the open stage', line: 'After the headliner, the stage is open. Anyone can play. Nobody has dared.', weight: 1 },
    lumina_alone: { label: 'LUMINA alone', line: 'LUMINA is here, between shows, alone on the empty stage, practising something that is not on any setlist.', weight: 1 },
  },
  roster: arenaRoster,
  extra: (rng, info) => ({ hire: Math.round((1500 + 600 * info.tier) * (rng.int(8, 12) / 10)), seats: [2000, 8000, 15000, 30000, 50000][info.size] ?? 15000 }),
  tail: (info) => `${Number(info.keep?.seats ?? 15000).toLocaleString('en-GB')} seats.`,
};

export function arenaRoster(loc: Location, info: VenueInfo): SlotDef[] {
  const slots: SlotDef[] = [
    { role: 'arena_manager', count: [1, 1], chance: 0.9, faction: 'venue', resident: true },
    { role: 'arena_roadie', count: [2, 4], faction: 'venue', resident: true },
    { role: 'arena_steward', count: [2, 4], faction: 'venue', resident: true },
    { role: 'arena_punter', count: [4, 10], ephemeral: true },
    { role: 'tout', count: [1, 2], chance: info.traits.includes('touts') ? 1 : 0.5, resident: true },
  ];
  if (info.variant === 'muse_arena' || info.traits.includes('muse_owned')) slots.push({ role: 'inspiration_trooper', count: [2, 4], resident: true }, { role: 'muse_exec', count: [1, 1], chance: 0.5, resident: true });
  if (info.variant === 'atlas_dome' || info.traits.includes('atlas_security')) slots.push({ role: 'atlas_trooper', count: [2, 4], resident: true });
  if (info.traits.includes('vip_culture') || info.features.includes('corporate_boxes')) slots.push({ role: 'corpo', count: [1, 3], chance: 0.8, resident: true });
  slots.push({ role: 'cop', count: [1, 2], chance: 0.3 });
  return slots;
}
