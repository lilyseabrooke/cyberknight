import { AMMO_IDS } from './ammo';
import { STIM_IDS } from './stims';
import { ITEMS } from './items';

/** What the two new shops on Strand Street carry. Prices are item value x markup unless noted. */
export const MED_PACK_PRICE = 55;
export const DOC_FEE: [number, number] = [20, 32];
export const GEAR_MARKUP = 1.8;

export const PHARMACY_STIMS = STIM_IDS;
export const SHOP_WEAPONS = ['arc_gauntlet', 'zip_pistol', 'stunner_mk3', 'riot_shotgun', 'rail_revolver', 'thermal_katana', 'gauss_smg'];
export const SHOP_ARMOR = ['leather_jacket', 'kevlar_duster', 'riot_vest'];
export const SHOP_AMMO = AMMO_IDS;

export const gearPrice = (id: string): number => Math.round(ITEMS[id]!.value * GEAR_MARKUP);
