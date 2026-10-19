/**
 * What comes out of Neo's water, by how good the angler is. Nothing in it is a fish worth eating: the harbour is mostly
 * runoff, and what lives there was never asked. Better anglers do not find better fish; they find better things
 * that fell in, were thrown in, or were put in on purpose by someone who meant to come back.
 */
export interface CatchTier {
  /** The event variant: how the log tells it. */
  variant: 'junk' | 'trinket' | 'haul' | 'prize' | 'legend';
  /** Her fishing level (0..100 grade scale) at which this tier opens up. */
  minLevel: number;
  /** Item ids. `ammo` is a sealed crate of ammunition (its size grows with `rounds`). */
  items: string[];
  /** Rounds in a crate of ammo from this tier. */
  rounds: [number, number];
}

export const CATCH_TIERS: CatchTier[] = [
  { variant: 'junk', minLevel: 0, items: ['sodden_boot', 'drowned_phone', 'eyeballs', 'mom_photo', 'glow_carp', 'neural_gum'], rounds: [0, 0] },
  { variant: 'trinket', minLevel: 1, items: ['scrap_metal', 'gold_tooth', 'credchip', 'walkman', 'chrome_eel', 'vipers_patch', 'snow_globe'], rounds: [0, 0] },
  { variant: 'haul', minLevel: 8, items: ['ammo', 'drone_core', 'med_pack', 'memory_shard', 'fake_id', 'lockpick_set', 'data_slate'], rounds: [12, 30] },
  { variant: 'prize', minLevel: 20, items: ['ammo', 'chrono_watch', 'signet_ring', 'pearl_string', 'spare_forearm', 'optic_lens', 'helix_sample', 'kevlar_duster'], rounds: [30, 60] },
  { variant: 'legend', minLevel: 40, items: ['ammo', 'vintage_guitar', 'relic_ring', 'relic_guitar', 'corp_creds', 'rail_revolver', 'riot_vest'], rounds: [60, 120] },
];

/** Which tier a cast lands in: `roll` is a uniform 0..1 plus a bonus for skill (see `fish` in hobbies.ts). Tiers she has not earned collapse to the best one she has. */
export function tierFor(roll: number, level: number): CatchTier {
  let i = roll < 0.55 ? 0 : roll < 0.85 ? 1 : roll < 1.05 ? 2 : roll < 1.2 ? 3 : 4;
  while (i > 0 && level < CATCH_TIERS[i]!.minLevel) i--;
  return CATCH_TIERS[i]!;
}
