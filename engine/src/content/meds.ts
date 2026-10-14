/**
 * Medical supplies, in tiers. Each restores a fixed amount of HP (plus a little for medicine skill)
 * and cures some injuries. Only the street doc restores her to full health outright.
 */
export interface MedDef {
  name: string;
  heal: number;
  /** Injuries cured. */
  cures: number;
  price: number;
}

export const MEDS: Record<string, MedDef> = {
  patch_kit: { name: 'patch kit', heal: 30, cures: 0, price: 25 },
  med_pack: { name: 'med pack', heal: 60, cures: 1, price: 55 },
  trauma_kit: { name: 'trauma kit', heal: 110, cures: 2, price: 100 },
};

export const MED_IDS = Object.keys(MEDS);
