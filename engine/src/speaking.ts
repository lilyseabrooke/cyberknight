import type { Ctx, Hero, Npc, World } from './types';
import { addHeat, gainXp, here, remember } from './combat';
import { clamp, type Candidate } from './candidate';
import { odds, skillLevel, synergy, train } from './skills';
import { fameFrom } from './stage';
import { sleepOf } from './needs';

/**
 * Speaking: public speeches, rousing ones. Three ways to use it.
 * - On a soapbox in the street: nothing but a bit of fame (for now).
 * - To her companions: if it lands they fight harder for a while and like her more.
 * - To the mirror: nothing happens, except that she gets a little better and thinks very well of herself.
 */
const ODDS = {
  stump: (h: Hero) => odds(0.2, 0.065, synergy(h, ['speaking', ['streetwise', 0.3], ['stat:charm', 0.6]])),
  rally: (h: Hero) => odds(0.3, 0.07, synergy(h, ['speaking', ['stat:charm', 0.6], ['stat:int', 0.2]])),
};

/** Talking a crowd round, from a billboard, on a good day. */
const billboardOdds = (h: Hero): number => odds(0.35, 0.07, synergy(h, ['speaking', ['streetwise', 0.3], ['stat:charm', 0.6]]));
/** How good she has to be before she grabs the mic when she has hijacked a billboard. */
export const BILLBOARD_SPEECH_LEVEL = 12;

/** Skills run 0 to 100 (levels 1, 3, 5, 8, 12... are the milestones). Past this level her speeches read as polished. */
const POLISHED = 8;

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
    out.push({ key: 'stump_speech', drives: { pride: 0.6, curiosity: 0.3, bravery: 0.3 }, bonus: Math.min(lvl, 30) * 0.01, risk: 0.15, intent: {}, run: stumpSpeech });
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
    fameFrom(c, 1.2, 'stump_speech');
    for (const k of here(w)) if (k.archetype === 'street_kid') k.affinity += 4;
    train(c, 'speaking', 2);
    c.emit('stump_speech', 'good', { variant: 'rousing', level: skillLevel(h, 'speaking') });
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
  if (!live.length || lvl < 1 || live.some((f) => f.tags.some((t) => ['robot', 'dragon', 'pet'].includes(t)))) return false;
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
    const gain = fameFrom(c, 3, 'stump_speech');
    for (const k of here(w)) if (k.archetype === 'street_kid') k.affinity += 8;
    addHeat(w, 'atlas', 1);
    train(c, 'speaking', 4);
    gainXp(c, 8);
    c.emit('billboard_speech', 'good', { variant: 'speech', fame: Math.round(gain * 10) / 10, level: skillLevel(h, 'speaking') });
  } else {
    h.fame = Math.max(0, h.fame - 0.5);
    train(c, 'speaking', 1);
    c.emit('billboard_speech', 'bad', { variant: 'flop' });
  }
}
