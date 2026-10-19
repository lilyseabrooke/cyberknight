import type { Ctx, Location, World } from './types';
import type { GameEvent } from './events';
import { here } from './combat';
import { skillLevel } from './skills';
import { SKILLS, type SkillId } from './content/skills';

/**
 * What Neo remembers of her as a performer.
 *
 * Blackbird is rebuilt from a cached copy of herself, so to the city she never died: her fame, her fans and what she is
 * famous *for* all carry over (`legacy.fame`, `legacy.renown`, `Location.fans`). Her hands don't: skills start again
 * with every body. So a crowd comes expecting the Blackbird it remembers, and a new body mostly lets it down.
 *
 * - **Renown** is fame per performing skill ("Blackbird, the guitarist"). It sets what a crowd expects of that skill.
 * - **Fans** are counted where she won them, on the place itself, and outlive her like the place does.
 * - **Letdowns** cost fame, renown and fans, sharply: a bad set in front of people who came for a legend can empty a
 *   street of fans. A few in a row are a slump, and the first set that delivers after a slump is a comeback.
 */

/** The skill grade a crowd expects from her at this skill, from how famous she is for it. */
export const expectation = (w: World, skill: string): number => 0.8 * Math.sqrt(Math.max(0, w.legacy.renown?.[skill] ?? 0));

/** How far short of what they came for she'd fall right now (negative when she's better than her name). */
export const shortfall = (w: World, skill: string): number => expectation(w, skill) - skillLevel(w.hero, skill as SkillId);

/** Fame earned with a performing skill is also fame *for* it. */
export function addRenown(w: World, skill: string, gain: number): void {
  if (gain <= 0 || SKILLS[skill as SkillId]?.group !== 'music') return;
  const r = (w.legacy.renown ??= {});
  r[skill] = (r[skill] ?? 0) + gain;
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
function block(w: World, loc: Location): Set<string> {
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
const audience = (w: World, loc: Location): number => here(w).filter((n) => n.alive && !n.hostile).length + (loc.crowded ? 4 : 0);

/**
 * After a performing act: judge it against what the crowd came for. Called from `mindAfter` with the act's family and
 * the events it produced. Acts without a crowd's expectations (graffiti) and acts nobody watched are left alone.
 */
export function judgeSet(c: Ctx, act: string, skill: string, events: GameEvent[]): void {
  const { w, rng } = c;
  if (SKILLS[skill as SkillId]?.group !== 'music') return;
  const mine = events.filter((e) => e.type === act);
  const good = mine.some((e) => e.outcome === 'good');
  const bad = !good && mine.some((e) => e.outcome === 'bad');
  if (!good && !bad) return;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = audience(w, loc);
  if (!crowd) return;
  const gap = shortfall(w, skill);
  const slumps = (w.legacy.slump ??= {});
  const slump = (slumps[skill] ??= { sets: 0, lost: 0 });
  const label = SKILLS[skill as SkillId]?.label ?? skill;

  if (good) {
    const won = 1 + Math.floor(crowd / 2);
    if (gap > 2) {
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
  if (gap <= 1) return;
  const share = Math.min(1, gap / 5);
  const lost = Math.min(h.fame, 0.08 * h.fame * share + gap);
  h.fame -= lost;
  const r = w.legacy.renown!;
  r[skill] = Math.max(0, (r[skill] ?? 0) * (1 - 0.1 * share) - gap);
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
