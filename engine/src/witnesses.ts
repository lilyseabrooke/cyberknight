import type { Ctx } from './types';
import { dist, hasLos } from './grid';
import { addHeat } from './combat';
import { moveNpc } from './population';
import { V, awareness } from './stealth';
import { pickReaction } from './witness';
import { angDiff, dirOf, sightGain, viewRange, type Board, type Body, type PUnit, type Sink } from './prowl';

/**
 * People who are on the board but not in the way of what she is doing: the patrons at a bar, the people on a street. They are not targets (she is
 * not clearing them) and they do not count when the scene asks whether she has been seen, but they see things, and they react to what they see.
 */
const here = (b: Board): PUnit[] => (b.others ?? []).filter((o) => !o.down);

/** A takedown, seen by whoever is watching. They saw her do it, so they react as to anything else she does in front of them (`witness.ts`). */
export function witnessTakedown(c: Ctx, b: Board, victim: PUnit, say: Sink): void {
  const { w } = c;
  const force = w.locations[w.hero.locationId]?.kind === 'corp' ? 'atlas' : 'npd';
  let told = 0;
  for (const o of here(b)) {
    if (told >= 3) break;
    if (sightGain(b, o, b.hero, 'walk') <= 0 && !(dist(o, victim) <= 3 && hasLos(b.grid, o, victim))) continue;
    told++;
    const a = awareness(w, o.npc);
    a.v = Math.max(a.v, V.aware);
    a.fix = true;
    a.seenAt = w.hero.locationId;
    const r = pickReaction(c, o.npc, victim.npc);
    let to = '';
    switch (r) {
      case 'flee':
        o.down = true;
        o.fled = true;
        moveNpc(w, o.npc, '_gone');
        break;
      case 'call_cops':
        addHeat(w, force, 1);
        o.npc.affinity -= 8;
        break;
      case 'film':
        w.hero.fame += 1;
        o.npc.affinity -= 2;
        break;
      case 'intervene':
      case 'join':
        o.npc.hostile = true;
        o.npc.affinity -= 15;
        (b.joined ??= []).push(o.npc);
        b.exposed = true;
        break;
      case 'shun':
        o.npc.affinity -= 6;
        break;
      case 'cheer':
        o.npc.affinity += 2;
        break;
    }
    say('prowl_witness', r === 'cheer' || r === 'film' ? 'mixed' : 'bad', { variant: r, npc: o.npc.name, victim: victim.npc.name, to });
  }
}

const sees = (b: Board, o: PUnit, body: Body): boolean => {
  const r = viewRange(b, o, body);
  return dist(o, body) <= r && hasLos(b.grid, o, body) && (angDiff(o.facing, dirOf(o, body)) <= 1 || dist(o, body) <= 1);
};

/** A body, found by somebody who is not part of it. They don't know who, only that somebody is down: most run, and a few raise the alarm. */
export function witnessBodies(c: Ctx, b: Board, say: Sink): void {
  const { w, rng } = c;
  for (const body of b.bodies) {
    if (body.found) continue;
    const o = here(b).find((x) => sees(b, x, body));
    if (!o) continue;
    body.found = true;
    const name = w.npcs[body.npcId]?.name ?? 'somebody';
    if (rng.chance(0.55)) {
      o.down = true;
      o.fled = true;
      moveNpc(w, o.npc, '_gone');
      say('prowl_witness', 'bad', { variant: 'found_run', npc: o.npc.name, victim: name, to: '' });
    } else {
      // A shout: whoever is on the board and looking for trouble now knows where it is.
      for (const u of b.units) {
        if (u.down) continue;
        const a = awareness(w, u.npc);
        a.v = Math.max(a.v, V.alert + 0.05);
        u.last = { x: body.x, y: body.y };
        u.looked = 0;
        u.calm = 0;
      }
      say('prowl_witness', 'bad', { variant: 'found_shout', npc: o.npc.name, victim: name, to: '' });
    }
  }
}
