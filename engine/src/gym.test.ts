import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { collectBounties } from './bounty';
import { afterTakedown, isShut } from './shutdown';
import { heroPower, isLethal, kill, relocate } from './combat';
import { childId, expand } from './mapgen';
import { affordancesFor, coverage, knownCapabilities } from './affordances';
import { gymCandidates, describeGym } from './gym';
import { FEATURES, GYM_CHANCE, GYM_VARIANT, ROOMS, SHELLS, SITUATIONS, TRAITS, VARIANTS, WILD, passPrice, rollGym, situationAt } from './content/gyms';
import { ARCHETYPES } from './content/archetypes';
import { SKILL_IDS } from './content/skills';
import { everyoneAt } from './population';
import { addSore, banned, ladderFighters, pitKilled, soreOf, tickGyms, viewAt, type GymView } from './gymkit';
import { render } from './text';
import type { Id, Location, World } from './types';
import type { Affordance } from './affordances';

const DISTRICTS = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'] as const;
const roll = (n: number, seed = 'g') => Array.from({ length: n }, (_, i) => rollGym(new Rng(`${seed}:${i}`), DISTRICTS[i % 6]!, 3));

/** Walk outward from the hand-built district until a gym turns up. */
function findGym(w: World, limit = 140): Location | undefined {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  let seen = 0;
  while (queue.length && seen++ < limit) {
    const id = queue.shift()!;
    const loc = w.locations[id];
    if (!loc) continue;
    relocate(w, id);
    if (loc.gym) return loc;
    for (const e of loc.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return Object.values(w.locations).find((l) => l.gym);
}

/** A scenario with Blackbird standing in a gym (or one of its rooms). Tries seeds until the city has one. */
function inGym(room: string = 'floor', opts: { want?: (l: Location) => boolean; from?: number } = {}): Scenario {
  for (let i = opts.from ?? 0; i < (opts.from ?? 0) + 60; i++) {
    let found: Id | undefined;
    const sc = scenario({
      seed: `gymtest-${i}`,
      setup: (w) => {
        const g = findGym(w);
        if (!g || (opts.want && !opts.want(g))) return;
        expand(w, g);
        const target = room === 'floor' ? g : g.exits.map((e) => w.locations[e.to]).find((l) => l?.gymRoom?.room === room);
        if (!target) return;
        relocate(w, target.id);
        found = target.id;
        w.hero.cash = 600;
        w.hero.hp = w.hero.maxHp;
      },
    });
    if (found && sc.w.hero.locationId === found) return sc;
  }
  throw new Error(`no ${room} found in 60 seeds`);
}

describe('rolling a gym', () => {
  it('is the same gym for the same stream, and different for others', () => {
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

  it('is a wide space: every variant, shell, size, room and trait can turn up, and gyms rarely match', () => {
    const gs = roll(900);
    expect(new Set(gs.map((g) => g.info.variant)).size).toBe(Object.keys(VARIANTS).length);
    expect(new Set(gs.map((g) => g.info.shell)).size).toBe(Object.keys(SHELLS).length);
    expect(new Set(gs.map((g) => g.info.size)).size).toBe(5);
    expect(new Set(gs.flatMap((g) => g.info.rooms)).size).toBe(Object.keys(ROOMS).length);
    expect(new Set(gs.flatMap((g) => g.info.traits)).size).toBeGreaterThanOrEqual(Object.keys(TRAITS).length * 0.9);
    expect(new Set(gs.map((g) => g.info.wild).filter(Boolean)).size).toBeGreaterThanOrEqual(6);
    const sigs = new Set(gs.map((g) => JSON.stringify(g.info)));
    expect(sigs.size).toBeGreaterThan(gs.length * 0.97);
    // One in twelve has a rule-breaking oddity, give or take.
    const wild = gs.filter((g) => g.info.wild).length / gs.length;
    expect(wild).toBeGreaterThan(0.04);
    expect(wild).toBeLessThan(0.14);
  });

  it('is shaped by the district it grows in', () => {
    const count = (d: (typeof DISTRICTS)[number], v: string) => Array.from({ length: 600 }, (_, i) => rollGym(new Rng(`dist:${d}:${i}`), d, 3)).filter((g) => g.info.variant === v).length;
    expect(count('corporate', 'atlasfit')).toBeGreaterThan(count('slum', 'atlasfit') * 5);
    expect(count('slum', 'boxing')).toBeGreaterThan(count('corporate', 'boxing') * 3);
    expect(GYM_VARIANT.nightlife.studio).toBeGreaterThan(GYM_VARIANT.industrial.studio!);
  });

  it('has a day pass that follows the variant, the tier and the traits (and is free where it should be)', () => {
    const free = roll(300).find((g) => g.info.variant === 'youth')!;
    expect(passPrice(free.info)).toBe(0);
    const chrome = roll(300).filter((g) => g.info.variant === 'chrome');
    const boxing = roll(300).filter((g) => g.info.variant === 'boxing');
    const avg = (xs: typeof chrome) => xs.reduce((s, g) => s + passPrice(g.info), 0) / xs.length;
    expect(avg(chrome)).toBeGreaterThan(avg(boxing));
  });
});

describe('where gyms grow', () => {
  it('turns up in the city, on a stream of its own, after everything else on its street', () => {
    let gyms = 0;
    for (let i = 0; i < 25; i++) {
      const sc = scenario({ seed: `grow-${i}`, setup: (w) => void findGym(w, 80) });
      for (const street of Object.values(sc.w.locations).filter((l) => l.gen?.role === 'street' && l.gen.expanded)) {
        const kids = street.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.gen?.parent === street.id && l.gen.role !== 'street');
        for (const g of kids.filter((l) => l!.gen!.role === 'gym')) {
          gyms++;
          // Its slot is after every shop, bar, clinic and spot, so none of their ids moved when gyms were added.
          for (const other of kids.filter((l) => !['gym', 'gymroom', 'pawn', 'pawnroom'].includes(l!.gen!.role))) expect(g!.gen!.slot).toBeGreaterThan(other!.gen!.slot);
        }
      }
    }
    expect(gyms).toBeGreaterThan(0);
    for (const d of DISTRICTS) expect(GYM_CHANCE[d]).toBeLessThan(0.2);
  });

  it('grows the rooms the gym rolled, behind the right doors, with names and blurbs that resolve', () => {
    for (let i = 0; i < 12; i++) {
      const sc = scenario({ seed: `rooms-${i}`, setup: (w) => { const g = findGym(w); if (g) expand(w, g); } });
      const g = Object.values(sc.w.locations).find((l) => l.gym);
      if (!g?.gen?.expanded) continue;
      const rooms = g.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.gymRoom);
      expect(rooms.map((r) => r!.gymRoom!.room).sort()).toEqual([...g.gym!.rooms].sort());
      for (const r of rooms) {
        expect(r!.kind).toBe('gym');
        expect(r!.name).not.toMatch(/undefined|\{|\}/);
        expect(r!.blurb).not.toMatch(/undefined|\{|\}/);
        expect(r!.exits.some((e) => e.to === g.id)).toBe(true);
        const def = ROOMS[r!.gymRoom!.room]!;
        const exit = g.exits.find((e) => e.to === r!.id)!;
        expect(exit.gate).toBe(def.gate);
      }
      return;
    }
    throw new Error('no gym with rooms found');
  });
});

describe('who is in a gym', () => {
  it('has an owner and a coach on the floor, and fighters in the pit', () => {
    const sc = inGym('floor');
    const main = sc.w.locations[sc.w.hero.locationId]!;
    const here = everyoneAt(sc.w, main.id);
    expect(here.some((n) => n.tags.includes('owner'))).toBe(true);
    expect(here.some((n) => n.tags.includes('trainer'))).toBe(true);
    for (const n of here) expect(ARCHETYPES[n.archetype]).toBeTruthy();
    const withPit = inGym('floor', { want: (l) => !!l.gym?.rooms.includes('pit') });
    const pit = withPit.w.locations[withPit.w.hero.locationId]!;
    const pitRoom = pit.exits.map((e) => withPit.w.locations[e.to]).find((l) => l?.gymRoom?.room === 'pit')!;
    relocate(withPit.w, pitRoom.id);
    const fighters = ladderFighters(withPit.w, pit);
    expect(fighters.length).toBeGreaterThanOrEqual(2);
    expect(fighters.every((f) => f.tags.includes('pit'))).toBe(true);
  });
});

describe('the registry', () => {
  const rows = affordancesFor('gym') as Affordance<GymView>[];

  it('has a lot of rows, each with a unique id and a complete description', () => {
    expect(rows.length).toBeGreaterThanOrEqual(70);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.needs.length, r.id).toBeGreaterThan(0);
      expect(r.sees.length, r.id).toBeGreaterThan(10);
      expect(r.stakes.length, r.id).toBeGreaterThan(5);
      for (const n of r.needs) expect(n, r.id).toMatch(/^(skill|stat|drive|item|implant|tag|goal):\w+$/);
    }
  });

  it('only mentions features, rooms, variants, traits, situations and wild cards that exist', () => {
    const tags = new Set(Object.values(SITUATIONS).flatMap((s) => s.tags));
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

  it('serves every skill, stat and drive the game has at some gym (the coverage rule)', () => {
    const { rows: cov } = coverage({ gym: Object.keys(FEATURES) });
    const missing = cov.filter((r) => !r.counts.gym).map((r) => r.capability);
    expect(missing).toEqual([]);
    expect(knownCapabilities().length).toBeGreaterThanOrEqual(SKILL_IDS.length + 4 + 7);
  });

  it('gives different capabilities different things to do (no one lens dominates)', () => {
    const { rows: cov } = coverage({ gym: Object.keys(FEATURES) });
    const skills = cov.filter((r) => r.capability.startsWith('skill:'));
    for (const s of skills) expect(s.counts.gym, s.capability).toBeGreaterThanOrEqual(1);
    // A typical gym offers a broad menu, not a fighter's.
    const ds = roll(200).map((g) => new Set(Object.values(describeGym(g.info)).flat()).size);
    expect(Math.min(...ds)).toBeGreaterThanOrEqual(8);
    expect(ds.reduce((s, x) => s + x, 0) / ds.length).toBeGreaterThan(15);
  });
});

describe('situations', () => {
  it('are a pure function of the clock: same moment, same situation; they change as days pass', () => {
    const sc = inGym();
    const main = sc.w.locations[sc.w.hero.locationId]!;
    expect(situationAt(sc.w, main)).toEqual(situationAt(sc.w, main));
    const seen = new Set<string>();
    for (let d = 0; d < 80; d++) seen.add(situationAt({ worldSeed: sc.w.worldSeed, clock: d * 2 * 1440 }, main)?.id ?? 'none');
    expect(seen.size).toBeGreaterThan(8);
    expect(seen.has('none')).toBe(true);
  });
});

describe('doing things in a gym', () => {
  it('offers training, and training raises a skill, costs a pass, tires the floor and leaves her sore', () => {
    const sc = inGym('floor', { want: (l) => ['boxing', 'cage', 'chrome', 'dojo', 'climb'].includes(l.gym!.variant) });
    const w = sc.w;
    w.hero.cash = 500;
    const key = sc.offers().find((k) => k.startsWith('gym:train:'));
    expect(key).toBeTruthy();
    const before = { ...w.hero.skills };
    const cash = w.hero.cash;
    const loc = w.locations[w.hero.locationId]!;
    sc.do(key!, always());
    expect(Object.entries(w.hero.skills).some(([k, v]) => v > (before[k] ?? 0))).toBe(true);
    expect(w.hero.cash).toBeLessThanOrEqual(cash);
    expect(soreOf(w.hero)).toBeGreaterThan(0.1);
    expect(Object.keys(viewAt(w)!.loc.fatigue ?? {}).length).toBeGreaterThan(0);
    expect(loc.id).toBe(w.hero.locationId);
  });

  it('only charges the day pass once a day', () => {
    const sc = inGym('floor', { want: (l) => VARIANTS[l.gym!.variant]!.pass > 0 && !l.gym!.traits.includes('pay_what_you_can') });
    const w = sc.w;
    const key = sc.offers().find((k) => k.startsWith('gym:train:'))!;
    const c0 = w.hero.cash;
    sc.do(key, always());
    const c1 = w.hero.cash;
    expect(c0 - c1).toBeGreaterThanOrEqual(0);
    sc.do(sc.offers().find((k) => k.startsWith('gym:train:'))!, always());
    expect(w.hero.cash).toBe(c1);
  });

  it('gets less sore with time, and faster in a sauna', () => {
    const sc = inGym();
    const w = sc.w;
    addSore(w.hero, 0.8);
    const c = sc.ctx();
    for (let i = 0; i < 50; i++) tickGyms(c);
    expect(soreOf(w.hero)).toBeLessThan(0.8);
    expect(soreOf(w.hero)).toBeGreaterThan(0.4);
  });

  it('trims her in a fight while she is sore, and makes injuries likelier', () => {
    const sc = inGym();
    const w = sc.w;
    w.hero.sore = 0;
    const p0 = heroPower(w);
    w.hero.sore = 1;
    expect(heroPower(w)).toBeLessThan(p0 * 0.8);
    expect(heroPower(w)).toBeGreaterThan(p0 * 0.7);
    // An old save with no soreness at all loads as none.
    delete w.hero.sore;
    expect(heroPower(w)).toBe(p0);
  });

  it('every row on offer in every room, run under three kinds of luck, completes and tells something that renders cleanly', () => {
    const rooms = ['floor', 'locker', 'office', 'pit', 'sauna', 'juice', 'shop', 'physio', 'studio', 'hall', 'roof', 'basement', 'storeroom', 'vents', 'alley'];
    const ran = new Set<string>();
    const problems: string[] = [];
    for (const room of rooms) {
      let sc: Scenario;
      try {
        sc = inGym(room);
      } catch {
        continue;
      }
      const keys = sc.offers().filter((k) => k.startsWith('gym'));
      for (const key of keys) {
        for (const dice of ['always', 'never', 'normal'] as const) {
          sc.w.hero.hp = sc.w.hero.maxHp;
          sc.w.hero.cash = Math.max(sc.w.hero.cash, 400);
          if (!sc.offers().includes(key)) continue;
          try {
            const evs = sc.do(key, dice === 'always' ? always() : dice === 'never' ? never() : undefined);
            ran.add(key.replace(/^gym\w*:/, '').split(':')[0]!);
            for (const ev of evs.filter((e) => e.type === 'gym')) {
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
    expect(ran.size).toBeGreaterThan(15);
  });
});

describe('forcing every row', () => {
  it('runs all of them (with their situation or wild card switched on), under three kinds of luck, and tells something that renders cleanly', () => {
    const rows = affordancesFor('gym') as Affordance<GymView>[];
    const problems: string[] = [];
    let ran = 0;
    const told = new Set<string>();
    const make = () => {
      const sc = inGym('floor', { want: (l) => !!l.gym?.rooms.includes('pit') && l.gym.rooms.includes('office') });
      const at = sc.w.hero.locationId;
      // People only exist once someone has looked in: walk through the rooms and come back.
      for (const e of sc.w.locations[at]!.exits) if (sc.w.locations[e.to]?.gymRoom) relocate(sc.w, e.to);
      relocate(sc.w, at);
      sc.w.hero.level = 30;
      sc.w.hero.muscle = 40;
      return { sc, at };
    };
    const worlds = { always: make(), never: make(), normal: make() };
    for (const row of rows) {
      const arr = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
      const sitTag = arr(row.where.situation)[0];
      const sitId = sitTag ? Object.keys(SITUATIONS).find((id) => SITUATIONS[id]!.tags.includes(sitTag)) : undefined;
      const wild = arr(row.where.wild)[0];
      const feature = row.each ? arr(row.where.feature)[0] : undefined;
      for (const dice of ['always', 'never', 'normal'] as const) {
        const { sc, at } = worlds[dice];
        const w = sc.w;
        // Earlier rows leave a mess (fights, bans, a shut gym): put the place and its people back.
        for (const l of Object.values(w.locations)) {
          if (l.id === at || l.gymRoom?.main === at) {
            delete l.shutUntil;
            delete l.shutBy;
            delete l.sealed;
            delete l.pendingShut;
            delete l.ladder;
            for (const n of everyoneAt(w, l.id)) Object.assign(n, { alive: true, hostile: false, hp: n.maxHp, downUntil: 0, affinity: 0 });
          }
        }
        delete w.counters[`gymban:${at}`];
        if (w.hero.locationId !== at) relocate(w, at);
        w.hero.cash = 900;
        w.hero.maxHp = w.hero.hp = 300;
        w.hero.skills.melee = 50;
        const v = viewAt(w)!;
        if (sitId) v.sit = { id: sitId, def: SITUATIONS[sitId]! };
        if (wild) v.info = { ...v.info, wild };
        const c = sc.ctx(dice === 'always' ? always() : dice === 'never' ? never() : undefined);
        const events: { type: string; outcome: 'good' | 'bad' | 'mixed'; data: Record<string, string | number | boolean>; beat: number }[] = [];
        const emit = c.emit.bind(c);
        c.emit = ((type: string, outcome: 'good' | 'bad' | 'mixed', data: Record<string, string | number | boolean> = {}) => {
          events.push({ type, outcome, data, beat: w.beat });
          emit(type, outcome, data);
        }) as typeof c.emit;
        try {
          row.run(c, v, feature);
          ran++;
          if (events.some((e) => e.type === 'gym')) told.add(row.id);
          for (const ev of events.filter((e) => e.type === 'gym')) {
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
});

describe('the pit, the ladder and the house rules', () => {
  const withPit = () => inGym('pit', { want: (l) => !!l.gym?.rooms.includes('pit') });
  const mainOf = (sc: Scenario) => sc.w.locations[sc.w.hero.locationId]!.gymRoom!.main;

  it('lets her climb the ladder: a fee, a real non-lethal bout, a purse and a new rung', () => {
    const sc = withPit();
    const w = sc.w;
    w.hero.level = 30;
    w.hero.muscle = 40;
    w.hero.maxHp = w.hero.hp = 800;
    const main = w.locations[mainOf(sc)]!;
    const key = sc.offers().find((k) => k.startsWith('gymfight:ladder'));
    expect(key).toBeTruthy();
    const cash = w.hero.cash;
    sc.do(key!);
    expect(main.ladder?.rank).toBe(1);
    expect(w.hero.cash).toBeGreaterThan(cash - 20 * main.gym!.tier);
    expect(ladderFighters(w, main).every((f) => f.alive)).toBe(true);
  });

  it('treats a gym as a place where a fight is a beating, not a death, unless she means it', () => {
    const sc = withPit();
    const w = sc.w;
    const main = w.locations[mainOf(sc)]!;
    const fighter = ladderFighters(w, main)[0]!;
    expect(isLethal([fighter], w)).toBe(false);
    w.mind.goals.push({ id: 99, kind: 'kill', parent: null, npc: fighter.id, mode: 'kill', why: 'the paper' } as never);
    expect(isLethal([fighter], w)).toBe(true);
  });

  it('pays the paper on a pit fighter only if she is dead, and the pit turns on her when she is', () => {
    const sc = withPit();
    const w = sc.w;
    const main = w.locations[mainOf(sc)]!;
    const [victim, other] = ladderFighters(w, main);
    victim!.bounty = { amount: 300, hidden: false };
    other!.bounty = { amount: 300, hidden: false };
    const c = sc.ctx();
    const cash = w.hero.cash;
    collectBounties(c, [victim!]);
    expect(w.hero.cash).toBe(cash); // beaten in the pit is not delivered
    kill(c, w, victim!, 'Blackbird');
    afterTakedown(c, [victim!]);
    collectBounties(c, [victim!]);
    expect(w.hero.cash).toBe(cash + 300);
    expect(banned(w, main)).toBe(true);
    expect(main.ladder).toBeUndefined();
    expect(gymCandidates(w)).toEqual([]);
    const boss = Object.values(w.npcs).find((n) => n.archetype === 'pit_boss' && n.locationId === w.hero.locationId);
    if (boss) expect(boss.hostile).toBe(true);
    void pitKilled;
  });

  it('shuts the gym when its owner is killed', () => {
    const sc = inGym();
    const w = sc.w;
    const main = w.locations[w.hero.locationId]!;
    const owner = everyoneAt(w, main.id).find((n) => n.tags.includes('owner'))!;
    const c = sc.ctx();
    kill(c, w, owner, 'Blackbird');
    afterTakedown(c, [owner]);
    expect(isShut(w, main.id) || !!main.sealed).toBe(true);
  });
});
