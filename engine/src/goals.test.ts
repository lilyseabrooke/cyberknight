import { describe, expect, it } from 'vitest';
import { slow } from './testkit';
import { Rng, createRun, step, render, hasTemplate, personalityFrom, goalViews, type GameEvent, type Goal, type World } from './index';
import { createWorld } from './world';
import { gather } from './interactions';
import { goalBias, goalCandidates, mindAfter, mindBefore, mindTick } from './goals';
import { MAX_DEPTH, capacity, depth, goalById, topLevel } from './mind';
import { routeTo, shopStock, wareCost } from './plans';
import { makeItem } from './content/items';
import { addNpc, moveNpc } from './population';
import { isFairGame } from './people';

const world = (loc: string, traits: Parameters<typeof personalityFrom>[0] = {}, competence = 0.5): World => {
  const w = createWorld({ seed: 'goals2', competence, personality: personalityFrom(traits) });
  w.hero.locationId = loc;
  return w;
};

const ctx = (w: World, seed = 't') => {
  const events: GameEvent[] = [];
  const rng = new Rng(seed);
  return { c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

let nextId = 100;
/** Put a goal straight into her head, as if she'd already decided. */
const want = (w: World, g: Partial<Goal> & Pick<Goal, 'kind'>): Goal => {
  const goal: Goal = {
    id: nextId++, parent: null, why: 'test', desire: 0.7, frustration: 0, born: w.beat, lastProgress: w.beat, metric: 0, delayUntil: 0, setbacks: 0,
    revisions: 0, lastFocus: 0, ...g,
  };
  w.mind.goals.push(goal);
  return goal;
};

const tick = (w: World, times = 1, seed = 't') => {
  const { c, events } = ctx(w, seed);
  for (let i = 0; i < times; i++) mindTick(c);
  return events;
};

/** A hero with enough HP to survive long enough for goals to play out. */
const tough = (w: World): World => {
  w.hero.maxHp = 600;
  w.hero.hp = 600;
  return w;
};

describe('goals', () => {
  describe('wanting things', () => {
    it('seeing something great in a shop she cannot afford makes it a goal, and the missing money a subgoal', () => {
      let w!: World;
      let events: GameEvent[] = [];
      for (let i = 0; i < 40 && !w?.mind.goals.some((g) => g.kind === 'buy'); i++) {
        w = world('gun_shop', { greed: 0.9, vanity: 0.8, courage: 0.8 });
        w.hero.cash = 60;
        events = tick(w, 1, `seed-${i}`);
      }
      const buy = w.mind.goals.find((g) => g.kind === 'buy')!;
      expect(buy).toBeDefined();
      expect(buy.parent).toBeNull();
      const ware = w.mind.wares[buy.ware!]!;
      expect(ware.kind).toBe('weapon');
      const cash = w.mind.goals.find((g) => g.kind === 'cash')!;
      expect(cash.parent).toBe(buy.id);
      expect(cash.amount).toBe(wareCost(w, ware));
      const keys = events.filter((e) => e.type === 'goal_new').map((e) => e.data.variant);
      expect(keys).toEqual(['want_item', 'short']);
      expect(events[0]!.data.short).toBe(wareCost(w, ware) - 60);
    });

    it('only a goal that is not waiting on a subgoal steers her; the one waiting does not', () => {
      const w = world('halo_floor');
      const buy = want(w, { kind: 'buy', ware: 'zip_pistol' });
      w.mind.wares.zip_pistol = { id: 'zip_pistol', name: 'zip pistol', kind: 'weapon', loc: 'gun_shop', price: 63, power: 7, seen: 0 };
      w.hero.cash = 10;
      tick(w);
      const kid = w.mind.goals.find((g) => g.parent === buy.id)!;
      expect(kid.kind).toBe('cash');
      expect(w.mind.drive.map((d) => d.id)).toEqual([kid.id]);
    });

    it('once she has the money she heads back to the shop and buys the thing', () => {
      const w = world('halo_floor');
      w.mind.wares.zip_pistol = { id: 'zip_pistol', name: 'zip pistol', kind: 'weapon', loc: 'gun_shop', price: 63, power: 7, seen: 0 };
      want(w, { kind: 'buy', ware: 'zip_pistol' });
      w.hero.cash = 10;
      tick(w);
      expect(w.mind.goals.some((g) => g.kind === 'cash')).toBe(true);

      w.hero.cash = 500;
      const events = tick(w);
      expect(events.some((e) => e.type === 'goal_done' && e.data.variant === 'raised')).toBe(true);
      // Strand Street is the way to the gun shop, and she's pulled that way.
      expect(goalBias(w, { key: 'go:street_main' })).toBeGreaterThan(goalBias(w, { key: 'go:halo_restroom' }));

      w.hero.locationId = 'gun_shop';
      tick(w);
      const buy = goalCandidates(w).find((cand) => cand.key === 'buy_ware:zip_pistol')!;
      expect(buy).toBeDefined();
      const { c } = ctx(w);
      buy.run(c);
      w.hero.weapon = w.hero.weapon.power >= 7 ? w.hero.weapon : makeItem('zip_pistol');
      const done = tick(w);
      expect(done.some((e) => e.type === 'goal_done' && e.data.variant === 'bought')).toBe(true);
      // (Standing in a shop window she may well start wanting something else. That's a different goal.)
      expect(w.mind.goals.some((g) => g.ware === 'zip_pistol')).toBe(false);
    });

    it('does not stand around buying things she cannot pay for', () => {
      const w = world('gun_shop');
      w.mind.wares.zip_pistol = { id: 'zip_pistol', name: 'zip pistol', kind: 'weapon', loc: 'gun_shop', price: 63, power: 7, seen: 0 };
      want(w, { kind: 'buy', ware: 'zip_pistol' });
      w.hero.cash = 5;
      expect(goalCandidates(w)).toHaveLength(0);
    });

    it('lists the stock of a shop only when the keeper is there', () => {
      const w = world('gun_shop');
      expect(shopStock(w).length).toBeGreaterThan(5);
      w.npcs.gunsmith!.alive = false;
      expect(shopStock(w)).toHaveLength(0);
    });
  });

  describe('weighing the options', () => {
    it('saving up for something makes her favour what pays, and shun spending', () => {
      const w = world('halo_backroom');
      want(w, { kind: 'cash', amount: 800 });
      w.hero.cash = 50;
      tick(w);
      expect(goalBias(w, { key: 'safe' })).toBeGreaterThan(goalBias(w, { key: 'busk' }));
      expect(goalBias(w, { key: 'busk' })).toBeGreaterThan(goalBias(w, { key: 'chat:nyx' }));
      expect(goalBias(w, { key: 'order_drink' })).toBeLessThan(0);
      expect(goalBias(w, { key: 'buy_noodles' })).toBeLessThan(0);
    });

    it('learns what things actually pay: an action that keeps failing loses its shine', () => {
      const w = world('halo_floor');
      want(w, { kind: 'cash', amount: 800 });
      tick(w);
      const before = goalBias(w, { key: 'till' });
      const { c } = ctx(w);
      for (let i = 0; i < 12; i++) {
        const snap = mindBefore(w);
        w.hero.cash -= 15; // every till job costs her
        mindAfter(c, { key: 'till', drives: {}, run() {} }, snap, []);
      }
      tick(w);
      expect(goalBias(w, { key: 'till' })).toBeLessThan(before);
      expect(w.mind.earn.till).toBeLessThan(90);
    });

    it('is drawn towards whoever she is trying to impress, but only acts on it when they are there', () => {
      const w = world('halo_floor');
      const nyx = w.npcs.nyx!;
      want(w, { kind: 'romance', npc: nyx.id });
      tick(w);
      expect(goalBias(w, { key: `flirt:${nyx.id}` })).toBeGreaterThan(0);
      expect(goalBias(w, { key: `flirt:${w.npcs.juno!.id}` })).toBe(0);
      w.hero.locationId = 'street_main';
      tick(w);
      expect(goalBias(w, { key: `flirt:${nyx.id}` })).toBe(0);
      // ... though a free evening finds her drifting that way.
      expect(goalBias(w, { key: 'go:halo_floor' })).toBeGreaterThan(0);
    });
  });

  describe('nested goals', () => {
    it('a grudge against someone stronger makes her find a better weapon first', () => {
      const w = world('halo_floor', {}, 1);
      const foe = w.npcs.tiny!;
      foe.power = 60;
      moveNpc(w, foe, 'halo_floor');
      const kill = want(w, { kind: 'kill', npc: foe.id, mode: 'kill' });
      const events = tick(w, 30, 'prep');
      const kid = w.mind.goals.find((g) => g.parent === kill.id);
      expect(kid?.kind).toBe('weapon');
      expect(events.some((e) => e.type === 'goal_new' && e.data.variant === 'prep')).toBe(true);
      // While she's preparing she does not just wade in: the grudge itself isn't steering her.
      expect(w.mind.drive.map((d) => d.id)).not.toContain(kill.id);
      expect(w.mind.drive.map((d) => d.id)).toContain(kid!.id);
    });

    it('chains all the way down: grudge, weapon, purchase, money, heist', () => {
      const w = tough(world('halo_floor', { greed: 0.8, thrill: 0.9, honesty: 0.1, grudge: 0.9, temper: 0.9 }, 1));
      w.locations.halo_backroom!.visits = 1;
      const foe = w.npcs.tiny!;
      foe.power = 70;
      const kill = want(w, { kind: 'kill', npc: foe.id, mode: 'kill' });
      let seen = 0;
      for (let i = 0; i < 400 && seen < 4; i++) {
        // She has to walk past the gun shop window to know what's in it.
        w.hero.locationId = i === 5 ? 'gun_shop' : 'halo_floor';
        w.hero.cash = Math.min(w.hero.cash, 60);
        tick(w, 1, `chain-${i}`);
        w.beat++;
        seen = Math.max(seen, ...w.mind.goals.map((g) => depth(w, g)));
      }
      expect(seen).toBeGreaterThanOrEqual(4);
      const deepest = [...w.mind.goals].sort((a, b) => depth(w, b) - depth(w, a))[0]!;
      const kinds: string[] = [];
      for (let g: Goal | undefined = deepest; g; g = goalById(w, g.parent)) kinds.unshift(g.kind);
      expect(kinds.slice(0, 4)).toEqual(['kill', 'weapon', 'buy', 'cash']);
      expect(w.mind.goals.find((g) => g.kind === 'kill')).toBe(kill);
    });
  });

  describe('exploring', () => {
    const fresh = () => {
      const w = tough(world('halo_floor', { curiosity: 0.6 }, 1));
      const target = Object.values(w.locations).find((l) => l.visits === 0 && !l.dungeon && !['home', 'corp', 'boss', 'lair'].includes(l.kind) && routeTo(w, 'halo_floor', l.id));
      return { w, target: target! };
    };

    it('ends the moment she has been to the place', () => {
      const { w, target } = fresh();
      const g = want(w, { kind: 'explore', loc: target.id });
      expect(tick(w, 1).some((e) => e.type === 'goal_done')).toBe(false);
      target.visits = 1;
      expect(tick(w, 1).some((e) => e.type === 'goal_done' && e.data.variant === 'explored')).toBe(true);
      expect(w.mind.goals).not.toContain(g);
    });

    it('turns up on its own rarely, and much more when she is sick of where she is standing', () => {
      const count = (doings: number) => {
        let n = 0;
        for (let i = 0; i < 40; i++) {
          const { w } = fresh();
          w.locations.halo_floor!.doings = doings;
          if (tick(w, 200, `idle-${doings}-${i}`).some((e) => e.type === 'goal_new' && e.data.variant === 'explore_idea')) n++;
        }
        return n;
      };
      const calm = count(0);
      const bored = count(40);
      expect(bored).toBeGreaterThan(calm);
      expect(bored).toBeGreaterThan(10);
    });

    it('is a step toward money when she knows few places to earn', () => {
      let steps = 0;
      for (let i = 0; i < 40; i++) {
        const { w } = fresh();
        want(w, { kind: 'cash', amount: 500 });
        const events = tick(w, 200, `sub-${i}`);
        for (const e of events) if (e.type === 'goal_new' && e.data.variant === 'explore_cash') steps++;
      }
      expect(steps).toBeGreaterThan(3);
    });
  });

  describe('heists', () => {
    const heist = () => {
      const w = world('halo_floor');
      w.locations.halo_backroom!.visits = 1;
      const g = want(w, { kind: 'heist', loc: 'halo_backroom', mode: 'approach', heat0: 0 });
      return { w, g };
    };

    it('walks in, loots, and walks out, and keeps quiet along the way', () => {
      const { w, g } = heist();
      tick(w);
      expect(w.mind.hops.halo_backroom).toBeGreaterThan(0);
      // Quiet: no picking fights on the way in.
      expect(goalBias(w, { key: 'challenge:tiny' })).toBeLessThan(0);

      w.hero.locationId = 'halo_backroom';
      expect(tick(w).some((e) => e.type === 'goal_note' && e.data.variant === 'inside')).toBe(true);
      expect(g.mode).toBe('loot');
      expect(goalBias(w, { key: 'safe' })).toBeGreaterThan(2);

      const { c } = ctx(w);
      const snap = mindBefore(w);
      w.hero.cash += 300;
      mindAfter(c, { key: 'safe', drives: {}, run() {} }, snap, [{ beat: w.beat, type: 'safe', outcome: 'good', data: {} }]);
      expect(tick(w).some((e) => e.type === 'goal_note' && e.data.variant === 'haul')).toBe(true);
      expect(g.mode).toBe('escape');
      // Don't go back for more.
      expect(goalBias(w, { key: 'safe' })).toBeLessThan(0);

      w.hero.locationId = 'halo_floor';
      const done = tick(w);
      expect(done.find((e) => e.type === 'goal_done')?.data.variant).toBe('clean');
      expect(w.mind.goals.filter((g) => g.kind === 'heist')).toHaveLength(0);
    });

    it('makes noise and the plan changes: a competent hero bails, a clueless one presses on', () => {
      const bail = (competence: number) => {
        const { w, g } = heist();
        w.hero.competence = competence;
        w.hero.locationId = 'halo_backroom';
        tick(w);
        const { c } = ctx(w, 'noise');
        const snap = mindBefore(w);
        w.heat.npd = 4;
        mindAfter(c, { key: 'challenge:tiny', drives: {}, run() {} }, snap, []);
        return g;
      };
      const sharp = bail(1);
      expect(sharp.blown).toBe(true);
      expect(sharp.mode).toBe('escape');
      let pressed = 0;
      for (let i = 0; i < 20; i++) {
        const { w, g } = heist();
        w.hero.competence = 0;
        w.hero.locationId = 'halo_backroom';
        tick(w);
        const { c } = ctx(w, `n${i}`);
        w.heat.npd = 4;
        mindAfter(c, { key: 'challenge:tiny', drives: {}, run() {} }, mindBefore(w), []);
        if (g.mode === 'loot') pressed++;
      }
      expect(pressed).toBeGreaterThan(8);
    });

    it('will not plan a robbery of somewhere she has never seen or cannot get into', () => {
      const w = world('halo_floor');
      expect(routeTo(w, 'halo_floor', 'helix_lab')).toBeNull();
      const w2 = tough(world('halo_floor', { greed: 1, thrill: 1, honesty: 0 }, 1));
      want(w2, { kind: 'cash', amount: 9999 });
      for (let i = 0; i < 300; i++) tick(w2, 1, `h${i}`);
      expect(w2.mind.goals.some((g) => g.kind === 'heist')).toBe(false);
    });
  });

  describe('delaying, giving up, changing her mind', () => {
    it('puts a fight off while she is hurt, and takes it back up when she has healed', () => {
      const w = world('halo_floor');
      const foe = w.npcs.tiny!;
      foe.power = 1; // nothing to prepare for
      const kill = want(w, { kind: 'kill', npc: foe.id, mode: 'kill' });
      w.mind.lastSeen[foe.id] = 'halo_floor';
      w.hero.hp = 15;
      const events = tick(w);
      expect(events.some((e) => e.type === 'goal_delay' && e.data.variant === 'hurt')).toBe(true);
      expect(kill.delayUntil).toBeGreaterThan(w.beat);
      expect(w.mind.drive).toHaveLength(0);
      expect(goalViews(w)[0]!.status).toBe('held');

      w.hero.hp = w.hero.maxHp;
      expect(tick(w).some((e) => e.type === 'goal_wake')).toBe(true);
      expect(kill.delayUntil).toBe(0);
      expect(w.mind.drive.map((d) => d.id)).toContain(kill.id);
    });

    it('gets bored: wanting fades, and a goal nobody feeds eventually goes', () => {
      const w = world('street_main');
      const g = want(w, { kind: 'romance', npc: 'nyx', desire: 0.5 });
      let dropped = false;
      for (let i = 0; i < 600 && !dropped; i++) {
        w.beat++;
        dropped = tick(w).some((e) => e.type === 'goal_drop' && e.data.variant === 'bored');
      }
      expect(dropped).toBe(true);
      expect(w.mind.goals).not.toContain(g);
      expect(w.mind.tally.dropped).toBe(1);
    });

    it('holds on harder to the things she is the type to hold on to', () => {
      const lifespan = (grudge: number) => {
        const w = world('street_main', { grudge, temper: grudge });
        want(w, { kind: 'kill', npc: 'tiny', desire: 0.6 });
        w.mind.lastSeen.tiny = 'halo_floor';
        for (let i = 1; i < 2000; i++) {
          w.beat = i;
          w.hero.hp = w.hero.maxHp;
          tick(w);
          if (!w.mind.goals.length) return i;
        }
        return 2000;
      };
      expect(lifespan(1)).toBeGreaterThan(lifespan(0) * 1.5);
    });

    it('gets frustrated when nothing is working, and reworks the plan before quitting', () => {
      const w = world('halo_floor');
      const kill = want(w, { kind: 'kill', npc: 'tiny', mode: 'kill', frustration: 0.65, lastProgress: -999 });
      w.mind.lastSeen.tiny = 'halo_floor';
      const events = tick(w);
      expect(events.find((e) => e.type === 'goal_revise')?.data.variant).toBe('settle');
      expect(kill.mode).toBe('beat_up');
      expect(kill.frustration).toBeLessThan(0.5);
    });

    it('settles for something cheaper if the thing she wants is out of reach for too long', () => {
      const w = world('halo_floor');
      w.mind.wares.rail_revolver = { id: 'rail_revolver', name: 'rail revolver', kind: 'weapon', loc: 'gun_shop', price: 720, power: 18, seen: 0 };
      w.mind.wares.zip_pistol = { id: 'zip_pistol', name: 'zip pistol', kind: 'weapon', loc: 'gun_shop', price: 63, power: 7, seen: 0 };
      const buy = want(w, { kind: 'buy', ware: 'rail_revolver', frustration: 0.7, lastProgress: -999 });
      w.hero.cash = 10;
      const events = tick(w);
      expect(events.find((e) => e.type === 'goal_revise')?.data.variant).toBe('cheaper');
      expect(buy.ware).toBe('zip_pistol');
    });

    it('an item that sells out from under her sends her to the next best thing, or ends the goal', () => {
      const w = world('halo_floor');
      w.mind.wares.rail_revolver = { id: 'rail_revolver', name: 'rail revolver', kind: 'weapon', loc: 'gun_shop', price: 720, power: 18, seen: 0 };
      w.mind.wares.zip_pistol = { id: 'zip_pistol', name: 'zip pistol', kind: 'weapon', loc: 'gun_shop', price: 63, power: 7, seen: 0 };
      const buy = want(w, { kind: 'buy', ware: 'rail_revolver' });
      w.flags['sold:rail_revolver'] = true;
      expect(tick(w).find((e) => e.type === 'goal_revise')?.data.variant).toBe('sold_out');
      expect(buy.ware).toBe('zip_pistol');
      w.flags['sold:zip_pistol'] = true;
      expect(tick(w).find((e) => e.type === 'goal_drop')?.data.variant).toBe('sold_out');
    });

    it('drops a goal that no longer makes sense: the target is dead, or something better turned up', () => {
      const w = world('halo_floor');
      want(w, { kind: 'kill', npc: 'tiny' });
      w.npcs.tiny!.alive = false;
      expect(tick(w).find((e) => e.type === 'goal_drop')?.data.variant).toBe('someone_else');

      w.mind.wares.zip_pistol = { id: 'zip_pistol', name: 'zip pistol', kind: 'weapon', loc: 'gun_shop', price: 63, power: 7, seen: 0 };
      want(w, { kind: 'buy', ware: 'zip_pistol' });
      w.hero.weapon = makeItem('rail_revolver');
      expect(tick(w).find((e) => e.type === 'goal_drop')?.data.variant).toBe('got_better');
    });

    it('a kill goal in a bar ends in a beating, which she counts', () => {
      const w = world('halo_floor');
      const tiny = w.npcs.tiny!;
      const kill = want(w, { kind: 'kill', npc: tiny.id, mode: 'kill', struck: true });
      tiny.downUntil = w.beat + 20;
      expect(tick(w).find((e) => e.type === 'goal_done')?.data.variant).toBe('settled');
      expect(w.mind.goals).not.toContain(kill);
    });
  });

  describe('not being overloaded', () => {
    it('never juggles more than she can, and the weakest goes first', () => {
      const w = tough(world('halo_floor', { romantic: 0.2, impress: 1 }, 0.1));
      const girls = Object.values(w.npcs).filter((n) => isFairGame(n));
      expect(girls.length).toBeGreaterThan(0);
      const cap = capacity(w);
      for (let i = 0; i < cap + 3; i++) want(w, { kind: 'kill', npc: `foe${i}`, desire: 0.3 + i * 0.01 });
      for (let i = 0; i < cap + 3; i++) addNpc(w, { ...w.npcs.tiny!, id: `foe${i}`, locationId: '_gone' });
      const events = tick(w);
      expect(topLevel(w).length).toBeLessThanOrEqual(cap);
      expect(events.filter((e) => e.type === 'goal_drop' && e.data.variant === 'overloaded').length).toBe(3);
      // The three she wanted least are the three that went.
      expect(topLevel(w).map((g) => g.npc)).not.toContain('foe0');
      expect(topLevel(w).map((g) => g.npc)).not.toContain('foe1');
      expect(topLevel(w).map((g) => g.npc)).not.toContain('foe2');
      expect(topLevel(w).map((g) => g.npc)).toContain(`foe${cap + 2}`);
    });

    it('sharper heroes juggle more, and rash ones overcommit', () => {
      expect(capacity(world('halo_floor', {}, 1))).toBeGreaterThan(capacity(world('halo_floor', {}, 0)));
      expect(capacity(world('halo_floor', { impulsive: 1 }))).toBeGreaterThan(capacity(world('halo_floor', { impulsive: 0 })));
    });
  });

  describe('in the sim', () => {
    const night = (seed: string, competence: number) => {
      const { world: w, events } = createRun({ seed, competence });
      tough(w);
      const all: GameEvent[] = [...events];
      const problems: string[] = [];
      let guard = 0;
      while (!w.over && guard++ < 700) {
        all.push(...step(w));
        const ids = new Set(w.mind.goals.map((g) => g.id));
        if (ids.size !== w.mind.goals.length) problems.push('duplicate ids');
        if (topLevel(w).length > capacity(w)) problems.push('over capacity');
        for (const g of w.mind.goals) {
          if (g.parent !== null && !ids.has(g.parent)) problems.push(`orphan ${g.kind}`);
          if (depth(w, g) >= MAX_DEPTH) problems.push('too deep');
          if (g.desire < 0 || g.desire > 1 || g.frustration < 0 || g.frustration > 1) problems.push('out of range');
        }
      }
      return { w, all, problems };
    };

    slow('goals keep their structure intact, and survive a save and resume', () => {
      for (let i = 0; i < 12; i++) {
        const { problems } = night(`inv-${i}`, 0.6);
        expect(problems).toEqual([]);
      }
      const { world: w } = createRun({ seed: 'mind-resume', competence: 0.6 });
      tough(w);
      for (let i = 0; i < 60 && !w.over; i++) step(w);
      const copy: World = JSON.parse(JSON.stringify(w));
      const a: GameEvent[] = [];
      const b: GameEvent[] = [];
      for (let i = 0; i < 60 && !w.over; i++) a.push(...step(w));
      for (let i = 0; i < 60 && !copy.over; i++) b.push(...step(copy));
      expect(b).toEqual(a);
      expect(copy.mind).toEqual(w.mind);
    });

    slow('over many nights she forms every kind of goal, finishes some, gives up some, and nests them', () => {
      const kinds = new Set<string>();
      const variants = new Set<string>();
      let nested = 0;
      let maxDepth = 0;
      const unrendered = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const { w, all } = night(`sweep-${i}`, 0.6);
        for (const e of all) {
          if (!e.type.startsWith('goal_') && e.type !== 'slight' && e.type !== 'impressed') continue;
          variants.add(`${e.type}:${e.data.variant ?? ''}`);
          if (!hasTemplate(e)) unrendered.add(`${e.type}:${e.data.variant}`);
          if (e.type === 'goal_new') {
            kinds.add(String(e.data.kind));
            if (e.data.nested) nested++;
          }
        }
        maxDepth = Math.max(maxDepth, ...w.mind.goals.map((g) => depth(w, g)));
      }
      for (const k of ['buy', 'cash', 'kill', 'romance', 'weapon', 'fame', 'dragon']) expect(kinds, k).toContain(k);
      expect(nested).toBeGreaterThan(5);
      expect([...variants].some((v) => v.startsWith('goal_done'))).toBe(true);
      expect([...variants].some((v) => v.startsWith('goal_drop'))).toBe(true);
      expect([...variants].some((v) => v.startsWith('goal_delay'))).toBe(true);
      expect([...unrendered]).toEqual([]);
    });

    slow('every goal line renders to prose, with no placeholders left over', () => {
      const rng = new Rng('prose');
      let lines = 0;
      for (let i = 0; i < 25; i++) {
        const { w, all } = night(`prose-${i}`, 0.6);
        for (const e of all) {
          if (!e.type.startsWith('goal_') && e.type !== 'slight' && e.type !== 'impressed') continue;
          for (const l of render(e, { rng, personality: w.hero.personality, realName: w.hero.realName })) {
            lines++;
            expect(l.text, `${e.type}:${e.data.variant}`).not.toMatch(/\{\w+\}|undefined|NaN|\[object/);
          }
        }
      }
      expect(lines).toBeGreaterThan(50);
    });

    slow('goals change what she does: a nightly goal-driven hero ends up with things she went out and got', () => {
      let bought = 0;
      let raised = 0;
      for (let i = 0; i < 40; i++) {
        const { all } = night(`pay-${i}`, 0.6);
        bought += all.filter((e) => e.type === 'goal_done' && e.data.variant === 'bought').length;
        raised += all.filter((e) => e.type === 'goal_done' && e.data.variant === 'raised').length;
      }
      expect(raised).toBeGreaterThan(0);
      expect(bought).toBeGreaterThan(0);
    });

    it('gather still offers sensible candidates once she has goals', () => {
      const { w } = night('gather', 0.6);
      expect(gather(w).length).toBeGreaterThan(0);
    });
  });
});
