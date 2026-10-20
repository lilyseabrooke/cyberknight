import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { isShut, afterTakedown } from './shutdown';
import { kill, relocate } from './combat';
import { childId, expand } from './mapgen';
import { CHOP_CHANCE, DOORS, SHELLS, TRAITS, BENCHES, rollChop, chopRoster } from './content/chops';
import { AMMO_RECIPES, PARTS, RECIPES, baseName, billText, breakable, canAfford, salvageBill, upgradeBill } from './content/parts';
import { AMMO } from './content/ammo';
import { ARCHETYPES } from './content/archetypes';
import { ITEMS, makeItem } from './content/items';
import { everyoneAt } from './population';
import { chopBench, doorman, guarded, hasPass, viewAt } from './chop';
import { benchUrge, benchWork, chopCandidates } from './chop';
import { boxRounds, craftable, maxMods, junk as junkOf, upgradable } from './bench';
import { render } from './text';
import { skillLevel } from './skills';
import type { Id, Location, World } from './types';

const DISTRICTS = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'] as const;
const roll = (n: number, seed = 'c') => Array.from({ length: n }, (_, i) => rollChop(new Rng(`${seed}:${i}`), DISTRICTS[i % 6]!, 3));

/** Walk outward from the hand-built district until a chop shop turns up. */
function findChop(w: World, limit = 400): Location | undefined {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  let seen = 0;
  while (queue.length && seen++ < limit) {
    const id = queue.shift()!;
    const loc = w.locations[id];
    if (!loc) continue;
    relocate(w, id);
    if (loc.chop) return loc;
    for (const e of loc.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return Object.values(w.locations).find((l) => l.chop);
}

/** A scenario with Blackbird standing in a chop shop. Tries seeds until the city has one. */
function inChop(opts: { want?: (l: Location) => boolean; from?: number } = {}): Scenario {
  for (let i = opts.from ?? 0; i < (opts.from ?? 0) + 120; i++) {
    let found: Id | undefined;
    const sc = scenario({
      seed: `choptest-${i}`,
      setup: (w) => {
        const g = findChop(w);
        if (!g || (opts.want && !opts.want(g))) return;
        relocate(w, g.id);
        found = g.id;
        w.hero.cash = 600;
        w.hero.hp = w.hero.maxHp;
      },
    });
    if (found && sc.w.hero.locationId === found) return sc;
  }
  throw new Error('no chop shop found in 120 seeds');
}

const rctx = (sc: Scenario) => ({ rng: new Rng('r'), personality: sc.w.hero.personality, realName: 'Brenda Pilchard' });
const shopOf = (sc: Scenario): Location => sc.w.locations[sc.w.hero.locationId]!;

describe('rolling a chop shop', () => {
  it('is the same shop for the same stream, and different for others', () => {
    expect(roll(30, 'a')).toEqual(roll(30, 'a'));
    expect(roll(30, 'a')).not.toEqual(roll(30, 'b'));
  });

  it('only ever names things the tables know, and puts a price on the door', () => {
    for (const g of roll(500)) {
      const i = g.info;
      expect(SHELLS[i.shell]).toBeTruthy();
      expect(DOORS[i.door]).toBeTruthy();
      expect(BENCHES[i.tier]).toBeTruthy();
      for (const t of i.traits) expect(TRAITS[t]).toBeTruthy();
      expect(i.fee).toBeGreaterThanOrEqual(5);
      expect(i.fee).toBeLessThan(200);
      expect(g.blurb).toContain('{name}');
      expect(g.name.length).toBeGreaterThan(2);
      expect(g.security).toBeGreaterThanOrEqual(2);
    }
  });

  it('is a small space but not a boring one: every shell, tier, door and trait turns up, and the door scales with the bench', () => {
    const gs = roll(1500);
    expect(new Set(gs.map((g) => g.info.shell)).size).toBe(Object.keys(SHELLS).length);
    expect(new Set(gs.map((g) => g.info.tier)).size).toBe(5);
    expect(new Set(gs.map((g) => g.info.door)).size).toBe(2);
    expect(new Set(gs.flatMap((g) => g.info.traits)).size).toBe(Object.keys(TRAITS).length);
    const avgFee = (t: number) => {
      const xs = gs.filter((g) => g.info.tier === t && g.info.traits.length === 0);
      return xs.reduce((s, g) => s + g.info.fee, 0) / xs.length;
    };
    expect(avgFee(5)).toBeGreaterThan(avgFee(1) + 20);
  });

  it('is one street in about twelve', () => {
    for (const d of DISTRICTS) expect(CHOP_CHANCE[d]).toBeLessThan(0.2);
  });
});

describe('where chop shops grow', () => {
  it('turns up in the city, on a stream of its own, after everything else on its street', () => {
    let shops = 0;
    for (let i = 0; i < 25; i++) {
      const sc = scenario({ seed: `cgrow-${i}`, setup: (w) => void findChop(w, 100) });
      for (const street of Object.values(sc.w.locations).filter((l) => l.gen?.role === 'street' && l.gen.expanded)) {
        const kids = street.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.gen?.parent === street.id && l.gen.role !== 'street');
        for (const g of kids.filter((l) => l!.gen!.role === 'chop')) {
          shops++;
          expect(g!.kind).toBe('chop');
          expect(g!.chop).toBeTruthy();
          expect(g!.faction?.startsWith('v:')).toBe(true);
          for (const other of kids.filter((l) => !['gym', 'gymroom', 'pawn', 'pawnroom', 'chop', 'hub', 'gamehall', 'gamehallroom', 'studio', 'cutting', 'luthier', 'musehq', 'arena', 'fanclub'].includes(l!.gen!.role))) expect(g!.gen!.slot).toBeGreaterThan(other!.gen!.slot);
        }
      }
    }
    expect(shops).toBeGreaterThan(0);
  });
});

describe('who is in a chop shop', () => {
  it('has someone on the door, a mechanic at the bench, and everyone is a real kind of person', () => {
    const sc = inChop();
    const here = everyoneAt(sc.w, shopOf(sc).id);
    expect(here.some((n) => n.tags.includes('guard'))).toBe(true);
    for (const n of here) expect(ARCHETYPES[n.archetype]).toBeTruthy();
    const slots = chopRoster(shopOf(sc), shopOf(sc).chop!);
    expect(slots.some((s) => s.role === 'chop_mechanic')).toBe(true);
  });

  it('puts a bot on the door where the shop rolled one, and a person where it did not', () => {
    const bot = inChop({ want: (l) => l.chop!.door === 'bot' });
    expect(everyoneAt(bot.w, shopOf(bot).id).some((n) => n.archetype === 'chop_bot')).toBe(true);
    const per = inChop({ want: (l) => l.chop!.door === 'guard' });
    expect(everyoneAt(per.w, shopOf(per).id).some((n) => n.archetype === 'chop_guard')).toBe(true);
  });
});

describe('components', () => {
  it('break down into parts the game knows, for everything that can go on a bench', () => {
    let n = 0;
    for (const [id] of Object.entries(ITEMS)) {
      const it = makeItem(id);
      if (!breakable(it)) continue;
      n++;
      const bill = salvageBill(it);
      expect(Object.keys(bill).length, id).toBeGreaterThan(0);
      for (const [p, q] of Object.entries(bill)) {
        expect(PARTS[p], `${id} -> ${p}`).toBeTruthy();
        expect(q, `${id} -> ${p}`).toBeGreaterThan(0);
      }
    }
    expect(n).toBeGreaterThan(60);
    // Keepsakes, keys, relics and the cursed stay whole.
    for (const id of ['relic_guitar', 'forged_pass', 'cursed_charm', 'champ_belt']) expect(breakable(makeItem(id)), id).toBe(false);
  });

  it('give more for better things, and every recipe builds a real item out of real parts', () => {
    expect(Object.values(salvageBill(makeItem('gauss_smg'))).reduce((s, x) => s + x, 0)).toBeGreaterThan(Object.values(salvageBill(makeItem('switchblade'))).reduce((s, x) => s + x, 0));
    for (const r of RECIPES) {
      expect(ITEMS[r.item], r.item).toBeTruthy();
      for (const p of Object.keys(r.parts)) expect(PARTS[p], `${r.item} needs ${p}`).toBeTruthy();
      expect(r.tier).toBeGreaterThanOrEqual(1);
      expect(r.tier).toBeLessThanOrEqual(5);
    }
    for (const t of Object.keys(AMMO)) expect(AMMO_RECIPES[t], t).toBeTruthy();
  });

  it('cost more for each mod', () => {
    const it = makeItem('riot_shotgun');
    const first = billText(upgradeBill(it));
    it.mods = 3;
    expect(billText(upgradeBill(it))).not.toBe(first);
    expect(baseName('riot shotgun +3')).toBe('riot shotgun');
  });
});

describe('getting in', () => {
  const junk = (sc: Scenario) => {
    sc.w.hero.inventory = [makeItem('data_slate'), makeItem('torque_wrench')];
  };

  it('is guarded until she has a pass, and the bench is closed to her until she does', () => {
    const sc = inChop();
    junk(sc);
    const v = viewAt(sc.w)!;
    expect(guarded(sc.w, v)).toBe(true);
    expect(chopBench(sc.w, shopOf(sc))).toBeUndefined();
    expect(sc.offers().some((k) => k.startsWith('bench:'))).toBe(false);
    expect(sc.offers()).toContain('chopin:pay');
    expect(sc.offers()).toContain('chopin:flatline');
  });

  it('offers the ways in only when she has something to do at the bench (bar the one that is a fight)', () => {
    const sc = inChop();
    sc.w.hero.inventory = [];
    sc.w.hero.parts = {};
    const keys = sc.offers().filter((k) => k.startsWith('chopin:'));
    expect(keys.filter((k) => k !== 'chopin:flatline')).toEqual([]);
    junk(sc);
    expect(sc.offers().filter((k) => k.startsWith('chopin:')).length).toBeGreaterThanOrEqual(5);
  });

  it('takes the flat fee and gives her the bench for the day, and not the next', () => {
    const sc = inChop();
    junk(sc);
    const fee = shopOf(sc).chop!.fee;
    const before = sc.w.hero.cash;
    sc.do('chopin:pay', always());
    expect(sc.w.hero.cash).toBe(before - fee);
    expect(hasPass(sc.w, shopOf(sc))).toBe(true);
    expect(chopBench(sc.w, shopOf(sc))?.tier).toBe(shopOf(sc).chop!.tier);
    expect(sc.offers().some((k) => k.startsWith('bench:salvage'))).toBe(true);
    sc.w.clock += 1440 * 2;
    expect(hasPass(sc.w, shopOf(sc))).toBe(false);
  });

  it('will not take money she does not have', () => {
    const sc = inChop();
    junk(sc);
    const fee = shopOf(sc).chop!.fee;
    sc.w.hero.cash = fee - 1;
    expect(sc.offers()).not.toContain('chopin:pay');
    sc.w.hero.cash = Math.ceil(fee / 2) - 1;
    expect(sc.offers()).not.toContain('chopin:haggle');
  });

  it('can be talked down, snuck past, picked, hacked and bluffed: a win is a pass and a loss is not', () => {
    const ways: [string, (door: 'guard' | 'bot') => boolean][] = [['haggle', (d) => d === 'guard'], ['sneak', () => true], ['picklock', () => true], ['hack', () => true], ['bluff', (d) => d === 'guard']];
    for (const door of ['guard', 'bot'] as const) {
      for (const [way, applies] of ways) {
        for (const luck of ['win', 'lose'] as const) {
          const sc = inChop({ want: (l) => l.chop!.door === door });
          junk(sc);
          // Skilled, so the odds are high enough for the "always"/"never" rigging to be meaningful.
          sc.w.hero.skills = { tinkering: 5000, sneak: 5000, lockpicking: 5000, haggling: 5000, grifting: 5000 };
          const key = `chopin:${way}`;
          if (!applies(door)) {
            expect(sc.offers(), `${way} on a ${door}`).not.toContain(key);
            continue;
          }
          const cash = sc.w.hero.cash;
          const evs = sc.do(key, luck === 'win' ? always() : never());
          expect(hasPass(sc.w, shopOf(sc)), `${way} ${door} ${luck}`).toBe(luck === 'win');
          const said = evs.find((e) => e.type === 'chop');
          expect(said, `${way} ${door} ${luck}`).toBeTruthy();
          const text = render(said!, rctx(sc)).map((l) => l.text).join(' ');
          expect(text, `${way} ${door} ${luck}`).not.toMatch(/\{|\}|undefined|NaN/);
          expect(text.length).toBeGreaterThan(20);
          if (way === 'haggle') expect(sc.w.hero.cash).toBe(luck === 'win' ? cash - Math.ceil(shopOf(sc).chop!.fee / 2) : cash);
          if (luck === 'lose' && way === 'sneak') expect(sc.w.hero.hp).toBeLessThan(sc.w.hero.maxHp);
        }
      }
    }
  });

  it('lets a friendly guard wave her through, free', () => {
    const sc = inChop({ want: (l) => l.chop!.door === 'guard' });
    junk(sc);
    expect(sc.offers()).not.toContain('chopin:vouch');
    doorman(viewAt(sc.w)!)!.affinity = 30;
    const cash = sc.w.hero.cash;
    sc.do('chopin:vouch', always());
    expect(hasPass(sc.w, shopOf(sc))).toBe(true);
    expect(sc.w.hero.cash).toBe(cash);
  });

  it('opens the door for good if she puts the guard down', () => {
    const sc = inChop({ want: (l) => l.chop!.door === 'guard' });
    junk(sc);
    const g = doorman(viewAt(sc.w)!)!;
    sc.run((c) => kill(c, sc.w, g, 'test'));
    expect(g.alive).toBe(false);
    expect(guarded(sc.w, viewAt(sc.w)!)).toBe(false);
    expect(chopBench(sc.w, shopOf(sc))).toBeTruthy();
    expect(sc.offers()).not.toContain('chopin:pay');
    expect(sc.offers().some((k) => k.startsWith('bench:'))).toBe(true);
  });

  it('starts a fight with the guard when she goes for it', () => {
    const sc = inChop({ want: (l) => l.chop!.door === 'guard' });
    const evs = sc.do('chopin:flatline', always());
    expect(evs.some((e) => e.type === 'fight_start')).toBe(true);
  });

  it('shuts the shop if the mechanic is put down', () => {
    const sc = inChop();
    const shop = shopOf(sc);
    const boss = everyoneAt(sc.w, shop.id).find((n) => n.tags.includes('owner'));
    expect(boss).toBeTruthy();
    if (!boss) return;
    sc.run((c) => {
      kill(c, sc.w, boss, 'test');
      afterTakedown(c, [boss]);
    });
    expect(isShut(sc.w, shop.id) || !!shop.sealed).toBe(true);
  });
});

describe('the bench', () => {
  const inside = (opts: Parameters<typeof inChop>[0] = {}) => {
    const sc = inChop(opts);
    const v = viewAt(sc.w)!;
    sc.w.counters[`chopin:${v.main.id}`] = Math.floor(sc.w.clock / 1440);
    expect(chopBench(sc.w, v.main), 'bench open').toBeTruthy();
    return sc;
  };

  it('takes an item apart into parts: the item is gone, and she has components to show for it', () => {
    const sc = inside();
    sc.w.hero.inventory = [makeItem('data_slate')];
    sc.w.hero.parts = {};
    const bill = salvageBill(makeItem('data_slate'));
    const evs = sc.do('bench:salvage:data_slate', always());
    expect(sc.w.hero.inventory.length).toBe(0);
    for (const p of Object.keys(bill)) expect(sc.w.hero.parts![p]).toBeGreaterThan(0);
    const text = render(evs.find((e) => e.type === 'chop')!, rctx(sc)).map((l) => l.text).join(' ');
    expect(text).not.toMatch(/\{|\}|undefined/);
    expect(text).toMatch(/circuit/);
  });

  it('a bad pull gets back less, but never nothing', () => {
    const sc = inside();
    sc.w.hero.inventory = [makeItem('gauss_smg')];
    sc.w.hero.parts = {};
    sc.do('bench:salvage:gauss_smg', never());
    const total = Object.values(sc.w.hero.parts!).reduce((s, n) => s + n, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(Object.values(salvageBill(makeItem('gauss_smg'))).reduce((s, n) => s + n, 0));
  });

  it('turns parts into a box of rounds for a gun she carries', () => {
    const sc = inside();
    const h = sc.w.hero;
    h.weapon = makeItem('service_pistol');
    h.ammo = {};
    h.parts = { scrap: 5, chem: 3 };
    sc.do('bench:ammo:slugs', always());
    expect(h.ammo.slugs).toBe(boxRounds('slugs', h));
    expect(h.ammo.slugs).toBeGreaterThanOrEqual(AMMO.slugs!.box);
    expect(h.parts).toEqual({ scrap: 3, chem: 2 });
    // ...and not for a gun she does not have.
    expect(sc.offers()).not.toContain('bench:ammo:rails');
  });

  it('builds something from a recipe, if the bench and her hands are up to it, and a miss costs half the parts', () => {
    const sc = inside();
    const h = sc.w.hero;
    h.skills = { tinkering: 4000 };
    h.parts = { plating: 30, scrap: 30, wiring: 10, servos: 10, cells: 10, circuits: 10, chem: 10 };
    const bench = chopBench(sc.w, shopOf(sc))!;
    const can = craftable(h, bench);
    expect(can.length).toBeGreaterThan(0);
    const r = can[0]!;
    const before = { ...h.parts };
    sc.do(`benchcraft:${r.item}`, always());
    expect([h.weapon, h.armor, ...h.inventory].some((i) => i?.id === r.item && i.tags.includes('homemade'))).toBe(true);
    for (const [p, n] of Object.entries(r.parts)) expect(h.parts[p]).toBe(before[p]! - n);
    // A miss.
    const sc2 = inside();
    const h2 = sc2.w.hero;
    h2.skills = { tinkering: 4000 };
    h2.parts = { ...before };
    sc2.do(`benchcraft:${r.item}`, never());
    expect([h2.weapon, h2.armor, ...h2.inventory].some((i) => i?.id === r.item)).toBe(false);
    for (const [p, n] of Object.entries(r.parts)) expect(h2.parts[p]).toBe(before[p]! - Math.floor(n / 2));
  });

  it('only offers recipes the bench and her skill allow', () => {
    const sc = inside({ want: (l) => l.chop!.tier <= 2 });
    const h = sc.w.hero;
    h.skills = {};
    h.parts = { plating: 30, scrap: 30, wiring: 10, servos: 10, cells: 10, circuits: 10, chem: 10 };
    const bench = chopBench(sc.w, shopOf(sc))!;
    for (const r of craftable(h, bench)) {
      expect(r.tier).toBeLessThanOrEqual(bench.tier);
      expect(r.skill).toBeLessThanOrEqual(skillLevel(h, 'tinkering'));
    }
    expect(craftable(h, bench).some((r) => r.item === 'gauss_smg')).toBe(false);
  });

  it('puts a mod into what she is holding: +1 power, the name keeps count, and it gets dearer', () => {
    const sc = inside();
    const h = sc.w.hero;
    h.weapon = makeItem('riot_shotgun');
    const p0 = h.weapon.power;
    h.parts = { scrap: 40, servos: 10, wiring: 10 };
    const evs = sc.do('bench:upgrade:weapon', always());
    expect(h.weapon.power).toBe(p0 + 1);
    expect(h.weapon.mods).toBe(1);
    expect(h.weapon.name).toMatch(/ \+1$/);
    const text = render(evs.find((e) => e.type === 'chop')!, rctx(sc)).map((l) => l.text).join(' ');
    expect(text).not.toMatch(/\{|\}|undefined/);
    const left = { ...h.parts };
    expect(left.scrap).toBe(40 - 2);
    // Capped by skill and bench: with none she gets one and no more.
    h.skills = {};
    const bench = chopBench(sc.w, shopOf(sc))!;
    expect(maxMods(h, { ...bench, tier: 3 })).toBe(1);
    expect(upgradable(h, { ...bench, tier: 3 }).some((u) => u.slot === 'weapon')).toBe(false);
  });

  it('bites back when a mod on something unstable goes wrong', () => {
    const sc = inside();
    const h = sc.w.hero;
    h.weapon = makeItem('hiccup');
    h.hp = h.maxHp;
    h.parts = { cells: 10, circuits: 10, wiring: 10 };
    sc.do('bench:upgrade:weapon', never());
    expect(h.hp).toBeLessThan(h.maxHp);
    expect(h.weapon.mods ?? 0).toBe(0);
  });

  it('trains tinkering', () => {
    const sc = inside();
    sc.w.hero.inventory = [makeItem('data_slate')];
    const before = sc.w.hero.skills.tinkering ?? 0;
    sc.do('bench:salvage:data_slate', always());
    expect(sc.w.hero.skills.tinkering ?? 0).toBeGreaterThan(before);
  });

  it('wants to be at a bench when she has work for it, and not when she has none', () => {
    const sc = inChop();
    const bench = { name: 'the bench', tier: 3, where: 'x' };
    sc.w.hero.inventory = [];
    sc.w.hero.parts = {};
    expect(benchWork(sc.w, bench)).toBe(0);
    sc.w.hero.inventory = [makeItem('data_slate')];
    expect(benchWork(sc.w, bench)).toBeGreaterThan(0);
    expect(junkOf(sc.w.hero).length).toBe(1);
    expect(canAfford(sc.w.hero.parts, { scrap: 1 })).toBe(false);
    expect(chopCandidates(sc.w).length).toBeGreaterThan(0);
  });
});

describe('the pull of a bench', () => {
  it('draws her to a chop shop when she has work for it and the means to get in, and not otherwise', () => {
    const sc = inChop();
    const shop = shopOf(sc);
    const street = sc.w.locations[shop.exits[0]!.to]!;
    relocate(sc.w, street.id);
    sc.w.hero.inventory = [];
    sc.w.hero.parts = {};
    expect(benchUrge(sc.w, shop.id).bonus).toBe(0);
    sc.w.hero.inventory = [makeItem('data_slate')];
    sc.w.hero.cash = 500;
    expect(benchUrge(sc.w, shop.id).bonus).toBeGreaterThan(0);
    sc.w.hero.cash = 0;
    expect(benchUrge(sc.w, shop.id).bonus).toBe(0);
    expect(benchUrge(sc.w, street.id).bonus).toBe(0);
  });
});

describe('a bench in a pawn shop', () => {
  it('is in the workshop, as good as the shop less one', () => {
    for (let i = 0; i < 60; i++) {
      let id: Id | undefined;
      const sc = scenario({
        seed: `pbench-${i}`,
        setup: (w) => {
          const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0)];
          let seen = 0;
          while (queue.length && seen++ < 300 && !id) {
            const l = w.locations[queue.shift()!];
            if (!l) continue;
            relocate(w, l.id);
            if (l.pawn?.rooms.includes('workshop')) {
              expand(w, l);
              id = l.exits.map((e) => w.locations[e.to]).find((r) => r?.pawnRoom?.room === 'workshop')?.id;
              break;
            }
            for (const e of l.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
          }
          if (id) {
            relocate(w, id);
            w.hero.inventory = [makeItem('data_slate')];
          }
        },
      });
      if (!id) continue;
      expect(sc.offers().some((k) => k.startsWith('bench:salvage'))).toBe(true);
      return;
    }
    throw new Error('no pawn workshop found');
  });
});
