import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, type GameEvent, type World } from './index';
import { HOOKS, relocate } from './combat';
import { arrive } from './candidate';
import { Sim } from './tactics';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { newCompanion } from './companions';
import { KEY_LIFE, MAKES, SPILL, blastInside, blastOutside, carKey, lifeOf, stateOf, vehicleOf, hitCar, normalize } from './cars';
import { boardParty } from './vehicles';
import { assignKeys, parkedVehicle } from './roads';
import { gather } from './interactions';
import { perform } from './run';
import { spawnGroup } from './candidate';
import { sellable } from './plans';
import { policeChase, dragonChase, cruisers, runChase, bandOf } from './chase';
import { heroSpeed, legSpeed } from './dragonmodels';
import { always, never } from './testkit';
import type { Ctx, Vehicle } from './types';

const ctxOf = (w: World, rng: Rng = new Rng('c')): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

/** A street fight with her in (or beside) a car of this kind. */
function scene(seed: string, o: { level?: number; kind?: Vehicle['kind']; make?: number; foe?: string; rng?: Rng } = {}) {
  const w = createWorld({ seed, competence: 0.7 });
  const h = w.hero;
  h.level = o.level ?? 1;
  h.maxHp = h.hp = 90 + 13 * (h.level - 1);
  h.locationId = 'street_main';
  const kind = o.kind ?? 'civilian';
  h.vehicle = vehicleOf(MAKES[kind][o.make ?? 0]!);
  const foe = spawnNpc(new Rng(seed), 'd0', o.foe ?? 'ganger', 'street_main');
  addNpc(w, foe);
  const { c, events } = ctxOf(w, o.rng ?? new Rng(`${seed}-r`));
  const sim = new Sim(c, HOOKS, { foes: [foe], arrivals: [], lethal: true, assault: false, maxRounds: 12 });
  return { w, c, events, sim, foe, car: sim.ownCar()! };
}

describe('the car as a thing that blows up', () => {
  it('the bang is flat, the same for any level, and bigger for armour', () => {
    const civ = vehicleOf(MAKES.civilian[0]!);
    const cop = vehicleOf(MAKES.police[0]!);
    const van = vehicleOf(MAKES.police[3]!);
    expect(blastInside(civ)).toBe(100);
    expect(blastInside(cop)).toBeGreaterThan(blastInside(civ));
    expect(blastInside(van)).toBeGreaterThan(blastInside(cop));
    expect(blastOutside(civ)).toBeLessThan(blastInside(civ));
  });

  it('flatlines a level 1 Blackbird inside, a level 2 crawls out; tougher cars hurt more', () => {
    const one = scene('boom-1', { level: 1 });
    expect(one.car).toBeDefined();
    one.sim.board(one.car);
    one.sim.hitObject(one.car, 9999, 'ram');
    expect(one.w.hero.hp).toBeLessThanOrEqual(0);
    expect(one.w.hero.vehicle).toBeUndefined();
    expect(one.w.flags[`wreck:street_main`]).toBe(true);
    expect(one.sim.run().result).toBe('dead');

    const two = scene('boom-2', { level: 2 });
    two.sim.board(two.car);
    two.sim.hitObject(two.car, 9999, 'ram');
    expect(two.w.hero.hp).toBeGreaterThan(0);

    // A level 5 (142 hp) walks out of a civilian car and doesn't out of a police one (armor 3: 175).
    const soft = scene('boom-5a', { level: 5 });
    soft.sim.board(soft.car);
    soft.sim.hitObject(soft.car, 9999, 'ram');
    expect(soft.w.hero.hp).toBeGreaterThan(0);
    const hard = scene('boom-5b', { level: 5, kind: 'police' });
    hard.sim.board(hard.car);
    hard.sim.hitObject(hard.car, 9999, 'ram');
    expect(hard.w.hero.hp).toBeLessThanOrEqual(0);
  });

  it('standing outside it is a smaller flat bang, and it takes riders with it', () => {
    const s = scene('boom-out', { level: 3 });
    const comp = newCompanion('puppy', 'pup');
    s.w.hero.companions.push(comp);
    const sim = new Sim(s.c, HOOKS, { foes: [s.foe], arrivals: [], lethal: true, assault: false, maxRounds: 12 });
    const car = sim.ownCar()!;
    sim.board(car);
    expect(sim.units.filter((u) => u.aboard === car.id).length).toBe(2);
    sim.hitObject(car, 9999, 'ram');
    expect(comp.hp).toBeLessThanOrEqual(0);
    expect(s.events.some((e) => e.type === 'car_wreck')).toBe(false); // noted for the telling, not emitted mid-fight
    expect(sim.run().log.some((e) => e.type === 'car_wreck')).toBe(true);
  });
});

describe('the car in a scene fight', () => {
  it('gunfire at somebody in a shut car hits the car first and a share gets through', () => {
    const s = scene('shoot', { level: 8 });
    s.sim.board(s.car);
    const shooter = s.sim.units.find((u) => u.kind === 'foe')!;
    shooter.reach = [1, 5];
    const hp0 = s.w.hero.hp;
    const car0 = s.car.car.hp;
    s.sim.damage(shooter, s.sim.hero, 40);
    expect(s.car.car.hp).toBe(car0 - 40);
    expect(hp0 - s.w.hero.hp).toBe(Math.round(40 * SPILL));
  });

  it('a melee foe has to force the door; then she is out, with no cover', () => {
    const s = scene('door', { level: 8, rng: always() });
    s.sim.board(s.car);
    const foe = s.sim.units.find((u) => u.kind === 'foe')!;
    expect(s.sim.sheltered(s.sim.hero)).toBe(true);
    s.sim.forceDoor(foe, s.car);
    expect(s.car.doors).toBe('forced');
    expect(s.sim.hero.aboard).toBeUndefined();
    expect(s.sim.sheltered(s.sim.hero)).toBe(false);
  });

  it('a failed door only dents it', () => {
    const s = scene('dent', { level: 8, rng: never() });
    s.sim.board(s.car);
    const foe = s.sim.units.find((u) => u.kind === 'foe')!;
    s.sim.forceDoor(foe, s.car);
    expect(s.car.doors).toBe('shut');
    expect(s.car.dents).toBe(1);
  });

  it('she can drive off in her own car, parked or not, and it stays hers', () => {
    const s = scene('off', { level: 8 });
    s.sim.driveOff(s.car);
    expect(s.sim.hero.state).toBe('fled');
    expect(s.w.hero.vehicle).toBeDefined();

    const w = createWorld({ seed: 'off-parked', competence: 0.7 });
    w.hero.locationId = 'street_main';
    w.hero.parked = [{ ...vehicleOf(MAKES.civilian[0]!), at: 'street_main', until: w.clock + 9999 }];
    const foe = spawnNpc(new Rng('x'), 'd0', 'ganger', 'street_main');
    addNpc(w, foe);
    const sim = new Sim(ctxOf(w).c, HOOKS, { foes: [foe], arrivals: [], lethal: true, assault: false, maxRounds: 12 });
    const car = sim.ownCar();
    expect(car).toBeDefined();
    sim.driveOff(car!);
    expect(w.hero.vehicle).toBeDefined();
    expect(w.hero.parked).toHaveLength(0);
  });

  it('damage to a car she owns is still there after the fight', () => {
    const s = scene('persist', { level: 8 });
    s.sim.hitObject(s.car, 20, 'ram');
    expect(s.w.hero.vehicle!.hp).toBe(s.w.hero.vehicle!.maxHp - 20);
    expect(stateOf(s.w.hero.vehicle!)).toBe('scuffed');
  });

  it('whole fights with a car on the street run clean', () => {
    for (let i = 0; i < 60; i++) {
      const s = scene(`full-${i}`, { level: 1 + (i % 10), kind: (['civilian', 'police', 'atlas'] as const)[i % 3] });
      const res = s.sim.run();
      expect(['win', 'flee', 'dead', 'tossed', 'arrested']).toContain(res.result);
      for (const e of res.log) expect(hasTemplate({ beat: 0, type: e.type, outcome: e.outcome, data: e.data }), `${e.type}:${e.data.variant}`).toBe(true);
    }
  });
});

describe('who rides', () => {
  const party = (kinds: string[], seed = 'party') => {
    const w = createWorld({ seed, competence: 0.5 });
    w.hero.locationId = 'street_main';
    for (const k of kinds) w.hero.companions.push(newCompanion(k, `${k}-pal`, { loyalty: 80 }));
    return w;
  };

  it('a four-seater takes the whole party of three', () => {
    const w = party(['puppy', 'kids', 'drone']);
    const car = vehicleOf(MAKES.civilian[0]!);
    const { c } = ctxOf(w);
    boardParty(c, car, w.locations.street_main!);
    expect(car.riders).toHaveLength(3);
    expect(w.hero.companions).toHaveLength(3);
  });

  it('seats are counted: a scrapper-bot takes two, and the one that does not fit chooses', () => {
    const w = party(['scrapper', 'puppy', 'drone']);
    const car = vehicleOf(MAKES.civilian[0]!);
    const { c, events } = ctxOf(w, always());
    boardParty(c, car, w.locations.street_main!);
    expect(car.riders.length).toBe(2);
    const left = ['scrapper', 'puppy', 'drone'].filter((k) => !car.riders.some((id) => id.includes(k)));
    expect(left).toHaveLength(1);
    // With no home to go to, it waits.
    expect(w.hero.waiting).toHaveLength(1);
    expect(w.hero.waiting![0]!.at).toBe('street_main');
    expect(events.every(hasTemplate)).toBe(true);
    // And is glad to see her when she is back.
    relocate(w, 'halo_alley');
    arrive(c, 'street_main', 'walk');
    expect(w.hero.waiting).toHaveLength(0);
    expect(w.hero.companions).toHaveLength(3);
  });

  it('a pigeon rides for free', () => {
    const w = party(['pigeon', 'scrapper', 'kids']);
    const car = vehicleOf(MAKES.civilian[0]!);
    boardParty(ctxOf(w).c, car, w.locations.street_main!);
    expect(car.riders).toHaveLength(3);
  });

  it('bigger cars have more room, and one with a home to go to can leave instead of waiting', () => {
    const w = party(['scrapper', 'scrapper', 'scrapper']);
    const small = vehicleOf(MAKES.civilian[0]!);
    const big = vehicleOf(MAKES.civilian[6]!);
    expect(small.seats).toBe(4);
    expect(big.seats).toBe(8);
    boardParty(ctxOf(w).c, big, w.locations.street_main!);
    expect(big.riders).toHaveLength(3);
    const w2 = party(['scrapper', 'scrapper', 'scrapper']);
    for (const a of w2.hero.companions) a.home = 'halo_floor';
    const { c } = ctxOf(w2, never());
    boardParty(c, small, w2.locations.street_main!);
    expect(small.riders).toHaveLength(1); // 3 seats, scrapper takes two
    expect(w2.hero.companions).toHaveLength(1);
    expect(w2.hero.waiting ?? []).toHaveLength(0);
  });
});

describe('chases', () => {
  const driving = (seed: string, kind: Vehicle['kind'] = 'civilian', level = 6) => {
    const w = createWorld({ seed, competence: 0.6 });
    w.hero.locationId = 'street_main';
    w.hero.level = level;
    w.hero.maxHp = w.hero.hp = 90 + 13 * (level - 1);
    w.heat.npd = 5;
    w.hero.vehicle = vehicleOf(MAKES[kind][0]!);
    return w;
  };

  it('a car is faster than legs, a police car faster than a civilian one, and damage slows it', () => {
    const w = driving('speed');
    const legs = legSpeed(w);
    expect(heroSpeed(w)).toBeGreaterThan(legs);
    const civ = heroSpeed(w);
    w.hero.vehicle = vehicleOf(MAKES.police[0]!);
    expect(heroSpeed(w)).toBeGreaterThan(civ);
    const fast = heroSpeed(w);
    w.hero.vehicle.hp = 10;
    expect(heroSpeed(w)).toBeLessThan(fast);
    delete w.hero.vehicle;
    expect(heroSpeed(w)).toBe(legs);
  });

  it('bands are what the gap says', () => {
    expect([0, 2, 5, 9].map(bandOf)).toEqual(['locked', 'close', 'near', 'far']);
  });

  it('police chases always end, always read, and the wreck is permanent', () => {
    const results: Record<string, number> = {};
    for (let i = 0; i < 80; i++) {
      const w = driving(`pc-${i}`, (['civilian', 'police', 'atlas'] as const)[i % 3], 3 + (i % 8));
      const { c, events } = ctxOf(w, new Rng(`pc-${i}-rng`));
      const result = policeChase(c, 'ambush');
      expect(result).not.toBeNull();
      results[result!] = (results[result!] ?? 0) + 1;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      expect(events.some((e) => e.type === 'chase_end')).toBe(true);
      // (Unless she died in the one she grabbed on the way.)
      if ((result === 'wrecked' || result === 'bailed') && !w.over) expect(w.hero.vehicle).toBeUndefined();
      if (result === 'wrecked' && !w.over) expect(Object.keys(w.flags).some((k) => k.startsWith('wreck:'))).toBe(true);
    }
    expect(Object.keys(results).length).toBeGreaterThanOrEqual(2);
  });

  it('a dragon too fast to catch on foot can be chased down in a car', () => {
    const outcomes: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const w = driving(`dc-${i}`, 'police', 10);
      const dragon = spawnNpc(new Rng(`dc-${i}`), 'dr', 'hermes3', 'street_main');
      addNpc(w, dragon);
      const { c, events } = ctxOf(w, new Rng(`dc-${i}-r`));
      const r = dragonChase(c, dragon, 12, 'a courier dragon');
      outcomes[r] = (outcomes[r] ?? 0) + 1;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(outcomes.caught ?? 0).toBeGreaterThan(0);
  });

  it('cruisers carry two officers each', () => {
    const w = driving('cruisers');
    const cops = [0, 1, 2].map((k) => {
      const n = spawnNpc(new Rng('k'), `cop${k}`, 'npd_officer', 'street_main');
      addNpc(w, n);
      return n;
    });
    const cs = cruisers(cops);
    expect(cs).toHaveLength(2);
    expect(cs[0]!.crew).toHaveLength(2);
    expect(cs.every((x) => normalize({ ...vehicleOf(MAKES.police[0]!) }).hp > 0 && !!x.car)).toBe(true);
  });

  it('hitCar: guns lose armor off every hit, rams and fire do not', () => {
    const v = vehicleOf(MAKES.police[0]!);
    const gun = hitCar({ ...v }, 10, 'gun');
    const ram = hitCar({ ...v }, 10, 'ram');
    expect(gun.taken).toBe(10 - v.armor);
    expect(ram.taken).toBe(10);
    expect(runChase).toBeDefined();
  });
});

describe('car keys', () => {
  const street = (seed: string) => {
    const w = createWorld({ seed, competence: 0.5 });
    w.hero.locationId = 'street_main';
    return w;
  };
  /** A street with a car parked on it and somebody standing next to it, found by walking onto streets until one has. */
  const carWithPeople = (kind: Vehicle['kind']) => {
    for (let i = 0; i < 200; i++) {
      const w = createWorld({ seed: `key-${kind}-${i}`, competence: 0.5 });
      for (const id of Object.keys(w.locations)) {
        const loc = w.locations[id]!;
        if (loc.kind !== 'street' || loc.gen?.role !== 'street' && id !== 'street_main') continue;
        relocate(w, id);
        const car = parkedVehicle(w, loc);
        if (!car || car.kind !== kind) continue;
        const folk = Object.values(w.npcs).filter((n) => n.locationId === id && n.alive && !n.tags.includes('cop') && !n.tags.includes('security') && !n.tags.includes('robot') && !n.tags.includes('dragon') && n.archetype !== 'puppy');
        if (kind === 'civilian' && !folk.length) continue;
        return { w, loc, car, folk };
      }
    }
    return null;
  };

  it('a car with a person with it has a key, in their loot, once', () => {
    const found = carWithPeople('civilian');
    expect(found).not.toBeNull();
    const { w, loc, car } = found!;
    const holders = Object.values(w.npcs).filter((n) => n.loadout.some((i) => i.carId === car.id));
    expect(holders).toHaveLength(1);
    expect(holders[0]!.loadout.find((i) => i.carId === car.id)!.tags).toContain('key');
    assignKeys(w, loc);
    assignKeys(w, loc);
    expect(Object.values(w.npcs).flatMap((n) => n.loadout).filter((i) => i.carId === car.id)).toHaveLength(1);
  });

  it('the police car at a spot with officers is keyed to an officer', () => {
    const w = street('key-cops');
    const loc = w.locations.street_main!;
    const cops = spawnGroup({ w, rng: new Rng('k'), emit: () => {} }, 'npd_officer', 2);
    const car = parkedVehicle(w, loc)!;
    expect(car.kind).toBe('police');
    const holder = cops.find((n) => n.loadout.some((i) => i.carId === car.id));
    expect(holder).toBeDefined();
  });

  it('with its key she gets in without a hijack, and nobody sees', () => {
    const found = carWithPeople('civilian')!;
    const { w, loc, car } = found;
    w.hero.inventory.push(carKey(car));
    const keys = gather(w).map((x) => x.key);
    expect(keys).toContain(`usekey:${loc.id}`);
    expect(keys).not.toContain(`hijack:${loc.id}`);
    const { c, events } = ctxOf(w, never());
    perform(c, gather(w).find((x) => x.key === `usekey:${loc.id}`)!);
    expect(w.hero.vehicle?.id).toBe(car.id);
    expect(w.heat.npd ?? 0).toBe(0);
    expect(parkedVehicle(w, loc)).toBeNull();
    expect(events.every(hasTemplate)).toBe(true);
  });

  it('a car she has the key to lasts three times as long parked; police, Atlas and gangers\' cars do not', () => {
    const civ = vehicleOf(MAKES.civilian[0]!, 'a');
    const base = lifeOf(civ, undefined);
    expect(lifeOf(civ, carKey(civ))).toBe(base * KEY_LIFE);
    expect(lifeOf(civ, carKey(civ, true))).toBe(base);
    const cop = vehicleOf(MAKES.police[0]!, 'b');
    expect(lifeOf(cop, carKey(cop))).toBe(lifeOf(cop, undefined));
    const atlas = vehicleOf(MAKES.atlas[0]!, 'c');
    expect(lifeOf(atlas, carKey(atlas))).toBe(lifeOf(atlas, undefined));

    // And it is what relocate uses when she walks into a building.
    const w = street('key-park');
    w.hero.vehicle = vehicleOf(MAKES.civilian[0]!, 'mine');
    w.hero.inventory.push(carKey(w.hero.vehicle));
    relocate(w, 'halo_floor');
    expect(w.hero.parked![0]!.until - w.clock).toBe(base * KEY_LIFE);
  });

  it('keys are not for sale', () => {
    const k = carKey(vehicleOf(MAKES.civilian[0]!, 'z'));
    expect(sellable(k)).toBe(false);
  });

  it('a cruiser still running when a chase ends is left on the street, with its key on the officer', () => {
    let left = 0;
    for (let i = 0; i < 80 && !left; i++) {
      const w = createWorld({ seed: `stray-${i}`, competence: 0.6 });
      w.hero.locationId = 'street_main';
      w.heat.npd = 5;
      w.hero.vehicle = vehicleOf(MAKES.civilian[0]!, 'mine');
      const { c } = ctxOf(w, new Rng(`stray-${i}-r`));
      const cops = spawnGroup(c, 'npd_officer', 2);
      policeChase(c, 'ambush', cops);
      const stray = w.strays?.street_main;
      if (stray) {
        left++;
        expect(stray.kind).toBe('police');
        expect(cops.some((n) => n.loadout.some((it) => it.carId === stray.id))).toBe(true);
      }
    }
    expect(left).toBeGreaterThan(0);
  });
});
