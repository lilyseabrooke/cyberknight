import { describe, expect, it } from 'vitest';
import { Rng, personalityFrom, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { MAX_LEADERS, crowdAround, moveCrowd } from './crowd';
import { assistMult, statsOf, withAssist } from './npcstats';
import { followersOf } from './influence';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';

const ctxOf = (w: World, seed: string) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

/** Strand Street with nobody on it but `n` people she could move. */
function bigStreet(seed: string, n: number): World {
  const w = createWorld({ seed, competence: 0.8, personality: personalityFrom({}) });
  w.hero.locationId = 'street_main';
  for (const x of Object.values(w.npcs)) if (x.locationId === 'street_main') moveNpc(w, x, '_gone');
  for (let i = 0; i < n; i++) addNpc(w, spawnNpc(new Rng(`listener_${i}`), `listener_${i}`, 'patron', 'street_main', {}));
  return w;
}

const LOUD = { depth: 1, stretch: 1, edge: 0.3, voice: 8 };

describe('moving a crowd', () => {
  it('everyone in earshot can be asked; nobody there, nothing happens', () => {
    expect(crowdAround(bigStreet('ears', 5)).length).toBe(5);
    expect(moveCrowd(ctxOf(bigStreet('empty', 0), 'e').c, LOUD)).toBeNull();
  });

  it('moves any number of people but only simulates a handful; the rest follow one of them, spread evenly', () => {
    let sawFollowers = 0;
    for (let i = 0; i < 20; i++) {
      const w = bigStreet(`legion-${i}`, 50);
      const moved = moveCrowd(ctxOf(w, `l${i}`).c, LOUD)!;
      const leaders = (w.influenced ?? []).map((id) => w.npcs[id]!);
      expect(leaders.length).toBe(moved.lead);
      expect(leaders.length).toBeLessThanOrEqual(MAX_LEADERS);
      const followers = leaders.flatMap((l) => followersOf(w, l.goals![0]));
      expect(leaders.length + followers.length).toBe(moved.count);
      for (const f of followers) expect(f.goals ?? []).toEqual([]);
      if (moved.count > MAX_LEADERS) {
        sawFollowers++;
        const sizes = leaders.map((l) => l.goals![0]!.followers?.length ?? 0);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
    expect(sawFollowers).toBeGreaterThan(10);
  });

  it('a bigger voice moves more of them', () => {
    let more = 0;
    for (let i = 0; i < 20; i++) {
      const quiet = moveCrowd(ctxOf(bigStreet(`v${i}`, 20), `v${i}`).c, { ...LOUD, voice: 0, edge: 0 })?.count ?? 0;
      const loud = moveCrowd(ctxOf(bigStreet(`v${i}`, 20), `v${i}`).c, LOUD)?.count ?? 0;
      if (loud > quiet) more++;
    }
    expect(more).toBeGreaterThan(12);
  });

  it('a following makes whoever leads it stronger while they act, and only then', () => {
    expect(assistMult(0)).toBe(1);
    expect(assistMult(8)).toBeGreaterThan(assistMult(1));
    const w = bigStreet('assist', 1);
    const n = w.npcs.listener_0!;
    const base = { ...statsOf(n) };
    let inside = 0;
    withAssist(n, 7, () => { inside = statsOf(n).muscle; });
    expect(inside).toBeGreaterThan(base.muscle);
    expect(statsOf(n)).toEqual(base);
  });
});
