import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { newCompanion } from './companions';
import { resolveAsk } from './advice';
import { adoptCalling, callingAfter, callingBias, callingTargets, callingTick, callingView, tallyKill } from './callings';
import { CALLINGS, DEFS } from './content/callings';
import { mindTick } from './goals';
import { removeCompanion } from './companions';
import type { Calling, Npc } from './types';

const world = (seed: string, traits: Parameters<typeof personalityFrom>[0] = {}): World =>
  createWorld({ seed, competence: 0.8, personality: personalityFrom(traits) });
const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const npc = (w: World, id: string, archetype: string, loc: string, extra: Partial<Npc> = {}): Npc => {
  const n = Object.assign(spawnNpc(new Rng(id), id, archetype, loc, {}), extra);
  addNpc(w, n);
  return n;
};
const cal = (id: string, extra: Partial<Calling> = {}): Calling => ({
  id, since: 0, fervor: 0.7, goal: 10, base: 0, origin: { kind: 'spark', text: 'test', beat: 0 }, lastProgress: 0, last: 0, said: 0, ...extra,
});
const ev = (type: string, outcome: GameEvent['outcome'] = 'good', data: GameEvent['data'] = {}): GameEvent => ({ beat: 40, type, outcome, data });
/** She stops to ask; nobody answering is the same as yes. */
const settle = (c: ReturnType<typeof ctxOf>['c']) => {
  if (c.w.mind.ask) resolveAsk(c, c.w.mind.ask.lean, 'self');
};

describe('callings: the slot', () => {
  it('holds at most one, and it is hers until she loses it', () => {
    const w = world('slot');
    const { c } = ctxOf(w, 's');
    expect(adoptCalling(c, cal('net'))).toBe(true);
    expect(adoptCalling(c, cal('cops'))).toBe(false);
    expect(w.mind.calling!.id).toBe('net');
  });

  it('a fresh body has none: nothing carries over', () => {
    const w = world('fresh');
    expect(w.mind.calling).toBeUndefined();
    expect(callingView(w)).toBeNull();
  });

  it('every entry in the table is well-formed', () => {
    const ids = new Set(CALLINGS.map((d) => d.id));
    expect(ids.size).toBe(CALLINGS.length);
    const w = world('shape');
    const rng = new Rng('shape');
    for (const d of CALLINGS) {
      expect(d.origin.length, d.id).toBeGreaterThan(8);
      for (const sq of d.sequels ?? []) expect(ids.has(sq.id), `${d.id} -> ${sq.id}`).toBe(true);
      const target = d.aim?.(w, rng) ?? undefined;
      const c = cal(d.id, { target: target ?? { npc: 'x', faction: 'npd', skill: d.id, text: 'them' }, goal: d.goal(rng, 0.5, w) });
      expect(d.line(c).length, d.id).toBeGreaterThan(8);
      expect(c.goal, d.id).toBeGreaterThanOrEqual(1);
    }
    expect(CALLINGS.length).toBeGreaterThanOrEqual(25);
  });
});

describe('callings: how she gets one', () => {
  it('a companion killed by the NPD is a wound; she takes up a vengeance without asking', () => {
    let wounded = 0;
    const taken: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const w = world(`wound${i}`, { loyalty: 0.8, grudge: 0.8 });
      w.beat = 40;
      const { c, events } = ctxOf(w, `w${i}`);
      const lost = ev('companion_lost', 'bad', { name: 'Pip', kind: 'puppy', by: 'Officer Brandt', by_id: 'brandt', by_faction: 'npd' });
      npc(w, 'brandt', 'cop', 'halo_floor', { name: 'Officer Brandt' });
      callingAfter(c, null, 0, [lost]);
      if (w.mind.calling) {
        wounded++;
        taken[w.mind.calling.id] = (taken[w.mind.calling.id] ?? 0) + 1;
        expect(w.mind.calling.origin.kind).toBe('wound');
        expect(w.mind.ask).toBeUndefined();
        expect(events.some((e) => e.type === 'calling' && e.data.variant === 'wound' && hasTemplate(e))).toBe(true);
      }
    }
    expect(wounded).toBeGreaterThan(20);
    expect(Object.keys(taken).every((k) => ['avenge', 'cops'].includes(k))).toBe(true);
    expect(taken.avenge).toBeGreaterThan(0);
    expect(taken.cops).toBeGreaterThan(0);
  });

  it('an avenging calling is after the one who did it, and ends when they are dead', () => {
    const w = world('avenge');
    w.beat = 40;
    const b = npc(w, 'brandt', 'cop', 'halo_floor', { name: 'Officer Brandt' });
    const { c } = ctxOf(w, 'a');
    // Rig it: only that Calling sparks from this.
    for (let i = 0; i < 20 && !w.mind.calling; i++) callingAfter(ctxOf(w, `try${i}`).c, null, 0, [ev('companion_lost', 'bad', { name: 'Pip', by: b.name, by_id: b.id, by_faction: 'npd' })]);
    if (w.mind.calling?.id !== 'avenge') {
      delete w.mind.calling;
      adoptCalling(c, cal('avenge', { target: { npc: b.id, text: `${b.name} pay for Pip` } }));
    }
    expect(DEFS.avenge!.bias!(w, w.mind.calling!, 'challenge', b.id)).toBeGreaterThan(2);
    expect(DEFS.avenge!.bias!(w, w.mind.calling!, 'challenge', 'someone_else')).toBe(0);
    b.alive = false;
    w.mind.calling = { ...w.mind.calling!, id: 'avenge', goal: 1 };
    callingAfter(ctxOf(w, 'done').c, null, 0, []);
    expect(w.mind.calling?.id).not.toBe('avenge');
  });

  it('a vivid moment that fits her sparks one; one that does not, mostly does not', () => {
    let techy = 0;
    let brute = 0;
    for (let i = 0; i < 60; i++) {
      const a = world(`techy${i}`, { techy: 0.95, curiosity: 0.8 });
      a.beat = 40;
      const ca = ctxOf(a, `a${i}`).c;
      callingAfter(ca, { key: 'hack:x', drives: {}, run() {} }, 0, [ev('hack', 'good', { variant: 'siphon' })]);
      settle(ca);
      if (a.mind.calling?.id === 'net') techy++;
      const b = world(`brute${i}`, { techy: 0.05, curiosity: 0.2 });
      b.beat = 40;
      const cb = ctxOf(b, `b${i}`).c;
      callingAfter(cb, { key: 'hack:x', drives: {}, run() {} }, 0, [ev('hack', 'good', { variant: 'siphon' })]);
      settle(cb);
      if (b.mind.calling?.id === 'net') brute++;
    }
    expect(techy).toBeGreaterThan(25);
    expect(techy).toBeGreaterThan(brute + 8);
  });

  it('she can ask the lab, and a no means a breather', () => {
    let asked = 0;
    for (let i = 0; i < 40 && !asked; i++) {
      const w = world(`ask${i}`, { sociable: 0.95, loyalty: 0.9, vanity: 0.1, techy: 0.95 });
      w.beat = 60;
      const { c, events } = ctxOf(w, `k${i}`);
      callingAfter(c, null, 0, [ev('hack', 'good', { variant: 'siphon' })]);
      if (!w.mind.ask) continue;
      asked++;
      expect(w.mind.ask.kind).toBe('calling');
      expect(w.mind.calling).toBeUndefined();
      expect(events.some((e) => e.type === 'advice_ask' && hasTemplate(e))).toBe(true);
      resolveAsk(c, 'no', 'lab');
      expect(w.mind.calling).toBeUndefined();
      callingAfter(c, null, 0, [ev('hack', 'good', { variant: 'siphon' })]);
      expect(w.mind.calling).toBeUndefined();
    }
    expect(asked).toBeGreaterThan(0);
    // And a yes makes it hers.
    const w = world('yes', { sociable: 0.95, loyalty: 0.9, vanity: 0.1, techy: 0.95 });
    w.beat = 60;
    const { c } = ctxOf(w, 'yes');
    w.mind.ask = { id: 1, kind: 'calling', asked: 60, until: 70, question: '?', options: [{ id: 'yes', label: 'Go', calling: cal('net') }, { id: 'no', label: 'No' }], lean: 'yes' };
    resolveAsk(c, 'yes', 'lab');
    expect(w.mind.calling?.id).toBe('net');
  });

  it('out of nowhere, now and then, she just wakes up with one', () => {
    const w = world('whim');
    w.beat = 400;
    const { c, events } = ctxOf(w, 'whim');
    for (let i = 0; i < 20000 && !w.mind.calling; i++) {
      callingTick(c);
      settle(c);
    }
    expect(w.mind.calling).toBeDefined();
    expect(w.mind.calling!.origin.kind).toBe('whim');
    expect(events.some((e) => e.type === 'calling' && e.data.variant === 'whim' && hasTemplate(e))).toBe(true);
  });
});

describe('callings: carrying one', () => {
  it('leans her towards what it likes, scaled by how hard it has hold of her', () => {
    const w = world('bias');
    const cop = npc(w, 'cop1', 'cop', 'halo_floor');
    const civ = npc(w, 'civ1', 'bartender', 'halo_floor');
    w.mind.calling = cal('cops', { goal: 100 });
    const high = callingBias(w, { key: `challenge:${cop.id}` });
    expect(high).toBeGreaterThan(1.5);
    expect(callingBias(w, { key: `challenge:${civ.id}` })).toBe(0);
    w.mind.calling.fervor = 0.2;
    expect(callingBias(w, { key: `challenge:${cop.id}` })).toBeLessThan(high / 2);
    expect(callingBias(w, { key: 'lay_low' })).toBeLessThan(0);
  });

  it('pulls her towards where the people it is about were last seen', () => {
    const w = world('pull');
    const cop = npc(w, 'cop1', 'cop', 'street_main');
    w.mind.lastSeen[cop.id] = 'street_main';
    w.mind.calling = cal('cops', { goal: 100 });
    expect(callingTargets(w).some((t) => t.loc === 'street_main' && t.value > 0)).toBe(true);
  });

  it('sets her goals of the usual kinds, and they are hard to drop', () => {
    let made = 0;
    for (let i = 0; i < 20; i++) {
      const w = world(`wish${i}`);
      w.beat = 100;
      npc(w, 'cop1', 'cop', 'halo_floor');
      w.mind.calling = cal('cops', { goal: 100, fervor: 0.9 });
      const { c } = ctxOf(w, `w${i}`);
      for (let b = 0; b < 400 && !w.mind.goals.some((g) => g.calling); b++) {
        w.beat++;
        settle(c);
        mindTick(c);
      }
      if (w.mind.goals.some((g) => g.calling)) made++;
    }
    expect(made).toBeGreaterThan(14);
  });

  it('counts the dead from the moment she took it up, and says so at the quarter marks', () => {
    const w = world('count');
    w.beat = 40;
    const { c, events } = ctxOf(w, 'count');
    tallyKill(w, { tags: ['cop'], faction: 'npd' });
    adoptCalling(c, cal('cops', { goal: 4 }));
    expect(callingView(w)!.count).toBe(0);
    tallyKill(w, { tags: ['cop'], faction: 'npd' });
    callingAfter(c, null, 0, []);
    expect(callingView(w)!.count).toBe(1);
    expect(events.some((e) => e.type === 'calling_beat' && e.data.variant === 'q1' && hasTemplate(e))).toBe(true);
  });

  it('finishing is loud, and it often grows into something bigger', () => {
    let sequels = 0;
    for (let i = 0; i < 30; i++) {
      const w = world(`fin${i}`);
      w.beat = 40;
      const { c, events } = ctxOf(w, `f${i}`);
      adoptCalling(c, cal('cops', { goal: 2 }));
      tallyKill(w, { tags: ['cop'], faction: 'npd' });
      tallyKill(w, { tags: ['cop'], faction: 'npd' });
      callingAfter(c, null, 0, []);
      expect(events.some((e) => e.type === 'calling_done' && hasTemplate(e))).toBe(true);
      if (w.mind.calling) {
        sequels++;
        expect(w.mind.calling.sequel).toBe(true);
        expect(w.mind.calling.id).not.toBe('cops');
      }
    }
    expect(sequels).toBeGreaterThan(3);
  });

  it('fervor ebbs, she wavers, and in the end she can lose the thread', () => {
    const w = world('ebb');
    w.beat = 500;
    const { c, events } = ctxOf(w, 'ebb');
    adoptCalling(c, cal('cops', { goal: 100, fervor: 0.6 }));
    for (let i = 0; i < 2000 && w.mind.calling; i++) callingTick(c);
    expect(events.some((e) => e.type === 'calling_waver' && hasTemplate(e))).toBe(true);
    expect(events.some((e) => e.type === 'calling_crisis' && hasTemplate(e))).toBe(true);
    expect(w.mind.calling).toBeUndefined();
  });

  it('a companion lost records who did it', () => {
    const w = world('lostby');
    const { c, events } = ctxOf(w, 'l');
    const brandt = npc(w, 'brandt', 'cop', 'halo_floor', { name: 'Officer Brandt' });
    const pip = newCompanion('puppy', 'Pip');
    w.hero.companions.push(pip);
    removeCompanion(c, pip, 'lost', brandt);
    expect(events.find((e) => e.type === 'companion_lost')!.data).toMatchObject({ by_id: 'brandt', by_faction: brandt.faction ?? '' });
  });
});
