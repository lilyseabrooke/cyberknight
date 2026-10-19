import type { Item } from '../types';
import { AMMO } from './ammo';

/**
 * Components. What a workbench takes things apart into and builds them out of (see bench.ts). She carries them as plain
 * counts in `hero.parts`, the way she carries ammo: they weigh nothing and have no names of their own.
 *
 * Everything here is data: add a part, a recipe or a salvage rule and the bench uses it. Ids a saved hero mentions that
 * the tables no longer know are carried along and ignored.
 */

export interface PartDef {
  label: string;
  /** What one of them is called, when it differs ("circuit board"). */
  one?: string;
  /** What a lone one is worth to somebody who deals in them, in nd (for the status panel and for tools, not for sale). */
  value: number;
}

export const PARTS: Record<string, PartDef> = {
  scrap: { label: 'scrap metal', value: 3 },
  wiring: { label: 'wiring', value: 4 },
  circuits: { label: 'circuit boards', one: 'circuit board', value: 9 },
  servos: { label: 'servos', one: 'servo', value: 10 },
  plating: { label: 'armor plating', value: 8 },
  cells: { label: 'power cells', one: 'power cell', value: 9 },
  chem: { label: 'volatile chem', value: 6 },
};

export const PART_IDS = Object.keys(PARTS);

export type Bill = Record<string, number>;

export const partLabel = (id: string): string => PARTS[id]?.label ?? id;

/** "3 scrap metal, 1 servo" for the log. */
export function billText(b: Bill): string {
  return Object.entries(b).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${n === 1 ? PARTS[id]?.one ?? partLabel(id) : partLabel(id)}`).join(', ') || 'nothing';
}

export const partsOf = (parts: Record<string, number> | undefined, id: string): number => parts?.[id] ?? 0;
export const totalParts = (parts: Record<string, number> | undefined): number => Object.values(parts ?? {}).reduce((s, n) => s + Math.max(0, n), 0);
export const canAfford = (parts: Record<string, number> | undefined, b: Bill): boolean => Object.entries(b).every(([id, n]) => partsOf(parts, id) >= n);

// ===================================================================== taking things apart

/** Never goes on a bench: keepsakes, keys, things that come back, and anything that is not a thing. */
const KEEP = ['relic', 'key', 'cursed', 'trophy', 'collectible', 'antique', 'dragon'];
/** Consumables that are worth the chemistry. */
const CHEMICAL = ['ammo', 'paint', 'fire', 'stim'];

export function breakable(it: Item): boolean {
  if (it.carId || it.tags.some((t) => KEEP.includes(t))) return false;
  if (it.kind === 'consumable') return it.tags.some((t) => CHEMICAL.includes(t));
  return true;
}

/** Specific things that break down into something other than what their kind says. */
const SPECIAL: Record<string, Bill> = {
  scrap_metal: { scrap: 6 },
  drone_core: { circuits: 3, servos: 2, cells: 2 },
  helix_sample: { chem: 4, cells: 1 },
  memory_shard: { circuits: 3 },
  data_slate: { circuits: 3, cells: 1 },
  spare_forearm: { servos: 4, plating: 2, wiring: 2 },
  optic_lens: { circuits: 3, wiring: 1 },
  plasma_torch: { cells: 2, scrap: 3, chem: 1 },
  fake_watch: { scrap: 1 },
  cocktail_molotov: { chem: 2 },
};

/**
 * What an item comes apart into, before her hands get at it: more for a better thing, rounded down to something small.
 * Pure and deterministic; the bench scales it by how well she works (see `yieldFor` in bench.ts).
 */
export function salvageBill(it: Item): Bill {
  const special = SPECIAL[it.id];
  if (special) return { ...special };
  const n = Math.max(1, Math.min(12, Math.round(Math.sqrt(Math.max(1, it.value)) * 0.7)));
  const out: Bill = {};
  const add = (id: string, k: number): void => {
    const q = Math.round(k);
    if (q > 0) out[id] = (out[id] ?? 0) + q;
  };
  if (it.kind === 'consumable') {
    if (it.ammoType) {
      add('scrap', 1);
      add('chem', 1);
    } else {
      add('chem', 1);
    }
    return out;
  }
  if (it.kind === 'armor') {
    add('plating', n);
    add('scrap', n / 3);
    if (it.name.includes('plating') || it.power >= 6) add('circuits', 1);
    return out;
  }
  if (it.kind === 'gadget' || it.unstable) {
    add('circuits', n / 2);
    add('cells', n / 2);
    add('chem', 2);
    return out;
  }
  if (it.kind === 'weapon') {
    if (it.ammoType === 'cells') {
      add('cells', n / 2);
      add('circuits', n / 3);
      add('scrap', n / 3);
    } else if (it.ammoType) {
      add('scrap', n / 2);
      add('servos', n / 3);
      add('wiring', n / 4);
    } else {
      add('scrap', n);
      if (it.power >= 8) add('servos', n / 4);
    }
    if (it.tags.includes('gloves')) add('wiring', 1);
    return out;
  }
  // loot
  const t = it.tags;
  if (t.includes('tech') || t.includes('chrome')) {
    add('circuits', n / 2);
    add('wiring', n / 2);
    if (t.includes('chrome')) add('servos', n / 2);
  } else if (t.includes('tool')) {
    add('scrap', n / 2);
    add('wiring', n / 3);
    add('servos', n / 4);
  } else if (t.includes('jewellery')) {
    add('circuits', n / 3);
    add('scrap', 1);
  } else if (t.includes('instrument')) {
    add('wiring', n / 2);
    add('scrap', n / 2);
  } else if (t.includes('corp')) {
    add('circuits', n / 2);
    add('wiring', 1);
  } else {
    add('scrap', n / 2);
  }
  if (!Object.keys(out).length) add('scrap', 1);
  return out;
}

// ===================================================================== building

export interface Recipe {
  /** The item built. */
  item: string;
  parts: Bill;
  /** The bench it needs (1..5) and the tinkering level it takes to try. */
  tier: number;
  skill: number;
}

/** Things a bench can build from scratch. Add a row to teach it something. */
export const RECIPES: Recipe[] = [
  { item: 'cocktail_molotov', parts: { chem: 2 }, tier: 1, skill: 0 },
  { item: 'switchblade', parts: { scrap: 3 }, tier: 1, skill: 0 },
  { item: 'cleaver', parts: { scrap: 4 }, tier: 1, skill: 0 },
  { item: 'leather_jacket', parts: { plating: 2 }, tier: 1, skill: 0 },
  { item: 'zip_pistol', parts: { scrap: 4, servos: 1 }, tier: 1, skill: 1 },
  { item: 'kevlar_duster', parts: { plating: 6, wiring: 1 }, tier: 2, skill: 2 },
  { item: 'service_pistol', parts: { scrap: 5, servos: 2, wiring: 1 }, tier: 2, skill: 3 },
  { item: 'arc_gauntlet', parts: { cells: 3, circuits: 2, wiring: 2, scrap: 3 }, tier: 2, skill: 3 },
  { item: 'riot_vest', parts: { plating: 9, scrap: 3, wiring: 2 }, tier: 3, skill: 4 },
  { item: 'riot_shotgun', parts: { scrap: 8, servos: 3, wiring: 1 }, tier: 3, skill: 5 },
  { item: 'stunner_mk3', parts: { cells: 4, circuits: 4, wiring: 3 }, tier: 3, skill: 5 },
  { item: 'monowhip', parts: { wiring: 8, servos: 4, circuits: 4 }, tier: 4, skill: 6 },
  { item: 'rail_revolver', parts: { scrap: 10, servos: 5, cells: 3, circuits: 2 }, tier: 4, skill: 7 },
  { item: 'gauss_smg', parts: { circuits: 6, servos: 6, cells: 5, scrap: 4 }, tier: 5, skill: 8 },
];

/** What a box of each ammo costs to make: cheaper than the shop, if she has the parts. One box per go. */
export const AMMO_RECIPES: Record<string, Bill> = {
  slugs: { scrap: 2, chem: 1 },
  shells: { scrap: 2, chem: 2 },
  rails: { scrap: 2, servos: 1, cells: 1 },
  gauss: { scrap: 2, circuits: 1, cells: 2 },
  cells: { cells: 2, wiring: 1 },
};

for (const t of Object.keys(AMMO_RECIPES)) if (!AMMO[t]) throw new Error(`ammo recipe for unknown ammo ${t}`);

// ===================================================================== upgrading

/** The most mods a thing takes, before skill and bench: it is a tire iron, not a spaceship. */
export const BASE_MODS = 1;
export const MAX_MODS = 6;

/** What the next mod on this item costs: it gets dearer each time. */
export function upgradeBill(it: Item): Bill {
  const k = it.mods ?? 0;
  const out: Bill = {};
  if (it.kind === 'armor') {
    out.plating = 2 + 2 * k;
    out.scrap = 1 + k;
  } else if (it.ammoType === 'cells' || it.kind === 'gadget') {
    out.cells = 1 + k;
    out.circuits = 1 + k;
    out.wiring = 1;
  } else if (it.ammoType) {
    out.scrap = 2 + k;
    out.servos = 1 + Math.floor(k / 2);
    if (k >= 2) out.wiring = 1;
  } else {
    out.scrap = 2 + 2 * k;
    if (k >= 2) out.servos = 1;
  }
  return out;
}

/** An item's name without its mod count: `riot shotgun +2` -> `riot shotgun`. */
export const baseName = (name: string): string => name.replace(/ \+\d+$/, '');
