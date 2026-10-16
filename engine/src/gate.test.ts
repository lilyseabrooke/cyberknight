import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { createWorld } from './world';
import { beginRun, endRun, newUniverse } from './universe';
import { fight, relocate } from './combat';
import { childId } from './mapgen';
import type { GameEvent, World } from './types';

const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

/** Walk out to the cordon and put CINDERJAW one hit from dead beside a hero who can do it. */
function dragonSlain(seed: string): { w: World; events: GameEvent[] } {
  const w = createWorld({ seed });
  const queue = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  const seen = new Set<string>();
  while (queue.length && seen.size < 250) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    relocate(w, id);
    for (const e of w.locations[id]!.exits) if (w.locations[e.to]?.gen) queue.push(e.to);
  }
  const h = w.hero;
  h.level = 60;
  h.maxHp = h.hp = 5000;
  h.muscle = 30;
  h.locationId = 'overpass';
  const dragon = w.npcs.dragon!;
  dragon.hp = 1;
  const { c, events } = ctxOf(w, `${seed}:fight`);
  fight(c, [dragon], { cause: 'the lockdown', joiners: false });
  return { w, events };
}

describe('CINDERJAW as the gate', () => {
  it('the district starts shut, and killing it opens the cordon without ending the night', () => {
    const w0 = createWorld({ seed: 'gate' });
    expect(w0.legacy.gate).toBeUndefined();
    const { w, events } = dragonSlain('gate');
    expect(w.npcs.dragon!.alive).toBe(false);
    expect(w.legacy.gate).toBe('open');
    expect(w.over).toBe(false);
    expect(w.ending).toBeNull();
    expect(events.some((e) => e.type === 'victory')).toBe(true);
    const edge = Object.values(w.locations).filter((l) => l.gen?.role === 'street' && l.gen.depth === 4 && l.gen.expanded);
    expect(edge.length).toBeGreaterThan(0);
    expect(edge.some((l) => l.exits.some((e) => w.locations[e.to]?.gen?.role === 'street' && w.locations[e.to]!.gen!.parent === l.id))).toBe(true);
  });

  it('carries over: the next run starts with the dragon dead and the cordon down', () => {
    const { w } = dragonSlain('carry');
    const u = endRun(w);
    const next = beginRun(u, { seed: 'next' });
    expect(next.legacy.gate).toBe('open');
    expect(next.npcs.dragon!.alive).toBe(false);
    expect(Object.values(next.locations).some((l) => l.gen?.cordon)).toBe(false);
    const edge = Object.values(next.locations).filter((l) => l.gen?.role === 'street' && l.gen.depth === 4 && l.gen.expanded);
    expect(edge.some((l) => l.exits.some((e) => next.locations[e.to]?.gen?.role === 'street' && next.locations[e.to]!.gen!.parent === l.id))).toBe(true);
  });

  it('a fresh universe is shut again', () => {
    const w = beginRun(newUniverse('fresh'), { seed: 'a' });
    expect(w.legacy.gate).toBeUndefined();
    expect(w.npcs.dragon!.alive).toBe(true);
  });
});
