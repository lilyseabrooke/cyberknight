import { describe, expect, it } from 'vitest';
import { Rng, createWorld } from './index';
import { HOOKS } from './combat';
import { spawnNpc } from './content/archetypes';
import { newCompanion } from './companions';
import { addNpc } from './population';
import { Sim } from './tactics';
import { LEARNABLE, knowsTechnique, learnTechnique, techniquesFor } from './techniques';

function sim(seed: string, kind: string, learnAll: boolean): Sim {
  const w = createWorld({ seed, competence: 0.7 });
  w.hero.int = 8;
  w.hero.locationId = 'street_main';
  w.hero.companions.push(newCompanion('drone', 'drone-pal'));
  if (learnAll) for (const id of LEARNABLE) learnTechnique(w.hero, id);
  const rng = new Rng(`${seed}-rng`);
  const foes = [0, 1].map((k) => {
    const n = spawnNpc(rng, `d${k}`, kind, w.hero.locationId);
    addNpc(w, n);
    return n;
  });
  return new Sim({ w, rng, emit: () => {} }, HOOKS, { foes, arrivals: [], lethal: false, assault: true, maxRounds: 10 });
}

const ids = (s: Sim): string[] => techniquesFor(s, s.hero).map((t) => t.id);

describe('the Hacks and Overrides she has to learn', () => {
  it('are not available until something teaches them', () => {
    const s = sim('learn-1', 'sentry_turret', false);
    for (const id of LEARNABLE) expect(ids(s)).not.toContain(id);
    expect(knowsTechnique(s.w.hero, 'gun_jam')).toBe(false);
  });

  it('show up once learned, against the right targets', () => {
    const turret = ids(sim('learn-2', 'sentry_turret', true));
    expect(turret).toContain('turret_takeover');
    expect(turret).toContain('overclock'); // the drone beside her
    const robot = ids(sim('learn-3', 'ganger', true));
    expect(robot).toContain('pain_spike');
    const g = sim('learn-3', 'ganger', true);
    const takeover = techniquesFor(g, g.hero).find((t) => t.id === 'turret_takeover')!;
    expect(takeover.value(g, g.hero, g.hero, g.units.find((u) => u.kind === 'foe')!)).toBeNull(); // a ganger is not a turret
  });

  it('do what they say', () => {
    const s = sim('learn-4', 'sentry_turret', true);
    s.w.hero.int = 40; // never misses
    const [a, b] = s.units.filter((u) => u.kind === 'foe');
    s.doDoorLock();
    expect(s.sealed).toBeGreaterThan(0);
    s.doLightsOut();
    expect(s.dark).toBeGreaterThan(0);
    s.doTurretTakeover(a!);
    expect(a!.turned).toBeGreaterThan(0);
    expect(s.standingFoes()).not.toContain(a);
    expect(s.enemiesOf(b!)).toContain(a);
    expect(s.enemiesOf(s.hero)).not.toContain(a);
    s.doGunJam(b!);
    s.doOverclock(s.units.find((u) => u.kind === 'ally')!);
    expect(s.units.find((u) => u.kind === 'ally')!.over).toBeGreaterThan(0);
  });
});
