import type { Id, World } from './types';
import type { Candidate } from './candidate';
import { register } from './affordances';
import { ARENA } from './content/arenas';
import { banned, rowCandidates, venueAt } from './venuekit';
import { inside } from './content/arenaafford';
import { ARENA_ROWS } from './content/arenaafford';
import { ARENA_EVENTS } from './content/arenaevents';

register('arena', [...ARENA_ROWS, ...ARENA_EVENTS]);

/**
 * Arenas, as a system. Everything an arena offers is a row, because what matters is *when*: the bill (what is on tonight) and the
 * phase of the show day are both tags on today's situation (content/arenas.ts), so a row can ask for load-in, or the encore, or a
 * LUMINA night. Getting in with the crew early (`arena_in:<id>`, for the night) opens the backstage rows later: the green room, the
 * lighting desk, the encore stage. On a dark night she can hire the whole place and headline it herself. Arenas also book her like
 * a club does (bookings.ts), and pay like an arena (stage.ts `prestige`); an open roof counts as somewhere high for the storm solo.
 */

export function arenaCandidates(w: World): Candidate[] {
  const v = venueAt(w, 'arena');
  if (!v || banned(w, v.main)) return [];
  return rowCandidates(w, v);
}

/** A pull toward an arena on a show day: the bigger she is, the more it calls; more again if she is already on the crew list. */
export function arenaUrge(w: World, to: Id): { bonus: number; smart: number } {
  const v = venueAt(w, 'arena', to);
  if (!v || w.hero.locationId === to || banned(w, v.main)) return { bonus: 0, smart: 0 };
  const show = !v.sit?.def.tags.includes('empty') ? 0.15 : 0.05;
  const fame = Math.min(0.3, ((w.legacy.fame ?? 0) + w.hero.fame) / 300);
  return { bonus: show + fame * w.hero.personality.weights.pride + (inside(w, v) ? 0.2 : 0), smart: 0 };
}

export { ARENA };
