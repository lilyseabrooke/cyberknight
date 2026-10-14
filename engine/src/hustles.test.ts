import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, runToEnd, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { chores, doorSlots, hustleCandidates, oddJobReady, parcels, tickHustles, wary } from './hustles';
import { tickVenues } from './stage';
import { spawnNpc } from './content/archetypes';
import type { Npc } from './types';

const world = (seed: string, competence = 0.8): World => createWorld({ seed, competence, personality: personalityFrom({}) });
const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const npc = (w: World, id: string, archetype: string, loc: string, extra: Partial<Npc> = {}): Npc => {
  const n = Object.assign(spawnNpc(new Rng(id), id, archetype, loc, {}), extra);
  w.npcs[id] = n;
  return n;
};
const empty = (w: World, loc: string, keep: string[] = []) => {
  for (const n of Object.values(w.npcs)) if (n.locationId === loc && !keep.includes(n.id)) n.locationId = '_gone';
  w.hero.locationId = loc;
};
const keys = (w: World, prefix: string) => hustleCandidates(w).filter((x) => x.key.startsWith(prefix));
const run = (w: World, key: string, seed = 'r') => {
  const cand = hustleCandidates(w).find((x) => x.key === key)!;
  const r = ctxOf(w, seed);
  cand.run(r.c);
  return r.events;
};
const tick = (w: World, beats: number, seed = 't') => {
  const { c } = ctxOf(w, seed);
  for (let i = 0; i < beats; i++) {
    w.beat++;
    tickHustles(c);
    tickVenues(w);
  }
};

describe('odd jobs: work the place makes', () => {
  it('there is only so much to do, and doing it uses it up; no waiting period', () => {
    const w = world('chores');
    empty(w, 'halo_floor', ['dutch']);
    w.npcs.dutch!.locationId = 'halo_floor';
    const have = Math.floor(chores(w, w.npcs.dutch!));
    expect(have).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < have; i++) {
      expect(keys(w, 'odd_jobs:dutch').length, `job ${i}`).toBe(1);
      run(w, 'odd_jobs:dutch', `j${i}`);
      w.beat++; // back to back
    }
    expect(keys(w, 'odd_jobs:dutch').length).toBe(0);
    expect(oddJobReady(w, w.npcs.dutch!)).toBe(false);
  });

  it('a busy room makes work faster than an empty one', () => {
    const wBusy = world('busy');
    const wQuiet = world('quiet');
    for (const [w, extra] of [[wBusy, 8], [wQuiet, 0]] as const) {
      empty(w, 'halo_floor', ['dutch']);
      w.npcs.dutch!.locationId = 'halo_floor';
      w.counters.chores_dutch = 0;
      for (let i = 0; i < extra; i++) npc(w, `p${i}`, 'patron', 'halo_floor');
      tick(w, 40);
    }
    expect(wBusy.counters.chores_dutch!).toBeGreaterThan(wQuiet.counters.chores_dutch! * 2);
    expect(wBusy.counters.chores_dutch!).toBeLessThanOrEqual(3);
  });
});

describe('the door at the club', () => {
  it('has a shift open when it is busy, and a shift taken stays taken', () => {
    const w = world('door');
    empty(w, 'neon_pharaoh');
    const guard = npc(w, 'g1', 'club_security', 'neon_pharaoh', { affinity: 10 });
    expect(guard.tags).toContain('security');
    w.counters.door_slots = 1;
    expect(keys(w, 'security_shift').length).toBe(1);
    run(w, 'security_shift');
    expect(doorSlots(w)).toBe(0);
    expect(keys(w, 'security_shift').length).toBe(0);
    tick(w, 80);
    expect(doorSlots(w)).toBe(0); // nobody in the club to cover
    for (let i = 0; i < 6; i++) npc(w, `d${i}`, 'patron', 'neon_pharaoh');
    tick(w, 100);
    expect(doorSlots(w)).toBeGreaterThanOrEqual(1);
  });
});

describe('couriers', () => {
  it('a package is a package: she takes it, and the next one arrives with the shipment; and not when the law is on her', () => {
    const w = world('courier');
    empty(w, 'halo_floor', ['skeeter']);
    w.npcs.skeeter!.locationId = 'halo_floor';
    w.npcs.skeeter!.affinity = 5;
    expect(parcels(w, w.npcs.skeeter!)).toBe(1);
    expect(keys(w, 'courier_run').length).toBe(1);
    run(w, 'courier_run:skeeter');
    expect(keys(w, 'courier_run').length).toBe(0);
    tick(w, 120);
    expect(keys(w, 'courier_run').length).toBe(1);
    w.heat.npd = 5;
    expect(keys(w, 'courier_run').length).toBe(0);
  });
});

describe('bodyguard gigs', () => {
  it('somebody has to actually need an escort, and the need goes when she does it', () => {
    const w = world('escort');
    empty(w, 'halo_floor');
    const patron = npc(w, 'pat', 'patron', 'halo_floor');
    expect(keys(w, 'bodyguard_gig').length).toBe(0);
    let wanted = false;
    for (let i = 0; i < 400 && !wanted; i++) {
      tick(w, 1, `e${i}`);
      wanted = patron.flags.includes('wants_escort');
    }
    expect(wanted).toBe(true);
    expect(keys(w, 'bodyguard_gig:pat').length).toBe(1);
    run(w, 'bodyguard_gig:pat');
    expect(patron.flags.includes('wants_escort')).toBe(false);
    expect(keys(w, 'bodyguard_gig:pat').length).toBe(0);
  });
});

describe('burglary and shakedowns take what is there', () => {
  it('a house only has so much in it, and she only robs it once', () => {
    const w = world('burgle');
    empty(w, 'halo_floor');
    const mark = npc(w, 'rich', 'patron', 'halo_floor', { cash: 300, level: 1 });
    const poor = npc(w, 'poor', 'patron', 'halo_floor', { cash: 20 });
    expect(keys(w, 'burgle_home:rich').length).toBe(1);
    expect(keys(w, 'burgle_home:poor').length).toBe(0);
    const before = w.hero.cash;
    const ev = run(w, 'burgle_home:rich', 'bu1');
    expect(mark.flags.includes('burgled')).toBe(true);
    expect(keys(w, 'burgle_home:rich').length).toBe(0);
    if (ev.some((e) => e.type === 'burgle_home' && e.outcome === 'good')) {
      expect(w.hero.cash).toBeGreaterThan(before);
      expect(mark.cash).toBeLessThan(300);
    }
    void poor;
  });

  it('shaking a shopkeeper down empties the till until the shop earns again', () => {
    const w = world('racket');
    empty(w, 'chem_mart', ['pharmacist']);
    const keeper = w.npcs.pharmacist!;
    keeper.locationId = 'chem_mart';
    keeper.cash = 50;
    keeper.level = 1;
    expect(keys(w, 'protection_racket').length).toBe(1);
    for (let i = 0; i < 20 && keeper.cash >= 30; i++) {
      keeper.hostile = false;
      keeper.affinity = 0;
      run(w, 'protection_racket:pharmacist', `pr${i}`);
      if (w.over) break;
    }
    expect(keeper.cash).toBeLessThan(30);
    keeper.hostile = false;
    keeper.alive = true;
    keeper.affinity = 0;
    expect(keys(w, 'protection_racket').length).toBe(0);
    tick(w, 300);
    expect(keeper.cash).toBeGreaterThanOrEqual(30);
  });
});

describe('cons: a mark falls for it once, and a room hears about it', () => {
  it('scams and fake goods flag the mark, make the room wary, and that fades', () => {
    const w = world('scam');
    w.hero.cash = 200;
    empty(w, 'halo_floor');
    const marks = Array.from({ length: 8 }, (_, i) => npc(w, `m${i}`, 'patron', 'halo_floor', { cash: 80 }));
    expect(keys(w, 'scam_mark').length).toBe(8);
    run(w, 'scam_mark:m0');
    expect(marks[0]!.flags.includes('wise')).toBe(true);
    expect(keys(w, 'scam_mark:m0').length).toBe(0);
    expect(wary(w, 'halo_floor', 'scam')).toBeGreaterThan(0.2);
    for (let i = 1; i < 6; i++) {
      // A scam that goes wrong can end in a scuffle somewhere else; put everybody back.
      w.hero.hp = w.hero.maxHp;
      w.hero.locationId = 'halo_floor';
      for (const m of marks) {
        m.hostile = false;
        m.alive = true;
        m.downUntil = 0;
      m.affinity = 0;
        m.locationId = 'halo_floor';
      }
      if (!keys(w, `scam_mark:m${i}`).length) break; // the room has stopped biting
      run(w, `scam_mark:m${i}`, `s${i}`);
    }
    w.hero.locationId = 'halo_floor';
    for (const m of marks) {
      m.hostile = false;
      m.alive = true;
      m.downUntil = 0;
      m.affinity = 0;
      m.locationId = 'halo_floor';
    }
    // The room has heard about it.
    expect(keys(w, 'scam_mark').length).toBe(0);
    tick(w, 400);
    expect(wary(w, 'halo_floor', 'scam')).toBe(0);
    expect(keys(w, 'scam_mark').length).toBeGreaterThan(0);
    // and fake goods
    for (const m of marks) {
      m.hostile = false;
      m.alive = true;
      m.downUntil = 0;
      m.affinity = 0;
      m.locationId = 'halo_floor';
    }
    w.hero.hp = w.hero.maxHp;
    w.hero.locationId = 'halo_floor';
    run(w, 'sell_fake_goods:m6');
    expect(marks[6]!.flags.includes('duped')).toBe(true);
    expect(keys(w, 'sell_fake_goods:m6').length).toBe(0);
  });

  it('a fortune pays half as much the second time and not at all the third', () => {
    const w = world('read');
    empty(w, 'halo_floor');
    const mark = npc(w, 'cr', 'patron', 'halo_floor');
    const tips: number[] = [];
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 40; k++) {
        const w2 = world(`read${i}${k}`);
        empty(w2, 'halo_floor');
        const m2 = npc(w2, 'cr', 'patron', 'halo_floor');
        w2.counters.read_cr = i;
        const ev = run(w2, 'cold_read:cr', `x${k}`);
        const good = ev.find((e) => e.type === 'cold_read' && e.outcome === 'good');
        if (good) tips[i] = (tips[i] ?? 0) + Number(good.data.amount);
        void m2;
      }
    }
    expect(tips[1]!).toBeLessThan(tips[0]! * 0.7);
    w.counters.read_cr = 2;
    expect(keys(w, 'cold_read:cr').length).toBe(0);
    void mark;
  });
});

describe('favours', () => {
  it('somebody has to actually ask, and it is used up when she does it', () => {
    const w = world('favour');
    empty(w, 'halo_floor');
    const n = npc(w, 'asker', 'patron', 'halo_floor', { flags: [] });
    expect(keys(w, 'odd_request').length).toBe(0);
    let asked = false;
    for (let i = 0; i < 600 && !asked; i++) {
      tick(w, 1, `f${i}`);
      asked = n.flags.includes('favor');
    }
    expect(asked).toBe(true);
    expect(keys(w, 'odd_request:asker').length).toBe(1);
    run(w, 'odd_request:asker');
    expect(n.flags.includes('favor')).toBe(false);
    expect(keys(w, 'odd_request:asker').length).toBe(0);
  });
});

describe('in the sim', () => {
  it('every hustle still turns up, with text, and not as a standing buffet', () => {
    const seen = new Set<string>();
    let hustles = 0;
    let beats = 0;
    const H = ['odd_jobs', 'courier_run', 'bodyguard_gig', 'burgle_home', 'protection_racket', 'scam_mark', 'sell_fake_goods', 'cold_read', 'odd_request'];
    for (let i = 0; i < 40; i++) {
      const { world: w, events } = runToEnd({ seed: `hs-${i}`, competence: i % 2 ? 0.8 : 0.2 });
      beats += w.beat;
      for (const e of events) {
        if (!H.includes(e.type)) continue;
        seen.add(e.type);
        hustles++;
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      }
    }
    for (const k of ['odd_jobs', 'cold_read', 'odd_request', 'sell_fake_goods', 'scam_mark']) expect(seen.has(k), k).toBe(true);
    expect(hustles / beats).toBeLessThan(0.2);
  });
});
