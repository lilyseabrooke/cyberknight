import { Rng } from './rng';
import type { Ctx, Exit, Id, Location, Npc, World } from './types';
import { addHeat, fight, here, relocate } from './combat';
import { spawnGroup } from './candidate';
import { addDwelling, dwellingFor, expand } from './mapgen';
import { routeTo } from './plans';
import { hasImplantFlag } from './skills';
import { moveNpc } from './population';

/**
 * Where people live. Nobody's address is public: Blackbird learns it by going home with them (romance.ts) or by
 * reading it off them with an address scanner. Once she knows it, and the person has somewhere worth robbing, she can
 * go and burgle it: the dwelling is put on the map the first time anyone needs it (growing the city out to meet it),
 * she walks there, and whatever happens happens inside it.
 */

const KNOWN = 'home_known';

export const knowsHome = (n: Npc): boolean => n.flags.includes(KNOWN);
export function learnHome(n: Npc): void {
  if (!knowsHome(n)) n.flags.push(KNOWN);
}

/** Someone with an address worth the question. */
const resident = (n: Npc): boolean => n.alive && !n.id.startsWith('tmp_') && !['kid', 'robot', 'pet', 'dragon'].some((t) => n.tags.includes(t)) && n.archetype !== 'puppy';

/** An address scanner reads where anybody lives, just by looking at them. */
export function scanHomes(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  if (!hasImplantFlag(h, 'home_scan') || h.injuries.includes('fried_optics')) return;
  let told = 0;
  for (const n of here(w)) {
    if (!resident(n) || n.hostile || knowsHome(n)) continue;
    learnHome(n);
    if (told++ < 2) c.emit('home_scan', 'good', { npc: n.name, role: n.role });
  }
}

// ===================================================================== the dwelling

/** Streets she can walk to without a fight at a door: not hidden, not gated, and nothing but streets in between. */
const onTheStreets = (e: Exit, into: Location): boolean => !e.gate && into.outdoors;
/** The last stretch goes through the building's own doors. */
const upTheStairs = (e: Exit, into: Location): boolean => !e.gate && (into.outdoors || into.kind === 'home');

function reach(w: World, from: Id): Map<Id, number> {
  const seen = new Map<Id, number>([[from, 0]]);
  const open: Id[] = [from];
  for (let i = 0; i < open.length; i++) {
    const id = open[i]!;
    for (const e of w.locations[id]?.exits ?? []) {
      const into = w.locations[e.to];
      if (!into || e.hidden || seen.has(e.to) || !onTheStreets(e, into)) continue;
      seen.set(e.to, seen.get(id)! + 1);
      open.push(e.to);
    }
  }
  return seen;
}

const RICH = ['corporate', 'market', 'nightlife'];
const POOR = ['tenement', 'slum', 'industrial', 'market'];

/** A street for them to live on: a few blocks off, in the sort of district they could afford. Grows the map if it has to. */
function streetFor(c: Ctx, n: Npc, rich: boolean): Location {
  const { w } = c;
  const rng = new Rng(`home:${w.worldSeed}:${n.id}`);
  const goal = rng.int(3, 6);
  let seen = reach(w, w.hero.locationId);
  const streets = () => [...seen].map(([id, d]) => [w.locations[id]!, d] as const).filter(([l, d]) => l.gen?.role === 'street' && d >= 2);
  for (let round = 0; round < 6 && !streets().some(([, d]) => d >= goal); round++) {
    // Not far enough out yet: the city grows toward it.
    const edge = [...seen].filter(([id]) => w.locations[id]!.gen && !w.locations[id]!.gen!.expanded).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!edge.length) break;
    for (const [id] of edge) expand(w, w.locations[id]!);
    seen = reach(w, w.hero.locationId);
  }
  const options = streets();
  if (!options.length) {
    const fallback = [...seen].map(([id]) => w.locations[id]!).filter((l) => l.outdoors && l.id !== w.hero.locationId);
    return fallback[0] ?? w.locations[w.locations[w.hero.locationId]!.tossTo]!;
  }
  const want = rich ? RICH : POOR;
  return rng.weighted(options, ([l, d]) => (want.includes(l.gen!.district) ? 3 : 1) / (1 + Math.abs(d - goal)))[0];
}

const isCorp = (n: Npc): boolean => n.tags.includes('corp') || n.archetype === 'heir' || n.archetype === 'corpo';

/** Where they sleep. Made the first time anyone needs it, then it's there for good. */
export function residenceOf(c: Ctx, n: Npc): Location {
  const { w } = c;
  const have = n.residence ? w.locations[n.residence] : undefined;
  if (have) return have;
  const size = dwellingFor(n.cash, isCorp(n));
  const home = addDwelling(w, streetFor(c, n, size !== 'capsule'), n, size);
  n.residence = home.id;
  return home;
}

// ===================================================================== getting there

/** Walk to a place by the streets. Something might happen on the way; true if she got there. */
export function walkTo(c: Ctx, to: Id, why: Npc): boolean {
  const { w, rng } = c;
  const h = w.hero;
  let ambushed = false;
  for (let step = 0; step < 60 && !w.over; step++) {
    if (h.locationId === to) return true;
    const r = routeTo(w, h.locationId, to, upTheStairs);
    if (!r) return false;
    relocate(w, r.next);
    const loc = w.locations[h.locationId]!;
    if (h.locationId === to || ambushed || !loc.outdoors || !rng.chance(0.1 + (loc.territory ? 0.08 : 0) + 0.015 * (w.heat.npd ?? 0))) continue;
    ambushed = true;
    const gang = loc.territory;
    const foes = spawnGroup(c, gang ? 'ganger' : 'mugger', rng.int(1, 2), gang ?? undefined);
    c.emit('burgle_ambush', 'bad', { variant: gang ? 'gang' : 'mugger', npc: why.name, place: loc.name, count: foes.length });
    const res = fight(c, foes, { cause: `an ambush on the way to ${why.name}'s place`, joiners: false });
    if (w.over || res !== 'win' || h.locationId !== loc.id) return false;
  }
  return false;
}

/** After the job: out of the building and onto the street. */
export function leaveHome(c: Ctx, home: Location): void {
  const { w } = c;
  const h = w.hero;
  if (!w.over && (h.locationId === home.id || h.locationId === home.fleeTo)) relocate(w, home.tossTo);
}

/** The owner came home early: they are here now, and they will go back where they were once it's over. */
export function ownerComesHome(c: Ctx, n: Npc, home: Location, o: { cause: string }): void {
  const { w } = c;
  const origin = n.locationId;
  addHeat(w, 'npd', 2);
  moveNpc(w, n, home.id);
  fight(c, [n], { cause: o.cause, assault: true, joiners: false });
  if (n.alive && n.locationId === home.id) moveNpc(w, n, origin);
}
