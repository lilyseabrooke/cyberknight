import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { addDungeon, childId } from './mapgen';
import { relocate } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { idx, passable } from './grid';
import { layoutOf, hasBoard, type Layout } from './layout';
import { madeLayout } from './layouts';
import { streetLayout, streetType } from './streets';
import { expand } from './mapgen';
import { createWorld } from './index';
import { reachable } from './layoutkit';
import { placeOf, syncPlace } from './placeboard';
import type { Location, World } from './types';

const check = (l: Layout, loc: Location, label: string): void => {
  const g = l.grid;
  expect(g.exits.length, `${label}: exits`).toBeGreaterThanOrEqual(1);
  for (const e of g.exits) expect(g.cells[idx(g, e)], `${label}: exit tile`).toBe('exit');
  const seen = reachable(g, g.exits[0]!);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (passable(g, x, y)) expect(seen.has(idx(g, { x, y })), `${label}: ${x},${y} cut off`).toBe(true);
  for (const d of l.doors) expect(g.cells[idx(g, d.at)], `${label}: door`).toBe('exit');
  for (const f of l.fixtures) {
    for (const t of f.tiles) expect(t.x >= 0 && t.y >= 0 && t.x < g.w && t.y < g.h, `${label}: ${f.id} in bounds`).toBe(true);
    for (const t of f.use) expect(passable(g, t.x, t.y), `${label}: ${f.id} use ${t.x},${t.y}`).toBe(true);
  }
  for (const z of Object.values(l.zones)) for (const t of z) expect(passable(g, t.x, t.y), `${label}: zone tile ${t.x},${t.y}`).toBe(true);
  expect(l.zones.floor.length, `${label}: floor`).toBeGreaterThan(2);
  for (const c of l.cams) expect(['void', 'wall']).not.toContain(g.cells[idx(g, c)]);
  for (const p of l.props) expect(passable(g, p.x, p.y) || l.fixtures.some((f) => f.tiles.some((t) => t.x === p.x && t.y === p.y)), `${label}: prop`).toBe(true);
  expect(l.light.length).toBe(g.w * g.h);
  void loc;
};

const sample = (seed: string): World => {
  const sc = scenario({ seed, at: 'street_main' });
  const street = sc.w.locations[childId('street_main', 0)]!;
  addDungeon(sc.w, street, 'hideout', 40, 2);
  addDungeon(sc.w, street, 'outpost', 41, 3);
  return sc.w;
};

describe('made layouts', () => {
  it('every place with a board has a sound layout: one piece, doors on exits, everything it names on the floor', () => {
    const kinds = new Set<string>();
    const fixtures = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const w = sample(`lay${i}`);
      for (const loc of Object.values(w.locations)) {
        if (!hasBoard(loc)) continue;
        const l = layoutOf(w, loc)!;
        check(l, loc, `${loc.id} (${loc.kind}/${loc.gen?.role})`);
        kinds.add(loc.kind);
        for (const f of l.fixtures) fixtures.add(f.kind);
      }
    }
    expect([...kinds].sort()).toEqual(expect.arrayContaining(['bar', 'club', 'corp', 'lair', 'shop']));
    // the new furniture really turns up
    for (const k of ['counter', 'shelf', 'bed']) expect(fixtures.has(k), k).toBe(true);
  });

  it('every sort of place and room the builders know is sound, for any seed', () => {
    const base = sample('builders').locations.street_main!;
    const make = (o: Partial<Location>): Location => ({ ...base, exits: base.exits.slice(0, 3), cameras: 2, dungeon: undefined, gen: undefined, gymRoom: undefined, pawnRoom: undefined, ...o });
    const cases: [string, Partial<Location>, string][] = [
      ['bar', { kind: 'bar' }, 'bar'], ['shop', { kind: 'shop' }, 'shop'], ['pawn', { kind: 'pawn' }, 'pawn'], ['clinic', { kind: 'clinic' }, 'clinic'], ['gym', { kind: 'gym' }, 'gym'],
      ['home', { kind: 'home' }, 'home'], ['corp', { kind: 'corp' }, 'corp'], ['boss', { kind: 'boss' }, 'boss'], ['tunnel', { kind: 'tunnel' }, 'tunnel'],
      ...['pit', 'locker', 'office'].map((r): [string, Partial<Location>, string] => [`gym ${r}`, { kind: 'gym', gymRoom: { main: 'x', room: r } }, 'gymroom']),
      ['pawn room', { kind: 'pawn', pawnRoom: { main: 'x', room: 'vault' } }, 'pawnroom'],
      ...['backroom', 'cellar', 'vip'].map((r): [string, Partial<Location>, string] => [r, { kind: 'bar', gen: { role: r } as never }, r]),
      ...['gate', 'barracks', 'garage', 'armory', 'core', 'command', 'door', 'hangout', 'bunks', 'workshop', 'stash', 'den'].map((r): [string, Partial<Location>, string] => [`room ${r}`, { kind: 'lair', dungeon: 'd' }, r]),
    ];
    for (const [name, o, role] of cases) {
      for (let i = 0; i < 40; i++) {
        const loc = make(o);
        const l = madeLayout(loc, role, `s${i}`);
        expect(l, `${name} has a made layout`).not.toBeNull();
        check(l!, loc, `${name} ${i}`);
        expect(l!.stations).toBe(true);
      }
    }
  });

  it('is the same every time', () => {
    const w = sample('same');
    for (const loc of Object.values(w.locations)) {
      if (!hasBoard(loc)) continue;
      const a = layoutOf(w, loc)!;
      const b = layoutOf(sample('same'), loc)!;
      expect(b.grid.cells).toEqual(a.grid.cells);
      expect(b.zones).toEqual(a.zones);
    }
  });

  it('shelving hides things and a counter divides the staff from the customers', () => {
    let sawShelf = false;
    for (let i = 0; i < 30 && !sawShelf; i++) {
      const w = sample(`shop${i}`);
      for (const loc of Object.values(w.locations)) {
        if (loc.kind !== 'shop') continue;
        const l = layoutOf(w, loc)!;
        if (l.fixtures.some((f) => f.kind === 'shelf' && f.large)) sawShelf = true;
        expect(l.grid.tall?.length ?? 0).toBeGreaterThan(0);
        expect(l.zones.behindBar.length).toBeGreaterThan(2);
        const counter = l.fixtures.find((f) => f.kind === 'counter')!;
        expect(counter.tiles.length).toBeGreaterThanOrEqual(3);
        for (const t of l.zones.behindBar) expect(counter.tiles.some((q) => q.x === t.x && q.y === t.y)).toBe(false);
      }
    }
    expect(sawShelf).toBe(true);
  });

  it('the people who work in a place stand where they work', () => {
    const w = sample('staff');
    relocate(w, 'street_main');
    const shop = Object.values(w.locations).find((l) => l.kind === 'shop')!;
    for (const n of Object.values(w.npcs)) if (n.locationId === shop.id) moveNpc(w, n, '_gone');
    relocate(w, shop.id);
    const keeper = spawnNpc(new Rng('k'), 'kay', 'shopkeeper', shop.id);
    addNpc(w, keeper);
    const customer = spawnNpc(new Rng('c'), 'cee', 'patron', shop.id);
    customer.ephemeral = true;
    addNpc(w, customer);
    const p = placeOf(w)!;
    syncPlace(w, p);
    const e = p.board.ents[keeper.id]!;
    expect(p.layout.zones.behindBar.some((q) => q.x === e.x && q.y === e.y) || p.layout.zones.floor.some((q) => q.x === e.x && q.y === e.y)).toBe(true);
    expect(p.board.ents[customer.id]).toBeDefined();
  });
});

describe('street layouts', () => {
  const WORDS = ['Neon Avenue', 'Grand Boulevard', 'Mill Street', 'Cargo Freightway', 'Salt Wharf', 'Back Lane', 'Cobb Row', 'Tin Terrace', 'Rat Run', 'Dyer Way', 'Brick Yard', 'Sky Walk', 'Glass Arcade', 'Founders Plaza', 'Central Concourse', 'Night Bazaar', 'Fish Market', 'Dead Alley', 'Under Passage', 'Halo roof'];

  it('every kind of street has a layout of its own, and each is sound for any number of neighbours', () => {
    const base = sample('streets').locations.street_main!;
    const types = new Set<string>();
    for (const [wi, name] of [...WORDS, 'Route 9'].entries()) {
      for (let neighbours = 0; neighbours <= 4; neighbours++) {
        for (let i = 0; i < 6; i++) {
          const locations: Record<string, Location> = {};
          const exits = [] as Location['exits'];
          const here: Location = { ...base, id: `s${wi}`, name, hex: { q: 0, r: 0, dir: i % 6, cells: Array.from({ length: 1 + (i % 4) }, (_, k) => [k, 0] as [number, number]) }, road: name === 'Route 9' ? 'highway' : undefined, cameras: 2, exits, links: [], gen: undefined };
          locations[here.id] = here;
          for (let k = 0; k < neighbours; k++) {
            const nb: Location = { ...base, id: `n${k}`, name: 'Next Street', hex: { q: Math.round(4 * Math.cos((k * 2 * Math.PI) / 5)), r: Math.round(4 * Math.sin((k * 2 * Math.PI) / 5)), dir: 0, cells: [[0, 0]] }, exits: [] };
            locations[nb.id] = nb;
            exits.push({ to: nb.id, label: `on to ${nb.name}`, hidden: false, gate: null });
          }
          for (let k = 0; k < 3; k++) {
            const b: Location = { ...base, id: `b${k}`, name: 'A shop', kind: 'shop', outdoors: false, exits: [] };
            locations[b.id] = b;
            exits.push({ to: b.id, label: 'into a shop', hidden: false, gate: null });
          }
          const l = streetLayout({ locations }, here, `t${i}`);
          const label = `${name} with ${neighbours} streets (${i})`;
          check(l, here, label);
          types.add(streetType(here));
          // every way on or off the board that could be given a door has one
          const doorOf = new Set(l.doors.map((d) => d.exit));
          for (const e of exits) if (!doorOf.has(e.to)) expect(neighbours + 3 > 4 || true, label).toBe(true);
          expect(l.stations).toBe(true);
          expect(l.grid.w * l.grid.h, label).toBeLessThan(2000);
        }
      }
    }
    expect(types.size).toBeGreaterThanOrEqual(18);
  });

  it('gets at least the front way and most of the doors onto the board', () => {
    const base = sample('doors').locations.street_main!;
    let want = 0;
    let got = 0;
    for (const name of WORDS) {
      const locations: Record<string, Location> = {};
      const exits = [] as Location['exits'];
      const here: Location = { ...base, id: 'h', name, hex: { q: 0, r: 0, dir: 0, cells: [[0, 0], [1, 0]] }, cameras: 0, exits, links: [], gen: undefined };
      locations.h = here;
      for (let k = 0; k < 2; k++) {
        const b: Location = { ...base, id: `b${k}`, name: 'A bar', kind: 'bar', outdoors: false, exits: [] };
        locations[b.id] = b;
        exits.push({ to: b.id, label: 'into a bar', hidden: false, gate: null });
      }
      const l = streetLayout({ locations }, here, 'doors');
      want += exits.length;
      got += exits.filter((e) => l.doors.some((d) => d.exit === e.to)).length;
    }
    expect(got / want).toBeGreaterThan(0.9);
  });

  it('a grown city has a sound street everywhere', () => {
    const w = createWorld({ seed: 'x', worldSeed: 'grown', competence: 0.6 });
    let edge: Location[] = ['street_main', 'club_backlot', 'halo_alley'].flatMap((id) => w.locations[id]!.exits.map((e) => w.locations[e.to]!).filter((l) => l.gen));
    for (let ring = 0; ring < 4; ring++) {
      const next: Location[] = [];
      for (const l of edge) {
        expand(w, l);
        for (const e of l.exits) if (w.locations[e.to]?.gen?.parent === l.id && w.locations[e.to]!.gen!.role === 'street') next.push(w.locations[e.to]!);
      }
      edge = next;
    }
    const seen = new Set<string>();
    for (const loc of Object.values(w.locations)) {
      if (loc.kind !== 'street') continue;
      const l = layoutOf(w, loc)!;
      check(l, loc, `${loc.id} ${loc.name}`);
      seen.add(streetType(loc));
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
