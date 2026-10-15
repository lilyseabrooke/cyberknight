import { describe, expect, it } from 'vitest';
import { depths, hasTemplate, render, Rng, runToEnd, type GameEvent } from './index';
import { always, scenario } from './testkit';
import { spawnGroup } from './candidate';
import { fight } from './combat';

const byId = (events: GameEvent[]) => new Map(events.filter((e) => e.id).map((e) => [e.id!, e]));

describe('a fight is one story, told inside the event that opens it', () => {
  const play = () => {
    const s = scenario({ at: 'street_main', seed: 'grp-fight', competence: 0.6 });
    const events = s.run((c) => {
      const foes = spawnGroup(c, 'mugger', 2);
      fight(c, foes, { cause: 'a test', joiners: false });
    });
    return events;
  };

  it('opens with fight_start and tells everything else underneath it', () => {
    const events = play();
    const start = events.find((e) => e.type === 'fight_start')!;
    expect(start.id).toBeDefined();
    expect(start.in).toBeUndefined();
    const rest = events.slice(events.indexOf(start) + 1);
    expect(rest.length).toBeGreaterThan(1);
    // the end of the fight is in the group too, and so is every round
    for (const e of rest.filter((x) => x.type === 'fight_end' || x.type === 'fight_round')) expect(e.in).toBe(start.id);
  });

  it('has a line for every round, in order, and the end comes last', () => {
    const events = play();
    const rounds = events.filter((e) => e.type === 'fight_round').map((e) => Number(e.data.round));
    const end = events.find((e) => e.type === 'fight_end')!;
    expect(rounds).toEqual(Array.from({ length: Number(end.data.rounds) }, (_, i) => i + 1));
    const lastRound = events.map((e) => e.type).lastIndexOf('fight_round');
    expect(events.findIndex((e) => e.type === 'fight_end')).toBeGreaterThan(lastRound);
  });

  it('every line of it can be told', () => {
    for (const e of play()) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });
});

describe('something she sets out to do announces itself', () => {
  it('tells the result underneath the intent', () => {
    const s = scenario({ at: 'halo_floor', seed: 'grp-arm', competence: 0.5, setup: (w) => { w.hero.cash = 200; } });
    const offered = s.offers().find((k) => k.startsWith('armwrestle:'));
    expect(offered, `on offer: ${s.offers().join(', ')}`).toBeDefined();
    const events = s.do(offered!);
    expect(events[0]!.type).toBe('intent');
    expect(events[0]!.data.variant).toBe('armwrestle');
    expect(events[0]!.id).toBeDefined();
    const result = events.find((e) => e.type === 'arm_wrestle')!;
    expect(result.in).toBe(events[0]!.id);
    expect(render(events[0]!, { rng: new Rng('t'), personality: s.w.hero.personality, realName: 'X' })[0]!.text).toContain(String(events[0]!.data.npc));
  });

  it('nests a fight that comes out of it one level deeper', () => {
    const s = scenario({ at: 'halo_floor', seed: 'grp-nest', competence: 0.5 });
    const events = s.run((c) => {
      c.nest!('intent', 'mixed', { variant: 'threaten', npc: 'Someone' }, () => {
        fight(c, spawnGroup(c, 'mugger', 1), { cause: 'a test', joiners: false });
      });
    }, always());
    expect(depths(events).slice(0, 3)).toEqual([0, 1, 2]);
  });
});

describe('over whole nights', () => {
  const nights = ['grp-a', 'grp-b', 'grp-c', 'grp-d'].map((seed) => runToEnd({ seed, competence: 0.4 }).events);

  it('every group is opened before anything is put in it, in the same beat', () => {
    for (const events of nights) {
      const seen = new Map<string, GameEvent>();
      for (const e of events) {
        if (e.in !== undefined) {
          const parent = seen.get(e.in);
          expect(parent, `${e.type} in ${e.in}`).toBeDefined();
          expect(parent!.beat).toBe(e.beat);
        }
        if (e.id) seen.set(e.id, e);
      }
    }
  });

  it('every event, nested or not, has something to say', () => {
    for (const e of nights.flat()) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });

  it('groups are real: some of the night is nested', () => {
    const all = nights.flat();
    expect(all.some((e) => e.type === 'intent')).toBe(true);
    expect(all.some((e) => e.in !== undefined)).toBe(true);
    expect(byId(all).size).toBeGreaterThan(0);
  });
});
