import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, type GameEvent, type World } from './index';
import { relocate } from './combat';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc } from './population';
import { MAKES, makesOf, vehicleOf } from './cars';
import { footChance, isBump, stumble } from './footfx';
import { onFoot, policeChase, pursuers, runChase } from './chase';
import { registerGetaways, getawayCandidates } from './getaway';
import { perform } from './run';
import type { Ctx, Id, Location } from './types';

const ctxOf = (w: World, rng: Rng): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

/** Streets of the given names hung off street_main in a row; the first is where she stands unless told otherwise. */
function strip(w: World, names: string[], district = 'nightlife'): Id[] {
  const base = w.locations.street_main!;
  let prev: Location = base;
  return names.map((name, i) => {
    const id = `F_${i}`;
    const loc: Location = { ...base, id, name, road: name === 'Highway' ? 'highway' : undefined, exits: [{ to: prev.id, label: 'back', hidden: false, gate: null }], gen: { district } as never, crowded: false, cameras: 0, populated: true };
    w.locations[id] = loc;
    prev.exits.push({ to: id, label: name, hidden: false, gate: null });
    prev = loc;
    return id;
  });
}

/** A world with her standing on a street of this name, at this hour. */
function on(seed: string, names: string[], hour: number, o: { level?: number; district?: string } = {}) {
  const w = createWorld({ seed, competence: 0.6 });
  w.clock = hour * 60;
  const ids = strip(w, names, o.district);
  w.hero.locationId = ids[0]!;
  w.hero.level = o.level ?? 6;
  w.hero.maxHp = w.hero.hp = 90 + 13 * ((o.level ?? 6) - 1);
  return { w, ids };
}

const guy = (w: World, id: string, kind = 'ganger'): ReturnType<typeof spawnNpc> => {
  const n = spawnNpc(new Rng(id), id, kind, w.hero.locationId);
  addNpc(w, n);
  return n;
};

describe('the odds on foot', () => {
  const w = createWorld({ seed: 'foot-odds', competence: 0.5 });

  it('are people on the small streets and cars on the big ones, and a highway is no place to run', () => {
    expect(isBump('alley')).toBe(true);
    expect(isBump('pedestrian')).toBe(true);
    expect(isBump('small')).toBe(true);
    expect(isBump('street')).toBe(false);
    expect(isBump('highway')).toBe(false);
    expect(footChance(w, 'highway', 1, 0.6)).toBeGreaterThan(footChance(w, 'street', 1, 0.6));
  });

  it('rise with traffic and with how hard she runs, and fall with athletics', () => {
    for (const k of ['alley', 'small', 'pedestrian', 'street', 'highway'] as const) {
      expect(footChance(w, k, 0.7, 0.9)).toBeGreaterThan(footChance(w, k, 0.7, 0.05));
      expect(footChance(w, k, 1, 0.5)).toBeGreaterThan(footChance(w, k, 0.5, 0.5));
    }
    const w2 = createWorld({ seed: 'foot-odds2', competence: 0.5 });
    const base = footChance(w2, 'pedestrian', 1, 0.6);
    w2.hero.skills.athletics = 2000;
    expect(footChance(w2, 'pedestrian', 1, 0.6)).toBeLessThan(base * 0.5);
  });
});

describe('what goes wrong on foot', () => {
  it('on a small street it is somebody: a lost step, and sometimes they come after her', () => {
    const seen = { bump: 0, angry: 0 };
    for (let i = 0; i < 150; i++) {
      const { w, ids } = on(`bump-${i}`, ['Velvet Walk'], 1);
      w.locations[ids[0]!]!.crowded = true;
      const { c, events } = ctxOf(w, new Rng(`bump-${i}`));
      const st = stumble(c, w.locations[ids[0]!]!, 'pedestrian', 1);
      expect(st.lost).toBeGreaterThan(0);
      expect(st.down).toBe(false);
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      if (events.some((e) => e.type === 'accident' && e.data.variant === 'bump')) seen.bump++;
      if (st.angry) seen.angry++;
    }
    expect(seen.bump).toBe(150);
    expect(seen.angry).toBeGreaterThan(20);
    expect(seen.angry).toBeLessThan(150);
  });

  it('knocking over a police officer or an Atlas agent is heat; knocking over a stranger is not', () => {
    const run = (kind: string): { npd: number; atlas: number } => {
      let npd = 0;
      let atlas = 0;
      for (let i = 0; i < 80; i++) {
        const { w, ids } = on(`law-${kind}-${i}`, ['Velvet Walk'], 1);
        const target = guy(w, `t${i}`, kind);
        moveNpc(w, target, ids[0]!);
        const { c } = ctxOf(w, new Rng(`law-${i}`));
        stumble(c, w.locations[ids[0]!]!, 'pedestrian', 1);
        npd += w.heat.npd ?? 0;
        atlas += w.heat.atlas ?? 0;
      }
      return { npd, atlas };
    };
    expect(run('cop').npd).toBeGreaterThan(20);
    expect(run('helix_guard').atlas + run('helix_guard').npd).toBeGreaterThan(0);
    expect(run('patron').npd).toBe(0);
  });

  it('on a big road it is a car: it hurts, and she either stays up or loses ground', () => {
    let up = 0;
    let down = 0;
    for (let i = 0; i < 200; i++) {
      const { w, ids } = on(`struck-${i}`, ['Pylon Avenue'], 1);
      const hp = w.hero.hp;
      const { c, events } = ctxOf(w, new Rng(`struck-${i}`));
      const st = stumble(c, w.locations[ids[0]!]!, 'street', 1);
      expect(w.hero.hp).toBeLessThan(hp);
      expect(events.some((e) => e.type === 'accident' && (e.data.variant === 'struck' || e.data.variant === 'struck_down'))).toBe(true);
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      if (st.down) {
        down++;
        expect(st.lost).toBeGreaterThan(2);
      } else up++;
    }
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
    // A better athlete stays up more often.
    const stays = (ath: number): number => {
      let n = 0;
      for (let i = 0; i < 200; i++) {
        const { w, ids } = on(`stay-${i}`, ['Pylon Avenue'], 1);
        w.hero.skills.athletics = ath;
        if (!stumble(ctxOf(w, new Rng(`stay-${i}`)).c, w.locations[ids[0]!]!, 'street', 1).down) n++;
      }
      return n;
    };
    expect(stays(3000)).toBeGreaterThan(stays(0));
  });
});

describe('a chase on foot', () => {
  it('works like any other: she runs after somebody, and the legs are what she has', () => {
    const results: Record<string, number> = {};
    for (let i = 0; i < 80; i++) {
      const { w } = on(`fc-${i}`, ['Pylon Avenue'], 20);
      const runner = guy(w, `r${i}`);
      const { c, events } = ctxOf(w, new Rng(`fc-${i}`));
      const r = runChase(c, { mode: 'pursuer', cause: 'test', foes: [onFoot(runner, 4)] });
      results[r] = (results[r] ?? 0) + 1;
      const start = events.find((e) => e.type === 'chase_start')!;
      expect(start.data.body).toBe('foot');
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      if (r === 'caught') expect(events.find((e) => e.type === 'chase_end')?.data.variant).toBe('caught');
    }
    expect(Object.keys(results).length).toBeGreaterThanOrEqual(2);
  });

  it('faster legs catch more: the place her own speed plugs in', () => {
    const caught = (implants: string[]): number => {
      let n = 0;
      for (let i = 0; i < 100; i++) {
        const { w } = on(`legs-${i}`, ['Pylon Avenue'], 20);
        w.hero.implants = implants;
        w.hero.reflex = 8;
        const runner = guy(w, `r${i}`);
        const { c } = ctxOf(w, new Rng(`legs-${i}`));
        if (runChase(c, { mode: 'pursuer', cause: 'test', foes: [onFoot(runner, 5)] }) === 'caught') n++;
      }
      return n;
    };
    expect(caught(['hydraulic_calves'])).toBeGreaterThan(caught([]));
  });

  it('on foot she is run down by a cruiser, and the road still matters', () => {
    const w = on('flee', ['Pylon Avenue'], 20).w;
    const cops = [0, 1].map((k) => guy(w, `cop${k}`, 'npd_officer'));
    w.heat.npd = 5;
    const { c, events } = ctxOf(w, new Rng('flee'));
    const r = runChase(c, { mode: 'pursued', cause: 'test', foes: pursuers(cops) });
    expect(events.find((e) => e.type === 'chase_start')?.data.body).toBe('foot');
    expect(['caught', 'escaped']).toContain(r);
    for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });

  it('a runner in an alley loses the car: she gets out and goes on on foot', () => {
    let out = 0;
    let after = 0;
    for (let i = 0; i < 200; i++) {
      const { w, ids } = on(`alley-${i}`, ['Pylon Avenue', 'Ghost Alley'], 12);
      // The alley is a way off the street she stands on.
      w.locations[ids[0]!]!.exits.push({ to: ids[1]!, label: 'alley', hidden: false, gate: null });
      w.locations[ids[1]!]!.exits.push({ to: ids[0]!, label: 'back', hidden: false, gate: null });
      w.hero.vehicle = vehicleOf(MAKES.police[0]!, `mine-${i}`);
      const runner = guy(w, `r${i}`);
      const { c, events } = ctxOf(w, new Rng(`alley-${i}`));
      runChase(c, { mode: 'pursuer', cause: 'test', foes: [onFoot(runner, 6)], maxRounds: 6 });
      const k = events.findIndex((e) => e.type === 'chase_mount' && e.data.variant === 'dismount_alley');
      if (k >= 0) {
        out++;
        expect(w.hero.vehicle).toBeUndefined();
        expect(w.hero.parked?.some((p) => p.id === `mine-${i}`)).toBe(true);
        if (events.slice(k).some((e) => e.type === 'chase_round' && e.data.body === 'foot')) after++;
      }
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(out).toBeGreaterThan(20);
    expect(after).toBeGreaterThan(0);
  });

  it('and she can choose to get out in a crowded place, to run them down', () => {
    let chose = 0;
    for (let i = 0; i < 200; i++) {
      const { w } = on(`choose-${i}`, ['Velvet Walk'], 1);
      w.locations[w.hero.locationId]!.crowded = true;
      w.hero.vehicle = vehicleOf(MAKES.civilian[0]!, `mine-${i}`);
      const runner = guy(w, `r${i}`);
      const { c, events } = ctxOf(w, new Rng(`choose-${i}`));
      runChase(c, { mode: 'pursuer', cause: 'test', foes: [onFoot(runner, 3)], maxRounds: 6 });
      if (events.some((e) => e.type === 'chase_mount' && e.data.variant === 'dismount')) chose++;
    }
    expect(chose).toBeGreaterThan(0);
  });

  it('cruisers can not follow her into an alley either: they get out and come on foot', () => {
    let out = 0;
    for (let i = 0; i < 200; i++) {
      const { w, ids } = on(`follow-${i}`, ['Pylon Avenue', 'Ghost Alley'], 12);
      w.locations[ids[0]!]!.exits.push({ to: ids[1]!, label: 'alley', hidden: false, gate: null });
      w.locations[ids[1]!]!.exits.push({ to: ids[0]!, label: 'back', hidden: false, gate: null });
      const cops = [0, 1].map((k) => guy(w, `c${k}`, 'npd_officer'));
      w.heat.npd = 5;
      const { c, events } = ctxOf(w, new Rng(`follow-${i}`));
      const foes = pursuers(cops);
      runChase(c, { mode: 'pursued', cause: 'test', foes });
      if (events.some((e) => e.type === 'chase_mount' && e.data.variant === 'foe_out')) {
        out++;
        expect(foes.some((f) => f.foot && !f.car)).toBe(true);
      }
    }
    expect(out).toBeGreaterThan(0);
  });

  it('thrown off a bike with the bike lying behind her, she goes on on foot if she can', () => {
    let on = 0;
    let onFoot = 0;
    for (let i = 0; i < 300; i++) {
      const w = createWorld({ seed: `thrown-${i}`, competence: 0.6 });
      w.hero.locationId = 'street_main';
      w.hero.level = 8;
      w.hero.maxHp = w.hero.hp = 180;
      w.heat.npd = 6;
      w.hero.vehicle = vehicleOf(makesOf('civilian', 'bike')[1]!, `bike-${i}`);
      const { c, events } = ctxOf(w, new Rng(`thrown-${i}`));
      policeChase(c, 'ambush');
      const k = events.findIndex((e) => e.type === 'chase_mount' && ['thrown', 'bail', 'door'].includes(String(e.data.variant)));
      if (k >= 0) {
        on++;
        // The bike is left where it fell, and if the chase goes on, she is on foot for it.
        expect((w.hero.parked ?? []).some((v) => v.id === `bike-${i}`) || w.hero.vehicle?.id === `bike-${i}` || Object.keys(w.flags).some((f) => f.startsWith('wreck:'))).toBe(true);
        for (const e of events.slice(k)) if (e.type === 'chase_round' && w.hero.vehicle === undefined) expect(['foot', 'bike', 'car']).toContain(e.data.body);
        if (events.slice(k).some((e) => e.type === 'chase_round' && e.data.body === 'foot')) onFoot++;
      }
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(on).toBeGreaterThan(0);
    expect(onFoot).toBeGreaterThan(0);
  });

  it('on foot she can grab a vehicle on the street and ride on', () => {
    let grabbed = 0;
    let rode = 0;
    for (let i = 0; i < 300; i++) {
      const { w, ids } = on(`grab-${i}`, ['Pylon Avenue'], 20);
      w.hero.parked = [{ ...vehicleOf(makesOf('civilian', 'bike')[1]!, `near-${i}`), at: ids[0]!, until: w.clock + 9999 }];
      const cops = [0, 1].map((k) => guy(w, `c${k}`, 'npd_officer'));
      w.heat.npd = 5;
      const { c, events } = ctxOf(w, new Rng(`grab-${i}`));
      runChase(c, { mode: 'pursued', cause: 'test', foes: pursuers(cops) });
      const k = events.findIndex((e) => e.type === 'chase_mount' && e.data.variant === 'remount');
      if (k >= 0) {
        grabbed++;
        // She is on it: from then on the chase is a bike's, until it ends.
        for (const e of events.slice(k)) if (e.type === 'chase_round') expect(['bike', 'foot']).toContain(e.data.body);
        if (events.slice(k).some((e) => e.type === 'chase_round' && e.data.body === 'bike')) rode++;
      }
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(grabbed).toBeGreaterThan(0);
    expect(rode).toBeGreaterThan(0);
  });

  it('people she knocked into can come after her when it is over', () => {
    let followed = 0;
    for (let i = 0; i < 200; i++) {
      const { w, ids } = on(`owed-${i}`, ['Velvet Walk', 'Velvet Walk'], 1);
      for (const id of ids) w.locations[id]!.crowded = true;
      for (let k = 0; k < 4; k++) guy(w, `p${k}`, 'patron');
      const runner = guy(w, `r${i}`);
      const { c, events } = ctxOf(w, new Rng(`owed-${i}`));
      runChase(c, { mode: 'pursuer', cause: 'test', foes: [onFoot(runner, 3)] });
      if (events.filter((e) => e.type === 'chase_start').length > 1) followed++;
      for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
    expect(followed).toBeGreaterThan(0);
  });
});

describe('running people down', () => {
  it('a wanted person who runs on foot is one she can go after, on foot or on wheels', () => {
    const w = on('runner', ['Pylon Avenue'], 20).w;
    relocate(w, w.hero.locationId);
    const n = guy(w, 'fleer');
    w.mind.goals.push({ id: 'g1', kind: 'kill', npc: n.id } as never);
    const { c, events } = ctxOf(w, new Rng('runner'));
    registerGetaways(c, w.locations[w.hero.locationId]!, [], [n]);
    expect(w.getaways).toHaveLength(1);
    expect(w.getaways![0]!.vehicle).toBeUndefined();
    expect(n.locationId).toBe('_away');
    expect(events.some((e) => e.type === 'getaway' && e.data.body === 'foot')).toBe(true);
    const cand = getawayCandidates(w)[0]!;
    expect(cand.key).toBe(`pursue:${n.id}`);
    perform(c, cand);
    expect(events.some((e) => e.type === 'chase_start' && e.data.body === 'foot')).toBe(true);
    for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);

    // With a car under her it is a different chase.
    const w2 = on('runner2', ['Pylon Avenue'], 20).w;
    relocate(w2, w2.hero.locationId);
    w2.hero.vehicle = vehicleOf(MAKES.police[0]!, 'mine');
    const n2 = guy(w2, 'fleer2');
    const x = ctxOf(w2, new Rng('runner2'));
    registerGetaways(x.c, w2.locations[w2.hero.locationId]!, [], [n2]);
    perform(x.c, getawayCandidates(w2)[0]!);
    expect(x.events.find((e) => e.type === 'chase_start')?.data.body).toBe('car');
    for (const e of x.events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });
});
