import { type Affordance } from '../affordances';
import { R, banned, find, rowFor, type VenueView } from '../venuekit';
import { skillLevel } from '../skills';
import { hasInstrument } from '../instruments';
import type { World } from '../types';

/**
 * The first half of a studio's rows: the rooms and the gear (what a musician does here besides record), the crowd on the couch,
 * gossip, the hustle, and crime. Things that depend on today's situation, the wild cards and the variants are in
 * studioevents.ts. Recording itself (the thing she comes for) is not a row: see studio.ts.
 *
 * Tokens: {venue} {npc} {owner} {pay} {amount} {item} {tip} {lost}; pronouns for {npc} use {they}/{their}.
 */

export const row = rowFor('studio');
export const open = (w: World, v: VenueView): boolean => !banned(w, v.main);
const axe = (w: World, v: VenueView): boolean => hasInstrument(w.hero) || v.features.includes('guitar_rack');

// ===================================================================== the gear and the rooms

const GEAR: Affordance<VenueView>[] = [
  row({
    id: 'live-jam', where: { feature: 'live_room' }, pace: 'session',
    needs: ['skill:guitar', 'skill:music', 'drive:pride'],
    sees: 'A live room with a drum kit, a rug and a session player tuning up for nobody in particular.', stakes: 'An hour of playing with professionals: guitar XP, a little fame on the studio grapevine, or a polite silence.', consequence: 'The session players decide whether she is any good.',
    drives: { pride: 0.6, curiosity: 0.4 }, bonus: 0.15, ok: (w, v) => open(w, v) && axe(w, v),
    intent: ['Blackbird wanders into the live room at {venue} and picks up a guitar.', 'Blackbird plugs in at {venue} and nods at the drummer.'],
    check: { who: 'tag:session', parts: ['guitar', ['music', 0.6], ['stat:reflex', 0.3]], base: 0.3, per: 0.065,
      win: R(['Blackbird jams with {npc} in the live room at {venue} for an hour. By the end the engineer has quietly pressed record. "Keep that," {they} say{s}.', 'An hour in the live room at {venue}. {npc} plays the changes, Blackbird plays over them, and somewhere in the third chorus it stops being practice.'], { train: [['guitar', 4], ['music', 2]], fame: 0.6, affinity: 4, xp: 4, thought: ['They were good. I was better. Mostly.', 'Session players. They know. They know.'] }),
      lose: R(['Blackbird jams with {npc} at {venue}. {npc} is very kind about it, which is worse than if {they} weren\'t.', 'The jam at {venue} falls apart in the bridge. {npc} looks at the ceiling until it is over.'], { train: [['guitar', 2]], affinity: -1, thought: ['That was experimental.', 'The drummer was rushing. Somebody was.'] }) },
  }),
  row({
    id: 'mix-desk', where: { feature: 'mixing_desk' }, pace: 'session',
    needs: ['skill:djing', 'skill:tinkering', 'stat:int'],
    sees: 'A desk with a hundred faders, a mix that is nearly right, and an engineer who has gone for a smoke.', stakes: 'An hour on somebody else\'s mix: a fee from the producer, or a mix nobody can save.', consequence: 'The producer remembers who rescued the bridge.',
    drives: { curiosity: 0.5, pride: 0.4, greed: 0.2 }, bonus: 0.1,
    check: { who: 'owner', parts: ['djing', ['tinkering', 0.6], ['stat:int', 0.4]], base: 0.3, per: 0.07,
      win: R(['Blackbird sits at the desk at {venue}, pulls the vocals forward a hair, finds the snare that was hiding and hands the mix back. {npc} listens twice and pays her {amount}nd.', 'The mix on the desk at {venue} was a mess. Blackbird untangles it in an hour. {npc} says nothing, which at {venue} is a rave review, and pays {amount}nd.'], { cash: [20, 80], from: 'owner', purse: true, train: [['djing', 3], ['tinkering', 2]], affinity: 4, xp: 3, thought: ['Ears like a bat. A bat with taste.', 'It was always in there. I just found it.'] }),
      lose: R(['Blackbird pushes the wrong fader at {venue} and the whole mix tips into the red. {npc} comes back from the smoke break and stops in the doorway.', 'An hour at the desk at {venue} and the mix is louder, worse and somehow sadder.'], { train: [['djing', 1]], affinity: -4, thought: ['It needed to get worse before it got better. It got worse.'] }) },
  }),
  row({
    id: 'tape-splice', where: { feature: 'tape_machine' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:sleight', 'stat:reflex'],
    sees: 'A reel-to-reel, a razor blade, a splicing block and a take with one bad bar in it.', stakes: 'A delicate edit for the engineer: a fee, or a ribbon of somebody\'s chorus on the floor.', consequence: 'The engineer trusts her with a blade.',
    drives: { curiosity: 0.5, pride: 0.3 }, bonus: 0.05,
    check: { who: 'tag:engineer', parts: ['tinkering', ['sleight', 0.6], ['stat:reflex', 0.4]], base: 0.35, per: 0.07,
      win: R(['Blackbird cuts the bad bar out of the master with a razor blade and a steady hand. {npc} plays it back. You cannot hear the join. {amount}nd.', 'One slice, one strip of tape, one perfect edit at {venue}. {npc} whistles and pays her {amount}nd.'], { cash: [15, 50], train: [['tinkering', 3], ['sleight', 2]], affinity: 3, thought: ['Surgery. On sound.', 'Steady hands. Mostly from the coffee.'] }),
      lose: R(['The blade slips. A second of somebody\'s chorus falls to the floor at {venue} and curls up like a dead leaf.', 'Blackbird splices the tape back in upside down. The singer now sings one word backwards. It is not better.'], { hp: -1, affinity: -3, train: [['tinkering', 1]], thought: ['That word was cursed anyway.'] }) },
  }),
  row({
    id: 'vocal-booth', where: { feature: 'vocal_booth' }, pace: 'session',
    needs: ['skill:vocals', 'skill:music', 'stat:charm'],
    sees: 'A booth with a pop filter made of tights and a scratch vocal nobody has sung yet.', stakes: 'A guide vocal for somebody else\'s song: cash, singing XP, or a take the producer plays to friends as a joke.', consequence: 'Her voice ends up on somebody else\'s demo.',
    drives: { pride: 0.5, greed: 0.3 }, bonus: 0.1,
    check: { who: 'owner', parts: ['vocals', ['music', 0.5], ['stat:charm', 0.4]], base: 0.32, per: 0.065,
      win: R(['Blackbird sings a guide vocal at {venue} for a band that cannot sing. It is so good they consider keeping it. {npc} pays her {amount}nd and asks her not to tell the singer.', 'One take in the booth at {venue}. {npc} takes the headphones off and says "well". {amount}nd.'], { cash: [15, 60], train: [['vocals', 4]], fame: 0.4, affinity: 3, thought: ['Somewhere a singer is about to feel very insecure.', 'I lent them my voice. I want it back with interest.'] }),
      lose: R(['Blackbird cracks on the high note in the booth at {venue}, loudly, on tape, with the talkback on.', 'The guide vocal at {venue} goes badly. {npc} keeps it, "for reference". Blackbird knows what reference means.'], { train: [['vocals', 1]], thought: ['The booth has bad acoustics. For me specifically.'] }) },
  }),
  row({
    id: 'beat-session', where: { feature: ['drum_kit', 'live_room', 'mixing_desk'] }, pace: 'session',
    needs: ['skill:beatbox', 'skill:music', 'drive:curiosity'],
    sees: 'A track with no drums and a drummer who has gone home.', stakes: 'A beatboxed drum track: XP and a fee, or a track that sounds like a printer dying.', consequence: 'The producer keeps a loop of her.',
    drives: { curiosity: 0.5, pride: 0.4 }, bonus: 0.05,
    check: { who: 'owner', parts: ['beatbox', ['music', 0.5]], base: 0.35, per: 0.065,
      win: R(['The drummer has gone home, so Blackbird does the drums with her mouth into the good microphone at {venue}. {npc} loops it, loves it and pays {amount}nd.', 'Kick, snare, hi-hat, all Blackbird, all one take. {npc} looks at the meters as if they have lied. {amount}nd.'], { cash: [10, 45], train: [['beatbox', 4], ['music', 1]], affinity: 3, thought: ['I am a rhythm section. A whole one.'] }),
      lose: R(['Blackbird beatboxes a drum track at {venue}. It sounds, {npc} says carefully, "organic".', 'The beatbox take at {venue} has a lot of spit in it. Literally. On the microphone.'], { train: [['beatbox', 1]], thought: ['It was raw. Raw is good.'] }) },
  }),
  row({
    id: 'tune-house-guitars', where: { feature: 'guitar_rack' }, pace: 'quick',
    needs: ['skill:guitar', 'skill:tinkering', 'skill:music'],
    sees: 'A rack of house guitars, all slightly out of tune in different directions.', stakes: 'Twenty minutes with a tuner and a screwdriver; a small kindness and a little XP.', consequence: 'The rack plays in tune for a day.',
    drives: { curiosity: 0.4, pride: 0.2 }, bonus: 0.05,
    check: { parts: ['guitar', ['tinkering', 0.5], ['music', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird retunes the whole house rack at {venue} by ear and sets the action on two of them. The next band in will wonder why they suddenly sound good.', 'Twenty minutes, one screwdriver, six guitars in tune. The runner at {venue} watches as if she has performed a miracle.'], { train: [['guitar', 2], ['tinkering', 1], ['music', 1]], xp: 1, thought: ['I hear everything. It is a curse. A useful curse.'] }),
      lose: R(['Blackbird snaps a top E on a house guitar at {venue}. It goes off like a whip.', 'The guitars at {venue} are now out of tune in the same direction. That is progress, of a kind.'], { hp: -1, train: [['guitar', 1]], thought: ['That string had it coming.'] }) },
  }),
  row({
    id: 'amp-whisperer', where: { feature: 'amp_wall' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:guitar', 'stat:int'],
    sees: 'A wall of amps, and one with a name, a reputation and a dead valve.', stakes: 'An hour on the named amp: a fee and the room\'s respect, or a shock.', consequence: 'The named amp likes her now.',
    drives: { curiosity: 0.5, pride: 0.3 }, bonus: 0.05,
    check: { who: 'owner', parts: ['tinkering', ['guitar', 0.4], ['stat:int', 0.5]], base: 0.35, per: 0.07,
      win: R(['The famous amp at {venue} has been dead for a month. Blackbird finds the valve, the cold joint and the mouse nest, in that order. It roars back to life. {npc} pays {amount}nd and nearly cries.', 'Blackbird brings the named amp at {venue} back from the dead. {npc} plugs in, plays one chord and has to sit down. {amount}nd.'], { cash: [30, 90], from: 'owner', train: [['tinkering', 3], ['guitar', 1]], affinity: 5, xp: 3, thought: ['I raised the dead. It was an amp, but still.'] }),
      lose: R(['The famous amp at {venue} bites. Four hundred volts say hello to Blackbird\'s elbow.', 'Blackbird opens up the amp at {venue}, sees what is inside and closes it again, carefully, with a slightly singed eyebrow.'], { hp: -5, train: [['tinkering', 1]], thought: ['It is haunted. I respect that.'] }) },
  }),
  row({
    id: 'play-piano', where: { feature: ['piano', 'organ'] }, pace: 'quick',
    needs: ['skill:music', 'drive:curiosity'],
    sees: 'An old keyboard instrument with burns on the keys and a chord in it waiting for someone.', stakes: 'Ten minutes of noodling: a little music XP, an idea.', consequence: 'A melody stays in her head.',
    drives: { curiosity: 0.4 }, bonus: 0,
    check: { parts: ['music', ['stat:int', 0.3]], base: 0.55, per: 0.05,
      win: R(['Blackbird picks out a tune on the old keys at {venue} that she did not know she knew. The engineer stops what he is doing to listen.', 'Ten minutes at the keys at {venue}. A chord change she has been looking for for weeks falls out of the instrument like a coin.'], { train: [['music', 3]], xp: 1, thought: ['There it is. That chord. I knew it was out there.'] }),
      lose: R(['Blackbird plays a chord on the old keys at {venue}. Two of the notes do not exist any more.', 'She plays something at {venue}. The cat leaves.'], { train: [['music', 1]], thought: ['The instrument is out of tune. With the universe.'] }) },
  }),
  row({
    id: 'echo-chamber', where: { feature: 'echo_chamber' }, pace: 'quick',
    needs: ['skill:vocals', 'skill:perception', 'drive:curiosity'],
    sees: 'A tiled room that holds a note for four seconds and sends it back changed.', stakes: 'A few minutes in the reverb: singing XP, and the room teaches her where her voice is weak.', consequence: 'She hears herself properly, maybe for the first time this life.',
    drives: { curiosity: 0.5, pride: 0.2 }, bonus: 0.05,
    check: { parts: ['vocals', ['perception', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird sings one long note into the echo chamber at {venue} and listens to it come back. It tells her exactly what is wrong with it. She fixes it on the next note.', 'The echo chamber at {venue} gives her voice back a little bigger. She chases the bigger version until she catches it.'], { train: [['vocals', 3], ['perception', 1]], xp: 1, thought: ['The room loves me. The room is tiles. Still.'] }),
      lose: R(['Blackbird sings into the echo chamber at {venue}, and the chamber sends back every flat note four times.', 'The echo chamber at {venue} is extremely honest. Too honest.'], { train: [['vocals', 1]], thought: ['That was the room, not me. Tiles lie.'] }) },
  }),
  row({
    id: 'iso-booth-nap', where: { feature: 'isolation_booth' }, pace: 'session',
    needs: ['skill:sneak', 'drive:thirst', 'stat:muscle'],
    sees: 'The quietest room in the district, with a stool, a blanket and nobody booked into it.', stakes: 'An hour of silence: some health back, nobody looking for her.', consequence: 'For an hour the city cannot find her.',
    drives: { thirst: 0.3 } as Affordance<VenueView>['drives'], bonus: 0.1, ok: (w) => w.hero.hp < w.hero.maxHp * 0.8,
    check: { parts: ['sneak', ['stat:muscle', 0.3]], base: 0.6, per: 0.04,
      win: R(['Blackbird sits in the isolation booth at {venue} with the door shut for an hour. The city goes away. When it comes back, she feels better.', 'An hour in the isolation booth at {venue}: no sirens, no drones, no Muse. Just her pulse, slowing down.'], { hp: 10, thought: ['Silence. Very rare. Very expensive. This one was free.'] }),
      lose: R(['Blackbird is three minutes into the isolation booth at {venue} when somebody books it and knocks.', 'The isolation booth at {venue} is so quiet she can hear her own wounds. It does not help.'], { hp: 3, thought: ['Too quiet. I have thoughts.'] }) },
  }),
];

// ===================================================================== the couch, the coffee and the people

const CROWD: Affordance<VenueView>[] = [
  row({
    id: 'couch-gossip', where: { feature: 'couch' }, pace: 'quick',
    needs: ['skill:streetwise', 'stat:charm', 'drive:curiosity'],
    sees: 'The studio couch, and three musicians on it, each telling a different version of the same story.', stakes: 'Twenty minutes of gossip: a tip on somebody with paper on them, or a long story about a bassist.', consequence: 'The couch knows her now.',
    drives: { curiosity: 0.5 }, bonus: 0.1,
    check: { who: 'regular', parts: ['streetwise', ['stat:charm', 0.5]], base: 0.45, per: 0.06,
      win: R(['On the couch at {venue}, between a story about a drummer and a story about the same drummer, {npc} mentions {tip}, and where they drink.', 'The couch at {venue} has heard everything. Tonight it tells Blackbird about {tip}.'], { tip: true, xp: 1, thought: ['The couch knows things. The couch is my friend.'] }),
      lose: R(['Twenty minutes on the couch at {venue} and all Blackbird learns is the history of one drummer\'s feud with his own hi-hat.', '{npc} on the couch at {venue} tells her a story that goes nowhere, slowly.'], { thought: ['That was a waste of a couch.'] }) },
  }),
  row({
    id: 'coffee-run', where: { feature: 'coffee_machine' }, pace: 'quick',
    needs: ['skill:cooking', 'skill:mixology', 'drive:thirst'],
    sees: 'A coffee machine that makes one thing slowly, and a queue of very tired musicians.', stakes: 'A round of coffees made properly: goodwill from everyone in the room.', consequence: 'The studio owes her a small favour.',
    drives: { thirst: 0.3, curiosity: 0.2 }, bonus: 0.05,
    check: { who: 'any', parts: ['cooking', ['mixology', 0.6]], base: 0.5, per: 0.06,
      win: R(['Blackbird takes over the coffee machine at {venue}, makes it do three things it has never done, and hands round a tray. {npc} looks at her like she has saved the album.', 'A round of coffees at {venue}, made properly. The whole session improves by a key.'], { hp: 3, affinity: 4, train: [['cooking', 2], ['mixology', 1]], thought: ['Caffeine is an instrument. I play it.'] }),
      lose: R(['The coffee machine at {venue} hisses, spits and coats Blackbird\'s sleeve in a fine brown mist.', 'Blackbird makes a round of coffees at {venue}. Everyone thanks her and nobody drinks them.'], { hp: -1, train: [['cooking', 1]], thought: ['The machine was against me from the start.'] }) },
  }),
  row({
    id: 'flirt-producer', where: {}, pace: 'session',
    needs: ['skill:romance', 'stat:charm', 'drive:lust'],
    sees: 'A producer with very good taste in sunglasses and a weakness for talented people who flirt back.', stakes: 'Half an hour of flirting: a free hour on the desk, a name in a good book, or a cold shoulder.', consequence: 'The producer remembers her warmly, or not at all.',
    drives: { lust: 0.6, pride: 0.3 }, bonus: 0.05, ok: (w, v) => !!find(v, 'owner') && find(v, 'owner')!.tags.includes('producer') && !find(v, 'owner')!.tags.includes('robot'),
    check: { who: 'owner', parts: ['romance', ['stat:charm', 0.7], ['vocals', 0.2]], base: 0.3, per: 0.065,
      win: R(['Blackbird leans on the desk at {venue} and makes {npc} laugh twice. By the end {they} write{s} her name in the good book, the one with the free hours in it.', '{npc} pretends not to be flattered by Blackbird for a whole ten minutes. Then {they} offer{s} her the room on Thursday, on the house.'], { affinity: 8, xp: 2, train: [['romance', 3]], thought: ['I am irresistible in a studio. It is the lighting.', 'Producers are people too. Attractive people.'] }),
      lose: R(['{npc} at {venue} listens to Blackbird flirt, smiles politely and asks if she is booked in or just visiting.', 'Blackbird tries her best line on {npc}. {npc} has heard it on a record, sung better.'], { affinity: -2, train: [['romance', 1]], thought: ['Wrong key. I will transpose.'] }) },
  }),
  row({
    id: 'charm-runner', where: {}, pace: 'quick',
    needs: ['stat:charm', 'skill:persuasion', 'drive:curiosity'],
    sees: 'A runner with a tray of teas who knows every booking, every secret and every lyric.', stakes: 'A few minutes of being nice: what is on the books, who is coming in, the code to the back door.', consequence: 'The runner is on her side.',
    drives: { curiosity: 0.5 }, bonus: 0.05, ok: (w, v) => !!find(v, 'arch:studio_runner'),
    check: { who: 'arch:studio_runner', parts: ['stat:charm', ['persuasion', 0.6]], base: 0.5, per: 0.05,
      win: R(['Blackbird helps {npc} carry the teas at {venue} and gets the whole week\'s bookings in exchange, plus the code to the back door.', '{npc} likes Blackbird immediately and tells her, very quietly, who is coming in tonight and which of them owes the producer money.'], { affinity: 6, xp: 1, thought: ['Runners run everything. Remember that.'] }),
      lose: R(['{npc} is too busy for Blackbird and says so, with a tray in each hand.', 'Blackbird tries to make friends with {npc}, who is on the phone and does not notice.'], { thought: ['Busy people are rude. Rude people are busy.'] }) },
  }),
  row({
    id: 'sign-autograph', where: {}, pace: 'quick',
    needs: ['drive:pride', 'stat:charm'],
    sees: 'Somebody on the couch who keeps glancing at her and then at the wall of records.', stakes: 'A signature on a sleeve: a little fame, a fan for life.', consequence: 'A fan, here, for good.',
    drives: { pride: 0.7 }, bonus: 0.1, ok: (w) => (w.legacy.fame ?? 0) + w.hero.fame >= 20,
    check: { who: 'regular', parts: ['stat:charm', ['speaking', 0.3]], base: 0.7, per: 0.03,
      win: R(['{npc} on the couch at {venue} finally works up the nerve and hands Blackbird a record sleeve. She signs it with a flourish she has practised in a mirror.', '"Are you...?" She is. She signs {npc}\'s arm, at {their} request, and {they} vow{s} never to wash it.'], { fame: 0.5, affinity: 10, counter: ['autographs', 1], apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 2; }, thought: ['I am a household name. In this household.', 'Fame. It is a lot of signing.'] }),
      lose: R(['{npc} on the couch at {venue} asks Blackbird if she is "the one who used to be good". She is.', 'Blackbird offers to sign something for {npc}. {npc} has nothing on {them}, and an awkward silence.'], { thought: ['They will regret not having a pen.'] }) },
  }),
  row({
    id: 'gold-wall', where: { feature: 'gold_wall' }, pace: 'quick',
    needs: ['skill:analyze', 'skill:perception', 'drive:curiosity'],
    sees: 'A wall of gold records; the labels say who played on what, and who was paid for it.', stakes: 'A long look: which records are real, whose name is on what, a fact worth money.', consequence: 'She knows which records are fakes.',
    drives: { curiosity: 0.6 }, bonus: 0.05,
    check: { parts: ['analyze', ['perception', 0.6]], base: 0.45, per: 0.06,
      win: R(['Three of the gold records on the wall at {venue} are spray-painted singles. Blackbird notices, says nothing, and later sells the story to a columnist for {amount}nd.', 'Blackbird reads the credits on the gold wall at {venue} and finds a name in all of them: one session player who played on every hit in the district. Interesting.'], { cash: [10, 40], xp: 2, train: [['analyze', 2], ['perception', 1]], thought: ['Gold is a colour, not a metal.'] }),
      lose: R(['Blackbird stares at the gold records at {venue} until the runner asks if she is all right.', 'The gold wall at {venue} is, as far as she can tell, entirely genuine. That is boring.'], { thought: ['I expected scandal. I got gold.'] }) },
  }),
  row({
    id: 'crate-dig', where: { feature: 'vinyl_crates' }, pace: 'session',
    needs: ['skill:scavenging', 'skill:music', 'skill:haggling'],
    sees: 'Crates of records nobody has sorted since the city last changed its mind.', stakes: 'An hour of digging: a rare record worth something, or dust.', consequence: 'The crates are picked over for a while.',
    drives: { curiosity: 0.5, greed: 0.4 }, bonus: 0.05,
    check: { parts: ['scavenging', ['music', 0.5], ['haggling', 0.3]], base: 0.4, per: 0.06,
      win: R(['An hour in the crates at {venue}. Between forty copies of a LUMINA single and a polka album, Blackbird finds {item}.', 'Blackbird digs the crates at {venue} to the bottom and comes up with {item}, which nobody knew was in there.'], { item: 'session_tapes', train: [['scavenging', 2], ['music', 1]], xp: 2, thought: ['Treasure. The dusty kind.'] }),
      lose: R(['An hour in the crates at {venue}. Blackbird learns a great deal about polka.', 'The crates at {venue} are all LUMINA singles, all the way down.'], { train: [['scavenging', 1]], thought: ['LUMINA is a geological layer now.'] }) },
  }),
  row({
    id: 'notice-board', where: { feature: 'notice_board' }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:hustling', 'drive:greed'],
    sees: 'A notice board: session work, a band looking for a guitarist, a lost cat with a demo tape.', stakes: 'A gig off the board: an evening\'s pay for playing on somebody\'s record.', consequence: 'A band remembers her number.',
    drives: { greed: 0.5, curiosity: 0.3 }, bonus: 0.1,
    check: { parts: ['hustling', ['guitar', 0.5], ['streetwise', 0.3]], base: 0.4, per: 0.06,
      win: R(['A card on the board at {venue}: GUITARIST WANTED, ONE SONG, CASH. Blackbird plays the one song and is paid {amount}nd, in coins.', 'Blackbird takes a session off the notice board at {venue}, plays on a stranger\'s demo and leaves {amount}nd richer and slightly in love with the chorus.'], { cash: [20, 70], train: [['guitar', 2], ['hustling', 2]], xp: 2, thought: ['Work. Musical work. The best kind.'] }),
      lose: R(['The band on the notice board at {venue} wanted somebody "with a different energy". It is never the energy.', 'Blackbird calls the number on the board at {venue}. It is the lost cat\'s owner. They are very upset.'], { thought: ['I would have been great on that record.'] }) },
  }),
  row({
    id: 'tip-jar', where: { feature: 'tip_jar' }, pace: 'quick',
    needs: ['skill:sleight', 'drive:greed'],
    sees: 'A tip jar for the engineer\'s ears, full, and nobody watching it.', stakes: 'A handful of coins, or a reputation.', consequence: 'The engineer notices, sooner or later.',
    drives: { greed: 0.6 }, bonus: 0, risk: 0.2,
    check: { who: 'tag:engineer', parts: ['sleight', ['stat:reflex', 0.4]], base: 0.45, per: 0.06,
      win: R(['Blackbird lifts {amount}nd out of the tip jar at {venue} on her way past, with the grace of somebody returning a library book.'], { cash: [6, 28], train: [['sleight', 2]], thought: ['Tips. I tipped myself.'] }),
      lose: R(['Blackbird has her hand in the tip jar at {venue} when {npc} looks up. {They} say{s} nothing. {They} do{es} not need to.'], { affinity: -10, heat: ['place', 1], thought: ['I was making change.'] }) },
  }),
  row({
    id: 'pet-the-cat', where: { feature: 'studio_cat' }, pace: 'quick',
    needs: ['skill:rapport', 'drive:curiosity'],
    sees: 'A studio cat on the warm end of the tape machine, who has been on more records than most clients.', stakes: 'A scratch, or a friend with a credit on eleven albums.', consequence: 'The cat decides.',
    drives: { curiosity: 0.4 }, bonus: 0,
    check: { parts: ['rapport', ['stat:charm', 0.3]], base: 0.55, per: 0.05,
      win: R(['The studio cat at {venue} considers Blackbird, then climbs onto her shoulder and stays there for the rest of the hour. The engineer says it has never done that with anyone famous.', 'Blackbird scratches the studio cat behind the ear. It purrs at a frequency the tape machine picks up. The engineer keeps the take.'], { train: [['rapport', 3]], xp: 1, thought: ['The cat knows talent.'] }),
      lose: R(['The studio cat at {venue} swipes Blackbird and goes back to the warm end of the tape machine.'], { hp: -1, train: [['rapport', 1]], thought: ['The cat is a critic.'] }) },
  }),
  row({
    id: 'balcony-smoke', where: { feature: 'balcony' }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:tolerance', 'stat:charm'],
    sees: 'A smoking balcony where people say what they really think about the take.', stakes: 'Ten minutes of honesty: who in the building owes who, what the producer really thinks of her.', consequence: 'Somebody confided in her.',
    drives: { curiosity: 0.5, thirst: 0.2 }, bonus: 0.05,
    check: { who: 'any', parts: ['streetwise', ['tolerance', 0.4], ['stat:charm', 0.4]], base: 0.5, per: 0.05,
      win: R(['On the balcony at {venue}, {npc} lights two cigarettes, hands her one and tells her everything, including {tip}.', 'Ten minutes on the balcony at {venue}. {npc} tells her the truth about the session, the producer and {tip}.'], { tip: true, affinity: 3, thought: ['Balconies are confession booths with a view.'] }),
      lose: R(['The balcony at {venue} is occupied by a bassist who only wants to talk about modes.', 'Blackbird goes out on the balcony at {venue}. It is raining, and everybody else has gone in.'], { thought: ['Modes. Twenty minutes on modes.'] }) },
  }),
];

// ===================================================================== hustle and leverage

const HUSTLE: Affordance<VenueView>[] = [
  row({
    id: 'haggle-rate', where: {}, pace: 'quick',
    needs: ['skill:haggling', 'stat:charm', 'drive:greed'],
    sees: 'A rate card on the door, and a producer who has a gap in the diary on Thursday.', stakes: 'A free hour of studio time she can take now, or a producer who thinks less of her.', consequence: 'She is known as somebody who negotiates.',
    drives: { greed: 0.6 }, bonus: 0.05, ok: (w, v) => !!find(v, 'owner') && !find(v, 'owner')!.tags.includes('robot'),
    check: { who: 'owner', parts: ['haggling', ['stat:charm', 0.5]], base: 0.35, per: 0.065,
      win: R(['Blackbird talks {npc} down from the rate card at {venue} to, it turns out, nothing at all for an hour on the couch with the desk. She uses it to learn how the desk works.', '{npc} at {venue} sighs, crosses out a number and gives her an hour for nothing. "For the exposure," {they} say{s}, which is usually what musicians are paid in.'], { train: [['haggling', 3], ['djing', 2]], affinity: -1, thought: ['Everything is negotiable. Even time.'] }),
      lose: R(['{npc} hears her out and doubles the rate. "For the conversation."'], { affinity: -3, train: [['haggling', 1]], thought: ['That was a negotiation in reverse.'] }) },
  }),
  row({
    id: 'read-contract', where: {}, pace: 'quick',
    needs: ['skill:calculate', 'skill:analyze', 'stat:int'],
    sees: 'A session contract on the desk, eleven pages, with a clause on page nine nobody has read.', stakes: 'A careful read: the clause that would have owned her, found; or a headache.', consequence: 'She knows where the studio\'s money really goes.',
    drives: { curiosity: 0.5, greed: 0.3 }, bonus: 0.05,
    check: { parts: ['calculate', ['analyze', 0.6], ['stat:int', 0.5]], base: 0.4, per: 0.06,
      win: R(['Page nine of the session contract at {venue}: the studio takes points on everything recorded in it, forever. Blackbird crosses it out, initials it, and the producer does not notice. Later she sells the trick to a band on the couch for {amount}nd.', 'Blackbird reads the contract at {venue} line by line, finds three clauses that would have owned her firstborn and one that would have owned her afterlife.'], { cash: [10, 40], train: [['calculate', 2], ['analyze', 2]], xp: 2, thought: ['Small print. Big trouble. Caught it.'] }),
      lose: R(['Blackbird reads the contract at {venue} twice and is less sure what it means each time.'], { train: [['calculate', 1]], thought: ['It is in a language called Lawyer.'] }) },
  }),
  row({
    id: 'talk-up-band', where: {}, pace: 'session',
    needs: ['skill:persuasion', 'skill:speaking', 'drive:pride'],
    sees: 'A band in a crisis of confidence, about to give up on the chorus.', stakes: 'A pep talk: a band that finishes the album and remembers her for it.', consequence: 'A band owes her one.',
    drives: { pride: 0.5, curiosity: 0.3 }, bonus: 0.05, ok: (w, v) => v.people.filter((n) => n.tags.includes('musician') && n.alive).length >= 2,
    check: { who: 'tag:musician', parts: ['persuasion', ['speaking', 0.6], ['stat:charm', 0.4]], base: 0.4, per: 0.06,
      win: R(['Blackbird gives the band at {venue} a speech about the chorus that is half wisdom and half the plot of a film. It works. {npc} goes back in and nails it.', 'The band at {venue} were about to give up. Blackbird talks them back into the live room with a speech she will quote in her autobiography.'], { affinity: 8, fame: 0.4, train: [['persuasion', 2], ['speaking', 2]], thought: ['I am an inspiration. Not the Muse kind. The real kind.'] }),
      lose: R(['Blackbird\'s pep talk at {venue} goes on too long and the band breaks up in the middle of it.', 'The band at {venue} listens to Blackbird, nods, and argues about the chorus anyway.'], { affinity: -2, thought: ['Some bands cannot be saved. That one specifically.'] }) },
  }),
  row({
    id: 'lean-on-producer', where: {}, pace: 'quick',
    needs: ['skill:intimidation', 'stat:muscle', 'drive:greed'],
    sees: 'A producer who owes half the district a session, and does not want that known.', stakes: 'A little pressure: cash to go away, or a producer with friends.', consequence: 'A grudge.',
    drives: { greed: 0.5, bravery: 0.3 }, bonus: 0, risk: 0.35, ok: (w, v) => !!find(v, 'owner') && !find(v, 'owner')!.tags.includes('robot'),
    check: { who: 'owner', parts: ['intimidation', ['stat:muscle', 0.5]], base: 0.3, per: 0.065,
      win: R(['Blackbird leans on the desk at {venue} until {npc} remembers {they} owe{s} her for a session she did not do. {amount}nd changes hands.'], { cash: [30, 90], from: 'owner', affinity: -12, heat: ['place', 1], train: [['intimidation', 3]], thought: ['A misunderstanding, settled.'] }),
      lose: R(['{npc} at {venue} looks at Blackbird leaning on the desk and calls security.'], { affinity: -15, heat: ['place', 2], fight: true, thought: ['He has friends. Big ones.'] }) },
  }),
  row({
    id: 'sell-bootlegs', where: {}, pace: 'session',
    needs: ['skill:hustling', 'skill:streetwise', 'drive:greed'],
    sees: 'A room full of music lovers, and a box of contraband tapes in her bag.', stakes: 'A box of bootlegs, sold one by one: cash and fans, or a word with Clearance.', consequence: 'Her tapes are in the room now.',
    drives: { greed: 0.6, pride: 0.3 }, bonus: 0.15, ok: (w) => w.hero.inventory.some((i) => i.id === 'bootleg_tapes' || i.id === 'session_tapes'),
    check: { who: 'regular', parts: ['hustling', ['streetwise', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird sells a box of contraband tapes on the couch at {venue}, one at a time, to people who know exactly what they are buying. {amount}nd and a dozen new fans.'], { cash: [40, 110], counter: ['tapes_sold', 1], apply: (c, v) => { const i = c.w.hero.inventory.findIndex((x) => x.id === 'bootleg_tapes' || x.id === 'session_tapes'); if (i >= 0) c.w.hero.inventory.splice(i, 1); v.main.fans = (v.main.fans ?? 0) + 4; }, train: [['hustling', 2]], thought: ['Contraband. Distribution. Art.'] }),
      lose: R(['Blackbird gets her tapes out at {venue} just as a Clearance officer sits down on the couch. She puts them away again, very slowly.'], { warn: ['bootleg', 1], thought: ['Tomorrow. They will keep.'] }) },
  }),
];

// ===================================================================== crime and stealth

const CRIME: Affordance<VenueView>[] = [
  row({
    id: 'tape-vault', where: { feature: 'master_vault' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:sneak', 'drive:greed'],
    sees: 'A locked room of master tapes in cardboard boxes, labelled in a dead engineer\'s hand.', stakes: 'A box of somebody\'s unreleased masters, or the studio\'s security.', consequence: 'Somebody\'s lost album is in her bag.',
    drives: { greed: 0.6, curiosity: 0.4, bravery: 0.2 }, bonus: 0.05, risk: 0.35,
    check: { parts: ['lockpicking', ['sneak', 0.6]], base: 0.3, per: 0.065, dark: 0.1,
      win: R(['The tape vault at {venue} has a lock from the last century. Blackbird has it open in a minute and leaves with {item} under her jacket.', 'Blackbird slips into the vault at {venue} while the session is loud and comes out with {item}. Nobody ever counts the boxes.'], { item: 'session_tapes', train: [['lockpicking', 3], ['sneak', 2]], xp: 3, thought: ['Lost albums. Found.', 'History, in a cardboard box, in my bag.'] }),
      lose: R(['The vault at {venue} has an alarm. It plays a jingle. Everyone in the building knows that jingle.', 'Blackbird is halfway through the lock on the tape vault at {venue} when the runner walks in with a tray of tea.'], { heat: ['place', 2], fight: true, thought: ['The tea is the security system.'] }) },
  }),
  row({
    id: 'mic-locker', where: { feature: 'mic_locker' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:sleight', 'drive:greed'],
    sees: 'A cabinet of vintage microphones, each worth more than the car outside.', stakes: 'One vintage microphone, or the producer\'s idea of justice.', consequence: 'A mic goes missing; someone remembers she was here.',
    drives: { greed: 0.7, bravery: 0.2 }, bonus: 0.05, risk: 0.35,
    check: { parts: ['lockpicking', ['sleight', 0.6]], base: 0.3, per: 0.065,
      win: R(['The mic locker at {venue} opens with a hairpin and a prayer. Blackbird leaves with {item} in her coat and a slight lean to one side.'], { item: 'vintage_mic', train: [['lockpicking', 3], ['sleight', 2]], xp: 3, thought: ['It has a story. Now the story has me in it.'] }),
      lose: R(['The mic locker at {venue} is wired to the talkback. Blackbird\'s lockpicking goes out over every speaker in the building.'], { heat: ['place', 2], affinity: -10, fight: true, thought: ['At least the acoustics were good.'] }) },
  }),
  row({
    id: 'lift-gold-record', where: { feature: 'gold_wall' }, pace: 'quick',
    needs: ['skill:sleight', 'skill:sneak', 'drive:greed'],
    sees: 'A gold record on the wall, a screw loose on its frame, and a fence two streets over.', stakes: 'A framed gold record to fence, or a scene.', consequence: 'A gap on the wall.',
    drives: { greed: 0.5, curiosity: 0.2 }, bonus: 0, risk: 0.3,
    check: { parts: ['sleight', ['sneak', 0.6]], base: 0.35, per: 0.06,
      win: R(['A gold record leaves the wall at {venue} under Blackbird\'s jacket. The gap looks like it has always been there.'], { item: 'gold_record', train: [['sleight', 2], ['sneak', 1]], thought: ['Gold record. Mine now. Technically a cover.'] }),
      lose: R(['Blackbird lifts a gold record off the wall at {venue} and the whole row comes with it, like dominoes.'], { heat: ['place', 1], affinity: -6, thought: ['Shoddy frames. Shoddy studio.'] }) },
  }),
  row({
    id: 'back-door', where: { feature: ['back_door', 'vent', 'loading_bay'] }, pace: 'quick',
    needs: ['skill:sneak', 'skill:athletics', 'stat:reflex'],
    sees: 'A way out the back that nobody watches, onto a service alley.', stakes: 'A quiet exit: the heat on her cools for a moment, nobody saw her leave.', consequence: 'She knows the way out.',
    drives: { bravery: 0.2, curiosity: 0.2 }, bonus: 0, ok: (w) => (w.heat.npd ?? 0) + (w.heat.muse ?? 0) >= 2,
    check: { parts: ['sneak', ['athletics', 0.5], ['stat:reflex', 0.4]], base: 0.5, per: 0.05,
      win: R(['Blackbird goes out the back of {venue}, over a fence and through a laundromat, and comes out on a street where nobody is looking for her.'], { apply: (c) => { for (const k of ['npd', 'muse']) if (c.w.heat[k]) c.w.heat[k] = Math.max(0, c.w.heat[k]! - 1); }, train: [['sneak', 2], ['athletics', 1]], thought: ['Gone. Like a fade-out.'] }),
      lose: R(['The back way out of {venue} ends in a locked gate and a very surprised cat.'], { hp: -2, train: [['sneak', 1]], thought: ['Fences are a conspiracy.'] }) },
  }),
  row({
    id: 'camera-loop', where: { feature: 'camera' }, pace: 'quick',
    needs: ['skill:tinkering', 'skill:sneak', 'stat:int'],
    sees: 'A camera in the corner, wired to a monitor nobody watches and a tape that is never changed.', stakes: 'A loop on the feed: the place stops seeing her, or a shock.', consequence: 'The cameras are blind for a while.',
    drives: { curiosity: 0.4, bravery: 0.2 }, bonus: 0,
    check: { parts: ['tinkering', ['stat:int', 0.5], ['sneak', 0.3]], base: 0.4, per: 0.065,
      win: R(['Blackbird loops the camera at {venue} onto a recording of an empty corridor. It is, she thinks, the studio\'s finest production.'], { cameras: 0, train: [['tinkering', 2]], thought: ['Now the room is mine.'] }),
      lose: R(['The camera at {venue} gets a good, long look at Blackbird\'s face while she fiddles with its cable.'], { heat: ['place', 1], hp: -2, thought: ['It will cut that bit.'] }) },
  }),
  row({
    id: 'pick-pockets', where: {}, pace: 'quick',
    needs: ['skill:sleight', 'drive:greed', 'stat:reflex'],
    sees: 'A couch full of musicians, all of whose wallets are in back pockets, all of whom are looking at the glass.', stakes: 'A wallet, or a fight with a drummer.', consequence: 'Somebody is short of cab fare.',
    drives: { greed: 0.6 }, bonus: 0, risk: 0.25,
    check: { who: 'regular', parts: ['sleight', ['stat:reflex', 0.5]], base: 0.4, per: 0.06,
      win: R(['While everyone at {venue} watches the take through the glass, Blackbird relieves {npc} of {amount}nd.'], { cash: [10, 50], from: 'who', train: [['sleight', 2]], thought: ['A percussive performance.'] }),
      lose: R(['{npc} at {venue} feels the hand in {their} pocket and turns round, slowly, holding a drumstick.'], { affinity: -15, fight: true, thought: ['Drummers. Strong forearms.'] }) },
  }),
  row({
    id: 'scrap-studio', where: {}, pace: 'fight',
    needs: ['skill:melee', 'stat:muscle', 'drive:bravery'],
    sees: 'Somebody on the couch who said something about her last album that she has not forgotten.', stakes: 'A scrap in a room full of expensive gear.', consequence: 'A grudge, and a broken amp.',
    drives: { bravery: 0.5, pride: 0.4 }, bonus: -0.1, risk: 0.5, ok: (w, v) => !!find(v, 'regular') && w.hero.fame > 5,
    check: { who: 'regular', parts: ['melee', ['stat:muscle', 0.5]], base: 0.2, per: 0.05,
      win: R(['Blackbird reminds {npc} at {venue} what {they} said about her second album. {They} take{s} it back, from the floor.'], { affinity: -20, fight: true, heat: ['place', 1], thought: ['Criticism is welcome. Not that one.'] }),
      lose: R(['Blackbird squares up to {npc} at {venue}, who turns out to have been a bouncer before {they} took up bass.'], { affinity: -20, fight: true, thought: ['Bassists. Never again.'] }) },
  }),
];

export const STUDIO_ROWS: Affordance<VenueView>[] = [...GEAR, ...CROWD, ...HUSTLE, ...CRIME];
export { skillLevel };
