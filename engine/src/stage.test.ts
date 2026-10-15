import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { createRun, step } from './run';
import { ACT_SKILL, CALLING, fameFrom, freshness, passionBias, prestige, stageCandidates, tickVenues, tipScale } from './stage';
import { mindAfter, mindBefore, goalLabel } from './goals';
import { pursuitTick } from './pursuit';
import { spawnNpc } from './content/archetypes';
import type { Goal, Npc } from './types';
import { addNpc, moveNpc } from './population';
import { isFairGame } from './people';

const world = (seed: string, traits: Parameters<typeof personalityFrom>[0] = {}, competence = 0.8): World =>
  createWorld({ seed, competence, personality: personalityFrom(traits) });
const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};
const npc = (w: World, id: string, archetype: string, loc: string, extra: Partial<Npc> = {}): Npc => {
  const n = Object.assign(spawnNpc(new Rng(id), id, archetype, loc, {}), extra);
  addNpc(w, n);
  return n;
};
const clearRoom = (w: World, loc: string, keep: string[] = []) => {
  for (const n of Object.values(w.npcs)) if (n.locationId === loc && !keep.includes(n.id)) moveNpc(w, n, '_gone');
};

describe('crowds get tired of her', () => {
  it('each act wears out the crowd for that skill, a bit less for the others, and it comes back with time', () => {
    const w = world('tired');
    w.hero.locationId = 'halo_floor';
    const { c } = ctxOf(w, 't');
    expect(freshness(w, 'halo_floor', 'vocals')).toBe(1);
    fameFrom(c, 1, 'karaoke');
    const afterOne = freshness(w, 'halo_floor', 'vocals');
    expect(afterOne).toBeLessThan(0.8);
    fameFrom(c, 1, 'karaoke');
    expect(freshness(w, 'halo_floor', 'vocals')).toBeLessThan(afterOne);
    // Another skill is hardly touched, and another place not at all.
    expect(freshness(w, 'halo_floor', 'djing')).toBeGreaterThan(freshness(w, 'halo_floor', 'vocals'));
    expect(freshness(w, 'street_main', 'vocals')).toBe(1);
    const tired = freshness(w, 'halo_floor', 'vocals');
    for (let i = 0; i < 60; i++) tickVenues(w);
    expect(freshness(w, 'halo_floor', 'vocals')).toBeGreaterThan(tired);
    for (let i = 0; i < 400; i++) tickVenues(w);
    expect(freshness(w, 'halo_floor', 'vocals')).toBe(1);
    expect(w.locations.halo_floor!.fatigue).toBeUndefined();
  });

  it('repeating an act in the same place pays less each time; somewhere new pays more; bigger stages pay more', () => {
    const w = world('diminish');
    const { c } = ctxOf(w, 'd');
    w.hero.locationId = 'halo_floor';
    const gains = Array.from({ length: 5 }, () => fameFrom(c, 1, 'karaoke'));
    for (let i = 1; i < gains.length; i++) expect(gains[i]!).toBeLessThan(gains[i - 1]!);
    expect(gains[4]!).toBeLessThan(gains[0]! * 0.5);
    w.hero.locationId = 'street_main';
    expect(fameFrom(c, 1, 'sing_busk')).toBeGreaterThan(gains[4]!);
    w.hero.locationId = 'neon_pharaoh';
    expect(prestige(w.locations.neon_pharaoh!)).toBeGreaterThan(prestige(w.locations.halo_floor!));
    expect(prestige(w.locations.halo_floor!)).toBeGreaterThan(prestige(w.locations.street_main!));
  });

  it('tips shrink too, and she says so', () => {
    const w = world('tips');
    w.hero.locationId = 'halo_floor';
    const { c, events } = ctxOf(w, 'tp');
    expect(tipScale(w, 'karaoke')).toBe(1);
    for (let i = 0; i < 6; i++) {
      w.beat += 13;
      fameFrom(c, 1, 'karaoke');
    }
    expect(tipScale(w, 'karaoke')).toBeLessThan(0.75);
    expect(events.some((e) => e.type === 'crowd_tired')).toBe(true);
    expect(tipScale(w, 'billboard')).toBe(1);
  });

  it('puts her off doing it again right there, but not somewhere else', () => {
    const w = world('off');
    w.hero.locationId = 'halo_floor';
    const { c } = ctxOf(w, 'o');
    const fresh = passionBias(w, { key: 'karaoke' });
    for (let i = 0; i < 4; i++) fameFrom(c, 1, 'karaoke');
    const tired = passionBias(w, { key: 'karaoke' });
    expect(tired).toBeLessThan(fresh - 1.5);
    w.hero.locationId = 'street_main';
    expect(passionBias(w, { key: 'sing_busk' })).toBeGreaterThan(tired + 1);
  });
});

describe('more to do with a voice, a guitar, a deck', () => {
  const keys = (w: World) => stageCandidates(w).map((x) => x.key);

  it('a voice on the street, a mic at the club, a song for someone, a battle in the bar, a set for the kids', () => {
    const w = world('acts');
    w.hero.locationId = 'street_main';
    clearRoom(w, 'street_main');
    expect(keys(w)).toContain('sing_busk');
    w.hero.locationId = 'neon_pharaoh';
    expect(keys(w).some((k) => k.startsWith('crash_gig:'))).toBe(true);
    w.hero.locationId = 'halo_floor';
    npc(w, 'rowdy1', 'ganger', 'halo_floor', { tags: ['rowdy', 'ganger'] });
    expect(keys(w).some((k) => k.startsWith('beat_battle:'))).toBe(true);
    expect(keys(w).some((k) => k.startsWith('serenade_girl:'))).toBe(true);
    w.hero.locationId = 'club_backlot';
    clearRoom(w, 'club_backlot');
    expect(keys(w)).not.toContain('backlot_set');
    npc(w, 'kid1', 'street_kid', 'club_backlot');
    expect(keys(w)).toContain('backlot_set');
    w.hero.locationId = 'club_greenroom';
    clearRoom(w, 'club_greenroom');
    npc(w, 'bandy', 'bandmate', 'club_greenroom', { tags: ['band'] });
    expect(keys(w).some((k) => k.startsWith('guitar_duel:'))).toBe(true);
  });

  it('people you are already close to are not fresh targets', () => {
    const w = world('limits');
    w.hero.locationId = 'halo_floor';
    npc(w, 'friend', 'ganger', 'halo_floor', { tags: ['rowdy', 'ganger'], affinity: 40 });
    expect(keys(w).some((k) => k === 'beat_battle:friend')).toBe(false);
    for (const n of Object.values(w.npcs)) if (isFairGame(n) && n.locationId === 'halo_floor') n.affinity = 60;
    expect(keys(w).some((k) => k.startsWith('serenade_girl:'))).toBe(false);
  });

  it('they work, and they train the skill they belong to', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const w = world(`run${i}`, {}, 0.9);
      w.hero.charm = 8;
      const place: [string, string][] = [['street_main', 'sing_busk'], ['neon_pharaoh', 'crash_gig:kilobyte'], ['halo_floor', 'serenade_girl'], ['halo_floor', 'beat_battle'], ['club_backlot', 'backlot_set'], ['club_greenroom', 'guitar_duel']];
      for (const [loc, key] of place) {
        w.hero.locationId = loc;
        if (loc === 'club_backlot') npc(w, `k${i}`, 'street_kid', loc);
        if (loc === 'halo_floor') npc(w, `r${i}`, 'ganger', loc, { tags: ['rowdy', 'ganger'], affinity: 0 });
        if (loc === 'club_greenroom') {
          npc(w, `b${i}`, 'bandmate', loc, { tags: ['band'] });
          w.hero.inventory.push({ id: 'g', name: 'guitar', kind: 'loot', power: 0, value: 1, tags: ['instrument'] });
        }
        const cand = stageCandidates(w).find((x) => x.key.startsWith(key));
        if (!cand) continue;
        const { c, events } = ctxOf(w, `${i}${key}`);
        cand.run(c);
        for (const e of events) {
          if (e.type === key.split(':')[0]) seen.add(`${e.type}:${e.data.variant}`);
          expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        }
      }
    }
    for (const k of ['sing_busk:tips', 'crash_gig:stole_the_show', 'serenade_girl:swoon', 'serenade_girl:cringe', 'beat_battle:won', 'beat_battle:lost', 'backlot_set:rave', 'guitar_duel:won', 'guitar_duel:lost']) expect(seen.has(k), k).toBe(true);
  });
});

describe('a calling', () => {
  const big = (w: World, fam: string, gained: number, extra: GameEvent[] = []) => {
    const { c, events } = ctxOf(w, `big${fam}`);
    const snap = mindBefore(w);
    w.hero.fame += gained;
    mindAfter(c, { key: fam, drives: {}, run() {} }, snap, [{ beat: w.beat, type: fam, outcome: 'good', data: {} }, ...extra]);
    return events;
  };

  it('a big showing from someone who can sing lights her up, and her fame goal becomes a calling', () => {
    let lit = 0;
    for (let i = 0; i < 40; i++) {
      const w = world(`calling${i}`, { artistry: 0.9, fame: 0.9, impulsive: 0.7 });
      w.hero.skills.vocals = 40;
      const events = big(w, 'karaoke', 2.5);
      if (w.mind.passion?.skill === 'vocals') {
        lit++;
        expect(events.some((e) => e.type === 'passion' && hasTemplate(e))).toBe(true);
        const g = w.mind.goals.find((x) => x.kind === 'fame')!;
        expect(g.mode).toBe('vocals');
        expect(goalLabel(w, g)).toBe(CALLING.vocals);
      }
    }
    expect(lit).toBeGreaterThan(12);
  });

  it('a fluke from a novice is not a calling', () => {
    for (let i = 0; i < 30; i++) {
      const w = world(`fluke${i}`, { artistry: 0.9, fame: 0.9 });
      big(w, 'karaoke', 2.5);
      expect(w.mind.passion).toBeUndefined();
    }
  });

  it('feeds on success, starves on flops, and fades with time', () => {
    const w = world('feed');
    w.mind.passion = { skill: 'vocals', level: 0.5, since: 0 };
    big(w, 'karaoke', 1);
    expect(w.mind.passion!.level).toBeGreaterThan(0.55);
    const { c } = ctxOf(w, 'flop');
    const snap = mindBefore(w);
    const lvl = w.mind.passion!.level;
    mindAfter(c, { key: 'karaoke', drives: {}, run() {} }, snap, [{ beat: w.beat, type: 'karaoke', outcome: 'bad', data: {} }]);
    expect(w.mind.passion!.level).toBeLessThan(lvl);
    for (let i = 0; i < 400; i++) tickVenues(w);
    expect(w.mind.passion).toBeUndefined();
  });

  it('draws her to every act of that skill, and a calling goal picks those acts over the others', () => {
    const w = world('draw');
    w.mind.passion = { skill: 'vocals', level: 0.8, since: 0 };
    w.hero.locationId = 'halo_alley';
    for (const l of ['halo_floor', 'street_main', 'neon_pharaoh', 'club_backlot', 'club_greenroom']) w.locations[l]!.visits = 1;
    expect(passionBias(w, { key: 'sing_busk' })).toBeGreaterThan(1.5);
    expect(passionBias(w, { key: 'dj_set' })).toBe(0);
    const picks: Record<string, number> = {};
    for (let i = 0; i < 40; i++) {
      const w2 = world(`calldraw${i}`);
      w2.mind.passion = { skill: 'vocals', level: 0.8, since: 0 };
      w2.hero.locationId = 'halo_alley';
      for (const l of ['halo_floor', 'street_main', 'neon_pharaoh', 'club_backlot', 'club_greenroom']) w2.locations[l]!.visits = 1;
      const g = { id: 1, kind: 'fame', parent: null, amount: 50, mode: 'vocals', why: 't', desire: 0.8, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 } as Goal;
      w2.mind.goals.push(g);
      pursuitTick(ctxOf(w2, `c${i}`).c, g);
      const act = g.pursuit?.act ?? 'none';
      picks[ACT_SKILL[act] ?? act] = (picks[ACT_SKILL[act] ?? act] ?? 0) + 1;
    }
    expect((picks.vocals ?? 0)).toBeGreaterThan(30);
  });
});

describe('in the sim', () => {
  it('callings happen, she moves around while she has one, and she does not sing in one place forever', () => {
    let ignites = 0;
    let done = 0;
    let longestRun = 0;
    let nights = 0;
    for (let i = 0; i < 40; i++) {
      const { world: w, events } = createRun({ seed: `stg-${i}`, competence: 0.8, personality: personalityFrom({ artistry: 0.9, fame: 0.9, vanity: 0.7 }) });
      let run = 0;
      let last = '';
      for (let k = 0; k < 400 && !w.over; k++) {
        const ev = step(w);
        events.push(...ev);
        const sang = ev.find((e) => e.type === 'karaoke');
        if (sang) {
          const key = `${w.hero.locationId}`;
          run = key === last ? run + 1 : 1;
          last = key;
          longestRun = Math.max(longestRun, run);
        }
      }
      nights++;
      ignites += events.filter((e) => e.type === 'passion').length;
      done += events.filter((e) => e.type === 'goal_done' && e.data.kind === 'fame').length;
    }
    expect(nights).toBe(40);
    expect(ignites).toBeGreaterThan(8);
    expect(done).toBeGreaterThan(10);
    expect(longestRun).toBeLessThan(20); // fights now drive her off the floor a little less, so the odd long set is possible
  });
});
