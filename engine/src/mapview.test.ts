import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { relocate } from './combat';
import { boardView, cityView, sideOf } from './mapview';
import type { World } from './types';

const fresh = (): World => createWorld({ seed: 'mv', worldSeed: 'mapview' });

describe('the map the viewer draws', () => {
  it('puts her and everyone in the room on the board of the place she is in', () => {
    const w = fresh();
    relocate(w, 'halo_floor');
    const b = boardView(w)!;
    expect(b.loc).toBe('halo_floor');
    expect(b.layout).not.toBeNull();
    const { w: gw, h: gh, cells } = b.layout!.grid;
    const inside = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x < gw && p.y < gh && cells[p.y * gw + p.x] !== 'void';
    expect(b.hero && inside(b.hero)).toBe(true);
    expect(b.people.length).toBeGreaterThan(3);
    for (const p of b.people) {
      expect(inside(p)).toBe(true);
      expect(w.npcs[p.id]!.alive).toBe(true);
    }
  });

  it('colours people by the side they are on', () => {
    const w = fresh();
    expect(sideOf(w, { faction: 'halo', tags: [] })).toBe('house');
    expect(sideOf(w, { faction: 'vipers', tags: ['ganger'] })).toBe('gang');
    expect(sideOf(w, { faction: 'atlas', tags: ['robot'] })).toBe('atlas');
    expect(sideOf(w, { faction: 'npd', tags: [] })).toBe('npd');
    expect(sideOf(w, { faction: null, tags: [] })).toBe('civ');
  });

  it('shows only the city she has seen: where she has been, and the ways in from there', () => {
    const w = fresh();
    relocate(w, 'street_main');
    const c = cityView(w);
    const ids = new Set(c.places.map((p) => p.id));
    expect(c.here).toBe('street_main');
    for (const p of c.places) {
      const l = w.locations[p.id]!;
      expect(l.hex).toBeDefined();
      const fromVisited = Object.values(w.locations).some((v) => v.visits > 0 && [...v.exits, ...(v.links ?? [])].some((e) => e.to === p.id && !e.hidden));
      expect(l.visits > 0 || fromVisited).toBe(true);
      expect(p.been).toBe(l.visits > 0);
    }
    // a place on the grid she has no way of knowing about stays off the map
    const unknown = Object.values(w.locations).find((l) => l.hex && !ids.has(l.id));
    if (unknown) {
      w.locations.street_main!.exits.push({ to: unknown.id, label: 'a hidden way', hidden: true, gate: null });
      expect(cityView(w).places.some((p) => p.id === unknown.id)).toBe(false);
    }
  });

  it('draws a room off the grid on the place it belongs to', () => {
    const w = fresh();
    const off = Object.values(w.locations).find((l) => !l.hex && !l.outdoors)!;
    expect(off).toBeDefined();
    relocate(w, off.id);
    expect(w.hero.locationId).toBe(off.id);
    const c = cityView(w);
    expect(c.here).not.toBeNull();
    expect(w.locations[c.here!]!.hex).toBeDefined();
  });
});
