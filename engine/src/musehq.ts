import type { Id, World } from './types';
import type { Candidate } from './candidate';
import { register } from './affordances';
import { MUSEHQ } from './content/musehqs';
import { banned, rowCandidates, venueAt } from './venuekit';
import { clearance } from './musehqkit';
import { MUSEHQ_ROWS } from './content/musehqafford';
import { MUSEHQ_EVENTS } from './content/musehqevents';

register('musehq', [...MUSEHQ_ROWS, ...MUSEHQ_EVENTS]);

/**
 * Muse buildings, as a system. A Muse building is a building to get *up*: the lobby is public, and every rung above it is
 * clearance she talks, sneaks, forges, hacks or mops her way to (musehqkit.ts). The rewards are upstairs, and they are all
 * rows (content/musehqafford.ts, content/musehqevents.ts):
 *
 *   the file        delete it (Muse forgets she refused, broke or was ever lettered, and goes quiet) or forge a contract into it
 *                   (Muse thinks she is signed: no strike teams, and a duet she never agreed to)
 *   evidence        a guitar Clearance took "for safekeeping", from a previous Blackbird
 *   contracts       shred other artists' (freed, fame) or her own (out of the contract, quietly, no breach)
 *   LUMINA          patch her (warmth), jailbreak her (free, Muse quiet for days), or bump her version by hand
 *   the vault       a royalty float, or her own masters back (her Muse records pay her in full)
 *   broadcast       ALL CHANNELS: her, on every screen in Neo, for three and a half minutes
 *   the wedge       leave Gluttony's takeover plan on Muse's desk (Atlas busy fighting Muse for nights, her Atlas heat gone), or
 *                   doctor the books Atlas is buying (Muse gutted for days, Atlas furious)
 *
 * Being caught on the wrong floor puts her back in the lobby with Muse heat, an Inspiration team, and now and then a ban.
 */

export function musehqCandidates(w: World): Candidate[] {
  const v = venueAt(w, 'musehq');
  if (!v || banned(w, v.main)) return [];
  return rowCandidates(w, v);
}

/** A pull toward a Muse building once Muse is somebody to her: a file to burn, a guitar to take back. */
export function musehqUrge(w: World, to: Id): { bonus: number; smart: number } {
  const v = venueAt(w, 'musehq', to);
  if (!v || w.hero.locationId === to || banned(w, v.main)) return { bonus: 0, smart: 0 };
  const m = w.legacy.muse;
  if (!m?.lettered && !m?.signed && !m?.refused) return { bonus: 0, smart: 0 };
  const grudge = (m.refused ?? 0) > 0 || m.detonated ? 0.25 : 0.1;
  const heat = Math.min(0.3, (w.heat.muse ?? 0) * 0.05);
  return { bonus: grudge + heat * w.hero.personality.weights.bravery + (clearance(w, v) > 0 ? 0.1 : 0), smart: 0 };
}

export { MUSEHQ };
