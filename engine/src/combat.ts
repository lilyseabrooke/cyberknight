import type { Ctx, Hero, Injury, Item, Npc, World } from './types';
import { IMPLANTS } from './content/implants';
import { AMMO } from './content/ammo';
import { KINDS, removeCompanion } from './companions';
import { hasImplantFlag, skillLevel, skillValue, train } from './skills';
import { addAmmo, spendAmmo, wielded } from './arms';
import { foeArmor, fxOf, rating, vsMult } from './weapons';
import { witnessAssault } from './witness';
import { collectBounties } from './bounty';

export const npcsAt = (w: World, loc: string): Npc[] => Object.values(w.npcs).filter((n) => n.alive && n.locationId === loc && n.downUntil <= w.beat);

export const here = (w: World): Npc[] => npcsAt(w, w.hero.locationId);

export const weaponStyle = (tags: string[]): 'marksmanship' | 'melee' | null => (tags.includes('gun') ? 'marksmanship' : tags.includes('melee') ? 'melee' : null);

/** Thrown-item damage: mostly her regular stats; a cue also gets her pool skill. Cocktails burn. */
export function throwDamage(w: World, item: Item): number {
  const h = w.hero;
  const cue = item.tags.includes('cue') ? skillValue(h, 'pool') * 1.5 : 0;
  return Math.round(h.muscle + h.level * 1.5 + skillValue(h, 'throwing') * 2 + cue + item.power);
}

/** Move the hero. Scrambling through a hidden door reveals it, in both directions. */
export function relocate(w: World, to: string): void {
  const h = w.hero;
  const from = h.locationId;
  h.previousLocationId = from;
  h.locationId = to;
  const dest = w.locations[to];
  if (dest) dest.visits++;
  for (const e of w.locations[from]?.exits ?? []) if (e.to === to) e.hidden = false;
  for (const e of dest?.exits ?? []) if (e.to === from) e.hidden = false;
}

const loadedFor = (h: Hero, it: Item): boolean => !it.ammoType || (h.ammo[it.ammoType] ?? 0) > 0;

export const hasInjury = (w: World, i: Injury): boolean => w.hero.injuries.includes(i);

export function addHeat(w: World, faction: string | null, n: number): void {
  if (!faction) return;
  w.heat[faction] = Math.min(10, (w.heat[faction] ?? 0) + n);
}

export function remember(npc: Npc, what: string): void {
  npc.memories.push(what);
  if (npc.memories.length > 12) npc.memories.shift();
}

export function heroPower(w: World, weapon: Item = wielded(w.hero)): number {
  const h = w.hero;
  let p = h.level * 2 + h.muscle + weapon.power;
  const style = weaponStyle(weapon.tags);
  if (style) p += skillValue(h, style) * 0.6;
  for (const b of h.buffs) if (b.until > w.beat) p += b.power;
  for (const a of h.companions) if (a.hp > 0) p += a.power;
  for (const i of h.implants) p += IMPLANTS[i]?.power ?? 0;
  if (w.situation.weather === 'heatwave' && w.locations[h.locationId]?.outdoors) p -= 2;
  p -= Math.max(0, h.drunk - skillLevel(h, 'tolerance') * 0.4) * 1.2;
  let mult = 1;
  if (hasInjury(w, 'broken_leg')) mult *= 0.75;
  if (hasInjury(w, 'cracked_ribs')) mult *= 0.85;
  if (hasInjury(w, 'concussion')) mult *= 0.85;
  if (hasInjury(w, 'fried_optics')) mult *= 0.9;
  return Math.max(1, p * mult);
}

/** Equip an item if it's better; otherwise stash it. Emits an `equip` event. */
export function acquire(c: Ctx, item: Item): void {
  const h = c.w.hero;
  // Ammo goes straight into the pool; the box itself is just cardboard.
  if (item.rounds && item.ammoType) {
    addAmmo(h, item.ammoType, item.rounds);
    return;
  }
  if ((item.kind === 'weapon' || item.kind === 'gadget') && rating(item) > rating(h.weapon) * 1.03) {
    const old = h.weapon;
    h.weapon = item;
    h.inventory.push(old); // keep the old one: when the good gun runs dry, the tire iron still works
    c.emit('equip', 'good', { item: item.name, old: old.name, slot: 'weapon', unstable: !!item.unstable });
  } else if (item.kind === 'armor' && item.power > (h.armor?.power ?? 0)) {
    const old = h.armor;
    h.armor = item;
    if (old) h.inventory.push(old);
    c.emit('equip', 'good', { item: item.name, old: old?.name ?? 'nothing', slot: 'armor', unstable: false });
  } else {
    h.inventory.push(item);
  }
}

export function gainXp(c: Ctx, amount: number): void {
  const h = c.w.hero;
  h.xp += Math.round(amount);
  while (h.xp >= 24 * h.level) {
    h.xp -= 24 * h.level;
    h.level++;
    h.maxHp += 12; // a bigger tank, not a refill: healing costs a med pack or a street doc
    const stat = (['muscle', 'reflex', 'charm', 'hack'] as const)[h.level % 4]!;
    h[stat]++;
    c.w.stats.maxLevel = Math.max(c.w.stats.maxLevel, h.level);
    c.emit('level_up', 'good', { level: h.level, stat });
  }
}

export function isLethal(foes: Npc[], w: World): boolean {
  if (foes.length && foes.every((f) => f.tags.includes('nonlethal'))) return false;
  if (foes.some((f) => f.tags.some((t) => ['robot', 'cop', 'corp', 'boss'].includes(t)) && !f.tags.includes('nonlethal'))) return true;
  const kind = w.locations[w.hero.locationId]?.kind;
  return !(kind === 'bar' || kind === 'club' || kind === 'shop' || kind === 'home');
}

export function maybeInjure(c: Ctx, hit: number, chance = 0.4): void {
  const h = c.w.hero;
  if (hit < h.maxHp * 0.18 || !c.rng.chance(chance)) return;
  const options = (['broken_leg', 'cracked_ribs', 'fried_optics', 'concussion'] as const).filter((i) => !h.injuries.includes(i));
  if (!options.length) return;
  const injury = c.rng.pick(options);
  h.injuries.push(injury);
  c.emit('injury', 'bad', { injury });
}

export function kill(c: Ctx, w: World, npc: Npc, by: string): void {
  npc.alive = false;
  npc.hp = 0;
  w.stats.kills++;
  for (const other of npcsAt(w, npc.locationId)) {
    if (other.faction && other.faction === npc.faction) {
      other.affinity -= 25;
      remember(other, `saw Blackbird kill ${npc.name}`);
    } else if (other.id !== npc.id) {
      other.affinity -= 3;
    }
  }
  if (npc.tags.includes('cop')) addHeat(w, 'npd', 4);
  if (npc.tags.includes('corp')) addHeat(w, 'atlas', 2);
  if (npc.faction === 'halo') addHeat(w, 'halo', 3);
  if (npc.faction === 'club') addHeat(w, 'club', 2);
  if (npc.tags.includes('monitored')) {
    addHeat(w, 'atlas', 3);
    addHeat(w, 'npd', 1);
    c.emit('monitored_death', 'bad', { npc: npc.name, groups: c.rng.int(3, 9), by });
  }
}

export type FightResult = 'win' | 'flee' | 'tossed' | 'arrested' | 'dead';

export interface FightOpts {
  cause: string;
  joiners?: boolean;
  /** She started this one, on people who weren't already trying to hurt her. Anyone who sees it will have opinions. */
  assault?: boolean;
}

/** The big one. Multi-round, multi-foe, with joiners, injuries, loot and aftermath. */
export function fight(c: Ctx, foesIn: Npc[], o: FightOpts): FightResult {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const foes = foesIn.filter((f) => f.alive);
  if (!foes.length) return 'win';
  w.stats.fights++;

  if (o.joiners !== false && loc.crowded) {
    const joined: Npc[] = [];
    for (const n of npcsAt(w, loc.id)) {
      if (foes.includes(n) || h.companions.some((a) => a.npcId === n.id) || joined.length >= 3) continue;
      const p = n.tags.includes('owner') ? 0.5 : n.tags.includes('rowdy') && n.affinity < 25 ? 0.22 : 0;
      if (p && rng.chance(p)) joined.push(n);
    }
    if (joined.length) {
      foes.push(...joined);
      for (const j of joined) if (j.tags.includes('cop')) addHeat(w, 'npd', 1);
      c.emit('brawl_joins', 'bad', { npcs: joined.map((j) => j.name).join(' and '), count: joined.length });
    }
  }
  // Hitting people in front of people (or cameras) has consequences.
  let seen = false;
  let heatFaction = 'npd';
  let warranted = false;
  if (o.assault) {
    const wit = witnessAssault(c, foes, { noise: fxOf(wielded(h, foes)).noise });
    seen = wit.seen;
    heatFaction = wit.heatFaction;
    warranted = wit.warranted;
    foes.push(...wit.joiners);
  }
  for (const f of foes) f.hostile = true;
  const lethal = isLethal(foes, w);
  const startHp = h.hp;
  const names = foes.map((f) => f.name).join(', ');
  c.emit('fight_start', 'mixed', {
    foes: names,
    count: foes.length,
    cause: o.cause,
    foe: foes[0]!.name,
    foeRole: foes[0]!.role,
    weapon: wielded(h).name,
    boss: foes.some((f) => f.tags.includes('boss')),
    dragon: foes.find((f) => f.tags.includes('dragon'))?.archetype ?? '',
    hpPct: Math.round((h.hp / h.maxHp) * 100),
    power: Math.round(heroPower(w)),
    level: h.level,
  });

  let rounds = 0;
  let result: FightResult | null = null;
  let backfires = 0;
  let crits = 0;
  let assists = 0;
  let ammoSpent = 0;
  let wield = wielded(h, foes);
  let lastWield = h.weapon.id;
  const stunned = new Set<string>();
  const burning = new Map<string, number>();
  const procs = new Set<string>();
  const proc = (kind: string, foe: Npc) => {
    if (procs.has(kind)) return;
    procs.add(kind);
    c.emit('weapon_proc', 'good', { variant: kind, weapon: wield.name, foe: foe.name });
  };
  const fleeAt = 0.1 + h.competence * 0.35;
  const armor = h.armor?.power ?? 0;

  const down = new Set<string>();
  const standing = () => foes.filter((f) => f.alive && !down.has(f.id));
  const hit = (target: Npc, dmg: number) => {
    target.hp -= dmg;
    if (target.hp <= 0 && target.alive && !down.has(target.id)) {
      if (lethal) kill(c, w, target, h.weapon.name);
      else down.add(target.id);
    }
  };
  // She might lob something first. Cues, bottles, knives, and cocktails.
  const throwables = h.inventory.filter((i) => i.tags.includes('throwable'));
  if (throwables.length && rng.chance(0.3 + (h.personality.weights.pride - 0.5) * 0.3 + skillValue(h, 'throwing') * 0.03)) {
    const item = throwables.find((i) => i.tags.includes('fire')) ?? throwables.find((i) => i.id === 'switchblade') ?? throwables.find((i) => i.tags.includes('cue')) ?? throwables[0]!;
    h.inventory.splice(h.inventory.indexOf(item), 1);
    const dmg = Math.round(throwDamage(w, item) * (0.8 + rng.next() * 0.6));
    const target = standing()[0]!;
    hit(target, dmg);
    if (item.tags.includes('fire')) for (const f of standing()) hit(f, Math.round(dmg * 0.4));
    train(c, 'throwing', 2);
    if (item.tags.includes('cue')) train(c, 'pool', 1);
    c.emit('throw', 'good', { variant: item.id, foe: target.name, dmg, cop: target.tags.includes('cop'), skilled: item.tags.includes('cue') && skillLevel(h, 'pool') >= 3 });
  }
  const maxRounds = foes.some((f) => f.tags.includes("boss")) ? 26 : 14;
  while (!result && rounds < maxRounds) {
    rounds++;
    const living = standing();
    if (!living.length) {
      result = 'win';
      break;
    }
    // hero strikes, with whatever still works
    wield = wielded(h, living);
    if (wield.id !== lastWield) {
      if (!loadedFor(h, h.weapon)) c.emit('out_of_ammo', 'bad', { weapon: h.weapon.name, ammo: AMMO[h.weapon.ammoType ?? '']?.label ?? 'ammo', fallback: wield.name, bare: wield.id === 'fists' });
      else if (wield.id !== h.weapon.id) c.emit('weapon_swap', 'mixed', { weapon: wield.name, old: lastWield === 'fists' ? 'bare fists' : h.weapon.name, foe: living[0]!.name });
      lastWield = wield.id;
    }
    const fx = fxOf(wield);
    ammoSpent += spendAmmo(h, wield);
    let dmg = Math.round(heroPower(w, wield) * (0.45 + rng.next() * 0.6));
    if (wield.unstable) {
      if (rng.chance(0.22)) {
        const back = Math.round(h.maxHp * (0.08 + rng.next() * 0.1));
        h.hp -= back;
        backfires++;
        dmg = Math.round(dmg * 0.4);
      } else if (rng.chance(0.3)) {
        dmg *= 2;
        crits++;
      }
    }
    const target = living[0]!;
    // What the weapon does besides hit: edge against this sort of enemy, crits, and plating it gets through.
    dmg = Math.round(dmg * vsMult(fx, target));
    if (rng.chance(fx.crit)) {
      dmg = Math.round(dmg * fx.critMult);
      proc('crit', target);
    }
    dmg = Math.max(1, dmg - Math.round(Math.max(0, foeArmor(target) * 0.5 - fx.pierce)));
    // Allies pitch in: bites, zaps, bricks, pigeon-based interference.
    let absorb = 0;
    for (const a of h.companions) {
      if (a.hp <= 0 || assists >= 3 || !rng.chance(0.4)) continue;
      const spec = KINDS[a.kind]!.assist;
      assists++;
      if (spec.dmg) dmg += spec.dmg;
      if (spec.absorb) absorb += spec.absorb;
      if (a.abilities.includes('guard')) absorb += 4;
      if (spec.disable) living.forEach((f) => !f.flags.includes('disabled') && f.flags.push('disabled'));
      if (assists === 1) c.emit('ally_assist', 'good', { name: a.name, kind: a.kind, dmg: spec.dmg ?? 0, absorb: spec.absorb ?? 0, foe: target.name });
    }
    hit(target, dmg); // non-lethal fights knock people out; they remember
    if (target.alive && !down.has(target.id)) {
      if (rng.chance(fx.stun)) {
        stunned.add(target.id);
        proc('stun', target);
      }
      if (rng.chance(fx.burn)) {
        burning.set(target.id, 3);
        proc('burn', target);
      }
    }
    for (const [id, left] of [...burning]) {
      const f = foes.find((x) => x.id === id)!;
      if (left <= 0 || !f.alive || down.has(id)) burning.delete(id);
      else {
        hit(f, Math.max(2, Math.round(heroPower(w, wield) * 0.15)));
        burning.set(id, left - 1);
      }
    }
    // foes strike
    let taken = 0;
    let biggest = 0;
    for (const f of standing()) {
      if (stunned.delete(f.id)) continue; // reeling
      if (!f.tags.includes('hera') && !rng.chance(0.8)) continue; // Hera does not miss
      let fp = f.power - (f.flags.includes('disabled') ? 3 : 0);
      if (f.tags.includes('apollo') && w.flags.dragon_weak) fp *= 0.65;
      const d = Math.max(1, Math.round(fp * (0.2 + rng.next() * 0.4)) - armor - fx.armor);
      taken += d;
      biggest = Math.max(biggest, d);
    }
    taken = Math.max(0, taken - absorb);
    h.hp -= taken;
    maybeInjure(c, biggest);

    if (!standing().length) {
      result = 'win';
    } else if (h.hp <= 0 && lethal) {
      if (hasImplantFlag(h, 'defib') && !w.flags.defib_used) {
        w.flags.defib_used = true;
        h.hp = Math.round(h.maxHp * 0.3);
        c.emit('defib', 'mixed', {});
        result = 'flee';
      } else {
        result = foes.some((f) => f.tags.includes('cop')) && rng.chance(0.55) ? 'arrested' : 'dead';
      }
    } else if (!lethal && h.hp < h.maxHp * 0.2) {
      result = 'tossed';
    } else if (rounds >= 2 && h.hp / h.maxHp < fleeAt && !hasInjury(w, 'broken_leg') && rng.chance(0.55 + h.reflex * 0.03 + skillValue(h, 'athletics') * 0.02)) {
      result = 'flee';
    }
  }
  result ??= 'flee';

  const survivors = standing();
  const killed = foes.filter((f) => !f.alive || down.has(f.id));
  const base = {
    foes: names,
    count: foes.length,
    killed: killed.length,
    rounds,
    taken: Math.max(0, startHp - h.hp),
    weapon: wield.name,
    ammoSpent,
    backfires,
    crits,
    allies: h.companions.filter((a) => a.hp > 0).map((a) => a.name).join(' and '),
    allyKind: h.companions.find((a) => a.hp > 0)?.kind ?? '',
    boss: foes.some((f) => f.tags.includes('boss')),
    dragon: foes.find((f) => f.tags.includes('dragon'))?.archetype ?? '',
    killer: survivors[0]?.name ?? '',
    place: loc.name,
  };

  if (result === 'win') {
    let xp = 0;
    let cash = 0;
    const found: string[] = [];
    for (const f of foes) {
      const defeats = f.memories.filter((m) => m === 'was beaten by Blackbird').length;
      const over = Math.max(0, h.level - f.level);
      xp += ((f.level * 10) / (1 + defeats)) * Math.max(0.1, 1 - over * 0.15);
      cash += f.cash;
      f.cash = 0;
      if (f.alive) {
        // non-lethal: knocked out, not dead. They'll remember.
        f.hp = Math.max(1, Math.round(f.maxHp * 0.5));
        f.hostile = false;
        f.downUntil = w.beat + 22 + rng.int(0, 15);
        f.affinity -= 40;
        remember(f, 'was beaten by Blackbird');
      } else {
        for (const it of f.loadout.splice(0)) {
          acquire(c, it);
          found.push(it.name);
        }
      }
    }
    h.cash += cash;
    collectBounties(c, foes);
    h.hp = Math.max(h.hp, 1);
    c.emit('fight_end', 'good', { ...base, variant: 'win', cash, xp: Math.round(xp), loot: found.slice(0, 3).join(', ') });
    gainXp(c, xp);
    if (foes.some((f) => f.archetype === 'apollo')) {
      w.over = true;
      w.ending = 'victory';
      c.emit('victory', 'good', {});
    }
  } else if (result === 'flee') {
    for (const f of foes) f.hostile = false;
    relocate(w, loc.fleeTo);
    c.emit('fight_end', 'mixed', { ...base, variant: 'flee', to: w.locations[loc.fleeTo]!.name });
    if (foes.some((f) => f.tags.includes('security')) && lethal) addHeat(w, foes[0]!.faction, 1);
  } else if (result === 'tossed') {
    for (const f of foes) f.hostile = false;
    h.hp = Math.max(h.hp, Math.round(h.maxHp * 0.1));
    relocate(w, loc.tossTo);
    c.emit('fight_end', 'bad', { ...base, variant: 'tossed', to: w.locations[loc.tossTo]!.name });
  } else if (result === 'arrested') {
    for (const f of foes) f.hostile = false;
    h.hp = Math.max(h.hp, 10);
    const fine = Math.round(h.cash * 0.6);
    h.cash -= fine;
    relocate(w, 'street_main');
    w.heat.npd = Math.max(0, (w.heat.npd ?? 0) - 3);
    c.emit('fight_end', 'bad', { ...base, variant: 'arrested', fine });
  } else {
    w.over = true;
    w.ending = 'dead';
    c.emit('fight_end', 'bad', { ...base, variant: 'dead' });
    c.emit('death', 'bad', { killer: survivors[0]?.name ?? 'something', place: loc.name, cause: o.cause, level: h.level });
  }

  // Bodies on the floor in front of witnesses turn assault into something the police take personally.
  if (seen && !warranted && !w.over) {
    const bodies = foes.filter((f) => !f.alive).length;
    if (bodies) {
      const gain = Math.min(3, bodies);
      addHeat(w, heatFaction, gain);
      c.emit('heat_up', 'bad', { variant: heatFaction, gain, level: w.heat[heatFaction] ?? 0, source: 'bodies', calls: 0 });
    }
  }

  for (const f of foes) f.flags = f.flags.filter((x) => x !== 'disabled');
  const style = weaponStyle(wield.tags);
  if (style && !w.over) train(c, style, 1 + Math.min(3, foes.length));
  if (result === 'flee' && !w.over) train(c, 'athletics', 2);
  if (result === 'win' && foes.length >= 3) h.fame += 1;
  if (result === 'win') {
    const dragons = foes.filter((f) => f.tags.includes('dragon') && !f.tags.includes('boss')).length;
    if (dragons) w.counters.dragon_kills = (w.counters.dragon_kills ?? 0) + dragons;
    const scalps = foes.filter((f) => f.tags.includes('artemis')).length;
    if (scalps) {
      h.fame += 4 * scalps;
      w.counters.artemis_kills = (w.counters.artemis_kills ?? 0) + scalps;
    }
  }
  if (w.flight && foes.some((f) => w.flight!.ids.includes(f.id))) w.flight = null;
  if (result === 'win' && foes.some((f) => f.tags.includes('boss'))) h.fame += 10;
  // Allies share the risk, and the loyalty.
  if (!w.over) {
    for (const a of [...h.companions]) {
      if (result === 'win') a.loyalty = Math.min(100, a.loyalty + 3);
      else a.loyalty -= 4;
      const hurt = h.hp < h.maxHp * 0.3 ? 0.4 : 0.15;
      if (rng.chance(hurt)) {
        a.hp -= rng.int(4, Math.max(5, Math.round(a.maxHp * 0.5)));
        if (a.hp <= 0) removeCompanion(c, a, 'lost');
      }
    }
  }
  return result;
}
