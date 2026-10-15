import { Rng } from './rng';
import { clamp } from './candidate';
import type { Trait } from './personality';
import type { Character, Npc, World } from './types';

/**
 * What somebody is like, as a person. Blackbird's own personality is a vector of 24 traits; an
 * NPC gets the ten that matter to how they treat her, drawn from the same names so the same
 * words mean the same things: the scale is 0..1 and 0.5 is unremarkable.
 *
 * A character is a pure function of who the person is (world seed, id, name, job), so it can be
 * worked out whenever it's wanted and always comes out the same. It's only stored on the person
 * once they matter (deepen.ts), which keeps the thousands of bystanders light.
 */

export const NPC_TRAITS: readonly Trait[] = ['temper', 'courage', 'kindness', 'greed', 'honesty', 'loyalty', 'grudge', 'sociable', 'curiosity', 'mischief'];

/** What a job tends to make of a person. Shifts, not scores: everyone still varies. */
const BIAS: Record<string, Partial<Record<Trait, number>>> = {
  barkeep: { courage: 0.25, loyalty: 0.2, sociable: 0.2, temper: 0.1 },
  bartender: { sociable: 0.3, kindness: 0.1, curiosity: 0.15 },
  hacker: { curiosity: 0.3, mischief: 0.2, sociable: -0.2, honesty: -0.15 },
  bouncer: { temper: 0.15, courage: 0.25, kindness: -0.1, loyalty: 0.2 },
  ganger: { temper: 0.2, courage: 0.1, loyalty: 0.2, kindness: -0.15, honesty: -0.2, grudge: 0.15 },
  mugger: { temper: 0.15, kindness: -0.25, honesty: -0.3, greed: 0.2 },
  dealer: { greed: 0.25, honesty: -0.25, sociable: 0.15, courage: -0.15 },
  corpo: { greed: 0.2, courage: -0.1, honesty: -0.1, kindness: -0.1 },
  heir: { greed: 0.1, courage: -0.15, kindness: -0.1, mischief: 0.15 },
  cop: { courage: 0.15, temper: 0.1, honesty: -0.05, grudge: 0.1 },
  npd_officer: { courage: 0.15, loyalty: 0.15, kindness: -0.05 },
  fixer: { greed: 0.3, honesty: -0.2, loyalty: -0.1, courage: 0.1, sociable: 0.1, curiosity: 0.1 },
  doc: { kindness: 0.1, greed: 0.15, curiosity: 0.2, honesty: -0.05 },
  prophet: { sociable: 0.3, curiosity: 0.25, courage: -0.1, temper: -0.1 },
  cook: { temper: 0.1, loyalty: 0.15, courage: 0.1 },
  patron: { sociable: 0.15, mischief: 0.1 },
  noodler: { sociable: 0.15, kindness: 0.1 },
  dj: { sociable: 0.15, mischief: 0.1, curiosity: 0.1 },
  dancer: { sociable: 0.2, courage: 0.05 },
  scientist: { curiosity: 0.3, courage: -0.15, honesty: 0.1 },
  street_kid: { mischief: 0.25, courage: 0.05, greed: 0.1, loyalty: 0.15 },
  shopkeeper: { greed: 0.15, honesty: 0.05, loyalty: 0.05 },
  gunsmith: { courage: 0.15, greed: 0.1, sociable: -0.05 },
  pharmacist: { kindness: 0.05, honesty: 0.1, courage: -0.05 },
  paint_clerk: { sociable: 0.1, mischief: 0.15, courage: 0.05 },
  damsel: { courage: 0.05, kindness: 0.1 },
};

/** Little habits the text can lean on. Pronoun tokens are filled in when the line is rendered. */
export const QUIRKS = [
  'hums advertising jingles under {their} breath',
  'never quite makes eye contact',
  "calls everyone 'chief'",
  'taps out a rhythm on every surface within reach',
  'laughs at {their} own jokes a beat early',
  'answers questions with questions',
  'is always eating something',
  'quotes old Atlas ads, unironically',
  'counts the exits whenever {they} {is} in a room',
  'touches wood after every second sentence',
  'apologises before saying anything at all',
  'keeps one hand near {their} pocket',
  'speaks very quietly, then very suddenly loudly',
  'squints at things as if they owe {them} money',
  "can't stop fixing other people's collars",
  'whistles when nervous, which is often',
];

/** Their character, worked out from who they are. Cheap, and always the same answer. */
export function computeCharacter(worldSeed: string, n: Npc): Character {
  const rng = new Rng(`char:${worldSeed}:${n.id}:${n.name}`);
  const bias = BIAS[n.archetype] ?? {};
  const traits: Partial<Record<Trait, number>> = {};
  for (const t of NPC_TRAITS) {
    // Three dice averaged: most people are middling, some are not.
    const base = (rng.next() + rng.next() + rng.next()) / 3;
    traits[t] = Math.round(clamp(base + (bias[t] ?? 0), 0.02, 0.98) * 100) / 100;
  }
  return { traits, quirk: rng.pick(QUIRKS) };
}

/** What they're like. Uses the stored character if they've one, else works it out without storing it. */
export const characterOf = (w: Pick<World, 'worldSeed'>, n: Npc): Character => n.character ?? computeCharacter(w.worldSeed, n);

/** One trait, 0..1, 0.5 being unremarkable. */
export const traitOf = (w: Pick<World, 'worldSeed'>, n: Npc, t: Trait): number => characterOf(w, n).traits[t] ?? 0.5;

/** How much nerve they have when it kicks off. */
export const nerve = (w: Pick<World, 'worldSeed'>, n: Npc): number => traitOf(w, n, 'courage');
