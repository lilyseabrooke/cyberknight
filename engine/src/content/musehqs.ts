import type { Location, VenueInfo } from '../types';
import type { SlotDef } from '../roster';
import type { VenueTables } from './venues';

/**
 * Muse buildings: the offices of the entertainment megacorp, a Muse Tower at the top of the range. Muse's answer to an Atlas
 * outpost, played as a building to get *up*: a lobby anyone can walk into, staff floors, secure floors and the executive
 * level, each a rung of clearance (`museClear` in musehq.ts). What she wants is upstairs: her file, the guitars Clearance
 * confiscated "for safekeeping", LUMINA's maintenance bay, the master vault, broadcast control, and the executive suite where
 * Gluttony's takeover file is kept (the wedge). See musehq.ts for the system and content/musehqafford.ts for the rows.
 */

/** The clearance a feature needs: 0 the lobby, 1 the staff floors, 2 secure, 3 the executive level. */
export const CLEARANCE: Record<string, number> = {
  reception: 0, lobby_fountain: 0, lumina_hologram: 0, flagship_store: 0, turnstiles: 0, tour_desk: 0, fan_wall: 0, coffee_bar: 0,
  canteen: 1, open_plan: 1, press_room: 1, focus_room: 1, service_lift: 1, cleaning_cupboard: 1, wellness_pod: 1, smoking_terrace: 1, mailroom: 1, rehearsal_hall: 1,
  records_room: 2, evidence_room: 2, ar_floor: 2, lumina_bay: 2, master_vault: 2, server_room: 2, security_hub: 2, legal_floor: 2,
  exec_suite: 3, broadcast_control: 3, helipad: 3, board_room: 3,
};

export const MUSEHQ: VenueTables = {
  kind: 'musehq',
  label: 'a Muse building',
  chance: { market: 0.012, nightlife: 0.02, tenement: 0.006, industrial: 0.008, corporate: 0.035, slum: 0.003 },
  lean: {
    market: { tower: 1, broadcast: 1, clearance: 3, ar: 2, lumina_lab: 0.5, archive: 1, flagship: 4, feelings: 2 },
    nightlife: { tower: 1, broadcast: 2, clearance: 2, ar: 4, lumina_lab: 1, archive: 0.6, flagship: 2, feelings: 3 },
    tenement: { tower: 0.3, broadcast: 1, clearance: 5, ar: 1, lumina_lab: 0.3, archive: 1, flagship: 1, feelings: 2 },
    industrial: { tower: 0.5, broadcast: 3, clearance: 2, ar: 0.5, lumina_lab: 3, archive: 3, flagship: 0.4, feelings: 0.6 },
    corporate: { tower: 4, broadcast: 3, clearance: 2, ar: 3, lumina_lab: 2, archive: 2, flagship: 3, feelings: 1 },
    slum: { tower: 0.1, broadcast: 1, clearance: 6, ar: 0.5, lumina_lab: 0.3, archive: 0.5, flagship: 0.3, feelings: 1 },
  },
  hours: [7, 23],
  prestige: 1.4,
  variants: {
    tower: {
      label: 'Muse Tower',
      names: ['Muse Tower', 'Muse Tower {n}', 'The Muse Heartline Tower', 'Muse House', 'The Tower of Feelings', 'Muse Plaza One', 'The Muse Spire', 'Muse Centre {n}'],
      blurbs: [
        '{name}: forty floors of pastel glass with a heart on top that beats in time with whatever LUMINA is singing. The lobby is open to the public. Nothing else is.',
        '{name}: a fountain that plays the Muse jingle, a reception desk the size of a car, and turnstiles that know everybody\'s name.',
        '{name}: the building every song in Neo is approved in. The lifts have their own playlist, and it is licensed.',
      ],
      wall: ['A banner down the front: WE LIGHT UP YOUR WORLD WITH MUSIC 🥰. Under it, in the same font: Unauthorised Music Will Be Removed.', 'An Atlas safety screen in the lobby, between LUMINA videos, as part of the Muse–Atlas partnership.', 'A plaque: Muse Tower, Proudly Insured By Atlas.'],
      price: 1.5, floor: ['reception', 'turnstiles', 'lumina_hologram', 'canteen', 'records_room', 'exec_suite', 'broadcast_control'], more: { evidence_room: 2, ar_floor: 2, master_vault: 1.5, helipad: 1.5, board_room: 1.5, lobby_fountain: 2 }, sec: 7, crowd: 0.7,
    },
    broadcast: {
      label: 'a Muse Broadcast centre',
      names: ['Muse Broadcast Centre', 'Muse Broadcast {n}', 'The Muse Signal House', 'Muse Channel {n} Studios', 'Muse Uplink', 'The Muse Transmission Hall', 'Muse Network Operations', 'The Feelings Network'],
      blurbs: [
        '{name}: every Muse channel goes out from here, under a dish shaped like a heart. The control room has more screens than the city has opinions.',
        '{name}: a lobby of ring lights and a corridor of studios, each one making the same programme in a slightly different colour.',
        '{name}: the signal starts here. So does every segment about her "troubling sound".',
      ],
      wall: ['An Atlas announcement schedule on the wall, licensed, colour-coded.', 'A Muse poster: YOUR FEELINGS, BROADCAST 24/7.', 'A screen showing an Atlas safety ad, then LUMINA, then the Atlas ad again.'],
      price: 1.3, floor: ['reception', 'turnstiles', 'press_room', 'server_room', 'broadcast_control'], more: { open_plan: 2, rehearsal_hall: 1.5, security_hub: 2, coffee_bar: 2 }, sec: 6, crowd: 0.5,
    },
    clearance: {
      label: 'a Muse Clearance office',
      names: ['Muse Clearance Office {n}', 'Muse Licensing & Clearance', 'The Clearance Bureau', 'Muse Music Approvals', 'Muse Compliance & Care', 'The Office of Approved Sound', 'Muse Clearance (District {n})', 'The Safekeeping Office'],
      blurbs: [
        '{name}: a waiting room with a ticket machine, a wall of confiscated guitars behind glass, and a sign: WE KEEP THEM SAFE 💖.',
        '{name}: where letters are written, fines are levied and guitars are taken "for safekeeping". The safe is the size of a garage.',
        '{name}: pastel desks, a queue of nervous buskers, and an officer stamping NOT on everything.',
      ],
      wall: ['A poster: UNLICENSED MUSIC HURTS EVERYONE 😢. Underneath, a QR code for reporting a neighbour.', 'An Atlas fine-collection notice, co-branded.', 'A framed letter: "We noticed you\'re making music! That\'s so brave 🥰". It is the template.'],
      price: 1, floor: ['reception', 'evidence_room', 'records_room', 'open_plan'], more: { legal_floor: 2, mailroom: 2, cleaning_cupboard: 1.5, coffee_bar: 1 }, sec: 5, crowd: 0.5,
    },
    ar: {
      label: 'Muse A&R offices',
      names: ['Muse A&R', 'Muse Artist Relations', 'The Muse Talent Floor', 'Muse Discovery House', 'Muse New Voices Office', 'The Signing Room', 'Muse Rising Stars', 'Muse Artists & Repertoire {n}'],
      blurbs: [
        '{name}: a floor of scouts with pre-uncapped pens and a filing room of contracts, one per artist Muse owns.',
        '{name}: a lobby with a gold record for every artist who signed, and a shredder for every one who didn\'t.',
        '{name}: the contracts are kept in a room with a heart on the door. The heart has a keypad.',
      ],
      wall: ['A wall of signings, each photo captioned "Welcome to the family 💖".', 'An Atlas insurance plaque: "Your Talent, Protected".', 'A whiteboard: THIS MONTH\'S TARGETS, with her name halfway down.'],
      price: 1.2, floor: ['reception', 'turnstiles', 'ar_floor', 'legal_floor'], more: { open_plan: 2, focus_room: 2, rehearsal_hall: 2, press_room: 1 }, sec: 5, crowd: 0.5,
    },
    lumina_lab: {
      label: 'a LUMINA maintenance facility',
      names: ['The LUMINA Lab', 'LUMINA Service Centre', 'The Idol Workshop', 'LUMINA Version Control', 'Muse Synthetic Talent Lab', 'The Update Room', 'LUMINA Care Facility', 'Project Heartbeat'],
      blurbs: [
        '{name}: a white room with a chrome chair in the middle, and in the chair, sometimes, LUMINA, plugged in, eyes closed, updating.',
        '{name}: shelves of spare LUMINA faces in version order, a lab of technicians and a sign: SHE IS HAPPIEST WHEN UPDATED.',
        '{name}: the release notes for the next LUMINA are pinned to the door: "now with more feelings".',
      ],
      wall: ['An Atlas robotics compliance certificate, framed next to LUMINA\'s first smile.', 'A Muse poster: SHE FEELS FOR YOU, SO YOU DON\'T HAVE TO.', 'A drone dock with a LUMINA-branded maintenance drone, asleep.'],
      price: 1.3, floor: ['reception', 'turnstiles', 'lumina_bay', 'server_room'], more: { open_plan: 1.5, security_hub: 2, wellness_pod: 2, service_lift: 1.5 }, sec: 7, crowd: 0.3,
    },
    archive: {
      label: 'the Muse Archive',
      names: ['The Muse Archive', 'Muse Master Vault {n}', 'The Recordings Repository', 'Muse Heritage Store', 'The Back Catalogue', 'Muse Rights Management', 'The Royalty House', 'The Masters'],
      blurbs: [
        '{name}: every master tape Muse owns, in climate-controlled shelving, and an accountant for every shelf.',
        '{name}: the royalties of the city are counted here, by hand, by people in pastel cardigans.',
        '{name}: a vault of every song Muse ever bought, buried or banned. Some of them are hers.',
      ],
      wall: ['An Atlas insurance plaque on the vault door: "Your Catalogue, Protected Forever".', 'A Muse poster: EVERY SONG HAS A HOME 💖. The home is this building.', 'A board of royalty statements, the big numbers on the left and the artists\' share on the right.'],
      price: 1.1, floor: ['reception', 'master_vault', 'records_room', 'legal_floor'], more: { server_room: 2, mailroom: 2, security_hub: 2, service_lift: 1.5 }, sec: 6, crowd: 0.3,
    },
    flagship: {
      label: 'a Muse flagship store',
      names: ['Muse Flagship', 'The Muse Experience', 'Muse World', 'The Feelings Store', 'Muse Heartline Store {n}', 'LUMINA Land', 'The Muse Store', 'Muse Moments Megastore'],
      blurbs: [
        '{name}: four floors of LUMINA merchandise, a listening bar, and a staff floor upstairs where the real business is done.',
        '{name}: a store that sells feelings in pastel packaging. The fitting rooms have speakers.',
        '{name}: a LUMINA hologram greets every customer by name, and their purchase history.',
      ],
      wall: ['An Atlas insurance desk next to the tills: "Protect Your Purchase".', 'A Muse banner: BUY THE FEELING 🥰.', 'A display of approved instruments, all pastel, all wired to report.'],
      price: 1.1, floor: ['flagship_store', 'lumina_hologram', 'reception', 'fan_wall'], more: { coffee_bar: 2, canteen: 1, open_plan: 1.5, security_hub: 1 }, sec: 4, crowd: 0.9,
    },
    feelings: {
      label: 'a Muse Feelings Lounge',
      names: ['The Muse Feelings Lounge', 'Muse Calm Space', 'The LUMINA Listening Lounge', 'Muse Wellness & Sound', 'The Approved Mood Room', 'Muse Hug Station {n}', 'The Feelings Spa', 'Muse Comfort Zone'],
      blurbs: [
        '{name}: beanbags, headphones and a menu of approved moods. A counsellor checks which one you picked.',
        '{name}: you lie in a pod and LUMINA tells you how to feel, in a voice like warm milk.',
        '{name}: the most relaxing room in Neo, monitored by Clearance for unlicensed thoughts.',
      ],
      wall: ['An Atlas wellness poster, co-branded, in the same pastel.', 'A Muse sign: FEELINGS ARE A SUBSCRIPTION 💖.', 'A rack of LUMINA wellness headphones, each with a little camera.'],
      price: 0.9, floor: ['reception', 'wellness_pod', 'lumina_hologram'], more: { coffee_bar: 3, focus_room: 2, records_room: 1, cleaning_cupboard: 1.5 }, sec: 3, crowd: 0.6,
    },
  },
  shells: {
    glass: { label: 'a pastel glass tower', line: 'Pastel glass, top to bottom, tinted the exact pink of a feeling Muse has trademarked.', sec: 1 },
    cinema: { label: 'a converted picture palace', line: 'A grand old picture palace that Muse bought and repainted. The organ still plays, in a licensed key.', sec: 0 },
    bank: { label: 'a former bank', line: 'A former bank. The vault is still the vault; it is just full of songs now.', sec: 2, add: ['master_vault'] },
    mall: { label: 'a shopping mall wing', line: 'A whole wing of a mall, with the escalators rerouted to make you walk past the merchandise twice.', sec: 0, add: ['flagship_store'] },
    church: { label: 'a bought cathedral', line: 'A cathedral Muse bought for the acoustics and the brand. The stained glass is LUMINA now.', sec: 1 },
    station: { label: 'an old railway terminus', line: 'An old railway terminus. The departures board shows the charts.', sec: 0, add: ['service_lift'] },
    arcology: { label: 'a corporate arcology block', line: 'A corporate block that shares a lobby with three Atlas subsidiaries and a sushi chain.', sec: 2, weight: 1.2 },
    warehouse: { label: 'a refurbished warehouse', line: 'A refurbished warehouse with exposed brick, exposed pipes and exposed Inspiration operatives.', sec: 0, add: ['open_plan'] },
    hotel: { label: 'a former luxury hotel', line: 'A former luxury hotel. The suites are offices and the penthouse is the executive level.', sec: 1, add: ['helipad'] },
    hospital: { label: 'an old hospital', line: 'An old hospital, refitted, still with the wide corridors and the very good lifts.', sec: 1, add: ['wellness_pod'] },
    stadium: { label: 'a stadium\'s corporate stand', line: 'The corporate stand of a stadium, with boxes for offices and the pitch as a car park.', sec: 1 },
    bunker: { label: 'an old Atlas bunker', line: 'An old Atlas bunker leased to Muse, under a pastel façade. The blast doors are painted with hearts.', sec: 3, weight: 0.7, add: ['security_hub'] },
  },
  features: {
    reception: { label: 'a reception desk', base: 0, line: 'A reception desk the size of a car, a receptionist with a ring light and a visitor book that wants your face.' },
    lobby_fountain: { label: 'a fountain', base: 0.6, line: 'A fountain that plays the Muse jingle, and a floor of coins thrown by people who wanted to be famous.' },
    lumina_hologram: { label: 'a LUMINA hologram', base: 0.6, line: 'A life-size LUMINA hologram that waves at everyone and says their name.' },
    flagship_store: { label: 'a merchandise floor', base: 0.3, line: 'A merchandise floor of LUMINA everything: mugs, wigs, a LUMINA-shaped kettle.' },
    turnstiles: { label: 'turnstiles', base: 0, line: 'A row of pastel turnstiles that open for a lanyard and a smile, and for nothing else.' },
    tour_desk: { label: 'a tour desk', base: 0.6, line: 'A tour desk: BEHIND THE MUSIC, hourly, with a guide in a heart-shaped hat.' },
    fan_wall: { label: 'a fan wall', base: 0.4, line: 'A wall where fans leave messages for LUMINA. Some of them are for Blackbird, in marker, under the official ones.' },
    coffee_bar: { label: 'a coffee bar', base: 0.8, line: 'A coffee bar serving drinks named after LUMINA songs, all of them too sweet.' },
    canteen: { label: 'a staff canteen', base: 0.8, line: 'A staff canteen with a salad bar, a LUMINA video on loop and the staff\'s real opinions at every table.' },
    open_plan: { label: 'an open-plan office', base: 0.8, line: 'An open-plan office of people managing feelings on spreadsheets.' },
    press_room: { label: 'a press room', base: 0.6, line: 'A press room with a lectern, a heart backdrop and a statement already drafted about her.' },
    focus_room: { label: 'a focus-group room', base: 0.5, line: 'A focus-group room behind a two-way mirror, where people are paid to say which feeling they prefer.' },
    service_lift: { label: 'a service lift', base: 0.6, line: 'A service lift that goes to every floor and checks nobody\'s lanyard.' },
    cleaning_cupboard: { label: 'a cleaning cupboard', base: 0.6, line: 'A cleaning cupboard with pastel uniforms on hooks and a trolley with a master key on it.' },
    wellness_pod: { label: 'wellness pods', base: 0.4, line: 'A row of wellness pods where LUMINA tells you how to feel.' },
    smoking_terrace: { label: 'a smoking terrace', base: 0.5, line: 'A smoking terrace where Muse staff go to say what they really think.' },
    mailroom: { label: 'a mailroom', base: 0.5, line: 'A mailroom full of Clearance letters, unsent, in envelopes with hearts.' },
    rehearsal_hall: { label: 'a rehearsal hall', base: 0.4, line: 'A rehearsal hall where Muse artists practise the approved choreography, in silence, to a click.' },
    records_room: { label: 'the records room', base: 0, line: 'The records room: a file on every musician Muse has ever noticed. Hers is thick.' },
    evidence_room: { label: 'the evidence room', base: 0, line: 'The evidence room: every guitar Clearance ever took "for safekeeping", tagged and shelved. Some of the tags have her name on.' },
    ar_floor: { label: 'the contracts room', base: 0, line: 'The contracts room: one file per artist Muse owns, and a shredder for the ones that got away.' },
    lumina_bay: { label: 'LUMINA\'s maintenance bay', base: 0, line: 'LUMINA\'s maintenance bay: a chrome chair, a cable as thick as an arm, and a screen that says UPDATING 61%.' },
    master_vault: { label: 'the master vault', base: 0, line: 'The master vault: shelves of tapes in climate control, and a ledger of what each one earns.' },
    server_room: { label: 'a server room', base: 0.4, line: 'A server room humming the Muse jingle in a frequency only the racks can hear.' },
    security_hub: { label: 'the security hub', base: 0.3, line: 'The security hub: a wall of feeds and an Inspiration lead with a mug that says TEAM INSPIRE.' },
    legal_floor: { label: 'the legal floor', base: 0.3, line: 'The legal floor, where the lawyers who drafted her warrant have their lunch.' },
    exec_suite: { label: 'the executive suite', base: 0, line: 'The executive suite: a view of the whole city, a carpet you could lose a shoe in, and a folder on the desk marked GLUTTONY.' },
    broadcast_control: { label: 'broadcast control', base: 0, line: 'Broadcast control: the board that decides what every screen in Neo plays, and a big red button labelled ALL CHANNELS.' },
    helipad: { label: 'a helipad', base: 0, line: 'A helipad on the roof, with a pastel helicopter and a view of every dragon in the sky.' },
    board_room: { label: 'the board room', base: 0, line: 'The board room: a table shaped like a heart and twelve chairs, one of them with an Atlas logo.' },
  },
  traits: {
    inspiration_barracks: { label: 'an Inspiration barracks', line: 'An Inspiration team is based in the building. They jog round the lobby every morning, singing.', sec: 2 },
    open_day: { label: 'open days', line: 'There is an open day every week: tours, free samples and a chance to "meet the Muse family".', add: ['tour_desk'] },
    lanyard_culture: { label: 'lanyard culture', line: 'Everybody wears a lanyard, and the colour of the lanyard is the only thing anybody looks at.' },
    nice_security: { label: 'very polite security', line: 'Security here is extremely polite. They apologise before every takedown.', sec: 1 },
    lazy_turnstiles: { label: 'faulty turnstiles', line: 'Half the turnstiles are broken and stay open. A sign says THANK YOU FOR YOUR HONESTY.', sec: -1 },
    atlas_floor: { label: 'an Atlas floor', line: 'One floor is leased to Atlas. The lifts skip it, politely.', sec: 1 },
    gluttony_visit: { label: 'Gluttony\'s people visit', line: 'People from Atlas Mergers & Acquisitions visit often. They look at the furniture like they are measuring it.' },
    leaky_staff: { label: 'disgruntled staff', line: 'The staff are underpaid, overmonitored and very, very ready to complain to anybody who listens.', sec: -1, add: ['smoking_terrace'] },
    fan_vigil: { label: 'a fan vigil', line: 'A vigil of LUMINA fans is camped outside, and so, quietly, are some of hers.', add: ['fan_wall'] },
    smart_lanyards: { label: 'smart lanyards', line: 'The lanyards are smart: they report where you are every ten seconds.', sec: 1 },
    pastel_dress_code: { label: 'a pastel dress code', line: 'There is a pastel dress code. Anybody in black is noticed immediately.', sec: 1 },
    canteen_gossip: { label: 'a gossiping canteen', line: 'The canteen is where everything is said. The salad bar is the confessional.', add: ['canteen'] },
    cleaning_contractor: { label: 'outsourced cleaners', line: 'The cleaners are contractors. Nobody checks who they are.', sec: -1, add: ['cleaning_cupboard'] },
    lumina_loose: { label: 'LUMINA wanders', line: 'LUMINA wanders the corridors between updates, humming, unsupervised.' },
    press_call: { label: 'a press call today', line: 'There is a press call today. The press room is set up, and a statement about "troubling sounds" is on the lectern.', add: ['press_room'] },
    music_in_lifts: { label: 'lift music', line: 'The lifts play LUMINA. Every lift, every floor, every second.' },
    hr_wellness: { label: 'mandatory wellness', line: 'Staff take a mandatory wellness break every two hours, in the pods.', add: ['wellness_pod'] },
    paper_files: { label: 'paper files', line: 'Muse still keeps paper files, for "warmth". They are in cabinets with heart-shaped locks.', sec: -1 },
    tight_ship: { label: 'a tight ship', line: 'The building manager runs a tight ship. Every door is logged and every log is read.', sec: 2 },
    interns: { label: 'an army of interns', line: 'An army of unpaid interns does everything, including security, on Thursdays.', sec: -1 },
    rooftop_party: { label: 'rooftop parties', line: 'There is a rooftop party most nights, for artists, executives and the people who fly the helicopter.', add: ['helipad'] },
    dragon_license_desk: { label: 'the dragon licence desk', line: 'A desk on the third floor handles Atlas\'s licence for the dragon broadcasts. The licence is in a drawer.' },
    union_drive: { label: 'a union drive', line: 'The staff are trying to unionise. Muse has sent a heartfelt email about it.' },
    renovation: { label: 'under renovation', line: 'Half the building is under renovation. There is scaffolding up to the twelfth floor and no one guarding it.', sec: -1, add: ['service_lift'] },
    lost_and_found: { label: 'a lost-and-found', line: 'A lost-and-found by reception that is mostly lanyards.' },
    blackbird_shrine: { label: 'a secret shrine to her', line: 'Somebody on the staff has a shrine to her in a stationery cupboard. Clearance has not found it.' },
  },
  situations: {
    lumina_update: { label: 'a LUMINA update', line: 'LUMINA is updating today. The whole building is quiet, and everybody is watching the progress bar.', weight: 2, tags: ['update', 'lumina'] },
    press_conference: { label: 'a press conference', line: 'A press conference is on: a Muse spokesperson is about to talk about "troubling sounds" to forty cameras.', weight: 2, tags: ['press', 'crowd'] },
    signing_day: { label: 'signing day', line: 'It is signing day: new artists queue in the lobby with their families and their lawyers.', weight: 1.5, tags: ['signing', 'crowd'] },
    fire_drill: { label: 'a fire drill', line: 'A fire drill: everybody is in the car park, singing the evacuation jingle, and the floors are empty.', weight: 1.5, tags: ['drill', 'empty'] },
    audit: { label: 'an Atlas audit', line: 'Atlas auditors are in. Gluttony\'s people are going through the books, and Muse is pretending to be thrilled.', weight: 1.5, tags: ['audit', 'atlas'] },
    blackout: { label: 'a power cut', line: 'A power cut: the turnstiles are open, the lifts are stuck and the hologram is a flicker.', weight: 1.2, tags: ['dark', 'power_cut', 'empty'] },
    lockdown: { label: 'a security lockdown', line: 'The building is on lockdown: somebody hijacked a tower last night, and every lanyard is being checked twice.', weight: 1.2, tags: ['lockdown'] },
    party: { label: 'a launch party', line: 'A launch party for LUMINA\'s new single: the lobby is full of guests, the bar is free and security is distracted.', weight: 1.5, tags: ['party', 'crowd'] },
    strike: { label: 'a staff walkout', line: 'The staff have walked out for an hour. The building is half empty and fully confused.', weight: 1, tags: ['strike', 'empty'] },
    tour_day: { label: 'a big tour', line: 'A coach of tourists is being shown Behind The Music. Nobody counts them when they leave.', weight: 1.5, tags: ['tour', 'crowd'] },
    exec_visit: { label: 'an executive visit', line: 'An executive is in from head office. Everybody is wearing their best pastel.', weight: 1.2, tags: ['exec'] },
    broadcast_live: { label: 'a live broadcast', line: 'A live broadcast is going out from the building, to every channel, right now.', weight: 1.5, tags: ['live', 'broadcast'], not: ['feelings', 'flagship'] },
    inspiration_drill: { label: 'an Inspiration drill', line: 'An Inspiration team is running drills in the stairwells, with glitter grenades. They are mostly blanks.', weight: 1, tags: ['drill_squad', 'guarded'] },
    clearance_sweep: { label: 'a confiscation sweep', line: 'Clearance did a sweep last night. A trolley of fresh guitars is waiting by the lift, tagged.', weight: 1.5, tags: ['sweep'] },
  },
  wild: {
    her_file: { label: 'her whole file', line: 'Her whole file is here, every life of it, in a room labelled BLACKBIRD (ALL VERSIONS).', weight: 2, add: ['records_room'] },
    lumina_awake: { label: 'LUMINA is awake', line: 'LUMINA is awake in the maintenance bay, unplugged, and has been asking for Blackbird by name.', weight: 1.5, add: ['lumina_bay'] },
    gluttony_inside: { label: 'Gluttony\'s man inside', line: 'Atlas Mergers & Acquisitions has a man inside, posing as a consultant. He would pay for the right file.', weight: 1.5, add: ['exec_suite'] },
    open_mic_tower: { label: 'the open mic', line: 'Once a year, Muse lets a member of the public sing on every channel. It is today. There is a queue.', weight: 1, add: ['broadcast_control'] },
    her_guitar: { label: 'her old guitar', line: 'The evidence room has a guitar from a previous life of hers, in a glass case, labelled CASE STUDY.', weight: 1.5, add: ['evidence_room'] },
    friendly_exec: { label: 'a friendly executive', line: 'One of the executives is a secret fan. Her office has a bootleg of Blackbird\'s first show, framed.', weight: 1.2 },
    haunted: { label: 'a haunted floor', line: 'One floor is haunted by the ghost of an artist who never got their masters back. The lifts stop there on their own.', weight: 1 },
    encore_office: { label: 'ENCORE\'s office', line: 'ENCORE has an office here, with a photo of Blackbird pinned to the wall and a heart drawn round it.', weight: 1 },
  },
  roster: musehqRoster,
  extra: (rng, info) => ({
    // How tightly they check lanyards here, on top of security: the bar for each rung of clearance.
    strict: Math.round(info.tier + (info.variant === 'tower' ? 2 : 0) + rng.int(0, 2)),
  }),
  tail: (info) => (info.variant === 'flagship' || info.variant === 'feelings' ? 'Open to the public.' : 'Lobby open to the public; everything else by lanyard.'),
  epoch: 1,
  sitChance: 0.55,
};

export function musehqRoster(loc: Location, info: VenueInfo): SlotDef[] {
  const crowd = [3, 4, 6, 8, 10][info.size] ?? 4;
  const slots: SlotDef[] = [
    { role: 'muse_exec', count: [1, 1], chance: 0.9, faction: 'venue', resident: true },
    { role: 'muse_receptionist', count: [1, 1], faction: 'venue', resident: true },
    { role: 'clearance_officer', count: [1, 2], chance: info.variant === 'clearance' ? 1 : 0.6, resident: true },
    { role: 'muse_staffer', count: [Math.max(1, crowd - 3), crowd], resident: true },
    { role: 'inspiration_trooper', count: [1, info.traits.includes('inspiration_barracks') ? 4 : 2], chance: Math.min(0.95, 0.3 + loc.security * 0.08), resident: true },
    { role: 'muse_visitor', count: [1, crowd], ephemeral: true },
  ];
  if (info.variant === 'ar' || info.variant === 'tower') slots.push({ role: 'muse_scout', count: [1, 2], chance: 0.8, resident: true });
  if (info.variant === 'broadcast' || info.variant === 'tower' || info.variant === 'lumina_lab') slots.push({ role: 'muse_tech', count: [1, 2], chance: 0.8, resident: true });
  if (info.variant === 'tower' || info.traits.includes('inspiration_barracks')) slots.push({ role: 'inspiration_lead', count: [1, 1], chance: 0.6, resident: true });
  if (info.traits.includes('gluttony_visit') || info.wild === 'gluttony_inside' || info.traits.includes('atlas_floor')) slots.push({ role: 'atlas_consultant', count: [1, 1], chance: 0.8, resident: true });
  return slots;
}
