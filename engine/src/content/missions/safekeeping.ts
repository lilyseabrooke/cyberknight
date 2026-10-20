import type { Candidate } from '../../candidate';
import type { Ctx, Item, Location, Mission, Npc, World } from '../../types';
import { clamp } from '../../candidate';
import { addHeat, fight, gainXp, here, kill, remember } from '../../combat';
import { addNpc, moveNpc } from '../../population';
import { spawnNpc } from '../archetypes';
import { ensureDeep } from '../../deepen';
import { addQuestSite, addTrailPlace } from '../../mapgen';
import { hasGoal, childrenOf } from '../../mind';
import { adoptSpec } from '../../goals';
import { maybeAsk } from '../../advice';
import { breach } from '../../musecontract';
import { shiftPull } from '../../musescene';
import { expectation, streetOf } from '../../renown';
import { fameFrom } from '../../stage';
import { genInstrument, hasInstrument } from '../../instruments';
import { odds, skillLevel, synergy, train } from '../../skills';
import { blow, wearStar } from '../../disguise';
import { minuteOfDay } from '../../clock';
import { Rng } from '../../rng';
import {
  actKey, advance, bump, castOf, finish, flag, guitarOdds, hold, pickPlace, placeOf, presentHere, tell, waiting,
  type MissionDef, type StageDef,
} from '../../missionkit';

/**
 * **Safekeeping.** A retired guitar legend, a generated stranger with a name people of a certain age still say quietly, has not played
 * since Muse Clearance took their guitar "for safekeeping". Blackbird finds them, earns her way into their good books, gets the
 * guitar back by one of three roads (the lab's call, or her nature's), and plays the master's last set with it, with the master in
 * the room. Or she kills the master and plays it in their face.
 *
 * Everything is rolled per mission: the master, their old band, the guitar's name, the bar they drink in, the club they last
 * played, how she earns their trust (lessons, the amp, or busking under their window), and the bars she has to clear.
 *
 * Stages: find -> earn -> fork -> (annex | legal | collector -> deliver) -> lastset. From the fork on, a darker road: betray ->
 * usurp. Endings: kept, returned, mourned (the master died), betrayed (she tried and they lived), usurped, exposed.
 */

const GUITAR_NAMES = ['Mabel', 'the Widowmaker', 'Saint Agnes', 'Big Rita', 'Old Smoke', 'the Mule', 'Dolores', 'Lucky Seven', 'Junebug', 'the Reverend', 'Queen of Tuesday', 'Gravel'];
const BANDS = ['the Rust Saints', 'Velvet Static', 'Neon Gospel', 'the Overpass Kids', 'Dead Channel', 'the Lockdown Sweethearts', 'Chrome Lullaby', 'the Tithe Dodgers', 'Sixty Cycle Hum', 'the Late Fees'];
const EARN = ['lessons', 'amp', 'busk'] as const;

/** What a want that would turn into somebody's job looks like (quests.ts JOBS): the master's only job is the guitar. */
const JOB_WANTS = new Set(['wants_money', 'wants_out', 'wants_to_find', 'wants_peace']);

const t = (w: World) => w.hero.personality.traits;
const master = (w: World, m: Mission): Npc | undefined => castOf(w, m, 'master');
const collector = (w: World, m: Mission): Npc | undefined => castOf(w, m, 'collector');
const carrying = (w: World, m: Mission): number => w.hero.inventory.findIndex((i) => i.tags.includes(`mission:${m.id}`));
const hasFeature = (w: World, l: Location, kind: string): boolean => Object.values(w.features).some((f) => f.locationId === l.id && f.kind === kind);
const sit = (_w: World, l: Location): boolean => !l.dungeon && !l.sealed && !l.gen?.quest;
/** A real bar or club, the front of it: not a back room, a kitchen or the Halo's toilets (all of which are 'bar' too). */
const pub = (l: Location): boolean => (l.kind === 'bar' || l.kind === 'club') && (l.gen ? l.gen.role === 'bar' || l.gen.role === 'club' : l.crowded);

/** Minutes until the next evening (eight o'clock), and never less than a couple of hours: "tomorrow night" or "tonight, later". */
function untilEvening(clock: number): number {
  const d = 20 * 60 - minuteOfDay(clock);
  return d < 120 ? d + 24 * 60 : d;
}

/** The guitar itself, the night she gets it: rolled on the mission's stream, a signature instrument with the master's name on it. */
function theGuitar(w: World, m: Mission): Item {
  const it = genInstrument(new Rng(`mission-guitar:${w.worldSeed}:${m.id}`), 6, m.picks.cls);
  it.inst!.signature = 3;
  it.inst!.tone = Math.min(4, it.inst!.tone + 1);
  it.name = `${m.picks.guitar}, ${master(w, m)?.name ?? 'the master'}'s ${it.inst!.cls === 'acoustic' ? 'acoustic' : 'guitar'}`;
  it.value += 400;
  it.tags = [...it.tags, 'mission', `mission:${m.id}`];
  return it;
}

const say = (c: Ctx, m: Mission, variant: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts?: readonly string[], extra: Record<string, string | number | boolean> = {}): void =>
  tell(c, SAFEKEEPING, m, variant, outcome, lines, thoughts, extra);

// ===================================================================== the roads to the guitar

/** Branch A: the lockup. The master's job (quests.ts), aimed at an NPD seized-goods truck off the master's street. */
function setupAnnex(c: Ctx, m: Mission): void {
  const { w } = c;
  const mst = master(w, m);
  const bar = placeOf(w, m, 'bar');
  if (!mst || !bar) return;
  const street = streetOf(w, bar);
  const tier = clamp(Math.round(2 + flag(m, 'last') / 20), 2, 4);
  const { entrance } = addQuestSite(w, street, `${m.id}:annex`, 2, { role: 'spot', spot: 'evidence_van', tier }, mst.id);
  m.places.annex = entrance.id;
  mst.quest = { kind: 'retrieve', fact: `mission:${m.id}`, site: entrance.id, room: 'spot', reward: 40, what: String(m.picks.guitar), state: 'open', run: w.legacy.runs };
  m.flags.branch = 'annex';
  advance(w, m, 'annex');
  // She means to do it: the job goes on her list, and becomes a goal when she has room (quests.ts `livePending`).
  if (!hasGoal(w, 'quest', mst.id) && !w.mind.quests?.includes(mst.id)) (w.mind.quests ??= []).push(mst.id);
}

/** Branch C: somebody bought it at Clearance's auction. A collector, somewhere expensive, with a price. */
function setupCollector(c: Ctx, m: Mission): boolean {
  const { w } = c;
  const bar = placeOf(w, m, 'bar');
  if (!bar) return false;
  const rng = new Rng(`mission-collector:${w.worldSeed}:${m.id}`);
  const at = pickPlace(w, rng, bar.id, (l) => (pub(l) || l.gen?.role === 'shop') && sit(w, l), [3, 9], [m.places.venue ?? ''])
    ?? addTrailPlace(w, streetOf(w, bar), `${m.id}:collector`, 2, 'club');
  const id = `m_${m.id}_collector`;
  const n = w.npcs[id] ?? addNpc(w, spawnNpc(rng, id, 'collector', at.id, { place: at.gen }));
  n.home = at.id;
  if (!n.tags.includes('mission')) n.tags.push('mission');
  m.cast.collector = id;
  m.places.collector = at.id;
  m.flags.branch = 'collector';
  advance(w, m, 'collector');
  return true;
}

/** The fork, decided. */
function resolve(c: Ctx, m: Mission, pick: string): void {
  const { w } = c;
  const lines = {
    annex: [`It's on a truck. NPD property, Clearance paperwork. Blackbird decides that a truck is just a box with wheels, and boxes open.`],
    legal: [`Clearance has a form for everything, including giving things back: play the Muse Approved Setlist, in public, in front of a licensed witness, and the form gets stamped. Blackbird will play the setlist. She will hate every note.`],
    collector: [`Clearance doesn't keep anything for long. It auctions it. Somebody has {guitar} on a wall right now, and somebody will sell it for {price}nd.`],
  };
  if (pick === 'annex') setupAnnex(c, m);
  else if (pick === 'collector' && !setupCollector(c, m)) setupAnnex(c, m);
  else if (pick === 'legal') {
    m.flags.branch = 'legal';
    advance(w, m, 'legal');
  }
  say(c, m, `fork_${m.flags.branch}`, 'mixed', lines[(m.flags.branch as keyof typeof lines) ?? 'annex'] ?? lines.annex, ['Plan. I have a plan. It is a good plan.', 'This is the bit where it gets good.']);
}

/** Which road she'd take on her own: the loud one, the legal one, or the one with a price tag. */
function lean(w: World, m: Mission): 'annex' | 'legal' | 'collector' {
  const tr = t(w);
  const signed = !!w.legacy.muse?.signed;
  const annex = tr.thrill + tr.justice + tr.courage + 0.5 * tr.temper - (signed ? 0.6 : 0);
  const legal = 1.5 * tr.honesty + (signed ? 1.2 : 0) - tr.mischief + 0.2;
  const buy = tr.greed * -0.5 + tr.honesty + (w.hero.cash >= flag(m, 'price') ? 1 : 0.3);
  return annex >= legal && annex >= buy ? 'annex' : legal >= buy ? 'legal' : 'collector';
}

// ===================================================================== the darker road

/** From the fork on, at the master's side: she could just take it. Rarely, if she's in that sort of mood. */
function betrayCandidate(w: World, m: Mission): Candidate | null {
  const mst = master(w, m);
  if (!presentHere(w, mst) || m.flags.killed) return null;
  const tr = t(w);
  return {
    key: actKey(m, 'betray'), drives: { greed: 0.6, pride: 0.3, bravery: 0.3 }, risk: 0.3,
    bonus: -1.4 + 1.6 * (1 - tr.kindness) + 0.8 * (tr.mischief - 0.5) + 0.6 * (tr.greed - 0.5) + 0.6 * (tr.temper - 0.5) - 0.5 * (tr.loyalty - 0.5),
    run: (c) => betray(c, m, mst),
  };
}

function betray(c: Ctx, m: Mission, mst: Npc): void {
  const { w } = c;
  say(c, m, 'betray', 'bad', [
    `Blackbird looks at {npc} for a long moment: an old {role} with a famous name and nothing to do with it. Then she puts down her drink and goes for {them}.`,
    `Somewhere between one sentence and the next, Blackbird decides {npc} has had {their} turn. She stands up. {npc} sees it in her face, a second too late.`,
  ], ['Legends are a renewable resource.', 'I will write a lovely song about this. Lovely.']);
  fight(c, [mst], { cause: `${mst.name}'s name`, assault: true, joiners: true });
  // (If it killed her instead, the master remembers, and the story waits at the stage it reached.)
  if (w.over) {
    if (mst.alive) mst.affinity -= 60;
    return;
  }
  // A bar fight only knocks people down. She meant more than that.
  if (mst.alive && (mst.downUntil ?? 0) > w.clock) kill(c, w, mst, 'Blackbird');
  if (!mst.alive) {
    m.flags.killed = 1;
    advance(w, m, 'usurp');
    say(c, m, 'killed', 'bad', [
      `{npc} is dead. Nobody at {bar} quite saw how it started. Blackbird stands over {them} and is already practising the walk, the slouch, the way {npc} held a glass.`,
      `That's {npc} done. Blackbird looks at the body, then at her reflection in the bar mirror, and starts doing {their} voice under her breath.`,
    ], ["Nobody has seen {npc} play in {years} years. Nobody knows what {npc} looks like now. Except me. I look like {npc} now."]);
  } else {
    mst.affinity -= 60;
    remember(mst, `was attacked by Blackbird over ${m.picks.guitar}`);
    finish(w, m, 'betrayed');
    say(c, m, 'betrayed', 'bad', [
      `{npc} is old, not soft. When it is over {they} {is} still breathing, and {they} will not be talking to Blackbird about guitars, or anything, ever again.`,
      `{npc} survives it. {They} look{s} at Blackbird the way you look at a dog that bit you, and turn{s} {their} back. That's the end of {guitar}, as far as she is concerned.`,
    ], ['Let us never speak of it.', 'That was a misunderstanding with fists.']);
  }
}

// ===================================================================== stages

/** From the fork on she knows what the guitar is worth, and the master is an old {role} on their own: the darker road is open. */
const dark = (st: StageDef): StageDef => ({
  ...st,
  candidates(w, m) {
    const own = st.candidates?.(w, m) ?? [];
    const b = betrayCandidate(w, m);
    return b ? [...own, b] : own;
  },
});

const find: StageDef = {
  label: (w, m) => `find ${master(w, m)?.name ?? 'the legend'} at ${placeOf(w, m, 'bar')?.name ?? 'the bar'}`,
  where: (_w, m) => m.places.bar ?? null,
  candidates(w, m) {
    const mst = master(w, m);
    if (waiting(w, m) || !presentHere(w, mst)) return [];
    return [{ key: actKey(m, 'audition'), drives: { pride: 0.8, curiosity: 0.5 }, bonus: 0.9, run: (c) => audition(c, m) }];
  },
};

function audition(c: Ctx, m: Mission): void {
  const { w, rng } = c;
  const mst = master(w, m)!;
  const borrowed = !hasInstrument(w.hero);
  train(c, 'guitar', 2);
  if (rng.chance(guitarOdds(w, flag(m, 'audition')) - (borrowed ? 0.08 : 0))) {
    mst.affinity += 12;
    remember(mst, 'heard Blackbird play, and listened');
    advance(w, m, 'earn');
    say(c, m, 'audition_good', 'good', [
      `${borrowed ? 'Blackbird borrows the house guitar, which has four strings and a sticker. ' : ''}She plays {npc} one song, at the corner table. {npc} listens with {their} eyes shut. At the end {they} open{s} them and say{s}, "Again. Slower." That is the best review Blackbird has ever had.`,
      `${borrowed ? 'On a borrowed guitar with a bad neck, ' : ''}Blackbird plays for {npc}. Halfway through, {npc} starts tapping a finger on the table, then two. "Sit down," {they} say{s}. "We should talk."`,
    ], ['Of course {they} liked it. Everyone likes it.', 'A legend just told me to sit down. Career high.']);
  } else {
    hold(w, m, 24 * 60);
    say(c, m, 'audition_bad', 'bad', [
      `Blackbird plays {npc} one song. {npc} listens politely to the first verse and then, very politely, to {their} drink. "Come back when you can play," {they} say{s}. "Tomorrow, or next year."`,
      `${borrowed ? 'The borrowed guitar does her no favours. ' : ''}{npc} winces at the bridge, and at the second bridge, and at the third, which wasn't meant to be there. "Not yet," {they} say{s}.`,
    ], ['{They} {is} jealous. Understandably.', 'That was a test. I passed it. They just don\'t know yet.']);
  }
}

const REVEAL = 'Then {npc} tells her. Muse Clearance came for {guitar} {years} years ago: a fine, a form, and the guitar taken "for safekeeping". {They} {has} not played since. {They} would like to, once more.';

const earn: StageDef = {
  label: (w, m) => {
    const name = master(w, m)?.name ?? 'the legend';
    return m.picks.earn === 'lessons' ? `take lessons from ${name}` : m.picks.earn === 'amp' ? `fix ${name}'s old amp` : `busk under ${name}'s window`;
  },
  where: (w, m) => (m.picks.earn === 'busk' ? streetOf(w, placeOf(w, m, 'bar')!).id : m.places.bar ?? null),
  candidates(w, m) {
    const mst = master(w, m);
    if (waiting(w, m) || m.picks.earn === 'busk' || !presentHere(w, mst)) return [];
    if (m.picks.earn === 'lessons') return [{ key: actKey(m, 'lesson'), drives: { curiosity: 0.8, pride: 0.3 }, bonus: 0.7, run: (c) => lesson(c, m) }];
    return [{ key: actKey(m, 'fix_amp'), drives: { curiosity: 0.7, pride: 0.3 }, bonus: 0.6, run: (c) => fixAmp(c, m) }];
  },
  afterSet(c, m, _act, good) {
    const { w } = c;
    const bar = placeOf(w, m, 'bar');
    if (m.picks.earn !== 'busk' || !good || !bar || waiting(w, m)) return;
    const loc = w.locations[w.hero.locationId]!;
    if (loc.id !== bar.id && streetOf(w, loc).id !== streetOf(w, bar).id) return;
    if (bump(m, 'busked') < 2) {
      hold(w, m, 4 * 60);
      say(c, m, 'busk_once', 'mixed', [`Blackbird plays under {npc}'s window at {bar}. A curtain moves. Nothing else does.`], ['{They} heard. {They} {is} just playing it cool.']);
      return;
    }
    master(w, m)!.affinity += 15;
    advance(w, m, 'fork');
    say(c, m, 'busk_done', 'good', [`The second time Blackbird plays under the window at {bar}, {npc} comes down in {their} slippers, stands in the street with {their} arms folded, and at the end says, "Fine. You'll do." ${REVEAL}`], ['Slippers. A legend in slippers. I have arrived.']);
  },
};

function lesson(c: Ctx, m: Mission): void {
  const { w } = c;
  const n = bump(m, 'lessons');
  bump(m, 'progress');
  train(c, 'guitar', 6);
  train(c, 'music', 2);
  gainXp(c, 6);
  const mst = master(w, m)!;
  mst.affinity += 5;
  if (n < 3) {
    hold(w, m, 10 * 60);
    say(c, m, 'lesson', 'good', [
      `Lesson ${n}. {npc} makes Blackbird play one bar for an hour. The same bar. By the end it is a different bar, and so, slightly, is she.`,
      `Lesson ${n}: {npc} takes the pick out of her hand and makes her play with her thumb. "Feel it first. Then you can be loud." Blackbird does not agree, and gets better anyway.`,
    ], ['I knew all of that. I just needed to hear it in a gravelly voice.', 'Homework. A legend gave me homework.']);
    return;
  }
  advance(w, m, 'fork');
  say(c, m, 'lesson_last', 'good', [`The third lesson ends with {npc} saying nothing at all for a long time, which Blackbird has learned is praise. ${REVEAL}`], ['I am now officially taught. By a legend. Write that down.']);
}

function fixAmp(c: Ctx, m: Mission): void {
  const { w, rng } = c;
  const h = w.hero;
  train(c, 'tinkering', 2);
  if (rng.chance(odds(0.25, 0.07, synergy(h, ['tinkering', ['stat:int', 0.4]])))) {
    bump(m, 'progress');
    master(w, m)!.affinity += 15;
    advance(w, m, 'fork');
    say(c, m, 'amp_good', 'good', [`{npc}'s old amp has been dead since the last century. Blackbird has its back off in a minute and finds the fault in ten: a valve, a mouse, a mouse's family. It hums. {npc} puts a hand on it like it's a sleeping dog. ${REVEAL}`], ['I fixed a legend\'s amp. I am basically a roadie now. A legendary one.']);
  } else {
    hold(w, m, 6 * 60);
    say(c, m, 'amp_bad', 'bad', [`Blackbird takes the back off {npc}'s amp. Something in it bangs, then smells. "Leave it," says {npc}. "Come back when you've thought about what you've done."`], ['It was like that when I found it.', 'The amp started it.']);
  }
}

const fork: StageDef = {
  label: (_w, m) => `work out how to get ${m.picks.guitar} back`,
  tick(c, m) {
    const { w } = c;
    if (m.flags.asked) return;
    const her = lean(w, m);
    const asked = maybeAsk(c, 'mission', () => ({
      question: `${m.picks.guitar} is in Clearance's hands. Break into the lockup, play Muse's setlist for a release form, or find whoever's bought it?`,
      options: [
        { id: 'annex', label: 'Break in and take it', hint: 'An NPD seized-goods truck.', mission: { id: m.id, pick: 'annex' } },
        { id: 'legal', label: 'Play the Muse setlist for the form', hint: 'Muse will like her more. The underground, less.', mission: { id: m.id, pick: 'legal' } },
        { id: 'collector', label: 'Buy it back', hint: `About ${flag(m, 'price')}nd, from a collector.`, mission: { id: m.id, pick: 'collector' } },
      ],
      lean: her,
      data: { question: `How do I get ${m.picks.guitar} back?`, mission: m.id },
    }));
    if (asked) m.flags.asked = 1;
    else resolve(c, m, her);
  },
};

const annex: StageDef = {
  label: (w, m) => `get ${m.picks.guitar} back from ${placeOf(w, m, 'annex')?.name ?? 'the lockup'}`,
  // The job pulls her there (a `quest` goal); the mission only follows it.
  tick(c, m) {
    const { w } = c;
    const mst = master(w, m);
    const q = mst?.quest;
    if (!mst || !q) return;
    // Taking it is the breach, the moment it's under her arm.
    if (q.state === 'ready' && w.legacy.muse?.signed && !m.flags.breached) {
      m.flags.breached = 1;
      breach(c, 'annex');
    }
    if (q.state === 'done') {
      bump(m, 'progress');
      advance(w, m, 'lastset', untilEvening(w.clock));
      say(c, m, 'annex_done', 'good', [`{npc} takes {guitar} out of the evidence bag with both hands, like a baby or a bomb. {They} play{s} one chord and stop{s}. "Tomorrow," {they} say{s}. "{venue}. You're playing. I'm listening."`], ['I stole a guitar from the police and gave it to a pensioner. I am Robin Hood. With a guitar.']);
      return;
    }
    // A body that doesn't remember the job keeps it on her list anyway, once she knows the story.
    if (q.state === 'open' && !hasGoal(w, 'quest', mst.id) && !w.mind.quests?.includes(mst.id)) (w.mind.quests ??= []).push(mst.id);
  },
};

const legal: StageDef = {
  label: (w, m) => `play the Muse Approved Setlist at ${placeOf(w, m, 'bar')?.name ?? 'the bar'}`,
  where: (_w, m) => m.places.bar ?? null,
  candidates(w, m) {
    if (waiting(w, m) || !presentHere(w, master(w, m))) return [];
    return [{ key: actKey(m, 'approved_set'), drives: { pride: 0.5, greed: 0.3 }, bonus: 0.6, run: (c) => approvedSet(c, m) }];
  },
};

function approvedSet(c: Ctx, m: Mission): void {
  const { w, rng } = c;
  const bar = placeOf(w, m, 'bar')!;
  train(c, 'guitar', 2);
  if (rng.chance(guitarOdds(w, flag(m, 'legal')))) {
    shiftPull(w, bar.id, 6);
    bump(m, 'progress');
    advance(w, m, 'lastset', untilEvening(w.clock));
    say(c, m, 'legal_good', 'good', [
      `Blackbird plays the Muse Approved Setlist at {bar}, all eleven songs, with a straight face, to a Clearance witness in a pastel lanyard. The witness gives it five stars and a little heart. The release form is stamped. {guitar} goes back to {npc} by courier the same hour, with a complimentary LUMINA tote bag.`,
    ], ['I have never been so ashamed. I was excellent.', 'I will be washing that setlist out of my hands for a week.']);
    return;
  }
  hold(w, m, 6 * 60);
  if (bump(m, 'legal_flops') >= 2) {
    // Clearance doesn't hold things for ever: twice not good enough, and it goes to auction.
    say(c, m, 'legal_auctioned', 'bad', [`The Clearance witness marks the setlist "needs work 💔". By the time the form could be tried again, {guitar} has gone to auction. Somebody bought it. Of course somebody bought it.`], ['Muse sold a legend\'s guitar for a profit. Muse is consistent, I\'ll give it that.']);
    if (!setupCollector(c, m)) setupAnnex(c, m);
    return;
  }
  say(c, m, 'legal_bad', 'bad', [`Blackbird plays the Muse Approved Setlist and cannot keep the contempt out of the third chorus. The Clearance witness writes something down. "We'll be in touch 🥰," it says, which is a no.`], ['That song has four chords and I hate all of them.']);
}

const collectorStage: StageDef = {
  label: (w, m) => `get ${m.picks.guitar} off ${collector(w, m)?.name ?? 'the collector'}`,
  where: (_w, m) => m.places.collector ?? null,
  candidates(w, m) {
    const col = collector(w, m);
    if (!presentHere(w, col)) return [];
    const out: Candidate[] = [];
    const price = flag(m, 'price');
    if (w.hero.cash >= price) out.push({ key: actKey(m, 'buy_guitar'), drives: { greed: 0.3, pride: 0.6 }, bonus: 1.0, run: (c) => buyGuitar(c, m, col) });
    if (!m.flags.lift_failed) out.push({ key: actKey(m, 'lift_guitar'), drives: { greed: 0.7, curiosity: 0.3 }, bonus: -0.2 + 0.6 * (t(w).mischief - 0.5) + 0.4 * (t(w).thrill - 0.5), risk: 0.5, run: (c) => liftGuitar(c, m, col) });
    return out;
  },
  tick(c, m) {
    const { w } = c;
    const price = flag(m, 'price');
    if (w.hero.cash >= price) return;
    // Short of the price: raising it is the step under this one.
    const g = w.mind.goals.find((x) => x.kind === 'mission' && x.mission === m.id);
    if (g && !childrenOf(w, g).length) adoptSpec(c, { kind: 'cash', parent: g.id, amount: price, why: `${collector(w, m)?.name ?? 'the collector'} wants ${price} for ${m.picks.guitar}`, desire: g.desire, variant: 'mission_cash' });
  },
};

function buyGuitar(c: Ctx, m: Mission, col: Npc): void {
  const { w } = c;
  const h = w.hero;
  // A haggler gets something off. Not much: it's a collector.
  const price = Math.round(flag(m, 'price') * (1 - Math.min(0.25, skillLevel(h, 'haggling') / 200)));
  train(c, 'haggling', 1);
  h.cash -= price;
  col.cash += price;
  h.inventory.push(theGuitar(w, m));
  advance(w, m, 'deliver');
  say(c, m, 'bought', 'good', [`{collector} counts the ${price}nd twice and takes {guitar} down off the wall as if handing over a child to a bad home. "Mind the neck," {collector} says. Blackbird minds the neck.`], ['Bought a legend. Well. A legend\'s guitar. Same thing.']);
}

function liftGuitar(c: Ctx, m: Mission, col: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  train(c, 'sleight', 2);
  if (rng.chance(odds(0.2, 0.06, synergy(h, ['sleight', ['sneak', 0.5], ['stat:reflex', 0.4]])))) {
    h.inventory.push(theGuitar(w, m));
      advance(w, m, 'deliver');
    say(c, m, 'lifted', 'good', [`While {collector} is showing a guest a framed set of somebody's teeth, Blackbird walks out of {cplace} with {guitar} over her shoulder like she came in with it.`], ['It was always {npc}\'s. I just delivered it early.']);
    return;
  }
  m.flags.lift_failed = 1;
  addHeat(w, 'npd', 1);
  col.affinity -= 40;
  say(c, m, 'lift_failed', 'bad', [`Blackbird has {guitar} halfway off the wall when {collector} turns round. There is a short, frank exchange of views, and then a longer one.`], ['Browsing. I was browsing.']);
  fight(c, [col], { cause: 'a hand on the collection', joiners: true });
}

const deliver: StageDef = {
  label: (w, m) => `take ${m.picks.guitar} back to ${master(w, m)?.name ?? 'the master'}`,
  where: (w, m) => master(w, m)?.locationId ?? m.places.bar ?? null,
  candidates(w, m) {
    const mst = master(w, m);
    if (!presentHere(w, mst) || carrying(w, m) < 0) return [];
    return [{ key: actKey(m, 'hand_over'), drives: { pride: 0.6, quest: 0.6 }, bonus: 1.2, run: (c) => handOver(c, m) }];
  },
  tick(c, m) {
    const { w } = c;
    if (carrying(w, m) >= 0) return;
    // She hasn't got it any more: it died with a body (or went somewhere else). Clearance picks up what's lying about.
    say(c, m, 'lost_guitar', 'bad', [`{guitar} is not where Blackbird left it. Muse Clearance has it again: picked up "for safekeeping" off the street, with a form.`], ['I put it down for one second.', 'It wanted to go back. Some guitars are like that.']);
    setupAnnex(c, m);
  },
};

function handOver(c: Ctx, m: Mission): void {
  const { w } = c;
  const i = carrying(w, m);
  if (i >= 0) w.hero.inventory.splice(i, 1);
  bump(m, 'progress');
  advance(w, m, 'lastset', untilEvening(w.clock));
  say(c, m, 'handed_over', 'good', [`Blackbird puts {guitar} in {npc}'s hands. {npc} doesn't say anything for a while. Then: "Tomorrow night. {venue}. You play. I'll be at the back."`], ['Mission accomplished. Mostly. There is a gig.']);
}

const lastset: StageDef = {
  label: (w, m) => `play ${master(w, m)?.name ?? 'the master'}'s last set at ${placeOf(w, m, 'venue')?.name ?? 'the club'}`,
  where: (_w, m) => m.places.venue ?? null,
  tick(c, m) {
    const { w } = c;
    const mst = master(w, m);
    if (waiting(w, m) || !mst?.alive || w.hero.locationId !== m.places.venue || mst.locationId === m.places.venue) return;
    moveNpc(w, mst, m.places.venue);
    say(c, m, 'master_arrives', 'mixed', [`{npc} is at {venue}, at the back, by the bar, with {guitar} in a case at {their} feet. A few of the older drinkers have noticed, and are trying not to stare.`], ['No pressure. Just a legend. At the back. Watching.']);
  },
  candidates(w, m) {
    if (waiting(w, m) || !presentHere(w, master(w, m))) return [];
    return [{ key: actKey(m, 'last_set'), drives: { pride: 1.0, curiosity: 0.2 }, bonus: 1.4, risk: 0.1, run: (c) => lastSet(c, m) }];
  },
};

function lastSet(c: Ctx, m: Mission): void {
  const { w, rng } = c;
  const mst = master(w, m)!;
  const venue = placeOf(w, m, 'venue')!;
  train(c, 'guitar', 4);
  train(c, 'music', 2);
  // The master lends her the guitar for the night: a signature instrument in her hands, and the room knows whose it is.
  if (!rng.chance(guitarOdds(w, flag(m, 'last'), 0.12))) {
    hold(w, m, 24 * 60);
    bump(m, 'setbacks');
    say(c, m, 'last_bad', 'bad', [
      `Blackbird plays {guitar} at {venue}, and {guitar} plays her back, and it doesn't go well for her. At the end {npc} takes it out of her hands, gently. "It's not ready for you," {they} say{s}. "Or the other way round. Try again."`,
      `It is a good set, for somebody else's guitar. That is the trouble. {npc} shakes {their} head at the back, kindly. Another night.`,
    ], ['The guitar was out of tune. Emotionally.', 'It was a soundcheck. A very public soundcheck.']);
    return;
  }
  gainXp(c, 25);
  const tr = t(w);
  const keep = tr.vanity + tr.greed - tr.kindness - tr.loyalty + (rng.next() - 0.5) * 0.6 > 0;
  mst.affinity += keep ? 25 : 40;
  remember(mst, 'heard Blackbird play the last set');
  venue.fans = (venue.fans ?? 0) + (keep ? 12 : 20);
  if (keep) {
    fameFrom(c, 4, 'gig');
    const g = theGuitar(w, m);
    w.hero.inventory.push(g);
    finish(w, m, 'kept');
    say(c, m, 'last_kept', 'good', [`Blackbird plays {npc}'s last set on {guitar}, at {venue}, and the room goes very quiet in the right places. At the end {npc} comes up from the back and closes her hands round the neck. "Keep it," {they} say{s}. "It likes you. I can tell."`], ['A legend handed me {their} guitar. In public. Somebody filmed that, right?']);
  } else {
    fameFrom(c, 6, 'gig');
    if (!mst.tags.includes('retired_happy')) mst.tags.push('retired_happy');
    finish(w, m, 'returned');
    say(c, m, 'last_returned', 'good', [`Blackbird plays the set, and at the last song she stops, walks to the back, and puts {guitar} in {npc}'s hands. {npc} plays the last one {themself}, for the first time in {years} years. Half the room is crying. Blackbird is not. Something is in her eye.`], ['That was the right thing. I hate how good it felt.', 'I am a generous genius. Mostly genius.']);
  }
  moveNpc(w, mst, m.places.bar!);
}

const usurp: StageDef = {
  label: (w, m) => `be ${master(w, m)?.name ?? 'the master'} for one night at ${placeOf(w, m, 'venue')?.name ?? 'the club'}`,
  where: (_w, m) => m.places.venue ?? null,
  candidates(w, m) {
    if (waiting(w, m) || w.hero.locationId !== m.places.venue || !hasInstrument(w.hero)) return [];
    return [{ key: actKey(m, 'masquerade'), drives: { pride: 1.0, greed: 0.4 }, bonus: 1.2, risk: 0.3, run: (c) => masquerade(c, m) }];
  },
};

/** She goes on as the dead master: the comeback nobody knew was a funeral. Acting holds the face; the guitar has to hold the room. */
function masquerade(c: Ctx, m: Mission): void {
  const { w, rng } = c;
  const venue = placeOf(w, m, 'venue')!;
  const name = master(w, m)?.name ?? 'the master';
  const dis = wearStar(c, name, 5, -0.05);
  train(c, 'acting', 3);
  train(c, 'guitar', 3);
  if (!rng.chance(dis.polish)) {
    const witness = here(w).find((n) => n.alive && !n.hostile);
    say(c, m, 'usurp_blown', 'bad', [`Blackbird walks onto the stage at {venue} as {npc}, back after {years} years. Somebody at the front knew {npc}. Knew {them} well. The room turns, slowly, from a comeback into an inquest.`], ['The walk was perfect. It was the face.']);
    venue.fans = Math.round((venue.fans ?? 0) * 0.5);
    blow(c, 'recognized', { npc: witness?.name ?? 'somebody at the front' });
    finish(w, m, 'exposed');
    return;
  }
  if (!rng.chance(guitarOdds(w, flag(m, 'last')))) {
    hold(w, m, 24 * 60);
    say(c, m, 'usurp_flop', 'bad', [`"{npc} has lost it," says {venue}, to itself, all night. The face held. The fingers didn't. Blackbird walks off as a tragic old legend, which is exactly the wrong half of the plan.`], ['{They} would have played it worse. Probably.']);
    return;
  }
  // Clearance gives a seized guitar back to its owner, in person. Here {they} {is}.
  w.hero.inventory.push(theGuitar(w, m));
  w.hero.cash += 250;
  venue.fans = (venue.fans ?? 0) + 15;
  gainXp(c, 25);
  finish(w, m, 'usurped');
  say(c, m, 'usurped', 'good', [`{npc}, back after {years} years, plays {venue} to a room that weeps, on {guitar}, which a Clearance officer handed back at the stage door to its rightful owner with a heart sticker on the case. Nobody has ever played like {npc} played tonight. Nobody ever will again, for reasons nobody will know.`], ['Best gig {npc} ever played. You are welcome, {npc}.', 'I should feel worse about this. I will pencil it in.']);
}

// ===================================================================== the mission

export const SAFEKEEPING: MissionDef = {
  id: 'safekeeping',
  title: 'Safekeeping',
  track: 'guitar',
  entries: { after_set: 0.05, grapevine: 0.3, object: 0.06 },
  eligible(w) {
    if (Math.max(expectation(w, 'guitar'), skillLevel(w.hero, 'guitar')) < 10) return false;
    const mine = (w.legacy.missions ?? []).filter((m) => m.def === 'safekeeping');
    if (mine.some((m) => !m.ending)) return false;
    // Not one straight after another: a few days of world time between legends.
    const last = Math.max(-Infinity, ...mine.map((m) => Number(m.flags.endedAt ?? -Infinity)));
    return w.clock - last >= 3 * 24 * 60;
  },
  roll(w, rng: Rng, m) {
    // The master drinks somewhere she has never been: a bar at the end of a couple of new streets off the one she's on.
    const here = w.locations[w.hero.locationId];
    const street = here ? (here.outdoors ? here : w.locations[here.tossTo]) : undefined;
    if (!street) return false;
    const bar = addTrailPlace(w, street, `${m.id}:bar`, rng.int(2, 3), 'bar');
    // The club they last played: one with a stage if she knows of one, else somewhere new.
    const venue = pickPlace(w, rng, bar.id, (l) => pub(l) && sit(w, l) && hasFeature(w, l, 'guitar'), [2, 10])
      ?? pickPlace(w, rng, bar.id, (l) => pub(l) && sit(w, l), [2, 10])
      ?? addTrailPlace(w, streetOf(w, bar), `${m.id}:venue`, 2, 'club');
    const id = `m_${m.id}_master`;
    const mst = w.npcs[id] ?? addNpc(w, spawnNpc(rng, id, 'old_master', bar.id, { place: bar.gen }));
    mst.home = bar.id;
    if (!mst.tags.includes('mission')) mst.tags.push('mission');
    ensureDeep(w, mst);
    // Whatever else is going on in their life, the only job they'll give her is the guitar.
    mst.facts = (mst.facts ?? []).filter((f) => !JOB_WANTS.has(f.kind));
    m.cast.master = id;
    m.places.bar = bar.id;
    m.places.venue = venue.id;
    m.picks.guitar = rng.pick(GUITAR_NAMES);
    m.picks.band = rng.pick(BANDS);
    m.picks.earn = rng.pick(EARN);
    m.picks.cls = rng.chance(0.65) ? 'electric' : 'acoustic';
    m.flags.years = rng.int(12, 34);
    m.flags.audition = 12 + rng.int(0, 6);
    m.flags.legal = 18 + rng.int(0, 6);
    m.flags.last = 26 + rng.int(0, 8);
    m.flags.price = 250 + 50 * rng.int(0, 8);
    return true;
  },
  first: 'find',
  stages: { find, earn, fork, annex: dark(annex), legal: dark(legal), collector: dark(collectorStage), deliver: dark(deliver), lastset: dark(lastset), usurp },
  stick: { artistry: 0.5, loyalty: 0.3, curiosity: 0.3, fame: 0.2 },
  remembers: ['master'],
  tokens(w, m) {
    const mst = master(w, m);
    const bar = placeOf(w, m, 'bar');
    return {
      npc: mst?.name ?? 'the master',
      role: mst?.role ?? 'guitarist',
      bar: bar?.name ?? 'the bar',
      street: bar ? streetOf(w, bar).name : 'the street',
      venue: placeOf(w, m, 'venue')?.name ?? 'the club',
      guitar: m.picks.guitar ?? 'the guitar',
      band: m.picks.band ?? 'the band',
      years: flag(m, 'years'),
      price: flag(m, 'price'),
      collector: collector(w, m)?.name ?? 'the collector',
      cplace: placeOf(w, m, 'collector')?.name ?? 'the shop',
      annex: placeOf(w, m, 'annex')?.name ?? 'the lockup',
    };
  },
  hook(w, m, via) {
    const mst = master(w, m);
    if (via === 'reminded') {
      return {
        npc: mst,
        text: [`{npc} looks up from {their} drink as Blackbird comes in. "There you are. You never came back." Blackbird has never seen this person in her life, as far as she knows. She nods as if she remembers everything. It's about {guitar}, apparently.`],
        thought: ['Old friend. Definitely. I remember all my old friends.'],
      };
    }
    if (via === 'grapevine') {
      return { text: [`A fan catches Blackbird's sleeve: did she know {npc}, from {band}, still drinks at {bar}, off {street}? Hasn't played in {years} years. Nobody knows why. The fan says it like a dare.`], thought: ['A mystery. A legend. A bar. I am already walking.'] };
    }
    if (via === 'object') {
      return { text: [`In a box of junk at ${w.locations[w.hero.locationId]?.name ?? 'the counter'}: a setlist, hand-written, {band}, signed {npc}. On the back, in the same hand, years later: "{bar}. Corner table." Blackbird pockets it.`], thought: ['This is a treasure map. For a person.'] };
    }
    return { text: [`After the set, an old man at the bar, or a woman, or someone, Blackbird is never sure afterwards, says: "You play like {npc} used to. {band}. You know {band}?" She does not. "{npc} still drinks at {bar}. Go and ask why {they} stopped."`], thought: ['People compare me to legends. As they should.'] };
  },
  watch(c, m) {
    const { w } = c;
    const mst = master(w, m);
    if (m.ending || m.flags.killed) return;
    if (!mst?.alive) {
      finish(w, m, 'mourned');
      if (w.mind.missions?.includes(m.id)) say(c, m, 'mourned', 'bad', [`Word reaches Blackbird the way bad news does, sideways: {npc} is dead. {guitar} is still in Clearance's hands, or somebody's. There's nobody to play it for now.`], ['I will write {them} a song. A good one. The best one.', 'I never even heard {them} play.']);
      return;
    }
    // A collector who isn't there to sell any more: the collection goes into evidence, and evidence goes on the truck.
    if (m.stage === 'collector' && !collector(w, m)?.alive) {
      if (w.mind.missions?.includes(m.id)) say(c, m, 'collector_gone', 'mixed', [`{collector} is not going to be selling anything to anyone. The collection is seized as evidence, {guitar} included. It is on an NPD truck again.`], ['Circle of life.']);
      setupAnnex(c, m);
    }
  },
  resolve,
};
