import { describe, expect, it } from 'vitest';
import { step } from './run';
import { createWorld } from './world';
import { MIN_PER_DAY, START_MINUTE, minuteOfDay } from './clock';
import { AWAY, addNpc, allNpcs, everyoneAt, moveNpc, npcsAt, verifyIndex } from './population';
import { beginRun, endRun, joinWorld, newUniverse, splitWorld } from './universe';
import { MemoryStore, deserialize, makeSave, resume, serialize } from './store';
import { placeAt } from './movement';
import { populate } from './roster';
import { render } from './text';
import { spawnNpc } from './content/archetypes';
import { Rng } from './rng';
import type { GameEvent, Location, World } from './types';

const play = (w: World, beats: number): GameEvent[] => {
  const out: GameEvent[] = [];
  for (let i = 0; i < beats && !w.over; i++) out.push(...step(w));
  return out;
};

function newPlace(w: World, id: string, kind: Location['kind']): Location {
  const loc: Location = {
    id, name: id, kind, exits: [{ to: 'street_main', label: 'out', hidden: false, gate: null }], security: 2, crowded: false, outdoors: false,
    tossTo: 'street_main', fleeTo: 'street_main', visits: 0, cameras: 0, graffiti: 0, territory: null,
  };
  w.locations[id] = loc;
  w.locations.street_main!.exits.push({ to: id, label: id, hidden: false, gate: null });
  return loc;
}

describe('world and run, as two things', () => {
  it('every World field belongs to exactly one half', () => {
    const w = createWorld({ seed: 'halves' });
    const { universe, run } = splitWorld(w);
    const { version: _v, ...persistent } = universe;
    for (const k of Object.keys(w)) expect([k in persistent, k in run].filter(Boolean), k).toHaveLength(1);
    expect(joinWorld(universe, run)).toEqual(w);
  });

  it('the people, places and factions are the persistent half; her night is the run', () => {
    const { universe, run } = splitWorld(createWorld({ seed: 'which' }));
    expect(Object.keys(universe).sort()).toEqual(['clock', 'dungeons', 'factions', 'features', 'legacy', 'locations', 'npcs', 'stubs', 'ties', 'version', 'worldSeed']);
    expect(run).toHaveProperty('hero');
    expect(run).toHaveProperty('heat');
    expect(run).not.toHaveProperty('npcs');
  });
});

describe('saving and coming back', () => {
  it('a night saved mid-way and loaded plays out exactly as if it had never stopped', () => {
    const a = beginRun(newUniverse('save-a'), { seed: 'night' });
    const b = beginRun(newUniverse('save-a'), { seed: 'night' });
    play(a, 60);
    play(b, 60);
    const save = deserialize(serialize(makeSave(splitWorld(b).universe, b, 1_000)));
    const loaded = resume(save, 1_000).world!;
    expect(loaded).toEqual(b);
    const rest = play(a, 80).map((e) => `${e.type}:${e.beat}`);
    expect(play(loaded, 80).map((e) => `${e.type}:${e.beat}`)).toEqual(rest);
    expect(loaded.hero.hp).toBe(a.hero.hp);
    expect(verifyIndex(loaded)).toEqual([]);
  }, 60_000);

  it('time away moves the world clock on, at its own pace', () => {
    const u = newUniverse('away');
    const w = beginRun(u);
    const t0 = w.clock;
    const back = resume(makeSave(splitWorld(w).universe, w, 0), 3_600_000);
    expect(back.awayMinutes).toBeGreaterThan(0);
    expect(back.world!.clock).toBe(t0 + back.awayMinutes);
    expect(back.universe.clock).toBe(back.world!.clock);
  });

  it('resumes between runs too, with nothing in progress', async () => {
    const store = new MemoryStore();
    expect(await store.load()).toBeNull();
    const u = newUniverse('between');
    await store.save(makeSave(u, null, 5_000));
    const back = resume((await store.load())!, 5_000 + 600_000);
    expect(back.world).toBeNull();
    expect(back.universe.clock).toBeGreaterThan(START_MINUTE);
    expect(back.universe.npcs.dutch!.name).toBe(u.npcs.dutch!.name);
  });

  it('refuses a save it cannot read rather than guessing', () => {
    expect(() => deserialize('{"nope":1}')).toThrow(/not a Cyberknight save/);
    const save = makeSave(newUniverse('v'), null, 0);
    save.universe.version = 999;
    expect(() => deserialize(serialize(save))).toThrow(/version 999/);
  });
});

describe('the next night in the same world', () => {
  const afterOneNight = () => {
    const u0 = newUniverse('persist');
    const w1 = beginRun(u0, { seed: 'one' });
    play(w1, 150);
    return { w1, u: endRun(w1) };
  };

  it('starts the next evening, as a fresh Blackbird who is still the same person', () => {
    const { w1, u } = afterOneNight();
    const hero1 = w1.hero;
    const w2 = beginRun(u, { seed: 'two' });
    expect(w2.legacy.runs).toBe(2);
    expect(w2.beat).toBe(0);
    expect(minuteOfDay(w2.clock)).toBe(START_MINUTE);
    expect(w2.clock).toBeGreaterThanOrEqual(w1.clock + 6 * 60);
    expect(w2.hero.level).toBe(1);
    expect(w2.hero.cash).toBe(60);
    expect(w2.hero.personality).toEqual(hero1.personality);
    expect(w2.hero.realName).toBe(hero1.realName);
    expect(w2.heat).toEqual({ npd: 0, atlas: 0, halo: 0, club: 0 });
    expect(w2.mind.goals).toEqual([]);
    expect(verifyIndex(w2)).toEqual([]);
  }, 60_000);

  it('keeps the people, what they remember of her, and the dead', () => {
    const u0 = newUniverse('memory');
    const w1 = beginRun(u0, { seed: 'one' });
    const skeeter = w1.npcs.skeeter!;
    skeeter.alive = false;
    const nyx = w1.npcs.nyx!;
    nyx.affinity = 40;
    nyx.memories.push('was kind to Blackbird');
    nyx.hp = 3;
    nyx.hostile = true;
    nyx.downUntil = 99;
    const u = endRun(w1);
    const w2 = beginRun(u, { seed: 'two' });
    expect(w2.npcs.skeeter!.alive).toBe(false);
    expect(w2.npcs.nyx!.affinity).toBe(40);
    expect(w2.npcs.nyx!.memories).toContain('was kind to Blackbird');
    expect(w2.npcs.nyx!.hp).toBe(w2.npcs.nyx!.maxHp);
    expect(w2.npcs.nyx!.hostile).toBe(false);
    expect(w2.npcs.nyx!.downUntil).toBe(0);
    expect(w2.npcs.dutch!.name).toBe(w1.npcs.dutch!.name);
  });

  it('lets go of the people who only existed to be fought, unless she left a mark', () => {
    const u0 = newUniverse('tmp');
    const w1 = beginRun(u0, { seed: 'one' });
    const spare = spawnNpc(new Rng('t'), 'tmp_1_npd_officer_0', 'npd_officer', 'street_main');
    const marked = spawnNpc(new Rng('t2'), 'tmp_2_ganger_0', 'ganger', 'street_main');
    marked.memories.push('was beaten by Blackbird');
    addNpc(w1, spare);
    addNpc(w1, marked);
    const u = endRun(w1);
    expect(u.npcs.tmp_1_npd_officer_0).toBeUndefined();
    expect(u.npcs.tmp_2_ganger_0).toBeDefined();
    expect(verifyIndex(u)).toEqual([]);
  });

  it('sends companions and anyone who left home back, and the nameless free to turn up elsewhere', () => {
    const w1 = beginRun(newUniverse('home'), { seed: 'one' });
    moveNpc(w1, w1.npcs.sprocket!, '_companion');
    moveNpc(w1, w1.npcs.tiny!, 'street_main');
    const stray = spawnNpc(new Rng('s'), 'courier', 'damsel', '_gone');
    addNpc(w1, stray);
    const u = endRun(w1);
    expect(u.npcs.sprocket!.locationId).toBe('halo_floor');
    expect(u.npcs.courier!.locationId).toBe(AWAY);
    const w2 = beginRun(u, { seed: 'two' });
    expect(w2.npcs.tiny!.locationId).toBe('halo_floor'); // the bouncer goes back to work
  });

  it('keeps the map and what was found on it, and forgets only what was a night\'s business', () => {
    const w1 = beginRun(newUniverse('map'), { seed: 'one' });
    const bar = newPlace(w1, 'roadhouse', 'bar');
    populate(w1, bar);
    bar.visits = 7;
    bar.fatigue = { singing: 4 };
    const crowd = everyoneAt(w1, 'roadhouse').map((n) => n.id);
    expect(crowd.length).toBeGreaterThan(0);
    const w2 = beginRun(endRun(w1), { seed: 'two' });
    expect(w2.locations.roadhouse).toBeDefined();
    expect(w2.locations.roadhouse!.visits).toBe(0);
    expect(w2.locations.roadhouse!.fatigue).toBeUndefined();
    expect(w2.locations.roadhouse!.populated).toBe(true);
    expect(everyoneAt(w2, 'roadhouse').map((n) => n.id).sort()).toEqual(crowd.slice().sort());
  });

  it('puts people in the same places in every run: where someone is depends on the world, not the night', () => {
    const u = newUniverse('same');
    const w1 = beginRun(u, { seed: 'one' });
    const bar = newPlace(w1, 'roadhouse', 'bar');
    populate(w1, bar);
    const patron = allNpcs(w1).find((n) => n.archetype === 'patron' && n.id.includes('roadhouse'))!;
    const t = w1.clock + 3 * MIN_PER_DAY;
    const there1 = placeAt(w1, patron, t);
    const w2 = beginRun(endRun(w1), { seed: 'a different night entirely' });
    expect(placeAt(w2, w2.npcs[patron.id]!, t)).toBe(there1);
  });

  it('keeps every night supplied with bounties', () => {
    let w = beginRun(newUniverse('paper'), { seed: 'one' });
    for (let i = 0; i < 3; i++) {
      const paper = allNpcs(w).filter((n) => n.alive && n.bounty);
      expect(paper.some((n) => n.bounty!.hidden)).toBe(true);
      expect(paper.some((n) => !n.bounty!.hidden)).toBe(true);
      for (const n of paper) delete n.bounty; // collected
      w = beginRun(endRun(w), { seed: `n${i}` });
    }
  });

  it('survives several nights in a row without losing track of anybody', () => {
    let w = beginRun(newUniverse('soak'), { seed: 'n0' });
    for (let night = 1; night <= 3; night++) {
      play(w, 120);
      expect(verifyIndex(w)).toEqual([]);
      w = beginRun(endRun(w), { seed: `n${night}` });
      expect(verifyIndex(w)).toEqual([]);
      expect(w.legacy.runs).toBe(night + 1);
    }
    expect(allNpcs(w).filter((n) => n.id.startsWith('tmp_') && !n.memories.length && n.affinity === 0 && !n.bounty && !n.knows)).toHaveLength(0);
  }, 120_000);
});

describe('dying and coming back', () => {
  const dieInTheBar = (seed: string) => {
    const w1 = beginRun(newUniverse(seed), { seed: 'one' });
    const ganger = allNpcs(w1).find((n) => n.archetype === 'ganger' && n.faction && n.locationId === 'halo_floor')!;
    ganger.hostile = true;
    w1.over = true;
    w1.ending = 'dead';
    return { w1, ganger, u: endRun(w1) };
  };

  it('is remembered by the people who saw it, and rumoured among the crews who did it', () => {
    const { u, ganger } = dieInTheBar('death');
    expect(u.legacy.deaths).toHaveLength(1);
    expect(u.legacy.deaths[0]).toMatchObject({ run: 1, locationId: 'halo_floor', killers: [ganger.faction] });
    expect(u.npcs.dutch!.knows).toMatchObject({ died: 1, saw: true });
    expect(u.npcs.dutch!.memories).toContain('saw Blackbird die');
    const crew = allNpcs({ npcs: u.npcs }).filter((n) => n.faction === ganger.faction && !n.knows?.saw);
    expect(crew.every((n) => n.knows === undefined || (n.knows.died === 1 && !n.knows.saw))).toBe(true);
    // Those who weren't there may have heard it from someone who was (Madame Zero is tied to Dutch and Skeeter), but didn't see it;
    // and those nobody who was there cares about have no idea.
    expect(u.npcs.madame!.knows?.saw).toBeUndefined();
    expect(u.npcs.gunsmith!.knows).toBeUndefined();
  });

  it('confuses the ones who know, once, and means nothing to the ones who do not', () => {
    const { u } = dieInTheBar('revenant');
    const w2 = beginRun(u, { seed: 'two' });
    const events = play(w2, 12);
    const reactions = events.filter((e) => e.type === 'revenant');
    expect(reactions).toHaveLength(1);
    const lines = render(reactions[0]!, { rng: new Rng('r'), personality: w2.hero.personality, realName: w2.hero.realName });
    expect(lines.map((l) => l.text).join(' ')).toMatch(/watched her die|heard Blackbird is dead/);
    expect(w2.npcs.dutch!.knows!.reacted).toBe(true);
    expect(events.filter((e) => e.type === 'revenant')).toHaveLength(1);
    const w3 = beginRun(endRun(w2), { seed: 'three' });
    expect(play(w3, 12).filter((e) => e.type === 'revenant')).toHaveLength(0);
  }, 60_000);

  it('does nothing at all if she did not die', () => {
    const w1 = beginRun(newUniverse('alive'), { seed: 'one' });
    w1.over = true;
    w1.ending = 'dawn';
    const u = endRun(w1);
    expect(u.legacy.deaths).toHaveLength(0);
    expect(allNpcs({ npcs: u.npcs }).some((n) => n.knows)).toBe(false);
    expect(npcsAt(beginRun(u), 'halo_floor').length).toBeGreaterThan(5);
  });
});
