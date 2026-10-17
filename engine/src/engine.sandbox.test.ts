import { describe, expect, it } from 'vitest';
import { slow } from './testkit';
import { Rng, createRun, step, runToEnd, render, hasTemplate, rollPersonality, personalityFrom, TRAITS, synergy, skillValue, train, ODDS, heroPower, throwDamage, type World, type GameEvent } from './index';
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

  slow('offers many different ways to get allies, and they show up', () => {
    const { seen } = sweep(120, 0.3, 'ally');
    const sources = ['steal_puppy:success', 'jack:drone', 'jack:scrapper', 'recruit:juno', 'pigeon:befriend', 'rescue:thanks_joins', 'companion_joins'].filter((s) => seen.has(s));
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(seen.has('ally_assist')).toBe(true);
  });

  slow('skills level with use, implants install, and fame is earned', () => {
    const { seen, worlds } = sweep(120, 0.3, 'prog');
    expect(seen.has('skill_up')).toBe(true);
    expect(worlds.some((w) => w.hero.fame >= 3)).toBe(true);
  });

  it('the street doc will install chrome, for a price (not left to luck: it is a rare pick in a short night)', () => {
    let installed = false;
    for (let i = 0; i < 20 && !installed; i++) {
      const w = createWorld({ seed: 'implant', competence: 0.5 });
      w.hero.locationId = 'halo_restroom';
      w.hero.cash = 900;
      const events: GameEvent[] = [];
      const c = { w, rng: new Rng(`chair-${i}`), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) };
      gather(w).find((x) => x.key === 'implant')!.run(c);
      installed = events.some((e) => e.type === 'implant' && e.data.variant === 'install');
      if (installed) expect(w.hero.implants).toHaveLength(1);
    }
    expect(installed).toBe(true);
  });

  slow('allies are always valid, capped, and have sane loyalty', () => {
    const { worlds } = sweep(80, 0.4, 'cap');
    for (const w of worlds) {
      expect(w.hero.companions.length).toBeLessThanOrEqual(3);
      for (const a of w.hero.companions) expect(a.loyalty).toBeGreaterThan(-5);
    }
  });

  slow('the world has weather, damsels, a tab and a beatbox talk-down, rarely', () => {
    const { seen } = sweep(200, 0.2, 'misc');
    expect(seen.has('weather:acid_rain') || seen.has('weather:neon_fog') || seen.has('weather:heatwave')).toBe(true);
    expect(seen.has('damsel:scene')).toBe(true);
    expect(seen.has('order_drink:tab')).toBe(true);
    expect(seen.has('beatbox:jam') || seen.has('beatbox:laughed')).toBe(true);
  });

  slow('every event kind that occurs has a text template', () => {
    for (let i = 0; i < 150; i++) {
      for (const e of play(`tpl-${i}`, (i % 10) / 10).events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
  });

  slow('smart heroes last longer than clueless ones', () => {
    // With real heat and scarce healing, flatlining randos is a losing plan, and nobody reaches the
    // dragon until the AI learns to plan. What competence buys today is staying alive.
    const avgBeats = (c: number) => {
      let n = 0;
      for (let i = 0; i < 100; i++) n += play(`dr-${i}`, c).world.beat;
      return n / 100;
    };
    expect(avgBeats(0.8)).toBeGreaterThan(avgBeats(0.05) * 1.5);
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
      h.ammo = Object.fromEntries(AMMO_IDS.map((t) => [t, 500])); // a loaded build: ammo is tested separately
      h.locationId = 'street_main';
      const rng = new Rng(`duel-${i}`);
      const foes = Array.from({ length: n }, (_, k) => {
        const d = spawnNpc(rng, `d${k}`, kind, 'street_main');
        addNpc(w, d);
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
    // (150 duels on seeded luck: a few points either way is noise, so "almost every time" is anything over 85%.)
    expect((r.win ?? 0) / 150).toBeGreaterThan(0.85);
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

  slow('flights actually occur, Hera is rare, and reactions differ by competence', () => {
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
