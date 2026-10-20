import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { FANCLUB, SUPERFAN_JOBS } from './content/fanclubs';
import { genInstrument, instrumentsOf } from './instruments';
import { venueSuite, mainOf } from './venuetestkit';
import { venueAt } from './venuekit';
import { askFavour, bookingElsewhere, clubs, fanclubCandidates, fanclubTick, FANCLUB_FANS, jobOf, sendTribute, shrineGuitar, tributeDuel, tributeJam } from './fanclub';
import { childId, expand } from './mapgen';
import { relocate } from './combat';
import { everyoneAt } from './population';
import { mythOdds } from './myth';
import { block } from './renown';
import type { World } from './types';
import { makeCtx } from './run';

/** A city where her fans have just opened a club, with her standing in it. */
function inClub(from = 0): Scenario {
  for (let i = from; i < from + 30; i++) {
    let ok = false;
    const sc = scenario({
      seed: `clubtest-${i}`,
      setup: (w) => {
        const street = w.locations[childId('street_main', 0)]!;
        expand(w, street);
        street.fans = FANCLUB_FANS + 20;
        fanclubTick(makeCtxFor(w));
        const club = clubs(w)[0];
        if (!club) return;
        expand(w, club);
        relocate(w, club.id);
        w.hero.cash = 2000;
        ok = true;
      },
    });
    if (ok && sc.w.locations[sc.w.hero.locationId]?.venue?.kind === 'fanclub') return sc;
  }
  throw new Error('no club opened');
}

const makeCtxFor = (w: World) => makeCtx(w, new Rng('club'), []);

const prime = (w: World): void => {
  w.hero.skills.guitar = 2000;
  if (!instrumentsOf(w.hero).length) w.hero.inventory.push(genInstrument(new Rng('fp'), 3));
  w.legacy.repute = { guitar: 40 };
  w.legacy.lostGuitars = [genInstrument(new Rng('fl'), 3)];
};

venueSuite(FANCLUB, { prime, mapped: false, rows: 40, make: inClub, deals: /^(favour|tribute|shrine)/ });

describe('fan clubs open themselves', () => {
  it('opens one where her fans are thick on the ground, once, and keeps it', () => {
    const sc = scenario({ seed: 'opens' });
    const w = sc.w;
    const street = w.locations[childId('street_main', 0)]!;
    expand(w, street);
    expect(clubs(w).length).toBe(0);
    fanclubTick(sc.ctx());
    expect(clubs(w).length).toBe(0);
    delete w.counters.fanclub_checked;
    street.fans = FANCLUB_FANS + 5;
    const evs = sc.run((c) => fanclubTick(c));
    expect(clubs(w).length).toBe(1);
    expect(evs.some((e) => e.type === 'fanclub' && e.data.variant === 'opened')).toBe(true);
    delete w.counters.fanclub_checked;
    fanclubTick(sc.ctx());
    expect(clubs(w).length).toBe(1);
    const club = clubs(w)[0]!;
    expect(club.kind).toBe('fanclub');
    expect(club.venue!.kind).toBe('fanclub');
    expect(club.name.length).toBeGreaterThan(3);
  });

  it('has a president and superfans, and a club round her block is a headquarters', () => {
    const sc = inClub();
    const here = everyoneAt(sc.w, mainOf(sc).id);
    expect(here.some((n) => n.archetype === 'club_president')).toBe(true);
    const edge = 1.9;
    const near = mythOdds(sc.w, edge);
    const clubStreet = mainOf(sc).gen!.parent;
    const far = Object.values(sc.w.locations).find((l) => l.kind === 'street' && !block(sc.w, l).has(clubStreet) && ![...block(sc.w, l)].some((id) => sc.w.locations[id]?.exits.some((e) => e.to === mainOf(sc).id)));
    if (!far) return;
    relocate(sc.w, far.id);
    expect(near).toBeGreaterThan(mythOdds(sc.w, edge));
  });
});

describe('what a club does for her', () => {
  it('every superfan has a real job, and every job does its favour once a night', () => {
    const sc = inClub();
    const w = sc.w;
    prime(w);
    const v = venueAt(w, 'fanclub')!;
    const fan = everyoneAt(w, v.main.id).find((n) => n.archetype === 'superfan');
    if (!fan) return;
    expect(SUPERFAN_JOBS[jobOf(fan)]).toBeTruthy();
    w.heat.npd = 5;
    w.heat.atlas = 5;
    w.heat.muse = 5;
    expect(fanclubCandidates(w).some((c) => c.key === `favour:${fan.id}`)).toBe(true);
    askFavour(sc.ctx(), v, fan);
    expect(fanclubCandidates(w).some((c) => c.key === `favour:${fan.id}`)).toBe(false);
    // Every kind of favour runs.
    for (const job of Object.keys(SUPERFAN_JOBS)) {
      const n = { ...fan, id: `${fan.id}-${job}` };
      for (let k = 0; jobOf(n) !== job && k < 500; k++) n.id = `${fan.id}-${job}-${k}`;
      expect(() => askFavour(sc.ctx(), v, n)).not.toThrow();
    }
  });

  it('the tribute band teaches her her own riffs back, and can be beaten, or not', () => {
    const sc = inClub();
    const w = sc.w;
    prime(w);
    const v = venueAt(w, 'fanclub')!;
    const before = w.hero.skills.guitar ?? 0;
    tributeJam(sc.ctx(), v);
    expect(w.hero.skills.guitar ?? 0).toBeGreaterThan(before);
    w.hero.skills.guitar = 90000;
    tributeDuel(sc.ctx(always()), v);
  });

  it('can send the tribute guitarist to her booking, for half the fee', () => {
    const sc = inClub();
    const w = sc.w;
    const v = venueAt(w, 'fanclub')!;
    (w.legacy.bookings ??= []).push({ id: 'b1', loc: 'neon_pharaoh', night: w.legacy.runs, skill: 'guitar', kind: 'gig', pay: 200 });
    const b = bookingElsewhere(w, v.main.id)!;
    expect(b).toBeTruthy();
    const cash = w.hero.cash;
    sendTribute(sc.ctx(never()), v, b);
    expect(b.played).toBe(true);
    expect(w.hero.cash).toBe(cash + 100);
  });

  it('gives back a guitar off the shrine wall, from the city\'s keeping', () => {
    const sc = inClub();
    const w = sc.w;
    prime(w);
    const v = venueAt(w, 'fanclub')!;
    v.info.keep = { ...(v.info.keep ?? {}), shrine: 1, devotion: 0 };
    const n = w.legacy.lostGuitars!.length;
    shrineGuitar(sc.ctx(always()), v);
    expect(w.legacy.lostGuitars!.length).toBe(n - 1);
  });
});
