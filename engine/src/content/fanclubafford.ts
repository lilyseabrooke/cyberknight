import { type Affordance } from '../affordances';
import { R, banned, rowFor, type VenueView } from '../venuekit';
import { hasInstrument } from '../instruments';
import { addHeat } from '../combat';
import { skillLevel, train } from '../skills';
import type { World } from '../types';
import type { PlaceView } from '../placekit';

/**
 * The first half of a fan club's rows: the shrine and the room (what she does in a place made of her), and the members. The
 * situations, wild cards and the rest are in fanclubevents.ts. Favours, the tribute band and the shrine's guitars are in fanclub.ts.
 *
 * Tokens: {venue} {npc} {owner} {pay} {amount} {item} {tip} {lost}; pronouns for {npc} use {they}/{their}.
 */

export const row = rowFor('fanclub');
export const open = (w: World, v: VenueView): boolean => !banned(w, v.main);
export const vv = (v: PlaceView): VenueView => v as VenueView;
const fans = (v: PlaceView, n: number): void => {
  v.main.fans = (v.main.fans ?? 0) + n;
};

const SHRINE: Affordance<VenueView>[] = [
  row({
    id: 'read-the-shrine', where: { feature: 'shrine' }, pace: 'quick',
    needs: ['skill:perception', 'drive:curiosity', 'drive:pride'],
    sees: 'A shrine to her: photos of every body she has had, candles, and the stories of her deaths written up as close calls.', stakes: 'A long look at herself: a strange feeling, a little pride, the members watching her look.', consequence: 'She has seen how Neo remembers her.',
    drives: { curiosity: 0.7, pride: 0.6 }, bonus: 0.2,
    check: { parts: ['perception', ['stat:charm', 0.2]], base: 0.7, per: 0.03,
      win: R(['Blackbird reads her own shrine at {venue}. Every death is a near miss in the members\' handwriting: "the close call on the Overpass", "the lookalike in the canal". She did not die, according to the shrine. She agrees with the shrine.', 'The shrine at {venue} has a photo of her from a body she does not remember, laughing at something. The members watch her look at it and nobody says a word.'], { fame: 0.4, xp: 2, thought: ['They tell my deaths better than I do.', 'I look good in every body. Statistically.'] }),
      lose: R(['The shrine at {venue} has a typo in her name, in candle wax. Nobody has had the heart to fix it.'], { thought: ['Close enough. Devotion is close enough.'] }) },
  }),
  row({
    id: 'light-a-candle', where: { feature: ['candles', 'shrine'] }, pace: 'quick',
    needs: ['drive:quest', 'stat:charm'],
    sees: 'A shrine full of candles for her deaths and her comebacks, and one unlit.', stakes: 'Light it herself: the members never forget it.', consequence: 'A candle she lit, kept burning.',
    drives: { quest: 0.4, pride: 0.4 }, bonus: 0.1,
    check: { parts: ['stat:charm'], base: 0.75, per: 0.02,
      win: R(['Blackbird lights a candle on her own shrine at {venue}, for a death she does not remember. Three members cry. One takes a photo. The candle will be kept lit, the president says, forever, on a rota.'], { fame: 0.6, apply: (c, v) => fans(v, 3), thought: ['A candle for me. By me. Very meta.'] }),
      lose: R(['Blackbird lights a candle at {venue} and knocks over three others. Somebody puts them out with a membership card.'], { thought: ['Fire is passionate. So am I.'] }) },
  }),
  row({
    id: 'sign-the-book', where: { feature: ['membership_book', 'shrine'] }, pace: 'quick',
    needs: ['drive:pride', 'skill:art'],
    sees: 'A membership book, every page full, and space at the top of the first page.', stakes: 'Sign her own fan club\'s book: member number one, a lot of joy, fans.', consequence: 'She is a member of her own fan club.',
    drives: { pride: 0.8 }, bonus: 0.15, ok: (w, v) => open(w, v) && !w.counters[`signed_book:${v.main.id}`],
    check: { parts: ['art', ['stat:charm', 0.4]], base: 0.8, per: 0.02,
      win: R(['Blackbird signs the membership book of her own fan club at {venue}, at the top of the first page, above the president. The president has to sit down.'], { counter: ['signed_book', 1], apply: (c, v) => { c.w.counters[`signed_book:${v.main.id}`] = 1; fans(v, 5); }, fame: 0.8, thought: ['Member number one. Obviously.'] }),
      lose: R(['Blackbird signs the book at {venue} and the pen runs out halfway through the B.'], { apply: (c, v) => { c.w.counters[`signed_book:${v.main.id}`] = 1; }, thought: ['Half a signature. Still worth more than most.'] }) },
  }),
  row({
    id: 'members-couch', where: { feature: 'couch' }, pace: 'session',
    needs: ['skill:sneak', 'drive:thirst', 'stat:muscle'],
    sees: 'A couch that has had every member on it, offered to her first.', stakes: 'A few hours lying low among people who would lie for her: heat cools, health back.', consequence: 'Nobody will say she was here.',
    drives: { thirst: 0.4, bravery: 0.1 }, bonus: 0.15, ok: (w) => w.hero.hp < w.hero.maxHp * 0.85 || (w.heat.npd ?? 0) + (w.heat.muse ?? 0) >= 2,
    check: { parts: ['sneak', ['stat:muscle', 0.3]], base: 0.75, per: 0.03,
      win: R(['Blackbird sleeps on the couch at {venue} while the members keep watch at the windows and whisper. When she wakes up there is a blanket on her and a cup of tea going cold.'], { hp: 15, apply: (c) => { for (const k of ['npd', 'muse']) if (c.w.heat[k]) c.w.heat[k] = Math.max(0, c.w.heat[k]! - 2); }, thought: ['Safe. Surrounded by people who would die for me. Weird. Nice.'] }),
      lose: R(['Blackbird tries to sleep on the couch at {venue}, but somebody keeps coming in to look at her.'], { hp: 5, thought: ['I am a sleeping attraction.'] }) },
  }),
  row({
    id: 'photo-wall-vanity', where: { feature: 'photo_wall' }, pace: 'quick',
    needs: ['drive:pride', 'skill:perception'],
    sees: 'A wall of photos of her, from every gig and every angle, some unflattering.', stakes: 'Pick out the bad ones and have them quietly moved: her pride, intact.', consequence: 'The worst photos are in a drawer.',
    drives: { pride: 0.7 }, bonus: 0.05,
    check: { who: 'owner', parts: ['perception', ['stat:charm', 0.4]], base: 0.55, per: 0.05,
      win: R(['Blackbird goes along the photo wall at {venue} with the president, pointing at the ones that have to go. The president takes them down with great reverence and puts them in a drawer labelled "for the museum".'], { affinity: 4, buff: { id: 'looking_good', power: 1, beats: 30 }, thought: ['Curated. My image is curated.'] }),
      lose: R(['The president at {venue} refuses to take any photo down. "They are all you," {they} say{s}, which is the problem.'], { thought: ['All me. Even the chin one.'] }) },
  }),
  row({
    id: 'setlist-archive', where: { feature: 'setlist_archive' }, pace: 'session',
    needs: ['skill:analyze', 'skill:music', 'stat:int'],
    sees: 'An archive of every setlist she has played, in folders, by year and body.', stakes: 'An hour reading what she used to play, and how: music XP, a sense of her old self.', consequence: 'She knows what she used to open with.',
    drives: { curiosity: 0.7 }, bonus: 0.15,
    check: { parts: ['analyze', ['music', 0.6], ['stat:int', 0.3]], base: 0.6, per: 0.04,
      win: R(['Blackbird reads her setlists at {venue}, life by life. A previous Blackbird always played the slow one third. She will too, now.'], { train: [['music', 4], ['guitar', 2]], xp: 2, thought: ['I had a system. I have it again.'] }),
      lose: R(['Her setlists at {venue} are in a member\'s shorthand: "BIG ONE", "THE SAD ONE", "THE ONE".'], { thought: ['The One. Which one.'] }) },
  }),
  row({
    id: 'bootleg-night', where: { feature: ['bootleg_library', 'listening_booth', 'tv'] }, pace: 'session',
    needs: ['skill:guitar', 'skill:perception', 'drive:curiosity'],
    sees: 'Every bootleg of her ever made, catalogued, and a chair with headphones.', stakes: 'An hour of her old shows: her hands follow her old hands (guitar XP, more the further she has fallen).', consequence: 'She has heard herself at her best.',
    drives: { curiosity: 0.7, pride: 0.3 }, bonus: 0.2,
    check: { parts: ['perception', ['guitar', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird puts on the headphones at {venue} and listens to a show from a body she does not have. A member hands her a guitar halfway through. By the end she is playing along.'], { apply: (c) => { const gap = Math.max(0, (c.w.legacy.repute?.guitar ?? 0) - skillLevel(c.w.hero, 'guitar')); train(c, 'guitar', Math.round(3 + gap * 0.4)); }, xp: 2, thought: ['She was good. I am her. Keep up, hands.'] }),
      lose: R(['The bootleg at {venue} is mostly crowd noise and somebody eating crisps.'], { thought: ['The crisps had rhythm.'] }) },
  }),
  row({
    id: 'add-lyrics', where: { feature: ['graffiti_wall', 'shrine'] }, pace: 'quick',
    needs: ['skill:art', 'skill:music', 'drive:pride'],
    sees: 'A wall covered in her lyrics, in a dozen hands, some of them wrong.', stakes: 'Correct them, and add a new verse nobody has heard: fans, and a song that starts here.', consequence: 'A new verse on the wall.',
    drives: { pride: 0.6, curiosity: 0.3 }, bonus: 0.1,
    check: { parts: ['art', ['music', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird corrects three of her own lyrics on the wall at {venue}, then writes a new verse underneath. The members copy it into their notebooks before the paint dries.'], { fame: 0.6, apply: (c, v) => fans(v, 3), train: [['art', 2], ['music', 1]], thought: ['Unreleased material. On a wall.'] }),
      lose: R(['Blackbird corrects a lyric at {venue}. The members prefer the wrong version.'], { thought: ['Fans. They know what they like.'] }) },
  }),
  row({
    id: 'surprise-set', where: { feature: ['tribute_stage', 'rehearsal_corner'] }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:pride'],
    sees: 'A small stage where the tribute band plays her songs every night, and tonight the tribute band is on a break.', stakes: 'A surprise set to her own fan club: fame, fans, the night they will tell their grandchildren about (or a letdown in front of the faithful).', consequence: 'The club saw the real thing.',
    drives: { pride: 1 }, bonus: 0.3, ok: (w, v) => open(w, v) && hasInstrument(w.hero),
    check: { parts: ['guitar', ['vocals', 0.5], ['stat:charm', 0.3]], base: 0.4, per: 0.06,
      win: R(['Blackbird steps onto the little stage at {venue} unannounced and plays. The room makes a noise she has never heard a room make. Nobody films it; they all just watch. They will tell it for years.'], { fame: 2.5, apply: (c, v) => fans(v, 10), train: [['guitar', 3]], thought: ['That was the best gig of my life. Of any of my lives.'] }),
      lose: R(['Blackbird plays a surprise set at {venue}. It is not her best. The members cheer anyway, loudly, kindly, which is worse.'], { train: [['guitar', 1]], thought: ['They love me even when I am bad. That is terrifying.'] }) },
  }),
  row({
    id: 'counterfeit-cut', where: { feature: ['merch_table', 'merch_press'] }, pace: 'session',
    needs: ['skill:hustling', 'skill:haggling', 'drive:greed'],
    sees: 'A merch table of things with her face on that she never authorised, and a cash box that is doing very well.', stakes: 'Negotiate a cut of her own counterfeits: cash, and a better T-shirt.', consequence: 'She is a partner in her own bootleg industry.',
    drives: { greed: 0.7 }, bonus: 0.15,
    check: { who: 'owner', parts: ['hustling', ['haggling', 0.6]], base: 0.5, per: 0.05,
      win: R(['Blackbird negotiates a cut of the counterfeit merch at {venue}: a third, in cash, now, and approval on the next mug. {amount}nd.'], { cash: [30, 110], purse: true, train: [['hustling', 2], ['haggling', 2]], thought: ['Royalties from my own bootlegs. The circle of life.'] }),
      lose: R(['The president at {venue} explains that the merch money goes to the buskers\' fund. Blackbird cannot argue with that, and does, and loses.'], { affinity: -2, thought: ['Charity. Outmanoeuvred by charity.'] }) },
  }),
  row({
    id: 'design-a-shirt', where: { feature: 'merch_press' }, pace: 'session',
    needs: ['skill:art', 'skill:tinkering', 'drive:pride'],
    sees: 'A heat press and a stack of shirts with her face on, slightly wrong.', stakes: 'Print the right face: a run of shirts that sell (cash), and her face on half the district.', consequence: 'The right shirt is everywhere.',
    drives: { pride: 0.6, greed: 0.3 }, bonus: 0.1,
    check: { parts: ['art', ['tinkering', 0.4]], base: 0.5, per: 0.05,
      win: R(['Blackbird designs a shirt at {venue}: her silhouette, a guitar, and the words NOT LICENSED. The first run sells out in an hour. {amount}nd.'], { cash: [20, 70], fame: 0.8, train: [['art', 3]], thought: ['A brand. Unlicensed. Perfect.'] }),
      lose: R(['Blackbird runs a shirt through the press at {venue} upside down. It is now a collector\'s item.'], { thought: ['Rare merch. Very rare.'] }) },
  }),
  row({
    id: 'write-the-newsletter', where: { feature: 'newsletter_press' }, pace: 'session',
    needs: ['skill:speaking', 'skill:art', 'drive:pride'],
    sees: 'A press that prints THE NEST every week, mostly rumours, and a column that needs writing.', stakes: 'Write a column in her own fan newsletter: fame, a rumour of her choosing in circulation.', consequence: 'THE NEST says what she wanted it to say.',
    drives: { pride: 0.6, curiosity: 0.3 }, bonus: 0.1,
    check: { parts: ['speaking', ['art', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird writes a column for THE NEST at {venue} under a pen name everybody guesses at once. It says she was never dead, only on tour. By the weekend it is the official position of four districts.'], { fame: 1.2, apply: (c) => { c.w.legacy.coverStories ??= []; }, train: [['speaking', 2]], thought: ['Press. Free press. My press.'] }),
      lose: R(['Blackbird\'s column for THE NEST at {venue} is cut for space, to make room for the crossword.'], { thought: ['The crossword is about me. Fine.'] }) },
  }),
  row({
    id: 'petition', where: { feature: 'petition_desk' }, pace: 'session',
    needs: ['skill:speaking', 'skill:persuasion', 'drive:quest'],
    sees: 'A petition desk: FREE BLACKBIRD\'S MUSIC, signed by half the district.', stakes: 'Take the petition to the street with the members: Muse loosens its grip on the block, fame, Muse heat.', consequence: 'Muse has a petition about her on its desk.',
    drives: { quest: 0.6, pride: 0.4 }, bonus: 0.15,
    check: { parts: ['speaking', ['persuasion', 0.6]], base: 0.5, per: 0.05,
      win: R(['Blackbird walks the petition round the block with forty members behind her. By evening it has eight thousand signatures and a song. Muse posts a heartfelt statement about "listening".'], { fame: 1.5, apply: (c, v) => { addHeat(c.w, 'muse', 1); for (const e of v.main.exits) { const s = c.w.locations[e.to]; if (s?.kind === 'street') s.musePull = Math.max(0, (s.musePull ?? 50) - 10); } }, train: [['speaking', 2], ['persuasion', 2]], thought: ['Democracy. With a backing vocal.'] }),
      lose: R(['The petition at {venue} is confiscated by a Clearance officer as "unlicensed sentiment".'], { apply: (c) => addHeat(c.w, 'muse', 1), thought: ['Unlicensed sentiment. Put it on my grave.'] }) },
  }),
  row({
    id: 'request-on-radio', where: { feature: 'radio' }, pace: 'quick',
    needs: ['skill:djing', 'skill:streetwise', 'drive:pride'],
    sees: 'A radio tuned to a pirate station that plays her every hour.', stakes: 'Phone the station: a request, a shout-out, a little fame across the district.', consequence: 'The pirate station played her, by request, from her.',
    drives: { pride: 0.5, curiosity: 0.3 }, bonus: 0.05,
    check: { parts: ['streetwise', ['djing', 0.4]], base: 0.55, per: 0.05,
      win: R(['Blackbird rings the pirate station from {venue} and requests herself. The DJ recognises her voice and loses his mind on air.'], { fame: 0.8, thought: ['I requested me. The audience agreed.'] }),
      lose: R(['The pirate station\'s line is engaged. It is always engaged. Everyone is requesting her.'], { thought: ['Popular. Too popular.'] }) },
  }),
  row({
    id: 'dragon-log', where: { feature: 'telescope' }, pace: 'quick',
    needs: ['skill:tracking', 'skill:perception', 'drive:curiosity'],
    sees: 'A telescope pointed at the dragons, and a log of every one that hummed her song.', stakes: 'Read the log: where the dragons are tonight, and which ones like her.', consequence: 'She knows the sky.',
    drives: { curiosity: 0.7 }, bonus: 0.05,
    check: { parts: ['tracking', ['perception', 0.5]], base: 0.55, per: 0.05,
      win: R(['The dragon log at {venue} has tonight\'s sightings in neat columns, and a star by the ones that hum her chorus. She memorises the route the nearest one flies.'], { tip: true, train: [['tracking', 2]], thought: ['Dragons. Fans of mine. Some of them.'] }),
      lose: R(['The telescope at {venue} is pointed at a flat across the road. Nobody explains.'], { thought: ['A different kind of dragon watching.'] }) },
  }),
  row({
    id: 'free-noodles', where: { feature: ['noodle_counter', 'kettle', 'tea_urn', 'bar_counter'] }, pace: 'quick',
    needs: ['drive:thirst', 'skill:cooking'],
    sees: 'Food and drink, free for members, and she is the first member.', stakes: 'Fed and watered, on the house.', consequence: 'Fed.',
    drives: { thirst: 0.6 }, bonus: 0.1, ok: (w) => w.hero.hp < w.hero.maxHp,
    check: { parts: ['cooking'], base: 0.85, per: 0.02,
      win: R(['The members at {venue} feed Blackbird until she has to refuse, and then feed her a little more.'], { hp: 10, thought: ['Fed by fans. The best diet.'] }),
      lose: R(['The members at {venue} make her the dish named after her. It is too spicy. It is supposed to be.'], { hp: 5, thought: ['That was a test of character. I passed. Barely.'] }) },
  }),
];

const MEMBERS: Affordance<VenueView>[] = [
  row({
    id: 'address-the-members', where: {}, pace: 'session',
    needs: ['skill:speaking', 'stat:charm', 'drive:pride'],
    sees: 'A room of people who would follow her anywhere, waiting for her to say something.', stakes: 'A speech to her fan club: fans, fame, a club ready for anything.', consequence: 'The club would do anything she asked.',
    drives: { pride: 0.9, quest: 0.3 }, bonus: 0.2,
    check: { parts: ['speaking', ['stat:charm', 0.6]], base: 0.5, per: 0.05,
      win: R(['Blackbird stands on a chair at {venue} and tells her fans what they mean to her. Some of it is true. All of it lands. When she gets down there is a queue to hug her.'], { fame: 1.5, apply: (c, v) => fans(v, 6), train: [['speaking', 3]], thought: ['I am a leader. Of a fan club. Which is a nation.'] }),
      lose: R(['Blackbird\'s speech at {venue} goes on too long and somebody starts the tribute band to get her off.'], { thought: ['The band was very loud. Rude, but loud.'] }) },
  }),
  row({
    id: 'flirt-a-fan', where: {}, pace: 'session',
    needs: ['skill:romance', 'stat:charm', 'drive:lust'],
    sees: 'A fan who has gone completely still since she walked in.', stakes: 'A flirt with somebody who has loved her from a distance for years: very easy, very dangerous.', consequence: 'A fan\'s best night, and a story.',
    drives: { lust: 0.7, pride: 0.4 }, bonus: 0.15,
    check: { who: 'fair', parts: ['romance', ['stat:charm', 0.7]], base: 0.6, per: 0.04,
      win: R(['Blackbird asks {npc} at {venue} what {their} favourite song is. {npc} cannot answer, so Blackbird sings it to {them}, quietly, in the corner. The rest of the club pretends not to watch.'], { affinity: 20, train: [['romance', 3]], thought: ['A dream come true. Theirs. Also, a bit, mine.'] }),
      lose: R(['{npc} at {venue} faints, gracefully, onto the couch.'], { thought: ['Too much me, too fast.'] }) },
  }),
  row({
    id: 'selfie-line', where: {}, pace: 'session',
    needs: ['drive:pride', 'stat:charm', 'skill:speaking'],
    sees: 'Everybody in the room holding a phone and pretending not to.', stakes: 'An hour of selfies: fame, fans, and a sore face.', consequence: 'Her face is on every phone in the district.',
    drives: { pride: 0.8 }, bonus: 0.1,
    check: { parts: ['stat:charm', ['speaking', 0.3]], base: 0.75, per: 0.03,
      win: R(['Blackbird stands by the shrine at {venue} for an hour and takes a selfie with every member, plus their mum on video call. Her cheeks will hurt until Thursday.'], { fame: 1, apply: (c, v) => fans(v, 4), thought: ['Smiling is cardio.'] }),
      lose: R(['The selfie line at {venue} is so long it goes out the door and down the stairs and into a cop.'], { apply: (c) => { c.w.heat.npd = (c.w.heat.npd ?? 0) + 1; }, thought: ['Fame is a crowd-control problem.'] }) },
  }),
  row({
    id: 'presidents-spreadsheet', where: {}, pace: 'quick',
    needs: ['skill:calculate', 'skill:analyze', 'drive:curiosity'],
    sees: 'The president\'s spreadsheet: every member, every job, every street, every show.', stakes: 'Read it: who she knows where, a tip, and which superfans are in which offices.', consequence: 'She knows her own network.',
    drives: { curiosity: 0.7 }, bonus: 0.1, ok: (w, v) => !!v.people.find((n) => n.archetype === 'club_president'),
    check: { who: 'owner', parts: ['calculate', ['analyze', 0.5]], base: 0.6, per: 0.04,
      win: R(['The president at {venue} shows Blackbird the spreadsheet, tab by tab. Four hundred members, their jobs, their streets, their favourite songs. In the column marked WORK there is a desk sergeant, a Helix lab tech and {tip}\'s landlord.'], { tip: true, affinity: 5, train: [['calculate', 2]], thought: ['A database of devotion. Useful.'] }),
      lose: R(['The spreadsheet at {venue} has crashed. The president is trying to fix it with a hairpin.'], { thought: ['Fans and technology. A rocky marriage.'] }) },
  }),
  row({
    id: 'borrow-from-club', where: {}, pace: 'quick',
    needs: ['skill:grifting', 'stat:charm', 'drive:greed'],
    sees: 'A club that would give her anything, and a biscuit tin of subs.', stakes: 'A loan from the subs tin (they will never ask for it back), or the members\' faces.', consequence: 'The club is poorer and prouder.',
    drives: { greed: 0.6 }, bonus: 0.05,
    check: { who: 'owner', parts: ['grifting', ['stat:charm', 0.6]], base: 0.6, per: 0.04,
      win: R(['Blackbird mentions to the president at {venue} that she is a little short. The biscuit tin of subs is in her hands before she finishes the sentence. {amount}nd. They insist.'], { cash: [30, 120], affinity: -2, thought: ['A loan. From love.', 'I will pay it back. In songs.'] }),
      lose: R(['Blackbird hints at money at {venue}. The president hears it as a joke and laughs so long that she has to laugh too.'], { thought: ['Comedy. Unintended.'] }) },
  }),
  row({
    id: 'spin-a-death', where: {}, pace: 'session',
    needs: ['skill:grifting', 'skill:speaking', 'drive:pride'],
    sees: 'Members who want to know what really happened the night she died.', stakes: 'Tell them it was a lookalike, or a close call, or a stunt: fame, and a cover story the whole city believes.', consequence: 'The official story of her death is hers.',
    drives: { pride: 0.7, curiosity: 0.3 }, bonus: 0.15, ok: (w) => w.legacy.deaths.length > 0,
    check: { parts: ['grifting', ['speaking', 0.6]], base: 0.55, per: 0.05,
      win: R(['Blackbird tells the members at {venue} what really happened the night she died: a stunt double, a mirror, a fall that was always going to look worse than it was. They write it down. By morning it is true.'], { fame: 1.5, train: [['grifting', 3]], thought: ['I did not die. I improvised.'] }),
      lose: R(['Blackbird tells the members at {venue} she did not die. An elder shows her a photo. She changes the subject.'], { thought: ['A photo is not proof. It is just a photo of proof.'] }) },
  }),
  row({
    id: 'answer-fan-mail', where: { feature: ['notice_board', 'membership_book', 'shrine'] }, pace: 'session',
    needs: ['skill:art', 'skill:speaking', 'drive:quest'],
    sees: 'A shoebox of letters addressed to her, care of the club, some of them years old.', stakes: 'An hour answering fan mail: fans everywhere the letters came from, and a strange tenderness.', consequence: 'People across the city have a letter from her.',
    drives: { quest: 0.5, pride: 0.4 }, bonus: 0.1,
    check: { parts: ['art', ['speaking', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird answers a shoebox of fan mail at {venue}, one by one, with a drawing on each. One letter is from a child who is now a grown woman. She answers that one twice.'], { fame: 1, apply: (c) => { const ls = Object.values(c.w.locations).filter((l) => l.kind === 'street' && l.fans).slice(0, 4); for (const l of ls) l.fans! += 2; }, thought: ['Pen pals. Hundreds of them.'] }),
      lose: R(['The fan mail at {venue} is mostly addressed to LUMINA by mistake.'], { thought: ['Honest mistake. Unforgivable.'] }) },
  }),
  row({
    id: 'muster-the-club', where: {}, pace: 'session',
    needs: ['skill:speaking', 'skill:streetwise', 'drive:bravery'],
    sees: 'A room full of people who know the words and the plan, and a city outside that needs a crowd.', stakes: 'Muster the club: an hour of heavy cover on the block (police and Muse hold back), fans out on the streets.', consequence: 'The block is full of her people for an hour.',
    drives: { bravery: 0.5, pride: 0.5 }, bonus: 0.15,
    check: { parts: ['speaking', ['streetwise', 0.6]], base: 0.6, per: 0.04,
      win: R(['Blackbird gives the word at {venue}, and the members go out onto the block in twos and threes, singing. For an hour nobody official can find anyone on the street.'], { apply: (c, v) => { for (const e of v.main.exits) c.w.counters[`mob_until:${e.to}`] = c.w.clock + 60; c.w.counters[`mob_until:${v.main.id}`] = c.w.clock + 60; }, fame: 0.6, thought: ['An army. Of hummers.'] }),
      lose: R(['The members at {venue} go out onto the block, and come back in, because it is raining.'], { thought: ['Fair-weather fans. Literally.'] }) },
  }),
];

export const FANCLUB_ROWS: Affordance<VenueView>[] = [...SHRINE, ...MEMBERS];
