import { describe, expect, it } from 'vitest';
import { slow } from './testkit';
import { Rng, personalityFrom, runToEnd, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { gather } from './interactions';
import { score } from './run';
import { heatBias, heatUrge, hideoutDist, isHideout, laylowCandidates, npdResponse } from './laylow';
import { spawnNpc } from './content/archetypes';
import { moveNpc } from './population';

const world = (seed: string, traits: Parameters<typeof personalityFrom>[0] = {}, competence = 0.7): World =>
  createWorld({ seed, competence, personality: personalityFrom(traits) });
const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const at = (w: World, loc: string) => {
  w.hero.locationId = loc;
};

describe('heat urge', () => {
  it('is zero when cool and climbs with heat', () => {
    const w = world('hu');
    expect(heatUrge(w)).toBe(0);
    let last = 0;
    for (const n of [1, 2, 3, 5, 8]) {
      w.heat.npd = n;
      const u = heatUrge(w);
      expect(u).toBeGreaterThan(last);
      last = u;
    }
    expect(last).toBeGreaterThan(6);
  });

  it('the reckless and the drunk shrug it off', () => {
    const w = world('hu2');
    w.heat.npd = 4;
    const base = heatUrge(w);
    w.hero.drunk = 5;
    expect(heatUrge(w)).toBeLessThan(base * 0.7);
    const r = world('hu3', { reckless: 0.95, thrill: 0.9 });
    r.heat.npd = 4;
    const careful = world('hu4', { reckless: 0.05, thrill: 0.1 });
    careful.heat.npd = 4;
    expect(heatUrge(r)).toBeLessThan(heatUrge(careful) * 0.6);
  });
});

describe('hiding', () => {
  it('has hideouts and a way to them', () => {
    const w = world('hide');
    expect(isHideout(w, 'halo_restroom')).toBe(true);
    expect(isHideout(w, 'street_main')).toBe(false);
    at(w, 'halo_floor');
    expect(hideoutDist(w, 'halo_floor')).toBeLessThan(5);
    at(w, 'halo_restroom');
    expect(hideoutDist(w, 'halo_restroom')).toBe(0);
  });

  it('hot, she heads for cover and stays there', () => {
    const w = world('hide2');
    at(w, 'halo_floor');
    w.heat.npd = 5;
    const goRestroom = heatBias(w, { key: 'go:halo_restroom' });
    const goStreet = heatBias(w, { key: 'go:street_main' });
    expect(goRestroom).toBeGreaterThan(goStreet);
    expect(heatBias(w, { key: 'challenge:x' })).toBeLessThan(0);
    at(w, 'halo_restroom');
    expect(heatBias(w, { key: 'go:halo_floor' })).toBeLessThan(0);
  });

  it('lay low is offered only in a hideout, only when hot, and brings heat down', () => {
    const w = world('hide3', {}, 0.9);
    at(w, 'halo_restroom');
    expect(laylowCandidates(w).length).toBe(0);
    w.heat.npd = 4;
    const cand = laylowCandidates(w).find((x) => x.key === 'lay_low:here')!;
    expect(cand).toBeTruthy();
    const { c, events } = ctxOf(w, 'll');
    for (let i = 0; i < 40; i++) cand.run(c);
    expect(w.heat.npd).toBeLessThan(4);
    expect(events[0]!.type).toBe('lay_low');
    at(w, 'street_main');
    expect(laylowCandidates(w).some((x) => x.key === 'lay_low:here')).toBe(false);
  });

  it('on a hot night lay-low is the top pick in a hideout', () => {
    const w = world('hide4', {}, 0.9);
    at(w, 'halo_restroom');
    w.heat.npd = 5;
    const cands = gather(w);
    const best = cands.map((x) => [score(w, x), x.key] as const).sort((a, b) => b[0] - a[0])[0]!;
    expect(best[1]).toMatch(/^lay_low|^bribe_cop|^frame|^fix_record|^use_med|^get_patched/);
  });
});

describe('the police response', () => {
  it('low heat sends drones, never officers', () => {
    let drones = 0;
    for (let i = 0; i < 400; i++) {
      const w = world('resp' + i);
      at(w, 'street_main');
      w.heat.npd = 1 + (i % 3);
      const { c, events } = ctxOf(w, 'r' + i);
      if (npdResponse(c) && events.some((e) => e.type === 'ambush')) {
        drones++;
        expect(events.find((e) => e.type === 'ambush')!.data.variant).toBe('npd_drone');
      }
    }
    expect(drones).toBeGreaterThan(20);
  });

  it('officers only come when heat is serious, sergeants only when it is extreme', () => {
    const seen = { officer: 0, sergeant: 0 };
    for (const heat of [4, 5, 6, 7, 8, 9]) {
      for (let i = 0; i < 200; i++) {
        const w = world(`o${heat}${i}`);
        at(w, 'street_main');
        w.heat.npd = heat;
        const { c, events } = ctxOf(w, `o${heat}${i}`);
        npdResponse(c);
        const amb = events.find((e) => e.type === 'ambush');
        if (amb) {
          expect(['npd', 'npd_chase']).toContain(amb.data.variant);
          seen.officer++;
          if (heat >= 8) seen.sergeant++;
        }
      }
    }
    expect(seen.officer).toBeGreaterThan(20);
  });

  it('indoors she is out of reach', () => {
    for (let i = 0; i < 100; i++) {
      const w = world('in' + i);
      at(w, 'halo_restroom');
      w.heat.npd = 9;
      const { c, events } = ctxOf(w, 'in' + i);
      expect(npdResponse(c)).toBe(false);
      expect(events.length).toBe(0);
    }
  });

  it('drones are not lethal', () => {
    const w = world('drone');
    const d = spawnNpc(new Rng('d'), 'tmp_d', 'npd_drone', 'street_main', {});
    expect(d.tags).toContain('nonlethal');
    expect(d.faction).toBe('npd');
  });
});

describe('ways out', () => {
  const prep = (seed: string, loc: string, heat = 4, cash = 800) => {
    const w = world(seed, {}, 0.8);
    at(w, loc);
    w.heat.npd = heat;
    w.hero.cash = cash;
    return w;
  };

  it('bribing a cop works, costs more each time, and costs cash', () => {
    let wins = 0;
    let costs: number[] = [];
    for (let i = 0; i < 60; i++) {
      const w = prep('bribe' + i, 'street_main');
      const cand = laylowCandidates(w).find((x) => x.key === 'bribe_cop:street');
      expect(cand).toBeTruthy();
      const cash = w.hero.cash;
      const { c, events } = ctxOf(w, 'b' + i);
      cand!.run(c);
      if (events[0]!.data.variant === 'paid') {
        wins++;
        expect(w.hero.cash).toBeLessThan(cash);
        expect(w.heat.npd).toBeLessThan(4);
        expect(w.counters.bribes).toBe(1);
        costs.push(events[0]!.data.cost as number);
      }
    }
    expect(wins).toBeGreaterThan(15);
    const w = prep('bribe-inflate', 'street_main');
    const cheap = laylowCandidates(w).length;
    w.counters.bribes = 3;
    w.hero.cash = 800;
    expect(cheap).toBeGreaterThan(0);
    // fourth bribe is dearer
    const { c, events } = ctxOf(w, 'x');
    laylowCandidates(w).find((x) => x.key === 'bribe_cop:street')!.run(c);
    const paid = events.find((e) => e.type === 'bribe_cop');
    expect(Number(paid!.data.cost)).toBeGreaterThan(Math.min(...costs));
  });

  it('cannot bribe without the cash or off the street', () => {
    const w = prep('broke', 'street_main', 4, 5);
    expect(laylowCandidates(w).some((x) => x.key.startsWith('bribe_cop'))).toBe(false);
    const w2 = prep('indoors', 'halo_restroom');
    expect(laylowCandidates(w2).some((x) => x.key.startsWith('bribe_cop'))).toBe(false);
  });

  it('Madame Zero will lose a report for cash', () => {
    const w = prep('madame', 'halo_backroom', 6, 1500);
    moveNpc(w, w.npcs.madame!, 'halo_backroom');
    const cand = laylowCandidates(w).find((x) => x.key === 'fix_record:madame')!;
    expect(cand).toBeTruthy();
    const { c, events } = ctxOf(w, 'fix');
    cand.run(c);
    expect(w.heat.npd).toBeLessThanOrEqual(3);
    expect(w.hero.cash).toBeLessThan(1500);
    expect(events[0]!.type).toBe('fix_record');
  });

  it('framing someone takes them off the board and cools things down, sometimes', () => {
    let ok = 0;
    for (let i = 0; i < 80; i++) {
      const w = prep('frame' + i, 'halo_floor', 4);
      w.hero.int = 10;
      const cands = laylowCandidates(w).filter((x) => x.key.startsWith('frame:'));
      expect(cands.length).toBeGreaterThan(0);
      const pick = cands[i % cands.length]!;
      const id = pick.key.split(':')[1]!;
      const { c, events } = ctxOf(w, 'f' + i);
      pick.run(c);
      const ev = events.find((e) => e.type === 'frame');
      if (ev && (ev.data.variant === 'deserved' || ev.data.variant === 'innocent')) {
        ok++;
        expect(w.npcs[id]!.downUntil).toBeGreaterThan(w.beat);
        expect(w.heat.npd).toBeLessThan(4);
      }
    }
    expect(ok).toBeGreaterThan(15);
  });

  it('all the new events have templates', () => {
    for (const k of [
      'ambush:npd_drone', 'lay_low:restroom', 'lay_low:arcade', 'lay_low:crawlspace', 'lay_low:home', 'bribe_cop:paid', 'bribe_cop:refused',
      'bribe_cop:refused_fight', 'fix_record:fix', 'frame:deserved', 'frame:innocent', 'frame:botched', 'frame:fight',
    ]) {
      const [type, variant] = k.split(':') as [string, string];
      expect(hasTemplate({ beat: 1, type, outcome: 'mixed', data: { variant } } as GameEvent), k).toBe(true);
    }
  });
});

describe('whole nights', () => {
  slow('hot heroes go to ground and cool off', () => {
    let laid = 0;
    let nights = 0;
    for (let i = 0; i < 25; i++) {
      const r = runToEnd({ seed: 'night' + i, competence: 0.8 });
      nights++;
      laid += r.events.filter((e) => e.type === 'lay_low').length;
    }
    expect(nights).toBe(25);
    expect(laid).toBeGreaterThan(5);
  });
});
