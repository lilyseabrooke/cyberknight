import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { scenario } from './testkit';
import { relocate, fight } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { hasLos, idx, isTall } from './grid';
import { camerasSeeHer, placeOf, seesHer, syncPlace, tickPlace, workingCams } from './placeboard';
import { camFacing, camView, camGain, exposure, type Board } from './prowl';
import { layoutOf } from './layout';
import { awareness, bucketOf, enterStealth, tickStealth } from './stealth';
import { workingCameras } from './witness';
import { createWorld } from './world';
import { expand } from './mapgen';
import type { Ctx, GameEvent, Npc, World } from './types';

const ctxOf = (w: World, seed = 'cc') => {
  const events: GameEvent[] = [];
  const c: Ctx = { w, rng: new Rng(seed), emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) };
  return { c, events };
};
const person = (w: World, id: string, archetype = 'patron'): Npc => {
  const n = spawnNpc(new Rng(id), id, archetype, w.hero.locationId);
  n.level = 3;
  addNpc(w, n);
  return n;
};
/** An empty, flat, well-lit bar with one person, and her. Nothing in the way, no cameras. */
const flat = (seed: string) => {
  const sc = scenario({ seed, at: 'street_main' });
  const w = sc.w;
  relocate(w, 'halo_floor');
  for (const n of Object.values(w.npcs)) if (n.locationId === 'halo_floor') moveNpc(w, n, '_gone');
  w.locations.halo_floor!.cameras = 0;
  const guard = person(w, 'guard');
  const p = placeOf(w)!;
  syncPlace(w, p);
  const g = p.layout.grid;
  g.cells.fill('floor');
  for (const e of g.exits) g.cells[idx(g, e)] = 'exit';
  g.tall = [];
  p.layout.light.fill(2);
  p.layout.cams.length = 0;
  p.board.hero = { x: 0, y: 2 };
  p.board.ents[guard.id] = { x: 3, y: 2, facing: 6 };
  return { w, p, guard };
};

describe('facing and cones', () => {
  it('somebody facing her has her; somebody with their back turned does not, though the line is clear', () => {
    const { w, p, guard } = flat('cone');
    expect(hasLos(p.layout.grid, p.board.ents[guard.id]!, p.board.hero)).toBe(true);
    expect(seesHer(w, guard)).toBe(true);
    expect(bucketOf(w, guard)).toBe('aware');
    p.board.ents[guard.id]!.facing = 2;
    expect(seesHer(w, guard)).toBe(false);
    expect(bucketOf(w, guard)).toBe('unaware');
  });

  it('right beside them, she is noticed whichever way they face', () => {
    const { w, p, guard } = flat('close');
    p.board.ents[guard.id] = { x: 1, y: 2, facing: 2 };
    expect(seesHer(w, guard)).toBe(true);
  });

  it('a loud thing makes them turn round: only the line matters then', () => {
    const { w, p, guard } = flat('turn');
    p.board.ents[guard.id]!.facing = 2;
    expect(seesHer(w, guard)).toBe(false);
    expect(seesHer(w, guard, { turn: true })).toBe(true);
  });

  it('going quiet, a guard who is facing away never had her; one who is facing her still does', () => {
    const { w, p, guard } = flat('quiet');
    p.board.ents[guard.id]!.facing = 2;
    const { c, events } = ctxOf(w);
    enterStealth(c);
    expect(events.find((e) => e.type === 'stealth')!.data.watching).toBe(0);
    expect(bucketOf(w, guard)).toBe('unaware');
  });

  it('a fight in front of somebody with their back turned: they can still turn to look', () => {
    const quiet = flat('wit-quiet');
    const victim = person(quiet.w, 'victim');
    quiet.p.board.ents[victim.id] = { x: 1, y: 2, facing: 0 };
    quiet.p.board.ents[quiet.guard.id]!.facing = 2;
    const r = ctxOf(quiet.w, 'wq');
    fight(r.c, [victim], { cause: 'test', assault: true, joiners: false });
    const seen = r.events.find((e) => e.type === 'crime_seen');
    expect(seen).toBeDefined();
  });

  it('people at their posts look about as the beats go by, so where she can stand unseen changes', () => {
    const { w, p, guard } = flat('look');
    const e = p.board.ents[guard.id]!;
    e.behavior = 'post';
    e.homeFacing = 6;
    const faced = new Set<number>();
    for (let i = 0; i < 16; i++) {
      w.beat++;
      tickPlace(w);
      faced.add(p.board.ents[guard.id]!.facing);
    }
    expect(faced.size).toBeGreaterThan(1);
    expect(faced.size).toBeLessThanOrEqual(3);
  });

  it('sneaking, one who is facing the other way gains nothing, one facing her does', () => {
    const { w, p, guard } = flat('gain');
    const other = person(w, 'other');
    p.board.ents[other.id] = { x: 4, y: 3, facing: 2 };
    p.board.ents[guard.id]!.facing = 6;
    w.hero.stealth = true;
    const { c } = ctxOf(w);
    for (let i = 0; i < 4; i++) {
      w.beat++;
      tickStealth(c);
    }
    expect(awareness(w, guard).v).toBeGreaterThan(0);
    expect(awareness(w, other).v).toBe(0);
  });
});

describe('big things block sight', () => {
  it('a tall thing between them blocks the line; a crate does not', () => {
    const { w, p, guard } = flat('tall');
    const g = p.layout.grid;
    const mid = { x: 1, y: 2 };
    g.cells[idx(g, mid)] = 'cover';
    expect(hasLos(g, p.board.hero, p.board.ents[guard.id]!)).toBe(true);
    expect(seesHer(w, guard)).toBe(true);
    g.tall = [idx(g, mid)];
    expect(isTall(g, mid)).toBe(true);
    expect(hasLos(g, p.board.hero, p.board.ents[guard.id]!)).toBe(false);
    expect(seesHer(w, guard)).toBe(false);
  });

  it('a club has speaker towers and pillars that are big, and booths and the bar that are not', () => {
    const sc = scenario({ seed: 'club-tall', at: 'street_main' });
    relocate(sc.w, 'neon_pharaoh');
    const l = layoutOf(sc.w, sc.w.locations.neon_pharaoh!)!;
    const large = l.fixtures.filter((f) => f.large).map((f) => f.kind);
    expect(large).toContain('speaker');
    expect(l.fixtures.filter((f) => f.kind === 'bar' || f.kind === 'booth' || f.kind === 'dj_booth').every((f) => !f.large)).toBe(true);
    for (const f of l.fixtures) for (const t of f.tiles) expect(isTall(l.grid, t), f.id).toBe(!!f.large);
  });

  it('other rooms have some big things among the crates, which is somewhere to hide with no wall in the room', () => {
    let rooms = 0;
    let withTall = 0;
    for (let s = 0; s < 40; s++) {
      const w = createWorld({ seed: `tall${s}`, competence: 0.5 });
      for (const l of Object.values(w.locations)) {
        if (l.outdoors || l.kind === 'club' || l.dungeon) continue;
        const lay = layoutOf(w, l);
        if (!lay) continue;
        rooms++;
        const cover = lay.grid.cells.filter((t) => t === 'cover').length;
        const tall = lay.grid.tall?.length ?? 0;
        if (tall) withTall++;
        // Only things that are standing in the room can be big.
        for (const i of lay.grid.tall ?? []) expect(lay.grid.cells[i]).toBe('cover');
        expect(tall).toBeLessThanOrEqual(cover);
      }
    }
    expect(rooms).toBeGreaterThan(20);
    expect(withTall).toBeGreaterThan(0);
  });

  it('she can hide behind one: in the open the guard sees her, behind the tower he does not', () => {
    const { w, p, guard } = flat('hide');
    const g = p.layout.grid;
    g.cells[idx(g, { x: 1, y: 2 })] = 'cover';
    g.tall = [idx(g, { x: 1, y: 2 })];
    p.board.hero = { x: 0, y: 2 };
    expect(seesHer(w, guard)).toBe(false);
    p.board.hero = { x: 1, y: 0 };
    expect(seesHer(w, guard)).toBe(true);
  });
});

describe('cameras', () => {
  const withCams = (seed: string, n = 2) => {
    const f = flat(seed);
    f.w.locations.halo_floor!.cameras = n;
    f.w.locations.halo_floor!.camsDown = undefined;
    // (the layout is cached by camera count; ask again)
    const layout = layoutOf(f.w, f.w.locations.halo_floor!)!;
    const g = layout.grid;
    g.cells.fill('floor');
    for (const e of g.exits) g.cells[idx(g, e)] = 'exit';
    g.tall = [];
    layout.light.fill(2);
    moveNpc(f.w, f.guard, '_gone');
    f.w.boards!.halo_floor!.ents = {};
    return { ...f, layout };
  };

  it('are bolted up where they are, as many as the place has, in corners first', () => {
    const { w, layout } = withCams('mounts', 3);
    expect(layout.cams).toHaveLength(3);
    expect(layout.cams[0]).toMatchObject({ x: 0, y: 0 });
    expect(workingCams(w, w.locations.halo_floor!)).toHaveLength(3);
    w.locations.halo_floor!.camsDown = { n: 1, until: w.beat + 10 };
    expect(workingCams(w, w.locations.halo_floor!)).toHaveLength(2);
    w.flags.blackout = true;
    expect(workingCams(w, w.locations.halo_floor!)).toHaveLength(0);
  });

  it('have a cone, a range, and cannot see round a big thing', () => {
    const { layout } = withCams('view');
    const g = layout.grid;
    const cam = { x: 0, y: 0, facing: 3 };
    expect(camView(g, cam, { x: 3, y: 3 }, 2)).toBeGreaterThan(0);
    expect(camView(g, { ...cam, facing: 7 }, { x: 3, y: 3 }, 2)).toBe(0);
    g.tall = [idx(g, { x: 1, y: 1 })];
    expect(camView(g, cam, { x: 3, y: 3 }, 2)).toBe(0);
    g.tall = [];
    expect(camView(g, cam, { x: 3, y: 3 }, 0)).toBeGreaterThanOrEqual(0);
  });

  it('sweep, so they cover more of the room over time', () => {
    const faced = new Set<number>();
    for (let t = 0; t < 16; t++) faced.add(camFacing({ id: 'cam0', facing: 3 }, t));
    expect(faced.size).toBeGreaterThan(1);
    expect(faced.size).toBeLessThanOrEqual(3);
  });

  it('only a camera that is turned her way has her: at some beats of its sweep she is in its sight and at others she is not', () => {
    const { w, p, layout } = withCams('avoid', 1);
    p.board.hero = { x: 3, y: 3 };
    const seen: boolean[] = [];
    for (let t = 0; t < 8; t++) {
      w.beat = t;
      seen.push(camerasSeeHer(w));
    }
    expect(seen).toContain(true);
    expect(seen).toContain(false);
    // And behind a big thing she is never in it.
    layout.grid.tall = [idx(layout.grid, { x: 1, y: 1 }), idx(layout.grid, { x: 1, y: 2 }), idx(layout.grid, { x: 2, y: 1 })];
    for (let t = 0; t < 8; t++) {
      w.beat = t;
      expect(camerasSeeHer(w), `beat ${t}`).toBe(false);
    }
  });

  it('a fight where only the camera could have seen it is seen only if the camera is looking', () => {
    const results = { seen: 0, unseen: 0 };
    for (const looking of [true, false]) {
      const { w, p } = withCams(`wit-cam${looking}`, 1);
      const victim = person(w, `victim${looking}`);
      p.board.ents[victim.id] = { x: 1, y: 2, facing: 0 };
      p.board.hero = { x: 3, y: 3 };
      // The beat the camera is on her, and one it is not.
      let beat = -1;
      for (let t = 0; t < 8; t++) {
        w.beat = t;
        if (camerasSeeHer(w) === looking) beat = t;
      }
      expect(beat).toBeGreaterThanOrEqual(0);
      w.beat = beat;
      const { c, events } = ctxOf(w, `c${looking}`);
      fight(c, [victim], { cause: 'test', assault: true, joiners: false });
      const seen = events.find((e) => e.type === 'crime_seen')!;
      if (seen.data.variant === 'none') results.unseen++;
      else {
        results.seen++;
        expect(seen.data.variant).toBe('camera');
      }
    }
    expect(results).toEqual({ seen: 1, unseen: 1 });
  });

  it('while she sneaks, a camera gets none of her from where it cannot see, and the prowl board plans round it', () => {
    const { w, p, layout } = withCams('prowl-cam', 1);
    const loc = w.locations.halo_floor!;
    w.hero.stealth = true;
    p.board.hero = { x: 3, y: 3 };
    layout.grid.tall = [idx(layout.grid, { x: 1, y: 1 }), idx(layout.grid, { x: 1, y: 2 }), idx(layout.grid, { x: 2, y: 1 })];
    loc.camAware = 0;
    const { c } = ctxOf(w);
    for (let i = 0; i < 6; i++) {
      w.beat++;
      tickStealth(c);
    }
    expect(loc.camAware ?? 0).toBe(0);
    // and the board she plans on counts the camera in what a tile costs
    layout.grid.tall = [];
    const b: Board = { w, grid: layout.grid, light: layout.light, units: [], hero: p.board.hero, posture: 'sneak', props: [], bodies: [], round: 0, dark: [], role: 'test', cams: workingCams(w, loc) };
    const cam = layout.cams[0]!;
    let sawCost = false;
    for (let t = 0; t < 8 && !sawCost; t++) {
      w.beat = t;
      if (camGain(b, cam, { x: 3, y: 3 }, 'walk', t) > 0) sawCost = exposure(b, { x: 3, y: 3 }, 'walk') > 0;
    }
    expect(sawCost).toBe(true);
    expect(workingCameras(w, loc.id)).toBe(1);
  });
});
void expand;
