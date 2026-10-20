import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { always, never, scenario, type Scenario } from './testkit';
import { makeCtx } from './run';
import { advise } from './run';
import { render } from './text';
import { beginRun, endRun, newUniverse } from './universe';
import { makeItem } from './content/items';
import { skillLevel } from './skills';
import { knowsMission, missionAfterSet, missionById, missionCandidates, missionGrapevine, missionsTick, remindMission, startMission } from './missions';
import { MISSIONS } from './content/missions';
import { activeDisguise } from './disguise';
import { questCandidates } from './quests';
import type { Ctx, Mission } from './types';

/** A Blackbird who can play a bit, with a guitar, and a crowd that expects a real player. */
const player = (w: World, xp = 1500): void => {
  w.hero.skills.guitar = xp;
  w.hero.skills.music = 400;
  w.legacy.repute = { guitar: 20 };
  w.hero.inventory.push(makeItem('vintage_guitar'));
};

function begun(seed = 'mission', setup?: (w: World) => void): { s: Scenario; m: Mission; events: GameEvent[] } {
  const s = scenario({ seed, setup: (w) => { player(w); setup?.(w); } });
  let m: Mission | null = null;
  const events = s.run((c) => { m = startMission(c, 'safekeeping', 'after_set'); });
  expect(m, 'the mission should roll in a fresh world').not.toBeNull();
  return { s, m: m!, events };
}

const master = (s: Scenario, m: Mission) => s.w.npcs[m.cast.master!]!;
const go = (s: Scenario, loc: string): void => { s.w.hero.locationId = loc; };
const ready = (s: Scenario, m: Mission): void => { m.waitUntil = undefined; void s; };
const act = (m: Mission, a: string): string => `mission:${m.id}:${a}`;
const tick = (s: Scenario, rng: Rng = never()): GameEvent[] => s.run((c) => missionsTick(c), rng);

/** Walk a fresh mission to the fork: audition, then whatever the earning is (forced to lessons). */
function toFork(s: Scenario, m: Mission): void {
  go(s, m.places.bar!);
  s.do(act(m, 'audition'), always());
  expect(m.stage).toBe('earn');
  m.picks.earn = 'lessons';
  for (let i = 0; i < 3; i++) {
    ready(s, m);
    s.do(act(m, 'lesson'), always());
  }
  expect(m.stage).toBe('fork');
}

describe('a mission reaches her', () => {
  it('rolls a master at a real bar and a venue to play, makes it a goal, and says so in words', () => {
    const { s, m, events } = begun();
    const mst = master(s, m);
    expect(mst.alive).toBe(true);
    expect(mst.archetype).toBe('old_master');
    expect(mst.locationId).toBe(m.places.bar);
    expect(s.w.locations[m.places.bar!]!.kind).toBe('bar');
    expect(['bar', 'club']).toContain(s.w.locations[m.places.venue!]!.kind);
    expect(m.places.venue).not.toBe(m.places.bar);
    expect(knowsMission(s.w, m)).toBe(true);
    expect(s.w.mind.goals.some((g) => g.kind === 'mission' && g.mission === m.id)).toBe(true);
    expect(events.some((e) => e.type === 'mission' && e.data.variant === 'hook_after_set')).toBe(true);
    for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });

  it('is the same story in the same save, and a different one in another', () => {
    const a = begun('same');
    const b = begun('same');
    expect(master(b.s, b.m).name).toBe(master(a.s, a.m).name);
    expect(b.m.places).toEqual(a.m.places);
    expect(b.m.picks).toEqual(a.m.picks);
    const names = new Set(['x1', 'x2', 'x3', 'x4', 'x5'].map((seed) => { const r = begun(seed); return `${master(r.s, r.m).name}/${r.m.picks.guitar}`; }));
    expect(names.size).toBeGreaterThan(2);
  });

  it('only one at a time, and not for somebody who can barely play', () => {
    const { s } = begun();
    expect(MISSIONS.safekeeping!.eligible(s.w)).toBe(false);
    const fresh = scenario({ seed: 'novice' });
    expect(MISSIONS.safekeeping!.eligible(fresh.w)).toBe(false);
  });

  it('after a good set in front of people, somebody may have a story for her', () => {
    const s = scenario({ seed: 'afterset', at: 'halo_floor', setup: (w) => player(w) });
    s.w.locations.halo_floor!.crowded = true;
    const ev: GameEvent = { beat: 0, type: 'gig', outcome: 'good', data: {} };
    s.run((c) => missionAfterSet(c, 'gig', 'guitar', [ev]), always());
    expect(s.w.legacy.missions?.[0]?.via).toBe('after_set');
  });

  it('a fan on the grapevine can start one, and so can a thing in a box at the pawn shop', () => {
    const s = scenario({ seed: 'vine', setup: (w) => player(w) });
    let started = false;
    s.run((c) => { started = missionGrapevine(c); }, always());
    expect(started).toBe(true);
    expect(s.w.legacy.missions?.[0]?.via).toBe('grapevine');

    // A relic: somewhere one is lying about, in a bar or a pawn shop.
    const t = scenario({ seed: 'relic', setup: (w) => player(w) });
    const spot = Object.values(t.w.locations).find((l) => { t.w.hero.locationId = l.id; return missionCandidates(t.w).some((c) => c.key.startsWith('mission_relic:')); });
    expect(spot, 'some bar or pawn shop has a relic').toBeDefined();
    t.do('mission_relic:safekeeping', always());
    expect(t.w.legacy.missions?.[0]?.via).toBe('object');
    expect(missionCandidates(t.w).some((c) => c.key.startsWith('mission_relic:'))).toBe(false);
  });
});

describe('earning the master', () => {
  it('a flopped audition is "come back tomorrow": the stage waits a world day and nothing pulls her meanwhile', () => {
    const { s, m } = begun();
    go(s, m.places.bar!);
    s.do(act(m, 'audition'), never());
    expect(m.stage).toBe('find');
    expect(m.waitUntil).toBeGreaterThan(s.w.clock + 20 * 60);
    expect(s.offers()).not.toContain(act(m, 'audition'));
    s.w.clock = m.waitUntil! + 1;
    expect(s.offers()).toContain(act(m, 'audition'));
  });

  it('lessons are three visits, each one some time apart, and they teach', () => {
    const { s, m } = begun();
    const before = s.w.hero.skills.guitar!;
    toFork(s, m);
    expect(s.w.hero.skills.guitar!).toBeGreaterThan(before);
  });

  it('or she fixes the amp, or busks under the window until the master comes down', () => {
    const amp = begun('amp');
    go(amp.s, amp.m.places.bar!);
    amp.s.do(act(amp.m, 'audition'), always());
    amp.m.picks.earn = 'amp';
    ready(amp.s, amp.m);
    amp.s.do(act(amp.m, 'fix_amp'), always());
    expect(amp.m.stage).toBe('fork');

    const busk = begun('busk');
    go(busk.s, busk.m.places.bar!);
    busk.s.do(act(busk.m, 'audition'), always());
    busk.m.picks.earn = 'busk';
    const ev: GameEvent = { beat: 0, type: 'busk', outcome: 'good', data: {} };
    for (let i = 0; i < 2; i++) {
      ready(busk.s, busk.m);
      busk.s.run((c) => missionAfterSet(c, 'busk', 'guitar', [ev]), never());
    }
    expect(busk.m.stage).toBe('fork');
  });
});

describe('the fork', () => {
  it('she asks the lab, and the lab picks the road', () => {
    const { s, m } = begun('ask');
    toFork(s, m);
    s.w.beat = 100;
    // (A sociable, loyal Blackbird asks; rig the dice so she does.)
    tick(s, always());
    expect(s.w.mind.ask?.kind).toBe('mission');
    advise(s.w, 'legal');
    expect(m.stage).toBe('legal');
    expect(m.flags.asked).toBeUndefined();
  });

  it('nobody answers, and her nature decides', () => {
    const { s, m } = begun('lapse');
    toFork(s, m);
    s.w.beat = 100;
    tick(s, never());
    expect(['annex', 'legal', 'collector']).toContain(m.stage);
  });
});

describe('the roads to the guitar', () => {
  it('the lockup: the master gives her the job, she takes it from the truck, hands it over, and the gig is tomorrow evening', () => {
    const { s, m } = begun('annex');
    toFork(s, m);
    s.run((c) => MISSIONS.safekeeping!.resolve!(c, m, 'annex'));
    const mst = master(s, m);
    expect(m.stage).toBe('annex');
    expect(mst.quest?.site).toBe(m.places.annex);
    expect(s.w.mind.quests).toContain(mst.id);
    // Done at the truck (quests.ts does that part), and reported back.
    mst.quest!.state = 'ready';
    s.w.hero.inventory.push({ id: `quest:${mst.id}`, name: 'x', kind: 'loot', power: 0, value: 0, tags: ['quest', `quest:${mst.id}`] });
    go(s, mst.locationId);
    expect(questCandidates(s.w).some((c) => c.key === `turn_in_quest:${mst.id}`)).toBe(true);
    s.do(`turn_in_quest:${mst.id}`);
    tick(s);
    expect(m.stage).toBe('lastset');
    expect(m.waitUntil).toBeGreaterThan(s.w.clock);
  });

  it('signed to Muse, walking out of the lockup with it is a breach of contract', () => {
    const { s, m } = begun('breach', (w) => { w.legacy.muse = { signed: true }; });
    toFork(s, m);
    s.run((c) => MISSIONS.safekeeping!.resolve!(c, m, 'annex'));
    master(s, m).quest!.state = 'ready';
    const ev = tick(s);
    expect(ev.some((e) => e.type === 'muse' && e.data.variant === 'breach_annex')).toBe(true);
    expect(s.w.legacy.muse!.signed).toBe(false);
  });

  it('the legal road: the Muse setlist gets the form stamped; flop it twice and it goes to auction', () => {
    const { s, m } = begun('legal');
    toFork(s, m);
    s.run((c) => MISSIONS.safekeeping!.resolve!(c, m, 'legal'));
    go(s, m.places.bar!);
    s.do(act(m, 'approved_set'), always());
    expect(m.stage).toBe('lastset');

    const two = begun('legal2');
    toFork(two.s, two.m);
    two.s.run((c) => MISSIONS.safekeeping!.resolve!(c, two.m, 'legal'));
    go(two.s, two.m.places.bar!);
    for (let i = 0; i < 2; i++) {
      ready(two.s, two.m);
      two.s.do(act(two.m, 'approved_set'), never());
    }
    expect(two.m.stage).toBe('collector');
  });

  it('the collector: short of the price she sets out to raise it; with it, she buys the guitar and takes it to the master', () => {
    const { s, m } = begun('collect');
    toFork(s, m);
    s.run((c) => MISSIONS.safekeeping!.resolve!(c, m, 'collector'));
    expect(m.stage).toBe('collector');
    const col = s.w.npcs[m.cast.collector!]!;
    expect(col.locationId).toBe(m.places.collector);
    s.w.hero.cash = 0;
    tick(s);
    const g = s.w.mind.goals.find((x) => x.kind === 'mission' && x.mission === m.id)!;
    expect(s.w.mind.goals.some((x) => x.kind === 'cash' && x.parent === g.id)).toBe(true);
    s.w.hero.cash = 5000;
    go(s, col.locationId);
    s.do(act(m, 'buy_guitar'));
    expect(m.stage).toBe('deliver');
    expect(s.w.hero.inventory.some((i) => i.tags.includes(`mission:${m.id}`))).toBe(true);
    go(s, master(s, m).locationId);
    s.do(act(m, 'hand_over'));
    expect(m.stage).toBe('lastset');
  });
});

describe('the last set', () => {
  function atLastSet(seed: string, traits: Partial<Record<string, number>> = {}) {
    const r = begun(seed, (w) => Object.assign(w.hero.personality.traits, traits));
    toFork(r.s, r.m);
    r.s.run((c) => MISSIONS.safekeeping!.resolve!(c, r.m, 'legal'));
    go(r.s, r.m.places.bar!);
    r.s.do(act(r.m, 'approved_set'), always());
    ready(r.s, r.m);
    go(r.s, r.m.places.venue!);
    tick(r.s);
    return r;
  }

  it('the master comes to watch; she plays it; a vain, greedy girl keeps the guitar, a signature instrument with their name on it', () => {
    const { s, m } = atLastSet('kept', { vanity: 1, greed: 1, kindness: 0, loyalty: 0 });
    expect(master(s, m).locationId).toBe(m.places.venue);
    const ev = s.do(act(m, 'last_set'), always());
    expect(m.ending).toBe('kept');
    const g = s.w.hero.inventory.find((i) => i.tags.includes(`mission:${m.id}`));
    expect(g?.inst?.signature).toBe(3);
    expect(g?.name).toContain(master(s, m).name);
    expect(ev.some((e) => e.data.variant === 'last_kept')).toBe(true);
    // Over and done: the goal goes, and so does what she knew of it.
    s.run((c) => missionsTick(c));
    expect(s.w.mind.missions ?? []).not.toContain(m.id);
  });

  it('a kind, loyal one gives it back, and the master plays the last song', () => {
    const { s, m } = atLastSet('returned', { vanity: 0, greed: 0, kindness: 1, loyalty: 1 });
    s.do(act(m, 'last_set'), always());
    expect(m.ending).toBe('returned');
    expect(master(s, m).tags).toContain('retired_happy');
    expect(s.w.hero.inventory.some((i) => i.tags.includes(`mission:${m.id}`))).toBe(false);
  });

  it('flopped, it\'s "not ready for you": another night, and the story is still going', () => {
    const { s, m } = atLastSet('flop');
    s.do(act(m, 'last_set'), never());
    expect(m.ending).toBeUndefined();
    expect(m.stage).toBe('lastset');
    expect(m.waitUntil).toBeGreaterThan(s.w.clock);
  });
});

describe('the darker road', () => {
  it('she kills the master, puts on their face, and plays their comeback; the guitar is handed to its "owner"', () => {
    const { s, m } = begun('villain');
    toFork(s, m);
    s.run((c) => MISSIONS.safekeeping!.resolve!(c, m, 'legal'));
    const mst = master(s, m);
    mst.hp = 1;
    mst.maxHp = 1;
    s.w.hero.level = 40;
    go(s, mst.locationId);
    s.do(act(m, 'betray'), always());
    expect(mst.alive).toBe(false);
    expect(m.stage).toBe('usurp');
    tick(s);
    expect(m.ending, 'killed by her, the master is not mourned').toBeUndefined();
    go(s, m.places.venue!);
    s.do(act(m, 'masquerade'), always());
    expect(m.ending).toBe('usurped');
    expect(activeDisguise(s.w)?.label).toBe(mst.name);
    expect(s.w.hero.inventory.some((i) => i.tags.includes(`mission:${m.id}`))).toBe(true);
  });

  it('somebody in the room knew the master: the face comes off and the night turns', () => {
    const { s, m } = begun('exposed');
    toFork(s, m);
    s.run((c) => MISSIONS.safekeeping!.resolve!(c, m, 'legal'));
    master(s, m).alive = false;
    m.flags.killed = 1;
    m.stage = 'usurp';
    go(s, m.places.venue!);
    s.do(act(m, 'masquerade'), never());
    expect(m.ending).toBe('exposed');
    expect(activeDisguise(s.w)).toBeUndefined();
  });

  it('a master who dies some other way is mourned, and that is the end of it', () => {
    const { s, m } = begun('mourned');
    master(s, m).alive = false;
    const ev = tick(s);
    expect(m.ending).toBe('mourned');
    expect(ev.some((e) => e.data.variant === 'mourned')).toBe(true);
  });
});

describe('it outlives her; she doesn\'t remember it', () => {
  it('a new body knows nothing of it; the master brings it up when she walks in; or anyone can, through remindMission', () => {
    const u = newUniverse('relive');
    const w1 = beginRun(u);
    player(w1);
    const events: GameEvent[] = [];
    const c1: Ctx = makeCtx(w1, new Rng('r'), events);
    const m = startMission(c1, 'safekeeping', 'grapevine')!;
    expect(m).not.toBeNull();
    m.stage = 'earn';
    w1.ending = 'dead';
    w1.over = true;
    const w2 = beginRun(endRun(w1));
    const kept = missionById(w2, m.id)!;
    expect(kept.stage).toBe('earn');
    expect(knowsMission(w2, kept)).toBe(false);
    expect(w2.mind.goals.some((g) => g.kind === 'mission')).toBe(false);
    // Nothing on offer for a story she doesn't know.
    w2.hero.locationId = kept.places.bar!;
    expect(missionCandidates(w2).some((x) => x.key.startsWith(`mission:${m.id}`))).toBe(false);
    const ev: GameEvent[] = [];
    missionsTick(makeCtx(w2, always(), ev));
    expect(knowsMission(w2, kept)).toBe(true);
    expect(ev.some((e) => e.data.variant === 'hook_reminded')).toBe(true);

    // And the hook the Holocall layer will use.
    const w3 = beginRun(endRun(Object.assign(w2, { ending: 'dead', over: true })));
    expect(knowsMission(w3, missionById(w3, m.id)!)).toBe(false);
    expect(remindMission(makeCtx(w3, new Rng('h'), []), m.id, 'holocall')).toBe(true);
    expect(remindMission(makeCtx(w3, new Rng('h'), []), m.id, 'holocall')).toBe(false);
  });

  it('a guitar she was carrying when she died is gone; Clearance has it again, and the road is the lockup', () => {
    const { s, m } = begun('dropped');
    toFork(s, m);
    s.run((c) => MISSIONS.safekeeping!.resolve!(c, m, 'collector'));
    s.w.hero.cash = 5000;
    go(s, m.places.collector!);
    s.do(act(m, 'buy_guitar'));
    expect(m.stage).toBe('deliver');
    s.w.hero.inventory = s.w.hero.inventory.filter((i) => !i.tags.includes(`mission:${m.id}`));
    tick(s);
    expect(m.stage).toBe('annex');
    expect(master(s, m).quest?.state).toBe('open');
  });
});

describe('the words', () => {
  it('every line it can say has a template and no token left unfilled', () => {
    const lines: GameEvent[] = [];
    const seeds = ['w1', 'w2', 'w3'];
    for (const seed of seeds) {
      const { s, m, events } = begun(seed);
      lines.push(...events);
      toFork(s, m);
      s.run((c) => MISSIONS.safekeeping!.resolve!(c, m, 'collector'));
      s.w.hero.cash = 5000;
      go(s, m.places.collector!);
      lines.push(...s.do(act(m, 'buy_guitar')));
      go(s, master(s, m).locationId);
      lines.push(...s.do(act(m, 'hand_over')));
      ready(s, m);
      go(s, m.places.venue!);
      lines.push(...tick(s));
      lines.push(...s.do(act(m, 'last_set'), never()));
      ready(s, m);
      lines.push(...s.do(act(m, 'last_set'), always()));
    }
    const mine = lines.filter((e) => e.type === 'mission' || e.type === 'goal_new' || e.type === 'goal_done');
    expect(mine.length).toBeGreaterThan(10);
    const ctx = { rng: new Rng('t'), personality: scenario().w.hero.personality, realName: 'Brenda Pilchard' };
    for (const e of mine) {
      expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      for (const l of render(e, ctx)) expect(l.text, `${e.type}:${e.data.variant}`).not.toMatch(/[{}]|undefined|\[object/);
    }
    expect(skillLevel(scenario({ setup: player }).w.hero, 'guitar')).toBeGreaterThan(10);
  });
});
