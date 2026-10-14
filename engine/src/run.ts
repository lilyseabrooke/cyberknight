import { Rng } from './rng';
import type { Ctx, GameEvent, World } from './types';
import type { EventData, Outcome } from './events';
import { createWorld, type RunOptions } from './world';
import { gather } from './interactions';
import type { Candidate } from './candidate';
import { spawnGroup } from './candidate';
import { addHeat, fight, here, npcsAt, relocate } from './combat';
import { DRIVES } from './personality';
import { riskScale, temperatureScale, traitBias } from './traits';
import { ambientExtras, scoutSaves, tryTalkDown } from './extras';
import { ambientDragons } from './dragons';
import { ambientGraffiti } from './graffiti';
import { hasImplantFlag, skillLevel } from './skills';
import { expireBuffs, restockShelf } from './supply';
import { discretion } from './discretion';
import { scanBounties } from './bounty';
import { ambientMind, goalBias, mindAfter, mindBefore, mindTick } from './goals';
import { heatBias, npdResponse } from './laylow';
import { passionBias, tickVenues } from './stage';
import { tickHustles } from './hustles';
import { satietyBias, tickSatiety } from './romance';
import { BASE_MIN_PER_BEAT } from './clock';

export const MAX_BEATS = 600;

const AGGRESSIVE = new Set(['challenge', 'sweep', 'threaten', 'pickpocket', 'join_brawl', 'challenge_dragon', 'steal_puppy', 'till', 'safe', 'vault', 'crates']);

export function score(w: World, cand: Candidate): number {
  const h = w.hero;
  const weights = h.personality.weights;
  let s = cand.bonus ?? 0;
  for (const d of DRIVES) s += (cand.drives[d] ?? 0) * weights[d];
  s += traitBias(w, cand);
  s += goalBias(w, cand);
  s += satietyBias(w, cand);
  s += heatBias(w, cand);
  s += passionBias(w, cand);
  s += (cand.smart ?? 0) * h.competence;
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

export function createRun(opts: RunOptions): { world: World; events: GameEvent[] } {
  const world = createWorld(opts);
  const events: GameEvent[] = [
    { beat: 0, type: 'depart', outcome: 'good', data: { place: world.locations[world.hero.locationId]!.name } },
  ];
  world.locations[world.hero.locationId]!.visits = 1;
  events.push({ beat: 0, type: 'weather', outcome: 'mixed', data: { variant: world.situation.weather, hit: 0, opening: true } });
  return { world, events };
}

/** Advance one beat. Mutates the world; fully determined by (world state incl. rngPosition). */
export function step(w: World): GameEvent[] {
  if (w.over) return [];
  const rng = Rng.fromPosition(w.rngPosition);
  const events: GameEvent[] = [];
  w.beat++;
  w.clock += BASE_MIN_PER_BEAT;
  const c: Ctx = {
    w,
    rng,
    emit(type: string, outcome: Outcome, data: EventData = {}) {
      events.push({ beat: w.beat, type, outcome, data });
    },
  };

  const before = mindBefore(w);
  let chosen: Candidate | null = null;
  upkeep(c);
  if (!w.over) scanBounties(c);
  if (!w.over) ambientExtras(c);
  if (!w.over) ambientDragons(c);
  if (!w.over && !events.some((e) => e.type === 'fight_end')) ambientGraffiti(c);
  if (!w.over && !events.some((e) => e.type === 'fight_end')) ambient(c);
  if (!w.over && !events.some((e) => e.type === 'fight_end')) ambientMind(c);
  if (!w.over) mindTick(c);
  if (!w.over && !events.some((e) => e.type === 'fight_end')) {
    const cands = gather(w);
    if (cands.length) {
      const pick = choose(w, rng, cands);
      chosen = pick;
      w.recent.push(pick.key);
      if (w.recent.length > 14) w.recent.shift();
      pick.run(c);
    }
  }

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
  if (!w.over && w.beat >= MAX_BEATS) {
    w.over = true;
    w.ending = 'dawn';
    c.emit('dawn', 'mixed', { place: w.locations[w.hero.locationId]!.name });
  }
  w.rngPosition = rng.position;
  return events;
}

function upkeep(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  expireBuffs(c);
  w.flags.blackout = w.beat < w.blackoutUntil;
  if (w.beat % 10 === 0) for (const k of Object.keys(w.heat)) w.heat[k] = Math.max(0, (w.heat[k] ?? 0) - 1);
  if (w.beat % 8 === 0 && h.drunk > 0) h.drunk--;
  tickSatiety(h);
  // Shipments arrive; tempers cool. No timers on her, just the world carrying on.
  if (w.beat % 30 === 0) w.counters.paint_stock = Math.min(10, (w.counters.paint_stock ?? 0) + 2);
  if (w.beat % 90 === 0) restockShelf(c);
  tickVenues(w);
  tickHustles(c);
  if (w.beat % 12 === 0) for (const n of Object.values(w.npcs)) if (n.alive && n.affinity !== 0) n.affinity += n.affinity > 0 ? -1 : 1;
  // No passive regeneration. Wounds stay until a med pack or a street doc deals with them.
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
    const heavy = [w.npcs.tiny, w.npcs.dutch].find((n) => n?.alive && n.locationId === loc.id);
    if (heavy) {
      c.emit('banned', 'bad', { npc: heavy.name });
      fight(c, [heavy], { cause: 'being banned from the Rusty Halo' });
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
    c.emit('raid', 'bad', { crackdown: w.situation.crackdown });
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
  const cap = opts.maxBeats ?? MAX_BEATS + 5;
  let guard = 0;
  while (!world.over && guard++ < cap) events.push(...step(world));
  return { world, events };
}
