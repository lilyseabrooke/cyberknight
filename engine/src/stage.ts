import type { Ctx, Hero, Location, Npc, World } from './types';
import { gainXp, here, relocate, addHeat } from './combat';
import { clamp, type Candidate } from './candidate';
import { odds, skillLevel, synergy, train } from './skills';
import { kindle } from './romance';
import { fireOf } from './callings';
import { SKILLS } from './content/skills';
import { isFairGame } from './people';
import { bondEvent, romanceMod } from './bonds';
import { BASE_MIN_PER_BEAT } from './clock';

/**
 * Performing. Two things keep her from singing in one spot forever, and one thing makes a good night run away with her.
 *
 * Fatigue: every act wears the crowd out a bit, for that skill and, less, for the others, and it comes back slowly with time.
 * A crowd that has heard enough of her pays less fame and less in tips. A different venue, a different act, or a bigger stage is better.
 *
 * Passion: a big success with a skill, or a level in it, can light her up. For a while she wants more of that kind of thing:
 * every act that uses the skill appeals to her, a fame goal turns into a calling, and each good showing feeds it.
 */

/** Which skill each act is built on. */
export const ACT_SKILL: Record<string, string> = {
  karaoke: 'vocals', sing_busk: 'vocals', crash_gig: 'vocals', serenade_girl: 'vocals',
  jam: 'guitar', gig: 'guitar', busk: 'guitar', guitar_duel: 'guitar',
  dj_set: 'djing', backlot_set: 'djing',
  beatbox: 'beatbox', beat_battle: 'beatbox',
  graffiti: 'art',
  stump_speech: 'speaking',
};

const FATIGUE_PER_ACT = 0.22;
/** How much of a crowd's fatigue wears off per world minute. */
const RECOVERY = 0.004 / BASE_MIN_PER_BEAT;
/** How much of a room's wariness (of one kind of hustle) fades per world minute. */
const WARY_FADE = 0.003 / BASE_MIN_PER_BEAT;

/** Bigger stages are worth more. */
export const prestige = (loc: Location): number => (loc.kind === 'club' ? 1.5 : loc.kind === 'bar' ? 1.0 : loc.kind === 'gym' ? (loc.gymRoom?.room === 'pit' ? 1.3 : 0.9) : loc.kind === 'pawn' ? 0.7 : loc.kind === 'chop' ? 0.5 : loc.kind === 'hub' ? 0.6 : 0.8);

/** 1 for a crowd that hasn't heard her yet, falling towards 0 as it wears out. */
export function freshness(w: World, locId: string, skill: string): number {
  const f = w.locations[locId]?.fatigue;
  if (!f) return 1;
  let tired = f[skill] ?? 0;
  for (const [k, v] of Object.entries(f)) if (k !== skill) tired += 0.25 * v;
  return 1 / (1 + 2.2 * tired);
}

/** `minutes` is the world time since the last tick; one ordinary beat if nobody says. */
export function tickVenues(w: World, minutes: number = BASE_MIN_PER_BEAT): void {
  for (const loc of Object.values(w.locations)) {
    if (loc.wary) {
      for (const k of Object.keys(loc.wary)) {
        loc.wary[k] = Math.max(0, loc.wary[k]! - WARY_FADE * minutes);
        if (loc.wary[k]! < 1e-9) delete loc.wary[k];
      }
      if (!Object.keys(loc.wary).length) delete loc.wary;
    }
    if (!loc.fatigue) continue;
    for (const k of Object.keys(loc.fatigue)) {
      loc.fatigue[k] = Math.max(0, loc.fatigue[k]! - RECOVERY * minutes);
      if (loc.fatigue[k]! < 1e-9) delete loc.fatigue[k];
    }
    if (!Object.keys(loc.fatigue).length) delete loc.fatigue;
  }
}

/** What her tips are worth to a crowd this tired. */
export const tipScale = (w: World, act: string): number => {
  const skill = ACT_SKILL[act];
  return skill ? 0.5 + 0.5 * freshness(w, w.hero.locationId, skill) : 1;
};

/**
 * Fame from an act: scaled by the stage, by how fresh the crowd is, and a little by the fire in her belly.
 * Wears the crowd out. Returns what she gained.
 */
export function fameFrom(c: Ctx, base: number, act: string): number {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const skill = ACT_SKILL[act];
  if (!skill) {
    h.fame += base;
    return base;
  }
  const fresh = freshness(w, loc.id, skill);
  const fire = 1 + 0.15 * fireOf(w, skill);
  const gain = base * prestige(loc) * fresh * fire;
  h.fame += gain;
  const f = (loc.fatigue ??= {});
  f[skill] = (f[skill] ?? 0) + FATIGUE_PER_ACT + 0.04 * base;
  if (fresh < 0.5 && w.beat - (w.counters.tired_msg ?? -99) >= 12 && rng.chance(0.7)) {
    w.counters.tired_msg = w.beat;
    c.emit('crowd_tired', 'mixed', { place: loc.name, act, skill: SKILLS[skill as keyof typeof SKILLS]?.label ?? skill, fresh: Math.round(fresh * 100) });
  }
  return gain;
}

/**
 * How much she wants to do this act right now, on top of everything else: drawn to it by a calling, put off by a crowd
 * that has heard enough (a sharper head notices sooner).
 */
export function passionBias(w: World, cand: { key: string }): number {
  const skill = ACT_SKILL[cand.key.split(':')[0]!];
  if (!skill) return 0;
  const draw = 2.2 * fireOf(w, skill);
  const weary = 3.5 * (1 - freshness(w, w.hero.locationId, skill)) * (0.6 + 0.6 * w.hero.competence);
  return draw - weary;
}

// ===================================================================== things to do with a voice, a guitar, a deck

const ODDS = {
  singBusk: (h: Hero) => odds(0.2, 0.065, synergy(h, ['vocals', ['music', 0.4], ['stat:charm', 0.5]])),
  crash: (h: Hero) => odds(0.1, 0.06, synergy(h, ['vocals', ['music', 0.5], ['stat:charm', 0.6]])),
  serenadeGirl: (h: Hero) => odds(0.2, 0.06, synergy(h, ['vocals', 'romance', ['stat:charm', 0.5]])),
  duel: (h: Hero) => odds(0.12, 0.07, synergy(h, ['guitar', ['music', 0.6], ['stat:reflex', 0.3]])),
  backlot: (h: Hero) => odds(0.28, 0.06, synergy(h, ['djing', ['music', 0.5], ['tinkering', 0.3]])),
  battle: (h: Hero) => odds(0.12, 0.065, synergy(h, ['beatbox', ['vocals', 0.3], ['stat:charm', 0.4]])),
};

const talkable = (n: Npc): boolean => n.alive && !n.hostile;

export function stageCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = here(w).filter(talkable);
  const vocals = skillLevel(h, 'vocals');

  // ---- a voice in the street, no instrument needed
  if (loc.outdoors && !['overpass', 'halo_roof'].includes(loc.id)) {
    out.push({ key: 'sing_busk', drives: { pride: 0.6, greed: 0.4, curiosity: 0.3 }, bonus: vocals * 0.03, risk: 0.15, intent: {}, run: singBusk });
  }

  // ---- get up with whoever is playing
  const hosts = crowd.filter((n) => (n.tags.includes('band') || n.id === 'kilobyte') && ['neon_pharaoh', 'club_greenroom'].includes(loc.id) && n.affinity < 45);
  for (const n of hosts) {
    out.push({ key: `crash_gig:${n.id}`, drives: { pride: 0.9, curiosity: 0.5, bravery: 0.4 }, bonus: vocals * 0.03, risk: 0.5 + (n.affinity < 0 ? 0.5 : 0), run: (c) => crashGig(c, n) });
  }

  // ---- sing to someone
  for (const n of crowd.filter((x) => isFairGame(x) && x.affinity >= -5 && x.affinity < 40)) {
    out.push({ key: `serenade_girl:${n.id}`, drives: { lust: 0.6, pride: 0.5, curiosity: 0.2 }, bonus: vocals * 0.03, risk: 0.2, intent: { npc: n.name }, run: (c) => serenadeGirl(c, n) });
  }

  // ---- out-play the band
  const hasAxe = h.inventory.some((i) => i.tags.includes('instrument')) || w.features.guitar?.locationId === h.locationId;
  if (hasAxe) {
    for (const n of crowd.filter((x) => x.tags.includes('band') && x.affinity > -10 && x.affinity < 40)) {
      out.push({ key: `guitar_duel:${n.id}`, drives: { pride: 1.0, bravery: 0.4, curiosity: 0.3 }, bonus: skillLevel(h, 'guitar') * 0.03, risk: 0.4, run: (c) => guitarDuel(c, n) });
    }
  }

  // ---- play the lot behind the club for the kids
  if (loc.id === 'club_backlot' && crowd.some((n) => n.archetype === 'street_kid')) {
    out.push({ key: 'backlot_set', drives: { pride: 0.7, curiosity: 0.4 }, bonus: skillLevel(h, 'djing') * 0.03, risk: 0.2, run: backlotSet });
  }

  // ---- beat battle
  for (const n of crowd.filter((x) => x.tags.includes('rowdy') && x.affinity > -20 && x.affinity < 22)) {
    out.push({ key: `beat_battle:${n.id}`, drives: { pride: 0.8, bravery: 0.3, curiosity: 0.3 }, bonus: skillLevel(h, 'beatbox') * 0.03, risk: 0.3, intent: { npc: n.name }, run: (c) => beatBattle(c, n) });
  }
  return out;
}

function singBusk(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const roll = rng.next();
  const p = ODDS.singBusk(h);
  if (roll < p) {
    const tips = Math.round(rng.int(10, 45) * tipScale(w, 'sing_busk'));
    h.cash += tips;
    fameFrom(c, 1, 'sing_busk');
    for (const k of here(w)) if (k.archetype === 'street_kid') k.affinity += 6;
    train(c, 'vocals', 2);
    c.emit('sing_busk', 'good', { variant: 'tips', amount: tips });
  } else if (rng.chance(0.3)) {
    addHeat(w, 'npd', 1);
    train(c, 'vocals', 1);
    c.emit('sing_busk', 'bad', { variant: 'complaint' });
  } else if (rng.chance(0.4)) {
    h.hp -= 2;
    train(c, 'vocals', 1);
    c.emit('sing_busk', 'bad', { variant: 'heckled' });
  } else {
    train(c, 'vocals', 1);
    c.emit('sing_busk', 'mixed', { variant: 'ignored' });
  }
}

function crashGig(c: Ctx, host: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const p = clamp(ODDS.crash(h) + host.affinity / 200, 0.04, 0.85);
  if (rng.chance(p)) {
    const tips = Math.round(rng.int(30, 110) * tipScale(w, 'crash_gig'));
    h.cash += tips;
    fameFrom(c, 3, 'crash_gig');
    host.affinity += 8;
    train(c, 'vocals', 3);
    train(c, 'music', 1);
    gainXp(c, 8);
    c.emit('crash_gig', 'good', { variant: 'stole_the_show', npc: host.name, amount: tips });
  } else if (host.affinity < 5 || rng.chance(0.5)) {
    host.affinity -= 8;
    h.hp -= 3;
    train(c, 'vocals', 1);
    relocate(w, loc.tossTo);
    c.emit('crash_gig', 'bad', { variant: 'tossed', npc: host.name, to: w.locations[loc.tossTo]?.name ?? 'the street' });
  } else {
    host.affinity -= 2;
    train(c, 'vocals', 1);
    c.emit('crash_gig', 'bad', { variant: 'flop', npc: host.name });
  }
}

function serenadeGirl(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  if (rng.chance(clamp(ODDS.serenadeGirl(h) + n.affinity / 300 + romanceMod(w, n) * 0.5, 0.03, 0.9))) {
    n.affinity += rng.int(8, 16);
    fameFrom(c, 0.8, 'serenade_girl');
    kindle(h, 0.03);
    train(c, 'vocals', 2);
    train(c, 'romance', 1);
    c.emit('serenade_girl', 'good', { variant: 'swoon', npc: n.name, affinity: n.affinity });
    bondEvent(c, n, 'date');
  } else {
    n.affinity -= 3;
    train(c, 'vocals', 1);
    c.emit('serenade_girl', 'bad', { variant: 'cringe', npc: n.name });
  }
}

function guitarDuel(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const band = here(w).filter((x) => x.tags.includes('band'));
  const p = clamp(ODDS.duel(h) - Math.max(0, n.level - 3) * 0.03, 0.04, 0.85);
  if (rng.chance(p)) {
    fameFrom(c, 2.2, 'guitar_duel');
    n.affinity += 10;
    for (const b of band) if (b !== n) b.affinity += 4;
    train(c, 'guitar', 3);
    train(c, 'music', 1);
    gainXp(c, 8);
    c.emit('guitar_duel', 'good', { variant: 'won', npc: n.name });
  } else {
    n.affinity -= 6;
    h.fame = Math.max(0, h.fame - 0.5);
    train(c, 'guitar', 1);
    c.emit('guitar_duel', 'bad', { variant: 'lost', npc: n.name });
  }
}

function backlotSet(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  if (rng.chance(ODDS.backlot(h))) {
    const tips = Math.round(rng.int(5, 35) * tipScale(w, 'backlot_set'));
    h.cash += tips;
    fameFrom(c, 1.3, 'backlot_set');
    for (const k of here(w)) if (k.archetype === 'street_kid') k.affinity += 6;
    train(c, 'djing', 2);
    c.emit('backlot_set', 'good', { variant: 'rave', amount: tips });
  } else {
    train(c, 'djing', 1);
    c.emit('backlot_set', 'mixed', { variant: 'dead_speaker' });
  }
}

function beatBattle(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  if (rng.chance(ODDS.battle(h))) {
    fameFrom(c, 1.4, 'beat_battle');
    n.affinity += 6;
    for (const x of here(w)) if (!x.hostile && x !== n) x.affinity += 2;
    train(c, 'beatbox', 3);
    train(c, 'vocals', 1);
    c.emit('beat_battle', 'good', { variant: 'won', npc: n.name });
  } else {
    n.affinity -= 5;
    h.hp -= 2;
    train(c, 'beatbox', 1);
    c.emit('beat_battle', 'bad', { variant: 'lost', npc: n.name });
  }
}
