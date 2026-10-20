import type { Candidate } from './candidate';
import type { GameEvent } from './events';
import type { Ctx, Goal, Id, Location, Mission, World } from './types';
import { Rng } from './rng';
import { clamp } from './candidate';
import { coolFor, cooling, hasGoal } from './mind';
import { routeTo } from './plans';
import { audience } from './renown';
import { startMissionGoal } from './goals';
import { MISSIONS } from './content/missions';
import { flag, tell, waiting, type MissionDef, type MissionEntry } from './missionkit';

/**
 * Missions: small stories that happen to her. A retired guitar legend whose guitar Muse took; a rival; a band that wants one last
 * night. Each is a definition (content/missions/) with a cast, some places and a few stages, rolled fresh each time on its own
 * stream, so the same mission is a different story with different people every time it comes round. Missions are not a track:
 * they are written against whatever she is good at (the first ones hang off Guitar), and anything can happen in one.
 *
 * **She runs it herself.** Nothing takes the wheel. A mission she knows about is a goal (`mission`, goals.ts) that pulls her to
 * wherever the stage wants her, and the stage offers the things she can do there; she does them or doesn't, the way she does
 * anything. At a fork she may ask the lab (`maybeAsk`); if nobody answers, her nature decides.
 *
 * **The world's, not hers.** The mission lives on the legacy, with its people and places, so it outlives her. What she knows of
 * it is her body's (`Mind.missions`): a new body knows nothing of it. It is still there, at the stage it reached, with the people
 * in it waiting; she picks it back up only if she happens across one of them and they bring it up (`remembers`). The Holocall
 * layer, when it comes, will call `remindMission` to reach a body that doesn't know.
 *
 * **How one reaches her** (`entries`): somebody comes up to her after a good set; a fan on the grapevine has heard something; or
 * she finds a thing with a story attached and picks it up.
 */

const defOf = (m: Mission): MissionDef | undefined => MISSIONS[m.def];
export const missionsOf = (w: World): Mission[] => (w.legacy.missions ??= []);
export const missionById = (w: World, id: string | undefined): Mission | undefined => (id ? w.legacy.missions?.find((m) => m.id === id) : undefined);
const live = (w: World): Mission[] => missionsOf(w).filter((m) => !m.ending);
/** Does this body know it is in it? */
export const knowsMission = (w: World, m: Mission): boolean => !!w.mind.missions?.includes(m.id);

// ===================================================================== starting one

/** Roll a mission and tell her about it. Null if the world can't host it yet. */
export function startMission(c: Ctx, defId: string, via: MissionEntry): Mission | null {
  const { w } = c;
  const def = MISSIONS[defId];
  if (!def) return null;
  const n = missionsOf(w).filter((m) => m.def === defId).length + 1;
  const m: Mission = { id: `${defId}_${n}`, def: defId, stage: def.first, cast: {}, places: {}, picks: {}, flags: {}, via, run: w.legacy.runs };
  if (!def.roll(w, new Rng(`mission:${w.worldSeed}:${m.id}`), m)) return null;
  missionsOf(w).push(m);
  learnMission(c, m, via);
  return m;
}

/** She hears about it (for the first time, or for the first time in this body), and probably makes it a goal. */
function learnMission(c: Ctx, m: Mission, via: string): void {
  const { w } = c;
  const def = defOf(m);
  if (!def || knowsMission(w, m)) return;
  (w.mind.missions ??= []).push(m.id);
  const hook = def.hook(w, m, via);
  tell(c, def, m, `hook_${via}`, 'mixed', hook.text, hook.thought, hook.npc ? { npc: hook.npc.name } : {});
  takeUp(c, m, def);
}

/**
 * Bring a mission to a body that doesn't know about it. For whatever reaches her across the city (a holocall, a letter); today only
 * the cast do it, in person. Returns false if it's over, or she already knows.
 */
export function remindMission(c: Ctx, id: string, via: string): boolean {
  const m = missionById(c.w, id);
  if (!m || m.ending || knowsMission(c.w, m)) return false;
  learnMission(c, m, via);
  return true;
}

/** How much she wants to see it through: her nature, read through what the mission cares about. */
function desireFor(w: World, def: MissionDef): number {
  const t = w.hero.personality.traits;
  let d = 0.6;
  for (const [k, v] of Object.entries(def.stick)) d += (v ?? 0) * (t[k as keyof typeof t] - 0.5);
  return clamp(d, 0.3, 0.92);
}

/** Make it a goal, if she has room. If not, it waits on her mind and she tries again in a while. */
function takeUp(c: Ctx, m: Mission, def: MissionDef): Goal | null {
  const { w } = c;
  if (hasGoal(w, 'mission', m.id) || cooling(w, `mission_try:${m.id}`)) return null;
  const g = startMissionGoal(c, m, desireFor(w, def));
  if (!g) coolFor(w, `mission_try:${m.id}`, 180);
  return g;
}

// ===================================================================== each beat

export function missionsTick(c: Ctx): void {
  const { w, rng } = c;
  for (const m of live(w)) {
    const def = defOf(m);
    if (!def) continue;
    def.watch?.(c, m);
    if (m.ending || w.over) continue;
    if (!knowsMission(w, m)) {
      // A new body doesn't know. Somebody in it who sees her may bring it up.
      for (const role of def.remembers) {
        const n = w.npcs[m.cast[role] ?? ''];
        if (n?.alive && n.locationId === w.hero.locationId && !((n.downUntil ?? 0) > w.clock) && rng.chance(0.35)) {
          learnMission(c, m, 'reminded');
          break;
        }
      }
      continue;
    }
    // A fork she asked the lab about, and the question has gone away without an answer (a new body, say): ask again.
    if (m.flags.asked && w.mind.ask?.kind !== 'mission') delete m.flags.asked;
    def.stages[m.stage]?.tick?.(c, m);
    if (m.ending) continue;
    // Waiting isn't failing: she's not getting fed up with something that's on hold for a reason, or with a stage that something
    // else is carrying (a job goal pulling her to the lockup).
    if (waiting(w, m) || !def.stages[m.stage]?.where) for (const g of w.mind.goals) if (g.kind === 'mission' && g.mission === m.id) g.lastProgress = w.beat;
    takeUp(c, m, def);
  }
  // What she knew of the ones that are over goes with them.
  if (w.mind.missions?.length) w.mind.missions = w.mind.missions.filter((id) => !missionById(w, id)?.ending);
}

/** The lab (or she herself) has decided a fork. */
export function resolveMissionPick(c: Ctx, id: string, pick: string): void {
  const m = missionById(c.w, id);
  if (!m || m.ending) return;
  delete m.flags.asked;
  defOf(m)?.resolve?.(c, m, pick);
}

// ===================================================================== what she can do

export function missionCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  for (const m of live(w)) {
    if (!knowsMission(w, m)) continue;
    const st = defOf(m)?.stages[m.stage];
    if (st?.candidates) out.push(...st.candidates(w, m));
  }
  const relic = relicCandidate(w);
  if (relic) out.push(relic);
  return out;
}

/** After a set: a stage that cares about her playing hears about it, and somebody in the crowd may have a story for her. */
export function missionAfterSet(c: Ctx, act: string, skill: string, events: GameEvent[]): void {
  const { w, rng } = c;
  const good = events.some((e) => e.type === act && e.outcome === 'good');
  for (const m of live(w)) if (knowsMission(w, m)) defOf(m)?.stages[m.stage]?.afterSet?.(c, m, act, good);
  if (!good || w.over) return;
  const loc = w.locations[w.hero.locationId];
  if (!loc || audience(w, loc) < 3) return;
  for (const def of Object.values(MISSIONS)) {
    const p = def.entries.after_set ?? 0;
    if (p > 0 && def.track === skill && def.eligible(w) && rng.chance(p)) {
      startMission(c, def.id, 'after_set');
      return;
    }
  }
}

/** The grapevine (fans.ts) has a tip going spare: sometimes it's the start of something. True if it was. */
export function missionGrapevine(c: Ctx): boolean {
  const { w, rng } = c;
  for (const def of Object.values(MISSIONS)) {
    const p = def.entries.grapevine ?? 0;
    if (p > 0 && def.eligible(w) && rng.chance(p) && startMission(c, def.id, 'grapevine')) return true;
  }
  return false;
}

// ===================================================================== a thing with a story attached

/** Where a thing with a story might be lying about: pawn shops, bars, clubs. */
const RELIC_PLACE = new Set(['pawn', 'bar', 'club']);

/** Is there something here with a name scratched in it? Fixed per place and save (on its own stream), and one find per place. */
function relicHere(w: World, loc: Location, def: MissionDef): boolean {
  const p = def.entries.object ?? 0;
  if (p <= 0 || !RELIC_PLACE.has(loc.kind) || loc.dungeon || w.counters[`relic:${loc.id}`]) return false;
  return new Rng(`relic:${w.worldSeed}:${def.id}:${loc.id}:${missionsOf(w).length}`).chance(p);
}

function relicCandidate(w: World): Candidate | null {
  const loc = w.locations[w.hero.locationId];
  if (!loc) return null;
  for (const def of Object.values(MISSIONS)) {
    if (!def.eligible(w) || !relicHere(w, loc, def)) continue;
    return {
      key: `mission_relic:${def.id}`, drives: { curiosity: 1.0, greed: 0.2 }, bonus: 0.1,
      run: (c) => {
        c.w.counters[`relic:${loc.id}`] = 1;
        startMission(c, def.id, 'object');
      },
    };
  }
  return null;
}

// ===================================================================== the goal (goals.ts reads these)

export function missionLabel(w: World, id: string | undefined): string {
  const m = missionById(w, id);
  const st = m ? defOf(m)?.stages[m.stage] : undefined;
  return m && st ? st.label(w, m) : 'see something through';
}

/** Gone, over, or forgotten: what the goal makes of it. */
export function missionVerdict(w: World, id: string | undefined): { done: string } | { drop: string } | null {
  const m = missionById(w, id);
  if (!m || !knowsMission(w, m)) return { drop: 'moot' };
  if (m.ending) return { done: 'mission' };
  return null;
}

/** Where the mission wants her right now (nowhere while it's on hold). */
export function missionWhere(w: World, id: string | undefined): Id | null {
  const m = missionById(w, id);
  if (!m || m.ending || waiting(w, m)) return null;
  return defOf(m)?.stages[m.stage]?.where?.(w, m) ?? null;
}

/** Nearer is better, and a stage further on is better still. */
export function missionMetric(w: World, id: string | undefined): number {
  const m = missionById(w, id);
  const def = m ? defOf(m) : undefined;
  if (!m || !def) return 0;
  const step = Object.keys(def.stages).indexOf(m.stage) * 20 + flag(m, 'progress') * 5;
  const to = missionWhere(w, id);
  return step - (to ? routeTo(w, w.hero.locationId, to)?.dist ?? 12 : 0);
}
