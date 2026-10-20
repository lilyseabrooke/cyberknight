import { type Affordance } from '../affordances';
import { auditOnDay, GENRES } from './halls';
import { banned, cabAt, find, forge, jailbreak, playable, smash, stripBoard, type HallView } from '../hallkit';
import { dayOf, minuteOfDay } from '../clock';
import { R, row } from './hallrow';
import { FORGE, JAILBREAK, SMASH, STRIP } from './hallplay';

/**
 * The quiet half of an arcade: cash boxes, token booths, prize cases, the back room's door, the vents and the roof, the
 * van in the alley, the cabinet graveyard, and the people who look at them. Licensed things are Muse's and talk like the
 * warmest influencer in the city; bootleg things are raw. Same shape as the other rows: a capability, what it sees, what
 * it costs. A caught attempt costs heat at the hall, a grudge or a scrap; nothing is ever grim and the players are not
 * the joke. There is no Atlas in the building.
 */

const CABS = Object.values(GENRES).map((g) => g.feature);
const open = (w: Parameters<NonNullable<Affordance<HallView>['ok']>>[0], v: HallView): boolean => !banned(w, v.main);
const banHall = { apply: (c: { w: { counters: Record<string, number> } }, v: { main: { id: string } }): void => void (c.w.counters[`hallban:${v.main.id}`] = 1) };

/** "today after 6", "tomorrow around 2", or "not this week": when the spider is next due, from the clock itself. */
function nextVisit(c: { w: { worldSeed: string | number; clock: number } }, v: HallView): string {
  const today = dayOf(c.w.clock);
  for (let d = today; d <= today + 4; d++) {
    const a = auditOnDay(c.w.worldSeed, v.main, v.info, d);
    if (!a || a.end <= c.w.clock) continue;
    const hr = Math.floor(minuteOfDay(a.start) / 60);
    const clock12 = `${hr % 12 === 0 ? 12 : hr % 12}${hr < 12 ? 'am' : 'pm'}`;
    return `${d === today ? 'today' : d === today + 1 ? 'tomorrow' : `in ${d - today} days`} around ${clock12}`;
  }
  return 'not this week';
}

export const CRIME: Affordance<HallView>[] = [
  // ============================================================ the stateful ones: a cabinet is changed
  row({
    id: 'jailbreak', where: { feature: CABS }, each: true, pace: 'session',
    needs: ['skill:tinkering', 'skill:gaming', 'stat:int', 'drive:curiosity'],
    sees: 'A Muse-approved cabinet with a service menu behind a sticker, a screw nobody has turned in years and a smiling LUMINA who does not know what is about to happen to her.',
    stakes: 'The cabinet goes bootleg for good: harder, stranger, cash instead of tickets, and fair game for the spider. A botched job bricks it for a day and the owner is not pleased.',
    consequence: 'The cabinet is a bootleg from now on.',
    drives: { curiosity: 0.7, pride: 0.4, greed: 0.3 }, bonus: 0.02, risk: 0.5, intent: ['Blackbird looks at a cabinet with a FUN VERIFIED sticker on it and wonders what its service menu thinks about that.'],
    ok: (w, v, f) => open(w, v) && !!f && (() => { const cab = cabAt(w, v, f); return !!cab && cab.legal === 'muse' && playable(cab); })(),
    run: (c, v, f) => jailbreak(c, v, f!, JAILBREAK),
  }),
  row({
    id: 'forge-licence', where: { feature: CABS }, each: true, pace: 'session',
    needs: ['skill:art', 'skill:sleight', 'skill:perception', 'drive:pride'],
    sees: 'A bootleg cabinet with a clean patch on the side where a FUN VERIFIED sticker should be, and a roll of the right shade of pink.',
    stakes: 'A licence that passes for Muse\'s if the spider\'s checklist does not look hard; a better sticker is a better chance.',
    consequence: 'The cabinet reads as licensed until someone checks.',
    drives: { pride: 0.5, greed: 0.3, curiosity: 0.3 }, bonus: 0.02, risk: 0.3, intent: ['Blackbird looks at a bootleg cabinet and sees a place for a sticker.'],
    ok: (w, v, f) => open(w, v) && !!f && (() => { const cab = cabAt(w, v, f); return !!cab && cab.legal === 'bootleg' && playable(cab); })(),
    run: (c, v, f) => forge(c, v, f!, FORGE),
  }),
  row({
    id: 'strip-board', where: { feature: CABS }, each: true, pace: 'session',
    needs: ['skill:tinkering', 'skill:scavenging', 'stat:int', 'drive:greed'],
    sees: 'A cabinet with its glass out and its screen dark, a board still warm in the case and a lot of cheerful confetti on the floor.',
    stakes: 'A cracked board for the bench or the fence; a cut finger.', consequence: 'One less thing for the owner to rebuild.',
    drives: { greed: 0.6, curiosity: 0.4 }, bonus: 0.02, risk: 0.1, intent: ['Blackbird looks at a dead cabinet and sees a board with her name on it.'],
    ok: (w, v, f) => !!f && (() => { const cab = cabAt(w, v, f); return !!cab && (cab.wrecked || v.room === 'cellar'); })(),
    run: (c, v, f) => stripBoard(c, v, f!, STRIP),
  }),
  row({
    id: 'smash-cabinet', where: { feature: CABS }, each: true, pace: 'quick',
    needs: ['skill:melee', 'stat:muscle', 'drive:pride', 'drive:bravery'],
    sees: 'A cabinet that took her last 18nd and a lot of her pride, and a pipe by the wall that would be exactly the right length.',
    stakes: 'A satisfying noise and a scrapped cabinet; the owner remembers a licensed one.', consequence: 'Gone until the owner brings another, a new game and a blank board.',
    drives: { pride: 0.6, bravery: 0.4 }, bonus: -0.1, risk: 0.5, intent: ['Blackbird has lost to a cabinet three times. She has begun to take it personally.'],
    ok: (w, v, f) => open(w, v) && !!f && playable(cabAt(w, v, f)),
    run: (c, v, f) => smash(c, v, f!, SMASH),
  }),

  // ============================================================ sleight
  row({
    id: 'lift-tokens', where: { feature: 'token_booth' }, pace: 'session',
    needs: ['skill:sleight', 'skill:sneak', 'drive:greed'],
    sees: 'A booth with a tray of tokens, a window that opens at the wrong height and an attendant who counts the till twice and never the tray.', stakes: 'A roll of tokens; a hand caught in a window.', consequence: 'The attendant counts the tray, from now on.',
    drives: { greed: 0.9, curiosity: 0.1 }, bonus: 0.03, risk: 0.4, intent: ['Blackbird notices the attendant counts the till and not the tray.'],
    ok: open,
    check: { who: 'attendant', parts: ['sleight', ['sneak', 0.5]], base: 0.362, per: 0.07, dark: 0.15,
      win: R(['At {hall}, a hand goes through the window at the token booth, takes a roll the size of a fist and comes back with a polite "just checking". The tray is exactly as {npc} left it. Nearly.', 'Blackbird buys one token, and leaves with a roll. {npc} thanks her for supporting Joy.'], { item: 'token_roll', train: [['sleight', 2], ['sneak', 1]], xp: 3, thought: ['Free play is a state of mind.', 'Technically they were just lying around, being tokens.'] }),
      lose: R(['A hand in the token tray at {hall}, and another hand on hers. {npc} counts, aloud, the tokens in it. "Fun guaranteed," {they} say{s}, "to people who pay."', '{npc} catches her at the booth and says nothing at all for as long as it takes to be rude.'], { heat: ['place', 1], affinity: -10, warn: ['theft', 1], apply: banHall.apply }) },
  }),
  row({
    id: 'skim-the-cash-box', where: { feature: 'cash_box' }, pace: 'session',
    needs: ['skill:sleight', 'skill:sneak', 'skill:lockpicking', 'drive:greed'],
    sees: 'A cash box with a lid that sticks, a count that is done on Sundays and a note that says DO NOT TOUCH in the handwriting of someone who has been touched.', stakes: 'A few notes from the top; a lid that comes down on a thumb.', consequence: 'The owner counts it on a Tuesday, once.',
    drives: { greed: 1.0 }, bonus: 0.03, risk: 0.5, intent: ['Blackbird notices a cash box that has not been locked since the last government.'],
    ok: open,
    check: { who: 'owner', parts: ['sleight', ['sneak', 0.5], ['lockpicking', 0.3]], base: 0.342, per: 0.07, dark: 0.15,
      win: R(['The lid at {hall} comes up, and so does a third of the top layer: {amount}nd, in a pocket, in the time it takes {npc} to cough. The lid goes down. The note stays.', 'A thumb of notes from the cash box at {hall}, folded small. {amount}nd. Nobody will count it until Sunday.'], { cash: [30, 130], from: 'owner', train: [['sleight', 2]], xp: 4, thought: ['It is a loan to my future self, from my current self.', 'Sunday is a long way off.'] }),
      lose: R(['The lid at {hall} comes down on her thumb and {npc} comes down on the rest of her. "Joy," {they} say{s}, "is for everyone who pays."', 'The cash box at {hall} bleats like a goat when the lid goes up. {npc} was in the room already.'], { heat: ['place', 1], affinity: -14, fight: true, apply: banHall.apply }) },
  }),
  row({
    id: 'swap-a-ticket-reel', where: { feature: 'ticket_shredder' }, pace: 'session',
    needs: ['skill:sleight', 'skill:calculate', 'stat:reflex', 'drive:greed'],
    sees: 'A redemption machine that counts tickets by weight, a reel of the same tickets in her coat and a man who has never once looked inside it.', stakes: 'A big reel for a small one, cashed in at the counter for a few notes; a machine that coughs.', consequence: 'The reel is Joy tickets, and the count is a little off.',
    drives: { greed: 0.9, pride: 0.2 }, bonus: 0.02, risk: 0.4, intent: ['Blackbird weighs a ticket reel in her pocket and a ticket machine in her mind.'],
    ok: open,
    check: { who: 'attendant', parts: ['sleight', ['calculate', 0.6], ['stat:reflex', 0.4]], base: 0.314, per: 0.07,
      win: R(['At {hall}, the redemption machine swallows a thin reel and spits out a fat one. {npc} gives her {amount}nd for it, and a coupon for next time.', 'A fat reel in, a thin reel out. The ticket machine at {hall} does the arithmetic on its own and agrees, in a cheerful chime.'], { cash: [25, 75], from: 'who', train: [['sleight', 2], ['calculate', 1]], xp: 4, thought: ['Mathematics. Not a crime. A hobby.', 'Weight is a feeling.'] }),
      lose: R(['The ticket machine at {hall} gives an unhappy little jingle, and a siren after it. {npc} walks over with a very bright smile. "Oh, friend," {they} say{s}.', 'The reel jams in the redemption machine at {hall}. {npc} unjams it and holds it up. It is the wrong colour, and it is very visible.'], { affinity: -10, heat: ['place', 1], warn: ['theft', 1] }) },
  }),
  row({
    id: 'lift-a-plush', where: { feature: 'prize_counter' }, pace: 'session',
    needs: ['skill:sleight', 'skill:sneak', 'drive:greed', 'drive:pride'],
    sees: 'A prize counter with a wall of Lumi-Bears, a stool that nobody sits on and an attendant who is the only person who knows how many there are.', stakes: 'A prize for nothing; an attendant, and a plush that says "I believe in you" in a loud voice.', consequence: 'One Lumi-Bear fewer; the count is off by one.',
    drives: { greed: 0.7, pride: 0.3 }, bonus: 0.02, risk: 0.3, intent: ['Blackbird looks at a Lumi-Bear the size of a toddler and does arithmetic with her coat.'],
    ok: open,
    check: { who: 'attendant', parts: ['sleight', ['sneak', 0.6]], base: 0.342, per: 0.07, dark: 0.12,
      win: R(['A Lumi-Bear leaves the prize counter at {hall} under a coat, and says nothing, which is a first. {npc} is putting a sticker on a different plush.', 'The wall at {hall} is one Lumi-Bear short. Blackbird is a plush-shaped bulge, walking calmly to the door.'], { item: 'lumi_plush', train: [['sleight', 2], ['sneak', 1]], xp: 3, thought: ['It believes in me. It said so.', 'I did not steal it. It followed me.'] }),
      lose: R(['The Lumi-Bear at {hall} says "I believe in you!" loudly, from inside her coat. {npc} turns round. "Oh, I believe in you too," {they} say{s}.', '{npc} counts the plush wall at {hall} out loud. It takes a while. It ends on a number that is one lower than it started.'], { affinity: -8, heat: ['place', 1], warn: ['theft', 1] }) },
  }),
  row({
    id: 'palm-a-guests-lanyard', where: { feature: 'queue_rope' }, pace: 'quick',
    needs: ['skill:sleight', 'skill:persuasion', 'stat:charm', 'drive:greed'],
    sees: 'A queue, a lanyard on every neck and a man in front who has stopped looking at his pocket because he is looking at the cabinet.', stakes: 'A pocket of tokens; a very big, very friendly man.', consequence: 'A line of people quietly checking.',
    drives: { greed: 0.7, pride: 0.2 }, bonus: 0.0, risk: 0.4, intent: ['Blackbird joins a queue, and does not look at the cabinets.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['sleight', ['stat:charm', 0.5], ['persuasion', 0.2]], base: 0.33, per: 0.07,
      win: R(['In the queue at {hall}, {npc} is looking at the cabinet very hard. A roll of tokens leaves {their} jacket on its own. {amount}nd of Joy, at least.', 'Blackbird says "excuse me" at the rope and leaves with {amount}nd more than she came with.'], { cash: [8, 40], from: 'who', train: [['sleight', 1.5]], xp: 2, thought: ['Excuse me is a very powerful phrase.', 'They will never know. I will always know.'] }),
      lose: R(['{npc} turns round in the queue at {hall} with a hand around her wrist. "Fun guaranteed," {they} say{s}, "to everyone who keeps their hands to themselves."', 'A hand in the wrong pocket in the queue. {npc} is a large person, and not a fan.'], { fight: true, affinity: -12 }) },
  }),

  // ============================================================ lockpicking
  row({
    id: 'crack-the-cash-box', where: { feature: 'cash_box', room: 'cashroom' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:tinkering', 'drive:greed'],
    sees: 'A cashroom of trays, a counting machine like a cage of small birds and a box whose lock was fitted on a Friday.', stakes: 'A real count of the week\'s takings; an alarm in the shape of a smiling face.', consequence: 'The owner learns what a week\'s takings feel like.',
    drives: { greed: 1.2, curiosity: 0.2 }, bonus: 0.0, risk: 0.9, intent: ['Blackbird looks at the cashroom lock and thinks that it was fitted by an optimist.'],
    ok: open,
    check: { parts: ['lockpicking', ['tinkering', 0.5]], base: 0.242, per: 0.07, dark: 0.12,
      win: R(['The lock at {hall} gives up on the third pin. The box has {amount}nd in it, a coupon for a free drink and a note that says THIS IS NOT THE REAL BOX.', 'In the cashroom at {hall}, the box opens like it has been waiting. {amount}nd, bundled by size. She leaves the coupon.'], { cash: [60, 220], from: 'owner', train: [['lockpicking', 3], ['tinkering', 1]], xp: 6, heat: ['place', 1], thought: ['Optimists, the lot of them. I love them.', 'The note was a decoy. So was the lock.'] }),
      lose: R(['The cashroom lock at {hall} plays a jingle when it is picked wrongly. A smiling LUMINA appears on a screen and says "Intruder detected! Fun guaranteed!" The door opens, and so does a very large person.', 'The box at {hall} is wired to a very bright siren and a very bright smile. {npc} arrives first.'], { heat: ['place', 2], affinity: -16, fight: true, apply: banHall.apply }) },
  }),
  row({
    id: 'crack-the-safe', where: { feature: 'safe' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:tinkering', 'stat:int', 'drive:greed'],
    sees: 'A safe that says SAFE on a sticker, in the same hand as the box, and a keypad whose 7 is worn to a shine.', stakes: 'The big takings and the owner\'s secrets; a very polite alarm.', consequence: 'Heat on the hall; the owner never forgets.',
    drives: { greed: 1.3, curiosity: 0.3 }, bonus: 0.0, risk: 1.0, intent: ['Blackbird kneels by a safe with a worn 7 and a smug sticker.'],
    ok: open,
    check: { parts: ['lockpicking', ['tinkering', 0.5], ['stat:int', 0.4]], base: 0.183, per: 0.07, dark: 0.1,
      win: R(['The keypad at {hall} lets her in on 7-7-7-7. Inside: {amount}nd, a framed photo of a dog and a sticker that says FUN VERIFIED, with a heart, on the inside of the door.', 'The safe at {hall} clicks, sighs and opens. {amount}nd and a high-score list that is not the same as the one on the wall.'], { cash: [70, 280], from: 'owner', train: [['lockpicking', 3]], xp: 6, affinity: -12, heat: ['place', 1], thought: ['Seven is lucky. Mostly for me.', 'Sticker says SAFE. Sticker lies.'] }),
      lose: R(['The safe at {hall} is also an alarm, and the alarm is also LUMINA, who sings. {npc} arrives in the middle of the second verse.', 'The keypad at {hall} thinks about it, then locks, then calls someone. Someone arrives.'], { fight: true, heat: ['place', 2], affinity: -18, apply: banHall.apply }) },
  }),
  row({
    id: 'pick-the-back-door', where: { feature: 'password_door' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:sneak', 'drive:curiosity'],
    sees: 'A door with a slot, a voice behind the slot and a lock the voice does not know about.', stakes: 'A look at what the bootleggers keep behind the counter; the voice.', consequence: 'A cartridge, and a door that now has a different voice.',
    drives: { curiosity: 0.8, greed: 0.4 }, bonus: 0.02, risk: 0.4, intent: ['Blackbird tries a password she has not been given on a door that does not appear to need one.'],
    ok: open,
    check: { parts: ['lockpicking', ['sneak', 0.6]], base: 0.342, per: 0.07,
      win: R(['The slot at {hall} says "password?" and a lockpick says "I am the password". Inside, on a shelf by the door: a bootleg cartridge in a hand-labelled case, still in its anti-static bag. She takes it. The voice says "hello?" to her back.', 'Behind the door at {hall}, a rack of cases, a smell of solder and a sign: STAFF ONLY (WE ARE NOT STAFF). A cartridge comes out in her coat.'], { item: 'bootleg_cart', train: [['lockpicking', 2], ['sneak', 1]], xp: 4, thought: ['Password: no.', 'There are no passwords. There are only locks that have not met me.'] }),
      lose: R(['The slot at {hall} says "password?" and the lock says nothing at all. A pause. "Wrong," says the voice, in a friendly voice, "and also ours."', 'The door at {hall} opens inward onto a man holding a spanner and a look. "We have a lot of pets," {they} say{s}. "Mostly you."'], { affinity: -8, warn: ['theft', 1], heat: ['place', 1] }) },
  }),
  row({
    id: 'open-the-prize-vault', where: { trait: 'prize_vault', feature: 'prize_counter' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:tinkering', 'drive:greed', 'drive:bravery'],
    sees: 'A steel grille over the prize wall, a padlock the size of a fist and a headset on the top shelf that has been looking at her for an hour.', stakes: 'The best prize in the room; a padlock that bites.', consequence: 'The prize wall has a gap in the top row.',
    drives: { greed: 0.9, bravery: 0.3 }, bonus: 0.0, risk: 0.7, intent: ['Blackbird looks at a headset behind a grille, and the grille looks at her.'],
    ok: open,
    check: { who: 'attendant', parts: ['lockpicking', ['tinkering', 0.4]], base: 0.262, per: 0.07,
      win: R(['The padlock at {hall} gives up on the second try, and the grille goes up an inch. A prize headset comes out, the one with the best reviews, and goes under her coat. {npc} notices a gap in the wall and decides it is a design choice.', 'A grille, a pick and a headset: the whole top shelf is hers, in principle. She takes the one.'], { item: 'prize_headset', train: [['lockpicking', 2], ['tinkering', 1]], xp: 5, thought: ['It was on the top shelf. It was asking for it.', 'Premium prizes need premium hands.'] }),
      lose: R(['The grille at {hall} comes down on the pick, and on her hand. {npc} is there before the clatter has finished. "Careful!" {they} say{s}, pleasantly. "Friends could get hurt!"', 'The padlock at {hall} turns out to be the second padlock. {npc} turns out to be the first.'], { heat: ['place', 1], affinity: -12, fight: true, apply: banHall.apply }) },
  }),

  // ============================================================ sneak
  row({
    id: 'slip-into-the-back-room', where: { feature: 'password_door', variant: ['backroom', 'bootleg', 'licensed', 'retro'] }, pace: 'session',
    needs: ['skill:sneak', 'skill:perception', 'drive:curiosity', 'drive:bravery'],
    sees: 'A beaded curtain in front of a door, a bored attendant and a corridor with one red bulb that goes on when a certain voice is heard outside.', stakes: 'A look at the bootleggers\' stock; a bouncer\'s whole attention.', consequence: 'She knows who sells what.',
    drives: { curiosity: 0.7, bravery: 0.3 }, bonus: 0.03, risk: 0.4, intent: ['Blackbird looks at the curtain and the corridor behind it and takes a step that is mostly a rumour of one.'],
    ok: open,
    check: { who: 'guard', parts: ['sneak', ['perception', 0.5]], base: 0.342, per: 0.07, dark: 0.15,
      win: R(['Past the curtain at {hall}, along the corridor, under the red bulb, into a room full of hot cabinets. A man at a soldering iron mentions, to nobody, who is selling what this week.', 'The corridor behind the front room at {hall} has three doors and one voice. She learns which, and why, and how much.'], { tip: true, train: [['sneak', 2], ['perception', 1]], xp: 3, thought: ['Exactly the same as the front room, but with a fan.', 'If you are quiet, everything tells you everything.'] }),
      lose: R(['The curtain at {hall} rattles when she touches it. {npc} appears, with a hand on her shoulder. "Staff only," {they} say{s}, "and you are not on the list."', 'The red bulb at {hall} goes on. It is, apparently, for her.'], { affinity: -8, warn: ['sneak', 1] }) },
  }),
  row({
    id: 'crawl-the-vents', where: { room: 'vents', feature: 'vent_grille' }, pace: 'session',
    needs: ['skill:sneak', 'skill:athletics', 'drive:greed'],
    sees: 'A tin tube with a draught, a lot of dust and a view down onto the token booth, the cash box and the top of a head.', stakes: 'A drop onto the till, or just the view; a very loud tin tube.', consequence: 'She knows where everyone puts the money.',
    drives: { greed: 0.7, curiosity: 0.3 }, bonus: 0.0, risk: 0.5, intent: ['Blackbird looks at a vent grille and measures it against her shoulders.'],
    ok: open,
    check: { parts: ['sneak', ['athletics', 0.6]], base: 0.342, per: 0.07,
      win: R(['The vent above {hall} carries her without a sound, which is the vent\'s fault. Through the grille: the cash box, the open lid and a number she can use. A hook and a line bring up {amount}nd.', 'She lies along the duct at {hall} for twenty minutes and a thumb. The cash box is moved, twice. She learns where it goes. {amount}nd goes with her.'], { cash: [30, 110], from: 'owner', train: [['sneak', 2], ['athletics', 1]], xp: 4, thought: ['Dust is just ancient ground.', 'I was born to be in ducts.'] }),
      lose: R(['The vent above {hall} goes BANG, and then BONG, and then a long, long, tinny noise as she goes down it feet first. {npc} has a look at her through the grille and nothing to say.', 'A grille gives under the weight of her elbow at {hall}. She lands, as a cat does, on a pile of bags of tokens, which is not a thing a cat does.'], { affinity: -6, hurt: 0.3, warn: ['sneak', 1] }) },
  }),
  row({
    id: 'drop-in-from-the-roof', where: { room: 'roof', feature: 'skylight' }, pace: 'session',
    needs: ['skill:sneak', 'skill:athletics', 'drive:bravery', 'drive:greed'],
    sees: 'A skylight over the cashroom with a stuck latch, a rope off a dish and a lot of district below.', stakes: 'A drop into the dark above a tray of notes; a drop into the light.', consequence: 'The cashroom has a skylight now.',
    drives: { bravery: 0.6, greed: 0.6 }, bonus: 0.0, risk: 0.7, intent: ['Blackbird stands on a roof, looks at a skylight and has a feeling about it.'],
    ok: open,
    check: { parts: ['sneak', ['athletics', 0.7]], base: 0.292, per: 0.07, dark: 0.1,
      win: R(['The skylight latch at {hall} gives like a hinge in a film. A rope, a drop, a bag, a rope. {amount}nd goes up on her back, in a sack of tokens.', 'Down the rope, into the dark over the cash trays at {hall}, a handful of notes, up the rope. The skylight closes like it never opened.'], { cash: [50, 180], from: 'owner', train: [['sneak', 2], ['athletics', 2]], xp: 5, thought: ['That was the best commute I have ever had.', 'If you do it with confidence it is called a delivery.'] }),
      lose: R(['The rope at {hall} turns out to be a cable and the cable turns out to be live. A small fizz, and a smell of pink, and a long drop onto a roof that is mostly tar.', 'The skylight over {hall} opens onto the one room in the building that has someone in it.'], { hurt: 0.5, affinity: -8, heat: ['place', 1] }) },
  }),

  // ============================================================ hijack
  row({
    id: 'hijack-the-swap-van', where: { room: 'alley', feature: 'side_door', situation: 'swap' }, pace: 'session',
    needs: ['skill:hijack', 'skill:driving', 'skill:lockpicking', 'drive:greed', 'drive:bravery'],
    sees: 'A van with its back open, a cabinet on a trolley and a driver who has gone in for a signature.', stakes: 'A van and the cabinet in it; two men and a trolley.', consequence: 'The delivery is late. So is the other one.',
    drives: { greed: 0.9, bravery: 0.5 }, bonus: 0.0, risk: 0.9, intent: ['Blackbird looks at a van with its engine running and the keys on the dash.'],
    ok: open,
    check: { parts: ['hijack', ['driving', 0.6], ['lockpicking', 0.3]], base: 0.262, per: 0.07,
      win: R(['The van is hers for six streets. In the back: a cabinet, a stack of boards and a note, STICKY BUTTONS (ASK). She sells the boards for {amount}nd and leaves the cabinet in a doorway with a bow on.', 'The driver comes out of {hall} to find a van-shaped gap. She comes out of a side street with a bootleg board in her bag and a hand-written receipt for a cabinet she does not own.'], { cash: [60, 200], item: 'cracked_board', train: [['hijack', 2], ['driving', 1]], xp: 6, thought: ['Parking is not a crime. Taking is.', 'It would have been rude not to.'] }),
      lose: R(['The van\'s alarm plays a jingle. The jingle is LUMINA, and the van is Muse\'s. {npc} comes out of {hall} at a run.', 'The van at {hall} has a kill switch, which is a whole story. Two men have a cabinet, and a view of her.'], { thugs: ['ganger', 2], heat: ['npd', 1], affinity: -12 }) },
  }),

  // ============================================================ grifting
  row({
    id: 'crash-the-birthday', where: { situation: ['party'] }, pace: 'session',
    needs: ['skill:grifting', 'stat:charm', 'skill:persuasion', 'drive:greed'],
    sees: 'A birthday party in the middle row: a cake, a banner and eleven adults who have each assumed another one knows who the birthday person is.', stakes: 'Free tokens, a slice of cake and a party hat; one honest question.', consequence: 'She is on the guest list for next year.',
    drives: { greed: 0.6, lust: 0.2 }, bonus: 0.03, risk: 0.2, intent: ['Blackbird looks at a party that has no host and a lot of tokens.'],
    ok: open,
    check: { who: 'regular', parts: ['grifting', ['stat:charm', 0.6], ['persuasion', 0.3]], base: 0.425, per: 0.06,
      win: R(['"I am Dee\'s cousin," says Blackbird at {hall}. Nobody has a Dee. A cousin is accepted anyway. A paper hat, a slice of cake, a free roll of birthday tokens for the cabinets.', 'At the party at {hall}, she sings Happy Birthday loudest. She is thanked, fed and handed the party tokens, to "keep it going".'], { item: 'token_roll', train: [['grifting', 2], ['persuasion', 1]], xp: 3, fame: 0.2, thought: ['Every party is somebody\'s. Mine, this time.', 'I have been to weddings with worse catering.'] }),
      lose: R(['"I am Dee\'s cousin," says Blackbird. "Dee?" says {npc}. "There is no Dee. Who sent you?" It is a very short party after that.', '{npc} asks, with great kindness, what the birthday person\'s middle name is. The cake is moved out of reach.'], { affinity: -6, warn: ['scam', 1] }) },
  }),
  row({
    id: 'be-the-champion', where: { feature: 'scoreboard' }, pace: 'session',
    needs: ['skill:acting', 'skill:gaming', 'stat:charm', 'drive:pride', 'drive:greed'],
    sees: 'A scoreboard, a framed photo of last year\'s regional champion, and a hall that has never once seen the champion in person.', stakes: 'Free tokens and a hero\'s welcome as somebody else; one person who has met the real one.', consequence: 'There is a champion, somewhere, who is owed an apology.',
    drives: { pride: 0.6, greed: 0.4 }, bonus: 0.03, risk: 0.2, intent: ['Blackbird studies the photo of the regional champion on the wall, and then her own reflection in the glass.'],
    ok: open,
    check: { who: 'attendant', parts: ['acting', ['gaming', 0.5], ['stat:charm', 0.5]], base: 0.427, per: 0.06,
      win: R(['At {hall}, Blackbird lets a crowd of kids put "the regional champion" on a cabinet and watches them cheer a move she did not do. {npc} gives her a roll of tokens, a handshake and a T-shirt in a size she can live with.', '"Wow, it\'s really you," says {npc} at {hall}, and it is. It is, for a minute. Tokens, a photo for the wall and a very small round of applause.'], { item: 'token_roll', train: [['acting', 2], ['gaming', 1]], xp: 3, fame: 0.3, thought: ['I have never won a regional in my life. I have never looked so good doing it.', 'Not lying, exactly. Understudying.'] }),
      lose: R(['"Funny," says {npc} at {hall}. "The champion left-handed. Last year, a thumb injury. Now you are two inches shorter." The kids\' faces do a long fall.', 'Blackbird signs a photo of someone else at {hall}. {npc} compares the signature with the one in the frame. They are not the same, and neither is the champion.'], { affinity: -6, warn: ['scam', 1] }) },
  }),
  row({
    id: 'claim-a-record', where: { feature: 'scoreboard' }, pace: 'session',
    needs: ['skill:grifting', 'skill:gaming', 'stat:charm', 'drive:pride', 'drive:greed'],
    sees: 'A scoreboard of initials, a record that was set before the owner was born and a story that nobody will check.', stakes: 'A purse for a record she never set; a very patient owner with a ledger.', consequence: 'Her initials are on a board she has never touched.',
    drives: { pride: 0.7, greed: 0.6 }, bonus: 0.0, risk: 0.5, intent: ['Blackbird reads a scoreboard and has a feeling that she should be on it.'],
    ok: open,
    check: { who: 'owner', parts: ['grifting', ['gaming', 0.5], ['stat:charm', 0.4]], base: 0.313, per: 0.07,
      win: R(['"That was me," says Blackbird at {hall}, at a score from 2071. {npc} looks at her, looks at the board and pays out a purse of {amount}nd as a "legacy bonus". Her initials stay up. Nobody is happier than the board.', 'A story about a missed trophy and a cousin who moved away. {npc} nods, finds a drawer, pays {amount}nd and writes BLK in a small hand.'], { cash: [30, 100], from: 'owner', fame: 0.2, train: [['grifting', 2], ['gaming', 1]], xp: 4, thought: ['It was me. In spirit.', 'History is whoever shows up with a story.'] }),
      lose: R(['"That was me," says Blackbird at {hall}. {npc} gets out a ledger from 2071, in which the record was set by a dog. "A very good dog," {they} say{s}.', 'The score is the owner\'s, and so is the long, thin look.'], { affinity: -10, warn: ['scam', 1] }) },
  }),

  // ============================================================ intimidation
  row({
    id: 'lean-on-the-owner', where: { feature: 'token_booth' }, pace: 'fight',
    needs: ['skill:intimidation', 'stat:muscle', 'drive:bravery', 'drive:greed'],
    sees: 'An owner with a ring of keys and a till that is full on Saturdays, and a back office with a door that closes.', stakes: 'A tip for the pot; a bat under the counter, and a very big grudge.', consequence: 'The owner never forgets the shape of her.',
    drives: { greed: 0.6, bravery: 0.5 }, bonus: -0.04, risk: 0.9, intent: ['Blackbird thinks about the owner\'s keys and about the shape of a stare.'],
    ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['intimidation', ['stat:muscle', 0.5]], base: 0.278, per: 0.07,
      win: R(['In the back of {hall}, {npc} looks at Blackbird, at the door and at the amount ({amount}nd) that would make this go away. It goes away.', '"Fun," says Blackbird quietly to {npc} at {hall}, "is a subscription. This is the renewal." {npc} pays {amount}nd.'], { cash: [40, 150], from: 'owner', train: [['intimidation', 3]], xp: 5, affinity: -22, heat: ['place', 1], thought: ['I am very good at standing in doorways.', 'Subscription: renewed.'] }),
      lose: R(['{npc} reaches under the counter at {hall} and there is a bat there, and it is not decorative.', '"I know people," says {npc}, which is not an idle thing to say at {hall}. Two of them are already in the room.'], { fight: true, heat: ['place', 2], affinity: -25, apply: banHall.apply }) },
  }),
  row({
    id: 'spook-a-rival-crew', where: { situation: 'rival' }, pace: 'fight',
    needs: ['skill:intimidation', 'stat:muscle', 'drive:pride', 'drive:bravery'],
    sees: 'A crew in matching jackets, camped on the best cabinet with a snack table and no intention of leaving.', stakes: 'The best cabinet back; a crew with a table, and nothing to do with their hands.', consequence: 'The cabinet is free, and so is the snack table.',
    drives: { pride: 0.7, bravery: 0.5 }, bonus: 0.0, risk: 0.7, intent: ['Blackbird looks at a crew with a snack table and a cabinet she wants.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['intimidation', ['stat:muscle', 0.5]], base: 0.328, per: 0.07,
      win: R(['Blackbird walks up to the rival crew at {hall} and puts a hand on the snack table. Nobody says anything. {npc} gets up first. The cabinet is hers, and so are the crisps.', 'A look, a squint, a very slow reach for a bag of crisps. The crew at {hall} leaves with its table.'], { train: [['intimidation', 2]], xp: 3, fame: 0.3, thought: ['They knew. Everyone knows.', 'Crisps: acquired.'] }),
      lose: R(['The crew at {hall} does not get up. {npc} does, and it takes a while, and it does not stop.', '"Nice try," says {npc}. The snack table is on its side, and so are several of the crew\'s patient opinions.'], { fight: true, affinity: -10 }) },
  }),
  row({
    id: 'stare-down-the-champion', where: { feature: 'scoreboard' }, pace: 'session',
    needs: ['skill:intimidation', 'skill:gaming', 'drive:pride', 'drive:bravery'],
    sees: 'A champion on a stool in the corner with their eyes half shut, who has not looked at a screen in six years and has never lost a staring contest either.', stakes: 'A bit of rattled pride; a champion who plays better when angry.', consequence: 'The champion is rattled, and remembers.',
    drives: { pride: 0.8, bravery: 0.4 }, bonus: 0.0, risk: 0.4, intent: ['Blackbird looks at the champion in the corner, who is not looking back, on purpose.'],
    ok: (w, v) => open(w, v) && !!find(v, 'champion'),
    check: { who: 'champion', parts: ['intimidation', ['gaming', 0.5]], base: 0.292, per: 0.07,
      win: R(['At {hall}, Blackbird sits down next to {npc} and says nothing for twenty minutes. {npc} makes a mistake on the second game, then a worse one on the third. A fair purse of {amount}nd changes hands on the way out.', '{npc} flicks an eye at her, away from the screen, which is the first time in years. {their} hands do something the stick did not ask for.'], { cash: [10, 50], from: 'who', train: [['intimidation', 2], ['gaming', 1]], xp: 3, fame: 0.3, thought: ['The first rule of fighting games is that it is a fighting game.', 'I did not touch the stick. I did not need to.'] }),
      lose: R(['{npc} gives Blackbird a look that she is meant to remember, politely, and beats the cabinet while doing it. The hall claps.', '"I have been stared at by better," says {npc}, and wins a game with their eyes shut.'], { affinity: -4, loseCash: [3, 12] }) },
  }),

  // ============================================================ streetwise
  row({
    id: 'find-the-bootleggers', where: { feature: 'notice_board' }, pace: 'session',
    needs: ['skill:streetwise', 'skill:analyze', 'drive:curiosity'],
    sees: 'A notice board with the usual lost-property and a small card with a phone number and a picture of a skull, and the same card, upside down, near a pizza menu.', stakes: 'A name to ask for; a lot of cards that mean something else.', consequence: 'She knows where the boards come from.',
    drives: { curiosity: 0.6, greed: 0.3 }, bonus: 0.02, risk: 0.2, intent: ['Blackbird looks at a notice board, and at a card on it that is slightly the wrong shade of grey.'],
    ok: open,
    check: { parts: ['streetwise', ['analyze', 0.5]], base: 0.392, per: 0.07,
      win: R(['The board at {hall} has a card that is almost a pizza menu. A call and a number and a name: she hears who is selling cracked boards this week, and for how much.', 'The upside-down card at {hall} has a word on the back, in biro. She has the word. She has the street. She has an address.'], { tip: true, train: [['streetwise', 2], ['analyze', 1]], xp: 3, thought: ['Everyone knows a guy. I know the guy\'s guy.', 'Nobody does anything in Neo without a card.'] }),
      lose: R(['The number on the card at {hall} is a pizza place. A very good pizza place, and she buys the pizza.', 'The skull on the card at {hall} turns out to be the logo of a rock band. The rock band does not want to be found, either.'], { loseCash: [4, 14], train: [['streetwise', 1]] }) },
  }),
  row({
    id: 'read-the-spiders-diary', where: { feature: 'notice_board', trait: ['auditor_fee', 'sticker_wall', 'joy_partner', 'feud', 'circuit_stop'] }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:perception', 'skill:analyze', 'drive:curiosity'],
    sees: 'A notice board with a small laminated slip headed FUN COMPLIANCE, a date column, a lot of crossings-out and a regular who always leaves just before it.', stakes: 'When the spider is next due; a question put too loudly.', consequence: 'She knows when to cover what.',
    drives: { curiosity: 0.6, greed: 0.2 }, bonus: 0.03, risk: 0.1, intent: ['Blackbird asks a regular what the little laminated slip is for.'],
    ok: open,
    check: { parts: ['streetwise', ['perception', 0.6], ['analyze', 0.4]], base: 0.442, per: 0.07,
      win: R(['The slip at {hall} lists Fun Compliance visits in a hand that does not like them. Next, by the pattern: {when}. She sets it aside.', 'A regular at {hall} who has seen it all says, quietly, that the spider calls {when}. It is a good habit, hearing it. She writes it on her hand.'], { apply: (c, v, _who, tok) => { tok.when = nextVisit(c, v as HallView); }, train: [['streetwise', 1], ['analyze', 1]], xp: 2, thought: ['It has a schedule. A spider with a schedule. I love civilisation.', 'Bring a banner.'] }),
      lose: R(['The slip at {hall} is a menu of Joy Week offers. She learns the price of a milkshake, and that it is "fun-sized".', 'Somebody has written over the whole slip in marker. It is now a drawing of a spider, in a hat. That is all the information on it.'], { train: [['streetwise', 0.5]] }) },
  }),

  // ============================================================ art
  row({
    id: 'peel-a-sticker', where: { feature: 'sticker_wall' }, pace: 'quick',
    needs: ['skill:art', 'skill:sleight', 'drive:pride'],
    sees: 'A wall of FUN VERIFIED stickers, one for every inspection, not one of them peeling, and a corner that is nearly lifting.', stakes: 'A whole sticker, with its glue intact; a small, firm hand.', consequence: 'A genuine sticker in her pocket and a gap on the wall.',
    drives: { pride: 0.3, greed: 0.3, curiosity: 0.3 }, bonus: 0.02, risk: 0.2, intent: ['Blackbird looks at a corner that is nearly lifting.'],
    ok: open,
    check: { parts: ['art', ['sleight', 0.7]], base: 0.442, per: 0.07,
      win: R(['A very small knife and a great deal of patience, and a FUN VERIFIED sticker at {hall} lifts whole, heart and all. It goes in a book. The wall barely notices the gap.', 'The corner at {hall} comes up. The rest follows like a long, patient banana skin. A sticker.'], { item: 'fun_sticker', train: [['art', 1], ['sleight', 1]], xp: 2, thought: ['Fun, verified, in my pocket.', 'You can never have too many certificates.'] }),
      lose: R(['The sticker at {hall} tears down its middle, and half a heart comes away. The other half stays on the wall, looking very sad. {npc} looks at the wall, and at her.', 'The FUN VERIFIED sticker at {hall} comes away in three pieces. A cheerful voice from a nearby cabinet says "Oh no!"'], { affinity: -5, warn: ['vandal', 1] }) },
  }),
  row({
    id: 'paint-the-alley', where: { room: 'alley', feature: 'side_door' }, pace: 'session',
    needs: ['skill:art', 'skill:sneak', 'drive:pride'],
    sees: 'A blank wall behind the hall, a dumpster for cover and a sign that says NO GRAFFITI, which has been tagged.', stakes: 'A mural that people stop to look at; a bouncer and a can.', consequence: 'A piece with her tag in it.',
    drives: { pride: 0.7, curiosity: 0.2 }, bonus: 0.02, risk: 0.3, intent: ['Blackbird looks at an alley wall like a canvas that has been waiting for her.'],
    ok: open,
    check: { parts: ['art', ['sneak', 0.3]], base: 0.436, per: 0.06, dark: 0.1,
      win: R(['On the wall behind {hall}, a spider, eight legs, a smile and a hat, wrecking a cabinet with great joy. It is signed. People stop to photograph it. A Muse drone, somewhere, notes the spider is not on the licence.', 'By midnight the alley behind {hall} has a piece worth looking at: a cabinet with a halo, and a skull on the screen.'], { train: [['art', 2], ['sneak', 0.5]], xp: 3, fame: 0.4, thought: ['The wall asked for it.', 'My best work. Until the next one.'] }),
      lose: R(['The can at {hall} runs dry in the middle of a leg. The spider has seven now, and a bouncer is standing at the end of the alley.', 'The wall behind {hall} is wet and so is she. A bouncer asks, mildly, whether she knows whose wall it is.'], { affinity: -5, heat: ['place', 1] }) },
  }),

  // ============================================================ tracking
  row({
    id: 'follow-the-van', where: { room: 'alley', feature: 'side_door', variant: ['backroom', 'bootleg', 'retro', 'licensed', 'skillgames'] }, pace: 'session',
    needs: ['skill:tracking', 'skill:streetwise', 'skill:perception', 'drive:curiosity'],
    sees: 'A van with a hand-painted sun on the side, tyre marks across the puddles and a cabinet-shaped gap in the dust where one used to be.', stakes: 'The bootleggers\' workshop; a van that is a lot faster than her.', consequence: 'She knows where the boards come from.',
    drives: { curiosity: 0.7, greed: 0.3 }, bonus: 0.02, risk: 0.3, intent: ['Blackbird sees tyre tracks, and a cabinet-shaped gap in the dust.'],
    ok: open,
    check: { parts: ['tracking', ['streetwise', 0.5], ['perception', 0.4]], base: 0.342, per: 0.07,
      win: R(['Tyre marks at {hall}, a fresh one at the corner, a hand-painted sun on a lock-up door six streets on. A woman with a soldering iron looks up. "Looking for something?" She is: a stack of boards, and a price list.', 'The van\'s route is plain from the puddles. A lock-up, a cracked board on the pavement. Someone in the doorway is selling debug dongles, 85nd each.'], { tip: true, item: 'bootleg_cart', train: [['tracking', 2], ['streetwise', 1]], xp: 4, thought: ['Everyone leaves a trail. Most of it is oil.', 'I found the sun. I found the guys under the sun.'] }),
      lose: R(['The marks behind {hall} stop at a puddle, a kerb and a lot of nothing. The van, wherever it is, is faster.', 'She follows the van through three streets and a market, and loses it to a fruit stall.'], { train: [['tracking', 1]] }) },
  }),

  // ============================================================ scavenging
  row({
    id: 'dig-the-graveyard', where: { feature: 'cabinet_graveyard' }, pace: 'session',
    needs: ['skill:scavenging', 'skill:tinkering', 'drive:greed', 'drive:curiosity'],
    sees: 'Cabinets three high with their last scores on the glass, a lot of boards in a lot of cases and a smell of dust and old ozone.', stakes: 'A board that still boots; a stack that leans.', consequence: 'One dead cabinet fewer in the stack.',
    drives: { greed: 0.6, curiosity: 0.5 }, bonus: 0.04, risk: 0.2, intent: ['Blackbird looks at a cabinet graveyard like a very large bin with prospects.'],
    ok: open,
    check: { parts: ['scavenging', ['tinkering', 0.5]], base: 0.442, per: 0.07,
      win: R(['In the stack at {hall}, behind a dead brawler: a cracked board, still warm in the case, still flickering with an attract screen. A last score glows on the glass: 41,200. She takes the board.', 'Three cabinets down, a board with all its chips and most of its manners. She pries it out of the case, and blows on it. It looks pleased.'], { item: 'cracked_board', train: [['scavenging', 2], ['tinkering', 1]], xp: 3, thought: ['Dead, they say. I say pre-owned.', 'This one has a good personality.'] }),
      lose: R(['A cabinet in the stack at {hall} leans, then keeps leaning. She gets out of the way in the manner of a cat, and a pile of dead games lands where she was.', 'Every board in the stack at {hall} is the wrong shape, and one of them bites. A small cut. A big sound.'], { hurt: 0.3, train: [['scavenging', 0.5]] }) },
  }),
  row({
    id: 'root-the-parts-bin', where: { feature: 'parts_bin' }, pace: 'quick',
    needs: ['skill:scavenging', 'skill:tinkering', 'drive:greed'],
    sees: 'A bin of dead buttons, burnt joysticks, loose ribbon cables and, near the bottom, something gold.', stakes: 'A bit of metal for the bench; a thumb in a stick.', consequence: 'A tidier bin.',
    drives: { greed: 0.4, curiosity: 0.3 }, bonus: 0.03, risk: 0.1, intent: ['Blackbird puts her hand in a bin of dead buttons, with hope.'],
    ok: open,
    check: { parts: ['scavenging', ['tinkering', 0.3]], base: 0.486, per: 0.06,
      win: R(['At the bottom of the bin at {hall}, under a lot of dead buttons: a handful of good scrap and a soldering kit in a biscuit tin. The biscuit tin is still full of biscuits.', 'The bin at {hall} yields a heap of cable and a gold-plated connector the size of a thumb.'], { item: 'scrap_metal', train: [['scavenging', 1.5]], xp: 2, thought: ['Treasure is a matter of attitude.', 'Biscuits are a bonus.'] }),
      lose: R(['The parts bin at {hall} yields eleven buttons, none that match, and a screw with a message. The message is OW.', 'Nothing but dust and an old coin, which she tries in a cabinet, which refuses.'], { train: [['scavenging', 0.5]] }) },
  }),

  // ============================================================ tinkering
  row({
    id: 'free-play-hack', where: { feature: ['token_machine', 'token_booth', 'cabinet_guts', 'repair_bench'] }, pace: 'session',
    needs: ['skill:tinkering', 'skill:gaming', 'stat:int', 'drive:greed'],
    sees: 'A coin slot with a jumper wire behind it, a service menu on a cheerful screen and a lot of loose screws.', stakes: 'A cabinet that gives her credits forever; a firm, flat fuse.', consequence: 'A pocket of credits that are not entirely credits.',
    drives: { greed: 0.7, curiosity: 0.4 }, bonus: 0.02, risk: 0.3, intent: ['Blackbird looks at a coin slot and sees a negotiation.'],
    ok: open,
    check: { parts: ['tinkering', ['gaming', 0.6], ['stat:int', 0.4]], base: 0.314, per: 0.07,
      win: R(['A jumper wire, a service menu and a code she was not given. At {hall}, a cabinet starts counting credits up, not down. Free play. She takes a roll of tokens out of the tray as it pays out, and shuts the hatch.', 'The coin slot at {hall} gives her forty credits for one. She uses ten and sells thirty. It is practically a hobby.'], { item: 'token_roll', train: [['tinkering', 2], ['gaming', 1]], xp: 4, thought: ['"Free play" is a feature, not a bug.', 'Fun, now with extra fun.'] }),
      lose: R(['The service menu at {hall} says "NICE TRY, FRIEND!" and a very small siren starts. A fuse goes with a bang and a smell of toast.', 'The cabinet at {hall} resets, wipes her credits, and prints on its screen: "Your Joy has been reallocated." She has seen worse.'], { affinity: -6, warn: ['hack', 1], loseCash: [3, 12] }) },
  }),
  row({
    id: 'steal-a-board', where: { feature: 'cabinet_guts' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:sleight', 'drive:greed'],
    sees: 'A cabinet with its back off, a board in the case and a tech in the corner who is eating noodles and looking at a different problem.', stakes: 'A cracked board off the bench; a tech who has seen it all.', consequence: 'A cabinet that will not boot on Tuesday.',
    drives: { greed: 0.7, curiosity: 0.2 }, bonus: 0.02, risk: 0.4, intent: ['Blackbird looks at a cabinet with its back off and a board that is nearly loose.'],
    ok: open,
    check: { who: 'tech', parts: ['tinkering', ['sleight', 0.6]], base: 0.342, per: 0.07,
      win: R(['At {hall}, a screwdriver and a very light hand: the board comes out of the open cabinet without a click and goes into her bag. {npc} looks up from the noodles and asks what is on the screen. "Nothing," she says. It is true.', 'A cable, a clip, a board. The cabinet at {hall} is a shell with a shine on it. She leaves a note: FIXED.'], { item: 'cracked_board', train: [['tinkering', 2], ['sleight', 1]], xp: 4, thought: ['Some people steal cars. I prefer to steal the part you cannot get.', 'It was just sitting there, being a board.'] }),
      lose: R(['{npc} looks up from the noodles, at the empty slot in the cabinet and then at her bag. "That one is a loaner," {they} say{s}. "And I have the paperwork."', 'The board at {hall} is held with a bolt that was never in the manual. {npc} had it painted red.'], { affinity: -10, warn: ['theft', 1] }) },
  }),

  // ============================================================ melee / muscle
  row({
    id: 'brawl-over-a-cabinet', where: { feature: CABS }, pace: 'fight',
    needs: ['skill:melee', 'stat:muscle', 'drive:bravery', 'drive:pride'],
    sees: 'Two players at one cabinet and one stool, a lot of raised voices and a lot of knuckles.', stakes: 'The cabinet; a black eye and a thrown stool.', consequence: 'The regulars have a story.',
    drives: { bravery: 0.6, pride: 0.5 }, bonus: -0.06, risk: 0.8, intent: ['Blackbird looks at a stool, a cabinet and a man who thinks it is his.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['melee', ['stat:muscle', 0.6]], base: 0.326, per: 0.07,
      win: R(['{npc} pushes the stool at {hall}, and Blackbird pushes back with more. The cabinet is hers. {npc} pays {amount}nd in damages and leaves with a bruise and a speech.', 'A short scuffle at the stick at {hall}. She wins by being still on her feet. The crowd gives a small round of applause, on beat.'], { cash: [8, 40], from: 'who', train: [['melee', 2]], xp: 4, fame: 0.3, thought: ['I only wanted to play.', 'A good brawl is a form of high score.'] }),
      lose: R(['The stool at {hall} arrives at her first. {npc} follows it with an elbow and an opinion.', '{npc} is better at this than they are at the cabinet. That is not saying a lot, but it is saying enough.'], { fight: true, hurt: 0.3, affinity: -8 }) },
  }),
  row({
    id: 'throw-out-a-sore-loser', where: { feature: CABS }, pace: 'fight',
    needs: ['stat:muscle', 'skill:intimidation', 'skill:melee', 'drive:bravery'],
    sees: 'A sore loser who has hit a cabinet, a bouncer on the other side of the room, an owner with a face like a closed shutter.', stakes: 'The owner\'s thanks; a sore loser with a stick.', consequence: 'The owner owes her one.',
    drives: { bravery: 0.5, pride: 0.4, greed: 0.2 }, bonus: 0.0, risk: 0.6, intent: ['Blackbird sees a man hit a cabinet and a cabinet not hit back.'],
    ok: (w, v) => open(w, v) && !!find(v, 'regular') && !!find(v, 'owner'),
    check: { who: 'regular', parts: ['stat:muscle', ['intimidation', 0.4], ['melee', 0.3]], base: 0.367, per: 0.07,
      win: R(['{npc} has hit the cabinet at {hall} three times and lost to it four. Blackbird lifts {them} by the collar and puts {them} on the pavement. The owner pays {amount}nd and a free hour.', 'A firm hand on a loud collar at {hall}. The sore loser leaves by the nearest exit. "Fun guaranteed," says the owner, to nobody.'], { cash: [15, 50], from: 'owner', train: [['intimidation', 1], ['melee', 1]], xp: 3, fame: 0.3, affinity: 8, thought: ['I am an excellent bouncer. Underpaid, but excellent.', 'Be nice to the cabinet. It did nothing.'] }),
      lose: R(['{npc} turns out to be a sore loser with a hobby. The hobby is elbows.', 'The collar at {hall} comes off in her hand. So does a lot of dignity.'], { fight: true, affinity: -6 }) },
  }),

  // ============================================================ cards, haggling, hustling
  row({
    id: 'back-room-cards', where: { room: 'backroom' }, pace: 'session',
    needs: ['skill:cards', 'skill:calculate', 'skill:grifting', 'drive:greed'],
    sees: 'A card table under a bare bulb in the corner of the bootleg room, a pot of tokens, and a bootlegger dealing with a patience she should find suspicious.', stakes: 'A pot of notes against a stake of 20nd; a very good dealer.', consequence: 'The table remembers how she plays.',
    drives: { greed: 0.9, pride: 0.2 }, bonus: 0.02, risk: 0.5, intent: ['Blackbird sits at a table in a room full of cracked cabinets and is dealt a hand.'],
    ok: (w, v) => open(w, v) && !!find(v, 'bootlegger'),
    check: { who: 'bootlegger', pay: 20, parts: ['cards', ['calculate', 0.5], ['grifting', 0.3]], base: 0.342, per: 0.07,
      win: R(['At {hall}, the cards fall right and {npc} folds with a grunt. {amount}nd, in notes, from the pot of a man who counts everything twice. She counts it once.', 'A bluff on a pair of nothing at {hall}, a long look from {npc} and a very short fold. {amount}nd goes into her jacket.'], { cash: [50, 140], from: 'who', train: [['cards', 2], ['calculate', 1]], xp: 4, thought: ['I have a tell, and I am the only one who knows it.', 'The cards were a team. I joined.'] }),
      lose: R(['{npc} lays down three of a kind at {hall}. Blackbird lays down a lie. The lie loses.', 'The pot at {hall} goes the way of the table, and the table goes the way of the evening.'], { loseCash: [5, 25], affinity: -2, train: [['cards', 1]] }) },
  }),
  row({
    id: 'cheat-a-skill-game', where: { feature: 'cab_skill' }, pace: 'session',
    needs: ['skill:cards', 'skill:calculate', 'skill:sleight', 'drive:greed'],
    sees: 'A skill game that insists it is not a slot machine, a payout window and a pattern in the reels that repeats every 211 spins.', stakes: 'A few notes from the window; a siren shaped like a hand.', consequence: 'The machine has a note in its file.',
    drives: { greed: 0.9, curiosity: 0.2 }, bonus: 0.02, risk: 0.5, intent: ['Blackbird has counted a skill game\'s reels 211 spins and likes the number.'],
    ok: (w, v) => open(w, v) && !!find(v, 'attendant'),
    check: { who: 'attendant', pay: 8, parts: ['cards', ['calculate', 0.6], ['sleight', 0.3]], base: 0.322, per: 0.07,
      win: R(['The skill game at {hall} lights up on spin 211, as it always does. She is there. {npc} pays {amount}nd out of a window with a hand that does not like it.', 'A pattern, a pause and a win at {hall}: {amount}nd in cash tickets. The skill game was right. It was a skill game.'], { cash: [30, 100], from: 'who', train: [['cards', 2], ['calculate', 1]], xp: 4, thought: ['It is a game of skill. I have the skill.', 'Two hundred and eleven is a very beautiful number.'] }),
      lose: R(['The skill game at {hall} resets its counter mid-count. "Fun guaranteed!" it chirps. It means: to the house.', '{npc} watches her at the skill game at {hall} and presses a button under the counter. The reels do something else.'], { warn: ['cheat', 1], affinity: -4 }) },
  }),
  row({
    id: 'buy-a-cracked-board', where: { room: 'backroom' }, pace: 'session',
    needs: ['skill:haggling', 'skill:streetwise', 'drive:greed', 'drive:curiosity'],
    sees: 'A shelf of boards in anti-static bags with a handwritten price list and a bootlegger who has been selling the same board since Monday under different names.', stakes: 'A board at about the right price; a dud at the wrong one.', consequence: 'The bootlegger has her number, and she theirs.',
    drives: { greed: 0.5, curiosity: 0.4 }, bonus: 0.0, risk: 0.2, intent: ['Blackbird flips through a shelf of anti-static bags with the tags turned the wrong way round.'],
    ok: (w, v) => open(w, v) && !!find(v, 'bootlegger'),
    check: { who: 'bootlegger', pay: [40, 70], parts: ['haggling', ['streetwise', 0.5]], base: 0.436, per: 0.06,
      win: R(['{npc} wants 90nd for a cracked board at {hall}. After a short disagreement it is {pay}nd, a free case and a rebate of {amount}nd for her honesty. It boots first time.', '"This one is special," says {npc} at {hall}. For once it is. A good board for {pay}nd, and a wink.'], { item: 'cracked_board', cash: [10, 30], train: [['haggling', 2], ['streetwise', 1]], xp: 3, thought: ['I paid less than I would have, in a way I find very pleasing.', 'A board from a friend.'] }),
      lose: R(['{npc} wants {pay}nd for a board at {hall}, and she pays it. It boots to a screen that says "NICE TRY" in 14 languages. A dud, with a sense of humour.', 'The board is a good one and a bad one, depending on the day. She gets the day.'], { item: 'bootleg_cart', train: [['haggling', 1]] }) },
  }),
  row({
    id: 'buy-a-debug-dongle', where: { room: 'backroom' }, pace: 'session',
    needs: ['skill:haggling', 'skill:tinkering', 'stat:int', 'drive:curiosity'],
    sees: 'A bootlegger with a little dongle that opens every service menu in the building, a hand over it and a price.', stakes: 'A dongle that makes jailbreaks easier; 80-ish nd and a bootlegger who is slow to part.', consequence: 'The bootlegger\'s hand is a little lighter.',
    drives: { curiosity: 0.6, greed: 0.3 }, bonus: 0.0, risk: 0.2, intent: ['Blackbird eyes a small plastic key with a skull on it.'],
    ok: (w, v) => open(w, v) && !!find(v, 'bootlegger'),
    check: { who: 'bootlegger', pay: [80, 120], parts: ['haggling', ['stat:int', 0.4], ['tinkering', 0.3]], base: 0.473, per: 0.05,
      win: R(['{npc} hands over a dongle at {hall} for {pay}nd. "It opens every menu," {they} say{s}, "and a few doors."', 'A skull-shaped dongle for {pay}nd at {hall}. The thing flashes red when she touches it, as if recognising an old friend.'], { item: 'debug_dongle', train: [['haggling', 1], ['tinkering', 1]], xp: 3, thought: ['A key to every menu. I have wanted this since I was four.', 'Spend a bit, save a lot of effort.'] }),
      lose: R(['The dongle {npc} sells her at {hall} for {pay}nd is a USB stick with a sticker on it. It plays a song when it is plugged in. The song is an apology.', '{npc} says the dongle is in the post. The post, at {hall}, is a bootlegger\'s cousin.'], { item: 'bootleg_cart', affinity: -2 }) },
  }),
  row({
    id: 'run-the-dead-drop', where: { trait: ['dead_drop', 'gang_front'], room: 'floor' }, pace: 'session',
    needs: ['skill:sneak', 'skill:streetwise', 'skill:hustling', 'drive:greed'],
    sees: 'A bin by the door with a loose lid, a guy on the counter who is paid not to see, and boards that go in the back and come out the front.', stakes: 'A board in a bag; the crew that moves them.', consequence: 'The crew knows her face.',
    drives: { greed: 0.8, curiosity: 0.2 }, bonus: 0.02, risk: 0.5, intent: ['Blackbird sees a bin with a loose lid and a man looking carefully at the ceiling.'],
    ok: open,
    check: { parts: ['sneak', ['streetwise', 0.5], ['hustling', 0.3]], base: 0.342, per: 0.07, dark: 0.12,
      win: R(['At {hall}, a board in a bag goes into a bin and a different bag comes out of the lid. Blackbird takes the second bag and runs the first to a stall two streets over for {amount}nd. The counter man stares at the ceiling the whole time.', 'The dead drop at {hall} drops dead. The bag she lifts has a cracked board in it and a note: TELL NOBODY.'], { cash: [30, 90], item: 'cracked_board', train: [['sneak', 1], ['streetwise', 1], ['hustling', 1]], xp: 4, heat: ['place', 1], thought: ['A drop is a gift. I received it.', 'Tell nobody. Done.'] }),
      lose: R(['The bin lid at {hall} slams and a very large person is suddenly on the other side of it. "Wrong bin," {they} say{s}. It is a very quiet shove.', 'The bag at {hall} turns out to be a gang\'s, and the gang is about to want it back.'], { thugs: ['ganger', 2], heat: ['place', 1], affinity: -10 }) },
  }),
  row({
    id: 'relieve-a-host', where: { variant: 'flagship', room: 'floor' }, pace: 'session',
    needs: ['skill:sleight', 'stat:charm', 'skill:romance', 'drive:greed', 'drive:lust'],
    sees: 'A Joy Host in a pink lanyard with a tablet, a cheerful face and a pocket full of free-play cards that the hall is very generous with.', stakes: 'A free-play card or two; a smile that has been calibrated.', consequence: 'The host has been told, in writing, to be more careful.',
    drives: { greed: 0.5, lust: 0.2 }, bonus: 0.0, risk: 0.3, intent: ['Blackbird compliments a Joy Host on a lanyard.'],
    ok: (w, v) => open(w, v) && !!find(v, 'host'),
    check: { who: 'host', parts: ['sleight', ['stat:charm', 0.6], ['romance', 0.3]], base: 0.349, per: 0.07,
      win: R(['"On a scale of one to ten," {npc} asks at {hall}, "how fun are you feeling?" Blackbird says eleven and leaves with a free-play card, a sticker, and {amount}nd in the pocket of a pink lanyard that was lying next to it.', '{npc} is looking at a tablet that is rating her enjoyment. Her hand, meanwhile, is in the host\'s pocket. The tablet says: "Joyful!"'], { cash: [10, 45], from: 'who', train: [['sleight', 1.5], ['romance', 0.5]], xp: 3, thought: ['Eleven. Out of ten. I am a natural.', 'Be rated. Take the card.'] }),
      lose: R(['{npc} stops smiling at {hall}, and it takes an inch longer than it should. "Friends," {they} say{s}, brightly, "do not do that." A second host appears.', 'The Joy Host at {hall} taps the tablet. It says something that is not "Joyful!". A bouncer is called.'], { affinity: -10, heat: ['place', 1], warn: ['theft', 1] }) },
  }),
  row({
    id: 'snatch-from-the-belt', where: { feature: ['ticket_shredder', 'prize_counter'] }, pace: 'quick',
    needs: ['stat:reflex', 'skill:sleight', 'skill:athletics', 'drive:greed'],
    sees: 'A conveyor of prizes that goes past the counter once a minute, with the attendant\'s eyes on the tickets and not the belt.', stakes: 'A prize off a moving belt; a trapped finger and an attendant who notices.', consequence: 'The belt runs one short.',
    drives: { greed: 0.6, pride: 0.2 }, bonus: 0.03, risk: 0.3, intent: ['Blackbird watches a prize belt, and times it.'],
    ok: open,
    check: { who: 'attendant', parts: [['stat:reflex', 1], ['sleight', 0.7], ['athletics', 0.2]], base: 0.323, per: 0.08,
      win: R(['The belt at {hall} brings a LUMINA keyring past her at exactly walking pace. Her hand and the keyring have an understanding. {npc} counts them at closing and gets it right, which is not helpful.', 'A flick and a keyring leaves the belt at {hall}. The belt does not notice. It is a belt.'], { item: 'prize_keyring', train: [['sleight', 1.5], ['athletics', 0.5]], xp: 2, thought: ['Reflexes. Mine, for once.', 'Value: seven nd. Pride: considerable.'] }),
      lose: R(['The belt at {hall} takes her sleeve and a good part of her arm with it. {npc} turns the machine off with a smile that has an edge. "Fun is not a thing you can take, friend."', 'A finger in the belt at {hall}. A small jingle. A big silence.'], { hurt: 0.3, affinity: -5, warn: ['theft', 1] }) },
  }),
];
