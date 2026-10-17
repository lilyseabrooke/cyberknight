import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent } from './index';
import { createWorld } from './world';
import { relocate } from './combat';
import { arrive } from './candidate';
import { liftCordon } from './mapgen';
import { gather } from './interactions';
import { parkedVehicle, roadsFrom, vehicleCandidates } from './vehicles';
import { always } from './testkit';
import { perform } from './run';
import type { Ctx, Id, World } from './types';

const ctxOf = (w: World, seed = 'v'): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

/** A street with a car of this kind parked on it, found by looking. */
function streetWith(kind: 'civilian' | 'police' | 'atlas'): { w: World; street: Id } {
  for (let i = 0; i < 400; i++) {
    const w = createWorld({ seed: `car-${i}`, competence: 0.5 });
    for (const loc of Object.values(w.locations)) if (loc.kind === 'street' && parkedVehicle(w, loc)?.kind === kind) return { w, street: loc.id };
  }
  throw new Error(`no ${kind} car anywhere`);
}

const hijackOf = (w: World, street: Id) => vehicleCandidates(w).find((x) => x.key === `hijack:${street}`)!;

describe('vehicles', () => {
  it('a street can have a car parked on it, and taking it removes it', () => {
    const { w, street } = streetWith('civilian');
    relocate(w, street);
    w.locations[street]!.cameras = 0;
    for (const n of Object.values(w.npcs)) if (n.locationId === street) (n as { locationId: string }).locationId = '_gone';
    const { c, events } = ctxOf(w, 'ok');
    c.rng = always();
    perform(c, hijackOf(w, street));
    expect(events.some((e) => e.type === 'hijack' && e.data.variant === 'ok')).toBe(true);
    expect(w.hero.vehicle?.kind).toBe('civilian');
    expect(parkedVehicle(w, w.locations[street]!)).toBeNull();
    expect(w.heat.npd ?? 0).toBe(0);
    expect(events.every(hasTemplate)).toBe(true);
  });

  it('police cars heat up the police even when nobody sees, and Atlas cars Atlas', () => {
    for (const [kind, faction] of [['police', 'npd'], ['atlas', 'atlas']] as const) {
      const { w, street } = streetWith(kind);
      relocate(w, street);
      for (const n of Object.values(w.npcs)) if (n.locationId === street) (n as { locationId: string }).locationId = '_gone';
      w.locations[street]!.cameras = 0;
      const { c, events } = ctxOf(w, `heat-${kind}`);
      c.rng = always();
      perform(c, hijackOf(w, street));
      expect(w.heat[faction] ?? 0, kind).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'heat_up' && e.data.variant === faction)).toBe(true);
      expect(events.every(hasTemplate)).toBe(true);
    }
  });

  it('being seen taking a civilian car is police heat; a failed attempt always is', () => {
    const { w, street } = streetWith('civilian');
    relocate(w, street);
    w.locations[street]!.cameras = 2;
    w.flags.blackout = false;
    const { c } = ctxOf(w, 'seen');
    perform(c, hijackOf(w, street));
    expect(w.heat.npd ?? 0).toBeGreaterThan(0);
  });

  it('driving covers several streets in one go, faster than walking, and a building leaves the car at the kerb', () => {
    const w = createWorld({ seed: 'drive', competence: 0.5 });
    liftCordon(w);
    // Walk out a few streets so there is a road to drive.
    let at = 'street_main';
    relocate(w, at);
    for (let i = 0; i < 6; i++) {
      const next = w.locations[at]!.exits.find((e) => !e.gate && w.locations[e.to]!.kind === 'street' && w.locations[e.to]!.visits === 0);
      if (!next) break;
      at = next.to;
      relocate(w, at);
    }
    relocate(w, 'street_main');
    w.hero.vehicle = { kind: 'civilian', name: 'a test car', speed: 1 };
    const roads = roadsFrom(w, 'street_main', 4);
    const far = roads.find((r) => r.hops >= 3);
    expect(far).toBeDefined();
    const { c, events } = ctxOf(w, 'go');
    const before = w.clock;
    const cand = gather(w).find((x) => x.key === `drive:${far!.id}`)!;
    expect(cand).toBeDefined();
    perform(c, cand);
    expect(w.hero.locationId).toBe(far!.id);
    expect(w.hero.vehicle).toBeDefined();
    expect(w.clock - before).toBeLessThan(far!.hops * 3);
    expect(events.every(hasTemplate)).toBe(true);
    // Into a building: the car stays outside.
    const door = w.locations[w.hero.locationId]!.exits.find((e) => !e.gate && w.locations[e.to]!.kind !== 'street');
    if (door) {
      relocate(w, door.to);
      expect(w.hero.vehicle).toBeUndefined();
      expect(w.hero.parked).toHaveLength(1);
    }
  });

  it('a car she has taken stays hers: she gets back in without hijacking, until it is gone', () => {
    const { w, street } = streetWith('civilian');
    relocate(w, street);
    w.hero.vehicle = { kind: 'civilian', name: 'a test car', speed: 1 };
    const door = w.locations[street]!.exits.find((e) => !e.gate && w.locations[e.to]!.kind !== 'street' && !w.locations[e.to]!.dungeon)!;
    const { c, events } = ctxOf(w, 'back');
    arrive(c, door.to, 'walk');
    expect(w.hero.vehicle).toBeUndefined();
    arrive(c, street, 'walk');
    const keys = gather(w).map((x) => x.key);
    expect(keys).toContain(`getin:${street}`);
    expect(keys).not.toContain(`hijack:${street}`);
    perform(c, gather(w).find((x) => x.key === `getin:${street}`)!);
    expect(w.hero.vehicle?.name).toBe('a test car');
    expect(w.hero.parked).toHaveLength(0);
    expect(events.every(hasTemplate)).toBe(true);
    // Left for good: it is towed away.
    arrive(c, door.to, 'walk');
    w.clock += 3 * 24 * 60;
    arrive(c, street, 'walk');
    expect(w.hero.parked).toHaveLength(0);
    expect(w.hero.vehicle).toBeUndefined();
    expect(events.some((e) => e.type === 'vehicle' && e.data.variant === 'gone')).toBe(true);
    expect(events.every(hasTemplate)).toBe(true);
  });
});
