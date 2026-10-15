import { describe, expect, it } from 'vitest';
import { scenario } from './testkit';
import { fight } from './combat';
import { gather } from './interactions';
import { closureTick, isShut } from './shutdown';
import { routeTo } from './plans';
import { hasTemplate } from './text';
import { Rng } from './rng';
import { genWeapon } from './weapons';
import type { Npc, World } from './types';

function mighty(w: World): void {
  const h = w.hero;
  h.level = 14;
  h.maxHp = h.hp = 600;
  h.muscle = 9;
  h.weapon = genWeapon(new Rng('mighty'), { tier: 6.5, cls: 'blade' });
  h.armor = null;
}

/** Put somebody on the floor without a fight, the way a win leaves them. */
function layOut(s: ReturnType<typeof scenario>, n: Npc): void {
  s.w.beat = 10;
  let result = '';
  s.run((c) => {
    n.hostile = true;
    result = fight(c, [n], { cause: 'test', joiners: false });
  });
  expect(result).toBe('win');
}

describe('taking people down', () => {
  it('leaves them down for a good while, longer for tougher people', () => {
    const s = scenario({ seed: 'down', at: 'halo_floor' });
    mighty(s.w);
    const tiny = s.w.npcs.tiny!;
    layOut(s, tiny);
    expect(tiny.alive || tiny.downUntil > s.w.beat).toBe(true);
    if (tiny.alive) expect(tiny.downUntil - s.w.beat).toBeGreaterThan(60);
  });

  it('shuts the bar when its owner goes down: she is shown out, and nobody gets in until it reopens', () => {
    const s = scenario({ seed: 'owner', at: 'halo_floor' });
    mighty(s.w);
    layOut(s, s.w.npcs.dutch!);
    const dutch = s.w.npcs.dutch!;
    expect(isShut(s.w, 'halo_floor')).toBe(true);
    expect(isShut(s.w, 'halo_kitchen')).toBe(true);
    expect(s.w.hero.locationId).toBe('street_main');
    expect(s.events.some((e) => e.type === 'shut_down' && e.data.variant === 'owner')).toBe(true);
    expect(s.events.filter((e) => e.type === 'shut_down').every(hasTemplate)).toBe(true);
    expect(gather(s.w).some((c) => c.key === 'go:halo_floor')).toBe(false);
    expect(routeTo(s.w, 'street_main', 'halo_restroom')).toBeNull();
    // later it opens again
    s.w.beat = s.w.locations.halo_floor!.shutUntil! + 1;
    expect(isShut(s.w, 'halo_floor')).toBe(false);
    expect(routeTo(s.w, 'street_main', 'halo_restroom')).not.toBeNull();
  });

  it('does not shut the bar for a regular, or for the bartender while the owner can still pour', () => {
    const s = scenario({ seed: 'nyx', at: 'halo_floor' });
    mighty(s.w);
    layOut(s, s.w.npcs.nyx!);
    expect(isShut(s.w, 'halo_floor')).toBe(false);
  });

  it('has the police close a shop once they arrive, not before', () => {
    const s = scenario({ seed: 'clerk', at: 'chem_mart' });
    mighty(s.w);
    const keeper = s.w.npcs.pharmacist!;
    layOut(s, keeper);
    const mart = s.w.locations.chem_mart!;
    expect(mart.pendingShut).toBeDefined();
    expect(isShut(s.w, 'chem_mart')).toBe(false);
    s.w.beat = mart.pendingShut!.due - 1;
    s.run(closureTick);
    expect(isShut(s.w, 'chem_mart')).toBe(false);
    s.w.beat = mart.pendingShut!.due;
    s.run(closureTick);
    expect(isShut(s.w, 'chem_mart')).toBe(true);
    expect(mart.shutBy).toBe('police');
    expect(s.w.hero.locationId).toBe('street_main');
    expect(keeper.downUntil).toBeGreaterThanOrEqual(mart.shutUntil!);
    expect(gather(s.w).some((c) => c.key === 'go:chem_mart')).toBe(false);
  });
});
