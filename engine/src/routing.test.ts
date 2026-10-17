import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, personalityFrom, type GameEvent, type World } from './index';
import { relocate } from './combat';
import { expand, liftCordon } from './mapgen';
import { gather } from './interactions';
import { ALL_MAKES, MAKES, SPEED_BOOST, makesOf, vehicleOf } from './cars';
import { ROAD, parkedVehicle, roadClass, roadsFrom, type RoadClass } from './roads';
import { DEFAULT_SPEED, chooseSpeed, daringOf, driveAlong, hopChance, routeChance, routeMinutes, routesFrom, rushOf } from './drivefx';
import { always } from './testkit';
import type { Ctx, Id, Location, Vehicle } from './types';

const ctxOf = (w: World, rng: Rng = new Rng('c')): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

const car = (): Vehicle => vehicleOf(MAKES.civilian[0]!, 'car-a');
const bike = (): Vehicle => vehicleOf(makesOf('civilian', 'bike')[1]!, 'bike-a');
const CLASSES: RoadClass[] = ['highway', 'street', 'small', 'pedestrian'];

/** A little graph of streets of the classes given, hung off street_main: A -> s1 -> s2 ..., each a street of its own kind. */
function strip(w: World, names: string[]): Id[] {
  const base = w.locations.street_main!;
  let prev: Location = base;
  const ids: Id[] = [];
  names.forEach((name, i) => {
    const id = `T_${i}`;
    const loc: Location = { ...base, id, name, road: name === 'Highway' ? 'highway' : undefined, exits: [{ to: prev.id, label: 'back', hidden: false, gate: null }], gen: undefined, crowded: false, cameras: 0 };
    w.locations[id] = loc;
    prev.exits.push({ to: id, label: name, hidden: false, gate: null });
    prev = loc;
    ids.push(id);
  });
  return ids;
}

describe('what a street is', () => {
  it('is read from its name, with highways marked, and the hand-built ones known', () => {
    const named = (name: string, gen = true) => roadClass({ name, gen: gen ? ({} as never) : undefined });
    expect(named('Cinder Alley')).toBe('alley');
    expect(named('Ghost Passage')).toBe('alley');
    expect(named('Velvet Walk')).toBe('pedestrian');
    expect(named('Lantern Arcade')).toBe('pedestrian');
    expect(named('Brass Plaza')).toBe('pedestrian');
    expect(named('Rust Lane')).toBe('small');
    expect(named('Quiet Terrace')).toBe('small');
    expect(named('Pylon Avenue')).toBe('street');
    expect(named('Lucky Boulevard')).toBe('street');
    expect(roadClass({ name: 'The Ember Expressway', road: 'highway' })).toBe('highway');
    const w = createWorld({ seed: 'hand', competence: 0.5 });
    expect(roadClass(w.locations.halo_alley!)).toBe('alley');
    expect(roadClass(w.locations.street_main!)).toBe('street');
  });

  it('gets harder as it gets smaller, and a highway is the easiest of all', () => {
    const order = CLASSES.map((c) => ROAD[c].hard);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(ROAD.alley.hard).toBe(1);
    expect(ROAD.highway.effort).toBeLessThan(ROAD.street.effort);
  });
});

describe('the odds of an accident', () => {
  const w = createWorld({ seed: 'odds', competence: 0.5 });
  const c = car();

  it('are higher on harder streets, and climb steeply toward top speed', () => {
    for (const s of [0.5, 0.8, 1]) {
      const ps = CLASSES.map((k) => hopChance(w, c, k, s));
      expect(ps).toEqual([...ps].sort((a, b) => a - b));
    }
    for (const k of CLASSES) {
      const slow = hopChance(w, c, k, 0.55);
      const mid = hopChance(w, c, k, 0.8);
      const flat = hopChance(w, c, k, 1);
      expect(slow).toBeLessThan(mid);
      expect(mid).toBeLessThan(flat);
    }
    // Dramatic: flat out on a small street is several times the ordinary pace.
    expect(hopChance(w, c, 'small', 1)).toBeGreaterThan(hopChance(w, c, 'small', 0.6) * 4);
    // And a highway barely cares.
    expect(hopChance(w, c, 'highway', 1)).toBeLessThan(hopChance(w, c, 'street', 0.6));
  });

  it('fall with practice, and rise with drink, damage and acid rain', () => {
    const w2 = createWorld({ seed: 'odds2', competence: 0.5 });
    const base = hopChance(w2, c, 'small', 0.8);
    w2.hero.skills.driving = 2000;
    expect(hopChance(w2, c, 'small', 0.8)).toBeLessThan(base * 0.5);
    w2.hero.skills.driving = 0;
    w2.hero.drunk = 4;
    expect(hopChance(w2, c, 'small', 0.8)).toBeGreaterThan(base);
    w2.hero.drunk = 0;
    expect(hopChance(w2, { ...c, hp: 10 }, 'small', 0.8)).toBeGreaterThan(base);
    w2.situation.weather = 'acid_rain';
    expect(hopChance(w2, c, 'small', 0.8)).toBeGreaterThan(base);
  });

  it('are smaller on a bike, especially at speed and on the hard streets', () => {
    const b = bike();
    for (const k of CLASSES) expect(hopChance(w, b, k, 0.6)).toBeLessThan(hopChance(w, c, k, 0.6));
    const gapSlow = hopChance(w, c, 'small', 0.55) - hopChance(w, b, 'small', 0.55);
    const gapFast = hopChance(w, c, 'small', 1) - hopChance(w, b, 'small', 1);
    expect(gapFast).toBeGreaterThan(gapSlow * 3);
    const easy = hopChance(w, c, 'street', 1) / hopChance(w, b, 'street', 1);
    const hard = hopChance(w, c, 'pedestrian', 1) / hopChance(w, b, 'pedestrian', 1);
    expect(hard).toBeGreaterThan(easy);
  });

  it('add up over a route', () => {
    const [a] = strip(createWorld({ seed: 'sum', competence: 0.5 }), ['Brass Lane']);
    expect(a).toBeDefined();
    const wx = createWorld({ seed: 'sum2', competence: 0.5 });
    const ids = strip(wx, ['Brass Lane', 'Tin Lane', 'Rust Lane']);
    const one = routeChance(wx, c, ids.slice(0, 1), 0.7);
    const three = routeChance(wx, c, ids, 0.7);
    expect(three).toBeGreaterThan(one);
    expect(three).toBeLessThan(3 * one + 1e-9);
  });
});

describe('every vehicle is a quarter faster', () => {
  it('has the old pace times SPEED_BOOST, rounded', () => {
    expect(SPEED_BOOST).toBe(1.25);
    expect(MAKES.civilian[0]!.pace).toBe(10); // was 8
    expect(MAKES.police[0]!.pace).toBe(14); // was 11
    expect(makesOf('atlas', 'bike')[0]!.pace).toBe(18); // was 14
    for (const m of ALL_MAKES) expect(Number.isInteger(m.pace)).toBe(true);
  });
});

describe('where a car can go', () => {
  it('stays out of alleys, a bike does not, and a highway is cheap to reach along', () => {
    const w = createWorld({ seed: 'alley', competence: 0.5 });
    const [lane, alley, lane2] = strip(w, ['Brass Lane', 'Ghost Alley', 'Tin Lane']);
    expect(roadsFrom(w, 'street_main', 4, 'car').map((r) => r.id)).toEqual(expect.arrayContaining([lane!]));
    expect(roadsFrom(w, 'street_main', 4, 'car').some((r) => r.id === alley || r.id === lane2)).toBe(false);
    expect(roadsFrom(w, 'street_main', 4, 'bike').some((r) => r.id === lane2)).toBe(true);
    expect(routesFrom(w, 'street_main', 6, 'car').some((r) => r.id === alley)).toBe(false);
    expect(routesFrom(w, 'street_main', 6, 'bike').some((r) => r.id === alley)).toBe(true);

    const hw = createWorld({ seed: 'hw', competence: 0.5 });
    const ids = strip(hw, ['Highway', 'Highway', 'Highway', 'Highway', 'Highway', 'Highway']);
    // Six highway streets only take three streets' worth of reach.
    expect(routesFrom(hw, 'street_main', 3, 'car').some((r) => r.id === ids[5])).toBe(true);
    const sw = createWorld({ seed: 'st', competence: 0.5 });
    const st = strip(sw, ['A Street', 'B Street', 'C Street', 'D Street', 'E Street', 'F Street']);
    expect(routesFrom(sw, 'street_main', 3, 'car').some((r) => r.id === st[5])).toBe(false);
  });

  it('gives two ways when there are two, and the careful one dodges the hard street', () => {
    const w = createWorld({ seed: 'two', competence: 0.5 });
    const base = w.locations.street_main!;
    const mk = (id: string, name: string, to: Id): Location => ({ ...base, id, name, exits: [{ to, label: 'back', hidden: false, gate: null }], gen: undefined, crowded: false, cameras: 0 });
    const walk = mk('W', 'Brass Walk', 'street_main');
    const s1 = mk('S1', 'Tin Street', 'street_main');
    const s2 = mk('S2', 'Rust Street', 'S1');
    const s3 = mk('S3', 'Cinder Street', 'S2');
    const goal = mk('G', 'Goal Avenue', 'W');
    goal.exits.push({ to: 'S3', label: 'x', hidden: false, gate: null });
    walk.exits.push({ to: 'G', label: 'on', hidden: false, gate: null });
    s1.exits.push({ to: 'S2', label: 'on', hidden: false, gate: null });
    s2.exits.push({ to: 'S3', label: 'on', hidden: false, gate: null });
    s3.exits.push({ to: 'G', label: 'on', hidden: false, gate: null });
    for (const l of [walk, s1, s2, s3, goal]) w.locations[l.id] = l;
    base.exits.push({ to: 'W', label: 'walk', hidden: false, gate: null }, { to: 'S1', label: 'street', hidden: false, gate: null });
    const r = routesFrom(w, 'street_main', 6, 'car').find((x) => x.id === 'G')!;
    expect(r.fast.path).toEqual(['W', 'G']);
    expect(r.safe.path).toEqual(['S1', 'S2', 'S3', 'G']);
    expect(routeChance(w, car(), r.safe.path.slice(0, 3), 0.7)).toBeLessThan(routeChance(w, car(), ['W'], 0.7) * 3);
  });

  it('takes longer at a lower speed and in a slower car', () => {
    const w = createWorld({ seed: 'mins', competence: 0.5 });
    const ids = strip(w, ['A Street', 'B Street', 'C Street']);
    expect(routeMinutes(w, car(), ids, 0.5)).toBeGreaterThanOrEqual(routeMinutes(w, car(), ids, 1));
    expect(routeMinutes(w, car(), ids, 0.6)).toBeGreaterThanOrEqual(routeMinutes(w, vehicleOf(MAKES.police[0]!), ids, 0.6));
  });
});

describe('how fast she goes', () => {
  it('is about 55 to 65 percent when nothing is pressing, more when she is in a hurry or reckless, less on hard streets', () => {
    const w = createWorld({ seed: 'spd', competence: 0.5 });
    const ids = strip(w, ['A Street', 'B Street']);
    const calm = chooseSpeed(w, ids);
    expect(calm).toBeGreaterThanOrEqual(0.5);
    expect(calm).toBeLessThanOrEqual(0.68);
    expect(Math.abs(calm - DEFAULT_SPEED)).toBeLessThan(0.1);
    w.heat.npd = 8;
    expect(rushOf(w)).toBeGreaterThan(0.3);
    expect(chooseSpeed(w, ids)).toBeGreaterThan(calm + 0.1);
    w.heat.npd = 0;
    const hard = strip(w, ['X Walk', 'Y Walk']);
    expect(chooseSpeed(w, hard)).toBeLessThan(calm);
    const wild = createWorld({ seed: 'spd2', competence: 0.5, personality: personalityFrom({ reckless: 1, thrill: 1, impulsive: 1 }) });
    const careful = createWorld({ seed: 'spd3', competence: 0.5, personality: personalityFrom({ reckless: 0, thrill: 0, impulsive: 0 }) });
    expect(daringOf(wild)).toBeGreaterThan(daringOf(careful));
    expect(chooseSpeed(wild, strip(wild, ['A Street']))).toBeGreaterThan(chooseSpeed(careful, strip(careful, ['A Street'])));
  });
});

describe('when it goes wrong', () => {
  const driving = (seed: string, v: Vehicle, names: string[], level = 4) => {
    const w = createWorld({ seed, competence: 0.5 });
    w.hero.level = level;
    w.hero.maxHp = w.hero.hp = 90 + 13 * (level - 1);
    w.hero.vehicle = v;
    const ids = strip(w, names);
    w.hero.locationId = 'street_main';
    return { w, ids };
  };

  it('every accident is told, each of the five ways happens, and the aftermath is true', () => {
    const seen = new Set<string>();
    let strayBike = 0;
    for (let i = 0; i < 500; i++) {
      const { w, ids } = driving(`acc-${i}`, i % 2 ? bike() : car(), ['A Walk', 'B Walk', 'C Walk', 'D Walk', 'E Walk'], 3 + (i % 8));
      w.locations[ids[0]!]!.crowded = true;
      const { c, events } = ctxOf(w, new Rng(`acc-${i}-r`));
      const out = driveAlong(c, ids, 1);
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      for (const e of events) if (e.type === 'accident') seen.add(String(e.data.variant));
      if (events.some((e) => e.type === 'accident' && e.data.variant === 'wreck')) {
        expect(w.hero.vehicle).toBeUndefined();
        expect(out.over).toBe(true);
      }
      if (events.some((e) => e.type === 'accident' && e.data.variant === 'thrown') && w.hero.vehicle === undefined && w.strays?.[w.hero.locationId]) strayBike++;
      if (!w.over && events.some((e) => e.type === 'accident' && e.data.variant === 'chase')) expect(events.some((e) => e.type === 'chase_start')).toBe(true);
      expect(out.done).toBeLessThanOrEqual(ids.length);
    }
    for (const k of ['scrape', 'collision', 'chase', 'thrown', 'wreck']) expect(seen.has(k), k).toBe(true);
    expect(strayBike).toBeGreaterThan(0);
  });

  it('on a highway at an ordinary pace it all but never happens, and on a pedestrian way flat out it nearly always does', () => {
    let calm = 0;
    let mad = 0;
    for (let i = 0; i < 200; i++) {
      const a = driving(`hw-${i}`, car(), ['Highway', 'Highway', 'Highway']);
      const ctxA = ctxOf(a.w, new Rng(`hw-${i}`));
      driveAlong(ctxA.c, a.ids, 0.6);
      if (ctxA.events.some((e) => e.type === 'accident')) calm++;
      const b = driving(`pd-${i}`, car(), ['A Walk', 'B Walk', 'C Walk']);
      const ctxB = ctxOf(b.w, new Rng(`pd-${i}`));
      driveAlong(ctxB.c, b.ids, 1);
      if (ctxB.events.some((e) => e.type === 'accident')) mad++;
    }
    expect(calm).toBeLessThan(200 * 0.04);
    expect(mad).toBeGreaterThan(200 * 0.7);
  });

  it('with the dice at their worst, she still arrives or the story is told, never half of both', () => {
    const { w, ids } = driving('rigged', car(), ['A Walk', 'B Walk', 'C Walk', 'D Walk', 'E Walk', 'F Walk', 'G Walk', 'H Walk']);
    const { c, events } = ctxOf(w, always());
    const out = driveAlong(c, ids, 1);
    expect(out.over).toBe(true);
    expect(events.some((e) => e.type === 'accident')).toBe(true);
  });
});

describe('the highway', () => {
  it('has no buildings, no people, no parked cars, and almost nothing she can do but go on', () => {
    const w = createWorld({ seed: 'hwy', competence: 0.5 });
    const [id] = strip(w, ['Highway']);
    const loc = w.locations[id!]!;
    loc.road = 'highway';
    loc.populated = false;
    relocate(w, id!);
    expect(w.hero.locationId).toBe(id);
    expect(Object.values(w.npcs).filter((n) => n.locationId === id)).toHaveLength(0);
    expect(parkedVehicle(w, loc)).toBeNull();
    for (const x of gather(w)) expect(['go', 'drive', 'getin', 'usekey', 'hijack']).toContain(x.key.split(':')[0]);
  });

  it('the city grows them: some streets have an on-ramp, and what stands on a highway is more highway and ramps', () => {
    let found: Location | null = null;
    for (let i = 0; i < 80 && !found; i++) {
      const w = createWorld({ seed: `ramps-${i}`, competence: 0.5 });
      liftCordon(w);
      const todo: Location[] = [w.locations.street_main!];
      for (let n = 0; n < 60 && todo.length && !found; n++) {
        const loc = todo.shift()!;
        expand(w, loc);
        for (const e of loc.exits) {
          const to = w.locations[e.to]!;
          if (to.road === 'highway') {
            found = to;
            expand(w, to);
          } else if (to.kind === 'street' && to.gen && !to.gen.expanded) todo.push(to);
        }
      }
      if (found) {
        expect(roadClass(found)).toBe('highway');
        expect(found.kind).toBe('street');
        // Everything off it is another street: no doors, no rooms.
        expect(found.exits.every((e) => w.locations[e.to]!.kind === 'street')).toBe(true);
        expect(found.crowded).toBe(false);
        expect(found.name).toMatch(/Expressway|Freeway|Causeway|Skyway|Beltway|Flyover/);
      }
    }
    expect(found).not.toBeNull();
  });
});
