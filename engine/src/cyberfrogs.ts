import { Rng } from './rng';
import type { Ctx, Frog, FrogKind, Id, Location, Npc, World } from './types';
import type { Candidate } from './candidate';
import { clamp, spawnGroup } from './candidate';
import { addHeat, fight, here, maybeInjure, remember } from './combat';
import { odds, synergy, train } from './skills';
import { dungeonOf, ensureDungeon, isEntrance, standing } from './dungeons';
import { drivable, vehicleAttack } from './driveby';
import { workingCameras } from './witness';
import { fmt, sayAs } from './placekit';
import { cooling, hasGoal } from './mind';
import {
  COLLECT_LINES, COLLECT_THOUGHTS, EDITIONS, EDITION_BY_KEY, FROGS, FROG_COUNT, LAB_DUPES, LAB_FIRSTS, LAB_LINES, LINE_SIZE,
  SEE_LINES, SEE_WRONG, SENSE_LINES, SENSE_THOUGHTS, frogShort, frogTitle,
} from './content/cyberfrogs';

/**
 * Cyberfrogs. A cheap plastic collectible that does absolutely nothing, and the only thing in Neo Blackbird loves enough to protect.
 * 121 characters (content/cyberfrogs.ts), each in half a dozen editions, lying about anywhere. How a frog is lying there is how it
 * is to get:
 *
 *   street  in the open, waiting. Trivial.
 *   trap    in the open, waiting, and a ganger car (or a crew in the alley) is waiting too.
 *   turf    on a gang's corner, on show. Sneak it away or fight for it.
 *   theft   on a shelf or a desk or a counter that is somebody else's. Taking it is stealing, and whoever is minding it minds.
 *   climb   on top of something.
 *   vault   at the back of a hideout or an outpost, past everyone holding it.
 *
 * She has a keen sense for them. Within a couple of doors she feels one and guesses which it is (mostly right); the moment she does,
 * she *wants* it more than anything else she has going, and the goal (goals.ts, `frog`) shoves aside whatever it has to. Once she has
 * one it goes straight back to the lab to sit on the shelf (`legacy.frogs`): it never rides along on a night, so no night can lose it.
 * They are the one thing she does not gamble.
 *
 * Frogs are made as she comes near (per night, from the night's seed), so what is lying about is different every night.
 */

/** Chance that a place has one lying about, by sort of place. */
const HERE = { street: 0.06, building: 0.04, entrance: 0.12 } as const;
/** How many doors away she can feel one. */
export const SENSE_RANGE = 2;
/** How often her first guess at which one it is turns out right. */
const GUESS_RIGHT = 0.6;

const isPerson = (n: Npc): boolean => !n.tags.includes('robot') && !n.tags.includes('dragon') && !n.tags.includes('boss') && n.archetype !== 'puppy';

// ===================================================================== finding them

/** Every frog still lying about tonight. */
export const liveFrogs = (w: World): Frog[] => Object.values(w.frogs ?? {}).filter((f): f is Frog => !!f && !f.state);

/** The frog at this place, whatever became of it. */
export const frogRecord = (w: World, id: Id | undefined): Frog | undefined => (id ? Object.values(w.frogs ?? {}).find((f): f is Frog => !!f && f.loc === id) : undefined);

/** The one lying at this place, if any. */
export const frogAt = (w: World, id: Id): Frog | undefined => liveFrogs(w).find((f) => f.loc === id);

/** How many different characters the lab holds. */
export const shelfSize = (w: Pick<World, 'legacy'>): number => Object.keys(w.legacy.frogs ?? {}).length;

/** The gang whose corner this is, if it is one's. */
const gangOf = (w: World, loc: Location): string | undefined => (loc.territory && w.factions[loc.territory]?.kind === 'gang' ? loc.territory : undefined);

const PERCH_OUT = ['the top of a lamp post', 'a fire escape, three floors up', 'a billboard ledge', 'the roof of a bus shelter', 'a rusted gantry', 'a vent cover high on the wall', 'a dead neon tree'];
const PERCH_IN = ['the top shelf', 'a ceiling beam', 'the top of a tall cabinet', 'a stack of crates that has seen better decades', 'a pipe above the door'];
const SHELF = ['behind the counter', 'on a display shelf', 'in a glass case by the till', 'on the owner\'s desk', 'in the window display', 'on the mantelpiece'];

function weightedKind(rng: Rng, kinds: [FrogKind, number][]): FrogKind {
  return rng.weighted(kinds, ([, k]) => k)[0];
}

function pickChar(w: World, rng: Rng): number {
  const have = w.legacy.frogs ?? {};
  const ids = Array.from({ length: FROG_COUNT }, (_, i) => i);
  // The ones she hasn't got turn up twice as often: Neo is kind.
  return rng.weighted(ids, (i) => (have[String(i)] ? 1 : 2));
}

/** Make the frog (or the lack of one) at a place, the first time anyone asks. */
function rolled(w: World, id: Id): Frog | null {
  const all = (w.frogs ??= {});
  if (all[id] !== undefined) return all[id]!;
  all[id] = null;
  const loc = w.locations[id];
  if (!loc || loc.road === 'highway') return null;
  // The rooms inside a hideout belong to the dungeon, and a home she owns is hers: no frogs.
  if (loc.dungeon && !isEntrance(loc)) return null;
  if (w.legacy.deeds?.some((d) => d.home === id)) return null;
  const rng = new Rng(`frog:${w.seed}:${id}`);
  const entrance = isEntrance(loc) && !!loc.gen;
  const street = loc.kind === 'street';
  const p = entrance ? HERE.entrance : street ? HERE.street : HERE.building;
  if (!rng.chance(p)) return null;

  let kind: FrogKind;
  let at = id;
  let door: Id | undefined;
  if (entrance) {
    const d = ensureDungeon(w, loc);
    if (!d) return null;
    kind = 'vault';
    at = d.rooms[d.rooms.length - 1]!.id;
    if (at !== id) door = id;
    if (liveFrogs(w).some((f) => f.loc === at)) return null;
  } else if (street) {
    kind = weightedKind(rng, [['street', 46], ['trap', 24], ['climb', 18], ['turf', gangOf(w, loc) ? 20 : 0]]);
  } else if (loc.kind === 'tunnel') {
    kind = weightedKind(rng, [['street', 50], ['climb', 30], ['trap', 20]]);
  } else {
    kind = weightedKind(rng, [['theft', 72], ['climb', 22], ['street', 6]]);
  }
  const edition = rng.weighted(EDITIONS, (e) => e.weight).key;
  const f: Frog = { char: pickChar(w, rng), edition, kind, loc: at, ...(door ? { door } : {}) };
  if (kind === 'trap') f.trap = street && drivable(loc) ? 'car' : 'ambush';
  if (kind === 'climb') f.perch = rng.pick(street || loc.kind === 'tunnel' ? PERCH_OUT : PERCH_IN);
  if (kind === 'theft') f.shelf = rng.pick(SHELF);
  all[id] = f;
  return f;
}

/** Everywhere within `range` doors of here (doors and hex neighbours alike), nearest first. */
function reach(w: World, from: Id, range: number): Id[] {
  const seen = new Set<Id>([from]);
  let edge: Id[] = [from];
  for (let d = 0; d < range; d++) {
    const next: Id[] = [];
    for (const id of edge) {
      const loc = w.locations[id];
      for (const e of [...(loc?.exits ?? []), ...(loc?.links ?? [])]) {
        if (e.hidden || seen.has(e.to) || !w.locations[e.to]) continue;
        seen.add(e.to);
        next.push(e.to);
      }
    }
    edge = next;
  }
  return [...seen];
}

// ===================================================================== what she says

const tokens = (f: Frog, extra: Record<string, string | number> = {}): Record<string, string | number> => ({
  full: frogTitle(f.char, f.edition),
  short: frogShort(f.char),
  bio: FROGS[f.char]!.bio,
  edition: EDITION_BY_KEY[f.edition]!.label,
  perch: f.perch ?? '',
  shelf: f.shelf ?? '',
  ...extra,
});

/** A line of the scene, under the one event the text layer has for it. */
function say(c: Ctx, f: Frog, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[] | undefined, extra: Record<string, string | number> = {}): void {
  const loc = c.w.locations[c.w.hero.locationId]!;
  sayAs('frog', c, id, outcome, lines, thoughts, tokens(f, { place: loc.name, ...extra }), { frog: frogShort(f.char) });
}

const LEAD: Record<string, { lines: string[]; thoughts?: string[] }> = {
  street: {
    lines: [
      '{short} is sitting in the open, propped against the kerb as if it were waiting for a bus. Blackbird crosses the street in a perfectly straight line.',
      'Nobody has touched {short}. Nobody has even looked. Blackbird, who takes this personally on the frog\'s behalf, goes to get it.',
      '{short} is just lying there in the gutter, in full view of the whole of {place}. The street, as one, fails to care. Blackbird does not.',
    ],
  },
  vault: {
    lines: [
      'At the back of {place}, on a shelf the garrison plainly dusts, sits {short}. It is the cleanest thing in the building.',
      'There, past all of them: {short}, in a place of honour. Somebody in this outfit is a collector too, and Blackbird has complicated feelings about that.',
    ],
    thoughts: ['They kept it nice. I will keep it nicer.'],
  },
  climb_ok: {
    lines: [
      'She goes up {perch} like it owes her something, and comes down with {short} in her teeth.',
      '{short} is up on {perch}. Blackbird gets there the hard way, in her own time, and her own idea of grace.',
    ],
  },
  climb_fail: {
    lines: [
      'Blackbird goes up for {short} on {perch}, gets a hand on it, and then does not have a hand on anything. The ground is not gentle.',
      'The {perch} is not as secure as it looks. Blackbird finds this out all the way down. {short} watches, serenely, from above.',
    ],
    thoughts: ['Still up there. Still mine. It is a matter of time.', 'The frog is fine. I am fine. The ground is just a slow learner.'],
  },
  turf_ok: {
    lines: [
      '{short} sits on a gang\'s corner like a trophy. Blackbird walks past, gets it, and is gone before the gang\'s eyes find anything to complain about.',
      'The gang keeps {short} on show, on an upturned crate, under a cheap spotlight. Blackbird palms it as she goes by and nobody sees it leave.',
    ],
  },
  turf_caught: {
    lines: [
      'The gang\'s idea of home decor is {short} on a crate, and their idea of security is themselves. They see Blackbird reach.',
      '{short} is a gang\'s trophy now, and the gang is standing around it. Blackbird reaches. The gang notices. The gang has views.',
    ],
  },
  theft_ok: {
    lines: [
      '{short} is {shelf}, and none of it is for sale. Blackbird makes the frog vanish into her coat like a magician with something to hide.',
      'She does not so much steal {short} as quietly relocate it to a better home. A custodial transfer. Technically the opposite of a crime.',
    ],
    thoughts: ['It was going to be happy here. It will be happier with me.', 'I would put it back, but then I would not have it.'],
  },
  theft_cam: {
    lines: ['A camera in the corner of {place} sees all of it, and logs the theft of a plastic frog with the same flat cold interest as anything else. That goes to the police.'],
    thoughts: ['Let them have the footage. Let them file it under "small, plastic, mine."'],
  },
  theft_caught: {
    lines: [
      '{short} is {shelf}, which makes it somebody\'s. Blackbird\'s hand is on it when {keeper} looks round. "Hey. That is not for sale."',
      'Blackbird has {short} halfway into her coat when {keeper} comes into view. It turns out they had noticed {short}\'s absence before it happened.',
    ],
  },
  theft_fumble: {
    lines: ['Blackbird reaches for {short}, knocks something over, and has to freeze. Nobody comes. The frog is still there. Her heart is not.'],
  },
  trap_spotted: {
    lines: [
      '{short} is lying in the open, which is not suspicious, except that it is lying very neatly, in the middle of the road, with a clear run-up to it, and there is a car idling at the corner with its lights off. Blackbird sees all of that and goes anyway.',
      'Something about {short} is wrong: the angle, the lighting, the engine she can hear turning over a block away. Blackbird works it out, nods, and goes for the frog regardless.',
    ],
    thoughts: ['It is a trap. It is obviously a trap. It is a trap with a frog in it.'],
  },
  trap_sprung: {
    lines: [
      '{short} is lying in the middle of {place}, in the open, with not a soul in sight. Blackbird takes a step toward it. An engine she did not hear turns over.',
      'It is {short}, right there, as if the street had been waiting just for her. Blackbird has her hand out when the headlights come on.',
    ],
  },
  trap_ambush: {
    lines: [
      '{short} is lying in the open, as innocent as plastic gets. Blackbird has barely bent for it when the shadows around her stop being shadows.',
      'Right there: {short}, in the middle of a clear patch of {place}. The clear patch, it turns out, was cleared on purpose.',
    ],
  },
  trap_dodge: {
    lines: [
      'The car comes in hard. Blackbird dives, rolls, and comes up with {short} clutched to her chest. The bumper takes a little of her coat and none of her.',
      'She grabs {short} and throws herself sideways in one move, and the car goes through the place she was a moment before, horn blaring.',
    ],
    thoughts: ['Nobody runs over me with a frog in my hand.', 'Missed. Rude, but missed.'],
  },
  trap_hit: {
    lines: [
      'The car takes her at the hip and the whole world turns over. Blackbird comes down on the road, ribs ringing, one hand still stretched toward {short}.',
      'It hits her hard. Blackbird goes over the bonnet, off the other side and into the gutter in a heap, and the first thing she does is look for {short}.',
    ],
    thoughts: ['That was a car. That was an actual car.', 'Worth it. Worth it. Somebody tell me it was worth it.'],
  },
  trap_net: {
    lines: [
      'The sack comes down over her head, a crowbar finds her ribs, and the voices behind it are laughing. They have been waiting for someone to try for {short} all night.',
      'A wire draws tight around her ankles and three people come out of the dark with pipes. They baited {place} with {short} just to see who would fall for it.',
    ],
  },
  trap_crushed: {
    lines: [
      'The car goes over {short}. There is a small crunch, and then a larger silence. Blackbird gathers the pieces in both hands, and the street is suddenly very quiet.',
      '{short} is under the back wheel when the car goes by. Plastic, and a spray of cheap paint. Blackbird picks up what is left, and her face does something terrible.',
    ],
    thoughts: ['They will pay for that. They will pay for that for a long time.', 'It did nothing. It did absolutely nothing. It did not deserve that.'],
  },
};

const RARE: readonly string[] = [
  'It is the one {edition}. There can be a handful of those in all of Neo, and Blackbird is holding one.',
  'Blackbird reads the label twice: {edition}. She has to sit down on the kerb.',
];

// ===================================================================== sensing, and what it makes her want

export interface Sensed {
  frog: Frog;
  /** How she came to want it: she felt it from a distance ('sense'), found herself standing on it ('here'), or has come back to one she felt before ('back'). */
  how: 'sense' | 'here' | 'back';
  /** What she says about it, and what she thinks. */
  text: string;
  thought?: string;
}

/** She picks a guess at who it is. Mostly right, and when she is wrong it is a lookalike from the same line. */
function guessFor(rng: Rng, f: Frog): number {
  if (rng.chance(GUESS_RIGHT)) return f.char;
  const line = FROGS[f.char]!.line;
  const pool = rng.chance(0.7) ? Array.from({ length: LINE_SIZE }, (_, i) => line * LINE_SIZE + i) : Array.from({ length: FROG_COUNT }, (_, i) => i);
  const others = pool.filter((i) => i !== f.char);
  return rng.pick(others);
}

/** Her eyes land on it. Said once. */
function see(c: Ctx, f: Frog): void {
  f.seen = true;
  const wrong = f.guess !== undefined && f.guess !== f.char;
  say(c, f, wrong ? 'see_wrong' : 'see', 'good', wrong ? SEE_WRONG : SEE_LINES, undefined, { guess: wrong ? frogShort(f.guess!) : '' });
}

/**
 * Each beat: make whatever is within reach, feel which of them are close, and look at the one she is standing on. Returns the ones she
 * wants now and has no goal for yet: the mind (goals.ts) takes it from there.
 */
export function frogWatch(c: Ctx): Sensed[] {
  const { w, rng } = c;
  // (A switch for tests that are about something else; the game never sets it.)
  if (w.flags.no_frogs) return [];
  const at = w.hero.locationId;
  const near = new Set(reach(w, at, SENSE_RANGE));
  for (const id of near) rolled(w, id);
  const out: Sensed[] = [];
  for (const f of liveFrogs(w)) {
    const close = f.loc === at || near.has(f.loc) || (!!f.door && near.has(f.door));
    if (!close) continue;
    if (f.loc === at && !f.seen) {
      const felt = !!f.sensed;
      f.sensed = true;
      see(c, f);
      if (!felt) {
        out.push({ frog: f, how: 'here', text: '' });
        continue;
      }
    }
    if (!f.sensed) {
      f.sensed = true;
      f.guess = guessFor(rng, f);
      out.push({
        frog: f, how: 'sense',
        text: fmt(rng.pick(SENSE_LINES), { guess: frogShort(f.guess) }),
        thought: rng.pick(SENSE_THOUGHTS),
      });
    } else if (!hasGoal(w, 'frog', f.loc) && !cooling(w, `frog:${f.loc}`) && w.hero.hp > w.hero.maxHp * 0.2) {
      out.push({ frog: f, how: 'back', text: '' });
    }
  }
  return out;
}

// ===================================================================== getting one

/** Is there a way for her to try for it right now? */
function grabbable(w: World, f: Frog): boolean {
  if (f.state || f.loc !== w.hero.locationId) return false;
  if (f.kind === 'vault') {
    const loc = w.locations[f.loc];
    const d = dungeonOf(w, loc);
    if (d && loc && standing(w, d, loc.id).length) return false;
  }
  return true;
}

const RISK: Record<FrogKind, number> = { street: 0, trap: 0, turf: 0.8, theft: 0.4, climb: 0.3, vault: 0.2 };

export function frogCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  for (const f of liveFrogs(w)) {
    if (!grabbable(w, f)) continue;
    out.push({
      key: `frog:${f.loc}`, drives: { curiosity: 0.3, greed: 0.3 }, bonus: 1.5, risk: RISK[f.kind],
      run: (c) => grab(c, f),
    });
  }
  return out;
}

function grab(c: Ctx, f: Frog): void {
  if (!grabbable(c.w, f)) return;
  switch (f.kind) {
    case 'street': return take(c, f, 'street');
    case 'vault': return take(c, f, 'vault');
    case 'trap': return springTrap(c, f);
    case 'turf': return fromTurf(c, f);
    case 'theft': return lift(c, f);
    case 'climb': return climb(c, f);
  }
}

/** She has it. Say so, and send it home. */
function take(c: Ctx, f: Frog, lead?: string): void {
  const { rng } = c;
  f.state = 'taken';
  if (lead && LEAD[lead]) say(c, f, lead, 'good', LEAD[lead]!.lines, LEAD[lead]!.thoughts);
  const rare = EDITION_BY_KEY[f.edition]!.thrill >= 1.7;
  const line = rng.pick(COLLECT_LINES);
  say(c, f, 'collect', 'good', [rare ? `${line} ${rng.pick(RARE)}` : line], COLLECT_THOUGHTS);
  sendHome(c, f);
}

/** Back to the lab, for safekeeping. It is on the shelf for good from here. */
function sendHome(c: Ctx, f: Frog): void {
  const { w, rng } = c;
  const l = w.legacy;
  const shelf = (l.frogs ??= {});
  const key = String(f.char);
  const isNew = !shelf[key];
  const s = (shelf[key] ??= { count: 0, editions: [], first: l.runs });
  s.count++;
  if (!s.editions.includes(f.edition)) s.editions.push(f.edition);
  w.counters.frogs_got = (w.counters.frogs_got ?? 0) + 1;
  const owned = shelfSize(w);
  const extra = isNew ? rng.pick(LAB_FIRSTS) : rng.pick(LAB_DUPES);
  say(c, f, 'lab', 'good', [`${rng.pick(LAB_LINES)} ${extra} The shelf holds ${owned} of ${FROG_COUNT}.`], undefined, { count: s.count, owned, new: isNew ? 1 : 0 });
}

// ---- trap

function springTrap(c: Ctx, f: Frog): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[f.loc]!;
  const car = f.trap === 'car';
  const spotted = rng.chance(odds(0.12, 0.03, synergy(h, ['perception', ['stat:int', 0.5]]), 0.05, 0.6));
  if (spotted) say(c, f, 'trap_spotted', 'mixed', LEAD.trap_spotted!.lines, LEAD.trap_spotted!.thoughts);
  else say(c, f, car ? 'trap_sprung' : 'trap_ambush', 'bad', LEAD[car ? 'trap_sprung' : 'trap_ambush']!.lines, undefined);
  const crew = spawnGroup(c, 'ganger', rng.int(2, 3), gangOf(w, loc));
  const dodge = rng.chance(odds(spotted ? 0.55 : 0.2, 0.04, synergy(h, ['athletics', ['stat:reflex', 1]]), 0.08, 0.9));
  train(c, 'athletics', 1);
  if (dodge && car) {
    say(c, f, 'trap_dodge', 'good', LEAD.trap_dodge!.lines, LEAD.trap_dodge!.thoughts);
    take(c, f);
  } else if (car) {
    // It runs her over. It will not kill her by itself; what the crew does next might.
    const dmg = clamp(Math.round(rng.int(9, 15) + h.maxHp * 0.16) - (h.armor?.power ?? 0), 3, Math.max(1, h.hp - 1));
    h.hp -= dmg;
    maybeInjure(c, dmg, 0.7);
    say(c, f, 'trap_hit', 'bad', LEAD.trap_hit!.lines, LEAD.trap_hit!.thoughts, { dmg });
    if (rng.chance(0.12)) {
      f.state = 'lost';
      say(c, f, 'trap_crushed', 'bad', LEAD.trap_crushed!.lines, LEAD.trap_crushed!.thoughts);
    } else take(c, f);
  } else if (!dodge) {
    // On foot: a sack, a pipe and a few people who enjoy their work.
    const dmg = clamp(Math.round(rng.int(3, 7) + h.maxHp * 0.06), 1, Math.max(1, h.hp - 1));
    h.hp -= dmg;
    say(c, f, 'trap_net', 'bad', LEAD.trap_net!.lines, undefined, { dmg });
  } else {
    take(c, f);
  }
  if (w.over || h.hp <= 0) return;
  if (car) return vehicleAttack(c, 'gang', crew);
  const res = fight(c, crew, { cause: 'a trap baited with a toy frog', joiners: false });
  if (!w.over && h.hp > 0 && res === 'win' && !f.state) take(c, f);
}

// ---- turf

function fromTurf(c: Ctx, f: Frog): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[f.loc]!;
  const slip = rng.chance(odds(0.15, 0.05, synergy(h, ['sneak', ['stat:reflex', 0.5]]), 0.05, 0.7));
  if (slip) {
    train(c, 'sneak', 2);
    return take(c, f, 'turf_ok');
  }
  say(c, f, 'turf_caught', 'bad', LEAD.turf_caught!.lines, undefined);
  const crew = spawnGroup(c, 'ganger', rng.int(2, 4), gangOf(w, loc));
  const res = fight(c, crew, { cause: 'a gang that does not share its frog', joiners: false });
  if (w.over || h.hp <= 0) return;
  if (res === 'win') take(c, f);
  else f.tries = (f.tries ?? 0) + 1;
}

// ---- theft

function lift(c: Ctx, f: Frog): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[f.loc]!;
  const people = here(w).filter((n) => n.alive && !n.hostile && n.downUntil <= w.clock && isPerson(n));
  const keeper = people.find((n) => n.tags.includes('owner')) ?? people.find((n) => n.tags.includes('staff')) ?? people[0];
  const p = keeper ? clamp(odds(0.3, 0.05, synergy(h, ['sleight', ['stat:reflex', 0.5]]), 0.08, 0.85) - 0.07 * (people.length - 1), 0.05, 0.85) : 0.95;
  train(c, 'sleight', 2);
  if (rng.chance(p)) {
    take(c, f, 'theft_ok');
    if (workingCameras(w, loc.id) > 0) {
      addHeat(w, 'npd', 1);
      say(c, f, 'theft_cam', 'bad', LEAD.theft_cam!.lines, LEAD.theft_cam!.thoughts);
    }
    return;
  }
  if (!keeper) {
    f.tries = (f.tries ?? 0) + 1;
    return say(c, f, 'theft_fumble', 'mixed', LEAD.theft_fumble!.lines, undefined);
  }
  say(c, f, 'theft_caught', 'bad', LEAD.theft_caught!.lines, undefined, { keeper: keeper.name });
  keeper.hostile = true;
  keeper.affinity -= 30;
  remember(keeper, 'caught Blackbird stealing a toy frog');
  addHeat(w, 'npd', 1);
  const backup = people.filter((n) => n !== keeper && (n.tags.includes('security') || n.tags.includes('strong'))).slice(0, 2);
  const res = fight(c, [keeper, ...backup], { cause: `stealing a toy frog from ${keeper.name}`, joiners: false });
  if (w.over || h.hp <= 0) return;
  if (res === 'win') take(c, f);
  else f.tries = (f.tries ?? 0) + 1;
}

// ---- climb

function climb(c: Ctx, f: Frog): void {
  const { w, rng } = c;
  const h = w.hero;
  const tries = f.tries ?? 0;
  // She gets better at this particular fire escape every time it throws her off.
  const p = clamp(odds(0.38, 0.05, synergy(h, ['athletics', ['stat:reflex', 0.5]]), 0.1, 0.85) + 0.1 * tries, 0.1, 0.92);
  train(c, 'athletics', 2);
  if (rng.chance(p)) return take(c, f, 'climb_ok');
  f.tries = tries + 1;
  const dmg = clamp(rng.int(3, 8) + Math.round(h.maxHp * 0.08), 1, Math.max(1, h.hp - 1));
  h.hp -= dmg;
  maybeInjure(c, dmg, 0.5);
  say(c, f, 'climb_fail', 'bad', LEAD.climb_fail!.lines, LEAD.climb_fail!.thoughts, { dmg });
}

// ===================================================================== for the goal and the exits

/** A dungeon she is going into for a frog is a danger she accepts. 0..0.85 of the entrance's risk, waived. */
export function frogDare(w: World, dest: Location): number {
  if (!isEntrance(dest)) return 0;
  const after = w.mind.goals.some((g) => {
    if (g.kind !== 'frog' || !g.loc) return false;
    const f = frogAt(w, g.loc);
    return !!f && (f.door === dest.id || f.loc === dest.id);
  });
  return after ? 0.85 : 0;
}
