import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { speakingCandidates, talkDown, billboardSpeech } from './speaking';
import { spawnGroup } from './candidate';
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
      w.hero.skills.speaking = 100;
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
});
