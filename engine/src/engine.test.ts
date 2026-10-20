// The simulation, personalities and text. The sandbox, skills and the graffiti/resources economy live in engine.*.test.ts so they run in parallel.
import { describe, expect, it } from 'vitest';
import { slow } from './testkit';
import { Rng, createRun, step, runToEnd, TEST_BEAT_CAP, render, hasTemplate, rollPersonality, personalityFrom, TRAITS, synergy, skillValue, train, ODDS, heroPower, throwDamage, type World, type GameEvent } from './index';
import { gather } from './interactions';
import { pieceFame, paintCharges, makeCan, graffitiCandidates, FAME_DECAY } from './graffiti';
import { acquire, fight, gainXp } from './combat';
import { wielded, ammoOf, medPacks } from './arms';
import { expireBuffs } from './supply';
import { AMMO } from './content/ammo';
import { STIMS } from './content/stims';
import { MED_PACK_PRICE } from './content/shops';
import { MEDS } from './content/meds';
import { createWorld } from './world';
import { spawnNpc } from './content/archetypes';
import { makeAmmoBox, makeItem } from './content/items';
import { AMMO_IDS } from './content/ammo';
import { addNpc, moveNpc } from './population';

const play = (seed: string, competence = 0.2) => runToEnd({ seed, competence });

describe('rng', () => {
  it('is deterministic and resumable from its position', () => {
    const a = new Rng('neo');
    a.next();
    const b = Rng.fromPosition(a.position);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });
});

describe('personality', () => {
  it('rolls a full vector of clamped traits with derived drive weights', () => {
    const p = rollPersonality(new Rng(7));
    expect(Object.keys(p.traits).sort()).toEqual([...TRAITS].sort());
    for (const t of Object.values(p.traits)) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
    for (const w of Object.values(p.weights)) expect(w).toBeGreaterThanOrEqual(0);
  });

  it('rolls varied people, not a handful of types', () => {
    const fame = new Set<number>();
    for (let i = 0; i < 40; i++) fame.add(rollPersonality(new Rng(`v-${i}`)).traits.fame);
    expect(fame.size).toBeGreaterThan(20);
  });
});

describe('simulation', () => {
  it('same seed gives identical runs', () => {
    expect(play('s1').events).toEqual(play('s1').events);
  });

  it('can be saved (JSON), resumed, and fast-forwarded identically (offline catch-up)', () => {
    const { world, events } = createRun({ seed: 'resume', competence: 0.3 });
    const straight = structuredClone(world);
    const all: GameEvent[] = [...events];
    for (let i = 0; i < 25 && !world.over; i++) all.push(...step(world));
    const restored: World = JSON.parse(JSON.stringify(world));
    const tailA: GameEvent[] = [];
    const tailB: GameEvent[] = [];
    while (!world.over && world.beat < TEST_BEAT_CAP) tailA.push(...step(world));
    while (!restored.over && restored.beat < TEST_BEAT_CAP) tailB.push(...step(restored));
    expect(tailB).toEqual(tailA);
    // and equals a run that never paused
    const whole: GameEvent[] = [];
    while (!straight.over && straight.beat < TEST_BEAT_CAP) whole.push(...step(straight));
    expect([...all.slice(events.length), ...tailA].map((e) => e.type)).toEqual(whole.map((e) => e.type));
  });

  slow('ends with an ending, or is still going when the test cap stops it', () => {
    for (let i = 0; i < 60; i++) {
      const { world } = play(`end-${i}`);
      if (world.ending === null) expect(world.beat).toBeGreaterThanOrEqual(TEST_BEAT_CAP);
    }
  });

  slow('never leaves the hero in an invalid state', () => {
    for (let i = 0; i < 80; i++) {
      const { world } = play(`inv-${i}`, (i % 10) / 10);
      expect(world.locations[world.hero.locationId]).toBeDefined();
      expect(Number.isFinite(world.hero.hp)).toBe(true);
      expect(world.hero.cash).toBeGreaterThanOrEqual(0);
    }
  });

  it('is dense: the opening scene offers dozens of different things to do', () => {
    const { world } = createRun({ seed: 'density' });
    world.hero.locationId = 'halo_floor'; // (the night opens in the quiet lab lot; the bar is where there is the most to do)
    const cands = gather(world);
    const families = new Set(cands.map((c) => c.key.split(':')[0]));
    expect(cands.length).toBeGreaterThan(40);
    expect(families.size).toBeGreaterThanOrEqual(12);
  });

  slow('higher competence survives longer', () => {
    const avg = (c: number) => {
      let n = 0;
      for (let i = 0; i < 70; i++) n += play(`c-${i}`, c).world.beat;
      return n / 70;
    };
    expect(avg(0.7)).toBeGreaterThan(avg(0.05));
  });

  slow('personalities change behavior', () => {
    const share = (traits: Partial<Record<(typeof TRAITS)[number], number>>, type: string) => {
      let hits = 0;
      let total = 0;
      for (let i = 0; i < 70; i++) {
        const p = personalityFrom(traits);
        for (const e of runToEnd({ seed: `p-${i}`, personality: p, competence: 0.15 }).events) {
          total++;
          if (e.type === type) hits++;
        }
      }
      return hits / total;
    };
    const smitten = { impress: 0.95, romantic: 0.9, temper: 0.1 };
    const brawler = { impress: 0.1, romantic: 0.1, temper: 0.95 };
    expect(share(smitten, 'flirt')).toBeGreaterThan(share(brawler, 'flirt'));
    expect(share(brawler, 'challenge')).toBeGreaterThan(share(smitten, 'challenge'));
    expect(share({ drink: 0.95 }, 'order_drink')).toBeGreaterThan(share({ drink: 0.05 }, 'order_drink'));
    expect(share({ gamble: 0.95 }, 'poker')).toBeGreaterThan(share({ gamble: 0.05 }, 'poker'));
  });
});

describe('world memory', () => {
  it('a defeated NPC remembers and keeps a grudge', () => {
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      const { world } = play(`mem-${i}`, 0.3);
      found = Object.values(world.npcs).some((n) => n.alive && n.memories.includes('was beaten by Blackbird') && n.affinity < 0);
    }
    expect(found).toBe(true);
  });
});

describe('text', () => {
  slow('renders every event from many runs without unresolved templates', () => {
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const { world, events } = play(`text-${i}`, (i % 8) / 10);
      const rng = new Rng(`t-${i}`);
      for (const ev of events) {
        for (const l of render(ev, { rng, personality: world.hero.personality, realName: world.hero.realName })) {
          if (/\{\w+\}|undefined|NaN|\[object|^\[\w/.test(l.text)) bad.push(`${ev.type}:${ev.data.variant ?? ''} -> ${l.text}`);
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});
