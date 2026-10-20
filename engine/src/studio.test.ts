import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { afterTakedown, isShut } from './shutdown';
import { kill, relocate } from './combat';
import { childId, expand } from './mapgen';
import { affordancesFor, type Affordance } from './affordances';
import { STUDIO, studioRate } from './content/studios';
import { rollVenue, venueSituation, SIZES } from './content/venues';
import { ARCHETYPES } from './content/archetypes';
import { makeItem } from './content/items';
import { everyoneAt } from './population';
import { describeVenue, venueAt, type VenueView } from './venuekit';
import { buried, burySong, caughtOdds, dailyRoyalty, dubOf, dubbed, ghostTake, mime, mimeCandidates, pressRecord, recordTake, records, relisten, relistenable, royaltiesTick, studioCandidates, studioUrge } from './studio';
import { judgeSet } from './renown';
import { MIN_PER_DAY } from './clock';
import { render } from './text';
import type { Id, Location, Recording, World } from './types';

const DISTRICTS = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'] as const;
const roll = (n: number, seed = 's') => Array.from({ length: n }, (_, i) => rollVenue(STUDIO, new Rng(`${seed}:${i}`), DISTRICTS[i % 6]!, 3));

/** Walk outward from the hand-built district until a studio turns up. */
function findStudio(w: World, limit = 500): Location | undefined {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  let seen = 0;
  while (queue.length && seen++ < limit) {
    const id = queue.shift()!;
    const loc = w.locations[id];
    if (!loc) continue;
    relocate(w, id);
    if (loc.venue?.kind === 'studio') return loc;
    for (const e of loc.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return Object.values(w.locations).find((l) => l.venue?.kind === 'studio');
}

function inStudio(opts: { want?: (l: Location) => boolean; from?: number } = {}): Scenario {
  for (let i = opts.from ?? 0; i < (opts.from ?? 0) + 150; i++) {
    let found: Id | undefined;
    const sc = scenario({
      seed: `studiotest-${i}`,
      setup: (w) => {
        const g = findStudio(w);
        if (!g || (opts.want && !opts.want(g))) return;
        expand(w, g);
        relocate(w, g.id);
        found = g.id;
        w.hero.cash = 2000;
        w.hero.hp = w.hero.maxHp;
      },
    });
    if (found && sc.w.hero.locationId === found) return sc;
  }
  throw new Error('no studio found in 150 seeds');
}

const mainOf = (sc: Scenario): Location => sc.w.locations[sc.w.hero.locationId]!;
const rec = (o: Partial<Recording> = {}): Recording => ({ id: `r${Math.random()}`, title: 'Test Signal', skill: 'guitar', grade: 50, run: 0, studio: 'X', label: 'indie', copies: 0, ...o });
const arr = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

describe('rolling a studio', () => {
  it('is the same studio for the same stream, and different for others', () => {
    expect(roll(30, 'a')).toEqual(roll(30, 'a'));
    expect(roll(30, 'a')).not.toEqual(roll(30, 'b'));
  });

  it('only ever names things the tables know, and reads cleanly', () => {
    for (const g of roll(500)) {
      const i = g.info;
      expect(i.kind).toBe('studio');
      expect(STUDIO.variants[i.variant]).toBeTruthy();
      expect(STUDIO.shells[i.shell]).toBeTruthy();
      for (const t of i.traits) expect(STUDIO.traits[t]).toBeTruthy();
      for (const f of i.features) expect(STUDIO.features[f], f).toBeTruthy();
      if (i.wild) expect(STUDIO.wild[i.wild]).toBeTruthy();
      expect(g.blurb).not.toMatch(/\{|\}|undefined|NaN/);
      expect(g.name).not.toMatch(/\{/);
      expect(studioRate(i)).toBeGreaterThanOrEqual(0);
    }
  });

  it('is a wide space', () => {
    const gs = roll(1500);
    expect(new Set(gs.map((g) => g.info.variant)).size).toBe(Object.keys(STUDIO.variants).length);
    expect(new Set(gs.map((g) => g.info.shell)).size).toBe(Object.keys(STUDIO.shells).length);
    expect(new Set(gs.map((g) => g.info.size)).size).toBe(SIZES.length);
    expect(new Set(gs.flatMap((g) => g.info.traits)).size).toBeGreaterThanOrEqual(Object.keys(STUDIO.traits).length * 0.9);
    expect(new Set(gs.map((g) => g.info.wild).filter(Boolean)).size).toBe(Object.keys(STUDIO.wild).length);
    expect(new Set(gs.map((g) => JSON.stringify(g.info))).size).toBeGreaterThan(gs.length * 0.97);
    const wild = gs.filter((g) => g.info.wild).length / gs.length;
    expect(wild).toBeGreaterThan(0.04);
    expect(wild).toBeLessThan(0.14);
    expect(Object.keys(STUDIO.traits).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(STUDIO.situations).length).toBeGreaterThanOrEqual(15);
    for (const [id, v] of Object.entries(STUDIO.variants)) {
      expect(v.names.length, id).toBeGreaterThanOrEqual(8);
      expect(v.blurbs.length, id).toBeGreaterThanOrEqual(3);
      expect(v.wall.length, id).toBeGreaterThanOrEqual(3);
    }
    for (const s of Object.values(STUDIO.situations)) for (const x of [...(s.not ?? []), ...(s.only ?? [])]) expect(STUDIO.variants[x], x).toBeTruthy();
  });

  it('is shaped by the district', () => {
    const count = (d: (typeof DISTRICTS)[number], v: string) => Array.from({ length: 600 }, (_, i) => rollVenue(STUDIO, new Rng(`d:${d}:${i}`), d, 3)).filter((g) => g.info.variant === v).length;
    expect(count('corporate', 'muse')).toBeGreaterThan(count('slum', 'muse') * 5);
    expect(count('industrial', 'plant')).toBeGreaterThan(count('corporate', 'plant') * 3);
  });
});

describe('where studios grow', () => {
  it('turns up in the city as a venue with its own faction, after everything else on its street', () => {
    const sc = inStudio();
    const main = mainOf(sc);
    expect(main.kind).toBe('studio');
    expect(main.faction?.startsWith('v:')).toBe(true);
    const street = sc.w.locations[main.gen!.parent]!;
    const kids = street.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.gen?.parent === street.id && l.gen.role !== 'street');
    for (const other of kids.filter((l) => !l!.venue)) expect(main.gen!.slot).toBeGreaterThan(other!.gen!.slot);
  });

  it('has a producer (or a robot) running it, and everyone is a real kind of person', () => {
    const sc = inStudio();
    const here = everyoneAt(sc.w, mainOf(sc).id);
    for (const n of here) expect(ARCHETYPES[n.archetype], n.archetype).toBeTruthy();
    expect(here.some((n) => n.tags.includes('owner'))).toBe(true);
  });

  it('shuts when its owner is killed', () => {
    const sc = inStudio();
    const boss = everyoneAt(sc.w, mainOf(sc).id).find((n) => n.tags.includes('owner'))!;
    const c = sc.ctx();
    kill(c, sc.w, boss, 'Blackbird');
    afterTakedown(c, [boss]);
    expect(isShut(sc.w, mainOf(sc).id) || !!mainOf(sc).sealed || sc.w.hero.locationId !== boss.locationId).toBe(true);
  });
});

describe('the registry', () => {
  const rows = affordancesFor('studio') as Affordance<VenueView>[];
  it('has a lot of rows, each complete, naming only real things', () => {
    expect(rows.length).toBeGreaterThanOrEqual(50);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    const tags = new Set(Object.values(STUDIO.situations).flatMap((s) => s.tags));
    for (const r of rows) {
      expect(r.needs.length, r.id).toBeGreaterThan(0);
      expect(r.sees.length, r.id).toBeGreaterThan(10);
      for (const n of r.needs) expect(n, r.id).toMatch(/^(skill|stat|drive|item|implant|tag|goal):\w+$/);
      for (const f of arr(r.where.feature)) expect(STUDIO.features[f], `${r.id} ${f}`).toBeTruthy();
      for (const f of arr(r.where.variant)) expect(STUDIO.variants[f], `${r.id} ${f}`).toBeTruthy();
      for (const f of arr(r.where.trait)) expect(STUDIO.traits[f], `${r.id} ${f}`).toBeTruthy();
      for (const f of arr(r.where.situation)) expect(tags.has(f), `${r.id} ${f}`).toBe(true);
      for (const f of arr(r.where.wild)) expect(STUDIO.wild[f], `${r.id} ${f}`).toBeTruthy();
    }
  });
  it('draws on a wide variety of skills, stats and drives', () => {
    const needs = new Set(rows.flatMap((r) => r.needs));
    expect([...needs].filter((n) => n.startsWith('skill:')).length).toBeGreaterThanOrEqual(25);
    expect([...needs].filter((n) => n.startsWith('stat:')).length).toBeGreaterThanOrEqual(4);
    expect([...needs].filter((n) => n.startsWith('drive:')).length).toBeGreaterThanOrEqual(6);
  });
  it('gives a typical studio a broad menu', () => {
    const ds = roll(200).map((g) => describeVenue(g.info).length);
    expect(ds.reduce((s, x) => s + x, 0) / ds.length).toBeGreaterThan(14);
  });
  it('situations are a pure function of the clock', () => {
    const sc = inStudio();
    const main = mainOf(sc);
    expect(venueSituation(STUDIO, sc.w, main)).toEqual(venueSituation(STUDIO, sc.w, main));
    const seen = new Set<string>();
    for (let d = 0; d < 120; d++) seen.add(venueSituation(STUDIO, { worldSeed: sc.w.worldSeed, clock: d * 2 * MIN_PER_DAY }, main)?.id ?? 'none');
    expect(seen.size).toBeGreaterThan(7);
  });
});

describe('recordings', () => {
  it('puts a take on tape at the grade she plays, and it outlives her hands', () => {
    const sc = inStudio();
    const w = sc.w;
    w.hero.skills.guitar = 4000;
    w.hero.inventory.push(makeItem('vintage_guitar'));
    const v = venueAt(w, 'studio')!;
    const cash = w.hero.cash;
    const r = recordTake(sc.ctx(), v, 'guitar')!;
    expect(r).toBeTruthy();
    expect(r.grade).toBeGreaterThan(10);
    expect(records(w)).toContain(r);
    expect(w.hero.cash).toBeLessThan(cash + 1);
    // A new body: the skill goes, the record stays.
    w.hero.skills.guitar = 0;
    expect(records(w)[0]!.grade).toBe(r.grade);
  });

  it('offers a take, a dub and a press as candidates', () => {
    const sc = inStudio({ want: (l) => l.venue!.features.includes('tape_machine') || l.venue!.features.includes('mixing_desk') });
    const w = sc.w;
    w.hero.skills.vocals = 2000;
    expect(sc.offers().some((k) => k.startsWith('record:vocals'))).toBe(true);
    records(w).push(rec({ grade: 70, run: -1 }));
    expect(sc.offers().some((k) => k.startsWith('dub:'))).toBe(true);
    expect(sc.offers().some((k) => k.startsWith('relisten:'))).toBe(true);
    expect(studioCandidates(w).length).toBeGreaterThan(5);
  });

  it('lets her learn back from a past life, once a night', () => {
    const sc = inStudio();
    const w = sc.w;
    const r = rec({ grade: 60, run: w.legacy.runs - 1 });
    records(w).push(r);
    expect(relistenable(w, r)).toBe(true);
    const before = w.hero.skills.guitar ?? 0;
    relisten(sc.ctx(), venueAt(w, 'studio')!, r);
    expect(w.hero.skills.guitar ?? 0).toBeGreaterThan(before);
    expect(relistenable(w, r)).toBe(false);
    // Not from this life, nor from a ghost.
    expect(relistenable(w, rec({ run: w.legacy.runs }))).toBe(false);
    expect(relistenable(w, rec({ run: -1, label: 'ghost' }))).toBe(false);
  });

  it('pays royalties into the account for the days that pass, and Muse keeps most of its own', () => {
    const sc = inStudio();
    const w = sc.w;
    records(w).push(rec({ copies: 1000, grade: 50 }));
    expect(dailyRoyalty(w, rec({ copies: 1000, label: 'muse' }))).toBeLessThan(dailyRoyalty(w, rec({ copies: 1000 })));
    const c = sc.ctx();
    royaltiesTick(c);
    const acct = w.legacy.account;
    w.clock += 3 * MIN_PER_DAY;
    royaltiesTick(c);
    expect(w.legacy.account).toBeGreaterThan(acct);
    const again = w.legacy.account;
    royaltiesTick(c);
    expect(w.legacy.account).toBe(again);
  });

  it('presses copies and dubs cassettes', () => {
    const sc = inStudio();
    const w = sc.w;
    const r = rec();
    records(w).push(r);
    const v = venueAt(w, 'studio')!;
    pressRecord(sc.ctx(), v, r);
    expect(r.copies).toBeGreaterThan(0);
    w.hero.inventory.push(dubOf(r));
    expect(dubbed(w)).toContain(r);
  });

  it('a ghost take is somebody else\'s grade, and somebody else may say so', () => {
    const sc = inStudio();
    const w = sc.w;
    const v = venueAt(w, 'studio')!;
    const r = ghostTake(sc.ctx(), v, 'guitar');
    if (r) {
      expect(r.label).toBe('ghost');
      expect(r.ghost).toBeTruthy();
      r.copies = 500;
      w.hero.fame = 100;
      const c = sc.ctx(always());
      royaltiesTick(c);
      w.clock += 20 * MIN_PER_DAY;
      royaltiesTick(c);
      expect(r.exposed).toBe(true);
      expect(w.hero.fame).toBeLessThan(100);
    }
  });
});

describe('the backing track', () => {
  const onStage = () => {
    const sc = inStudio();
    const w = sc.w;
    const bar = Object.values(w.locations).find((l) => l.kind === 'bar' && l.id === 'halo_floor')!;
    relocate(w, bar.id);
    bar.crowded = true;
    const r = rec({ grade: 60 });
    records(w).push(r);
    w.hero.inventory.push(dubOf(r));
    w.legacy.repute = { guitar: 60 };
    return { sc, w, r };
  };

  it('is on offer wherever there is a crowd and a tape better than her hands', () => {
    const { w } = onStage();
    expect(mimeCandidates(w).some((k) => k.key.startsWith('mime_guitar:'))).toBe(true);
    expect(caughtOdds(w, 4)).toBeGreaterThan(0);
  });

  it('fools a crowd: they judge the tape, not her (no letdown for a legend with fresh hands)', () => {
    const { sc, w, r } = onStage();
    const fame = (w.hero.fame = 50);
    const evs = sc.run((c) => mime(c, r), rollsFool());
    expect(evs.some((e) => e.type === 'mime_guitar' && e.outcome === 'good')).toBe(true);
    const before = w.hero.fame;
    sc.run((c) => judgeSet(c, 'mime_guitar', 'guitar', evs));
    expect(w.hero.fame).toBeGreaterThanOrEqual(before);
    expect(before).toBeGreaterThan(fame - 1);
  });

  it('caught, it is a scandal', () => {
    const { sc, w, r } = onStage();
    w.hero.fame = 100;
    const evs = sc.run((c) => mime(c, r), always());
    expect(evs.some((e) => e.type === 'mime_guitar' && e.data.scandal)).toBe(true);
    expect(w.hero.fame).toBeLessThan(100);
    for (const ev of evs) for (const l of render(ev, { rng: new Rng('r'), personality: w.hero.personality, realName: 'Brenda Pilchard' })) expect(l.text).not.toMatch(/\{|\}|undefined|NaN/);
  });
});

/** Never caught (the first roll is the catch), then ordinary luck. */
const rollsFool = () => never();

describe('the dragon broadcast', () => {
  it('buries her song in the loop, or brings Atlas', () => {
    const sc = inStudio();
    const w = sc.w;
    w.legacy.songs = [{ id: 's1', title: 'Overpass Lullaby', kind: 'triumph', quality: 30, run: 0 }];
    const v = venueAt(w, 'studio')!;
    burySong(sc.ctx(always()), v);
    expect(buried(w)).toBe(true);
    const sc2 = inStudio({ from: 3 });
    sc2.w.legacy.songs = w.legacy.songs;
    sc2.w.hero.maxHp = sc2.w.hero.hp = 500;
    burySong(sc2.ctx(never()), venueAt(sc2.w, 'studio')!);
    expect(buried(sc2.w)).toBe(false);
    expect(sc2.w.heat.atlas ?? 0).toBeGreaterThan(0);
  });
});

describe('forcing every row', () => {
  it('runs all of them under three kinds of luck and tells something that renders cleanly', () => {
    const rows = affordancesFor('studio') as Affordance<VenueView>[];
    const problems: string[] = [];
    const told = new Set<string>();
    const make = () => {
      const sc = inStudio({ want: (l) => l.venue!.features.length >= 5 });
      sc.w.hero.level = 30;
      return { sc, at: sc.w.hero.locationId };
    };
    const worlds = { always: make(), never: make(), normal: make() };
    for (const row of rows) {
      const sitTag = arr(row.where.situation)[0];
      const sitId = sitTag ? Object.keys(STUDIO.situations).find((id) => STUDIO.situations[id]!.tags.includes(sitTag)) : undefined;
      const wild = arr(row.where.wild)[0];
      for (const dice of ['always', 'never', 'normal'] as const) {
        const { sc, at } = worlds[dice];
        const w = sc.w;
        const l0 = w.locations[at]!;
        delete l0.shutUntil;
        delete l0.shutBy;
        delete l0.sealed;
        delete l0.pendingShut;
        for (const n of everyoneAt(w, at)) Object.assign(n, { alive: true, hostile: false, hp: n.maxHp, downUntil: 0, affinity: 0, cash: 400 });
        delete w.counters[`venueban:${at}`];
        if (w.hero.locationId !== at) relocate(w, at);
        w.hero.cash = 900;
        w.hero.maxHp = w.hero.hp = 300;
        w.hero.skills.melee = 50;
        w.heat.npd = 3;
        w.legacy.muse = { lettered: true, lumina: { version: 6, warmth: 0, flame: 0 } };
        w.legacy.records = [rec({ label: 'muse', studio: l0.name })];
        w.hero.inventory = [makeItem('bootleg_tapes'), makeItem('vintage_guitar')];
        const v = venueAt(w, 'studio')!;
        if (sitId) v.sit = { id: sitId, def: STUDIO.situations[sitId]! };
        if (wild) v.info = { ...v.info, wild };
        const c = sc.ctx(dice === 'always' ? always() : dice === 'never' ? never() : undefined);
        const evs: { type: string; outcome: 'good' | 'bad' | 'mixed'; data: Record<string, string | number | boolean>; beat: number }[] = [];
        const emit = c.emit.bind(c);
        c.emit = ((type: string, outcome: 'good' | 'bad' | 'mixed', data: Record<string, string | number | boolean> = {}) => {
          evs.push({ type, outcome, data, beat: w.beat });
          emit(type, outcome, data);
        }) as typeof c.emit;
        try {
          row.run(c, v, row.each ? v.features[0] : undefined);
          if (evs.some((e) => e.type === 'studio')) told.add(row.id);
          for (const ev of evs.filter((e) => e.type === 'studio')) {
            for (const l of render(ev as never, { rng: new Rng('r'), personality: w.hero.personality, realName: 'Brenda Pilchard' })) if (/\{|\}|undefined|NaN/.test(l.text)) problems.push(`${row.id}/${dice}: ${l.text}`);
          }
        } catch (e) {
          problems.push(`${row.id}/${dice} threw: ${(e as Error).message}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(rows.map((r) => r.id).filter((id) => !told.has(id))).toEqual([]);
  });

  it('every candidate on offer completes and renders cleanly', () => {
    const problems: string[] = [];
    const ran = new Set<string>();
    for (const from of [0, 40, 80]) {
      let sc: Scenario;
      try {
        sc = inStudio({ from });
      } catch {
        continue;
      }
      sc.w.hero.skills.guitar = 900;
      sc.w.hero.inventory.push(makeItem('vintage_guitar'));
      sc.w.legacy.records = [rec({ run: -1, grade: 60 })];
      for (const key of sc.offers()) {
        if (!/^(studio|record|ghost_take|dub|press|relisten|bury_song)/.test(key)) continue;
        for (const dice of ['always', 'never', 'normal'] as const) {
          sc.w.hero.hp = sc.w.hero.maxHp;
          sc.w.hero.cash = Math.max(sc.w.hero.cash, 900);
          if (!sc.offers().includes(key)) continue;
          try {
            const evs = sc.do(key, dice === 'always' ? always() : dice === 'never' ? never() : undefined);
            ran.add(key.split(':')[0]!);
            for (const ev of evs) for (const l of render(ev, { rng: new Rng('r'), personality: sc.w.hero.personality, realName: 'Brenda Pilchard' })) if (/\{|\}|undefined|NaN/.test(l.text)) problems.push(`${key}/${dice}: ${l.text}`);
          } catch (e) {
            problems.push(`${key}/${dice} threw: ${(e as Error).message}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    expect(ran.size).toBeGreaterThan(2);
  });

  it('pulls her toward a studio with a past-life master to learn back', () => {
    const sc = inStudio({ want: (l) => l.venue!.features.includes('tape_machine') || l.venue!.features.includes('mixing_desk') });
    const w = sc.w;
    const main = mainOf(sc);
    records(w).push(rec({ grade: 70, run: -1 }));
    relocate(w, main.gen!.parent);
    expect(studioUrge(w, main.id).bonus).toBeGreaterThan(0.3);
  });
});
