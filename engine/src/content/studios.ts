import type { Location, VenueInfo } from '../types';
import type { SlotDef } from '../roster';
import type { VenueTables } from './venues';

/**
 * Recording studios: where a take outlives the hands that played it. See studio.ts for the system (recordings on the legacy,
 * royalties, the backing track, the ghost guitarist, the jingle, the dragon broadcast) and content/studioafford.ts for the
 * rows. What a studio *is* is here.
 */

export const STUDIO: VenueTables = {
  kind: 'studio',
  label: 'a recording studio',
  chance: { market: 0.04, nightlife: 0.07, tenement: 0.04, industrial: 0.05, corporate: 0.04, slum: 0.03 },
  lean: {
    market: { indie: 3, basement: 2, muse: 1, plant: 1, jingle: 2.5, holdmusic: 0.6, church: 1, van: 1, auto: 1.5 },
    nightlife: { indie: 4, basement: 2, muse: 2, plant: 0.8, jingle: 1, holdmusic: 0.4, church: 0.6, van: 2, auto: 1 },
    tenement: { indie: 2, basement: 4, muse: 0.5, plant: 1, jingle: 0.8, holdmusic: 0.4, church: 2, van: 2, auto: 0.6 },
    industrial: { indie: 1.5, basement: 2, muse: 0.6, plant: 4, jingle: 1, holdmusic: 1.5, church: 0.6, van: 1.5, auto: 2 },
    corporate: { indie: 1, basement: 0.3, muse: 5, plant: 0.6, jingle: 4, holdmusic: 3, church: 0.4, van: 0.3, auto: 3 },
    slum: { indie: 1, basement: 4, muse: 0.2, plant: 1.5, jingle: 0.4, holdmusic: 0.3, church: 2.5, van: 3, auto: 0.5 },
  },
  hours: [11, 5],
  prestige: 0.9,
  variants: {
    indie: {
      label: 'an independent studio',
      names: ['Second Take Studios', 'The Red Light Room', 'Bleed Through Recording', 'Room Tone', 'One More Take', 'The Tape Op', 'Hiss & Hum', 'Overdub Alley', 'The Quiet Booth', 'Signal Path Studios', 'Low End Theory Rooms', 'Count-In Studios'],
      blurbs: [
        '{name}: a red light over a heavy door, a corridor of carpet on the walls and a smell of warm valves.',
        '{name}: a desk with more faders than the producer has fingers, and a couch that has heard every demo in the district.',
        '{name}: the kind of studio people mention the name of in interviews, and then add "back then".',
      ],
      wall: ['A Muse Clearance notice is pinned by the door, face to the wall.', 'An Atlas "Noise Is A Safety Issue" sticker on the control-room glass, scratched half off.', 'A framed rejection letter from Muse A&R: "Not quite what we\'re hearing right now 💔". It is the most-looked-at thing in the room.'],
      price: 1, floor: ['mixing_desk', 'vocal_booth', 'live_room', 'couch'], more: { tape_machine: 2, amp_wall: 2, gold_wall: 1.2, guitar_rack: 2 }, sec: 2, crowd: 0.4,
    },
    basement: {
      label: 'a basement four-track',
      names: ["Gloria's Basement", 'The Damp Room', 'Four Track Mind', 'Under The Laundry', 'The Egg Box', 'Downstairs Studios', 'Low Ceiling Recordings', 'The Pipe Room', 'Mildew Sound', 'Below Stairs', 'Bedsit Masters', 'The Boiler Room Sessions'],
      blurbs: [
        '{name}: a cellar with egg boxes on the walls, a four-track on an ironing board and a dehumidifier that runs over every take.',
        '{name}: a mattress against the door for soundproofing, a lamp with a red scarf over it, and a landlord who must never know.',
        '{name}: a basement where half the songs on the street were recorded, and you can hear the boiler on every one of them.',
      ],
      wall: ['An Atlas wellness flyer used as a coaster.', 'A drone parts box full of patch leads.', 'A Muse Clearance letter framed over the toilet.'],
      price: 0.5, floor: ['tape_machine', 'couch', 'live_room'], more: { amp_wall: 1.5, back_door: 2, coffee_machine: 1, vent: 2 }, sec: 0, crowd: 0.25,
    },
    muse: {
      label: 'a Muse-licensed studio',
      names: ['Muse Sound Suite {n}', 'Muse Studios, Room {n}', 'The Muse Creative Space ({n})', 'Muse Moments Recording', 'Muse Approved Sound', 'Muse Heartline Studio {n}', 'LUMINA Sound Lab', 'The Muse Feelings Factory'],
      blurbs: [
        '{name}: pastel walls, a receptionist with a ring light and a Clearance officer at a desk by the booth, reading everyone\'s lyrics.',
        '{name}: the console is the newest in the city and the session contract is the longest. The coffee is free and logged.',
        '{name}: a heart-shaped window into the live room, and a sign: EVERY TAKE IS A MUSE TAKE 🥰.',
      ],
      wall: ['A Muse poster: WE LIGHT UP YOUR WORLD WITH MUSIC 🥰. Under it, smaller: All Recordings Are The Property Of Muse.', 'A framed LUMINA platinum disc, version 5.1, signed by a robot arm.', 'An Atlas safety ad loops on a screen between Muse adverts. Nobody notices which is which.'],
      price: 1.6, floor: ['mixing_desk', 'vocal_booth', 'clearance_desk', 'gold_wall', 'camera'], more: { coffee_machine: 3, isolation_booth: 2, mic_locker: 2 }, sec: 5, crowd: 0.5,
    },
    plant: {
      label: 'a pressing plant',
      names: ['Groove Cut Pressing', 'The Pressing Shed', 'Platter & Sons', 'Hot Wax Works', 'Run-Out Groove Ltd', 'The Lacquer Room', 'Spindle Hole Pressing', 'Seven-Inch Industrial', 'Dubplate Depot', 'Matrix Number Pressing', 'Side B Press', 'The Stamper Works'],
      blurbs: [
        '{name}: a hydraulic press that thumps like a heartbeat, a conveyor of hot records and a foreman who can hear a skip from the street.',
        '{name}: crates of blank tapes stacked to the ceiling and a duplication rack that copies two hundred cassettes while you wait.',
        '{name}: it does not record anything. It makes what you recorded exist, a thousand times over.',
      ],
      wall: ['An Atlas "Workplace Safety Is Everyone\'s Job" poster with the press\'s accident count on it, in pencil.', 'A Muse licensing sticker on the press, for the hours Muse rents it.', 'A drone dock by the loading bay, empty, with a sign: DELIVERIES WELCOME, DRONES NOT.'],
      price: 0.8, floor: ['pressing_line', 'vinyl_crates', 'tape_machine'], more: { back_door: 2, loading_bay: 3, master_vault: 1.5 }, sec: 2, crowd: 0.3,
    },
    jingle: {
      label: 'a jingle factory',
      names: ['Hook Line & Sinker Jingles', 'The Jingle Mill', 'Catchy Little Numbers', 'Earworm Industries', 'Sonic Branding Partners', 'Brand Song Co.', 'Tune In Tomorrow', 'Ten-Second Symphonies', 'The Sting Shop', 'Mnemonic Music', 'Ad Break Audio', 'Five Notes Media'],
      blurbs: [
        '{name}: a wall of client briefs ("happy but trustworthy", "like a hug from a bank") and a composer who has written four thousand of them.',
        '{name}: every jingle on every channel was written in a room like this, by someone with a deadline and a thesaurus of the word "fresh".',
        '{name}: a booth, a keyboard and a board of logos. A sign on the door: WE MAKE YOU HUM.',
      ],
      wall: ['An Atlas brief pinned to the corkboard: "Reassuring. Inevitable. Under 6 seconds."', 'A framed jingle award: the Golden Hum, third place.', 'A Muse royalty statement, with a lot of zeroes before the decimal point.'],
      price: 1.2, floor: ['mixing_desk', 'jingle_board', 'vocal_booth'], more: { coffee_machine: 2, piano: 2, gold_wall: 1 }, sec: 2, crowd: 0.4,
    },
    holdmusic: {
      label: 'an Atlas hold-music studio',
      names: ['Atlas Audio Services, Unit {n}', 'Safe-T Sound (Atlas Approved)', 'Atlas Public Address Studio {n}', 'Atlas Calm Line Recording', 'The Atlas Reassurance Suite', 'Atlas Broadcast Pre-Production', 'Atlas Signal & Tone, Unit {n}', 'Atlas Announcement Studio'],
      blurbs: [
        '{name}: where the hold music is made, and the dragon announcements, and the lockdown chime. The receptionist hums the chime without noticing.',
        '{name}: a sterile booth, a rack of broadcast gear with a license from Muse on it, and a voice artist recording "please remain calm" for the ninth time.',
        '{name}: the most-listened-to studio in Neo. Nobody has ever wanted to hear anything it made.',
      ],
      wall: ['An Atlas mural: a dragon over a skyline, and the words YOUR SAFETY IS OUR SOUND.', 'A Muse license plaque on the broadcast rack: "Licensed Feelings, Atlas Edition".', 'A framed first draft of the lockdown chime, signed by the board.'],
      price: 1.4, floor: ['broadcast_rack', 'mixing_desk', 'camera', 'vocal_booth'], more: { isolation_booth: 2, master_vault: 2, coffee_machine: 1 }, sec: 5, crowd: 0.2, hours: [7, 19],
    },
    church: {
      label: 'a church with good acoustics',
      names: ['St. Reverb\'s', 'The Chapel of Natural Echo', 'Our Lady of the Long Decay', 'The Nave Sessions', 'Holy Room Recordings', 'Saint Cecilia\'s (Deconsecrated)', 'The Vaulted Room', 'The Old Mission Hall', 'Pew Twelve Studios', 'The Echo Chapel', 'Sanctuary Sound', 'Choir Loft Recordings'],
      blurbs: [
        '{name}: four seconds of reverb for free, a choir loft full of microphones and a priest who books the sessions between funerals.',
        '{name}: candles, cables and a tape machine in the vestry. Every note hangs in the roof for a while before it leaves.',
        '{name}: the walls do half the work. The other half is done by a woman with a clipboard and very strong views on gospel.',
      ],
      wall: ['An Atlas "Faith in Safety" banner on the noticeboard, beside the jumble-sale rota.', 'A drone nests in the bell tower. The bells are louder.', 'A Muse Clearance letter about "unlicensed hymns", unopened, in the collection plate.'],
      price: 0.8, floor: ['echo_chamber', 'live_room', 'organ'], more: { tape_machine: 2, vocal_booth: 1.5, couch: 1 }, sec: 1, crowd: 0.3,
    },
    van: {
      label: 'a pirate studio in a van',
      names: ['The Mobile Unit', 'Studio On Wheels', 'The Getaway Session', 'Van Halen\'t', 'The Rolling Room', 'Back Seat Recordings', 'Four Wheel Four Track', 'The Plates Are Fake Studios', 'Double Parked Sound', 'The Transit Sessions', 'Nowhere Studios', 'Hazard Lights Recording'],
      blurbs: [
        '{name}: a van with the seats out, a desk where the seats were and a driver who keeps the engine running in case.',
        '{name}: a mobile studio that is never in the same place two nights running, because Muse would like a word.',
        '{name}: egg boxes on the roof lining, a mic on a coat hanger and a back door that opens onto a different street every time.',
      ],
      wall: ['A Muse warrant notice taped to the dashboard, as a trophy.', 'An Atlas parking ticket on the windscreen, eleven deep.', 'A bootleg poster for a show that happened last week in a car park.'],
      price: 0.6, floor: ['tape_machine', 'mixing_desk'], more: { back_door: 3, vinyl_crates: 1.5, couch: 1 }, sec: 1, crowd: 0.15,
    },
    auto: {
      label: 'a robot auto-studio',
      names: ['AutoTake {n}', 'Self-Serve Sound', 'The Booth Bot', 'RoboProducer Express', 'Insert Coin Record Hit', 'One-Click Studio', 'StudioMatic {n}', 'The Producer Unit', 'Press Here For Fame', 'Hit Machine {n}', 'Auto-Tuneful', 'The Automatic Session'],
      blurbs: [
        '{name}: a booth with a slot for coins and a robot producer behind glass that says "nice energy" whatever happens.',
        '{name}: a fully automated studio, a cheerful synthetic voice and a mixing desk that moves its own faders like a pianola.',
        '{name}: it records, mixes, masters and offers a payment plan in under four minutes. The robot is very proud of this.',
      ],
      wall: ['An Atlas Approved Device sticker on the robot\'s chest.', 'A Muse "Powered by LUMINA Algorithms" badge on the booth.', 'A laminated sign: THE PRODUCER CANNOT BE BRIBED. Underneath, someone has written "with money".'],
      price: 0.7, floor: ['mixing_desk', 'vocal_booth', 'coin_slot'], more: { isolation_booth: 2, camera: 1.5 }, sec: 2, crowd: 0.3,
    },
  },
  shells: {
    church: { label: 'a converted church', line: 'It was a church; the pews are stacked by the wall and there is a microphone on the altar.', sec: 0, add: ['echo_chamber'] },
    cinema: { label: 'an old cinema', line: 'An old cinema. The control room is in the projection booth, and the live room is where the screen used to be.', sec: 1, add: ['control_window'] },
    container: { label: 'a shipping container', line: 'A shipping container lined with foam, on a stack of four, with a ladder to the door.', sec: 0 },
    basement: { label: 'a flooded basement', line: 'A basement that floods every spring. The gear is on pallets and everyone takes their shoes off at the stairs.', sec: 0, weight: 1.3, add: ['vent'] },
    laundromat: { label: 'the back of a laundromat', line: 'The back of a laundromat. The dryers are soundproofing, after a fashion.', sec: 0 },
    depot: { label: 'a tram depot', line: 'A tram depot with one tram left in it, used as the vocal booth.', sec: 1, add: ['isolation_booth'] },
    greenhouse: { label: 'a rooftop greenhouse', line: 'A greenhouse on a roof. The plants are doing better than the business, and the rain is on half the albums.', sec: 0, add: ['balcony'] },
    vault: { label: 'an old bank vault', line: 'An old bank vault: the door is a foot thick, which is the best soundproofing money ever bought.', sec: 2, add: ['master_vault'] },
    karaoke: { label: 'over a karaoke den', line: 'Over a karaoke den. Every take has someone downstairs singing the same power ballad, faintly.', sec: 0, weight: 1.2 },
    carpark: { label: 'a car-park level', line: 'A level of a car park that nobody parks on, with a studio built of plywood in the middle of it.', sec: 0, add: ['back_door'] },
    warehouse: { label: 'a warehouse', line: 'A warehouse with the studio in one corner and a forklift in the other. The forklift is on two records.', sec: 1, add: ['loading_bay'] },
    callcentre: { label: 'a former Atlas call centre', line: 'A former Atlas call centre. There are still headsets on every desk, and the hold music is somehow still playing.', sec: 1, weight: 0.8, add: ['isolation_booth', 'camera'] },
  },
  features: {
    mixing_desk: { label: 'a mixing desk', base: 2, line: 'A mixing desk with a hundred faders, half of them labelled in tape.' },
    vocal_booth: { label: 'a vocal booth', base: 1.5, line: 'A vocal booth with a pop filter made from a pair of tights and a stool that wobbles.' },
    live_room: { label: 'a live room', base: 1.5, line: 'A live room with a rug, a drum kit and space for a band that has not split up yet.' },
    tape_machine: { label: 'a tape machine', base: 1.2, line: 'A reel-to-reel the size of a fridge, spooling at a speed that means business.' },
    master_vault: { label: 'a tape vault', base: 0.6, line: 'A locked room of master tapes in cardboard boxes, labelled in a dead engineer\'s hand.' },
    gold_wall: { label: 'a wall of gold records', base: 0.8, line: 'A wall of gold records. Some are real.' },
    couch: { label: 'a couch', base: 1.2, line: 'The studio couch: brown, enormous and witness to every bad decision in the district\'s music.' },
    coffee_machine: { label: 'a coffee machine', base: 1.2, line: 'A coffee machine that makes one thing, and makes it at the speed of a funeral.' },
    guitar_rack: { label: 'a rack of house guitars', base: 1, line: 'A rack of house guitars, all slightly out of tune in different directions.' },
    amp_wall: { label: 'a wall of amps', base: 1, line: 'A wall of amps, one of which has a name and a reputation.' },
    drum_kit: { label: 'a drum kit', base: 0.8, line: 'A drum kit with a hole in the bass drum and a sock in the hole.' },
    piano: { label: 'a piano', base: 0.6, line: 'An upright piano with a cigarette burn on every white key.' },
    organ: { label: 'an organ', base: 0, line: 'A pipe organ, half-dismantled, with three pipes still working and opinions about it.' },
    echo_chamber: { label: 'an echo chamber', base: 0.4, line: 'An echo chamber: a tiled room with a speaker at one end and a microphone at the other.' },
    isolation_booth: { label: 'an isolation booth', base: 0.6, line: 'An isolation booth so quiet you can hear your own pulse, which is not always welcome.' },
    control_window: { label: 'a control-room window', base: 0.6, line: 'The big window between the live room and the desk, smudged at face height.' },
    pressing_line: { label: 'a pressing line', base: 0, line: 'A record press and a tape duplicator, side by side, thumping and whirring.' },
    vinyl_crates: { label: 'crates of records', base: 0.8, line: 'Crates of records nobody has sorted since the last time the city changed its mind about music.' },
    jingle_board: { label: 'a board of client briefs', base: 0, line: 'A board of client briefs: a logo, a deadline and three adjectives each.' },
    broadcast_rack: { label: 'a broadcast rack', base: 0, line: 'A broadcast rack with a Muse license plate and a cable that runs to every dragon in the district.' },
    clearance_desk: { label: 'a Clearance desk', base: 0, line: 'A small pastel desk, a Clearance officer, a stamp that says APPROVED and a much bigger one that says NOT.' },
    mic_locker: { label: 'a microphone locker', base: 0.6, line: 'A locked cabinet of vintage microphones, each worth more than the car outside.' },
    camera: { label: 'a camera', base: 0.6, line: 'A camera in the corner, watching the door and, sometimes, the desk.' },
    back_door: { label: 'a back door', base: 1, line: 'A back door onto a service alley, with a brick to keep it open.' },
    vent: { label: 'a vent', base: 0.6, line: 'A vent into the next building, about the width of a determined person.' },
    loading_bay: { label: 'a loading bay', base: 0.4, line: 'A loading bay with a roller shutter and a pallet of boxes going out tonight.' },
    balcony: { label: 'a smoking balcony', base: 0.6, line: 'A balcony where everybody goes to smoke and say what they really think about the take.' },
    tip_jar: { label: 'a tip jar', base: 0.8, line: 'A tip jar labelled FOR THE ENGINEER\'S EARS.' },
    notice_board: { label: 'a notice board', base: 1, line: 'A notice board: session players for hire, a band looking for a drummer, a lost cat with a demo tape.' },
    coin_slot: { label: 'a coin slot', base: 0, line: 'A coin slot in the booth door, and a little screen that says INSERT TALENT.' },
    studio_cat: { label: 'a studio cat', base: 0.4, line: 'A studio cat asleep on the warm end of the tape machine.' },
  },
  traits: {
    legendary_console: { label: 'a legendary console', line: 'The console came out of a studio where somebody famous made something everyone knows. The faders are worn to the shape of their fingers.', price: 1.3 },
    producer_ego: { label: 'a producer with an ego', line: 'The producer has opinions about every take, and the opinions have opinions.', price: 1.1 },
    analog_only: { label: 'analog only', line: 'A sign on the door: NO COMPUTERS. The tape machine is the computer.', add: ['tape_machine'] },
    red_light: { label: 'a red-light rule', line: 'When the red light is on, nobody speaks. A man was once asked to leave for sneezing.' },
    free_coffee: { label: 'free coffee', line: 'The coffee is free. It is also the worst in the district, which is a selling point.', add: ['coffee_machine'] },
    cash_only: { label: 'cash only', line: 'CASH ONLY, says a sign in four colours. The card reader is a doorstop.' },
    muse_verified: { label: 'Muse Verified', line: 'A pastel MUSE VERIFIED sticker in the window. Every take is "shared with Muse for quality purposes".', sec: 1, price: 0.9 },
    gang_owned: { label: 'owned by a gang', line: 'The studio is a gang\'s front. The session rates are low and the questions are lower.', price: 0.8, sec: 1 },
    all_night: { label: 'open all night', line: 'It never closes. Somebody is always mid-take, and the coffee knows it.' },
    famous_producer: { label: 'a famous producer', line: 'The producer once made a record that Muse still pretends it made. She does not let anyone forget.', price: 1.4 },
    session_regulars: { label: 'session players on call', line: 'A list of session players by the phone, with grades next to their names and prices next to the grades.', add: ['notice_board'] },
    bootleg_ring: { label: 'a bootleg ring', line: 'After hours, the duplicator runs bootlegs. Everyone knows. Everyone buys one.', add: ['vinyl_crates'] },
    studio_cat: { label: 'a studio cat', line: 'A cat called Reverb has the run of the place and has been on more records than most of the clients.', add: ['studio_cat'] },
    smoking_balcony: { label: 'a smoking balcony', line: 'All the best decisions are made on the balcony, and all the worst ones too.', add: ['balcony'] },
    waiting_list: { label: 'a waiting list', line: 'A waiting list on a clipboard, three pages long, with famous names crossed out and written back in.', price: 1.2 },
    vintage_mics: { label: 'vintage microphones', line: 'A cabinet of microphones older than the city\'s current government, each with a story.', add: ['mic_locker'], price: 1.15 },
    platinum_wall: { label: 'a platinum wall', line: 'A wall of platinum discs. One of them is hers, from a previous life, and the receptionist does not mention it.', add: ['gold_wall'] },
    energy_sponsor: { label: 'sponsored by an energy drink', line: 'Every session comes with a can of Volt Riot. The cans are stacked into a wall.', price: 0.9 },
    tape_shortage: { label: 'short of tape', line: 'There is a tape shortage. Every reel is reused, and you can sometimes hear somebody else\'s song underneath.', price: 1.1 },
    rival_studio: { label: 'a rival across the road', line: 'The studio across the road poaches clients, engineers and once, memorably, a drum kit.' },
    pay_in_points: { label: 'pays in points', line: 'Sessions are cheap here, because the studio takes points on everything recorded in it.', price: 0.6 },
    atlas_client: { label: 'Atlas books here', line: 'Atlas books the room on Tuesdays for "public messaging". The engineer will not say what it is.' },
    open_mic: { label: 'open-mic nights', line: 'Thursdays are open-mic night, and the live room is full of people who should not be.' },
    stream_rig: { label: 'a live-stream rig', line: 'Every session is streamed to eleven hundred strangers who comment on the drummer.', sec: 1 },
    haunted_tape: { label: 'a ghost in the tape', line: 'There is a hiss on every take that sounds, if you listen, like somebody humming.', weight: 0.8 },
    deaf_engineer: { label: 'a half-deaf engineer', line: 'The engineer is half deaf from forty years of monitors, and mixes everything perfectly in one ear.' },
    union_rules: { label: 'union rules', line: 'A tea break every ninety minutes, by the clock, mid-chorus if need be.', price: 1.1 },
    karaoke_below: { label: 'a karaoke bar below', line: 'There is a karaoke bar downstairs, and it is always the same song.' },
    hot_gear: { label: 'hot gear', line: 'Half the gear is very new and none of the serial numbers match.', price: 0.85, sec: 1 },
    old_timer: { label: 'an old session legend', line: 'An old session guitarist is always on the couch. He played on everything. He will tell you.' },
    muse_spy: { label: 'a Muse informant', line: 'Someone in the studio reports to Muse Clearance. Everyone suspects the receptionist. It is not the receptionist.' },
    fire_hazard: { label: 'a fire hazard', line: 'The wiring is a fire hazard in a way that is somehow part of the sound.' },
    tip_culture: { label: 'a tip culture', line: 'You tip the engineer. You tip the runner. You tip the cat.', add: ['tip_jar'] },
  },
  situations: {
    band_session: { label: 'a band in session', line: 'A band is in session, on take forty of the same chorus. The drummer has the look of a man in a siege.', weight: 3, tags: ['session', 'crowd'] },
    lumina_session: { label: 'LUMINA is recording', line: 'LUMINA is recording. There is a velvet rope across the corridor and four Inspiration operatives drinking tea.', weight: 1, tags: ['lumina', 'muse', 'guarded'], only: ['muse', 'indie', 'auto'] },
    clearance_audit: { label: 'a Clearance audit', line: 'A Muse Clearance officer is going through the session logs with a highlighter and a smile.', weight: 1.5, tags: ['audit', 'muse'], not: ['van'] },
    jingle_rush: { label: 'a jingle rush', line: 'Three clients want a jingle by tonight and the composer is crying in the booth. Anyone who can play is welcome.', weight: 2, tags: ['rush', 'work'], purse: 1.6 },
    power_cut: { label: 'a power cut', line: 'The power is out. The engineer is recording an acoustic session on a battery cassette, by torchlight, out of spite.', weight: 1.5, tags: ['dark', 'power_cut'] },
    tape_sale: { label: 'a tape sale', line: 'Boxes of old tapes are for sale by the door, by weight, unlabelled.', weight: 1.5, tags: ['sale'], price: 0.7 },
    producer_away: { label: 'the producer is away', line: 'The producer is away. The engineer is in charge, and is making the most of it.', weight: 1.5, tags: ['away'], price: 0.8 },
    label_scout: { label: 'a label scout', line: 'A scout from an indie label is on the couch pretending not to listen to everything.', weight: 1.2, tags: ['scout', 'gossip'], fame: 1.5 },
    open_mic_night: { label: 'open-mic night', line: 'It is open-mic night. A queue of hopefuls stretches to the car park.', weight: 1.5, tags: ['open_mic', 'crowd'], fame: 1.3 },
    deadline: { label: 'a deadline', line: 'An album is due tomorrow and is nowhere near done. Everyone is awake for the wrong reasons.', weight: 1.2, tags: ['deadline', 'work'], purse: 1.4 },
    launch_party: { label: 'a record launch', line: 'A record launch: warm wine, a DJ, and a band pretending they did not argue all the way through the album.', weight: 1.5, tags: ['party', 'crowd'], fame: 1.4 },
    raid_rumour: { label: 'a bootleg raid is rumoured', line: 'Word is Clearance are raiding bootleggers tonight. A box is being moved from under one desk to under another.', weight: 1.2, tags: ['raid', 'gossip'] },
    flood: { label: 'a flood', line: 'The basement is flooding. Everyone is lifting gear onto chairs and the bassist is in the water to his knees.', weight: 0.8, tags: ['flood'], not: ['van'] },
    choir_booked: { label: 'a choir booked', line: 'A choir of forty is booked in, and is warming up in the corridor at full volume.', weight: 1, tags: ['choir', 'crowd'] },
    broadcast_week: { label: 'dragon broadcast week', line: 'It is broadcast week: next month\'s dragon announcements are being cut. The rack is warm and the guards are bored.', weight: 3, tags: ['broadcast'], only: ['holdmusic'] },
    remix_contest: { label: 'a remix contest', line: 'A remix contest: stems on every terminal, a purse on the board and a judge who only likes bass.', weight: 1, tags: ['contest', 'crowd'], purse: 1.5 },
  },
  wild: {
    haunted: { label: 'a haunted console', line: 'The console is haunted. Every take comes out better than it went in, and there is a stranger singing on the B-side.', weight: 2 },
    lumina_masters: { label: 'LUMINA 1.0\'s masters', line: 'In a drawer, in a box labelled DO NOT, are the original master tapes of LUMINA 1.0. Muse thinks they were destroyed.', weight: 1.2, add: ['master_vault'] },
    dead_producer: { label: 'a producer who records the dead', line: 'The producer only records people who have died. Blackbird, it turns out, qualifies. The sessions are free.', weight: 1.2 },
    one_take: { label: 'one take only', line: 'One take. That is the rule. It goes on the record whatever happens.', weight: 1.5 },
    her_masters: { label: 'her own old masters', line: 'There is a box on a shelf labelled with her name, in a hand she does not know. Inside: the masters of a Blackbird who is not this one.', weight: 1.5, add: ['master_vault', 'tape_machine'] },
    free_studio: { label: 'a free studio', line: 'Sessions are free. The contract on the clipboard says the studio owns everything recorded in it, forever, in this universe and any other.', weight: 1.2 },
    golden_mic: { label: 'the golden microphone', line: 'There is a microphone in a glass case that, legend says, nobody has ever sung badly into.', weight: 1, add: ['mic_locker'] },
    time_loop: { label: 'the same take', line: 'Every take on every tape here is the same take, somehow. The engineer has stopped asking.', weight: 0.8 },
  },
  roster: studioRoster,
  extra: (rng, info) => ({
    // The house session player's grade: who she can hire to play it for her (see studio.ts, the ghost guitarist).
    ghost: Math.round(14 + 9 * info.tier + rng.int(-6, 10)),
    rate: Math.round((6 + 5 * info.tier + rng.int(0, 6)) * (info.variant === 'auto' ? 0.7 : 1)),
  }),
  tail: (info) => (info.wild === 'free_studio' || info.wild === 'dead_producer' ? 'Sessions: free.' : `Sessions: ${studioRate(info)}nd an hour.`),
};

/** What an hour here costs: the house rate, the variant and the traits. */
export function studioRate(info: VenueInfo): number {
  if (info.wild === 'free_studio' || info.wild === 'dead_producer') return 0;
  const v = STUDIO.variants[info.variant];
  const base = Number(info.keep?.rate ?? 9 + 5 * info.tier);
  return Math.max(4, Math.round(base * (v?.price ?? 1) * info.traits.reduce((m, t) => m * (STUDIO.traits[t]?.price ?? 1), 1)));
}

export function studioRoster(loc: Location, info: VenueInfo): SlotDef[] {
  const crowd = [2, 3, 4, 5, 7][info.size] ?? 3;
  const robot = info.variant === 'auto';
  const slots: SlotDef[] = [
    { role: robot ? 'studio_bot' : 'studio_producer', count: [1, 1], chance: 0.92, faction: 'venue', resident: true },
    { role: 'studio_engineer', count: [1, 1], chance: robot ? 0.3 : 0.9, faction: 'venue', resident: true },
    { role: 'studio_runner', count: [1, 1], chance: 0.55, faction: 'venue', resident: true },
    { role: 'studio_session', count: [1, info.traits.includes('session_regulars') ? 3 : 2], chance: 0.75, resident: true },
    { role: 'studio_client', count: [Math.max(0, crowd - 3), crowd], ephemeral: true },
    { role: 'studio_guard', count: [1, 1], chance: Math.min(0.9, 0.05 + loc.security * 0.1), faction: 'venue', resident: true },
  ];
  if (info.variant === 'muse' || info.traits.includes('muse_verified')) slots.push({ role: 'clearance_officer', count: [1, 1], chance: 0.8, resident: true });
  if (info.variant === 'holdmusic') slots.push({ role: 'atlas_trooper', count: [1, 2], chance: 0.8, resident: true });
  if (info.variant === 'jingle' || info.traits.includes('atlas_client')) slots.push({ role: 'jingle_client', count: [1, 1], chance: 0.7, ephemeral: true });
  if (info.traits.includes('old_timer')) slots.push({ role: 'session_legend', count: [1, 1], resident: true });
  if (info.traits.includes('gang_owned')) slots.push({ role: 'ganger', count: [1, 2], chance: 0.8, faction: 'influence' });
  slots.push({ role: 'cop', count: [1, 1], chance: 0.03 });
  return slots;
}
