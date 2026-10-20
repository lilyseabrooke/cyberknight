import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always } from './testkit';
import { ARENA, arenaPhase, PHASES } from './content/arenas';
import { genInstrument } from './instruments';
import { venueSuite, inVenue } from './venuetestkit';
import { venueAt } from './venuekit';
import { affordancesFor, type Affordance } from './affordances';
import { arenaUrge } from './arena';
import { prestige } from './stage';
import { relocate } from './combat';
import { MIN_PER_DAY } from './clock';
import type { VenueView } from './venuekit';
import type { World } from './types';

const prime = (w: World): void => {
  w.hero.skills.guitar = 2500;
  w.hero.inventory.push(genInstrument(new Rng('ap'), 3));
  w.counters[`arena_in:${w.hero.locationId}`] = 1;
  w.hero.cash = 99999;
};

venueSuite(ARENA, { prime, rows: 40, shaped: ['corporate', 'atlas_dome', 'slum'], menuTags: ['show', 'encore', 'concert', 'crowd', 'muse', 'lumina'] });

const row = (id: string) => (affordancesFor('arena') as Affordance<VenueView>[]).find((r) => r.id === id)!;

describe('a show day', () => {
  it('runs in phases by the hour, a pure function of the clock', () => {
    const at = (h: number) => arenaPhase(3 * MIN_PER_DAY + h * 60)[0];
    expect(at(15)).toBe('load_in');
    expect(at(18)).toBe('soundcheck');
    expect(at(19.5)).toBe('doors');
    expect(at(21)).toBe('show');
    expect(at(23.5)).toBe('encore');
    expect(at(1)).toBe('load_out');
    expect(at(10)).toBe('between');
    for (let h = 0; h < 24; h++) expect(PHASES as readonly string[]).toContain(at(h));
  });

  it('puts the phase on today\'s situation, and pays like an arena', () => {
    const sc = inVenue('arena');
    const w = sc.w;
    w.clock = Math.floor(w.clock / MIN_PER_DAY) * MIN_PER_DAY + 21 * 60;
    const v = venueAt(w, 'arena')!;
    expect(v.sit?.def.tags).toContain('show');
    expect(prestige(v.main)).toBeGreaterThan(prestige(w.locations.halo_floor!));
  });

  it('getting in with the crew opens the backstage rows', () => {
    const sc = inVenue('arena');
    const w = sc.w;
    const v = venueAt(w, 'arena')!;
    expect(row('raid-the-rider').ok!(w, v)).toBe(false);
    row('carry-cases').run(sc.ctx(always()), v);
    expect(row('raid-the-rider').ok!(w, venueAt(w, 'arena')!)).toBe(true);
  });

  it('on a dark night she can hire it and headline it', () => {
    const sc = inVenue('arena');
    const w = sc.w;
    prime(w);
    const v = venueAt(w, 'arena')!;
    const cash = w.hero.cash;
    row('hire-the-arena').run(sc.ctx(always()), v);
    expect(w.hero.cash).toBeLessThan(cash);
    expect(row('headline-own-show').ok!(w, venueAt(w, 'arena')!)).toBe(true);
    const fame = w.hero.fame;
    row('headline-own-show').run(sc.ctx(always()), venueAt(w, 'arena')!);
    expect(w.hero.fame).toBeGreaterThan(fame);
    expect(row('headline-own-show').ok!(w, venueAt(w, 'arena')!)).toBe(false);
  });

  it('pulls a famous Blackbird toward it', () => {
    const sc = inVenue('arena');
    const w = sc.w;
    const v = venueAt(w, 'arena')!;
    relocate(w, v.main.gen!.parent);
    w.hero.fame = 300;
    expect(arenaUrge(w, v.main.id).bonus).toBeGreaterThan(0.1);
  });
});
