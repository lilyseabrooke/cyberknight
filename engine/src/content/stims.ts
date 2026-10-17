import type { Buff } from '../types';

/**
 * Stimulants: temporary boosts to her abilities. Each is an inventory item (id below) that she
 * can buy, loot, or get from a dealer. They wear off, some crash her on the way down, and
 * stacking them is how people end up seeing colors that do not exist.
 */
export interface StimDef {
  name: string;
  /** The stat it raises, if any. */
  stat?: NonNullable<Buff['stat']>;
  amount?: number;
  /** Straight combat power while it lasts. */
  power: number;
  duration: number;
  /** Power penalty for a while after it wears off. */
  crash: number;
  price: number;
}

export const STIMS: Record<string, StimDef> = {
  stim: { name: 'combat stim', power: 6, duration: 25, crash: 0, price: 45 },
  stim_iron: { name: 'Ironclad (muscle)', stat: 'muscle', amount: 3, power: 0, duration: 30, crash: 2, price: 55 },
  stim_twitch: { name: 'Twitch (reflex)', stat: 'reflex', amount: 3, power: 0, duration: 30, crash: 2, price: 50 },
  stim_cortex: { name: 'Cortex Clear (int)', stat: 'int', amount: 3, power: 0, duration: 30, crash: 1, price: 50 },
  stim_silver: { name: 'Silver Tongue (charm)', stat: 'charm', amount: 3, power: 0, duration: 30, crash: 1, price: 40 },
};

export const STIM_IDS = Object.keys(STIMS);
export const isStim = (id: string): boolean => id in STIMS;
