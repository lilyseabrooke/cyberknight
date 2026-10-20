import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, rolls, scenario, type Scenario } from './testkit';
import { addDungeon, childId } from './mapgen';
import { arrive } from './candidate';
import { fight, here, relocate } from './combat';
import { dungeonAmbient, standing } from './dungeons';
import { moveThrough } from './moves';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { hasTemplate } from './text';
import { SKILLS } from './content/skills';
import { skillLevel } from './skills';
import { STARS, activeDisguise, canPass, coverEase, coverFor, crewTag, disguiseTick, entranceCrew, holdOdds, shownFame } from './disguise';
import type { Disguise, Location, World } from './types';

/** A dungeon of this kind and tier on a street near the Halo, with Blackbird standing outside its door. */
function door(kind: 'outpost' | 'hideout', tier = 1, seed = `dis-${kind}-${tier}`): { sc: Scenario; w: World; entrance: Location; id: string } {
  const sc = scenario({ seed, at: 'street_main', competence: 0.5 });
  const street = sc.w.locations[childId('street_main', 0)]!;
  const entrance = addDungeon(sc.w, street, kind, 40, tier);
  relocate(sc.w, street.id);
  street.visits = Math.max(1, street.visits);
  return { sc, w: sc.w, entrance, id: entrance.id };
}

/** She has her mind on going in by this door. */
const intend = (w: World, id: string): void => {
  w.mind.goals.push({ id: 1, kind: 'raid', parent: null, loc: id, mode: 'approach', why: 'test', desire: 0.8, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });
};

const face = (over: Partial<Disguise> = {}): Disguise => ({ kind: 'crew', label: 'x', until: 1e9, polish: 0.6, passed: [], fooled: [], ...over });

/** Dressed for the dungeon she is standing outside of. */
function dressed(w: World, id: string, over: Partial<Disguise> = {}): Disguise {
  const crew = entranceCrew(w.locations[id]!)!;
  expect(crew).toBeTruthy();
  const dis = face({ crew, label: 'one of them', ...over });
  w.hero.disguise = dis;
  return dis;
}

describe('acting', () => {
  it('is a social skill that rubs off on grifting, speaking and flirting', () => {
    expect(SKILLS.acting.group).toBe('social');
    expect(Object.keys(SKILLS.acting.spill)).toEqual(expect.arrayContaining(['grifting', 'speaking', 'romance']));
  });

  it('wearing a face wears off with the world clock', () => {
    const { sc, w } = door('hideout');
    w.hero.disguise = face({ until: w.clock + 60 });
    expect(activeDisguise(w)).toBeDefined();
    sc.run((c) => disguiseTick(c));
    expect(w.hero.disguise).toBeDefined();
    w.clock += 61;
    expect(activeDisguise(w)).toBeUndefined();
    const ev = sc.run((c) => disguiseTick(c));
    expect(w.hero.disguise).toBeUndefined();
    expect(ev.some((e) => e.type === 'disguise_end' && e.data.variant === 'wore_off')).toBe(true);
  });
});

describe('passing for a crew at their door', () => {
  it('offers her a face for the door of a hideout, and an outpost, and says whose', () => {
    for (const kind of ['hideout', 'outpost'] as const) {
      const { sc, w, id } = door(kind);
      // (no reason to dress up for a door she isn't going in by: too battered to fancy it)
      w.hero.hp = w.hero.maxHp * 0.3;
      expect(sc.offers()).not.toContain(`don_cover:${id}`);
      intend(w, id);
      expect(sc.offers()).toContain(`don_cover:${id}`);
      sc.do(`don_cover:${id}`, always());
      const dis = w.hero.disguise!;
      expect(dis.kind).toBe('crew');
      expect(dis.crew).toBe(entranceCrew(w.locations[id]!));
      expect(dis.crew).toBe(kind === 'outpost' ? 'atlas' : w.locations[id]!.faction ?? 'ganger');
      // (and once she has it on, she is not offered it again)
      expect(sc.offers()).not.toContain(`don_cover:${id}`);
    }
  });

  it('a room that takes her for one of theirs lets her through, with no alarm and no fight', () => {
    const { sc, w, id } = door('hideout', 2);
    const dis = dressed(w, id);
    const ev = sc.run((c) => arrive(c, id, 'walk'), always());
    expect(ev.some((e) => e.type === 'disguise_pass' && e.data.variant === 'entering')).toBe(true);
    expect(ev.some((e) => e.type === 'dungeon_alarm' || e.type === 'fight_start')).toBe(false);
    expect(w.hero.stealth).toBeFalsy();
    expect(dis.passed).toContain(id);
    expect(standing(w, w.dungeons[id]!, id).length).toBeGreaterThan(0);
    // she has the run of the place, loot included
    expect(sc.offers().some((k) => k.startsWith('raid_loot:') || k.startsWith('raid_ambush:'))).toBe(true);
  });

  it('a room that sees through it raises the alarm, and the face is gone', () => {
    const { sc, w, id } = door('hideout', 2);
    dressed(w, id);
    const ev = sc.run((c) => arrive(c, id, 'walk'), never());
    expect(ev.some((e) => e.type === 'disguise_blown' && e.data.variant === 'garrison')).toBe(true);
    expect(ev.some((e) => e.type === 'dungeon_alarm' && e.data.variant === 'seen')).toBe(true);
    expect(w.hero.disguise).toBeUndefined();
  });

  it('is no use against somebody else\'s crew', () => {
    const { sc, w, id } = door('hideout', 1);
    w.hero.disguise = face({ crew: 'atlas' });
    expect(coverFor(w, w.dungeons[id] ?? { kind: 'hideout', faction: 'ganger' })).toBeUndefined();
    const ev = sc.run((c) => arrive(c, id, 'walk'), always());
    expect(ev.some((e) => e.type === 'disguise_pass' || e.type === 'disguise_blown')).toBe(false);
  });

  it('a better face holds better, and a worse place is harder on it', () => {
    const odds = (tier: number, polish: number): number => {
      const { w, id } = door('hideout', tier, `odds-${tier}-${polish}`);
      relocate(w, id);
      const d = w.dungeons[id]!;
      return holdOdds(w, dressed(w, id, { polish }), d, standing(w, d, id));
    };
    expect(odds(1, 0.8)).toBeGreaterThan(odds(1, 0.4));
    expect(odds(1, 0.6)).toBeGreaterThan(odds(4, 0.6));
  });

  it('standing around inside is a long look now and then, not a certain alarm', () => {
    const { sc, w, id } = door('outpost', 2);
    const dis = dressed(w, id, { polish: 0.95 });
    sc.run((c) => arrive(c, id, 'walk'), always());
    const out = sc.run((c) => {
      for (let i = 0; i < 40 && !w.over; i++) {
        w.beat++;
        dungeonAmbient(c);
      }
    }, always());
    expect(w.dungeons[id]!.aware).not.toContain(id);
    expect(out.some((e) => e.type === 'dungeon_alarm')).toBe(false);
    expect(out.some((e) => e.type === 'disguise_pass' && e.data.variant === 'lingering')).toBe(true);
    expect(dis.polish).toBeLessThan(0.95);
  });

  it('copying one real person is a stronger face, and the real one in the room spoils it', () => {
    const { sc, w, id } = door('hideout', 1);
    for (const n of here(w)) moveNpc(w, n, '_gone');
    const real = spawnNpc(new Rng('real'), 'real_viper', 'gang_runner', w.hero.locationId, { name: 'Real Viper', faction: entranceCrew(w.locations[id]!)! });
    addNpc(w, real);
    expect(sc.offers()).not.toContain(`mimic:${real.id}`);
    intend(w, id);
    expect(sc.offers()).toContain(`mimic:${real.id}`);
    sc.do(`mimic:${real.id}`, always());
    expect(w.hero.disguise).toMatchObject({ kind: 'crew', label: real.name, as: real.id });
    // he turns up in the room she's walking into
    relocate(w, id);
    const room = w.dungeons[id]!.rooms[0]!.id;
    moveNpc(w, real, room);
    const ev = sc.run((c) => arrive(c, room, 'walk'), always());
    expect(ev.some((e) => e.type === 'disguise_blown' && e.data.variant === 'real')).toBe(true);
  });

  it('a fight ends it: nobody stays in character through a brawl', () => {
    const { sc, w } = door('hideout', 1, 'fight');
    w.hero.disguise = face();
    const n = spawnNpc(new Rng('f'), 'f1', 'mugger', w.hero.locationId);
    addNpc(w, n);
    const out = sc.run((c) => void fight(c, [n], { cause: 'a test', joiners: false }));
    expect(w.hero.disguise).toBeUndefined();
    expect(out.some((e) => e.type === 'disguise_end' && e.data.variant === 'fight')).toBe(true);
  });

  it('a fitting face makes a building look like a smaller job than it would otherwise', () => {
    const { w, entrance, id } = door('outpost', 3);
    expect(coverEase(w, entrance)).toBe(1);
    dressed(w, id);
    expect(coverEase(w, entrance)).toBeLessThan(1);
    expect(crewTag({ kind: 'outpost', faction: 'atlas' })).toBe('atlas');
  });
});

describe('doors', () => {
  const guarded = (w: World) => {
    const loc = w.locations[w.hero.locationId]!;
    const e = loc.exits.find((x) => !x.hidden && !x.via)!;
    e.gate = 'guarded';
    return e;
  };

  it('an Atlas agent is waved through a guarded door; a gangster is not', () => {
    const { sc, w } = door('hideout');
    const e = guarded(w);
    expect(canPass(w, 'guarded')).toBe(false);
    w.hero.disguise = face({ crew: 'atlas' });
    expect(canPass(w, 'guarded')).toBe(true);
    const ev = sc.run((c) => moveThrough(c, e), always());
    expect(ev.some((x) => x.type === 'go' && x.data.variant === 'disguised')).toBe(true);
    expect(w.hero.locationId).toBe(e.to);
    w.hero.disguise = face({ crew: 'vipers' });
    expect(canPass(w, 'guarded')).toBe(false);
  });

  it('a face that does not hold at the door is gone, and the door is the ordinary one', () => {
    const { sc, w } = door('hideout');
    const e = guarded(w);
    w.hero.disguise = face({ crew: 'atlas', polish: 0.2 });
    const ev = sc.run((c) => moveThrough(c, e), never());
    expect(ev.some((x) => x.type === 'disguise_blown' && x.data.variant === 'gate')).toBe(true);
    expect(ev.some((x) => x.type === 'go' && x.data.variant === 'disguised')).toBe(false);
    expect(w.hero.disguise).toBeUndefined();
  });

  it('the staff walk through a guarded door and a club door alike', () => {
    const { w } = door('hideout');
    w.hero.disguise = face({ kind: 'role' });
    expect(canPass(w, 'guarded')).toBe(true);
    expect(canPass(w, 'bouncer')).toBe(true);
    expect(canPass(w, 'jump')).toBe(false);
    // (a name on the list is not a lanyard)
    w.hero.disguise = face({ kind: 'star', fame: 7 });
    expect(canPass(w, 'bouncer')).toBe(false);
  });
});

describe('passing for someone famous', () => {
  function crowd(): { sc: Scenario; w: World; girl: ReturnType<typeof spawnNpc> } {
    const sc = scenario({ seed: 'star', at: 'halo_floor' });
    const girl = spawnNpc(new Rng('girl'), 'fan_girl', 'patron', sc.w.hero.locationId, { name: 'Fan Girl', gender: 'woman', age: 28 });
    addNpc(sc.w, girl);
    return { sc, w: sc.w, girl };
  }

  it('is on offer where there are people to impress, and borrows their fame', () => {
    const { sc, w } = crowd();
    expect(sc.offers()).toContain('don_star');
    const before = shownFame(w);
    sc.do('don_star', always());
    const dis = w.hero.disguise!;
    expect(dis.kind).toBe('star');
    expect(STARS.map((s) => s.name)).toContain(dis.label);
    expect(shownFame(w)).toBe(before + dis.fame!);
    expect(w.hero.fame).toBe(before);
    // (the bouncer sees the fame: the face is one he has heard of)
    expect(shownFame(w)).toBeGreaterThanOrEqual(5);
  });

  it('then works on the girls: they like it better than an ordinary flirt', () => {
    const { sc, w, girl } = crowd();
    sc.do('don_star', always());
    expect(sc.offers()).toContain(`star_flirt:${girl.id}`);
    const a0 = girl.affinity;
    const ev = sc.do(`star_flirt:${girl.id}`, always());
    expect(girl.affinity).toBeGreaterThan(a0 + 16); // more than an ordinary flirt gets her
    expect(ev.some((e) => e.type === 'star_flirt' && e.data.variant !== 'cold')).toBe(true);
    expect(w.hero.disguise!.fooled).toContain(girl.id);
    // once is enough
    expect(sc.offers()).not.toContain(`star_flirt:${girl.id}`);
  });

  it('and they mind when it comes apart', () => {
    const { sc, w, girl } = crowd();
    sc.do('don_star', always());
    sc.do(`star_flirt:${girl.id}`, always());
    const happy = girl.affinity;
    const other = spawnNpc(new Rng('other'), 'other_girl', 'patron', w.hero.locationId, { name: 'Other Girl', gender: 'woman', age: 30 });
    addNpc(w, other);
    // the next girl is not fooled
    const ev = sc.do(`star_flirt:${other.id}`, rolls(0.9, 0));
    expect(ev.some((e) => e.type === 'disguise_blown' && e.data.variant === 'star')).toBe(true);
    expect(w.hero.disguise).toBeUndefined();
    expect(girl.affinity).toBe(happy - 12);
    expect(girl.memories.some((m) => m.includes('lied to'))).toBe(true);
  });

  it('a girl who is not convinced is just a cold shoulder', () => {
    const { sc, w, girl } = crowd();
    sc.do('don_star', always());
    const out = sc.do(`star_flirt:${girl.id}`, rolls(0.99, 0.99));
    expect(out.some((e) => e.type === 'star_flirt' && e.data.variant === 'cold')).toBe(true);
    expect(w.hero.disguise).toBeDefined();
  });

  it('is written about: every line has a template', () => {
    const lines: [string, Record<string, string | number | boolean>][] = [
      ['intent', { variant: 'don_cover', crew: 'atlas', gang: '', place: 'x' }], ['intent', { variant: 'don_cover', crew: 'npd', gang: '', place: 'x' }], ['intent', { variant: 'don_cover', crew: 'gang', gang: 'Chrome Vipers', place: 'x' }],
      ['intent', { variant: 'don_staff', place: 'x' }], ['intent', { variant: 'don_star' }], ['intent', { variant: 'mimic', npc: 'x' }], ['intent', { variant: 'star_flirt', npc: 'x', star: 'y' }],
      ...(['crew', 'role', 'star', 'person'] as const).map((variant): [string, Record<string, string | number | boolean>] => ['don', { variant, crew: 'gang', label: 'x', place: 'x', what: 'x', npc: 'x', gang: 'x', look: 'sharp' }]),
      ...(['entering', 'lingering', 'working'] as const).map((variant): [string, Record<string, string | number | boolean>] => ['disguise_pass', { variant, crew: 'gang', label: 'x', place: 'x', foes: 'x', foe: 'x', count: 1 }]),
      ...(['garrison', 'lingering', 'working', 'real', 'gate', 'star'] as const).map((variant): [string, Record<string, string | number | boolean>] => ['disguise_blown', { variant, label: 'x', place: 'x', foe: 'x', real: 'x', npc: 'x' }]),
      ['disguise_end', { variant: 'wore_off', label: 'x' }], ['disguise_end', { variant: 'fight', label: 'x' }],
      ...(['smitten', 'number', 'gift', 'cold'] as const).map((variant): [string, Record<string, string | number | boolean>] => ['star_flirt', { variant, npc: 'x', label: 'x', what: 'x', amount: 5 }]),
      ['go', { variant: 'disguised', kind: 'star', label: 'x', place: 'x' }], ['go', { variant: 'disguised', kind: 'role', label: 'x', place: 'x' }], ['go', { variant: 'disguised', kind: 'crew', label: 'x', place: 'x' }],
      ['order_drink', { variant: 'star', drink: 'x', npc: 'x', label: 'x' }],
    ];
    for (const [type, data] of lines) expect(hasTemplate({ beat: 1, type, outcome: 'good', data }), `${type}:${data.variant}`).toBe(true);
  });

  it('is a skill she can get better at', () => {
    const { w } = crowd();
    expect(skillLevel(w.hero, 'acting')).toBe(0);
  });
});
