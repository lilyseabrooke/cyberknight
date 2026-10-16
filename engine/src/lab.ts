import { SKILLS, type SkillId } from './content/skills';
import { IMPLANTS, MAX_IMPLANTS } from './content/implants';
import { makeItem } from './content/items';
import { NODES, NODE_IDS, TREE, parseNeed, type Fx, type PerkId, type UpgradeDef } from './content/tree';
import { AMMO } from './content/ammo';
import { driveWeights, TRAITS, type Personality } from './personality';
import type { Hero, Legacy, RunReport, World } from './types';

/**
 * The lab. When Blackbird dies, the backup in the lab is printed into a new body, and the lab
 * assistant (you) gets to spend her account on it before she goes out again. This file is the shop:
 * what a node costs, whether it can be bought, what buying it does to the body she wakes up in.
 *
 * What the lab knows about a run is in `legacy`: the account, the ranks bought, what's been
 * spent. Nothing here touches a night in progress; the few things that matter during one are
 * looked up with `perk` and `growthPct`.
 */

/** What a drop point keeps, before the lab's upgrades. */
export const BASE_CUT = 25;
/** Interest is a lab perk, but it isn't a money machine: this much per rebuild, at most. */
export const INTEREST_CAP = 500;
/** Lab prices never fall below this fraction. */
const MAX_DISCOUNT = 50;

type Owned = Pick<Legacy, 'upgrades'>;

export const rankOf = (l: Owned, id: string): number => l.upgrades?.[id] ?? 0;

/** Every effect she has, once per rank. */
function* owned(l: Owned): Generator<Fx> {
  for (const [id, ranks] of Object.entries(l.upgrades ?? {})) {
    const def = NODES[id];
    if (!def) continue;
    for (let r = 0; r < ranks; r++) yield* def.fx;
  }
}

/** The sum of a perk across everything she owns. */
export function perk(l: Owned, id: PerkId): number {
  let n = 0;
  for (const fx of owned(l)) if ('perk' in fx && fx.perk === id) n += fx.n;
  return n;
}

/** Her combat routines, summed over ranks: art id -> total. One snapshot per fight, so the hot loop never walks the upgrades. */
export function artsOf(l: Owned): Record<string, number> {
  const out: Record<string, number> = {};
  for (const fx of owned(l)) if ('art' in fx) out[fx.art] = (out[fx.art] ?? 0) + fx.n;
  return out;
}

/** One combat routine's total at the lab's say-so, for the few places that are not inside a fight. */
export const art = (l: Owned, id: string): number => artsOf(l)[id] ?? 0;

/** Percentage skill growth she has, for one skill. Group and blanket upgrades count too. */
export function growthPct(l: Owned, skill: SkillId): number {
  let pct = 0;
  const group = SKILLS[skill].group;
  for (const fx of owned(l)) if ('grow' in fx && (fx.grow === skill || fx.grow === group || fx.grow === 'all')) pct += fx.pct;
  return pct;
}

/** What the drop points keep, as a percentage. */
export const dropCut = (l: Owned, siteAdjust = 0): number => Math.max(0, Math.min(60, BASE_CUT + siteAdjust - perk(l, 'fee')));

// ====================================================================== the shop

export type NodeState = 'maxed' | 'available' | 'locked';

/** Needs not yet met. */
export function missing(l: Owned, id: string): string[] {
  const def = NODES[id];
  if (!def) return [];
  return def.needs.filter((n) => {
    const { id: need, rank } = parseNeed(n);
    return rankOf(l, need) < rank;
  });
}

export function priceOf(l: Owned, id: string): number | null {
  const def = NODES[id];
  if (!def) return null;
  const rank = rankOf(l, id);
  if (rank >= def.max) return null;
  const discount = Math.min(MAX_DISCOUNT, perk(l, 'discount'));
  return Math.max(1, Math.round(def.cost * def.step ** rank * (1 - discount / 100)));
}

export function stateOf(l: Owned, id: string): NodeState {
  const def = NODES[id];
  if (!def || rankOf(l, id) >= def.max) return 'maxed';
  return missing(l, id).length ? 'locked' : 'available';
}

export type BuyResult = { ok: true; paid: number; rank: number } | { ok: false; reason: 'unknown' | 'maxed' | 'locked' | 'poor'; need?: number };

/** Buy one rank of a node out of the account. */
export function buy(l: Legacy, id: string): BuyResult {
  const def = NODES[id];
  if (!def) return { ok: false, reason: 'unknown' };
  const price = priceOf(l, id);
  if (price === null) return { ok: false, reason: 'maxed' };
  if (missing(l, id).length) return { ok: false, reason: 'locked' };
  if (l.account < price) return { ok: false, reason: 'poor', need: price - l.account };
  l.account -= price;
  l.spent += price;
  l.upgrades[id] = rankOf(l, id) + 1;
  return { ok: true, paid: price, rank: l.upgrades[id]! };
}

/** Everything bought, as (node, rank) pairs. For the lab's inventory list. */
export const ownedNodes = (l: Owned): { def: UpgradeDef; rank: number }[] =>
  NODE_IDS.filter((id) => rankOf(l, id) > 0).map((id) => ({ def: NODES[id]!, rank: rankOf(l, id) }));

export const treeSize = (): { branches: number; nodes: number; ranks: number } => ({
  branches: TREE.length,
  nodes: NODE_IDS.length,
  ranks: NODE_IDS.reduce((a, id) => a + NODES[id]!.max, 0),
});

// ====================================================================== the body

const TRAIT_FLOOR = 0.05;
const TRAIT_CEIL = 0.95;

/** A personality with some of its traits pushed. The original is left alone: the backup stays as it was. */
function nudged(p: Personality, deltas: Partial<Record<(typeof TRAITS)[number], number>>): Personality {
  const traits = { ...p.traits };
  for (const [t, d] of Object.entries(deltas)) {
    const k = t as keyof typeof traits;
    traits[k] = Math.round(Math.max(TRAIT_FLOOR, Math.min(TRAIT_CEIL, traits[k] + (d ?? 0))) * 100) / 100;
  }
  return { traits, weights: driveWeights(traits) };
}

/** XP that puts a skill at exactly this level (see `skillValue`: level = sqrt(xp / 2)). */
const xpForLevel = (lvl: number): number => 2 * lvl * lvl;

/**
 * Turn the lab's upgrades into the body that walks out the door. The hero must be a fresh one
 * (`makeHero`); this adds to it.
 */
export function applyUpgrades(h: Hero, l: Owned): void {
  const stat = { muscle: 0, reflex: 0, hack: 0, charm: 0 };
  const lvl: Partial<Record<SkillId, number>> = {};
  const traits: Partial<Record<(typeof TRAITS)[number], number>> = {};
  let hp = 0, cash = 0, comp = 0, level = 0, fame = 0;
  let weapon: string | null = null;
  let armor: string | null = null;
  const items: string[] = [];
  const implants: string[] = [];
  for (const fx of owned(l)) {
    if ('stat' in fx) stat[fx.stat] += fx.n;
    else if ('hp' in fx) hp += fx.hp;
    else if ('cash' in fx) cash += fx.cash;
    else if ('comp' in fx) comp += fx.comp;
    else if ('level' in fx) level += fx.level;
    else if ('skill' in fx) lvl[fx.skill] = (lvl[fx.skill] ?? 0) + fx.lvl;
    else if ('item' in fx) for (let i = 0; i < (fx.n ?? 1); i++) items.push(fx.item);
    else if ('ammo' in fx) h.ammo[fx.ammo] = (h.ammo[fx.ammo] ?? 0) + (AMMO[fx.ammo] ? fx.n : 0);
    else if ('implant' in fx) implants.push(fx.implant);
    else if ('weapon' in fx) weapon = !weapon || makeItem(fx.weapon).power > makeItem(weapon).power ? fx.weapon : weapon;
    else if ('armor' in fx) armor = !armor || makeItem(fx.armor).power > makeItem(armor).power ? fx.armor : armor;
    else if ('trait' in fx) traits[fx.trait] = (traits[fx.trait] ?? 0) + fx.n;
    else if ('fame' in fx) fame += fx.fame;
  }

  // Levels first: each one is a bigger tank and a stat, the same as earning it would be.
  for (let i = 0; i < level; i++) {
    h.level++;
    h.maxHp += 12;
    h[(['muscle', 'reflex', 'charm', 'hack'] as const)[h.level % 4]!]++;
  }
  h.maxHp += hp;
  h.hp = h.maxHp;
  for (const k of ['muscle', 'reflex', 'hack', 'charm'] as const) h[k] += stat[k];
  h.cash += cash;
  h.fame += fame;
  h.competence = Math.max(0, Math.min(0.95, h.competence + comp));

  for (const [s, n] of Object.entries(lvl)) h.skills[s] = Math.max(h.skills[s] ?? 0, xpForLevel(n!));
  if (weapon && makeItem(weapon).power > h.weapon.power) h.weapon = makeItem(weapon);
  if (armor && makeItem(armor).power > (h.armor?.power ?? 0)) h.armor = makeItem(armor);
  for (const id of items) h.inventory.push(makeItem(id));
  for (const id of implants) {
    const def = IMPLANTS[id];
    if (!def || h.implants.includes(id) || h.implants.length >= MAX_IMPLANTS) continue;
    h.implants.push(id);
    for (const [k, v] of Object.entries(def.stats ?? {})) h[k as 'muscle'] = Math.max(0, h[k as 'muscle'] + (v ?? 0));
  }
  if (Object.keys(traits).length) h.personality = nudged(h.personality, traits);
}

// ====================================================================== the books

/**
 * Settle a night's money at its end. A hero who made it through the night takes everything she is
 * carrying to the lab; one who died leaves it where she fell, minus whatever share she'd insured.
 * Then the balance earns whatever interest it has coming. Safe to call once per night; later calls do nothing.
 */
export function settleAccount(w: World): RunReport {
  const l = w.legacy;
  if (w.flags.settled && l.report?.run === l.runs) return l.report;
  const carried = Math.max(0, Math.floor(w.hero.cash));
  const ending = w.ending ?? 'dawn';
  const recovered = ending === 'dead' ? Math.floor((carried * Math.min(100, perk(l, 'keep'))) / 100) : carried;
  const before = l.account;
  l.account += recovered;
  const interest = Math.min(INTEREST_CAP, Math.floor((l.account * Math.min(30, perk(l, 'interest'))) / 100));
  l.account += interest;
  w.flags.settled = true;
  const report: RunReport = {
    run: l.runs,
    ending,
    deposited: w.stats.deposited,
    fees: w.stats.fees,
    carried,
    recovered,
    interest,
    level: w.hero.level,
    kills: w.stats.kills,
    beats: w.beat,
    before,
    after: l.account,
  };
  l.report = report;
  return report;
}
