import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { speakingCandidates, talkDown, billboardSpeech, moveCrowd, speechTick, MAX_LEADERS } from './speaking';
import { assistMult, statsOf, withAssist } from './npcstats';
import { followersOf } from './influence';
import { spawnGroup } from './candidate';
import { supplyCandidates } from './supply';
import { makeItem } from './content/items';
import { adoptCalling, callingAfter, countOf, progressOf } from './callings';
import { DEFS } from './content/callings';
import { runErrand } from './errands';
import type { Calling } from './types';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { newCompanion, allyPower } from './companions';

const world = (seed: string): World => createWorld({ seed, competence: 0.8, personality: personalityFrom({}) });
const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const keys = (w: World): string[] => speakingCandidates(w).map((x) => x.key);

describe('speaking', () => {
  it('offers a soapbox outdoors, a mirror by a mirror, and a rally only with companions', () => {
    const w = world('speak-offers');
    w.hero.locationId = 'street_main';
    expect(keys(w)).toContain('stump_speech');
    expect(keys(w)).not.toContain('rally_allies');
    expect(keys(w)).not.toContain('mirror_speech');
    w.hero.companions.push(newCompanion('scrapper', 'Rivet'));
    expect(keys(w)).toContain('rally_allies');
    w.hero.locationId = Object.values(w.features).find((f) => f.kind === 'mirror')!.locationId;
    expect(keys(w)).toContain('mirror_speech');
  });

  it('a speech in the mirror trains speaking a little and changes nothing else', () => {
    const w = world('speak-mirror');
    w.hero.locationId = Object.values(w.features).find((f) => f.kind === 'mirror')!.locationId;
    const { c, events } = ctxOf(w, 'm');
    const cash = w.hero.cash, hp = w.hero.hp, fame = w.hero.fame;
    const cand = speakingCandidates(w).find((x) => x.key === 'mirror_speech')!;
    for (let i = 0; i < 3; i++) cand.run(c);
    expect(w.hero.skills.speaking).toBeGreaterThan(0);
    expect([w.hero.cash, w.hero.hp, w.hero.fame]).toEqual([cash, hp, fame]);
    for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });

  it('repeating the mirror speech stops helping and starts costing her sleep', () => {
    const w = world('speak-doubt');
    w.hero.locationId = Object.values(w.features).find((f) => f.kind === 'mirror')!.locationId;
    const { c, events } = ctxOf(w, 'd');
    const cand = speakingCandidates(w).find((x) => x.key === 'mirror_speech')!;
    const gains: number[] = [];
    for (let i = 0; i < 8; i++) {
      const xp = w.hero.skills.speaking ?? 0;
      const sleep = w.hero.sleep ?? 100;
      cand.run(c);
      gains.push((w.hero.skills.speaking ?? 0) - xp);
      if (events.at(-1)!.data.variant === 'doubt') expect(w.hero.sleep!).toBeLessThan(sleep);
    }
    expect(gains[1]!).toBeLessThan(gains[0]!);
    expect(events.some((e) => e.data.variant === 'doubt')).toBe(true);
    expect(gains[7]).toBe(0);
  });

  it('rallying again and again does less each time', () => {
    const w = world('speak-wear');
    w.hero.skills.speaking = 100;
    w.hero.charm = 8;
    w.hero.companions.push(newCompanion('scrapper', 'Rivet'));
    const cand = speakingCandidates(w).find((x) => x.key === 'rally_allies')!;
    const { c } = ctxOf(w, 'w');
    const loyalty = () => w.hero.companions[0]!.loyalty;
    w.hero.companions[0]!.loyalty = 0;
    cand.run(c);
    const first = loyalty();
    w.hero.companions[0]!.loyalty = 0;
    for (let i = 0; i < 6; i++) cand.run(c);
    w.hero.companions[0]!.loyalty = 0;
    cand.run(c);
    expect(speakingCandidates(w).some((x) => x.key === 'rally_allies')).toBe(true);
    expect(loyalty()).toBeLessThanOrEqual(first);
  });

  it('a good speech to her companions fires them up; a stump speech only earns fame', () => {
    let inspired = 0;
    let fameGain = 0;
    for (let i = 0; i < 40; i++) {
      const w = world(`speak-rally-${i}`);
      w.hero.skills.speaking = 300; // (level 11: a good speaker)
      w.hero.charm = 8;
      w.hero.companions.push(newCompanion('scrapper', 'Rivet'));
      const a = w.hero.companions[0]!;
      const { c, events } = ctxOf(w, `r${i}`);
      speakingCandidates(w).find((x) => x.key === 'rally_allies')!.run(c);
      if (a.inspired) {
        inspired++;
        expect(allyPower(w, a)).toBeGreaterThan(a.power);
        w.beat = a.inspired.until + 1;
        expect(allyPower(w, a)).toBe(a.power);
      }
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      w.hero.locationId = 'street_main';
      const cash = w.hero.cash;
      const f0 = w.hero.fame;
      speakingCandidates(w).find((x) => x.key === 'stump_speech')!.run(c);
      expect(w.hero.cash).toBe(cash);
      fameGain += w.hero.fame - f0;
    }
    expect(inspired).toBeGreaterThan(20);
    expect(fameGain).toBeGreaterThan(0);
  });

  it('can talk down attackers, taking Heat off when they came because of it, or fail and get hit', () => {
    let won = 0;
    let lost = 0;
    let cooled = 0;
    for (let i = 0; i < 200; i++) {
      const w = world(`talk-${i}`);
      w.hero.skills.speaking = 5000;
      w.hero.charm = 10;
      w.heat.npd = 4;
      w.hero.locationId = 'street_main';
      const { c, events } = ctxOf(w, `t${i}`);
      const squad = spawnGroup(c, 'npd_officer', 2);
      const hp = w.hero.hp;
      const ok = talkDown(c, squad);
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      if (ok) {
        won++;
        expect(squad.every((f) => !f.alive || !f.hostile)).toBe(true);
        expect(w.heat.npd).toBeLessThanOrEqual(4);
        if (w.heat.npd! < 4) cooled++;
      } else if (events.length) {
        lost++;
        expect(w.hero.hp).toBeLessThan(hp);
      }
    }
    expect(won).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
    expect(cooled).toBeGreaterThan(0);
  });

  it('does not try without any Speaking, or on robots', () => {
    const w = world('talk-none');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'n');
    const squad = spawnGroup(c, 'npd_officer', 2);
    for (let i = 0; i < 50; i++) expect(talkDown(c, squad)).toBe(false);
    w.hero.skills.speaking = 300; // level 11: not enough nerve yet
    for (let i = 0; i < 50; i++) expect(talkDown(c, squad)).toBe(false);
    w.hero.skills.speaking = 5000;
    const drones = spawnGroup(c, 'npd_drone', 2);
    for (let i = 0; i < 50; i++) expect(talkDown(c, drones)).toBe(false);
    expect(events).toEqual([]);
  });

  it('a skilled speaker takes the mic when she hijacks a billboard', () => {
    const w = world('billboard-speech');
    w.hero.locationId = 'street_main';
    const { c, events } = ctxOf(w, 'b');
    billboardSpeech(c);
    expect(events).toEqual([]);
    w.hero.skills.speaking = 100; // level 7: good, not good enough
    billboardSpeech(c);
    expect(events).toEqual([]);
    w.hero.skills.speaking = 5000;
    w.hero.charm = 10;
    for (let i = 0; i < 30; i++) billboardSpeech(c);
    expect(events.some((e) => e.type === 'billboard_speech' && e.data.variant === 'speech')).toBe(true);
    for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });

  const crowdAt = (w: World, n: number): void => {
    for (let i = 0; i < n; i++) {
      const id = `listener_${i}`;
      addNpc(w, spawnNpc(new Rng(id), id, 'patron', 'street_main', {}));
    }
  };

  it('a stump speech puts a goal in the heads of the crowd, with fame as the bonus', () => {
    let moved = 0;
    let nobody = 0;
    for (let i = 0; i < 40; i++) {
      const w = world(`crowd-${i}`);
      w.hero.skills.speaking = 5000;
      w.hero.charm = 10;
      w.hero.locationId = 'street_main';
      for (const n of Object.values(w.npcs)) if (n.locationId === 'street_main') moveNpc(w, n, '_gone');
      const { c, events } = ctxOf(w, `c${i}`);
      const stump = speakingCandidates(w).find((x) => x.key === 'stump_speech')!;
      stump.run(c);
      expect(w.influenced ?? []).toEqual([]);
      nobody += events.filter((e) => e.type === 'stump_speech' && e.data.variant === 'crowd').length;
      crowdAt(w, 5);
      for (let k = 0; k < 4; k++) stump.run(c);
      for (const id of w.influenced ?? []) {
        const n = w.npcs[id]!;
        expect(n.goals!.some((g) => g.method === 'persuasion')).toBe(true);
        moved++;
      }
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(nobody).toBe(0);
    expect(moved).toBeGreaterThan(20);
  });

  it('a billboard speech moves a bigger crowd for longer', () => {
    let stump = 0;
    let board = 0;
    let stumpLen = 0;
    let boardLen = 0;
    for (let i = 0; i < 40; i++) {
      for (const kind of ['stump', 'board'] as const) {
        const w = world(`big-${i}`);
        w.hero.skills.speaking = 5000;
        w.hero.charm = 10;
        w.hero.locationId = 'street_main';
        for (const n of Object.values(w.npcs)) if (n.locationId === 'street_main') moveNpc(w, n, '_gone');
        crowdAt(w, 12);
        const { c } = ctxOf(w, `b${i}`);
        if (kind === 'stump') speakingCandidates(w).find((x) => x.key === 'stump_speech')!.run(c);
        else for (let k = 0; k < 20 && !(w.influenced ?? []).length; k++) billboardSpeech(c);
        const goals = (w.influenced ?? []).flatMap((id) => w.npcs[id]!.goals!);
        if (kind === 'stump') { stump += goals.length; stumpLen += goals.reduce((a, g) => a + g.until - g.born, 0); }
        else { board += goals.length; boardLen += goals.reduce((a, g) => a + g.until - g.born, 0); }
      }
    }
    expect(board).toBeGreaterThan(stump);
    expect(boardLen / board).toBeGreaterThan(stumpLen / stump);
  });

  const bigStreet = (seed: string, n: number) => {
    const w = world(seed);
    w.hero.skills.speaking = 5000;
    w.hero.charm = 10;
    w.hero.locationId = 'street_main';
    for (const x of Object.values(w.npcs)) if (x.locationId === 'street_main') moveNpc(w, x, '_gone');
    crowdAt(w, n);
    return w;
  };

  it('moves any number of people but only simulates a handful; the rest follow one of them', () => {
    let sawFollowers = 0;
    for (let i = 0; i < 20; i++) {
      const w = bigStreet(`legion-${i}`, 50);
      const { c } = ctxOf(w, `l${i}`);
      const moved = moveCrowd(c, { depth: 1, stretch: 1, edge: 0.3 })!;
      const leaders = (w.influenced ?? []).map((id) => w.npcs[id]!);
      expect(leaders.length).toBe(moved.lead);
      expect(leaders.length).toBeLessThanOrEqual(MAX_LEADERS);
      const followers = leaders.flatMap((l) => followersOf(w, l.goals![0]));
      expect(leaders.length + followers.length).toBe(moved.count);
      for (const f of followers) {
        expect(w.influenced).not.toContain(f.id);
        expect(f.goals ?? []).toEqual([]);
      }
      if (moved.count > MAX_LEADERS) {
        expect(moved.lead).toBe(MAX_LEADERS);
        sawFollowers++;
        // spread across the leaders, not piled on one
        const sizes = leaders.map((l) => l.goals![0]!.followers?.length ?? 0);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
    expect(sawFollowers).toBeGreaterThan(10);
  });

  it('moving fifty people is worth more than moving eight', () => {
    expect(assistMult(0)).toBe(1);
    expect(assistMult(8)).toBeGreaterThan(assistMult(1));
    // 9 moved = 6 leaders, 3 with a follower; 50 moved = 6 leaders with about 7 each
    expect(assistMult(Math.ceil(44 / 6))).toBeGreaterThan(assistMult(1) + 0.3);
    const w = world('assist');
    const n = Object.values(w.npcs).find((x) => x.alive)!;
    const base = { ...statsOf(n) };
    const power = n.power;
    let inside = 0;
    let insidePower = 0;
    withAssist(n, 7, () => {
      inside = statsOf(n).muscle;
      insidePower = n.power;
    });
    expect(inside).toBeGreaterThan(base.muscle);
    expect(insidePower).toBeGreaterThan(power);
    expect(statsOf(n)).toEqual(base);
    expect(n.power).toBe(power);
    expect(() => withAssist(n, 7, () => { throw new Error('x'); })).toThrow();
    expect(n.power).toBe(power);
  });

  it('followers put into the hat and add to a backer\'s power', () => {
    let more = 0;
    for (let i = 0; i < 30; i++) {
      const small = bigStreet(`hat-s-${i}`, 6);
      const big = bigStreet(`hat-b-${i}`, 50);
      for (const w of [small, big]) {
        const { c } = ctxOf(w, `h${i}`);
        moveCrowd(c, { depth: 1, stretch: 1, edge: 0.3 });
      }
      const total = (w: World) => (w.influenced ?? []).flatMap((id) => w.npcs[id]!.goals!).reduce((a, g) => a + followersOf(w, g).length, 0);
      if (total(big) > total(small)) more++;
    }
    expect(more).toBeGreaterThan(20);
  });

  const neighbour = (w: World): string => w.locations.street_main!.exits.map((e) => e.to).find((id) => w.locations[id]?.outdoors && !w.locations[id]!.exits.every((e) => e.hidden))!;
  const addAt = (w: World, loc: string, n: number, tag: string): void => {
    for (let i = 0; i < n; i++) {
      const id = `${tag}_${i}`;
      addNpc(w, spawnNpc(new Rng(id), id, 'patron', loc, {}));
    }
  };

  it('is heard only on her own street, unless she has a loudspeaker, and then the next streets are less moved', () => {
    let plain = 0;
    let loud = 0;
    let local = 0;
    for (let i = 0; i < 40; i++) {
      for (const speaker of [false, true]) {
        const w = bigStreet(`loud-${i}`, 10);
        const next = neighbour(w);
        for (const x of Object.values(w.npcs)) if (x.locationId === next) moveNpc(w, x, '_gone');
        addAt(w, next, 10, 'far');
        if (speaker) w.hero.inventory.push(makeItem('loudspeaker'));
        const { c } = ctxOf(w, `s${i}`);
        moveCrowd(c, { depth: speaker ? 1 : 0, stretch: 1, edge: 0.2 });
        const ids = (w.influenced ?? []).concat(...(w.influenced ?? []).map((id) => w.npcs[id]!.goals![0]!.followers ?? []));
        const here = ids.filter((id) => id.startsWith('listener_')).length;
        const there = ids.filter((id) => id.startsWith('far_')).length;
        if (speaker) { loud += there; local += here; } else { plain += there; }
      }
    }
    expect(plain).toBe(0);
    expect(loud).toBeGreaterThan(0);
    expect(local).toBeGreaterThan(loud);
  });

  const stage = (w: World, key: string) => speakingCandidates(w).find((x) => x.key === key);

  it('a speech lasts world-clock time: she keeps working it in stages, people who come by are swept up, and the time limit ends it', () => {
    let joined = 0;
    for (let i = 0; i < 30; i++) {
      const w = bigStreet(`drift-${i}`, 0);
      const { c, events } = ctxOf(w, `d${i}`);
      moveCrowd(c, { depth: 0, stretch: 1, edge: 0.3 });
      expect(w.speech).toBeTruthy();
      // an empty street: she keeps going, nobody new, the speech is still on
      w.beat++;
      w.clock += 6;
      speechTick(c);
      stage(w, 'keep_speaking')!.run(c);
      expect(w.speech).toBeTruthy();
      expect(w.speech!.dry).toBe(1);
      expect(w.influenced ?? []).toEqual([]);
      // somebody comes through
      addAt(w, 'street_main', 6, `walker${i}`);
      w.beat++;
      w.clock += 6;
      speechTick(c);
      stage(w, 'keep_speaking')!.run(c);
      joined += (w.influenced ?? []).length;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      // the same people are not rolled twice
      const before = (w.influenced ?? []).length;
      w.beat++;
      speechTick(c);
      stage(w, 'keep_speaking')!.run(c);
      expect((w.influenced ?? []).length).toBe(before);
      // time up: it is over, and nothing is offered
      w.beat++;
      w.clock = w.speech!.until + 1;
      addAt(w, 'street_main', 6, `late${i}`);
      speechTick(c);
      expect(w.speech).toBeUndefined();
      expect(stage(w, 'keep_speaking')).toBeUndefined();
      expect((w.influenced ?? []).some((id) => id.startsWith('late'))).toBe(false);
    }
    expect(joined).toBeGreaterThan(10);
  });

  it('a speech ends when she leaves, wraps it up, or does something else instead', () => {
    const fresh = () => {
      const w = bigStreet('end', 3);
      const ctx = ctxOf(w, 'x');
      moveCrowd(ctx.c, { depth: 0, stretch: 1, edge: 0.3 });
      return { w, ...ctx };
    };
    // leaving
    let { w, c } = fresh();
    w.hero.locationId = neighbour(w);
    speechTick(c);
    expect(w.speech).toBeUndefined();
    // wrapping up, told as the end of the speech
    ({ w, c } = fresh());
    const { events } = ctxOf(w, 'y');
    const cc = { ...c, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) };
    stage(w, 'wrap_up')!.run(cc);
    expect(w.speech).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(['speech_wrap']);
    expect(hasTemplate(events[0]!)).toBe(true);
    // doing something else for a beat
    ({ w, c } = fresh());
    w.beat += 1;
    speechTick(c);
    expect(w.speech).toBeTruthy();
    w.beat += 1; // a beat went by that was not spent on the speech
    speechTick(c);
    expect(w.speech).toBeUndefined();
  });

  it('she is more inclined to keep going while it is working and to wrap up when it goes dry or runs long', () => {
    const w = bigStreet('mood', 0);
    const { c } = ctxOf(w, 'm');
    moveCrowd(c, { depth: 0, stretch: 1, edge: 0.3 });
    const bonus = (key: string) => stage(w, key)!.bonus ?? 0;
    const keepFresh = bonus('keep_speaking');
    const wrapFresh = bonus('wrap_up');
    expect(keepFresh).toBeGreaterThan(wrapFresh);
    w.speech!.dry = 3;
    w.clock = w.speech!.began + (w.speech!.until - w.speech!.began) * 0.8;
    expect(bonus('wrap_up')).toBeGreaterThan(bonus('keep_speaking'));
  });

  it('sells a loudspeaker at the gun shop, to someone who can speak and has the cash', () => {
    const w = world('shop');
    w.hero.locationId = 'gun_shop';
    w.hero.cash = 1000;
    const buys = () => supplyCandidates(w).some((x) => x.key === 'buy_loudspeaker');
    expect(buys()).toBe(false);
    w.hero.skills.speaking = 100;
    expect(buys()).toBe(true);
    const { c, events } = ctxOf(w, 'buy');
    supplyCandidates(w).find((x) => x.key === 'buy_loudspeaker')!.run(c);
    expect(w.hero.inventory.some((i) => i.tags.includes('loudspeaker'))).toBe(true);
    expect(w.hero.cash).toBeLessThan(1000);
    expect(buys()).toBe(false);
    for (const e of events) expect(hasTemplate(e), e.type).toBe(true);
  });

  const calling = (id: string, extra: Partial<Calling> = {}): Calling => ({
    id, since: 0, fervor: 0.7, goal: 100, base: 0, origin: { kind: 'spark', text: 'test', beat: 0 }, lastProgress: 0, last: 0, said: 0, ...extra,
  });
  const ev = (type: string, data: Record<string, string | number | boolean> = {}) => ({ beat: 40, type, outcome: 'good' as const, data });

  it('has callings for speaking to a record crowd, for moving a lot of people, and for sending crowds to kill', () => {
    for (const id of ['multitude', 'legion', 'mob']) expect(DEFS[id], id).toBeTruthy();
    // legion counts everyone a speech moves: the opening and each wave that wanders in
    const w = world('legion');
    const { c } = ctxOf(w, 'l');
    adoptCalling(c, calling('legion', { goal: 30 }));
    callingAfter(c, null, 0, [ev('stump_speech', { variant: 'crowd', count: 5 }), ev('speech_joins', { variant: 'drift', count: 3, total: 8 })]);
    expect(countOf(w, w.mind.calling!)).toBe(8);
    callingAfter(c, null, 0, [ev('billboard_speech', { variant: 'crowd', count: 12 })]);
    expect(countOf(w, w.mind.calling!)).toBe(20);
    expect(progressOf(w, w.mind.calling!)).toBeCloseTo(20 / 30);
  });

  it('multitude is about the biggest single crowd, and always asks for more than she has managed', () => {
    const w = bigStreet('multitude', 40);
    const { c } = ctxOf(w, 'mm');
    moveCrowd(c, { depth: 0, stretch: 1, edge: 0.3 });
    const best = w.counters['cal.crowd_best'] ?? 0;
    expect(best).toBeGreaterThan(10);
    const goal = DEFS.multitude!.goal(new Rng('g'), 0.1, w);
    expect(goal).toBeGreaterThan(best * 1.4);
    adoptCalling(c, calling('multitude', { goal }));
    expect(countOf(w, w.mind.calling!)).toBe(best);
    // a smaller crowd later does not take it back
    w.speech = undefined;
    w.counters['cal.crowd_best'] = best + 25;
    expect(countOf(w, w.mind.calling!)).toBe(best + 25);
  });

  it('a crowd behind someone sent after a target can kill them, and each kill counts for the mob calling', () => {
    const run = (followers: number, seed: number): { dead: boolean; mob: number } => {
      const w = world(`mob-${seed}`);
      const t = Object.assign(spawnNpc(new Rng(`t${seed}`), `t${seed}`, 'patron', 'street_main', {}), { affinity: 0 });
      addNpc(w, t);
      const n = Object.assign(spawnNpc(new Rng(`n${seed}`), `n${seed}`, 'ganger', 'street_main', {}), { hp: 100, maxHp: 100 });
      addNpc(w, n);
      const ids: string[] = [];
      for (let i = 0; i < followers; i++) {
        const f = spawnNpc(new Rng(`f${seed}${i}`), `f${seed}_${i}`, 'patron', 'street_main', {});
        addNpc(w, f);
        ids.push(f.id);
      }
      const g = { id: 1, kind: 'go_after' as const, method: 'persuasion' as const, born: 0, until: 500, target: t.id, ...(followers ? { followers: ids } : {}) };
      n.goals = [g];
      w.influenced = [n.id];
      w.hero.locationId = 'street_main';
      const { c } = ctxOf(w, `r${seed}`);
      for (let b = 0; b < 12 && t.alive && n.goals?.length; b++) {
        w.beat += 5;
        runErrand(c, n, g, 0);
      }
      return { dead: !t.alive, mob: w.counters['cal.mob'] ?? 0 };
    };
    let withCrowd = 0;
    let alone = 0;
    for (let i = 0; i < 40; i++) {
      const a = run(20, i);
      const b = run(0, i);
      if (a.dead) { withCrowd++; expect(a.mob).toBe(1); }
      if (b.dead) alone++;
    }
    expect(withCrowd).toBeGreaterThan(5);
    expect(alone).toBe(0);
  });
});
