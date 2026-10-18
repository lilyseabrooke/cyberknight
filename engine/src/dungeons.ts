import { Rng, hashString } from './rng';
import type { Candidate } from './candidate';
import type { Cache, CacheKind, Ctx, Dungeon, DungeonKind, DungeonRoom, Id, Item, Location, Npc, World } from './types';
import { acquire, addHeat, fight, gainXp, heroPower, relocate, remember, type FightResult } from './combat';
import { ARCHETYPES, spawnNpc } from './content/archetypes';
import { makeAmmoBox, makeItem } from './content/items';
import {
  ARMOR_BY_TIER, ATLAS_HEAT_ON_ALARM, ATLAS_HEAT_ON_CLEAR, CACHE_LABEL, NPD_HEAT_ON_CLEAR, DATA_LOOT, LEADER_ARMS, STASH_LOOT, TIER_MENACE, TIER_REF_GRADE, cacheValue, dungeonGrade, layoutFor, rollRoomHazards, slotCount,
  type RoomDef,
} from './content/dungeons';
import { SPOTS, hasPaper, spotRoom, type Crew } from './content/spots';
import { addChamber } from './mapgen';
import { addNpc, everyoneAt, moveNpc, removeNpc } from './population';
import { bucketOf, atLeast, glimpse } from './stealth';
import { sendAway } from './roster';
import { rating } from './weapons';
import { genWeapon } from './weapons';
import { gunsOwned } from './arms';
import { meetHazards } from './hazards';
import { sneakBonus } from './extras';
import { skillLevel, train } from './skills';
import { basePower, dangerOf } from './grade';
import { startRaid } from './goals';
import { nightfall, stockQuest } from './quests';

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
/** Spots are small and are meant to be worked: they fill up again sooner. */
const SPOT_EMPTY_FOR: [number, number] = [1, 2];
/** The most people one fight puts on the board. The rest wade in afterwards, if she's still standing. */
const MAX_FOES = 6;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Whose it is. Outposts are Atlas's and hideouts are a gang's; spots say. */
export const crewOf = (d: Pick<Dungeon, 'kind' | 'spot'>): Crew => (d.spot ? SPOTS[d.spot]?.crew ?? 'free' : d.kind === 'outpost' ? 'atlas' : 'gang');

/** Whose heat it stirs up when she kicks it in: Atlas's, or the police's. A gang's is dealt with by the gang. */
const heatOf = (d: Pick<Dungeon, 'kind' | 'spot'>): 'atlas' | 'npd' | null => {
  const crew = crewOf(d);
  return crew === 'atlas' ? 'atlas' : crew === 'npd' ? 'npd' : null;
};

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
    ...(kind === 'spot' ? { spot: entrance.gen.spot } : {}),
    ...(entrance.gen.quest ? { quest: entrance.gen.quest } : {}),
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
  const { layout, scene } = layoutOf(w, d);
  if (scene) d.scene = scene;
  if (kind === 'spot') d.posted = 0;
  layout.forEach(({ def, parent }, i) => {
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

/** The rooms a dungeon has this garrisoning, each with the key of the one it opens off. A spot is one room, dealt from its setups. */
function layoutOf(w: Pick<World, 'worldSeed'>, d: Dungeon): { layout: { def: RoomDef; parent: string | null }[]; scene?: string } {
  const spot = d.spot ? SPOTS[d.spot] : undefined;
  if (!spot) return { layout: layoutFor(d.kind, d.tier) };
  const { room, scene } = spotRoom(spot, new Rng(`setup:${w.worldSeed}:${d.id}:${d.occupation}`));
  return { layout: [{ def: room, parent: null }], scene };
}

/** Swap their weapon for another, and their punch with it. */
export function rearm(n: Npc, id: string): void {
  const at = n.loadout.findIndex((i) => i.kind === 'weapon');
  const old = at >= 0 ? n.loadout[at]! : undefined;
  const next = makeItem(id);
  n.power += Math.round(rating(next)) - (old ? Math.round(rating(old)) : 0);
  if (at >= 0) n.loadout[at] = next;
  else n.loadout.unshift(next);
}

/** Of the people in a spot who have paper, how many have the kind you need a scanner to read. */
const HIDDEN_PAPER = 0.2;
/** What each person with no paper adds to what their spot keeps, and the most it can come to. */
export const RICH_PER_BARE = 0.3;
export const MAX_RICH = 1.9;

/** Who a spot's people answer to: a gang's spots are full of that gang; anyone else is whoever they are. */
function spotFaction(crew: Crew, arch: string, faction: Id): Id | undefined {
  if (crew === 'gang') {
    const own = ARCHETYPES[arch]?.faction ?? null;
    return own === null || own === 'ganger' ? faction : undefined;
  }
  if (arch === 'sentry_turret') return crew === 'atlas' ? 'atlas' : undefined;
  return undefined;
}

/** Fill a room for the dungeon's current garrisoning: its people, what's lying in it and what it keeps against intruders. */
function stock(w: Realm, d: Dungeon, def: RoomDef, loc: Location): void {
  const room = roomOf(d, loc.id)!;
  const rng = new Rng(`stock:${w.worldSeed}:${d.id}:${d.occupation}:${def.key}`);
  let j = 0;
  const spot = d.spot ? SPOTS[d.spot] : undefined;
  const paper = new Rng(`paper:${w.worldSeed}:${d.id}:${d.occupation}`);
  /** People with no paper on them, who make what they keep richer. */
  let bare = 0;
  for (const slot of def.garrison) {
    const count = slotCount(rng, slot, d.tier);
    for (let k = 0; k < count; k++) {
      const id = `dg:${d.id}:${d.occupation}:${def.key}:${j++}`;
      const faction = spot ? spotFaction(spot.crew, slot.arch, d.faction) : slot.arch.startsWith('gang_') ? d.faction : slot.arch === 'sentry_turret' ? 'atlas' : undefined;
      const npc = spawnNpc(new Rng(`npc:${w.worldSeed}:${id}`), id, slot.arch, loc.id, { faction, grade: dungeonGrade(dangerOf(w.locations[d.id]), d.tier) });
      // The ones in charge carry what the tier says they should, not what the archetype would give a stranger.
      if (npc.tags.includes('commander')) rearm(npc, new Rng(`arms:${w.worldSeed}:${id}`).pick(LEADER_ARMS[d.tier]!));
      if (d.tier > 1) npc.cash = Math.round(npc.cash * (1 + 0.3 * (d.tier - 1)));
      npc.post = d.id;
      npc.home = loc.id;
      // The ones in charge have something worth taking off them.
      if (npc.tags.includes('commander') && d.tier >= 2 && rng.chance(0.6)) npc.loadout.push(makeItem(rng.pick(DATA_LOOT[d.tier]!.length ? DATA_LOOT[d.tier]! : ['credchip'])));
      // Whoever is minding a spot has paper on them, unless the place is Atlas's or the police's, or they are hired in. Machines have none.
      // The ones who don't are the sort nobody is supposed to touch, and what they mind is worth more for it.
      if (spot && !npc.tags.includes('robot')) {
        if (hasPaper(spot.crew) && !slot.clean) npc.bounty = { amount: Math.round(npc.level * 25 + paper.int(25, 90)), hidden: paper.chance(HIDDEN_PAPER) };
        else {
          bare++;
          npc.cash = Math.round(npc.cash * 1.4);
        }
      }
      addNpc(w, npc);
      d.garrison.push(id);
      if (d.posted !== undefined) d.posted++;
    }
  }
  delete room.cache;
  if (def.cache && rng.chance(def.cache.chance)) {
    const kind = rng.pick(def.cache.kinds);
    const rich = Math.min(MAX_RICH, 1 + RICH_PER_BARE * bare);
    room.cache = { kind, value: Math.round(cacheValue(kind, d.tier) * (0.85 + rng.next() * 0.3) * rich), taken: false, fails: 0, ...(rich > 1 ? { rich: Math.round(rich * 100) / 100 } : {}) };
  }
  loc.hazards = rollRoomHazards(new Rng(`rig:${w.worldSeed}:${d.id}:${d.occupation}:${def.key}`), d.kind, d.tier, def.hazard);
  // And if the place was made for a job, the one thing that makes it so.
  if (d.quest) stockQuest(w, d, def.key, loc.id);
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
    if (d.quest) nightfall(u, d);
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
  const { layout, scene } = layoutOf(u, d);
  if (scene) d.scene = scene;
  if (d.kind === 'spot') d.posted = 0;
  const defs = new Map(layout.map(({ def }) => [def.key, def]));
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
export const estimatePressure = (w: World, kind: DungeonKind, tier: number, danger?: number): number =>
  ((TIER_MENACE[kind][tier] ?? 0) * (danger === undefined ? 1 : basePower(dungeonGrade(danger, tier)) / basePower(TIER_REF_GRADE[tier] ?? 3))) / might(w);

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
  const base = d.kind === 'outpost' ? 0.5 : 0.4; // (a spot is as watchful as a hideout)
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
  if (!foes.length) {
    // A spot with nobody minding it is just there for the taking.
    if (d.spot && roomOf(d, loc.id)?.cache && !roomOf(d, loc.id)!.cache!.taken) c.emit('dungeon_quiet', 'good', { kind: d.kind, crew: crewOf(d), place: loc.name, scene: d.scene ?? '', tier: d.tier });
    return;
  }
  // Sneaking, each of them has a look as she comes in and the ones who see enough have her; walking in openly, it is the room's general watchfulness.
  const seen = d.aware.includes(loc.id) || (w.hero.stealth ? glimpse(c, foes, 0.3 + 0.03 * d.tier + 0.1 * d.alert).length > 0 : rng.chance(noticeChance(w, d, foes)));
  if (seen) {
    raiseAlarm(c, d, loc, 'seen');
    return;
  }
  c.emit('dungeon_unseen', 'mixed', { kind: d.kind, crew: crewOf(d), place: loc.name, count: foes.length, foes: describe(foes), tier: d.tier, scene: d.scene ?? '' });
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
  const heat = heatOf(d);
  if (d.alert === 0 && heat) addHeat(w, heat, ATLAS_HEAT_ON_ALARM);
  d.alert = Math.min(4, d.alert + 1);
  if (!d.aware.includes(loc.id)) d.aware.push(loc.id);
  const came = pullReinforcements(c, d, loc);
  const all = [...foes, ...came];
  c.emit(why === 'ambush' ? 'dungeon_ambush' : 'dungeon_alarm', why === 'ambush' ? 'good' : 'bad', {
    variant: why, kind: d.kind, crew: crewOf(d), place: loc.name, site: d.name, count: all.length, foes: describe(all), pulled: came.length, tier: d.tier, scene: d.scene ?? '',
  });
  return fightRoom(c, d, loc, why === 'ambush');
}

/** Something she did made noise in a room with people in it. */
export function tripAlarm(c: Ctx, d: Dungeon, loc: Location): void {
  raiseAlarm(c, d, loc, 'tripped');
}

/** Fight everyone in the room, in waves of a few if there are a lot of them. */
export function fightRoom(c: Ctx, d: Dungeon, loc: Location, ambush: boolean): FightResult | null {
  const { w } = c;
  let result: FightResult | null = null;
  for (let wave = 0; wave < 6 && !w.over; wave++) {
    const all = standing(w, d, loc.id);
    if (!all.length) break;
    const batch = all.slice(0, MAX_FOES);
    if (wave > 0) c.emit('dungeon_wave', 'bad', { kind: d.kind, crew: crewOf(d), place: loc.name, count: batch.length, foes: describe(batch) });
    result = fight(c, batch, { cause: `raiding ${d.name}`, joiners: false, ambush: ambush && wave === 0 });
    if (result !== 'win') break;
  }
  routed(c, d);
  checkCleared(c, d);
  return result;
}

/** Whoever ran for it is gone for good: out the back and not coming back to a building like this. */
export function routed(c: Ctx, d: Dungeon): void {
  const { w } = c;
  for (const n of garrisonAlive(w, d)) {
    if (n.downUntil <= w.beat || n.tags.includes('quest_target')) continue; // (somebody a job is about doesn't leave)
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
  // A place made for a job isn't cleared out while the job's thing is still in it.
  if (d.rooms.some((r) => r.objective && !r.objective.done)) return false;
  // A spot that was only ever a stash is not "cleared" until the stash is gone, and nobody had to be put down for it.
  const bare = d.posted === 0;
  if (bare && d.rooms.some((r) => r.cache && !r.cache.taken)) return false;
  const spot = d.kind === 'spot';
  const [lo, hi] = spot ? SPOT_EMPTY_FOR : EMPTY_FOR;
  d.clearedRun = w.legacy.runs;
  d.clears++;
  d.returnsRun = w.legacy.runs + new Rng(`empty:${w.worldSeed}:${d.id}:${d.occupation}`).int(lo, hi);
  const heat = heatOf(d);
  if (heat && !bare) addHeat(w, heat, heat === 'atlas' ? ATLAS_HEAT_ON_CLEAR : NPD_HEAT_ON_CLEAR);
  // Their crew hears about it, wherever they are.
  if (crewOf(d) === 'gang' && !bare) {
    for (const n of Object.values(w.npcs)) {
      if (!n.alive || n.post || n.faction !== d.faction) continue;
      n.affinity -= spot ? 4 : 12;
      remember(n, spot ? 'heard Blackbird hit one of their crew\'s spots' : 'heard Blackbird cleaned out their crew\'s hideout');
    }
  }
  if (!bare) {
    w.hero.fame += spot ? (d.tier >= 4 ? 1 : 0) : d.tier >= 3 ? 3 : 1;
    gainXp(c, (spot ? 5 : 12) * d.tier);
  }
  c.emit('dungeon_cleared', 'good', { kind: d.kind, crew: crewOf(d), site: d.name, tier: d.tier, runs: d.returnsRun - w.legacy.runs, quiet: bare });
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
  // Sneaking, it is whoever in the room has worked out where she is; otherwise a little more of the room's attention each beat.
  if (w.hero.stealth ? standing(w, d, loc.id).some((n) => atLeast(bucketOf(w, n), 'aware')) : rng.chance(0.07 + 0.02 * d.tier + 0.04 * d.alert)) raiseAlarm(c, d, loc, 'lingered');
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
    cache.kind === 'data' ? h.int * 0.05 + skillLevel(h, 'tinkering') * 0.03
    : cache.kind === 'supplies' || cache.kind === 'arms' || cache.kind === 'armor' ? 0.2
    : skillLevel(h, 'lockpicking') * 0.04 + h.int * 0.02;
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
    case 'arms': items.push(genWeapon(rng, { tier: 1 + 1.1 * t + 1.5 * ((cache.rich ?? 1) - 1) })); break;
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
  // What people with no paper on them keep is richer: sometimes there is a little more in with it.
  if (cache.rich && rng.chance(cache.rich - 1)) items.push(makeItem(rng.pick(STASH_LOOT)));
  // And a place has the things it is for.
  const extra = d.spot ? SPOTS[d.spot]?.extra : undefined;
  if (extra && rng.chance(0.6)) items.push(makeItem(rng.pick(extra)));
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
  const p = d ? typicalPressure(w, d) : estimatePressure(w, dest.gen.role as DungeonKind, dest.gen.tier ?? 1, dangerOf(dest));
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
export const spoilsGuess = (tier: number, kind?: DungeonKind): number => (kind === 'spot' ? 80 + 110 * tier : 120 + 160 * tier);

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
    const spoils = d ? spoilsLeft(w, d) : spoilsGuess(tier, kind);
    const p = d ? typicalPressure(w, d) : estimatePressure(w, kind, tier, dangerOf(loc));
    // Having cleaned it out before takes the shine off.
    const jaded = (kind === 'spot' ? 0.85 : 0.65) ** (d?.clears ?? 0);
    out.push({ entrance: loc, d, kind, tier, appeal: (spoils / 200) * jaded * (p <= tolerance(w) ? 1 : 0) });
  }
  return out.filter((l) => l.appeal > 0);
}
