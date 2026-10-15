import { Rng } from './rng';
import { rollNpcName, spawnNpc } from './content/archetypes';
import { remember } from './combat';
import { addNpc, everyoneAt } from './population';
import { defaultOpinion } from './factions';
import type { Ctx, Gender, Id, Npc, Stub, Tie, TieKind, World } from './types';

/**
 * Who cares about whom. A sparse graph: a person has a handful of ties (family, friends, rivals,
 * a crew, a boss, a partner) and nobody has an opinion of everybody. Where there's no tie, the
 * default opinion comes from the factions (see factions.ts).
 *
 * Ties point at people who may not exist yet. A sister, an old partner, a mentor who died: they're
 * `Stub`s, names with an age and a job and nothing else, until the world needs them in a room
 * (`materialize`), at which point they become people and every tie to them follows.
 *
 * Ties are directed, because feelings are: what Dex thinks of Mox isn't what Mox thinks of Dex.
 */

export const isStub = (id: Id): boolean => id.startsWith('stub:');

// ===================================================================== the store

interface Index {
  into: Map<Id, Tie[]>;
  outOf: Map<Id, Tie[]>;
}
const indexes = new WeakMap<Tie[], Index>();

function index(w: Pick<World, 'ties'>): Index {
  let ix = indexes.get(w.ties);
  if (!ix) {
    ix = { into: new Map(), outOf: new Map() };
    for (const t of w.ties) add(ix, t);
    indexes.set(w.ties, ix);
  }
  return ix;
}
function add(ix: Index, t: Tie): void {
  (ix.into.get(t.to) ?? ix.into.set(t.to, []).get(t.to)!).push(t);
  (ix.outOf.get(t.from) ?? ix.outOf.set(t.from, []).get(t.from)!).push(t);
}
const drop = (ix: Index, t: Tie): void => {
  for (const m of [ix.into.get(t.to), ix.outOf.get(t.from)]) {
    const i = m ? m.indexOf(t) : -1;
    if (m && i >= 0) m.splice(i, 1);
  }
};

/** How `from` feels about `to`: the ties that start at `from`. */
export const tiesFrom = (w: Pick<World, 'ties'>, id: Id): Tie[] => index(w).outOf.get(id) ?? [];
/** Who has feelings about `to`: the ties that end at `to`. */
export const tiesInto = (w: Pick<World, 'ties'>, id: Id): Tie[] => index(w).into.get(id) ?? [];

/** One directed tie. Replaces an existing tie of the same kind between the same two. */
export function tie(w: Pick<World, 'ties'>, from: Id, to: Id, kind: TieKind, regard: number): Tie {
  const ix = index(w);
  const old = (ix.outOf.get(from) ?? []).find((t) => t.to === to && t.kind === kind);
  if (old) {
    old.regard = regard;
    return old;
  }
  const t: Tie = { from, to, kind, regard: Math.max(-100, Math.min(100, Math.round(regard))) };
  w.ties.push(t);
  add(ix, t);
  return t;
}

/** Both directions at once. */
export function link(w: Pick<World, 'ties'>, a: Id, b: Id, kind: TieKind, regardAB: number, regardBA = regardAB): void {
  tie(w, a, b, kind, regardAB);
  tie(w, b, a, kind, regardBA);
}

/** How strongly `from` feels about `to`, by the strongest tie between them (0 if none). */
export function regard(w: Pick<World, 'ties'>, from: Id, to: Id): number {
  let best = 0;
  for (const t of tiesFrom(w, from)) if (t.to === to && Math.abs(t.regard) > Math.abs(best)) best = t.regard;
  return best;
}

/** What `a` makes of `b`: a personal tie if there is one, otherwise what their factions suggest. */
export function opinionOf(w: World, a: Npc, b: Npc): number {
  const personal = regard(w, a.id, b.id);
  return personal !== 0 ? personal : defaultOpinion(w, a, b);
}

/** Take a person's ties out of the graph (when they're removed from the world for good). */
export function forgetTies(w: Pick<World, 'ties'>, id: Id): void {
  const ix = index(w);
  for (const t of [...tiesFrom(w, id), ...tiesInto(w, id)]) {
    drop(ix, t);
    const i = w.ties.indexOf(t);
    if (i >= 0) w.ties.splice(i, 1);
  }
}

// ===================================================================== people who don't exist yet

/** Who a name in an id refers to: a person, or a stub. */
export function nameOf(w: Pick<World, 'npcs' | 'stubs'>, id: Id): string {
  return w.npcs[id]?.name ?? w.stubs[id]?.name ?? 'somebody';
}

export function makeStub(w: Pick<World, 'stubs'>, stub: Omit<Stub, 'id'> & { id?: Id }, key: string): Stub {
  const id = stub.id ?? `stub:${key}`;
  const s: Stub = { ...stub, id };
  w.stubs[id] = s;
  return s;
}

/**
 * Bring a stub into the world as a person, standing in a place. Every tie and fact that pointed at
 * the stub points at the person now.
 */
export function materialize(w: World, stubId: Id, locationId: Id): Npc | undefined {
  const stub = w.stubs[stubId];
  if (!stub) return undefined;
  const id = stubId.slice('stub:'.length);
  const npc = spawnNpc(new Rng(`stub:${w.worldSeed}:${id}`), id, stub.archetype, locationId, { name: stub.name, gender: stub.gender, age: stub.age, faction: stub.faction ?? undefined });
  addNpc(w, npc);
  delete w.stubs[stubId];
  const ix = index(w);
  for (const t of [...tiesFrom(w, stubId), ...tiesInto(w, stubId)]) {
    drop(ix, t);
    if (t.from === stubId) t.from = id;
    if (t.to === stubId) t.to = id;
    add(ix, t);
  }
  for (const n of Object.values(w.npcs)) for (const f of n.facts ?? []) if (f.about === stubId) f.about = id;
  return npc;
}

// ===================================================================== rolling a person's ties

const RELATIVES: { word: string; age: [number, number]; chance: number }[] = [
  { word: 'sibling', age: [-8, 8], chance: 4 },
  { word: 'parent', age: [20, 32], chance: 2 },
  { word: 'child', age: [-32, -20], chance: 1 },
  { word: 'cousin', age: [-10, 10], chance: 1 },
];

const peers = (w: World, n: Npc): Npc[] =>
  everyoneAt(w, n.locationId).filter(
    (p) => p.id !== n.id && p.alive && p.gender !== 'none' && !p.tags.some((t) => ['robot', 'boss', 'dragon', 'pet'].includes(t)) && p.archetype !== 'puppy' && !p.id.startsWith('tmp_'),
  );

/** Give a person a handful of ties, from who's around them and from people who aren't here at all. Deterministic. */
export function rollTies(w: World, n: Npc): void {
  const rng = new Rng(`ties:${w.worldSeed}:${n.id}:${n.name}`);
  const have = new Set(tiesFrom(w, n.id).map((t) => t.to));
  const around = peers(w, n).filter((p) => !have.has(p.id));
  const count = rng.weighted([0, 1, 2, 3], (k) => [0.2, 0.4, 0.3, 0.1][k]!);
  const surname = n.name.split(' ').slice(1).join(' ');
  for (let i = 0; i < count; i++) {
    const kind = rng.weighted<TieKind>(['kin', 'friend', 'rival', 'crew', 'boss'], (k) => {
      if (k === 'crew') return n.faction && around.some((p) => p.faction === n.faction) ? 3 : 0;
      if (k === 'boss') return n.tags.includes('staff') && around.some((p) => p.tags.includes('owner')) ? 4 : 0;
      if (k === 'rival') return around.length ? 1.5 : 0;
      if (k === 'friend') return around.length ? 3 : 0;
      return 2.5;
    });
    if (kind === 'kin') {
      const rel = rng.weighted(RELATIVES, (r) => r.chance);
      const age = Math.max(18, n.age + rng.int(rel.age[0], rel.age[1]));
      const first = rollNpcName(rng, 'person').split(' ')[0]!;
      const gender: Gender = rng.chance(0.47) ? 'woman' : rng.chance(0.94) ? 'man' : 'nonbinary';
      const stub = makeStub(w, { name: surname ? `${first} ${surname}` : first, gender, age, archetype: rng.pick(['patron', 'drifter', 'noodler', 'cook']), faction: rng.chance(0.4) ? n.faction : null, lastKnown: undefined }, `kin_${n.id}_${i}`);
      stub.name = stub.name.trim();
      link(w, n.id, stub.id, 'kin', rng.int(35, 85), rng.int(35, 85));
      continue;
    }
    let other: Npc | undefined;
    if (kind === 'crew') other = rng.pick(around.filter((p) => p.faction === n.faction));
    else if (kind === 'boss') other = rng.pick(around.filter((p) => p.tags.includes('owner')));
    else other = around.length ? rng.pick(around) : undefined;
    if (!other) continue;
    around.splice(around.indexOf(other), 1);
    if (kind === 'crew') link(w, n.id, other.id, 'crew', rng.int(25, 65), rng.int(25, 65));
    else if (kind === 'boss') link(w, n.id, other.id, 'boss', rng.int(-10, 55), rng.int(20, 60));
    else if (kind === 'friend') link(w, n.id, other.id, 'friend', rng.int(30, 75), rng.int(30, 75));
    else link(w, n.id, other.id, 'rival', -rng.int(25, 70), -rng.int(15, 70));
  }
}

// ===================================================================== word getting around

type Deed = 'hurt' | 'killed' | 'helped';
const STRENGTH: Record<Deed, number> = { hurt: 14, killed: 30, helped: 12 };
const VERB: Record<Deed, string> = { hurt: 'hurt', killed: 'killed', helped: 'helped' };

/**
 * Blackbird did something to someone, and the people who care about them hear. A friend takes it
 * badly; a rival is quietly pleased. It goes a step further to kin and partners of those who
 * heard, fainter. The change in how they feel is in proportion to the tie, and it's remembered,
 * so the next time she meets them it can come up.
 */
export function spreadDeed(c: Ctx, victim: Npc, deed: Deed): void {
  const { w } = c;
  const sign = deed === 'helped' ? 1 : -1;
  const seen = new Set<Id>([victim.id]);
  // `feel` is how the hearer feels about the victim; `weight` thins it out the further the word travels.
  const touch = (id: Id, feel: number, weight: number): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const m = w.npcs[id];
    if (!m || !m.alive || m.tags.includes('robot') || Math.abs(feel) < 15) return;
    const delta = Math.round((sign * feel * STRENGTH[deed] * weight) / 100);
    if (delta === 0) return;
    m.affinity += delta;
    if (Math.abs(delta) < 4) return;
    remember(m, `heard Blackbird ${VERB[deed]} ${victim.name}`);
    (m.heard ??= []).push([victim.id, deed, w.clock]);
    if (m.heard.length > 6) m.heard.shift();
    // The ones who loved them most don't let it go.
    if (deed !== 'helped' && delta <= -9 && weight === 1 && feel >= 55 && !m.flags.includes('avenger')) m.flags.push('avenger');
    // Family and partners tell their own.
    if (weight === 1) for (const t of tiesFrom(w, id)) if ((t.kind === 'kin' || t.kind === 'partner') && t.regard >= 40 && !isStub(t.to)) touch(t.to, t.regard * Math.sign(feel), 0.5);
  };
  for (const t of tiesInto(w, victim.id)) touch(t.from, t.regard, 1);
}

/** Who a person has ties to that are real, alive and not hostile, for gossip. */
export function neighboursOf(w: World, id: Id): { tie: Tie; person?: Npc; stub?: Stub }[] {
  return tiesFrom(w, id).map((t) => ({ tie: t, person: w.npcs[t.to], stub: w.stubs[t.to] })).filter((x) => x.person || x.stub);
}
