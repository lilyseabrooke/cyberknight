import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { addDungeon, childId } from './mapgen';
import { relocate } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { dist, idx } from './grid';
import { standing } from './dungeons';
import { patrolPeriod, placeOf, routeAt, seesHer, syncPlace, tickPlace } from './placeboard';
import { advanceHabits, makeUnit, type Board, type Light } from './prowl';
import type { Pos } from './grid';
import type { Npc, World } from './types';

const person = (w: World, id: string, archetype = 'patron'): Npc => {
  const n = spawnNpc(new Rng(id), id, archetype, w.hero.locationId);
  n.level = 3;
  addNpc(w, n);
  return n;
};
const hideout = (seed: string) => {
  const sc = scenario({ seed, at: 'street_main', competence: 0.5 });
  const street = sc.w.locations[childId('street_main', 0)]!;
  const entrance = addDungeon(sc.w, street, 'hideout', 40, 2);
  relocate(sc.w, entrance.id);
  const d = sc.w.dungeons[entrance.id]!;
  const room = d.rooms.find((r) => standing(sc.w, d, r.id).length >= 2)!;
  relocate(sc.w, room.id);
  return { w: sc.w, d, loc: sc.w.locations[room.id]! };
};
const pharaoh = (seed: string) => {
  const sc = scenario({ seed, at: 'street_main' });
  relocate(sc.w, 'neon_pharaoh');
  return sc.w;
};
const at = (e: { x: number; y: number }): string => `${e.x},${e.y}`;

describe('a round, as a function of the clock', () => {
  const path: Pos[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];

  it('goes there, waits, comes back, waits, and starts again', () => {
    const total = 2 + 3 + 3 + 3;
    const seen: string[] = [];
    for (let t = 0; t < total; t++) seen.push(at(routeAt(path, 2, 3, t).at));
    expect(seen).toEqual(['0,0', '0,0', '1,0', '2,0', '3,0', '3,0', '3,0', '3,0', '2,0', '1,0', '0,0']);
    for (let t = 0; t < 40; t++) expect(at(routeAt(path, 2, 3, t).at)).toBe(at(routeAt(path, 2, 3, t + total).at));
  });

  it('is never more than a step from where it was a tick ago, and faces the way it is going', () => {
    let prev = routeAt(path, 1, 2, 0).at;
    for (let t = 1; t < 60; t++) {
      const r = routeAt(path, 1, 2, t);
      expect(dist(prev, r.at)).toBeLessThanOrEqual(1);
      if (!r.rest && dist(prev, r.at) === 1) expect(r.dir).toBe(r.leg === 0 ? 2 : 6);
      prev = r.at;
    }
  });
});

describe('guards on a beat', () => {
  it('walk it as the beats go by, without anyone stepping them', () => {
    const { w, d, loc } = hideout('beat');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const walkers = standing(w, d, loc.id).filter((n) => p.board.ents[n.id]?.route);
    if (!walkers.length) return;
    const w0 = walkers[0]!;
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      w.clock++;
      tickPlace(w);
      seen.add(at(p.board.ents[w0.id]!));
    }
    expect(seen.size).toBeGreaterThan(2);
    // always on a tile she could walk
    for (const key of seen) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      expect(p.layout.grid.cells[idx(p.layout.grid, { x, y })]).not.toBe('cover');
      expect(p.layout.grid.cells[idx(p.layout.grid, { x, y })]).not.toBe('wall');
    }
  });

  it('are where the clock says whether or not anyone watched the beats between', () => {
    const a = hideout('pure');
    const b = hideout('pure');
    const pa = placeOf(a.w, a.loc)!;
    const pb = placeOf(b.w, b.loc)!;
    syncPlace(a.w, pa);
    syncPlace(b.w, pb);
    const walkers = standing(a.w, a.d, a.loc.id).filter((n) => pa.board.ents[n.id]?.route);
    if (!walkers.length) return;
    // one steps through every beat and the other jumps
    for (let i = 0; i < 57; i++) {
      a.w.clock++;
      tickPlace(a.w);
    }
    b.w.clock += 57;
    syncPlace(b.w, pb);
    for (const n of walkers) {
      const x = pa.board.ents[n.id]!;
      const y = pb.board.ents[n.id]!;
      expect(at(y), n.name).toBe(at(x));
      expect(y.facing).toBe(x.facing);
    }
  });

  it('keep to a pattern she can learn: whether one sees her from where she stands comes round again every time round', () => {
    const w = pharaoh('learn');
    for (const n of Object.values(w.npcs)) if (n.locationId === 'neon_pharaoh') moveNpc(w, n, '_gone');
    const guard = person(w, 'gus', 'club_security');
    const p = placeOf(w)!;
    syncPlace(w, p);
    const period = patrolPeriod(w, p, guard.id)!;
    expect(period).toBeGreaterThan(3);
    const g = p.layout.grid;
    let learned = 0;
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const c = g.cells[idx(g, { x, y })];
        if (c === 'wall' || c === 'cover') continue;
        p.board.hero = { x, y };
        const sees: boolean[] = [];
        const start = w.clock;
        for (let t = 0; t < period * 2; t++) {
          w.clock = start + t;
          syncPlace(w, p);
          sees.push(seesHer(w, guard));
        }
        for (let t = 0; t < period; t++) expect(sees[t], `${x},${y} tick ${t}`).toBe(sees[t + period]);
        if (sees.includes(true) && sees.includes(false)) learned++;
      }
    }
    expect(learned).toBeGreaterThan(0);
  });

  it('do not walk through her', () => {
    const { w, d, loc } = hideout('through');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const walker = standing(w, d, loc.id).find((n) => p.board.ents[n.id]?.route);
    if (!walker) return;
    const e = p.board.ents[walker.id]!;
    for (let i = 0; i < 40; i++) {
      w.clock++;
      tickPlace(w);
      // stand where it was heading
      p.board.hero = { x: e.x, y: e.y };
      w.clock++;
      tickPlace(w);
      expect(at(e)).not.toBe(at(p.board.hero));
    }
  });

  it('go back to their rounds a little while after a scene leaves them mid-search', () => {
    const { w, d, loc } = hideout('resume');
    const p = placeOf(w, loc)!;
    syncPlace(w, p);
    const g = standing(w, d, loc.id)[0]!;
    const e = p.board.ents[g.id]!;
    e.behavior = 'search';
    e.last = { x: e.x, y: e.y };
    w.clock += 3;
    syncPlace(w, p);
    expect(p.board.ents[g.id]!.behavior).toBe('search');
    w.clock += 10;
    syncPlace(w, p);
    expect(['post', 'patrol']).toContain(p.board.ents[g.id]!.behavior);
    expect(p.board.ents[g.id]!.last).toBeNull();
  });

  it('their pauses are the same every time round, whatever the dice, so a beat can be timed in a scene too', () => {
    const run = (seed: string) => {
      const sc = scenario({ seed: 'pause', at: 'street_main' });
      const w = sc.w;
      w.hero.stealth = true;
      const n = person(w, 'walker');
      const grid = { w: 8, h: 3, cells: Array(24).fill('floor') as never, exits: [{ x: 0, y: 1 }] };
      const b: Board = { w, grid, light: Array<Light>(24).fill(1), units: [makeUnit(n, { x: 1, y: 1 }, 2, { route: [{ x: 1, y: 1 }, { x: 6, y: 1 }] })], hero: { x: 0, y: 2 }, posture: 'sneak', props: [], bodies: [], round: 1, dark: [], role: 'test' };
      const rng = new Rng(seed);
      const track: string[] = [];
      for (let i = 0; i < 40; i++) {
        advanceHabits(b, rng);
        track.push(at(b.units[0]!));
      }
      return track.join('|');
    };
    expect(run('a')).toBe(run('b'));
    expect(run('a')).toBe(run('zzz'));
  });
});

describe('a club\'s staff and patrons', () => {
  it('the bartender works up and down the bar, security walk the floor, and the DJ stays on the decks', () => {
    const w = pharaoh('staff');
    for (const n of Object.values(w.npcs)) if (n.locationId === 'neon_pharaoh') moveNpc(w, n, '_gone');
    const bar = person(w, 'barry', 'bartender');
    const guard = person(w, 'gus', 'club_security');
    const dj = person(w, 'kilo', 'dj');
    const p = placeOf(w)!;
    syncPlace(w, p);
    const tiles: Record<string, Set<string>> = { bar: new Set(), guard: new Set(), dj: new Set() };
    for (let i = 0; i < 60; i++) {
      w.clock++;
      tickPlace(w);
      tiles.bar!.add(at(p.board.ents[bar.id]!));
      tiles.guard!.add(at(p.board.ents[guard.id]!));
      tiles.dj!.add(at(p.board.ents[dj.id]!));
    }
    expect(tiles.bar!.size).toBeGreaterThan(1);
    for (const k of tiles.bar!) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      expect(p.layout.zones.behindBar.some((q) => q.x === x && q.y === y)).toBe(true);
    }
    expect(tiles.guard!.size).toBeGreaterThan(2);
    expect(tiles.dj!.size).toBe(1);
  });

  it('the patrons move on to different spots as the night goes, and never stand on each other', () => {
    const w = pharaoh('patrons');
    for (const n of Object.values(w.npcs)) if (n.locationId === 'neon_pharaoh') moveNpc(w, n, '_gone');
    const crowd = Array.from({ length: 9 }, (_, i) => person(w, `pat${i}`, 'patron'));
    const p = placeOf(w)!;
    syncPlace(w, p);
    const first = Object.fromEntries(crowd.map((n) => [n.id, at(p.board.ents[n.id]!)]));
    const changes = new Set<string>();
    for (let i = 0; i < 120; i++) {
      w.clock++;
      tickPlace(w);
      const seen = new Set<string>([at(p.board.hero)]);
      for (const n of crowd) {
        const k = at(p.board.ents[n.id]!);
        expect(seen.has(k), `beat ${i}: ${n.id} on someone`).toBe(false);
        seen.add(k);
        if (k !== first[n.id]) changes.add(n.id);
      }
    }
    expect(changes.size).toBeGreaterThan(3);
  });
});
void dist;
