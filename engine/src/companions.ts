import type { Companion, Ctx, Npc, World } from './types';

export interface KindDef {
  label: string;
  maxHp: number;
  power: number;
  abilities: string[];
  /** Combat assist: damage to a foe and/or damage absorbed. */
  assist: { dmg?: number; absorb?: number; disable?: boolean };
}

export const KINDS: Record<string, KindDef> = {
  puppy: { label: 'robot puppy', maxHp: 25, power: 3, abilities: ['sniff', 'charm'], assist: { dmg: 7 } },
  drone: { label: 'hacked drone', maxHp: 40, power: 5, abilities: ['scout', 'hack', 'zap'], assist: { dmg: 13 } },
  kids: { label: 'street kids', maxHp: 18, power: 2, abilities: ['scout', 'distract', 'pickpocket'], assist: { dmg: 5 } },
  pigeon: { label: 'cyber-pigeon', maxHp: 8, power: 1, abilities: ['scout', 'distract'], assist: { absorb: 7 } },
  scrapper: { label: 'scrapper-bot', maxHp: 60, power: 5, abilities: ['tank', 'lockpick'], assist: { absorb: 11 } },
  hacker: { label: 'hacker', maxHp: 54, power: 5, abilities: ['hack', 'scout'], assist: { disable: true } },
  courier: { label: 'courier', maxHp: 30, power: 3, abilities: ['scout', 'charm'], assist: { dmg: 5 } },
};

export const MAX_COMPANIONS = 3;

export function newCompanion(kind: string, name: string, o: { npcId?: string; loyalty?: number; home?: string } = {}): Companion {
  const k = KINDS[kind]!;
  return {
    id: `ally_${kind}_${name.replace(/\W+/g, '')}`,
    name,
    kind,
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
export function removeCompanion(c: Ctx, comp: Companion, why: 'left' | 'lost'): void {
  const { w } = c;
  w.hero.companions = w.hero.companions.filter((a) => a !== comp);
  if (why === 'left' && comp.npcId && w.npcs[comp.npcId]) {
    const n: Npc = w.npcs[comp.npcId]!;
    n.locationId = comp.home ?? 'halo_floor';
    n.alive = true;
  }
  c.emit(why === 'lost' ? 'companion_lost' : 'companion_leaves', 'bad', { name: comp.name, kind: comp.kind });
}
