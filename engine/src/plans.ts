import type { Hero, Id, Item, Npc, Ware, World } from './types';
import { teardownVenue } from './cordon';
import { hasInstrument } from './instruments';
import { IMPLANTS, IMPLANT_IDS, MAX_IMPLANTS } from './content/implants';
import { ITEMS } from './content/items';
import { isClosed } from './hours';
import { GEAR_MARKUP, SHOP_ARMOR, gearPrice } from './content/shops';
import { armBest, rating, shelfPrice } from './weapons';
import { price } from './supply';
import { skillLevel } from './skills';

/**
 * What Blackbird knows about the world, as far as planning goes: how to get from here to there,
 * what's for sale and what she'd make of it, which places are worth robbing, and what she
 * believes each kind of action pays. Pure functions over the world; the goals live in goals.ts.
 */

// ===================================================================== routes

const GATE_COST = { bouncer: 2, locked: 3, guarded: 3, jump: 3 } as const;

/** The cheapest way from `from` to `to` over exits she knows about (hidden ones don't count). */
export function routeTo(w: World, from: Id, to: Id): { dist: number; next: Id } | null {
  if (from === to) return { dist: 0, next: to };
  const dist: Record<Id, number> = { [from]: 0 };
  const first: Record<Id, Id> = {};
  const open: Id[] = [from];
  const closed = new Set<Id>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]!]! < dist[open[bi]!]!) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    if (cur === to) return { dist: dist[cur]!, next: first[cur]! };
    closed.add(cur);
    for (const e of w.locations[cur]?.exits ?? []) {
      if (e.hidden || closed.has(e.to) || !w.locations[e.to] || isClosed(w, e.to)) continue;
      const d = dist[cur]! + 1 + (e.gate ? GATE_COST[e.gate] : 0);
      if (dist[e.to] === undefined || d < dist[e.to]!) {
        if (dist[e.to] === undefined) open.push(e.to);
        dist[e.to] = d;
        first[e.to] = cur === from ? e.to : first[cur]!;
      }
    }
  }
  return null;
}

/** Somewhere she'd be happy to be standing after a bad idea: the nearest public place. */
export function safeSpot(w: World, from: Id): { loc: Id; dist: number } | null {
  let best: { loc: Id; dist: number } | null = null;
  for (const id of ['halo_floor', 'street_main', 'halo_alley', 'club_backlot']) {
    const r = routeTo(w, from, id);
    if (r && (!best || r.dist < best.dist)) best = { loc: id, dist: r.dist };
  }
  return best;
}

export const isSafeSpot = (w: World, loc: Id): boolean => ['street', 'bar', 'club'].includes(w.locations[loc]?.kind ?? '');

// ===================================================================== places worth robbing

export interface Site {
  loc: Id;
  /** The feature that pays out (and the candidate family that cracks it). */
  feature: string;
  /** Roughly what the take is worth. */
  value: number;
  label: string;
}

export const SITES: Site[] = [
  { loc: 'halo_backroom', feature: 'safe', value: 330, label: 'the wall safe in the backroom' },
  { loc: 'helix_dock', feature: 'crates', value: 110, label: 'the Helix loading dock' },
  { loc: 'helix_lab', feature: 'vault', value: 450, label: 'the Helix prototype vault' },
];

/** Sites she has actually seen, can still be robbed, and can find a way to. */
export function knownSites(w: World): Site[] {
  return SITES.filter((s) => {
    if (!w.features[s.feature] || w.features[s.feature]!.locationId !== s.loc) return false;
    if (s.feature === 'vault' && w.flags.vault_robbed) return false;
    if ((w.locations[s.loc]?.visits ?? 0) === 0) return false;
    return !!routeTo(w, w.hero.locationId, s.loc);
  });
}

export const siteAt = (loc: Id): Site | undefined => SITES.find((s) => s.loc === loc);

// ===================================================================== for sale

const present = (w: World, n: Npc | undefined): n is Npc => !!n && n.alive && !n.hostile && n.locationId === w.hero.locationId && n.downUntil <= w.beat;

export const isSold = (w: World, id: string): boolean => !!w.flags[`sold:${id}`];

/** Everything on offer where she's standing, as she'd see it in the window. */
export function shopStock(w: World): Ware[] {
  const h = w.hero;
  const out: Ware[] = [];
  if (h.locationId === 'gun_shop' && present(w, w.npcs.gunsmith)) {
    for (const it of Object.values(w.arsenal ?? {})) {
      if (isSold(w, it.id)) continue;
      out.push({ id: it.id, name: it.name, kind: 'weapon', loc: 'gun_shop', price: shelfPrice(it, GEAR_MARKUP), power: Math.round(rating(it) * 10) / 10, seen: w.beat, item: it });
    }
    for (const id of SHOP_ARMOR) {
      const it = ITEMS[id]!;
      if (isSold(w, id)) continue;
      out.push({ id, name: it.name, kind: 'armor', loc: 'gun_shop', price: gearPrice(id), power: it.power, seen: w.beat });
    }
  }
  if (h.locationId === 'halo_restroom' && present(w, w.npcs.doc) && h.implants.length < MAX_IMPLANTS) {
    for (const id of IMPLANT_IDS) {
      if (h.implants.includes(id) || isSold(w, id)) continue;
      const def = IMPLANTS[id]!;
      out.push({ id, name: def.name, kind: 'implant', loc: 'halo_restroom', price: def.cost, power: def.power ?? 0, seen: w.beat });
    }
  }
  return out;
}

/** What it would cost her today (haggling shaves a little off). */
export function wareCost(w: World, ware: Ware): number {
  return ware.kind === 'implant' ? Math.round(ware.price * (1 - Math.min(0.3, skillLevel(w.hero, 'haggling') * 0.03))) : price(w.hero, ware.price);
}

export const keeperOf = (w: World, ware: Ware): Npc | undefined => (ware.kind === 'implant' ? w.npcs.doc : w.npcs.gunsmith);

/** Does she already have it, or something at least as good? */
export function owns(w: World, ware: Ware): boolean {
  const h = w.hero;
  if (ware.kind === 'implant') return h.implants.includes(ware.id);
  if (ware.kind === 'armor') return (h.armor?.power ?? 0) >= ware.power;
  if (h.weapon.id === ware.id || h.inventory.some((i: Item) => i.id === ware.id)) return true;
  // Something at least as good, and nothing about this one that would do the job in front of her better.
  return rating(h.weapon) >= ware.power && !situationalEdge(w, ware);
}

/** How much she'd want it, ~0..3. Traits colour it; nothing here cares whether it is a good idea. */
export function appeal(w: World, ware: Ware): number {
  const h = w.hero;
  const t = h.personality.traits;
  let base = 0;
  if (ware.kind === 'weapon') {
    base = (ware.power - rating(h.weapon)) / 5;
    // Or it's the right tool for the job she has in mind.
    const foe = focusFoe(w);
    if (foe && ware.item) base = Math.max(base, (rating(ware.item, foe) - armBest(h, foe)) / 4);
  }
  else if (ware.kind === 'armor') base = (ware.power - (h.armor?.power ?? 0)) / 2.5;
  else {
    const def = IMPLANTS[ware.id]!;
    let v = (def.power ?? 0) * 0.5;
    for (const n of Object.values(def.stats ?? {})) v += n > 0 ? n * 0.5 : n * 0.3;
    for (const n of Object.values(def.skills ?? {})) v += n * 0.15;
    if (def.flag === 'defib') v += 2;
    if (def.flag === 'springs') v += 0.5;
    base = v / 2.5;
  }
  if (base <= 0) return 0;
  const mult = 1 + (t.greed - 0.5) + (ware.kind === 'implant' ? 0.8 * (t.techy - 0.5) + 0.5 * (t.vanity - 0.5) : 0.6 * (t.courage - 0.5) + 0.5 * (t.vanity - 0.5));
  return Math.max(0, base * mult);
}

// ===================================================================== what things pay

/** What she assumes each kind of action pays, before experience tells her otherwise. */
const PRIOR: Record<string, number> = {
  till: 90, safe: 300, vault: 200, crates: 70, fence: 0, poker: 18, pool: 14, darts: 8, karaoke: 6,
  gig: 60, busk: 22, dj_set: 35, tend_bar: 20, vending: 12, dumpster: 12, hack: 25, armwrestle: 14,
  pickpocket: 22, threaten: 28, challenge: 10, rob_paint_shop: 30, raid_loot: 140, raid_ambush: 45,
};

/** Spending, as opposed to earning. A hero saving up for something does not do these. */
export const SPEND = new Set(['order_drink', 'buy_round', 'buy_gear', 'buy_stim', 'buy_stims', 'buy_noodles', 'buy_paint', 'implant', 'laser_tag', 'mix_molotov', 'buy_intel']);

export const sellable = (i: Item): boolean => ['loot', 'weapon', 'armor', 'gadget'].includes(i.kind) && !i.tags.includes('instrument') && !i.tags.includes('quest') && !i.tags.includes('key');

/** What the fixer would pay for what she's carrying (she keeps her best melee backup). */
export function fenceValue(h: Hero): number {
  const backup = h.inventory.filter((i) => i.kind === 'weapon' && i.tags.includes('melee')).sort((a, b) => b.power - a.power)[0];
  return Math.round(h.inventory.filter((i) => sellable(i) && i !== backup).reduce((a, i) => a + i.value * (i.kind === 'loot' ? 0.7 : 0.4), 0));
}

/** Cash plus half of whatever she can sell: what a beat of work actually earned her. */
export const wealth = (h: Hero): number => h.cash + 0.5 * h.inventory.filter(sellable).reduce((a, i) => a + i.value, 0);

/** What she expects `family` (optionally aimed at `id`) to earn her, in neodollars. */
export function expectedEarn(w: World, family: string, id?: string): number {
  if (family === 'fence') return fenceValue(w.hero);
  const n = id ? w.npcs[id] : undefined;
  if (n && family === 'pickpocket') return n.cash > 0 ? 0.55 * n.cash + (n.loadout.length ? 8 : 0) : n.loadout.length ? 10 : 0;
  if (n && family === 'threaten') return 0.4 * n.cash;
  return Math.max(0, w.mind.earn[family] ?? PRIOR[family] ?? 0);
}

/** Learn from how it went. Slow, so one lucky till doesn't rewrite her whole worldview. */
export function learnEarning(w: World, family: string, gained: number): void {
  const prev = w.mind.earn[family] ?? PRIOR[family] ?? 0;
  w.mind.earn[family] = Math.round(Math.max(-200, Math.min(600, prev * 0.8 + gained * 0.2)));
}

export const totalHeat = (w: World): number => Object.values(w.heat).reduce((a, b) => a + b, 0);

/** The enemy she is most set on right now, if any: a grudge, a bounty, the dragon. */
export function focusFoe(w: World): Npc | undefined {
  for (const d of w.mind.drive) {
    const g = w.mind.goals.find((x) => x.id === d.id);
    const id = g?.kind === 'kill' ? g.npc : g?.kind === 'dragon' ? g.npc : g?.pursuit && g.pursuit.plan === 'bounty' ? g.pursuit.npc : undefined;
    const n = id ? w.npcs[id] : undefined;
    if (n?.alive) return n;
  }
  return undefined;
}

/** Is this the right tool for the person she's after, even if it isn't the best weapon in general? */
export function situationalEdge(w: World, ware: Ware): boolean {
  const foe = focusFoe(w);
  return !!foe && !!ware.item && rating(ware.item, foe) > armBest(w.hero, foe) * 1.08;
}

// ===================================================================== fame

export interface FameAct {
  fam: string;
  /** The skill it's built on, if any. */
  skill?: string;
  /** What she'd expect it to do for her fame before experience says otherwise. */
  prior: number;
  /** Where she'd do it, if she knows of somewhere. */
  venue(w: World): Id | null;
}

const featureAt = (w: World, kind: string): Id | null => {
  const f = Object.values(w.features).find((x) => x.kind === kind);
  return f && (w.locations[f.locationId]?.visits ?? 0) > 0 ? f.locationId : null;
};
const seen = (w: World, id: Id): Id | null => ((w.locations[id]?.visits ?? 0) > 0 ? id : null);

export const FAME_ACTS: FameAct[] = [
  { fam: 'karaoke', skill: 'vocals', prior: 1.0, venue: (w) => featureAt(w, 'karaoke') },
  { fam: 'sing_busk', skill: 'vocals', prior: 1.0, venue: (w) => seen(w, 'street_main') },
  { fam: 'crash_gig', skill: 'vocals', prior: 3.0, venue: (w) => (w.npcs.kilobyte?.alive ? seen(w, 'neon_pharaoh') : null) },
  { fam: 'dj_set', skill: 'djing', prior: 2.0, venue: (w) => featureAt(w, 'dj_booth') },
  { fam: 'backlot_set', skill: 'djing', prior: 1.3, venue: (w) => seen(w, 'club_backlot') },
  { fam: 'gig', skill: 'guitar', prior: 3.0, venue: (w) => featureAt(w, 'guitar') },
  { fam: 'jam', skill: 'guitar', prior: 1.0, venue: (w) => featureAt(w, 'guitar') },
  { fam: 'guitar_duel', skill: 'guitar', prior: 2.2, venue: (w) => featureAt(w, 'guitar') },
  { fam: 'busk', skill: 'guitar', prior: 1.0, venue: (w) => (hasInstrument(w.hero) ? seen(w, 'street_main') : null) },
  { fam: 'beat_battle', skill: 'beatbox', prior: 1.2, venue: (w) => seen(w, 'halo_floor') },
  { fam: 'billboard', prior: 3.0, venue: (w) => featureAt(w, 'billboard') },
  { fam: 'graffiti', skill: 'art', prior: 1.2, venue: (w) => seen(w, 'street_main') },
  { fam: 'parkour', prior: 0.8, venue: (w) => featureAt(w, 'parkour') },
  { fam: 'cordon_teardown', skill: 'guitar', prior: 10, venue: (w) => teardownVenue(w) },
];

export const FAME_FAMILIES = new Set([...FAME_ACTS.map((a) => a.fam), 'film_flight', 'beatbox', 'serenade', 'serenade_girl', 'dancefloor']);

export const expectedFame = (w: World, fam: string): number => Math.max(0, w.mind.fame?.[fam] ?? FAME_ACTS.find((a) => a.fam === fam)?.prior ?? (FAME_FAMILIES.has(fam) ? 0.8 : 0));

export function learnFame(w: World, fam: string, gained: number): void {
  const prev = expectedFame(w, fam);
  (w.mind.fame ??= {})[fam] = Math.round(Math.max(0, Math.min(20, prev * 0.8 + gained * 0.2)) * 100) / 100;
}
