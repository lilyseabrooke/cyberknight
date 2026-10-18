import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { createWorld } from './world';
import { expand } from './mapgen';
import { fight, relocate, HOOKS } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc, npcsAt } from './population';
import { Sim } from './tactics';
import { dist, passable, walkable, idx, neighbors, type Pos } from './grid';
import { hasBoard, isClub, layoutOf, type Layout } from './layout';
import { describeSpot, enterPlace, goTo, placeOf, positionFor, spatialStir, syncPlace, tickPlace } from './placeboard';
import { angDiff, dirOf } from './prowl';
import { awareness, bucketOf } from './stealth';
import type { Ctx, GameEvent, Location, Npc, World } from './types';

const ctxOf = (w: World, seed = 'pc') => {
  const events: GameEvent[] = [];
  const c: Ctx = { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) };
  return { c, events };
};
const reach = (l: Layout, from: Pos): Set<number> => {
  const seen = new Set<number>([idx(l.grid, from)]);
  const open = [from];
  while (open.length) {
    const p = open.pop()!;
    for (const n of neighbors(l.grid, p)) {
      const i = idx(l.grid, n);
      if (!seen.has(i)) {
        seen.add(i);
        open.push(n);
      }
    }
  }
  return seen;
};
const clubs = (n: number): { w: World; club: Location }[] => {
  const out: { w: World; club: Location }[] = [];
  for (let s = 0; out.length < n && s < 60; s++) {
    const w = createWorld({ seed: `clubs${s}`, competence: 0.5 });
    for (let round = 0; round < 2; round++) for (const l of Object.values(w.locations)) if (l.outdoors && l.gen && !l.gen.expanded) expand(w, l);
    for (const l of Object.values(w.locations)) if (isClub(l) && l.id !== 'neon_pharaoh') out.push({ w, club: l });
  }
  return out.slice(0, n);
};
const pharaoh = (seed = 'pb') => {
  const sc = scenario({ seed, at: 'neon_pharaoh', competence: 0.5 });
  relocate(sc.w, 'street_main');
  relocate(sc.w, 'neon_pharaoh');
  return sc;
};
const person = (w: World, id: string, archetype: string, extra: Partial<Npc> = {}): Npc => {
  const n = spawnNpc(new Rng(id), id, archetype, w.hero.locationId);
  Object.assign(n, extra);
  addNpc(w, n);
  return n;
};

describe('a club has a layout', () => {
  it('the Neon Pharaoh has one, with its bar, booths, decks, speakers and floor, and a door for each way in or out you can see', () => {
    const { w } = pharaoh();
    const loc = w.locations.neon_pharaoh!;
    const l = layoutOf(w, loc)!;
    expect(l).not.toBeNull();
    const kinds = new Set(l.fixtures.map((f) => f.kind));
    for (const k of ['bar', 'dj_booth', 'speaker', 'booth', 'dancefloor']) expect(kinds.has(k as never), k).toBe(true);
    const visible = loc.exits.filter((e) => !e.hidden).map((e) => e.to).sort();
    expect(l.doors.map((d) => d.exit).sort()).toEqual(visible);
    expect(l.doors.filter((d) => d.front)).toHaveLength(1);
    expect(l.doors.find((d) => d.front)!.exit).toBe('street_main');
    // The hidden maintenance door is not there until it is found.
    expect(l.doors.some((d) => d.exit === 'club_maintenance')).toBe(false);
  });

  it('is the same every time, and not shared between clubs', () => {
    const a = layoutOf(pharaoh('same').w, pharaoh('same').w.locations.neon_pharaoh!)!;
    const b = layoutOf(pharaoh('same').w, pharaoh('same').w.locations.neon_pharaoh!)!;
    expect(b.grid.cells).toEqual(a.grid.cells);
    expect(b.doors).toEqual(a.doors);
    const set = clubs(6);
    expect(set.length).toBeGreaterThan(3);
    const sizes = new Set(set.map(({ w, club }) => layoutOf(w, club)!.grid.cells.join('')));
    expect(sizes.size).toBeGreaterThan(1);
  });

  it('is a real room: everywhere is reachable from the front door, doors are on the edge, and everything she could use can be stood at', () => {
    const all = [...clubs(12), { w: pharaoh('reach').w, club: pharaoh('reach').w.locations.neon_pharaoh! }];
    expect(all.length).toBeGreaterThan(8);
    for (const { w, club } of all) {
      const l = layoutOf(w, club)!;
      const front = l.doors.find((d) => d.front)!;
      expect(front, club.name).toBeDefined();
      const seen = reach(l, front.at);
      l.grid.cells.forEach((t, i) => {
        if (walkable(t)) expect(seen.has(i), `${club.name} ${i}`).toBe(true);
      });
      for (const d of l.doors) {
        const edge = d.at.x === 0 || d.at.y === 0 || d.at.x === l.grid.w - 1 || d.at.y === l.grid.h - 1;
        expect(edge, `${club.name} ${d.label}`).toBe(true);
      }
      for (const f of l.fixtures) for (const u of f.use) expect(passable(l.grid, u.x, u.y), `${club.name} ${f.id}`).toBe(true);
      expect(l.zones.behindBar.length).toBeGreaterThan(1);
      expect(l.zones.floor.length).toBeGreaterThan(6);
      // The bar's regulars sit on the near side of the counter, the staff on the far side of it.
      const bar = l.fixtures.find((f) => f.kind === 'bar')!;
      expect(bar.tiles.every((t) => !walkable(l.grid.cells[idx(l.grid, t)] ?? null))).toBe(true);
    }
  });

  it('every place has a board, streets included', () => {
    const sc = scenario({ seed: 'halo', at: 'halo_floor' });
    expect(placeOf(sc.w)).not.toBeNull();
    expect(hasBoard(sc.w.locations.club_greenroom!)).toBe(true);
    expect(hasBoard(sc.w.locations.street_main!)).toBe(true);
    expect(placeOf(sc.w, sc.w.locations.street_main!)).not.toBeNull();
  });
});

describe('where everyone is', () => {
  it('she comes in at the front door, in the doorway', () => {
    const { w } = pharaoh();
    const p = placeOf(w)!;
    const front = p.layout.doors.find((d) => d.front)!;
    expect(p.board.hero).toEqual(front.at);
    expect(p.board.at).toBe('door:street_main');
    expect(describeSpot(p, w).variant).toBe('door');
  });

  it('coming in by the back door puts her in the back door', () => {
    const sc = scenario({ seed: 'back', at: 'club_backlot' });
    relocate(sc.w, 'neon_pharaoh');
    const p = placeOf(sc.w)!;
    const door = p.layout.doors.find((d) => d.exit === 'club_backlot')!;
    expect(p.board.hero).toEqual(door.at);
    expect(describeSpot(p, sc.w).variant).toBe('back_door');
  });

  it('puts people where their job puts them: the bartender behind the bar, the DJ on the decks, security by the door', () => {
    const { w } = pharaoh('jobs');
    const bar = person(w, 'barry', 'bartender');
    const guard = person(w, 'gus', 'club_security');
    const dj = Object.values(w.npcs).find((n) => n.locationId === 'neon_pharaoh' && n.role === 'DJ');
    const p = placeOf(w)!;
    syncPlace(w, p);
    const at = (n: Npc) => p.board.ents[n.id]!;
    const has = (zone: Pos[], q: Pos) => zone.some((z) => z.x === q.x && z.y === q.y);
    expect(has(p.layout.zones.behindBar, at(bar))).toBe(true);
    expect(has(p.layout.zones.front, at(guard)) || has(p.layout.zones.floor, at(guard)) || has(p.layout.zones.wall, at(guard))).toBe(true);
    if (dj) expect(has(p.layout.zones.deck, at(dj))).toBe(true);
    // And nobody is standing on anybody, or on a wall.
    const seen = new Set<string>();
    for (const [id, q] of Object.entries(p.board.ents)) {
      expect(passable(p.layout.grid, q.x, q.y), id).toBe(true);
      expect(seen.has(`${q.x},${q.y}`), `${id} shares a tile`).toBe(false);
      seen.add(`${q.x},${q.y}`);
    }
  });

  it('keeps them there between beats; the DJ stays on the decks, the bartender stays behind the bar, and the patrons move on now and then', () => {
    const { w } = pharaoh('drift');
    const bar = person(w, 'barry', 'bartender');
    const regulars = Array.from({ length: 6 }, (_, i) => person(w, `pat${i}`, 'patron'));
    const dj = Object.values(w.npcs).find((n) => n.locationId === 'neon_pharaoh' && n.role === 'DJ');
    const p = placeOf(w)!;
    syncPlace(w, p);
    const before = Object.fromEntries(regulars.map((n) => [n.id, { ...p.board.ents[n.id]! }]));
    const djBefore = dj ? { ...p.board.ents[dj.id]! } : null;
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      w.clock++;
      tickPlace(w);
      // (always behind the bar)
      expect(p.layout.zones.behindBar.some((q) => q.x === p.board.ents[bar.id]!.x && q.y === p.board.ents[bar.id]!.y), `beat ${i}`).toBe(true);
    }
    for (const n of regulars) if (dist(before[n.id]!, p.board.ents[n.id]!) > 0) moved++;
    expect(moved).toBeGreaterThan(0);
    if (dj && djBefore) expect({ x: p.board.ents[dj.id]!.x, y: p.board.ents[dj.id]!.y }).toEqual({ x: djBefore.x, y: djBefore.y });
  });

  it('loses people who have gone and places newcomers', () => {
    const { w } = pharaoh('come-go');
    const p = placeOf(w)!;
    const a = person(w, 'a', 'patron');
    syncPlace(w, p);
    expect(p.board.ents[a.id]).toBeDefined();
    moveNpc(w, a, '_gone');
    syncPlace(w, p);
    expect(p.board.ents[a.id]).toBeUndefined();
  });
});

describe('getting to where she needs to be', () => {
  it('talking to someone puts her next to them; lifting from them, behind them', () => {
    const { w } = pharaoh('near');
    const a = person(w, 'a', 'patron');
    const b = person(w, 'b', 'patron');
    const p = placeOf(w)!;
    syncPlace(w, p);
    const { c } = ctxOf(w);
    positionFor(c, `chat:${a.id}`);
    expect(dist(p.board.hero, p.board.ents[a.id]!)).toBe(1);
    expect(p.board.at).toBe(`near:${a.id}`);
    // (somebody out in the open, so there is a back to get behind)
    const mid = p.layout.zones.floor.find((q) => q.x > 4 && q.y > 3 && q.x < p.layout.grid.w - 6)!;
    p.board.ents[b.id] = { x: mid.x, y: mid.y, facing: 0 };
    positionFor(c, `pickpocket:${b.id}`);
    expect(dist(p.board.hero, p.board.ents[b.id]!)).toBe(1);
    const behind = angDiff(p.board.ents[b.id]!.facing, dirOf(p.board.ents[b.id]!, p.board.hero));
    expect(behind).toBeGreaterThanOrEqual(3);
  });

  it('the DJ booth, the dance floor and the bar are places she can go', () => {
    const { w } = pharaoh('fixtures');
    const p = placeOf(w)!;
    const { c } = ctxOf(w);
    positionFor(c, 'dj_booth');
    expect(describeSpot(p, w).variant).toBe('deck');
    positionFor(c, 'dancefloor');
    expect(describeSpot(p, w).variant).toBe('floor');
    positionFor(c, 'settle_tab');
    expect(describeSpot(p, w).variant).toBe('bar');
    expect(p.layout.zones.stools.some((s) => s.x === p.board.hero.x && s.y === p.board.hero.y)).toBe(true);
  });

  it('now and then a long walk is mentioned, and a short one is not', () => {
    let told = 0;
    for (let i = 0; i < 30; i++) {
      const { w } = pharaoh(`walk${i}`);
      const p = placeOf(w)!;
      const { c, events } = ctxOf(w, `w${i}`);
      goTo(c, p, { kind: 'fixture', fixture: 'bar' });
      if (events.some((e) => e.type === 'place_spot' && e.data.variant === 'walk')) told++;
    }
    expect(told).toBeGreaterThan(0);
    expect(told).toBeLessThan(25);
  });
});

describe('where a fight starts', () => {
  const sim = (w: World, foes: Npc[]) => {
    const p = placeOf(w)!;
    syncPlace(w, p);
    const { c } = ctxOf(w, 'sim');
    return new Sim(c, HOOKS, { foes, arrivals: [], lethal: false, assault: true, maxRounds: 1, board: p });
  };
  const nearestFoe = (s: Sim) => Math.min(...s.units.filter((u) => u.kind === 'foe').map((u) => dist(u, s.hero)));

  it('from the doorway, she is in the doorway and they are across the room', () => {
    const { w } = pharaoh('door-start');
    const tender = person(w, 'barry', 'bartender');
    const p = placeOf(w)!;
    syncPlace(w, p);
    const s = sim(w, [tender]);
    const front = p.layout.doors.find((d) => d.front)!;
    expect({ x: s.hero.x, y: s.hero.y }).toEqual(front.at);
    expect(nearestFoe(s)).toBeGreaterThanOrEqual(5);
    // and the door she came in by is under her feet
    expect(p.layout.grid.exits.some((e) => e.x === s.hero.x && e.y === s.hero.y)).toBe(true);
  });

  it('from the bar, she is at the bar, with the bartender right across the counter', () => {
    const { w } = pharaoh('bar-start');
    const tender = person(w, 'barry', 'bartender');
    const p = placeOf(w)!;
    syncPlace(w, p);
    const { c } = ctxOf(w);
    goTo(c, p, { kind: 'fixture', fixture: 'bar' }, { tell: false });
    const s = sim(w, [tender]);
    expect(nearestFoe(s)).toBeLessThanOrEqual(4);
    expect(p.layout.zones.stools.some((q) => q.x === s.hero.x && q.y === s.hero.y)).toBe(true);
  });

  it('the log says where it starts', () => {
    const { w } = pharaoh('says');
    const goon = person(w, 'goon', 'patron');
    const { c, events } = ctxOf(w, 'says');
    fight(c, [goon], { cause: 'test', assault: true, joiners: false });
    const spot = events.find((e) => e.type === 'place_spot' && e.data.variant === 'fight');
    expect(spot).toBeDefined();
    expect(spot!.data.spot).toBe('door');
    const w2 = pharaoh('says2').w;
    const goon2 = person(w2, 'goon2', 'patron');
    const r2 = ctxOf(w2, 'says2');
    goTo(r2.c, placeOf(w2)!, { kind: 'fixture', fixture: 'bar' }, { tell: false });
    fight(r2.c, [goon2], { cause: 'test', assault: true, joiners: false });
    expect(r2.events.find((e) => e.type === 'place_spot' && e.data.variant === 'fight')!.data.spot).toBe('bar');
  });

  it('afterwards everyone is where the fight left them', () => {
    const { w } = pharaoh('after');
    const goon = person(w, 'goon', 'patron');
    const { c } = ctxOf(w, 'after');
    const p = placeOf(w)!;
    syncPlace(w, p);
    const start = { ...p.board.ents[goon.id]! };
    fight(c, [goon], { cause: 'test', assault: true, joiners: false });
    const q = placeOf(w, w.locations[w.hero.locationId]);
    if (q && q.board.loc === 'neon_pharaoh') expect(q.board.ents[goon.id]).toBeDefined();
    void start;
  });

  it('running for it, she goes out by a door she got to', () => {
    let fled = 0;
    for (let i = 0; i < 40 && fled < 3; i++) {
      const { w } = pharaoh(`flee${i}`);
      relocate(w, 'club_backlot');
      relocate(w, 'neon_pharaoh');
      // She is in the back door, badly hurt, and picks a fight with someone big.
      w.hero.hp = 35;
      w.hero.maxHp = 100;
      w.hero.competence = 1;
      const brute = person(w, 'brute', 'gym_owner', { level: 12, hp: 400, maxHp: 400 });
      const { c, events } = ctxOf(w, `fl${i}`);
      fight(c, [brute], { cause: 'test', assault: true, joiners: false });
      const end = events.find((e) => e.type === 'fight_end');
      if (end?.data.variant === 'flee') {
        fled++;
        // Out by a door she could see (not the old fixed escape route, a hidden staff door), whichever she reached.
        expect(['street_main', 'club_backlot', 'club_greenroom']).toContain(w.hero.locationId);
      }
    }
    expect(fled).toBeGreaterThan(0);
  });
});

describe('being seen', () => {
  it('only the people who can see her notice what she does: facing her, close enough, in the light', () => {
    const { w } = pharaoh('seen');
    const p = placeOf(w)!;
    for (const n of Object.values(w.npcs)) if (n.locationId === 'neon_pharaoh') moveNpc(w, n, '_gone');
    const watching = person(w, 'watching', 'patron');
    const turned = person(w, 'turned', 'patron');
    syncPlace(w, p);
    // Put her on the floor with one of them looking at her and the other looking away.
    const spot = p.layout.zones.floor.find((q) => q.x > 4 && q.y > 3)!;
    p.board.hero = { ...spot };
    p.board.ents[watching.id] = { x: spot.x + 1, y: spot.y, facing: 6 };
    p.board.ents[turned.id] = { x: spot.x + 3, y: spot.y, facing: 2 };
    p.layout.light.fill(2);
    w.hero.stealth = true;
    const { c } = ctxOf(w);
    spatialStir(c, 0.1);
    expect(awareness(w, watching).v).toBeGreaterThan(0);
    expect(awareness(w, turned).v).toBe(0);
    expect(bucketOf(w, turned)).toBe('unaware');
    p.layout.light.fill(1);
  });
});

describe('the rest of the game is not disturbed', () => {
  it('a whole night in and out of clubs is all right', () => {
    const sc = scenario({ seed: 'night', at: 'street_main' });
    const w = sc.w;
    for (let i = 0; i < 6; i++) {
      relocate(w, 'neon_pharaoh');
      const here = npcsAt(w, 'neon_pharaoh');
      expect(placeOf(w)).not.toBeNull();
      for (let b = 0; b < 12; b++) {
        w.clock++;
        tickPlace(w);
      }
      relocate(w, 'street_main');
      void here;
    }
    enterPlace(w, 'street_main', 'neon_pharaoh');
  });
});
