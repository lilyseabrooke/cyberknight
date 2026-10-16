import { affordancesFor, anyOf, capabilityPull, register, type Affordance, type Where } from './affordances';
import type { Candidate } from './candidate';
import type { PawnInfo, World } from './types';
import { banned, viewAt, type PawnView } from './pawnkit';
import { FEATURES, featuresIn } from './content/pawns';
import { MONEY, CRAFT } from './content/pawnafford';
import { CRIME } from './content/pawncrime';
import { SITUATIONAL, WILDS, VARIANT_ROWS } from './content/pawnevents';

register('pawn', [...MONEY, ...CRAFT, ...CRIME, ...SITUATIONAL, ...WILDS, ...VARIANT_ROWS]);

/**
 * Pawn shops, as seen from the decision loop: if she is standing in one (or one of its rooms), every row of the pawn
 * registry that fits the room, the variant, the traits, today's situation and any wild card turns into a candidate. What
 * it is *like* to be good at something is in the rows (content/pawn*.ts); what a shop *is* is in content/pawns.ts; the
 * machinery (the shelf, hock, buy back) is in pawnkit.ts.
 *
 * Key prefix by pace, so the clock and the AI treat them right: `pawn` (a session), `pawnquick` (a glance), `pawnfight`
 * (a scrap; a hurt hero is put off it) and `pawndeal` (hock, buy back, buy, sell: the shop's own business). The deals are
 * a family of their own because the AI weighs a family by its size: a menu of thirty rows would otherwise crowd out the
 * four things a pawn shop is for.
 */

const KEY = { quick: 'pawnquick', session: 'pawn', fight: 'pawnfight', deal: 'pawndeal' } as const;

/** The features in this room that a row can hang on. */
function matchingFeatures(where: Where, v: Pick<PawnView, 'features'>): string[] | null {
  if (where.feature === undefined) return [];
  const want = Array.isArray(where.feature) ? where.feature : [where.feature];
  const have = v.features.filter((f) => want.includes(f) && FEATURES[f]);
  return have.length ? have : null;
}

function fits(where: Where, v: Pick<PawnView, 'room' | 'info' | 'sit'>): boolean {
  if (!anyOf(where.room, [v.room])) return false;
  if (!anyOf(where.variant, [v.info.variant])) return false;
  if (where.trait !== undefined && !anyOf(where.trait, v.info.traits)) return false;
  if (where.situation !== undefined && !anyOf(where.situation, v.sit?.def.tags ?? [])) return false;
  if (where.wild !== undefined && !anyOf(where.wild, v.info.wild ? [v.info.wild] : [])) return false;
  return true;
}

export function pawnCandidates(w: World): Candidate[] {
  const v = viewAt(w);
  if (!v || banned(w, v.main)) return [];
  const out: Candidate[] = [];
  for (const a of affordancesFor('pawn') as Affordance<PawnView>[]) {
    if (!fits(a.where, v)) continue;
    const feats = matchingFeatures(a.where, v);
    if (feats === null) continue;
    const list: (string | undefined)[] = a.each ? feats : [undefined];
    for (const f of list) {
      if (a.ok && !a.ok(w, v, f)) continue;
      const appeal = a.appeal ? a.appeal(w, v, f) : 0;
      // A row can say "not now" by giving a very negative appeal.
      if (appeal <= -1) continue;
      const needs = [...a.needs, ...(f && a.needsFrom ? a.needsFrom(f) : [])];
      const line = a.intent?.length ? a.intent[w.beat % a.intent.length]!.replace('{shop}', v.main.name) : undefined;
      out.push({
        key: `${KEY[a.pace ?? 'session']}:${a.id}${f ? `:${f}` : ''}`,
        drives: a.drives,
        bonus: (a.bonus ?? 0) + appeal + capabilityPull(w.hero, needs),
        ...(a.risk !== undefined ? { risk: a.risk } : {}),
        ...(line ? { intent: { text: line } } : {}),
        // Look again at run time: the beat may have moved the day on, or someone may have left.
        run: (c) => {
          const now = viewAt(c.w) ?? v;
          a.run(c, now, f);
        },
      });
    }
  }
  return out;
}

export { tickPawns } from './pawnkit';

/**
 * Which rows a shop of this makeup offers, by room (ignoring what only she can decide: money, what she carries, who is
 * standing there). For tooling and tests: `npm run pawns` prints it.
 */
export function describePawn(info: PawnInfo, situation: string[] = []): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const room of ['floor', ...info.rooms]) {
    const v = { info, room, features: featuresIn(info, room), sit: situation.length ? { id: situation[0]!, def: { tags: situation } } : undefined } as unknown as PawnView;
    const ids: string[] = [];
    for (const a of affordancesFor('pawn') as Affordance<PawnView>[]) {
      if (!fits(a.where, v)) continue;
      const feats = matchingFeatures(a.where, v);
      if (feats === null) continue;
      ids.push(a.each ? `${a.id}×${feats.length}` : a.id);
    }
    out[room] = ids;
  }
  return out;
}
