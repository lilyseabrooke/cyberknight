import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, slow, type Scenario } from './testkit';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc, removeNpc } from './population';
import { ensureDeep } from './deepen';
import { relocate } from './combat';
import { routeTo } from './plans';
import { genWeapon } from './weapons';
import { hasTemplate, render } from './text';
import { personalityFrom } from './personality';
import { goalViews, mindTick, recallJobs } from './goals';
import { roomOf, routed } from './dungeons';
import { accepted, appraise, ensureQuest, giverPlace, livePending, objectiveRoom, questCandidates, questReady, questWant } from './quests';
import { beginRun, endRun, newUniverse, splitWorld } from './universe';
import { deserialize, makeSave, resume, serialize } from './store';
import { makeCtx, perform, runToEnd, step } from './run';
import { gather } from './interactions';
import { createWorld } from './world';
import type { Fact, FactKind, GameEvent, Npc, Quest, QuestKind, World } from './types';

const WANTS: FactKind[] = ['wants_money', 'wants_out', 'wants_to_find', 'wants_peace'];

/** Somebody with a want, in the room with her. (Whether they have the nerve to ask is rolled from who they are.) */
function anyone(w: World, id: string, kind: FactKind = 'wants_money'): Npc {
  const n = spawnNpc(new Rng(id), id, 'patron', w.hero.locationId, { name: 'Edda Vance' });
  addNpc(w, n);
  ensureDeep(w, n);
  const fact: Fact = { id: kind, kind, vis: 'asked', data: kind === 'wants_to_find' ? { rel: 'sister' } : { amount: 200 } };
  n.facts = [fact];
  n.affinity = 20;
  return n;
}

/** Somebody with a want who will ask: the first of a line of people who does. */
function giverWith(w: World, id: string, kind: FactKind = 'wants_money'): Npc {
  for (let i = 0; ; i++) {
    const n = anyone(w, i ? `${id}${i}` : id, kind);
    if (questWant(w, n)) return n;
    removeNpc(w, n.id);
  }
}

/** A giver whose job comes out as this kind (the kind is rolled from who they are). */
function jobOfKind(sc: Scenario, kind: QuestKind): { giver: Npc; q: Quest } {
  for (let i = 0; i < 200; i++) {
    for (const want of WANTS) {
      const w = sc.w;
      const giver = giverWith(w, `g${i}${want}`, want);
      const q = ensureQuest(w, giver, giver.facts![0]!);
      if (q?.kind === kind) return { giver, q };
      moveNpc(w, giver, '_away');
    }
  }
  throw new Error(`no ${kind} job turned up`);
}

const say = (ev: GameEvent): string => render(ev, { rng: new Rng('r'), personality: personalityFrom({}), realName: 'Gary-Ann' }).map((l) => l.text).join(' | ');

/** A hero who can take anything the tables hold. */
function mighty(w: World): void {
  const h = w.hero;
  h.level = 14;
  h.maxHp = h.hp = 400;
  h.muscle = 9;
  h.int = 9;
  h.weapon = genWeapon(new Rng('mighty'), { tier: 6.5, cls: 'blade' });
  h.armor = null;
}

const start = (seed: string) => scenario({ seed, at: 'halo_floor', competence: 0.5, bare: true });

describe('a job is described', () => {
  it('builds a trail of new streets to a place made for it, which she can walk to', () => {
    const sc = start('qa');
    const { w } = sc;
    const giver = giverWith(w, 'edda');
    const q = ensureQuest(w, giver, giver.facts![0]!)!;
    expect(q).toBeDefined();
    const site = w.locations[q.site]!;
    expect(site.gen!.quest).toBe(giver.id);
    expect(site.dungeon).toBe(site.id);
    // The way is a chain of streets that did not exist before, joined to where the giver is.
    const route = routeTo(w, 'street_main', site.id)!;
    expect(route).not.toBeNull();
    expect(route.dist).toBeGreaterThanOrEqual(3);
    expect(w.locations[site.gen!.parent]!.kind).toBe('street');
    // Asking again doesn't make another.
    expect(ensureQuest(w, giver, giver.facts![0]!)).toBe(q);
    expect(Object.keys(w.locations).filter((id) => w.locations[id]!.gen?.quest === giver.id)).toEqual([site.id]);
  });

  it('comes out the same in the same world, wherever and whenever it is described', () => {
    const a = start('qb');
    const b = start('qb');
    const ga = giverWith(a.w, 'edda');
    const gb = giverWith(b.w, 'edda');
    expect(ensureQuest(a.w, ga, ga.facts![0]!)).toMatchObject({ kind: ensureQuest(b.w, gb, gb.facts![0]!)!.kind, site: gb.quest!.site, room: gb.quest!.room, reward: gb.quest!.reward, what: gb.quest!.what });
  });

  it('is only on offer from somebody with a want that can be a job, who is in the mood to ask', () => {
    const sc = start('qc');
    const { w } = sc;
    const plain = giverWith(w, 'plain', 'wants_money');
    plain.facts = [];
    expect(questWant(w, plain)).toBeUndefined();
    const revenge = giverWith(w, 'revenge', 'wants_money');
    revenge.facts = [{ id: 'wants_revenge', kind: 'wants_revenge', vis: 'asked', data: {} }];
    expect(questWant(w, revenge)).toBeUndefined();
    const secret = giverWith(w, 'secretive', 'wants_money');
    secret.facts![0]!.vis = 'secret';
    secret.affinity = 0;
    expect(questWant(w, secret)).toBeUndefined();
    // Not everyone with a want asks; of a crowd of them, most do.
    let asking = 0;
    for (let i = 0; i < 40; i++) if (questWant(w, anyone(w, `crowd${i}`))) asking++;
    expect(asking).toBeGreaterThan(15);
    expect(asking).toBeLessThan(40);
  });

  it.each(['flatline', 'retrieve', 'hack'] as const)('a %s job has its one thing in one room of the place, once she gets there', (kind) => {
    const sc = start(`qd-${kind}`);
    const { w } = sc;
    const { giver, q } = jobOfKind(sc, kind);
    expect(w.dungeons[q.site]).toBeUndefined();
    relocate(w, q.site);
    const d = w.dungeons[q.site]!;
    expect(d.quest).toBe(giver.id);
    const room = objectiveRoom(w, q)!;
    expect(room).toBeDefined();
    expect(roomOf(d, room)!.role).toBe(q.room);
    if (kind === 'flatline') {
      const target = w.npcs[q.target!]!;
      expect(target.name).toBe(q.what);
      expect(target.locationId).toBe(room);
      expect(target.post).toBe(d.id);
      expect(d.garrison).toContain(target.id);
      expect(target.gender).toBe(q.targetGender);
    } else {
      expect(roomOf(d, room)!.objective).toMatchObject({ kind: kind === 'retrieve' ? 'item' : 'terminal', done: false });
    }
    // Nowhere else has one.
    expect(d.rooms.filter((r) => r.objective).length).toBe(kind === 'flatline' ? 0 : 1);
  });
});

describe('whether she takes it', () => {
  it('is a matter of how she feels about them, what it pays and how much work it looks like', () => {
    const sc = start('qe');
    const { w } = sc;
    const friend = giverWith(w, 'friend');
    const q = ensureQuest(w, friend, friend.facts![0]!)!;
    friend.affinity = 60;
    const liked = appraise(w, friend, q);
    friend.affinity = -40;
    const loathed = appraise(w, friend, q);
    expect(liked.accept).toBeGreaterThan(loathed.accept);
    friend.affinity = 20;
    const base = appraise(w, friend, q);
    q.reward *= 4;
    expect(appraise(w, friend, q).accept).toBeGreaterThan(base.accept);
    q.reward /= 4;
    w.hero.personality.traits.greed = 0.1;
    const dull = appraise(w, friend, q);
    w.hero.personality.traits.greed = 0.9;
    expect(appraise(w, friend, q).want).toBeGreaterThan(dull.want);
    // A harder place is more work.
    const harder = appraise(w, friend, { ...q, site: q.site });
    w.locations[q.site]!.gen!.tier = 5;
    expect(appraise(w, friend, q).work).toBeGreaterThanOrEqual(harder.work);
  });

  it('is offered when she is with them, and she says no (and is left alone about it for a while) if she is not in the mood', () => {
    const sc = start('qf');
    const { w } = sc;
    const giver = giverWith(w, 'edda');
    giver.affinity = -5;
    expect(sc.offers()).toContain(`ask_quest:${giver.id}`);
    const events = sc.do(`ask_quest:${giver.id}`, never());
    expect(events.find((e) => e.type === 'quest' && e.data.variant === 'offer')).toBeDefined();
    expect(events.find((e) => e.type === 'quest' && e.data.variant === 'decline')).toBeDefined();
    expect(accepted(w, giver.id)).toBe(false);
    expect(w.mind.goals).toHaveLength(0);
    expect(sc.offers()).not.toContain(`ask_quest:${giver.id}`);
    // The job is still there for a later look, and the street is already laid out.
    expect(giver.quest).toBeDefined();
    expect(w.locations[giver.quest!.site]).toBeDefined();
  });

  it('yes, and she goes now: the job is a goal', () => {
    const sc = start('qg');
    const { w } = sc;
    const giver = giverWith(w, 'edda');
    const events = sc.do(`ask_quest:${giver.id}`, always());
    expect(events.map((e) => e.type + ':' + e.data.variant)).toEqual(expect.arrayContaining(['quest:offer', 'quest:accept', 'goal_new:quest_now']));
    const g = w.mind.goals.find((x) => x.kind === 'quest')!;
    expect(g).toMatchObject({ npc: giver.id, loc: giver.quest!.site, mode: 'approach' });
    expect(accepted(w, giver.id)).toBe(true);
    expect(w.mind.quests ?? []).toHaveLength(0);
    expect(goalViews(w).find((v) => v.id === g.id)!.label).toContain(giver.name);
    expect(giver.affinity).toBeGreaterThan(20);
  });

  it('yes, but not now: she keeps it in mind, and takes it up when she has room', () => {
    const sc = start('qh');
    const { w } = sc;
    const giver = giverWith(w, 'edda');
    // Say yes, then fail the "go now" roll.
    const events = sc.do(`ask_quest:${giver.id}`, new (class extends Rng {
      n = 0;
      override next(): number {
        // offer->decide: the accept roll passes; the go-now roll fails.
        return this.n++ === 0 ? 0 : 0.999999;
      }
    })(0));
    expect(events.find((e) => e.data.variant === 'accept')).toBeDefined();
    expect(events.find((e) => e.data.variant === 'later')).toBeDefined();
    expect(w.mind.goals).toHaveLength(0);
    expect(w.mind.quests).toEqual([giver.id]);
    expect(livePending(w).map((n) => n.id)).toEqual([giver.id]);
    // Some time later, with nothing much on her mind.
    const later = sc.run((c) => recallJobs(c), always());
    expect(later.some((e) => e.type === 'goal_new' && ['quest_resume', 'quest_now'].includes(String(e.data.variant)))).toBe(true);
    const g = w.mind.goals.find((x) => x.kind === 'quest')!;
    expect(g.npc).toBe(giver.id);
    expect(w.mind.quests).toEqual([]);
  });

  it('a job she has already done comes first: she goes to collect, room or no room', () => {
    const sc = start('qh2');
    const { w } = sc;
    const giver = giverWith(w, 'edda');
    giver.quest = giver.quest ?? ensureQuest(w, giver, giver.facts![0]!);
    giver.quest!.state = 'ready';
    w.mind.quests = [giver.id];
    // Her hands are full.
    for (let i = 0; i < 6; i++) w.mind.goals.push({ id: 100 + i, kind: 'cash', parent: null, amount: 9999, why: 'x', desire: 0.5, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });
    const events = sc.run((c) => recallJobs(c), always());
    expect(events.some((e) => e.type === 'goal_new' && e.data.variant === 'quest_collect')).toBe(true);
    expect(w.mind.goals.find((g) => g.kind === 'quest')).toBeDefined();
    // And as soon as she looks at it, it's a matter of going home.
    sc.run((c) => mindTick(c), never());
    expect(w.mind.goals.find((g) => g.kind === 'quest')?.mode).toBe('return');
  });

  it('forgets a job whose giver is gone, and puts a dropped one back in the notes', () => {
    const sc = start('qi');
    const { w } = sc;
    const giver = giverWith(w, 'edda');
    sc.do(`ask_quest:${giver.id}`, always());
    const g = w.mind.goals.find((x) => x.kind === 'quest')!;
    // Gets bored: back in the notes.
    g.desire = 0.05;
    sc.run((c) => mindTick(c), never());
    expect(w.mind.goals.find((x) => x.kind === 'quest')).toBeUndefined();
    expect(w.mind.quests).toEqual([giver.id]);
    // The giver dies: gone from the notes.
    giver.alive = false;
    expect(livePending(w)).toEqual([]);
    expect(w.mind.quests).toEqual([]);
  });
});

describe('doing it', () => {
  /** She has said yes and is standing in the room with the objective. */
  function inTheRoom(kind: QuestKind, seed: string) {
    const sc = start(seed);
    const { w } = sc;
    mighty(w);
    const { giver, q } = jobOfKind(sc, kind);
    sc.do(`ask_quest:${giver.id}`, always());
    relocate(w, q.site);
    const d = w.dungeons[q.site]!;
    const room = objectiveRoom(w, q)!;
    // (clear the place out, so the room is hers)
    for (const id of d.garrison) {
      const n = w.npcs[id]!;
      if (n.id !== q.target) n.alive = false;
    }
    relocate(w, room);
    return { sc, w, giver, q, d, room };
  }

  it('retrieving: takes the thing, which cannot be sold, and the job is ready to report', () => {
    const { sc, w, giver, q, room } = inTheRoom('retrieve', 'qj');
    expect(sc.offers()).toContain(`quest_take:${room}`);
    sc.do(`quest_take:${room}`, always());
    expect(q.state).toBe('ready');
    expect(w.hero.inventory.some((i) => i.tags.includes(`quest:${giver.id}`))).toBe(true);
    expect(w.hero.inventory.find((i) => i.tags.includes('quest'))!.name).toBe(q.what);
    expect(sc.offers()).not.toContain(`quest_take:${room}`);
  });

  it('hacking: gets into the system, and fails make noise until it locks her out for the night', () => {
    const { sc, w, q, room, d } = inTheRoom('hack', 'qk');
    expect(sc.offers()).toContain(`quest_hack:${room}`);
    sc.do(`quest_hack:${room}`, never());
    expect(roomOf(d, room)!.objective!.fails).toBe(1);
    sc.do(`quest_hack:${room}`, never());
    expect(q.state).toBe('open');
    const events = sc.do(`quest_hack:${room}`, never());
    expect(events.some((e) => e.data.variant === 'locked')).toBe(true);
    expect(q.state).toBe('failed');
    expect(sc.offers()).not.toContain(`quest_hack:${room}`);
    // The system is back up the next night.
    expect(w.dungeons[q.site]).toBeDefined();
  });

  it('hacking: success is done', () => {
    const { sc, q, room, d } = inTheRoom('hack', 'qk2');
    sc.do(`quest_hack:${room}`, always());
    expect(q.state).toBe('ready');
    expect(roomOf(d, room)!.objective!.done).toBe(true);
  });

  it('flatlining: the target is the job, and once they are down it is ready (whoever did it)', () => {
    const { sc, w, giver, q, d } = inTheRoom('flatline', 'ql');
    const target = w.npcs[q.target!]!;
    expect(questReady(w, giver)).toBe(false);
    target.alive = false;
    expect(questReady(w, giver)).toBe(true);
    // The goal notices, and turns toward home.
    const events = sc.run((c) => mindTick(c), never());
    expect(events.some((e) => e.type === 'goal_note' && e.data.variant === 'quest_ready')).toBe(true);
    expect(w.mind.goals.find((g) => g.kind === 'quest')!.mode).toBe('return');
    expect(q.state).toBe('ready');
    expect(d.quest).toBe(giver.id);
  });

  it('reporting back pays, wherever the giver has got to, and closes the job', () => {
    const { sc, w, giver, q } = inTheRoom('flatline', 'qm');
    w.npcs[q.target!]!.alive = false;
    sc.run((c) => mindTick(c), never());
    // They have moved on.
    moveNpc(w, giver, 'street_main');
    expect(giverPlace(w, giver)).toBe('street_main');
    const g = w.mind.goals.find((x) => x.kind === 'quest')!;
    expect(g.mode).toBe('return');
    const cash = w.hero.cash;
    relocate(w, 'street_main');
    const events = sc.do(`turn_in_quest:${giver.id}`);
    expect(events.find((e) => e.type === 'quest' && e.data.variant === 'paid')).toBeDefined();
    expect(w.hero.cash).toBe(cash + q.reward);
    expect(q.state).toBe('done');
    expect(giver.facts!.some((f) => f.id === q.fact)).toBe(false);
    const after = sc.run((c) => mindTick(c), never());
    expect(after.some((e) => e.type === 'goal_done' && e.data.variant === 'quest')).toBe(true);
    expect(w.mind.goals.find((x) => x.kind === 'quest')).toBeUndefined();
    // Nobody asks twice.
    expect(sc.offers().some((o) => o.endsWith(giver.id) && o.includes('quest'))).toBe(false);
  });

  it('a thing that is lost on the way can not be handed over: the job is back on', () => {
    const { sc, w, giver, q, d, room } = inTheRoom('retrieve', 'qn');
    sc.do(`quest_take:${room}`, always());
    w.hero.inventory = [];
    relocate(w, 'halo_floor');
    moveNpc(w, giver, 'halo_floor');
    const events = sc.do(`turn_in_quest:${giver.id}`);
    expect(events.some((e) => e.type === 'quest' && e.data.variant === 'lost')).toBe(true);
    expect(q.state).toBe('open');
    expect(roomOf(d, room)!.objective!.done).toBe(false);
  });

  it('the person the job is about does not run for it', () => {
    const { sc, w, q, d } = inTheRoom('flatline', 'qo');
    const target = w.npcs[q.target!]!;
    expect(target.tags).toContain('quest_target');
    // Knocked about enough to want to leave: anyone else in this state is routed out of the building for good.
    target.downUntil = w.beat + 50;
    const bystander = w.npcs[d.garrison.find((id) => id !== target.id && !w.npcs[id]!.alive) ?? target.id]!;
    bystander.alive = true;
    bystander.downUntil = w.beat + 50;
    bystander.post = d.id;
    sc.run((c) => routed(c, d));
    expect(bystander.post).toBeUndefined();
    expect(target.post).toBe(d.id);
    expect(d.garrison).toContain(target.id);
  });

  it('hacking and retrieving keep the place from counting as cleared until the thing is done', async () => {
    const { sc, w, q, d, room } = inTheRoom('retrieve', 'qp');
    const { checkCleared } = await import('./dungeons');
    for (const id of d.garrison) w.npcs[id]!.alive = false;
    expect(sc.run((c) => void checkCleared(c, d)).some((e) => e.type === 'dungeon_cleared')).toBe(false);
    sc.do(`quest_take:${room}`, always());
    expect(q.state).toBe('ready');
    expect(sc.run((c) => void checkCleared(c, d)).some((e) => e.type === 'dungeon_cleared')).toBe(true);
  });
});

describe('in the real loop', () => {
  /** Some night in which a job of this kind is taken, done and reported, with nothing but the loop to drive her. */
  function someNight(kind: QuestKind, wantKind: FactKind) {
    // A flatline job going all the way through in a night she wanders is rare; this is where the search finds one.
    const from = kind === 'flatline' ? 2268 : 0;
    for (let seed = from; seed < from + 120; seed++) {
      const w = createWorld({ seed: `loop-${kind}-${seed}`, competence: 0.5 });
      w.flags.quiet_skies = true; // this follows a job through a night, and a job only gets done on a night nothing else interrupts
      mighty(w);
      w.hero.level = 10;
      let giver: Npc | undefined;
      for (let i = 0; !giver; i++) {
        const n = anyone(w, `lg${i}`, wantKind);
        n.affinity = 40;
        if (questWant(w, n) && new Rng(`quest:${w.worldSeed}:${n.id}:${wantKind}`).pick({ wants_money: ['retrieve', 'hack'], wants_out: ['hack', 'flatline'], wants_peace: ['flatline', 'retrieve'] }[wantKind as 'wants_money']!) === kind) giver = n;
        else removeNpc(w, n.id);
      }
      for (const o of Object.values(w.npcs)) if (o.id !== giver.id) o.facts = [];
      const events: GameEvent[] = [];
      perform(makeCtx(w, always(), events), gather(w).find((x) => x.key === `ask_quest:${giver!.id}`)!);
      for (let beat = 0; beat < 600 && !w.over && giver.quest!.state !== 'done'; beat++) events.push(...step(w));
      if (giver.quest!.state === 'done') return { w, giver, events };
    }
    return null;
  }

  it.each([['flatline', 'wants_peace'], ['retrieve', 'wants_money'], ['hack', 'wants_out']] as const)('a %s job is taken, done and reported by the ordinary loop', (kind, want) => {
    const night = someNight(kind, want);
    expect(night, `no night in which a ${kind} job went through`).not.toBeNull();
    const { w, giver, events } = night!;
    const q = giver.quest!;
    const types = events.map((e) => e.type + ':' + e.data.variant);
    expect(types).toContain('quest:offer');
    expect(types).toContain('quest:paid');
    expect(types).toContain('goal_note:quest_ready');
    // She went to the place, and did the one thing there.
    expect(w.locations[q.site]!.visits).toBeGreaterThan(0);
    if (kind === 'flatline') expect(w.npcs[q.target!]!.alive).toBe(false);
    if (kind === 'retrieve') expect(types).toContain('quest:retrieved');
    if (kind === 'hack') expect(types).toContain('quest:hacked');
    // And was paid.
    expect(w.hero.inventory.some((i) => i.tags.includes('quest'))).toBe(false);
    for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
  });
});

describe('over whole nights', () => {
  slow('jobs are offered, taken and finished, and every job leaves the map in a sound state', () => {
    let offers = 0;
    let paid = 0;
    let taken = 0;
    for (let i = 0; i < 40; i++) {
      const { events, world: w } = runToEnd({ seed: `qnight-${i}`, competence: [0.3, 0.6, 0.9][i % 3]! });
      for (const e of events) {
        if (e.type === 'quest' && e.data.variant === 'offer') offers++;
        if (e.type === 'quest' && e.data.variant === 'paid') paid++;
        if (e.type === 'goal_new' && e.data.kind === 'quest') taken++;
        expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      }
      for (const n of Object.values(w.npcs)) {
        const q = n.quest;
        if (!q) continue;
        const site = w.locations[q.site];
        expect(site, `${n.name}'s job has a place`).toBeDefined();
        expect(site!.gen!.quest).toBe(n.id);
        expect(routeTo(w, 'street_main', q.site), `the way to ${site!.name}`).not.toBeNull();
        if (w.dungeons[q.site]) expect(w.dungeons[q.site]!.quest).toBe(n.id);
        if (q.state === 'done') expect(n.facts?.some((f) => f.id === q.fact)).toBeFalsy();
      }
    }
    expect(offers).toBeGreaterThan(5);
    expect(taken).toBeGreaterThan(0);
    expect(paid).toBeGreaterThan(0);
  });
});

describe('across nights', () => {
  it('the job outlasts her body, a stolen thing does not, and a dead target stays dead', () => {
    const u = newUniverse('qq-world');
    let w = beginRun(u, { seed: 'qq1' });
    const giver = giverWith(w, 'edda');
    giver.home = giver.locationId;
    const q = ensureQuest(w, giver, giver.facts![0]!)!;
    relocate(w, q.site);
    const d = w.dungeons[q.site]!;
    if (q.kind === 'retrieve' || q.kind === 'hack') {
      const room = roomOf(d, objectiveRoom(w, q)!)!;
      room.objective!.done = true;
      q.state = 'ready';
    } else {
      w.npcs[q.target!]!.alive = false;
      q.state = 'ready';
    }
    const universe = endRun(w);
    w = beginRun(universe, { seed: 'qq2' });
    const again = w.npcs[giver.id]!.quest!;
    expect(again.site).toBe(q.site);
    expect(w.mind.quests ?? []).toEqual([]);
    if (q.kind === 'retrieve') expect(again.state).toBe('open');
    else expect(again.state).toBe('ready');
    if (q.kind === 'flatline') expect(w.npcs[q.target!]?.alive ?? false).toBe(false);
    if (q.kind !== 'flatline') expect(roomOf(w.dungeons[q.site]!, objectiveRoom(w, again)!)!.objective!.done).toBe(q.kind === 'hack');
  });

  it('survives a save, mid-job', () => {
    const u = newUniverse('qr-world');
    const w = beginRun(u, { seed: 'qr1' });
    const giver = giverWith(w, 'edda');
    giver.home = giver.locationId;
    const sc = { w };
    const events: GameEvent[] = [];
    const c = makeCtx(w, always(), events);
    const cand = gather(w).find((x) => x.key === `ask_quest:${giver.id}`)!;
    perform(c, cand);
    const text = serialize(makeSave(splitWorld(w).universe, w, 1000));
    const back = deserialize(text);
    const copy = resume(back, 1000).world!;
    expect(copy.npcs[giver.id]!.quest).toEqual(giver.quest);
    expect(copy.mind.goals.find((g) => g.kind === 'quest')).toEqual(w.mind.goals.find((g) => g.kind === 'quest'));
    expect(copy.locations[giver.quest!.site]).toBeDefined();
    void sc;
  });
});

describe('what the log says', () => {
  it('has words for every job event', () => {
    const sc = start('qs');
    const { w } = sc;
    const out: GameEvent[] = [];
    for (const kind of ['flatline', 'retrieve', 'hack'] as const) {
      const { giver, q } = jobOfKind(sc, kind);
      const data = { npc: giver.name, qkind: q.kind, what: q.what, reward: q.reward, place: w.locations[q.site]!.name, want: giver.facts![0]!.kind, rel: 'sister', watched: true, ...(kind === 'flatline' ? { target: q.what, target_g: 'woman' } : {}) };
      for (const variant of ['offer', 'accept', 'later', 'retrieved', 'fumbled', 'ruined', 'hacked', 'jammed', 'locked', 'paid', 'lost', 'void']) out.push({ beat: 1, type: 'quest', outcome: 'good', data: { ...data, variant } });
      for (const why of ['liking', 'money', 'work']) out.push({ beat: 1, type: 'quest', outcome: 'mixed', data: { ...data, variant: 'decline', why } });
      for (const [type, variant] of [['goal_new', 'quest_now'], ['goal_new', 'quest_resume'], ['goal_new', 'quest_collect'], ['goal_resume', 'quest'], ['goal_note', 'quest_in'], ['goal_note', 'quest_blown'], ['goal_note', 'quest_retreat'], ['goal_note', 'quest_ready'], ['goal_done', 'quest'], ['goal_drop', 'quest_failed']] as const) {
        for (const style of ['sneak', 'clear']) out.push({ beat: 1, type, outcome: 'mixed', data: { ...data, goal: 'do the thing', variant, style } });
      }
    }
    for (const ev of out) {
      expect(hasTemplate(ev), `${ev.type}:${ev.data.variant}`).toBe(true);
      const text = say(ev);
      expect(text, `${ev.type}:${ev.data.variant}`).not.toMatch(/undefined|NaN|\[object|\{\w+\}/);
    }
  });
});
