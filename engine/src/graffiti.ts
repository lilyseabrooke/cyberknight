import type { Ctx, Hero, Item, Npc, World } from './types';
import { acquire, addHeat, fight, here, relocate, remember } from './combat';
import { clamp, spawnGroup, type Candidate } from './candidate';
import { makeItem } from './content/items';
import { ODDS } from './hobbies';
import { odds, skillLevel, synergy, train } from './skills';
import { scoutSaves } from './extras';
import { kindle } from './romance';

/** Fame from a piece falls off with each piece already on that spot. No timers: the wall just gets full. */
export const FAME_DECAY = 0.6;
export const pieceFame = (h: Hero, existing: number): number => (1 + (skillLevel(h, 'art') >= 5 ? 1 : 0)) * FAME_DECAY ** existing;

const cans = (h: Hero): Item[] => h.inventory.filter((i) => i.id === 'spray_can' && i.power > 0);
export const paintCharges = (h: Hero): number => cans(h).reduce((a, i) => a + i.power, 0);

function giveCan(h: Hero, charges: number): void {
  const existing = cans(h).find((i) => i.power < 5);
  if (existing && charges < 5) {
    existing.power = Math.min(5, existing.power + charges);
    existing.name = `can of spray paint (${existing.power} left)`;
    return;
  }
  const can = makeItem('spray_can');
  can.power = charges;
  can.name = `can of spray paint (${charges} left)`;
  h.inventory.push(can);
}

function spend(h: Hero): boolean {
  const can = cans(h)[0];
  if (!can) return false;
  can.power -= 1;
  if (can.power <= 0) h.inventory.splice(h.inventory.indexOf(can), 1);
  else can.name = `can of spray paint (${can.power} left)`;
  return true;
}

export const makeCan = giveCan;
const stock = (w: World): number => w.counters.paint_stock ?? 0;
const present = (n: Npc | undefined, w: World): n is Npc => !!n && n.alive && n.locationId === w.hero.locationId && n.downUntil <= w.beat;

/** Tagging, and everything that can go wrong with it; plus the paint shop and its many ways to get paint. */
export function graffitiCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const artist = (h.skills.art ?? 0) > 0;

  // ---- tagging: anywhere with a surface, if she has paint
  if (paintCharges(h) > 0 && !['overpass', 'paint_shop'].includes(loc.id)) {
    const risk =
      (loc.kind === 'corp' ? 1.2 : loc.kind === 'bar' ? 0.5 : loc.kind === 'club' ? 0.5 : loc.id === 'halo_roof' ? 0 : 0.25) +
      (loc.territory ? 0.5 : 0) +
      loc.graffiti * 0.08;
    out.push({ key: 'graffiti', drives: { pride: 0.7, curiosity: 0.55, bravery: 0.3 }, bonus: artist ? 0.25 : 0, risk, run: tag });
  }

  // ---- the paint shop
  const clerk = w.npcs.clerk;
  if (loc.id === 'paint_shop' && stock(w) > 0) {
    const want = paintCharges(h) === 0 && artist ? 0.5 : 0;
    if (present(clerk, w)) {
      if (h.cash >= 12) out.push({ key: 'buy_paint', drives: { pride: 0.3, curiosity: 0.3 }, bonus: want + 0.2, run: buyPaint });
      out.push({ key: 'seduce_clerk', drives: { lust: 0.9, pride: 0.4 }, bonus: want, run: seduceClerk });
      out.push({ key: 'threaten_clerk', drives: { bravery: 0.5, pride: 0.6, greed: 0.6 }, bonus: want, risk: 0.4, run: threatenClerk });
      out.push({ key: 'rob_paint_shop', drives: { bravery: 0.7, greed: 0.7, pride: 0.3 }, bonus: want, risk: 0.5, run: robShop });
      out.push({ key: 'shoplift_paint', drives: { greed: 0.8, curiosity: 0.4, pride: 0.2 }, bonus: want, risk: 0.4, run: shoplift });
    } else {
      // Nobody at the counter. Help yourself.
      out.push({ key: 'help_herself', drives: { greed: 0.9, curiosity: 0.4 }, bonus: want + 0.3, run: helpHerself });
    }
  }
  return out;
}

// ============================================================================ tagging

function tag(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const n = loc.graffiti;
  spend(h);
  const dry = paintCharges(h) === 0;
  const p = clamp(ODDS.art(h) + (loc.id === 'halo_roof' ? 0.1 : 0), 0.08, 0.93);
  if (rng.chance(p)) {
    const gain = pieceFame(h, n);
    h.fame += gain;
    loc.graffiti = n + 1;
    train(c, 'art', 3);
    const turf = loc.territory;
    const variant = turf ? 'over_tag' : n === 0 ? 'mural' : n < 3 ? 'another' : n < 6 ? 'crowded' : 'overpaint';
    c.emit('graffiti', 'good', { variant, place: loc.name, pieces: loc.graffiti, fame: Math.round(gain * 10) / 10, gang: turf ?? '', level: skillLevel(h, 'art') });
    if (turf) {
      addHeat(w, turf, 2);
      // The enemy of my enemy is my friend. At least for tonight.
      for (const g of Object.values(w.npcs)) if (g.alive && g.tags.includes('ganger') && g.faction && g.faction !== turf && w.situation.warringGangs.includes(g.faction)) g.affinity += 8;
    }
  } else {
    train(c, 'art', 1);
    c.emit('graffiti', 'bad', { variant: 'rude', place: loc.name });
  }
  if (dry) c.emit('spray_empty', 'mixed', {});
  aftermath(c, loc.id);
}

/** Tagging isn't free: owners, bouncers, guards, police, drones, and whoever owns the turf. */
function aftermath(c: Ctx, locId: string): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[locId]!;
  if (loc.kind === 'bar') {
    const staff = here(w).filter((x) => x.faction === 'halo');
    if (staff.length) {
      for (const s of staff) s.affinity -= 8;
      addHeat(w, 'halo', 1);
      const dutch = w.npcs.dutch;
      if (present(dutch, w) && rng.chance(0.22)) {
        c.emit('tag_owner', 'bad', { npc: dutch.name, place: loc.name });
        fight(c, [dutch], { cause: 'tagging the Rusty Halo' });
      }
    }
  } else if (loc.kind === 'club') {
    addHeat(w, 'club', 1);
    const guards = here(w).filter((x) => x.tags.includes('security'));
    if (guards.length && rng.chance(0.3)) {
      c.emit('tag_owner', 'bad', { npc: guards[0]!.name, place: loc.name });
      fight(c, guards.slice(0, 2), { cause: 'tagging the Neon Pharaoh', joiners: false });
    }
  } else if (loc.kind === 'corp') {
    addHeat(w, 'atlas', 1);
    const guards = here(w).filter((x) => x.tags.includes('security'));
    if (guards.length && rng.chance(0.45)) {
      c.emit('tag_owner', 'bad', { npc: guards[0]!.name, place: loc.name });
      fight(c, guards.slice(0, 3), { cause: 'tagging Helix Biotech', joiners: false });
    }
  } else if (loc.outdoors && loc.id !== 'halo_roof') {
    if (rng.chance(0.2)) {
      addHeat(w, 'atlas', 1);
      c.emit('graffiti', 'mixed', { variant: 'drone', place: loc.name });
    }
    const p = 0.12 + 0.07 * (loc.graffiti - 1) + 0.03 * (w.heat.npd ?? 0);
    if (!w.over && h.hp > 0 && rng.chance(p)) vandalCops(c);
  }
}

/** An itinerant vandal gets fined, or runs. */
function vandalCops(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  if (scoutSaves(c)) return;
  const cops = spawnGroup(c, 'npd_officer', rng.int(1, 2));
  c.emit('vandal', 'bad', { variant: 'scene', count: cops.length });
  const runOdds = odds(0.3, 0.05, synergy(h, ['athletics', ['stat:reflex', 0.5]])) + 0.02 * h.reflex;
  if (rng.chance(clamp(runOdds, 0.1, 0.85))) {
    for (const k of cops) k.alive = false;
    addHeat(w, 'npd', 1);
    relocate(w, w.locations[h.locationId]!.fleeTo);
    train(c, 'athletics', 2);
    c.emit('vandal', 'good', { variant: 'escaped', to: w.locations[h.locationId]!.name });
  } else if (h.cash >= 30) {
    const fine = Math.min(h.cash, rng.int(30, 80));
    h.cash -= fine;
    for (const k of cops) k.alive = false;
    c.emit('vandal', 'bad', { variant: 'fined', amount: fine });
  } else {
    c.emit('vandal', 'bad', { variant: 'cant_pay' });
    fight(c, cops, { cause: 'a vandalism arrest', joiners: false });
  }
}

// ============================================================================ the paint shop

function buyPaint(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const clerk = w.npcs.clerk!;
  const cost = Math.max(5, Math.round(rng.int(12, 20) * (1 - Math.min(0.3, skillLevel(h, 'haggling') * 0.03))));
  h.cash -= Math.min(h.cash, cost);
  w.counters.paint_stock = stock(w) - 1;
  giveCan(h, 5);
  clerk.affinity += 1;
  train(c, 'haggling', 1);
  c.emit('paint_shop', 'good', { variant: 'buy', cost, npc: clerk.name });
}

function seduceClerk(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const clerk = w.npcs.clerk!;
  const p = clamp(0.28 + h.charm * 0.025 + 0.045 * synergy(h, ['romance', 'stat:charm']) + clerk.affinity / 200, 0.05, 0.9);
  train(c, 'romance', 1);
  kindle(h, 0.04);
  if (rng.chance(p)) {
    const n = rng.int(2, 3);
    clerk.affinity += 20;
    w.counters.paint_stock = Math.max(0, stock(w) - n);
    for (let i = 0; i < n; i++) giveCan(h, 5);
    train(c, 'romance', 2);
    remember(clerk, 'gave Blackbird paint, and a phone number she is not sure about');
    c.emit('paint_shop', 'good', { variant: 'flirt_win', npc: clerk.name, count: n });
  } else {
    clerk.affinity -= 6;
    c.emit('paint_shop', 'bad', { variant: 'flirt_fail', npc: clerk.name });
  }
}

function threatenClerk(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const clerk = w.npcs.clerk!;
  const p = clamp(0.25 + h.muscle * 0.02 + 0.05 * synergy(h, ['intimidation', ['stat:muscle', 0.5]]) - clerk.level * 0.05, 0.08, 0.9);
  train(c, 'intimidation', 1);
  if (rng.chance(p)) {
    const n = Math.min(3, stock(w));
    w.counters.paint_stock = stock(w) - n;
    for (let i = 0; i < n; i++) giveCan(h, 5);
    clerk.affinity -= 30;
    addHeat(w, 'npd', 1);
    remember(clerk, 'was shaken down for paint by Blackbird');
    c.emit('paint_shop', 'good', { variant: 'threat_win', npc: clerk.name, count: n });
  } else {
    clerk.affinity -= 10;
    c.emit('paint_shop', 'bad', { variant: 'threat_fail', npc: clerk.name });
    fight(c, [clerk], { cause: 'threatening the paint-shop clerk', joiners: false, assault: true });
  }
}

function robShop(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  const clerk = w.npcs.clerk!;
  c.emit('paint_shop', 'mixed', { variant: 'rob_start', npc: clerk.name });
  clerk.affinity -= 20;
  const res = fight(c, [clerk], { cause: 'robbing the paint shop', joiners: false, assault: true });
  if (res !== 'win' || w.over) return;
  const n = stock(w);
  w.counters.paint_stock = 0;
  for (let i = 0; i < Math.min(n, 6); i++) giveCan(h, 5);
  h.cash += 30;
  addHeat(w, 'npd', 2);
  c.emit('paint_shop', 'good', { variant: 'rob_win', count: Math.min(n, 6), npc: clerk.name });
}

function shoplift(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const clerk = w.npcs.clerk!;
  const p = clamp(0.3 + 0.05 * synergy(h, ['sleight', ['stat:reflex', 0.5]]) + h.reflex * 0.02, 0.08, 0.88);
  train(c, 'sleight', 1);
  if (rng.chance(p)) {
    const n = rng.int(1, 2);
    w.counters.paint_stock = Math.max(0, stock(w) - n);
    for (let i = 0; i < n; i++) giveCan(h, 5);
    train(c, 'sleight', 1);
    c.emit('paint_shop', 'good', { variant: 'lift_win', count: n });
  } else {
    clerk.affinity -= 20;
    c.emit('paint_shop', 'bad', { variant: 'lift_caught', npc: clerk.name });
    fight(c, [clerk], { cause: 'shoplifting paint', joiners: false });
  }
}

function helpHerself(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  const n = Math.min(4, stock(w));
  w.counters.paint_stock = stock(w) - n;
  for (let i = 0; i < n; i++) giveCan(h, 5);
  c.emit('paint_shop', 'good', { variant: 'unattended', count: n });
}

// ============================================================================ ambient

/** Gang retaliation, and what time does to murals. */
export function ambientGraffiti(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;

  // Her work is seen, and sometimes buffed.
  if (loc.graffiti > 0 && rng.chance(0.06)) {
    const turf = loc.territory;
    if (turf && (w.heat[turf] ?? 0) >= 2 && rng.chance(0.4)) {
      loc.graffiti -= 1;
      c.emit('mural', 'bad', { variant: 'buffed', place: loc.name, gang: turf, pieces: loc.graffiti });
    } else {
      c.emit('mural', 'good', { variant: loc.graffiti >= 4 ? 'gallery' : 'proud', place: loc.name, pieces: loc.graffiti });
    }
  }

  // Gangs she's angered come looking.
  if (!loc.outdoors) return;
  for (const g of w.situation.warringGangs) {
    const heat = w.heat[g] ?? 0;
    if (heat >= 2 && rng.chance(0.045 * heat)) {
      if (scoutSaves(c)) return;
      const crew = spawnGroup(c, 'ganger', rng.int(2, 3), g);
      c.emit('gang_hunt', 'bad', { gang: g, count: crew.length, place: loc.name, turf: loc.territory === g });
      fight(c, crew, { cause: 'gangers looking for the vandal', joiners: false });
      return;
    }
  }
}

export { acquire };
