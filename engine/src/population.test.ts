import { describe, expect, it } from 'vitest';
import { createRun, step } from './run';
import { createWorld } from './world';
import { BASE_MIN_PER_BEAT, MIN_PER_DAY, START_MINUTE, catchUp, clockLabel, elapse, offlineMinutes, phaseOf } from './clock';
import { AWAY, addNpc, allNpcs, everyoneAt, hauntersOf, moveNpc, npcsAt, rebuildIndex, removeNpc, setHaunts, verifyIndex } from './population';
import { defaultOpinion, influenceOf, inheritInfluence, relation, setRelation } from './factions';
import { pinAt, placeAt, settle, settleAt } from './movement';
import { ROSTERS, populate, rehome, sendAway, slotId } from './roster';
import { spawnNpc } from './content/archetypes';
import { Rng } from './rng';
import { relocate } from './combat';
import type { Location, World } from './types';

const fresh = (seed = 'pop'): World => createWorld({ seed });

/** A brand-new place, as the map generator will hand them over. */
function newPlace(w: World, id: string, kind: Location['kind'], over: Partial<Location> = {}): Location {
  const loc: Location = {
    id, name: id, kind, exits: [], security: 2, crowded: false, outdoors: kind === 'street', tossTo: 'street_main', fleeTo: 'street_main',
    visits: 0, cameras: 0, graffiti: 0, territory: null, ...over,
  };
  w.locations[id] = loc;
  return loc;
}

describe('the clock', () => {
  it('starts in the evening and names the time of day', () => {
    const w = fresh();
    expect(w.clock).toBe(START_MINUTE);
    expect(clockLabel(w.clock)).toBe('20:00');
    expect(phaseOf(w.clock)).toBe('dusk');
    expect(phaseOf(23 * 60)).toBe('night');
    expect(phaseOf(MIN_PER_DAY + 6 * 60)).toBe('dawn');
    expect(phaseOf(12 * 60)).toBe('day');
  });

  it('advances with every beat and whenever something takes time', () => {
    const { world } = createRun({ seed: 'tick' });
    const t0 = world.clock;
    step(world);
    step(world);
    expect(world.clock).toBe(t0 + 2 * BASE_MIN_PER_BEAT);
    elapse(world, 45);
    expect(world.clock).toBe(t0 + 2 * BASE_MIN_PER_BEAT + 45);
    elapse(world, -10);
    expect(world.clock).toBe(t0 + 2 * BASE_MIN_PER_BEAT + 45);
  });

  it('turns time away from the game into world time, at its own pace and with a ceiling', () => {
    expect(offlineMinutes(0)).toBe(0);
    expect(offlineMinutes(60_000)).toBeGreaterThan(0);
    expect(offlineMinutes(60_000)).toBeLessThan(60);
    expect(offlineMinutes(1e15)).toBe(7 * MIN_PER_DAY);
    const w = fresh();
    const t0 = w.clock;
    expect(catchUp(w, 3_600_000)).toBe(w.clock - t0);
  });
});

describe('the population store', () => {
  it('answers who is where the way a scan of everybody would, in the same order', () => {
    const w = fresh();
    for (const loc of Object.keys(w.locations)) {
      const scan = allNpcs(w).filter((n) => n.alive && n.locationId === loc && n.downUntil <= w.beat);
      expect(npcsAt(w, loc).map((n) => n.id)).toEqual(scan.map((n) => n.id));
    }
    expect(verifyIndex(w)).toEqual([]);
  });

  it('keeps its indexes straight through adds, moves, removals and haunts', () => {
    const w = fresh();
    const p = spawnNpc(new Rng('x'), 'p1', 'patron', 'street_main');
    addNpc(w, p);
    expect(npcsAt(w, 'street_main').map((n) => n.id)).toContain('p1');
    moveNpc(w, p, 'halo_floor');
    expect(npcsAt(w, 'street_main').map((n) => n.id)).not.toContain('p1');
    expect(npcsAt(w, 'halo_floor').map((n) => n.id)).toContain('p1');
    setHaunts(w, p, { street_main: 2, halo_alley: 1 });
    expect(hauntersOf(w, 'street_main').map((n) => n.id)).toEqual(['p1']);
    setHaunts(w, p, { halo_alley: 1 });
    expect(hauntersOf(w, 'street_main')).toEqual([]);
    expect(verifyIndex(w)).toEqual([]);
    removeNpc(w, 'p1');
    expect(w.npcs.p1).toBeUndefined();
    expect(everyoneAt(w, 'halo_floor').map((n) => n.id)).not.toContain('p1');
    expect(verifyIndex(w)).toEqual([]);
  });

  it('leaves the injured out of the room and the dead out of the count', () => {
    const w = fresh();
    const [a, b] = npcsAt(w, 'halo_floor');
    a!.alive = false;
    b!.downUntil = w.beat + 10;
    expect(npcsAt(w, 'halo_floor')).not.toContain(a);
    expect(npcsAt(w, 'halo_floor')).not.toContain(b);
    expect(everyoneAt(w, 'halo_floor')).toContain(a);
  });

  it('rebuilds itself for a world that arrives as plain JSON', () => {
    const w = fresh();
    const copy = JSON.parse(JSON.stringify(w)) as World;
    expect(npcsAt(copy, 'halo_floor').map((n) => n.id)).toEqual(npcsAt(w, 'halo_floor').map((n) => n.id));
    copy.npcs = { ...copy.npcs };
    rebuildIndex(copy);
    expect(verifyIndex(copy)).toEqual([]);
  });

  it('stays in step with a whole night of play', () => {
    for (const seed of ['idx-a', 'idx-b']) {
      const { world } = createRun({ seed });
      for (let i = 0; i < 250 && !world.over; i++) {
        step(world);
        expect(verifyIndex(world)).toEqual([]);
      }
    }
  }, 120_000);
});

describe('factions', () => {
  it('stand to each other as their relations say, and family trumps all', () => {
    const w = fresh();
    expect(relation(w, 'vipers', 'vipers')).toBeGreaterThan(50);
    expect(relation(w, 'npd', 'vipers')).toBeLessThan(0);
    expect(relation(w, 'vipers', 'npd')).toBe(relation(w, 'npd', 'vipers'));
    expect(relation(w, null, 'npd')).toBe(0);
    setRelation(w.factions, 'vipers', 'sixers', -90);
    expect(relation(w, 'sixers', 'vipers')).toBe(-90);
  });

  it('give a stranger a default opinion without anyone having stored one', () => {
    const w = fresh();
    const cop = w.npcs.cop_0 ?? allNpcs(w).find((n) => n.archetype === 'cop')!;
    const ganger = allNpcs(w).find((n) => n.archetype === 'ganger')!;
    expect(defaultOpinion(w, cop, ganger)).toBeLessThan(0);
    expect(defaultOpinion(w, ganger, ganger)).toBeGreaterThan(0);
  });

  it('thin out as they spread, and a new place leans on its neighbours', () => {
    const w = fresh();
    const a = newPlace(w, 'a', 'street', { territory: 'vipers' });
    const b = newPlace(w, 'b', 'street', { territory: 'vipers' });
    const inherited = inheritInfluence(w, [a, b], new Rng('inh'));
    expect(inherited.vipers).toBeGreaterThan(0.5);
    expect(Object.values(inherited).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 5);
    expect(influenceOf(a)).toEqual({ vipers: 1 });
    expect(inheritInfluence(w, [newPlace(w, 'c', 'street')], new Rng('none'))).not.toHaveProperty('x');
  });
});

describe('populating a new place', () => {
  it('fills it from its kind, with people who belong to it', () => {
    const w = fresh();
    const bar = newPlace(w, 'roadhouse', 'bar', { security: 3, faction: 'roadhouse' });
    w.factions.roadhouse = { id: 'roadhouse', name: 'The Roadhouse', kind: 'venue', relations: {} };
    const people = populate(w, bar);
    expect(people.length).toBeGreaterThan(1);
    expect(bar.populated).toBe(true);
    expect(people.every((n) => n.locationId === 'roadhouse' && n.home === 'roadhouse')).toBe(true);
    const keeper = people.find((n) => n.archetype === 'bartender');
    expect(keeper?.faction).toBe('roadhouse');
    expect(keeper?.haunts).toEqual({ roadhouse: 1 });
    expect(people.filter((n) => n.archetype === 'patron').every((n) => n.ephemeral)).toBe(true);
    expect(verifyIndex(w)).toEqual([]);
  });

  it('never makes twins, and never leaves an empty place for a kind that has people', () => {
    const w = fresh();
    const shop = newPlace(w, 'kiosk', 'shop', { security: 1 });
    populate(w, shop);
    const before = npcsAt(w, 'kiosk').length;
    expect(populate(w, shop)).toEqual([]);
    expect(npcsAt(w, 'kiosk')).toHaveLength(before);
    expect(before).toBe(1);
  });

  it('makes the same people whatever order the world is explored in', () => {
    const roll = (order: string[]) => {
      const w = fresh('explore');
      for (const id of order) newPlace(w, id, id.startsWith('b') ? 'bar' : 'street', { security: 3 });
      for (const id of order) populate(w, w.locations[id]!);
      return Object.fromEntries(order.map((id) => [id, everyoneAt(w, id).map((n) => `${n.id}|${n.name}|${n.level}|${n.faction}|${n.loadout.map((i) => i.name).join(',')}`)]));
    };
    expect(roll(['b1', 's1', 'b2'])).toEqual(roll(['b2', 'b1', 's1']));
  });

  it('draws gang members from whoever leans on the place', () => {
    const w = fresh('gangs');
    const turf = newPlace(w, 'turf', 'street', { security: 3, influence: { sixers: 1 } });
    // Enough streets that at least one slot rolls a ganger.
    const gangers = [turf, ...Array.from({ length: 12 }, (_, i) => newPlace(w, `t${i}`, 'street', { influence: { sixers: 1 } }))]
      .flatMap((l) => populate(w, l)).filter((n) => n.archetype === 'ganger');
    expect(gangers.length).toBeGreaterThan(0);
    expect(gangers.every((n) => n.faction === 'sixers')).toBe(true);
  });

  it('does not reroll the dead', () => {
    const w = fresh();
    const shop = newPlace(w, 'kiosk', 'shop');
    const [keeper] = populate(w, shop);
    keeper!.alive = false;
    shop.populated = false; // the place is looked at again, e.g. in a later run
    expect(populate(w, shop)).toEqual([]);
    expect(w.npcs[keeper!.id]!.alive).toBe(false);
    expect(allNpcs(w).filter((n) => n.archetype === 'shopkeeper' && n.locationId === 'kiosk' && n.alive)).toHaveLength(0);
  });

  it('casts somebody who already exists before making someone new', () => {
    let cast = 0;
    for (let i = 0; i < 30; i++) {
      const w = fresh(`cast${i}`);
      const wanderer = allNpcs(w).find((n) => n.archetype === 'pharmacist')!;
      sendAway(w, wanderer);
      expect(wanderer.locationId).toBe(AWAY);
      const shop = newPlace(w, 'kiosk', 'shop');
      w.factions.shop!.relations = {};
      const count = allNpcs(w).length;
      const [keeper] = populate(w, shop);
      // A shopkeeper is not a pharmacist: only the matching role is ever cast.
      expect(keeper!.archetype).toBe('shopkeeper');
      expect(allNpcs(w)).toHaveLength(count + 1);
      const druggist = allNpcs(w).find((n) => n.archetype === 'pharmacist')!;
      expect(druggist.locationId).toBe(AWAY);
    }
    for (let i = 0; i < 40; i++) {
      const w = fresh(`cast2-${i}`);
      const keeper0 = spawnNpc(new Rng(`k${i}`), 'old_keeper', 'shopkeeper', AWAY, { faction: 'shop' });
      addNpc(w, keeper0);
      const shop = newPlace(w, 'kiosk', 'shop');
      const [got] = populate(w, shop);
      if (got!.id === 'old_keeper') {
        cast++;
        expect(got!.locationId).toBe('kiosk');
        expect(got!.home).toBe('kiosk');
      } else {
        expect(allNpcs(w).find((n) => n.id === 'old_keeper')!.locationId).toBe(AWAY);
      }
      expect(verifyIndex(w)).toEqual([]);
    }
    expect(cast).toBeGreaterThan(5);
    expect(cast).toBeLessThan(40);
  });

  it('covers every kind of place with archetypes that exist', () => {
    const w = fresh();
    for (const [kind, slots] of Object.entries(ROSTERS)) {
      const loc = newPlace(w, `k_${kind}`, kind as Location['kind'], { security: 9 });
      expect(() => populate(w, loc)).not.toThrow();
      expect(slots.every((s) => s.count[0] <= s.count[1])).toBe(true);
    }
  });

  it('builds ids from the place and the slot', () => {
    expect(slotId('bartender', 'roadhouse', 0, 0)).toBe('bartender@roadhouse.0.0');
  });
});

describe('where people are when nobody is looking', () => {
  const wanderer = (w: World) => {
    const street = newPlace(w, 'lane', 'street');
    const bar = newPlace(w, 'tap', 'bar');
    street.exits = [{ to: 'tap', label: 'the tap', hidden: false, gate: null }];
    bar.exits = [{ to: 'lane', label: 'out', hidden: false, gate: null }];
    const n = spawnNpc(new Rng('wander'), 'wanderer', 'patron', 'lane');
    addNpc(w, n);
    setHaunts(w, n, { lane: 1, tap: 1 });
    n.settledAt = w.clock;
    return n;
  };

  it('is a pure function of the clock: same time, same place, however you got there', () => {
    const w = fresh();
    const n = wanderer(w);
    const samples = Array.from({ length: 40 }, (_, i) => w.clock + i * 37);
    const first = samples.map((t) => placeAt(w, n, t));
    expect(samples.map((t) => placeAt(w, n, t))).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(1);
    // A different world, a different life.
    const other = fresh('elsewhere');
    const m = wanderer(other);
    expect(samples.map((t) => placeAt(other, m, t))).not.toEqual(first);
  });

  it('settles on arrival, and a long absence costs the same as a short one', () => {
    const w = fresh();
    const n = wanderer(w);
    settleAt(w, 'lane', w.clock + 5);
    expect(n.locationId).toBe('lane'); // too soon: they haven't had time to go anywhere
    const later = w.clock + 5 * MIN_PER_DAY;
    settleAt(w, 'lane', later);
    settleAt(w, 'tap', later);
    expect(n.locationId).toBe(placeAt(w, n, later));
    expect(verifyIndex(w)).toEqual([]);
  });

  it('draws people towards places they haunt, even ones they are not standing in', () => {
    const w = fresh();
    const n = wanderer(w);
    let arrived = false;
    for (let t = w.clock; t < w.clock + 3 * MIN_PER_DAY && !arrived; t += 45) {
      if (placeAt(w, n, t) === 'tap') {
        settleAt(w, 'tap', t);
        arrived = n.locationId === 'tap';
      }
    }
    expect(arrived).toBe(true);
  });

  it('keeps them put for a stretch after she leaves them', () => {
    const w = fresh();
    const n = wanderer(w);
    pinAt(w, 'lane', w.clock + 600);
    expect(settle(w, n, w.clock + 610)).toBe(false);
    expect(n.locationId).toBe('lane');
  });

  it('leaves people without haunts exactly where they are, forever', () => {
    const w = fresh();
    const dutch = w.npcs.dutch!;
    expect(placeAt(w, dutch, w.clock + 10 * MIN_PER_DAY)).toBe('halo_floor');
    expect(settle(w, dutch, w.clock + 10 * MIN_PER_DAY)).toBe(false);
  });

  it('does not move the unconscious, the hostile or companions', () => {
    const w = fresh();
    const n = wanderer(w);
    n.hostile = true;
    const t = w.clock + 5 * MIN_PER_DAY;
    expect(settle(w, n, t)).toBe(false);
    n.hostile = false;
    moveNpc(w, n, '_companion');
    expect(settle(w, n, t)).toBe(false);
    expect(n.locationId).toBe('_companion');
  });

  it('puts the people sent off the map where the new place can find them', () => {
    const w = fresh();
    const n = wanderer(w);
    rehome(w, n, w.locations.tap!, false);
    sendAway(w, n);
    expect(n.locationId).toBe(AWAY);
    expect(n.haunts).toBeUndefined();
    expect(verifyIndex(w)).toEqual([]);
  });
});

describe('walking into somewhere new', () => {
  it('populates it as she arrives, once, and the people are there to deal with', () => {
    const w = fresh('arrive');
    const road = newPlace(w, 'roadhouse', 'bar', { security: 3 });
    w.locations.street_main!.exits.push({ to: 'roadhouse', label: 'a roadhouse nobody mentioned', hidden: false, gate: null });
    road.exits = [{ to: 'street_main', label: 'back to Strand Street', hidden: false, gate: null }];
    expect(npcsAt(w, 'roadhouse')).toHaveLength(0);
    relocate(w, 'street_main');
    relocate(w, 'roadhouse');
    const first = npcsAt(w, 'roadhouse').map((n) => n.id);
    expect(first.length).toBeGreaterThan(1);
    relocate(w, 'street_main');
    relocate(w, 'roadhouse');
    expect(npcsAt(w, 'roadhouse').map((n) => n.id).sort()).toEqual(first.slice().sort());
    expect(verifyIndex(w)).toEqual([]);
  });

  it('brings the regulars of a place up to date after time has passed', () => {
    const w = fresh('regulars');
    const bar = newPlace(w, 'tap', 'bar', { security: 0 });
    bar.exits = [{ to: 'street_main', label: 'out', hidden: false, gate: null }];
    w.locations.street_main!.exits.push({ to: 'tap', label: 'the tap', hidden: false, gate: null });
    relocate(w, 'tap');
    const patron = npcsAt(w, 'tap').find((n) => n.archetype === 'patron');
    expect(patron).toBeDefined();
    relocate(w, 'street_main');
    // Left alone for days, the patron is wherever the clock puts them, and the bar agrees.
    catchUp(w, 6 * 3_600_000);
    relocate(w, 'tap');
    expect(patron!.locationId === 'tap').toBe(npcsAt(w, 'tap').includes(patron!));
    expect(patron!.locationId).toBe(placeAt(w, patron!, patron!.settledAt!) );
    expect(verifyIndex(w)).toEqual([]);
  });
});
