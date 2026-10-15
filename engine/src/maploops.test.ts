import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { childId, expand } from './mapgen';
import { relocate } from './combat';
import type { Id, Location, World } from './types';

/**
 * Loops in the generated map. These build streets directly with `expand` (no nights, no people),
 * so the whole file runs in well under a second.
 */

/** A world with the first ring of streets grown, and the one beyond it. */
function grown(worldSeed: string, rings = 2): World {
  const w = createWorld({ seed: 'x', worldSeed });
  let edge: Location[] = ['street_main', 'club_backlot', 'halo_alley'].flatMap((id) => w.locations[id]!.exits.map((e) => w.locations[e.to]!).filter((l) => l.gen));
  for (let i = 0; i < rings; i++) {
    const next: Location[] = [];
    for (const l of edge) {
      expand(w, l);
      for (const e of l.exits) if (w.locations[e.to]?.gen?.parent === l.id && w.locations[e.to]!.gen!.role === 'street') next.push(w.locations[e.to]!);
    }
    edge = next;
  }
  return w;
}

/** Links that aren't the tree: an exit between two generated places where neither is the other's parent. */
const crossLinks = (w: World): [Location, Location][] => {
  const out: [Location, Location][] = [];
  for (const a of Object.values(w.locations)) {
    if (!a.gen) continue;
    for (const e of a.exits) {
      const b = w.locations[e.to];
      if (b?.gen && b.gen.parent === a.gen.parent && a.id < b.id) out.push([a, b]);
    }
  }
  return out;
};

/** Can you get from `from` to `to` without using the exit `from -> to` directly? */
function reachesAround(w: World, from: Id, to: Id, hiddenOk: boolean): boolean {
  const seen = new Set<Id>([from]);
  const stack: Id[] = [];
  for (const e of w.locations[from]!.exits) if (e.to !== to && (hiddenOk || !e.hidden)) stack.push(e.to);
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of w.locations[id]?.exits ?? []) if (hiddenOk || !e.hidden) stack.push(e.to);
  }
  return false;
}

describe('loops in the map', () => {
  const seeds = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];

  it('adds cut-throughs between streets and side doors between neighbouring buildings', () => {
    const links = seeds.flatMap((s) => crossLinks(grown(s)));
    expect(links.some(([a, b]) => a.gen!.role === 'street' && b.gen!.role === 'street')).toBe(true);
    expect(links.some(([a, b]) => ['shop', 'bar', 'club'].includes(a.gen!.role) && ['shop', 'bar', 'club'].includes(b.gen!.role))).toBe(true);
  });

  it('is always two-way, with no doubled exits, and never to a place that does not exist', () => {
    for (const s of seeds) {
      const w = grown(s);
      for (const l of Object.values(w.locations)) {
        const targets = l.exits.map((e) => e.to);
        expect(new Set(targets).size, `${l.id} has a doubled exit`).toBe(targets.length);
        for (const e of l.exits) {
          const to = w.locations[e.to];
          expect(to, `${l.id} -> ${e.to}`).toBeDefined();
          if (to!.gen?.parent === l.gen?.parent && l.gen) {
            const back = to!.exits.find((x) => x.to === l.id);
            expect(back, `${e.to} has no way back to ${l.id}`).toBeDefined();
            expect(back!.hidden).toBe(e.hidden);
          }
        }
      }
    }
  });

  it('really makes loops: the street can be reached another way round', () => {
    let proven = 0;
    for (const s of seeds) {
      const w = grown(s);
      for (const [a, b] of crossLinks(w)) {
        const open = w.locations[a.gen!.parent]!;
        if (!a.exits.find((e) => e.to === b.id)!.hidden && reachesAround(w, open.id, a.id, false)) proven++;
      }
    }
    expect(proven).toBeGreaterThan(0);
  });

  it('keeps secret doors secret until found, then both ends open', () => {
    let tested = 0;
    for (const s of seeds) {
      const w = grown(s, 3);
      for (const [a, b] of crossLinks(w)) {
        const door = a.exits.find((e) => e.to === b.id)!;
        if (!door.hidden) continue;
        expect(b.exits.find((e) => e.to === a.id)!.hidden).toBe(true);
        w.hero.locationId = a.id;
        relocate(w, b.id);
        expect(a.exits.find((e) => e.to === b.id)!.hidden).toBe(false);
        expect(b.exits.find((e) => e.to === a.id)!.hidden).toBe(false);
        tested++;
        break;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('does not depend on the order things are found, loops included', () => {
    const a = createWorld({ seed: 'a', worldSeed: 'order-loops' });
    const b = createWorld({ seed: 'b', worldSeed: 'order-loops' });
    const ids = [0, 1].map((i) => childId('street_main', i));
    for (const id of ids) expand(a, a.locations[id]!);
    for (const id of [...ids].reverse()) expand(b, b.locations[id]!);
    for (const id of ids) {
      expect(b.locations[id]!.exits).toEqual(a.locations[id]!.exits);
      for (const e of a.locations[id]!.exits) expect(b.locations[e.to]).toEqual(a.locations[e.to]);
    }
  });

  it('leaves what has been grown alone when expanded again', () => {
    const w = grown('l1');
    const before = JSON.stringify(w.locations);
    for (const l of Object.values(w.locations)) if (l.gen?.expanded) expand(w, l);
    expect(JSON.stringify(w.locations)).toBe(before);
  });
});
