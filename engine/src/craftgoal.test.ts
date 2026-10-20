import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { addSpot, childId } from './mapgen';
import { kill, relocate } from './combat';
import { garrisonAlive } from './dungeons';
import { mindTick } from './goals';
import { childrenOf } from './mind';
import { makeItem } from './content/items';
import { RECIPES } from './content/parts';
import type { Goal, GameEvent, Id, Location, World } from './types';

/** A world with a chop shop whose street she has walked, and (optionally) a cleared scrap camp on another street she has walked. */
function setup(withSpot: boolean) {
  for (let i = 0; i < 80; i++) {
    let shop: Location | undefined;
    const sc = scenario({
      seed: `cg-${i}`,
      setup: (w) => {
        const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
        for (let n = 0; queue.length && n < 300 && !shop; n++) {
          const l = w.locations[queue.shift()!];
          if (!l) continue;
          relocate(w, l.id);
          if (l.chop) shop = l;
          for (const e of l.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
        }
      },
    });
    if (!shop) continue;
    const w = sc.w;
    const street = w.locations[shop.gen!.parent]!;
    street.visits = 1;
    relocate(w, street.id);
    let spot: Location | undefined;
    if (withSpot) {
      spot = addSpot(w, street, 'scrapper_camp', 60, 2);
      relocate(w, spot.id);
      sc.run((c) => { for (const n of garrisonAlive(w, w.dungeons[spot!.id]!)) kill(c, w, n, 'test'); });
      relocate(w, street.id);
    }
    w.hero.skills = { tinkering: 6000 };
    w.hero.parts = {};
    w.hero.hp = w.hero.maxHp;
    return { sc, w, shop, spot, street };
  }
  throw new Error('no chop shop');
}

const tick = (w: World, n = 1): GameEvent[] => {
  const events: GameEvent[] = [];
  const rng = new Rng('t');
  const c = { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) };
  for (let i = 0; i < n; i++) mindTick(c as never);
  return events;
};

const want = (w: World, amount: number): Goal => {
  const g: Goal = { id: 900, kind: 'weapon', parent: null, why: 'test', desire: 0.8, frustration: 0, born: w.beat, lastProgress: w.beat, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0, amount };
  w.mind.goals.push(g);
  return g;
};

describe('building a weapon as a goal', () => {
  it('is what "find a better weapon" turns into when there is a bench she knows and she can build something better, and nothing in the shop', () => {
    const { w } = setup(true);
    const g = want(w, 12);
    const evs = tick(w, 2);
    const kid = childrenOf(w, g).find((k) => k.kind === 'craft');
    expect(kid).toBeTruthy();
    expect(RECIPES.some((r) => r.item === kid!.ware)).toBe(true);
    expect(evs.some((e) => e.type === 'goal_new' && e.data.variant === 'want_craft')).toBe(true);
  });

  it('needs a bench she has seen and the skill for the recipe', () => {
    const a = setup(true);
    a.w.locations[a.shop.id]!.chop = undefined;
    const g = want(a.w, 12);
    tick(a.w, 2);
    expect(childrenOf(a.w, g).some((k) => k.kind === 'craft')).toBe(false);
    const b = setup(true);
    b.w.hero.skills = {};
    const g2 = want(b.w, 12);
    tick(b.w, 2);
    // (With no skill she can still knock together what takes none.)
    for (const k of childrenOf(b.w, g2).filter((x) => x.kind === 'craft')) expect(RECIPES.find((r) => r.item === k.ware)!.skill).toBe(0);
  });

  it('sends her for parts when she is short, from a clear spot that has them, and stops when she has enough', () => {
    const { w, spot } = setup(true);
    const g = want(w, 12);
    tick(w, 3);
    const craft = childrenOf(w, g).find((k) => k.kind === 'craft')!;
    const sub = childrenOf(w, craft).find((k) => k.kind === 'scavenge');
    expect(sub).toBeTruthy();
    expect(sub!.loc).toBe(spot!.id);
    // She gets what the recipe needs.
    const r = RECIPES.find((x) => x.item === craft.ware)!;
    w.hero.parts = { ...r.parts };
    const evs = tick(w, 1);
    expect(evs.some((e) => e.type === 'goal_done' && e.data.variant === 'stocked')).toBe(true);
    expect(childrenOf(w, craft).length).toBe(0);
  });

  it('is done when the thing is built, and the weapon goal with it', () => {
    const { w } = setup(true);
    const g = want(w, 12);
    tick(w, 3);
    const craft = childrenOf(w, g).find((k) => k.kind === 'craft')!;
    const item = makeItem(craft.ware!);
    item.tags.push('homemade');
    w.hero.weapon = item;
    const evs = tick(w, 1);
    expect(evs.some((e) => e.type === 'goal_done' && e.data.variant === 'built')).toBe(true);
  });
});
