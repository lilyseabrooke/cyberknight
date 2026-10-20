import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { afterTakedown, isShut } from './shutdown';
import { kill, relocate } from './combat';
import { childId, expand } from './mapgen';
import { affordancesFor, capabilityPull } from './affordances';
import { canTake, describeHub, hubCandidates, hubUrge, takeable } from './hub';
import { FEATURES, HUB_CHANCE, HUB_VARIANT, ROUTES, SHELLS, SITUATIONS, SIZES, TECHS, TRAITS, VARIANTS, WILD, boardLine, hourly, priceNow, rollHub, situationAt } from './content/hubs';
import { LEARNABLE, knowsTechnique } from './techniques';
import { ARCHETYPES } from './content/archetypes';
import { makeItem } from './content/items';
import { everyoneAt } from './population';
import { alumna, banned, barterFor, buyLesson, deprogram, enrolModule, partsHeld, progress, rightThinking, sitLesson, sitTrial, spendParts, stealIt, askReferral, teach, thinkLevel, viewAt, THINK_MAX, type HubView } from './hubkit';
import { render } from './text';
import type { Id, Location, SyllabusEntry, World } from './types';
import type { Affordance } from './affordances';

const DISTRICTS = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'] as const;
const roll = (n: number, seed = 'h') => Array.from({ length: n }, (_, i) => rollHub(new Rng(`${seed}:${i}`), DISTRICTS[i % 6]!, 3));

/** Walk outward from the hand-built district until a hub turns up. */
function findHub(w: World, limit = 400): Location | undefined {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  let seen = 0;
  while (queue.length && seen++ < limit) {
    const id = queue.shift()!;
    const loc = w.locations[id];
    if (!loc) continue;
    relocate(w, id);
    if (loc.hub) return loc;
    for (const e of loc.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return Object.values(w.locations).find((l) => l.hub);
}

/** A scenario with Blackbird standing in a hub. Tries seeds until the city has one. */
function inHub(opts: { want?: (l: Location) => boolean; from?: number } = {}): Scenario {
  for (let i = opts.from ?? 0; i < (opts.from ?? 0) + 120; i++) {
    let found: Id | undefined;
    const sc = scenario({
      seed: `hubtest-${i}`,
      setup: (w) => {
        const g = findHub(w);
        if (!g || (opts.want && !opts.want(g))) return;
        expand(w, g);
        relocate(w, g.id);
        found = g.id;
        w.hero.cash = 900;
        w.hero.hp = w.hero.maxHp;
        w.hero.int = 6;
      },
    });
    if (found && sc.w.hero.locationId === found) return sc;
  }
  throw new Error('no hub found in 120 seeds');
}

const mainOf = (sc: Scenario): Location => sc.w.locations[sc.w.hero.locationId]!;
const teacherOf = (sc: Scenario) => everyoneAt(sc.w, mainOf(sc).id).find((n) => n.tags.includes('teacher'))!;
const ownerOf = (sc: Scenario) => everyoneAt(sc.w, mainOf(sc).id).find((n) => n.tags.includes('owner'))!;
const entry = (tech: string, route: string, o: Partial<SyllabusEntry> = {}): SyllabusEntry => ({ tech, route, price: 100, steps: 3, ...o });

describe('rolling a hub', () => {
  it('is the same hub for the same stream, and different for others', () => {
    expect(roll(30, 'a')).toEqual(roll(30, 'a'));
    expect(roll(30, 'a')).not.toEqual(roll(30, 'b'));
  });

  it('only ever names things the tables know', () => {
    for (const g of roll(500)) {
      const i = g.info;
      expect(VARIANTS[i.variant]).toBeTruthy();
      expect(SHELLS[i.shell]).toBeTruthy();
      for (const t of i.traits) expect(TRAITS[t]).toBeTruthy();
      for (const f of i.features) expect(FEATURES[f], f).toBeTruthy();
      if (i.wild) expect(WILD[i.wild]).toBeTruthy();
      expect(i.tier).toBeGreaterThanOrEqual(1);
      expect(i.tier).toBeLessThanOrEqual(5);
      expect(g.blurb).not.toMatch(/\{|\}|undefined/);
      expect(g.name.length).toBeGreaterThan(2);
      expect(g.name).not.toMatch(/\{/);
    }
  });

  it('is a wide space: every variant, shell, size and trait can turn up, and hubs rarely match', () => {
    const gs = roll(1500);
    expect(new Set(gs.map((g) => g.info.variant)).size).toBe(Object.keys(VARIANTS).length);
    expect(new Set(gs.map((g) => g.info.shell)).size).toBe(Object.keys(SHELLS).length);
    expect(new Set(gs.map((g) => g.info.size)).size).toBe(5);
    expect(new Set(gs.flatMap((g) => g.info.traits)).size).toBeGreaterThanOrEqual(Object.keys(TRAITS).length * 0.9);
    expect(new Set(gs.map((g) => g.info.wild).filter(Boolean)).size).toBe(Object.keys(WILD).length);
    expect(new Set(gs.map((g) => JSON.stringify(g.info))).size).toBeGreaterThan(gs.length * 0.97);
    const wild = gs.filter((g) => g.info.wild).length / gs.length;
    expect(wild).toBeGreaterThan(0.04);
    expect(wild).toBeLessThan(0.14);
    expect(Object.keys(TRAITS).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(SITUATIONS).length).toBeGreaterThanOrEqual(16);
    expect(Object.keys(WILD).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(VARIANTS).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(SHELLS).length).toBeGreaterThanOrEqual(12);
    for (const [id, v] of Object.entries(VARIANTS)) {
      expect(v.names.length, id).toBeGreaterThanOrEqual(8);
      expect(v.blurbs.length, id).toBeGreaterThanOrEqual(3);
      expect(v.wall.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('is shaped by the district it grows in', () => {
    const count = (d: (typeof DISTRICTS)[number], v: string) => Array.from({ length: 600 }, (_, i) => rollHub(new Rng(`dist:${d}:${i}`), d, 3)).filter((g) => g.info.variant === v).length;
    expect(count('corporate', 'academy')).toBeGreaterThan(count('slum', 'academy') * 5);
    expect(count('industrial', 'garage')).toBeGreaterThan(count('corporate', 'garage') * 3);
    expect(count('nightlife', 'arcade')).toBeGreaterThan(count('industrial', 'arcade'));
    expect(HUB_VARIANT.corporate.academy).toBeGreaterThan(HUB_VARIANT.slum.academy!);
    for (const d of DISTRICTS) expect(HUB_CHANCE[d]).toBeLessThan(0.12);
  });
});

describe('the syllabus', () => {
  it('names only techniques that exist and can be taught, one of each, by routes that exist', () => {
    for (const g of roll(600)) {
      const techs = g.info.syllabus.map((e) => e.tech);
      expect(new Set(techs).size).toBe(techs.length);
      expect(techs.length).toBeGreaterThanOrEqual(1);
      expect(techs.length).toBeLessThanOrEqual(SIZES[g.info.size]!.syllabus[1] + 2);
      for (const e of g.info.syllabus) {
        expect(TECHS[e.tech], e.tech).toBeTruthy();
        expect(LEARNABLE as readonly string[]).toContain(e.tech);
        expect(ROUTES[e.route], e.route).toBeTruthy();
        if (e.route === 'enrol') expect(g.info.variant === 'academy' || g.info.wild === 'branch_zero').toBe(true);
        if (e.route === 'cash') expect(e.price).toBeGreaterThanOrEqual(5);
        if (e.route === 'lessons' || e.route === 'enrol') expect(e.steps).toBeGreaterThanOrEqual(2);
        expect(boardLine(e)).not.toMatch(/\{|\}|undefined|NaN/);
      }
      expect(g.blurb).toContain('On the board:');
    }
  });

  it('teaches every technique there is, and the table has a row for every learnable', () => {
    for (const id of LEARNABLE) expect(TECHS[id], id).toBeTruthy();
    const taught = new Set(roll(800).flatMap((g) => g.info.syllabus.map((e) => e.tech)));
    expect(taught.size).toBe(Object.keys(TECHS).length);
    const routes = new Set(roll(800).flatMap((g) => g.info.syllabus.map((e) => e.route)));
    expect(routes.size).toBe(Object.keys(ROUTES).length);
  });

  it('prices follow the tier and the variant, and the Master charges the earth', () => {
    const g = roll(60).find((x) => !x.info.wild && x.info.traits.length === 0 && x.info.syllabus.some((e) => e.route === 'cash'))!;
    const e = g.info.syllabus.find((x) => x.route === 'cash')!;
    expect(priceNow(g.info, e)).toBe(e.price);
    expect(priceNow(g.info, e, SITUATIONS.free_lesson_day)).toBeLessThan(e.price);
    expect(priceNow({ ...g.info, variant: 'academy' }, e, undefined, true)).toBeLessThan(e.price);
    const masters = roll(900).filter((x) => x.info.wild === 'master');
    expect(masters.length).toBeGreaterThan(3);
    for (const m of masters) for (const l of m.info.syllabus) expect(l.route).toBe('cash');
    const avg = (xs: number[]) => xs.reduce((s, y) => s + y, 0) / xs.length;
    const price = (gs: ReturnType<typeof roll>) => avg(gs.flatMap((x) => x.info.syllabus.filter((l) => l.route === 'cash').map((l) => l.price)));
    expect(price(masters)).toBeGreaterThan(price(roll(900).filter((x) => !x.info.wild)) * 2);
    expect(hourly(g.info)).toBeGreaterThanOrEqual(0);
  });
});

describe('where hubs grow', () => {
  it('turns up in the city, on a stream of its own, after everything else on its street', () => {
    let hubs = 0;
    for (let i = 0; i < 40; i++) {
      const sc = scenario({ seed: `growh-${i}`, setup: (w) => void findHub(w, 160) });
      for (const street of Object.values(sc.w.locations).filter((l) => l.gen?.role === 'street' && l.gen.expanded)) {
        const kids = street.exits.map((e) => sc.w.locations[e.to]).filter((l) => l?.gen?.parent === street.id && l.gen.role !== 'street');
        for (const p of kids.filter((l) => l!.gen!.role === 'hub')) {
          hubs++;
          for (const other of kids.filter((l) => !['hub', 'gamehall', 'gamehallroom', 'studio', 'cutting', 'luthier', 'musehq', 'arena', 'fanclub'].includes(l!.gen!.role))) expect(p!.gen!.slot).toBeGreaterThan(other!.gen!.slot);
        }
      }
    }
    expect(hubs).toBeGreaterThan(0);
  });

  it('is a venue with its own faction, and an academy keeps academy hours', () => {
    const sc = inHub();
    const main = mainOf(sc);
    expect(main.faction?.startsWith('v:')).toBe(true);
    expect(main.kind).toBe('hub');
    expect(main.blurb).not.toMatch(/\{|\}|undefined/);
    const ac = inHub({ want: (l) => l.hub!.variant === 'academy', from: 0 });
    expect(mainOf(ac).hours).toEqual([8, 20]);
  });
});

describe('who is in a hub', () => {
  it('has someone running it, a teacher, and everyone is a real kind of person', () => {
    const sc = inHub();
    const main = mainOf(sc);
    const here = everyoneAt(sc.w, main.id);
    for (const n of here) expect(ARCHETYPES[n.archetype], n.archetype).toBeTruthy();
    expect(here.some((n) => n.tags.includes('teacher'))).toBe(true);
    expect(here.some((n) => n.tags.includes('owner'))).toBe(true);
  });

  it('puts a dean and a counsellor at an academy, and a Titanware liaison somewhere near the eye', () => {
    let dean = false;
    let counsellor = false;
    for (let from = 0; from < 480 && !(dean && counsellor); from += 120) {
      let sc: Scenario;
      try {
        sc = inHub({ want: (l) => l.hub!.variant === 'academy', from });
      } catch {
        continue;
      }
      const here = everyoneAt(sc.w, mainOf(sc).id);
      dean ||= here.some((n) => n.archetype === 'hub_dean');
      counsellor ||= here.some((n) => n.archetype === 'hub_counsellor');
    }
    expect(dean).toBe(true);
    expect(counsellor).toBe(true);
  });
});

describe('the registry', () => {
  const rows = affordancesFor('hub') as Affordance<HubView>[];

  it('has a lot of rows, each with a unique id and a complete description', () => {
    expect(rows.length).toBeGreaterThanOrEqual(50);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.needs.length, r.id).toBeGreaterThan(0);
      expect(r.sees.length, r.id).toBeGreaterThan(10);
      expect(r.stakes.length, r.id).toBeGreaterThan(5);
      for (const n of r.needs) expect(n, r.id).toMatch(/^(skill|stat|drive|item|implant|tag|goal):\w+$/);
    }
  });

  it('only mentions features, variants, traits, situations and wild cards that exist', () => {
    const tags = new Set(Object.values(SITUATIONS).flatMap((s) => s.tags));
    const arr = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
    for (const r of rows) {
      for (const f of arr(r.where.feature)) expect(FEATURES[f], `${r.id} feature ${f}`).toBeTruthy();
      for (const f of arr(r.where.room)) expect(f, `${r.id} room ${f}`).toBe('floor');
      for (const f of arr(r.where.variant)) expect(VARIANTS[f], `${r.id} variant ${f}`).toBeTruthy();
      for (const f of arr(r.where.trait)) expect(TRAITS[f], `${r.id} trait ${f}`).toBeTruthy();
      for (const f of arr(r.where.situation)) expect(tags.has(f), `${r.id} situation ${f}`).toBe(true);
      for (const f of arr(r.where.wild)) expect(WILD[f], `${r.id} wild ${f}`).toBeTruthy();
    }
  });

  it('draws on a focused but varied set of skills, stats and drives (not everything)', () => {
    const needs = new Set(rows.flatMap((r) => r.needs));
    const skills = [...needs].filter((n) => n.startsWith('skill:'));
    const drives = [...needs].filter((n) => n.startsWith('drive:'));
    expect(skills.length).toBeGreaterThanOrEqual(12);
    expect(skills.length).toBeLessThanOrEqual(24);
    for (const s of ['skill:tinkering', 'skill:sneak', 'skill:lockpicking', 'skill:sleight', 'skill:grifting', 'skill:haggling', 'skill:streetwise', 'skill:intimidation']) expect(needs.has(s as never), s).toBe(true);
    expect(needs.has('stat:int')).toBe(true);
    expect(drives.length).toBeGreaterThanOrEqual(5);
    // The pull of a short list: a tinkerer notices more than a singer.
    const sc = scenario({ seed: 'pull' });
    const h = sc.w.hero;
    h.skills.tinkering = 400;
    const t = capabilityPull(h, ['skill:tinkering', 'stat:int']);
    h.skills.tinkering = 0;
    expect(t).toBeGreaterThan(capabilityPull(h, ['skill:tinkering', 'stat:int']));
  });

  it('gives a typical hub a broad menu', () => {
    const ds = roll(200).map((g) => describeHub(g.info).rows.length);
    expect(Math.min(...ds)).toBeGreaterThanOrEqual(8);
    expect(ds.reduce((s, x) => s + x, 0) / ds.length).toBeGreaterThan(13);
  });
});

describe('situations', () => {
  it('are a pure function of the clock: same moment, same situation; they change as days pass', () => {
    const sc = inHub();
    const main = mainOf(sc);
    expect(situationAt(sc.w, main)).toEqual(situationAt(sc.w, main));
    const seen = new Set<string>();
    for (let d = 0; d < 120; d++) seen.add(situationAt({ worldSeed: sc.w.worldSeed, clock: d * 2 * 1440 }, main)?.id ?? 'none');
    expect(seen.size).toBeGreaterThan(7);
    expect(seen.has('none')).toBe(true);
  });
});

describe('being taught', () => {
  const learn = (route: string, tech = 'gun_jam') => {
    const sc = inHub();
    const w = sc.w;
    const main = mainOf(sc);
    const v = viewAt(w)!;
    const e = entry(tech, route);
    main.hub = { ...main.hub!, syllabus: [e], wild: undefined };
    return { sc, w, main, v: viewAt(w)!, e, c: sc.ctx(always()) };
  };

  it('teaches for cash: the price leaves her pockets and the technique is hers', () => {
    const { w, v, e, c } = learn('cash');
    w.hero.cash = 500;
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(false);
    buyLesson(c, v, e);
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(true);
    expect(w.hero.cash).toBe(500 - priceNow(v.info, e, v.sit?.def, alumna(w)));
  });

  it('does not teach what she cannot pay for', () => {
    const { w, v, e, c } = learn('cash');
    w.hero.cash = 3;
    expect(canTake(w, v, e)).toBe(false);
    buyLesson(c, v, e);
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(false);
    expect(w.hero.cash).toBe(3);
  });

  it('teaches by lessons: each evening counts, and the last is the technique', () => {
    const { w, v, e, c } = learn('lessons');
    sitLesson(c, v, e);
    sitLesson(c, v, e);
    expect(progress(w, v, e)).toBe(2);
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(false);
    sitLesson(c, v, e);
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(true);
    expect(progress(w, v, e)).toBe(0);
  });

  it('teaches for parts: the components go, and a short bag teaches nothing', () => {
    const { w, v, e, c } = learn('barter');
    w.hero.parts = { scrap: 3 };
    expect(canTake(w, v, e)).toBe(false);
    w.hero.parts = { scrap: 6, wiring: 8, circuits: 4 };
    expect(canTake(w, v, e)).toBe(true);
    const before = partsHeld(w.hero);
    barterFor(c, v, e);
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(true);
    expect(partsHeld(w.hero)).toBe(before - 10);
    expect(spendParts({ ...w.hero, parts: { scrap: 1 } }, 5)).toBe(false);
  });

  it('teaches by trial: a pass is the technique, a fail costs the fee and a shock', () => {
    const win = learn('trial');
    win.w.hero.skills.tinkering = 400;
    sitTrial(win.c, win.v, win.e);
    expect(knowsTechnique(win.w.hero, 'gun_jam')).toBe(true);
    const lose = learn('trial');
    const cash = lose.w.hero.cash;
    sitTrial(lose.sc.ctx(never()), lose.v, lose.e);
    expect(knowsTechnique(lose.w.hero, 'gun_jam')).toBe(false);
    expect(lose.w.hero.cash).toBeLessThan(cash);
  });

  it('teaches if she can lift it, and a bad lift gets her banned', () => {
    const win = learn('steal');
    stealIt(win.c, win.v, win.e);
    expect(knowsTechnique(win.w.hero, 'gun_jam')).toBe(true);
    const lose = learn('steal');
    stealIt(lose.sc.ctx(never()), lose.v, lose.e);
    expect(knowsTechnique(lose.w.hero, 'gun_jam')).toBe(false);
    expect(banned(lose.w, lose.main)).toBe(true);
    expect(hubCandidates(lose.w)).toEqual([]);
  });

  it('teaches on a good word, but only from a teacher who likes her', () => {
    const { sc, w, v, e, c } = learn('referral');
    const t = teacherOf(sc);
    t.affinity = 0;
    expect(canTake(w, v, e)).toBe(false);
    askReferral(c, v, e);
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(false);
    t.affinity = 12;
    expect(canTake(w, viewAt(w)!, e)).toBe(true);
    askReferral(c, viewAt(w)!, e);
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(true);
  });

  it('can teach every technique by every route', () => {
    for (const tech of LEARNABLE) {
      for (const route of Object.keys(ROUTES)) {
        const { sc, w, v, e, c } = learn(route, tech);
        w.hero.parts = { scrap: 50 };
        w.hero.cash = 2000;
        w.hero.skills.tinkering = 500;
        teacherOf(sc).affinity = 20;
        const e2 = { ...e, steps: 2 };
        const fn = { cash: buyLesson, lessons: sitLesson, barter: barterFor, trial: sitTrial, steal: stealIt, referral: askReferral, enrol: enrolModule }[route]!;
        fn(c, v, e2);
        fn(c, viewAt(w)!, e2);
        fn(c, viewAt(w)!, e2);
        expect(knowsTechnique(w.hero, tech), `${tech} by ${route}`).toBe(true);
      }
    }
  });

  it('never offers what she already knows, and tells it in words that render', () => {
    const { w, v, e, c, sc } = learn('cash');
    w.hero.cash = 900;
    expect(takeable(w, v)).toHaveLength(1);
    const evs = sc.run((cc) => teach(cc, v, e, 'cash', teacherOf(sc), { pay: 100 }), always());
    expect(takeable(w, viewAt(w)!)).toHaveLength(0);
    for (const ev of evs.filter((x) => x.type === 'hub')) {
      for (const l of render(ev, { rng: new Rng('r'), personality: w.hero.personality, realName: 'Brenda Pilchard' })) expect(l.text).not.toMatch(/\{|\}|undefined|NaN/);
    }
    expect(c).toBeTruthy();
  });

  it('puts the syllabus on offer as its own family of choices, only to someone who can use it', () => {
    const { sc, w } = learn('cash');
    w.hero.cash = 900;
    expect(sc.offers().some((k) => k.startsWith('hubdeal:learn:gun_jam:cash'))).toBe(true);
    w.hero.int = 1;
    expect(sc.offers().some((k) => k.startsWith('hubdeal:learn'))).toBe(false);
    w.hero.int = 6;
    const k = sc.offers().find((x) => x.startsWith('hubdeal:learn'))!;
    sc.do(k, always());
    expect(knowsTechnique(w.hero, 'gun_jam')).toBe(true);
  });

  it('pulls her toward a hub with something on the board for her, from the street outside', () => {
    const { sc, w, main } = learn('cash');
    w.hero.cash = 900;
    const street = w.locations[main.gen!.parent]!;
    relocate(w, street.id);
    const u = hubUrge(w, main.id);
    expect(u.bonus).toBeGreaterThan(0.3);
    w.hero.cash = 0;
    expect(hubUrge(w, main.id).bonus).toBe(0);
    expect(sc.w.hero.locationId).toBe(street.id);
  });
});

describe('Right Thinking', () => {
  it('counts each module, nudges her toward agreeable, never past the cap, and comes back out', () => {
    const sc = inHub();
    const w = sc.w;
    const c = sc.ctx(always());
    const t0 = { ...w.hero.personality.traits };
    const weights0 = { ...w.hero.personality.weights };
    expect(thinkLevel(w)).toBe(0);
    expect(rightThinking(c)).toBe(true);
    expect(thinkLevel(w)).toBe(1);
    expect(w.hero.personality.traits.mischief).toBeLessThanOrEqual(t0.mischief);
    expect(w.hero.personality.traits.sociable).toBeGreaterThanOrEqual(t0.sociable);
    for (let i = 0; i < 20; i++) rightThinking(c);
    expect(thinkLevel(w)).toBe(THINK_MAX);
    expect(rightThinking(c)).toBe(false);
    expect(alumna(w)).toBe(true);
    expect(w.hero.personality.traits.impulsive).toBeLessThan(t0.impulsive);
    expect(w.hero.personality.weights).not.toEqual(weights0);
    expect(deprogram(c, 3)).toBe(3);
    expect(thinkLevel(w)).toBe(THINK_MAX - 3);
    expect(deprogram(c, 99)).toBe(THINK_MAX - 3);
    expect(thinkLevel(w)).toBe(0);
    expect(deprogram(c, 1)).toBe(0);
    // Taking it all in and out is a round trip, within rounding, wherever the traits start.
    for (const k of Object.keys(t0) as (keyof typeof t0)[]) expect(Math.abs(w.hero.personality.traits[k] - t0[k])).toBeLessThan(0.2);
  });

  it('comes with the free lesson at an academy, one module at a time', () => {
    const sc = inHub({ want: (l) => l.hub!.variant === 'academy' });
    const w = sc.w;
    const main = mainOf(sc);
    const e = entry('hush', 'enrol', { steps: 3, price: 0 });
    main.hub = { ...main.hub!, syllabus: [e] };
    const v = viewAt(w)!;
    const c = sc.ctx(always());
    enrolModule(c, v, e);
    expect(thinkLevel(w)).toBe(1);
    expect(knowsTechnique(w.hero, 'hush')).toBe(false);
    enrolModule(c, v, e);
    enrolModule(c, v, e);
    expect(thinkLevel(w)).toBe(3);
    expect(knowsTechnique(w.hero, 'hush')).toBe(true);
    expect(alumna(w)).toBe(true);
  });
});

describe('forcing every row', () => {
  it('runs all of them (with their situation or wild card switched on), under three kinds of luck, and tells something that renders cleanly', () => {
    const rows = affordancesFor('hub') as Affordance<HubView>[];
    const problems: string[] = [];
    let ran = 0;
    const told = new Set<string>();
    const make = () => {
      const sc = inHub({ want: (l) => l.hub!.features.length >= 6 });
      const at = sc.w.hero.locationId;
      sc.w.hero.level = 30;
      sc.w.hero.muscle = 40;
      return { sc, at };
    };
    const worlds = { always: make(), never: make(), normal: make() };
    for (const row of rows) {
      const arr = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
      const sitTag = arr(row.where.situation)[0];
      const sitId = sitTag ? Object.keys(SITUATIONS).find((id) => SITUATIONS[id]!.tags.includes(sitTag)) : undefined;
      const wild = arr(row.where.wild)[0];
      for (const dice of ['always', 'never', 'normal'] as const) {
        const { sc, at } = worlds[dice];
        const w = sc.w;
        // Earlier rows leave a mess (fights, bans, a shut hub): put the place and its people back.
        const l0 = w.locations[at]!;
        delete l0.shutUntil;
        delete l0.shutBy;
        delete l0.sealed;
        delete l0.pendingShut;
        for (const n of everyoneAt(w, at)) Object.assign(n, { alive: true, hostile: false, hp: n.maxHp, downUntil: 0, affinity: 0, cash: 400 });
        delete w.counters[`hubban:${at}`];
        if (w.hero.locationId !== at) relocate(w, at);
        w.hero.cash = 900;
        w.hero.maxHp = w.hero.hp = 300;
        w.hero.skills.melee = 50;
        w.counters.think = 1;
        w.hero.parts = { scrap: 20 };
        w.hero.inventory = [makeItem('data_slate')];
        const v = viewAt(w)!;
        if (sitId) v.sit = { id: sitId, def: SITUATIONS[sitId]! };
        if (wild) v.info = { ...v.info, wild };
        const c = sc.ctx(dice === 'always' ? always() : dice === 'never' ? never() : undefined);
        const events: { type: string; outcome: 'good' | 'bad' | 'mixed'; data: Record<string, string | number | boolean>; beat: number }[] = [];
        const emit = c.emit.bind(c);
        c.emit = ((type: string, outcome: 'good' | 'bad' | 'mixed', data: Record<string, string | number | boolean> = {}) => {
          events.push({ type, outcome, data, beat: w.beat });
          emit(type, outcome, data);
        }) as typeof c.emit;
        try {
          row.run(c, v, undefined);
          ran++;
          if (events.some((e) => e.type === 'hub')) told.add(row.id);
          for (const ev of events.filter((e) => e.type === 'hub')) {
            const lines = render(ev as never, { rng: new Rng('r'), personality: w.hero.personality, realName: 'Brenda Pilchard' });
            for (const l of lines) if (/\{|\}|undefined|NaN/.test(l.text)) problems.push(`${row.id}/${dice}: ${l.text}`);
          }
        } catch (e) {
          problems.push(`${row.id}/${dice} threw: ${(e as Error).message}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(ran).toBe(rows.length * 3);
    // A row that never says anything is a row that never does anything.
    expect(rows.map((r) => r.id).filter((id) => !told.has(id))).toEqual([]);
  });

  it('every candidate on offer, run under three kinds of luck, completes and renders cleanly', () => {
    const ran = new Set<string>();
    const problems: string[] = [];
    for (const from of [0, 120, 240]) {
      let sc: Scenario;
      try {
        sc = inHub({ from });
      } catch {
        continue;
      }
      sc.w.hero.parts = { scrap: 60 };
      for (const key of sc.offers().filter((k) => k.startsWith('hub'))) {
        for (const dice of ['always', 'never', 'normal'] as const) {
          sc.w.hero.hp = sc.w.hero.maxHp;
          sc.w.hero.cash = Math.max(sc.w.hero.cash, 600);
          if (!sc.offers().includes(key)) continue;
          try {
            const evs = sc.do(key, dice === 'always' ? always() : dice === 'never' ? never() : undefined);
            ran.add(key.replace(/^hub\w*:/, '').split(':')[0]!);
            for (const ev of evs.filter((e) => e.type === 'hub')) {
              const lines = render(ev, { rng: new Rng('r'), personality: sc.w.hero.personality, realName: 'Brenda Pilchard' });
              for (const l of lines) if (/\{|\}|undefined|NaN/.test(l.text)) problems.push(`${key}/${dice}: ${l.text}`);
            }
          } catch (e) {
            problems.push(`${key}/${dice} threw: ${(e as Error).message}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    expect(ran.size).toBeGreaterThan(8);
  });
});

describe('the house rules', () => {
  it('shuts the hub when its owner is killed', () => {
    const sc = inHub();
    const w = sc.w;
    const main = mainOf(sc);
    const boss = ownerOf(sc);
    const c = sc.ctx();
    kill(c, w, boss, 'Blackbird');
    afterTakedown(c, [boss]);
    expect(isShut(w, main.id) || !!main.sealed).toBe(true);
  });

  it('is a place where a fight can be a real one', () => {
    const sc = inHub();
    expect(hourly(mainOf(sc).hub!)).toBeGreaterThanOrEqual(0);
    expect(viewAt(sc.w)!.main.id).toBe(mainOf(sc).id);
  });
});
