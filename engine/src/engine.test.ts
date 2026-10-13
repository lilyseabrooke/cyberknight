import { describe, expect, it } from 'vitest';
import { Rng, createRun, step, runToEnd, render, hasTemplate, rollPersonality, ARCHETYPES, type World, type GameEvent } from './index';
import { gather } from './interactions';
import { fight } from './combat';
import { createWorld } from './world';
import { spawnNpc } from './content/archetypes';
import { makeItem } from './content/items';

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
  it('rolls a known archetype with clamped weights', () => {
    const p = rollPersonality(new Rng(7));
    expect(ARCHETYPES.map((a) => a.id)).toContain(p.archetypeId);
    for (const w of Object.values(p.weights)) expect(w).toBeGreaterThanOrEqual(0);
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
    while (!world.over) tailA.push(...step(world));
    while (!restored.over) tailB.push(...step(restored));
    expect(tailB).toEqual(tailA);
    // and equals a run that never paused
    const whole: GameEvent[] = [];
    while (!straight.over) whole.push(...step(straight));
    expect([...all.slice(events.length), ...tailA].map((e) => e.type)).toEqual(whole.map((e) => e.type));
  });

  it('always terminates with an ending', () => {
    for (let i = 0; i < 60; i++) expect(play(`end-${i}`).world.ending).not.toBeNull();
  });

  it('never leaves the hero in an invalid state', () => {
    for (let i = 0; i < 80; i++) {
      const { world } = play(`inv-${i}`, (i % 10) / 10);
      expect(world.locations[world.hero.locationId]).toBeDefined();
      expect(Number.isFinite(world.hero.hp)).toBe(true);
      expect(world.hero.cash).toBeGreaterThanOrEqual(0);
    }
  });

  it('is dense: the opening scene offers dozens of different things to do', () => {
    const { world } = createRun({ seed: 'density' });
    const cands = gather(world);
    const families = new Set(cands.map((c) => c.key.split(':')[0]));
    expect(cands.length).toBeGreaterThan(40);
    expect(families.size).toBeGreaterThanOrEqual(12);
  });

  it('higher competence survives longer', () => {
    const avg = (c: number) => {
      let n = 0;
      for (let i = 0; i < 70; i++) n += play(`c-${i}`, c).world.beat;
      return n / 70;
    };
    expect(avg(0.7)).toBeGreaterThan(avg(0.05));
  });

  it('personalities change behavior', () => {
    const share = (arch: string, type: string) => {
      let hits = 0;
      let total = 0;
      for (let i = 0; i < 70; i++) {
        const rng = new Rng(`p-${arch}-${i}`);
        let p = rollPersonality(rng);
        while (p.archetypeId !== arch) p = rollPersonality(rng);
        for (const e of runToEnd({ seed: `p-${arch}-${i}`, personality: p, competence: 0.15 }).events) {
          total++;
          if (e.type === type) hits++;
        }
      }
      return hits / total;
    };
    expect(share('romantic', 'flirt')).toBeGreaterThan(share('hothead', 'flirt'));
    expect(share('hothead', 'challenge')).toBeGreaterThan(share('romantic', 'challenge'));
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
  it('renders every event from many runs without unresolved templates', () => {
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const { world, events } = play(`text-${i}`, (i % 8) / 10);
      const rng = new Rng(`t-${i}`);
      for (const ev of events) {
        for (const l of render(ev, { rng, archetype: world.hero.personality.archetypeId, realName: world.hero.realName })) {
          if (/\{\w+\}|undefined|NaN|\[object|^\[\w/.test(l.text)) bad.push(`${ev.type}:${ev.data.variant ?? ''} -> ${l.text}`);
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});

describe('deepened sandbox', () => {
  const sweep = (n: number, competence: number, tag: string) => {
    const seen = new Set<string>();
    const worlds: World[] = [];
    for (let i = 0; i < n; i++) {
      const { world, events } = play(`${tag}-${i}`, competence);
      worlds.push(world);
      for (const e of events) seen.add(`${e.type}${e.data.variant !== undefined ? ':' + e.data.variant : ''}`);
    }
    return { seen, worlds };
  };

  it('offers many different ways to get allies, and they show up', () => {
    const { seen } = sweep(120, 0.3, 'ally');
    const sources = ['steal_puppy:success', 'jack:drone', 'jack:scrapper', 'recruit:juno', 'pigeon:befriend', 'rescue:thanks_joins', 'companion_joins'].filter((s) => seen.has(s));
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(seen.has('ally_assist')).toBe(true);
  });

  it('skills level with use, implants install, and fame is earned', () => {
    const { seen, worlds } = sweep(120, 0.3, 'prog');
    expect(seen.has('skill_up')).toBe(true);
    expect(seen.has('implant:install')).toBe(true);
    expect(worlds.some((w) => w.hero.implants.length > 0)).toBe(true);
    expect(worlds.some((w) => w.hero.fame >= 3)).toBe(true);
  });

  it('allies are always valid, capped, and have sane loyalty', () => {
    const { worlds } = sweep(80, 0.4, 'cap');
    for (const w of worlds) {
      expect(w.hero.companions.length).toBeLessThanOrEqual(3);
      for (const a of w.hero.companions) expect(a.loyalty).toBeGreaterThan(-5);
    }
  });

  it('the world has weather, damsels, a tab and a beatbox talk-down, rarely', () => {
    const { seen } = sweep(200, 0.2, 'misc');
    expect(seen.has('weather:acid_rain') || seen.has('weather:neon_fog') || seen.has('weather:heatwave')).toBe(true);
    expect(seen.has('damsel:scene')).toBe(true);
    expect(seen.has('order_drink:tab')).toBe(true);
    expect(seen.has('beatbox:jam') || seen.has('beatbox:laughed')).toBe(true);
  });

  it('every event kind that occurs has a text template', () => {
    for (let i = 0; i < 150; i++) {
      for (const e of play(`tpl-${i}`, (i % 10) / 10).events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
  });

  it('smart, prepared heroes beat the dragon more often than clueless ones', () => {
    const wins = (c: number) => {
      let n = 0;
      for (let i = 0; i < 120; i++) if (play(`dr-${i}`, c).world.ending === 'victory') n++;
      return n;
    };
    expect(wins(0.8)).toBeGreaterThan(wins(0.05));
  });
});

describe('the dragon family', () => {
  /** Controlled fight: a hero of a given build against `n` dragons of `kind`. */
  const duel = (kind: string, n: number, hero: { level: number; weapon: string; armor: string; muscle: number }, trials = 150) => {
    const out: Record<string, number> = {};
    for (let i = 0; i < trials; i++) {
      const w = createWorld({ seed: `duel-${kind}-${i}`, competence: 0.7 });
      const h = w.hero;
      h.level = hero.level;
      h.maxHp = 90 + 12 * (hero.level - 1);
      h.hp = h.maxHp;
      h.muscle = hero.muscle;
      h.weapon = makeItem(hero.weapon);
      h.armor = makeItem(hero.armor);
      h.locationId = 'street_main';
      const rng = new Rng(`duel-${i}`);
      const foes = Array.from({ length: n }, (_, k) => {
        const d = spawnNpc(rng, `d${k}`, kind, 'street_main');
        w.npcs[d.id] = d;
        return d;
      });
      const r = fight({ w, rng, emit() {} }, foes, { cause: 'test', joiners: false });
      out[r] = (out[r] ?? 0) + 1;
    }
    return out;
  };
  const competent = { level: 6, weapon: 'rail_revolver', armor: 'kevlar_duster', muscle: 6 };

  it('Apollo, Artemis and Hera are distinct creatures', () => {
    const rng = new Rng('d');
    const a = spawnNpc(rng, 'a', 'apollo', 'x');
    const t = spawnNpc(rng, 't', 'artemis', 'x');
    const h = spawnNpc(rng, 'h', 'hera', 'x');
    expect(a.role).toContain('Apollo Mk. II');
    expect(t.role).toContain('Artemis Mk. I');
    expect(h.role).toContain('Hera Mk. V');
    expect(t.power).toBeLessThan(a.power);
    expect(a.power).toBeLessThan(h.power);
  });

  it('a competent Blackbird beats a lone Artemis almost every time', () => {
    const r = duel('artemis', 1, competent);
    expect((r.win ?? 0) / 150).toBeGreaterThan(0.9);
  });

  it('Artemis packs are the real danger', () => {
    const one = duel('artemis', 1, competent).win ?? 0;
    const three = duel('artemis', 3, competent).win ?? 0;
    expect(one).toBeGreaterThan(three * 5);
    expect(three / 150).toBeLessThan(0.1);
  });

  it('Hera Mk. V kills anything she could plausibly be at in this sandbox, and a long way past it', () => {
    for (const lvl of [4, 8, 12, 25, 35]) {
      const r = duel('hera', 1, { level: lvl, weapon: 'hiccup', armor: 'corp_plate', muscle: lvl }, 60);
      expect((r.win ?? 0)).toBe(0);
      expect((r.dead ?? 0) / 60).toBeGreaterThan(0.9);
    }
  });

  it('flights actually occur, Hera is rare, and reactions differ by competence', () => {
    let flights = 0;
    let hera = 0;
    let runs = 0;
    const hides = { low: 0, high: 0 };
    for (let i = 0; i < 120; i++) {
      for (const [c, key] of [[0.05, 'low'], [0.9, 'high']] as const) {
        const { events } = play(`fl-${i}`, c);
        runs++;
        for (const e of events) {
          if (e.type === 'dragon_flight') {
            flights++;
            if (e.data.variant === 'hera') hera++;
          }
          if (e.type === 'dragon_hide') hides[key]++;
        }
      }
    }
    expect(flights).toBeGreaterThan(30);
    expect(hera).toBeGreaterThan(0);
    expect(hera).toBeLessThan(flights * 0.25);
    expect(hides.high).toBeGreaterThan(hides.low);
    expect(runs).toBe(240);
  });
});
