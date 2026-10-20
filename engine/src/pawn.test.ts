import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { afterTakedown, isShut } from './shutdown';
import { isLethal, kill, relocate } from './combat';
import { childId, expand } from './mapgen';
import { affordancesFor } from './affordances';
import { pawnCandidates, describePawn } from './pawn';
import { ROLLED_GUITAR, FEATURES, PAWN_CHANCE, PAWN_VARIANT, ROOMS, SHELLS, SITUATIONS, TRAITS, VARIANTS, WILD, holdDays, lotState, offerFraction, redeemPrice, retailPrice, rollPawn, situationAt } from './content/pawns';
import { ARCHETYPES } from './content/archetypes';
import { ITEMS, makeItem } from './content/items';
import { everyoneAt } from './population';
import { banned, ensureShelf, hockable, tickPawns, viewAt, type PawnView } from './pawnkit';
import { render } from './text';
import { dayOf, MIN_PER_DAY } from './clock';
import type { Id, Location, PawnLot, World } from './types';
import type { Affordance } from './affordances';

const DISTRICTS = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'] as const;
const roll = (n: number, seed = 'p') => Array.from({ length: n }, (_, i) => rollPawn(new Rng(`${seed}:${i}`), DISTRICTS[i % 6]!, 3));

/** Walk outward from the hand-built district until a pawn shop turns up. */
function findPawn(w: World, limit = 320): Location | undefined {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  let seen = 0;
  while (queue.length && seen++ < limit) {
    const id = queue.shift()!;
    const loc = w.locations[id];
    if (!loc) continue;
    relocate(w, id);
    if (loc.pawn) return loc;
    for (const e of loc.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return Object.values(w.locations).find((l) => l.pawn);
}

/** A scenario with Blackbird standing in a pawn shop (or one of its rooms). Tries seeds until the city has one. */
function inPawn(room: string = 'floor', opts: { want?: (l: Location) => boolean; from?: number } = {}): Scenario {
  for (let i = opts.from ?? 0; i < (opts.from ?? 0) + 80; i++) {
    let found: Id | undefined;
    const sc = scenario({
      seed: `pawntest-${i}`,
      setup: (w) => {
        const g = findPawn(w);
        if (!g || (opts.want && !opts.want(g))) return;
        expand(w, g);
        const target = room === 'floor' ? g : g.exits.map((e) => w.locations[e.to]).find((l) => l?.pawnRoom?.room === room);
        if (!target) return;
        relocate(w, target.id);
        found = target.id;
        w.hero.cash = 600;
        w.hero.hp = w.hero.maxHp;
      },
    });
    if (found && sc.w.hero.locationId === found) return sc;
  }
  throw new Error(`no ${room} found in 80 seeds`);
}

const mainOf = (sc: Scenario): Location => {
  const at = sc.w.locations[sc.w.hero.locationId]!;
  return at.pawn ? at : sc.w.locations[at.pawnRoom!.main]!;
};
const owner = (sc: Scenario) => everyoneAt(sc.w, mainOf(sc).id).find((n) => n.tags.includes('owner'))!;
const holdOf = (sc: Scenario, id: string): PawnLot => ({ item: makeItem(id), hers: true, paid: 40, since: dayOf(sc.w.clock), held: dayOf(sc.w.clock) + 5, until: dayOf(sc.w.clock) + 8 });

describe('rolling a pawn shop', () => {
  it('is the same shop for the same stream, and different for others', () => {
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

  it('stocks only goods that exist, and every variant stocks something', () => {
    for (const [id, v] of Object.entries(VARIANTS)) {
      const known = Object.keys(v.stock).filter((k) => ITEMS[k] || k === ROLLED_GUITAR);
      expect(known.length, id).toBeGreaterThanOrEqual(6);
      expect(known.length, `${id} has a stock id that is not an item`).toBe(Object.keys(v.stock).length);
      expect(v.names.length, id).toBeGreaterThanOrEqual(12);
      expect(v.blurbs.length, id).toBeGreaterThanOrEqual(4);
      expect(v.wall.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('is a wide space: every variant, shell, size, room and trait can turn up, and shops rarely match', () => {
    const gs = roll(1200);
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
    expect(Object.keys(WILD).length).toBeGreaterThanOrEqual(8);
  });

  it('is shaped by the district it grows in', () => {
    const count = (d: (typeof DISTRICTS)[number], v: string) => Array.from({ length: 600 }, (_, i) => rollPawn(new Rng(`dist:${d}:${i}`), d, 3)).filter((g) => g.info.variant === v).length;
    expect(count('corporate', 'atlasasset')).toBeGreaterThan(count('slum', 'atlasasset') * 5);
    expect(count('nightlife', 'instruments')).toBeGreaterThan(count('industrial', 'instruments') * 3);
    expect(PAWN_VARIANT.industrial.hardware).toBeGreaterThan(PAWN_VARIANT.market.hardware!);
  });

  it('pays a fraction of an item\'s worth, sells it for a markup, and the wild cards bend both', () => {
    const base = roll(300).filter((g) => !g.info.wild && g.info.traits.length === 0);
    expect(base.length).toBeGreaterThan(10);
    const item = makeItem('chrono_watch');
    for (const g of base) {
      const f = offerFraction(g.info);
      expect(f).toBeGreaterThan(0.1);
      expect(f).toBeLessThan(0.7);
      expect(retailPrice(g.info, item)).toBeGreaterThan(item.value);
    }
    const g = base[0]!.info;
    expect(retailPrice({ ...g, wild: 'fire_sale' }, item)).toBeLessThan(item.value);
    expect(offerFraction({ ...g, wild: 'bottomless' })).toBeGreaterThan(offerFraction(g) * 1.3);
    expect(offerFraction({ ...g, wild: 'savant' })).toBeCloseTo(1, 5);
  });

  it('holds hers for a few days, then a few more at retail, then sells on; and the price of buying back goes up each day', () => {
    const g = roll(40).find((x) => !x.info.wild)!.info;
    const lot: PawnLot = { item: makeItem('pearl_string'), hers: true, paid: 60, since: 10, held: 15, until: 19 };
    expect(lotState(lot, 12)).toBe('held');
    expect(lotState(lot, 15)).toBe('forfeit');
    expect(lotState(lot, 18)).toBe('forfeit');
    expect(lotState(lot, 19)).toBe('gone');
    expect(lotState({ ...lot, hers: false }, 12)).toBe('house');
    const prices = [11, 12, 13, 14].map((d) => redeemPrice(g, lot, d));
    for (let i = 1; i < prices.length; i++) expect(prices[i]!).toBeGreaterThan(prices[i - 1]!);
    expect(prices[0]!).toBeGreaterThan(lot.paid);
    const rng = new Rng('hold');
    for (const x of roll(60)) expect(holdDays(x.info, rng)).toBeGreaterThanOrEqual(1);
  });
});

describe('where pawn shops grow', () => {
  it('turns up in the city, on a stream of its own, after everything else on its street (the gym included; the property office comes after it)', () => {
    let pawns = 0;
    for (let i = 0; i < 25; i++) {
      const sc = scenario({ seed: `grow-${i}`, setup: (w) => void findPawn(w, 100) });
      for (const street of Object.values(sc.w.locations).filter((l) => l.gen?.role === 'street' && l.gen.expanded)) {
        const kids = street.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.gen?.parent === street.id && l.gen.role !== 'street');
        for (const p of kids.filter((l) => l!.gen!.role === 'pawn')) {
          pawns++;
          for (const other of kids.filter((l) => l!.gen!.role !== 'pawn' && l!.gen!.role !== 'pawnroom' && l!.gen!.role !== 'realty' && l!.gen!.role !== 'chop' && l!.gen!.role !== 'hub')) expect(p!.gen!.slot).toBeGreaterThan(other!.gen!.slot);
        }
      }
    }
    expect(pawns).toBeGreaterThan(0);
    for (const d of DISTRICTS) expect(PAWN_CHANCE[d]).toBeLessThan(0.2);
  });

  it('grows the rooms it rolled, behind the right doors, with names and blurbs that resolve', () => {
    for (let i = 0; i < 24; i++) {
      const sc = scenario({ seed: `prooms-${i}`, setup: (w) => { const g = findPawn(w); if (g) expand(w, g); } });
      const g = Object.values(sc.w.locations).find((l) => l.pawn && l.pawn.rooms.length >= 2);
      if (!g?.gen?.expanded) continue;
      const rooms = g.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.pawnRoom);
      expect(rooms.map((r) => r!.pawnRoom!.room).sort()).toEqual([...g.pawn!.rooms].sort());
      for (const r of rooms) {
        expect(r!.kind).toBe('pawn');
        expect(r!.name).not.toMatch(/undefined|\{|\}/);
        expect(r!.blurb).not.toMatch(/undefined|\{|\}/);
        expect(r!.exits.some((e) => e.to === g.id)).toBe(true);
        const def = ROOMS[r!.pawnRoom!.room]!;
        expect(g.exits.find((e) => e.to === r!.id)!.gate).toBe(def.gate);
      }
      return;
    }
    throw new Error('no pawn shop with rooms found');
  });
});

describe('who is in a pawn shop', () => {
  it('has a broker on the floor, and everyone is a real kind of person', () => {
    const sc = inPawn('floor');
    const main = mainOf(sc);
    const here = everyoneAt(sc.w, main.id);
    expect(here.some((n) => n.tags.includes('owner') && n.archetype === 'pawn_broker')).toBe(true);
    for (const n of here) expect(ARCHETYPES[n.archetype]).toBeTruthy();
    expect(main.faction?.startsWith('v:')).toBe(true);
  });

  it('puts a fence in the back (and the paper on them), a guard in the cage, a tinker at the bench', () => {
    for (const [room, role] of [['bay', 'pawn_fence'], ['workshop', 'pawn_tinker'], ['cage', 'pawn_guard']] as const) {
      let ok = false;
      for (let from = 0; from < 480 && !ok; from += 80) {
        let sc: Scenario;
        try {
          sc = inPawn(room, { from });
        } catch {
          continue;
        }
        const people = everyoneAt(sc.w, sc.w.hero.locationId);
        if (people.some((n) => n.archetype === role)) ok = true;
        if (room === 'workshop') expect(people.every((n) => ARCHETYPES[n.archetype])).toBe(true);
      }
      expect(ok, `${room} has a ${role}`).toBe(true);
    }
  });
});

describe('the registry', () => {
  const rows = affordancesFor('pawn') as Affordance<PawnView>[];

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

  it('gives different capabilities different things to do, and a typical shop offers a broad menu', () => {
    const ds = roll(200).map((g) => new Set(Object.values(describePawn(g.info)).flat()).size);
    expect(Math.min(...ds)).toBeGreaterThanOrEqual(7);
    expect(ds.reduce((s, x) => s + x, 0) / ds.length).toBeGreaterThan(14);
  });
});

describe('situations', () => {
  it('are a pure function of the clock: same moment, same situation; they change as days pass', () => {
    const sc = inPawn();
    const main = mainOf(sc);
    expect(situationAt(sc.w, main)).toEqual(situationAt(sc.w, main));
    const seen = new Set<string>();
    for (let d = 0; d < 90; d++) seen.add(situationAt({ worldSeed: sc.w.worldSeed, clock: d * 2 * 1440 }, main)?.id ?? 'none');
    expect(seen.size).toBeGreaterThan(8);
    expect(seen.has('none')).toBe(true);
  });
});

describe('the shelf', () => {
  it('is made the first time it is looked at, is the same for the same seed and day, and loads fine on an old save with none', () => {
    const a = inPawn('floor', { from: 5 });
    const b = inPawn('floor', { from: 5 });
    const ma = mainOf(a);
    expect(ma.shelf).toBeUndefined();
    const v = viewAt(a.w)!;
    expect(v).toBeTruthy();
    expect(ma.shelf!.length).toBeGreaterThan(2);
    viewAt(b.w);
    expect(mainOf(b).shelf!.map((l) => l.item.id)).toEqual(ma.shelf!.map((l) => l.item.id));
    for (const l of ma.shelf!) {
      expect(ITEMS[l.item.id]).toBeTruthy();
      expect(l.hers).toBe(false);
      expect(l.until).toBeGreaterThan(v.day);
    }
    // An old save has no shelf; it simply grows one.
    delete ma.shelf;
    expect(viewAt(a.w)!.main.shelf!.length).toBeGreaterThan(0);
  });

  it('turns over as days pass: old stock is sold on and new stock comes in', () => {
    const sc = inPawn();
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const before = main.shelf!.map((l) => l.item.id + l.since);
    w.clock += MIN_PER_DAY * 25;
    ensureShelf(w, main);
    const day = dayOf(w.clock);
    expect(main.shelf!.every((l) => l.until > day)).toBe(true);
    const after = main.shelf!.map((l) => l.item.id + l.since);
    expect(after.filter((x) => before.includes(x)).length).toBeLessThan(before.length);
    tickPawns(sc.ctx());
  });
});

describe('hocking, buying back, buying', () => {
  it('lets her hock a thing: she is paid a fraction of its worth, it leaves her pockets and sits on the shelf with her name on it', () => {
    const sc = inPawn('floor', { want: (l) => l.pawn!.wild !== 'bottomless' });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const boss = owner(sc);
    boss.cash = 800;
    w.hero.inventory = [makeItem('pearl_string')];
    w.hero.cash = 3;
    const key = sc.offers().find((k) => k.startsWith('pawndeal:hock'));
    expect(key).toBeTruthy();
    sc.do(key!, always());
    const lot = main.shelf!.find((l) => l.hers);
    expect(lot).toBeTruthy();
    expect(lot!.item.id).toBe('pearl_string');
    expect(w.hero.inventory.some((i) => i.id === 'pearl_string')).toBe(false);
    expect(lot!.paid).toBeGreaterThan(0);
    expect(lot!.paid).toBeLessThan(lot!.item.value);
    expect(w.hero.cash).toBe(3 + lot!.paid);
    expect(boss.cash).toBe(800 - lot!.paid);
    expect(lot!.held!).toBeGreaterThan(lot!.since);
    expect(lot!.until).toBeGreaterThan(lot!.held!);
  });

  it('never hocks what she is wielding or wearing, nor her best melee backup, nor keys and consumables', () => {
    const sc = inPawn('floor');
    const h = sc.w.hero;
    const wielded = h.weapon;
    const bat = makeItem('judgment');
    const pipe = makeItem('excalibur');
    bat.tags.push('melee');
    pipe.tags.push('melee');
    h.inventory = [bat, pipe, makeItem('forged_pass'), makeItem('stim'), makeItem('gold_band'), makeItem('credchip')];
    const ids = hockable(h).map((i) => i.id);
    expect(ids).not.toContain(wielded.id === 'judgment' ? 'x' : wielded.id === 'excalibur' ? 'excalibur' : 'x');
    expect(ids).not.toContain('judgment');
    expect(ids).not.toContain('forged_pass');
    expect(ids).not.toContain('stim');
    expect(ids).toContain('gold_band');
    expect(ids).toContain('credchip');
    expect(h.inventory.includes(h.weapon)).toBe(false);
  });

  it('a broker with an empty till cannot pay (the till is finite), unless the till has no bottom', () => {
    const sc = inPawn('floor', { want: (l) => l.pawn!.wild !== 'bottomless' });
    const w = sc.w;
    viewAt(w);
    const boss = owner(sc);
    boss.cash = 0;
    w.hero.inventory = [makeItem('pearl_string')];
    const key = sc.offers().find((k) => k.startsWith('pawndeal:hock'))!;
    const cash = w.hero.cash;
    sc.do(key, always());
    expect(w.hero.cash).toBe(cash);
    expect(w.hero.inventory.some((i) => i.id === 'pearl_string')).toBe(true);
    expect(mainOf(sc).shelf!.some((l) => l.hers)).toBe(false);
  });

  it('lets her buy it back: the price is what she was paid plus interest that grows each day; she gets the item and the shelf loses the lot', () => {
    const sc = inPawn('floor', { want: (l) => !l.pawn!.wild });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const info = main.pawn!;
    const lot = holdOf(sc, 'pearl_string');
    lot.since = dayOf(w.clock) - 1;
    lot.held = dayOf(w.clock) + 4;
    main.shelf!.push(lot);
    const priceNow = redeemPrice(info, lot, dayOf(w.clock));
    expect(priceNow).toBeGreaterThan(lot.paid);
    expect(redeemPrice(info, lot, dayOf(w.clock) + 3)).toBeGreaterThan(priceNow);
    w.hero.cash = 5000;
    w.hero.inventory = [];
    const key = sc.offers().find((k) => k.startsWith('pawndeal:buy-back'));
    expect(key).toBeTruthy();
    const cash = w.hero.cash;
    sc.do(key!, never());
    expect(main.shelf!.includes(lot)).toBe(false);
    expect(cash - w.hero.cash).toBeGreaterThanOrEqual(lot.paid);
    expect(w.hero.inventory.some((i) => i.id === 'pearl_string') || w.hero.weapon.id === 'pearl_string').toBe(true);
  });

  it('after the hold her item is up for retail (dearer), and after a few more days it is sold on and gone', () => {
    const sc = inPawn('floor', { want: (l) => !l.pawn!.wild });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const day = dayOf(w.clock);
    const lot = holdOf(sc, 'pearl_string');
    lot.held = day - 1;
    lot.until = day + 2;
    lot.since = day - 4;
    main.shelf!.push(lot);
    expect(lotState(lot, day)).toBe('forfeit');
    w.hero.cash = 5000;
    const before = w.hero.cash;
    const key = sc.offers().find((k) => k.startsWith('pawndeal:buy-back'))!;
    sc.do(key, never());
    expect(before - w.hero.cash).toBeGreaterThan(redeemPrice(main.pawn!, { ...lot, held: day + 9, until: day + 20 }, day) * 0.8);
    // And one she leaves: gone.
    const lot2 = holdOf(sc, 'ukulele');
    lot2.held = day - 3;
    lot2.until = day + 1;
    lot2.since = day - 6;
    main.shelf!.push(lot2);
    w.clock += MIN_PER_DAY * 3;
    ensureShelf(w, main);
    expect(main.shelf!.includes(lot2)).toBe(false);
  });

  it('lets her buy off the shelf, at a price that can move, and the lot is gone from it', () => {
    const sc = inPawn('floor', { want: (l) => !['counterfeit', 'boomerang'].includes(l.pawn!.wild ?? '') });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    main.shelf!.push({ item: makeItem('walkman'), hers: false, paid: 0, since: dayOf(w.clock), until: dayOf(w.clock) + 9 });
    w.hero.cash = 5000;
    const key = sc.offers().find((k) => k.startsWith('pawndeal:buy') && !k.startsWith('pawndeal:buy-back'));
    expect(key).toBeTruthy();
    const n = main.shelf!.length;
    const cash = w.hero.cash;
    sc.do(key!, never());
    expect(main.shelf!.length).toBe(n - 1);
    expect(w.hero.cash).toBeLessThan(cash);
  });

  it('sells outright for more than a hock, and the thing goes on the house shelf', () => {
    const sc = inPawn('floor', { want: (l) => !l.pawn!.wild });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    owner(sc).cash = 900;
    w.hero.inventory = [makeItem('pearl_string')];
    const key = sc.offers().find((k) => k.startsWith('pawndeal:sell-outright'));
    expect(key).toBeTruthy();
    const cash = w.hero.cash;
    sc.do(key!, always());
    expect(w.hero.cash).toBeGreaterThan(cash);
    expect(w.hero.inventory.some((i) => i.id === 'pearl_string')).toBe(false);
    expect(main.shelf!.some((l) => l.item.id === 'pearl_string' && !l.hers)).toBe(true);
  });
});

describe('stealing from the shelf', () => {
  it('a lift takes a lot off the shelf, hot to the shop for good; a failure bars her', () => {
    const sc = inPawn('floor', { want: (l) => !l.pawn!.wild });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    main.shelf!.push({ item: makeItem('pearl_string'), hers: false, paid: 0, since: dayOf(w.clock), until: dayOf(w.clock) + 9 });
    const key = sc.offers().find((k) => k.startsWith('pawn:lift-from-the-window')) ?? sc.offers().find((k) => k.startsWith('pawn:lift-on-a-smile'));
    if (!key) return;
    const n = main.shelf!.length;
    sc.do(key, always());
    expect(main.shelf!.length).toBe(n - 1);
    expect(w.counters[`pawnhot:${main.id}`]).toBe(1);
    const sc2 = inPawn('floor', { want: (l) => !l.pawn!.wild });
    viewAt(sc2.w);
    const k2 = sc2.offers().find((k) => k.startsWith('pawn:lift-from-the-window'));
    if (!k2) return;
    sc2.do(k2, never());
    expect(banned(sc2.w, mainOf(sc2))).toBe(true);
    expect(pawnCandidates(sc2.w)).toEqual([]);
  });
});

describe('forcing every row', () => {
  it('runs all of them (with their situation or wild card switched on), under three kinds of luck, and tells something that renders cleanly', () => {
    const rows = affordancesFor('pawn') as Affordance<PawnView>[];
    const problems: string[] = [];
    let ran = 0;
    const told = new Set<string>();
    const make = () => {
      const sc = inPawn('floor', { want: (l) => l.pawn!.rooms.length >= 3 });
      const at = sc.w.hero.locationId;
      // People only exist once someone has looked in: walk through the rooms and come back.
      for (const e of sc.w.locations[at]!.exits) if (sc.w.locations[e.to]?.pawnRoom) relocate(sc.w, e.to);
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
        // Earlier rows leave a mess (fights, bans, a shut shop): put the place and its people back.
        for (const l of Object.values(w.locations)) {
          if (l.id === at || l.pawnRoom?.main === at) {
            delete l.shutUntil;
            delete l.shutBy;
            delete l.sealed;
            delete l.pendingShut;
            for (const n of everyoneAt(w, l.id)) Object.assign(n, { alive: true, hostile: false, hp: n.maxHp, downUntil: 0, affinity: 0, cash: 400 });
          }
        }
        delete w.counters[`pawnban:${at}`];
        if (w.hero.locationId !== at) relocate(w, at);
        w.hero.cash = 900;
        w.hero.maxHp = w.hero.hp = 300;
        w.hero.skills.melee = 50;
        // Something to hock, something hers on the shelf, something to buy.
        w.hero.inventory = [makeItem('pearl_string'), makeItem('signet_ring'), makeItem('walkman')];
        const v = viewAt(w)!;
        const main = v.main;
        main.shelf = main.shelf!.filter((l) => !l.hers);
        const day = dayOf(w.clock);
        main.shelf.push({ item: makeItem('chrono_watch'), hers: true, paid: 50, since: day, held: day + 5, until: day + 9 });
        main.shelf.push({ item: makeItem('ukulele'), hers: false, paid: 0, since: day, until: day + 9 });
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
          if (events.some((e) => e.type === 'pawn')) told.add(row.id);
          for (const ev of events.filter((e) => e.type === 'pawn')) {
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
    const rooms = ['floor', 'office', 'vault', 'workshop', 'showroom', 'parlour', 'bay', 'cellar', 'roof', 'vents', 'alley', 'cage'];
    const ran = new Set<string>();
    const problems: string[] = [];
    for (const room of rooms) {
      let sc: Scenario;
      try {
        sc = inPawn(room);
      } catch {
        continue;
      }
      for (const key of sc.offers().filter((k) => k.startsWith('pawn'))) {
        for (const dice of ['always', 'never', 'normal'] as const) {
          sc.w.hero.hp = sc.w.hero.maxHp;
          sc.w.hero.cash = Math.max(sc.w.hero.cash, 400);
          if (!sc.offers().includes(key)) continue;
          try {
            const evs = sc.do(key, dice === 'always' ? always() : dice === 'never' ? never() : undefined);
            ran.add(key.replace(/^pawn\w*:/, '').split(':')[0]!);
            for (const ev of evs.filter((e) => e.type === 'pawn')) {
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
  it('treats a pawn shop as a place where a fight is a beating, not a death', () => {
    const sc = inPawn('floor');
    const w = sc.w;
    const guy = everyoneAt(w, mainOf(sc).id).find((n) => n.tags.includes('owner'))!;
    expect(isLethal([guy], w)).toBe(false);
  });

  it('shuts the shop when its owner is killed', () => {
    const sc = inPawn();
    const w = sc.w;
    const main = mainOf(sc);
    const boss = owner(sc);
    const c = sc.ctx();
    kill(c, w, boss, 'Blackbird');
    afterTakedown(c, [boss]);
    expect(isShut(w, main.id) || !!main.sealed).toBe(true);
  });
});
