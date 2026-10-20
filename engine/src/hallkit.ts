import type { CabState, Ctx, HallInfo, Id, Item, Location, Npc, World } from './types';
import { acquire, npcsAt, remember } from './combat';
import { makeItem } from './content/items';
import {
  FEATURES, ROOMS, VARIANTS, auditNow, auditOnDay, cabinetOf, champLevel, champName, featuresIn, isCab, playPrice, scoreOf, situationAt,
  type Audit, type CabinetInfo, type SituationDef, type VariantDef,
} from './content/halls';
import { odds, skillLevel, synergy, train } from './skills';
import { dayOf, MIN_PER_DAY } from './clock';
import { dangerOf } from './grade';
import { isFairGame } from './people';
import { everyoneAt, addNpc, moveNpc, AWAY } from './population';
import { spawnNpc } from './content/archetypes';
import { Rng } from './rng';
import { SKILLS } from './content/skills';
import { fameFrom } from './stage';
import { friendly, roomWhere, runCheckAs, sayAs, type Check, type Kit, type PlaceView } from './placekit';

export { friendly };

/**
 * Everything arcade actions share: how to read the hall she is standing in, the cabinets (Muse or bootleg, and what has
 * been done to them), the compliance spider's visits, and the handful of actions with real state behind them (play,
 * jailbreak, forge, hide, strip a board, redeem tickets). The rows that use these are in content/hallafford.ts,
 * hallcrime.ts and hallevents.ts; the candidates are assembled in hall.ts; what a hall *is* is in content/halls.ts.
 *
 * The cabinets are the only state: `Location.cabs`, by "room:feature", holds only what has been done to each (a licence
 * changed, a score set, wrecked until, hidden until). Genre, title and licence come from the seed. The spider's visits are
 * a pure function of the clock (`auditOnDay`); when she looks at a hall again, visits that happened while she was away
 * are caught up, the way the pawn shop restocks, so nothing can desync.
 */

// ===================================================================== reading a hall

export interface HallView extends PlaceView {
  info: HallInfo;
  sit?: { id: string; def: SituationDef };
  v: VariantDef;
  day: number;
  /** The spider's visit, if one is under way right now. */
  audit?: Audit;
}

export const hallOf = (w: Pick<World, 'locations'>, loc: Location | undefined): Location | undefined => (loc?.gamehall ? loc : loc?.hallRoom ? w.locations[loc.hallRoom.main] : undefined);

export function viewAt(w: World, at: Id = w.hero.locationId): HallView | undefined {
  const loc = w.locations[at];
  const main = hallOf(w, loc);
  const info = main?.gamehall;
  if (!loc || !main || !info) return undefined;
  const v = VARIANTS[info.variant];
  if (!v) return undefined;
  ensureCabs(w, main);
  const room = loc.hallRoom?.room ?? 'floor';
  const audit = auditNow(w, main);
  return { loc, main, info, room, features: featuresIn(info, room), sit: situationAt(w, main), people: npcsAt(w, loc.id), v, day: dayOf(w.clock), ...(audit ? { audit } : {}) };
}

export type Who = 'owner' | 'ganger' | 'attendant' | 'tech' | 'guard' | 'regular' | 'champion' | 'hustler' | 'streamer' | 'bootlegger' | 'host' | 'spider' | 'staff' | 'fair' | 'any' | 'none';

export function find(v: PlaceView, who: string | undefined, rng?: { pick<T>(xs: T[]): T }): Npc | undefined {
  const pool = v.people.filter(friendly);
  let xs: Npc[] = [];
  switch (who as Who | undefined) {
    case 'owner': xs = pool.filter((n) => n.tags.includes('owner')); break;
    case 'attendant': xs = pool.filter((n) => n.archetype === 'hall_attendant'); break;
    case 'tech': xs = pool.filter((n) => n.tags.includes('tinker')); break;
    case 'guard': xs = pool.filter((n) => n.tags.includes('guard')); break;
    case 'ganger': xs = pool.filter((n) => n.archetype === 'ganger'); break;
    case 'regular': xs = pool.filter((n) => n.archetype === 'hall_regular'); break;
    case 'champion': xs = pool.filter((n) => n.tags.includes('champion')); break;
    case 'hustler': xs = pool.filter((n) => n.tags.includes('hustler')); break;
    case 'streamer': xs = pool.filter((n) => n.tags.includes('streamer')); break;
    case 'bootlegger': xs = pool.filter((n) => n.tags.includes('bootlegger')); break;
    case 'host': xs = pool.filter((n) => n.tags.includes('host')); break;
    case 'spider': xs = v.people.filter((n) => n.alive && n.archetype === 'muse_spider'); break;
    case 'staff': xs = pool.filter((n) => n.tags.includes('staff')); break;
    case 'fair': xs = pool.filter((n) => isFairGame(n)); break;
    case 'any': xs = pool; break;
    default: return undefined;
  }
  if (!xs.length) return undefined;
  return rng ? rng.pick(xs) : xs[0];
}

/** The room of this hall with this id, if it grew one. */
export const roomOf = (w: Pick<World, 'locations'>, main: Location, room: string): Location | undefined => roomWhere(w, main, 'hallRoom', room);

/** A situation tag, or `audit`: the spider is here right now (and has not been seen off). */
export const hasSituation = (v: PlaceView, tag: string): boolean => (tag === 'audit' ? !!(v as HallView).audit : !!v.sit?.def.tags.includes(tag));
export const banned = (w: World, main: Location): boolean => !!w.counters[`hallban:${main.id}`];

/** "the Lumi-Bear Grabber": a name with an article, and the same at the start of a sentence. */
export const nameTok = (name: string): Record<string, string> => ({ title: name, Title: name });
export const tokOf = (e: Cab): Record<string, string | number> => ({ title: e.title, cab: e.def.noun, genre: e.def.label, score: scoreOf(e.top), topBy: e.topBy, price: e.price, licence: e.legal === 'muse' ? 'Muse-approved' : 'bootleg' });

/** The owner of the hall, or whoever is minding it. */
export const keeper = (v: PlaceView): Npc | undefined => find(v, 'owner') ?? find(v, 'attendant') ?? v.people.find((n) => n.tags.includes('owner'));

// ===================================================================== telling it

export const say = (c: Ctx, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[] | undefined, tok: Record<string, string | number>, extra: Record<string, string | number | boolean> = {}): void => sayAs('hall', c, id, outcome, lines, thoughts, tok, extra);

const HALL_KIT: Kit<HallView> = {
  event: 'hall',
  name: 'hall',
  fame: 'arcade',
  cause: 'a scene at the arcade',
  messed: 'was messed about by Blackbird at the arcade',
  find,
  owner: (v) => v.people.find((n) => n.tags.includes('owner')),
  trap: (v) => v.info.wild === 'rigged',
  trapText: 'The cabinet was rigged to bite.',
};

/** Run a row described as data: pay, roll against her skills, apply a result, tell it, then any fight it starts. */
export const runCheck = (c: Ctx, v: HallView, id: string, k: Check): void => runCheckAs(HALL_KIT, c, v, id, k);

// ===================================================================== the cabinets

export interface Cab extends CabinetInfo {
  feature: string;
  st: CabState;
  wrecked: boolean;
  hidden: boolean;
  /** 0..1 how good a forged licence is (undefined: not forged). */
  forged?: number;
  /** The level of the score to beat, and the score it reads as. */
  top: number;
  topBy: string;
  /** What one play costs. */
  price: number;
}

export const cabKeys = (info: HallInfo): string[] => info.features.filter((f) => isCab(f.split(':')[1] ?? '')).sort();

const stateOf = (main: Location, key: string): CabState => ((main.cabs ??= {})[key] ??= {});

/** The cabinet at `room:feature`, with her doings counted in. Undefined if the hall has none. */
export function cabByKey(w: World, main: Location, key: string, sit?: SituationDef): Cab | undefined {
  const info = main.gamehall;
  if (!info || !info.features.includes(key)) return undefined;
  const st = main.cabs?.[key] ?? {};
  const base = cabinetOf(w.worldSeed, main, info, key, st.gen ?? 0);
  if (!base) return undefined;
  const legal = st.legal ?? base.legal;
  const seedKey = st.gen ? `${key}#${st.gen}` : key;
  const free = info.wild === 'rigged' ? 0 : 1;
  // A cabinet she has changed is a different animal under the same case: a Muse title with the licence cut off, or a bootleg dressed up.
  const title = legal === base.legal ? base.title : legal === 'bootleg' ? `${base.title} (cracked)` : `${base.title} (Muse edition)`;
  return {
    ...base, title, legal, feature: key.split(':')[1]!, st,
    wrecked: st.wrecked !== undefined && w.clock < st.wrecked,
    hidden: st.hidden !== undefined && w.clock < st.hidden,
    ...(st.forged !== undefined ? { forged: st.forged } : {}),
    top: st.top ?? champLevel(w.worldSeed, main, info, seedKey),
    topBy: st.topBy ?? champName(w.worldSeed, main, seedKey),
    price: Math.round(playPrice(info, legal, sit) * free + (free ? 0 : playPrice(info, legal, sit))),
  };
}

export const cabAt = (w: World, v: HallView, feature: string): Cab | undefined => cabByKey(w, v.main, `${v.room}:${feature}`, v.sit?.def);

/** Every cabinet in this hall that she can see from where she stands (this room). */
export const cabsHere = (w: World, v: HallView): Cab[] => v.features.filter(isCab).map((f) => cabAt(w, v, f)).filter((x): x is Cab => !!x);

/** Every cabinet in the whole building. */
export const allCabs = (w: World, main: Location): Cab[] => cabKeys(main.gamehall!).map((k) => cabByKey(w, main, k)).filter((x): x is Cab => !!x);

/** Scrap a cabinet until `from` plus a few days: the owner brings another, a new game and a blank board. */
export function wreckCab(w: World, main: Location, key: string, from: number = w.clock): void {
  const rng = new Rng(`wreck:${w.worldSeed}:${main.id}:${key}:${Math.floor(from)}`);
  stateOf(main, key).wrecked = from + rng.int(2, 6) * MIN_PER_DAY;
  w.counters.cabs_wrecked = (w.counters.cabs_wrecked ?? 0) + 1;
}

/** Does the spider's checklist notice a forged licence on this cabinet on this day? */
export function noticed(w: World, main: Location, key: string, quality: number, day: number): boolean {
  return new Rng(`notice:${w.worldSeed}:${main.id}:${key}:${day}`).chance(Math.max(0.05, Math.min(0.95, 0.75 - 0.6 * quality)));
}

/** Would the spider stamp on this cabinet in this visit? A bootleg that is not hidden and not passing for Muse. */
export function wouldWreck(w: World, main: Location, cab: Cab, a: Audit): boolean {
  if (cab.legal !== 'bootleg' || cab.wrecked) return false;
  if (cab.st.hidden !== undefined && cab.st.hidden > a.start) return false;
  if (cab.forged !== undefined && !noticed(w, main, cab.key, cab.forged, a.day)) return false;
  return true;
}

const spiderGone = (w: World, main: Location, day: number): boolean => !!(w.counters[`spiderdead:${main.id}:${day}`] || w.counters[`spidercalm:${main.id}:${day}`]);

/**
 * Make the cabinets the first time the hall is looked at; put back any the owner has replaced; and catch up with visits that
 * happened while she was away. Safe to call again.
 */
export function ensureCabs(w: World, main: Location): void {
  const info = main.gamehall;
  if (!info) return;
  const cabs = (main.cabs ??= {});
  const today = dayOf(w.clock);
  // Any cabinet whose owner has had time to replace it is a new one: a new game, a new licence, a blank board.
  for (const [key, st] of Object.entries(cabs)) if (st.wrecked !== undefined && w.clock >= st.wrecked) cabs[key] = { gen: (st.gen ?? 0) + 1 };
  // Visits that have finished since she last looked.
  const stamp = `hallday:${main.id}`;
  const last = w.counters[stamp] ?? today;
  for (let d = Math.max(0, last - 1, today - 6); d <= today; d++) {
    const flag = `hallswept:${main.id}:${d}`;
    if (w.counters[flag]) continue;
    const a = auditOnDay(w.worldSeed, main, info, d);
    if (!a || a.end > w.clock) continue;
    w.counters[flag] = 1;
    if (spiderGone(w, main, d)) continue;
    for (const key of cabKeys(info)) {
      const cab = cabByKey(w, main, key);
      if (cab && wouldWreck(w, main, cab, a)) wreckCab(w, main, key, a.end);
    }
  }
  w.counters[stamp] = today;
  // An old spider is not still standing about from a visit that ended.
  const now = `spider:${main.id}:${today}`;
  for (const n of everyoneAt(w, main.id)) if (n.archetype === 'muse_spider' && n.alive && !n.hostile && n.id !== now) moveNpc(w, n, AWAY);
}

// ===================================================================== the spider

const SPIDER_NAMES = ['Sparkles', 'Giggles', 'Mr. Snuggles', 'Bumble', 'Cuddles', 'Fun Buddy', 'Pip', 'Sunny', 'Mittens', 'Bubbles'];

export const spiderOf = (v: PlaceView): Npc | undefined => v.people.find((n) => n.alive && n.archetype === 'muse_spider');

/** Her spider-slaying, kept for anyone who wants to remember. */
export const spidersKilled = (w: World): number => w.counters.spiders_killed ?? 0;

const SPIDER = {
  arrive: [
    'The lights flicker pink. Something clicks across the ceiling, once, twice, eight times, and a spider the size of a sofa drops to the floor of {hall} on a thread. A smiling face on a screen turns to the room. "Hello, friends! Fun verification time!" It sounds delighted. It sounds like a children\'s presenter at a funeral.',
    'A pastel spider steps in at the door of {hall}, one leg at a time. Eight legs, a heart-shaped chin and a clipboard in a pincer. "Good afternoon! This is a Muse Fun Compliance visit! Please remain enjoyed!"',
    '{hall} goes quiet. A Muse compliance spider is on the threshold, ducking its head under the lintel. The face on its screen is a cartoon sun. It says: "FUN. GUARANTEED." It sounds like a promise and a warrant.',
  ],
  smash: [
    'In {room}, the spider lifts a pincer and brings it down through {title} like a spoon through a trifle. "This cabinet is not Fun Verified! That is sad! It will be fixed! Fun guaranteed!" The board goes up in a small, cheerful fountain of sparks.',
    '{title} is not on the list. The spider says so, kindly, three times, while taking it apart at the joints. "Unlicensed fun detected! We care about your joy!" There is a clipboard involved, and a receipt, and nothing left.',
    'The spider cuts {title} in half with an angle grinder it had folded in a leg, and hums. "Thank you for your cooperation! Your enjoyment is our responsibility!" A cloud of plastic confetti settles, which is also, somehow, on the clipboard.',
    'Eight legs go through {title} at once. "Oh no! Not Fun Verified! Don\'t worry, friends! We\'ll make it right!" It makes the sound of a toy being stepped on. It makes it for a long time.',
    'The spider peels the glass off {title} like the skin of a grape, tuts, and drops what is left in the bin. "This is a little bit illegal! But that is okay! We\'re all learning!"',
  ],
  verify: [
    'The spider stops at {title}, checks a sticker, and ticks the clipboard. "Fun verified! Thank you for keeping it fun!" It sounds like it is going to cry. It is not. It is a chime.',
    'The spider scans the FUN VERIFIED sticker on {title}, taps its screen and smiles with all of it. "Lovely! Keep up the good work, friend!"',
    'The spider peers at {title} with a pair of lenses on stalks. "Licensed! You\'re doing wonderfully!" A tiny heart prints on the clipboard.',
  ],
  pass_hidden: [
    'The spider stops at the sheet-covered shape in {room}. "A mystery! We love a mystery!" It prods the sheet with a pincer. A leg taps the sheet and withdraws. "Nothing to see here! Fun guaranteed!" It moves on.',
    'In {room}, the spider passes a cabinet that has been wheeled to the wall and draped in a banner. "Oh! A decoration!" It clicks past, delighted, and leaves it standing.',
  ],
  pass_forged: [
    'The spider reaches {title}, reads a FUN VERIFIED sticker, taps it twice, and ticks the clipboard. The sticker is a very good colour photocopy. "Fun verified! Thank you for your cooperation!" It moves on.',
    'The spider checks the licence on {title}, holds it to its light, and, after a pause that lasts three whole seconds, says "FUN VERIFIED!" and moves on. Somewhere, a jar of glue sighs.',
  ],
  leave: [
    'The spider checks its clipboard, folds its legs and drops out of {hall} on a thread of something shiny. "Thank you for your cooperation! Fun is guaranteed until further notice!"',
    'The Muse compliance spider ticks the last line, bows to the room and clicks out through the door of {hall}, minding its head. "Stay playful, friends!"',
  ],
  dead: [
    'The Muse compliance spider folds in on itself with a long, falling-down-the-stairs noise, its legs curling up like a hand. The face on its screen holds its smile and says "Fun is guaranteed" three more times, at slower and slower speeds. Then the sun goes out.',
  ],
};

export function sayArrival(c: Ctx, hall: string): void {
  say(c, 'spider.arrive', 'mixed', SPIDER.arrive, undefined, { hall });
}

/** The spider, here for an audit: made the first time anyone looks. A pure function of the hall and the day. */
export function ensureSpider(c: Ctx, main: Location, a: Audit): Npc | undefined {
  const { w } = c;
  const id = `spider:${main.id}:${a.day}`;
  if (w.npcs[id]) return w.npcs[id];
  if (w.counters[`spiderdead:${main.id}:${a.day}`]) return undefined;
  const rng = new Rng(`spidernpc:${w.worldSeed}:${id}`);
  const name = `Verifier-${rng.int(100, 999)} "${rng.pick(SPIDER_NAMES)}"`;
  const n = spawnNpc(rng, id, 'muse_spider', main.id, { name, grade: dangerOf(main) });
  addNpc(w, n);
  sayArrival(c, main.name);
  return n;
}

/** Her rooms and floor are all the hall's: the spider is on the floor, and what it does is heard everywhere. */
export function tickHalls(c: Ctx): void {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId];
  const main = hallOf(w, loc);
  if (!main?.gamehall) return;
  const info = main.gamehall;
  const today = dayOf(w.clock);
  const a = auditNow(w, main);
  const sid = `spider:${main.id}:${today}`;
  const spider = w.npcs[sid];
  if (!a) {
    // The visit is over: it leaves, if it was here, as it came.
    if (spider?.alive && !spider.hostile && spider.locationId !== AWAY) {
      moveNpc(w, spider, AWAY);
      say(c, 'spider.leave', 'mixed', SPIDER.leave, undefined, { hall: main.name });
    }
    return;
  }
  if (spiderGone(w, main, a.day) && !spider) return;
  const sp = ensureSpider(c, main, a);
  if (!sp) return;
  if (!sp.alive) {
    if (!w.counters[`spiderdead:${main.id}:${a.day}`]) {
      w.counters[`spiderdead:${main.id}:${a.day}`] = 1;
      w.counters.spiders_killed = (w.counters.spiders_killed ?? 0) + 1;
      say(c, 'spider.dead', 'good', SPIDER.dead, ['It said "fun guaranteed" the whole way down. Very professional.', 'Eight legs, no clue, and still better manners than the NPD.'], { hall: main.name });
    }
    return;
  }
  if (sp.hostile || spiderGone(w, main, a.day)) return;
  if (!rng.chance(0.5)) return;
  // The next cabinet on the checklist.
  const keys = cabKeys(info);
  const at = `spiderat:${main.id}:${a.day}`;
  const i = w.counters[at] ?? 0;
  if (i >= keys.length) return;
  w.counters[at] = i + 1;
  const key = keys[i]!;
  const cab = cabByKey(w, main, key);
  if (!cab || cab.wrecked) return;
  const roomId = key.split(':')[0] ?? 'floor';
  const tok = { hall: main.name, title: cab.title, room: roomId === 'floor' ? 'the main hall' : `the ${ROOMS[roomId]?.name ?? roomId}` };
  if (cab.legal === 'muse') {
    if (rng.chance(0.4)) say(c, 'spider.verify', 'good', SPIDER.verify, undefined, tok);
  } else if (cab.st.hidden !== undefined && cab.st.hidden > a.start) {
    say(c, 'spider.pass_hidden', 'good', SPIDER.pass_hidden, ['Under a banner. Eight legs, and it can not see a banner.', 'Never trust the one with the clipboard. Do trust the banner.'], tok);
  } else if (cab.forged !== undefined && !noticed(w, main, key, cab.forged, a.day)) {
    say(c, 'spider.pass_forged', 'good', SPIDER.pass_forged, ['A sticker. A sticker, and a robot is fooled. This is the future.', 'My best work. My only work. Mine.'], tok);
  } else {
    wreckCab(w, main, key, a.end);
    say(c, 'spider.smash', 'bad', SPIDER.smash, undefined, tok, { place: main.name });
  }
}

// ===================================================================== play

/** The words for playing a cabinet, by outcome and by licence. Lines are told with {hall} {title} {cab} {pay} {score} {topBy} {amount} {tickets}. */
export interface PlayTexts {
  muse: { record: string[]; good: string[]; bad: string[]; thought?: string[] };
  boot: { record: string[]; good: string[]; bad: string[]; thought?: string[] };
}

export interface PlayOpts {
  /** Extra to the roll (a situation, a mood). */
  bonus?: number;
}

/** What she can play on: a cabinet that is there, working and not covered. */
export const playable = (cab: Cab | undefined): cab is Cab => !!cab && !cab.wrecked && !cab.hidden;

const countOf = (w: World, id: string): number => w.hero.inventory.filter((i) => i.id === id).length;
export const ticketCount = (w: World): number => countOf(w, 'joy_tickets');

/** Her strength at a cabinet: the genre's weighted mean of her skills and stats. Zero in any factor and it is zero. */
export const cabSkill = (w: World, cab: Cab): number => synergy(w.hero, cab.def.parts);

/** Play a cabinet. The shape of every cabinet's business: pay, roll, maybe a record, tickets or cash. */
export function playOne(c: Ctx, v: HallView, feature: string, text: PlayTexts, o: PlayOpts = {}): void {
  const { w, rng } = c;
  const h = w.hero;
  const cab = cabAt(w, v, feature);
  if (!playable(cab)) return;
  const tok: Record<string, string | number> = { hall: v.main.name, ...tokOf(cab), npc: find(v, 'regular', rng)?.name ?? 'a regular', tickets: 0 };
  const side = cab.legal === 'muse' ? text.muse : text.boot;
  if (h.cash < cab.price) {
    c.emit('hall', 'bad', { variant: 'play.broke', text: `Blackbird does not have the ${cab.price}nd for ${cab.title}.` });
    return;
  }
  h.cash -= cab.price;
  tok.pay = cab.price;
  const syn = cabSkill(w, cab);
  const rigged = v.info.wild === 'rigged';
  const p = odds(0.34, 0.06, syn, 0.04, 0.9) + (o.bonus ?? 0) - (cab.legal === 'bootleg' ? 0.06 : 0) - (rigged ? 0.1 : 0) + (cab.price === 0 ? 0.04 : 0);
  const good = rng.chance(Math.max(0.03, Math.min(0.95, p)));
  const pRecord = Math.max(0.01, Math.min(0.8, 0.1 + 0.05 * (syn - cab.top / 2)));
  const record = good && rng.chance(pRecord);
  const st = stateOf(v.main, cab.key);
  if (record) {
    st.top = cab.top + rng.int(1, 4);
    st.topBy = 'BLK';
    tok.score = scoreOf(st.top);
    tok.old = scoreOf(cab.top);
    const fame = (cab.legal === 'muse' ? 1.2 : 0.8) * (v.sit?.def.fame ?? 1);
    // Muse shares it: a purse of tickets. A bootleg pays in cash, if the hall has any.
    if (cab.legal === 'muse') {
      for (let i = 0; i < 3; i++) acquire(c, makeItem('joy_tickets'));
      tok.tickets = 3;
    } else {
      const owner = find(v, 'owner') ?? find(v, 'bootlegger');
      const purse = Math.round(rng.int(25, 70) * (0.6 + 0.2 * v.info.tier) * (v.sit?.def.purse ?? 1));
      const amt = owner ? Math.min(purse, Math.max(0, Math.floor(owner.cash))) : purse;
      if (owner) owner.cash -= amt;
      h.cash += amt;
      tok.amount = amt;
    }
    fameFrom(c, fame, 'arcade');
  } else if (good) {
    if (cab.legal === 'muse') {
      acquire(c, makeItem('joy_tickets'));
      tok.tickets = 1;
    } else {
      const amt = Math.max(1, Math.round(cab.price * rng.int(2, 5) * (rigged ? 2 : 1)));
      h.cash += amt;
      tok.amount = amt;
    }
  }
  // Time at the machine: gaming first, the genre's other skills a little.
  const xp = record ? 6 : good ? 3 : 1.5;
  train(c, 'gaming', xp);
  for (const part of cab.def.parts) {
    const id = Array.isArray(part) ? part[0] : part;
    if (!id.startsWith('stat:') && id !== 'gaming' && id in SKILLS) train(c, id as keyof typeof SKILLS, xp * 0.3);
  }
  const lines = record ? side.record : good ? side.good : side.bad;
  say(c, `play.${cab.genre}.${cab.legal}.${record ? 'record' : good ? 'good' : 'bad'}`, record || good ? 'good' : 'bad', lines, record || good ? side.thought : undefined, tok, { place: v.main.name });
}

// ===================================================================== changing a cabinet

export interface WinLose {
  win: string[];
  lose: string[];
  thought?: string[];
}

/** Turn a Muse-approved cabinet into a bootleg: a service menu, a dongle, a few wires. Fails and it is bricked for a day. */
export function jailbreak(c: Ctx, v: HallView, feature: string, text: WinLose): void {
  const { w, rng } = c;
  const h = w.hero;
  const cab = cabAt(w, v, feature);
  if (!playable(cab) || cab.legal !== 'muse') return;
  const dongle = h.inventory.some((i) => i.id === 'debug_dongle');
  const p = odds(0.28, 0.06, synergy(h, ['tinkering', ['gaming', 0.7], ['stat:int', 0.5]]), 0.04, 0.9) + (dongle ? 0.2 : 0);
  const tok = { hall: v.main.name, ...tokOf(cab), owner: keeper(v)?.name ?? 'the owner' };
  if (rng.chance(p)) {
    stateOf(v.main, cab.key).legal = 'bootleg';
    train(c, 'tinkering', 3);
    train(c, 'gaming', 2);
    say(c, 'jailbreak.win', 'good', text.win, text.thought, tok, { place: v.main.name });
  } else {
    stateOf(v.main, cab.key).wrecked = w.clock + MIN_PER_DAY;
    train(c, 'tinkering', 1);
    const o = keeper(v);
    if (o) {
      o.affinity -= 8;
      remember(o, 'found Blackbird with a screwdriver in the back of a licensed cabinet');
    }
    say(c, 'jailbreak.lose', 'bad', text.lose, undefined, tok, { place: v.main.name });
  }
}

/** Put a good-enough Muse licence on a bootleg: a sticker, a frame, a number. The spider may or may not look hard. */
export function forge(c: Ctx, v: HallView, feature: string, text: WinLose): void {
  const { w, rng } = c;
  const h = w.hero;
  const cab = cabAt(w, v, feature);
  if (!playable(cab) || cab.legal !== 'bootleg') return;
  const sticker = h.inventory.findIndex((i) => i.id === 'fun_sticker');
  const q = Math.max(0.1, Math.min(0.95, odds(0.2, 0.05, synergy(h, ['art', ['sleight', 0.6], ['perception', 0.3]]), 0, 1) + (sticker >= 0 ? 0.3 : 0)));
  const tok = { hall: v.main.name, ...tokOf(cab) };
  if (sticker >= 0) h.inventory.splice(sticker, 1);
  if (rng.chance(0.3 + q * 0.6)) {
    stateOf(v.main, cab.key).forged = q;
    train(c, 'art', 2.5);
    say(c, 'forge.win', 'good', text.win, text.thought, tok, { place: v.main.name });
  } else {
    train(c, 'art', 1);
    say(c, 'forge.lose', 'bad', text.lose, undefined, tok, { place: v.main.name });
  }
}

/** Cover a cabinet, unplug it, wheel it to a wall: passed over for the rest of this visit, or for a few hours. */
export function hide(c: Ctx, v: HallView, feature: string, text: WinLose): void {
  const { w, rng } = c;
  const h = w.hero;
  const cab = cabAt(w, v, feature);
  if (!playable(cab) || cab.legal !== 'bootleg') return;
  const p = odds(0.5, 0.05, synergy(h, [['sneak', 0.5], ['stat:muscle', 0.5], ['tinkering', 0.3]]), 0.1, 0.95);
  const tok = { hall: v.main.name, ...tokOf(cab) };
  if (rng.chance(p)) {
    stateOf(v.main, cab.key).hidden = v.audit ? v.audit.end : w.clock + 4 * 60;
    train(c, 'sneak', 1.5);
    say(c, 'hide.win', 'good', text.win, text.thought, tok, { place: v.main.name });
  } else {
    train(c, 'sneak', 0.5);
    say(c, 'hide.lose', 'bad', text.lose, undefined, tok, { place: v.main.name });
  }
}

/** Strip a board out of a dead or wrecked cabinet. */
export function stripBoard(c: Ctx, v: HallView, feature: string, text: WinLose): void {
  const { w, rng } = c;
  const h = w.hero;
  const cab = cabAt(w, v, feature);
  if (!cab || !(cab.wrecked || v.room === 'cellar')) return;
  const p = odds(0.45, 0.06, synergy(h, ['tinkering', ['scavenging', 0.6]]), 0.1, 0.92);
  const tok = { hall: v.main.name, ...tokOf(cab) };
  if (rng.chance(p)) {
    acquire(c, makeItem('cracked_board'));
    train(c, 'tinkering', 2);
    train(c, 'scavenging', 1.5);
    say(c, 'strip.win', 'good', text.win, text.thought, { ...tok, item: 'a cracked board' }, { place: v.main.name });
  } else {
    train(c, 'tinkering', 0.8);
    say(c, 'strip.lose', 'bad', text.lose, undefined, tok, { place: v.main.name });
  }
}

/** Smash a cabinet herself. It stays smashed until the owner brings another. */
export function smash(c: Ctx, v: HallView, feature: string, text: WinLose): void {
  const cab = cabAt(c.w, v, feature);
  if (!playable(cab)) return;
  wreckCab(c.w, v.main, cab.key);
  const o = keeper(v);
  if (o && cab.legal === 'muse') {
    o.affinity -= 10;
    remember(o, 'watched Blackbird take a bat to a licensed cabinet');
  }
  say(c, 'smash.win', 'mixed', text.win, text.thought, { hall: v.main.name, ...tokOf(cab) }, { place: v.main.name });
}

// ===================================================================== tickets

const PRIZES: { id: string; cost: number; weight: number }[] = [
  { id: 'prize_keyring', cost: 1, weight: 4 },
  { id: 'lumi_plush', cost: 3, weight: 3 },
  { id: 'prize_fist', cost: 4, weight: 2 },
  { id: 'prize_headset', cost: 6, weight: 1.5 },
  { id: 'arcade_stick', cost: 8, weight: 0.8 },
  { id: 'debug_dongle', cost: 12, weight: 0.4 },
];

/** Hand in a handful of Joy tickets at the prize counter for the best thing they run to. */
export function redeemTickets(c: Ctx, v: HallView, text: { win: string[]; thought?: string[] }): void {
  const { w, rng } = c;
  const have = ticketCount(w);
  if (!have) return;
  const spend = Math.min(have, 12);
  const options = PRIZES.filter((p) => p.cost <= spend);
  if (!options.length) return;
  const prize = rng.weighted(options, (p) => p.weight * (1 + p.cost / 6));
  let left = prize.cost;
  w.hero.inventory = w.hero.inventory.filter((i) => (i.id === 'joy_tickets' && left > 0 ? (left--, false) : true));
  const item = makeItem(prize.id);
  acquire(c, item);
  const who = find(v, 'attendant', rng) ?? keeper(v);
  say(c, 'tickets.win', 'good', text.win, text.thought, { hall: v.main.name, npc: who?.name ?? 'the attendant', item: item.name, tickets: prize.cost }, { place: v.main.name });
}

/** Item for tests and rows: how many Joy tickets she has. */
export const joyTickets = (w: World): Item[] => w.hero.inventory.filter((i) => i.id === 'joy_tickets');
/** How far her gaming has come: a level, for lines that need one. */
export const gamingLevel = (w: World): number => skillLevel(w.hero, 'gaming');
/** A feature's label, for lines. */
export const featureLabel = (f: string): string => FEATURES[f]?.label ?? f;
