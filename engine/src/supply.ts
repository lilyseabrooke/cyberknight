import type { Ctx, Hero, Item, Npc, World } from './types';
import type { Candidate } from './candidate';
import { perk } from './lab';
import { BASE_MIN_PER_BEAT } from './clock';
import { acquire, here } from './combat';
import { makeAmmoBox, makeItem, ITEMS } from './content/items';
import { AMMO } from './content/ammo';
import { STIMS, type StimDef } from './content/stims';
import { MEDS, MED_IDS } from './content/meds';
import { DOC_FEE, GEAR_MARKUP, PHARMACY_STIMS, SHOP_AMMO, SHOP_ARMOR, gearPrice } from './content/shops';
import { armBest, fxOf, genWeapon, niches, rating, shelfPrice } from './weapons';
import { focusFoe, routeTo } from './plans';
import { everyoneAt } from './population';
import { isShut } from './shutdown';
import { addAmmo, ammoOf, gunsOwned, isArm, medPacks, medStock, shotsLeft, wielded } from './arms';
import { skillLevel, train } from './skills';
import { healUrge } from './urges';
import { isFairGame } from './people';

/**
 * Everything she has to spend money on to stay alive and stay dangerous: med packs, ammo,
 * stimulants and gear. The shops are ordinary smart objects; the shopkeepers are NPCs who can be
 * out hiding, dead, or annoyed. Nothing is on a timer. Cash is the limit.
 */

const present = (n: Npc | undefined, w: World): n is Npc => !!n && n.alive && !n.hostile && n.locationId === w.hero.locationId && n.downUntil <= w.clock;

/** Haggling shaves up to 30% off. */
export const price = (h: Hero, base: number): number => Math.max(1, Math.round(base * (1 - Math.min(0.3, skillLevel(h, 'haggling') * 0.03))));

const stimDef = (it: Item): StimDef | undefined => STIMS[it.id];
const activeStims = (h: Hero, beat: number) => h.buffs.filter((b) => b.id.startsWith('stim:') && b.until > beat);

/** Cash she keeps back for emergencies before blowing the rest on gear. Sharper heroes save more. */
const reserve = (h: Hero): number => Math.round(h.competence * 80);

/** Best affordable upgrade for a slot, or null. Weapons are judged against the enemy she has in mind, if she has one. */
function bestUpgrade(w: World, slot: 'weapon' | 'armor'): { id: string; cost: number; gain: number } | null {
  const h = w.hero;
  let best: { id: string; cost: number; gain: number } | null = null;
  if (slot === 'weapon') {
    const foe = focusFoe(w);
    const have = armBest(h, foe);
    for (const it of Object.values(w.arsenal ?? {})) {
      if (w.flags[`sold:${it.id}`]) continue;
      const cost = price(h, shelfPrice(it, GEAR_MARKUP));
      const gain = rating(it, foe) - have;
      if (gain < 0.8 || cost > h.cash - reserve(h)) continue;
      if (!best || gain > best.gain) best = { id: it.id, cost, gain };
    }
    return best;
  }
  const have = h.armor?.power ?? 0;
  for (const id of SHOP_ARMOR) {
    if (w.flags[`sold:${id}`]) continue;
    const cost = price(h, gearPrice(id));
    if (ITEMS[id]!.power <= have || cost > h.cash - reserve(h)) continue;
    const gain = ITEMS[id]!.power - have;
    if (!best || gain > best.gain) best = { id, cost, gain };
  }
  return best;
}

/** Ammo types she owns a gun for and is running low on, most pressing first. */
export function ammoNeeds(h: Hero): { type: string; urgency: number }[] {
  const out = new Map<string, number>();
  for (const g of gunsOwned(h)) {
    const left = shotsLeft(h, g);
    if (left >= 8) continue;
    const urgency = (g === h.weapon ? 1 : 0.4) * (1 - left / 8);
    out.set(g.ammoType!, Math.max(out.get(g.ammoType!) ?? 0, urgency));
  }
  return [...out].map(([type, urgency]) => ({ type, urgency })).sort((a, b) => b.urgency - a.urgency);
}

interface DocPick {
  loc: string;
  dist: number;
  next: string;
}

const docMemo = new WeakMap<World, { key: string; pick: DocPick | null }>();

const canPatch = (n: Npc | undefined, w: World): n is Npc => !!n && n.alive && !n.hostile && n.downUntil <= w.clock && n.tags.includes('doc');

/**
 * The nearest doc she can pay and has reason to think is in: Doc Hexamer in the Halo's bathroom, or a street clinic
 * on a street she has walked (one she hasn't been inside is assumed to have somebody behind the desk). The street
 * doc is the cheap way back to full health: a flat fee against the 25-100 a pack of the same size costs.
 */
export function nearestDoc(w: World): DocPick | null {
  const h = w.hero;
  if (h.cash < DOC_FEE[0]) return null;
  const key = `${w.beat}:${h.locationId}:${h.cash >= DOC_FEE[1]}`;
  const memo = docMemo.get(w);
  if (memo?.key === key) return memo.pick;
  const spots = new Set<string>();
  const main = w.npcs.doc;
  if (canPatch(main, w) && !isShut(w, main.locationId)) spots.add(main.locationId);
  for (const loc of Object.values(w.locations)) {
    if (loc.kind !== 'clinic' || isShut(w, loc.id)) continue;
    const street = loc.gen ? w.locations[loc.gen.parent] : undefined;
    if (loc.visits === 0 && (street?.visits ?? 0) === 0) continue; // she has never seen the door
    if (!loc.populated || everyoneAt(w, loc.id).some((n) => canPatch(n, w))) spots.add(loc.id);
  }
  let best: DocPick | null = null;
  for (const spot of spots) {
    const r = routeTo(w, h.locationId, spot);
    if (r && (!best || r.dist < best.dist)) best = { loc: spot, dist: r.dist, next: r.next };
  }
  docMemo.set(w, { key, pick: best });
  return best;
}

const docOk = (w: World): boolean => nearestDoc(w) !== null;

/**
 * Is there a doc worth walking to? Only when she's properly hurt (or carrying injuries), has the fee, isn't
 * stuck deep in a building, and the doc isn't too far off. Returns the next step on the way.
 */
export function docErrand(w: World): DocPick | null {
  const h = w.hero;
  if (w.locations[h.locationId]?.dungeon) return null;
  const frac = h.hp / h.maxHp;
  if (frac > 0.55 && !(h.injuries.length && frac < 0.8)) return null;
  const doc = nearestDoc(w);
  return doc && doc.dist <= 10 ? doc : null;
}

/** Pulls her toward the right shop when she needs something. Added to the exit candidates. */
export function supplyUrge(w: World, dest: string): { bonus: number; smart: number } {
  const h = w.hero;
  const none = { bonus: 0, smart: 0 };
  const hurt = 1 - h.hp / h.maxHp;
  // Hurt enough to want the doc: every step towards him is worth taking, the nearer the better.
  const errand = docErrand(w);
  if (errand && errand.next === dest && dest !== h.locationId) {
    return { bonus: (1.8 * healUrge(h)) / (1 + 0.15 * errand.dist), smart: 1.2 };
  }
  if (dest === 'chem_mart') {
    if (h.cash < price(h, MEDS.patch_kit!.price)) return none;
    const stock = medStock(h);
    return stock === 0 ? { bonus: 0.3 + healUrge(h), smart: 1.4 } : stock < 60 ? { bonus: 0.4 * healUrge(h), smart: 0.4 } : none;
  }
  if (dest === 'gun_shop') {
    const need = ammoNeeds(h)[0];
    const cheapest = Math.min(...SHOP_AMMO.map((t) => price(h, AMMO[t]!.price)));
    let bonus = 0;
    let smart = 0;
    if (need && h.cash >= price(h, AMMO[need.type]!.price)) {
      bonus += need.urgency * 0.6;
      smart += need.urgency * 1.5;
    }
    if (h.cash >= cheapest && (bestUpgrade(w, 'weapon') || bestUpgrade(w, 'armor'))) {
      bonus += 0.25;
      smart += 0.6;
    }
    return { bonus, smart };
  }
  return none;
}

// ===================================================================== candidates

export function supplyCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const hurt = 1 - h.hp / h.maxHp;

  // ---- the pharmacy: med packs and legit stims
  const pharmacist = w.npcs.pharmacist;
  if (loc.id === 'chem_mart' && present(pharmacist, w)) {
    // Three tiers of med kit. Cheap ones are the best deal per HP; the big ones close a gap in one go.
    const stock = medStock(h);
    // With a doc to hand, packs are for emergencies far from one: she doesn't stock up.
    const stockUp = docOk(w) ? 0.35 : 1;
    for (const id of MED_IDS) {
      const cost = price(h, MEDS[id]!.price);
      if (h.cash < cost) continue;
      out.push({
        key: `buy_med:${id}`, drives: { curiosity: 0.1 }, smart: 1.2,
        bonus: (stock < 60 ? 0.9 * stockUp : stock < 120 ? 0.3 * stockUp : stock < 200 ? -0.2 : -0.8) + healUrge(h) * stockUp * (stock < 60 ? 1 : stock < 120 ? 0.6 : 0.25) - (id === 'patch_kit' && stock >= 60 ? 0.3 : 0) + (id === 'trauma_kit' && stock < 60 ? -0.3 : 0),
        run: (c) => buyMed(c, pharmacist, id, cost),
      });
    }
    for (const id of PHARMACY_STIMS) {
      const def = STIMS[id]!;
      const cost = price(h, def.price);
      if (h.cash < cost || h.inventory.filter((i) => i.id === id).length >= 2) continue;
      out.push({
        key: `buy_stim:${id}`, drives: { bravery: 0.35, curiosity: 0.3, pride: 0.2 }, smart: 0.2, bonus: -0.1,
        run: (c) => buyStim(c, pharmacist, id, cost, false),
      });
    }
  }

  // ---- the gun shop: ammo, weapons and armor
  const gunsmith = w.npcs.gunsmith;
  if (loc.id === 'gun_shop' && present(gunsmith, w)) {
    const needs = new Map(ammoNeeds(h).map((n) => [n.type, n.urgency]));
    for (const type of SHOP_AMMO) {
      const cost = price(h, AMMO[type]!.price);
      if (h.cash < cost || !gunsOwned(h).some((g) => g.ammoType === type)) continue;
      const urgency = needs.get(type) ?? 0;
      out.push({
        key: `buy_ammo:${type}`, drives: { greed: 0.05 }, smart: 1.4 * urgency,
        bonus: urgency ? urgency * 1.2 : -0.6,
        run: (c) => buyAmmo(c, gunsmith, type, cost),
      });
    }
    for (const slot of ['weapon', 'armor'] as const) {
      const up = bestUpgrade(w, slot);
      if (!up) continue;
      const gain = up.gain;
      out.push({
        key: `buy_gear:${slot}`, drives: { pride: 0.7, greed: 0.2, bravery: 0.3 }, smart: 0.5 + gain * 0.04,
        bonus: Math.min(1, gain * 0.05),
        run: (c) => buyGear(c, gunsmith, up.id, up.cost),
      });
    }
  }

  // ---- using what she bought
  const packs = medPacks(h);
  // Packs are the emergency kit: while the doc is a short walk away and she can pay him, she'd rather go there.
  // Only when she's nearly out does a pack beat the walk.
  const frac = h.hp / h.maxHp;
  if (packs.length && (frac < 0.6 || h.injuries.length) && (frac < 0.15 || !docErrand(w))) {
    out.push({
      key: 'use_med_pack', drives: {}, smart: 1.6, bonus: healUrge(h) + h.injuries.length * 0.5,
      run: (c) => useMedPack(c, bestFit(h)),
    });
  }
  const crowd = here(w);
  const danger = loc.kind === 'boss' || loc.kind === 'corp' || Object.values(w.heat).some((v) => v >= 3) || hurt > 0.3;
  const seen = new Set<string>();
  for (const it of h.inventory) {
    const def = stimDef(it);
    if (!def || seen.has(it.id)) continue;
    seen.add(it.id);
    const active = activeStims(h, w.beat).length;
    // Context: Ironclad before a fight, Cortex Clear near something hackable, Silver Tongue near someone worth charming.
    const ctx =
      it.id === 'stim_cortex' ? (crowd.some((n) => n.tags.includes('augmented') || n.tags.includes('robot')) ? 0.5 : 0)
      : it.id === 'stim_silver' ? (crowd.some((n) => isFairGame(n)) ? 0.6 : 0)
      : it.id === 'stim_twitch' ? ((w.heat.npd ?? 0) >= 3 || (w.heat.atlas ?? 0) >= 3 ? 0.5 : 0)
      : danger ? 0.4 : 0;
    out.push({
      key: `use_stim:${it.id}`, drives: { bravery: 0.4, curiosity: 0.2 }, smart: 0.3, bonus: ctx - active * 0.3,
      risk: active >= 2 ? 1.6 : active === 1 ? 0.3 : 0,
      run: (c) => useStim(c, it),
    });
  }
  return out;
}

// ===================================================================== resolvers

function buyMed(c: Ctx, keeper: Npc, id: string, cost: number): void {
  const h = c.w.hero;
  h.cash -= cost;
  h.inventory.push(makeItem(id));
  keeper.affinity += 2;
  train(c, 'haggling', 1);
  c.emit('buy_med_pack', 'good', { npc: keeper.name, item: MEDS[id]!.name, cost, packs: medPacks(h).length });
}

function buyAmmo(c: Ctx, keeper: Npc, type: string, cost: number): void {
  const h = c.w.hero;
  const a = AMMO[type]!;
  h.cash -= cost;
  addAmmo(h, type, a.box);
  keeper.affinity += 2;
  train(c, 'haggling', 1);
  c.emit('buy_ammo', 'good', { npc: keeper.name, ammo: a.label, type, rounds: a.box, cost, total: ammoOf(h, type) });
}

export function buyGear(c: Ctx, keeper: Npc, id: string, cost: number): void {
  const h = c.w.hero;
  const item = c.w.arsenal?.[id] ?? makeItem(id);
  const slot = item.kind === 'armor' ? 'armor' : 'weapon';
  h.cash -= cost;
  keeper.affinity += 3;
  train(c, 'haggling', 2);
  if (c.w.arsenal?.[id]) {
    delete c.w.arsenal[id];
    c.w.flags[`sold:${id}`] = true;
  }
  // Every gun leaves the shop with a box in it. The gunsmith is not a monster.
  let starter = '';
  if (item.ammoType) {
    const box = makeAmmoBox(item.ammoType, Math.ceil(AMMO[item.ammoType]!.box / 2));
    addAmmo(h, item.ammoType, box.rounds!);
    starter = box.name;
  }
  c.emit('buy_gear', 'good', { variant: slot, npc: keeper.name, item: item.name, slot, cost, starter, gun: !!item.ammoType });
  acquire(c, item);
}

/** World minutes between the gunsmith's shipments. */
export const SHELF_EVERY = 90 * BASE_MIN_PER_BEAT;

/** Restocks the shelf when the world clock says a shipment is due, however many beats (or hours) that took. */
export function tickShelf(c: Ctx): void {
  const { w } = c;
  if (w.shelfAt === undefined || w.shelfAt > w.clock + SHELF_EVERY) w.shelfAt = w.clock + SHELF_EVERY;
  else if (w.clock >= w.shelfAt) {
    restockShelf(c);
    w.shelfAt = w.clock + SHELF_EVERY;
  }
}

/** Shipments: every so often the gunsmith moves some stock on and gets some in, including something to suit whoever walks in. */
export function restockShelf(c: Ctx): void {
  const { w, rng } = c;
  const shelf = (w.arsenal ??= {});
  const ids = Object.keys(shelf);
  const foe = focusFoe(w);
  const drop = Math.min(ids.length, 3);
  for (let i = 0; i < drop; i++) {
    const id = rng.pick(Object.keys(shelf));
    delete shelf[id];
    w.flags[`sold:${id}`] = true;
  }
  const vsTag = foe ? ['dragon', 'boss', 'robot', 'cop', 'ganger', 'corp', 'augmented'].find((t) => foe.tags.includes(t) || foe.archetype === t) : undefined;
  const fresh = [...niches(rng, w.hero.weapon, 2, vsTag), genWeapon(rng, { tier: Math.max(0.5, fxOf(w.hero.weapon).tier + (rng.next() - 0.3) * 2.5) }), genWeapon(rng, { tier: 0.5 + rng.next() * 6 })];
  for (const it of fresh) shelf[it.id] = it;
}

/** The smallest kit that covers what she is missing, or else the biggest she has. */
function bestFit(h: Hero): Item {
  const missing = h.maxHp - h.hp;
  const kits = [...medPacks(h)].sort((a, b) => a.power - b.power);
  return kits.find((k) => k.power >= missing) ?? kits[kits.length - 1]!;
}

function useMedPack(c: Ctx, pack: Item): void {
  const h = c.w.hero;
  const def = MEDS[pack.id]!;
  h.inventory.splice(h.inventory.indexOf(pack), 1);
  const heal = Math.round((def.heal + skillLevel(h, 'medicine') * 2) * (1 + perk(c.w.legacy, 'heal') / 100));
  train(c, 'medicine', 1);
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + heal);
  const cured = h.injuries.splice(0, def.cures);
  c.emit('use_med_pack', 'good', { item: def.name, heal: h.hp - before, cured: cured[0] ?? '', left: medPacks(h).length });
}

export function buyStim(c: Ctx, keeper: Npc, id: string, cost: number, cut: boolean): void {
  const h = c.w.hero;
  const def = STIMS[id]!;
  const it = makeItem(id);
  if (cut) it.tags.push('cut');
  h.cash -= cost;
  h.inventory.push(it);
  keeper.affinity += 1;
  c.emit(cut ? 'buy_stims' : 'buy_stim', cut ? 'mixed' : 'good', { variant: cut ? 'deal' : 'shop', npc: keeper.name, item: def.name, cost });
}

/** Stack too many and the world starts to move. */
export function useStim(c: Ctx, it: Item): void {
  const { w, rng } = c;
  const h = w.hero;
  const def = stimDef(it)!;
  h.inventory.splice(h.inventory.indexOf(it), 1);
  const buffId = `stim:${it.id}`;
  const active = activeStims(h, w.beat);
  const same = active.find((b) => b.id === buffId);
  if (same) {
    if (same.stat) h[same.stat] = Math.max(1, h[same.stat] - (same.amount ?? 0));
    h.buffs.splice(h.buffs.indexOf(same), 1);
  }
  const others = active.length - (same ? 1 : 0);
  const odds = others >= 2 ? 0.6 : it.tags.includes('cut') ? 0.2 : 0;
  if (odds && rng.chance(odds)) {
    h.hp -= 15;
    h.drunk += 2;
    c.emit('use_stim', 'bad', { variant: 'overdose', item: def.name, mixed: others >= 2 });
    return;
  }
  h.buffs.push({ id: buffId, until: w.beat + def.duration, power: def.power, stat: def.stat, amount: def.amount, crash: def.crash });
  if (def.stat) h[def.stat] += def.amount ?? 0;
  c.emit('use_stim', 'good', { variant: 'boost', item: def.name, stat: def.stat ?? 'power', amount: def.amount ?? def.power, duration: def.duration });
}

/** Called every beat: drop lapsed buffs, take stat boosts back off, and let the crash land. */
export function expireBuffs(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  const keep = [] as typeof h.buffs;
  for (const b of h.buffs) {
    if (b.until > w.beat) {
      keep.push(b);
      continue;
    }
    if (b.stat) h[b.stat] = Math.max(1, h[b.stat] - (b.amount ?? 0));
    if (!b.id.startsWith('stim:')) continue;
    const name = STIMS[b.id.slice(5)]?.name ?? 'the stim';
    if (b.crash) {
      keep.push({ id: 'crash', until: w.beat + 12, power: -b.crash });
      c.emit('stim_fade', 'bad', { variant: 'crash', item: name });
    } else {
      c.emit('stim_fade', 'mixed', { variant: 'clean', item: name });
    }
  }
  h.buffs = keep;
}

export { wielded, isArm, GEAR_MARKUP };
