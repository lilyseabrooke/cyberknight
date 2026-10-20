import { describe, expect, it } from 'vitest';
import { slow } from './testkit';
import { Rng, createRun, step, runToEnd, render, hasTemplate, rollPersonality, personalityFrom, TEST_BEAT_CAP, TRAITS, synergy, skillValue, train, ODDS, heroPower, throwDamage, type World, type GameEvent, type Item, type Personality } from './index';
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

/** A whole night, like `runToEnd`, but she starts with something extra in her pockets. */
function playWith(seed: string, personality: Personality | undefined, items: Item[]): { world: World; events: GameEvent[] } {
  const { world, events } = createRun({ seed, competence: 0.3, personality });
  world.hero.inventory.push(...items);
  for (let k = 0; k < TEST_BEAT_CAP + 5 && !world.over; k++) events.push(...step(world));
  return { world, events };
}

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

  slow('is a deep sandbox: the new hobbies all occur', () => {
    const seen = new Set<string>();
    const skills = new Set<string>();
    for (let i = 0; i < 600; i++) {
      // busk is rare for the average hero; let some of the cast be buskers by temperament
      const personality = i % 4 === 0 ? personalityFrom({ fame: 0.95, artistry: 0.95, sociable: 0.9 }) : undefined;
      // (busking needs a guitar, and the only way to one is stealing it from the green room, which comes off in about one night in a few hundred: a few of the buskers arrive with one)
      const { events, world } = i % 8 === 0 ? playWith(`hob-${i}`, personality, [makeItem('vintage_guitar')]) : runToEnd({ seed: `hob-${i}`, competence: 0.3, personality });
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
      ['stump_speech', { variant: 'rousing', level: 1 }], ['stump_speech', { variant: 'rousing', level: 10 }], ['stump_speech', { variant: 'crowd', level: 10, count: 3, lead: 3, rest: 0, of: 4, deed: 'tagging a wall', who: 'x and y', kind: 'tag_wall' }], ['stump_speech', { variant: 'crowd', level: 10, count: 40, lead: 6, rest: 34, of: 50, deed: 'tagging a wall', who: 'x and y', kind: 'tag_wall' }], ['stump_speech', { variant: 'crowd', level: 2, count: 1, lead: 1, rest: 0, of: 1, deed: 'passing the hat', who: 'x', kind: 'give_cash' }], ['billboard_speech', { variant: 'crowd', fame: 3, level: 15, count: 3, of: 5, deed: 'having her back', who: 'x and y', kind: 'back_me_up', lead: 6, rest: 20 }], ['speech_joins', { variant: 'drift', count: 1, lead: 1, rest: 0, of: 1, deed: 'passing the hat', who: 'x', kind: 'give_cash', total: 4 }], ['speech_joins', { variant: 'drift', count: 4, lead: 2, rest: 2, of: 4, deed: 'tagging a wall', who: 'x and y', kind: 'tag_wall', total: 9 }], ['buy_loudspeaker', { npc: 'x', cost: 160 }], ['mob_kill', { npc: 'x', target: 'y', crowd: 6, total: 1 }], ['speech_steady', { variant: 'cool', total: 3 }], ['speech_steady', { variant: 'empty', total: 0 }], ['speech_wrap', { variant: 'moved', total: 9, lead: 6, stages: 4 }], ['speech_wrap', { variant: 'quiet', total: 0, lead: 0, stages: 1 }], ['stump_speech', { variant: 'complaint' }], ['stump_speech', { variant: 'heckled' }], ['stump_speech', { variant: 'ignored' }],
      ['rally', { variant: 'great', count: 2, names: 'x and y', name: 'x' }], ['rally', { variant: 'good', count: 1, names: 'x', name: 'x' }], ['rally', { variant: 'flat', count: 1, names: 'x', name: 'x' }], ['rally', { variant: 'flop', count: 1, names: 'x', name: 'x' }],
      ['mirror_speech', { variant: 'rough' }], ['mirror_speech', { variant: 'orator' }], ['mirror_speech', { variant: 'doubt' }],
      ['talk_speech', { variant: 'win', npc: 'x', count: 1, heat: 0 }], ['talk_speech', { variant: 'win', npc: 'x', count: 2, heat: 1 }], ['talk_speech', { variant: 'great', npc: 'x', count: 2, heat: 2 }], ['talk_speech', { variant: 'fail', npc: 'x', count: 2, heat: 0 }],
      ['billboard_speech', { variant: 'speech', fame: 3, level: 15 }], ['billboard_speech', { variant: 'flop' }],
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
