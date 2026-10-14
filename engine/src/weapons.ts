import type { Item, Npc, WeaponFx } from './types';
import type { Rng } from './rng';

/**
 * Procedural weapons. A weapon is a class (what it is), a tier (how good it is for its price) and a handful of
 * traits rolled from a budget: spend some of the tier on crits, armor-piercing, a silencer, a bonus against drones,
 * a stun, a flame, a skill bonus, and what is left is base damage. So there is almost never a pure upgrade.
 * There is nearly always a weapon that is better for the job in front of her.
 *
 * Everything is plain data on `Item.fx` (and `Item.power` is the base damage).
 */

export interface WeaponClass {
  id: string;
  melee: boolean;
  nouns: string[];
  /** Damage this class gets for its tier. */
  powerMul: number;
  noise: number;
  weight: number;
  ammo?: { type: string; perRound: number };
  /** Skills a weapon of this class might make better. */
  skills: string[];
  /** Traits it tends to roll. */
  likes: Partial<Record<Trait, number>>;
  tags: string[];
}

export type Trait = 'crit' | 'pierce' | 'noise' | 'armor' | 'vs' | 'stun' | 'burn' | 'skill';
const TRAITS: Trait[] = ['crit', 'pierce', 'noise', 'armor', 'vs', 'stun', 'burn', 'skill'];

export const CLASSES: Record<string, WeaponClass> = {
  knife: { id: 'knife', melee: true, nouns: ['knife', 'switchblade', 'shiv', 'stiletto', 'razor'], powerMul: 0.85, noise: 0.12, weight: 0.5, skills: ['melee', 'sneak', 'sleight'], likes: { crit: 3, pierce: 2, noise: 1, skill: 1 }, tags: ['melee', 'throwable'] },
  blade: { id: 'blade', melee: true, nouns: ['sword', 'katana', 'cleaver', 'machete', 'saber'], powerMul: 1.0, noise: 0.3, weight: 2, skills: ['melee', 'athletics', 'intimidation'], likes: { crit: 2, armor: 2, burn: 1, vs: 1, skill: 1 }, tags: ['melee'] },
  club: { id: 'club', melee: true, nouns: ['bat', 'pipe', 'tire iron', 'crowbar', 'cue', 'maul'], powerMul: 0.95, noise: 0.25, weight: 2.5, skills: ['melee', 'intimidation', 'athletics'], likes: { stun: 3, armor: 1, vs: 1, skill: 1 }, tags: ['melee'] },
  whip: { id: 'whip', melee: true, nouns: ['whip', 'monowire', 'chain', 'lash'], powerMul: 0.95, noise: 0.2, weight: 1, skills: ['melee', 'sleight'], likes: { pierce: 3, crit: 2, vs: 1, skill: 1 }, tags: ['melee'] },
  gauntlet: { id: 'gauntlet', melee: true, nouns: ['gauntlet', 'knuckles', 'fist', 'brace'], powerMul: 1.0, noise: 0.4, weight: 1.5, skills: ['melee', 'intimidation', 'tinkering'], likes: { stun: 3, burn: 1, armor: 2, skill: 1 }, tags: ['melee'] },
  pistol: { id: 'pistol', melee: false, nouns: ['pistol', 'revolver', 'sidearm', 'handgun'], powerMul: 0.95, noise: 0.7, weight: 1, ammo: { type: 'slugs', perRound: 2 }, skills: ['marksmanship', 'sneak', 'throwing'], likes: { noise: 3, crit: 2, pierce: 1, skill: 1 }, tags: ['gun'] },
  smg: { id: 'smg', melee: false, nouns: ['SMG', 'machine pistol', 'burst gun', 'carbine'], powerMul: 1.05, noise: 0.85, weight: 2.5, ammo: { type: 'gauss', perRound: 4 }, skills: ['marksmanship', 'athletics'], likes: { pierce: 2, vs: 1, burn: 1, skill: 1 }, tags: ['gun'] },
  shotgun: { id: 'shotgun', melee: false, nouns: ['shotgun', 'scattergun', 'breacher', 'sawn-off'], powerMul: 1.15, noise: 1.0, weight: 3.5, ammo: { type: 'shells', perRound: 1 }, skills: ['marksmanship', 'intimidation'], likes: { stun: 2, vs: 2, burn: 1, skill: 1 }, tags: ['gun'] },
  rifle: { id: 'rifle', melee: false, nouns: ['rifle', 'railgun', 'long gun', 'marksman rifle'], powerMul: 1.2, noise: 0.8, weight: 4, ammo: { type: 'rails', perRound: 1 }, skills: ['marksmanship', 'sneak'], likes: { pierce: 3, crit: 3, noise: 1, vs: 1, skill: 1 }, tags: ['gun'] },
  energy: { id: 'energy', melee: false, nouns: ['arc pistol', 'pulse gun', 'plasma sidearm', 'beam rifle', 'stunner'], powerMul: 1.0, noise: 0.5, weight: 1.5, ammo: { type: 'cells', perRound: 2 }, skills: ['marksmanship', 'tinkering'], likes: { stun: 3, burn: 3, vs: 2, skill: 1 }, tags: ['gun'] },
};
const CLASS_IDS = Object.keys(CLASSES);

/** What kinds of enemy a weapon can be good against, and how a weapon with that edge is described. */
export const VS_TAGS: Record<string, string> = {
  robot: 'drone-breaker', cop: 'badge-breaker', ganger: 'gang-buster', dragon: 'wyrm-bane', corp: 'suit-splitter', augmented: 'chrome-cutter', boss: 'giant-killer',
};

const ADJ: Record<Trait, string[]> = {
  crit: ['razor', 'keen', 'lucky', 'precision', 'serrated'],
  pierce: ['needle', 'piercing', 'tungsten', 'armor-biting'],
  noise: ['silenced', 'muffled', 'whisper-quiet', 'suppressed'],
  armor: ['guarded', 'parrying', 'shielded', 'plated'],
  vs: [],
  stun: ['shock', 'taser-tipped', 'concussive', 'ringing'],
  burn: ['thermal', 'incendiary', 'napalm', 'smoldering'],
  skill: [],
};
const SKILL_ADJ: Record<string, string> = {
  melee: "duelist's", marksmanship: "sharpshooter's", sneak: 'shadow', athletics: "sprinter's", intimidation: 'menacing', throwing: 'balanced', tinkering: 'overclocked', sleight: 'nimble',
};
const NICK = ['Whisper', 'Dutch', 'Mercy', 'Last Call', 'Bad Idea', 'Sunday', 'Receipt', 'Static', 'Lullaby', 'Ex', 'Notice', 'Second Opinion', 'Hiccup', 'Pearl'];

// ===================================================================== reading a weapon

const guessCls = (it: Item): string => {
  if (it.tags.includes('gun')) return it.ammoType === 'shells' ? 'shotgun' : it.ammoType === 'gauss' ? 'smg' : it.ammoType === 'rails' ? 'rifle' : it.ammoType === 'cells' ? 'energy' : 'pistol';
  return 'blade';
};

/** The traits of any weapon, including the named classics that never had any. */
export function fxOf(it: Item): WeaponFx {
  if (it.fx) return it.fx;
  const cls = guessCls(it);
  return { cls, tier: Math.max(0, (it.power - 3) / 2.6), crit: 0.05, critMult: 2, pierce: 0, noise: CLASSES[cls]!.noise, armor: 0, vs: {}, stun: 0, burn: 0, weight: CLASSES[cls]!.weight };
}

/** Tags and archetype of a target, for matching `vs`. */
const tagsOf = (n: Npc): string[] => [...n.tags, n.archetype];

export function vsMult(fx: WeaponFx, foe: Npc | undefined): number {
  if (!foe) return 1;
  let m = 1;
  for (const t of tagsOf(foe)) if (fx.vs[t] && fx.vs[t]! > m) m = fx.vs[t]!;
  return m;
}

/** Plating on a target: what its armor items soak up per hit. */
export const foeArmor = (n: Npc): number => n.loadout.filter((i) => i.kind === 'armor').reduce((a, i) => Math.max(a, i.power), 0);

/**
 * How good it is, in the same units as base damage. Without a target the situational bits count for a little;
 * against a particular foe they count in full.
 */
export function rating(it: Item, foe?: Npc): number {
  const fx = fxOf(it);
  const p = it.power;
  let mul = 1 + fx.crit * (fx.critMult - 1);
  const vsBest = Math.max(1, ...Object.values(fx.vs));
  mul *= foe ? vsMult(fx, foe) : 1 + (vsBest - 1) * 0.3;
  let add = 0;
  add += foe ? Math.min(fx.pierce, foeArmor(foe) * 0.5) * 0.9 + fx.pierce * 0.1 : fx.pierce * 0.5;
  add += fx.armor * 0.7;
  add += fx.stun * 6 + fx.burn * 4;
  add += (fx.skill?.bonus ?? 0) * 0.5;
  add += 1.5 * (0.5 - fx.noise);
  return p * mul + add;
}

/** Her damage, scaled for what the weapon does besides hit. Multiply a base estimate by this. */
export const edge = (it: Item, foe?: Npc): number => rating(it, foe) / Math.max(1, it.power);

// ===================================================================== making one

const baseRating = (tier: number): number => 3 + 2.6 * tier;
export const valueOf = (r: number): number => Math.max(1, Math.round(0.3 * Math.pow(r, 2.5)));

interface Opts {
  cls?: string;
  tier: number;
  /** Make sure it has this trait. */
  focus?: Trait;
  /** and, for vs, against what. */
  vs?: string;
  /** How many traits (default depends on tier). */
  traits?: number;
}

export function genWeapon(rng: Rng, o: Opts): Item {
  const cls = CLASSES[o.cls ?? rng.weighted(CLASS_IDS, (c) => (CLASSES[c]!.melee ? 1.0 : 1.0))]!;
  const tier = Math.max(0, o.tier);
  const R = baseRating(tier) * cls.powerMul * (0.93 + rng.next() * 0.17);
  const fx: WeaponFx = { cls: cls.id, tier, crit: 0.05, critMult: 2, pierce: 0, noise: cls.noise, armor: 0, vs: {}, stun: 0, burn: 0, weight: Math.round(cls.weight * (0.8 + rng.next() * 0.5) * 10) / 10 };

  const k = o.traits ?? (tier < 1.5 ? rng.int(0, 1) : tier < 4 ? rng.int(1, 2) : rng.int(1, 3));
  const chosen: Trait[] = [];
  if (o.focus) chosen.push(o.focus);
  while (chosen.length < k) {
    const t = rng.weighted(TRAITS.filter((x) => !chosen.includes(x)), (x) => 1 + (cls.likes[x] ?? 0));
    chosen.push(t);
  }
  const strength = (t: number) => Math.min(1, 0.2 + 0.06 * t + 0.6 * rng.next());
  for (const t of chosen) {
    const m = strength(tier);
    switch (t) {
      case 'crit': fx.crit = Math.round((0.08 + m * 0.22) * 100) / 100; fx.critMult = Math.round((1.7 + m * 1.1) * 10) / 10; break;
      case 'pierce': fx.pierce = Math.max(1, Math.round(m * (1 + tier * 0.45))); break;
      case 'noise': fx.noise = Math.max(0.03, Math.round((cls.noise - 0.15 - m * 0.4) * 100) / 100); break;
      case 'armor': fx.armor = Math.max(1, Math.round(m * (1 + tier * 0.3))); break;
      case 'vs': {
        const tag = o.vs ?? rng.pick(Object.keys(VS_TAGS));
        fx.vs[tag] = Math.round((1.25 + m * 0.45) * 100) / 100;
        break;
      }
      case 'stun': fx.stun = Math.round((0.07 + m * 0.2) * 100) / 100; break;
      case 'burn': fx.burn = Math.round((0.07 + m * 0.2) * 100) / 100; break;
      case 'skill': fx.skill = { id: rng.pick(cls.skills), bonus: Math.max(1, Math.round(m * 3)) }; break;
    }
  }
  // What the traits cost is taken off the base damage.
  const probe: Item = { id: '', name: '', kind: 'weapon', power: 1, value: 0, tags: [], fx };
  const unit = rating(probe); // rating of a power-1 weapon: mul + add
  const add = unit - (1 + fx.crit * (fx.critMult - 1)) * (1 + (Math.max(1, ...Object.values(fx.vs)) - 1) * 0.3);
  const mul = unit - add;
  const power = Math.max(R * 0.45, (R - add) / mul);
  const item: Item = {
    id: `wp_${rng.int(0, 1073741823).toString(36)}`,
    name: '',
    kind: 'weapon',
    power: Math.round(power * 10) / 10,
    value: 0,
    tags: [...cls.tags],
    fx,
  };
  if (cls.ammo) {
    item.ammoType = cls.ammo.type;
    item.perRound = cls.ammo.perRound;
  }
  item.value = valueOf(rating(item));
  item.name = nameOf(rng, cls, fx, chosen, tier);
  return item;
}

function nameOf(rng: Rng, cls: WeaponClass, fx: WeaponFx, traits: Trait[], tier: number): string {
  const noun = rng.pick(cls.nouns);
  // The trait she'd notice first.
  const rank: Trait[] = ['vs', 'burn', 'stun', 'noise', 'pierce', 'crit', 'armor', 'skill'];
  const lead = rank.find((t) => traits.includes(t));
  let adj = '';
  if (lead === 'vs') adj = VS_TAGS[Object.keys(fx.vs)[0]!] ?? '';
  else if (lead === 'skill') adj = SKILL_ADJ[fx.skill!.id] ?? '';
  else if (lead) adj = rng.pick(ADJ[lead]);
  else adj = tier < 1.5 ? rng.pick(['battered', 'second-hand', 'rusty', 'homemade']) : rng.pick(['standard-issue', 'plain', 'workmanlike', 'off-the-shelf']);
  const nick = tier >= 5 && rng.chance(0.4) ? ` "${rng.pick(NICK)}"` : '';
  return `${adj} ${noun}${nick}`;
}

/** What a named classic is, so a variant of it can be rolled for the same job. */
const TEMPLATE_CLASS: Record<string, string> = {
  switchblade: 'knife', broken_bottle: 'knife', pool_cue: 'club', excalibur: 'club', judgment: 'club', cleaver: 'blade', thermal_katana: 'blade', monowhip: 'whip', arc_gauntlet: 'gauntlet',
  zip_pistol: 'pistol', service_pistol: 'pistol', stunner_mk3: 'energy', riot_shotgun: 'shotgun', rail_revolver: 'rifle', gauss_smg: 'smg', pulse_rifle: 'energy',
};

/** Most of what people carry is its own thing; some of it is the classic. */
export function variantOf(rng: Rng, template: Item): Item {
  if (!template.id || template.kind !== 'weapon' || template.unstable || rng.chance(0.25)) return template;
  const cls = TEMPLATE_CLASS[template.id] ?? guessCls(template);
  const tier = Math.max(0.2, (template.power - 3) / 2.6 + (rng.next() - 0.5) * 1.2);
  return genWeapon(rng, { cls, tier });
}

// ===================================================================== for sale

/** A shelf for the night: a spread of tiers, nothing identical. */
export function genShelf(rng: Rng, hero: Item, n = 8): Item[] {
  const tiers = [0.6, 1.2, 1.9, 2.6, 3.4, 4.3, 5.4, 6.6].slice(0, n);
  const out = tiers.map((t) => genWeapon(rng, { tier: t + (rng.next() - 0.5) * 0.5 }));
  out.push(...niches(rng, hero, 2));
  return out;
}

/**
 * Things worth buying even if she has a decent weapon already: a step up, and a sidegrade at about the same
 * tier with a trait hers lacks (aimed at one kind of enemy when she has one in mind).
 */
export function niches(rng: Rng, cur: Item, n: number, vs?: string): Item[] {
  const fx = fxOf(cur);
  const out: Item[] = [];
  // A step up: keep rolling a little higher until it really is one.
  const have = rating(cur);
  let step = genWeapon(rng, { tier: fx.tier + 0.7 + rng.next() * 0.9 });
  for (let bump = 0.4; rating(step) < have + 0.5 && bump < 4; bump += 0.5) step = genWeapon(rng, { tier: fx.tier + 0.7 + bump + rng.next() * 0.6 });
  out.push(step);
  if (n > 1) {
    const lacks = TRAITS.filter((t) => !(t === 'crit' ? fx.crit > 0.12 : t === 'pierce' ? fx.pierce > 0 : t === 'noise' ? fx.noise < 0.3 : t === 'armor' ? fx.armor > 0 : t === 'vs' ? Object.keys(fx.vs).length > 0 : t === 'stun' ? fx.stun > 0 : t === 'burn' ? fx.burn > 0 : !!fx.skill));
    const focus = vs ? 'vs' : rng.pick(lacks.length ? lacks : TRAITS);
    out.push(genWeapon(rng, { tier: fx.tier + (rng.next() - 0.3) * 0.8, focus, vs, cls: CLASSES[fx.cls]?.melee === false && rng.chance(0.6) ? fx.cls : undefined }));
  }
  return out;
}

/** What it costs on the shelf. */
export const shelfPrice = (it: Item, markup = 1.8): number => Math.round(it.value * markup);

/** A short line of what a weapon does, for logs and the status panel. */
export function describe(it: Item): string {
  const fx = fxOf(it);
  const bits: string[] = [`${it.power} dmg`];
  if (fx.crit > 0.1) bits.push(`${Math.round(fx.crit * 100)}% crit x${fx.critMult}`);
  if (fx.pierce) bits.push(`pierce ${fx.pierce}`);
  if (fx.noise < 0.3) bits.push('quiet');
  else if (fx.noise > 0.85) bits.push('loud');
  if (fx.armor) bits.push(`+${fx.armor} armor`);
  for (const [t, m] of Object.entries(fx.vs)) bits.push(`x${m} vs ${t}`);
  if (fx.stun) bits.push(`${Math.round(fx.stun * 100)}% stun`);
  if (fx.burn) bits.push(`${Math.round(fx.burn * 100)}% burn`);
  if (fx.skill) bits.push(`+${fx.skill.bonus} ${fx.skill.id}`);
  return bits.join(', ');
}

/** The best rating among everything she can swing or fire, against a particular foe if there is one. */
export function armBest(hero: { weapon: Item; inventory: Item[] }, foe?: Npc): number {
  let best = rating(hero.weapon, foe);
  for (const it of hero.inventory) if (it.kind === 'weapon' || it.kind === 'gadget') best = Math.max(best, rating(it, foe));
  return best;
}
