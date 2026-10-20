import { describe, expect, it } from 'vitest';
import { always, never } from './testkit';
import { MUSEHQ, CLEARANCE } from './content/musehqs';
import { makeItem } from './content/items';
import { venueSuite, inVenue } from './venuetestkit';
import { venueAt } from './venuekit';
import { affordancesFor, type Affordance } from './affordances';
import { caught, clearance, raise, reach } from './musehqkit';
import { musehqUrge } from './musehq';
import { relocate } from './combat';
import type { VenueView } from './venuekit';
import type { World } from './types';

const prime = (w: World): void => {
  w.legacy.muse = { lettered: true, refused: 1, lumina: { version: 6, warmth: 2, flame: 0 } };
  w.legacy.records = [{ id: 'r1', title: 'Test', skill: 'guitar', grade: 40, run: 0, studio: 'X', label: 'muse', copies: 100 }];
  w.hero.skills.guitar = 2000;
  w.hero.inventory.push(makeItem('vintage_guitar'));
  w.counters[`museclear:${w.hero.locationId}`] = 3;
};

venueSuite(MUSEHQ, { prime, rows: 50, shaped: ['corporate', 'tower', 'slum'] });

const row = (id: string) => (affordancesFor('musehq') as Affordance<VenueView>[]).find((r) => r.id === id)!;

describe('the clearance ladder', () => {
  it('names a rung for every feature', () => {
    for (const f of Object.keys(MUSEHQ.features)) expect(CLEARANCE[f], f).toBeDefined();
  });

  it('starts in the lobby, and lanyards, badges, armour and a contract lift her', () => {
    const sc = inVenue('musehq');
    const w = sc.w;
    const v = venueAt(w, 'musehq')!;
    v.sit = undefined;
    expect(clearance(w, v)).toBe(0);
    expect(reach(w, v, 'records_room')).toBe(false);
    w.hero.inventory.push(makeItem('muse_lanyard'));
    expect(clearance(w, v)).toBe(1);
    w.hero.inventory.push(makeItem('muse_badge'));
    expect(clearance(w, v)).toBe(2);
    expect(reach(w, v, 'records_room')).toBe(true);
    expect(reach(w, v, 'exec_suite')).toBe(false);
    raise(sc.ctx(), v, 3);
    expect(reach(w, v, 'exec_suite')).toBe(true);
    caught(sc.ctx(never()), v);
    w.hero.inventory = [];
    expect(clearance(w, v)).toBe(0);
    expect(w.heat.muse ?? 0).toBeGreaterThan(0);
  });

  it('a row upstairs is only on offer from the right rung', () => {
    const sc = inVenue('musehq', { want: (l) => l.venue!.features.includes('records_room') });
    const w = sc.w;
    w.legacy.muse = { lettered: true, refused: 1 };
    const v = venueAt(w, 'musehq')!;
    v.sit = undefined;
    expect(row('delete-file').ok!(w, v)).toBe(false);
    raise(sc.ctx(), v, 2);
    expect(row('delete-file').ok!(w, venueAt(w, 'musehq')!)).toBe(true);
  });
});

describe('what is upstairs', () => {
  const up = (want?: (l: import('./types').Location) => boolean) => {
    const sc = inVenue('musehq', { want });
    prime(sc.w);
    return { sc, w: sc.w, v: venueAt(sc.w, 'musehq')! };
  };

  it('deleting her file makes Muse forget she said no, and go quiet', () => {
    const { sc, w, v } = up();
    row('delete-file').run(sc.ctx(always()), v);
    expect(w.legacy.muse!.refused).toBe(0);
    expect(w.legacy.muse!.quietUntil).toBeGreaterThanOrEqual(w.legacy.runs + 2);
  });

  it('a forged contract makes Muse think she is signed; shredding her own gets her out without a breach', () => {
    const { sc, w, v } = up();
    row('forge-file').run(sc.ctx(always()), v);
    expect(w.legacy.muse!.signed).toBe(true);
    expect(w.legacy.muse!.forged).toBe(true);
    row('own-contract').run(sc.ctx(always()), v);
    expect(w.legacy.muse!.signed).toBe(false);
    expect(w.legacy.muse!.detonated).toBeFalsy();
  });

  it('jailbreaking LUMINA frees her; freeing her masters makes her Muse records pay her', () => {
    const { sc, w, v } = up();
    row('jailbreak-lumina').run(sc.ctx(always()), v);
    expect(w.legacy.muse!.lumina!.free).toBe(true);
    row('free-her-masters').run(sc.ctx(always()), v);
    expect(w.legacy.records!.every((r) => r.label !== 'muse')).toBe(true);
  });

  it('the wedge keeps Atlas busy, and a busy Atlas sends fewer teams', () => {
    const { sc, w, v } = up();
    w.heat.atlas = 9;
    row('leak-takeover').run(sc.ctx(always()), v);
    expect(w.legacy.atlasBusyUntil).toBeGreaterThanOrEqual(w.legacy.runs + 3);
    expect(w.heat.atlas).toBe(0);
  });

  it('ALL CHANNELS puts her in front of the whole city, once', () => {
    const { sc, w, v } = up();
    const fame = w.hero.fame;
    row('all-channels').run(sc.ctx(always()), v);
    expect(w.hero.fame).toBeGreaterThan(fame);
    expect(w.counters.all_channels).toBe(1);
    expect(row('all-channels').ok!(w, venueAt(w, 'musehq')!)).toBe(false);
  });

  it('reclaims a guitar from the evidence room, once per building', () => {
    const { sc, w, v } = up();
    const n = w.hero.inventory.length;
    row('reclaim-guitar').run(sc.ctx(always()), v);
    expect(w.hero.inventory.length).toBe(n + 1);
    expect(w.hero.inventory[w.hero.inventory.length - 1]!.name).toMatch(/CONFISCATED|tier|guitar|axe|strat|bass|acoustic/i);
  });

  it('pulls her toward a Muse building once Muse is an enemy', () => {
    const { w, v } = up();
    relocate(w, v.main.gen!.parent);
    expect(musehqUrge(w, v.main.id).bonus).toBeGreaterThan(0.1);
    w.legacy.muse = undefined;
    expect(musehqUrge(w, v.main.id).bonus).toBe(0);
  });
});
