import { type Affordance } from '../affordances';
import { banned, buyOne, counterLots, find, herLots, hockOne, hockable, redeemOne, runCheck, say, sellOne, usefulness, type PawnView } from '../pawnkit';
import { lotState, redeemPrice, shelfPrice } from './pawns';
import { type Check, type Result } from '../placekit';
import { skillLevel, train, skillRoot } from '../skills';
import { kindle } from '../romance';
import type { World } from '../types';

/**
 * The first half of a pawn shop's affordances: the money (hock, buy back, buy, sell, haggle), the craft, and the crowd.
 * (Crime and stealth are in pawncrime.ts; things that depend on what is happening today, the wild cards, and the things
 * only certain kinds of shop offer are in pawnevents.ts.)
 *
 * Every row says which capability it is for (`needs`) and what that capability *sees* here (`sees`). Nothing says
 * "thief" or "fighter". Prose is in the report voice with a thought in Blackbird's. Tokens: {shop} {npc} {owner} {pay}
 * {amount} {item} {tip} {lost}; pronouns for {npc} use the usual {they}/{their} tokens.
 */

type RowIn = Omit<Affordance<PawnView>, 'place' | 'run'> & { check?: Check; run?: Affordance<PawnView>['run'] };
export const row = (a: RowIn): Affordance<PawnView> => ({ ...a, place: 'pawn', run: a.run ?? ((c, v) => runCheck(c, v, a.id, a.check!)) });
export const R = (text: string[], o: Partial<Result> = {}): Result => ({ text, ...o });

const open = (w: World, v: PawnView): boolean => !banned(w, v.main);
const cash = (w: World): number => w.hero.cash;
/** How much there is in her pockets worth hocking, 0..1 (a stash of 300nd or more is a full one). */
const stash = (w: World): number => Math.min(1, hockable(w.hero).reduce((s, i) => s + i.value, 0) / 300);

// ===================================================================== the money

const HOCK: Parameters<typeof hockOne>[2] = {
  win: [
    '{shop}: Blackbird slides {item} across the counter. {npc} turns it over twice, names a figure and, after a short and expensive silence, a better one. {pay}nd, and a tag in biro. It goes in the window with her name on it. {days} {dw}, if she wants it back.{tail}',
    'Blackbird hocks {item} at {shop}. {npc} says "it is not worth much", which is how every negotiation starts, and the figure ends at {pay}nd. It sits in the window under a card: HELD. {days} {DW}.{tail}',
  ],
  lose: [
    '{shop}: {npc} looks at {item} for a long moment and offers {pay}nd. Blackbird argues. {npc} writes the same number again, slower. It goes in the window. {days} {dw}.{tail}',
    'Blackbird hocks {item} at {shop} for {pay}nd, which is less than the thing deserves and exactly what {npc} was always going to say. It is on a shelf with a tag. {days} {dw}.{tail}',
  ],
  refuse: [
    '{npc} looks at {item}, looks at Blackbird, and puts both back across the counter. "Not here," {they} say{s}. Something at {shop} makes a note.{tail}',
    '{shop}: {npc} will not touch {item}. A very polite no, and a longer look at the scanner than at her.{tail}',
  ],
  thought: ['It is a loan. To me. From me. I am a financial institution.', 'Temporary. Everything is temporary. Especially the shelf.', 'I will be back for it. Probably. Definitely.'],
};

const BACK: Parameters<typeof redeemOne>[2] = {
  held: [
    '{shop}: {item} is still on the shelf, a card under it with her name. Blackbird pays {pay}nd (it was {paid}, and {days} {dw} of interest). {npc} takes it down, wipes it and hands it over like a baby. She has it back.{saved}',
    'Blackbird buys {item} back from {shop}. {pay}nd across the counter, {paid} of it the original loan. {npc} says "good to see you again" in the voice of a man who is not surprised.{saved}',
  ],
  forfeit: [
    '{shop}: {item} is past its hold and out in the window with a price on it instead of a name. Blackbird pays {pay}nd, the full retail on her own stuff, and {npc} does not even look embarrassed.{saved}',
    'The hold on {item} ran out at {shop}. It is for sale now, and she buys it: {pay}nd, a price on a tag that used to say HELD. She would argue, but she is also holding it.{saved}',
  ],
  refuse: ['{npc} will not take less on {item} at {shop}, and says so in two languages and a small shrug.'],
  thought: ['Mine again. That is called a win. Do not look at the number.', 'I have a perfectly good relationship with this shelf.', 'Interest is a state of mind.'],
};

const BUY: Parameters<typeof buyOne>[2] = {
  win: [
    '{shop}: Blackbird goes along the shelves with her hands behind her back and stops at {item}. The tag says {ask}nd. After a short, civil fight with {npc}, {pay}nd changes hands. It is hers. It will be hers until she hocks it.',
    'Blackbird buys {item} at {shop} for {pay}nd. {npc} wraps it in a page of last year\'s timetable and tells her it is the best thing in the shop. {They} say{s} that about all of them.',
  ],
  fake: [
    'Blackbird buys what {npc} swears is {item} at {shop}. {pay}nd. It is a copy. It is, in fairness, a very good copy. The tag was the only honest part.',
    '{shop}: {pay}nd for {item}, and it is not. The shop does not say so. She finds out on the street, when it starts to say it is a watch.',
  ],
  cursed: [
    '{shop}: Blackbird buys {item} for {pay}nd. A cold feeling goes down her back, and a shelf behind {npc} quietly takes a replacement. By morning, it will be back in the window.',
    'She pays {pay}nd for {item} at {shop}. It is hers for a very short, very unlucky time.',
  ],
  refuse: ['The price on the tag does not move, and {npc} will not hear of it.'],
  thought: ['Value. I smell value.', 'That is an investment. It is also a hat.', 'It has a story. I will make one up.'],
};

const SELL: Parameters<typeof sellOne>[2] = {
  win: ['{shop}: Blackbird sells {item} outright. {npc} counts out {pay}nd and the thing goes on the house shelf, tagged with a price that is not hers. She tells herself it was a gift to the public.', 'She sells {item} to {npc} at {shop} for {pay}nd, no tag, no hold. It is not coming back. That is the product.'],
  refuse: ['{npc} will not buy {item} at {shop}.{tail}'],
  thought: ['Gone. Light as a feather and a bit richer.', 'Clean break. Clean hands. Cash.'],
};

const money = (w: World, v: PawnView): boolean => open(w, v) && (!!find(v, 'owner') || !!find(v, 'clerk'));

export const MONEY: Affordance<PawnView>[] = [
  row({
    id: 'hock', where: { feature: 'counter' }, pace: 'deal',
    needs: ['skill:haggling', 'stat:charm', 'drive:greed', 'tag:broke'],
    sees: 'A counter where whatever she is carrying becomes a number, and the number is in cash.', stakes: 'A fraction of its worth now; it sits on the shelf with her name on it for a few days and she can buy it back, with interest.', consequence: 'The shop holds her item; the broker\'s till goes down.',
    drives: { greed: 0.9, pride: -0.2 }, bonus: 0.0,
    appeal: (w) => {
      const items = hockable(w.hero);
      if (!items.length) return -1;
      const worth = stash(w);
      // The short of cash want it most, but a pocketful of loot she never uses is an invitation too.
      return 0.06 * Math.min(14, items.length) + 0.3 * worth + 0.6 * Math.min(1, worth * 2) * (cash(w) < 40 ? 1.2 : cash(w) < 120 ? 0.6 : cash(w) < 300 ? 0.2 : 0);
    },
    intent: ['Blackbird goes through her pockets and finds something she can live without. For a week.', 'Blackbird checks her wallet, checks her pockets and checks the pawn shop. One of them has something in it.'],
    ok: (w, v) => money(w, v) && hockable(w.hero).length > 0,
    run: (c, v) => hockOne(c, v, HOCK),
  }),
  row({
    id: 'buy-back', where: { feature: 'counter' }, pace: 'deal',
    needs: ['drive:pride', 'skill:haggling', 'item:any', 'drive:quest'],
    sees: 'Her own stuff on the shelf, with her name on the tag and a price that goes up every day.', stakes: 'What she was paid plus interest while it is held; full retail once the hold has run out.', consequence: 'She has it back; the broker takes a little more of her day.',
    drives: { pride: 0.6, greed: 0.3, quest: 0.3 }, bonus: 0.1,
    appeal: (w, v) => {
      const lots = herLots(v).filter((l) => (lotState(l, v.day) === 'held' ? redeemPrice(v.info, l, v.day) : shelfPrice(v.info, l, v.sit?.def)) <= cash(w));
      if (!lots.length) return -1;
      const best = Math.max(...lots.map((l) => usefulness(w.hero, l.item)));
      return 0.15 + Math.min(0.8, best * 1.0) + Math.min(0.4, Math.max(...lots.map((l) => l.item.value)) / 400);
    },
    intent: ['Blackbird remembers what is in the window and where it came from.', 'Blackbird has some money and a feeling about a thing on a shelf.'],
    ok: (w, v) => money(w, v) && herLots(v).some((l) => (lotState(l, v.day) === 'held' ? redeemPrice(v.info, l, v.day) : shelfPrice(v.info, l, v.sit?.def)) <= cash(w)),
    run: (c, v) => redeemOne(c, v, BACK),
  }),
  row({
    id: 'buy', where: { feature: 'counter' }, pace: 'deal',
    needs: ['drive:greed', 'drive:curiosity', 'skill:haggling', 'skill:streetwise'],
    sees: 'A shelf of things somebody else needed the money more than the thing, priced to leave.', stakes: 'A price on a tag, which can move; a thing that may be better than it looks, or worse.', consequence: 'The shelf is one lot lighter; the broker\'s till is a little fuller.',
    drives: { greed: 0.4, curiosity: 0.4 }, bonus: 0.0,
    appeal: (w, v) => {
      const lots = counterLots(v).filter((l) => !l.hers && shelfPrice(v.info, l, v.sit?.def) <= cash(w));
      if (!lots.length) return -1;
      const best = Math.max(...lots.map((l) => usefulness(w.hero, l.item)));
      return 0.12 + Math.min(0.8, best * 1.2) + (cash(w) > 300 ? 0.2 : cash(w) > 100 ? 0.1 : 0);
    },
    intent: ['Blackbird browses with the air of a woman who is not going to buy anything.', 'Blackbird has a look at the shelves and a look at her wallet, and the wallet looks away first.'],
    ok: (w, v) => money(w, v) && counterLots(v).some((l) => !l.hers && shelfPrice(v.info, l, v.sit?.def) <= cash(w)),
    run: (c, v) => buyOne(c, v, BUY),
  }),
  row({
    id: 'sell-outright', where: { feature: 'counter' }, pace: 'deal',
    needs: ['skill:haggling', 'drive:greed', 'skill:streetwise'],
    sees: 'A broker who will pay more for a thing she never wants to see again.', stakes: 'More than a hock pays, and no way back; the item goes on the house shelf.', consequence: 'The shelf has one more thing on it, and it is not hers any more.',
    drives: { greed: 0.5 }, bonus: -0.05,
    appeal: (w) => (hockable(w.hero).length ? 0.03 * Math.min(14, hockable(w.hero).length) + 0.25 * stash(w) + (cash(w) < 80 ? 0.1 : 0) : -1),
    intent: ['Blackbird weighs a thing in her hand and decides it is no longer hers.'],
    ok: (w, v) => money(w, v) && hockable(w.hero).length > 0,
    run: (c, v) => sellOne(c, v, SELL),
  }),
  row({
    id: 'price-duel', where: { feature: 'counter' }, pace: 'quick',
    needs: ['skill:haggling', 'skill:streetwise', 'stat:charm', 'drive:pride'],
    sees: 'A tag on a thing she does not want, a price that is plainly a first offer, and a broker who likes a game.', stakes: 'Nothing but pride, and maybe a finder\'s fee for reminding the broker who the thing was worth to.', consequence: 'The broker likes her a little more or a little less.',
    drives: { pride: 0.5 }, bonus: 0.02, intent: ['Blackbird picks a tag at random and starts an argument with it.'],
    ok: open,
    check: { who: 'owner', parts: ['haggling', ['streetwise', 0.4], ['stat:charm', 0.5]], base: 0.427, per: 0.06,
      win: R(['{shop}: Blackbird argues the price of a lamp she does not want down by a third, then back up by a quarter, then declines to buy it. {npc} claps once, slowly. A finder\'s fee of {amount}nd for "keeping the market honest".'], { cash: [6, 22], from: 'owner', train: [['haggling', 2]], affinity: 4, thought: ['I could sell you your own coat. And have.'] }),
      lose: R(['{npc} hears Blackbird out on the lamp, nods, and takes a very small amount of respect off her. It goes in the till.'], { affinity: -2, train: [['haggling', 1]] }) },
  }),
  row({
    id: 'finders-fee', where: { feature: 'counter' }, pace: 'session',
    needs: ['skill:hustling', 'skill:streetwise', 'skill:grifting', 'drive:greed'],
    sees: 'Sellers in the queue with nothing to say and a broker who would pay anyone to bring in more.', stakes: 'A few neodollars a head; the broker\'s regard.', consequence: 'The broker knows she is useful.',
    drives: { greed: 0.6 }, bonus: 0.03, intent: ['Blackbird looks at the queue and thinks of herself as a talent scout.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'owner', parts: ['hustling', ['streetwise', 0.6], ['grifting', 0.3]], base: 0.436, per: 0.06,
      win: R(['{shop}: Blackbird steers a very hesitant seller to the counter with a few words about how fair {npc} is. A finder\'s fee of {amount}nd. The seller walks out lighter, and a bit baffled about why.'], { cash: [10, 40], from: 'owner', train: [['hustling', 2], ['streetwise', 1]], affinity: 3, thought: ['Talent scout. Three-quarters charm.'] }),
      lose: R(['The seller Blackbird steers over at {shop} walks out again and does not come back. {npc} says nothing at all, at length.'], { affinity: -1 }) },
  }),
  row({
    id: 'charm-better-offer', where: { feature: 'counter' }, pace: 'quick',
    needs: ['stat:charm', 'skill:romance', 'drive:pride'],
    sees: 'A broker who is a little lonelier than {they} let on, and a counter built for small talk.', stakes: 'A sweetener out of the till; a flushed broker.', consequence: 'The broker remembers the compliment.',
    drives: { pride: 0.5, lust: 0.2 }, bonus: 0.02, intent: ['Blackbird leans on the counter and says something with her eyebrows.'],
    ok: open,
    check: { who: 'owner', parts: [['stat:charm', 1], ['romance', 0.6]], base: 0.313, per: 0.06,
      win: R(['{shop}: Blackbird compliments {npc} on {their} ledger, which is not what anyone compliments a ledger on. {npc} goes a pleasing shade of pink and slides {amount}nd across for "a gift, not a payment".'], { cash: [8, 30], from: 'owner', affinity: 6, train: [['romance', 1]], thought: ['A ledger is a love letter in a column.'] }),
      lose: R(['{npc} accepts the compliment with the face of someone filing it.'], { affinity: -1 }) },
  }),
  row({
    id: 'work-the-counter', where: { feature: 'counter' }, pace: 'session',
    needs: ['skill:hustling', 'skill:haggling', 'drive:greed', 'tag:broke'],
    sees: 'A counter, a tag gun and a broker who would very much like a lunch break.', stakes: 'A few hours; a few neodollars; the till is the limit.', consequence: 'The broker gets used to the help.',
    drives: { greed: 0.6 }, bonus: 0.03, intent: ['Blackbird is offered a stool, a tag gun and a speech about responsibility.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['hustling', ['haggling', 0.3]], base: 0.724, per: 0.04,
      win: R(['A shift at the counter of {shop}: a tray of rings weighed, tags gunned, a very long argument about a brooch. {amount}nd, and the stool, apparently, is hers now.'], { cash: [12, 30], from: 'owner', train: [['hustling', 2], ['haggling', 1]], affinity: 3 }),
      lose: R(['Blackbird prices a gold watch at 8nd on the tag gun. {npc} takes the watch, the gun and the shift.'], { affinity: -3 }) },
  }),
];

// ===================================================================== craft

export const CRAFT: Affordance<PawnView>[] = [
  row({
    id: 'appraise-lesson', where: { feature: ['scale', 'appraisal_bench'] }, pace: 'session',
    needs: ['skill:tinkering', 'skill:scavenging', 'drive:curiosity'],
    sees: 'A scale, a loupe and a lamp: the tools for finding out what a thing is really made of.', stakes: 'A free lesson, if she looks like she is listening; nothing else.', consequence: 'The appraiser gives her a look that means "not bad".',
    drives: { curiosity: 0.6 }, bonus: 0.03, intent: ['Blackbird looks at the loupe on the bench and wants to know what it sees.'],
    ok: (w, v) => open(w, v) && !!find(v, 'appraiser'),
    check: { who: 'appraiser', parts: ['tinkering', ['scavenging', 0.7]], base: 0.58, per: 0.05,
      win: R(['{shop}: {npc} puts a loupe in Blackbird\'s eye and a ring in her hand and says "look". She looks. The stone is, apparently, a lie. Something in her head clicks shut around the fact.'], { train: [['scavenging', 2], ['tinkering', 1]], xp: 3, affinity: 3, thought: ['I can tell trash from treasure now. Mostly I could before. But now officially.'] }),
      lose: R(['{npc} walks Blackbird through the scale twice, then takes the ring out of her hand and uses it for something else.'], { affinity: -1 }) },
  }),
  row({
    id: 'repair-for-pay', where: { feature: 'repair_bench' }, pace: 'session',
    needs: ['skill:tinkering', 'stat:int', 'drive:greed'],
    sees: 'A bench of broken things with tags on them, each waiting for someone who owns a screwdriver and the right attitude.', stakes: 'A fee on each; one of them might bite back.', consequence: 'The tinker or owner knows she can fix things.',
    drives: { greed: 0.6, curiosity: 0.3 }, bonus: 0.04, intent: ['Blackbird reads the repair tags and finds a thing that is plainly her kind of broken.'],
    ok: open,
    check: { who: 'tinker', parts: ['tinkering', ['stat:int', 0.3]], base: 0.482, per: 0.07,
      win: R(['{shop}: a radio, a lamp and something that was a speaker are fixed on the repair bench in an hour of cheerful swearing. {amount}nd on the tags, and the radio is on a station she likes.'], { cash: [14, 45], from: 'owner', train: [['tinkering', 3]], xp: 3, affinity: 3, thought: ['I should have been an engineer. A heroic one.'] }),
      lose: R(['A lamp on the bench at {shop} comes apart in Blackbird\'s hands and does not come back together. She puts it in the bargain bin, politely.'], { hurt: 0.2 }) },
  }),
  row({
    id: 'scrap-pick', where: { feature: ['scrap_bin', 'junk_pile'] }, pace: 'quick',
    needs: ['skill:scavenging', 'skill:tinkering', 'drive:curiosity'],
    sees: 'A bin of things the shop could not sell and has not yet bothered to throw out.', stakes: 'Free; a find, a cut finger or nothing.', consequence: '—',
    drives: { curiosity: 0.5, greed: 0.3 }, bonus: 0.03, intent: ['Blackbird looks in a bin and decides it has potential.'],
    ok: open,
    check: { parts: ['scavenging', ['tinkering', 0.3]], base: 0.492, per: 0.07,
      win: R(['The scrap bin at {shop} is mostly cable and one very interesting bracket. She leaves with a bundle of salvage, and the broker, who watched the whole thing, says nothing and writes a number down.'], { item: 'scrap_metal', train: [['scavenging', 2]], xp: 2 }),
      lose: R(['Blackbird goes up to her elbow in the scrap bin at {shop} and comes out with a cut finger and an old shoe.'], { hurt: 0.15 }) },
  }),
  row({
    id: 'bargain-bin', where: { feature: 'bargain_bin' }, pace: 'quick',
    needs: ['skill:scavenging', 'skill:haggling', 'drive:greed'],
    sees: 'A bin with a sign that says EVERYTHING 5nd, and underneath it, in smaller letters, "EVERYTHING".', stakes: '5nd; a gem or a sock.', consequence: '—',
    drives: { greed: 0.5, curiosity: 0.2 }, bonus: 0.03, intent: ['Blackbird sees a sign that says 5nd and is not able to look away.'],
    ok: (w, v) => open(w, v) && cash(w) >= 5,
    check: { pay: 5, parts: ['scavenging', ['haggling', 0.3]], base: 0.442, per: 0.07,
      win: R(['A bin at {shop}, 5nd, and a snow globe of a city that no longer exists, in which it is snowing. She is quietly delighted for four minutes.'], { item: 'snow_globe', train: [['scavenging', 2]], thought: ['A city in a ball. Very metaphorical.'] }),
      lose: R(['5nd at {shop}, and a bag of identical buttons. She will never know why.'], { train: [['scavenging', 1]] }) },
  }),
  row({
    id: 'restore-curio', where: { feature: ['curio_shelf', 'antique_clock', 'stuffed_thing'] }, pace: 'session',
    needs: ['skill:art', 'skill:tinkering', 'drive:pride'],
    sees: 'A shelf of things nobody has the patience to restore and everybody has the patience to price.', stakes: 'A fee from the owner; the object might look better or much worse.', consequence: 'The shop\'s window is a little nicer.',
    drives: { pride: 0.5, curiosity: 0.2 }, bonus: 0.03, intent: ['Blackbird looks at a thing that has been neglected and takes it personally.'],
    ok: open,
    check: { who: 'owner', parts: ['art', ['tinkering', 0.5]], base: 0.442, per: 0.07,
      win: R(['{shop}: Blackbird spends a rainy afternoon on a clock that had stopped at 4:17 and finds the pin that had gone. {npc} pays {amount}nd and looks at the clock for much longer than the clock deserves.'], { cash: [18, 55], from: 'owner', train: [['art', 2], ['tinkering', 1]], affinity: 5, xp: 3, thought: ['I gave time back to a clock. Think about that.'] }),
      lose: R(['The stuffed gull at {shop} is now a different bird and does not look as pleased about it as it used to.'], { affinity: -3, train: [['art', 1]] }) },
  }),
  row({
    id: 'paint-shopfront', where: { feature: ['window_display', 'door_bell'], room: 'floor' }, pace: 'session',
    needs: ['skill:art', 'drive:pride', 'drive:greed'],
    sees: 'A shutter with three coats of other people\'s tags and a broker who will pay to see them gone.', stakes: 'A fee, a mural, and a rival crew who notice.', consequence: 'The shop has a face; the street has an opinion.',
    drives: { pride: 0.8, greed: 0.3 }, bonus: 0.03, intent: ['Blackbird stands outside a shutter and sees a canvas.'],
    ok: (w, v) => open(w, v) && cash(w) >= 6,
    check: { who: 'owner', pay: 6, parts: ['art'], base: 0.542, per: 0.07,
      win: R(['{shop} has a mural on the shutter by evening: a small dragon in a hat, holding a balance scale. {npc} pays {amount}nd and does not stop looking at it. The street, to its credit, stops to look too.'], { cash: [30, 85], from: 'owner', train: [['art', 3]], fame: 0.8, affinity: 6, xp: 3, thought: ['Art. The kind that pays rent.'] }),
      lose: R(['The shutter at {shop} ends up with a face that nobody asked for. {npc} shuts it, quickly, before more people see it.'], { affinity: -4, train: [['art', 1]] }) },
  }),
  row({
    id: 'dress-the-window', where: { feature: ['window_display', 'mannequin'] }, pace: 'session',
    needs: ['skill:art', 'stat:charm', 'skill:streetwise'],
    sees: 'A window that has had the same lamp in it since the Fall, and a broker who would like to know why nobody stops.', stakes: 'A small fee; sales that she does not get a cut of.', consequence: 'The window works.',
    drives: { pride: 0.4, greed: 0.3 }, bonus: 0.02, intent: ['Blackbird looks at the window and wonders why nobody is buying that lamp.'],
    ok: open,
    check: { who: 'owner', parts: ['art', ['stat:charm', 0.5], ['streetwise', 0.3]], base: 0.476, per: 0.06,
      win: R(['A new window at {shop}: the lamp is on its side, the watch is on a pillow and a mannequin is wearing three coats and a look. Two people stop. One buys. {npc} pays {amount}nd.'], { cash: [12, 40], from: 'owner', train: [['art', 2], ['streetwise', 1]], affinity: 4 }),
      lose: R(['The window at {shop} is rearranged. By the end of the day somebody has put the lamp back where it was.'], { affinity: -1 }) },
  }),
  row({
    id: 'test-an-instrument', where: { feature: 'instrument_wall' }, pace: 'session',
    needs: ['skill:guitar', 'skill:music', 'drive:pride'],
    sees: 'A wall of guitars hung by their necks and a sign that says PLEASE DO NOT PLAY THE EXPENSIVE ONE.', stakes: 'Free; the broker\'s ears.', consequence: 'A regular looks up and decides whether she is good.',
    drives: { pride: 0.7, curiosity: 0.2 }, bonus: 0.03, intent: ['Blackbird takes a guitar off the wall without being asked.'],
    ok: open,
    check: { who: 'regular', parts: ['guitar', ['music', 0.5]], base: 0.492, per: 0.07,
      win: R(['{shop}: Blackbird tries a guitar that has been on the wall since last winter. By the end of the first verse nobody is looking at the watches. A regular drops {amount}nd in the tip jar.'], { cash: [8, 38], train: [['guitar', 3], ['music', 1]], fame: 0.8, affinity: 3, thought: ['I could be a professional. If I stopped being a hero.'] }),
      lose: R(['Blackbird picks the expensive guitar. {npc} says "please" in a voice a lot like a door closing.'], { affinity: -3, train: [['guitar', 1]] }) },
  }),
  row({
    id: 'busk-practice-amp', where: { feature: ['practice_amp', 'tip_jar'] }, pace: 'session',
    needs: ['skill:vocals', 'skill:guitar', 'skill:beatbox', 'drive:pride'],
    sees: 'A practice amp, a stool and a tip jar that is plainly meant for something.', stakes: 'Tips; the broker\'s opinion of her taste.', consequence: 'A few regulars hum on their way out.',
    drives: { pride: 0.8, greed: 0.3 }, bonus: 0.04, intent: ['Blackbird sits on the stool and plugs something in.'],
    ok: open,
    check: { parts: ['vocals', ['guitar', 0.6], ['beatbox', 0.3]], base: 0.442, per: 0.07,
      win: R(['A set at {shop}: three songs on the practice amp, a regular who forgets to leave and a tip jar with {amount}nd in it. The broker taps the counter on the beat and pretends it is for the ledger.'], { cash: [10, 45], train: [['vocals', 2], ['guitar', 1], ['beatbox', 1]], fame: 1, thought: ['Standing ovation. From one regular. Standing.'] }),
      lose: R(['A set at {shop}. The amp feeds back at the climax. A regular leaves and a pigeon, presumably, learns something.'], { train: [['vocals', 1]], affinity: -1 }) },
  }),
  row({
    id: 'jukebox-set', where: { feature: ['jukebox', 'practice_amp'] }, pace: 'session',
    needs: ['skill:djing', 'skill:music', 'skill:beatbox'],
    sees: 'A jukebox with a stuck track and a broker who has not heard a new one in years.', stakes: 'Tips; maybe a floor of dancing regulars.', consequence: '—',
    drives: { pride: 0.5, curiosity: 0.2 }, bonus: 0.03, intent: ['Blackbird looks at a jukebox and feels it is time for something else.'],
    ok: open,
    check: { parts: ['djing', ['music', 0.5], ['beatbox', 0.3]], base: 0.442, per: 0.07,
      win: R(['The jukebox at {shop} is wired into a mix by someone with a taste for the third track. Two regulars start swaying. One tips {amount}nd. {npc} says nothing but looks, for the first time, like a fan.'], { cash: [8, 32], train: [['djing', 2], ['music', 1]], fame: 0.6, affinity: 2 }),
      lose: R(['The jukebox at {shop} plays two songs at once, then the one it always plays. Nobody asks again.'], { train: [['djing', 1]] }) },
  }),
  row({
    id: 'dance-in-the-aisle', where: { feature: ['jukebox', 'practice_amp', 'try_on_mirror'] }, pace: 'quick',
    needs: ['skill:dancing', 'stat:charm', 'drive:pride'],
    sees: 'Floor space between the shelves, a song and a regular who has been tapping a foot.', stakes: 'A few tips; a regular\'s attention.', consequence: '—',
    drives: { pride: 0.6, lust: 0.2 }, bonus: 0.02, intent: ['Blackbird finds a gap between two shelves and a song to fill it.'],
    ok: open,
    check: { who: 'regular', parts: ['dancing', ['stat:charm', 0.4]], base: 0.43, per: 0.07,
      win: R(['A dance in the aisle at {shop}, between a rack of coats and a wall of clocks. {npc} drops {amount}nd in her hand and says it is for the show.'], { cash: [4, 22], train: [['dancing', 2]], fame: 0.5, affinity: 4, thought: ['Choreographed. Every step. Against the shelf.'] }),
      lose: R(['A dance at {shop} ends in a clock. It was a very old clock. {npc} puts out a hand and does not smile.'], { loseCash: [4, 12], train: [['dancing', 1]] }) },
  }),
  row({
    id: 'flirt-the-counter', where: { room: ['floor', 'showroom'] }, pace: 'quick',
    needs: ['skill:romance', 'stat:charm', 'drive:lust'],
    sees: 'A clerk or a customer with a ring-sized box and the look of someone who would like to think about something else.', stakes: 'A date or a flat no; a broker who has seen it before.', consequence: 'The target remembers.',
    drives: { lust: 1.0, pride: 0.4 }, bonus: 0.05, intent: ['Blackbird notices someone at the counter with a good hand and a small smile.'],
    ok: (w, v) => open(w, v) && !!find(v, 'fair'),
    run: (c, v) => {
      const { w, rng } = c;
      const h = w.hero;
      const target = find(v, 'fair', rng);
      if (!target) {
        say(c, 'flirt.nobody', 'mixed', ['Blackbird leans on the counter at {shop} and finds there is nobody to be charming at. The parrot, if there is one, is unimpressed.'], ['Practice. For later.'], { shop: v.main.name });
        return;
      }
      const p = 0.324 + 0.03 * h.charm + 0.04 * skillRoot(h, 'romance') + target.affinity / 300;
      if (rng.chance(Math.min(0.85, p))) {
        target.affinity += 10;
        kindle(h, 0.15);
        train(c, 'romance', 2);
        say(c, 'flirt.win', 'good', ['{npc} laughs at a line about the price of a gold chain, and a second at a line about the price of a smile. They leave {shop} on a different errand, together.'], ['Hocked a line, got a lover. Fair deal.'], { shop: v.main.name }, { npc: target.name });
      } else {
        target.affinity -= 4;
        train(c, 'romance', 1);
        say(c, 'flirt.lose', 'bad', ['{npc} listens to Blackbird\'s line about the gold chain, holds up one hand and says "no". It is a clean "no". It is, if anything, well-appraised.'], ['They are being coy. At the speed of a refusal.'], { shop: v.main.name }, { npc: target.name });
      }
    },
  }),
  row({
    id: 'mirror-moment', where: { feature: 'try_on_mirror' }, pace: 'quick',
    needs: ['skill:dancing', 'skill:romance', 'drive:lust', 'drive:pride'],
    sees: 'A tall mirror, a rack of coats and the possibility that somebody is watching.', stakes: 'Nothing; the look on a stranger\'s face.', consequence: 'Someone remembers the coat.',
    drives: { lust: 0.5, pride: 0.7 }, bonus: 0.03, intent: ['Blackbird tries on a coat at a mirror and does not look away.'],
    ok: open,
    check: { who: 'fair', parts: ['romance', ['dancing', 0.4], ['stat:charm', 0.4]], base: 0.428, per: 0.06,
      win: R(['{shop}: Blackbird tries on a long coat in the mirror, turns, and catches {npc} watching from the rack. {They} look{s} away much too late. They talk about coats for twenty minutes.'], { affinity: 7, train: [['romance', 1], ['dancing', 1]], fame: 0.3, thought: ['Coats are my love language.'] }),
      lose: R(['Blackbird tries a coat at {shop} and the mirror, in an act of betrayal, shows her the back.'], { affinity: -1 }) },
  }),
  row({
    id: 'ring-browse', where: { feature: 'jewellery_case' }, pace: 'quick',
    needs: ['skill:romance', 'stat:charm', 'drive:lust'],
    sees: 'A jewellery case, a pair of quiet people with a small decision to make and a clerk who has seen every kind of silence.', stakes: 'An awkward moment, or a lovely one.', consequence: '—',
    drives: { lust: 0.6, curiosity: 0.2 }, bonus: 0.02, intent: ['Blackbird looks at the rings. Only to look, of course.'],
    ok: (w, v) => open(w, v) && !!find(v, 'fair'),
    check: { who: 'fair', parts: ['romance', ['stat:charm', 0.5]], base: 0.374, per: 0.06,
      win: R(['{shop}: Blackbird admires a ring at the same time as {npc}, who is on the other side of the case. They both laugh. The clerk, kindly, leaves them to it.'], { affinity: 6, train: [['romance', 2]], thought: ['I am not engaged. I am browsing. Very interested. Browsing.'] }),
      lose: R(['{npc} watches Blackbird admire the engagement rings, and moves along the case at the exact speed of a person leaving.'], { affinity: -2 }) },
  }),
  row({
    id: 'gossip-at-the-counter', where: { feature: ['counter', 'notice_board'] }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:rapport', 'drive:curiosity'],
    sees: 'A counter where everyone tells the broker where it came from, in very small words.', stakes: 'A name or two; the broker\'s patience.', consequence: 'She knows who is hot this week.',
    drives: { curiosity: 0.7 }, bonus: 0.03, intent: ['Blackbird leans against the counter and listens with her whole body.'],
    ok: open,
    check: { who: 'regular', parts: ['streetwise', ['stat:charm', 0.3]], base: 0.482, per: 0.07,
      win: R(['At {shop}, Blackbird listens to {npc} tell the broker, in a lowered voice, why a watch is not for sale. It involves {tip}, and a lot of paper. She nods as if she did not hear.'], { tip: true, train: [['streetwise', 2]], xp: 2, thought: ['Names are currency. I am rich.'] }),
      lose: R(['Everyone at {shop} falls silent when Blackbird leans in. It is a very noisy kind of silence.'], { train: [['streetwise', 1]] }) },
  }),
  row({
    id: 'read-the-board', where: { feature: 'notice_board' }, pace: 'quick',
    needs: ['skill:streetwise', 'drive:curiosity', 'drive:quest'],
    sees: 'A board of ads, appeals and lost things; the real news in the city, set in biro.', stakes: 'Free; a lead, a favour.', consequence: '—',
    drives: { curiosity: 0.6, quest: 0.3 }, bonus: 0.03, intent: ['Blackbird reads the board, all of it, even the ones for pets.'],
    ok: open,
    check: { parts: ['streetwise', ['scavenging', 0.2]], base: 0.58, per: 0.05,
      win: R(['The board at {shop} has a notice about a wanted person, a reward and a smudge that looks like {tip}. She tears a corner off and pretends it is a bus ticket.'], { tip: true, train: [['streetwise', 1]], xp: 2 }),
      lose: R(['The board at {shop} is ads for room shares, a cat and a protest. She reads all of it and learns nothing.'], { train: [['streetwise', 1]] }) },
  }),
  row({
    id: 'darts-for-pocket', where: { feature: 'dartboard' }, pace: 'session',
    needs: ['skill:throwing', 'drive:pride', 'drive:greed'],
    sees: 'A dartboard that has been hit in the same three places for eleven years.', stakes: 'A round of throws for a few neodollars from someone who thinks they are better.', consequence: 'A rival who has seen her form.',
    drives: { pride: 0.7, greed: 0.3 }, bonus: 0.03, intent: ['Blackbird picks up three darts and tests their weight.'],
    ok: open,
    check: { who: 'regular', parts: ['throwing', ['stat:reflex', 0.3]], base: 0.432, per: 0.07,
      win: R(['A game of darts at {shop}: Blackbird beats {npc} by a double top and a bad decision on {their} part. {amount}nd and a handshake that lasts too long.'], { cash: [6, 30], from: 'who', train: [['throwing', 2]], affinity: 2, thought: ['Triple twenty. Of course.'] }),
      lose: R(['{npc} takes Blackbird\'s money at darts at {shop} and tells her, nicely, about her wrist.'], { loseCash: [4, 15], train: [['throwing', 1]], affinity: 1 }) },
  }),
  row({
    id: 'shoot-pool-back', where: { feature: 'pool_table' }, pace: 'session',
    needs: ['skill:pool', 'drive:pride', 'drive:greed'],
    sees: 'A pool table in the back with a cue that is slightly shorter than the others.', stakes: 'A frame for a few neodollars against someone who is better than they let on.', consequence: '—',
    drives: { pride: 0.7, greed: 0.3 }, bonus: 0.03, intent: ['Blackbird racks the balls and does not blink.'],
    ok: open,
    check: { who: 'regular', parts: ['pool', ['stat:reflex', 0.2]], base: 0.435, per: 0.07,
      win: R(['A frame at {shop}: Blackbird clears the table and {npc}\'s pride in about nine minutes. {amount}nd and a stare.'], { cash: [8, 35], from: 'who', train: [['pool', 3]], affinity: -1, thought: ['Banked it off the lamp. Obviously.'] }),
      lose: R(['{npc} runs the table at {shop} while Blackbird watches, and then takes the cash with the tact of a man who has never been rude.'], { loseCash: [5, 18], train: [['pool', 1]] }) },
  }),
  row({
    id: 'card-game-parlour', where: { room: 'parlour', feature: 'card_table' }, pace: 'session',
    needs: ['skill:cards', 'skill:grifting', 'skill:sleight', 'drive:greed'],
    sees: 'A table in the back with a lamp over it and a half-empty chair.', stakes: 'A stake; a pot; a regular who may be a bad loser.', consequence: 'A reputation as a player, or a very particular kind of face.',
    drives: { greed: 0.8, pride: 0.4 }, bonus: 0.04, risk: 0.3, intent: ['Blackbird sees a lamp over a card table and a chair that is a lot like an invitation.'],
    ok: (w, v) => open(w, v) && cash(w) >= 20,
    check: { who: 'fence', pay: 20, parts: ['cards', ['grifting', 0.5], ['sleight', 0.4]], base: 0.442, per: 0.07,
      win: R(['A game in the back of {shop}: {npc} deals, Blackbird bluffs with her whole face and takes a pot of {amount}nd. {npc} says "again" like it is a threat.'], { cash: [35, 130], from: 'who', train: [['cards', 3], ['grifting', 1]], affinity: -2, thought: ['Poker face: perfect. Poker hands: lovely.'] }),
      lose: R(['The game in the back of {shop} costs Blackbird the stake and a good deal of dignity. {npc} deals her a second hand, out of what looks like pity.'], { train: [['cards', 1]], affinity: 1 }) },
  }),
  row({
    id: 'beat-battle-back', where: { room: 'parlour' }, pace: 'session',
    needs: ['skill:beatbox', 'skill:vocals', 'skill:djing', 'drive:pride'],
    sees: 'A back room with a radio, a crowd of three and a stack of chairs that make a very good drum kit.', stakes: 'A few neodollars and bragging rights.', consequence: 'The back room has a new champion.',
    drives: { pride: 0.8 }, bonus: 0.03, intent: ['Blackbird sees a stack of chairs and thinks "snare".'],
    ok: open,
    check: { who: 'regular', parts: ['beatbox', ['vocals', 0.5], ['djing', 0.3]], base: 0.442, per: 0.07,
      win: R(['A beat battle in the back of {shop}: {npc} has a kick, Blackbird has a kick, a snare and a hi-hat made of a sneeze. The three regulars call it for her. {amount}nd.'], { cash: [8, 32], train: [['beatbox', 3], ['vocals', 1]], fame: 0.6, affinity: 3 }),
      lose: R(['{npc} beatboxes a fire alarm, then a train, then Blackbird. She is beaten, in rhythm.'], { train: [['beatbox', 1]], affinity: 1 }) },
  }),
  row({
    id: 'test-fire-cage', where: { room: 'cage', feature: 'gun_rack' }, pace: 'session',
    needs: ['skill:marksmanship', 'skill:throwing', 'drive:bravery'],
    sees: 'A rack of weapons marked "decorative", a hatch to pass things through and a guard on a stool.', stakes: 'A free look; a lecture on the safety card.', consequence: 'The guard has her on a list: the short one.',
    drives: { bravery: 0.5, pride: 0.3, curiosity: 0.3 }, bonus: 0.03, intent: ['Blackbird looks through the bars at a very tidy line of things that are decorative.'],
    ok: open,
    check: { who: 'guard', parts: ['marksmanship', ['throwing', 0.4]], base: 0.492, per: 0.07,
      win: R(['{shop}: through the cage hatch, with a pistol that is certainly not loaded, Blackbird dry-fires at a paper tiger and hits the small circle. {npc} writes it down. "Decorative," {they} say{s}, slowly.'], { train: [['marksmanship', 2], ['throwing', 1]], xp: 2, affinity: 3, thought: ['The tiger never saw it coming. It never sees anything. It is paper.'] }),
      lose: R(['Blackbird dry-fires at a paper tiger and the pistol, which is not loaded, shows her it is not. {npc} leans on the safety card like a closing door.'], { train: [['marksmanship', 1]], affinity: -2 }) },
  }),
  row({
    id: 'reflex-catch', where: { feature: ['display_case', 'tool_wall', 'window_display'] }, pace: 'quick',
    needs: ['stat:reflex', 'skill:athletics', 'drive:bravery'],
    sees: 'A shelf that has been leaning for years and a customer with a tall elbow.', stakes: 'A reward from a grateful owner, or a very expensive breakage.', consequence: 'The owner notices her speed.',
    drives: { bravery: 0.4, pride: 0.3 }, bonus: 0.03, intent: ['Blackbird sees a shelf leaning and measures the distance to it.'],
    ok: open,
    check: { who: 'owner', parts: ['stat:reflex', ['athletics', 0.5]], base: 0.462, per: 0.06,
      win: R(['A shelf comes down at {shop}. Blackbird catches a vase, a lamp and a very old clock in one dive. {npc} gives her {amount}nd out of the till and does not breathe for ten seconds.'], { cash: [10, 40], from: 'owner', train: [['athletics', 2]], affinity: 5, fame: 0.5, thought: ['Reflexes. I am practically a cat. A cat with a plan.'] }),
      lose: R(['A shelf comes down at {shop}. Blackbird catches the lamp and not much else. She is invoiced.'], { loseCash: [10, 30], affinity: -3 }) },
  }),
  row({
    id: 'carry-the-heavy', where: { room: ['floor', 'bay'] }, pace: 'session',
    needs: ['stat:muscle', 'skill:athletics', 'drive:greed'],
    sees: 'A safe on a trolley, a delivery of crates and a broker with a bad back and a fair wage.', stakes: 'A few neodollars and a strained back.', consequence: 'The broker has someone to ask.',
    drives: { greed: 0.5, pride: 0.2 }, bonus: 0.03, intent: ['Blackbird looks at a crate and at her arms, in that order.'],
    ok: open,
    check: { who: 'owner', parts: ['stat:muscle', ['athletics', 0.5]], base: 0.56, per: 0.05, physical: true,
      win: R(['{shop}: Blackbird carries a crate of clocks up a flight of stairs, then another, then a very large safe on a trolley. {npc} pays {amount}nd, and the clocks do not stop.'], { cash: [14, 38], from: 'owner', train: [['athletics', 2]], sore: 0.08, affinity: 3 }),
      lose: R(['Blackbird gets one end of a safe at {shop}. The safe has other plans. She is told it is not her fault, and billed anyway.'], { sore: 0.1, hurt: 0.15, affinity: -1 }) },
  }),
  row({
    id: 'lean-on-the-broker', where: { feature: 'counter' }, pace: 'fight',
    needs: ['skill:intimidation', 'stat:muscle', 'drive:bravery'],
    sees: 'A broker with a thin smile, a ledger of unfair rates and nobody behind the counter but a bat.', stakes: 'A better rate, handed over under protest; heat, a grudge or a scrap.', consequence: 'The broker never forgets, and tells the next customer.',
    drives: { bravery: 0.8, greed: 0.5 }, bonus: 0.05, risk: 0.7, intent: ['Blackbird reads the broker\'s rate card and the broker reads Blackbird\'s fists.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner') && w.hero.hp >= w.hero.maxHp * 0.4,
    check: { who: 'owner', parts: ['intimidation', ['stat:muscle', 0.5]], base: 0.328, per: 0.07,
      win: R(['{shop}: Blackbird puts a fist on the counter and a smile on her face. {npc} finds an extra {amount}nd in the till that was not there before and says "a service charge, for you, rebated".'], { cash: [20, 80], from: 'owner', train: [['intimidation', 2]], affinity: -12, warn: ['intimidate', 1], heat: ['place', 1], thought: ['A reasonable rate. At last.'] }),
      lose: R(['{npc} reaches for something under the counter and Blackbird realises, a little late, that this is a shop with a bat.'], { fight: true, heat: ['place', 2], affinity: -15 }) },
  }),
  row({
    id: 'feed-the-parrot', where: { feature: 'parrot' }, pace: 'quick',
    needs: ['skill:rapport', 'skill:streetwise', 'drive:curiosity'],
    sees: 'A parrot on the counter calling out prices, and giving the broker a very flat look indeed.', stakes: 'A seed or two; the bird\'s confidence.', consequence: 'The parrot has a favourite.',
    drives: { curiosity: 0.5 }, bonus: 0.03, intent: ['Blackbird makes eye contact with a parrot, which is a mistake, and carries on.'],
    ok: open,
    check: { parts: ['rapport', ['streetwise', 0.3]], base: 0.536, per: 0.06,
      win: R(['The parrot at {shop} tilts its head and says "four hundred" when Blackbird holds up the thing she was going to hock. She had no idea. It was a price. Good bird.'], { train: [['rapport', 2]], tip: true, affinity: 2, thought: ['I understand parrots. Parrots understand me. We are both very honest.'] }),
      lose: R(['The parrot at {shop} says a very rude word in the broker\'s voice, and then in hers.'], { train: [['rapport', 1]], affinity: -2 }) },
  }),
  row({
    id: 'befriend-the-cat', where: { feature: 'shop_cat' }, pace: 'quick',
    needs: ['skill:rapport', 'drive:curiosity'],
    sees: 'A cat on a shelf of clocks who has opinions about the stock and every person who handles it.', stakes: 'A scratch; a find.', consequence: 'The cat sleeps on her coat.',
    drives: { curiosity: 0.5 }, bonus: 0.03, intent: ['Blackbird holds out a hand to the shop cat, and the cat considers it.'],
    ok: open,
    check: { parts: ['rapport'], base: 0.536, per: 0.06,
      win: R(['The shop cat at {shop} lets Blackbird scratch behind its ears, then leads her to a gap behind the shelf where a gold tooth has been for six months. It looks at her like a partner in a heist.'], { item: 'gold_tooth', train: [['rapport', 2]], thought: ['The cat and I have an understanding. It is entirely about the tooth.'] }),
      lose: R(['The shop cat at {shop} considers Blackbird\'s hand, and her face, and gives her an opinion with its claws.'], { train: [['rapport', 1]], hurt: 0.1 }) },
  }),
  row({
    id: 'pigeons-on-the-roof', where: { feature: 'pigeon_coop' }, pace: 'quick',
    needs: ['skill:rapport', 'skill:scavenging', 'drive:curiosity'],
    sees: 'A coop on the roof and a flock of very important pigeons.', stakes: 'Free; a trinket they have stolen, or a peck.', consequence: 'The pigeons know her.',
    drives: { curiosity: 0.4 }, bonus: 0.02, intent: ['Blackbird goes up to see the pigeons, which is always the right call.'],
    ok: open,
    check: { parts: ['rapport', ['scavenging', 0.4]], base: 0.536, per: 0.06,
      win: R(['The pigeons on the roof of {shop} regard Blackbird as one of their own and let her pick through the nest of trinkets they have carried up over the years. She comes away with a signet ring, and no regrets.'], { item: 'signet_ring', train: [['rapport', 2], ['scavenging', 1]], thought: ['They gave it to me. It was a tribute.'] }),
      lose: R(['The pigeons on the roof of {shop} are not impressed with Blackbird at all, and say so with their whole flock.'], { train: [['rapport', 1]], hurt: 0.1 }) },
  }),
  row({
    id: 'cook-for-the-staff', where: { room: ['floor', 'office', 'workshop', 'bay'] }, pace: 'session',
    needs: ['skill:cooking', 'skill:mixology', 'drive:thirst'],
    sees: 'A hot plate behind the counter, a drawer of spoons and staff who have been eating biscuits since dawn.', stakes: 'A few neodollars and a better lunch.', consequence: 'The staff like her more.',
    drives: { thirst: 0.3, greed: 0.2 }, bonus: 0.03, intent: ['Blackbird looks at the hot plate and decides she is the cook now.'],
    ok: open,
    check: { who: 'staff', parts: ['cooking', ['mixology', 0.3]], base: 0.536, per: 0.06,
      win: R(['At {shop}, Blackbird makes noodles on the hot plate with a broker\'s hoard of spices. {npc} eats the whole bowl, then another, and leaves {amount}nd on the counter for "a tip".'], { cash: [6, 26], from: 'who', train: [['cooking', 2], ['mixology', 1]], affinity: 5, thought: ['A true chef. Of the back-room kind.'] }),
      lose: R(['The noodles at {shop} come out the colour of a flood. {npc} eats a mouthful, politely, and takes up the biscuits again.'], { train: [['cooking', 1]], affinity: -1 }) },
  }),
  row({
    id: 'the-bottle-under-the-counter', where: { feature: ['counter', 'card_table'] }, pace: 'session',
    needs: ['skill:tolerance', 'skill:mixology', 'drive:thirst'],
    sees: 'A bottle under the counter that the broker brings out for customers who are very, very sad, or very good.', stakes: 'A glass or three; a hangover or a friend.', consequence: 'The broker has a drinking buddy.',
    drives: { thirst: 0.9, pride: 0.2 }, bonus: 0.03, intent: ['Blackbird sees a bottle under the counter and a broker looking at it the wrong way.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['tolerance', ['mixology', 0.3]], base: 0.486, per: 0.06,
      win: R(['After hours at {shop}, {npc} brings out the bottle. Blackbird matches {them} glass for glass. {They} tell{s} her three things about the shelf that are not on any tag, and press{es} {amount}nd on her for the company.'], { cash: [6, 22], from: 'owner', drunk: 1, train: [['tolerance', 2]], affinity: 8, tip: true, thought: ['Liver of steel. Heart of chrome. Memory of the next morning: absent.'] }),
      lose: R(['{npc} brings out the bottle at {shop} and Blackbird gets about as far as the second glass. {They} put{s} a bucket by her chair, tenderly.'], { drunk: 3, train: [['tolerance', 1]], affinity: 2 }) },
  }),
  row({
    id: 'patch-a-regular', where: { room: ['floor', 'workshop', 'bay', 'showroom'] }, pace: 'quick',
    needs: ['skill:medicine', 'skill:rapport', 'drive:curiosity'],
    sees: 'Someone holding a hand that is the wrong shape, a first-aid tin and a broker who would rather not call the NPD.', stakes: 'A small fee; a grateful regular.', consequence: 'The regular owes her one.',
    drives: { curiosity: 0.3, greed: 0.2 }, bonus: 0.03, intent: ['Blackbird notices a customer wincing and a first-aid tin at the same time.'],
    ok: (w, v) => open(w, v) && !!(find(v, 'regular') ?? find(v, 'clerk')),
    check: { who: 'regular', parts: ['medicine', ['rapport', 0.2]], base: 0.586, per: 0.06,
      win: R(['{shop}: {npc} slammed a hand in the shutter. Blackbird splints it with two pens and a roll of price labels. {They} press{es} {amount}nd into her palm and tell{s} her a story about a very old gold watch.'], { cash: [6, 30], from: 'who', train: [['medicine', 2]], affinity: 6, xp: 2, thought: ['Doctor Blackbird. Please hold your applause.'] }),
      lose: R(['Blackbird applies a splint at {shop} that is more an opinion than a splint. {npc} leaves, holding the hand up like a flag.'], { train: [['medicine', 1]], affinity: -2 }) },
  }),
  row({
    id: 'read-the-provenance', where: { feature: ['curio_shelf', 'trophy_wall', 'display_case'] }, pace: 'quick',
    needs: ['drive:curiosity', 'drive:quest', 'skill:scavenging', 'skill:streetwise'],
    sees: 'An object with a label that is plainly lying and a past that is not.', stakes: 'A story, a name and maybe a lead.', consequence: '—',
    drives: { curiosity: 0.9, quest: 0.3 }, bonus: 0.03, intent: ['Blackbird holds a thing up to the light and asks it where it has been.'],
    ok: open,
    check: { parts: ['scavenging', ['streetwise', 0.4]], base: 0.486, per: 0.06,
      win: R(['{shop}: Blackbird traces a brooch back through three owners, a divorce and a very famous burglary. It ends with {tip} and a name on a receipt. She sets it back with great care.'], { tip: true, train: [['scavenging', 2], ['streetwise', 1]], xp: 3 }),
      lose: R(['The provenance of the brooch at {shop} turns out to be a drawing of a brooch. She sets it back.'], { train: [['scavenging', 1]] }) },
  }),
  row({
    id: 'con-the-queue', where: { room: 'floor' }, pace: 'session',
    needs: ['skill:grifting', 'skill:hustling', 'stat:charm', 'drive:greed'],
    sees: 'A queue of sellers with nothing in their faces but numbers, and a broker busy at the other end.', stakes: 'A quick few neodollars from a stranger; a slap.', consequence: 'A seller learns a lesson, and not a cruel one.',
    drives: { greed: 0.7 }, bonus: 0.03, risk: 0.3, intent: ['Blackbird looks at the queue and sees an audience.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['grifting', ['hustling', 0.4], ['stat:charm', 0.4]], base: 0.433, per: 0.07,
      win: R(['In the queue at {shop}, Blackbird tells {npc} that the broker pays double for brooches on Tuesdays, which it is, in fact, not. She sells {them} a "Tuesday pass" for {amount}nd. {npc} says thank you.'], { cash: [8, 32], from: 'who', train: [['grifting', 2]], affinity: -4, warn: ['scam', 1], thought: ['Education is the best business.'] }),
      lose: R(['{npc} hears the Tuesday story, looks at Blackbird with a very patient face, and says, "I know the broker."'], { affinity: -3, warn: ['scam', 1] }) },
  }),
  row({
    id: 'chase-the-hot-ticket', where: { feature: 'cctv_console', room: ['floor', 'office'] }, pace: 'quick',
    needs: ['stat:int', 'skill:streetwise', 'drive:curiosity'],
    sees: 'A CCTV console with a list of the last twenty sellers, which a broker says is "just for the insurance".', stakes: 'Free; the rest of the day\'s secrets.', consequence: 'The cameras know her face a little better.',
    drives: { curiosity: 0.6 }, bonus: 0.03, intent: ['Blackbird glances at the CCTV console and the console glances back.'],
    ok: open,
    check: { parts: ['stat:int', ['streetwise', 0.3]], base: 0.46, per: 0.07,
      win: R(['{shop}: the console shows twenty sellers, all of them small. One is {tip}, carrying a bag that is much too heavy for the day. She makes a note on a napkin.'], { tip: true, train: [['streetwise', 1]], xp: 3, thought: ['I am a detective. A pretty one.'] }),
      lose: R(['The CCTV console at {shop} shows Blackbird looking at it. This is not as useful as she would have liked.'], { heat: ['place', 0.5] }) },
  }),
  row({
    id: 'queue-for-the-vending', where: { feature: 'vending' }, pace: 'quick',
    needs: ['stat:int', 'skill:tinkering', 'drive:thirst'],
    sees: 'A vending machine that sells a fizzy drink and, according to the lights, something else.', stakes: 'A free can and a bit of gossip; a stuck coin.', consequence: '—',
    drives: { thirst: 0.5, curiosity: 0.2 }, bonus: 0.02, intent: ['Blackbird looks at the vending machine the way a thief looks at a window.'],
    ok: open,
    check: { parts: [['stat:int', 0.7], 'tinkering'], base: 0.5, per: 0.06,
      win: R(['The vending machine at {shop} coughs up a can, a second can and a bag of something that was probably nuts. Blackbird drinks to her own good fortune and no one else\'s.'], { train: [['tinkering', 1]], drunk: 0.5, item: 'protein_tub', thought: ['Free lunch. Technically theft. Practically a tip.'] }),
      lose: R(['The vending machine at {shop} takes Blackbird\'s coin, tuts and does nothing else.'], { loseCash: [1, 3] }) },
  }),
];
