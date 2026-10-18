import { describe, expect, it } from 'vitest';
import { Rng, type World, type GameEvent, type Npc } from './index';
import { createWorld } from './world';
import { spawnNpc } from './content/archetypes';
import { gather } from './interactions';
import { addNpc, moveNpc } from './population';
import { relocate } from './combat';
import { fight } from './combat';
import { learnTechnique } from './techniques';
import {
  V,
  atLeast,
  awareness,
  bucketOf,
  callForHelp,
  callWeight,
  camerasSee,
  channelNow,
  channelOf,
  coverAt,
  enterStealth,
  exitStealth,
  gate,
  hush,
  loseContact,
  makeNoise,
  noiseBoost,
  profile,
  stir,
  tickStealth,
} from './stealth';

const at = (loc: string, seed = 'st') => {
  const w = createWorld({ seed, competence: 0.5 });
  w.hero.locationId = loc;
  w.hero.inventory = [];
  w.hero.companions = [];
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
const person = (w: World, id: string, archetype = 'ganger', extra: Partial<Npc> = {}) => {
  const n = spawnNpc(new Rng(id), id, archetype, w.hero.locationId);
  Object.assign(n, extra);
  addNpc(w, n);
  return n;
};
/** A quiet room with a known amount of cover and no cameras. */
const room = (cover: number, seed = 'st') => {
  const w = at('halo_alley', seed);
  empty(w);
  const loc = w.locations[w.hero.locationId]!;
  loc.cover = cover;
  loc.cameras = 0;
  loc.crowded = false;
  w.flags.blackout = false;
  w.situation.weather = 'clear' as never;
  return w;
};
/** Run beats of awareness until `done`, or give up. */
const tickUntil = (w: World, done: () => boolean, max = 60): number => {
  const r = ctxFor(w, 'tick');
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    w.beat++;
    tickStealth(r.c);
  }
  return max;
};

describe('buckets', () => {
  it('out of stealth everyone in the room is Aware, and no one elsewhere is', () => {
    const w = room(0);
    const a = person(w, 'a');
    expect(bucketOf(w, a)).toBe('aware');
    moveNpc(w, a, '_gone');
    expect(bucketOf(w, a)).toBe('unaware');
  });

  it('sorts a tracked value into the four buckets, and Aware needs a fix', () => {
    const w = room(0);
    w.hero.stealth = true;
    const a = person(w, 'a');
    const aw = awareness(w, a);
    for (const [v, b] of [[0, 'unaware'], [0.3, 'suspicious'], [0.6, 'alert']] as const) {
      aw.v = v;
      expect(bucketOf(w, a)).toBe(b);
    }
    aw.v = 0.9;
    aw.fix = false;
    expect(bucketOf(w, a)).toBe('alert');
    aw.fix = true;
    expect(bucketOf(w, a)).toBe('aware');
    expect(atLeast('aware', 'alert')).toBe(true);
    expect(atLeast('suspicious', 'alert')).toBe(false);
  });
});

describe('going into stealth with people watching', () => {
  const watched = (cover: number, count = 6) => {
    const w = room(cover);
    const people = Array.from({ length: count }, (_, i) => person(w, `p${i}`, 'patron'));
    return { w, people };
  };

  it('with no cover, everyone who was looking is still Aware', () => {
    const { w, people } = watched(0);
    enterStealth(ctxFor(w).c);
    expect(w.hero.stealth).toBe(true);
    expect(people.every((n) => bucketOf(w, n) === 'aware')).toBe(true);
  });

  it('with total cover, everyone drops to Alert: they know she is here, not where', () => {
    const { w, people } = watched(1);
    enterStealth(ctxFor(w).c);
    for (const n of people) {
      expect(bucketOf(w, n)).toBe('alert');
      expect(awareness(w, n).fix).toBe(false);
    }
  });

  it('with some cover, some lose her and some do not, and Alert is the floor', () => {
    const { w, people } = watched(0.5, 14);
    enterStealth(ctxFor(w, 'mix').c);
    const buckets = people.map((n) => bucketOf(w, n));
    expect(buckets).toContain('aware');
    expect(buckets).toContain('alert');
    expect(buckets.every((b) => b === 'aware' || b === 'alert')).toBe(true);
  });

  it('cover comes from the crowd, the dark and the weather', () => {
    const w = room(0.1);
    const base = coverAt(w, w.hero.locationId);
    w.locations[w.hero.locationId]!.crowded = true;
    const crowd = coverAt(w, w.hero.locationId);
    w.flags.blackout = true;
    expect(crowd).toBeGreaterThan(base);
    expect(coverAt(w, w.hero.locationId)).toBeGreaterThan(crowd);
    expect(profile(w)).toBeLessThan(1);
  });

  it('stepping out of stealth puts everyone in the room back on her', () => {
    const { w, people } = watched(1);
    const r = ctxFor(w);
    enterStealth(r.c);
    exitStealth(r.c);
    expect(w.hero.stealth).toBe(false);
    expect(people.every((n) => bucketOf(w, n) === 'aware' && awareness(w, n).fix)).toBe(true);
  });
});

describe('awareness over time', () => {
  it('climbs gradually through the buckets until they have a fix', () => {
    const w = room(0);
    const a = person(w, 'a', 'patron');
    w.hero.stealth = true;
    const seen: string[] = [];
    tickUntil(w, () => {
      const b = bucketOf(w, a);
      if (seen[seen.length - 1] !== b) seen.push(b);
      return b === 'aware';
    });
    expect(seen).toEqual(['unaware', 'suspicious', 'alert', 'aware']);
    expect(awareness(w, a).fix).toBe(true);
  });

  it('is slower with sneak and cover, and faster for sharper eyes', () => {
    const beatsToAware = (cover: number, sneak: number, perception: number) => {
      const w = room(cover, `t${cover}${sneak}${perception}`);
      const a = person(w, 'a', 'patron');
      a.level = perception;
      w.hero.skills.sneak = sneak;
      w.hero.stealth = true;
      return tickUntil(w, () => bucketOf(w, a) === 'aware', 200);
    };
    const plain = beatsToAware(0, 0, 3);
    expect(beatsToAware(0.7, 0, 3)).toBeGreaterThan(plain);
    expect(beatsToAware(0, 100, 3)).toBeGreaterThan(plain);
    expect(beatsToAware(0, 0, 30)).toBeLessThan(plain);
  });

  it('someone who loses her drops to Alert, stays there a while, then slowly forgets', () => {
    const w = room(0);
    const a = person(w, 'a', 'patron');
    w.hero.stealth = true;
    tickUntil(w, () => bucketOf(w, a) === 'aware');
    const home = w.hero.locationId;
    const exit = w.locations[home]!.exits.find((e) => !e.hidden && !e.gate)!;
    relocate(w, exit.to);
    expect(bucketOf(w, a)).toBe('alert');
    expect(awareness(w, a).seenAt).toBe(home);
    const r = ctxFor(w);
    for (let i = 0; i < 10; i++) {
      w.beat++;
      tickStealth(r.c);
    }
    expect(bucketOf(w, a)).toBe('alert');
    const gone = tickUntil(w, () => bucketOf(w, a) === 'unaware', 80);
    expect(gone).toBeGreaterThan(5);
    expect(gone).toBeLessThan(80);
  });

  it('a new arrival starts Unaware, even in a room full of people who have her', () => {
    const w = room(0);
    const old = person(w, 'old', 'patron');
    w.hero.stealth = true;
    tickUntil(w, () => bucketOf(w, old) === 'aware');
    const fresh = person(w, 'fresh', 'patron');
    expect(bucketOf(w, fresh)).toBe('unaware');
    expect(bucketOf(w, old)).toBe('aware');
  });

  it('cameras climb too, and out of stealth they simply see', () => {
    const w = room(0);
    const loc = w.locations[w.hero.locationId]!;
    loc.cameras = 2;
    expect(camerasSee(w, loc.id)).toBe(true);
    w.hero.stealth = true;
    loc.camAware = 0;
    expect(camerasSee(w, loc.id)).toBe(false);
    const n = tickUntil(w, () => camerasSee(w, loc.id));
    expect(n).toBeGreaterThan(1);
    w.flags.blackout = true;
    loc.camAware = 1;
    loc.cameras = 0;
    expect(camerasSee(w, loc.id)).toBe(false);
  });

  it('a stir tips the ones it reaches, and only those, into Aware', () => {
    const w = room(0);
    w.hero.stealth = true;
    const a = person(w, 'a', 'patron');
    const quiet = stir(ctxFor(w).c, 0.1);
    expect(quiet).toEqual([]);
    const loud = stir(ctxFor(w).c, 2);
    expect(loud).toContain(a);
  });
});

describe('what she can lift from', () => {
  const keys = (w: World) => gather(w).map((c) => c.key);

  it('only from someone who has not noticed her', () => {
    const w = room(0.6);
    const a = person(w, 'a', 'patron', { cash: 50 });
    w.hero.stealth = true;
    expect(keys(w)).toContain(`pickpocket:${a.id}`);
    awareness(w, a).v = 0.6;
    expect(keys(w)).not.toContain(`pickpocket:${a.id}`);
  });

  it('out of stealth, it needs cover to slip into stealth first', () => {
    const w = room(0);
    const a = person(w, 'a', 'patron', { cash: 50 });
    expect(keys(w)).not.toContain(`pickpocket:${a.id}`);
    w.locations[w.hero.locationId]!.cover = 0.6;
    expect(keys(w)).toContain(`pickpocket:${a.id}`);
  });

  it('a non-stealthy action ends stealth; a quiet one does not', () => {
    const w = room(0.6);
    w.hero.stealth = true;
    const r = ctxFor(w);
    gate(r.c, 'pickpocket:x');
    gate(r.c, 'go:street_main');
    expect(w.hero.stealth).toBe(true);
    gate(r.c, 'chat:x');
    expect(w.hero.stealth).toBe(false);
  });
});

describe('fights', () => {
  const brawl = (sneaking: boolean, seed: string) => {
    const w = room(0.3, seed);
    const watcher = person(w, 'watcher', 'patron');
    const victim = person(w, 'victim', 'mugger');
    void watcher;
    w.hero.stealth = sneaking;
    const r = ctxFor(w, seed);
    fight(r.c, [victim], { cause: 'test', joiners: false, assault: true });
    return r.events.find((e) => e.type === 'crime_seen');
  };

  it('out of stealth everyone in the room sees', () => {
    for (let i = 0; i < 5; i++) expect(brawl(false, `o${i}`)?.data.variant).not.toBe('none');
  });
});

describe('calling for help', () => {
  const crew = (w: World) => {
    const cop = person(w, 'cop1', 'cop');
    const mate = person(w, 'cop2', 'cop');
    const far = person(w, 'cop3', 'cop');
    moveNpc(w, far, 'street_main');
    return { cop, mate, far };
  };

  it('has a channel by what they carry: a shout, a communicator, or optics', () => {
    const w = room(0);
    expect(channelOf(person(w, 'g', 'ganger'))).toBe('shout');
    expect(channelOf(person(w, 'c', 'cop'))).toBe('comm');
    expect(channelOf(person(w, 'r', 'drone'))).toBe('optics');
  });

  it('a shout reaches the ones nearby; a communicator reaches the ones elsewhere too', () => {
    const w = room(0);
    const { cop, mate, far } = crew(w);
    w.hero.stealth = true;
    const heard = callForHelp(ctxFor(w).c, cop);
    expect(channelOf(cop)).toBe('comm');
    expect(heard).toContain(mate);
    expect(heard).toContain(far);
    expect(bucketOf(w, far)).toBe('alert');

    const w2 = room(0, 'shout');
    const g = person(w2, 'g1', 'ganger');
    const g2 = person(w2, 'g2', 'ganger');
    const g3 = person(w2, 'g3', 'ganger');
    moveNpc(w2, g3, 'street_main');
    const near = callForHelp(ctxFor(w2).c, g);
    expect(near).toContain(g2);
    expect(near).not.toContain(g3);
  });

  it('optics make everyone who hears it Aware at once', () => {
    const w = room(0);
    const drone = person(w, 'd1', 'drone', { faction: 'atlas' });
    const mate = person(w, 'd2', 'drone', { faction: 'atlas' });
    w.hero.stealth = true;
    callForHelp(ctxFor(w).c, drone);
    expect(bucketOf(w, mate)).toBe('aware');
  });

  it('is weighed: more when outmatched, less when enough of them are here already, and a lot less once they have called', () => {
    const w = room(0);
    const { cop } = crew(w);
    const base = callWeight(w, cop, 1, 0);
    expect(base).toBeGreaterThan(0);
    expect(callWeight(w, cop, 3, 0)).toBeGreaterThan(base);
    expect(callWeight(w, cop, 1, 4)).toBeLessThan(base);
    w.hero.stealth = true;
    callForHelp(ctxFor(w).c, cop);
    expect(callWeight(w, cop, 1, 0)).toBeLessThan(base * 0.2);
  });

  it('they can call again once everyone has lost her and then found her once more', () => {
    const w = room(0);
    const { cop } = crew(w);
    w.hero.stealth = true;
    Object.assign(awareness(w, cop), { v: 1, fix: true, seenAt: w.hero.locationId }); // she has been seen
    const before = callWeight(w, cop, 1, 0);
    callForHelp(ctxFor(w).c, cop);
    expect(callWeight(w, cop, 1, 0)).toBeLessThan(before * 0.2);
    loseContact(w, w.hero.locationId);
    expect(awareness(w, cop).calledAt).toBeDefined(); // the memory stays
    expect(callWeight(w, cop, 1, 0)).toBeCloseTo(before, 5);
  });
});

describe('Hush', () => {
  it('takes away the link but leaves a shout, for a while', () => {
    const w = room(0);
    const cop = person(w, 'cop', 'cop');
    person(w, 'mate', 'cop');
    expect(channelNow(w, cop)).toBe('comm');
    hush(w, cop, false);
    expect(channelNow(w, cop)).toBe('shout');
    w.beat += 100;
    expect(channelNow(w, cop)).toBe('comm');
  });

  it('a very good one leaves them with nothing: no call at all', () => {
    const w = room(0);
    const cop = person(w, 'cop', 'cop');
    person(w, 'mate', 'cop');
    hush(w, cop, true);
    expect(channelNow(w, cop)).toBeNull();
    expect(callWeight(w, cop, 2, 0)).toBe(0);
    expect(callForHelp(ctxFor(w).c, cop)).toEqual([]);
  });

  it('does nothing useful to someone who has already called, and the called memory survives it', () => {
    const w = room(0);
    const cop = person(w, 'cop', 'cop');
    person(w, 'mate', 'cop');
    callForHelp(ctxFor(w).c, cop);
    const called = awareness(w, cop).calledAt;
    const weight = callWeight(w, cop, 1, 0);
    hush(w, cop, false);
    expect(awareness(w, cop).calledAt).toBe(called);
    expect(callWeight(w, cop, 1, 0)).toBeLessThan(weight + 0.001);
  });

  it('is something she can do, once she knows it, to a watcher with a link who has not seen her yet', () => {
    const w = room(0.6);
    const cop = person(w, 'cop', 'cop');
    w.hero.stealth = true;
    expect(gather(w).map((c) => c.key)).not.toContain(`hush:${cop.id}`);
    learnTechnique(w.hero, 'hush');
    expect(gather(w).map((c) => c.key)).toContain(`hush:${cop.id}`);
  });
});

describe('listeners', () => {
  it('a loud thing is heard by whoever is listening for her, from anywhere; a quiet one is not', () => {
    const w = room(0);
    const hunter = person(w, 'hunter', 'cop');
    moveNpc(w, hunter, 'street_main');
    w.mind.goals.push({ id: 99, kind: 'kill', pursuit: { npc: hunter.id, plan: 'hunt' } } as never);
    makeNoise(w, 0.2);
    expect(hunter.aware).toBeUndefined();
    expect(noiseBoost(w)).toBe(0);
    makeNoise(w, 0.9);
    expect(bucketOf(w, hunter)).toBe('alert');
    expect(awareness(w, hunter).seenAt).toBe(w.hero.locationId);
    expect(noiseBoost(w)).toBeGreaterThan(0);
    w.beat += 10;
    expect(noiseBoost(w)).toBe(0);
  });
});

describe('in a fight', () => {
  const scrap = (seed: string, prep?: (w: World, cop: Npc) => void) => {
    const w = room(0, seed);
    w.hero.hp = w.hero.maxHp = 600;
    const cop = person(w, 'cop', 'ganger', { faction: 'ganger' });
    for (let i = 0; i < 3; i++) person(w, `mate${i}`, 'ganger', { faction: 'ganger' });
    // The one she hits is a lone cop with friends in the room; they are the ones who might call.
    const lone = person(w, 'lone', 'cop', { hp: 600, maxHp: 600 });
    person(w, 'friend', 'cop');
    prep?.(w, lone);
    const r = ctxFor(w, seed);
    fight(r.c, [lone], { cause: 'test', assault: true });
    void cop;
    return r.events;
  };

  it('the outmatched call for help, and the ones who hear it turn up', () => {
    let calls = 0;
    let came = 0;
    for (let i = 0; i < 12; i++) {
      const ev = scrap(`c${i}`);
      if (ev.some((e) => e.type === 'call_for_help')) calls++;
      if (ev.some((e) => e.type === 'call_for_help') && ev.some((e) => e.type === 'reinforce')) came++;
    }
    expect(calls).toBeGreaterThan(0);
    expect(came).toBeGreaterThan(0);
  });

  it('nobody calls if Hush has silenced them', () => {
    for (let i = 0; i < 12; i++) {
      const ev = scrap(`c${i}`, (w, cop) => {
        w.hero.stealth = true;
        hush(w, cop, true);
      });
      expect(ev.some((e) => e.type === 'call_for_help' && e.data.npc === 'lone')).toBe(false);
    }
  });

  it('a sanctioned bout with nobody invited calls no one', () => {
    for (let i = 0; i < 6; i++) {
      const w = room(0, `b${i}`);
      const a = person(w, 'a', 'cop');
      person(w, 'b', 'cop');
      const r = ctxFor(w, `b${i}`);
      fight(r.c, [a], { cause: 'a bout', joiners: false });
      expect(r.events.some((e) => e.type === 'call_for_help')).toBe(false);
    }
  });

  it('sneaking, only those who already have a sense of her are ready for it', () => {
    const w = room(1);
    const v = person(w, 'v', 'mugger');
    w.hero.stealth = true;
    expect(bucketOf(w, v)).toBe('unaware');
    const r = ctxFor(w);
    // (An unaware target is the one an ambush works on.)
    fight(r.c, [v], { cause: 'test', assault: true });
    expect(r.events.some((e) => e.type === 'fight_end')).toBe(true);
  });
});
