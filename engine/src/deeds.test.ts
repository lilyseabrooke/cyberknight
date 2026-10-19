import { describe, expect, it } from 'vitest';
import { never, scenario } from './testkit';
import { buyDeed, ensureHomes, ownsDeed } from './deeds';
import { DEEDS } from './content/deeds';
import { LODGING } from './content/lodging';
import { beginRun, endRun, newUniverse } from './universe';
import { restCandidates, errands } from './rest';
import { debtOf, sleepOf } from './needs';
import type { World } from './types';

const tired = (w: World) => {
  w.hero.sleep = 20;
  w.hero.hunger = 90;
  w.hero.cash = 0;
};

describe('deeds', () => {
  it('cost the account, and cannot be bought twice or on credit', () => {
    const u = newUniverse('deed-1');
    expect(buyDeed(u, 'pod_apartment')).toMatchObject({ ok: false, reason: 'poor' });
    u.legacy.account = 5000;
    expect(buyDeed(u, 'pod_apartment')).toEqual({ ok: true, paid: DEEDS.pod_apartment.price });
    expect(u.legacy.account).toBe(5000 - DEEDS.pod_apartment.price);
    expect(buyDeed(u, 'pod_apartment')).toMatchObject({ ok: false, reason: 'owned' });
    expect(buyDeed(u, 'nope')).toMatchObject({ ok: false, reason: 'unknown' });
    expect(buyDeed(u, 'townhouse')).toMatchObject({ ok: false, reason: 'poor' });
  });

  it('put the home on Strand Street, and carry over between deaths', () => {
    const u = newUniverse('deed-2');
    u.legacy.account = 99999;
    buyDeed(u, 'townhouse');
    expect(u.locations.deed_townhouse?.kind).toBe('home');
    expect(u.locations.street_main!.exits.some((e) => e.to === 'deed_townhouse')).toBe(true);
    ensureHomes(u);
    expect(u.locations.street_main!.exits.filter((e) => e.to === 'deed_townhouse')).toHaveLength(1);
    const w = beginRun(u);
    w.over = true;
    w.ending = 'dead';
    const u2 = endRun(w);
    const w2 = beginRun(u2);
    expect(ownsDeed(w2.legacy, 'townhouse')).toBe(true);
    expect(w2.locations.deed_townhouse).toBeDefined();
  });

  it('give her a free bed at home, as good as the home', () => {
    for (const [deed, id] of [['pod_apartment', 'deed_pod_apartment'], ['townhouse', 'deed_townhouse']] as const) {
      const s = scenario({ seed: `deed-sleep-${deed}` });
      s.w.legacy.account = 99999;
      buyDeed(s.w, deed);
      expect(restCandidates(s.w).map((c) => c.key)).not.toContain('sleep_home');
      s.w.hero.locationId = id;
      tired(s.w);
      expect(restCandidates(s.w).map((c) => c.key)).toContain('sleep_home');
      s.do('sleep_home', never());
      expect(s.w.hero.cash).toBe(0);
      expect(sleepOf(s.w.hero)).toBeGreaterThan(90);
    }
  });

  it('are better to sleep in the better the home is', () => {
    const debtAfter = (deed: 'pod_apartment' | 'townhouse') => {
      const s = scenario({ seed: 'deed-debt' });
      s.w.legacy.account = 99999;
      buyDeed(s.w, deed);
      s.w.hero.locationId = DEEDS[deed].home.id;
      tired(s.w);
      s.w.hero.sleepDebt = 8;
      s.do('sleep_home', never());
      return debtOf(s.w.hero);
    };
    expect(DEEDS.pod_apartment.quality).toBeGreaterThan(LODGING.pod.quality);
    expect(debtAfter('townhouse')).toBeLessThan(debtAfter('pod_apartment'));
  });

  it('are where she heads for a bed when she is broke', () => {
    const s = scenario({ seed: 'deed-errand', at: 'halo_alley' });
    s.w.legacy.account = 99999;
    buyDeed(s.w, 'pod_apartment');
    tired(s.w);
    expect(errands(s.w).bed?.loc).toBe('deed_pod_apartment');
  });
});
