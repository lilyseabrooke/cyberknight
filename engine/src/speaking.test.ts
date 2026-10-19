import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { speakingCandidates } from './speaking';
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
});
