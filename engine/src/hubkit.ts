import type { Ctx, Hero, Id, Location, Npc, SyllabusEntry, World } from './types';
import { gainXp } from './combat';
import { TECHS, VARIANTS, barterParts, featuresIn, hourly, priceNow, situationAt, trialFee, type SituationDef, type VariantDef } from './content/hubs';
import { train } from './skills';
import { dayOf } from './clock';
import { isFairGame } from './people';
import { npcsAt } from './population';
import { learnTechnique, knowsTechnique, type LearnableId } from './techniques';
import { driveWeights, type Trait } from './personality';
import { friendly, runCheckAs, sayAs, type Check, type Kit, type PlaceView, type Result } from './placekit';

export { friendly };

/**
 * Everything hub actions share: how to read the hub she is standing in, the machinery of teaching (how a line of the syllabus
 * becomes a technique she knows), and the one lasting consequence the hub has, Right Thinking. The rows that use these are in
 * content/hubafford.ts, hubcrime.ts and hubevents.ts; the candidates are assembled in hub.ts; what a hub *is* is in
 * content/hubs.ts.
 *
 * The hub has no shelf and no stock to keep. The only state is a few counters on the world (a lesson half done, a ban, the
 * hours she has bought, how Right she has been taught to think), so there is nothing that can drift.
 */

// ===================================================================== reading a hub

export interface HubView extends PlaceView {
  info: NonNullable<Location['hub']>;
  sit?: { id: string; def: SituationDef };
  v: VariantDef;
  day: number;
}

export function viewAt(w: World, at: Id = w.hero.locationId): HubView | undefined {
  const loc = w.locations[at];
  const info = loc?.hub;
  if (!loc || !info) return undefined;
  const v = VARIANTS[info.variant];
  if (!v) return undefined;
  return { loc, main: loc, room: 'floor', features: featuresIn(info), sit: situationAt(w, loc), people: npcsAt(w, loc.id), info, v, day: dayOf(w.clock) };
}

export type Who = 'owner' | 'teacher' | 'desk' | 'regular' | 'guard' | 'bot' | 'counsellor' | 'liaison' | 'ganger' | 'staff' | 'fair' | 'any' | 'none';

export function find(v: PlaceView, who: string | undefined, rng?: { pick<T>(xs: T[]): T }): Npc | undefined {
  const pool = v.people.filter(friendly);
  let xs: Npc[] = [];
  switch (who as Who | undefined) {
    case 'owner': xs = pool.filter((n) => n.tags.includes('owner')); break;
    case 'teacher': xs = pool.filter((n) => n.tags.includes('teacher')); break;
    case 'desk': xs = pool.filter((n) => n.archetype === 'hub_desk'); break;
    case 'regular': xs = pool.filter((n) => n.archetype === 'hub_regular'); break;
    case 'guard': xs = pool.filter((n) => n.tags.includes('guard')); break;
    case 'bot': xs = pool.filter((n) => n.archetype === 'hub_bot'); break;
    case 'counsellor': xs = pool.filter((n) => n.archetype === 'hub_counsellor'); break;
    case 'liaison': xs = pool.filter((n) => n.archetype === 'tw_liaison'); break;
    case 'ganger': xs = pool.filter((n) => n.archetype === 'ganger'); break;
    case 'staff': xs = pool.filter((n) => n.tags.includes('staff')); break;
    case 'fair': xs = pool.filter((n) => isFairGame(n)); break;
    case 'any': xs = pool; break;
    default: return undefined;
  }
  if (!xs.length) return undefined;
  return rng ? rng.pick(xs) : xs[0];
}

export const hasSituation = (v: PlaceView, tag: string): boolean => !!v.sit?.def.tags.includes(tag);
export const banned = (w: World, main: Location): boolean => !!w.counters[`hubban:${main.id}`];
export const ban = (c: Ctx, v: PlaceView): void => {
  c.w.counters[`hubban:${v.main.id}`] = 1;
};

/** The person who teaches, or failing that whoever runs the place. */
export const teacher = (v: PlaceView): Npc | undefined => find(v, 'teacher') ?? find(v, 'owner') ?? find(v, 'staff');

/** "the Rewrite": a technique's name as a noun phrase. */
export const techTok = (tech: string): Record<string, string> => {
  const t = TECHS[tech];
  return { tech: t?.label ?? tech, techline: t?.line ?? '', taught: t?.taught ?? 'the basics' };
};

// ===================================================================== telling it

export const say = (c: Ctx, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[] | undefined, tok: Record<string, string | number>, extra: Record<string, string | number | boolean> = {}): void => sayAs('hub', c, id, outcome, lines, thoughts, tok, extra);

const HUB_KIT: Kit<HubView> = {
  event: 'hub',
  name: 'hub',
  fame: 'hub',
  cause: 'a scene at the hub',
  messed: 'was messed about by Blackbird at the hub',
  find,
  owner: (v) => v.people.find((n) => n.tags.includes('owner')),
  trap: (v) => v.info.wild === 'trapped_terminals' || v.info.wild === 'cursed_course',
  trapText: 'The terminal was wired.',
};

/** Run a row described as data: pay, roll against her skills, apply a result, tell it, then any fight it starts. */
export const runCheck = (c: Ctx, v: HubView, id: string, k: Check): void => runCheckAs(HUB_KIT, c, v, id, k);

export const R = (text: string[], o: Partial<Result> = {}): Result => ({ text, ...o });

// ===================================================================== Right Thinking

/** What one module of Right Thinking does to her: a little more agreeable, a little less incurious and spiteful. */
export const THINK_STEP: Partial<Record<Trait, number>> = { mischief: -0.03, impulsive: -0.025, grudge: -0.03, sociable: 0.025, loyalty: 0.02 };
export const THINK_MAX = 8;
export const thinkLevel = (w: Pick<World, 'counters'>): number => w.counters.think ?? 0;
/** Titanware remembers an alumna. */
export const alumna = (w: Pick<World, 'counters'>): boolean => thinkLevel(w) >= 3;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Math.round(n * 100) / 100));

function nudge(h: Hero, dir: 1 | -1): void {
  const t = h.personality.traits;
  for (const [k, d] of Object.entries(THINK_STEP) as [Trait, number][]) t[k] = clamp01(t[k] + dir * d);
  h.personality.weights = driveWeights(t);
}

/** One more module taken. Returns whether it took (it stops taking at `THINK_MAX`). */
export function rightThinking(c: Ctx, n = 1): boolean {
  let took = false;
  for (let i = 0; i < n; i++) {
    if (thinkLevel(c.w) >= THINK_MAX) break;
    c.w.counters.think = thinkLevel(c.w) + 1;
    nudge(c.w.hero, 1);
    took = true;
  }
  return took;
}

/** Take some of it back out. Returns how many steps came out. */
export function deprogram(c: Ctx, n = 1): number {
  let out = 0;
  for (let i = 0; i < n; i++) {
    if (thinkLevel(c.w) <= 0) break;
    c.w.counters.think = thinkLevel(c.w) - 1;
    nudge(c.w.hero, -1);
    out++;
  }
  return out;
}

// ===================================================================== teaching

export const knows = (h: Hero, tech: string): boolean => knowsTechnique(h, tech as LearnableId);

/** Can this line be taught to her (it exists, and she does not know it)? */
export const teachable = (w: World, e: SyllabusEntry): boolean => !!TECHS[e.tech] && !knows(w.hero, e.tech);

/** She knows it now. Silent: the caller tells it. */
export function grant(c: Ctx, v: PlaceView, e: SyllabusEntry): void {
  learnTechnique(c.w.hero, e.tech as LearnableId);
  train(c, 'tinkering', 2);
  gainXp(c, 6);
  c.w.counters.hublearned = (c.w.counters.hublearned ?? 0) + 1;
  delete c.w.counters[progressKey(v, e)];
}

const progressKey = (v: PlaceView, e: SyllabusEntry): string => `hublesson:${v.main.id}:${e.tech}`;
export const progress = (w: World, v: PlaceView, e: SyllabusEntry): number => w.counters[progressKey(v, e)] ?? 0;

/** What she is told when she learns it, by route. */
export const LEARNED: Record<string, { text: string[]; thought: string[] }> = {
  cash: {
    text: ['{npc} counts {pay}nd, tips {their} head at the seat in the good light and walks her through {tech} in forty minutes. {They} stop{s} at the exact moment she gets it.', 'Blackbird pays {pay}nd and gets {tech}: {taught}, start to finish, in a chair that is not hers. {npc} writes nothing down. There is nothing to write.', '{pay}nd goes across the desk. A page of notes comes back, then a longer talk. By the time she stands up, {tech} is hers.'],
    thought: ['Expensive. Worth it. Obviously.', 'Knowledge is a commodity. I just bought a very good one.'],
  },
  lessons: {
    text: ['The last evening ends with a quiet nod from {npc}. "That is {tech}. Do not tell anyone where you learned it." Blackbird has no plans to.', '{npc} puts the screwdriver down and says "again", and she does it, and for once it works. {tech} is hers.'],
    thought: ['I washed forty cups for this. It was a bargain.', 'Patience. I have loads of that. In the sense that I have it.'],
  },
  barter: {
    text: ['{npc} weighs the bag of parts in one hand, grunts, and slides over the notes. {tech} is hers for a handful of components and a promise not to ask what they were.', 'A bag of components goes across the table. A page of {taught} comes back. Fair, in the way barter is fair: nobody feels cheated and everyone is a little wrong.'],
    thought: ['I traded junk for a skill. That is called alchemy.', 'Parts are just money that is heavy.'],
  },
  trial: {
    text: ['The test runs eleven minutes. At the end, the clock says green and {npc} says "huh". {tech} is hers, and the fee is the only thing she lost.', 'Blackbird passes the trial with a margin of a few seconds and no dignity. {npc} signs the card. {tech}.'],
    thought: ['I was never in doubt. Mostly. A bit.', 'That was a test of character. I have so much of it.'],
  },
  steal: {
    text: ['The rig is open on the bench and {npc} has turned to argue with a delivery. By the time {they} look back, a copy of {tech} is on a chip in Blackbird\'s sleeve and the rig is humming like nothing happened.', 'Blackbird copies {tech} off {npc}\'s rig while pretending to be interested in the kettle. It takes four minutes. It was always going to be easy.'],
    thought: ['Learning by osmosis. Technically a form of study.', 'Taught myself. The teacher has not been told.'],
  },
  referral: {
    text: ['{npc} looks at her for a long moment, then drags a chair over. "Right. {tech}. You are not paying, because I like you, and that is how it works here."', '"On my word," {npc} says to nobody in particular, and walks her through {tech}. Nobody asks what the word was.'],
    thought: ['Connections. This is how the world works. I am a connection.', 'They like me. Everyone does, eventually.'],
  },
  enrol: {
    text: ['The last module ends, the badge on the lanyard turns green, and a very pleasant voice says "Congratulations. You have completed {tech}." It is the first technique she has learned from a smiling voice.', '{npc} hands her a certificate with an eye on it, shakes her hand and gives her {tech}, in that order. "Remember," {they} say{s}, "think the right way."'],
    thought: ['I feel great. I feel monitored. Those are both nice.', 'It was free. Free is the best price. I will not think about that further.'],
  },
};

/** She is taught it. One line of the board, one route. The silent half is `grant`. */
export function teach(c: Ctx, v: HubView, e: SyllabusEntry, route: string, who?: Npc, extra: Record<string, string | number> = {}): void {
  grant(c, v, e);
  const lines = LEARNED[route] ?? LEARNED.cash!;
  const t = teacher(v) ?? who;
  const tok: Record<string, string | number> = { ...techTok(e.tech), hub: v.main.name, npc: (who ?? t)?.name ?? 'the teacher', ...extra };
  say(c, `learn.${route}`, 'good', lines.text, lines.thought, tok, { place: v.main.name, tech: e.tech, ...(t ? { npc: t.name } : {}) });
  if (t) t.affinity += 1;
}

const broke = (c: Ctx, need: number, what: string): void => c.emit('hub', 'bad', { variant: 'learn.broke', text: `Blackbird does not have ${what}.`, thought: `${need}nd is a lot of nd.` });

/** Cash on the nail. */
export function buyLesson(c: Ctx, v: HubView, e: SyllabusEntry): void {
  const h = c.w.hero;
  const p = priceNow(v.info, e, v.sit?.def, alumna(c.w));
  if (h.cash < p) return broke(c, p, `the ${p}nd`);
  h.cash -= p;
  teach(c, v, e, 'cash', teacher(v), { pay: p });
}

/** An evening of chores for a lesson. The last one is the technique. */
export function sitLesson(c: Ctx, v: HubView, e: SyllabusEntry): void {
  const w = c.w;
  const k = progressKey(v, e);
  const done = (w.counters[k] ?? 0) + 1;
  const who = teacher(v);
  const tok: Record<string, string | number> = { ...techTok(e.tech), npc: who?.name ?? 'the teacher', hub: v.main.name, n: done, steps: e.steps };
  if (done >= e.steps) {
    w.counters[k] = done;
    teach(c, v, e, 'lessons', who, { n: done, steps: e.steps });
    return;
  }
  w.counters[k] = done;
  train(c, 'tinkering', 1);
  gainXp(c, 2);
  if (who) who.affinity += 1;
  say(c, 'lesson', 'good', [
    'Evening {n} of {steps}. {npc} has Blackbird wash every mug in {hub}, rewire a strip light and take a rig apart without losing a single screw. At the end: "Good. Next time, {tech}."',
    'Evening {n} of {steps}: {npc} talks for an hour about {taught} and makes her redo the exercise four times. She learns about {taught}. She learns more about mugs.',
    'Blackbird spends evening {n} of {steps} under a desk with a torch, fixing a cable nobody will thank her for. {npc} says nothing, which is {their} way of saying yes.',
  ], ['Chores. For a skill. This is how every legend starts.', 'I am an apprentice. It sounds better than "unpaid".'], tok, { place: v.main.name, tech: e.tech });
}

/** Spend `n` components of any kind, the most plentiful first. Returns false (and spends nothing) if she has fewer. */
export function spendParts(h: Hero, n: number): boolean {
  const have = h.parts ?? {};
  const total = Object.values(have).reduce((s, x) => s + x, 0);
  if (total < n) return false;
  let left = n;
  for (const id of Object.keys(have).sort((a, b) => (have[b] ?? 0) - (have[a] ?? 0))) {
    const take = Math.min(left, have[id] ?? 0);
    have[id] = (have[id] ?? 0) - take;
    left -= take;
    if (!left) break;
  }
  return true;
}

export const partsHeld = (h: Hero): number => Object.values(h.parts ?? {}).reduce((s, x) => s + x, 0);

/** Parts for a lesson. */
export function barterFor(c: Ctx, v: HubView, e: SyllabusEntry): void {
  const n = barterParts(e, v.sit?.def);
  if (!spendParts(c.w.hero, n)) return;
  teach(c, v, e, 'barter', teacher(v), { parts: n });
}

/** The test. Pay a quarter to sit it. */
export function sitTrial(c: Ctx, v: HubView, e: SyllabusEntry): void {
  const fee = trialFee(e, v.sit?.def);
  const tok = techTok(e.tech);
  runCheck(c, v, 'trial', {
    who: 'teacher', pay: fee, parts: ['tinkering', ['stat:int', 0.7], ['calculate', 0.3]], base: 0.3, per: 0.07, hi: 0.9,
    win: R(LEARNED.trial!.text.map((t) => t.replace('{tech}', tok.tech!)), { thought: LEARNED.trial!.thought, affinity: 1, apply: (cc, vv) => grant(cc, vv as HubView, e) }),
    lose: R([
      `The trial for ${tok.tech} runs nine minutes and ends with a very polite red light. {npc} tears the card in half. "Come back when you want it. The fee is {pay}nd again."`,
      `Blackbird sits the ${tok.tech} trial and trips a canary on step four. A small shock goes up her arm and {npc} says "Next." The fee is gone.`,
      `The ${tok.tech} test goes badly and then, for variety, worse. {npc} is kind about it, in a way that makes her want to lie down.`,
    ], { thought: ['Practice run. That counts as a practice run.', 'I almost had it. I did have it. The test was wrong.'], xp: 1, train: [['tinkering', 1]], hp: -3 }),
  });
}

/** Copy it off the teacher's rig. */
export function stealIt(c: Ctx, v: HubView, e: SyllabusEntry): void {
  const tok = techTok(e.tech);
  runCheck(c, v, 'steal', {
    who: 'teacher', parts: ['sleight', ['sneak', 0.6], ['tinkering', 0.6]], base: 0.22, per: 0.07, dark: 0.1,
    win: R(LEARNED.steal!.text.map((t) => t.replace('{tech}', tok.tech!)), { thought: LEARNED.steal!.thought, train: [['sleight', 2], ['sneak', 1]], apply: (cc, vv) => grant(cc, vv as HubView, e) }),
    lose: R([
      `Blackbird goes for the copy of ${tok.tech} and {npc} turns round at the worst moment. The rig goes dark with a thunk and a smell of toast. Everyone in the room looks at her.`,
      `The chip clicks in the reader and the reader screams. {npc} does not need to look up to know. "Out."`,
    ], { thought: ['That was a test of my reflexes. They passed. The rest did not.', 'The rig is clearly faulty.'], affinity: -10, heat: ['place', 1], train: [['sleight', 1]], hp: -2, apply: (cc, vv) => ban(cc, vv) }),
  });
}

/** A good word from the teacher. */
export function askReferral(c: Ctx, v: HubView, e: SyllabusEntry): void {
  const who = teacher(v);
  if (!who || who.affinity < 10) return;
  teach(c, v, e, 'referral', who);
}

/** One Right Thinking module, then (the last one) the technique. */
export function enrolModule(c: Ctx, v: HubView, e: SyllabusEntry): void {
  const w = c.w;
  const k = progressKey(v, e);
  const done = (w.counters[k] ?? 0) + 1;
  const who = find(v, 'counsellor') ?? teacher(v);
  const took = rightThinking(c);
  const tok: Record<string, string | number> = { ...techTok(e.tech), npc: who?.name ?? 'the counsellor', hub: v.main.name, n: done, steps: e.steps };
  w.counters[k] = done;
  if (who) who.affinity += 1;
  if (done >= e.steps) {
    teach(c, v, e, 'enrol', who, { n: done, steps: e.steps });
    return;
  }
  train(c, 'tinkering', 1);
  gainXp(c, 2);
  const lines = took ? MODULES : MODULES_DULL;
  say(c, 'module', 'mixed', lines.text, lines.thought, tok, { place: v.main.name, tech: e.tech });
}

const MODULES = {
  text: [
    'Module {n} of {steps}: Gratitude As A Practice. {npc} hands her a mug, a pencil and a form headed THINGS I AM GLAD TO BE WATCHED FOR. She writes four. The mug logs her heart rate throughout. She comes out lighter, and slightly worse at holding a grudge.',
    'Module {n} of {steps}: Think The Right Way. A very pleasant video, a quiz, and {npc} asking how she feels about her feelings. Blackbird says "fine". The brochure says that is correct.',
    'Module {n} of {steps}: Aptitude and Alignment. The lesson on {taught} is real and good. The twenty minutes before it are about trust. She comes out of both calmer than she went in, which she does not think about.',
    'Blackbird sits Module {n} of {steps} under a large, open eye. {npc} reads a list of positive statements. She repeats them. They are, mostly, fine. She leaves with a certificate and a faint, warm blankness.',
  ],
  thought: ['I feel great. I feel monitored. Those are both nice.', 'That was a valuable use of my time. I wrote it down. I do not know why.', 'Right thinking. I am so good at it. I always have been.', 'I should be angrier about this. It is hard to remember why.'],
};

const MODULES_DULL = {
  text: [
    'Module {n} of {steps}: another round of Think The Right Way. {npc} nods, the eye on the wall blinks nothing, and there is nothing left in her that can be nudged. She is, if anything, exactly as she was. The lesson on {taught} is the only useful part.',
  ],
  thought: ['I think I am already as right as I can get.'],
};

// ===================================================================== hours at a terminal

/** What an hour at a terminal costs her here: the rate, or nothing in a place that is members only. */
export const rate = (v: HubView): number => hourly(v.info);
