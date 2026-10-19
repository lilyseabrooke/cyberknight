import type { Ctx, Npc, World } from './types';
import { acquire, addHeat, fight, gainXp, here, remember } from './combat';
import { clamp, dutchHere, levelRisk, spawnGroup, type Candidate } from './candidate';
import { makeAmmoBox, makeItem } from './content/items';
import { AMMO_IDS } from './content/ammo';
import { skillLevel, train } from './skills';
import { isFairGame } from './people';
import { kindle } from './romance';
import { bondEvent, romanceMod, scruples } from './bonds';
import { atLeast, awareness, bucketOf, npcPerception } from './stealth';

/**
 * Rod work: what a fishing rod is for once she is good enough that nobody can say what it is for.
 *
 * The rod is a way of doing things at a distance. Each trick is opened by her fishing level (0..100, the grade scale) and
 * needs the rod in her pockets, but not water. They are meant to be a bit much:
 *
 *   8  the bar-tap bottle      10 vending machine     12 dumpster        18 grapple (rooftops)
 *   15 hook and haul (a person, pulled in by the collar)                20 the fuse-panel lever
 *   25 smooth reel (a girl, pulled in by the jacket)                    30 the till, from across the room
 *   45 fishing for muggers (bait on the hook; something bites)
 *   60 the legendary one: pickpocketing somebody from across the room
 */
export const ROD_TRICKS = { tap: 8, vending: 10, dumpster: 12, haul: 15, grapple: 18, panel: 20, smooth: 25, till: 30, bait: 45, lift: 60 } as const;

const alive = (n: Npc | undefined): n is Npc => !!n && n.alive;

export function rodCandidates(w: World): Candidate[] {
  const h = w.hero;
  if (!h.inventory.some((i) => i.tags.includes('rod'))) return [];
  const lvl = skillLevel(h, 'fishing');
  const loc = w.locations[h.locationId]!;
  const crowd = here(w).filter(alive);
  const feat = (k: string) => w.features[k]?.locationId === h.locationId;
  const out: Candidate[] = [];

  // ---- things, from a distance
  if (feat('taps') && lvl >= ROD_TRICKS.tap && h.drunk < 4) {
    out.push({ key: 'rod_tug:tap', drives: { thirst: 0.9, curiosity: 0.3, pride: 0.2 }, bonus: 0.1, risk: 0.2, run: (c) => tug(c, 'tap') });
  }
  if (feat('vending') && lvl >= ROD_TRICKS.vending) {
    out.push({ key: 'rod_tug:vending', drives: { greed: 0.4, curiosity: 0.4, pride: 0.2 }, risk: 0.05, run: (c) => tug(c, 'vending') });
  }
  if (feat('dumpster') && lvl >= ROD_TRICKS.dumpster) {
    out.push({ key: 'rod_tug:dumpster', drives: { curiosity: 0.85, greed: 0.5 }, bonus: (w.features.dumpster!.uses > 5 ? -0.5 : 0) + 0.1, risk: 0.05, run: (c) => tug(c, 'dumpster') });
  }
  if (feat('fuse_panel') && lvl >= ROD_TRICKS.panel) {
    out.push({ key: 'rod_tug:panel', drives: { curiosity: 0.9, bravery: 0.2, pride: 0.3 }, bonus: 0.1, risk: 0.1, run: (c) => tug(c, 'panel') });
  }
  if (feat('till') && lvl >= ROD_TRICKS.till) {
    out.push({ key: 'rod_tug:till', drives: { greed: 1.2, pride: 0.4, curiosity: 0.2 }, risk: (dutchHere(w) ? 0.9 : 0.3) + 0.2 * (w.heat.halo ?? 0), run: (c) => tug(c, 'till') });
  }
  if (feat('parkour') && lvl >= ROD_TRICKS.grapple) {
    out.push({ key: 'rod_swing', drives: { pride: 0.6, bravery: 0.5, curiosity: 0.4, greed: 0.2 }, risk: 0.3, run: swing });
  }
  if (loc.kind === 'street' && loc.outdoors && h.cash >= 20 && lvl >= ROD_TRICKS.bait) {
    out.push({ key: 'rod_bait', drives: { bravery: 0.7, pride: 0.8, greed: 0.5, curiosity: 0.4 }, bonus: 0.1, risk: 0.8, run: bait });
  }

  // ---- people, from a distance
  for (const n of crowd) {
    if (n.tags.some((t) => ['boss', 'dragon'].includes(t))) continue;
    const foe = n.hostile || n.affinity < -10;
    if (foe && lvl >= ROD_TRICKS.haul) {
      out.push({
        key: `reel_in:${n.id}`, drives: { bravery: 0.9, pride: 0.9, curiosity: 0.3 }, bonus: 0.15,
        risk: 0.4 + levelRisk(w, n), intent: { npc: n.name }, run: (c) => reelIn(c, n),
      });
    }
    if (!n.hostile && isFairGame(n) && lvl >= ROD_TRICKS.smooth) {
      out.push({
        key: `reel_girl:${n.id}`, drives: { lust: 1.1, pride: 0.7, curiosity: 0.3 }, bonus: scruples(w, n) + 0.1,
        intent: { npc: n.name }, run: (c) => reelGirl(c, n),
      });
    }
    if (!n.hostile && !n.tags.some((t) => ['robot', 'doc'].includes(t)) && (n.cash > 0 || n.loadout.length) && lvl >= ROD_TRICKS.lift) {
      out.push({
        key: `rod_lift:${n.id}`, drives: { greed: 1.0, pride: 0.9, curiosity: 0.4 }, bonus: 0.3,
        risk: 0.3 + levelRisk(w, n) * 0.5, intent: { npc: n.name }, run: (c) => rodLift(c, n),
      });
    }
  }
  return out;
}

// ============================================================================ people

/** Cast at somebody who wants a fight, snag them by the collar, and pull. They arrive already hurt. */
function reelIn(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'fishing');
  const p = clamp(0.38 + 0.01 * lvl - n.level * 0.004, 0.1, 0.9);
  if (rng.chance(p)) {
    train(c, 'fishing', 4);
    const dmg = Math.round(5 + lvl * 0.4 + h.muscle);
    n.hp = Math.max(1, n.hp - dmg);
    n.affinity -= 20;
    c.emit('reel_in', 'good', { variant: 'haul', npc: n.name, amount: dmg });
    fight(c, [n], { cause: `being hooked and reeled across the room by Blackbird`, assault: !n.hostile });
  } else {
    train(c, 'fishing', 1);
    n.affinity -= 8;
    h.hp -= 3;
    c.emit('reel_in', 'bad', { variant: 'snag', npc: n.name });
  }
}

/** The smooth move: a cast across the room, a hook in a jacket sleeve, a girl who arrives where she was always going to. */
function reelGirl(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'fishing');
  const p = clamp(0.3 + 0.008 * lvl + n.affinity / 200 + romanceMod(w, n) - Math.max(0, h.drunk - 3) * 0.08, 0.05, 0.9);
  kindle(h, 0.06);
  train(c, 'fishing', 2);
  if (rng.chance(p)) {
    n.affinity += 22;
    remember(n, 'was reeled in across a room by Blackbird, and let it happen');
    if (here(w).length > 3) h.fame += 1;
    c.emit('reel_girl', 'good', { variant: n.affinity >= 34 ? 'swoon' : 'smooth', npc: n.name });
    bondEvent(c, n, 'flirt');
  } else if (rng.chance(0.35)) {
    n.affinity -= 10;
    h.hp -= 2;
    c.emit('reel_girl', 'bad', { variant: 'slapped', npc: n.name });
  } else {
    n.affinity -= 5;
    c.emit('reel_girl', 'bad', { variant: 'tangle', npc: n.name });
  }
}

/** The legendary technique. A pickpocket with nobody within arm's reach: the wallet leaves on a line. */
function rodLift(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'fishing');
  // A pure fishing check: the stealth system plays no part. Their eyes only make the cast harder.
  const watching = atLeast(bucketOf(w, n), 'alert');
  const p = clamp(0.35 + lvl * 0.005 - n.level * 0.003 - 0.02 * npcPerception(n) - (watching ? 0.15 : 0), 0.1, 0.92);
  train(c, 'fishing', 4);
  if (!rng.chance(p)) {
    awareness(w, n).v = 1;
    n.affinity -= 25;
    remember(n, 'saw a fishing line go into their coat from across the room');
    c.emit('rod_lift', 'bad', { variant: 'noticed', npc: n.name });
    if (rng.chance(0.45)) fight(c, [n], { cause: `getting caught fishing in ${n.name}'s pockets`, assault: true });
    return;
  }
  awareness(w, n).v += 0.04;
  gainXp(c, 6);
  h.fame += 1;
  const items = n.loadout.filter((i) => i.kind !== 'armor' || !h.armor);
  if (items.length && rng.chance(0.6)) {
    const it = rng.pick(items);
    n.loadout.splice(n.loadout.indexOf(it), 1);
    c.emit('rod_lift', 'good', { variant: 'item', npc: n.name, item: it.name });
    acquire(c, it);
  } else if (n.cash > 0) {
    const take = Math.max(1, Math.round(n.cash * (0.5 + rng.next() * 0.5)));
    n.cash -= take;
    h.cash += take;
    c.emit('rod_lift', 'good', { variant: 'cash', npc: n.name, amount: take });
  } else {
    c.emit('rod_lift', 'mixed', { variant: 'nothing', npc: n.name });
  }
}

// ============================================================================ things

function tug(c: Ctx, what: 'tap' | 'vending' | 'dumpster' | 'panel' | 'till'): void {
  const { w, rng } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'fishing');
  train(c, 'fishing', 3);
  const ok = rng.chance(clamp(0.55 + lvl * 0.004, 0.3, 0.92));
  if (what === 'tap') {
    const keeper = ['nyx', 'dutch'].map((id) => w.npcs[id]).find((n) => alive(n) && n!.locationId === h.locationId);
    if (!ok) return void c.emit('rod_tug', 'mixed', { variant: 'tap_miss' });
    h.drunk += 1;
    if (keeper && rng.chance(0.4)) {
      keeper.affinity -= 4;
      c.emit('rod_tug', 'mixed', { variant: 'tap_seen', npc: keeper.name });
    } else {
      c.emit('rod_tug', 'good', { variant: 'tap' });
    }
  } else if (what === 'vending') {
    if (!ok) return void c.emit('rod_tug', 'mixed', { variant: 'vending_miss' });
    if (rng.chance(0.5)) {
      const cash = rng.int(10, 60);
      h.cash += cash;
      c.emit('rod_tug', 'good', { variant: 'vending_coins', amount: cash });
    } else {
      const it = makeItem(rng.pick(['neural_gum', 'protein_tub', 'noodles']));
      c.emit('rod_tug', 'good', { variant: 'vending_snack', item: it.name });
      acquire(c, it);
    }
  } else if (what === 'dumpster') {
    w.features.dumpster!.uses++;
    if (!ok) return void c.emit('rod_tug', 'mixed', { variant: 'dumpster_miss' });
    const it = rng.chance(0.25) ? makeAmmoBox(rng.pick(AMMO_IDS), rng.int(4, 12)) : makeItem(rng.pick(['credchip', 'memory_shard', 'fake_id', 'patch_kit', 'med_pack', 'scrap_metal', 'gold_tooth', 'walkman']));
    c.emit('rod_tug', 'good', { variant: 'dumpster', item: it.name });
    acquire(c, it);
  } else if (what === 'panel') {
    if (!ok) return void c.emit('rod_tug', 'mixed', { variant: 'panel_miss' });
    w.blackoutUntil = w.beat + 18;
    gainXp(c, 3);
    c.emit('rod_tug', 'good', { variant: 'panel' });
  } else {
    const dutch = dutchHere(w);
    if (ok) {
      const take = rng.int(40, 120);
      h.cash += take;
      addHeat(w, 'halo', 1);
      c.emit('rod_tug', 'good', { variant: 'till', amount: take });
    } else {
      c.emit('rod_tug', 'bad', { variant: 'till_caught', npc: dutch?.name ?? 'Dutch' });
      if (dutch) {
        dutch.affinity -= 20;
        remember(dutch, 'caught a fishing line coming out of the till');
        fight(c, [dutch], { cause: 'fishing the till from across the room' });
      }
    }
  }
}

/** A grapple: the line goes up to a balcony, a fire escape, a billboard strut, and Blackbird goes with it. */
function swing(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'fishing');
  train(c, 'fishing', 3);
  if (rng.chance(clamp(0.5 + lvl * 0.006, 0.2, 0.92))) {
    h.fame += 1;
    if (rng.chance(0.6)) {
      const it = makeItem(rng.pick(['credchip', 'gold_tooth', 'memory_shard', 'walkman', 'chrono_watch', 'signet_ring']));
      c.emit('rod_swing', 'good', { variant: 'loot', item: it.name });
      acquire(c, it);
    } else {
      c.emit('rod_swing', 'good', { variant: 'clean' });
    }
  } else {
    h.hp -= 6;
    c.emit('rod_swing', 'bad', { variant: 'swing' });
  }
}

/** Fishing for muggers: twenty neodollars on a hook, left where it will be seen. Something bites. She gets the first hit. */
function bait(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  const cost = Math.min(h.cash, 20);
  h.cash -= cost;
  train(c, 'fishing', 4);
  const [biter] = spawnGroup(c, 'mugger', 1);
  if (!biter) return;
  c.emit('rod_bait', 'mixed', { variant: 'bite', npc: biter.name, amount: cost });
  const result = fight(c, [biter], { cause: 'fishing for muggers', ambush: true, joiners: false });
  if (result === 'win') {
    h.cash += cost;
    c.emit('rod_bait', 'good', { variant: 'landed', npc: biter.name, amount: cost });
  }
}
