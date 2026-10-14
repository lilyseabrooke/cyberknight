/**
 * Ammunition. Different guns eat different rounds, so what she carries and what she can buy
 * matters. `perRound` is what a round of shooting costs for that gun (see WEAPON_AMMO).
 */
export interface AmmoDef {
  label: string;
  /** What a single round is called in the log ("slug", "shell"). */
  unit: string;
  /** Rounds in one shop box, and what the box costs. */
  box: number;
  price: number;
}

export const AMMO: Record<string, AmmoDef> = {
  slugs: { label: 'pistol slugs', unit: 'slug', box: 24, price: 24 },
  shells: { label: 'scattergun shells', unit: 'shell', box: 8, price: 28 },
  rails: { label: 'rail darts', unit: 'dart', box: 6, price: 42 },
  gauss: { label: 'gauss pellets', unit: 'pellet', box: 40, price: 64 },
  cells: { label: 'energy cells', unit: 'cell', box: 12, price: 48 },
};

export const AMMO_IDS = Object.keys(AMMO);

/** Weapon id -> the ammo it burns and how much a round of shooting costs. Melee weapons are absent. */
export const WEAPON_AMMO: Record<string, { type: string; perRound: number }> = {
  zip_pistol: { type: 'slugs', perRound: 2 },
  service_pistol: { type: 'slugs', perRound: 2 },
  riot_shotgun: { type: 'shells', perRound: 1 },
  rail_revolver: { type: 'rails', perRound: 1 },
  gauss_smg: { type: 'gauss', perRound: 4 },
  stunner_mk3: { type: 'cells', perRound: 2 },
  pulse_rifle: { type: 'cells', perRound: 3 },
  hiccup: { type: 'cells', perRound: 6 },
};
