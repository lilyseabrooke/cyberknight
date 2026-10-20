import type { Ctx, Hero, Item, Location, World } from './types';
import { acquire } from './combat';
import { AMMO } from './content/ammo';
import { ITEMS, makeItem } from './content/items';
import { AMMO_RECIPES, BASE_MODS, MAX_MODS, RECIPES, baseName, billText, breakable, canAfford, salvageBill, upgradeBill, type Bill, type Recipe } from './content/parts';
import { addAmmo, gunsOwned } from './arms';
import { odds, skillLevel, synergy, train } from './skills';
import { rating } from './weapons';
import { sayAs } from './placekit';

/**
 * Workbenches. Anywhere with a bench lets her use her tinkering on four jobs, all of which run on components
 * (`hero.parts`, content/parts.ts):
 *
 *   salvage   take an item apart into components (a bad pull costs a share of them)
 *   ammo      turn components into a box of rounds for a gun she carries
 *   craft     build something from a recipe the bench and her skill allow
 *   upgrade   put a mod into the weapon or armor she is using (+1 power each; the name carries the count)
 *
 * A bench is a place, not a thing she owns. Where one is and who may use it is the place's business: the chop shop
 * (chop.ts) sells a day at the bench, and some pawn shops keep a workshop room with one in it. This file knows only
 * what a bench is like to work at, and the actions themselves.
 */

export interface Bench {
  /** Which bench, for tokens. */
  name: string;
  /** 1..5. Gates the harder recipes and nudges every roll. */
  tier: number;
  /** Where it is, for the log. */
  where: string;
}

/** The bench in a pawn shop's workshop room: as good as the shop, less one. (The chop shop's is in chop.ts, because of its door.) */
export function pawnBench(w: World, loc: Location): Bench | undefined {
  if (loc.pawnRoom?.room !== 'workshop') return undefined;
  const main = w.locations[loc.pawnRoom.main];
  if (!main?.pawn || w.counters[`pawnban:${main.id}`]) return undefined;
  return { name: 'the repair bench', tier: Math.max(1, Math.min(5, main.pawn.tier - 1)), where: main.name };
}

// ===================================================================== reading her kit

export const parts = (h: Hero): Record<string, number> => (h.parts ??= {});
export const tinkerLevel = (h: Hero): number => skillLevel(h, 'tinkering');
const tinker = (h: Hero): number => synergy(h, ['tinkering', ['stat:int', 0.5]]);

export function addParts(h: Hero, b: Bill): void {
  const p = parts(h);
  for (const [id, n] of Object.entries(b)) if (n > 0) p[id] = (p[id] ?? 0) + n;
}

function spend(h: Hero, b: Bill): void {
  const p = parts(h);
  for (const [id, n] of Object.entries(b)) p[id] = Math.max(0, (p[id] ?? 0) - n);
}

/** Half of a bill, rounded down: what a bad pull gets back, or a bad build costs. */
const half = (b: Bill): Bill => Object.fromEntries(Object.entries(b).map(([id, n]) => [id, Math.floor(n / 2)]));

/** Everything in her pockets that can go on a bench. */
export const salvageable = (h: Hero): Item[] => h.inventory.filter(breakable);

const worthOf = (it: Item): number => Object.entries(salvageBill(it)).reduce((s, [id, n]) => s + n * partValue(id), 0);

/** How much she would rather break this than keep or sell it: junk is a pleasure, a good gun is a loss. */
export const salvageAppeal = (it: Item): number => (it.value <= 45 ? 0.3 : 0) + Math.min(0.5, worthOf(it) / Math.max(1, it.value)) - Math.min(0.9, it.value / 400);

/** The pockets' worth putting on a bench: what she would not rather sell. Used to decide whether a day at the bench is worth the fee. */
export const junk = (h: Hero): Item[] => salvageable(h).filter((it) => salvageAppeal(it) > 0.2);

const partValue = (id: string): number => ({ scrap: 3, wiring: 4, circuits: 9, servos: 10, plating: 8, cells: 9, chem: 6 }[id] ?? 3);

export function maxMods(h: Hero, bench: Bench): number {
  return Math.min(MAX_MODS, BASE_MODS + Math.floor(tinkerLevel(h) / 2) + (bench.tier >= 4 ? 1 : 0));
}

/** What she could usefully build here, with what she has: better gear than she wears, or a throwable she is out of. */
export function craftable(h: Hero, bench: Bench): Recipe[] {
  const lvl = tinkerLevel(h);
  return RECIPES.filter((r) => {
    if (!ITEMS[r.item] || r.tier > bench.tier || r.skill > lvl || !canAfford(h.parts, r.parts)) return false;
    const def = ITEMS[r.item]!;
    if (def.kind === 'consumable') return h.inventory.filter((i) => i.id === r.item).length < 2;
    const it = makeItem(r.item);
    if (def.kind === 'armor') return it.power > (h.armor?.power ?? 0);
    return rating(it) > rating(h.weapon) * 1.03 && !h.inventory.some((i) => i.id === r.item);
  });
}

/** Rounds a go at the ammo press makes: a full box, a little more with practice. */
export const boxRounds = (type: string, h: Hero): number => Math.round(AMMO[type]!.box * (1 + 0.03 * Math.min(8, tinkerLevel(h))));

export function upgradable(h: Hero, bench: Bench): { slot: 'weapon' | 'armor'; item: Item; bill: Bill }[] {
  const out: { slot: 'weapon' | 'armor'; item: Item; bill: Bill }[] = [];
  const cap = maxMods(h, bench);
  for (const slot of ['weapon', 'armor'] as const) {
    const item = h[slot];
    if (!item || item.id === 'fists' || (item.mods ?? 0) >= cap) continue;
    const bill = upgradeBill(item);
    if (canAfford(h.parts, bill)) out.push({ slot, item, bill });
  }
  return out;
}

export function ammoToMake(h: Hero): string[] {
  const types = new Set(gunsOwned(h).map((g) => g.ammoType!));
  return [...types].filter((t) => AMMO_RECIPES[t] && canAfford(h.parts, AMMO_RECIPES[t]!));
}

// ===================================================================== telling it

const say = (c: Ctx, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[], tok: Record<string, string | number>): void => sayAs('chop', c, id, outcome, lines, thoughts, tok);

const PULL_GOOD = [
  'Blackbird takes {item} apart on {bench} in the order it wants to be taken. {got} go in the tray.',
  '{Item} comes apart in her hands like it has been waiting to. She keeps {got}.',
  'It takes a screwdriver, a hammer and one word she does not say aloud. {Item} becomes {got}.',
];
const PULL_BAD = [
  'Blackbird takes a hammer to {item} because the screwdriver has opinions. Half of it survives: {got}.',
  '{Item} is held together by something she cannot see and does not find. She pries until it lets go. {got} come out undamaged.',
  'A spring goes. Then the other spring. She keeps what is not on the floor: {got}.',
];
const PULL_THOUGHT = [
  'I am a surgeon for things that do not have feelings. Mostly.',
  'Take it apart. Put it back, better. Skip the second part.',
  'Nobody tells you how much of everything is just screws.',
];

const AMMO_GOOD = [
  'Blackbird loads the press and counts it out: {rounds} {label}, still warm. It cost her {cost}.',
  '{rounds} {label} come off the press in a neat row. She stops pretending she is not proud of the row.',
];
const AMMO_BAD = [
  'The press jams and takes a third of the batch with it. Blackbird ends up with {rounds} {label} and a new word.',
  'Half of what comes off the press is the wrong size. She keeps {rounds} {label}, and the good half of the swearing.',
];
const AMMO_THOUGHT = ['Cheaper than the shop. Also, I made them. That is the real discount.', 'Bullets, from scratch. Basically a chef.'];

const CRAFT_GOOD = [
  'Blackbird builds {item} out of {cost}. It takes an evening and a lot of tape, and it works on the second try.',
  'Out of {cost}, one bench and a stubborn streak: {item}. It looks like it is trying to look like something.',
  'The last bolt goes in. {Item} sits on the bench, and does not fall apart when she lets go of it.',
];
const CRAFT_BAD = [
  'Blackbird builds for an evening and ends up with a pile of {cost} that is shorter than it was. Half of it is the wrong shape now.',
  'Something she soldered is on fire, in a small, thoughtful way. She puts it out. {Item} is not happening today.',
];
const CRAFT_THOUGHT = ['Homemade. Like a cardigan, but it hurts people.', 'Give me a bench and a week and I will rebuild the city. Give me an evening and I will make a pistol.'];

const MOD_GOOD = [
  'Blackbird works {item} over for an hour: a new spring, a shaved edge, a part where there was a gap. It is {name} now. Better. Mostly.',
  'She fits {cost} into {item} where the factory left gaps. It comes out as {name}, and she holds it a little more fondly.',
];
const MOD_BAD = [
  'Blackbird puts {cost} into {item} and takes the wrong thing out. It still works. It is just worse in a way she cannot name.',
  'The mod does not take. {Item} goes back together the way it was, minus part of the bill.',
];
const MOD_BITE = ['{Item} bites back when she closes it up. A flash, a smell of burnt hair, and eight points of HP gone.'];
const MOD_THOUGHT = ['Factory settings are a suggestion.', 'I improved it. I am not sure what. But it is improved.'];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const itemTok = (name: string): Record<string, string> => ({ item: `the ${name}`, Item: `The ${name}` });

// ===================================================================== the actions

/** Take an item apart. Item and parts are the bill's business; this rolls how clean it is. */
export function salvage(c: Ctx, bench: Bench, it: Item): void {
  const h = c.w.hero;
  const i = h.inventory.indexOf(it);
  if (i < 0) return;
  const bill = salvageBill(it);
  const p = odds(0.64 + 0.04 * (bench.tier - 1), 0.05, tinker(h), 0.15, 0.95);
  const win = c.rng.chance(p);
  // A good pull gets a little extra for skill; a bad one, half.
  const bonus = 1 + 0.04 * tinkerLevel(h);
  const got: Bill = win ? Object.fromEntries(Object.entries(bill).map(([id, n]) => [id, Math.max(1, Math.round(n * bonus))])) : half(bill);
  if (!Object.values(got).some((n) => n > 0)) got[Object.keys(bill)[0]!] = 1;
  h.inventory.splice(i, 1);
  addParts(h, got);
  train(c, 'tinkering', win ? 2 : 1);
  say(c, 'salvage', win ? 'good' : 'mixed', win ? PULL_GOOD : PULL_BAD, win ? PULL_THOUGHT : [], { ...itemTok(it.name), Item: cap(`the ${it.name}`), bench: bench.name, got: billText(got) });
}

export function makeAmmo(c: Ctx, bench: Bench, type: string): void {
  const h = c.w.hero;
  const bill = AMMO_RECIPES[type];
  if (!bill || !canAfford(h.parts, bill)) return;
  const win = c.rng.chance(odds(0.74 + 0.03 * (bench.tier - 1), 0.04, tinker(h), 0.2, 0.97));
  const full = boxRounds(type, h);
  const rounds = win ? full : Math.max(1, Math.round(full * 0.5));
  spend(h, bill);
  addAmmo(h, type, rounds);
  train(c, 'tinkering', 1);
  say(c, 'ammo', win ? 'good' : 'mixed', win ? AMMO_GOOD : AMMO_BAD, win ? AMMO_THOUGHT : [], { rounds, label: AMMO[type]!.label, cost: billText(bill), total: h.ammo[type] ?? rounds });
}

export function craft(c: Ctx, bench: Bench, r: Recipe): void {
  const h = c.w.hero;
  if (!canAfford(h.parts, r.parts)) return;
  const win = c.rng.chance(odds(0.62 - 0.03 * r.skill + 0.05 * (bench.tier - r.tier), 0.05, tinker(h), 0.1, 0.95));
  const cost = billText(r.parts);
  if (win) {
    spend(h, r.parts);
    const it = makeItem(r.item);
    it.tags.push('homemade');
    train(c, 'tinkering', 2 + Math.floor(r.skill / 2));
    say(c, 'craft', 'good', CRAFT_GOOD, CRAFT_THOUGHT, { ...itemTok(it.name), cost });
    acquire(c, it);
  } else {
    spend(h, half(r.parts));
    train(c, 'tinkering', 1);
    say(c, 'craft', 'bad', CRAFT_BAD, [], { ...itemTok(ITEMS[r.item]!.name), cost: billText(half(r.parts)) });
  }
}

export function upgrade(c: Ctx, bench: Bench, slot: 'weapon' | 'armor'): void {
  const h = c.w.hero;
  const it = h[slot];
  if (!it) return;
  const bill = upgradeBill(it);
  if (!canAfford(h.parts, bill)) return;
  const win = c.rng.chance(odds(0.57 + 0.04 * (bench.tier - 1) - 0.04 * (it.mods ?? 0), 0.05, tinker(h), 0.1, 0.95));
  const tok = { ...itemTok(it.name), cost: billText(bill) };
  if (win) {
    spend(h, bill);
    it.mods = (it.mods ?? 0) + 1;
    it.power += 1;
    it.value = Math.round(it.value * 1.15 + 5);
    it.name = `${baseName(it.name)} +${it.mods}`;
    train(c, 'tinkering', 2 + (it.mods ?? 0));
    say(c, 'upgrade', 'good', MOD_GOOD, MOD_THOUGHT, { ...tok, name: it.name });
  } else {
    spend(h, half(bill));
    train(c, 'tinkering', 1);
    if (it.unstable) {
      h.hp = Math.max(1, h.hp - 8);
      say(c, 'upgrade', 'bad', MOD_BITE, [], tok);
    } else {
      say(c, 'upgrade', 'bad', MOD_BAD, [], { ...tok, cost: billText(half(bill)) });
    }
  }
}
