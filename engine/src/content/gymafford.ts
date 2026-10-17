import { register, type Affordance, type Need } from '../affordances';
import { FEATURES } from './gyms';
import { addSore, banned, canPay, find, hasSituation, ladderBout, ladderFighters, runCheck, say, shiftsOf, soreOf, spar, trainSession, workShift, type Check, type GymView, type Result } from '../gymkit';
import { skillLevel, train } from '../skills';
import { kindle } from '../romance';

/**
 * The first half of a gym's affordances: the body, the craft, the crowd and the gossip. (Crime and stealth are in
 * gymcrime.ts; things that depend on what is happening today, and the wild cards, are in gymevents.ts.)
 *
 * Every row says which capability it is for (`needs`) and what that capability *sees* here (`sees`). Nothing says
 * "fighter" or "thief". Prose is in the report voice, with a thought in Blackbird's. Tokens: {gym} {npc} {owner}
 * {pay} {amount} {item} {tip} {lost}; pronouns for {npc} use the usual {they}/{their} tokens.
 */

type RowIn = Omit<Affordance<GymView>, 'place' | 'run'> & { check?: Check; run?: Affordance<GymView>['run'] };
export const row = (a: RowIn): Affordance<GymView> => ({ ...a, place: 'gym', run: a.run ?? ((c, v) => runCheck(c, v, a.id, a.check!)) });
export const R = (text: string[], o: Partial<Result> = {}): Result => ({ text, ...o });

const TRAIN_FEATURES = Object.keys(FEATURES).filter((f) => FEATURES[f]!.trains);

// ===================================================================== training

const TRAIN_LINES: Record<string, string[]> = {
  boxing: [
    '{gym}: a pair of wraps and an hour of {feature}. {npc} says "again" eleven times. {skill} goes up.',
    'Blackbird works {feature} at {gym} until the tape goes dark with sweat. {npc} nods once, which is a lot.',
  ],
  dojo: [
    '{gym}: shoes off, bow at the right angle (second try), forty minutes of {feature}. {npc} corrects her posture and, later, her attitude. {skill} goes up.',
    'Blackbird follows {npc} through the form at {gym}. Slowly. Then slower. {skill} goes up, mostly from the embarrassment.',
  ],
  chrome: [
    '{gym}: the {feature} adjusts itself to her load, and then to her ego. {npc} calls her "a solid 6.2". {skill} goes up.',
    'Blackbird spends an hour on a rig that tells her she is doing great. It is a machine, so it does not mean it. {skill} goes up anyway.',
  ],
  atlasfit: [
    '{gym}: the {feature} congratulates her on her heart rate. A screen awards her a badge for attending. {skill} goes up, and so does her Wellness Score.',
    'Blackbird works through a circuit under a camera that is cheerful about all of it. {skill} goes up. Her data goes somewhere.',
  ],
  climb: [
    '{gym}: three routes up the wall, one fall, and one rope burn she describes as "a souvenir". {skill} goes up.',
    'Blackbird spends an hour on the {feature} at {gym}. The top is further away than it looks, and then nearer than it should be. {skill} goes up.',
  ],
  range: [
    '{gym}: ear defenders, a lane, forty rounds, and a safety lecture that outlasts them. {skill} goes up.',
    'Blackbird puts paper through the {feature} at {gym}. {npc} marks the sheet, says nothing, and writes it down. {skill} goes up.',
  ],
  cage: [
    '{gym}: mats, clinch, a lot of sweat that is not hers. {npc} calls the drills "conversations". {skill} goes up.',
    'Blackbird gets put in a hold at {gym}, then puts someone else in one. Nobody gets hurt on purpose. {skill} goes up.',
  ],
  studio: [
    '{gym}: a class of twenty, a count of eight, and a mirror that has seen every mistake. {skill} goes up.',
    'Blackbird finds the downbeat at {gym} on the fourth try. {npc} claps. {skill} goes up.',
  ],
  wellness: [
    '{gym}: soft light, a breathing exercise and a cancellation fee she does not read. {skill} goes up, and so does something less measurable.',
    'Blackbird holds a pose at {gym} for what feels like a year and is, per the app, nine minutes. {skill} goes up.',
  ],
  youth: [
    '{gym}: a donated {feature}, a coach with a kettle and a bag held by someone half her height. {skill} goes up.',
    'Blackbird works out at {gym} next to someone who is plainly better than she is and plainly delighted about it. {skill} goes up.',
  ],
  tired: [
    '{npc} watches Blackbird repeat the same session at {gym} for the third time this week. "You have got it," {they} say{s}. "Do something else."',
    '{gym}: she goes through the motions. The {feature} knows. {skill} goes up a notch, and that is all.',
  ],
  default: ['Blackbird trains at {gym}. {skill} goes up.'],
};
const TRAIN_THOUGHTS = ['Nothing to it. I am a natural. A natural who also has to do it forty more times.', 'Strong. Obviously. Next question.', 'It does not hurt. That is what the ice is for.'];

const SPAR_WIN = [
  '{gym}: gloves on, a ring with one soft rope, {npc} across it. Blackbird takes a round, gives two and shakes hands afterwards.',
  'Blackbird spars {npc} at {gym}. It is friendly, which is to say nobody is trying to kill anybody, and {they} {is} still on the floor at the end.',
];
const SPAR_LOSE = ['{npc} puts Blackbird on the mat at {gym}, kindly, and helps her up, less kindly.', 'Blackbird gets taught something by {npc} at {gym}. It is mostly "ow".'];
const SPAR_THOUGHT = ['A warm-up. I let {them} hit me. Strategy.', 'Good round. Excellent round. Do not look at the scoreboard.'];

const LADDER_WIN = [
  'Bout {rank} at {gym}: {npc} across the ring, a crowd that has paid, and a purse of {amount}nd on the table. Blackbird wins it. {npc} is not smiling.',
  '{gym}: Blackbird wins a ladder bout against {npc}. The board is updated in chalk; a bored kid does the writing.',
];
const LADDER_TOP = [
  'The top of the ladder at {gym}: {npc} goes down, the pit comes up in a roar, and the owner hands over a belt that is mostly paint. {amount}nd on top.',
  '{gym} has a new champion, and the champion is Blackbird. The belt comes with a receipt.',
];
const LADDER_LOSE = ['Blackbird loses a ladder bout at {gym} to {npc}, and the {fee}nd entry goes with it.', '{npc} wins on points, on the floor and in the argument. The fee stays at {gym}.'];
const LADDER_THOUGHT = ['Rank {rank}. Soon: rank everything.', 'They will put my name on the wall. In chalk, but still.'];

const SHIFT_DEFAULT = ['Blackbird works the desk at {gym} for a while. Towels, tablets, an argument about a locker. {amount}nd.', 'A shift at {gym}: she hands out towels and takes names. {amount}nd, and a free protein bar of uncertain age.'];
const SHIFT_TIP = ['Blackbird works a shift at {gym} and hears {tip} named over the desk, quietly, in connection with something paper. {amount}nd, and a name.'];
const SHIFT_THOUGHT = ['Honest work. It will never happen again.', 'Customer service. I am great at it. Do not ask anyone.'];

// ===================================================================== rows

export const BODY: Affordance<GymView>[] = [
  row({
    id: 'train', where: { feature: TRAIN_FEATURES }, each: true, pace: 'session',
    needs: ['stat:muscle', 'stat:reflex'], needsFrom: (f): Need[] => (FEATURES[f]?.trains ?? []).map((s) => `skill:${s}` as Need),
    sees: 'A rig, a bag, a wall: a place to turn money and a bad evening into skill.', stakes: 'A day pass and a sore body; skill XP, a little level progress, the trainer warming to her.', consequence: 'The floor tires of her repeats (venue fatigue); soreness carries into her next fight.',
    drives: { pride: 0.7, quest: 0.3, bravery: 0.2 }, bonus: 0.15, intent: ['Blackbird eyes the equipment and decides she has been getting soft.', 'Blackbird pays at the desk and picks a corner of the gym to suffer in.'],
    ok: (w, v) => canPay(w, v) && soreOf(w.hero) < 0.95 && !hasSituation(v, 'power_cut'),
    run: (c, v, f) => trainSession(c, v, f ?? 'heavy_bags', TRAIN_LINES, TRAIN_THOUGHTS),
  }),
  row({
    id: 'spar', where: { feature: ['ring', 'mats', 'cage_ring', 'heavy_bags'] }, pace: 'fight',
    needs: ['skill:melee', 'skill:athletics', 'stat:muscle', 'drive:bravery'],
    sees: 'A ring and a regular who will hit back, politely.', stakes: 'A real but non-lethal fight; melee XP, a friend or a grudge, soreness.', consequence: 'The partner remembers who won.',
    drives: { bravery: 0.9, pride: 0.7 }, bonus: 0.1, risk: 0.5, intent: ['Blackbird looks around the gym for someone to hit, with permission.', 'Blackbird wraps her hands and nods at a regular.'],
    ok: (w, v) => !!(find(v, 'sparrer') ?? find(v, 'regular')) && w.hero.hp >= w.hero.maxHp * 0.4 && soreOf(w.hero) < 0.9 && canPay(w, v),
    run: (c, v) => spar(c, v, { win: SPAR_WIN, lose: SPAR_LOSE, thought: SPAR_THOUGHT }),
  }),
  row({
    id: 'ladder', where: { room: 'pit', feature: 'pit_ring' }, pace: 'fight',
    needs: ['skill:melee', 'stat:muscle', 'drive:pride', 'drive:greed', 'goal:fame'],
    sees: 'A ranked ladder with chalk on a board and a purse on the table.', stakes: 'An entry fee; a real fight with the next rung; fame, a purse, a belt at the top.', consequence: 'A rank at this gym, and the rival who now remembers her.',
    drives: { pride: 1.1, greed: 0.6, bravery: 0.6, quest: 0.5 }, bonus: 0.3, risk: 0.8, intent: ['Blackbird reads the ladder on the board and finds the name above hers.', 'Blackbird pays the entry fee for the next rung. The man with the ledger writes it down slowly.'],
    ok: (w, v) => !banned(w, v.main) && ladderFighters(w, v.main).length > 0 && w.hero.cash >= 20 * v.info.tier && w.hero.hp >= w.hero.maxHp * 0.5 && soreOf(w.hero) < 0.85,
    run: (c, v) => ladderBout(c, v, { win: LADDER_WIN, lose: LADDER_LOSE, top: LADDER_TOP, thought: LADDER_THOUGHT }),
  }),
  row({
    id: 'work-shift', where: { room: 'floor' }, pace: 'session',
    needs: ['skill:hustling', 'skill:streetwise', 'drive:greed', 'tag:broke'],
    sees: 'Towels to fold, a desk to man and a quiet word to overhear.', stakes: 'A few neodollars and a little gossip; the owner owes her a favour.', consequence: 'The staff like her more; shifts run out until the gym is busy again.',
    drives: { greed: 0.7 }, bonus: 0.05, intent: ['Blackbird sees a desk with no one on it and a till with something in it.', 'Blackbird is asked, in a dry voice, whether she wants a few hours of work. She does not, and takes it.'],
    ok: (w, v) => shiftsOf(w, v.main) >= 1 && !!(find(v, 'desk') ?? find(v, 'owner') ?? find(v, 'staff')) && !banned(w, v.main),
    run: (c, v) => workShift(c, v, { default: SHIFT_DEFAULT, thought: SHIFT_THOUGHT, tip: SHIFT_TIP }),
  }),
  row({
    id: 'tune-up', where: { feature: 'rigs', variant: ['chrome', 'atlasfit'] }, pace: 'session',
    needs: ['implant:any', 'stat:muscle', 'drive:thirst'],
    sees: 'A bay where a rig tech will look at her wiring, and her ribs.', stakes: '25nd; soreness drops, a little patching, a chance to fix a glitch.', consequence: 'The rig tech keeps notes.',
    drives: { thirst: 0.2, pride: 0.2 }, bonus: 0.1, intent: ['Blackbird sees a sign: TUNE-UP TUESDAY (EVERY DAY).'],
    ok: (w) => w.hero.cash >= 25 && (soreOf(w.hero) > 0.2 || w.hero.hp < w.hero.maxHp * 0.8 || w.hero.injuries.length > 0),
    check: { who: 'trainer', pay: 25, parts: ['tinkering'], base: 0.85, per: 0, lo: 0.85, hi: 0.85,
      win: R(['{gym}: a rig tech runs a scanner down her spine, tightens something, loosens something else and says "all within tolerance". It cost 25nd. She feels newly installed.', 'A tune-up at {gym}: 25nd, a diagnostic and a cheerful lecture about her posture. She leaves lighter.'], { thought: ['Twenty-five for a tune-up. I should get one for the whole city.'], hp: 12, sore: -0.35 }),
      lose: R(['The tune-up at {gym} reports an error, shrugs and offers a refund voucher.'], { hp: 2 }) },
  }),
  row({
    id: 'physio', where: { feature: 'physio_table' }, pace: 'session',
    needs: ['skill:medicine', 'stat:muscle'],
    sees: 'A table, strong thumbs and the sound of her own muscles confessing.', stakes: '20nd; soreness drops a lot, the odd injury gets looked at.', consequence: '—',
    drives: { thirst: 0.1, pride: 0.1 }, bonus: 0.1, intent: ['Blackbird limps toward the physio room.'],
    ok: (w) => w.hero.cash >= 20 && (soreOf(w.hero) > 0.15 || w.hero.injuries.length > 0 || w.hero.hp < w.hero.maxHp * 0.8),
    run: (c, v) => {
      const h = c.w.hero;
      h.cash -= 20;
      addSore(h, -0.5);
      h.hp = Math.min(h.maxHp, h.hp + 8);
      const cured = h.injuries.length && c.rng.chance(0.35) ? h.injuries.shift() : undefined;
      say(c, 'physio', 'good', cured ? ['The physio at {gym} finds the real problem ({inj}), says something clinical and fixes it in four minutes. 20nd.'] : ['The physio at {gym} finds three things wrong that she had not noticed and two that she had. 20nd, and an ice pack.'], ['That is what thumbs are for.'], { gym: v.main.name, inj: String(cured ?? '') });
    },
  }),
  row({
    id: 'sauna-soak', where: { feature: 'steam_bench' }, pace: 'session',
    needs: ['skill:tolerance', 'skill:streetwise', 'skill:romance', 'drive:lust', 'drive:curiosity'],
    sees: 'Heat, quiet, and a bench of people who forgot to bring their guard up.', stakes: 'Free; soreness drops a lot, a rumour may drift her way, and someone may look twice.', consequence: '—',
    drives: { thirst: 0.3, curiosity: 0.3, lust: 0.2 }, bonus: 0.1, intent: ['Blackbird thinks about how her muscles feel and heads for the steam.'],
    run: (c, v) => {
      const { w, rng } = c;
      const h = w.hero;
      addSore(h, -0.6);
      h.drunk = Math.max(0, h.drunk - 1);
      const company = find(v, 'fair', rng);
      if (company && rng.chance(0.35)) {
        company.affinity += 6;
        kindle(h, 0.1);
        say(c, 'sauna.company', 'good', ['The steam room at {gym} is hot and quiet. {npc} is on the next bench and looking, and not at the thermostat.'], ['Sweat suits me.'], { gym: v.main.name }, { npc: company.name });
      } else say(c, 'sauna.alone', 'good', ['An hour in the sauna at {gym}. The ache goes out of her through the floor. Nobody says a word, which is the whole product.'], ['Boiled. Reborn. Next.'], { gym: v.main.name });
    },
  }),
  row({
    id: 'free-checkup', where: { room: 'floor', situation: 'wellness_week' }, pace: 'quick',
    needs: ['skill:medicine', 'drive:greed'],
    sees: 'Free checks, free pamphlets and a clipboard at every machine.', stakes: 'Free; a small patch-up and a data trail.', consequence: 'Atlas now has her resting heart rate.',
    drives: { greed: 0.3 }, bonus: 0.05, intent: ['A banner says WELLNESS WEEK. Blackbird respects the word FREE.'],
    check: { who: 'staff', parts: ['medicine'], base: 0.8, per: 0, lo: 0.8, hi: 0.8,
      win: R(['A free check-up at {gym}: a tablet, a cuff, a very cheerful nurse. She gets a pamphlet and a patch. Atlas now has her resting heart rate.'], { hp: 8, sore: -0.1, heat: ['atlas', 0] }),
      lose: R(['The check-up at {gym} finds nothing wrong with her, which she feels is unfair.'], {}) },
  }),
];

// ===================================================================== craft

export const CRAFT: Affordance<GymView>[] = [
  row({
    id: 'repair-bench', where: { feature: 'tool_bench' }, pace: 'session',
    needs: ['skill:tinkering', 'drive:curiosity', 'drive:greed'],
    sees: 'A bench, a vice and a pile of broken kit that someone is paying to have fixed.', stakes: 'A few neodollars for fixing it; a chance to break it worse.', consequence: 'The owner remembers who fixed the leg press.',
    drives: { greed: 0.5, curiosity: 0.4 }, bonus: 0.1, intent: ['Blackbird sees a broken rig and a bench with the right wrench.'],
    check: { who: 'owner', parts: ['tinkering', ['stat:reflex', 0.3]], base: 0.25, per: 0.07,
      win: R(['Blackbird fixes a leg press at {gym} with a hex key and a hunch. {owner} pays {amount}nd and does not look at what is still on the floor.', 'Blackbird rebuilds a pulley at {gym}. It works. {owner} says "good" in the way of someone who is about to ask for another.'], { cash: [25, 70], from: 'owner', train: [['tinkering', 2]], affinity: 5, xp: 4 }),
      lose: R(['Blackbird makes the broken rig at {gym} more broken. {owner} says nothing. The nothing is long.'], { affinity: -4, hp: -2 }) },
  }),
  row({
    id: 'junk-scavenge', where: { feature: 'junk_pile' }, pace: 'session',
    needs: ['skill:scavenging', 'drive:curiosity', 'drive:greed'],
    sees: 'A pile of broken kit that is somebody else\'s rubbish and, possibly, hers.', stakes: 'Scrap and the odd gem; a scraped hand.', consequence: '—',
    drives: { curiosity: 0.4, greed: 0.4 }, bonus: 0.1, intent: ['Blackbird looks at the junk pile and sees inventory.'],
    check: { parts: ['scavenging'], base: 0.4, per: 0.07,
      win: R(['Blackbird goes through the junk at {gym} and comes out with {item}. A good night\'s rubbish.', 'Under three broken plates and a bag of towels at {gym}: {item}.'], { item: 'scrap_metal', train: [['scavenging', 2]], xp: 3 }),
      lose: R(['Blackbird finds a sharp edge in the junk at {gym}. The edge wins.'], { hp: -3 }) },
  }),
  row({
    id: 'juice-bar-shift', where: { feature: 'juice_tap' }, pace: 'session',
    needs: ['skill:cooking', 'skill:mixology', 'drive:greed'],
    sees: 'A blender, a menu of muscle-named drinks and a queue.', stakes: 'Tips; a drink that either works or does not.', consequence: 'Regulars start asking for her blend.',
    drives: { greed: 0.5, curiosity: 0.2 }, bonus: 0.1, intent: ['Blackbird sees an unattended blender and a queue.'],
    check: { who: 'regular', parts: ['cooking', ['mixology', 0.7]], base: 0.4, per: 0.06,
      win: R(['Blackbird takes over the blender at {gym}. By the end of the hour the queue has a favourite and the favourite is hers. {amount}nd in tips.', 'Blackbird mixes a recovery shake at {gym} so green it is almost an apology. It sells out. {amount}nd.'], { cash: [10, 45], train: [['cooking', 2], ['mixology', 1]], affinity: 4, xp: 3 }),
      lose: R(['The blend at {gym} separates in the cup. A regular drinks it anyway, out of politeness, and goes pale.'], { affinity: -3 }) },
  }),
  row({
    id: 'recovery-shake', where: { feature: ['juice_tap', 'supplement_counter'] }, pace: 'quick',
    needs: ['skill:cooking', 'skill:tolerance', 'skill:mixology'],
    sees: 'Powders, a blender and a promise on a tub.', stakes: '12nd; a lift in a fight, or a bad stomach.', consequence: '—',
    drives: { thirst: 0.3, pride: 0.2 }, bonus: 0.05, intent: ['Blackbird reads a tub: "RECOVERY". She decides to recover.'],
    check: { pay: 12, parts: ['cooking', ['tolerance', 0.7]], base: 0.55, per: 0.05,
      win: R(['A recovery shake at {gym}: 12nd, a flavour she cannot name and a surge of something that is not quite hope. She feels strong for a while.'], { buff: { id: 'juiced', power: 3, beats: 40 }, sore: -0.15, thought: ['Protein. I am basically protein now.'] } as Result),
      lose: R(['The shake at {gym} was not what the tub said. Blackbird spends the next while on the floor, learning about her intestines.'], { hp: -6, sore: 0.1 }) },
  }),
  row({
    id: 'supplement-test', where: { feature: 'supplement_counter' }, pace: 'quick',
    needs: ['skill:tolerance', 'drive:curiosity', 'drive:bravery'],
    sees: 'A shelf of tubs of uncertain provenance and a sample tray.', stakes: 'A boost or a bad hour.', consequence: '—',
    drives: { curiosity: 0.6, bravery: 0.3 }, bonus: 0.05, intent: ['Blackbird finds a sample tray. The tray has no sign.'],
    check: { parts: ['tolerance', ['stat:muscle', 0.3]], base: 0.4, per: 0.07,
      win: R(['Blackbird takes a sample of something at {gym}. It tastes like pennies and ambition. She feels she could lift the building.'], { buff: { id: 'juiced', power: 4, beats: 45 }, xp: 2 } as Result),
      lose: R(['The sample at {gym} turns out to be a veterinary product. Blackbird sees colours for a bit.'], { hp: -8, sore: 0.1 }) },
  }),
  row({
    id: 'treat-regular', where: { room: ['floor', 'locker', 'physio'] }, pace: 'session',
    needs: ['skill:medicine', 'skill:rapport'],
    sees: 'Strains, stitches and a lot of people pretending not to be in pain.', stakes: 'A few neodollars and a good reputation.', consequence: 'The patient tells people.',
    drives: { thirst: 0.1, greed: 0.2 }, bonus: 0.0, intent: ['Blackbird notices someone wincing and has a first-aid kit.'],
    ok: (w, v) => skillLevel(w.hero, 'medicine') >= 1 && !!find(v, 'regular'),
    check: { who: 'regular', parts: ['medicine'], base: 0.4, per: 0.09,
      win: R(['Blackbird strapped up {npc}\'s knee at {gym}. {They} pay{s} {amount}nd and a lot of thanks.'], { cash: [12, 45], from: 'who', train: [['medicine', 2]], affinity: 8, xp: 3 }),
      lose: R(['Blackbird gets the strapping on {npc}\'s knee at {gym} backwards. {They} look{s} at it for a long time.'], { affinity: -5 }) },
  }),
  row({
    id: 'pro-shop-haggle', where: { feature: 'pro_shop_rack' }, pace: 'quick',
    needs: ['skill:haggling', 'skill:streetwise', 'drive:greed'],
    sees: 'A rack of wraps and gloves, and a tag on everything that is a suggestion.', stakes: 'Gear at a bargain; a refusal.', consequence: '—',
    drives: { greed: 0.6 }, bonus: 0.05, intent: ['Blackbird sees a price tag and a person who can be argued with.'],
    check: { who: 'desk', pay: [15, 35], parts: ['haggling', ['stat:charm', 0.5]], base: 0.4, per: 0.08,
      win: R(['A hard negotiation at the {gym} pro shop. She gets {item} for {pay}nd, and a free sports bottle she did not ask for.'], { item: 'speed_gloves', train: [['haggling', 2]], xp: 3 }),
      lose: R(['The pro-shop attendant at {gym} will not move on price. She leaves with a mouthguard and a grudge.'], { item: 'boxing_wraps' }) },
  }),
  row({
    id: 'pool-hustle', where: { feature: 'pool_table' }, pace: 'session',
    needs: ['skill:pool', 'skill:grifting', 'skill:cards', 'stat:reflex', 'drive:greed', 'drive:pride'],
    sees: 'A pool table with a tilt nobody has fixed, and someone who thinks they are good.', stakes: 'A bet on a table that only she knows is crooked; a cue to the ribs.', consequence: 'The table remembers.',
    drives: { greed: 0.7, pride: 0.6 }, bonus: 0.1, risk: 0.3, intent: ['Blackbird sees a pool table, a regular with a cue and a tilt in the cloth.'],
    ok: (w) => w.hero.cash >= 15,
    check: { who: 'regular', parts: ['pool', ['grifting', 0.4], ['stat:reflex', 0.4]], base: 0.3, per: 0.07,
      win: R(['Blackbird lets {npc} win the first frame at {gym}, then the second, then not the third. The tilt in the cloth is a friend. {amount}nd.'], { cash: [15, 60], from: 'who', train: [['pool', 2], ['grifting', 1]], affinity: -4, xp: 3 }),
      lose: R(['{npc} knows the tilt at {gym} better than she does. {lost}nd later, so does she.'], { loseCash: [10, 30], train: [['pool', 1]] }) },
  }),
  row({
    id: 'range-wager', where: { feature: ['shooting_lane', 'dart_board'] }, pace: 'quick',
    needs: ['skill:marksmanship', 'skill:throwing', 'drive:greed', 'drive:pride'],
    sees: 'A line of paper and a regular who says they can beat her.', stakes: 'A bet at stake; a rival\'s pride.', consequence: '—',
    drives: { pride: 0.7, greed: 0.5 }, bonus: 0.05, intent: ['Blackbird hears someone brag about their score and puts money down.'],
    ok: (w) => w.hero.cash >= 15,
    check: { who: 'regular', parts: [['marksmanship', 0.7], ['throwing', 0.7], ['stat:reflex', 0.4]], base: 0.3, per: 0.07,
      win: R(['A side bet at {gym}. Blackbird puts three in the ten ring and {npc} pays {amount}nd without eye contact.'], { cash: [15, 45], from: 'who', train: [['marksmanship', 1], ['throwing', 1]], affinity: -3, xp: 3 }),
      lose: R(['{npc} is better than {they} looked. The {lost}nd at {gym} goes across the counter.'], { loseCash: [10, 25], train: [['marksmanship', 1]] }) },
  }),
];

// ===================================================================== the crowd

export const CROWD: Affordance<GymView>[] = [
  row({
    id: 'mirror-flex', where: { feature: 'mirror_wall' }, pace: 'quick',
    needs: ['stat:charm', 'drive:pride', 'skill:romance'],
    sees: 'A wall of mirrors and an audience that pretends it is not watching.', stakes: 'A swagger buff, an admirer; a look from the wrong person.', consequence: '—',
    drives: { pride: 1.2 }, bonus: 0.1, intent: ['Blackbird catches her own eye in a mirror and approves.'],
    check: { who: 'fair', parts: [['stat:charm', 1], ['romance', 0.4]], base: 0.45, per: 0.06,
      win: R(['Blackbird flexes at the mirror wall in {gym}. Someone behind her stops mid-rep. The swagger is real, the biceps are mostly rumour.'], { buff: { id: 'swagger', power: 3, beats: 18 }, fame: 0.3, affinity: 4 } as Result),
      lose: R(['A flex at {gym} goes wrong. A mirror shows her, with great clarity, from behind.'], { hp: -1 }) },
  }),
  row({
    id: 'flirt-regular', where: { room: ['floor', 'hall', 'sauna', 'studio'] }, pace: 'quick',
    needs: ['skill:romance', 'stat:charm', 'skill:dancing', 'drive:lust'],
    sees: 'People in good shape doing their best not to look at one another.', stakes: 'A date or a slap; a rival in the next set.', consequence: 'The regular remembers.',
    drives: { lust: 1.0, pride: 0.4 }, bonus: 0.05, intent: ['Blackbird notices someone in the next bay with a good back.'],
    ok: (w, v) => !!find(v, 'fair') && !banned(w, v.main),
    run: (c, v) => {
      const { w, rng } = c;
      const target = find(v, 'fair', rng)!;
      const h = w.hero;
      const p = 0.3 + 0.03 * h.charm + 0.04 * skillLevel(h, 'romance') + target.affinity / 300;
      if (rng.chance(Math.min(0.85, p))) {
        target.affinity += 10;
        kindle(h, 0.15);
        train(c, 'romance', 2);
        say(c, 'flirt.win', 'good', ['{npc} laughs at a line Blackbird has never used before and, now, will never need to. They spot each other on the bench for an hour.'], ['Smooth. Obviously.'], { gym: v.main.name }, { npc: target.name });
      } else {
        target.affinity -= 4;
        train(c, 'romance', 1);
        say(c, 'flirt.lose', 'bad', ['{npc} listens to Blackbird\'s line about the bench press, holds up one hand and says "no". It is a good "no". It is a thorough one.'], ['It was a test. They passed.'], { gym: v.main.name }, { npc: target.name });
      }
    },
  }),
  row({
    id: 'dance-class', where: { feature: ['sound_system', 'mirror_wall'], room: ['floor', 'hall', 'studio'] }, pace: 'session',
    needs: ['skill:dancing', 'skill:djing', 'skill:music', 'stat:charm', 'drive:pride'],
    sees: 'A sound system and a class that has not found the beat yet.', stakes: 'Tips and a little fame; stage fright.', consequence: 'The class remembers her.',
    drives: { pride: 0.9, lust: 0.2, curiosity: 0.2 }, bonus: 0.1, intent: ['Blackbird looks at a class stumbling through a routine and hears a better beat.'],
    ok: (_w, v) => v.info.variant === 'studio' || !!find(v, 'regular'),
    check: { who: 'regular', parts: ['dancing', ['music', 0.4], ['stat:charm', 0.5]], base: 0.3, per: 0.07,
      win: R(['Blackbird takes over the class at {gym} for ten minutes and nobody objects. Tips, applause and one proposal. {amount}nd.'], { cash: [10, 55], fame: 1, train: [['dancing', 2]], xp: 4, thought: ['They will talk about this class for years. Years.'] } as Result),
      lose: R(['Blackbird counts wrong in front of the class at {gym}. The class counts right, in unison, at her.'], { train: [['dancing', 1]] }) },
  }),
  row({
    id: 'playlist-takeover', where: { feature: 'sound_system' }, pace: 'session',
    needs: ['skill:djing', 'skill:music', 'skill:beatbox', 'drive:pride'],
    sees: 'A sound system running a playlist that has not changed since the last administration.', stakes: 'Fame, if the room agrees; a pulled plug if not.', consequence: '—',
    drives: { pride: 0.9, curiosity: 0.3 }, bonus: 0.1, intent: ['Blackbird looks at the speakers. The speakers look back, tragically.'],
    check: { parts: ['djing', ['music', 0.6], ['tinkering', 0.3]], base: 0.3, per: 0.07,
      win: R(['Blackbird swaps the playlist at {gym} for forty minutes of something with bass. The floor is mesmerised. Everyone lifts heavier.'], { fame: 1, cash: [5, 30], train: [['djing', 2], ['music', 1]], xp: 4 }),
      lose: R(['The crowd at {gym} gets thirty seconds of her playlist before the owner pulls the plug.'], { affinity: -3 }) },
  }),
  row({
    id: 'class-gig', where: { room: ['hall', 'studio', 'floor'], feature: ['sound_system', 'stream_rig', 'mats'] }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'skill:beatbox', 'skill:music', 'stat:charm', 'drive:pride'],
    sees: 'A hall full of people who have to sit still anyway.', stakes: 'Tips and a taste of fame; the owner\'s ear.', consequence: '—',
    drives: { pride: 0.9, greed: 0.3 }, bonus: 0.05, intent: ['Blackbird sees a hall with an audience and an empty corner.'],
    ok: (w) => skillLevel(w.hero, 'guitar') >= 1 || skillLevel(w.hero, 'vocals') >= 1 || skillLevel(w.hero, 'beatbox') >= 1,
    check: { parts: [['guitar', 0.6], ['vocals', 0.6], ['beatbox', 0.3], ['stat:charm', 0.4]], base: 0.25, per: 0.07,
      win: R(['Blackbird plays a short set between classes at {gym}. The room takes it as a gift. {amount}nd and applause.'], { cash: [12, 55], fame: 1, train: [['music', 1]], xp: 4 }),
      lose: R(['A set at {gym} goes sideways. A string snaps, then someone snaps at her. Not a total loss.'], { train: [['music', 1]] }) },
  }),
  row({
    id: 'stream-stunt', where: { feature: 'stream_rig' }, pace: 'session',
    needs: ['skill:athletics', 'stat:charm', 'drive:pride', 'goal:fame'],
    sees: 'A camera on a swivel and an audience of eleven that could be eleven thousand.', stakes: 'Fame; an injury if the stunt is too good.', consequence: 'Her face is somewhere on the network.',
    drives: { pride: 1.3, thirst: 0.1 }, bonus: 0.15, risk: 0.4, intent: ['Blackbird notices the camera is on, and her.'],
    check: { parts: ['athletics', ['stat:charm', 0.6], ['stat:reflex', 0.4]], base: 0.3, per: 0.07, physical: true,
      win: R(['Blackbird does one thing at {gym} with a barbell, a trampoline and a camera. The number goes up. The clip is good, and a little reckless.'], { fame: 2, train: [['athletics', 1]], xp: 5, thought: ['Viral. They will remember.'] } as Result),
      lose: R(['The stunt at {gym} was filmed, in full, from the front. The clip is already getting views.'], { hp: -5, hurt: 0.35, fame: 0.2 }) },
  }),
  row({
    id: 'trampoline-parkour', where: { feature: 'trampoline' }, pace: 'quick',
    needs: ['skill:athletics', 'stat:reflex', 'drive:pride'],
    sees: 'A trampoline, a ceiling and a bad idea in between.', stakes: 'A little fame and athletics; a sprain.', consequence: '—',
    drives: { pride: 0.7, bravery: 0.4 }, bonus: 0.05, intent: ['Blackbird looks at the trampoline and thinks "roof".'],
    check: { parts: ['athletics', ['stat:reflex', 0.6]], base: 0.35, per: 0.07, physical: true,
      win: R(['Blackbird goes up on the trampoline at {gym} and does something the ceiling did not expect. She sticks the landing.'], { fame: 0.6, train: [['athletics', 2]], xp: 3 }),
      lose: R(['Blackbird misses the landing at {gym}. The floor is hard and the trampoline is impassive.'], { hp: -4, hurt: 0.3 }) },
  }),
  row({
    id: 'hall-of-fame-mural', where: { feature: ['hall_of_fame', 'trophy_case'] }, pace: 'session',
    needs: ['skill:art', 'drive:pride', 'goal:fame'],
    sees: 'A wall of faded photographs with room for one more.', stakes: 'A commission or a scolding; a spot on the wall.', consequence: 'Her work may be on the wall tomorrow.',
    drives: { pride: 0.9, curiosity: 0.2 }, bonus: 0.05, intent: ['Blackbird looks at the hall-of-fame wall and sees a gap on the end.'],
    ok: (w) => skillLevel(w.hero, 'art') >= 1,
    check: { who: 'owner', parts: ['art', ['stat:charm', 0.3]], base: 0.35, per: 0.08,
      win: R(['Blackbird paints a mural on the hall-of-fame wall at {gym}. {owner} cries a bit, and pays {amount}nd, and lets her put her own name in the corner.'], { cash: [30, 90], from: 'owner', fame: 1, train: [['art', 2]], affinity: 10, xp: 4 }),
      lose: R(['{owner} looks at the mural at {gym} for a long time. "It is a wall," {they} say{s}. It was a wall.'], { affinity: -6, train: [['art', 1]] }) },
  }),
  row({
    id: 'deface-rival-poster', where: { feature: ['notice_board', 'trophy_case'], trait: ['feud', 'famous_origin', 'celebrity_trainer'] }, pace: 'quick',
    needs: ['skill:art', 'drive:pride', 'skill:streetwise'],
    sees: 'A rival gym\'s poster, begging to have a moustache.', stakes: 'The owner\'s gratitude and a small act of vandalism.', consequence: 'The rival gym remembers it.',
    drives: { pride: 0.5, curiosity: 0.2 }, bonus: 0.05, intent: ['Blackbird sees a rival gym\'s poster. It has no moustache.'],
    check: { who: 'owner', parts: ['art'], base: 0.55, per: 0.05,
      win: R(['Blackbird adds a moustache to the rival gym\'s poster on the {gym} board. {owner} chokes on a protein bar and pays her {amount}nd in tokens of appreciation.'], { cash: [8, 30], from: 'owner', affinity: 8, train: [['art', 1]] }),
      lose: R(['The moustache at {gym} comes out looking like a threat. The poster now has a legal department.'], { train: [['art', 1]] }) },
  }),
];

// ===================================================================== gossip, hustle, pressure

export const INTEL: Affordance<GymView>[] = [
  row({
    id: 'notice-board', where: { feature: 'notice_board' }, pace: 'quick',
    needs: ['skill:streetwise', 'drive:curiosity', 'drive:greed'],
    sees: 'Flyers for fights, jobs, rooms and a thing called "Gentle Persuasion" with a number.', stakes: 'A lead, a little cash, an idea.', consequence: '—',
    drives: { curiosity: 0.7, greed: 0.3 }, bonus: 0.05, intent: ['Blackbird reads the notice board. Most of it is lies. Some of it is useful.'],
    check: { parts: ['streetwise', ['stat:charm', 0.3]], base: 0.5, per: 0.06,
      win: R(['A flyer at {gym}: a gig, a name and a phone number. She pockets {amount}nd for returning a lost cat to the right flyer. And she hears about {tip}, in connection with paper.'], { cash: [5, 25], tip: true, train: [['streetwise', 1]], xp: 2 }),
      lose: R(['The board at {gym} is mostly flyers for a boxing night three years ago.'], { train: [['streetwise', 1]] }) },
  }),
  row({
    id: 'water-cooler', where: { feature: ['water_cooler', 'bin_fire'] }, pace: 'quick',
    needs: ['skill:streetwise', 'stat:charm', 'drive:curiosity'],
    sees: 'Six people pretending to drink water and keeping their ears open.', stakes: 'Gossip, if she can hold a conversation.', consequence: '—',
    drives: { curiosity: 0.8 }, bonus: 0.05, intent: ['Blackbird sees a water cooler and, around it, a rumour mill.'],
    check: { who: 'regular', parts: ['streetwise', ['stat:charm', 0.5]], base: 0.4, per: 0.07,
      win: R(['At the {gym} water cooler, {npc} lets slip that {tip} is carrying paper and not telling anyone. Blackbird drinks, and listens.'], { tip: true, train: [['streetwise', 1]], affinity: 2 }),
      lose: R(['The talk at the {gym} cooler dries up when Blackbird arrives. It resumes, slowly, about the weather.'], {}) },
  }),
  row({
    id: 'hustle-a-mark', where: { room: 'floor' }, pace: 'session',
    needs: ['skill:grifting', 'skill:cards', 'skill:streetwise', 'drive:greed'],
    sees: 'Someone who thinks they can beat a stranger in a spar.', stakes: 'A bet on a rigged match; a fight if the mark wises up.', consequence: 'The room is wary of her next trick.',
    drives: { greed: 0.9, pride: 0.3 }, bonus: 0.05, risk: 0.4, intent: ['Blackbird looks around for someone who thinks they are better than they are.'],
    ok: (w, v) => !!find(v, 'regular') && (v.loc.wary?.hustle ?? 0) < 0.6 && !banned(w, v.main),
    check: { who: 'regular', parts: ['grifting', ['stat:charm', 0.5], ['streetwise', 0.3]], base: 0.3, per: 0.07,
      win: R(['Blackbird bets {npc} that {they} cannot hold a plank longer than her. {They} can. {They} are, as it happens, wearing the wrong shoes. {amount}nd.'], { cash: [20, 80], from: 'who', train: [['grifting', 2]], warn: ['hustle', 0.3], affinity: -4, xp: 4 }),
      lose: R(['{npc} wises up to the bet and has friends. Blackbird is now in a conversation she did not plan.'], { fight: true, warn: ['hustle', 0.3], affinity: -10 }) },
  }),
  row({
    id: 'locker-cards', where: { feature: 'lockers' }, pace: 'session',
    needs: ['skill:cards', 'skill:sleight', 'drive:greed', 'drive:thirst'],
    sees: 'Four regulars on a bench with a deck and too much time.', stakes: 'A pot; a feud.', consequence: '—',
    drives: { greed: 0.7, thirst: 0.1 }, bonus: 0.05, intent: ['Blackbird hears the unmistakable slap of a card on a locker door.'],
    ok: (w) => w.hero.cash >= 20,
    check: { who: 'regular', parts: ['cards', ['stat:charm', 0.3], ['sleight', 0.3]], base: 0.32, per: 0.07,
      win: R(['A hand of cards on the locker-room bench at {gym}. Blackbird bluffs with a face she borrowed from a statue. {amount}nd.'], { cash: [20, 70], from: 'who', train: [['cards', 2]], xp: 3 }),
      lose: R(['The locker-room game at {gym} costs Blackbird {lost}nd, a belt buckle and a lesson in reading faces.'], { loseCash: [15, 40], train: [['cards', 1]] }) },
  }),
  row({
    id: 'shake-down-regular', where: { room: ['floor', 'locker'] }, pace: 'fight',
    needs: ['skill:intimidation', 'stat:muscle', 'drive:greed', 'drive:bravery'],
    sees: 'Someone who looks like they have cash and cannot make a fist.', stakes: 'A quick take; heat on the gym and a bad name.', consequence: 'The gym remembers it.',
    drives: { greed: 0.9, bravery: 0.3 }, bonus: 0.0, risk: 0.6, intent: ['Blackbird looks at a regular who is on their own.'],
    ok: (w, v) => !!find(v, 'regular') && !banned(w, v.main),
    check: { who: 'regular', parts: ['intimidation', ['stat:muscle', 0.6]], base: 0.4, per: 0.07,
      win: R(['Blackbird has a quiet word with {npc} at {gym}. {They} hand{s} over {amount}nd and a promise not to mention it.'], { cash: [10, 40], from: 'who', train: [['intimidation', 2]], affinity: -15, heat: ['gym', 1], xp: 3 }),
      lose: R(['{npc} stares at Blackbird at {gym} until she looks away first. Several other people have noticed.'], { affinity: -8, heat: ['gym', 1], thugs: ['ganger', 1] }) },
  }),
  row({
    id: 'lean-on-owner', where: { feature: ['ledger', 'safe'] }, pace: 'fight',
    needs: ['skill:intimidation', 'stat:muscle', 'drive:greed', 'drive:bravery'],
    sees: 'An owner at a desk, with a till they would rather not discuss.', stakes: 'Protection money, or a fight with a former champion.', consequence: 'The owner will not forget it.',
    drives: { greed: 1.0, bravery: 0.4 }, bonus: 0.0, risk: 1.0, intent: ['Blackbird looks at the owner and thinks of a number.'],
    ok: (w, v) => !!find(v, 'owner') && !banned(w, v.main),
    check: { who: 'owner', parts: ['intimidation', ['stat:muscle', 0.7]], base: 0.2, per: 0.07,
      win: R(['Blackbird explains to {owner} at {gym} that accidents happen, especially in gyms. {They} pay{s} {amount}nd, with the face of someone writing a note to themselves.'], { cash: [40, 160], from: 'owner', train: [['intimidation', 2]], affinity: -25, heat: ['gym', 2], xp: 5 }),
      lose: R(['{owner} stands. Blackbird had forgotten {they} used to be the champion of something. {They} remember{s}.'], { fight: true, affinity: -20, heat: ['gym', 2] }) },
  }),
  row({
    id: 'befriend-cat', where: { feature: 'gym_cat' }, pace: 'quick',
    needs: ['skill:rapport', 'drive:curiosity'],
    sees: 'A cat on a bench-press pad, who knows where everything is.', stakes: 'A hidden stash; a scratch.', consequence: '—',
    drives: { curiosity: 0.5 }, bonus: 0.1, intent: ['Blackbird sees a cat. The cat sees her seeing it.'],
    check: { parts: ['rapport', ['stat:charm', 0.3]], base: 0.4, per: 0.08,
      win: R(['The {gym} cat leads Blackbird behind the protein shelf, sits on a loose tile and looks at her. Under the tile: {amount}nd and a gold tooth. The cat does not ask for a cut.'], { cash: [20, 70], item: 'gold_tooth', train: [['rapport', 2]], xp: 3 }),
      lose: R(['The {gym} cat considers Blackbird, finds her wanting and bites.'], { hp: -2 }) },
  }),
  row({
    id: 'pigeon-coop', where: { feature: 'pigeon_coop' }, pace: 'quick',
    needs: ['skill:rapport', 'skill:streetwise', 'drive:curiosity'],
    sees: 'Pigeons with leg bands and an air of having seen your mail.', stakes: 'A message not meant for her.', consequence: '—',
    drives: { curiosity: 0.6 }, bonus: 0.05, intent: ['Blackbird sees pigeons, each with a tiny canister on its leg.'],
    check: { parts: ['rapport', ['streetwise', 0.5]], base: 0.4, per: 0.07,
      win: R(['A pigeon lands on Blackbird\'s arm at {gym} and drops a note. It says a name, {tip}, and a sum, and "do not tell the cat".'], { tip: true, train: [['rapport', 2]], xp: 3 }),
      lose: R(['The pigeons at {gym} regard Blackbird with the quiet contempt of the well-informed.'], {}) },
  }),
  row({
    id: 'robot-spotter-hijack', where: { feature: 'robot_spotter' }, pace: 'session',
    needs: ['stat:int', 'skill:rapport', 'skill:tinkering', 'drive:curiosity'],
    sees: 'A hovering spotter that says "you have got this" to everyone.', stakes: 'An ally for the evening; a bad alarm.', consequence: '—',
    drives: { curiosity: 0.7, pride: 0.2 }, bonus: 0.1, intent: ['Blackbird looks at the spotter. It says "You have got this" at her.'],
    check: { parts: [['stat:int', 1], ['tinkering', 0.5], ['rapport', 0.3]], base: 0.3, per: 0.06,
      win: R(['Blackbird convinces the spotter at {gym} that she is its favourite customer. It hovers by her shoulder for hours, calling every move "optimal".'], { buff: { id: 'spotted', power: 3, beats: 35 }, train: [['tinkering', 1]], xp: 3 } as Result),
      lose: R(['The spotter at {gym} decides she is a hazard and sounds an alarm in a calm, reassuring voice.'], { heat: ['gym', 1], affinity: -3, hp: -1 }) },
  }),
];

// ===================================================================== registration

register('gym', [...BODY, ...CRAFT, ...CROWD, ...INTEL]);

