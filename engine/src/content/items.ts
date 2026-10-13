import type { Item, ItemKind } from '../types';

type Def = Omit<Item, 'id'>;
const w = (name: string, power: number, value: number, tags: string[] = []): Def => ({ name, kind: 'weapon', power, value, tags });
const a = (name: string, power: number, value: number): Def => ({ name, kind: 'armor', power, value, tags: [] });
const l = (name: string, value: number, tags: string[] = []): Def => ({ name, kind: 'loot', power: 0, value, tags });
const c = (name: string, power: number, value: number, tags: string[] = []): Def => ({ name, kind: 'consumable', power, value, tags });

export const ITEMS: Record<string, Def> = {
  // ---- weapons ----
  excalibur: w('"Excalibur" (a tire iron)', 4, 3),
  broken_bottle: w('broken bottle', 3, 1),
  pool_cue: w('pool cue', 4, 5),
  cleaver: w('kitchen cleaver', 6, 15),
  judgment: w('baseball bat named "Judgment"', 8, 40),
  switchblade: w('chrome switchblade', 5, 20),
  zip_pistol: w('zip pistol', 7, 35),
  arc_gauntlet: w('arc gauntlet', 9, 80),
  service_pistol: w('NPD service pistol', 9, 60),
  stunner_mk3: w('Stunner Mk.III', 12, 150),
  monowhip: w('monofilament whip', 14, 260),
  riot_shotgun: w('NPD riot shotgun', 17, 220),
  rail_revolver: w('rail revolver', 18, 400),
  gauss_smg: w('gauss SMG', 20, 520),
  thermal_katana: w('thermal katana', 22, 700),
  pulse_rifle: w('Helix pulse rifle', 26, 900),
  hiccup: {
    name: 'Singularity Hiccup (experimental, do not point at anything you like)',
    kind: 'gadget',
    power: 45,
    value: 5000,
    unstable: true,
    tags: ['experimental'],
  },
  // ---- armor ----
  leather_jacket: a('pleather jacket', 1, 20),
  kevlar_duster: a('kevlar duster', 3, 150),
  riot_vest: a('NPD riot vest', 5, 260),
  corp_plate: a('Helix subdermal plating', 7, 800),
  artemis_plate: a('Artemis wing plating', 6, 500),
  champ_vest: a('NEON KNIGHTS championship vest (blinks)', 2, 40),
  // ---- loot ----
  credchip: l('dented credchip', 30),
  memory_shard: l('black-market memory shard', 80),
  walkman: l('pre-Fall walkman (works!)', 45),
  gold_tooth: l('gold tooth (not hers)', 25),
  fake_id: l('counterfeit Atlas ID', 60),
  eyeballs: l('jar of suspicious eyeballs', 15),
  neural_gum: l('neural chewing gum', 10),
  mom_photo: l("holo-photo of someone's mother", 5),
  corp_creds: l('Atlas executive credentials', 350, ['corp']),
  helix_sample: l('vial of glowing Helix sample', 200, ['corp']),
  dragon_scale: l('Artemis scale (still warm)', 250, ['dragon']),
  vipers_patch: l('Chrome Vipers colors', 20, ['gang']),
  // ---- consumables ----
  medkit: c('field medkit', 45, 60),
  stim: c('combat stim', 6, 40),
  noodles: c('mystery-meat noodle bowl', 12, 5),
  dish_good: c('a plated noodle special (it is, shockingly, good)', 30, 40, ['dish']),
  cocktail_molotov: c('Molotov Mule (the cocktail, mostly)', 18, 25, ['throwable', 'fire']),
  vintage_guitar: l('vintage guitar (previous owner: a band)', 400, ['instrument']),
};

export function makeItem(id: string): Item {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item ${id}`);
  return { id, ...d, tags: [...d.tags] };
}

export function isKind(i: Item, k: ItemKind): boolean {
  return i.kind === k;
}

/** Weapon style tags drive the combat skills; throwables can be flung in fights. */
const STYLE: Record<string, string[]> = {
  zip_pistol: ['gun'], service_pistol: ['gun'], stunner_mk3: ['gun'], riot_shotgun: ['gun'], rail_revolver: ['gun'],
  gauss_smg: ['gun'], pulse_rifle: ['gun'], hiccup: ['gun'],
  excalibur: ['melee'], broken_bottle: ['melee', 'throwable'], pool_cue: ['melee', 'throwable', 'cue'], cleaver: ['melee', 'throwable'],
  judgment: ['melee'], switchblade: ['melee', 'throwable'], arc_gauntlet: ['melee'], monowhip: ['melee'], thermal_katana: ['melee'],
};
for (const [id, tags] of Object.entries(STYLE)) ITEMS[id]!.tags.push(...tags);
