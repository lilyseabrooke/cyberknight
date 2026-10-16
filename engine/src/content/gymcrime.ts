import { register, type Affordance } from '../affordances';
import { banned, type GymView } from '../gymkit';
import { R, row } from './gymafford';

/**
 * The quiet half of a gym: lockers, safes, terminals, vents and the people who look at them. Same shape as the others:
 * a capability, what it sees, what it costs. A caught attempt costs heat at the gym, a grudge, or a scrap; nothing is
 * ever grim, and the owners are not the joke.
 */

const notBanned = (w: Parameters<NonNullable<Affordance<GymView>['ok']>>[0], v: GymView): boolean => !banned(w, v.main);

export const CRIME: Affordance<GymView>[] = [
  row({
    id: 'lockers-burgle', where: { feature: 'lockers' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:sneak', 'skill:sleight', 'drive:greed'],
    sees: 'Eighty lockers, half with the cheap kind of padlock, and a room that empties at nine.', stakes: 'Wallets and gear; a regular who comes back early.', consequence: 'Heat on the gym; a regular who knows her face.',
    drives: { greed: 1.2, curiosity: 0.2 }, bonus: 0.05, risk: 0.5, intent: ['Blackbird counts lockers. There are many. Some of them are not even locked properly.'],
    ok: notBanned,
    check: { parts: ['lockpicking', ['sneak', 0.6], ['sleight', 0.3]], base: 0.3, per: 0.07, dark: 0.15,
      win: R(['A row of lockers at {gym}, a wire and a good ear. Blackbird comes out with {amount}nd and a pair of very nice shoes. She leaves the shoes.', 'Blackbird goes down a row of lockers at {gym} like a librarian. {amount}nd in wallets and a protein bar.'], { cash: [25, 120], train: [['lockpicking', 2], ['sneak', 1]], xp: 4, thought: ['Cheap padlocks. It is an invitation. It is practically a gift.'] }),
      lose: R(['A regular walks into the locker room at {gym} while Blackbird has a wire in somebody else\'s padlock. They look at each other for a while.'], { heat: ['gym', 1], affinity: -10, fight: true }) },
  }),
  row({
    id: 'lost-found-lift', where: { feature: 'lost_found' }, pace: 'quick',
    needs: ['skill:sleight', 'skill:scavenging', 'drive:greed'],
    sees: 'A box of things people forgot, which someone will soon remember.', stakes: 'A pocketful of small valuables.', consequence: '—',
    drives: { greed: 0.7 }, bonus: 0.05, intent: ['Blackbird sees a lost-and-found box with a lid that does not quite close.'],
    check: { parts: ['sleight', ['scavenging', 0.4]], base: 0.5, per: 0.06,
      win: R(['The lost-and-found at {gym} has a watch, a loose gold tooth and {amount}nd in coins. It has less now.'], { cash: [8, 40], item: 'gold_tooth', train: [['sleight', 2]], xp: 2 }),
      lose: R(['The lost-and-found at {gym} is mostly socks. Blackbird takes one sock out of embarrassment.'], {}) },
  }),
  row({
    id: 'safe-crack', where: { feature: 'safe' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:tinkering', 'stat:hack', 'drive:greed'],
    sees: 'A safe under a desk with a sticker on it that says SAFE.', stakes: 'The takings and the owner\'s secrets; an alarm and an angry champion.', consequence: 'Heat on the gym; the owner never forgets.',
    drives: { greed: 1.4, curiosity: 0.3 }, bonus: 0.0, risk: 1.0, intent: ['Blackbird kneels by the safe, which has a sticker on it that says SAFE.'],
    ok: notBanned,
    check: { parts: ['lockpicking', ['tinkering', 0.5], ['stat:hack', 0.4]], base: 0.15, per: 0.07, dark: 0.1,
      win: R(['The safe at {gym} opens with a click and a smell of old cigars. {amount}nd, a ledger of "extra" fees and a medal.'], { cash: [60, 260], from: 'owner', train: [['lockpicking', 3]], affinity: -15, heat: ['gym', 1], xp: 6, thought: ['Sticker says SAFE. Sticker lies.'] }),
      lose: R(['The safe at {gym} is not just a safe; it is also an alarm. The owner arrives in a vest and a bad mood.'], { fight: true, heat: ['gym', 2], affinity: -20 }) },
  }),
  row({
    id: 'ledger-skim', where: { feature: 'ledger' }, pace: 'session',
    needs: ['stat:hack', 'skill:streetwise', 'skill:grifting', 'drive:greed'],
    sees: 'A ledger with a column nobody has been looking at.', stakes: 'A quiet skim off the books; an audit.', consequence: 'The books are wrong, forever.',
    drives: { greed: 1.0, curiosity: 0.4 }, bonus: 0.0, risk: 0.5, intent: ['Blackbird opens the ledger. It is arithmetic with a motive.'],
    ok: notBanned,
    check: { who: 'owner', parts: [['stat:hack', 0.7], ['grifting', 0.7], ['streetwise', 0.3]], base: 0.25, per: 0.07,
      win: R(['Blackbird moves {amount}nd from the "equipment fund" to the "other equipment fund" at {gym}. It is, strictly, a loan.'], { cash: [30, 110], from: 'owner', train: [['grifting', 2]], xp: 4 }),
      lose: R(['The ledger at {gym} has a footnote. The footnote is {owner}. "Oh good," {they} say{s}. "You can read."'], { fight: true, heat: ['gym', 1], affinity: -15 }) },
  }),
  row({
    id: 'cctv-wipe', where: { feature: 'cctv_console' }, pace: 'session',
    needs: ['stat:hack', 'skill:tinkering', 'skill:sneak', 'drive:curiosity'],
    sees: 'A console with a monitor for every corner and a janitor who sleeps at it.', stakes: 'No more cameras at this gym, for good, or an alarm.', consequence: 'No one will ever see what she did here again.',
    drives: { curiosity: 0.6, greed: 0.3 }, bonus: 0.05, intent: ['Blackbird looks at the CCTV console. The janitor at the console is asleep.'],
    ok: (w, v) => v.main.cameras > 0 && !banned(w, v.main),
    check: { parts: [['stat:hack', 1], ['tinkering', 0.5]], base: 0.3, per: 0.07, dark: 0.2,
      win: R(['The CCTV at {gym} goes down one camera at a time, and then, for all practical purposes, for good. Nobody notices. The janitor dreams on.'], { cameras: 0, train: [['tinkering', 1]], xp: 4 }),
      lose: R(['The console at {gym} beeps and, in a very nice voice, says "Please remain calm."'], { heat: ['gym', 1], hp: -1 }) },
  }),
  row({
    id: 'terminal-comp', where: { feature: 'member_terminal' }, pace: 'quick',
    needs: ['stat:hack', 'skill:streetwise', 'drive:greed'],
    sees: 'A membership terminal that thinks she is whoever she says.', stakes: 'A free pass for a good while; an alarm and a ban.', consequence: 'She gets in free; the terminal logs someone else.',
    drives: { greed: 0.6, curiosity: 0.3 }, bonus: 0.1, intent: ['Blackbird looks at the membership terminal. The terminal looks at nothing.'],
    ok: (w, v) => !banned(w, v.main) && v.price > 0,
    check: { parts: [['stat:hack', 1], ['streetwise', 0.3]], base: 0.35, per: 0.07,
      win: R(['A little work on the {gym} membership terminal and Blackbird is now a Platinum Lifetime Member, status "Deceased". Entry is free for a month.'], { passDays: 30, train: [['tinkering', 1]], xp: 3 }),
      lose: R(['The terminal at {gym} flags the account, kindly. Blackbird is "invited" to return with ID.'], { heat: ['gym', 1], affinity: -3 }) },
  }),
  row({
    id: 'scoreboard-rig', where: { feature: 'scoreboard' }, pace: 'session',
    needs: ['stat:hack', 'skill:cards', 'skill:grifting', 'drive:greed'],
    sees: 'A scoreboard everyone is betting against.', stakes: 'A killing off the book; a lot of angry bettors.', consequence: 'The room remembers.',
    drives: { greed: 0.9 }, bonus: 0.05, risk: 0.5, intent: ['Blackbird looks at the scoreboard. Somebody has put a lot of money on it.'],
    ok: (w, v) => !banned(w, v.main) && w.hero.cash >= 15,
    check: { parts: [['stat:hack', 1], ['grifting', 0.4]], base: 0.3, per: 0.07, pay: 15,
      win: R(['The scoreboard at {gym} flips, quietly, at the right moment. Blackbird takes {amount}nd off an overconfident table.'], { cash: [40, 160], train: [['grifting', 1]], warn: ['rig', 0.3], xp: 4 }),
      lose: R(['The scoreboard at {gym} flips at the wrong time. Several people turn to look at the person near the wiring.'], { thugs: ['ganger', 1], heat: ['gym', 1] }) },
  }),
  row({
    id: 'book-rig', where: { feature: 'bet_book' }, pace: 'session',
    needs: ['skill:cards', 'skill:grifting', 'skill:streetwise', 'drive:greed'],
    sees: 'A betting book run by someone who thinks they are cleverer than the odds.', stakes: 'A big win on a tip; a lean on the tail of a lie.', consequence: 'The book is wary of her.',
    drives: { greed: 1.1, curiosity: 0.2 }, bonus: 0.0, risk: 0.5, intent: ['Blackbird looks at the book. The book looks at its own odds, hopefully.'],
    ok: (w, v) => !banned(w, v.main) && w.hero.cash >= 20,
    check: { who: 'staff', parts: ['cards', ['grifting', 0.7], ['streetwise', 0.4]], base: 0.3, per: 0.07, pay: 20,
      win: R(['Blackbird plays the book at {gym} the way it is supposed to be played and the way it is not. {amount}nd, and a bookmaker who does not blink.'], { cash: [50, 220], from: 'who', train: [['cards', 2], ['grifting', 1]], warn: ['rig', 0.3], xp: 5 }),
      lose: R(['The book at {gym} wins. The book is, after all, the book.'], { train: [['cards', 1]] }) },
  }),
  row({
    id: 'donation-tin', where: { feature: 'donation_tin' }, pace: 'quick',
    needs: ['skill:sleight', 'drive:greed'],
    sees: 'A tin that says PAY WHAT YOU CAN, and underneath, WE COUNT.', stakes: 'Very little; a very bad look.', consequence: 'Everyone will know.',
    drives: { greed: 0.4 }, bonus: -0.1, risk: 0.3, intent: ['Blackbird looks at a tin that says PAY WHAT YOU CAN.'],
    ok: notBanned,
    check: { parts: ['sleight'], base: 0.55, per: 0.05,
      win: R(['Blackbird takes {amount}nd from the tin at {gym}. The tin is, notably, a charity. She feels fine about it.'], { cash: [4, 25], train: [['sleight', 1]], affinity: -3, heat: ['gym', 1] }),
      lose: R(['A regular sees Blackbird at the donation tin at {gym}. "That is for the team trip," they say, evenly. She puts it back. It is a long walk to the door.'], { affinity: -12, heat: ['gym', 1] }) },
  }),
  row({
    id: 'vent-crawl', where: { feature: ['vent_grille', 'skylight', 'side_door'] }, pace: 'session',
    needs: ['skill:sneak', 'skill:athletics', 'drive:curiosity', 'drive:greed'],
    sees: 'A way in that nobody checks and a floor with a lot to overhear.', stakes: 'A free pass; a scrape in the duct.', consequence: 'An unlogged visit.',
    drives: { curiosity: 0.6, greed: 0.3 }, bonus: 0.1, intent: ['Blackbird looks at a vent grille. It has four screws, and three of them are missing.'],
    ok: (w, v) => v.price > 0 && !banned(w, v.main),
    check: { parts: ['sneak', ['athletics', 0.5], ['stat:reflex', 0.4]], base: 0.4, per: 0.07, dark: 0.15,
      win: R(['Blackbird goes up and through the vent at {gym}. She comes out in the locker room, unseen, with a day\'s free entry and some dust on her.'], { passDays: 1, train: [['sneak', 2]], tip: true, xp: 3 }),
      lose: R(['The vent at {gym} is narrower than it looked. She is stuck for a long time with a view of a leg press.'], { hp: -3, affinity: -2 }) },
  }),
  row({
    id: 'pro-shop-lift', where: { feature: 'pro_shop_rack' }, pace: 'quick',
    needs: ['skill:sleight', 'skill:sneak', 'drive:greed'],
    sees: 'A rack of kit where the attendant keeps looking at his phone.', stakes: 'Free gear; being on the wall as a cautionary tale.', consequence: '—',
    drives: { greed: 0.8 }, bonus: 0.05, risk: 0.4, intent: ['Blackbird sees an unattended pair of speed gloves and an attendant looking at his phone.'],
    ok: notBanned,
    check: { who: 'desk', parts: ['sleight', ['sneak', 0.5]], base: 0.35, per: 0.07,
      win: R(['A pair of speed gloves leaves {gym} in Blackbird\'s jacket. The attendant looks up at the door chime and then down at his phone.'], { item: 'speed_gloves', train: [['sleight', 2]], xp: 3 }),
      lose: R(['The attendant at {gym} spots Blackbird. "Put the gloves back," {they} say{s}. She does. The conversation continues.'], { heat: ['gym', 1], affinity: -8 }) },
  }),
  row({
    id: 'trophy-case', where: { feature: 'trophy_case' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:sleight', 'drive:greed', 'drive:pride'],
    sees: 'A glass case of trophies and a belt whose gold is mostly paint.', stakes: 'The belt, and a broken heart; a lot of heat.', consequence: 'The owner will want it back.',
    drives: { greed: 0.8, pride: 0.5 }, bonus: 0.0, risk: 0.6, intent: ['Blackbird looks at a trophy case. A belt in it looks back.'],
    ok: notBanned,
    check: { who: 'owner', parts: ['lockpicking', ['sleight', 0.5]], base: 0.25, per: 0.07, dark: 0.1,
      win: R(['The case at {gym} opens with a click. The belt is lighter than it looks. Blackbird is gone before the glass finishes humming.'], { item: 'champ_belt', train: [['lockpicking', 2]], heat: ['gym', 2], affinity: -25, xp: 5 }),
      lose: R(['{owner} finds Blackbird with her hand in the {gym} trophy case. "That is for the dead," {they} say{s}, quietly. It was.'], { fight: true, heat: ['gym', 2], affinity: -25 }) },
  }),
];

register('gym', CRIME);
