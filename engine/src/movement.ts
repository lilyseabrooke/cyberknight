import { Rng, hashString } from './rng';
import { phaseOf } from './clock';
import { crowdAt, isClosed } from './hours';
import { AWAY, everyoneAt, hauntersOf, moveNpc } from './population';
import type { Id, Npc, World } from './types';

/**
 * Where people are when nobody is watching.
 *
 * Nobody off-screen is simulated. An NPC with haunts has a position that is a pure function of
 * (world seed, who they are, the clock): they spend a stretch of time somewhere, then another
 * stretch somewhere else, by their routine for the time of day or else by their haunts' weights.
 * So an absence of ten minutes or ten days costs the same, two observers agree, and no state has
 * to be saved between looks. People without haunts (the whole authored cast, for now) never move.
 *
 * Settling only happens when Blackbird arrives somewhere (`settleAt`), and everybody who is in the
 * room when she leaves is pinned where she last saw them (`pinAt`), so people don't blink out of
 * existence while she watches.
 */

/** Shortest stay, in world minutes. Each person adds their own 0-60 so the crowd doesn't move in lockstep. */
const STAY = 60;

const tempo = (id: Id): number => hashString(`tempo:${id}`) % 61;

/** Where this person would be at `now`, if left alone. Does not move anybody. */
export function placeAt(w: World, n: Npc, now: number): Id {
  if (!n.haunts && !n.routine) return n.locationId;
  const stay = STAY + tempo(n.id);
  const slot = Math.floor((now + tempo(n.id) * 7) / stay);
  const rng = new Rng(`at:${w.worldSeed}:${n.id}:${slot}`);
  const ok = (loc: Id): boolean => loc === AWAY || (!!w.locations[loc] && !isClosed(w, loc));
  const routine = n.routine?.[phaseOf(now)];
  let to: Id | undefined;
  if (routine && ok(routine) && rng.chance(0.8)) to = routine;
  else {
    const options = Object.entries(n.haunts ?? {}).filter(([loc, wt]) => wt > 0 && ok(loc));
    // With nowhere else to be, they stay put, unless the doors have closed on them.
    if (!options.length) return isClosed(w, n.locationId) && n.locationId !== AWAY ? AWAY : n.locationId;
    to = rng.weighted(options, ([, wt]) => wt)[0];
  }
  // Bystanders come and go with the hour: a club is empty at six and packed at midnight.
  const there = w.locations[to];
  if (n.ephemeral && there && new Rng(`crowd:${w.worldSeed}:${n.id}:${slot}`).next() >= crowdAt(w, there, now)) return AWAY;
  return to;
}

const movable = (w: World, n: Npc): boolean =>
  n.alive && !n.hostile && n.downUntil <= w.clock && (!n.locationId.startsWith('_') || n.locationId === AWAY);

/** Bring one person up to date. Returns true if they went somewhere. */
export function settle(w: World, n: Npc, now: number): boolean {
  if (!movable(w, n) || (!n.haunts && !n.routine)) return false;
  const since = n.settledAt ?? 0;
  if (now - since < STAY + tempo(n.id)) return false;
  n.settledAt = now;
  const to = placeAt(w, n, now);
  if (to === n.locationId) return false;
  moveNpc(w, n, to);
  return true;
}

/**
 * Everybody who stands here or turns up here gets brought up to date. Call it as Blackbird
 * walks into a place, before she looks around.
 */
export function settleAt(w: World, loc: Id, now: number): Npc[] {
  const moved: Npc[] = [];
  const seen = new Set<Id>();
  for (const n of [...everyoneAt(w, loc), ...hauntersOf(w, loc)]) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if (settle(w, n, now)) moved.push(n);
  }
  return moved;
}

/** Call it as she leaves: whoever she's looking at stays put for their usual stretch. */
export function pinAt(w: World, loc: Id, now: number): void {
  for (const n of everyoneAt(w, loc)) if (n.haunts || n.routine) n.settledAt = now;
}
