import type { Hero, InstrumentFx, Item, WeaponFx } from './types';
import type { Rng } from './rng';

/**
 * Procedural instruments, rolled the way weapons are (weapons.ts): a class, a tier, and traits. The traits are the point:
 * each one opens a door that a plain guitar doesn't.
 *
 * | trait     | does |
 * |---|---|
 * | tone      | levels on the skill it's played with |
 * | volume    | bigger crowds, more fame and fans per set; loud enough to draw people out of a building (`draw_out`) |
 * | signature | a famous player's name on it: crowds give her the benefit of the doubt |
 * | jacked    | plugs into city systems: a hijacked billboard plays her set to the street |
 * | hardened  | survives being swung at someone: it's a weapon too |
 * | resonance | finds a robot's (or a dragon's) frequency: a damage bonus when swung, and more later |
 * | feedback  | a held note that floors people: stun when swung |
 *
 * Everything is plain data on `Item.inst`. A hardened instrument is also a weapon (`Item.fx`), so the fight code wields
 * it like any other club. The classic guitars that predate this get defaults from `instOf`.
 */

export type InstTrait = 'tone' | 'volume' | 'signature' | 'jacked' | 'hardened' | 'resonance' | 'feedback';
const TRAITS: InstTrait[] = ['tone', 'volume', 'signature', 'jacked', 'hardened', 'resonance', 'feedback'];

export interface InstClass {
  id: string;
  nouns: string[];
  /** The skills it's played with. */
  skills: string[];
  likes: Partial<Record<InstTrait, number>>;
  /** Classes that are a weapon first: always hardened, and what they hit like. */
  weapon?: { cls: 'club' | 'blade'; power: number };
  /** Extra trait rolls (two necks, two of everything). */
  extra?: number;
}

export const INST_CLASSES: Record<string, InstClass> = {
  acoustic: { id: 'acoustic', nouns: ['acoustic guitar', 'steel-string', 'parlour guitar', 'dreadnought'], skills: ['guitar'], likes: { tone: 3, signature: 1 } },
  electric: { id: 'electric', nouns: ['electric guitar', 'solid-body', 'semi-hollow', 'six-string'], skills: ['guitar'], likes: { volume: 3, feedback: 2, jacked: 2, tone: 1 } },
  bass: { id: 'bass', nouns: ['bass guitar', 'four-string bass', 'fretless bass'], skills: ['guitar'], likes: { volume: 2, hardened: 2, resonance: 2 } },
  twelve_string: { id: 'twelve_string', nouns: ['twelve-string', 'twelve-string acoustic'], skills: ['guitar'], likes: { tone: 3, signature: 2 } },
  double_neck: { id: 'double_neck', nouns: ['double-neck guitar', 'two-necked guitar'], skills: ['guitar'], likes: { tone: 2, volume: 2, feedback: 1, hardened: 1 }, extra: 1 },
  keytar: { id: 'keytar', nouns: ['keytar', 'shoulder synth'], skills: ['guitar', 'djing'], likes: { jacked: 3, volume: 1, tone: 1 } },
  flying_v: { id: 'flying_v', nouns: ['flying-V', 'arrowhead guitar', 'star-body guitar'], skills: ['guitar'], likes: { hardened: 3, feedback: 2, volume: 1 }, weapon: { cls: 'club', power: 2 } },
  cigar_box: { id: 'cigar_box', nouns: ['cigar-box guitar', 'tin-can guitar', 'scrap guitar'], skills: ['guitar'], likes: { resonance: 2, tone: 1, hardened: 1 } },
  chainsaw: { id: 'chainsaw', nouns: ['chainsaw guitar'], skills: ['guitar'], likes: { volume: 3, feedback: 1 }, weapon: { cls: 'blade', power: 6 } },
};
const CLASS_IDS = Object.keys(INST_CLASSES);
/** How often each class turns up. */
const CLASS_WEIGHT: Record<string, number> = { acoustic: 4, electric: 4, bass: 2, twelve_string: 1.5, double_neck: 0.6, keytar: 1, flying_v: 1, cigar_box: 1.5, chainsaw: 0.3 };

const ADJ: Record<InstTrait, string[]> = {
  tone: ['sweet-toned', 'warm', 'bell-clear', 'honeyed'],
  volume: ['loud', 'wall-shaking', 'neighbour-hating', 'overdriven'],
  signature: ['signed', 'famous', 'storied', 'tour-worn'],
  jacked: ['wired', 'jacked', 'networked', 'patch-bay'],
  hardened: ['armoured', 'steel-necked', 'riot-proof', 'reinforced'],
  resonance: ['humming', 'resonant', 'tuning-fork', 'singing'],
  feedback: ['screaming', 'howling', 'feedback-loving', 'ear-splitting'],
};

const blank = (cls: string, tier: number): InstrumentFx => ({ cls, tier, tone: 0, volume: 0, signature: 0, jacked: 0, hardened: 0, resonance: 0, feedback: 0 });

/** Roll an instrument. `tier` is how good it is for its price, about 0..9; pawn shop tiers and Muse's gifts pick it. */
export function genInstrument(rng: Rng, tier: number, clsId?: string): Item {
  const cls = INST_CLASSES[clsId ?? rng.weighted(CLASS_IDS, (k) => CLASS_WEIGHT[k] ?? 1)]!;
  const inst = blank(cls.id, Math.max(0, tier));
  inst.tone = Math.round(inst.tier * 0.4);
  if (cls.weapon) inst.hardened = 1;
  const rolls = 1 + Math.floor(inst.tier / 3) + (cls.extra ?? 0);
  for (let i = 0; i < rolls; i++) {
    const t = rng.weighted(TRAITS, (k) => 1 + (cls.likes[k] ?? 0));
    inst[t] = Math.min(3, inst[t] + 1);
  }
  if (inst.resonance) inst.resonates = rng.chance(0.3) ? 'dragon' : 'robot';
  const top = TRAITS.filter((k) => k !== 'tone' || inst.tone > 1).sort((a, b) => inst[b] - inst[a])[0]!;
  const name = `${inst[top] ? `${rng.pick(ADJ[top])} ` : ''}${rng.pick(cls.nouns)}`;
  const traits = TRAITS.reduce((n, k) => n + inst[k], 0);
  const item: Item = {
    id: `in_${rng.int(0, 1073741823).toString(36)}`, name, kind: 'loot', power: 0,
    value: Math.round(40 + inst.tier * 45 + traits * 30), tags: ['instrument', 'guitar'], inst,
  };
  return armed(item);
}

/** A hardened instrument is a weapon too: give it a weapon's numbers. */
export function armed(item: Item): Item {
  const inst = item.inst;
  if (!inst?.hardened) return item;
  const cls = INST_CLASSES[inst.cls];
  const fx: WeaponFx = {
    cls: cls?.weapon?.cls ?? 'club', tier: inst.tier, crit: 0.05, critMult: 2, pierce: 0, noise: 0.9, armor: 0,
    vs: inst.resonance && inst.resonates ? { [inst.resonates]: 1 + 0.3 * inst.resonance } : {},
    stun: 0.06 * inst.feedback, burn: 0, weight: 3,
  };
  return { ...item, kind: 'weapon', power: Math.round(3 + inst.tier * 1.2 + (cls?.weapon?.power ?? 0) + inst.hardened), fx, tags: [...new Set([...item.tags, 'melee'])] };
}

/** The classic guitars from before instruments were rolled, read as instruments. Other classics (a horn, a drum pad) aren't guitars. */
const CLASSICS: Record<string, InstrumentFx> = {
  vintage_guitar: { ...blank('electric', 3), tone: 2, signature: 1 },
  relic_guitar: { ...blank('acoustic', 5), tone: 2, signature: 3 },
  ukulele: { ...blank('acoustic', 0) },
};

/** The instrument side of an item, if it has one. */
export const instOf = (it: Item | null | undefined): InstrumentFx | undefined => (it ? it.inst ?? CLASSICS[it.id] : undefined);

/** Every instrument she has: carried, or in her hands. */
export const instrumentsOf = (h: Hero): Item[] => [...h.inventory, ...(h.weapon ? [h.weapon] : [])].filter((i) => i.tags.includes('instrument'));

export const hasInstrument = (h: Hero): boolean => instrumentsOf(h).length > 0;

/** The best she has of one trait among the instruments played with this skill. */
export function bestTrait(h: Hero, skill: string, trait: InstTrait): number {
  let best = 0;
  for (const it of instrumentsOf(h)) {
    const inst = instOf(it);
    if (inst && INST_CLASSES[inst.cls]?.skills.includes(skill)) best = Math.max(best, inst[trait]);
  }
  return best;
}

/** Levels her instrument adds to a skill. Cheap enough for skillValue: she carries a handful of things. */
export function instrumentBonus(h: Hero, skill: string): number {
  if (skill !== 'guitar' && skill !== 'djing') return 0;
  // Tone, plus a level for every three lines of the guitar's story (provenance.ts), on whichever guitar gives the most.
  let best = 0;
  for (const it of instrumentsOf(h)) {
    const inst = instOf(it);
    if (inst && INST_CLASSES[inst.cls]?.skills.includes(skill)) best = Math.max(best, inst.tone + Math.min(3, Math.floor((inst.story?.length ?? 0) / 3)));
  }
  return best;
}

/**
 * How much a guitar would add over what she plays now, by the traits she'd gain, scaled by how much of a guitarist she
 * is. 0 for no gain; about 1 for a real step up to a serious player.
 */
export function instrumentUsefulness(h: Hero, item: Item, guitarLevel: number): number {
  const inst = instOf(item);
  if (!inst) return item.tags.includes('case') && hasInstrument(h) && !h.inventory.some((i) => i.tags.includes('case')) ? 0.2 : 0;
  const skill = INST_CLASSES[inst.cls]?.skills[0] ?? 'guitar';
  let gain = 0;
  for (const [t, wt] of [['tone', 0.35], ['volume', 0.25], ['signature', 0.2], ['jacked', 0.15], ['hardened', 0.1], ['resonance', 0.1], ['feedback', 0.1]] as const) {
    gain += wt * Math.max(0, inst[t] - bestTrait(h, skill, t));
  }
  if (!hasInstrument(h)) gain += 0.3;
  return gain * Math.min(1.5, 0.3 + guitarLevel / 15);
}
