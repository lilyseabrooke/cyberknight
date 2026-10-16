import type { Ctx, Feature, Item, World } from './types';
import { acquire, addHeat, fight, gainXp, here, remember } from './combat';
import { makeAmmoBox, makeItem } from './content/items';
import { AMMO_IDS } from './content/ammo';
import { hasAlly } from './companions';
import { kindle } from './romance';
import { isFairGame } from './people';
import { makeCan } from './graffiti';
import { skillLevel, synergy, train } from './skills';
import { ODDS } from './hobbies';
import { clamp, revealExit, spawnGroup, dutchHere, type Candidate } from './candidate';
import { heavyFor } from './shutdown';
import { fameFrom, tipScale } from './stage';
import { moveNpc, renameNpc } from './population';

const present = (w: World, id: string): boolean => !!w.npcs[id]?.alive && w.npcs[id]!.locationId === w.hero.locationId;

export function featureCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  for (const f of Object.values(w.features)) {
    if (f.locationId !== h.locationId) continue;
    const key = f.kind;
    switch (f.kind) {
      case 'till':
        out.push({ key, drives: { greed: 1.2, curiosity: 0.2 }, risk: (dutchHere(w) ? 1.3 : 0.5) + 0.35 * (w.heat.halo ?? 0), intent: {}, run: (c) => robTill(c, f) });
        break;
      case 'karaoke':
        out.push({ key, drives: { pride: 1.0, curiosity: 0.2, thirst: 0.1 }, bonus: h.drunk * 0.1, risk: 0.3, intent: {}, run: karaoke });
        break;
      case 'pool':
        if (h.cash >= 15 && here(w).some((n) => n.tags.includes('rowdy'))) {
          out.push({ key, drives: { pride: 0.8, greed: 0.5, bravery: 0.1 }, risk: 0.4, intent: {}, run: pool });
        }
        break;
      case 'mirror':
        out.push({ key, drives: { pride: 1.2 }, run: mirror });
        break;
      case 'fridge':
        out.push({ key, drives: { curiosity: 0.5, thirst: 0.2 }, bonus: 0.1, risk: present(w, 'bao') ? 0.5 : 0, run: fridge });
        break;
      case 'laser_tag':
        if (h.cash >= 15) out.push({ key, drives: { bravery: 0.5, pride: 0.7, curiosity: 0.3, lust: 0.1 }, bonus: 0.3, run: laserTag });
        break;
      case 'safe':
        out.push({ key, drives: { greed: 1.4, curiosity: 0.3 }, risk: 1.2 + 0.35 * (w.heat.halo ?? 0), run: crackSafe });
        break;
      case 'skyline':
        out.push({ key, drives: { curiosity: 0.6, quest: 0.5, thirst: 0.1 }, bonus: w.flags.dragon_known ? 0 : 0.3, run: skyline });
        break;
      case 'dumpster':
        out.push({ key, drives: { curiosity: 0.85, greed: 0.5 }, bonus: f.uses > 5 ? -0.5 : 0, risk: 0.2, run: (c) => dumpster(c, f) });
        break;
      case 'vending':
        out.push({ key, drives: { curiosity: 0.3, greed: 0.3, bravery: 0.2 }, run: vending });
        break;
      case 'dancefloor':
        out.push({ key, drives: { lust: 0.6, pride: 0.6, thirst: 0.2 }, bonus: 0.2, risk: 0.3, run: dance });
        break;
      case 'fuse_panel':
        out.push({ key, drives: { curiosity: 0.95, bravery: 0.3 }, risk: 0.3, run: fusePanel });
        break;
      case 'crates':
        out.push({ key, drives: { greed: 0.9, curiosity: 0.6 }, risk: 1.0, run: crates });
        break;
      case 'vault':
        if (!w.flags.vault_robbed) {
          out.push({ key, drives: { greed: 1.5, curiosity: 0.9 }, risk: 1.5, run: vault });
        }
        break;
      case 'scrap_pile':
        out.push({ key, drives: { greed: 0.7, curiosity: 0.4 }, bonus: f.uses > 6 ? -0.4 : 0, risk: 0.15, run: (c) => scrapPile(c, f) });
        break;
      case 'relay':
        out.push({ key, drives: { curiosity: 0.6, bravery: 0.5, quest: 0.1 }, risk: 0.6, run: relay });
        break;
      case 'job_board':
        out.push({ key, drives: { greed: 0.55, curiosity: 0.3 }, risk: 0.3, run: jobBoard });
        break;
    }
  }
  return out;
}

function robTill(c: Ctx, f: Feature): void {
  const { w, rng } = c;
  const h = w.hero;
  const dutch = dutchHere(w);
  const p = clamp(0.45 + h.reflex * 0.04 - (dutch ? 0.2 : 0) - (present(w, 'nyx') ? 0.06 : 0), 0.1, 0.85);
  f.uses++;
  if (rng.chance(p)) {
    const take = rng.int(60, 200) >> Math.min(f.uses - 1, 2);
    h.cash += take;
    addHeat(w, 'halo', 2);
    for (const n of here(w)) if (n.faction === 'halo') n.affinity -= 5;
    c.emit('rob_till', 'good', { variant: 'success', amount: take });
  } else {
    c.emit('rob_till', 'bad', { variant: 'caught', npc: dutch?.name ?? 'Dutch' });
    if (dutch) {
      dutch.affinity -= 30;
      remember(dutch, 'caught Blackbird with her hand in the till');
      fight(c, [dutch], { cause: 'robbing the till' });
    }
  }
}

function karaoke(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.25 + h.charm * 0.03 + 0.06 * synergy(h, ['vocals', ['music', 0.5]]) + Math.min(h.drunk, 3) * 0.04 - Math.max(0, h.drunk - 4) * 0.1, 0.1, 0.88);
  train(c, 'vocals', 2);
  const roll = rng.next();
  if (roll < p) {
    const tips = Math.round(rng.int(20, 60) * tipScale(w, 'karaoke'));
    h.cash += tips;
    for (const n of here(w)) if (!n.hostile) n.affinity += 4;
    gainXp(c, 4);
    fameFrom(c, 1, 'karaoke');
    c.emit('karaoke', 'good', { variant: 'ovation', amount: tips, song: rng.pick(['"Chrome Heart"', '"Dial-Up Love"', '"Total Eclipse of the Uplink"', '"Never Gonna Patch You Up"']) });
  } else if (roll < p + (1 - p) * 0.6) {
    h.hp -= 5;
    for (const n of here(w)) if (!n.hostile) n.affinity -= 3;
    c.emit('karaoke', 'bad', { variant: 'boos' });
  } else {
    const heckler = here(w).find((n) => n.tags.includes('rowdy') && !n.hostile);
    c.emit('karaoke', 'bad', { variant: 'brawl', npc: heckler?.name ?? 'a regular' });
    if (heckler) fight(c, [heckler], { cause: 'a karaoke dispute' });
  }
}

function pool(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const rival = rng.pick(here(w).filter((n) => n.tags.includes('rowdy') && !n.hostile));
  // Better players bet bigger.
  const bet = Math.min(h.cash, rng.int(15, 50) + Math.floor(skillLevel(h, 'pool') * 6));
  const p = clamp(ODDS.pool(h) - rival.level * 0.03 - h.drunk * 0.03, 0.08, 0.92);
  if (rng.chance(p)) {
    h.cash += bet;
    rival.cash = Math.max(0, rival.cash - bet);
    rival.affinity -= 5;
    train(c, 'pool', 2);
    c.emit('pool', 'good', { variant: 'win', npc: rival.name, amount: bet });
  } else {
    h.cash -= bet;
    train(c, 'pool', 1);
    c.emit('pool', 'bad', { variant: 'lose', npc: rival.name, amount: bet });
    if (rng.chance(0.3)) {
      c.emit('pool', 'bad', { variant: 'accuse', npc: rival.name });
      fight(c, [rival], { cause: 'accusing someone of hustling at pool', assault: true });
    }
  }
}

function mirror(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  if (rng.chance(0.82)) {
    h.buffs = h.buffs.filter((b) => b.id !== 'swagger');
    h.buffs.push({ id: 'swagger', until: w.beat + 18, power: 3 });
    c.emit('mirror', 'good', { variant: 'swagger' });
  } else {
    h.hp -= 4;
    c.emit('mirror', 'bad', { variant: 'punch' });
  }
}

function fridge(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const bao = w.npcs.bao;
  if (present(w, 'bao') && rng.chance(0.4) && bao) {
    bao.affinity -= 12;
    c.emit('fridge', 'bad', { variant: 'caught', npc: bao.name });
    fight(c, [bao], { cause: 'raiding the walk-in fridge', joiners: false });
  } else if (rng.chance(0.18)) {
    h.hp -= 10;
    c.emit('fridge', 'bad', { variant: 'poison' });
  } else {
    h.drunk = Math.max(0, h.drunk - 1);
    c.emit('fridge', 'good', { variant: 'snack' });
  }
}

function laserTag(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  h.cash -= 15;
  const p = clamp(0.3 + h.reflex * 0.03 + 0.06 * synergy(h, ['marksmanship', ['stat:reflex', 0.5]]) - h.drunk * 0.04, 0.1, 0.9);
  train(c, 'marksmanship', 2);
  if (rng.chance(p)) {
    const prize = rng.int(15, 45);
    h.cash += prize;
    gainXp(c, 9);
    w.counters.league = (w.counters.league ?? 0) + 1;
    if (w.counters.league === 3) {
      h.fame += 3;
      acquire(c, makeItem('champ_vest'));
      c.emit('laser_tag', 'good', { variant: 'champion', amount: prize });
    } else {
      c.emit('laser_tag', 'good', { variant: 'win', amount: prize, wins: w.counters.league });
    }
  } else if (rng.chance(0.25)) {
    c.emit('laser_tag', 'bad', { variant: 'cheat' });
    h.locationId = 'halo_arcade';
    for (const n of here(w)) if (n.faction === 'halo') n.affinity -= 4;
  } else {
    gainXp(c, 3);
    c.emit('laser_tag', 'bad', { variant: 'lose' });
  }
}

function crackSafe(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.15 + h.hack * 0.04 + 0.05 * synergy(h, ['lockpicking', ['tinkering', 0.5], ['stat:reflex', 0.5]]), 0.05, 0.85);
  train(c, 'lockpicking', 2);
  if (rng.chance(p)) {
    const take = rng.int(200, 450);
    h.cash += take;
    addHeat(w, 'halo', 3);
    const prize = makeItem(rng.pick(['memory_shard', 'zip_pistol', 'stunner_mk3', 'kevlar_duster']));
    c.emit('safe', 'good', { variant: 'success', amount: take, item: prize.name });
    acquire(c, prize);
  } else {
    addHeat(w, 'halo', 3);
    c.emit('safe', 'bad', { variant: 'alarm' });
    const heavy = heavyFor(w, 'halo_floor');
    if (heavy) {
      moveNpc(w, heavy, h.locationId);
      fight(c, [heavy], { cause: 'cracking the Halo safe' });
    }
  }
}

function skyline(c: Ctx): void {
  const { w, rng } = c;
  if (!w.flags.dragon_known || rng.chance(0.15)) {
    w.flags.dragon_known = true;
    c.emit('skyline', 'mixed', { variant: 'dragon' });
  } else if (w.hero.drunk >= 2 && rng.chance(0.2)) {
    w.hero.hp -= 6;
    c.emit('skyline', 'bad', { variant: 'wobble' });
  } else {
    c.emit('skyline', 'good', { variant: 'vista' });
  }
}

function dumpster(c: Ctx, f: Feature): void {
  const { w, rng } = c;
  const h = w.hero;
  f.uses++;
  const sniff = hasAlly(w, 'sniff') ? 0.08 : 0;
  const roll = rng.next();
  const find = (what: string | Item, variant: string) => {
    const it = typeof what === 'string' ? makeItem(what) : what;
    c.emit('dumpster', 'good', { variant, item: it.name, sniff: sniff > 0 });
    acquire(c, it);
  };
  if (roll < 0.1 + sniff) find(rng.pick(['credchip', 'memory_shard', 'fake_id', 'patch_kit', 'med_pack']), 'loot');
  else if (roll < 0.17 + sniff) find(rng.pick(['pool_cue', 'switchblade', 'zip_pistol', 'kevlar_duster', 'leather_jacket']), 'gear');
  else if (roll < 0.4) find(rng.chance(0.3) ? makeAmmoBox(rng.pick(AMMO_IDS), rng.int(4, 10)) : makeItem(rng.pick(['eyeballs', 'mom_photo', 'neural_gum', 'gold_tooth', 'walkman'])), 'junk');
  else if (roll < 0.55) {
    c.emit('dumpster', 'bad', { variant: 'rats' });
    const [rats] = spawnGroup(c, 'mugger', 1);
    if (rats) {
      renameNpc(c.w, rats, 'The Cyber-Rat Swarm');
      rats.role = 'swarm';
      rats.tags = ['robot'];
      rats.level = 1;
      rats.power = 7;
      rats.hp = rats.maxHp = 30;
      rats.loadout = [];
      rats.cash = 0;
      fight(c, [rats], { cause: 'a dumpster full of rats' });
    }
  } else if (roll < 0.65 && revealExit(w, 'halo_alley', 'club_maintenance')) {
    c.emit('dumpster', 'good', { variant: 'hatch' });
  } else if (roll < 0.72) {
    h.inventory.push(makeItem('med_pack'));
    c.emit('dumpster', 'good', { variant: 'vagrant' });
  } else if (roll < 0.84) {
    makeCan(h, 1);
    c.emit('dumpster', 'good', { variant: 'paint' });
  } else {
    c.emit('dumpster', 'mixed', { variant: 'nothing' });
  }
}

function vending(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const roll = rng.next();
  if (roll < 0.4) {
    c.emit('vending', 'good', { variant: 'snack' });
  } else if (roll < 0.6) {
    const cash = rng.int(10, 60);
    h.cash += cash;
    c.emit('vending', 'good', { variant: 'jackpot', amount: cash });
  } else if (roll < 0.85) {
    h.hp -= 7;
    c.emit('vending', 'bad', { variant: 'zap' });
  } else {
    addHeat(w, 'npd', 1);
    c.emit('vending', 'bad', { variant: 'alarm' });
  }
}

function dance(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const dancers = here(w).filter((n) => n.archetype === 'dancer' || isFairGame(n));
  if (dancers.length) kindle(h, 0.02);
  const p = clamp(0.3 + h.charm * 0.025 + 0.06 * synergy(h, ['dancing', ['stat:charm', 0.5]]) + Math.min(h.drunk, 2) * 0.03, 0.15, 0.88);
  train(c, 'dancing', 2);
  if (rng.chance(p)) {
    for (const d of dancers) d.affinity += 10;
    gainXp(c, 5);
    h.fame += 1;
    c.emit('dance', 'good', { variant: 'wow', npc: dancers[0]?.name ?? 'the crowd' });
  } else {
    const guard = here(w).find((n) => n.tags.includes('security'));
    c.emit('dance', 'bad', { variant: 'trip', npc: guard?.name ?? 'a bouncer' });
    if (guard && rng.chance(0.4)) {
      guard.affinity -= 15;
      fight(c, [guard], { cause: 'wiping out on the dance floor' });
    }
  }
}

function fusePanel(c: Ctx): void {
  const { w, rng } = c;
  const roll = rng.next();
  if (roll < 0.45) {
    w.blackoutUntil = w.beat + 18;
    addHeat(w, 'club', 1);
    c.emit('fuse_panel', 'mixed', { variant: 'blackout' });
  } else if (roll < 0.8) {
    w.hero.hp -= 10;
    c.emit('fuse_panel', 'bad', { variant: 'zap' });
  } else {
    c.emit('fuse_panel', 'good', { variant: 'map' });
    gainXp(c, 6);
  }
}

function crates(c: Ctx): void {
  const { w, rng } = c;
  if (rng.chance(0.55)) {
    const it = makeItem(rng.pick(['helix_sample', 'memory_shard', 'corp_creds', 'med_pack', 'corp_plate']));
    c.emit('crates', 'good', { variant: 'loot', item: it.name });
    acquire(c, it);
  } else {
    addHeat(w, 'atlas', 1);
    const guards = here(w).filter((n) => n.tags.includes('security'));
    c.emit('crates', 'bad', { variant: 'alarm' });
    if (guards.length) fight(c, guards.slice(0, 2), { cause: 'rummaging through Helix cargo', joiners: false });
  }
}

function scrapPile(c: Ctx, f: Feature): void {
  const { w, rng } = c;
  const h = w.hero;
  f.uses++;
  train(c, 'scavenging', 2);
  // A sharper eye for scrap shifts the odds away from the bad/nothing outcomes and towards finds.
  const boost = Math.min(0.18, skillLevel(h, 'scavenging') * 0.025);
  const roll = clamp(rng.next() - boost, 0, 0.999);
  if (roll < 0.1) {
    h.hp -= 5;
    c.emit('scrap_pile', 'bad', { variant: 'cut' });
  } else if (roll < 0.2) {
    const it = makeItem('drone_core');
    c.emit('scrap_pile', 'good', { variant: 'rare', item: it.name });
    acquire(c, it);
  } else if (roll < 0.55) {
    const cash = Math.max(2, rng.int(5, 20) >> Math.min(f.uses - 1, 2));
    h.cash += cash;
    c.emit('scrap_pile', 'good', { variant: 'junk', amount: cash });
  } else if (roll < 0.8) {
    const it = makeItem(rng.pick(['scrap_metal', 'credchip', 'gold_tooth', 'neural_gum', 'walkman']));
    c.emit('scrap_pile', 'good', { variant: 'find', item: it.name });
    acquire(c, it);
  } else {
    c.emit('scrap_pile', 'mixed', { variant: 'nothing' });
  }
}

function relay(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.3 + h.hack * 0.05 + skillLevel(h, 'tinkering') * 0.05, 0.1, 0.85);
  if (rng.chance(p)) {
    const drop = rng.int(1, 3);
    w.heat.atlas = Math.max(0, (w.heat.atlas ?? 0) - drop);
    train(c, 'tinkering', 3);
    gainXp(c, 8);
    const bonus = rng.chance(0.3) ? makeItem('drone_core') : null;
    if (bonus) acquire(c, bonus);
    c.emit('relay', 'good', { variant: 'sabotage', drop, item: bonus?.name ?? '' });
  } else {
    addHeat(w, 'atlas', 2);
    c.emit('relay', 'bad', { variant: 'alarm' });
    const [bot] = spawnGroup(c, 'scrapper', 1);
    if (bot) fight(c, [bot], { cause: 'getting caught sabotaging an Atlas relay', joiners: false });
  }
}

const GIGS = ['flyers', 'skiptrace', 'rumor_job', 'pest_control'] as const;

function jobBoard(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const gig = rng.pick(GIGS);
  const lvl = skillLevel(h, 'hustling');
  train(c, 'hustling', 1);
  if (gig === 'flyers') {
    const pay = rng.int(10, 25) + lvl;
    h.cash += pay;
    c.emit('job_board', 'good', { variant: 'flyers', amount: pay });
  } else if (gig === 'rumor_job') {
    train(c, 'streetwise', 2);
    const pay = rng.int(15, 40) + lvl;
    h.cash += pay;
    c.emit('job_board', 'good', { variant: 'rumor_job', amount: pay });
  } else if (gig === 'skiptrace') {
    const p = clamp(0.45 + h.muscle * 0.03 + skillLevel(h, 'intimidation') * 0.04 + lvl * 0.02, 0.1, 0.85);
    if (rng.chance(p)) {
      const pay = rng.int(50, 140);
      h.cash += pay;
      gainXp(c, 10);
      c.emit('job_board', 'good', { variant: 'skiptrace', amount: pay });
    } else {
      const [mark] = spawnGroup(c, 'mugger', 1);
      c.emit('job_board', 'bad', { variant: 'skiptrace_fail' });
      if (mark) fight(c, [mark], { cause: 'chasing down a skip for a flyer job' });
    }
  } else {
    const p = clamp(0.5 + skillLevel(h, 'athletics') * 0.03 + lvl * 0.02, 0.15, 0.85);
    if (rng.chance(p)) {
      const pay = rng.int(20, 50);
      h.cash += pay;
      train(c, 'athletics', 1);
      c.emit('job_board', 'good', { variant: 'pest_control', amount: pay });
    } else {
      h.hp -= 6;
      c.emit('job_board', 'bad', { variant: 'pest_control_fail' });
    }
  }
}

function vault(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const hasCreds = h.inventory.some((i) => i.id === 'corp_creds');
  const p = clamp(0.2 + h.hack * 0.07 + (hasCreds ? 0.3 : 0), 0.1, 0.85);
  addHeat(w, 'atlas', 3);
  if (rng.chance(p)) {
    w.flags.vault_robbed = true;
    addHeat(w, 'atlas', 4);
    addHeat(w, 'npd', 3);
    const dev = makeItem('hiccup');
    c.emit('vault', 'good', { variant: 'success', item: dev.name, creds: hasCreds });
    acquire(c, dev);
  } else {
    c.emit('vault', 'bad', { variant: 'alarm' });
    const guards = here(w).filter((n) => n.tags.includes('security'));
    if (guards.length) fight(c, guards.slice(0, 3), { cause: 'cracking the Helix vault', joiners: false });
  }
}
