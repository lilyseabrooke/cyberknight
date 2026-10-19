import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { scenario } from './testkit';
import { spawnGroup } from './candidate';
import { onFoot, runChase } from './chase';
import { weighSides } from './callins';
import { addTire, ambientNoise, carries, eased, standTired, tire } from './tracking';
import { streetHunt } from './streethunt';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { awareness } from './stealth';
import { witnessBodies } from './witnesses';
import { makeNoise, makeUnit, prowlBoard, type Board, type Light } from './prowl';
import { placeOf, syncPlace } from './placeboard';
import type { Ctx } from './types';

const ctxOf = (w: World, rng: Rng): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

describe('a hunt on the street', () => {
  it('starts with them not knowing where she is, and ends with her gone, chased or fought', () => {
    const ends: Record<string, number> = {};
    for (let i = 0; i < 40; i++) {
      const sc = scenario({ seed: `hunt-${i}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      const { c, events } = ctxOf(w, new Rng(`h-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      const from = w.hero.locationId;
      const r = streetHunt(c, crew, 'test');
      ends[r] = (ends[r] ?? 0) + 1;
      if (r === 'evaded') {
        expect(w.hero.locationId).not.toBe(from);
        expect(events.some((e) => e.type === 'prowl_end' && e.data.variant === 'evaded')).toBe(true);
        for (const n of crew) expect(w.npcs[n.id]?.aware?.fix ?? false).toBe(false);
      }
      if (r === 'chased') expect(events.some((e) => e.type === 'chase_start')).toBe(true);
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(ends.evaded ?? 0).toBeGreaterThan(0);
  });

  it('someone who stumbles onto her turns it into a fight or a chase, not a vanishing', () => {
    const ends: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const sc = scenario({ seed: `stumble-${i}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      const { c, events } = ctxOf(w, new Rng(`s-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      const p = placeOf(w)!;
      syncPlace(w, p);
      const g = p.layout.grid;
      const mid = { x: Math.floor(g.w / 2), y: Math.floor(g.h / 2) };
      p.board.hero = mid;
      crew.forEach((n, k) => {
        const e = p.board.ents[n.id];
        if (!e) return;
        e.x = mid.x + (k === 0 ? 1 : 0);
        e.y = mid.y + (k === 0 ? 0 : 1);
      });
      const r = streetHunt(c, crew, 'test', { keepSpot: true });
      ends[r] = (ends[r] ?? 0) + 1;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect((ends.fought ?? 0) + (ends.chased ?? 0)).toBeGreaterThan(0);
  });

  it('a timid bystander who has seen her runs for the nearest way out instead of coming for her', () => {
    const sc = scenario({ seed: 'timid', at: 'street_main', competence: 0.6 });
    const { w } = sc;
    w.hero.stealth = true;
    const n = spawnNpc(new Rng('pat'), 'pat', 'patron', w.hero.locationId);
    addNpc(w, n);
    const a = awareness(w, n);
    a.v = 1;
    a.fix = true;
    const cells = Array(8 * 3).fill('floor') as never;
    const b: Board = { w, grid: { w: 8, h: 3, cells, exits: [{ x: 7, y: 1 }] }, light: Array<Light>(24).fill(2), units: [makeUnit(n, { x: 3, y: 1 }, 2)], hero: { x: 2, y: 1 }, posture: 'sneak', props: [], bodies: [], round: 1, dark: [], role: 'test', ways: [{ at: { x: 7, y: 1 }, to: 'club_backlot' }] };
    const events: string[] = [];
    prowlBoard({ w, rng: new Rng('t'), emit: (t) => events.push(t) }, b, (t) => events.push(t));
    expect(events).toContain('prowl_flee');
    expect(b.units[0]!.fled).toBe(true);
  });

  it('she can go to ground off the line while they run by, and they either find her or go on past', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const sc = scenario({ seed: `ground-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const { c, events } = ctxOf(w, new Rng(`g-${i}`));
      const crew = spawnGroup(c, 'ganger', 1 + (i % 2), 'vipers');
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 4)) });
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      const told = events.filter((e) => e.type === 'chase_round').map((e) => String(e.data.events)).join(' ');
      if (told.includes('lost:cover')) {
        seen.past = (seen.past ?? 0) + 1;
        expect(w.hero.stealth).toBe(true);
        if (!events.some((e) => ['chase_search', 'prowl_takedown', 'stealth_notice', 'call_for_help'].includes(e.type))) for (const n of crew) if (n.alive && n.locationId === w.hero.locationId) expect(n.aware?.fix ?? false).toBe(false);
      }
      if (told.includes('hide:found')) seen.found = (seen.found ?? 0) + 1;
      if (told.includes('ambush')) {
        seen.ambush = (seen.ambush ?? 0) + 1;
        expect(events.some((e) => e.type === 'prowl_takedown')).toBe(true);
      }
      w.over = undefined as never;
    }
    expect(seen.past ?? 0).toBeGreaterThan(0);
    expect(seen.found ?? 0).toBeGreaterThan(0);
    expect(seen.ambush ?? 0).toBeGreaterThan(0);
  });

  it('when they lose sight of her they go to where they last saw her, then either press on or fan out to search', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const sc = scenario({ seed: `lost-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const { c, events } = ctxOf(w, new Rng(`l-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 9)) });
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'chase_search') seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
      }
    }
    expect(Object.keys(seen).length).toBeGreaterThanOrEqual(2);
  });

  it('people standing on her line are gone round, shoved through or run into, and everything is told', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const sc = scenario({ seed: `crowd-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.clock = 20 * 60;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const { c, events } = ctxOf(w, new Rng(`c-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      for (let k = 0; k < 8; k++) spawnGroup(c, 'patron', 1);
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 4)) });
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'chase_crowd') seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
      }
    }
    expect((seen.weave ?? 0) + (seen.shove ?? 0)).toBeGreaterThan(0);
  });

  it('with the Charm for it, people let her through and then close up on her pursuers; without, they do not', () => {
    const run = (charm: number): { clear: number; ranks: number; angry: number } => {
      const out = { clear: 0, ranks: 0, angry: 0 };
      for (let i = 0; i < 120; i++) {
        const sc = scenario({ seed: `charm-${i % 40}`, at: 'street_main', competence: 0.6 });
        const { w } = sc;
        w.clock = 20 * 60;
        w.hero.charm = charm;
        w.hero.level = 8;
        w.hero.maxHp = w.hero.hp = 180;
        const { c, events } = ctxOf(w, new Rng(`ch-${i}`));
        const crew = spawnGroup(c, 'ganger', 2, 'vipers');
        for (let k = 0; k < 8; k++) spawnGroup(c, 'patron', 1);
        runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 4)) });
        for (const e of events) {
          expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
          if (e.type === 'chase_crowd' && e.data.variant === 'clear') out.clear++;
          if (e.type === 'chase_crowd' && e.data.variant === 'ranks') out.ranks++;
          if (e.type === 'accident' && e.data.variant === 'bump' && e.data.angry) out.angry++;
        }
      }
      return out;
    };
    const low = run(0);
    const high = run(14);
    expect(low.clear).toBe(0);
    expect(high.clear).toBeGreaterThan(5);
    expect(high.ranks).toBeGreaterThan(0);
    expect(high.angry).toBeLessThanOrEqual(low.angry);
  });

  it('losing sight is not losing the trail: a good tracker keeps it, a poor one does not', () => {
    const run = (tracking: number, mode: 'pursued' | 'pursuer'): { tracks: number; hot: number; lost: number } => {
      const out = { tracks: 0, hot: 0, lost: 0 };
      for (let i = 0; i < 120; i++) {
        const sc = scenario({ seed: `trail-${i % 40}`, at: 'street_main', competence: 0.6 });
        const { w } = sc;
        w.hero.level = 8;
        w.hero.maxHp = w.hero.hp = 180;
        w.hero.skills.tracking = tracking;
        const { c, events } = ctxOf(w, new Rng(`t-${i}`));
        const crew = spawnGroup(c, 'ganger', 2, 'vipers');
        const r = runChase(c, { mode, cause: 'test', foes: crew.map((n) => onFoot(n, 29)) });
        for (const e of events) {
          expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
          if (e.type === 'chase_track') {
            out.tracks++;
            if (e.data.variant === 'hot') out.hot++;
          }
        }
        if (r === 'lost' || r === 'escaped') out.lost++;
      }
      return out;
    };
    const none = run(0, 'pursuer');
    const good = run(900, 'pursuer');
    expect(good.tracks).toBeGreaterThan(none.tracks);
    expect(good.lost).toBeLessThanOrEqual(none.lost);
    expect(run(0, 'pursued').tracks).toBeGreaterThanOrEqual(0);
  });

  it('those left searching after a chase are a scene of their own, and the good trackers among them get close', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const sc = scenario({ seed: `after-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const { c, events } = ctxOf(w, new Rng(`a-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 9)) });
      const k = events.findIndex((e) => e.type === 'chase_search' && (e.data.variant === 'fan' || e.data.variant === 'split'));
      const hunted = events.findIndex((e) => e.type === 'prowl_start' && e.data.variant === 'hunt');
      if (k >= 0 && hunted > k) seen.after = (seen.after ?? 0) + 1;
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'prowl_track') seen[`track_${e.data.variant}`] = (seen[`track_${e.data.variant}`] ?? 0) + 1;
      }
    }
    expect(seen.after ?? 0).toBeGreaterThan(0);
  });

  it('running wears everyone down: the longer it goes on the likelier she is to stop and turn, and a quiet spell forgets it', () => {
    const sc = scenario({ seed: 'tired', at: 'street_main', competence: 0.6 });
    const { w } = sc;
    expect(standTired(w)).toBe(0);
    addTire(w, 4);
    expect(standTired(w)).toBe(0);
    addTire(w, 10);
    expect(standTired(w)).toBeGreaterThan(0.2);
    addTire(w, 40);
    expect(standTired(w)).toBeLessThanOrEqual(0.7);
    w.beat += 20;
    expect(tire(w)).toBe(0);
    let stood = 0;
    for (let i = 0; i < 200; i++) {
      const s2 = scenario({ seed: `long-${i % 40}`, at: 'street_main', competence: 0.6 });
      s2.w.hero.level = 10;
      s2.w.hero.maxHp = s2.w.hero.hp = 220;
      const { c, events } = ctxOf(s2.w, new Rng(`lg-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      addTire(s2.w, 12);
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 9)), maxRounds: 30 });
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      if (events.some((e) => e.type === 'chase_mount' && e.data.variant === 'hero_stands')) stood++;
    }
    expect(stood).toBeGreaterThan(0);
  });

  it('searchers who can track her get a sense of where she is', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const sc = scenario({ seed: `scent-${i}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      const { c, events } = ctxOf(w, new Rng(`sc-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      for (const n of crew) n.level = 25;
      streetHunt(c, crew, 'test');
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'prowl_track') seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
      }
    }
    expect(Object.keys(seen).length).toBeGreaterThan(0);
  });

  it('noise she makes after they have lost her makes her easier to follow, the more the louder', () => {
    expect(eased(8, 0)).toBe(8);
    expect(eased(8, 0.4)).toBeCloseTo(6);
    expect(eased(8, 1)).toBe(3);
    expect(eased(8, 5)).toBe(2);
    expect(eased(2, 1)).toBe(0);
    const rate = (heard: number): number => {
      let got = 0;
      for (let i = 0; i < 150; i++) {
        const sc = scenario({ seed: `ear-${i % 10}`, at: 'street_main', competence: 0.6 });
        const { w } = sc;
        w.hero.stealth = true;
        const n = spawnNpc(new Rng(`hound${i}`), `hound${i}`, 'ganger', w.hero.locationId);
        n.level = 1;
        addNpc(w, n);
        const a = awareness(w, n);
        a.v = 0.6;
        a.fix = false;
        const cells = Array(20 * 3).fill('floor') as never;
        const u = makeUnit(n, { x: 3, y: 1 }, 2);
        u.behavior = 'search';
        u.heard = heard;
        const b: Board = { w, grid: { w: 20, h: 3, cells, exits: [{ x: 19, y: 1 }] }, light: Array<Light>(60).fill(1), units: [u], hero: { x: 15, y: 1 }, posture: 'hold', props: [], bodies: [], round: 1, dark: [], role: 'test', tracking: true, goal: 'leave', ways: [{ at: { x: 19, y: 1 }, to: 'club_backlot' }] };
        const events: string[] = [];
        prowlBoard({ w, rng: new Rng(`e${i}`), emit: (t) => events.push(t) }, b, (t) => events.push(t));
        if (events.includes('prowl_track')) got++;
      }
      return got;
    };
    expect(rate(1.5)).toBeGreaterThan(rate(0));
  });

  it('the same noise carries further in a quiet place than in a loud one', () => {
    expect(carries(0)).toBeGreaterThan(carries(1) * 2);
    const heardIn = (clock: number, road?: 'highway'): number => {
      const sc = scenario({ seed: 'quiet', at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.clock = clock;
      if (road) w.locations[w.hero.locationId]!.road = road;
      const n = spawnNpc(new Rng('ear'), 'ear', 'ganger', w.hero.locationId);
      addNpc(w, n);
      const u = makeUnit(n, { x: 4, y: 1 }, 2);
      const cells = Array(20 * 3).fill('floor') as never;
      const b: Board = { w, grid: { w: 20, h: 3, cells, exits: [] }, light: Array<Light>(60).fill(1), units: [u], hero: { x: 6, y: 1 }, posture: 'sneak', props: [], bodies: [], round: 1, dark: [], role: 'test' };
      makeNoise(b, b.hero, 0.4);
      return u.heard ?? 0;
    };
    const night = heardIn(4 * 60);
    const rush = heardIn(18 * 60, 'highway');
    expect(night).toBeGreaterThan(rush);
    const w0 = scenario({ seed: 'amb', at: 'street_main' }).w;
    w0.clock = 4 * 60;
    expect(ambientNoise(w0, w0.locations.neon_pharaoh)).toBeGreaterThan(ambientNoise(w0, w0.locations.street_main));
  });

  it('bystanders have opinions about a chase going by: some get clear, some trip her, some help, some call it in', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 240; i++) {
      const sc = scenario({ seed: `watch-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.clock = 20 * 60;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const { c, events } = ctxOf(w, new Rng(`wt-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      const mood = i % 3 === 0 ? 30 : i % 3 === 1 ? -30 : 0;
      for (const n of spawnGroup(c, 'patron', 8)) n.affinity = mood;
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 6)) });
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'chase_bystander') seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
      }
    }
    expect(seen.scatter ?? 0).toBeGreaterThan(0);
    expect(seen.help ?? 0).toBeGreaterThan(0);
    expect(seen.trip ?? 0).toBeGreaterThan(0);
  });

  it('a call brings a patrol after a few rounds, and what it does depends on who is chasing whom and how hot she is', () => {
    const hot = weighSides(8, 'npd', 'other', 0);
    const cool = weighSides(0, 'npd', 'other', 0);
    expect(hot.her / hot.foes).toBeGreaterThan(cool.her / cool.foes);
    expect(weighSides(2, 'npd', 'crook', 0).foes).toBeGreaterThan(weighSides(2, 'npd', 'other', 0).foes);
    expect(weighSides(2, 'npd', 'law', 0).her).toBeGreaterThan(weighSides(2, 'npd', 'other', 0).her);
    expect(weighSides(2, 'atlas', 'corp', 0).her).toBeGreaterThan(weighSides(2, 'npd', 'corp', 0).her);
    const seen: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const sc = scenario({ seed: `patrol-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.clock = 20 * 60;
      w.hero.level = 10;
      w.hero.maxHp = w.hero.hp = 220;
      w.heat.npd = i % 4 === 0 ? 8 : i % 4 === 1 ? 0 : 3;
      const { c, events } = ctxOf(w, new Rng(`pt-${i}`));
      const crew = spawnGroup(c, i % 2 ? 'mugger' : 'ganger', 2, 'vipers');
      for (const n of spawnGroup(c, 'patron', 8)) n.affinity = -30;
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 6)), maxRounds: 16 });
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'chase_police') seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
      }
    }
    expect(Object.keys(seen).length).toBeGreaterThanOrEqual(2);
  });

  it('people watching a takedown react to it, and people who find the body run or shout', () => {
    const seen: Record<string, number> = {};
    let takedowns = 0;
    for (let i = 0; i < 200; i++) {
      const sc = scenario({ seed: `witness-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.clock = 20 * 60;
      const { c, events } = ctxOf(w, new Rng(`wi-${i}`));
      const crew = spawnGroup(c, 'ganger', 1, 'vipers');
      const mood = i % 3 === 0 ? 30 : i % 3 === 1 ? -30 : 0;
      for (const n of spawnGroup(c, 'patron', 8)) n.affinity = mood;
      const p = placeOf(w)!;
      syncPlace(w, p);
      const g = p.layout.grid;
      const mid = { x: Math.floor(g.w / 2), y: Math.floor(g.h / 2) };
      p.board.hero = mid;
      const e = p.board.ents[crew[0]!.id];
      if (e) {
        e.x = mid.x + 1;
        e.y = mid.y;
        e.facing = 2;
      }
      // the patrons close by, looking her way
      Object.entries(p.board.ents).filter(([id]) => id !== crew[0]!.id).slice(0, 5).forEach(([, ent], k) => {
        ent.x = Math.max(0, Math.min(g.w - 1, mid.x - 2 + k));
        ent.y = Math.max(0, Math.min(g.h - 1, mid.y - 2));
        ent.facing = 4;
      });
      streetHunt(c, crew, 'test', { keepSpot: true });
      for (const ev of events) {
        expect(hasTemplate(ev), `${ev.type}:${ev.data.variant}`).toBe(true);
        if (ev.type === 'prowl_witness') seen[String(ev.data.variant)] = (seen[String(ev.data.variant)] ?? 0) + 1;
        if (ev.type === 'prowl_takedown' && ev.data.variant !== 'fail') takedowns++;
      }
    }
    expect(takedowns).toBeGreaterThan(0);
    expect(Object.keys(seen).length).toBeGreaterThanOrEqual(1);
  });

  it('finding a body can call the police to it, and a crowd past the first three just runs or hides', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 120; i++) {
      const sc = scenario({ seed: `body-${i % 20}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.hero.stealth = true;
      const mk = (id: string, arch: string) => {
        const n = spawnNpc(new Rng(id), id, arch, w.hero.locationId);
        addNpc(w, n);
        return n;
      };
      const cells = Array(24 * 5).fill('floor') as never;
      const guard = makeUnit(mk(`g${i}`, 'ganger'), { x: 20, y: 2 }, 2);
      const others = Array.from({ length: 7 }, (_, k) => makeUnit(mk(`p${i}_${k}`, 'patron'), { x: 8 + (k % 4), y: 1 + (k % 3) }, 6));
      const victim = mk(`v${i}`, 'ganger');
      const b: Board = { w, grid: { w: 24, h: 5, cells, exits: [{ x: 23, y: 2 }] }, light: Array<Light>(120).fill(2), units: [guard], others, hero: { x: 2, y: 2 }, posture: 'sneak', props: [], bodies: [{ npcId: victim.id, x: 6, y: 2, found: false }], round: 1, dark: [], role: 'test' };
      const events: GameEvent[] = [];
      const say = (type: string, outcome: 'good' | 'bad' | 'mixed', data: Record<string, string | number | boolean>): void => void events.push({ beat: 0, type, outcome, data });
      witnessBodies({ w, rng: new Rng(`b${i}`), emit: (t, o, d = {}) => events.push({ beat: 0, type: t, outcome: o, data: d }) }, b, say);
      if (b.arrivals?.length) {
        b.arrivals[0]!.round = 1;
        prowlBoard({ w, rng: new Rng(`pb${i}`), emit: (t, o, d = {}) => events.push({ beat: 0, type: t, outcome: o, data: d }) }, b, say);
      }
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'prowl_witness' || e.type === 'prowl_police') seen[`${e.type}:${e.data.variant}`] = (seen[`${e.type}:${e.data.variant}`] ?? 0) + 1;
      }
    }
    expect(seen['prowl_witness:found_call'] ?? 0).toBeGreaterThan(0);
    expect(seen['prowl_witness:crowd'] ?? 0).toBeGreaterThan(0);
    expect((seen['prowl_police:arrive'] ?? 0) + (seen['prowl_police:nobody'] ?? 0)).toBeGreaterThan(0);
  });

  it('streets have things standing about to pull down, and a runner on foot uses them on whoever is behind', () => {
    const kinds = new Set<string>();
    const used: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const sc = scenario({ seed: `props-${i % 40}`, at: 'street_main', competence: 0.6 });
      const { w } = sc;
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      const p = placeOf(w)!;
      for (const pr of p.layout.props) kinds.add(pr.kind);
      const { c, events } = ctxOf(w, new Rng(`pr-${i}`));
      const crew = spawnGroup(c, 'ganger', 2, 'vipers');
      runChase(c, { mode: 'pursued', cause: 'test', foes: crew.map((n) => onFoot(n, 5)) });
      for (const e of events) {
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
        if (e.type === 'chase_prop') used[`${e.data.variant}:${e.data.ok}`] = (used[`${e.data.variant}:${e.data.ok}`] ?? 0) + 1;
      }
    }
    expect(kinds.size).toBeGreaterThan(0);
    expect(Object.keys(used).length).toBeGreaterThan(0);
  });
});
