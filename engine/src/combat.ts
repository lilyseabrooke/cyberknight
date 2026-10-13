import type { Ctx, Injury, Item, Npc, World } from './types';
import { IMPLANTS } from './content/implants';
import { KINDS, removeCompanion } from './companions';
import { hasImplantFlag, skillLevel } from './skills';

export const npcsAt = (w: World, loc: string): Npc[] => Object.values(w.npcs).filter((n) => n.alive && n.locationId === loc && n.downUntil <= w.beat);

export const here = (w: World): Npc[] => npcsAt(w, w.hero.locationId);

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

export const hasInjury = (w: World, i: Injury): boolean => w.hero.injuries.includes(i);

export function addHeat(w: World, faction: string | null, n: number): void {
  if (!faction) return;
  w.heat[faction] = Math.min(10, (w.heat[faction] ?? 0) + n);
}

export function remember(npc: Npc, what: string): void {
  npc.memories.push(what);
  if (npc.memories.length > 12) npc.memories.shift();
}

export function heroPower(w: World): number {
  const h = w.hero;
  let p = h.level * 2 + h.muscle + h.weapon.power;
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
  if ((item.kind === 'weapon' || item.kind === 'gadget') && item.power > h.weapon.power) {
    const old = h.weapon;
    h.weapon = item;
    if (old.id !== 'excalibur') h.inventory.push(old);
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
    h.maxHp += 12;
    h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.3));
    const stat = (['muscle', 'reflex', 'charm', 'hack'] as const)[h.level % 4]!;
    h[stat]++;
    c.w.stats.maxLevel = Math.max(c.w.stats.maxLevel, h.level);
    c.emit('level_up', 'good', { level: h.level, stat });
  }
}

export function isLethal(foes: Npc[], w: World): boolean {
  if (foes.some((f) => f.tags.some((t) => ['robot', 'cop', 'corp', 'boss'].includes(t)) && !f.tags.includes('nonlethal'))) return true;
  const kind = w.locations[w.hero.locationId]?.kind;
  return !(kind === 'bar' || kind === 'club');
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
    weapon: h.weapon.name,
    boss: foes.some((f) => f.tags.includes('boss')),
  });

  let rounds = 0;
  let result: FightResult | null = null;
  let backfires = 0;
  let crits = 0;
  let assists = 0;
  const fleeAt = 0.1 + h.competence * 0.35;
  const armor = h.armor?.power ?? 0;

  const down = new Set<string>();
  const standing = () => foes.filter((f) => f.alive && !down.has(f.id));
  const maxRounds = foes.some((f) => f.tags.includes("boss")) ? 26 : 14;
  while (!result && rounds < maxRounds) {
    rounds++;
    const living = standing();
    // hero strikes
    let dmg = Math.round(heroPower(w) * (0.45 + rng.next() * 0.6));
    if (h.weapon.unstable) {
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
    // Allies pitch in: bites, zaps, bricks, pigeon-based interference.
    let absorb = 0;
    for (const a of h.companions) {
      if (a.hp <= 0 || assists >= 3 || !rng.chance(0.4)) continue;
      const spec = KINDS[a.kind]!.assist;
      assists++;
      if (spec.dmg) dmg += spec.dmg;
      if (spec.absorb) absorb += spec.absorb;
      if (spec.disable) living.forEach((f) => !f.flags.includes('disabled') && f.flags.push('disabled'));
      if (assists === 1) c.emit('ally_assist', 'good', { name: a.name, kind: a.kind, dmg: spec.dmg ?? 0, absorb: spec.absorb ?? 0, foe: target.name });
    }
    target.hp -= dmg;
    if (target.hp <= 0) {
      if (lethal) kill(c, w, target, h.weapon.name);
      else down.add(target.id); // knocked out, not dead. They'll remember.
    }
    // foes strike
    let taken = 0;
    let biggest = 0;
    for (const f of standing()) {
      if (!rng.chance(0.8)) continue;
      let fp = f.power - (f.flags.includes('disabled') ? 3 : 0);
      if (f.tags.includes('boss') && w.flags.dragon_weak) fp *= 0.65;
      const d = Math.max(1, Math.round(fp * (0.2 + rng.next() * 0.4)) - armor);
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
    } else if (rounds >= 2 && h.hp / h.maxHp < fleeAt && !hasInjury(w, 'broken_leg') && rng.chance(0.55 + h.reflex * 0.03)) {
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
    weapon: h.weapon.name,
    backfires,
    crits,
    allies: h.companions.filter((a) => a.hp > 0).map((a) => a.name).join(' and '),
    allyKind: h.companions.find((a) => a.hp > 0)?.kind ?? '',
    boss: foes.some((f) => f.tags.includes('boss')),
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
    h.hp = Math.max(h.hp, 1);
    c.emit('fight_end', 'good', { ...base, variant: 'win', cash, xp: Math.round(xp), loot: found.slice(0, 3).join(', ') });
    gainXp(c, xp);
    if (foes.some((f) => f.archetype === 'cyberdragon')) {
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

  for (const f of foes) f.flags = f.flags.filter((x) => x !== 'disabled');
  if (result === 'win' && foes.length >= 3) h.fame += 1;
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
