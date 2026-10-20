import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { breach, contractCandidates, detonate, encoreActive, encoreTruce, encoreWatches, ENCORE_RENOWN, seduceEncore, settleEncore, summonEncore } from './musecontract';
import { inspirationStrike, museAfterSet, museStanding } from './muse';
import { crashShow, freeLumina, startShow } from './musescene';
import { tickBookings } from './bookings';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { makeItem } from './content/items';
import { relocate } from './combat';
import { AWAY } from './population';
import { always, never } from './testkit';
import type { Ctx } from './types';

const ctxOf = (w: World, rng: Rng = new Rng('k')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } as Ctx };
};
const templated = (events: GameEvent[], types: string[]) => events.filter((e) => types.includes(e.type)).every((e) => hasTemplate(e));
const busked: GameEvent[] = [{ beat: 0, type: 'busk', outcome: 'good', data: {} }];

function signed(seed: string): World {
  const w = createWorld({ seed });
  w.hero.locationId = 'street_main';
  w.hero.inventory.push(makeItem('vintage_guitar'));
  w.hero.maxHp = w.hero.hp = 5000;
  w.hero.cash = 1000;
  w.legacy.renown = { guitar: 60 };
  w.legacy.repute = { guitar: 20 };
  w.legacy.muse = { lettered: true, offered: 1, signed: true };
  addNpc(w, spawnNpc(new Rng(seed), `${seed}_crowd`, 'drifter', 'street_main', {}));
  return w;
}

describe('breaking the contract', () => {
  it('a breach costs a fine, voids the contract, and in public means she is hunted whatever her renown', () => {
    const w = signed('breach');
    const { c, events } = ctxOf(w);
    breach(c, 'show');
    expect(w.legacy.muse!.signed).toBe(false);
    expect(w.hero.cash).toBeLessThan(1000);
    expect(museStanding(w)).toBe('hunted');
    expect(templated(events, ['muse'])).toBe(true);
  });

  it('spoiling a Muse show while signed is a breach; so is running off with LUMINA', () => {
    const a = signed('crashsigned');
    const show = startShow(ctxOf(a).c, a.locations.halo_floor!, false);
    relocate(a, 'halo_floor');
    crashShow(ctxOf(a, always()).c, show);
    expect(a.legacy.muse!.signed).toBe(false);
    const b = signed('luminasigned');
    const ls = startShow(ctxOf(b).c, b.locations.halo_floor!, true);
    b.legacy.muse!.lumina!.warmth = 5;
    relocate(b, 'halo_floor');
    freeLumina(ctxOf(b, always()).c, ls);
    expect(b.legacy.muse!.lumina!.free).toBe(true);
    expect(b.legacy.muse!.signed).toBe(false);
  });
});

describe('the duet', () => {
  it('signed, Muse books her a night with LUMINA; on the night LUMINA is there, and she can detonate it', () => {
    const w = signed('duet');
    for (const l of Object.values(w.locations)) if (l.kind === 'bar' || l.kind === 'club') l.visits = 1;
    const { c } = ctxOf(w);
    for (let i = 0; i < 4000 && !(w.legacy.bookings ?? []).some((b) => b.kind === 'duet'); i++) tickBookings(c);
    const duet = w.legacy.bookings!.find((b) => b.kind === 'duet')!;
    expect(duet).toBeDefined();
    duet.night = w.legacy.runs;
    tickBookings(c);
    expect(w.mind.museShow?.lumina).toBe(true);
    expect(w.mind.museShow?.loc).toBe(duet.loc);
    relocate(w, duet.loc);
    expect(contractCandidates(w).map((x) => x.key)).toContain('detonate_contract');
    const fame = w.hero.fame;
    const d = ctxOf(w, always());
    detonate(d.c, duet);
    expect(w.hero.fame).toBeGreaterThan(fame + 10);
    expect(w.legacy.muse!.signed).toBe(false);
    expect(museStanding(w)).toBe('hunted');
    expect(templated(d.events, ['detonate_contract', 'muse'])).toBe(true);
  });
});

describe('ENCORE', () => {
  const hunted = (seed: string): World => {
    const w = signed(seed);
    w.legacy.muse = { lettered: true, offered: 1, refused: 1 };
    w.legacy.renown = { guitar: ENCORE_RENOWN + 10 };
    return w;
  };

  it('takes a personal interest once she is hunted and very famous, and leads the strike herself', () => {
    expect(encoreActive(signed('notyet'))).toBe(false);
    const w = hunted('lead');
    expect(encoreActive(w)).toBe(true);
    const { c, events } = ctxOf(w, new Rng('st'));
    inspirationStrike(c, 'set');
    const e = events.find((x) => x.type === 'inspiration')!;
    expect(e.data.encore).toBe(true);
    expect(hasTemplate(e)).toBe(true);
    expect(w.npcs.encore).toBeDefined();
    expect(w.npcs.encore!.name).toBe('ENCORE');
  });

  it('beaten, she is pulled out and comes back; the third time she is gone for good', () => {
    const w = hunted('thrice');
    const { c, events } = ctxOf(w);
    for (let i = 0; i < 3; i++) {
      const enc = summonEncore(c, true);
      enc.alive = false;
      settleEncore(c);
    }
    expect(w.legacy.muse!.encore!.gone).toBe(true);
    expect(encoreActive(w)).toBe(false);
    expect(events.filter((e) => e.type === 'encore').map((e) => e.data.variant)).toEqual(['retreat', 'retreat', 'gone']);
    expect(templated(events, ['encore'])).toBe(true);
  });

  it('she turns up to watch; seduced, she calls off the night', () => {
    const w = hunted('watch');
    const { c, events } = ctxOf(w);
    encoreWatches(c);
    expect(w.npcs.encore!.locationId).toBe('street_main');
    expect(contractCandidates(w).map((x) => x.key)).toContain('seduce_encore');
    seduceEncore(ctxOf(w, always()).c);
    expect(encoreTruce(w)).toBe(true);
    expect(w.npcs.encore!.locationId).toBe(AWAY);
    const after = ctxOf(w, always());
    museAfterSet(after.c, 'busk', 'guitar', busked);
    expect(after.events.some((x) => x.type === 'inspiration')).toBe(false);
    expect(templated(events, ['encore'])).toBe(true);
  });
});
