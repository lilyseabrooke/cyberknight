import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, runToEnd, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { assessFoe, cashOptions, isHunted, pursuitBias, pursuitTargets, pursuitTick, winOdds } from './pursuit';
import { isLethal } from './combat';
import { spawnNpc } from './content/archetypes';
import type { Goal, Npc } from './types';

const world = (seed: string, competence = 0.9, traits: Parameters<typeof personalityFrom>[0] = {}): World =>
  createWorld({ seed, competence, personality: personalityFrom(traits) });
const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const goal = (w: World, over: Partial<Goal>): Goal => {
  const g = { id: w.mind.nextId++, kind: 'kill', parent: null, why: 'test', desire: 0.8, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0, ...over } as Goal;
  w.mind.goals.push(g);
  return g;
};
const foe = (w: World, id: string, archetype: string, loc: string, extra: Partial<Npc> = {}): Npc => {
  const n = spawnNpc(new Rng(id), id, archetype, loc, {});
  Object.assign(n, extra);
  w.npcs[id] = n;
  return n;
};
const clearRoom = (w: World, loc: string, keep: string[] = []) => {
  for (const n of Object.values(w.npcs)) if (n.locationId === loc && !keep.includes(n.id)) n.locationId = '_gone';
};

describe('sizing people up', () => {
  it('a weaker target is better odds than a stronger one, and friends who would pile in make it worse', () => {
    const w = world('odds');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const g = goal(w, { kind: 'kill' });
    const weak = foe(w, 'weak', 'mugger', 'street_main');
    const tough = foe(w, 'tough', 'npd_sergeant', 'halo_alley');
    clearRoom(w, 'halo_alley', ['tough']);
    expect(winOdds(w, g, weak)).toBeGreaterThan(winOdds(w, g, tough));
    const alone = winOdds(w, g, weak);
    for (let i = 0; i < 3; i++) foe(w, `mate${i}`, 'ganger', 'street_main', { faction: weak.faction });
    expect(winOdds(w, g, weak)).toBeLessThan(alone);
  });

  it('remembers who has beaten her', () => {
    const w = world('lost');
    clearRoom(w, 'street_main');
    const g = goal(w, { kind: 'kill' });
    const n = foe(w, 'bully', 'ganger', 'street_main');
    const before = winOdds(w, g, n);
    w.counters.lost_to_bully = 2;
    expect(winOdds(w, g, n)).toBeLessThan(before * 0.5);
  });

  it('is not a fight she should take when she is hurt, too weak, or watched', () => {
    const w = world('verdicts');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const g = goal(w, { kind: 'kill' });
    const n = foe(w, 'v', 'mugger', 'street_main');
    expect(assessFoe(w, g, n).verdict).toBe('take');
    w.hero.hp = Math.round(w.hero.maxHp * 0.3);
    expect(assessFoe(w, g, n).verdict).toBe('wait');
    w.hero.hp = w.hero.maxHp;
    const boss = foe(w, 'boss', 'npd_sergeant', 'street_main', { power: 60, hp: 400 });
    expect(assessFoe(w, g, boss).verdict).toBe('prep');
  });
});

describe('cash: more than one way in', () => {
  it('weighs a known bounty against odd jobs, and only knows the paper she has seen', () => {
    const w = world('opts');
    clearRoom(w, 'halo_floor', ['dutch', 'nyx']);
    w.hero.locationId = 'halo_floor';
    const g = goal(w, { kind: 'cash', amount: w.hero.cash + 300 });
    const target = foe(w, 'paper', 'ganger', 'halo_floor', { bounty: { amount: 200, hidden: false }, power: 6, hp: 30 });
    w.mind.lastSeen.dutch = 'halo_floor';
    w.mind.lastSeen.nyx = 'halo_floor';
    w.mind.lastSeen.paper = 'halo_floor';
    // She has not read the paper yet.
    let opts = cashOptions(w, g, {});
    expect(opts.some((o) => o.plan === 'bounty')).toBe(false);
    expect(opts.some((o) => o.plan === 'odd_jobs')).toBe(true);
    w.mind.bounties = { paper: 'scan' };
    opts = cashOptions(w, g, {});
    expect(opts[0]!.plan).toBe('bounty');
    expect(opts.some((o) => o.plan === 'odd_jobs')).toBe(true);
    // Written off: only jobs left.
    opts = cashOptions(w, g, { paper: w.beat + 50 });
    expect(opts.some((o) => o.plan === 'bounty')).toBe(false);
    // A target far too tough for her isn't worth the paper.
    target.power = 90;
    target.hp = 900;
    expect(cashOptions(w, g, {}).some((o) => o.plan === 'bounty')).toBe(false);
  });

  it('personality tilts the choice', () => {
    const brave = world('t1', 0.9, { courage: 0.95, justice: 0.9, thrill: 0.9 });
    const meek = world('t2', 0.9, { courage: 0.05, justice: 0.1, thrill: 0.05, honesty: 0.95, kindness: 0.9 });
    const ratio = (w: World) => {
      clearRoom(w, 'halo_floor', ['dutch', 'nyx']);
      w.hero.locationId = 'halo_floor';
      const g = goal(w, { kind: 'cash', amount: w.hero.cash + 300 });
      foe(w, 'paper', 'ganger', 'halo_floor', { bounty: { amount: 120, hidden: false }, power: 6, hp: 30 });
      w.mind.lastSeen = { dutch: 'halo_floor', nyx: 'halo_floor', paper: 'halo_floor' };
      w.mind.bounties = { paper: 'scan' };
      const o = cashOptions(w, g, {});
      return o.find((x) => x.plan === 'bounty')!.eff / o.find((x) => x.plan === 'odd_jobs')!.eff;
    };
    expect(ratio(brave)).toBeGreaterThan(ratio(meek));
  });
});

describe('looking for the opportunity', () => {
  it('knows where she is in the search, and says so when the trail goes cold', () => {
    const w = world('trail');
    const g = goal(w, { kind: 'kill', npc: 'skeeter' });
    clearRoom(w, 'street_main');
    w.hero.locationId = 'street_main';
    delete w.mind.lastSeen.skeeter;
    let { c, events } = ctxOf(w, 'p1');
    pursuitTick(c, g);
    expect(g.pursuit!.phase).toBe('search');
    // She heard he's in the bar and sets off.
    w.mind.lastSeen.skeeter = 'halo_floor';
    pursuitTick(c, g);
    expect(g.pursuit!.phase).toBe('approach');
    expect(pursuitTargets(w, g)).toEqual([{ loc: 'halo_floor', value: 2.8 }]);
    // He is not where she last saw him.
    w.hero.locationId = 'halo_floor';
    w.npcs.skeeter!.locationId = 'halo_alley';
    pursuitTick(c, g);
    expect(events.some((e) => e.type === 'pursuit' && e.data.variant === 'lost_trail')).toBe(true);
    expect(w.mind.lastSeen.skeeter).toBeUndefined();
    expect(g.pursuit!.phase).toBe('search');
    // With no idea where he is, she tries somewhere new.
    const t = pursuitTargets(w, g)!;
    expect(t.length).toBe(1);
    expect(t[0]!.loc).not.toBe('halo_floor');
  });

  it('sizes him up when he is in the room and the verdict steers her actions', () => {
    const w = world('size');
    clearRoom(w, 'street_main');
    w.hero.locationId = 'street_main';
    const n = foe(w, 'mark', 'mugger', 'street_main');
    const g = goal(w, { kind: 'kill', npc: 'mark' });
    w.mind.lastSeen.mark = 'street_main';
    const { c, events } = ctxOf(w, 'p2');
    pursuitTick(c, g);
    expect(g.pursuit!.phase).toBe('assess');
    expect(events.some((e) => e.type === 'pursuit' && String(e.data.variant).startsWith('sizeup'))).toBe(true);
    expect(isHunted(w, 'mark')).toBe(true);
    expect(pursuitBias(w, g, 'challenge', 'mark')).toBeGreaterThan(3);
    expect(pursuitBias(w, g, 'challenge', 'someone_else')).toBe(0);
    g.pursuit!.verdict = 'prep';
    expect(pursuitBias(w, g, 'challenge', 'mark')).toBe(0);
    g.pursuit!.verdict = 'lure';
    expect(pursuitBias(w, g, 'lure', 'mark')).toBeGreaterThan(pursuitBias(w, g, 'challenge', 'mark'));
    void n;
  });

  it('a cash goal commits to an option, goes there, and writes off a target she cannot take', () => {
    const w = world('commit');
    clearRoom(w, 'halo_floor', ['dutch']);
    w.hero.locationId = 'street_main';
    const g = goal(w, { kind: 'cash', amount: w.hero.cash + 400 });
    w.mind.lastSeen.dutch = 'halo_floor';
    const { c, events } = ctxOf(w, 'p3');
    pursuitTick(c, g);
    expect(g.pursuit!.plan).toBe('odd_jobs');
    expect(g.pursuit!.npc).toBe('dutch');
    expect(pursuitTargets(w, g)![0]!.loc).toBe('halo_floor');
    expect(events.some((e) => e.data.variant === 'jobs_pick')).toBe(true);
    w.hero.locationId = 'halo_floor';
    pursuitTick(c, g);
    expect(g.pursuit!.phase).toBe('act');
    expect(pursuitBias(w, g, 'odd_jobs', 'dutch')).toBeGreaterThan(3);
  });
});

describe('drones', () => {
  it('a fight against drones is never lethal, even on the street', () => {
    const w = world('drone');
    w.hero.locationId = 'street_main';
    const d = foe(w, 'd', 'npd_drone', 'street_main');
    expect(isLethal([d], w)).toBe(false);
    const officer = foe(w, 'o', 'npd_officer', 'street_main');
    expect(isLethal([d, officer], w)).toBe(true);
  });
});

describe('in the sim', () => {
  it('she chases bounties and takes odd jobs, sizes people up, and gets paid', () => {
    const seen = new Set<string>();
    let paid = 0;
    let jobs = 0;
    for (let i = 0; i < 40; i++) {
      for (const e of runToEnd({ seed: `ps-${i}`, competence: 0.9 }).events) {
        if (e.type === 'pursuit') {
          seen.add(String(e.data.variant));
          expect(hasTemplate(e), String(e.data.variant)).toBe(true);
        }
        if (e.type === 'bounty_paid') paid++;
        if (e.type === 'odd_jobs' && e.outcome === 'good') jobs++;
      }
    }
    for (const k of ['bounty_pick', 'jobs_pick', 'sizeup_take']) expect(seen.has(k), k).toBe(true);
    expect(paid).toBeGreaterThan(5);
    expect(jobs).toBeGreaterThan(20);
  });
});
