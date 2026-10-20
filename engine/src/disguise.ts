import type { Ctx, Disguise, Dungeon, DungeonKind, Exit, Hero, Id, Location, Npc, World } from './types';
import type { EventData } from './events';
import { clamp, spawnGroup, type Candidate } from './candidate';
import { addHeat, fight, here, remember } from './combat';
import { every } from './clock';
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
/** The same for a famous face she has no particular use for: it is a thing to be careful with. */
const STAR_REST = 360;
/** World minutes for the talk about a star turning up somewhere they are not to die down by half. */
const BUZZ_HALF = 1440;
/** How much talk about one star it takes before she lets that face alone. */
export const TIRED = 2.5;

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

// ===================================================================== what impersonating a star costs

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z]+/g, '_');

/**
 * How much talk there has been about this star turning up where they shouldn't: every time she wears the face and every girl who
 * falls for it adds to it, and it dies down by half in a day. It makes the face harder to carry, and makes being found out cost more.
 */
export function buzz(w: World, name: string): number {
  const n = w.counters[`buzz_${slug(name)}`] ?? 0;
  const at = w.counters[`buzz_at_${slug(name)}`] ?? w.clock;
  return n * 0.5 ** (Math.max(0, w.clock - at) / BUZZ_HALF);
}

function addBuzz(w: World, name: string, amount: number): void {
  w.counters[`buzz_${slug(name)}`] = buzz(w, name) + amount;
  w.counters[`buzz_at_${slug(name)}`] = w.clock;
}

// ---- the law's interest in them, which she doesn't get to see

/** Where the law stands with this star (0..10). Her own heat is set aside while she wears the face, and this is what the police see. */
export const starHeat = (w: World, name: string): number => w.counters[`starheat_${slug(name)}`] ?? 0;
const setStarHeat = (w: World, name: string, v: number): void => void (w.counters[`starheat_${slug(name)}`] = clamp(v, 0, 10));

/** She's made trouble for a star. Sooner or later their people find out, and a patrol turns up with a letter. */
function trouble(c: Ctx, name: string, added: number): void {
  const { w, rng } = c;
  const k = slug(name);
  const blame = (w.counters[`blame_${k}`] ?? 0) + added;
  w.counters[`blame_${k}`] = blame;
  if ((w.counters[`cd_at_${k}`] ?? 0) > 0 || !rng.chance(clamp(0.3 + 0.15 * added, 0, 0.9))) return;
  w.counters[`cd_at_${k}`] = w.clock + rng.int(120, 600);
  w.counters[`cd_n_${k}`] = clamp(Math.floor(1 + blame / 2), 1, 3);
}

/**
 * The star's people, if she has got one of them in trouble and they've found out: an armed patrol with a letter. It is private security,
 * not the NPD, so beating it off builds no police heat. Only outdoors, and only once the time they took to find out has gone by.
 */
export function starSecurity(c: Ctx): boolean {
  const { w, rng } = c;
  if (!w.locations[w.hero.locationId]?.outdoors) return false;
  for (const s of STARS) {
    const k = slug(s.name);
    const at = w.counters[`cd_at_${k}`] ?? 0;
    if (at <= 0 || w.clock < at || !rng.chance(0.2)) continue;
    const squad = spawnGroup(c, 'star_security', 1 + (w.counters[`cd_n_${k}`] ?? 1));
    w.counters[`cd_at_${k}`] = 0;
    w.counters[`blame_${k}`] = 0;
    c.emit('ambush', 'bad', { variant: 'star_security', count: squad.length, label: s.name, what: s.what });
    fight(c, squad, { cause: `${s.name}'s lawyers`, joiners: false });
    return true;
  }
  return false;
}

/** The news, now and then: most stars are in no trouble most of the time, and trouble blows over. */
function starNews(c: Ctx, wearing: Disguise | undefined): void {
  const { w, rng } = c;
  if (every(w, 'star_news', 120) <= 0) return;
  for (const s of STARS) {
    if (wearing?.kind === 'star' && wearing.label === s.name) continue; // (hers to deal with)
    const now = starHeat(w, s.name);
    const r = rng.next();
    if (r < 0.05) setStarHeat(w, s.name, now + rng.int(1, 3));
    else if (now > 0 && r < 0.45) setStarHeat(w, s.name, now - 1);
  }
}

/** How well she would carry this star's face right now. */
export const starPolish = (w: World, s: Star): number => bearing(w.hero) - 0.012 * s.fame - 0.07 * Math.min(4, buzz(w, s.name));

/** The face she'd wear: the one she'd carry best, which is the one people have talked about least, then the less famous. */
export function bestStar(w: World): { star: Star; polish: number } {
  let best = { star: STARS[0]!, polish: -Infinity };
  for (const star of STARS) {
    const polish = starPolish(w, star);
    if (polish > best.polish + 0.005) best = { star, polish };
  }
  return best;
}

/** Whether she has been long enough without a famous face to think about another. */
export const starRested = (w: World): boolean => w.clock - (w.counters.face_at ?? -Infinity) >= STAR_REST;

/** Found out as somebody famous: she is mocked for it, the people around hear, and if the star's people have heard of this before, they send a bill. */
function scandal(c: Ctx, dis: Disguise): void {
  const { w, rng } = c;
  const h = w.hero;
  const talk = buzz(w, dis.label);
  h.fame = Math.max(0, h.fame - 1);
  for (const n of here(w)) if (n.alive && !n.hostile && n.archetype !== 'puppy') n.affinity -= 2;
  if (talk >= 1.5) {
    const fine = Math.min(h.cash, rng.int(30, 90));
    h.cash -= fine;
    addHeat(w, 'npd', 1);
    c.emit('star_scandal', 'bad', { variant: 'lawyers', label: dis.label, amount: fine });
  } else {
    c.emit('star_scandal', 'bad', { variant: 'mocked', label: dis.label });
  }
  addBuzz(w, dis.label, 1);
}

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

/** What she can count on a face doing for a building of some crew, before she has one on: the full ease, to the extent she thinks she can carry it. */
export const bluffEase = (w: World, dest: Location): number =>
  entranceCrew(dest) ? 1 - (1 - EASE) * clamp(bearing(w.hero) - 0.05 * ((dest.gen?.tier ?? 1) - 1) - 0.08, 0, 1) : 1; // (a better run place and a few more eyes than she'd like)

/** How big a job she takes a building to be: with the face on, the ease it brings; without, the ease she reckons she could get. */
export const planEase = (w: World, dest: Location): number => Math.min(coverEase(w, dest), bluffEase(w, dest));

// ===================================================================== putting it on

/** How well she carries a face when she puts it on. Nothing to go on is about two in five. */
export const bearing = (h: Hero): number => odds(0.4, 0.06, synergy(h, ['acting', ['stat:charm', 0.4], ['stat:int', 0.3]]), 0.15, 0.9);

/** Minutes of world time it holds. */
const lasts = (h: Hero): number => clamp(90 + 15 * skillLevel(h, 'acting'), 90, 360);

function put(c: Ctx, face: Pick<Disguise, 'kind' | 'label'> & Partial<Pick<Disguise, 'crew' | 'as' | 'fame'>>, polish: number): Disguise {
  const { w } = c;
  if (w.hero.disguise) strip(c, false); // (whoever she was)
  const dis: Disguise = { ...face, until: w.clock + lasts(w.hero), polish: clamp(polish, 0.1, 0.95), passed: [], fooled: [] };
  w.hero.disguise = dis;
  // A star's face brings the star's standing with the law: hers is set aside, theirs is what the police see until it comes off.
  if (face.kind === 'star') {
    dis.parked = w.heat.npd ?? 0;
    dis.heat0 = starHeat(w, face.label);
    w.heat.npd = dis.heat0;
  }
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
  // (The better known the face, the more people know exactly what it looks like; the more it has been seen lately, the more they do.)
  const { star, polish } = bestStar(c.w);
  const dis = put(c, { kind: 'star', label: star.name, fame: star.fame }, polish);
  addBuzz(c.w, star.name, 1);
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
  if (dis.kind === 'star' && dis.parked !== undefined) {
    const now = w.heat.npd ?? 0;
    setStarHeat(w, dis.label, now);
    w.heat.npd = dis.parked;
    if (now > (dis.heat0 ?? 0)) trouble(c, dis.label, now - (dis.heat0 ?? 0));
  }
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
  if (dis.kind === 'star') scandal(c, dis);
}

/** She stops, or it runs out, or a fight starts. */
export function endDisguise(c: Ctx, why: 'wore_off' | 'fight' | 'dropped'): void {
  const dis = c.w.hero.disguise;
  if (!dis) return;
  c.emit('disguise_end', 'mixed', { variant: why, label: dis.label, kind: dis.kind });
  strip(c, false);
}

export function disguiseTick(c: Ctx): void {
  const { w, rng } = c;
  const dis = w.hero.disguise;
  starNews(c, dis);
  if (!dis) return;
  if (w.clock >= dis.until) return endDisguise(c, 'wore_off');
  // A famous face in a crowd draws looks: every half hour somebody may know better.
  if (dis.kind === 'star' && w.locations[w.hero.locationId]?.crowded && every(w, 'star_eye', 30) > 0 && rng.chance(0.06 + 0.1 * Math.min(3, buzz(w, dis.label)))) {
    const who = here(w).filter((n) => n.alive && !n.hostile && n.archetype !== 'puppy');
    if (who.length) blow(c, 'recognized', { npc: rng.pick(who).name });
  }
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
  if (!dis) {
    // (Somebody not already won over.)
    const crowd = here(w).filter((n) => isFairGame(n) && !n.hostile && n.affinity < 40);
    // She has her eye on one of them: that's what the face is for. Otherwise it's a whim, and she knows what the face costs.
    const aimed = w.mind.goals.some((g) => g.kind === 'guise' && g.mode === 'star' && crowd.some((n) => n.id === g.npc));
    const best = bestStar(w);
    if (aimed) {
      out.push({ key: 'don_star', drives: { pride: 0.6, lust: 0.6 }, bonus: 0.3, intent: {}, run: donStar });
    } else if (starRested(w) && crowd.length && best.polish >= 0.3 && buzz(w, best.star.name) < 1.5) {
      out.push({ key: 'don_star', drives: { pride: 0.4, lust: 0.4, curiosity: 0.2 }, bonus: 0.04 + 0.02 * lvl, smart: 0.1, intent: {}, run: donStar });
    }
    // (Studying a person is for a crew she means to walk in on.)
    for (const n of here(w).filter((x) => x.alive && !x.hostile && isCrew(x.faction) && raidCrews.has(x.faction)).slice(0, 2)) {
      out.push({ key: `mimic:${n.id}`, drives: { curiosity: 0.5, pride: 0.3 }, bonus: 0.05 + 0.02 * lvl, intent: { npc: n.name }, run: (c) => mimic(c, n) });
    }
  }

  // ---- taking it off when it's no use to her: a face worn for nothing is a face somebody will see through
  if (dis && w.clock - (w.counters.face_at ?? -Infinity) >= 30 && idleFace(w, dis)) {
    out.push({ key: 'shed_face', drives: {}, bonus: 0.1, smart: 0.9, intent: { label: dis.label }, run: (c) => endDisguise(c, 'dropped') });
  }

  // ---- losing the heat by losing the face
  const gained = dis && dis.kind !== 'star' ? Object.values(dis.heat ?? {}).reduce((a, b) => a + b, 0) : 0;
  if (dis && gained > 0 && !here(w).some((n) => n.hostile)) {
    out.push({ key: 'shake_heat', drives: {}, smart: 1.0, bonus: Math.min(1, gained / 3), intent: { label: dis.label }, run: shakeHeat });
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

/** Slip out of the face and out of notice: whatever heat it picked up goes, if she can pull it off. A hard thing to do. */
function shakeHeat(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const dis = h.disguise;
  if (!dis) return;
  const gained = dis.heat ?? {};
  const total = Object.values(gained).reduce((a, b) => a + b, 0);
  const p = clamp(odds(0.06, 0.05, synergy(h, ['acting', ['sneak', 0.5], ['stat:int', 0.3]]), 0.03, 0.55) - 0.03 * total, 0.03, 0.55);
  strip(c, false);
  if (rng.chance(p)) {
    for (const [f, v] of Object.entries(gained)) w.heat[f] = Math.max(0, (w.heat[f] ?? 0) - v);
    train(c, 'acting', 2);
    c.emit('heat_shed', 'good', { variant: 'ok', label: dis.label, amount: total });
    return;
  }
  train(c, 'acting', 1);
  c.emit('heat_shed', 'bad', { variant: 'caught', label: dis.label, amount: total });
}

/** Is there anything left for this face to do where she is and where she is going? */
function idleFace(w: World, dis: Disguise): boolean {
  const loc = w.locations[w.hero.locationId]!;
  const goals = w.mind.goals;
  if (dis.kind === 'star') {
    return !loc.exits.some((e) => e.gate === 'bouncer') && !goals.some((g) => g.kind === 'guise' && g.mode === 'star') && !here(w).some((n) => isFairGame(n) && !n.hostile && n.affinity < 40 && !dis.fooled.includes(n.id));
  }
  if (dis.kind === 'role') return !loc.exits.some((e) => e.gate === 'guarded' || e.gate === 'bouncer');
  const d = w.dungeons[loc.dungeon ?? ''];
  if (d && crewTag(d) === dis.crew) return false;
  return !goals.some((g) => g.kind === 'raid' || g.kind === 'guise') && !loc.exits.some((e) => !e.hidden && !!w.locations[e.to] && entranceCrew(w.locations[e.to]!) === dis.crew);
}

/** Walk up to someone as a name they know. */
function starFlirt(c: Ctx, n: Npc, dis: Disguise): void {
  const { w, rng } = c;
  const h = w.hero;
  const star = STARS.find((s) => s.name === dis.label);
  const p = clamp(0.5 + 0.3 * dis.polish + 0.04 * skillLevel(h, 'acting') + n.affinity / 300 + romanceMod(w, n) - 0.06 * Math.min(4, buzz(w, dis.label)), 0.12, 0.93);
  kindle(h, 0.05);
  if (rng.chance(p)) {
    addBuzz(w, dis.label, 0.5); // she tells her friends
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
