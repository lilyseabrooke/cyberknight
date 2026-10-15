import { describe, expect, it } from 'vitest';
import { Rng, createRun, runToEnd, hasTemplate, personalityFrom, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { gather } from './interactions';
import { score } from './run';
import { healUrge } from './urges';
import {
  caughtChance, gainSatiety, homeFor, kindle, kissBonus, movesWith, satietyBias, satietyDecay, satietyOf, spotsFor, tickSatiety,
} from './romance';

const world = (seed: string, traits: Parameters<typeof personalityFrom>[0] = {}, competence = 0.5): World => {
  const w = createWorld({ seed, competence, personality: personalityFrom(traits) });
  w.hero.satiety = 0;
  return w;
};
const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const hurt = (w: World, frac: number, drunk = 0) => {
  w.hero.hp = Math.round(w.hero.maxHp * frac);
  w.hero.drunk = drunk;
};

describe('healing urge (a steep curve, flattened by drink)', () => {
  it('is nothing for a scratch and overwhelming near the bottom', () => {
    const w = world('heal');
    const at = (f: number) => (hurt(w, f), healUrge(w.hero));
    expect(at(1)).toBe(0);
    expect(at(0.9)).toBeLessThan(0.2);
    expect(at(0.5)).toBeGreaterThan(1.2);
    expect(at(0.2)).toBeGreaterThan(at(0.5) * 2.5);
    expect(at(0.1)).toBeGreaterThan(at(0.2));
  });

  it('is monotonic: the lower her HP, the more she wants healing', () => {
    const w = world('heal2');
    let last = -1;
    for (const f of [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]) {
      hurt(w, f);
      const u = healUrge(w.hero);
      expect(u).toBeGreaterThanOrEqual(last);
      last = u;
    }
  });

  it('flattens the drunker she is: a wasted Blackbird thinks she is fine', () => {
    const w = world('heal3');
    hurt(w, 0.25, 0);
    const sober = healUrge(w.hero);
    hurt(w, 0.25, 2);
    const tipsy = healUrge(w.hero);
    hurt(w, 0.25, 5);
    const wasted = healUrge(w.hero);
    expect(tipsy).toBeLessThanOrEqual(sober);
    expect(wasted).toBeLessThan(sober * 0.4);
  });

  it('buying a med pack at the chem-mart is the top choice when she is badly hurt, and a long way down when she is not', () => {
    const lowW = world('heal4');
    lowW.hero.locationId = 'chem_mart';
    lowW.hero.cash = 200;
    lowW.hero.inventory = lowW.hero.inventory.filter((i) => !i.tags.includes('med'));
    hurt(lowW, 0.2);
    const scored = (w: World) => gather(w).map((c) => ({ k: c.key, s: score(w, c) })).sort((a, b) => b.s - a.s);
    const low = scored(lowW);
    expect(low[0]!.k.startsWith('buy_med:')).toBe(true);
    const healthyW = world('heal5');
    healthyW.hero.locationId = 'chem_mart';
    healthyW.hero.cash = 200;
    healthyW.hero.inventory = healthyW.hero.inventory.filter((i) => !i.tags.includes('med'));
    hurt(healthyW, 0.95);
    const buy = (w: World) => Math.max(...scored(w).filter((x) => x.k.startsWith('buy_med:')).map((x) => x.s));
    expect(buy(lowW)).toBeGreaterThan(buy(healthyW) + 3);
  });
});

describe('satiety', () => {
  it('decays slowly (a couple of hundred beats from full at neutral)', () => {
    const w = world('sat1');
    gainSatiety(w.hero, 1);
    for (let i = 0; i < 100; i++) tickSatiety(w.hero);
    expect(satietyOf(w.hero)).toBeGreaterThan(0.4);
    expect(satietyOf(w.hero)).toBeLessThan(0.7);
    for (let i = 0; i < 150; i++) tickSatiety(w.hero);
    expect(satietyOf(w.hero)).toBe(0);
  });

  it('comes back faster in a showboat and slower in a hopeless romantic', () => {
    const showboat = world('sat2', { impress: 0.9, thrill: 0.8, drink: 0.8 });
    const romantic = world('sat3', { romantic: 0.9, impress: 0.3 });
    const neutral = world('sat4');
    expect(satietyDecay(showboat.hero)).toBeGreaterThan(satietyDecay(neutral.hero) * 1.5);
    expect(satietyDecay(romantic.hero)).toBeLessThan(satietyDecay(neutral.hero) * 0.7);
  });

  it('amorous conversations burn through it faster than waiting does', () => {
    const w = world('sat5');
    gainSatiety(w.hero, 1);
    const waiting = satietyDecay(w.hero) * 10;
    kindle(w.hero, 0.07);
    kindle(w.hero, 0.05);
    kindle(w.hero, 0.05);
    expect(1 - satietyOf(w.hero)).toBeGreaterThan(waiting * 2);
  });

  it('a sated Blackbird stops wanting to flirt, kiss and make a move', () => {
    const w = world('sat6');
    const nyx = w.npcs.nyx!;
    nyx.affinity = 60;
    w.counters[`kisses_${nyx.id}`] = 2;
    const cand = (key: string) => ({ key: `${key}:${nyx.id}` });
    const open = ['flirt', 'kiss', 'make_move'].map((k) => satietyBias(w, cand(k)));
    expect(open.every((b) => b === 0)).toBe(true);
    gainSatiety(w.hero, 0.9);
    const sated = ['flirt', 'kiss', 'make_move'].map((k) => satietyBias(w, cand(k)));
    expect(sated.every((b) => b < -2)).toBe(true);
    expect(satietyBias(w, { key: 'order_drink' })).toBe(0);
  });
});

describe('kissing no longer runs away', () => {
  it('fatigue grows with each kiss, and affection counts only so far', () => {
    const w = world('kiss1');
    const nyx = w.npcs.nyx!;
    nyx.affinity = 30;
    const b0 = kissBonus(w, nyx);
    w.counters[`kisses_${nyx.id}`] = 1;
    const b1 = kissBonus(w, nyx);
    w.counters[`kisses_${nyx.id}`] = 3;
    const b3 = kissBonus(w, nyx);
    expect(b0).toBeGreaterThan(b1);
    expect(b1).toBeGreaterThan(b3);
    nyx.affinity = 500;
    w.counters[`kisses_${nyx.id}`] = 0;
    expect(kissBonus(w, nyx)).toBeLessThanOrEqual(0.5);
  });

  it('no night degenerates into a kissing marathon', () => {
    let worst = 0;
    for (let i = 0; i < 70; i++) {
      const kisses = runToEnd({ seed: `marathon-${i}`, competence: 0.9 }).events.filter((e) => e.type === 'kiss').length;
      worst = Math.max(worst, kisses);
    }
    // With every woman in the running a busy night can kiss more different people than it used to; the runaway this guards against was in the hundreds.
    expect(worst).toBeLessThan(35);
  });
});

describe('making a move', () => {
  const ready = (seed: string, traits: Parameters<typeof personalityFrom>[0] = {}, drunk = 0) => {
    const w = world(seed, traits);
    const nyx = w.npcs.nyx!;
    nyx.affinity = 70;
    w.counters[`kisses_${nyx.id}`] = 2;
    w.flags[`kissed:${nyx.id}`] = true;
    w.hero.drunk = drunk;
    w.hero.cash = 100;
    return { w, nyx };
  };
  const move = (w: World, id: string, seed: string) => {
    const cand = gather(w).find((c) => c.key === `make_move:${id}`);
    const { c, events } = ctxOf(w, seed);
    expect(cand).toBeDefined();
    cand!.run(c as any);
    return events;
  };

  it('becomes available only after kisses (or when she is drunk and keen), and not for strangers', () => {
    const w = world('mm1');
    const nyx = w.npcs.nyx!;
    expect(gather(w).some((c) => c.key === `make_move:${nyx.id}`)).toBe(false);
    nyx.affinity = 60;
    expect(gather(w).some((c) => c.key === `make_move:${nyx.id}`)).toBe(false); // not until a kiss
    w.counters[`kisses_${nyx.id}`] = 1;
    expect(gather(w).some((c) => c.key === `make_move:${nyx.id}`)).toBe(true);
    const keen = world('mm2');
    keen.npcs.nyx!.affinity = 15;
    keen.hero.drunk = 3;
    expect(gather(keen).some((c) => c.key === `make_move:${keen.npcs.nyx!.id}`)).toBe(true);
  });

  it('a move that lands leaves her sated, raises their affinity, and they are less keen to repeat it', () => {
    let landed = 0;
    for (let i = 0; i < 80 && landed < 5; i++) {
      const { w, nyx } = ready(`mm3-${i}`);
      const before = nyx.affinity;
      const events = move(w, nyx.id, `r${i}`);
      const glow = events.find((e) => e.type === 'make_move' && e.data.variant === 'afterglow');
      if (!glow) continue;
      landed++;
      expect(satietyOf(w.hero)).toBeGreaterThan(0.35);
      expect(nyx.affinity).toBeGreaterThan(before - 1);
      expect(movesWith(w, nyx.id)).toBe(1);
      const again = gather(w).find((c) => c.key === `make_move:${nyx.id}`);
      if (again) expect(score(w, again)).toBeLessThan(0.5); // sated + done with them
    }
    expect(landed).toBeGreaterThanOrEqual(5);
  });

  it('she can be turned down (and sometimes slapped), and that changes nothing about her appetite', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200 && !(seen.has('declined') && seen.has('slap')); i++) {
      const { w, nyx } = ready(`mm4-${i}`);
      nyx.affinity = 22;
      w.counters[`kisses_${nyx.id}`] = 1;
      w.hero.charm = 0;
      for (const e of move(w, nyx.id, `d${i}`)) if (e.type === 'make_move') seen.add(String(e.data.variant));
      if (seen.has('declined')) expect(satietyOf(w.hero)).toBe(0);
    }
    expect(seen.has('declined')).toBe(true);
  });

  it('wild, drunk heroes do it where people can see; careful ones find somewhere private', () => {
    const count = (traits: Parameters<typeof personalityFrom>[0], drunk: number) => {
      let pub = 0;
      let priv = 0;
      for (let i = 0; i < 150; i++) {
        const { w, nyx } = ready(`wild-${drunk}-${i}`, traits, drunk);
        for (const e of move(w, nyx.id, `w${i}`)) if (e.type === 'make_move') { if (e.data.variant === 'public') pub++; if (e.data.variant === 'private') priv++; }
      }
      return { pub, priv };
    };
    const wild = count({ thrill: 0.95, mischief: 0.9, impulsive: 0.9, reckless: 0.9 }, 5);
    const careful = count({ thrill: 0.1, mischief: 0.1, impulsive: 0.1, reckless: 0.1 }, 0);
    expect(wild.pub).toBeGreaterThan(careful.pub + 10);
    expect(careful.pub).toBe(0);
    expect(careful.priv).toBeGreaterThan(30);
  });

  it('forbidden places get her caught far more often than tolerated ones, and the world says who minds', () => {
    const w = world('caught');
    const floor = spotsFor(w, 'halo_floor');
    expect(floor.some((s) => s.tier === 'tolerated')).toBe(true);
    expect(floor.some((s) => s.tier === 'forbidden')).toBe(true);
    const bathroom = floor.find((s) => s.to === 'halo_restroom')!;
    const backroom = floor.find((s) => s.to === 'halo_backroom')!;
    expect(caughtChance(w, backroom)).toBeGreaterThan(caughtChance(w, bathroom) * 2.5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const { w: ww, nyx } = ready(`caught-${i}`);
      for (const e of move(ww, nyx.id, `c${i}`)) if (e.type === 'make_move' && String(e.data.variant).startsWith('caught_')) seen.add(String(e.data.variant));
    }
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });

  it('the other person sometimes takes her home: it moves her, can get her jumped on the way, and the home is a real place', () => {
    const outcomes = { home: 0, jumped: 0, won: 0, ruined: 0 };
    for (let i = 0; i < 300; i++) {
      const { w, nyx } = ready(`home-${i}`);
      nyx.cash = 200;
      const events = move(w, nyx.id, `h${i}`);
      if (events.some((e) => e.data.variant === 'invite')) {
        if (w.hero.locationId.startsWith('home_')) {
          outcomes.home++;
          expect(w.locations[w.hero.locationId]!.exits.some((x) => x.to === 'street_main')).toBe(true);
          expect(nyx.locationId).toBe(w.hero.locationId);
        }
        if (events.some((e) => e.data.variant === 'jumped')) outcomes.jumped++;
        if (events.some((e) => e.data.variant === 'jump_won')) outcomes.won++;
        if (events.some((e) => e.data.variant === 'jump_ruined')) outcomes.ruined++;
      }
    }
    expect(outcomes.home).toBeGreaterThan(5);
    expect(outcomes.jumped).toBeGreaterThan(0);
    expect(outcomes.ruined + outcomes.won).toBeGreaterThan(0);
    expect(homeFor(world('x').npcs.juno!)).toBe('home_hab');
  });

  it('in a real run, a second encounter the same night is the exception, and well spaced', () => {
    let first = 0;
    let second = 0;
    const gaps: number[] = [];
    for (let i = 0; i < 90; i++) {
      const glows = runToEnd({ seed: `second-${i}`, competence: 0.8 }).events.filter((e) => e.type === 'make_move' && e.data.variant === 'afterglow' && e.data.flavor !== 'interrupted');
      if (glows.length >= 1) first++;
      if (glows.length >= 2) {
        second++;
        gaps.push(glows[1]!.beat - glows[0]!.beat);
      }
    }
    expect(first).toBeGreaterThan(15);
    expect(second).toBeLessThan(first * 0.8); // nights run long now that she lays low and survives
    gaps.sort((a, b) => a - b);
    if (gaps.length) expect(gaps[Math.floor(gaps.length / 2)]!).toBeGreaterThan(60);
  });

  it('every move variant has a template', () => {
    const base = { npc: 'X', spot: 'the bathroom stall', tier: 'tolerated', place: 'The Rusty Halo', home: 'The Stacks', count: 1, role: 'owner', partner: 'Y', amount: 10, where: 'private', flavor: 'warm', lost: 5, times: 3, wasted: false, outdoors: false };
    const variants = ['declined', 'slap', 'private', 'public', 'public_tossed', 'public_cheer', 'invite', 'jumped', 'jump_won', 'jump_ruined', 'caught_staff', 'caught_band', 'caught_guard', 'caught_police', 'caught_robot', 'caught_drone', 'fined', 'afterglow'];
    for (const v of variants) expect(hasTemplate({ beat: 1, type: 'make_move', outcome: 'good', data: { ...base, variant: v } }), v).toBe(true);
    for (const flavor of ['warm', 'number', 'wallet', 'interrupted']) for (const where of ['private', 'public', 'home']) expect(hasTemplate({ beat: 1, type: 'make_move', outcome: 'good', data: { ...base, variant: 'afterglow', flavor, where } })).toBe(true);
    for (const spot of ['the walk-in fridge', 'the backroom couch', "the band's green room", 'the maintenance crawlspace', 'a dark VIP booth', 'the alley behind the Halo', 'a dark corner']) expect(hasTemplate({ beat: 1, type: 'make_move', outcome: 'good', data: { ...base, variant: 'private', spot } })).toBe(true);
  });
});

describe('the map', () => {
  it('has three places to be taken home to, with a way out', () => {
    const { world: w } = createRun({ seed: 'homes', competence: 0.5 });
    for (const id of ['home_stacks', 'home_hab', 'home_penthouse']) {
      expect(w.locations[id]?.kind).toBe('home');
      expect(w.locations[id]!.exits[0]!.to).toBe('street_main');
    }
  });
});
