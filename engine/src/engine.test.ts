import { describe, expect, it } from 'vitest';
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
  it('renders every event from many runs without unresolved templates', () => {
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

  it('smart heroes last longer than clueless ones', () => {
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

describe('layered skills', () => {
  const hero = (skills: Record<string, number> = {}, stats: Partial<{ charm: number; reflex: number }> = {}) => {
    const w = createWorld({ seed: 'skill-test', competence: 0.5 });
    Object.assign(w.hero.skills, skills);
    Object.assign(w.hero, stats);
    return w;
  };
  // xp -> value: sqrt(xp / 2).  xp 72 -> 6, xp 128 -> 8, xp 18 -> 3.

  it('zero in any factor makes the combined skill zero (zero guitar makes music useless)', () => {
    const w = hero({ music: 128, guitar: 0 });
    expect(synergy(w.hero, ['guitar', 'music'])).toBe(0);
    expect(synergy(w.hero, [['guitar', 1], ['music', 0.6]])).toBe(0);
  });

  it('related skill makes a new skill better than it would have been alone', () => {
    const alone = hero({ music: 0, guitar: 18 }); // guitar 3, no music
    const trained = hero({ music: 128, guitar: 18 }); // guitar 3, music 8
    const aloneVal = skillValue(alone.hero, 'guitar');
    const syn = synergy(trained.hero, ['guitar', 'music']);
    expect(synergy(alone.hero, ['guitar', 'music'])).toBe(0);
    expect(syn).toBeGreaterThan(aloneVal);
    expect(syn).toBeCloseTo(Math.sqrt(3 * 8), 5);
  });

  it('is monotonic in every factor and normalised to the 0..10 scale', () => {
    let last = 0;
    for (const g of [2, 8, 18, 32, 50, 72, 98, 128, 162, 200]) {
      const v = synergy(hero({ guitar: g, music: g }).hero, ['guitar', 'music']);
      expect(v).toBeGreaterThan(last);
      expect(v).toBeLessThanOrEqual(10.01);
      last = v;
    }
  });

  it('stats work as factors too (charm 0 kills a charm-weighted skill)', () => {
    const w = hero({ guitar: 72 }, { charm: 0 });
    expect(synergy(w.hero, ['guitar', 'stat:charm'])).toBe(0);
    w.hero.charm = 6;
    expect(synergy(w.hero, ['guitar', 'stat:charm'])).toBeCloseTo(6, 5);
  });

  it('training spills into related skills (guitar nudges music; pool nudges throwing)', () => {
    const w = hero();
    const c = { w, rng: new Rng('t'), emit: () => {} };
    train(c, 'guitar', 10);
    train(c, 'pool', 10);
    expect(w.hero.skills.guitar).toBe(10);
    expect(w.hero.skills.music).toBeCloseTo(4, 5);
    expect(w.hero.skills.throwing).toBeCloseTo(2, 5);
  });

  it('emits level-up events with a flavorful title at milestones', () => {
    const w = hero();
    const events: GameEvent[] = [];
    const c = { w, rng: new Rng('t'), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: 0, type, outcome, data }) };
    train(c, 'guitar', 4); // level 1: too small to make the log
    expect(events.some((e) => e.type === 'skill_up' && e.data.id === 'guitar')).toBe(false);
    train(c, 'guitar', 16); // level 3: a milestone
    const up = events.find((e) => e.type === 'skill_up' && e.data.id === 'guitar');
    expect(up?.data.title).toBe('can play a whole song, in order');
  });

  it('pool skill raises the chance of winning, seduction needs pool AND romance, and zero guitar means baseline odds', () => {
    const none = hero().hero;
    const good = hero({ pool: 98 }).hero;
    expect(ODDS.pool(good)).toBeGreaterThan(ODDS.pool(none) + 0.15);
    const n = { affinity: 0 } as any;
    const poolOnly = hero({ pool: 98 }).hero;
    const both = hero({ pool: 98, romance: 98 }).hero;
    expect(ODDS.poolDate(both, n)).toBeGreaterThan(ODDS.poolDate(poolOnly, n) + 0.1);
    // all the music in the world, no guitar: exactly the baseline
    const musicOnly = hero({ music: 200 }).hero;
    expect(ODDS.jam(musicOnly)).toBeCloseTo(ODDS.jam(none), 10);
    const guitarWithMusic = hero({ music: 128, guitar: 18 }).hero;
    const guitarAlone = hero({ guitar: 18 }).hero;
    expect(ODDS.jam(guitarWithMusic)).toBeGreaterThan(ODDS.jam(guitarAlone));
  });

  it('a thrown pool cue mostly uses her regular stats, plus a pool bonus', () => {
    const w = createWorld({ seed: 'throw', competence: 0.5 });
    const cue = makeItem('pool_cue');
    const bottle = makeItem('broken_bottle');
    const base = throwDamage(w, cue);
    expect(base).toBeGreaterThan(w.hero.muscle); // regular stats dominate
    w.hero.skills.pool = 98; // value 7
    expect(throwDamage(w, cue)).toBeGreaterThan(base + 8);
    expect(throwDamage(w, bottle)).toBe(throwDamage(createWorld({ seed: 'throw', competence: 0.5 }), bottle)); // pool doesn't help a bottle
  });

  it('weapon skills add power with the right weapon only', () => {
    const w = createWorld({ seed: 'style', competence: 0.5 });
    w.hero.weapon = makeItem('rail_revolver');
    w.hero.ammo = { rails: 50 };
    const p0 = heroPower(w);
    w.hero.skills.marksmanship = 128;
    expect(heroPower(w)).toBeGreaterThan(p0 + 3);
    w.hero.weapon = makeItem('cleaver');
    const melee0 = heroPower(w);
    w.hero.skills.melee = 128;
    expect(heroPower(w)).toBeGreaterThan(melee0 + 3);
  });

  it('is a deep sandbox: the new hobbies all occur', () => {
    const seen = new Set<string>();
    const skills = new Set<string>();
    for (let i = 0; i < 600; i++) {
      // busk is rare for the average hero; let some of the cast be buskers by temperament
      const personality = i % 4 === 0 ? personalityFrom({ fame: 0.95, artistry: 0.95, sociable: 0.9 }) : undefined;
      const { events, world } = runToEnd({ seed: `hob-${i}`, competence: 0.3, personality });
      for (const e of events) seen.add(e.type);
      for (const [k, v] of Object.entries(world.hero.skills)) if (v >= 2) skills.add(k);
    }
    for (const t of ['pool_date', 'darts', 'jam', 'cook', 'tend_bar', 'graffiti', 'paint_shop', 'ask_around', 'parkour', 'throw', 'trick', 'mix', 'busk', 'steal_guitar']) {
      expect(seen.has(t), t).toBe(true);
    }
    expect(skills.size).toBeGreaterThanOrEqual(14);
  });

  it('every new event variant has a template', () => {
    const known: [string, Record<string, string | number | boolean>][] = [
      ['throw', { variant: 'pool_cue', cop: true, skilled: true, dmg: 20, foe: 'Cop' }], ['throw', { variant: 'cocktail_molotov', dmg: 20, foe: 'x' }],
      ['throw', { variant: 'broken_bottle', dmg: 5, foe: 'x' }], ['throw', { variant: 'switchblade', dmg: 5, foe: 'x' }], ['throw', { variant: 'cleaver', dmg: 5, foe: 'x' }],
      ['gig', { variant: 'killer', amount: 1, npc: 'x' }], ['gig', { variant: 'flop', npc: 'x' }],
      ['busk', { variant: 'tips', amount: 1 }], ['busk', { variant: 'stolen' }], ['busk', { variant: 'complaint' }], ['busk', { variant: 'ignored' }],
      ['jam', { variant: 'band', level: 1, npc: 'x' }], ['jam', { variant: 'solo', level: 1 }], ['jam', { variant: 'meh' }], ['jam', { variant: 'smash', npc: 'x' }], ['jam', { variant: 'thrown_out', npc: 'x' }],
      ['steal_guitar', { variant: 'alone' }], ['steal_guitar', { variant: 'band' }], ['steal_guitar', { variant: 'caught', npc: 'x' }],
      ['cook', { variant: 'good', npc: 'x', level: 1 }], ['cook', { variant: 'meh' }], ['cook', { variant: 'fire', npc: 'x' }], ['cook', { variant: 'kicked_out', npc: 'x' }],
      ['serve_dish', { variant: 'swoon', npc: 'x' }], ['serve_dish', { variant: 'polite', npc: 'x' }], ['eat_dish', {}],
      ['tend_bar', { variant: 'pro', amount: 1, npc: 'x' }], ['tend_bar', { variant: 'lucky', amount: 1, npc: 'x' }], ['tend_bar', { variant: 'spill' }], ['tend_bar', { variant: 'complaint', npc: 'x' }],
      ['mix', { variant: 'good', count: 1 }], ['mix', { variant: 'good', count: 2 }], ['mix', { variant: 'fail' }],
      ['graffiti', { variant: 'mural', place: 'x', fame: 1 }], ['graffiti', { variant: 'another', place: 'x', fame: 1, pieces: 2 }], ['graffiti', { variant: 'crowded', place: 'x', fame: 1, pieces: 4 }], ['graffiti', { variant: 'overpaint', place: 'x', fame: 1, pieces: 7 }],
      ['graffiti', { variant: 'over_tag', place: 'x', gang: 'vipers', fame: 1 }], ['graffiti', { variant: 'drone', place: 'x' }], ['graffiti', { variant: 'rude', place: 'x' }], ['spray_empty', {}], ['tag_owner', { npc: 'x', place: 'y' }],
      ['vandal', { variant: 'scene', count: 1 }], ['vandal', { variant: 'scene', count: 2 }], ['vandal', { variant: 'escaped', to: 'x' }], ['vandal', { variant: 'fined', amount: 5 }], ['vandal', { variant: 'cant_pay' }],
      ['gang_hunt', { gang: 'vipers', count: 2, place: 'x', turf: true }], ['gang_hunt', { gang: 'vipers', count: 2, place: 'x', turf: false }],
      ['mural', { variant: 'proud', place: 'x', pieces: 1 }], ['mural', { variant: 'gallery', place: 'x', pieces: 5 }], ['mural', { variant: 'buffed', place: 'x', gang: 'vipers', pieces: 1 }],
      ['paint_shop', { variant: 'buy', cost: 10, npc: 'x' }], ['paint_shop', { variant: 'flirt_win', npc: 'x', count: 2 }], ['paint_shop', { variant: 'flirt_fail', npc: 'x' }], ['paint_shop', { variant: 'threat_win', npc: 'x', count: 3 }], ['paint_shop', { variant: 'threat_fail', npc: 'x' }],
      ['paint_shop', { variant: 'rob_start', npc: 'x' }], ['paint_shop', { variant: 'rob_win', npc: 'x', count: 6 }], ['paint_shop', { variant: 'lift_win', count: 1 }], ['paint_shop', { variant: 'lift_caught', npc: 'x' }], ['paint_shop', { variant: 'unattended', count: 3 }], ['dumpster', { variant: 'paint' }],
      ['parkour', { variant: 'clean' }], ['parkour', { variant: 'loot', item: 'x' }], ['parkour', { variant: 'fall' }],
      ['ask_around', { variant: 'mark', npc: 'x', item: 'y' }], ['ask_around', { variant: 'hatch' }], ['ask_around', { variant: 'staffdoor' }], ['ask_around', { variant: 'dragon' }], ['ask_around', { variant: 'gossip' }], ['ask_around', { variant: 'nothing' }],
      ['trick', { variant: 'good', name: 'x', kind: 'pigeon', trick: 'fetch' }], ['trick', { variant: 'good', name: 'x', kind: 'puppy', trick: 'guard' }], ['trick', { variant: 'good', name: 'x', kind: 'drone', trick: 'sing' }], ['trick', { variant: 'fail', name: 'x', kind: 'drone' }],
      ['pool_date', { variant: 'win', npc: 'x' }], ['pool_date', { variant: 'win_skilled', npc: 'x' }], ['pool_date', { variant: 'outplayed', npc: 'x', amount: 1 }], ['pool_date', { variant: 'scratch', npc: 'x' }],
      ['darts', { variant: 'win', amount: 1 }], ['darts', { variant: 'lose', amount: 1 }], ['darts', { variant: 'stray', npc: 'x', amount: 1 }], ['grab_cue', { npc: 'x' }],
      ['skill_up', { skill: 'guitar', level: 1, title: 'knows three chords', id: 'guitar' }],
    ];
    for (const [type, data] of known) expect(hasTemplate({ beat: 1, type, outcome: 'good', data }), `${type}:${data.variant}`).toBe(true);
  });
});

describe('graffiti ecosystem', () => {
  const at = (loc: string, seed = 'g') => {
    const w = createWorld({ seed, competence: 0.5 });
    w.hero.locationId = loc;
    return w;
  };
  const run = (w: World, key: string, seed: string) => {
    const events: GameEvent[] = [];
    const c = { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) };
    const cand = gather(w).find((x) => x.key === key);
    expect(cand, key).toBeDefined();
    cand!.run(c);
    return events;
  };

  it('tagging needs paint, and paint is used up', () => {
    const w = at('halo_alley');
    expect(graffitiCandidates(w).some((c) => c.key === 'graffiti')).toBe(false);
    makeCan(w.hero, 2);
    expect(paintCharges(w.hero)).toBe(2);
    expect(graffitiCandidates(w).some((c) => c.key === 'graffiti')).toBe(true);
    run(w, 'graffiti', 'a');
    expect(paintCharges(w.hero)).toBe(1);
    run(w, 'graffiti', 'b');
    expect(paintCharges(w.hero)).toBe(0);
    expect(graffitiCandidates(w).some((c) => c.key === 'graffiti')).toBe(false);
  });

  it('has no cooldown: she can tag again immediately, as long as she has paint', () => {
    const w = at('street_main');
    makeCan(w.hero, 5);
    run(w, 'graffiti', 'x1');
    expect(gather(w).some((c) => c.key === 'graffiti')).toBe(true);
    run(w, 'graffiti', 'x2');
    expect(gather(w).some((c) => c.key === 'graffiti')).toBe(true);
  });

  it('fame per piece falls off with each piece already on that spot, and is bounded', () => {
    const w = at('street_main');
    let last = Infinity;
    let sum = 0;
    for (let n = 0; n < 12; n++) {
      const f = pieceFame(w.hero, n);
      expect(f).toBeLessThan(last);
      last = f;
      sum += f;
    }
    expect(sum).toBeLessThan(1 / (1 - FAME_DECAY) + 0.01); // total fame from one wall is capped
    expect(pieceFame(w.hero, 6)).toBeLessThan(pieceFame(w.hero, 0) * 0.1);
  });

  it('a successful piece records itself on the location and pays less the second time', () => {
    const w = at('club_backlot');
    makeCan(w.hero, 5);
    makeCan(w.hero, 5);
    let pieces = 0;
    const gains: number[] = [];
    for (let i = 0; i < 40 && pieces < 3; i++) {
      const before = w.hero.fame;
      const evs = run(w, 'graffiti', `s${i}`);
      const placed = w.locations.club_backlot!.graffiti;
      if (placed > pieces) {
        gains.push(w.hero.fame - before);
        pieces = placed;
      }
      if (w.over) break;
    }
    expect(w.locations.club_backlot!.graffiti).toBeGreaterThanOrEqual(2);
    expect(gains[1]!).toBeLessThan(gains[0]!);
  });

  it('tagging a gang\'s turf angers the gang, and pleases their enemies', () => {
    const w = at('halo_alley');
    const turf = w.locations.halo_alley!.territory!;
    expect(turf).toBe(w.situation.warringGangs[0]);
    const rival = Object.values(w.npcs).find((n) => n.tags.includes('ganger') && n.faction === w.situation.warringGangs[1])!;
    const before = rival.affinity;
    makeCan(w.hero, 5);
    let placed = false;
    for (let i = 0; i < 30 && !placed; i++) {
      run(w, 'graffiti', `t${i}`);
      placed = w.locations.halo_alley!.graffiti > 0;
      if (w.over) break;
    }
    expect(w.heat[turf]).toBeGreaterThanOrEqual(2);
    expect(rival.affinity).toBeGreaterThan(before);
  });

  it('the paint shop offers several ways to get paint', () => {
    const w = at('paint_shop');
    w.hero.cash = 100;
    const keys = gather(w).map((c) => c.key);
    for (const k of ['buy_paint', 'seduce_clerk', 'threaten_clerk', 'rob_paint_shop', 'shoplift_paint']) expect(keys).toContain(k);
    for (const [key, min] of [['buy_paint', 1], ['seduce_clerk', 0], ['threaten_clerk', 0], ['rob_paint_shop', 0], ['shoplift_paint', 0]] as const) {
      let got = 0;
      for (let i = 0; i < 80; i++) {
        const t = at('paint_shop', `shop-${key}-${i}`);
        t.hero.cash = 100;
        run(t, key, `r${i}`);
        got += paintCharges(t.hero);
      }
      expect(got, key).toBeGreaterThan(min * 80 - 1);
    }
  });

  it('stock is finite, but shipments arrive on their own', () => {
    const w = at('paint_shop');
    w.counters.paint_stock = 0;
    expect(gather(w).some((c) => c.key === 'buy_paint')).toBe(false);
    // Shipments are the only way stock goes up; whatever she does with it, some seed must show one.
    let restocked = false;
    for (let s = 0; s < 8 && !restocked; s++) {
      const { world } = createRun({ seed: `restock-${s}`, competence: 0.3 });
      world.counters.paint_stock = 0;
      for (let i = 0; i < 31 && !world.over; i++) step(world);
      restocked = world.counters.paint_stock >= 2;
    }
    expect(restocked).toBe(true);
  });

  it('tempers cool: old grudges fade toward neutral without any timer on her', () => {
    const { world } = createRun({ seed: 'cool', competence: 0.3 });
    const g = Object.values(world.npcs).find((n) => n.id !== 'dutch' && n.locationId === 'helix_lab' && n.alive)!;
    g.affinity = -30;
    for (let i = 0; i < 48 && !world.over; i++) step(world);
    if (!world.over) expect(g.affinity).toBeGreaterThan(-30);
  });

  it('police fine vandals and gangs hunt her in the sim', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      for (const e of play(`grf-${i}`, 0.3).events) seen.add(e.type + (e.type === 'vandal' ? ':' + e.data.variant : ''));
    }
    for (const k of ['graffiti', 'vandal:scene', 'vandal:fined', 'vandal:escaped', 'paint_shop', 'mural']) expect(seen.has(k), k).toBe(true);
  });

  it('gangs she has angered come looking for her outdoors', () => {
    const w = at('street_main', 'hunt');
    const g = w.situation.warringGangs[0];
    w.heat[g] = 6;
    let hunted = false;
    for (let i = 0; i < 80 && !w.over && !hunted; i++) {
      w.heat[g] = 6;
      hunted = step(w).some((e) => e.type === 'gang_hunt');
    }
    expect(hunted).toBe(true);
  });
});

// ====================================================================================================
// Resources and consequences: med packs, ammo, heat from being seen, and gear/stims worth saving for.
// ====================================================================================================
describe('resources and consequences', () => {
  const at = (loc: string, seed = 'rc') => {
    const w = createWorld({ seed, competence: 0.5 });
    w.hero.locationId = loc;
    w.hero.inventory = []; // no starting med packs unless a test gives them
    return w;
  };
  const ctxFor = (w: World, seed = 'ctx') => {
    const events: GameEvent[] = [];
    const c = { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) };
    return { c, events };
  };
  const run = (w: World, key: string, seed = 'k') => {
    const cand = gather(w).find((x) => x.key === key);
    if (!cand) throw new Error(`no candidate ${key} among ${gather(w).map((x) => x.key).join(', ')}`);
    const r = ctxFor(w, seed);
    cand.run(r.c);
    return r.events;
  };
  const keysOf = (w: World) => gather(w).map((c) => c.key);
  /** Clear the room so a test controls exactly who is watching. */
  const empty = (w: World, keep: string[] = []) => {
    for (const n of Object.values(w.npcs)) if (n.locationId === w.hero.locationId && !keep.includes(n.id)) n.locationId = '_gone';
  };
  const mugger = (w: World, id = 'v1') => {
    const n = spawnNpc(new Rng(id), id, 'mugger', w.hero.locationId);
    w.npcs[id] = n;
    return n;
  };

  describe('healing costs something', () => {
    it('has no free heals: no bandage, no passive regen, no level-up refill, no healing food', () => {
      const w = at('halo_floor');
      w.hero.hp = 30;
      expect(keysOf(w)).not.toContain('bandage');
      expect(keysOf(w)).not.toContain('use_med_pack');
      for (let i = 0; i < 40; i++) {
        w.hero.hp = Math.min(w.hero.hp, 30);
        const before = w.hero.hp;
        const evs = step(w);
        if (w.over) break;
        // Being thrown out or arrested after a fight leaves her on a small floor of HP; that is not a heal.
        if (!evs.some((e) => ['use_med_pack', 'get_patched', 'fight_end'].includes(e.type))) expect(w.hero.hp).toBeLessThanOrEqual(before);
      }
      const w2 = at('halo_floor');
      w2.hero.hp = 20;
      gainXp(ctxFor(w2).c, 500);
      expect(w2.hero.hp).toBe(20);
    });

    it('a med pack heals her, cures an injury, and is used up', () => {
      const w = at('street_main');
      w.hero.hp = 25;
      w.hero.injuries = ['broken_leg'];
      w.hero.inventory.push(makeItem('med_pack'));
      const evs = run(w, 'use_med_pack');
      expect(w.hero.hp).toBeGreaterThan(60);
      expect(w.hero.injuries).toHaveLength(0);
      expect(medPacks(w.hero)).toHaveLength(0);
      expect(evs[0]!.type).toBe('use_med_pack');
      expect(keysOf(w)).not.toContain('use_med_pack');
    });

    it('med kits come in tiers that restore a fixed amount, and only the doc does a full restore', () => {
      const heals: Record<string, number> = {};
      for (const id of ['patch_kit', 'med_pack', 'trauma_kit']) {
        const w = at('street_main');
        w.hero.maxHp = 400;
        w.hero.hp = 100;
        w.hero.inventory.push(makeItem(id));
        run(w, 'use_med_pack');
        heals[id] = w.hero.hp - 100;
        expect(w.hero.hp).toBeLessThan(w.hero.maxHp);
      }
      expect(heals.patch_kit).toBeLessThan(heals.med_pack!);
      expect(heals.med_pack).toBeLessThan(heals.trauma_kit!);
      expect(MEDS.patch_kit!.price).toBeLessThan(MEDS.med_pack!.price);
      expect(MEDS.med_pack!.price).toBeLessThan(MEDS.trauma_kit!.price);
    });

    it('she uses the smallest kit that covers the damage, or the biggest she has', () => {
      const w = at('street_main');
      w.hero.maxHp = 400;
      w.hero.hp = 380;
      w.hero.injuries = ['concussion']; // enough to make her reach for a kit
      w.hero.inventory.push(makeItem('trauma_kit'), makeItem('patch_kit'), makeItem('med_pack'));
      run(w, 'use_med_pack');
      expect(w.hero.inventory.map((i) => i.id).sort()).toEqual(['med_pack', 'trauma_kit']);
      const big = at('street_main');
      big.hero.hp = 5;
      big.hero.inventory.push(makeItem('trauma_kit'), makeItem('patch_kit'));
      run(big, 'use_med_pack');
      expect(big.hero.inventory.map((i) => i.id)).toEqual(['patch_kit']);
    });

    it('the chem-mart stocks every tier', () => {
      const w = at('chem_mart');
      w.hero.cash = 500;
      for (const id of ['patch_kit', 'med_pack', 'trauma_kit']) expect(keysOf(w)).toContain(`buy_med:${id}`);
    });

    it('the street doc is the cheaper way back to full health', () => {
      const w = at('halo_restroom');
      w.hero.hp = 12;
      w.hero.cash = 100;
      expect(keysOf(w)).toContain('get_patched');
      for (let i = 0; i < 20; i++) {
        const t = at('halo_restroom', `doc-${i}`);
        t.hero.hp = 12;
        t.hero.cash = 100;
        run(t, 'get_patched', `d${i}`);
        expect(t.hero.hp).toBe(t.hero.maxHp);
        expect(100 - t.hero.cash).toBeLessThan(MED_PACK_PRICE);
      }
    });

    it('the doc wants paying: no cash, no patching', () => {
      const w = at('halo_restroom');
      w.hero.hp = 12;
      w.hero.cash = 5;
      expect(keysOf(w)).not.toContain('get_patched');
    });

    it('the chem-mart sells med packs for money, and only to someone who can pay', () => {
      const w = at('chem_mart');
      w.hero.cash = 200;
      const evs = run(w, 'buy_med:med_pack');
      expect(medPacks(w.hero)).toHaveLength(1);
      expect(w.hero.cash).toBeLessThan(200);
      expect(w.hero.cash).toBeGreaterThan(200 - MED_PACK_PRICE - 1);
      expect(evs[0]!.type).toBe('buy_med_pack');
      const poor = at('chem_mart');
      poor.hero.cash = 3;
      expect(keysOf(poor).filter((k) => k.startsWith('buy_med:'))).toHaveLength(0);
    });

    it('med packs turn up in the world too (cops, gangers, dumpsters)', () => {
      let found = 0;
      for (let i = 0; i < 200; i++) {
        const n = spawnNpc(new Rng(`mp${i}`), 'x', i % 2 ? 'npd_officer' : 'ganger', 'street_main');
        if (n.loadout.some((it) => it.id === 'med_pack')) found++;
      }
      expect(found).toBeGreaterThan(5);
    });
  });

  describe('shooting costs ammo', () => {
    const duelWith = (weapon: string, ammo: Record<string, number>, seed: string) => {
      const w = at('street_main', seed);
      empty(w);
      w.hero.weapon = makeItem(weapon);
      w.hero.ammo = { ...ammo };
      const foe = mugger(w, 'm1');
      const r = ctxFor(w, seed);
      fight(r.c, [foe], { cause: 'test', joiners: false });
      return { w, events: r.events };
    };

    it('every shot spends rounds of the right type', () => {
      const { w, events } = duelWith('zip_pistol', { slugs: 50, cells: 50 }, 'a2');
      const end = events.find((e) => e.type === 'fight_end')!;
      expect(Number(end.data.ammoSpent)).toBeGreaterThan(0);
      expect(w.hero.ammo.slugs).toBeLessThan(50);
      expect(w.hero.ammo.cells).toBe(50); // a pistol does not eat energy cells
    });

    it('different guns burn different ammo', () => {
      for (const [gun, type] of [['riot_shotgun', 'shells'], ['rail_revolver', 'rails'], ['gauss_smg', 'gauss'], ['stunner_mk3', 'cells'], ['pulse_rifle', 'cells']] as const) {
        expect(makeItem(gun).ammoType, gun).toBe(type);
      }
      expect(makeItem('judgment').ammoType).toBeUndefined();
    });

    it('melee weapons need none', () => {
      const { events } = duelWith('cleaver', {}, 'a2');
      expect(Number(events.find((e) => e.type === 'fight_end')!.data.ammoSpent)).toBe(0);
    });

    it('a dry gun is no gun: she falls back to what still works, and says so', () => {
      const w = at('street_main', 'dry');
      w.hero.weapon = makeItem('rail_revolver');
      w.hero.inventory.push(makeItem('excalibur'));
      w.hero.ammo = {};
      expect(wielded(w.hero).id).toBe('excalibur');
      const loaded = heroPower(w);
      w.hero.ammo = { rails: 10 };
      expect(heroPower(w)).toBeGreaterThan(loaded + 5);
      expect(wielded(w.hero).id).toBe('rail_revolver');
      // And with nothing else in her pockets: fists.
      const bare = at('street_main', 'bare');
      bare.hero.weapon = makeItem('rail_revolver');
      expect(wielded(bare.hero).id).toBe('fists');
      empty(bare);
      const foe = mugger(bare, 'm2');
      const r = ctxFor(bare, 'bare');
      fight(r.c, [foe], { cause: 'test', joiners: false });
      const dry = r.events.find((e) => e.type === 'out_of_ammo');
      expect(dry?.data.bare).toBe(true);
    });

    it('running dry mid-fight is announced', () => {
      let announced = 0;
      for (let i = 0; i < 20; i++) {
        const w = at('street_main', `mid${i}`);
        empty(w);
        w.hero.weapon = makeItem('zip_pistol');
        w.hero.inventory.push(makeItem('excalibur'));
        w.hero.ammo = { slugs: 3 };
        const foe = mugger(w, 'm3');
        foe.hp = foe.maxHp = 400;
        foe.power = 1;
        const r = ctxFor(w, `mid${i}`);
        fight(r.c, [foe], { cause: 'test', joiners: false });
        if (r.events.some((e) => e.type === 'out_of_ammo')) announced++;
      }
      expect(announced).toBeGreaterThan(15);
    });

    it('ammo can be found: shooters carry spare rounds, boxes pour into her stock', () => {
      let boxes = 0;
      for (let i = 0; i < 100; i++) {
        const n = spawnNpc(new Rng(`am${i}`), 'x', 'npd_officer', 'street_main');
        const gun = n.loadout.find((it) => it.ammoType);
        const box = n.loadout.find((it) => it.rounds);
        if (box) {
          boxes++;
          expect(box.ammoType).toBe(gun!.ammoType);
        }
      }
      expect(boxes).toBeGreaterThan(40);
      const w = at('street_main');
      acquire(ctxFor(w).c, makeAmmoBox('shells', 6));
      expect(w.hero.ammo.shells).toBe(6);
      expect(w.hero.inventory.some((i) => i.rounds)).toBe(false);
    });

    it('the gun shop sells every ammo type, but she only shops for what her guns eat', () => {
      const w = at('gun_shop');
      w.hero.cash = 1000;
      w.hero.weapon = makeItem('zip_pistol');
      w.hero.inventory.push(makeItem('riot_shotgun'));
      const keys = keysOf(w);
      expect(keys).toContain('buy_ammo:slugs');
      expect(keys).toContain('buy_ammo:shells');
      expect(keys).not.toContain('buy_ammo:rails');
      const evs = run(w, 'buy_ammo:slugs');
      expect(w.hero.ammo.slugs).toBe(AMMO.slugs!.box);
      expect(w.hero.cash).toBeLessThan(1000);
      expect(evs[0]!.data.type).toBe('slugs');
      for (const t of Object.keys(AMMO)) expect(AMMO[t]!.price).toBeGreaterThan(0);
      expect(Object.keys(AMMO).length).toBeGreaterThanOrEqual(5);
    });

    it('a hero with a dry gun is pulled toward the gun shop; a stocked one is not', () => {
      const w = at('street_main');
      w.hero.cash = 200;
      w.hero.weapon = makeItem('zip_pistol');
      w.hero.ammo = {};
      const dry = gather(w).find((c) => c.key === 'go:gun_shop')!;
      w.hero.ammo = { slugs: 100 };
      w.hero.cash = 20; // and nothing to upgrade to
      const stocked = gather(w).find((c) => c.key === 'go:gun_shop')!;
      expect((dry.smart ?? 0) + (dry.bonus ?? 0)).toBeGreaterThan((stocked.smart ?? 0) + (stocked.bonus ?? 0));
    });
  });

  describe('being seen has consequences', () => {
    const assault = (w: World, seed = 'as', opts: { gun?: boolean } = {}) => {
      const foe = mugger(w, 'v9');
      foe.hp = foe.maxHp = 6;
      if (opts.gun) {
        w.hero.weapon = makeItem('zip_pistol');
        w.hero.ammo = { slugs: 50 };
      }
      const r = ctxFor(w, seed);
      fight(r.c, [foe], { cause: 'test', joiners: false, assault: true });
      return r.events;
    };

    it('nobody saw it, nothing happened: no witnesses, no cameras, no heat', () => {
      const w = at('halo_roof');
      empty(w);
      const evs = assault(w);
      expect(evs.find((e) => e.type === 'crime_seen')?.data.variant).toBe('none');
      expect(w.heat.npd).toBe(0);
    });

    it('a camera is enough: it sees, and the police hear', () => {
      const w = at('street_main');
      empty(w);
      const evs = assault(w);
      expect(evs.find((e) => e.type === 'crime_seen')?.data.variant).toBe('camera');
      expect(w.heat.npd).toBeGreaterThanOrEqual(1);
      expect(evs.some((e) => e.type === 'heat_up')).toBe(true);
    });

    it('cameras go dark in a blackout, and the same crime goes unseen', () => {
      const w = at('street_main');
      empty(w);
      w.flags.blackout = true;
      const evs = assault(w);
      expect(evs.find((e) => e.type === 'crime_seen')?.data.variant).toBe('none');
      expect(w.heat.npd).toBe(0);
    });

    it('a person is enough too, and they react', () => {
      const w = at('halo_roof');
      empty(w);
      const pat = spawnNpc(new Rng('p'), 'witness1', 'patron', 'halo_roof');
      w.npcs.witness1 = pat;
      let reacted = 0;
      for (let i = 0; i < 12; i++) {
        const t = at('halo_roof', `p${i}`);
        empty(t);
        t.npcs.witness1 = spawnNpc(new Rng('p'), 'witness1', 'patron', 'halo_roof');
        const evs = assault(t, `p${i}`);
        if (evs.some((e) => e.type === 'bystander')) reacted++;
        if (evs.find((e) => e.type === 'crime_seen')?.data.variant === 'people') expect(t.heat.npd).toBeGreaterThanOrEqual(1);
      }
      expect(reacted).toBeGreaterThan(6);
    });

    it('most reactions are negative: calls, joins, flights and snubs outnumber cheers', () => {
      const tally: Record<string, number> = {};
      for (let i = 0; i < 60; i++) {
        const w = at('halo_floor', `crowd${i}`);
        const evs = assault(w, `crowd${i}`);
        for (const e of evs) if (e.type === 'bystander') tally[String(e.data.variant)] = (tally[String(e.data.variant)] ?? 0) + 1;
      }
      const bad = (tally.call_cops ?? 0) + (tally.intervene ?? 0) + (tally.join ?? 0) + (tally.flee ?? 0) + (tally.shun ?? 0);
      const good = (tally.cheer ?? 0) + (tally.film ?? 0);
      expect(bad).toBeGreaterThan(good);
      expect(Object.keys(tally).length).toBeGreaterThanOrEqual(4); // and they do not all react the same way
    });

    it('a cop who sees it does not look away: he joins the other side and radios it in', () => {
      let joined = 0;
      for (let i = 0; i < 10; i++) {
        const w = at('halo_roof', `cop${i}`);
        empty(w);
        const cop = spawnNpc(new Rng('c'), 'cop1', 'cop', 'halo_roof');
        w.npcs.cop1 = cop;
        const evs = assault(w, `cop${i}`);
        if (evs.some((e) => e.type === 'bystander' && e.data.variant === 'intervene')) joined++;
      }
      expect(joined).toBeGreaterThan(6);
    });

    it('gunfire makes it worse', () => {
      let melee = 0;
      let gun = 0;
      for (let i = 0; i < 20; i++) {
        const a = at('street_main', `g${i}`);
        empty(a);
        assault(a, `g${i}`);
        melee += a.heat.npd!;
        const b = at('street_main', `g${i}`);
        empty(b);
        assault(b, `g${i}`, { gun: true });
        gun += b.heat.npd!;
      }
      expect(gun).toBeGreaterThan(melee);
    });

    it('Atlas premises answer to Atlas, not the police', () => {
      const w = at('helix_lobby');
      empty(w);
      assault(w);
      expect(w.heat.atlas).toBeGreaterThanOrEqual(1);
    });

    it('a fight she did not start is not a crime', () => {
      const w = at('street_main');
      empty(w);
      const foe = mugger(w, 'v8');
      const r = ctxFor(w);
      fight(r.c, [foe], { cause: 'a mugging', joiners: false });
      expect(r.events.some((e) => e.type === 'crime_seen')).toBe(false);
      expect(w.heat.npd).toBe(0);
    });

    it('attacking a robot is not assault', () => {
      const w = at('street_main');
      empty(w);
      const bot = spawnNpc(new Rng('b'), 'bot1', 'drone', 'street_main');
      w.npcs.bot1 = bot;
      const r = ctxFor(w);
      fight(r.c, [bot], { cause: 'test', joiners: false, assault: true });
      expect(r.events.some((e) => e.type === 'crime_seen')).toBe(false);
    });

    it('witnesses remember: the world holds a grudge', () => {
      const w = at('halo_floor', 'grudge');
      assault(w, 'grudge');
      const remembered = Object.values(w.npcs).filter((n) => n.memories.some((m) => m.startsWith('saw Blackbird attack')));
      expect(remembered.length).toBeGreaterThan(0);
    });

    it('being watched in the sim: heat rises from brawls, not just from kills', () => {
      let withHeat = 0;
      for (let i = 0; i < 40; i++) {
        const { world } = play(`wit-${i}`, 0.3);
        if ((world.counters.crimes_seen ?? 0) > 0) withHeat++;
      }
      expect(withHeat).toBeGreaterThan(15);
    });
  });

  describe('gear and stimulants', () => {
    it('the gun shop sells upgrades she can afford, with a box of ammo thrown in', () => {
      const w = at('gun_shop');
      w.hero.cash = 1500;
      const before = w.hero.weapon.power;
      expect(keysOf(w)).toContain('buy_gear:weapon');
      expect(keysOf(w)).toContain('buy_gear:armor');
      const evs = run(w, 'buy_gear:weapon');
      expect(w.hero.weapon.power).toBeGreaterThan(before);
      expect(w.hero.cash).toBeLessThan(1500);
      expect(evs.some((e) => e.type === 'equip')).toBe(true);
      if (w.hero.weapon.ammoType) expect(ammoOf(w.hero, w.hero.weapon.ammoType)).toBeGreaterThan(0);
    });

    it('she cannot buy what she cannot afford, and the shop does not sell downgrades', () => {
      const poor = at('gun_shop');
      poor.hero.cash = 10;
      expect(keysOf(poor).filter((k) => k.startsWith('buy_gear'))).toHaveLength(0);
      const rich = at('gun_shop');
      rich.hero.cash = 5000;
      rich.hero.weapon = makeItem('pulse_rifle');
      rich.hero.armor = makeItem('corp_plate');
      expect(keysOf(rich).filter((k) => k.startsWith('buy_gear'))).toHaveLength(0);
    });

    it('a closed shop sells nothing: the shopkeeper has to be there', () => {
      const w = at('gun_shop');
      w.hero.cash = 1000;
      w.npcs.gunsmith!.downUntil = 999;
      expect(keysOf(w).filter((k) => k.startsWith('buy_'))).toHaveLength(0);
    });

    it('the chem-mart sells several stimulants and each boosts something different', () => {
      const w = at('chem_mart');
      w.hero.cash = 500;
      const stims = keysOf(w).filter((k) => k.startsWith('buy_stim:'));
      expect(stims.length).toBeGreaterThanOrEqual(5);
      const stats = new Set(Object.values(STIMS).map((s) => s.stat ?? 'power'));
      expect(stats.size).toBeGreaterThanOrEqual(5);
    });

    it('a stat stim raises the stat while it lasts and takes it back off when it wears out', () => {
      const w = at('street_main');
      const base = w.hero.muscle;
      w.hero.inventory.push(makeItem('stim_iron'));
      w.hero.cash = 0;
      const evs = run(w, 'use_stim:stim_iron');
      expect(evs[0]!.data.variant).toBe('boost');
      expect(w.hero.muscle).toBe(base + 3);
      const p = heroPower(w);
      w.beat += STIMS.stim_iron!.duration + 1;
      const r = ctxFor(w);
      expireBuffs(r.c);
      expect(w.hero.muscle).toBe(base);
      expect(heroPower(w)).toBeLessThan(p - 2);
      expect(r.events[0]!.type).toBe('stim_fade');
      expect(r.events[0]!.data.variant).toBe('crash');
      expect(w.hero.buffs.some((b) => b.id === 'crash')).toBe(true);
    });

    it('stimulants stack until they hurt', () => {
      let od = 0;
      for (let i = 0; i < 40; i++) {
        const w = at('street_main', `od${i}`);
        for (const id of ['stim', 'stim_iron', 'stim_twitch', 'stim_cortex']) w.hero.inventory.push(makeItem(id));
        run(w, 'use_stim:stim', `a${i}`);
        run(w, 'use_stim:stim_iron', `b${i}`);
        const evs = run(w, 'use_stim:stim_twitch', `c${i}`);
        if (evs[0]!.data.variant === 'overdose') od++;
      }
      expect(od).toBeGreaterThan(10);
      expect(od).toBeLessThan(35); // risky, not certain
    });

    it("the dealer's stims are cheaper but come cut with something", () => {
      let bad = 0;
      for (let i = 0; i < 80; i++) {
        const w = at('halo_floor', `deal${i}`);
        w.hero.cash = 100;
        run(w, 'buy_stims', `dl${i}`);
        const it = w.hero.inventory.find((x) => x.tags.includes('stim'))!;
        expect(it.tags).toContain('cut');
        expect(100 - w.hero.cash).toBeLessThan(STIMS[it.id]!.price);
        const evs = run(w, `use_stim:${it.id}`, `u${i}`);
        if (evs[0]!.data.variant === 'overdose') bad++;
      }
      expect(bad).toBeGreaterThan(5);
      expect(bad).toBeLessThan(40);
    });

    it('in the sim she actually shops: med packs, ammo, gear and stims all get bought', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 80; i++) for (const e of play(`shop-${i}`, 0.9).events) seen.add(`${e.type}${e.data.variant ? ':' + e.data.variant : ''}`);
      for (const k of ['buy_med_pack', 'buy_ammo', 'buy_gear:weapon', 'use_med_pack', 'out_of_ammo', 'crime_seen:camera', 'heat_up:npd', 'bystander:call_cops']) {
        expect(seen.has(k), k).toBe(true);
      }
      expect([...seen].some((k) => k.startsWith('buy_stim'))).toBe(true);
    });
  });

  it('every new event kind has a text template', () => {
    const known: [string, Record<string, string | number | boolean>][] = [
      ['buy_med_pack', { npc: 'x', item: 'med pack', cost: 1, packs: 1 }], ['buy_ammo', { npc: 'x', ammo: 'x', type: 'x', rounds: 1, cost: 1, total: 1 }],
      ['buy_gear', { variant: 'weapon', npc: 'x', item: 'x', cost: 1, starter: '', gun: false }], ['buy_gear', { variant: 'armor', npc: 'x', item: 'x', cost: 1, starter: '', gun: false }],
      ['buy_stim', { variant: 'shop', npc: 'x', item: 'x', cost: 1 }], ['buy_stims', { variant: 'deal', npc: 'x', item: 'x', cost: 1 }],
      ['use_stim', { variant: 'boost', item: 'x', stat: 'muscle', amount: 3, duration: 30 }], ['use_stim', { variant: 'overdose', item: 'x', mixed: true }],
      ['stim_fade', { variant: 'clean', item: 'x' }], ['stim_fade', { variant: 'crash', item: 'x' }],
      ['use_med_pack', { item: 'med pack', heal: 1, cured: '', left: 0 }], ['out_of_ammo', { weapon: 'x', ammo: 'x', fallback: 'x', bare: true }],
      ['crime_seen', { variant: 'none', place: 'x' }], ['crime_seen', { variant: 'camera', place: 'x', cams: 1, witnesses: 0, drone: '', victim: 'x', gun: false }],
      ['crime_seen', { variant: 'people', place: 'x', cams: 0, witnesses: 2, drone: '', victim: 'x', gun: true }], ['crime_seen', { variant: 'both', place: 'x', cams: 1, witnesses: 2, drone: '', victim: 'x', gun: false }],
      ...(['intervene', 'join', 'call_cops', 'flee', 'film', 'cheer', 'shun'] as const).map((v) => ['bystander', { variant: v, npc: 'x', role: 'x', victim: 'x', gang: '' }] as [string, Record<string, string | number | boolean>]),
      ['bystander', { variant: 'crowd', count: 2 }],
      ['heat_up', { variant: 'npd', gain: 1, level: 1, source: 'camera', calls: 0 }], ['heat_up', { variant: 'npd', gain: 1, level: 1, source: 'bodies', calls: 0 }], ['heat_up', { variant: 'atlas', gain: 1, level: 1, source: 'camera', calls: 0 }],
    ];
    for (const [type, data] of known) expect(hasTemplate({ beat: 1, type, outcome: 'good', data }), `${type}:${data.variant}`).toBe(true);
    // None of them render as a bare debug tag.
    const rng = new Rng('render');
    for (const [type, data] of known) {
      const lines = render({ beat: 1, type, outcome: 'good', data }, { rng, personality: personalityFrom({ curiosity: 0.9 }), realName: 'Gary-Ann Fosdyke' });
      expect(lines[0]!.text.startsWith('['), `${type}:${data.variant}`).toBe(false);
      expect(lines[0]!.text).not.toContain('undefined');
    }
  });

  it('same seed, same run: shops, ammo and witnesses are all deterministic', () => {
    const a = play('det-rc', 0.7).events;
    const b = play('det-rc', 0.7).events;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
