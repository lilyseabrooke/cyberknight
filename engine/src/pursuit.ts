import type { Ctx, Goal, Id, Npc, Pursuit, World } from './types';
import { clamp } from './candidate';
import { heroPower, here, npcsAt } from './combat';
import { hasBounty, knowsBounty, tippable } from './bounty';
import { caution, exposure, lawShare, quietSpot } from './discretion';
import { oddJobReady } from './hustles';
import { routeTo } from './plans';
import { sneakBonus } from './extras';
import { reactionWeights } from './witness';

/**
 * Decide what to do, then look for the chance to do it.
 *
 * A goal that needs an opportunity (a grudge needs its target; being broke needs a payday) turns
 * into a pursuit: she picks something specific, works out where it is, goes there, sizes it up
 * when she arrives, and either goes ahead, tries to get the target somewhere quieter, goes away
 * to get ready, or writes it off and picks something else. Nothing here has a timer: a pursuit
 * ends because it worked, because the thing is gone, or because she judges she can't win.
 *
 * Cash has more than one way in, so she weighs them (a bounty pays well and bites back; odd
 * jobs pay badly and don't) with her own tastes thrown into the sum.
 */

type Verdict = NonNullable<Pursuit['verdict']>;

const hpFrac = (w: World): number => w.hero.hp / w.hero.maxHp;
const traits = (w: World) => w.hero.personality.traits;
const isTmp = (n: Npc): boolean => n.id.startsWith('tmp_');

/** Anyone she is actively after right now. */
export const isHunted = (w: World, id: Id): boolean => w.mind.goals.some((g) => g.pursuit?.npc === id && (g.pursuit.plan === 'hunt' || g.pursuit.plan === 'bounty'));

const where = (w: World, n: Npc): Id | undefined => w.mind.lastSeen[n.id];
const dist = (w: World, to: Id): number => routeTo(w, w.hero.locationId, to)?.dist ?? 12;

// ===================================================================== sizing people up

/**
 * Her chance of winning, as she sees it. Mirrors the fight maths in combat.ts: how many rounds to put him down,
 * and what he does to her meanwhile. A sharper head reads the target more accurately, and she remembers who has beaten her.
 */
export function winOdds(w: World, g: Goal, n: Npc): number {
  const h = w.hero;
  const noise = ((((g.id * 37 + n.id.length * 13) % 21) - 10) / 10) * (1 - h.competence) * 0.35;
  // Friends of his who'd pile in, weighted by how likely each is to: in a crowd, a fight isn't one on one.
  let power = n.power * (1 + noise);
  let hp = Math.max(1, n.hp);
  const seen = clamp(0.8 - sneakBonus(w), 0.25, 0.97);
  for (const b of npcsAt(w, n.locationId)) {
    if (b.id === n.id || b.hostile || b.archetype === 'puppy' || b.tags.includes('robot') || h.companions.some((a) => a.npcId === b.id)) continue;
    const rw = reactionWeights(w, b, n);
    const sum = Object.values(rw).reduce((a, x) => a + x, 0);
    const p = (seen * (rw.join + rw.intervene)) / Math.max(1, sum);
    power += p * b.power * (1 + noise);
    hp += p * Math.max(1, b.hp);
  }
  const rounds = hp / Math.max(1, 0.72 * heroPower(w));
  const perRound = 0.8 * Math.max(1, power * 0.4 - (h.armor?.power ?? 0));
  const ratio = (rounds * perRound) / Math.max(1, h.hp * 0.8);
  const losses = w.counters[`lost_to_${n.id}`] ?? 0;
  return clamp((1.15 - 0.75 * ratio) * Math.pow(0.6, losses), 0.03, 0.95);
}

/** Take him here, take him somewhere quieter, wait until she's fit, or go and get ready first. */
export function assessFoe(w: World, g: Goal, n: Npc): { verdict: Verdict; odds: number } {
  const t = traits(w);
  const odds = winOdds(w, g, n);
  if (hpFrac(w) < 0.55) return { verdict: 'wait', odds };
  // Recklessness and courage lower the bar.
  const bar = clamp(0.55 - 0.25 * (t.reckless - 0.5) - 0.15 * (t.courage - 0.5), 0.3, 0.7);
  if (odds < bar) return { verdict: 'prep', odds };
  const ex = exposure(w, w.hero.locationId, [n]);
  // Paper on him spares her the police, but a crowd still sees, talks, and takes sides.
  const wary = ex.p * Math.max(0.5, lawShare(w, n)) * caution(w);
  if (wary >= 0.35) {
    const spot = quietSpot(w, w.hero.locationId, n);
    if (spot && spot.p < ex.p - 0.15) return { verdict: 'lure', odds };
  }
  return { verdict: 'take', odds };
}

// ===================================================================== finding something to do

interface Option {
  plan: Pursuit['plan'];
  npc: Npc;
  eff: number;
  odds?: number;
}

/** What each way of earning is worth to her taste. */
function taste(w: World, plan: Pursuit['plan']): number {
  const t = traits(w);
  if (plan === 'bounty') return clamp(1 + 0.8 * (t.courage - 0.5) + 0.6 * (t.justice - 0.5) + 0.4 * (t.thrill - 0.5) + 0.3 * (t.greed - 0.5), 0.4, 1.8);
  return clamp(1 + 0.7 * (t.honesty - 0.5) + 0.4 * (t.kindness - 0.5) - 0.6 * (t.thrill - 0.5) - 0.3 * (t.mischief - 0.5), 0.4, 1.8);
}

export function cashOptions(w: World, g: Goal, passed: Record<Id, number>): Option[] {
  const out: Option[] = [];
  const short = Math.max(30, (g.amount ?? 0) - w.hero.cash);
  for (const n of Object.values(w.npcs)) {
    if (!n.alive || isTmp(n) || n.hostile || (passed[n.id] ?? 0) > w.beat) continue;
    const loc = where(w, n);
    if (!loc) continue;
    const d = dist(w, loc);
    if (hasBounty(n) && knowsBounty(w, n.id)) {
      const odds = winOdds(w, g, n);
      const value = Math.min(n.bounty!.amount, short * 1.8);
      const eff = taste(w, 'bounty') * (odds * value - (1 - odds) * 55) / (8 + 3 * d);
      if (eff > 0) out.push({ plan: 'bounty', npc: n, eff, odds });
    } else if (oddJobReady(w, n)) {
      const eff = taste(w, 'odd_jobs') * 0.85 * 20 / (3 + 3 * d);
      out.push({ plan: 'odd_jobs', npc: n, eff });
    }
  }
  return out.sort((a, b) => b.eff - a.eff);
}

/** Nobody to hit and nowhere to work: ask somebody who knows. */
function tipster(w: World, passed: Record<Id, number>): Npc | undefined {
  if (!tippable(w, '').length) return undefined;
  return Object.values(w.npcs)
    .filter((n) => n.alive && !n.hostile && !isTmp(n) && (n.tags.includes('rumor') || n.tags.includes('dealer') || n.tags.includes('fixer')) && where(w, n) && (passed[n.id] ?? 0) <= w.beat)
    .sort((a, b) => dist(w, where(w, a)!) - dist(w, where(w, b)!))[0];
}

// ===================================================================== per-beat

const fresh = (g: Goal, plan: Pursuit['plan'], npc: Id | undefined, w: World): Pursuit => (g.pursuit = { plan, npc, phase: 'search', since: w.beat, passed: g.pursuit?.passed ?? {}, searched: [] });


export function pursuitTick(c: Ctx, g: Goal): void {
  if (g.kind === 'kill') huntTick(c, g);
  else if (g.kind === 'cash') cashTick(c, g);
}

/** Where is the thing she's after, and is she there? Updates phase; returns whether it turned up. */
function locate(c: Ctx, g: Goal, p: Pursuit, n: Npc): boolean {
  const { w } = c;
  const present = here(w).some((x) => x.id === n.id);
  if (present) {
    p.phase = p.plan === 'odd_jobs' || p.plan === 'ask' ? 'act' : 'assess';
    return true;
  }
  const seen = where(w, n);
  if (seen && seen === w.hero.locationId) {
    // She's where he was. He isn't.
    delete w.mind.lastSeen[n.id];
    c.emit('pursuit', 'mixed', { variant: 'lost_trail', npc: n.name, goal: g.kind });
    p.verdict = undefined;
    p.phase = 'search';
    return false;
  }
  p.verdict = undefined;
  p.phase = seen ? 'approach' : 'search';
  return false;
}

function sizeUp(c: Ctx, g: Goal, p: Pursuit, n: Npc): void {
  const { w } = c;
  const stale = p.assessedAt === undefined || w.beat - p.assessedAt >= 6;
  if (!stale && p.verdict) return;
  const { verdict, odds } = assessFoe(w, g, n);
  p.assessedAt = w.beat;
  if (verdict === 'lure') p.lureBeats = (p.lureBeats ?? 0) + 6;
  // Can't find a quiet corner after a few tries: goes loud, or doesn't, depending on how careful she is.
  const v: Verdict = verdict === 'lure' && (p.lureBeats ?? 0) > 18 ? 'take' : verdict;
  if (v !== p.verdict) {
    p.verdict = v;
    c.emit('pursuit', v === 'take' || v === 'lure' ? 'mixed' : 'bad', { variant: `sizeup_${v}`, npc: n.name, role: n.role, odds: Math.round(odds * 100), goal: g.kind, amount: n.bounty?.amount ?? 0 });
  }
  if (v === 'prep' && p.plan === 'bounty') {
    // Too much for her. Someone else, then.
    p.passed[n.id] = w.beat + 90;
    c.emit('pursuit', 'bad', { variant: 'pass', npc: n.name, goal: g.kind });
    g.pursuit = undefined;
  }
}

function huntTick(c: Ctx, g: Goal): void {
  const { w } = c;
  const n = g.npc ? w.npcs[g.npc] : undefined;
  if (!n || !n.alive) return;
  const p = (g.pursuit ??= { plan: 'hunt', npc: n.id, phase: 'search', since: w.beat, passed: {}, searched: [] });
  if (locate(c, g, p, n)) sizeUp(c, g, p, n);
  else if (p.phase === 'search') noteSearched(w, p);
}

function noteSearched(w: World, p: Pursuit): void {
  if (!p.searched.includes(w.hero.locationId)) p.searched.push(w.hero.locationId);
}

function cashTick(c: Ctx, g: Goal): void {
  const { w, rng } = c;
  const short = (g.amount ?? 0) - w.hero.cash;
  if (short <= 0) return;
  let p = g.pursuit;
  const n = p?.npc ? w.npcs[p.npc] : undefined;

  // Is what she's working still worth working?
  let valid = !!p && !!n && n.alive && !n.hostile;
  if (valid && p!.plan === 'bounty') valid = hasBounty(n) && knowsBounty(w, n!.id) && (p!.passed[n!.id] ?? 0) <= w.beat;
  if (valid && p!.plan === 'odd_jobs') valid = oddJobReady(w, n!);
  if (valid && p!.plan === 'ask') valid = tippable(w, '').length > 0;
  if (!valid) p = undefined;

  // Asking around gets her a few tries per tipster; then she tries someone else.
  if (p && p.plan === 'ask' && w.beat - p.since >= 8 && p.npc) {
    g.pursuit!.passed[p.npc] = w.beat + 60;
    p = undefined;
  }

  // Look around for something better now and then, but only switch for something clearly better.
  const review = !p || w.beat - p.since >= 8;
  if (review) {
    const passed = g.pursuit?.passed ?? {};
    const opts = cashOptions(w, g, passed);
    if (opts.length) {
      const cur = p?.npc ? opts.find((o) => o.npc.id === p!.npc && o.plan === p!.plan) : undefined;
      const exp = 1 + 2 * w.hero.competence;
      const weights = opts.map((o) => Math.pow(o.eff, exp));
      const pick = !p || !cur || opts[0]!.eff > cur.eff * 1.6 ? opts[rng.weighted(opts.map((_, i) => i), (i) => weights[i]!)]! : cur;
      if (!p || pick.npc.id !== p.npc || pick.plan !== p.plan) {
        const switched = !!p;
        p = fresh(g, pick.plan, pick.npc.id, w);
        p.eff = pick.eff;
        const place = w.locations[where(w, pick.npc)!]?.name ?? 'around';
        c.emit('pursuit', 'mixed', {
          variant: pick.plan === 'bounty' ? 'bounty_pick' : 'jobs_pick', npc: pick.npc.name, role: pick.npc.role, amount: pick.npc.bounty?.amount ?? 0,
          odds: Math.round((pick.odds ?? 0) * 100), place, switched, short: Math.round(short), options: opts.length,
        });
      } else if (p) {
        p.since = w.beat;
      }
    } else if (!p || p.plan !== 'ask') {
      const t = tipster(w, g.pursuit?.passed ?? {});
      if (t) {
        p = fresh(g, 'ask', t.id, w);
        c.emit('pursuit', 'mixed', { variant: 'ask_pick', npc: t.name, role: t.role, place: w.locations[where(w, t)!]?.name ?? 'around', short: Math.round(short) });
      } else if (p) {
        p = undefined;
      }
    }
  }
  g.pursuit = p;
  if (!p) return;
  const target = p.npc ? w.npcs[p.npc] : undefined;
  if (target && locate(c, g, p, target) && (p.plan === 'bounty')) sizeUp(c, g, p, target);
  else if (target && p.phase === 'search') noteSearched(w, p);
}

// ===================================================================== steering

/** Places the pursuit wants her. Null means no opinion: the goal's usual targets apply. */
export function pursuitTargets(w: World, g: Goal): { loc: Id; value: number }[] | null {
  const p = g.pursuit;
  if (!p) return null;
  const n = p.npc ? w.npcs[p.npc] : undefined;
  if (!n) return null;
  const loc = where(w, n);
  if (loc) return [{ loc, value: g.kind === 'kill' ? 2.8 : 3.0 }];
  // Don't know where he is: try somewhere she hasn't looked yet.
  if (p.plan === 'hunt' || p.plan === 'bounty') {
    let best: { loc: Id; d: number } | null = null;
    for (const [id, l] of Object.entries(w.locations)) {
      if (p.searched.includes(id) || ['corp', 'boss', 'home'].includes(l.kind) || id.startsWith('_')) continue;
      const r = routeTo(w, w.hero.locationId, id);
      if (r && (!best || r.dist < best.d)) best = { loc: id, d: r.dist };
    }
    if (!best) p.searched = [];
    else return [{ loc: best.loc, value: 2.2 }];
  }
  return null;
}

/** What the pursuit wants her to do about the person in front of her. Added on top of the goal's own bias. */
export function pursuitBias(w: World, g: Goal, fam: string, id: string | undefined): number {
  const p = g.pursuit;
  if (!p || !id || id !== p.npc) return 0;
  const fight = fam === 'challenge' || fam === 'sweep';
  const quiet = fam === 'lure' || fam === 'tail';
  if (p.plan === 'odd_jobs') return fam === 'odd_jobs' ? 4.5 : 0;
  if (p.plan === 'ask') return fam === 'chat' ? 3.5 : 0;
  if (p.phase !== 'assess') return 0;
  switch (p.verdict ?? 'take') {
    case 'take': return fight ? 4.5 : quiet ? 0.5 : 0;
    case 'lure': return quiet ? 4 : fight ? 0.6 : 0;
    case 'wait': return fight ? 0.3 : 0;
    case 'prep': return 0;
  }
}

/** Whether the pursuit is doing the steering for cash, so the generic scramble-for-money pull should back off. */
export const pursuing = (g: Goal): boolean => !!g.pursuit && g.pursuit.plan !== 'hunt';

