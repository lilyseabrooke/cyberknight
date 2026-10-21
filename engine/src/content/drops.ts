/**
 * Drop points: the places in Neo where Blackbird can put money into her account. What's in the
 * account survives her. What's in her pockets doesn't, unless she walked home.
 *
 * Each is a `Feature` (kind = id) at a place; the cut is what the people running it keep, and is
 * lower with the lab's Treasury upgrades. Hand-built for now, like the rest of the district.
 */
export interface DropDef {
  /** Where it is, as a location id. */
  at: string;
  /** What the log calls it. */
  name: string;
  /** Percentage points on top of the base cut (can be negative: a friendly place). */
  cut: number;
  /** No cut at all, whatever the lab's upgrades say (the lab's own hatch). */
  free?: boolean;
}

export const DROPS: Record<string, DropDef> = {
  drop_lab: { at: 'lab_lot', name: "the lab's night-drop hatch", cut: 0, free: true },
  drop_alley: { at: 'halo_alley', name: 'a hollow brick behind the dumpster', cut: 0 },
  drop_street: { at: 'street_main', name: 'an Ironvault ATM with a cracked screen', cut: -3 },
  drop_club: { at: 'neon_pharaoh', name: 'the coat-check window (it takes more than coats)', cut: 8 },
  drop_backlot: { at: 'club_backlot', name: 'a milk crate with a false bottom', cut: -2 },
  drop_kitchen: { at: 'halo_kitchen', name: 'a loose panel under the walk-in freezer', cut: 0 },
  drop_tunnel: { at: 'club_maintenance', name: 'a lockbox bolted to a cable junction', cut: 4 },
  drop_roof: { at: 'halo_roof', name: 'a lockbox in the pigeon coop', cut: -4 },
  drop_mart: { at: 'chem_mart', name: 'the pharmacy\'s night-deposit slot', cut: 5 },
};

export const DROP_IDS = Object.keys(DROPS);
export const isDrop = (kind: string): boolean => kind in DROPS;
