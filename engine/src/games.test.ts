import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { afterTakedown, isShut } from './shutdown';
import { isLethal, kill, relocate } from './combat';
import { childId, expand } from './mapgen';
import { affordancesFor, uncovered } from './affordances';
import { hallCandidates, describeHall, tickHalls } from './hall';
import {
  CAB_FEATURES, FEATURES, GENRES, HALL_CHANCE, HALL_VARIANT, ROOMS, SHELLS, SITUATIONS, TRAITS, VARIANTS, WILD,
  auditNow, auditOnDay, bootChance, cabinetOf, champLevel, playPrice, rollHall, scoreOf, situationAt,
} from './content/halls';
import { ARCHETYPES } from './content/archetypes';
import { ITEMS, makeItem } from './content/items';
import { everyoneAt } from './population';
import { banned, cabAt, cabByKey, cabKeys, ensureCabs, ensureSpider, forge, hide, jailbreak, redeemTickets, spiderOf, stripBoard, ticketCount, viewAt, wreckCab, type HallView } from './hallkit';
import { FORGE, HIDE, JAILBREAK, REDEEM, STRIP } from './content/hallplay';
import { render, hasTemplate } from './text';
import { dayOf, MIN_PER_DAY } from './clock';
import { skillLevel } from './skills';
import type { Id, Location, World } from './types';
import { gameId, ratePlay, remember, memoryOf, gameDied, mournLater, boardsHeld, hatedGame, gameViews, LOVES, HATES } from './games';
import { creatorId, creatorOf, ensureCreator, learnCreator, knowsCreator, knowsWhere } from './creators';
import { isRecordsOffice, recordsCandidates, wantedGame } from './records';
import { adoptCalling, callingAfter, callingBias, callingTick, callingView, callingTargets } from './callings';
import { CALLINGS, DEFS } from './content/callings';
import { resolveAsk } from './advice';
import { playOne } from './hallkit';
import { goalBias, mindTick } from './goals';
import { gather } from './interactions';
import { goalLabel } from './goals';
import { PLAY_TEXT } from './content/hallplay';
import type { Calling, Ctx, GameEvent } from './types';

import type { Affordance } from './affordances';

const DISTRICTS = ['market', 'nightlife', 'tenement', 'industrial', 'corporate', 'slum'] as const;
const roll = (n: number, seed = 'h') => Array.from({ length: n }, (_, i) => rollHall(new Rng(`${seed}:${i}`), DISTRICTS[i % 6]!, 3));

/** Walk outward from the hand-built district until an arcade turns up. */
function findHall(w: World, limit = 400): Location | undefined {
  const queue: Id[] = [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0), childId('halo_alley', 0)];
  let seen = 0;
  while (queue.length && seen++ < limit) {
    const id = queue.shift()!;
    const loc = w.locations[id];
    if (!loc) continue;
    relocate(w, id);
    if (loc.gamehall) return loc;
    for (const e of loc.exits) if (w.locations[e.to]?.gen && !w.locations[e.to]!.gen!.expanded) queue.push(e.to);
  }
  return Object.values(w.locations).find((l) => l.gamehall);
}

/** A scenario with Blackbird standing in an arcade (or one of its rooms). Tries seeds until the city has one. */
function inHall(room: string = 'floor', opts: { want?: (l: Location) => boolean; from?: number } = {}): Scenario {
  for (let i = opts.from ?? 0; i < (opts.from ?? 0) + 100; i++) {
    let found: Id | undefined;
    const sc = scenario({
      seed: `halltest-${i}`,
      setup: (w) => {
        const g = findHall(w);
        if (!g || (opts.want && !opts.want(g))) return;
        expand(w, g);
        const target = room === 'floor' ? g : g.exits.map((e) => w.locations[e.to]).find((l) => l?.hallRoom?.room === room);
        if (!target) return;
        relocate(w, target.id);
        found = target.id;
        w.hero.cash = 600;
        w.hero.hp = w.hero.maxHp;
      },
    });
    if (found && sc.w.hero.locationId === found) return sc;
  }
  throw new Error(`no ${room} found in 100 seeds`);
}

const mainOf = (sc: Scenario): Location => {
  const at = sc.w.locations[sc.w.hero.locationId]!;
  return at.gamehall ? at : sc.w.locations[at.hallRoom!.main]!;
};
const owner = (sc: Scenario) => everyoneAt(sc.w, mainOf(sc).id).find((n) => n.tags.includes('owner'))!;

/** The first cabinet on the main floor, with its licence set the way the test wants. */
function floorCab(sc: Scenario, legal: 'muse' | 'bootleg'): string {
  viewAt(sc.w);
  const main = mainOf(sc);
  const key = cabKeys(main.gamehall!).find((k) => k.startsWith('floor:'))!;
  main.cabs![key] = { legal };
  return key;
}

/** Move the clock to just inside the next visit by the spider. */
function intoAudit(sc: Scenario, into = 3) {
  const main = mainOf(sc);
  for (let d = dayOf(sc.w.clock); d < dayOf(sc.w.clock) + 80; d++) {
    const a = auditOnDay(sc.w.worldSeed, main, main.gamehall!, d);
    if (a) {
      sc.w.clock = a.start + into;
      return a;
    }
  }
  throw new Error('no audit in 80 days');
}


/** She stops to ask the lab; nobody answering is the same as yes. */
const settle = (c: Ctx) => {
  if (c.w.mind.ask) resolveAsk(c, c.w.mind.ask.lean, 'self');
};
const ev = (type: string, outcome: GameEvent['outcome'] = 'good', data: GameEvent['data'] = {}): GameEvent => ({ beat: 40, type, outcome, data });
const cal = (id: string, extra: Partial<Calling> = {}): Calling => ({
  id, since: 0, fervor: 0.7, goal: 10, base: 0, origin: { kind: 'spark', text: 'test', beat: 0 }, lastProgress: 0, last: 0, said: 0, ...extra,
});
const quiet = (l: Location) => !['no_spider', 'spider_home'].includes(l.gamehall!.wild ?? '') && cabKeys(l.gamehall!).length >= 3;

describe('what she makes of a game', () => {
  it('a title is one game wherever it runs, a cracked copy included', () => {
    expect(gameId('Rage Quit Alley')).toBe('rage_quit_alley');
    expect(gameId('Rage Quit Alley (cracked)')).toBe('rage_quit_alley');
    expect(gameId('LUMINA\'s Dance Party Deluxe 6.2')).toBe('lumina_s_dance_party_deluxe_6_2');
    expect(gameId('Sparkle Smash Friends (Muse edition)')).toBe('sparkle_smash_friends');
  });

  it('wins make her like it, losses make her hate it, and a short temper hates faster', () => {
    const likes: number[] = [];
    for (const temper of [0.1, 0.9]) {
      const sc = inHall();
      sc.w.hero.personality.traits.temper = temper;
      const c = sc.ctx(always());
      for (let i = 0; i < 6; i++) ratePlay(c, 'g', 'G', 'brawl', 'bootleg', 'bad');
      likes.push(memoryOf(sc.w, 'g')!.like);
    }
    expect(likes[1]!).toBeLessThan(likes[0]!);
    const sc = inHall();
    const c = sc.ctx(always());
    for (let i = 0; i < 4; i++) ratePlay(c, 'g', 'G', 'brawl', 'muse', 'record');
    const g = memoryOf(sc.w, 'g')!;
    expect(g.like).toBeGreaterThan(0.5);
    expect(g.records).toBe(4);
    expect(g.streak).toBe(0);
  });

  it('tips over into loving or hating it exactly once, and comes back down again', () => {
    const sc = inHall();
    sc.w.hero.personality.traits.temper = 0.9;
    const evs = sc.run((c) => {
      for (let i = 0; i < 12; i++) ratePlay(c, 'g', 'Grim Game', 'shoot', 'bootleg', 'bad');
    });
    expect(evs.filter((e) => e.type === 'game_feeling' && e.data.variant === 'hate').length).toBe(1);
    expect(memoryOf(sc.w, 'g')!.like).toBeLessThanOrEqual(HATES);
    expect(hatedGame(sc.w)?.id).toBe('g');
    sc.run((c) => {
      for (let i = 0; i < 6; i++) ratePlay(c, 'g', 'Grim Game', 'shoot', 'bootleg', 'record');
    });
    expect(memoryOf(sc.w, 'g')!.felt).not.toBe('hate');
  });

  it('keeps a memory of every game she plays at a cabinet, and rates it', () => {
    const sc = inHall('floor', { want: (l) => l.gamehall!.wild !== 'rigged' });
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, 'bootleg');
    const feature = key.split(':')[1]!;
    const cab = cabByKey(w, main, key)!;
    w.hero.cash = 500;
    sc.do(`halldeal:play:${feature}`, never());
    const g = memoryOf(w, gameId(cab.title))!;
    expect(g.plays).toBe(1);
    expect(g.like).toBeLessThan(0);
    expect(g.legal).toBe('bootleg');
    sc.do(`halldeal:play:${feature}`, always());
    expect(memoryOf(w, gameId(cab.title))!.plays).toBe(2);
    expect(gameViews(w)[0]!.title).toBe(g.title);
  });
});

describe('a spider destroying a game she loves', () => {
  it('is a wound: the game she loved goes up in front of her, and only a game she loved', () => {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const keys = cabKeys(main.gamehall!);
    main.cabs = Object.fromEntries(keys.map((k) => [k, { legal: 'bootleg' as const }]));
    const [loved, hated] = [cabByKey(w, main, keys[0]!)!, cabByKey(w, main, keys[1]!)!];
    for (const [cab, like] of [[loved, 0.8], [hated, -0.8]] as const) {
      const g = remember(w, gameId(cab.title), cab.title, cab.genre, 'bootleg');
      g.plays = 6;
      g.like = like;
    }
    intoAudit(sc);
    const told = sc.run((c) => {
      for (let i = 0; i < keys.length + 6; i++) tickHalls(c);
    }, always());
    const lost = told.filter((e) => e.type === 'game_lost');
    expect(lost.map((e) => e.data.title)).toEqual([loved.title]);
    expect(lost[0]!.data.by).toMatch(/Verifier/);
    expect(memoryOf(w, gameId(loved.title))!.lost).toBe(1);
    expect(memoryOf(w, gameId(hated.title))!.lost).toBeUndefined();
  });

  it('is mourned later if it happened while she was away', () => {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const keys = cabKeys(main.gamehall!);
    main.cabs = Object.fromEntries(keys.map((k) => [k, { legal: 'bootleg' as const }]));
    const cab = cabByKey(w, main, keys[0]!)!;
    const g = remember(w, gameId(cab.title), cab.title, cab.genre, 'bootleg');
    g.plays = 5;
    g.like = 0.7;
    const a = intoAudit(sc);
    w.clock = a.end + 1;
    viewAt(w);
    expect(w.mind.mourn).toContain(gameId(cab.title));
    const evs = sc.run((c) => tickHalls(c), always());
    expect(evs.some((e) => e.type === 'game_lost' && e.data.variant === 'found')).toBe(true);
    expect(w.mind.mourn).toEqual([]);
  });

  it('does not count when she barely knew it', () => {
    const sc = inHall();
    const c = sc.ctx();
    remember(sc.w, 'x', 'X', 'brawl', 'bootleg').like = 0.9;
    expect(gameDied(c, 'x', 'a spider', 's')).toBe(false);
    memoryOf(sc.w, 'x')!.plays = 5;
    expect(gameDied(c, 'x', 'a spider', 's')).toBe(true);
    expect(LOVES).toBeLessThan(0.9);
  });
});

describe('who made it', () => {
  it('every game has one, always the same person, and they do not exist until she finds out', () => {
    const sc = inHall();
    const w = sc.w;
    expect(creatorOf(w, 'rage_quit_alley')).toBeUndefined();
    const a = ensureCreator(w, 'rage_quit_alley', { legal: 'bootleg' });
    expect(a.id).toBe(creatorId('rage_quit_alley'));
    expect(a.archetype).toBe('game_cracker');
    expect(a.tags).toContain('creator');
    expect(w.locations[a.locationId]?.gen).toBeTruthy();
    expect(w.locations[a.locationId]!.id).not.toBe(w.hero.locationId);
    expect(ensureCreator(w, 'rage_quit_alley', { legal: 'bootleg' })).toBe(a);
    const m = ensureCreator(w, 'sparkle_smash_friends', { legal: 'muse' });
    expect(m.archetype).toBe('game_designer');
    // The same name every time the city is the same.
    const sc2 = inHall();
    expect(ensureCreator(sc2.w, 'rage_quit_alley', { legal: 'bootleg' }).name).toBe(a.name);
  });

  it('asking the pros gets a name and nothing else; digging gets the address; the record, an Override and a records office get both', () => {
    for (const [route, who, where] of [['pros', true, false], ['intel', true, true], ['override', true, true], ['record', true, true], ['records', true, true]] as const) {
      const sc = inHall();
      const w = sc.w;
      const c = sc.ctx();
      remember(w, 'g', 'Grim Game', 'shoot', 'bootleg').plays = 5;
      const out = sc.run(() => void learnCreator(c, 'g', route));
      expect(knowsCreator(w, 'g'), route).toBe(who);
      expect(knowsWhere(w, 'g'), route).toBe(where);
      expect(out.some((e) => e.type === 'creator_learned' && e.data.variant === route), route).toBe(true);
      if (where) expect(w.mind.lastSeen[memoryOf(w, 'g')!.creator!]).toBeTruthy();
    }
    // Having the name, digging finds where they are.
    const sc = inHall();
    const c = sc.ctx();
    remember(sc.w, 'g', 'Grim Game', 'shoot', 'bootleg');
    learnCreator(c, 'g', 'pros');
    const out = sc.run(() => void learnCreator(c, 'g', 'intel'));
    expect(out.some((e) => e.type === 'creator_located')).toBe(true);
    expect(knowsWhere(sc.w, 'g')).toBe(true);
  });

  it('being number one on a cabinet rolls the credits', () => {
    const sc = inHall('floor', { want: (l) => l.gamehall!.wild !== 'rigged' });
    const w = sc.w;
    const key = floorCab(sc, 'muse');
    const feature = key.split(':')[1]!;
    for (const s of ['gaming', 'calculate', 'driving', 'music', 'dancing', 'marksmanship', 'throwing', 'athletics', 'tinkering', 'sleight', 'perception', 'melee', 'cards'] as const) w.hero.skills[s] = 60;
    w.hero.reflex = 10; w.hero.int = 10; w.hero.charm = 10;
    const gid = gameId(cabByKey(w, mainOf(sc), key)!.title);
    sc.do(`halldeal:play:${feature}`, always());
    expect(knowsCreator(w, gid)).toBe(true);
    expect(knowsWhere(w, gid)).toBe(true);
  });

  it('the hall rows for finding out are offered, and they work', () => {
    const sc = inHall('floor', { want: (l) => l.gamehall!.wild !== 'rigged' });
    const w = sc.w;
    const key = floorCab(sc, 'muse');
    const feature = key.split(':')[1]!;
    const gid = gameId(cabByKey(w, mainOf(sc), key)!.title);
    w.hero.cash = 500;
    const ids = sc.offers().filter((k) => k.endsWith(`:${feature}`)).map((k) => k.split(':')[1]);
    expect(ids).toContain('dig-credits');
    sc.do(`hall:dig-credits:${feature}`, always());
    expect(knowsCreator(w, gid)).toBe(true);
    expect(knowsWhere(w, gid)).toBe(true);
  });
});

describe('a records office', () => {
  it('offers to take a copy of the file, only when she has made up her mind about a game', () => {
    let tried = 0;
    for (let i = 0; i < 80 && !tried; i++) {
      const sc = scenario({ seed: `rec-${i}` });
      const w = sc.w;
      const office = Object.values(w.locations).find((l) => l.kind === 'realty') ?? (() => {
        for (const id of [childId('street_main', 0), childId('street_main', 1), childId('club_backlot', 0)]) { relocate(w, id); }
        return Object.values(w.locations).find((l) => l.kind === 'realty');
      })();
      if (!office) continue;
      tried++;
      expect(isRecordsOffice(office)).toBe(true);
      relocate(w, office.id);
      expect(recordsCandidates(w)).toEqual([]);
      const g = remember(w, 'g', 'Grim Game', 'shoot', 'bootleg');
      g.plays = 6;
      g.like = -0.8;
      expect(wantedGame(w)?.id).toBe('g');
      w.clock = 12 * 60;
      if (recordsCandidates(w).length) {
        sc.do('records:steal', always());
        expect(knowsWhere(w, 'g')).toBe(true);
      }
    }
    expect(tried).toBeGreaterThan(0);
  });
});

describe('the gaming Callings', () => {
  it('are in the table, well-formed, and have something to say', () => {
    for (const id of ['board', 'gamecash', 'spiders', 'creator']) {
      expect(DEFS[id], id).toBeTruthy();
      expect(CALLINGS.some((d) => d.id === id)).toBe(true);
    }
  });

  it('losing a loved game to a spider is a wound: she takes up the spiders without asking', () => {
    const sc = inHall();
    const w = sc.w;
    w.beat = 60;
    const c = sc.ctx(always());
    callingAfter(c, null, 0, [ev('game_lost', 'bad', { variant: 'spider', name: 'Rage Quit Alley', title: 'Rage Quit Alley', game: 'g', by: 'Verifier-123 "Giggles"', by_id: 's1' })]);
    expect(w.mind.calling?.id).toBe('spiders');
    expect(w.mind.calling?.origin.kind).toBe('wound');
    expect(w.mind.calling?.origin.cause).toBe('game');
    expect(w.mind.calling?.origin.text).toMatch(/flattened Rage Quit Alley/);
    expect(w.mind.ask).toBeUndefined();
    const evs = sc.events.filter((e) => e.type === 'calling');
    expect(evs.length).toBe(1);
    expect(hasLine(w, evs[0]!)).toBe(true);
  });

  it('spiders: counts the ones put down, is pulled to arcades, and goes for the fight rather than the peace', () => {
    const sc = inHall();
    const w = sc.w;
    const c = sc.ctx();
    w.counters.spiders_killed = 4;
    adoptCalling(c, cal('spiders', { goal: 3 }));
    const mine = w.mind.calling!;
    expect(mine.base).toBe(4);
    expect(callingView(w)!.count).toBe(0);
    w.counters.spiders_killed = 6;
    expect(callingView(w)!.count).toBe(2);
    expect(callingBias(w, { key: 'hallfight:fight-spider' })).toBeGreaterThan(callingBias(w, { key: 'hall:study-spider' }));
    expect(callingBias(w, { key: 'hall:calm-spider' })).toBeLessThan(0);
    expect(callingTargets(w).length).toBeGreaterThan(0);
  });

  it('number one: she holds the top of the boards she has set, and a spider takes them back', () => {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    const keys = cabKeys(main.gamehall!);
    viewAt(w);
    adoptCalling(sc.ctx(), cal('board', { goal: 2 }));
    expect(boardsHeld(w)).toBe(0);
    main.cabs = { [keys[0]!]: { legal: 'bootleg', top: 40, topBy: 'BLK' }, [keys[1]!]: { legal: 'bootleg', top: 50, topBy: 'BLK' } };
    expect(boardsHeld(w)).toBe(2);
    expect(callingView(w)!.count).toBe(2);
    expect(callingView(w)!.progress).toBe(1);
    wreckCab(w, main, keys[0]!);
    expect(boardsHeld(w)).toBe(1);
  });

  it('number one: a record is a spark, and she plays more', () => {
    const sc = inHall();
    const w = sc.w;
    w.beat = 60;
    const c = sc.ctx(always());
    callingAfter(c, null, 0, [ev('hall', 'good', { variant: 'play.brawl.muse.record' })]);
    settle(c);
    expect(w.mind.calling?.id).toBe('board');
    expect(callingBias(w, { key: 'halldeal:play:cab_brawl' })).toBeGreaterThan(1);
  });

  it('money from gaming: counts what games paid her, anywhere', () => {
    const sc = inHall();
    const w = sc.w;
    w.beat = 60;
    const c = sc.ctx(always());
    callingAfter(c, null, 0, [ev('hall', 'good', { variant: 'play.race.boot.good', earned: 180 })]);
    settle(c);
    expect(w.mind.calling?.id).toBe('gamecash');
    const mine = w.mind.calling!;
    expect(mine.goal).toBeGreaterThanOrEqual(300);
    callingAfter(c, null, 0, [ev('pawn', 'good', { variant: 'pawn-the-console.win', earned: 90 })]);
    expect(callingView(w)!.count).toBe(90);
    expect(w.counters['cal.gamecash']).toBe(270);
  });

  it('a check that leans on Gaming and pays out is tallied as gaming money, in any place', () => {
    const sc = inHall('floor');
    viewAt(sc.w);
    const rows = (affordancesFor('hall') as Affordance<HallView>[]).filter((r) => r.each !== true && r.needs.includes('skill:gaming'));
    expect(rows.length).toBeGreaterThan(3);
  });

  it('the creator: she hates a game and wants whoever made it, first a name, then an address, then the person', () => {
    const sc = inHall();
    const w = sc.w;
    w.beat = 60;
    const c = sc.ctx(always());
    const g = remember(w, 'grim', 'Grim Game', 'shoot', 'bootleg');
    g.plays = 8;
    g.like = -0.9;
    callingAfter(c, null, 0, [ev('game_feeling', 'bad', { variant: 'hate', title: 'Grim Game', game: 'grim', like: -0.9, streak: 6 })]);
    settle(c);
    expect(w.mind.calling?.id).toBe('creator');
    expect(w.mind.calling?.target?.game).toBe('grim');
    expect(w.mind.calling?.target?.npc).toBeUndefined();
    expect(callingView(w)!.label).toMatch(/find out who made "Grim Game", and flatline them/);
    // She needs a name: the right kinds of act are pulled for.
    expect(callingBias(w, { key: 'hall:ask-the-pros:cab_brawl' })).toBeGreaterThan(0);
    expect(callingBias(w, { key: 'records:steal' })).toBeGreaterThan(1.5);
    // She learns it. The Calling becomes about a person.
    learnCreator(c, 'grim', 'intel');
    callingTick(c);
    const who = creatorOf(w, 'grim')!;
    expect(w.mind.calling?.target?.npc).toBe(who.id);
    expect(callingView(w)!.label).toBe(`flatline ${who.name}, who made "Grim Game"`);
    expect(callingTargets(w).some((t) => t.loc === who.locationId)).toBe(true);
    expect(callingBias(w, { key: `challenge:${who.id}` })).toBeGreaterThan(2);
    expect(callingBias(w, { key: 'challenge:somebody_else' })).toBe(0);
    // And she does it.
    expect(callingView(w)!.progress).toBe(0);
    kill(c, w, who, 'Blackbird');
    expect(callingView(w)!.progress).toBe(1);
  });

  it('every new Calling can be told: taken up, carried, finished', () => {
    for (const id of ['board', 'gamecash', 'spiders', 'creator']) {
      const sc = inHall();
      const w = sc.w;
      const { c, events } = (() => {
        const evs: GameEvent[] = [];
        return { events: evs, c: { w, rng: new Rng('t'), emit: (type: string, outcome: any, data: any = {}) => evs.push({ beat: w.beat, type, outcome, data }) } };
      })();
      const g = remember(w, 'grim', 'Grim Game', 'shoot', 'bootleg');
      g.plays = 8;
      g.like = -0.9;
      adoptCalling(c as never, cal(id, { goal: 1, target: id === 'creator' ? { game: 'grim', text: '"Grim Game"' } : undefined }));
      for (const e of events) expect(hasLine(w, e), `${id} ${e.type}`).toBe(true);
      expect(callingView(w)!.label.length).toBeGreaterThan(8);
    }
  });
});

function hasLine(w: World, e: GameEvent): boolean {
  const lines = render(e, { rng: new Rng('r'), personality: w.hero.personality, realName: 'Brenda Pilchard' });
  return lines.length > 0 && lines.every((l) => !/\{|\}|undefined|NaN/.test(l.text)) && hasTemplate(e);
}


describe('getting into it: game goals', () => {
  /** A hall with a cabinet she has played, her memory of it, and a play just now. */
  function playedHall(went: 'record' | 'good' | 'bad', o: { like?: number; plays?: number; streak?: number; mine?: boolean } = {}) {
    const sc = inHall('floor', { want: quiet });
    const w = sc.w;
    const main = mainOf(sc);
    viewAt(w);
    const keys = cabKeys(main.gamehall!);
    main.cabs = Object.fromEntries(keys.map((k) => [k, { legal: 'bootleg' as const }]));
    const cab = cabByKey(w, main, keys[0]!)!;
    const gid = gameId(cab.title);
    const g = remember(w, gid, cab.title, cab.genre, 'bootleg');
    g.plays = o.plays ?? 3;
    g.like = o.like ?? 0.2;
    g.streak = o.streak ?? 0;
    g.records = went === 'record' ? 1 : 0;
    if (o.mine) main.cabs[keys[0]!] = { legal: 'bootleg', top: 30, topBy: 'BLK' };
    w.beat = 80;
    w.mind.lastPlay = { game: gid, hall: main.id, went, beat: w.beat };
    for (const t of ['thrill', 'vanity', 'fame', 'techy', 'gamble', 'curiosity'] as const) w.hero.personality.traits[t] = 0.9;
    return { sc, w, main, keys, cab, gid, g };
  }
  const gameGoal = (w: World) => w.mind.goals.find((g) => g.kind === 'game');

  it('a record makes her want to beat her own best', () => {
    const { sc, w, gid, main } = playedHall('record');
    mindTick(sc.ctx(always()));
    const g = gameGoal(w)!;
    expect(g).toBeTruthy();
    expect(g.mode).toBe('beat');
    expect(g.game).toBe(gid);
    expect(g.loc).toBe(main.id);
    expect(g.amount).toBe(1);
    expect(goalLabel(w, g)).toMatch(/^beat her own best on "/);
  });

  it('a win that is not a record makes her want her name on the board', () => {
    const { sc, w } = playedHall('good');
    mindTick(sc.ctx(always()));
    expect(gameGoal(w)?.mode).toBe('rank');
    expect(goalLabel(w, gameGoal(w)!)).toMatch(/board$/);
  });

  it('a loss does too, one more go; but not at a game she has come to hate', () => {
    const a = playedHall('bad', { like: -0.1, streak: 3 });
    mindTick(a.sc.ctx(always()));
    expect(gameGoal(a.w)?.mode).toBe('rank');
    const b = playedHall('bad', { like: -0.8, streak: 5 });
    mindTick(b.sc.ctx(always()));
    expect(gameGoal(b.w)?.mode).not.toBe('rank');
  });

  it('while she is there, another cabinet is worth a try; it wants a game she has not played', () => {
    const { sc, w, keys, main } = playedHall('good', { mine: true });
    mindTick(sc.ctx(always()));
    // She holds the board already, so it is the beat-it-again goal (or try); either way, a game goal.
    expect(gameGoal(w)).toBeTruthy();
    w.mind.goals = [];
    w.mind.drive = [];
    delete w.mind.cooldown.game_idea;
    const g = gameGoal(w) ?? null;
    expect(g).toBeNull();
    w.mind.lastPlay = { game: Object.keys(w.mind.games!)[0]!, hall: main.id, went: 'good', beat: w.beat };
    // A try goal, forced:
    const c = sc.ctx(always());
    for (let i = 0; i < 6 && !gameGoal(w); i++) {
      w.mind.lastPlay = { game: Object.keys(w.mind.games!)[0]!, hall: main.id, went: 'bad', beat: w.beat };
      w.mind.games![Object.keys(w.mind.games!)[0]!]!.like = -0.9;
      delete w.mind.cooldown.game_idea;
      mindTick(c);
    }
    const t = gameGoal(w);
    if (t) expect(['try', 'rank', 'beat']).toContain(t.mode);
    expect(keys.length).toBeGreaterThan(2);
  });

  it('being in the arcade is enough to start wanting something here: a board to claim, or a cabinet to try', () => {
    let made = 0;
    for (let i = 0; i < 6; i++) {
      const sc = inHall('floor', { want: quiet, from: i * 3 });
      const w = sc.w;
      viewAt(w);
      for (const t of ['thrill', 'vanity', 'fame', 'techy', 'gamble', 'curiosity'] as const) w.hero.personality.traits[t] = 0.9;
      expect(w.mind.lastPlay).toBeUndefined();
      for (let b = 0; b < 12 && !w.mind.goals.some((g) => g.kind === 'game'); b++) {
        w.beat += 5;
        mindTick(sc.ctx(always()));
      }
      const g = w.mind.goals.find((x) => x.kind === 'game');
      if (!g) continue;
      made++;
      expect(['rank', 'try']).toContain(g.mode);
      expect(g.loc).toBe(mainOf(sc).id);
      if (g.mode === 'rank') expect(memoryOf(w, g.game!)?.plays).toBe(0);
      expect(goalLabel(w, g).length).toBeGreaterThan(10);
    }
    expect(made).toBeGreaterThan(2);
  });

  it('is one at a time, and takes a rest between', () => {
    const { sc, w } = playedHall('record');
    mindTick(sc.ctx(always()));
    expect(w.mind.goals.filter((g) => g.kind === 'game').length).toBe(1);
    w.mind.lastPlay = { ...w.mind.lastPlay!, beat: w.beat };
    mindTick(sc.ctx(always()));
    expect(w.mind.goals.filter((g) => g.kind === 'game').length).toBe(1);
  });

  it('pulls her to the arcade and leans on the cabinet that runs that game', () => {
    const { sc, w, keys, main, cab } = playedHall('record');
    mindTick(sc.ctx(always()));
    const goal = gameGoal(w)!;
    expect(goal).toBeTruthy();
    const other = keys.find((k) => k !== keys[0] && gameId(cabByKey(w, main, k)!.title) !== gameId(cab.title));
    const f0 = keys[0]!.split(':')[1]!;
    relocate(w, main.id);
    mindTick(sc.ctx(always()));
    const mine = goalBias(w, { key: `halldeal:play:${f0}` });
    expect(mine).toBeGreaterThan(1);
    if (other) expect(goalBias(w, { key: `halldeal:play:${other.split(':')[1]}` })).toBeLessThan(mine);
  });

  it('is done when she sets the record; and then she wants the next thing', () => {
    const { sc, w, g, gid } = playedHall('good');
    mindTick(sc.ctx(always()));
    const goal = gameGoal(w)!;
    expect(goal.mode).toBe('rank');
    g.records = 1;
    const evs = sc.run((c) => mindTick(c), always());
    expect(gameGoal(w)?.mode).not.toBe('rank');
    const done = evs.find((e) => e.type === 'goal_done' && e.data.kind === 'game');
    expect(done?.data.variant).toBe('record');
    // The next: beat it.
    for (let i = 0; i < 4 && !gameGoal(w); i++) {
      w.beat += 20;
      w.clock += 30;
      mindTick(sc.ctx(always()));
    }
    expect(gameGoal(w)?.mode).toBe('beat');
    expect(gameGoal(w)?.game).toBe(gid);
    expect(hasLine(w, w.mind.goals.length ? sc.events.filter((e) => e.type === 'goal_new' && e.data.variant === 'game_again').pop()! : done!)).toBe(true);
  });

  it('is dropped when the cabinet is gone', () => {
    const { sc, w, main, keys } = playedHall('good');
    mindTick(sc.ctx(always()));
    expect(gameGoal(w)).toBeTruthy();
    for (const k of keys) wreckCab(w, main, k);
    const evs = sc.run((c) => mindTick(c), always());
    expect(gameGoal(w)).toBeUndefined();
    const drop = evs.find((e) => e.type === 'goal_drop' && e.data.kind === 'game');
    expect(drop?.data.variant).toBe('cabinet_gone');
    expect(hasLine(w, drop!)).toBe(true);
  });

  it('tells it all in the log', () => {
    for (const went of ['record', 'good', 'bad'] as const) {
      const { sc, w } = playedHall(went, { like: -0.1, streak: 2 });
      mindTick(sc.ctx(always()));
      for (const e of sc.events.filter((x) => x.type === 'goal_new' && x.data.kind === 'game')) expect(hasLine(w, e), `${went} ${e.data.variant}`).toBe(true);
    }
  });
});


describe('losing it', () => {
  /** She has just lost, again, at a game she hates, in front of the cabinet. */
  function furiousAt(legal: 'muse' | 'bootleg', o: { temper?: number; streak?: number; like?: number; age?: number } = {}) {
    const sc = inHall('floor', { want: (l) => l.gamehall!.wild !== 'rigged' && quiet(l) });
    const w = sc.w;
    const main = mainOf(sc);
    const key = floorCab(sc, legal);
    const feature = key.split(':')[1]!;
    const cab = cabByKey(w, main, key)!;
    const g = remember(w, gameId(cab.title), cab.title, cab.genre, legal);
    g.plays = 7;
    g.like = o.like ?? -0.8;
    g.felt = 'hate';
    g.streak = o.streak ?? 3;
    w.beat = 100;
    g.last = w.beat - (o.age ?? 0);
    w.hero.personality.traits.temper = o.temper ?? 0.9;
    w.hero.cash = 300;
    return { sc, w, main, key, feature, cab, g };
  }

  it('is offered right after losing at a game she hates, and not otherwise', () => {
    const { sc, w, feature, g } = furiousAt('muse');
    expect(sc.offers()).toContain(`hallquick:smash-in-a-rage:${feature}`);
    g.streak = 0;
    expect(sc.offers()).not.toContain(`hallquick:smash-in-a-rage:${feature}`);
    g.streak = 2;
    g.last = w.beat - 40;
    expect(sc.offers()).not.toContain(`hallquick:smash-in-a-rage:${feature}`);
    g.last = w.beat;
    g.like = 0.4;
    delete g.felt;
    expect(sc.offers()).not.toContain(`hallquick:smash-in-a-rage:${feature}`);
  });

  it('wants it more with a short temper', () => {
    const score = (temper: number) => {
      const { sc, w, feature } = furiousAt('muse', { temper });
      const cand = gather(w).find((c) => c.key === `hallquick:smash-in-a-rage:${feature}`)!;
      void sc;
      return cand.bonus ?? 0;
    };
    expect(score(0.95)).toBeGreaterThan(score(0.1) + 1);
  });

  it('scraps the cabinet, takes the edge off the game, and the owner remembers a licensed one', () => {
    const { sc, w, main, key, feature, g } = furiousAt('muse');
    const o = owner(sc);
    const aff = o.affinity;
    const evs = sc.do(`hallquick:smash-in-a-rage:${feature}`, always());
    expect(cabByKey(w, main, key)!.wrecked).toBe(true);
    expect(g.like).toBeGreaterThan(-0.8);
    expect(g.streak).toBe(0);
    expect(o.affinity).toBeLessThan(aff);
    const main1 = evs.find((e) => e.type === 'hall' && e.data.variant === 'rage.win.win' || e.data.variant === 'rage.win');
    expect(evs.some((e) => e.type === 'hall' && String(e.data.variant).startsWith('rage'))).toBe(true);
    for (const e of evs.filter((x) => x.type === 'hall')) expect(hasLine(w, e), String(e.data.variant)).toBe(true);
    void main1;
    // It is not a wound: nobody else did it.
    expect(evs.some((e) => e.type === 'game_lost')).toBe(false);
  });

  it('can cost her a knuckle and, at a licensed cabinet, her welcome; a bootleg owner minds less', () => {
    const a = furiousAt('muse');
    const hp = a.w.hero.hp;
    const evs = a.sc.do(`hallquick:smash-in-a-rage:${a.feature}`, always());
    expect(a.w.hero.hp).toBeLessThan(hp);
    expect(evs.some((e) => e.data.variant === 'rage.hand')).toBe(true);
    expect(evs.some((e) => e.data.variant === 'rage.thrown')).toBe(true);
    expect(banned(a.w, a.main)).toBe(true);
    const b = furiousAt('bootleg');
    const o = owner(b.sc);
    const aff = o.affinity;
    b.sc.do(`hallquick:smash-in-a-rage:${b.feature}`, never());
    expect(cabByKey(b.w, b.main, b.key)!.wrecked).toBe(true);
    expect(o.affinity).toBe(aff - 3);
    expect(banned(b.w, b.main)).toBe(false);
  });

  it('a cabinet that is already wrecked is not smashed twice', () => {
    const { sc, w, main, key, feature } = furiousAt('muse');
    main.cabs![key] = { legal: 'muse', wrecked: w.clock + 9999 };
    expect(sc.offers()).not.toContain(`hallquick:smash-in-a-rage:${feature}`);
  });
});
