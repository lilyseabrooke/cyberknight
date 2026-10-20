import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { SECRET_LEVEL, GIG_LEVEL, offerBooking, playBooking, tickBookings, undergroundRooms } from './bookings';
import { handOutTapes, hasMast, takeTower, towersHeld, towersTick, undergroundCandidates } from './underground';
import { museAfterSet } from './muse';
import { teardownStage } from './cordon';
import { relocate } from './combat';
import { childId } from './mapgen';
import { makeItem } from './content/items';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { always, never } from './testkit';

const ctxOf = (w: World, rng: Rng = new Rng('u')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

/** Walk out from the Halo so there are generated streets and cellars. */
function grown(seed: string): World {
  const w = createWorld({ seed });
  const queue = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  const seen = new Set<string>();
  while (queue.length && seen.size < 200) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    relocate(w, id);
    for (const e of w.locations[id]!.exits) if (w.locations[e.to]?.gen) queue.push(e.to);
  }
  w.hero.locationId = 'street_main';
  return w;
}

describe('secret shows', () => {
  it('once Muse has noticed her, the scene books her for less of a name; signed, it does not', () => {
    const offers = (muse: World['legacy']['muse'], level: number) => {
      const w = createWorld({ seed: 'scene' });
      w.legacy.repute = { guitar: level };
      w.legacy.muse = muse;
      const { c } = ctxOf(w);
      for (let i = 0; i < 3000; i++) tickBookings(c);
      return w.legacy.bookings ?? [];
    };
    expect(offers(undefined, SECRET_LEVEL + 2)).toHaveLength(0);
    const scene = offers({ lettered: true }, SECRET_LEVEL + 2);
    expect(scene.length).toBeGreaterThan(0);
    expect(scene.every((b) => b.kind === 'secret')).toBe(true);
    expect(offers({ lettered: true, signed: true }, SECRET_LEVEL + 2)).toHaveLength(0);
    expect(SECRET_LEVEL).toBeLessThan(GIG_LEVEL);
  });

  it('a good one wins fans, comes with bootleg tapes, and Muse never hears about it', () => {
    const w = createWorld({ seed: 'secret' });
    w.legacy.muse = { lettered: true };
    w.legacy.renown = { guitar: 40 };
    w.hero.locationId = 'halo_arcade';
    expect(undergroundRooms(w).map((l) => l.id)).toContain('halo_arcade');
    w.legacy.bookings = [{ id: 's', loc: 'halo_arcade', night: w.legacy.runs, skill: 'guitar', kind: 'secret', pay: 40 }];
    addNpc(w, spawnNpc(new Rng('x'), 'x', 'drifter', 'halo_arcade', {}));
    const { c, events } = ctxOf(w, always());
    playBooking(c, w.legacy.bookings[0]!);
    expect(w.locations.halo_arcade!.fans).toBeGreaterThanOrEqual(5);
    expect(w.hero.inventory.some((i) => i.id === 'bootleg_tapes')).toBe(true);
    museAfterSet(c, 'booked_guitar', 'guitar', events);
    expect(events.some((e) => e.type === 'muse' || e.type === 'inspiration')).toBe(false);
    expect(hasTemplate(events.find((e) => e.type === 'booked_guitar')!)).toBe(true);
  });

  it('a secret offer goes to a cellar, a back unit or the Halo basement', () => {
    const w = grown('cellar');
    const b = offerBooking(ctxOf(w).c, 'guitar', 'secret')!;
    expect(undergroundRooms(w).map((l) => l.id)).toContain(b.loc);
  });
});

describe('bootleg tapes', () => {
  it('handed out in a crowd, they make fans', () => {
    const w = createWorld({ seed: 'tapes' });
    w.hero.locationId = 'halo_floor';
    w.hero.inventory.push(makeItem('bootleg_tapes'));
    expect(undergroundCandidates(w).map((x) => x.key)).toContain('hand_out_tapes');
    const fame = w.hero.fame;
    const { c, events } = ctxOf(w);
    handOutTapes(c);
    expect(w.hero.inventory.some((i) => i.id === 'bootleg_tapes')).toBe(false);
    expect(w.locations.halo_floor!.fans).toBe(8);
    expect(w.hero.fame).toBeGreaterThan(fame);
    expect(hasTemplate(events[0]!)).toBe(true);
  });
});

describe('pirate towers', () => {
  it('some streets have a Muse mast; she goes for one once Muse has noticed her', () => {
    const w = grown('masts');
    const masts = Object.keys(w.locations).filter((id) => hasMast(w, id));
    expect(masts.length).toBeGreaterThan(0);
    expect(masts.every((id) => hasMast(w, id))).toBe(true);
    w.hero.locationId = masts[0]!;
    expect(undergroundCandidates(w).some((x) => x.key.startsWith('take_tower'))).toBe(false);
    w.legacy.muse = { lettered: true, refused: 1 };
    expect(undergroundCandidates(w).some((x) => x.key.startsWith('take_tower'))).toBe(true);
  });

  it('won and rewired, it is hers: it plays her to the neighbourhood, and Muse may take it back', () => {
    const w = grown('tower');
    const mast = Object.keys(w.locations).find((id) => hasMast(w, id))!;
    w.hero.locationId = mast;
    w.hero.level = 60;
    w.hero.maxHp = w.hero.hp = 5000;
    w.hero.muscle = 30;
    w.legacy.muse = { lettered: true };
    const { c, events } = ctxOf(w, always());
    takeTower(c, mast);
    expect(towersHeld(w)).toContain(mast);
    for (const e of events.filter((x) => x.type === 'take_tower')) expect(hasTemplate(e)).toBe(true);
    const fans = w.locations[mast]!.fans!;
    // (Rigged so Muse doesn't get it back tonight.)
    towersTick(ctxOf(w, never()).c);
    expect(w.locations[mast]!.fans).toBeGreaterThan(fans);
    w.counters.towers_aired = 0;
    w.legacy.muse.signed = true;
    const lost = ctxOf(w);
    towersTick(lost.c);
    expect(towersHeld(w)).not.toContain(mast);
    expect(hasTemplate(lost.events.find((e) => e.data.variant === 'lost')!)).toBe(true);
  });

  it('a tower of hers inside the cordon is somewhere to reach the whole district from', () => {
    const w = grown('stage');
    const inside = Object.values(w.locations).find((l) => l.kind === 'street' && l.gen && l.gen.depth <= 4)!;
    expect(teardownStage(w, inside.id)).toBe(Object.values(w.features).some((f) => f.kind === 'billboard' && f.locationId === inside.id));
    w.legacy.muse = { lettered: true, towers: { [inside.id]: 1 } };
    expect(teardownStage(w, inside.id)).toBe(true);
  });
});
