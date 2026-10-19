import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { beginRun, endRun, newUniverse } from './universe';
import { MUSE_SCOUT, museAfterSet, museStanding, scout } from './muse';
import { personalityFrom } from './personality';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { makeItem } from './content/items';
import { always, never } from './testkit';

const ctxOf = (w: World, rng: Rng = new Rng('m')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const busked: GameEvent[] = [{ beat: 0, type: 'busk', outcome: 'good', data: {} }];

function onStage(seed: string, renown: number, traits: Parameters<typeof personalityFrom>[0] = {}): World {
  const w = createWorld({ seed, personality: personalityFrom(traits) });
  w.hero.locationId = 'street_main';
  addNpc(w, spawnNpc(new Rng(seed), `${seed}_crowd`, 'drifter', 'street_main', {}));
  w.legacy.renown = { guitar: renown };
  return w;
}

describe('Muse notices', () => {
  it('a busker nobody has heard of is beneath its notice', () => {
    const w = onStage('busker', 5);
    const { c, events } = ctxOf(w, always());
    museAfterSet(c, 'busk', 'guitar', busked);
    expect(events).toHaveLength(0);
    expect(museStanding(w)).toBe('nobody');
  });

  it('a local name gets the letter first, then Clearance officers at her sets', () => {
    const w = onStage('local', 30);
    w.hero.inventory.push(makeItem('vintage_guitar'));
    const { c, events } = ctxOf(w, always());
    museAfterSet(c, 'busk', 'guitar', busked);
    expect(events[0]!.data.variant).toBe('letter');
    museAfterSet(c, 'busk', 'guitar', busked);
    expect(events[1]!.data.variant).toBe('confiscate');
    expect(w.hero.inventory.some((i) => i.tags.includes('instrument'))).toBe(false);
    for (const e of events) expect(hasTemplate(e), `${e.data.variant}`).toBe(true);
  });

  it('a flop or an empty room tells Muse nothing', () => {
    const w = onStage('flop', 30);
    const { c, events } = ctxOf(w, always());
    museAfterSet(c, 'busk', 'guitar', [{ beat: 0, type: 'busk', outcome: 'bad', data: {} }]);
    expect(events).toHaveLength(0);
  });
});

describe('the scout', () => {
  it('a greedy, vain Blackbird signs, takes the advance, and the officers go away', () => {
    const w = onStage('sellout', MUSE_SCOUT + 10, { greed: 1, fame: 1, vanity: 1, artistry: 0, justice: 0, mischief: 0 });
    const cash = w.hero.cash;
    const { c, events } = ctxOf(w, new Rng('s'));
    expect(scout(c)).toBe(true);
    expect(w.hero.cash).toBeGreaterThan(cash);
    expect(museStanding(w)).toBe('signed');
    museAfterSet(c, 'busk', 'guitar', busked);
    expect(events).toHaveLength(1);
    expect(hasTemplate(events[0]!)).toBe(true);
  });

  it('a principled one refuses, and Muse takes the legal route', () => {
    const w = onStage('principled', MUSE_SCOUT + 10, { greed: 0, fame: 0, vanity: 0, artistry: 1, justice: 1, mischief: 1 });
    w.legacy.muse = { lettered: true };
    const { c, events } = ctxOf(w, never());
    expect(scout(c)).toBe(false);
    expect(museStanding(w)).toBe('refused');
    const heat = w.heat.npd ?? 0;
    museAfterSet(ctxOf(w, always()).c, 'busk', 'guitar', busked);
    expect(w.heat.npd ?? 0).toBeGreaterThan(heat);
    expect(hasTemplate(events[0]!)).toBe(true);
  });

  it('the contract survives her death', () => {
    const u = newUniverse('contract');
    const w1 = beginRun(u);
    w1.legacy.muse = { lettered: true, signed: true, offered: 1 };
    w1.ending = 'dead';
    w1.over = true;
    const w2 = beginRun(endRun(w1));
    expect(museStanding(w2)).toBe('signed');
  });
});
