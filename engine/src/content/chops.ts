import type { Rng } from '../rng';
import type { ChopInfo, District, Location } from '../types';
import type { SlotDef } from '../roster';

/**
 * Chop shops: a small, plain kind of place. A door, someone minding it, and a workbench behind it where Blackbird can
 * take things apart and put them back together (see bench.ts). It is rolled from a few independent axes (a shell, a
 * bench tier, a door, up to two traits) so no two are quite alike, but there are no rooms, no shelves and no schedule of
 * situations. The way in is the interesting part: pay the day rate, or do it another way (chop.ts).
 *
 * Every table is open. Ids a saved world mentions that the tables no longer know are ignored.
 */

const pick = <T>(rng: Rng, xs: readonly T[]): T => rng.pick(xs as T[]);

/** Chance a street has a chop shop. About one street in twelve; rolled on a stream of its own (see mapgen). */
export const CHOP_CHANCE: Record<District, number> = { market: 0.05, nightlife: 0.03, tenement: 0.09, industrial: 0.14, corporate: 0.01, slum: 0.11 };

export interface ShellDef {
  /** "in {label}" */
  label: string;
  line: string;
  weight?: number;
}

export const SHELLS: Record<string, ShellDef> = {
  tram: { label: 'a gutted tram carriage', line: 'The workshop is a gutted tram carriage with the seats ripped out and the destination board still saying DEPOT.' },
  carpark: { label: 'the ground floor of a car park', line: 'The ground floor of a multi-storey car park, three bays taken over, with a ramp for cars that only ever arrive.' },
  container: { label: 'a shipping container', line: 'A shipping container with both doors welded open and a bench running the whole length of it.', weight: 1.3 },
  carwash: { label: 'an old car wash', line: 'An old car wash. The brushes are gone and the bay is a workshop. Somebody has kept the sign that says PLEASE REMAIN IN VEHICLE.' },
  busgarage: { label: 'a bus garage', line: 'A bus garage with an inspection pit, a hoist that works some of the time and a lot of seats.' },
  scrapyard: { label: 'the back of a scrapyard', line: 'The back of a scrapyard. The bench is under a corrugated roof and everything within reach is for sale by weight.', weight: 1.4 },
  drivein: { label: 'a drive-in projection hut', line: 'The projection hut of a drive-in that closed before she was born. The bench is where the projector was.' },
  underpass: { label: 'an underpass bay', line: 'A bay under a flyover with a pump running in the corner. It floods on Thursdays. They work around it.' },
  depot: { label: 'a former Atlas depot', line: 'A former Atlas depot, bought at auction. The logo is still on the wall and nobody has the paint to cover it.' },
};

/** What the bench is, by tier. */
export const BENCHES: Record<number, string> = {
  1: 'A vice, a hammer, a coffee tin of screws and a great deal of optimism.',
  2: 'A steel bench, a drill press and a rack of tools hung by outline.',
  3: 'A proper bench: lamp, soldering station, a parts wall with drawers that open.',
  4: 'Two benches, a fume hood, a lathe and a calibration rig that has been calibrated.',
  5: 'A full machine shop. The lathe has a name. The lamp costs more than her armor.',
};

export interface TraitDef {
  line: string;
  /** Multiplies the day rate. */
  fee?: number;
  /** Adds to the security of the place. */
  sec?: number;
  weight?: number;
}

export const TRAITS: Record<string, TraitDef> = {
  no_questions: { line: 'A sign by the door: NO QUESTIONS, NO RECEIPTS, NO REFUNDS. Someone has added, in pen, NO.', fee: 1.4, weight: 1.4 },
  half_price: { line: 'A card in the window says HALF PRICE BEFORE NOON. The door has never opened before noon.', fee: 0.6 },
  atlas_parts: { line: 'Half the stock is stamped with the Atlas logo. Some of it was theirs, once.', sec: 1 },
  mascot: { line: 'A three-legged dog called Torque lies across the doorway and is not asked to move.', fee: 1 },
  streamer: { line: 'A camera on a tripod broadcasts the bench to four hundred strangers who comment on the soldering.', sec: 1, fee: 1.2 },
  loud_radio: { line: 'A radio on a single station, turned up past the point of being music.' },
  hot_cars: { line: 'Two cars in the bay are half the colour they were this morning and none of the numbers match.', sec: 1 },
  tool_wall: { line: 'A wall of tools, each in its own painted outline, and one outline with nothing in it and a name.', fee: 1.1 },
  cctv: { line: 'A camera over the door, pointed at the door, with a sticker that says SMILE.', sec: 2, fee: 1.1 },
  night_shift: { line: 'Open all night. The sign says so in letters of three different sizes.' },
  apprentice: { line: 'An apprentice sits on an upturned bucket, watching everything with the hunger of someone owed three months.' },
  kettle: { line: 'A kettle that is always on. Tea is free. Nothing else is.' },
};

export const DOORS: Record<string, { label: string }> = {
  guard: { label: 'guard' },
  bot: { label: 'door bot' },
};

// ===================================================================== names

const NAMES = [
  'Sprocket & Spare', 'Second Opinion Autobody', 'Loose Screws', 'Parts Unknown', 'Cut-Rate Chrome', 'Bolt From The Blue',
  'Dismantle & Co.', 'No Questions Motors', 'Spare Wheel Deal', 'Bits & Pieces (No Refunds)', 'Spare Parts Sally\'s',
  'Tin Man Tuning', 'Chop \'n\' Drop', 'Nuts, Bolts & Nothing Else', 'Take-Apart Tom\'s', 'Rust In Pieces',
  'Gear Grinders Local 9', 'Salvage Rights', 'Hot Wrench', 'Torque & Tonic', 'Odds & Axles', 'Bay 7 Disassembly',
  'The Third Hand', 'Wrench Anything Garage', 'Cannibal Motors', 'Sparky\'s Lawful Dismantling',
];

const BLURBS = [
  '{name}: a doorway with a bell, a smell of hot metal and the sound of someone being very patient with a bolt.',
  '{name}: the roller door is up a metre, which is the entire welcome. Under it, light, noise and a trolley full of other people\'s engines.',
  '{name}: a handwritten price list on the wall, crossed out and rewritten so often it has become a diary.',
  '{name}: grease, radio and a workbench where something used to be a car. There is a fee, and it is on the door.',
];

export interface RolledChop {
  info: ChopInfo;
  name: string;
  blurb: string;
  security: number;
}

/** A chop shop, whole, from its own stream and in a fixed order. Pure. */
export function rollChop(rng: Rng, district: District, depth: number): RolledChop {
  const shell = rng.weighted(Object.keys(SHELLS), (k) => SHELLS[k]!.weight ?? 1);
  // Benches are better where there is money and worse where there is not, and the odd dump has a very good one anyway.
  const bias = district === 'corporate' ? 1 : district === 'industrial' ? 0.4 : district === 'slum' ? -0.4 : 0;
  const tier = Math.max(1, Math.min(5, Math.round(rng.int(1, 5) * 0.6 + rng.int(1, 5) * 0.4 + bias + (depth >= 6 ? 0.5 : 0))));
  const door: ChopInfo['door'] = rng.chance(0.28 + (district === 'corporate' ? 0.3 : 0)) ? 'bot' : 'guard';
  const ids = Object.keys(TRAITS);
  const n = rng.weighted([0, 1, 2], (i) => [3, 4, 1.5][i]!);
  const traits: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = rng.weighted(ids, (k) => (traits.includes(k) ? 0 : TRAITS[k]!.weight ?? 1));
    if (!traits.includes(t)) traits.push(t);
  }
  const mult = traits.reduce((m, t) => m * (TRAITS[t]!.fee ?? 1), 1);
  const fee = Math.max(5, Math.round((10 + 8 * tier + rng.int(0, 7)) * mult));
  const name = pick(rng, NAMES);
  const security = 2 + (door === 'bot' ? 1 : 0) + traits.reduce((s, t) => s + (TRAITS[t]!.sec ?? 0), 0) + rng.int(0, 1);
  const extras = [SHELLS[shell]!.line, ...traits.map((t) => TRAITS[t]!.line)];
  const blurb = [pick(rng, BLURBS), pick(rng, extras), BENCHES[tier]!].join(' ');
  return { info: { shell, tier, fee, door, traits }, name, blurb, security };
}

export const feeOf = (info: ChopInfo): number => info.fee;

// ===================================================================== people

export function chopRoster(_loc: Location, info: ChopInfo): SlotDef[] {
  const slots: SlotDef[] = [
    { role: 'chop_mechanic', count: [1, 1], chance: 0.9, faction: 'venue', resident: true },
    info.door === 'bot' ? { role: 'chop_bot', count: [1, 1], faction: 'venue', resident: true } : { role: 'chop_guard', count: [1, 1], faction: 'venue', resident: true },
    { role: 'chop_regular', count: [0, info.traits.includes('night_shift') ? 3 : 2], ephemeral: true },
  ];
  if (info.traits.includes('apprentice')) slots.push({ role: 'street_kid', count: [1, 1], faction: 'venue', resident: true });
  if (info.traits.includes('hot_cars')) slots.push({ role: 'ganger', count: [1, 2], chance: 0.8, faction: 'influence' });
  else slots.push({ role: 'ganger', count: [1, 1], chance: 0.12, faction: 'influence' });
  return slots;
}
