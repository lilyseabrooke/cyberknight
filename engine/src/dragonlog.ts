import type { Ctx, DragonRecord, Flight, Npc, World } from './types';
import { temperOf } from './dragonmodels';

/**
 * The dragons Blackbird has seen. When one turns up she is told who it is, and it goes in the book, so that a later dragon
 * of the same model is now and then that one again: same callsign, same temper. It changes nothing about how any of them
 * behave. It is only so the dragons feel like they are out there between nights, and she can know them when she sees them.
 */

/** The most dragons the book keeps; the ones seen longest ago go first. */
const KEEP = 60;
/** How likely a new dragon is, when there is one she has seen of its model that could be it, to be that one. */
const RETURNING = 0.4;

export const logOf = (w: World): DragonRecord[] => (w.legacy.dragonLog ??= []);

const leader = (w: World, f: Flight): Npc | undefined => w.npcs[f.ids[0]!];

/**
 * She has seen this flight. Put its leader in the book. Returns what the book said about it before (so she can know it
 * again), or null if she hadn't seen it.
 */
export function logSighting(w: World, f: Flight): DragonRecord | null {
  const npc = leader(w, f);
  if (!npc) return null;
  const log = logOf(w);
  const run = w.legacy.runs;
  const place = w.locations[f.locationId]?.name;
  const rec = log.find((r) => r.name === npc.name);
  if (rec) {
    const before = { ...rec };
    rec.seen++;
    rec.last = run;
    if (place) rec.place = place;
    // newest last
    log.splice(log.indexOf(rec), 1);
    log.push(rec);
    return before;
  }
  log.push({ name: npc.name, model: f.model ?? f.kind, temper: { ...temperOf(f) }, seen: 1, first: run, last: run, fought: 0, ...(place ? { place } : {}) });
  while (log.length > KEEP) log.shift();
  return null;
}

/** A dragon she has seen of this model, that might be the one flying in now. Null if it's somebody new. */
export function pickKnown(c: Ctx, model: string): DragonRecord | null {
  const { w, rng } = c;
  const about = new Set(w.flights.map((f) => leader(w, f)?.name));
  const could = logOf(w).filter((r) => r.model === model && !r.killed && !about.has(r.name));
  if (!could.length || !rng.chance(RETURNING)) return null;
  return rng.pick(could);
}

/** She has fought this one. */
export function noteFought(w: World, foes: Npc[]): void {
  for (const n of foes) {
    const rec = logOf(w).find((r) => r.name === n.name);
    if (rec) rec.fought++;
  }
}

/** She has killed this one. */
export function markKilled(w: World, npc: Npc): void {
  const rec = logOf(w).find((r) => r.name === npc.name);
  if (rec) rec.killed = true;
}
