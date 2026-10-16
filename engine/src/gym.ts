import { affordancesFor, anyOf, capabilityPull, type Affordance, type Where } from './affordances';
import type { Candidate } from './candidate';
import type { GymInfo, World } from './types';
import { banned, viewAt, type GymView } from './gymkit';
import { FEATURES, featuresIn } from './content/gyms';
// The rows register themselves.
import './content/gymafford';
import './content/gymcrime';
import './content/gymevents';

/**
 * Gyms, as seen from the decision loop: if she is standing in one (or one of its rooms), every row of the gym's
 * affordance registry that fits the room, the variant, the traits, today's situation and any wild card turns into a
 * candidate. What it is *like* to be good at something is in the rows (content/gym*.ts); what a gym *is* is in
 * content/gyms.ts; the machinery is in gymkit.ts.
 *
 * Key prefix by pace, so the clock and the AI treat them right: `gym` (a session), `gymquick` (a glance), `gymfight`
 * (a scrap; a hurt hero is put off it).
 */

const KEY = { quick: 'gymquick', session: 'gym', fight: 'gymfight' } as const;

/** The features in this room that a row can hang on. */
function matchingFeatures(where: Where, v: GymView): string[] | null {
  if (where.feature === undefined) return [];
  const want = Array.isArray(where.feature) ? where.feature : [where.feature];
  const have = v.features.filter((f) => want.includes(f) && FEATURES[f]);
  return have.length ? have : null;
}

function fits(where: Where, v: GymView): boolean {
  if (!anyOf(where.room, [v.room])) return false;
  if (!anyOf(where.variant, [v.info.variant])) return false;
  if (where.trait !== undefined && !anyOf(where.trait, v.info.traits)) return false;
  if (where.situation !== undefined && !anyOf(where.situation, v.sit?.def.tags ?? [])) return false;
  if (where.wild !== undefined && !anyOf(where.wild, v.info.wild ? [v.info.wild] : [])) return false;
  return true;
}

export function gymCandidates(w: World): Candidate[] {
  const v = viewAt(w);
  if (!v || banned(w, v.main)) return [];
  const out: Candidate[] = [];
  for (const a of affordancesFor('gym') as Affordance<GymView>[]) {
    if (!fits(a.where, v)) continue;
    const feats = matchingFeatures(a.where, v);
    if (feats === null) continue;
    const list: (string | undefined)[] = a.each ? feats : [undefined];
    for (const f of list) {
      if (a.ok && !a.ok(w, v, f)) continue;
      const needs = [...a.needs, ...(f && a.needsFrom ? a.needsFrom(f) : [])];
      const line = a.intent?.length ? a.intent[w.beat % a.intent.length]!.replace('{gym}', v.main.name) : undefined;
      out.push({
        key: `${KEY[a.pace ?? 'session']}:${a.id}${f ? `:${f}` : ''}`,
        drives: a.drives,
        bonus: (a.bonus ?? 0) + capabilityPull(w.hero, needs),
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

export { tickGyms } from './gymkit';

/**
 * Which rows a gym of this makeup offers, by room (ignoring what only she can decide: money, health, who is standing
 * there). For tooling and tests: `npm run gyms` prints it.
 */
export function describeGym(info: GymInfo, situation: string[] = []): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const room of ['floor', ...info.rooms]) {
    const v = { info, room, features: featuresIn(info, room), sit: situation.length ? { id: situation[0]!, def: { tags: situation } } : undefined } as unknown as GymView;
    const ids: string[] = [];
    for (const a of affordancesFor('gym') as Affordance<GymView>[]) {
      if (!fits(a.where, v)) continue;
      const feats = matchingFeatures(a.where, v);
      if (feats === null) continue;
      ids.push(a.each ? `${a.id}×${feats.length}` : a.id);
    }
    out[room] = ids;
  }
  return out;
}
