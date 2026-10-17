import { describe, expect, it } from 'vitest';
import { scenario } from './testkit';
import { fight } from './combat';
import { gather } from './interactions';
import { closureTick, heavyFor, hiringTick, isShut } from './shutdown';
import { adoptContract } from './goals';
import { beginRun, endRun, newUniverse } from './universe';
import { makeCtx } from './run';
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

  it('shut when their doc is taken down, and stay shut while no other doc is on their feet', () => {
    const { w, clinic } = cityWithClinic();
    relocate(w, clinic);
    mighty(w);
    const docs = npcsAt(w, clinic).filter((n) => n.tags.includes('doc'));
    expect(docs.length).toBeGreaterThanOrEqual(1);
    const s = scenario({ seed: 'unused2' });
    const seen: GameEvent[] = [];
    const c = { w, rng: new Rng('clinic-doc'), emit: (type: string, outcome: string, data: Record<string, unknown> = {}) => seen.push({ beat: w.beat, type, outcome, data } as GameEvent) } as Ctx;
    w.beat = 10;
    for (const d of docs) {
      d.hostile = true;
      expect(fight(c, [d], { cause: 'test', joiners: false })).toBe('win');
    }
    expect(s).toBeDefined();
    expect(isShut(w, clinic)).toBe(true);
    expect(seen.some((e) => e.type === 'shut_down' && e.data.variant === 'clinic')).toBe(true);
    expect(seen.filter((e) => e.type === 'shut_down').every(hasTemplate)).toBe(true);
    expect(w.hero.locationId).not.toBe(clinic);
    expect(nearestDoc(w)?.loc).not.toBe(clinic);
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

describe('killing the people the house protects', () => {
  /** She has her mind on the real thing. */
  const want = (s: ReturnType<typeof scenario>, id: string, mode: 'kill' | 'beat_up') => s.run((c) => void adoptContract(c, id, mode, 'test', 0.9));

  it('lets her kill the owner when she means to, and shuts the building for good', () => {
    const s = scenario({ seed: 'kill-dutch3', at: 'halo_floor' });
    mighty(s.w);
    want(s, 'dutch', 'kill');
    layOut(s, s.w.npcs.dutch!);
    expect(s.w.npcs.dutch!.alive).toBe(false);
    for (const id of ['halo_floor', 'halo_kitchen', 'halo_arcade', 'halo_backroom']) {
      expect(isShut(s.w, id)).toBe(true);
      expect(s.w.locations[id]!.sealed).toBeDefined();
    }
    // Not just for the night: a beat far off in the future is still shut.
    s.w.beat = 5000;
    expect(isShut(s.w, 'halo_floor')).toBe(true);
    expect(s.w.hero.locationId).not.toBe('halo_floor');
    expect(s.events.some((e) => e.type === 'shut_down' && e.data.variant === 'owner_dead')).toBe(true);
    expect(s.events.filter((e) => e.type === 'shut_down').every(hasTemplate)).toBe(true);
    // The staff are out looking for other work.
    expect(s.w.npcs.nyx!.locationId).toBe('_away');
  });

  it('lets her kill the bouncer too, and the house weighs it up like any other bad night', () => {
    const s = scenario({ seed: 'kill-tiny', at: 'halo_floor' });
    mighty(s.w);
    s.w.heat.halo = 0;
    want(s, 'tiny', 'kill');
    layOut(s, s.w.npcs.tiny!);
    expect(s.w.npcs.tiny!.alive).toBe(false);
    expect(isShut(s.w, 'halo_floor') || !!s.w.locations.halo_floor!.pendingHire).toBe(true);
  });

  it('keeps a beating a beating: with only a lesson in mind, or nothing, nobody dies', () => {
    for (const mode of ['beat_up', null] as const) {
      const s = scenario({ seed: `lesson-${mode}`, at: 'halo_floor' });
      mighty(s.w);
      if (mode) want(s, 'dutch', mode);
      layOut(s, s.w.npcs.dutch!);
      expect(s.w.npcs.dutch!.alive).toBe(true);
      expect(s.w.locations.halo_floor!.sealed).toBeUndefined();
    }
  });

  it('only changes the rules for the one she is after', () => {
    const s = scenario({ seed: 'wrong-man', at: 'halo_floor' });
    mighty(s.w);
    want(s, 'dutch', 'kill');
    layOut(s, s.w.npcs.tiny!);
    expect(s.w.npcs.tiny!.alive).toBe(true);
  });
});

describe('a bar whose owner is dead', () => {
  interface Morning {
    run: number;
    shut: boolean;
    kitchenShut: boolean;
    sealed: boolean;
    name: string;
    restroom: string;
    house: string;
    blurb: string | undefined;
    dutchAlive: boolean;
    nyxAt: string;
    owner: { id: string; role: string; at: string } | undefined;
  }

  /** Kill Dutch on the first night, then sleep through `nights` more, taking notes each morning. Null if he got away. */
  function mornings(seed: string, nights: number): { reopenRun: number; days: Morning[] } | null {
    const w1 = beginRun(newUniverse(seed), { seed: 'first' });
    w1.hero.locationId = 'halo_floor';
    mighty(w1);
    const c = makeCtx(w1, new Rng(`${seed}:setup`), []);
    adoptContract(c, 'dutch', 'kill', 'test', 0.9);
    w1.beat = 10;
    w1.npcs.dutch!.hostile = true;
    fight(c, [w1.npcs.dutch!], { cause: 'test', joiners: false });
    if (w1.npcs.dutch!.alive) return null; // he ran for it
    const reopenRun = w1.locations.halo_floor!.sealed!.reopenRun;
    const days: Morning[] = [];
    let u = endRun(w1);
    for (let i = 0; i < nights; i++) {
      const w = beginRun(u, { seed: `night-${i}` });
      const floor = w.locations.halo_floor!;
      const boss = Object.values(w.npcs).find((n) => n.tags.includes('owner') && n.alive);
      days.push({
        run: w.legacy.runs,
        shut: isShut(w, 'halo_floor'),
        kitchenShut: isShut(w, 'halo_kitchen'),
        sealed: !!floor.sealed,
        name: floor.name,
        restroom: w.locations.halo_restroom!.name,
        house: w.factions.halo!.name,
        blurb: floor.blurb,
        dutchAlive: w.npcs.dutch!.alive,
        nyxAt: w.npcs.nyx!.locationId,
        owner: boss && { id: boss.id, role: boss.role, at: boss.locationId },
      });
      u = endRun(w);
    }
    return { reopenRun, days };
  }

  const several = (tag: string, n: number) => Array.from({ length: n }, (_, i) => mornings(`${tag}-${i}`, 7)).filter((x) => x !== null);

  it('stays shut for several nights, and then opens under somebody new', () => {
    const r = several('closure', 4)[0]!;
    expect(r.reopenRun).toBeGreaterThanOrEqual(4);
    expect(r.reopenRun).toBeLessThanOrEqual(6);
    for (const d of r.days) {
      const open = d.run >= r.reopenRun;
      expect(d.shut, `night ${d.run}`).toBe(!open);
      expect(d.kitchenShut).toBe(!open);
      expect(d.sealed).toBe(!open);
      expect(d.dutchAlive).toBe(false);
      if (!open) expect(d.nyxAt).toBe('_away');
    }
    const d = r.days.find((x) => x.run === r.reopenRun)!;
    expect(d.owner).toBeDefined();
    expect(d.owner!.id).not.toBe('dutch');
    expect(d.owner!.at).toBe('halo_floor');
    expect(d.owner!.role).toBe(`owner of ${d.name}`);
  });

  it('comes back as something else more often than not, with a new name that sticks to the rooms and the house', () => {
    let renamed = 0;
    let same = 0;
    for (const r of several('rebrand', 36)) {
      const d = r.days.find((x) => x.run === r.reopenRun)!;
      if (d.name === 'The Rusty Halo') {
        same++;
        continue;
      }
      renamed++;
      expect(d.restroom).toBe(`${d.name.split(' ').pop()} restroom`);
      expect(d.house).toBe(d.name);
      expect(d.blurb).toContain('Rusty Halo');
    }
    expect(renamed).toBeGreaterThan(same);
    expect(same).toBeGreaterThan(0);
  });

  it('gets its staff back, except for the odd one who found something better', () => {
    let back = 0;
    let gone = 0;
    for (const r of several('staff', 14)) {
      if (r.days.find((x) => x.run === r.reopenRun)!.nyxAt === 'halo_floor') back++;
      else gone++;
    }
    expect(back).toBeGreaterThan(gone);
  });
});
