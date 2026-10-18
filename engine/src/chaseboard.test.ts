import { describe, expect, it } from 'vitest';
import { Rng, createWorld, type GameEvent, type World } from './index';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { MAKES } from './cars';
import { onFoot, runChase, type Chaser } from './chase';
import { chaserTile, localSqueeze, openBoard, outsFrom, pinches, tileAt, type ChaseBoard } from './chaseboard';
import { typeFromName } from './streettypes';
import { passable } from './grid';
import { relocate } from './combat';
import type { Ctx, Location } from './types';

const ctxOf = (w: World, rng: Rng): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};
const guy = (w: World, id: string) => {
  const n = spawnNpc(new Rng(id), id, 'ganger', w.hero.locationId);
  addNpc(w, n);
  return n;
};
const world = (seed: string) => {
  const w = createWorld({ seed, competence: 0.6 });
  w.hero.level = 6;
  w.hero.maxHp = w.hero.hp = 155;
  w.clock = 22 * 60;
  relocate(w, 'street_main');
  return w;
};
const carFoe = (w: World, id: string, gap: number): Chaser => {
  const mk = MAKES.civilian[0]!;
  return { name: `a ${mk.name}`, crew: [guy(w, id)], car: { id: `car-${id}`, body: mk.body ?? 'car', kind: 'civilian', name: mk.name, hp: mk.maxHp, maxHp: mk.maxHp, armor: mk.armor }, pace: mk.pace, gap, alive: true };
};

describe('a chase on the street', () => {
  it('has her on a line along the street, a tile at a time, with each chaser that far back along it', () => {
    let streets = 0;
    let rounds = 0;
    for (let i = 0; i < 40; i++) {
      const w = world(`cb${i}`);
      const { c } = ctxOf(w, new Rng(`cb${i}`));
      const foes = i % 2 ? [onFoot(guy(w, `f${i}`), 4)] : [carFoe(w, `c${i}`, 5)];
      const seenOn = new Map<ChaseBoard, number>();
      runChase(c, {
        mode: 'pursued', cause: 'test', foes, maxRounds: 6,
        watch: (cb, round) => {
          if (!cb) return;
          rounds++;
          const g = cb.placed.layout.grid;
          // The line is made of walkable tiles, one step apart.
          for (const [k, p] of cb.path.entries()) {
            expect(passable(g, p.x, p.y), `${cb.loc} ${p.x},${p.y}`).toBe(true);
            if (k) expect(Math.max(Math.abs(p.x - cb.path[k - 1]!.x), Math.abs(p.y - cb.path[k - 1]!.y))).toBe(1);
          }
          // She is where the line says, and no further along it than the last time.
          expect(cb.placed.board.hero).toEqual(tileAt(cb, cb.s));
          expect(cb.s).toBeGreaterThanOrEqual(seenOn.get(cb) ?? 0);
          seenOn.set(cb, cb.s);
          for (const f of foes) {
            const t = chaserTile(cb, f.gap);
            expect(passable(g, t.at.x, t.at.y)).toBe(true);
            if (f.gap <= cb.s) expect(t.off).toBe(false);
          }
          expect(round).toBeGreaterThan(0);
        },
      });
      streets += seenOn.size;
    }
    expect(rounds).toBeGreaterThan(40);
    expect(streets).toBeGreaterThan(40);
  });
});

/** A street of this kind hung off street_main, with a couple of other streets and some places on it, and her standing on it. */
function onStreet(seed: string, name: string, o: { alleyTo?: boolean } = {}) {
  const w = world(seed);
  const base = w.locations.street_main!;
  const id = 'T_street';
  const exits: Location['exits'] = [];
  const here: Location = { ...base, id, name, street: typeFromName(name, true), hex: { q: 0, r: 0, dir: 0, cells: [[0, 0], [1, 0]] }, exits, links: [], gen: { role: 'street', parent: 'street_main', slot: 0, depth: 1, district: 'tenement', expanded: true }, cameras: 0, populated: true, crowded: false };
  w.locations[id] = here;
  const add = (to: Location, label: string) => {
    w.locations[to.id] = to;
    exits.push({ to: to.id, label, hidden: false, gate: null });
    to.exits.push({ to: id, label: 'back', hidden: false, gate: null });
  };
  add({ ...base, id: 'T_west', name: 'Other Street', street: 'street', hex: { q: -3, r: 0, dir: 0, cells: [[-3, 0]] }, exits: [], links: [] }, 'on west');
  add({ ...base, id: 'T_east', name: 'Far Street', street: 'street', hex: { q: 3, r: 0, dir: 0, cells: [[3, 0]] }, exits: [], links: [] }, 'on east');
  if (o.alleyTo) add({ ...base, id: 'T_alley', name: 'Back Alley', street: 'alley', hex: { q: 0, r: 3, dir: 0, cells: [[0, 3]] }, exits: [], links: [] }, 'an alley');
  for (let k = 0; k < 3; k++) add({ ...base, id: `T_shop${k}`, name: 'A shop', kind: 'shop', outdoors: false, street: undefined, exits: [], links: [] }, `a shop ${k}`);
  relocate(w, id);
  return { w, id };
}

describe('how the street is round her', () => {
  it('a narrow way is tighter than a broad one, and a knot of walls and things pinches', () => {
    let alley = 0;
    let avenue = 0;
    let pinched = 0;
    for (let i = 0; i < 10; i++) {
      const a = onStreet(`sq-a${i}`, 'Cinder Alley');
      const b = onStreet(`sq-b${i}`, 'Grand Avenue');
      const ca = openBoard(a.w, 'T_east')!;
      const cb = openBoard(b.w, 'T_east')!;
      alley += localSqueeze(ca);
      avenue += localSqueeze(cb);
      pinched += pinches(ca);
    }
    expect(alley).toBeGreaterThan(avenue);
    expect(pinched).toBeGreaterThan(0);
  });

  it('there are doorways, side streets and ways up within a few tiles, nearest first, and the way on is not one of them', () => {
    let doors = 0;
    let mouths = 0;
    let ups = 0;
    for (let i = 0; i < 12; i++) {
      const { w } = onStreet(`outs${i}`, i % 2 ? 'Hill Terrace' : 'Mill Street', { alleyTo: true });
      const cb = openBoard(w, 'T_east')!;
      for (let step = 0; step < cb.path.length; step += 4) {
        cb.s = step;
        const outs = outsFrom(w, cb, 12);
        for (const [k, o] of outs.entries()) {
          expect(o.to).not.toBe('T_east');
          if (k) expect(o.d).toBeGreaterThanOrEqual(outs[k - 1]!.d);
          if (o.kind === 'door') {
            doors++;
            expect(w.locations[o.to!]!.kind).not.toBe('street');
          }
          if (o.kind === 'mouth') mouths++;
          if (o.kind === 'up') ups++;
        }
      }
    }
    expect(doors).toBeGreaterThan(0);
    expect(mouths).toBeGreaterThan(0);
    expect(ups).toBeGreaterThan(0);
  });

  it('she can lose them through a door, and then she is inside', () => {
    let through = 0;
    let alleys = 0;
    for (let i = 0; i < 200; i++) {
      const { w } = onStreet(`duck${i}`, 'Mill Street', { alleyTo: true });
      const { c, events } = ctxOf(w, new Rng(`duck${i}`));
      const r = runChase(c, { mode: 'pursued', cause: 'test', foes: [onFoot(guy(w, `d${i}`), 4)], maxRounds: 8 });
      const lost = events.filter((e) => e.type === 'chase_round' && String(e.data.events).includes('lost:'));
      if (r === 'escaped' && lost.length) {
        const how = String(lost[0]!.data.events);
        if (how.includes('lost:door')) {
          through++;
          expect(w.locations[w.hero.locationId]!.kind).not.toBe('street');
        } else if (how.includes('lost:mouth')) {
          alleys++;
          expect(w.hero.locationId).toBe('T_alley');
        }
      }
    }
    expect(through + alleys).toBeGreaterThan(0);
  });
});
