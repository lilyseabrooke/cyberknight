import { describe, expect, it } from 'vitest';
import { slow } from './testkit';
import { Rng, advise, createRun, hasTemplate, personalityFrom, render, runToEnd, step, ASK_BEATS, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { adviceTick, askiness } from './advice';
import { dungeonLure, goalViews, mindTick } from './goals';
import { addDungeon, childId } from './mapgen';
import { relocate } from './combat';
import { cooling } from './mind';
import { genWeapon } from './weapons';
import { serialize, deserialize, makeSave } from './store';
import { newUniverse, beginRun, endRun } from './universe';
import type { Ctx } from './types';

/** A girl who checks in. */
const CHATTY = { sociable: 1, loyalty: 1, vanity: 0, impulsive: 0 } as const;

const world = (loc: string, traits: Parameters<typeof personalityFrom>[0] = {}, seed = 'advice'): World => {
  const w = createWorld({ seed, competence: 0.5, personality: personalityFrom({ ...CHATTY, ...traits }) });
  w.hero.locationId = loc;
  w.beat = 20;
  return w;
};

const ctxOf = (w: World, seed: string): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

/** Think until she asks something of this kind (different luck each time). */
function thinkUntilAsked(w: World, kind: string, tries = 400): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < tries && w.mind.ask?.kind !== kind; i++) {
    if (w.mind.ask) {
      // Some other question; not the one we're after.
      w.mind.ask = undefined;
      delete w.mind.cooldown.advice;
    }
    const { c, events } = ctxOf(w, `think-${i}`);
    mindTick(c);
    all.push(...events);
  }
  return all;
}

const types = (events: GameEvent[]) => events.map((e) => e.type + (e.data.variant ? ':' + e.data.variant : ''));

/** A hero who can take what a hideout holds, standing on its street, with the street already walked. */
function atDoor(w: World, kind: 'hideout' | 'outpost' = 'hideout', tier = 1): string {
  const street = w.locations[childId('street_main', 0)]!;
  const entrance = addDungeon(w, street, kind, 40, tier);
  w.hero.level = 14;
  w.hero.maxHp = w.hero.hp = 400;
  w.hero.muscle = 9;
  w.hero.weapon = genWeapon(new Rng('mighty'), { tier: 6.5, cls: 'blade' });
  relocate(w, street.id);
  street.visits = 1;
  return entrance.id;
}

describe('asking the lab', () => {
  describe('something she cannot afford', () => {
    const asked = () => {
      for (let i = 0; i < 80; i++) {
        const w = world('gun_shop', { greed: 0.9, courage: 0.8 }, `want-${i}`);
        w.hero.cash = 60;
        const events = thinkUntilAsked(w, 'want', 6);
        if (w.mind.ask?.kind === 'want') return { w, events };
      }
      throw new Error('she never asked about anything in the gun shop');
    };

    it('stops and asks instead of just deciding, and waits a few beats', () => {
      const { w, events } = asked();
      const ask = w.mind.ask!;
      expect(types(events)).toContain('advice_ask:want');
      expect(w.mind.goals.some((g) => g.kind === 'buy')).toBe(false);
      expect(ask.options.map((o) => o.id)).toEqual(['save', 'skip']);
      expect(ask.lean).toBe('save');
      expect(ask.until).toBe(w.beat + ASK_BEATS);
      expect(ask.question).toMatch(/short/);
      const line = render(events.find((e) => e.type === 'advice_ask')!, { rng: new Rng('t'), personality: w.hero.personality, realName: 'Brenda Pilchard' });
      expect(line[0]!.text).toMatch(/lab/i);
    });

    it('"save up" makes it a goal, and a slightly stronger one for having backup', () => {
      const { w } = asked();
      const spec = w.mind.ask!.options[0]!.spec!;
      const events = advise(w, 'save');
      expect(types(events)).toEqual(['advice_taken:want', 'goal_new:want_item']);
      expect(w.mind.ask).toBeUndefined();
      const buy = w.mind.goals.find((g) => g.kind === 'buy')!;
      expect(buy.desire).toBeCloseTo(Math.min(1, spec.desire + 0.1), 5);
      expect(w.mind.advice).toMatchObject({ asked: 1, taken: 1, lapsed: 0 });
    });

    it('"forget it" means she leaves the glass alone for a good while', () => {
      const { w } = asked();
      const ware = w.mind.ask!.options[0]!.spec!.ware!;
      advise(w, 'skip');
      expect(w.mind.goals.some((g) => g.kind === 'buy')).toBe(false);
      expect(cooling(w, `buy:${ware}`)).toBe(true);
      w.mind.cooldown.advice = 0;
      for (let i = 0; i < 20; i++) {
        const { c } = ctxOf(w, `after-${i}`);
        mindTick(c);
      }
      expect(w.mind.goals.some((g) => g.kind === 'buy' && g.ware === ware)).toBe(false);
    });

    it('no answer: she goes with what she was going to do anyway, once the time is up', () => {
      const { w } = asked();
      const until = w.mind.ask!.until;
      w.beat = until - 1;
      const early = ctxOf(w, 'early');
      adviceTick(early.c);
      expect(early.events).toEqual([]);
      expect(w.mind.ask).toBeDefined();
      w.beat = until;
      const late = ctxOf(w, 'late');
      adviceTick(late.c);
      expect(types(late.events)).toEqual(['advice_lapsed:want', 'goal_new:want_item']);
      expect(w.mind.ask).toBeUndefined();
      expect(w.mind.goals.some((g) => g.kind === 'buy')).toBe(true);
      expect(w.mind.advice).toMatchObject({ taken: 0, lapsed: 1 });
    });
  });

  describe('how to get the money', () => {
    const asked = () => {
      for (let i = 0; i < 40; i++) {
        const w = world('street_main', { greed: 0.9, thrill: 0.9, honesty: 0.1 }, `earn-${i}`);
        atDoor(w);
        w.locations.halo_backroom!.visits = 1;
        w.hero.cash = 10;
        w.mind.goals.push({ id: 1, kind: 'cash', parent: null, amount: 2000, why: 'test', desire: 0.8, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });
        w.mind.nextId = 2;
        const events = thinkUntilAsked(w, 'earn', 300);
        if (w.mind.ask?.kind === 'earn') return { w, events };
      }
      throw new Error('she never asked how to get the money');
    };

    it('offers the big scores she knows about and the steady grind, and says which she is leaning to', () => {
      const { w } = asked();
      const ask = w.mind.ask!;
      const ids = ask.options.map((o) => o.id);
      expect(ids).toContain('steady');
      expect(ids.some((i) => i === 'raid' || i === 'heist')).toBe(true);
      expect(ids).toContain(ask.lean);
      expect(ask.about).toBe(1);
      expect(w.mind.goals.some((g) => g.kind === 'raid' || g.kind === 'heist')).toBe(false);
    });

    it('a big score becomes a step towards the money', () => {
      const { w } = asked();
      const pick = w.mind.ask!.options.find((o) => o.id !== 'steady')!;
      advise(w, pick.id);
      const step = w.mind.goals.find((g) => g.kind === pick.id)!;
      expect(step.parent).toBe(1);
    });

    it('"odd jobs" keeps her off the big scores for a good while, and off the doors', () => {
      const { w } = asked();
      const door = Object.values(w.locations).find((l) => l.dungeon === l.id)!.id;
      expect(dungeonLure(w, door)).toBeGreaterThan(0);
      advise(w, 'steady');
      expect(cooling(w, 'bigscore')).toBe(true);
      expect(dungeonLure(w, door)).toBe(0);
      w.mind.cooldown.advice = 0;
      for (let i = 0; i < 300; i++) {
        const { c } = ctxOf(w, `steady-${i}`);
        mindTick(c);
      }
      expect(w.mind.goals.some((g) => g.kind === 'raid' || g.kind === 'heist')).toBe(false);
    });

    it('if the goal is gone by the time anyone answers, the answer does nothing', () => {
      const { w } = asked();
      w.mind.goals = [];
      const pick = w.mind.ask!.options.find((o) => o.id !== 'steady')!;
      const events = advise(w, pick.id);
      expect(types(events)).toEqual([`advice_taken:earn`]);
      expect(w.mind.goals).toEqual([]);
    });
  });

  describe('a door in front of her', () => {
    const asked = (kind: 'hideout' | 'outpost' = 'hideout') => {
      for (let i = 0; i < 80; i++) {
        const w = world('street_main', { thrill: 0.9, courage: 0.9 }, `door-${i}`);
        const id = atDoor(w, kind);
        // Something else on her mind, so she isn't asking what to do with herself.
        w.mind.goals.push({ id: 90, kind: 'fame', parent: null, amount: 999, why: 'test', desire: 0.9, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });
        const events = thinkUntilAsked(w, 'door', 150);
        if (w.mind.ask?.kind === 'door') return { w, id, events };
      }
      throw new Error('she never asked about the door');
    };

    it('asks whether to clear it out, in front of it', () => {
      const { w, events } = asked();
      expect(w.mind.ask!.options.map((o) => o.id)).toEqual(['clear', 'leave']);
      expect(w.mind.ask!.question).toMatch(/hideout/);
      expect(w.mind.goals.some((g) => g.kind === 'raid')).toBe(false);
      expect(events.find((e) => e.type === 'advice_ask')!.data.near).toBe(true);
    });

    it('"clear it out" is a raid goal, heading for the door', () => {
      const { w, id } = asked();
      advise(w, 'clear');
      const raid = w.mind.goals.find((g) => g.kind === 'raid')!;
      expect(raid).toMatchObject({ loc: id, mode: 'approach' });
      expect(goalViews(w).some((g) => g.label.startsWith('raid'))).toBe(true);
    });

    it('"leave it" means she stops being drawn to it, and does not ask about it again', () => {
      const { w, id } = asked();
      expect(dungeonLure(w, id)).toBeGreaterThan(0);
      advise(w, 'leave');
      expect(w.mind.goals.some((g) => g.kind === 'raid')).toBe(false);
      expect(dungeonLure(w, id)).toBe(0);
      w.mind.cooldown.advice = 0;
      for (let i = 0; i < 100; i++) {
        const { c } = ctxOf(w, `again-${i}`);
        mindTick(c);
      }
      expect(w.mind.ask).toBeUndefined();
      expect(w.mind.goals.some((g) => g.kind === 'raid')).toBe(false);
    });
  });

  describe('nothing on her mind', () => {
    it('can ask what to do with herself, with every idea on offer, and takes the answer as her goal', () => {
      for (let i = 0; i < 80; i++) {
        const w = world('halo_floor', {}, `idle-${i}`);
        w.beat = 30;
        thinkUntilAsked(w, 'idle', 30);
        const ask = w.mind.ask;
        if (ask?.kind !== 'idle') continue;
        expect(ask.options.length).toBeGreaterThanOrEqual(2);
        expect(ask.options.map((o) => o.id)).toContain(ask.lean);
        expect(w.mind.goals).toEqual([]);
        const pick = ask.options.find((o) => o.id !== ask.lean)!;
        advise(w, pick.id);
        expect(w.mind.goals.map((g) => g.kind)).toEqual([pick.spec!.kind]);
        return;
      }
      throw new Error('she never asked what to do with herself');
    });
  });

  describe('when she asks', () => {
    const shopper = (seed: string, beat: number) => {
      const w = world('gun_shop', { greed: 0.9, courage: 0.8 }, seed);
      w.beat = beat;
      w.hero.cash = 60;
      return w;
    };

    it('not in her first few beats on the street', () => {
      for (let i = 0; i < 40; i++) {
        const w = shopper(`early-${i}`, 3);
        thinkUntilAsked(w, 'want', 4);
        expect(w.mind.ask).toBeUndefined();
      }
    });

    it('not while one is already waiting', () => {
      const w = shopper('busy', 20);
      w.mind.ask = { id: 1, kind: 'idle', asked: 20, until: 30, question: '?', options: [], lean: 'a' };
      for (let i = 0; i < 30; i++) mindTick(ctxOf(w, `busy-${i}`).c);
      expect(w.mind.ask.id).toBe(1);
      expect(w.mind.advice).toBeUndefined();
    });

    it('not straight after the last one', () => {
      for (let i = 0; i < 80; i++) {
        const w = shopper(`gap-${i}`, 20);
        thinkUntilAsked(w, 'want', 6);
        if (!w.mind.ask) continue;
        advise(w, 'skip');
        // Another ware catches her eye, and she is as chatty as ever, but she asked a moment ago.
        w.mind.wares = {};
        w.mind.cooldown = { advice: w.mind.cooldown.advice! };
        for (let k = 0; k < 40; k++) mindTick(ctxOf(w, `gap-${i}-${k}`).c);
        expect(w.mind.ask).toBeUndefined();
        return;
      }
      throw new Error('she never asked');
    });

    it('is the chatty, loyal, humble ones who check in most', () => {
      const lone = world('halo_floor', { sociable: 0, loyalty: 0, vanity: 1, impulsive: 1 });
      const chatty = world('halo_floor', {});
      expect(askiness(chatty)).toBeGreaterThan(askiness(lone));
      expect(askiness(lone)).toBeGreaterThan(0.1);
    });
  });

  describe('answering', () => {
    it('does nothing when there is no question, or no such answer', () => {
      const w = world('halo_floor');
      expect(advise(w, 'save')).toEqual([]);
      w.mind.ask = { id: 1, kind: 'idle', asked: 20, until: 30, question: '?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], lean: 'a' };
      expect(advise(w, 'nope')).toEqual([]);
      expect(w.mind.ask).toBeDefined();
    });

    it('is part of the world: the question and the answer survive a save and replay the same', () => {
      const play = (answer: boolean) => {
        const { world: w } = createRun({ seed: 'replay', competence: 0.4 });
        let guard = 0;
        while (!w.over && !w.mind.ask && guard++ < 600) step(w);
        if (!w.mind.ask) return null;
        const copy = JSON.parse(JSON.stringify(w)) as World;
        expect(copy.mind.ask).toEqual(w.mind.ask);
        const id = w.mind.ask.options[w.mind.ask.options.length - 1]!.id;
        const first = answer ? advise(w, id) : [];
        const second = answer ? advise(copy, id) : [];
        expect(second).toEqual(first);
        expect(copy.rngPosition).toBe(w.rngPosition);
        return w;
      };
      // Some nights she never asks; find one that does.
      let found = false;
      for (let i = 0; i < 12 && !found; i++) found = !!play(true);
      expect(found).toBe(true);
    });

    it('a night with a question open can be saved and picked up again', () => {
      const u = newUniverse('ask-save');
      for (let i = 0; i < 20; i++) {
        const w = beginRun(u, { seed: `s-${i}`, competence: 0.3 });
        let guard = 0;
        while (!w.over && !w.mind.ask && guard++ < 600) step(w);
        if (!w.mind.ask) continue;
        const text = serialize(makeSave(endRun(w), null, 1));
        expect(deserialize(text).universe).toBeDefined();
        return;
      }
    });
  });

  describe('the text', () => {
    it('has a line for everything she says and everything that comes of it', () => {
      const asks = ['want', 'earn', 'door', 'idle'];
      for (const kind of asks) {
        for (const type of ['advice_ask', 'advice_taken', 'advice_lapsed']) {
          const ev: GameEvent = { beat: 1, type, outcome: 'mixed', data: { variant: kind, item: 'shotgun', price: 900, cash: 60, short: 840, place: 'the Yard', dungeon: 'hideout', near: true, label: 'Save up', pick: 'save' } };
          expect(hasTemplate(ev), `${type}:${kind}`).toBe(true);
          const lines = render(ev, { rng: new Rng('x'), personality: personalityFrom({}), realName: 'Brenda Pilchard' });
          expect(lines[0]!.text).not.toMatch(/[{}]|undefined|NaN/);
        }
      }
    });
  });

  slow('over whole nights: she asks now and then, nothing is left hanging, and unanswered questions end up as what she would have done', () => {
    let asks = 0;
    let nights = 0;
    for (let i = 0; i < 30; i++) {
      const { world: w, events } = runToEnd({ seed: `adv-${i}`, competence: (i % 10) / 10 });
      nights++;
      const opened = events.filter((e) => e.type === 'advice_ask');
      const closed = events.filter((e) => e.type === 'advice_lapsed' || e.type === 'advice_taken');
      asks += opened.length;
      expect(closed.length).toBeGreaterThanOrEqual(opened.length - (w.mind.ask ? 1 : 0));
      // Every question was open for at most the time it was given.
      for (const o of opened) {
        const done = events.find((e) => (e.type === 'advice_lapsed' || e.type === 'advice_taken') && e.beat >= o.beat);
        if (done) expect(done.beat - o.beat).toBeLessThanOrEqual(ASK_BEATS);
      }
    }
    expect(asks / nights).toBeGreaterThan(0.3);
    expect(asks / nights).toBeLessThan(6);
  });
});
