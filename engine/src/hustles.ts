import type { Ctx, Hero, Location, Npc, World } from './types';
import { acquire, addHeat, fight, gainXp, here, relocate, remember } from './combat';
import { clamp, levelRisk, spawnGroup, type Candidate } from './candidate';
import { makeItem } from './content/items';
import { hasImplantFlag, skillLevel, synergy, train, feel } from './skills';
import { phaseOf } from './clock';
import { npcsAt } from './population';
import { meetHazards } from './hazards';
import { DOORS, doorsTried, isBlock, knowsHome, leaveHome, nextDoor, ownerComesHome, residenceOf } from './homes';
import { burglaryPending, startBurglary } from './goals';
import { isFairGame } from './people';

/** The hustle-specific skill formulas. These layer the new skills (grifting, hustling) as a
 * straight additive bonus on top of the original stat-driven baseline, rather than wrapping
 * everything in `synergy()` — a brand-new skill starts at 0, and synergy's "any zero factor
 * zeroes the whole thing" rule would otherwise silently kill the stat-driven baseline these
 * actions already had before she's trained the new skill at all. */
const HODDS = {
  panhandle: (h: Hero) => 0.45 + h.charm * 0.02 + feel(skillLevel(h, 'grifting')) * 0.03,
  coldRead: (h: Hero) => 0.3 + h.charm * 0.03 + feel(skillLevel(h, 'streetwise')) * 0.03 + feel(skillLevel(h, 'grifting')) * 0.03,
  scamMark: (h: Hero) => 0.3 + feel(skillLevel(h, 'cards')) * 0.05 + feel(skillLevel(h, 'sleight')) * 0.03 + feel(skillLevel(h, 'grifting')) * 0.04,
  sellFakeGoods: (h: Hero) => 0.4 + h.charm * 0.02 + feel(skillLevel(h, 'haggling')) * 0.04 + feel(skillLevel(h, 'grifting')) * 0.03,
  oddJobs: (h: Hero) => 0.78 + feel(skillLevel(h, 'athletics')) * 0.02 + feel(skillLevel(h, 'hustling')) * 0.02,
  securityShift: (h: Hero) => 0.55 + h.muscle * 0.02 + feel(skillLevel(h, 'intimidation')) * 0.03 + feel(skillLevel(h, 'hustling')) * 0.02,
  courierRun: (h: Hero) => 0.6 + feel(skillLevel(h, 'streetwise')) * 0.03 + feel(skillLevel(h, 'hustling')) * 0.02,
};


const talkable = (n: Npc): boolean => !n.hostile && !n.tags.includes('boss') && !n.tags.includes('dragon') && n.archetype !== 'puppy';

// ===================================================================== what limits them
//
// None of these has a cooldown. Each is limited by something in the world: work that the place generates and
// she uses up, goods that arrive in shipments, a mark who only falls for it once, a room that has heard about
// the scam, a request somebody actually has. See `tickHustles` for how the world refills them.

const stock = (w: World, key: string, init: number): number => (w.counters[key] ??= init);
const take = (w: World, key: string, n = 1): void => {
  w.counters[key] = Math.max(0, (w.counters[key] ?? 0) - n);
};

/** Chores a place has for her: the mess a busy room makes. */
export const chores = (w: World, n: Npc): number => stock(w, `chores_${n.id}`, n.tags.includes('owner') ? 3 : 2);
/** Packages a fixer or dealer has waiting. */
export const parcels = (w: World, n: Npc): number => stock(w, `parcels_${n.id}`, 1);
/** Open shifts on the club door. */
export const doorSlots = (w: World): number => stock(w, 'door_slots', 1);

const has = (n: Npc, flag: string): boolean => n.flags.includes(flag);
const addFlag = (n: Npc, flag: string): void => {
  if (!n.flags.includes(flag)) n.flags.push(flag);
};
const dropFlag = (n: Npc, flag: string): void => {
  n.flags = n.flags.filter((f) => f !== flag);
};

/** How wary this room is of one kind of trick, 0..~1. It remembers, then forgets (see stage.tickVenues). */
export const wary = (w: World, locId: string, kind: string): number => w.locations[locId]?.wary?.[kind] ?? 0;
const warn = (w: World, locId: string, kind: string, by: number): void => {
  const loc = w.locations[locId]!;
  const m = (loc.wary ??= {});
  m[kind] = (m[kind] ?? 0) + by;
};

/** Staff who could use a hand right now: there is something that needs doing. */
export const oddJobReady = (w: World, n: Npc): boolean => n.alive && !n.hostile && n.tags.includes('staff') && n.affinity >= -10 && chores(w, n) >= 1;

/**
 * The world carries on. Busy places make work; shipments come in; shops take money; people end up needing an escort
 * or a favour. Called once a beat.
 */
export function tickHustles(c: Ctx): void {
  const { w, rng } = c;
  const crowd: Record<string, number> = {};
  for (const id of Object.keys(w.locations)) crowd[id] = npcsAt(w, id).filter((n) => !n.hostile).length;
  for (const n of Object.values(w.npcs)) {
    if (!n.alive || n.id.startsWith('tmp_') || n.hostile || n.tags.includes('robot') || n.locationId.startsWith('_')) continue;
    const busy = (crowd[n.locationId] ?? 1) - 1;
    if (n.tags.includes('staff')) w.counters[`chores_${n.id}`] = Math.min(3, chores(w, n) + 0.006 + 0.004 * busy);
    if (n.tags.includes('fixer') || n.tags.includes('dealer')) w.counters[`parcels_${n.id}`] = Math.min(2, parcels(w, n) + 0.012);
    // Takings: a till fills up between visits from the people who actually shop there.
    if (n.tags.includes('shopkeeper') || n.tags.includes('owner')) n.cash = Math.min(120, n.cash + 0.15 + 0.05 * busy);
    if (n.alive && w.beat > 20 && (isFairGame(n) || n.archetype === 'patron') && !has(n, 'wants_escort') && rng.chance(0.003)) addFlag(n, 'wants_escort');
    if (!n.tags.includes('fixer') && n.affinity >= -5 && !has(n, 'favor') && rng.chance(0.004)) addFlag(n, 'favor');
  }
  const club = crowd.neon_pharaoh ?? 0;
  if (club >= 5) w.counters.door_slots = Math.min(2, doorSlots(w) + 0.012);
}

/** Every odd job, hustle, and bad idea Blackbird can pick up on a street corner. Each exists only while the world has
 * something to offer for it (see above), so they are occasional opportunities, not a standing buffet. */
export function hustleCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = here(w).filter(talkable);

  // ---- panhandling: the last resort, the first instinct of a hero who is flat broke
  if (loc.outdoors && h.cash < 40) {
    const desperate = clamp((40 - h.cash) / 40, 0, 1);
    out.push({ key: 'panhandle', drives: { greed: 0.25 }, bonus: desperate * 0.5, risk: 0.1, intent: {}, run: panhandle });
  }

  // ---- odd jobs for the staff: hauling kegs, bussing tables, nothing heroic about it
  for (const n of crowd.filter((x) => oddJobReady(w, x))) {
    out.push({ key: `odd_jobs:${n.id}`, drives: { greed: 0.25, pride: 0.1 }, risk: 0.1, run: (c) => oddJobs(c, n) });
  }

  // ---- working the door: a night of standing security for somebody else's club
  const guards = crowd.filter((n) => n.tags.includes('security'));
  if (loc.id === 'neon_pharaoh' && guards.length && guards.every((g) => g.affinity >= -5) && doorSlots(w) >= 1) {
    out.push({ key: 'security_shift', drives: { greed: 0.35, pride: 0.2, bravery: 0.2 }, risk: 0.5, run: securityShift });
  }

  // ---- a quick courier run for whoever's connected enough to have packages
  for (const n of crowd.filter((x) => (x.tags.includes('fixer') || x.tags.includes('dealer')) && parcels(w, x) >= 1 && x.affinity >= -10 && (w.heat.npd ?? 0) < 4)) {
    out.push({ key: `courier_run:${n.id}`, drives: { greed: 0.3, curiosity: 0.2 }, risk: 0.3, run: (c) => courierRun(c, n) });
  }

  // ---- bodyguard gig: somebody's willing to pay to not walk home alone
  for (const n of crowd.filter((x) => has(x, 'wants_escort'))) {
    out.push({ key: `bodyguard_gig:${n.id}`, drives: { greed: 0.3, bravery: 0.3, pride: 0.2 }, risk: 0.6, run: (c) => bodyguardGig(c, n) });
  }

  // ---- questionable: robbing somebody's place blind, once she knows where it is
  // (not the fixer: Madame Zero is a story contact, not a mark)
  // (Away from the door she only decides to go, once; at the door, it is the job.)
  const burglaryPendingFor = (w2: World, x: Npc): boolean => burglaryPending(w2, x.id) && h.locationId !== x.residence;
  const marks = Object.values(w.npcs).filter(
    (x) => x.alive && !x.hostile && knowsHome(x) && x.cash >= 60 && !has(x, 'burgled') && !burglaryPendingFor(w, x) && !x.tags.some((t) => ['kid', 'robot', 'fixer'].includes(t)) && !h.companions.some((a) => a.npcId === x.id),
  );
  for (const n of marks) {
    out.push({
      key: `burgle_home:${n.id}`, drives: { greed: 0.55, curiosity: 0.2 }, risk: 1.2 + levelRisk(w, n),
      run: (c) => burgleHome(c, n),
    });
  }

  // ---- questionable: any door in an apartment block she's standing in, with nobody in particular in mind
  if (isBlock(loc) && doorsTried(w, loc) < DOORS && (w.heat.npd ?? 0) < 4) {
    out.push({ key: `burgle_flat:${loc.id}`, drives: { greed: 0.45, curiosity: 0.2 }, risk: 1.6, run: (c) => burgleFlat(c, loc) });
  }

  // ---- shady: protection money from anyone running a till
  for (const n of crowd.filter((x) => (x.tags.includes('shopkeeper') || x.tags.includes('owner')) && x.cash >= 30 && x.affinity > -45)) {
    out.push({
      key: `protection_racket:${n.id}`, drives: { greed: 0.4, bravery: 0.3 }, risk: 0.6 + levelRisk(w, n),
      run: (c) => protectionRacket(c, n),
    });
  }

  // ---- shady: three-card monte on anyone standing still long enough
  if (h.cash >= 10) {
    for (const n of crowd.filter((x) => (x.tags.includes('rowdy') || x.archetype === 'patron') && !has(x, 'wise') && wary(w, loc.id, 'scam') < 1.2)) {
      out.push({ key: `scam_mark:${n.id}`, drives: { greed: 0.35, curiosity: 0.1 }, risk: 0.3, intent: { npc: n.name }, run: (c) => scamMark(c, n) });
    }
  }

  // ---- shady: selling bunk stims and fake implants to anyone gullible enough
  for (const n of crowd.filter((x) => x.cash >= 15 && !x.tags.includes('kid') && !x.tags.includes('fixer') && !has(x, 'duped') && wary(w, loc.id, 'fakes') < 1.2)) {
    out.push({ key: `sell_fake_goods:${n.id}`, drives: { greed: 0.3, curiosity: 0.1 }, risk: 0.4, intent: { npc: n.name }, run: (c) => sellFakeGoods(c, n) });
  }

  // ---- shady but mostly harmless: cold-reading a mark's fortune for tip money
  for (const n of crowd.filter((x) => !x.tags.includes('robot') && !x.tags.includes('fixer') && (w.counters[`read_${x.id}`] ?? 0) < 2 && wary(w, loc.id, 'readings') < 1.2)) {
    out.push({ key: `cold_read:${n.id}`, drives: { greed: 0.2, curiosity: 0.2 }, run: (c) => coldRead(c, n) });
  }

  // ---- random favors: NPCs occasionally have a weird little job for her
  for (const n of crowd.filter((x) => has(x, 'favor') && !x.tags.includes('robot') && !x.tags.includes('fixer') && x.affinity >= -5)) {
    out.push({ key: `odd_request:${n.id}`, drives: { curiosity: 0.3, greed: 0.15 }, bonus: 0.1, risk: 0.2, run: (c) => oddRequest(c, n) });
  }

  // ---- minor combat: hunting down Atlas's small patrol drones, out of spite and for parts
  for (const n of here(w).filter((x) => x.tags.includes('robot') && x.tags.includes('patrol') && x.faction === 'atlas')) {
    out.push({
      key: `hunt_drone:${n.id}`, drives: { bravery: 0.7, pride: 0.4, quest: 0.1 }, risk: 0.4 + levelRisk(w, n),
      run: (c) => huntDrone(c, n),
    });
  }

  return out;
}

// =============================================================== resolvers

function panhandle(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(HODDS.panhandle(h) - (h.fame >= 3 ? 0.1 : 0), 0.1, 0.8);
  if (rng.chance(0.07)) {
    const cash = rng.int(20, 60);
    h.cash += cash;
    train(c, 'grifting', 2);
    const it = rng.chance(0.4) ? makeItem(rng.pick(['neural_gum', 'mom_photo'])) : null;
    if (it) acquire(c, it);
    c.emit('panhandle', 'good', { variant: 'stranger', amount: cash, item: it?.name ?? '' });
  } else if (rng.chance(p)) {
    const cash = rng.int(3, 15);
    h.cash += cash;
    train(c, 'grifting', 1);
    c.emit('panhandle', 'good', { variant: 'sympathy', amount: cash });
  } else if (rng.chance(0.3)) {
    h.hp -= rng.int(0, 3);
    c.emit('panhandle', 'bad', { variant: 'mocked' });
  } else {
    c.emit('panhandle', 'mixed', { variant: 'ignored' });
  }
}

function oddJobs(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  take(w, `chores_${n.id}`);
  const chore = rng.pick(['kegs', 'tables', 'dishes', 'crates']);
  if (rng.chance(clamp(HODDS.oddJobs(h), 0.5, 0.95))) {
    const pay = rng.int(10, 30);
    h.cash += pay;
    n.affinity += 4;
    train(c, 'hustling', 2);
    train(c, 'athletics', 1);
    c.emit('odd_jobs', 'good', { variant: chore, chore, amount: pay, npc: n.name });
  } else {
    h.hp -= rng.int(2, 6);
    n.affinity -= 1;
    c.emit('odd_jobs', 'bad', { variant: `${chore}_mishap`, chore, npc: n.name });
  }
}

function securityShift(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  take(w, 'door_slots');
  const p = clamp(HODDS.securityShift(h), 0.2, 0.9);
  train(c, 'hustling', 2);
  train(c, 'intimidation', 1);
  if (rng.chance(p)) {
    const pay = rng.int(40, 100);
    h.cash += pay;
    h.fame += 1;
    for (const g of here(w)) if (g.tags.includes('security')) g.affinity += 3;
    c.emit('security_shift', 'good', { variant: 'quiet', amount: pay });
  } else {
    const trouble = here(w).find((n) => n.tags.includes('rowdy') && !n.hostile);
    if (trouble) {
      c.emit('security_shift', 'bad', { variant: 'brawl', npc: trouble.name });
      fight(c, [trouble], { cause: 'working the door and picking the wrong fight', joiners: false });
    } else {
      h.hp -= rng.int(4, 10);
      c.emit('security_shift', 'bad', { variant: 'rough' });
    }
  }
}

function courierRun(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  take(w, `parcels_${n.id}`);
  const p = clamp(HODDS.courierRun(h) - (n.tags.includes('dealer') ? 0.1 : 0), 0.2, 0.9);
  if (rng.chance(p)) {
    const pay = rng.int(30, 90);
    h.cash += pay;
    n.affinity += 3;
    train(c, 'hustling', 2);
    train(c, 'streetwise', 1);
    c.emit('courier_run', 'good', { variant: 'clean', amount: pay, npc: n.name });
  } else {
    addHeat(w, 'npd', 1);
    c.emit('courier_run', 'bad', { variant: 'hot', npc: n.name });
  }
}

function bodyguardGig(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  dropFlag(n, 'wants_escort');
  train(c, 'hustling', 2);
  const ambushChance = clamp(0.4 - feel(skillLevel(h, 'hustling')) * 0.025, 0.15, 0.4);
  if (rng.chance(ambushChance)) {
    const muggers = spawnGroup(c, 'mugger', rng.int(1, 2));
    c.emit('bodyguard_gig', 'mixed', { variant: 'ambush', npc: n.name });
    const res = muggers.length ? fight(c, muggers, { cause: `protecting ${n.name} from an ambush`, joiners: false }) : 'win';
    if (w.over) return;
    if (res === 'win') {
      const pay = rng.int(50, 140);
      h.cash += pay;
      n.affinity += 15;
      remember(n, 'was kept safe by Blackbird on the walk home');
      c.emit('bodyguard_gig', 'good', { variant: 'saved', amount: pay, npc: n.name });
    }
  } else {
    const pay = rng.int(40, 120);
    h.cash += pay;
    n.affinity += 10;
    c.emit('bodyguard_gig', 'good', { variant: 'safe', amount: pay, npc: n.name });
  }
}

/**
 * Burglary is something that happens at a home, not to a person wherever they are. She needs the address first (see
 * homes.ts). Away from the door this only decides to go: the home is put on the map and she takes it up as a goal
 * (goals.ts), and the trip is ordinary travel. Once she is at the door, this is the job itself.
 */
function burgleHome(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const fresh = !n.residence || !w.locations[n.residence];
  const home = residenceOf(c, n);
  if (h.locationId !== home.id) {
    startBurglary(c, n, home, { street: w.locations[home.tossTo]?.name ?? '', fresh });
    return;
  }
  addFlag(n, 'burgled');
  if (!meetHazards(c, home)) {
    leaveHome(c, home);
    return;
  }
  const p = clamp(0.35 + feel(skillLevel(h, 'lockpicking')) * 0.05 + feel(skillLevel(h, 'sneak')) * 0.04 - n.level * 0.03 - home.security * 0.04, 0.05, 0.85);
  train(c, 'lockpicking', 2);
  if (rng.chance(p)) {
    const cash = Math.min(Math.round(n.cash * 0.9), rng.int(80, 220) + home.security * 25);
    n.cash -= cash;
    h.cash += cash;
    train(c, 'sneak', 2);
    let item = '';
    if (rng.chance(0.4)) {
      const it = makeItem(rng.pick(['memory_shard', 'fake_id', 'credchip', 'walkman']));
      item = it.name;
      acquire(c, it);
    }
    c.emit('burgle_home', 'good', { variant: 'clean', amount: cash, item, npc: n.name, place: home.name });
  } else {
    n.affinity -= 50;
    remember(n, 'came home early and caught Blackbird mid-burglary');
    c.emit('burgle_home', 'bad', { variant: 'caught', npc: n.name, place: home.name });
    ownerComesHome(c, n, home, { cause: `getting caught burgling ${n.name}'s place` });
  }
  leaveHome(c, home);
}

/**
 * Trying a door at random. She listens first, and may or may not learn whether anyone is in: if somebody is, she
 * moves on; if she can't tell, she goes in blind, and whoever is home finds her. Nobody has told her they're out, so
 * this is a lot riskier than a mark's place she knows is empty, and the take is whatever is lying around.
 */
function burgleFlat(c: Ctx, block: Location): void {
  const { w, rng } = c;
  const h = w.hero;
  const door = nextDoor(c, block);
  const occupied = rng.chance(phaseOf(w.clock) === 'day' ? 0.35 : 0.7);
  const hears = clamp(0.4 + feel(skillLevel(h, 'sneak')) * 0.05 + h.competence * 0.1 + (hasImplantFlag(h, 'sonic_ear') ? 0.3 : 0), 0.1, 0.95);
  const knows = rng.chance(hears);
  if (knows && occupied) {
    c.emit('burgle_flat', 'mixed', { variant: 'busy', place: door.name });
    return;
  }
  relocate(w, door.id);
  if (!meetHazards(c, door)) {
    leaveHome(c, door);
    return;
  }
  const p = clamp(0.3 + feel(skillLevel(h, 'lockpicking')) * 0.05 + feel(skillLevel(h, 'sneak')) * 0.04 - door.security * 0.05 - (knows ? 0 : 0.05), 0.05, 0.8);
  train(c, 'lockpicking', 2);
  if (occupied) {
    // Somebody is home, and she didn't know.
    const resident = spawnGroup(c, 'patron', 1)[0]!;
    c.emit('burgle_flat', 'bad', { variant: 'caught', place: door.name, npc: resident.name });
    addHeat(w, 'npd', 1);
    fight(c, [resident], { cause: `getting caught robbing ${door.name}`, assault: true, joiners: false });
  } else if (!rng.chance(p)) {
    addHeat(w, 'npd', 1);
    c.emit('burgle_flat', 'bad', { variant: 'noise', place: door.name });
  } else {
    train(c, 'sneak', 2);
    const size = door.security >= 3 ? 400 : door.security >= 1 ? 140 : 70;
    const cash = rng.int(Math.round(size * 0.3), size);
    h.cash += cash;
    let item = '';
    if (rng.chance(0.25)) {
      const it = makeItem(rng.pick(['memory_shard', 'fake_id', 'credchip', 'walkman']));
      item = it.name;
      acquire(c, it);
    }
    c.emit('burgle_flat', 'good', { variant: 'clean', place: door.name, amount: cash, item, listened: knows });
  }
  leaveHome(c, door);
}

function protectionRacket(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.3 + h.muscle * 0.03 + feel(skillLevel(h, 'intimidation')) * 0.05 - n.level * 0.04, 0.1, 0.85);
  train(c, 'intimidation', 2);
  if (rng.chance(p)) {
    const cut = Math.min(n.cash, rng.int(20, 60));
    n.cash -= cut;
    h.cash += cut;
    n.affinity -= 15;
    addHeat(w, 'npd', 1);
    remember(n, 'pays Blackbird protection money, resentfully');
    c.emit('protection_racket', 'good', { variant: 'pays', amount: cut, npc: n.name });
  } else {
    c.emit('protection_racket', 'bad', { variant: 'refuses', npc: n.name });
    fight(c, [n], { cause: `shaking down ${n.name} for protection money`, assault: true });
  }
}

function scamMark(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  addFlag(n, 'wise');
  const stake = Math.min(h.cash, rng.int(10, 30));
  const p = clamp(HODDS.scamMark(h) - 0.2 * wary(w, h.locationId, 'scam'), 0.1, 0.85);
  warn(w, h.locationId, 'scam', 0.3);
  train(c, 'grifting', 2);
  train(c, 'cards', 1);
  if (rng.chance(p)) {
    const take = stake + rng.int(5, 30);
    h.cash += take;
    c.emit('scam_mark', 'good', { variant: 'win', amount: take, npc: n.name });
  } else {
    n.affinity -= 25;
    c.emit('scam_mark', 'bad', { variant: 'caught', npc: n.name });
    if (rng.chance(0.5)) fight(c, [n], { cause: `getting caught running a card scam on ${n.name}`, assault: true });
  }
}

function sellFakeGoods(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  addFlag(n, 'duped');
  const p = clamp(HODDS.sellFakeGoods(h) - (n.tags.includes('dealer') ? 0.2 : 0) - 0.2 * wary(w, h.locationId, 'fakes'), 0.1, 0.85);
  warn(w, h.locationId, 'fakes', 0.3);
  train(c, 'grifting', 2);
  train(c, 'haggling', 1);
  if (rng.chance(p)) {
    const take = Math.min(n.cash, rng.int(15, 50));
    n.cash -= take;
    h.cash += take;
    c.emit('sell_fake_goods', 'good', { variant: 'sold', amount: take, npc: n.name });
  } else {
    n.affinity -= 20;
    c.emit('sell_fake_goods', 'bad', { variant: 'tested', npc: n.name });
    if (rng.chance(0.3)) fight(c, [n], { cause: `getting caught selling ${n.name} bunk goods`, assault: true });
  }
}

function coldRead(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const reads = w.counters[`read_${n.id}`] ?? 0;
  w.counters[`read_${n.id}`] = reads + 1;
  const p = clamp(HODDS.coldRead(h) - 0.15 * wary(w, h.locationId, 'readings'), 0.1, 0.85);
  warn(w, h.locationId, 'readings', 0.15);
  train(c, 'grifting', 1);
  if (rng.chance(p)) {
    const tip = Math.max(1, Math.round(rng.int(10, 35) * 0.5 ** reads));
    h.cash += tip;
    n.affinity += 5;
    c.emit('cold_read', 'good', { variant: 'spooked', amount: tip, npc: n.name });
  } else {
    n.affinity -= 5;
    c.emit('cold_read', 'bad', { variant: 'skeptic', npc: n.name });
  }
}

const FAVORS = ['fetch_item', 'deliver_message', 'scare_someone', 'watch_my_stuff', 'walk_me_home'] as const;

function oddRequest(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  dropFlag(n, 'favor');
  const favor = rng.pick(FAVORS);
  const skill = favor === 'scare_someone' ? 'intimidation' : favor === 'walk_me_home' ? 'athletics' : 'streetwise';
  const p = clamp(0.4 + feel(skillLevel(h, skill)) * 0.04 + feel(skillLevel(h, 'hustling')) * 0.02 + feel(synergy(h, ['streetwise', ['stat:charm', 0.3]])) * 0.02, 0.15, 0.88);
  train(c, skill, 1);
  train(c, 'hustling', 1);
  if (rng.chance(p)) {
    const pay = rng.int(20, 70);
    h.cash += pay;
    n.affinity += 12;
    gainXp(c, 5);
    remember(n, `got Blackbird to ${favor.replace('_', ' ')}`);
    c.emit('odd_request', 'good', { variant: favor, amount: pay, npc: n.name });
  } else {
    n.affinity -= 8;
    c.emit('odd_request', 'bad', { variant: favor, npc: n.name });
  }
}

function huntDrone(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  c.emit('hunt_drone', 'mixed', { npc: n.name });
  const res = fight(c, [n], { cause: 'hunting down an Atlas patrol drone', assault: true });
  if (w.over || res !== 'win') return;
  const drop = rng.int(1, 3);
  w.heat.atlas = Math.max(0, (w.heat.atlas ?? 0) - drop);
  if (rng.chance(0.5)) acquire(c, makeItem('drone_core'));
  c.emit('hunt_drone', 'good', { variant: 'scrapped', npc: n.name, drop });
}
