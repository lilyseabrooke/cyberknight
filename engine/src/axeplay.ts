import type { Ctx, Npc, World } from './types';
import type { Candidate } from './candidate';
import { addHeat, here } from './combat';
import { moveNpc, npcsAt } from './population';
import { odds, synergy, train } from './skills';
import { bestTrait } from './instruments';
import { fameFrom } from './stage';

/**
 * Things a loud enough guitar opens up, beyond a stage.
 *
 * **Draw them out.** On the street outside a guarded place, a set loud enough to hear through the walls brings the people
 * guarding it out to watch, or to complain. Fewer guards inside, and some of the ones outside go back in as fans. It
 * needs an instrument with `volume`, and it's at its best when she has business in there (a heist, a grudge, a booking).
 */

/** The people who keep a place shut: its security and its bouncers. */
const keepers = (w: World, loc: string): Npc[] =>
  npcsAt(w, loc).filter((n) => n.alive && !n.hostile && (n.tags.includes('security') || n.role === 'bouncer' || n.role === 'guard'));

export function axeCandidates(w: World): Candidate[] {
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  if (!loc.outdoors) return [];
  const volume = bestTrait(h, 'guitar', 'volume');
  if (volume < 1) return [];
  const out: Candidate[] = [];
  for (const e of loc.exits) {
    const dest = w.locations[e.to];
    if (!dest || dest.dungeon || !keepers(w, dest.id).length) continue;
    // Business in there makes it worth the noise.
    const wanted = w.mind.goals.some((g) => g.loc === dest.id || (g.npc && w.npcs[g.npc]?.locationId === dest.id));
    out.push({
      key: `draw_out:${dest.id}`, drives: { pride: 0.5, curiosity: 0.4, bravery: 0.2 }, bonus: (wanted ? 1.6 : 0) + 0.05 * volume, risk: 0.2,
      intent: { place: dest.name }, run: (c) => drawOut(c, dest.id),
    });
  }
  return out;
}

export function drawOut(c: Ctx, at: string): void {
  const { w, rng } = c;
  const h = w.hero;
  const dest = w.locations[at]!;
  const volume = bestTrait(h, 'guitar', 'volume');
  const inside = keepers(w, at);
  const p = odds(0.25, 0.06, synergy(h, ['guitar', ['music', 0.5], ['stat:charm', 0.3]])) + 0.08 * volume;
  if (rng.chance(p)) {
    const out = inside.slice(0, 1 + volume);
    for (const n of out) {
      moveNpc(w, n, h.locationId);
      if (rng.chance(0.5)) n.affinity += 6;
    }
    fameFrom(c, 1, 'draw_out');
    train(c, 'guitar', 2);
    c.emit('draw_out', 'good', { place: dest.name, count: out.length, left: inside.length - out.length, npc: out[0]?.name ?? '' });
  } else {
    addHeat(w, 'npd', 1);
    train(c, 'guitar', 1);
    c.emit('draw_out', 'bad', { place: dest.name, npc: inside[0]?.name ?? '', crowd: here(w).length });
  }
}
