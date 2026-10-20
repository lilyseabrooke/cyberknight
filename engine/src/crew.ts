import type { Candidate } from './candidate';
import type { Ctx, Deed, Stationed, World } from './types';
import { HOMES } from './content/realty';
import { JOBS, SHIFT_XP, STASH_HOURS, type JobDef } from './content/stations';
import { PARTS, billText } from './content/parts';
import { deedsOf, homeDeed } from './deeds';
import { gainCompanionXp, levelOf, slotsFree } from './companions';
import { skillLevel, train } from './skills';
import { reachFrom } from './rest';

/**
 * Her people, kept and posted. Only the companions with her count toward the limit (companions.ts); the rest wait at a home
 * she owns, as many as it has berths for (a pod has one, a townhouse three), and work there on her behalf. Their work
 * is measured in world minutes, not beats, and piles up in the stash for her to collect next time she is home. A
 * stationed companion is on the deed, so they are still there after she dies.
 *
 * She can also drill an ally herself, anywhere, for a little experience.
 */

export const berthsOf = (d: Deed): number => HOMES[d.kind]?.berths ?? 1;
export const crewOf = (d: Deed): Stationed[] => d.crew ?? [];
export const berthsFree = (d: Deed): number => berthsOf(d) - crewOf(d).length;

/** Everyone stationed anywhere. */
export const allStationed = (w: Pick<World, 'legacy'>): Stationed[] => deedsOf(w).flatMap(crewOf);

/** The ids of the NPCs stationed anywhere, so wrapping up a night doesn't send them home. */
export const stationedNpcIds = (w: Pick<World, 'legacy'>): Set<string> => new Set(allStationed(w).flatMap((s) => (s.comp.npcId ? [s.comp.npcId] : [])));

const qualifies = (job: JobDef, abilities: string[]): boolean => job.needs.length === 0 || job.needs.some((a) => abilities.includes(a));

/** What they are worth an hour on a job, for choosing the best. */
const hourly = (job: JobDef): number => (job.cash ?? 0) + Object.entries(job.parts ?? {}).reduce((a, [id, n]) => a + n * (PARTS[id]?.value ?? 1), 0) + (job.xp ?? 0) * 2;

/** The job that suits them best: rest when hurt, otherwise whatever pays most for what they can do. */
export function bestJob(comp: Stationed['comp']): string {
  if (comp.hp < comp.maxHp * 0.6) return 'rest';
  const ids = Object.keys(JOBS).filter((id) => id !== 'rest' && qualifies(JOBS[id]!, comp.abilities));
  return ids.sort((a, b) => hourly(JOBS[b]!) - hourly(JOBS[a]!))[0] ?? 'drill';
}

/** How much better or worse they work for her: level, and how they feel about her. */
const effort = (comp: Stationed['comp']): number => (1 + 0.05 * (levelOf(comp) - 1)) * (comp.loyalty < 30 ? 0.5 : comp.loyalty >= 70 ? 1.15 : 1);

const stashWorth = (s: Stationed): number => s.stash.cash + Object.entries(s.stash.parts).reduce((a, [id, n]) => a + n * (PARTS[id]?.value ?? 1), 0);
const hasStash = (s: Stationed): boolean => s.stash.cash >= 1 || Object.values(s.stash.parts).some((n) => n >= 1);

/** Count the work done since they were last counted. */
function settle(c: Ctx, s: Stationed): void {
  const { w } = c;
  const hours = Math.max(0, w.clock - s.since) / 60;
  s.since = w.clock;
  if (hours <= 0) return;
  const comp = s.comp;
  const job = JOBS[s.job] ?? JOBS.drill!;
  const eff = effort(comp);
  // The home itself mends them a little; resting mends them properly.
  comp.hp = Math.min(comp.maxHp, comp.hp + (comp.maxHp * hours) / (job.mends ? 4 : 14));
  if (job.mends) comp.loyalty = Math.min(80, comp.loyalty + 0.5 * hours);
  const cap = STASH_HOURS * eff;
  if (job.cash) s.stash.cash = Math.min(job.cash * cap, s.stash.cash + job.cash * eff * hours);
  for (const [id, rate] of Object.entries(job.parts ?? {})) s.stash.parts[id] = Math.min(rate * cap, (s.stash.parts[id] ?? 0) + rate * eff * hours);
  const xp = (job.mends ? 0 : SHIFT_XP) + (job.xp ?? 0);
  if (xp > 0) gainCompanionXp(c, comp, xp * hours);
}

/** Once a beat: everyone posted at a home gets on with it. */
export function tickCrews(c: Ctx): void {
  for (const d of deedsOf(c.w)) for (const s of crewOf(d)) settle(c, s);
}

/** The job's own words, for the log. */
const jobLabel = (id: string): string => JOBS[id]?.label ?? id;

// ===================================================================== posting and recalling

/** Post one of her companions at this home. They stop counting toward the limit. */
export function station(c: Ctx, deed: Deed, comp: Stationed['comp']): boolean {
  const { w } = c;
  const h = w.hero;
  if (berthsFree(deed) <= 0 || !h.companions.includes(comp)) return false;
  h.companions = h.companions.filter((a) => a !== comp);
  const job = bestJob(comp);
  deed.crew = [...crewOf(deed), { comp, job, since: w.clock, posted: w.clock, stash: { cash: 0, parts: {} } }];
  c.emit('station_ally', 'good', { name: comp.name, kind: comp.kind, home: deed.name, job: jobLabel(job), level: levelOf(comp), left: berthsFree(deed) });
  return true;
}

/** Take one back. Whatever they were holding for her comes with them. */
export function recall(c: Ctx, deed: Deed, s: Stationed): boolean {
  const { w } = c;
  const h = w.hero;
  if (!slotsFree(w)) return false;
  settle(c, s);
  collect(c, deed, s);
  deed.crew = crewOf(deed).filter((x) => x !== s);
  h.companions.push(s.comp);
  c.emit('recall_ally', 'good', { name: s.comp.name, kind: s.comp.kind, home: deed.name, count: h.companions.length });
  return true;
}

/** Hand over what they have made. */
export function collect(c: Ctx, deed: Deed, s: Stationed): void {
  const h = c.w.hero;
  settle(c, s);
  const cash = Math.floor(s.stash.cash);
  const got: Record<string, number> = {};
  for (const [id, n] of Object.entries(s.stash.parts)) {
    const whole = Math.floor(n);
    if (whole >= 1) got[id] = whole;
  }
  if (!cash && !Object.keys(got).length) return;
  s.stash.cash -= cash;
  h.cash += cash;
  for (const [id, n] of Object.entries(got)) {
    s.stash.parts[id]! -= n;
    h.parts = { ...(h.parts ?? {}), [id]: (h.parts?.[id] ?? 0) + n };
  }
  c.emit('crew_collect', 'good', { name: s.comp.name, kind: s.comp.kind, home: deed.name, job: jobLabel(s.job), cash, parts: billText(got), hasParts: Object.keys(got).length > 0 });
}

/** Put them on the best job for what they can do now. */
function reassign(c: Ctx, deed: Deed, s: Stationed): void {
  settle(c, s);
  s.job = bestJob(s.comp);
  c.emit('crew_job', 'mixed', { name: s.comp.name, kind: s.comp.kind, home: deed.name, job: jobLabel(s.job) });
}

// ===================================================================== drilling

const DRILL_GAP = 120;

/** Time she spends putting an ally through their paces: a few hours' worth of experience at once. */
function drill(c: Ctx, id: string): void {
  const { w } = c;
  const h = w.hero;
  const a = h.companions.find((x) => x.id === id);
  if (!a) return;
  w.counters[`drill_${a.id}`] = w.clock;
  const xp = 6 + 0.8 * levelOf(a) + 1.5 * skillLevel(h, 'rapport');
  a.loyalty = Math.min(100, a.loyalty + 2);
  train(c, 'rapport', 1);
  c.emit('drill_ally', 'good', { name: a.name, kind: a.kind, level: levelOf(a) });
  gainCompanionXp(c, a, xp);
}

// ===================================================================== why she would go home

/** Hours a posting has to settle before she thinks about recalling them. */
const SETTLE_MIN = 180;
/** Worth collecting: neodollars' worth of stash that makes a trip home worthwhile. */
const WORTH_A_TRIP = 25;

const mended = (s: Stationed): boolean => s.comp.hp >= s.comp.maxHp * 0.8;
const settled = (w: World, s: Stationed): boolean => w.clock - (s.posted ?? -1e9) >= SETTLE_MIN;
const weakest = (w: World) => [...w.hero.companions].sort((a, b) => levelOf(a) - levelOf(b))[0];

/** The posted companion who would most improve the party in place of this one, if the exchange is worth making. */
const betterThan = (w: World, deed: Deed, a: Stationed['comp']): Stationed | undefined =>
  crewOf(deed).filter((s) => mended(s) && settled(w, s) && (levelOf(s.comp) >= levelOf(a) + 3 || (a.hp < a.maxHp * 0.5 && s.comp.hp > a.hp * 1.6))).sort((x, y) => levelOf(y.comp) - levelOf(x.comp))[0];

/** What the party wants from this home right now, each 0..1ish: the stash, a free hand, a place to put somebody, a trade. */
function wants(w: World, deed: Deed): { collect: number; recall: number; store: number; swap: number } {
  const h = w.hero;
  const crew = crewOf(deed);
  const worth = crew.reduce((a, s) => a + stashWorth(s), 0);
  const ready = crew.filter((s) => mended(s) && settled(w, s));
  const free = slotsFree(w);
  const hurt = h.companions.some((a) => a.hp < a.maxHp * 0.5);
  return {
    collect: worth >= WORTH_A_TRIP ? Math.min(1, worth / 100) : 0,
    // Short-handed, with somebody waiting who is ready to go.
    recall: free && ready.length ? (h.companions.length === 0 ? 0.6 : h.companions.length === 1 ? 0.3 : 0.12) : 0,
    // A full party can't take on anybody new; a hurt one wants a bed.
    store: berthsFree(deed) > 0 && h.companions.length > 0 ? (!free ? 0.5 : 0) + (hurt ? 0.45 : 0) : 0,
    swap: !free && berthsFree(deed) <= 0 && h.companions.some((a) => betterThan(w, deed, a)) ? 0.45 : 0,
  };
}

/** The pull toward the next step on the way to one of her homes, when there is something to do there. Added to the exit candidates. */
export function crewPull(w: World, dest: string): { bonus: number; smart: number } {
  const none = { bonus: 0, smart: 0 };
  const h = w.hero;
  const deeds = deedsOf(w).filter((d) => d.home !== h.locationId && w.locations[d.home]);
  if (!deeds.length || dest === h.locationId) return none;
  const reach = reachFrom(w, h.locationId, 14);
  let bonus = 0;
  for (const d of deeds) {
    const r = reach.get(d.home);
    if (!r || r.next !== dest) continue;
    const x = wants(w, d);
    const want = Math.max(x.collect, x.recall, x.store, x.swap);
    // A town is a long way to walk for pocket change.
    if (want > 0) bonus = Math.max(bonus, (1.2 * want) / (1 + 0.12 * r.dist));
  }
  return bonus ? { bonus, smart: 0.4 } : none;
}

// ===================================================================== what she can do

/** Trade a companion of hers for one posted here, the one going into the berth the other leaves. */
function swap(c: Ctx, deed: Deed, s: Stationed, a: Stationed['comp']): void {
  const { w } = c;
  const h = w.hero;
  if (!h.companions.includes(a) || !crewOf(deed).includes(s)) return;
  settle(c, s);
  collect(c, deed, s);
  deed.crew = crewOf(deed).filter((x) => x !== s);
  h.companions = h.companions.map((x) => (x === a ? s.comp : x));
  const job = bestJob(a);
  deed.crew.push({ comp: a, job, since: w.clock, posted: w.clock, stash: { cash: 0, parts: {} } });
  c.emit('swap_ally', 'good', { name: a.name, kind: a.kind, other: s.comp.name, otherKind: s.comp.kind, home: deed.name, job: jobLabel(job) });
}

export function crewCandidates(w: World): Candidate[] {
  const h = w.hero;
  const out: Candidate[] = [];
  // Drills can happen anywhere.
  for (const a of h.companions) {
    if (a.loyalty < 20 || a.hp < a.maxHp * 0.5 || w.clock - (w.counters[`drill_${a.id}`] ?? -1e9) < DRILL_GAP) continue;
    out.push({ key: `drill_ally:${a.id}`, drives: { pride: 0.25, curiosity: 0.15 }, bonus: 0.1, run: (c) => drill(c, a.id) });
  }
  const deed = homeDeed(w, w.locations[h.locationId]!);
  if (!deed) return out;
  const x = wants(w, deed);
  for (const s of crewOf(deed)) {
    if (hasStash(s)) out.push({ key: `crew_collect:${s.comp.id}`, drives: { greed: 0.6 }, bonus: Math.min(1.2, stashWorth(s) / 60), run: (c) => collect(c, deed, s) });
    if (slotsFree(w)) out.push({ key: `recall_ally:${s.comp.id}`, drives: { curiosity: 0.1, pride: 0.1 }, bonus: mended(s) && settled(w, s) ? Math.max(0.1, x.recall) : -0.5, run: (c) => recall(c, deed, s) });
    if (bestJob(s.comp) !== s.job) out.push({ key: `crew_job:${s.comp.id}`, drives: { curiosity: 0.1 }, bonus: 0.15, run: (c) => reassign(c, deed, s) });
  }
  const worst = weakest(w);
  for (const a of h.companions) {
    // With a full party she can't recruit anyone else: a berth is how she makes room, and the weakest goes first.
    if (berthsFree(deed) > 0) {
      out.push({ key: `station_ally:${a.id}`, drives: { curiosity: 0.1, pride: 0.1 }, bonus: 0.05 + x.store + (a === worst ? 0.1 : 0) + (a.hp < a.maxHp * 0.6 ? 0.2 : 0), run: (c) => void station(c, deed, a) });
    }
    const better = !slotsFree(w) && berthsFree(deed) <= 0 ? betterThan(w, deed, a) : undefined;
    if (better) out.push({ key: `swap_ally:${a.id}:${better.comp.id}`, drives: { curiosity: 0.1, pride: 0.1 }, bonus: x.swap, run: (c) => swap(c, deed, better, a) });
  }
  return out;
}
