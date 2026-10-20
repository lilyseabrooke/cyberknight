import type { Ctx, Disguise, Dungeon, DungeonKind, Exit, Hero, Id, Location, Npc, World } from './types';
import type { EventData } from './events';
import { clamp, type Candidate } from './candidate';
import { here, remember } from './combat';
import { odds, skillLevel, synergy, train } from './skills';
import { GANGS } from './content/archetypes';
import { isFairGame } from './people';
import { bondEvent, romanceMod } from './bonds';
import { kindle } from './romance';
import { crewOf, describe, isEntrance } from './dungeons';
import { dungeonLure } from './goals';

/**
 * Acting: being somebody else, and being treated like them by anyone who falls for it.
 * - **A crew.** Dressed and talking like a Chrome Viper, an Atlas agent or an NPD officer, she can walk into that crew's hideout or
 *   outpost and be taken for one of them: the people in each room get a look at her, and if it holds they go back to their business
 *   while she goes through the place, loot included, in plain view. Atlas and the NPD also wave one of their own through a guarded door.
 * - **A kind of person.** Someone with a lanyard and somewhere to be gets through a staff door.
 * - **Someone famous.** Borrows their fame for a while: the door, free drinks, the odd fan, and a lot more luck with the girls. They
 *   mind when they find out.
 * - **A particular person**, studied from across a room: better than "one of the crew", and the real one is a risk.
 *
 * It lasts a couple of hours of world time (`Disguise.until`), and a fight ends it. Every look she gets is a roll against how well
 * she is carrying it (`polish`, set when she puts it on), made harder by tougher buildings, bigger rooms, machines that want a badge,
 * people who have heard of her, and by anyone who knows the real person.
 */

/** Minutes of world time between one face and the next, when it isn't for a door she is already after. */
const REST = 240;

/** How much a fitting disguise takes off what she thinks a building will cost her. */
export const EASE = 0.4;

// ===================================================================== who she can be

interface Star {
  name: string;
  what: string;
  /** How famous: it is added to hers while she wears the face. */
  fame: number;
}

export const STARS: readonly Star[] = [
  { name: 'Tarn Okoye', what: 'lead guitar of Slow Dissolve', fame: 7 },
  { name: 'Mirelle Voss', what: 'host of "Good Evening, Neo"', fame: 8 },
  { name: 'Dax Corvane', what: 'the Neo Cup sprint champion', fame: 7 },
  { name: 'Juno Pryce', what: 'three-time Atlas Safety Ambassador of the Year', fame: 6 },
  { name: 'Prince Pelham', what: 'a streamer with forty million subscribers and no discernible skills', fame: 9 },
  { name: 'DJ Halcyon', what: 'resident DJ at every club that has a roof', fame: 6 },
];

const crewLabel = (crew: Id): string => (crew === 'atlas' ? 'an Atlas agent' : crew === 'npd' ? 'an NPD officer' : GANGS[crew] ? `one of the ${GANGS[crew]}` : 'a gang runner');
const crewKind = (crew: Id): 'atlas' | 'npd' | 'gang' => (crew === 'atlas' || crew === 'npd' ? crew : 'gang');
const isCrew = (f: Id | null | undefined): f is Id => !!f && (f === 'atlas' || f === 'npd' || f === 'ganger' || !!GANGS[f]);

// ===================================================================== what she has on

/** The face she has on right now, if it hasn't worn off. */
export const activeDisguise = (w: World): Disguise | undefined => (w.hero.disguise && w.clock < w.hero.disguise.until ? w.hero.disguise : undefined);

/** Her fame as the people in front of her see it: hers, and whoever she is pretending to be. */
export const shownFame = (w: World): number => w.hero.fame + (activeDisguise(w)?.kind === 'star' ? activeDisguise(w)!.fame ?? 0 : 0);

/** Whose people a dungeon's garrison are: a gang's faction id, 'atlas' or 'npd'. Nobody's, for a place that answers to no crew. */
export function crewTag(d: Pick<Dungeon, 'kind' | 'spot' | 'faction'>): Id | null {
  const crew = crewOf(d);
  return crew === 'gang' ? d.faction : crew === 'atlas' || crew === 'npd' ? crew : null;
}

/** The same, for a door she has not been through yet. */
export function entranceCrew(loc: Location): Id | null {
  const g = loc.gen;
  if (!g || !isEntrance(loc)) return null;
  const kind = g.role as DungeonKind;
  if (kind !== 'outpost' && kind !== 'hideout' && kind !== 'spot') return null;
  return crewTag({ kind, ...(g.spot ? { spot: g.spot } : {}), faction: loc.faction ?? (kind === 'outpost' ? 'atlas' : 'ganger') });
}

/** The face she has on, if the people in this building would take it for one of their own. */
export function coverFor(w: World, d: Pick<Dungeon, 'kind' | 'spot' | 'faction'>): Disguise | undefined {
  const dis = activeDisguise(w);
  const tag = crewTag(d);
  return dis && tag && dis.kind === 'crew' && dis.crew === tag ? dis : undefined;
}

/** What a building looks like to somebody who can walk in as one of its own: a share of how bad she would otherwise expect it to be. */
export const coverEase = (w: World, dest: Location): number => {
  const dis = activeDisguise(w);
  const crew = entranceCrew(dest);
  return dis?.kind === 'crew' && crew && dis.crew === crew ? EASE : 1;
};

// ===================================================================== putting it on

/** How well she carries a face when she puts it on. Nothing to go on is about two in five. */
const bearing = (h: Hero): number => odds(0.4, 0.06, synergy(h, ['acting', ['stat:charm', 0.4], ['stat:int', 0.3]]), 0.15, 0.9);

/** Minutes of world time it holds. */
const lasts = (h: Hero): number => clamp(90 + 15 * skillLevel(h, 'acting'), 90, 360);

function put(c: Ctx, face: Pick<Disguise, 'kind' | 'label'> & Partial<Pick<Disguise, 'crew' | 'as' | 'fame'>>, polish: number): Disguise {
  const { w } = c;
  const dis: Disguise = { ...face, until: w.clock + lasts(w.hero), polish: clamp(polish, 0.1, 0.95), passed: [], fooled: [] };
  w.hero.disguise = dis;
  w.counters.face_at = w.clock;
  return dis;
}

const quality = (p: number): string => (p >= 0.65 ? 'sharp' : p >= 0.45 ? 'fair' : 'rough');

function donCover(c: Ctx, dest: Location, crew: Id): void {
  const dis = put(c, { kind: 'crew', label: crewLabel(crew), crew }, bearing(c.w.hero));
  train(c, 'acting', 1);
  c.emit('don', 'good', { variant: 'crew', crew: crewKind(crew), gang: GANGS[crew] ?? '', label: dis.label, place: dest.name, look: quality(dis.polish) });
}

function donStaff(c: Ctx, exit: Exit): void {
  const dis = put(c, { kind: 'role', label: 'someone with a lanyard and somewhere to be' }, bearing(c.w.hero));
  train(c, 'acting', 1);
  c.emit('don', 'good', { variant: 'role', label: dis.label, place: c.w.locations[exit.to]?.name ?? 'the door', look: quality(dis.polish) });
}

function donStar(c: Ctx): void {
  const star = c.rng.pick([...STARS]);
  // (The better known the face, the more people know exactly what it looks like.)
  const dis = put(c, { kind: 'star', label: star.name, fame: star.fame }, bearing(c.w.hero) - 0.012 * star.fame);
  train(c, 'acting', 1);
  c.emit('don', 'good', { variant: 'star', label: star.name, what: star.what, look: quality(dis.polish) });
}

/** Study someone from across the room and become them. */
function mimic(c: Ctx, n: Npc): void {
  const dis = put(c, { kind: 'crew', label: n.name, crew: n.faction!, as: n.id }, bearing(c.w.hero) + 0.1);
  train(c, 'acting', 1);
  c.emit('don', 'good', { variant: 'person', npc: n.name, role: n.role, crew: crewKind(n.faction!), gang: GANGS[n.faction!] ?? '', look: quality(dis.polish) });
}

// ===================================================================== taking it off

/** It is gone. If she was found out, the ones who bought it mind. */
function strip(c: Ctx, exposed: boolean): void {
  const { w } = c;
  const dis = w.hero.disguise;
  if (!dis) return;
  delete w.hero.disguise;
  if (!exposed) return;
  for (const id of dis.fooled) {
    const n = w.npcs[id];
    if (!n?.alive) continue;
    n.affinity -= 12;
    remember(n, 'was lied to by Blackbird about who she was');
  }
}

/** Somebody saw through it. */
export function blow(c: Ctx, how: string, data: EventData = {}): void {
  const dis = c.w.hero.disguise;
  if (!dis) return;
  c.emit('disguise_blown', 'bad', { variant: how, label: dis.label, kind: dis.kind, crew: dis.crew ? crewKind(dis.crew) : '', fooled: dis.fooled.length, ...data });
  strip(c, true);
}

/** She stops, or it runs out, or a fight starts. */
export function endDisguise(c: Ctx, why: 'wore_off' | 'fight'): void {
  const dis = c.w.hero.disguise;
  if (!dis) return;
  c.emit('disguise_end', 'mixed', { variant: why, label: dis.label, kind: dis.kind });
  strip(c, false);
}

export function disguiseTick(c: Ctx): void {
  const dis = c.w.hero.disguise;
  if (dis && c.w.clock >= dis.until) endDisguise(c, 'wore_off');
}

// ===================================================================== being looked at

/** How likely it is that the people in a room take her for one of their own. */
export function holdOdds(w: World, dis: Disguise, d: Dungeon, foes: Npc[]): number {
  let p = dis.polish + 0.01 * skillLevel(w.hero, 'acting');
  p -= 0.05 * (d.tier - 1); // the better run the place, the better they know their own
  p -= 0.03 * Math.min(5, foes.length - 1); // more pairs of eyes
  p -= 0.1 * d.alert; // something already went wrong here tonight
  p -= 0.04 * Math.min(5, w.heat[dis.crew ?? ''] ?? 0); // word has been getting round about her
  p -= 0.1 * Math.min(3, foes.filter((n) => n.tags.includes('robot')).length); // machines want a badge
  p -= Math.min(0.3, 0.1 * foes.filter((n) => n.memories.some((m) => m.includes('Blackbird'))).length); // somebody has met her
  const real = dis.as ? w.npcs[dis.as] : undefined;
  if (real?.alive) p -= real.post === d.id ? 0.15 : 0.04; // the people who know him
  return clamp(p, 0.08, 0.95);
}

/**
 * The people in a room take a proper look at her. Returns whether she got away with it; if not, the face is gone and the caller deals
 * with what comes next (usually an alarm).
 */
export function scrutinize(c: Ctx, dis: Disguise, d: Dungeon, loc: Location, foes: Npc[], why: 'entering' | 'lingering' | 'working'): boolean {
  const { w, rng } = c;
  const real = dis.as ? w.npcs[dis.as] : undefined;
  const faceToFace = !!real?.alive && real.locationId === loc.id;
  const data = { place: loc.name, foes: describe(foes), count: foes.length, foe: foes[0]?.name ?? 'somebody', real: real?.name ?? '', kind: d.kind, crew: crewKind(dis.crew ?? '') };
  if (faceToFace || !rng.chance(clamp(holdOdds(w, dis, d, foes) - (why === 'working' ? 0.1 : 0), 0.05, 0.95))) {
    train(c, 'acting', 1);
    blow(c, faceToFace ? 'real' : why === 'entering' ? 'garrison' : why === 'working' ? 'working' : 'lingering', data);
    return false;
  }
  train(c, 'acting', why === 'entering' ? 2 : 1);
  dis.polish = Math.max(0.1, dis.polish - 0.02); // keeping it up is tiring
  if (why === 'entering') dis.passed.push(loc.id);
  c.emit('disguise_pass', 'good', { variant: why, label: dis.label, ...data });
  return true;
}

// ===================================================================== doors

const OPENS: Record<'guarded' | 'bouncer', (d: Disguise) => boolean> = {
  // Atlas and the NPD are waved through their own doors; so is anyone with a lanyard.
  guarded: (d) => d.kind === 'role' || (d.kind === 'crew' && (d.crew === 'atlas' || d.crew === 'npd')),
  // The staff door. (The name on the list is the bouncer's own business: see `shownFame` in moves.ts.)
  bouncer: (d) => d.kind === 'role',
};

/** Is the face she has on one this kind of door waves through? */
export function canPass(w: World, gate: Exit['gate']): boolean {
  const dis = activeDisguise(w);
  return !!dis && (gate === 'guarded' || gate === 'bouncer') && OPENS[gate](dis);
}

/** Try the door as somebody else. Returns the face if it worked; if not it is blown (and she faces the door as herself). */
export function tryGate(c: Ctx, exit: Exit): Disguise | null {
  const { w, rng } = c;
  if (!canPass(w, exit.gate)) return null;
  const dis = w.hero.disguise!;
  const dest = w.locations[exit.to]!;
  const p = clamp(dis.polish + 0.01 * skillLevel(w.hero, 'acting') - (exit.gate === 'guarded' ? 0.04 * dest.security : 0.05), 0.1, 0.95);
  if (rng.chance(p)) {
    train(c, 'acting', 2);
    return dis;
  }
  train(c, 'acting', 1);
  blow(c, 'gate', { place: dest.name });
  return null;
}

// ===================================================================== the candidates

export function disguiseCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId];
  if (!loc || h.stealth) return out;
  const lvl = skillLevel(h, 'acting');
  const dis = activeDisguise(w);
  // She doesn't change faces on a whim: not twice in one evening, and a crew's colors only for a door she means to go in by.
  const rested = w.clock - (w.counters.face_at ?? -Infinity) >= REST;
  // How much she means to go in by each door she could: a raid she has set her mind on, or just the pull of a place she fancies.
  const meant = new Map<Id, number>();
  for (const e of loc.exits) {
    const dest = w.locations[e.to];
    if (!dest || e.hidden || !entranceCrew(dest)) continue;
    const d = w.dungeons[dest.id];
    if (d && d.clearedRun !== null) continue;
    const want = w.mind.goals.some((g) => g.kind === 'raid' && g.mode === 'approach' && g.loc === dest.id) ? 0.6 : rested ? dungeonLure(w, dest.id) : 0;
    if (want > 0) meant.set(dest.id, want);
  }
  const raidCrews = new Set([...meant.keys()].map((id) => entranceCrew(w.locations[id]!)));

  // ---- a door she could go in as one of them
  for (const e of loc.exits) {
    const dest = w.locations[e.to];
    if (!dest || e.hidden) continue;
    const crew = entranceCrew(dest);
    if (crew && meant.has(dest.id) && !(dis?.kind === 'crew' && dis.crew === crew)) {
      out.push({
        key: `don_cover:${dest.id}`, drives: { greed: 0.5, curiosity: 0.3, pride: 0.3 }, bonus: 0.1 + 0.02 * lvl + 0.9 * meant.get(dest.id)!, smart: 0.4,
        intent: { crew: crewKind(crew), gang: GANGS[crew] ?? '', place: dest.name }, run: (c) => donCover(c, dest, crew),
      });
    }
    if (rested && (e.gate === 'guarded' || e.gate === 'bouncer') && !canPass(w, e.gate)) {
      out.push({ key: `don_staff:${e.to}`, drives: { curiosity: 0.4, greed: 0.2 }, bonus: 0.05 + 0.02 * lvl, intent: { place: dest.name }, run: (c) => donStaff(c, e) });
    }
  }

  // ---- somebody here worth being
  if (!dis && rested) {
    // (Somebody not already won over.)
    const crowd = here(w).filter((n) => isFairGame(n) && !n.hostile && n.affinity < 40);
    if (crowd.length || loc.exits.some((e) => e.gate === 'bouncer')) {
      out.push({ key: 'don_star', drives: { pride: 0.6, lust: 0.6, curiosity: 0.2 }, bonus: 0.1 + 0.02 * lvl + (crowd.length ? 0.15 : 0), intent: {}, run: donStar });
    }
    // (Studying a person is for a crew she means to walk in on.)
    for (const n of here(w).filter((x) => x.alive && !x.hostile && isCrew(x.faction) && raidCrews.has(x.faction)).slice(0, 2)) {
      out.push({ key: `mimic:${n.id}`, drives: { curiosity: 0.5, pride: 0.3 }, bonus: 0.05 + 0.02 * lvl, intent: { npc: n.name }, run: (c) => mimic(c, n) });
    }
  }

  // ---- working the room
  if (dis?.kind === 'star') {
    for (const n of here(w)) {
      if (!isFairGame(n) || n.hostile || dis.fooled.includes(n.id)) continue;
      out.push({ key: `star_flirt:${n.id}`, drives: { lust: 1.4, pride: 0.6 }, bonus: 0.4 + 0.02 * lvl, risk: 0.15, intent: { npc: n.name, star: dis.label }, run: (c) => starFlirt(c, n, dis) });
    }
  }
  return out;
}

/** Walk up to someone as a name they know. */
function starFlirt(c: Ctx, n: Npc, dis: Disguise): void {
  const { w, rng } = c;
  const h = w.hero;
  const star = STARS.find((s) => s.name === dis.label);
  const p = clamp(0.5 + 0.3 * dis.polish + 0.04 * skillLevel(h, 'acting') + n.affinity / 300 + romanceMod(w, n), 0.12, 0.93);
  kindle(h, 0.05);
  if (rng.chance(p)) {
    n.affinity += 24;
    remember(n, 'was charmed by Blackbird');
    dis.fooled.push(n.id);
    train(c, 'acting', 2);
    train(c, 'romance', 1);
    kindle(h, 0.07);
    const gift = n.cash > 0 && rng.chance(0.35) ? Math.min(n.cash, rng.int(8, 35)) : 0;
    h.cash += gift;
    n.cash -= gift;
    const number = !gift && n.affinity >= 28 && rng.chance(0.4);
    c.emit('star_flirt', 'good', { variant: gift ? 'gift' : number ? 'number' : 'smitten', npc: n.name, label: dis.label, what: star?.what ?? '', amount: gift });
    bondEvent(c, n, 'flirt');
    return;
  }
  train(c, 'acting', 1);
  if (rng.chance(0.3)) {
    n.affinity -= 10;
    remember(n, 'caught Blackbird pretending to be somebody famous');
    blow(c, 'star', { npc: n.name });
    return;
  }
  n.affinity -= 3;
  dis.polish = Math.max(0.1, dis.polish - 0.08);
  c.emit('star_flirt', 'bad', { variant: 'cold', npc: n.name, label: dis.label, what: star?.what ?? '', amount: 0 });
}
