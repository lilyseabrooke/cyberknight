import type { Ctx, Location, Npc } from './types';
import { kill, maybeInjure } from './combat';
import { moveNpc } from './population';
import { spawnGroup } from './candidate';

/**
 * Somebody called it in. Nobody who calls knows what is going on, only that something is, so what turns up is a patrol, and what the patrol does
 * about it depends on what it finds: who it is chasing whom, how hot Blackbird is with that force, and what sort of officer it is.
 */
export type Side = 'her' | 'foes' | 'all' | 'ignore';
export type Kind = 'law' | 'corp' | 'crook' | 'other';

/** What sort of people are chasing her, as far as a patrol arriving can tell. */
export function kindOf(foes: Npc[]): Kind {
  if (foes.some((n) => n.tags.includes('cop') || n.faction === 'npd')) return 'law';
  if (foes.some((n) => n.faction === 'atlas' || n.tags.includes('corp'))) return 'corp';
  if (foes.some((n) => n.tags.includes('ganger') || n.tags.includes('rowdy') || n.hostile)) return 'crook';
  return 'other';
}

/** Which way the patrol goes. Mostly it is who they are looking at: the hot one, the corp's, the crooks. Now and then it is everyone. */
export function weighSides(heat: number, force: 'npd' | 'atlas', foes: Kind, fame: number): Record<Side, number> {
  return {
    her: 1 + 0.6 * heat + (foes === 'law' ? 4 : foes === 'corp' ? (force === 'atlas' ? 4 : 3) : 0),
    foes: 1 + (foes === 'crook' ? 4 : 0) + (heat <= 1 ? 2 : 0) + 0.1 * fame,
    all: 0.5 + 0.25 * heat + (force === 'atlas' ? 1 : 0),
    ignore: 1.2,
  };
}

export interface Arrival {
  side: Side;
  force: 'npd' | 'atlas';
  officers: Npc[];
  kind: Kind;
}

/** A patrol turns up. */
export function patrolArrives(c: Ctx, foes: Npc[], here: Location): Arrival {
  const { w, rng } = c;
  const force = here.kind === 'corp' ? 'atlas' : 'npd';
  const officers = spawnGroup(c, force === 'atlas' ? 'atlas_trooper' : 'npd_officer', 2, force);
  const kind = kindOf(foes);
  const wt = weighSides(w.heat[force] ?? 0, force, kind, w.hero.fame);
  const side = rng.weighted(Object.keys(wt) as Side[], (s) => wt[s]);
  return { side, force, officers, kind };
}

/** What happens when they start shooting everyone: she is hit, they are hit. */
export function shootEveryone(c: Ctx, foes: Npc[]): number {
  const { w, rng } = c;
  const h = w.hero;
  const dmg = Math.round(6 + 4 * rng.next() * (1 + 0.1 * (w.heat.npd ?? 0)));
  h.hp -= dmg;
  maybeInjure(c, dmg, 0.3);
  for (const n of foes) {
    if (!n.alive) continue;
    n.hp -= Math.round(8 + 10 * rng.next());
    if (n.hp <= 0) kill(c, w, n, 'a patrol');
  }
  return dmg;
}

/** The officers have said their piece and gone on. */
export function sendAway(c: Ctx, officers: Npc[]): void {
  for (const n of officers) moveNpc(c.w, n, '_gone');
}

