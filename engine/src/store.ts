import { catchUp } from './clock';
import { settleAt } from './movement';
import { UNIVERSE_VERSION, joinWorld, splitWorld, upgradeUniverse, type RunState, type Universe } from './universe';
import type { World } from './types';

/**
 * What gets saved: the universe always, and the night in progress if there is one. Everything is
 * plain JSON, so any backend will do (the game is meant to end up in Supabase); this module only
 * knows how to turn a save into text and back, and what to do when someone comes back to it.
 */
export interface Save {
  universe: Universe;
  run: RunState | null;
  /** Real time (ms since the epoch) when this was written, to work out how long they were away. */
  savedAt: number;
}

export interface SaveStore {
  load(): Promise<Save | null>;
  save(save: Save): Promise<void>;
}

/** Make a save out of a world mid-run (or `null` between runs). The result shares the world's contents. */
export function makeSave(universe: Universe, world: World | null, now: number): Save {
  if (!world) return { universe, run: null, savedAt: now };
  const { universe: u, run } = splitWorld(world);
  return { universe: u, run, savedAt: now };
}

export const serialize = (save: Save): string => JSON.stringify(save);

/** Old saves get brought forward here as the format changes. Anything it can't read is an error, not a guess. */
export function deserialize(text: string): Save {
  const raw = JSON.parse(text) as Save;
  if (!raw || typeof raw !== 'object' || !raw.universe) throw new Error('not a Cyberknight save');
  const v = raw.universe.version;
  if (v !== UNIVERSE_VERSION && v !== 1) throw new Error(`save is version ${v}; this game reads version ${UNIVERSE_VERSION}`);
  return { universe: upgradeUniverse(raw.universe), run: raw.run ?? null, savedAt: raw.savedAt ?? 0 };
}

/**
 * Pick up where a save left off. World time moves on for however long they were away (see
 * `offlineMinutes`). Nothing else is simulated: people end up where the clock puts them, and the
 * room Blackbird is standing in is brought up to date now so it doesn't look frozen.
 * Returns the world to keep playing, if there was a night in progress.
 */
export function resume(save: Save, now: number): { universe: Universe; world: World | null; awayMinutes: number } {
  const world = save.run ? joinWorld(save.universe, save.run) : null;
  const target = world ?? ({ clock: save.universe.clock } as World);
  const awayMinutes = catchUp(target, Math.max(0, now - save.savedAt));
  save.universe.clock = target.clock;
  if (world) settleAt(world, world.hero.locationId, world.clock);
  return { universe: save.universe, world, awayMinutes };
}

/** A store that keeps the text in memory. Good for tests, and a model for the real ones. */
export class MemoryStore implements SaveStore {
  private text: string | null = null;
  async load(): Promise<Save | null> {
    return this.text === null ? null : deserialize(this.text);
  }
  async save(save: Save): Promise<void> {
    this.text = serialize(save);
  }
}
