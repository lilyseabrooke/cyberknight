import type { Candidate } from './candidate';
import { clamp } from './candidate';
import type { Calling, Ctx, GameEvent, Id, World } from './types';
import { TALLY, DEFS, CALLINGS, hurt, tallyOf, seenPlaces, callingLine, type CallingDef, type SparkCtx } from './content/callings';
import { cool, cooling, topLevel } from './mind';
import { maybeAsk, waiting, type Proposal } from './advice';
import { adoptWant } from './goals';
import { TRAITS } from './personality';

/**
 * Callings: what Blackbird has decided to do with her life.
 *
 * One at a time, and it ends when she does (it lives on `Mind`, which is rebuilt with each body). It is not a Goal. It
 * leans on the goals she makes, the acts she fancies and the places she heads for, and it makes the goals it
 * wants herself. Everything specific to one Calling is in content/callings.ts.
 *
 * She catches one three ways, only while she has none:
 *   spark   a vivid moment (`spark` on each Calling), weighted by how well it suits her. She may ask the lab first.
 *   wound   something is taken from her (a companion dies). She doesn't ask.
 *   whim    now and then, out of nowhere, for no reason.
 *
 * She only leaves one by finishing it (rare, loud, and often it grows into something bigger), by losing the thread
 * after a long dry spell, or by dying. See docs/CALLINGS_PLAN.md.
 */

const BASE_FERVOR = { spark: 0.6, wound: 0.85, whim: 0.5 } as const;
/** Fervor lost per beat. About 1,000 beats of nothing at all to lose a Calling that began in a spark. */
const DRIFT = 0.0006;
const WAVER_AT = 0.25;
const QUIT_AT = 0.04;
/** Beats she goes without a new Calling after turning one down or losing one. */
const BREATHER = 150;
const WHIM_RATE = 0.0006;

const traits = (w: World) => w.hero.personality.traits;

// ===================================================================== reading

/** How much she's drawn to this one by who she is. Around 1 for an unremarkable girl; up to ~4 when it's her all over. */
export function fitOf(w: World, def: CallingDef): number {
  const t = traits(w);
  let x = 0;
  for (const k of TRAITS) x += (def.fit[k] ?? 0) * (t[k] - 0.5);
  return Math.exp(1.6 * x);
}

/** How far along, 0..1+. */
export function progressOf(w: World, cal: Calling): number {
  const def = DEFS[cal.id];
  if (!def) return 0;
  const n = def.measure ? def.measure(w, cal) : def.key ? tallyOf(w, def.key) - cal.base : 0;
  return cal.goal > 0 ? n / cal.goal : 0;
}

/** The raw count, for the status panel. */
export function countOf(w: World, cal: Calling): number {
  const def = DEFS[cal.id];
  if (!def) return 0;
  return def.measure ? def.measure(w, cal) : def.key ? tallyOf(w, def.key) - cal.base : 0;
}

export const labelOf = (cal: Calling): string => callingLine(cal);

/** How hard a performance Calling is burning in her for this skill, 0..1; zero if it isn't hers. */
export function fireOf(w: World, skill: string | undefined): number {
  const cal = w.mind.calling;
  return cal && skill && DEFS[cal.id]?.group === 'spotlight' && cal.target?.skill === skill ? cal.fervor : 0;
}

/** The most she is on fire for any performance skill. */
export const spotlightFervor = (w: World): number => {
  const cal = w.mind.calling;
  return cal && DEFS[cal.id]?.group === 'spotlight' ? cal.fervor : 0;
};

/** The counter a Calling reads when it begins, so it counts from there. */
function baseOf(w: World, cal: Calling): number {
  const def = DEFS[cal.id];
  if (!def) return 0;
  if (cal.id === 'gang') return tallyOf(w, `f_${cal.target?.faction}`);
  if (cal.id === 'dragon') return w.counters.dragon_kills ?? 0;
  if (cal.id === 'spiders') return w.counters.spiders_killed ?? 0;
  if (cal.id === 'roof') return tallyOf(w, 'parkour') + tallyOf(w, 'escape');
  if (cal.id === 'explore' || cal.id === 'kit' || cal.id === 'one' || cal.id === 'avenge' || cal.id === 'board' || cal.id === 'creator') return 0;
  return def.key ? tallyOf(w, def.key) : 0;
}

// ===================================================================== pulling on her

/** Added to the score of every candidate: the Calling's taste, scaled by how hard it has hold of her. */
export function callingBias(w: World, cand: { key: string }): number {
  const cal = w.mind.calling;
  if (!cal) return 0;
  const def = DEFS[cal.id];
  if (!def?.bias) return 0;
  const [fam, id, sub] = cand.key.split(':') as [string, string | undefined, string | undefined];
  return def.bias(w, cal, fam, id, sub) * cal.fervor;
}

/** Places it pulls her towards, for the same arithmetic as a goal's: location and how badly. */
export function callingTargets(w: World): { loc: Id; value: number }[] {
  const cal = w.mind.calling;
  const def = cal && DEFS[cal.id];
  if (!cal || !def?.pull) return [];
  return def.pull(w, cal).map((t) => ({ loc: t.loc, value: t.value * cal.fervor }));
}

// ===================================================================== tallies

const SNAPSHOTS: Record<string, (w: World) => number> = {
  cop: (w) => tallyOf(w, 'cop'),
  corp: (w) => tallyOf(w, 'corp'),
  dragon: (w) => w.counters.dragon_kills ?? 0,
  places: (w) => seenPlaces(w),
};

/** Every beat, tally what happened and work out how much each count went up. */
function tally(w: World, events: GameEvent[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const [key, fn] of Object.entries(TALLY)) {
    let n = 0;
    for (const e of events) n += fn(e, w);
    if (n > 0) {
      w.counters[`cal.${key}`] = (w.counters[`cal.${key}`] ?? 0) + n;
      d[key] = n;
    }
  }
  for (const [key, now] of Object.entries(SNAPSHOTS)) {
    const k = `cal.snap.${key}`;
    const was = w.counters[k];
    const v = now(w);
    if (was !== undefined && v > was) d[key] = v - was;
    w.counters[k] = v;
  }
  return d;
}

/** Called when she kills someone. The felled are counted by kind and by crew. */
export function tallyKill(w: World, npc: { tags: string[]; faction: string | null }): void {
  const bump = (k: string) => (w.counters[`cal.${k}`] = (w.counters[`cal.${k}`] ?? 0) + 1);
  if (npc.tags.includes('cop') || npc.faction === 'npd') bump('cop');
  if (npc.tags.includes('corp') || npc.faction === 'atlas') bump('corp');
  if (npc.faction) bump(`f_${npc.faction}`);
}

// ===================================================================== taking one up

/** How big the moment was becomes how big the dream is. */
function make(c: Ctx, def: CallingDef, kind: Calling['origin']['kind'], u: number, why: string, target?: Calling['target'], sequel = false): Calling {
  const { w, rng } = c;
  const cal: Calling = {
    id: def.id, since: w.beat, fervor: BASE_FERVOR[kind], goal: 1, base: 0, target,
    origin: { kind, text: why, beat: w.beat }, lastProgress: w.beat, last: 0, said: 0, sequel: sequel || undefined,
  };
  cal.goal = Math.max(1, def.goal(rng, u, w));
  return cal;
}

/** Make it hers. Returns false if she already has one. */
export function adoptCalling(c: Ctx, cal: Calling, by: 'self' | 'lab' = 'self'): boolean {
  const { w } = c;
  if (w.mind.calling) return false;
  cal.since = w.beat;
  cal.lastProgress = w.beat;
  cal.base = baseOf(w, cal);
  cal.last = 0;
  if (by === 'lab') cal.fervor = Math.min(1, cal.fervor + 0.1);
  w.mind.calling = cal;
  const def = DEFS[cal.id]!;
  c.emit('calling', 'good', {
    variant: cal.sequel ? 'sequel' : cal.origin.kind,
    id: cal.id, group: def.group, line: callingLine(cal), why: cal.origin.text, goal: cal.goal, target: cal.target?.text ?? '', by, cause: cal.origin.cause ?? '',
  });
  return true;
}

/** She has realised what she wants. Maybe she checks with the lab first; if she doesn't, or nobody answers, she goes with it. */
function realise(c: Ctx, cal: Calling, ask: boolean): void {
  if (ask) {
    const taken = maybeAsk(c, 'calling', (): Proposal => ({
      question: `I think I know what I'm for. I'm going to ${callingLine(cal)}. You with me?`,
      options: [
        { id: 'yes', label: 'Go for it', hint: callingLine(cal), calling: cal },
        { id: 'no', label: 'Not this one', hint: 'let it pass', cool: { calling: BREATHER } },
      ],
      lean: 'yes',
      data: { line: callingLine(cal), why: cal.origin.text, id: cal.id },
    }));
    if (taken) return;
  }
  adoptCalling(c, cal);
}

// ===================================================================== sparks and whims

function pickSpark(c: Ctx, sctx: SparkCtx): { def: CallingDef; s: number } | null {
  const { w, rng } = c;
  const opts: { def: CallingDef; s: number; weight: number }[] = [];
  for (const def of CALLINGS) {
    const s = def.spark?.(sctx) ?? 0;
    if (s > 0) opts.push({ def, s, weight: s * fitOf(w, def) });
  }
  if (!opts.length) return null;
  const pick = rng.weighted(opts, (o) => o.weight);
  // Leans strong. A moment that is vivid and fits her nearly always takes; one that doesn't, sometimes still does.
  const wounded = !!(hurt(sctx) ?? sctx.gameLost) && !!pick.def.wound;
  const p = clamp(0.12 + 0.75 * pick.s * Math.min(1.5, fitOf(w, pick.def)), 0, 0.9);
  return rng.chance(wounded ? Math.max(p, sctx.lost || sctx.gameLost ? 0.85 : 0.7) : p) ? pick : null;
}

/** Hit points left, as a share of her best, below which she was nearly dead. */
const BRINK = 0.2;
/** How much of her best she has to lose in one go for it to count as a near thing. */
const PLUNGE = 0.3;

/** She walked away from that with next to nothing left. Not a companion's death: her own close call. */
function closeCall(w: World, events: GameEvent[], hpBefore: number): GameEvent | undefined {
  const h = w.hero;
  if (w.over || h.hp <= 0 || h.hp / h.maxHp > BRINK || (hpBefore - h.hp) / h.maxHp < PLUNGE) return undefined;
  const fight = events.find((e) => e.type === 'fight_end' && e.data.hurt_by_id);
  return {
    beat: w.beat, type: 'near_death', outcome: 'bad',
    data: {
      name: 'nearly killing her', hp: Math.round(h.hp),
      ...(fight ? { by: fight.data.hurt_by!, by_id: fight.data.hurt_by_id!, by_faction: fight.data.hurt_by_faction ?? '', ...(fight.data.hurt_by_dragon ? { by_dragon: true } : {}) } : {}),
    },
  };
}

/** After each thing she does: tally it, then notice whether it meant anything. */
export function callingAfter(c: Ctx, pick: Candidate | null, gained: number, events: GameEvent[], hpBefore = Infinity): void {
  const { w, rng } = c;
  const d = tally(w, events);
  const cal = w.mind.calling;
  const fam = (pick?.key ?? '').split(':')[0] ?? '';
  const lost = events.find((e) => e.type === 'companion_lost');
  const sctx: SparkCtx = { w, events, fam, gained, d, lost, near: closeCall(w, events, hpBefore), gameLost: events.find((e) => e.type === 'game_lost') };

  if (cal) {
    const def = DEFS[cal.id];
    if (!def) {
      delete w.mind.calling;
      return;
    }
    // A moment that is exactly what she's about feeds it.
    const vivid = def.spark?.(sctx) ?? 0;
    if (vivid > 0) cal.fervor = clamp(cal.fervor + 0.08 * vivid, 0, 1);
    const now = countOf(w, cal);
    if (now > cal.last) {
      cal.fervor = clamp(cal.fervor + 0.05 * Math.min(3, now - cal.last), 0, 1);
      cal.lastProgress = w.beat;
      cal.last = now;
      if (cal.wavering && cal.fervor > 0.4) cal.wavering = false;
    }
    const p = progressOf(w, cal);
    if (p >= 1) return finish(c, cal);
    if (cal.said < 3 && p >= (cal.said + 1) / 4) {
      cal.said++;
      c.emit('calling_beat', 'good', { variant: `q${cal.said}`, line: callingLine(cal), count: now, goal: cal.goal, target: cal.target?.text ?? '' });
    }
    return;
  }

  if (w.over || w.beat < 12 || waiting(w) || cooling(w, 'calling')) return;
  const hit = pickSpark(c, sctx);
  if (!hit) return;
  const h = hurt(sctx) ?? sctx.gameLost;
  const wound = !!h && !!hit.def.wound;
  const target = hit.def.aim?.(w, rng, sctx);
  if (hit.def.aim && !target) return;
  const by = (h?.data.by as string | undefined) || 'something';
  const why = !wound ? hit.def.origin : hit.def.woundWhy ? hit.def.woundWhy(sctx) : lost ? `${lost.data.name ?? 'someone'} is dead, and ${lost.data.by ?? 'someone'} did it` : `${by} nearly killed her, and she remembers every second of it`;
  const fresh = make(c, hit.def, wound ? 'wound' : 'spark', Math.min(1, hit.s * 0.7 + 0.35 * rng.next() + (wound ? 0.25 : 0)), why, target ?? undefined);
  if (wound) fresh.origin.cause = lost ? 'loss' : sctx.gameLost && !hurt(sctx) ? 'game' : 'brush';
  realise(c, fresh, !wound);
}

// ===================================================================== finishing, wavering, whims

function finish(c: Ctx, cal: Calling): void {
  const { w, rng } = c;
  const def = DEFS[cal.id]!;
  c.emit('calling_done', 'good', { id: cal.id, line: callingLine(cal), goal: cal.goal, target: cal.target?.text ?? '', beats: w.beat - cal.since });
  w.hero.fame += 6 + Math.min(14, cal.goal / 20);
  delete w.mind.calling;
  // Mostly she isn't finished, only changed.
  for (const sq of [...(def.sequels ?? [])].sort(() => rng.next() - 0.5)) {
    const next = DEFS[sq.id];
    if (!next || !rng.chance(sq.p * 1.6)) continue;
    const target = next.aim ? next.aim(w, rng, undefined, cal) : undefined;
    if (next.aim && !target) continue;
    adoptCalling(c, make(c, next, 'spark', 0.7 + 0.3 * rng.next(), `after ${labelOf(cal)}`, target ?? undefined, true));
    return;
  }
  cool(w, 'calling', 40);
}

/** Each beat: fervor ebbs, she loses the thread or finds it, she sets herself goals for it, or she wakes up with one. */
export function callingTick(c: Ctx): void {
  const { w, rng } = c;
  const cal = w.mind.calling;
  if (cal) {
    cal.fervor = Math.max(0, cal.fervor - DRIFT);
    if (cal.fervor < WAVER_AT && !cal.wavering) {
      cal.wavering = true;
      c.emit('calling_waver', 'mixed', { line: callingLine(cal), since: w.beat - cal.lastProgress });
    }
    if (cal.fervor <= QUIT_AT) {
      c.emit('calling_crisis', 'bad', { line: callingLine(cal) });
      delete w.mind.calling;
      cool(w, 'calling', BREATHER * 2);
      return;
    }
    DEFS[cal.id]?.sync?.(w, cal);
    wish(c, cal);
    return;
  }
  if (w.beat < 30 || waiting(w) || cooling(w, 'calling') || !rng.chance(WHIM_RATE)) return;
  const def = rng.weighted(CALLINGS.filter((d) => d.whim > 0), (d) => d.whim * fitOf(w, d));
  const target = def.aim?.(w, rng);
  if (def.aim && !target) return;
  realise(c, make(c, def, 'whim', rng.next(), 'no reason at all', target ?? undefined), true);
}

/** She sets herself something to do about it. */
function wish(c: Ctx, cal: Calling): void {
  const { w, rng } = c;
  const def = DEFS[cal.id]!;
  const wants = def.want?.(w, cal) ?? [];
  if (!wants.length || waiting(w) || cooling(w, 'calling_goal') || w.hero.hp / w.hero.maxHp < 0.6) return;
  if (w.mind.goals.some((g) => g.calling && g.parent === null)) return;
  if (!rng.chance(0.03 + 0.06 * cal.fervor)) return;
  cool(w, 'calling_goal', 25);
  const want = rng.pick(wants);
  if (topLevel(w).length >= 1 && !rng.chance(0.5 + 0.5 * cal.fervor)) return;
  adoptWant(c, want, cal);
}

// ===================================================================== for display

export interface CallingView {
  label: string;
  /** 0..1, capped. */
  progress: number;
  count: number;
  goal: number;
  /** Why she took it up. */
  origin: string;
  how: 'spark' | 'wound' | 'whim';
  fervor: number;
  wavering: boolean;
  /** Beats she has carried it. */
  age: number;
}

/** Her Calling for the status panel and tools. */
export function callingView(w: World): CallingView | null {
  const cal = w.mind.calling;
  if (!cal) return null;
  return {
    label: callingLine(cal), progress: Math.min(1, Math.max(0, progressOf(w, cal))), count: countOf(w, cal), goal: cal.goal,
    origin: cal.origin.text, how: cal.origin.kind, fervor: Math.round(cal.fervor * 100) / 100, wavering: !!cal.wavering, age: w.beat - cal.since,
  };
}
