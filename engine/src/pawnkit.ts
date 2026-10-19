import type { Ctx, Hero, Id, Item, Location, Npc, PawnInfo, PawnLot, World } from './types';
import { skillLevel } from './skills';
import { genInstrument, instrumentUsefulness } from './instruments';
import { acquire, addHeat, npcsAt, remember } from './combat';
import { makeItem, ITEMS } from './content/items';
import { ROLLED_GUITAR, FEATURES, SIZES, VARIANTS, WILD, featuresIn, graceDays, holdDays, lotState, offerFraction, redeemPrice, retailPrice, shelfPrice, situationAt, type SituationDef, type VariantDef } from './content/pawns';
import { odds, synergy, train } from './skills';
import { dayOf } from './clock';
import { isFairGame } from './people';
import { everyoneAt } from './population';
import { Rng } from './rng';
import { rating } from './weapons';
import { friendly, roomWhere, runCheckAs, sayAs, type Check, type Kit, type PlaceView } from './placekit';

export { friendly };

/**
 * Everything pawn-shop actions share: how to read the shop she is standing in, the shelf (what is on it, what she hocked
 * and may still buy back), and the handful of actions with real state behind them (hock, buy back, buy, sell, lift,
 * swap). The rows that use these are in content/pawnafford.ts, pawncrime.ts and pawnevents.ts; the candidates are
 * assembled in pawn.ts; what a pawn shop *is* is in content/pawns.ts.
 *
 * The shelf is the only state. A lot hers is held for her for a few days (she can redeem it for what she was paid plus
 * interest), then goes up for retail for a few more, then it is sold on. All of that is a function of the day, so there
 * is no ticket, no due date to track and nothing that can drift.
 */

// ===================================================================== reading a shop

export interface PawnView extends PlaceView {
  info: PawnInfo;
  sit?: { id: string; def: SituationDef };
  v: VariantDef;
  day: number;
}

export const pawnOf = (w: Pick<World, 'locations'>, loc: Location | undefined): Location | undefined => (loc?.pawn ? loc : loc?.pawnRoom ? w.locations[loc.pawnRoom.main] : undefined);

export function viewAt(w: World, at: Id = w.hero.locationId): PawnView | undefined {
  const loc = w.locations[at];
  const main = pawnOf(w, loc);
  const info = main?.pawn;
  if (!loc || !main || !info) return undefined;
  const v = VARIANTS[info.variant];
  if (!v) return undefined;
  ensureShelf(w, main);
  const room = loc.pawnRoom?.room ?? 'floor';
  return { loc, main, info, room, features: featuresIn(info, room), sit: situationAt(w, main), people: npcsAt(w, loc.id), v, day: dayOf(w.clock) };
}

export type Who = 'owner' | 'ganger' | 'broker' | 'clerk' | 'appraiser' | 'tinker' | 'guard' | 'fence' | 'staff' | 'regular' | 'fair' | 'any' | 'none';

export function find(v: PlaceView, who: string | undefined, rng?: { pick<T>(xs: T[]): T }): Npc | undefined {
  const pool = v.people.filter(friendly);
  let xs: Npc[] = [];
  switch (who as Who | undefined) {
    case 'owner': case 'broker': xs = pool.filter((n) => n.tags.includes('owner')); break;
    case 'clerk': xs = pool.filter((n) => n.archetype === 'pawn_clerk' || n.archetype === 'pawn_bot'); break;
    case 'appraiser': xs = pool.filter((n) => n.tags.includes('appraiser')); break;
    case 'tinker': xs = pool.filter((n) => n.tags.includes('tinker')); break;
    case 'guard': xs = pool.filter((n) => n.tags.includes('guard')); break;
    case 'fence': xs = pool.filter((n) => n.archetype === 'pawn_fence'); break;
    case 'ganger': xs = pool.filter((n) => n.archetype === 'ganger'); break;
    case 'staff': xs = pool.filter((n) => n.tags.includes('staff')); break;
    case 'regular': xs = pool.filter((n) => n.archetype === 'pawn_regular'); break;
    case 'fair': xs = pool.filter((n) => isFairGame(n)); break;
    case 'any': xs = pool; break;
    default: return undefined;
  }
  if (!xs.length) return undefined;
  return rng ? rng.pick(xs) : xs[0];
}

/** The room of this shop with this id, if it grew one. */
export const roomOf = (w: Pick<World, 'locations'>, main: Location, room: string): Location | undefined => roomWhere(w, main, 'pawnRoom', room);

export const hasSituation = (v: PlaceView, tag: string): boolean => !!v.sit?.def.tags.includes(tag);
export const banned = (w: World, main: Location): boolean => !!w.counters[`pawnban:${main.id}`];

/** "the pearls": the item as a noun phrase, and the same at the start of a sentence. Item names have no article of their own. */
export const itemTok = (name: string): Record<string, string> => ({ item: `the ${name}`, Item: `The ${name}` });
export const dayTok = (n: number): Record<string, string | number> => ({ days: n, dw: n === 1 ? 'day' : 'days', DW: n === 1 ? 'DAY' : 'DAYS' });

/** The person at the till: the owner, or whoever is minding it. */
export const broker = (v: PlaceView): Npc | undefined => find(v, 'owner') ?? find(v, 'clerk') ?? v.people.find((n) => n.tags.includes('owner'));

// ===================================================================== telling it

export const say = (c: Ctx, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[] | undefined, tok: Record<string, string | number>, extra: Record<string, string | number | boolean> = {}): void => sayAs('pawn', c, id, outcome, lines, thoughts, tok, extra);

const PAWN_KIT: Kit<PawnView> = {
  event: 'pawn',
  name: 'shop',
  fame: 'pawn',
  cause: 'a scene at the pawn shop',
  messed: 'was messed about by Blackbird at the shop',
  find,
  owner: (v) => v.people.find((n) => n.tags.includes('owner')),
  trap: (v) => v.info.wild === 'trap_shop',
  trapText: 'The display was wired.',
};

/** Run a row described as data: pay, roll against her skills, apply a result, tell it, then any fight it starts. */
export const runCheck = (c: Ctx, v: PawnView, id: string, k: Check): void => runCheckAs(PAWN_KIT, c, v, id, k);

// ===================================================================== the shelf

/** What the house stocks and for how long: a function of the shop, the seed and the day it went on. */
function stockLot(w: World, main: Location, rng: Rng, day: number, o: { id?: string; vault?: boolean } = {}): PawnLot | undefined {
  const info = main.pawn!;
  const v = VARIANTS[info.variant]!;
  const ids = Object.keys(v.stock).filter((k) => ITEMS[k] || k === ROLLED_GUITAR);
  if (!ids.length && !o.id) return undefined;
  const id = o.id ?? rng.weighted(ids, (k) => v.stock[k]! * (info.tier >= 4 && ((ITEMS[k]?.value ?? 0) >= 150) ? 1.5 : 1));
  const item = id === ROLLED_GUITAR ? genInstrument(rng, info.tier + rng.int(-1, 2)) : makeItem(id);
  const hasVault = info.rooms.includes('vault');
  const hasCage = info.rooms.includes('cage');
  let room: string | undefined;
  if ((o.vault || item.value >= 250 || item.tags.includes('relic')) && hasVault && rng.chance(0.75)) room = 'vault';
  else if ((item.kind === 'weapon' || item.kind === 'armor' || item.tags.includes('chrome')) && hasCage && rng.chance(0.8)) room = 'cage';
  else if (info.rooms.includes('showroom') && rng.chance(0.25)) room = 'showroom';
  return { item, hers: false, paid: 0, since: day - rng.int(0, 5), until: day + rng.int(3, 16), ...(room ? { room } : {}), ...(item.tags.includes('cursed') ? { cursed: true } : {}) };
}

/** Make the shelf the first time it is looked at; take off what has been sold on; put on what has come in. Safe to call again. */
export function ensureShelf(w: World, main: Location): void {
  const info = main.pawn;
  if (!info) return;
  const day = dayOf(w.clock);
  const stamp = `pawnday:${main.id}`;
  if (!main.shelf) {
    main.shelf = [];
    const rng = new Rng(`pawnstock:${w.worldSeed}:${main.id}:start`);
    const [lo, hi] = SIZES[info.size]!.shelf;
    const n = rng.int(lo, hi) + (info.tier >= 4 ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const lot = stockLot(w, main, rng, day);
      if (lot) main.shelf.push(lot);
    }
    if (info.wild === 'famous_vault') for (let i = 0; i < 3; i++) main.shelf.push(stockLot(w, main, rng, day, { id: ['relic_jacket', 'relic_guitar', 'relic_ring', 'relic_belt'][(i + rng.int(0, 3)) % 4]!, vault: true })!);
    w.counters[stamp] = day;
  }
  main.shelf = main.shelf.filter((l) => ITEMS[l.item.id] || l.item.inst || l.hers).filter((l) => lotState(l, day) !== 'gone');
  // Whatever has come in since she last looked: a day at a time, up to a few days' worth.
  const from = Math.max(w.counters[stamp] ?? day, day - 5);
  const cap = SIZES[info.size]!.shelf[1] + info.tier;
  for (let d = from + 1; d <= day; d++) {
    const rng = new Rng(`pawnstock:${w.worldSeed}:${main.id}:${d}`);
    if (main.shelf.filter((l) => !l.hers).length < cap && rng.chance(0.5 + 0.05 * info.tier)) {
      const lot = stockLot(w, main, rng, d);
      if (lot) main.shelf.push(lot);
    }
  }
  w.counters[stamp] = day;
  // Whatever came in a few days ago and was priced to go may already be gone.
  main.shelf = main.shelf.filter((l) => lotState(l, day) !== 'gone');
  if (info.wild === 'boomerang' && !main.shelf.some((l) => l.cursed)) {
    main.shelf.push({ item: makeItem('cursed_charm'), hers: false, paid: 0, since: day, until: day + 6, cursed: true });
  }
}

/** Lots she can see and deal over the counter (hers anywhere; the house's from the floor or the showroom). */
export const counterLots = (v: PawnView): PawnLot[] => (v.main.shelf ?? []).filter((l) => lotState(l, v.day) !== 'gone' && (l.hers || !l.room || l.room === 'showroom'));
export const herLots = (v: PawnView): PawnLot[] => (v.main.shelf ?? []).filter((l) => l.hers && lotState(l, v.day) !== 'gone');
/** Lots that are physically in the room she is standing in. */
export const lotsInRoom = (v: PawnView): PawnLot[] => (v.main.shelf ?? []).filter((l) => lotState(l, v.day) !== 'gone' && (l.room ?? 'floor') === v.room);

const NEVER_HOCK = ['key', 'med', 'stim', 'ammo', 'dish', 'paint', 'quest'];
const HOT = ['corp', 'gang', 'dragon', 'hot'];
export const isHot = (i: Item): boolean => i.tags.some((t) => HOT.includes(t));

/** What she could hock: not what she is wielding or wearing, not her best melee backup, not keys or consumables. */
export function hockable(h: Hero): Item[] {
  const backup = h.inventory.filter((i) => i.kind === 'weapon' && i.tags.includes('melee')).sort((a, b) => b.power - a.power)[0];
  return h.inventory.filter((i) => ['loot', 'weapon', 'armor', 'gadget'].includes(i.kind) && i.value >= 8 && !i.tags.some((t) => NEVER_HOCK.includes(t)) && i !== backup);
}

const removeLot = (main: Location, lot: PawnLot): void => {
  main.shelf = (main.shelf ?? []).filter((l) => l !== lot);
};

/** How much of the broker's till there is to pay out with. */
const till = (v: PlaceView, n: Npc | undefined): number => (v.main.pawn?.wild === 'bottomless' ? Infinity : Math.max(0, Math.floor(n?.cash ?? 0)));

// ===================================================================== haggling

/** The roll behind any price she argues about. */
export function haggle(c: Ctx, v: PawnView, extra = 0): boolean {
  const { w, rng } = c;
  const info = v.info;
  if (info.wild === 'savant') return false;
  let p = odds(0.45, 0.06, synergy(w.hero, ['haggling', ['stat:charm', 0.5], ['streetwise', 0.3]]), 0.05, 0.9) + extra;
  if (info.traits.includes('no_haggle')) p -= 0.25;
  if (info.traits.includes('haggle_welcome')) p += 0.15;
  const a = find(v, 'appraiser');
  if (a) p -= 0.02 * a.level;
  if (info.wild === 'trap_shop') p -= 0.1;
  return rng.chance(Math.max(0.03, Math.min(0.95, p)));
}

// ===================================================================== hock, buy back, buy, sell

export interface HockLines {
  win: string[];
  lose: string[];
  /** The broker refuses (a hot thing, or the till is light). */
  refuse: string[];
  thought: string[];
}

function chooseHockItem(c: Ctx): Item | undefined {
  const items = hockable(c.w.hero);
  return items.length ? c.rng.weighted(items, (i) => i.value + 5) : undefined;
}

export function hockOne(c: Ctx, v: PawnView, lines: HockLines): void {
  const { w, rng } = c;
  const h = w.hero;
  const boss = broker(v);
  const item = chooseHockItem(c);
  if (!boss || !item) return;
  const info = v.info;
  const tok: Record<string, string | number> = { shop: v.main.name, npc: boss.name, ...itemTok(item.name), ...dayTok(0), tail: '' };
  const hot = isHot(item);
  if (hot && (info.variant === 'atlasasset' || info.wild === 'sting')) {
    addHeat(w, info.variant === 'atlasasset' || info.wild === 'sting' ? 'atlas' : v.main.faction ?? null, 2);
    boss.affinity -= 3;
    say(c, 'hock.refuse', 'bad', lines.refuse, lines.thought, tok, { place: v.main.name, npc: boss.name });
    return;
  }
  let frac = offerFraction(info, v.sit?.def);
  const a = find(v, 'appraiser');
  if (a) frac *= 0.9 + 0.04 * a.level;
  if (hot && (info.traits.includes('fence_front') || info.traits.includes('gang_drop'))) frac *= 1.3;
  if (w.counters[`pawnhot:${v.main.id}`]) frac *= 0.8;
  const win = haggle(c, v);
  const offer = Math.max(1, Math.round(item.value * frac * (win ? 1.3 : 0.9)));
  const cap = till(v, boss);
  if (cap < Math.max(1, offer * 0.5)) {
    say(c, 'hock.dry', 'bad', lines.refuse, lines.thought, { ...tok, tail: ' The till is nearly empty.' }, { place: v.main.name, npc: boss.name });
    return;
  }
  const pay = Math.min(offer, Math.floor(cap));
  h.inventory = h.inventory.filter((i) => i !== item);
  h.cash += pay;
  if (Number.isFinite(cap)) boss.cash -= pay;
  const hold = holdDays(info, rng);
  const day = v.day;
  const room = item.value >= 250 && info.rooms.includes('vault') ? 'vault' : undefined;
  v.main.shelf!.push({ item, hers: true, paid: pay, since: day, held: day + hold, until: day + hold + graceDays(info), ...(room ? { room } : {}), ...(item.tags.includes('cursed') ? { cursed: true } : {}) });
  train(c, 'haggling', win ? 2 : 1);
  boss.affinity += win ? -1 : 1;
  tok.pay = pay;
  Object.assign(tok, dayTok(hold));
  tok.value = item.value;
  if (info.wild === 'sting') {
    addHeat(w, 'atlas', 1.5);
    tok.tail = ' The scanner chirps. Somewhere, a database is delighted.';
  } else if (info.variant === 'atlasasset') {
    addHeat(w, 'atlas', 0.3);
    tok.tail = ' The scanner logs the serial. Of course it does.';
  }
  say(c, win ? 'hock.win' : 'hock.lose', win ? 'good' : 'mixed', win ? lines.win : lines.lose, lines.thought, tok, { place: v.main.name, npc: boss.name });
}

export interface BackLines {
  /** Still in the hold: the price is what she was paid plus interest. */
  held: string[];
  /** Past the hold: up for retail. */
  forfeit: string[];
  /** The broker will not budge. */
  refuse: string[];
  thought: string[];
}

export function redeemOne(c: Ctx, v: PawnView, lines: BackLines): void {
  const { w } = c;
  const h = w.hero;
  const boss = broker(v);
  const lots = herLots(v)
    .map((l) => ({ l, state: lotState(l, v.day), price: lotState(l, v.day) === 'held' ? redeemPrice(v.info, l, v.day) : shelfPrice(v.info, l, v.sit?.def) }))
    .filter((x) => x.price <= h.cash)
    .sort((a, b) => b.l.item.value - a.l.item.value);
  const pick = lots[0];
  if (!boss || !pick) return;
  const { l, state } = pick;
  const win = haggle(c, v);
  const price = Math.max(1, Math.round(pick.price * (win ? 0.85 : 1)));
  const tok: Record<string, string | number> = { shop: v.main.name, npc: boss.name, ...itemTok(l.item.name), pay: price, paid: l.paid, ...dayTok(Math.max(1, v.day - l.since)), tail: '' };
  if (price > h.cash) {
    say(c, 'redeem.refuse', 'bad', lines.refuse, lines.thought, tok, { place: v.main.name, npc: boss.name });
    return;
  }
  h.cash -= price;
  boss.cash += price;
  removeLot(v.main, l);
  acquire(c, l.item);
  train(c, 'haggling', 1);
  boss.affinity += 2;
  tok.saved = win ? ' Knocked a little off, too.' : '';
  say(c, `redeem.${state}`, 'good', state === 'held' ? lines.held : lines.forfeit, lines.thought, tok, { place: v.main.name, npc: boss.name });
}

/** How much a thing would help her: weapons and armor by what they add over what she wields, anything else by its worth. */
export function usefulness(h: Hero, item: Item): number {
  const tune = instrumentUsefulness(h, item, skillLevel(h, 'guitar'));
  if (tune > 0) return Math.max(tune, item.kind === 'weapon' ? Math.max(0, rating(item) - rating(h.weapon)) / Math.max(4, rating(h.weapon)) : 0);
  if (item.kind === 'weapon' || item.kind === 'gadget') return Math.max(0, rating(item) - rating(h.weapon)) / Math.max(4, rating(h.weapon));
  if (item.kind === 'armor') return Math.max(0, item.power - (h.armor?.power ?? 0)) / 4;
  return 0;
}

export interface BuyLines {
  win: string[];
  /** It turned out to be a copy. */
  fake: string[];
  /** The cursed one. */
  cursed: string[];
  refuse: string[];
  thought: string[];
}

export function buyOne(c: Ctx, v: PawnView, lines: BuyLines): void {
  const { w, rng } = c;
  const h = w.hero;
  const boss = broker(v);
  const lots = counterLots(v)
    .filter((l) => !l.hers)
    .map((l) => ({ l, price: shelfPrice(v.info, l, v.sit?.def) }))
    .filter((x) => x.price <= h.cash);
  if (!boss || !lots.length) return;
  const { l, price: ask } = rng.weighted(lots, (x) => 0.3 + 3 * usefulness(h, x.l.item) + x.l.item.value / 200);
  const win = haggle(c, v, 0.05);
  const price = Math.max(1, Math.round(ask * (win ? 0.8 : 1)));
  const tok: Record<string, string | number> = { shop: v.main.name, npc: boss.name, ...itemTok(l.item.name), pay: price, ask, tail: '' };
  if (price > h.cash) {
    say(c, 'buy.refuse', 'bad', lines.refuse, lines.thought, tok, { place: v.main.name, npc: boss.name });
    return;
  }
  h.cash -= price;
  boss.cash += price;
  removeLot(v.main, l);
  train(c, 'haggling', win ? 2 : 1);
  boss.affinity += 1;
  let got = l.item;
  let said = lines.win;
  let id = 'buy.win';
  if (v.info.wild === 'counterfeit' && rng.chance(0.55)) {
    got = makeItem('fake_watch');
    Object.assign(tok, itemTok(got.name));
    said = lines.fake;
    id = 'buy.fake';
  } else if (l.cursed) {
    said = lines.cursed;
    id = 'buy.cursed';
    h.hp = Math.max(1, h.hp - 4);
    // It does not stay bought: by the time she looks again, it is back on the shelf.
    v.main.shelf!.push({ item: makeItem(l.item.id), hers: false, paid: 0, since: v.day, until: v.day + 6, cursed: true });
  }
  acquire(c, got);
  say(c, id, id === 'buy.win' ? 'good' : 'mixed', said, lines.thought, tok, { place: v.main.name, npc: boss.name });
}

export interface SellLines {
  win: string[];
  refuse: string[];
  thought: string[];
}

/** Sell outright: more than a hock would pay, and it is gone for good (onto the house's own shelf). */
export function sellOne(c: Ctx, v: PawnView, lines: SellLines): void {
  const { w, rng } = c;
  const h = w.hero;
  const boss = broker(v);
  const item = chooseHockItem(c);
  if (!boss || !item) return;
  const tok: Record<string, string | number> = { shop: v.main.name, npc: boss.name, ...itemTok(item.name), tail: '' };
  if (isHot(item) && (v.info.variant === 'atlasasset' || v.info.wild === 'sting')) {
    addHeat(w, 'atlas', 2);
    say(c, 'sell.refuse', 'bad', lines.refuse, lines.thought, tok, { place: v.main.name, npc: boss.name });
    return;
  }
  const win = haggle(c, v);
  const frac = Math.min(0.85, offerFraction(v.info, v.sit?.def) * 1.5);
  const offer = Math.max(1, Math.round(item.value * frac * (win ? 1.2 : 0.95)));
  const cap = till(v, boss);
  if (cap < Math.max(1, offer * 0.5)) {
    say(c, 'sell.dry', 'bad', lines.refuse, lines.thought, { ...tok, tail: ' The till is nearly empty.' }, { place: v.main.name, npc: boss.name });
    return;
  }
  const pay = Math.min(offer, Math.floor(cap));
  h.inventory = h.inventory.filter((i) => i !== item);
  h.cash += pay;
  if (Number.isFinite(cap)) boss.cash -= pay;
  v.main.shelf!.push({ item, hers: false, paid: 0, since: v.day, until: v.day + rng.int(6, 14) });
  train(c, 'haggling', 1);
  tok.pay = pay;
  say(c, 'sell.win', 'good', lines.win, lines.thought, tok, { place: v.main.name, npc: boss.name });
}

// ===================================================================== lifting, swapping

const ranked = (rng: Rng, lots: PawnLot[]): PawnLot[] => [...lots].sort((a, b) => b.item.value * (0.6 + rng.next() * 0.8) - a.item.value * (0.6 + rng.next() * 0.8));

/** Take up to `n` lots off the shelf in this room, best first. What she takes is hot to this shop for good. */
export function liftLots(n: [number, number], o: { room?: string } = {}): NonNullable<import('./placekit').Result['apply']> {
  return (c, view, _who, tok) => {
    const v = view as PawnView;
    const here = (v.main.shelf ?? []).filter((l) => lotState(l, v.day) !== 'gone' && (l.room ?? 'floor') === (o.room ?? v.room));
    const take = ranked(c.rng, here).slice(0, c.rng.int(n[0], n[1]));
    if (!take.length) {
      Object.assign(tok, { item: 'nothing worth the risk', Item: 'Nothing worth the risk' });
      tok.amount = 0;
      return;
    }
    let total = 0;
    for (const l of take) {
      removeLot(v.main, l);
      acquire(c, l.item);
      total += l.item.value;
    }
    Object.assign(tok, itemTok(take.length === 1 ? take[0]!.item.name : `${take[0]!.item.name} and ${take.length - 1} more`));
    tok.amount = total;
    c.w.counters[`pawnhot:${v.main.id}`] = (c.w.counters[`pawnhot:${v.main.id}`] ?? 0) + 1;
  };
}

/** Put a copy in the place of the real thing and walk out with it. */
export function swapLot(): NonNullable<import('./placekit').Result['apply']> {
  return (c, view, _who, tok) => {
    const v = view as PawnView;
    const lot = ranked(c.rng, (v.main.shelf ?? []).filter((l) => lotState(l, v.day) !== 'gone' && (l.room ?? 'floor') === v.room && !l.item.tags.includes('fake')))[0];
    if (!lot) {
      Object.assign(tok, { item: 'nothing worth the swap', Item: 'Nothing worth the swap' });
      return;
    }
    acquire(c, lot.item);
    Object.assign(tok, itemTok(lot.item.name));
    tok.amount = lot.item.value;
    lot.item = makeItem('fake_watch');
    c.w.counters[`pawnhot:${v.main.id}`] = (c.w.counters[`pawnhot:${v.main.id}`] ?? 0) + 1;
  };
}

/** The shop will not deal with her any more. */
export function banShop(): NonNullable<import('./placekit').Result['apply']> {
  return (c, view) => {
    c.w.counters[`pawnban:${view.main.id}`] = 1;
  };
}

// ===================================================================== time

/** Called once a beat: the shelf turns over, and a busy shop's till fills a little. */
export function tickPawns(c: Ctx): void {
  const { w } = c;
  for (const loc of Object.values(w.locations)) {
    if (!loc.pawn || !loc.shelf) continue;
    ensureShelf(w, loc);
    const owner = everyoneAt(w, loc.id).find((n) => n.alive && n.tags.includes('owner'));
    if (!owner) continue;
    const busy = everyoneAt(w, loc.id).filter((n) => n.alive && !n.hostile).length;
    const cap = 150 * loc.pawn.tier;
    owner.cash = Math.min(Math.max(owner.cash, cap), owner.cash + 0.4 + 0.1 * busy);
  }
}

export const featureLabel = (f: string): string => FEATURES[f]?.label ?? f;
export { WILD };
export const wildOf = (v: PlaceView): string | undefined => v.main.pawn?.wild;
export const priceOf = (v: PawnView, item: Item): number => retailPrice(v.info, item, v.sit?.def);
