import type { Ctx, Id, Npc, World } from './types';
import { Rng } from './rng';
import { AWAY, everyoneAt, moveNpc, npcNamed } from './population';
import { addHeat, relocate } from './combat';
import { ARCHETYPES, spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { rehome, sendAway } from './roster';
import { venueBlurb, venueName } from './mapgen';

/**
 * What happens to a place when she takes down the person it can't run without.
 *
 * A bar that has lost its owner (or the last person able to pour) shuts: the staff stay away, the punters go home and the door is
 * locked for a long while. A shop whose clerk has been laid out gets visited by the police instead, who tape the door once they
 * arrive, a few beats later. Either way nobody walks in until it reopens, and anyone who was inside is shown out.
 *
 * An owner who is dead, not just down, is different: the whole building stays shut for several nights, its staff go off to find
 * other work, and when it reopens it has a new owner and, more often than not, a new name (`reopenDue`).
 *
 * People she beats down stay down for a good while too (`downFor`), rather than shaking it off and carrying on.
 */

/** Beats a place stays shut for. */
export const SHUT_FOR = { owner: 220, police: 260 };

/** A shut-up building counts down to a beat that never arrives, so it stays shut through the night; the next morning decides. */
const SEALED_BEAT = 1e9;
/** Nights between the owner's death and the doors opening again. */
const REOPEN_AFTER = [3, 5] as const;
/** The chance the place comes back as something else, rather than the same name under a new owner. */
const REBRAND = 0.65;
/** The chance a member of staff has found something better by the time it reopens. */
const QUITS = 0.25;

export const isShut = (w: World, id: Id): boolean => (w.locations[id]?.shutUntil ?? 0) > w.beat;

/** How long somebody she has beaten (or scared off) stays out of the picture, in beats. */
export function downFor(f: Npc, rng: Rng, fled: boolean): number {
  return fled ? 30 + rng.int(0, 30) : 60 + f.level * 8 + rng.int(0, 40);
}

/** The people a bar can't open without: whoever owns it, whoever pours the drinks, whoever's on the decks. */
const runsTheHouse = (n: Npc): boolean => n.tags.includes('owner') || n.role === 'bartender' || n.role === 'DJ';

/** Everywhere indoors that belongs to the same place: the bar floor, the kitchen behind it, the room downstairs. */
export function building(w: Pick<World, 'locations'>, start: Id): Id[] {
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

function shut(c: Ctx, at: Id, by: 'owner' | 'police', who: Npc | undefined, extra = 0, why = '', sealing = false): void {
  const { w, rng } = c;
  const rooms = building(w, at);
  const until = sealing ? SEALED_BEAT : w.beat + SHUT_FOR[by] + extra;
  const place = w.locations[at]!;
  const everyone = rooms.flatMap((id) => everyoneAt(w, id));
  const staff = sealing ? everyone.filter((n) => n.alive && n !== who && !n.post && (n.tags.includes('staff') || n.tags.includes('security') || n.tags.includes('shopkeeper'))).map((n) => n.id) : [];
  const sealed = sealing
    ? { reopenRun: w.legacy.runs + rng.int(REOPEN_AFTER[0], REOPEN_AFTER[1]), main: at, former: place.name, faction: who?.faction ?? place.faction, staff, muscle: everyone.some((n) => n.role === 'bouncer' && !n.ephemeral) }
    : undefined;
  for (const id of rooms) {
    const loc = w.locations[id]!;
    loc.shutUntil = until;
    loc.shutBy = by;
    if (sealed) loc.sealed = { ...sealed, staff: [...staff] };
    delete loc.pendingShut;
  }
  const out = outside(w, at, rooms);
  for (const n of everyone) {
    if (staff.includes(n.id)) {
      // Nobody is paying them. They are off to find other work until somebody opens the doors again.
      n.hostile = false;
      moveNpc(w, n, AWAY);
    } else if (n.tags.includes('staff') || n.tags.includes('owner') || n.tags.includes('shopkeeper')) n.downUntil = Math.max(n.downUntil, until);
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
    if (!wp || wp.outdoors || wp.dungeon || wp.sealed) continue;
    // Dead, the owner takes the place with him; a place already shut for a beating is shut properly now.
    const ownerDead = !f.alive && f.tags.includes('owner') && (wp.kind === 'bar' || wp.kind === 'club');
    if (isShut(w, wp.id) && !ownerDead) continue;
    if (ownerDead) {
      shut(c, wp.id, 'owner', f, 0, 'owner_dead', true);
    } else if ((wp.kind === 'bar' || wp.kind === 'club') && runsTheHouse(f)) {
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

// ===================================================================== a new sign over the door

type Town = Pick<World, 'locations' | 'npcs' | 'factions' | 'worldSeed' | 'legacy' | 'clock'>;

/** Everywhere that has been shut for good and is due to open: called as each night begins. */
export function reopenDue(u: Town): void {
  for (const main of Object.values(u.locations)) {
    const s = main.sealed;
    if (s && s.main === main.id && u.legacy.runs >= s.reopenRun) reopen(u, main, s.reopenRun);
  }
}

/** Is this place shut for the long haul (so the night doesn't get to end its closure)? */
export const isSealed = (u: Pick<World, 'locations'>, id: Id | undefined): boolean => !!id && !!u.locations[id]?.sealed;

/** Keep a sealed building shut through the coming night. */
export function stayShut(loc: { shutUntil?: number; shutBy?: 'owner' | 'police'; pendingShut?: unknown }): void {
  loc.shutUntil = SEALED_BEAT;
  loc.shutBy = 'owner';
  delete loc.pendingShut;
}

/**
 * The doors open. Somebody has bought the place or taken it over: a new owner, most of the old staff, and quite often a
 * new name over the door. The rooms keep their ids; everything that knows them by name learns the new one.
 */
function reopen(u: Town, main: Town['locations'][string] & {}, reopenRun: number): void {
  const s = main.sealed!;
  const rooms = building(u, main.id);
  const rng = new Rng(`reopen:${u.worldSeed}:${main.id}:${reopenRun}`);
  const kind = main.kind === 'club' ? 'club' : 'bar';
  const former = main.name;
  let name = former;
  if (rng.chance(REBRAND)) {
    for (let i = 0; i < 8 && name === former; i++) name = venueName(rng, kind);
    if (name !== former) rename(u, main, rooms, name, kind, s.faction, rng);
  }
  // The new owner.
  const boss = spawnNpc(rng.fork('owner'), `owner@${main.id}.${reopenRun}`, 'barkeep', main.id, { faction: s.faction });
  boss.role = `owner of ${name}`;
  boss.authored = true;
  addNpc(u, boss);
  rehome(u, boss, main, true);
  // The old staff, unless they have found something better.
  let muscle = false;
  for (const id of s.staff) {
    const n = u.npcs[id];
    if (!n?.alive || n.locationId !== AWAY) continue;
    if (rng.chance(QUITS)) sendAway(u, n);
    else {
      const home = n.home && u.locations[n.home] ? n.home : main.id;
      moveNpc(u, n, home);
      muscle ||= n.role === 'bouncer';
    }
  }
  if (s.muscle && !muscle && ARCHETYPES.bouncer) {
    const guy = spawnNpc(rng.fork('muscle'), `muscle@${main.id}.${reopenRun}`, 'bouncer', main.id, { faction: s.faction ?? 'halo' });
    addNpc(u, guy);
    rehome(u, guy, main, true);
  }
  for (const loc of Object.values(u.locations)) if (loc.sealed?.main === main.id) delete loc.sealed;
}

/** New name over the door: the main room, the rooms behind it that were named for it, and the house itself. */
function rename(u: Town, main: Town['locations'][string] & {}, rooms: Id[], name: string, kind: 'bar' | 'club', faction: Id | undefined, rng: Rng): void {
  const former = main.name;
  const oldTail = former.split(' ').pop()!;
  const newTail = name.split(' ').pop()!;
  for (const id of rooms) {
    const loc = u.locations[id]!;
    if (id === main.id) continue;
    if (loc.name.startsWith(former)) loc.name = name + loc.name.slice(former.length);
    else if (loc.name.startsWith(`${oldTail} `)) loc.name = newTail + loc.name.slice(oldTail.length);
  }
  main.name = name;
  main.blurb = `${venueBlurb(rng, kind, name)} It used to be ${former}.`;
  const house = faction ? u.factions[faction] : undefined;
  if (house?.kind === 'venue') house.name = name;
}
