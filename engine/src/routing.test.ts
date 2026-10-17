import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, personalityFrom, type GameEvent, type World } from './index';
import { relocate } from './combat';
import { expand, liftCordon } from './mapgen';
import { gather } from './interactions';
import { ALL_MAKES, MAKES, SPEED_BOOST, makesOf, vehicleOf } from './cars';
import { ROAD, parkedVehicle, roadClass, roadsFrom, scene, trafficAt, trafficWord, type RoadClass } from './roads';
import { policeChase } from './chase';
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
    // On a bike the quick way is down the alley and the careful way is the two streets round.
    const w = createWorld({ seed: 'two', competence: 0.5 });
    const base = w.locations.street_main!;
    const mk = (id: string, name: string, to: Id): Location => ({ ...base, id, name, exits: [{ to, label: 'back', hidden: false, gate: null }], gen: undefined, crowded: false, cameras: 0 });
    const alley = mk('W', 'Brass Alley', 'street_main');
    const s1 = mk('S1', 'Tin Street', 'street_main');
    const s2 = mk('S2', 'Rust Street', 'S1');
    const goal = mk('G', 'Goal Avenue', 'W');
    goal.exits.push({ to: 'S2', label: 'x', hidden: false, gate: null });
    alley.exits.push({ to: 'G', label: 'on', hidden: false, gate: null });
    s1.exits.push({ to: 'S2', label: 'on', hidden: false, gate: null });
    s2.exits.push({ to: 'G', label: 'on', hidden: false, gate: null });
    for (const l of [alley, s1, s2, goal]) w.locations[l.id] = l;
    base.exits.push({ to: 'W', label: 'alley', hidden: false, gate: null }, { to: 'S1', label: 'street', hidden: false, gate: null });
    const r = routesFrom(w, 'street_main', 6, 'bike').find((x) => x.id === 'G')!;
    expect(r.fast.path).toEqual(['W', 'G']);
    expect(r.safe.path).toEqual(['S1', 'S2', 'G']);
    // A car can't take the alley at all, so it has only the one way.
    const car1 = routesFrom(w, 'street_main', 6, 'car').find((x) => x.id === 'G')!;
    expect(car1.fast.path).toEqual(['S1', 'S2', 'G']);
    expect(car1.safe.path).toEqual(['S1', 'S2', 'G']);
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
      // (If somebody called it in and she was still in one piece, the police came.)
      if (!w.over && events.some((e) => e.type === 'accident' && e.data.variant === 'chase') && !events.some((e) => e.type === 'accident' && e.data.variant === 'wreck')) expect(events.some((e) => e.type === 'chase_start')).toBe(true);
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

describe('how busy a street is', () => {
  const at = (hour: number, weather: World['situation']['weather'] = 'neon_fog') => ({ clock: hour * 60, situation: { weather } as World['situation'] });
  const street = (district: string, name = 'Brass Street', crowded = false) => ({ name, gen: { district } as never, crowded }) as Pick<Location, 'name' | 'road' | 'gen' | 'crowded'>;

  it('follows the district and the hour: nightlife after dark, corporate at the commute, markets by day', () => {
    const night = street('nightlife');
    expect(trafficAt(at(1), night)).toBeGreaterThan(trafficAt(at(12), night) + 0.3);
    const corp = street('corporate');
    expect(trafficAt(at(8), corp)).toBeGreaterThan(trafficAt(at(3), corp) + 0.4);
    expect(trafficAt(at(17.5), corp)).toBeGreaterThan(trafficAt(at(11), corp));
    const market = street('market');
    expect(trafficAt(at(13), market)).toBeGreaterThan(trafficAt(at(3), market) + 0.3);
    const ind = street('industrial');
    expect(trafficAt(at(6), ind)).toBeGreaterThan(trafficAt(at(2), ind));
    // The slums are never very busy.
    for (let h = 0; h < 24; h++) expect(trafficAt(at(h), street('slum'))).toBeLessThan(0.55);
  });

  it('is not rolled, stays in 0 to 1, and is lower in acid rain', () => {
    const s = street('nightlife');
    for (let h = 0; h < 24; h += 0.5) {
      const t = trafficAt(at(h), s);
      expect(t).toBe(trafficAt(at(h), s));
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
    expect(trafficAt(at(1, 'acid_rain'), s)).toBeLessThan(trafficAt(at(1), s));
    expect(trafficAt({ ...at(1), clock: 1 * 60 + 24 * 60 * 5 }, s)).toBeCloseTo(trafficAt(at(1), s), 10); // the same hour, another day
  });

  it('depends on the kind of street as well: a pedestrian way fills with people, an alley hardly at all', () => {
    const ped = trafficAt(at(1), street('nightlife', 'Velvet Walk'));
    const st = trafficAt(at(1), street('nightlife', 'Velvet Street'));
    const alley = trafficAt(at(1), street('nightlife', 'Velvet Alley'));
    expect(ped).toBeGreaterThanOrEqual(st);
    expect(alley).toBeLessThan(st);
    expect(trafficAt(at(1), street('nightlife', 'Velvet Street', true))).toBeGreaterThan(st);
    expect(trafficWord(0.05)).toBe('empty');
    expect(trafficWord(0.3)).toBe('quiet');
    expect(trafficWord(0.5)).toBe('busy');
    expect(trafficWord(0.9)).toBe('packed');
    expect(scene('pedestrian', 0.05)).toBe('an empty pedestrian way');
    expect(scene('highway', 0.9)).toBe('a packed highway');
  });

  it('changes the odds as much as the road does: an empty pedestrian way can be a safer drive than a packed highway', () => {
    const w = createWorld({ seed: 'busy', competence: 0.5 });
    const c = car();
    for (const k of CLASSES) expect(hopChance(w, c, k, 0.6, 0.9)).toBeGreaterThan(hopChance(w, c, k, 0.6, 0.05));
    expect(hopChance(w, c, 'highway', 0.6, 0.95)).toBeGreaterThan(hopChance(w, c, 'highway', 0.6, 0.05) * 10);
    expect(hopChance(w, c, 'pedestrian', 0.4, 0.05)).toBeLessThan(hopChance(w, c, 'highway', 0.4, 0.95));
    // ...but not at speed, where the narrow street still wins.
    expect(hopChance(w, c, 'pedestrian', 1, 0.05)).toBeGreaterThan(hopChance(w, c, 'highway', 1, 0.95));
  });

  it('slows a drive down, and she weighs it when she picks a speed and a way', () => {
    const quiet = createWorld({ seed: 'tq', competence: 0.5 });
    const loud = createWorld({ seed: 'tl', competence: 0.5 });
    const mk = (w: World, hour: number) => {
      w.clock = hour * 60;
      const ids = strip(w, ['A Street', 'B Street', 'C Street']);
      for (const id of ids) w.locations[id]!.gen = { district: 'nightlife' } as never;
      return ids;
    };
    const a = mk(quiet, 12);
    const b = mk(loud, 1);
    expect(routeMinutes(loud, car(), b, 0.6)).toBeGreaterThan(routeMinutes(quiet, car(), a, 0.6));
    expect(routeChance(loud, car(), b, 0.6)).toBeGreaterThan(routeChance(quiet, car(), a, 0.6));
    expect(chooseSpeed(loud, b)).toBeLessThan(chooseSpeed(quiet, a));
  });
});

describe('chases use the road and how busy it is, together', () => {
  const chaseOn = (seed: string, name: string, hour: number, district = 'nightlife') => {
    const w = createWorld({ seed, competence: 0.6 });
    w.clock = hour * 60;
    const [id] = strip(w, [name]);
    w.locations[id!]!.gen = { district } as never;
    w.hero.locationId = id!;
    w.hero.level = 6;
    w.hero.maxHp = w.hero.hp = 155;
    w.heat.npd = 5;
    w.hero.vehicle = vehicleOf(MAKES.civilian[0]!, `c-${seed}`);
    return w;
  };

  it('tells what the road is: the same street is empty at noon and packed after midnight', () => {
    const first = (hour: number): GameEvent => {
      const w = chaseOn(`road-${hour}`, 'Velvet Walk', hour);
      const { c, events } = ctxOf(w, new Rng('r'));
      policeChase(c, 'ambush');
      return events.find((e) => e.type === 'chase_round')!;
    };
    const day = first(12);
    const night = first(1);
    expect(day.data.road).toBe('pedestrian');
    expect(night.data.road).toBe('pedestrian');
    expect(['empty', 'quiet']).toContain(day.data.traffic);
    expect(['busy', 'packed']).toContain(night.data.traffic);
    expect(String(night.data.scene)).toContain('pedestrian way');
    expect(hasTemplate(night)).toBe(true);
  });

  it('a crowded narrow street wrecks more chases than an empty one', () => {
    const crashes = (hour: number): number => {
      let n = 0;
      for (let i = 0; i < 120; i++) {
        const w = chaseOn(`crash-${hour}-${i}`, 'Velvet Walk', hour);
        const { c, events } = ctxOf(w, new Rng(`crash-${hour}-${i}`));
        policeChase(c, 'ambush');
        n += events.filter((e) => e.type === 'accident').length;
        for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      }
      return n;
    };
    expect(crashes(1)).toBeGreaterThan(crashes(12));
  });

  it('can be lost in a tight, busy street and is a race on an open one', () => {
    const lost = (name: string, hour: number): number => {
      let n = 0;
      for (let i = 0; i < 100; i++) {
        const w = chaseOn(`lose-${name}-${hour}-${i}`, name, hour, 'market');
        const { c, events } = ctxOf(w, new Rng(`lose-${i}`));
        policeChase(c, 'ambush');
        if (events.some((e) => e.type === 'chase_round' && e.data.variant === 'lose_them')) n++;
      }
      return n;
    };
    expect(lost('Brass Walk', 13)).toBeGreaterThan(lost('Highway', 4));
  });
});
