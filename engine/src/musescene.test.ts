import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { LOST_PULL, broadcastHijack, charmLumina, chartWar, crashShow, enforcement, freeLumina, museSceneCandidates, museShowTick, pullAt, seduceLumina, shiftPull, startShow, wreckShow } from './musescene';
import { museAfterSet } from './muse';
import { genInstrument } from './instruments';
import { spawnNpc } from './content/archetypes';
import { addNpc, npcsAt } from './population';
import { makeItem } from './content/items';
import { relocate } from './combat';
import { childId } from './mapgen';
import { always, never } from './testkit';
import type { Ctx } from './types';

const ctxOf = (w: World, rng: Rng = new Rng('m')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } as Ctx };
};
const templated = (events: GameEvent[], types: string[]) => events.filter((e) => types.includes(e.type)).every((e) => hasTemplate(e));
const busked: GameEvent[] = [{ beat: 0, type: 'busk', outcome: 'good', data: {} }];

function scene(seed: string): World {
  const w = createWorld({ seed });
  w.hero.locationId = 'street_main';
  w.hero.inventory.push(makeItem('vintage_guitar'));
  w.hero.maxHp = w.hero.hp = 5000;
  w.legacy.renown = { guitar: 40 };
  addNpc(w, spawnNpc(new Rng(seed), `${seed}_crowd`, 'drifter', 'street_main', {}));
  return w;
}

describe("Muse's pull", () => {
  it('starts even, moves with what happens on the block, and sets how hard Muse enforces', () => {
    const w = scene('pull');
    expect(pullAt(w, 'street_main')).toBe(50);
    expect(enforcement(w, 'street_main')).toBe(1);
    shiftPull(w, 'street_main', 30);
    expect(pullAt(w, 'street_main')).toBeGreaterThan(50);
    expect(enforcement(w, 'street_main')).toBeGreaterThan(1);
    shiftPull(w, 'street_main', -200);
    expect(pullAt(w, 'street_main')).toBeLessThan(LOST_PULL);
    expect(enforcement(w, 'street_main')).toBe(0.1);
  });

  it('her illegal shows wear it down; signed, her shows build it; a secret show wears it most', () => {
    const outlaw = scene('outlaw');
    museAfterSet(ctxOf(outlaw, never()).c, 'busk', 'guitar', busked);
    expect(pullAt(outlaw, 'street_main')).toBeLessThan(50);
    const signed = scene('signed');
    signed.legacy.muse = { signed: true };
    museAfterSet(ctxOf(signed).c, 'busk', 'guitar', busked);
    expect(pullAt(signed, 'street_main')).toBeGreaterThan(50);
  });

  it('where Muse has lost the street, it hardly sends anything', () => {
    let owned = 0;
    let lost = 0;
    for (let i = 0; i < 300; i++) {
      for (const [w, tally] of [[scene(`o${i}`), 'owned'], [scene(`l${i}`), 'lost']] as const) {
        w.legacy.muse = { lettered: true };
        if (tally === 'lost') shiftPull(w, 'street_main', -200);
        const { c, events } = ctxOf(w, new Rng(`r${i}`));
        museAfterSet(c, 'busk', 'guitar', busked);
        if (events.some((e) => e.type === 'muse')) tally === 'owned' ? owned++ : lost++;
      }
    }
    expect(owned).toBeGreaterThan(lost * 3);
  });
});

describe('Muse shows', () => {
  it('an artist goes on with security; a show nobody spoils builds Muse\'s hold', () => {
    const w = scene('show');
    const { c, events } = ctxOf(w);
    const show = startShow(c, w.locations.halo_floor!, false);
    expect(w.npcs[show.artist]!.faction).toBe('muse');
    expect(npcsAt(w, 'halo_floor').some((n) => n.archetype === 'muse_tech')).toBe(true);
    expect(templated(events, ['muse_show'])).toBe(true);
    // (A show lasts the evening.)
    w.clock += 400;
    museShowTick(c);
    expect(w.mind.museShow).toBeUndefined();
    expect(pullAt(w, 'halo_floor')).toBeGreaterThan(50);
  });

  it('across the street, she can steal the crowd', () => {
    const w = scene('chart');
    const show = startShow(ctxOf(w).c, w.locations.halo_floor!, false);
    expect(museSceneCandidates(w).map((x) => x.key)).toContain('chart_war');
    const { c, events } = ctxOf(w, always());
    chartWar(c, show);
    expect(show.done).toBe('stolen');
    expect(pullAt(w, 'halo_floor')).toBeLessThan(50);
    expect(w.locations.street_main!.fans).toBeGreaterThan(0);
    expect(templated(events, ['chart_war'])).toBe(true);
  });

  it('crashing the stage and fluffing it gets her walked out', () => {
    const w = scene('crash');
    const show = startShow(ctxOf(w).c, w.locations.halo_floor!, false);
    relocate(w, 'halo_floor');
    const { c, events } = ctxOf(w, never());
    crashShow(c, show);
    expect(w.hero.locationId).not.toBe('halo_floor');
    expect(templated(events, ['crash_show'])).toBe(true);
  });

  it('a generated artist taken apart stays gone; LUMINA taken apart comes back as the next version', () => {
    const w = scene('wreck');
    w.hero.level = 80;
    w.hero.muscle = 40;
    w.hero.weapon = makeItem('pulse_rifle');
    const show = startShow(ctxOf(w).c, w.locations.halo_floor!, false);
    relocate(w, 'halo_floor');
    const { c, events } = ctxOf(w, new Rng('wr'));
    wreckShow(c, show);
    const a = w.npcs[show.artist]!;
    expect(!a.alive || a.downUntil > w.clock).toBe(true);
    expect(show.done).toBe('wrecked');
    delete w.mind.museShow;
    const lshow = startShow(ctxOf(w).c, w.locations.halo_floor!, true);
    const before = w.legacy.muse!.lumina!.version;
    wreckShow(ctxOf(w, new Rng('wl')).c, lshow);
    if (lshow.done === 'wrecked') {
      expect(w.legacy.muse!.lumina!.version).toBe(before + 1);
      expect(w.npcs.lumina!.alive).toBe(true);
    }
    expect(templated(events, ['wreck_show'])).toBe(true);
  });
});

describe('LUMINA', () => {
  it('warms to a compliment; a kiss in public is the story of the night; warm enough, she runs away with Blackbird', () => {
    const w = scene('lumina');
    w.locations.halo_floor!.crowded = true;
    const show = startShow(ctxOf(w).c, w.locations.halo_floor!, true);
    relocate(w, 'halo_floor');
    expect(museSceneCandidates(w).map((x) => x.key)).not.toContain('free_lumina');
    const { c, events } = ctxOf(w, always());
    charmLumina(c, show);
    const fame = w.hero.fame;
    seduceLumina(c, show);
    expect(w.hero.fame).toBeGreaterThanOrEqual(fame + 10);
    expect(w.legacy.muse!.lumina!.warmth).toBe(2);
    expect(museSceneCandidates(w).map((x) => x.key)).toContain('free_lumina');
    freeLumina(c, show);
    expect(w.legacy.muse!.lumina!.free).toBe(true);
    expect(w.npcs.lumina!.faction).toBeNull();
    expect(enforcement(w, 'street_main')).toBe(0.1);
    expect(templated(events, ['lumina'])).toBe(true);
  });

  it('signed or not, the same doors are open', () => {
    const w = scene('signedlumina');
    w.legacy.muse = { signed: true };
    startShow(ctxOf(w).c, w.locations.halo_floor!, true);
    relocate(w, 'halo_floor');
    const keys = museSceneCandidates(w).map((x) => x.key);
    expect(keys).toContain('charm_lumina');
    expect(keys).toContain('seduce_lumina');
  });
});

describe('the broadcast', () => {
  it('from a tower of hers with a jacked guitar: a few new neighbourhoods hear her, and Muse traces the signal', () => {
    const w = scene('broadcast');
    const queue = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
    for (const id of queue) if (w.locations[id]) relocate(w, id);
    w.hero.locationId = 'street_main';
    w.legacy.muse = { lettered: true, towers: { street_main: 1 } };
    expect(museSceneCandidates(w).map((x) => x.key)).not.toContain('broadcast_hijack');
    const axe = genInstrument(new Rng('j'), 3, 'electric');
    axe.inst!.jacked = 2;
    w.hero.inventory.push(axe);
    expect(museSceneCandidates(w).map((x) => x.key)).toContain('broadcast_hijack');
    const { c, events } = ctxOf(w, always());
    broadcastHijack(c);
    const e = events.find((x) => x.type === 'broadcast_hijack')!;
    expect(e.outcome).toBe('good');
    expect(Number(e.data.count)).toBeGreaterThanOrEqual(3);
    expect(w.legacy.muse.towers!.street_main).toBeUndefined();
    expect(hasTemplate(e)).toBe(true);
    const far = Object.values(w.locations).filter((l) => l.fans === 15);
    expect(far.length).toBeGreaterThanOrEqual(3);
  });
});
