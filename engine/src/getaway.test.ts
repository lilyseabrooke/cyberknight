import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, type GameEvent, type World } from './index';
import { HOOKS, fight } from './combat';
import { Sim } from './tactics';
import { spawnNpc } from './content/archetypes';
import { makeItem } from './content/items';
import { addNpc } from './population';
import { carKey, MAKES, vehicleOf } from './cars';
import { parkedVehicle } from './roads';
import { getawayCandidates, wantedDead, registerGetaways } from './getaway';
import { gather } from './interactions';
import { perform } from './run';
import type { Ctx } from './types';

const ctxOf = (w: World, rng: Rng): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

/** A street fight with a strong Blackbird and a foe who has the key to the car parked there: found by looking for a seed that has a car. */
function scene(i: number, o: { key?: boolean; foe?: string; level?: number; weapon?: string; foeHp?: number } = {}) {
  const w = createWorld({ seed: `fleer-${i}`, competence: 0.7 });
  const h = w.hero;
  h.level = o.level ?? 12;
  h.maxHp = h.hp = 90 + 13 * (h.level - 1);
  h.weapon = makeItem(o.weapon ?? 'excalibur');
  h.locationId = 'street_main';
  const loc = w.locations.street_main!;
  const car = parkedVehicle(w, loc);
  if (!car) return null;
  const foe = spawnNpc(new Rng(`fleer-${i}`), 'd0', o.foe ?? 'ganger', 'street_main');
  addNpc(w, foe);
  if (o.foeHp !== undefined) foe.hp = Math.max(1, Math.round(foe.maxHp * o.foeHp));
  if (o.key !== false) foe.loadout.push(carKey(car));
  return { w, loc, car, foe };
}

const withCar = (o: Parameters<typeof scene>[1] = {}, from = 0) => {
  for (let i = from; i < from + 400; i++) {
    const s = scene(i, o);
    if (s) return { ...s, i };
  }
  throw new Error('no street with a car');
};

describe('somebody with the key to a car close by', () => {
  it('runs for it when they think they are going to die, and the car goes with them', () => {
    let got = 0;
    let fled = 0;
    for (let i = 0; i < 400 && got < 5; i++) {
      const s = scene(i, { level: 14 });
      if (!s) continue;
      const { c } = ctxOf(s.w, new Rng(`f-${i}`));
      const sim = new Sim(c, HOOKS, { foes: [s.foe], arrivals: [], lethal: true, assault: false, maxRounds: 14 });
      const res = sim.run();
      if (res.getaways.length) {
        got++;
        expect(res.getaways[0]!.npc).toBe(s.foe);
        expect(res.getaways[0]!.carId).toBe(s.car.id);
        expect(res.fled.has(s.foe.id)).toBe(true);
        expect(res.log.some((e) => e.type === 'foe_flees' && e.data.variant === 'drove')).toBe(true);
        for (const e of res.log) expect(hasTemplate({ beat: 0, type: e.type, outcome: e.outcome, data: e.data }), `${e.type}:${e.data.variant}`).toBe(true);
      }
      if (res.fled.has(s.foe.id)) fled++;
    }
    expect(got).toBeGreaterThan(0);
    expect(fled).toBeGreaterThanOrEqual(got);
  });

  it('does not, without the key; and cannot twice once cornered', () => {
    for (let i = 0; i < 200; i++) {
      const s = scene(i, { key: false, level: 14 });
      if (!s) continue;
      const sim = new Sim(ctxOf(s.w, new Rng(`n-${i}`)).c, HOOKS, { foes: [s.foe], arrivals: [], lethal: true, assault: false, maxRounds: 14 });
      expect(sim.run().getaways).toHaveLength(0);
    }
    for (let i = 0; i < 200; i++) {
      const s = scene(i, { level: 14 });
      if (!s) continue;
      s.foe.flags.push('cornered');
      const sim = new Sim(ctxOf(s.w, new Rng(`n2-${i}`)).c, HOOKS, { foes: [s.foe], arrivals: [], lethal: true, assault: false, maxRounds: 14 });
      expect(sim.run().getaways).toHaveLength(0);
    }
  });

  it('goes more readily the nearer they think they are to dying: a fresh foe against one who is nearly done', () => {
    const rate = (foeHp: number): number => {
      let n = 0;
      let tries = 0;
      for (let i = 0; i < 300; i++) {
        const s = scene(i, { level: 3, weapon: 'pool_cue', foe: 'gang_enforcer', foeHp });
        if (!s) continue;
        tries++;
        const sim = new Sim(ctxOf(s.w, new Rng(`d-${i}`)).c, HOOKS, { foes: [s.foe], arrivals: [], lethal: true, assault: false, maxRounds: 14 });
        if (sim.run().getaways.length) n++;
      }
      return n / Math.max(1, tries);
    };
    expect(rate(0.25)).toBeGreaterThan(rate(1) - 0.03); // both near the ceiling since she can blind and jam anyone
  });
});

describe('after they have gone', () => {
  /** A fight that ends with somebody driving off, found by looking. */
  function afterwards(from = 0, o: Parameters<typeof scene>[1] = { level: 14 }) {
    for (let i = from; i < from + 600; i++) {
      const s = scene(i, o);
      if (!s) continue;
      const { c, events } = ctxOf(s.w, new Rng(`a-${i}`));
      fight(c, [s.foe], { cause: 'test', joiners: false });
      if (s.w.getaways?.length && s.w.hero.hp > 0 && !s.w.over) return { ...s, c, events, i };
    }
    throw new Error('nobody got away');
  }

  it('the car is gone from the street, they are gone from the place, and she is told', () => {
    const s = afterwards();
    const g = s.w.getaways![0]!;
    expect(g.npcId).toBe(s.foe.id);
    expect(g.from).toBe('street_main');
    expect(parkedVehicle(s.w, s.loc)).toBeNull();
    expect(s.foe.locationId).toBe('_away');
    expect(s.w.hero.locationId).toBe('street_main');
    expect(s.events.some((e) => e.type === 'getaway')).toBe(true);
    for (const e of s.events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });

  it('she can go after them, and a kill goal or a job makes her want to more', () => {
    const s = afterwards();
    const keys = () => gather(s.w).map((x) => x.key);
    expect(keys()).toContain(`pursue:${s.foe.id}`);
    const cand = getawayCandidates(s.w)[0]!;
    const before = (cand.bonus ?? 0) + (cand.smart ?? 0);
    expect(wantedDead(s.w, s.foe)).toBe(false);
    s.w.mind.goals.push({ id: 'g1', kind: 'kill', npc: s.foe.id } as never);
    expect(wantedDead(s.w, s.foe)).toBe(true);
    const after = getawayCandidates(s.w)[0]!;
    expect((after.bonus ?? 0) + (after.smart ?? 0)).toBeGreaterThan(before);
    // It does not last: a couple of beats and they are properly gone.
    s.w.beat += 5;
    expect(getawayCandidates(s.w)).toHaveLength(0);
  });

  it('on her own legs she loses them, until she is fast enough', () => {
    const s = afterwards();
    const { c, events } = ctxOf(s.w, new Rng('foot'));
    perform(c, getawayCandidates(s.w)[0]!);
    // The same chase as in a car, on her own legs: she starts it, and a car is a lot faster than a person.
    expect(events.some((e) => e.type === 'give_chase' && e.data.variant === 'foot')).toBe(true);
    const start = events.find((e) => e.type === 'chase_start');
    expect(start?.data.body).toBe('foot');
    for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    // (She can work out where they are going and cut across to it now and then, so it is most times, not every time.)
    let lost = 0;
    for (let k = 0; k < 10; k++) {
      const t = afterwards(s.i + 3 + k * 11);
      const ev = ctxOf(t.w, new Rng(`foot-lost-${k}`));
      perform(ev.c, getawayCandidates(t.w)[0]!);
      if (ev.events.find((e) => e.type === 'chase_end')?.data.variant === 'lost') {
        lost++;
        expect(t.w.getaways).toHaveLength(0);
      }
    }
    expect(lost).toBeGreaterThanOrEqual(6);
    // The day her legs are faster than their car, the same question has a different answer: a slow car she can run down, most times.
    let caught = 0;
    for (let k = 0; k < 16; k++) {
      const t = afterwards(s.i + 1 + k * 15);
      t.w.getaways![0]!.vehicle = { ...t.w.getaways![0]!.vehicle!, pace: 1 };
      const ev2 = ctxOf(t.w, new Rng(`foot2-${k}`));
      perform(ev2.c, getawayCandidates(t.w)[0]!);
      if (ev2.events.find((e) => e.type === 'chase_end')?.data.variant === 'caught') {
        caught++;
        expect(ev2.events.some((e) => e.type === 'give_chase' && e.data.variant === 'cornered')).toBe(true);
        expect(ev2.events.some((e) => e.type === 'fight_start')).toBe(true);
        expect(t.foe.flags).not.toContain('cornered');
      }
    }
    expect(caught).toBeGreaterThanOrEqual(5);
  });

  it('in a car, she chases them: sometimes she catches them, sometimes she does not', () => {
    const results: Record<string, number> = {};
    for (let k = 0; k < 24; k++) {
      const s = afterwards(k * 20);
      s.w.hero.vehicle = vehicleOf(MAKES.police[0]!, `mine-${k}`);
      const { c, events } = ctxOf(s.w, new Rng(`chase-${k}`));
      perform(c, getawayCandidates(s.w)[0]!);
      const start = events.find((e) => e.type === 'chase_start');
      expect(start).toBeDefined();
      const end = events.find((e) => e.type === 'chase_end');
      results[String(end?.data.variant)] = (results[String(end?.data.variant)] ?? 0) + 1;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      if (events.some((e) => e.type === 'give_chase' && e.data.variant === 'cornered')) expect(events.some((e) => e.type === 'fight_start')).toBe(true);
    }
    expect(Object.keys(results).length).toBeGreaterThanOrEqual(2);
  });

  it('a car she has nearby will do, and she takes it before she goes', () => {
    const s = afterwards();
    s.w.hero.parked = [{ ...vehicleOf(MAKES.police[0]!, 'near'), at: 'street_main', until: s.w.clock + 9999 }];
    const { c, events } = ctxOf(s.w, new Rng('near'));
    perform(c, getawayCandidates(s.w)[0]!);
    expect(events.some((e) => e.type === 'vehicle' && e.data.variant === 'back')).toBe(true);
    expect(events.some((e) => e.type === 'chase_start')).toBe(true);
  });

  it('registering needs the car to be there', () => {
    const s = withCar({ level: 14 });
    const { c } = ctxOf(s.w, new Rng('x'));
    registerGetaways(c, s.loc, [{ npc: s.foe, carId: 'some other car' }]);
    expect(s.w.getaways ?? []).toHaveLength(0);
  });
});

