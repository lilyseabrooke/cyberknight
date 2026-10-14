import type { Ctx, Npc, World } from './types';
import { acquire, addHeat, fight, gainXp, here, npcsAt, relocate } from './combat';
import { clamp, spawnGroup, type Candidate } from './candidate';
import { makeItem } from './content/items';
import { IMPLANTS, IMPLANT_IDS, MAX_IMPLANTS } from './content/implants';
import { addCompanion, alliesWith, hasAlly, hasKind, newCompanion, removeCompanion, slotsFree } from './companions';
import { hasImplantFlag, skillLevel, synergy, train } from './skills';
import { spawnNpc } from './content/archetypes';
import { fameFrom, tipScale } from './stage';

const alive = (n: Npc | undefined): n is Npc => !!n && n.alive && n.downUntil <= 1e9;
const PIGEONS = ['Gerald', 'Beatrice', 'Sir Coos-a-Lot', 'Officer Feathers', 'Kevin'];
const DAMSEL_ROLES = ['courier', 'night-shift bartender', 'hacker with a blue streak', 'vending-machine technician', 'noodle-cart heiress'];

// ===================================================================== helpers other modules use

/** Allies (or a sonic ear implant) sometimes spot trouble first. Returns true if the ambush was avoided. */
export function scoutSaves(c: Ctx): boolean {
  const { w, rng } = c;
  const scouts = alliesWith(w, 'scout');
  const ear = hasImplantFlag(w.hero, 'sonic_ear');
  const p = scouts.length ? 0.4 : ear ? 0.3 : 0;
  if (!p || !rng.chance(p)) return false;
  c.emit('scout_warning', 'good', { name: scouts[0]?.name ?? 'her sonic ear', kind: scouts[0]?.kind ?? 'ear' });
  return true;
}

/** Everything that makes sneaking easier or harder. */
export function sneakBonus(w: World): number {
  const h = w.hero;
  let b = skillLevel(h, 'sneak') * 0.02;
  if (hasAlly(w, 'distract')) b += 0.08;
  if (w.situation.weather === 'neon_fog') b += 0.1;
  if (w.flags.blackout) b += 0.2;
  if (hasImplantFlag(h, 'glow')) b -= 0.05;
  return b;
}

/** She sometimes tries to beatbox her way out of a beating. It works more often than it should, which is to say rarely. */
export function tryTalkDown(c: Ctx, guards: Npc[]): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'beatbox');
  const wants = clamp(0.12 + (h.personality.weights.pride - 0.5) * 0.5 + lvl * 0.05, 0, 0.6);
  if (!guards.length || !rng.chance(wants)) return false;
  const g = guards[0]!;
  train(c, 'beatbox', 1);
  if (rng.chance(clamp(0.02 + 0.04 * synergy(h, ['beatbox', ['music', 0.5], ['stat:charm', 0.5]]), 0.02, 0.45))) {
    for (const x of guards) x.affinity += 10;
    addHeat(w, 'club', -2);
    h.fame += 1;
    c.emit('talk_down', 'good', { variant: 'win', npc: g.name, lvl });
    return true;
  }
  c.emit('talk_down', 'bad', { variant: 'fail', npc: g.name, lvl });
  return false;
}

// ===================================================================== candidates

export function extraCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = here(w);
  const feat = (kind: string) => w.features[kind]?.locationId === h.locationId;
  const music = skillLevel(h, 'djing');

  // ---- DJ booth
  if (feat('dj_booth')) {
    // She doesn't know he's still mad. A cautious hero might.
    const sore = w.npcs.kilobyte && w.npcs.kilobyte.affinity < -5 ? 0.7 : 0;
    out.push({ key: 'dj_set', drives: { pride: 0.9, curiosity: 0.5, lust: 0.15 }, bonus: music * 0.04, risk: 0.3 + sore, run: djSet });
  }

  // ---- street kids
  const kids = crowd.filter((n) => n.archetype === 'street_kid' && !n.hostile);
  for (const k of kids) {
    out.push({ key: `beatbox:${k.id}`, drives: { pride: 0.7, curiosity: 0.45 }, bonus: music * 0.03, risk: 0.1, run: (c) => beatbox(c, k) });
  }
  if (kids.some((k) => k.affinity >= 25) && slotsFree(w) && !hasKind(w, 'kids')) {
    out.push({ key: 'recruit_kids', drives: { pride: 0.5, curiosity: 0.4 }, bonus: 0.5, run: recruitKids });
  }

  // ---- robots to jack (instead of blowing them up)
  for (const n of crowd) {
    if (n.tags.includes('robot') && ['drone', 'scrapper'].includes(n.archetype) && !n.flags.includes('jacked') && slotsFree(w)) {
      out.push({
        key: `jack:${n.id}`, drives: { curiosity: 0.85, greed: 0.3, pride: 0.4 }, bonus: 0.2,
        risk: 0.3 + Math.max(0, n.level - h.level) * 0.3, run: (c) => jack(c, n),
      });
    }
  }

  // ---- recruit the hacker
  const juno = w.npcs.juno;
  if (alive(juno) && juno.locationId === h.locationId && w.flags['kissed:juno'] && juno.affinity >= 35 && slotsFree(w) && !hasKind(w, 'hacker')) {
    out.push({ key: 'recruit_juno', drives: { lust: 0.6, curiosity: 0.5, quest: 0.3 }, bonus: 0.6, run: recruitJuno });
  }

  // ---- the pigeon
  const noodles = h.inventory.find((i) => i.id === 'noodles');
  if (feat('pigeon') && noodles && slotsFree(w) && !hasKind(w, 'pigeon')) {
    out.push({ key: 'feed_pigeon', drives: { curiosity: 0.6, lust: 0.1 }, bonus: 0.3, run: feedPigeon });
  }

  // ---- noodles
  const vendor = crowd.find((n) => n.archetype === 'noodler' || n.archetype === 'cook');
  if (vendor && h.cash >= 5) {
    out.push({ key: 'buy_noodles', drives: { thirst: 0.2, curiosity: 0.15 }, bonus: 0.1, run: (c) => buyNoodles(c, vendor) });
  }
  if (noodles && h.drunk >= 2) {
    out.push({ key: 'eat_noodles', drives: {}, smart: 0.7, bonus: h.drunk * 0.15, run: eatNoodles });
  }

  // ---- the tab
  const bartender = [w.npcs.nyx, w.npcs.dutch].find((n) => alive(n) && n!.locationId === h.locationId);
  if (h.tab > 0 && bartender && h.cash >= Math.min(h.tab, 20)) {
    out.push({ key: 'settle_tab', drives: {}, smart: 1.0, bonus: h.tab / 90, run: (c) => settleTab(c, bartender) });
  }

  // ---- billboard
  if (feat('billboard')) {
    out.push({ key: 'billboard', drives: { pride: 0.8, curiosity: 0.6, greed: 0.1 }, risk: 0.4, run: hackBillboard });
  }

  // ---- implants from the doc
  const doc = crowd.find((n) => n.tags.includes('doc'));
  if (doc && h.cash >= 60 && h.implants.length < MAX_IMPLANTS && IMPLANT_IDS.some((i) => !h.implants.includes(i))) {
    out.push({ key: 'implant', drives: { curiosity: 0.7, pride: 0.3, quest: 0.2 }, bonus: 0.2, risk: 0.4, run: (c) => getImplant(c, doc) });
  }

  // ---- damsel in distress
  const d = w.damsel;
  if (d && d.locationId === h.locationId && d.foeIds.some((id) => alive(w.npcs[id]))) {
    out.push({ key: 'rescue', drives: { bravery: 0.9, lust: 0.6, pride: 0.9, quest: 0.3 }, bonus: 0.7, risk: 0.8, run: rescue });
  }

  // ---- dragon intel (what a prepared hero does)
  const madame = crowd.find((n) => n.id === 'madame');
  if (madame && h.cash >= 150 && !w.flags.dragon_weak) {
    out.push({ key: 'buy_intel', drives: { quest: 0.7, curiosity: 0.4 }, smart: 1.2, bonus: w.flags.dragon_known ? 0.5 : 0.1, run: (c) => buyIntel(c, madame) });
  }
  if (feat('terminal') && !w.flags.dragon_weak) {
    out.push({ key: 'terminal', drives: { curiosity: 0.8, quest: 0.5 }, smart: 1.1, risk: 0.6, run: hackTerminal });
  }

  // ---- poker
  if (feat('poker') && h.cash >= 30) {
    out.push({ key: 'poker', drives: { greed: 0.85, pride: 0.5, curiosity: 0.2 }, risk: 0.5, run: poker });
  }

  // ---- serenading the dragon, because why not
  const dragon = w.npcs.dragon;
  if (loc.id === 'overpass' && alive(dragon)) {
    out.push({ key: 'serenade', drives: { pride: 0.8, curiosity: 0.6, quest: 0.2 }, bonus: music * 0.04, risk: 2.5, run: serenade });
  }

  // ---- looking after her people
  for (const a of h.companions) {
    out.push({ key: `pet_ally:${a.id}`, drives: { lust: 0.04, curiosity: 0.08 }, bonus: a.loyalty < 40 ? 0.7 : -0.3, run: (c) => {
      a.loyalty = Math.min(100, a.loyalty + 10 + skillLevel(h, 'rapport'));
      train(c, 'rapport', 1);
      c.emit('pet_ally', 'good', { name: a.name, kind: a.kind });
    } });
    if (a.hp < a.maxHp * 0.6 && h.cash >= 10) {
      out.push({ key: `repair_ally:${a.id}`, drives: { curiosity: 0.2 }, smart: 0.8, bonus: (1 - a.hp / a.maxHp) * 0.9, run: (c) => {
        const cost = Math.min(h.cash, 15);
        h.cash -= cost;
        a.hp = Math.min(a.maxHp, a.hp + Math.round(a.maxHp * 0.7));
        a.loyalty = Math.min(100, a.loyalty + 8);
        train(c, 'tinkering', 2);
        c.emit('repair_ally', 'good', { name: a.name, kind: a.kind, cost });
      } });
    }
  }
  return out;
}

// ===================================================================== resolvers

function djSet(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const kilo = w.npcs.kilobyte;
  const lvl = skillLevel(h, 'djing');
  if (alive(kilo) && kilo.locationId === h.locationId && kilo.affinity < -5) {
    kilo.affinity -= 2;
    c.emit('dj_set', 'bad', { variant: 'blocked', npc: kilo.name });
    return;
  }
  const b2b = alive(kilo) && kilo.locationId === h.locationId && kilo.affinity >= 15;
  const p = clamp(0.15 + 0.07 * synergy(h, ['djing', ['music', 0.7], ['tinkering', 0.2]]) + h.charm * 0.015 + (b2b ? 0.12 : 0) - h.drunk * 0.02, 0.05, 0.92);
  const roll = rng.next();
  if (roll < p) {
    const tips = Math.round(rng.int(40, 120) * tipScale(w, 'dj_set'));
    h.cash += tips;
    fameFrom(c, b2b ? 3 : 2, 'dj_set');
    for (const n of here(w)) if (!n.hostile) n.affinity += n.tags.includes('romanceable') ? 8 : 3;
    train(c, 'djing', 3);
    gainXp(c, 6);
    c.emit('dj_set', 'good', { variant: b2b ? 'b2b' : 'killer', amount: tips, npc: kilo?.name ?? 'the DJ', lvl });
  } else if (roll < p + (1 - p) * 0.55) {
    h.hp -= 4;
    train(c, 'djing', 1);
    for (const n of here(w)) if (!n.hostile) n.affinity -= 2;
    c.emit('dj_set', 'bad', { variant: 'flop' });
  } else {
    addHeat(w, 'npd', 1);
    train(c, 'djing', 1);
    c.emit('dj_set', 'bad', { variant: 'wrong_file' });
  }
}

function beatbox(c: Ctx, kid: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'beatbox');
  if (rng.chance(clamp(0.08 + 0.07 * synergy(h, ['beatbox', ['music', 0.5], ['stat:charm', 0.3]]) + h.charm * 0.01, 0.05, 0.9))) {
    kid.affinity += 30;
    for (const k of here(w)) if (k.archetype === 'street_kid') k.affinity += 10;
    fameFrom(c, 1, 'beatbox');
    train(c, 'beatbox', 2);
    c.emit('beatbox', 'good', { variant: 'jam', npc: kid.name, lvl });
  } else {
    kid.affinity -= 5;
    train(c, 'beatbox', 1);
    if (kid.affinity < 0 && rng.chance(0.4)) {
      const lost = Math.min(h.cash, rng.int(8, 30));
      h.cash -= lost;
      c.emit('beatbox', 'bad', { variant: 'robbed', npc: kid.name, amount: lost });
    } else {
      c.emit('beatbox', 'bad', { variant: 'laughed', npc: kid.name });
    }
  }
}

function recruitKids(c: Ctx): void {
  addCompanion(c, newCompanion('kids', 'the Backlot Kids', { loyalty: 60, home: 'club_backlot' }), 'friendship');
}

function jack(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  n.flags.push('jacked');
  const p = clamp(0.25 + h.hack * 0.06 + skillLevel(h, 'tinkering') * 0.05 + (hasAlly(w, 'hack') ? 0.08 : 0) - n.level * 0.03, 0.08, 0.85);
  if (rng.chance(p)) {
    const kind = n.archetype === 'scrapper' ? 'scrapper' : 'drone';
    n.locationId = '_companion';
    addCompanion(c, newCompanion(kind, n.name, { npcId: n.id, home: h.locationId, loyalty: 50 }), 'jacked', true);
    train(c, 'tinkering', 3);
    gainXp(c, 12);
    if (kind === 'drone') addHeat(w, 'atlas', 1);
    c.emit('jack', 'good', { variant: kind, npc: n.name });
  } else {
    h.hp -= rng.int(6, 12);
    n.hostile = true;
    c.emit('jack', 'bad', { variant: 'fail', npc: n.name });
    fight(c, [n], { cause: `failing to jack ${n.name}` });
  }
}

function recruitJuno(c: Ctx): void {
  const j = c.w.npcs.juno!;
  j.locationId = '_companion';
  c.emit('recruit', 'good', { variant: 'juno', npc: j.name });
  addCompanion(c, newCompanion('hacker', j.name, { npcId: j.id, home: 'halo_floor', loyalty: 70 }), 'love', true);
}

function feedPigeon(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const idx = h.inventory.findIndex((i) => i.id === 'noodles');
  if (idx >= 0) h.inventory.splice(idx, 1);
  const name = rng.pick(PIGEONS);
  if (rng.chance(0.72)) {
    c.emit('pigeon', 'good', { variant: 'befriend', name });
    addCompanion(c, newCompanion('pigeon', name, { loyalty: 50 }), 'noodles', true);
  } else {
    c.emit('pigeon', 'bad', { variant: 'snub', name });
  }
}

function buyNoodles(c: Ctx, vendor: Npc): void {
  const h = c.w.hero;
  h.cash -= 5;
  h.inventory.push(makeItem('noodles'));
  vendor.affinity += 1;
  c.emit('buy_noodles', 'mixed', { npc: vendor.name });
}

function eatNoodles(c: Ctx): void {
  const h = c.w.hero;
  const idx = h.inventory.findIndex((i) => i.id === 'noodles');
  if (idx >= 0) h.inventory.splice(idx, 1);
  h.drunk = Math.max(0, h.drunk - 1); // food sobers you up; it does not close wounds
  c.emit('eat_noodles', 'good', {});
}

function settleTab(c: Ctx, bartender: Npc): void {
  const h = c.w.hero;
  const pay = Math.min(h.cash, h.tab);
  h.cash -= pay;
  h.tab -= pay;
  bartender.affinity += 4;
  c.emit('settle_tab', 'good', { amount: pay, left: h.tab, npc: bartender.name });
}

function hackBillboard(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.3 + h.hack * 0.06 + skillLevel(h, 'tinkering') * 0.03, 0.1, 0.85);
  if (rng.chance(p)) {
    // Each hijack is less of a story, and Atlas gets angrier about it.
    const hacks = w.counters.billboard_hacks ?? 0;
    h.fame += 3 * 0.55 ** hacks;
    w.counters.billboard_hacks = hacks + 1;
    addHeat(w, 'atlas', 1 + Math.min(2, hacks));
    train(c, 'tinkering', 2);
    c.emit('billboard', 'good', { variant: 'success' });
  } else {
    h.hp -= 6;
    addHeat(w, 'atlas', 2);
    c.emit('billboard', 'bad', { variant: 'fail' });
  }
}

/** The doc's chair. Without a `choice` she takes whatever is on the tray; with one, it's the one she came for. */
export function getImplant(c: Ctx, doc: Npc, choice?: string): void {
  const { w, rng } = c;
  const h = w.hero;
  const id = choice ?? rng.pick(IMPLANT_IDS.filter((i) => !h.implants.includes(i) && !w.flags[`sold:${i}`]));
  const def = IMPLANTS[id]!;
  const price = Math.round(def.cost * (1 - Math.min(0.3, skillLevel(h, 'haggling') * 0.03)));
  train(c, 'haggling', 1);
  if (h.cash < price) {
    c.emit('implant', 'mixed', { variant: 'poor', npc: doc.name, implant: def.name, cost: def.cost });
    return;
  }
  h.cash -= price;
  if (rng.chance(0.12)) {
    h.cash += Math.round(price / 2);
    if (!h.injuries.includes('concussion')) h.injuries.push('concussion');
    c.emit('implant', 'bad', { variant: 'reject', npc: doc.name, implant: def.name });
    return;
  }
  h.implants.push(id);
  for (const [k, v] of Object.entries(def.stats ?? {})) h[k as 'muscle'] = Math.max(0, h[k as 'muscle'] + (v ?? 0));
  doc.affinity += 3;
  c.emit('implant', 'good', { variant: 'install', npc: doc.name, implant: def.name, pitch: def.pitch, catch: def.catch, cost: def.cost, id });
}

function rescue(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const d = w.damsel!;
  const damsel = w.npcs[d.npcId]!;
  const foes = d.foeIds.map((id) => w.npcs[id]).filter((n): n is Npc => alive(n));
  c.emit('rescue', 'mixed', { variant: 'intervene', npc: damsel.name });
  const res = fight(c, foes, { cause: `rescuing ${damsel.name}`, joiners: false, assault: true });
  if (w.over) return;
  w.damsel = null;
  if (res !== 'win') {
    c.emit('rescue', 'bad', { variant: 'failed', npc: damsel.name });
    return;
  }
  damsel.affinity += 45;
  h.fame += 3;
  const cash = rng.int(60, 150);
  h.cash += cash;
  let item = '';
  if (rng.chance(0.4)) {
    const it = makeItem(rng.pick(['memory_shard', 'fake_id']));
    item = it.name;
    acquire(c, it);
  }
  const joins = slotsFree(w) && !hasKind(w, 'courier') && rng.chance(0.55);
  c.emit('rescue', 'good', { variant: joins ? 'thanks_joins' : 'thanks', npc: damsel.name, amount: cash, item });
  if (joins) {
    damsel.locationId = '_companion';
    addCompanion(c, newCompanion('courier', damsel.name, { npcId: damsel.id, home: 'street_main', loyalty: 70 }), 'rescue', true);
  }
}

function buyIntel(c: Ctx, madame: Npc): void {
  const { w } = c;
  w.hero.cash -= 150;
  w.flags.dragon_weak = true;
  w.flags.dragon_known = true;
  madame.affinity += 8;
  c.emit('intel', 'good', { variant: 'madame', npc: madame.name });
}

function hackTerminal(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.25 + h.hack * 0.07 + skillLevel(h, 'tinkering') * 0.03 + (hasAlly(w, 'hack') ? 0.1 : 0), 0.1, 0.85);
  if (rng.chance(p)) {
    w.flags.dragon_weak = true;
    w.flags.dragon_known = true;
    gainXp(c, 15);
    train(c, 'tinkering', 3);
    c.emit('intel', 'good', { variant: 'terminal' });
  } else {
    addHeat(w, 'atlas', 2);
    h.hp -= 6;
    c.emit('intel', 'bad', { variant: 'terminal_fail' });
  }
}

function poker(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const madame = w.npcs.madame;
  const cheat = h.hack >= 3 && rng.chance(0.45);
  const p = clamp(0.3 + h.charm * 0.012 + 0.05 * synergy(h, ['cards', ['stat:charm', 0.5]]) + (cheat ? 0.05 + 0.04 * synergy(h, ['cards', 'sleight']) : 0) - h.drunk * 0.02, 0.1, 0.88);
  train(c, 'cards', 2);
  if (cheat) train(c, 'sleight', 1);
  if (cheat && rng.chance(0.18) && alive(madame) && madame.locationId === h.locationId) {
    madame.affinity -= 30;
    c.emit('poker', 'bad', { variant: 'caught', npc: madame.name });
    fight(c, [madame], { cause: 'cheating at poker' });
    return;
  }
  if (rng.chance(p)) {
    const win = rng.int(60, 220);
    h.cash += win;
    c.emit('poker', 'good', { variant: cheat ? 'cheat_win' : 'win', amount: win });
  } else {
    const lost = Math.min(h.cash, rng.int(30, 100));
    h.cash -= lost;
    c.emit('poker', 'bad', { variant: 'lose', amount: lost });
  }
}

function serenade(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'beatbox');
  h.fame += 3;
  train(c, 'beatbox', 2);
  c.emit('serenade', 'mixed', { variant: 'viral', lvl });
  fight(c, [w.npcs.dragon!], { cause: 'serenading a cyberdragon' });
}

// ===================================================================== ambient

const ANTIC: Record<string, (c: Ctx, name: string) => Record<string, number | string | boolean>> = {
  puppy: (c) => {
    const it = makeItem(c.rng.pick(['credchip', 'gold_tooth', 'eyeballs', 'neural_gum']));
    c.w.hero.inventory.push(it);
    return { variant: 'puppy', item: it.name };
  },
  drone: (c) => {
    return { variant: 'drone' };
  },
  kids: (c) => {
    const amt = c.rng.int(5, 25);
    c.w.hero.cash += amt;
    return { variant: 'kids', amount: amt };
  },
  pigeon: (c) => {
    const amt = c.rng.int(5, 30);
    c.w.hero.cash += amt;
    return { variant: 'pigeon', amount: amt };
  },
  scrapper: (c) => {
    const amt = c.rng.int(10, 40);
    c.w.hero.cash += amt;
    return { variant: 'scrapper', amount: amt };
  },
  hacker: (c) => {
    const amt = c.rng.int(10, 35);
    c.w.hero.cash += amt;
    return { variant: 'hacker', amount: amt };
  },
  courier: (c) => {
    const amt = c.rng.int(20, 50);
    c.w.hero.cash += amt;
    return { variant: 'courier', amount: amt };
  },
};

/** The living city and living team: antics, scouts, loyalty, fans, ads, weather, damsels, the tab. */
export function ambientExtras(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;

  // --- allies: loyalty fades, antics happen, scouts find things
  if (w.beat % 15 === 0) {
    for (const a of [...h.companions]) {
      if (a.abilities.includes('sing')) continue;
      a.loyalty -= a.loyalty < 30 ? 2 : 1;
      if (a.loyalty <= 0) removeCompanion(c, a, 'left');
    }
  }
  for (const a of h.companions) {
    if (rng.chance(a.abilities.includes('fetch') ? 0.075 : 0.04)) {
      const fx = ANTIC[a.kind]?.(c, a.name) ?? { variant: a.kind };
      c.emit('antic', 'mixed', { name: a.name, kind: a.kind, ...fx });
    }
    if (a.abilities.includes('scout') && rng.chance(0.05)) {
      const hidden = loc.exits.find((e) => e.hidden);
      if (hidden) {
        hidden.hidden = false;
        c.emit('scout_find', 'good', { name: a.name, kind: a.kind, to: w.locations[hidden.to]!.name });
      }
    }
  }

  // --- fans
  if (h.fame >= 3 && loc.crowded && rng.chance(0.04)) {
    const amt = rng.int(10, 40);
    h.cash += amt;
    c.emit('fan', 'good', { variant: String(rng.int(1, 4)), amount: amt, fame: h.fame });
  }

  // --- ads and weather, outdoors
  if (loc.outdoors) {
    if (rng.chance(0.04)) {
      w.counters.ads = (w.counters.ads ?? 0) + 1;
      c.emit('ad', 'mixed', { variant: hasImplantFlag(h, 'ad_blocker') ? 'blocked' : String(rng.int(1, 8)) });
    }
    if (w.beat % 12 === 0) {
      let hit = 0;
      if (w.situation.weather === 'acid_rain' && (h.armor?.power ?? 0) < 3) {
        hit = 3;
        h.hp -= hit;
      }
      c.emit('weather', 'mixed', { variant: w.situation.weather, hit });
    }
  }

  // --- the tab collector
  if (loc.id === 'halo_floor' && h.tab >= 70 && rng.chance(0.12)) {
    const tiny = w.npcs.tiny;
    if (alive(tiny) && tiny.locationId === loc.id) {
      if (h.cash >= h.tab) {
        h.cash -= h.tab;
        c.emit('collector', 'bad', { variant: 'paid', amount: h.tab, npc: tiny.name });
        h.tab = 0;
      } else {
        c.emit('collector', 'bad', { variant: 'threat', amount: h.tab, npc: tiny.name });
        fight(c, [tiny], { cause: 'her bar tab' });
        h.tab = Math.max(0, h.tab - 30);
      }
    }
  }

  // --- damsel in distress: appears, then times out if ignored
  const d = w.damsel;
  if (d) {
    if (w.beat > d.until) {
      const dm = w.npcs[d.npcId];
      for (const id of d.foeIds) {
        const f = w.npcs[id];
        if (f) f.alive = false;
      }
      if (dm) dm.locationId = '_gone';
      w.damsel = null;
      c.emit('damsel', 'mixed', { variant: 'self_rescue', npc: dm?.name ?? 'She' });
    }
  } else if (loc.outdoors && loc.id !== 'overpass' && loc.id !== 'halo_roof' && w.beat > 8 && rng.chance(0.03)) {
    const id = `damsel_${w.beat}`;
    const dm = spawnNpc(rng, id, 'damsel', loc.id);
    w.npcs[id] = dm;
    const foes = spawnGroup(c, 'mugger', 2);
    w.damsel = { npcId: id, foeIds: foes.map((f) => f.id), locationId: loc.id, until: w.beat + 12 };
    c.emit('damsel', 'mixed', { variant: 'scene', npc: dm.name, role: rng.pick(DAMSEL_ROLES) });
  }
}

export { relocate, npcsAt };
