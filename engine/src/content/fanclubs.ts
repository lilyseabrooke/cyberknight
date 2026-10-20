import type { Location, VenueInfo } from '../types';
import type { SlotDef } from '../roster';
import type { VenueTables } from './venues';

/**
 * Fan clubs: places her fame builds. Nobody rolls them with the map; when enough of her fans live round a block, they open one
 * (fanclub.ts `fanclubTick`), in a laundromat or a stairwell or the back of a noodle bar, and it stays: made from Neo's memory of
 * her, it outlives every body she has. What a fan club *is* is here; what it does is in fanclub.ts.
 */

/** The jobs her superfans have, and the one favour each can do her (fanclub.ts). */
export const SUPERFAN_JOBS: Record<string, { label: string; favour: string }> = {
  desk_sergeant: { label: 'a desk sergeant', favour: 'loses her file for a night' },
  helix_tech: { label: 'a Helix lab tech', favour: 'brings her a med kit out of the stores' },
  dragon_tech: { label: 'a dragon technician', favour: 'tunes the nearest dragon\'s ears to her song' },
  atlas_manager: { label: 'an Atlas middle manager', favour: 'files her Atlas paperwork in the shredder' },
  clearance: { label: 'a Muse Clearance officer', favour: 'brings one of her confiscated guitars home in a coat' },
  receptionist: { label: 'a Muse receptionist', favour: 'gets her a staff lanyard' },
  journalist: { label: 'a music journalist', favour: 'writes her a five-star review' },
  bouncer: { label: 'a club bouncer', favour: 'puts her on every guest list on the street' },
  bus_driver: { label: 'a night-bus driver', favour: 'knows everyone who rode the night bus, and where they got off' },
  gang_lieutenant: { label: 'a gang lieutenant', favour: 'calls the gang off her for a night' },
  luthier: { label: 'a luthier\'s apprentice', favour: 'restrings and sets up her guitar for nothing' },
  dj: { label: 'a club DJ', favour: 'plays her record at peak time' },
};

export const FANCLUB: VenueTables = {
  kind: 'fanclub',
  label: 'a fan club',
  // Never rolled with the map: her fans open them (fanclub.ts).
  chance: { market: 0, nightlife: 0, tenement: 0, industrial: 0, corporate: 0, slum: 0 },
  lean: {
    market: { laundromat: 2, backroom: 2, stairwell: 1, garage: 1, noodle: 3, rooftop: 1, recordshop: 3, hall: 1.5, flat: 1 },
    nightlife: { laundromat: 1, backroom: 4, stairwell: 1, garage: 1, noodle: 2, rooftop: 2, recordshop: 2, hall: 1, flat: 1 },
    tenement: { laundromat: 3, backroom: 1, stairwell: 3, garage: 2, noodle: 2, rooftop: 2, recordshop: 1, hall: 2, flat: 3 },
    industrial: { laundromat: 1, backroom: 1, stairwell: 1, garage: 4, noodle: 1, rooftop: 1, recordshop: 1, hall: 2, flat: 1 },
    corporate: { laundromat: 0.5, backroom: 2, stairwell: 0.5, garage: 0.5, noodle: 1, rooftop: 3, recordshop: 2, hall: 1, flat: 2 },
    slum: { laundromat: 2, backroom: 1, stairwell: 4, garage: 3, noodle: 2, rooftop: 1, recordshop: 0.5, hall: 2, flat: 2 },
  },
  hours: [12, 3],
  prestige: 1.3,
  epoch: 1,
  variants: {
    laundromat: {
      label: 'a laundromat fan club',
      names: ['The Blackbird Wash Club', 'Spin Cycle Society', 'The Soap & Solos Club', 'The Rinse Repeat Fan Club', 'Tumble Dry Blackbird', 'The Coin-Op Faithful', 'The Suds Society', 'Clean Hands Club'],
      blurbs: [
        '{name}: a laundromat where the dryers spin in time and every machine has her face on a sticker. The members meet on Tuesdays, during the long cycle.',
        '{name}: her songs on the change machine\'s little speaker, a shrine on the folding table, and a membership book that smells of fabric softener.',
        '{name}: a fan club in a laundromat, because that is where the president works, and nobody has questioned it.',
      ],
      wall: ['A Muse Clearance letter to the club, framed, signed by every member.', 'An Atlas "Report Suspicious Gatherings" poster with every member\'s signature on it as a joke.', 'A drone parked on a dryer with her sticker on it.'],
      price: 0.8, floor: ['shrine', 'membership_book', 'notice_board'], more: { merch_table: 2, couch: 1.5, kettle: 2 }, sec: 0, crowd: 0.6,
    },
    backroom: {
      label: 'a back room over a bar',
      names: ['The Blackbird Room', 'Upstairs at the Halo (Unofficial)', 'The Nest', 'The Encore Room', 'The Second Floor Faithful', 'The Back Room Choir', 'Blackbird Society (Upstairs)', 'The Green Room'],
      blurbs: [
        '{name}: a function room over a bar, taken over by her fans: a stage the size of a door, a shrine, a bar that does a cocktail named after her.',
        '{name}: posters of her from every body she has had, and a members\' night every night.',
        '{name}: the bar downstairs pretends not to know. The noise through the ceiling says otherwise.',
      ],
      wall: ['A Muse cease-and-desist letter, used as a beer mat.', 'An Atlas fire-safety notice: CAPACITY 40. A marker adds: (WE ARE 120).', 'A Muse drone, shot down at her last show, mounted like a trophy.'],
      price: 1, floor: ['shrine', 'tribute_stage', 'bar_counter'], more: { merch_table: 2, photo_wall: 2, setlist_archive: 1.5, couch: 1 }, sec: 1, crowd: 0.8,
    },
    stairwell: {
      label: 'a stairwell shrine',
      names: ['The Stairwell Shrine', 'Flight Seven', 'The Landing', 'Blackbird Steps', 'The Echo Stair', 'Between Floors', 'The Fire Escape Faithful', 'Stair Nine'],
      blurbs: [
        '{name}: a stairwell in a tenement block that has become a shrine, candles on every step and her lyrics on every wall.',
        '{name}: the best echo in the building, and her fans meet on the landing to sing her songs into it.',
        '{name}: a dozen floors of graffiti, all hers, all loving, and a landing with a sofa somebody carried up.',
      ],
      wall: ['An Atlas "Keep Stairwells Clear" sign, cleared of everything but her face.', 'A Muse noise complaint, pinned to the banister, answered in marker.', 'A drone stuck in the stairwell, decorated like a Christmas tree.'],
      price: 0.5, floor: ['shrine', 'graffiti_wall'], more: { couch: 2, notice_board: 2, candles: 3 }, sec: 0, crowd: 0.5,
    },
    garage: {
      label: 'a garage clubhouse',
      names: ['The Garage', 'Blackbird Motors (Not A Garage)', 'The Lock-Up Club', 'The Roller Door Society', 'Garage Band Club', 'The Oil Stain Faithful', 'Bay Four', 'The Shed'],
      blurbs: [
        '{name}: a lock-up garage with a roller door, a drum kit, and her tribute band rehearsing every night at a volume the street has accepted.',
        '{name}: a car has not been in this garage for years. Her fans have.',
        '{name}: half clubhouse, half rehearsal room, half merch factory. The maths does not work and nobody cares.',
      ],
      wall: ['An Atlas parking notice on the roller door, eleven deep.', 'A Muse drone in a vice, half dismantled, "for parts".', 'A banner: BLACKBIRD FAN CLUB (EST. WHENEVER).'],
      price: 0.7, floor: ['tribute_stage', 'shrine', 'merch_press'], more: { merch_table: 2, notice_board: 1.5, couch: 1.5 }, sec: 1, crowd: 0.6,
    },
    noodle: {
      label: 'the back of a noodle bar',
      names: ['The Blackbird Booth', 'Noodles & Nest', 'The Corner Table', 'The Broth Society', 'Slurp Club', 'The Back Booth Faithful', 'Bowl Twelve', 'The Chopstick Choir'],
      blurbs: [
        '{name}: the back booths of a noodle bar, given over to her fans, with a shrine above the fryer and a dish named after her (it is too spicy).',
        '{name}: the noodle bar\'s owner is the club president. The soup is free for members and the members are everyone.',
        '{name}: a corner of steam and fans, a TV that only plays her bootlegs, and a waiter who sings along.',
      ],
      wall: ['An Atlas food-hygiene sticker, five stars, next to a shrine to her.', 'A Muse menu-licensing notice for "the Blackbird Special". Ignored.', 'A drone hovering over the fryer, slowly cooking.'],
      price: 0.8, floor: ['shrine', 'noodle_counter', 'tv'], more: { merch_table: 1.5, notice_board: 1.5, kettle: 1 }, sec: 0, crowd: 0.8,
    },
    rooftop: {
      label: 'a rooftop fan club',
      names: ['The Roof', 'Blackbird Heights', 'The Skyline Society', 'Top Floor Faithful', 'The Water Tank Club', 'The Antenna Choir', 'Up Here', 'The Ledge'],
      blurbs: [
        '{name}: a rooftop with deckchairs, a shrine by the water tank and a view of every billboard her fans have hijacked.',
        '{name}: her fans meet on the roof to listen to pirate radio and point at dragons.',
        '{name}: the best view in the district and the worst railings.',
      ],
      wall: ['An Atlas antenna on the roof, retuned to a pirate station.', 'A Muse billboard opposite, with her name graffitied across it, visible from the club.', 'A drone nest in the water tank, very wet.'],
      price: 0.9, floor: ['shrine', 'deckchairs', 'radio'], more: { telescope: 2, merch_table: 1, kettle: 1.5 }, sec: 0, crowd: 0.5,
    },
    recordshop: {
      label: 'the back of a record shop',
      names: ['The Blackbird Bin', 'Back of the Racks', 'The Rare Room', 'B-Side Society', 'The Bootleg Library', 'The Listening Booth', 'The Crate Club', 'Under The Counter'],
      blurbs: [
        '{name}: behind the shop\'s racks, a room with every recording of her that exists, legal or not, and a listening booth for members.',
        '{name}: the club\'s archive is the shop\'s back room, and the shop\'s best customer is the club.',
        '{name}: shelves of bootlegs, a turntable, and a member who can tell you the date of any show by the hiss.',
      ],
      wall: ['A Muse Clearance raid notice, framed, with the raid\'s haul listed: "assorted bootlegs (returned)".', 'An Atlas compliance sticker on the till, upside down.', 'A drone hanging from the ceiling as a disco ball.'],
      price: 1, floor: ['bootleg_library', 'shrine', 'listening_booth'], more: { setlist_archive: 2, merch_table: 1.5, couch: 1 }, sec: 1, crowd: 0.5,
    },
    hall: {
      label: 'a community hall',
      names: ['The Blackbird Community Hall', 'Hall Seven', 'The Union of Fans', 'The People\'s Hall', 'The Big Room (Unofficial)', 'St. Blackbird\'s Hall', 'The Village Hall', 'The Assembly'],
      blurbs: [
        '{name}: a community hall with a stage, a tea urn and a fan club that has outgrown three smaller rooms.',
        '{name}: the members vote on everything, including what to name the cat, and the minutes are sung.',
        '{name}: a hall for weddings and wakes and, on every other night, for her.',
      ],
      wall: ['An Atlas community-safety noticeboard, entirely covered in her flyers.', 'A Muse offer to "sponsor the hall", returned with a drawing.', 'A drone in the rafters that nobody can reach.'],
      price: 0.9, floor: ['shrine', 'tribute_stage', 'notice_board', 'tea_urn'], more: { merch_table: 2, petition_desk: 2, photo_wall: 1.5, setlist_archive: 1 }, sec: 0, crowd: 0.7,
    },
    flat: {
      label: 'a member\'s flat',
      names: ['Number Nine', 'The Flat', 'Ground Floor Faithful', 'The Spare Room', 'Flat C', 'The President\'s Flat', 'The Living Room', 'Open House'],
      blurbs: [
        '{name}: a flat where the president lives, and so, in a sense, does the club: the living room is the shrine, the kitchen is the merch desk.',
        '{name}: posters on every wall, her songs on every speaker, and a cat called after her.',
        '{name}: the door is never locked, the kettle is never cold, and the president is never not on the phone to another member.',
      ],
      wall: ['An Atlas home-insurance letter, pinned up "for the laugh".', 'A Muse Clearance letter, framed in the toilet.', 'A drone on the windowsill, adopted, named Gerald.'],
      price: 0.6, floor: ['shrine', 'couch', 'kettle'], more: { merch_table: 1.5, photo_wall: 2, notice_board: 1 }, sec: 0, crowd: 0.4,
    },
  },
  shells: {
    laundromat: { label: 'a laundromat', line: 'A laundromat, mostly; the dryers are always on and nobody is drying anything.', sec: 0 },
    pub: { label: 'over a pub', line: 'Over a pub; the floor bounces when they jump.', sec: 0 },
    tenement: { label: 'a tenement block', line: 'In a tenement block, where everybody on the stair is a member, whether they joined or not.', sec: 0, weight: 1.3 },
    garage: { label: 'a lock-up', line: 'A lock-up garage with a roller door that only goes halfway.', sec: 0 },
    shopfront: { label: 'an empty shopfront', line: 'An empty shopfront with her face in the window and a hand-painted sign.', sec: 0 },
    chapel: { label: 'a chapel', line: 'A chapel the members borrowed for one meeting and never gave back.', sec: 0, add: ['candles'] },
    container: { label: 'a shipping container', line: 'A shipping container on a vacant lot, painted with her face on all four sides.', sec: 0 },
    basement: { label: 'a basement', line: 'A basement with a bar made of a door and a shrine made of everything else.', sec: 1 },
    tram: { label: 'a dead tram', line: 'A tram that broke down on a siding years ago. The members fixed the lights, not the engine.', sec: 0 },
    office: { label: 'an empty office floor', line: 'An empty office floor, leased by a member who works in property and says it is fine.', sec: 1 },
    market: { label: 'a market\'s upper floor', line: 'The floor over a night market, with the smell of the stalls coming up through the boards.', sec: 0 },
    boat: { label: 'a canal boat', line: 'A canal boat, moored, listing slightly to the side with the shrine on it.', sec: 0 },
  },
  features: {
    shrine: { label: 'a shrine', base: 0, line: 'A shrine to her: photos of every body she has had, candles, a setlist, and the stories of her deaths written up as close calls.' },
    membership_book: { label: 'a membership book', base: 0.5, line: 'A membership book, every page full, the oldest names in a hand that shook.' },
    notice_board: { label: 'a notice board', base: 0.8, line: 'A notice board: tour dates (hers, guessed), lifts to shows, a lost cat named after her.' },
    merch_table: { label: 'a merch table', base: 0.8, line: 'A merch table of T-shirts, mugs and badges she never authorised, and one she would wear.' },
    merch_press: { label: 'a T-shirt press', base: 0, line: 'A heat press for T-shirts, and a stack of shirts with her face on, slightly wrong.' },
    tribute_stage: { label: 'a tribute stage', base: 0.4, line: 'A small stage where the tribute band plays her songs, every night, better than she can right now.' },
    couch: { label: 'a couch', base: 0.8, line: 'A couch that has had every member on it, and is offered to her first.' },
    kettle: { label: 'a kettle', base: 0.6, line: 'A kettle and a box of teabags with her face on the box.' },
    photo_wall: { label: 'a photo wall', base: 0.5, line: 'A wall of photos of her, from every gig, every life, every angle (some unflattering).' },
    setlist_archive: { label: 'a setlist archive', base: 0.4, line: 'An archive of every setlist she has played, in folders, by year and body.' },
    bootleg_library: { label: 'a bootleg library', base: 0, line: 'A library of bootlegs of her: every show, legal or not, catalogued by a member who does not sleep.' },
    listening_booth: { label: 'a listening booth', base: 0, line: 'A listening booth with headphones and a chair, for members to hear her old shows.' },
    bar_counter: { label: 'a bar', base: 0.4, line: 'A bar that serves a cocktail named after her. It is blue and it is too strong.' },
    graffiti_wall: { label: 'a lyric wall', base: 0.4, line: 'A wall covered in her lyrics, in a dozen hands, some of them wrong.' },
    candles: { label: 'candles', base: 0.4, line: 'Candles, hundreds, in jars, some for her deaths and some for her comebacks.' },
    noodle_counter: { label: 'a noodle counter', base: 0, line: 'A noodle counter, and a dish called the Blackbird that is too spicy.' },
    tv: { label: 'a TV', base: 0, line: 'A TV that only plays her bootlegs, on a loop.' },
    deckchairs: { label: 'deckchairs', base: 0, line: 'Deckchairs facing the skyline, and a cool box of drinks.' },
    radio: { label: 'a pirate radio', base: 0.4, line: 'A radio tuned to a pirate station that plays her every hour on the hour.' },
    telescope: { label: 'a telescope', base: 0, line: 'A telescope pointed at the dragons, and a log of every one that hummed her song.' },
    tea_urn: { label: 'a tea urn', base: 0, line: 'A tea urn the size of a dustbin and a rota for filling it.' },
    petition_desk: { label: 'a petition desk', base: 0.3, line: 'A petition desk: FREE BLACKBIRD\'S MUSIC, signed by half the district.' },
    rehearsal_corner: { label: 'a rehearsal corner', base: 0.4, line: 'A corner with an amp and a drum kit, where members learn her songs.' },
    newsletter_press: { label: 'a newsletter press', base: 0.3, line: 'A press that prints the club newsletter, THE NEST, every week, mostly rumours.' },
    welcome_mat: { label: 'a welcome mat', base: 0.3, line: 'A welcome mat with her face on it. Nobody steps on the face.' },
  },
  traits: {
    devout: { label: 'devout', line: 'The members are devout. Some of them have her lyrics tattooed somewhere you would have to ask about.' },
    rival_club: { label: 'a rival club', line: 'There is a rival fan club across the district that thinks this one is too casual. They are not speaking.' },
    lumina_defectors: { label: 'LUMINA defectors', line: 'Half the members used to be in a LUMINA fan club, and still have the lanyards.' },
    tribute_band: { label: 'a tribute band', line: 'The club has a tribute band, The Blackbirds, who rehearse every night and are, honestly, quite good.', add: ['tribute_stage'] },
    counterfeit_merch: { label: 'counterfeit merch', line: 'The club sells merchandise she never approved, and makes a fortune for charity, mostly.', add: ['merch_table'], price: 1.2 },
    president_superfan: { label: 'a superfan president', line: 'The president has been to every show she has played in every body. They have a spreadsheet.' },
    newsletter: { label: 'a newsletter', line: 'A weekly newsletter, THE NEST, with rumours, reviews and a crossword about her.', add: ['newsletter_press'] },
    youth_wing: { label: 'a youth wing', line: 'The club has a youth wing of very serious young people who know more about her than she does.' },
    elders: { label: 'the elders', line: 'The oldest members remember a Blackbird from three bodies ago. They argue about which one was best.' },
    bootleggers: { label: 'bootleggers', line: 'Some of the members tape every show. Some of them sell the tapes. All of them deny it.', add: ['bootleg_library'] },
    candle_vigils: { label: 'candle vigils', line: 'Every time she dies, they hold a vigil. Every time she comes back, they hold a bigger one.', add: ['candles'] },
    muse_spies: { label: 'a Muse spy', line: 'One member reports to Muse Clearance. Everyone knows who. Nobody has the heart to throw them out.' },
    karaoke_nights: { label: 'karaoke nights', line: 'Karaoke nights, her songs only, and the scoring machine has been tuned to love her.' },
    fan_fiction: { label: 'fan fiction', line: 'A shelf of fan fiction about her. Most of it is about her and LUMINA. Some of it is about her and the dragon.' },
    cosplay: { label: 'cosplay', line: 'Members dress as her, from different bodies, and compare notes.' },
    charity_drive: { label: 'a charity drive', line: 'The club raises money for buskers whose guitars Muse took, in her name.' },
    rooftop_screenings: { label: 'screenings', line: 'They project her old shows onto the side of the building opposite every Friday.' },
    vegan_potluck: { label: 'a potluck', line: 'There is a potluck every meeting. The food is themed after her songs, with mixed results.' },
    union_backed: { label: 'union-backed', line: 'The club is backed by a union of buskers, who see her as a cause.' },
    shrine_keeper: { label: 'a shrine keeper', line: 'One member keeps the shrine, full-time, and will tell you the story of every candle.' },
    gang_members: { label: 'gang members', line: 'A few members are in a gang, and the gang has decided to tolerate the club, for now.' },
    police_members: { label: 'off-duty cops', line: 'Two off-duty cops are members. They are very sorry about the warrant.' },
    dragon_watchers: { label: 'dragon watchers', line: 'Some members log every dragon that hums her song, with dates and coordinates.', add: ['telescope'] },
    old_guitars: { label: 'a wall of her guitars', line: 'A wall of guitars that fans found and brought in, some of which, they swear, were hers.' },
    pilgrimage: { label: 'a pilgrimage route', line: 'The club runs a walking tour of every place she has died. It is surprisingly long.' },
  },
  situations: {
    members_night: { label: 'members\' night', line: 'It is members\' night: the room is full, the tribute band is on and somebody has made a cake shaped like her guitar.', weight: 3, tags: ['crowd', 'party'], fame: 1.3 },
    vigil: { label: 'a vigil', line: 'A candle vigil is on, for a death of hers the members are not sure she survived.', weight: 1.5, tags: ['vigil', 'crowd'] },
    raid: { label: 'a Muse raid', line: 'Muse drones are circling outside. Somebody has called the club "an unlicensed emotional gathering".', weight: 1.5, tags: ['raid', 'muse', 'danger'] },
    tribute_gig: { label: 'a tribute gig', line: 'The tribute band are playing a full set of her songs tonight, and it is sold out.', weight: 2, tags: ['tribute', 'crowd'] },
    election: { label: 'a club election', line: 'It is election night: two candidates for president, two manifestos, and a lot of feelings.', weight: 1, tags: ['election', 'crowd'] },
    quiet: { label: 'a quiet night', line: 'A quiet night: the president is doing the accounts and two members are asleep on the couch.', weight: 2, tags: ['quiet'] },
    fundraiser: { label: 'a fundraiser', line: 'A fundraiser for buskers whose guitars Muse took. There is a raffle, and the prize is a guitar.', weight: 1.5, tags: ['fundraiser', 'crowd'], purse: 1.4 },
    newcomers: { label: 'newcomers', line: 'A coach of newcomers from another district has come to see the shrine. They are very excited.', weight: 1.5, tags: ['newcomers', 'crowd'] },
    feud: { label: 'a feud', line: 'The rival fan club has come round to argue about which Blackbird was best. It is getting heated.', weight: 1, tags: ['feud'] },
    lookalike_contest: { label: 'a lookalike contest', line: 'A lookalike contest: twelve Blackbirds, from different bodies, and a judge with a clipboard.', weight: 1, tags: ['contest', 'crowd'] },
    listening_party: { label: 'a listening party', line: 'A listening party for a bootleg that surfaced this week: a show she does not remember playing.', weight: 1.2, tags: ['listening'] },
    planning: { label: 'a planning meeting', line: 'A planning meeting: maps, coloured pins and a plan for "the big one" that nobody will explain.', weight: 1, tags: ['planning'] },
  },
  wild: {
    first_fan: { label: 'her first fan', line: 'The president was her first fan, from her very first night, in her very first body. They have the ticket stub.', weight: 2 },
    she_died_here: { label: 'where she died', line: 'The club is in the place where a Blackbird died, once. There is a chalk outline they repaint every year, lovingly.', weight: 1.5 },
    better_tribute: { label: 'the better tribute', line: 'The tribute guitarist is, by any measure, better than she is right now. They are deeply embarrassed about it.', weight: 1.5 },
    lumina_member: { label: 'a LUMINA unit member', line: 'One of the members is a LUMINA unit that walked out of a shop and joined. It sits at the back and hums her songs.', weight: 1 },
    cult: { label: 'a cult', line: 'The club has become, by small steps, a cult. Nobody is hurt; everybody is very intense.', weight: 1 },
    time_capsule: { label: 'a time capsule', line: 'Under the floor is a time capsule a previous Blackbird left with the club, to be opened "by the next one".', weight: 1.2 },
    ghost_guitarist: { label: 'the ghost guitarist', line: 'The club\'s tribute guitarist is the session player who ghosted one of her records, here to atone.', weight: 1 },
    blackbird_museum: { label: 'a museum', line: 'The club has become a museum: entry fee, gift shop, a velvet rope round the couch she once sat on.', weight: 1 },
  },
  roster: fanclubRoster,
  extra: (rng) => ({ devotion: 40 + rng.int(0, 40), tribute: 0 }),
  tail: () => 'Members only (she is a member).',
};

export function fanclubRoster(loc: Location, info: VenueInfo): SlotDef[] {
  const crowd = [3, 5, 7, 9, 12][info.size] ?? 5;
  const slots: SlotDef[] = [
    { role: 'club_president', count: [1, 1], faction: 'venue', resident: true },
    { role: 'superfan', count: [1, 3], resident: true },
    { role: 'club_member', count: [Math.max(1, crowd - 3), crowd], ephemeral: true },
    { role: 'tribute_guitarist', count: [1, 1], chance: info.traits.includes('tribute_band') || info.features.includes('tribute_stage') ? 1 : 0.4, resident: true },
  ];
  if (info.traits.includes('muse_spies')) slots.push({ role: 'clearance_officer', count: [1, 1], chance: 0.6 });
  if (info.traits.includes('police_members')) slots.push({ role: 'cop', count: [1, 2], chance: 0.8 });
  if (info.traits.includes('gang_members')) slots.push({ role: 'ganger', count: [1, 2], chance: 0.8, faction: 'influence' });
  return slots;
}
