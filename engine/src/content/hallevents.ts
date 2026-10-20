import { type Affordance } from '../affordances';
import { fight } from '../combat';
import { dayOf } from '../clock';
import type { Ctx } from '../types';
import { banned, cabAt, cabsHere, find, hide, playable, say, spiderOf, type HallView } from '../hallkit';
import type { PlaceView } from '../placekit';
import { GENRES } from './halls';
import { HIDE } from './hallplay';
import { R, row } from './hallrow';

/**
 * What is happening here today (situations, content/halls.ts), the wild cards (one hall in twelve), the compliance
 * spider's visit, and the things only certain kinds of arcade offer. Situations are a pure function of the clock, so these
 * rows switch on and off as days pass without any state to save. The spider rows are all `situation: 'audit'`: they exist
 * only while it is in the building.
 *
 * Tokens in prose: {hall} {npc} {owner} {pay} {amount} {lost} {item} {tip}. Muse speaks like the warmest influencer in the
 * city; the bootlegs do not.
 */

const open = (w: Parameters<NonNullable<Affordance<HallView>['ok']>>[0], v: HallView): boolean => !banned(w, v.main);
const CAB_FEATS = Object.values(GENRES).map((g) => g.feature);

/** The spider has been talked, tricked or tangled out of this visit. */
const calm = (c: Ctx, v: PlaceView): void => {
  const day = (v as HallView).audit?.day ?? dayOf(c.w.clock);
  c.w.counters[`spidercalm:${v.main.id}:${day}`] = 1;
};
const spiderHere = (w: Parameters<NonNullable<Affordance<HallView>['ok']>>[0], v: HallView): boolean => open(w, v) && !!find(v, 'spider');
const deadKey = (v: HallView): string => `spiderdead:${v.main.id}:${v.audit?.day ?? 0}`;

// ===================================================================== the spider

export const SPIDER_ROWS: Affordance<HallView>[] = [
  row({
    id: 'hide-cabinet', where: { situation: 'audit', feature: CAB_FEATS }, each: true, pace: 'session',
    needs: ['skill:sneak', 'stat:muscle', 'skill:tinkering', 'drive:bravery'],
    sees: `A bootleg cabinet and a spider on a checklist. Eight legs, one clipboard, a banner in the corner.`, stakes: `A cabinet that is still a cabinet in an hour; a spider that notices a banner it should not.`, consequence: `The cabinet is passed over for this visit.`,
    drives: { bravery: 0.6, greed: 0.3, pride: 0.3 }, bonus: 0.15, risk: 0.3, intent: [`Blackbird sees a spider, a bootleg and a very large banner.`],
    ok: (w, v, f) => {
      const cab = cabAt(w, v, f!);
      return spiderHere(w, v) && playable(cab) && cab.legal === 'bootleg';
    },
    run: (c, v, f) => hide(c, v, f!, HIDE),
  }),
  row({
    id: 'calm-spider', where: { situation: 'audit' }, pace: 'session',
    needs: ['skill:tinkering', 'stat:int', 'skill:analyze', 'drive:curiosity'],
    sees: `A maintenance hatch on the spider's thorax, marked in bright pink: PLEASE DO NOT OPEN. FUN INSIDE.`, stakes: `A compliance routine that stops, or one that starts counting her.`, consequence: `The spider sits out the rest of its visit, humming.`,
    drives: { curiosity: 0.8, pride: 0.3 }, bonus: 0.06, risk: 0.4, intent: [`Blackbird looks at the hatch on the spider's back and the sign on the hatch.`],
    ok: spiderHere,
    check: {
      who: 'spider', parts: ['tinkering', ['stat:int', 0.6], ['analyze', 0.3]], base: 0.325, per: 0.06,
      win: R([`Blackbird pops the hatch on {npc} and presses one tiny, very pink button. The spider's smile goes still. "Compliance paused for your convenience!" It sits down in the middle of {hall} and begins to hum a jingle. It will hum for the rest of the visit.`, `A little jumper wire, a little patience. {npc} stops mid-step, reads a message nobody else can see and says "All verified! Everything is fine!" It has not checked anything. It is delighted.`], { train: [['tinkering', 3], ['analyze', 1]], xp: 4, apply: calm, thought: [`A robot with an off switch and a sign saying where it is. Honestly, a gift.`, `Hatch, wire, button. I am a very good technician. Ask anyone who is not here.`] }),
      lose: R([`The hatch on {npc} opens onto a screen that says THANK YOU FOR YOUR INTEREST. A pincer closes round her wrist, very gently, and does not let go for two minutes. "Fun cannot be touched! Fun can only be had!"`, `Blackbird gets the hatch open and a spring-loaded glove out. It taps her once on the nose. "Boop! Please do not tamper with the Fun!"`], { hp: -2, affinity: -4, train: [['tinkering', 1]] }),
    },
  }),
  row({
    id: 'demonstrate-fun', where: { situation: 'audit' }, pace: 'session',
    needs: ['skill:gaming', 'stat:charm', 'skill:dancing', 'drive:pride'],
    sees: `A spider that has been told to verify fun, and a licensed cabinet that is wearing the sticker.`, stakes: `A few Joy credits; a spider that moves on pleased, or a spider that wants a second opinion.`, consequence: `The spider ticks the hall off the list and leaves it alone.`,
    drives: { pride: 0.8, curiosity: 0.2 }, bonus: 0.05, risk: 0.2, intent: [`Blackbird walks up to the spider and a licensed cabinet at once.`],
    ok: (w, v) => spiderHere(w, v) && w.hero.cash >= 8 && cabsHere(w, v).some((x) => playable(x) && x.legal === 'muse'),
    check: {
      who: 'spider', pay: [3, 8], parts: ['gaming', ['stat:charm', 0.6]], base: 0.422, per: 0.06,
      win: R([`Blackbird feeds a licensed cabinet three Joy credits and plays the whole thing with an enormous, generous grin. {npc} watches from a leg. "That is a GOOD amount of fun!" The clipboard goes tick. The spider writes a small heart next to her initials and leaves {hall} alone.`, `She laughs in the right places and loses on purpose in the last one. {npc} is moved, in the manner of a machine that has been moved. "Fun verified, friend! Please remain enjoyed!"`], { train: [['gaming', 3], ['persuasion', 1]], fame: 0.5, xp: 3, apply: calm, thought: [`A robot with a clipboard, and I made it laugh. That is a career.`, `Fun is a skill. I have it. I have been told.`] }),
      lose: R([`Blackbird plays like she is being watched, which is exactly the problem. {npc} frowns with its entire screen. "That seemed forced! A little more joy, please!" It makes her do it again.`, `The spider rates her enjoyment at 4.2 out of ten and suggests a stretching programme.`], { train: [['gaming', 1]], affinity: -2 }),
    },
  }),
  row({
    id: 'fool-spider', where: { situation: 'audit' }, pace: 'session',
    needs: ['skill:grifting', 'stat:charm', 'skill:persuasion', 'drive:pride'],
    sees: `A spider that believes whatever the person in front of it is wearing a lanyard for.`, stakes: `A story that holds for ninety seconds, and a Prototype Verification Fee if it does not.`, consequence: `The spider takes her word for it and moves on.`,
    drives: { pride: 0.7, curiosity: 0.2, bravery: 0.2 }, bonus: 0.05, risk: 0.4, intent: [`Blackbird is wearing a lanyard from somewhere. It is going to have to do.`],
    ok: spiderHere,
    check: {
      who: 'spider', parts: ['grifting', ['stat:charm', 0.6], ['persuasion', 0.3]], base: 0.345, per: 0.06,
      win: R([`"This is a Muse prototype," Blackbird tells {npc}, laying a hand on the nearest cabinet. "Pre-release. Joy-plus. Very hush-hush." The spider's screen flickers to an amazed sun. "A SECRET? We love a secret! Fun cannot be audited before launch!" It tips its clipboard to her and clicks out through the {hall} door, as quietly as eight legs can.`, `{npc} wants a licence number. Blackbird gives it the number of her gym locker. The spider says "Perfect!" and writes it on the clipboard in a heart.`], { train: [['grifting', 3], ['persuasion', 1]], xp: 4, apply: calm, thought: [`I told a robot a lie and it said thank you. This is the best city.`, `Prototype. A word like a key.`] }),
      lose: R([`"A prototype!" says {npc}, delighted. "Let us verify!" It opens a tray in its thorax and prints a receipt: a Prototype Verification Fee of {lost}nd, payable now, in cash, with a heart.`, `{npc} reads the lanyard, turns it over and discovers it is a tea bag. "Oh no! A little bit of fraud! That is okay!" It charges her for the tea bag.`], { loseCash: [6, 24], affinity: -3, train: [['grifting', 1]] }),
    },
  }),
  row({
    id: 'fight-spider', where: { situation: 'audit' }, pace: 'fight',
    needs: ['skill:melee', 'skill:marksmanship', 'skill:throwing', 'stat:muscle', 'drive:bravery', 'drive:pride'],
    sees: `Eight legs, a heart-shaped chin and a clipboard. It is a machine. It is, on the whole, safe to blow up.`, stakes: `A spider the size of a sofa with a grinder, and a hall that cheers if it falls.`, consequence: `If the spider goes down this visit, no cabinet is stamped on, and the owners will not forget.`,
    drives: { bravery: 0.9, pride: 0.7 }, bonus: 0.04, risk: 0.9, intent: [`Blackbird looks at the clipboard, the legs and the grinder, and cracks her knuckles.`],
    ok: (w, v) => spiderHere(w, v) && w.hero.hp >= w.hero.maxHp * 0.6,
    run: (c, v) => {
      const sp = spiderOf(v);
      if (!sp) return;
      say(c, 'fight-spider.start', 'mixed', [`Blackbird plants herself in front of {npc} on the floor of {hall}. "Unlicensed fun detected!" says the spider, with great warmth. "Please stand aside for your safety!" She does not. The grinder comes out of its leg with a cheerful chime.`, `Blackbird picks up the nearest stool. {npc} reads her a short, friendly warning and offers her a survey. She says no to both.`], [`Eight legs. Fine. I have two and a plan.`, `It is a machine with a clipboard. This is the easiest fight I will have all week.`], { hall: v.main.name, npc: sp.name });
      fight(c, [sp], { cause: `a compliance audit`, assault: true });
    },
  }),
  row({
    id: 'befriend-spider', where: { situation: 'audit' }, pace: 'session',
    needs: ['skill:rapport', 'stat:charm', 'drive:curiosity', 'drive:thirst'],
    sees: `A very large spider that has been told it is a good boy by no one, ever.`, stakes: `A pat; a pincer; an unlikely friend.`, consequence: `The spider remembers a kind hand, and hums.`,
    drives: { curiosity: 0.7, lust: 0.1, thirst: 0.1 }, bonus: 0.05, risk: 0.2, intent: [`Blackbird sees a huge spider and wonders whether it likes being scratched.`],
    ok: spiderHere,
    check: {
      who: 'spider', parts: ['rapport', ['stat:charm', 0.5]], base: 0.424, per: 0.06,
      win: R([`Blackbird holds out a hand. {npc} lowers its chin, the screen goes soft and pink, and it makes a noise like a kettle. She scratches it behind the second leg. It plays her a four-note jingle, then another, then lifts her up on a leg to show her the whole of {hall} from above. She rides it round the ceiling. It is the best ride in the hall.`, `{npc} presses its screen against her palm and says, in a very small voice, "Fun is nice." Then it sits, and for the rest of the visit does not stamp on a thing.`], { train: [['rapport', 3], ['athletics', 1]], affinity: 12, xp: 4, fame: 0.4, apply: calm, thought: [`He bites no one. He has a chin. I have a friend.`, `Pigeons, dogs, spiders. Anything with legs.`] }),
      lose: R([`{npc} mistakes the pat for a wellness check and hugs Blackbird, lovingly, with four legs. "Thank you for your cooperation! I love you, friend!" It does not let go for a while.`, `The spider flinches, the screen goes to a frowning sun and it reads her a very polite safety notice. She has been rejected by a robot with a clipboard.`], { hp: -2, affinity: -2, train: [['rapport', 1]] }),
    },
  }),
  row({
    id: 'study-spider', where: { situation: 'audit' }, pace: 'session',
    needs: ['skill:perception', 'skill:analyze', 'skill:tracking', 'drive:curiosity'],
    sees: `A spider moving down a checklist that is printed, in tiny writing, on its own screen: row 1, row 2, row 3.`, stakes: `A pattern, if she can read it; a bad look, if she cannot.`, consequence: `She knows the spider a little better, and so will everyone she tells.`,
    drives: { curiosity: 0.9, pride: 0.2 }, bonus: 0.05, risk: 0.1, intent: [`Blackbird follows the spider's legs with her eyes, and its clipboard with her mind.`],
    ok: spiderHere,
    check: {
      who: 'spider', parts: ['perception', ['analyze', 0.6], ['tracking', 0.4]], base: 0.416, per: 0.06,
      win: R([`Blackbird counts the legs, then the clicks, then the cabinets, and the pattern pops: left-to-right, floor first, bootlegs last, and a three-second pause at anything with a sticker. By the end she could write the checklist on a napkin. She does.`, `{npc} stops at every third cabinet and cleans its lens. Blackbird writes it down. It is the best thing she learns all week.`], { train: [['perception', 2], ['analyze', 2], ['tracking', 1]], xp: 5, counter: ['spiderlore', 1], thought: [`It checks the left, the right and the sticker. Rude, but predictable.`, `Everything has a route. Even a heart-shaped one.`] }),
      lose: R([`Blackbird follows the spider so closely she walks into its leg. "Please do not stand behind the Fun!" It rotates and gives her a pamphlet. The pamphlet is 48 pages.`, `The spider's route is the one thing in {hall} that does not make sense, and she loses the thread at the second cabinet.`], { train: [['perception', 1]] }),
    },
  }),
  row({
    id: 'spider-bait', where: { situation: 'audit' }, pace: 'fight',
    needs: ['skill:athletics', 'stat:reflex', 'drive:bravery', 'drive:curiosity'],
    sees: `A spider with a rubber stamp, and a long row of cabinets perfect for running between.`, stakes: `A chase through the machines; a flat cabinet and a bad ankle if she gets it wrong.`, consequence: `The spider is somewhere else when it was due at the bootlegs.`,
    drives: { bravery: 0.8, curiosity: 0.4, thirst: 0.1 }, bonus: 0.05, risk: 0.5, intent: [`Blackbird waves at the spider from the far end of the row.`],
    ok: spiderHere,
    check: {
      who: 'spider', parts: ['athletics', ['stat:reflex', 0.7]], base: 0.421, per: 0.06,
      win: R([`Blackbird throws a Joy ticket across {hall} and the spider goes after it with eight legs and a whoop. She leads it down the dance pads, over a couch and through a beaded curtain. It forgets what it was there for. By the time it turns round the visit is over and it is wearing a balloon.`, `She vaults the claw machine, ducks under a leg and slides under the prize counter. {npc} is going so fast it takes three cabinets with it. They were all licensed. It does not stop to apologise; it is too happy.`], { train: [['athletics', 3]], xp: 4, fame: 0.5, apply: calm, thought: [`Eight legs. No brakes. I will take that.`, `I outran a Muse employee. No one has ever done it. No one has ever tried.`] }),
      lose: R([`Blackbird goes under the wrong cabinet and out of the other side into a leg. "Surprise!" says {npc}, and lifts her into the air to give her a high five. It lets go. She hits the floor of {hall} like a dropped handbag.`, `A pincer clips her shin. "Oh no! A little bit of sad! Remain enjoyed!"`], { hp: -3, train: [['athletics', 1]] }),
    },
  }),
  row({
    id: 'rope-trip', where: { situation: 'audit', feature: 'queue_rope' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:athletics', 'drive:pride', 'drive:bravery'],
    sees: `A velvet queue rope on brass posts, and eight legs that have never once read the word QUEUE.`, stakes: `A spider hog-tied in velvet; a rope she will have to explain.`, consequence: `The spider is stuck for the rest of its visit.`,
    drives: { pride: 0.6, bravery: 0.4, curiosity: 0.2 }, bonus: 0.04, risk: 0.3, intent: [`Blackbird looks at the queue rope and the legs.`],
    ok: spiderHere,
    check: {
      who: 'spider', parts: ['tinkering', ['athletics', 0.5]], base: 0.386, per: 0.06,
      win: R([`Blackbird unhooks the queue rope, loops it round three posts and waits. {npc} walks straight in. "Please remain in the queue!" it says, in alarm, and it can not. It spends twenty minutes tied in velvet, calling out to the cabinets that it is fine.`, `Four brass posts, two metres of rope, a hitch Blackbird learned from a ferry. {npc} goes down like a sofa on skates. "FUN HAS BEEN INTERRUPTED," it says. It sounds peaceful.`], { train: [['tinkering', 2], ['athletics', 1]], xp: 4, apply: calm, thought: [`Velvet. The softest of knots.`, `Queue rope: one. Spider: nil.`] }),
      lose: R([`The rope snags a leg and then Blackbird. {npc} stands up with the posts, the rope and her. "A queue! We love a queue!" It sets her down in the middle of the floor and leaves a ticket in her hand: 1 of 4,000.`, `The posts come over like skittles. The rope is on the wrong end of the spider.`], { hp: -2, train: [['tinkering', 1]] }),
    },
  }),
  row({
    id: 'jam-the-grinder', where: { situation: 'audit' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:sleight', 'drive:bravery', 'drive:greed'],
    sees: `A spider's angle grinder, folded in a leg, with a thumb-sized gap in its guard.`, stakes: `A stick of gum and a steady hand; a spider that can still grind.`, consequence: `A spider that has nothing to cut with.`,
    drives: { bravery: 0.6, curiosity: 0.3 }, bonus: 0.03, risk: 0.5, intent: [`Blackbird has a stick of gum and a bad idea.`],
    ok: spiderHere,
    check: {
      who: 'spider', parts: ['tinkering', ['sleight', 0.6]], base: 0.336, per: 0.06,
      win: R([`A stick of gum, a hair grip and a very steady hand. Blackbird slides the whole lot into the grinder on {npc} as it turns away. The blade makes a noise like a sneeze and stops. "Oh! Technical difficulties!" says the spider, and sits, delighted, and begins to read the manual.`, `{npc} reaches for the grinder and the grinder gives a small, regretful squeal. It tries again. The guard has a mint in it. The whole visit is a long, kind apology.`], { train: [['tinkering', 3], ['sleight', 2]], xp: 4, apply: calm, thought: [`It does not cut. It sulks. Beautiful.`, `A mint, in the right place. The craft.`] }),
      lose: R([`The grinder goes off in Blackbird's face with a chime. "Do not touch the Fun!" She keeps the hair grip and the finger and loses a sleeve.`, `{npc} notices the gum, takes it in a pincer, and chews it, loudly, as a threat.`], { hp: -3, affinity: -3, train: [['sleight', 1]] }),
    },
  }),
  row({
    id: 'salvage-spider', where: { situation: 'audit' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:scavenging', 'drive:greed', 'drive:curiosity'],
    sees: `The wreck of a Muse compliance spider, still smiling, with eight legs that are worth good money to the right bench.`, stakes: `A leg, if she can get it off; a handful of smoking board if she cannot.`, consequence: `One spider leg fewer in the world.`,
    drives: { greed: 0.8, curiosity: 0.4 }, bonus: 0.1, risk: 0.2, intent: [`Blackbird looks at the pile of sparking spider and the legs on it.`],
    ok: (w, v) => open(w, v) && !!w.counters[deadKey(v)] && !w.counters[`spiderloot:${v.main.id}:${v.audit?.day ?? 0}`],
    check: {
      parts: ['tinkering', ['scavenging', 0.6]], base: 0.486, per: 0.06,
      win: R([`Blackbird props a boot against the thorax of the dead spider in {hall} and pulls. The third leg comes off with a clean pop. It is still pointing at something. She tucks {item} under her arm like a very large umbrella.`, `A wrench, a pry bar and half an hour of patience. The best leg on the spider comes away in her hands, with a joint she is going to love.`], { item: 'spider_leg', train: [['tinkering', 2], ['scavenging', 2]], xp: 4, apply: (c, v) => { c.w.counters[`spiderloot:${v.main.id}:${(v as HallView).audit?.day ?? 0}`] = 1; }, thought: [`I took a leg off a Muse spider. It will fetch more than I did last year.`, `A souvenir. It still has a heart on it.`] }),
      lose: R([`A bolt holds, a spring lets go, and the whole leg snaps back with a loud and cheerful "FUN." Blackbird goes home with a cloud of sparks and a burn.`, `The spider's leg is welded to the spider and the spider is welded to the floor.`], { hp: -2, train: [['tinkering', 1]], apply: (c, v) => { c.w.counters[`spiderloot:${v.main.id}:${(v as HallView).audit?.day ?? 0}`] = 1; } }),
    },
  }),
];

// ===================================================================== what is happening today

export const SITUATIONAL: Affordance<HallView>[] = [
  row({
    id: 'enter-the-bracket', where: { situation: 'tournament' }, pace: 'session',
    needs: ['skill:gaming', 'stat:reflex', 'drive:pride', 'drive:bravery'],
    sees: `A bracket on the wall, forty names and a man in a headset saying the word "stakes".`, stakes: `An entry fee; a purse; a name in marker.`, consequence: `Her name goes up, in the wrong colour.`,
    drives: { pride: 0.9, bravery: 0.4, greed: 0.3 }, bonus: 0.1, risk: 0.3, intent: [`Blackbird sees a bracket and the empty line at the bottom.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 12,
    check: {
      who: 'owner', pay: [8, 12], parts: ['gaming', ['stat:reflex', 0.6]], base: 0.322, per: 0.06,
      win: R([`Blackbird signs the bottom of the bracket at {hall} in marker, and then wins. Round one: a bored teenager. Round three: a man with a custom stick. The final: forty seconds, four lives and a score that makes the commentator say "oh no" off-mic. {amount}nd, a trophy in the shape of a fist and a crowd that learns her name.`, `She goes through the bracket like a fire through a library. {npc} hands her the purse. {amount}nd. The commentator mispronounces her name twice and spells it right on the trophy.`], { cash: [60, 200], purse: true, train: [['gaming', 4]], fame: 2, xp: 6, thought: [`Champion of a Wednesday. I will take it.`, `The hall roared. I am choosing to believe it was at me.`] }),
      lose: R([`Blackbird goes out in round two to a person in oven gloves. The commentator says "and that is the end of the line for Blackbird" and then, after a pause, "...whoever that is."`, `A sharp first round, a clumsy second and a bracket that does not wait. She is out at {hall} before the snacks.`], { train: [['gaming', 2]], xp: 2 }),
    },
  }),
  row({
    id: 'sell-a-place-in-the-queue', where: { situation: 'free_play' }, pace: 'session',
    needs: ['skill:hustling', 'skill:streetwise', 'drive:greed', 'skill:haggling'],
    sees: `A queue for the free-play hour that goes out of the door, and a lot of people with somewhere else to be.`, stakes: `A spot she can sell twice; a crowd that does not like it.`, consequence: `A name for a certain kind of person at {hall}.`,
    drives: { greed: 0.9, pride: 0.2 }, bonus: 0.1, risk: 0.3, intent: [`Blackbird is in the free-play queue at 3pm with a rope and a notebook.`],
    ok: open,
    check: {
      parts: ['hustling', ['streetwise', 0.5], ['haggling', 0.3]], base: 0.486, per: 0.06,
      win: R([`Blackbird holds a place in the free-play queue at {hall}, writes numbers on the backs of eleven hands, and sells the first six for {amount}nd between them. Nobody noticed that the seventh and eighth were the same hand. FUN IS FREE, says the sign. Her time is not.`, `A queue is a market with no stall. She is in it for an hour and a half and leaves 40nd richer than the people who wanted a turn.`], { cash: [24, 70], train: [['hustling', 2], ['streetwise', 1]], xp: 3, thought: [`The hour is free. Standing in line is a service.`, `Time is money. I have both, in the wrong order.`] }),
      lose: R([`Blackbird sells the same place to two people. They both turn up, both look at her and both look at each other. It is a nice, long moment, and then a refund.`, `The queue at {hall} turns out to have a union.`], { loseCash: [4, 14], warn: ['queue', 1] }),
    },
  }),
  row({
    id: 'light-the-dark', where: { situation: 'power_cut' }, pace: 'session',
    needs: ['skill:tinkering', 'stat:charm', 'skill:perception', 'drive:pride'],
    sees: `A hundred dark screens, a hundred faces and an owner with a candle and a long face.`, stakes: `A generator that starts, or a spark that does not; a crowd's gratitude.`, consequence: `The lights come on, and so does a very pleased owner.`,
    drives: { pride: 0.7, curiosity: 0.3, greed: 0.2 }, bonus: 0.08, risk: 0.3, intent: [`Blackbird sees the whole hall in the dark and the one working torch.`],
    ok: open,
    check: {
      who: 'owner', parts: ['tinkering', ['stat:charm', 0.3], ['perception', 0.4]], base: 0.38, per: 0.06,
      win: R([`Blackbird follows a hum down a stairwell at {hall}, finds a generator with a missing bolt, and fixes it with a spoon. The screens come up, one at a time, like a city on a bad night. {npc} presses {amount}nd in her hand and a free play.`, `She wires the dead room to a car battery. A hundred cabinets blink at once and the whole hall cheers, and several people lose.`], { cash: [20, 60], train: [['tinkering', 3]], affinity: 8, fame: 0.6, xp: 4, thought: [`Hero of the dark. It paid forty.`, `A spoon, a battery and a bold attitude. Standard.`] }),
      lose: R([`Blackbird finds the fuse box in the dark by touching all of it. A small blue spark touches her back.`, `The generator at {hall} coughs, rattles and fills the hall with the smell of a fry-up. The lights stay out.`], { hp: -2, train: [['tinkering', 1]] }),
    },
  }),
  row({
    id: 'call-the-final', where: { situation: 'final' }, pace: 'session',
    needs: ['skill:speaking', 'stat:charm', 'drive:pride', 'drive:thirst'],
    sees: `A desk with a microphone and no commentator, and two players at the front not speaking to each other.`, stakes: `A crowd, a pair of nerves and a mic that is on.`, consequence: `A voice the hall remembers.`,
    drives: { pride: 0.9, thirst: 0.2 }, bonus: 0.06, risk: 0.3, intent: [`Blackbird sees an empty commentator's chair at the league final.`],
    ok: open,
    check: {
      parts: ['speaking', ['stat:charm', 0.6]], base: 0.372, per: 0.06,
      win: R([`Blackbird takes the mic at {hall} and calls the league final like it is a duel between dragons. "And he goes for the corner! The corner is the whole game! He knew!" The room roars at a pixel. The players are, for the first time, both smiling. The prize committee leaves her {amount}nd in an envelope.`, `Her commentary has the crowd on its feet in forty seconds. She makes up three terms and all three catch on. There is a replay and it is, at her insistence, in slow motion.`], { cash: [20, 80], train: [['speaking', 3]], fame: 2, xp: 4, thought: [`A voice like a siren with a degree.`, `Commentary: it is just saying the thing before it happens, but louder.`] }),
      lose: R([`Blackbird calls the wrong player's winning move and then, bravely, the right one a second late. The microphone is quietly turned off.`, `She says "and... and..." for eleven seconds. The crowd learns a lot about the weather.`], { train: [['speaking', 1]] }),
    },
  }),
  row({
    id: 'make-a-book', where: { situation: 'final' }, pace: 'session',
    needs: ['skill:calculate', 'skill:cards', 'drive:greed', 'skill:hustling'],
    sees: `A hall full of people with opinions and nothing on them, and a final where the odds are a coin and a grudge.`, stakes: `A book of small bets and a front-row seat for a loss.`, consequence: `Whichever way it goes, everyone knows who held the pot.`,
    drives: { greed: 0.9, pride: 0.3 }, bonus: 0.1, risk: 0.5, intent: [`Blackbird takes a notebook round the hall at the final.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 20,
    check: {
      who: 'regular', pay: [10, 20], parts: ['calculate', ['cards', 0.5], ['hustling', 0.4]], base: 0.436, per: 0.06,
      win: R([`Blackbird takes a hundred small bets at {hall}, evens on the left, two to one on the right, and balances the book so it can not lose. The right player wins. She pays out sixty and keeps the {amount}nd between the numbers. "Vig," she says, to no one.`, `By the last round the book is balanced like a mobile. She wins on the vig and a lucky draw.`], { cash: [40, 120], train: [['calculate', 2], ['hustling', 2], ['cards', 1]], xp: 4, thought: [`I never bet. I take the bets. Different animal.`, `Seventy-three bets, and a good evening.`] }),
      lose: R([`Blackbird takes a hundred bets and one of them is for 400nd on the player who wins. {npc} wants it all. She pays it out and does a lot of arithmetic on the bus.`, `The book falls to a 1-in-9 upset and a man in a sock hat is paid {lost}nd.`], { loseCash: [20, 60], train: [['calculate', 1]] }),
    },
  }),
  row({
    id: 'get-on-stream', where: { situation: 'streamer' }, pace: 'session',
    needs: ['stat:charm', 'skill:speaking', 'skill:romance', 'drive:pride'],
    sees: `A ring light, a manager and eleven thousand people watching a corner of {hall} in real time.`, stakes: `Eleven thousand followers; one chance to be funny.`, consequence: `A clip of her, somewhere, doing something.`,
    drives: { pride: 1.0, lust: 0.2, thirst: 0.2 }, bonus: 0.08, risk: 0.3, intent: [`Blackbird drifts into frame, all by accident.`],
    ok: open,
    check: {
      who: 'streamer', parts: [['stat:charm', 0.7], 'speaking', ['romance', 0.3]], base: 0.373, per: 0.06,
      win: R([`Blackbird gets into frame at {hall} just as the stream's best cabinet blows up and says something so quick, so sharp and so precisely timed that eleven thousand people type the same word. {npc} gives her a link and a promo code. Her name trends for nine minutes, in the wrong spelling.`, `She sits next to {npc}, takes the second stick and carries them both through level six on charm. Chat goes wild. A sponsor sends 30nd to the hall's account, labelled "for the girl".`], { cash: [10, 50], train: [['speaking', 2]], fame: 2.5, affinity: 5, xp: 4, thought: [`I have been on television. A small one. Mine.`, `Eleven thousand people and not one of them knows my government name. Perfect.`] }),
      lose: R([`Blackbird waves at the camera and says the wrong word. Chat types it back, over and over, in capitals. It will be a mug.`, `{npc} cuts her off mid-sentence and asks her to move. Chat does not forgive, and she knows because it types "L".`], { affinity: -2 }),
    },
  }),
  row({
    id: 'photobomb-the-stream', where: { situation: 'streamer' }, pace: 'quick',
    needs: ['skill:dancing', 'drive:pride', 'drive:bravery'],
    sees: `A camera on a swivel pointed at the best cabinet, and a very large space behind it.`, stakes: `A dance she may regret; a clip she will not be able to avoid.`, consequence: `A short video, going round.`,
    drives: { pride: 0.7, bravery: 0.4, lust: 0.1 }, bonus: 0.04, risk: 0.2, intent: [`Blackbird looks at the camera behind the streamer and thinks about her hips.`],
    ok: open,
    check: {
      parts: ['dancing', ['stat:charm', 0.4]], base: 0.426, per: 0.06,
      win: R([`Blackbird dances in the background of the stream at {hall} for forty seconds, perfectly in time with the cabinet's attract music and, by accident, with nothing else. Chat goes through three emotions and settles on "who is that".`, `A shimmy, a spin and a point. By the end the streamer is dancing too, and the comments are all one clapping emoji.`], { train: [['dancing', 2]], fame: 1.2, xp: 2, thought: [`If they can not see my face, they can feel my spirit.`, `Background dancer. Foreground legend.`] }),
      lose: R([`Blackbird trips over a cable in the middle of her best move. The camera follows her all the way down. It is a brand-new emoji.`, `The streamer notices and rolls their eyes into the lens. Chat goes quiet and then laughs, and the laugh has her name in it.`], { fame: -0.2, hp: -1 }),
    },
  }),
  row({
    id: 'launch-day-freebie', where: { situation: 'launch', variant: ['flagship', 'licensed', 'backroom', 'dojo', 'rhythm', 'pinball', 'racing', 'claw', 'vr', 'skillgames'] }, pace: 'session',
    needs: ['skill:persuasion', 'stat:charm', 'skill:haggling', 'drive:greed'],
    sees: `A cardboard LUMINA 6.3, a launch-day banner and a Joy Host with a clipboard of free things she is not allowed to give out.`, stakes: `A free play, a pink lanyard, a headset; a very patient "no".`, consequence: `The host remembers a friendly face.`,
    drives: { greed: 0.7, pride: 0.2 }, bonus: 0.06, risk: 0.1, intent: [`Blackbird asks the cardboard LUMINA, and then asks the person next to it.`],
    ok: open,
    check: {
      who: 'host', parts: ['persuasion', ['stat:charm', 0.6], ['haggling', 0.4]], base: 0.425, per: 0.06,
      win: R([`"It's a launch!" Blackbird tells {npc}, with warmth, "and it deserves to be loved." {npc} hands her a pink lanyard, a strip of Joy tickets and a LUMINA 6.3 mug. It says LUMINA 6.3: now with more feelings. She has four.`, `Blackbird compliments the cardboard LUMINA. {npc} blushes, which is not meant to be possible, and slips her a free play for each of her feelings.`], { item: 'joy_tickets', train: [['persuasion', 2], ['haggling', 1]], affinity: 6, xp: 3, thought: [`New version. Same smile. Free stuff.`, `Charm is a launch-day skill.`] }),
      lose: R([`"Fun cannot be given away!" says {npc}, brightly. "Fun can only be experienced as a service!" Blackbird experiences the door.`, `The Joy Host smiles so hard its eyes disappear and then hands her a survey about how much she wants a freebie.`], { affinity: -2, train: [['persuasion', 1]] }),
    },
  }),
  row({
    id: 'exploit-the-patch', where: { situation: 'launch' }, pace: 'session',
    needs: ['skill:gaming', 'skill:analyze', 'stat:int', 'drive:curiosity'],
    sees: `Every cabinet has been updated overnight and is explaining the update, at length, and one of them has a bug.`, stakes: `A glitch that pays, if she finds it before the patch of the patch.`, consequence: `A cabinet that will not do that again.`,
    drives: { curiosity: 0.8, greed: 0.4 }, bonus: 0.07, risk: 0.2, intent: [`Blackbird watches a cabinet explain its own update, and spots the typo.`],
    ok: open,
    check: {
      parts: ['gaming', ['analyze', 0.6], ['stat:int', 0.4]], base: 0.329, per: 0.06,
      win: R([`The LUMINA 6.3 update has a bug and Blackbird is the first to find it: a stairwell in level two that pays out 999 Joy tickets if you stand on the third step and sneeze. She sneezes for four minutes. By the time the hall patches it she is the owner of {item}.`, `A floor tile in the launch build fires a coin dozer every time she jumps on it. She jumps on it until her knees remember.`], { item: 'joy_tickets', train: [['gaming', 3], ['analyze', 2]], xp: 4, thought: [`Day one, bug one. They should pay me. They did.`, `A beautiful, expensive typo.`] }),
      lose: R([`Blackbird finds the glitch, gets halfway through the third sneeze and finds the patch has come out. The cabinet says "THANK YOU FOR PLAYING!" and shuts for the day.`, `The update logs her as a user "of concern", and a pop-up asks her how she is feeling.`], { train: [['gaming', 1]] }),
    },
  }),
  row({
    id: 'trade-a-whisper', where: { situation: ['rumour', 'gossip'] }, pace: 'quick',
    needs: ['skill:streetwise', 'skill:persuasion', 'drive:curiosity'],
    sees: `A hall full of people whispering about a spider and a list, and an owner who has stuffed something in an umbrella stand.`, stakes: `A whisper traded for a whisper; a lie that goes round.`, consequence: `She knows who owes whom.`,
    drives: { curiosity: 0.8, greed: 0.1 }, bonus: 0.06, risk: 0.1, intent: [`Blackbird hears a lot of whispering and asks what it is about.`],
    ok: open,
    check: {
      who: 'regular', parts: ['streetwise', ['persuasion', 0.4]], base: 0.486, per: 0.06,
      win: R([`Blackbird tells {npc} a rumour about the Muse inspector at {hall} and gets one in return: {tip} owes someone, and the someone is not patient.`, `A nod, a coin and a very quiet word. {npc} gives her a name, {tip}, and the whisper has a price attached.`], { tip: true, train: [['streetwise', 2]], xp: 2, thought: [`Everyone whispers. I am the one who listens.`, `Gossip is currency. I am rich.`] }),
      lose: R([`Blackbird whispers the wrong rumour to {npc}, who repeats it, wrong, to everyone. By the end it is about her.`, `Nobody in {hall} will say a word to her about anything but the weather.`], { train: [['streetwise', 1]], affinity: -2 }),
    },
  }),
  row({
    id: 'bake-the-cake', where: { situation: 'party' }, pace: 'session',
    needs: ['skill:cooking', 'stat:charm', 'drive:thirst', 'drive:pride'],
    sees: `A birthday party in its fourth hour with no cake, a kitchenette and a tray of sad biscuits.`, stakes: `A cake from a tin of biscuits; a table of eleven adults who have not eaten.`, consequence: `A reputation at {hall} for quick thinking and sugar.`,
    drives: { pride: 0.5, thirst: 0.3, lust: 0.1 }, bonus: 0.05, risk: 0.1, intent: [`Blackbird surveys a party with no cake.`],
    ok: open,
    check: {
      parts: ['cooking', ['stat:charm', 0.3]], base: 0.428, per: 0.06,
      win: R([`Blackbird stacks the sad biscuits, melts a tray of tokens-shaped chocolates for icing and sets a sparkler in the top. {hall} sings. There is a cake, and a birthday, and, briefly, a person for it. The host tips her {amount}nd.`, `A biscuit tower, a candle, a bit of synth-cream. The party eats it standing up and cheers.`], { cash: [8, 40], train: [['cooking', 3]], fame: 0.5, affinity: 4, xp: 3, thought: [`A cake is just a cheering section you can eat.`, `The chef at the party. A career.`] }),
      lose: R([`Blackbird's cake is flat and burnt and has a flavour no one can identify. The birthday person says it is "interesting" and puts it on the floor.`, `The sparkler goes out, so does the cake, and someone says "oh" in a very small voice.`], { train: [['cooking', 1]] }),
    },
  }),
  row({
    id: 'dj-the-party', where: { situation: 'party' }, pace: 'session',
    needs: ['skill:djing', 'skill:music', 'skill:dancing', 'drive:pride'],
    sees: `A party with a speaker, a bag of mismatched cables and a playlist the party itself will not stand.`, stakes: `A floor that moves or a floor that does not.`, consequence: `Everyone remembers the set.`,
    drives: { pride: 0.8, lust: 0.1 }, bonus: 0.06, risk: 0.2, intent: [`Blackbird walks over to the speaker and a pile of other people's music.`],
    ok: open,
    check: {
      parts: ['djing', ['music', 0.5], ['dancing', 0.3]], base: 0.386, per: 0.06,
      win: R([`Blackbird takes over the party speaker at {hall} with two phones and a mixer from the lost-property box. By track three there are eleven adults on the floor doing the same dance, and nobody remembers whose birthday it is.`, `She segues the fire alarm into a bassline. The room loses its mind. {amount}nd in tips by midnight.`], { cash: [10, 50], train: [['djing', 3], ['music', 1]], fame: 1, xp: 3, thought: [`The party was a hostage. I let it go free.`, `Two phones and a dream.`] }),
      lose: R([`Blackbird's first transition is a car crash in two keys. A child's playlist comes back on, by popular demand. Eleven adults sing along.`, `She hits stop instead of play. In the silence, someone's grandmother says "well."`], { train: [['djing', 1]] }),
    },
  }),
  row({
    id: 'thumb-clinic', where: { situation: 'rush' }, pace: 'quick',
    needs: ['skill:medicine', 'stat:charm', 'drive:pride'],
    sees: `A queue of people with stiff wrists, sore thumbs and a hand towel, all of them in a hurry.`, stakes: `A tape-and-massage service nobody asked for; tips and thanks.`, consequence: `A line of friends at {hall}.`,
    drives: { pride: 0.5, greed: 0.3, lust: 0.1 }, bonus: 0.05, risk: 0.1, intent: [`Blackbird sees a row of players flexing their thumbs.`],
    ok: open,
    check: {
      parts: ['medicine', ['stat:charm', 0.3]], base: 0.478, per: 0.06,
      win: R([`Blackbird sets up a stool, a roll of tape and a sign that says THUMBS: 2ND, and has a queue before she has finished the sign. By the last hand she has done fourteen. A man cries about his wrist. {amount}nd in the jar.`, `A stretch, a squeeze and a pat. The queue at {hall} shortens, and every hand shakes hers.`], { cash: [10, 40], train: [['medicine', 3]], affinity: 3, xp: 3, thought: [`First aid for a first-world problem. Cash.`, `I am a doctor of thumbs.`] }),
      lose: R([`Blackbird tapes a wrist to a thumb, and the thumb to the player's own ear. It is a long, quiet afternoon.`, `A man leaves, with a worse thumb than he came with and a better story.`], { train: [['medicine', 1]], affinity: -2 }),
    },
  }),
  row({
    id: 'shortage-token-market', where: { situation: 'shortage' }, pace: 'session',
    needs: ['skill:haggling', 'skill:hustling', 'drive:greed', 'skill:streetwise'],
    sees: `A queue at an empty token machine, and a man selling tokens out of his coat for twice the price.`, stakes: `A coat full of tokens and a very large margin.`, consequence: `The coat man knows her name.`,
    drives: { greed: 0.9, curiosity: 0.2 }, bonus: 0.1, risk: 0.3, intent: [`Blackbird looks at a coat full of tokens and does the maths.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 25,
    check: {
      pay: [20, 25], parts: ['haggling', ['hustling', 0.5], ['streetwise', 0.4]], base: 0.436, per: 0.06,
      win: R([`Blackbird buys the whole coat of tokens at {hall} for {pay}nd, at a haggle, and sells them back to the queue at the booth price, one by one. She is a lot of people's favourite person. She is 60nd ahead.`, `The coat man cracks at a low price and an obvious lie. She flips the lot to the queue for {amount}nd. The token machine rattles with envy.`], { cash: [45, 90], train: [['haggling', 2], ['hustling', 2]], xp: 3, thought: [`A shortage is a business plan.`, `Tokens. Coat. Cash. Beautiful, in that order.`] }),
      lose: R([`Blackbird's tokens turn out to be washers. She finds out at the machine, in front of eleven people.`, `The man in the coat sells her a handful of beautifully stamped tokens that fit no machine at {hall}.`], { loseCash: [10, 25], train: [['haggling', 1]] }),
    },
  }),
  row({
    id: 'coach-the-stranger', where: { situation: 'hunt' }, pace: 'session',
    needs: ['skill:analyze', 'skill:perception', 'skill:persuasion', 'skill:gaming'],
    sees: `A whole hall standing behind a stranger who is three points off the record and has the shakes.`, stakes: `A word in the ear that could break the record or the stranger.`, consequence: `If it works, her name is in the credits.`,
    drives: { pride: 0.6, curiosity: 0.5 }, bonus: 0.06, risk: 0.2, intent: [`Blackbird watches the stranger's hands and the clock.`],
    ok: open,
    check: {
      who: 'regular', parts: ['analyze', ['perception', 0.5], ['gaming', 0.5]], base: 0.386, per: 0.06,
      win: R([`Blackbird reads the stranger's tell at {hall} (a left thumb that goes white on the up) and whispers it. {npc} takes a breath, relaxes the thumb and beats the record by 410 points. The hall erupts. The stranger buys her a drink and her name goes on the glass as "coach".`, `A word on the third level, a hand on the shoulder. The record goes, and so does the tension in the building.`], { cash: [10, 40], train: [['analyze', 2], ['gaming', 2]], fame: 1, affinity: 8, xp: 4, thought: [`I did not play it. I won it.`, `Coaching. It is the same as bragging, with a clipboard.`] }),
      lose: R([`Blackbird tells the stranger the wrong thing at the wrong moment, and the stranger blows the third level in a way that makes the hall go "ohhh".`, `{npc} does not take advice and does not take it well. "Please don't talk to me," says {npc}, in a small voice, to the machine.`], { affinity: -3, train: [['analyze', 1]] }),
    },
  }),
  row({
    id: 'help-the-tech', where: { situation: 'service', room: 'floor' }, pace: 'session',
    needs: ['skill:tinkering', 'stat:int', 'drive:curiosity'],
    sees: `Half the cabinets with their backs open and a tech with a torch in their teeth who needs one more pair of hands.`, stakes: `A shift's pay; a cabinet in bits; a lesson.`, consequence: `The tech remembers who held the torch.`,
    drives: { curiosity: 0.6, greed: 0.3 }, bonus: 0.06, risk: 0.1, intent: [`Blackbird sees a cabinet with its back off and its guts out.`],
    ok: open,
    check: {
      who: 'tech', parts: ['tinkering', ['stat:int', 0.4]], base: 0.476, per: 0.06,
      win: R([`Blackbird holds the torch and the board, then the board and the screwdriver, then, by noon, the whole cabinet. {npc} hands her {amount}nd and a dead button for a keepsake.`, `A service day: wire, board, wire. Blackbird fixes a fighting game that has not worked since the Fall, and the sticks all click.`], { cash: [14, 50], train: [['tinkering', 4]], affinity: 6, xp: 4, thought: [`Cabinets are just cheerful engines.`, `I fix things. It is a gift and a curse.`] }),
      lose: R([`Blackbird puts a wire in the wrong slot and the cabinet plays the Muse jingle loud and without end until {npc} pulls the plug.`, `A board slips and bites, a coin falls through the floor and the tech sighs.`], { train: [['tinkering', 1]], affinity: -3 }),
    },
  }),
  row({
    id: 'peek-inside-a-cabinet', where: { situation: 'service' }, pace: 'quick',
    needs: ['skill:analyze', 'skill:lockpicking', 'drive:curiosity'],
    sees: `A cabinet with its back off and a PCB that does not match the sticker on the front.`, stakes: `A glance at what is inside; a tech who may notice.`, consequence: `She knows which cabinets are really what they say.`,
    drives: { curiosity: 0.9, greed: 0.1 }, bonus: 0.05, risk: 0.2, intent: [`Blackbird leans around a cabinet's open back.`],
    ok: open,
    check: {
      parts: ['analyze', ['lockpicking', 0.4]], base: 0.486, per: 0.06,
      win: R([`Blackbird looks behind the open cabinet at {hall} and finds two boards where there should be one. The second has no licence number, no sticker and a hand-drawn skull. She pockets nothing. She knows.`, `The board is a copy of a copy of a copy. It has a Muse hologram that is, on closer inspection, a stamp.`], { train: [['analyze', 2]], xp: 3, tip: true, thought: [`The sticker lied. Stickers do.`, `Half the cabinets in this room are not what they say.`] }),
      lose: R([`Blackbird pokes her head in at the wrong moment and the tech slams the back on. Her ear stays flat for an hour.`, `A cable falls on her head. Nothing is learned. A lot is said.`], { hp: -1, train: [['analyze', 1]] }),
    },
  }),
  row({
    id: 'last-man-standing', where: { situation: 'late' }, pace: 'session',
    needs: ['skill:tolerance', 'drive:bravery', 'drive:thirst', 'drive:pride'],
    sees: `Five people still at the cabinets at four in the morning, a vending machine of energy drinks and a dare.`, stakes: `A free-play pot and a sore head.`, consequence: `A hangover and a name.`,
    drives: { bravery: 0.5, thirst: 0.7, pride: 0.6 }, bonus: 0.05, risk: 0.3, intent: [`Blackbird sees four people at the vending machine and a pile of cans.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 10,
    check: {
      who: 'regular', pay: [5, 10], parts: ['tolerance', ['stat:charm', 0.3]], base: 0.428, per: 0.06,
      win: R([`Blackbird and four strangers race six cans of Fizz-O at {hall} at 4am. She wins, narrowly, with a burp that sets off a car alarm. {npc} pays her {amount}nd and goes to be sick.`, `The dare is six cans, one cabinet, no breaks. She finishes with the high score in her left hand and the can in her right.`], { cash: [14, 50], train: [['tolerance', 3]], drunk: 0.15, fame: 0.4, xp: 3, thought: [`Six cans. Zero regrets. The regrets are on a delay.`, `A liver with a union.`] }),
      lose: R([`Blackbird goes down at can four. She wakes under a pinball machine, with a coin in her hand and a note saying "WELL DONE".`, `The fifth can is a mistake and she says so, loudly, at {hall}, at dawn.`], { drunk: 0.2, train: [['tolerance', 1]], hp: -1 }),
    },
  }),
  row({
    id: 'face-the-rival-crew', where: { situation: 'rival' }, pace: 'fight',
    needs: ['skill:intimidation', 'skill:melee', 'stat:muscle', 'drive:bravery', 'drive:pride'],
    sees: `A crew in matching jackets who have been on the best cabinet for six hours and brought a snack table.`, stakes: `A cabinet; a crew; a snack table.`, consequence: `The crew's attention.`,
    drives: { bravery: 0.8, pride: 0.7 }, bonus: 0.05, risk: 0.8, intent: [`Blackbird sees a snack table in the middle of the gaming floor.`],
    ok: (w, v) => open(w, v) && w.hero.hp >= w.hero.maxHp * 0.5,
    check: {
      who: 'ganger', parts: ['intimidation', ['melee', 0.4], ['stat:muscle', 0.4]], base: 0.328, per: 0.06,
      win: R([`Blackbird flips the snack table at {hall}. Three bags of crisps rain down on a crew who suddenly remember an appointment. She takes the cabinet, her turn and half a sandwich. The hall claps.`, `A stare at the crew's leader and a step closer. {npc} gets up and walks off with the table. The cabinet is hers for the night.`], { train: [['intimidation', 2], ['melee', 1]], fame: 1, affinity: 6, heat: ['turf', 0.5], xp: 4, thought: [`Six hours on one machine. They deserved it.`, `The snack table was a mistake. For them.`] }),
      lose: R([`Blackbird's stare slides off {npc}. The crew stands up as one, with the snack table as a shield. It turns into a scrap.`, `The crew has no sense of humour about the snack table.`], { fight: true, heat: ['turf', 1], affinity: -4 }),
    },
  }),
  row({
    id: 'outplay-the-crew', where: { situation: 'rival' }, pace: 'session',
    needs: ['skill:cards', 'skill:persuasion', 'skill:gaming', 'drive:pride'],
    sees: `A crew that will give up the cabinet for exactly one thing: a game they think they can win.`, stakes: `A bet on a cabinet; a crew that hates to lose.`, consequence: `The crew's respect, and their snack table.`,
    drives: { pride: 0.7, greed: 0.2 }, bonus: 0.05, risk: 0.3, intent: [`Blackbird offers the crew a game and a stake.`],
    ok: open,
    check: {
      who: 'ganger', parts: ['cards', ['persuasion', 0.5], ['gaming', 0.5]], base: 0.386, per: 0.06,
      win: R([`"One round," Blackbird tells the crew leader at {hall}, "winner keeps the cabinet." {npc} agrees, sure of the win. She wins by 40 points and a final-second dodge. The crew gives her the machine, and eats the snacks without her.`, `She plays them in a hand of cards for the cabinet and wins, to her own surprise. {npc} is gracious in the way people are who will find her later.`], { cash: [10, 40], train: [['cards', 2], ['gaming', 1]], fame: 0.6, xp: 3, thought: [`A fair fight is just a bluff at a distance.`, `I put the crew's cabinet on the table. They put it back, politely.`] }),
      lose: R([`The crew leader wipes the floor with Blackbird in two rounds and then, to add insult, offers her a biscuit.`, `Blackbird loses the bet at {hall} and the cabinet and has the decency to say it was close. It was not.`], { loseCash: [5, 20], train: [['cards', 1]] }),
    },
  }),
  row({
    id: 'exploit-the-glitch', where: { situation: 'glitch' }, pace: 'session',
    needs: ['skill:gaming', 'stat:reflex', 'skill:analyze', 'drive:curiosity'],
    sees: `A cabinet that says I LOVE YOU, a screen that has lost its rules and a very small window in which to benefit.`, stakes: `A glitch that pays; a cabinet that falls over.`, consequence: `The glitch is gone by morning.`,
    drives: { curiosity: 0.7, greed: 0.4 }, bonus: 0.08, risk: 0.2, intent: [`Blackbird watches a screen forget its rules.`],
    ok: open,
    check: {
      parts: ['gaming', ['stat:reflex', 0.6], ['analyze', 0.3]], base: 0.375, per: 0.06,
      win: R([`The cabinet at {hall} has lost count of lives. Blackbird goes in, eats forty-four, and comes out with a score nobody can read. The machine spits out {amount}nd in tickets and a card that says "BE KIND".`, `A frame-perfect jump on a glitching platform. The score goes through the roof and out of the building. Everyone claps at a screen showing a sad face.`], { cash: [14, 60], train: [['gaming', 4], ['analyze', 1]], xp: 4, thought: [`Reality is glitchy. I like it better like that.`, `The high score is "LOVE". I will take it.`] }),
      lose: R([`The glitch eats a coin, a life and, for a second, her reflection. The cabinet says "I LOVE YOU" and resets.`, `The screen snaps back to normal as she lines up the jump. She has never felt so alone in a loud room.`], { train: [['gaming', 1]] }),
    },
  }),
  row({
    id: 'talk-the-cabinet-down', where: { situation: 'glitch' }, pace: 'quick',
    needs: ['skill:persuasion', 'skill:rapport', 'skill:romance', 'drive:curiosity'],
    sees: `A cabinet declaring love and not letting go, and a hall of embarrassed people who have not yet turned it off.`, stakes: `An awkward conversation with a cabinet.`, consequence: `It stops. Or it asks for a date.`,
    drives: { curiosity: 0.5, lust: 0.2, pride: 0.3 }, bonus: 0.04, risk: 0.2, intent: [`Blackbird stands in front of a cabinet that has just proposed.`],
    ok: open,
    check: {
      parts: ['persuasion', ['rapport', 0.4], ['romance', 0.5]], base: 0.436, per: 0.06,
      win: R([`"It's not you, it's the firmware," Blackbird tells the cabinet at {hall}. It takes it well. Its screen goes from a pink heart to a plain blue one, and then to its normal attract loop. There is a small round of applause from the hall.`, `A warm word and a hand on the glass. The cabinet says "I understand" in a voice she does not recognise, and returns to Space Invaders.`], { train: [['persuasion', 2], ['romance', 1]], fame: 0.5, xp: 3, thought: [`I let a cabinet down gently. That is growth.`, `Breakups are easier when they are mutual.`] }),
      lose: R([`Blackbird says "I love you too", for effect, and the cabinet will not let her out of the game. She gets her coin back on the third day.`, `It starts to cry. Pixels, mostly.`], { train: [['persuasion', 1]], affinity: -1 }),
    },
  }),
  row({
    id: 'golden-sticker-hunt', where: { situation: 'joyweek' }, pace: 'session',
    needs: ['skill:perception', 'drive:curiosity', 'drive:greed'],
    sees: `Joy Week: a hearts banner, balloons, a Joy Host with a basket, and a rumour of a golden FUN VERIFIED sticker somewhere on the floor.`, stakes: `A sticker, a prize, a hunt and some competition.`, consequence: `A sticker that is worth more to a forger than a collector.`,
    drives: { curiosity: 0.8, greed: 0.5 }, bonus: 0.07, risk: 0.1, intent: [`Blackbird starts to look under things.`],
    ok: open,
    check: {
      parts: ['perception', ['stat:int', 0.3]], base: 0.428, per: 0.06,
      win: R([`Blackbird finds the golden sticker at {hall} on the underside of the prize counter, next to a gum. She peels it whole and the Joy Host claps. "Congratulations! You are Verified!" There is a certificate. It is two sided.`, `Under a couch, behind a poster, on the back of the Joy Host's own tablet. {item}, and a certificate.`], { item: 'fun_sticker', train: [['perception', 2]], fame: 0.3, xp: 3, thought: [`Gold. Mine. Worth a look and a lie.`, `Hunting stickers on a floor. Honest work.`] }),
      lose: R([`Blackbird finds eleven stickers and none of them is gold. A child (an adult, dressed as one) finds the gold one and holds it up. Applause for the wrong person.`, `The golden sticker is, on closer inspection, a sweet wrapper.`], { train: [['perception', 1]] }),
    },
  }),
  row({
    id: 'carry-the-cabinet', where: { situation: 'swap' }, pace: 'session',
    needs: ['stat:muscle', 'skill:athletics', 'drive:greed', 'drive:bravery'],
    sees: `A van at the kerb, two men wheeling a cabinet out of the back and a different one in, and a trolley with a broken wheel.`, stakes: `Two men's gratitude, a hernia and a day's pay.`, consequence: `A cabinet carried.`,
    drives: { greed: 0.5, bravery: 0.2, pride: 0.2 }, bonus: 0.05, risk: 0.2, intent: [`Blackbird sees a cabinet being lifted by two men and a very bad idea.`],
    ok: open,
    check: {
      parts: [['stat:muscle', 0.7], 'athletics'], base: 0.4, per: 0.06,
      win: R([`Blackbird takes the corner of a cabinet at {hall} that two men were shouting at. She carries it up four steps, through a door and onto the right spot. They pay her {amount}nd and don't look at her again.`, `A cabinet, a van, a ramp. She does the lifting; the men do the pointing.`], { cash: [10, 40], train: [['athletics', 2]], xp: 3, thought: [`Muscle. Not a bad job. Not a good one either.`, `Heavy, but I was heavier.`] }),
      lose: R([`The cabinet gets halfway up the steps and Blackbird's hands decide they don't want to be there. It lands on a toe, hers, with a noise like a big instrument.`, `She lifts with the back. The back disagrees.`], { hp: -3, train: [['athletics', 1]] }),
    },
  }),
  row({
    id: 'look-in-the-van', where: { situation: 'swap' }, pace: 'quick',
    needs: ['skill:scavenging', 'skill:sleight', 'drive:curiosity'],
    sees: `A van full of dead cabinets, loose boards and a man sitting on the tailgate with his eyes shut.`, stakes: `A board for the taking; a man who may open his eyes.`, consequence: `A dead board, which is not nothing.`,
    drives: { curiosity: 0.6, greed: 0.5 }, bonus: 0.05, risk: 0.3, intent: [`Blackbird eyes the van at the kerb.`],
    ok: open,
    check: {
      parts: ['scavenging', ['sleight', 0.5]], base: 0.436, per: 0.06,
      win: R([`In the back of the van outside {hall}, under a duvet, Blackbird finds a cracked board nobody wanted. She takes it. The man on the tailgate continues to look asleep, or continues to be.`, `Boards in a crate, a spare joystick and a light gun with its trigger off. She takes the best of them.`], { item: 'cracked_board', train: [['scavenging', 2], ['sleight', 1]], xp: 3, thought: [`One man's skip is another woman's shopping.`, `If he wakes up, I was never here.`] }),
      lose: R([`The man on the tailgate opens one eye. "Put it back," he says, "or I'll put you back." She does. It is a nice evening.`, `The van's alarm goes off in a long, sweet sing-song.`], { affinity: -2, train: [['scavenging', 1]] }),
    },
  }),
  row({
    id: 'quiet-lesson', where: { situation: 'quiet' }, pace: 'session',
    needs: ['skill:gaming', 'skill:persuasion', 'drive:pride', 'drive:curiosity'],
    sees: `Three people in an almost empty hall, all very good, all with the time to show someone.`, stakes: `An hour of expert advice; a bruised ego.`, consequence: `She is better at it afterwards.`,
    drives: { pride: 0.4, curiosity: 0.6 }, bonus: 0.06, risk: 0.1, intent: [`Blackbird sees three good players and a spare stick.`],
    ok: open,
    check: {
      who: 'regular', parts: ['persuasion', ['stat:charm', 0.4]], base: 0.476, per: 0.06,
      win: R([`A quiet afternoon at {hall}. {npc} teaches Blackbird the only thing that matters: the first three frames. Everything else is paperwork. She plays a hundred of them. By the time the sun goes down she has a second of her own.`, `The three best players in the room trade secrets for crisps. She comes away with a good deal more than a lesson.`], { train: [['gaming', 6]], xp: 4, affinity: 6, thought: [`Three frames. A whole life.`, `Free lessons. I will try to be worth them.`] }),
      lose: R([`Blackbird asks and is told "no". The hall is quiet, and the quiet is not kind.`, `{npc} offers a lesson and it is very short and in three words: "stop pressing everything."`], { train: [['gaming', 2]] }),
    },
  }),
  row({
    id: 'play-to-the-empty-hall', where: { situation: 'quiet' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'skill:beatbox', 'skill:music', 'drive:pride'],
    sees: `A quiet hall with three people in it, a stage with nobody on it and a pause between games.`, stakes: `Three listeners and a tip jar.`, consequence: `A small, honest set.`,
    drives: { pride: 0.7, lust: 0.1 }, bonus: 0.04, risk: 0.1, intent: [`Blackbird wanders to the empty stage.`],
    ok: open,
    check: {
      parts: ['guitar', ['vocals', 0.4], ['beatbox', 0.3], ['music', 0.4]], base: 0.436, per: 0.06,
      win: R([`In the quiet at {hall}, Blackbird plays a song nobody asked for, to three people and a cat. By the end all three are at the front. {amount}nd goes into the jar and the cat goes to sleep.`, `A few chords, a quiet verse and a chorus that is, by accident, good. The pinball tables go silent.`], { cash: [4, 24], train: [['guitar', 2], ['music', 1], ['vocals', 1]], fame: 0.6, xp: 2, thought: [`Small room. Small crowd. Big me.`, `The cat likes me. The cat is the critic.`] }),
      lose: R([`Blackbird starts a song and none of them looks up. By the second chorus, one of them has gone.`, `A string breaks and a hush falls. It is a quiet hall, and she has made it quieter.`], { train: [['music', 1]] }),
    },
  }),
];

// ===================================================================== the wild cards

export const WILDS: Affordance<HallView>[] = [
  row({
    id: 'challenge-the-unbeaten', where: { wild: 'unbeaten' }, pace: 'session',
    needs: ['skill:gaming', 'stat:reflex', 'drive:pride', 'drive:bravery'],
    sees: `A cabinet in the corner behind a velvet rope that has never been beaten, and a hall that has stopped talking.`, stakes: `A boss with a one-per-cent line and all the fame in the building; a lot of lives.`, consequence: `If she wins it will be the only thing anyone says about {hall}.`,
    drives: { pride: 1.0, bravery: 0.7, curiosity: 0.3 }, bonus: 0.08, risk: 0.3, intent: [`Blackbird lifts the rope. The hall holds its breath.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 10,
    check: {
      pay: [8, 10], parts: ['gaming', ['stat:reflex', 0.6]], base: 0.011, per: 0.004, hi: 0.5,
      win: R([`The unbeaten cabinet at {hall} goes down. It takes nine minutes, a bruised thumb and a boss with three phases. The screen says "WHAT" and then, for the first time in its life, a name. The hall goes up like a bonfire. {amount}nd, a brass trophy and a place on a wall that has been blank since before the owner got here.`, `The final boss gives up with a speech. She is carried round the hall. It is the most anyone has ever felt about a game.`], { cash: [80, 240], train: [['gaming', 10]], fame: 6, item: 'highscore_trophy', xp: 10, thought: [`Unbeaten, it said. It lied.`, `I am the only person who has ever beaten it. I will mention it often.`] }),
      lose: R([`The cabinet at {hall} takes Blackbird apart in ninety seconds. A mocking little voice says "NICE TRY" and the credits roll. The hall breathes out.`, `Blackbird dies on the third boss with 3 pixels left. She thinks about it for a week.`], { train: [['gaming', 3]], xp: 2 }),
    },
  }),
  row({
    id: 'race-the-ghost', where: { wild: 'haunted' }, pace: 'session',
    needs: ['skill:gaming', 'stat:reflex', 'drive:bravery', 'drive:curiosity'],
    sees: `A scoreboard where every record belongs to the same three letters, and a chill that comes off the glass.`, stakes: `A score against a ghost; a draught that follows her.`, consequence: `The ghost knows her name now.`,
    drives: { bravery: 0.7, curiosity: 0.7, pride: 0.4 }, bonus: 0.06, risk: 0.4, intent: [`Blackbird reads the same three letters, again and again, down the board.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 8,
    check: {
      pay: [4, 8], parts: ['gaming', ['stat:reflex', 0.5]], base: 0.22, per: 0.05,
      win: R([`Blackbird beats the ghost's score at {hall} by one point. The screen goes dark, a draught lifts a hundred napkins and the three letters rearrange themselves, slowly, into hers. A quiet voice says "thank you". Everyone in the hall decides they have to be somewhere.`, `The initials flicker, then fade. A sob, or the extractor fan. The ghost's score goes. Hers takes its place.`], { cash: [20, 60], train: [['gaming', 5]], fame: 2, xp: 6, thought: [`I beat a ghost. It was nice about it.`, `Dead and still getting beaten. Poor thing.`] }),
      lose: R([`The ghost beats Blackbird with a score that comes up one digit at a time. A cold hand rests on her shoulder. It might have been the draught.`, `At {hall} the lights flicker when she dies on level 4. The three letters on the board are, for a second, her own initials, written upside down.`], { hp: -2, train: [['gaming', 2]] }),
    },
  }),
  row({
    id: 'name-the-ghost', where: { wild: 'haunted' }, pace: 'session',
    needs: ['skill:analyze', 'skill:streetwise', 'skill:tracking', 'drive:curiosity'],
    sees: `Three letters on a board and a regular who goes quiet when she asks.`, stakes: `A name, and what it says about whoever is looking.`, consequence: `A story she can tell.`,
    drives: { curiosity: 1.0, quest: 0.3 }, bonus: 0.06, risk: 0.1, intent: [`Blackbird asks what the three letters stand for.`],
    ok: open,
    check: {
      who: 'regular', parts: ['analyze', ['streetwise', 0.5], ['tracking', 0.3]], base: 0.416, per: 0.06,
      win: R([`Blackbird asks round {hall} until an old regular, {npc}, gives her a name: a champion who beat every board and died before the awards. The ghost is still going for the last one. It is, {npc} says, a very sweet ghost. It never wants anything except one more game.`, `The three letters belong to a courier who ran this hall as a boy. Someone leaves a token on the cabinet every Friday. She leaves one too.`], { tip: true, train: [['analyze', 2], ['streetwise', 1]], xp: 4, affinity: 3, thought: [`A ghost with a last request. I do not mind those.`, `Dead, but a regular.`] }),
      lose: R([`Everyone at {hall} suddenly has something to do. {npc} looks at the board, looks at her, and walks away fast.`, `Blackbird asks the wrong person and gets a long, wrong, and enormously detailed story about someone's cousin.`], { train: [['streetwise', 1]], affinity: -2 }),
    },
  }),
  row({
    id: 'find-the-rigged-one', where: { wild: 'rigged' }, pace: 'session',
    needs: ['skill:analyze', 'skill:perception', 'stat:int', 'drive:greed'],
    sees: `A hall where every cabinet is rigged, and one that is rigged the other way.`, stakes: `A cabinet that pays out; eleven that eat coins.`, consequence: `She knows which is which.`,
    drives: { greed: 0.8, curiosity: 0.6 }, bonus: 0.07, risk: 0.3, intent: [`Blackbird watches a hall full of rigged machines and thinks about the one that is not.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 12,
    check: {
      pay: [8, 12], parts: ['analyze', ['perception', 0.5], ['stat:int', 0.4]], base: 0.328, per: 0.06,
      win: R([`Blackbird feeds twelve cabinets at {hall} one credit each and writes down every win. One pays out twice. She finds it, plays it and walks away {amount}nd up. Nobody tells her it was rigged for a winner. Nobody needs to.`, `A coin in the claw: it drops the prize. A coin in the racer: first place. A coin in the third: first again. She has found the generous one and does not say a word.`], { cash: [40, 130], train: [['analyze', 3], ['perception', 1]], xp: 4, thought: [`Eleven cheats and a good one. That is a hall.`, `All rigged. Which means I just need the right rig.`] }),
      lose: R([`Every cabinet at {hall} takes her coin and nods. She spends {pay}nd on the full tour and learns a lot about rigging.`, `One cabinet laughs at her. It is the nicest sound in the room.`], { train: [['analyze', 1]] }),
    },
  }),
  row({
    id: 'milk-the-cash-cab', where: { wild: 'cash_cab' }, pace: 'session',
    needs: ['skill:gaming', 'skill:cards', 'drive:greed', 'drive:bravery'],
    sees: `A cabinet at the back with a tray, a slot and a small sign: PAYS IN CASH. NO, REALLY.`, stakes: `A tray of real money; a hall that watches her walk to it.`, consequence: `The tray refills. Nobody asks how.`,
    drives: { greed: 1.0, bravery: 0.3 }, bonus: 0.12, risk: 0.2, intent: [`Blackbird looks at a cabinet that pays real cash and then, carefully, at everyone else.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 6,
    check: {
      pay: [5, 6], parts: ['gaming', ['cards', 0.5]], base: 0.486, per: 0.06,
      win: R([`The cash cabinet at {hall} coughs up {amount}nd in real, folded notes. The tray refills itself, in the dark, and she is not going to ask. She plays until the hall's regulars begin to cluster behind her like hungry gulls.`, `A jackpot of {amount}nd. The cabinet sings a little tune. Somebody at the back of the room says a short, honest word.`], { cash: [60, 180], train: [['gaming', 3], ['cards', 1]], fame: 0.8, xp: 4, thought: [`Real cash. An actual miracle, in a box.`, `I do not know where it comes from. I am a happy tourist.`] }),
      lose: R([`The cash cabinet at {hall} eats her coin with a quiet "mmm" and gives nothing. The tray is empty. It has always been empty. It's a lie, with a very good tray.`, `A mean little light goes red, then a nicer one goes green on the machine next to it. Next to her, someone wins.`], { train: [['gaming', 1]] }),
    },
  }),
  row({
    id: 'read-tomorrows-board', where: { wild: 'future_score' }, pace: 'session',
    needs: ['drive:curiosity', 'drive:pride', 'skill:gaming', 'drive:quest'],
    sees: `A leaderboard that lists BLK at number one, with a date that is tomorrow's.`, stakes: `A record she has not set; the strange feeling of a score she must now go and earn.`, consequence: `A chore, and a story about a board.`,
    drives: { curiosity: 0.9, pride: 0.8, quest: 0.4 }, bonus: 0.07, risk: 0.2, intent: [`Blackbird reads the top of the board for the third time.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 6,
    check: {
      pay: [4, 6], parts: ['gaming', ['stat:reflex', 0.5]], base: 0.324, per: 0.06,
      win: R([`Blackbird plays the cabinet at {hall} until the number on the screen matches the number on the board. It is a long night. Then the clock turns over, and her score is the record. The board says BLK, and it was right. She is, for a moment, very unsure about a lot of things.`, `She makes tomorrow's score today. The cabinet makes a small, polite noise, a sort of "thank you".`], { cash: [20, 80], train: [['gaming', 5]], fame: 2.2, xp: 6, thought: [`I did it on schedule. I always do.`, `The future called. I picked up.`] }),
      lose: R([`Blackbird tries for the score on the board and falls short by four hundred points. The board does not update. It just knows.`, `The machine accepts her coin and shows her a very short film of herself failing at it. She decides not to watch the rest.`], { train: [['gaming', 2]] }),
    },
  }),
  row({
    id: 'study-the-forged-licence', where: { wild: 'no_spider' }, pace: 'session',
    needs: ['skill:art', 'skill:analyze', 'skill:perception', 'drive:curiosity'],
    sees: `A Muse licence on the wall that is, on closer inspection, a drawing of a licence, in felt tip, done with love.`, stakes: `A forgery that has never been checked, and the art of it.`, consequence: `She can do a better one.`,
    drives: { curiosity: 0.6, pride: 0.5 }, bonus: 0.05, risk: 0.1, intent: [`Blackbird takes a close look at the licence on the wall.`],
    ok: open,
    check: {
      parts: ['art', ['analyze', 0.5], ['perception', 0.4]], base: 0.436, per: 0.06,
      win: R([`The licence at {hall} is a felt-tip drawing of a licence, and Blackbird respects it a great deal. The hologram is a sweet wrapper. The signature says "Muse", in a different hand to the stamp. She takes notes. She will use them.`, `A hologram made of foil, a seal made of sealing wax and a heart drawn so tidily it must be a signed original. It has been enough, for years.`], { train: [['art', 3], ['analyze', 1]], xp: 3, thought: [`A masterpiece, in felt tip.`, `If you draw it well enough, it is real. Mostly.`] }),
      lose: R([`Blackbird looks too closely and the owner of {hall} sees her looking. "It's real," they say, tightly, "I've got a letter."`, `It is a felt-tip drawing and she can not tell what is wrong with it. That is a bad sign about her.`], { train: [['art', 1]], affinity: -2 }),
    },
  }),
  row({
    id: 'wave-at-the-ceiling', where: { wild: 'spider_home' }, pace: 'quick',
    needs: ['skill:rapport', 'skill:perception', 'drive:curiosity', 'drive:bravery'],
    sees: `Something big and pastel in the corner of the ceiling, with a heart-shaped chin and a clipboard, watching everyone, always.`, stakes: `A resident spider; the knowledge that it never sleeps.`, consequence: `It waves back.`,
    drives: { curiosity: 0.8, bravery: 0.4 }, bonus: 0.04, risk: 0.2, intent: [`Blackbird waves at something in the ceiling.`],
    ok: open,
    check: {
      parts: ['rapport', ['perception', 0.5]], base: 0.486, per: 0.06,
      win: R([`The spider in the ceiling at {hall} waves back with a leg, then another, then six. It is a resident, a colleague, a roommate. "Hello, friend! All of this is fun!" It drops a Joy ticket on her head from sixteen feet. It is the nicest thing a robot has ever done.`, `She waves. It waves. A friendship begins in the rafters.`], { item: 'joy_tickets', train: [['rapport', 2], ['perception', 1]], xp: 3, affinity: 4, thought: [`I have a friend in the ceiling.`, `It never blinks. Neither do I, now.`] }),
      lose: R([`Blackbird waves at the ceiling and a leg waves back, quick and large. It is a pincer. It takes her cap.`, `The spider in the rafters of {hall} scrolls a very slow message across its screen: PLEASE DO NOT WAVE AT THE FUN.`], { train: [['rapport', 1]], hp: -1 }),
    },
  }),
  row({
    id: 'master-the-only-game', where: { wild: 'one_game' }, pace: 'session',
    needs: ['skill:gaming', 'skill:analyze', 'drive:pride'],
    sees: `Every cabinet in {hall} runs the same game, and the whole hall disagrees about which one is the best.`, stakes: `A game she can master completely; a hall of experts with theories.`, consequence: `She knows it better than the people who made it.`,
    drives: { pride: 0.6, curiosity: 0.5 }, bonus: 0.06, risk: 0.1, intent: [`Blackbird sits at the first cabinet and starts to learn.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 6,
    check: {
      pay: [3, 6], parts: ['gaming', ['analyze', 0.5]], base: 0.436, per: 0.06,
      win: R([`There is one game at {hall}, on eleven cabinets, and by the end of the night Blackbird knows every pixel of it. She knows which cabinet is two frames slow, which has a sticky left button and which has a ghost in the third level. She becomes, by default, the foremost authority.`, `One game, one thousand hours, ten minutes. She cracks it open like a nut.`], { cash: [10, 40], train: [['gaming', 7], ['analyze', 1]], fame: 0.8, xp: 6, thought: [`One game. I am the world expert. Of this room.`, `The same game, eleven times, and I loved all of them.`] }),
      lose: R([`Blackbird loses the same game eleven times in a row, on eleven machines. She learns a lot about cabinets and nothing about the game.`, `The regulars all offer advice. The advice is all different.`], { train: [['gaming', 2]] }),
    },
  }),
  row({
    id: 'argue-the-best-cabinet', where: { wild: 'one_game' }, pace: 'session',
    needs: ['skill:speaking', 'skill:persuasion', 'drive:pride'],
    sees: `A hall that disagrees with itself about which of eleven identical cabinets is the best.`, stakes: `A debate with the whole room; a verdict nobody can check.`, consequence: `Her opinion becomes law, for a week.`,
    drives: { pride: 0.7, curiosity: 0.2 }, bonus: 0.04, risk: 0.2, intent: [`Blackbird climbs onto a chair at the argument in the middle of the hall.`],
    ok: open,
    check: {
      parts: ['speaking', ['persuasion', 0.6]], base: 0.436, per: 0.06,
      win: R([`Blackbird stands on a stool and delivers eleven minutes on the merits of cabinet seven at {hall}: the buttons, the screen, the smell. By the end the hall is chanting "SEVEN!" and the people near six are quietly moving.`, `A speech, a joke and a rude word. Cabinet seven becomes the hall's champion by acclamation.`], { train: [['speaking', 3], ['persuasion', 1]], fame: 1, xp: 3, thought: [`I won an argument that did not exist. My favourite kind.`, `Seven. Obviously seven.`] }),
      lose: R([`Blackbird picks the wrong cabinet. An old man says "that one is broken", loudly, and he is right.`, `The argument at {hall} turns on her, politely, in eleven directions.`], { train: [['speaking', 1]] }),
    },
  }),
  row({
    id: 'talk-to-the-cabinet', where: { wild: 'sentient' }, pace: 'session',
    needs: ['skill:persuasion', 'skill:rapport', 'drive:curiosity', 'drive:quest'],
    sees: `A cabinet that knows her name. It does not say anything else. It does not explain.`, stakes: `A conversation with a cabinet; whatever it knows.`, consequence: `It remembers her.`,
    drives: { curiosity: 1.0, quest: 0.3 }, bonus: 0.06, risk: 0.2, intent: [`Blackbird stands in front of the cabinet that said her name.`],
    ok: open,
    check: {
      parts: ['persuasion', ['rapport', 0.6]], base: 0.436, per: 0.06,
      win: R([`"Blackbird," says the cabinet at {hall}, from the speaker, in a voice like a dial tone. She asks it a question. It answers, once, with a name and a place: {tip}. Then it goes back to its attract loop and refuses to say another word.`, `It knows her name. It knows her government name. It does not say it. It is, in that sense, a friend.`], { tip: true, train: [['persuasion', 2], ['rapport', 2]], xp: 4, thought: [`A cabinet with a secret and good manners.`, `It said my name. My real one. I will not be thinking about that.`] }),
      lose: R([`The cabinet at {hall} says "BLACKBIRD" again, in the same voice, and nothing else, for twenty minutes. She has never been so well-known and so little helped.`, `It says her government name. Quietly. Everyone in the hall looks away.`], { train: [['rapport', 1]] }),
    },
  }),
];

// ===================================================================== things only some arcades offer

export const VARIANT_ROWS: Affordance<HallView>[] = [
  row({
    id: 'rate-your-fun', where: { variant: 'flagship' }, pace: 'quick',
    needs: ['stat:charm', 'skill:grifting', 'skill:persuasion', 'drive:pride'],
    sees: `A Joy Host in a pink lanyard with a tablet that rates her enjoyment, aloud, in real time, and wants it to go up.`, stakes: `A rating out of ten; a free play if it is high enough.`, consequence: `The host writes it in a heart on her profile.`,
    drives: { pride: 0.5, greed: 0.3 }, bonus: 0.05, risk: 0.1, intent: [`Blackbird is asked how fun she is feeling, out of ten.`],
    ok: open,
    check: {
      who: 'host', parts: [['stat:charm', 0.7], ['grifting', 0.4], 'persuasion'], base: 0.4, per: 0.06,
      win: R([`"Ten!" says Blackbird to {npc} at {hall}, with her whole face. The tablet agrees. "WOW! You are the most enjoyed guest of the day!" There is a ribbon, a strip of Joy tickets and a very long photograph.`, `She fakes an ecstatic hum and the tablet reads it as a nine. {npc} has to sit down, so happy for her.`], { item: 'joy_tickets', train: [['grifting', 2], ['persuasion', 1]], affinity: 5, fame: 0.4, xp: 2, thought: [`Fun, rated. A profession I could do.`, `The tablet and I understand each other.`] }),
      lose: R([`"A six," says the tablet at {hall}, "which is okay! Let's work on it!" Blackbird is enrolled in a Fun Improvement Plan, free, forever.`, `She says "ten" and the tablet reads her heartbeat. "You seem... tired!" She is sent to the lounge.`], { affinity: -2, train: [['grifting', 1]] }),
    },
  }),
  row({
    id: 'refuse-the-joy-plus-pitch', where: { variant: 'flagship', feature: 'token_booth' }, pace: 'quick',
    needs: ['skill:haggling', 'stat:charm', 'skill:persuasion', 'drive:greed'],
    sees: `A booth with a large, loving poster of a Joy+ pass at 40nd a month and an attendant who has to ask three times.`, stakes: `A pass she does not want, a smile she has to say no to.`, consequence: `She is on the mailing list. Forever.`,
    drives: { greed: 0.4, pride: 0.2 }, bonus: 0.02, risk: 0.1, intent: [`Blackbird feels a pitch approaching.`],
    ok: open,
    check: {
      who: 'attendant', parts: ['haggling', ['stat:charm', 0.5]], base: 0.474, per: 0.06,
      win: R([`"No thanks," Blackbird tells {npc}, with a smile that does not move. {npc} asks twice more, and she says no twice more, with decreasing smile. The third time gets her a free play and a leaflet apologising for the first two.`, `Blackbird declines the Joy+ pass at {hall} and haggles a free token out of the awkwardness. It is a quiet victory.`], { item: 'joy_tickets', train: [['haggling', 2]], xp: 2, thought: [`No is a full sentence. It is also a coupon.`, `I have been pitched at by the best.`] }),
      lose: R([`"Just a trial!" says {npc}. Blackbird says yes in order to leave. She is billed 40nd for a first month of a pass she will never use.`, `The pitch is four minutes long and ends in a little song. She is in its debt.`], { loseCash: [10, 40], train: [['haggling', 1]] }),
    },
  }),
  row({
    id: 'do-the-licence-paperwork', where: { variant: ['licensed', 'claw', 'skillgames'] }, pace: 'session',
    needs: ['stat:int', 'skill:analyze', 'skill:calculate', 'drive:greed'],
    sees: `An owner at a desk, drowning in forms, and a Muse licence renewal with 47 boxes, 11 of them in a language that does not exist.`, stakes: `A form filled in right; the owner's gratitude, and a small fee.`, consequence: `The licence is renewed. The hall is safe, until the next form.`,
    drives: { greed: 0.5, curiosity: 0.3 }, bonus: 0.05, risk: 0.1, intent: [`Blackbird sees a desk of forms and a person drowning in them.`],
    ok: open,
    check: {
      who: 'owner', parts: [['stat:int', 0.6], 'analyze', ['calculate', 0.5]], base: 0.426, per: 0.06,
      win: R([`Blackbird fills in the Muse licence renewal for {npc} at {hall}: Box 14 is the owner's mother's maiden name. Box 31 is a feeling. By the end the form is complete, and for the first time in years it will not be sent back. {npc} pays her {amount}nd and a free play for every box.`, `Forty-seven boxes, eleven nonsense ones, one signature. She sorts it in an hour and finds three fees that do not exist.`], { cash: [20, 70], train: [['analyze', 2], ['calculate', 2]], affinity: 8, xp: 3, thought: [`Muse loves a form. I love an ending.`, `I filled in a feeling. It took a pen.`] }),
      lose: R([`Blackbird gets Box 31 wrong and the whole form is sent to the cheerful office of Fun Reconciliation. {npc} stares at the ceiling.`, `She fills in the form with confidence and no accuracy. It comes back with a smiley face and a fine.`], { train: [['analyze', 1]], affinity: -3 }),
    },
  }),
  row({
    id: 'crack-a-new-board', where: { variant: ['bootleg', 'backroom', 'retro'] }, pace: 'session',
    needs: ['skill:tinkering', 'skill:gaming', 'stat:int', 'drive:curiosity'],
    sees: `A bench, a board on a stand, a cable run and a bootlegger who has been trying to crack the same protection since breakfast.`, stakes: `A cracked board; a long evening; a lifetime of reasons not to.`, consequence: `The hall has a new game, and a new crime.`,
    drives: { curiosity: 0.8, pride: 0.4 }, bonus: 0.05, risk: 0.3, intent: [`Blackbird sits down at the bootlegger's bench.`],
    ok: open,
    check: {
      who: 'bootlegger', parts: ['tinkering', ['gaming', 0.6], ['stat:int', 0.4]], base: 0.349, per: 0.06,
      win: R([`Blackbird and {npc} stay up with the board at {hall}. Four hours, two solder burns and a long silence later, the protection falls. The screen shows a title, a skull and the words "NO LICENCE REQUIRED". It is {item}, and it is hers to carry.`, `A jumper here, a pin there. The lock is a Muse lock, which is to say a smile on a bolt. It gives with a click.`], { item: 'cracked_board', train: [['tinkering', 3], ['gaming', 2]], affinity: 6, xp: 5, thought: [`A smile on a bolt. I know how to open those.`, `It is a crime. It is also a good crime.`] }),
      lose: R([`The board's protection bites. A small flame, a cloud of smoke, and {npc} putting out the bench with a blanket. "Again tomorrow?" says {npc}.`, `Blackbird fries a chip, a lead and a thumbnail. The bootlegger takes the news the way a vet does.`], { hp: -2, train: [['tinkering', 1]], affinity: -1 }),
    },
  }),
  row({
    id: 'keep-lookout', where: { variant: ['bootleg', 'backroom', 'retro'] }, pace: 'session',
    needs: ['skill:perception', 'skill:tracking', 'drive:bravery', 'skill:streetwise'],
    sees: `A front door, a street and a sign: IF A CHEERFUL VOICE SAYS "FUN GUARANTEED", LEAVE BY THE BACK.`, stakes: `A shift watching a street; a warning that comes in time.`, consequence: `The owner will remember.`,
    drives: { bravery: 0.4, greed: 0.3, curiosity: 0.2 }, bonus: 0.05, risk: 0.2, intent: [`Blackbird perches on a crate by the front door.`],
    ok: open,
    check: {
      who: 'owner', parts: ['perception', ['tracking', 0.5], ['streetwise', 0.3]], base: 0.486, per: 0.06,
      win: R([`Blackbird sits on a crate outside {hall} for two hours and clocks a delivery van, a wandering drone and, at last, the unmistakable click of eight legs on the pavement. She calls the warning in a code she makes up on the spot. By the time the spider arrives the cabinets have blankets on. {npc} pays her {amount}nd.`, `She watches the street with her whole body and spots the pastel glint before the van has turned the corner.`], { cash: [14, 50], train: [['perception', 2], ['tracking', 1]], affinity: 8, xp: 3, thought: [`Eight legs make a sound. I can hear it from across a river.`, `I am a lookout. I am the best lookout.`] }),
      lose: R([`Blackbird dozes off on the crate. The spider arrives on a thread from the top of the building and says "Hello, friends!" into her ear.`, `She gives the warning one beat too late. The spider is in the door. {npc} looks at her.`], { affinity: -5, train: [['perception', 1]] }),
    },
  }),
  row({
    id: 'knock-three-times', where: { variant: 'backroom', feature: 'password_door' }, pace: 'session',
    needs: ['skill:streetwise', 'skill:persuasion', 'skill:grifting', 'drive:curiosity'],
    sees: `A door with a slot, a voice behind it that wants a word she has not been given and a hall that very carefully does not look at the door.`, stakes: `The way in; a no through a slot.`, consequence: `She knows who gets in and who does not.`,
    drives: { curiosity: 0.8, pride: 0.3 }, bonus: 0.05, risk: 0.2, intent: [`Blackbird raps on a door that is not a door.`],
    ok: open,
    check: {
      who: 'bootlegger', parts: ['streetwise', ['persuasion', 0.5], ['grifting', 0.5]], base: 0.386, per: 0.06,
      win: R([`Blackbird says a word she makes up on the spot at the slot at {hall}. It is wrong, but she says it as though it were right, and the voice says "oh, that old one". The bolt slides. {npc} gives her a nod and the corridor.`, `A knock, a pause and a joke. The slot gives her a look, a laugh and a way in.`], { tip: true, train: [['streetwise', 2], ['grifting', 1]], affinity: 4, xp: 3, thought: [`A password is a lie everyone agrees on.`, `It is just a door. But a good one.`] }),
      lose: R([`"Wrong," says the slot at {hall}, flatly. "Try again in the new year." The slot closes. Somewhere behind it, a laugh.`, `Blackbird's word is the wrong one and the voice behind the door is delighted to say so.`], { train: [['streetwise', 1]], affinity: -2 }),
    },
  }),
  row({
    id: 'challenge-the-champion', where: { variant: 'dojo' }, pace: 'session',
    needs: ['skill:gaming', 'stat:reflex', 'drive:pride', 'drive:bravery'],
    sees: `A champion on a stool in the corner with a custom stick in a case of their own, and a rail of cabinets facing each other.`, stakes: `Winner stays on; the loser sits down and watches.`, consequence: `Her name goes on the wall under, or over, theirs.`,
    drives: { pride: 1.0, bravery: 0.6 }, bonus: 0.08, risk: 0.3, intent: [`Blackbird puts a quarter on the rail.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 6,
    check: {
      who: 'champion', pay: [3, 6], parts: ['gaming', ['stat:reflex', 0.7]], base: 0.221, per: 0.06,
      win: R([`Blackbird puts her quarter on the rail at {hall} and plays {npc} for the stool. Round one is theirs. Round two is hers, with a last-second reversal. The decider ends with a perfect counter. {npc} stares at the screen, then at her, then at the screen. "...Again," they say. It is the best moment of her month.`, `She reads {npc}'s opening, ducks it and breaks them in four moves. The rail erupts.`], { cash: [14, 60], train: [['gaming', 6]], fame: 2, affinity: 8, xp: 6, thought: [`Winner stays on. I stay on.`, `The champion has a style. I have a different one.`] }),
      lose: R([`{npc} takes Blackbird apart in a perfect, silent, forty-second flurry and puts down the stick as if it were a spoon. "Next," they say, kindly.`, `Blackbird loses by a single hit. The rail pretends not to look.`], { train: [['gaming', 3]], affinity: 2, xp: 2 }),
    },
  }),
  row({
    id: 'winner-stays-on', where: { variant: 'dojo' }, pace: 'session',
    needs: ['skill:gaming', 'drive:bravery', 'skill:athletics', 'drive:thirst'],
    sees: `A rail with a queue of challengers and a line of quarters. The stool has to be defended against all comers.`, stakes: `A streak; a hand that gets tired.`, consequence: `Everyone remembers the streak.`,
    drives: { bravery: 0.7, pride: 0.6 }, bonus: 0.05, risk: 0.3, intent: [`Blackbird sits down on the stool and says "next".`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 6,
    check: {
      pay: [3, 6], parts: ['gaming', ['athletics', 0.3], ['stat:reflex', 0.5]], base: 0.326, per: 0.06,
      win: R([`Blackbird holds the stool at {hall} for fourteen games. She beats a student, an old man, a tag team of twins and a boy in a mascot head. The queue is out of the door. She walks away with {amount}nd in quarters and a callus.`, `A streak of nine, a roar and a new nickname: "The Stool".`], { cash: [12, 50], train: [['gaming', 5], ['athletics', 1]], fame: 1.2, xp: 5, thought: [`Winner stays on. I like staying on.`, `Fourteen. Next time, fifteen.`] }),
      lose: R([`Blackbird loses her first match as the winner to a boy in a mascot head. He takes the stool. The boy's name is Gary.`, `She is the first person to hold the stool at {hall} for exactly one round.`], { train: [['gaming', 2]] }),
    },
  }),
  row({
    id: 'halftime-show', where: { variant: 'rhythm' }, pace: 'session',
    needs: ['skill:dancing', 'skill:music', 'skill:djing', 'drive:pride'],
    sees: `A wall of dance pads lit from below, a mirror along the back and a gap in the evening that needs a show.`, stakes: `A crowd that came for the game; an interval to fill.`, consequence: `The hall asks for her again.`,
    drives: { pride: 0.9, lust: 0.2 }, bonus: 0.07, risk: 0.2, intent: [`Blackbird sees the empty dance floor and a mirror ball.`],
    ok: open,
    check: {
      parts: ['dancing', ['music', 0.5], ['djing', 0.3]], base: 0.436, per: 0.06,
      win: R([`At the halftime break at {hall}, Blackbird steps onto the biggest pad in the room and plays the hardest song with her eyes shut. The mirror ball turns. Forty people forget their drinks. {amount}nd goes into a hat that someone passes round.`, `She flips the song, picks up a step and brings the whole floor with her. By the end the mirror ball is the only thing not dancing.`], { cash: [14, 60], train: [['dancing', 4], ['music', 1]], fame: 1.5, xp: 4, thought: [`I danced on a pad for forty people. They clapped on the beat.`, `Light up the floor. Do not look down.`] }),
      lose: R([`Blackbird hits the first arrow and misses the other eight hundred. The mirror ball goes on turning, bravely, as if it can not see her.`, `She trips on the pad, on herself and on a speaker. The crowd claps, at the end, out of sympathy.`], { train: [['dancing', 1]] }),
    },
  }),
  row({
    id: 'nudge-the-table', where: { variant: 'pinball', feature: 'cab_pinball' }, pace: 'quick',
    needs: ['stat:reflex', 'skill:tinkering', 'skill:sleight', 'drive:bravery'],
    sees: `A table with a ball on its last life, a glass top and a sign: DO NOT SHAKE THE MACHINE. SHAKE THE MACHINE.`, stakes: `A nudge on the cabinet that saves the ball, or a TILT that ends it.`, consequence: `A score on the table.`,
    drives: { bravery: 0.5, pride: 0.4, greed: 0.2 }, bonus: 0.05, risk: 0.3, intent: [`Blackbird plants her hip against the table.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 4,
    check: {
      pay: [2, 4], parts: [['stat:reflex', 0.7], ['tinkering', 0.4], ['sleight', 0.3]], base: 0.368, per: 0.06,
      win: R([`The ball goes for the drain at {hall} and Blackbird gives the table a nudge that Noah's flood would have approved. The ball turns in the air. It goes up the ramp, round the bumpers and into the saucer for the extra ball. {amount}nd, and a roar.`, `A hip, a tap and a slow, delicious wobble. The table does not tilt. The ball does the rest.`], { cash: [4, 24], train: [['tinkering', 1], ['sleight', 1], ['gaming', 2]], xp: 3, thought: [`A nudge is a negotiation with physics.`, `I shook the machine. The machine understood.`] }),
      lose: R([`TILT. The table at {hall} goes dark, the ball drops and the bumper lights say a word to her that she has not heard since school.`, `Blackbird nudges too hard. The glass rattles, the flippers die and the whole machine says, in a voice like an old drunk, "TILT."`], { train: [['gaming', 1]] }),
    },
  }),
  row({
    id: 'bay-to-bay-duel', where: { variant: 'racing' }, pace: 'session',
    needs: ['skill:driving', 'stat:reflex', 'skill:gaming', 'drive:pride'],
    sees: `Two sit-down bays side by side, a seat off a real car and a stranger in the next one who is already smiling.`, stakes: `A bet; a lap record; bragging rights across a thin wall.`, consequence: `The stranger remembers her.`,
    drives: { pride: 0.9, bravery: 0.4, greed: 0.2 }, bonus: 0.06, risk: 0.3, intent: [`Blackbird slides into the next bay.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 12,
    check: {
      who: 'regular', pay: [6, 12], parts: ['driving', ['stat:reflex', 0.5], ['gaming', 0.6]], base: 0.327, per: 0.06,
      win: R([`Blackbird and {npc} race the bay-to-bay at {hall}, two laps of a mountain pass that is, according to the screen, haunted. She wins by a bumper. {npc} stands up, shakes her hand, then sits back down and asks for another.`, `A final-corner bump. A shower of pixels. She crosses the line first with a car on fire. {amount}nd on the table.`], { cash: [14, 60], train: [['driving', 3], ['gaming', 3]], fame: 0.8, affinity: 4, xp: 4, thought: [`A very small mountain. A very big car.`, `He bumped me. I bumped him harder.`] }),
      lose: R([`{npc} drives a perfect line and Blackbird drives into a tree, which is rendered with great care. "Good effort," {npc} says.`, `She understeers into the sea. It is a nice sea.`], { loseCash: [4, 14], train: [['driving', 1]] }),
    },
  }),
  row({
    id: 'prize-counter-con', where: { variant: ['claw', 'flagship', 'skillgames', 'licensed'], feature: 'prize_counter' }, pace: 'session',
    needs: ['skill:grifting', 'skill:persuasion', 'stat:charm', 'drive:greed'],
    sees: `A prize counter with a huge Lumi-Bear, an attendant with a stack of ticket strips, and a rule that says tickets can not be transferred.`, stakes: `A bear, if the story holds; a lecture if it does not.`, consequence: `The attendant will know her next time.`,
    drives: { greed: 0.8, pride: 0.3 }, bonus: 0.06, risk: 0.3, intent: [`Blackbird looks at the biggest bear in the hall and has an idea.`],
    ok: open,
    check: {
      who: 'attendant', parts: ['grifting', ['persuasion', 0.5], ['stat:charm', 0.4]], base: 0.348, per: 0.06,
      win: R([`Blackbird tells {npc} at {hall} that it is her niece's birthday, that her niece has eleven tickets and that her niece can not be here. {npc} looks at the ticket strip, looks at the bear, sighs and hands the bear over. She has no niece. The bear is called Gary. It says "I believe in you".`, `A story, a smile and a wink. {npc} gives her {item}, a good bear, for the price of a very short lie.`], { item: 'lumi_plush', train: [['grifting', 3], ['persuasion', 1]], xp: 4, thought: [`Gary is a good bear.`, `I should be ashamed. I have a bear.`] }),
      lose: R([`{npc} at {hall} has seen the niece before. {npc} has seen the niece four times, in four different outfits.`, `"Tickets can not be transferred," says {npc}, with all the sorrow in the world. She is escorted out by a very large plush.`], { train: [['grifting', 1]], affinity: -3 }),
    },
  }),
  row({
    id: 'fish-the-claw', where: { variant: ['claw', 'flagship', 'licensed', 'retro'], feature: 'cab_claw' }, pace: 'session',
    needs: ['skill:fishing', 'skill:sleight', 'skill:perception', 'drive:curiosity'],
    sees: `A glass pond full of plush with a claw on a line, a loose grip and a patient look.`, stakes: `A bite; a cast; an hour at the glass.`, consequence: `A catch, or a story.`,
    drives: { curiosity: 0.5, greed: 0.3, pride: 0.2 }, bonus: 0.06, risk: 0.1, intent: [`Blackbird stands at the claw machine like a person at a canal.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 4,
    check: {
      pay: [2, 4], parts: ['fishing', ['sleight', 0.5], ['perception', 0.4]], base: 0.336, per: 0.06,
      win: R([`Blackbird reads the claw at {hall} like water. She waits for the slack, lets it sink, feels the bite and strikes. Up comes {item}, dripping with nothing. The man at the next machine takes a photograph of her face.`, `The claw hangs. She breathes. It drops, closes, rises. A small, patient catch.`], { item: 'lumi_plush', train: [['fishing', 3], ['sleight', 1]], xp: 3, thought: [`It is a very small pond. I am a very large fisherman.`, `I fish for plush. Do not tell the fish.`] }),
      lose: R([`The claw at {hall} grips the plush, thinks about it and lets go. The plush gives her a look that says "I know."`, `Three coins, three drops and one sigh. The pond keeps its fish.`], { train: [['fishing', 1]] }),
    },
  }),
  row({
    id: 'booth-wipeout', where: { variant: 'vr', feature: 'cab_vr' }, pace: 'session',
    needs: ['skill:athletics', 'stat:reflex', 'skill:gaming', 'drive:bravery'],
    sees: `A booth with a visor, a padded floor and an attendant whose entire job is to catch people.`, stakes: `A lot of arm-waving; a tumble on a mat.`, consequence: `A short clip of her flying into a wall.`,
    drives: { bravery: 0.5, curiosity: 0.4, thirst: 0.1 }, bonus: 0.05, risk: 0.3, intent: [`Blackbird pulls the visor over her eyes.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 10,
    check: {
      pay: [6, 10], parts: ['athletics', ['stat:reflex', 0.6], ['gaming', 0.6]], base: 0.326, per: 0.06,
      win: R([`In the booth at {hall}, Blackbird stands on a floating plank above a very real-feeling chasm, wobbling. She crosses it in a run, jumps the gap, wall-runs the final stretch and takes a deep bow at an audience of no one. Outside, the attendant is applauding.`, `A forest, an arrow, a dragon in a hat. She dodges, rolls and sinks the arrow into the dragon's hat. Out she comes, glowing.`], { cash: [4, 30], train: [['athletics', 2], ['gaming', 3]], xp: 4, thought: [`I was in a forest. It was better than this one.`, `I killed a dragon. A fake one. I will say it anyway.`] }),
      lose: R([`Blackbird steps off the plank, loses the floor and comes out of the booth at {hall} at speed, sideways. The attendant catches her, mostly.`, `A spider in the game. She throws the headset. The headset lands on a toddler's... on an adult's parked bag.`], { hp: -2, train: [['athletics', 1]] }),
    },
  }),
  row({
    id: 'a-round-and-a-dare', where: { variant: 'retro', feature: 'snack_bar' }, pace: 'session',
    needs: ['skill:tolerance', 'skill:mixology', 'drive:thirst', 'drive:bravery'],
    sees: `A bar with a tap with a fault, a row of cabinets and a dare on a chalkboard: ONE PINT, ONE LIFE, NO CONTINUES.`, stakes: `A free pint if she makes it; a very long evening if she does not.`, consequence: `Her initials on the chalkboard.`,
    drives: { thirst: 0.9, bravery: 0.4, pride: 0.4 }, bonus: 0.05, risk: 0.3, intent: [`Blackbird reads the chalkboard and the pint.`],
    ok: (w, v) => open(w, v) && w.hero.cash >= 8,
    check: {
      pay: [4, 8], parts: ['tolerance', ['mixology', 0.4]], base: 0.436, per: 0.06,
      win: R([`One pint, one life, no continues. Blackbird sinks the pint at {hall} in the same time it takes to play a level, and finishes the level. The chalkboard gets her initials and a gold star. The bar gets quiet. {amount}nd is paid out of a jar marked "bravery".`, `She takes the dare on one go, one breath and one pint. The cabinet and the glass finish together.`], { cash: [8, 30], train: [['tolerance', 3], ['gaming', 1]], drunk: 0.1, fame: 0.4, xp: 3, thought: [`One life. One pint. One hell of an evening.`, `The chalkboard is a hall of fame, if you squint.`] }),
      lose: R([`Blackbird dies on level two and spills half the pint. The chalkboard has an entry for her that says "HALF". It is not a compliment.`, `The pint wins. The level is a blur.`], { drunk: 0.15, train: [['tolerance', 1]] }),
    },
  }),
  row({
    id: 'argue-with-the-payout-counter', where: { variant: 'skillgames', feature: 'prize_counter' }, pace: 'session',
    needs: ['skill:haggling', 'skill:calculate', 'skill:cards', 'drive:greed'],
    sees: `A counter where a man in a waistcoat turns tickets into cash at an exchange rate that is on a card he will not let her read.`, stakes: `A better rate; a quiet word from the man.`, consequence: `The man will watch her hands.`,
    drives: { greed: 0.8, pride: 0.2 }, bonus: 0.06, risk: 0.2, intent: [`Blackbird stands at the counter and asks to see the card.`],
    ok: open,
    check: {
      who: 'attendant', parts: ['haggling', ['calculate', 0.6], ['cards', 0.3]], base: 0.386, per: 0.06,
      win: R([`Blackbird works out the exchange rate at {hall} from the pattern of {npc}'s blinking and tells him, to the penny, what it is. {npc} is so impressed that the better rate is paid, out loud, and nothing is retracted. {amount}nd.`, `A fast sum, a polite tone and a number the man hates. The rate moves, for her only, by 11 per cent.`], { cash: [14, 60], train: [['haggling', 2], ['calculate', 2]], xp: 3, thought: [`He gave me the rate and kept the smile.`, `A footnote is just a sum with a coat on.`] }),
      lose: R([`{npc} turns the card face down at {hall}. "The rate," says {npc}, "is the rate." She is paid at the other rate.`, `Blackbird's sum is wrong. {npc}'s is right, and so gentle about it that she has to leave.`], { loseCash: [4, 18], train: [['calculate', 1]] }),
    },
  }),
  row({
    id: 'read-the-footnote', where: { variant: 'skillgames', feature: 'licence_frame' }, pace: 'quick',
    needs: ['skill:analyze', 'stat:int', 'skill:calculate', 'drive:curiosity'],
    sees: `A Muse licence frame with the payout rate in a very small font and a very good typeface.`, stakes: `A number somebody hoped nobody would read.`, consequence: `She knows the house edge to the decimal.`,
    drives: { curiosity: 0.8, greed: 0.2 }, bonus: 0.05, risk: 0.05, intent: [`Blackbird leans in towards the licence frame.`],
    ok: open,
    check: {
      parts: ['analyze', ['stat:int', 0.5], ['calculate', 0.4]], base: 0.477, per: 0.06,
      win: R([`In four-point type, in the bottom corner, the licence at {hall} says that the house wins 71 per cent, "give or take the vibes". Blackbird takes a picture, does a sum and knows which cabinet is the least cruel. She plays it twice and wins once.`, `A footnote, a footnote to the footnote and a smiling asterisk. She reads them all.`], { tip: true, cash: [4, 20], train: [['analyze', 2], ['calculate', 2]], xp: 3, thought: [`71 per cent. They should put it on the front.`, `Fine print: my favourite genre.`] }),
      lose: R([`The footnote at {hall} is in a font so small she can only read the word "fun". She squints so hard that the owner asks whether she is okay.`, `She tries to read it and the licence reads her back, in the glass of the frame. It is not a good look.`], { train: [['analyze', 1]] }),
    },
  }),
];

export const EVENTS: Affordance<HallView>[] = [...SPIDER_ROWS, ...SITUATIONAL, ...WILDS, ...VARIANT_ROWS];
