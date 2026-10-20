import { affordancesFor, anyOf, capabilityPull, register, type Affordance, type Where } from './affordances';
import type { Candidate } from './candidate';
import type { HallInfo, World } from './types';
import { banned, viewAt, type HallView } from './hallkit';
import { FEATURES, featuresIn } from './content/halls';
import { AFFORD } from './content/hallafford';
import { CRIME } from './content/hallcrime';
import { EVENTS } from './content/hallevents';
import { INTEL } from './content/hallintel';

register('hall', [...AFFORD, ...CRIME, ...EVENTS, ...INTEL]);

/**
 * Arcades, as seen from the decision loop: if she is standing in one (or one of its rooms), every row of the hall registry
 * that fits the room, the variant, the traits, today's situation, the spider's visit and any wild card turns into a
 * candidate. What it is *like* to be good at something is in the rows (content/hall*.ts); what a hall *is* is in
 * content/halls.ts; the machinery (the cabinets, play, the audit) is in hallkit.ts.
 *
 * Key prefix by pace, so the clock and the AI treat them right: `hall` (a session), `hallquick` (a glance), `hallfight`
 * (a scrap; a hurt hero is put off it) and `halldeal` (play a cabinet, redeem tickets: the arcade's own business). The deals
 * are a family of their own because the AI weighs a family by its size: a menu of eighty rows would otherwise crowd out the
 * thing an arcade is for.
 *
 * `where.situation: 'audit'` is the spider's visit, which is not one of the day's situations but a clock-driven thing of
 * its own.
 */

const KEY = { quick: 'hallquick', session: 'hall', fight: 'hallfight', deal: 'halldeal' } as const;

/** The features in this room that a row can hang on. */
function matchingFeatures(where: Where, v: Pick<HallView, 'features'>): string[] | null {
  if (where.feature === undefined) return [];
  const want = Array.isArray(where.feature) ? where.feature : [where.feature];
  const have = v.features.filter((f) => want.includes(f) && FEATURES[f]);
  return have.length ? have : null;
}

function fits(where: Where, v: Pick<HallView, 'room' | 'info' | 'sit' | 'audit'>): boolean {
  if (!anyOf(where.room, [v.room])) return false;
  if (!anyOf(where.variant, [v.info.variant])) return false;
  if (where.trait !== undefined && !anyOf(where.trait, v.info.traits)) return false;
  if (where.situation !== undefined && !anyOf(where.situation, [...(v.sit?.def.tags ?? []), ...(v.audit ? ['audit'] : [])])) return false;
  if (where.wild !== undefined && !anyOf(where.wild, v.info.wild ? [v.info.wild] : [])) return false;
  return true;
}

export function hallCandidates(w: World): Candidate[] {
  const v = viewAt(w);
  if (!v || banned(w, v.main)) return [];
  const out: Candidate[] = [];
  for (const a of affordancesFor('hall') as Affordance<HallView>[]) {
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
      const line = a.intent?.length ? a.intent[w.beat % a.intent.length]!.replace('{hall}', v.main.name) : undefined;
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

export { tickHalls } from './hallkit';

/**
 * Which rows a hall of this makeup offers, by room (ignoring what only she can decide: money, what she carries, who is
 * standing there). For tooling and tests: `npm run halls` prints it.
 */
export function describeHall(info: HallInfo, situation: string[] = [], audit = false): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const room of ['floor', ...info.rooms]) {
    const v = { info, room, features: featuresIn(info, room), sit: situation.length ? { id: situation[0]!, def: { tags: situation } } : undefined, ...(audit ? { audit: { day: 0, start: 0, end: 1 } } : {}) } as unknown as HallView;
    const ids: string[] = [];
    for (const a of affordancesFor('hall') as Affordance<HallView>[]) {
      if (!fits(a.where, v)) continue;
      const feats = matchingFeatures(a.where, v);
      if (feats === null) continue;
      ids.push(a.each ? `${a.id}×${feats.length}` : a.id);
    }
    out[room] = ids;
  }
  return out;
}
