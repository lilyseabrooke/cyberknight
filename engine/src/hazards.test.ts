import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { hasTemplate } from './index';
import { always, never, rolls, scenario } from './testkit';
import { spawnGroup } from './candidate';
import { fight } from './combat';
import { meetHazards } from './hazards';
import { BARKS, rollHazards } from './content/hazards';
import type { Hazards } from './types';
import { learnHome } from './homes';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { expand } from './mapgen';
import { relocate } from './combat';

const homeWith = (hazards: Hazards, security = 3) => {
  const sc = scenario({ at: 'home_stacks', competence: 0.5 });
  const home = sc.w.locations.home_stacks!;
  home.security = security;
  home.hazards = hazards;
  return { sc, home };
};

describe('what homes keep: the roll', () => {
  const roll = (security: number, n = 400) => Array.from({ length: n }, (_, i) => rollHazards(new Rng(`h${security}-${i}`), security));

  it('better-secured homes have better dogs and nastier traps', () => {
    const low = roll(0);
    const high = roll(5);
    const dogRank = (xs: Hazards[]) => xs.filter((x) => x.dogs).map((x) => BARKS.findIndex((b) => b.model === x.dogs!.model));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(dogRank(high))).toBeGreaterThan(mean(dogRank(low)) + 1.5);
    expect(high.filter((x) => x.dogs).length).toBeGreaterThan(low.filter((x) => x.dogs).length * 3);
    // Low-end homes only ever get the cheap trap; the top end gets turrets.
    expect(new Set(low.filter((x) => x.trap).map((x) => x.trap!.kind))).toEqual(new Set(['grenade_string']));
    expect(high.some((x) => x.trap?.kind === 'sentry_turret')).toBe(true);
    expect(low.some((x) => x.trap?.kind === 'sentry_turret')).toBe(false);
  });

  it('a home always keeps the same things', () => {
    expect(rollHazards(new Rng('same'), 3)).toEqual(rollHazards(new Rng('same'), 3));
  });

  it('there can be a pack, but not of the big ones', () => {
    const packs = roll(2).filter((x) => (x.dogs?.count ?? 1) > 1);
    expect(packs.length).toBeGreaterThan(0);
    for (const x of roll(5)) if (x.dogs && x.dogs.model >= 430) expect(x.dogs.count).toBeLessThanOrEqual(2);
  });
});

describe('guard dogs, by model number', () => {
  const wins = (model: number, count: number, n = 12): number => {
    const b = BARKS.find((x) => x.model === model)!;
    let won = 0;
    for (let s = 0; s < n; s++) {
      const sc = scenario({ seed: `bark${model}-${s}`, at: 'home_stacks' });
      const c = sc.ctx(new Rng(`r${s}`));
      const pack = spawnGroup(c, 'guard_dog', count);
      for (const d of pack) {
        d.hp = d.maxHp = b.hp;
        d.power = b.power;
      }
      if (fight(c, pack, { cause: 'test', joiners: false }) === 'win') won++;
    }
    return won;
  };

  it('a BARK-100 is easy and a BARK-530 is not a fight she can win', () => {
    expect(wins(100, 1)).toBe(12);
    expect(wins(100, 2)).toBeGreaterThanOrEqual(10);
    expect(wins(530, 1)).toBeLessThanOrEqual(5); // she can blind and jam a robot dog now
    expect(wins(530, 2)).toBeLessThanOrEqual(2);
  });

  it('the models in between get steadily worse', () => {
    const w = [100, 210, 320, 430, 530].map((m) => wins(m, 1));
    for (let i = 1; i < w.length; i++) expect(w[i]!, `BARK-${BARKS[i]!.model}`).toBeLessThanOrEqual(w[i - 1]!);
    expect(w[0]!).toBeGreaterThan(w[3]!);
  });

  it('she may slip past them, or wisely back out, or end up in the fight', () => {
    // Heard nothing.
    let { sc, home } = homeWith({ dogs: { model: 100, count: 1 } });
    let ok = false;
    sc.run((c) => (ok = meetHazards(c, home)), never());
    expect(ok).toBe(true);
    expect(sc.saw('home_hazard', 'dogs_slip')).toBe(true);
    expect(home.hazards!.dogs!.cleared).toBe(true);
    // Heard, and the dog is too much for her: she goes.
    ({ sc, home } = homeWith({ dogs: { model: 530, count: 2 } }));
    sc.run((c) => (ok = meetHazards(c, home)), always());
    expect(ok).toBe(false);
    expect(sc.saw('home_hazard', 'dogs_retreat')).toBe(true);
    expect(sc.saw('fight_start')).toBe(false);
    // Heard, and it's a small one: she fights it, and wins.
    ({ sc, home } = homeWith({ dogs: { model: 100, count: 1 } }));
    sc.run((c) => (ok = meetHazards(c, home)), rolls(0, 0.999));
    expect(sc.saw('home_hazard', 'dogs')).toBe(true);
    expect(sc.saw('fight_start')).toBe(true);
    for (const e of sc.events.filter((x) => x.type === 'fight_start')) expect(e.data.foes).toBe('BARK-100');
  });
});

describe('traps, by how well the home is secured', () => {
  it('a trap she spots and disarms costs nothing', () => {
    const { sc, home } = homeWith({ trap: { kind: 'grenade_string' } }, 1);
    const hp = sc.w.hero.hp;
    let ok = false;
    sc.run((c) => (ok = meetHazards(c, home)), always());
    expect(ok).toBe(true);
    expect(sc.w.hero.hp).toBe(hp);
    expect(sc.saw('home_hazard', 'trap_disarmed')).toBe(true);
    expect(home.hazards!.trap!.spent).toBe(true);
  });

  it('a grenade on a string hurts, and is loud', () => {
    const { sc, home } = homeWith({ trap: { kind: 'grenade_string' } }, 1);
    const hp = sc.w.hero.hp;
    const heat = sc.w.heat.npd ?? 0;
    sc.run((c) => meetHazards(c, home), never());
    expect(sc.w.hero.hp).toBeLessThan(hp);
    expect(sc.w.heat.npd ?? 0).toBeGreaterThan(heat);
    expect(sc.saw('home_hazard', 'trap_hit')).toBe(true);
  });

  it('the gas puts her out and she has to leave', () => {
    const { sc, home } = homeWith({ trap: { kind: 'gas_vent' } }, 3);
    let ok = true;
    sc.run((c) => (ok = meetHazards(c, home)), never());
    expect(ok).toBe(false);
  });

  it('a sentry turret is a fight, and takes more than a lucky roll to beat', () => {
    const { sc, home } = homeWith({ trap: { kind: 'sentry_turret' } }, 5);
    sc.run((c) => meetHazards(c, home), never());
    const fights = sc.events.filter((e) => e.type === 'fight_start');
    expect(fights.length).toBe(1);
    expect(String(fights[0]!.data.cause)).toMatch(/turret/);
    expect(fights[0]!.data.foes).toBe('SENTRY-9');
  });

  it('everything she can read in the log has words', () => {
    for (const kind of ['grenade_string', 'shock_mat', 'gas_vent', 'sentry_turret']) {
      for (const rng of [always(), never()]) {
        const { sc, home } = homeWith({ trap: { kind }, dogs: { model: 210, count: 2 } }, 4);
        sc.run((c) => meetHazards(c, home), rng);
        for (const e of sc.events.filter((x) => x.type === 'home_hazard')) expect(hasTemplate(e), `${kind}:${e.data.variant}`).toBe(true);
      }
    }
  });
});

describe('inside a burglary', () => {
  const markScenario = (hazards: Hazards, seed: string) => {
    const sc = scenario({ at: 'halo_floor', seed, competence: 1 });
    const w = sc.w;
    for (const n of Object.values(w.npcs)) if (n.locationId === 'halo_floor') moveNpc(w, n, '_gone');
    const mark = spawnNpc(new Rng(seed), 'mark', 'patron', 'halo_floor', {});
    mark.cash = 300;
    addNpc(w, mark);
    learnHome(mark);
    sc.do('burgle_home:mark', always()); // decides to go...
    const home = w.locations[mark.residence!]!;
    home.hazards = hazards;
    relocate(w, home.id); // ...and arrives
    return { sc, w, mark, home };
  };

  it('a dog that is too much for her ends the job, and she is not left in the house', () => {
    const { sc, w, mark, home } = markScenario({ dogs: { model: 530, count: 1 } }, 'hz1');
    const cash = w.hero.cash;
    sc.do('burgle_home:mark', always());
    expect(sc.saw('home_hazard', 'dogs_retreat')).toBe(true);
    expect(w.hero.cash).toBe(cash);
    expect(mark.flags.includes('burgled')).toBe(true);
    expect([home.id, home.fleeTo]).not.toContain(w.hero.locationId);
  });

  it('a trap she disarms, then she carries on and takes the cash', () => {
    const { sc, w } = markScenario({ trap: { kind: 'shock_mat' } }, 'hz2');
    const cash = w.hero.cash;
    sc.do('burgle_home:mark', always());
    expect(sc.saw('home_hazard', 'trap_disarmed')).toBe(true);
    expect(sc.saw('burgle_home', 'clean')).toBe(true);
    expect(w.hero.cash).toBeGreaterThan(cash);
  });

  it('the same goes for a random door in a block', () => {
    const sc = scenario({ at: 'halo_floor', seed: 'hz3', competence: 1 });
    const w = sc.w;
    let block = Object.values(w.locations).find((l) => l.gen?.role === 'flat');
    for (let round = 0; round < 8 && !block; round++) {
      for (const l of Object.values(w.locations)) if (l.gen && !l.gen.expanded && l.outdoors) expand(w, l);
      block = Object.values(w.locations).find((l) => l.gen?.role === 'flat');
    }
    relocate(w, block!.id);
    sc.do(`burgle_flat:${block!.id}`, never());
    const door = Object.values(w.locations).find((l) => l.gen?.role === 'unit' && l.gen.parent === block!.id)!;
    expect(door.hazards).toBeDefined(); // it rolled what the place keeps, as it was entered
    expect(w.locations[w.hero.locationId]!.gen?.role).not.toBe('unit');
  });
});
