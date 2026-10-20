import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { addDungeon, childId } from './mapgen';
import { relocate } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { checkCleared, enterRoom, garrisonAlive, roomOf, standing } from './dungeons';
import { awareness, bucketOf } from './stealth';
import {
  advanceHabits,
  angDiff,
  dirOf,
  exposure,
  lightAt,
  makeNoise,
  makeUnit,
  prowlBoard,
  sightGain,
  takedownChance,
  useProp,
  type Board,
  type Light,
  type Posture,
  type PUnit,
} from './prowl';
import { PROPS } from './content/props';
import type { Terrain, Grid, Pos } from './grid';
import type { Ctx, GameEvent, Location, Npc, World } from './types';

/** ".": floor, "#": wall, "c": cover, "E": an exit. */
const gridOf = (rows: string[]): Grid => {
  const h = rows.length;
  const w = rows[0]!.length;
  const cells: Terrain[] = [];
  const exits: Pos[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      cells.push(ch === '#' ? 'wall' : ch === 'c' ? 'cover' : ch === 'E' ? 'exit' : 'floor');
      if (ch === 'E') exits.push({ x, y });
    }),
  );
  return { w, h, cells, exits };
};

const mk = (seed = 'pb') => {
  const sc = scenario({ seed, at: 'street_main', competence: 0.5 });
  const w = sc.w;
  w.hero.stealth = true;
  return { sc, w };
};
const guard = (w: World, id: string, archetype = 'gang_runner'): Npc => {
  const n = spawnNpc(new Rng(id), id, archetype, w.hero.locationId);
  n.level = 3;
  addNpc(w, n);
  return n;
};
const ctxOf = (w: World, seed = 'pc') => {
  const events: GameEvent[] = [];
  const c: Ctx = { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) };
  return { c, events };
};
/** A board with the people placed where the test says. */
const boardOf = (w: World, rows: string[], units: { npc: Npc; at: Pos; facing: number; route?: Pos[] }[], hero: Pos, light: Light = 1): Board => {
  const grid = gridOf(rows);
  return {
    w,
    grid,
    light: Array<Light>(grid.w * grid.h).fill(light),
    units: units.map((u) => makeUnit(u.npc, u.at, u.facing, u.route ? { route: u.route } : {})),
    hero,
    posture: 'sneak',
    props: [],
    bodies: [],
    round: 1,
    dark: [],
    role: 'test',
  };
};
const E = 2; // east
const W = 6;
const N = 0;
const gain = (b: Board, u: PUnit, at: Pos, p: Posture = 'walk') => sightGain(b, u, at, p);

const OPEN = ['E.......', '........', '........', '........', '........'];

describe('directions', () => {
  it('points from one tile at another, and measures how far apart two ways are', () => {
    expect(dirOf({ x: 2, y: 2 }, { x: 5, y: 2 })).toBe(E);
    expect(dirOf({ x: 2, y: 2 }, { x: 2, y: 0 })).toBe(N);
    expect(dirOf({ x: 2, y: 2 }, { x: 0, y: 2 })).toBe(W);
    expect(angDiff(E, W)).toBe(4);
    expect(angDiff(N, 7)).toBe(1);
  });
});

describe('what they can see', () => {
  it('sees her in front of them and not behind, and not through a wall', () => {
    const { w } = mk();
    const b = boardOf(w, OPEN, [{ npc: guard(w, 'g'), at: { x: 3, y: 2 }, facing: E }], { x: 0, y: 4 });
    const u = b.units[0]!;
    expect(gain(b, u, { x: 5, y: 2 })).toBeGreaterThan(0);
    expect(gain(b, u, { x: 1, y: 2 })).toBe(0);
    const walled = boardOf(w, ['E.......', '....#...', '....#...', '........', '........'], [{ npc: guard(w, 'g2'), at: { x: 3, y: 1 }, facing: E }], { x: 0, y: 4 });
    expect(gain(walled, walled.units[0]!, { x: 6, y: 1 })).toBe(0);
  });

  it('sees less of her the less she moves, the further she is and the darker it is', () => {
    const { w } = mk();
    const b = boardOf(w, OPEN, [{ npc: guard(w, 'g'), at: { x: 1, y: 2 }, facing: E }], { x: 0, y: 4 });
    const u = b.units[0]!;
    const at = { x: 3, y: 2 };
    expect(gain(b, u, at, 'hold')).toBeLessThan(gain(b, u, at, 'sneak'));
    expect(gain(b, u, at, 'sneak')).toBeLessThan(gain(b, u, at, 'walk'));
    expect(gain(b, u, at, 'walk')).toBeLessThan(gain(b, u, at, 'dash'));
    expect(gain(b, u, { x: 6, y: 2 })).toBeLessThan(gain(b, u, at));
    const dark = boardOf(w, OPEN, [{ npc: guard(w, 'g3'), at: { x: 1, y: 2 }, facing: E }], { x: 0, y: 4 }, 0);
    const lit = boardOf(w, OPEN, [{ npc: guard(w, 'g4'), at: { x: 1, y: 2 }, facing: E }], { x: 0, y: 4 }, 2);
    expect(gain(dark, dark.units[0]!, at)).toBeLessThan(gain(lit, lit.units[0]!, at));
    expect(lightAt(dark, at)).toBe(0);
  });

  it('cannot see her holding still behind cover, but will find her if they come up to it', () => {
    const { w } = mk();
    const b = boardOf(w, ['E.......', '........', '..c.....', '........', '........'], [{ npc: guard(w, 'g'), at: { x: 0, y: 2 }, facing: E }], { x: 0, y: 4 });
    const u = b.units[0]!;
    // (the cover is at 2,2; she is on the far side of it)
    expect(gain(b, u, { x: 3, y: 2 }, 'hold')).toBe(0);
    expect(gain(b, u, { x: 3, y: 2 }, 'walk')).toBeGreaterThan(0);
    u.x = 2;
    u.y = 1;
    u.facing = 4;
    expect(gain(b, u, { x: 3, y: 2 }, 'hold')).toBeGreaterThan(0);
  });

  it('a sharper guard sees more of her', () => {
    const { w } = mk();
    const dull = guard(w, 'dull');
    dull.level = 1;
    const keen = guard(w, 'keen');
    keen.level = 40;
    const b = boardOf(w, OPEN, [{ npc: dull, at: { x: 1, y: 1 }, facing: E }, { npc: keen, at: { x: 1, y: 3 }, facing: E }], { x: 0, y: 4 });
    expect(gain(b, b.units[1]!, { x: 4, y: 2 })).toBeGreaterThan(gain(b, b.units[0]!, { x: 4, y: 2 }));
  });

  it('exposure adds up everyone who could see a tile', () => {
    const { w } = mk();
    const b = boardOf(w, OPEN, [{ npc: guard(w, 'a'), at: { x: 1, y: 1 }, facing: E }, { npc: guard(w, 'b'), at: { x: 1, y: 3 }, facing: E }], { x: 0, y: 4 });
    const both = exposure(b, { x: 4, y: 2 }, 'walk');
    b.units.pop();
    expect(exposure(b, { x: 4, y: 2 }, 'walk')).toBeLessThan(both);
  });
});

describe('what they can hear', () => {
  it('a dash is heard from further than a sneak, and a wall takes some of it', () => {
    const { w } = mk();
    const open = boardOf(w, OPEN, [{ npc: guard(w, 'g'), at: { x: 5, y: 2 }, facing: W }], { x: 0, y: 4 });
    expect(makeNoise(open, { x: 1, y: 2 }, 0.04)).toHaveLength(0);
    expect(makeNoise(open, { x: 1, y: 2 }, 0.4)).toHaveLength(1);
    const walled = boardOf(w, ['E..##...', '...##...', '...##...', '...##...', '...##...'], [{ npc: guard(w, 'g2'), at: { x: 5, y: 2 }, facing: W }], { x: 0, y: 4 });
    expect(makeNoise(walled, { x: 1, y: 2 }, 0.4)).toHaveLength(0);
  });

  it('a noise makes them wary and points them at where it was, without telling them where she is', () => {
    const { w } = mk();
    const g = guard(w, 'g');
    const b = boardOf(w, OPEN, [{ npc: g, at: { x: 5, y: 2 }, facing: E }], { x: 0, y: 4 });
    makeNoise(b, { x: 2, y: 2 }, 0.8);
    expect(b.units[0]!.last).toEqual({ x: 2, y: 2 });
    expect(awareness(w, g).fix).toBe(false);
    expect(bucketOf(w, g)).not.toBe('aware');
    expect(['suspicious', 'alert']).toContain(bucketOf(w, g));
  });
});

describe('how they behave', () => {
  it('a sentry at a post looks about; a patrol walks its route and stops at the ends', () => {
    const { w } = mk();
    const b = boardOf(w, OPEN, [
      { npc: guard(w, 'post'), at: { x: 5, y: 1 }, facing: E },
      { npc: guard(w, 'walker'), at: { x: 2, y: 3 }, facing: E, route: [{ x: 2, y: 3 }, { x: 6, y: 3 }] },
    ], { x: 0, y: 0 });
    const rng = new Rng('habits');
    const faced = new Set<number>();
    const where = new Set<number>();
    for (let i = 0; i < 24; i++) {
      advanceHabits(b, rng);
      faced.add(b.units[0]!.facing);
      where.add(b.units[1]!.x);
    }
    expect(faced.size).toBeGreaterThan(1);
    expect(where.size).toBeGreaterThan(3);
    expect(Math.max(...where)).toBeLessThanOrEqual(6);
  });

  it('one who is suspicious goes to see where the noise was, looks about, and goes back', () => {
    const { w } = mk();
    const g = guard(w, 'g');
    const b = boardOf(w, OPEN, [{ npc: g, at: { x: 6, y: 3 }, facing: E }], { x: 0, y: 0 });
    makeNoise(b, { x: 3, y: 3 }, 0.5);
    expect(bucketOf(w, g)).not.toBe('unaware');
    const rng = new Rng('inv');
    let reached = false;
    for (let i = 0; i < 40; i++) {
      advanceHabits(b, rng);
      if (b.units[0]!.x === 3 && b.units[0]!.y === 3) reached = true;
    }
    expect(reached).toBe(true);
    expect(b.units[0]!.behavior === 'post' || b.units[0]!.behavior === 'return').toBe(true);
  });

  it('one on alert searches the place she was last, and the tiles around it', () => {
    const { w } = mk();
    const g = guard(w, 'g');
    const b = boardOf(w, OPEN, [{ npc: g, at: { x: 7, y: 4 }, facing: W }], { x: 0, y: 0 });
    awareness(w, g).v = 0.6;
    b.units[0]!.last = { x: 3, y: 1 };
    const rng = new Rng('srch');
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      advanceHabits(b, rng);
      seen.add(`${b.units[0]!.x},${b.units[0]!.y}`);
    }
    expect(seen.has('3,1')).toBe(true);
    expect(seen.size).toBeGreaterThan(5);
  });

  it('a turret turns to look but never goes anywhere', () => {
    const { w } = mk();
    const t = guard(w, 't', 'sentry_turret');
    const b = boardOf(w, OPEN, [{ npc: t, at: { x: 4, y: 2 }, facing: E }], { x: 0, y: 0 });
    makeNoise(b, { x: 1, y: 4 }, 0.9);
    const rng = new Rng('t');
    for (let i = 0; i < 10; i++) advanceHabits(b, rng);
    expect(b.units[0]!.x).toBe(4);
    expect(b.units[0]!.y).toBe(2);
  });
});

describe('taking someone out', () => {
  it('is easiest from behind and from someone who has not noticed anything', () => {
    const { w } = mk();
    const g = guard(w, 'g');
    const b = boardOf(w, OPEN, [{ npc: g, at: { x: 3, y: 2 }, facing: E }], { x: 2, y: 2 });
    const behind = takedownChance(b, b.units[0]!);
    b.hero = { x: 4, y: 2 };
    const front = takedownChance(b, b.units[0]!);
    expect(behind).toBeGreaterThan(front);
    b.hero = { x: 2, y: 2 };
    awareness(w, g).v = 0.6;
    expect(takedownChance(b, b.units[0]!)).toBeLessThan(behind);
  });
});

describe('a whole room', () => {
  const room = (seed: string, facing: number, rows = ['E.......', '........', '........', '........', '........']) => {
    const { w } = mk(seed);
    const g = guard(w, `lone-${seed}`);
    const b = boardOf(w, rows, [{ npc: g, at: { x: 5, y: 2 }, facing }], { x: 0, y: 0 });
    return { w, b, g };
  };

  it('a guard with his back to her can be taken out without a sound, most of the time', () => {
    let cleared = 0;
    for (let i = 0; i < 30; i++) {
      const { w, b } = room(`back${i}`, E);
      const { c } = ctxOf(w, `r${i}`);
      const out = prowlBoard(c, b, (t, o, d) => c.emit(t, o, d));
      if (out === 'cleared') cleared++;
    }
    expect(cleared).toBeGreaterThan(18);
  });

  it('a guard who is facing her down a corridor is much harder than one with his back to her', () => {
    const run = (facing: number) => {
      let cleared = 0;
      for (let i = 0; i < 40; i++) {
        const { w } = mk(`cor${facing}${i}`);
        const g = guard(w, `cg${facing}${i}`);
        const b = boardOf(w, ['########', 'E.......', '########'], [{ npc: g, at: { x: 5, y: 1 }, facing }], { x: 0, y: 1 });
        const { c } = ctxOf(w, `r${i}`);
        if (prowlBoard(c, b, (t, o, d) => c.emit(t, o, d)) === 'cleared') cleared++;
      }
      return cleared;
    };
    expect(run(W)).toBeLessThan(run(E));
  });

  it('puts the person down and leaves a body, and makes no fuss while it does', () => {
    const { w, b, g } = room('quiet', E);
    const { c, events } = ctxOf(w, 'quiet');
    let out = prowlBoard(c, b, (t, o, d) => c.emit(t, o, d));
    for (let i = 0; out !== 'cleared' && i < 40; i++) {
      const again = room(`quiet${i}`, E);
      const r = ctxOf(again.w, `q${i}`);
      out = prowlBoard(r.c, again.b, (t, o, d) => r.c.emit(t, o, d));
      if (out === 'cleared') {
        expect(again.b.bodies).toHaveLength(1);
        expect(again.g.alive === false || again.g.downUntil > again.w.clock).toBe(true);
        expect(r.events.some((e) => e.type === 'prowl_takedown' && (e.data.variant === 'ko' || e.data.variant === 'kill'))).toBe(true);
        expect(r.events.some((e) => e.type === 'call_for_help')).toBe(false);
      }
    }
    expect(out).toBe('cleared');
    void events;
    void g;
    void b;
  });

  it('a body that someone finds makes them alert', () => {
    const { w } = mk('body');
    const a = guard(w, 'a');
    const sleeper = guard(w, 'sleeper');
    const b = boardOf(w, OPEN, [{ npc: a, at: { x: 5, y: 2 }, facing: W }], { x: 0, y: 0 });
    b.bodies.push({ npcId: sleeper.id, x: 3, y: 2, found: false });
    b.hero = { x: 0, y: 4 };
    const { c } = ctxOf(w);
    // one round is enough
    const out = prowlBoard(c, { ...b, units: b.units }, () => undefined);
    void out;
    expect(b.bodies[0]!.found).toBe(true);
    expect(['alert', 'aware']).toContain(bucketOf(w, a));
  });
});

describe('distractions', () => {
  it('an Override on a machine makes a noise there that draws the ones who hear it', () => {
    let drawn = 0;
    for (let i = 0; i < 12; i++) {
      const { w } = mk(`ov${i}`);
      w.hero.int = 10;
      w.hero.skills.tinkering = 400;
      const g = guard(w, `g${i}`);
      const b = boardOf(w, OPEN, [{ npc: g, at: { x: 3, y: 3 }, facing: W }], { x: 1, y: 0 });
      b.props.push({ kind: 'speaker', x: 6, y: 4, charges: PROPS.speaker.charges });
      const { c, events } = ctxOf(w, `ov${i}`);
      const before = b.props[0]!.charges;
      useProp(c, b, b.props[0]!, (t, o, d) => c.emit(t, o, d));
      if (b.props[0]!.charges < before) drawn++;
      if (b.props[0]!.charges < before) expect(b.units[0]!.last).toEqual({ x: 6, y: 4 });
      void events;
    }
    expect(drawn).toBeGreaterThan(3);
  });
});

describe('a distraction helps her get past', () => {
  // A guard watching the way in down a corridor she can't go round, and a machine in an alcove past him.
  const run = (withProp: boolean, i: number) => {
    const { w } = mk(`lure${withProp}${i}`);
    w.hero.int = 10;
    w.hero.skills.tinkering = 400;
    const g = guard(w, `lg${withProp}${i}`);
    const b = boardOf(w, ['########', 'E.......', '######.#', '########'], [{ npc: g, at: { x: 4, y: 1 }, facing: W }], { x: 0, y: 1 });
    if (withProp) b.props.push({ kind: 'speaker', x: 6, y: 2, charges: 1 });
    const { c, events } = ctxOf(w, `lr${i}`);
    const out = prowlBoard(c, b, (t, o, d) => c.emit(t, o, d));
    return { out, used: events.some((e) => e.type === 'prowl_distract' && e.data.variant === 'ok') };
  };

  it('she uses it when somebody is in the way, and gets through more often for it', () => {
    let usedAny = 0;
    let withClear = 0;
    let withoutClear = 0;
    for (let i = 0; i < 60; i++) {
      const a = run(true, i);
      const b = run(false, i);
      if (a.used) usedAny++;
      if (a.out === 'cleared') withClear++;
      if (b.out === 'cleared') withoutClear++;
    }
    expect(usedAny).toBeGreaterThan(10);
    expect(withClear).toBeGreaterThan(withoutClear);
  });
});

describe('in a real dungeon', () => {
  const site = (seed: string) => {
    const sc = scenario({ seed, at: 'street_main', competence: 0.5 });
    const street = sc.w.locations[childId('street_main', 0)]!;
    const entrance = addDungeon(sc.w, street, 'hideout', 40, 1);
    relocate(sc.w, entrance.id);
    return { w: sc.w, d: sc.w.dungeons[entrance.id]!, entrance, sc };
  };

  it('sneaking into a room with people in it plays it as a board and ends one of three ways', () => {
    const ends = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const { w, d } = site(`dg${i}`);
      const target = d.rooms.find((r) => standing(w, d, r.id).length > 0)!;
      const loc = w.locations[target.id]!;
      w.hero.stealth = true;
      relocate(w, loc.id);
      const { c, events } = ctxOf(w, `e${i}`);
      enterRoom(c, loc);
      expect(events.some((e) => e.type === 'prowl_start')).toBe(true);
      const end = events.find((e) => e.type === 'prowl_end');
      expect(end).toBeDefined();
      ends.add(String(end!.data.variant));
      if (end!.data.variant === 'detected') expect(events.some((e) => e.type === 'dungeon_alarm')).toBe(true);
    }
    expect(ends.size).toBeGreaterThan(1);
  });

  it('a whole dungeon can be cleared without anyone raising the alarm', () => {
    let cleared = 0;
    for (let i = 0; i < 40 && !cleared; i++) {
      const { w, d, entrance } = site(`clear${i}`);
      w.hero.stealth = true;
      w.hero.level = 20;
      w.hero.skills.sneak = 900;
      w.hero.hp = w.hero.maxHp = 600;
      const { c, events } = ctxOf(w, `c${i}`);
      let quiet = true;
      // Every room, in order of the building.
      const order = d.rooms.map((r) => r.id);
      for (const id of order) {
        const loc = w.locations[id] as Location;
        relocate(w, loc.id);
        enterRoom(c, loc);
        if (events.some((e) => e.type === 'dungeon_alarm' || e.type === 'fight_start')) {
          quiet = false;
          break;
        }
      }
      if (quiet && garrisonAlive(w, d).length === 0) {
        cleared++;
        expect(d.clearedRun).not.toBeNull();
        expect(events.some((e) => e.type === 'dungeon_cleared')).toBe(true);
      }
      void entrance;
      void checkCleared;
      void roomOf;
    }
    expect(cleared).toBeGreaterThan(0);
  });
});
