import type { Id, Npc, World } from './types';

/**
 * The population store. Every NPC lives in `w.npcs`, but nothing should scan that record to answer
 * "who is here?": at the scale this is heading for, that's the difference between a lookup and
 * a crawl. This module owns the indexes and is the only code that may write `Npc.locationId`
 * (the field is `readonly` everywhere else, so the compiler enforces it).
 *
 * Indexes are derived, never saved. They're built lazily the first time a world is asked
 * something, so a world loaded from JSON or cloned just rebuilds on first use.
 *
 *   byLoc    who is standing in each place
 *   byHaunt  who turns up in each place from time to time (see movement.ts)
 *   byName   who goes by a name (names repeat, so it's a set), for turning text back into a person
 *   order    each person's place in creation order, so lookups come back in a stable order
 */

/** Where people go when they're off the known map. They're available to be cast into new places. */
export const AWAY: Id = '_away';

interface Index {
  byLoc: Map<Id, Set<Id>>;
  byHaunt: Map<Id, Set<Id>>;
  byName: Map<string, Set<Id>>;
  order: Map<Id, number>;
  next: number;
}

/** What the store needs of a world: just its people. A bare universe qualifies. */
export type Population = Pick<World, 'npcs'>;

const indexes = new WeakMap<object, Index>();

const put = (m: Map<Id, Set<Id>>, key: Id, id: Id): void => {
  let s = m.get(key);
  if (!s) m.set(key, (s = new Set()));
  s.add(id);
};
const drop = (m: Map<Id, Set<Id>>, key: Id, id: Id): void => {
  const s = m.get(key);
  if (!s) return;
  s.delete(id);
  if (!s.size) m.delete(key);
};

function build(npcs: Record<Id, Npc>): Index {
  const ix: Index = { byLoc: new Map(), byHaunt: new Map(), byName: new Map(), order: new Map(), next: 0 };
  for (const n of Object.values(npcs)) {
    ix.order.set(n.id, ix.next++);
    put(ix.byLoc, n.locationId, n.id);
    put(ix.byName, n.name, n.id);
    for (const loc of Object.keys(n.haunts ?? {})) put(ix.byHaunt, loc, n.id);
  }
  return ix;
}

function index(w: Population): Index {
  let ix = indexes.get(w.npcs);
  if (!ix) indexes.set(w.npcs, (ix = build(w.npcs)));
  return ix;
}

/** Throw the indexes away. Call it after replacing `w.npcs` wholesale (anything that isn't `addNpc` and friends). */
export function rebuildIndex(w: Population): void {
  indexes.delete(w.npcs);
}

const inOrder = (ix: Index, ids: Iterable<Id>): Id[] => [...ids].sort((a, b) => (ix.order.get(a) ?? 0) - (ix.order.get(b) ?? 0));

export const getNpc = (w: Population, id: Id): Npc | undefined => w.npcs[id];

/** Everyone in the world, oldest first. Prefer the targeted lookups below. */
export const allNpcs = (w: Population): Npc[] => Object.values(w.npcs);

export function addNpc(w: Population, n: Npc): Npc {
  const ix = index(w);
  const old = w.npcs[n.id];
  if (old) {
    drop(ix.byLoc, old.locationId, old.id);
    drop(ix.byName, old.name, old.id);
    for (const loc of Object.keys(old.haunts ?? {})) drop(ix.byHaunt, loc, old.id);
  } else {
    ix.order.set(n.id, ix.next++);
  }
  w.npcs[n.id] = n;
  put(ix.byLoc, n.locationId, n.id);
  put(ix.byName, n.name, n.id);
  for (const loc of Object.keys(n.haunts ?? {})) put(ix.byHaunt, loc, n.id);
  return n;
}

/** Take someone out of the world for good (only ephemeral people, and only when nothing refers to them). */
export function removeNpc(w: Population, id: Id): void {
  const n = w.npcs[id];
  if (!n) return;
  const ix = index(w);
  drop(ix.byLoc, n.locationId, id);
  drop(ix.byName, n.name, id);
  for (const loc of Object.keys(n.haunts ?? {})) drop(ix.byHaunt, loc, id);
  ix.order.delete(id);
  delete w.npcs[id];
}

/** The only way an NPC changes place. */
export function moveNpc(w: Population, n: Npc, to: Id): void {
  if (n.locationId === to) return;
  const ix = index(w);
  drop(ix.byLoc, n.locationId, n.id);
  (n as { locationId: Id }).locationId = to;
  put(ix.byLoc, to, n.id);
}

/** Change what somebody is called. The name index has to follow, so this is the only way to do it. */
export function renameNpc(w: Population, n: Npc, name: string): void {
  if (n.name === name) return;
  const ix = index(w);
  drop(ix.byName, n.name, n.id);
  n.name = name;
  put(ix.byName, name, n.id);
}

/** Change where somebody turns up. */
export function setHaunts(w: Population, n: Npc, haunts: Record<Id, number> | undefined): void {
  const ix = index(w);
  for (const loc of Object.keys(n.haunts ?? {})) drop(ix.byHaunt, loc, n.id);
  if (haunts) n.haunts = haunts;
  else delete n.haunts;
  for (const loc of Object.keys(n.haunts ?? {})) put(ix.byHaunt, loc, n.id);
}

/**
 * Who a name in the text refers to. Names repeat, so prefer someone in the room with her, then
 * anyone alive, then anyone at all.
 */
export function npcNamed(w: World, name: string): Npc | undefined {
  const ids = index(w).byName.get(name);
  if (!ids) return undefined;
  const people = [...ids].map((id) => w.npcs[id]!);
  return people.find((n) => n.locationId === w.hero.locationId) ?? people.find((n) => n.alive) ?? people[0];
}

/** Everyone standing in a place, conscious or not, alive or not. */
export const everyoneAt = (w: Population, loc: Id): Npc[] => {
  const ix = index(w);
  return inOrder(ix, ix.byLoc.get(loc) ?? []).map((id) => w.npcs[id]!);
};

/**
 * The people actually there to deal with: alive and on their feet. Somebody posted in a dungeon who hasn't noticed her
 * isn't one of them: they are part of the building until they come at her (see dungeons.ts).
 */
export const npcsAt = (w: World, loc: Id): Npc[] => everyoneAt(w, loc).filter((n) => n.alive && n.downUntil <= w.beat && (!n.post || n.hostile));

/** Who turns up in a place from time to time (and isn't necessarily there now). */
export const hauntersOf = (w: Population, loc: Id): Npc[] => {
  const ix = index(w);
  return inOrder(ix, ix.byHaunt.get(loc) ?? []).map((id) => w.npcs[id]!);
};

/** People off the known map, free to be cast into somewhere new. */
export const awayNpcs = (w: Population): Npc[] => everyoneAt(w, AWAY).filter((n) => n.alive);

/** Debug aid and test oracle: where the indexes disagree with the records. Empty when all is well. */
export function verifyIndex(w: Population): string[] {
  const ix = index(w);
  const bad: string[] = [];
  const seen = new Set<Id>();
  for (const [loc, ids] of ix.byLoc) {
    for (const id of ids) {
      seen.add(id);
      const n = w.npcs[id];
      if (!n) bad.push(`${id} is indexed at ${loc} but gone`);
      else if (n.locationId !== loc) bad.push(`${id} is indexed at ${loc} but stands at ${n.locationId}`);
    }
  }
  for (const n of Object.values(w.npcs)) if (!seen.has(n.id)) bad.push(`${n.id} is not indexed`);
  for (const [name, ids] of ix.byName) for (const id of ids) if (w.npcs[id]?.name !== name) bad.push(`${id} is indexed as ${name} but isn't called that`);
  for (const n of Object.values(w.npcs)) if (!ix.byName.get(n.name)?.has(n.id)) bad.push(`${n.id} is not indexed by name`);
  for (const [loc, ids] of ix.byHaunt) for (const id of ids) if (!w.npcs[id]?.haunts?.[loc]) bad.push(`${id} is indexed as haunting ${loc} but doesn't`);
  for (const n of Object.values(w.npcs)) for (const loc of Object.keys(n.haunts ?? {})) if (!ix.byHaunt.get(loc)?.has(n.id)) bad.push(`${n.id} haunts ${loc} but isn't indexed`);
  return bad;
}
