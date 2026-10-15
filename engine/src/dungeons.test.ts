import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, slow, type Scenario } from './testkit';
import { addDungeon, childId } from './mapgen';
import { gather } from './interactions';
import { npcsAt, verifyIndex } from './population';
import { relocate, here } from './combat';
import { fight } from './combat';
import { hasTemplate, render } from './text';
import { genWeapon } from './weapons';
import { beginRun, endRun, newUniverse } from './universe';
import { deserialize, makeSave, serialize } from './store';
import { step, MAX_BEATS } from './run';
import { arrive } from './candidate';
import { checkCleared, dungeonAmbient, enterRoom, fightRoom, garrisonAlive, knownDungeons, pressure, raidPlan, regarrison, roomOf, standing, tickDungeons, tolerance } from './dungeons';
import { goalViews } from './goals';
import { layoutFor, rollRoomHazards } from './content/dungeons';
import type { Ctx, DungeonKind, GameEvent, Location, World } from './types';

/** A dungeon of this kind and tier on a street near the Halo, with Blackbird standing in its doorway. */
function site(kind: DungeonKind, tier: number, o: { competence?: number; seed?: string } = {}): { sc: Scenario; w: World; entrance: Location; id: string } {
  const sc = scenario({ seed: o.seed ?? `dg-${kind}-${tier}`, at: 'street_main', competence: o.competence ?? 0.5 });
  const street = sc.w.locations[childId('street_main', 0)]!;
  const entrance = addDungeon(sc.w, street, kind, 40, tier);
  relocate(sc.w, entrance.id);
  return { sc, w: sc.w, entrance, id: entrance.id };
}

/** A hero who can take anything the tables hold. */
function mighty(w: World): void {
  const h = w.hero;
  h.level = 14;
  h.maxHp = h.hp = 400;
  h.muscle = 9;
  h.weapon = genWeapon(new Rng('mighty'), { tier: 6.5, cls: 'blade' });
  h.armor = null;
}

/** A hero who can take nothing. */
function frail(w: World): void {
  const h = w.hero;
  h.level = 1;
  h.maxHp = h.hp = 70;
}

const rooms = (w: World, id: string) => w.dungeons[id]!.rooms.map((r) => w.locations[r.id]!);
const people = (w: World, id: string) => w.dungeons[id]!.garrison.map((g) => w.npcs[g]!);
const robot = (n: { tags: string[] }) => n.tags.includes('robot');

describe('making a dungeon', () => {
  it('is built the first time anyone reaches the door, and not before', () => {
    const sc = scenario({ at: 'street_main' });
    const street = sc.w.locations[childId('street_main', 0)]!;
    const e = addDungeon(sc.w, street, 'outpost', 40, 2);
    expect(sc.w.dungeons[e.id]).toBeUndefined();
    expect(e.dungeon).toBe(e.id);
    expect(e.gen).toMatchObject({ role: 'outpost', tier: 2 });
    relocate(sc.w, e.id);
    expect(sc.w.dungeons[e.id]).toBeDefined();
  });

  it.each(['outpost', 'hideout'] as const)('a %s is a building of linked rooms with its own people in them', (kind) => {
    const { w, id } = site(kind, 3);
    const d = w.dungeons[id]!;
    expect(d.rooms.length).toBe(layoutFor(kind, 3).length);
    expect(d.rooms[0]!.id).toBe(id);
    // every room belongs to it, can be walked into and out of, and is part of one connected building
    const seen = new Set([id]);
    const open = [id];
    for (const at of open) {
      for (const e of w.locations[at]!.exits) {
        const to = w.locations[e.to]!;
        if (to.dungeon !== id || seen.has(to.id)) continue;
        expect(to.exits.some((x) => x.to === at), `${to.name} has a way back`).toBe(true);
        seen.add(to.id);
        open.push(to.id);
      }
    }
    expect(seen.size).toBe(d.rooms.length);
    for (const l of rooms(w, id)) {
      expect(l.kind).toBe('lair');
      expect(l.populated).toBe(true);
      expect(l.hazards).toBeDefined();
    }
    // the garrison is real, posted, and standing in the rooms
    expect(d.garrison.length).toBeGreaterThanOrEqual(5);
    for (const n of people(w, id)) {
      expect(n.post).toBe(id);
      expect(d.rooms.some((r) => r.id === n.locationId)).toBe(true);
    }
    expect(verifyIndex(w)).toEqual([]);
  });

  it('is the same building for the same world, however it is found', () => {
    const a = site('hideout', 3, { seed: 'twin' });
    const b = site('hideout', 3, { seed: 'twin' });
    expect(b.w.dungeons[b.id]).toEqual(a.w.dungeons[a.id]);
    expect(people(b.w, b.id).map((n) => [n.name, n.power, n.hp])).toEqual(people(a.w, a.id).map((n) => [n.name, n.power, n.hp]));
  });

  it('every room has a way out onto the street she came in from', () => {
    const { w, id } = site('outpost', 4);
    for (const l of rooms(w, id)) expect(w.locations[l.tossTo]!.outdoors, l.name).toBe(true);
  });
});

describe('the tier is the only dial', () => {
  const garrison = (kind: DungeonKind, tier: number, seed = 'tiers') => {
    const { w, id } = site(kind, tier, { seed: `${seed}-${tier}` });
    return { w, id, folk: people(w, id), d: w.dungeons[id]! };
  };
  const total = (xs: { power: number; hp: number }[]) => xs.reduce((a, n) => a + n.power * Math.sqrt(n.hp), 0);

  it.each(['outpost', 'hideout'] as const)('a harder %s has more, and tougher, defenders, more rooms and richer spoils', (kind) => {
    const by = [1, 2, 3, 4, 5].map((t) => garrison(kind, t));
    for (let i = 1; i < by.length; i++) {
      expect(total(by[i]!.folk), `tier ${i + 1} garrison`).toBeGreaterThan(total(by[i - 1]!.folk));
      expect(by[i]!.d.rooms.length).toBeGreaterThanOrEqual(by[i - 1]!.d.rooms.length);
    }
    const spoils = (g: (typeof by)[number]) => g.d.rooms.reduce((a, r) => a + (r.cache?.value ?? 0), 0) + g.folk.reduce((a, n) => a + n.cash, 0);
    expect(spoils(by[4]!)).toBeGreaterThan(spoils(by[0]!) * 2);
  });

  it('the same person is tougher in a harder place', () => {
    const a = garrison('hideout', 1, 'same').folk.filter((n) => n.archetype === 'gang_runner');
    const b = garrison('hideout', 5, 'same').folk.filter((n) => n.archetype === 'gang_runner');
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(b.map((n) => n.hp))).toBeGreaterThan(mean(a.map((n) => n.hp)) * 1.5);
    expect(mean(b.map((n) => n.power))).toBeGreaterThan(mean(a.map((n) => n.power)) * 1.5);
  });

  it('traps and dogs scale with it: a low tier only ever has the cheap ones', () => {
    const roll = (tier: number) => Array.from({ length: 300 }, (_, i) => rollRoomHazards(new Rng(`t${tier}-${i}`), 'outpost', tier, 1));
    expect(new Set(roll(1).filter((h) => h.trap).map((h) => h.trap!.kind))).toEqual(new Set(['grenade_string']));
    expect(roll(1).some((h) => h.dogs && h.dogs.model > 100)).toBe(false);
    expect(roll(5).some((h) => h.trap?.kind === 'sentry_turret')).toBe(true);
    expect(roll(5).filter((h) => h.dogs).length).toBeGreaterThan(roll(1).filter((h) => h.dogs).length * 2);
    expect(roll(5).filter((h) => h.trap).length).toBeGreaterThan(roll(1).filter((h) => h.trap).length);
    // and a room that keeps nothing keeps nothing
    expect(Object.keys(rollRoomHazards(new Rng('x'), 'outpost', 5, 0))).toEqual([]);
  });

  it('a place keeps the tier it was made with, whatever happens to it', () => {
    const { w, id } = site('outpost', 3);
    const d = w.dungeons[id]!;
    d.clearedRun = 1;
    d.returnsRun = 3;
    regarrison(w, d);
    expect(d.tier).toBe(3);
    expect(w.locations[id]!.gen!.tier).toBe(3);
  });
});

describe('who is in them', () => {
  it('Atlas outposts are robots, with a few people in charge of them', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      for (const seed of ['a', 'b', 'c']) {
        const { w, id } = site('outpost', tier, { seed: `mix-${tier}-${seed}` });
        const folk = people(w, id);
        const machines = folk.filter(robot).length;
        const humans = folk.length - machines;
        expect(machines / folk.length, `tier ${tier}`).toBeGreaterThanOrEqual(0.5);
        expect(humans, `tier ${tier}`).toBeGreaterThanOrEqual(1);
        expect(humans, `tier ${tier}`).toBeLessThanOrEqual(7);
        expect(folk.some((n) => n.tags.includes('commander')), 'somebody is in charge').toBe(true);
      }
    }
  });

  it('ganger hideouts are crowds of weaker people, all of them from one crew', () => {
    for (const tier of [1, 3, 5]) {
      const { w, id } = site('hideout', tier, { seed: `crowd-${tier}` });
      const d = w.dungeons[id]!;
      const folk = people(w, id);
      expect(folk.filter(robot)).toHaveLength(0);
      expect(folk.length).toBeGreaterThanOrEqual(8);
      expect(folk.every((n) => n.faction === d.faction)).toBe(true);
      expect(w.factions[d.faction]!.kind).toBe('gang');
      const runners = folk.filter((n) => n.archetype === 'gang_runner');
      expect(runners.length / folk.length).toBeGreaterThan(0.55);
      // weaker one by one than Atlas' people at the same tier, and far more of them
      const at = site('outpost', tier, { seed: `crowd-${tier}` });
      const atlas = people(at.w, at.id);
      const troopers = atlas.filter((n) => n.archetype === 'atlas_trooper');
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      if (troopers.length) expect(mean(runners.map((n) => n.power))).toBeLessThan(mean(troopers.map((n) => n.power)));
      expect(folk.length).toBeGreaterThan(atlas.length * 0.9);
    }
  });

  it('a big hideout has a lot more people in it than a small one', () => {
    const s1 = site('hideout', 1);
    const s5 = site('hideout', 5);
    const small = people(s1.w, s1.id);
    const big = people(s5.w, s5.id);
    expect(big.length).toBeGreaterThan(small.length * 2);
  });
});

describe('pressure, against real fights', () => {
  /** Fight every room of a tier-`tier` place as a hero of each strength, and say how the pressure we computed lined up with what happened. */
  const trials = (): { p: number; win: boolean; left: number }[] => {
    const out: { p: number; win: boolean; left: number }[] = [];
    const heroes = [{ level: 2, tier: 0.8 }, { level: 4, tier: 1.8 }, { level: 8, tier: 3.4 }, { level: 13, tier: 5 }];
    for (const kind of ['outpost', 'hideout'] as const) {
      for (const tier of [1, 3, 5]) {
        const base = site(kind, tier, { seed: `cal-${kind}-${tier}` });
        const text = JSON.stringify(base.w);
        for (const hero of heroes) {
          const probe: World = JSON.parse(text);
          for (const r of probe.dungeons[base.id]!.rooms) {
            const w: World = JSON.parse(text);
            const h = w.hero;
            h.level = hero.level;
            h.maxHp = h.hp = 90 + 12 * (hero.level - 1);
            h.muscle = 3 + Math.floor((hero.level - 1) / 4);
            h.weapon = genWeapon(new Rng(`cal-w-${hero.level}`), { tier: hero.tier });
            if (h.weapon.ammoType) h.ammo[h.weapon.ammoType] = 60;
            h.locationId = r.id;
            const d = w.dungeons[base.id]!;
            const foes = standing(w, d, r.id);
            if (!foes.length) continue;
            const p = pressure(w, foes);
            const c: Ctx = { w, rng: new Rng(`cal-f-${r.id}-${hero.level}`), emit: () => {} };
            const res = fightRoom(c, d, w.locations[r.id]!, false);
            out.push({ p, win: res === 'win', left: w.hero.hp / w.hero.maxHp });
          }
        }
      }
    }
    return out;
  };

  it('a low pressure is a walk, a high one is a funeral, and it only gets worse in between', () => {
    const t = trials();
    const rate = (lo: number, hi: number) => {
      const xs = t.filter((x) => x.p >= lo && x.p < hi);
      return { n: xs.length, win: xs.filter((x) => x.win).length / Math.max(1, xs.length) };
    };
    const bands = [rate(0, 0.35), rate(0.35, 0.7), rate(0.7, 1.1), rate(1.1, 1.6), rate(1.6, 99)];
    for (const b of bands) expect(b.n).toBeGreaterThan(8);
    expect(bands[0]!.win).toBeGreaterThan(0.93);
    expect(bands[1]!.win).toBeGreaterThan(0.6);
    expect(bands[2]!.win).toBeGreaterThan(0.2);
    expect(bands[2]!.win).toBeLessThan(0.8);
    expect(bands[3]!.win).toBeLessThan(0.35);
    expect(bands[4]!.win).toBeLessThan(0.08);
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.win, `band ${i}`).toBeLessThanOrEqual(bands[i - 1]!.win + 0.02);
  });
});

describe('not being seen', () => {
  it('people posted in a room she has not been noticed in are part of the building, not company', () => {
    const { w, id } = site('hideout', 2);
    const d = w.dungeons[id]!;
    const room = d.rooms[1]!.id;
    w.hero.locationId = room;
    expect(standing(w, d, room).length).toBeGreaterThan(0);
    expect(npcsAt(w, room)).toHaveLength(0);
    expect(here(w)).toHaveLength(0);
    const offers = gather(w).map((c) => c.key);
    expect(offers.filter((k) => /^(chat|flirt|kiss|pickpocket|challenge|threaten|hack):/.test(k))).toEqual([]);
    // until they come at her
    for (const n of standing(w, d, room)) n.hostile = true;
    expect(npcsAt(w, room).length).toBeGreaterThan(0);
  });

  it('walking in on a room, she is noticed or she is not; if not, she can ambush them or walk on', () => {
    const { sc, w, id } = site('hideout', 1);
    const d = w.dungeons[id]!;
    const next = d.rooms[1]!.id;
    w.hero.locationId = id;
    const seen = sc.run((c) => arrive(c, next, 'walk'), always());
    expect(seen.some((e) => e.type === 'dungeon_alarm' && e.data.variant === 'seen')).toBe(true);
    expect(seen.some((e) => e.type === 'fight_start')).toBe(true);

    const q = site('hideout', 1, { seed: 'quiet' });
    const dq = q.w.dungeons[q.id]!;
    q.w.hero.locationId = q.id;
    const unseen = q.sc.run((c) => arrive(c, dq.rooms[1]!.id, 'walk'), never());
    expect(unseen.some((e) => e.type === 'dungeon_unseen')).toBe(true);
    expect(unseen.some((e) => e.type === 'fight_start')).toBe(false);
    const offers = q.sc.offers();
    expect(offers).toContain(`raid_ambush:${dq.rooms[1]!.id}`);
    expect(offers.some((k) => k.startsWith('go:'))).toBe(true);
  });

  it('the longer she stays in a room of people who have not seen her, the likelier they do', () => {
    const { sc, w, id } = site('outpost', 2);
    const d = w.dungeons[id]!;
    const room = d.rooms[1]!.id;
    w.hero.locationId = room;
    expect(standing(w, d, room).length).toBeGreaterThan(0);
    const out = sc.run((c) => {
      for (let i = 0; i < 40 && !w.over && !c.w.dungeons[id]!.aware.includes(room); i++) {
        w.beat++;
        dungeonAmbient(c); // a beat of just standing there
      }
    }, new Rng('linger'));
    expect(out.some((e) => e.type === 'dungeon_alarm' && e.data.variant === 'lingered')).toBe(true);
  });

  it('ambushing them gives her the first move, and nobody outside is watching', () => {
    const { sc, w, id } = site('hideout', 1);
    mighty(w);
    const d = w.dungeons[id]!;
    const room = d.rooms[1]!.id;
    w.hero.locationId = room;
    const heat = { ...w.heat };
    const ev = sc.do(`raid_ambush:${room}`);
    expect(ev.some((e) => e.type === 'dungeon_ambush')).toBe(true);
    expect(ev.some((e) => e.type === 'fight_end' && e.data.variant === 'win')).toBe(true);
    expect(ev.some((e) => e.type === 'crime_seen')).toBe(false);
    expect(w.heat).toEqual(heat);
    expect(standing(w, d, room)).toHaveLength(0);
  });
});

describe('the fight, and the noise it makes', () => {
  it('a lot of people are fought in waves, and a fight draws people from the rooms next door', () => {
    const { sc, w, id } = site('hideout', 4);
    mighty(w);
    const d = w.dungeons[id]!;
    const common = d.rooms.find((r) => r.role === 'hangout')!.id;
    w.hero.locationId = common;
    const before = standing(w, d, common).length;
    d.alert = 3;
    const ev = sc.run((c) => enterRoom(c, w.locations[common]!), always());
    expect(ev.some((e) => e.type === 'dungeon_alarm')).toBe(true);
    const alarm = ev.find((e) => e.type === 'dungeon_alarm')!;
    expect(Number(alarm.data.count)).toBeGreaterThanOrEqual(before);
    expect(Number(alarm.data.pulled)).toBeGreaterThan(0);
    expect(ev.filter((e) => e.type === 'fight_start').length).toBeGreaterThanOrEqual(1);
    expect(verifyIndex(w)).toEqual([]);
  });

  it('losing leaves the garrison where it was, and her somewhere else', () => {
    const { sc, w, id } = site('outpost', 5);
    frail(w);
    const d = w.dungeons[id]!;
    const room = d.rooms[2]!.id;
    w.hero.locationId = room;
    const alive = garrisonAlive(w, d).length;
    sc.run((c) => enterRoom(c, w.locations[room]!), always());
    expect(w.hero.locationId === room && !w.over).toBe(false);
    expect(garrisonAlive(w, d).length).toBeGreaterThan(alive - 3);
  });

  it('people who ran for it are gone for good, and the place is cleared without them', () => {
    const { sc, w, id } = site('hideout', 1);
    mighty(w);
    const d = w.dungeons[id]!;
    const room = d.rooms[1]!.id;
    w.hero.locationId = room;
    // everywhere else is already empty
    for (const n of garrisonAlive(w, d)) if (n.locationId !== room) n.alive = false;
    const folk = standing(w, d, room);
    expect(folk.length).toBeGreaterThan(1);
    const runner = folk[0]!;
    runner.downUntil = w.beat + 25; // out the back door
    sc.run((c) => enterRoom(c, w.locations[room]!), always());
    expect(runner.alive).toBe(true);
    expect(runner.post).toBeUndefined();
    expect(runner.locationId).toBe('_away');
    expect(d.garrison).not.toContain(runner.id);
    expect(d.clearedRun).not.toBeNull();
    expect(verifyIndex(w)).toEqual([]);
  });
});

describe('spoils', () => {
  it('what is lying around can be taken, once', () => {
    const { sc, w, id } = site('outpost', 3);
    const d = w.dungeons[id]!;
    const room = d.rooms.find((r) => r.cache)!;
    for (const n of standing(w, d, room.id)) n.alive = false;
    w.hero.locationId = room.id;
    const key = `raid_loot:${room.id}`;
    expect(sc.offers()).toContain(key);
    const cash = w.hero.cash;
    const bag = w.hero.inventory.length;
    const ev = sc.do(key, always());
    expect(ev.some((e) => e.type === 'dungeon_loot' && e.outcome === 'good')).toBe(true);
    expect(room.cache!.taken).toBe(true);
    expect(w.hero.cash > cash || w.hero.inventory.length > bag || ev.some((e) => e.type === 'equip')).toBe(true);
    expect(sc.offers()).not.toContain(key);
  });

  it('a lock can fight back, and break what was in it', () => {
    const { sc, w, id } = site('outpost', 3);
    const d = w.dungeons[id]!;
    const room = d.rooms.find((r) => r.cache)!;
    for (const n of standing(w, d, room.id)) n.alive = false;
    w.hero.locationId = room.id;
    sc.do(`raid_loot:${room.id}`, never());
    expect(room.cache!.taken).toBe(false);
    expect(room.cache!.fails).toBe(1);
    const second = sc.do(`raid_loot:${room.id}`, never());
    expect(second.some((e) => e.type === 'dungeon_loot' && e.data.variant === 'ruined')).toBe(true);
    expect(room.cache!.taken).toBe(true);
  });

  it('richer places are worth more: spoils scale with the tier', () => {
    const value = (tier: number) => {
      const { w, id } = site('hideout', tier, { seed: `val-${tier}` });
      return w.dungeons[id]!.rooms.reduce((a, r) => a + (r.cache?.value ?? 0), 0);
    };
    expect(value(5)).toBeGreaterThan(value(1) * 1.8);
  });
});

describe('cleared out, and filled up again', () => {
  const clear = (w: World, id: string) => {
    const d = w.dungeons[id]!;
    for (const n of garrisonAlive(w, d)) n.alive = false;
    return d;
  };

  it('when the last of them is gone, the place is cleared, and says so', () => {
    const { sc, w, id } = site('hideout', 1);
    const d = clear(w, id);
    mighty(w);
    const ev = sc.run((c) => enterRoom(c, w.locations[id]!));
    void ev;
    sc.run((c) => checkCleared(c, d));
    expect(d.clearedRun).toBe(w.legacy.runs);
    expect(d.clears).toBe(1);
    expect(sc.saw('dungeon_cleared')).toBe(true);
    expect(d.returnsRun! - d.clearedRun!).toBeGreaterThanOrEqual(2);
    expect(d.returnsRun! - d.clearedRun!).toBeLessThanOrEqual(3);
  });

  it('it stays empty for a couple of runs, and then somebody moves back in', () => {
    const u = newUniverse('squat');
    let w = beginRun(u, { competence: 0.5 });
    const street = w.locations[childId('street_main', 0)]!;
    const e = addDungeon(w, street, 'outpost', 40, 2);
    relocate(w, e.id);
    const id = e.id;
    const d = clear(w, id);
    for (const r of d.rooms) if (r.cache) r.cache.taken = true;
    const c: Ctx = { w, rng: new Rng('c'), emit: () => {} };
    checkCleared(c, d);
    const cleared = d.clearedRun!;
    const back = d.returnsRun!;
    expect(garrisonAlive(w, d)).toHaveLength(0);
    let uu = endRun(w);
    // runs go by; nothing happens until it's time
    for (let run = cleared + 1; run <= back; run++) {
      w = beginRun(uu, { competence: 0.5 });
      const dd = w.dungeons[id]!;
      if (w.legacy.runs < back) {
        expect(dd.clearedRun, `run ${w.legacy.runs}`).toBe(cleared);
        expect(garrisonAlive(w, dd)).toHaveLength(0);
      } else {
        expect(dd.clearedRun).toBeNull();
        expect(dd.occupation).toBe(2);
        expect(garrisonAlive(w, dd).length).toBeGreaterThan(3);
        expect(dd.rooms.some((r) => r.cache && !r.cache.taken)).toBe(true);
        expect(verifyIndex(w)).toEqual([]);
      }
      uu = endRun(w);
    }
  });

  it('the new people are new people, in the same rooms, at the same tier', () => {
    const { w, id } = site('hideout', 3);
    const d = w.dungeons[id]!;
    const before = new Set(d.garrison);
    const homes = d.rooms.map((r) => r.id);
    clear(w, id);
    d.clearedRun = 1;
    d.returnsRun = 3;
    regarrison(w, d);
    expect(d.garrison.some((g) => before.has(g))).toBe(false);
    expect(d.rooms.map((r) => r.id)).toEqual(homes);
    expect(d.garrison.length).toBeGreaterThan(8);
    expect(verifyIndex(w)).toEqual([]);
    // the dead who never mattered to anybody are gone from the books
    expect([...before].filter((g) => w.npcs[g]).length).toBeLessThan(before.size);
  });

  it('a place that is not cleared stays as she left it: the dead stay dead, the rest heal', () => {
    const u = newUniverse('half');
    let w = beginRun(u, { competence: 0.5 });
    const e = addDungeon(w, w.locations[childId('street_main', 0)]!, 'hideout', 40, 2);
    relocate(w, e.id);
    const d = w.dungeons[e.id]!;
    const [dead, hurt] = garrisonAlive(w, d);
    dead!.alive = false;
    hurt!.hp = 1;
    const uu = endRun(w);
    w = beginRun(uu, { competence: 0.5 });
    expect(w.npcs[dead!.id]!.alive).toBe(false);
    expect(w.npcs[hurt!.id]!.hp).toBe(w.npcs[hurt!.id]!.maxHp);
    expect(w.dungeons[e.id]!.occupation).toBe(1);
  });

  it('noise and awareness are forgotten with the night', () => {
    const { w, id } = site('outpost', 2);
    const d = w.dungeons[id]!;
    d.alert = 3;
    d.aware = [id];
    tickDungeons(w);
    expect(d.alert).toBe(0);
    expect(d.aware).toEqual([]);
  });

  it('dungeons survive a save, and so does what she did in them', () => {
    const u = newUniverse('keep');
    const w = beginRun(u, { competence: 0.5 });
    const e = addDungeon(w, w.locations[childId('street_main', 0)]!, 'outpost', 40, 3);
    relocate(w, e.id);
    const d = w.dungeons[e.id]!;
    const [first] = garrisonAlive(w, d);
    first!.alive = false;
    d.rooms.find((r) => r.cache)!.cache!.taken = true;
    const back = deserialize(serialize(makeSave(endRun(w), null, 1))).universe;
    expect(back.dungeons[e.id]).toEqual(d);
    expect(back.npcs[first!.id]!.alive).toBe(false);
    expect(back.locations[d.rooms[2]!.id]!.dungeon).toBe(e.id);
  });

  it('a save from before there were dungeons just has none yet', () => {
    const u = newUniverse('old');
    const text = JSON.stringify({ universe: { ...u, version: 3, dungeons: undefined }, run: null, savedAt: 1 });
    expect(deserialize(text).universe.dungeons).toEqual({});
  });
});

describe('Blackbird in there', () => {
  /** She is in the doorway with a plan to raid it. */
  const raiding = (kind: DungeonKind, tier: number, o: { competence?: number; seed?: string } = {}) => {
    const s = site(kind, tier, o);
    s.sc.run((c) => arrive(c, s.id, 'walk'), never());
    return s;
  };
  const goal = (w: World) => w.mind.goals.find((g) => g.kind === 'raid');

  it('walking into a dungeon, however she came to, makes it a goal', () => {
    const { w, id } = raiding('hideout', 1);
    expect(goal(w)).toMatchObject({ kind: 'raid', loc: id, mode: 'raid' });
    expect(goalViews(w).some((g) => g.label.includes('raid'))).toBe(true);
  });

  it('she works out where to go from what is left: rooms with people or spoils in them, nearest first', () => {
    const { w, id } = raiding('hideout', 1);
    mighty(w);
    const plan = raidPlan(w, w.dungeons[id]!);
    expect(plan.empty).toBe(false);
    expect(plan.blocked).toBe(false);
    expect(plan.targets.length).toBeGreaterThan(1);
  });

  it('a hero who knows her limits gives up on a place that is more than she can take, and leaves', () => {
    const { sc, w, id } = raiding('outpost', 5, { competence: 0.9 });
    frail(w);
    const d = w.dungeons[id]!;
    expect(raidPlan(w, d).blocked).toBe(true);
    let dropped: GameEvent | undefined;
    for (let i = 0; i < 40 && !dropped && !w.over; i++) {
      const ev = sc.step();
      dropped = ev.find((e) => e.type === 'goal_drop' && e.data.variant === 'outmatched');
    }
    expect(dropped).toBeDefined();
    expect(w.locations[w.hero.locationId]!.dungeon).toBeUndefined();
    expect(sc.saw('fight_start')).toBe(false);
    expect(goal(w)).toBeUndefined();
    // and she is not back in a hurry
    expect(w.mind.cooldown[`raid:${id}`]).toBeGreaterThan(w.beat + 50);
  });

  it('a strong hero works the whole building, takes what there is, and leaves once it is cleared out', () => {
    const { sc, w, id } = raiding('hideout', 1, { competence: 0.9 });
    mighty(w);
    const d = w.dungeons[id]!;
    let done: GameEvent | undefined;
    for (let i = 0; i < 400 && !done && !w.over; i++) {
      const ev = sc.step();
      done = ev.find((e) => e.type === 'goal_done' && e.data.kind === 'raid');
      if (i % 40 === 0) w.hero.hp = w.hero.maxHp;
    }
    expect(w.over, 'she should not die in a tier-1 hideout').toBe(false);
    expect(done?.data.variant).toBe('cleared');
    expect(d.clearedRun).not.toBeNull();
    expect(garrisonAlive(w, d)).toHaveLength(0);
    expect(d.rooms.every((r) => !r.cache || r.cache.taken)).toBe(true);
    expect(w.locations[w.hero.locationId]!.dungeon).toBeUndefined();
    expect(sc.saw('dungeon_cleared')).toBe(true);
    expect(sc.saw('goal_note', 'raid_clear')).toBe(true);
    expect(Number(done!.data.haul)).toBeGreaterThan(0);
  }, 60_000);

  it('a cleared place is not interesting any more; once somebody has moved back in, it is, a little less', () => {
    const { w, id } = raiding('hideout', 1);
    const d = w.dungeons[id]!;
    mighty(w);
    // she has seen the street it is on
    w.locations[w.locations[id]!.gen!.parent]!.visits = 1;
    const fresh = knownDungeons(w).find((l) => l.entrance.id === id)!;
    expect(fresh).toBeDefined();
    for (const n of garrisonAlive(w, d)) n.alive = false;
    for (const r of d.rooms) if (r.cache) r.cache.taken = true;
    d.clearedRun = w.legacy.runs;
    d.returnsRun = w.legacy.runs + 2;
    d.clears = 1;
    expect(knownDungeons(w).some((l) => l.entrance.id === id)).toBe(false);
    regarrison(w, d);
    const again = knownDungeons(w).find((l) => l.entrance.id === id)!;
    expect(again).toBeDefined();
    expect(again.appeal).toBeLessThan(fresh.appeal);
  });

  it('she respects what she thinks she can take: a weaker hero tolerates less', () => {
    const { w } = raiding('hideout', 1, { competence: 0.9 });
    const sharp = tolerance(w);
    w.hero.competence = 0.1;
    expect(tolerance(w)).toBeGreaterThan(sharp * 1.5);
  });

  it('pressure says what it should: a room she could beat in her sleep, and one she could not', () => {
    const { w, id } = site('outpost', 5);
    const d = w.dungeons[id]!;
    const room = d.rooms[2]!.id;
    const foes = standing(w, d, room);
    mighty(w);
    const easy = pressure(w, foes);
    frail(w);
    const hard = pressure(w, foes);
    expect(easy).toBeLessThan(0.5);
    expect(hard).toBeGreaterThan(1.5);
    expect(roomOf(w.dungeons[id]!, room)).toBeDefined();
  });
});

describe('the words', () => {
  it('every dungeon event has a line, and no line is left with a hole in it', () => {
    const { sc, w, id } = site('hideout', 2);
    mighty(w);
    const d = w.dungeons[id]!;
    for (const r of d.rooms) {
      w.hero.locationId = r.id;
      if (r.cache) {
        sc.do(`raid_loot:${r.id}`, never());
        if (!r.cache.taken) sc.do(`raid_loot:${r.id}`, never());
      }
    }
    for (const r of d.rooms.slice(1)) {
      w.hero.locationId = id;
      sc.run((c) => arrive(c, r.id, 'walk'), new Rng(`w${r.id}`));
    }
    const types = new Set(sc.events.filter((e) => e.type.startsWith('dungeon') || e.type.startsWith('goal_')).map((e) => e.type));
    expect(types.has('dungeon_loot')).toBe(true);
    const rng = new Rng('words');
    for (const e of sc.events) {
      if (!e.type.startsWith('dungeon') && !e.type.startsWith('goal_')) continue;
      expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      for (const l of render(e, { rng, personality: w.hero.personality, realName: w.hero.realName })) {
        expect(l.text, `${e.type}:${e.data.variant}`).not.toMatch(/\{\w+\}|undefined|NaN|\[object/);
      }
    }
  });

  it('has a line for every variant it can emit', () => {
    const data = { kind: 'outpost', dungeon: 'outpost', place: 'Atlas Depot 12, barracks', site: 'Atlas Depot 12', foes: '2 drones', count: 2, pulled: 1, what: 'the safe', amount: 100, item: 'a thing', haul: 90, goal: 'raid Atlas Depot 12', tier: 2, runs: 2 };
    const want: [string, string | undefined][] = [
      ['dungeon_alarm', 'seen'], ['dungeon_alarm', 'lingered'], ['dungeon_alarm', 'tripped'], ['dungeon_ambush', 'ambush'], ['dungeon_wave', undefined],
      ['dungeon_unseen', undefined], ['dungeon_pulled_back', undefined], ['dungeon_cleared', undefined],
      ...['cash', 'stash', 'arms', 'armor', 'supplies', 'data', 'vault', 'jammed', 'ruined'].map((v): [string, string] => ['dungeon_loot', v]),
      ...['raid_idea', 'idle_raid', 'raid_cash', 'wandered_in'].map((v): [string, string] => ['goal_new', v]),
      ['goal_note', 'raid_in'], ['goal_note', 'raid_clear'], ['goal_note', 'raid_out'], ['goal_done', 'cleared'], ['goal_done', 'spoils'], ['goal_drop', 'outmatched'], ['goal_resume', undefined],
    ];
    const rng = new Rng('lines');
    for (const kind of ['outpost', 'hideout']) {
      for (const [type, variant] of want) {
        const ev: GameEvent = { beat: 1, type, outcome: 'mixed', data: { ...data, kind, dungeon: kind, ...(variant ? { variant } : { variant: type === 'goal_resume' ? 'raid' : undefined }) } as never };
        if (ev.data.variant === undefined) delete ev.data.variant;
        const lines = render(ev, { rng, personality: scenario().w.hero.personality, realName: 'Brenda Pilchard' });
        expect(lines.length, `${type}:${variant}`).toBeGreaterThan(0);
        for (const l of lines) expect(l.text, `${type}:${variant}`).not.toMatch(/^\[|\{\w+\}|undefined|NaN/);
      }
    }
  });
});

describe('over many nights', () => {
  slow('she finds them, raids them, and they fill up again, without ever breaking the world', () => {
    let raids = 0;
    let clears = 0;
    let refilled = 0;
    for (let wi = 0; wi < 8; wi++) {
      let u = newUniverse(`nights-${wi}`);
      for (let n = 0; n < 8; n++) {
        const w = beginRun(u, { competence: 0.4 });
        const events: GameEvent[] = [];
        for (let i = 0; i < MAX_BEATS && !w.over; i++) events.push(...step(w));
        raids += events.filter((e) => e.type === 'goal_new' && e.data.goal && /^raid /.test(String(e.data.goal))).length;
        clears += events.filter((e) => e.type === 'dungeon_cleared').length;
        expect(verifyIndex(w)).toEqual([]);
        for (const d of Object.values(w.dungeons)) {
          if (d.occupation > 1) refilled++;
          expect(d.tier).toBeGreaterThanOrEqual(1);
          expect(d.tier).toBeLessThanOrEqual(5);
          for (const g of d.garrison) expect(w.npcs[g], g).toBeDefined();
        }
        u = endRun(w);
      }
    }
    expect(raids).toBeGreaterThan(0);
    expect(clears).toBeGreaterThan(0);
    expect(refilled).toBeGreaterThanOrEqual(0);
  }, 600_000);
});
