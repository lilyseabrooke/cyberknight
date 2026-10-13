import type { Drive } from './personality';
import type { Ctx, Npc, World } from './types';
import { addHeat, fight, here, npcsAt, remember, relocate } from './combat';
import { spawnNpc } from './content/archetypes';

/**
 * A thing Blackbird could do right now. Everything in Neo advertises these (the Sims model):
 * NPCs, objects, exits and her own state each contribute candidates; the AI scores them all
 * against her drives and picks, with competence controlling how badly.
 */
export interface Candidate {
  key: string;
  drives: Partial<Record<Drive, number>>;
  /** Flat desire adjustment (state-driven urges). */
  bonus?: number;
  /** Desire that only a competent hero feels (sensible actions: patch up, flee). */
  smart?: number;
  /** Danger; a competent hero is put off by it, a clueless one barely notices. */
  risk?: number;
  run(c: Ctx): void;
}

export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export const levelRisk = (w: World, n: Npc): number => clamp((n.level - w.hero.level) / 3, 0, 3) + (n.tags.includes('boss') ? 3 : 0);

/** Spawn short-lived NPCs (ambushers, muggers, cops) at the hero's location. */
export function spawnGroup(c: Ctx, archetype: string, count: number, faction?: string): Npc[] {
  const out: Npc[] = [];
  for (let i = 0; i < count; i++) {
    const id = `tmp_${c.w.beat}_${archetype}_${i}`;
    const n = spawnNpc(c.rng, id, archetype, c.w.hero.locationId, { faction });
    c.w.npcs[id] = n;
    out.push(n);
  }
  return out;
}

export function revealExit(w: World, from: string, to: string): boolean {
  const e = w.locations[from]?.exits.find((x) => x.to === to);
  if (!e || !e.hidden) return false;
  e.hidden = false;
  return true;
}

export function arrive(c: Ctx, to: string, variant: string, extra: Record<string, string | number | boolean> = {}): void {
  const { w } = c;
  const from = w.locations[w.hero.locationId]!;
  relocate(w, to);
  const dest = w.locations[to]!;
  c.emit('go', 'mixed', {
    variant,
    to: dest.name,
    toId: to,
    from: from.name,
    first: dest.visits === 1,
    ...extra,
  });
}

export const dutchHere = (w: World): Npc | undefined => here(w).find((n) => n.id === 'dutch');

export { addHeat, fight, here, npcsAt, remember };
