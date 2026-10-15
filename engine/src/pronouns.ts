import type { Gender } from './types';

/**
 * Pronouns for the people in the text. The engine attaches a person's gender to an event
 * (`npc_g`, `victim_g`...), and templates write `{they}`, `{their}`, `{is}` and so on; they're
 * filled in when the line is rendered, for the person the token names (`{their:victim}`; the
 * default is `npc`).
 *
 * When a gender isn't known (a group, a bare event in a test, a name that isn't a person) the
 * singular "they" is used, with plural verbs.
 */

type Set = { they: string; them: string; their: string; theirs: string; themself: string; singular: boolean; none?: boolean };

const SETS: Record<Gender, Set> = {
  woman: { they: 'she', them: 'her', their: 'her', theirs: 'hers', themself: 'herself', singular: true },
  man: { they: 'he', them: 'him', their: 'his', theirs: 'his', themself: 'himself', singular: true },
  nonbinary: { they: 'they', them: 'them', their: 'their', theirs: 'theirs', themself: 'themself', singular: false },
  none: { they: 'it', them: 'it', their: 'its', theirs: 'its', themself: 'itself', singular: true, none: true },
};
const UNKNOWN = SETS.nonbinary;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The tokens a template may use, and what each stands for. */
export const PRONOUN_TOKENS = new Set(['they', 'them', 'their', 'theirs', 'themself', 'They', 'Them', 'Their', 'Theirs', 'Themself', 's', 'es', 'is', 'has', 'was', 'does', 'doesnt']);

export function pronounToken(token: string, gender: string | number | boolean | undefined): string | undefined {
  if (!PRONOUN_TOKENS.has(token)) return undefined;
  const set = (typeof gender === 'string' && SETS[gender as Gender]) || UNKNOWN;
  const lower = token.charAt(0).toLowerCase() + token.slice(1);
  switch (lower) {
    case 'they': case 'them': case 'their': case 'theirs': case 'themself': {
      const word = set[lower];
      return token.charAt(0) === token.charAt(0).toUpperCase() ? cap(word) : word;
    }
    case 's': return set.singular ? 's' : '';
    case 'es': return set.singular ? 'es' : '';
    case 'is': return set.singular ? 'is' : 'are';
    case 'has': return set.singular ? 'has' : 'have';
    case 'was': return set.singular ? 'was' : 'were';
    case 'does': return set.singular ? 'does' : 'do';
    case 'doesnt': return set.singular ? "doesn't" : "don't";
  }
  return undefined;
}

/** The pronoun set for a gender, for code that wants to build a sentence itself. */
export const pronounsFor = (g: Gender | undefined): Set => (g && SETS[g]) || UNKNOWN;
