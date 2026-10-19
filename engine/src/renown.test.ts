import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { beginRun, endRun, newUniverse } from './universe';
import { fameFrom } from './stage';
import { FAME_HALF_LIFE_DAYS, expectation, fadeFame, famed, judgeSet, totalFans } from './renown';
import { MIN_PER_DAY } from './clock';
import { moveThrough } from './moves';
import { always } from './testkit';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { skillXp as xpForLevel } from './grade';

const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

/** Blackbird at a bar with a handful of people watching, and nobody else. */
function atTheBar(seed: string): World {
  const w = createWorld({ seed });
  w.hero.locationId = 'halo_floor';
  for (const n of Object.values(w.npcs)) if (n.locationId === 'halo_floor') moveNpc(w, n, '_gone');
  for (let i = 0; i < 5; i++) addNpc(w, spawnNpc(new Rng(`${seed}${i}`), `${seed}_fan${i}`, 'drifter', 'halo_floor', {}));
  return w;
}

const played = (outcome: 'good' | 'bad'): GameEvent[] => [{ beat: 0, type: 'busk', outcome, data: {} }];

describe('fame outlives her, skill does not', () => {
  it('a new body walks out of the lab with the fame the last one had, but none of the skill', () => {
    const u = newUniverse('cached');
    const w1 = beginRun(u);
    w1.hero.fame = 37;
    w1.hero.skills.guitar = xpForLevel(12);
    w1.legacy.renown = { guitar: 30 };
    w1.locations.halo_floor!.fans = 9;
    w1.ending = 'dead';
    w1.over = true;
    const u2 = endRun(w1);
    const w2 = beginRun(u2);
    // Same fame, less what the day since has worn off it.
    expect(w2.hero.fame).toBeGreaterThan(33);
    expect(w2.hero.fame).toBeLessThan(37);
    expect(w2.hero.skills.guitar ?? 0).toBeLessThan(xpForLevel(1));
    expect(w2.legacy.renown!.guitar).toBeGreaterThan(27);
    expect(w2.locations.halo_floor!.fans).toBe(9);
  });

  it('fame earned with a performing skill is fame for that skill, and sets what a crowd expects', () => {
    const w = atTheBar('renown');
    const { c } = ctxOf(w, 'r');
    expect(expectation(w, 'guitar')).toBe(0);
    fameFrom(c, 3, 'gig');
    expect(w.legacy.renown!.guitar).toBeGreaterThan(0);
    expect(w.legacy.renown!.vocals ?? 0).toBe(0);
    // Graffiti makes her famous, but nobody comes to a wall expecting a performance.
    fameFrom(c, 3, 'graffiti');
    expect(w.legacy.renown!.art).toBeUndefined();
  });
});

describe('a crowd that came for a legend', () => {
  it('an unknown who flops disappoints nobody', () => {
    const w = atTheBar('nobody');
    w.hero.fame = 5;
    const { c, events } = ctxOf(w, 'n');
    judgeSet(c, 'busk', 'guitar', played('bad'));
    expect(w.hero.fame).toBe(5);
    expect(events.some((e) => e.type === 'letdown')).toBe(false);
  });

  it('a famous guitarist with fresh hands loses fame and fans sharply when she flops', () => {
    const w = atTheBar('legend');
    w.hero.fame = 400;
    w.legacy.renown = { guitar: 400 };
    w.locations.halo_floor!.fans = 50;
    const { c, events } = ctxOf(w, 'l');
    judgeSet(c, 'busk', 'guitar', played('bad'));
    expect(w.hero.fame).toBeLessThan(370);
    expect(w.locations.halo_floor!.fans!).toBeLessThan(25);
    const e = events.find((x) => x.type === 'letdown')!;
    expect(e.outcome).toBe('bad');
    expect(hasTemplate(e)).toBe(true);
    expect(w.legacy.slump!.guitar!.sets).toBe(1);
  });

  it('a set that delivers wins fans where she played; one that is merely fine for a legend wins fewer', () => {
    const good = atTheBar('deliver');
    good.legacy.renown = { guitar: 25 };
    good.hero.skills.guitar = xpForLevel(5);
    judgeSet(ctxOf(good, 'd').c, 'busk', 'guitar', played('good'));
    const meh = atTheBar('deliver');
    meh.legacy.renown = { guitar: 400 };
    judgeSet(ctxOf(meh, 'd').c, 'busk', 'guitar', played('good'));
    expect(totalFans(good)).toBeGreaterThan(totalFans(meh));
    expect(totalFans(meh)).toBeGreaterThan(0);
  });

  it('after a slump, the first set that delivers is a comeback and wins some of it back', () => {
    const w = atTheBar('comeback');
    w.hero.fame = 400;
    w.legacy.renown = { guitar: 100 };
    const { c, events } = ctxOf(w, 'c');
    judgeSet(c, 'busk', 'guitar', played('bad'));
    judgeSet(c, 'busk', 'guitar', played('bad'));
    const low = w.hero.fame;
    w.hero.skills.guitar = xpForLevel(20);
    judgeSet(c, 'busk', 'guitar', played('good'));
    expect(w.hero.fame).toBeGreaterThan(low);
    const e = events.find((x) => x.type === 'comeback')!;
    expect(hasTemplate(e)).toBe(true);
    expect(w.legacy.slump!.guitar!.sets).toBe(0);
  });

  it('nobody watching, nobody let down', () => {
    const w = atTheBar('empty');
    for (const n of Object.values(w.npcs)) if (n.locationId === 'halo_floor') moveNpc(w, n, '_gone');
    w.locations.halo_floor!.crowded = false;
    w.hero.fame = 400;
    w.legacy.renown = { guitar: 400 };
    judgeSet(ctxOf(w, 'e').c, 'busk', 'guitar', played('bad'));
    expect(w.hero.fame).toBe(400);
  });
});

describe('fame fades, and its perks take work', () => {
  it('fame and renown halve over the half-life of in-game time, nights apart included', () => {
    const w = atTheBar('fade');
    w.hero.fame = 100;
    w.legacy.renown = { guitar: 80 };
    fadeFame(w);
    w.clock += FAME_HALF_LIFE_DAYS * MIN_PER_DAY;
    fadeFame(w);
    expect(w.hero.fame).toBeCloseTo(50, 5);
    expect(w.legacy.renown.guitar).toBeCloseTo(40, 5);
    // A beat's worth of time barely touches it.
    w.clock += 3;
    fadeFame(w);
    expect(w.hero.fame).toBeGreaterThan(49.99);
  });

  it('the days between one life and the next wear on her name', () => {
    const u = newUniverse('between');
    const w1 = beginRun(u);
    w1.hero.fame = 100;
    w1.ending = 'dead';
    w1.over = true;
    const w2 = beginRun(endRun(w1));
    expect(w2.hero.fame).toBeLessThan(100);
    expect(w2.hero.fame).toBeGreaterThan(90);
  });

  it('a night or two of fame does not get her past a bouncer; a real name does', () => {
    expect(famed(15, 25, 120)).toBe(0);
    const door = (fame: number): string => {
      const w = atTheBar('door');
      w.hero.locationId = 'street_main';
      w.hero.fame = fame;
      w.hero.cash = 0;
      const events: GameEvent[] = [];
      const c = { w, rng: always(), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: 0, type, outcome, data }) };
      moveThrough(c, w.locations.street_main!.exits.find((e) => e.to === 'neon_pharaoh')!);
      return String(events.find((e) => e.type === 'go')?.data.variant);
    };
    expect(door(15)).not.toBe('recognized');
    expect(door(150)).toBe('recognized');
  });
});
