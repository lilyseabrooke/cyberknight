import { describe, expect, it } from 'vitest';
import { step } from './run';
import { UNIVERSE_VERSION, beginRun, endRun, newUniverse, splitWorld } from './universe';
import { MemoryStore, deserialize, makeSave, resume, serialize } from './store';
import { NODES, NODE_IDS, TREE, parseNeed, describeFx } from './content/tree';
import { DROPS } from './content/drops';
import { SKILL_IDS, SKILLS } from './content/skills';
import { IMPLANTS } from './content/implants';
import { makeItem } from './content/items';
import { BASE_CUT, applyUpgrades, buy, dropCut, growthPct, missing, perk, priceOf, settleAccount, stateOf } from './lab';
import { FLOAT, bankPull, cutAt, deposit, dropCandidates, worthDepositing } from './bank';
import { gather } from './interactions';
import { skillLevel, train } from './skills';
import { gainXp } from './combat';
import { relocate } from './combat';
import { hasTemplate, render } from './text';
import { makeHero } from './world';
import { personalityFrom } from './personality';
import { Rng } from './rng';
import type { Ctx, GameEvent, Legacy, World } from './types';

const legacy = (account = 0, upgrades: Record<string, number> = {}): Legacy => ({
  runs: 1, deaths: [], personality: personalityFrom({}), realName: 'Test Person', account, upgrades, spent: 0,
});

const ctxFor = (w: World): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  const c: Ctx = { w, rng: new Rng('lab-test'), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) };
  return { c, events };
};

const own = (...ids: string[]): Record<string, number> => Object.fromEntries(ids.map((id) => [id, NODES[id]!.max]));

describe('the tree', () => {
  it('is big, and every need points at a real node', () => {
    expect(NODE_IDS.length).toBeGreaterThan(200);
    for (const id of NODE_IDS) {
      expect(NODES[id]!.id).toBe(id);
      for (const n of NODES[id]!.needs) {
        const { id: need, rank } = parseNeed(n);
        expect(NODES[need], `${id} needs ${n}`).toBeDefined();
        expect(rank).toBeLessThanOrEqual(NODES[need]!.max);
      }
    }
  });

  it('can be bought out entirely: nothing is behind a circular need', () => {
    const got: Record<string, number> = {};
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const id of NODE_IDS) {
        if (got[id]) continue;
        if (NODES[id]!.needs.every((n) => (got[parseNeed(n).id] ?? 0) >= parseNeed(n).rank)) {
          got[id] = NODES[id]!.max;
          progressed = true;
        }
      }
    }
    expect(NODE_IDS.filter((id) => !got[id])).toEqual([]);
  });

  it('puts every node in exactly one line, and every line in a branch', () => {
    const seen = new Set<string>();
    for (const b of TREE) for (const l of b.lines) for (const id of l.nodes) {
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
      expect(NODES[id]!.branch).toBe(b.id);
      expect(NODES[id]!.line).toBe(l.id);
    }
    expect([...seen].sort()).toEqual([...NODE_IDS].sort());
  });

  it('gives every skill in the game a way to grow it faster', () => {
    for (const s of SKILL_IDS) {
      const l = { upgrades: own(`${s}.1`) };
      expect(growthPct(l, s), s).toBeGreaterThan(0);
      expect(NODES[`${s}.4`], s).toBeDefined();
    }
  });

  it('only refers to things that exist', () => {
    for (const id of NODE_IDS) for (const fx of NODES[id]!.fx) {
      if ('item' in fx) expect(() => makeItem(fx.item), id).not.toThrow();
      if ('weapon' in fx) expect(makeItem(fx.weapon).kind, id).toBe('weapon');
      if ('armor' in fx) expect(makeItem(fx.armor).kind, id).toBe('armor');
      if ('implant' in fx) expect(IMPLANTS[fx.implant], id).toBeDefined();
      if ('skill' in fx) expect(SKILLS[fx.skill], id).toBeDefined();
      expect(describeFx(fx, (i) => makeItem(i).name, (i) => IMPLANTS[i]!.name).length, id).toBeGreaterThan(3);
    }
  });

  it('prices niche skills below the ones that decide fights', () => {
    expect(NODES['beatbox.1']!.cost).toBeLessThan(NODES['melee.1']!.cost);
    expect(NODES['reflex.1']!.fx).toEqual([{ stat: 'reflex', n: 1 }]);
  });

  it('keeps every drop point on a real, hand-built place', () => {
    const u = newUniverse('drops');
    for (const [kind, d] of Object.entries(DROPS)) {
      expect(u.locations[d.at], kind).toBeDefined();
      expect(u.features[kind]?.locationId, kind).toBe(d.at);
    }
    expect(Object.keys(DROPS).length).toBeGreaterThanOrEqual(6);
  });
});

describe('buying', () => {
  it('takes the price out of the account, one rank at a time, dearer each time', () => {
    const l = legacy(1000);
    const first = priceOf(l, 'frame.1')!;
    expect(buy(l, 'frame.1')).toEqual({ ok: true, paid: first, rank: 1 });
    expect(l.account).toBe(1000 - first);
    expect(l.spent).toBe(first);
    expect(priceOf(l, 'frame.1')!).toBeGreaterThan(first);
    expect(l.upgrades['frame.1']).toBe(1);
  });

  it('turns down what she cannot afford, what is locked, and what is done', () => {
    const l = legacy(10);
    expect(buy(l, 'frame.1')).toMatchObject({ ok: false, reason: 'poor' });
    expect(l.account).toBe(10);
    l.account = 100000;
    expect(buy(l, 'frame.2')).toMatchObject({ ok: false, reason: 'locked' });
    expect(stateOf(l, 'frame.2')).toBe('locked');
    expect(missing(l, 'frame.2')).toEqual(['frame.1']);
    for (let i = 0; i < NODES['frame.1']!.max; i++) expect(buy(l, 'frame.1').ok).toBe(true);
    expect(buy(l, 'frame.1')).toMatchObject({ ok: false, reason: 'maxed' });
    expect(stateOf(l, 'frame.1')).toBe('maxed');
    expect(stateOf(l, 'frame.2')).toBe('available');
    expect(buy(l, 'nope')).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('wants ranks, not just the node, where the tree says so', () => {
    const l = legacy(1e6, { 'beatbox.2': 1 });
    l.upgrades['beatbox.1'] = 1;
    expect(missing(l, 'beatbox.3')).toEqual(['beatbox.1:2']);
    l.upgrades['beatbox.1'] = 2;
    expect(missing(l, 'beatbox.3')).toEqual([]);
  });

  it('gets cheaper with bench discounts, but never free', () => {
    const l = legacy(0);
    const full = priceOf(l, 'frame.1')!;
    l.upgrades['bench.1'] = 5;
    expect(priceOf(l, 'frame.1')!).toBeLessThan(full);
    l.upgrades = own('bench.1', 'bench.2', 'bench.3');
    expect(priceOf(l, 'frame.1')!).toBeGreaterThanOrEqual(Math.round(full * 0.5));
  });
});

describe('the body that walks out', () => {
  const fresh = () => makeHero(personalityFrom({}), 'Test Person', 0.1);

  it('with nothing bought, is the same body as ever', () => {
    const a = fresh();
    applyUpgrades(a, legacy());
    expect(a).toEqual(fresh());
  });

  it('is tougher, faster and richer for what was bought', () => {
    const h = fresh();
    applyUpgrades(h, legacy(0, { 'frame.1': 3, 'reflex.1': 2, 'purse.1': 2, 'mind.1': 2 }));
    expect(h.maxHp).toBe(90 + 30);
    expect(h.hp).toBe(h.maxHp);
    expect(h.reflex).toBe(3 + 2);
    expect(h.cash).toBe(60 + 40);
    expect(h.competence).toBeCloseTo(0.1 + 0.06);
  });

  it('can start her a few levels up, with the hit points and stats that come with them', () => {
    const h = fresh();
    applyUpgrades(h, legacy(0, { 'rebuild.1': 2 }));
    expect(h.level).toBe(3);
    expect(h.maxHp).toBe(90 + 24);
    expect(h.muscle + h.reflex + h.hack + h.charm).toBe(3 + 3 + 2 + 3 + 2);
  });

  it('starts with the skills, kit, weapon and armor it paid for, and never a worse one than she had', () => {
    const h = fresh();
    applyUpgrades(h, legacy(0, { 'melee.2': 2, 'blade.1': 1, 'blade.2': 1, 'guns.1': 1, 'plating.1': 1, 'plating.2': 1, 'pack.1': 2 }));
    expect(skillLevel(h, 'melee')).toBe(2);
    expect(h.weapon.id).toBe('judgment');
    expect(h.armor?.id).toBe('kevlar_duster');
    expect(h.inventory.filter((i) => i.id === 'patch_kit')).toHaveLength(2 + 2);
    expect(h.ammo.slugs).toBe(24);
    const g = fresh();
    applyUpgrades(g, legacy(0, { 'blade.1': 1 }));
    expect(g.weapon.id).toBe('cleaver');
  });

  it('fits chrome, up to the number a body can take, and applies its stats', () => {
    const h = fresh();
    applyUpgrades(h, legacy(0, own('grafts.1', 'grafts.2', 'grafts.3', 'grafts.4', 'grafts.5', 'grafts.6')));
    expect(h.implants).toHaveLength(4);
    expect(h.hack).toBe(2 + IMPLANTS.third_thumb!.stats!.hack!);
  });

  it('can tone a flaw down, in a copy, and leave the backup alone', () => {
    const original = personalityFrom({ temper: 0.9 });
    const h = fresh();
    h.personality = original;
    applyUpgrades(h, legacy(0, { 'temper.1': 4 }));
    expect(h.personality.traits.temper).toBeCloseTo(0.7);
    expect(original.traits.temper).toBe(0.9);
    expect(h.personality.weights.bravery).toBeLessThan(original.weights.bravery);
  });

  it('never takes a flaw all the way to nothing', () => {
    const h = fresh();
    h.personality = personalityFrom({ drink: 0.1 });
    applyUpgrades(h, legacy(0, { 'temper.4': 4 }));
    expect(h.personality.traits.drink).toBeGreaterThanOrEqual(0.05);
  });

  it('is deterministic', () => {
    const l = legacy(0, { 'frame.1': 2, 'beatbox.2': 1, 'temper.2': 3 });
    const a = fresh();
    const b = fresh();
    applyUpgrades(a, l);
    applyUpgrades(b, l);
    expect(a).toEqual(b);
  });
});

describe('perks and growth during a night', () => {
  it('makes a skill grow faster, but only the skill it was bought for', () => {
    const base = beginRun(newUniverse('growth'), { seed: 'g' });
    base.hero.skills = {};
    train(ctxFor(base).c, 'beatbox', 10);
    const plain = base.hero.skills.beatbox!;

    const u = newUniverse('growth');
    u.legacy.upgrades = { 'beatbox.1': 3 };
    const w = beginRun(u, { seed: 'g' });
    w.hero.skills = {};
    train(ctxFor(w).c, 'beatbox', 10);
    expect(w.hero.skills.beatbox!).toBeCloseTo(plain * 1.75);
    train(ctxFor(w).c, 'pool', 10);
    expect(w.hero.skills.pool!).toBe(10);
  });

  it('counts a group-wide or blanket upgrade for every skill in it', () => {
    const l = legacy(0, { 'ear.1': 2, 'learning.2': 1 });
    expect(growthPct(l, 'guitar')).toBe(30 + 8);
    expect(growthPct(l, 'melee')).toBe(8);
  });

  it('gives more XP and more healing, when asked to', () => {
    const u = newUniverse('xp');
    u.legacy.upgrades = { 'learning.1': 5 };
    const w = beginRun(u, { seed: 'x' });
    const before = w.hero.xp;
    gainXp(ctxFor(w).c, 10);
    expect(w.hero.xp - before).toBe(14);
    expect(perk(w.legacy, 'xp')).toBe(40);
  });
});

describe('drop points', () => {
  const nightAt = (loc: string, cash: number, upgrades: Record<string, number> = {}) => {
    const u = newUniverse('drop');
    u.legacy.upgrades = upgrades;
    const w = beginRun(u, { seed: 'night' });
    relocate(w, loc);
    w.hero.cash = cash;
    return w;
  };

  it('offers a deposit at a drop point, but only to somebody with a pile', () => {
    const poor = nightAt('street_main', 40);
    expect(gather(poor).some((c) => c.key === 'drop_street')).toBe(false);
    const rich = nightAt('street_main', 400);
    expect(gather(rich).some((c) => c.key === 'drop_street')).toBe(true);
    expect(dropCandidates(nightAt('halo_floor', 400))).toEqual([]);
  });

  it('takes the cut and keeps a float for drinks', () => {
    const w = nightAt('halo_alley', 220);
    const { c, events } = ctxFor(w);
    deposit(c, w.features.drop_alley!);
    const cut = Math.ceil((200 * BASE_CUT) / 100);
    expect(w.hero.cash).toBe(FLOAT);
    expect(w.legacy.account).toBe(200 - cut);
    expect(w.stats.deposited).toBe(200 - cut);
    expect(w.stats.fees).toBe(cut);
    expect(events[0]).toMatchObject({ type: 'deposit', outcome: 'good', data: { variant: 'alley', net: 200 - cut } });
    expect(hasTemplate(events[0]!)).toBe(true);
  });

  it('is cheaper with fee upgrades, and different from one place to the next', () => {
    const w = nightAt('street_main', 100, own('fees.1', 'fees.2'));
    expect(dropCut(w.legacy)).toBe(BASE_CUT - 3 * 3 - 2 * 4);
    expect(cutAt(w, 'drop_street')).toBeLessThan(cutAt(w, 'drop_club'));
    const free = nightAt('street_main', 100, own('fees.1', 'fees.2', 'fees.3', 'fees.4'));
    expect(dropCut(free.legacy)).toBe(0);
  });

  it('pulls her toward the next room that has one', () => {
    const w = nightAt('halo_floor', 300);
    const pulls = w.locations.halo_floor!.exits.map((e) => [e.to, bankPull(w, e.to).bonus] as const);
    expect(pulls.find(([to]) => to === 'street_main')![1]).toBeGreaterThan(0);
    expect(pulls.find(([to]) => to === 'halo_kitchen')![1]).toBeGreaterThan(0);
    expect(pulls.find(([to]) => to === 'halo_arcade')![1]).toBe(0);
    const broke = nightAt('halo_floor', 30);
    expect(bankPull(broke, 'street_main').bonus).toBe(0);
  });

  it('is wanted more by a hero who has the bank habit', () => {
    const plain = nightAt('street_main', 120);
    const keen = nightAt('street_main', 120, own('habit.1', 'habit.2'));
    const bonus = (w: World) => dropCandidates(w).find((c) => c.key === 'drop_street')!.bonus!;
    expect(bonus(keen)).toBeGreaterThan(bonus(plain));
    expect(worthDepositing(keen)).toBeGreaterThanOrEqual(worthDepositing(plain));
  });
});

describe('the books at the end of a night', () => {
  it('lets a survivor take everything home', () => {
    const w = beginRun(newUniverse('home'), { seed: 'h' });
    w.hero.cash = 500;
    w.over = true;
    w.ending = 'dawn';
    const r = settleAccount(w);
    expect(r).toMatchObject({ ending: 'dawn', carried: 500, recovered: 500, interest: 0 });
    expect(w.legacy.account).toBe(500);
  });

  it('lets a corpse keep only what she insured, and what she banked is safe', () => {
    const u = newUniverse('dead');
    u.legacy.upgrades = own('estate.1');
    u.legacy.account = 100;
    const w = beginRun(u, { seed: 'd' });
    w.hero.cash = 400;
    w.over = true;
    w.ending = 'dead';
    const r = settleAccount(w);
    expect(r.recovered).toBe(120);
    expect(w.legacy.account).toBe(220);
    expect(r.before).toBe(100);
    expect(r.after).toBe(220);
  });

  it('leaves nothing for a corpse with no insurance, and pays interest on the balance', () => {
    const u = newUniverse('broke');
    u.legacy.upgrades = own('interest.1');
    u.legacy.account = 1000;
    const w = beginRun(u, { seed: 'b' });
    w.hero.cash = 300;
    w.over = true;
    w.ending = 'dead';
    const r = settleAccount(w);
    expect(r.recovered).toBe(0);
    expect(r.interest).toBe(Math.floor(1000 * 0.1));
    expect(w.legacy.account).toBe(1100);
  });

  it('caps interest, so a fat account is not a printing press', () => {
    const u = newUniverse('fat');
    u.legacy.upgrades = own('interest.1', 'interest.2', 'interest.3');
    u.legacy.account = 1_000_000;
    const w = beginRun(u, { seed: 'f' });
    w.over = true;
    w.ending = 'dead';
    expect(settleAccount(w).interest).toBe(500);
  });

  it('settles once', () => {
    const w = beginRun(newUniverse('once'), { seed: 'o' });
    w.hero.cash = 70;
    w.over = true;
    w.ending = 'dawn';
    settleAccount(w);
    settleAccount(w);
    endRun(w);
    expect(w.legacy.account).toBe(70);
  });
});

describe('the lab loop', () => {
  it('runs: she dies, the money she banked is spent, and the next body has it', () => {
    let u = newUniverse('loop');
    const w1 = beginRun(u, { seed: 'one' });
    w1.hero.cash = 300;
    const { c } = ctxFor(w1);
    relocate(w1, 'street_main');
    deposit(c, w1.features.drop_street!);
    const banked = w1.legacy.account;
    expect(banked).toBeGreaterThan(150);
    w1.hero.cash = 500;
    w1.hero.hp = 0;
    w1.over = true;
    w1.ending = 'dead';
    u = endRun(w1);
    expect(u.legacy.account).toBe(banked); // the five hundred in her pockets died with her
    expect(u.legacy.report).toMatchObject({ ending: 'dead', carried: 500, recovered: 0, deposited: banked });

    expect(buy(u.legacy, 'reflex.1').ok).toBe(true);
    expect(buy(u.legacy, 'frame.1').ok).toBe(true);
    const w2 = beginRun(u, { seed: 'two' });
    expect(w2.hero.reflex).toBe(4);
    expect(w2.hero.maxHp).toBe(100);
    expect(w2.legacy.runs).toBe(2);
    expect(w2.legacy.upgrades['reflex.1']).toBe(1);
  });

  it('survives a real night, a real death and a real return', () => {
    let u = newUniverse('real');
    for (let night = 0; night < 3; night++) {
      const w = beginRun(u, { seed: `n${night}`, competence: 0.4 });
      let guard = 0;
      while (!w.over && guard++ < 700) step(w);
      u = endRun(w);
      expect(u.legacy.report?.run).toBe(night + 1);
      expect(u.legacy.account).toBeGreaterThanOrEqual(u.legacy.report!.before);
      // spend whatever the cheapest useful thing is
      let bought = true;
      while (bought) bought = ['frame.1', 'reflex.1', 'mind.1', 'purse.1'].some((id) => buy(u.legacy, id).ok);
    }
    expect(Object.keys(u.legacy.upgrades).length).toBeGreaterThan(0);
  });

  it('is remembered: the account and the tree survive a save', async () => {
    const u = newUniverse('save');
    u.legacy.account = 321;
    u.legacy.upgrades = { 'frame.1': 2 };
    const store = new MemoryStore();
    await store.save(makeSave(u, null, 5));
    const back = resume((await store.load())!, 5);
    expect(back.universe.legacy.account).toBe(321);
    expect(back.universe.legacy.upgrades).toEqual({ 'frame.1': 2 });
    expect(back.world).toBeNull();
  });

  it('reads a save from before the lab, and gives it a bank', () => {
    const u = newUniverse('old');
    const { account: _a, upgrades: _u, spent: _s, ...old } = u.legacy;
    const feats = { ...u.features };
    for (const k of Object.keys(DROPS)) delete feats[k];
    const text = JSON.stringify({ universe: { ...u, version: 1, legacy: old, features: feats }, run: null, savedAt: 9 });
    const save = deserialize(text);
    expect(save.universe.version).toBe(UNIVERSE_VERSION);
    expect(save.universe.legacy).toMatchObject({ account: 0, upgrades: {}, spent: 0 });
    expect(Object.keys(save.universe.features)).toEqual(expect.arrayContaining(Object.keys(DROPS)));
    const w = beginRun(save.universe, { seed: 'x' });
    expect(w.hero.maxHp).toBe(90);
  });

  it('has universe and run halves that still add up', () => {
    const w = beginRun(newUniverse('halves'), { seed: 'h' });
    const { universe } = splitWorld(w);
    expect(universe.legacy.account).toBe(0);
    expect(w.stats).toMatchObject({ deposited: 0, fees: 0 });
  });
});

describe('words', () => {
  it('has something to say at every drop point', () => {
    for (const kind of Object.keys(DROPS)) {
      const ev: GameEvent = { beat: 3, type: 'deposit', outcome: 'good', data: { variant: kind.replace('drop_', ''), amount: 200, fee: 50, net: 150, pct: 25, balance: 150, left: 20 } };
      expect(hasTemplate(ev), kind).toBe(true);
      const lines = render(ev, { rng: new Rng(kind), personality: personalityFrom({}), realName: 'Test Person' });
      expect(lines[0]!.text, kind).toMatch(/150/);
    }
  });
});
