import { Rng } from './rng';
import { clamp, type Candidate } from './candidate';
import { gainXp, here, remember } from './combat';
import { ensureDeep } from './deepen';
import { addQuestSite, type SiteSpec } from './mapgen';
import { addNpc } from './population';
import { placeAt } from './movement';
import { routeTo } from './plans';
import { cool, cooling, hasGoal, topLevel, capacity } from './mind';
import { skillLevel, train } from './skills';
import { hasAlly } from './companions';
import { startQuestGoal } from './goals';
import { crewOf, dungeonOf, estimatePressure, rearm, roomOf, standing, tolerance, tripAlarm, typicalPressure } from './dungeons';
import { rollNpcName, spawnNpc } from './content/archetypes';
import { LEADER_ARMS, dungeonGrade, layoutFor } from './content/dungeons';
import { dangerOf } from './grade';
import { SPOTS } from './content/spots';
import type { Ctx, Dungeon, DungeonKind, Fact, FactKind, Gender, Id, Item, Npc, Quest, QuestKind, World } from './types';
import type { Realm } from './dungeons';

/**
 * Jobs. Somebody with a want can have a job for Blackbird: go to a place and do one thing there, then come back and say so.
 * Flatline somebody, bring something back, or get into a system.
 *
 * **Where the place comes from.** The job is described the first time she asks (`askQuest`), and that is when the place is made:
 * a trail of new streets leading off the street the giver is on, and at the end of it a spot or a dungeon that exists for this job
 * (mapgen.ts `addQuestSite`). It is an ordinary spot or dungeon in every other way: it has its own people, its own spoils, and it
 * is fought through, sneaked through, or talked around the way any other is (dungeons.ts). What makes it a job's is one thing
 * in one room: the target, the thing, or the terminal. She knows the way there because the giver told her.
 *
 * **What persists.** The job lives on the giver (`Npc.quest`) and the place lives in the map, so both outlast her body; what she
 * has decided about it (`Mind.quests`, a `quest` goal) does not. A new body can ask again, and finds the street already laid out.
 * What she did in a night is partly undone by the morning: a thing she carried off with her died with her, and the terminal is
 * locked down again; a person she put down stays down (`nightfall`).
 *
 * **Whether she takes it** is hers to decide (`appraise`): how she feels about whoever is asking, how much the money is worth to her
 * and how much work she thinks it is. Then whether it is a goal now or something she keeps in mind for when she has room.
 */

// ===================================================================== what a want turns into

/** The jobs a want can turn into. (Revenge is a score to settle, not a job: see contracts.ts.) */
const JOBS: Partial<Record<FactKind, QuestKind[]>> = {
  wants_money: ['retrieve', 'hack'],
  wants_out: ['hack', 'flatline'],
  wants_to_find: ['retrieve', 'hack'],
  wants_peace: ['flatline', 'retrieve'],
};

/** Spots by what you can do in them (content/spots.ts). */
const SPOT_FOR: Record<QuestKind, string[]> = {
  flatline: ['fight_club', 'dealer_den', 'pill_mill', 'gambling_den', 'counterfeit_mill', 'rave_dock', 'collection_day', 'corrupt_cop', 'checkpoint_squeeze', 'bounty_hunters', 'cult_shrine'],
  retrieve: ['dead_drop', 'stash_flat', 'dumpster_cache', 'swap_meet', 'armored_van', 'evidence_van', 'fixer_locker', 'scrapper_camp', 'recall_depot', 'chop_pop'],
  hack: ['relay_box', 'ad_kiosk', 'drone_repair', 'black_ice_shed', 'counterfeit_mill', 'stim_lab', 'racket_booth', 'checkpoint_squeeze'],
};

/** Where in a building it is, best first. The first room the building has at its tier is the one. */
const ROOM_FOR: Record<'outpost' | 'hideout', Record<QuestKind, string[]>> = {
  outpost: { flatline: ['command', 'barracks', 'garage'], retrieve: ['armory', 'core', 'command', 'barracks'], hack: ['core', 'command', 'hall'] },
  hideout: { flatline: ['den', 'pit', 'hangout'], retrieve: ['stash', 'workshop', 'den'], hack: ['den', 'stash', 'hangout'] },
};

const THINGS: Record<string, string[]> = {
  wants_money: ["a courier's payroll case", 'a bearer-bond chip', 'a tin of old gold'],
  wants_peace: ['the recording they are being leaned on with', 'a debt chit with their name on it'],
  wants_out: ['their contract chip', 'a forged exit permit'],
};

const SYSTEMS: Record<string, string[]> = {
  wants_money: ['a payroll server', "a crew's ledger node"],
  wants_out: ['the roster database', 'their own file, in a records system'],
  wants_to_find: ['a missing-persons registry', 'a clinic intake log'],
  wants_peace: ['the harassment bot that keeps pinging them', 'a fabricator feed that is stalking them'],
};

const REWARD_MULT: Record<QuestKind, number> = { flatline: 1.25, retrieve: 1, hack: 1.1 };

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

// ===================================================================== finding and reading jobs

/** Who she's said yes to: a goal or a note to herself. */
export const accepted = (w: World, giver: Id): boolean => hasGoal(w, 'quest', giver) || !!w.mind.quests?.includes(giver);

/** The want that could turn into a job, if this person has one and is the sort to ask. */
export function questWant(w: World, n: Npc): Fact | undefined {
  if (!n.alive || n.depth !== 'deep' || n.quest?.state === 'done') return undefined;
  if (n.quest) return n.facts?.find((f) => f.id === n.quest!.fact);
  // Not everyone with a want has the nerve to ask a stranger.
  if (!new Rng(`quest-giver:${w.worldSeed}:${n.id}`).chance(0.7)) return undefined;
  return (n.facts ?? []).find((f) => JOBS[f.kind] && (f.vis !== 'secret' || n.affinity >= 40));
}

/** The person to flatline, if the job is that and the place has been built far enough to have them. */
export const targetOf = (w: World, q: Quest): Npc | undefined => (q.target ? w.npcs[q.target] : undefined);

/** Is the job done as far as the world is concerned? A person she put down stays down, even if she wasn't the one who did it. */
export function questReady(w: World, giver: Npc): boolean {
  const q = giver.quest;
  if (!q) return false;
  if (q.state === 'ready') return true;
  return q.state === 'open' && q.kind === 'flatline' && !!q.target && !targetOf(w, q)?.alive;
}

/** Where the person who wants it done is right now. Wherever they have gone, she knows. */
export function giverPlace(w: World, giver: Npc): Id {
  const at = giver.locationId;
  if (w.locations[at]) return at;
  const there = placeAt(w, giver, w.clock);
  if (w.locations[there]) return there;
  return giver.home && w.locations[giver.home] ? giver.home : at;
}

/** The room of the site where the objective is. */
export function objectiveRoom(w: World, q: Quest): Id | undefined {
  return w.dungeons[q.site]?.rooms.find((r) => r.role === q.room)?.id;
}

/** The thing she carries back. */
const itemOf = (giver: Id, q: Quest): Item => ({ id: `quest:${giver}`, name: q.what, kind: 'loot', power: 0, value: 0, tags: ['quest', `quest:${giver}`] });
const carrying = (w: World, giver: Id): number => w.hero.inventory.findIndex((i) => i.tags.includes(`quest:${giver}`));

// ===================================================================== making one

function pickSite(rng: Rng, kind: QuestKind, tier: number): SiteSpec {
  if (tier <= 3 && rng.chance(0.55)) {
    const key = rng.pick(SPOT_FOR[kind]);
    const [lo, hi] = SPOTS[key]!.tiers ?? [1, 4];
    return { role: 'spot', spot: key, tier: clamp(tier, lo, hi) };
  }
  const outpost = kind === 'hack' ? rng.chance(0.6) : kind === 'flatline' ? rng.chance(0.45) : rng.chance(0.45);
  return { role: outpost ? 'outpost' : 'hideout', tier };
}

function roomFor(site: SiteSpec, kind: QuestKind): string {
  if (site.role === 'spot') return 'spot';
  const have = layoutFor(site.role, site.tier).map((r) => r.def.key);
  return ROOM_FOR[site.role][kind].find((k) => have.includes(k)) ?? have[have.length - 1]!;
}

/** What the job is about, in words: the person, the thing or the system. */
function describe(rng: Rng, kind: QuestKind, fact: Fact, name: string): string {
  if (kind === 'flatline') return name;
  if (kind === 'retrieve') {
    if (fact.kind === 'wants_to_find') return rng.pick([`the ${fact.data.rel ?? 'old friend'}'s transit pass`, `a locket with the ${fact.data.rel ?? 'old friend'}'s face in it`, `the ${fact.data.rel ?? 'old friend'}'s last message, on a stolen handset`]);
    return rng.pick(THINGS[fact.kind] ?? THINGS.wants_money!);
  }
  return rng.pick(SYSTEMS[fact.kind] ?? SYSTEMS.wants_money!);
}

/**
 * Describe the job and build the place for it. Idempotent, and it comes out the same whenever and in whatever order it
 * happens: the giver, the want and the world's seed decide everything but how hard it is, which reads her level the first time.
 */
export function ensureQuest(w: World, giver: Npc, fact: Fact): Quest | undefined {
  if (giver.quest) return giver.quest;
  const kinds = JOBS[fact.kind];
  if (!kinds) return undefined;
  const rng = new Rng(`quest:${w.worldSeed}:${giver.id}:${fact.id}`);
  const kind = rng.pick(kinds);
  const tier = clamp(Math.round(1 + (w.hero.level - 1) / 3.2 + (rng.next() - 0.5) * 1.6), 1, 5);
  const site = pickSite(rng, kind, tier);
  const room = roomFor(site, kind);
  const gender: Gender = rng.chance(0.5) ? 'woman' : 'man';
  const name = kind === 'flatline' ? rollNpcName(rng, 'person') : '';
  const what = describe(rng, kind, fact, name);
  // Off the street the giver is on, or the nearest one to it.
  const at = w.locations[giver.locationId];
  const start = at ? (at.outdoors ? at : w.locations[at.tossTo]) : undefined;
  if (!start) return undefined;
  const length = 2 + (site.tier >= 3 ? 1 : 0) + rng.int(0, 1);
  const { entrance } = addQuestSite(w, start, `${giver.id}:${fact.id}`, length, site, giver.id);
  const reward = Math.round(((70 + 60 * site.tier + rng.int(0, 70)) * REWARD_MULT[kind]) / 5) * 5;
  const q: Quest = { kind, fact: fact.id, site: entrance.id, room, reward, what, state: 'open', run: w.legacy.runs, ...(kind === 'flatline' ? { targetGender: gender } : {}) };
  giver.quest = q;
  return q;
}

/**
 * Fill in the one thing that makes a place a job's, as a room is stocked (dungeons.ts). The person to flatline is put in with
 * everyone else, and is not the sort to run; the thing and the terminal are fixtures of the room.
 */
export function stockQuest(w: Realm, d: Dungeon, roomKey: string, locId: Id): void {
  const giver = d.quest ? w.npcs[d.quest] : undefined;
  const q = giver?.quest;
  if (!giver || !q || q.state === 'done' || q.room !== roomKey) return;
  const room = roomOf(d, locId)!;
  if (q.kind !== 'flatline') {
    room.objective = { kind: q.kind === 'retrieve' ? 'item' : 'terminal', done: q.state === 'ready', fails: 0 };
    return;
  }
  const id = `qt:${giver.id}`;
  q.target = id;
  const have = w.npcs[id];
  if (have) {
    if (have.alive && !d.garrison.includes(id)) d.garrison.push(id);
    return;
  }
  const crew = crewOf(d);
  const arch = d.kind === 'outpost' || crew === 'atlas' ? 'atlas_officer' : crew === 'npd' ? 'npd_officer' : d.tier >= 3 ? 'gang_captain' : 'gang_enforcer';
  const faction = crew === 'gang' ? d.faction : crew === 'atlas' ? 'atlas' : crew === 'npd' ? 'npd' : undefined;
  const npc = spawnNpc(new Rng(`npc:${w.worldSeed}:${id}`), id, arch, locId, { name: q.what, faction, gender: q.targetGender, grade: dungeonGrade(dangerOf(w.locations[d.id]), d.tier) });
  rearm(npc, new Rng(`arms:${w.worldSeed}:${id}`).pick(LEADER_ARMS[d.tier]!));
  npc.tags.push('quest_target', 'commander');
  npc.post = d.id;
  npc.home = locId;
  addNpc(w, npc);
  d.garrison.push(id);
  if (d.posted !== undefined) d.posted++;
}

/** The morning after. What she took with her died with her and the systems are locked down again; a person she put down stays down. */
export function nightfall(w: Realm, d: Dungeon): void {
  const q = d.quest ? w.npcs[d.quest]?.quest : undefined;
  if (!q || q.state === 'done') return;
  for (const r of d.rooms) if (r.objective) r.objective.fails = 0;
  if (q.kind === 'flatline') return;
  if (q.kind === 'retrieve' || q.state === 'failed') {
    q.state = 'open';
    for (const r of d.rooms) if (r.objective) r.objective.done = false;
  }
}

// ===================================================================== what she makes of it

export interface Appraisal {
  /** How she feels about whoever is asking, -1..1. */
  liking: number;
  /** How much the money is worth to her, 0..1.5. */
  want: number;
  /** How much work she reckons it is, 0..2. */
  work: number;
  score: number;
  /** The chance she says yes. */
  accept: number;
  /** How much she'd want it as a goal. A job she has said yes to is a commitment: it doesn't go cheap. */
  desire: number;
}

/** Her read on a job: who is asking, what it pays and what it looks like it will take. */
export function appraise(w: World, giver: Npc, q: Quest): Appraisal {
  const h = w.hero;
  const t = h.personality.traits;
  const liking = clamp(giver.affinity / 50, -1, 1) + 0.4 * (t.kindness - 0.5);
  const want = (q.reward / (q.reward + 140)) * (0.5 + 1.1 * t.greed) * (h.cash < 100 ? 1.25 : 1);
  const entrance = w.locations[q.site];
  const d = w.dungeons[q.site];
  const dist = Math.min(14, routeTo(w, h.locationId, q.site)?.dist ?? 8);
  const p = d ? typicalPressure(w, d) : entrance?.gen ? estimatePressure(w, entrance.gen.role as DungeonKind, entrance.gen.tier ?? 1) : 1;
  const dread = Math.max(0, p / tolerance(w) - 0.5) * 0.9;
  const task = q.kind === 'flatline' ? 0.15 - 0.2 * (t.courage - 0.5) : q.kind === 'hack' ? 0.18 - 0.03 * h.hack - 0.3 * (t.techy - 0.5) : 0.1;
  const work = Math.max(0, 0.05 * dist + dread + task + 0.15 * (0.5 - t.thrill));
  const score = 0.9 * liking + 1.2 * want - work;
  return {
    liking, want, work, score,
    accept: sigmoid((score - 0.15) / 0.25),
    desire: clamp(0.4 + 0.5 * score, 0.4, 0.95),
  };
}

/** Why she said no (or yes), in a word, for the log. */
function reason(a: Appraisal): 'liking' | 'money' | 'work' {
  const pull = { liking: Math.abs(0.9 * a.liking), money: 1.2 * a.want, work: a.work };
  return a.score >= 0.15 ? (pull.liking > pull.money ? 'liking' : 'money') : a.work > 1.2 * a.want && a.liking > -0.2 ? 'work' : a.liking < 0 ? 'liking' : 'money';
}

const jobData = (w: World, giver: Npc, q: Quest) => ({
  npc: giver.name,
  qkind: q.kind,
  what: q.what,
  reward: q.reward,
  place: w.locations[q.site]?.name ?? 'somewhere',
  ...(q.kind === 'flatline' ? { target: q.what, target_g: q.targetGender ?? 'nonbinary' } : {}),
});

/** She's been told. Does she take it, and does she start on it now? */
function decide(c: Ctx, giver: Npc, q: Quest, fact: Fact): void {
  const { w, rng } = c;
  const a = appraise(w, giver, q);
  const data = { ...jobData(w, giver, q), want: fact.kind, why: reason(a) };
  if (!rng.chance(a.accept)) {
    cool(w, `quest_ask:${giver.id}`, 300);
    c.emit('quest', 'mixed', { variant: 'decline', ...data });
    return;
  }
  giver.affinity += 4;
  remember(giver, 'gave Blackbird a job');
  c.emit('quest', 'good', { variant: 'accept', ...data });
  // Now, or when there's room? The more she wants it and the freer she is, the likelier it's now.
  const free = 1 - topLevel(w).length / capacity(w);
  const now = rng.chance(clamp(0.2 + 0.7 * a.score + 0.3 * free, 0.1, 0.9));
  if (now && startQuestGoal(c, giver, a.desire, 'quest_now')) return;
  (w.mind.quests ??= []).push(giver.id);
  c.emit('quest', 'mixed', { variant: 'later', ...data });
}

/** Is it still worth doing? A job whose giver is gone, or that has been done or spoiled, drops out of her notes. */
export function livePending(w: World): Npc[] {
  const live: Npc[] = [];
  const notes = (w.mind.quests ??= []);
  for (const id of [...notes]) {
    const g = w.npcs[id];
    if (!g || !g.alive || !g.quest || g.quest.state === 'done' || g.quest.state === 'failed') notes.splice(notes.indexOf(id), 1);
    else if (!hasGoal(w, 'quest', id)) live.push(g);
  }
  return live;
}

// ===================================================================== asking, doing, reporting

function askQuest(c: Ctx, n: Npc, fact: Fact): void {
  const { w } = c;
  ensureDeep(w, n);
  const q = ensureQuest(w, n, fact);
  if (!q) {
    cool(w, `quest_ask:${n.id}`, 300);
    return;
  }
  const known = ((w.mind.known ??= {})[n.id] ??= []);
  if (!known.includes(fact.id)) known.push(fact.id);
  c.emit('quest', 'mixed', { variant: 'offer', ...jobData(w, n, q), want: fact.kind, rel: String(fact.data.rel ?? ''), streets: w.locations[q.site]?.gen?.depth ?? 0 });
  decide(c, n, q, fact);
}

function turnIn(c: Ctx, n: Npc): void {
  const { w } = c;
  const h = w.hero;
  const q = n.quest!;
  const data = jobData(w, n, q);
  if (q.kind === 'retrieve') {
    const i = carrying(w, n.id);
    if (i < 0) {
      // It was lost on the way (or it died with a body that carried it): the job is not done after all.
      q.state = 'open';
      for (const r of w.dungeons[q.site]?.rooms ?? []) if (r.objective) r.objective.done = false;
      c.emit('quest', 'bad', { variant: 'lost', ...data });
      return;
    }
    h.inventory.splice(i, 1);
  }
  q.state = 'done';
  h.cash += q.reward;
  n.cash = Math.max(0, n.cash - q.reward);
  n.affinity += 15;
  n.facts = (n.facts ?? []).filter((f) => f.id !== q.fact);
  remember(n, 'had Blackbird do a job');
  const tier = w.dungeons[q.site]?.tier ?? 1;
  h.fame += tier >= 3 ? 1 : 0;
  c.emit('quest', 'good', { variant: 'paid', ...data, want: 'done' });
  gainXp(c, 8 * tier);
}

/** The terminal: get into it. Fails make noise, and it will purge itself if she keeps at it. */
function hackSystem(c: Ctx, d: Dungeon, loc: Id, giver: Npc, q: Quest): void {
  const { w, rng } = c;
  const h = w.hero;
  const room = roomOf(d, loc)!;
  const watched = standing(w, d, loc).length > 0;
  const p = clamp(0.38 + h.hack * 0.055 + skillLevel(h, 'tinkering') * 0.03 + (hasAlly(w, 'hack') ? 0.08 : 0) - 0.04 * d.tier - (watched ? 0.12 : 0), 0.08, 0.92);
  train(c, 'tinkering', 2);
  const data = { ...jobData(w, giver, q), watched };
  if (rng.chance(p)) {
    room.objective!.done = true;
    q.state = 'ready';
    c.emit('quest', 'good', { variant: 'hacked', ...data });
    gainXp(c, 6 * d.tier);
    return;
  }
  room.objective!.fails++;
  if (room.objective!.fails >= 3) {
    q.state = 'failed';
    c.emit('quest', 'bad', { variant: 'locked', ...data });
  } else {
    c.emit('quest', 'bad', { variant: 'jammed', ...data });
  }
  if (!w.over && (watched ? rng.chance(0.6) : rng.chance(0.2)) && standing(w, d, loc).length) tripAlarm(c, d, w.locations[loc]!);
}

/** The thing: take it. */
function takeThing(c: Ctx, d: Dungeon, loc: Id, giver: Npc, q: Quest): void {
  const { w, rng } = c;
  const h = w.hero;
  const room = roomOf(d, loc)!;
  const watched = standing(w, d, loc).length > 0;
  const p = clamp(0.8 - 0.03 * d.tier + skillLevel(h, 'lockpicking') * 0.03 + skillLevel(h, 'sneak') * 0.02 - (watched ? 0.12 : 0), 0.1, 0.95);
  train(c, 'sneak', 1);
  const data = { ...jobData(w, giver, q), watched };
  if (rng.chance(p)) {
    room.objective!.done = true;
    q.state = 'ready';
    h.inventory.push(itemOf(giver.id, q));
    c.emit('quest', 'good', { variant: 'retrieved', ...data });
    gainXp(c, 6 * d.tier);
    return;
  }
  room.objective!.fails++;
  if (room.objective!.fails >= 2) {
    q.state = 'failed';
    c.emit('quest', 'bad', { variant: 'ruined', ...data });
  } else {
    c.emit('quest', 'bad', { variant: 'fumbled', ...data });
  }
  if (!w.over && (watched ? rng.chance(0.6) : rng.chance(0.15)) && standing(w, d, loc).length) tripAlarm(c, d, w.locations[loc]!);
}

// ===================================================================== what she can do

export function questCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  for (const n of here(w)) {
    if (n.hostile || !n.alive || n.gender === 'none') continue;
    if (n.quest && questReady(w, n)) {
      out.push({ key: `turn_in_quest:${n.id}`, drives: { greed: 1.0, quest: 0.8 }, bonus: 1.2 + n.affinity / 200, run: (c) => turnIn(c, n) });
      continue;
    }
    // (A job that has gone wrong for the night stays gone until the next one.)
    if (accepted(w, n.id) || cooling(w, `quest_ask:${n.id}`) || n.affinity < -10 || n.quest?.state === 'failed') continue;
    const fact = questWant(w, n);
    if (fact) out.push({ key: `ask_quest:${n.id}`, drives: { quest: 1.0, greed: 0.4, curiosity: 0.2 }, bonus: 0.15 + n.affinity / 250, run: (c) => askQuest(c, n, fact) });
  }
  // In the room the job is about, with the job in mind.
  const loc = w.locations[h.locationId];
  const d = dungeonOf(w, loc);
  const giver = d?.quest ? w.npcs[d.quest] : undefined;
  const q = giver?.quest;
  const room = d && loc ? roomOf(d, loc.id) : undefined;
  if (d && loc && giver?.alive && q && q.state === 'open' && room?.objective && !room.objective.done && accepted(w, giver.id)) {
    const foes = standing(w, d, loc.id).length > 0;
    if (room.objective.kind === 'item') {
      out.push({ key: `quest_take:${loc.id}`, drives: { greed: 0.6, curiosity: 0.4 }, bonus: 0.6, risk: foes ? 0.9 : 0.1, run: (c) => takeThing(c, d, loc.id, giver, q) });
    } else {
      out.push({ key: `quest_hack:${loc.id}`, drives: { curiosity: 0.8, greed: 0.4 }, bonus: 0.6, risk: foes ? 0.9 : 0.1, run: (c) => hackSystem(c, d, loc.id, giver, q) });
    }
  }
  return out;
}
