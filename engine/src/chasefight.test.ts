import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, type GameEvent, type World } from './index';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { MAKES } from './cars';
import { onFoot, runChase, type Chaser } from './chase';
import type { Ctx } from './types';

const ctxOf = (w: World, rng: Rng): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

const guy = (w: World, id: string, kind = 'ganger') => {
  const n = spawnNpc(new Rng(id), id, kind, w.hero.locationId);
  addNpc(w, n);
  return n;
};

/** A car with a ganger or two in it, right on her bumper. */
function carFoe(w: World, id: string, crew = 1, gap = 0.3): Chaser {
  const mk = MAKES.civilian[0]!;
  return { name: `a ${mk.name}`, crew: Array.from({ length: crew }, (_, i) => guy(w, `${id}-${i}`)), car: { id: `car-${id}`, body: mk.body ?? 'car', kind: 'civilian', name: mk.name, hp: mk.maxHp, maxHp: mk.maxHp, armor: mk.armor }, pace: mk.pace, gap, alive: true };
}

const world = (seed: string, level = 6) => {
  const w = createWorld({ seed, competence: 0.6 });
  w.hero.level = level;
  w.hero.maxHp = w.hero.hp = 90 + 13 * (level - 1);
  w.hero.locationId = 'street_main';
  w.clock = 20 * 60;
  return w;
};

describe('fighting during a chase', () => {
  it('being right behind them is not the end of it: she can board, work on the doors and the driver', () => {
    const seen: Record<string, number> = {};
    const results: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const w = world(`board-${i}`);
      const { c, events } = ctxOf(w, new Rng(`board-${i}`));
      const r = runChase(c, { mode: 'pursuer', cause: 'test', foes: [carFoe(w, `b${i}`, 1 + (i % 2))] });
      results[r] = (results[r] ?? 0) + 1;
      for (const e of events) {
        if (e.type === 'chase_round') seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      }
    }
    for (const k of ['board', 'attack_driver']) expect(seen[k], k).toBeGreaterThan(0);
    expect(seen.hijack_door! + (seen.break_door ?? 0)).toBeGreaterThan(0);
    // It ends when they are down or when they stop: not just because she got close.
    expect(results.won).toBeGreaterThan(0);
    expect(results.caught).toBeGreaterThan(0);
  });

  it('she can be thrown off a vehicle she is clinging to, and it hurts', () => {
    let thrown = 0;
    for (let i = 0; i < 300; i++) {
      const w = world(`throw-${i}`);
      const { c, events } = ctxOf(w, new Rng(`throw-${i}`));
      runChase(c, { mode: 'pursuer', cause: 'test', foes: [carFoe(w, `t${i}`)] });
      if (events.some((e) => e.type === 'chase_round' && String(e.data.events).includes('thrown_off'))) thrown++;
    }
    expect(thrown).toBeGreaterThan(0);
  });

  it('a weak runner on foot stops running and fights; a strong one is hit as it runs', () => {
    let stood = 0;
    let struck = 0;
    for (let i = 0; i < 200; i++) {
      const w = world(`stand-${i}`, 8);
      const runner = guy(w, `s${i}`, i % 2 ? 'ganger' : 'patron');
      const { c, events } = ctxOf(w, new Rng(`stand-${i}`));
      runChase(c, { mode: 'pursuer', cause: 'test', foes: [onFoot(runner, 2)] });
      if (events.some((e) => e.type === 'chase_mount' && e.data.variant === 'foe_stands')) stood++;
      if (events.some((e) => e.type === 'chase_round' && String(e.data.events).includes('struck:'))) struck++;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(stood).toBeGreaterThan(0);
    expect(struck).toBeGreaterThan(0);
  });

  it('shooting hits the driver or the vehicle, and a vehicle that is shot to pieces takes its crew with it', () => {
    let driverHit = 0;
    let wrecked = 0;
    let shots = 0;
    for (let i = 0; i < 300; i++) {
      const w = world(`shoot-${i}`);
      w.hero.weapon = { ...w.hero.weapon, tags: ['gun'] };
      const f = carFoe(w, `g${i}`, 1, 4);
      const { c, events } = ctxOf(w, new Rng(`shoot-${i}`));
      runChase(c, { mode: 'pursuer', cause: 'test', foes: [f] });
      if (events.some((e) => e.type === 'chase_round' && String(e.data.events).includes('at_driver'))) driverHit++;
      if (events.some((e) => e.type === 'chase_round' && e.data.variant === 'shoot')) shots++;
      if (events.some((e) => e.type === 'car_wreck')) wrecked++;
    }
    expect(shots).toBeGreaterThan(0);
    expect(driverHit).toBeGreaterThan(0);
    expect(wrecked).toBeGreaterThan(0);
  });
});
