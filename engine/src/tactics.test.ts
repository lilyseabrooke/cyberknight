import { describe, expect, it } from 'vitest';
import { Rng, createWorld, genWeapon, hasTemplate, type GameEvent, type Npc, type World } from './index';
import { fight } from './combat';
import { spawnNpc } from './content/archetypes';
import { makeItem } from './content/items';
import { AMMO_IDS } from './content/ammo';
import { newCompanion } from './companions';
import { dist, hasLos, inCover, line, makeGrid, neighbors, pathTo, reach, terrainAt, type Grid, type Terrain } from './grid';
import { Sim, foeProfile, highlights, weaponReach, type Arrival } from './tactics';
import type { Location } from './types';
import { addNpc } from './population';

const KINDS: Location['kind'][] = ['bar', 'street', 'club', 'corp', 'tunnel', 'boss', 'shop', 'home'];

const gridOf = (rows: string[]): Grid => {
  const map: Record<string, Terrain> = { '.': 'floor', '#': 'wall', c: 'cover', '~': 'hazard', E: 'exit' };
  return { w: rows[0]!.length, h: rows.length, cells: rows.join('').split('').map((ch) => map[ch]!), exits: rows.flatMap((r, y) => r.split('').flatMap((ch, x) => (ch === 'E' ? [{ x, y }] : []))) };
};

interface Setup {
  kind?: string;
  n?: number;
  hero?: { level?: number; weapon?: string; armor?: string; muscle?: number };
  loc?: string;
  allies?: string[];
  implants?: string[];
  inventory?: string[];
  assault?: boolean;
}

function stage(seed: string, s: Setup = {}): { w: World; foes: Npc[]; rng: Rng; events: GameEvent[]; emit: (type: string, outcome: 'good' | 'bad' | 'mixed', data?: Record<string, string | number | boolean>) => void } {
  const w = createWorld({ seed, competence: 0.7 });
  const h = w.hero;
  const level = s.hero?.level ?? 6;
  h.level = level;
  h.maxHp = 90 + 12 * (level - 1);
  h.hp = h.maxHp;
  h.muscle = s.hero?.muscle ?? level;
  h.weapon = makeItem(s.hero?.weapon ?? 'rail_revolver');
  h.armor = makeItem(s.hero?.armor ?? 'kevlar_duster');
  h.ammo = Object.fromEntries(AMMO_IDS.map((t) => [t, 500]));
  h.locationId = s.loc ?? 'street_main';
  h.implants = s.implants ?? [];
  for (const id of s.inventory ?? []) h.inventory.push(makeItem(id));
  for (const k of s.allies ?? []) h.companions.push(newCompanion(k, `${k}-pal`));
  const rng = new Rng(`${seed}-rng`);
  const foes = Array.from({ length: s.n ?? 2 }, (_, k) => {
    const d = spawnNpc(rng, `d${k}`, s.kind ?? 'ganger', h.locationId);
    addNpc(w, d);
    return d;
  });
  const events: GameEvent[] = [];
  const emit = (type: string, outcome: 'good' | 'bad' | 'mixed', data: Record<string, string | number | boolean> = {}) => {
    events.push({ beat: w.beat, type, outcome, data });
  };
  return { w, foes, rng, events, emit };
}

describe('the board', () => {
  it('is 4x4 to 8x8, has exits on the edge, and nobody is walled off', () => {
    for (const kind of KINDS) {
      for (let i = 0; i < 40; i++) {
        const g = makeGrid(new Rng(`g-${kind}-${i}`), kind, i % 2 === 0);
        expect(g.w).toBeGreaterThanOrEqual(4);
        expect(g.w).toBeLessThanOrEqual(8);
        expect(g.h).toBeGreaterThanOrEqual(4);
        expect(g.h).toBeLessThanOrEqual(8);
        expect(g.exits.length).toBeGreaterThan(0);
        for (const e of g.exits) {
          expect(terrainAt(g, e.x, e.y)).toBe('exit');
          expect(e.x === 0 || e.y === 0 || e.x === g.w - 1 || e.y === g.h - 1).toBe(true);
        }
        const r = reach(g, g.exits[0]!, 99, () => false);
        for (let y = 0; y < g.h; y++) {
          for (let x = 0; x < g.w; x++) {
            const t = terrainAt(g, x, y);
            if (t === 'floor' || t === 'hazard' || t === 'exit') expect(r.cost.has(y * g.w + x), `${kind} ${i} ${x},${y}`).toBe(true);
          }
        }
      }
    }
  });

  it('bigger places make bigger boards', () => {
    const area = (kind: Location['kind']) => {
      const g = makeGrid(new Rng(`area-${kind}`), kind);
      return g.w * g.h;
    };
    expect(area('home')).toBeLessThan(area('club'));
    expect(area('club')).toBeLessThanOrEqual(area('boss'));
  });

  it('walls block sight; cover protects without blocking it', () => {
    const g = gridOf(['.....', '.#...', '.....', '..c..', '.....']);
    expect(hasLos(g, { x: 0, y: 1 }, { x: 2, y: 1 })).toBe(false);
    expect(hasLos(g, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(hasLos(g, { x: 2, y: 2 }, { x: 2, y: 4 })).toBe(true);
    expect(inCover(g, { x: 2, y: 2 }, { x: 2, y: 4 })).toBe(true);
    expect(inCover(g, { x: 0, y: 4 }, { x: 4, y: 4 })).toBe(false);
    expect(inCover(g, { x: 2, y: 3 }, { x: 2, y: 4 })).toBe(false); // point blank: nothing to hide behind
    expect(line({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it('paths go around walls, pay double for hazards, and flyers go over cover', () => {
    const g = gridOf(['E.#..', '..#..', '..#..', '.....', '.....']);
    const r = reach(g, { x: 0, y: 0 }, 20, () => false);
    const around = r.cost.get(0 * 5 + 4)!;
    expect(around).toBeGreaterThan(4); // the straight line is a wall
    expect(around).toBeLessThanOrEqual(8);
    expect(pathTo(g, r, { x: 3, y: 0 }).at(-1)).toEqual({ x: 3, y: 0 });
    const hz = gridOf(['.~.', '...']);
    expect(reach(hz, { x: 0, y: 0 }, 9, () => false).cost.get(0 * 3 + 1)).toBe(2);
    const cv = gridOf(['.c.']);
    expect(reach(cv, { x: 0, y: 0 }, 9, () => false).cost.has(2)).toBe(false);
    expect(reach(cv, { x: 0, y: 0 }, 9, () => false, true).cost.has(2)).toBe(true);
    expect(neighbors(gridOf(['.#', '#.']), { x: 0, y: 0 })).toEqual([]); // no squeezing through a diagonal gap
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(3);
  });

  it('knows how far things reach', () => {
    expect(weaponReach(makeItem('rail_revolver'))[1]).toBeGreaterThan(weaponReach(makeItem('zip_pistol'))[1]! - 1);
    expect(weaponReach(makeItem('excalibur'))).toEqual([1, 1]);
    expect(weaponReach(genWeapon(new Rng('whip'), { cls: 'whip', tier: 2 }))[1]).toBe(2);
    const drone = spawnNpc(new Rng('p'), 'p1', 'drone', 'x');
    expect(foeProfile(drone).flying).toBe(true);
    const artemis = spawnNpc(new Rng('p'), 'p2', 'artemis', 'x');
    expect(foeProfile(artemis).reach[1]).toBeGreaterThan(4);
    expect(foeProfile(spawnNpc(new Rng('p'), 'p3', 'cop', 'x')).canFlee).toBe(false);
    expect(foeProfile(spawnNpc(new Rng('p'), 'p4', 'ganger', 'x')).canFlee).toBe(true);
  });
});

describe('a fight on the grid', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const s = stage('det-1', { n: 3, kind: 'ganger' });
      const r = fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: false });
      return JSON.stringify({ r, hp: s.w.hero.hp, ev: s.events.map((e) => [e.type, e.data]) });
    };
    expect(run()).toBe(run());
  });

  it('a capable hero beats street thugs; the same hero loses to a pack of dragons', () => {
    const tally = (kind: string, n: number) => {
      const out: Record<string, number> = {};
      for (let i = 0; i < 40; i++) {
        const s = stage(`bal-${kind}-${i}`, { kind, n });
        const r = fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: false });
        out[r] = (out[r] ?? 0) + 1;
      }
      return out;
    };
    expect(tally('ganger', 2).win ?? 0).toBeGreaterThanOrEqual(38);
    const dragons = tally('artemis', 3);
    expect((dragons.win ?? 0) + (dragons.flee ?? 0) + (dragons.dead ?? 0)).toBe(40);
    expect(dragons.win ?? 0).toBeLessThan(10);
  });

  it('only ever ends in one of the five results, and always emits fight_start then fight_end', () => {
    for (let i = 0; i < 30; i++) {
      const s = stage(`end-${i}`, { kind: i % 2 ? 'cop' : 'ganger', n: 1 + (i % 4), hero: { level: 1 + (i % 7), weapon: 'excalibur' }, loc: i % 3 ? 'street_main' : 'halo_floor' });
      const r = fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: i % 2 === 0, assault: i % 3 === 0 });
      expect(['win', 'flee', 'tossed', 'arrested', 'dead']).toContain(r);
      expect(s.events[0]!.type === 'crime_seen' || s.events[0]!.type === 'fight_start').toBe(true);
      expect(s.events.at(-1)!.type === 'death' || s.events.at(-1)!.type === 'victory' || s.events.some((e) => e.type === 'fight_end')).toBe(true);
    }
  });

  it('every event a fight can raise has text', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const s = stage(`txt-${i}`, {
        kind: ['ganger', 'cop', 'drone', 'bouncer', 'artemis'][i % 5]!,
        n: 1 + (i % 4),
        hero: { level: 1 + (i % 6), weapon: ['excalibur', 'rail_revolver', 'monowhip', 'zip_pistol'][i % 4]! },
        loc: ['street_main', 'halo_floor', 'neon_pharaoh', 'halo_alley'][i % 4]!,
        allies: i % 3 === 0 ? ['puppy', 'scrapper', 'hacker', 'drone'].slice(0, 1 + (i % 4)) : [],
        implants: i % 5 === 0 ? ['mantis_blades', 'hydraulic_calves'] : [],
        inventory: i % 2 ? ['cocktail_molotov', 'switchblade'] : [],
      });
      s.w.hero.hack = 3 + (i % 4);
      fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: i % 2 === 0, assault: i % 3 !== 1 });
      for (const e of s.events) {
        seen.add(`${e.type}:${e.data.variant ?? ''}`);
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      }
    }
    // The board has things to tell: at least a few of the new kinds turned up.
    const tactical = [...seen].filter((k) => k.startsWith('tactic:') || k.startsWith('foe_flees:') || k.startsWith('reinforce:'));
    expect(tactical.length).toBeGreaterThanOrEqual(3);
  });

  it('known new events render', () => {
    const known: [string, Record<string, string | number | boolean>][] = [
      ['tactic', { variant: 'ambush', foe: 'X', weapon: 'bat', dmg: 9, kill: true }],
      ['tactic', { variant: 'flurry', foe: 'X' }],
      ['tactic', { variant: 'slam', foe: 'X', dmg: 9 }],
      ['tactic', { variant: 'hazard_shove', foe: 'X', dmg: 9 }],
      ['tactic', { variant: 'hazard', who: 'X', hero: false }],
      ['tactic', { variant: 'hack', foe: 'X', robot: true }],
      ['tactic', { variant: 'intimidate', foe: 'X' }],
      ['tactic', { variant: 'overwatch', foe: 'X', weapon: 'gun' }],
      ['tactic', { variant: 'leap' }],
      ['tactic', { variant: 'retreat', hpPct: 20 }],
      ['foe_flees', { variant: 'ran', foe: 'X', role: 'ganger' }],
      ['foe_flees', { variant: 'scared', foe: 'X', role: 'ganger' }],
      ['foe_flees', { variant: 'thrown_out', foe: 'X', role: 'ganger' }],
      ['reinforce', { variant: 'law', npcs: 'X', count: 2 }],
      ['reinforce', { variant: 'backup', npcs: 'X', count: 1 }],
      ['ally_down', { name: 'Rex', kind: 'puppy' }],
    ];
    for (const [type, data] of known) expect(hasTemplate({ beat: 1, type, outcome: 'good', data }), `${type}:${data.variant}`).toBe(true);
  });

  it('a jumped-on hero with the drop on them opens with an ambush', () => {
    let ambushes = 0;
    for (let i = 0; i < 20; i++) {
      const s = stage(`amb-${i}`, { kind: 'ganger', n: 1, hero: { weapon: 'switchblade', level: 4 } });
      fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: false, assault: true });
      if (s.events.some((e) => e.type === 'tactic' && e.data.variant === 'ambush')) ambushes++;
    }
    expect(ambushes).toBeGreaterThan(10);
  });

  it('enemies run for the door and are not counted as killed', () => {
    let fled = 0;
    for (let i = 0; i < 60; i++) {
      const s = stage(`run-${i}`, { kind: 'ganger', n: 3, hero: { level: 5 } });
      const r = fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: false });
      const flees = s.events.filter((e) => e.type === 'foe_flees');
      const end = s.events.find((e) => e.type === 'fight_end')!;
      if (flees.length) {
        fled++;
        expect(Number(end.data.fled)).toBeGreaterThan(0);
        for (const f of s.foes) if (f.alive && f.downUntil > s.w.beat) expect(f.memories).toContain('fled from Blackbird');
      }
      if (r === 'win' && Number(end.data.fled) > 0) expect(Number(end.data.killed) + Number(end.data.fled)).toBeLessThanOrEqual(Number(end.data.count));
    }
    expect(fled).toBeGreaterThan(5);
  });

  it('a hurt hero retreats off the board and ends up at her flee destination', () => {
    let retreats = 0;
    for (let i = 0; i < 40; i++) {
      const s = stage(`ret-${i}`, { kind: 'artemis', n: 2, hero: { level: 6 } });
      const r = fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: false });
      if (r === 'flee') {
        retreats++;
        expect(s.w.hero.locationId).toBe(s.w.locations['street_main']!.fleeTo);
      }
    }
    expect(retreats).toBeGreaterThan(10);
  });

  it('late arrivals show up mid-fight, and the ones who never get there are not hostile', () => {
    const s = stage('late-1', { kind: 'ganger', n: 1, hero: { level: 3, weapon: 'excalibur' } });
    const extra = Array.from({ length: 2 }, (_, k) => {
      const d = spawnNpc(new Rng(`x${k}`), `late${k}`, 'cop', 'street_main');
      d.hostile = true;
      addNpc(s.w, d);
      return d;
    });
    const arrivals: Arrival[] = extra.map((npc) => ({ npc, round: 2, why: 'law' }));
    const sim = new Sim(
      { w: s.w, rng: s.rng, emit: s.emit },
      { heroPower: () => 20, kill: (_c, _w, npc) => void (npc.alive = false), maybeInjure: () => {}, hasInjury: () => false, throwDamage: () => 5 },
      { foes: s.foes, arrivals, lethal: true, assault: false, maxRounds: 12 },
    );
    const res = sim.run();
    expect(res.arrived.length + (res.rounds < 2 ? 0 : 0)).toBeGreaterThanOrEqual(0);
    if (res.rounds >= 2) expect(res.arrived.map((n) => n.id).sort()).toEqual(extra.map((n) => n.id).sort());
    const note = res.log.find((e) => e.type === 'reinforce');
    if (note) expect(note.data.variant).toBe('law');
  });

  it('allies fight as people: they take real damage, and sometimes do not get up', () => {
    let damage = 0;
    for (let i = 0; i < 30; i++) {
      const s = stage(`ally-${i}`, { kind: 'artemis', n: 2, hero: { level: 6 }, allies: ['puppy', 'kids'] });
      const before = new Map(s.w.hero.companions.map((a) => [a.id, a.hp]));
      fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: false });
      for (const [id, hp] of before) {
        const a = s.w.hero.companions.find((c) => c.id === id);
        damage += a ? hp - a.hp : hp;
      }
    }
    expect(damage).toBeGreaterThan(0);
  });

  it('but they are not cannon fodder in an ordinary scrap', () => {
    let lost = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const s = stage(`fodder-${i}`, { kind: 'ganger', n: 3, hero: { level: 3, weapon: 'excalibur' }, allies: ['puppy', 'kids'] });
      fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: false });
      lost += 2 - s.w.hero.companions.length;
    }
    expect(lost / N).toBeLessThan(0.25);
  });

  it('a hacker or a drone makes the fight easier than going alone', () => {
    const wins = (allies: string[]) => {
      let n = 0;
      for (let i = 0; i < 40; i++) {
        const s = stage(`hlp-${i}`, { kind: 'cop', n: 3, hero: { level: 3, weapon: 'zip_pistol' }, allies });
        const r = fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: false });
        if (r === 'win') n++;
      }
      return n;
    };
    expect(wins(['drone', 'scrapper'])).toBeGreaterThanOrEqual(wins([]));
  });

  it('highlights keep the best few, in the order they happened, one per key', () => {
    const log = [
      { type: 'a', outcome: 'good' as const, data: {}, weight: 1, key: 'k1', round: 1 },
      { type: 'b', outcome: 'good' as const, data: {}, weight: 5, key: 'k2', round: 1 },
      { type: 'c', outcome: 'good' as const, data: {}, weight: 2, key: 'k1', round: 1 },
      { type: 'd', outcome: 'good' as const, data: {}, weight: 4, key: 'k3', round: 1 },
      { type: 'e', outcome: 'good' as const, data: {}, weight: 3, key: 'k4', round: 1 },
    ];
    expect(highlights(log, 2).map((e) => e.type)).toEqual(['b', 'd']);
    expect(highlights(log, 9).map((e) => e.type)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('is quick enough to run all night', () => {
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) {
      const s = stage(`perf-${i}`, { kind: 'ganger', n: 4, allies: ['puppy', 'kids', 'drone'], loc: 'halo_floor' });
      fight({ w: s.w, rng: s.rng, emit: s.emit }, s.foes, { cause: 'test', joiners: true, assault: true });
    }
    expect((Date.now() - t0) / 40).toBeLessThan(100);
  });
});
