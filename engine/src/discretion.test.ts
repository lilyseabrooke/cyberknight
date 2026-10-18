import { describe, expect, it } from 'vitest';
import { inCameraView, slow } from './testkit';
import { Rng, runToEnd, hasTemplate, type World, type GameEvent } from './index';
import { createWorld } from './world';
import { spawnNpc } from './content/archetypes';
import { fight } from './combat';
import { gather } from './interactions';
import { scanBounties, assignBounties, hasBounty, knowsBounty } from './bounty';
import { discretion, exposure, sweepOdds, caution } from './discretion';
import { score } from './run';
import { IMPLANTS } from './content/implants';
import { addNpc, moveNpc } from './population';
import { camerasSeeHer, placeOf } from './placeboard';

const at = (loc: string, seed = 'dc') => {
  const w = createWorld({ seed, competence: 0.5 });
  w.hero.locationId = loc;
  w.hero.inventory = [];
  return w;
};
const ctxFor = (w: World, seed = 'ctx') => {
  const events: GameEvent[] = [];
  const c = { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) };
  return { c, events };
};
const empty = (w: World, keep: string[] = []) => {
  for (const n of Object.values(w.npcs)) if (n.locationId === w.hero.locationId && !keep.includes(n.id)) moveNpc(w, n, '_gone');
};
const person = (w: World, id: string, archetype = 'ganger', extra: Partial<ReturnType<typeof spawnNpc>> = {}) => {
  const n = spawnNpc(new Rng(id), id, archetype, w.hero.locationId);
  Object.assign(n, extra);
  addNpc(w, n);
  return n;
};

describe('bounties', () => {
  it('every night has some posted bounties and some hidden ones, on people who could plausibly be wanted', () => {
    for (let i = 0; i < 30; i++) {
      const w = createWorld({ seed: `b${i}`, competence: 0.3 });
      const wanted = Object.values(w.npcs).filter((n) => n.bounty);
      expect(wanted.some((n) => !n.bounty!.hidden), `posted ${i}`).toBe(true);
      expect(wanted.some((n) => n.bounty!.hidden), `hidden ${i}`).toBe(true);
      for (const n of wanted) {
        expect(n.bounty!.amount).toBeGreaterThan(0);
        expect(n.tags).not.toContain('cop');
        expect(n.tags).not.toContain('boss');
      }
    }
  });

  it('assigning bounties is deterministic', () => {
    const a = createWorld({ seed: 'same', competence: 0.3 });
    const b = createWorld({ seed: 'same', competence: 0.3 });
    expect(Object.values(a.npcs).map((n) => n.bounty)).toEqual(Object.values(b.npcs).map((n) => n.bounty));
    const npcs = { x: spawnNpc(new Rng('x'), 'x', 'dealer', 'halo_floor') };
    assignBounties(npcs, new Rng('y'));
    expect(npcs.x.bounty).toBeDefined();
  });

  it('her optics read a posted bounty on sight, but not a hidden one', () => {
    const w = at('halo_roof');
    empty(w);
    const posted = person(w, 'p1', 'ganger', { bounty: { amount: 200, hidden: false } });
    const hidden = person(w, 'h1', 'dealer', { bounty: { amount: 300, hidden: true } });
    const r = ctxFor(w);
    scanBounties(r.c);
    expect(knowsBounty(w, posted.id)).toBe(true);
    expect(knowsBounty(w, hidden.id)).toBe(false);
    expect(r.events.map((e) => e.type)).toEqual(['bounty_scan']);
    expect(r.events[0]!.data.variant).toBe('posted');
  });

  it('a bounty-grade scanner reads the hidden ones too', () => {
    const w = at('halo_roof');
    empty(w);
    const hidden = person(w, 'h1', 'dealer', { bounty: { amount: 300, hidden: true } });
    w.hero.implants.push('bounty_scanner');
    expect(IMPLANTS.bounty_scanner!.flag).toBe('bounty_scan');
    const r = ctxFor(w);
    scanBounties(r.c);
    expect(w.mind.bounties![hidden.id]).toBe('scanner');
    expect(r.events[0]!.data.variant).toBe('scanner');
  });

  it('busted optics read nothing', () => {
    const w = at('halo_roof');
    empty(w);
    const posted = person(w, 'p1', 'ganger', { bounty: { amount: 200, hidden: false } });
    w.hero.injuries.push('fried_optics');
    scanBounties(ctxFor(w).c);
    expect(knowsBounty(w, posted.id)).toBe(false);
  });

  it('a tip from someone who talks gives up a hidden bounty', () => {
    let tipped = 0;
    for (let i = 0; i < 40; i++) {
      const w = at('halo_floor', `tip${i}`);
      const ray = w.npcs.ray!;
      const target = person(w, 'target', 'dealer', { bounty: { amount: 250, hidden: true }, locationId: 'halo_alley' });
      const cand = gather(w).find((x) => x.key === `chat:${ray.id}`)!;
      const r = ctxFor(w, `t${i}`);
      cand.run(r.c);
      if (knowsBounty(w, target.id)) {
        tipped++;
        expect(w.mind.bounties![target.id]).toBe('tip');
        expect(r.events.some((e) => e.type === 'chat' && e.data.variant === 'rumor_bounty')).toBe(true);
      }
    }
    expect(tipped).toBeGreaterThan(3);
  });

  it('collecting: the NPD pays on a win', () => {
    const w = at('halo_roof');
    empty(w);
    const foe = person(w, 'p1', 'ganger', { bounty: { amount: 200, hidden: false }, hp: 4, maxHp: 4 });
    const cash = w.hero.cash;
    const r = ctxFor(w);
    fight(r.c, [foe], { cause: 'test', joiners: false });
    expect(w.hero.cash).toBeGreaterThanOrEqual(cash + 200);
    expect(r.events.some((e) => e.type === 'bounty_paid')).toBe(true);
    expect(foe.bounty).toBeUndefined();
  });
});

describe('hitting someone with paper on them', () => {
  const brawl = (w: World, victimId: string, seed = 'a') => {
    const foe = w.npcs[victimId]!;
    foe.hp = foe.maxHp = 6;
    const r = ctxFor(w, seed);
    fight(r.c, [foe], { cause: 'test', joiners: false, assault: true });
    return r.events;
  };

  it('a camera still sees it, but there is no police heat', () => {
    const w = at('street_main');
    empty(w);
    person(w, 'v', 'ganger', { bounty: { amount: 200, hidden: false } });
    inCameraView(w);
    const evs = brawl(w, 'v');
    expect(evs.find((e) => e.type === 'crime_seen')?.data.variant).toBe('camera');
    expect(evs.some((e) => e.type === 'bounty_hit')).toBe(true);
    expect(evs.some((e) => e.type === 'heat_up')).toBe(false);
    expect(w.heat.npd).toBe(0);
  });

  it('the same hit on someone who is not wanted does bring police heat', () => {
    const w = at('street_main');
    empty(w);
    person(w, 'v', 'ganger');
    inCameraView(w);
    brawl(w, 'v');
    expect(w.heat.npd).toBeGreaterThanOrEqual(1);
  });

  it('witnesses still freak out, and the victim\'s crew still hears about it', () => {
    let reacted = 0;
    let crew = 0;
    for (let i = 0; i < 20; i++) {
      const w = at('halo_roof', `wit${i}`);
      empty(w);
      const v = person(w, 'v', 'ganger', { bounty: { amount: 200, hidden: false }, faction: 'viper' });
      for (let k = 0; k < 3; k++) person(w, `bystander${k}`, 'patron', { faction: k === 0 ? 'viper' : null });
      const evs = brawl(w, v.id, `w${i}`);
      reacted += evs.filter((e) => e.type === 'bystander').length;
      expect(w.heat.npd, 'police').toBe(0);
      if ((w.heat.viper ?? 0) > 0) crew++;
    }
    expect(reacted).toBeGreaterThan(10);
    expect(crew).toBeGreaterThan(0);
  });

  it('a bounty does not make Atlas premises any safer', () => {
    const w = at('helix_lobby');
    empty(w);
    person(w, 'v', 'ganger', { bounty: { amount: 200, hidden: false } });
    // (The cameras sweep: wait for a beat when one of them is on her.)
    const p = placeOf(w)!;
    p.board.hero = { x: Math.floor(p.layout.grid.w / 2), y: Math.floor(p.layout.grid.h / 2) };
    for (let t = 0; t < 8 && !camerasSeeHer(w); t++) w.beat = t;
    expect(camerasSeeHer(w)).toBe(true);
    brawl(w, 'v');
    expect(w.heat.atlas).toBeGreaterThanOrEqual(1);
  });

  it('a drone watching still reports to Atlas', () => {
    const w = at('halo_roof');
    empty(w);
    person(w, 'v', 'ganger', { bounty: { amount: 200, hidden: false } });
    person(w, 'drone1', 'drone');
    brawl(w, 'v');
    expect(w.heat.npd).toBe(0);
    expect(w.heat.atlas).toBeGreaterThanOrEqual(1);
  });
});

describe('discretion', () => {
  it('she is much less keen to start something in view of people than alone', () => {
    const crowd = at('halo_floor');
    const t1 = person(crowd, 't', 'ganger');
    const alone = at('halo_roof');
    empty(alone);
    const t2 = person(alone, 't', 'ganger');
    alone.flags.blackout = true; // nothing watching
    const key = (t: string) => ({ key: `challenge:${t}`, drives: {}, run: () => undefined });
    expect(discretion(crowd, key(t1.id))).toBeGreaterThan(3);
    expect(discretion(alone, key(t2.id))).toBe(0);
  });

  it('being cautious is a matter of degree: competence and a cool head raise it', () => {
    const w = at('halo_roof');
    w.hero.competence = 0.1;
    const low = caution(w);
    w.hero.competence = 0.9;
    expect(caution(w)).toBeGreaterThan(low);
  });

  it('a known bounty makes the same crowd far less of a worry, though not none', () => {
    const w = at('halo_floor');
    const t = person(w, 't', 'ganger', { bounty: { amount: 200, hidden: false } });
    const cand = { key: `challenge:${t.id}`, drives: {}, run: () => undefined };
    const before = discretion(w, cand);
    w.mind.bounties = { [t.id]: 'scan' };
    const after = discretion(w, cand);
    expect(after).toBeLessThan(before * 0.4);
    expect(after).toBeGreaterThan(0);
  });

  it('an unknown bounty is no comfort: she is cautious about what she does not know', () => {
    const w = at('halo_floor');
    const t = person(w, 't', 'ganger', { bounty: { amount: 200, hidden: true } });
    const cand = { key: `challenge:${t.id}`, drives: {}, run: () => undefined };
    const before = discretion(w, cand);
    expect(before).toBeGreaterThan(3);
  });

  it('cameras count as everyone watching', () => {
    const w = at('street_main');
    empty(w);
    const t = person(w, 't', 'ganger');
    expect(exposure(w, w.hero.locationId, [t]).p).toBe(1);
    w.flags.blackout = true;
    expect(exposure(w, w.hero.locationId, [t]).p).toBe(0);
  });

  it('the scoring layer applies it: a crowded challenge scores worse than the same one alone', () => {
    const crowd = at('halo_floor', 'sc');
    const t1 = person(crowd, 'tt', 'ganger');
    const alone = at('halo_roof', 'sc');
    empty(alone);
    alone.flags.blackout = true;
    const t2 = person(alone, 'tt', 'ganger');
    const pick = (w: World, id: string) => gather(w).find((x) => x.key === `challenge:${id}`)!;
    expect(score(alone, pick(alone, t2.id))).toBeGreaterThan(score(crowd, pick(crowd, t1.id)) + 2);
  });

  describe('sweeping the room', () => {
    it('is on the table when the witnesses are few and weak, and she is healthy', () => {
      const w = at('halo_roof');
      empty(w);
      w.flags.blackout = true;
      w.hero.hp = w.hero.maxHp;
      const t = person(w, 't', 'ganger', { power: 3 });
      person(w, 'a', 'patron', { power: 2 });
      expect(sweepOdds(w, t).odds).toBeGreaterThan(0.4);
      const w2 = at('halo_roof', 'sc2');
      empty(w2);
      w2.flags.blackout = true;
      const t2 = person(w2, 't', 'ganger', { power: 3, affinity: -40 });
      person(w2, 'a', 'patron', { power: 2 });
      expect(gather(w2).some((x) => x.key === `sweep:${t2.id}`)).toBe(true);
    });

    it('is not when she is hurt, outgunned, or being filmed', () => {
      const mk = () => {
        const w = at('halo_roof');
        empty(w);
        w.flags.blackout = true;
        w.hero.hp = w.hero.maxHp;
        const t = person(w, 't', 'ganger', { power: 3 });
        person(w, 'a', 'patron', { power: 2 });
        return { w, t };
      };
      const hurt = mk();
      hurt.w.hero.hp = 20;
      expect(sweepOdds(hurt.w, hurt.t).odds).toBe(0);
      const heavy = mk();
      person(heavy.w, 'b', 'bouncer');
      person(heavy.w, 'c', 'bouncer');
      expect(sweepOdds(heavy.w, heavy.t).odds).toBe(0);
      const filmed = mk();
      filmed.w.flags.blackout = false;
      filmed.w.locations.halo_roof!.cameras = 1;
      expect(sweepOdds(filmed.w, filmed.t).odds).toBe(0);
      const cop = mk();
      person(cop.w, 'cop1', 'cop');
      expect(sweepOdds(cop.w, cop.t).odds).toBe(0);
    });

    it('everybody who would have seen it is in the fight, so nobody saw it and nobody calls it in', () => {
      const w = at('halo_roof');
      empty(w);
      w.flags.blackout = true;
      w.hero.hp = w.hero.maxHp;
      w.hero.level = 6;
      const t = person(w, 't', 'ganger', { power: 3, affinity: -40, hp: 5, maxHp: 5 });
      person(w, 'a', 'patron', { power: 2, hp: 5, maxHp: 5 });
      person(w, 'b', 'patron', { power: 2, hp: 5, maxHp: 5 });
      const sweep = gather(w).find((x) => x.key === `sweep:${t.id}`)!;
      expect(sweep).toBeDefined();
      const r = ctxFor(w, 'sw');
      sweep.run(r.c);
      expect(r.events.some((e) => e.type === 'sweep')).toBe(true);
      expect(r.events.find((e) => e.type === 'crime_seen')?.data.variant).toBe('none');
      expect(w.heat.npd).toBe(0);
    });
  });

  describe('getting them alone', () => {
    const setup = (seed: string, archetype = 'ganger') => {
      const w = at('halo_floor', seed);
      w.hero.hp = w.hero.maxHp;
      const t = person(w, 'mark', archetype, { affinity: -20 });
      // make the room a bad place for it, and a quiet exit available
      for (const n of Object.values(w.npcs)) if (n.locationId === 'halo_alley' && n.id !== 'mark') moveNpc(w, n, '_gone');
      w.locations.halo_alley!.cameras = 0;
      w.mind.goals.push({ id: 99, kind: 'kill', parent: null, npc: t.id, mode: 'kill', why: 'test', desire: 0.9, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });
      w.mind.nextId = 100;
      return { w, t };
    };

    it('offers to lure or tail a wanted target out of a crowd, and not when it is already quiet', () => {
      const { w, t } = setup('lt');
      const keys = gather(w).map((x) => x.key);
      expect(keys).toContain(`lure:${t.id}`);
      expect(keys).toContain(`tail:${t.id}`);
      const quiet = at('halo_roof');
      empty(quiet);
      quiet.flags.blackout = true;
      const q = person(quiet, 'mark', 'ganger', { affinity: -20 });
      quiet.mind.goals.push({ id: 99, kind: 'kill', parent: null, npc: q.id, mode: 'kill', why: 'test', desire: 0.9, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });
      expect(gather(quiet).map((x) => x.key)).not.toContain(`lure:${q.id}`);
    });

    it('a lure that works takes both of them somewhere quieter', () => {
      let worked = 0;
      for (let i = 0; i < 30; i++) {
        const { w, t } = setup(`lure${i}`);
        const r = ctxFor(w, `l${i}`);
        gather(w).find((x) => x.key === `lure:${t.id}`)!.run(r.c);
        if (r.events[0]!.data.variant === 'ok') {
          worked++;
          expect(w.hero.locationId).toBe(t.locationId);
          expect(w.hero.locationId).not.toBe('halo_floor');
          expect(exposure(w, w.hero.locationId, [t]).p).toBeLessThan(exposure(w, 'halo_floor', [t]).p);
        } else {
          expect(w.hero.locationId).toBe('halo_floor');
        }
      }
      expect(worked).toBeGreaterThan(3);
      expect(worked).toBeLessThan(30);
    });

    it('tailing is slow: she waits, then follows when they move', () => {
      const out = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const { w, t } = setup(`tail${i}`);
        const r = ctxFor(w, `t${i}`);
        gather(w).find((x) => x.key === `tail:${t.id}`)!.run(r.c);
        out.add(String(r.events[0]!.data.variant));
        if (r.events[0]!.data.variant === 'follow') expect(w.hero.locationId).toBe(t.locationId);
      }
      expect([...out].sort()).toEqual(['follow', 'wait']);
    });

    it('staff cannot be tailed out of their own bar', () => {
      const { w, t } = setup('staff', 'cook');
      expect(gather(w).map((x) => x.key)).not.toContain(`tail:${t.id}`);
    });
  });
});

describe('the sim', () => {
  slow('she gets in far less trouble with the law than before: heat is rarer, and she lasts longer', () => {
    let heat = 0;
    let beats = 0;
    for (let i = 0; i < 60; i++) {
      const { world, events } = runToEnd({ seed: `law-${i}`, competence: 0.3 });
      heat += events.filter((e) => e.type === 'heat_up' && e.data.variant === 'npd').length;
      beats += world.beat;
    }
    // Per hundred beats (she lasts much longer now that laying low works, so nights have more beats to get into trouble).
    expect((heat / beats) * 100).toBeLessThan(4.5);
    expect(beats / 60).toBeGreaterThan(40);
  });

  slow('bounties actually get found and collected, and the new events all have text', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      for (const e of runToEnd({ seed: `bn-${i}`, competence: 0.5 }).events) {
        seen.add(`${e.type}${e.data.variant ? ':' + e.data.variant : ''}`);
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      }
    }
    for (const k of ['bounty_scan:posted', 'bounty_paid', 'bounty_hit']) expect(seen.has(k), k).toBe(true);
    expect([...seen].some((k) => k === 'lure:ok' || k === 'tail:follow' || k === 'sweep')).toBe(true);
  });

  it('every new event kind has a template', () => {
    const data = { npc: 'x', role: 'y', amount: 100, victim: 'v', witnesses: 2, dead: false, count: 2, odds: 60, place: 'p', from: 'f', target: 't' };
    for (const [type, variant] of [['bounty_scan', 'posted'], ['bounty_scan', 'scanner'], ['bounty_hit', ''], ['bounty_paid', ''], ['sweep', ''], ['lure', 'ok'], ['lure', 'fail'], ['tail', 'follow'], ['tail', 'wait'], ['chat', 'rumor_bounty']] as const) {
      expect(hasTemplate({ beat: 1, type, outcome: 'good', data: { ...data, ...(variant ? { variant } : {}) } }), `${type}:${variant}`).toBe(true);
    }
  });

  it('hasBounty only counts the living', () => {
    const n = spawnNpc(new Rng('z'), 'z', 'ganger', 'halo_floor');
    n.bounty = { amount: 50, hidden: false };
    expect(hasBounty(n)).toBe(true);
    n.alive = false;
    expect(hasBounty(n)).toBe(false);
  });
});
