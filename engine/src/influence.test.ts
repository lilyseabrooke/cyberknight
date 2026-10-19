import { describe, expect, it } from 'vitest';
import { always, never, rolls, scenario, type Scenario } from './testkit';
import { Rng } from './rng';
import { hasTemplate } from './text';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { heroPower } from './combat';
import { reactionWeights } from './witness';
import { covering, influenceOdds, influenceTick, wishes, type Wish } from './influence';
import type { Goal, GoalKind, Npc } from './types';

const PLACE = 'halo_floor';

const goal = (s: Scenario, kind: GoalKind, extra: Partial<Goal> = {}): Goal => {
  const g: Goal = {
    id: s.w.mind.nextId++, kind, parent: null, why: 'test', desire: 0.8, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0, ...extra,
  };
  s.w.mind.goals.push(g);
  return g;
};

const person = (s: Scenario, id: string, extra: Partial<Npc> = {}, traits: NonNullable<Npc['character']>['traits'] = {}): Npc => {
  const n = Object.assign(spawnNpc(new Rng(id), id, 'patron', PLACE, {}), { gender: 'woman' as const, age: 30, cash: 1000, ...extra });
  n.depth = 'deep';
  n.character = { traits, quirk: '' };
  n.facts = [];
  addNpc(s.w, n);
  return n;
};

/** Her and one other person in an otherwise empty room. */
const room = (traits: NonNullable<Npc['character']>['traits'] = {}, extra: Partial<Npc> = {}) => {
  const s = scenario({ at: PLACE });
  for (const n of Object.values(s.w.npcs)) if (n.locationId === PLACE) moveNpc(s.w, n, '_gone');
  const n = person(s, 'mark', extra, traits);
  return { s, n };
};

const ask = (kind: Wish['kind'], extra: Partial<Wish> = {}): Wish => ({ kind, urge: 0.8, magnitude: 0.4, ...extra });

describe('how likely she is to get somebody to take a goal on', () => {
  it('falls as the ask grows', () => {
    const { s, n } = room();
    const small = influenceOdds(s.w, n, ask('give_cash', { magnitude: 0.2 }), 'persuasion');
    const big = influenceOdds(s.w, n, ask('give_cash', { magnitude: 0.9 }), 'persuasion');
    expect(big).toBeLessThan(small);
  });

  it('falls when the goal goes against their character, and rises when it suits them', () => {
    const miser = room({ greed: 1, kindness: 0, loyalty: 0 });
    const saint = room({ greed: 0, kindness: 1, loyalty: 1 });
    const w = ask('give_cash');
    expect(influenceOdds(miser.s.w, miser.n, w, 'persuasion')).toBeLessThan(influenceOdds(saint.s.w, saint.n, w, 'persuasion'));
  });

  it('rises with how much they like her (a frightened person needs to like her less)', () => {
    const fond = room({}, { affinity: 60 });
    const sour = room({}, { affinity: -60 });
    const w = ask('cover');
    expect(influenceOdds(fond.s.w, fond.n, w, 'persuasion')).toBeGreaterThan(influenceOdds(sour.s.w, sour.n, w, 'persuasion'));
    const gap = (m: 'persuasion' | 'intimidation') => influenceOdds(fond.s.w, fond.n, w, m) - influenceOdds(sour.s.w, sour.n, w, m);
    expect(gap('intimidation')).toBeLessThan(gap('persuasion'));
  });

  it('rises with the skill she brings', () => {
    const { s, n } = room();
    const before = influenceOdds(s.w, n, ask('cover'), 'persuasion');
    s.w.hero.skills.persuasion = 400;
    expect(influenceOdds(s.w, n, ask('cover'), 'persuasion')).toBeGreaterThan(before);
  });

  it('pushes the nervous round further by threat than the brave', () => {
    const jumpy = room({ courage: 0 });
    const bold = room({ courage: 1 });
    const w = ask('cover');
    expect(influenceOdds(jumpy.s.w, jumpy.n, w, 'intimidation')).toBeGreaterThan(influenceOdds(bold.s.w, bold.n, w, 'intimidation'));
  });
});

describe('what she wants from people', () => {
  it('wants nothing when she has no reason to', () => {
    const { s, n } = room();
    s.w.hero.cash = 500;
    expect(wishes(s.w, n)).toEqual([]);
    expect(s.offers().some((k) => k.startsWith('influence:'))).toBe(false);
  });

  it('wants money from somebody with some, when she is saving for something', () => {
    const { s, n } = room();
    goal(s, 'cash', { amount: 600 });
    s.w.hero.cash = 100;
    const ws = wishes(s.w, n);
    expect(ws.map((x) => x.kind)).toContain('give_cash');
    expect(ws.find((x) => x.kind === 'give_cash')!.amount).toBeGreaterThan(0);
    const keys = s.offers().filter((k) => k.startsWith(`influence:${n.id}:give_cash:`));
    // Persuasion, threats, a flutter of the eyelashes, and a story.
    expect(keys.map((k) => k.split(':')[3]).sort()).toEqual(['grifting', 'intimidation', 'persuasion', 'romance']);
  });

  it('does not flirt a favour out of somebody who is not up for it', () => {
    const { s, n } = room({}, { gender: 'man' });
    goal(s, 'cash', { amount: 600 });
    s.w.hero.cash = 100;
    const methods = s.offers().filter((k) => k.startsWith(`influence:${n.id}:`)).map((k) => k.split(':')[3]);
    expect(methods).not.toContain('romance');
    expect(methods).toContain('persuasion');
  });

  it('wants someone to go after the person she wants dealt with', () => {
    const { s, n } = room();
    const target = person(s, 'target');
    moveNpc(s.w, target, '_gone');
    goal(s, 'kill', { npc: target.id, mode: 'beat_up' });
    expect(wishes(s.w, n).some((x) => x.kind === 'go_after' && x.target === target.id)).toBe(true);
  });

  it('has the same wish only once an errand is taken on, and gives up for a while after a no', () => {
    const { s, n } = room();
    goal(s, 'cash', { amount: 600 });
    s.w.hero.cash = 100;
    s.do(`influence:${n.id}:give_cash:persuasion`, never());
    expect(wishes(s.w, n).some((x) => x.kind === 'give_cash')).toBe(false);
  });
});

describe('trying it', () => {
  const setup = () => {
    const r = room();
    goal(r.s, 'cash', { amount: 600 });
    r.s.w.hero.cash = 100;
    return r;
  };

  it('persuasion that takes leaves a goal in their head, and a friendlier person', () => {
    const { s, n } = setup();
    const before = n.affinity;
    const ev = s.do(`influence:${n.id}:give_cash:persuasion`, always());
    expect(n.goals?.map((g) => g.kind)).toEqual(['give_cash']);
    expect(n.goals![0]!.method).toBe('persuasion');
    expect(n.affinity).toBeGreaterThan(before);
    expect(ev.some((e) => e.type === 'influence' && e.data.variant === 'persuasion_ok')).toBe(true);
    expect(s.w.influenced).toContain(n.id);
  });

  it('intimidation that takes leaves them afraid of her', () => {
    const { s, n } = setup();
    const before = n.affinity;
    s.do(`influence:${n.id}:give_cash:intimidation`, always());
    expect(n.goals![0]!.coerced).toBe(true);
    expect(n.affinity).toBeLessThan(before);
    expect(n.memories).toContain('was leaned on by Blackbird');
  });

  it('flirting that takes leaves them fonder', () => {
    const { s, n } = setup();
    const before = n.affinity;
    s.do(`influence:${n.id}:give_cash:romance`, always());
    expect(n.goals![0]!.method).toBe('romance');
    expect(n.affinity).toBeGreaterThan(before);
  });

  it('a story that takes is marked as a con', () => {
    const { s, n } = setup();
    s.do(`influence:${n.id}:give_cash:grifting`, always());
    expect(n.goals![0]!.conned).toBe(true);
  });

  it('a failed con is remembered', () => {
    const { s, n } = setup();
    const before = n.affinity;
    const ev = s.do(`influence:${n.id}:give_cash:grifting`, never());
    expect(n.goals).toBeUndefined();
    expect(n.affinity).toBeLessThan(before);
    expect(n.memories).toContain('caught Blackbird lying');
    expect(ev.some((e) => e.type === 'influence' && e.data.variant === 'grifting_no')).toBe(true);
  });

  it('trains the skill she used', () => {
    const { s, n } = setup();
    expect(s.w.hero.skills.persuasion ?? 0).toBe(0);
    s.do(`influence:${n.id}:give_cash:persuasion`, always());
    expect(s.w.hero.skills.persuasion).toBeGreaterThan(0);
  });

  it('does not stack the same goal twice', () => {
    const { s, n } = setup();
    s.do(`influence:${n.id}:give_cash:persuasion`, always());
    expect(s.offers().some((k) => k.startsWith(`influence:${n.id}:give_cash`))).toBe(false);
  });
});

describe('what they do once they have taken it on', () => {
  const taken = (_kind: Wish['kind'], _extra: Partial<Wish> = {}, npcExtra: Partial<Npc> = {}) => {
    const r = room({}, npcExtra);
    goal(r.s, 'cash', { amount: 600 });
    r.s.w.hero.cash = 100;
    return r;
  };

  it('gives her the money', () => {
    const { s, n } = taken('give_cash');
    s.do(`influence:${n.id}:give_cash:persuasion`, always());
    const wallet = s.w.hero.cash;
    const owed = n.goals![0]!.amount!;
    const cash = n.cash;
    s.w.beat++;
    const ev = s.run((c) => influenceTick(c));
    expect(s.w.hero.cash).toBe(wallet + owed);
    expect(n.cash).toBe(cash - owed);
    expect(n.goals).toBeUndefined();
    expect(s.w.influenced).not.toContain(n.id);
    expect(ev.some((e) => e.type === 'influence_pay')).toBe(true);
  });

  it('wears off with the night', () => {
    const { s, n } = taken('give_cash');
    // She is not there to be paid.
    s.do(`influence:${n.id}:give_cash:persuasion`, always());
    moveNpc(s.w, n, '_gone');
    s.w.beat += 100;
    s.run((c) => influenceTick(c));
    expect(n.goals).toBeUndefined();
  });

  it('stops the law being called when she does something', () => {
    const r = room({}, { tags: ['cop'] });
    goal(r.s, 'heist', { loc: 'helix' });
    r.s.w.hero.locationId = PLACE;
    const victim = person(r.s, 'victim');
    const before = reactionWeights(r.s.w, r.n, victim);
    expect(before.call_cops + before.intervene).toBeGreaterThan(0);
    r.s.do(`influence:${r.n.id}:cover:persuasion`, always());
    expect(covering(r.s.w, r.n)).toBe(true);
    const after = reactionWeights(r.s.w, r.n, victim);
    expect(after.call_cops).toBe(0);
    expect(after.intervene).toBe(0);
  });

  it('goes and deals with the person she wanted dealt with', () => {
    const { s, n } = room({}, { power: 40 });
    const target = person(s, 'target', { power: 2 });
    moveNpc(s.w, target, 'overpass');
    const kill = goal(s, 'kill', { npc: target.id, mode: 'beat_up' });
    s.do(`influence:${n.id}:go_after:persuasion`, always());
    expect(n.goals![0]!.target).toBe(target.id);
    // On their way, she's none the wiser; give the errand enough beats to get there.
    let seen: string[] = [];
    for (let i = 0; i < 40 && n.goals; i++) {
      s.w.beat++;
      seen.push(...s.run((c) => influenceTick(c), always()).map((e) => e.type));
    }
    expect(seen).toContain('errand');
    expect(n.locationId).toBe(target.locationId);
    expect(target.downUntil).toBeGreaterThan(s.w.beat);
    expect(target.hp).toBeLessThan(target.maxHp);
    // As far as she's concerned, it's been done.
    expect(kill.struck).toBe(true);
  });

  it('has her back when it comes to a fight, and adds to it', () => {
    const { s, n } = room({}, { power: 20 });
    const foe = person(s, 'foe', { power: 4 });
    goal(s, 'kill', { npc: foe.id });
    const alone = heroPower(s.w);
    s.do(`influence:${n.id}:back_me_up:persuasion`, always());
    expect(heroPower(s.w)).toBeGreaterThan(alone);
    moveNpc(s.w, n, 'overpass');
    expect(heroPower(s.w)).toBe(alone);
  });

  it('tells her what they know', () => {
    const { s, n } = room({ curiosity: 1 });
    n.facts = [{ id: 'f1', kind: 'wants_money', vis: 'secret', data: { amount: 100 } }];
    goal(s, 'cash', { amount: 600 });
    s.do(`influence:${n.id}:spill:persuasion`, always());
    s.w.beat++;
    const ev = s.run((c) => influenceTick(c));
    expect(ev.some((e) => e.type === 'learn')).toBe(true);
    expect(s.w.mind.known?.[n.id]).toContain('f1');
  });

  it('may work out that they were lied to', () => {
    const { s, n } = taken('give_cash');
    s.do(`influence:${n.id}:give_cash:grifting`, always());
    const before = n.affinity;
    s.w.beat++;
    // Rigged so the realisation always lands.
    const ev = s.run((c) => influenceTick(c), always());
    expect(n.affinity).toBeLessThan(before);
    expect(n.memories).toContain('was conned by Blackbird');
    expect(ev.some((e) => e.type === 'influence_end' && e.data.variant === 'wise')).toBe(true);
  });
});

describe('the words for it', () => {
  it('every outcome has a line', () => {
    const base = { npc: 'Pat', target: 'Sam', deed: 'looking the other way', ask: 'to look the other way', method: 'persuasion', foe: 'Sam', amount: 20 };
    const keys: [string, Record<string, string | number | boolean>][] = [];
    for (const m of ['persuasion', 'intimidation', 'romance', 'grifting']) {
      keys.push(['influence', { ...base, variant: `${m}_ok` }], ['influence', { ...base, variant: `${m}_no` }], ['influence_pay', { ...base, method: m, variant: m }], ['intent', { ...base, method: m, variant: 'influence' }]);
    }
    keys.push(['influence_depart', base], ['influence_arrive', base], ['influence_backup', base], ['influence_end', { ...base, variant: 'wise' }], ['errand_balk', base], ['errand_giveup', base]);
    for (const [type, data] of keys) expect(hasTemplate({ beat: 0, type, outcome: 'good', data }), `${type}:${data.variant}`).toBe(true);
  });
});

// ===================================================================== errands

import { vehicleOf, ALL_MAKES } from './cars';
import type { NpcGoal } from './types';

/** Give somebody an errand directly, as if she had talked them into it. */
const give = (s: Scenario, n: Npc, kind: NpcGoal['kind'], extra: Partial<NpcGoal> = {}): NpcGoal => {
  const g: NpcGoal = { id: s.w.mind.nextId++, kind, method: 'persuasion', born: s.w.beat, until: s.w.beat + 500, ...extra };
  (n.goals ??= []).push(g);
  (s.w.influenced ??= []).push(n.id);
  return g;
};
const tickOnce = (s: Scenario, rng = always()) => {
  s.w.beat++;
  return s.run((c) => influenceTick(c), rng);
};
const errands = (ev: { type: string }[]) => ev.filter((e) => e.type === 'errand') as { type: string; data: Record<string, unknown> }[];

describe('errands: what they do with it', () => {
  it('a kiss lands, and the kissed remembers', () => {
    const { s, n } = room();
    const t = person(s, 'smooched');
    give(s, n, 'kiss', { target: t.id });
    const ev = tickOnce(s);
    expect(errands(ev)[0]!.data.variant).toMatch(/^kiss_.*_ok$/);
    expect(t.memories.some((m) => m.startsWith('was kissed by'))).toBe(true);
    expect(n.goals).toBeUndefined();
  });

  it('walks to wherever the target is first', () => {
    const { s, n } = room();
    const t = person(s, 'far');
    moveNpc(s.w, t, 'halo_alley');
    give(s, n, 'kiss', { target: t.id });
    const first = tickOnce(s);
    expect(first.some((e) => e.type === 'influence_depart')).toBe(true);
    expect(n.locationId).toBe('halo_alley');
    // At the other end, they get on with it; she is not there, so only the outcome would be told.
    const second = tickOnce(s);
    expect(n.goals).toBeUndefined();
    expect(errands(second)[0]!.data.seen).toBe(false);
  });

  it('weighs its options: a failed way is followed by another try, and three failures end it', () => {
    const { s, n } = room();
    const t = person(s, 'cold');
    const g = give(s, n, 'kiss', { target: t.id });
    // First option every time, and it never works.
    const fail = () => rolls(0, 0.999999);
    tickOnce(s, fail());
    expect(g.tries).toBe(1);
    expect(n.goals).toBeDefined();
    // Not until it has had a moment.
    expect(tickOnce(s, fail()).length).toBe(0);
    s.w.beat += 5;
    tickOnce(s, fail());
    s.w.beat += 5;
    const last = tickOnce(s, fail());
    expect(last.some((e) => e.type === 'errand_giveup')).toBe(true);
    expect(n.goals).toBeUndefined();
  });

  it('may just refuse', () => {
    const { s, n } = room({ honesty: 1, mischief: 0, courage: 0 });
    const g = give(s, n, 'steal_car');
    s.w.strays = { street_main: vehicleOf(ALL_MAKES[0]!) };
    g.loc = 'street_main';
    moveNpc(s.w, n, 'street_main');
    // The last option is always the one where they don't bother.
    const ev = tickOnce(s, never());
    expect(ev.some((e) => e.type === 'errand_balk')).toBe(true);
    expect(n.goals).toBeUndefined();
  });

  it('steals the car and brings it to her', () => {
    const { s, n } = room();
    s.w.strays = { street_main: vehicleOf(ALL_MAKES[0]!) };
    const g = give(s, n, 'steal_car', { loc: 'street_main' });
    expect(g.loc).toBe('street_main');
    tickOnce(s); // walks
    expect(n.locationId).toBe('street_main');
    const ev = tickOnce(s);
    expect(errands(ev)[0]!.data.variant).toMatch(/^steal_car_.*_ok$/);
    expect(s.w.flags['stolen:street_main']).toBe(true);
    // She's indoors, so it waits for her where it was taken.
    expect(s.w.strays?.street_main).toBeDefined();
    expect(n.goals).toBeUndefined();
  });

  it('takes over the deck', () => {
    const s = scenario({ at: PLACE });
    const booth = s.w.features.dj_booth!;
    expect(booth).toBeDefined();
    for (const x of Object.values(s.w.npcs)) if (x.locationId === booth.locationId) moveNpc(s.w, x, '_gone');
    s.w.hero.locationId = booth.locationId;
    const n = person(s, 'dj');
    moveNpc(s.w, n, booth.locationId);
    const listener = person(s, 'listener');
    moveNpc(s.w, listener, booth.locationId);
    const before = listener.affinity;
    give(s, n, 'take_deck');
    const ev = tickOnce(s);
    expect(errands(ev)[0]!.data.variant).toMatch(/^take_deck_.*_ok$/);
    expect(booth.flags).toContain(`held:${n.id}`);
    expect(listener.affinity).not.toBe(before);
  });

  it('buys the round, from their own pocket', () => {
    const { s, n } = room();
    const listener = person(s, 'thirsty');
    const before = listener.affinity;
    const cash = n.cash;
    give(s, n, 'buy_round');
    const ev = tickOnce(s);
    expect(errands(ev)[0]!.data.variant).toMatch(/^buy_round_/);
    expect(n.cash).toBeLessThan(cash);
    expect(listener.affinity).toBe(before + 2);
  });

  it('tags the wall', () => {
    const { s, n } = room();
    const before = s.w.locations[PLACE]!.graffiti;
    give(s, n, 'tag_wall', { loc: PLACE });
    tickOnce(s);
    expect(s.w.locations[PLACE]!.graffiti).toBeGreaterThan(before);
  });

  it('gets up and sings', () => {
    const { s, n } = room();
    const listener = person(s, 'audience');
    const before = listener.affinity;
    give(s, n, 'karaoke');
    const ev = tickOnce(s);
    expect(errands(ev)[0]!.data.variant).toMatch(/^karaoke_.*_ok$/);
    expect(listener.affinity).toBeGreaterThan(before);
  });
});

describe('whims', () => {
  it('a mischievous Blackbird asks for all sorts', () => {
    const { s, n } = room();
    s.w.hero.personality.traits.mischief = 1;
    const target = person(s, 'bystander');
    void target;
    const kinds = new Set<string>();
    for (let b = 0; b < 4000; b += 40) {
      s.w.beat = b;
      for (const x of wishes(s.w, n)) kinds.add(x.kind);
    }
    for (const k of ['kiss', 'steal_car', 'take_deck', 'buy_round', 'tag_wall', 'karaoke']) expect(kinds, k).toContain(k);
  });

  it('a placid one asks for fewer', () => {
    const count = (mischief: number) => {
      const { s, n } = room();
      s.w.hero.personality.traits.mischief = mischief;
      s.w.hero.personality.traits.thrill = mischief;
      let k = 0;
      for (let b = 0; b < 4000; b += 40) {
        s.w.beat = b;
        k += wishes(s.w, n).length;
      }
      return k;
    };
    expect(count(0)).toBeLessThan(count(1));
  });

  it('every way of going about it has something to say', () => {
    const missing: string[] = [];
    for (const kind of ['kiss', 'steal_car', 'take_deck', 'buy_round', 'tag_wall', 'karaoke', 'go_after'] as const) {
      for (let i = 0; i < 40; i++) {
        const s = scenario({ at: PLACE, seed: `txt-${kind}-${i}` });
        for (const x of Object.values(s.w.npcs)) if (x.locationId === PLACE) moveNpc(s.w, x, '_gone');
        const n = person(s, 'mark', { power: 20 }, {});
        const t = person(s, 'tgt');
        const booth = s.w.features.dj_booth;
        if (kind === 'take_deck' && booth) s.w.hero.locationId = booth.locationId;
        if (kind === 'take_deck' && booth) moveNpc(s.w, n, booth.locationId);
        if (kind === 'take_deck' && booth) moveNpc(s.w, t, booth.locationId);
        if (kind === 'karaoke' && s.w.features.karaoke) {
          s.w.hero.locationId = s.w.features.karaoke.locationId;
          moveNpc(s.w, n, s.w.hero.locationId);
        }
        if (kind === 'steal_car') s.w.strays = { [PLACE === 'halo_floor' ? 'street_main' : PLACE]: vehicleOf(ALL_MAKES[i % ALL_MAKES.length]!) };
        const g = give(s, n, kind, { target: t.id, ...(kind === 'steal_car' ? { loc: 'street_main' } : {}) });
        if (kind === 'steal_car') moveNpc(s.w, n, 'street_main');
        for (let k = 0; k < 6 && n.goals?.includes(g); k++) {
          s.w.beat += 6;
          const ev = s.run((c) => influenceTick(c), new Rng(`r${i}:${k}`));
          for (const e of ev) if (!hasTemplate(e)) missing.push(`${e.type}:${e.data.variant}`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
