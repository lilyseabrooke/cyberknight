import type { Ctx, Location, World } from './types';
import type { GameEvent } from './events';
import { here } from './combat';
import { skillLevel } from './skills';
import { SKILLS, type SkillId } from './content/skills';
import { MIN_PER_DAY } from './clock';
import { bestTrait } from './instruments';

/**
 * What Neo remembers of her as a performer.
 *
 * Blackbird is rebuilt from a cached copy of herself, so to the city she never died: her fame, her fans and what she is
 * famous *for* all carry over (`legacy.fame`, `legacy.renown`, `Location.fans`). Her hands don't: skills start again
 * with every body. So a crowd comes expecting the Blackbird it remembers, and a new body mostly lets it down.
 *
 * - **Renown** is fame per performing skill ("Blackbird, the guitarist"): how much of a name she has for it.
 * - **Repute** is the skill grade Neo has seen her perform at. It is what a crowd expects of her, on the skill's own
 *   0-100 scale, so a body with fresh hands is measured against the one that came before.
 * - **Fans** are counted where she won them, on the place itself, and outlive her like the place does.
 * - **Letdowns** cost fame, renown and fans, sharply: a bad set in front of people who came for a legend can empty a
 *   street of fans. A few in a row are a slump, and the first set that delivers after a slump is a comeback.
 */

/**
 * How far along she is from "nobody here knows her" (0) to "everybody here knows her" (1), for a perk of fame that
 * starts at `from` and is all hers at `to`. A night's work is 5 to 15 fame, so the perks take real work (or many lives).
 */
export const famed = (fame: number, from: number, to: number): number => Math.max(0, Math.min(1, (fame - from) / (to - from)));

/** Fame halves in this many in-game days if she does nothing to keep it up. Renown for a skill fades with it. */
export const FAME_HALF_LIFE_DAYS = 20;

/** Let the clock wear her fame down: Neo forgets, slowly. Runs off the in-game clock, so the days between nights count too. */
export function fadeFame(w: World): void {
  const at = w.legacy.fameAt ?? w.clock;
  w.legacy.fameAt = w.clock;
  const dt = w.clock - at;
  if (dt <= 0) return;
  const k = 0.5 ** (dt / (FAME_HALF_LIFE_DAYS * MIN_PER_DAY));
  w.hero.fame *= k;
  for (const s of Object.keys(w.legacy.renown ?? {})) w.legacy.renown![s]! *= k;
  for (const s of Object.keys(w.legacy.repute ?? {})) w.legacy.repute![s]! *= k;
}

/**
 * The skill grade a crowd expects from her at this skill (0-100, the same scale as the skill): the level Neo has seen
 * her play at. It rises as she plays well in front of people (see `addRenown`), and fades as people forget.
 */
export const expectation = (w: World, skill: string): number => w.legacy.repute?.[skill] ?? 0;

/** How far short of what they came for she'd fall right now (negative when she's better than her name). */
export const shortfall = (w: World, skill: string): number => expectation(w, skill) - skillLevel(w.hero, skill as SkillId);

/**
 * Fame earned with a performing skill is also fame *for* it, and it shows Neo how good she is: what a crowd expects
 * creeps towards the level she just played at, faster for a bigger moment. A good set below her reputation doesn't
 * lower it (that's what letdowns and time are for).
 */
export function addRenown(w: World, skill: string, gain: number): void {
  if (gain <= 0 || SKILLS[skill as SkillId]?.group !== 'music') return;
  const r = (w.legacy.renown ??= {});
  r[skill] = (r[skill] ?? 0) + gain;
  const rep = (w.legacy.repute ??= {});
  const seen = skillLevel(w.hero, skill as SkillId);
  const was = rep[skill] ?? 0;
  if (seen > was) rep[skill] = was + (seen - was) * (gain / (gain + 6));
}

/** Her street: the street a place is on, or the place itself when it isn't on one. */
export function streetOf(w: World, loc: Location): Location {
  if (loc.kind === 'street') return loc;
  const parent = loc.gen ? w.locations[loc.gen.parent] : undefined;
  if (parent?.kind === 'street') return parent;
  for (const e of loc.exits) {
    const to = w.locations[e.to];
    if (to?.kind === 'street') return to;
  }
  return parent ?? loc;
}

/** The street and its neighbours, for word that travels a block or two. */
export function block(w: World, loc: Location): Set<string> {
  const street = streetOf(w, loc);
  const out = new Set<string>([street.id]);
  for (const e of street.exits) if (w.locations[e.to]?.kind === 'street') out.add(e.to);
  return out;
}

/** Every fan she has in the places that pass the test. */
export function fansWhere(w: World, test: (loc: Location) => boolean): number {
  let n = 0;
  for (const loc of Object.values(w.locations)) if (loc.fans && test(loc)) n += loc.fans;
  return Math.round(n);
}

export const totalFans = (w: World): number => fansWhere(w, () => true);

/** How many people saw it: whoever's in the room, and a crowd if the place draws one. */
export const audience = (w: World, loc: Location): number => here(w).filter((n) => n.alive && !n.hostile).length + (loc.crowded ? 4 : 0);

/**
 * After a performing act: judge it against what the crowd came for. Called from `mindAfter` with the act's family and
 * the events it produced. Acts without a crowd's expectations (graffiti) and acts nobody watched are left alone.
 */
export function judgeSet(c: Ctx, act: string, skill: string, events: GameEvent[]): void {
  const { w, rng } = c;
  if (SKILLS[skill as SkillId]?.group !== 'music') return;
  const mine = events.filter((e) => e.type === act);
  const good = mine.some((e) => e.outcome === 'good');
  // A scandal (caught miming, studio.ts) is its own punishment, not a flop on top.
  const bad = !good && mine.some((e) => e.outcome === 'bad' && !e.data.scandal);
  // Miming to a tape: the crowd judges the tape's grade, not her hands.
  const mimed = mine.find((e) => typeof e.data.mimed === 'number')?.data.mimed as number | undefined;
  if (!good && !bad) return;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = audience(w, loc) + (audience(w, loc) ? 2 * bestTrait(h, skill, 'volume') : 0);
  if (!crowd) return;
  // A famous player's guitar buys her the benefit of the doubt.
  const gap = (mimed !== undefined ? expectation(w, skill) - mimed : shortfall(w, skill)) - 3 * bestTrait(h, skill, 'signature');
  const slumps = (w.legacy.slump ??= {});
  const slump = (slumps[skill] ??= { sets: 0, lost: 0 });
  const label = SKILLS[skill as SkillId]?.label ?? skill;

  if (good) {
    const won = 1 + Math.floor(crowd / 2);
    if (gap > 4) {
      // Fine, for someone else. Not for Blackbird.
      loc.fans = (loc.fans ?? 0) + Math.ceil(won / 2);
      if (rng.chance(0.35)) c.emit('letdown', 'mixed', { variant: 'underwhelm', skill: label, place: loc.name, expected: Math.round(expectation(w, skill)) });
      return;
    }
    loc.fans = (loc.fans ?? 0) + won;
    if (slump.sets >= 2) {
      const back = Math.round(slump.lost * 0.5 * 10) / 10;
      h.fame += back;
      addRenown(w, skill, back);
      loc.fans += won * 2;
      c.emit('comeback', 'good', { skill: label, place: loc.name, sets: slump.sets, fame: back });
    }
    slumps[skill] = { sets: 0, lost: 0 };
    return;
  }

  // A flop only disappoints people who expected something.
  if (gap <= 2) return;
  const share = Math.min(1, gap / 15);
  const lost = Math.min(h.fame, 0.1 * h.fame * share + gap * 0.5);
  h.fame -= lost;
  const r = (w.legacy.renown ??= {});
  r[skill] = Math.max(0, (r[skill] ?? 0) * (1 - 0.1 * share));
  // "She's lost it": the legend survives a bad night, mostly.
  const rep = (w.legacy.repute ??= {});
  rep[skill] = (rep[skill] ?? 0) * (1 - 0.05 * share);
  const big = crowd >= 8 || loc.kind === 'club';
  let gone = 0;
  const near = block(w, loc);
  for (const other of Object.values(w.locations)) {
    if (!other.fans) continue;
    const keep = other.id === loc.id ? 0.4 : big && near.has(streetOf(w, other).id) ? 0.75 : 1;
    if (keep === 1) continue;
    gone += other.fans * (1 - keep);
    other.fans *= keep;
    if (other.fans < 0.5) delete other.fans;
  }
  slump.sets++;
  slump.lost += lost;
  c.emit('letdown', 'bad', { variant: big ? 'big' : 'small', skill: label, place: loc.name, fame: Math.round(lost * 10) / 10, fans: Math.round(gone), expected: Math.round(expectation(w, skill)), sets: slump.sets });
}
