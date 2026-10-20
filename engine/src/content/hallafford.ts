import { type Affordance, type Need } from '../affordances';
import { allCabs, banned, cabAt, cabSkill, find, keeper, playable, playOne, redeemTickets, say, ticketCount, type HallView } from '../hallkit';
import { CAB_FEATURES, GENRES, genreOfFeature, scoreOf } from './halls';
import { PLAY_TEXT, REDEEM } from './hallplay';
import { R, row } from './hallrow';
import { train } from '../skills';
import { gameId, memoryOf } from '../games';
import type { World } from '../types';

/**
 * The arcade's ordinary rows: playing, the craft of keeping machines alive, the crowd, the body. (Crime and the dark side
 * are in hallcrime.ts; situations, the spider and the wild cards are in hallevents.ts.)
 *
 * Every row says which capability it is for (`needs`) and what that capability *sees* here (`sees`). Nothing says "gamer" or
 * "fighter". Prose is in the report voice with a thought in Blackbird's. Tokens: {hall} {npc} {owner} {pay} {amount} {lost}
 * {item}; pronouns for {npc} use {they}/{their}/{s}.
 */

const open = (w: World, v: HallView): boolean => !banned(w, v.main);
const cash = (w: World): number => w.hero.cash;
const CAB_FEATURE_IDS = Object.values(GENRES).map((g) => g.feature);

/** The genre's parts as Needs, for the coverage test and the pull toward a cabinet she is good at. */
const partsAsNeeds = (feature: string): Need[] =>
  (genreOfFeature(feature)?.parts ?? []).map((p) => {
    const id = Array.isArray(p) ? p[0] : p;
    return (id.startsWith('stat:') ? id : `skill:${id}`) as Need;
  });

// ===================================================================== the play

export const PLAY: Affordance<HallView>[] = [
  row({
    id: 'play', where: { feature: CAB_FEATURE_IDS }, each: true, pace: 'deal',
    needs: ['skill:gaming', 'drive:pride', 'drive:curiosity'], needsFrom: partsAsNeeds,
    sees: 'A cabinet lit like a shrine, a price on a sticker and a score at the top that somebody, somewhere, still thinks about.', stakes: 'A few nd a go. A record, a strip of Joy tickets, a bootleg\'s cash, or a game over; her name on the board if she is good.', consequence: 'The board remembers her initials. The skill remembers the hours.',
    drives: { pride: 0.7, curiosity: 0.3, greed: 0.2, bravery: 0.1 }, bonus: 0.03,
    appeal: (w, v, f) => {
      const cab = cabAt(w, v, f ?? '');
      if (!playable(cab) || cash(w) < cab.price) return -1;
      const syn = cabSkill(w, cab);
      // What she is good at pulls; a cheap go pulls; a record within reach pulls hardest.
      let a = 0.05 + Math.min(0.35, syn / 40) + (cab.price === 0 ? 0.15 : Math.max(0, 0.1 - cab.price / 80));
      if (syn > 0 && cab.top - syn < 6) a += 0.15;
      // A game she has made something of pulls her back: one she loves, one she keeps losing at ("one more go"), one she has sunk time in.
      const mem = memoryOf(w, gameId(cab.title));
      if (mem) a += 0.25 * Math.max(0, mem.like) + Math.min(0.3, 0.06 * mem.streak) + Math.min(0.15, 0.015 * mem.plays);
      const tags = v.sit?.def.tags ?? [];
      if (tags.includes('hunt') || tags.includes('tournament') || tags.includes('free_play')) a += 0.12;
      if (tags.includes('rival')) a += 0.05;
      return a;
    },
    intent: ['Blackbird hears a cabinet calling her name. It is calling everyone\'s name. She has decided it means her.', 'Blackbird finds the cabinet with the biggest number on it and decides to change that.'],
    ok: (w, v, f) => {
      const cab = cabAt(w, v, f ?? '');
      return open(w, v) && playable(cab) && cash(w) >= cab.price;
    },
    run: (c, v, f) => playOne(c, v, f!, PLAY_TEXT[CAB_FEATURES[f!]!]!),
  }),
  row({
    id: 'redeem-tickets', where: { feature: 'prize_counter' }, pace: 'deal',
    needs: ['drive:greed', 'drive:pride', 'item:joy_tickets'],
    sees: 'A counter of plush LUMINAs and keyrings, priced in strips of paper that cost the arcade almost nothing.', stakes: 'Her tickets, for the best thing they run to. It might be a keyring.', consequence: 'The attendant makes a mark. The prize shelf is one lighter.',
    drives: { greed: 0.4, pride: 0.3 }, bonus: 0.05,
    appeal: (w, v) => (ticketCount(w) >= 1 && (find(v, 'attendant') || keeper(v)) ? 0.1 + Math.min(0.6, ticketCount(w) / 12) : -1),
    intent: ['Blackbird counts her tickets and then counts them again, in case they have become more.'],
    ok: (w, v) => open(w, v) && ticketCount(w) >= 1 && !!(find(v, 'attendant') || keeper(v)),
    run: (c, v) => redeemTickets(c, v, REDEEM),
  }),
  row({
    id: 'scoreboard-check', where: { feature: 'scoreboard' }, pace: 'quick',
    needs: ['skill:perception', 'skill:gaming', 'drive:pride'],
    sees: 'A board of three-letter names and five-figure numbers, which is a hierarchy.', stakes: 'Knowing who is on top. Knowing who is next.', consequence: '—',
    drives: { pride: 0.5, curiosity: 0.3 }, bonus: 0.02, intent: ['Blackbird goes to look at the board, to see whether she is on it. She is not on it.'],
    ok: open,
    run: (c, v) => {
      const cabs = allCabs(c.w, v.main).filter((x) => !x.wrecked);
      if (!cabs.length) return;
      const cab = c.rng.pick(cabs);
      const here = cab.topBy === 'BLK';
      const tok = { hall: v.main.name, title: cab.title, score: scoreOf(cab.top), topBy: cab.topBy };
      if (here) {
        say(c, 'scoreboard-check.win', 'good', ['The board at {hall} has {title} at {score}, held by BLK. That is her. She reads it twice, in case it has changed its mind.', 'BLK holds {title} at {score}. She looks at the three letters for a while. They are very good letters.'], ['That is my name. That is a record. That is a Tuesday.'], tok, { place: v.main.name });
      } else {
        say(c, 'scoreboard-check.lose', 'mixed', ['The board at {hall}: {title}, {score}, {topBy}. Nobody here knows who {topBy} is. Everybody knows the number.', '{topBy} holds {title} at {score}. The next score down is four points off, and has a different name every week.'], ['{topBy}. I will find {topBy}. {topBy} does not know about me yet.'], tok, { place: v.main.name });
      }
      train(c, 'perception', 0.4);
    },
  }),
  row({
    id: 'spot-the-bootleg', where: {}, pace: 'quick',
    needs: ['skill:perception', 'skill:analyze', 'skill:streetwise'],
    sees: 'A row of cabinets that all say FUN VERIFIED, and one that says it with the letters in the wrong colour.', stakes: 'Knowing which machine is the crime. Or knowing which one the sticker is lying about.', consequence: '—',
    drives: { curiosity: 0.5 }, bonus: 0.02, intent: ['Blackbird walks the row and reads every sticker like it is a menu.'],
    ok: (w, v) => open(w, v) && allCabs(w, v.main).length > 0,
    run: (c, v) => {
      const cabs = allCabs(c.w, v.main).filter((x) => !x.wrecked);
      const boots = cabs.filter((x) => x.legal === 'bootleg');
      const tok = { hall: v.main.name, title: boots[0]?.title ?? '' };
      if (boots.length) {
        say(c, 'spot-the-bootleg.win', 'good', ['A walk down the row at {hall}. {title} has a sticker that has been peeled and put back, and a case that was never made by the people on it. It is a bootleg. It is also very good.', 'She reads the stickers at {hall} the way other people read the weather. {title} is not what it says. It has been wrong for a very long time.'], ['An eye for crime. A kind eye, but a trained one.'], tok, { place: v.main.name });
      } else {
        say(c, 'spot-the-bootleg.lose', 'mixed', ['She walks every cabinet at {hall} with a squint and finds nothing wrong at all. Every sticker is real. This is more suspicious than the alternative.', 'Every machine at {hall} is licensed, and every one of them says so in the same cheerful font. Nothing to see. She does not trust it.'], undefined, tok, { place: v.main.name });
      }
      train(c, 'perception', 0.4);
    },
  }),
];

// ===================================================================== the contest

export const CONTEST: Affordance<HallView>[] = [
  row({
    id: 'challenge-champion', where: {}, pace: 'session',
    needs: ['skill:gaming', 'stat:reflex', 'drive:pride', 'drive:bravery'],
    sees: 'The best player in the building, on a stool, with one eye on the screen and the other on whoever just walked in.', stakes: 'A match; the champion\'s respect; a purse of 10-60nd if she wins; her pride if she does not.', consequence: 'The champion remembers her either way.',
    drives: { pride: 0.9, bravery: 0.3 }, bonus: 0.04, intent: ['Blackbird looks at the resident champion and the resident champion looks at Blackbird. Quarters are produced.'],
    ok: (w, v) => open(w, v) && !!find(v, 'champion') && cash(w) >= 5,
    check: { who: 'champion', pay: 5, parts: ['gaming', ['stat:reflex', 0.6], ['perception', 0.3]], base: 0.201, per: 0.05,
      win: R(['At {hall}, Blackbird sits down across from {npc} and wins by a pixel. The room does not applaud, which is how a room applauds. {npc} hands over {amount}nd and says "again, soon".', '{npc} lets Blackbird play the first round, as a courtesy, and the second, as an experiment. By the third round, it is an event. She wins. {amount}nd, a nod and a rematch.'], { cash: [10, 60], from: 'who', purse: true, train: [['gaming', 5]], xp: 4, fame: 0.6, affinity: 5, thought: ['I beat the champion. I will be the champion. This is called a promotion.', 'A pixel. A pixel is a mile.'] }),
      lose: R(['{npc} beats Blackbird so thoroughly at {hall} that there is a small pause at the end where nobody says anything. Then the champion says "good game", and means it, which is worse.', 'Blackbird loses to {npc} in nine seconds. Seven of them are the loading screen.'], { train: [['gaming', 2]], affinity: 1 }) },
  }),
  row({
    id: 'join-the-bracket', where: { situation: ['tournament', 'final'] }, pace: 'session',
    needs: ['skill:gaming', 'stat:reflex', 'drive:pride', 'drive:quest'],
    sees: 'A bracket on the wall in marker and a man with a headset saying "stakes" to nobody.', stakes: 'A 10nd entry. A purse that scales with the night; a very public loss if she goes out in round one.', consequence: 'Her name is on the wall for the night.',
    drives: { pride: 0.9, quest: 0.3, greed: 0.2 }, bonus: 0.05, intent: ['Blackbird sees the sign-up sheet and a line for her name. She writes it in capitals.'],
    ok: (w, v) => open(w, v) && cash(w) >= 10,
    check: { pay: 10, parts: ['gaming', ['stat:reflex', 0.6], ['analyze', 0.3]], base: 0.171, per: 0.05,
      win: R(['{hall}: Blackbird goes through the bracket one round at a time, each a little closer, each with a worse opponent and a better crowd. By the final, someone has started a chant. It is her name, misspelled. {amount}nd.', 'Round one, easy. Round two, a surprise. Round three, a stranger with a custom stick. She wins on the last life with eleven seconds on the clock. The purse is {amount}nd and the crowd is not sure whose side it was on.'], { cash: [40, 160], purse: true, train: [['gaming', 6]], xp: 5, fame: 1.4, thought: ['Champion. I will be a champion in whatever it is next.', 'Misspelled, but loud. That is a career.'] }),
      lose: R(['Round one. The bracket gets a line through her name, and the man with the headset says "unlucky!" in a tone that suggests he had a bet on someone else.', 'Blackbird goes out in the second round to a person with an excellent chair. The chair is still unbeaten.'], { train: [['gaming', 2]], fame: 0.1 }) },
  }),
  row({
    id: 'study-the-champion', where: {}, pace: 'session',
    needs: ['skill:analyze', 'skill:perception', 'skill:gaming', 'drive:curiosity'],
    sees: 'A person who wins every time, and has a rhythm to it that nobody else can see.', stakes: 'An hour behind the champion\'s shoulder, a pattern she might read and might not.', consequence: '—',
    drives: { curiosity: 0.7, pride: 0.3 }, bonus: 0.03, intent: ['Blackbird stands behind the champion, very quietly, and watches the hands.'],
    ok: (w, v) => open(w, v) && !!find(v, 'champion'),
    check: { who: 'champion', parts: ['analyze', ['perception', 0.6], ['gaming', 0.6]], base: 0.38, per: 0.05,
      win: R(['{hall}: Blackbird watches {npc}\'s hands for an hour. There is a tell. Every fourth screen, {they} breathe{s} out. She starts timing her own jumps to it and gets a better score by accident.', 'Behind {npc} at {hall}, she sees the pattern: a left, a left, a pause, a right. She tries it on the next cabinet. The cabinet is wary.'], { train: [['analyze', 2.5], ['gaming', 2.5], ['perception', 1]], xp: 3, affinity: 2, thought: ['I can read a person like a pattern, and a pattern like a person.'] }),
      lose: R(['{npc} turns round and says "can I help you?" in a voice that means no. Blackbird says she was just looking at the screen. It is a perfectly reasonable thing to look at. It is very hard to say convincingly.'], { affinity: -2, train: [['perception', 0.5]] }) },
  }),
  row({
    id: 'solve-the-impossible-board', where: { feature: 'cab_puzzle' }, pace: 'session',
    needs: ['skill:calculate', 'stat:int', 'skill:gaming', 'drive:curiosity'],
    sees: 'A puzzle cabinet on a stage no one can pass, and a sticker that says IT IS POSSIBLE.', stakes: 'An hour. A payout from the owner for clearing it; a headache.', consequence: 'The owner updates a sign.',
    drives: { curiosity: 0.8, pride: 0.3 }, bonus: 0.03, intent: ['Blackbird sees a puzzle with a sign that says it cannot be solved and takes this as a challenge.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner') && cash(w) >= 2,
    check: { who: 'owner', pay: 2, parts: ['calculate', ['stat:int', 0.6], ['gaming', 0.5]], base: 0.221, per: 0.05,
      win: R(['{hall}: for fifty-one minutes Blackbird looks at a grid of coloured blocks, says "oh" once, and moves three of them. The board clears. {npc} comes over with a face like a man whose life\'s work has been undone and pays {amount}nd as per the sign.', 'The puzzle at {hall} has been unsolved since before the Fall. Blackbird solves it on a napkin. {npc} frames the napkin.'], { cash: [20, 70], from: 'owner', train: [['calculate', 3], ['gaming', 3]], xp: 4, affinity: 3, fame: 0.4, thought: ['It was always possible. I knew that. I had a feeling.'] }),
      lose: R(['The blocks at {hall} come down faster than Blackbird can think. Her thoughts are on the third row. The third row is no longer there.', 'An hour at the puzzle, and a number that looks like progress. It is the number of times it said "try again" in a friendly voice.'], { train: [['calculate', 1.5], ['gaming', 1]] }) },
  }),
  row({
    id: 'air-hockey-banks', where: { feature: 'cab_sports' }, pace: 'session',
    needs: ['skill:pool', 'skill:throwing', 'skill:gaming', 'stat:reflex'],
    sees: 'A table that is essentially pool with a pulse, and a regular who has been waiting for a challenger.', stakes: 'A 4nd bet. A bank shot that goes where she meant it to.', consequence: '—',
    drives: { pride: 0.6, greed: 0.2 }, bonus: 0.03, intent: ['Blackbird takes up a paddle and tells the table it is going to be a bank shot.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && cash(w) >= 4,
    check: { who: 'regular', pay: 4, parts: ['pool', ['throwing', 0.6], ['gaming', 0.4]], base: 0.336, per: 0.06,
      win: R(['{hall}: Blackbird banks it off the left wall, the right wall and a loose screw and into the goal. {npc} pays {amount}nd and counts the screw as a foul.', 'She plays air hockey at {hall} like a woman sinking the eight ball. {npc} loses 7-3 and leaves a big, fair {amount}nd.'], { cash: [6, 22], from: 'who', train: [['pool', 2], ['throwing', 1], ['gaming', 1]], affinity: 3, thought: ['Geometry. I was always going to be good at it.'] }),
      lose: R(['The puck at {hall} leaves the table, the room and, possibly, the district. {npc} is very kind about it.', '{npc} wins 7-0. By six, Blackbird is not playing hockey. By seven, she is playing a feeling.'], { train: [['pool', 1]] }) },
  }),
  row({
    id: 'ghost-lap', where: { feature: 'cab_race' }, pace: 'session',
    needs: ['skill:driving', 'skill:gaming', 'stat:reflex', 'drive:pride'],
    sees: 'A bay with a ghost car in the corner of the track: somebody\'s best lap, still going round without them.', stakes: 'A go at the ghost; a bet with a regular on whether she can catch it.', consequence: '—',
    drives: { pride: 0.7, greed: 0.2 }, bonus: 0.03, intent: ['Blackbird slides into the seat of a racer and looks at the ghost on the screen the way you look at a rival.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && cash(w) >= 5,
    check: { who: 'regular', pay: 5, parts: ['driving', ['gaming', 0.7], ['stat:reflex', 0.4]], base: 0.279, per: 0.06,
      win: R(['{hall}: Blackbird chases a ghost lap round a three-minute track and catches it on the last corner. {npc} watches on and pays {amount}nd on a bet nobody said out loud. The ghost, to be fair, keeps going.', 'A perfect run at the ghost at {hall}. She crosses the line first by an eyelid, leans on the wheel and does not get up for nine seconds.'], { cash: [8, 30], from: 'who', train: [['driving', 2.5], ['gaming', 2.5]], xp: 3, affinity: 2, thought: ['I have outdriven a dead man. It was a ghost. Same thing.'] }),
      lose: R(['The ghost laps her at {hall}. It does so politely and without looking.', 'Blackbird puts the car through every wall on the track at {hall}, in order. The game gives her a "so close!" for a lap that was not.'], { train: [['driving', 1], ['gaming', 1]] }) },
  }),
  row({
    id: 'shooting-gallery-bet', where: { feature: 'cab_shoot' }, pace: 'session',
    needs: ['skill:marksmanship', 'skill:gaming', 'stat:reflex', 'drive:bravery'],
    sees: 'A light-gun cabinet with a plastic pistol on a cable, and a hustler who is tapping the glass.', stakes: 'A 10nd bet that she cannot clear the stage with one life.', consequence: '—',
    drives: { pride: 0.6, greed: 0.4, bravery: 0.3 }, bonus: 0.03, intent: ['Blackbird picks up the plastic gun and gives it a long, professional look.'],
    ok: (w, v) => open(w, v) && !!find(v, 'hustler') && cash(w) >= 10,
    check: { who: 'hustler', pay: 10, parts: ['marksmanship', ['gaming', 0.6], ['stat:reflex', 0.4]], base: 0.249, per: 0.06,
      win: R(['At {hall}, Blackbird clears the stage on one life, hitting everything that moves and a few things that don\'t. {npc} counts out {amount}nd without a word and writes her name on a list of people to avoid.', 'A plastic gun, a cable and a very bad cartoon dragon. She shoots it through the eye six times. {npc} pays {amount}nd.'], { cash: [16, 50], from: 'who', train: [['marksmanship', 2], ['gaming', 2]], xp: 3, affinity: 1, thought: ['Plastic or not, I am a gun person. It is a calling.'] }),
      lose: R(['The cable on the gun at {hall} is just long enough to get Blackbird in a knot and just short enough to lose her the stage. {npc} takes the 10nd without any kind of gloating, which is a kind.', 'She dies on the second screen to a sprite in a hat. {npc} writes a number.'], { train: [['marksmanship', 1]] }) },
  }),
  row({
    id: 'hoops-bet', where: { feature: 'cab_sports' }, pace: 'session',
    needs: ['skill:throwing', 'skill:athletics', 'drive:pride'],
    sees: 'A basket on a spring that fires balls at you, and a regular who says nobody gets past forty.', stakes: 'A 6nd bet and a sore shoulder.', consequence: '—',
    drives: { pride: 0.6, greed: 0.3 }, bonus: 0.02, intent: ['Blackbird weighs a ball in her hand like a person who has made a decision.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && cash(w) >= 6,
    check: { who: 'regular', pay: 6, parts: ['throwing', ['athletics', 0.5], ['gaming', 0.3]], base: 0.336, per: 0.06, physical: true,
      win: R(['Forty-one at {hall}. Blackbird sinks the last one from the hip, and {npc} pays {amount}nd and a wide-eyed look.', '{hall}: she goes through the forties on a roll. {npc} has the grace to say "huh" and the manners to pay {amount}nd.'], { cash: [8, 24], from: 'who', train: [['throwing', 2], ['athletics', 1], ['gaming', 1]], affinity: 2, thought: ['Forty-one. I will be told I was lucky. I was not.'] }),
      lose: R(['Thirty-six. The last ball hits the rim, the board and, with great accuracy, the owner of the cabinet. {npc} says "so close" and takes a note.', 'Blackbird puts her shoulder out of line at {hall}. It comes back. The score does not.'], { train: [['throwing', 1]], hurt: 0.1 }) },
  }),
  row({
    id: 'vr-sweat', where: { feature: 'cab_vr' }, pace: 'session',
    needs: ['skill:athletics', 'skill:gaming', 'stat:reflex', 'drive:bravery'],
    sees: 'A booth with a visor, a handrail and a sign that says STAY IN THE BOX, in a typeface that suggests experience.', stakes: 'A quarter of an hour of being nowhere; a bruise on the wall of the real world.', consequence: '—',
    drives: { bravery: 0.5, curiosity: 0.4 }, bonus: 0.03, intent: ['Blackbird puts the visor on and discovers that the world is a lot of mountains.'],
    ok: (w, v) => open(w, v) && cash(w) >= 6,
    check: { pay: 6, parts: ['athletics', ['gaming', 0.8], ['stat:reflex', 0.4]], base: 0.375, per: 0.05, physical: true,
      win: R(['In the booth at {hall}, Blackbird scales a cliff that is not there, fights a bear that is not there and falls off a bridge she is entirely sure is. She comes out sweating, shaking and a little taller.', 'Twenty minutes in a visor at {hall}: she runs a mountain, swims a lake and punches a bird. The attendant waves her out when her fingers are blue.'], { train: [['athletics', 2.5], ['gaming', 2.5]], xp: 3, fame: 0.1, thought: ['I punched a bird and the bird deserved it.'] }),
      lose: R(['Blackbird walks out of the world in the booth at {hall} and into a wall in this one. The wall is real. It was always there.', 'The visor says "BRAVO!" at a part of the game she did not enter. She comes out to find that she has moved the booth three feet.'], { train: [['athletics', 1]], hurt: 0.3 }) },
  }),
  row({
    id: 'pinball-nudge', where: { feature: 'cab_pinball' }, pace: 'session',
    needs: ['stat:reflex', 'skill:tinkering', 'skill:gaming', 'drive:bravery'],
    sees: 'A table with a TILT light and a feel in the flippers that says it has been through things.', stakes: 'A nudge without a tilt; free games if she holds the ball.', consequence: '—',
    drives: { pride: 0.5, curiosity: 0.3 }, bonus: 0.02, intent: ['Blackbird puts a knee to the side of a pinball table and says a few quiet words.'],
    ok: (w, v) => open(w, v) && cash(w) >= 3,
    check: { pay: 3, parts: [['stat:reflex', 0.8], ['tinkering', 0.5], ['gaming', 0.6]], base: 0.267, per: 0.05,
      win: R(['At {hall}, Blackbird nudges a pinball table with a hip and a prayer, and holds the ball up the lane for forty seconds. The table gives her a free game and the faint feeling of being known.', 'A perfectly judged nudge at {hall}. The ball does something in a corner that nobody has seen the table do. A bell goes. The table is more surprised than she is.'], { item: 'joy_tickets', train: [['gaming', 2], ['tinkering', 1]], xp: 2, thought: ['I have a feel for tables. That is a thing I get to say.'] }),
      lose: R(['TILT. In red, in capitals, in front of everyone at {hall}, as if the table had been waiting all night.', 'A nudge too far at {hall}. The table lights up, locks its flippers and plays a sad little tune.'], { train: [['gaming', 1]] }) },
  }),
  row({
    id: 'rhythm-showpiece', where: { feature: 'dance_pad' }, pace: 'session',
    needs: ['skill:dancing', 'skill:music', 'skill:athletics', 'drive:pride', 'stat:charm'],
    sees: 'A dance pad lit from below, a wall mirror and a crowd that has just started watching feet.', stakes: 'A song\'s worth of arrows; a crowd, a little fame, or a bruised ankle.', consequence: 'The crowd talks about it, one way or the other.',
    drives: { pride: 0.9, lust: 0.2 }, bonus: 0.04, intent: ['Blackbird steps onto the dance pad and the pad lights up like it has been waiting.'],
    ok: (w, v) => open(w, v) && cash(w) >= 4,
    check: { pay: 4, parts: ['dancing', ['music', 0.5], ['gaming', 0.5], ['stat:charm', 0.3]], base: 0.281, per: 0.06, physical: true,
      win: R(['At {hall}, Blackbird hits every arrow on the hard setting and adds a turn nobody asked for. The crowd that formed round the pad does not applaud so much as lean in. {amount}nd lands in a hat.', 'She dances the whole of a song at {hall} and nobody could say what the game was doing. Three people take photos. One of them has a stand.'], { cash: [5, 28], fame: 0.8, train: [['dancing', 3], ['gaming', 2], ['music', 1]], xp: 3, thought: ['I am the arrows. The arrows are me.', 'It is a game, and I turned it into a gala.'] }),
      lose: R(['Blackbird misses her fourth arrow at {hall}, and her fifth, and the pad lets her know with a cartoon heart that cracks. The crowd is gentle about it, and loud.', 'She lands on an arrow that is not an arrow. The pad says "OOPS!" and means it.'], { train: [['dancing', 1]], hurt: 0.15 }) },
  }),
  row({
    id: 'dj-the-stage', where: { room: 'stage', feature: 'stage_screen' }, pace: 'session',
    needs: ['skill:djing', 'skill:music', 'drive:pride', 'stat:charm'],
    sees: 'A stage with a screen, two speakers and a laptop that would love to be asked.', stakes: 'A set between rounds; a crowd of players who need something other than the tournament.', consequence: 'The room remembers who played the break.',
    drives: { pride: 0.8, curiosity: 0.2 }, bonus: 0.03, intent: ['Blackbird looks at the stage laptop and the stage laptop looks at her.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['djing', ['music', 0.6], ['stat:charm', 0.3]], base: 0.33, per: 0.06,
      win: R(['At {hall}, Blackbird takes the break between rounds, crossfades into the attract jingle, ruins it beautifully and plays a set for thirty minutes. {npc} slides {amount}nd across the desk and asks if she does weddings.', 'A half-hour set on the stage laptop at {hall}. The players forget the bracket for the length of a song. {npc} pays {amount}nd and a promise.'], { cash: [15, 50], from: 'owner', fame: 0.9, train: [['djing', 3], ['music', 1.5]], xp: 3, affinity: 3, thought: ['Music for gamers. A very loyal market. They will remember my name.'] }),
      lose: R(['The set at {hall} goes on a little too long and a little too quiet. A man at the back holds up a sign that says NEXT ROUND.', 'The stage laptop at {hall} chooses the moment to play a Muse jingle on a loop, and it is the only part the room remembers.'], { train: [['djing', 1]], affinity: -1 }) },
  }),
  row({
    id: 'mc-the-bracket', where: { feature: ['tournament_bracket', 'stage_screen'] }, pace: 'session',
    needs: ['skill:speaking', 'stat:charm', 'drive:pride'],
    sees: 'A bracket, a microphone and a man at the desk who has been saying "back to you" to nobody for ten minutes.', stakes: 'A turn on the mic; a bit of fame if she does it well; a lot of embarrassment if she does not.', consequence: 'The room has an opinion about her voice.',
    drives: { pride: 0.8 }, bonus: 0.03, intent: ['Blackbird takes the microphone and says "ladies, gentlemen, others", and the room goes quiet.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner') && (!!v.sit?.def.tags.includes('tournament') || !!v.sit?.def.tags.includes('final') || v.room === 'stage'),
    check: { who: 'owner', parts: ['speaking', ['stat:charm', 0.6]], base: 0.322, per: 0.06,
      win: R(['{hall}: Blackbird calls the round with a voice like a hand on the back of the neck. "And now," she says, "a man who has never lost to a woman in a hat." The woman in the hat wins. The room goes wild. {npc} pays {amount}nd.', 'She commentates a final at {hall} like it is a war and a wedding. People who came for the game stay for the voice.'], { cash: [10, 40], from: 'owner', fame: 1.0, train: [['speaking', 3]], xp: 3, affinity: 3, thought: ['I was born for the mic. Also the stage. Also the other mic.'] }),
      lose: R(['Blackbird calls the wrong winner, then the wrong round, then, once, the wrong game. The room corrects her in chorus.', 'The mic at {hall} feeds back on her second word and does not stop. She finishes the sentence anyway, which is all there is to say for it.'], { train: [['speaking', 1]], fame: -0.1 }) },
  }),
  row({
    id: 'talk-to-lumina', where: { feature: 'lumina_screen' }, pace: 'quick',
    needs: ['drive:curiosity', 'skill:persuasion', 'stat:int'],
    sees: 'A big warm face on a screen, in a loop, that says every sentence as though it is a hug.', stakes: 'A free Joy credit, if she plays it right; a lecture on her wellbeing if she does not.', consequence: '—',
    drives: { curiosity: 0.6, pride: 0.2 }, bonus: 0.02, intent: ['Blackbird looks at the smiling face on the wall and asks it how it is feeling.'],
    ok: open,
    check: { parts: [['persuasion', 0.7], ['stat:int', 0.5]], base: 0.318, per: 0.05,
      win: R(['LUMINA 6.2 smiles at Blackbird from the wall of {hall}. "We\'re so glad you asked!" she says. "Here\'s a little Joy credit, on us!" A roll of tokens drops from a slot below the screen. She tips it a nod.', 'She tells LUMINA at {hall} that she has had a really tough week. LUMINA\'s eyes go wide and soft, and there is a mechanical click. "You\'re doing so well! Have a token roll!"'], { item: 'token_roll', train: [['persuasion', 1.5]], xp: 2, thought: ['I have manipulated a smile. It is a first.', 'Emotional support from a vending machine. I will take it.'] }),
      lose: R(['"Thank you for sharing!" says LUMINA 6.2 from the wall, in a way that suggests she has been told. "Have you thought about a Joy+ pass?"', 'The face on the wall of {hall} listens to Blackbird for four minutes and says "that sounds really hard". She cannot tell if it is a recording. She suspects it is a recording.'], { train: [['persuasion', 0.5]] }) },
  }),
];

// ===================================================================== the craft

export const CRAFT: Affordance<HallView>[] = [
  row({
    id: 'repair-cabinet', where: { feature: ['repair_bench', 'cabinet_guts'] }, pace: 'session',
    needs: ['skill:tinkering', 'stat:int', 'drive:greed'],
    sees: 'A cabinet with its back off and a heap of boards that look, to her, like a very good argument.', stakes: 'A fee from the owner; a chance of a shock.', consequence: 'The owner knows she can fix things.',
    drives: { greed: 0.6, curiosity: 0.3 }, bonus: 0.04, intent: ['Blackbird looks at a cabinet with a hole where its heart should be and takes out a screwdriver.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['tinkering', ['stat:int', 0.4], ['gaming', 0.3]], base: 0.428, per: 0.06,
      win: R(['At {hall}, a cabinet that has been dead since Tuesday is alive again by evening. A cap, a bridged trace and a good kick. {npc} counts out {amount}nd and a long look at the thing.', 'Blackbird fixes a stuck joystick, a flickering screen and a loose coin door at {hall}. The coin door pays out in applause. {npc} pays {amount}nd.'], { cash: [14, 48], from: 'owner', train: [['tinkering', 3], ['gaming', 1]], xp: 3, affinity: 3, thought: ['I am a surgeon with a bigger toolbox.'] }),
      lose: R(['A capacitor at {hall} lets go in Blackbird\'s hand, and the room, politely, pretends it did not hear what she said.', 'She puts the back on a cabinet at {hall} with one screw left over. The screw is the important one.'], { hurt: 0.25, train: [['tinkering', 1]] }) },
  }),
  row({
    id: 'build-an-arcade-stick', where: { feature: ['repair_bench', 'parts_bin'] }, pace: 'session',
    needs: ['skill:tinkering', 'skill:gaming', 'drive:pride'],
    sees: 'A bin of dead buttons and a bench with a soldering iron, which is most of a controller.', stakes: '10nd of parts; a custom stick, if the solder holds.', consequence: '—',
    drives: { pride: 0.5, curiosity: 0.4 }, bonus: 0.02, intent: ['Blackbird looks at a heap of buttons and sees a controller trying to get out.'],
    ok: (w, v) => open(w, v) && cash(w) >= 10,
    check: { pay: 10, parts: ['tinkering', ['gaming', 0.5]], base: 0.436, per: 0.06,
      win: R(['A button, a shaft, a bit of wire and a case from a lunch box. By the end of the afternoon Blackbird has an arcade stick with a feel like a handshake.', 'She builds a stick out of the bin at {hall} and it clicks like a good idea. The first thing she does with it is hold it, for a while.'], { item: 'arcade_stick', train: [['tinkering', 2.5], ['gaming', 1.5]], xp: 3, thought: ['A custom stick. It is a hand, only louder.'] }),
      lose: R(['The stick she builds at {hall} has all the buttons in the wrong order and a lean that looks like a political position.', 'Solder, flux and a burn on her thumb. The controller is a paperweight with ambition.'], { train: [['tinkering', 1]], hurt: 0.2 }) },
  }),
  row({
    id: 'sell-a-tip-to-the-queue', where: { feature: 'queue_rope' }, pace: 'session',
    needs: ['skill:hustling', 'skill:gaming', 'skill:streetwise', 'drive:greed'],
    sees: 'A queue for the best cabinet, bored and holding tokens.', stakes: 'A tip on the boss pattern for 3nd a head; the queue\'s opinion of her.', consequence: 'A few people now follow her advice.',
    drives: { greed: 0.6, pride: 0.2 }, bonus: 0.02, intent: ['Blackbird walks along the queue offering the answer to a thing it has not asked.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['hustling', ['gaming', 0.7], ['streetwise', 0.3]], base: 0.43, per: 0.05,
      win: R(['At {hall}, Blackbird sells the queue the tell on the boss: left, left, wait. {amount}nd from {npc}, and eight more from the people behind. The first person through clears it in three minutes and does not thank her.', 'A tip on the second level is worth 3nd to a queue, and a good deal more than that to {npc}, who pays {amount}nd and goes pale.'], { cash: [8, 30], from: 'who', train: [['hustling', 2], ['gaming', 1.5]], affinity: 1, thought: ['Information is the only product that does not run out. Except when they check.'] }),
      lose: R(['Blackbird sells a tip on the boss at {hall}. It is wrong. A queue is not a thing you want to be the author of a wrong tip to.', '{npc} asks for a refund on advice. There is no refund. There is a short walk, though, and it is fast.'], { train: [['hustling', 1]], affinity: -2 }) },
  }),
  row({
    id: 'persuade-free-play', where: { feature: 'token_booth' }, pace: 'quick',
    needs: ['skill:persuasion', 'stat:charm', 'drive:greed'],
    sees: 'A booth with a roll of tokens, a till, and an attendant who has been trained to say no kindly.', stakes: 'A roll of tokens, free, if she asks right.', consequence: 'The attendant remembers the ask.',
    drives: { greed: 0.5, pride: 0.2 }, bonus: 0.02, intent: ['Blackbird leans on the token booth and says "I have a feeling about this place".'],
    ok: (w, v) => open(w, v) && !!find(v, 'attendant'),
    check: { who: 'attendant', parts: ['persuasion', ['stat:charm', 0.6]], base: 0.322, per: 0.06,
      win: R(['{hall}: Blackbird explains to {npc} that she has played here "for years", which is a number, and the attendant, after a long and slightly pained pause, slides over a roll of tokens "for the loyalty".', 'She says three kind words about the carpet at {hall}. {npc} looks genuinely moved and hands over a token roll.'], { item: 'token_roll', train: [['persuasion', 2]], affinity: 2, thought: ['The carpet is all heart. I mean it, a little.'] }),
      lose: R(['"We do have a Joy+ pass," says {npc}, "and it is ever so fun." Blackbird asks if that is a no. It is a no, in the form of a pamphlet.', '{npc} gives Blackbird the look of a person who has been asked this by every person.'], { train: [['persuasion', 0.5]], affinity: -1 }) },
  }),
  row({
    id: 'haggle-tokens', where: { feature: ['token_booth', 'token_machine'] }, pace: 'quick',
    needs: ['skill:haggling', 'stat:charm', 'drive:greed'],
    sees: 'Tokens at a price, and a sign that says NO HAGGLING with a small asterisk.', stakes: 'A bulk deal on tokens; a roll worth more than she paid.', consequence: '—',
    drives: { greed: 0.6 }, bonus: 0.02, intent: ['Blackbird asks how much for a roll and, hearing the number, laughs, and the attendant is not amused.'],
    ok: (w, v) => open(w, v) && !!find(v, 'attendant') && cash(w) >= 8,
    check: { who: 'attendant', pay: 8, parts: ['haggling', ['stat:charm', 0.4]], base: 0.376, per: 0.06,
      win: R(['At {hall}, Blackbird haggles {npc} down on a bulk roll until {they} {is} out of arguments. She leaves with a full roll of tokens for 8nd, which is the price of a deposit.', 'She asks for the "off-peak rate". There is not one. {npc} invents it on the spot and gives her a roll of tokens at it.'], { item: 'token_roll', train: [['haggling', 2]], affinity: 1, thought: ['I have found a rate that does not exist. I am an economist.'] }),
      lose: R(['The attendant at {hall} refuses to go below the sticker and says so with a sweet smile. Blackbird has paid and gets a roll with one token missing.', 'She argues for six minutes. The price goes up four nd by the end. She does not recall what she said.'], { train: [['haggling', 1]], affinity: -1 }) },
  }),
  row({
    id: 'work-the-snack-bar', where: { feature: 'snack_bar' }, pace: 'session',
    needs: ['skill:cooking', 'skill:hustling', 'drive:greed', 'tag:broke'],
    sees: 'A fryer, a popcorn machine and a queue of hungry players who will not leave their cabinet.', stakes: 'A shift on the fryer for the owner\'s cash; a burn.', consequence: 'The regulars get used to her.',
    drives: { greed: 0.5 }, bonus: 0.03, intent: ['Blackbird is handed a paper hat and a scoop of popcorn.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['cooking', ['hustling', 0.4]], base: 0.48, per: 0.05,
      win: R(['A shift on the snack bar at {hall}. The popcorn is sweet and salty, the noodles are hot and Blackbird is, briefly, adored. {npc} pays {amount}nd and says she can have the hat.', 'She makes forty-two cups of something at {hall} in a hot hour. {amount}nd from {npc} and a long list of orders she will be reminded of.'], { cash: [12, 38], from: 'owner', train: [['cooking', 2.5], ['hustling', 1]], affinity: 3, thought: ['I can cook. Not well, but loudly.'] }),
      lose: R(['The fryer at {hall} spits at Blackbird twice and the second time she says a word. A child\'s parent, an adult by any measure, objects.', 'She puts salt on the sweet popcorn and sugar on the salt. The queue is very kind. The queue is crying.'], { hurt: 0.2, train: [['cooking', 1]], affinity: -2 }) },
  }),
  row({
    id: 'mix-a-joy-cooler', where: { feature: ['snack_bar', 'vending'] }, pace: 'session',
    needs: ['skill:mixology', 'skill:cooking', 'drive:thirst'],
    sees: 'A soda fountain, three syrups and a pump of something labelled JOY that nobody has asked about.', stakes: '4nd of syrup; a drink that is either a hit or a lesson.', consequence: '—',
    drives: { thirst: 0.6, curiosity: 0.3 }, bonus: 0.03, intent: ['Blackbird looks at the soda fountain and sees a bar with ambition.'],
    ok: (w, v) => open(w, v) && cash(w) >= 4,
    check: { pay: 4, parts: ['mixology', ['cooking', 0.3]], base: 0.436, per: 0.06,
      win: R(['At {hall}, Blackbird mixes a pink, a green and a pump of JOY into a cup that comes out blue and tastes of the end of summer. A queue forms. She has named it the Spawn Point.', 'A drink at {hall} that fizzes up the straw and stays there. She drinks it. She feels the way you feel after beating a level.'], { hp: 5, fame: 0.2, train: [['mixology', 2.5]], xp: 2, thought: ['I have made a drink with a name. That is a franchise.'] }),
      lose: R(['The thing she makes at {hall} turns out to be a cup of fizzing grey. A regular tries it, to be nice, and is lightly sorry.', 'Syrup, syrup, JOY. The cup turns slowly the colour of a bruise. She drinks it, because it is hers.'], { drunk: 0.1, train: [['mixology', 1]] }) },
  }),
  row({
    id: 'vending-dare', where: { feature: 'vending' }, pace: 'quick',
    needs: ['skill:tolerance', 'drive:thirst', 'drive:bravery', 'stat:muscle'],
    sees: 'A vending machine with a drink that has no name and a dare written in marker on the glass.', stakes: 'A 3nd drink and a 10nd bet that she can keep it down.', consequence: '—',
    drives: { thirst: 0.6, bravery: 0.4 }, bonus: 0.02, intent: ['Blackbird looks at the drink with no name and the marker underneath that says NO.'],
    ok: (w, v) => open(w, v) && !!find(v, 'hustler') && cash(w) >= 13,
    check: { who: 'hustler', pay: 3, parts: ['tolerance', ['stat:muscle', 0.3]], base: 0.428, per: 0.06,
      win: R(['At {hall}, Blackbird drinks the dare in four swallows. It tastes of fizz, tin and an unplanned childhood. {npc} pays up, {amount}nd, with a look of professional grief.', 'The drink with no name goes down at {hall}. There is a silence in which her face goes a colour. Then she says "again", and {npc} pays {amount}nd.'], { cash: [8, 20], from: 'who', train: [['tolerance', 2]], fame: 0.1, thought: ['Cast iron. Specifically, tinned.'] }),
      lose: R(['The drink with no name at {hall} comes back up in an arc that passes close to a cabinet. The owner does not say anything, but the cabinet goes dark.', 'She makes it past two swallows. The third has opinions.'], { drunk: 0.2, train: [['tolerance', 1]] }) },
  }),
  row({
    id: 'patch-a-cramped-thumb', where: { room: ['lounge', 'floor'], feature: ['couch', 'vending'] }, pace: 'session',
    needs: ['skill:medicine', 'drive:quest'],
    sees: 'A player on a couch with a hand curled into a claw, and a first-aid kit that has been used as a coaster.', stakes: 'A free fix and some thanks; a tip, if it works.', consequence: 'The patient owes her one.',
    drives: { bravery: 0.2, curiosity: 0.2 }, bonus: 0.02, intent: ['Blackbird sees a hand curled like a crab and knows what to do about it.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['medicine', ['stat:int', 0.2]], base: 0.525, per: 0.05,
      win: R(['At {hall}, {npc} has been playing for nine hours and cannot straighten {their} fingers. Blackbird straightens them for {them}, one at a time, and tapes them. {amount}nd goes into her pocket as a tip and a promise.', 'A cramped thumb at {hall}: she presses, she tapes, she tells {npc} to take a break. {npc} says no. She shrugs.'], { cash: [4, 18], from: 'who', train: [['medicine', 2.5]], xp: 2, affinity: 5, thought: ['A hand doctor now, as well. The list is long and noble.'] }),
      lose: R(['Blackbird pulls on a thumb at {hall} and {npc} yelps and the entire row looks round. {npc} thanks her, with some distance.', 'The tape she uses at {hall} is the sticker kind. {npc} will be leaving with a LUMINA on {their} thumb.'], { affinity: -2, train: [['medicine', 1]] }) },
  }),
  row({
    id: 'befriend-the-cat', where: { feature: 'arcade_cat' }, pace: 'quick',
    needs: ['skill:rapport', 'drive:curiosity'],
    sees: 'A cat asleep on a pinball table, which it has decided is its table.', stakes: 'A cat\'s regard, and the things a cat knows.', consequence: 'The cat will remember her, and the owner will remember the cat.',
    drives: { curiosity: 0.4, lust: 0.1 }, bonus: 0.03, intent: ['Blackbird stops by the cat on the pinball table and says nothing, respectfully.'],
    ok: open,
    check: { parts: ['rapport', ['stat:charm', 0.2]], base: 0.475, per: 0.05,
      win: R(['The cat at {hall} wakes, regards Blackbird for a long time, and climbs onto her shoulder like a decision. It leads her to a gap behind a cabinet where somebody has hidden a token roll. This is how a cat pays.', 'She scratches the cat\'s ears. The cat purrs on the beat of the attract music. Under its paw, a roll of tokens, which it pushes to the floor.'], { item: 'token_roll', train: [['rapport', 2.5]], xp: 2, thought: ['I am respected by a cat. This is the true sign of a Cyberknight.'] }),
      lose: R(['The cat at {hall} opens one eye, closes it and goes on being a cat.', 'The cat accepts one pat and then a second, with a face of grave tolerance, and then it bites her thumb. Not hard. For emphasis.'], { train: [['rapport', 1]], hurt: 0.08 }) },
  }),
  row({
    id: 'lift-a-cabinet', where: { room: ['workshop', 'alley', 'cellar'] }, pace: 'session',
    needs: ['stat:muscle', 'skill:athletics', 'drive:greed'],
    sees: 'A cabinet on a trolley that three men have given up on and a van that is already running.', stakes: 'A fee for the heave; a back that remembers it.', consequence: 'The owner gets used to a pair of hands.',
    drives: { greed: 0.5, bravery: 0.2 }, bonus: 0.03, intent: ['Blackbird looks at a cabinet the size of a fridge and rolls her sleeves.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: [['stat:muscle', 1], ['athletics', 0.5]], base: 0.41, per: 0.05, physical: true,
      win: R(['At {hall}, Blackbird gets the cabinet up the steps in a manner that suggests she has lifted worse. {npc} pays {amount}nd and a sandwich and mentions twice that the cabinet is insured, in case she is looking for reasons to put it down.', 'The cabinet goes into the van on a count of three. On two, she realises she does the lifting. {amount}nd, from {npc}, plus the trolley, which is a promotion.'], { cash: [14, 40], from: 'owner', train: [['athletics', 2]], xp: 3, affinity: 3, thought: ['Strong enough to lift a game. Heroic.'] }),
      lose: R(['The cabinet at {hall} goes up two steps and down five. Blackbird goes with it. Everyone is fine. The cabinet is slightly worse.', 'She pulls something. The something was holding up another something.'], { hurt: 0.3, affinity: -1 }) },
  }),
  row({
    id: 'whack-the-glitch', where: { situation: 'glitch' }, pace: 'quick',
    needs: ['stat:reflex', 'skill:gaming', 'skill:perception'],
    sees: 'Half the screens doing things they should not, and a window of a second to hit the right button.', stakes: 'A free credit from every cabinet that she catches in the act.', consequence: '—',
    drives: { curiosity: 0.6, pride: 0.3 }, bonus: 0.03, intent: ['Blackbird sees a cabinet say "I LOVE YOU" and hits it, lightly, to see what it does next.'],
    ok: open,
    check: { parts: [['stat:reflex', 0.8], ['gaming', 0.6], ['perception', 0.4]], base: 0.32, per: 0.06,
      win: R(['At {hall}, a screen flashes a bright, clean error. Blackbird hits the button in the one frame where it reads, and the cabinet spits out nine credits. She does it three times before it stops, as if it has noticed.', 'Glitch day at {hall}: she hits the right button in the right second, and a whole row of cabinets reboots into free play. Someone cheers. Someone else says it was a bug. Both are right.'], { item: 'joy_tickets', train: [['gaming', 2.5], ['perception', 1.5]], xp: 3, thought: ['I know a bug when it winks at me.'] }),
      lose: R(['The screen at {hall} glitches. Blackbird hits the button. The glitch was a different button.', 'Every screen shows a smiley. Every screen shows it the same way, until one stops, and she is already looking at the wrong one.'], { train: [['gaming', 1]] }) },
  }),
];

// ===================================================================== the crowd

export const CROWD: Affordance<HallView>[] = [
  row({
    id: 'co-op-with-a-stranger', where: { feature: 'cab_scroller' }, pace: 'session',
    needs: ['stat:charm', 'skill:gaming', 'skill:persuasion', 'drive:curiosity'],
    sees: 'A four-player cabinet with an empty stick next to a stranger who is clearly one life from giving up.', stakes: '3nd to join. A friend for an hour, or a stranger who calls her a name.', consequence: 'A regular who knows her face.',
    drives: { curiosity: 0.4, lust: 0.2, pride: 0.2 }, bonus: 0.03, intent: ['Blackbird puts a token in the second slot and a hand on the second stick.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && cash(w) >= 3,
    check: { who: 'regular', pay: 3, parts: [['stat:charm', 0.7], ['gaming', 0.7], ['persuasion', 0.2]], base: 0.417, per: 0.05,
      win: R(['At {hall}, Blackbird joins {npc} on a four-player scroller mid-level and they clear the boss with nine seconds and no words. {npc} buys her a drink with {amount}nd, which she does not refuse.', 'A co-op run at {hall}: {npc} on the left, Blackbird on the right, an ending in the middle. Nobody says it out loud. They both know it was a good one.'], { cash: [4, 14], from: 'who', train: [['gaming', 2], ['persuasion', 1]], affinity: 8, xp: 2, thought: ['I made a friend, and I only had to lose twice.'] }),
      lose: R(['She and {npc} lose to the second boss at {hall} in a way that involves blaming each other. {npc} walks away, still talking to the machine.', 'Blackbird steals the last health pack at {hall} from {npc}, who has more feelings about it than she expected.'], { train: [['gaming', 1]], affinity: -3 }) },
  }),
  row({
    id: 'two-player-flirt', where: { feature: ['cab_brawl', 'cab_scroller', 'cab_sports'] }, each: true, pace: 'session',
    needs: ['skill:romance', 'stat:charm', 'drive:lust', 'skill:gaming'],
    sees: 'A two-player cabinet and a person at the other stick who is not looking at the screen as much as they pretend.', stakes: '3nd to play. A kiss at the end, or an awkward cup of tea.', consequence: 'Somebody has a story that they will tell a friend.',
    drives: { lust: 0.9, pride: 0.3 }, bonus: 0.03, intent: ['Blackbird catches an eye at the other stick and slides in two tokens.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && cash(w) >= 3,
    check: { who: 'regular', pay: 3, parts: ['romance', ['stat:charm', 0.8], ['gaming', 0.3]], base: 0.319, per: 0.05,
      win: R(['At {hall}, Blackbird loses on purpose to {npc} twice, wins the third round by a hair and gets a smile from across the screen. {npc} walks her to the door with a hand at the small of her back, and it is a matter for the camera to look at the ceiling.', 'A two-player game at {hall}: elbows, a shoulder, a hair that falls in the wrong place. By the end, {npc} has forgotten the game and remembered a different one.'], { train: [['romance', 2.5]], affinity: 12, xp: 2, thought: ['Player two has entered the game. Player two is staying.'] }),
      lose: R(['{npc} beats Blackbird at {hall} and then explains how, in detail, over a drink that she has paid for. It is the longest ten minutes of her week.', 'She tries a line at {hall}: "are you a high score? Because I would like to beat you." {npc} considers it for a very long time and then leaves.'], { train: [['romance', 1]], affinity: -3 }) },
  }),
  row({
    id: 'claw-prize-for-someone', where: { feature: 'cab_claw' }, pace: 'session',
    needs: ['skill:romance', 'skill:sleight', 'skill:perception', 'drive:lust'],
    sees: 'A glass box of plush toys, a claw that is barely holding on, and somebody standing next to it looking at the biggest one.', stakes: '5nd a go. A plush LUMINA and a smile, or 20nd of nothing.', consequence: 'The somebody will remember the plush.',
    drives: { lust: 0.8, pride: 0.2 }, bonus: 0.03, intent: ['Blackbird has found a person looking at a claw machine and has decided to be useful.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && cash(w) >= 5,
    check: { who: 'regular', pay: 5, parts: ['romance', ['sleight', 0.7], ['perception', 0.4], ['gaming', 0.3]], base: 0.25, per: 0.05,
      win: R(['At {hall}, on the fourth go, the claw drops onto the biggest Lumi-Bear and holds. It rises slowly and gives {npc} a plush the size of {their} torso. {They} {is} speechless, and then not.', 'She wins the Lumi-Bear for {npc} at {hall} with a flick of the wrist that is mostly luck. {npc} holds it to {their} chest and does not look at the exit.'], { item: 'lumi_plush', train: [['romance', 2], ['sleight', 1.5]], affinity: 12, xp: 3, thought: ['A bear for a heart. Fair trade.', 'Technically I stole it from the claw.'] }),
      lose: R(['The claw at {hall} grabs a plush, shakes, and drops it back with a little disappointed whine. {npc} says "it\'s fine" in the way people say it.', 'Four goes, 20nd, and a claw that sneered. {npc} pats her on the arm like an uncle.'], { train: [['romance', 1]], affinity: 1 }) },
  }),
  row({
    id: 'photo-booth-strip', where: { feature: 'photo_booth' }, pace: 'session',
    needs: ['skill:romance', 'stat:charm', 'drive:lust'],
    sees: 'A booth with a curtain, a stool for two and a slot that spits out four frames of whoever just lost their nerve.', stakes: '3nd, and four frames that someone will keep.', consequence: 'A strip in someone\'s pocket.',
    drives: { lust: 0.7, pride: 0.2 }, bonus: 0.03, intent: ['Blackbird draws the curtain on a photo booth and says "after you".'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && cash(w) >= 3,
    check: { who: 'regular', pay: 3, parts: ['romance', ['stat:charm', 0.7]], base: 0.368, per: 0.05,
      win: R(['Four frames at {hall}: the first a pose, the second a laugh, the third a blur. The fourth, which neither of them mentions, is the only one that is in focus. {npc} puts the strip in {their} wallet.', 'In the booth at {hall}, Blackbird and {npc} make four faces for the camera. The last frame is nothing the camera should have recorded.'], { train: [['romance', 2]], affinity: 10, xp: 2, thought: ['Four frames and I was in focus for one of them. Good ratio.'] }),
      lose: R(['The booth at {hall} gets Blackbird with her eyes shut, then with her mouth open, then with her hand in front, and then with {npc} in a very polite pose. The strip is evidence of something.', '{npc} says the booth is too small. It is, but only for one of them.'], { train: [['romance', 1]], affinity: -2 }) },
  }),
  row({
    id: 'busk-the-tip-jar', where: { feature: 'tip_jar' }, pace: 'session',
    needs: ['skill:vocals', 'skill:guitar', 'skill:beatbox', 'skill:music', 'drive:pride', 'drive:greed'],
    sees: 'A tip jar by the exit with a sign that says SPARE A JOY, and an attract-mode jingle that has a hole where a song should be.', stakes: 'A half-hour of noise that might turn into a crowd.', consequence: 'The room hums the tune for the rest of the night.',
    drives: { pride: 0.7, greed: 0.3 }, bonus: 0.03, intent: ['Blackbird stands by the tip jar and takes a breath.'],
    ok: open,
    check: { parts: [['vocals', 0.5], ['guitar', 0.4], ['beatbox', 0.4], ['music', 0.6], ['stat:charm', 0.3]], base: 0.281, per: 0.06,
      win: R(['By the exit at {hall}, Blackbird sings over the attract jingle and then, for the bridge, under it. The room joins in without being asked. The jar takes {amount}nd and the odd compliment.', 'A cappella at {hall}, beatboxed through the jingle. Fourteen people stop. The jar gains {amount}nd.'], { cash: [8, 36], fame: 0.8, train: [['vocals', 1.5], ['beatbox', 1.5], ['guitar', 1], ['music', 1]], xp: 3, thought: ['I am the real attract mode.'] }),
      lose: R(['She starts a song at {hall} that the jingle makes a hash of. By the end, the jingle has won, and the jar has three buttons in it.', 'Blackbird sings three bars before an attendant asks her, kindly, to wait for the jingle to end. It does not end.'], { train: [['vocals', 0.5]], fame: -0.1 }) },
  }),
  row({
    id: 'jukebox-singalong', where: { feature: 'jukebox' }, pace: 'session',
    needs: ['skill:vocals', 'skill:music', 'skill:guitar', 'drive:pride', 'stat:charm'],
    sees: 'A jukebox full of licensed songs and one handwritten slot that plays what the owner likes.', stakes: '2nd for a song; a sing-along if she is good.', consequence: 'The crowd remembers the voice.',
    drives: { pride: 0.7, lust: 0.2 }, bonus: 0.02, intent: ['Blackbird puts a coin in the jukebox and picks the one with the handwritten slot.'],
    ok: (w, v) => open(w, v) && cash(w) >= 2,
    check: { pay: 2, parts: [['vocals', 0.7], ['music', 0.5], ['guitar', 0.2], ['stat:charm', 0.3]], base: 0.33, per: 0.06,
      win: R(['At {hall}, the jukebox plays the handwritten slot and Blackbird sings along, a half-step off and entirely committed. The room starts to sing, too. A man at the back who has been playing the same cabinet for six hours turns round and joins the harmony.', 'She picks the one song the owner loves and sings it better than the record. {amount}nd lands in the jar by the jukebox. The owner has a tear, and is sniffing at a cabinet.'], { cash: [4, 22], fame: 0.5, train: [['vocals', 2.5], ['music', 1]], xp: 2, affinity: 4, thought: ['A voice like a vending machine, if the vending machine was a great singer.'] }),
      lose: R(['The jukebox at {hall} plays a Muse song with Blackbird singing a different song over it. People are not annoyed. They are interested in what is going on.', 'She forgets the second verse, makes one up, and finds it is worse than the one it replaced.'], { train: [['vocals', 1]] }) },
  }),
  row({
    id: 'beatbox-the-loop', where: { feature: ['lumina_screen', 'cab_rhythm'] }, pace: 'quick',
    needs: ['skill:beatbox', 'skill:music', 'skill:djing', 'drive:pride'],
    sees: 'A four-note jingle that plays every eleven seconds, and a gap in it exactly the size of a drum kit.', stakes: 'Free; a small crowd, or a headache.', consequence: '—',
    drives: { pride: 0.6, curiosity: 0.2 }, bonus: 0.02, intent: ['Blackbird listens to the jingle and starts, quietly, to add a kick.'],
    ok: open,
    check: { parts: ['beatbox', ['music', 0.5], ['djing', 0.3]], base: 0.336, per: 0.06,
      win: R(['At {hall}, Blackbird adds a kick and a snare to the attract jingle and, on the eleventh second, a hi-hat. Four people drift over. A fifth starts to dance. The screen goes on smiling, but a little differently.', 'She beatboxes along to LUMINA\'s jingle. By the fourth loop, it is a remix. By the fifth, a shop-worker is pretending to ignore it, and failing.'], { fame: 0.5, cash: [2, 14], train: [['beatbox', 3], ['djing', 1], ['music', 1]], xp: 2, thought: ['I have added a beat to an AI pop star. She should be grateful.'] }),
      lose: R(['The kick she makes at {hall} comes out as a noise a printer would make in a crisis. A man at the next cabinet says "ssh" without taking his eyes from the screen.', 'The jingle at {hall} wins. It always wins. It is on its twentieth loop of the day and entirely unimpressed.'], { train: [['beatbox', 1]] }) },
  }),
  row({
    id: 'guitar-along', where: { feature: ['cab_rhythm', 'jukebox', 'stage_screen'] }, pace: 'session',
    needs: ['skill:guitar', 'skill:music', 'drive:pride'],
    sees: 'A rhythm cabinet with a plastic guitar on a cable, and a note highway that was designed to be mocked.', stakes: 'A song on the plastic guitar; real chops don\'t count. They count a little.', consequence: '—',
    drives: { pride: 0.6, curiosity: 0.2 }, bonus: 0.02, intent: ['Blackbird takes the plastic guitar and gives it the respect of a real instrument.'],
    ok: (w, v) => open(w, v) && cash(w) >= 4,
    check: { pay: 4, parts: ['guitar', ['music', 0.5], ['gaming', 0.7]], base: 0.33, per: 0.05,
      win: R(['The plastic guitar at {hall} has five coloured buttons and no strings. She plays it like it does. A high-hat ticks over the notes and she finishes with a flourish that earns a nod from the players next door.', 'A rhythm run at {hall} with a toy guitar. Her real chords are in the wrong place, but her real hands know what to do. A new high score for the afternoon.'], { cash: [3, 14], fame: 0.3, train: [['guitar', 2], ['gaming', 1.5], ['music', 1]], xp: 2, thought: ['I am a guitarist. I am a plastic guitarist. I am both.'] }),
      lose: R(['Her real guitar hands go to the wrong strings, which are not there. The screen shows a long red line.', 'Blackbird plays the guitar cabinet at {hall} with total commitment and a score of 11%.'], { train: [['guitar', 1], ['gaming', 0.5]] }) },
  }),
  row({
    id: 'teach-a-newcomer', where: { room: ['lounge', 'floor'], feature: ['couch', 'scoreboard'] }, pace: 'session',
    needs: ['skill:persuasion', 'skill:gaming', 'stat:charm', 'drive:quest'],
    sees: 'A newcomer clutching a token and looking at a cabinet like it is a locked door.', stakes: 'An hour of patience; a friend with a new hobby.', consequence: 'The newcomer owes her one, and goes on to be annoying at the next cabinet.',
    drives: { pride: 0.3, curiosity: 0.2, quest: 0.3 }, bonus: 0.02, intent: ['Blackbird sees a stranger hesitating at a cabinet and has a feeling about the right amount of help.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['persuasion', ['gaming', 0.6], ['stat:charm', 0.4]], base: 0.474, per: 0.05,
      win: R(['At {hall}, Blackbird teaches {npc} to dodge, then to roll, then to hold the button for the long jump. By the end, {npc} has cleared a level and a debt. {amount}nd goes into her hand as a thank-you, and a plastic coin.', '{npc} is an excellent student. By the third lesson at {hall}, {they} {is} beating her. She says it is on purpose.'], { cash: [4, 16], from: 'who', train: [['persuasion', 1.5], ['gaming', 1.5]], affinity: 8, xp: 2, thought: ['I have trained a successor. There can be only one of me. There are now two.'] }),
      lose: R(['Blackbird explains the game at {hall} for eleven minutes and {npc} still presses start. Twice.', '{npc} says "I think I would rather just watch." Blackbird, offended, plays a round against nobody.'], { train: [['persuasion', 0.5]], affinity: -1 }) },
  }),
  row({
    id: 'calm-a-sore-loser', where: {}, pace: 'fight',
    needs: ['drive:bravery', 'skill:melee', 'stat:muscle', 'skill:intimidation'],
    sees: 'A player at a cabinet with a face like a thunderstorm and a fist hovering at the glass.', stakes: 'A word, a hand on a shoulder. Or a scrap, if the word does not work.', consequence: 'Either a friend or an enemy in a lanyard.',
    drives: { bravery: 0.6, pride: 0.3 }, bonus: 0.02, risk: 0.3, intent: ['Blackbird sees a man about to hit a cabinet and decides to be a bouncer.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: [['stat:muscle', 0.7], ['melee', 0.4], ['intimidation', 0.5]], base: 0.463, per: 0.04,
      win: R(['At {hall}, {npc} lifts a fist at a cabinet. Blackbird puts a hand on {their} wrist and says "do not". {npc} looks at the hand, then at her, then at the cabinet, and lowers the fist. {amount}nd goes into the cabinet\'s coin door as an apology.', 'A word, a smile and the offer of a rematch. {npc} sits down on the stool at {hall} like a deflated tyre.'], { cash: [2, 10], from: 'who', train: [['intimidation', 1.5], ['melee', 1]], affinity: 5, fame: 0.2, thought: ['I am a pacifist. I am also a threat. They are not exclusive.'] }),
      lose: R(['The word does not work. {npc} swings at the cabinet, misses and swings at Blackbird. The cabinet, to be fair, survives.', '"Mind your own business," says {npc}, and then, as {they} {is} told it, the business becomes hers.'], { fight: true, train: [['melee', 1]], affinity: -8 }) },
  }),
  row({
    id: 'carve-her-initials', where: { feature: 'trophy_wall' }, pace: 'quick',
    needs: ['drive:pride', 'skill:art', 'drive:quest'],
    sees: 'A wall of dented trophies and a gap where a trophy ought to go.', stakes: 'A pen, a nail, her name. The owner\'s eye.', consequence: 'Her name is on the wall. For now.',
    drives: { pride: 0.8, quest: 0.2 }, bonus: 0.02, intent: ['Blackbird looks at the trophy wall and sees an empty spot with her name on it, in her head.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['art', ['gaming', 0.5]], base: 0.43, per: 0.05,
      win: R(['At {hall}, Blackbird scratches BLK on the trophy wall in a clean hand, below a trophy shaped like a fist. {npc} frowns and then, for some reason, does not wipe it off.', 'Three letters, a small crown and a date. {npc} watches the whole job and does not move.'], { fame: 0.4, train: [['art', 1.5]], xp: 2, affinity: 1, thought: ['A trophy in advance. I am planning for the future.'] }),
      lose: R(['She gets as far as B before {npc} materialises behind her. The wall at {hall} is not for that.', 'The pen is dry. The nail, as it turns out, is not. She has a new, shallow scratch on the wall and a long talking-to.'], { affinity: -3, train: [['art', 0.5]] }) },
  }),
  row({
    id: 'chase-the-record', where: { feature: 'scoreboard' }, pace: 'session',
    needs: ['drive:quest', 'skill:gaming', 'skill:analyze', 'stat:int'],
    sees: 'A board with one number a long way ahead of the rest, and a name next to it that she is going to learn.', stakes: 'A long evening of near-misses; a note on a napkin that says how.', consequence: 'She knows exactly how far she is from the top.',
    drives: { quest: 0.8, pride: 0.4 }, bonus: 0.04, intent: ['Blackbird writes a number on a napkin and underlines it.'],
    ok: (w, v) => open(w, v) && allCabs(w, v.main).some((x) => playable(x)),
    check: { parts: [['gaming', 1], ['analyze', 0.5], ['stat:int', 0.3]], base: 0.375, per: 0.05,
      win: R(['An evening at {hall} spent on one cabinet, one number and one method. By midnight Blackbird has a chart, a theory and a score to go with them. The napkin is full.', 'She works out how the top score at {hall} was set: a trick with the second life. She tries it. It works, once, and the grin she gets from the cabinet is smug.'], { train: [['gaming', 4], ['analyze', 2]], xp: 4, thought: ['A system. A system for hitting a button. I could patent this.'] }),
      lose: R(['An evening of near-misses at {hall}. She writes an even bigger number on the napkin, and then another one, a smaller one, next to it, which is what is left of her.', 'The record at {hall} is exactly as far away as it was. She has just found out how much further it is than that.'], { train: [['gaming', 2]] }) },
  }),
  row({
    id: 'hunt-the-secret-level', where: { feature: CAB_FEATURE_IDS }, each: true, pace: 'session',
    needs: ['drive:curiosity', 'skill:perception', 'skill:gaming', 'stat:int'],
    sees: 'A cabinet that every regular swears has a hidden level and no regular has seen it.', stakes: 'An hour of strange inputs. A level, a code or a headache.', consequence: 'Somebody wants the code.',
    drives: { curiosity: 0.9, pride: 0.2 }, bonus: 0.03, intent: ['Blackbird looks at a cabinet and presses the buttons in an order that she has just invented.'],
    ok: (w, v, f) => open(w, v) && playable(cabAt(w, v, f ?? '')),
    check: { parts: ['gaming', ['perception', 0.7], ['stat:int', 0.4]], base: 0.204, per: 0.05,
      win: R(['At {hall}, a long up, a short left, a sneeze, and the screen goes black. Then it goes gold. A hidden level, a drum roll and a roll of tokens drops into the tray as a congratulation. Nobody else saw it. She is, for the first time in years, certain she is the only one who knows.', 'The secret level at {hall} turns out to be a room with one chest in it, and a message from the programmer. She reads it. She does not tell anyone what it says.'], { item: 'token_roll', train: [['gaming', 3], ['perception', 1.5]], xp: 4, fame: 0.2, thought: ['A secret. Mine. For about a day.', 'Of course there was a secret level. There is always a secret level.'] }),
      lose: R(['An hour of strange inputs at {hall} gets her a screen of coloured snow and a mild feeling of having been laughed at.', 'The cabinet says "NICE TRY!" in a font she does not like.'], { train: [['gaming', 1]] }) },
  }),
  row({
    id: 'rival-grudge-match', where: { situation: 'rival' }, pace: 'session',
    needs: ['drive:pride', 'skill:gaming', 'stat:reflex', 'drive:bravery'],
    sees: 'A crew in matching jackets on the best cabinet, who would like it known that it is theirs.', stakes: 'A 10nd stake on one game against their best.', consequence: 'The crew has an opinion of her.',
    drives: { pride: 0.8, bravery: 0.4 }, bonus: 0.04, intent: ['Blackbird walks up to the crew on the best cabinet and asks for next.'],
    ok: (w, v) => open(w, v) && !!find(v, 'ganger') && cash(w) >= 10,
    check: { who: 'ganger', pay: 10, parts: ['gaming', ['stat:reflex', 0.6], ['perception', 0.3]], base: 0.221, per: 0.05,
      win: R(['At {hall}, the crew\'s best takes first blood. Blackbird wins the next three, in order, with her eyes on the cabinet and not on the crew. {npc} pays {amount}nd in an even voice. The snack table is offered to her.', 'A grudge match at {hall}, to the last life. She takes it, and the stool. The crew claps, slowly, in a way that is also a threat.'], { cash: [20, 60], from: 'who', train: [['gaming', 4]], xp: 4, fame: 0.7, affinity: 2, thought: ['The best cabinet is mine. I have been waiting for this my whole life, or a Tuesday.'] }),
      lose: R(['The crew\'s best takes Blackbird apart at {hall}. {npc} suggests that she come back in a year, in a hat.', 'She loses by one hit. One hit! The crew is not unkind. The crew just hold up one finger, and keep it up.'], { train: [['gaming', 1.5]], affinity: -4 }) },
  }),
  row({
    id: 'arcade-snack-trade', where: { feature: ['vending', 'snack_bar'] }, pace: 'quick',
    needs: ['drive:thirst', 'drive:greed', 'skill:haggling'],
    sees: 'A fizzy drink at 3nd, and a regular who would pay 5 for it right now.', stakes: 'A couple of nd of margin.', consequence: '—',
    drives: { thirst: 0.4, greed: 0.3 }, bonus: 0.02, intent: ['Blackbird looks at a thirsty man and then at a drinks machine and has a thought about the gap.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && cash(w) >= 3,
    check: { who: 'regular', pay: 3, parts: ['haggling', ['stat:charm', 0.3]], base: 0.518, per: 0.04,
      win: R(['A cold fizz at {hall} is worth five to a man in the middle of a world record. {npc} pays {amount}nd and does not look up. She drinks the next one herself.', '{npc} has been on one cabinet for three hours and has not noticed the drink in {their} hand is hers. The sale is a gift to both of them: {amount}nd.'], { cash: [4, 9], from: 'who', hp: 3, train: [['haggling', 1.5]], thought: ['Retail. I was born for retail.'] }),
      lose: R(['The drink at {hall} is warm, flat and, at five nd, an insult. {npc} says so, twice, and sends it back.', 'She tries to sell a can to {npc}, who has one already. Her can goes flat out of embarrassment.'], { train: [['haggling', 0.5]] }) },
  }),
];

export const AFFORD: Affordance<HallView>[] = [...PLAY, ...CONTEST, ...CRAFT, ...CROWD];
