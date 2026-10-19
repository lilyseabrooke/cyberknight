import type { Ctx, Deed, District, Hero, Id, Location, Npc, World } from './types';
import { spawnGroup, type Candidate } from './candidate';
import { nested } from './events';
import { Rng, hashString } from './rng';
import { fight, here, relocate, remember } from './combat';
import { BASE_MIN_PER_BEAT, phaseOf, type Phase } from './clock';
import { perk } from './lab';
import { everyoneAt, hauntersOf } from './population';
import { placeAt } from './movement';
import { traitOf } from './character';
import { sneakBonus } from './extras';
import { expireBuffs, price as haggle } from './supply';
import { isShut } from './shutdown';
import { workingCameras } from './witness';
import { hungerUrge, sleepUrge } from './urges';
import { homeDeed, ownedHomes } from './deeds';
import {
  CELL_QUALITY, FAINT_HOURS, FAINT_QUALITY, FOOD, LODGING, LODGING_IDS, LODGING_NAMES, ROUGH_QUALITY, STREET_QUALITY,
  type FoodId, type LodgingId,
} from './content/lodging';
import {
  HUNGER_WAKE, NIGHT_HOURS, DEBT_PIVOT, debtOf, settleDebt, effectiveQuality, hoursBeforeHungerWakes, hungerOf, hungerTier, nightHours, refreshFx, sleepOf, sleepTier, wearDown,
} from './needs';

/**
 * Staying fed and staying rested. `needs.ts` is the arithmetic; this is what she does about it, and what the city does about her.
 *
 *  - **Eating** is easy: a stall on the street, a plate at a bar, a bagel at the gun shop, the noodles in her pocket, or whatever
 *    is in a bin when she is broke.
 *  - **Sleeping** is not. A pod, a hostel bunk or a hotel room is a bed for the night (always eight hours, unless something
 *    interrupts it) and its quality is how much of the Sleep bar comes back. The street is free and ruinous: thieves, patrols,
 *    and with any heat on her, the people who are looking. A quiet corner is better, but she is still lying on the floor, and
 *    over eight hours the people who turn up are simulated, one hour at a time, down to who they are and what they would do.
 *  - **Passing out** (Sleep at zero) happens wherever she is standing, for a few hours, and does little good.
 *  - **Starving** (Hunger at zero) ends the night.
 */

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * A need is a mood until it isn't. Under this much urge she'd rather carry on; over it she has made up her mind, and goes and
 * does something about it now, rather than trailing about for hours half-hungry with her goals tugging the other way.
 */
const DECIDED = 0.8;
const decided = (urge: number): number => (urge >= DECIDED ? 2.5 + urge : urge);

// ===================================================================== where things are

/** A number from 0 to 99 that is always the same for this place and this question. */
const roll = (w: World, loc: Location, label: string): number => hashString(`svc:${w.worldSeed}:${loc.id}:${label}`) % 100;

const isStreet = (loc: Location): boolean => loc.kind === 'street' && loc.outdoors && !loc.dungeon;

/** Chance, by district, that a street has each kind of bed on it. */
const BED_ODDS: Record<District, Record<LodgingId, number>> = {
  market: { pod: 60, hostel: 40, hotel: 35 },
  nightlife: { pod: 65, hostel: 40, hotel: 40 },
  tenement: { pod: 75, hostel: 35, hotel: 0 },
  industrial: { pod: 55, hostel: 25, hotel: 0 },
  corporate: { pod: 35, hostel: 0, hotel: 65 },
  slum: { pod: 70, hostel: 30, hotel: 0 },
};

/** Chance a street has a food stall on it. */
const STALL_ODDS: Record<District, number> = { market: 85, nightlife: 75, tenement: 60, industrial: 40, corporate: 55, slum: 50 };

/** The beds on offer along a street. Strand Street, where she starts, has all three. */
export function lodgingAt(w: World, loc: Location): LodgingId[] {
  if (!isStreet(loc)) return [];
  if (loc.id === 'street_main') return [...LODGING_IDS];
  if (loc.gen?.role !== 'street') return [];
  const odds = BED_ODDS[loc.gen.district];
  return LODGING_IDS.filter((id) => roll(w, loc, `bed:${id}`) < odds[id]);
}

/** What the place is called, for the log. */
export function lodgingName(w: World, loc: Location, id: LodgingId): string {
  const names = LODGING_NAMES[id];
  return names[hashString(`bedname:${w.worldSeed}:${loc.id}:${id}`) % names.length]!;
}

const STALLS = ['a noodle cart', 'a dumpling stall', 'a skewer grill', 'a ramen truck', 'a synth-kebab van', 'a hot-oil counter'];

/** Is there a food stall on this street? */
export function stallAt(w: World, loc: Location): boolean {
  if (!isStreet(loc)) return false;
  if (loc.id === 'street_main') return true;
  return loc.gen?.role === 'street' && roll(w, loc, 'stall') < STALL_ODDS[loc.gen.district];
}

const stallName = (w: World, loc: Location): string => STALLS[hashString(`stall:${w.worldSeed}:${loc.id}`) % STALLS.length]!;

/** Somewhere she can probably get a meal. Whether anyone is serving right now is for the candidate to decide. */
const foodSpot = (w: World, loc: Location): boolean => stallAt(w, loc) || loc.id === 'halo_floor' || loc.id === 'gun_shop' || loc.gen?.role === 'bar';

/** A corner where nobody is likely to trip over her: out of the crowd, and not somebody's shop or home. */
export function quietSpot(loc: Location): boolean {
  return !loc.crowded && !loc.dungeon && loc.id !== 'street_main' && !['shop', 'clinic', 'corp', 'boss', 'lair', 'home'].includes(loc.kind);
}

const lodgingPrice = (w: World, id: LodgingId): number => haggle(w.hero, LODGING[id].price * (1 - clamp(perk(w.legacy, 'lodging'), 0, 60) / 100));

// ===================================================================== errands

interface Errand {
  loc: Id;
  dist: number;
  next: Id;
}

/** Every place she knows how to get to, with the cost of the way and the first step. Hidden doors and shut doors don't count. */
function reachFrom(w: World, from: Id, maxCost: number): Map<Id, { dist: number; next: Id }> {
  const out = new Map<Id, { dist: number; next: Id }>([[from, { dist: 0, next: from }]]);
  const open: Id[] = [from];
  const done = new Set<Id>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (out.get(open[i]!)!.dist < out.get(open[bi]!)!.dist) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    done.add(cur);
    const here0 = out.get(cur)!;
    for (const e of w.locations[cur]?.exits ?? []) {
      if (e.hidden || done.has(e.to) || !w.locations[e.to] || isShut(w, e.to)) continue;
      const d = here0.dist + 1 + (e.gate ? 3 : 0);
      if (d > maxCost) continue;
      const known = out.get(e.to);
      if (!known || d < known.dist) {
        if (!known) open.push(e.to);
        out.set(e.to, { dist: d, next: cur === from ? e.to : here0.next });
      }
    }
  }
  return out;
}

const errandMemo = new WeakMap<World, { key: string; food: Errand | null; bed: Errand | null }>();

/** The nearest meal and the nearest bed, other than where she is standing, that she can pay for. */
export function errands(w: World): { food: Errand | null; bed: Errand | null } {
  const h = w.hero;
  const key = `${w.beat}:${h.locationId}:${h.cash >= LODGING.pod.price}:${h.cash >= 6}:${ownedHomes(w).length}`;
  const memo = errandMemo.get(w);
  if (memo?.key === key) return memo;
  let food: Errand | null = null;
  let bed: Errand | null = null;
  const cheapestBed = Math.min(...LODGING_IDS.map((id) => lodgingPrice(w, id)));
  // Where she stands might already do. If so there's no errand: the candidate for it is on offer right here.
  const here0 = w.locations[h.locationId]!;
  const fedHere = eatCandidates(w, true).some((c) => c.key !== 'scrounge');
  const homes = new Set(ownedHomes(w).map((d) => d.home));
  const bedHere = homes.has(here0.id) || (h.cash >= cheapestBed && lodgingAt(w, here0).length > 0);
  for (const [id, r] of reachFrom(w, h.locationId, 14)) {
    if (id === h.locationId) continue;
    const loc = w.locations[id]!;
    if (!fedHere && h.cash >= FOOD.bagel.price && foodSpot(w, loc) && (!food || r.dist < food.dist)) food = { loc: id, ...r };
    // A home she owns is a bed whatever is in her pocket.
    if (!bedHere && (homes.has(id) || (h.cash >= cheapestBed && lodgingAt(w, loc).length)) && (!bed || r.dist < bed.dist)) bed = { loc: id, ...r };
  }
  const fresh = { key, food, bed };
  errandMemo.set(w, fresh);
  return fresh;
}

/** Pulls her toward the next step on the way to a meal or a bed when she needs one. Added to the exit candidates. */
export function needsUrge(w: World, dest: Id): { bonus: number; smart: number } {
  const h = w.hero;
  const none = { bonus: 0, smart: 0 };
  if (dest === h.locationId) return none;
  const hu = hungerUrge(h);
  const su = sleepUrge(h);
  if (hu < DECIDED && su < DECIDED) return none;
  const e = errands(w);
  let bonus = 0;
  if (e.food?.next === dest && hu >= DECIDED) bonus = Math.max(bonus, (1.6 * decided(hu)) / (1 + 0.12 * e.food.dist));
  if (e.bed?.next === dest && su >= DECIDED) bonus = Math.max(bonus, (1.6 * decided(su)) / (1 + 0.12 * e.bed.dist));
  return bonus ? { bonus, smart: 1 } : none;
}

const NEED_FAMILIES = new Set(['sleep_home', 'sleep_pod', 'sleep_hostel', 'sleep_hotel', 'sleep_street', 'sleep_rough', 'eat_stall', 'eat_bagel', 'eat_plate', 'eat_noodles', 'eat_dish', 'scrounge', 'buy_noodles', 'cook']);

/** Added to every candidate's score. Hungry and tired, nothing else is quite as interesting (walking somewhere included, bar the way to a meal or a bed: see `needsUrge`). */
export function needsBias(w: World, cand: { key: string }): number {
  const h = w.hero;
  const hu = hungerUrge(h);
  const su = sleepUrge(h);
  if (hu < 0.3 && su < 0.3) return 0;
  if (NEED_FAMILIES.has(cand.key.split(':')[0]!)) return 0;
  return -(0.35 * decided(hu) + 0.5 * decided(su));
}

// ===================================================================== eating

/** Put food in her. The lab's metabolism upgrades make a meal go further. Returns the hunger it actually restored. */
export function feed(w: World, gain: number): number {
  const h = w.hero;
  const before = hungerOf(h);
  h.hunger = Math.min(100, before + Math.round(gain * (1 + perk(w.legacy, 'foodValue') / 100)));
  refreshFx(w);
  return Math.round(h.hunger - before);
}

const present = (w: World, ...archetypes: string[]): Npc | undefined => here(w).find((n) => archetypes.includes(n.archetype) && !n.hostile);

function eatCandidates(w: World, anyHunger = false): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const hu = hungerUrge(h);
  if (!anyHunger && (hungerOf(h) > 85 || hu <= 0)) return out;
  const meal = (key: string, food: FoodId, run: (c: Ctx) => void, extra = 0): void => {
    const cost = haggle(h, FOOD[food].price);
    if (h.cash < cost) return;
    out.push({ key, drives: {}, bonus: 1.1 * decided(hu) + extra - (0.8 * cost) / Math.max(cost, h.cash), smart: 0.4 * hu, run });
  };
  if (stallAt(w, loc)) meal('eat_stall', 'stall', (c) => eatOut(c, 'stall'));
  if (loc.id === 'gun_shop' && present(w, 'gunsmith')) meal('eat_bagel', 'bagel', (c) => eatOut(c, 'bagel'));
  if (loc.kind === 'bar' && present(w, 'barkeep', 'bartender', 'cook')) meal('eat_plate', 'plate', (c) => eatOut(c, 'plate'), 0.2);
  // Broke and hungry: somebody threw something away.
  if (isStreet(loc) && (anyHunger || hungerOf(h) < 60)) {
    out.push({ key: 'scrounge', drives: {}, bonus: 0.6 * decided(hu) - 0.5, smart: 0.2 * hu, risk: 0.15, run: scrounge });
  }
  return out;
}

function eatOut(c: Ctx, kind: 'stall' | 'bagel' | 'plate'): void {
  const { w } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const cost = haggle(h, FOOD[kind].price);
  h.cash -= cost;
  const gain = feed(w, FOOD[kind].gain);
  const cook = kind === 'stall' ? stallName(w, loc) : kind === 'bagel' ? 'Bullets & Bagels' : present(w, 'barkeep', 'bartender', 'cook')?.name ?? 'the bar';
  c.emit('eat', 'good', { variant: kind, place: loc.name, cook, cost, gain, hunger: Math.round(hungerOf(h)) });
}

function scrounge(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  if (rng.chance(0.18)) {
    h.hp = Math.max(1, h.hp - 6);
    const gain = feed(w, FOOD.scraps.gain / 2);
    c.emit('eat', 'bad', { variant: 'scraps_sick', place: loc.name, cost: 0, gain, hunger: Math.round(hungerOf(h)) });
    return;
  }
  const gain = feed(w, FOOD.scraps.gain);
  c.emit('eat', 'mixed', { variant: 'scraps', place: loc.name, cost: 0, gain, hunger: Math.round(hungerOf(h)) });
}

// ===================================================================== choosing a bed

/**
 * How expensive her tastes are, -1 (a pod is a bed, a bed is a bed) to 1 (she'd like the hotel, please): vain, show-off
 * girls like nice things, and the unfussy don't care.
 */
export function luxuryTaste(h: Hero): number {
  const t = h.personality.traits;
  return clamp(2 * (0.6 * (t.vanity - 0.5) + 0.4 * (t.impress - 0.5)), -1, 1);
}

/**
 * What she'd like of a bed beyond what she needs, because she is human: a nicer one is a nicer night, whatever the debt says.
 * Expensive tastes make it count for a lot (and the price less); cheap ones for nothing.
 */
export function wantsBetter(h: Hero, quality: number): number {
  const taste = luxuryTaste(h);
  return Math.max(0, quality - LODGING.pod.quality) * 3 * clamp(1 + 1.5 * taste, 0, 2.5);
}

export function restCandidates(w: World): Candidate[] {
  const out = eatCandidates(w);
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const su = sleepUrge(h);
  if (su <= 0 || loc.dungeon) return out;
  let paid = false;
  // Her own bed, if this is it: free, and nobody comes in.
  const own = homeDeed(w, loc);
  if (own) {
    paid = true;
    const q = effectiveQuality(w.legacy, own.quality);
    out.push({
      key: 'sleep_home', drives: {}, smart: 0.3 * su,
      bonus: decided(su) * 1.2 + (q - DEBT_PIVOT) * 4 * (1 + debtOf(h)) + wantsBetter(h, q) + 0.5,
      run: (c) => sleepOut(c, homePlan(own, loc)),
    });
  }
  for (const id of lodgingAt(w, loc)) {
    const def = LODGING[id];
    const cost = lodgingPrice(w, id);
    if (h.cash < cost) continue;
    paid = true;
    const q = effectiveQuality(w.legacy, def.quality);
    out.push({
      key: `sleep_${id}`, drives: {}, smart: 0.3 * su,
      // A better bed is worth more to someone who is carrying sleep debt: it's the only thing that clears it.
      bonus: decided(su) * 1.2 + (q - DEBT_PIVOT) * 4 * (1 + debtOf(h)) + wantsBetter(h, q) - (1.2 * cost * clamp(1 - 0.5 * luxuryTaste(h), 0.3, 1.6)) / Math.max(cost, h.cash) - def.rob * 2,
      run: (c) => sleepOut(c, lodgingPlan(c.w, loc, id)),
    });
  }
  // No bed she can pay for: the floor. Only when it's getting serious.
  if (!paid && su >= 0.8) {
    const heat = Math.max(w.heat.npd ?? 0, w.heat.atlas ?? 0);
    if (isStreet(loc)) out.push({ key: 'sleep_street', drives: {}, bonus: 0.6 * decided(su), risk: 1.4 + 0.5 * heat, run: (c) => bedDown(c, 'street') });
    if (quietSpot(loc)) out.push({ key: 'sleep_rough', drives: {}, bonus: 0.7 * decided(su), risk: 0.5 + 0.25 * heat, run: (c) => bedDown(c, 'rough') });
  }
  return out;
}

// ===================================================================== a night's sleep

type Mode = 'lodging' | 'street' | 'rough' | 'hostile';
type Venue = LodgingId | 'home' | 'street' | 'rough' | 'faint';

interface Plan {
  venue: Venue;
  /** What the place is, for the dangers: a bed with a lock, the open street, a quiet corner, or somewhere that wants her gone. */
  mode: Mode;
  /** 0..1: how good the sleep is, before the lab's help. Decides the sleep debt it adds or clears. */
  quality: number;
  /** Hours the sleep would take at full length (the lab can shorten it). */
  nominal: number;
  price: number;
  rob: number;
  name: string;
}

const lodgingPlan = (w: World, loc: Location, id: LodgingId): Plan => ({
  venue: id, mode: 'lodging', quality: LODGING[id].quality, nominal: NIGHT_HOURS, price: lodgingPrice(w, id), rob: LODGING[id].rob, name: lodgingName(w, loc, id),
});

/** A night in a home she owns: a bed with a lock, nothing to pay, and a quality that is the home's. */
const homePlan = (own: Deed, loc: Location): Plan => ({
  venue: 'home', mode: 'lodging', quality: own.quality, nominal: NIGHT_HOURS, price: 0, rob: 0, name: loc.name,
});

/** Lie down where she is: out in the open (`street`) or in a corner nobody is likely to look into (`rough`). Free, and it shows. */
export const bedDown = (c: Ctx, venue: 'street' | 'rough'): void =>
  sleepOut(c, { venue, mode: venue, quality: venue === 'street' ? STREET_QUALITY : ROUGH_QUALITY, nominal: NIGHT_HOURS, price: 0, rob: 0, name: '' });

/** Why the sleep ended before the alarm, if it did. */
type Stop =
  | { end: 'woken' | 'fight' }
  | { end: 'jail' | 'captured'; extra: number; fine: number };

interface Night {
  plan: Plan;
  hours: number;
  /** Everyone who has already made up their mind about her tonight. */
  seen: Set<string>;
  /** The hour a lodging thief strikes, or -1. */
  theftAt: number;
}

/** Bring her meters up to the present, so the night starts from what she really is. */
function catchUpNeeds(w: World): void {
  const h = w.hero;
  const from = h.needsAt ?? w.clock;
  wearDown(w, w.clock - from);
  h.needsAt = w.clock;
}

/** Eight hours (or fewer, or less if she is interrupted) in whatever bed she has. */
function sleepOut(c: Ctx, plan: Plan): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  catchUpNeeds(w);
  h.cash -= plan.price;

  const faint = plan.venue === 'faint';
  let hours = faint ? FAINT_HOURS : nightHours(w.legacy);
  const hungerCap = hoursBeforeHungerWakes(w);
  const hungry = hungerCap < hours;
  if (hungry) hours = hungerCap;
  const q = effectiveQuality(w.legacy, plan.quality);
  // A night's sleep fills the bar, whatever the bed (passing out, which is short and fitful, fills only part of it). What a
  // poor bed costs her is sleep debt, not an empty bar: see `settleDebt`.
  const full = 100 * (plan.nominal / NIGHT_HOURS) * (faint ? FAINT_QUALITY * (1 + perk(w.legacy, 'faintRest') / 100) : 1);
  const perHour = full / (faint ? FAINT_HOURS : nightHours(w.legacy));
  const night: Night = {
    plan, hours, seen: new Set(),
    theftAt: plan.mode === 'lodging' && rng.chance(plan.rob * (1 - clamp(perk(w.legacy, 'lightSleeper'), 0, 100) / 100)) ? rng.int(0, hours - 1) : -1,
  };

  const start = w.clock;
  const place = loc.name;
  let gained = 0;
  /** Bar gained, weighted by the quality of the bed it was gained in. */
  let weighted = 0;
  let how: 'rested' | 'hunger' | 'woken' | 'jail' | 'captured' = hungry ? 'hunger' : 'rested';
  let released = '';
  let fine = 0;
  nested(c, 'sleep', 'mixed', { variant: plan.venue, place, hours, cost: plan.price, name: plan.name, quality: Math.round(q * 100) }, () => {
    for (let i = 0; i < hours && !w.over; i++) {
      const stop = hazards(c, night, i);
      if (w.over) return;
      if (!stop) {
        w.clock += 60;
        gained += perHour;
        weighted += perHour * q;
        continue;
      }
      w.clock += 30;
      gained += perHour / 2;
      weighted += (perHour / 2) * q;
      if (stop.end === 'jail' || stop.end === 'captured') {
        // The rest of the night is spent on a cell bunk, and then there is the paperwork.
        const left = hours - i - 0.5;
        const cell = stop.end === 'jail' ? CELL_QUALITY : CELL_QUALITY * 0.7;
        const inCell = full * (left / hours);
        gained += inCell;
        weighted += inCell * cell;
        w.clock += (left + stop.extra) * 60;
        fine = stop.fine;
        relocate(w, 'street_main');
        released = w.locations.street_main!.name;
      }
      how = stop.end === 'fight' ? 'woken' : stop.end;
      break;
    }
    if (w.over) return;
    const minutes = w.clock - start;
    h.sleep = Math.min(100, sleepOf(h) + gained);
    // Poor beds leave their mark and good ones clear it, whatever the bar says.
    const frac = clamp(minutes / 60 / nightHours(w.legacy), 0.05, 1);
    const debtBefore = Math.round(debtOf(h));
    settleDebt(h, clamp(weighted / Math.max(gained, 1e-9), 0, 1), frac);
    afterSleep(c, minutes, plan.mode === 'lodging');
    if (Math.round(debtOf(h)) !== debtBefore) {
      c.emit('sleep_debt', Math.round(debtOf(h)) > debtBefore ? 'bad' : 'good', { variant: Math.round(debtOf(h)) > debtBefore ? 'up' : 'down', stacks: Math.round(debtOf(h)) });
    }
    const rested = Math.round(gained);
    c.emit('wake', how === 'rested' && rested >= 70 ? 'good' : how === 'rested' || how === 'hunger' ? 'mixed' : 'bad', {
      variant: how, venue: plan.venue, place, hours: Math.round(minutes / 60), gained: rested, quality: Math.round((weighted / Math.max(gained, 1e-9)) * 100), sleep: Math.round(sleepOf(h)), to: released, fine,
    });
  });
}

/** What a night's gone by does to everything else about her. */
function afterSleep(c: Ctx, minutes: number, safe: boolean): void {
  const { w } = c;
  const h = w.hero;
  wearDown(w, minutes, true);
  h.needsAt = w.clock;
  h.drunk = Math.max(0, h.drunk - Math.floor(minutes / 60));
  // Whatever else happened, nobody is let starve in a cell.
  if (hungerOf(h) < HUNGER_WAKE) h.hunger = HUNGER_WAKE;
  // Hours spent out of sight cool things down; a locked door cools them faster.
  const cool = Math.floor(minutes / (safe ? 90 : 240));
  if (cool > 0) for (const k of Object.keys(w.heat)) w.heat[k] = Math.max(0, (w.heat[k] ?? 0) - cool);
  // Beats are how timed effects count, and a night is a lot of beats: let what would have worn off, wear off.
  const beats = Math.floor(minutes / BASE_MIN_PER_BEAT);
  for (const b of h.buffs) b.until -= beats;
  expireBuffs(c);
  h.buffs = h.buffs.filter((b) => b.id !== 'crash' && b.id !== 'hangover');
  refreshFx(w);
}

// ===================================================================== what happens while she sleeps

interface Passer {
  id: string;
  name: string;
  role: string;
  npc?: Npc;
  kindness: number;
  honesty: number;
  greed: number;
  temper: number;
  curiosity: number;
  cop: boolean;
  guard: boolean;
  thief: boolean;
  /** Not a passer-by who might look down: somebody who came for her wallet. */
  forced?: boolean;
}

type Reaction = 'ignore' | 'help' | 'report' | 'rob' | 'arrest' | 'shake';

const PASSERBY = [
  'a night-shift cleaner', 'a delivery rider', 'a couple coming home from a club', 'a man pushing a trolley of cables', 'a woman walking a drone on a lead',
  'a courier', 'an off-duty medic', 'a pack of kids', 'a drunk looking for his door', 'a noodle-cart boy', 'a bus-stop preacher', 'a street sweeper',
];

function fromNpc(w: World, n: Npc): Passer {
  return {
    id: n.id, name: n.name, role: n.role, npc: n,
    kindness: traitOf(w, n, 'kindness'), honesty: traitOf(w, n, 'honesty'), greed: traitOf(w, n, 'greed'), temper: traitOf(w, n, 'temper'), curiosity: traitOf(w, n, 'curiosity'),
    cop: n.tags.includes('cop'), guard: n.tags.includes('security') || n.tags.includes('owner'), thief: ['mugger', 'ganger', 'street_kid'].includes(n.archetype),
  };
}

function stranger(rng: Rng, index: number, thief = false): Passer {
  const trait = () => (rng.next() + rng.next()) / 2;
  const role = thief ? 'a hooded figure' : rng.pick(PASSERBY);
  return {
    id: `anon${index}`, name: role, role, kindness: trait(), honesty: trait(), greed: thief ? 0.9 : trait(), temper: trait(), curiosity: trait(),
    cop: false, guard: false, thief: thief || rng.chance(0.08), forced: thief,
  };
}

/**
 * What somebody does about a girl asleep on the ground, according to who they are. The kind cover her up, the law-abiding call
 * the NPD (sleeping rough is illegal, and the NPD have a policy), the greedy and dishonest take her wallet, and a lot of
 * people just keep walking.
 */
function react(p: Passer, hasCash: boolean, rng: Rng): Reaction {
  if (p.cop) return 'arrest';
  if (p.guard) return 'shake';
  const weights: Record<Exclude<Reaction, 'arrest' | 'shake'>, number> = {
    help: 1.6 * p.kindness * (1 - 0.5 * p.greed),
    ignore: 1 + 1.2 * (1 - p.curiosity),
    report: 0.2 + 1.8 * p.honesty * (1 - 0.6 * p.kindness) + 0.6 * p.temper,
    rob: hasCash ? 2.2 * p.greed * (1 - p.honesty) * (1 - p.kindness) + (p.thief ? 1.5 : 0) : 0,
  };
  return rng.weighted(Object.keys(weights) as (keyof typeof weights)[], (k) => weights[k]);
}

const PHASE_TRAFFIC: Record<Phase, number> = { night: 0.7, dawn: 1.2, day: 1.3, dusk: 1 };

/** People passing per hour, whoever they are: how busy this spot is at this time of day. */
function traffic(w: World, loc: Location, mode: Mode): number {
  const base = loc.kind === 'tunnel' ? 0.08 : loc.id === 'halo_roof' ? 0.12 : mode === 'street' ? 1.5 : loc.outdoors ? 0.45 : 0.3;
  const district = loc.gen?.district === 'market' || loc.gen?.district === 'nightlife' ? (loc.outdoors ? 0.6 : 0.2) : 0;
  return (base + (loc.crowded ? 1.5 : 0) + district) * PHASE_TRAFFIC[phaseOf(w.clock)];
}

/** Everyone who walks past this hour: the people who live and work here by their own schedules, and the rest of the city. */
function visitors(c: Ctx, night: Night): Passer[] {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const out: Passer[] = [];
  const known = new Map<Id, Npc>();
  for (const n of [...everyoneAt(w, loc.id), ...hauntersOf(w, loc.id)]) known.set(n.id, n);
  for (const n of known.values()) {
    if (night.seen.has(n.id) || !n.alive || n.hostile || n.downUntil > w.beat) continue;
    if (n.tags.some((t) => t === 'robot' || t === 'dragon' || t === 'boss') || n.archetype === 'puppy' || h.companions.some((a) => a.npcId === n.id)) continue;
    if (placeAt(w, n, w.clock) !== loc.id) continue;
    out.push(fromNpc(w, n));
    if (out.length >= 5) break;
  }
  const lambda = traffic(w, loc, night.plan.mode);
  const count = Math.floor(lambda) + (rng.chance(lambda - Math.floor(lambda)) ? 1 : 0);
  for (let i = 0; i < count; i++) out.push(stranger(rng, night.seen.size * 10 + i));
  // The open street has its own thieves, whoever else is about.
  if (night.plan.mode === 'street' && w.hero.cash >= 10 && rng.chance(0.04 + (loc.gen?.district === 'slum' || loc.gen?.district === 'industrial' ? 0.04 : 0))) {
    out.push(stranger(rng, 900 + night.seen.size, true));
  }
  return out;
}

/** The hour's dangers. Returns what ends the sleep, if anything does. */
function hazards(c: Ctx, night: Night, hourIndex: number): Stop | null {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const { plan } = night;

  if (plan.mode === 'lodging') {
    if (hourIndex === night.theftAt) {
      const lost = stealCash(w, rng);
      c.emit('rest_incident', 'bad', { variant: 'robbed_bed', place: plan.name, lost });
    }
    return null;
  }

  if (plan.mode === 'hostile') {
    const guards = loc.kind === 'corp' ? spawnGroup(c, 'helix_guard', 2) : spawnGroup(c, 'ganger', 2);
    return attacked(c, guards, loc.kind === 'corp' ? 'atlas' : 'gang');
  }

  const stop = authorities(c, night);
  if (stop) return stop;

  const sneak = clamp(sneakBonus(w) * 2, 0, 0.5);
  const noticeP = (plan.mode === 'street' ? 0.8 : 0.3) * (1 - sneak);
  for (const p of visitors(c, night)) {
    if (!p.forced && !rng.chance(noticeP)) continue;
    night.seen.add(p.id);
    const reaction = react(p, h.cash > 0, rng);
    if (p.npc) remember(p.npc, 'found Blackbird asleep on the ground');
    switch (reaction) {
      case 'ignore': break;
      case 'help':
        if (p.npc) p.npc.affinity += 3;
        c.emit('rest_incident', 'good', { variant: 'kind', who: p.name, role: p.role });
        break;
      case 'shake': {
        c.emit('rest_incident', 'mixed', { variant: 'shaken', who: p.name, role: p.role });
        if (!loc.outdoors) relocate(w, loc.tossTo);
        return { end: 'woken' };
      }
      case 'rob': {
        if (rng.chance(clamp(perk(w.legacy, 'lightSleeper'), 0, 100) / 100)) {
          c.emit('rest_incident', 'good', { variant: 'thief_scared', who: p.name });
          return { end: 'woken' };
        }
        const lost = stealCash(w, rng);
        if (p.npc) {
          p.npc.cash += lost;
          remember(p.npc, 'robbed Blackbird in her sleep');
        }
        c.emit('rest_incident', 'bad', { variant: 'robbed', who: p.name, role: p.role, lost });
        // Now and then she wakes up for it.
        if (lost > 0 && rng.chance(0.25)) {
          const [thief] = p.npc ? [p.npc] : spawnGroup(c, 'mugger', 1);
          c.emit('rest_incident', 'bad', { variant: 'caught_thief', who: p.name });
          fight(c, [thief!], { cause: 'a thief in the night', joiners: false });
          return { end: 'fight' };
        }
        break;
      }
      case 'report':
      case 'arrest':
        c.emit('rest_incident', 'bad', { variant: reaction === 'arrest' ? 'cop' : 'reported', who: p.name, role: p.role });
        return arrest(c, p.name);
    }
  }
  return null;
}

/** The patrols, the retrieval teams, and anyone else who is looking for her in particular. */
function authorities(c: Ctx, night: Night): Stop | null {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId]!;
  const npd = w.heat.npd ?? 0;
  const atlas = w.heat.atlas ?? 0;
  // Under a roof, out of sight, they have to be lucky.
  const cover = loc.outdoors ? 1 : 0.25;
  const cams = 1 + 0.15 * workingCameras(w, loc.id);
  const patrol = night.plan.mode === 'street' ? 0.05 + 0.012 * loc.security : loc.outdoors ? 0.02 + 0.008 * loc.security : 0.005;
  if (atlas > 0 && rng.chance(clamp((0.05 + 0.09 * atlas) * cover * cams, 0, 0.85))) {
    if (rng.chance(0.55)) return attacked(c, spawnGroup(c, 'helix_guard', atlas >= 5 ? 3 : 2), 'atlas');
    const fine = Math.round(Math.max(0, c.w.hero.cash) * 0.5);
    c.w.hero.cash -= fine;
    c.w.heat.atlas = Math.max(0, atlas - 2);
    c.emit('rest_incident', 'bad', { variant: 'captured', fine });
    return { end: 'captured', extra: rng.int(1, 3), fine };
  }
  if (rng.chance(clamp((patrol + 0.08 * npd * cover) * cams, 0, 0.85))) {
    if (npd >= 4 && rng.chance(0.6)) return attacked(c, spawnGroup(c, 'npd_officer', npd >= 6 ? 3 : 2), 'npd');
    return arrest(c, 'a patrol');
  }
  return null;
}

/** Sleeping rough is illegal. The fine is a share of what she has, and the cell is where she finishes the night. */
function arrest(c: Ctx, by: string): Stop {
  const { w, rng } = c;
  const h = w.hero;
  const fine = Math.min(Math.max(0, h.cash), Math.max(10, Math.round(h.cash * 0.3)));
  h.cash -= fine;
  w.heat.npd = Math.max(0, (w.heat.npd ?? 0) - 1);
  c.emit('rest_incident', 'bad', { variant: 'arrested', by, fine });
  return { end: 'jail', extra: rng.int(1, 3), fine };
}

/** They found her asleep, and the first blows land on someone who is not awake to dodge them. */
function attacked(c: Ctx, squad: Npc[], who: 'npd' | 'atlas' | 'gang'): Stop {
  const { w } = c;
  const h = w.hero;
  h.hp = Math.max(1, h.hp - Math.round(h.maxHp * 0.12));
  c.emit('rest_incident', 'bad', { variant: `attacked_${who}`, count: squad.length, foe: squad[0]?.name ?? 'someone' });
  fight(c, squad, { cause: who === 'npd' ? 'an NPD team finding her asleep' : who === 'atlas' ? 'an Atlas retrieval team finding her asleep' : 'being found asleep', joiners: false });
  return { end: 'fight' };
}

function stealCash(w: World, rng: Rng): number {
  const h = w.hero;
  const lost = Math.min(Math.max(0, h.cash), Math.round((Math.max(0, h.cash) * rng.int(40, 70)) / 100));
  h.cash -= lost;
  return lost;
}

// ===================================================================== time passing

/**
 * Called at the start of every beat. Brings hunger and sleep up to the clock, remarks on the slide down either bar, and deals
 * with the ends of them: starving, and passing out.
 */
export function tickNeeds(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  if (h.needsAt === undefined) h.needsAt = w.clock;
  wearDown(w, w.clock - h.needsAt);
  h.needsAt = w.clock;
  refreshFx(w);

  const now = { hunger: hungerTier(hungerOf(h)), sleep: sleepTier(sleepOf(h)) };
  const was = h.needTier ?? now;
  h.needTier = { ...now };
  const order = { hunger: ['fed', 'hungry', 'famished', 'starving', 'wasting'], sleep: ['rested', 'tired', 'exhausted', 'spent'] };
  for (const meter of ['hunger', 'sleep'] as const) {
    if (order[meter].indexOf(now[meter]) > order[meter].indexOf(was[meter])) {
      c.emit('need', now[meter] === 'wasting' || now[meter] === 'spent' ? 'bad' : 'mixed', { variant: `${meter}_${now[meter]}`, level: Math.round(meter === 'hunger' ? hungerOf(h) : sleepOf(h)) });
    }
  }

  if (hungerOf(h) <= 0) {
    w.over = true;
    w.ending = 'dead';
    c.emit('death', 'bad', { variant: 'starved', killer: 'her own empty stomach', place: w.locations[h.locationId]!.name, cause: 'starvation', level: h.level });
    return;
  }
  if (sleepOf(h) <= 0) passOut(c);
}

/** Her body makes the call. Wherever she is standing, she is going down. */
function passOut(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const hostile = loc.dungeon !== undefined || ['corp', 'boss', 'lair'].includes(loc.kind);
  let mode: Mode = hostile ? 'hostile' : isStreet(loc) ? 'street' : 'rough';
  c.emit('rest_incident', 'bad', { variant: 'faint', place: loc.name });
  // Staff don't let a girl sleep on the floor of a shop, a bar or a club: she is put out in the street.
  if (!hostile && !loc.outdoors && (loc.crowded || ['shop', 'clinic', 'bar', 'club'].includes(loc.kind)) && !quietSpot(loc)) {
    relocate(w, loc.tossTo);
    c.emit('rest_incident', 'mixed', { variant: 'dumped', place: loc.name, to: w.locations[w.hero.locationId]!.name });
    mode = isStreet(w.locations[w.hero.locationId]!) ? 'street' : 'rough';
  }
  sleepOut(c, { venue: 'faint', mode, quality: FAINT_QUALITY, nominal: FAINT_HOURS, price: 0, rob: 0, name: '' });
}
