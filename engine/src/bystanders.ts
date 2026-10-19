import type { Ctx, Id, Npc } from './types';
import { dist } from './grid';
import { nerve } from './character';
import { timid } from './prowl';
import { stepAside, tileAt, type ChaseBoard } from './chaseboard';

/**
 * People on the street have opinions about a chase going past them. Each one who can see it reacts once: the timid get out of the way, someone who
 * dislikes her sticks out a foot, someone who likes her gets in the pursuers' way, a few film it or call it in (which brings a patrol, in a while: see `callins.ts`), and if she is out of sight of
 * the chasers somebody may point them the way she went (which makes her easier to follow).
 */
export type Bystand = 'scatter' | 'point' | 'trip' | 'help' | 'film' | 'call' | 'none';

export interface Reacted {
  who: Npc;
  kind: Bystand;
}

const law = (n: Npc): boolean => n.tags.includes('cop') || n.tags.includes('security');

/** Weights by who they are and how they feel about her. */
function weights(c: Ctx, n: Npc, o: { chased: boolean; lost: boolean }): Record<Bystand, number> {
  const h = c.w.hero;
  const nv = nerve(c.w, n);
  const w: Record<Bystand, number> = { scatter: 1 + (timid(n) ? 3 : 0) + (1 - nv) * 2, point: 0, trip: 0, help: 0, film: n.tags.includes('kid') ? 3 : 0.7, call: law(n) ? 4 : 0.6, none: 3 };
  if (o.chased && o.lost) w.point = 0.8 + (n.affinity <= -5 ? 2 : 0) + (law(n) ? 3 : 0) - (n.affinity >= 15 ? 1 : 0);
  if (o.chased) {
    if (n.affinity <= -15) w.trip = 1 + 1.5 * nv;
    if (n.affinity >= 15) w.help = 2 + 1.5 * nv + Math.max(0, 0.1 * (h.charm - 4));
  }
  if (n.affinity <= -15) w.call += 1.5;
  if (n.affinity >= 15) w.call *= 0.3;
  return w;
}

/**
 * Who sees it this round and what they do. `done` is everyone who has already reacted in this chase. Returns the reactions; the caller applies
 * what they do to the chase (the gap, the tracking).
 */
export function bystand(c: Ctx, cb: ChaseBoard, o: { except: Id[]; done: Set<Id>; chased: boolean; lost: boolean; limit?: number }): Reacted[] {
  const { w, rng } = c;
  const her = tileAt(cb, cb.s);
  const ents = cb.placed.board.ents;
  const out: Reacted[] = [];
  const near = Object.keys(ents)
    .filter((id) => !o.except.includes(id) && !o.done.has(id) && w.npcs[id] && dist(ents[id]!, her) <= 7)
    .map((id) => w.npcs[id]!)
    .filter((n) => n.alive && !n.tags.includes('robot') && !n.tags.includes('dragon') && !n.tags.includes('boss') && n.archetype !== 'puppy' && !w.hero.companions.some((a) => a.npcId === n.id))
    .sort((a, b) => dist(ents[a.id]!, her) - dist(ents[b.id]!, her));
  for (const n of near.slice(0, o.limit ?? 2)) {
    o.done.add(n.id);
    const wt = weights(c, n, o);
    const kind = rng.weighted(Object.keys(wt) as Bystand[], (k) => wt[k]);
    if (kind === 'none') continue;
    if (kind === 'scatter') stepAside(cb, n.id);
    if (kind === 'trip') n.affinity -= 3;
    if (kind === 'help') n.affinity += 1;
    if (kind === 'film') w.hero.fame += 1;
    out.push({ who: n, kind });
  }
  return out;
}
