import type { Awareness, Ctx, Id, Npc, World } from './types';
import type { Candidate } from './candidate';
import { clamp } from './candidate';
import { everyoneAt, npcsAt } from './population';
import { hasAlly } from './companions';
import { nerve } from './character';
import { skillOf, statsOf } from './npcstats';
import { hasImplantFlag, skillLevel, skillValue, train } from './skills';
import { knowsTechnique } from './techniques';
import { workingCameras } from './witness';
import { covering } from './influence';
import { camerasSeeHer, seesHer } from './placeboard';

/**
 * Stealth. While Blackbird sneaks, everyone who could notice her (a person, a drone, a dog, a camera) carries an
 * awareness of her from 0 to 1 that climbs while she's in view and falls when she isn't. Four buckets:
 *
 *   Unaware     0 to .25  no idea she is there
 *   Suspicious  .25 to .5 something is wrong
 *   Alert       .5 up     knows she is here somewhere, not where
 *   Aware       .75 up    and knows where (they have a fix)
 *
 * Whoever loses her drops to Alert, stays there for a while (they search), then slowly forgets. Out of stealth nobody
 * is tracked: everyone in the room is simply Aware. Going into stealth with people already looking is a contest with
 * cover (see `coverAt`): none and they stay Aware, total and they all drop to Alert, otherwise it is her stealth against
 * each one's perception.
 *
 * Calling for help is an ordinary thing someone can choose to do, weighed like everything else (`callWeight`), and Hush
 * (a Hack) takes it away for a while.
 */

export type Bucket = 'unaware' | 'suspicious' | 'alert' | 'aware';

/** Awareness at which each bucket begins. */
export const V = { suspicious: 0.25, alert: 0.5, aware: 0.75 } as const;
/** What a person drops to when they lose her. */
const ALERT_V = 0.6;
/** How long they stay at least Alert once they've lost her, in beats; after that awareness fades by `FADE` a beat. */
const SEARCH_BEATS = 12;
const FADE = 0.03;
/** Awareness gained in a beat by someone of average perception looking at someone with no cover and no skill. */
const BASE_GAIN = 0.16;

const RANK: Record<Bucket, number> = { unaware: 0, suspicious: 1, alert: 2, aware: 3 };
export const atLeast = (b: Bucket, floor: Bucket): boolean => RANK[b] >= RANK[floor];

export const isSneaking = (w: World): boolean => !!w.hero.stealth;

// ------------------------------------------------------------------ who can notice

/** Anyone who could notice her: not her own company, not a pet. */
export const canObserve = (w: World, n: Npc): boolean => n.alive && n.archetype !== 'puppy' && !w.hero.companions.some((a) => a.npcId === n.id);

/** Everyone in the room who could be watching, including a dungeon's garrison, who are there before they have noticed her. */
const observersAt = (w: World, loc: Id): Npc[] => everyoneAt(w, loc).filter((n) => n.alive && n.downUntil <= w.clock && canObserve(w, n));

export function awareness(w: World, n: Npc): Awareness {
  if (!n.aware) {
    n.aware = { v: 0, fix: false, floorUntil: 0 };
    (w.watchers ??= []).push(n.id);
  }
  return n.aware;
}

/** Where somebody stands with her right now. Out of stealth, anyone in the room is Aware. */
export function bucketOf(w: World, n: Npc): Bucket {
  if (n.hostile) return 'aware';
  // Out of stealth, everyone who can see her has her. (Somebody round a corner or behind a wall doesn't, whatever room it is.)
  if (!w.hero.stealth && n.locationId === w.hero.locationId && seesHer(w, n)) return 'aware';
  const a = n.aware;
  if (!a) return 'unaware';
  if (a.v >= V.aware && a.fix) return 'aware';
  if (a.v >= V.alert) return 'alert';
  if (a.v >= V.suspicious) return 'suspicious';
  return 'unaware';
}

// ------------------------------------------------------------------ skills

/** Her and their skill at not being seen, and at seeing. Same shape for both, so they can be set against each other. */
export const heroStealth = (w: World): number => 1 + 0.7 * skillValue(w.hero, 'sneak') + 0.5 * w.hero.reflex;
export const heroPerception = (w: World): number => 1 + 0.7 * skillValue(w.hero, 'perception') + 0.5 * w.hero.reflex;
export function npcPerception(n: Npc): number {
  const sharp = n.tags.includes('robot') ? 3 : 0; // sensors
  return 1 + 0.7 * skillOf(n, 'perception') + 0.5 * statsOf(n).reflex + sharp;
}
/** How much faster than average this one notices things. */
export const keenness = (n: Npc): number => clamp(npcPerception(n) / 5, 0.4, 2.2);

// ------------------------------------------------------------------ cover and profile

/** How much there is to hide behind here, 0..1: the place itself, the crowd, the dark, the weather, a distraction. */
export function coverAt(w: World, locId: Id): number {
  const loc = w.locations[locId];
  if (!loc) return 0;
  let cv = loc.cover ?? 0.1;
  if (loc.crowded) cv += 0.3;
  if (w.flags.blackout) cv += 0.35;
  if (w.situation.weather === 'neon_fog') cv += 0.25;
  if (hasAlly(w, 'distract')) cv += 0.15;
  return clamp(cv, 0, 1);
}

/** How noticeable she is right now: 1 is a plain person with no skill and nothing to hide behind. */
export function profile(w: World): number {
  const h = w.hero;
  let p = 1 - 0.05 * Math.min(10, skillLevel(h, 'sneak'));
  p *= 1 - 0.55 * coverAt(w, h.locationId);
  if (hasImplantFlag(h, 'glow')) p *= 1.3;
  if (h.vehicle) p *= 1.3;
  return clamp(p, 0.1, 1.6);
}

// ------------------------------------------------------------------ entering and leaving stealth

/** Her stealth against what each of them can see, under this much cover. */
const hides = (c: Ctx, n: Npc, cover: number): boolean => {
  if (cover >= 0.95) return true;
  if (cover < 0.05) return false;
  return c.rng.chance(clamp(cover * 0.9 + 0.06 * (heroStealth(c.w) - npcPerception(n)), 0.05, 0.95));
};

/** They had her and now they don't: Alert, and they look for a while. */
export function lose(w: World, n: Npc): void {
  const a = awareness(w, n);
  a.v = Math.min(Math.max(a.v, V.alert), ALERT_V);
  a.fix = false;
  a.floorUntil = w.beat + SEARCH_BEATS;
  a.calledSince = false;
}

/**
 * Roll to slip out of sight of everyone here who is watching: under no cover nobody loses her, under full cover everyone does.
 * Returns how many dropped to Alert.
 */
export function slip(c: Ctx): number {
  const { w } = c;
  const h = w.hero;
  const cover = coverAt(w, h.locationId);
  let dropped = 0;
  for (const n of observersAt(w, h.locationId)) {
    const a = awareness(w, n);
    if (bucketOf(w, n) !== 'aware' || !hides(c, n, cover)) continue;
    lose(w, n);
    a.seenAt = h.locationId;
    dropped++;
  }
  const loc = w.locations[h.locationId];
  if (loc && (loc.camAware ?? 1) >= V.aware && workingCameras(w, loc.id) > 0 && cover >= 0.5 && c.rng.chance(cover)) loc.camAware = ALERT_V;
  return dropped;
}

export function enterStealth(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  if (h.stealth) return;
  // Until now everyone who could see her has had her in plain sight; the ones who couldn't haven't known she was there.
  const watching = observersAt(w, h.locationId).filter((n) => seesHer(w, n));
  for (const n of watching) {
    const a = awareness(w, n);
    a.v = 1;
    a.fix = true;
    a.seenAt = h.locationId;
  }
  const loc = w.locations[h.locationId]!;
  if (camerasSeeHer(w)) loc.camAware = 1;
  h.stealth = true;
  const dropped = slip(c);
  const cover = coverAt(w, h.locationId);
  c.emit('stealth', 'mixed', { variant: 'enter', place: loc.name, cover: cover >= 0.7 ? 'plenty' : cover >= 0.3 ? 'some' : 'none', watching: watching.length, dropped, left: watching.length - dropped });
}

export function exitStealth(c: Ctx, why: 'step' | 'noisy' = 'step'): void {
  const { w } = c;
  const h = w.hero;
  if (!h.stealth) return;
  h.stealth = false;
  for (const n of observersAt(w, h.locationId).filter((x) => seesHer(w, x))) {
    const a = awareness(w, n);
    a.v = 1;
    a.fix = true;
    a.seenAt = h.locationId;
  }
  const loc = w.locations[h.locationId];
  if (loc && camerasSeeHer(w)) loc.camAware = 1;
  c.emit('stealth', 'mixed', { variant: why === 'noisy' ? 'blown' : 'exit', place: loc?.name ?? '' });
}

/** She walked out: whoever had her, hasn't. */
export function loseContact(w: World, from: Id): void {
  for (const id of w.watchers ?? []) {
    const n = w.npcs[id];
    if (n?.aware?.fix && n.locationId === from) lose(w, n);
  }
  const loc = w.locations[from];
  if (loc && (loc.camAware ?? 0) >= V.aware) loc.camAware = ALERT_V;
}

// ------------------------------------------------------------------ the beat

const WORDS: Partial<Record<Bucket, string>> = { suspicious: 'suspicious', alert: 'alert', aware: 'aware' };

/** Without a fix, awareness holds as an Alert while they search, then fades. */
function fade(w: World, a: Awareness): void {
  if (a.fix) return;
  if (w.beat < a.floorUntil) a.v = Math.max(a.v, V.alert);
  else a.v = Math.max(0, a.v - FADE);
}

/** Awareness climbs for everyone who can see her and falls for everyone who can't. */
export function tickStealth(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId];
  const prof = profile(w);
  let told = 0;

  if (h.stealth) {
    for (const n of observersAt(w, h.locationId)) {
      const a = awareness(w, n);
      const before = bucketOf(w, n);
      if (n.hostile) {
        a.v = 1;
        a.fix = true;
        a.seenAt = h.locationId;
        continue;
      }
      // Somebody she has talked into looking the other way doesn't.
      if (covering(w, n)) {
        a.v = 0;
        a.fix = false;
        continue;
      }
      // Nobody gets any of her from where they cannot see her, and anyone who had her has lost her.
      if (!seesHer(w, n, { ranged: true })) {
        if (a.fix) lose(w, n);
        fade(w, a);
        continue;
      }
      a.v = Math.min(1, a.v + BASE_GAIN * prof * keenness(n) * (0.7 + 0.6 * rng.next()));
      if (a.v >= V.aware) {
        a.fix = true;
        a.seenAt = h.locationId;
      }
      const now = bucketOf(w, n);
      // She only picks up on the small shifts if she is paying attention.
      if (now !== before && RANK[now] > RANK[before] && told < 2 && (now !== 'suspicious' || heroPerception(w) >= 4)) {
        told++;
        train(c, 'perception', 1); // reading a room is how she gets better at it
        c.emit('stealth_notice', now === 'aware' ? 'bad' : 'mixed', { variant: WORDS[now]!, npc: n.name, role: n.role });
      }
    }
    // Staying out of sight of people who would care is practice.
    const watched = observersAt(w, h.locationId).filter((n) => !n.hostile);
    if (watched.length && w.beat % 4 === 0 && !watched.some((n) => bucketOf(w, n) === 'aware')) train(c, 'sneak', 1);
    if (loc && workingCameras(w, loc.id) > 0) {
      const before = loc.camAware ?? 0;
      // Only a camera that is looking her way gets any of her.
      if (camerasSeeHer(w)) {
        loc.camAware = Math.min(1, before + BASE_GAIN * 1.2 * prof * (0.7 + 0.6 * rng.next()));
        if (before < V.aware && loc.camAware >= V.aware) c.emit('stealth_notice', 'bad', { variant: 'camera', place: loc.name });
      } else if (before > 0) loc.camAware = Math.max(0, before - FADE);
    }
  }

  for (const id of [...(w.watchers ?? [])]) {
    const n = w.npcs[id];
    const a = n?.aware;
    if (!n || !a) {
      w.watchers = w.watchers!.filter((x) => x !== id);
      continue;
    }
    if (n.locationId === h.locationId) {
      if (h.stealth || seesHer(w, n)) continue; // handled above, or in plain view
      if (a.fix) lose(w, n);
    }
    fade(w, a);
    if (a.v <= 0 && !a.calledAt && !a.hushUntil) {
      delete n.aware;
      w.watchers = w.watchers!.filter((x) => x !== id);
    }
  }
  // Cameras forget her at the same pace once she is gone.
  for (const l of Object.values(w.locations)) {
    if (l.camAware === undefined || l.id === h.locationId) continue;
    l.camAware = Math.max(0, l.camAware - FADE);
    if (l.camAware <= 0) delete l.camAware;
  }
}

/** Whether the cameras here have her. Out of stealth, if there are any working, they do. */
export function camerasSee(w: World, locId: Id): boolean {
  if (!workingCameras(w, locId) || locId !== w.hero.locationId) return false;
  if (!w.hero.stealth) return camerasSeeHer(w);
  return (w.locations[locId]?.camAware ?? 0) >= V.aware;
}

/**
 * Something she does makes a stir: everyone watching gains `amount` (scaled by how sharp they are). Returns the ones who now
 * have her. The cameras here gain too.
 */
export function stir(c: Ctx, amount: number, skip: Npc[] = []): Npc[] {
  const { w } = c;
  const h = w.hero;
  const out = glimpse(c, observersAt(w, h.locationId).filter((n) => !skip.includes(n) && seesHer(w, n, { turn: amount >= 0.5 })), amount);
  const loc = w.locations[h.locationId];
  if (loc && workingCameras(w, loc.id) > 0 && camerasSeeHer(w)) loc.camAware = Math.min(1, (loc.camAware ?? 0) + amount * 1.2 * (h.stealth ? profile(w) : 1));
  return out;
}

/** The same for particular people, wherever they are standing (a dungeon's garrison, say). Returns the ones who now have her. */
export function glimpse(c: Ctx, who: Npc[], amount: number): Npc[] {
  const { w, rng } = c;
  const h = w.hero;
  const prof = h.stealth ? profile(w) : 1;
  const out: Npc[] = [];
  for (const n of who) {
    const a = awareness(w, n);
    a.v = Math.min(1, a.v + amount * prof * keenness(n) * (0.8 + 0.4 * rng.next()));
    if (a.v >= V.aware) {
      a.fix = true;
      a.seenAt = h.locationId;
    }
    if (bucketOf(w, n) === 'aware') out.push(n);
  }
  return out;
}

// ------------------------------------------------------------------ listeners

/**
 * Loud things (gunfire, crashes, a set at full volume) carry across the district. Only the ones who listen for her
 * (dragons, anyone hunting her) hear it from far away; everyone else needs to be near. Remembered for a few beats.
 */
export function makeNoise(w: World, level: number): void {
  if (level < 0.6) return;
  const loc = w.hero.locationId;
  w.counters.noise_level = Math.max(level, w.beat - (w.counters.noise_beat ?? -99) <= 3 ? w.counters.noise_level ?? 0 : 0);
  w.counters.noise_beat = w.beat;
  for (const n of Object.values(w.npcs)) {
    if (!n.alive || n.locationId === loc || !(n.tags.includes('dragon') || w.mind.goals.some((g) => g.pursuit?.npc === n.id))) continue;
    const a = awareness(w, n);
    a.v = Math.max(a.v, V.alert);
    a.seenAt = loc;
    a.floorUntil = w.beat + SEARCH_BEATS;
  }
}

/** How much a loud thing a few beats ago raises the odds that something listening notices her now. */
export const noiseBoost = (w: World): number => (w.beat - (w.counters.noise_beat ?? -99) <= 3 ? 0.4 * (w.counters.noise_level ?? 0) : 0);

// ------------------------------------------------------------------ calling for help

export type Channel = 'shout' | 'comm' | 'optics';

/** What someone has to call with: a shout, a communicator, or (the heavily chromed) optics that show everyone what they see. */
export function channelOf(n: Npc): Channel {
  if (n.tags.includes('robot') || (n.tags.includes('augmented') && n.tags.some((t) => ['security', 'cop', 'commander'].includes(t)) && n.level >= 5)) return 'optics';
  if (n.tags.some((t) => ['cop', 'security', 'commander', 'corp', 'fixer', 'hacker'].includes(t)) || n.archetype === 'npd_officer') return 'comm';
  return 'shout';
}

const hushed = (w: World, n: Npc): boolean => !!n.aware?.hushUntil && w.beat < n.aware.hushUntil;

/** What they can actually call with right now: Hush takes the link away (leaving a shout), a Silence takes the shout too. */
export function channelNow(w: World, n: Npc): Channel | null {
  if (hushed(w, n)) return n.aware!.silenced ? null : 'shout';
  return channelOf(n);
}

/** Who a call from here would reach. */
function listeners(w: World, n: Npc, ch: Channel): Npc[] {
  const loc = n.locationId;
  const mates = (x: Npc): boolean => x !== n && x.alive && x.downUntil <= w.clock && canObserve(w, x) && !!n.faction && x.faction === n.faction;
  if (ch === 'shout') return npcsAt(w, loc).filter(mates);
  return Object.values(w.npcs).filter(mates);
}

/**
 * How much they want to call for help instead of doing something else, in the same units as the rest of what a foe weighs.
 * `threat` is how much worse off they are than she is (her strength over theirs), `present` how many of their own are already here.
 */
export function callWeight(w: World, n: Npc, threat: number, present: number): number {
  const a = n.aware;
  const ch = channelNow(w, n);
  if (!ch || n.tags.includes('dragon')) return 0;
  if (!listeners(w, n, ch).length) return 0;
  let k = n.tags.some((t) => ['cop', 'security', 'commander'].includes(t)) ? 1 : n.tags.some((t) => ['ganger', 'rowdy'].includes(t)) ? 0.7 : n.tags.includes('boss') ? 0.2 : n.tags.some((t) => ['staff', 'owner'].includes(t)) ? 0.5 : 0.35;
  k *= clamp(0.4 + threat, 0.2, 2); // outmatched people want help
  k /= 1 + 0.6 * present; // enough of them already
  k *= clamp(1.6 - nerve(w, n), 0.5, 1.4); // the timid call sooner
  if (a?.calledSince) k *= 0.1; // they already did, and nobody has lost her since
  if (ch === 'shout' && w.locations[n.locationId]?.crowded) k *= 0.6; // nobody hears it in this
  return k;
}

/** They call. Returns who was reached. */
export function callForHelp(c: Ctx, n: Npc): Npc[] {
  const { w } = c;
  const ch = channelNow(w, n);
  if (!ch) return [];
  const a = awareness(w, n);
  a.calledAt = w.beat;
  a.calledSince = true;
  const hero = w.hero.locationId;
  const heard = listeners(w, n, ch).filter((x) => !x.hostile);
  for (const x of heard) {
    const ax = awareness(w, x);
    ax.v = Math.max(ax.v, ch === 'optics' ? 1 : ALERT_V);
    ax.seenAt = hero;
    ax.fix = ch === 'optics' && x.locationId === hero;
    ax.floorUntil = Math.max(ax.floorUntil, w.beat + SEARCH_BEATS);
    ax.calledSince = false;
  }
  c.emit('call_for_help', 'bad', { variant: ch, npc: n.name, role: n.role, count: heard.length, place: w.locations[n.locationId]?.name ?? '' });
  return heard;
}

// ------------------------------------------------------------------ Hush

/** How many beats Hush holds. */
export const HUSH_BEATS = 25;

/** The Hack's effect on one target. `deep` is the very good roll that silences them entirely. */
export function hush(w: World, n: Npc, deep: boolean): void {
  const a = awareness(w, n);
  a.hushUntil = w.beat + HUSH_BEATS;
  a.silenced = deep;
}

/** Hush as she uses it out of a fight: on someone who might call. */
export function hushChance(w: World, n: Npc): number {
  const h = w.hero;
  return clamp(0.35 + h.int * 0.07 + skillValue(h, 'tinkering') * 0.03 - 0.05 * statsOf(n).int, 0.1, 0.9);
}

function doHush(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  train(c, 'tinkering', 1);
  const p = hushChance(w, n);
  const r = rng.next();
  const already = !!n.aware?.calledSince;
  if (r >= p) {
    c.emit('hush', 'bad', { variant: 'fail', npc: n.name });
    const a = awareness(w, n);
    a.v = Math.min(1, a.v + 0.2); // the chrome pings; they notice something is off
    return;
  }
  const deep = r < p * 0.25;
  hush(w, n, deep);
  c.emit('hush', 'good', { variant: already ? 'late' : deep ? 'silenced' : 'ok', npc: n.name });
}

// ------------------------------------------------------------------ what she can choose

/**
 * Stealth as things she can do: slip into it (when somebody is looking, or there is something worth doing quietly),
 * and Hush a person who might call before she goes about her business.
 */
export function stealthCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const watchers = observersAt(w, h.locationId);
  if (!h.stealth) {
    const heat = (w.heat.npd ?? 0) + (w.heat.atlas ?? 0);
    out.push({
      key: 'stealth:enter', drives: { curiosity: 0.15, bravery: -0.1 }, bonus: 0.1 + Math.min(1, heat / 6) * 0.6 + (coverAt(w, h.locationId) >= 0.5 ? 0.3 : 0), smart: 0.3,
      run: (c) => enterStealth(c),
    });
  } else if (knowsTechnique(h, 'hush')) {
    for (const n of watchers) {
      if (n.hostile || channelOf(n) === 'shout' || hushed(w, n) || bucketOf(w, n) === 'aware') continue;
      out.push({ key: `hush:${n.id}`, drives: { curiosity: 0.3, pride: 0.2 }, smart: 0.5, risk: 0.2, run: (c) => doHush(c, n) });
    }
  }
  return out;
}

export const stealthActions = new Set(['stealth', 'hush', 'go', 'pickpocket', 'challenge', 'sweep', 'raid_loot', 'camera_blackout', 'power_cut', 'alarm_spoof', 'lay_low', 'hot_wire']);

/** Before she does something: if it isn't something done quietly, she isn't sneaking any more. */
export function gate(c: Ctx, key: string): void {
  const family = key.split(':')[0]!;
  // (A job she has set out to do quietly is quiet all the way through; the goal says when that is over.)
  if (c.w.mind.goals.some((g) => g.mode === 'sneak')) return;
  if (c.w.hero.stealth && !stealthActions.has(family)) exitStealth(c);
}
