import { Rng, hashString } from './rng';
import type { Candidate } from './candidate';
import type { Cache, CacheKind, Ctx, Dungeon, DungeonKind, DungeonRoom, Id, Item, Location, Npc, World } from './types';
import { acquire, addHeat, fight, gainXp, heroPower, relocate, remember, type FightResult } from './combat';
import { spawnNpc } from './content/archetypes';
import { makeAmmoBox, makeItem } from './content/items';
import {
  ARMOR_BY_TIER, ATLAS_HEAT_ON_ALARM, ATLAS_HEAT_ON_CLEAR, CACHE_LABEL, DATA_LOOT, LEADER_ARMS, STASH_LOOT, TIER_MENACE, cacheValue, layoutFor, rollRoomHazards, scaleForTier, slotCount,
  type RoomDef,
} from './content/dungeons';
import { addChamber } from './mapgen';
import { addNpc, everyoneAt, moveNpc, removeNpc } from './population';
import { sendAway } from './roster';
import { rating } from './weapons';
import { genWeapon } from './weapons';
import { gunsOwned } from './arms';
import { meetHazards } from './hazards';
import { sneakBonus } from './extras';
import { skillLevel, train } from './skills';
import { startRaid } from './goals';

/**
 * Dungeons: Atlas outposts and ganger hideouts. A building on a street with rooms behind the door, a garrison in the
 * rooms, traps and dogs in the corridors and spoils in the corners (the tables are in content/dungeons.ts).
 *
 * **Made on arrival, kept for good.** The entrance is an ordinary generated lot (mapgen.ts) with a tier already rolled.
 * The first time anyone walks in, `ensureDungeon` builds the rest from that tier alone: the rooms, who is posted in
 * each, what is lying around and what is rigged. Ids come from the entrance and the garrisoning number, so the same
 * save builds the same place whatever order things were found in.
 *
 * **What she meets.** Walking into a room (`enterRoom`) is the whole encounter: whatever the room keeps against
 * intruders goes first (dogs, traps: hazards.ts), then the garrison gets a chance to notice her. If they do it's a
 * fight, and the noise draws people from the next rooms. If they don't she is in a room full of people who haven't
 * seen her: she can ambush them, rob the place under their noses, or walk on. Posted people who haven't noticed her
 * aren't "here" as far as anything else in the game is concerned (see `npcsAt`).
 *
 * **Held, cleared, held again.** When the last of the garrison is dead (or has run for it) the place is cleared. It
 * stays empty for a couple of runs and is then garrisoned afresh (new people, new spoils, traps reset).
 */

/** Runs a cleared place stays empty. */
const EMPTY_FOR: [number, number] = [2, 3];
/** The most people one fight puts on the board. The rest wade in afterwards, if she's still standing. */
const MAX_FOES = 6;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export type Realm = Pick<World, 'worldSeed' | 'npcs' | 'ties' | 'locations' | 'factions' | 'dungeons' | 'legacy'>;

// ===================================================================== finding things

export const dungeonOf = (w: Pick<World, 'dungeons'>, loc: Location | undefined): Dungeon | undefined => (loc?.dungeon ? w.dungeons[loc.dungeon] : undefined);
export const roomOf = (d: Dungeon, id: Id): DungeonRoom | undefined => d.rooms.find((r) => r.id === id);
export const isEntrance = (loc: Location): boolean => !!loc.dungeon && loc.dungeon === loc.id;

/** Everyone posted here who is still alive, wherever in the building they are now. */
export const garrisonAlive = (w: Pick<World, 'npcs'>, d: Dungeon): Npc[] => d.garrison.map((id) => w.npcs[id]).filter((n): n is Npc => !!n && n.alive && n.post === d.id);

/** Posted people standing in this room who could take part in a fight right now. */
export const standing = (w: World, d: Dungeon, room: Id): Npc[] => everyoneAt(w, room).filter((n) => n.alive && n.post === d.id && n.downUntil <= w.beat);

/** The rooms next door, inside the same building. */
const neighbours = (w: Pick<World, 'locations'>, d: Dungeon, room: Id): Id[] => (w.locations[room]?.exits ?? []).map((e) => e.to).filter((id) => !!roomOf(d, id));

// ===================================================================== building one

/** Make the inside of a dungeon the first time anyone arrives at its door. Idempotent. */
export function ensureDungeon(w: Realm, entrance: Location): Dungeon | undefined {
  if (!isEntrance(entrance) || !entrance.gen) return undefined;
  const have = w.dungeons[entrance.id];
  if (have) return have;
  const kind = entrance.gen.role as DungeonKind;
  const d: Dungeon = {
    id: entrance.id,
    kind,
    name: entrance.name,
    tier: entrance.gen.tier ?? 1,
    faction: entrance.faction ?? (kind === 'outpost' ? 'atlas' : 'ganger'),
    rooms: [],
    garrison: [],
    occupation: 1,
    alert: 0,
    aware: [],
    clearedRun: null,
    returnsRun: null,
    clears: 0,
  };
  w.dungeons[d.id] = d;
  const placed = new Map<string, Location>();
  layoutFor(kind, d.tier).forEach(({ def, parent }, i) => {
    let loc: Location;
    if (!parent) loc = entrance;
    else {
      const up = placed.get(parent)!;
      const rng = new Rng(`room:${w.worldSeed}:${d.id}:${def.key}`);
      loc = addChamber(w, up, i, {
        name: `${d.name}, ${def.label}`,
        security: clamp(entrance.security + (def.key === 'command' || def.key === 'den' ? 2 : 1), 0, 9),
        blurb: rng.pick(def.blurbs ?? ['{name}.']).replace('{name}', `${d.name.charAt(0).toUpperCase() + d.name.slice(1)}, ${def.label}`),
        label: `a door to the ${def.label}`,
        dungeon: d.id,
      });
      loc.populated = true;
    }
    placed.set(def.key, loc);
    d.rooms.push({ id: loc.id, role: def.key });
    stock(w, d, def, loc);
  });
  return d;
}

/** Swap their weapon for another, and their punch with it. */
function rearm(n: Npc, id: string): void {
  const at = n.loadout.findIndex((i) => i.kind === 'weapon');
  const old = at >= 0 ? n.loadout[at]! : undefined;
  const next = makeItem(id);
  n.power += Math.round(rating(next)) - (old ? Math.round(rating(old)) : 0);
  if (at >= 0) n.loadout[at] = next;
  else n.loadout.unshift(next);
}

/** Fill a room for the dungeon's current garrisoning: its people, what's lying in it and what it keeps against intruders. */
function stock(w: Realm, d: Dungeon, def: RoomDef, loc: Location): void {
  const room = roomOf(d, loc.id)!;
  const rng = new Rng(`stock:${w.worldSeed}:${d.id}:${d.occupation}:${def.key}`);
  let j = 0;
  for (const slot of def.garrison) {
    const count = slotCount(rng, slot, d.tier);
    for (let k = 0; k < count; k++) {
      const id = `dg:${d.id}:${d.occupation}:${def.key}:${j++}`;
      const faction = slot.arch.startsWith('gang_') ? d.faction : slot.arch === 'sentry_turret' ? 'atlas' : undefined;
      const npc = spawnNpc(new Rng(`npc:${w.worldSeed}:${id}`), id, slot.arch, loc.id, { faction });
      // The ones in charge carry what the tier says they should, not what the archetype would give a stranger.
      if (npc.tags.includes('commander')) rearm(npc, new Rng(`arms:${w.worldSeed}:${id}`).pick(LEADER_ARMS[d.tier]!));
      scaleForTier(npc, d.tier);
      npc.post = d.id;
      npc.home = loc.id;
      // The ones in charge have something worth taking off them.
      if (npc.tags.includes('commander') && d.tier >= 2 && rng.chance(0.6)) npc.loadout.push(makeItem(rng.pick(DATA_LOOT[d.tier]!.length ? DATA_LOOT[d.tier]! : ['credchip'])));
      addNpc(w, npc);
      d.garrison.push(id);
    }
  }
  delete room.cache;
  if (def.cache && rng.chance(def.cache.chance)) {
    const kind = rng.pick(def.cache.kinds);
    room.cache = { kind, value: Math.round(cacheValue(kind, d.tier) * (0.85 + rng.next() * 0.3)), taken: false, fails: 0 };
  }
  loc.hazards = rollRoomHazards(new Rng(`rig:${w.worldSeed}:${d.id}:${d.occupation}:${def.key}`), d.kind, d.tier, def.hazard);
}

// ===================================================================== between runs

/**
 * The morning after. Whatever noise she made is forgotten, and anywhere that has been empty long enough is garrisoned
 * again. Called as each run begins (`u.legacy.runs` is this run's number).
 */
export function tickDungeons(u: Realm): Dungeon[] {
  const back: Dungeon[] = [];
  for (const d of Object.values(u.dungeons)) {
    d.alert = 0;
    d.aware = [];
    if (d.clearedRun !== null && d.returnsRun !== null && u.legacy.runs >= d.returnsRun) {
      regarrison(u, d);
      back.push(d);
    }
  }
  return back;
}

/** New people move in, the traps are reset and there's something in the corners again. */
export function regarrison(u: Realm, d: Dungeon): void {
  // The dead are gone. Anyone who got to matter to somebody (a tie, a memory) stays on the books.
  const named = new Set(u.ties.flatMap((t) => [t.from, t.to]));
  for (const id of d.garrison) {
    const n = u.npcs[id];
    if (n && !n.alive && !n.depth && !named.has(id) && !n.memories.length) removeNpc(u, id);
  }
  d.garrison = [];
  d.occupation++;
  d.clearedRun = null;
  d.returnsRun = null;
  const defs = new Map(layoutFor(d.kind, d.tier).map(({ def }) => [def.key, def]));
  for (const room of d.rooms) {
    const loc = u.locations[room.id];
    const def = defs.get(room.role);
    if (loc && def) stock(u, d, def, loc);
  }
}

// ===================================================================== how bad is it

/** What a person is worth in a fight, roughly: how hard they hit and how long they last. */
export const menace = (n: Npc): number => n.power * Math.sqrt(Math.max(1, n.hp));

/** The same for her, as she is right now. */
export const might = (w: World): number => heroPower(w) * Math.sqrt(Math.max(1, w.hero.hp));

/** How bad a fight against these people would be for her: about 1 is a coin toss, well under is a walk, well over is a funeral. */
export function pressure(w: World, foes: Npc[]): number {
  if (!foes.length) return 0;
  return Math.sqrt(foes.reduce((a, n) => a + menace(n) ** 2, 0)) / might(w);
}

/** How well she reads a room she hasn't been in yet: a sharp head hears what's behind a door; a clueless one assumes the best. */
function misread(w: World, room: Id): number {
  const u = 0.3 + 0.7 * ((hashString(`read:${room}`) % 100) / 100);
  return 1 - 0.5 * (1 - w.hero.competence) * u;
}

/** What she thinks of her chances before anyone has seen inside: from the tier alone. */
export const estimatePressure = (w: World, kind: DungeonKind, tier: number): number => (TIER_MENACE[kind][tier] ?? 0) / might(w);

/**
 * How bad a fight she'll take on before she calls it too much. A sharper head has a lower number and is right about it;
 * the brave and the reckless keep going well past the point of sense.
 */
export function tolerance(w: World): number {
  const h = w.hero;
  const t = h.personality.traits;
  return clamp(0.25 + 0.7 * (1 - h.competence) + 0.35 * (t.courage - 0.5) + 0.3 * (t.reckless - 0.5), 0.3, 1.6);
}

/** Her read on a place she knows the inside of: the average room that still has somebody in it, since it's one room at a time. */
export function typicalPressure(w: World, d: Dungeon): number {
  const by = new Map<Id, Npc[]>();
  for (const n of garrisonAlive(w, d)) by.set(n.locationId, [...(by.get(n.locationId) ?? []), n]);
  const rooms = [...by.values()].map((foes) => pressure(w, foes));
  return rooms.length ? rooms.reduce((a, b) => a + b, 0) / rooms.length : 0;
}

// ===================================================================== meeting the garrison

function noticeChance(w: World, d: Dungeon, foes: Npc[]): number {
  const base = d.kind === 'outpost' ? 0.5 : 0.4;
  return clamp(base + 0.04 * d.tier + Math.min(0.2, 0.03 * foes.length) + 0.12 * d.alert - 1.5 * sneakBonus(w), 0.1, 0.95);
}

/** Called as she arrives anywhere. If it's a room in a dungeon, this is where whatever is in it finds out about her. */
export function enterRoom(c: Ctx, loc: Location): void {
  const { w, rng } = c;
  const d = dungeonOf(w, loc);
  if (!d) return;
  // However she came to be here, she is raiding now.
  startRaid(c, d, 'wandered_in');
  // What the place keeps against people who let themselves in goes first.
  if (!meetHazards(c, loc)) {
    if (!w.over && w.hero.locationId === loc.id) {
      relocate(w, loc.fleeTo);
      c.emit('dungeon_pulled_back', 'mixed', { place: loc.name, kind: d.kind });
    }
    return;
  }
  if (w.over) return;
  const foes = standing(w, d, loc.id);
  if (!foes.length) return;
  if (d.aware.includes(loc.id) || rng.chance(noticeChance(w, d, foes))) {
    raiseAlarm(c, d, loc, 'seen');
    return;
  }
  c.emit('dungeon_unseen', 'mixed', { kind: d.kind, place: loc.name, count: foes.length, foes: describe(foes), tier: d.tier });
}

/** "three drones and a trooper", for the log. */
function describe(foes: Npc[]): string {
  const by = new Map<string, number>();
  for (const f of foes) by.set(f.role, (by.get(f.role) ?? 0) + 1);
  const parts = [...by].map(([role, n]) => (n > 1 ? `${n} ${role}s` : `a ${role}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? 'nobody';
}

/** The noise draws people in from next door. Returns who came. */
function pullReinforcements(c: Ctx, d: Dungeon, loc: Location): Npc[] {
  const { w, rng } = c;
  const cap = d.kind === 'hideout' ? 2 + d.tier : 1 + Math.floor(d.tier / 2);
  const p = clamp(0.2 + 0.15 * d.alert + (d.kind === 'hideout' ? 0.15 : 0), 0, 0.85);
  const came: Npc[] = [];
  for (const next of neighbours(w, d, loc.id)) {
    for (const n of standing(w, d, next)) {
      if (came.length >= cap) return came;
      if (!rng.chance(p)) continue;
      moveNpc(w, n, loc.id);
      came.push(n);
    }
  }
  return came;
}

type Why = 'seen' | 'lingered' | 'tripped' | 'ambush';

/** Somebody has noticed her. Fight the room, with whoever else turns up. */
function raiseAlarm(c: Ctx, d: Dungeon, loc: Location, why: Why): FightResult | null {
  const { w } = c;
  const foes = standing(w, d, loc.id);
  if (!foes.length) return null;
  if (d.alert === 0 && d.kind === 'outpost') addHeat(w, 'atlas', ATLAS_HEAT_ON_ALARM);
  d.alert = Math.min(4, d.alert + 1);
  if (!d.aware.includes(loc.id)) d.aware.push(loc.id);
  const came = pullReinforcements(c, d, loc);
  const all = [...foes, ...came];
  c.emit(why === 'ambush' ? 'dungeon_ambush' : 'dungeon_alarm', why === 'ambush' ? 'good' : 'bad', {
    variant: why, kind: d.kind, place: loc.name, site: d.name, count: all.length, foes: describe(all), pulled: came.length, tier: d.tier,
  });
  return fightRoom(c, d, loc, why === 'ambush');
}

/** Fight everyone in the room, in waves of a few if there are a lot of them. */
export function fightRoom(c: Ctx, d: Dungeon, loc: Location, ambush: boolean): FightResult | null {
  const { w } = c;
  let result: FightResult | null = null;
  for (let wave = 0; wave < 6 && !w.over; wave++) {
    const all = standing(w, d, loc.id);
    if (!all.length) break;
    const batch = all.slice(0, MAX_FOES);
    if (wave > 0) c.emit('dungeon_wave', 'bad', { kind: d.kind, place: loc.name, count: batch.length, foes: describe(batch) });
    result = fight(c, batch, { cause: `raiding ${d.name}`, joiners: false, ambush: ambush && wave === 0 });
    if (result !== 'win') break;
  }
  routed(c, d);
  checkCleared(c, d);
  return result;
}

/** Whoever ran for it is gone for good: out the back and not coming back to a building like this. */
function routed(c: Ctx, d: Dungeon): void {
  const { w } = c;
  for (const n of garrisonAlive(w, d)) {
    if (n.downUntil <= w.beat) continue;
    delete n.post;
    sendAway(w, n);
  }
  d.garrison = d.garrison.filter((id) => w.npcs[id]?.post === d.id);
}

/** If that was the last of them, the place is cleared. */
export function checkCleared(c: Ctx, d: Dungeon): boolean {
  const { w } = c;
  if (d.clearedRun !== null) return true;
  if (garrisonAlive(w, d).length) return false;
  d.clearedRun = w.legacy.runs;
  d.clears++;
  d.returnsRun = w.legacy.runs + new Rng(`empty:${w.worldSeed}:${d.id}:${d.occupation}`).int(EMPTY_FOR[0], EMPTY_FOR[1]);
  if (d.kind === 'outpost') addHeat(w, 'atlas', ATLAS_HEAT_ON_CLEAR);
  // Their crew hears about it, wherever they are.
  for (const n of Object.values(w.npcs)) {
    if (!n.alive || n.post || n.faction !== d.faction || d.kind !== 'hideout') continue;
    n.affinity -= 12;
    remember(n, 'heard Blackbird cleaned out their crew\'s hideout');
  }
  w.hero.fame += d.tier >= 3 ? 3 : 1;
  gainXp(c, 12 * d.tier);
  c.emit('dungeon_cleared', 'good', { kind: d.kind, site: d.name, tier: d.tier, runs: d.returnsRun - w.legacy.runs });
  return true;
}

/** Each beat she stays in a room full of people who haven't seen her, they get a little closer to doing so. */
export function dungeonAmbient(c: Ctx): void {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId];
  const d = dungeonOf(w, loc);
  if (!loc || !d) return;
  checkCleared(c, d);
  if (!standing(w, d, loc.id).length || d.clearedRun !== null) return;
  if (rng.chance(0.07 + 0.02 * d.tier + 0.04 * d.alert)) raiseAlarm(c, d, loc, 'lingered');
}

// ===================================================================== what she can do in there

export function dungeonCandidates(w: World): Candidate[] {
  const loc = w.locations[w.hero.locationId];
  const d = dungeonOf(w, loc);
  if (!loc || !d) return [];
  const out: Candidate[] = [];
  const room = roomOf(d, loc.id);
  const foes = standing(w, d, loc.id);
  if (foes.length) {
    const p = pressure(w, foes);
    out.push({
      key: `raid_ambush:${loc.id}`, drives: { bravery: 0.9, pride: 0.5, greed: 0.35 }, bonus: 0.25,
      risk: clamp(p * 1.5 - 0.6, 0, 3.5),
      run: (c) => ambush(c, d, loc),
    });
  }
  if (room?.cache && !room.cache.taken) {
    out.push({
      key: `raid_loot:${loc.id}`, drives: { greed: 1.0, curiosity: 0.3 }, bonus: 0.3, risk: foes.length ? 0.9 : 0.1,
      run: (c) => openCache(c, d, loc, room.cache!),
    });
  }
  return out;
}

function ambush(c: Ctx, d: Dungeon, loc: Location): void {
  raiseAlarm(c, d, loc, 'ambush');
}

/** What it takes to get into each kind of cache. */
const HARD: Record<CacheKind, number> = { supplies: 0, arms: 0.05, armor: 0.05, cash: 0.1, stash: 0.12, data: 0.25, vault: 0.35 };

function openCache(c: Ctx, d: Dungeon, loc: Location, cache: Cache): void {
  const { w, rng } = c;
  const h = w.hero;
  const watched = standing(w, d, loc.id).length > 0;
  const lock = cache.kind === 'data' ? 'tinkering' : 'lockpicking';
  const skill =
    cache.kind === 'data' ? h.hack * 0.05 + skillLevel(h, 'tinkering') * 0.03
    : cache.kind === 'supplies' || cache.kind === 'arms' || cache.kind === 'armor' ? 0.2
    : skillLevel(h, 'lockpicking') * 0.04 + h.hack * 0.02;
  const p = clamp(0.8 - HARD[cache.kind] - 0.03 * d.tier + skill - (watched ? 0.12 : 0), 0.1, 0.95);
  train(c, lock, 2);
  const data = { kind: d.kind, cache: cache.kind, what: CACHE_LABEL[cache.kind], place: loc.name };
  if (rng.chance(p)) {
    cache.taken = true;
    const got = openLoot(c, d, cache);
    train(c, 'sneak', 1);
    c.emit('dungeon_loot', 'good', { ...data, variant: cache.kind, amount: got.cash, item: got.items.slice(0, 2).join(' and '), count: got.items.length, watched });
    return;
  }
  cache.fails++;
  if (cache.fails >= 2) {
    cache.taken = true;
    c.emit('dungeon_loot', 'bad', { ...data, variant: 'ruined' });
  } else {
    c.emit('dungeon_loot', 'bad', { ...data, variant: 'jammed' });
  }
  // A noisy failure in a room with people in it, or a lot of noise anywhere else, is how a quiet job stops being one.
  if (!w.over && (watched ? rng.chance(0.6) : rng.chance(0.15)) && standing(w, d, loc.id).length) raiseAlarm(c, d, loc, 'tripped');
}

/** What's in it, made when it's opened. */
function openLoot(c: Ctx, d: Dungeon, cache: Cache): { cash: number; items: string[] } {
  const { w, rng } = c;
  const h = w.hero;
  const items: Item[] = [];
  let cash = 0;
  const t = d.tier;
  switch (cache.kind) {
    case 'cash': cash = cache.value; break;
    case 'stash':
      cash = Math.round(cache.value * 0.7);
      for (let i = 0; i < 2; i++) if (rng.chance(0.65)) items.push(makeItem(rng.pick(STASH_LOOT)));
      break;
    case 'arms': items.push(genWeapon(rng, { tier: 1 + 1.1 * t })); break;
    case 'armor': items.push(makeItem(ARMOR_BY_TIER[t - 1]!)); break;
    case 'supplies': {
      items.push(makeItem(rng.chance(0.5) ? 'med_pack' : 'patch_kit'));
      if (rng.chance(0.5)) items.push(makeItem('med_pack'));
      const guns = gunsOwned(h);
      if (guns.length) items.push(makeAmmoBox(rng.pick(guns).ammoType!));
      break;
    }
    case 'data':
      for (let i = 0; i < 2; i++) items.push(makeItem(rng.pick(DATA_LOOT[t]!.length ? DATA_LOOT[t]! : ['memory_shard'])));
      break;
    case 'vault':
      cash = Math.round(cache.value * 0.7);
      items.push(makeItem(rng.pick(d.kind === 'outpost' ? (DATA_LOOT[t]!.length ? DATA_LOOT[t]! : ['memory_shard']) : STASH_LOOT)));
      if (d.kind === 'hideout' || rng.chance(0.4)) items.push(genWeapon(rng, { tier: 1.5 + 1.1 * t }));
      break;
  }
  h.cash += cash;
  const names: string[] = [];
  for (const it of items) {
    names.push(it.name);
    acquire(c, it);
  }
  return { cash, items: names };
}

// ===================================================================== for the goal and the exits

/** Her read on walking through this exit, if it leads into a dungeon from outside: how bad a fight she expects. 0 for anything else. */
export function entranceRisk(w: World, dest: Location): number {
  if (!isEntrance(dest) || !dest.gen) return 0;
  const d = w.dungeons[dest.id];
  if (d && d.clearedRun !== null) return 0;
  const p = d ? typicalPressure(w, d) : estimatePressure(w, dest.gen.role as DungeonKind, dest.gen.tier ?? 1);
  return clamp(p - 0.4, 0, 3);
}

/** What's left worth taking: uncollected caches, and what the garrison carries. */
export function spoilsLeft(w: World, d: Dungeon): number {
  let v = 0;
  for (const r of d.rooms) if (r.cache && !r.cache.taken) v += r.cache.value;
  for (const n of garrisonAlive(w, d)) v += n.cash + 0.5 * n.loadout.reduce((a, i) => a + i.value, 0);
  return Math.round(v);
}

/** Roughly what a place not yet seen inside might hold. */
export const spoilsGuess = (tier: number): number => 120 + 160 * tier;

export interface RaidPlan {
  /** Rooms worth going to: something in the corners, somebody left in them, or not looked in yet. */
  targets: { loc: Id; value: number }[];
  /** Nothing at all left to do here: the garrison is dead (or gone) and the corners are empty. */
  empty: boolean;
  /** There is more, but all of it is behind (or in) something she's decided she can't take. */
  blocked: boolean;
}

/**
 * Where to go next inside, and whether there's any point. A room whose garrison looks like too much for her (in her
 * state, right now) is a wall: she doesn't go in, and doesn't go through, so whatever's behind it is out of reach.
 */
export function raidPlan(w: World, d: Dungeon): RaidPlan {
  const limit = tolerance(w);
  const inside = w.locations[w.hero.locationId]?.dungeon === d.id;
  const from = inside ? w.hero.locationId : d.id;
  const dangerous = (room: Id): boolean => {
    const foes = standing(w, d, room);
    if (!foes.length) return false;
    return pressure(w, foes) * ((w.locations[room]?.visits ?? 0) === 0 ? misread(w, room) : 1) > limit;
  };
  // Everywhere she's prepared to go from where she stands.
  const reach: Id[] = dangerous(from) ? [] : [from];
  const seen = new Set<Id>([from]);
  for (let i = 0; i < reach.length; i++) {
    for (const next of neighbours(w, d, reach[i]!)) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (!dangerous(next)) reach.push(next);
    }
  }
  const alive = garrisonAlive(w, d).length > 0;
  const loot = d.rooms.some((r) => r.cache && !r.cache.taken);
  const targets: { loc: Id; value: number }[] = [];
  for (const id of reach) {
    const room = roomOf(d, id);
    const loc = w.locations[id];
    if (!room || !loc) continue;
    const cache = !!room.cache && !room.cache.taken;
    const foes = standing(w, d, id).length > 0;
    const unseen = loc.visits === 0 && (alive || loot);
    if (cache || foes || unseen) targets.push({ loc: id, value: 2.6 + (cache ? 0.8 : 0) + (foes ? 0.4 : 0) + (unseen ? 0.2 : 0) });
  }
  const remaining = alive || loot;
  return { targets, empty: !remaining, blocked: remaining && !targets.length };
}

// ===================================================================== known dungeons

export interface Lead {
  entrance: Location;
  d?: Dungeon;
  kind: DungeonKind;
  tier: number;
  /** What it's worth going in for, ~0..: spoils over how bad the fight looks. */
  appeal: number;
}

/** Dungeons she has seen the door of (she's walked the street they are on) and could still get something out of. */
export function knownDungeons(w: World): Lead[] {
  const out: Lead[] = [];
  for (const loc of Object.values(w.locations)) {
    if (!isEntrance(loc) || !loc.gen) continue;
    const street = w.locations[loc.gen.parent];
    if (!street || street.visits === 0) continue;
    const d = w.dungeons[loc.id];
    if (d && d.clearedRun !== null && !d.rooms.some((r) => r.cache && !r.cache.taken)) continue;
    const tier = d?.tier ?? loc.gen.tier ?? 1;
    const kind = (d?.kind ?? loc.gen.role) as DungeonKind;
    const spoils = d ? spoilsLeft(w, d) : spoilsGuess(tier);
    const p = d ? typicalPressure(w, d) : estimatePressure(w, kind, tier);
    // Having cleaned it out before takes the shine off.
    const jaded = 0.65 ** (d?.clears ?? 0);
    out.push({ entrance: loc, d, kind, tier, appeal: (spoils / 200) * jaded * (p <= tolerance(w) ? 1 : 0) });
  }
  return out.filter((l) => l.appeal > 0);
}
