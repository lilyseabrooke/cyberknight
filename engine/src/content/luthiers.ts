import type { Location, VenueInfo } from '../types';
import type { SlotDef } from '../roster';
import type { VenueTables } from './venues';

/**
 * Luthiers: where guitars are made, mended, armoured, wired, and found again. See luthier.ts for the system (the bench and its
 * tickets, which outlive her; trait grafts; commissions; her own old guitars in the window; the recluse's masterpiece) and
 * provenance.ts for the stories guitars carry. What a luthier *is* is here.
 */

export interface JobDef {
  label: string;
  /** What the board says it does. */
  line: string;
  /** World minutes on the bench. */
  minutes: number;
  /** nd at a tier-3 bench. */
  price: number;
}

/** What the bench can do to a guitar left on it. */
export const JOBS: Record<string, JobDef> = {
  setup: { label: 'a full setup', line: 'new frets, a set neck, action like silk (+1 tone)', minutes: 1440, price: 60 },
  loud: { label: 'new pickups', line: 'hotter pickups and a bigger output (+1 volume)', minutes: 1440, price: 80 },
  harden: { label: 'armouring', line: 'a steel neck and a riot-plate back (+1 hardened; it swings like a club)', minutes: 2880, price: 110 },
  jack: { label: 'a city jack', line: 'a port that talks to billboards and PA towers (+1 jacked)', minutes: 1440, price: 120 },
  resonate: { label: 'tuning the body', line: 'a body tuned to find a frequency (+1 resonance)', minutes: 2880, price: 130 },
  feedback: { label: 'a sustainer', line: 'a sustainer that holds a note until somebody falls over (+1 feedback)', minutes: 1440, price: 90 },
  restore: { label: 'a restoration', line: 'for one of her own from before: brought back to how she played it (+1 tier, +1 signature)', minutes: 4320, price: 150 },
  store: { label: 'safekeeping', line: 'kept on the rack, insured by nobody, waiting for her', minutes: 0, price: 10 },
  commission: { label: 'a commission', line: 'a new guitar, built for her hands (ready in three days)', minutes: 4320, price: 260 },
};

export const LUTHIER: VenueTables = {
  kind: 'luthier',
  label: 'a luthier',
  chance: { market: 0.05, nightlife: 0.04, tenement: 0.04, industrial: 0.04, corporate: 0.02, slum: 0.03 },
  lean: {
    market: { master: 2, welder: 1, titanware: 1, muse_tech: 1.5, tonewood: 2, recluse: 0.6, repair: 3, amp_tech: 2, secondhand: 3 },
    nightlife: { master: 1.5, welder: 1, titanware: 2, muse_tech: 2, tonewood: 1, recluse: 0.6, repair: 2, amp_tech: 4, secondhand: 2 },
    tenement: { master: 2, welder: 1.5, titanware: 0.6, muse_tech: 0.8, tonewood: 1, recluse: 1.5, repair: 4, amp_tech: 1.5, secondhand: 3 },
    industrial: { master: 1, welder: 5, titanware: 2, muse_tech: 0.6, tonewood: 2, recluse: 1, repair: 2, amp_tech: 2, secondhand: 2 },
    corporate: { master: 2, welder: 0.2, titanware: 4, muse_tech: 4, tonewood: 1.5, recluse: 0.4, repair: 1, amp_tech: 1, secondhand: 0.5 },
    slum: { master: 1, welder: 3, titanware: 0.4, muse_tech: 0.2, tonewood: 0.5, recluse: 2, repair: 3, amp_tech: 1, secondhand: 4 },
  },
  hours: [10, 20],
  prestige: 0.7,
  variants: {
    master: {
      label: 'a master luthier',
      names: ['The Long Neck', 'Fret & Grain', 'Spruce Top Workshop', 'Ironwood & Daughters', 'The Bent Bridge', 'Harmonic Workshop', 'Nut & Saddle', 'The Heel Joint', 'Old Grain', 'Truss Rod & Co.', 'Bindings & Bends', 'The Sound Hole'],
      blurbs: [
        '{name}: a workshop that smells of varnish and patience, where a guitar takes a year and the luthier takes no visitors without an appointment, except you, apparently.',
        '{name}: guitars hang from the ceiling at every stage of becoming one, and an old hand runs a plane along a neck like it is a cat.',
        '{name}: the best hands in the district, and they know it, and they will tell you so in the form of a waiting list.',
      ],
      wall: ['An Atlas "Workplace Hazards" poster, mostly covered by a calendar of trees.', 'A Muse letter offering to "partner" on approved instruments. It is being used as a shim.', 'A drone part used as a clamp.'],
      price: 1.4, floor: ['workbench', 'guitar_wall', 'wood_stack', 'tuning_room'], more: { drying_room: 2, photo_wall: 2, apprentice_bench: 2, vintage_case: 1.5 }, sec: 2, crowd: 0.2,
    },
    welder: {
      label: 'a Rust Choir welder',
      names: ['Weld & Wail', 'The Chainsaw Shop', 'Hot Metal Guitars', 'Spark & String', 'The Iron Neck', 'Grinder\'s Guitars', 'Scrap & Strum', 'Arc Light Instruments', 'The Clang Works', 'Bolt-On Necks', 'Rivet Guitars', 'The Sparks Fly'],
      blurbs: [
        '{name}: a welding bay where the Rust Choir turns car doors into guitars and guitars into weapons.',
        '{name}: sparks, a radio playing nothing but the Choir, and a rack of instruments you could kill a man with.',
        '{name}: if it can be played, it can be armoured. If it can be armoured, it can be played. That is the whole philosophy.',
      ],
      wall: ['An Atlas trooper helmet welded to a guitar body, as a joke and a warning.', 'A Muse drone, flattened, nailed up as a pickguard template.', 'An Atlas salvage licence, used as a welding shield.'],
      price: 0.9, floor: ['welding_rig', 'workbench', 'scrap_pile'], more: { test_amp: 2, guitar_wall: 1.5, back_door: 2, radio: 1.5 }, sec: 2, crowd: 0.3,
    },
    titanware: {
      label: 'a Titanware instrument bay',
      names: ['Titanware Sound Integration {n}', 'Titanware Performance Optics', 'The Titanware Music Lab', 'Titanware Instrument Clinic {n}', 'Smart Strings by Titanware', 'Titanware Connected Sound', 'The Wired Fret', 'Titanware Audio Augment'],
      blurbs: [
        '{name}: guitars on white plinths, each one with a port, a chip and an eye, and a technician who calls them "endpoints".',
        '{name}: a clean room where instruments are taught to talk to the city, and the city is taught to listen.',
        '{name}: a reception, an open eye over the door, and a menu of upgrades priced by the month.',
      ],
      wall: ['The Titanware eye over the door, open, Verified.', 'A Titanware brochure: YOUR MUSIC, MEASURED.', 'An Atlas compliance sticker on every port.'],
      price: 1.3, floor: ['workbench', 'diagnostic_rig', 'guitar_wall'], more: { test_amp: 2, parts_drawers: 2, customer_chair: 1.5 }, sec: 4, crowd: 0.3,
    },
    muse_tech: {
      label: 'a Muse-certified guitar tech',
      names: ['Muse Approved Instruments', 'Muse Guitar Care {n}', 'The Muse Instrument Lounge', 'Heartline Guitars (Muse Certified)', 'Muse SafeSound Service', 'Approved Strings', 'Muse Instrument Wellness', 'The Pastel Fret'],
      blurbs: [
        '{name}: a pastel workshop where every guitar leaves with a small heart on the headstock and a smaller tracker under it.',
        '{name}: cheap, quick, friendly, and on Muse\'s books, and everything it touches reports home.',
        '{name}: a tech with a lanyard and a soldering iron and a list of songs your guitar is no longer allowed to play.',
      ],
      wall: ['A Muse poster: A HAPPY GUITAR IS A LICENSED GUITAR 🥰.', 'A Clearance notice: instruments repaired here may be "updated for compliance".', 'An Atlas warranty desk in the corner, for the guitars.'],
      price: 0.7, floor: ['workbench', 'muse_scanner', 'guitar_wall'], more: { test_amp: 1.5, customer_chair: 2, parts_drawers: 1 }, sec: 3, crowd: 0.4,
    },
    tonewood: {
      label: 'a tonewood dealer',
      names: ['Old Growth Tonewood', 'The Timber Vault', 'Quartersawn', 'Last Forest Supplies', 'The Wood Room', 'Grain & Ring', 'Seasoned Stock', 'The Log Store', 'Heartwood', 'Spalted & Sons', 'The Billet Shop', 'Figured Maple Co.'],
      blurbs: [
        '{name}: a vault of wood from forests that do not exist any more, sold by the slice, at the price of a car.',
        '{name}: stacks of seasoned timber to the ceiling, and a dealer who taps each board and listens to it like a doctor.',
        '{name}: the wood is older than the city. The prices are newer.',
      ],
      wall: ['An Atlas certificate of "sustainable salvage" for a forest Atlas cut down.', 'A Muse offer to buy the whole stock, framed and declined.', 'A drone wrapped in a tarp, used as a doorstop.'],
      price: 1.5, floor: ['wood_stack', 'drying_room', 'workbench'], more: { vintage_case: 1.5, tuning_room: 1.5, back_room: 2 }, sec: 3, crowd: 0.15,
    },
    recluse: {
      label: 'a recluse\'s workshop',
      names: ['The Hermit\'s Bench', 'One A Year', 'The Last Workshop', 'Nobody Home Guitars', 'The Closed Door', 'Hand Made, Once', 'The Annual', 'Slow Hands', 'The Quiet Shop', 'Knock Twice', 'By Appointment Only (No Appointments)', 'The Year Guitar'],
      blurbs: [
        '{name}: a door with no sign, a recluse who builds one perfect guitar a year, and this year\'s on a stand in the window.',
        '{name}: a dark room, a single bench and a person who has not spoken to a customer since the last flood.',
        '{name}: you knock, nobody answers, and then the door is open and you are in.',
      ],
      wall: ['An Atlas census form, unopened, since the census before last.', 'A Muse letter that says "we would love to collaborate", in the bin.', 'A camera over the door with a sock on it.'],
      price: 2, floor: ['masterpiece_stand', 'workbench'], more: { wood_stack: 2, kettle: 2, cat: 1.5, vintage_case: 1 }, sec: 2, crowd: 0.05,
    },
    repair: {
      label: 'a guitar repair shop',
      names: ['Fix It Frets', 'The Broken Neck', 'Glue & Clamp', 'Strings Attached', 'The Setup Shop', 'Mend & Play', 'Dr. Fret', 'Second Life Guitars', 'The Neck Doctor', 'Same Day Repairs', 'Stringer\'s', 'The Fret Clinic'],
      blurbs: [
        '{name}: a counter, a bench and a ticket book. You leave it, you come back, it plays. That is the deal.',
        '{name}: a wall of guitars with paper tickets on, waiting for owners who may or may not come back.',
        '{name}: busy, cheap, honest, and the guitars on the rack have been waiting longer than some marriages.',
      ],
      wall: ['An Atlas "Report Unlicensed Instruments" sticker on the till, face down.', 'A Muse compliance form, half filled in with doodles.', 'A drone in for repair. It is not a guitar, but nobody told the drone.'],
      price: 0.8, floor: ['workbench', 'ticket_rack', 'string_rack'], more: { parts_drawers: 2, test_amp: 1.5, kettle: 1.5, radio: 1.5 }, sec: 1, crowd: 0.4,
    },
    amp_tech: {
      label: 'an amp and pickup shop',
      names: ['Valve & Volume', 'The Tube Room', 'Hot Pickups', 'Overdrive Electrics', 'The Ohm Shop', 'Gain Stage', 'Feedback Loop Electrics', 'Loud Machines', 'The Speaker Cabinet', 'Watts Up', 'Hum & Buzz', 'The Fuzz Factory'],
      blurbs: [
        '{name}: a room of amps stacked like a skyline and a tech with tinnitus and a soldering iron.',
        '{name}: every pickup in here is wound by hand by someone who can hear the difference and nobody else can.',
        '{name}: it is never quiet. The test amp is always on, and always too loud.',
      ],
      wall: ['An Atlas noise-complaint notice from the neighbours, framed as a trophy.', 'A Muse decibel limiter, unplugged, in a bin.', 'A drone with a speaker taped to it, for testing.'],
      price: 1, floor: ['test_amp', 'workbench', 'amp_stack'], more: { parts_drawers: 2, guitar_wall: 1.5, radio: 1 }, sec: 2, crowd: 0.35,
    },
    secondhand: {
      label: 'a secondhand guitar dealer',
      names: ['Previously Loved Guitars', 'The Second Chance', 'Old Strings', 'Hand-Me-Down Guitars', 'Strum Again', 'Pre-Played', 'Used & Abused', 'The Guitar Graveyard', 'Lost & Found Guitars', 'Recycled Riffs', 'Somebody Else\'s Guitar', 'Second Verse'],
      blurbs: [
        '{name}: a wall of other people\'s guitars, each with a tag and a story, and a dealer who knows half of the stories.',
        '{name}: every guitar that ever went missing in the district ends up here sooner or later, with a new price.',
        '{name}: the shop where guitars go between owners. Some of them have had a lot of owners.',
      ],
      wall: ['An Atlas stolen-goods register, never opened.', 'A Muse confiscation notice: "these instruments may be compliant".', 'A drone in the window, for sale, cheap, "as seen".'],
      price: 0.9, floor: ['guitar_wall', 'workbench', 'window_display'], more: { case_rack: 2, ticket_rack: 1.5, back_room: 2, photo_wall: 1 }, sec: 2, crowd: 0.4,
    },
  },
  shells: {
    shoe: { label: 'over a shoe repairer', line: 'Over a shoe repairer; the two shops share glue, a kettle and opinions.', sec: 0 },
    vestry: { label: 'a church vestry', line: 'The vestry of a church, where the choir robes once hung. The guitars hang there now.', sec: 0 },
    container: { label: 'a shipping container', line: 'A shipping container with a window cut in one end and a workbench bolted to the floor.', sec: 0 },
    boatyard: { label: 'a boatyard shed', line: 'A boatyard shed. The guitars are made with the same tools as the boats, and float about as well.', sec: 0, add: ['wood_stack'] },
    arch: { label: 'a railway arch', line: 'A railway arch. Every eight minutes a train goes over and every guitar on the wall hums.', sec: 1, weight: 1.3 },
    attic: { label: 'an attic', line: 'An attic up four flights, with a skylight and a pulley for the wood.', sec: 0, add: ['skylight'] },
    basement: { label: 'a basement', line: 'A basement, dry for once, which is why the wood is here.', sec: 1 },
    stall: { label: 'a market stall', line: 'A market stall that grew walls, then a roof, then a waiting list.', sec: 0 },
    garage: { label: 'a lock-up garage', line: 'A lock-up garage with the door up and the radio on.', sec: 0, add: ['radio'] },
    greenhouse: { label: 'a greenhouse', line: 'A greenhouse used to season wood: warm, dry and full of tomato plants that nobody planted.', sec: 0, add: ['drying_room'] },
    piano: { label: 'an old piano factory', line: 'An old piano factory, mostly empty, with one corner warm and full of guitars.', sec: 1, add: ['vintage_case'] },
    tram: { label: 'a tram depot office', line: 'A tram depot office. The timetables are still on the wall, and the guitars run late.', sec: 0 },
  },
  features: {
    workbench: { label: 'a workbench', base: 0, line: 'A workbench with a vice, a radius gauge and a guitar in pieces, waiting.' },
    guitar_wall: { label: 'a wall of guitars', base: 0.8, line: 'A wall of guitars, each with a paper tag and a price in pencil.' },
    wood_stack: { label: 'a stack of tonewood', base: 0.6, line: 'A stack of tonewood with chalk on each board: where it grew, when it fell.' },
    drying_room: { label: 'a drying room', base: 0.4, line: 'A drying room, warm and dark, full of necks hanging like bats.' },
    tuning_room: { label: 'a tuning room', base: 0.4, line: 'A small, quiet room with a stool, a tuning fork and nothing else.' },
    photo_wall: { label: 'a wall of famous clients', base: 0.5, line: 'A wall of photos of famous people holding guitars made here. One of them is her.' },
    apprentice_bench: { label: 'an apprentice\'s bench', base: 0.5, line: 'An apprentice\'s bench, tidier than the master\'s, with one very bad guitar on it.' },
    vintage_case: { label: 'a locked vintage case', base: 0.5, line: 'A glass case with a lock and one old guitar in it that is not for sale.' },
    welding_rig: { label: 'a welding rig', base: 0, line: 'A welding rig, a mask, and a guitar neck glowing on the anvil.' },
    scrap_pile: { label: 'a scrap pile', base: 0.4, line: 'A pile of car doors, oil drums and dead amps: tomorrow\'s guitars.' },
    test_amp: { label: 'a test amp', base: 0.8, line: 'A test amp, always on, always slightly too loud.' },
    back_door: { label: 'a back door', base: 0.6, line: 'A back door onto a yard full of offcuts.' },
    radio: { label: 'a radio', base: 0.5, line: 'A radio tuned to a pirate station, low.' },
    diagnostic_rig: { label: 'a diagnostic rig', base: 0, line: 'A diagnostic rig that plugs into a guitar and tells you its feelings, in graphs.' },
    parts_drawers: { label: 'drawers of parts', base: 0.8, line: 'A cabinet of tiny drawers: pickups, pots, frets, a screw for everything.' },
    customer_chair: { label: 'a customer\'s chair', base: 0.5, line: 'A customer\'s chair, comfortable, with an ashtray built into the arm.' },
    muse_scanner: { label: 'a Muse scanner', base: 0, line: 'A Muse scanner on the bench that reads what a guitar has played, and reports anything unlicensed.' },
    masterpiece_stand: { label: 'this year\'s guitar', base: 0, line: 'A stand in the window, and on it this year\'s guitar, the only one, and the light falls on it like it was told to.' },
    kettle: { label: 'a kettle', base: 0.6, line: 'A kettle, always on, and three mugs that have never been washed together.' },
    cat: { label: 'a workshop cat', base: 0.4, line: 'A cat asleep in the sawdust, who has been on every guitar here at some point.' },
    ticket_rack: { label: 'a rack of ticketed guitars', base: 0.4, line: 'A rack of guitars with paper tickets, waiting for owners. Some have waited for years.' },
    string_rack: { label: 'a rack of strings', base: 0.6, line: 'A rack of strings in every gauge, and a sign that says ASK, DON\'T TAKE.' },
    amp_stack: { label: 'a stack of amps', base: 0.3, line: 'A stack of amps to the ceiling, each with a cardboard note: FIXED, NOT FIXED, HAUNTED.' },
    window_display: { label: 'a window display', base: 0.3, line: 'A window display of the shop\'s best guitars, and the one everyone stops for.' },
    case_rack: { label: 'a rack of cases', base: 0.5, line: 'A rack of guitar cases, some empty, some definitely not.' },
    back_room: { label: 'a back room', base: 0.4, line: 'A back room the dealer does not show people, with a lock and a reason.' },
    skylight: { label: 'a skylight', base: 0.3, line: 'A skylight, propped open with a pencil.' },
    sawdust: { label: 'sawdust', base: 0.6, line: 'Sawdust everywhere, deep enough to lose a plectrum in for good.' },
  },
  traits: {
    waiting_list: { label: 'a waiting list', line: 'A waiting list in a ledger, two years long, with famous names crossed out and written back in.', price: 1.3 },
    cash_only: { label: 'cash only', line: 'Cash only. The card reader is a coaster.' },
    apprentice: { label: 'an apprentice', line: 'An apprentice does the setups, slowly, and the master checks every one, slower.', add: ['apprentice_bench'] },
    famous_clients: { label: 'famous clients', line: 'Famous people come here. Their photos are on the wall, signed. She is one of them, from before.', add: ['photo_wall'], price: 1.2 },
    rust_choir: { label: 'Rust Choir regulars', line: 'The Rust Choir drop in, loudly, and leave with things that are part guitar and part weapon.' },
    muse_contract: { label: 'a Muse contract', line: 'The shop does Muse\'s repairs. Everything that leaves has a heart on the headstock.', price: 0.8 },
    titan_verified: { label: 'Titanware Verified', line: 'A Titanware Verified sticker on the door, and the eye on the till.', sec: 1 },
    stolen_stock: { label: 'stolen stock', line: 'Half the guitars on the wall were stolen, and the dealer knows which half.', price: 0.8, sec: 1 },
    free_tea: { label: 'free tea', line: 'There is always tea. There is always a story with it.', add: ['kettle'] },
    workshop_cat: { label: 'a workshop cat', line: 'A cat called Bridge has the run of the place.', add: ['cat'] },
    radio_pirate: { label: 'a pirate station on', line: 'The radio is always on a pirate station. Sometimes it is playing her.', add: ['radio'] },
    open_late: { label: 'open late', line: 'Open late, because guitars break at night.' },
    slow: { label: 'slow hands', line: 'Everything takes twice as long and is twice as good.', price: 1.1 },
    fast: { label: 'same day', line: 'Same day, every job, no excuses. Some of the jobs show it.', price: 1.2 },
    exotic_woods: { label: 'exotic woods', line: 'Wood from places that no longer exist, at prices that should not.', add: ['wood_stack'], price: 1.3 },
    vintage_parts: { label: 'vintage parts', line: 'Drawers of vintage parts, salvaged from guitars older than the city.', add: ['parts_drawers'] },
    haunted_rack: { label: 'a haunted rack', line: 'One rack hums on its own at night. The guitars on it have all outlived their owners.' },
    deaf_luthier: { label: 'a deaf luthier', line: 'The luthier is deaf and tunes by touch. The guitars are perfect.' },
    feud: { label: 'a feud', line: 'The luthier across the road stole a technique, a client and a wife. The feud is musical and lifelong.' },
    gang_tax: { label: 'taxed by a gang', line: 'A gang comes on Fridays for a cut, and for a free setup.', price: 1.15 },
    loud: { label: 'very loud', line: 'Every test is at full volume. The neighbours have given up.', add: ['test_amp'] },
    sawdust_deep: { label: 'deep sawdust', line: 'The sawdust is ankle deep, and some of it is very old.', add: ['sawdust'] },
    legendary_hands: { label: 'legendary hands', line: 'The luthier\'s hands are insured, by somebody who is not Atlas, for an amount nobody will say.', price: 1.5 },
    lost_and_found: { label: 'lost and found', line: 'Guitars that turn up in the gutter get brought here. Some of them are hers.', add: ['ticket_rack'] },
    trade_ins: { label: 'trade-ins', line: 'They take trade-ins, and are honest about what yours is worth, which hurts.' },
    tour_buses: { label: 'tour bus stop', line: 'Tour buses stop outside. Touring musicians come in, panicking, with broken necks.' },
    hand_written_tags: { label: 'handwritten tags', line: 'Every guitar has a handwritten tag with its history on, as far as anyone knows it.' },
    custom_inlays: { label: 'custom inlays', line: 'Mother-of-pearl inlays in any shape. Somebody once asked for Atlas\'s logo and was asked to leave.' },
    atlas_inspection: { label: 'an Atlas inspector', line: 'An Atlas safety inspector calls monthly about the varnish fumes, and is offered tea, and leaves.' },
    smells_amazing: { label: 'it smells amazing', line: 'It smells of rosewood, coffee and hot solder, which is the best smell in Neo.' },
  },
  situations: {
    deadline: { label: 'a touring band\'s emergency', line: 'A touring band\'s guitarist is in with a snapped neck and a show tonight.', weight: 2, tags: ['emergency', 'work'], purse: 1.6 },
    wood_delivery: { label: 'a wood delivery', line: 'A delivery of tonewood is being unloaded, board by board, and the luthier is weeping slightly.', weight: 1.5, tags: ['delivery'] },
    auction: { label: 'an auction', line: 'There is an auction of an estate: a dead player\'s guitars, one by one.', weight: 1.5, tags: ['auction', 'crowd'], price: 1.2 },
    clearance_visit: { label: 'a Clearance visit', line: 'A Muse Clearance officer is inspecting the instruments for compliance, with a highlighter.', weight: 1.2, tags: ['audit', 'muse'] },
    power_cut: { label: 'a power cut', line: 'The power is out. Hand tools only. The luthier is delighted.', weight: 1.2, tags: ['dark', 'power_cut'] },
    sale: { label: 'a sale', line: 'A SALE sign in the window, in a hand that clearly does not believe in sales.', weight: 1.5, tags: ['sale'], price: 0.7 },
    luthier_away: { label: 'the luthier is away', line: 'The luthier is away at a wood fair. The apprentice is in charge, and frightened.', weight: 1.2, tags: ['away'], price: 0.9 },
    open_workshop: { label: 'an open workshop', line: 'An open workshop: anybody can come in and build a little. There are biscuits.', weight: 1.2, tags: ['open', 'crowd'] },
    flood: { label: 'a flood', line: 'The basement flooded. The wood is on chairs and the luthier is not speaking.', weight: 0.8, tags: ['flood'] },
    burglary: { label: 'a burglary', line: 'Somebody broke in last night. The vintage case is open and empty, and the luthier knows who.', weight: 1, tags: ['burgled', 'gossip'] },
    rust_choir_order: { label: 'a Choir order', line: 'The Rust Choir have ordered twelve armoured guitars by Friday. The welder is not sleeping.', weight: 1.2, tags: ['choir', 'work'] },
    signing: { label: 'a guitar signing', line: 'A famous player is in signing guitars. The queue is round the block.', weight: 1, tags: ['signing', 'crowd'], fame: 1.4 },
    strings_short: { label: 'a string shortage', line: 'There is a string shortage. Every set is rationed, and the luthier hides the good ones.', weight: 1, tags: ['shortage'], price: 1.3 },
    her_guitar_in: { label: 'one of hers came in', line: 'A guitar came in this morning in a carrier bag, and the luthier is looking at it, and then at her.', weight: 1.5, tags: ['hers'] },
  },
  wild: {
    her_maker: { label: 'the one who made hers', line: 'The luthier made a guitar for a previous Blackbird, years ago. They remember her hands better than she does.', weight: 2 },
    cursed: { label: 'a cursed bench', line: 'The bench is cursed. Every job comes out better than it should, and every slip draws blood.', weight: 1.2 },
    singing_wood: { label: 'singing wood', line: 'There is a board in the stack that sings when the wind blows. The luthier will not cut it for anyone.', weight: 1.2 },
    graveyard: { label: 'the guitar graveyard', line: 'Out the back is a yard where guitars go to die. Some of them are not dead.', weight: 1.2 },
    twin: { label: 'her guitar\'s twin', line: 'On the wall is the twin of a guitar she used to play, from the same tree, never sold.', weight: 1 },
    robot_luthier: { label: 'a robot luthier', line: 'The luthier is a robot that learned from a master who died. It hums while it works, in his voice.', weight: 1 },
    lumina_guitar: { label: 'LUMINA\'s guitar', line: 'LUMINA\'s stage guitar is in for repair. It is pastel, wired to Muse, and very valuable.', weight: 1 },
    the_first_guitar: { label: 'the first guitar', line: 'In the vintage case: allegedly the first guitar ever played in Neo, before Atlas, before Muse.', weight: 1 },
  },
  roster: luthierRoster,
  extra: (rng, info) => ({
    // The recluse's guitar of the year: on the stand until somebody buys it.
    ...(info.variant === 'recluse' ? { masterpiece: 1, mtier: 8 + rng.int(0, 1) } : {}),
    rate: Math.round((0.7 + 0.15 * info.tier + rng.int(0, 2) / 10) * 100) / 100,
  }),
  tail: (info) => (info.variant === 'recluse' ? 'This year\'s guitar is in the window.' : `Bench work from ${Math.round(JOBS.setup!.price * Number(info.keep?.rate ?? 1) * (LUTHIER.variants[info.variant]?.price ?? 1))}nd.`),
};

export function luthierRoster(loc: Location, info: VenueInfo): SlotDef[] {
  const slots: SlotDef[] = [
    { role: info.wild === 'robot_luthier' ? 'luthier_bot' : 'luthier', count: [1, 1], chance: 0.95, faction: 'venue', resident: true },
    { role: 'luthier_apprentice', count: [1, 1], chance: info.traits.includes('apprentice') ? 1 : 0.4, faction: 'venue', resident: true },
    { role: 'luthier_customer', count: [0, [1, 2, 2, 3, 4][info.size] ?? 2], ephemeral: true },
    { role: 'studio_session', count: [1, 1], chance: 0.3 },
  ];
  if (info.variant === 'welder' || info.traits.includes('rust_choir')) slots.push({ role: 'ganger', count: [1, 2], chance: 0.6, faction: 'influence' });
  if (info.variant === 'muse_tech' || info.traits.includes('muse_contract')) slots.push({ role: 'clearance_officer', count: [1, 1], chance: 0.4, resident: true });
  if (info.variant === 'titanware') slots.push({ role: 'tw_liaison', count: [1, 1], chance: 0.6, resident: true });
  slots.push({ role: 'cop', count: [1, 1], chance: 0.03 });
  return slots;
}
