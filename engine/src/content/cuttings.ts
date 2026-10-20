import type { Location, VenueInfo } from '../types';
import type { SlotDef } from '../roster';
import type { VenueTables } from './venues';

/**
 * Cutting rooms: where musicians go to find out who is better, in public, in rounds. See cutting.ts for the system (the
 * duel engine in duel.ts, the house champion, wagers, the title, a gang that adopts her) and content/cuttingafford.ts for the
 * rows. What a cutting room *is* is here.
 */

export interface VariantRules {
  /** The duel's skill, mostly. */
  skill: string;
  /** The champion's style. */
  styles: string[];
  /** A move the room loves. */
  favour?: [string, number];
  /** The gang that runs it, if any (adopts a winner). */
  gang?: string;
}

/** What kind of contest each variant runs. */
export const RULES: Record<string, VariantRules> = {
  hall: { skill: 'guitar', styles: ['shredder', 'bluesman', 'heckler'] },
  choiryard: { skill: 'guitar', styles: ['choir', 'heckler'], favour: ['call_response', 8], gang: 'choir' },
  marrowfloor: { skill: 'djing', styles: ['raver', 'beatboxer'], favour: ['floor', 8], gang: 'marrow' },
  chapel: { skill: 'vocals', styles: ['hymnist', 'choir'], favour: ['hymn', 8], gang: 'sixers' },
  talent: { skill: 'vocals', styles: ['shredder', 'hymnist', 'machine'] },
  bluesroom: { skill: 'guitar', styles: ['bluesman'], favour: ['slow_burn', 6] },
  robotring: { skill: 'guitar', styles: ['machine'] },
  cypher: { skill: 'beatbox', styles: ['beatboxer', 'heckler'], favour: ['beat', 5] },
  underpass: { skill: 'guitar', styles: ['shredder', 'bluesman', 'heckler', 'choir'] },
};

export const CUTTING: VenueTables = {
  kind: 'cutting',
  label: 'a cutting room',
  chance: { market: 0.03, nightlife: 0.06, tenement: 0.05, industrial: 0.05, corporate: 0.02, slum: 0.05 },
  lean: {
    market: { hall: 3, choiryard: 0.8, marrowfloor: 1, chapel: 1, talent: 2, bluesroom: 1.5, robotring: 1, cypher: 1.5, underpass: 2 },
    nightlife: { hall: 4, choiryard: 0.6, marrowfloor: 4, chapel: 0.6, talent: 2, bluesroom: 2, robotring: 1.5, cypher: 2, underpass: 1 },
    tenement: { hall: 2, choiryard: 1.5, marrowfloor: 1, chapel: 3, talent: 0.6, bluesroom: 2.5, robotring: 0.6, cypher: 3, underpass: 2.5 },
    industrial: { hall: 2, choiryard: 5, marrowfloor: 1, chapel: 0.8, talent: 0.4, bluesroom: 1, robotring: 2, cypher: 1.5, underpass: 2 },
    corporate: { hall: 1, choiryard: 0.1, marrowfloor: 0.6, chapel: 0.4, talent: 6, bluesroom: 0.6, robotring: 3, cypher: 0.3, underpass: 0.3 },
    slum: { hall: 1.5, choiryard: 3, marrowfloor: 1.5, chapel: 3, talent: 0.2, bluesroom: 1.5, robotring: 0.5, cypher: 3, underpass: 4 },
  },
  hours: [18, 5],
  prestige: 1.2,
  variants: {
    hall: {
      label: 'a battle-of-the-bands hall',
      names: ['The Cutting Room', 'Last Band Standing', 'The Battle Hall', 'Head to Head', 'Duel Club', 'Fight Night Music', 'The Shootout', 'Strings & Stakes', 'The Showdown Room', 'Loudest Wins', 'Bandstand Brawl', 'Second Place Is Silence'],
      blurbs: [
        '{name}: two stages facing each other across a sticky floor, and a crowd in the middle that has come to pick a winner.',
        '{name}: a chalkboard of tonight\'s bouts, a bell from a boxing ring, and a judge with ear defenders around his neck.',
        '{name}: the walls are lined with the names of everyone who has won here, and the ceiling with the names of everyone who hasn\'t.',
      ],
      wall: ['An Atlas "Responsible Volume" poster with a decibel scale. The scale stops before the house record.', 'A Muse Clearance letter framed by the bar: "Unlicensed competition is so brave 🥰".', 'A drone dock by the door with a sock over the camera.'],
      price: 1, floor: ['twin_stages', 'chalkboard', 'bell', 'bar_counter'], more: { names_wall: 2, sound_desk: 2, mosh_pit: 2, merch_table: 1.5 }, sec: 2, crowd: 0.9,
    },
    choiryard: {
      label: 'a Rust Choir scrapyard',
      names: ['The Rust Choir Yard', 'Anvil Chorus Yard', 'The Clang Pit', 'Call & Wreck', 'Choir of Iron', 'The Scrap Cathedral', 'Weld & Wail', 'The Ringing Yard', 'Hammer Hymns', 'The Rust Pit', 'Chorus of Cranes', 'The Echo Yard'],
      blurbs: [
        '{name}: a scrapyard where the Rust Choir meets, all welded instruments and call-and-response. Win at the gate and you\'re in.',
        '{name}: towers of crushed cars, a stage made of a bus roof and forty people hitting metal in time. A caller at the gate sings a line, and waits.',
        '{name}: the noise is the point. So is the answer. Nobody gets in who can\'t give one.',
      ],
      wall: ['An Atlas salvage-licence notice welded to the gate, upside down, as a cymbal.', 'A Muse drone, crushed into a cube, hung on a chain as a gong.', 'An Atlas trooper\'s helmet used as a hi-hat.'],
      price: 0.6, floor: ['gate_caller', 'scrap_drums', 'bus_stage'], more: { welded_wall: 3, bonfire: 2, crane: 1.5, mosh_pit: 1.5 }, sec: 3, crowd: 0.8,
    },
    marrowfloor: {
      label: 'a Neon Marrow floor-off',
      names: ['Bone Floor', 'The Marrow Pit', 'Glow Off', 'UV Battle Room', 'The Floor Is Ours', 'Dancefloor Duel', 'Neon Knockout', 'The Glowbone Club', 'Floor Filler Finals', 'The Last Dancer', 'Black Light Battle', 'Spine Floor'],
      blurbs: [
        '{name}: a Neon Marrow rave where DJs battle for the floor. Whoever keeps it moving keeps the decks.',
        '{name}: a black-lit warehouse, two decks back to back and a floor of glowing bones that decides everything.',
        '{name}: the rule is simple: the floor never stops. If it stops on your track, you\'re done.',
      ],
      wall: ['An Atlas noise-complaint form pinned to the decks, used as a beat sheet.', 'A Muse "Approved Beats Only" sticker glowing under the UV, covered in Neon Marrow tags.', 'A drone hovering over the floor with a glowstick taped to it.'],
      price: 1.1, floor: ['twin_decks', 'glow_floor', 'bar_counter'], more: { sound_desk: 2, chill_room: 2, merch_table: 1, stim_dealer: 2 }, sec: 2, crowd: 1,
    },
    chapel: {
      label: 'a Saint Sixers hymn-off chapel',
      names: ['St. Sixer\'s Hymn Hall', 'The Chapel of the Higher Note', 'Our Lady of the Sung Ledger', 'The Hymn-Off', 'Saint Cantor\'s', 'Chapel of the Long Amen', 'The Choir Box', 'Holy Pitch', 'The Sermon Stage', 'Saint Vibrato\'s', 'The Singing Ledger', 'Sixers\' Psalm Room'],
      blurbs: [
        '{name}: a Saint Sixers chapel where hymns are sung against each other for the collection plate. The congregation votes by humming.',
        '{name}: pews, a pulpit with a microphone, and a hymn board listing tonight\'s duels and the odds.',
        '{name}: the Sixers keep the books here between services. The services are competitions.',
      ],
      wall: ['An Atlas "Faith in Safety" banner under the hymn board.', 'A Muse Clearance notice about "unlicensed devotional content", in the collection plate.', 'A drone nest in the bell tower; the bells are louder.'],
      price: 0.8, floor: ['pulpit', 'pews', 'hymn_board', 'collection_plate'], more: { organ: 2, confessional: 1.5, bell: 1 }, sec: 2, crowd: 0.7,
    },
    talent: {
      label: 'a corporate talent night',
      names: ['Neo\'s Next Star (Heat {n})', 'Talent Tonight', 'The Muse Discovery Hour', 'Bright Futures Talent Show', 'Rising Star Live', 'The Big Break', 'Brand New Voices', 'StarSearch Studio {n}', 'Atlas Presents: Talent!', 'The Golden Buzzer', 'Next Big Thing (Live)', 'Fame Factory Heats'],
      blurbs: [
        '{name}: a televised talent heat with three judges, a buzzer and an audience paid to clap. Muse is watching for new signings.',
        '{name}: glitter, a live camera, a host with a laminated smile, and contestants who signed the release on the way in.',
        '{name}: the prize is a contract. The contract is a prize, technically.',
      ],
      wall: ['A banner: ATLAS PRESENTS. Under it, smaller: Brought To You By Muse 🥰.', 'A golden buzzer in a glass case, with an Atlas logo on the button.', 'An Atlas safety reel plays on the big screen between acts, set to LUMINA.'],
      price: 1.5, floor: ['judges_desk', 'tv_camera', 'golden_buzzer', 'twin_stages'], more: { green_room: 3, merch_table: 1, sound_desk: 2 }, sec: 4, crowd: 1,
    },
    bluesroom: {
      label: 'an old-timers\' blues back room',
      names: ['The Back Room', 'Twelve Bars', 'Old Hands Blues Club', 'The Slow Burn', 'Crossroads Cellar', 'The Bent Note', 'Bottleneck Room', 'The Last Chorus', 'Mojo Cellar', 'Grey Hairs & Hot Licks', 'The Turnaround', 'Low Down Room'],
      blurbs: [
        '{name}: a back room behind a bar where old men with old guitars cut each other, slowly, for drinks.',
        '{name}: one stool, one amp, one bulb, and a queue of grey-haired players with something to prove.',
        '{name}: nobody here is in a hurry. That is how they win.',
      ],
      wall: ['An Atlas wellness poster that somebody has drawn a guitar on.', 'A drone parts box used as an ashtray.', 'A Muse Clearance letter, framed, with "come and get it" written underneath.'],
      price: 0.7, floor: ['stool_amp', 'bar_counter', 'names_wall'], more: { jukebox: 2, card_table: 2, back_door: 1.5 }, sec: 1, crowd: 0.5,
    },
    robotring: {
      label: 'a robot battle ring',
      names: ['Man vs Machine', 'The Silicon Stage', 'Beat The Bot', 'Unit Showdown', 'The Robot Ring', 'Can You Beat It?', 'Algorithm Alley', 'The Turing Test (Loud)', 'Chrome Champion', 'Human Error', 'The Last Human Guitarist', 'Override Arena'],
      blurbs: [
        '{name}: a cage with a robot guitarist in it, running a stolen LUMINA build, and a board of every human it has beaten.',
        '{name}: put a coin in, and the house robot plays you. It has never lost. The board says so, in a font it chose.',
        '{name}: the robot plays every note perfectly. The question is whether a perfect note is the right one.',
      ],
      wall: ['An Atlas Approved Device sticker on the robot\'s chest, scratched to read "Atlas Approved Devil".', 'A Muse cease-and-desist about the robot\'s "unlicensed LUMINA firmware", stuck to its back.', 'A drone controller, wired to the robot, with a label: DO NOT.'],
      price: 1.2, floor: ['robot_cage', 'coin_slot', 'scoreboard'], more: { sound_desk: 2, bar_counter: 2, workbench: 1.5 }, sec: 3, crowd: 0.8,
    },
    cypher: {
      label: 'a basement cypher',
      names: ['The Cypher', 'Circle Basement', 'Spit Pit', 'Ring of Mouths', 'The Bars Room', 'Low Ceiling Cypher', 'The Round', 'Open Circle', 'Breath Control', 'The Mouth Pit', 'Beat Basement', 'Round Robin'],
      blurbs: [
        '{name}: a circle of people in a basement, one microphone going round, and nobody allowed to stop.',
        '{name}: a beat from a phone, a circle, and a rule: if you\'re in the circle, you\'re in the battle.',
        '{name}: it smells of damp and confidence. The circle is tight and so are the bars.',
      ],
      wall: ['An Atlas curfew notice, rapped over so often it has become a hook.', 'A Muse Clearance letter, folded into a paper microphone.', 'A drone circling the basement light, stuck.'],
      price: 0.5, floor: ['circle', 'phone_beat'], more: { names_wall: 1.5, back_door: 2, card_table: 1, stim_dealer: 1 }, sec: 1, crowd: 0.8,
    },
    underpass: {
      label: 'a busker\'s underpass',
      names: ['The Underpass Battle', 'Echo Tunnel', 'Pitch Wars', 'The Busk-Off', 'Hat Wars Underpass', 'The Concrete Stage', 'Tunnel Vision', 'Two Hats One Tunnel', 'The Pitch', 'Subway Showdown', 'Echo Alley', 'The Long Echo'],
      blurbs: [
        '{name}: an underpass with two buskers at either end, a hat each, and a crowd walking through deciding which hat to fill.',
        '{name}: the best echo in the district and the fiercest pitch war. Whoever has the bigger hat at midnight has the tunnel.',
        '{name}: concrete, strip lights and the sound of six guitars trying to be louder than each other.',
      ],
      wall: ['An Atlas "No Busking (For Your Safety)" sign, with a hat hung on it.', 'A Muse noise-abatement drone parked in the roof, out of battery, glaring.', 'A faded Atlas mural of a happy commuter, with a guitar drawn into his hands.'],
      price: 0.3, floor: ['two_hats', 'echo'], more: { mosh_pit: 1, stim_dealer: 1, back_door: 2 }, sec: 0, crowd: 0.9,
    },
  },
  shells: {
    warehouse: { label: 'a warehouse', line: 'A warehouse with the roller door half up, so the sound spills into the street on purpose.', sec: 0 },
    boxing: { label: 'an old boxing hall', line: 'An old boxing hall. The ring is still there, with a drum kit in it.', sec: 1, add: ['bell'] },
    church: { label: 'a deconsecrated church', line: 'A church nobody prays in any more, except before the final.', sec: 0, add: ['pews'] },
    cinema: { label: 'a shuttered cinema', line: 'A shuttered cinema with the seats ripped out. The screen shows the scores.', sec: 1, add: ['scoreboard'] },
    carpark: { label: 'a car park', line: 'The bottom level of a car park, where the echo is enormous and the ceiling is low.', sec: 0, add: ['echo'] },
    scrapyard: { label: 'a scrapyard', line: 'A scrapyard, with the stacks of crushed cars as walls and the crane as a lighting rig.', sec: 1, add: ['crane'] },
    basement: { label: 'a flooded basement', line: 'A basement with an inch of water on the floor, which nobody mentions and everybody dances in.', sec: 0, weight: 1.2 },
    rooftop: { label: 'a rooftop', line: 'A rooftop with the city lit up below and the neighbours\' complaints lit up on their phones.', sec: 0, add: ['skyline'] },
    tramdepot: { label: 'a tram depot', line: 'A tram depot. Two trams face each other as stages, headlights on.', sec: 1, add: ['twin_stages'] },
    pool: { label: 'drained swimming baths', line: 'A drained swimming pool: the crowd in the deep end, the players on the diving boards.', sec: 0, add: ['diving_boards'] },
    market: { label: 'a night market\'s back alley', line: 'The alley behind a night market, between the noodle stalls and the generators.', sec: 0, add: ['noodle_cart'] },
    bunker: { label: 'an old Atlas bunker', line: 'An old Atlas bunker, decommissioned, still with the blast door and a sign saying SHELTER CAPACITY: 40. Tonight: 300.', sec: 2, weight: 0.8 },
  },
  features: {
    twin_stages: { label: 'two stages', base: 1, line: 'Two stages facing each other, one for each side of the argument.' },
    chalkboard: { label: 'a chalkboard of bouts', base: 1, line: 'A chalkboard of tonight\'s bouts, the odds, and a name rubbed out halfway down.' },
    bell: { label: 'a ring bell', base: 0.6, line: 'A bell from a boxing ring, for the rounds.' },
    bar_counter: { label: 'a bar', base: 1.5, line: 'A bar with three drinks on the menu and one of them is the house.' },
    names_wall: { label: 'a wall of champions', base: 0.8, line: 'A wall of champions\' names, painted over each other, layer on layer.' },
    sound_desk: { label: 'a sound desk', base: 1, line: 'A sound desk with a man at it who decides who is loud.' },
    mosh_pit: { label: 'a mosh pit', base: 0.8, line: 'A patch of floor that has been a mosh pit for so long it is worn into a bowl.' },
    merch_table: { label: 'a merch table', base: 0.6, line: 'A merch table: T-shirts of bands that lost, at a discount.' },
    gate_caller: { label: 'a caller at the gate', base: 0, line: 'A Rust Choir caller at the gate, singing a line and waiting for the answer.' },
    scrap_drums: { label: 'scrap drums', base: 0, line: 'A rack of drums made of oil barrels and car doors, played with spanners.' },
    bus_stage: { label: 'a bus-roof stage', base: 0, line: 'A stage made from the roof of a bus, with the destination board stuck on VICTORY.' },
    welded_wall: { label: 'a welded wall', base: 0.3, line: 'A wall of instruments welded together into one enormous, unplayable thing that everybody plays.' },
    bonfire: { label: 'a bonfire', base: 0.4, line: 'A bonfire in an oil drum, with people warming their hands and their voices.' },
    crane: { label: 'a crane', base: 0.2, line: 'A crane with lights hung off the jib, swinging over the crowd.' },
    twin_decks: { label: 'twin decks', base: 0, line: 'Two sets of decks, back to back, and a line between them painted on the floor.' },
    glow_floor: { label: 'a glowing floor', base: 0, line: 'A floor of glowing panels that light up where people dance, and darken where they don\'t.' },
    chill_room: { label: 'a chill-out room', base: 0.5, line: 'A chill-out room with beanbags, water and someone explaining the universe.' },
    stim_dealer: { label: 'a stim dealer', base: 0.5, line: 'A dealer in a corner with a tray of glowing pills and a price for each colour.' },
    pulpit: { label: 'a pulpit', base: 0, line: 'A pulpit with a microphone where the sermon used to be.' },
    pews: { label: 'pews', base: 0.3, line: 'Rows of pews, full of people humming judgement.' },
    hymn_board: { label: 'a hymn board', base: 0, line: 'A hymn board with tonight\'s duels on it, and the odds in Roman numerals.' },
    collection_plate: { label: 'a collection plate', base: 0, line: 'A collection plate going round, heavy with bets.' },
    organ: { label: 'an organ', base: 0.3, line: 'An organ with three working pipes and a lot of opinions.' },
    confessional: { label: 'a confessional', base: 0.3, line: 'A confessional where the Sixers take bets and, sometimes, confessions.' },
    judges_desk: { label: 'a judges\' desk', base: 0, line: 'A desk of three judges: a Muse scout, a retired star and a man from Atlas who only votes for jingles.' },
    tv_camera: { label: 'a TV camera', base: 0, line: 'A live TV camera on a dolly, its red light on.' },
    golden_buzzer: { label: 'a golden buzzer', base: 0, line: 'A golden buzzer, for the act that goes straight through. The button has an Atlas logo on it.' },
    green_room: { label: 'a green room', base: 0.4, line: 'A green room of nervous contestants and a bowl of complimentary pastel sweets.' },
    stool_amp: { label: 'a stool and an amp', base: 0, line: 'One stool, one amp, one bulb. That is the stage.' },
    jukebox: { label: 'a jukebox', base: 0.6, line: 'A jukebox full of the people who won here, and one song by somebody who never did.' },
    card_table: { label: 'a card table', base: 0.6, line: 'A card table where the losers play for the money they lost.' },
    back_door: { label: 'a back door', base: 0.8, line: 'A back door for the losers and the police.' },
    robot_cage: { label: 'a robot cage', base: 0, line: 'A cage with a robot guitarist in it, polished and patient.' },
    coin_slot: { label: 'a coin slot', base: 0, line: 'A coin slot on the cage: INSERT CHALLENGE.' },
    scoreboard: { label: 'a scoreboard', base: 0.5, line: 'A scoreboard with the house record on it, and it is not close.' },
    workbench: { label: 'a workbench', base: 0.3, line: 'A workbench with the robot\'s spare arm on it.' },
    circle: { label: 'a circle', base: 0, line: 'A circle of people in a basement, shoulder to shoulder, one microphone going round.' },
    phone_beat: { label: 'a phone on a speaker', base: 0, line: 'A phone in a pint glass, playing the beat, for the acoustics.' },
    two_hats: { label: 'two hats', base: 0, line: 'Two hats on the ground at either end of the tunnel, one fuller than the other.' },
    echo: { label: 'an echo', base: 0.3, line: 'The best echo in the district. Every note comes back twice as confident.' },
    skyline: { label: 'a skyline', base: 0, line: 'The city spread out below, and every lit window a possible complaint.' },
    diving_boards: { label: 'diving boards', base: 0, line: 'Two diving boards over the deep end, each with a player on it.' },
    noodle_cart: { label: 'a noodle cart', base: 0.3, line: 'A noodle cart doing very good business between rounds.' },
  },
  traits: {
    gang_run: { label: 'run by a gang', line: 'A gang runs the room. The purses are bigger and the losers leave by the back.', price: 1.2, sec: 1 },
    muse_scouted: { label: 'Muse scouts it', line: 'A Muse A&R scout sits at the bar every night with a pen already uncapped.' },
    no_mercy: { label: 'no mercy rule', line: 'House rule: no draws, no mercy, no second chances. The loser carries the winner\'s amp to the car.' },
    house_band: { label: 'a house band', line: 'A house band plays behind everyone, and plays slightly better behind people they like.' },
    loud_ordinance: { label: 'a noise ordinance', line: 'There is a noise ordinance on the street. The room ignores it, and the police enforce it, now and then.' },
    betting_book: { label: 'a betting book', line: 'Somebody runs a book on every bout, from a ledger tucked into a hymn book.', add: ['card_table'] },
    legendary_champ: { label: 'a legendary champion', line: 'The house champion has not lost in two years and has a mural to prove it.' },
    tv_coverage: { label: 'local TV', line: 'A local channel films the final every week, badly, from a bad angle.', sec: 1 },
    stage_diving: { label: 'stage diving allowed', line: 'Stage diving is allowed, encouraged, and medically under-supported.', add: ['mosh_pit'] },
    open_challenge: { label: 'open challenge', line: 'Anyone can challenge anyone, any time, by ringing the bell.', add: ['bell'] },
    strict_judge: { label: 'a strict judge', line: 'The judge scores everything to one decimal place and has never smiled.', price: 1.1 },
    deaf_judge: { label: 'a deaf judge', line: 'The judge is deaf and judges by the crowd\'s faces, which is honestly fairer.' },
    wager_guitars: { label: 'guitars on the line', line: 'Guitars are wagered here. The losers\' are hung on the wall behind the bar.', add: ['names_wall'] },
    cheap_drinks: { label: 'cheap drinks', line: 'The drinks are so cheap the bar loses money, on purpose, to keep the crowd loud.', price: 0.9 },
    pastel_sponsor: { label: 'Muse-sponsored', line: 'Muse sponsors the room. Every stage has a heart on it, and every winner is sent a contract.', price: 1.2, sec: 1 },
    old_rivalry: { label: 'an old rivalry', line: 'Two regulars have been cutting each other every Friday for twenty years. Neither will say who is ahead.' },
    heckler_row: { label: 'a heckler row', line: 'There is a row of professional hecklers at the front. They are paid in drinks, and they earn them.' },
    choir_chant: { label: 'a crowd that chants', line: 'The crowd chants. Whoever gets them chanting wins.' },
    blackout_rounds: { label: 'blackout rounds', line: 'The final round is played in the dark, so nobody can see your hands.' },
    women_only: { label: 'women\'s night', line: 'Tonight and most nights, women only on the stages. The men can heckle from the bar.' },
    youth_scene: { label: 'a young scene', line: 'The scene is young, loud and very sure of itself.' },
    old_scene: { label: 'an old scene', line: 'The scene is old, slow and very, very good.' },
    neon_paint: { label: 'UV paint', line: 'Everything is painted in UV, including several of the staff.' },
    sweat_drip: { label: 'condensation', line: 'It is so hot the ceiling drips. Every amp has a towel.' },
    hall_of_shame: { label: 'a hall of shame', line: 'A hall of shame: photographs of everyone who was booed off, with the date.' },
    lucky_pick: { label: 'a lucky pick', line: 'There is a lucky plectrum behind the bar, lent to challengers for a fee.' },
    cops_drink_here: { label: 'cops drink here', line: 'Off-duty cops drink here and pretend not to notice the gambling.' },
    rival_venue: { label: 'a rival room', line: 'There is a rival room two streets over. Winners here are sent there to lose.' },
    free_entry: { label: 'free entry', line: 'Free entry. The purses come from the bar, and the bar is busy.', price: 0.5 },
    cursed_stage: { label: 'a cursed stage', line: 'One of the stages is cursed. Nobody who plays it first has won since the flood.' },
  },
  situations: {
    tournament: { label: 'a tournament night', line: 'It is tournament night: sixteen players, a bracket on the chalkboard and a purse that could buy a car.', weight: 3, tags: ['tournament', 'crowd'], purse: 2, fame: 1.4 },
    grudge_match: { label: 'a grudge match', line: 'Two regulars have a grudge match booked. The room has taken sides and the sides have taken drinks.', weight: 2, tags: ['grudge', 'crowd'], fame: 1.2 },
    muse_scout_in: { label: 'a Muse scout in', line: 'A Muse scout is in, taking notes, and everyone is playing slightly more pastel than usual.', weight: 1.5, tags: ['scout', 'muse'], fame: 1.5 },
    blackout: { label: 'a power cut', line: 'The power is out. The battles go on acoustically, by phone torch, and are better for it.', weight: 1.5, tags: ['dark', 'power_cut'] },
    raid: { label: 'a raid', line: 'Word is the police are raiding tonight for the gambling. Everyone is pretending to be at a hymn practice.', weight: 1.2, tags: ['raid', 'gossip'] },
    champ_away: { label: 'the champion is away', line: 'The champion is away. The title is up for grabs, and the room is full of people who think it should be theirs.', weight: 1.5, tags: ['open_title'] },
    rookie_night: { label: 'rookie night', line: 'Rookie night: nobody with a name is allowed to play, and everybody with a name is in the crowd.', weight: 1.2, tags: ['rookie', 'crowd'] },
    gang_war: { label: 'gangs in the crowd', line: 'Two gangs are in the crowd, each backing a player. Whoever wins, somebody is going to lose more than a duel.', weight: 1.2, tags: ['gangs', 'crowd'] },
    filming: { label: 'a film crew', line: 'A film crew is shooting a documentary about the scene. Everyone is playing to the camera.', weight: 1, tags: ['filming'], fame: 1.6 },
    flood: { label: 'flooded', line: 'There is an inch of water on the floor. The amps are on chairs. Nobody has been electrocuted yet.', weight: 0.8, tags: ['flood'] },
    birthday: { label: 'the owner\'s birthday', line: 'It is the owner\'s birthday. There is cake, there is a free bar, and there is a birthday duel the owner must not lose.', weight: 1, tags: ['party', 'crowd'] },
    heatwave: { label: 'a heatwave', line: 'A heatwave: it is forty degrees inside and every guitar is going out of tune.', weight: 1, tags: ['heat'] },
    choir_festival: { label: 'a choir festival', line: 'The Rust Choir are holding a festival: every gang choir in the district, one after another, all night.', weight: 2, tags: ['festival', 'crowd'], only: ['choiryard'], fame: 1.3 },
    talent_final: { label: 'the talent final', line: 'It is the live final. The winner gets a Muse contract and a handshake from a man from Atlas on TV.', weight: 2.5, tags: ['final', 'crowd', 'muse'], only: ['talent'], purse: 2.5, fame: 2 },
    robot_update: { label: 'the robot is updating', line: 'The house robot is installing an update. It says so, every thirty seconds, mid-solo.', weight: 1.5, tags: ['updating'], only: ['robotring'] },
    open_mic: { label: 'open challenge night', line: 'Open challenge night: anyone can ring the bell on anyone.', weight: 1.5, tags: ['open', 'crowd'] },
  },
  wild: {
    devil: { label: 'the stranger at the crossroads', line: 'There is a stranger at the bar who offers to play anyone for their hands. Nobody knows what happens if you lose, because nobody will say.', weight: 1.5 },
    her_rival: { label: 'her old rival', line: 'The house champion is somebody a previous Blackbird beat, years ago. They have been practising ever since.', weight: 1.5 },
    tribute_champ: { label: 'her tribute act', line: 'The house champion is a Blackbird tribute act, and plays her old songs better than she can right now.', weight: 1.5 },
    cursed: { label: 'a cursed room', line: 'The room is cursed. Every round lost costs a little blood, and the winners say it is worth it.', weight: 1 },
    golden_pick: { label: 'the golden plectrum', line: 'The prize tonight is a golden plectrum that, legend says, has never played a wrong note.', weight: 1.2 },
    silent_duel: { label: 'the silent duel', line: 'Duels here are played with the amps off. The crowd watches the hands, and decides.', weight: 1 },
    lumina_judge: { label: 'LUMINA judges', line: 'A LUMINA unit sits on the judges\' panel, smiling at everyone the same amount.', weight: 1 },
    battle_royale: { label: 'a battle royale', line: 'Tonight is a battle royale: eight players on one stage, and the last one playing wins everything.', weight: 1.2 },
  },
  roster: cuttingRoster,
  extra: (rng, info) => {
    const rules = RULES[info.variant]!;
    return {
      // The house champion: how good, how they play.
      champ: Math.round(10 + 9 * info.tier + rng.int(-4, 10) + (info.traits.includes('legendary_champ') ? 12 : 0) + (info.variant === 'robotring' ? 8 : 0)),
      style: rng.pick(rules.styles),
      fee: Math.round((5 + 4 * info.tier) * (rng.int(8, 12) / 10)),
    };
  },
  tail: (info) => `Entry ${cuttingFee(info)}nd. House champion: ${info.keep?.holder === 'her' ? 'Blackbird' : `grade ${info.keep?.champ ?? '?'}`}.`,
};

/** What it costs to get on a stage here. */
export function cuttingFee(info: VenueInfo): number {
  const v = CUTTING.variants[info.variant];
  if (info.traits.includes('free_entry')) return 0;
  return Math.max(0, Math.round(Number(info.keep?.fee ?? 10) * (v?.price ?? 1) * info.traits.reduce((m, t) => m * (CUTTING.traits[t]?.price ?? 1), 1)));
}

export function cuttingRoster(loc: Location, info: VenueInfo): SlotDef[] {
  const crowd = [3, 4, 6, 8, 10][info.size] ?? 4;
  const rules = RULES[info.variant];
  const slots: SlotDef[] = [
    { role: 'cutting_host', count: [1, 1], chance: 0.92, faction: 'venue', resident: true },
    { role: info.variant === 'robotring' ? 'cutting_robot' : 'cutting_champ', count: [1, 1], chance: 0.9, resident: true },
    { role: 'cutting_judge', count: [1, 1], chance: 0.6, faction: 'venue', resident: true },
    { role: 'cutting_challenger', count: [1, 3], resident: true },
    { role: 'cutting_fan', count: [Math.max(1, crowd - 3), crowd], ephemeral: true },
    { role: 'cutting_bouncer', count: [1, 1], chance: Math.min(0.9, 0.1 + loc.security * 0.1), faction: 'venue', resident: true },
  ];
  if (rules?.gang) slots.push({ role: 'ganger', count: [2, 4], chance: 0.9, faction: 'influence' });
  else if (info.traits.includes('gang_run')) slots.push({ role: 'ganger', count: [1, 3], chance: 0.8, faction: 'influence' });
  if (info.traits.includes('muse_scouted') || info.variant === 'talent' || info.traits.includes('pastel_sponsor')) slots.push({ role: 'muse_scout', count: [1, 1], chance: 0.7, resident: true });
  if (info.traits.includes('cops_drink_here')) slots.push({ role: 'cop', count: [1, 2], chance: 0.8 });
  else slots.push({ role: 'cop', count: [1, 1], chance: 0.05 });
  if (info.wild === 'devil') slots.push({ role: 'crossroads_stranger', count: [1, 1], resident: true });
  return slots;
}
