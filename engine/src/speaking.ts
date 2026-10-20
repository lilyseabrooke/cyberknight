import type { Ctx, Hero, Npc, NpcGoalKind, Speech, World } from './types';
import { addHeat, gainXp, here, remember } from './combat';
import { clamp, type Candidate } from './candidate';
import { odds, skillLevel, synergy, train } from './skills';
import { fameFrom } from './stage';
import { sleepOf } from './needs';
import { canDeepen, ensureDeep } from './deepen';
import { moveNpc, npcsAt } from './population';
import { isPerson } from './roads';
import { cool } from './mind';
import { ERRAND_KINDS, barNear, carStreet } from './errands';
import { addGoal, goalOf, oddsWith, phrasing, wishes, type Wish } from './influence';

/**
 * Speaking: public speeches, rousing ones. Four ways to use it.
 * - On a soapbox in the street (or from a hijacked billboard): the point is the crowd. A speech that lands puts a goal in the
 *   heads of the people listening, all at once (see `moveCrowd`, on top of the influence in influence.ts). Fame is the bonus.
 * - To her companions: if it lands they fight harder for a while and like her more.
 * - To the mirror: nothing happens, except that she gets a little better and thinks very well of herself.
 * - To the people who have come for her: talking them down, if she is good enough to dare.
 */
const ODDS = {
  stump: (h: Hero) => odds(0.2, 0.065, synergy(h, ['speaking', ['streetwise', 0.3], ['stat:charm', 0.6]])),
  rally: (h: Hero) => odds(0.3, 0.07, synergy(h, ['speaking', ['stat:charm', 0.6], ['stat:int', 0.2]])),
};

/** Talking a crowd round, from a billboard, on a good day. */
const billboardOdds = (h: Hero): number => odds(0.35, 0.07, synergy(h, ['speaking', ['streetwise', 0.3], ['stat:charm', 0.6]]));
/** How good she has to be before she grabs the mic when she has hijacked a billboard. */
export const BILLBOARD_SPEECH_LEVEL = 12;

/** Skills run 0 to 100. Talking down people who are trying to hurt her takes real nerve and real command of a room. */
export const TALK_DOWN_LEVEL = 15;

/** Skills run 0 to 100 (levels 1, 3, 5, 8, 12... are the milestones). Past this level her speeches read as polished. */
const POLISHED = 8;

/** How long a speech runs on the world clock, in minutes. The soapbox gets the street's attention for most of an hour. */
const STUMP_MINUTES = 45;
const BILLBOARD_MINUTES = 70;
/** People who wander into a speech already under way are a harder sell than the ones who were there for it. */
const DRIFT_PULL = 0.75;

/** A loudspeaker carries her voice out to the next streets along; without one she is heard where she stands. */
const reachOf = (h: Hero): number => (h.inventory.some((i) => i.tags.includes('loudspeaker')) ? 1 : 0);

/** Speeches wear off: each repeat counts for less, and the wear halves in about 23 beats. */
const WEAR_DECAY = 0.97;

/** How worn out a kind of speech is right now (each one adds 1). */
function worn(w: World, key: string): number {
  return (w.counters[`${key}_worn`] ?? 0) * WEAR_DECAY ** (w.beat - (w.counters[`${key}_at`] ?? w.beat));
}
function wear(w: World, key: string): void {
  w.counters[`${key}_worn`] = worn(w, key) + 1;
  w.counters[`${key}_at`] = w.beat;
}

/** The mirror stops being flattering after about this many speeches in a short while. */
const DOUBT_AT = 3;

export function speakingCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const lvl = skillLevel(h, 'speaking');

  // ---- a soapbox on any street
  if (loc.outdoors && !['overpass', 'halo_roof'].includes(loc.id)) {
    out.push({ key: 'stump_speech', drives: { pride: 0.6, curiosity: 0.3, bravery: 0.3 }, bonus: Math.min(lvl, 30) * 0.01 + 0.08 * Math.min(5, audience(w, reachOf(h)).length), risk: 0.15, intent: {}, run: stumpSpeech });
  }

  // ---- a speech she is in the middle of: work the crowd some more, or wrap it up
  const sp = w.speech;
  if (sp && sp.loc === h.locationId && w.clock < sp.until) {
    const fresh = Math.min(4, audience(w, sp.depth).filter((n) => !sp.heard.includes(n.id)).length);
    const spent = clamp((w.clock - sp.began) / (sp.until - sp.began), 0, 1);
    out.push({ key: 'keep_speaking', drives: { pride: 0.5, curiosity: 0.2 }, bonus: 1.2 + 0.2 * fresh + (sp.last > 0 ? 0.4 : 0) - 0.9 * sp.dry - 1.0 * spent, intent: {}, run: keepSpeaking });
    out.push({ key: 'wrap_up', drives: { pride: 0.2 }, bonus: 0.2 + 0.9 * sp.dry + 1.0 * spent - 0.2 * fresh, run: wrapUp });
  }

  // ---- the troops
  const crew = h.companions.filter((a) => a.hp > 0);
  if (crew.length) {
    out.push({ key: 'rally_allies', drives: { pride: 0.5, curiosity: 0.2, bravery: 0.2 }, bonus: 0.15 + Math.min(lvl, 30) * 0.007 - 0.2 * worn(w, 'rally'), intent: {}, run: rallyAllies });
  }

  // ---- the mirror
  if (Object.values(w.features).some((f) => f.kind === 'mirror' && f.locationId === h.locationId)) {
    out.push({ key: 'mirror_speech', drives: { pride: 1.0, curiosity: 0.2 }, bonus: -0.3 * worn(w, 'mirror_speech'), intent: {}, run: mirrorSpeech });
  }
  return out;
}

function stumpSpeech(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  if (rng.next() < ODDS.stump(h)) {
    const moved = moveCrowd(c, { depth: reachOf(h), stretch: 1, edge: 0, remote: 0.55, minutes: STUMP_MINUTES });
    const n = moved?.count ?? 0;
    fameFrom(c, 0.4 + 0.45 * Math.sqrt(n), 'stump_speech');
    for (const k of here(w)) if (k.archetype === 'street_kid') k.affinity += 4;
    train(c, 'speaking', 2 + Math.min(Math.round(Math.sqrt(n)), 4));
    c.emit('stump_speech', 'good', { variant: n ? 'crowd' : 'rousing', level: skillLevel(h, 'speaking'), ...crowdData(moved) });
  } else if (rng.chance(0.3)) {
    addHeat(w, 'npd', 1);
    train(c, 'speaking', 1);
    c.emit('stump_speech', 'bad', { variant: 'complaint' });
  } else if (rng.chance(0.4)) {
    h.hp -= 2;
    train(c, 'speaking', 1);
    c.emit('stump_speech', 'bad', { variant: 'heckled' });
  } else {
    train(c, 'speaking', 1);
    c.emit('stump_speech', 'mixed', { variant: 'ignored' });
  }
}

function rallyAllies(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const crew = h.companions.filter((a) => a.hp > 0);
  // The same speech again and again lands softer: it is less likely to go well, and does less when it does.
  const f = 1 / (1 + 0.7 * worn(w, 'rally'));
  wear(w, 'rally');
  const p = ODDS.rally(h) * f;
  const roll = rng.next();
  const names = crew.map((a) => a.name);
  const data = { count: crew.length, names: names.join(' and '), name: names[0]! };
  const fire = (power: number, beats: number, loyalty: number, heal: number): void => {
    for (const a of crew) {
      a.inspired = { until: w.beat + Math.round(beats * f), power: Math.round(power * f * 10) / 10 };
      a.loyalty = Math.min(100, a.loyalty + Math.round(loyalty * f));
      a.hp = Math.min(a.maxHp, a.hp + Math.ceil(a.maxHp * heal * f));
    }
  };
  if (roll < p * 0.35) {
    // the kind of speech they tell their grandkids about
    fire(4, 45, 12, 1);
    train(c, 'speaking', 3);
    c.emit('rally', 'good', { variant: 'great', ...data });
  } else if (roll < p) {
    fire(2, 30, 6, 0.2);
    train(c, 'speaking', 2);
    c.emit('rally', 'good', { variant: 'good', ...data });
  } else if (rng.chance(0.55)) {
    for (const a of crew) a.loyalty = Math.min(100, a.loyalty + 1);
    train(c, 'speaking', 1);
    c.emit('rally', 'mixed', { variant: 'flat', ...data });
  } else {
    for (const a of crew) a.loyalty = Math.max(0, a.loyalty - 4);
    train(c, 'speaking', 1);
    c.emit('rally', 'bad', { variant: 'flop', ...data });
  }
}

function mirrorSpeech(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  const before = worn(w, 'mirror_speech');
  wear(w, 'mirror_speech');
  if (before >= DOUBT_AT) {
    // She has heard herself enough to notice the flaws, and it costs her sleep rather than helping.
    h.sleep = Math.max(0, sleepOf(h) - 1.5 * (before - DOUBT_AT + 1));
    c.emit('mirror_speech', 'bad', { variant: 'doubt' });
    return;
  }
  train(c, 'speaking', 0.6 / (1 + 0.5 * before));
  c.emit('mirror_speech', 'good', { variant: skillLevel(h, 'speaking') >= POLISHED ? 'orator' : 'rough' });
}

/**
 * She tries to talk down the people who have come for her, before it turns into a fight. A gutsy move: it can go wrong in the
 * first sentence. If they came because of her Heat with their side, a speech that lands also takes some of it off.
 * Returns true if they stand down and there is no fight.
 */
export function talkDown(c: Ctx, foes: Npc[]): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const live = foes.filter((f) => f.alive);
  const lvl = skillLevel(h, 'speaking');
  if (!live.length || lvl < TALK_DOWN_LEVEL || live.some((f) => f.tags.some((t) => ['robot', 'dragon', 'pet'].includes(t)))) return false;
  const wants = clamp(0.08 + (h.personality.weights.pride - 0.5) * 0.3 + (h.personality.weights.bravery - 0.5) * 0.3 + Math.min(lvl, 30) * 0.01, 0, 0.6);
  if (!rng.chance(wants)) return false;
  const lead = live[0]!;
  const law = live.some((f) => f.tags.some((t) => ['cop', 'security'].includes(t)));
  const outmatched = live.reduce((a, f) => a + f.level, 0) / live.length - h.level;
  const p = clamp(odds(0.06, 0.05, synergy(h, ['speaking', ['stat:charm', 0.6], ['stat:int', 0.2]])) / (1 + 0.2 * (live.length - 1)) * (law ? 0.7 : 1) - 0.04 * Math.max(0, outmatched), 0.03, 0.65);
  const data = { npc: lead.name, count: live.length };
  if (rng.chance(p)) {
    const great = rng.chance(0.3);
    const faction = lead.faction;
    const heat = faction ? w.heat[faction] ?? 0 : 0;
    const drop = faction && heat >= 1 ? Math.min(heat, great ? 2 : 1) : 0;
    if (faction && drop) w.heat[faction] = heat - drop;
    for (const f of live) {
      f.affinity += 5;
      remember(f, 'was talked down by Blackbird');
      f.hostile = false;
      // (Anybody who only turned up for her is gone with the rest of the street's business.)
      if (f.id.startsWith('tmp_')) f.alive = false;
    }
    h.fame += great ? 1 : 0.5;
    train(c, 'speaking', great ? 4 : 3);
    gainXp(c, great ? 6 : 4);
    c.emit('talk_speech', 'good', { ...data, variant: great ? 'great' : 'win', heat: drop });
    return true;
  }
  h.hp = Math.max(1, h.hp - 3);
  for (const f of live) f.affinity -= 5;
  train(c, 'speaking', 1);
  c.emit('talk_speech', 'bad', { ...data, variant: 'fail' });
  return false;
}

/** She has hijacked a billboard and she is good enough to have something to say: a stump speech turned up. */
export function billboardSpeech(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  if (skillLevel(h, 'speaking') < BILLBOARD_SPEECH_LEVEL) return;
  if (rng.chance(billboardOdds(h))) {
    // Everyone in earshot, a bigger voice, and it lasts longer.
    const moved = moveCrowd(c, { depth: 1, stretch: 1.6, edge: 0.15, remote: 0.8, minutes: BILLBOARD_MINUTES });
    const n = moved?.count ?? 0;
    const gain = fameFrom(c, 1.5 + 0.7 * Math.sqrt(n), 'stump_speech');
    for (const k of here(w)) if (k.archetype === 'street_kid') k.affinity += 8;
    addHeat(w, 'atlas', 1);
    train(c, 'speaking', 4 + Math.min(Math.round(Math.sqrt(n)), 5));
    gainXp(c, 8);
    c.emit('billboard_speech', 'good', { variant: n ? 'crowd' : 'speech', fame: Math.round(gain * 10) / 10, level: skillLevel(h, 'speaking'), ...crowdData(moved) });
  } else {
    h.fame = Math.max(0, h.fame - 0.5);
    train(c, 'speaking', 1);
    c.emit('billboard_speech', 'bad', { variant: 'flop' });
  }
}

// ===================================================================== the crowd

/** The things a crowd can be sent off to do. (Not "tell her a secret", and not "go and kiss somebody": that wants one person.) */
const CRY: NpcGoalKind[] = ['back_me_up', 'go_after', 'cover', 'give_cash', 'steal_car', 'take_deck', 'buy_round', 'tag_wall', 'karaoke'];

/** Locations within earshot: here, and out along the open streets from here. */
function earshot(w: World, depth: number): string[] {
  const start = w.hero.locationId;
  const seen = new Set<string>([start]);
  let ring = [start];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of ring) {
      for (const e of w.locations[id]?.exits ?? []) {
        const to = w.locations[e.to];
        if (e.hidden || e.gate || !to?.outdoors || seen.has(e.to)) continue;
        seen.add(e.to);
        next.push(e.to);
      }
    }
    ring = next;
  }
  return [...seen];
}

/** Who is in earshot and can be moved. A speech on a street carries along the street. */
export function audience(w: World, depth = 1): Npc[] {
  const h = w.hero;
  const places = new Set(earshot(w, depth));
  const out: Npc[] = [];
  for (const id of places) {
    for (const n of npcsAt(w, id)) {
      if (n.alive && !n.hostile && n.downUntil <= w.clock && canDeepen(n) && isPerson(n.tags, n.archetype) && !h.companions.some((a) => a.npcId === n.id)) out.push(n);
    }
  }
  return out;
}

/** What she asks of this one person for this cry, if it is something they could do. */
function wishFor(w: World, n: Npc, kind: NpcGoalKind): Wish | null {
  if (goalOf(n, kind) || (ERRAND_KINDS.has(kind) && n.goals?.some((g) => ERRAND_KINDS.has(g.kind)))) return null;
  const real = wishes(w, n).find((x) => x.kind === kind);
  if (real) return real;
  const loc = w.locations[w.hero.locationId];
  switch (kind) {
    case 'tag_wall': return loc && loc.kind !== 'home' ? { kind, urge: 0.3, magnitude: 0.4, loc: loc.id } : null;
    case 'karaoke': return w.features.karaoke && w.locations[w.features.karaoke.locationId] ? { kind, urge: 0.3, magnitude: 0.35 } : null;
    case 'take_deck': return w.features.dj_booth && w.locations[w.features.dj_booth.locationId] ? { kind, urge: 0.3, magnitude: 0.6 } : null;
    case 'steal_car': return carStreet(w, w.hero.locationId) ? { kind, urge: 0.3, magnitude: 0.75 } : null;
    case 'buy_round': return n.cash >= 40 && barNear(w, w.hero.locationId) ? { kind, urge: 0.3, magnitude: 0.35 + 0.3 * clamp(30 / n.cash, 0, 1) } : null;
    default: return null;
  }
}

/** What she tells them to do: the biggest thing she wants that a crowd can help with, or else whatever she feels like. */
function pickCry(c: Ctx, crowd: Npc[]): NpcGoalKind | null {
  const { w, rng } = c;
  let best: { kind: NpcGoalKind; urge: number } | null = null;
  for (const n of crowd.slice(0, 12)) {
    for (const x of wishes(w, n)) if (CRY.includes(x.kind) && (!best || x.urge > best.urge)) best = { kind: x.kind, urge: x.urge };
  }
  if (best && best.urge >= 0.2) return best.kind;
  const t = w.hero.personality.traits;
  const mood = ([
    { kind: 'steal_car', w: 0.3 + t.mischief + t.thrill },
    { kind: 'take_deck', w: 0.3 + t.fame + t.mischief },
    { kind: 'buy_round', w: 0.3 + t.sociable + t.impress },
    { kind: 'tag_wall', w: 0.2 + t.artistry + t.mischief },
    { kind: 'karaoke', w: 0.3 + t.fame + t.mischief },
  ] as { kind: NpcGoalKind; w: number }[]).filter((o) => crowd.some((n) => wishFor(w, n, o.kind)));
  return mood.length ? rng.weighted(mood, (o) => Math.max(0.05, o.w)).kind : null;
}

export interface Moved {
  kind: NpcGoalKind;
  /** Everyone the speech moved. */
  count: number;
  /** How many of them carry the goal themselves; the rest follow one of those. */
  lead: number;
  of: number;
  names: string[];
  deed: string;
}

/** How many of the people she moves are actually simulated, carrying the goal about. The rest follow one of them. */
export const MAX_LEADERS = 6;

/** What only works if they are with her. */
const PRESENCE = new Set<NpcGoalKind>(['back_me_up', 'give_cash', 'cover']);

/**
 * Start a speech. It lasts `minutes` of world time, and everyone in earshot gets a say; after that, anyone who comes by
 * while it lasts is rolled for too (`speechTick`).
 *
 * The real win of a speech is a goal in the head of everyone listening. She picks the cry (what she wants done, or what she
 * fancies) and each person weighs it the way they would a one-to-one ask: how big it is, how it sits with who they are, how they
 * feel about her. A crowd carries itself, so the more of them there are the likelier each is to go along. People on the next
 * streets, if her voice reaches them, are less likely to be swept up.
 *
 * She can move any number of them. Only the keenest `MAX_LEADERS` are simulated, with the goal in their heads; everyone else
 * she moves falls in behind one of those, and just makes that person stronger while they do it (`withAssist`). So fifty people
 * is a very different thing from eight, without fifty people to run.
 */
export function moveCrowd(c: Ctx, o: { depth: number; stretch: number; edge: number; remote?: number; minutes?: number }): Moved | null {
  const { w } = c;
  const sp: Speech = {
    loc: w.hero.locationId, until: w.clock + (o.minutes ?? STUMP_MINUTES), heard: [], leaders: [], depth: o.depth,
    remote: o.remote ?? 0.55, stretch: o.stretch, edge: o.edge, moved: 0,
    beat: w.beat, began: w.clock, dry: 0, last: 0, stages: 1,
  };
  w.speech = sp;
  const crowd = audience(w, o.depth).sort((a, b) => b.affinity - a.affinity);
  if (!crowd.length) return null;
  return pull(c, sp, crowd, 1);
}

/** Roll these people for the speech she is giving, and sweep up the ones who go along. */
function pull(c: Ctx, sp: Speech, people: Npc[], drift: number): Moved | null {
  const { w, rng } = c;
  const h = w.hero;
  if (!people.length) return null;
  const kind = (sp.cry ??= pickCry(c, people) ?? undefined);
  if (!kind) {
    for (const n of people) sp.heard.push(n.id);
    return null;
  }
  const voice = synergy(h, ['speaking', ['stat:charm', 0.6]]);
  const swell = Math.min(0.25, 0.06 * Math.log2(1 + people.length + sp.moved));
  const willing: { n: Npc; wish: Wish; p: number }[] = [];
  for (const n of people) {
    sp.heard.push(n.id);
    const wish = wishFor(w, n, kind);
    if (!wish) continue;
    ensureDeep(w, n);
    cool(w, `influence:${n.id}:${kind}`, 35);
    const far = n.locationId !== sp.loc ? sp.remote : 1;
    const p = clamp((oddsWith(w, n, wish, 'persuasion', voice) + swell + sp.edge) * far * drift, 0.03, 0.95);
    if (rng.chance(p)) willing.push({ n, wish, p });
  }
  if (!willing.length) return { kind, count: 0, lead: 0, of: people.length, names: [], deed: '' };
  // The keenest take the lead while there are places to lead from; everyone else falls in behind whoever has the fewest.
  willing.sort((a, b) => b.p - a.p);
  const leading = (): Npc[] => sp.leaders.map((id) => w.npcs[id]).filter((l): l is Npc => !!l && l.alive && !!goalOf(l, kind));
  let lead = 0;
  let first: Wish | undefined;
  for (const { n, wish } of willing) {
    const active = leading();
    if (active.length < MAX_LEADERS) {
      addGoal(c, n, wish, 'persuasion', sp.stretch);
      sp.leaders.push(n.id);
      lead++;
      first ??= wish;
      // Some things only count if they are there.
      if (PRESENCE.has(kind) && n.locationId !== h.locationId) moveNpc(w, n, h.locationId);
    } else {
      const goals = active.map((l) => goalOf(l, kind)!);
      const goal = goals.reduce((a, b) => ((b.followers?.length ?? 0) < (a.followers?.length ?? 0) ? b : a));
      (goal.followers ??= []).push(n.id);
      first ??= wish;
    }
    n.affinity += 2;
    remember(n, 'was swept up by a speech of Blackbird\'s');
  }
  sp.moved += willing.length;
  w.counters['cal.crowd_best'] = Math.max(w.counters['cal.crowd_best'] ?? 0, sp.moved);
  const deed = kind === 'give_cash' ? 'passing the hat' : phrasing(w, first!).deed;
  return { kind, count: willing.length, lead, of: people.length, names: willing.map((x) => x.n.name), deed };
}

/**
 * Once a beat: is the speech over? It ends at its time limit on the world clock, when she leaves, or when she does something
 * other than keep it going.
 */
export function speechTick(c: Ctx): void {
  const { w } = c;
  const sp = w.speech;
  if (!sp) return;
  if (w.clock >= sp.until || w.hero.locationId !== sp.loc || w.hero.hp <= 0 || w.beat - sp.beat > 1) delete w.speech;
}

/**
 * One more stage of a speech: she works the crowd, and whoever has come into earshot since (people drift through a street) is
 * rolled for, the same as the ones who were there from the start.
 */
function keepSpeaking(c: Ctx): void {
  const { w } = c;
  const sp = w.speech;
  if (!sp) return;
  sp.beat = w.beat;
  sp.stages++;
  const heard = new Set(sp.heard);
  const fresh = audience(w, sp.depth).filter((n) => !heard.has(n.id));
  const moved = pull(c, sp, fresh, DRIFT_PULL);
  const n = moved?.count ?? 0;
  sp.last = n;
  sp.dry = n ? 0 : sp.dry + 1;
  train(c, 'speaking', 0.5 + Math.min(Math.round(Math.sqrt(n)), 2));
  if (n) {
    fameFrom(c, 0.15 * Math.sqrt(n), 'stump_speech');
    c.emit('speech_joins', 'good', { variant: 'drift', ...crowdData(moved), total: sp.moved });
  } else {
    c.emit('speech_steady', 'mixed', { variant: fresh.length ? 'cool' : 'empty', total: sp.moved });
  }
}

/** She has said what she came to say. */
function wrapUp(c: Ctx): void {
  const { w } = c;
  const sp = w.speech;
  if (!sp) return;
  delete w.speech;
  c.emit('speech_wrap', sp.moved ? 'good' : 'mixed', { variant: sp.moved ? 'moved' : 'quiet', total: sp.moved, lead: Math.min(sp.moved, MAX_LEADERS), stages: sp.stages });
}

const crowdData = (m: Moved | null): Record<string, string | number> => (m?.count ? { count: m.count, lead: m.lead, rest: m.count - m.lead, of: m.of, deed: m.deed, who: m.names.slice(0, 2).join(' and '), kind: m.kind } : {});
