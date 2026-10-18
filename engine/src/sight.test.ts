import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { relocate, fight } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { idx } from './grid';
import { placeOf, seesHer, syncPlace } from './placeboard';
import { awareness, bucketOf, enterStealth, exitStealth, tickStealth } from './stealth';
import type { Ctx, GameEvent, Npc, World } from './types';

/**
 * Only those who can see her have her. A person in the same room but behind a wall isn't aware of her, entering stealth doesn't
 * need cover for them, and what she does doesn't reach them.
 */

const ctxOf = (w: World, seed = 'sc') => {
  const events: GameEvent[] = [];
  const c: Ctx = { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) };
  return { c, events };
};
const person = (w: World, id: string, archetype = 'patron'): Npc => {
  const n = spawnNpc(new Rng(id), id, archetype, w.hero.locationId);
  n.level = 3;
  addNpc(w, n);
  return n;
};
/** A quiet room: a wall between her and one of them, another in the open, nobody else. */
const room = (seed: string) => {
  const sc = scenario({ seed, at: 'street_main' });
  const w = sc.w;
  relocate(w, 'halo_floor');
  for (const n of Object.values(w.npcs)) if (n.locationId === 'halo_floor') moveNpc(w, n, '_gone');
  w.locations.halo_floor!.cameras = 0;
  const open = person(w, 'open');
  const hidden = person(w, 'hidden');
  const p = placeOf(w)!;
  syncPlace(w, p);
  const g = p.layout.grid;
  // Flat floor, one row of wall with a gap-free line between her (0,2) and the hidden one (4,2).
  g.cells.fill('floor');
  for (const e of g.exits) g.cells[idx(g, e)] = 'exit';
  g.cells[idx(g, { x: 2, y: 2 })] = 'wall';
  g.cells[idx(g, { x: 2, y: 3 })] = 'wall';
  g.cells[idx(g, { x: 2, y: 1 })] = 'wall';
  p.layout.light.fill(2);
  p.board.hero = { x: 0, y: 2 };
  p.board.ents[open.id] = { x: 1, y: 2, facing: 6 };
  p.board.ents[hidden.id] = { x: 4, y: 2, facing: 6 };
  return { w, p, open, hidden };
};

describe('who can see her', () => {
  it('out of stealth, the ones with a clear line have her and the ones behind a wall do not', () => {
    const { w, open, hidden } = room('sees');
    expect(seesHer(w, open)).toBe(true);
    expect(seesHer(w, hidden)).toBe(false);
    expect(bucketOf(w, open)).toBe('aware');
    expect(bucketOf(w, hidden)).toBe('unaware');
  });

  it('it follows her about the room', () => {
    const { w, p, hidden } = room('moves');
    expect(bucketOf(w, hidden)).toBe('unaware');
    p.board.hero = { x: 4, y: 0 };
    expect(seesHer(w, hidden)).toBe(true);
    expect(bucketOf(w, hidden)).toBe('aware');
  });

  it('a place with no board to say counts everyone in the room, as before', () => {
    const sc = scenario({ seed: 'noboard', at: 'halo_alley' });
    const n = spawnNpc(new Rng('n'), 'n', 'patron', 'halo_alley');
    addNpc(sc.w, n);
    expect(seesHer(sc.w, n)).toBe(true);
    expect(bucketOf(sc.w, n)).toBe('aware');
  });

  it('far enough off, or in the dark, she can be unseen even in the open (when sneaking)', () => {
    const { w, p, hidden } = room('range');
    p.board.hero = { x: 4, y: 0 };
    p.board.ents[hidden.id] = { x: 4, y: 4, facing: 0 };
    expect(seesHer(w, hidden, true)).toBe(true);
    p.layout.light.fill(0);
    w.hero.level = 1;
    hidden.level = 1;
    p.board.hero = { x: 0, y: 4 };
    p.board.ents[hidden.id] = { x: 5, y: 4, facing: 0 };
    expect(seesHer(w, hidden, true)).toBe(false);
    expect(seesHer(w, hidden)).toBe(true); // a line is a line; it is range that fails
  });
});

describe('stealth needs no cover from those who cannot see her', () => {
  it('going quiet with nothing to hide behind: the one watching still has her, the one behind the wall never did', () => {
    const { w, open, hidden } = room('enter');
    w.locations.halo_floor!.cover = 0;
    w.locations.halo_floor!.crowded = false;
    const { c, events } = ctxOf(w);
    enterStealth(c);
    const e = events.find((x) => x.type === 'stealth')!;
    expect(e.data.watching).toBe(1);
    expect(e.data.left).toBe(1);
    expect(bucketOf(w, open)).toBe('aware');
    expect(bucketOf(w, hidden)).toBe('unaware');
    expect(awareness(w, hidden).v).toBe(0);
  });

  it('and if nobody can see her at all, there is nothing to hide from', () => {
    const { w, p, open } = room('nobody');
    p.board.ents[open.id] = { x: 4, y: 0, facing: 0 };
    p.board.ents[open.id]!.x = 4;
    p.board.hero = { x: 0, y: 2 };
    const { c, events } = ctxOf(w);
    enterStealth(c);
    expect(events.find((x) => x.type === 'stealth')!.data.watching).toBe(0);
    expect(bucketOf(w, open)).toBe('unaware');
  });

  it('while she sneaks, only those who can see her get any closer to noticing, and losing sight of her costs a fix', () => {
    const { w, p, open, hidden } = room('tick');
    const { c } = ctxOf(w);
    w.hero.stealth = true;
    for (let i = 0; i < 6; i++) {
      w.beat++;
      tickStealth(c);
    }
    expect(awareness(w, open).v).toBeGreaterThan(0);
    expect(awareness(w, hidden).v).toBe(0);
    // Make him aware, then she steps out of his sight.
    Object.assign(awareness(w, open), { v: 1, fix: true });
    p.board.hero = { x: 4, y: 4 };
    p.board.ents[open.id] = { x: 1, y: 2, facing: 0 };
    // (a wall between)
    p.layout.grid.cells[idx(p.layout.grid, { x: 2, y: 3 })] = 'wall';
    p.layout.grid.cells[idx(p.layout.grid, { x: 2, y: 4 })] = 'wall';
    p.layout.grid.cells[idx(p.layout.grid, { x: 3, y: 3 })] = 'wall';
    p.layout.grid.cells[idx(p.layout.grid, { x: 3, y: 2 })] = 'wall';
    expect(seesHer(w, open, true)).toBe(false);
    tickStealth(c);
    expect(awareness(w, open).fix).toBe(false);
    expect(bucketOf(w, open)).toBe('alert');
  });

  it('stepping out of stealth is only noticed by those who can see her', () => {
    const { w, open, hidden } = room('exit');
    const { c } = ctxOf(w);
    w.hero.stealth = true;
    exitStealth(c);
    expect(bucketOf(w, open)).toBe('aware');
    expect(awareness(w, hidden).v).toBe(0);
  });
});

describe('what she does is seen by those who can see it', () => {
  it('a fight nobody has a line to is not witnessed', () => {
    const { w, p, open, hidden } = room('witness');
    // The one in the open is the victim; the only other person is behind the wall.
    const { c, events } = ctxOf(w, 'wit');
    p.board.ents[open.id] = { x: 1, y: 2, facing: 0 };
    fight(c, [open], { cause: 'test', assault: true, joiners: false });
    void hidden;
    expect(events.find((e) => e.type === 'crime_seen')?.data.variant).toBe('none');
  });

  it('and one with somebody watching is', () => {
    const { w, p, open, hidden } = room('witness2');
    p.board.ents[hidden.id] = { x: 1, y: 1, facing: 0 };
    const { c, events } = ctxOf(w, 'wit2');
    fight(c, [open], { cause: 'test', assault: true, joiners: false });
    expect(events.find((e) => e.type === 'crime_seen')?.data.variant).not.toBe('none');
  });
});
