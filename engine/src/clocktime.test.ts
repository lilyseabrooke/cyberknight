import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { Rng, personalityFrom } from './index';
import { tickVenues } from './stage';
import { gainSatiety, satietyOf, tickSatiety } from './romance';
import { cool, coolFor, cooling } from './mind';
import { SHELF_EVERY, tickShelf } from './supply';
import type { Ctx, GameEvent } from './types';
import { every } from './clock';

const world = (seed: string) => createWorld({ seed, competence: 0.8, personality: personalityFrom({}) });

describe('things that last are measured in world minutes, not beats', () => {
  it('a crowd recovers by the time that has passed, not by how many ticks it took', () => {
    const a = world('ct1');
    const b = world('ct1');
    for (const w of [a, b]) w.locations.halo_floor!.fatigue = { vocals: 1 };
    for (let i = 0; i < 10; i++) tickVenues(a, 3);
    tickVenues(b, 30);
    expect(b.locations.halo_floor!.fatigue!.vocals).toBeCloseTo(a.locations.halo_floor!.fatigue!.vocals!, 9);
  });

  it('appetite returns over half a day in one step', () => {
    const w = world('ct2');
    gainSatiety(w.hero, 1);
    tickSatiety(w.hero, 12 * 60);
    expect(satietyOf(w.hero)).toBe(0);
  });

  it('a clock cooldown lapses with the world clock and ignores beats; a beat cooldown does the opposite', () => {
    const w = world('ct3');
    coolFor(w, 'door', 120);
    cool(w, 'nag', 20);
    w.beat += 1000;
    expect(cooling(w, 'door')).toBe(true);
    expect(cooling(w, 'nag')).toBe(false);
    w.clock += 121;
    expect(cooling(w, 'door')).toBe(false);
  });

  it('the gunsmith restocks when enough world time has passed, however few beats that took', () => {
    const w = world('ct4');
    const c = { w, rng: new Rng('shelf'), emit: (() => {}) as unknown } as Ctx;
    tickShelf(c);
    const due = w.shelfAt!;
    expect(due).toBe(w.clock + SHELF_EVERY);
    const before = JSON.stringify(Object.keys(w.arsenal ?? {}));
    w.clock = due - 1;
    tickShelf(c);
    expect(JSON.stringify(Object.keys(w.arsenal ?? {}))).toBe(before);
    w.clock = due; // one beat later, after a long sleep
    tickShelf(c);
    expect(w.shelfAt).toBe(due + SHELF_EVERY);
    expect(JSON.stringify(Object.keys(w.arsenal ?? {}))).not.toBe(before);
  });
});

describe('every(): periodic upkeep follows the world clock', () => {
  it('counts whole spans, keeps the remainder, and does not care how many beats it took', () => {
    const w = world('ct5');
    expect(every(w, 'x', 30)).toBe(0);
    w.clock += 29;
    expect(every(w, 'x', 30)).toBe(0);
    w.clock += 1;
    expect(every(w, 'x', 30)).toBe(1);
    w.clock += 8 * 60 + 10; // a night's sleep in one beat
    expect(every(w, 'x', 30)).toBe(16);
    expect(every(w, 'x', 30)).toBe(0);
  });
});
