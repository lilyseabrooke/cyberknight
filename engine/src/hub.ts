import { affordancesFor, anyOf, capabilityPull, register, type Affordance, type Need, type Where } from './affordances';
import type { Candidate } from './candidate';
import type { HubInfo, Id, SyllabusEntry, World } from './types';
import { alumna, askReferral, banned, barterFor, buyLesson, enrolModule, partsHeld, progress, sitLesson, sitTrial, stealIt, teachable, teacher, techTok, viewAt, type HubView } from './hubkit';
import { FEATURES, TECHS, ROUTES, barterParts, boardLine, featuresIn, priceNow, trialFee } from './content/hubs';
import { BENCH, CROWD, GOSSIP } from './content/hubafford';
import { CRIME } from './content/hubcrime';
import { SITUATIONAL, WILDS, VARIANT_ROWS } from './content/hubevents';

register('hub', [...BENCH, ...CROWD, ...GOSSIP, ...CRIME, ...SITUATIONAL, ...WILDS, ...VARIANT_ROWS]);

/**
 * Hacker hubs, as seen from the decision loop. If she is standing in one, two kinds of candidate come out of it:
 *
 *   the syllabus   one candidate per line she could be taught right now (a technique she does not know, by a route she can
 *                  afford). This is what a hub is *for*, so it is a family of its own (`hubdeal`) and a long menu of other
 *                  rows cannot crowd it out. The routes are in hubkit.ts.
 *   the rows       every row of the hub registry that fits the variant, the traits, today's situation and any wild card
 *                  (content/hubafford.ts, hubcrime.ts, hubevents.ts), keyed by pace so the clock and the AI treat them right:
 *                  `hub` (a session), `hubquick` (a glance), `hubfight` (a scrap) and `hubdeal`.
 */

const KEY = { quick: 'hubquick', session: 'hub', fight: 'hubfight', deal: 'hubdeal' } as const;

/** The features in this room that a row can hang on. */
function matchingFeatures(where: Where, v: Pick<HubView, 'features'>): string[] | null {
  if (where.feature === undefined) return [];
  const want = Array.isArray(where.feature) ? where.feature : [where.feature];
  const have = v.features.filter((f) => want.includes(f) && FEATURES[f]);
  return have.length ? have : null;
}

function fits(where: Where, v: Pick<HubView, 'room' | 'info' | 'sit'>): boolean {
  if (!anyOf(where.room, [v.room])) return false;
  if (!anyOf(where.variant, [v.info.variant])) return false;
  if (where.trait !== undefined && !anyOf(where.trait, v.info.traits)) return false;
  if (where.situation !== undefined && !anyOf(where.situation, v.sit?.def.tags ?? [])) return false;
  if (where.wild !== undefined && !anyOf(where.wild, v.info.wild ? [v.info.wild] : [])) return false;
  return true;
}

// ===================================================================== the syllabus

const ROUTE_NEEDS: Record<string, Need[]> = {
  cash: ['skill:tinkering', 'stat:int', 'drive:curiosity'],
  lessons: ['skill:tinkering', 'stat:int', 'drive:curiosity'],
  barter: ['skill:tinkering', 'skill:scavenging', 'stat:int'],
  trial: ['skill:tinkering', 'skill:calculate', 'stat:int', 'drive:pride'],
  steal: ['skill:sleight', 'skill:sneak', 'skill:tinkering', 'drive:greed'],
  referral: ['stat:charm', 'skill:persuasion', 'stat:int'],
  enrol: ['skill:tinkering', 'stat:int', 'drive:curiosity'],
};

const ROUTE_DRIVES: Record<string, Candidate['drives']> = {
  cash: { curiosity: 0.6, pride: 0.4, greed: -0.1 },
  lessons: { curiosity: 0.6, pride: 0.3 },
  barter: { curiosity: 0.5, greed: 0.2, pride: 0.3 },
  trial: { pride: 0.7, bravery: 0.3, curiosity: 0.4 },
  steal: { greed: 0.6, bravery: 0.3, curiosity: 0.4 },
  referral: { curiosity: 0.5, pride: 0.3 },
  enrol: { curiosity: 0.6, greed: 0.3 },
};

const RUN: Record<string, (c: Parameters<typeof buyLesson>[0], v: HubView, e: SyllabusEntry) => void> = {
  cash: buyLesson,
  lessons: sitLesson,
  barter: barterFor,
  trial: sitTrial,
  steal: stealIt,
  referral: askReferral,
  enrol: enrolModule,
};

/** Can she go for this line right now, with what she has and who is there? */
export function canTake(w: World, v: HubView, e: SyllabusEntry): boolean {
  const h = w.hero;
  if (banned(w, v.main) || !TECHS[e.tech] || !teachable(w, e) || !RUN[e.route]) return false;
  const sit = v.sit?.def;
  switch (e.route) {
    case 'cash': return h.cash >= priceNow(v.info, e, sit, alumna(w));
    case 'barter': return partsHeld(h) >= barterParts(e, sit);
    case 'trial': return h.cash >= trialFee(e, sit);
    case 'referral': return (teacher(v)?.affinity ?? 0) >= 10;
    case 'lessons': case 'enrol': return !!teacher(v) || e.route === 'lessons';
    case 'steal': return true;
    default: return false;
  }
}

/** The syllabus lines she could take now, in the order the board lists them. */
export const takeable = (w: World, v: HubView): SyllabusEntry[] => v.info.syllabus.filter((e) => canTake(w, v, e));

/** How much she wants a line of the syllabus right now. */
function wantOf(w: World, v: HubView, e: SyllabusEntry): number {
  const h = w.hero;
  const base = 0.5 + 0.06 * Math.min(6, h.int);
  const price = e.route === 'cash' ? priceNow(v.info, e, v.sit?.def, alumna(w)) : e.route === 'trial' ? trialFee(e, v.sit?.def) : 0;
  const cost = price ? 0.45 * Math.min(1, price / Math.max(60, h.cash)) : 0;
  // A lesson already half done is worth finishing.
  const more = e.route === 'lessons' || e.route === 'enrol' ? 0.1 * progress(w, v, e) : 0;
  return base - cost + more;
}

function syllabusCandidates(w: World, v: HubView): Candidate[] {
  const out: Candidate[] = [];
  // Most of these techniques are no use below INT 2 (techniques.ts), so a hub teaches no one who cannot use them.
  if (w.hero.int < 2) return out;
  for (const e of v.info.syllabus) {
    if (!canTake(w, v, e)) continue;
    const tk = techTok(e.tech);
    out.push({
      key: `${KEY.deal}:learn:${e.tech}:${e.route}`,
      drives: ROUTE_DRIVES[e.route] ?? {},
      bonus: wantOf(w, v, e) + capabilityPull(w.hero, ROUTE_NEEDS[e.route] ?? []),
      ...(e.route === 'steal' ? { risk: 0.3 } : e.route === 'trial' ? { risk: 0.15 } : {}),
      intent: { text: `Blackbird reads the board at ${v.main.name} and finds a line she wants: ${tk.tech}, ${(ROUTES[e.route]?.label ?? e.route)}.` },
      run: (c) => {
        const now = viewAt(c.w) ?? v;
        if (canTake(c.w, now, e)) RUN[e.route]!(c, now, e);
      },
    });
  }
  return out;
}

/**
 * A pull toward a hub that teaches something she could take now. Added to the pull of `go` like the shops and the doc (supply.ts):
 * hubs are rare and only worth the walk if there is a line on the board for her.
 */
export function hubUrge(w: World, to: Id): { bonus: number; smart: number } {
  const v = viewAt(w, to);
  if (!v || w.hero.locationId === to || w.hero.int < 2) return { bonus: 0, smart: 0 };
  const n = takeable(w, v).length;
  if (!n) return { bonus: 0, smart: 0 };
  // A lesson half done is a reason to go back.
  const owed = v.info.syllabus.some((e) => (e.route === 'lessons' || e.route === 'enrol') && progress(w, v, e) > 0 && canTake(w, v, e)) ? 0.2 : 0;
  return { bonus: Math.min(0.9, 0.35 + 0.1 * n + owed), smart: Math.min(0.5, 0.2 + 0.05 * n) };
}

// ===================================================================== the rows

export function hubCandidates(w: World): Candidate[] {
  const v = viewAt(w);
  if (!v || banned(w, v.main)) return [];
  const out: Candidate[] = syllabusCandidates(w, v);
  for (const a of affordancesFor('hub') as Affordance<HubView>[]) {
    if (!fits(a.where, v)) continue;
    const feats = matchingFeatures(a.where, v);
    if (feats === null) continue;
    const list: (string | undefined)[] = a.each ? feats : [undefined];
    for (const f of list) {
      if (a.ok && !a.ok(w, v, f)) continue;
      const appeal = a.appeal ? a.appeal(w, v, f) : 0;
      if (appeal <= -1) continue;
      const needs = [...a.needs, ...(f && a.needsFrom ? a.needsFrom(f) : [])];
      const line = a.intent?.length ? a.intent[w.beat % a.intent.length]!.replace('{hub}', v.main.name) : undefined;
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

/**
 * What a hub of this makeup offers (for tools and tests): the rows that fit, ignoring what only she can decide (money, who is
 * standing there), then the syllabus as the board reads it.
 */
export function describeHub(info: HubInfo, situation: string[] = []): { rows: string[]; board: string[] } {
  const v = { info, room: 'floor', features: featuresIn(info), sit: situation.length ? { id: situation[0]!, def: { tags: situation } } : undefined } as unknown as HubView;
  const rows: string[] = [];
  for (const a of affordancesFor('hub') as Affordance<HubView>[]) {
    if (!fits(a.where, v)) continue;
    const feats = matchingFeatures(a.where, v);
    if (feats === null) continue;
    rows.push(a.each ? `${a.id}×${feats.length}` : a.id);
  }
  return { rows, board: info.syllabus.map(boardLine) };
}
