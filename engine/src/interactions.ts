import type { Ctx, Npc, World } from './types.js';
import { acquire, addHeat, fight, gainXp, hasInjury, heroPower, here, maybeInjure, remember } from './combat.js';
import { makeItem } from './content/items.js';
import { clamp, levelRisk, revealExit, spawnGroup, dutchHere, type Candidate } from './candidate.js';
import { moveThrough } from './moves.js';
import { featureCandidates } from './features.js';

const DRINKS = [
  'a Molotov Mule', 'a Synthahol Sunrise', 'a Liquid Chrome shooter', 'a Neutron Star Sour', 'three fingers of something blue',
  'a Fall of Saigon-9', 'an Atlas Special (it is mostly regret)', 'a pint of whatever is glowing',
];

const alive = (n: Npc | undefined): n is Npc => !!n && n.alive;
const talkable = (n: Npc): boolean => !n.hostile && !n.tags.includes('boss') && n.archetype !== 'puppy';

/** Everything Blackbird could do right now, from everything in reach. */
export function gather(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = here(w);

  // ------------------------------------------------------------------ people
  for (const n of crowd) {
    if (n.archetype === 'puppy') {
      if (h.companionId !== n.id) {
        out.push({
          key: `pet:${n.id}`, drives: { lust: 0.15, curiosity: 0.35 },
          run: (c) => {
            n.affinity += 10;
            c.emit('pet_puppy', 'good', { npc: n.name });
          },
        });
        out.push({
          key: `steal_puppy:${n.id}`, drives: { greed: 0.4, curiosity: 0.7, pride: 0.3 }, risk: 1.2,
          run: (c) => stealPuppy(c, n),
        });
      }
      continue;
    }
    if (!talkable(n)) continue;

    out.push({ key: `chat:${n.id}`, drives: { curiosity: 0.5, lust: 0.05 }, run: (c) => chat(c, n) });

    if (n.tags.includes('romanceable')) {
      out.push({ key: `flirt:${n.id}`, drives: { lust: 1.0, curiosity: 0.1 }, run: (c) => flirt(c, n) });
      if (n.affinity >= 12 || (h.drunk >= 2 && n.affinity >= 0)) {
        out.push({ key: `kiss:${n.id}`, drives: { lust: 1.5 }, bonus: n.affinity / 80, run: (c) => kiss(c, n) });
      }
    }
    if (!n.tags.includes('robot') && (n.cash > 0 || n.loadout.length)) {
      out.push({
        key: `pickpocket:${n.id}`, drives: { greed: 0.95, curiosity: 0.2 }, risk: 0.6 + levelRisk(w, n),
        run: (c) => pickpocket(c, n),
      });
    }
    out.push({
      key: `challenge:${n.id}`, drives: { bravery: 1.0, pride: 0.8 }, bonus: n.affinity < -10 ? 0.4 : 0,
      risk: 0.4 + levelRisk(w, n) + (n.power > heroPower(w) * 1.5 ? 1 : 0),
      run: (c) => {
        c.emit('challenge', 'mixed', { npc: n.name, role: n.role, variant: String(c.rng.int(1, 4)) });
        fight(c, [n], { cause: `picking a fight with ${n.name}` });
      },
    });
    out.push({
      key: `threaten:${n.id}`, drives: { bravery: 0.5, pride: 0.6, greed: 0.6 }, risk: 0.5 + levelRisk(w, n),
      run: (c) => threaten(c, n),
    });
    if (n.tags.includes('strong')) {
      out.push({ key: `armwrestle:${n.id}`, drives: { pride: 0.9, bravery: 0.2 }, risk: 0.1, run: (c) => armWrestle(c, n) });
    }
    if ((n.tags.includes('augmented') || n.tags.includes('robot')) && !n.flags.includes('hacked')) {
      out.push({
        key: `hack:${n.id}`, drives: { curiosity: 0.75, greed: 0.5 }, risk: 0.3 + levelRisk(w, n) * 0.7,
        run: (c) => hackNpc(c, n),
      });
    }
    if (n.tags.includes('fixer')) {
      if (!w.flags.job_taken) {
        out.push({ key: `ask_work:${n.id}`, drives: { quest: 1.0, greed: 0.3 }, bonus: 0.2, run: (c) => askWork(c, n) });
      }
      if (h.inventory.some((i) => i.kind === 'loot')) {
        out.push({
          key: 'fence', drives: { greed: 1.0 }, bonus: h.inventory.filter((i) => i.kind === 'loot').length * 0.1,
          run: (c) => fence(c, n),
        });
      }
    }
    if (n.tags.includes('doc') && h.cash >= 30 && (h.hp < h.maxHp * 0.85 || h.injuries.length)) {
      out.push({
        key: 'get_patched', drives: { curiosity: 0.15 }, smart: 1.3,
        bonus: (1 - h.hp / h.maxHp) * 2.4 + h.injuries.length * 0.8, run: (c) => getPatched(c, n),
      });
    }
    if (n.tags.includes('dealer') && h.cash >= 25) {
      out.push({ key: 'buy_stims', drives: { curiosity: 0.55, thirst: 0.3, bravery: 0.2 }, risk: 0.2, run: (c) => buyStims(c, n) });
    }
  }

  // ------------------------------------------------------------- the bar itself
  const bartender = ['nyx', 'dutch'].map((id) => w.npcs[id]).find((n) => alive(n) && n!.locationId === loc.id);
  if (bartender && h.cash >= 8) {
    out.push({
      key: 'order_drink', drives: { thirst: 1.0, pride: 0.1 }, bonus: -h.drunk * 0.12, risk: Math.max(0, h.drunk - 2) * 0.3,
      run: (c) => orderDrink(c, bartender),
    });
  }
  if ((loc.kind === 'bar' || loc.kind === 'club') && h.cash >= 30 && crowd.length > 3) {
    out.push({ key: 'buy_round', drives: { thirst: 0.4, pride: 0.7, lust: 0.2 }, risk: 0.2, run: buyRound });
  }
  if (w.brawlUntil > w.beat && loc.id === 'halo_floor') {
    out.push({ key: 'join_brawl', drives: { bravery: 1.1, pride: 0.6 }, bonus: 0.4, risk: 0.9, run: joinBrawl });
  }

  // ------------------------------------------------------------- the dragon
  const dragon = w.npcs.dragon;
  if (loc.id === 'overpass' && alive(dragon)) {
    out.push({
      key: 'challenge_dragon', drives: { quest: 1.5, bravery: 0.6, pride: 0.6 }, bonus: 0.3,
      risk: 3 + clamp(dragon.power / heroPower(w) - 1, 0, 3),
      run: (c) => {
        c.emit('dragon_confront', 'mixed', { npc: dragon.name });
        fight(c, [dragon], { cause: 'the dragon' });
      },
    });
  }

  // ------------------------------------------------------------------ objects
  out.push(...featureCandidates(w));

  // --------------------------------------------------------------- herself
  if (h.hp < h.maxHp * 0.75) {
    out.push({
      key: 'bandage', drives: {}, smart: 1.0, bonus: (1 - h.hp / h.maxHp) * 1.6,
      run: (c) => {
        const heal = Math.round(h.maxHp * 0.22);
        h.hp = Math.min(h.maxHp, h.hp + heal);
        c.emit('bandage', 'good', { heal });
      },
    });
  }
  const medkit = h.inventory.find((i) => i.id === 'medkit');
  if (medkit && (h.hp < h.maxHp * 0.6 || h.injuries.length)) {
    out.push({
      key: 'use_medkit', drives: {}, smart: 1.6, bonus: (1 - h.hp / h.maxHp) * 2 + h.injuries.length * 0.5,
      run: (c) => {
        h.inventory.splice(h.inventory.indexOf(medkit), 1);
        const heal = medkit.power + 20;
        h.hp = Math.min(h.maxHp, h.hp + heal);
        const cured = h.injuries.shift();
        c.emit('use_medkit', 'good', { heal, cured: cured ?? '' });
      },
    });
  }
  if (h.drunk >= 3) {
    out.push({
      key: 'sober_up', drives: {}, smart: 0.9, bonus: 0.1,
      run: (c) => {
        h.drunk = Math.max(0, h.drunk - 3);
        c.emit('sober_up', 'mixed', {});
      },
    });
  }
  const stim = h.inventory.find((i) => i.id === 'stim');
  if (stim) {
    out.push({
      key: 'use_stim', drives: { bravery: 0.4, curiosity: 0.2 }, smart: 0.3,
      run: (c) => {
        h.inventory.splice(h.inventory.indexOf(stim), 1);
        h.buffs.push({ id: 'stim', until: w.beat + 20, power: stim.power });
        c.emit('use_stim', 'good', {});
      },
    });
  }

  // ------------------------------------------------------------------- exits
  for (const e of loc.exits) {
    if (e.hidden) continue;
    if (e.to === 'overpass' && !w.flags.dragon_known) continue;
    const dest = w.locations[e.to]!;
    const toDragon = e.to === 'overpass';
    const dragonRisk = toDragon && alive(dragon) ? clamp(dragon.power / heroPower(w) - 0.6, 0, 4) : 0;
    out.push({
      key: `go:${e.to}`,
      drives: { curiosity: 0.45, ...(toDragon ? { quest: 1.2 } : {}) },
      bonus: (dest.visits === 0 ? 0.35 : 0) + (dest.kind === 'corp' ? 0.1 : 0),
      risk: dragonRisk * 1.4 + (e.gate === 'guarded' ? 0.9 : 0) + (e.gate === 'jump' ? 0.8 : 0),
      run: (c) => moveThrough(c, e),
    });
  }
  return out;
}

// =============================================================== resolvers

function chat(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const options: string[] = [];
  if (!w.flags.dragon_known) options.push('dragon');
  if (w.locations.halo_alley!.exits.some((e) => e.hidden)) options.push('hatch');
  if (w.locations.neon_pharaoh!.exits.some((e) => e.hidden)) options.push('staffdoor');
  const talky = n.tags.includes('rumor');
  if (n.affinity < -10 || rng.chance(0.12)) {
    n.affinity -= 3;
    c.emit('chat', 'bad', { variant: 'snub', npc: n.name });
  } else if (options.length && rng.chance(talky ? 0.8 : 0.3)) {
    const what = rng.pick(options);
    n.affinity += 3;
    if (what === 'dragon') w.flags.dragon_known = true;
    if (what === 'hatch') revealExit(w, 'halo_alley', 'club_maintenance');
    if (what === 'staffdoor') revealExit(w, 'neon_pharaoh', 'club_maintenance');
    c.emit('chat', 'good', { variant: `rumor_${what}`, npc: n.name });
  } else {
    n.affinity += 3;
    c.emit('chat', 'mixed', { variant: 'tall_tale', npc: n.name, role: n.role });
  }
}

function flirt(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.33 + h.charm * 0.05 + n.affinity / 200 + Math.min(h.drunk, 2) * 0.03 - Math.max(0, h.drunk - 3) * 0.08, 0.05, 0.9);
  if (rng.chance(p)) {
    n.affinity += 16;
    remember(n, 'was charmed by Blackbird');
    const number = n.affinity >= 28 && rng.chance(0.4);
    c.emit('flirt', 'good', { variant: number ? 'number' : 'smooth', npc: n.name });
  } else if (rng.chance(0.3)) {
    n.affinity -= 8;
    h.hp -= 2;
    c.emit('flirt', 'bad', { variant: 'slapped', npc: n.name });
  } else {
    n.affinity -= 4;
    c.emit('flirt', 'bad', { variant: 'cringe', npc: n.name });
  }
}

function kiss(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  if (!rng.chance(0.78)) {
    n.affinity -= 6;
    c.emit('kiss', 'bad', { variant: 'rejected', npc: n.name });
    return;
  }
  n.affinity += 20;
  w.flags[`kissed:${n.id}`] = true;
  remember(n, 'kissed Blackbird');
  c.emit('kiss', 'good', { variant: 'kiss', npc: n.name });
  // The Sims rule: somebody saw that.
  const rival = here(w).find(
    (r) => r.id !== n.id && r.tags.includes('romanceable') && !r.hostile && (w.flags[`kissed:${r.id}`] || r.affinity >= 15),
  );
  if (rival) {
    rival.affinity -= 30;
    remember(rival, 'watched Blackbird kiss someone else');
    const fights = rival.tags.includes('jealous') ? 0.9 : 0.4;
    c.emit('jealous', 'bad', { variant: rng.chance(fights) ? 'fight' : 'sulk', npc: rival.name, npc2: n.name });
    if (rng.chance(fights)) fight(c, [rival], { cause: `jealousy over ${n.name}` });
  }
}

function pickpocket(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.38 + h.reflex * 0.04 - n.level * 0.05 - h.drunk * 0.02, 0.08, 0.85);
  if (!rng.chance(p)) {
    n.affinity -= 30;
    remember(n, 'caught Blackbird\'s hand in their pocket');
    c.emit('pickpocket', 'bad', { variant: 'caught', npc: n.name });
    fight(c, [n], { cause: `getting caught robbing ${n.name}` });
    return;
  }
  const items = n.loadout.filter((i) => i.kind !== 'armor' || !h.armor);
  if (items.length && rng.chance(0.55)) {
    const it = rng.pick(items);
    n.loadout.splice(n.loadout.indexOf(it), 1);
    c.emit('pickpocket', 'good', { variant: 'item', npc: n.name, item: it.name, better: it.kind === 'weapon' && it.power > h.weapon.power });
    acquire(c, it);
  } else if (n.cash > 0) {
    const take = Math.max(1, Math.round(n.cash * (0.4 + rng.next() * 0.5)));
    n.cash -= take;
    h.cash += take;
    c.emit('pickpocket', 'good', { variant: 'cash', npc: n.name, amount: take });
  } else {
    c.emit('pickpocket', 'mixed', { variant: 'nothing', npc: n.name });
  }
}

function threaten(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.3 + h.muscle * 0.04 + h.level * 0.03 - n.level * 0.07, 0.05, 0.85);
  if (rng.chance(p)) {
    const take = Math.round(n.cash * 0.8);
    n.cash -= take;
    h.cash += take;
    n.affinity -= 25;
    remember(n, 'was shaken down by Blackbird');
    c.emit('threaten', 'good', { variant: 'cough', npc: n.name, amount: take });
  } else {
    c.emit('threaten', 'bad', { variant: 'laugh', npc: n.name });
    fight(c, [n], { cause: `threatening ${n.name}` });
  }
}

function armWrestle(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.45 + (h.muscle + h.level - n.level * 1.5) * 0.05 - h.drunk * 0.02, 0.05, 0.9);
  if (rng.chance(p)) {
    const prize = rng.int(10, 40);
    h.cash += prize;
    n.affinity += 10;
    gainXp(c, 6);
    c.emit('arm_wrestle', 'good', { variant: 'win', npc: n.name, amount: prize });
  } else {
    const lost = Math.min(h.cash, rng.int(10, 30));
    h.cash -= lost;
    n.affinity += 3;
    c.emit('arm_wrestle', 'bad', { variant: 'lose', npc: n.name, amount: lost });
  }
}

function hackNpc(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  n.flags.push('hacked');
  const p = clamp(0.3 + h.hack * 0.06 - n.level * 0.04, 0.05, 0.85);
  const corp = n.tags.includes('monitored') || n.tags.includes('corp');
  if (!rng.chance(p)) {
    h.hp -= 8;
    if (rng.chance(0.3) && !h.injuries.includes('fried_optics')) {
      h.injuries.push('fried_optics');
      c.emit('injury', 'bad', { injury: 'fried_optics' });
    }
    c.emit('hack', 'bad', { variant: 'backlash', npc: n.name });
    return;
  }
  if (corp) addHeat(w, 'atlas', 2);
  if (n.tags.includes('robot')) {
    const shard = n.loadout.find((i) => i.kind === 'loot');
    if (shard) {
      n.loadout.splice(n.loadout.indexOf(shard), 1);
      acquire(c, shard);
    }
    n.hostile = false;
    gainXp(c, 10 + n.level * 2);
    c.emit('hack', 'good', { variant: 'reboot', npc: n.name });
  } else if (n.cash > 0 && rng.chance(0.6)) {
    const take = Math.round(n.cash * 0.6);
    n.cash -= take;
    h.cash += take;
    c.emit('hack', 'good', { variant: 'siphon', npc: n.name, amount: take, traced: corp });
  } else {
    n.affinity -= 6;
    c.emit('hack', 'mixed', { variant: 'prank', npc: n.name });
  }
}

function askWork(c: Ctx, n: Npc): void {
  const { w } = c;
  w.flags.job_taken = true;
  w.flags.dragon_known = true;
  n.affinity += 5;
  revealExit(w, 'halo_alley', 'club_maintenance');
  revealExit(w, 'neon_pharaoh', 'club_maintenance');
  c.emit('ask_work', 'good', { npc: n.name });
}

function fence(c: Ctx, n: Npc): void {
  const h = c.w.hero;
  const loot = h.inventory.filter((i) => i.kind === 'loot');
  const total = Math.round(loot.reduce((a, i) => a + i.value, 0) * 0.7);
  h.inventory = h.inventory.filter((i) => i.kind !== 'loot');
  h.cash += total;
  n.affinity += 6;
  c.emit('fence', 'good', { npc: n.name, amount: total, count: loot.length });
}

function getPatched(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const cost = Math.min(h.cash, rng.int(30, 60));
  h.cash -= cost;
  if (rng.chance(0.2)) {
    const stats = ['muscle', 'reflex', 'hack', 'charm'] as const;
    const up = rng.pick(stats);
    const down = rng.pick(stats.filter((s) => s !== up));
    h[up] += 2;
    h[down] = Math.max(1, h[down] - 1);
    h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.3));
    c.emit('get_patched', 'mixed', { variant: 'botched', npc: n.name, up, down, cost });
  } else {
    h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.55));
    const cured = h.injuries.shift();
    n.affinity += 4;
    c.emit('get_patched', 'good', { variant: 'fixed', npc: n.name, cost, cured: cured ?? '' });
  }
}

function buyStims(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const cost = Math.min(h.cash, rng.int(25, 40));
  h.cash -= cost;
  if (rng.chance(0.2)) {
    h.hp -= 15;
    h.drunk += 2;
    c.emit('buy_stims', 'bad', { variant: 'overdose', npc: n.name, cost });
  } else {
    h.buffs.push({ id: 'stim', until: w.beat + 25, power: 6 });
    h.reflex += 0;
    c.emit('buy_stims', 'good', { variant: 'boost', npc: n.name, cost });
  }
}

function stealPuppy(c: Ctx, pup: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const dutch = dutchHere(w);
  const p = clamp(0.4 + h.hack * 0.05 + h.charm * 0.03 - (dutch ? 0.15 : 0), 0.1, 0.85);
  if (!rng.chance(p)) {
    h.hp -= 6;
    pup.affinity -= 10;
    c.emit('steal_puppy', 'bad', { variant: 'bitten', npc: pup.name });
    return;
  }
  h.companionId = pup.id;
  pup.faction = null;
  if (dutch) {
    dutch.affinity -= 40;
    remember(dutch, 'Blackbird stole Sprocket');
  }
  w.flags.puppy_stolen = true;
  c.emit('steal_puppy', 'good', { variant: 'success', npc: pup.name, owner: dutch?.name ?? 'Dutch' });
  if (dutch && rng.chance(0.4)) {
    dutch.hostile = true;
    c.emit('steal_puppy', 'bad', { variant: 'noticed', npc: dutch.name });
    fight(c, [dutch], { cause: 'stealing Sprocket' });
  }
}

function orderDrink(c: Ctx, bartender: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const drink = rng.pick(DRINKS);
  const free = bartender.affinity >= 15 && rng.chance(0.5);
  const cost = free ? 0 : Math.min(h.cash, rng.int(8, 22));
  h.cash -= cost;
  h.drunk += 1;
  bartender.affinity += 2;
  c.emit('order_drink', 'mixed', { variant: free ? 'free' : 'paid', drink, cost, npc: bartender.name, drunk: h.drunk });
}

function buyRound(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const cost = Math.min(h.cash, rng.int(30, 70));
  h.cash -= cost;
  h.drunk += 1;
  for (const n of here(w)) if (talkable(n)) n.affinity += 6;
  c.emit('buy_round', 'good', { cost });
}

function joinBrawl(c: Ctx): void {
  const { w } = c;
  const [g1, g2] = w.situation.warringGangs;
  const gangers = here(w).filter((n) => n.tags.includes('ganger') && (n.faction === g1 || n.faction === g2));
  if (!gangers.length) return;
  w.brawlUntil = 0;
  const side = gangers.filter((n) => n.faction === (gangers[0]!.faction));
  const hurt = [...side, ...gangers.filter((n) => !side.includes(n)).slice(0, 1)];
  c.emit('join_brawl', 'mixed', { foes: hurt.map((n) => n.name).join(' and ') });
  fight(c, hurt, { cause: 'jumping into the gang war' });
}

export { spawnGroup, maybeInjure, hasInjury, makeItem };
