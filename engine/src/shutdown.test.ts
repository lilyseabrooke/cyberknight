import { describe, expect, it } from 'vitest';
import { scenario } from './testkit';
import { fight } from './combat';
import { gather } from './interactions';
import { closureTick, heavyFor, hiringTick, isShut } from './shutdown';
import { relocate } from './combat';
import { childId } from './mapgen';
import { nearestDoc, docErrand } from './supply';
import { npcsAt } from './population';
import { routeTo } from './plans';
import { hasTemplate } from './text';
import { Rng } from './rng';
import { genWeapon } from './weapons';
import type { Ctx, GameEvent, Npc, World } from './types';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';

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

describe('when the muscle goes down', () => {
  it('a bad night is a hiring problem: the house finds somebody new and carries on', () => {
    const s = scenario({ seed: 'muscle', at: 'halo_floor' });
    mighty(s.w);
    s.w.heat.halo = 0;
    const tiny = s.w.npcs.tiny!;
    layOut(s, tiny);
    const floor = s.w.locations.halo_floor!;
    expect(isShut(s.w, 'halo_floor')).toBe(false);
    expect(floor.pendingHire).toBeDefined();
    expect(s.events.some((e) => e.type === 'house_decides' && e.data.variant === 'hire')).toBe(true);
    s.w.beat = floor.pendingHire!.due;
    s.run(hiringTick);
    const door = npcsAt(s.w, 'halo_floor').find((n) => n.role === 'bouncer' && n !== tiny);
    expect(door).toBeDefined();
    expect(door!.ephemeral).toBe(true);
    expect(heavyFor(s.w, 'halo_floor')).toBe(door);
    expect(s.events.filter((e) => e.type === 'house_decides').every(hasTemplate)).toBe(true);
  });

  it('a pattern is a closing problem: with the heat up and other staff down, they shut the doors instead', () => {
    const s = scenario({ seed: 'muscle2', at: 'halo_floor' });
    mighty(s.w);
    s.w.heat.halo = 10;
    layOut(s, s.w.npcs.tiny!);
    expect(isShut(s.w, 'halo_floor')).toBe(true);
    expect(s.events.some((e) => e.type === 'shut_down' && e.data.variant === 'muscle')).toBe(true);
    expect(s.w.locations.halo_floor!.pendingHire).toBeUndefined();
    expect(s.events.filter((e) => e.type === 'shut_down').every(hasTemplate)).toBe(true);
  });
});

describe('street clinics', () => {
  /** Walk outwards until the city has grown a clinic. */
  function cityWithClinic(): { w: World; clinic: string } {
    for (let i = 0; i < 40; i++) {
      const s = scenario({ seed: `clinic-${i}` });
      const queue = [childId('street_main', 0), childId('street_main', 1), childId('halo_alley', 0), childId('club_backlot', 0)];
      for (let n = 0; n < 40 && queue.length; n++) {
        const id = queue.shift()!;
        relocate(s.w, id);
        for (const e of s.w.locations[id]!.exits) {
          const to = s.w.locations[e.to]!;
          if (to.kind === 'clinic') return { w: s.w, clinic: to.id };
          if (to.gen?.role === 'street' && !to.gen.expanded) queue.push(to.id);
        }
      }
    }
    throw new Error('no clinic grew in 40 cities');
  }

  it('grow on streets, with a doc or two behind the counter and automation on the door', () => {
    const { w, clinic } = cityWithClinic();
    const loc = w.locations[clinic]!;
    expect(loc.kind).toBe('clinic');
    relocate(w, clinic);
    const people = npcsAt(w, clinic);
    expect(people.filter((n) => n.tags.includes('doc')).length).toBeGreaterThanOrEqual(1);
    expect(loc.blurb).toBeTruthy();
    // the guards stay quiet until something kicks off
    expect(people.filter((n) => n.tags.includes('guard')).every((n) => !n.hostile)).toBe(true);
  });

  it('give her somewhere to be patched when the Halo is shut', () => {
    const { w, clinic } = cityWithClinic();
    const street = w.locations[clinic]!.gen!.parent;
    relocate(w, street); // she has seen the door
    w.hero.cash = 100;
    w.hero.maxHp = 100;
    w.hero.hp = 20;
    for (const id of ['halo_floor', 'halo_restroom', 'halo_kitchen', 'halo_arcade', 'halo_backroom']) w.locations[id]!.shutUntil = 9999;
    const pick = nearestDoc(w);
    expect(pick?.loc).toBe(clinic);
    expect(docErrand(w)?.next).toBe(clinic);
  });

  it('turn their guards on her when she starts a fight there', () => {
    const { w, clinic } = cityWithClinic();
    relocate(w, clinic);
    mighty(w);
    const guard = spawnNpc(new Rng('g'), 'test_guard', 'guard_dog', clinic);
    addNpc(w, guard);
    const patron = spawnNpc(new Rng('p'), 'test_patron', 'mugger', clinic);
    addNpc(w, patron);
    const s = scenario({ seed: 'unused' });
    const seen: GameEvent[] = [];
    const c = { w, rng: new Rng('clinic-fight'), emit: (type: string, outcome: string, data: Record<string, unknown> = {}) => seen.push({ beat: w.beat, type, outcome, data } as GameEvent) } as Ctx;
    fight(c, [patron], { cause: 'test', assault: true });
    expect(s).toBeDefined();
    const end = seen.find((e) => e.type === 'fight_end')!;
    expect(end.data.count).toBeGreaterThan(1); // the guard piled in
    expect(guard.hostile).toBe(true);
  });
});
