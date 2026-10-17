import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, personalityFrom, render, type GameEvent, type World } from './index';
import { ambientDragons, dragonCandidates, demeterSeason, gangActivity, spawnFlight } from './dragons';
import { DRAGON_MODELS, hasTrait, heroSpeed, reachPerBeat, runsDown } from './dragonmodels';
import { ARCHETYPES, spawnNpc } from './content/archetypes';
import { ITEMS } from './content/items';
import { fight } from './combat';
import { addNpc } from './population';
import { routeTo } from './plans';
import { BASE_MIN_PER_BEAT } from './clock';
import { foeProfile } from './tactics';
import type { Candidate } from './candidate';
import type { Ctx, Flight } from './types';

const world = (seed: string, competence = 0.9): World => {
  const w = createWorld({ seed, competence, personality: personalityFrom({}) });
  w.beat = 40;
  return w;
};
const ctxOf = (w: World, seed: string): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) } };
};
const run = (cands: Candidate[], key: string, c: Ctx): void => {
  const cand = cands.find((x) => x.key === key);
  expect(cand, key).toBeTruthy();
  cand!.run(c);
};
const clearRoom = (w: World, loc: string): void => {
  for (const n of Object.values(w.npcs)) if (n.locationId === loc && !n.id.startsWith('tmp_')) n.alive = false;
};

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
    // stats climb with the mark
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
    // a dragon twice her speed makes up two hops for every one she makes
    expect(reachPerBeat(w, heroSpeed(w) * 2)).toBe(2);
    // and nothing she can do on foot gets her fast enough for the Hermes Mk. III
    w.hero.reflex = 9;
    w.hero.implants.push('hydraulic_calves');
    expect(runsDown(w, DRAGON_MODELS.hermes3!.speed)).toBe(false);
  });
});

describe('Hermes', () => {
  it('Mk. III is carrying something valuable, and cannot be caught on foot: she can only chase', () => {
    const w = world('hermes3');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'h3');
    spawnFlight(c, 'hermes3', 1);
    const f = w.flight!;
    expect(f.cargo).toBeTruthy();
    expect(events.find((e) => e.type === 'dragon_flight')!.data.cargo).toBe(f.cargo);
    const cands = dragonCandidates(w);
    expect(cands.map((x) => x.key)).toContain('chase_flight');
    expect(cands.map((x) => x.key)).not.toContain('engage_flight');
    run(cands, 'chase_flight', c);
    const chase = events.find((e) => e.type === 'dragon_chase')!;
    expect(chase.data.variant).toBe('lost');
    expect(events.some((e) => e.type === 'fight_start')).toBe(false);
    expect(w.flight).toBeNull();
    expect(Object.values(w.npcs).some((n) => n.archetype === 'hermes3' && n.alive)).toBe(false);
  });

  it('Mk. III never notices her, so it never comes to her', () => {
    const w = world('hermes3b');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'h3b');
    spawnFlight(c, 'hermes3', 1);
    w.flight!.until = w.beat + 200;
    for (let i = 0; i < 100; i++) ambientDragons(c);
    expect(events.some((e) => e.type === 'dragon_notice')).toBe(false);
  });

  it('Mk. I is a fight she can take, and it will fine her if it finds her first', () => {
    const w = world('hermes1');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'h1');
    spawnFlight(c, 'hermes', 1);
    const cands = dragonCandidates(w);
    expect(cands.map((x) => x.key)).toContain('engage_flight');
    expect(cands.map((x) => x.key)).not.toContain('chase_flight');
    w.hero.cash = 100;
    w.flight!.until = w.beat + 400;
    for (let i = 0; i < 400 && !events.some((e) => e.type === 'courier_fine'); i++) ambientDragons(c);
    const fine = events.find((e) => e.type === 'courier_fine');
    expect(fine).toBeTruthy();
    expect(w.hero.cash).toBe(100 - Number(fine!.data.fine));
    expect(w.flight).toBeNull();
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
    spawnFlight(t.c, model, 1);
    w.flight!.until = w.beat + 400;
    for (let i = 0; i < 400 && w.flight?.phase !== 'demand'; i++) ambientDragons(t.c);
    expect(w.flight?.phase).toBe('demand');
    return { w, ...t };
  };

  it('a Demeter that spots her makes a demand, and it is larger the higher the mark', () => {
    const a = demanded('d1', 'demeter');
    const b = demanded('d4', 'demeter4');
    const dem = (r: ReturnType<typeof demanded>) => r.events.find((e) => e.type === 'tithe_demand')!;
    expect(dem(a).data.season).toBe('winter');
    expect(Number(dem(a).data.amount)).toBeGreaterThanOrEqual(250);
    expect(Number(dem(b).data.amount)).toBeGreaterThan(Number(dem(a).data.amount));
    expect(dragonCandidates(a.w).map((x) => x.key).sort()).toEqual(['haggle_tithe', 'pay_tithe', 'refuse_tithe']);
  });

  it('paying takes the money and the dragon moves on; being short leaves a debt that the next one adds', () => {
    const { w, c, events } = demanded('pay');
    const amount = Number(events.find((e) => e.type === 'tithe_demand')!.data.amount);
    run(dragonCandidates(w), 'pay_tithe', c);
    expect(w.hero.cash).toBe(1000 - amount);
    expect(events.find((e) => e.type === 'tithe_pay')!.data.variant).toBe('full');
    expect(w.flight).toBeNull();

    const poor = demanded('poor', 'demeter', 30);
    const ask = Number(poor.events.find((e) => e.type === 'tithe_demand')!.data.amount);
    run(dragonCandidates(poor.w), 'pay_tithe', poor.c);
    expect(poor.w.hero.cash).toBe(0);
    expect(poor.events.find((e) => e.type === 'tithe_pay')!.data.variant).toBe('short');
    expect(poor.w.counters.tithe_debt).toBe(ask - 30);
    // the next collector knows
    const again = world('poor-2');
    again.counters.tithe_debt = ask - 30;
    again.hero.locationId = 'street_main';
    again.hero.cash = 30;
    const t = ctxOf(again, 'again');
    spawnFlight(t.c, 'demeter', 1);
    again.flight!.until = again.beat + 400;
    for (let i = 0; i < 400 && again.flight?.phase !== 'demand'; i++) ambientDragons(t.c);
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
    const heat = w.heat.atlas ?? 0;
    run(dragonCandidates(w), 'refuse_tithe', c);
    expect(events.find((e) => e.type === 'tithe_refuse')!.data.variant).toBe('refuse');
    expect(events.some((e) => e.type === 'fight_start' && String(e.data.dragon).startsWith('demeter'))).toBe(true);
    expect(w.heat.atlas ?? 0).toBeGreaterThanOrEqual(Math.min(10, heat + 1) - 0);

    const quiet = demanded('quiet');
    quiet.w.beat = quiet.w.flight!.until + 1;
    ambientDragons(quiet.c);
    expect(quiet.events.find((e) => e.type === 'tithe_refuse')!.data.variant).toBe('silence');
    expect(quiet.events.some((e) => e.type === 'fight_start')).toBe(true);
  });

  it('walking away from a demand does not settle it', () => {
    const { w, c, events } = demanded('walk');
    const amount = Number(events.find((e) => e.type === 'tithe_demand')!.data.amount);
    w.hero.locationId = 'halo_alley';
    const hp = w.hero.hp;
    ambientDragons(c);
    expect(w.counters.tithe_debt).toBe(amount);
    expect(events.some((e) => e.type === 'tithe_evade')).toBe(true);
    // it shoots her in the back on the way out
    expect(w.hero.hp).toBeLessThan(hp);
    expect(w.heat.atlas ?? 0).toBeGreaterThan(0);
    expect(w.flight).toBeNull();
  });

  it('killing one pays out what it has collected', () => {
    const w = world('purse');
    w.hero.locationId = 'street_main';
    const n = spawnNpc(new Rng('p'), 'p', 'demeter3', 'street_main');
    expect(n.cash).toBeGreaterThanOrEqual(900);
  });
});

describe('Artemis Mk. II', () => {
  it('turns up for heat, and only for heat', () => {
    const cold = world('cold');
    cold.hero.locationId = 'halo_floor';
    const hot = world('hot');
    hot.hero.locationId = 'halo_floor';
    hot.heat.atlas = 9;
    let coldFlights = 0;
    let hotFlights = 0;
    for (let b = 0; b < 600; b++) {
      for (const [w, tally] of [[cold, 'c'], [hot, 'h']] as const) {
        w.beat = 40 + b;
        w.flight = null;
        const t = ctxOf(w, `a2-${tally}-${b}`);
        ambientDragons(t.c);
        if ((w.flight as Flight | null)?.model === 'artemis2') tally === 'c' ? coldFlights++ : hotFlights++;
      }
    }
    expect(coldFlights).toBe(0);
    expect(hotFlights).toBeGreaterThan(5);
  });

  it('keeps up with her: how soon it finds her again is its speed against hers', () => {
    const w = world('track');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'tr');
    spawnFlight(c, 'artemis2', 1);
    const f = w.flight!;
    f.until = w.beat + 50;
    f.hidden = false;
    const m = DRAGON_MODELS.artemis2!;
    // she slips away to the bar, one hop
    w.hero.locationId = 'halo_floor';
    expect(routeTo(w, f.locationId, 'halo_floor')!.dist).toBeGreaterThanOrEqual(1);
    const hops = routeTo(w, f.locationId, 'halo_floor')!.dist;
    let beats = 0;
    while (f.locationId !== 'halo_floor' && beats < 20) {
      w.beat++;
      w.clock += BASE_MIN_PER_BEAT;
      ambientDragons(c);
      beats++;
    }
    expect(w.flight).toBe(f);
    expect(f.locationId).toBe('halo_floor');
    expect(events.some((e) => e.type === 'dragon_follow')).toBe(true);
    // it is faster than she is, so it closes a hop in less than a beat; give or take rounding
    expect(beats).toBeLessThanOrEqual(Math.ceil(hops / reachPerBeat(w, m.speed)) + 1);
    // the dragons moved with it
    for (const id of f.ids) expect(w.npcs[id]!.locationId).toBe('halo_floor');
  });

  it('a patient hero who lies low for a long time gets found', () => {
    const w = world('lowlie');
    w.hero.locationId = 'street_main';
    const { c } = ctxOf(w, 'll');
    spawnFlight(c, 'artemis2', 1);
    const f = w.flight!;
    f.until = w.beat + 50;
    w.hero.locationId = 'halo_floor';
    w.beat++;
    w.clock += 120; // an hour or two of keeping her head down
    ambientDragons(c);
    expect(f.locationId).toBe('halo_floor');
  });

  it('a dragon too slow to keep up (Demeter) just loses her', () => {
    expect(hasTrait('demeter', 'tracks')).toBe(false);
    const w = world('slowpoke');
    w.hero.locationId = 'street_main';
    const { c } = ctxOf(w, 'sp');
    spawnFlight(c, 'demeter', 1);
    w.hero.locationId = 'halo_floor';
    ambientDragons(c);
    expect(w.flight).toBeNull();
  });
});

describe('Ares', () => {
  const near = (seed: string, model: string) => {
    const w = world(seed);
    w.hero.locationId = 'street_main';
    const t = ctxOf(w, seed);
    spawnFlight(t.c, model, 1);
    return { w, ...t };
  };

  it('accuses everyone, gang or not', () => {
    const { w, c, events } = near('everyone', 'ares2');
    clearRoom(w, 'street_main');
    const crowd = ['barkeep', 'bartender', 'hacker', 'bouncer'].map((a, i) => {
      const n = spawnNpc(new Rng(a), `v${i}`, a, 'street_main');
      addNpc(w, n);
      return n;
    });
    w.flight!.hidden = true; // she keeps out of it
    w.flight!.until = w.beat + 200;
    for (let i = 0; i < 30; i++) ambientDragons(c);
    const named = events.filter((e) => e.type === 'ares_accuse' && e.data.variant === 'victim').map((e) => e.data.npc);
    expect(named.length).toBeGreaterThanOrEqual(3);
    // none of them is a ganger, and every one gets a gang to be accused of anyway
    expect(crowd.every((n) => !n.tags.includes('ganger'))).toBe(true);
    for (const e of events.filter((x) => x.type === 'ares_accuse')) expect(String(e.data.gang).length).toBeGreaterThan(0);
    expect(crowd.filter((n) => !n.alive || n.downUntil > w.beat).length).toBeGreaterThanOrEqual(2);
  });

  it('can turn on her, and it is a fight', () => {
    const { w, c, events } = near('turn', 'ares2');
    w.flight!.until = w.beat + 200;
    for (let i = 0; i < 200 && w.flight; i++) ambientDragons(c);
    const hero = events.find((e) => e.type === 'ares_accuse' && e.data.variant === 'hero');
    expect(hero).toBeTruthy();
    expect(events.some((e) => e.type === 'fight_start' && e.data.dragon === 'ares2')).toBe(true);
  });

  it('Mk. IV screams first, and a hero who gets indoors is left alone', () => {
    const { w, c, events } = near('scream', 'ares4');
    const f = w.flight!;
    expect(events.find((e) => e.type === 'dragon_flight')!.data.screams).toBe(true);
    expect(f.phase).toBe('scream');
    expect(f.arrives! - w.beat).toBeGreaterThanOrEqual(2);
    const cands = dragonCandidates(w);
    expect(cands.map((x) => x.key).sort()).toEqual(['shelter_scream', 'stand_ground']);
    run(cands, 'shelter_scream', c);
    expect(w.locations[w.hero.locationId]!.outdoors).toBe(false);
    // the raid goes on without her; she is not in it
    for (let i = 0; i < 12 && w.flight; i++) {
      w.beat++;
      ambientDragons(c);
    }
    expect(w.flight).toBeNull();
    expect(events.some((e) => e.type === 'fight_start')).toBe(false);
    expect(events.some((e) => e.type === 'ares_all_clear')).toBe(true);
    expect((w.counters[`ares_raids:street_main`] ?? 0)).toBe(1);
  });

  it('Mk. IV finds a hero who stands her ground, or who walks back out', () => {
    const { w, c, events } = near('stand', 'ares4');
    run(dragonCandidates(w), 'stand_ground', c);
    for (let i = 0; i < 6 && w.flight; i++) {
      w.beat++;
      ambientDragons(c);
    }
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
    const t = ctxOf(w, 'turf');
    w.hero.locationId = 'street_main';
    spawnFlight(t.c, 'ares2', 1);
    w.flight!.hidden = true;
    w.beat = w.flight!.until + 1;
    ambientDragons(t.c);
    expect(w.counters['ares_raids:street_main']).toBe(1);
    expect(loc.influence![gangs[0]!.id]!).toBeLessThan(0.7);
  });

  it('turns up on gang turf and nowhere else, and escalates to the Mk. IV after repeat raids', () => {
    const quiet = world('quiet-turf');
    quiet.hero.locationId = 'street_main';
    quiet.locations.street_main!.influence = {};
    const loud = world('loud-turf');
    loud.hero.locationId = 'street_main';
    const gangs = Object.values(loud.factions).filter((f) => f.kind === 'gang');
    loud.locations.street_main!.influence = { [gangs[0]!.id]: 0.9 };
    const seen = { quiet: new Set<string>(), loud: new Set<string>(), escalated: new Set<string>() };
    const escalated = world('loud-turf-2');
    escalated.hero.locationId = 'street_main';
    escalated.locations.street_main!.influence = { [gangs[0]!.id]: 0.9 };
    escalated.counters['ares_raids:street_main'] = 1;
    for (let b = 0; b < 1500; b++) {
      for (const [w, set] of [[quiet, seen.quiet], [loud, seen.loud], [escalated, seen.escalated]] as const) {
        w.beat = 40 + b;
        w.flight = null;
        ambientDragons(ctxOf(w, `t-${b}`).c);
        const fl = w.flight as Flight | null;
        if (fl?.kind === 'ares') set.add(fl.model!);
      }
    }
    expect([...seen.quiet]).toEqual([]);
    expect(seen.loud.has('ares2')).toBe(true);
    expect(seen.loud.has('ares4')).toBe(false);
    expect(seen.escalated.has('ares4')).toBe(true);
  });
});

describe('what it reads like', () => {
  it('every event the new dragons raise has text, and none of it leaves a token showing', () => {
    const base = { mark: 2, count: 1, place: 'Strand Street', cargo: 'a sealed Atlas payroll case', fame: 12, amount: 300, owed: 40, hit: 4, fine: 20, npc: 'Dex Mercer', gang: 'Rust Choir', fate: 'down', warned: false, hidden: false, left: false, screams: false, standing: false, season: 'winter', was: 600 };
    const types: [string, string[]][] = [
      ['dragon_flight', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_pass', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_notice', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_engage', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_gawk', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_film', ['hermes', 'demeter', 'ares', 'artemis']],
      ['dragon_follow', ['artemis']],
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
        for (const extra of [{}, { mark: 1 }, { mark: 3, screams: true, warned: true, hidden: true, left: true, fate: 'dead', standing: true, count: 2, owed: 0 }, { mark: 4 }]) {
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
});
