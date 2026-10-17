import { Rng } from './rng';
import type { Ctx, GameEvent, World } from './types';
import { nested, type EventData, type Outcome } from './events';
import { createWorld, type RunOptions } from './world';
import { gather } from './interactions';
import type { Candidate } from './candidate';
import { spawnGroup } from './candidate';
import { addHeat, fight, here, npcsAt, relocate } from './combat';
import { DRIVES } from './personality';
import { riskScale, temperatureScale, traitBias } from './traits';
import { ambientExtras, scoutSaves, tryTalkDown } from './extras';
import { ambientDragons } from './dragons';
import { tickDying } from './dying';
import { ambientGraffiti } from './graffiti';
import { hasImplantFlag, skillLevel } from './skills';
import { expireBuffs, restockShelf } from './supply';
import { discretion } from './discretion';
import { closureTick, heavyFor, hiringTick } from './shutdown';
import { scanBounties } from './bounty';
import { scanHomes } from './homes';
import { recognizeRevenant } from './revenant';
import { bondTick, partnerArrives } from './bonds';
import { avengerTick, noticeTick } from './knowledge';
import { ambientMind, goalBias, mindAfter, mindBefore, mindTick } from './goals';
import { adviceTick, resolveAsk } from './advice';
import { interest } from './mind';
import { haloShun, heatBias, npdResponse } from './laylow';
import { passionBias, tickVenues } from './stage';
import { tickHustles } from './hustles';
import { tickGyms } from './gym';
import { tickPawns } from './pawn';
import { satietyBias, tickSatiety } from './romance';
import { needsBias, tickNeeds } from './rest';
import { BASE_MIN_PER_BEAT, FIGHT_MINUTES, actionMinutes, crossedDawn, dayOf } from './clock';
import { npcNamed } from './population';
import { dungeonAmbient } from './dungeons';
import { art } from './lab';

/** Only for headless loops and tests (runToEnd, sims). The game itself never caps a run: it ends when Blackbird does. */
export const TEST_BEAT_CAP = 600;

/** Event data fields that hold a person's name. Their gender rides along as `<key>_g` so the text can use the right pronouns. */
const PEOPLE_KEYS = ['npc', 'npc2', 'victim', 'foe', 'target', 'owner'] as const;

const AGGRESSIVE = new Set(['challenge', 'sweep', 'threaten', 'pickpocket', 'join_brawl', 'challenge_dragon', 'steal_puppy', 'till', 'safe', 'vault', 'crates', 'raid_ambush', 'gymfight', 'pawnfight', 'hijack']);

export function score(w: World, cand: Candidate): number {
  const h = w.hero;
  const weights = h.personality.weights;
  let s = cand.bonus ?? 0;
  for (const d of DRIVES) s += (cand.drives[d] ?? 0) * weights[d];
  s += traitBias(w, cand);
  s += goalBias(w, cand);
  s += satietyBias(w, cand);
  s += heatBias(w, cand);
  s += needsBias(w, cand);
  s += haloShun(w, cand);
  s += passionBias(w, cand);
  s += (cand.smart ?? 0) * h.competence;
  s += restlessness(w, cand);
  // Not in front of people. Not where the police will hear about it.
  s -= discretion(w, cand);
  s -= (cand.risk ?? 0) * (0.25 + h.competence * 1.5) * riskScale(w);
  // Baseline survival instinct (competence only makes it reliable): hurt heroes pick fewer fights.
  const hpRatio = h.hp / h.maxHp;
  if (hpRatio < 0.5 && AGGRESSIVE.has(cand.key.split(':')[0]!)) s -= (0.5 - hpRatio) * 5;
  // Novelty: she gets bored of doing the same thing.
  const repeats = w.recent.filter((k) => k === cand.key).length;
  s -= repeats * 0.5;
  return s;
}

/**
 * Novelty-seeking. The more she's done somewhere the less it holds her: everything she could do
 * here gets duller, and heading for somewhere fresher gets more tempting, in proportion to how
 * much more interesting it is than where she's standing. Curious, thrill-seeking girls feel it
 * most; the incurious homebody still gets bored, just slower.
 */
export function restlessness(w: World, cand: Candidate): number {
  const [family, dest] = cand.key.split(':') as [string, string | undefined];
  const t = w.hero.personality.traits;
  const appetite = Math.max(0.3, 0.8 + (t.curiosity - 0.5) + 0.4 * (t.thrill - 0.5));
  const bored = 1 - interest(w, w.hero.locationId);
  if ((family !== 'go' && family !== 'drive') || !dest) return -1.5 * appetite * bored;
  return 3 * appetite * (interest(w, dest) - (1 - bored)) + 1.5 * appetite * bored;
}

/** Softmax pick. Competence lowers the temperature, so a sharper mind picks the best option more reliably. */
export function choose(w: World, rng: Rng, cands: Candidate[]): Candidate {
  const temperature = (0.2 + (1 - w.hero.competence) * 0.6) * temperatureScale(w);
  // Pick a kind of thing first, then a target: normalise by how many options share a family
  // so a crowded bar doesn't make "start a fight" fourteen times more likely than anything else.
  const family = (c: Candidate) => c.key.split(':')[0]!;
  const counts = new Map<string, number>();
  for (const c of cands) counts.set(family(c), (counts.get(family(c)) ?? 0) + 1);
  const scores = cands.map((c) => score(w, c) / temperature - 0.85 * Math.log(counts.get(family(c))!));
  const max = Math.max(...scores);
  const exps = scores.map((x) => Math.exp(x - max));
  const total = exps.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < cands.length; i++) {
    roll -= exps[i]!;
    if (roll <= 0) return cands[i]!;
  }
  return cands[cands.length - 1]!;
}

/** What the log opens with: she leaves, and what the weather is doing. */
export function openingEvents(world: World): GameEvent[] {
  world.locations[world.hero.locationId]!.visits = 1;
  return [
    { beat: 0, type: 'depart', outcome: 'good', data: { place: world.locations[world.hero.locationId]!.name } },
    { beat: 0, type: 'weather', outcome: 'mixed', data: { variant: world.situation.weather, hit: 0, opening: true } },
  ];
}

export function createRun(opts: RunOptions): { world: World; events: GameEvent[] } {
  const world = createWorld(opts);
  return { world, events: openingEvents(world) };
}

/**
 * A context that records into `events`. `emit` stamps who is who; `nest` opens a group, so what `fn` emits is marked
 * as belonging to the event that opened it.
 */
export function makeCtx(w: World, rng: Rng, events: GameEvent[]): Ctx {
  /** The groups we're inside right now, innermost last. */
  const open: string[] = [];
  const c: Ctx = {
    w,
    rng,
    emit(type: string, outcome: Outcome, data: EventData = {}) {
      for (const k of PEOPLE_KEYS) {
        const name = data[k];
        if (typeof name === 'string' && data[`${k}_g`] === undefined) {
          const who = npcNamed(w, name);
          if (who) data[`${k}_g`] = who.gender;
        }
      }
      const parent = open[open.length - 1];
      events.push({ beat: w.beat, type, outcome, data, ...(parent ? { in: parent } : {}) });
    },
    nest(type: string, outcome: Outcome, data: EventData, fn: () => void) {
      c.emit(type, outcome, data);
      const header = events[events.length - 1]!;
      header.id = `${w.beat}.${events.length}`;
      open.push(header.id);
      try {
        fn();
      } finally {
        open.pop();
      }
    },
  };
  return c;
}

/** Do what she has chosen. If it was something she set out to do, that is announced first and its outcome is told under it. */
export function perform(c: Ctx, pick: Candidate): void {
  if (pick.intent) nested(c, 'intent', 'mixed', { ...pick.intent, variant: pick.key.replace(/:.*$/, '') }, () => pick.run(c));
  else pick.run(c);
}

/** Advance one beat. Mutates the world; fully determined by (world state incl. rngPosition). */
export function step(w: World): GameEvent[] {
  if (w.over) return [];
  const rng = Rng.fromPosition(w.rngPosition);
  const events: GameEvent[] = [];
  w.beat++;
  const clockBefore = w.clock;
  w.clock += BASE_MIN_PER_BEAT;
  const c = makeCtx(w, rng, events);

  const before = mindBefore(w);
  let chosen: Candidate | null = null;
  upkeep(c);
  if (!w.over) closureTick(c);
  if (!w.over) hiringTick(c);
  if (!w.over) scanBounties(c);
  if (!w.over) scanHomes(c);
  if (!w.over) recognizeRevenant(c);
  if (!w.over) bondTick(c);
  if (!w.over) noticeTick(c);
  if (!w.over) avengerTick(c);
  if (!w.over) partnerArrives(c);
  if (!w.over) dungeonAmbient(c);
  if (!w.over && w.locations[w.hero.locationId]?.road !== 'highway') ambientExtras(c);
  if (!w.over) ambientDragons(c);
  if (!w.over) tickDying(c);
  if (!w.over && w.locations[w.hero.locationId]?.road !== 'highway' && !events.some((e) => e.type === 'fight_end')) ambientGraffiti(c);
  if (!w.over && !events.some((e) => e.type === 'fight_end')) ambient(c);
  if (!w.over && !events.some((e) => e.type === 'fight_end')) ambientMind(c);
  if (!w.over) adviceTick(c);
  if (!w.over) mindTick(c);
  if (!w.over && !events.some((e) => e.type === 'fight_end')) {
    const cands = gather(w);
    if (cands.length) {
      const pick = choose(w, rng, cands);
      chosen = pick;
      w.recent.push(pick.key);
      if (!pick.key.startsWith('go:')) {
        const loc = w.locations[w.hero.locationId];
        if (loc) loc.doings = (loc.doings ?? 0) + 1;
      }
      if (w.recent.length > 14) w.recent.shift();
      perform(c, pick);
      w.clock += Math.max(0, actionMinutes(pick.key) - BASE_MIN_PER_BEAT);
    }
  }
  w.clock += FIGHT_MINUTES * events.filter((e) => e.type === 'fight_end').length;

  if (!w.over) mindAfter(c, chosen, before, events);

  if (!w.over && w.hero.hp <= 0 && hasImplantFlag(w.hero, 'defib') && !w.flags.defib_used) {
    w.flags.defib_used = true;
    w.hero.hp = Math.round(w.hero.maxHp * 0.3);
    c.emit('defib', 'mixed', {});
  }
  if (!w.over && w.hero.hp <= 0) {
    // killed by a non-combat cause (zaps, poison, rats of fate)
    w.over = true;
    w.ending = 'dead';
    c.emit('death', 'bad', { killer: 'her own terrible idea', place: w.locations[w.hero.locationId]!.name, cause: 'misadventure', level: w.hero.level });
  }
  // Dawn doesn't end anything: it breaks, and she carries on into the next night.
  if (!w.over && crossedDawn(clockBefore, w.clock)) {
    c.emit('dawn', 'mixed', { place: w.locations[w.hero.locationId]!.name, day: dayOf(w.clock) });
  }
  w.rngPosition = rng.position;
  return events;
}

/**
 * The lab tech answers Blackbird's question: `optionId` is one of the open question's options. Returns what came of it,
 * for the log (empty if there is nothing to answer, or no such option). Call it between beats; it takes no beat of its
 * own, and it uses the world's dice like any other step, so the night stays replayable.
 */
export function advise(w: World, optionId: string): GameEvent[] {
  if (w.over || !w.mind.ask) return [];
  const rng = Rng.fromPosition(w.rngPosition);
  const events: GameEvent[] = [];
  resolveAsk(makeCtx(w, rng, events), optionId, 'lab');
  w.rngPosition = rng.position;
  return events;
}

function upkeep(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  expireBuffs(c);
  w.flags.blackout = w.beat < w.blackoutUntil;
  if (w.beat % 10 === 0) for (const k of Object.keys(w.heat)) w.heat[k] = Math.max(0, (w.heat[k] ?? 0) - 1);
  // The Halo's grudge fades faster than the police's.
  if (w.beat % 5 === 0 && (w.heat.halo ?? 0) > 0) w.heat.halo!--;
  if (w.beat % 8 === 0 && h.drunk > 0) h.drunk--;
  tickSatiety(h);
  tickNeeds(c);
  if (w.over) return;
  // Shipments arrive; tempers cool. No timers on her, just the world carrying on.
  if (w.beat % 30 === 0) w.counters.paint_stock = Math.min(10, (w.counters.paint_stock ?? 0) + 2);
  if (w.beat % 90 === 0) restockShelf(c);
  tickVenues(w);
  tickHustles(c);
  tickGyms(c);
  tickPawns(c);
  if (w.beat % 12 === 0) for (const n of Object.values(w.npcs)) if (n.alive && n.affinity !== 0) n.affinity += n.affinity > 0 ? -1 : 1;
  // No passive regeneration, bar the lab's Steady Regeneration: a few hit points now and then, never past half health. Real wounds still want a med pack or a street doc.
  if (w.beat % 10 === 0 && h.hp > 0 && h.hp < h.maxHp * 0.5) {
    const regen = art(w.legacy, 'regen');
    if (regen > 0) h.hp = Math.min(Math.ceil(h.maxHp * 0.5), h.hp + regen);
  }
  if (h.drunk >= 6 + Math.floor(skillLevel(h, 'tolerance') / 2)) {
    const lost = Math.round(h.cash * 0.4);
    h.cash -= lost;
    h.drunk = 2;
    h.hp = Math.max(1, h.hp - 5);
    const loc = w.locations[h.locationId]!;
    relocate(w, loc.outdoors ? h.locationId : loc.tossTo);
    h.buffs.push({ id: 'hangover', until: w.beat + 30, power: -3 });
    c.emit('blackout', 'bad', { lost, place: w.locations[h.locationId]!.name });
  }
}

/** Things the city does on its own: ambushes, raids, muggings, gang wars, drones. */
function ambient(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = here(w);

  // Dragon notices a wandering hero.
  const dragon = w.npcs.dragon;
  if (loc.id === 'overpass' && dragon?.alive && rng.chance(0.35)) {
    c.emit('dragon_notices', 'bad', { npc: dragon.name });
    fight(c, [dragon], { cause: 'the dragon noticing her' });
    return;
  }

  // Police response: drones at low heat, officers at high. Lying low indoors keeps her out of reach.
  if (npdResponse(c)) return;
  // On a highway nothing else turns up: no muggers, no raids, no neighbours.
  if (loc.road === 'highway') return;
  // Atlas retrieval team.
  const atlas = w.heat.atlas ?? 0;
  if (loc.outdoors && atlas >= 5 && rng.chance(0.15)) {
    if (scoutSaves(c)) return;
    const squad = spawnGroup(c, 'helix_guard', 2);
    c.emit('ambush', 'bad', { variant: 'atlas', count: squad.length, heat: atlas });
    fight(c, squad, { cause: 'an Atlas retrieval team', joiners: false });
    return;
  }

  // Banned from the bar.
  if (loc.id === 'halo_floor' && (w.heat.halo ?? 0) >= 4 && rng.chance(0.25)) {
    const heavy = heavyFor(w, loc.id);
    if (heavy) {
      c.emit('banned', 'bad', { npc: heavy.name, place: loc.name });
      fight(c, [heavy], { cause: `being banned from ${loc.name}` });
      return;
    }
  }

  // Club security gets suspicious of troublemakers.
  if (loc.id === 'neon_pharaoh' && (w.heat.club ?? 0) >= 2 && rng.chance(0.25)) {
    const guards = crowd.filter((n) => n.tags.includes('security'));
    if (guards.length) {
      c.emit('security_closes_in', 'bad', { npc: guards[0]!.name });
      if (!tryTalkDown(c, guards.slice(0, 3))) fight(c, guards.slice(0, 3), { cause: 'club security running out of patience', joiners: false });
      return;
    }
  }

  // Police crackdown raid on the bar (situational variable).
  if (loc.id === 'halo_floor' && !w.flags.raided && rng.chance(0.035)) {
    w.flags.raided = true;
    const squad = spawnGroup(c, 'npd_officer', 2);
    c.emit('raid', 'bad', { crackdown: w.situation.crackdown, place: w.locations.halo_floor?.name ?? 'the Rusty Halo' });
    if (h.drunk >= 2 || rng.chance(0.4)) {
      fight(c, squad, { cause: 'a police raid', joiners: false });
    } else {
      const fine = Math.min(h.cash, rng.int(20, 60));
      h.cash -= fine;
      c.emit('raid_fine', 'bad', { fine });
      for (const s of squad) s.alive = false;
    }
    return;
  }

  // Muggers.
  if (loc.outdoors && loc.id !== 'overpass' && loc.id !== 'halo_roof' && rng.chance(w.situation.weather === 'acid_rain' ? 0.015 : 0.03)) {
    if (scoutSaves(c)) return;
    const gang = spawnGroup(c, 'mugger', rng.int(1, 2));
    c.emit('mugging', 'bad', { count: gang.length });
    fight(c, gang, { cause: 'a mugging', joiners: false });
    return;
  }

  // Drone patrol.
  const drone = npcsAt(w, loc.id).find((n) => n.archetype === 'drone' && !n.hostile);
  if (drone && rng.chance(0.14)) {
    if ((w.heat.atlas ?? 0) >= 1 || rng.chance(0.3)) {
      c.emit('drone', 'bad', { variant: 'spots', npc: drone.name });
      fight(c, [drone], { cause: 'a drone sweep' });
      return;
    }
    addHeat(w, 'atlas', 1);
    c.emit('drone', 'mixed', { variant: 'scan', npc: drone.name });
  }

  // The gang war in the bar spills over.
  if (loc.id === 'halo_floor') {
    if (w.brawlUntil > w.beat) {
      if (rng.chance(0.3)) {
        const hit = rng.int(4, 10);
        h.hp -= hit;
        c.emit('stray_bottle', 'bad', { hit });
      }
    } else if (w.brawlUntil && w.brawlUntil <= w.beat) {
      w.brawlUntil = 0;
      c.emit('brawl_over', 'mixed', {});
    } else {
      const [g1, g2] = w.situation.warringGangs;
      const hasBoth = [g1, g2].every((g) => crowd.some((n) => n.faction === g && n.tags.includes('ganger')));
      if (hasBoth && rng.chance(0.06)) {
        w.brawlUntil = w.beat + 6;
        c.emit('gang_brawl', 'mixed', { g1, g2 });
      }
    }
  }
}

/** Run an entire night headlessly. */
export function runToEnd(opts: RunOptions & { maxBeats?: number }): { world: World; events: GameEvent[] } {
  const { world, events } = createRun(opts);
  const cap = opts.maxBeats ?? TEST_BEAT_CAP + 5;
  let guard = 0;
  while (!world.over && guard++ < cap) events.push(...step(world));
  return { world, events };
}
