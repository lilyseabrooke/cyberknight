import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { CHART_RENOWN, anarchyAt, charting, encoreWorth, lawless, march, maybeCharts, mythCandidates, mythOdds, riot, riotAt, stormSolo, downWithPolice } from './myth';
import { addDungeon, childId } from './mapgen';
import { addHeat } from './combat';
import { npdResponse } from './laylow';
import { reactionWeights } from './witness';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { makeItem } from './content/items';
import { always, never } from './testkit';
import { skillXp } from './grade';
import type { Ctx } from './types';

const ctxOf = (w: World, rng: Rng = new Rng('y')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } as Ctx };
};
const keys = (w: World) => mythCandidates(w).map((x) => x.key);

/** On Strand Street with a guitar, a great player, and this many fans on the block. */
function stage(seed: string, fans = 0): World {
  const w = createWorld({ seed });
  w.hero.locationId = 'street_main';
  w.hero.inventory.push(makeItem('vintage_guitar'));
  w.hero.maxHp = w.hero.hp = 500;
  w.hero.skills.guitar = skillXp(80);
  w.locations.street_main!.fans = fans;
  w.situation.weather = 'neon_fog';
  return w;
}

/** An Atlas outpost just down the street. */
const outpost = (w: World) => addDungeon(w, w.locations[childId('street_main', 0)]!, 'outpost', 40, 2);

describe('the myth bar', () => {
  it('is about even for a great player and nearly hopeless for a beginner', () => {
    const w = stage('odds');
    const great = mythOdds(w);
    w.hero.skills.guitar = 2;
    expect(mythOdds(w)).toBeLessThan(0.1);
    expect(great).toBeGreaterThan(0.4);
    expect(great).toBeLessThanOrEqual(0.85);
  });

  it('pays less every time the same legend repeats', () => {
    const w = stage('again', 100);
    w.heat.atlas = 5;
    expect(encoreWorth(w, 'riot')).toBe(1);
    riot(ctxOf(w, always()).c);
    expect(w.legacy.legends?.riot).toBe(1);
    expect(encoreWorth(w, 'riot')).toBeCloseTo(0.6);
    // A riot is once a night; the next night it can happen again, for less.
    delete w.counters.myth_riot;
    w.locations.street_main!.riotUntil = undefined;
    for (const l of Object.values(w.locations)) l.riotUntil = undefined;
    w.heat.atlas = 5;
    expect(keys(w)).toContain('riot');
    riot(ctxOf(w, always()).c);
    expect(encoreWorth(w, 'riot')).toBeCloseTo(0.36);
  });
});

describe('the storm solo', () => {
  it('wants acid rain, somewhere high, and a guitar', () => {
    const w = stage('storm');
    w.hero.locationId = 'overpass';
    expect(keys(w)).not.toContain('storm_solo');
    w.situation.weather = 'acid_rain';
    expect(keys(w)).toContain('storm_solo');
    w.hero.locationId = 'street_main';
    expect(keys(w)).not.toContain('storm_solo');
  });

  it('lands: a blackout, and the nearest outpost\'s machines are fried', () => {
    const w = stage('bolt');
    const door = outpost(w);
    w.situation.weather = 'acid_rain';
    const { c, events } = ctxOf(w, always());
    stormSolo(c);
    expect(w.blackoutUntil).toBeGreaterThan(w.beat);
    const d = w.dungeons[door.id]!;
    expect(d.garrison.map((id) => w.npcs[id]!).filter((n) => n.tags.includes('robot') && n.alive)).toHaveLength(0);
    expect(events.find((e) => e.type === 'storm_solo')).toMatchObject({ outcome: 'good', data: { target: door.name } });
    expect(w.hero.fame).toBeGreaterThan(0);
    expect(keys(w)).not.toContain('storm_solo');
  });

  it('fails: the lightning finds her instead', () => {
    const w = stage('zap');
    const hp = w.hero.hp;
    stormSolo(ctxOf(w, never()).c);
    expect(w.hero.hp).toBeLessThan(hp);
    expect(w.blackoutUntil).toBeLessThanOrEqual(w.beat);
  });
});

describe('the riot', () => {
  it('wants a lot of fans and Atlas nearby', () => {
    const w = stage('wants', 40);
    w.heat.atlas = 5;
    expect(keys(w)).not.toContain('riot');
    w.locations.street_main!.fans = 100;
    expect(keys(w)).toContain('riot');
    w.heat.atlas = 0;
    expect(keys(w)).not.toContain('riot');
  });

  it('lands: the block is hers for the night, Atlas heat is gone, no police come, and the shops are looted', () => {
    const w = stage('boil', 100);
    w.heat.atlas = 6;
    w.heat.npd = 6;
    const shop = Object.values(w.locations).find((l) => (l.kind === 'shop' || l.kind === 'pawn') && w.locations.street_main!.exits.some((e) => e.to === l.id));
    const { c, events } = ctxOf(w, always());
    riot(c);
    expect(riotAt(w, 'street_main')).toBe(true);
    expect(lawless(w, 'street_main')).toBe(true);
    expect(w.heat.atlas).toBe(0);
    expect(npdResponse(c)).toBe(false);
    if (shop) expect(shop.lootedRun).toBe(w.legacy.runs);
    expect(events.find((e) => e.type === 'riot')?.outcome).toBe('good');
    // And it wears off.
    w.clock += 400;
    expect(riotAt(w, 'street_main')).toBe(false);
  });

  it('fails: police heat, and some fans go home', () => {
    const w = stage('fizzle', 100);
    w.heat.atlas = 5;
    riot(ctxOf(w, never()).c);
    expect(w.heat.npd).toBe(2);
    expect(w.locations.street_main!.fans).toBeLessThan(100);
    expect(riotAt(w, 'street_main')).toBe(false);
  });
});

describe('the march', () => {
  it('only after a riot she won, with an outpost in reach; it falls', () => {
    const w = stage('march', 100);
    const door = outpost(w);
    expect(keys(w)).not.toContain('march');
    w.counters.myth_riot_won = 1;
    expect(keys(w)).toContain('march');
    const { c, events } = ctxOf(w, always());
    march(c, door);
    expect(w.dungeons[door.id]!.clearedRun).not.toBeNull();
    expect(events.find((e) => e.type === 'march')?.outcome).toBe('good');
  });

  it('fails: Atlas takes names, and the crowd turns on her', () => {
    const w = stage('routed', 100);
    const door = outpost(w);
    const { c, events } = ctxOf(w, never());
    march(c, door);
    expect(w.heat.atlas).toBeGreaterThanOrEqual(3);
    expect(w.locations.street_main!.fans).toBeLessThan(100);
    const bad = events.find((e) => e.type === 'march');
    expect(bad).toMatchObject({ outcome: 'bad', data: { count: 5 } });
    const mob = Object.values(w.npcs).filter((n) => n.archetype === 'turned_fan');
    expect(mob).toHaveLength(5);
    // And she has to fight her way out of it.
    expect(events.find((e) => e.type === 'fight_start')?.data).toMatchObject({ cause: 'a march gone wrong', count: 5 });
  });
});

describe('down with the police', () => {
  it('wants fans and the police on her', () => {
    const w = stage('wanted', 50);
    expect(keys(w)).not.toContain('down_with_police');
    w.heat.npd = 5;
    expect(keys(w)).toContain('down_with_police');
  });

  it('lands: anarchy on the streets around for a couple of days; no police, no police heat, nobody calls them', () => {
    const w = stage('anarchy', 50);
    w.heat.npd = 5;
    const { c } = ctxOf(w, always());
    downWithPolice(c);
    expect(anarchyAt(w, 'street_main')).toBe(true);
    const near = w.locations.street_main!.exits.map((e) => w.locations[e.to]!).find((l) => l.kind === 'street');
    if (near) expect(anarchyAt(w, near.id)).toBe(true);
    expect(w.heat.npd).toBe(0);
    addHeat(w, 'npd', 3);
    expect(w.heat.npd).toBe(0);
    addHeat(w, 'atlas', 1);
    expect(w.heat.atlas).toBe(1);
    const a = spawnNpc(new Rng('a'), 'a', 'drifter', 'street_main', {});
    const b = spawnNpc(new Rng('b'), 'b', 'drifter', 'street_main', {});
    addNpc(w, a);
    addNpc(w, b);
    expect(reactionWeights(w, a, b).call_cops).toBe(0);
    w.clock += 3 * 24 * 60;
    expect(anarchyAt(w, 'street_main')).toBe(false);
    addHeat(w, 'npd', 3);
    expect(w.heat.npd).toBe(3);
  });

  it('fails: more police heat', () => {
    const w = stage('mumble', 50);
    w.heat.npd = 4;
    downWithPolice(ctxOf(w, never()).c);
    expect(w.heat.npd).toBe(6);
    expect(anarchyAt(w, 'street_main')).toBe(false);
  });
});

describe('it charts', () => {
  it('needs her to be enormous and to have the songs; then the dragons play her for a few nights', () => {
    const w = stage('charts');
    const songs = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, title: `Song ${i}`, kind: 'triumph' as const, quality: 50, run: 0 }));
    const { c, events } = ctxOf(w, always());
    maybeCharts(c, CHART_RENOWN);
    expect(charting(w)).toBe(false);
    w.legacy.songs = songs;
    maybeCharts(c, CHART_RENOWN - 1);
    expect(charting(w)).toBe(false);
    maybeCharts(c, CHART_RENOWN);
    expect(charting(w)).toBe(true);
    expect(events.find((e) => e.type === 'charts')?.data.title).toMatch(/^Song/);
    w.legacy.runs += 4;
    expect(charting(w)).toBe(false);
  });
});

describe('text', () => {
  it('has a line for everything', () => {
    for (const type of ['storm_solo', 'riot', 'march', 'down_with_police']) {
      for (const outcome of ['good', 'bad'] as const) expect(hasTemplate({ beat: 0, type, outcome, data: {} })).toBe(true);
      expect(hasTemplate({ beat: 0, type: 'intent', outcome: 'mixed', data: { variant: type } })).toBe(true);
    }
    expect(hasTemplate({ beat: 0, type: 'charts', outcome: 'good', data: {} })).toBe(true);
    expect(hasTemplate({ beat: 0, type: 'mugging', outcome: 'bad', data: { variant: 'anarchy_gang' } })).toBe(true);
  });
});
