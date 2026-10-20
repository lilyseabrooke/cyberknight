import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { beginRun, endRun, newUniverse } from './universe';
import { TEARDOWN_FANS, districtFans, inStartDistrict, teardown, teardownCandidate, teardownVenue } from './cordon';
import { ambientDragons } from './dragons';
import { START_DEPTH } from './grade';
import { AWAY } from './population';
import { makeItem } from './content/items';
import { always, never } from './testkit';
import { relocate } from './combat';
import { childId } from './mapgen';

const ctxOf = (w: World, rng: Rng = new Rng('c')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

/** Walk the starting district out to the cordon, so there is a cordon to tear down (as gate.test does). */
function walkOut(w: World): World {
  const queue = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  const seen = new Set<string>();
  while (queue.length && seen.size < 250) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    relocate(w, id);
    for (const e of w.locations[id]!.exits) if (w.locations[e.to]?.gen) queue.push(e.to);
  }
  return w;
}

/** Out at the cordon's edge of the map, then on the Overpass with a guitar and this many fans in the district. */
function ready(w: World, fans = TEARDOWN_FANS + 50): World {
  if (!Object.values(w.locations).some((l) => l.gen?.cordon)) walkOut(w);
  w.hero.locationId = 'overpass';
  w.locations.overpass!.visits = 1;
  w.hero.inventory.push(makeItem('vintage_guitar'));
  w.locations.halo_floor!.fans = fans / 2;
  w.locations.street_main!.fans = fans / 2;
  return w;
}

describe('tearing the cordon down', () => {
  it('needs the fans, a guitar and somewhere to reach them all from; once a night', () => {
    const w = createWorld({ seed: 'needs' });
    w.hero.locationId = 'overpass';
    expect(teardownCandidate(w)).toBeNull();
    ready(w, TEARDOWN_FANS - 20);
    expect(teardownCandidate(w)).toBeNull();
    ready(w);
    expect(districtFans(w)).toBeGreaterThanOrEqual(TEARDOWN_FANS);
    expect(teardownCandidate(w)).not.toBeNull();
    expect(teardownVenue(w)).toBe('overpass');
    // (Strand Street has a billboard, so it would do; a bar doesn't.)
    w.hero.locationId = 'halo_floor';
    expect(teardownCandidate(w)).toBeNull();
  });

  it('when it lands, the cordon is gone for good and CINDERJAW flies off to roam', () => {
    const w = ready(createWorld({ seed: 'down' }));
    expect(Object.values(w.locations).some((l) => l.gen?.cordon)).toBe(true);
    const { c, events } = ctxOf(w, always());
    teardown(c);
    expect(w.legacy.gate).toBe('open');
    expect(Object.values(w.locations).some((l) => l.gen?.cordon)).toBe(false);
    expect(w.npcs.dragon!.alive).toBe(true);
    expect(w.npcs.dragon!.locationId).toBe(AWAY);
    const f = w.flights.find((x) => x.kind === 'apollo')!;
    expect(f.persist).toBe(true);
    expect(teardownCandidate(w)).toBeNull();
    for (const e of events) expect(hasTemplate(e), e.type).toBe(true);
  });

  it('when it does not, nothing comes down, fans leave, and she can try another night', () => {
    const w = ready(createWorld({ seed: 'flop' }));
    const before = districtFans(w);
    const { c, events } = ctxOf(w, never());
    teardown(c);
    expect(w.legacy.gate).not.toBe('open');
    expect(Object.values(w.locations).some((l) => l.gen?.cordon)).toBe(true);
    expect(districtFans(w)).toBeLessThan(before);
    expect(teardownCandidate(w)).toBeNull();
    expect(hasTemplate(events.find((e) => e.type === 'cordon_teardown')!)).toBe(true);
  });
});

describe('CINDERJAW, unemployed', () => {
  it('outlives the night, and only comes back while she is past where the cordon was', () => {
    const w1 = ready(beginRun(newUniverse('roam')));
    teardown(ctxOf(w1, always()).c);
    w1.ending = 'dead';
    w1.over = true;
    const w = beginRun(endRun(w1));
    expect(w.flights.some((f) => f.kind === 'apollo')).toBe(true);
    // In the starting district, however long she waits, it doesn't come back.
    w.hero.locationId = 'street_main';
    w.clock += 2000;
    ambientDragons(ctxOf(w).c);
    expect(w.npcs.dragon!.locationId).toBe(AWAY);
    // Past the cordon, it does.
    const out = Object.values(w.locations).find((l) => l.outdoors && l.gen && l.gen.depth > START_DEPTH)!;
    expect(inStartDistrict(w, out.id)).toBe(false);
    w.hero.locationId = out.id;
    w.clock += 2000;
    const { c, events } = ctxOf(w);
    ambientDragons(c);
    expect(w.npcs.dragon!.locationId).not.toBe(AWAY);
    const e = events.find((x) => x.type === 'dragon_flight')!;
    expect(e.data.variant).toBe('apollo');
    expect(hasTemplate(e)).toBe(true);
  });
});
