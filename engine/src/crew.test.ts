import { describe, expect, it } from 'vitest';
import { scenario } from './testkit';
import { MAX_COMPANIONS, addCompanion, assistOf, gainCompanionXp, levelOf, newCompanion, slotsFree } from './companions';
import { berthsOf, crewOf, tickCrews } from './crew';
import { deedsOf } from './deeds';
import { beginRun, endRun, newUniverse } from './universe';
import type { Deed } from './types';

/** A scenario with a home of hers under her feet. */
function atHome(kind: 'pod' | 'townhouse' = 'pod') {
  const s = scenario({ seed: 'crew' });
  const deed = { id: 'x#0', kind, name: 'pod 1A, Test', home: s.w.hero.locationId, quality: 0.8, price: 1, district: 'tenement', run: 1 } as Deed;
  s.w.legacy.deeds = [deed];
  s.w.hero.companions = [];
  return { s, deed };
}

const join = (s: ReturnType<typeof scenario>, kind: string, name: string) => {
  const comp = newCompanion(kind, name, { loyalty: 60 });
  expect(s.run((c) => void addCompanion(c, comp, 'test', true))).toBeDefined();
  return comp;
};

describe('companions growing', () => {
  it('level up with experience: stronger body, better assist, new tricks, and a line for it', () => {
    const s = scenario({ seed: 'lv' });
    const pup = newCompanion('puppy', 'Rex');
    const before = { hp: pup.maxHp, power: pup.power, dmg: assistOf(pup).dmg! };
    const ev = s.run((c) => void gainCompanionXp(c, pup, 2 * 6 * 6 + 1));
    expect(levelOf(pup)).toBeGreaterThanOrEqual(6);
    expect(pup.maxHp).toBeGreaterThan(before.hp);
    expect(pup.power).toBeGreaterThan(before.power);
    expect(assistOf(pup).dmg).toBeGreaterThan(before.dmg);
    expect(pup.abilities).toContain('fetch');
    expect(ev.some((e) => e.type === 'companion_levels')).toBe(true);
    expect(ev.some((e) => e.type === 'companion_learns')).toBe(true);
  });

  it('stop at level 100', () => {
    const s = scenario({ seed: 'lv2' });
    const a = newCompanion('drone', 'Buzz');
    s.run((c) => void gainCompanionXp(c, a, 1e9));
    expect(levelOf(a)).toBe(100);
  });

  it('can be drilled by Blackbird for experience, but not twice running', () => {
    const s = scenario({ seed: 'drill' });
    s.w.hero.companions = [];
    const a = join(s, 'kids', 'the Kids');
    s.do(`drill_ally:${a.id}`);
    expect(a.xp).toBeGreaterThan(0);
    expect(s.offers()).not.toContain(`drill_ally:${a.id}`);
    s.w.clock += 200;
    expect(s.offers()).toContain(`drill_ally:${a.id}`);
  });
});

describe('stationing companions at a home', () => {
  it('has berths by home type', () => {
    const { deed } = atHome('pod');
    expect(berthsOf(deed)).toBe(1);
    expect(berthsOf({ ...deed, kind: 'townhouse' })).toBe(3);
  });

  it('frees a slot in the party, and a pod holds only one', () => {
    const { s, deed } = atHome('pod');
    const a = join(s, 'drone', 'Buzz');
    const b = join(s, 'kids', 'the Kids');
    s.do(`station_ally:${a.id}`);
    expect(crewOf(deed).map((x) => x.comp)).toEqual([a]);
    expect(s.w.hero.companions).toEqual([b]);
    expect(s.offers().some((k) => k.startsWith('station_ally'))).toBe(false); // the pod is full
  });

  it('lets her keep a reserve bigger than the party limit', () => {
    const { s, deed } = atHome('townhouse');
    const kinds = ['drone', 'kids', 'puppy', 'scrapper', 'courier', 'hacker'];
    for (const k of kinds.slice(0, 3)) {
      const a = join(s, k, `${k}1`);
      s.do(`station_ally:${a.id}`);
    }
    for (const k of kinds.slice(3)) join(s, k, `${k}2`);
    expect(crewOf(deed)).toHaveLength(3);
    expect(s.w.hero.companions).toHaveLength(3);
    expect(slotsFree(s.w)).toBe(false);
    expect(crewOf(deed).length + s.w.hero.companions.length).toBeGreaterThan(MAX_COMPANIONS);
  });

  it('put them to work, paid in clock time, and hand it over on collecting', () => {
    const { s, deed } = atHome('pod');
    const a = join(s, 'drone', 'Buzz'); // hacks
    s.do(`station_ally:${a.id}`);
    expect(crewOf(deed)[0]!.job).toBe('skim');
    const cash = s.w.hero.cash;
    s.w.clock += 10 * 60;
    s.run((c) => tickCrews(c));
    expect(s.offers()).toContain(`crew_collect:${a.id}`);
    s.do(`crew_collect:${a.id}`);
    expect(s.w.hero.cash).toBeGreaterThan(cash + 30);
    expect(s.saw('crew_collect')).toBe(true);
    expect((a.xp ?? 0)).toBeGreaterThan(0); // a shift teaches
  });

  it('a shift stops piling up after two days', () => {
    const { s, deed } = atHome('pod');
    const a = join(s, 'drone', 'Buzz');
    s.do(`station_ally:${a.id}`);
    s.w.clock += 24 * 60 * 2;
    s.run((c) => tickCrews(c));
    s.w.clock += 24 * 60 * 10;
    s.run((c) => tickCrews(c));
    // Twelve days of skimming at 5 an hour would be 1,440; it holds two days' worth, a bit more for a better hand.
    expect(crewOf(deed)[0]!.stash.cash).toBeLessThan(400);
  });

  it('recalls with the stash, only while there is room in the party', () => {
    const { s, deed } = atHome('townhouse');
    const a = join(s, 'drone', 'Buzz');
    s.do(`station_ally:${a.id}`);
    s.w.clock += 5 * 60;
    for (let i = 0; i < MAX_COMPANIONS; i++) join(s, 'kids', `Kid${i}`);
    expect(s.offers().some((k) => k.startsWith('recall_ally'))).toBe(false);
    s.w.hero.companions.pop();
    const cash = s.w.hero.cash;
    s.do(`recall_ally:${a.id}`);
    expect(crewOf(deed)).toHaveLength(0);
    expect(s.w.hero.companions).toContain(a);
    expect(s.w.hero.cash).toBeGreaterThan(cash);
  });

  it('rests the hurt, and goes on to work when mended', () => {
    const { s, deed } = atHome('pod');
    const a = join(s, 'drone', 'Buzz');
    a.hp = 5;
    s.do(`station_ally:${a.id}`);
    expect(crewOf(deed)[0]!.job).toBe('rest');
    s.w.clock += 6 * 60;
    s.run((c) => tickCrews(c));
    expect(a.hp).toBe(a.maxHp);
    s.do(`crew_job:${a.id}`);
    expect(crewOf(deed)[0]!.job).toBe('skim');
  });

  it('stays posted through her death, and a posted NPC is not sent home', () => {
    const u = newUniverse('crew-persist');
    const w = beginRun(u, {});
    const home = w.hero.locationId;
    w.legacy.deeds = [{ id: 'y#0', kind: 'pod', name: 'pod', home, quality: 0.8, price: 1, district: 'tenement', run: 1 } as Deed];
    const comp = newCompanion('hacker', 'Juno2', { loyalty: 70 });
    w.legacy.deeds[0]!.crew = [{ comp, job: 'skim', since: w.clock, stash: { cash: 12, parts: {} } }];
    w.ending = 'dead';
    const u2 = endRun(w);
    const next = beginRun(u2, {});
    expect(crewOf(deedsOf(next)[0]!)[0]!.comp.name).toBe('Juno2');
    expect(crewOf(deedsOf(next)[0]!)[0]!.stash.cash).toBe(12);
    expect(next.hero.companions).toHaveLength(0);
  });
});

