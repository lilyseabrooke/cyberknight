import { describe, expect, it } from 'vitest';
import { slow } from './testkit';
import { Rng, personalityFrom, runToEnd, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { assessFoe, cashOptions, dragonReadiness, isHunted, pursuitBias, pursuitTargets, pursuitTick, winOdds } from './pursuit';
import { createRun, step } from './run';
import { dragonCandidates } from './dragons';
import { learnFame, expectedFame } from './plans';
import { isLethal } from './combat';
import { spawnNpc } from './content/archetypes';
import type { Goal, Npc } from './types';
import { addNpc, moveNpc } from './population';

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
  addNpc(w, n);
  return n;
};
const clearRoom = (w: World, loc: string, keep: string[] = []) => {
  for (const n of Object.values(w.npcs)) if (n.locationId === loc && !keep.includes(n.id)) moveNpc(w, n, '_gone');
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
    w.hero.locationId = 'halo_alley';
    clearRoom(w, 'halo_alley');
    const g = goal(w, { kind: 'kill' });
    const n = foe(w, 'v', 'mugger', 'halo_alley');
    expect(assessFoe(w, g, n).verdict).toBe('take');
    w.hero.hp = Math.round(w.hero.maxHp * 0.3);
    expect(assessFoe(w, g, n).verdict).toBe('wait');
    w.hero.hp = w.hero.maxHp;
    const boss = foe(w, 'boss', 'npd_sergeant', 'halo_alley', { power: 60, hp: 400 });
    expect(assessFoe(w, g, boss).verdict).toBe('prep');
  });
});

describe('being watched', () => {
  it('under cameras she wants him somewhere quieter, and having decided to do it here, her reluctance no longer blocks her', () => {
    const w = world('watched');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    const g = goal(w, { kind: 'kill', npc: 'v2' });
    const n = foe(w, 'v2', 'mugger', 'street_main');
    expect(assessFoe(w, g, n).verdict).toBe('lure');
    g.pursuit = { plan: 'hunt', npc: 'v2', phase: 'assess', since: 0, passed: {}, searched: [], verdict: 'take' };
    expect(pursuitBias(w, g, 'challenge', 'v2')).toBeGreaterThan(8);
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
    moveNpc(w, w.npcs.skeeter!, 'halo_alley');
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
    clearRoom(w, 'halo_alley');
    w.hero.locationId = 'halo_alley';
    const n = foe(w, 'mark', 'mugger', 'halo_alley');
    const g = goal(w, { kind: 'kill', npc: 'mark' });
    w.mind.lastSeen.mark = 'halo_alley';
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
  slow('she chases bounties and takes odd jobs, sizes people up, and gets paid', () => {
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

describe('what she is about when she has nothing else on her mind', () => {
  it('starts the night with a goal: fame, money, or dragons', () => {
    const kinds: Record<string, number> = {};
    for (let i = 0; i < 80; i++) {
      const { world: w, events } = createRun({ seed: `idle-${i}`, competence: 0.6 });
      for (let k = 0; k < 4; k++) events.push(...step(w));
      const first = events.find((e) => e.type === 'goal_new' && !e.data.nested);
      expect(first, `seed ${i}`).toBeTruthy();
      kinds[String(first!.data.kind)] = (kinds[String(first!.data.kind)] ?? 0) + 1;
    }
    expect(kinds.fame).toBeGreaterThan(5);
    expect(kinds.cash).toBeGreaterThan(5);
    expect(kinds.dragon).toBeGreaterThan(5);
  });

  it('personality tilts it', () => {
    const count = (traits: Parameters<typeof personalityFrom>[0], kind: string) => {
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const { world: w, events } = createRun({ seed: `tilt-${kind}-${i}`, competence: 0.6, personality: personalityFrom(traits) });
        for (let k = 0; k < 3; k++) events.push(...step(w));
        if (events.find((e) => e.type === 'goal_new' && e.data.kind === kind && !e.data.nested)) n++;
      }
      return n;
    };
    expect(count({ fame: 0.95, vanity: 0.9, courage: 0.1, greed: 0.1 }, 'fame')).toBeGreaterThan(count({ fame: 0.05, vanity: 0.1, courage: 0.9, greed: 0.9 }, 'fame'));
    expect(count({ courage: 0.95, justice: 0.9, thrill: 0.9, greed: 0.1, fame: 0.2 }, 'dragon')).toBeGreaterThan(count({ courage: 0.05, justice: 0.1, thrill: 0.1, greed: 0.9, fame: 0.9 }, 'dragon'));
  });

  slow('is rarely without something to do', () => {
    let beats = 0;
    let empty = 0;
    for (let i = 0; i < 20; i++) {
      const { world: w } = createRun({ seed: `again-${i}`, competence: 0.8 });
      for (let k = 0; k < 250 && !w.over; k++) {
        step(w);
        beats++;
        if (!w.mind.goals.some((g) => g.parent === null)) empty++;
      }
    }
    expect(empty / beats).toBeLessThan(0.08);
  });
});

describe('fame: pick an act, then find the stage', () => {
  it('commits to an act at a venue, goes there, and writes it off if she is stuck there', () => {
    const w = world('stage');
    w.hero.locationId = 'halo_alley';
    for (const l of ['halo_floor', 'street_main', 'neon_pharaoh']) w.locations[l]!.visits = 1;
    const g = goal(w, { kind: 'fame', amount: Math.floor(w.hero.fame) + 6 });
    const { c, events } = ctxOf(w, 'f1');
    pursuitTick(c, g);
    expect(g.pursuit!.plan).toBe('perform');
    const act = g.pursuit!.act!;
    expect(events.some((e) => e.data.variant === 'perform_pick')).toBe(true);
    const venue = pursuitTargets(w, g)![0]!.loc;
    expect(pursuitBias(w, g, act, undefined)).toBeGreaterThan(3);
    w.hero.locationId = venue;
    for (let i = 0; i < 8; i++) {
      w.beat++;
      pursuitTick(c, g);
    }
    expect(events.some((e) => e.data.variant === 'perform_blocked')).toBe(true);
  });

  it('learns what an act is worth', () => {
    const w = world('learn');
    const before = expectedFame(w, 'karaoke');
    for (let i = 0; i < 12; i++) learnFame(w, 'karaoke', 0);
    expect(expectedFame(w, 'karaoke')).toBeLessThan(before * 0.4);
    for (let i = 0; i < 12; i++) learnFame(w, 'karaoke', 4);
    expect(expectedFame(w, 'karaoke')).toBeGreaterThan(before);
  });

  slow('actually gets famous over a night', () => {
    let finished = 0;
    for (let i = 0; i < 30; i++) {
      const { world: w, events } = createRun({ seed: `fame-${i}`, competence: 0.8, personality: personalityFrom({ fame: 0.95, vanity: 0.9, artistry: 0.8 }) });
      // Eating and sleeping take beats now (and a few more of the hero's lives than they used to), so the night is a little longer.
      for (let k = 0; k < 360 && !w.over; k++) events.push(...step(w));
      if (events.some((e) => e.type === 'goal_done' && e.data.kind === 'fame')) finished++;
    }
    expect(finished).toBeGreaterThan(6);
  });
});

describe('dragons: look up, then decide', () => {
  it('scans the sky while hunting, and a flight overhead gets sized up', () => {
    const w = world('sky');
    w.hero.locationId = 'street_main';
    w.flags.dragon_known = true;
    const g = goal(w, { kind: 'dragon', amount: 1, mode: 'flight' });
    expect(dragonCandidates(w).some((x) => x.key === 'scan_skies')).toBe(true);
    const { c, events } = ctxOf(w, 'd1');
    pursuitTick(c, g);
    expect(g.pursuit!.phase).toBe('search');
    expect(pursuitBias(w, g, 'scan_skies', undefined)).toBeGreaterThan(3);
    // A flight arrives.
    foe(w, 'art1', 'artemis', 'street_main');
    w.flight = { kind: 'artemis', ids: ['art1'], locationId: 'street_main', until: w.beat + 9, hidden: false, noticed: false };
    pursuitTick(c, g);
    expect(g.pursuit!.phase).toBe('assess');
    expect(events.some((e) => String(e.data.variant).startsWith('dragon_sizeup'))).toBe(true);
    g.pursuit!.verdict = 'take';
    expect(pursuitBias(w, g, 'engage_flight', undefined)).toBeGreaterThan(4);
    expect(pursuitBias(w, g, 'hide_flight', undefined)).toBe(0);
    g.pursuit!.verdict = 'prep';
    expect(pursuitBias(w, g, 'engage_flight', undefined)).toBe(0);
    expect(pursuitBias(w, g, 'hide_flight', undefined)).toBeGreaterThan(1);
    expect(dragonReadiness(w, g)).toBeGreaterThanOrEqual(0);
  });

  slow('over many nights, someone goes hunting and comes back with a scale', () => {
    let scans = 0;
    let kills = 0;
    let done = 0;
    for (let i = 0; i < 40; i++) {
      const { world: w, events } = createRun({ seed: `hunt-${i}`, competence: 0.9, personality: personalityFrom({ courage: 0.95, justice: 0.9, thrill: 0.9 }) });
      for (let k = 0; k < 400 && !w.over; k++) events.push(...step(w));
      scans += events.filter((e) => e.type === 'scan_skies').length;
      kills += w.counters.dragon_kills ?? 0;
      done += events.filter((e) => e.type === 'goal_done' && e.data.kind === 'dragon').length;
    }
    expect(scans).toBeGreaterThan(30);
    expect(kills).toBeGreaterThan(3);
    expect(done).toBeGreaterThan(3);
  });
});
