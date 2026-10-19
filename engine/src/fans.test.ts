import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { FANS_FOR_MOB, fanCouchCandidate, fanCover, flashMob, flashMobCandidate, grapevineTick, localFans, mobHere, recognisable } from './fans';
import { coverAt } from './stealth';
import { npdResponse } from './laylow';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { always } from './testkit';

const ctxOf = (w: World, rng: Rng = new Rng('f')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

/** Strand Street, with this many fans at the Halo next door. */
function onStrand(seed: string, fans: number): World {
  const w = createWorld({ seed });
  w.hero.locationId = 'street_main';
  if (fans) w.locations.halo_floor!.fans = fans;
  return w;
}

describe('fans around her', () => {
  it('counts the fans on her block and the places off it, not across town', () => {
    const w = onStrand('count', 25);
    expect(localFans(w, 'street_main')).toBe(25);
    w.locations.helix_lab!.fans = 100;
    expect(localFans(w, 'street_main')).toBe(25);
  });

  it('a neighbourhood that loves her is cover; a flash mob is a lot of cover', () => {
    const none = onStrand('cover0', 0);
    const some = onStrand('cover1', 40);
    expect(fanCover(none, 'street_main')).toBe(0);
    expect(fanCover(some, 'street_main')).toBeGreaterThan(0);
    expect(coverAt(some, 'street_main')).toBeGreaterThan(coverAt(none, 'street_main'));
    flashMob(ctxOf(some).c);
    expect(fanCover(some, 'street_main')).toBe(0.6);
  });

  it('really famous, somewhere with no fans of hers, she sticks out', () => {
    const w = onStrand('famous', 0);
    expect(recognisable(w)).toBe(1);
    w.hero.fame = 400;
    expect(recognisable(w)).toBeGreaterThan(1.2);
    w.locations.halo_floor!.fans = 40;
    expect(recognisable(w)).toBe(1);
  });
});

describe('a couch, and the grapevine', () => {
  it('with heat on her and fans about, a fan puts her up: once a night per block', () => {
    const w = onStrand('couch', 20);
    expect(fanCouchCandidate(w, 0)).toBeNull();
    w.heat.npd = 4;
    const cand = fanCouchCandidate(w, 2)!;
    const { c, events } = ctxOf(w);
    cand.run(c);
    expect(w.heat.npd).toBe(2);
    expect(hasTemplate(events[0]!)).toBe(true);
    expect(fanCouchCandidate(w, 2)).toBeNull();
  });

  it('fans tell her where the person she is after was seen', () => {
    const w = onStrand('vine', 60);
    const mark = spawnNpc(new Rng('mark'), 'mark', 'drifter', 'helix_lab', {});
    addNpc(w, mark);
    w.mind.goals.push({ id: 99, kind: 'kill', npc: 'mark', parent: null, why: 't', desire: 0.9, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });
    const { c, events } = ctxOf(w, always());
    grapevineTick(c);
    expect(w.mind.lastSeen.mark).toBe('helix_lab');
    expect(hasTemplate(events[0]!)).toBe(true);
  });
});

describe('the flash mob', () => {
  it('needs fans and a reason', () => {
    expect(flashMobCandidate(onStrand('few', FANS_FOR_MOB - 1), 3)).toBeNull();
    expect(flashMobCandidate(onStrand('calm', 80), 0)).toBeNull();
    expect(flashMobCandidate(onStrand('hot', 80), 3)).not.toBeNull();
  });

  it('fills the place, holds the police back, costs some fans and a little heat; once a night per block', () => {
    const w = onStrand('mob', 80);
    w.heat.npd = 6;
    const { c, events } = ctxOf(w);
    flashMob(c);
    expect(mobHere(w, 'street_main')).toBe(true);
    expect(w.heat.npd).toBe(7);
    expect(w.locations.halo_floor!.fans).toBeLessThan(80);
    expect(hasTemplate(events.find((e) => e.type === 'flash_mob')!)).toBe(true);
    expect(npdResponse(ctxOf(w, always()).c)).toBe(false);
    expect(flashMobCandidate(w, 5)).toBeNull();
    w.beat += 20;
    expect(mobHere(w, 'street_main')).toBe(false);
  });
});
