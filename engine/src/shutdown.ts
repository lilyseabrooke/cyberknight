import type { Ctx, Id, Npc, World } from './types';
import type { Rng } from './rng';
import { everyoneAt, moveNpc } from './population';
import { npcNamed } from './population';
import { addHeat, relocate } from './combat';

/**
 * What happens to a place when she takes down the person it can't run without.
 *
 * A bar that has lost its owner (or the last person able to pour) shuts: the staff stay away, the punters go home and the door is
 * locked for a long while. A shop whose clerk has been laid out gets visited by the police instead, who tape the door once they
 * arrive, a few beats later. Either way nobody walks in until it reopens, and anyone who was inside is shown out.
 *
 * People she beats down stay down for a good while too (`downFor`), rather than shaking it off and carrying on.
 */

/** Beats a place stays shut for. */
export const SHUT_FOR = { owner: 220, police: 260 };

export const isShut = (w: World, id: Id): boolean => (w.locations[id]?.shutUntil ?? 0) > w.beat;

/** How long somebody she has beaten (or scared off) stays out of the picture, in beats. */
export function downFor(f: Npc, rng: Rng, fled: boolean): number {
  return fled ? 30 + rng.int(0, 30) : 60 + f.level * 8 + rng.int(0, 40);
}

/** The people a bar can't open without: whoever owns it, whoever pours the drinks, whoever's on the decks. */
const runsTheHouse = (n: Npc): boolean => n.tags.includes('owner') || n.role === 'bartender' || n.role === 'DJ';

/** Everywhere indoors that belongs to the same place: the bar floor, the kitchen behind it, the room downstairs. */
export function building(w: World, start: Id): Id[] {
  const first = w.locations[start];
  if (!first) return [];
  const out: Id[] = [start];
  for (let i = 0; i < out.length; i++) {
    for (const e of w.locations[out[i]!]!.exits) {
      const to = w.locations[e.to];
      if (!to || out.includes(to.id) || to.outdoors || to.dungeon || to.kind !== first.kind) continue;
      out.push(to.id);
    }
  }
  return out;
}

/** Where she ends up when the place she's standing in is shut: back out the way people get thrown. */
export function outside(w: World, from: Id, closed: Id[]): Id {
  let at = from;
  for (let i = 0; i < 6 && closed.includes(at); i++) at = w.locations[at]?.tossTo ?? 'street_main';
  return closed.includes(at) ? 'street_main' : at;
}

function shut(c: Ctx, at: Id, by: 'owner' | 'police', who: Npc | undefined, extra = 0): void {
  const { w } = c;
  const rooms = building(w, at);
  const until = w.beat + SHUT_FOR[by] + extra;
  const place = w.locations[at]!;
  for (const id of rooms) {
    const loc = w.locations[id]!;
    loc.shutUntil = until;
    loc.shutBy = by;
    delete loc.pendingShut;
  }
  const out = outside(w, at, rooms);
  for (const n of rooms.flatMap((id) => everyoneAt(w, id))) {
    if (n.tags.includes('staff') || n.tags.includes('owner') || n.tags.includes('shopkeeper')) n.downUntil = Math.max(n.downUntil, until);
    else if (n.alive && !n.hostile && !n.post) moveNpc(w, n, out);
  }
  const inside = rooms.includes(w.hero.locationId);
  if (inside) relocate(w, outside(w, w.hero.locationId, rooms));
  c.emit('shut_down', 'bad', { variant: by, place: place.name, npc: who?.name ?? '', inside, to: w.locations[w.hero.locationId]!.name });
}

/**
 * Called after a win. Looks at everyone she put down and asks what that does to the place they worked.
 * Workplaces are where authored people live, or else wherever the fight found them.
 */
export function afterTakedown(c: Ctx, taken: Npc[]): void {
  const { w, rng } = c;
  for (const f of taken) {
    const wp = w.locations[f.authored && f.home ? f.home : f.locationId];
    if (!wp || wp.outdoors || wp.dungeon || isShut(w, wp.id)) continue;
    if ((wp.kind === 'bar' || wp.kind === 'club') && runsTheHouse(f)) {
      const able = building(w, wp.id)
        .flatMap((id) => everyoneAt(w, id))
        .filter((n) => n !== f && n.alive && n.downUntil <= w.beat && runsTheHouse(n));
      if (f.tags.includes('owner') || !able.length) shut(c, wp.id, 'owner', f, f.alive ? 0 : 180);
    } else if (wp.kind === 'shop' && f.tags.includes('shopkeeper') && !wp.pendingShut) {
      // Somebody rings the police. They get there when they get there.
      wp.pendingShut = { due: w.beat + rng.int(6, 14), who: f.id };
      if (wp.id === w.hero.locationId) c.emit('shut_down', 'bad', { variant: 'called', place: wp.name, npc: f.name });
    }
  }
}

/** Every beat: the police turn up at shops where somebody was laid out, and tape the door. */
export function closureTick(c: Ctx): void {
  const { w } = c;
  for (const loc of Object.values(w.locations)) {
    const p = loc.pendingShut;
    if (!p || p.due > w.beat) continue;
    delete loc.pendingShut;
    const clerk = w.npcs[p.who] ?? npcNamed(w, p.who);
    if (!clerk || isShut(w, loc.id)) continue;
    addHeat(w, 'npd', 1);
    shut(c, loc.id, 'police', clerk);
  }
}
