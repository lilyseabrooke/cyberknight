import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { afterTakedown, isShut } from './shutdown';
import { kill, relocate } from './combat';
import { childId, expand } from './mapgen';
import { affordancesFor, type Affordance } from './affordances';
import { rollVenue, venueSituation, SIZES, type VenueTables } from './content/venues';
import { ARCHETYPES } from './content/archetypes';
import { everyoneAt } from './population';
import { describeVenue, venueAt, type VenueView } from './venuekit';
import { MIN_PER_DAY } from './clock';
import { render } from './text';
import type { Id, Location, VenueKind, World } from './types';
import './venues';

/**
 * The tests every music venue gets (the studio's, generalised): the tables, the space, where it grows, who is in it, the
 * registry, situations as a function of the clock, and a forced run of every row and every candidate on offer. Each kind's
 * own test file calls `venueSuite` and then tests its system.
 */

export const DISTRICTS = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'] as const;
const arr = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** Walk outward from the hand-built district until a venue of this kind turns up. */
export function findVenue(w: World, kind: VenueKind, limit = 600): Location | undefined {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  let seen = 0;
  while (queue.length && seen++ < limit) {
    const id = queue.shift()!;
    const loc = w.locations[id];
    if (!loc) continue;
    relocate(w, id);
    if (loc.venue?.kind === kind) return loc;
    for (const e of loc.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return Object.values(w.locations).find((l) => l.venue?.kind === kind);
}

/** A scenario with Blackbird standing in a venue of this kind. Tries seeds until the city has one. */
export function inVenue(kind: VenueKind, opts: { want?: (l: Location) => boolean; from?: number; tries?: number } = {}): Scenario {
  const from = opts.from ?? 0;
  for (let i = from; i < from + (opts.tries ?? 200); i++) {
    let found: Id | undefined;
    const sc = scenario({
      seed: `${kind}test-${i}`,
      setup: (w) => {
        const g = findVenue(w, kind);
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
  throw new Error(`no ${kind} found`);
}

export const mainOf = (sc: Scenario): Location => sc.w.locations[sc.w.hero.locationId]!;

export interface SuiteOpts {
  /** Set up a world before each forced row (cash, items, counters a row needs). */
  prime?: (w: World) => void;
  /** Candidate families (key prefixes) the kind's own system offers, to force along with the rows. */
  deals?: RegExp;
  /** How many rows at least. */
  rows?: number;
  /** How many distinct skills at least. */
  skills?: number;
  /** A district pair to check the district shaping: [district, variant, other district]. */
  shaped?: [(typeof DISTRICTS)[number], string, (typeof DISTRICTS)[number]];
  /** Rolled with the map (false for a kind that appears by other means). */
  mapped?: boolean;
  /** Situation tags to count the menu at (a place built around its hours is judged at one of them). */
  menuTags?: string[];
  /** A scenario standing in one, for a kind the map does not grow (`from` varies the seed). */
  make?: (from: number) => Scenario;
}

export function venueSuite(t: VenueTables, o: SuiteOpts = {}): void {
  const kind = t.kind;
  const roll = (n: number, seed = 'v') => Array.from({ length: n }, (_, i) => rollVenue(t, new Rng(`${seed}:${i}`), DISTRICTS[i % 6]!, 3));

  describe(`rolling a ${kind}`, () => {
    it('is the same for the same stream, and different for others', () => {
      expect(roll(30, 'a')).toEqual(roll(30, 'a'));
      expect(roll(30, 'a')).not.toEqual(roll(30, 'b'));
    });

    it('only ever names things the tables know, and reads cleanly', () => {
      for (const g of roll(500)) {
        const i = g.info;
        expect(i.kind).toBe(kind);
        expect(t.variants[i.variant]).toBeTruthy();
        expect(t.shells[i.shell]).toBeTruthy();
        for (const x of i.traits) expect(t.traits[x]).toBeTruthy();
        for (const f of i.features) expect(t.features[f], f).toBeTruthy();
        if (i.wild) expect(t.wild[i.wild]).toBeTruthy();
        expect(g.blurb).not.toMatch(/\{|\}|undefined|NaN/);
        expect(g.name).not.toMatch(/\{/);
      }
    });

    it('is a wide space', () => {
      const gs = roll(1500);
      expect(new Set(gs.map((g) => g.info.variant)).size).toBe(Object.keys(t.variants).length);
      expect(new Set(gs.map((g) => g.info.shell)).size).toBe(Object.keys(t.shells).length);
      expect(new Set(gs.map((g) => g.info.size)).size).toBe(SIZES.length);
      expect(new Set(gs.flatMap((g) => g.info.traits)).size).toBeGreaterThanOrEqual(Object.keys(t.traits).length * 0.9);
      expect(new Set(gs.map((g) => g.info.wild).filter(Boolean)).size).toBe(Object.keys(t.wild).length);
      expect(new Set(gs.map((g) => JSON.stringify(g.info))).size).toBeGreaterThan(gs.length * 0.97);
      const wild = gs.filter((g) => g.info.wild).length / gs.length;
      expect(wild).toBeGreaterThan(0.04);
      expect(wild).toBeLessThan(0.14);
      expect(Object.keys(t.traits).length).toBeGreaterThanOrEqual(24);
      expect(Object.keys(t.situations).length).toBeGreaterThanOrEqual(12);
      expect(Object.keys(t.shells).length).toBeGreaterThanOrEqual(10);
      for (const [id, v] of Object.entries(t.variants)) {
        expect(v.names.length, id).toBeGreaterThanOrEqual(8);
        expect(v.blurbs.length, id).toBeGreaterThanOrEqual(3);
        expect(v.wall.length, id).toBeGreaterThanOrEqual(3);
      }
      for (const s of Object.values(t.situations)) for (const x of [...(s.not ?? []), ...(s.only ?? [])]) expect(t.variants[x], x).toBeTruthy();
      for (const x of Object.values(t.traits)) for (const f of [...(x.add ?? [])]) expect(t.features[f], f).toBeTruthy();
      for (const x of Object.values(t.shells)) for (const f of [...(x.add ?? [])]) expect(t.features[f], f).toBeTruthy();
      for (const x of Object.values(t.variants)) for (const f of [...x.floor, ...Object.keys(x.more)]) expect(t.features[f], f).toBeTruthy();
    });

    if (o.shaped) {
      const [d, v, other] = o.shaped;
      it('is shaped by the district', () => {
        const count = (dd: (typeof DISTRICTS)[number]) => Array.from({ length: 600 }, (_, i) => rollVenue(t, new Rng(`d:${dd}:${i}`), dd, 3)).filter((g) => g.info.variant === v).length;
        expect(count(d)).toBeGreaterThan(count(other) * 2);
      });
    }
  });

  if (o.mapped !== false) {
    describe(`where ${kind}s grow`, () => {
      it('turns up in the city as a venue with its own faction, after everything that is not a venue on its street', () => {
        const sc = inVenue(kind);
        const main = mainOf(sc);
        expect(main.kind).toBe(kind);
        expect(main.faction?.startsWith('v:')).toBe(true);
        const street = sc.w.locations[main.gen!.parent]!;
        const kids = street.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.gen?.parent === street.id && l.gen.role !== 'street');
        for (const other of kids.filter((l) => !l!.venue)) expect(main.gen!.slot).toBeGreaterThan(other!.gen!.slot);
      });

      it('has somebody running it, and everyone is a real kind of person', () => {
        const sc = inVenue(kind);
        const here = everyoneAt(sc.w, mainOf(sc).id);
        for (const n of here) expect(ARCHETYPES[n.archetype], n.archetype).toBeTruthy();
        expect(here.some((n) => n.tags.includes('owner'))).toBe(true);
      });

      it('shuts when its owner is killed', () => {
        const sc = inVenue(kind);
        const boss = everyoneAt(sc.w, mainOf(sc).id).find((n) => n.tags.includes('owner'))!;
        const c = sc.ctx();
        kill(c, sc.w, boss, 'Blackbird');
        afterTakedown(c, [boss]);
        expect(isShut(sc.w, mainOf(sc).id) || !!mainOf(sc).sealed || sc.w.hero.locationId !== boss.locationId).toBe(true);
      });

      it('situations are a pure function of the clock', () => {
        const sc = inVenue(kind);
        const main = mainOf(sc);
        expect(venueSituation(t, sc.w, main)).toEqual(venueSituation(t, sc.w, main));
        const seen = new Set<string>();
        for (let d = 0; d < 120; d++) seen.add(venueSituation(t, { worldSeed: sc.w.worldSeed, clock: d * 2 * MIN_PER_DAY }, main)?.id ?? 'none');
        expect(seen.size).toBeGreaterThan(6);
      });
    });
  }

  describe(`the ${kind} registry`, () => {
    const rows = affordancesFor(kind) as Affordance<VenueView>[];
    it('has a lot of rows, each complete, naming only real things', () => {
      expect(rows.length).toBeGreaterThanOrEqual(o.rows ?? 45);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      const tags = new Set([...Object.values(t.situations).flatMap((s) => s.tags), ...(t.phaseTags ?? [])]);
      for (const r of rows) {
        expect(r.needs.length, r.id).toBeGreaterThan(0);
        expect(r.sees.length, r.id).toBeGreaterThan(10);
        for (const n of r.needs) expect(n, r.id).toMatch(/^(skill|stat|drive|item|implant|tag|goal):\w+$/);
        for (const f of arr(r.where.feature)) expect(t.features[f], `${r.id} ${f}`).toBeTruthy();
        for (const f of arr(r.where.variant)) expect(t.variants[f], `${r.id} ${f}`).toBeTruthy();
        for (const f of arr(r.where.trait)) expect(t.traits[f], `${r.id} ${f}`).toBeTruthy();
        for (const f of arr(r.where.situation)) expect(tags.has(f), `${r.id} ${f}`).toBe(true);
        for (const f of arr(r.where.wild)) expect(t.wild[f], `${r.id} ${f}`).toBeTruthy();
      }
    });
    it('draws on a wide variety of skills, stats and drives', () => {
      const needs = new Set(rows.flatMap((r) => r.needs));
      expect([...needs].filter((n) => n.startsWith('skill:')).length).toBeGreaterThanOrEqual(o.skills ?? 22);
      expect([...needs].filter((n) => n.startsWith('stat:')).length).toBeGreaterThanOrEqual(3);
      expect([...needs].filter((n) => n.startsWith('drive:')).length).toBeGreaterThanOrEqual(5);
    });
    it('gives a typical one a broad menu', () => {
      const ds = roll(200).map((g) => describeVenue(g.info, o.menuTags ?? []).length);
      expect(ds.reduce((s, x) => s + x, 0) / ds.length).toBeGreaterThan(12);
    });
  });

  describe(`forcing every ${kind} row`, () => {
    it('runs all of them under three kinds of luck and tells something that renders cleanly', () => {
      const rows = affordancesFor(kind) as Affordance<VenueView>[];
      const problems: string[] = [];
      const told = new Set<string>();
      const make = () => {
        const sc = o.make ? o.make(0) : inVenue(kind, { want: (l) => l.venue!.features.length >= 4 });
        sc.w.hero.level = 30;
        return { sc, at: sc.w.hero.locationId };
      };
      const worlds = { always: make(), never: make(), normal: make() };
      for (const row of rows) {
        const sitTag = arr(row.where.situation)[0];
        const sitId = sitTag ? Object.keys(t.situations).find((id) => t.situations[id]!.tags.includes(sitTag)) : undefined;
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
          o.prime?.(w);
          const v = venueAt(w, kind)!;
          if (sitId) v.sit = { id: sitId, def: t.situations[sitId]! };
          else if (sitTag && t.phaseTags?.includes(sitTag)) v.sit = { id: sitTag, def: { label: sitTag, line: '', weight: 1, tags: [sitTag] } };
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
            if (evs.some((e) => e.type === kind)) told.add(row.id);
            for (const ev of evs.filter((e) => e.type === kind)) {
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
      const fams = o.deals ?? new RegExp(`^${kind}`);
      for (const from of [0, 40, 80]) {
        let sc: Scenario;
        try {
          sc = o.make ? o.make(from) : inVenue(kind, { from });
        } catch {
          continue;
        }
        o.prime?.(sc.w);
        for (const key of sc.offers()) {
          if (!fams.test(key) && !key.startsWith(kind)) continue;
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
      expect(ran.size).toBeGreaterThan(1);
    });
  });
}
