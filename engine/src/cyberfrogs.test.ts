import { describe, expect, it } from 'vitest';
import { always, never, scenario, search } from './testkit';
import { Rng } from './rng';
import { render } from './text';
import { FROGS, FROG_COUNT, LINES, LINE_SIZE, EDITIONS, frogTitle, frogName } from './content/cyberfrogs';
import { frogAt, frogCandidates, frogWatch, liveFrogs, shelfSize } from './cyberfrogs';
import { goalLabel } from './goals';
import { hasGoal } from './mind';
import { addSpot, childId } from './mapgen';
import { kill, relocate } from './combat';
import { garrisonAlive } from './dungeons';
import { beginRun, endRun, newUniverse, upgradeUniverse } from './universe';
import type { Frog, GameEvent, Id, World } from './types';

const text = (w: World, evs: GameEvent[]): string =>
  evs.flatMap((e) => render(e, { rng: new Rng('r'), personality: w.hero.personality, realName: 'B P' }).map((l) => l.text)).join('\n');

/** A frog lying at `loc`, as `kind`. */
function lay(w: World, loc: Id, over: Partial<Frog> = {}): Frog {
  const f: Frog = { char: 0, edition: 'initial', kind: 'street', loc, ...over };
  (w.frogs ??= {})[loc] = f;
  return f;
}

/** A street with Blackbird on it and a neighbour to put a frog on. */
function onStreet() {
  const sc = scenario({ seed: 'frogs', at: 'street_main' });
  const w = sc.w;
  const next = w.locations[w.hero.locationId]!.exits.find((e) => !e.hidden && w.locations[e.to])!.to;
  // Nothing else lying about, so the test is about the one it lays.
  const roll = (id: Id) => ((w.frogs ??= {})[id] ??= null);
  for (const id of Object.keys(w.locations)) roll(id);
  return { sc, w, here: w.hero.locationId, next };
}

describe('the Cyberfrogs themselves', () => {
  it('are 121, in 11 lines of 11, every one with a name, gear, a bio and nothing unfilled', () => {
    expect(FROG_COUNT).toBe(121);
    expect(LINES.length * LINE_SIZE).toBe(121);
    const names = new Set<string>();
    FROGS.forEach((f, i) => {
      expect(f.line, f.name).toBe(Math.floor(i / LINE_SIZE));
      expect(f.name.length, f.name).toBeGreaterThan(1);
      expect(f.gear.length, f.name).toBeGreaterThan(3);
      expect(f.bio.length, f.name).toBeGreaterThan(30);
      expect(`${f.name}${f.gear}${f.bio}`, f.name).not.toMatch(/[{}]|undefined/);
      expect(names.has(f.name), `${f.name} twice`).toBe(false);
      names.add(f.name);
    });
    for (const e of EDITIONS) expect(e.weight).toBeGreaterThan(0);
    // They have pronouns, and the bios use them.
    const PRON = { man: /\b(he|his|him)\b/i, woman: /\b(she|her|hers)\b/i, nonbinary: /\b(they|their|them)\b/i, none: /\b(it|its)\b/i };
    for (const f of FROGS) expect(f.bio, f.name).toMatch(PRON[f.gender]);
    // Ribbit's grandmother Croaky fought in the war; which war is not said.
    const croaky = FROGS.find((f) => f.name === 'Croaky')!;
    expect(croaky.gender).toBe('woman');
    expect(croaky.bio).toMatch(/fought in the War/);
    expect(croaky.bio).toMatch(/grandmother of Ribbit/);
    expect(FROGS.find((f) => f.name === 'Ribbit')!.bio).toMatch(/Croaky/);
    expect(frogName(0)).toBe('Cyberfrog Donald with a sword');
    expect(frogTitle(0, 'initial')).toBe('Cyberfrog Donald with a sword from the limited initial run');
  });
});

describe('sensing one', () => {
  it('she feels a frog a door or two away, guesses who, and wants it above her other goals', () => {
    const { sc, w, next } = onStreet();
    const f = lay(w, next, { char: 1 }); // Jasmine
    expect(frogAt(w, next)).toBe(f);
    // Fill her plate with plans she cares about.
    w.mind.goals.push(
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: 100 + i, kind: 'cash' as const, parent: null, amount: 100 * i, why: 'x', desire: 0.9, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 })),
    );
    w.mind.nextId = 200;
    const evs = sc.step();
    expect(f.sensed).toBe(true);
    expect(f.guess).toBeDefined();
    expect(hasGoal(w, 'frog', next)).toBe(true);
    const g = w.mind.goals.find((x) => x.kind === 'frog')!;
    expect(g.parent).toBeNull();
    expect(goalLabel(w, g)).toMatch(/Cyberfrog she can feel/);
    expect(evs.some((e) => e.type === 'goal_drop' && e.data.variant === 'overloaded')).toBe(true);
    const said = text(w, evs);
    expect(said).toMatch(/sense Cyberfrog|feel one|There is a Cyberfrog close|Cyberfrog\. Nearby|Cyberfrog\. I sense/);
    expect(said).toContain(`Cyberfrog ${FROGS[f.guess!]!.name}`);
    expect(said).not.toMatch(/\{|\}|undefined|\[goal_new/);
  });

  it('does not feel one out of range, and does not sense the same one twice', () => {
    const { sc, w } = onStreet();
    // Somewhere more than two doors away.
    const dist = new Map<Id, number>([[w.hero.locationId, 0]]);
    for (let q = [w.hero.locationId]; q.length; ) {
      const id = q.shift()!;
      for (const e of [...w.locations[id]!.exits, ...(w.locations[id]!.links ?? [])]) {
        if (!dist.has(e.to) && w.locations[e.to]) {
          dist.set(e.to, dist.get(id)! + 1);
          q.push(e.to);
        }
      }
    }
    const far = [...dist].find(([, d]) => d >= 4)![0];
    lay(w, far);
    sc.run((c) => frogWatch(c));
    expect(liveFrogs(w).every((f) => !f.sensed)).toBe(true);
    const f = lay(w, w.locations[w.hero.locationId]!.exits[0]!.to);
    const first = sc.run(() => 0);
    expect(first).toEqual([]);
    const sensed = frogWatch(sc.ctx());
    expect(f.sensed).toBe(true);
    expect(sensed.map((x) => x.frog)).toEqual([f]);
    // (With no goal made for it, she'd go back to it; but she doesn't feel it for the first time again.)
    expect(frogWatch(sc.ctx()).filter((x) => x.how === 'sense')).toEqual([]);
  });

  it('knows exactly which one it is once she can see it (and is a little put out if she was wrong)', () => {
    const { sc, w, here } = onStreet();
    const f = lay(w, here, { char: 12, sensed: true, guess: 13 });
    const evs = sc.run((c) => frogWatch(c));
    expect(f.seen).toBe(true);
    const said = text(w, evs);
    expect(said).toContain(FROGS[12]!.name);
    expect(said).toContain(FROGS[13]!.name);
  });
});

describe('getting one', () => {
  it('a frog in the street is hers for the taking, and goes straight to the lab', () => {
    const { sc, w, here } = onStreet();
    const f = lay(w, here, { char: 0, edition: 'initial' });
    expect(sc.offers()).toContain(`frog:${here}`);
    const evs = sc.do(`frog:${here}`, always());
    expect(f.state).toBe('taken');
    expect(w.legacy.frogs!['0']).toMatchObject({ count: 1, editions: ['initial'] });
    expect(shelfSize(w)).toBe(1);
    expect(w.counters.frogs_got).toBe(1);
    expect(sc.offers()).not.toContain(`frog:${here}`);
    const said = text(w, evs);
    expect(said).toContain('Cyberfrog Donald with a sword from the limited initial run');
    expect(said).toMatch(/lab/);
    expect(said).not.toMatch(/\{|\}|undefined/);
    // The goal is done the next time she thinks.
    w.mind.goals.push({ id: 500, kind: 'frog', parent: null, loc: here, why: 'x', desire: 0.97, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });
    const after = sc.step();
    expect(hasGoal(w, 'frog', here)).toBe(false);
    expect(after.some((e) => e.type === 'goal_done' && e.data.variant === 'collected')).toBe(true);
  });

  it('keeps a count of duplicates and a shelf of editions', () => {
    const { sc, w, here } = onStreet();
    lay(w, here, { char: 5, edition: 'glow' });
    sc.do(`frog:${here}`);
    lay(w, here, { char: 5, edition: 'chrome' });
    sc.do(`frog:${here}`);
    expect(w.legacy.frogs!['5']).toMatchObject({ count: 2, editions: ['glow', 'chrome'] });
    expect(shelfSize(w)).toBe(1);
    expect(w.counters.frogs_got).toBe(2);
    expect(w.counters.frogs_dupes).toBe(1);
  });

  it('a trap hurts: the car runs her over, and the crew that set it is on her', () => {
    const { sc, w, here } = onStreet();
    const f = lay(w, here, { kind: 'trap', trap: 'car' });
    w.hero.hp = w.hero.maxHp;
    const hp = w.hero.hp;
    const evs = sc.do(`frog:${here}`, never());
    expect(w.hero.hp).toBeLessThan(hp);
    expect(evs.some((e) => e.type === 'frog' && e.data.variant === 'trap_hit')).toBe(true);
    expect(evs.some((e) => e.type === 'vehicle_attack')).toBe(true);
    expect(['taken', 'lost']).toContain(f.state);
    expect(text(w, evs)).not.toMatch(/\{|\}|undefined/);
  });

  it('a trap she sees through and dodges leaves her with the frog and no bruise from the car', () => {
    const { sc, w, here } = onStreet();
    const f = lay(w, here, { kind: 'trap', trap: 'car' });
    const evs = sc.do(`frog:${here}`, always());
    expect(evs.some((e) => e.type === 'frog' && e.data.variant === 'trap_dodge')).toBe(true);
    expect(f.state).toBe('taken');
  });

  it('theft with the keeper looking goes wrong; with a quiet hand, it does not', () => {
    const sc = scenario({ seed: 'frog-theft', at: 'halo_floor' });
    const w = sc.w;
    const f = lay(w, 'halo_floor', { kind: 'theft', shelf: 'behind the counter' });
    const evs = sc.do('frog:halo_floor', never());
    expect(evs.some((e) => e.type === 'frog' && e.data.variant === 'theft_caught')).toBe(true);
    expect(evs.some((e) => e.type === 'fight_start')).toBe(true);
    const sc2 = scenario({ seed: 'frog-theft', at: 'halo_floor' });
    const f2 = lay(sc2.w, 'halo_floor', { kind: 'theft', shelf: 'behind the counter' });
    const evs2 = sc2.do('frog:halo_floor', always());
    expect(evs2.some((e) => e.type === 'frog' && e.data.variant === 'theft_ok')).toBe(true);
    expect(f2.state).toBe('taken');
    expect(f.state === undefined || f.state === 'taken').toBe(true);
  });

  it('a climb can throw her off, and she gets better at it', () => {
    const { sc, w, here } = onStreet();
    const f = lay(w, here, { kind: 'climb', perch: 'the top of a lamp post' });
    w.hero.hp = w.hero.maxHp;
    const evs = sc.do(`frog:${here}`, never());
    expect(f.state).toBeUndefined();
    expect(f.tries).toBe(1);
    expect(w.hero.hp).toBeLessThan(w.hero.maxHp);
    expect(text(w, evs)).toContain('lamp post');
    sc.do(`frog:${here}`, always());
    expect(f.state).toBe('taken');
  });

  it('a frog at the back of a hideout is only on offer once the people holding the room are gone', () => {
    const sc = scenario({ seed: 'frog-vault', at: 'street_main' });
    const w = sc.w;
    const street = w.locations[childId('street_main', 0)]!;
    const e = addSpot(w, street, 'scrapper_camp', 60, 2);
    relocate(w, e.id);
    const f = lay(w, e.id, { kind: 'vault' });
    const d = w.dungeons[e.id]!;
    expect(garrisonAlive(w, d).length).toBeGreaterThan(0);
    expect(frogCandidates(w)).toEqual([]);
    sc.run((c) => { for (const n of garrisonAlive(w, d)) kill(c, w, n, 'test'); });
    expect(sc.offers()).toContain(`frog:${e.id}`);
    sc.do(`frog:${e.id}`);
    expect(f.state).toBe('taken');
  });
});

describe('the lab keeps them', () => {
  it('the shelf survives the night, the death, and the next body', () => {
    const u = newUniverse('frog-shelf');
    const w = beginRun(u, { seed: 'frog-shelf#a' });
    const loc = w.hero.locationId;
    lay(w, loc, { char: 77, edition: 'sealed' });
    const sc = scenario({ seed: 'unused' });
    expect(sc).toBeTruthy();
    const c = { w, rng: new Rng('x'), emit: () => {}, nest: (_a: string, _b: string, _c: object, fn: () => void) => fn() } as never;
    const cand = frogCandidates(w)[0]!;
    cand.run(c);
    w.over = true;
    w.ending = 'dead';
    const next = endRun(w);
    expect(next.legacy.frogs!['77']).toMatchObject({ count: 1, editions: ['sealed'] });
    expect(next.legacy.report?.frogs).toEqual({ got: 1, owned: 1, dupes: 0 });
    const w2 = beginRun(next, { seed: 'frog-shelf#b' });
    expect(shelfSize(w2)).toBe(1);
    expect(w2.frogs).toBeUndefined();
  });

  it('an old save that has never seen a frog gets an empty shelf', () => {
    const u = newUniverse('frog-old');
    delete u.legacy.frogs;
    upgradeUniverse(u);
    expect(u.legacy.frogs).toEqual({});
  });
});

describe('across whole nights', () => {
  it('frogs turn up, she feels them and goes for them, and some of them end up on the shelf', () => {
    const r = search({ want: ['goal_new:frog_sense', 'goal_done:collected', 'frog:collect', 'frog:lab'], prefix: 'frogs-night', max: 14 });
    expect(r.missing).toEqual([]);
    for (const w of r.worlds) for (const f of liveFrogs(w)) expect(f.char).toBeLessThan(FROG_COUNT);
  });
});
