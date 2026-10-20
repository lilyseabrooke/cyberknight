import { type Affordance } from '../affordances';
import { R, banned, find, rate, runCheck, type HubView } from '../hubkit';
import { addParts } from '../bench';
import { type Check } from '../placekit';
import type { World } from '../types';

/**
 * The first half of a hub's affordances: the terminals and the bench (what a hacker does here besides learn), the crowd, the
 * boards and the games. Crime and stealth are in hubcrime.ts; things that depend on today's situation, the wild cards, and
 * the things only certain kinds of hub or trait offer are in hubevents.ts. The syllabus itself (the thing she comes for) is
 * not a row: see hub.ts.
 *
 * Every row says which capability it is for (`needs`) and what that capability *sees* here (`sees`). The list of capabilities is
 * short on purpose (tinkering and INT, the stealth trio, the grifters', a little of intimidation and melee) because this is a
 * focused place; none is required at any hub. Prose is in the report voice with a thought in Blackbird's. Tokens: {hub} {npc}
 * {owner} {pay} {amount} {item} {tip} {lost}; pronouns for {npc} use the usual {they}/{their} tokens.
 */

type RowIn = Omit<Affordance<HubView>, 'place' | 'run'> & { check?: Check; run?: Affordance<HubView>['run'] };
export const row = (a: RowIn): Affordance<HubView> => ({ ...a, place: 'hub', run: a.run ?? ((c, v) => runCheck(c, v, a.id, a.check!)) });
export { R };

export const open = (w: World, v: HubView): boolean => !banned(w, v.main);
const cash = (w: World): number => w.hero.cash;
const hasRate = (w: World, v: HubView): boolean => cash(w) >= rate(v);

/** A row whose check costs an hour at the terminal. */
const hourlyRow = (a: Omit<RowIn, 'run' | 'check'> & { check: Check }): Affordance<HubView> =>
  row({ ...a, ok: (w, v, f) => open(w, v) && hasRate(w, v) && (a.ok?.(w, v, f) ?? true), run: (c, v) => runCheck(c, v, a.id, { ...a.check, pay: rate(v) }) });

// ===================================================================== the terminals and the bench

export const BENCH: Affordance<HubView>[] = [
  hourlyRow({
    id: 'rent-terminal', where: { feature: 'terminal_row' }, pace: 'session',
    needs: ['skill:tinkering', 'stat:int', 'drive:curiosity'],
    sees: 'A row of terminals, each with a timer, and one chair with a better angle than the others.', stakes: 'An hour at the going rate; practice, a little hands-on XP, and sometimes a gig tossed in her direction.', consequence: 'The desk learns her handle.',
    drives: { curiosity: 0.5, pride: 0.2 }, bonus: 0.1, intent: ['Blackbird looks at the row of terminals and finds the one she likes.', 'Blackbird feeds the meter and cracks her knuckles.'],
    check: { who: 'desk', parts: ['tinkering', ['stat:int', 0.6]], base: 0.55, per: 0.06,
      win: R(['{hub}: an hour at the meter and Blackbird finds a way into a thing she was not supposed to. A passer-by drops {amount}nd on the desk for the favour. She does not ask which favour.', 'Blackbird rents a terminal at {hub}. Sixty minutes, one clean exploit and a throwaway job from a stranger. {amount}nd.'], { cash: [6, 34], train: [['tinkering', 3]], xp: 3, thought: ['An hour well spent. I was on fire. Possibly literally.', 'Practice. The cheap kind. The good kind.'] }),
      lose: R(['An hour at {hub} and nothing to show but a headache and a message from the terminal that reads "have you tried not doing that".', 'Blackbird feeds the meter and gets locked out of her own session. The terminal is polite about it. The desk is not.'], { train: [['tinkering', 1]], xp: 1, thought: ['That was a warm-up for the next hour.'] }) },
  }),
  hourlyRow({
    id: 'sandbox-ice', where: { feature: ['terminal_row', 'rack'] }, pace: 'session',
    needs: ['skill:tinkering', 'stat:int', 'drive:bravery'],
    sees: 'A sandbox with black ICE in it, labelled in marker: PLEASE DO NOT.', stakes: 'An hour; real tinkering XP, a shock if it bites.', consequence: 'Her tinkering gets a callus.',
    drives: { bravery: 0.4, curiosity: 0.4, pride: 0.3 }, bonus: 0.05, risk: 0.3,
    check: { parts: ['tinkering', ['stat:int', 0.8]], base: 0.35, per: 0.075,
      win: R(['Blackbird goes up against the sandbox ICE at {hub}. It lasts four minutes. She spends the other fifty-six carving her initials into the log.', 'The sandbox ICE at {hub} is old, mean and well-studied. She beats it in a clean run and then, for fun, does it with one hand.'], { train: [['tinkering', 5]], xp: 5, thought: ['The ICE never stood a chance. Neither did I, but I won anyway.', 'I could do this blindfolded. I tried. Do not ask.'] }),
      lose: R(['The sandbox ICE at {hub} takes her apart in a polite and thorough way. A small shock runs up her arm to the elbow and out the other side.', 'Blackbird loses a staring contest with a block of text. It bites. Her fingers tingle for an hour.'], { hp: -4, train: [['tinkering', 2]], xp: 2, thought: ['It was a training exercise. For it.'] }) },
  }),
  row({
    id: 'fix-rig', where: { feature: ['solder_bench', 'rack'] }, pace: 'session',
    needs: ['skill:tinkering', 'stat:int'],
    sees: 'A dead rig with a note taped to it: REWARD FOR WHOEVER FIXES THIS.', stakes: 'Some hours; a bit of cash from the owner, or smoke.', consequence: 'The owner remembers who fixed it.',
    drives: { greed: 0.3, pride: 0.3, curiosity: 0.2 }, bonus: 0.1, ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['tinkering', ['stat:int', 0.5]], base: 0.45, per: 0.07,
      win: R(['A dead rig on the bench at {hub} and a note taped to it. Blackbird swaps a capacitor, reseats a board and says a short, rude word. It starts. {npc} pays her {amount}nd.', '{npc} watches Blackbird bring a rack back from the dead. "Don\'t tell anyone," {they} say{s}. "I\'ve been telling them it was fine."'], { cash: [25, 75], from: 'owner', train: [['tinkering', 3]], xp: 3, affinity: 3, thought: ['I am a surgeon. For rigs.', 'It was dead. Then it was alive. That is my whole job.'] }),
      lose: R(['The rig at {hub} comes back to life, smokes for a second and dies again. {npc} stares at it, then at her. "It was fine before."', 'Blackbird swaps the wrong capacitor. A small cloud rises from the bench. {npc} puts out a hand for the board and takes it.'], { train: [['tinkering', 1]], affinity: -3, thought: ['That one was already dead. I just made it official.'] }) },
  }),
  row({
    id: 'junk-dive', where: { feature: 'junk_bin' }, pace: 'quick',
    needs: ['skill:scavenging', 'skill:tinkering', 'stat:int'],
    sees: 'A bin of dead chips, bent cables and one very good capacitor.', stakes: 'Twenty minutes in a bin; components, or a cut.', consequence: 'The bin is picked over for a day.',
    drives: { greed: 0.3, curiosity: 0.3 }, bonus: 0.1,
    check: { parts: ['scavenging', ['tinkering', 0.6]], base: 0.55, per: 0.06,
      win: R(['Blackbird goes through the junk bin at {hub} up to her elbows. A handful of boards, a clutch of wire and one capacitor that is still, miraculously, a capacitor.', 'The bin at {hub} turns out to be a goldmine for someone who knows what to look for. She does. She pockets a good half-kilo of parts.'], { train: [['scavenging', 2], ['tinkering', 1]], xp: 2, thought: ['One person\'s junk is my whole afternoon.', 'I am a magpie with a toolbelt.'], apply: (c) => addParts(c.w.hero, { circuits: 2, wiring: 3, scrap: 2 }) }),
      lose: R(['The junk bin at {hub} gives up a cut finger and a smell. That is all.', 'Blackbird digs through the bin and comes up with the sort of thing you do not want on your hands.'], { hp: -1, train: [['scavenging', 1]], thought: ['That is a bin. I have said it out loud.'] }) },
  }),
  row({
    id: 'rig-cat', where: { feature: 'cat_bed' }, pace: 'quick',
    needs: ['drive:curiosity'],
    sees: 'The warmest rack in the room, and a cat who has opinions about it.', stakes: 'A scratch, or a friend.', consequence: 'The cat decides.',
    drives: { curiosity: 0.3 }, bonus: 0,
    check: { parts: ['stat:charm'], base: 0.5, per: 0.05,
      win: R(['The cat at {hub} looks at Blackbird for a long, deciding moment, then gets into her lap. Two other regulars look up with new respect.', 'Blackbird scratches the rig cat under the chin. It purrs on a frequency that makes the nearest rack glitch.'], { affinity: 2, xp: 1, thought: ['I am a cat person. Everyone knew.', 'Even the cat respects me.'] }),
      lose: R(['The rig cat at {hub} swipes her and goes back to the warm rack.', 'Blackbird is looked at, with great calm, by a cat, and loses.'], { hp: -1, thought: ['The cat is wrong.'] }) },
  }),
  row({
    id: 'fuel-up', where: { feature: ['vending_machine', 'noodle_counter'] }, pace: 'quick',
    needs: ['drive:thirst'],
    sees: 'A machine of energy drinks in colours that do not occur in nature, and a noodle pot.', stakes: 'A few nd; a little patch-up.', consequence: 'None.',
    drives: { thirst: 0.3 }, bonus: 0, ok: (w) => cash(w) >= 6 && w.hero.hp < w.hero.maxHp,
    check: { pay: 6, parts: ['stat:int'], base: 0.9, per: 0, lo: 0.9, hi: 0.9,
      win: R(['Blackbird buys a can that is a colour she does not have a word for. Six nd, a fizz, and a brief, glorious clarity.', 'A bowl of noodles at {hub}: six nd, a bowl and a spoon that has seen things. She feels almost human.'], { hp: 4, thought: ['Fuel. For the mind. And the stomach, and the heart.'] }),
      lose: R(['The machine at {hub} eats her six nd and says nothing.'], { thought: ['Capitalism. Even at this level.'] }) },
  }),
];

// ===================================================================== the crowd, the boards, the games

export const CROWD: Affordance<HubView>[] = [
  row({
    id: 'read-board', where: { feature: 'notice_board' }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:analyze', 'drive:curiosity'],
    sees: 'A notice board: gigs, wants, a lost cat and a paper pinned face-down.', stakes: 'A few minutes; a tip about someone with paper, or a lost cat.', consequence: 'A name goes in her head.',
    drives: { curiosity: 0.4, greed: 0.2 }, bonus: 0.05,
    check: { parts: ['streetwise', ['analyze', 0.5]], base: 0.5, per: 0.06,
      win: R(['Blackbird reads the board at {hub} the way other people read a map. A face-down paper catches her eye: {tip}, with a number she would like to be paid. A lost cat gets her {amount}nd.', 'A flyer at {hub}: a gig, a name, a phone number. She pockets the number. The name is {tip}, and there is paper on them.'], { cash: [4, 25], tip: true, train: [['streetwise', 1]], xp: 2, thought: ['Everyone leaves their business on a board. Everyone.'] }),
      lose: R(['The board at {hub} is a wall of other people\'s problems and none of them are hers.', 'Blackbird reads the board for ten minutes and learns how to say "wanted" in four languages.'], { xp: 1, thought: ['Useful. Not today, but useful.'] }) },
  }),
  row({
    id: 'lurk-forum', where: { feature: 'forum_terminal' }, pace: 'session',
    needs: ['skill:analyze', 'skill:perception', 'stat:int', 'drive:curiosity'],
    sees: 'A terminal showing only the house forum, open all night, mostly insults.', stakes: 'An hour of reading between the insults; a tip, or a headache.', consequence: 'Her handle is in a thread.',
    drives: { curiosity: 0.6 }, bonus: 0.05,
    check: { parts: ['analyze', ['perception', 0.5], ['stat:int', 0.5]], base: 0.45, per: 0.07,
      win: R(['Blackbird reads the house forum for an hour and finds the one post in four hundred that matters: {tip}, and what they owe. She files it.', 'The forum at {hub} is a bonfire of opinions. In the ash, a name: {tip}. She remembers it.'], { tip: true, train: [['analyze', 2]], xp: 2, thought: ['The internet is a very large room of people telling me things.', 'I am an expert in reading insults for signal.'] }),
      lose: R(['An hour on the forum at {hub} and the only lesson is that she has strong opinions about tabs.', 'Blackbird reads a thread for forty minutes and the thread turns out to be about spoons.'], { xp: 1, thought: ['I contributed. I just did not post.'] }) },
  }),
  row({
    id: 'haggle-hours', where: { feature: 'membership_desk' }, pace: 'quick',
    needs: ['skill:haggling', 'stat:charm', 'drive:greed'],
    sees: 'A desk with a card reader, a ledger and a rate that has a gap in it the exact shape of a haggle.', stakes: 'A handful of nd back.', consequence: 'The desk gets a bit less friendly each time.',
    drives: { greed: 0.4 }, bonus: 0.05, ok: (w, v) => open(w, v) && !!find(v, 'desk'),
    check: { who: 'desk', parts: ['haggling', ['stat:charm', 0.5]], base: 0.4, per: 0.07,
      win: R(['Blackbird works the desk at {hub} until {npc} finds a loyalty discount that does not, strictly, exist. {amount}nd back across the counter.', '{npc} checks the ledger, checks Blackbird, and refunds her {amount}nd. "Don\'t tell the owner," {they} say{s}. "Obviously I will."'], { cash: [6, 24], train: [['haggling', 2]], xp: 1, affinity: 1, thought: ['Always ask. The worst they say is yes.', 'I get a discount because I am me.'] }),
      lose: R(['{npc} listens to the whole pitch and says "terms apply". Blackbird leaves with a leaflet.', 'The rate at {hub} is the rate. {npc} says so in a voice rubbed smooth.'], { affinity: -2, thought: ['I was building rapport. It is a long game.'] }) },
  }),
  row({
    id: 'charm-the-sysop', where: { feature: ['membership_desk', 'terminal_row'] }, pace: 'quick',
    needs: ['stat:charm', 'skill:persuasion', 'drive:pride'],
    sees: 'A sysop who has not been asked how their day is going in about a year.', stakes: 'Twenty minutes of pleasant noise; the sysop warms (a referral needs that).', consequence: 'Their regard for her goes up.',
    drives: { pride: 0.3, curiosity: 0.2 }, bonus: 0.1, ok: (w, v) => open(w, v) && !!(find(v, 'teacher') ?? find(v, 'owner')),
    check: { who: 'teacher', parts: ['persuasion', ['stat:charm', 0.8]], base: 0.45, per: 0.07,
      win: R(['Blackbird asks {npc} about the rig, the tea, the neighbour. By the end of it {they} are telling her where the good chair is. "You\'re all right," {they} say{s}, as if surprised.', '{npc} thaws, a little at a time. Blackbird leaves with a nod, a mug and the sense that she has been marked, favourably, in a ledger.'], { affinity: 6, train: [['persuasion', 2]], xp: 1, thought: ['I am a delight. I am practically a service.', 'They like me. That is the whole job.'] }),
      lose: R(['{npc} answers in single syllables and returns to the screen.', 'Blackbird tries a joke. The room lets it lie there.'], { affinity: -1, thought: ['Warm-up. It was a warm-up.'] }) },
  }),
  row({
    id: 'tutor-newcomers', where: { feature: 'terminal_row' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:persuasion', 'stat:charm'],
    sees: 'A newcomer with the wrong cable and the right attitude.', stakes: 'An hour; a few nd and a friend.', consequence: 'A regular who thinks well of her.',
    drives: { pride: 0.4, greed: 0.2 }, bonus: 0.05, ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['tinkering', ['persuasion', 0.6]], base: 0.55, per: 0.06,
      win: R(['Blackbird takes {npc} through a first exploit at {hub}. When it works, {they} look at her the way people look at a lighthouse. {npc} presses {amount}nd on her.', 'An hour of helping {npc} get a terminal to say a rude word. Worth {amount}nd, and a warm glow.'], { cash: [8, 40], from: 'who', train: [['tinkering', 2], ['persuasion', 1]], xp: 2, affinity: 4, thought: ['I am a mentor. A natural.', 'Teaching is just showing off with an audience.'] }),
      lose: R(['The lesson at {hub} goes sideways. {npc} learns one thing, and it is not what she was teaching.', 'Blackbird explains the same thing three times, then once more, louder.'], { affinity: -1, xp: 1, thought: ['That is the student\'s fault. I am a delight.'] }) },
  }),
  row({
    id: 'ctf-practice', where: { feature: 'ctf_board' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:calculate', 'stat:int', 'drive:pride'],
    sees: 'A board of challenges with a purse next to each, and a few already scratched out in red.', stakes: 'An hour; a purse, or nothing; and fame if she is first.', consequence: 'Her handle goes on the board.',
    drives: { pride: 0.7, greed: 0.4, bravery: 0.2 }, bonus: 0.15, ok: (w, v) => open(w, v),
    check: { parts: ['tinkering', ['stat:int', 0.6], ['calculate', 0.4]], base: 0.4, per: 0.07,
      win: R(['Blackbird takes the middle challenge on the board at {hub}, leaves the easy ones for the kids and solves it with eleven minutes to spare. {amount}nd and her handle in chalk.', 'The purse on the board at {hub} was nobody\'s idea of easy. Blackbird makes it look like a stretching exercise. {amount}nd.'], { cash: [20, 90], purse: true, fame: 1, train: [['tinkering', 3], ['calculate', 1]], xp: 3, thought: ['First. Obviously.', 'They will be talking about this on the forum. They already are.'] }),
      lose: R(['The challenge at {hub} wins, 1-0. Her handle goes up on the board in the sad part.', 'Blackbird gets four-fifths of the way through the challenge and discovers the last fifth is a trap.'], { train: [['tinkering', 1]], xp: 1, thought: ['I was robbed.', 'The board is clearly biased.'] }) },
  }),
  row({
    id: 'bounty-job', where: { feature: ['ctf_board', 'notice_board'] }, pace: 'session',
    needs: ['skill:tinkering', 'skill:sneak', 'stat:int', 'drive:quest', 'drive:bravery'],
    sees: 'A paper job pinned to the board: a lock, a camera and a fee.', stakes: 'A real job; a purse, or heat.', consequence: 'Whoever posted it knows her handle.',
    drives: { quest: 0.6, greed: 0.4, bravery: 0.3 }, bonus: 0.1, risk: 0.3, ok: (w, v) => open(w, v),
    check: { parts: ['tinkering', ['sneak', 0.5], ['stat:int', 0.5]], base: 0.35, per: 0.07,
      win: R(['Blackbird takes the paper job from the board at {hub}: a camera that needs to be elsewhere for a minute, a lock that needs to be asked nicely. It all goes. {amount}nd, delivered in an envelope by a person who does not look at her.', 'The job on the board pays {amount}nd and asks for no name. She finishes it in an evening and leaves it on the desk.'], { cash: [40, 140], fame: 1, train: [['tinkering', 2], ['sneak', 2]], xp: 4, thought: ['A job. Paid. Anonymous. Heroic, in its way.'] }),
      lose: R(['The job on the board goes wrong in the third minute. She walks away with a sore wrist and a story she will tell wrongly.', 'Blackbird botches the paper job and spends the evening in a doorway pretending to be a statue.'], { hp: -3, heat: ['npd', 1], train: [['sneak', 1]], xp: 1, thought: ['The board did not say it would be that hard.'] }) },
  }),
  row({
    id: 'read-the-feeds', where: { feature: ['crt_wall', 'scoreboard'] }, pace: 'quick',
    needs: ['skill:analyze', 'skill:calculate', 'stat:int'],
    sees: 'A wall of mismatched monitors, each on a different feed, and a pattern only some people see.', stakes: 'A quarter hour; a trade, a tip.', consequence: 'None.',
    drives: { curiosity: 0.4, greed: 0.2 }, bonus: 0.05,
    check: { parts: ['analyze', ['calculate', 0.6], ['stat:int', 0.4]], base: 0.45, per: 0.07,
      win: R(['Blackbird watches the wall at {hub} until the pattern pops: a delivery that is never on time, a guard who always looks left. She puts it on a napkin, and the napkin is worth {amount}nd.', 'Eight monitors, nine feeds, one repeating blip. Blackbird reads it as a schedule and sells the schedule for {amount}nd.'], { cash: [10, 55], train: [['analyze', 2], ['calculate', 1]], xp: 2, thought: ['I see patterns. It is a gift. It is also a curse.', 'It is all connected. Mostly by tape.'] }),
      lose: R(['The wall at {hub} shows her eight versions of the same wet alley.', 'Blackbird stares at the monitors for half an hour and develops a theory about pigeons.'], { xp: 1, thought: ['Pigeons. It is always pigeons.'] }) },
  }),
  row({
    id: 'climb-the-board', where: { feature: ['scoreboard', 'hall_of_fame'] }, pace: 'session',
    needs: ['skill:tinkering', 'stat:int', 'drive:pride'],
    sees: 'A scoreboard of handles and numbers, and a hall of fame with a vacancy at the top.', stakes: 'An evening; her handle on the wall.', consequence: 'A line in the hall of fame, until someone does better.',
    drives: { pride: 0.9, quest: 0.3 }, bonus: 0.1,
    check: { parts: ['tinkering', ['stat:int', 0.6], ['calculate', 0.4]], base: 0.3, per: 0.07,
      win: R(['Blackbird spends an evening at {hub} and ends it with her handle in the top ten and a small crowd behind her chair. Someone takes a photograph of the screen.', 'The board at {hub} has a number at the top that has not moved in a year. Blackbird moves it.'], { fame: 2, train: [['tinkering', 3]], xp: 4, thought: ['They will put up a plaque. They had better.', 'I am the number one. Of a very specific kind of thing.'] }),
      lose: R(['The board at {hub} does not move. Neither does she. After four hours, only one of them is allowed to be proud of that.', 'Blackbird reaches the number-eleven slot and gets a pat on the back. It is worse than nothing.'], { train: [['tinkering', 1]], xp: 1, thought: ['Eleventh. That is a very respectable place to be mean about.'] }) },
  }),
  row({
    id: 'arcade-run', where: { feature: ['arcade_cab', 'pinball'] }, pace: 'quick',
    needs: ['stat:reflex', 'drive:pride', 'drive:greed'],
    sees: 'A cabinet with a high-score table nobody beats and everybody pays to try.', stakes: 'A coin or two; a prize payout, a name on the table.', consequence: 'Her initials, three letters.',
    drives: { pride: 0.5, greed: 0.2, thirst: 0.1 }, bonus: 0.05, ok: (w) => cash(w) >= 2,
    check: { pay: 2, parts: ['stat:reflex'], base: 0.35, per: 0.07,
      win: R(['Blackbird takes the cabinet at {hub} for two coins and ends with three letters at the top. The attendant pays out {amount}nd in tokens and looks at the machine with suspicion.', 'A pinball run at {hub} that ends with the table tilting in her favour. {amount}nd, and a round of applause from four people who were not looking.'], { cash: [4, 40], fame: 1, xp: 1, thought: ['The machine and I understood each other.', 'Three letters. They will remember them.'] }),
      lose: R(['Blackbird loses a ball at {hub}, then another, then a coin.', 'The arcade cabinet eats her last life. She says something about it that is not in the manual.'], { thought: ['It was cheating. It is a machine. Machines cheat.'] }) },
  }),
];

// ===================================================================== gossip

export const GOSSIP: Affordance<HubView>[] = [
  row({
    id: 'listen-in', where: {}, pace: 'quick',
    needs: ['skill:perception', 'skill:streetwise', 'drive:curiosity'],
    sees: 'Six people who are all pretending not to listen to each other.', stakes: 'A coffee; a tip about someone with paper.', consequence: 'Nothing, unless she is caught.',
    drives: { curiosity: 0.4 }, bonus: 0, ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['perception', ['streetwise', 0.6]], base: 0.45, per: 0.07,
      win: R(['Blackbird nurses a tea at {hub} and listens. {npc} is telling someone about {tip}, and what they would pay to see them go quiet.', 'A conversation two chairs over at {hub} drifts into a name: {tip}. The tea has gone cold. It was worth it.'], { tip: true, train: [['perception', 1], ['streetwise', 1]], xp: 2, thought: ['Walls have ears. I have better ones.'] }),
      lose: R(['The tea at {hub} is hot and the gossip is about someone else\'s cousin.', '{npc} notices her listening and starts talking about cats, very loudly.'], { xp: 1, thought: ['I know a lot about cats now.'] }) },
  }),
  row({
    id: 'buy-a-round', where: {}, pace: 'quick',
    needs: ['stat:charm', 'skill:streetwise', 'drive:greed'],
    sees: 'A crowd that can be bought, a cup at a time.', stakes: 'A round of tea; goodwill, and something said over it.', consequence: 'Regulars warm.',
    drives: { pride: 0.3 }, bonus: 0, ok: (w, v) => open(w, v) && cash(w) >= 15 && !!find(v, 'regular'),
    check: { who: 'regular', pay: 15, parts: ['streetwise', ['stat:charm', 0.6]], base: 0.55, per: 0.06,
      win: R(['A round of tea at {hub}: 15nd. {npc} spends the next quarter hour telling her what everyone is up to and who they owe. She hears about {tip}.', 'Blackbird buys the room a tea. The whole room, a notable gesture. {npc} leans over and tells her exactly who she should not trust.'], { tip: true, affinity: 4, train: [['streetwise', 1]], xp: 1, thought: ['Generosity pays. Rarely in the way you expect.'] }),
      lose: R(['The round at {hub} goes down well and the room thanks her, with sincerity and no information.', 'Blackbird buys a round and learns the tea is not as bad as everyone says. That is all.'], { affinity: 1, thought: ['It is the thought that counts. Not the tea.'] }) },
  }),
  row({
    id: 'swap-rumours', where: { variant: 'exchange' }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:haggling', 'drive:curiosity'],
    sees: 'A crowd that pays in what it knows, per ounce.', stakes: 'A rumour for a rumour; a tip.', consequence: 'Someone owes her one.',
    drives: { curiosity: 0.4, greed: 0.2 }, bonus: 0.05, ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['streetwise', ['haggling', 0.5]], base: 0.5, per: 0.07,
      win: R(['At {hub} nobody asks for money. {npc} gives her {tip} for a rumour she half-invented. The trade is fair, in the way barter always is.', 'Blackbird trades a secret she overheard for another at {hub}. {npc} nods slowly. "That\'ll do." The new one is about {tip}.'], { tip: true, affinity: 2, train: [['streetwise', 2]], xp: 2, thought: ['Information is the one currency that grows when you spend it.'] }),
      lose: R(['The trade at {hub} goes nowhere: she offers a rumour and {npc} already knew it.', 'Blackbird gives away a secret for nothing. {npc} is quite pleased.'], { xp: 1, thought: ['I invested in goodwill.'] }) },
  }),
];
