import type { Id, World } from './types';
import type { Candidate } from './candidate';
import { mimeCandidates, studioCandidates, studioUrge } from './studio';
import { cuttingCandidates, cuttingUrge } from './cutting';

/**
 * The music venues, together: everything they put on her menu, and the pull each has on her from the street outside.
 * Each kind lives in its own module (studio.ts and friends); this is where interactions.ts finds them all.
 */

export function venueCandidates(w: World): Candidate[] {
  return [...studioCandidates(w), ...mimeCandidates(w), ...cuttingCandidates(w)];
}

export function venueUrge(w: World, to: Id): { bonus: number; smart: number } {
  const parts = [studioUrge(w, to), cuttingUrge(w, to)];
  return { bonus: parts.reduce((s, p) => s + p.bonus, 0), smart: parts.reduce((s, p) => s + p.smart, 0) };
}
