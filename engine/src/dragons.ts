import type { Ctx, DragonTemper, Flight, Id, Location, Npc, Roam, World } from './types';
import { addHeat, fight, heroPower, npcsAt, relocate, remember } from './combat';
import { clamp, spawnGroup, type Candidate } from './candidate';
import { scoutSaves, sneakBonus } from './extras';
import { train } from './skills';
import { dragonReadiness } from './pursuit';
import { Rng } from './rng';
import { BASE_MIN_PER_BEAT } from './clock';
import { addNpc, AWAY, moveNpc, removeNpc } from './population';
import { routeTo } from './plans';
import { influenceOf } from './factions';
import { isShut } from './shutdown';
import { GANGS, spawnNpc } from './content/archetypes';
import { dangerOf } from './grade';
import { DRAGON_MODELS, TERRITORIAL, dropFlights, flightModel, hasTrait, hopMinutes, reachPerBeat, rollTemper, runsDown, temperOf, type DragonModel } from './dragonmodels';
import { startDying } from './dying';

/**
 * The dragons that aren't Apollo. Each flies into a district, goes through the pattern of its kind, takes off, and is
 * forgotten once it is far enough from her; while it is about it moves along the streets at its own speed whether or not
 * she is watching. Hera is the exception: she just hangs over wherever Blackbird is.
 *
 * A dragon in the world is a `Flight` in `w.flights`; `w.flight` is whichever one she is standing with. A persistent one
 * (`Flight.persist`) is never forgotten: when it takes off it goes away for a while and comes back, and it comes back
 * the next night too.
 */

const alive = (n: Npc | undefined): n is Npc => !!n && n.alive;

const flightFoes = (w: World): Npc[] => (w.flight?.ids ?? []).map((id) => w.npcs[id]).filter(alive);

/** Hops from her at which a dragon that has taken off stops mattering. */
const DESPAWN_AT = 6;
/** Minutes an Ares goes without hurting anybody before it gets bored and leaves (a patient one waits longer). */
const BORED = 40;
const boredAfter = (f: Flight): number => BORED * (0.5 + temperOf(f).patience);

/** Running the dragons: move the ones about, let her meet them, and now and then bring in another. */
export function ambientDragons(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  w.flights ??= [];
  if (w.flight && !w.flights.includes(w.flight)) {
    // One set by hand, or a saved game's copy of one that is already in the list.
    const twin = w.flights.find((x) => x.ids[0] === w.flight!.ids[0]);
    if (twin) w.flight = twin;
    else w.flights.push(w.flight);
  }

  for (const f of [...w.flights]) {
    if (w.over) return;
    if (w.flights.includes(f)) tendFlight(c, f);
  }
  syncFlight(w);
  if (w.over || w.flags.quiet_skies || loc.id === 'overpass' || w.beat < 12) return;

  const live = w.flights.filter((f) => f.roam?.stage !== 'leave' && f.roam?.stage !== 'away');
  if (!live.length && loc.outdoors) {
    if (!w.flags.hera_seen && rng.chance(0.004)) {
      w.flags.hera_seen = true;
      spawnFlight(c, 'hera', 1);
    } else if (rng.chance(0.022 + (w.counters.skywatch === w.beat - 1 ? 0.1 + 0.01 * h.hack : 0))) {
      spawnFlight(c, 'artemis', rng.weighted([1, 2, 3], (n) => (n === 3 ? 0.2 : 0.4)));
    }
  }
  // The newer models draw from a stream of their own, so the luck of everything above (and after) is the same as ever.
  // `quiet_skies`, above, keeps every one of them home, for a test that follows a night to see something else.
  const now = w.flights.filter((f) => f.roam?.stage !== 'leave' && f.roam?.stage !== 'away');
  if (!w.over) spawnNewModels({ ...c, rng: new Rng(`${w.seed}:dragons:${w.beat}`) }, loc, now);
  syncFlight(w);
}

const syncFlight = (w: World): void => {
  w.flight = w.flights.find((f) => f.locationId === w.hero.locationId && f.roam?.stage !== 'leave' && f.roam?.stage !== 'away') ?? null;
};

// ===================================================================== districts

const hopDist = (w: World, from: Id, to: Id): number => routeTo(w, from, to)?.dist ?? 99;

/** Where in the open air she is, as far as dragons care: the street she is on, or the one outside the door. */
function anchorOf(w: World, id: Id): Id | null {
  const loc = w.locations[id];
  if (!loc) return null;
  if (loc.outdoors && id !== 'overpass') return id;
  for (const e of loc.exits) {
    const d = w.locations[e.to];
    if (!e.hidden && d?.outdoors && e.to !== 'overpass' && !isShut(w, e.to)) return e.to;
  }
  return null;
}

/** The open ground round a place: outdoor places joined to it by outdoor places, a few hops out. */
export function districtAround(w: World, from: Id, radius = 4, cap = 14): { nodes: Id[]; dist: Record<Id, number> } {
  const dist: Record<Id, number> = { [from]: 0 };
  const nodes: Id[] = [from];
  for (let i = 0; i < nodes.length && nodes.length < cap; i++) {
    const here = nodes[i]!;
    if (dist[here]! >= radius) continue;
    for (const e of w.locations[here]?.exits ?? []) {
      const d = w.locations[e.to];
      if (e.hidden || !d?.outdoors || e.to === 'overpass' || dist[e.to] !== undefined || isShut(w, e.to)) continue;
      dist[e.to] = dist[here]! + 1;
      nodes.push(e.to);
      if (nodes.length >= cap) break;
    }
  }
  return { nodes, dist };
}

/** The places in its district one step from here. */
const neighbours = (w: World, r: Roam, id: Id): Id[] =>
  (w.locations[id]?.exits ?? []).filter((e) => !e.hidden && r.district.includes(e.to) && !isShut(w, e.to)).map((e) => e.to);

/** The first step from `from` towards `to`, keeping to its district where it can. */
function hopToward(w: World, r: Roam, from: Id, to: Id): Id | null {
  if (from === to) return null;
  const first: Record<Id, Id> = {};
  const seen = new Set<Id>([from]);
  const queue: Id[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i]!;
    for (const n of neighbours(w, r, here)) {
      if (seen.has(n)) continue;
      seen.add(n);
      first[n] = here === from ? n : first[here]!;
      if (n === to) return first[n]!;
      queue.push(n);
    }
  }
  return routeTo(w, from, to)?.next ?? null;
}

// ===================================================================== spawning

/** How much of a place the gangs lean on: the share of its influence that is gang turf, and more where the war is. */
export function gangActivity(w: World, loc: Location): number {
  let a = 0;
  for (const [id, share] of Object.entries(influenceOf(loc))) if (w.factions[id]?.kind === 'gang') a += share;
  const [g1, g2] = w.situation.warringGangs;
  const at = influenceOf(loc);
  if ((at[g1] ?? 0) > 0 || (at[g2] ?? 0) > 0) a *= 1.25;
  return Math.min(1, a);
}

const CARGO = [
  'a sealed Atlas payroll case',
  'a cooler of organs on ice, labeled "RUSH"',
  'four hundred sealed boxes of doughnuts',
  'a board member\'s dry-cleaning (eight suits, all identical)',
  'a crate of pre-Fall whiskey with a customs seal',
  'a locked briefcase handcuffed to nothing',
  'a velvet bag of uncut Helix crystal',
];

/** The tithe a Demeter asks for, as a share of what she is carrying, and the least it will accept. */
const TITHE_RATE = [0, 0.25, 0.35, 0.5, 0.7];
const TITHE_FLOOR = [0, 40, 120, 350, 1000];

/** Some stay a long while, and some are through in a moment; a district rarely has two of the first kind, and happily has one of each. */
const SLOW = new Set(['demeter', 'ares']);
function crowding(model: string, live: Flight[]): number {
  const family = DRAGON_MODELS[model]!.family;
  let f = 1;
  for (const b of live) {
    if (b.kind === family) f = Math.min(f, 0.08);
    else if (SLOW.has(b.kind) && !SLOW.has(family)) f = Math.min(f, 0.6);
    else f = Math.min(f, 0.25);
  }
  return f;
}

/** Roving dragons are drawn to what they're for: heat, gangs, money, deliveries. */
function spawnNewModels(c: Ctx, loc: Location, live: Flight[]): void {
  const { w, rng } = c;
  const h = w.hero;
  const heat = w.heat.atlas ?? 0;
  const go = (model: string, p: number, count = 1): boolean => {
    if (!rng.chance(p * crowding(model, live))) return false;
    spawnFlight(c, model, count);
    return true;
  };
  // Hunters want heat, wherever she is.
  if (heat >= 3 && !loc.dungeon && go('artemis2', Math.min(0.05, 0.004 * heat), heat >= 8 ? 2 : 1)) return;
  // The rest need open ground to fly over: the street she is on, or the one outside the door.
  const street = w.locations[anchorOf(w, loc.id) ?? ''];
  if (!street) return;
  // (With nobody about and her outdoors, the ordinary patrol is rolled above, with the ordinary luck.)
  if ((live.length || !loc.outdoors) && go('artemis', 0.022, rng.weighted([1, 2, 3], (n) => (n === 3 ? 0.2 : 0.4)))) return;
  const act = gangActivity(w, street);
  if (act >= 0.3) {
    // Once a place has been raided, or the city has had a few raids, the next one is the Mk. IV.
    const worse = (w.counters[`ares_raids:${street.id}`] ?? 0) >= 1 || (w.counters.ares_raids ?? 0) >= 3;
    if (go(worse ? 'ares4' : 'ares2', (worse ? 0.03 : 0.012) * act)) return;
  }
  // It can smell money, and the further in it flies, the more it takes.
  const d = dangerOf(street);
  if (go(d < 18 ? 'demeter' : d < 30 ? 'demeter2' : d < 45 ? 'demeter3' : 'demeter4', 0.003 + Math.min(0.004, h.cash / 50000))) return;
  if (go('hermes', 0.003, rng.chance(0.3) ? 2 : 1)) return;
  go('hermes3', 0.0012);
}

/** Set a dragon to its visit: where it is, and what it means to do. */
function beginVisit(c: Ctx, f: Flight, m: DragonModel, district: Id[], entry: Id): Roam {
  const { w, rng } = c;
  const tp = temperOf(f);
  const long = rng.int(0, 1000) / 1000;
  const stay = m.pattern === 'prowl' ? 160 + Math.round(long * 100) : m.pattern === 'rampage' ? 130 + Math.round(long * 110) : m.pattern === 'deliver' ? 90 : m.traits.includes('tracks') ? 50 : 40;
  // A patient one stays longer, and one that has taken a spot stays to hold it.
  const territorial = tp.territoriality >= TERRITORIAL && !m.traits.includes('tracks');
  const until = w.clock + Math.round(stay * (0.6 + 0.8 * tp.patience) + (territorial ? 60 * tp.territoriality : 0));
  const goals: Id[] = [];
  if (m.pattern === 'deliver') {
    // A curious one makes more stops.
    const pool = district.filter((d) => d !== entry);
    for (let n = rng.int(2, 3) + Math.round(tp.curiosity * 3); n > 0 && pool.length; n--) goals.push(...pool.splice(rng.int(0, pool.length - 1), 1));
  }
  const r: Roam = { stage: 'stay', district, entry, nextAt: w.clock + 2, until, visited: [entry], goals, lastHit: w.clock, raided: [], away: 0, tended: w.clock, heroAt: w.hero.locationId };
  if (territorial) {
    // It picks a place where people are, and that is its place now.
    const spots = district.filter((d) => d !== entry);
    if (spots.length) r.den = rng.weighted(spots, (d) => 1 + npcsAt(w, d).filter((n) => !n.tags.includes('dragon')).length);
  }
  f.roam = r;
  return r;
}

export interface SpawnOpts {
  /** Where it comes in, if not somewhere at the edge of the district. */
  at?: Id;
  /** Never forgotten: see `Flight.persist`. */
  persist?: boolean;
  /** Dials to set rather than roll. */
  temper?: Partial<DragonTemper>;
}

/** A dragon flies in. Returns it, or null if there was no open ground to fly it to. */
export function spawnFlight(c: Ctx, model: string, count: number, opts: SpawnOpts = {}): Flight | null {
  const { w, rng } = c;
  const h = w.hero;
  const m = DRAGON_MODELS[model]!;
  const here = w.locations[h.locationId]!;

  // Hera isn't going anywhere: she is over wherever Blackbird is, for a few beats.
  if (!m.pattern) {
    const dragons = spawnGroup(c, model, count);
    const f: Flight = { kind: m.family, model, ids: dragons.map((d) => d.id), locationId: here.id, until: w.beat + 9, hidden: false, noticed: false, born: w.beat, clock: w.clock };
    w.flights.push(f);
    w.flight = f;
    const warned = scoutSaves(c);
    const hunting = w.mind.goals.find((g) => g.kind === 'dragon');
    if (warned && !(hunting && dragonReadiness(w, hunting) >= 0.5)) f.hidden = true;
    c.emit('dragon_flight', 'mixed', { variant: m.family, mark: m.mark, model, count, warned, place: here.name, first: !w.flags[`${m.family}_seen_before`] });
    w.flags[`${m.family}_seen_before`] = true;
    w.flags.dragon_known = true;
    return f;
  }

  const anchor = anchorOf(w, opts.at ?? h.locationId);
  if (!anchor) return null;
  const { nodes, dist } = districtAround(w, anchor);
  let entry = opts.at && nodes.includes(opts.at) ? opts.at : anchor;
  if (!opts.at) {
    // It comes in a couple of streets off, so she has a moment to hear it.
    const far = Math.min(3, Math.max(...nodes.map((n) => dist[n]!)));
    entry = rng.pick(nodes.filter((n) => dist[n] === far));
  }
  const dragons = opts.persist ? spawnPersistent(c, model, count, entry) : spawnGroup(c, model, count);
  for (const d of dragons) moveNpc(w, d, entry);
  const f: Flight = { kind: m.family, model, ids: dragons.map((d) => d.id), locationId: entry, until: w.beat + 100000, hidden: false, noticed: false, born: w.beat, clock: w.clock };
  if (opts.persist) f.persist = true;
  f.temper = { ...rollTemper(new Rng(`temper:${w.worldSeed}:${f.ids[0]}`), m.family), ...opts.temper };
  if (m.family === 'hermes' && m.traits.includes('swift')) f.cargo = rng.pick(CARGO);
  if (m.traits.includes('screams')) {
    f.phase = 'scream';
    f.arrives = w.beat + 2 + rng.int(0, 1);
  } else if (m.family === 'ares') {
    f.phase = 'raid';
  }
  beginVisit(c, f, m, nodes, entry);
  w.flights.push(f);
  announce(c, f, m);
  return f;
}

/** The flight event: it is in the district. */
function announce(c: Ctx, f: Flight, m: DragonModel): void {
  const { w } = c;
  c.emit('dragon_flight', 'mixed', { variant: m.family, mark: m.mark, model: f.model ?? f.kind, count: f.ids.length, warned: false, place: w.locations[f.locationId]!.name, first: !w.flags[`${m.family}_seen_before`], ...(f.cargo ? { cargo: f.cargo } : {}), ...(f.phase === 'scream' ? { screams: true } : {}) });
  w.flags[`${m.family}_seen_before`] = true;
  w.flags.dragon_known = true;
}

/** Dragons that last: their bodies have ids that survive the night's clear-out. */
function spawnPersistent(c: Ctx, model: string, count: number, at: Id): Npc[] {
  const { w, rng } = c;
  const out: Npc[] = [];
  for (let i = 0; i < count; i++) {
    const seq = (w.counters.dragon_seq = (w.counters.dragon_seq ?? 0) + 1);
    out.push(addNpc(w, spawnNpc(rng, `drg_${model}_${seq}`, model, at)));
  }
  return out;
}

// ===================================================================== a flight, beat by beat

function noticeChance(w: World, f: Flight): number {
  // Sharp-eyed ones notice sooner (a flight made without a temper of its own is average).
  const k = f.temper ? 0.6 + 0.8 * f.temper.alertness : 1;
  return baseNotice(w, f) * k;
}

function baseNotice(w: World, f: Flight): number {
  const sneak = sneakBonus(w);
  switch (f.model ?? f.kind) {
    case 'hermes3': return 0;
    case 'hermes': return Math.max(0.02, 0.06 - sneak * 0.5);
    case 'artemis2': return clamp(0.35 + 0.03 * (w.heat.atlas ?? 0) - sneak * 0.25, 0.15, 0.65);
    case 'demeter': case 'demeter2': case 'demeter3': case 'demeter4': return Math.max(0.06, 0.2 - sneak * 0.5);
    case 'artemis': return f.roam ? Math.max(0.05, 0.18 - sneak * 0.5) : Math.max(0.03, 0.12 - sneak * 0.5);
    default: return Math.max(0.03, (f.kind === 'hera' ? 0.2 : 0.12) - sneak * 0.5);
  }
}

function tendFlight(c: Ctx, f: Flight): void {
  if (f.roam) return tendRoamer(c, f);
  const { w } = c;
  // Something hanging over her (Hera) goes when she does, or when it has had its look.
  if (w.hero.locationId !== f.locationId || w.beat > f.until) {
    if (f.phase === 'demand' && w.hero.locationId === f.locationId) refuse(c, 'silence');
    else finish(c, f, w.hero.locationId !== f.locationId);
    return;
  }
  w.flight = f;
  encounter(c, f, flightModel(f));
}

/** She is with it. What it makes of her. */
function encounter(c: Ctx, f: Flight, m: DragonModel): void {
  const { w, rng } = c;
  switch (f.phase) {
    case 'demand':
      if (w.beat > f.until) refuse(c, 'silence');
      return;
    case 'raid':
      raidBeat(c, f, m);
      return;
    case 'scream':
      return;
    default: {
      // A territorial one doesn't wait to be asked: whoever is in its place, it goes for.
      if (f.roam?.den === f.locationId && !f.hidden && !f.noticed && rng.chance(0.2 + 0.5 * temperOf(f).territoriality)) {
        f.noticed = true;
        c.emit('dragon_territory', 'bad', { variant: 'attack', family: f.kind, mark: m.mark, place: w.locations[f.locationId]!.name });
        engage(c);
        return;
      }
      const p = noticeChance(w, f);
      if (!f.hidden && !f.noticed && p > 0 && rng.chance(p)) spotted(c);
    }
  }
}

function tendRoamer(c: Ctx, f: Flight): void {
  const { w } = c;
  const h = w.hero;
  const r = f.roam!;
  const m = flightModel(f);
  const elapsed = Math.max(0, (w.clock - (r.tended ?? w.clock)) / BASE_MIN_PER_BEAT);
  r.tended = w.clock;

  if (r.stage === 'away') {
    if (w.clock >= (r.returnAt ?? 0)) comeBack(c, f, m);
    return;
  }
  if (r.stage === 'leave') {
    flyOff(c, f, m, elapsed);
    return;
  }

  // An Ares announces itself before it gets going.
  if (f.phase === 'scream') {
    if (w.beat < (f.arrives ?? 0)) return;
    f.phase = 'raid';
    r.nextAt = w.clock;
    r.lastHit = w.clock;
    c.emit('ares_arrive', 'bad', { mark: m.mark, standing: !!f.stand });
  }

  // Walking away from a demand is refusing with extra steps: it shoots her in the back, and the arrears stand.
  if (f.phase === 'demand' && f.locationId !== h.locationId) {
    const hit = m.mark * c.rng.int(4, 9);
    h.hp = Math.max(1, h.hp - hit);
    addHeat(w, 'atlas', 1);
    w.counters.tithe_debt = Math.min(3000, (w.counters.tithe_debt ?? 0) + (f.demand ?? 0));
    c.emit('tithe_evade', 'bad', { mark: m.mark, owed: w.counters.tithe_debt, hit });
    f.phase = undefined;
    f.noticed = false;
    f.hidden = false;
    r.met = false;
  }

  if (f.phase !== 'demand') advance(c, f, m);
  // A fast one can go through where she is between one beat and the next. She doesn't get to do anything about it, but she knows.
  if (r.flash) {
    if (f.locationId !== h.locationId) passing(c, f, m, r.flash);
    r.flash = undefined;
    r.passed = false;
  }
  if (!w.flights.includes(f) || r.stage !== 'stay') return;

  const here = f.locationId === h.locationId;
  if (here && !r.met) meet(c, f, m);
  else if (!here && r.met) parted(c, f, m);
  else if (!here) telegraph(c, f, m);
  r.met = here;
  r.heroAt = h.locationId;
  if (here) {
    w.flight = f;
    encounter(c, f, m);
  }
}

/** It moves, as many times as the time that has passed lets it. */
function advance(c: Ctx, f: Flight, m: DragonModel): void {
  const { w } = c;
  const r = f.roam!;
  for (let i = 0; i < 40 && r.stage === 'stay' && w.clock >= r.nextAt && w.flights.includes(f); i++) {
    const step = nextStep(c, f, m);
    if (step === 'leave') {
      takeOff(c, f, m);
      return;
    }
    if (step.to !== f.locationId) {
      const from = f.locationId;
      placeFlight(w, f, step.to);
      r.nextAt += hopMinutes(m.speed);
      arrived(c, f, m, w.locations[step.to]!);
      if (step.to === w.hero.locationId) {
        if (!m.traits.includes('swift')) {
          // It has found her. However long she was out of reach of the clock, that is where the beat ends.
          r.nextAt = Math.max(r.nextAt, w.clock) + step.dwell;
          return;
        }
        // A fast one is through before she can do anything about it.
        r.passed = true;
      } else if (from === w.hero.locationId && r.passed) {
        r.flash = step.to;
        r.passed = false;
      }
    }
    r.nextAt += step.dwell;
  }
}

type Step = { to: Id; dwell: number } | 'leave';

/** What it does next: the heart of each kind. */
function nextStep(c: Ctx, f: Flight, m: DragonModel): Step {
  const { w, rng } = c;
  const h = w.hero;
  const r = f.roam!;
  const here = f.locationId;
  const tp = temperOf(f);
  if (r.nextAt >= r.until) return 'leave';
  // Crashes about, and gets bored if nobody gives it anything to hit.
  if (m.pattern === 'rampage' && w.clock - r.lastHit >= boredAfter(f)) return 'leave';
  // A territorial one takes its spot (after its errands, if it has any) and holds it against anyone who comes near.
  if (r.den && (m.pattern !== 'deliver' || !r.goals.length)) {
    if (here !== r.den) {
      const to = hopToward(w, r, here, r.den);
      if (to) return { to, dwell: 0 };
    } else {
      defend(c, f, m);
      return { to: here, dwell: rng.int(10, 20) };
    }
  }
  switch (m.pattern) {
    case 'prowl': {
      // Slow and thorough, going where the people are and to the places it has not been (a curious one most of all).
      const opts = neighbours(w, r, here);
      const slow = 0.6 + 0.8 * tp.patience;
      if (!opts.length) return { to: here, dwell: Math.round(rng.int(6, 12) * slow) };
      const to = rng.weighted(opts, (o) => 1 + 0.6 * npcsAt(w, o).filter((n) => !n.tags.includes('dragon')).length + (r.visited.includes(o) ? 0 : 1 + 4 * tp.curiosity));
      return { to, dwell: Math.round(rng.int(8, 16) * slow) };
    }
    case 'rampage': {
      let to: Id | null = f.stand && r.district.includes(h.locationId) ? hopToward(w, r, here, h.locationId) : null;
      if (!to) {
        const opts = neighbours(w, r, here);
        const fresh = opts.filter((o) => !r.visited.includes(o));
        to = !opts.length ? here : fresh.length && rng.chance(0.15 + 0.75 * tp.curiosity) ? rng.pick(fresh) : rng.pick(opts);
      }
      return { to, dwell: rng.int(2, 4) };
    }
    case 'deliver': {
      if (r.goals[0] === here) {
        r.goals.shift();
        return { to: here, dwell: rng.int(2, 4) };
      }
      if (!r.goals.length) return 'leave';
      const to = hopToward(w, r, here, r.goals[0]!);
      if (!to) {
        r.goals.shift();
        return { to: here, dwell: 0 };
      }
      return { to, dwell: 0 };
    }
    case 'sweep': {
      // A quick pass over everything, once. A hunter would sooner just go to her.
      if (m.traits.includes('tracks') && r.district.includes(h.locationId) || m.traits.includes('tracks') && hopDist(w, here, h.locationId) <= 6) {
        if (h.locationId === here) return { to: here, dwell: 3 };
        const next = routeTo(w, here, h.locationId)?.next;
        if (next) return { to: next, dwell: 0 };
      }
      const todo = r.district.filter((d) => !r.visited.includes(d));
      if (!todo.length) return 'leave';
      let best = todo[0]!;
      let bestD = 99;
      for (const t of todo) {
        const d = hopDist(w, here, t);
        if (d < bestD) {
          best = t;
          bestD = d;
        }
      }
      const to = hopToward(w, r, here, best);
      if (!to) {
        r.visited.push(best);
        return { to: here, dwell: 0 };
      }
      return { to, dwell: 1 };
    }
    default:
      return 'leave';
  }
}

/** It has come to a place. */
function arrived(c: Ctx, f: Flight, m: DragonModel, loc: Location): void {
  const { w } = c;
  const r = f.roam!;
  if (!r.visited.includes(loc.id)) r.visited.push(loc.id);
  if (loc.id === w.hero.locationId) return; // she is here: it deals with her, and them, in front of her
  const crowd = npcsAt(w, loc.id).filter((n) => !n.tags.includes('dragon'));
  const tp = temperOf(f);
  if (m.family === 'ares') {
    // A hot-tempered one hits nearly every time it lands among people; a calm one sometimes lets them be.
    const hits = crowd.length && c.rng.chance(0.35 + 0.65 * tp.aggression) ? c.rng.int(1, m.mark >= 4 ? 3 : 2) : 0;
    for (const n of pickSome(c, crowd, hits)) hurt(c, n, 'was accused of gang membership by an Ares dragon');
    if (hits) noteRaid(c, f, loc);
  } else {
    // The prowl takes its share from anyone it finds.
    if (m.family === 'demeter') for (const n of crowd) n.cash = Math.floor(n.cash * (0.85 - 0.5 * tp.aggression));
    // And any of them that is that way inclined hurts someone for no reason at all.
    if (tp.aggression > 0.6 && crowd.length && c.rng.chance((tp.aggression - 0.5) * 0.6)) hurt(c, c.rng.pick(crowd), 'was shot by a dragon for no reason');
  }
}

/** A dragon sitting on its spot goes for anyone who is there. */
function defend(c: Ctx, f: Flight, m: DragonModel): void {
  const { w, rng } = c;
  const tp = temperOf(f);
  const loc = w.locations[f.locationId]!;
  if (loc.id === w.hero.locationId) return; // she is dealt with in front of her
  const hit = npcsAt(w, loc.id).filter((n) => !n.tags.includes('dragon') && rng.chance(tp.territoriality * (0.3 + 0.5 * tp.aggression)));
  for (const n of hit) hurt(c, n, 'was shot for trespassing by a dragon');
  if (hit.length && m.family === 'ares') noteRaid(c, f, loc);
  if (hit.length) f.roam!.lastHit = w.clock;
}

function pickSome(c: Ctx, from: Npc[], k: number): Npc[] {
  const pool = [...from];
  const out: Npc[] = [];
  for (let i = 0; i < k && pool.length; i++) out.push(...pool.splice(c.rng.int(0, pool.length - 1), 1));
  return out;
}

/** Passers-by are hurt past saving, and die in a while (see dying.ts); people who matter wake up later with a headache and a record. */
function hurt(c: Ctx, n: Npc, how: string): 'dying' | 'down' {
  const { w, rng } = c;
  remember(n, how);
  if (n.ephemeral) {
    startDying(w, n, rng.int(15, 100) / 100);
    return 'dying';
  }
  n.downUntil = w.beat + 30;
  return 'down';
}

function placeFlight(w: World, f: Flight, to: Id): void {
  f.locationId = to;
  for (const id of f.ids) {
    const n = w.npcs[id];
    if (n) moveNpc(w, n, to);
  }
}

// ---- what she sees of it

/** It has turned up where she is. */
function meet(c: Ctx, f: Flight, m: DragonModel): void {
  const { w } = c;
  const h = w.hero;
  f.hidden = false;
  f.noticed = false;
  f.roam!.passed = false;
  if (f.phase === 'scream') return;
  if (f.coverIn === h.locationId) {
    f.hidden = true;
  } else {
    const warned = scoutSaves(c);
    // A warning keeps her out of sight, unless she is out hunting and ready for it: then it is a head start.
    const hunting = w.mind.goals.find((g) => g.kind === 'dragon');
    if (warned && !(hunting && dragonReadiness(w, hunting) >= 0.5)) f.hidden = true;
  }
  c.emit('dragon_close', 'mixed', { variant: f.kind, mark: m.mark, count: f.ids.length, place: w.locations[h.locationId]!.name, hidden: f.hidden, cargo: f.cargo ?? '' });
  if (f.roam!.den === h.locationId && !f.hidden) c.emit('dragon_territory', 'bad', { variant: 'claim', family: f.kind, mark: m.mark, place: w.locations[h.locationId]!.name });
}

/** It, or she, has moved on. */
function parted(c: Ctx, f: Flight, m: DragonModel): void {
  const { w } = c;
  const left = f.roam!.heroAt !== w.hero.locationId;
  c.emit('dragon_pass', 'mixed', { variant: f.kind, mark: m.mark, hidden: f.hidden, left, count: f.ids.length });
  f.hidden = false;
  f.noticed = false;
  f.coverIn = undefined;
  if (f.phase === 'demand') f.phase = undefined;
}

/** It went through where she is, and was gone. She sees which way. */
function passing(c: Ctx, f: Flight, m: DragonModel, toward: Id): void {
  const { w } = c;
  const at = w.hero.locationId;
  const loc = w.locations[at]!;
  const heading = loc.exits.find((e) => e.to === toward)?.label ?? w.locations[toward]?.name ?? 'the rooftops';
  f.roam!.seen = { at, toward, beat: w.beat };
  c.emit('dragon_close', 'mixed', { variant: f.kind, mark: m.mark, count: f.ids.length, place: loc.name, passing: true, heading, cargo: f.cargo ?? '' });
}

/** A sound of it from the next street over. */
function telegraph(c: Ctx, f: Flight, m: DragonModel): void {
  const { w } = c;
  const r = f.roam!;
  if (hopDist(w, w.hero.locationId, f.locationId) !== 1 || w.clock - (r.nearAt ?? -999) < 25) return;
  r.nearAt = w.clock;
  c.emit('dragon_near', 'mixed', { variant: f.kind, mark: m.mark, count: f.ids.length });
}

// ---- leaving

function takeOff(c: Ctx, f: Flight, m: DragonModel): void {
  const { w } = c;
  const r = f.roam!;
  r.stage = 'leave';
  r.away = 0;
  r.met = false;
  f.phase = undefined;
  const d = hopDist(w, w.hero.locationId, f.locationId);
  if (d <= 2) c.emit('dragon_depart', 'mixed', { variant: f.kind, mark: m.mark, count: f.ids.length, here: d === 0, hidden: f.hidden });
  if (f.kind === 'ares' && f.sheltered && !w.locations[w.hero.locationId]?.outdoors) c.emit('ares_all_clear', 'good', { mark: m.mark });
  f.hidden = false;
  f.noticed = false;
}

/** It climbs away. Once it is far enough from her it is not worth keeping track of. */
function flyOff(c: Ctx, f: Flight, m: DragonModel, elapsed: number): void {
  const { w, rng } = c;
  const r = f.roam!;
  r.away += reachPerBeat(w, m.speed) * Math.max(1, elapsed);
  if (hopDist(w, w.hero.locationId, f.locationId) + r.away < DESPAWN_AT) return;
  if (f.persist) {
    // Gone for a while, and then it is back.
    r.stage = 'away';
    r.returnAt = w.clock + rng.int(120, 300);
    for (const id of f.ids) if (w.npcs[id]) moveNpc(w, w.npcs[id]!, AWAY);
    return;
  }
  const ids = [...f.ids];
  dropFlights(w, ids);
  for (const id of ids) removeNpc(w, id);
}

/** A persistent dragon returns to the district she is in. */
function comeBack(c: Ctx, f: Flight, m: DragonModel): void {
  const { w, rng } = c;
  const anchor = anchorOf(w, w.hero.locationId);
  if (!anchor) {
    f.roam!.returnAt = w.clock + 30;
    return;
  }
  const { nodes, dist } = districtAround(w, anchor);
  const far = Math.min(3, Math.max(...nodes.map((n) => dist[n]!)));
  const entry = rng.pick(nodes.filter((n) => dist[n] === far));
  for (const id of f.ids) {
    const n = w.npcs[id];
    if (n) {
      n.hp = n.maxHp;
      moveNpc(w, n, entry);
    }
  }
  f.locationId = entry;
  f.hidden = false;
  f.noticed = false;
  f.phase = m.traits.includes('screams') ? 'scream' : m.family === 'ares' ? 'raid' : undefined;
  if (f.phase === 'scream') f.arrives = w.beat + 2 + rng.int(0, 1);
  beginVisit(c, f, m, nodes, entry);
  announce(c, f, m);
}

/** The flight is over: it moves on, or she has. */
function finish(c: Ctx, f: Flight, left: boolean): void {
  const { w } = c;
  const m = flightModel(f);
  for (const id of f.ids) if (w.npcs[id]) w.npcs[id]!.alive = false;
  c.emit('dragon_pass', 'mixed', { variant: f.kind, mark: m.mark, hidden: f.hidden, left, count: f.ids.length });
  dropFlights(w, f.ids);
}

/** It has had what it came for, from her. A roaming one carries on its way and pays her no further mind. */
function concluded(c: Ctx, f: Flight): void {
  if (f.roam) {
    f.phase = undefined;
    f.hidden = true;
    f.noticed = false;
    f.roam.nextAt = c.w.clock + 3;
    return;
  }
  finish(c, f, false);
}

function spotted(c: Ctx): void {
  const { w } = c;
  const f = w.flight!;
  const m = flightModel(f);
  if (hasTrait(f.model, 'swift')) return;
  f.noticed = true;
  c.emit('dragon_notice', 'bad', { variant: f.kind, mark: m.mark, count: f.ids.length });
  if (f.kind === 'demeter') beginDemand(c);
  else if (f.kind === 'hermes') {
    // Couriers are mostly not violent. Mostly.
    const tp = temperOf(f);
    if (tp.aggression > 0.7 && c.rng.chance(tp.aggression - 0.5)) engage(c);
    else courierFine(c);
  } else engage(c);
}

const CAUSE: Record<string, string> = {
  hera: 'a Hera Mk. V',
  artemis: 'an Artemis patrol',
  artemis2: 'an Artemis Mk. II hunter dragon',
  hermes: 'a Hermes courier dragon',
  hermes3: 'a Hermes Mk. III express dragon',
  demeter: "a Demeter bounty dragon's tithe", demeter2: "a Demeter bounty dragon's tithe", demeter3: "a Demeter bounty dragon's tithe", demeter4: "a Demeter bounty dragon's tithe",
  ares2: 'an Ares Mk. II gang-buster dragon',
  ares4: 'an Ares Mk. IV gang-buster dragon',
};

function engage(c: Ctx, cause?: string): void {
  const f = c.w.flight!;
  const foes = flightFoes(c.w);
  if (!foes.length) return;
  f.noticed = true;
  const ids = [...f.ids];
  fight(c, foes, { cause: cause ?? CAUSE[f.model ?? f.kind] ?? 'a dragon', joiners: false });
  dropFlights(c.w, ids);
}

// ===================================================================== the courier

/** A Hermes that spots her was looking for somebody who isn't in. */
function courierFine(c: Ctx): void {
  const { w, rng } = c;
  const f = w.flight!;
  const fine = Math.min(w.hero.cash, rng.int(10, 40));
  w.hero.cash -= fine;
  c.emit('courier_fine', 'bad', { fine });
  concluded(c, f);
}

// ===================================================================== the tithe

/** It is always winter. The summer distribution is announced at every encounter and has never once taken place. */
export const demeterSeason = (_w: World): 'summer' | 'winter' => 'winter';

function beginDemand(c: Ctx): void {
  const { w } = c;
  const f = w.flight!;
  const m = flightModel(f);
  const owed = w.counters.tithe_debt ?? 0;
  const amount = Math.round(Math.max(TITHE_FLOOR[m.mark] ?? 40, w.hero.cash * (TITHE_RATE[m.mark] ?? 0.25)) * (0.85 + 0.3 * temperOf(f).aggression) + owed);
  f.phase = 'demand';
  f.demand = amount;
  f.until = w.beat + 3;
  c.emit('tithe_demand', 'bad', { mark: m.mark, amount, owed, cash: w.hero.cash, season: demeterSeason(w), name: w.npcs[f.ids[0]!]?.name ?? 'DEMETER' });
}

function payTithe(c: Ctx, amount: number): void {
  const { w, rng } = c;
  const h = w.hero;
  const f = w.flight!;
  const m = flightModel(f);
  const owed = Math.max(0, amount - h.cash);
  if (h.cash >= amount) {
    h.cash -= amount;
    w.counters.tithe_debt = 0;
    w.heat.atlas = Math.max(0, (w.heat.atlas ?? 0) - 1);
    c.emit('tithe_pay', 'bad', { variant: 'full', amount, mark: m.mark });
  } else if (h.cash > 0) {
    const took = h.cash;
    h.cash = 0;
    w.counters.tithe_debt = Math.min(3000, owed);
    c.emit('tithe_pay', 'bad', { variant: 'short', amount: took, owed, mark: m.mark });
  } else {
    const hit = rng.int(2, 6) * m.mark;
    h.hp = Math.max(1, h.hp - hit);
    w.counters.tithe_debt = Math.min(3000, amount);
    c.emit('tithe_pay', 'bad', { variant: 'broke', hit, owed: amount, mark: m.mark });
  }
  concluded(c, f);
}

/** Saying no, or saying nothing, is a threat to public security. */
function refuse(c: Ctx, how: 'refuse' | 'silence' | 'haggle'): void {
  const { w } = c;
  const f = w.flight ?? w.flights.find((x) => x.phase === 'demand')!;
  w.flight = f;
  c.emit('tithe_refuse', 'bad', { variant: how, mark: flightModel(f).mark });
  addHeat(w, 'atlas', 1);
  engage(c);
}

/** A dragon is asking her for money, to her face, and the clock is running: she answers before she gets back to anything else. */
const DEMAND_URGE = 1.2;

function demandCandidates(w: World, f: Flight): Candidate[] {
  const h = w.hero;
  const foes = flightFoes(w);
  const total = foes.reduce((a, n) => a + n.power, 0);
  const ratio = total / (heroPower(w) * clamp(h.hp / h.maxHp, 0.3, 1));
  const risk = Math.min(4, clamp(ratio - 0.6, 0, 9) * 1.5);
  const amount = f.demand ?? 0;
  return [
    {
      key: 'pay_tithe', drives: {}, smart: 1.5, bonus: DEMAND_URGE + (ratio > 1 ? 0.8 : 0.1),
      run: (c) => payTithe(c, amount),
    },
    {
      key: 'haggle_tithe', drives: { greed: 0.9, pride: 0.3 }, smart: 0.6, bonus: DEMAND_URGE, risk: risk * 0.4,
      run: (c) => {
        const hh = c.w.hero;
        if (c.rng.chance(clamp(0.2 + hh.charm * 0.04, 0.1, 0.7))) {
          const cut = Math.max(1, Math.round(amount / 2));
          c.emit('tithe_haggle', 'good', { variant: 'win', amount: cut, was: amount });
          f.demand = cut;
          payTithe(c, cut);
        } else {
          c.emit('tithe_haggle', 'bad', { variant: 'fail', amount });
          refuse(c, 'haggle');
        }
      },
    },
    {
      key: 'refuse_tithe', drives: { bravery: 1.0, pride: 0.9, quest: 0.5 }, bonus: DEMAND_URGE + 0.1, risk,
      run: (c) => refuse(c, 'refuse'),
    },
  ];
}

// ===================================================================== the gang buster

/** Everyone is a suspect. The dragon says so, in the name of whichever gang is nearest to hand. */
function raidBeat(c: Ctx, f: Flight, m: DragonModel): void {
  const { w, rng } = c;
  const h = w.hero;
  const crowd = npcsAt(w, f.locationId).filter((n) => !f.ids.includes(n.id) && !n.tags.includes('dragon') && !h.companions.some((a) => a.npcId === n.id));
  const tp = temperOf(f);
  const hits = Math.min(crowd.length, rng.chance(0.4 + 0.6 * tp.aggression) ? rng.int(1, m.mark >= 4 ? 3 : 2) : 0);
  const gangs = Object.values(GANGS);
  for (const n of pickSome(c, crowd, hits)) {
    const fate = hurt(c, n, 'was accused of gang membership by an Ares dragon');
    c.emit('ares_accuse', 'mixed', { variant: 'victim', npc: n.name, gang: rng.pick(gangs), fate, mark: m.mark });
  }
  if (hits) noteRaid(c, f, w.locations[f.locationId]!);
  if (f.hidden) return;
  const p = ((m.mark >= 4 ? 0.55 : 0.35) * ((0.5 + tp.aggression) / 1.35)) + (hits ? 0 : 0.3) - sneakBonus(w) * 0.5;
  if (rng.chance(clamp(p, 0.05, 0.9))) accuseHero(c, f);
}

function accuseHero(c: Ctx, f: Flight): void {
  const m = flightModel(f);
  c.emit('ares_accuse', 'bad', { variant: 'hero', gang: c.rng.pick(Object.values(GANGS)), mark: m.mark });
  engage(c);
}

/** A raid leaves the place a little less of a gang's, and a mark on the city. Enough of them and the next thing to arrive is worse. */
function noteRaid(c: Ctx, f: Flight, loc: Location): void {
  const { w } = c;
  const r = f.roam;
  if (r) {
    r.lastHit = w.clock;
    if (r.raided.includes(loc.id)) return;
    r.raided.push(loc.id);
  }
  w.counters[`ares_raids:${loc.id}`] = (w.counters[`ares_raids:${loc.id}`] ?? 0) + 1;
  // (A rampage across several streets is one raid on the city, however many it hit.)
  if (!r || r.raided.length === 1) w.counters.ares_raids = (w.counters.ares_raids ?? 0) + 1;
  const inf = { ...influenceOf(loc) };
  for (const id of Object.keys(inf)) if (w.factions[id]?.kind === 'gang') inf[id]! *= 0.8;
  loc.influence = inf;
}

/** Somewhere to be indoors, one step from here. */
function shelterFrom(w: World, loc: Location): Location | null {
  for (const e of loc.exits) {
    const dest = w.locations[e.to];
    if (!e.hidden && dest && !dest.outdoors && !e.gate && !isShut(w, e.to)) return dest;
  }
  return null;
}

// ===================================================================== what she can do about it

/** What she can do while dragons are about. A clueless Blackbird engages; a competent one reads the odds. */
export function dragonCandidates(w: World): Candidate[] {
  const f = w.flight;
  const h = w.hero;
  const loc0 = w.locations[h.locationId]!;
  // Hunting them means looking up: dragons patrol, and an eye on the sky finds the patrol sooner.
  if (!f && !w.flights.length && loc0.outdoors && loc0.id !== 'overpass' && w.mind.goals.some((g) => g.kind === 'dragon' && g.mode !== 'apollo')) {
    return [{
      key: 'scan_skies', drives: {}, bonus: -0.2,
      run: (c) => {
        c.w.counters.skywatch = c.w.beat;
        c.emit('scan_skies', 'mixed', { place: loc0.name, first: !c.w.flags.skywatched });
        c.w.flags.skywatched = true;
      },
    }];
  }

  const out: Candidate[] = [];

  // A scream is going up somewhere in the district: the only questions are where she'll be when it lands, and whether she means to meet it.
  const screaming = w.flights.find((x) => x.phase === 'scream' && x.roam?.stage === 'stay');
  if (screaming && loc0.outdoors) {
    const foes = screaming.ids.map((id) => w.npcs[id]).filter(alive);
    const ratio = foes.reduce((a, n) => a + n.power, 0) / (heroPower(w) * clamp(h.hp / h.maxHp, 0.3, 1));
    const risk = Math.min(4, clamp(ratio - 0.6, 0, 9) * 1.5);
    out.push({
      key: 'shelter_scream', drives: {}, smart: 2.4, bonus: ratio > 1 ? 0.9 : 0,
      run: (c) => {
        const inside = shelterFrom(c.w, c.w.locations[c.w.hero.locationId]!);
        screaming.sheltered = true;
        if (inside) {
          relocate(c.w, inside.id);
          c.emit('ares_shelter', 'good', { variant: 'door', place: inside.name });
        } else {
          screaming.coverIn = c.w.hero.locationId;
          c.emit('ares_shelter', 'good', { variant: 'cover' });
        }
      },
    });
    out.push({
      key: 'stand_ground', drives: { bravery: 1.0, pride: 0.8, quest: 0.7 }, bonus: 0.1, risk,
      run: (c) => {
        screaming.stand = true;
        c.emit('ares_stand', 'mixed', {});
      },
    });
    return out;
  }

  // One close by, and she's outdoors: she could get off the street.
  if (loc0.outdoors && !f) {
    const close = w.flights.find((x) => x.roam?.stage === 'stay' && hopDist(w, h.locationId, x.locationId) === 1);
    if (close && shelterFrom(w, loc0)) {
      out.push({
        key: 'duck_inside', drives: {}, smart: 1.8, bonus: 0.2,
        run: (c) => {
          const inside = shelterFrom(c.w, c.w.locations[c.w.hero.locationId]!);
          if (!inside) return;
          relocate(c.w, inside.id);
          c.emit('dragon_duck', 'good', { variant: close.kind, place: inside.name });
        },
      });
    }
  }

  if (!f || f.locationId !== h.locationId) return out;
  if (f.phase === 'demand') return [...out, ...demandCandidates(w, f)];
  if (f.hidden || f.noticed) return out;
  const foes = flightFoes(w);
  if (!foes.length) return out;
  const m = flightModel(f);
  const swift = m.traits.includes('swift');
  const grim = f.kind === 'hera' || f.model === 'ares4';
  const hera = f.kind === 'hera';
  const hunter = m.traits.includes('tracks');
  const total = foes.reduce((a, n) => a + n.power, 0);
  // A hurt hero is a weaker hero. Competent ones notice.
  const ratio = total / (heroPower(w) * clamp(h.hp / h.maxHp, 0.3, 1));
  const risk = Math.min(4, clamp(ratio - 0.6, 0, 9) * 1.5);

  if (swift) {
    // Too quick to be caught standing still: she has to run it down, and whether she can is a matter of her speed and its.
    out.push({
      key: 'chase_flight', drives: { greed: 1.0, pride: 0.6, bravery: 0.5 }, bonus: 0.1, risk: 0.2,
      run: (c) => {
        const caught = runsDown(c.w, m.speed);
        c.emit('dragon_chase', caught ? 'good' : 'bad', { variant: caught ? 'caught' : 'lost', mark: m.mark, cargo: f.cargo ?? '' });
        if (caught) {
          engage(c);
        } else {
          train(c, 'athletics', 3);
          takeOff(c, f, m);
        }
      },
    });
  } else {
    out.push({
      key: 'engage_flight', drives: { bravery: 1.0, pride: 0.8, quest: 0.9 }, bonus: 0.2, risk,
      run: (c) => {
        c.emit('dragon_engage', 'mixed', { variant: f.kind, mark: m.mark, count: foes.length });
        engage(c);
      },
    });
  }
  out.push({
    key: 'hide_flight', drives: {}, smart: grim ? 2.4 : 1.0, bonus: ratio > 1 ? 0.7 : 0,
    run: (c) => {
      const { w: ww, rng } = c;
      if (rng.chance(clamp(0.55 + sneakBonus(ww) + ww.hero.reflex * 0.03 - (hera ? 0.05 : 0) - (hunter ? 0.25 : 0), 0.2, 0.92))) {
        f.hidden = true;
        train(c, 'sneak', 2);
        c.emit('dragon_hide', 'good', { variant: 'ok', kind: f.kind, mark: m.mark });
      } else {
        c.emit('dragon_hide', 'bad', { variant: 'fail', kind: f.kind, mark: m.mark });
        spotted(c);
      }
    },
  });
  out.push({
    key: 'gawk_flight', drives: { curiosity: 0.8, pride: 0.1 }, risk: grim ? 1.2 : 0.3,
    run: (c) => {
      c.w.flags.dragon_known = true;
      c.emit('dragon_gawk', 'mixed', { variant: f.kind, mark: m.mark, cargo: f.cargo ?? '' });
      if (c.rng.chance(grim ? 0.35 : 0.15)) spotted(c);
    },
  });
  out.push({
    key: 'film_flight', drives: { pride: 0.9, curiosity: 0.5, greed: 0.3 }, risk: grim ? 1.5 : 0.5,
    run: (c) => {
      c.w.hero.fame += grim ? 8 : swift ? 6 : 4;
      c.emit('dragon_film', 'good', { variant: f.kind, mark: m.mark, cargo: f.cargo ?? '', fame: Math.floor(c.w.hero.fame) });
      if (c.rng.chance(grim ? 0.5 : 0.25)) spotted(c);
    },
  });
  return [...out];
}
