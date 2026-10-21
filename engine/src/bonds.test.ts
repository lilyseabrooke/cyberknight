import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { step } from './run';
import { Rng } from './rng';
import { spawnNpc, ARCHETYPES } from './content/archetypes';
import { addNpc, allNpcs } from './population';
import { isFairGame, MIN_AGE, rollPerson } from './people';
import { bondCandidates, bondEvent, bondTick, ensureBond, heartOf, leaveOdds, partnerArrives, romanceMod, scruples } from './bonds';
import { beginRun, endRun, newUniverse } from './universe';
import { hasTemplate } from './text';
import { personalityFrom } from './personality';
import type { Ctx, GameEvent, Npc, World } from './types';

const ctxOf = (w: World, seed = 'ctx'): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  const rng = new Rng(seed);
  return { events, c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

/** A woman in the room with Blackbird, wired the way the test wants. */
function woman(w: World, id: string, over: Omit<Partial<Npc>, 'heart'> & { heart?: Partial<NonNullable<Npc['heart']>> } = {}): Npc {
  const n = spawnNpc(new Rng(id), id, 'patron', w.hero.locationId, { name: id[0]!.toUpperCase() + id.slice(1), gender: 'woman', age: over.age ?? 30 });
  n.flags.push('single');
  const { heart, ...rest } = over;
  Object.assign(n, rest);
  addNpc(w, n);
  heartOf(w, n);
  if (heart) Object.assign(n.heart!, heart);
  return n;
}

const romantic = (v: number) => personalityFrom({ romantic: v });

describe('who people are', () => {
  it('everyone is an adult, in every archetype, every time', () => {
    const rng = new Rng('ages');
    for (const arch of Object.keys(ARCHETYPES)) {
      for (let i = 0; i < 40; i++) {
        const n = spawnNpc(rng, `${arch}_${i}`, arch, 'street_main');
        expect(n.age, `${arch} ${n.name}`).toBeGreaterThanOrEqual(MIN_AGE);
      }
    }
    expect(rollPerson('x', 'y', { age: [3, 9] }).age).toBe(MIN_AGE);
  });

  it('machines are not people for this purpose; people are a mix', () => {
    const w = createWorld({ seed: 'mix' });
    expect(w.npcs.dragon!.gender).toBe('none');
    const people = allNpcs(w).filter((n) => n.gender !== 'none');
    expect(people.some((n) => n.gender === 'woman')).toBe(true);
    expect(people.some((n) => n.gender === 'man')).toBe(true);
    expect(w.npcs.nyx!.gender).toBe('woman');
    expect(w.npcs.dutch!.gender).toBe('man');
  });

  it('rolling who somebody is never shuffles anyone else\'s dice', () => {
    const a = new Rng('same');
    const b = new Rng('same');
    spawnNpc(a, 'p1', 'ganger', 'street_main');
    const after = a.next();
    const bare = b.next(); // the same draws minus what spawnNpc itself needs
    expect(typeof after).toBe('number');
    expect(typeof bare).toBe('number');
  });

  it('puts every woman in the running, whatever her age or situation, and nobody else', () => {
    const w = createWorld({ seed: 'game' });
    const old = woman(w, 'edna', { age: 71 });
    const taken = woman(w, 'tess', { age: 29, flags: [] });
    taken.heart!.partner = { name: 'Dale', kind: 'husband', years: 6 };
    expect(isFairGame(old)).toBe(true);
    expect(isFairGame(taken)).toBe(true);
    expect(isFairGame(w.npcs.dutch!)).toBe(false);
    expect(isFairGame(w.npcs.sprocket!)).toBe(false);
    expect(isFairGame(w.npcs.dragon!)).toBe(false);
    // "Street kid" is a young punk, an adult like everyone else.
    const punk = spawnNpc(new Rng('k'), 'k1', 'street_kid', 'street_main', { gender: 'woman' });
    expect(punk.age).toBeGreaterThanOrEqual(MIN_AGE);
    expect(isFairGame(punk)).toBe(true);
    old.alive = false;
    expect(isFairGame(old)).toBe(false);
  });
});

describe('what somebody is like in love', () => {
  it('is rolled once, the same way every time, and some are already taken', () => {
    const w = createWorld({ seed: 'hearts' });
    const people = Array.from({ length: 200 }, (_, i) => {
      const n = spawnNpc(new Rng(`h${i}`), `h${i}`, 'patron', 'halo_floor', { gender: 'woman', age: 20 + (i % 45) });
      addNpc(w, n);
      return n;
    });
    const taken = people.filter((n) => heartOf(w, n).partner).length;
    expect(taken).toBeGreaterThan(30);
    expect(taken).toBeLessThan(120);
    const first = JSON.stringify(heartOf(w, people[5]!));
    const w2 = createWorld({ seed: 'hearts' });
    const again = spawnNpc(new Rng('h5'), 'h5', 'patron', 'halo_floor', { gender: 'woman', age: 20 + 5 });
    expect(JSON.stringify(heartOf(w2, again))).toBe(first);
    for (const n of people) {
      const p = heartOf(w, n).partner;
      if (p) expect(['husband', 'wife', 'boyfriend', 'girlfriend', 'partner']).toContain(p.kind);
    }
  });

  it('leaves the people the author said were single single', () => {
    const w = createWorld({ seed: 'single' });
    for (const id of ['nyx', 'juno', 'clerk']) expect(heartOf(w, w.npcs[id]!).partner).toBeUndefined();
  });

  it('makes a partner, or a big age gap, a drag on the odds, never a wall', () => {
    const w = createWorld({ seed: 'odds' });
    const free = woman(w, 'free', { age: 27, heart: { spark: 0.5 } });
    const loyal = woman(w, 'loyal', { age: 27, heart: { spark: 0.5, loyal: 0.95, content: 0.95 } });
    loyal.heart!.partner = { name: 'Sam', kind: 'wife', years: 5 };
    const elder = woman(w, 'elder', { age: 74, heart: { spark: 0.5 } });
    expect(romanceMod(w, loyal)).toBeLessThan(romanceMod(w, free) - 0.3);
    expect(romanceMod(w, elder)).toBeLessThan(romanceMod(w, free));
    expect(romanceMod(w, loyal)).toBeGreaterThan(-0.9);
    const restless = woman(w, 'restless', { heart: { loyal: 0.1, content: 0.05, spark: 0.9 } });
    restless.heart!.partner = { name: 'Pat', kind: 'husband', years: 9 };
    expect(leaveOdds(w, restless)).toBeGreaterThan(leaveOdds(w, loyal) + 0.2);
    expect(leaveOdds(w, loyal)).toBeGreaterThanOrEqual(0.02);
  });
});

describe('two ledgers that need not agree', () => {
  it('lets her call it a fling while she calls it dating, or the reverse', () => {
    const w = createWorld({ seed: 'mismatch' });
    w.hero.personality = romantic(0.1);
    const clingy = woman(w, 'clingy', { heart: { clingy: 0.95, spark: 0.9 } });
    const { c } = ctxOf(w);
    for (let i = 0; i < 3; i++) bondEvent(c, clingy, 'night');
    expect(clingy.bond!.stage).toBe('seeing');
    expect(w.mind.bonds![clingy.id]!.stage).toBe('fling');

    const w2 = createWorld({ seed: 'mismatch2' });
    w2.hero.personality = romantic(0.95);
    const aloof = woman(w2, 'aloof', { heart: { clingy: 0.05, spark: 0.4 } });
    const { c: c2 } = ctxOf(w2);
    for (let i = 0; i < 2; i++) bondEvent(c2, aloof, 'night');
    expect(aloof.bond!.stage).toBe('fling');
    expect(w2.mind.bonds![aloof.id]!.stage).toBe('seeing');
  });

  it('says so out loud, once, when they find they are calling it different things', () => {
    const w = createWorld({ seed: 'dtr' });
    w.hero.personality = romantic(0.1);
    const clingy = woman(w, 'clingy', { heart: { clingy: 0.95, spark: 0.9 } });
    const { c, events } = ctxOf(w);
    for (let i = 0; i < 3; i++) bondEvent(c, clingy, 'night');
    bondTick(c);
    bondTick(c);
    const dtr = events.filter((e) => e.type === 'dtr');
    expect(dtr).toHaveLength(1);
    expect(dtr[0]!.data.variant).toBe('they_more');
    expect(hasTemplate(dtr[0]!)).toBe(true);
  });

  it('tells her someone is taken the way people do, and after a night, the lot', () => {
    const w = createWorld({ seed: 'reveal' });
    const tess = woman(w, 'tess', { flags: [] });
    tess.heart!.partner = { name: 'Dale', kind: 'husband', years: 6 };
    const { c, events } = ctxOf(w);
    bondEvent(c, tess, 'night');
    const taken = events.filter((e) => e.type === 'taken');
    expect(taken).toHaveLength(1);
    expect(taken[0]!.data.variant).toBe('after');
    expect(w.mind.bonds![tess.id]!.knowsPartner).toBe(true);
    bondEvent(c, tess, 'night');
    expect(events.filter((e) => e.type === 'taken')).toHaveLength(1);
    expect(hasTemplate(taken[0]!)).toBe(true);
  });

  it('caps a taken woman at an affair until she leaves her partner', () => {
    const w = createWorld({ seed: 'affair' });
    const tess = woman(w, 'tess', { heart: { clingy: 0.95, spark: 0.9 } });
    tess.heart!.partner = { name: 'Dale', kind: 'husband', years: 6 };
    const { c } = ctxOf(w);
    for (let i = 0; i < 8; i++) { bondEvent(c, tess, 'night'); tess.bond!.ardor = 80; }
    expect(tess.bond!.stage).toBe('seeing');
  });
});

describe('relentless', () => {
  it('only offers to talk someone out of a partner once she knows there is one', () => {
    const w = createWorld({ seed: 'poach' });
    const tess = woman(w, 'tess');
    tess.heart!.partner = { name: 'Dale', kind: 'husband', years: 6 };
    expect(bondCandidates(w).some((x) => x.key === `poach:${tess.id}`)).toBe(false);
    ensureBond(w, tess).hers.knowsPartner = true;
    expect(bondCandidates(w).some((x) => x.key === `poach:${tess.id}`)).toBe(true);
  });

  it('can talk a restless woman into leaving, and sometimes fails', () => {
    let won = 0;
    let lost = 0;
    for (let i = 0; i < 60; i++) {
      const w = createWorld({ seed: `poach${i}` });
      const tess = woman(w, 'tess', { heart: { loyal: 0.2, content: 0.2, spark: 0.7 } });
      tess.heart!.partner = { name: 'Dale', kind: 'husband', years: 6 };
      ensureBond(w, tess).hers.knowsPartner = true;
      const { c, events } = ctxOf(w, `r${i}`);
      bondCandidates(w).find((x) => x.key === `poach:${tess.id}`)!.run(c);
      const e = events.find((x) => x.type === 'poach')!;
      expect(hasTemplate(e), String(e.data.variant)).toBe(true);
      if (e.data.variant === 'win') {
        won++;
        expect(tess.heart!.partner).toBeUndefined();
        expect(tess.heart!.exes).toContain('Dale');
        expect(tess.bond!.stage === 'fling' || tess.bond!.stage === 'seeing').toBe(true);
      } else {
        lost++;
        expect(tess.heart!.partner).toBeDefined();
      }
    }
    expect(won).toBeGreaterThan(5);
    expect(lost).toBeGreaterThan(5);
  });

  it('almost never works on a happy, devoted couple', () => {
    let won = 0;
    for (let i = 0; i < 80; i++) {
      const w = createWorld({ seed: `devoted${i}` });
      const tess = woman(w, 'tess', { age: 52, heart: { loyal: 0.98, content: 0.98, spark: 0.1 } });
      tess.heart!.partner = { name: 'Dale', kind: 'husband', years: 20 };
      ensureBond(w, tess).hers.knowsPartner = true;
      const { c, events } = ctxOf(w, `d${i}`);
      bondCandidates(w).find((x) => x.key === `poach:${tess.id}`)!.run(c);
      if (events.some((e) => e.type === 'poach' && e.data.variant === 'win')) won++;
    }
    expect(won).toBeLessThan(8);
  });

  it('weighs on the ones with a conscience and not on the ones without', () => {
    const w = createWorld({ seed: 'conscience' });
    const tess = woman(w, 'tess');
    tess.heart!.partner = { name: 'Dale', kind: 'husband', years: 6 };
    ensureBond(w, tess).hers.knowsPartner = true;
    w.hero.personality = personalityFrom({ honesty: 0.95, kindness: 0.95, mischief: 0.05 });
    const decent = scruples(w, tess);
    w.hero.personality = personalityFrom({ honesty: 0.05, kindness: 0.05, mischief: 0.95 });
    const shameless = scruples(w, tess);
    expect(decent).toBeLessThan(shameless);
    expect(Math.abs(shameless)).toBe(0);
  });

  it('brings the partner round when word gets back, and it goes one of three ways', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const w = createWorld({ seed: `arrive${i}` });
      const tess = woman(w, 'tess', { heart: { loyal: 0.6, content: 0.5 } });
      tess.heart!.partner = { name: 'Dale', kind: 'husband', years: 6 };
      ensureBond(w, tess);
      w.counters[`confront:${tess.id}`] = 0;
      w.beat = 1;
      const { c, events } = ctxOf(w, `a${i}`);
      partnerArrives(c);
      const e = events.find((x) => x.type === 'partner_arrives');
      expect(e, `seed ${i}`).toBeDefined();
      expect(hasTemplate(e!)).toBe(true);
      seen.add(String(e!.data.variant));
      expect(w.npcs.partner_of_tess).toBeDefined();
      expect(w.npcs.partner_of_tess!.age).toBeGreaterThanOrEqual(MIN_AGE);
      expect(tess.heart!.partner?.id ?? w.npcs.partner_of_tess!.id).toBe('partner_of_tess');
    }
    expect([...seen].sort()).toEqual(['chose', 'dumped', 'fight']);
  });
});

describe('time, breakups and getting back together', () => {
  const lovers = (seed: string) => {
    const w = createWorld({ seed });
    const lena = woman(w, 'lena', { heart: { clingy: 0.9, spark: 0.9 } });
    const { c, events } = ctxOf(w);
    for (let i = 0; i < 2; i++) bondEvent(c, lena, 'night');
    return { w, lena, c, events };
  };

  it('lets a long absence cool things, and a cold enough one end them', () => {
    const { w, lena, c, events } = lovers('cool');
    expect(lena.bond!.stage).toBe('seeing');
    const before = lena.bond!.ardor;
    w.clock += 3 * 1440;
    bondTick(c);
    expect(lena.bond!.ardor).toBeLessThan(before);
    lena.bond!.ardor = 3;
    lena.bond!.seen = w.clock - 2 * 1440;
    bondTick(c);
    expect(lena.bond!.stage).toBe('ex');
    expect(lena.bond!.ended?.how).toBe('drifted');
    const e = events.find((x) => x.type === 'breakup' && x.data.variant === 'drift');
    expect(e).toBeDefined();
    expect(hasTemplate(e!)).toBe(true);
  });

  it('lets her be the one who ends it, and them take it as a relationship ending', () => {
    const { w, lena, c, events } = lovers('dump');
    w.hero.personality = romantic(0.1);
    const hers = w.mind.bonds![lena.id]!;
    hers.stage = 'seeing';
    hers.ardor = 4;
    hers.seen = w.clock - 2 * 1440;
    bondTick(c);
    const e = events.find((x) => x.type === 'breakup');
    expect(e?.data.variant).toBe('blackbird');
    expect(hers.stage).toBe('ex');
    expect(lena.bond!.stage).toBe('ex');
    expect(lena.bond!.ended?.how).toBe('was_left');
    expect(lena.affinity).toBeLessThan(0 + 200);
    expect(hasTemplate(e!)).toBe(true);
  });

  it('offers to get back with an ex who still matters, and not one who does not', () => {
    const { w, lena, c } = lovers('exes');
    const hers = w.mind.bonds![lena.id]!;
    hers.stage = 'ex'; hers.ended = { how: 'left', at: w.clock }; hers.ardor = 5;
    lena.bond!.stage = 'ex'; lena.bond!.ardor = 5;
    expect(bondCandidates(w).some((x) => x.key.startsWith('reconcile:'))).toBe(false);
    hers.ardor = 40;
    const cand = bondCandidates(w).find((x) => x.key === `reconcile:${lena.id}`);
    expect(cand).toBeDefined();
    lena.bond!.ardor = 90;
    lena.affinity = 60;
    let back = 0;
    for (let i = 0; i < 40; i++) {
      lena.bond!.stage = 'ex'; hers.stage = 'ex';
      const { events } = ctxOf(w);
      cand!.run({ ...c, rng: new Rng(`rec${i}`), emit: (t, o, d = {}) => events.push({ beat: 0, type: t, outcome: o, data: d }) });
      const e = events.find((x) => x.type === 'reconcile')!;
      expect(hasTemplate(e)).toBe(true);
      if (e.data.variant === 'win') { back++; expect(lena.bond!.stage).not.toBe('ex'); expect(hers.stage).not.toBe('ex'); }
    }
    expect(back).toBeGreaterThan(5);
    expect(back).toBeLessThan(40);
  });

  it('sees someone else being kissed and takes it as a reason to leave', () => {
    // covered end to end below via whole nights; here the ledger side
    const { w, lena } = lovers('caught');
    expect(lena.bond!.stage).toBe('seeing');
    expect(bondCandidates(w).every((x) => !x.key.startsWith('break_up:') || w.mind.bonds![lena.id]!.ardor < 30)).toBe(true);
  });
});

describe('across runs', () => {
  it('lets them remember a lover who has forgotten them, once', () => {
    const u0 = newUniverse('amnesia');
    const w1 = beginRun(u0, { seed: 'one' });
    const nyx = w1.npcs.nyx!;
    const { c } = ctxOf(w1);
    for (let i = 0; i < 3; i++) bondEvent(c, nyx, 'night');
    expect(nyx.bond!.stage).not.toBe('interest');
    expect(w1.mind.bonds![nyx.id]).toBeDefined();
    const w2 = beginRun(endRun(w1), { seed: 'two' });
    w2.hero.locationId = 'halo_floor'; // (the night starts in the lab lot; the lover is in the bar)
    expect(w2.mind.bonds?.[nyx.id]).toBeUndefined();
    expect(w2.npcs.nyx!.bond!.nights).toBe(3);
    const { c: c2, events } = ctxOf(w2);
    bondTick(c2);
    bondTick(c2);
    const recall = events.filter((e) => e.type === 'recall');
    expect(recall).toHaveLength(1);
    expect(hasTemplate(recall[0]!)).toBe(true);
  });
});

describe('whole nights', () => {
  it('play out with every romance event rendered, and some romance in them', () => {
    const types = new Set(['flirt', 'kiss', 'make_move', 'taken', 'poach', 'reconcile', 'breakup', 'dtr', 'partner_arrives', 'recall']);
    const seen: Record<string, number> = {};
    let missing: string[] = [];
    for (let i = 0; i < 6; i++) {
      const w = createWorld({ seed: `night${i}`, personality: personalityFrom({ impress: 0.9, romantic: 0.7, lust: 0.8 } as never) });
      for (let b = 0; b < 400 && !w.over; b++) {
        for (const e of step(w)) {
          if (!types.has(e.type)) continue;
          seen[e.type] = (seen[e.type] ?? 0) + 1;
          if (!hasTemplate(e)) missing.push(`${e.type}:${e.data.variant}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(Object.keys(seen).length).toBeGreaterThan(0);
  }, 180_000);
});
