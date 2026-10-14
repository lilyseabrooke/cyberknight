import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { CLASSES, VS_TAGS, armBest, describe as describeW, edge, foeArmor, fxOf, genShelf, genWeapon, niches, rating, valueOf, variantOf, vsMult } from './weapons';
import { makeItem } from './content/items';
import { spawnNpc } from './content/archetypes';
import { fight, acquire } from './combat';
import { wielded } from './arms';
import { buyGear, restockShelf } from './supply';
import { shopStock } from './plans';
import type { Item, Npc } from './types';

const world = (seed: string, competence = 0.9): World => createWorld({ seed, competence, personality: personalityFrom({}) });
const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const foe = (id: string, archetype = 'mugger', extra: Partial<Npc> = {}): Npc => Object.assign(spawnNpc(new Rng(id), id, archetype, 'street_main', {}), extra);
const plain = (power: number, fx: Partial<Item['fx']> = {}): Item => ({
  id: `t_${power}`, name: 'test blade', kind: 'weapon', power, value: 0, tags: ['melee'],
  fx: { cls: 'blade', tier: 3, crit: 0, critMult: 2, pierce: 0, noise: 0.3, armor: 0, vs: {}, stun: 0, burn: 0, weight: 1, ...fx },
});

describe('making weapons', () => {
  it('are deterministic from the seed and plain JSON', () => {
    const a = genWeapon(new Rng('x'), { tier: 4 });
    const b = genWeapon(new Rng('x'), { tier: 4 });
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('land near their tier, cost more the better they are, and are never all the same', () => {
    const rng = new Rng('tiers');
    const mean = (tier: number) => {
      const rs = Array.from({ length: 150 }, () => rating(genWeapon(rng, { tier })));
      return rs.reduce((a, b) => a + b, 0) / rs.length;
    };
    const m1 = mean(1);
    const m4 = mean(4);
    const m7 = mean(7);
    expect(m4).toBeGreaterThan(m1 * 1.8);
    expect(m7).toBeGreaterThan(m4 * 1.3);
    expect(Math.abs(m4 - (3 + 2.6 * 4))).toBeLessThan(2.5);
    expect(valueOf(m7)).toBeGreaterThan(valueOf(m4) * 2);
    const names = new Set(Array.from({ length: 60 }, () => genWeapon(rng, { tier: 3 }).name));
    expect(names.size).toBeGreaterThan(30);
  });

  it('spend their traits out of their base damage', () => {
    const rng = new Rng('trade');
    const avgPower = (traits: number) => {
      const ps = Array.from({ length: 200 }, () => genWeapon(rng, { tier: 5, cls: 'blade', traits }).power);
      return ps.reduce((a, b) => a + b, 0) / ps.length;
    };
    expect(avgPower(0)).toBeGreaterThan(avgPower(3) * 1.1);
  });

  it('guns carry ammo types, melee weapons do not, and every class can be made', () => {
    const rng = new Rng('cls');
    for (const id of Object.keys(CLASSES)) {
      const it = genWeapon(rng, { tier: 3, cls: id });
      expect(it.kind).toBe('weapon');
      expect(!!it.ammoType).toBe(!CLASSES[id]!.melee);
      expect(it.tags).toContain(CLASSES[id]!.melee ? 'melee' : 'gun');
    }
  });

  it('a weapon built against a kind of enemy is better against it', () => {
    const rng = new Rng('vs');
    const it = genWeapon(rng, { tier: 4, focus: 'vs', vs: 'robot' });
    expect(Object.keys(it.fx!.vs)).toContain('robot');
    expect(vsMult(it.fx!, foe('r', 'drone'))).toBeGreaterThan(1.2);
    expect(vsMult(it.fx!, foe('p', 'mugger'))).toBe(1);
    expect(rating(it, foe('r2', 'drone'))).toBeGreaterThan(rating(it, foe('p2', 'mugger')));
    expect(it.name).toContain(VS_TAGS.robot);
  });

  it('named classics still work with plain defaults', () => {
    const cleaver = makeItem('cleaver');
    expect(fxOf(cleaver).crit).toBeGreaterThan(0);
    expect(rating(cleaver)).toBeGreaterThan(cleaver.power);
    expect(describeW(cleaver)).toContain('dmg');
  });

  it('people carry procedural weapons, most of the time', () => {
    const procedural = Array.from({ length: 60 }, (_, i) => spawnNpc(new Rng(`npc${i}`), `n${i}`, 'ganger', 'street_main', {}).loadout.find((x) => x.kind === 'weapon')!).filter((x) => x.id.startsWith('wp_'));
    expect(procedural.length).toBeGreaterThan(25);
    expect(variantOf(new Rng('h'), makeItem('hiccup')).id).toBe('hiccup');
  });
});

describe('the shelf', () => {
  it('always has something better in some regard than whatever she is holding', () => {
    const rng = new Rng('shelf');
    for (let i = 0; i < 150; i++) {
      const cur = genWeapon(rng, { tier: rng.next() * 7 });
      const pick = niches(rng, cur, 2);
      const better = pick.some((it) => rating(it) > rating(cur) + 0.3);
      const different = pick.some((it) => {
        const a = fxOf(it);
        const b = fxOf(cur);
        return a.stun > b.stun || a.burn > b.burn || a.pierce > b.pierce || a.noise < b.noise - 0.1 || a.armor > b.armor || Object.keys(a.vs).some((k) => !b.vs[k]) || a.crit > b.crit + 0.05;
      });
      expect(better || different, cur.name).toBe(true);
      expect(better, `step up on ${cur.name}`).toBe(true);
    }
  });

  it('the shop sells it, with a price, and she can buy it; restocks turn the stock over', () => {
    const w = world('shop');
    const shelfIds = Object.keys(w.arsenal!);
    expect(shelfIds.length).toBeGreaterThan(6);
    w.hero.locationId = 'gun_shop';
    const wares = shopStock(w).filter((x) => x.kind === 'weapon');
    expect(wares.length).toBe(shelfIds.length);
    expect(wares.every((x) => x.price > 0 && x.item)).toBe(true);
    const { c, events } = ctxOf(w, 'buy');
    const ware = [...wares].sort((a, b) => b.power - a.power)[0]!;
    w.hero.cash = 99999;
    buyGear(c, w.npcs.gunsmith!, ware.id, ware.price);
    expect(w.arsenal![ware.id]).toBeUndefined();
    expect(w.flags[`sold:${ware.id}`]).toBe(true);
    expect(events.some((e) => e.type === 'buy_gear')).toBe(true);
    expect(w.hero.weapon.id === ware.id || w.hero.inventory.some((i) => i.id === ware.id)).toBe(true);
    const before = new Set(Object.keys(w.arsenal!));
    restockShelf(c);
    const after = Object.keys(w.arsenal!);
    expect(after.some((id) => !before.has(id))).toBe(true);
    expect([...before].some((id) => !w.arsenal![id])).toBe(true);
  });
});

describe('using them', () => {
  const duel = (weapon: Item, target: Npc, seed: string, hp = 400) => {
    const w = world(seed);
    w.hero.weapon = weapon;
    w.hero.hp = w.hero.maxHp = hp;
    w.hero.locationId = 'halo_alley';
    w.hero.ammo = { slugs: 99, shells: 99, rails: 99, gauss: 99, cells: 99 };
    target.locationId = 'halo_alley';
    w.npcs[target.id] = target;
    const r = ctxOf(w, seed);
    fight(r.c, [target], { cause: 'test', joiners: false });
    return { w, ...r };
  };
  const rounds = (events: GameEvent[]) => Number(events.find((e) => e.type === 'fight_end')!.data.rounds);

  it('crits end fights sooner', () => {
    let plainR = 0;
    let critR = 0;
    for (let i = 0; i < 40; i++) {
      plainR += rounds(duel(plain(8), foe(`a${i}`, 'ganger', { hp: 120, maxHp: 120 }), `c${i}`).events);
      critR += rounds(duel(plain(8, { crit: 0.5, critMult: 3 }), foe(`b${i}`, 'ganger', { hp: 120, maxHp: 120 }), `c${i}`).events);
    }
    expect(critR).toBeLessThan(plainR * 0.85);
  });

  it('armor-piercing beats plating; a vs-bonus beats the right enemy; fire and stun help', () => {
    const armored = () => foe('tank', 'ganger', { hp: 90, maxHp: 90, loadout: [makeItem('riot_vest')], power: 14 });
    expect(foeArmor(armored())).toBeGreaterThan(3);
    const avg = (wp: Item, mk: () => Npc) => {
      let r = 0;
      for (let i = 0; i < 40; i++) r += rounds(duel(wp, mk(), `d${i}`).events);
      return r / 40;
    };
    const base = avg(plain(8), armored);
    expect(avg(plain(8, { pierce: 5 }), armored)).toBeLessThan(base);
    expect(avg(plain(8, { vs: { ganger: 1.8 } }), armored)).toBeLessThan(base);
    expect(avg(plain(8, { burn: 0.6 }), armored)).toBeLessThan(base);
    // Stunned foes lose their turns, so she takes less.
    const taken = (wp: Item) => {
      let t = 0;
      for (let i = 0; i < 40; i++) t += Number(duel(wp, armored(), `e${i}`).events.find((e) => e.type === 'fight_end')!.data.taken);
      return t;
    };
    expect(taken(plain(8, { stun: 0.6 }))).toBeLessThan(taken(plain(8)));
    expect(taken(plain(8, { armor: 4 }))).toBeLessThan(taken(plain(8)));
  });

  it('says so when something procs', () => {
    const { events } = duel(plain(8, { crit: 1, critMult: 2, stun: 1, burn: 1 }), foe('p', 'ganger', { hp: 200, maxHp: 200 }), 'procs');
    const kinds = events.filter((e) => e.type === 'weapon_proc').map((e) => e.data.variant);
    expect(new Set(kinds)).toEqual(new Set(['crit', 'stun', 'burn']));
  });

  it('she picks the weapon that suits the enemy, and says so', () => {
    const w = world('swap');
    const generalist = plain(10);
    const breaker = plain(7, { vs: { robot: 2.2 } });
    w.hero.weapon = generalist;
    w.hero.inventory.push(breaker);
    expect(wielded(w.hero, [foe('h', 'ganger')])).toBe(generalist);
    expect(wielded(w.hero, [foe('d', 'drone')])).toBe(breaker);
    const { events } = duel(generalist, foe('d2', 'drone'), 'swap2');
    void events;
    const w2 = world('swap3');
    w2.hero.weapon = generalist;
    w2.hero.inventory.push(breaker);
    w2.hero.locationId = 'halo_alley';
    const drone = foe('dd', 'drone', { locationId: 'halo_alley' });
    w2.npcs.dd = drone;
    const r = ctxOf(w2, 'swap4');
    fight(r.c, [drone], { cause: 'test', joiners: false });
    expect(r.events.some((e) => e.type === 'weapon_swap')).toBe(true);
  });

  it('a better weapon is equipped; a situational one stays in the pack', () => {
    const w = world('equip');
    const { c } = ctxOf(w, 'eq');
    const old = w.hero.weapon;
    acquire(c, plain(14));
    expect(w.hero.weapon.power).toBe(14);
    expect(w.hero.inventory).toContain(old);
    const sidegrade = plain(8, { vs: { robot: 2.6 } });
    acquire(c, sidegrade);
    expect(w.hero.weapon.power).toBe(14);
    expect(w.hero.inventory).toContain(sidegrade);
    expect(armBest(w.hero, foe('dd', 'drone'))).toBeGreaterThan(armBest(w.hero));
    expect(edge(plain(10, { crit: 0.3, critMult: 3 }))).toBeGreaterThan(1.5);
  });

  it('a silent weapon is noticed less than a loud one', () => {
    const seen = (noise: number) => {
      let n = 0;
      for (let i = 0; i < 120; i++) {
        const w = world(`noise${i}`);
        w.hero.weapon = plain(8, { noise });
        w.hero.locationId = 'halo_alley';
        for (const x of Object.values(w.npcs)) if (x.locationId === 'halo_alley') x.locationId = '_gone';
        const patrons = [foe(`a${i}`, 'patron'), foe(`b${i}`, 'patron'), foe(`c${i}`, 'patron')].map((p) => ((p.locationId = 'halo_alley'), (w.npcs[p.id] = p), p));
        const victim = foe(`v${i}`, 'mugger', { locationId: 'halo_alley' });
        w.npcs[victim.id] = victim;
        void patrons;
        const r = ctxOf(w, `n${i}`);
        fight(r.c, [victim], { cause: 'test', joiners: false, assault: true });
        if (r.events.some((e) => e.type === 'crime_seen' && e.data.variant !== 'none')) n++;
      }
      return n;
    };
    expect(seen(0.05)).toBeLessThan(seen(1));
  });
});
