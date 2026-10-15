import type { Ctx, Id, Npc, World } from './types';
import type { Rng } from './rng';
import { everyoneAt, moveNpc, npcNamed } from './population';
import { addHeat, relocate } from './combat';
import { ARCHETYPES, spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { rehome } from './roster';

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

function shut(c: Ctx, at: Id, by: 'owner' | 'police', who: Npc | undefined, extra = 0, why = ''): void {
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
  c.emit('shut_down', 'bad', { variant: why || by, place: place.name, npc: who?.name ?? '', inside, to: w.locations[w.hero.locationId]!.name });
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
    } else if ((wp.kind === 'bar' || wp.kind === 'club') && f.role === 'bouncer') {
      weighMuscle(c, wp.id, f);
    } else if (wp.kind === 'clinic' && f.tags.includes('doc')) {
      const others = everyoneAt(w, wp.id).filter((n) => n !== f && n.tags.includes('doc') && n.alive && n.downUntil <= w.beat);
      if (!others.length) shut(c, wp.id, 'owner', f, f.alive ? 0 : 180, 'clinic');
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

/**
 * The house has lost its muscle. Whoever is in charge weighs it up: one bad night, replace him and carry on; a pattern (the
 * place is under siege, the heat is up, they've lost people before, he's not coming back) and it isn't worth it, shut
 * the doors. Dice break ties.
 */
function weighMuscle(c: Ctx, at: Id, f: Npc): void {
  const { w, rng } = c;
  const rooms = building(w, at);
  const place = w.locations[at]!;
  const heat = w.heat[at.startsWith('halo') ? 'halo' : place.faction ?? ''] ?? 0;
  const priors = Math.max(0, f.memories.filter((m) => m === 'was beaten by Blackbird').length - 1);
  const staffDown = rooms
    .flatMap((id) => everyoneAt(w, id))
    .filter((n) => n !== f && (n.tags.includes('staff') || n.tags.includes('owner') || n.tags.includes('security')) && (!n.alive || n.downUntil > w.beat)).length;
  const trouble = heat + 1.5 * priors + 2 * staffDown + (f.alive ? 0 : 1.5) + (rng.next() - 0.5) * 2;
  if (trouble >= 6) {
    shut(c, at, 'owner', f, f.alive ? 0 : 120, 'muscle');
    return;
  }
  place.pendingHire = { due: w.beat + rng.int(8, 16) };
  if (rooms.includes(w.hero.locationId)) c.emit('house_decides', 'mixed', { variant: 'hire', place: place.name, npc: f.name });
}

export const HIRED = 'hired_muscle_';

/** Every beat: new muscle turns up where it was wanted. */
export function hiringTick(c: Ctx): void {
  const { w, rng } = c;
  for (const loc of Object.values(w.locations)) {
    const p = loc.pendingHire;
    if (!p || p.due > w.beat) continue;
    delete loc.pendingHire;
    if (isShut(w, loc.id) || !ARCHETYPES.bouncer) continue;
    // Somebody is already on the door (the hire was a rumour, or Tiny came back early): no second one.
    if (building(w, loc.id).flatMap((id) => everyoneAt(w, id)).some((n) => n.alive && n.role === 'bouncer' && n.downUntil <= w.beat)) continue;
    const id = `${HIRED}${loc.id}_${w.beat}`;
    const guy = spawnNpc(rng, id, 'bouncer', loc.id, { faction: loc.faction ?? 'halo' });
    guy.ephemeral = true; // a temp: gone by the next night
    addNpc(w, guy);
    rehome(w, guy, loc, true);
    if (building(w, loc.id).includes(w.hero.locationId)) c.emit('house_decides', 'good', { variant: 'hired', place: loc.name, npc: guy.name });
  }
}

/** Whoever the house sends when something needs smashing: a bouncer on his feet, else the owner. */
export function heavyFor(w: World, at: Id): Npc | undefined {
  const crowd = building(w, at).flatMap((id) => everyoneAt(w, id)).filter((n) => n.alive && !n.hostile && n.downUntil <= w.beat);
  return crowd.find((n) => n.role === 'bouncer') ?? crowd.find((n) => n.tags.includes('owner'));
}
