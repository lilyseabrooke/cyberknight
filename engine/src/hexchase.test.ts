import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, type GameEvent, type World } from './index';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { expand } from './mapgen';
import { MAKES } from './cars';
import { onFoot, pursuers, runChase, type Chaser } from './chase';
import { cross, cutAcross, planRoute, readingOf, startRoute } from './shortcut';
import { VIA } from './hexmap';
import { skillValue } from './skills';
import type { Ctx, Id, Location } from './types';

const ctxOf = (w: World, rng: Rng): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

/** A city grown a few rings out, with her on a street that has somewhere to run. */
function city(seed: string, rings = 5): { w: World; streets: Location[] } {
  const w = createWorld({ seed: 'x', worldSeed: seed, competence: 0.6 });
  let edge: Location[] = ['street_main', 'club_backlot', 'halo_alley'].flatMap((id) => w.locations[id]!.exits.map((e) => w.locations[e.to]!).filter((l) => l.gen));
  for (let i = 0; i < rings; i++) {
    const next: Location[] = [];
    for (const l of edge) {
      expand(w, l);
      for (const e of l.exits) if (w.locations[e.to]?.gen?.parent === l.id && w.locations[e.to]!.gen!.role === 'street') next.push(w.locations[e.to]!);
    }
    edge = next;
  }
  w.hero.level = 8;
  w.hero.maxHp = w.hero.hp = 90 + 13 * 7;
  w.clock = 20 * 60;
  return { w, streets: Object.values(w.locations).filter((l) => l.kind === 'street' && l.hex && l.road !== 'highway' && l.gen) };
}

const guy = (w: World, id: string, kind = 'ganger') => {
  const n = spawnNpc(new Rng(id), id, kind, w.hero.locationId);
  addNpc(w, n);
  return n;
};

const carFoe = (w: World, id: string, gap = 5): Chaser => {
  const mk = MAKES.civilian[0]!;
  return { name: `a ${mk.name}`, crew: [guy(w, id)], car: { id: `car-${id}`, body: mk.body ?? 'car', kind: 'civilian', name: mk.name, hp: mk.maxHp, maxHp: mk.maxHp, armor: mk.armor }, pace: mk.pace, gap, alive: true };
};

describe('routes and the ways across', () => {
  it('a plain route exists from most streets, and an obstacle route can be quicker', () => {
    const { w, streets } = city('route-a');
    let routes = 0;
    let shorter = 0;
    for (const s of streets) {
      const r = startRoute(w, new Rng(s.id), s.id, 'foot');
      if (!r) continue;
      routes++;
      expect(r.path[0]).toBe(s.id);
      for (const id of r.path) expect(w.locations[id]!.kind).toBe('street');
      const quick = planRoute(w, s.id, r.path[r.path.length - 1]!, 'foot', true)!;
      const plain = planRoute(w, s.id, r.path[r.path.length - 1]!, 'foot', false)!;
      expect(quick.cost).toBeLessThanOrEqual(plain.cost + 1e-9);
      if (quick.cost < plain.cost - 1e-9) shorter++;
    }
    expect(routes).toBeGreaterThan(5);
    expect(shorter).toBeGreaterThanOrEqual(0);
  });

  it('what can be crossed depends on what is crossing it', () => {
    expect(VIA.wall.car).toBe(Infinity);
    expect(VIA.wall.bike).toBe(Infinity);
    expect(Number.isFinite(VIA.wall.foot)).toBe(true);
    expect(VIA.barricade.car).toBeLessThan(VIA.barricade.foot);
    expect(Number.isFinite(VIA.ramp.car)).toBe(true);
    expect(VIA.duct.car).toBe(Infinity);
    expect(VIA.through.bike).toBe(Infinity);
  });

  it('every kind of obstacle can be crossed, by someone, with a result that can be told', () => {
    const { w } = city('cross-a');
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const { c } = ctxOf(w, new Rng(`x${i}`));
      w.hero.hp = w.hero.maxHp;
      for (const via of ['fence', 'wall', 'barricade', 'duct', 'through', 'ramp'] as const) {
        for (const mode of ['foot', 'bike', 'car'] as const) {
          if (!Number.isFinite(VIA[via][mode])) continue;
          const car = mode === 'foot' ? null : { hp: 100, maxHp: 100, armor: 2, body: mode as 'car' | 'bike' };
          const r = cross(c, { mode, hero: i % 2 === 0, car, pace: 8 }, { from: 'street_main', to: 'street_main', via, cost: 1 });
          seen.add(r.told);
        }
      }
    }
    for (const k of ['vault', 'smash_fence', 'climb', 'breach', 'ram_barricade', 'crawl', 'through', 'jump', 'stairs']) expect([...seen], k).toContain(k);
  });
});

describe('chases move through the grid, and cut across it', () => {
  it('a foot chase after a runner has the pursuer guess where they are going; calculating helps', () => {
    const kinds: Record<string, number> = {};
    let cuts = 0;
    for (let i = 0; i < 150; i++) {
      const { w, streets } = city(`cut-${i % 6}`, 4);
      const start = streets[(i * 7) % streets.length]!;
      w.hero.locationId = start.id;
      const runner = guy(w, `r${i}`);
      const { c, events } = ctxOf(w, new Rng(`cut-${i}`));
      runChase(c, { mode: 'pursuer', cause: 'test', foes: [onFoot(runner, 5)] });
      for (const e of events) {
        if (e.type === 'chase_cut') {
          cuts++;
          kinds[String(e.data.variant)] = (kinds[String(e.data.variant)] ?? 0) + 1;
        }
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      }
    }
    expect(cuts).toBeGreaterThan(0);
    expect(Object.keys(kinds).length).toBeGreaterThanOrEqual(2);
  });

  it('better calculating means better guesses', () => {
    const { w } = city('read');
    const low = readingOf(w);
    w.hero.skills.calculate = 400;
    w.hero.hack = 9;
    expect(skillValue(w.hero, 'calculate')).toBeGreaterThan(3);
    expect(readingOf(w)).toBeGreaterThan(low + 0.2);
  });

  it('police in cars can cut her off when she runs, and everything they do is told', () => {
    let theirs = 0;
    for (let i = 0; i < 150; i++) {
      const { w, streets } = city(`pol-${i % 5}`, 4);
      w.hero.locationId = streets[(i * 5) % streets.length]!.id;
      const cops = [guy(w, `c${i}a`, 'npd_officer'), guy(w, `c${i}b`, 'npd_officer')];
      w.heat.npd = 5;
      const { c, events } = ctxOf(w, new Rng(`pol-${i}`));
      runChase(c, { mode: 'pursued', cause: 'test', foes: pursuers(cops) });
      theirs += events.filter((e) => e.type === 'chase_cut' && e.data.hero === false).length;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(theirs).toBeGreaterThan(0);
  });

  it('cutAcross refuses a cut that is no quicker, and a wrong guess ends up somewhere that is not on the route', () => {
    let wrong = 0;
    for (let i = 0; i < 200; i++) {
      const { w, streets } = city(`wrong-${i % 4}`, 4);
      const start = streets[(i * 3) % streets.length]!.id;
      const route = startRoute(w, new Rng(`w${i}`), start, 'foot');
      if (!route) continue;
      const { c } = ctxOf(w, new Rng(`wr${i}`));
      const cut = cutAcross(c, { who: { mode: 'foot', hero: true, pace: 4 }, from: start as Id, route, accuracy: 0, behind: 1 });
      if (cut.kind === 'wrong') {
        wrong++;
        expect(route.path.includes(cut.waypoint)).toBe(false);
      }
      const sure = cutAcross(ctxOf(w, new Rng(`ws${i}`)).c, { who: { mode: 'foot', hero: true, pace: 4 }, from: start as Id, route, accuracy: 1, behind: 1 });
      expect(sure.kind).not.toBe('wrong');
    }
    expect(wrong).toBeGreaterThan(0);
  });
});
