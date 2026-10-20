import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { beginRun, endRun, newUniverse } from './universe';
import { MUSE_DRONES, MUSE_LETTER, MUSE_SCOUT, MUSE_STRIKE, inspirationStrike, museAfterSet, museAtBooking, museStanding, museTick, scout, strikeGrade } from './muse';
import { personalityFrom } from './personality';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { makeItem } from './content/items';
import { always, never, rolls } from './testkit';

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
    // (No drones this time: the first roll is theirs.)
    const { c, events } = ctxOf(w, rolls(0.99, 0));
    museAfterSet(c, 'busk', 'guitar', busked);
    expect(events[0]!.data.variant).toBe('letter');
    museAfterSet(c, 'busk', 'guitar', busked);
    expect(events[1]!.data.variant).toBe('confiscate');
    expect(w.hero.inventory.some((i) => i.tags.includes('instrument'))).toBe(false);
    for (const e of events) expect(hasTemplate(e), `${e.data.variant}`).toBe(true);
  });

  it('before anything else, a drone or two: UNAUTHORIZED ENTERTAINMENT DETECTED, and tear gas for the crowd', () => {
    const w = onStage('drones', MUSE_DRONES + 1);
    expect(MUSE_DRONES).toBeLessThan(MUSE_LETTER);
    w.hero.maxHp = w.hero.hp = 500;
    const crowd = Object.values(w.npcs).filter((n) => n.locationId === 'street_main' && !n.hostile && n.alive).length;
    expect(crowd).toBeGreaterThan(0);
    const { c, events } = ctxOf(w, always());
    museAfterSet(c, 'busk', 'guitar', busked);
    const e = events.find((x) => x.type === 'muse')!;
    expect(e.data.variant).toBe('drones');
    expect(Number(e.data.scattered)).toBeGreaterThan(0);
    expect(hasTemplate(e)).toBe(true);
    expect(w.hero.buffs.some((b) => b.id === 'tear_gas')).toBe(true);
    expect(events.some((x) => x.type === 'fight_start')).toBe(true);
    expect(w.legacy.muse?.lettered).toBeFalsy();
  });

  it('a nobody gets no drones; a signed Blackbird gets none either', () => {
    const quiet = onStage('quiet', MUSE_DRONES - 1);
    const q = ctxOf(quiet, always());
    museAfterSet(q.c, 'busk', 'guitar', busked);
    expect(q.events).toHaveLength(0);
    const signed = onStage('signed', MUSE_DRONES + 1);
    signed.legacy.muse = { signed: true };
    const s = ctxOf(signed, always());
    museAfterSet(s.c, 'busk', 'guitar', busked);
    expect(s.events).toHaveLength(0);
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
    museAfterSet(ctxOf(w, rolls(0.99, 0)).c, 'busk', 'guitar', busked);
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

describe('Inspiration', () => {
  const hunted = (seed: string, renown: number): World => {
    const w = onStage(seed, renown);
    w.hero.maxHp = w.hero.hp = 5000;
    w.legacy.muse = { lettered: true, offered: w.legacy.runs, refused: 1 };
    return w;
  };

  it('said no and kept growing: too big to ignore', () => {
    expect(museStanding(hunted('small', MUSE_STRIKE - 1))).toBe('refused');
    expect(museStanding(hunted('big', MUSE_STRIKE + 1))).toBe('hunted');
  });

  it('a team turns up after a set, plays the jingle, and opens fire', () => {
    const w = hunted('strike', MUSE_STRIKE + 10);
    const { c, events } = ctxOf(w, rolls(0.99, 0));
    museAfterSet(c, 'busk', 'guitar', busked);
    const e = events.find((x) => x.type === 'inspiration')!;
    expect(e.data.variant).toBe('set');
    expect(hasTemplate(e)).toBe(true);
    expect(events.some((x) => x.type === 'fight_start')).toBe(true);
    const team = Object.values(w.npcs).filter((n) => n.faction === 'muse');
    expect(team.length).toBeGreaterThanOrEqual(2);
  });

  it('the bigger she gets, the bigger and better the team', () => {
    const w = hunted('grade', MUSE_STRIKE);
    const low = strikeGrade(w, 0);
    w.legacy.renown = { guitar: MUSE_STRIKE * 4 };
    expect(strikeGrade(w, 0)).toBeGreaterThan(low);
    const { c, events } = ctxOf(w, never());
    inspirationStrike(c, 'set');
    const e = events.find((x) => x.type === 'inspiration')!;
    expect(Number(e.data.count)).toBeGreaterThan(2);
    expect(e.data.lead).toBe(true);
  });

  it('Muse reads the poster: a booked set can bring a team', () => {
    const w = hunted('booked', MUSE_STRIKE + 10);
    const { c, events } = ctxOf(w, always());
    museAtBooking(c);
    expect(events.find((x) => x.type === 'inspiration')!.data.variant).toBe('booking');
  });

  it('if they got her, Muse posts a tribute: once', () => {
    const w = hunted('tribute', MUSE_STRIKE + 10);
    w.legacy.deaths.push({ run: w.legacy.runs - 1, clock: 0, locationId: 'street_main', killers: ['muse'], witnesses: [] });
    const { c, events } = ctxOf(w);
    museTick(c);
    museTick(c);
    expect(events.filter((x) => x.type === 'muse' && x.data.variant === 'tribute')).toHaveLength(1);
    expect(hasTemplate(events[0]!)).toBe(true);
  });
});
