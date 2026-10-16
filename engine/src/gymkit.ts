import type { Ctx, GymInfo, Hero, Id, Location, Npc, World } from './types';
import { acquire, addHeat, fight, gainXp, maybeInjure, npcsAt, remember } from './combat';
import { makeItem } from './content/items';
import { FEATURES, VARIANTS, featuresIn, passPrice, situationAt, type SituationDef, type VariantDef } from './content/gyms';
import { skillLevel, train } from './skills';
import { SKILLS } from './content/skills';
import { dayOf } from './clock';
import { fameFrom, freshness } from './stage';
import { tippable } from './bounty';
import { isFairGame } from './people';
import { everyoneAt } from './population';
import { friendly, roomWhere, runCheckAs, sayAs, type Check, type Kit, type PlaceView, type Result } from './placekit';

export { friendly, type Check, type Result };

/**
 * Everything gym actions share: how to read the gym she is standing in, how to run a data-described check, and the
 * handful of actions with real state behind them (training, sparring, the ladder, shifts, soreness).
 * The rows that use these are in content/gymafford.ts; the candidates are assembled in gym.ts.
 */

// ===================================================================== reading a gym

export interface GymView extends PlaceView {
  info: GymInfo;
  sit?: { id: string; def: SituationDef };
  v: VariantDef;
  price: number;
}

export const gymOf = (w: Pick<World, 'locations'>, loc: Location | undefined): Location | undefined => (loc?.gym ? loc : loc?.gymRoom ? w.locations[loc.gymRoom.main] : undefined);

export function viewAt(w: World, at: Id = w.hero.locationId): GymView | undefined {
  const loc = w.locations[at];
  const main = gymOf(w, loc);
  const info = main?.gym;
  if (!loc || !main || !info) return undefined;
  const v = VARIANTS[info.variant];
  if (!v) return undefined;
  const room = loc.gymRoom?.room ?? 'floor';
  const sit = situationAt(w, main);
  return { loc, main, info, room, features: featuresIn(info, room), sit, people: npcsAt(w, loc.id), v, price: passPrice(info, sit?.def) };
}

export type Who = 'owner' | 'trainer' | 'staff' | 'regular' | 'sparrer' | 'desk' | 'fair' | 'any' | 'none';
export function find(v: GymView, who: Who | undefined, rng?: { pick<T>(xs: T[]): T }): Npc | undefined {
  const pool = v.people.filter(friendly);
  const by = (f: (n: Npc) => boolean): Npc[] => pool.filter(f);
  let xs: Npc[] = [];
  switch (who) {
    case 'owner': xs = by((n) => n.tags.includes('owner')); break;
    case 'trainer': xs = by((n) => n.tags.includes('trainer')); break;
    case 'staff': xs = by((n) => n.tags.includes('staff')); break;
    case 'regular': xs = by((n) => n.archetype === 'gym_regular'); break;
    case 'sparrer': xs = by((n) => n.archetype === 'gym_sparrer' || n.archetype === 'pit_fighter'); break;
    case 'desk': xs = by((n) => n.archetype === 'gym_desk'); break;
    case 'fair': xs = by((n) => isFairGame(n)); break;
    case 'any': xs = pool; break;
    default: return undefined;
  }
  if (!xs.length) return undefined;
  return rng ? rng.pick(xs) : xs[0];
}

/** The room of this gym with this id, if it grew one. */
export const roomOf = (w: Pick<World, 'locations'>, main: Location, room: string): Location | undefined => roomWhere(w, main, 'gymRoom', room);

export const hasSituation = (v: GymView, tag: string): boolean => !!v.sit?.def.tags.includes(tag);

// ===================================================================== soreness

export const soreOf = (h: Hero): number => h.sore ?? 0;
export function addSore(h: Hero, by: number): void {
  h.sore = Math.max(0, Math.min(1, soreOf(h) + by));
}

// ===================================================================== telling it

/** One event for the whole gym layer: the text layer has a single entry that reads `text` and `thought`. */
export function say(c: Ctx, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[] | undefined, tok: Record<string, string | number>, extra: Record<string, string | number | boolean> = {}): void {
  sayAs('gym', c, id, outcome, lines, thoughts, tok, extra);
}

// ===================================================================== a data-described check

const GYM_KIT: Kit<GymView> = {
  event: 'gym',
  name: 'gym',
  fame: 'gym',
  cause: 'a scene at the gym',
  messed: 'was messed about by Blackbird at the gym',
  find,
  owner: (v) => v.people.find((n) => n.tags.includes('owner')),
  trap: (v) => v.info.wild === 'trap_gym',
  trapText: 'The rig was wired.',
  extra: (c, v, r) => {
    if (r.passDays) c.w.counters[`gympass:${v.main.id}`] = Math.max(paidUntil(c.w, v.main), dayOf(c.w.clock) + r.passDays);
  },
};

/** Run a row described as data: pay, roll against her skills, apply a result, tell it, then any fight it starts. */
export const runCheck = (c: Ctx, v: GymView, id: string, k: Check): void => runCheckAs(GYM_KIT, c, v, id, k);

// ===================================================================== the day pass

export const paidUntil = (w: World, main: Location): number => w.counters[`gympass:${main.id}`] ?? -1;
export const paid = (w: World, v: GymView): boolean => paidUntil(w, v.main) >= dayOf(w.clock);
/** Whether she can get in the door to train: already paid today, or can afford it. */
export const canPay = (w: World, v: GymView): boolean => paid(w, v) || w.hero.cash >= v.price;

/** Pay the day pass if it's owed. The owner (or whoever is at the desk) keeps it. */
export function payPass(c: Ctx, v: GymView, tok: Record<string, string | number>): void {
  const { w } = c;
  if (paid(w, v)) {
    tok.pass = 0;
    return;
  }
  const till = find(v, 'owner') ?? find(v, 'desk') ?? v.people.find((n) => n.tags.includes('owner'));
  w.hero.cash -= v.price;
  if (till) till.cash += v.price;
  w.counters[`gympass:${v.main.id}`] = dayOf(w.clock);
  tok.pass = v.price;
}

// ===================================================================== training

/** How good the teaching is: the trainer's level, or less if there is no one. */
export function trainerQuality(v: GymView): number {
  if (hasSituation(v, 'missing_trainer')) return 0.5;
  const t = find(v, 'trainer');
  return t ? 0.7 + 0.1 * t.level : 0.55;
}

export function trainSession(c: Ctx, v: GymView, feature: string, lines: Record<string, string[]>, thoughts: string[]): void {
  const { w, rng } = c;
  const h = w.hero;
  const def = FEATURES[feature];
  const skills = def?.trains ?? v.v.trains;
  const skill = rng.pick(skills);
  const tok: Record<string, string | number> = { gym: v.main.name, skill: SKILLS[skill as keyof typeof SKILLS]?.label ?? skill, feature: def?.label ?? feature, npc: find(v, 'trainer')?.name ?? 'the coach' };
  payPass(c, v, tok);
  const q = trainerQuality(v);
  const fresh = freshness(w, v.loc.id, skill);
  const sore = soreOf(h);
  const xp = 2 * q * (0.5 + 0.5 * fresh) * (1 + 0.1 * (v.info.tier - 1)) * (1 - 0.3 * sore);
  train(c, skill as keyof typeof SKILLS, xp);
  const f = (v.loc.fatigue ??= {});
  f[skill] = (f[skill] ?? 0) + 0.22;
  gainXp(c, 3);
  addSore(h, v.info.variant === 'wellness' ? -0.05 : 0.18 * (0.8 + rng.next() * 0.4));
  const trainer = find(v, 'trainer');
  if (trainer) trainer.affinity += 1;
  if (sore > 0.55) maybeInjure(c, h.maxHp * 0.2, 0.35 * sore);
  const tired = fresh < 0.5;
  const pool = tired ? lines.tired ?? lines.default ?? [] : lines[v.info.variant] ?? lines.default ?? [];
  say(c, `train.${tired ? 'tired' : 'fresh'}`, tired ? 'mixed' : 'good', pool, thoughts, tok, { place: v.main.name, skill: String(tok.skill), level: skillLevel(h, skill as keyof typeof SKILLS), ...(trainer ? { npc: trainer.name } : {}) });
}

// ===================================================================== sparring

export function spar(c: Ctx, v: GymView, lines: { win: string[]; lose: string[]; thought: string[] }): void {
  const { w, rng } = c;
  const h = w.hero;
  const partner = find(v, 'sparrer', rng) ?? find(v, 'regular', rng);
  if (!partner) return;
  const tok: Record<string, string | number> = { gym: v.main.name, npc: partner.name };
  payPass(c, v, tok);
  const res = fight(c, [partner], { cause: 'a sparring session', joiners: false });
  addSore(h, 0.08);
  if (res === 'win') {
    train(c, 'melee', 1);
    train(c, 'athletics', 0.5);
    partner.affinity += 6;
    remember(partner, 'got beaten fairly by Blackbird in the ring');
    say(c, 'spar.win', 'good', lines.win, lines.thought, tok, { place: v.main.name, npc: partner.name });
  } else if (res === 'tossed' || res === 'flee') {
    say(c, 'spar.lose', 'bad', lines.lose, undefined, tok, { place: v.main.name, npc: partner.name });
  }
}

// ===================================================================== the ladder

export interface Rung {
  fighters: Npc[];
  rank: number;
}

/** Everyone in this gym's pit who fights for rank, weakest first. */
export function ladderFighters(w: World, main: Location): Npc[] {
  const pit = roomOf(w, main, 'pit');
  if (!pit) return [];
  return everyoneAt(w, pit.id).filter((n) => n.archetype === 'pit_fighter' && n.alive).sort((a, b) => a.level - b.level);
}

export const banned = (w: World, main: Location): boolean => !!w.counters[`gymban:${main.id}`];

export function ladderBout(c: Ctx, v: GymView, lines: { win: string[]; lose: string[]; top: string[]; thought: string[] }): void {
  const { w, rng } = c;
  const h = w.hero;
  const fighters = ladderFighters(w, v.main).filter((n) => friendly(n) || n.alive);
  const ladder = (v.main.ladder ??= { rank: 0, wins: 0 });
  const foe = fighters[Math.min(ladder.rank, fighters.length - 1)];
  if (!foe) return;
  const fee = 20 * v.info.tier;
  if (h.cash < fee) return;
  h.cash -= fee;
  const tok: Record<string, string | number> = { gym: v.main.name, npc: foe.name, fee, rank: ladder.rank + 1 };
  // A rigged board: the opponent has been told to go down in the third.
  if (v.info.wild === 'rigged_tournament') foe.hp = Math.max(1, Math.ceil(foe.hp * 0.35));
  const res = fight(c, [foe], { cause: 'a ladder bout', joiners: false });
  addSore(h, 0.12);
  if (res === 'win' && ladder.rank < fighters.length) {
    const purse = Math.round(30 * (ladder.rank + 1) * (v.sit?.def.purse ?? 1) * (1 + 0.1 * (v.info.tier - 1)));
    h.cash += purse;
    ladder.rank++;
    ladder.wins++;
    tok.amount = purse;
    fameFrom(c, 1.5 * ladder.rank * (v.sit?.def.fame ?? 1), 'gym');
    foe.affinity -= 4;
    remember(foe, 'lost a ladder bout to Blackbird');
    const top = ladder.rank >= fighters.length;
    if (top) {
      acquire(c, makeItem('champ_belt'));
      const owner = find(v, 'owner');
      if (owner) owner.affinity += 25;
    }
    say(c, top ? 'ladder.top' : 'ladder.win', 'good', top ? lines.top : lines.win, lines.thought, tok, { place: v.main.name, npc: foe.name });
  } else if (res === 'tossed' || res === 'flee') {
    say(c, 'ladder.lose', 'bad', lines.lose, undefined, tok, { place: v.main.name, npc: foe.name });
  }
}

/**
 * She killed someone in the pit. The house rule is a beating, not a death; she held to a kill goal and did it anyway.
 * The paper pays (see bounty.ts), and the pit turns on her.
 */
export function pitKilled(c: Ctx, dead: Npc): void {
  const { w } = c;
  const room = dead.home ? w.locations[dead.home] : undefined;
  const main = gymOf(w, room);
  if (!main) return;
  const everyone = [...everyoneAt(w, main.id), ...main.exits.flatMap((e) => everyoneAt(w, e.to))];
  for (const n of everyone) {
    if (!n.alive || n.tags.includes('robot')) continue;
    if (n.archetype === 'pit_boss') n.hostile = true;
    if (n.tags.includes('owner')) n.affinity -= 60;
    else if (n.tags.includes('staff') || n.archetype === 'pit_fighter') n.affinity -= 30;
    else n.affinity -= 8;
    remember(n, `saw Blackbird kill ${dead.name} in the pit`);
  }
  addHeat(w, main.faction ?? null, 4);
  delete main.ladder;
  w.counters[`gymban:${main.id}`] = 1;
  c.emit('gym', 'bad', { variant: 'pit.killed', text: `The pit goes quiet. ${dead.name} is not getting up, and the pit boss is not smiling. Blackbird is not welcome at ${main.name} any more.`, thought: 'The bounty was real. So were the looks.' });
}

// ===================================================================== shifts

export const shiftsOf = (w: World, main: Location): number => (w.counters[`gymshift:${main.id}`] ??= 1);

/** Called once a beat: she gets less sore, and a busy gym finds work for hands. */
export function tickGyms(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  if (h.sore) {
    const here = w.locations[h.locationId];
    const info = gymOf(w, here)?.gym;
    const steam = here?.gymRoom && info ? featuresIn(info, here.gymRoom.room).includes('steam_bench') : false;
    const physio = here?.gymRoom && info ? featuresIn(info, here.gymRoom.room).includes('physio_table') : false;
    h.sore = Math.max(0, h.sore - (steam || physio ? 0.04 : 0.004));
    if (h.sore < 0.001) delete h.sore;
  }
  for (const loc of Object.values(w.locations)) {
    if (!loc.gym) continue;
    const busy = everyoneAt(w, loc.id).filter((n) => n.alive && !n.hostile).length;
    const key = `gymshift:${loc.id}`;
    w.counters[key] = Math.min(2, (w.counters[key] ?? 1) + 0.006 + 0.003 * busy);
  }
}

export function workShift(c: Ctx, v: GymView, lines: { default: string[]; thought: string[]; tip: string[] }): void {
  const { w, rng } = c;
  const key = `gymshift:${v.main.id}`;
  w.counters[key] = Math.max(0, (w.counters[key] ?? 1) - 1);
  const boss = find(v, 'desk') ?? find(v, 'owner') ?? find(v, 'staff');
  const pay = rng.int(12, 25) + 3 * v.info.tier;
  w.hero.cash += pay;
  train(c, 'hustling', 1);
  if (boss) boss.affinity += 3;
  const tok: Record<string, string | number> = { gym: v.main.name, npc: boss?.name ?? 'the desk', amount: pay };
  const tipped = rng.chance(0.2) && tippable(w, '').length > 0;
  if (tipped) {
    const n = rng.pick(tippable(w, ''));
    (w.mind.bounties ??= {})[n.id] = 'tip';
    tok.tip = n.name;
    say(c, 'shift.tip', 'good', lines.tip, lines.thought, tok, boss ? { npc: boss.name } : {});
  } else say(c, 'shift.done', 'good', lines.default, lines.thought, tok, boss ? { npc: boss.name } : {});
}

