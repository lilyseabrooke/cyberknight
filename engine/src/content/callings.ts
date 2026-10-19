import type { Rng } from '../rng';
import type { Trait } from '../personality';
import type { Calling, Id, Npc, World } from '../types';
import type { GameEvent } from '../events';
import { ACT_SKILL } from '../stage';
import { skillLevel } from '../skills';
import { streetTypeOf } from '../streettypes';
import { MAX_IMPLANTS } from './implants';

/**
 * The Callings she can take up. See callings.ts for how they are caught, carried and finished, and docs/CALLINGS_PLAN.md
 * for the idea. Everything specific to one Calling lives in its entry here: the line she says it in, what sets it off,
 * how far along it is, what she does about it. Feel over balance: these lean strong, and a couple lean unhinged.
 */

export interface SparkCtx {
  w: World;
  events: GameEvent[];
  /** The family of what she just did (`beatbox`, `challenge`, ...), if she did anything. */
  fam: string;
  /** Fame she gained this beat. */
  gained: number;
  /** What the tallies went up by this beat (see TALLY). */
  d: Record<string, number>;
  /** A companion of hers died this beat. */
  lost?: GameEvent;
  /** She came within a whisker of dying this beat. `data` names who did it (`by`, `by_id`, `by_faction`, `by_dragon`), if anyone. */
  near?: GameEvent;
}

/** Whatever it was that hurt her this beat: a loss or a close call. */
export const hurt = (s: SparkCtx): GameEvent | undefined => s.lost ?? s.near;

export type Target = NonNullable<Calling['target']>;

/** A goal she might set for herself because of a Calling. goals.ts turns it into a real one. */
export type Want =
  | { kind: 'kill'; pick: (n: Npc, w: World) => boolean; why: string; mode?: 'kill' | 'beat_up' }
  | { kind: 'dragon'; why: string }
  | { kind: 'raid'; why: string }
  | { kind: 'heist'; why: string }
  | { kind: 'fame'; skill: string; why: string }
  | { kind: 'romance'; why: string }
  | { kind: 'explore'; why: string };

export interface CallingDef {
  id: string;
  /** What set it off, as a clause: how she'd put it to herself. */
  origin: string;
  group: 'spotlight' | 'violence' | 'take' | 'heart' | 'body';
  /** How she says it. */
  line(cal: Calling): string;
  /** How well it suits her: weight on (trait - 0.5), exponentiated. */
  fit: Partial<Record<Trait, number>>;
  /** How likely she is to wake up one morning with it, before her traits have their say. */
  whim: number;
  /** How vivid this moment is for this Calling, 0..1. Zero is no spark. */
  spark?(s: SparkCtx): number;
  /** It comes from a loss: if the moment was one, it counts as a wound. */
  wound?: boolean;
  /** Why, when it came out of a wound and the usual account (a name, a killer) doesn't fit. */
  woundWhy?(s: SparkCtx): string;
  /** Who or what it is about, from the moment. Whim picks one without a moment (`s` is absent). */
  aim?(w: World, rng: Rng, s?: SparkCtx, prev?: Calling): Target | null;
  /** The finish line. `u` is 0..1, how big the moment was (a wound is big). */
  goal(rng: Rng, u: number, w: World): number;
  /** The counter this Calling reads. */
  key?: string;
  /** Progress, when it isn't just the counter. */
  measure?(w: World, cal: Calling): number;
  /** Added to the score of what she's considering. Raw; scaled by fervor in callings.ts. */
  bias?(w: World, cal: Calling, fam: string, id: string | undefined): number;
  /** Places it pulls her towards. */
  pull?(w: World, cal: Calling): { loc: Id; value: number }[];
  /** Goals it makes her set for herself. */
  want?(w: World, cal: Calling): Want[];
  /** What this grows into. */
  sequels?: { id: string; p: number }[];
}

/** Something came up on a line: a catch, or any rod trick that landed. */
const isCatch = (e: GameEvent): boolean =>
  (e.type === 'fish' && ['junk', 'trinket', 'haul', 'prize', 'legend', 'ammo'].includes(String(e.data.variant))) ||
  (['reel_in', 'reel_girl', 'rod_lift', 'rod_tug', 'rod_swing'].includes(e.type) && e.outcome === 'good') ||
  (e.type === 'rod_bait' && e.data.variant === 'landed');

// ===================================================================== tallies

/** What each running tally counts, from the events of a beat. Tallied always; a Calling reads the change since it began. */
export const TALLY: Record<string, (e: GameEvent, w: World) => number> = {
  rescue: (e) => (((e.type === 'rescue' || e.type === 'talk_down') && e.outcome === 'good') ? 1 : 0),
  score: (e) => ((['safe', 'vault', 'crates', 'till', 'burgle_home', 'burgle_flat'].includes(e.type) && e.outcome === 'good') ? 1 : 0),
  ghost: (e) => (e.type === 'stealth' && e.data.variant === 'exit' ? 1 : 0),
  hack: (e) => ((e.type === 'hack' || e.type === 'billboard' || e.type === 'camera_blackout') && e.outcome === 'good' ? 1 : 0),
  kiss: (e) => (e.type === 'kiss' && e.outcome === 'good' ? 1 : 0),
  girls: (e, w) => {
    if (e.type !== 'kiss' || e.outcome !== 'good') return 0;
    const k = `cal.kissed.${e.data.npc}`;
    if (w.counters[k]) return 0;
    w.counters[k] = 1;
    return 1;
  },
  puppy: (e) => (e.type === 'steal_puppy' && e.data.variant === 'success' ? 1 : 0),
  bout: (e) => (((e.type === 'arm_wrestle' && e.data.variant === 'win') || (e.type === 'gym' && e.outcome === 'good')) ? 1 : 0),
  parkour: (e) => (e.type === 'parkour' && e.outcome === 'good' ? 1 : 0),
  hooked: (e) => (isCatch(e) ? 1 : 0),
  escape: (e) => (e.type === 'chase_end' && (e.data.variant === 'escaped' || e.data.variant === 'won') && e.data.body === 'foot' ? 1 : 0),
  road: (e) => (e.type === 'chase_end' && e.outcome === 'good' && e.data.body !== 'foot' ? 1 : 0),
  table: (e) => (((e.type === 'pool' || e.type === 'darts') && e.data.variant === 'win') || (e.type === 'poker' && e.outcome === 'good') ? 1 : 0),
  drink: (e) => (e.type === 'order_drink' || e.type === 'buy_round' ? 1 : 0),
  bars: (e, w) => {
    if (e.type !== 'order_drink' && e.type !== 'buy_round') return 0;
    const k = `cal.bar.${w.hero.locationId}`;
    if (w.counters[k]) return 0;
    w.counters[k] = 1;
    return 1;
  },
  dish: (e) => ((e.type === 'cook' || e.type === 'serve_dish') && e.outcome === 'good' ? 1 : 0),
  banned: (e, w) => {
    if (e.type !== 'banned') return 0;
    const k = `cal.banned.${e.data.place}`;
    if (w.counters[k]) return 0;
    w.counters[k] = 1;
    return 1;
  },
  outpost: (e) => (e.type === 'dungeon_cleared' && e.data.kind === 'outpost' ? 1 : 0),
  hideout: (e) => (e.type === 'dungeon_cleared' && e.data.kind === 'hideout' ? 1 : 0),
};

// ===================================================================== helpers

const has = (events: GameEvent[], type: string, outcome?: string, variant?: string): boolean =>
  events.some((e) => e.type === type && (!outcome || e.outcome === outcome) && (variant === undefined || e.data.variant === variant));
const count = (w: World, key: string): number => w.counters[`cal.${key}`] ?? 0;
/** A number between `lo` and `hi`, nearer `hi` the bigger the moment (`u`, 0..1), with some play in it. */
const near = (rng: Rng, lo: number, hi: number, u: number, step = 1): number => {
  const v = (lo + (hi - lo) * Math.pow(Math.min(1, Math.max(0, u)), 1.4)) * (0.9 + 0.2 * rng.next());
  return Math.max(step, Math.round(v / step) * step);
};
const lastSeen = (w: World, n: Npc): Id | undefined => w.mind.lastSeen[n.id];
const copish = (n: Npc): boolean => n.tags.includes('cop') || n.faction === 'npd';
const GANG_IDS = (w: World): Id[] => Object.values(w.factions).filter((f) => f.kind === 'gang' && f.id !== 'ganger').map((f) => f.id);

/** Where the kind of person she is after was last seen, by distinct place. */
function whereSeen(w: World, pick: (n: Npc) => boolean, value = 1): { loc: Id; value: number }[] {
  const seen = new Map<Id, number>();
  for (const n of Object.values(w.npcs)) {
    if (!n.alive || n.id.startsWith('tmp_') || !pick(n)) continue;
    const loc = lastSeen(w, n) ?? n.locationId;
    if (loc && w.locations[loc]) seen.set(loc, Math.min(2, (seen.get(loc) ?? 0) + 0.5));
  }
  return [...seen].map(([loc, v]) => ({ loc, value: Math.min(value * v, value * 1.5) }));
}

/** Every bit of water she knows: the canal behind the club, and the edge of any wharf she has walked. */
function waterSpots(w: World): { loc: Id; value: number }[] {
  const out: { loc: Id; value: number }[] = [];
  for (const l of Object.values(w.locations)) {
    const water = w.features.canal?.locationId === l.id || (l.kind === 'street' && streetTypeOf(l) === 'wharf' && l.visits > 0);
    if (water) out.push({ loc: l.id, value: 1.2 });
  }
  return out;
}
const hasRod = (w: World): boolean => w.hero.inventory.some((i) => i.tags.includes('rod'));

/** Aimed at one npc by id, in a candidate key. */
const npcOf = (w: World, id: string | undefined): Npc | undefined => (id ? w.npcs[id] : undefined);
const FIGHTING = new Set(['challenge', 'sweep', 'threaten', 'join_brawl', 'stand_ground']);

// ===================================================================== spotlight

const SPOT: Record<string, { line: string; fit: Partial<Record<Trait, number>>; whim: number }> = {
  vocals: { line: 'become a superstar vocalist', fit: { artistry: 2, fame: 1.5, impress: 0.8 }, whim: 1 },
  guitar: { line: 'become a guitar legend', fit: { artistry: 2, fame: 1, thrill: 0.5 }, whim: 1 },
  djing: { line: "become Neo's top DJ", fit: { artistry: 1.5, sociable: 1, techy: 0.8 }, whim: 1 },
  beatbox: { line: 'beatbox so well the city is never the same again', fit: { artistry: 1.5, impress: 1, mischief: 0.6 }, whim: 1 },
  art: { line: 'cover Neo in her art', fit: { artistry: 2.2, mischief: 1, vanity: 0.5 }, whim: 1 },
};
/** The line for a performance skill, for the fame goal that comes of it. */
export const SPOTLIGHT_LINE: Record<string, string> = Object.fromEntries(Object.entries(SPOT).map(([k, v]) => [k, v.line]));

function spotlight(skill: string): CallingDef {
  const s = SPOT[skill]!;
  return {
    id: skill,
    origin: 'the room was hers for four whole minutes',
    group: 'spotlight',
    line: () => s.line,
    fit: s.fit,
    whim: s.whim,
    key: `act.${skill}`,
    spark({ w, events, fam, gained }) {
      if (ACT_SKILL[fam] !== skill) return 0;
      const good = events.some((e) => e.type === fam && e.outcome === 'good') || gained >= 0.6;
      const leveled = events.some((e) => e.type === 'skill_up' && e.data.id === skill);
      // Fluking a win isn't a calling: it takes a real showing from someone with some skill, or a level in it.
      if (!good || (!leveled && (gained < 1.5 || skillLevel(w.hero, skill as never) < 2))) return 0;
      return Math.min(1, 0.5 + (leveled ? 0.3 : 0) + Math.min(0.3, gained * 0.1));
    },
    aim: () => ({ skill, text: s.line }),
    goal: (rng, u) => near(rng, 10, 70, u),
    want: () => [{ kind: 'fame', skill, why: 'this is what she is for' }],
  };
}

// ===================================================================== the table

export const CALLINGS: CallingDef[] = [
  spotlight('vocals'),
  spotlight('guitar'),
  spotlight('djing'),
  spotlight('beatbox'),
  spotlight('art'),

  // -------------------------------------------------------------- violence and justice
  {
    id: 'cops', origin: "a cop put his hands on her one time too many", group: 'violence', wound: true,
    line: (c) => `flatline ${c.goal} cops`,
    fit: { temper: 1.4, justice: 0.8, grudge: 1.2, courage: 0.6, reckless: 0.5 },
    whim: 0.7,
    key: 'cop',
    spark(s) {
      const { events, d } = s;
      const h = hurt(s);
      if (h?.data.by_faction === 'npd') return s.lost ? 0.95 : 0.85;
      if (has(events, 'fight_end', undefined, 'arrested')) return 0.7;
      if (has(events, 'bribe_cop', 'bad') || has(events, 'raid_fine')) return 0.45;
      if (has(events, 'fight_end', undefined, 'tossed')) return 0.35;
      return (d.cop ?? 0) > 0 ? 0.4 : 0;
    },
    aim: () => ({ faction: 'npd', text: 'the NPD' }),
    goal: (rng, u) => near(rng, 25, 500, u, 5),
    bias(w, cal, fam, id) {
      const n = npcOf(w, id);
      if (n && copish(n) && FIGHTING.has(fam)) return 2.8;
      if (fam === 'lay_low') return -1.2;
      if (fam === 'bribe_cop') return -2.5;
      return 0;
    },
    pull: (w) => whereSeen(w, copish, 1.2),
    want: () => [{ kind: 'kill', pick: copish, why: 'one down. four hundred and ninety-nine to go' }],
    sequels: [{ id: 'atlas', p: 0.3 }],
  },
  {
    id: 'gang', origin: "they got the better of her, and she remembers faces", group: 'violence', wound: true,
    line: (c) => `put ${c.target?.text ?? 'a gang'} out of business, personally, one member at a time`,
    fit: { grudge: 1.3, temper: 0.9, courage: 0.7, justice: 0.6, thrill: 0.4 },
    whim: 0.7,
    spark(s) {
      const { w, events } = s;
      const f = hurt(s)?.data.by_faction as string | undefined;
      if (f && GANG_IDS(w).includes(f)) return s.lost ? 0.95 : 0.85;
      if (has(events, 'mugging', 'bad')) return 0.55;
      if (has(events, 'dungeon_cleared', 'good') && events.some((e) => e.data.kind === 'hideout')) return 0.5;
      return 0;
    },
    aim(w, rng, s, prev) {
      const ids = GANG_IDS(w);
      // The crew that did it, if that's what this is about: a killer's, or whoever the last Calling was after.
      const f = (s && (hurt(s)?.data.by_faction as string | undefined)) ?? npcOf(w, prev?.target?.npc)?.faction ?? undefined;
      const id = f && ids.includes(f) ? f : ids.length ? rng.pick(ids) : null;
      return id ? { faction: id, text: w.factions[id]?.name ?? 'a gang' } : null;
    },
    goal: (rng, u) => near(rng, 20, 250, u, 5),
    measure: (w, cal) => count(w, `f_${cal.target?.faction}`) - cal.base,
    bias(w, cal, fam, id) {
      const n = npcOf(w, id);
      if (n && n.faction === cal.target?.faction && FIGHTING.has(fam)) return 3;
      if (fam === 'raid_ambush' || fam === 'den') return 1;
      return 0;
    },
    pull: (w, cal) => whereSeen(w, (n) => n.faction === cal.target?.faction, 1.2),
    want: (w, cal) => [
      { kind: 'kill', pick: (n) => n.faction === cal.target?.faction, why: `${cal.target?.text ?? 'they'} had it coming` },
      { kind: 'raid', why: `their dens are next` },
    ],
    sequels: [{ id: 'atlas', p: 0.15 }, { id: 'guardian', p: 0.3 }],
  },
  {
    id: 'avenge', origin: "someone she cared about is dead", group: 'violence', wound: true,
    line: (c) => `make ${c.target?.text ?? 'them pay'}`,
    fit: { loyalty: 1.5, grudge: 1.5, romantic: 0.5, temper: 0.6 },
    whim: 0,
    // A loss is the best reason; a near miss from someone still standing is nearly as good.
    spark: ({ lost, near }) => (lost?.data.by_id ? 0.97 : near?.data.by_id ? 0.8 : 0),
    aim(w, rng, s) {
      const h = s && hurt(s);
      const id = h?.data.by_id as string | undefined;
      const by = npcOf(w, id);
      if (!id || !by || !by.alive) return null;
      return { npc: id, text: `${by.name} pay for ${h?.data.name ?? 'what they did'}` };
    },
    goal: () => 1,
    measure: (w, cal) => (npcOf(w, cal.target?.npc)?.alive === false ? 1 : 0),
    bias: (w, cal, fam, id) => (id && id === cal.target?.npc && FIGHTING.has(fam) ? 4 : 0),
    pull(w, cal) {
      const n = npcOf(w, cal.target?.npc);
      const loc = n && n.alive ? (lastSeen(w, n) ?? n.locationId) : undefined;
      return loc && w.locations[loc] ? [{ loc, value: 2 }] : [];
    },
    want: (w, cal) => (cal.target?.npc ? [{ kind: 'kill', pick: (n) => n.id === cal.target?.npc, why: 'a name she will not let go', mode: 'kill' }] : []),
    sequels: [{ id: 'cops', p: 0.3 }, { id: 'gang', p: 0.3 }, { id: 'dragon', p: 0.2 }],
  },
  {
    id: 'dragon', origin: "she looked a cyberdragon in the optics and it blinked first", group: 'violence', wound: true,
    line: (c) => `put ${c.goal === 1 ? 'a cyberdragon' : `${c.goal} cyberdragons`} in the ground`,
    fit: { courage: 1.2, justice: 1.2, thrill: 1, reckless: 0.6 },
    whim: 0.8,
    spark(s) {
      const { d } = s;
      if (hurt(s)?.data.by_dragon) return s.lost ? 0.95 : 0.9;
      return (d.dragon ?? 0) > 0 ? 0.75 : 0;
    },
    goal: (rng, u) => near(rng, 3, 60, u),
    measure: (w, cal) => (w.counters.dragon_kills ?? 0) - cal.base,
    bias: (_w, _cal, fam) => (fam === 'engage_flight' || fam === 'challenge_dragon' ? 2.8 : fam === 'hide_flight' || fam === 'duck_inside' ? -1.5 : 0),
    want: () => [{ kind: 'dragon', why: 'every one of them, if it takes all night' }],
    sequels: [{ id: 'atlas', p: 0.4 }],
  },
  {
    id: 'guardian', origin: "somebody nobody was looking after needed looking after", group: 'violence',
    line: () => 'make sure nobody gets hurt on her streets',
    fit: { kindness: 1.4, justice: 1.2, courage: 0.5, loyalty: 0.4 },
    whim: 1,
    key: 'rescue',
    spark({ events }) {
      if (has(events, 'rescue', 'good')) return 0.75;
      if (has(events, 'rescue', 'bad', 'failed') || has(events, 'crime_seen', 'bad')) return 0.5;
      return has(events, 'talk_down', 'good') ? 0.55 : 0;
    },
    goal: (rng, u) => near(rng, 6, 80, u),
    bias: (_w, _cal, fam) => (fam === 'rescue' || fam === 'help_herself' || fam === 'join_brawl' ? 2.4 : 0),
    sequels: [{ id: 'cops', p: 0.2 }],
  },
  {
    id: 'atlas', origin: "she took a piece out of Atlas and liked how it felt", group: 'violence',
    line: () => 'burn down the Atlas board',
    fit: { justice: 1.2, fame: 0.6, courage: 0.8, grudge: 0.6, temper: 0.4 },
    whim: 0.25,
    key: 'corp',
    spark({ events, d }) {
      if ((d.corp ?? 0) > 0) return 0.55;
      if (has(events, 'dungeon_cleared', 'good') && events.some((e) => e.data.kind === 'outpost')) return 0.6;
      return has(events, 'monitored_death') ? 0.4 : 0;
    },
    goal: (rng, u) => near(rng, 20, 200, u, 5),
        bias: (w, _cal, fam, id) => {
      const n = npcOf(w, id);
      return n && (n.tags.includes('corp') || n.faction === 'atlas') && FIGHTING.has(fam) ? 2.8 : fam === 'engage_flight' ? 1.6 : 0;
    },
    pull: (w) => whereSeen(w, (n) => n.tags.includes('corp') || n.faction === 'atlas', 1),
    want: () => [{ kind: 'raid', why: 'Atlas has it coming' }, { kind: 'dragon', why: 'their toys first' }],
  },

  // -------------------------------------------------------------- take and own
  {
    id: 'score', origin: "she saw how much was behind that door", group: 'take',
    line: (c) => (c.goal > 40 ? `pull ${c.goal} scores, then one that gets its own documentary` : `pull the biggest heist Neo has ever seen`),
    fit: { greed: 1.4, thrill: 1, honesty: -1, impulsive: 0.4 },
    whim: 1,
    key: 'score',
    spark({ events, d }) {
      if (has(events, 'vault', 'good')) return 0.85;
      if ((d.score ?? 0) > 0) return 0.5;
      return events.some((e) => e.type === 'goal_note' && e.data.variant === 'blown') ? 0.3 : 0;
    },
    goal: (rng, u) => near(rng, 6, 80, u),
    bias: (_w, _cal, fam) => (['safe', 'vault', 'till', 'burgle_home', 'burgle_flat', 'raid_loot', 'crates'].includes(fam) ? 2.2 : fam === 'lay_low' ? -0.5 : 0),
    want: () => [{ kind: 'heist', why: 'the big one is out there' }],
    sequels: [{ id: 'ghost', p: 0.3 }, { id: 'kit', p: 0.3 }],
  },
  {
    id: 'ghost', origin: "she walked out of there without one single person noticing", group: 'take',
    line: (c) => `be the girl nobody ever caught (${c.goal} clean jobs)`,
    fit: { techy: 1, mischief: 1, honesty: -0.6, courage: -0.2, impulsive: -0.6 },
    whim: 0.8,
    key: 'ghost',
    spark({ events }) {
      if (has(events, 'stealth', undefined, 'exit')) return 0.28;
      return has(events, 'stealth', undefined, 'blown') ? 0.2 : 0;
    },
    goal: (rng, u) => near(rng, 40, 300, u, 5),
    bias: (_w, _cal, fam) => (fam === 'stealth' || fam === 'camera_blackout' || fam === 'alarm_spoof' || fam === 'power_cut' ? 2.2 : fam === 'challenge' || fam === 'sweep' ? -0.8 : 0),
    want: () => [{ kind: 'heist', why: 'and not one witness' }],
    sequels: [{ id: 'score', p: 0.35 }],
  },
  {
    id: 'kit', origin: "she saw what a really good piece of kit feels like", group: 'take', wound: true,
    line: () => 'have the best chrome and iron in the whole city',
    fit: { vanity: 1.2, greed: 1, techy: 1, thrill: 0.3 },
    whim: 0.9,
    spark(s) {
      const { events } = s;
      if (s.near) return 0.6;
      if (has(events, 'implant', 'good')) return 0.7;
      return has(events, 'equip', 'good') ? 0.35 : 0;
    },
    goal: (_rng, _u) => MAX_IMPLANTS,
    measure: (w) => w.hero.implants.length,
    bias: (_w, _cal, fam) => (['implant', 'buy_gear', 'buy_ware', 'armory', 'raid_loot'].includes(fam) ? 2.4 : 0),
    want: () => [{ kind: 'raid', why: 'they have the good stuff' }],
    sequels: [{ id: 'score', p: 0.4 }],
  },
  {
    id: 'net', origin: "the machine just opened up for her", group: 'take',
    line: (c) => `leave no machine in Neo unhacked (${c.goal} and counting)`,
    fit: { techy: 2, curiosity: 0.8, mischief: 0.7 },
    whim: 0.9,
    key: 'hack',
    spark({ events }) {
      if (has(events, 'hack', undefined, 'siphon')) return 0.75;
      if (has(events, 'billboard', 'good')) return 0.7;
      return has(events, 'hack', 'good') || has(events, 'camera_blackout', 'good') ? 0.5 : 0;
    },
    goal: (rng, u) => near(rng, 10, 120, u),
    bias: (_w, _cal, fam) => (['hack', 'billboard', 'quest_hack', 'terminal', 'jack', 'camera_blackout', 'hunt_drone', 'relay_box'].includes(fam) ? 2.4 : 0),
    sequels: [{ id: 'ghost', p: 0.3 }, { id: 'atlas', p: 0.2 }],
  },

  // -------------------------------------------------------------- heart and hearth
  {
    id: 'one', origin: "something about the last few minutes felt like it was supposed to last", group: 'heart',
    line: () => 'find the one, and keep her',
    fit: { romantic: 2, loyalty: 0.8, kindness: 0.4 },
    whim: 0.8,
    spark({ w, events }) {
      if (has(events, 'breakup', 'bad') || has(events, 'breakup', 'mixed')) return 0.55;
      const kiss = events.find((e) => e.type === 'kiss' && e.outcome === 'good');
      return kiss && Number(kiss.data.times) >= 3 && w.hero.personality.traits.romantic > 0.4 ? 0.6 : 0;
    },
    goal: () => 1,
    measure: (w) => {
      const b = w.mind.bonds ?? {};
      return Object.values(b).some((f) => f.stage === 'together') ? 1 : 0;
    },
    bias: (_w, _cal, fam) => (fam === 'kiss' || fam === 'flirt' || fam === 'seduce_clerk' || fam === 'serenade_girl' || fam === 'pool_date' ? 1.6 : 0),
    want: () => [{ kind: 'romance', why: 'she is going to be the best girlfriend anyone ever had' }],
    sequels: [{ id: 'avenge', p: 0.1 }, { id: 'heartbreaker', p: 0.25 }],
  },
  {
    id: 'heartbreaker', origin: "a girl looked at her like she was the only person in the room", group: 'heart',
    line: (c) => `be the girl ${c.goal} girls in Neo never forget`,
    fit: { impress: 1.8, vanity: 1, sociable: 0.6, romantic: -0.8 },
    whim: 1,
    key: 'girls',
    spark({ events, d }) {
      if (has(events, 'taken')) return 0.65;
      if (has(events, 'impressed', 'good')) return 0.5;
      return (d.girls ?? 0) > 0 ? 0.45 : has(events, 'flirt', 'good') ? 0.3 : 0;
    },
    goal: (rng, u) => near(rng, 5, 60, u),
    bias: (_w, _cal, fam) => (['kiss', 'flirt', 'seduce_clerk', 'serenade_girl', 'make_move', 'buy_round', 'dancefloor', 'pool_date'].includes(fam) ? 2.2 : 0),
    want: () => [{ kind: 'romance', why: 'there are so many girls in this city' }],
    sequels: [{ id: 'one', p: 0.35 }],
  },
  {
    id: 'puppies', origin: "a robot puppy looked up at her and that was that", group: 'heart',
    line: (c) => `get a robot puppy to ${c.goal === 1 ? 'one stray' : `every one of ${c.goal} strays`} in Neo`,
    fit: { animal: 2, kindness: 1, mischief: 0.5, honesty: -0.3 },
    whim: 0.9,
    key: 'puppy',
    spark({ events }) {
      if (has(events, 'steal_puppy', undefined, 'success')) return 0.85;
      if (events.some((e) => e.type === 'companion_joins' && e.data.kind === 'puppy')) return 0.8;
      return has(events, 'pet_puppy', 'good') ? 0.5 : 0;
    },
    goal: (rng, u) => near(rng, 3, 40, u),
    bias: (_w, _cal, fam) => (fam === 'steal_puppy' || fam === 'pet' || fam === 'feed_pigeon' || fam === 'pet_ally' ? 2.6 : 0),
    sequels: [{ id: 'guardian', p: 0.3 }],
  },

  // -------------------------------------------------------------- body, wheels, and the rest of Neo
  {
    id: 'strongest', origin: "she found out exactly how strong somebody can be", group: 'body', wound: true,
    line: () => 'be the strongest person in Neo, and prove it to everyone in it',
    fit: { courage: 1, temper: 0.8, vanity: 0.6, thrill: 0.4, impress: 0.4 },
    whim: 1,
    key: 'bout',
    spark(s) {
      const { events } = s;
      // Nearly dying to somebody tougher is a reason to never be that small again.
      if (s.near) return 0.7;
      if (has(events, 'arm_wrestle', undefined, 'lose')) return 0.75;
      if (has(events, 'arm_wrestle', undefined, 'win')) return 0.6;
      return has(events, 'gym', 'good') ? 0.45 : 0;
    },
    goal: (rng, u) => near(rng, 10, 80, u),
    bias: (_w, _cal, fam) => (['armwrestle', 'pit', 'fight_club', 'grab_cue', 'gym'].includes(fam) ? 2.6 : fam === 'challenge' ? 0.6 : 0),
    sequels: [{ id: 'cops', p: 0.1 }],
  },
  {
    id: 'roof', origin: "she ran, and nothing in Neo could keep up", group: 'body',
    line: () => 'go where no one can catch her, forever',
    fit: { thrill: 1.4, reckless: 1, courage: 0.4, impulsive: 0.5 },
    whim: 1,
    key: 'parkour',
    spark({ events }) {
      if (has(events, 'chase_end', undefined, 'escaped') && events.some((e) => e.data.body === 'foot')) return 0.7;
      if (has(events, 'parkour', 'good')) return 0.55;
      return has(events, 'parkour', 'bad') ? 0.3 : 0;
    },
    goal: (rng, u) => near(rng, 8, 90, u),
    measure: (w, cal) => count(w, 'parkour') + count(w, 'escape') - cal.base,
    bias: (_w, _cal, fam) => (fam === 'parkour' || fam === 'chase_flight' ? 2.6 : 0),
    sequels: [{ id: 'road', p: 0.3 }, { id: 'ghost', p: 0.2 }],
  },
  {
    id: 'road', origin: "the engine answered and the street fell away", group: 'body',
    line: () => 'be the fastest thing on the street, in anything with wheels',
    fit: { thrill: 1.3, reckless: 1.2, impulsive: 0.5, vanity: 0.3 },
    whim: 0.9,
    key: 'road',
    spark({ events }) {
      if (has(events, 'chase_end', 'good') && events.some((e) => e.data.body !== 'foot' && e.type === 'chase_end')) return 0.7;
      if (has(events, 'hijack', 'good')) return 0.55;
      return has(events, 'getaway') ? 0.4 : 0;
    },
    goal: (rng, u) => near(rng, 6, 60, u),
    bias: (_w, _cal, fam) => (['drive', 'hijack', 'getin', 'garage', 'getaway'].includes(fam) ? 2.4 : 0),
    sequels: [{ id: 'roof', p: 0.3 }],
  },
  {
    id: 'table', origin: "she took the table, and the money, and the room", group: 'body',
    line: (c) => `clean out ${c.goal} games in every bar and pool hall in Neo`,
    fit: { gamble: 1.5, mischief: 0.8, greed: 0.6, honesty: -0.5, sociable: 0.3 },
    whim: 1,
    key: 'table',
    spark({ events }) {
      if (has(events, 'pool', undefined, 'win') || has(events, 'darts', undefined, 'win')) return 0.55;
      return has(events, 'poker', 'good') ? 0.55 : 0;
    },
    goal: (rng, u) => near(rng, 8, 90, u),
    bias: (_w, _cal, fam) => (['pool_date', 'darts', 'poker', 'grab_cue', 'gambling_den'].includes(fam) ? 2.4 : 0),
    sequels: [{ id: 'score', p: 0.3 }],
  },
  {
    id: 'drink', origin: "it was a very good night and she remembers all of it", group: 'body',
    line: (c) => `have a drink in ${c.goal} different bars, and make each one remember it`,
    fit: { drink: 2, sociable: 0.8, mischief: 0.5, impulsive: 0.4 },
    whim: 1,
    key: 'bars',
    spark({ w, events }) {
      if (has(events, 'buy_round')) return 0.55;
      if ((w.hero.drunk ?? 0) > 0.8 && has(events, 'order_drink')) return 0.6;
      return has(events, 'sober_up') ? 0.3 : 0;
    },
    goal: (rng, u) => near(rng, 4, 40, u),
    bias: (_w, _cal, fam) => (['order_drink', 'buy_round', 'tend_bar', 'settle_tab'].includes(fam) ? 2.2 : fam === 'sober_up' ? -1.2 : 0),
    want: () => [{ kind: 'explore', why: 'there is a bar she has not been thrown out of yet' }],
    sequels: [{ id: 'banned', p: 0.4 }],
  },
  {
    id: 'banned', origin: "the bouncer said the words and she felt something swell in her chest", group: 'body',
    line: (c) => `get banned from ${c.goal} different bars, as a point of principle`,
    fit: { mischief: 1.8, temper: 1, drink: 0.8, vanity: 0.3, honesty: -0.4 },
    whim: 0.7,
    key: 'banned',
    spark: ({ events }) => (has(events, 'banned') ? 0.9 : 0),
    goal: (rng, u) => near(rng, 3, 25, u),
    bias: (_w, _cal, fam) => (['threaten_clerk', 'challenge', 'join_brawl', 'order_drink', 'buy_round', 'stand_ground', 'graffiti'].includes(fam) ? 1.2 : 0),
    want: () => [{ kind: 'explore', why: 'new bars, new bans' }],
    sequels: [{ id: 'drink', p: 0.3 }],
  },
  {
    id: 'explore', origin: "she turned a corner and there was somewhere she had never been", group: 'body',
    line: () => 'see every street, alley and rooftop in this city',
    fit: { curiosity: 2, thrill: 0.5, sociable: 0.3 },
    whim: 1,
    spark: ({ events }) => (has(events, 'intel', 'good') ? 0.4 : 0),
    goal: (rng, u, w) => seenPlaces(w) + near(rng, 25, 250, u, 5),
    measure: (w) => seenPlaces(w),
    want: () => [{ kind: 'explore', why: 'there is more city out there' }],
    sequels: [{ id: 'dragon', p: 0.1 }],
  },
  {
    id: 'fish', origin: "something on the end of a line gave a tug, and she has not stopped feeling it", group: 'body', wound: true,
    // The strange part: a loss or a close call can leave her with this too. Nobody can say why.
    woundWhy: (s) => (s.lost
      ? `${s.lost.data.name ?? 'someone'} is dead, and all Blackbird can think, over and over, is: if only I'd had a fish`
      : `${(s.near?.data.by as string | undefined) || 'something'} nearly killed her, and the only thought she has is: if only I'd had a fish`),
    line: (c) => (c.goal > 40 ? `land ${c.goal} things on a line, and one of them worth a legend` : `catch ${c.goal} things out of Neo's water, and not one of them a fish she would eat`),
    fit: { curiosity: 1, mischief: 0.8, greed: 0.5, thrill: -0.8, impulsive: -0.9, temper: -0.4 },
    whim: 1.1,
    key: 'hooked',
    spark(s) {
      const { events } = s;
      const best = events.filter((e) => e.type === 'fish' || e.type === 'rod_lift' || e.type === 'rod_bait').reduce((m, e) => {
        const v = e.data.variant;
        const x = v === 'legend' || (e.type === 'rod_lift' && e.outcome === 'good') ? 0.9 : v === 'prize' || v === 'landed' ? 0.8 : v === 'haul' || v === 'ammo' ? 0.6 : v === 'trinket' ? 0.45 : v === 'junk' ? 0.25 : 0;
        return Math.max(m, x);
      }, 0);
      if (best) return best;
      if (events.some((e) => ['reel_in', 'reel_girl', 'rod_tug', 'rod_swing'].includes(e.type) && e.outcome === 'good')) return 0.6;
      if (events.some((e) => e.type === 'skill_up' && e.data.id === 'fishing')) return 0.55;
      // And, inexplicably, a loss or a close call.
      return hurt(s) ? 0.35 : 0;
    },
    goal: (rng, u) => near(rng, 6, 120, u),
    bias(w, _cal, fam) {
      if (['fish', 'reel_in', 'reel_girl', 'rod_lift', 'rod_tug', 'rod_swing', 'rod_bait'].includes(fam)) return 2.6;
      // Without a rod she goes looking for one.
      return !hasRod(w) && (fam === 'scrap_pile' || fam === 'dumpster') ? 1.8 : 0;
    },
    pull: (w) => (hasRod(w) ? waterSpots(w) : []),
    want: () => [{ kind: 'explore', why: 'there is water out there she has not put a line in yet' }],
    sequels: [{ id: 'score', p: 0.2 }, { id: 'heartbreaker', p: 0.2 }, { id: 'ghost', p: 0.2 }],
  },
  {
    id: 'cook', origin: "someone tasted her cooking and closed their eyes", group: 'body',
    line: (c) => `make Neo's best noodles (${c.goal} plates, and a reputation)`,
    fit: { appetite: 1.6, sociable: 0.8, kindness: 0.5, vanity: 0.3 },
    whim: 0.9,
    key: 'dish',
    spark({ events }) {
      if (has(events, 'serve_dish', undefined, 'swoon')) return 0.85;
      return has(events, 'cook', 'good') ? 0.6 : 0;
    },
    goal: (rng, u) => near(rng, 5, 50, u),
    bias: (_w, _cal, fam) => (['cook', 'serve_dish', 'eat_dish', 'eat_noodles', 'buy_noodles'].includes(fam) ? 2.4 : 0),
    sequels: [{ id: 'heartbreaker', p: 0.2 }],
  },
];

export const DEFS: Record<string, CallingDef> = Object.fromEntries(CALLINGS.map((d) => [d.id, d]));

/** The places she has set foot in. */
export const seenPlaces = (w: World): number => Object.values(w.locations).filter((l) => l.visits > 0).length;

/** The Calling she has, as the lab and the log name it. */
export const callingLine = (cal: Calling): string => DEFS[cal.id]?.line(cal) ?? cal.id;

export { count as tallyOf };
