import type { Ctx, Hero, World } from './types';
import { addHeat, here } from './combat';
import { type Candidate } from './candidate';
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
    out.push({ key: 'stump_speech', drives: { pride: 0.6, curiosity: 0.3, bravery: 0.3 }, bonus: lvl * 0.03, risk: 0.15, intent: {}, run: stumpSpeech });
  }

  // ---- the troops
  const crew = h.companions.filter((a) => a.hp > 0);
  if (crew.length) {
    out.push({ key: 'rally_allies', drives: { pride: 0.5, curiosity: 0.2, bravery: 0.2 }, bonus: 0.15 + lvl * 0.02 - 0.2 * worn(w, 'rally'), intent: {}, run: rallyAllies });
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
  c.emit('mirror_speech', 'good', { variant: skillLevel(h, 'speaking') >= 3 ? 'orator' : 'rough' });
}
