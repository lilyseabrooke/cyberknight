/**
 * Somewhere to sleep, and something to eat. Data only: `rest.ts` decides where each is on offer and what it does.
 *
 * A night's sleep is always eight hours unless something interrupts it, and fills the Sleep bar whatever the bed. `quality` is
 * what the bed does to sleep debt (see needs.ts): a pod and the pavement leave stacks behind, a hostel clears some, a hotel more.
 */

export type LodgingId = 'pod' | 'hostel' | 'hotel';

export interface LodgingDef {
  id: LodgingId;
  /** The thing she checks into. */
  noun: string;
  /** Neodollars for the night, before haggling and the lab's discounts. */
  price: number;
  /** 0..1: how good a night here is; under 0.8 it adds sleep debt, over it takes some off. */
  quality: number;
  /** Chance of being robbed in her sleep over the night. */
  rob: number;
}

export const LODGING: Record<LodgingId, LodgingDef> = {
  pod: { id: 'pod', noun: 'sleep pod', price: 16, quality: 0.72, rob: 0 },
  hostel: { id: 'hostel', noun: 'hostel bunk', price: 38, quality: 0.88, rob: 0.1 },
  hotel: { id: 'hotel', noun: 'hotel room', price: 95, quality: 1, rob: 0 },
};
export const LODGING_IDS = Object.keys(LODGING) as LodgingId[];

/** Brands, so a street's pod stack is not just "a pod stack". Picked by hashing the street. */
export const LODGING_NAMES: Record<LodgingId, string[]> = {
  pod: ['Coffin Row', 'Nap-O-Matic', 'the Sleepbox Annex', 'Stackhouse 9', 'Drawer & Dream', 'the Capsule Cafe', 'Lights Out Capsules'],
  hostel: ['the Last Bunk Hostel', 'Rooftop Rest', "Mama Lin's Bunks", 'the Grey Pillow', 'Bedbug & Breakfast', 'the Traveller\'s Lie'],
  hotel: ['the Meridian Neo', 'the Hotel Perpetua', 'the Velvet Hours', 'Atlas Suites', 'the Lantern Hotel', 'the Grand Halcyon'],
};

/** Where she sleeps when nobody sells her a bed. Quality is before the lab's help. */
export const STREET_QUALITY = 0.4;
export const ROUGH_QUALITY = 0.5;
/** Passing out: a few hours, and not much to show for them. */
export const FAINT_HOURS = 3;
export const FAINT_QUALITY = 0.6;
/** A night in a police cell, per hour, against a full night's worth. */
export const CELL_QUALITY = 0.45;

export interface FoodDef {
  /** Neodollars. 0 means free or already bought. */
  price: number;
  /** Hunger put back, before the lab's help. */
  gain: number;
}

export const FOOD = {
  stall: { price: 8, gain: 34 },
  bagel: { price: 6, gain: 22 },
  plate: { price: 16, gain: 50 },
  noodles: { price: 0, gain: 30 },
  dish: { price: 0, gain: 55 },
  snack: { price: 0, gain: 12 },
  scraps: { price: 0, gain: 14 },
} satisfies Record<string, FoodDef>;
export type FoodId = keyof typeof FOOD;
