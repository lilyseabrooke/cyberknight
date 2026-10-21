import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, personalityFrom, render, type GameEvent, type World } from './index';
import { ambientDragons, dragonCandidates, demeterSeason, districtAround, gangActivity, spawnFlight } from './dragons';
import { DRAGON_MODELS, hasTrait, heroSpeed, hopMinutes, reachPerBeat, runsDown } from './dragonmodels';
import { ARCHETYPES, spawnNpc } from './content/archetypes';
import { ITEMS } from './content/items';
import { fight } from './combat';
import { addNpc, AWAY } from './population';
import { routeTo } from './plans';
import { BASE_MIN_PER_BEAT } from './clock';
import { foeProfile } from './tactics';
import { beginRun, endRun } from './universe';
import type { Candidate } from './candidate';
import type { Ctx, Flight } from './types';

/** A quiet world: nothing new flies in on its own, so a test sees only the dragons it brings. */
const world = (seed: string, competence = 0.9): World => {
  const w = createWorld({ seed, competence, personality: personalityFrom({}) });
  w.beat = 40;
  w.flags.quiet_skies = true;
  return w;
};
const ctxOf = (w: World, seed: string): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) } };
};
/** Let `n` beats go by, `minutes` apiece. */
const tick = (w: World, c: Ctx, n = 1, minutes = BASE_MIN_PER_BEAT): void => {
  for (let i = 0; i < n; i++) {
    w.beat++;
    w.clock += minutes;
    ambientDragons(c);
  }
};
const run = (cands: Candidate[], key: string, c: Ctx): void => {
  const cand = cands.find((x) => x.key === key);
  expect(cand, key).toBeTruthy();
  cand!.run(c);
};
const clearRoom = (w: World, loc: string): void => {
  for (const n of Object.values(w.npcs)) if (n.locationId === loc && !n.id.startsWith('tmp_')) n.alive = false;
};
/** A dragon with her, holding still. */
const withHer = (w: World, c: Ctx, model: string, opts: { count?: number } = {}): Flight => {
  const f = spawnFlight(c, model, opts.count ?? 1, { at: w.hero.locationId })!;
  f.roam!.nextAt = Infinity;
  f.roam!.met = true;
  f.roam!.heroAt = w.hero.locationId;
  w.flight = f;
  return f;
};
const live = (w: World): Flight[] => w.flights.filter((f) => f.roam?.stage !== 'away');

describe('the second batch of dragons: what they are', () => {
  it('every model is a real Atlas dragon with loot that exists, and the speeds say who is who', () => {
    for (const [id, m] of Object.entries(DRAGON_MODELS)) {
      const def = ARCHETYPES[id];
      expect(def, id).toBeTruthy();
      expect(def!.tags).toContain('dragon');
      expect(def!.faction).toBe('atlas');
      for (const l of def!.loot) expect(ITEMS[l], `${id}: ${l}`).toBeTruthy();
      expect(m.speed).toBeGreaterThan(0);
      const n = spawnNpc(new Rng(id), `x_${id}`, id, 'street_main');
      expect(n.role).toMatch(/cyberdragon/);
      expect(foeProfile(n).speed).toBe(m.speed);
    }
    expect(DRAGON_MODELS.hermes3!.speed).toBeGreaterThan(DRAGON_MODELS.hermes!.speed * 2);
    expect(DRAGON_MODELS.ares4!.speed).toBeGreaterThan(DRAGON_MODELS.ares2!.speed * 2);
    expect(DRAGON_MODELS.artemis2!.speed).toBeGreaterThan(DRAGON_MODELS.artemis!.speed);
    const hp = (id: string) => ARCHETYPES[id]!.hp!;
    expect(hp('demeter')).toBeLessThan(hp('demeter2'));
    expect(hp('demeter2')).toBeLessThan(hp('demeter3'));
    expect(hp('demeter3')).toBeLessThan(hp('demeter4'));
    expect(hp('ares2')).toBeLessThan(hp('ares4'));
    expect(hp('hermes')).toBeLessThan(hp('hermes3'));
  });

  it('whether she can catch a dragon is a matter of speed against speed', () => {
    const w = world('speed');
    expect(heroSpeed(w)).toBeGreaterThanOrEqual(1);
    expect(heroSpeed(w)).toBeLessThanOrEqual(7);
    for (const id of ['hermes3', 'ares4', 'artemis2']) expect(runsDown(w, DRAGON_MODELS[id]!.speed), id).toBe(false);
    expect(runsDown(w, 1)).toBe(true);
    expect(reachPerBeat(w, heroSpeed(w) * 2)).toBe(2);
    w.hero.reflex = 9;
    w.hero.implants.push('hydraulic_calves');
    expect(runsDown(w, DRAGON_MODELS.hermes3!.speed)).toBe(false);
    // and the slow ones are slow on the street
    expect(hopMinutes(DRAGON_MODELS.demeter!.speed)).toBeGreaterThan(hopMinutes(DRAGON_MODELS.hermes!.speed));
  });
});

describe('a visit to the district', () => {
  /** Hero indoors, nobody about: nothing for the dragon to do to her. */
  const quiet = (seed: string) => {
    const w = world(seed);
    w.hero.locationId = 'halo_floor';
    clearRoom(w, 'street_main');
    return { w, ...ctxOf(w, seed) };
  };

  it('it flies in at the edge of the district, a couple of streets off, and says so', () => {
    const { w, c, events } = quiet('arrive');
    const f = spawnFlight(c, 'demeter', 1)!;
    expect(f.locationId).not.toBe('halo_floor');
    const anchor = 'street_main'; // the street outside the bar
    const { dist } = districtAround(w, anchor);
    expect(dist[f.locationId]).toBeGreaterThanOrEqual(2);
    const ev = events.find((e) => e.type === 'dragon_flight')!;
    expect(ev.data.place).toBe(w.locations[f.locationId]!.name);
    expect(f.roam!.stage).toBe('stay');
    for (const id of f.ids) expect(w.npcs[id]!.locationId).toBe(f.locationId);
    // she isn't with it, so it isn't "the" flight
    tick(w, c);
    expect(w.flight).toBeNull();
  });

  it('a Demeter prowls slowly, taking in the district, and then takes off and is forgotten', () => {
    const { w, c, events } = quiet('prowl');
    const f = spawnFlight(c, 'demeter', 1)!;
    const ids = [...f.ids];
    const seen = new Set<string>([f.locationId]);
    let left = -1;
    for (let b = 0; b < 200 && w.flights.includes(f); b++) {
      tick(w, c);
      seen.add(f.locationId);
      if (left < 0 && f.roam!.stage === 'leave') left = b;
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    // a long stay: well over an hour of world time
    expect(left * BASE_MIN_PER_BEAT).toBeGreaterThanOrEqual(100);
    expect(events.some((e) => e.type === 'dragon_depart' || e.type === 'dragon_flight')).toBe(true);
    // far enough away, it is gone, bodies and all
    expect(w.flights).not.toContain(f);
    for (const id of ids) expect(w.npcs[id]).toBeUndefined();
  });

  it('a Demeter takes a share from anyone it finds', () => {
    const { w, c } = quiet('collect');
    const f = spawnFlight(c, 'demeter', 1)!;
    // somebody in each place it might visit
    const people = districtAround(w, 'street_main').nodes.filter((n) => n !== 'halo_floor').map((loc, i) => {
      const n = spawnNpc(new Rng(`p${i}`), `p${i}`, 'drifter', loc);
      n.cash = 100;
      addNpc(w, n);
      return n;
    });
    tick(w, c, 60);
    expect(people.some((n) => n.cash < 100)).toBe(true);
    expect(f.roam!.visited.length).toBeGreaterThan(2);
  });

  it('a Hermes picks a few places in the district, hits each, and goes', () => {
    const { w, c } = quiet('deliver');
    const f = spawnFlight(c, 'hermes', 1)!;
    const goals = [...f.roam!.goals];
    expect(goals.length).toBeGreaterThanOrEqual(3);
    let beats = 0;
    while (w.flights.includes(f) && f.roam!.stage === 'stay' && beats++ < 200) tick(w, c);
    expect(f.roam!.stage === 'leave' || !w.flights.includes(f)).toBe(true);
    for (const g of goals) expect(f.roam!.visited, g).toContain(g);
    // quick: a short round, nothing like the Demeter's
    expect(beats * BASE_MIN_PER_BEAT).toBeLessThan(90);
  });

  it('an Artemis makes one fast sweep of everything and takes off', () => {
    const { w, c } = quiet('sweep');
    const f = spawnFlight(c, 'artemis', 2)!;
    expect(f.ids.length).toBe(2);
    let beats = 0;
    while (f.roam!.stage === 'stay' && beats++ < 200) tick(w, c);
    // (Nearly all of it: the lab lot gave the district another arm, and a fast sweep can run out of time one stop short.)
    expect(f.roam!.district.filter((d) => !f.roam!.visited.includes(d)).length).toBeLessThanOrEqual(1);
    expect(beats * BASE_MIN_PER_BEAT).toBeLessThan(60);
    // the pack moves as one
    expect(new Set(f.ids.map((id) => w.npcs[id]!.locationId)).size).toBe(1);
  });

  it('an Ares crashes about, hurting whoever is there, and leaves when nobody is left to hurt', () => {
    const { w, c } = quiet('rampage');
    const f = spawnFlight(c, 'ares2', 1)!;
    const crowd = districtAround(w, 'street_main').nodes.filter((n) => n !== 'halo_floor').flatMap((loc, i) => {
      const n = spawnNpc(new Rng(`g${i}`), `g${i}`, 'drifter', loc);
      n.ephemeral = true;
      addNpc(w, n);
      return [n];
    });
    let beats = 0;
    while (f.roam!.stage === 'stay' && beats++ < 300) tick(w, c);
    // it found somebody, and they are not all still standing
    expect(crowd.some((n) => !n.alive || n.dying)).toBe(true);
    // and then it ran out of people and got bored, long before its time was up
    expect(f.roam!.stage).toBe('leave');
    expect(w.clock).toBeLessThan(f.roam!.until + 10);
    expect(f.roam!.lastHit).toBeGreaterThan(0);
  });

  it('an Ares with nobody to hit gives up quickly', () => {
    const { w, c } = quiet('bored');
    for (const loc of districtAround(w, 'street_main').nodes) clearRoom(w, loc);
    const f = spawnFlight(c, 'ares2', 1)!;
    let beats = 0;
    while (f.roam!.stage === 'stay' && beats++ < 300) tick(w, c);
    expect(f.roam!.stage).toBe('leave');
    expect(beats * BASE_MIN_PER_BEAT).toBeLessThan(75);
  });

  it('it leaves by taking flight, and is dropped once it is far enough from her', () => {
    const { w, c, events } = quiet('leave');
    const f = spawnFlight(c, 'hermes', 1)!;
    f.roam!.until = w.clock; // it has had enough
    tick(w, c);
    expect(f.roam!.stage).toBe('leave');
    expect(w.flights).toContain(f);
    let beats = 0;
    while (w.flights.includes(f) && beats++ < 40) tick(w, c);
    expect(w.flights).not.toContain(f);
    expect(beats).toBeLessThan(20);
    // close enough to hear it go
    expect(events.filter((e) => e.type === 'dragon_depart').length + events.filter((e) => e.type === 'dragon_flight').length).toBeGreaterThan(0);
  });

  it('she hears one from the next street over', () => {
    const w = world('near');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'near');
    const f = spawnFlight(c, 'demeter', 1, { at: 'halo_alley' })!;
    f.roam!.nextAt = Infinity;
    tick(w, c);
    expect(events.some((e) => e.type === 'dragon_near' && e.data.variant === 'demeter')).toBe(true);
    // not every beat
    const n = events.filter((e) => e.type === 'dragon_near').length;
    tick(w, c, 3);
    expect(events.filter((e) => e.type === 'dragon_near').length).toBe(n);
  });

  it('one that turns into her street is "with her": she can deal with it, and it stops being her business when it moves on', () => {
    const w = world('meet');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'meet');
    const f = spawnFlight(c, 'demeter', 1, { at: 'halo_alley', temper: { territoriality: 0, curiosity: 1 } })!;
    f.roam!.nextAt = w.clock; // moves now
    f.roam!.visited = ['halo_alley', 'street_main~0', 'street_main~1']; // so it fancies the street
    for (let b = 0; b < 60 && w.flight !== f; b++) {
      tick(w, c);
      if (f.locationId !== 'street_main') f.roam!.nextAt = w.clock;
    }
    expect(w.flight).toBe(f);
    expect(events.some((e) => e.type === 'dragon_close' && e.data.variant === 'demeter')).toBe(true);
    // it carries on without her
    f.hidden = true;
    f.roam!.nextAt = w.clock;
    tick(w, c, 20);
    expect(f.locationId === 'street_main' && w.flight === f).toBe(false);
    expect(events.some((e) => e.type === 'dragon_pass')).toBe(true);
  });

  it('a district usually has one dragon in it, and sometimes two: a long visit and a quick one overlap', () => {
    const w = world('numbers');
    w.flags.quiet_skies = false;
    w.hero.locationId = 'halo_floor';
    const { c } = ctxOf(w, 'numbers');
    const counts = [0, 0, 0, 0];
    let most = 0;
    for (let b = 0; b < 6000; b++) {
      w.beat = 40 + b;
      w.clock += BASE_MIN_PER_BEAT;
      w.hero.hp = w.hero.maxHp;
      ambientDragons(c);
      const n = live(w).filter((f) => f.roam?.stage === 'stay').length;
      counts[Math.min(3, n)]!++;
      most = Math.max(most, n);
    }
    // there are dragons about for a good part of the time, and mostly one at a time
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]! + counts[3]!).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan((counts[2]! + counts[3]!) * 2);
    expect(most).toBeLessThanOrEqual(4);
  });
});

describe('keeping one', () => {
  it('a persistent dragon is not forgotten: it takes off, goes away for a while, and comes back', () => {
    const w = world('persist');
    w.hero.locationId = 'halo_floor';
    const { c, events } = ctxOf(w, 'persist');
    const f = spawnFlight(c, 'hermes', 1, { persist: true })!;
    const id = f.ids[0]!;
    expect(id.startsWith('tmp_')).toBe(false);
    f.roam!.until = w.clock;
    let beats = 0;
    while (f.roam!.stage !== 'away' && beats++ < 100) tick(w, c);
    expect(f.roam!.stage).toBe('away');
    expect(w.flights).toContain(f);
    expect(w.npcs[id]!.locationId).toBe(AWAY);
    const arrivals = events.filter((e) => e.type === 'dragon_flight').length;
    // and later it is back
    w.clock = f.roam!.returnAt!;
    tick(w, c);
    expect(f.roam!.stage).toBe('stay');
    expect(events.filter((e) => e.type === 'dragon_flight').length).toBe(arrivals + 1);
    expect(w.npcs[id]!.locationId).not.toBe(AWAY);
  });

  it('and it is there the next night, asleep until it comes back; the others are not', () => {
    const w = world('keep');
    w.hero.locationId = 'halo_floor';
    const { c } = ctxOf(w, 'keep');
    const kept = spawnFlight(c, 'demeter', 1, { persist: true })!;
    const one = spawnFlight(c, 'hermes', 1)!;
    const id = kept.ids[0]!;
    w.ending = 'dawn';
    const u = endRun(w);
    expect(u.legacy.dragons?.map((d) => d.ids[0])).toEqual([id]);
    expect(u.npcs[id]).toBeTruthy();
    expect(u.npcs[one.ids[0]!]).toBeUndefined();

    const w2 = beginRun(u, { seed: 'keep-2' });
    expect(w2.flights.length).toBe(1);
    const back = w2.flights[0]!;
    expect(back.ids[0]).toBe(id);
    expect(back.roam!.stage).toBe('away');
    expect(w2.npcs[id]!.locationId).toBe(AWAY);
    expect(back.roam!.returnAt!).toBeGreaterThan(w2.clock);
    // a night with nothing persistent starts with an empty sky
    const w3 = beginRun(endRun(createWorld({ seed: 'plain' })), { seed: 'plain-2' });
    expect(w3.flights).toEqual([]);
  });
});

describe('Hermes', () => {
  it('Mk. III is carrying something valuable, and cannot be caught on foot: she can only chase', () => {
    const w = world('hermes3');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'h3');
    const f = withHer(w, c, 'hermes3');
    expect(f.cargo).toBeTruthy();
    expect(events.find((e) => e.type === 'dragon_flight')!.data.cargo).toBe(f.cargo);
    const cands = dragonCandidates(w);
    expect(cands.map((x) => x.key)).toContain('chase_flight');
    expect(cands.map((x) => x.key)).not.toContain('engage_flight');
    run(cands, 'chase_flight', c);
    expect(events.find((e) => e.type === 'dragon_chase')!.data.variant).toBe('lost');
    expect(events.some((e) => e.type === 'fight_start')).toBe(false);
    // it takes off, and is gone soon enough
    expect(f.roam!.stage).toBe('leave');
    let beats = 0;
    while (w.flights.includes(f) && beats++ < 40) tick(w, c);
    expect(w.flights).not.toContain(f);
  });

  it('Mk. III never notices her, so it never comes for her', () => {
    const w = world('hermes3b');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'h3b');
    withHer(w, c, 'hermes3');
    for (let i = 0; i < 100; i++) tick(w, c, 1, 0);
    expect(events.some((e) => e.type === 'dragon_notice')).toBe(false);
  });

  it('Mk. I is a fight she can take, and it will fine her if it finds her first', () => {
    const w = world('hermes1');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'h1');
    const f = withHer(w, c, 'hermes');
    const cands = dragonCandidates(w);
    expect(cands.map((x) => x.key)).toContain('engage_flight');
    expect(cands.map((x) => x.key)).not.toContain('chase_flight');
    w.hero.cash = 100;
    for (let i = 0; i < 400 && !events.some((e) => e.type === 'courier_fine'); i++) tick(w, c, 1, 0);
    const fine = events.find((e) => e.type === 'courier_fine');
    expect(fine).toBeTruthy();
    expect(w.hero.cash).toBe(100 - Number(fine!.data.fine));
    // it has done its business and pays her no further mind
    expect(f.hidden).toBe(true);
  });
});

describe('Demeter', () => {
  it('it is always winter', () => {
    const w = world('winter');
    expect(demeterSeason(w)).toBe('winter');
    w.beat = 5000;
    w.hero.cash = 1_000_000;
    expect(demeterSeason(w)).toBe('winter');
  });

  const demanded = (seed: string, model = 'demeter', cash = 1000) => {
    const w = world(seed);
    w.hero.locationId = 'street_main';
    w.hero.cash = cash;
    const t = ctxOf(w, seed);
    const f = withHer(w, t.c, model);
    for (let i = 0; i < 400 && f.phase !== 'demand'; i++) tick(w, t.c, 1, 0);
    expect(f.phase).toBe('demand');
    return { w, f, ...t };
  };

  it('a Demeter that spots her makes a demand, and it is larger the higher the mark', () => {
    const a = demanded('d1', 'demeter');
    const b = demanded('d4', 'demeter4');
    const dem = (r: ReturnType<typeof demanded>) => r.events.find((e) => e.type === 'tithe_demand')!;
    expect(dem(a).data.season).toBe('winter');
    expect(Number(dem(a).data.amount)).toBeGreaterThanOrEqual(200);
    expect(Number(dem(b).data.amount)).toBeGreaterThan(Number(dem(a).data.amount));
    expect(dragonCandidates(a.w).map((x) => x.key).sort()).toEqual(['haggle_tithe', 'pay_tithe', 'refuse_tithe']);
  });

  it('paying takes the money and the dragon carries on without bothering her again', () => {
    const { w, f, c, events } = demanded('pay');
    const amount = Number(events.find((e) => e.type === 'tithe_demand')!.data.amount);
    run(dragonCandidates(w), 'pay_tithe', c);
    expect(w.hero.cash).toBe(1000 - amount);
    expect(events.find((e) => e.type === 'tithe_pay')!.data.variant).toBe('full');
    expect(f.phase).toBeUndefined();
    const demands = events.filter((e) => e.type === 'tithe_demand').length;
    tick(w, c, 30, 0);
    expect(events.filter((e) => e.type === 'tithe_demand').length).toBe(demands);
  });

  it('being short leaves a debt that the next one adds', () => {
    const poor = demanded('poor', 'demeter', 30);
    const ask = Number(poor.events.find((e) => e.type === 'tithe_demand')!.data.amount);
    run(dragonCandidates(poor.w), 'pay_tithe', poor.c);
    expect(poor.w.hero.cash).toBe(0);
    expect(poor.events.find((e) => e.type === 'tithe_pay')!.data.variant).toBe('short');
    expect(poor.w.counters.tithe_debt).toBe(ask - 30);
    const again = world('poor-2');
    again.counters.tithe_debt = ask - 30;
    again.hero.locationId = 'street_main';
    again.hero.cash = 30;
    const t = ctxOf(again, 'again');
    const f = withHer(again, t.c, 'demeter');
    for (let i = 0; i < 400 && f.phase !== 'demand'; i++) tick(again, t.c, 1, 0);
    expect(Number(t.events.find((e) => e.type === 'tithe_demand')!.data.amount)).toBeGreaterThan(ask - 30);
  });

  it('having nothing at all is a citation', () => {
    const { w, c, events } = demanded('broke', 'demeter', 0);
    const hp = w.hero.hp;
    run(dragonCandidates(w), 'pay_tithe', c);
    expect(events.find((e) => e.type === 'tithe_pay')!.data.variant).toBe('broke');
    expect(w.hero.hp).toBeLessThan(hp);
    expect(w.hero.hp).toBeGreaterThanOrEqual(1);
  });

  it('saying no, or saying nothing, is a threat to public security: it shoots', () => {
    const { w, c, events } = demanded('no');
    run(dragonCandidates(w), 'refuse_tithe', c);
    expect(events.find((e) => e.type === 'tithe_refuse')!.data.variant).toBe('refuse');
    expect(events.some((e) => e.type === 'fight_start' && String(e.data.dragon).startsWith('demeter'))).toBe(true);
    expect(w.heat.atlas ?? 0).toBeGreaterThan(0);

    const quiet = demanded('quiet');
    quiet.w.beat = quiet.f.until + 1;
    ambientDragons(quiet.c);
    expect(quiet.events.find((e) => e.type === 'tithe_refuse')!.data.variant).toBe('silence');
    expect(quiet.events.some((e) => e.type === 'fight_start')).toBe(true);
  });

  it('walking away from a demand does not settle it: it shoots her in the back and the arrears stand', () => {
    const { w, f, c, events } = demanded('walk');
    const amount = Number(events.find((e) => e.type === 'tithe_demand')!.data.amount);
    w.hero.locationId = 'halo_alley';
    const hp = w.hero.hp;
    tick(w, c, 1, 0);
    expect(w.counters.tithe_debt).toBe(amount);
    expect(events.some((e) => e.type === 'tithe_evade')).toBe(true);
    expect(w.hero.hp).toBeLessThan(hp);
    expect(w.heat.atlas ?? 0).toBeGreaterThan(0);
    // and it goes on prowling
    expect(w.flights).toContain(f);
    expect(f.phase).toBeUndefined();
  });

  it('killing one pays out what it has collected', () => {
    const n = spawnNpc(new Rng('p'), 'p', 'demeter3', 'street_main');
    expect(n.cash).toBeGreaterThanOrEqual(900);
  });
});

describe('Artemis', () => {
  it('Mk. II turns up for heat, and only for heat', () => {
    const cold = world('cold');
    cold.hero.locationId = 'halo_floor';
    cold.flags.quiet_skies = false;
    const hot = world('hot');
    hot.hero.locationId = 'halo_floor';
    hot.flags.quiet_skies = false;
    hot.heat.atlas = 9;
    let coldFlights = 0;
    let hotFlights = 0;
    for (let b = 0; b < 600; b++) {
      for (const [w, tally] of [[cold, 'c'], [hot, 'h']] as const) {
        w.beat = 40 + b;
        w.flights = [];
        w.flight = null;
        ambientDragons(ctxOf(w, `a2-${tally}-${b}`).c);
        if (w.flights.some((f) => f.model === 'artemis2')) tally === 'c' ? coldFlights++ : hotFlights++;
      }
    }
    expect(coldFlights).toBe(0);
    expect(hotFlights).toBeGreaterThan(5);
  });

  it('Mk. II goes for her, at its own speed, and finds her even indoors', () => {
    const w = world('track');
    w.hero.locationId = 'halo_floor';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'tr');
    const f = spawnFlight(c, 'artemis2', 1)!;
    const hops = routeTo(w, f.locationId, 'halo_floor')!.dist;
    expect(hops).toBeGreaterThanOrEqual(2);
    let beats = 0;
    while (f.locationId !== 'halo_floor' && beats++ < 40) tick(w, c);
    expect(f.locationId).toBe('halo_floor');
    expect(events.some((e) => e.type === 'dragon_close' && e.data.variant === 'artemis' && e.data.mark === 2)).toBe(true);
    // it is faster than she is, so it covers a hop in less than a beat; give or take rounding
    expect(beats).toBeLessThanOrEqual(Math.ceil((hops * hopMinutes(DRAGON_MODELS.artemis2!.speed)) / BASE_MIN_PER_BEAT) + 2);
    // it is on her: either it is with her, or it has already started on her
    expect(w.flight === f || events.some((e) => e.type === 'fight_start')).toBe(true);
    for (const id of f.ids) expect(w.npcs[id]!.locationId).toBe('halo_floor');
  });

  it('a hero who lies low for a long time is found, however far it had to come', () => {
    const w = world('lowlie');
    w.hero.locationId = 'halo_floor';
    clearRoom(w, 'street_main');
    const { c } = ctxOf(w, 'll');
    const f = spawnFlight(c, 'artemis2', 1)!;
    tick(w, c, 1, 120); // an hour or two of keeping her head down
    expect(f.locationId).toBe('halo_floor');
  });

  it('a quick sweep that does not include her passes her by', () => {
    const w = world('pass');
    w.hero.locationId = 'halo_floor';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'pass');
    const f = spawnFlight(c, 'artemis', 1)!;
    let beats = 0;
    while (w.flights.includes(f) && beats++ < 100) tick(w, c);
    expect(events.some((e) => e.type === 'fight_start')).toBe(false);
  });
});

describe('Ares', () => {
  it('accuses everyone, gang or not', () => {
    const w = world('everyone');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'everyone');
    const crowd = ['barkeep', 'bartender', 'hacker', 'bouncer'].map((a, i) => {
      const n = spawnNpc(new Rng(a), `v${i}`, a, 'street_main');
      addNpc(w, n);
      return n;
    });
    const f = withHer(w, c, 'ares2');
    f.temper = { curiosity: 0.5, aggression: 1, territoriality: 0.2, patience: 0.5, alertness: 0.5 };
    f.hidden = true; // she keeps out of it
    for (let i = 0; i < 30; i++) tick(w, c, 1, 0);
    const named = events.filter((e) => e.type === 'ares_accuse' && e.data.variant === 'victim').map((e) => e.data.npc);
    expect(named.length).toBeGreaterThanOrEqual(3);
    expect(crowd.every((n) => !n.tags.includes('ganger'))).toBe(true);
    for (const e of events.filter((x) => x.type === 'ares_accuse')) expect(String(e.data.gang).length).toBeGreaterThan(0);
    expect(crowd.filter((n) => !n.alive || n.downUntil > w.clock).length).toBeGreaterThanOrEqual(2);
    // and nobody who matters drops dead on the spot: they are on the ground, and the clock is running
    expect(crowd.every((n) => n.alive || n.dying === undefined)).toBe(true);
  });

  it('can turn on her, and it is a fight', () => {
    const w = world('turn');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'turn');
    withHer(w, c, 'ares2');
    for (let i = 0; i < 200 && w.flight; i++) tick(w, c, 1, 0);
    expect(events.find((e) => e.type === 'ares_accuse' && e.data.variant === 'hero')).toBeTruthy();
    expect(events.some((e) => e.type === 'fight_start' && e.data.dragon === 'ares2')).toBe(true);
    // and it's over with her: the dragon doesn't linger
    expect(w.flights.some((f) => f.model === 'ares2')).toBe(false);
  });

  it('Mk. IV screams first, from the edge of the district, and a hero who gets indoors is left alone', () => {
    const w = world('scream');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'scream');
    const f = spawnFlight(c, 'ares4', 1)!;
    expect(events.find((e) => e.type === 'dragon_flight')!.data.screams).toBe(true);
    expect(f.phase).toBe('scream');
    expect(f.arrives! - w.beat).toBeGreaterThanOrEqual(2);
    expect(f.locationId).not.toBe('street_main');
    const cands = dragonCandidates(w);
    expect(cands.map((x) => x.key).sort()).toEqual(['shelter_scream', 'stand_ground']);
    run(cands, 'shelter_scream', c);
    expect(w.locations[w.hero.locationId]!.outdoors).toBe(false);
    let beats = 0;
    while (w.flights.includes(f) && beats++ < 200) tick(w, c);
    expect(w.flights).not.toContain(f);
    expect(events.some((e) => e.type === 'ares_arrive')).toBe(true);
    expect(events.some((e) => e.type === 'fight_start')).toBe(false);
    expect(events.some((e) => e.type === 'ares_all_clear')).toBe(true);
  });

  it('Mk. IV comes looking for a hero who stands her ground', () => {
    const w = world('stand');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'stand');
    spawnFlight(c, 'ares4', 1);
    run(dragonCandidates(w), 'stand_ground', c);
    for (let i = 0; i < 40 && !events.some((e) => e.type === 'fight_start'); i++) tick(w, c);
    expect(events.some((e) => e.type === 'ares_arrive')).toBe(true);
    expect(events.some((e) => e.type === 'fight_start' && e.data.dragon === 'ares4')).toBe(true);
  });

  it('Mk. IV is too fast to run from: she never gets away from it, though she can from a dragon that is not', () => {
    // A dragon that cannot hurt her much and cannot be hurt much, so the only question is whether she can leave.
    const retreats = (model: string): number => {
      let out = 0;
      for (let i = 0; i < 16; i++) {
        const w = world(`flee-${model}-${i}`);
        w.hero.locationId = 'street_main';
        w.hero.hp = Math.round(w.hero.maxHp * 0.2);
        const n = spawnNpc(new Rng(`m${i}`), 'm', model, 'street_main');
        addNpc(w, n);
        n.hp = n.maxHp = 30000;
        n.power = 2;
        const seen: GameEvent[] = [];
        fight({ w, rng: new Rng(`nf-${i}`), emit: (type, outcome, data = {}) => void seen.push({ beat: 0, type, outcome, data }) }, [n], { cause: 'test', joiners: false });
        out += seen.filter((e) => e.type === 'tactic' && e.data.variant === 'retreat').length;
      }
      return out;
    };
    expect(retreats('hermes')).toBeGreaterThan(0);
    expect(retreats('ares4')).toBe(0);
  });

  it('gang turf draws them, and a raid thins the turf', () => {
    const w = world('turf');
    const loc = w.locations.street_main!;
    const gangs = Object.values(w.factions).filter((f) => f.kind === 'gang');
    loc.influence = { [gangs[0]!.id]: 0.7, atlas: 0.3 };
    expect(gangActivity(w, loc)).toBeGreaterThan(0.6);
    expect(gangActivity(w, w.locations.halo_floor!)).toBeLessThan(gangActivity(w, loc));
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const n = spawnNpc(new Rng('t'), 'turf_npc', 'drifter', 'street_main');
    addNpc(w, n);
    const t = ctxOf(w, 'turf');
    const f = withHer(w, t.c, 'ares2');
    f.hidden = true;
    tick(w, t.c, 3, 0);
    expect(w.counters['ares_raids:street_main']).toBe(1);
    expect(loc.influence![gangs[0]!.id]!).toBeLessThan(0.7);
  });

  it('turns up on gang turf and nowhere else, and escalates to the Mk. IV after repeat raids', () => {
    const gangs = Object.values(world('g').factions).filter((f) => f.kind === 'gang');
    const mk = (seed: string, influence: Record<string, number>, raids = 0) => {
      const w = world(seed);
      w.flags.quiet_skies = false;
      w.hero.locationId = 'street_main';
      w.locations.street_main!.influence = influence;
      if (raids) w.counters['ares_raids:street_main'] = raids;
      return w;
    };
    const cases = { quiet: mk('quiet-turf', {}), loud: mk('loud-turf', { [gangs[0]!.id]: 0.9 }), escalated: mk('loud-turf-2', { [gangs[0]!.id]: 0.9 }, 1) };
    const seen: Record<string, Set<string>> = { quiet: new Set(), loud: new Set(), escalated: new Set() };
    for (let b = 0; b < 1500; b++) {
      for (const [name, w] of Object.entries(cases)) {
        w.beat = 40 + b;
        w.flights = [];
        w.flight = null;
        ambientDragons(ctxOf(w, `t-${b}`).c);
        for (const f of w.flights) if (f.kind === 'ares') seen[name]!.add(f.model!);
      }
    }
    expect([...seen.quiet!]).toEqual([]);
    expect(seen.loud!.has('ares2')).toBe(true);
    expect(seen.loud!.has('ares4')).toBe(false);
    expect(seen.escalated!.has('ares4')).toBe(true);
  });
});

describe('what it reads like', () => {
  it('every event the new dragons raise has text, and none of it leaves a token showing', () => {
    const base = { mark: 2, count: 1, place: 'Strand Street', cargo: 'a sealed Atlas payroll case', fame: 12, amount: 300, owed: 40, hit: 4, fine: 20, npc: 'Dex Mercer', gang: 'Rust Choir', fate: 'down', warned: false, hidden: false, left: false, screams: false, standing: false, season: 'winter', was: 600, passing: false, here: false, heading: 'the alley beside the Halo', family: 'demeter', name: 'ARES-237 "QUIET HOURS"', nights: 1, seen: 2, fought: 0 };
    const types: [string, string[]][] = [
      ['dragon_flight', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_close', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_near', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_depart', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_pass', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_notice', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_engage', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_gawk', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_film', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_duck', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_follow', ['artemis']],
      ['dragon_territory', ['claim', 'attack']],
      ['dying_dies', ['']],
      ['dragon_recognized', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_chase', ['caught', 'lost']],
      ['tithe_pay', ['full', 'short', 'broke']],
      ['tithe_haggle', ['win', 'fail']],
      ['tithe_refuse', ['refuse', 'silence', 'haggle']],
      ['ares_accuse', ['victim', 'hero']],
      ['ares_shelter', ['door', 'cover']],
      ['tithe_demand', ['']], ['tithe_evade', ['']], ['courier_fine', ['']], ['ares_arrive', ['']], ['ares_stand', ['']], ['ares_all_clear', ['']],
    ];
    const rng = new Rng('words');
    for (const [type, variants] of types) {
      for (const variant of variants) {
        for (const extra of [{}, { mark: 1 }, { mark: 3, screams: true, warned: true, hidden: true, left: true, fate: 'dying', family: 'hermes', standing: true, count: 2, owed: 0, passing: true, here: true }, { mark: 4, family: 'ares', name: '' }, { family: 'artemis', nights: 0, seen: 1, fought: 2, place: 'Strand Street' }]) {
          const ev: GameEvent = { beat: 1, type, outcome: 'mixed', data: { ...base, ...(variant ? { variant } : {}), ...extra } };
          expect(hasTemplate(ev), `${type}:${variant}`).toBe(true);
          for (const line of render(ev, { rng, realName: 'Pat Doe', personality: personalityFrom({}) })) expect(line.text, `${type}:${variant}`).not.toMatch(/[{}]|undefined|NaN|\[object/);
        }
      }
    }
  });

  it('a fight with each of them opens, ends and (if need be) ends her in their own words', () => {
    const rng = new Rng('fights');
    for (const id of Object.keys(DRAGON_MODELS).filter((k) => !['artemis', 'hera'].includes(k))) {
      for (const [type, variant] of [['fight_start', undefined], ['fight_end', 'win'], ['fight_end', 'dead']] as const) {
        const ev: GameEvent = { beat: 1, type, outcome: 'mixed', data: { dragon: id, foes: 'THE DRAGON', foe: 'THE DRAGON', foeRole: 'dragon', count: 1, weapon: 'a bat', rounds: 4, taken: 5, killed: 1, cash: 100, loot: 'a scale', killer: 'THE DRAGON', fled: 0, ...(variant ? { variant } : {}) } };
        const lines = render(ev, { rng, realName: 'Pat Doe', personality: personalityFrom({}) });
        expect(lines.length, `${type}:${variant} ${id}`).toBeGreaterThan(0);
        for (const l of lines) expect(l.text).not.toMatch(/[{}]|undefined|NaN|\[object/);
      }
    }
  });

  it('the dragons carry on as flags and helpers the tests use', () => {
    expect(hasTrait('ares4', 'relentless')).toBe(true);
  });
});

describe('a Hermes Mk. III flashing through', () => {
  it('can go through her street between one beat and the next, and she learns it was there and which way it went', () => {
    const w = world('flash');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'flash');
    // It is on an errand that takes it through her street and out the other side, faster than a beat.
    const f = spawnFlight(c, 'hermes3', 1, { at: 'street_main~0' })!;
    f.roam!.goals = ['halo_alley'];
    f.roam!.nextAt = w.clock;
    tick(w, c);
    expect(f.locationId).not.toBe('street_main');
    expect(w.flight).toBeNull();
    const seen = events.find((e) => e.type === 'dragon_close' && e.data.passing === true);
    expect(seen).toBeTruthy();
    expect(String(seen!.data.heading).length).toBeGreaterThan(0);
    expect(f.roam!.seen).toMatchObject({ at: 'street_main', toward: f.locationId });
    // and it reads as something
    expect(render(seen!, { rng: new Rng('x'), realName: 'Pat Doe', personality: personalityFrom({}) }).some((line) => /toward/.test(line.text))).toBe(true);
  });

  it('a slower dragon does not flash through: it stops where she is', () => {
    const w = world('noflash');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'noflash');
    const f = spawnFlight(c, 'hermes', 1, { at: 'street_main~0' })!;
    f.roam!.goals = ['halo_alley'];
    f.roam!.nextAt = w.clock;
    tick(w, c, 4);
    expect(events.some((e) => e.type === 'dragon_close' && e.data.passing === true)).toBe(false);
    expect(events.some((e) => e.type === 'dragon_close' && !e.data.passing)).toBe(true);
  });
});

describe('what a dragon is like', () => {
  const spawnWith = (seed: string, model: string, temper: Partial<import('./types').DragonTemper>, at?: string) => {
    const w = world(seed);
    w.hero.locationId = 'halo_floor';
    clearRoom(w, 'street_main');
    const t = ctxOf(w, seed);
    const f = spawnFlight(t.c, model, 1, { temper, ...(at ? { at } : {}) })!;
    return { w, f, ...t };
  };

  it('every dragon gets a temper of its own, from its family, and a persistent one keeps it', () => {
    const w = world('tempers');
    w.hero.locationId = 'halo_floor';
    const { c } = ctxOf(w, 'tempers');
    const a = spawnFlight(c, 'ares2', 1)!;
    const b = spawnFlight(c, 'ares2', 1)!;
    for (const f of [a, b]) for (const v of Object.values(f.temper!)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(a.temper).not.toEqual(b.temper);
    // the same dragon is the same dragon
    const again = world('tempers');
    again.hero.locationId = 'halo_floor';
    const f2 = spawnFlight(ctxOf(again, 'tempers').c, 'ares2', 1)!;
    expect(f2.temper).toEqual(a.temper);
    // and families lean differently
    const mean = (model: string, key: 'aggression' | 'patience') => {
      let s = 0;
      for (let i = 0; i < 40; i++) {
        const ww = world(`mean-${model}-${i}`);
        ww.hero.locationId = 'halo_floor';
        s += spawnFlight(ctxOf(ww, `m${i}`).c, model, 1)!.temper![key];
      }
      return s / 40;
    };
    expect(mean('ares2', 'aggression')).toBeGreaterThan(mean('hermes', 'aggression') + 0.4);
    expect(mean('demeter', 'patience')).toBeGreaterThan(mean('hermes', 'patience') + 0.3);
    const keep = spawnFlight(c, 'demeter', 1, { persist: true })!;
    const was = { ...keep.temper! };
    keep.roam!.until = w.clock;
    for (let i = 0; i < 100 && keep.roam!.stage !== 'away'; i++) tick(w, c);
    w.clock = keep.roam!.returnAt!;
    tick(w, c);
    expect(keep.temper).toEqual(was);
  });

  it('a curious Hermes makes more stops than an incurious one', () => {
    const goals = (curiosity: number) => spawnWith(`goals-${curiosity}`, 'hermes', { curiosity }).f.roam!.goals.length;
    expect(goals(1)).toBeGreaterThanOrEqual(goals(0) + 2);
  });

  it('a patient one stays longer than an impatient one', () => {
    const stay = (patience: number) => {
      const { w, f } = spawnWith('patience', 'demeter', { patience, territoriality: 0 });
      return f.roam!.until - w.clock;
    };
    expect(stay(1)).toBeGreaterThan(stay(0) * 1.8);
  });

  it('a curious Demeter sees more of the district than an incurious one', () => {
    const covered = (curiosity: number): number => {
      let total = 0;
      for (let k = 0; k < 6; k++) {
        const { w, f, c } = spawnWith(`curious-${curiosity}-${k}`, 'demeter', { curiosity, territoriality: 0, patience: 0.5 });
        for (let b = 0; b < 40 && f.roam!.stage === 'stay'; b++) tick(w, c);
        total += new Set(f.roam!.visited).size;
      }
      return total;
    };
    expect(covered(1)).toBeGreaterThan(covered(0));
  });

  it('a hot-tempered Ares hurts more people than a calm one', () => {
    const hurt = (aggression: number): number => {
      let total = 0;
      for (let k = 0; k < 6; k++) {
        const { w, f, c } = spawnWith(`temper-${aggression}-${k}`, 'ares2', { aggression, territoriality: 0, patience: 1, curiosity: 0.5 });
        const crowd = districtAround(w, 'street_main').nodes.filter((n) => n !== 'halo_floor').flatMap((loc, i) => {
          const n = spawnNpc(new Rng(`h${i}`), `h${aggression}_${k}_${i}`, 'drifter', loc);
          n.ephemeral = true;
          addNpc(w, n);
          return [n];
        });
        for (let b = 0; b < 25 && f.roam!.stage === 'stay'; b++) tick(w, c);
        total += crowd.filter((n) => n.dying || !n.alive).length;
      }
      return total;
    };
    expect(hurt(1)).toBeGreaterThan(hurt(0));
  });

  it('a territorial dragon takes a spot and holds it, and goes for anyone who walks into it', () => {
    const { w, f, c, events } = spawnWith('terr', 'demeter', { territoriality: 1, patience: 1, aggression: 1 });
    const den = f.roam!.den!;
    expect(den).toBeTruthy();
    let there = 0;
    let beats = 0;
    for (; beats < 60 && f.roam!.stage === 'stay'; beats++) {
      tick(w, c);
      if (f.locationId === den) there++;
    }
    // once it's got there it doesn't go anywhere else
    expect(there).toBeGreaterThan(beats * 0.5);
    // somebody who wanders in gets shot at before there's any talk of a tithe
    const w2 = world('terr2');
    w2.hero.locationId = 'halo_floor';
    clearRoom(w2, 'street_main');
    const t2 = ctxOf(w2, 'terr2');
    const g = spawnFlight(t2.c, 'demeter', 1, { temper: { territoriality: 1, patience: 1 } })!;
    const home = g.roam!.den!;
    for (let b = 0; b < 40 && g.locationId !== home; b++) tick(w2, t2.c);
    expect(g.locationId).toBe(home);
    w2.hero.locationId = home;
    for (let b = 0; b < 30 && !t2.events.some((e) => e.type === 'dragon_territory' && e.data.variant === 'attack'); b++) {
      w2.hero.hp = w2.hero.maxHp;
      tick(w2, t2.c);
    }
    expect(t2.events.some((e) => e.type === 'dragon_territory' && e.data.variant === 'claim')).toBe(true);
    expect(t2.events.some((e) => e.type === 'dragon_territory' && e.data.variant === 'attack')).toBe(true);
    expect(events.some((e) => e.type === 'tithe_demand')).toBe(false);
  });

  it('a sharp-eyed dragon notices her sooner than a dull one', () => {
    const ticksToNotice = (alertness: number): number => {
      let total = 0;
      for (let k = 0; k < 20; k++) {
        const w = world(`alert-${alertness}-${k}`);
        w.hero.locationId = 'street_main';
        w.hero.cash = 500;
        clearRoom(w, 'street_main');
        const t = ctxOf(w, `a${k}`);
        const f = spawnFlight(t.c, 'hermes', 1, { at: 'street_main', temper: { alertness, aggression: 0, territoriality: 0 } })!;
        f.roam!.nextAt = Infinity;
        let n = 0;
        for (; n < 300 && !t.events.some((e) => e.type === 'dragon_notice'); n++) tick(w, t.c, 1, 0);
        total += n;
      }
      return total;
    };
    expect(ticksToNotice(1)).toBeLessThan(ticksToNotice(0));
  });
});

describe('dying', () => {
  it('somebody hurt past saving goes down and dies after a while, sooner the worse', async () => {
    const { startDying, tickDying, timeToDie, isDying } = await import('./dying');
    expect(timeToDie(1)).toBeLessThan(timeToDie(0.5));
    expect(timeToDie(0.5)).toBeLessThan(timeToDie(0.1));
    const w = world('dying');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'dying');
    const a = spawnNpc(new Rng('a'), 'dy_a', 'drifter', 'street_main');
    const b = spawnNpc(new Rng('b'), 'dy_b', 'drifter', 'halo_alley');
    addNpc(w, a);
    addNpc(w, b);
    startDying(w, a, 1);
    startDying(w, b, 0.1);
    expect(isDying(a) && a.alive).toBe(true);
    expect(a.downUntil).toBeGreaterThan(w.clock);
    expect(w.dying).toEqual(['dy_a', 'dy_b']);
    // while they're dying they aren't people she can deal with
    expect(Object.values(w.npcs).filter((n) => n.locationId === 'street_main' && n.id === 'dy_a' && n.downUntil <= w.clock)).toEqual([]);
    // the worse hurt goes first
    w.clock += timeToDie(1) + 1;
    tickDying(c);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    // and she saw it, because she was there
    expect(events.filter((e) => e.type === 'dying_dies').map((e) => e.data.npc)).toEqual([a.name]);
    w.clock += timeToDie(0.1);
    tickDying(c);
    expect(b.alive).toBe(false);
    expect(events.filter((e) => e.type === 'dying_dies').length).toBe(1); // not where she was
    expect(w.dying).toEqual([]);
  });

  it('stabilizing takes them off the clock and leaves them out cold', async () => {
    const { startDying, tickDying, stabilize, timeToDie } = await import('./dying');
    const w = world('stabilize');
    const { c } = ctxOf(w, 'stab');
    const n = spawnNpc(new Rng('s'), 'dy_s', 'drifter', 'street_main');
    addNpc(w, n);
    startDying(w, n, 0.8);
    expect(stabilize(w, n)).toBe(true);
    expect(stabilize(w, n)).toBe(false);
    w.clock += timeToDie(0.8) * 3;
    tickDying(c);
    expect(n.alive).toBe(true);
    expect(n.dying).toBeUndefined();
    expect(n.downUntil).toBeGreaterThan(w.clock);
    expect(w.dying).toEqual([]);
  });

  it('an Ares leaves passers-by dying, not dead, whether or not she is looking', async () => {
    const w = world('ares-dying');
    w.hero.locationId = 'halo_floor';
    clearRoom(w, 'street_main');
    const { c } = ctxOf(w, 'ares-dying');
    const f = spawnFlight(c, 'ares2', 1, { temper: { aggression: 1, patience: 1, territoriality: 0 } })!;
    const crowd = districtAround(w, 'street_main').nodes.filter((n) => n !== 'halo_floor').map((loc, i) => {
      const n = spawnNpc(new Rng(`d${i}`), `ad${i}`, 'drifter', loc);
      n.ephemeral = true;
      addNpc(w, n);
      return n;
    });
    for (let b = 0; b < 40 && f.roam!.stage === 'stay'; b++) tick(w, c);
    const hit = crowd.filter((n) => n.dying || !n.alive);
    expect(hit.length).toBeGreaterThan(0);
    // nobody was killed on the spot: they are on the clock
    expect(hit.some((n) => n.dying && n.alive)).toBe(true);
    // and in time they're gone
    w.clock += 200;
    const { tickDying } = await import('./dying');
    tickDying(c);
    expect(crowd.filter((n) => n.dying).length).toBe(0);
    expect(hit.every((n) => !n.alive)).toBe(true);
  });

  it('anyone still dying when the night ends does not make it to the morning', async () => {
    const { startDying } = await import('./dying');
    const w = world('overnight');
    const n = spawnNpc(new Rng('o'), 'dy_o', 'drifter', 'street_main');
    addNpc(w, n);
    startDying(w, n, 0.1);
    w.ending = 'dawn';
    const u = endRun(w);
    expect(u.npcs.dy_o!.dying).toBeTruthy();
    const w2 = beginRun(u, { seed: 'overnight-2' });
    expect(w2.npcs.dy_o!.alive).toBe(false);
    expect(w2.npcs.dy_o!.dying).toBeUndefined();
    expect(w2.dying).toEqual([]);
  });
});

describe('callsigns', () => {
  it('every dragon has one, in the form of its model, a number and a name, and no two are alike for long', () => {
    const names = new Set<string>();
    for (const id of Object.keys(DRAGON_MODELS)) {
      for (let i = 0; i < 12; i++) {
        const n = spawnNpc(new Rng(`${id}-${i}`), `cs_${id}_${i}`, id, 'street_main');
        expect(n.name, id).toMatch(id.startsWith('hera') ? /^HERA-V ".+"$/ : /^[A-Z]+-\d{3} "[A-Z' -]+"$/);
        names.add(n.name);
      }
    }
    expect(names.size).toBeGreaterThan(Object.keys(DRAGON_MODELS).length * 12 * 0.9);
    // the family shows in the name
    expect(spawnNpc(new Rng('x'), 'cs_a', 'ares2', 'street_main').name).toMatch(/^ARES-/);
    expect(spawnNpc(new Rng('x'), 'cs_h', 'hermes3', 'street_main').name).toMatch(/^HERMES-/);
    // and CINDERJAW is still CINDERJAW
    expect(spawnNpc(new Rng('x'), 'cs_c', 'apollo', 'overpass').name).toBe('CINDERJAW');
  });
});

describe('the dragons she has seen', () => {
  const sighting = (seed: string, model = 'demeter') => {
    const w = world(seed);
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const t = ctxOf(w, seed);
    const f = withHer(w, t.c, model);
    f.roam!.met = false; // she hasn't laid eyes on it yet
    return { w, f, ...t };
  };

  it('is told the callsign when a dragon turns up, and the book keeps it', () => {
    const w = world('book');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c, events } = ctxOf(w, 'book');
    const f = spawnFlight(c, 'ares2', 1, { at: 'halo_alley' })!;
    f.roam!.nextAt = w.clock;
    f.roam!.visited = ['halo_alley'];
    f.temper = { curiosity: 1, aggression: 0.5, territoriality: 0, patience: 1, alertness: 0.5 };
    for (let b = 0; b < 60 && !events.some((e) => e.type === 'dragon_close'); b++) {
      tick(w, c);
      if (f.locationId !== 'street_main') f.roam!.nextAt = w.clock;
    }
    const close = events.find((e) => e.type === 'dragon_close' && !e.data.passing)!;
    expect(close).toBeTruthy();
    const name = w.npcs[f.ids[0]!]!.name;
    expect(close.data.name).toBe(name);
    expect(render(close, { rng: new Rng('r'), realName: 'Pat Doe', personality: personalityFrom({}) }).map((l) => l.text).join(' ')).toContain(name);
    const log = w.legacy.dragonLog!;
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ name, model: 'ares2', seen: 1, first: w.legacy.runs, last: w.legacy.runs });
    expect(log[0]!.temper).toEqual(f.temper);
    // it isn't a dragon she's seen before, so nobody says so
    expect(events.some((e) => e.type === 'dragon_recognized')).toBe(false);
  });

  it('counts a dragon once a visit, however many times it turns into her street', () => {
    const { w, f, c } = sighting('once');
    for (let i = 0; i < 3; i++) {
      f.roam!.met = false;
      tick(w, c, 1, 0);
    }
    expect(f.logged).toBe(true);
    expect(w.legacy.dragonLog!.length).toBe(1);
    expect(w.legacy.dragonLog![0]!.seen).toBe(1);
  });

  it('now and then a new dragon is one she has seen before, and she knows it', () => {
    let again = 0;
    let fresh = 0;
    for (let i = 0; i < 60; i++) {
      const w = world(`again-${i}`);
      w.hero.locationId = 'street_main';
      clearRoom(w, 'street_main');
      w.legacy.runs = 5;
      const temper = { curiosity: 0.11, aggression: 0.22, territoriality: 0.33, patience: 0.44, alertness: 0.55 };
      w.legacy.dragonLog = [{ name: 'DEMETER-555 "FINAL NOTICE"', model: 'demeter', temper, seen: 2, first: 3, last: 4, fought: 1, place: 'Strand Street' }];
      const { c, events } = ctxOf(w, `again-${i}`);
      const f = spawnFlight(c, 'demeter', 1, { at: 'street_main' })!;
      if (w.npcs[f.ids[0]!]!.name === 'DEMETER-555 "FINAL NOTICE"') {
        again++;
        expect(f.temper).toEqual(temper);
        f.roam!.nextAt = Infinity;
        tick(w, c, 1, 0);
        const rec = events.find((e) => e.type === 'dragon_recognized')!;
        expect(rec.data).toMatchObject({ name: 'DEMETER-555 "FINAL NOTICE"', seen: 2, nights: 1, fought: 1, place: 'Strand Street' });
        expect(w.legacy.dragonLog!.length).toBe(1);
        expect(w.legacy.dragonLog![0]).toMatchObject({ seen: 3, last: 5 });
        const lines = render(rec, { rng: new Rng('r'), realName: 'Pat Doe', personality: personalityFrom({}) }).map((l) => l.text).join(' ');
        expect(lines).toContain('last night');
        expect(lines).toContain('history');
      } else {
        fresh++;
      }
    }
    expect(again).toBeGreaterThan(10);
    expect(fresh).toBeGreaterThan(10);
  });

  it('only a dragon of the same model, one that is not already about, and one she has not killed', () => {
    const base = { temper: { curiosity: 0.5, aggression: 0.5, territoriality: 0.5, patience: 0.5, alertness: 0.5 }, seen: 1, first: 1, last: 1, fought: 0 };
    let got = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const w = world(`only-${i}`);
      w.hero.locationId = 'halo_floor';
      w.legacy.dragonLog = [
        { ...base, name: 'ARES-111 "CURFEW"', model: 'ares2' },
        { ...base, name: 'DEMETER-222 "PAYDAY"', model: 'demeter', killed: true },
        { ...base, name: 'DEMETER-333 "RENT DAY"', model: 'demeter' },
      ];
      const { c } = ctxOf(w, `only-${i}`);
      // one of them is already out there
      const out = spawnFlight(c, 'demeter', 1, { temper: {} })!;
      w.npcs[out.ids[0]!]!.name === 'DEMETER-333 "RENT DAY"' ? got.add('first') : got.add('fresh');
      const second = spawnFlight(c, 'demeter', 1)!;
      const name = w.npcs[second.ids[0]!]!.name;
      expect(name).not.toBe('DEMETER-222 "PAYDAY"'); // killed
      expect(name).not.toBe('ARES-111 "CURFEW"'); // a different model
      if (w.npcs[out.ids[0]!]!.name === 'DEMETER-333 "RENT DAY"') expect(name).not.toBe('DEMETER-333 "RENT DAY"'); // already here
    }
    expect(got.has('first')).toBe(true);
  });

  it('a dragon she kills is marked and will not be back; one she fights is counted', () => {
    const { w, f, c } = sighting('kill', 'hermes');
    const name = w.npcs[f.ids[0]!]!.name;
    tick(w, c, 1, 0); // she sees it
    expect(w.legacy.dragonLog![0]!.name).toBe(name);
    const npc = w.npcs[f.ids[0]!]!;
    npc.hp = npc.maxHp = 1;
    npc.power = 1;
    w.hero.maxHp = w.hero.hp = 1000;
    f.hidden = false;
    f.noticed = false;
    f.roam!.nextAt = Infinity;
    run(dragonCandidates(w), 'engage_flight', c);
    expect(w.legacy.dragonLog![0]!.fought).toBe(1);
    expect(w.legacy.dragonLog![0]!.killed).toBe(true);
    expect(w.flights).not.toContain(f);
  });

  it('the book is kept from night to night, and stays within bounds', () => {
    const w = world('keepbook');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const { c } = ctxOf(w, 'keepbook');
    const f = withHer(w, c, 'ares2');
    f.roam!.met = false;
    f.hidden = true;
    tick(w, c, 1, 0);
    const name = w.npcs[f.ids[0]!]!.name;
    w.ending = 'dawn';
    const u = endRun(w);
    expect(u.legacy.dragonLog!.map((r) => r.name)).toContain(name);
    const w2 = beginRun(u, { seed: 'keepbook-2' });
    expect(w2.legacy.dragonLog!.map((r) => r.name)).toContain(name);
    // it doesn't grow without end
    for (let i = 0; i < 100; i++) {
      const ww = world(`cap-${i}`);
      ww.legacy.dragonLog = w2.legacy.dragonLog;
      ww.hero.locationId = 'street_main';
      const cc = ctxOf(ww, `c${i}`).c;
      const g = withHer(ww, cc, 'hermes');
      g.roam!.met = false;
      tick(ww, cc, 1, 0);
      expect(g.logged).toBe(true);
    }
    expect(w2.legacy.dragonLog!.length).toBeLessThanOrEqual(60);
  });
});
