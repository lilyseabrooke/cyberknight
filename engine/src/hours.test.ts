import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { spawnNpc } from './content/archetypes';
import { addNpc, everyoneAt, moveNpc, setHaunts } from './population';
import { relocate } from './combat';
import { MIN_PER_DAY } from './clock';
import { dist } from './grid';
import { crowdAt, isClosed, openAt } from './hours';
import { settleAt } from './movement';
import { populate } from './roster';
import { gather } from './interactions';
import { patrolPeriod, placeOf, syncPlace, tickOf } from './placeboard';
import { step } from './run';
import type { World } from './types';

const at = (hour: number, day = 0): number => day * MIN_PER_DAY + hour * 60;
const club = (w: World) => w.locations.neon_pharaoh!;

describe('opening hours', () => {
  it('run past midnight when the close is before the open, and a place with none is always open', () => {
    const w = scenario({ seed: 'hrs', at: 'street_main' }).w;
    const l = { ...club(w), hours: [20, 6] as [number, number] };
    expect([19, 20, 23, 0, 5, 6, 12].map((h) => openAt(w, l, at(h)))).toEqual([false, true, true, true, true, false, false]);
    expect(openAt(w, { ...l, hours: undefined, kind: 'street' }, at(12))).toBe(true);
    expect(openAt(w, { ...l, hours: [9, 17] }, at(12))).toBe(true);
    expect(openAt(w, { ...l, hours: [9, 17] }, at(18))).toBe(false);
  });

  it('a club keeps its hours by default, and a place can keep its own', () => {
    const w = scenario({ seed: 'hrs2', at: 'street_main' }).w;
    w.clock = at(14);
    expect(isClosed(w, 'neon_pharaoh')).toBe(true);
    club(w).hours = [10, 18];
    expect(isClosed(w, 'neon_pharaoh')).toBe(false);
  });

  it('she is not offered the door to a place that is shut for the day', () => {
    const sc = scenario({ seed: 'hrs3', at: 'street_main' });
    const goes = () => gather(sc.w).some((x) => x.key === 'go:neon_pharaoh');
    sc.w.clock = at(23);
    expect(goes()).toBe(true);
    sc.w.clock = at(14);
    expect(goes()).toBe(false);
  });

  it('whoever is still inside when it closes is shown out', () => {
    const sc = scenario({ seed: 'hrs4', at: 'street_main' });
    relocate(sc.w, 'neon_pharaoh');
    sc.w.clock = at(5) + 50;
    for (let i = 0; i < 6 && sc.w.hero.locationId === 'neon_pharaoh'; i++) step(sc.w);
    expect(sc.w.hero.locationId).not.toBe('neon_pharaoh');
  });

  it('nobody who wanders goes into a place that is closed', () => {
    const w = scenario({ seed: 'hrs5', at: 'street_main' }).w;
    const n = spawnNpc(new Rng('wanderer'), 'wanderer', 'patron', 'street_main');
    addNpc(w, n);
    setHaunts(w, n, { neon_pharaoh: 1, street_main: 0.01 });
    for (let t = 0; t < 24 * 6; t++) {
      w.clock = at(0) + t * 10;
      settleAt(w, 'street_main', w.clock);
      settleAt(w, 'neon_pharaoh', w.clock);
      if (isClosed(w, 'neon_pharaoh')) expect(n.locationId, `clock ${w.clock}`).not.toBe('neon_pharaoh');
    }
  });
});

describe('the crowd, by the hour', () => {
  it('a club fills up toward midnight and empties toward dawn', () => {
    const w = scenario({ seed: 'crowd', at: 'street_main' }).w;
    const f = (h: number) => crowdAt(w, club(w), at(h));
    expect(f(23)).toBeGreaterThan(f(20));
    expect(f(1)).toBeGreaterThan(f(4));
    expect(f(23)).toBeGreaterThan(0.9);
  });

  it('bystanders turn up in proportion when a place is first made', () => {
    const count = (hour: number) => {
      let total = 0;
      for (let i = 0; i < 12; i++) {
        const w = scenario({ seed: `pop${i}`, at: 'street_main' }).w;
        w.clock = at(hour);
        const l = club(w);
        l.populated = false;
        for (const n of everyoneAt(w, l.id)) if (n.ephemeral) moveNpc(w, n, '_gone');
        populate(w, l);
        total += everyoneAt(w, l.id).filter((n) => n.ephemeral).length;
      }
      return total;
    };
    expect(count(23)).toBeGreaterThan(count(20));
  });

  it('bystanders thin out as the night goes on: the same patrons are about at midnight and gone by four', () => {
    let late = 0;
    let early = 0;
    for (let i = 0; i < 10; i++) {
      const w = scenario({ seed: `thin${i}`, at: 'street_main' }).w;
      const crowd = Array.from({ length: 6 }, (_, j) => {
        const n = spawnNpc(new Rng(`p${i}${j}`), `p${i}_${j}`, 'patron', 'neon_pharaoh');
        n.ephemeral = true;
        addNpc(w, n);
        setHaunts(w, n, { neon_pharaoh: 1 });
        return n;
      });
      const count = (hour: number) => {
        w.clock = at(hour);
        settleAt(w, 'neon_pharaoh', w.clock + 500);
        for (const n of crowd) n.settledAt = -9999;
        let here = 0;
        for (const n of crowd) {
          w.clock = at(hour) + 5;
          for (const m of settleAt(w, 'neon_pharaoh', w.clock)) void m;
          if (n.locationId === 'neon_pharaoh') here++;
        }
        return here;
      };
      early += count(23);
      late += count(4);
    }
    expect(early).toBeGreaterThan(late);
  });
});

describe('the board runs on the world clock', () => {
  it('a round takes minutes, not beats: a minute is a step, and the patrol is back where it began a period later', () => {
    const w = scenario({ seed: 'clockboard', at: 'street_main' }).w;
    relocate(w, 'neon_pharaoh');
    for (const n of Object.values(w.npcs)) if (n.locationId === 'neon_pharaoh') moveNpc(w, n, '_gone');
    const guard = spawnNpc(new Rng('gus'), 'gus', 'club_security', 'neon_pharaoh');
    addNpc(w, guard);
    const p = placeOf(w)!;
    syncPlace(w, p);
    const period = patrolPeriod(w, p, guard.id)!;
    const spot = () => {
      const e = p.board.ents[guard.id]!;
      return { x: e.x, y: e.y };
    };
    const start = w.clock;
    const first = spot();
    let prev = first;
    for (let t = 1; t <= period; t++) {
      w.clock = start + t;
      syncPlace(w, p);
      const now = spot();
      expect(dist(prev, now)).toBeLessThanOrEqual(1);
      prev = now;
    }
    expect(prev).toEqual(first);
    // an hour on, wherever the clock says
    w.clock = start + 60;
    syncPlace(w, p);
    const sixty = spot();
    w.clock = start + 60 + period * 3;
    syncPlace(w, p);
    expect(spot()).toEqual(sixty);
    expect(tickOf(w)).toBe(Math.floor(start + 60 + period * 3));
  });
});
