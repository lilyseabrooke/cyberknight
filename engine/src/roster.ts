import { Rng } from './rng';
import { ARCHETYPES, spawnNpc } from './content/archetypes';
import { influenceOf, pickFaction } from './factions';
import { AWAY, addNpc, awayNpcs, moveNpc, setHaunts } from './population';
import { BARKS } from './content/hazards';
import type { Id, Location, Npc, World } from './types';

/**
 * A place is described by what kind of place it is, not by a list of names. When Blackbird first
 * sees one, `populate` turns that description into people.
 *
 * Each slot is a stand-in for one particular person, with a stable id built from the place and the
 * slot (`bartender@roadhouse_3.0.0`). That one choice does most of the work:
 *
 *  - the same place always gets the same people, whatever order the world was explored in;
 *  - asking twice never makes twins;
 *  - a person who was killed stays dead rather than being rerolled;
 *  - a vacancy can be filled by somebody who already exists (cast from the pool of people who are
 *    off the map) before anybody new is made, so the world has continuity.
 */

export interface SlotDef {
  /** Archetype to fill the slot with. */
  role: string;
  count: [number, number];
  /** Chance the slot exists at all (default 1). */
  chance?: number;
  /** Only in places at least this secure. */
  minSecurity?: number;
  /**
   * Where their faction comes from. `influence`: drawn from the factions leaning on the place
   * (gang members). `venue`: the place's own faction, if it has one. Otherwise the archetype's default.
   */
  faction?: 'influence' | 'venue';
  /** Bystanders: nobody who matters until something makes them matter. */
  ephemeral?: boolean;
  /** Works here and stays here. Everyone else wanders to the neighbouring rooms. */
  resident?: boolean;
}

export const ROSTERS: Record<Location['kind'], SlotDef[]> = {
  bar: [
    { role: 'bartender', count: [1, 1], faction: 'venue', resident: true },
    { role: 'bouncer', count: [1, 1], minSecurity: 2, faction: 'venue', resident: true },
    { role: 'patron', count: [2, 5], ephemeral: true },
    { role: 'ganger', count: [0, 2], chance: 0.6, faction: 'influence' },
    { role: 'cop', count: [1, 1], chance: 0.15 },
  ],
  street: [
    { role: 'drifter', count: [1, 3], ephemeral: true },
    { role: 'street_kid', count: [1, 2], chance: 0.4, ephemeral: true },
    { role: 'noodler', count: [1, 1], chance: 0.3, resident: true },
    { role: 'ganger', count: [1, 2], chance: 0.4, faction: 'influence' },
    { role: 'drone', count: [1, 1], chance: 0.5, minSecurity: 2 },
  ],
  club: [
    { role: 'club_security', count: [1, 3], faction: 'venue', resident: true },
    { role: 'dancer', count: [1, 3], faction: 'venue', resident: true },
    { role: 'dj', count: [1, 1], chance: 0.5, faction: 'venue', resident: true },
    { role: 'patron', count: [2, 4], ephemeral: true },
  ],
  shop: [{ role: 'shopkeeper', count: [1, 1], faction: 'venue', resident: true }],
  // A street clinic: a doc or two behind a counter, and whatever automation the neighbourhood could afford to keep the
  // desperate and the dangerous off them. The guards ignore her until somebody starts something.
  clinic: [
    { role: 'doc', count: [1, 2], resident: true },
    { role: 'guard_dog', count: [1, 2], chance: 0.6, resident: true },
    { role: 'sentry_turret', count: [1, 1], chance: 0.5, resident: true },
    { role: 'patron', count: [0, 2], ephemeral: true },
  ],
  corp: [
    { role: 'helix_guard', count: [1, 2], minSecurity: 5, resident: true },
    { role: 'scientist', count: [1, 1], chance: 0.4, resident: true },
  ],
  tunnel: [{ role: 'scrapper', count: [1, 1], chance: 0.5 }],
  boss: [],
  home: [],
  lair: [], // dungeons furnish their own rooms; see dungeons.ts
};

/** Chance a vacancy is filled by somebody who already exists, when there's a fit. */
const CAST_CHANCE = 0.5;

export const slotId = (role: string, loc: Id, slot: number, j: number): Id => `${role}@${loc}.${slot}.${j}`;

/**
 * Where a wanderer turns up: their own place most of the time, the rooms next to it now and then.
 * Gated and hidden exits are left out; people don't wander through a locked door.
 */
export function wanderHaunts(w: World, loc: Location): Record<Id, number> {
  const haunts: Record<Id, number> = { [loc.id]: 4 };
  for (const e of loc.exits) {
    const to = w.locations[e.to];
    if (!to || e.hidden || e.gate || to.kind === 'home' || to.kind === 'boss' || to.kind === 'corp') continue;
    haunts[to.id] = (haunts[to.id] ?? 0) + 1;
  }
  return haunts;
}

/** Make somebody belong to a place: their home, and where they turn up. */
export function rehome(w: World, n: Npc, loc: Location, resident: boolean): void {
  n.home = loc.id;
  setHaunts(w, n, resident ? { [loc.id]: 1 } : wanderHaunts(w, loc));
  n.settledAt = w.clock;
}

/** People off the map who could take this vacancy: right kind of person, and not an enemy of whoever's in charge. */
function pool(w: World, role: string, faction: Id | null): Npc[] {
  return awayNpcs(w).filter((n) => n.archetype === role && !n.hostile && (faction === null || n.faction === null || n.faction === faction));
}

/**
 * Fill a place the first time it matters. Safe to call again: it does nothing the second time.
 * Returns the people who ended up standing there now.
 */
export function populate(w: World, loc: Location): Npc[] {
  if (loc.populated) return [];
  loc.populated = true;
  const roster = ROSTERS[loc.kind] ?? [];
  const here: Npc[] = [];
  roster.forEach((slot, si) => {
    if (slot.minSecurity !== undefined && loc.security < slot.minSecurity) return;
    const rng = new Rng(`slot:${w.worldSeed}:${loc.id}:${si}`);
    if (slot.chance !== undefined && !rng.chance(slot.chance)) return;
    const n = rng.int(slot.count[0], slot.count[1]);
    for (let j = 0; j < n; j++) {
      const id = slotId(slot.role, loc.id, si, j);
      const existing = w.npcs[id];
      if (existing) {
        // Already made (a persisted world being looked at again). Dead stays dead; away stays away.
        if (existing.locationId === loc.id && existing.alive) here.push(existing);
        continue;
      }
      const person = new Rng(`npc:${w.worldSeed}:${id}`);
      const def = ARCHETYPES[slot.role];
      if (!def) throw new Error(`roster for ${loc.kind} names unknown archetype ${slot.role}`);
      let faction: Id | null = def.faction;
      if (slot.faction === 'influence') faction = pickFaction(w, person, influenceOf(loc), ['gang']) ?? faction;
      else if (slot.faction === 'venue' && loc.faction) faction = loc.faction;
      const fit = pool(w, slot.role, faction);
      if (fit.length && person.chance(CAST_CHANCE)) {
        const cast = person.pick(fit);
        moveNpc(w, cast, loc.id);
        rehome(w, cast, loc, !!slot.resident);
        here.push(cast);
        continue;
      }
      const npc = spawnNpc(person, id, slot.role, loc.id, { faction: faction ?? undefined });
      if (slot.ephemeral) npc.ephemeral = true;
      // A clinic's dogs are as good as its street can afford (the same BARK models homes keep).
      if (loc.kind === 'clinic' && slot.role === 'guard_dog') {
        const bark = BARKS[Math.max(0, Math.min(BARKS.length - 2, loc.security - 2 + person.int(-1, 1)))]!;
        npc.name = `BARK-${bark.model}`;
        npc.hp = npc.maxHp = bark.hp;
        npc.power = bark.power;
      }
      addNpc(w, npc);
      rehome(w, npc, loc, !!slot.resident);
      here.push(npc);
    }
  });
  return here;
}

/** Send somebody off the known map. They can be cast into a newly discovered place later. */
export function sendAway(w: World, n: Npc): void {
  moveNpc(w, n, AWAY);
  setHaunts(w, n, undefined);
  delete n.home;
}
