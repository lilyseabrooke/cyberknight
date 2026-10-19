import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { beginRun, endRun, newUniverse } from './universe';
import { GIG_LEVEL, bookedTonight, bookingCandidates, offerBooking, playBooking, privateRooms, tickBookings } from './bookings';
import { moveThrough } from './moves';
import { always, never } from './testkit';
import type { Booking } from './types';

const ctxOf = (w: World, rng: Rng = new Rng('b')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

const booking = (w: World, extra: Partial<Booking> = {}): Booking => {
  const b: Booking = { id: 'bk1', loc: 'neon_pharaoh', night: w.legacy.runs, skill: 'guitar', kind: 'gig', pay: 120, ...extra };
  (w.legacy.bookings ??= []).push(b);
  return b;
};

describe('getting booked', () => {
  it('a so-so player is not worth booking; it takes a crowd expecting a real player', () => {
    const w = createWorld({ seed: 'soso' });
    w.legacy.repute = { guitar: GIG_LEVEL - 1 };
    for (const l of Object.values(w.locations)) if (l.kind === 'bar' || l.kind === 'club') l.visits = 1;
    const { c } = ctxOf(w);
    for (let i = 0; i < 3000; i++) tickBookings(c);
    expect(w.legacy.bookings ?? []).toHaveLength(0);
  });

  it('nobody books a nobody', () => {
    const w = createWorld({ seed: 'nobody' });
    const { c, events } = ctxOf(w);
    for (let i = 0; i < 2000; i++) tickBookings(c);
    expect(w.legacy.bookings ?? []).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('a famous guitarist gets offers, never more than a few open at once', () => {
    const w = createWorld({ seed: 'famous' });
    w.legacy.repute = { guitar: 30 };
    for (const l of Object.values(w.locations)) if (l.kind === 'bar' || l.kind === 'club') l.visits = 1;
    const { c, events } = ctxOf(w);
    for (let i = 0; i < 3000; i++) tickBookings(c);
    expect(w.legacy.bookings!.length).toBeGreaterThan(0);
    expect(w.legacy.bookings!.length).toBeLessThanOrEqual(3);
    for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });

  it('a gig is at a bar or club she knows; a private booking is behind a door she could not walk through', () => {
    const w = createWorld({ seed: 'where' });
    w.legacy.repute = { guitar: 30 };
    w.locations.neon_pharaoh!.visits = 1;
    const { c } = ctxOf(w);
    const gig = offerBooking(c, 'guitar', 'gig')!;
    expect(['bar', 'club']).toContain(w.locations[gig.loc]!.kind);
    const rooms = privateRooms(w).map((l) => l.id);
    expect(rooms).toContain('halo_backroom');
    expect(rooms).toContain('neon_pharaoh');
    const priv = offerBooking(c, 'guitar', 'private')!;
    expect(rooms).toContain(priv.loc);
    expect(priv.pay).toBeGreaterThan(0);
  });
});

describe('the calendar outlives her', () => {
  it('a booking made in one life is waiting in the next', () => {
    const u = newUniverse('calendar');
    const w1 = beginRun(u);
    booking(w1, { night: w1.legacy.runs + 1 });
    w1.ending = 'dead';
    w1.over = true;
    const w2 = beginRun(endRun(w1));
    expect(bookedTonight(w2, 'neon_pharaoh')).toBeDefined();
  });

  it('a night she was booked and never showed up costs fans and fame, and annoys whoever booked her', () => {
    const w = createWorld({ seed: 'noshow' });
    w.hero.fame = 50;
    w.locations.neon_pharaoh!.fans = 20;
    booking(w, { night: w.legacy.runs - 1, host: 'kilobyte' });
    const before = w.npcs.kilobyte?.affinity ?? 0;
    const { c, events } = ctxOf(w);
    tickBookings(c);
    expect(w.legacy.bookings).toHaveLength(0);
    expect(w.hero.fame).toBeLessThan(50);
    expect(w.locations.neon_pharaoh!.fans).toBeLessThan(20);
    if (w.npcs.kilobyte) expect(w.npcs.kilobyte.affinity).toBeLessThan(before);
    const e = events.find((x) => x.type === 'booking')!;
    expect(e.data.variant).toBe('missed');
    expect(hasTemplate(e)).toBe(true);
  });
});

describe('on the night', () => {
  it('she is reminded, and means to show up', () => {
    const w = createWorld({ seed: 'tonight' });
    booking(w);
    const { c, events } = ctxOf(w);
    tickBookings(c);
    expect(events.some((e) => e.type === 'booking' && e.data.variant === 'tonight')).toBe(true);
    expect(w.mind.goals.some((g) => g.kind === 'booking' && g.loc === 'neon_pharaoh')).toBe(true);
  });

  it('the door is expecting her', () => {
    const w = createWorld({ seed: 'door' });
    w.hero.locationId = 'street_main';
    w.hero.fame = 0;
    w.hero.cash = 0;
    booking(w);
    const exit = w.locations.street_main!.exits.find((e) => e.to === 'neon_pharaoh')!;
    const { c, events } = ctxOf(w, never());
    moveThrough(c, exit);
    expect(w.hero.locationId).toBe('neon_pharaoh');
    const e = events.find((x) => x.type === 'go')!;
    expect(e.data.variant).toBe('booked');
    expect(hasTemplate(e)).toBe(true);
  });

  it('a good set pays the fee; a bad one pays the deposit; either way it is played', () => {
    for (const [rng, outcome] of [[always(), 'good'], [never(), 'bad']] as const) {
      const w = createWorld({ seed: `set-${outcome}` });
      w.hero.locationId = 'neon_pharaoh';
      const b = booking(w, { kind: 'private' });
      expect(bookingCandidates(w).map((x) => x.key)).toEqual(['booked_guitar:bk1']);
      const cash = w.hero.cash;
      const { c, events } = ctxOf(w, rng);
      playBooking(c, b);
      expect(b.played).toBe(true);
      expect(bookingCandidates(w)).toHaveLength(0);
      expect(w.hero.cash - cash).toBe(outcome === 'good' ? 120 : 30);
      const e = events.find((x) => x.type === 'booked_guitar')!;
      expect(e.outcome).toBe(outcome);
      expect(hasTemplate(e)).toBe(true);
    }
  });
});
