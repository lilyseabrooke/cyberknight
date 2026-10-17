import { describe, expect, it } from 'vitest';
import { beginRun, endRun, newUniverse } from './universe';
import { deserialize, makeSave, serialize } from './store';
import { relocate } from './combat';
import { expand, seedFrontier, childId, dangerOf, liftCordon, sealCordon, START_DEPTH } from './mapgen';
import { everyoneAt, verifyIndex } from './population';
import { routeTo } from './plans';
import { createWorld } from './world';
import { runToEnd } from './run';
import type { Id, Location, World } from './types';

/** Blackbird goes everywhere, in order of nearness (or deepest first), so everything on the way is generated. Returns where she went. */
function explore(w: World, steps: number, order: 'bfs' | 'dfs' = 'bfs'): Id[] {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  const went: Id[] = [];
  while (went.length < steps && queue.length) {
    const id = order === 'bfs' ? queue.shift()! : queue.pop()!;
    relocate(w, id);
    went.push(id);
    for (const e of w.locations[id]!.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return went;
}

const frontier = (w: World): Location[] => Object.values(w.locations).filter((l) => l.gen);

describe('the city that grows', () => {
  it('opens the hand-built district onto streets that are already named', () => {
    const w = createWorld({ seed: 'edge' });
    const east = w.locations[childId('street_main', 0)]!;
    expect(east.gen).toMatchObject({ role: 'street', parent: 'street_main', expanded: false });
    expect(w.locations.street_main!.exits.some((e) => e.to === east.id)).toBe(true);
    expect(east.exits.map((e) => e.to)).toEqual(['street_main']); // only the way back until she gets there
    expect(east.blurb).toBeTruthy();
  });

  it('grows a place\'s neighbours the first time she arrives, and only then', () => {
    const w = createWorld({ seed: 'arrive' });
    const east = childId('street_main', 0);
    const before = Object.keys(w.locations).length;
    relocate(w, east);
    const here = w.locations[east]!;
    expect(here.gen!.expanded).toBe(true);
    expect(here.exits.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(w.locations).length).toBeGreaterThan(before);
    // Every exit leads somewhere real, and every new place has a way back.
    for (const e of here.exits) {
      const to = w.locations[e.to]!;
      expect(to, e.to).toBeDefined();
      expect(to.exits.some((x) => x.to === east)).toBe(true);
    }
    // Neighbours are sketched, not grown.
    const kid = w.locations[here.exits[1]!.to]!;
    expect(kid.gen!.expanded).toBe(false);
    const n = Object.keys(w.locations).length;
    expand(w, here);
    expect(Object.keys(w.locations).length).toBe(n); // nothing happens the second time
  });

  it('is the same city however it is explored: a place\'s id fixes what it is', () => {
    const a = createWorld({ seed: 'order' });
    const b = createWorld({ seed: 'order' });
    relocate(a, childId('street_main', 0));
    relocate(b, childId('street_main', 1));
    relocate(b, 'street_main');
    relocate(b, childId('street_main', 0));
    const ea = a.locations[childId('street_main', 0)]!;
    const eb = b.locations[childId('street_main', 0)]!;
    expect(eb.exits).toEqual(ea.exits);
    for (const e of ea.exits) {
      const { visits: _v, ...mine } = a.locations[e.to]!;
      const { visits: _u, ...theirs } = b.locations[e.to]!;
      if (mine.gen?.parent === ea.id) expect(theirs).toEqual(mine);
    }
  });

  it('does not depend on the run, only the world', () => {
    const a = createWorld({ seed: 'night-1', worldSeed: 'shared' });
    const b = createWorld({ seed: 'night-2', worldSeed: 'shared' });
    explore(a, 12, 'dfs');
    explore(b, 12, 'dfs');
    for (const l of frontier(a)) expect(b.locations[l.id]?.name).toBe(l.name);
  });

  it('different worlds get different cities', () => {
    const a = createWorld({ seed: 'x', worldSeed: 'alpha' });
    const b = createWorld({ seed: 'x', worldSeed: 'beta' });
    const names = (w: World) => Object.values(w.locations).filter((l) => l.gen).map((l) => l.name).join('|');
    expect(names(a)).not.toBe(names(b));
  });

  it('keeps the city well-formed as far as she goes', () => {
    const w = createWorld({ seed: 'far' });
    const trail = explore(w, 80);
    expect(trail.length).toBe(80);
    for (const l of Object.values(w.locations)) {
      expect(l.exits.length).toBeGreaterThan(0);
      for (const e of l.exits) expect(w.locations[e.to], `${l.id} -> ${e.to}`).toBeDefined();
      expect(l.tossTo && w.locations[l.tossTo], `${l.id} tossTo`).toBeTruthy();
      expect(l.fleeTo && w.locations[l.fleeTo], `${l.id} fleeTo`).toBeTruthy();
      expect(l.security).toBeGreaterThanOrEqual(0);
      expect(l.security).toBeLessThanOrEqual(9);
      if (l.gen) {
        expect(w.locations[l.gen.parent]).toBeDefined();
        expect(l.id).toBe(childId(l.gen.parent, l.gen.slot));
        expect(l.name).not.toMatch(/undefined|\{|\}/);
        expect(l.blurb).not.toMatch(/undefined|\{|\}/);
      }
    }
    // Everywhere she has been can be walked back to the Halo.
    for (const id of new Set(trail)) expect(routeTo(w, id, 'halo_floor'), id).not.toBeNull();
  });

  it('never runs out of road: every street goes somewhere further', () => {
    const w = createWorld({ seed: 'roads' });
    w.legacy.gate = 'open'; // with the cordon up the road ends at START_DEPTH; see the cordon tests below
    let at = childId('street_main', 0);
    for (let i = 0; i < 15; i++) {
      relocate(w, at);
      const loc = w.locations[at]!;
      const next = loc.exits.map((e) => w.locations[e.to]!).find((l) => l.gen?.role === 'street' && l.gen.parent === at);
      expect(next, `${at} has no street onward`).toBeDefined();
      at = next!.id;
    }
  });

  it('makes a mix of places, with people in them', () => {
    const w = createWorld({ seed: 'mix' });
    explore(w, 120);
    const kinds = new Set(frontier(w).map((l) => l.gen!.role));
    for (const r of ['street', 'shop', 'bar', 'flat']) expect(kinds.has(r as never), r).toBe(true);
    const visited = frontier(w).filter((l) => l.populated);
    expect(visited.length).toBeGreaterThan(10);
    const staffed = visited.filter((l) => ['shop', 'bar', 'club'].includes(l.kind) && everyoneAt(w, l.id).length > 0);
    expect(staffed.length).toBeGreaterThan(0);
    expect(verifyIndex(w)).toEqual([]);
  });

  it('only brings a bar\'s back room to light once it is known, and guards it', () => {
    const w = createWorld({ seed: 'rooms' });
    explore(w, 200);
    const back = frontier(w).filter((l) => l.gen!.role === 'backroom');
    expect(back.length).toBeGreaterThan(0);
    for (const r of back) {
      const door = w.locations[r.gen!.parent]!.exits.find((e) => e.to === r.id)!;
      expect(door.gate).toBe('guarded');
      expect(r.security).toBeGreaterThan(w.locations[r.gen!.parent]!.security);
    }
  });

  it('is kept by the save: same map, same people, next run', () => {
    const w1 = beginRun(newUniverse('keep'), { seed: 'one' });
    explore(w1, 40, 'dfs');
    const grown = Object.fromEntries(Object.entries(w1.locations).filter(([, l]) => l.gen).map(([id, l]) => [id, l.name]));
    expect(Object.keys(grown).length).toBeGreaterThan(10);
    const crowd = new Set(Object.values(w1.npcs).filter((n) => n.id.includes('~')).map((n) => n.id));
    const text = serialize(makeSave(endRun(w1), null, 0));
    const u2 = deserialize(text).universe;
    const w2 = beginRun(u2, { seed: 'two' });
    expect(Object.fromEntries(Object.entries(w2.locations).filter(([, l]) => l.gen).map(([id, l]) => [id, l.name]))).toEqual(grown);
    for (const id of crowd) expect(w2.npcs[id], id).toBeDefined();
    // Nothing is rebuilt, and nothing is reset except the night's own business.
    const tracked = Object.values(w2.locations).filter((l) => l.gen?.expanded);
    expect(tracked.length).toBeGreaterThan(5);
    expect(tracked.every((l) => l.visits === 0)).toBe(true);
    // She wakes where she always does, and the grown map is still out there to walk into.
    expect(w2.hero.locationId).toBe('halo_floor');
    const n = Object.keys(w2.locations).length;
    relocate(w2, tracked[0]!.id);
    expect(Object.keys(w2.locations).length).toBe(n); // already grown: nothing new
  });

  it('brings a save from before the map grew forward, with the edges opened', () => {
    const u = newUniverse('old');
    for (const id of Object.keys(u.locations)) if (u.locations[id]!.gen) delete u.locations[id];
    for (const l of Object.values(u.locations)) l.exits = l.exits.filter((e) => !e.to.includes('~'));
    u.version = 2;
    const back = deserialize(JSON.stringify({ universe: u, run: null, savedAt: 0 })).universe;
    expect(back.locations[childId('street_main', 0)]).toBeDefined();
    expect(back.locations.street_main!.exits.some((e) => e.to === childId('street_main', 0))).toBe(true);
    const n = Object.keys(back.locations).length;
    seedFrontier(back);
    expect(Object.keys(back.locations).length).toBe(n); // idempotent
  });

  it('plays whole nights through the new city without trouble', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const { world, events } = runToEnd({ seed, competence: 0.3 });
      expect(events.length).toBeGreaterThan(20);
      expect(verifyIndex(world)).toEqual([]);
    }
  }, 30_000); // she lasts longer than she used to, and four whole nights take a while
});

describe('the starting district and its cordon', () => {
  const walkOut = (w: World, steps = 400): void => {
    const queue = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
    const seen = new Set<Id>();
    while (queue.length && seen.size < steps) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      relocate(w, id);
      for (const e of w.locations[id]!.exits) if (w.locations[e.to]?.gen) queue.push(e.to);
    }
  };
  const depthOf = (w: World): number => Math.max(...Object.values(w.locations).map((l) => l.gen?.depth ?? 0));

  it('has no road past its edge while CINDERJAW lives, however far she walks', () => {
    const w = createWorld({ seed: 'sealed' });
    walkOut(w);
    expect(depthOf(w)).toBe(START_DEPTH);
    const edge = Object.values(w.locations).filter((l) => l.gen?.cordon);
    expect(edge.length).toBeGreaterThan(0);
    for (const l of edge) {
      expect(l.gen!.role).toBe('street');
      expect(l.blurb).toMatch(/cordon/);
      expect(l.exits.some((e) => w.locations[e.to]?.gen?.role === 'street' && w.locations[e.to]!.gen!.parent === l.id)).toBe(false);
    }
  });

  it('opens onto the rest of Neo, at a higher danger, once the gate is open', () => {
    const w = createWorld({ seed: 'lift' });
    walkOut(w, 150);
    const edge = Object.values(w.locations).filter((l) => l.gen?.cordon);
    liftCordon(w);
    expect(w.legacy.gate).toBe('open');
    for (const l of edge) {
      expect(l.gen!.cordon).toBe(false);
      expect(l.exits.some((e) => w.locations[e.to]?.gen?.role === 'street' && w.locations[e.to]!.gen!.parent === l.id)).toBe(true);
    }
    walkOut(w, 250);
    expect(depthOf(w)).toBeGreaterThan(START_DEPTH);
    const beyond = Object.values(w.locations).filter((l) => l.gen?.role === 'street' && l.gen.depth === START_DEPTH + 1);
    expect(beyond.length).toBeGreaterThan(0);
    const mean = beyond.reduce((a, l) => a + dangerOf(l), 0) / beyond.length;
    expect(mean).toBeGreaterThan(10);
  });

  it('a world made with the gate open never has a cordon', () => {
    const w = createWorld({ seed: 'open' });
    w.legacy.gate = 'open';
    walkOut(w, 150);
    expect(depthOf(w)).toBeGreaterThan(START_DEPTH);
    expect(Object.values(w.locations).some((l) => l.gen?.cordon)).toBe(false);
  });

  it('puts the cordon on a map grown without one, and gives the roads back when it lifts', () => {
    const w = createWorld({ seed: 'retro' });
    w.legacy.gate = 'open';
    walkOut(w, 250);
    const reachable = (): Set<Id> => {
      const seen = new Set<Id>(['street_main']);
      const queue: Id[] = ['street_main'];
      while (queue.length) for (const e of w.locations[queue.shift()!]!.exits) if (!seen.has(e.to)) (seen.add(e.to), queue.push(e.to));
      return seen;
    };
    const deep = Object.values(w.locations).filter((l) => l.gen && l.gen.depth > START_DEPTH).map((l) => l.id);
    expect(deep.length).toBeGreaterThan(0);
    delete w.legacy.gate;
    sealCordon(w);
    const now = reachable();
    expect(deep.filter((id) => now.has(id))).toEqual([]);
    liftCordon(w);
    const later = reachable();
    expect(deep.filter((id) => !later.has(id)).length).toBeLessThan(deep.length / 2);
  });

  it('gives every street a danger that rises from the heart and is steady between neighbours', () => {
    const w = createWorld({ seed: 'danger' });
    w.legacy.gate = 'open';
    walkOut(w, 400);
    const streets = Object.values(w.locations).filter((l) => l.gen?.role === 'street');
    let hops = 0;
    let small = 0;
    for (const l of streets) {
      expect(l.gen!.danger).toBeDefined();
      const parent = w.locations[l.gen!.parent]!;
      if (!parent.gen) continue;
      hops++;
      if (Math.abs(l.gen!.danger! - parent.gen.danger!) <= 8) small++;
    }
    expect(small / hops).toBeGreaterThan(0.75); // smooth, with the odd cliff
    const at = (d: number) => streets.filter((l) => l.gen!.depth === d).map((l) => l.gen!.danger!);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(at(START_DEPTH))).toBeGreaterThan(avg(at(1)));
  });

  it('puts rooms and lots at the danger of their street', () => {
    const w = createWorld({ seed: 'lots' });
    walkOut(w, 80);
    for (const l of Object.values(w.locations)) {
      if (!l.gen || l.gen.role === 'street' || l.gen.role === 'tunnel') continue;
      expect(l.gen.danger, l.id).toBe(dangerOf(w.locations[l.gen.parent]));
    }
  });
});
