import { describe, expect, it } from 'vitest';
import { slow } from './testkit';
import { createWorld } from './world';
import { step } from './run';
import { Rng } from './rng';
import { spawnNpc } from './content/archetypes';
import { addNpc, allNpcs, everyoneAt, moveNpc } from './population';
import { NPC_TRAITS, QUIRKS, characterOf, computeCharacter, traitOf } from './character';
import { forgetTies, isStub, link, makeStub, materialize, nameOf, opinionOf, regard, spreadDeed, tie, tiesFrom, tiesInto } from './ties';
import { AUTHORED_FACTS, rollFacts } from './facts';
import { canDeepen, ensureDeep } from './deepen';
import { avengerTick, knowledgeCandidates, knows, learn, noticeTick, shareFact } from './knowledge';
import { settleContracts } from './contracts';
import { reactionWeights } from './witness';
import { bondEvent } from './bonds';
import { beginRun, endRun, newUniverse, splitWorld } from './universe';
import { deserialize, makeSave, resume, serialize } from './store';
import { hasTemplate, render } from './text';
import { personalityFrom } from './personality';
import type { Ctx, GameEvent, Npc, World } from './types';

const ctxOf = (w: World, seed = 'ctx'): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const person = (w: World, id: string, archetype = 'patron', loc?: string, over: Partial<Npc> = {}): Npc => {
  const n = Object.assign(spawnNpc(new Rng(id), id, archetype, loc ?? w.hero.locationId, { name: id[0]!.toUpperCase() + id.slice(1) + ' Vance' }), over);
  addNpc(w, n);
  return n;
};
const say = (ev: GameEvent): string => render(ev, { rng: new Rng('r'), personality: personalityFrom({}), realName: 'Gary-Ann' }).map((l) => l.text).join(' | ');

describe('character', () => {
  it('is worked out from who they are, the same every time, and not stored until it matters', () => {
    const w = createWorld({ seed: 'char' });
    const n = person(w, 'ada');
    const a = computeCharacter(w.worldSeed, n);
    expect(computeCharacter(w.worldSeed, n)).toEqual(a);
    expect(n.character).toBeUndefined();
    expect(characterOf(w, n)).toEqual(a);
    for (const t of NPC_TRAITS) expect(a.traits[t]).toBeGreaterThanOrEqual(0.02);
    expect(QUIRKS).toContain(a.quirk);
    ensureDeep(w, n);
    expect(n.character).toEqual(a);
  });

  it('is shaped by the job, but only shaped', () => {
    const w = createWorld({ seed: 'bias' });
    const avg = (arch: string, t: 'courage' | 'greed') => {
      let sum = 0;
      for (let i = 0; i < 80; i++) sum += traitOf(w, spawnNpc(new Rng(`${arch}${i}`), `${arch}${i}`, arch, 'street_main'), t);
      return sum / 80;
    };
    expect(avg('bouncer', 'courage')).toBeGreaterThan(avg('dealer', 'courage') + 0.2);
    expect(avg('fixer', 'greed')).toBeGreaterThan(avg('prophet', 'greed') + 0.15);
    const spread = Array.from({ length: 80 }, (_, i) => traitOf(w, spawnNpc(new Rng(`b${i}`), `b${i}`, 'bouncer', 'street_main'), 'courage'));
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(0.25);
  });

  it('fills the quirk in with the right pronouns when it is written', () => {
    const w = createWorld({ seed: 'quirk' });
    const withTokens = QUIRKS.filter((q) => q.includes('{'));
    expect(withTokens.length).toBeGreaterThan(2);
    expect(withTokens.every((q) => /\{(they|their|them|is)\}/.test(q))).toBe(true);
    expect(w).toBeDefined();
  });
});

describe('ties', () => {
  it('are directed, can disagree, and are found from either end', () => {
    const w = createWorld({ seed: 'ties' });
    link(w, 'bao', 'ray', 'friend', 70, 20);
    expect(regard(w, 'bao', 'ray')).toBe(70);
    expect(regard(w, 'ray', 'bao')).toBe(20);
    expect(tiesFrom(w, 'bao').some((t) => t.to === 'ray')).toBe(true);
    expect(tiesInto(w, 'ray').some((t) => t.from === 'bao')).toBe(true);
    tie(w, 'bao', 'ray', 'friend', 10);
    expect(tiesFrom(w, 'bao').filter((t) => t.to === 'ray' && t.kind === 'friend')).toHaveLength(1);
    expect(regard(w, 'bao', 'ray')).toBe(10);
  });

  it('come with the authored cast, and fall back to the factions where nobody has a tie', () => {
    const w = createWorld({ seed: 'authored' });
    expect(regard(w, 'tiny', 'dutch')).toBeGreaterThan(30);
    expect(opinionOf(w, w.npcs.tiny!, w.npcs.dutch!)).toBe(regard(w, 'tiny', 'dutch'));
    const cop = allNpcs(w).find((n) => n.archetype === 'cop')!;
    const ganger = allNpcs(w).find((n) => n.archetype === 'ganger')!;
    expect(regard(w, cop.id, ganger.id)).toBe(0);
    expect(opinionOf(w, cop, ganger)).toBeLessThan(0);
  });

  it('survive being written out and read back', () => {
    const w = createWorld({ seed: 'json' });
    ensureDeep(w, w.npcs.nyx!);
    const back = JSON.parse(JSON.stringify(w)) as World;
    expect(regard(back, 'tiny', 'dutch')).toBe(regard(w, 'tiny', 'dutch'));
    expect(tiesFrom(back, 'nyx').length).toBe(tiesFrom(w, 'nyx').length);
  });

  it('can point at people who do not exist yet, and follow them into the world', () => {
    const w = createWorld({ seed: 'stub' });
    const nyx = w.npcs.nyx!;
    const stub = makeStub(w, { name: 'Odalys Vance', gender: 'woman', age: 41, archetype: 'cook', faction: null }, 'sister');
    link(w, nyx.id, stub.id, 'kin', 80, 70);
    nyx.facts = [{ id: 'lost_someone', kind: 'lost_someone', vis: 'asked', about: stub.id, data: { rel: 'sister' } }];
    expect(isStub(stub.id)).toBe(true);
    expect(nameOf(w, stub.id)).toBe('Odalys Vance');
    const real = materialize(w, stub.id, 'street_main')!;
    expect(real.name).toBe('Odalys Vance');
    expect(real.gender).toBe('woman');
    expect(real.age).toBe(41);
    expect(w.stubs[stub.id]).toBeUndefined();
    expect(regard(w, nyx.id, real.id)).toBe(80);
    expect(tiesInto(w, real.id).some((t) => t.from === nyx.id)).toBe(true);
    expect(nyx.facts[0]!.about).toBe(real.id);
    expect(everyoneAt(w, 'street_main').map((n) => n.id)).toContain(real.id);
    expect(materialize(w, stub.id, 'street_main')).toBeUndefined();
  });

  it('can be forgotten with the person', () => {
    const w = createWorld({ seed: 'forget' });
    link(w, 'dutch', 'nyx', 'friend', 50);
    forgetTies(w, 'nyx');
    expect(regard(w, 'dutch', 'nyx')).toBe(0);
    expect(tiesInto(w, 'nyx')).toEqual([]);
  });
});

describe('when somebody matters', () => {
  it('fills them in once, deterministically, and not at all for throwaways and machines', () => {
    const a = createWorld({ seed: 'deep' });
    const b = createWorld({ seed: 'deep' });
    const pa = person(a, 'edda', 'patron');
    const pb = person(b, 'edda', 'patron');
    ensureDeep(a, pa);
    ensureDeep(b, pb);
    expect(pa.depth).toBe('deep');
    expect(pa.facts).toEqual(pb.facts);
    expect(pa.character).toEqual(pb.character);
    expect(tiesFrom(a, pa.id).map((t) => `${t.kind}:${t.to}:${t.regard}`)).toEqual(tiesFrom(b, pb.id).map((t) => `${t.kind}:${t.to}:${t.regard}`));
    const before = a.ties.length;
    ensureDeep(a, pa);
    expect(a.ties.length).toBe(before);
    const tmp = person(a, 'tmp_5_mugger_0', 'mugger');
    ensureDeep(a, tmp);
    expect(tmp.depth).toBeUndefined();
    expect(canDeepen(a.npcs.dragon!)).toBe(false);
    expect(canDeepen(a.npcs.sprocket!)).toBe(false);
    expect(canDeepen(pa)).toBe(true);
  });

  it('gives them some ties, with real people and with names that are not people yet', () => {
    let kin = 0;
    let real = 0;
    for (let i = 0; i < 40; i++) {
      const w = createWorld({ seed: `rt${i}` });
      const n = person(w, 'edda', 'patron', 'halo_floor');
      ensureDeep(w, n);
      for (const t of tiesFrom(w, n.id)) {
        expect(t.to).not.toBe(n.id);
        expect(Math.abs(t.regard)).toBeLessThanOrEqual(100);
        if (isStub(t.to)) {
          kin++;
          const stub = w.stubs[t.to]!;
          expect(stub.age).toBeGreaterThanOrEqual(18);
          if (t.kind === 'kin') expect(stub.name.endsWith('Vance')).toBe(true);
        } else {
          real++;
        }
        expect(tiesInto(w, t.to).some((x) => x.from === n.id)).toBe(true);
      }
    }
    expect(kin).toBeGreaterThan(5);
    expect(real).toBeGreaterThan(5);
  });

  it('writes the named cast by hand and rolls everyone else', () => {
    const w = createWorld({ seed: 'authoredfacts' });
    ensureDeep(w, w.npcs.dutch!);
    expect(w.npcs.dutch!.facts!.map((f) => f.kind).sort()).toEqual(AUTHORED_FACTS.dutch!.map((f) => f.kind).sort());
    const kinds = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const n = person(w, `x${i}`, i % 2 ? 'ganger' : 'patron', 'halo_floor');
      for (const f of rollFacts(w, n)) kinds.add(f.kind);
    }
    expect(kinds.size).toBeGreaterThan(8);
  });

  it('only wants revenge on somebody who is there to take it on, and prices it by how tough they are', () => {
    let revenge = 0;
    for (let i = 0; i < 100; i++) {
      const w = createWorld({ seed: `rv${i}` });
      const n = person(w, 'edda', 'ganger', 'halo_floor');
      ensureDeep(w, n);
      const f = n.facts!.find((x) => x.kind === 'wants_revenge');
      if (!f) continue;
      revenge++;
      expect(w.npcs[f.about!]?.alive).toBe(true);
      expect(f.about).not.toBe(n.id);
      expect(Number(f.data.reward)).toBeGreaterThan(50);
    }
    expect(revenge).toBeGreaterThan(5);
  });
});

describe('finding out', () => {
  const deepWith = (w: World, facts: NonNullable<Npc['facts']>, over: Partial<Npc> = {}): Npc => {
    const n = person(w, 'edda', 'patron', undefined, over);
    ensureDeep(w, n);
    n.facts = facts;
    return n;
  };

  it('learns what shows on the surface, once, and says so', () => {
    const w = createWorld({ seed: 'saw' });
    const n = deepWith(w, [{ id: 'ex_member', kind: 'ex_member', vis: 'visible', data: { faction: 'Chrome Vipers' } }]);
    const { c, events } = ctxOf(w);
    for (let i = 0; i < 80; i++) noticeTick(c);
    const learned = events.filter((e) => e.type === 'learn');
    expect(learned).toHaveLength(1);
    expect(learned[0]!.data).toMatchObject({ variant: 'ex_member', via: 'saw', npc: n.name, faction: 'Chrome Vipers' });
    expect(knows(w, n.id, 'ex_member')).toBe(true);
    expect(hasTemplate(learned[0]!)).toBe(true);
    expect(say(learned[0]!)).toMatch(/Chrome Vipers/);
  });

  it('does not tell her what is kept secret, however long she stands there', () => {
    const w = createWorld({ seed: 'secret' });
    deepWith(w, [{ id: 'arrested_once', kind: 'arrested_once', vis: 'secret', data: { for: 'a rooftop incident' } }]);
    const { c, events } = ctxOf(w);
    for (let i = 0; i < 300; i++) noticeTick(c);
    expect(events.filter((e) => e.type === 'learn')).toHaveLength(0);
  });

  it('is told when she asks the right person, and hears secrets only from people who like her', () => {
    let told = 0;
    for (let i = 0; i < 60; i++) {
      const w = createWorld({ seed: `ask${i}` });
      const n = deepWith(w, [{ id: 'veteran', kind: 'veteran', vis: 'asked', data: { of: 'the Fall' } }, { id: 'owes', kind: 'owes', vis: 'secret', data: { amount: 90, to: 'Madame Zero' } }], { affinity: 10 });
      n.character = { traits: { sociable: 0.95 }, quirk: QUIRKS[0]! };
      const { c, events } = ctxOf(w, `a${i}`);
      for (let k = 0; k < 6; k++) shareFact(c, n);
      told += events.filter((e) => e.type === 'learn').length;
      expect(knows(w, n.id, 'owes')).toBe(false);
    }
    expect(told).toBeGreaterThan(20);
    const w = createWorld({ seed: 'fond' });
    const n = deepWith(w, [{ id: 'owes', kind: 'owes', vis: 'secret', data: { amount: 90, to: 'Madame Zero' } }], { affinity: 70 });
    n.character = { traits: { sociable: 0.95 }, quirk: QUIRKS[0]! };
    const { c } = ctxOf(w, 'fond');
    for (let k = 0; k < 40; k++) shareFact(c, n);
    expect(knows(w, n.id, 'owes')).toBe(true);
  });

  it('hears about the people they know, with whoever told her named', () => {
    const w = createWorld({ seed: 'gossip' });
    const talker = deepWith(w, []);
    talker.character = { traits: { sociable: 1, loyalty: 0 }, quirk: QUIRKS[0]! };
    const friend = person(w, 'fenn', 'ganger');
    ensureDeep(w, friend);
    friend.facts = [{ id: 'ex_member', kind: 'ex_member', vis: 'asked', data: { faction: 'Rust Choir' } }];
    link(w, talker.id, friend.id, 'friend', 60);
    const { c, events } = ctxOf(w, 'gossip');
    for (let k = 0; k < 30 && !events.some((e) => e.type === 'learn'); k++) shareFact(c, talker);
    const e = events.find((x) => x.type === 'learn')!;
    expect(e.data).toMatchObject({ npc: friend.name, via: 'tip', source: talker.name });
    expect(say(e)).toContain(talker.name);
  });

  it('forgets it all with the body, while the world still holds the truth', () => {
    const u = newUniverse('amnesia2');
    const w1 = beginRun(u, { seed: 'one' });
    const n = w1.npcs.dutch!;
    ensureDeep(w1, n);
    const { c } = ctxOf(w1);
    learn(c, n, n.facts![0]!, 'saw');
    expect(knows(w1, n.id, n.facts![0]!.id)).toBe(true);
    const w2 = beginRun(endRun(w1), { seed: 'two' });
    expect(knows(w2, n.id, n.facts![0]!.id)).toBe(false);
    expect(w2.npcs.dutch!.facts).toEqual(w1.npcs.dutch!.facts);
    expect(w2.npcs.dutch!.depth).toBe('deep');
    expect(tiesFrom(w2, 'dutch').length).toBe(tiesFrom(w1, 'dutch').length);
  });

  it('is saved with the world: people, facts and ties come back', () => {
    const w = beginRun(newUniverse('persist2'), { seed: 'one' });
    ensureDeep(w, w.npcs.nyx!);
    const text = serialize(makeSave(splitWorld(w).universe, w, 0));
    const back = resume(deserialize(text), 0).world!;
    expect(back.npcs.nyx!.facts).toEqual(w.npcs.nyx!.facts);
    expect(back.ties.length).toBe(w.ties.length);
    expect(Object.keys(back.stubs).sort()).toEqual(Object.keys(w.stubs).sort());
  });
});

describe('buying it', () => {
  it('lets her pay the sort of person who sells it, and tells her when there is nothing', () => {
    const w = createWorld({ seed: 'buy' });
    const ray = w.npcs.ray!;
    w.hero.cash = 500;
    w.hero.locationId = ray.locationId;
    const cand = knowledgeCandidates(w).find((x) => x.key === 'buy_info:ray');
    expect(cand).toBeDefined();
    const { c, events } = ctxOf(w);
    const cash = w.hero.cash;
    cand!.run(c);
    expect(w.hero.cash).toBeLessThan(cash);
    expect(events.some((e) => e.type === 'learn' && e.data.via === 'paid')).toBe(true);
    const plain = person(w, 'plain', 'patron');
    expect(knowledgeCandidates(w).some((x) => x.key === `buy_info:${plain.id}`)).toBe(false);
    w.hero.cash = 3;
    expect(knowledgeCandidates(w).some((x) => x.key.startsWith('buy_info:'))).toBe(false);
  });
});

describe('scores to settle', () => {
  const setup = (seed: string) => {
    const w = createWorld({ seed });
    const client = person(w, 'edda', 'patron');
    const target = person(w, 'rook', 'ganger');
    ensureDeep(w, client);
    client.facts = [{ id: 'wants_revenge', kind: 'wants_revenge', vis: 'asked', about: target.id, data: { reward: 140, mode: 'beat_up', beef: 'a rigged card game' } }];
    client.affinity = 10;
    return { w, client, target };
  };

  it('is offered once she knows, and not before', () => {
    const { w, client } = setup('contract1');
    expect(knowledgeCandidates(w).some((x) => x.key === `take_contract:${client.id}`)).toBe(false);
    const { c } = ctxOf(w);
    learn(c, client, client.facts![0]!, 'asked');
    expect(knowledgeCandidates(w).some((x) => x.key === `take_contract:${client.id}`)).toBe(true);
  });

  it('takes the job, makes it a goal, and pays when the target is beaten', () => {
    const { w, client, target } = setup('contract2');
    const { c, events } = ctxOf(w);
    learn(c, client, client.facts![0]!, 'asked');
    knowledgeCandidates(w).find((x) => x.key === `take_contract:${client.id}`)!.run(c);
    expect(w.mind.contracts).toHaveLength(1);
    expect(w.mind.goals.some((g) => g.kind === 'kill' && g.npc === target.id)).toBe(true);
    expect(knowledgeCandidates(w).some((x) => x.key.startsWith('take_contract:'))).toBe(false);
    const cash = w.hero.cash;
    target.downUntil = w.clock + 60;
    settleContracts(c, [target]);
    expect(w.hero.cash).toBe(cash + 140);
    expect(w.mind.contracts).toHaveLength(0);
    expect(client.facts!.some((f) => f.kind === 'wants_revenge')).toBe(false);
    for (const type of ['contract', 'goal_new']) for (const e of events.filter((x) => x.type === type)) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    expect(events.find((e) => e.data.variant === 'paid')).toBeDefined();
  });

  it('pays nothing if the client is no longer around to', () => {
    const { w, client, target } = setup('contract3');
    const { c, events } = ctxOf(w);
    learn(c, client, client.facts![0]!, 'asked');
    knowledgeCandidates(w).find((x) => x.key === `take_contract:${client.id}`)!.run(c);
    client.alive = false;
    target.alive = false;
    const cash = w.hero.cash;
    settleContracts(c, [target]);
    expect(w.hero.cash).toBe(cash);
    expect(events.some((e) => e.type === 'contract' && e.data.variant === 'void')).toBe(true);
  });
});

describe('word getting around', () => {
  const circle = (seed: string) => {
    const w = createWorld({ seed });
    const victim = person(w, 'dex', 'ganger');
    const friend = person(w, 'fenn', 'patron');
    const rival = person(w, 'rook', 'patron');
    const sister = person(w, 'sol', 'patron', 'street_main');
    link(w, friend.id, victim.id, 'friend', 70, 60);
    link(w, rival.id, victim.id, 'rival', -60, -50);
    link(w, sister.id, friend.id, 'kin', 80, 80);
    return { w, victim, friend, rival, sister };
  };

  it('makes friends of the hurt angry, their rivals pleased, and their family angrier still when it is a death', () => {
    const { w, victim, friend, rival, sister } = circle('deed1');
    const { c } = ctxOf(w);
    spreadDeed(c, victim, 'hurt');
    expect(friend.affinity).toBeLessThan(0);
    expect(rival.affinity).toBeGreaterThan(0);
    const hurt = friend.affinity;
    spreadDeed(c, victim, 'killed');
    expect(friend.affinity).toBeLessThan(hurt - 8);
    expect(friend.memories.some((m) => m.startsWith('heard Blackbird killed Dex'))).toBe(true);
    expect(sister.affinity).toBeLessThan(0);
    expect(friend.heard?.at(-1)?.[1]).toBe('killed');
  });

  it('warms the people who loved someone she helped', () => {
    const { w, victim, friend } = circle('deed2');
    const { c } = ctxOf(w);
    spreadDeed(c, victim, 'helped');
    expect(friend.affinity).toBeGreaterThan(0);
  });

  it('sends the closest to find her, and they say why', () => {
    const { w, victim, friend } = circle('deed3');
    const { c, events } = ctxOf(w, 'av');
    spreadDeed(c, victim, 'killed');
    expect(friend.flags).toContain('avenger');
    for (let i = 0; i < 50; i++) avengerTick(c);
    expect(events.some((e) => e.type === 'avenger')).toBe(false); // not in the same breath
    w.clock += 300;
    for (let i = 0; i < 400 && !events.some((e) => e.type === 'avenger'); i++) {
      avengerTick(c);
      if (w.over) break;
    }
    const e = events.find((x) => x.type === 'avenger');
    expect(e).toBeDefined();
    expect(e!.data.about).toBe('Dex Vance');
    expect(hasTemplate(e!)).toBe(true);
    expect(friend.flags).not.toContain('avenger');
  });

  it('does not touch people who barely knew them', () => {
    const { w, victim } = circle('deed4');
    const stranger = person(w, 'stan', 'patron');
    link(w, stranger.id, victim.id, 'friend', 10);
    const { c } = ctxOf(w);
    spreadDeed(c, victim, 'killed');
    expect(stranger.affinity).toBe(0);
  });

  it('shows in the room: friends of the victim step in and run less', () => {
    const { w, victim, friend } = circle('deed5');
    const stranger = person(w, 'stan', 'patron');
    friend.character = { traits: { courage: 0.6 }, quirk: QUIRKS[0]! };
    stranger.character = { traits: { courage: 0.6 }, quirk: QUIRKS[0]! };
    const mine = reactionWeights(w, friend, victim);
    const theirs = reactionWeights(w, stranger, victim);
    expect(mine.join).toBeGreaterThan(theirs.join + 1);
    expect(mine.flee).toBeLessThan(theirs.flee);
    expect(mine.cheer).toBe(0);
  });

  it('lets the brave and the timid react like themselves', () => {
    const w = createWorld({ seed: 'nerve' });
    const victim = person(w, 'dex', 'ganger');
    const brave = person(w, 'bo', 'bouncer');
    const timid = person(w, 'ti', 'bouncer');
    brave.character = { traits: { courage: 0.95 }, quirk: QUIRKS[0]! };
    timid.character = { traits: { courage: 0.05 }, quirk: QUIRKS[0]! };
    expect(reactionWeights(w, brave, victim).flee).toBeLessThan(reactionWeights(w, timid, victim).flee);
    expect(reactionWeights(w, brave, victim).intervene).toBeGreaterThan(reactionWeights(w, timid, victim).intervene);
  });
});

describe('death spreads along the people who care', () => {
  it('reaches the family and friends of those who saw it', () => {
    let reached = 0;
    for (let i = 0; i < 20; i++) {
      const w1 = beginRun(newUniverse(`word${i}`), { seed: 'one' });
      const dutch = w1.npcs.dutch!;
      const cousin = person(w1, 'cousin', 'patron', 'street_main');
      link(w1, dutch.id, cousin.id, 'kin', 80, 80);
      w1.hero.locationId = 'halo_floor'; // (the night starts in the lab lot; this one ends in the bar)
      const ganger = allNpcs(w1).find((n) => n.archetype === 'ganger' && n.locationId === 'halo_floor')!;
      ganger.hostile = true;
      w1.over = true;
      w1.ending = 'dead';
      const u = endRun(w1);
      if (u.npcs.cousin!.knows?.died === 1) reached++;
      expect(u.npcs.cousin!.knows?.saw).toBeUndefined();
    }
    expect(reached).toBeGreaterThan(6);
    expect(reached).toBeLessThan(20);
  });
});

describe('romance meets depth', () => {
  it('makes a partner a name in the world that turns up as a person', () => {
    const w = createWorld({ seed: 'partner-stub' });
    const n = spawnNpc(new Rng('lena'), 'lena', 'patron', 'halo_floor', { name: 'Lena Ford', gender: 'woman', age: 33 });
    addNpc(w, n);
    n.heart = { loyal: 0.7, content: 0.5, spark: 0.5, clingy: 0.5, exes: [], partner: { name: 'Dale', kind: 'husband', years: 6 } };
    const { c } = ctxOf(w);
    bondEvent(c, n, 'flirt');
    expect(n.depth).toBe('deep');
    const stub = w.stubs['stub:partner_of_lena'];
    expect(stub).toMatchObject({ name: 'Dale', gender: 'man' });
    expect(tiesFrom(w, 'lena').some((t) => t.kind === 'partner' && t.to === stub!.id)).toBe(true);
    const real = materialize(w, stub!.id, 'halo_floor')!;
    expect(real.id).toBe('partner_of_lena');
    expect(tiesFrom(w, 'lena').some((t) => t.kind === 'partner' && t.to === real.id)).toBe(true);
    moveNpc(w, real, 'halo_floor');
  });
});

describe('whole nights', () => {
  slow('fill in only the people who come up, and everything they say can be read', () => {
    const missing = new Set<string>();
    let learned = 0;
    let deep = 0;
    let total = 0;
    const kinds = new Set<string>();
    // Twelve nights, not six: with burglary needing a known address there are fewer fights to deepen people, so fewer `learn`s per night.
    for (let i = 0; i < 12; i++) {
      const w = createWorld({ seed: `depth${i}`, personality: personalityFrom({ curiosity: 0.9, sociable: 0.9, greed: 0.7, impress: 0.8 }) });
      for (let b = 0; b < 400 && !w.over; b++) {
        for (const e of step(w)) {
          if (['learn', 'ask', 'contract', 'avenger', 'recognition'].includes(e.type)) {
            if (!hasTemplate(e)) missing.add(`${e.type}:${e.data.variant}`);
            else for (const l of render(e, { rng: new Rng('x'), personality: personalityFrom({}), realName: 'G' })) if (/[{}]/.test(l.text)) missing.add(`token in ${e.type}:${e.data.variant}: ${l.text}`);
          }
          if (e.type === 'learn') {
            learned++;
            kinds.add(String(e.data.variant));
          }
        }
      }
      const people = allNpcs(w);
      total += people.length;
      deep += people.filter((n) => n.depth === 'deep').length;
    }
    expect([...missing]).toEqual([]);
    expect(learned).toBeGreaterThan(5);
    expect(kinds.size).toBeGreaterThan(2);
    expect(deep).toBeGreaterThan(0);
    expect(deep / total).toBeLessThan(0.7);
  }, 180_000);

  it('are the same twice', () => {
    const run = () => {
      const w = createWorld({ seed: 'twice', personality: personalityFrom({ curiosity: 0.9, sociable: 0.9 }) });
      const out: string[] = [];
      for (let b = 0; b < 250 && !w.over; b++) for (const e of step(w)) out.push(`${e.type}:${e.data.variant ?? ''}:${e.data.npc ?? ''}`);
      return { out, ties: w.ties.length, stubs: Object.keys(w.stubs).length };
    };
    expect(run()).toEqual(run());
  }, 120_000);
});
