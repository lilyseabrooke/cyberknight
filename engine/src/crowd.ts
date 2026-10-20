import type { Ctx, Npc, NpcGoalKind, World } from './types';
import { remember } from './combat';
import { clamp } from './candidate';
import { canDeepen, ensureDeep } from './deepen';
import { moveNpc, npcsAt } from './population';
import { isPerson } from './roads';
import { coolFor } from './mind';
import { ERRAND_KINDS, barNear, carStreet } from './errands';
import { addGoal, goalOf, oddsWith, phrasing, wishes, type Wish } from './influence';

/**
 * Moving a crowd in one go: influence (influence.ts) on everyone in earshot at once, to the standard set by speaking
 * (speaking.ts, where a speech is now worked in stages over clock time and sweeps up passers-by). This is the one-shot
 * form, with what she brings to it left open, for things that sway a crowd in a single moment: a flash mob of her fans.
 *
 * - She picks the cry: the biggest thing she wants that a crowd can help with, or else whatever she feels like.
 * - Each person weighs it the way they'd weigh a one-to-one ask (`oddsWith`): how big it is, how it sits with who they
 *   are, how they feel about her, against her `voice`. A crowd carries itself (`swell`), and the occasion can add an edge.
 * - Only the keenest `MAX_LEADERS` carry the goal themselves; everyone else she moves follows one of them and lends them
 *   their numbers (`NpcGoal.followers`, `withAssist`). So fifty people is a very different thing from eight, without fifty
 *   people to run.
 */

/** The things a crowd can be sent off to do. (Not "tell her a secret", and not "go and kiss somebody": that wants one person.) */
export const CRY: NpcGoalKind[] = ['back_me_up', 'go_after', 'cover', 'give_cash', 'steal_car', 'take_deck', 'buy_round', 'tag_wall', 'karaoke'];

/** How many of the people she moves are actually simulated, carrying the goal about. The rest follow one of them. */
export const MAX_LEADERS = 6;

/** What only works if they are with her. */
const PRESENCE = new Set<NpcGoalKind>(['back_me_up', 'give_cash', 'cover']);

/** Locations within earshot: here, and out along the open streets from here. */
function earshot(w: World, depth: number): string[] {
  const start = w.hero.locationId;
  const seen = new Set<string>([start]);
  let ring = [start];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of ring) {
      for (const e of w.locations[id]?.exits ?? []) {
        const to = w.locations[e.to];
        if (e.hidden || e.gate || !to?.outdoors || seen.has(e.to)) continue;
        seen.add(e.to);
        next.push(e.to);
      }
    }
    ring = next;
  }
  return [...seen];
}

/** Who is in earshot and can be moved. */
export function crowdAround(w: World, depth = 1): Npc[] {
  const h = w.hero;
  const out: Npc[] = [];
  for (const id of earshot(w, depth)) {
    for (const n of npcsAt(w, id)) {
      if (n.alive && !n.hostile && n.downUntil <= w.clock && canDeepen(n) && isPerson(n.tags, n.archetype) && !h.companions.some((a) => a.npcId === n.id)) out.push(n);
    }
  }
  return out;
}

/** What she asks of this one person for this cry, if it is something they could do. */
function wishFor(w: World, n: Npc, kind: NpcGoalKind): Wish | null {
  if (goalOf(n, kind) || (ERRAND_KINDS.has(kind) && n.goals?.some((g) => ERRAND_KINDS.has(g.kind)))) return null;
  const real = wishes(w, n).find((x) => x.kind === kind);
  if (real) return real;
  const loc = w.locations[w.hero.locationId];
  switch (kind) {
    case 'tag_wall': return loc && loc.kind !== 'home' ? { kind, urge: 0.3, magnitude: 0.4, loc: loc.id } : null;
    case 'karaoke': return w.features.karaoke && w.locations[w.features.karaoke.locationId] ? { kind, urge: 0.3, magnitude: 0.35 } : null;
    case 'take_deck': return w.features.dj_booth && w.locations[w.features.dj_booth.locationId] ? { kind, urge: 0.3, magnitude: 0.6 } : null;
    case 'steal_car': return carStreet(w, w.hero.locationId) ? { kind, urge: 0.3, magnitude: 0.75 } : null;
    case 'buy_round': return n.cash >= 40 && barNear(w, w.hero.locationId) ? { kind, urge: 0.3, magnitude: 0.35 + 0.3 * clamp(30 / n.cash, 0, 1) } : null;
    default: return null;
  }
}

/** What she tells them to do: the biggest thing she wants that a crowd can help with (from `cries`), or else whatever she feels like. */
function pickCry(c: Ctx, crowd: Npc[], cries: NpcGoalKind[]): NpcGoalKind | null {
  const { w, rng } = c;
  let best: { kind: NpcGoalKind; urge: number } | null = null;
  for (const n of crowd.slice(0, 12)) {
    for (const x of wishes(w, n)) if (cries.includes(x.kind) && (!best || x.urge > best.urge)) best = { kind: x.kind, urge: x.urge };
  }
  if (best && best.urge >= 0.2) return best.kind;
  const t = w.hero.personality.traits;
  const mood = ([
    { kind: 'steal_car', w: 0.3 + t.mischief + t.thrill },
    { kind: 'take_deck', w: 0.3 + t.fame + t.mischief },
    { kind: 'buy_round', w: 0.3 + t.sociable + t.impress },
    { kind: 'tag_wall', w: 0.2 + t.artistry + t.mischief },
    { kind: 'karaoke', w: 0.3 + t.fame + t.mischief },
  ] as { kind: NpcGoalKind; w: number }[]).filter((o) => cries.includes(o.kind) && crowd.some((n) => wishFor(w, n, o.kind)));
  return mood.length ? rng.weighted(mood, (o) => Math.max(0.05, o.w)).kind : null;
}

export interface Moved {
  kind: NpcGoalKind;
  /** Everyone it moved. */
  count: number;
  /** How many of them carry the goal themselves; the rest follow one of those. */
  lead: number;
  of: number;
  names: string[];
  deed: string;
}

export interface CrowdCall {
  /** How far it carries along the open streets. */
  depth: number;
  /** How much longer than a one-to-one ask the goal lasts. */
  stretch: number;
  /** A bonus on everyone's odds from the occasion. */
  edge: number;
  /** Her side of the roll, on the synergy scale (a speech is her speaking; a flash mob is her name as a performer). */
  voice: number;
  /** What she might ask of them. Defaults to everything a crowd can do. */
  cries?: NpcGoalKind[];
  /** Who she's talking to, if not everyone in earshot. */
  crowd?: Npc[];
  /** How it's remembered by the people it moved. */
  memory?: string;
}

/** Everyone in earshot weighs what she asks of them; the willing take it on. Null if there was nobody to ask, or nothing to ask. */
export function moveCrowd(c: Ctx, o: CrowdCall): Moved | null {
  const { w, rng } = c;
  const h = w.hero;
  const crowd = (o.crowd ?? crowdAround(w, o.depth)).sort((a, b) => b.affinity - a.affinity);
  if (!crowd.length) return null;
  const kind = pickCry(c, crowd, o.cries ?? CRY);
  if (!kind) return null;
  const swell = Math.min(0.25, 0.03 * Math.log2(crowd.length) * 2);
  const willing: { n: Npc; wish: Wish; p: number }[] = [];
  for (const n of crowd) {
    const wish = wishFor(w, n, kind);
    if (!wish) continue;
    ensureDeep(w, n);
    coolFor(w, `influence:${n.id}:${kind}`, 105);
    const p = clamp(oddsWith(w, n, wish, 'persuasion', o.voice) + swell + o.edge, 0.03, 0.95);
    if (rng.chance(p)) willing.push({ n, wish, p });
  }
  if (!willing.length) return { kind, count: 0, lead: 0, of: crowd.length, names: [], deed: '' };
  // The keenest take the lead; everyone else falls in behind one of them.
  willing.sort((a, b) => b.p - a.p);
  const leaders = willing.slice(0, MAX_LEADERS).map((x) => ({ ...x, goal: addGoal(c, x.n, x.wish, 'persuasion', o.stretch) }));
  willing.slice(MAX_LEADERS).forEach((f, i) => {
    const lead = leaders[i % leaders.length]!;
    (lead.goal.followers ??= []).push(f.n.id);
  });
  for (const { n } of willing) {
    n.affinity += 2;
    remember(n, o.memory ?? 'was swept up by Blackbird');
  }
  // Some things only count if they are there.
  if (PRESENCE.has(kind)) for (const { n } of leaders) if (n.locationId !== h.locationId) moveNpc(w, n, h.locationId);
  const first = leaders[0]!;
  const deed = kind === 'give_cash' ? 'passing the hat' : phrasing(w, first.wish).deed;
  return { kind, count: willing.length, lead: leaders.length, of: crowd.length, names: willing.map((x) => x.n.name), deed };
}

/** The fields a line of text about a moved crowd can use. */
export const crowdData = (m: Moved | null): Record<string, string | number> =>
  m?.count ? { count: m.count, lead: m.lead, rest: m.count - m.lead, of: m.of, deed: m.deed, who: m.names.slice(0, 2).join(' and '), kind: m.kind } : {};
