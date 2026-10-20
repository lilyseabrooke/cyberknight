import { type Affordance } from '../affordances';
import { R, banned, find, rowFor, type VenueView } from '../venuekit';
import type { World } from '../types';
import type { PlaceView } from '../placekit';
import { genInstrument } from '../instruments';
import { acquire } from '../combat';

/**
 * The first half of a cutting room's rows: the floor, the bar and the crowd (what she does here besides fight it out on a
 * stage), the book, the hustle and the crime. Situations, wild cards and the kinds of room are in cuttingevents.ts. The bouts
 * themselves are not rows: see cutting.ts.
 *
 * Tokens: {venue} {npc} {owner} {pay} {amount} {item} {tip} {lost}; pronouns for {npc} use {they}/{their}.
 */

export const row = rowFor('cutting');
export const open = (w: World, v: VenueView): boolean => !banned(w, v.main);

/** The house champion is not at their best tonight: a tell spotted, a valve loosened, a lullaby in the firmware. */
export function weakenChamp(pv: PlaceView, by: number, mult = 1): void {
  const v = pv as VenueView;
  if (!v.info?.keep) return;
  v.info.keep = { ...v.info.keep, champ: Math.max(5, Math.round(Number(v.info.keep.champ ?? 30) * mult) - by) };
}

const FLOOR: Affordance<VenueView>[] = [
  row({
    id: 'mosh', where: { feature: 'mosh_pit' }, pace: 'session',
    needs: ['stat:muscle', 'skill:athletics', 'drive:bravery'],
    sees: 'A bowl worn into the floor by years of people throwing themselves at each other on purpose.', stakes: 'Ten minutes in the pit: a little health and a lot of joy, or an elbow.', consequence: 'She is sore, and happy.',
    drives: { bravery: 0.5, thirst: 0.2 }, bonus: 0.1,
    check: { parts: ['stat:muscle', ['athletics', 0.6]], base: 0.55, per: 0.05, physical: true,
      win: R(['Blackbird goes into the pit at {venue} and comes out ten minutes later with a split lip, no shoes and the biggest smile in the room.', 'The pit at {venue} picks Blackbird up, passes her round twice and puts her down by the bar. She orders a drink with both hands.'], { sore: 0.1, xp: 2, train: [['athletics', 2]], thought: ['That was a hug with fists in it.', 'Therapy. Loud, sweaty therapy.'] }),
      lose: R(['An elbow in the pit at {venue} catches Blackbird under the eye. She sees the next round through a halo.', 'Blackbird goes into the pit at {venue} and is spat out the other side, lighter by a shoe.'], { hp: -4, sore: 0.15, thought: ['The pit is a place of growth. And bruises.'] }) },
  }),
  row({
    id: 'stage-dive', where: { feature: ['twin_stages', 'bus_stage', 'diving_boards', 'mosh_pit'] }, pace: 'quick',
    needs: ['skill:athletics', 'stat:reflex', 'drive:pride'],
    sees: 'A stage, a crowd and three metres of air between them.', stakes: 'A dive: fame and a crowd that carries her, or the floor.', consequence: 'Somebody filmed it.',
    drives: { pride: 0.6, bravery: 0.5 }, bonus: 0.05, risk: 0.3,
    check: { parts: ['athletics', ['stat:reflex', 0.6]], base: 0.45, per: 0.06, physical: true,
      win: R(['Blackbird dives off the stage at {venue}, arms out, and the crowd catches her like it was the plan all along. They carry her to the bar.'], { fame: 0.8, train: [['athletics', 2]], thought: ['They caught me. They love me. Both are true.'] }),
      lose: R(['Blackbird dives off the stage at {venue}. The crowd parts, politely, like a curtain.'], { hp: -6, hurt: 0.2, thought: ['The crowd made a choice. The wrong one.'] }) },
  }),
  row({
    id: 'warm-up', where: {}, pace: 'quick',
    needs: ['skill:guitar', 'skill:music', 'drive:curiosity'],
    sees: 'A corner by the side of the stage where everybody warms up and pretends not to listen to everybody else.', stakes: 'Twenty minutes of practice: XP, and a look at what the competition is doing.', consequence: 'She knows who is good tonight.',
    drives: { curiosity: 0.4, pride: 0.2 }, bonus: 0.1,
    check: { parts: ['guitar', ['music', 0.5], ['perception', 0.3]], base: 0.6, per: 0.04,
      win: R(['Blackbird warms up in the corner at {venue} and listens to the challengers do the same. One of them has a trick with the thumb. She has it too, now.'], { train: [['guitar', 3], ['music', 1]], xp: 1, thought: ['Warm up, listen, steal. The holy trinity.'] }),
      lose: R(['Blackbird warms up at {venue} next to someone so good she stops warming up.'], { train: [['guitar', 1]], thought: ['I am saving it for the stage.'] }) },
  }),
  row({
    id: 'study-champion', where: {}, pace: 'quick',
    needs: ['skill:analyze', 'skill:perception', 'stat:int'],
    sees: 'The house champion on the bar stool, and a habit with the left hand nobody has noticed.', stakes: 'A long look: the champion\'s tell (her next title bout is easier), or nothing.', consequence: 'She knows how the champion plays.',
    drives: { curiosity: 0.6, pride: 0.3 }, bonus: 0.1, ok: (w, v) => !!find(v, 'tag:champion'),
    check: { who: 'tag:champion', parts: ['analyze', ['perception', 0.6], ['stat:int', 0.4]], base: 0.4, per: 0.06,
      win: R(['Blackbird watches {npc} for twenty minutes. {They} always go{es} up the neck before a shred. Always. She files it away.', 'Blackbird notices {npc} at {venue} taps {their} foot a bar before the big move. That is all she needs.'], { apply: (c, v) => weakenChamp(v, 4), train: [['analyze', 2], ['perception', 2]], thought: ['Everybody has a tell. Mine is genius.'] }),
      lose: R(['Blackbird stares at {npc} for so long that {npc} buys her a drink to make it stop.'], { thought: ['Free drink. Intelligence-gathering successful, in a way.'] }) },
  }),
  row({
    id: 'judge-the-judges', where: { feature: ['judges_desk', 'chalkboard', 'hymn_board', 'scoreboard'] }, pace: 'quick',
    needs: ['skill:calculate', 'skill:analyze', 'drive:curiosity'],
    sees: 'A scoring system, and a pattern in it that the house would prefer nobody saw.', stakes: 'Work out how the room scores: a bet that cannot lose, once.', consequence: 'She knows the system.',
    drives: { curiosity: 0.5, greed: 0.4 }, bonus: 0.05,
    check: { parts: ['calculate', ['analyze', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird watches three bouts at {venue} and works it out: the judge always gives the round to whoever is louder in the last ten seconds. She bets accordingly and wins {amount}nd.'], { cash: [20, 80], train: [['calculate', 3]], thought: ['Music is maths. Betting is also maths. I am good at maths.'] }),
      lose: R(['Blackbird\'s theory of how {venue} scores bouts lasts until the next bout.'], { loseCash: [5, 20], thought: ['The judge is random. That is a system too.'] }) },
  }),
  row({
    id: 'sound-desk', where: { feature: 'sound_desk' }, pace: 'session',
    needs: ['skill:djing', 'skill:tinkering', 'stat:int'],
    sees: 'A sound desk with a man at it who decides who is loud, and needs a break.', stakes: 'An hour on the desk: the sound man\'s wage, and a lot of power over everyone else\'s night.', consequence: 'The house sound is hers for an hour.',
    drives: { curiosity: 0.4, greed: 0.3, pride: 0.2 }, bonus: 0.05,
    check: { who: 'staff', parts: ['djing', ['tinkering', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird runs the sound desk at {venue} for an hour while the sound man eats. Every bout sounds better. {amount}nd.'], { cash: [15, 45], train: [['djing', 3], ['tinkering', 1]], thought: ['I controlled every decibel in the room. Absolute power.'] }),
      lose: R(['Blackbird runs the sound at {venue} and feeds back so loudly the champion drops a pick.'], { affinity: -3, thought: ['That was a sound check. A long one.'] }) },
  }),
  row({
    id: 'tend-bar', where: { feature: 'bar_counter' }, pace: 'session',
    needs: ['skill:mixology', 'skill:tolerance', 'drive:greed'],
    sees: 'A bar three deep between bouts and one bartender who looks close to tears.', stakes: 'An hour behind the bar: tips, gossip and a free one.', consequence: 'The staff like her.',
    drives: { greed: 0.4, thirst: 0.4 }, bonus: 0.05,
    check: { who: 'staff', parts: ['mixology', ['tolerance', 0.3]], base: 0.5, per: 0.05,
      win: R(['Blackbird jumps the bar at {venue} and pours for an hour. The tips come in coins and compliments: {amount}nd and a story about the champion\'s divorce.'], { cash: [15, 50], drunk: 1, affinity: 4, train: [['mixology', 3]], thought: ['A bartender with a guitar. The ideal woman.'] }),
      lose: R(['Blackbird pours a round at {venue} that is half foam and half regret.'], { drunk: 1, thought: ['Foam is a garnish.'] }) },
  }),
  row({
    id: 'drink-with-losers', where: { feature: 'bar_counter' }, pace: 'quick',
    needs: ['skill:tolerance', 'stat:charm', 'drive:thirst'],
    sees: 'A row of people at the bar who lost tonight, and would like to talk about it.', stakes: 'A round with the beaten: gossip, a tip, a hangover.', consequence: 'The losers think she\'s all right.',
    drives: { thirst: 0.5, curiosity: 0.3 }, bonus: 0.1,
    check: { who: 'regular', parts: ['tolerance', ['stat:charm', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird drinks with the night\'s losers at {venue}. By the third round {npc} has told her about {tip}.'], { tip: true, drunk: 2, affinity: 4, train: [['tolerance', 2]], thought: ['Losers know everything. They have the time.'] }),
      lose: R(['Blackbird drinks with the losers at {venue} until she is one of them.'], { drunk: 3, thought: ['Solidarity.'] }) },
  }),
  row({
    id: 'merch-hustle', where: { feature: 'merch_table' }, pace: 'session',
    needs: ['skill:hustling', 'skill:haggling', 'drive:greed'],
    sees: 'A merch table of T-shirts of bands that lost, at a discount, and nobody minding it.', stakes: 'An hour selling: a cut, or a pile of unsold T-shirts.', consequence: 'Half the room is wearing a loser\'s shirt.',
    drives: { greed: 0.6 }, bonus: 0.05,
    check: { parts: ['hustling', ['haggling', 0.6], ['stat:charm', 0.3]], base: 0.45, per: 0.06,
      win: R(['Blackbird sells forty T-shirts of a band that lost at {venue}, mostly by telling people the band is about to be huge. {amount}nd.'], { cash: [20, 70], train: [['hustling', 3], ['haggling', 1]], thought: ['I sold hope. In medium.'] }),
      lose: R(['Blackbird spends an hour at the merch table at {venue} and sells one T-shirt, to herself.'], { loseCash: [5, 10], thought: ['It is a good shirt.'] }) },
  }),
  row({
    id: 'names-wall', where: { feature: 'names_wall' }, pace: 'quick',
    needs: ['skill:perception', 'skill:art', 'drive:pride'],
    sees: 'A wall of champions\' names painted over each other, layer on layer, and somewhere underneath, possibly hers.', stakes: 'A look at the layers: her name from a past life, a fact, a little pride.', consequence: 'She knows who held the title before.',
    drives: { pride: 0.5, curiosity: 0.5 }, bonus: 0.05,
    check: { parts: ['perception', ['art', 0.4]], base: 0.5, per: 0.05,
      win: R(['Under four coats of paint on the wall at {venue}, Blackbird finds a name she knows: hers, in a hand she doesn\'t. A previous Blackbird held this room. She touches up the letters.'], { fame: 0.5, train: [['art', 2], ['perception', 1]], thought: ['I was here before. I was the champion. I am the champion in principle.'] }),
      lose: R(['The wall at {venue} is so layered it is mostly a texture now.'], { thought: ['History is just paint on paint.'] }) },
  }),
  row({
    id: 'jukebox', where: { feature: 'jukebox' }, pace: 'quick',
    needs: ['skill:music', 'skill:tinkering', 'drive:curiosity'],
    sees: 'A jukebox full of people who won here, and one slot that plays something nobody chose.', stakes: 'Put her own song on, or find what the jukebox is hiding.', consequence: 'The room hears her.',
    drives: { curiosity: 0.5, pride: 0.4 }, bonus: 0.05,
    check: { parts: ['music', ['tinkering', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird opens up the jukebox at {venue} and finds a tape of the night the room opened. She plays it. The old regulars put their drinks down.', 'Blackbird gets one of her own songs onto the jukebox at {venue}. It comes on between bouts and three people ask who it is.'], { fame: 0.6, train: [['music', 2]], thought: ['The jukebox and I have an understanding.'] }),
      lose: R(['The jukebox at {venue} eats her coin and plays the same LUMINA single it always plays.'], { loseCash: [1, 2], thought: ['LUMINA is in everything. Even the jukeboxes.'] }) },
  }),
  row({
    id: 'noodles', where: { feature: ['noodle_cart', 'bar_counter'] }, pace: 'quick',
    needs: ['skill:cooking', 'drive:thirst'],
    sees: 'Something hot between rounds, at a price that is mostly a mark-up.', stakes: 'A bowl of something: health back, a few nd gone.', consequence: 'Fed.',
    drives: { thirst: 0.5 }, bonus: 0, ok: (w) => w.hero.cash >= 8 && w.hero.hp < w.hero.maxHp * 0.9,
    check: { pay: [5, 8], parts: ['cooking'], base: 0.8, per: 0.02,
      win: R(['Blackbird eats a bowl of noodles between bouts at {venue} for {pay}nd. It is too hot and exactly right.'], { hp: 8, thought: ['Fuel. Musical fuel.'] }),
      lose: R(['The noodles at {venue} are lukewarm and possibly not noodles. {pay}nd.'], { hp: 3, thought: ['Protein. Some kind.'] }) },
  }),
];

const CROWD: Affordance<VenueView>[] = [
  row({
    id: 'work-the-crowd', where: {}, pace: 'session',
    needs: ['stat:charm', 'skill:speaking', 'drive:pride'],
    sees: 'A crowd that came to pick a side and has not picked one yet.', stakes: 'An hour making friends: fans, and the crowd on her side next bout.', consequence: 'The room leans her way.',
    drives: { pride: 0.6, curiosity: 0.2 }, bonus: 0.1,
    check: { who: 'regular', parts: ['stat:charm', ['speaking', 0.6]], base: 0.45, per: 0.06,
      win: R(['Blackbird works the crowd at {venue}, one table at a time, a joke and a handshake each. By the end of the hour they are chanting her name before she has played a note.'], { apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 4; }, fame: 0.6, train: [['speaking', 2]], thought: ['I am a politician of the stage.'] }),
      lose: R(['Blackbird tries to make friends at {venue}. The crowd has already picked the champion.'], { thought: ['They will come round. Everyone does.'] }) },
  }),
  row({
    id: 'flirt-in-crowd', where: {}, pace: 'session',
    needs: ['skill:romance', 'stat:charm', 'drive:lust'],
    sees: 'Somebody in the crowd who cheered a bit too loudly when she walked in.', stakes: 'A flirt between bouts: a kiss, a friend, or a polite no.', consequence: 'Someone in the room is on her side, privately.',
    drives: { lust: 0.6, pride: 0.2 }, bonus: 0.05,
    check: { who: 'fair', parts: ['romance', ['stat:charm', 0.7]], base: 0.4, per: 0.06,
      win: R(['Blackbird finds {npc} in the crowd at {venue} and makes {them} laugh so hard {they} spill{s} {their} drink on the judge.'], { affinity: 10, train: [['romance', 3]], thought: ['A fan of mine. The best kind.'] }),
      lose: R(['{npc} at {venue} was cheering for the champion.'], { affinity: -2, thought: ['Bad taste. In champions.'] }) },
  }),
  row({
    id: 'sign-shirts', where: {}, pace: 'quick',
    needs: ['drive:pride', 'stat:charm'],
    sees: 'Somebody holding out a pen and a forearm.', stakes: 'An autograph: a fan for good.', consequence: 'A fan, here.',
    drives: { pride: 0.7 }, bonus: 0.1, ok: (w) => (w.legacy.fame ?? 0) + w.hero.fame >= 15,
    check: { who: 'regular', parts: ['stat:charm'], base: 0.7, per: 0.03,
      win: R(['{npc} at {venue} holds out a forearm and a pen. Blackbird signs it, with a heart, which she has never done before and will never admit to.'], { fame: 0.4, apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 2; }, thought: ['Ink. On a fan. Permanent, if they are lucky.'] }),
      lose: R(['{npc} at {venue} asks Blackbird to sign something "for the champion". She does not.'], { thought: ['Wrong champion.'] }) },
  }),
  row({
    id: 'talk-trash', where: {}, pace: 'quick',
    needs: ['skill:intimidation', 'skill:speaking', 'drive:pride'],
    sees: 'A challenger with a thin skin and a loud friend.', stakes: 'Trash talk: rattle a challenger (they play worse), or start a fight.', consequence: 'A rival.',
    drives: { pride: 0.6, bravery: 0.3 }, bonus: 0.05, risk: 0.2,
    check: { who: 'tag:challenger', parts: ['intimidation', ['speaking', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird tells {npc} at {venue} exactly what she is going to do to {them} on stage. {npc} goes very quiet and tunes the same string four times.'], { affinity: -6, train: [['intimidation', 2], ['speaking', 1]], thought: ['A psychological victory. The best kind.'] }),
      lose: R(['Blackbird trash-talks {npc} at {venue}. {npc}\'s answer is funnier. The crowd repeats it all night.'], { affinity: -4, thought: ['They had a writer.'] }) },
  }),
  row({
    id: 'befriend-champion', where: {}, pace: 'session',
    needs: ['stat:charm', 'skill:persuasion', 'drive:curiosity'],
    sees: 'A champion who is lonely at the top of a very small mountain.', stakes: 'A drink with the champion: a friend, or a rival who knows her better.', consequence: 'The champion likes her.',
    drives: { curiosity: 0.6, lust: 0.2 }, bonus: 0.05, ok: (w, v) => !!find(v, 'tag:champion'),
    check: { who: 'tag:champion', parts: ['stat:charm', ['persuasion', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird buys {npc} a drink at {venue}. They talk till closing about strings, heartbreak and a guitarist they both hated. {npc} shows her one trick, as a gift.'], { affinity: 12, train: [['guitar', 3]], thought: ['A rival I like. Rare. Dangerous.'] }),
      lose: R(['{npc} at {venue} accepts the drink and says nothing at all.'], { affinity: 2, thought: ['The strong silent type. The rude type.'] }) },
  }),
  row({
    id: 'run-a-book', where: { feature: ['chalkboard', 'card_table', 'collection_plate', 'confessional'] }, pace: 'session',
    needs: ['skill:calculate', 'skill:cards', 'drive:greed'],
    sees: 'Odds on a chalkboard, money changing hands, and nobody running it properly.', stakes: 'Run a book on the night\'s bouts: a cut of every bet, or a crowd that wants its money back.', consequence: 'She is the house, for a night.',
    drives: { greed: 0.7 }, bonus: 0.1,
    check: { parts: ['calculate', ['cards', 0.6], ['streetwise', 0.3]], base: 0.4, per: 0.06,
      win: R(['Blackbird takes bets on every bout at {venue} and balances the book so well she wins whoever wins. {amount}nd.'], { cash: [30, 110], purse: true, train: [['calculate', 3], ['cards', 2]], thought: ['The house always wins. I am the house.'] }),
      lose: R(['An outsider wins at {venue}, and Blackbird\'s book pays out {lost}nd she did not have.'], { loseCash: [20, 70], thought: ['That was statistically unlikely. Statistics lied.'] }) },
  }),
  row({
    id: 'card-game', where: { feature: 'card_table' }, pace: 'session',
    needs: ['skill:cards', 'skill:grifting', 'drive:greed'],
    sees: 'A card table where the losers play for the money they lost.', stakes: 'A few hands: their money, or hers.', consequence: 'The table remembers her.',
    drives: { greed: 0.6 }, bonus: 0.05,
    check: { who: 'regular', parts: ['cards', ['grifting', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird sits down at the losers\' table at {venue} and takes {amount}nd off them in an hour. It is, she reflects, a kindness: now they have a reason to practise.'], { cash: [20, 80], from: 'who', train: [['cards', 3]], thought: ['They lost twice tonight. I am thorough.'] }),
      lose: R(['The losers at {venue} are, it turns out, very good at cards. {lost}nd.'], { loseCash: [15, 50], thought: ['They have had a lot of practice at losing. Not tonight.'] }) },
  }),
];

const CRIME: Affordance<VenueView>[] = [
  row({
    id: 'sabotage-amp', where: {}, pace: 'quick',
    needs: ['skill:tinkering', 'skill:sneak', 'drive:greed'],
    sees: 'The champion\'s amp, unattended, with its back panel held on by one screw.', stakes: 'A loose valve in the champion\'s amp (the champion plays worse), or caught with a screwdriver.', consequence: 'The champion is not at their best tonight.',
    drives: { greed: 0.3, bravery: 0.4 }, bonus: 0, risk: 0.35, ok: (w, v) => !!find(v, 'tag:champion'),
    check: { parts: ['tinkering', ['sneak', 0.7]], base: 0.35, per: 0.06,
      win: R(['Blackbird loosens a valve in the champion\'s amp at {venue} on her way back from the toilet. It will last exactly one bout.'], { apply: (c, v) => weakenChamp(v, 8), train: [['tinkering', 2], ['sneak', 2]], thought: ['A technical adjustment. In my favour.'] }),
      lose: R(['The champion at {venue} catches Blackbird behind {their} amp with a screwdriver. The bouncer catches her a second later.'], { heat: ['place', 2], affinity: -15, fight: true, thought: ['I was fixing it. Aggressively.'] }) },
  }),
  row({
    id: 'lift-from-wall', where: { feature: 'names_wall', trait: 'wager_guitars' }, pace: 'session',
    needs: ['skill:sneak', 'skill:sleight', 'drive:greed'],
    sees: 'The losers\' guitars on the wall behind the bar, and one of them is good.', stakes: 'A guitar off the wall, or the whole bar turning round.', consequence: 'A gap on the wall.',
    drives: { greed: 0.7, bravery: 0.3 }, bonus: 0.05, risk: 0.4,
    check: { parts: ['sneak', ['sleight', 0.6]], base: 0.3, per: 0.06, dark: 0.15,
      win: R(['Blackbird takes a guitar off the losers\' wall at {venue} while the room watches a bout. It is a good one, and nobody notices the gap until morning.'], { apply: (c, v) => { const g = genInstrument(c.rng.fork(`wall:${v.main.id}`), Math.min(9, (v as VenueView).info.tier + 1)); acquire(c, g); }, train: [['sneak', 2], ['sleight', 2]], thought: ['It was lonely on the wall.'] }),
      lose: R(['Blackbird reaches for a guitar on the wall at {venue} and the whole row comes down like a xylophone.'], { heat: ['place', 2], fight: true, thought: ['That was a performance.'] }) },
  }),
  row({
    id: 'pick-the-crowd', where: {}, pace: 'quick',
    needs: ['skill:sleight', 'stat:reflex', 'drive:greed'],
    sees: 'A crowd with its eyes on the stage and its wallets in back pockets.', stakes: 'A wallet, or a scene.', consequence: 'Somebody is short.',
    drives: { greed: 0.6 }, bonus: 0, risk: 0.25,
    check: { who: 'regular', parts: ['sleight', ['stat:reflex', 0.5]], base: 0.45, per: 0.06,
      win: R(['During the final round at {venue}, Blackbird lifts {amount}nd off {npc}, who is too busy screaming to notice.'], { cash: [10, 60], from: 'who', train: [['sleight', 2]], thought: ['A bout of my own.'] }),
      lose: R(['{npc} at {venue} grabs Blackbird\'s wrist mid-lift and shouts for the bouncer.'], { affinity: -15, fight: true, thought: ['Some people have no rhythm.'] }) },
  }),
  row({
    id: 'rob-the-tin', where: {}, pace: 'session',
    needs: ['skill:lockpicking', 'skill:sneak', 'drive:greed'],
    sees: 'The entry tin, under the host\'s desk, heavy with the night.', stakes: 'The whole night\'s takings, or the whole room after her.', consequence: 'The host has a grudge for life.',
    drives: { greed: 0.8, bravery: 0.4 }, bonus: 0, risk: 0.5, ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { parts: ['lockpicking', ['sneak', 0.6]], base: 0.25, per: 0.06, dark: 0.15,
      win: R(['Blackbird picks the lock on the entry tin at {venue} during the final and walks out with {amount}nd and a strong desire to be elsewhere.'], { cash: [80, 260], from: 'owner', purse: true, heat: ['place', 2], train: [['lockpicking', 3], ['sneak', 2]], thought: ['The real prize was the tin all along.'] }),
      lose: R(['The host at {venue} catches Blackbird with her hand in the tin and rings the bell. Everybody knows what the bell means.'], { heat: ['place', 3], affinity: -25, fight: true, thought: ['That bell was a lot.'] }) },
  }),
  row({
    id: 'bar-brawl', where: {}, pace: 'fight',
    needs: ['skill:melee', 'stat:muscle', 'drive:bravery'],
    sees: 'A loser who wants to settle it the other way.', stakes: 'A scrap between bouts.', consequence: 'A grudge and an ice pack.',
    drives: { bravery: 0.6, pride: 0.3 }, bonus: -0.05, risk: 0.5, ok: (w, v) => !!find(v, 'tag:challenger'),
    check: { who: 'tag:challenger', parts: ['melee', ['stat:muscle', 0.5]], base: 0.25, per: 0.05,
      win: R(['{npc} at {venue} wants a rematch, with fists. Blackbird obliges.'], { affinity: -20, fight: true, thought: ['Best of three. In a different sport.'] }),
      lose: R(['{npc} at {venue} wants a rematch, with fists. {They} get{s} one.'], { affinity: -20, fight: true, thought: ['They were a boxer before they were a bassist.'] }) },
  }),
  row({
    id: 'slip-out-back', where: { feature: 'back_door' }, pace: 'quick',
    needs: ['skill:sneak', 'skill:athletics', 'stat:reflex'],
    sees: 'A back door for the losers and the police.', stakes: 'A quiet exit: the heat on her cools.', consequence: 'Nobody saw her go.',
    drives: { bravery: 0.2 }, bonus: 0, ok: (w) => (w.heat.npd ?? 0) + (w.heat.muse ?? 0) >= 2,
    check: { parts: ['sneak', ['athletics', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird goes out the back of {venue} as the police come in the front, and is three streets away before the music stops.'], { apply: (c) => { for (const k of ['npd', 'muse']) if (c.w.heat[k]) c.w.heat[k] = Math.max(0, c.w.heat[k]! - 1); }, train: [['sneak', 2]], thought: ['An exit. Stage left.'] }),
      lose: R(['The back door of {venue} opens onto a police van.'], { apply: (c) => { c.w.heat.npd = (c.w.heat.npd ?? 0) + 1; }, thought: ['Wrong door.'] }) },
  }),
  row({
    id: 'buy-stims', where: { feature: 'stim_dealer' }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:haggling', 'drive:thirst'],
    sees: 'A dealer in the corner with a tray of glowing pills and a price for each colour.', stakes: 'Something to make the next bout faster: a buff, a few nd, a risk.', consequence: 'Her hands are very fast, for a while.',
    drives: { thirst: 0.5, bravery: 0.3 }, bonus: 0, ok: (w) => w.hero.cash >= 20,
    check: { pay: [12, 20], parts: ['streetwise', ['haggling', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird buys a blue one off the dealer at {venue} for {pay}nd. Her fingers start moving before she tells them to.'], { buff: { id: 'quick_hands', power: 2, beats: 12 }, thought: ['Natural talent, chemically assisted.'] }),
      lose: R(['Blackbird buys a green one at {venue} for {pay}nd. It is a mint.'], { thought: ['Fresh breath. For the vocals.'] }) },
  }),
];

export const CUTTING_ROWS: Affordance<VenueView>[] = [...FLOOR, ...CROWD, ...CRIME];
