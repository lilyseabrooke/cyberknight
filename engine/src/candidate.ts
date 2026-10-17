import type { Drive } from './personality';
import type { Ctx, Npc, World } from './types';
import type { EventData } from './events';
import { addHeat, fight, here, npcsAt, remember, relocate } from './combat';
import { dangerOf } from './grade';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { enterRoom } from './dungeons';

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
  /**
   * Announce it: an `intent` event (variant = the key before any colon, plus this data) opens a group,
   * and everything the action emits is told inside it. Needs an `intent:<variant>` line in text.ts.
   */
  intent?: EventData;
  run(c: Ctx): void;
}

export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export const levelRisk = (w: World, n: Npc): number => clamp((n.level - w.hero.level) / 3, 0, 3) + (n.tags.includes('boss') ? 3 : 0);

/** Spawn short-lived NPCs (ambushers, muggers, cops) at the hero's location. */
export function spawnGroup(c: Ctx, archetype: string, count: number, faction?: string): Npc[] {
  const out: Npc[] = [];
  for (let i = 0; i < count; i++) {
    let id = `tmp_${c.w.beat}_${archetype}_${i}`;
    // (Two groups of the same kind in one beat must not be the same people.)
    for (let k = 1; c.w.npcs[id]; k++) id = `tmp_${c.w.beat}_${archetype}_${i}_${k}`;
    const here = c.w.locations[c.w.hero.locationId];
    const n = spawnNpc(c.rng, id, archetype, c.w.hero.locationId, { faction, ...(here?.gen ? { grade: dangerOf(here) } : {}) });
    addNpc(c.w, n);
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
  const car = w.hero.vehicle;
  relocate(w, to);
  const dest = w.locations[to]!;
  c.emit('go', 'mixed', {
    variant,
    to: dest.name,
    toId: to,
    from: from.name,
    first: dest.visits === 1,
    ...(dest.visits === 1 && dest.blurb ? { blurb: dest.blurb } : {}),
    ...extra,
  });
  if (car && !w.hero.vehicle) c.emit('vehicle', 'mixed', { variant: 'left', car: car.name, place: from.name });
  // A car of hers parked here that has been towed, recovered or stripped while she was away.
  const lost = w.hero.parked?.filter((p) => p.at === to && p.until <= w.clock) ?? [];
  if (lost.length) {
    w.hero.parked = w.hero.parked!.filter((p) => !lost.includes(p));
    for (const p of lost) c.emit('vehicle', 'bad', { variant: 'gone', car: p.name, kind: p.kind, place: dest.name });
  }
  // A room in a dungeon: whatever's in it finds out about her.
  if (dest.dungeon && !w.over) enterRoom(c, dest);
  if (w.over || w.hero.locationId !== to) return;
  // The world remembers: somebody here knows what she did.
  const known = here(w).filter((n) => n.memories.length > 0 && !n.hostile && n.archetype !== 'puppy');
  if (known.length && c.rng.chance(0.25)) {
    const n = c.rng.pick(known);
    const mem = c.rng.pick(n.memories);
    c.emit('recognition', n.affinity < -10 ? 'bad' : 'mixed', { npc: n.name, variant: memoryVariant(mem), mem, mood: n.affinity < -10 ? 'cold' : 'warm' });
  }
}

function memoryVariant(m: string): string {
  if (m.startsWith('heard Blackbird killed')) return 'heard_killed';
  if (m.startsWith('heard Blackbird hurt')) return 'heard_hurt';
  if (m.startsWith('heard Blackbird helped')) return 'heard_helped';
  if (m.includes('charmed')) return 'charmed';
  if (m === 'kissed Blackbird') return 'kissed';
  if (m.includes('beaten')) return 'beaten';
  if (m.includes('shaken down')) return 'shakedown';
  if (m.includes('stole')) return 'puppy';
  if (m.includes('till')) return 'till';
  if (m.includes('kiss someone else')) return 'cheater';
  if (m.includes('kill')) return 'killer';
  if (m.includes('skylight')) return 'skylight';
  if (m.includes('pocket')) return 'pickpocket';
  return 'generic';
}

/** Whoever owns the place she is standing in (Dutch, until somebody takes the Halo off his hands). */
export const dutchHere = (w: World): Npc | undefined => here(w).find((n) => n.tags.includes('owner'));

export { addHeat, fight, here, npcsAt, remember };
