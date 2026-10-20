/**
 * What a companion posted at one of her homes can be doing there (see crew.ts). Data only.
 *
 * Rates are per world hour at level 1, for a companion she hasn't neglected; level makes them better. A job needs one of
 * the abilities it lists (none listed means anybody can). Work piles up in the home's stash for her to collect, up to
 * `STASH_HOURS` of it, and a shift is always a little training besides.
 */

export interface JobDef {
  label: string;
  /** Abilities that qualify a companion for it; empty is anybody. */
  needs: string[];
  /** Neodollars an hour. */
  cash?: number;
  /** Parts an hour, by part id (see content/parts.ts). */
  parts?: Record<string, number>;
  /** Companion XP an hour beyond what any shift teaches. */
  xp?: number;
  /** Heals them faster than the home does anyway. */
  mends?: boolean;
}

export const JOBS: Record<string, JobDef> = {
  rest: { label: 'resting up', needs: [], mends: true },
  drill: { label: 'drilling', needs: [], xp: 1.4 },
  tips: { label: 'selling tips', needs: ['scout'], cash: 2.5 },
  scavenge: { label: 'scavenging the block', needs: ['lockpick', 'sniff', 'tank'], parts: { scrap: 0.6, wiring: 0.25, plating: 0.1 } },
  skim: { label: 'skimming accounts', needs: ['hack'], cash: 5, parts: { circuits: 0.08 } },
  lift: { label: 'working the crowd', needs: ['pickpocket'], cash: 4 },
  busk: { label: 'working the doorway', needs: ['charm', 'distract'], cash: 3 },
};

/** Hours of work a home's stash holds before the rest goes to waste. */
export const STASH_HOURS = 48;

/** Companion XP an hour that any shift teaches. */
export const SHIFT_XP = 0.35;
