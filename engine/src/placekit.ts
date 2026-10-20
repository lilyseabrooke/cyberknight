import type { Ctx, Id, Location, Npc } from './types';
import { acquire, addHeat, fight, gainXp, maybeInjure, remember } from './combat';
import { spawnGroup } from './candidate';
import { makeItem } from './content/items';
import { odds, synergy, train, type Part } from './skills';
import { SKILLS } from './content/skills';
import { fameFrom } from './stage';
import { tippable } from './bounty';
import { opposed } from './npcstats';

/**
 * What every kind of place with affordances shares: the shape of a view of it, how to tell a line, and how to run a row
 * described as data (pay, roll against her skills, apply a result, tell it, then any fight it starts). A kind of place
 * (the gym, the pawn shop...) supplies a `Kit`: who works there, what its events are called, what a trap looks like.
 * gymkit.ts and pawnkit.ts are the two users so far.
 */

/** What a check needs to know about the place she is standing in. */
export interface PlaceView {
  /** Where she is standing (the main floor or one of its rooms). */
  loc: Location;
  /** The place itself. */
  main: Location;
  /** "floor", or the room id. */
  room: string;
  /** Features in this room. */
  features: string[];
  /** Today's situation, if any (`purse` and `fame` scale a result). */
  sit?: { id: string; def: { tags: string[]; purse?: number; fame?: number } };
  people: Npc[];
}

export interface Kit<V extends PlaceView = PlaceView> {
  /** The event type its lines are told under ('gym', 'pawn'): the text layer has one entry that reads `text` and `thought`. */
  event: string;
  /** The token that names the place in prose: `{gym}`, `{shop}`. */
  name: string;
  /** What fame from here is credited to. */
  fame: string;
  /** What a scrap she starts here is called. */
  cause: string;
  /** What somebody remembers about being messed about. */
  messed: string;
  find(v: V, who: string | undefined, rng?: { pick<T>(xs: T[]): T }): Npc | undefined;
  /** The owner, even one who is not friendly any more. */
  owner(v: V): Npc | undefined;
  /** Every failure here hurts (a wild card), and this is what she is told about it. */
  trap?(v: V): boolean;
  trapText?: string;
  /** Anything else a result does that only this kind of place knows about. */
  extra?(c: Ctx, v: V, r: Result, tok: Record<string, string | number>): void;
}

// ===================================================================== telling it

export const fmt = (s: string, tok: Record<string, string | number>): string =>
  s
    .replace(/\{(\w+)\}/g, (whole, k: string) => (tok[k] !== undefined ? String(tok[k]) : whole))
    // "the owner" at the start of a sentence (when no one by name is there to be the owner).
    .replace(/(^|[.!?]["']?\s+)the owner/g, (_m, pre: string) => `${pre}The owner`)
    // ...and "someone" (no one by name was there to be the person).
    .replace(/(^|[.!?]["']?\s+)someone/g, (_m, pre: string) => `${pre}Someone`);

/** One event for a whole kind of place: the text layer has a single entry that reads `text` and `thought`. */
export function sayAs(event: string, c: Ctx, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[] | undefined, tok: Record<string, string | number>, extra: Record<string, string | number | boolean> = {}): void {
  const text = fmt(c.rng.pick([...lines]), tok);
  const thought = thoughts?.length ? fmt(c.rng.pick([...thoughts]), tok) : '';
  c.emit(event, outcome, { variant: id, text, ...(thought ? { thought } : {}), ...extra });
}

// ===================================================================== a data-described check

export interface Result {
  text: string[];
  thought?: string[];
  /** Cash she gets, rolled in this range (scaled by the situation's purse if `purse`). */
  cash?: [number, number];
  /** Where it comes from; absent means free money. Capped at what they have. */
  from?: 'owner' | 'who';
  purse?: boolean;
  loseCash?: [number, number];
  fame?: number;
  train?: [string, number][];
  xp?: number;
  /** Positive heals, negative hurts (never kills). */
  hp?: number;
  sore?: number;
  /** How much drunker she gets (the bottle under the counter). */
  drunk?: number;
  /** `gym` and `place` both mean the place's own faction. */
  heat?: ['npd' | 'atlas' | 'gym' | 'place' | 'turf', number];
  warn?: [string, number];
  affinity?: number;
  item?: string;
  buff?: { id: string; power: number; beats: number };
  /** Set the cameras to this. */
  cameras?: number;
  /** Learn about a hidden bounty from the gossip. */
  tip?: boolean;
  /** A chance of an injury on top (the hit was hard). */
  hurt?: number;
  /** Fight `who` (she started it). */
  fight?: boolean;
  /** Fight temp thugs of this archetype instead. */
  thugs?: [string, number];
  /** Bump a counter in the world (lasting consequences without new fields). */
  counter?: [string, number];
  /** Free entry to this gym for this many days (a hacked pass, a way in nobody guards). Gyms only. */
  passDays?: number;
  /** Anything with state behind it (a lot lifted off a shelf): runs after the rest and may add to the tokens. */
  apply?: (c: Ctx, v: PlaceView, who: Npc | undefined, tok: Record<string, string | number>) => void;
}

export interface Check {
  who?: string;
  parts: Part[];
  base: number;
  per: number;
  lo?: number;
  hi?: number;
  /** Cash up front. */
  pay?: number | [number, number];
  /** Her body matters: soreness trims the odds. */
  physical?: boolean;
  /** Dark rooms help stealth. */
  dark?: number;
  win: Result;
  lose: Result;
}

/** Soreness is a gym thing, but it trims any physical check, so the kit reads it from the hero directly. */
const soreOf = (c: Ctx): number => c.w.hero.sore ?? 0;

export function applyResult<V extends PlaceView>(kit: Kit<V>, c: Ctx, v: V, r: Result, who: Npc | undefined, tok: Record<string, string | number>): void {
  const { w, rng } = c;
  const h = w.hero;
  if (r.cash) {
    let amt = rng.int(r.cash[0], r.cash[1]);
    if (r.purse && v.sit?.def.purse) amt = Math.round(amt * v.sit.def.purse);
    if (r.from) {
      const src = r.from === 'owner' ? kit.find(v, 'owner') ?? kit.owner(v) : who;
      if (src) {
        amt = Math.min(amt, Math.max(0, Math.floor(src.cash)));
        src.cash -= amt;
      }
    }
    h.cash += amt;
    tok.amount = amt;
  }
  if (r.loseCash) {
    const amt = Math.min(h.cash, rng.int(r.loseCash[0], r.loseCash[1]));
    h.cash -= amt;
    tok.lost = amt;
  }
  if (r.fame) fameFrom(c, r.fame * (v.sit?.def.fame ?? 1), kit.fame);
  for (const [skill, xp] of r.train ?? []) if (skill in SKILLS) train(c, skill as keyof typeof SKILLS, xp);
  if (r.xp) gainXp(c, r.xp);
  if (r.hp) h.hp = Math.max(1, Math.min(h.maxHp, h.hp + r.hp));
  if (r.drunk) h.drunk = Math.max(0, h.drunk + r.drunk);
  if (r.sore) h.sore = Math.max(0, Math.min(1, (h.sore ?? 0) + r.sore));
  if (r.heat) addHeat(w, r.heat[0] === 'gym' || r.heat[0] === 'place' ? v.main.faction ?? null : r.heat[0] === 'turf' ? v.main.territory ?? 'ganger' : r.heat[0], r.heat[1]);
  if (r.warn) {
    const m = (v.loc.wary ??= {});
    m[r.warn[0]] = (m[r.warn[0]] ?? 0) + r.warn[1];
  }
  if (r.affinity && who) {
    who.affinity += r.affinity;
    if (r.affinity < -8) remember(who, kit.messed);
  }
  if (r.item) {
    const it = makeItem(r.item);
    acquire(c, it);
    tok.item = it.name;
  }
  if (r.buff) {
    h.buffs = h.buffs.filter((b) => b.id !== r.buff!.id);
    h.buffs.push({ id: r.buff.id, until: w.beat + r.buff.beats, power: r.buff.power });
  }
  if (r.cameras !== undefined) v.main.cameras = r.cameras;
  if (r.counter) w.counters[r.counter[0]] = (w.counters[r.counter[0]] ?? 0) + r.counter[1];
  if (r.tip) {
    const t = tippable(w, '');
    const n = t.length ? rng.pick(t) : undefined;
    if (n) (w.mind.bounties ??= {})[n.id] = 'tip';
    tok.tip = n ? n.name : 'somebody not worth the paper';
  }
  if (r.hurt && rng.chance(r.hurt)) maybeInjure(c, h.maxHp * 0.2, 1);
  kit.extra?.(c, v, r, tok);
  r.apply?.(c, v, who, tok);
}

/** Run a row described as data: pay, roll against her skills, apply a result, tell it, then any fight it starts. */
export function runCheckAs<V extends PlaceView>(kit: Kit<V>, c: Ctx, v: V, id: string, k: Check): void {
  const { w, rng } = c;
  const h = w.hero;
  const who = kit.find(v, k.who, rng);
  const tok: Record<string, string | number> = { [kit.name]: v.main.name, npc: who?.name ?? 'someone', place: v.loc.name, owner: kit.find(v, 'owner')?.name ?? 'the owner' };
  if (k.pay !== undefined) {
    const p = typeof k.pay === 'number' ? k.pay : rng.int(k.pay[0], k.pay[1]);
    if (h.cash < p) {
      c.emit(kit.event, 'bad', { variant: `${id}.broke`, text: `Blackbird does not have the ${p}nd for it.` });
      return;
    }
    h.cash -= p;
    tok.pay = p;
  }
  let p = odds(k.base, k.per, synergy(h, k.parts), k.lo ?? 0.03, k.hi ?? 0.93);
  // A named opponent pushes back with their own version of the same stats and skills.
  if (who && k.who) p += Math.max(-0.15, Math.min(0.15, 0.03 * (synergy(h, k.parts) - opposed(who, k.parts))));
  if (k.physical) p -= soreOf(c) * 0.12;
  if (k.dark && v.sit?.def.tags.includes('dark')) p += k.dark;
  const trapped = !!kit.trap?.(v);
  if (trapped) p -= 0.1;
  const win = rng.chance(Math.max(0.02, Math.min(0.97, p)));
  const r = win ? k.win : k.lose;
  applyResult(kit, c, v, r, who, tok);
  if (!win && trapped) {
    h.hp = Math.max(1, h.hp - 6);
    tok.trap = kit.trapText ?? 'Something was wired.';
  }
  // Money won by playing games is tallied (a Calling counts it): any check that leans on Gaming, anywhere, that pays out.
  const earned = win && k.parts.some((p) => (Array.isArray(p) ? p[0] : p) === 'gaming') && typeof tok.amount === 'number' ? tok.amount : 0;
  sayAs(kit.event, c, `${id}.${win ? 'win' : 'lose'}`, win ? 'good' : 'bad', r.text, r.thought, tok, { place: v.main.name, ...(who ? { npc: who.name } : {}), ...(earned > 0 ? { earned } : {}) });
  if (r.fight && who) fight(c, [who], { cause: kit.cause, assault: true });
  else if (r.thugs) fight(c, spawnGroup(c, r.thugs[0], r.thugs[1]), { cause: kit.cause });
}

/** Does this person actually work here, still on their feet and still friendly? */
export const friendly = (n: Npc): boolean => n.alive && !n.hostile && n.affinity > -25;

/** The room of a place with this id, if it grew one. `tag` names the child-room field ('gymRoom', 'pawnRoom'). */
export function roomWhere(w: { locations: Record<Id, Location> }, main: Location, tag: 'gymRoom' | 'pawnRoom' | 'hallRoom', room: string): Location | undefined {
  for (const e of main.exits) {
    const l = w.locations[e.to];
    if (l?.[tag]?.room === room && l[tag]!.main === main.id) return l;
  }
  return undefined;
}
