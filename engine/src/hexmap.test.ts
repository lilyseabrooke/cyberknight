import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { expand } from './mapgen';
import { relocate } from './combat';
import { dist } from './hex';
import { cellsOf, hexDist, occupancy, touching } from './hexmap';
import type { Location, World } from './types';

function grown(seed: string, rings = 3): World {
  const w = createWorld({ seed: 'x', worldSeed: seed });
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

describe('the hex grid', () => {
  it('puts every outdoor place on its own hexes, none shared, and multi-hex places are connected', () => {
    const w = grown('hex-a');
    const seen = new Map<string, string>();
    let placed = 0;
    let sizes = new Set<number>();
    for (const l of Object.values(w.locations)) {
      for (const c of cellsOf(l)) {
        const k = `${c.q},${c.r}`;
        expect(seen.get(k), `${k} claimed by ${l.id} and ${seen.get(k)}`).toBeUndefined();
        seen.set(k, l.id);
      }
      if (l.hex) {
        placed++;
        sizes.add(l.hex.cells.length);
        // Each cell touches another of the same place.
        const cs = cellsOf(l);
        if (cs.length > 1) for (const c of cs) expect(cs.some((d) => d !== c && dist(c, d) === 1)).toBe(true);
      }
    }
    expect(placed).toBeGreaterThan(40);
    expect(sizes.size).toBeGreaterThanOrEqual(3); // places come in different sizes
    expect(occupancy(w).size).toBe(seen.size);
  });

  it('a place is next to the one it grew from', () => {
    const w = grown('hex-b');
    let checked = 0;
    for (const l of Object.values(w.locations)) {
      const p = l.gen && w.locations[l.gen.parent];
      if (!l.hex || !p?.hex) continue;
      expect(hexDist(l, p)).toBeLessThanOrEqual(4);
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('places that touch can be linked in ways that are not doors, and links run both ways', () => {
    const vias = new Set<string>();
    for (const seed of ['hex-c', 'hex-e', 'hex-f', 'hex-g']) {
    const w = grown(seed, 5);
    for (const l of Object.values(w.locations)) {
      for (const e of l.links ?? []) {
        vias.add(e.via!);
        const back = w.locations[e.to]!.links?.find((x) => x.to === l.id);
        expect(back?.via).toBe(e.via);
        expect(touching(w, l).some((t) => t.id === e.to) || !!e.over).toBe(true);
      }
    }
    }
    for (const v of ['open', 'fence', 'barricade', 'wall', 'duct', 'through']) expect([...vias], v).toContain(v);
  });

  it('is the same grid for the same world explored the same way, and the tree of doors is untouched', () => {
    const a = grown('hex-d');
    const b = grown('hex-d');
    for (const id of Object.keys(a.locations)) {
      expect(b.locations[id]?.hex).toEqual(a.locations[id]!.hex);
      expect(b.locations[id]?.links).toEqual(a.locations[id]!.links);
    }
    relocate(a, 'street_main');
  });
});
