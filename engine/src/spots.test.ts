import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { addSpot, childId, expand } from './mapgen';
import { relocate } from './combat';
import { arrive } from './candidate';
import { hasTemplate, render } from './text';
import { verifyIndex } from './population';
import { checkCleared, crewOf, enterRoom, fightRoom, garrisonAlive, knownDungeons, MAX_RICH, regarrison, RICH_PER_BARE, standing } from './dungeons';
import { SPOTS, SPOT_KEYS, hasPaper } from './content/spots';
import { ARCHETYPES } from './content/archetypes';
import { makeItem } from './content/items';
import { cacheValue } from './content/dungeons';
import { genWeapon } from './weapons';
import { deserialize, makeSave, serialize } from './store';
import { runToEnd } from './run';
import { beginRun, endRun, newUniverse } from './universe';
import type { Dungeon, GameEvent, Location, World } from './types';

/** A spot of this kind and tier on a street near the Halo, with Blackbird standing at it. */
function spotAt(key: string, tier: number, seed = `spot-${key}-${tier}`): { sc: Scenario; w: World; entrance: Location; id: string; d: Dungeon } {
  const sc = scenario({ seed, at: 'street_main', competence: 0.5 });
  const street = sc.w.locations[childId('street_main', 0)]!;
  const entrance = addSpot(sc.w, street, key, 60, tier);
  relocate(sc.w, entrance.id);
  return { sc, w: sc.w, entrance, id: entrance.id, d: sc.w.dungeons[entrance.id]! };
}

function mighty(w: World): void {
  const h = w.hero;
  h.level = 14;
  h.maxHp = h.hp = 400;
  h.muscle = 9;
  h.weapon = genWeapon(new Rng('mighty'), { tier: 6.5, cls: 'blade' });
  h.armor = null;
}

const people = (w: World, d: Dungeon) => d.garrison.map((g) => w.npcs[g]!);
const human = (n: { tags: string[] }) => !n.tags.includes('robot');
/** Every tier a spot can be, for walking the whole table. */
const tiersOf = (key: string): number[] => {
  const [lo, hi] = SPOTS[key]!.tiers ?? [1, 4];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
};

describe('the table of spots', () => {
  it('has thirty or so, of every crew', () => {
    expect(SPOT_KEYS.length).toBeGreaterThanOrEqual(30);
    for (const crew of ['gang', 'atlas', 'npd', 'free'] as const) expect(SPOT_KEYS.some((k) => SPOTS[k]!.crew === crew), crew).toBe(true);
  });

  it.each(SPOT_KEYS)('%s is made of things that exist', (key) => {
    const def = SPOTS[key]!;
    expect(def.key).toBe(key);
    expect(def.names.length).toBeGreaterThan(0);
    expect(def.blurbs.length).toBeGreaterThan(0);
    for (const b of def.blurbs) expect(b).toContain('{name}');
    expect(Object.values(def.districts).some((v) => (v ?? 0) > 0)).toBe(true);
    expect(def.setups.length).toBeGreaterThan(0);
    for (const s of def.setups) {
      expect(s.weight).toBeGreaterThan(0);
      expect(s.scene.length).toBeGreaterThan(10);
      for (const slot of s.garrison) expect(ARCHETYPES[slot.arch], slot.arch).toBeDefined();
      if (!s.garrison.length) expect(s.cache, `${key}: an empty spot with nothing in it is nothing`).toBeDefined();
      for (const k of s.cache?.kinds ?? []) expect(cacheValue(k, 2)).toBeGreaterThan(0);
    }
    for (const id of def.extra ?? []) expect(() => makeItem(id), id).not.toThrow();
  });

  it('every spot is built in every tier it can be, with its own people in one room and the index intact', () => {
    for (const key of SPOT_KEYS) {
      for (const tier of tiersOf(key)) {
        const { w, d, entrance, id } = spotAt(key, tier);
        expect(d.kind, key).toBe('spot');
        expect(d.spot).toBe(key);
        expect(d.tier).toBe(tier);
        expect(d.rooms).toHaveLength(1);
        expect(d.rooms[0]!.id).toBe(id);
        expect(entrance.dungeon).toBe(id);
        expect(entrance.kind).toBe('lair');
        expect(entrance.gen).toMatchObject({ role: 'spot', spot: key, tier });
        expect(entrance.blurb).toBeTruthy();
        expect(entrance.blurb).not.toMatch(/\{|undefined/);
        expect(entrance.name).not.toMatch(/\{|undefined/);
        expect(d.scene, key).toBeTruthy();
        expect(d.posted).toBe(d.garrison.length);
        for (const n of people(w, d)) {
          expect(n.post).toBe(id);
          expect(n.locationId).toBe(id);
        }
        expect(w.locations[id]!.hazards).toBeDefined();
        expect(verifyIndex(w), `${key} tier ${tier}`).toEqual([]);
      }
    }
  });

  it('is the same place for the same world', () => {
    const a = spotAt('dealer_den', 2, 'twin');
    const b = spotAt('dealer_den', 2, 'twin');
    expect(b.w.dungeons[b.id]).toEqual(a.w.dungeons[a.id]);
    expect(b.entrance.name).toBe(a.entrance.name);
    expect(people(b.w, b.d).map((n) => [n.name, n.power, n.hp, n.bounty])).toEqual(people(a.w, a.d).map((n) => [n.name, n.power, n.hp, n.bounty]));
  });

  it('a harder one has tougher people in it', () => {
    const power = (tier: number) => {
      const { w, d } = spotAt('stash_flat', tier, `tough-${tier}`);
      return people(w, d).reduce((a, n) => a + n.power * Math.sqrt(n.hp), 0);
    };
    expect(power(4)).toBeGreaterThan(power(1) * 1.5);
  });
});

describe('streets grow them', () => {
  /** Expand a lot of the city and see what turns up. */
  const city = (seed: string, rounds = 5) => {
    const sc = scenario({ seed, at: 'street_main' });
    const w = sc.w;
    for (let r = 0; r < rounds; r++) {
      for (const l of Object.values(w.locations)) if (l.gen?.role === 'street' && !l.gen.expanded) expand(w, l);
    }
    return Object.values(w.locations).filter((l) => l.gen?.role === 'spot');
  };

  it('a good many streets have one, of a good many kinds, in the right sort of district', () => {
    const spots = city('grown');
    expect(spots.length).toBeGreaterThan(12);
    expect(new Set(spots.map((l) => l.gen!.spot)).size).toBeGreaterThanOrEqual(10);
    for (const l of spots) {
      const def = SPOTS[l.gen!.spot!]!;
      expect(def, l.id).toBeDefined();
      expect(def.districts[l.gen!.district] ?? 0, `${def.key} in ${l.gen!.district}`).toBeGreaterThan(0);
      expect(l.dungeon).toBe(l.id);
      const [lo, hi] = def.tiers ?? [1, 4];
      expect(l.gen!.tier!).toBeGreaterThanOrEqual(lo);
      expect(l.gen!.tier!).toBeLessThanOrEqual(hi);
      expect(l.exits.some((e) => e.to === l.gen!.parent)).toBe(true);
    }
  });

  it('is the same city however it is found, and adding them did not move anything else', () => {
    expect(city('grown-2').map((l) => [l.id, l.gen!.spot, l.name])).toEqual(city('grown-2').map((l) => [l.id, l.gen!.spot, l.name]));
    const sc = scenario({ seed: 'unmoved', at: 'street_main' });
    for (const l of Object.values(sc.w.locations)) if (l.gen?.role === 'street') expand(sc.w, l);
    const others = Object.values(sc.w.locations).filter((l) => l.gen && l.gen.role !== 'spot');
    // the slot numbers of everything that is not a spot are as they were: spots come last on a street
    for (const l of others) expect(l.id).toMatch(/^[a-z_]+(~\d+(\.\d+)*)$/);
    const streets = others.filter((l) => l.gen!.role === 'street' && l.gen!.expanded);
    for (const s of streets) {
      const kids = s.exits.map((e) => sc.w.locations[e.to]!).filter((k) => k.gen?.parent === s.id);
      const lastNonSpot = Math.max(...kids.filter((k) => k.gen!.role !== 'spot').map((k) => k.gen!.slot));
      for (const k of kids.filter((x) => x.gen!.role === 'spot')) expect(k.gen!.slot, k.id).toBeGreaterThan(lastNonSpot);
    }
  });

  it('she hears of them once she has been down their street', () => {
    const sc = scenario({ seed: 'leads', at: 'street_main' });
    const street = sc.w.locations[childId('street_main', 0)]!;
    const e = addSpot(sc.w, street, 'dealer_den', 61, 1);
    street.visits = 1;
    mighty(sc.w);
    const lead = knownDungeons(sc.w).find((l) => l.entrance.id === e.id);
    expect(lead).toBeDefined();
    expect(lead!.kind).toBe('spot');
    expect(lead!.appeal).toBeGreaterThan(0);
  });
});

describe('paper', () => {
  const seeds = ['a', 'b', 'c', 'd', 'e'];

  it('everyone who is minding a gang spot has a bounty on them, and every robot has none', () => {
    let seen = 0;
    for (const key of SPOT_KEYS.filter((k) => hasPaper(SPOTS[k]!.crew))) {
      for (const tier of tiersOf(key)) {
        for (const seed of seeds) {
          const { w, d } = spotAt(key, tier, `paper-${key}-${tier}-${seed}`);
          const clean = SPOTS[key]!.setups.flatMap((s) => s.garrison.filter((g) => g.clean).map((g) => g.arch));
          for (const n of people(w, d)) {
            if (!human(n)) {
              expect(n.bounty, `${key}: ${n.name}`).toBeUndefined();
            } else if (clean.includes(n.archetype)) {
              expect(n.bounty, `${key}: ${n.name} is hired and has none`).toBeUndefined();
            } else {
              expect(n.bounty, `${key}: ${n.name} (${n.role})`).toBeDefined();
              expect(n.bounty!.amount).toBeGreaterThan(0);
              seen++;
            }
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(100);
  });

  it('most of the paper is posted where her optics can read it, and some is not', () => {
    let hidden = 0;
    let posted = 0;
    for (let i = 0; i < 40; i++) {
      const { w, d } = spotAt('stash_flat', 2, `hid-${i}`);
      for (const n of people(w, d)) if (n.bounty) (n.bounty.hidden ? hidden++ : posted++);
    }
    expect(posted).toBeGreaterThan(hidden * 2);
    expect(hidden).toBeGreaterThan(0);
  });

  it('nobody at an Atlas or police spot has any, because their people do not carry NPD paper', () => {
    let humans = 0;
    for (const key of SPOT_KEYS.filter((k) => !hasPaper(SPOTS[k]!.crew))) {
      for (const tier of tiersOf(key)) {
        const { w, d } = spotAt(key, tier);
        for (const n of people(w, d)) {
          expect(n.bounty, `${key}: ${n.name}`).toBeUndefined();
          if (human(n)) humans++;
        }
      }
    }
    expect(humans).toBeGreaterThan(20);
  });

  it('paper is paid out when she wins, the same as anyone else\'s', () => {
    const { sc, w, d, id } = spotAt('stash_flat', 2, 'paid');
    mighty(w);
    const paper = people(w, d).filter((n) => n.bounty).map((n) => n.bounty!.amount);
    expect(paper.length).toBeGreaterThan(0);
    const before = w.hero.cash;
    const ev = sc.run((c) => fightRoom(c, d, w.locations[id]!, false), always());
    const paid = ev.filter((e) => e.type === 'bounty_paid');
    expect(paid.length).toBeGreaterThan(0);
    expect(w.hero.cash - before).toBeGreaterThanOrEqual(paid.reduce((a, e) => a + Number(e.data.amount), 0));
  });
});

describe('what a person with no paper is worth', () => {
  /** How rich the cache of this spot is, over several seeds, with how many of its people have no paper. */
  const richness = (key: string, tier: number, seed: string) => {
    const { w, d } = spotAt(key, tier, seed);
    const bare = people(w, d).filter((n) => human(n) && !n.bounty).length;
    return { bare, rich: d.rooms[0]!.cache?.rich, cache: d.rooms[0]!.cache };
  };

  it('keeps what they mind richer: each one adds about a third, up to a point', () => {
    let checked = 0;
    for (const key of ['checkpoint_squeeze', 'evidence_van', 'corrupt_cop', 'courier_ambush']) {
      for (let i = 0; i < 6; i++) {
        const r = richness(key, 3, `rich-${key}-${i}`);
        if (!r.cache) continue;
        expect(r.bare, key).toBeGreaterThan(0);
        expect(r.rich, key).toBeCloseTo(Math.min(MAX_RICH, 1 + RICH_PER_BARE * r.bare), 1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('is the same cache, only richer, as the same place with a bounty on everyone would have', () => {
    // A cash box at a gang spot, against one at a police spot at the same tier: the second is the same sort of box.
    const ordinary = richness('dealer_den', 2, 'cmp-1');
    expect(ordinary.rich).toBeUndefined();
    const guarded = richness('corrupt_cop', 2, 'cmp-2');
    expect(guarded.rich).toBeGreaterThan(1);
    expect(guarded.cache!.value).toBeGreaterThan(cacheValue('cash', 2) * 1.05);
  });

  it('a robot is nobody: a place kept by machines is worth the usual, and so is one where every person has paper', () => {
    for (const key of ['feral_nest', 'relay_box', 'dumpster_cache', 'dead_drop']) {
      for (let i = 0; i < 6; i++) {
        const { w, d } = spotAt(key, 2, `plain-${key}-${i}`);
        const bare = people(w, d).filter((n) => human(n) && !n.bounty).length;
        if (bare === 0) expect(d.rooms[0]!.cache?.rich, key).toBeUndefined();
      }
    }
  });

  it('a hired hand in a gang spot is the exception that makes it richer', () => {
    // The broker at a swap meet is hired in, so he has no paper, and what the meet keeps is worth more for him.
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      const { w, d } = spotAt('swap_meet', 3, `broker-${i}`);
      const broker = people(w, d).find((n) => n.archetype === 'fixer');
      if (!broker) continue;
      found = true;
      expect(broker.bounty).toBeUndefined();
      expect(people(w, d).filter((n) => n.archetype === 'gang_runner').every((n) => n.bounty)).toBe(true);
      expect(d.rooms[0]!.cache!.rich).toBeGreaterThan(1);
    }
    expect(found).toBe(true);
  });

  it('the people with none carry more on them, too', () => {
    const cash = (key: string) => {
      let total = 0;
      let n = 0;
      for (let i = 0; i < 20; i++) {
        const { w, d } = spotAt(key, 2, `carry-${key}-${i}`);
        for (const p of people(w, d).filter((x) => x.archetype === 'atlas_trooper' || x.archetype === 'gang_runner')) {
          total += p.cash;
          n++;
        }
      }
      return total / n;
    };
    // a trooper is paid more than a runner anyway; the point is that it shows up at all
    expect(cash('checkpoint_squeeze')).toBeGreaterThan(cash('stash_flat'));
  });
});

describe('being there', () => {
  /** The first seed that gives this spot a garrison, or none. */
  const dealt = (key: string, tier: number, guarded: boolean) => {
    for (let i = 0; i < 80; i++) {
      const s = spotAt(key, tier, `deal-${key}-${i}`);
      if ((s.d.posted! > 0) === guarded) return s;
    }
    throw new Error(`no ${guarded ? 'guarded' : 'unguarded'} ${key} in 80 tries`);
  };

  it('an unguarded drop is just a bag lying there: she walks up, takes it, and it is done', () => {
    const { sc, w, d, id } = dealt('dead_drop', 1, false);
    w.hero.locationId = id;
    const ev = sc.run((c) => enterRoom(c, w.locations[id]!), never());
    expect(ev.some((e) => e.type === 'dungeon_quiet')).toBe(true);
    expect(ev.some((e) => e.type === 'dungeon_alarm')).toBe(false);
    // it is not "cleared" while the bag is still there
    sc.run((c) => checkCleared(c, d));
    expect(d.clearedRun).toBeNull();
    const cash = w.hero.cash;
    const key = `raid_loot:${id}`;
    expect(sc.offers()).toContain(key);
    sc.do(key, always());
    expect(w.hero.cash).toBeGreaterThan(cash);
    // and then it is, quietly: no xp, no fame, no heat, nobody's grudge
    const xp = w.hero.xp;
    const fame = w.hero.fame;
    const heat = { ...w.heat };
    const ev2 = sc.run((c) => checkCleared(c, d));
    const cleared = ev2.find((e) => e.type === 'dungeon_cleared');
    expect(cleared?.data.quiet).toBe(true);
    expect(w.hero.xp).toBe(xp);
    expect(w.hero.fame).toBe(fame);
    expect(w.heat).toEqual(heat);
  });

  it('a guarded one is a fight, and a real clear pays xp', () => {
    const { sc, w, d, id } = dealt('dead_drop', 2, true);
    mighty(w);
    const xp = w.hero.xp;
    sc.run((c) => fightRoom(c, d, w.locations[id]!, false), always());
    expect(garrisonAlive(w, d)).toHaveLength(0);
    sc.run((c) => checkCleared(c, d));
    expect(d.clearedRun).toBe(w.legacy.runs);
    expect(w.hero.xp).toBeGreaterThan(xp);
    expect(sc.events.find((e) => e.type === 'dungeon_cleared')?.data.quiet).toBe(false);
  });

  it('people who have not seen her can be ambushed, or she can rob the place under their noses', () => {
    const { sc, w, d, id } = dealt('stash_flat', 1, true);
    w.hero.locationId = id;
    sc.run((c) => enterRoom(c, w.locations[id]!), never());
    expect(standing(w, d, id).length).toBeGreaterThan(0);
    expect(sc.saw('dungeon_unseen')).toBe(true);
    expect(sc.offers()).toContain(`raid_ambush:${id}`);
    expect(sc.offers()).toContain(`raid_loot:${id}`);
  });

  it('it fills up again after a run or two, with new people and maybe a different night', () => {
    const { sc, w, d, id } = dealt('dead_drop', 2, true);
    mighty(w);
    sc.run((c) => fightRoom(c, d, w.locations[id]!, false), always());
    sc.run((c) => checkCleared(c, d));
    const first = d.garrison.slice();
    expect(d.returnsRun! - d.clearedRun!).toBeGreaterThanOrEqual(1);
    expect(d.returnsRun! - d.clearedRun!).toBeLessThanOrEqual(2);
    w.legacy.runs = d.returnsRun!;
    regarrison(w, d);
    expect(d.occupation).toBe(2);
    expect(d.clearedRun).toBeNull();
    expect(d.scene).toBeTruthy();
    expect(d.posted).toBe(d.garrison.length);
    expect(d.garrison.some((g) => first.includes(g))).toBe(false);
    expect(d.rooms[0]!.cache === undefined || d.rooms[0]!.cache.taken === false).toBe(true);
    expect(verifyIndex(w)).toEqual([]);
  });

  it('over a few nights the same drop is guarded some nights and not others', () => {
    const { w, d } = spotAt('dead_drop', 2, 'nights');
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      seen.add(d.scene!);
      d.clearedRun = 1;
      d.returnsRun = 1;
      regarrison(w, d);
    }
    expect(seen.size).toBe(SPOTS.dead_drop!.setups.length);
  });

  it('a spot kept by Atlas draws Atlas heat when it goes loud, and one kept by the police draws theirs', () => {
    for (const [key, faction] of [['checkpoint_squeeze', 'atlas'], ['evidence_van', 'npd']] as const) {
      const { sc, w, id } = spotAt(key, 2, `heat-${key}`);
      w.hero.locationId = id;
      const before = w.heat[faction] ?? 0;
      sc.run((c) => enterRoom(c, w.locations[id]!), always());
      expect(w.heat[faction] ?? 0, key).toBeGreaterThan(before);
    }
  });

  it('a gang spot does not stir up Atlas or the police, but the crew remembers it', () => {
    const { sc, w, d, id } = spotAt('stash_flat', 1, 'grudge');
    mighty(w);
    const heat = { ...w.heat };
    const kin = Object.values(w.npcs).filter((n) => n.alive && !n.post && n.faction === d.faction);
    const affinity = kin.map((n) => n.affinity);
    sc.run((c) => fightRoom(c, d, w.locations[id]!, false), always());
    sc.run((c) => checkCleared(c, d));
    expect(d.clearedRun).not.toBeNull();
    expect(w.heat.atlas ?? 0).toBe(heat.atlas ?? 0);
    kin.forEach((n, i) => expect(n.affinity).toBeLessThanOrEqual(affinity[i]!));
  });

  it('whose it is: crews are what the table says', () => {
    for (const key of SPOT_KEYS) {
      const { d } = spotAt(key, tiersOf(key)[0]!);
      expect(crewOf(d), key).toBe(SPOTS[key]!.crew);
    }
  });

  it('she walks in on her own, and takes it on as a raid', () => {
    const { sc, w, id } = spotAt('dealer_den', 1, 'raiding');
    w.hero.locationId = 'street_main';
    sc.run((c) => arrive(c, id, 'walk'), never());
    expect(w.mind.goals.find((g) => g.kind === 'raid')).toMatchObject({ loc: id, mode: 'raid' });
  });
});

describe('the words', () => {
  it('every spot event has a line in every crew\'s voice, with no holes in it', () => {
    const rng = new Rng('spot-words');
    const personality = scenario().w.hero.personality;
    const data = { kind: 'spot', dungeon: 'spot', place: 'the Chrome Vipers\' dead drop', site: 'the Chrome Vipers\' dead drop', foes: '2 gang runners', count: 2, pulled: 0, what: 'a cash box', amount: 100, item: 'a thing', haul: 90, goal: 'raid the drop', tier: 2, runs: 1, scene: 'A runner is minding the bag.', quiet: false };
    const want: [string, string | undefined][] = [
      ['dungeon_alarm', 'seen'], ['dungeon_alarm', 'lingered'], ['dungeon_alarm', 'tripped'], ['dungeon_ambush', 'ambush'], ['dungeon_wave', undefined],
      ['dungeon_unseen', undefined], ['dungeon_quiet', undefined], ['dungeon_cleared', undefined],
      ...['raid_idea', 'idle_raid', 'raid_cash', 'wandered_in'].map((v): [string, string] => ['goal_new', v]),
      ['goal_note', 'raid_in'], ['goal_note', 'raid_clear'], ['goal_note', 'raid_out'], ['goal_done', 'cleared'], ['goal_done', 'spoils'], ['goal_drop', 'outmatched'],
    ];
    for (const crew of ['gang', 'atlas', 'npd', 'free']) {
      for (const quiet of [false, true]) {
        for (const [type, variant] of want) {
          const ev: GameEvent = { beat: 1, type, outcome: 'mixed', data: { ...data, crew, quiet, ...(variant ? { variant } : {}) } as never };
          expect(hasTemplate(ev), `${type}:${variant}`).toBe(true);
          const lines = render(ev, { rng, personality, realName: 'Brenda Pilchard' });
          expect(lines.length, `${type}:${variant}`).toBeGreaterThan(0);
          for (const l of lines) expect(l.text, `${type}:${variant} (${crew})`).not.toMatch(/^\[|\{\w+\}|undefined|NaN|\[object/);
        }
      }
    }
  });

  it('the spot lines are about spots, not about outposts or hideouts', () => {
    const rng = new Rng('spot-voice');
    const personality = scenario().w.hero.personality;
    const base = { place: 'the drop', site: 'the drop', foes: 'a runner', count: 1, scene: 'A runner is minding the bag.', tier: 1, crew: 'gang', goal: 'raid the drop', quiet: false };
    for (const [type, variant] of [['dungeon_alarm', 'seen'], ['dungeon_unseen', undefined], ['dungeon_cleared', undefined], ['goal_note', 'raid_in']] as const) {
      const ev: GameEvent = { beat: 1, type, outcome: 'mixed', data: { ...base, kind: 'spot', dungeon: 'spot', ...(variant ? { variant } : {}) } as never };
      for (let i = 0; i < 6; i++) {
        for (const l of render(ev, { rng, personality, realName: 'Brenda Pilchard' })) expect(l.text).not.toMatch(/garrison|building|hideout|outpost|speakers|music/i);
      }
    }
  });
});

describe('saves and nights', () => {
  it('survive a save: the spot, its scene, its paper and what she took', () => {
    const u = newUniverse('keep-spot');
    const w = beginRun(u, { competence: 0.5 });
    const e = addSpot(w, w.locations[childId('street_main', 0)]!, 'stash_flat', 60, 2);
    relocate(w, e.id);
    const d = w.dungeons[e.id]!;
    const [first] = garrisonAlive(w, d);
    first!.alive = false;
    const back = deserialize(serialize(makeSave(endRun(w), null, 1))).universe;
    expect(back.dungeons[e.id]).toEqual(d);
    expect(back.dungeons[e.id]!.spot).toBe('stash_flat');
    expect(back.dungeons[e.id]!.scene).toBe(d.scene);
    expect(back.npcs[first!.id]!.alive).toBe(false);
    expect(back.npcs[first!.id]!.bounty).toEqual(first!.bounty);
    expect(back.locations[e.id]!.gen!.spot).toBe('stash_flat');
  });

  it('whole nights in a city full of them: she finds them, works them for money, and the world holds together', () => {
    let raids = 0;
    let cleared = 0;
    let paid = 0;
    // (A spot is cleared in about one night in three, so four nights could miss; eight don't.)
    for (const seed of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']) {
      const { world: w, events } = runToEnd({ seed: `spot-night-${seed}`, competence: 0.5 });
      raids += events.filter((e) => e.type === 'goal_new' && e.data.dungeon === 'spot' && /^raid /.test(String(e.data.goal))).length;
      cleared += events.filter((e) => e.type === 'dungeon_cleared' && e.data.kind === 'spot').length;
      paid += events.filter((e) => e.type === 'bounty_paid').length;
      expect(verifyIndex(w)).toEqual([]);
      for (const d of Object.values(w.dungeons)) {
        expect(d.tier).toBeGreaterThanOrEqual(1);
        for (const g of d.garrison) expect(w.npcs[g], g).toBeDefined();
      }
    }
    expect(raids).toBeGreaterThan(0);
    expect(cleared).toBeGreaterThan(0);
    expect(paid).toBeGreaterThan(0);
  }, 120_000);

  it('and the same spot is there to work again on later nights', () => {
    let u = newUniverse('again');
    const w0 = beginRun(u, { competence: 0.5 });
    const e = addSpot(w0, w0.locations[childId('street_main', 0)]!, 'dealer_den', 60, 1);
    relocate(w0, e.id);
    const d0 = w0.dungeons[e.id]!;
    for (const n of garrisonAlive(w0, d0)) n.alive = false;
    d0.clearedRun = w0.legacy.runs;
    d0.returnsRun = w0.legacy.runs + 1;
    d0.clears = 1;
    u = endRun(w0);
    const w1 = beginRun(u, { competence: 0.5 });
    expect(w1.dungeons[e.id]!.occupation).toBe(2);
    expect(garrisonAlive(w1, w1.dungeons[e.id]!).length).toBe(w1.dungeons[e.id]!.garrison.length);
    expect(w1.dungeons[e.id]!.clearedRun).toBeNull();
  });
});
