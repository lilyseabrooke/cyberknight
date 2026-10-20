import { type Affordance } from '../affordances';
import { R, banned, rowFor, type VenueView } from '../venuekit';
import { addParts } from '../bench';
import { acquire } from '../combat';
import { genInstrument, hasInstrument } from '../instruments';
import { addDeed, playing } from '../provenance';
import type { World } from '../types';
import type { PlaceView } from '../placekit';

/**
 * The first half of a luthier's rows: the wall, the bench, the wood, the people, the hustle and the crime. Situations, wild cards
 * and the kinds of luthier are in luthierevents.ts. The bench work itself (tickets, grafts, buy-backs) is not rows: see luthier.ts.
 *
 * Tokens: {venue} {npc} {owner} {pay} {amount} {item} {tip} {lost}; pronouns for {npc} use {they}/{their}.
 */

export const row = rowFor('luthier');
export const open = (w: World, v: VenueView): boolean => !banned(w, v.main);
const vv = (v: PlaceView): VenueView => v as VenueView;

/** A guitar off the wall or out of a bin, rolled to the shop's tier. */
export function wallGuitar(c: Parameters<NonNullable<Affordance<VenueView>['run']>>[0], v: PlaceView, bump = 0, line?: string): ReturnType<typeof genInstrument> {
  const g = genInstrument(c.rng.fork(`luthwall:${v.main.id}:${c.w.beat}`), Math.min(9, vv(v).info.tier + bump));
  if (line) addDeed(g, line);
  return g;
}

const WALL: Affordance<VenueView>[] = [
  row({
    id: 'try-the-wall', where: { feature: 'guitar_wall' }, pace: 'session',
    needs: ['skill:guitar', 'skill:music', 'drive:curiosity'],
    sees: 'A wall of guitars with paper tags, and a stool in front of it that says TRY ANY.', stakes: 'An hour trying every guitar on the wall: guitar XP, and a feel for what she wants.', consequence: 'The luthier knows what her hands like.',
    drives: { curiosity: 0.6, pride: 0.3 }, bonus: 0.15,
    check: { who: 'owner', parts: ['guitar', ['music', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird tries eleven guitars off the wall at {venue}. On the eighth, {npc} stops working to listen. "That one likes you," {they} say{s}.', 'An hour at {venue} with a stool and a wall of guitars. Her hands learn something from every one of them.'], { train: [['guitar', 4], ['music', 2]], affinity: 3, thought: ['Speed dating. With necks.', 'Every guitar has an opinion about me. Most of them are good.'] }),
      lose: R(['Blackbird tries the wall at {venue} and every guitar seems to want somebody else.'], { train: [['guitar', 1]], thought: ['They are shy. All of them.'] }) },
  }),
  row({
    id: 'tag-stories', where: { feature: ['guitar_wall', 'ticket_rack', 'window_display'] }, pace: 'quick',
    needs: ['skill:perception', 'skill:analyze', 'drive:curiosity'],
    sees: 'Paper tags on every guitar, each one a guess at where it has been.', stakes: 'Read the tags: who sold what, which guitar has paper on its owner, a tip.', consequence: 'She knows whose guitars are here.',
    drives: { curiosity: 0.7 }, bonus: 0.1,
    check: { parts: ['perception', ['analyze', 0.5]], base: 0.55, per: 0.05,
      win: R(['The tags at {venue} read like a police file. One of them is a guitar sold by {tip} the night they went into hiding.'], { tip: true, train: [['perception', 2]], thought: ['Guitars tell tales. On tags.'] }),
      lose: R(['The tags at {venue} are in a shorthand only the luthier speaks.'], { thought: ['A code. A string code.'] }) },
  }),
  row({
    id: 'test-amp-loud', where: { feature: ['test_amp', 'amp_stack'] }, pace: 'quick',
    needs: ['skill:guitar', 'drive:pride', 'stat:charm'],
    sees: 'A test amp, always on, always slightly too loud, and a street outside with people on it.', stakes: 'One loud song through the shop window: a little fame, a crowd at the glass.', consequence: 'The street heard her.',
    drives: { pride: 0.7 }, bonus: 0.1, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['guitar', ['stat:charm', 0.4]], base: 0.45, per: 0.06,
      win: R(['Blackbird turns the test amp at {venue} up to the number the luthier asked her not to and plays one song. By the end there are faces at the window.'], { fame: 0.8, apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 2; }, train: [['guitar', 2]], thought: ['A shop-window concert. Iconic.'] }),
      lose: R(['The test amp at {venue} feeds back so badly a customer drops a mandolin.'], { thought: ['That was the amp. The amp is wild.'] }) },
  }),
  row({
    id: 'tune-by-ear', where: { feature: ['tuning_room', 'guitar_wall'] }, pace: 'quick',
    needs: ['skill:music', 'skill:perception', 'stat:int'],
    sees: 'A room with a stool, a tuning fork and nothing else, and a bet on the board that nobody can tune twelve strings by ear in a minute.', stakes: 'The bet: a few nd and the shop\'s respect.', consequence: 'Her ears are known here.',
    drives: { pride: 0.5, curiosity: 0.4 }, bonus: 0.05,
    check: { who: 'owner', parts: ['music', ['perception', 0.5], ['stat:int', 0.3]], base: 0.4, per: 0.06,
      win: R(['Blackbird tunes a twelve-string by ear at {venue} in fifty-one seconds. {npc} checks it on the meter and pays the bet: {amount}nd.'], { cash: [10, 40], train: [['music', 3]], affinity: 4, thought: ['Perfect pitch. Practically. Adjacently.'] }),
      lose: R(['Blackbird tunes the twelve-string at {venue} into a chord that does not exist.'], { thought: ['I invented a chord. That is composition.'] }) },
  }),
  row({
    id: 'famous-wall', where: { feature: 'photo_wall' }, pace: 'quick',
    needs: ['drive:pride', 'skill:perception'],
    sees: 'A wall of photos of famous people holding guitars made here, and one of them is her, in a body she does not have now.', stakes: 'A look at herself: a little pride, a little fame, a story the luthier is glad to tell.', consequence: 'The luthier remembers her.',
    drives: { pride: 0.7, curiosity: 0.4 }, bonus: 0.1,
    check: { who: 'owner', parts: ['perception', ['stat:charm', 0.3]], base: 0.6, per: 0.04,
      win: R(['On the wall at {venue}, between two people she has heard of, is a photo of Blackbird, signed, in a body she does not remember. {npc} comes over and tells her the story of the guitar in the picture. She listens like it is about somebody else.'], { affinity: 8, fame: 0.4, thought: ['I looked good. I always look good. In every body.'] }),
      lose: R(['The photo of her at {venue} has been moved to the toilet. She does not ask.'], { thought: ['A place of honour. In a sense.'] }) },
  }),
  row({
    id: 'vintage-case', where: { feature: 'vintage_case' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:sneak', 'drive:greed'],
    sees: 'A glass case with a lock and one old guitar in it that is not for sale.', stakes: 'The guitar in the case (old, storied), or the luthier\'s very sharp chisel.', consequence: 'The case is empty.',
    drives: { greed: 0.6, curiosity: 0.4 }, bonus: 0, risk: 0.4,
    check: { parts: ['lockpicking', ['sneak', 0.6]], base: 0.3, per: 0.06, dark: 0.1,
      win: R(['The lock on the vintage case at {venue} is older than the guitar. Blackbird walks out with {item}, which has a story on its tag longer than most lives.'], { apply: (c, v, _w, tok) => { const g = wallGuitar(c, v, 3, `stolen from a locked case at ${v.main.name}`); addDeed(g, 'older than the city'); acquire(c, g); tok.item = g.name; }, heat: ['place', 2], train: [['lockpicking', 3], ['sneak', 2]], thought: ['It wanted out. I could tell.'] }),
      lose: R(['The vintage case at {venue} has a bell on it, the kind on a shop door, and the luthier knows the sound.'], { heat: ['place', 2], affinity: -15, fight: true, thought: ['A bell. Low-tech. Effective.'] }) },
  }),
];

const BENCHWORK: Affordance<VenueView>[] = [
  row({
    id: 'help-at-bench', where: { feature: 'workbench' }, pace: 'session',
    needs: ['skill:tinkering', 'stat:reflex', 'drive:curiosity'],
    sees: 'A bench with a guitar in pieces and a luthier with one pair of hands too few.', stakes: 'An afternoon as the second pair of hands: tinkering XP, the luthier\'s gratitude, a few nd.', consequence: 'The luthier would have her back.',
    drives: { curiosity: 0.6, greed: 0.2 }, bonus: 0.1,
    check: { who: 'owner', parts: ['tinkering', ['stat:reflex', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird holds the clamps, passes the files and fits a fret at {venue} while {npc} talks about wood. At the end {they} pay{s} her {amount}nd and a compliment.'], { cash: [10, 40], from: 'owner', train: [['tinkering', 3]], affinity: 5, thought: ['I fitted a fret. I am basically a luthier.'] }),
      lose: R(['Blackbird glues a fret in upside down at {venue}. {npc} says nothing for a full minute.'], { affinity: -3, train: [['tinkering', 1]], thought: ['It is a stylistic choice.'] }) },
  }),
  row({
    id: 'sand-a-neck', where: { feature: ['workbench', 'apprentice_bench'] }, pace: 'session',
    needs: ['stat:muscle', 'skill:tinkering', 'drive:quest'],
    sees: 'A neck to sand to the shape of somebody\'s hand, and a block of sandpaper.', stakes: 'An hour sanding: sore arms, a little XP, a neck shaped like her hand.', consequence: 'Somewhere a guitar has her hand in it.',
    drives: { quest: 0.3, curiosity: 0.3 }, bonus: 0,
    check: { parts: ['stat:muscle', ['tinkering', 0.5]], base: 0.6, per: 0.04, physical: true,
      win: R(['Blackbird sands a neck at {venue} for an hour until it fits her hand like a handshake. The luthier says it is the best neck the apprentice never made.'], { sore: 0.1, train: [['tinkering', 2]], xp: 2, thought: ['Wood. Shaped by me. Forever.'] }),
      lose: R(['Blackbird sands a neck at {venue} until it is noticeably thinner on one side.'], { sore: 0.1, thought: ['Asymmetry is honest.'] }) },
  }),
  row({
    id: 'carve-pick', where: { feature: ['wood_stack', 'sawdust', 'scrap_pile'] }, pace: 'quick',
    needs: ['skill:art', 'skill:tinkering', 'drive:curiosity'],
    sees: 'Offcuts of tonewood too good to burn and too small to build with.', stakes: 'Carve a plectrum from an offcut: a keepsake, a lucky one maybe.', consequence: 'A pick from a forest that is gone.',
    drives: { curiosity: 0.5 }, bonus: 0.05,
    check: { parts: ['art', ['tinkering', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird carves a plectrum at {venue} out of an offcut of a wood that does not grow any more. It is lopsided and perfect.'], { train: [['art', 2], ['tinkering', 1]], thought: ['A pick from a tree older than Atlas. Take that, Atlas.'] }),
      lose: R(['Blackbird carves a plectrum at {venue}. It is, the apprentice says kindly, a very nice coaster.'], { thought: ['Coasters are underrated.'] }) },
  }),
  row({
    id: 'parts-drawers', where: { feature: ['parts_drawers', 'scrap_pile'] }, pace: 'quick',
    needs: ['skill:scavenging', 'skill:sleight', 'drive:greed'],
    sees: 'A cabinet of tiny drawers: pickups, pots, frets, a screw for everything, and nobody counting.', stakes: 'A handful of parts (components for a bench), or a hand slapped.', consequence: 'A drawer is lighter.',
    drives: { greed: 0.5 }, bonus: 0, risk: 0.2,
    check: { parts: ['sleight', ['scavenging', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird goes through the drawers at {venue} while the luthier is in the back, and comes away with wiring, a pickup and a handful of very good screws.'], { apply: (c) => addParts(c.w.hero, { wiring: 3, circuits: 1, scrap: 2 }), train: [['sleight', 2], ['scavenging', 1]], thought: ['Parts. Mine now. For art.'] }),
      lose: R(['A drawer at {venue} sticks, then comes out all at once, with three hundred frets.'], { affinity: -5, thought: ['A rain of frets. Biblical.'] }) },
  }),
  row({
    id: 'string-up', where: { feature: 'string_rack' }, pace: 'quick',
    needs: ['skill:haggling', 'skill:guitar', 'drive:greed'],
    sees: 'A rack of strings in every gauge and a sign that says ASK, DON\'T TAKE.', stakes: 'A fresh set for her guitar, haggled: a better night\'s playing (a small buff).', consequence: 'New strings.',
    drives: { greed: 0.3, pride: 0.3 }, bonus: 0.1, ok: (w) => hasInstrument(w.hero) && w.hero.cash >= 10,
    check: { pay: [5, 12], who: 'owner', parts: ['haggling', ['guitar', 0.4]], base: 0.6, per: 0.04,
      win: R(['Blackbird talks {npc} into a set of the good strings at {venue} for {pay}nd. They sound like the first day of summer.'], { buff: { id: 'new_strings', power: 2, beats: 40 }, train: [['haggling', 1]], thought: ['New strings. New me.'] }),
      lose: R(['The strings at {venue} cost {pay}nd and break on the first bend.'], { thought: ['Faulty. Or I am too powerful.'] }) },
  }),
  row({
    id: 'fake-provenance', where: { feature: ['workbench', 'guitar_wall'] }, pace: 'session',
    needs: ['skill:grifting', 'skill:art', 'drive:greed'],
    sees: 'A pen, some aged paper, and a guitar whose story could do with improving.', stakes: 'Write her guitar a story it never had: a storied guitar plays better (and is worth more), or a luthier who knows a forgery.', consequence: 'Her guitar has a story. Some of it is true.',
    drives: { greed: 0.4, pride: 0.4 }, bonus: 0.1, ok: (w) => !!playing(w.hero)?.inst,
    check: { who: 'owner', parts: ['grifting', ['art', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird writes her guitar a provenance at {venue}: a riot, a rooftop, a dragon. The ink is aged with tea. {npc} reads it, nods, and stamps it AUTHENTIC without being asked.'], { apply: (c) => { const g = playing(c.w.hero); if (g) addDeed(g, c.rng.pick(['played the last night before the lockdown', 'once belonged to a dragon technician', 'was played at a funeral that turned into a riot', 'survived a fire at a Muse warehouse'])); }, train: [['grifting', 3], ['art', 1]], thought: ['History is just paperwork with feelings.'] }),
      lose: R(['{npc} at {venue} holds Blackbird\'s forged provenance up to the light. "Tea," {they} say{s}. "Assam."'], { affinity: -6, thought: ['A connoisseur. Of my crimes.'] }) },
  }),
];

const PEOPLE: Affordance<VenueView>[] = [
  row({
    id: 'tea-and-stories', where: { feature: 'kettle' }, pace: 'session',
    needs: ['stat:charm', 'skill:cooking', 'drive:curiosity'],
    sees: 'A kettle that is always on, three mugs and a luthier who likes to talk.', stakes: 'Tea and an hour of stories: the luthier\'s regard, a tip about who brought what in.', consequence: 'A friend at the bench.',
    drives: { curiosity: 0.5, thirst: 0.2 }, bonus: 0.15,
    check: { who: 'owner', parts: ['stat:charm', ['cooking', 0.3]], base: 0.6, per: 0.04,
      win: R(['Blackbird makes the tea at {venue} properly, which nobody has done since the apprentice was hired. {npc} tells her about every guitar on the wall, and about {tip}.'], { tip: true, affinity: 8, hp: 2, thought: ['Tea is a currency. I am rich.'] }),
      lose: R(['Blackbird makes tea at {venue}. {npc} drinks it politely and pours the rest on a plant.'], { affinity: 1, thought: ['The plant needed it more.'] }) },
  }),
  row({
    id: 'workshop-cat', where: { feature: 'cat' }, pace: 'quick',
    needs: ['skill:rapport', 'drive:curiosity'],
    sees: 'A cat asleep in the sawdust, who has been on every guitar here at some point.', stakes: 'A friend, or a scratch.', consequence: 'The cat decides.',
    drives: { curiosity: 0.4 }, bonus: 0,
    check: { parts: ['rapport', ['stat:charm', 0.3]], base: 0.55, per: 0.05,
      win: R(['The workshop cat at {venue} gets up out of the sawdust and climbs into Blackbird\'s guitar case, which is the highest honour it can give.'], { train: [['rapport', 3]], thought: ['A cat in my case. Blessed.'] }),
      lose: R(['The workshop cat at {venue} bites Blackbird, precisely, and goes back to sleep.'], { hp: -1, train: [['rapport', 1]], thought: ['A review.'] }) },
  }),
  row({
    id: 'teach-apprentice', where: { feature: 'apprentice_bench' }, pace: 'session',
    needs: ['skill:speaking', 'skill:guitar', 'drive:quest'],
    sees: 'An apprentice who can build a guitar but cannot play one.', stakes: 'Teach them a few chords: their devotion, a discount, the luthier\'s gratitude.', consequence: 'An apprentice who plays her riffs.',
    drives: { quest: 0.5, pride: 0.4 }, bonus: 0.1,
    check: { who: 'arch:luthier_apprentice', parts: ['speaking', ['guitar', 0.6]], base: 0.5, per: 0.05,
      win: R(['Blackbird teaches {npc} three chords at {venue}. By the end of the hour {npc} is playing one of her songs, badly, with total joy.'], { affinity: 15, train: [['speaking', 2], ['guitar', 1]], thought: ['A student. My legacy grows.'] }),
      lose: R(['{npc} at {venue} has hands made for sanding and nothing else.'], { thought: ['Not everyone is me.'] }) },
  }),
  row({
    id: 'advise-customer', where: {}, pace: 'session',
    needs: ['skill:persuasion', 'skill:hustling', 'drive:greed'],
    sees: 'A customer trying every guitar on the wall and buying none of them.', stakes: 'Talk them into the right one: a commission from the shop.', consequence: 'A customer leaves happy, and the shop owes her.',
    drives: { greed: 0.5, pride: 0.3 }, bonus: 0.1, ok: (w, v) => v.people.some((n) => n.archetype === 'luthier_customer' && n.alive),
    check: { who: 'arch:luthier_customer', parts: ['persuasion', ['hustling', 0.6], ['guitar', 0.3]], base: 0.45, per: 0.06,
      win: R(['Blackbird watches {npc} at {venue} for a minute, takes a guitar off the wall, and hands it over. "This one." {npc} plays one chord and buys it. The luthier slips her {amount}nd.'], { cash: [15, 50], train: [['persuasion', 2], ['hustling', 2]], thought: ['I matched a person to a guitar. Cupid, with a pick.'] }),
      lose: R(['{npc} at {venue} takes Blackbird\'s advice, plays the guitar, and leaves without buying anything, inspired to take up the drums.'], { thought: ['A convert. To the wrong religion.'] }) },
  }),
  row({
    id: 'flirt-luthier', where: {}, pace: 'session',
    needs: ['skill:romance', 'stat:charm', 'drive:lust'],
    sees: 'A luthier with sawdust in their hair and very good hands.', stakes: 'Flirt across the bench: their affection (and the bench\'s best work), or a polite cough.', consequence: 'The luthier thinks of her when they sand a neck.',
    drives: { lust: 0.6 }, bonus: 0.05, ok: (w, v) => v.people.some((n) => n.tags.includes('luthier') && !n.tags.includes('robot')),
    check: { who: 'tag:luthier', parts: ['romance', ['stat:charm', 0.7]], base: 0.4, per: 0.06,
      win: R(['Blackbird compliments {npc}\'s hands at {venue}, specifically, at length. {npc} goes red to the ears and finds a reason to measure hers.'], { affinity: 12, train: [['romance', 3]], thought: ['A craftsman. Crafted.'] }),
      lose: R(['{npc} at {venue} is only interested in her guitar, which is fair, it is a nice guitar.'], { affinity: 1, thought: ['Rejected for a guitar. Understandable.'] }) },
  }),
  row({
    id: 'haggle-guitar', where: { feature: ['guitar_wall', 'window_display'] }, pace: 'session',
    needs: ['skill:haggling', 'stat:charm', 'drive:greed'],
    sees: 'A guitar on the wall at a price that is mostly a mood.', stakes: 'Talk the price down far enough to buy it: a new guitar.', consequence: 'The shop thinks she drives a hard bargain.',
    drives: { greed: 0.6, pride: 0.3 }, bonus: 0.1, ok: (w) => w.hero.cash >= 80,
    check: { who: 'owner', pay: [60, 80], parts: ['haggling', ['stat:charm', 0.5]], base: 0.35, per: 0.06,
      win: R(['Blackbird spends forty minutes haggling at {venue} over {item}, and walks out with it for {pay}nd, which they both know is robbery.'], { apply: (c, v, _w, tok) => { const g = wallGuitar(c, v, 0); acquire(c, g); tok.item = g.name; }, train: [['haggling', 3]], affinity: -2, thought: ['A bargain. A guitar. A good day.'] }),
      lose: R(['{npc} at {venue} will not go below the price on the tag, and adds that the tag was generous. The {pay}nd deposit she put down is, apparently, a "consultation fee".'], { thought: ['Generosity is a pricing strategy.'] }) },
  }),
];

const CRIME: Affordance<VenueView>[] = [
  row({
    id: 'back-room', where: { feature: 'back_room' }, pace: 'session',
    needs: ['skill:sneak', 'skill:lockpicking', 'drive:greed'],
    sees: 'A back room the dealer does not show people, with a lock and a reason.', stakes: 'A guitar from the back room (probably stolen once already), or the dealer\'s friends.', consequence: 'The back room is short one.',
    drives: { greed: 0.6, curiosity: 0.5 }, bonus: 0.05, risk: 0.4,
    check: { parts: ['sneak', ['lockpicking', 0.6]], base: 0.3, per: 0.06, dark: 0.1,
      win: R(['The back room at {venue} is full of guitars with their serial numbers filed off. Blackbird leaves with {item} and a strong sense that nobody will report it.'], { apply: (c, v, _w, tok) => { const g = wallGuitar(c, v, 1, `stolen twice, the second time by her, from ${v.main.name}`); acquire(c, g); tok.item = g.name; }, train: [['sneak', 2], ['lockpicking', 2]], thought: ['Stolen from thieves. Ethically neutral.'] }),
      lose: R(['The dealer at {venue} is in the back room, with two friends and a guitar that is not for playing.'], { heat: ['place', 2], fight: true, thought: ['A business meeting I was not invited to.'] }) },
  }),
  row({
    id: 'swap-tags', where: { feature: ['guitar_wall', 'ticket_rack'] }, pace: 'quick',
    needs: ['skill:sleight', 'skill:grifting', 'drive:greed'],
    sees: 'Paper price tags on string loops, and a cheap guitar right next to a good one.', stakes: 'Swap the tags and buy the good one cheap, or be caught with a tag in each hand.', consequence: 'The shop sold a good guitar for nothing.',
    drives: { greed: 0.7 }, bonus: 0.05, risk: 0.3, ok: (w) => w.hero.cash >= 40,
    check: { pay: [30, 40], parts: ['sleight', ['grifting', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird swaps two tags at {venue} and buys {item} for {pay}nd. The luthier rings it up without looking, which is the only time that has ever happened.'], { apply: (c, v, _w, tok) => { const g = wallGuitar(c, v, 2); acquire(c, g); tok.item = g.name; }, train: [['sleight', 2], ['grifting', 2]], thought: ['A price is a suggestion.'] }),
      lose: R(['The luthier at {venue} knows every guitar on the wall by its price, and says so.'], { affinity: -12, heat: ['place', 1], thought: ['A memory for numbers. Rude.'] }) },
  }),
  row({
    id: 'smash-and-grab', where: { feature: 'window_display' }, pace: 'fight',
    needs: ['stat:muscle', 'skill:athletics', 'drive:greed'],
    sees: 'A window display of the shop\'s best guitars, and a brick in the gutter.', stakes: 'Through the window and away with the best one, with the whole street watching.', consequence: 'A broken window, a missing guitar, a lot of heat.',
    drives: { greed: 0.7, bravery: 0.5 }, bonus: -0.1, risk: 0.6,
    check: { parts: ['stat:muscle', ['athletics', 0.6]], base: 0.35, per: 0.05,
      win: R(['Blackbird puts a brick through the window of {venue}, takes {item} off the display and is round the corner before the glass stops falling.'], { apply: (c, v, _w, tok) => { const g = wallGuitar(c, v, 2, `taken through the window of ${v.main.name}`); acquire(c, g); tok.item = g.name; c.w.heat.npd = (c.w.heat.npd ?? 0) + 2; }, heat: ['place', 3], thought: ['Shopping. Aggressively.'] }),
      lose: R(['The window at {venue} is reinforced. The brick comes back.'], { hp: -6, heat: ['place', 2], thought: ['Safety glass. Coward glass.'] }) },
  }),
  row({
    id: 'case-of-guns', where: { feature: 'case_rack' }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:perception', 'drive:curiosity'],
    sees: 'A rack of guitar cases, some empty, some heavy in a way guitars are not.', stakes: 'Open the heavy one: a guitar case built for something else (a guitar case for a private booking).', consequence: 'She knows which cases here are not for guitars.',
    drives: { curiosity: 0.6, greed: 0.3 }, bonus: 0.05,
    check: { parts: ['perception', ['streetwise', 0.6]], base: 0.45, per: 0.06,
      win: R(['The heavy case at {venue} has foam cut in the shape of something that is not a guitar. The dealer sees her looking, and sells it to her cheap to stop her looking. {item}.'], { item: 'guitar_case', train: [['streetwise', 2]], thought: ['A case for any occasion.'] }),
      lose: R(['The heavy case at {venue} is full of sheet music. A lot of sheet music.'], { thought: ['Paper is heavy. Who knew.'] }) },
  }),
];

export const LUTHIER_ROWS: Affordance<VenueView>[] = [...WALL, ...BENCHWORK, ...PEOPLE, ...CRIME];
