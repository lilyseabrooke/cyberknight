import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, type GameEvent, type World } from './index';
import { HOOKS, relocate } from './combat';
import { Sim } from './tactics';
import { techniquesFor } from './techniques';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { newCompanion } from './companions';
import { BIKE_BLAST, BIKE_LIFE, KEY_LIFE, MAKES, ALL_MAKES, blastInside, blastOutside, carKey, lifeOf, makesOf, normalize, vehicleOf } from './cars';
import { boardParty } from './vehicles';
import { parkedVehicle, roadsFrom } from './roads';
import { dragonChase, policeChase, pursuers } from './chase';
import { heroSpeed } from './dragonmodels';
import { always } from './testkit';
import type { Ctx, Vehicle } from './types';

const ctxOf = (w: World, rng: Rng = new Rng('c')): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

const bike = (kind: Vehicle['kind'] = 'civilian', i = 1): Vehicle => vehicleOf(makesOf(kind, 'bike')[i % makesOf(kind, 'bike').length]!, `bike-${kind}-${i}`);

function scene(seed: string, o: { level?: number; v?: Vehicle; foe?: string; rng?: Rng } = {}) {
  const w = createWorld({ seed, competence: 0.7 });
  const h = w.hero;
  h.level = o.level ?? 1;
  h.maxHp = h.hp = 90 + 13 * (h.level - 1);
  h.locationId = 'street_main';
  h.vehicle = o.v ?? bike();
  const foe = spawnNpc(new Rng(seed), 'd0', o.foe ?? 'ganger', 'street_main');
  addNpc(w, foe);
  const { c, events } = ctxOf(w, o.rng ?? new Rng(`${seed}-r`));
  const sim = new Sim(c, HOOKS, { foes: [foe], arrivals: [], lethal: true, assault: false, maxRounds: 12 });
  return { w, c, events, sim, foe, obj: sim.ownCar()! };
}

describe('the makes', () => {
  it('bikes come after the cars, with one or two seats, quick and thin', () => {
    for (const kind of ['civilian', 'police', 'atlas'] as const) {
      const cars = makesOf(kind, 'car');
      const bikes = makesOf(kind, 'bike');
      expect(bikes.length).toBeGreaterThan(0);
      expect(MAKES[kind].slice(0, cars.length).every((x) => (x.body ?? 'car') === 'car')).toBe(true); // the cars kept their places
      for (const b of bikes) {
        expect(b.seats).toBeLessThanOrEqual(2);
        expect(b.maxHp).toBeLessThanOrEqual(50);
        expect(b.armor).toBeLessThanOrEqual(1);
        expect(b.pace).toBeGreaterThanOrEqual(9);
      }
    }
    expect(ALL_MAKES.some((x) => x.seats === 1)).toBe(true);
    expect(vehicleOf(ALL_MAKES.find((x) => x.body === 'bike')!).body).toBe('bike');
    expect(normalize({ ...vehicleOf(MAKES.civilian[0]!), body: undefined as never }).body).toBe('car');
  });

  it('the bang is smaller, and a level 1 Blackbird on a bike survives it with a fall to spare', () => {
    const b = bike();
    expect(blastInside(b)).toBe(BIKE_BLAST + 10 * b.armor);
    expect(blastInside(b)).toBeLessThan(blastInside(vehicleOf(MAKES.civilian[0]!)));
    expect(blastOutside(b)).toBeLessThan(blastOutside(vehicleOf(MAKES.civilian[0]!)));
    const cop = bike('police');
    expect(blastInside(cop)).toBeGreaterThan(blastInside(bike('civilian', 0))); // armor still counts for something
    const s = scene('bike-bang', { level: 1 });
    s.sim.board(s.obj);
    s.sim.hitObject(s.obj, 9999, 'ram');
    expect(s.w.hero.hp).toBeGreaterThan(0);
    expect(s.w.hero.hp).toBeLessThan(s.w.hero.maxHp - 35);
    expect(s.w.hero.vehicle).toBeUndefined();
    expect(s.sim.hero.stagger).toBeGreaterThanOrEqual(2);
  });

  it('bikes are left for three quarters as long, and the key rules are as for a car', () => {
    const b = bike('civilian', 0);
    const c = vehicleOf(MAKES.civilian[0]!);
    expect(lifeOf(b, undefined)).toBe(lifeOf(c, undefined) * BIKE_LIFE);
    expect(lifeOf(b, carKey(b))).toBe(lifeOf(c, undefined) * BIKE_LIFE * KEY_LIFE);
    expect(lifeOf(b, carKey(b, true))).toBe(lifeOf(c, undefined) * BIKE_LIFE);
    const p = bike('police');
    expect(lifeOf(p, carKey(p))).toBe(lifeOf(p, undefined));
  });
});

describe('bikes on the street', () => {
  it('streets grow bikes as well as cars, and a bike has its own id', () => {
    const seen = { bike: 0, car: 0 };
    for (let i = 0; i < 60; i++) {
      const w = createWorld({ seed: `park-${i}`, competence: 0.5 });
      for (const id of Object.keys(w.locations)) {
        const loc = w.locations[id]!;
        if (loc.kind !== 'street') continue;
        const v = parkedVehicle(w, loc);
        if (!v) continue;
        seen[v.body]++;
        expect(v.id.endsWith(':bike')).toBe(v.body === 'bike');
        if (v.body === 'bike') expect(v.seats).toBeLessThanOrEqual(2);
      }
    }
    expect(seen.bike).toBeGreaterThan(0);
    expect(seen.car).toBeGreaterThan(seen.bike * 0.5);
  });

  it('a bike gets through a tunnel a car cannot, and never stops in it', () => {
    const w = createWorld({ seed: 'tunnel', competence: 0.5 });
    relocate(w, 'street_main');
    const a = w.locations.street_main!;
    const next = a.exits.find((e) => w.locations[e.to]!.kind === 'street')!;
    const b = w.locations[next.to]!;
    const t = { ...b, id: 'T_tunnel', kind: 'tunnel' as const, exits: [{ to: a.id, label: 'back', hidden: false, gate: null }, { to: 'T_far', label: 'on', hidden: false, gate: null }] };
    const far = { ...b, id: 'T_far', kind: 'street' as const, exits: [{ to: 'T_tunnel', label: 'back', hidden: false, gate: null }] };
    w.locations.T_tunnel = t;
    w.locations.T_far = far;
    a.exits.push({ to: 'T_tunnel', label: 'a tunnel', hidden: false, gate: null });
    expect(roadsFrom(w, a.id, 3, 'car').some((r) => r.id === 'T_far')).toBe(false);
    const viaBike = roadsFrom(w, a.id, 3, 'bike');
    expect(viaBike.some((r) => r.id === 'T_far' && r.hops === 2 && r.path.join() === 'T_tunnel,T_far')).toBe(true);
    expect(viaBike.some((r) => r.id === 'T_tunnel')).toBe(false);
  });
});

describe('who rides', () => {
  const party = (kinds: string[]) => {
    const w = createWorld({ seed: 'bike-party', competence: 0.5 });
    w.hero.locationId = 'street_main';
    for (const k of kinds) w.hero.companions.push(newCompanion(k, `${k}-pal`, { loyalty: 80 }));
    return w;
  };

  it('a solo bike has no room, a pillion bike has room for one, flyers come alongside either way', () => {
    const solo = makesOf('civilian', 'bike').find((m) => m.seats === 1)!;
    const two = makesOf('civilian', 'bike').find((m) => m.seats === 2)!;
    const w = party(['kids', 'puppy', 'drone', 'pigeon']);
    w.hero.companions.pop(); // MAX_COMPANIONS is 3 in play; keep the three that matter here
    const car = vehicleOf(solo);
    boardParty(ctxOf(w, always()).c, car, w.locations.street_main!);
    expect(car.riders.map((id) => id.split('_')[1]).sort()).toEqual(['drone']); // only the flyer rides, for nothing
    expect(w.hero.waiting ?? []).toHaveLength(2);
    const w2 = party(['kids', 'puppy', 'drone']);
    const pillion = vehicleOf(two);
    boardParty(ctxOf(w2, always()).c, pillion, w2.locations.street_main!);
    expect(pillion.riders.length).toBe(2); // one on the seat, the drone alongside
    expect(w2.hero.waiting ?? []).toHaveLength(1);
  });
});

describe('a bike on the board', () => {
  it('is one cell, has no door, and is never somewhere to hide', () => {
    const s = scene('cell', { level: 5 });
    expect(s.obj.cells).toHaveLength(1);
    expect(s.obj.body).toBe('bike');
    expect(s.obj.doors).toBe('forced');
    s.sim.board(s.obj);
    expect(s.sim.hero.aboard).toBe(s.obj.id);
    expect(s.sim.sheltered(s.sim.hero)).toBe(false);
    const foe = s.sim.units.find((u) => u.kind === 'foe')!;
    const ids = techniquesFor(s.sim, foe).map((t) => t.id);
    expect(ids).toContain('force_door'); // the technique exists, but...
    expect(techniquesFor(s.sim, foe).find((t) => t.id === 'force_door')!.value(s.sim, foe, foe, s.sim.hero)).toBeNull(); // ...it has nothing to open
  });

  it('a mounted rider is faster, and the bike goes where she goes', () => {
    const s = scene('ride', { level: 5 });
    const before = s.sim.speedOf(s.sim.hero);
    s.sim.board(s.obj);
    expect(s.sim.speedOf(s.sim.hero)).toBe(before + 3);
    const old = { ...s.obj.cells[0]! };
    const start = s.sim.hero.x;
    const to = { x: s.sim.hero.x, y: s.sim.hero.y };
    // Find a free floor tile next door and ride to it.
    const g = s.sim.grid;
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: old.x + dx!, y: old.y + dy! })).filter((p) => p.x >= 0 && p.y >= 0 && p.x < g.w && p.y < g.h && g.cells[p.y * g.w + p.x] === 'floor');
    expect(spots.length).toBeGreaterThan(0);
    to.x = spots[0]!.x;
    to.y = spots[0]!.y;
    s.sim.hero.x = to.x;
    s.sim.hero.y = to.y;
    (s.sim as unknown as { rideTo(o: unknown, u: unknown): void }).rideTo(s.obj, s.sim.hero);
    expect(s.obj.cells[0]).toEqual(to);
    expect(g.cells[to.y * g.w + to.x]).toBe('cover');
    expect(g.cells[old.y * g.w + old.x]).toBe('floor');
    expect(start).toBeDefined();
  });

  it('gunfire at a mounted rider is split between her and the bike', () => {
    const s = scene('split', { level: 8 });
    s.sim.board(s.obj);
    const shooter = s.sim.units.find((u) => u.kind === 'foe')!;
    shooter.reach = [1, 5];
    const hp0 = s.w.hero.hp;
    const bike0 = s.obj.car.hp;
    s.sim.damage(shooter, s.sim.hero, 20);
    expect(hp0 - s.w.hero.hp).toBe(10);
    expect(bike0 - s.obj.car.hp).toBe(10 - s.obj.car.armor);
  });

  it('a ride-by is a hit with the speed behind it, and she can throw nothing from the bike', () => {
    const s = scene('rideby', { level: 8, rng: always() });
    s.sim.board(s.obj);
    const foe = s.sim.units.find((u) => u.kind === 'foe')!;
    const ids = techniquesFor(s.sim, s.sim.hero).map((t) => t.id);
    expect(ids).toContain('ride_by');
    expect(ids).not.toContain('throw');
    s.sim.rideBy(foe);
    expect(s.sim.run().log.some((e) => e.type === 'tactic' && e.data.variant === 'ride_by')).toBe(true);
  });

  it('she can climb on from beside it, and ride off', () => {
    const s = scene('mount', { level: 8 });
    const ids = techniquesFor(s.sim, s.sim.hero).map((t) => t.id);
    expect(ids).toContain('mount');
    expect(ids).toContain('drive_off');
    s.sim.driveOff(s.obj);
    expect(s.sim.hero.state).toBe('fled');
    expect(s.w.hero.vehicle?.body).toBe('bike');
  });

  it('whole fights with a bike on the street run clean and read well', () => {
    for (let i = 0; i < 60; i++) {
      const s = scene(`bfull-${i}`, { level: 1 + (i % 10), v: bike((['civilian', 'police', 'atlas'] as const)[i % 3], i) });
      const res = s.sim.run();
      expect(['win', 'flee', 'dead', 'tossed', 'arrested']).toContain(res.result);
      for (const e of res.log) expect(hasTemplate({ beat: 0, type: e.type, outcome: e.outcome, data: e.data }), `${e.type}:${e.data.variant}`).toBe(true);
    }
  });
});

describe('a bike in a chase', () => {
  const riding = (seed: string, v: Vehicle, level = 6) => {
    const w = createWorld({ seed, competence: 0.6 });
    w.hero.locationId = 'street_main';
    w.hero.level = level;
    w.hero.maxHp = w.hero.hp = 90 + 13 * (level - 1);
    w.heat.npd = 5;
    w.hero.vehicle = v;
    return w;
  };

  it('is faster than the car it replaces', () => {
    const w = riding('bspeed', bike('civilian', 2));
    const fast = heroSpeed(w);
    w.hero.vehicle = vehicleOf(MAKES.civilian[0]!);
    expect(fast).toBeGreaterThan(heroSpeed(w));
  });

  it('police chases with a bike always end and read, lane-split appears, and a bailed bike is left behind', () => {
    const actions = new Set<string>();
    let strays = 0;
    const results: Record<string, number> = {};
    for (let i = 0; i < 120; i++) {
      const v = bike((['civilian', 'police', 'atlas'] as const)[i % 3], i);
      const w = riding(`bc-${i}`, v, 3 + (i % 8));
      const { c, events } = ctxOf(w, new Rng(`bc-${i}-r`));
      const result = policeChase(c, 'ambush');
      expect(result).not.toBeNull();
      results[result!] = (results[result!] ?? 0) + 1;
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'chase_round') actions.add(String(e.data.variant));
      }
      // (Thrown off, she may be in shape to go on on foot, so the chase need not end; the bike is left lying where it fell either way.)
      if (events.some((e) => e.type === 'chase_mount' && ['thrown', 'bail', 'door'].includes(String(e.data.variant))) && (w.hero.parked ?? []).some((v) => v.body === 'bike')) strays++;
      if (result === 'bailed' || result === 'wrecked') expect(w.hero.vehicle).toBeUndefined();
    }
    expect(actions.has('lane_split')).toBe(true);
    expect(strays).toBeGreaterThan(0);
    expect(Object.keys(results).length).toBeGreaterThanOrEqual(2);
  });

  it('the police send bikes after her too: one in three comes alone', () => {
    const w = riding('pursuit', bike());
    const cops = [0, 1, 2, 3].map((k) => {
      const n = spawnNpc(new Rng('p'), `cop${k}`, 'npd_officer', 'street_main');
      addNpc(w, n);
      return n;
    });
    let bikes = 0;
    let cars = 0;
    for (let i = 0; i < 40; i++) {
      for (const p of pursuers(cops, new Rng(`pu-${i}`))) (p.car!.body === 'bike' ? bikes++ : cars++);
    }
    expect(bikes).toBeGreaterThan(0);
    expect(cars).toBeGreaterThan(0);
    for (const p of pursuers(cops, new Rng('x'))) expect(p.crew.length).toBeLessThanOrEqual(p.car!.body === 'bike' ? 1 : 2);
  });

  it('a fast bike catches a dragon that a delivery scooter never will', () => {
    const run = (v: Vehicle) => {
      let caught = 0;
      for (let i = 0; i < 60; i++) {
        const w = riding(`dr-${i}`, { ...v, id: `${v.id}-${i}` }, 10);
        const dragon = spawnNpc(new Rng(`dr-${i}`), 'dr', 'hermes3', 'street_main');
        addNpc(w, dragon);
        if (dragonChase(ctxOf(w, new Rng(`dr-${i}-r`)).c, dragon, 12, 'a courier dragon') === 'caught') caught++;
      }
      return caught;
    };
    const fast = run(vehicleOf(makesOf('atlas', 'bike')[0]!));
    const slow = run(vehicleOf([...makesOf('civilian', 'bike')].sort((a, b) => a.pace - b.pace)[0]!));
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(0);
  });
});
