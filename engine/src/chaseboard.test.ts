import { describe, expect, it } from 'vitest';
import { Rng, createWorld, type GameEvent, type World } from './index';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { MAKES } from './cars';
import { onFoot, runChase, type Chaser } from './chase';
import { chaserTile, tileAt, type ChaseBoard } from './chaseboard';
import { passable } from './grid';
import { relocate } from './combat';
import type { Ctx } from './types';

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
