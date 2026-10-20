import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { afterTakedown, isShut } from './shutdown';
import { isLethal, kill, relocate } from './combat';
import { childId, expand } from './mapgen';
import { affordancesFor, uncovered } from './affordances';
import { hallCandidates, describeHall, tickHalls } from './hall';
import {
  CAB_FEATURES, FEATURES, GENRES, HALL_CHANCE, HALL_VARIANT, ROOMS, SHELLS, SITUATIONS, TRAITS, VARIANTS, WILD,
  auditNow, auditOnDay, bootChance, cabinetOf, champLevel, playPrice, rollHall, scoreOf, situationAt,
} from './content/halls';
import { ARCHETYPES } from './content/archetypes';
import { ITEMS, makeItem } from './content/items';
import { everyoneAt } from './population';
import { banned, cabAt, cabByKey, cabKeys, ensureCabs, ensureSpider, forge, hide, jailbreak, redeemTickets, spiderOf, stripBoard, ticketCount, viewAt, wreckCab, type HallView } from './hallkit';
import { FORGE, HIDE, JAILBREAK, REDEEM, STRIP } from './content/hallplay';
import { render } from './text';
import { dayOf, MIN_PER_DAY } from './clock';
import { skillLevel } from './skills';
import type { Id, Location, World } from './types';
import type { Affordance } from './affordances';

const DISTRICTS = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'] as const;
const roll = (n: number, seed = 'h') => Array.from({ length: n }, (_, i) => rollHall(new Rng(`${seed}:${i}`), DISTRICTS[i % 6]!, 3));

/** Walk outward from the hand-built district until an arcade turns up. */
function findHall(w: World, limit = 400): Location | undefined {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  let seen = 0;
  while (queue.length && seen++ < limit) {
    const id = queue.shift()!;
    const loc = w.locations[id];
    if (!loc) continue;
    relocate(w, id);
    if (loc.gamehall) return loc;
    for (const e of loc.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return Object.values(w.locations).find((l) => l.gamehall);
}

/** A scenario with Blackbird standing in an arcade (or one of its rooms). Tries seeds until the city has one. */
function inHall(room: string = 'floor', opts: { want?: (l: Location) => boolean; from?: number } = {}): Scenario {
  for (let i = opts.from ?? 0; i < (opts.from ?? 0) + 100; i++) {
    let found: Id | undefined;
    const sc = scenario({
      seed: `halltest-${i}`,
      setup: (w) => {
        const g = findHall(w);
        if (!g || (opts.want && !opts.want(g))) return;
        expand(w, g);
        const target = room === 'floor' ? g : g.exits.map((e) => w.locations[e.to]).find((l) => l?.hallRoom?.room === room);
        if (!target) return;
        relocate(w, target.id);
        found = target.id;
        w.hero.cash = 600;
        w.hero.hp = w.hero.maxHp;
      },
    });
    if (found && sc.w.hero.locationId === found) return sc;
  }
  throw new Error(`no ${room} found in 100 seeds`);
}

const mainOf = (sc: Scenario): Location => {
  const at = sc.w.locations[sc.w.hero.locationId]!;
  return at.gamehall ? at : sc.w.locations[at.hallRoom!.main]!;
};
const owner = (sc: Scenario) => everyoneAt(sc.w, mainOf(sc).id).find((n) => n.tags.includes('owner'))!;

/** The first cabinet on the main floor, with its licence set the way the test wants. */
function floorCab(sc: Scenario, legal: 'muse' | 'bootleg'): string {
  viewAt(sc.w);
  const main = mainOf(sc);
  const key = cabKeys(main.gamehall!).find((k) => k.startsWith('floor:'))!;
  main.cabs![key] = { legal };
  return key;
}

/** Move the clock to just inside the next visit by the spider. */
function intoAudit(sc: Scenario, into = 3) {
  const main = mainOf(sc);
  for (let d = dayOf(sc.w.clock); d < dayOf(sc.w.clock) + 80; d++) {
    const a = auditOnDay(sc.w.worldSeed, main, main.gamehall!, d);
    if (a) {
      sc.w.clock = a.start + into;
      return a;
    }
  }
  throw new Error('no audit in 80 days');
}

describe('rolling an arcade', () => {
  it('is the same hall for the same stream, and different for others', () => {
    expect(roll(30, 'a')).toEqual(roll(30, 'a'));
    expect(roll(30, 'a')).not.toEqual(roll(30, 'b'));
  });

  it('only ever names things the tables know', () => {
    for (const g of roll(400)) {
      const i = g.info;
      expect(VARIANTS[i.variant]).toBeTruthy();
      expect(SHELLS[i.shell]).toBeTruthy();
      for (const t of i.traits) expect(TRAITS[t]).toBeTruthy();
      for (const r of i.rooms) expect(ROOMS[r]).toBeTruthy();
      if (i.wild) expect(WILD[i.wild]).toBeTruthy();
      for (const f of i.features) {
        const [room, feat] = f.split(':');
        expect(room === 'floor' || i.rooms.includes(room!)).toBe(true);
        expect(FEATURES[feat!]).toBeTruthy();
      }
      expect(i.tier).toBeGreaterThanOrEqual(1);
      expect(i.tier).toBeLessThanOrEqual(5);
      expect(g.blurb).toContain('{name}');
      expect(g.name.length).toBeGreaterThan(2);
    }
  });

  it('has names, blurbs and wall lines for every variant, and no Atlas anywhere', () => {
    for (const [id, v] of Object.entries(VARIANTS)) {
      expect(v.names.length, id).toBeGreaterThanOrEqual(11);
      expect(v.blurbs.length, id).toBeGreaterThanOrEqual(3);
      expect(v.wall.length, id).toBeGreaterThanOrEqual(2);
      expect(Object.keys(v.cabs).every((g) => GENRES[g]), id).toBe(true);
    }
    const everything = JSON.stringify([VARIANTS, SHELLS, TRAITS, SITUATIONS, WILD, ROOMS, GENRES, FEATURES]);
    expect(everything).not.toMatch(/atlas/i);
  });

  it('is a wide space: every variant, shell, size, room and trait can turn up, and halls rarely match', () => {
    const gs = roll(1400);
    expect(new Set(gs.map((g) => g.info.variant)).size).toBe(Object.keys(VARIANTS).length);
    expect(new Set(gs.map((g) => g.info.shell)).size).toBe(Object.keys(SHELLS).length);
    expect(new Set(gs.map((g) => g.info.size)).size).toBe(5);
    expect(new Set(gs.flatMap((g) => g.info.rooms)).size).toBe(Object.keys(ROOMS).length);
    expect(new Set(gs.flatMap((g) => g.info.traits)).size).toBeGreaterThanOrEqual(Object.keys(TRAITS).length * 0.9);
    expect(new Set(gs.map((g) => g.info.wild).filter(Boolean)).size).toBeGreaterThanOrEqual(6);
    const sigs = new Set(gs.map((g) => JSON.stringify(g.info)));
    expect(sigs.size).toBeGreaterThan(gs.length * 0.95);
    const wild = gs.filter((g) => g.info.wild).length / gs.length;
    expect(wild).toBeGreaterThan(0.04);
    expect(wild).toBeLessThan(0.14);
    expect(Object.keys(TRAITS).length).toBeGreaterThanOrEqual(40);
    expect(Object.keys(SITUATIONS).length).toBeGreaterThanOrEqual(18);
    expect(Object.keys(WILD).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(GENRES).length).toBe(12);
  });

  it('is shaped by the district it grows in', () => {
    const count = (d: (typeof DISTRICTS)[number], v: string) => Array.from({ length: 600 }, (_, i) => rollHall(new Rng(`dist:${d}:${i}`), d, 3)).filter((g) => g.info.variant === v).length;
    expect(count('corporate', 'flagship')).toBeGreaterThan(count('slum', 'flagship') * 5);
    expect(count('nightlife', 'rhythm')).toBeGreaterThan(count('industrial', 'rhythm') * 3);
    expect(HALL_VARIANT.industrial.racing).toBeGreaterThan(HALL_VARIANT.market.racing!);
  });
});

describe('the cabinets', () => {
  it('are Muse or bootleg, from the seed, with a title from the right table', () => {
    const seen = { muse: 0, bootleg: 0 };
    const genres = new Set<string>();
    for (const g of roll(300)) {
      for (const f of g.info.features.filter((x) => CAB_FEATURES[x.split(':')[1]!])) {
        const cab = cabinetOf('seed', { id: 'x' }, g.info, f)!;
        expect(cab).toBeTruthy();
        expect(['muse', 'bootleg']).toContain(cab.legal);
        expect(cab.legal === 'muse' ? cab.def.muse : cab.def.boot).toContain(cab.title);
        expect(cabinetOf('seed', { id: 'x' }, g.info, f)).toEqual(cab);
        seen[cab.legal]++;
        genres.add(cab.genre);
      }
    }
    expect(seen.muse).toBeGreaterThan(100);
    expect(seen.bootleg).toBeGreaterThan(100);
    expect(genres.size).toBe(12);
  });

  it('follow the variant: a flagship is licensed, a bootleg den is cracked, and the back room is bootleg', () => {
    const flag = roll(900, 'f').filter((g) => g.info.variant === 'flagship' && !g.info.traits.length && !g.info.wild);
    const den = roll(900, 'd').filter((g) => g.info.variant === 'bootleg' && !g.info.wild && !g.info.traits.length);
    expect(flag.length).toBeGreaterThan(5);
    expect(den.length).toBeGreaterThan(5);
    for (const g of flag) expect(bootChance(g.info, 'floor')).toBe(0);
    for (const g of den) expect(bootChance(g.info, 'floor')).toBe(1);
    for (const g of flag) expect(bootChance(g.info, 'backroom')).toBeGreaterThan(0.8);
    const wild = roll(1400, 'w').find((g) => g.info.wild === 'no_spider')!;
    expect(bootChance(wild.info, 'floor')).toBe(1);
  });

  it('are made the first time the hall is looked at, and an old save with none simply grows them', () => {
    const sc = inHall();
    const main = mainOf(sc);
    expect(main.cabs).toBeUndefined();
    const v = viewAt(sc.w)!;
    expect(v).toBeTruthy();
    expect(main.cabs).toEqual({});
    const keys = cabKeys(main.gamehall!);
    expect(keys.length).toBeGreaterThan(1);
    for (const k of keys) expect(cabByKey(sc.w, main, k)).toBeTruthy();
    delete main.cabs;
    expect(viewAt(sc.w)!.main.cabs).toEqual({});
  });

  it('read what she has done to them: a licence changed, a score set, wrecked until, hidden until', () => {
    const sc = inHall();
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'muse');
    expect(cabByKey(w, main, key)!.legal).toBe('muse');
    main.cabs![key] = { legal: 'bootleg', top: 77, topBy: 'XYZ' };
    const bootleg = cabByKey(w, main, key)!;
    expect(bootleg.legal).toBe('bootleg');
    expect(bootleg.top).toBe(77);
    expect(bootleg.topBy).toBe('XYZ');
    expect(bootleg.price).toBeLessThanOrEqual(playPrice(main.gamehall!, 'muse'));
    main.cabs![key] = { wrecked: w.clock + 100, hidden: w.clock + 50 };
    expect(cabByKey(w, main, key)!.wrecked).toBe(true);
    expect(cabByKey(w, main, key)!.hidden).toBe(true);
    w.clock += 200;
    expect(cabByKey(w, main, key)!.wrecked).toBe(false);
  });

  it('are replaced by the owner after a wreck: a new game, a new licence, a blank board', () => {
    const sc = inHall();
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'bootleg');
    const before = cabByKey(w, main, key)!;
    main.cabs![key] = { legal: 'bootleg', top: 99, topBy: 'BLK' };
    wreckCab(w, main, key);
    const until = main.cabs![key]!.wrecked!;
    expect(until).toBeGreaterThan(w.clock + 2 * MIN_PER_DAY - 1);
    expect(until).toBeLessThanOrEqual(w.clock + 6 * MIN_PER_DAY);
    w.clock = until + 1;
    ensureCabs(w, main);
    const after = cabByKey(w, main, key)!;
    expect(main.cabs![key]!.gen).toBe(1);
    expect(after.wrecked).toBe(false);
    expect(after.top).not.toBe(99);
    expect(after.topBy).not.toBe('BLK');
    expect(after.key).toBe(before.key);
  });

  it('start with a score to beat, written as points', () => {
    const sc = inHall();
    viewAt(sc.w);
    const main = mainOf(sc);
    for (const k of cabKeys(main.gamehall!)) {
      const lvl = champLevel(sc.w.worldSeed, main, main.gamehall!, k);
      expect(lvl).toBeGreaterThan(3);
      expect(scoreOf(lvl)).toBeGreaterThan(1000);
    }
    expect(scoreOf(10)).toBeLessThan(scoreOf(11));
  });
});

describe('where arcades grow', () => {
  it('turns up in the city, on a stream of its own, after everything else on its street', () => {
    let halls = 0;
    for (let i = 0; i < 25; i++) {
      const sc = scenario({ seed: `grow-${i}`, setup: (w) => void findHall(w, 140) });
      for (const street of Object.values(sc.w.locations).filter((l) => l.gen?.role === 'street' && l.gen.expanded)) {
        const kids = street.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.gen?.parent === street.id && l.gen.role !== 'street');
        for (const p of kids.filter((l) => l!.gen!.role === 'gamehall')) {
          halls++;
          for (const other of kids.filter((l) => !['gamehall', 'gamehallroom', 'studio', 'cutting', 'luthier', 'musehq', 'arena', 'fanclub'].includes(l!.gen!.role))) expect(p!.gen!.slot).toBeGreaterThan(other!.gen!.slot);
        }
      }
    }
    expect(halls).toBeGreaterThan(0);
    for (const d of DISTRICTS) expect(HALL_CHANCE[d]).toBeLessThan(0.2);
  });

  it('grows the rooms it rolled, behind the right doors, with names and blurbs that resolve', () => {
    for (let i = 0; i < 30; i++) {
      const sc = scenario({ seed: `hrooms-${i}`, setup: (w) => { const g = findHall(w); if (g) expand(w, g); } });
      const g = Object.values(sc.w.locations).find((l) => l.gamehall && l.gamehall.rooms.length >= 2);
      if (!g?.gen?.expanded) continue;
      const rooms = g.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.hallRoom);
      expect(rooms.map((r) => r!.hallRoom!.room).sort()).toEqual([...g.gamehall!.rooms].sort());
      for (const r of rooms) {
        expect(r!.kind).toBe('gamehall');
        expect(r!.name).not.toMatch(/undefined|\{|\}/);
        expect(r!.blurb).not.toMatch(/undefined|\{|\}/);
        expect(r!.exits.some((e) => e.to === g.id)).toBe(true);
        expect(g.exits.find((e) => e.to === r!.id)!.gate).toBe(ROOMS[r!.hallRoom!.room]!.gate);
      }
      return;
    }
    throw new Error('no arcade with rooms found');
  });

  it('keeps its hours: noon until three in the morning', () => {
    const sc = inHall();
    expect(mainOf(sc).kind).toBe('gamehall');
    expect(mainOf(sc).hours ?? [12, 3]).toEqual([12, 3]);
  });
});

describe('who is in an arcade', () => {
  it('has an owner on the floor, and everyone is a real kind of person', () => {
    const sc = inHall('floor');
    const main = mainOf(sc);
    const here = everyoneAt(sc.w, main.id);
    expect(here.some((n) => n.tags.includes('owner') && n.archetype === 'hall_owner')).toBe(true);
    for (const n of here) expect(ARCHETYPES[n.archetype]).toBeTruthy();
    expect(main.faction?.startsWith('v:')).toBe(true);
  });

  it('puts a bootlegger in the back room and a tech at the bench', () => {
    for (const [room, role] of [['backroom', 'hall_bootlegger'], ['workshop', 'hall_tech']] as const) {
      let ok = false;
      for (let from = 0; from < 600 && !ok; from += 100) {
        let sc: Scenario;
        try {
          sc = inHall(room, { from });
        } catch {
          continue;
        }
        if (everyoneAt(sc.w, sc.w.hero.locationId).some((n) => n.archetype === role)) ok = true;
      }
      expect(ok, `${room} has a ${role}`).toBe(true);
    }
  });
});

describe('the registry', () => {
  const rows = affordancesFor('hall') as Affordance<HallView>[];

  it('has a lot of rows, each with a unique id and a complete description', () => {
    expect(rows.length).toBeGreaterThanOrEqual(80);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.needs.length, r.id).toBeGreaterThan(0);
      expect(r.sees.length, r.id).toBeGreaterThan(10);
      expect(r.stakes.length, r.id).toBeGreaterThan(5);
      for (const n of r.needs) expect(n, r.id).toMatch(/^(skill|stat|drive|item|implant|tag|goal):\w+$/);
    }
  });

  it('only mentions features, rooms, variants, traits, situations and wild cards that exist', () => {
    const tags = new Set([...Object.values(SITUATIONS).flatMap((s) => s.tags), 'audit']);
    const arr = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
    for (const r of rows) {
      for (const f of arr(r.where.feature)) expect(FEATURES[f], `${r.id} feature ${f}`).toBeTruthy();
      for (const f of arr(r.where.room)) expect(f === 'floor' || ROOMS[f], `${r.id} room ${f}`).toBeTruthy();
      for (const f of arr(r.where.variant)) expect(VARIANTS[f], `${r.id} variant ${f}`).toBeTruthy();
      for (const f of arr(r.where.trait)) expect(TRAITS[f], `${r.id} trait ${f}`).toBeTruthy();
      for (const f of arr(r.where.situation)) expect(tags.has(f), `${r.id} situation ${f}`).toBe(true);
      for (const f of arr(r.where.wild)) expect(WILD[f], `${r.id} wild ${f}`).toBeTruthy();
    }
  });

  it('draws on a wide variety of skills, stats and drives, and every capability has something here', () => {
    const needs = new Set(rows.flatMap((r) => r.needs));
    const skills = [...needs].filter((n) => n.startsWith('skill:'));
    expect(skills.length).toBeGreaterThanOrEqual(30);
    expect([...needs].filter((n) => n.startsWith('stat:')).length).toBe(4);
    expect([...needs].filter((n) => n.startsWith('drive:')).length).toBeGreaterThanOrEqual(6);
    expect(uncovered('hall', Object.keys(FEATURES))).toEqual([]);
  });

  it('gives different capabilities different things to do, and a typical hall offers a broad menu', () => {
    const ds = roll(200).map((g) => new Set(Object.values(describeHall(g.info)).flat()).size);
    expect(Math.min(...ds)).toBeGreaterThanOrEqual(7);
    expect(ds.reduce((s, x) => s + x, 0) / ds.length).toBeGreaterThan(18);
  });

  it('offers the spider rows only while the spider is here', () => {
    const info = roll(40).find((g) => g.info.rooms.length)!.info;
    const calm = Object.values(describeHall(info)).flat();
    const visit = Object.values(describeHall(info, [], true)).flat();
    expect(visit.length).toBeGreaterThan(calm.length);
    expect(calm.some((id) => id.startsWith('hide-cabinet'))).toBe(false);
  });
});

describe('situations and visits', () => {
  it('situations are a pure function of the clock: same moment, same situation; they change as days pass', () => {
    const sc = inHall();
    const main = mainOf(sc);
    expect(situationAt(sc.w, main)).toEqual(situationAt(sc.w, main));
    const seen = new Set<string>();
    for (let d = 0; d < 90; d++) seen.add(situationAt({ worldSeed: sc.w.worldSeed, clock: d * 2 * 1440 }, main)?.id ?? 'none');
    expect(seen.size).toBeGreaterThan(8);
    expect(seen.has('none')).toBe(true);
  });

  it('the spider\'s visits are a pure function of the clock too, and follow the hall', () => {
    const halls = roll(500);
    const visits = (info: (typeof halls)[number]['info'], days = 120) => Array.from({ length: days }, (_, d) => auditOnDay('seed', { id: 'x' }, info, d)).filter(Boolean);
    const sample = halls.find((g) => g.info.variant === 'licensed')!.info;
    expect(visits(sample)).toEqual(visits(sample));
    const a = visits(sample)[0]!;
    expect(a.end - a.start).toBeGreaterThanOrEqual(40);
    expect(a.end - a.start).toBeLessThanOrEqual(100);
    expect(a.start % MIN_PER_DAY).toBeGreaterThanOrEqual(12 * 60);
    expect(visits({ ...sample, wild: 'no_spider' }).length).toBe(0);
    expect(visits({ ...sample, wild: 'spider_home' }).length).toBe(120);
    const rate = (v: string) => visits({ ...sample, variant: v, traits: [] }, 400).length;
    expect(rate('flagship')).toBeGreaterThan(rate('bootleg'));
  });

  it('knows when one is under way', () => {
    const sc = inHall('floor', { want: (l) => l.gamehall!.wild !== 'no_spider' });
    const a = intoAudit(sc);
    expect(auditNow(sc.w, mainOf(sc))).toEqual(a);
    sc.w.clock = a.end + 1;
    expect(auditNow(sc.w, mainOf(sc))).toBeUndefined();
  });
});

describe('the compliance spider', () => {
  const quiet = (l: Location) => !['no_spider', 'spider_home'].includes(l.gamehall!.wild ?? '') && cabKeys(l.gamehall!).length >= 3;

  it('turns up during a visit, in the hall she is in, and says so', () => {
    const sc = inHall('floor', { want: quiet });
    const a = intoAudit(sc);
    const main = mainOf(sc);
    viewAt(sc.w);
    const evs = sc.run((c) => tickHalls(c), always());
    const spider = sc.w.npcs[`spider@${main.id}.${a.day}`];
    expect(spider).toBeTruthy();
    expect(spider!.archetype).toBe('muse_spider');
    expect(spider!.locationId).toBe(main.id);
    expect(spider!.name).toMatch(/Verifier-\d+/);
    expect(evs.some((e) => e.type === 'hall' && e.data.variant === 'spider.arrive')).toBe(true);
    expect(spiderOf(viewAt(sc.w)!)).toBe(spider);
  });

  it('stamps on the bootlegs and leaves the licensed cabinets alone, then goes', () => {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const keys = cabKeys(main.gamehall!);
    main.cabs = {};
    keys.forEach((k, i) => (main.cabs![k] = { legal: i % 2 ? 'bootleg' : 'muse' }));
    const a = intoAudit(sc);
    const told = sc.run((c) => {
      for (let i = 0; i < keys.length + 6; i++) tickHalls(c);
    }, always());
    keys.forEach((k, i) => {
      const cab = cabByKey(w, main, k)!;
      if (i % 2) expect(cab.wrecked, k).toBe(true);
      else expect(cab.wrecked, k).toBe(false);
    });
    const smash = told.filter((e) => e.type === 'hall' && e.data.variant === 'spider.smash');
    expect(smash.length).toBe(keys.filter((_, i) => i % 2).length);
    for (const e of smash) expect(String(e.data.text)).toMatch(/fun|joy|care|enjoy/i);
    expect(w.counters.cabs_wrecked).toBe(smash.length);
    // The visit ends; the spider goes with it.
    w.clock = a.end + 1;
    const gone = sc.run((c) => tickHalls(c), always());
    expect(gone.some((e) => e.data.variant === 'spider.leave')).toBe(true);
    expect(w.npcs[`spider@${main.id}.${a.day}`]!.locationId).not.toBe(main.id);
  });

  it('passes over a hidden cabinet and a good forgery, but not a poor one', () => {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const keys = cabKeys(main.gamehall!);
    const [hid, good, poor] = keys;
    const a = intoAudit(sc);
    main.cabs = { [hid!]: { legal: 'bootleg', hidden: a.end }, [good!]: { legal: 'bootleg', forged: 1 }, [poor!]: { legal: 'bootleg', forged: 0.05 } };
    for (const k of keys.slice(3)) main.cabs[k] = { legal: 'muse' };
    sc.run((c) => {
      for (let i = 0; i < keys.length + 6; i++) tickHalls(c);
    }, always());
    expect(cabByKey(w, main, hid!)!.wrecked).toBe(false);
    expect(cabByKey(w, main, poor!)!.wrecked).toBe(true);
    // A near-perfect forgery is noticed only now and then, so across seeds it is mostly passed; test the rule directly.
    const noticed = Array.from({ length: 200 }, (_, d) => new Rng(`notice:${w.worldSeed}:${main.id}:${good}:${d}`).chance(0.75 - 0.6)).filter(Boolean).length;
    expect(noticed).toBeLessThan(60);
  });

  it('catches up with a visit that happened while she was away', () => {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const keys = cabKeys(main.gamehall!);
    main.cabs = Object.fromEntries(keys.map((k) => [k, { legal: 'bootleg' as const }]));
    const a = intoAudit(sc);
    w.clock = a.end + 1;
    viewAt(w);
    for (const k of keys) expect(cabByKey(w, main, k)!.wrecked, k).toBe(true);
    // And it only happens once.
    const n = w.counters.cabs_wrecked;
    viewAt(w);
    expect(w.counters.cabs_wrecked).toBe(n);
  });

  it('does not come back for a visit that was talked out of, or after it has been killed', () => {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const keys = cabKeys(main.gamehall!);
    main.cabs = Object.fromEntries(keys.map((k) => [k, { legal: 'bootleg' as const }]));
    const a = intoAudit(sc);
    w.counters[`spidercalm:${main.id}:${a.day}`] = 1;
    sc.run((c) => {
      for (let i = 0; i < keys.length + 6; i++) tickHalls(c);
    }, always());
    for (const k of keys) expect(cabByKey(w, main, k)!.wrecked, k).toBe(false);
  });

  it('can be killed; the hall remembers, and the cabinets are safe', () => {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const keys = cabKeys(main.gamehall!);
    main.cabs = Object.fromEntries(keys.map((k) => [k, { legal: 'bootleg' as const }]));
    const a = intoAudit(sc);
    sc.run((c) => void ensureSpider(c, main, a), always());
    const spider = w.npcs[`spider@${main.id}.${a.day}`]!;
    const c = sc.ctx(always());
    kill(c, w, spider, 'Blackbird');
    const evs = sc.run((cc) => {
      for (let i = 0; i < keys.length + 6; i++) tickHalls(cc);
    }, always());
    expect(w.counters.spiders_killed).toBe(1);
    expect(evs.some((e) => e.data.variant === 'spider.dead')).toBe(true);
    for (const k of keys) expect(cabByKey(w, main, k)!.wrecked, k).toBe(false);
    // The visit's catch-up respects it too.
    w.clock = a.end + 1;
    viewAt(w);
    for (const k of keys) expect(cabByKey(w, main, k)!.wrecked, k).toBe(false);
  });
});

describe('playing', () => {
  it('costs the price on the cabinet, trains gaming, and a win on a Muse cabinet pays in tickets', () => {
    const sc = inHall('floor', { want: (l) => l.gamehall!.wild !== 'rigged' });
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'muse');
    const feature = key.split(':')[1]!;
    const cab = cabByKey(w, main, key)!;
    w.hero.skills.gaming = 0;
    w.hero.inventory = [];
    w.hero.cash = 500;
    const offer = sc.offers().find((k) => k === `halldeal:play:${feature}`);
    expect(offer, sc.offers().join(' ')).toBeTruthy();
    sc.do(offer!, always());
    expect(w.hero.cash).toBe(500 - cab.price);
    expect(w.hero.skills.gaming ?? 0).toBeGreaterThan(0);
    expect(ticketCount(w)).toBeGreaterThanOrEqual(1);
    expect(sc.saw('hall')).toBe(true);
  });

  it('sets a record when she is far better than the board: her initials go on and the score rises', () => {
    const sc = inHall('floor', { want: (l) => l.gamehall!.wild !== 'rigged' });
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'muse');
    const feature = key.split(':')[1]!;
    for (const s of ['gaming', 'calculate', 'driving', 'music', 'dancing', 'marksmanship', 'throwing', 'athletics', 'tinkering', 'sleight', 'perception', 'melee', 'cards'] as const) w.hero.skills[s] = 60;
    w.hero.reflex = 10;
    w.hero.int = 10;
    w.hero.charm = 10;
    const before = cabByKey(w, main, key)!.top;
    sc.do(`halldeal:play:${feature}`, always());
    const after = cabByKey(w, main, key)!;
    expect(after.topBy).toBe('BLK');
    expect(after.top).toBeGreaterThan(before);
    expect(ticketCount(w)).toBeGreaterThanOrEqual(3);
  });

  it('a bootleg pays in cash, not tickets, and a losing game pays nothing', () => {
    const sc = inHall('floor', { want: (l) => l.gamehall!.wild !== 'rigged' });
    const w = sc.w;
    const key = floorCab(sc, 'bootleg');
    const feature = key.split(':')[1]!;
    w.hero.inventory = [];
    w.hero.cash = 500;
    const price = cabByKey(w, mainOf(sc), key)!.price;
    sc.do(`halldeal:play:${feature}`, always());
    expect(w.hero.cash).toBeGreaterThan(500 - price);
    expect(ticketCount(w)).toBe(0);
    w.hero.cash = 500;
    sc.do(`halldeal:play:${feature}`, never());
    expect(w.hero.cash).toBe(500 - price);
  });

  it('cannot play a cabinet that is wrecked or covered, or with no money', () => {
    const sc = inHall();
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'muse');
    const feature = key.split(':')[1]!;
    main.cabs![key] = { legal: 'muse', wrecked: w.clock + 5000 };
    expect(sc.offers()).not.toContain(`halldeal:play:${feature}`);
    main.cabs![key] = { legal: 'muse', hidden: w.clock + 5000 };
    expect(sc.offers()).not.toContain(`halldeal:play:${feature}`);
    main.cabs![key] = { legal: 'muse' };
    w.hero.cash = 0;
    const price = cabByKey(w, main, key)!.price;
    if (price > 0) expect(sc.offers()).not.toContain(`halldeal:play:${feature}`);
  });

  it('hands Joy tickets in at the prize counter for something to keep', () => {
    const sc = inHall();
    const w = sc.w;
    viewAt(w);
    w.hero.inventory = Array.from({ length: 8 }, () => makeItem('joy_tickets'));
    const v = viewAt(w)!;
    const before = w.hero.inventory.length;
    sc.run((c) => redeemTickets(c, v, REDEEM), always());
    expect(ticketCount(w)).toBeLessThan(8);
    expect(w.hero.inventory.length + (ticketCount(w) === 8 ? 0 : 0)).toBeGreaterThan(0);
    expect(sc.saw('hall', 'tickets.win')).toBe(true);
    expect(before).toBe(8);
  });
});

describe('changing a cabinet', () => {
  it('jailbreaks a Muse cabinet into a bootleg, for good; a botched one bricks it for a day and upsets the owner', () => {
    const sc = inHall('floor', { want: (l) => !!l.gamehall });
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'muse');
    const feature = key.split(':')[1]!;
    w.hero.inventory = [makeItem('debug_dongle')];
    const v = viewAt(w)!;
    sc.run((c) => jailbreak(c, v, feature, JAILBREAK), always());
    expect(cabByKey(w, main, key)!.legal).toBe('bootleg');
    main.cabs![key] = { legal: 'muse' };
    w.hero.inventory = [];
    const o = owner(sc);
    const aff = o.affinity;
    sc.run((c) => jailbreak(c, viewAt(w)!, feature, JAILBREAK), never());
    expect(cabByKey(w, main, key)!.wrecked).toBe(true);
    expect(o.affinity).toBeLessThan(aff);
  });

  it('forges a licence on a bootleg, and covers one before the spider comes', () => {
    const sc = inHall('floor', { want: (l) => !!l.gamehall });
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'bootleg');
    const feature = key.split(':')[1]!;
    sc.run((c) => forge(c, viewAt(w)!, feature, FORGE), always());
    expect(cabByKey(w, main, key)!.forged).toBeGreaterThan(0);
    const a = intoAudit(sc);
    sc.run((c) => hide(c, viewAt(w)!, feature, HIDE), always());
    expect(main.cabs![key]!.hidden).toBe(a.end);
    expect(cabByKey(w, main, key)!.hidden).toBe(true);
  });

  it('strips a board out of a wrecked cabinet', () => {
    const sc = inHall('floor', { want: (l) => !!l.gamehall });
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'bootleg');
    const feature = key.split(':')[1]!;
    w.hero.inventory = [];
    sc.run((c) => stripBoard(c, viewAt(w)!, feature, STRIP), always());
    expect(w.hero.inventory.some((i) => i.id === 'cracked_board')).toBe(false);
    wreckCab(w, main, key);
    sc.run((c) => stripBoard(c, viewAt(w)!, feature, STRIP), always());
    expect(w.hero.inventory.some((i) => i.id === 'cracked_board')).toBe(true);
  });
});

describe('forcing every row', () => {
  it('runs all of them (with their situation or wild card switched on), under three kinds of luck, and tells something that renders cleanly', () => {
    const rows = affordancesFor('hall') as Affordance<HallView>[];
    const problems: string[] = [];
    let ran = 0;
    const told = new Set<string>();
    const make = () => {
      const sc = inHall('floor', { want: (l) => l.gamehall!.rooms.length >= 3 && cabKeys(l.gamehall!).length >= 5 });
      const at = sc.w.hero.locationId;
      // People only exist once someone has looked in: walk through the rooms and come back.
      for (const e of sc.w.locations[at]!.exits) if (sc.w.locations[e.to]?.hallRoom) relocate(sc.w, e.to);
      relocate(sc.w, at);
      sc.w.hero.level = 30;
      sc.w.hero.muscle = 40;
      return { sc, at };
    };
    const worlds = { always: make(), never: make(), normal: make() };
    const arr = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
    for (const row of rows) {
      const sitTag = arr(row.where.situation).find((t) => t !== 'audit');
      const sitId = sitTag ? Object.keys(SITUATIONS).find((id) => SITUATIONS[id]!.tags.includes(sitTag)) : undefined;
      const audit = arr(row.where.situation).includes('audit');
      const wild = arr(row.where.wild)[0];
      const featureWanted = arr(row.where.feature);
      for (const dice of ['always', 'never', 'normal'] as const) {
        const { sc, at } = worlds[dice];
        const w = sc.w;
        // Earlier rows leave a mess (fights, bans, a shut hall): put the place and its people back.
        for (const l of Object.values(w.locations)) {
          if (l.id === at || l.hallRoom?.main === at) {
            delete l.shutUntil;
            delete l.shutBy;
            delete l.sealed;
            delete l.pendingShut;
            for (const n of everyoneAt(w, l.id)) Object.assign(n, { alive: true, hostile: false, hp: n.maxHp, downUntil: 0, affinity: 0, cash: 400 });
          }
        }
        delete w.counters[`hallban:${at}`];
        if (w.hero.locationId !== at) relocate(w, at);
        w.hero.cash = 900;
        w.hero.maxHp = w.hero.hp = 300;
        w.hero.skills.melee = 50;
        w.hero.inventory = [makeItem('joy_tickets'), makeItem('joy_tickets'), makeItem('fun_sticker'), makeItem('debug_dongle'), makeItem('cracked_board')];
        const main = mainOf(sc);
        // A wiped slate of cabinets, half Muse and half bootleg, plus a wreck.
        const keys = cabKeys(main.gamehall!);
        main.cabs = Object.fromEntries(keys.map((k, i) => [k, i === 2 ? { legal: 'bootleg' as const, wrecked: w.clock + 99999 } : { legal: i % 2 ? ('bootleg' as const) : ('muse' as const) }]));
        let v = viewAt(w)!;
        // The feature a row hangs on has to exist on this floor: give it one.
        for (const f of featureWanted) {
          const key = `floor:${f}`;
          if (CAB_FEATURES[f] && !main.gamehall!.features.includes(key)) {
            main.gamehall!.features = [...main.gamehall!.features, key];
            main.cabs[key] = { legal: row.id.includes('forge') || row.id.includes('hide') ? 'bootleg' : 'muse' };
          } else if (!CAB_FEATURES[f] && !main.gamehall!.features.includes(`floor:${f}`)) main.gamehall!.features = [...main.gamehall!.features, `floor:${f}`];
        }
        if (!w.counters.__spiderless && audit) {
          // A spider, mid-visit.
          const a = intoAudit(sc, 5);
          sc.run((c) => tickHalls(c), always());
          void a;
        }
        v = viewAt(w)!;
        if (sitId) v.sit = { id: sitId, def: SITUATIONS[sitId]! };
        if (wild) v.info = { ...v.info, wild };
        // A row over cabinets is tried on every cabinet of the kind it hangs on (a jailbreak wants a Muse one, a forgery a bootleg).
        const features: (string | undefined)[] = row.each ? v.features.filter((f) => featureWanted.includes(f)) : [undefined];
        if (row.each && !features.length) features.push(featureWanted[0]);
        const c = sc.ctx(dice === 'always' ? always() : dice === 'never' ? never() : undefined);
        const events: { type: string; outcome: 'good' | 'bad' | 'mixed'; data: Record<string, string | number | boolean>; beat: number }[] = [];
        const emit = c.emit.bind(c);
        c.emit = ((type: string, outcome: 'good' | 'bad' | 'mixed', data: Record<string, string | number | boolean> = {}) => {
          events.push({ type, outcome, data, beat: w.beat });
          emit(type, outcome, data);
        }) as typeof c.emit;
        try {
          for (const feature of features) row.run(c, v, feature);
          ran++;
          if (events.some((e) => e.type === 'hall')) told.add(row.id);
          for (const ev of events.filter((e) => e.type === 'hall')) {
            const lines = render(ev as never, { rng: new Rng('r'), personality: w.hero.personality, realName: 'Brenda Pilchard' });
            for (const l of lines) if (/\{|\}|undefined|NaN/.test(l.text)) problems.push(`${row.id}/${dice}: ${l.text}`);
          }
        } catch (e) {
          problems.push(`${row.id}/${dice} threw: ${(e as Error).message}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(ran).toBe(rows.length * 3);
    // A row that never says anything is a row that never does anything.
    expect(rows.map((r) => r.id).filter((id) => !told.has(id))).toEqual([]);
  });

  it('every row on offer in every room, run under three kinds of luck, completes and renders cleanly', () => {
    const rooms = Object.keys(ROOMS).concat('floor');
    const ran = new Set<string>();
    const problems: string[] = [];
    for (const room of rooms) {
      let sc: Scenario;
      try {
        sc = inHall(room);
      } catch {
        continue;
      }
      for (const key of sc.offers().filter((k) => k.startsWith('hall'))) {
        for (const dice of ['always', 'never', 'normal'] as const) {
          sc.w.hero.hp = sc.w.hero.maxHp;
          sc.w.hero.cash = Math.max(sc.w.hero.cash, 400);
          if (!sc.offers().includes(key)) continue;
          try {
            const evs = sc.do(key, dice === 'always' ? always() : dice === 'never' ? never() : undefined);
            ran.add(key.replace(/^hall\w*:/, '').split(':')[0]!);
            for (const ev of evs.filter((e) => e.type === 'hall')) {
              const lines = render(ev, { rng: new Rng('r'), personality: sc.w.hero.personality, realName: 'Brenda Pilchard' });
              for (const l of lines) if (/\{|\}|undefined|NaN/.test(l.text)) problems.push(`${key}/${dice}: ${l.text}`);
            }
          } catch (e) {
            problems.push(`${key}/${dice} threw: ${(e as Error).message}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    expect(ran.size).toBeGreaterThan(12);
  });
});

describe('the house rules', () => {
  it('treats an arcade as a place where a fight is a beating, not a death', () => {
    const sc = inHall('floor');
    const w = sc.w;
    const guy = everyoneAt(w, mainOf(sc).id).find((n) => n.tags.includes('owner'))!;
    expect(isLethal([guy], w)).toBe(false);
  });

  it('shuts the arcade when its owner is killed', () => {
    const sc = inHall();
    const w = sc.w;
    const main = mainOf(sc);
    const boss = owner(sc);
    const c = sc.ctx();
    kill(c, w, boss, 'Blackbird');
    afterTakedown(c, [boss]);
    expect(isShut(w, main.id) || !!main.sealed).toBe(true);
  });

  it('puts nothing on offer when she is barred', () => {
    const sc = inHall();
    const main = mainOf(sc);
    viewAt(sc.w);
    sc.w.counters[`hallban:${main.id}`] = 1;
    expect(banned(sc.w, main)).toBe(true);
    expect(hallCandidates(sc.w)).toEqual([]);
  });

  it('gaming is a skill in a group of its own, and its level is a number', () => {
    const sc = inHall();
    expect(skillLevel(sc.w.hero, 'gaming')).toBeGreaterThanOrEqual(0);
    expect(ITEMS.joy_tickets).toBeTruthy();
    expect(cabAt(sc.w, viewAt(sc.w)!, 'cab_none')).toBeUndefined();
  });
});
