import type { Companion, Ctx, Npc, World } from './types';
import { moveNpc } from './population';
import { fightTraining, levelOfXp, skillXp } from './grade';

export interface KindDef {
  label: string;
  maxHp: number;
  power: number;
  abilities: string[];
  /** Combat assist: damage to a foe and/or damage absorbed. */
  assist: { dmg?: number; absorb?: number; disable?: boolean };
  /** Seats it takes in a car; default 1. */
  seats?: number;
  /** Flies alongside: a bike has no seat for it and doesn't need one. */
  flies?: boolean;
  /** Tricks it picks up on reaching a level. */
  learns?: Record<number, string>;
}

export const KINDS: Record<string, KindDef> = {
  puppy: { label: 'robot puppy', maxHp: 25, power: 3, abilities: ['sniff', 'charm'], assist: { dmg: 7 }, learns: { 6: 'fetch', 15: 'guard', 30: 'scout' } },
  drone: { label: 'hacked drone', maxHp: 40, power: 5, abilities: ['scout', 'hack', 'zap'], assist: { dmg: 13 }, flies: true, learns: { 10: 'lockpick', 25: 'distract' } },
  kids: { label: 'street kids', maxHp: 18, power: 2, abilities: ['scout', 'distract', 'pickpocket'], assist: { dmg: 5 }, learns: { 8: 'charm', 20: 'lockpick' } },
  pigeon: { label: 'cyber-pigeon', maxHp: 8, power: 1, abilities: ['scout', 'distract'], assist: { absorb: 7 }, seats: 0, flies: true, learns: { 12: 'charm', 30: 'sniff' } },
  scrapper: { label: 'scrapper-bot', maxHp: 60, power: 5, abilities: ['tank', 'lockpick'], assist: { absorb: 11 }, seats: 2, learns: { 12: 'hack', 28: 'scout' } },
  hacker: { label: 'hacker', maxHp: 54, power: 5, abilities: ['hack', 'scout'], assist: { disable: true }, learns: { 10: 'distract', 25: 'zap' } },
  courier: { label: 'courier', maxHp: 30, power: 3, abilities: ['scout', 'charm'], assist: { dmg: 5 }, learns: { 10: 'distract', 25: 'hack' } },
};

/** How many can be with her at once. Others wait at a home she owns (see crew.ts), and don't count. */
export const MAX_COMPANIONS = 3;

export const MAX_COMPANION_LEVEL = 100;

export const levelOf = (a: Companion): number => a.level ?? 1;

/** Experience for a companion to stand at a level: the same curve her skills use (grade.ts). */
export const companionXpFor = (level: number): number => Math.ceil(skillXp(level));

/** Hp and power grow with level, a little less than a hero's do. */
const growth = (level: number, per: number): number => 1 + per * (level - 1);

/** What a companion's assist is worth at their level. */
export function assistOf(a: Companion): KindDef['assist'] {
  const k = KINDS[a.kind]?.assist ?? {};
  const g = growth(levelOf(a), 0.06);
  return { ...(k.dmg ? { dmg: Math.round(k.dmg * g) } : {}), ...(k.absorb ? { absorb: Math.round(k.absorb * g) } : {}), ...(k.disable ? { disable: true } : {}) };
}

/** Bring a companion's numbers in line with their level; the extra hp comes with it. */
export function applyLevel(a: Companion): void {
  const k = KINDS[a.kind];
  if (!k) return;
  const L = levelOf(a);
  const maxHp = Math.round(k.maxHp * growth(L, 0.08));
  a.hp += Math.max(0, maxHp - a.maxHp);
  a.maxHp = maxHp;
  a.power = Math.round(k.power * growth(L, 0.06) * 10) / 10;
}

/** Give a companion experience. Levels, new tricks and a stronger body follow; returns the levels gained. */
export function gainCompanionXp(c: Ctx, a: Companion, amount: number): number {
  if (amount <= 0 || levelOf(a) >= MAX_COMPANION_LEVEL) return 0;
  a.xp = (a.xp ?? 0) + amount;
  const before = levelOf(a);
  const now = Math.min(MAX_COMPANION_LEVEL, Math.max(1, Math.floor(levelOfXp(a.xp))));
  if (now <= before) return 0;
  a.level = now;
  applyLevel(a);
  c.emit('companion_levels', 'good', { name: a.name, kind: a.kind, level: now });
  for (let l = before + 1; l <= now; l++) {
    const trick = KINDS[a.kind]?.learns?.[l];
    if (trick && !a.abilities.includes(trick)) {
      a.abilities.push(trick);
      c.emit('companion_learns', 'good', { name: a.name, kind: a.kind, trick, level: l });
    }
  }
  return now - before;
}

/** What a fight is worth to the allies who were in it: more for a harder foe, less the more they already know. */
export function fightXp(a: Companion, foeLevel: number): number {
  return fightTraining(2, levelOf(a), foeLevel);
}

/** What a companion brings to a fight: their own power, plus whatever a speech has put in them. */
export const allyPower = (w: World, a: Companion): number => a.power + (a.inspired && a.inspired.until > w.beat ? a.inspired.power : 0);

export function newCompanion(kind: string, name: string, o: { npcId?: string; loyalty?: number; home?: string } = {}): Companion {
  const k = KINDS[kind]!;
  return {
    id: `ally_${kind}_${name.replace(/\W+/g, '')}`,
    name,
    kind,
    level: 1,
    xp: 0,
    hp: k.maxHp,
    maxHp: k.maxHp,
    power: k.power,
    loyalty: o.loyalty ?? 55,
    abilities: [...k.abilities],
    npcId: o.npcId,
    home: o.home,
  };
}

export const alliesWith = (w: World, ability: string): Companion[] =>
  w.hero.companions.filter((a) => a.hp > 0 && a.abilities.includes(ability));

export const hasAlly = (w: World, ability: string): boolean => alliesWith(w, ability).length > 0;

export const hasKind = (w: World, kind: string): boolean => w.hero.companions.some((a) => a.kind === kind);

export const slotsFree = (w: World): boolean => w.hero.companions.length < MAX_COMPANIONS;

/** Returns true if the ally joined. */
export function addCompanion(c: Ctx, comp: Companion, how: string, quiet = false): boolean {
  const { w } = c;
  if (!slotsFree(w) || w.hero.companions.some((a) => a.id === comp.id)) return false;
  w.hero.companions.push(comp);
  if (!quiet) c.emit('companion_joins', 'good', { name: comp.name, kind: comp.kind, how, count: w.hero.companions.length });
  return true;
}

/** An ally leaves or is lost. NPC-born allies go home. */
export function removeCompanion(c: Ctx, comp: Companion, why: 'left' | 'lost', by?: Npc): void {
  const { w } = c;
  w.hero.companions = w.hero.companions.filter((a) => a !== comp);
  if (why === 'left' && comp.npcId && w.npcs[comp.npcId]) {
    const n: Npc = w.npcs[comp.npcId]!;
    moveNpc(w, n, comp.home ?? 'halo_floor');
    n.alive = true;
  }
  c.emit(why === 'lost' ? 'companion_lost' : 'companion_leaves', 'bad', {
    name: comp.name, kind: comp.kind,
    // Who did it, for the vengeance it might start (see callings.ts).
    ...(why === 'lost' && by ? { by: by.name, by_id: by.id, by_faction: by.faction ?? '', ...(by.tags.includes('dragon') ? { by_dragon: true } : {}) } : {}),
  });
}
