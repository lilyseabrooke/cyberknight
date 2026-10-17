import type { Ctx, Flight, Id, Location, Npc, World } from './types';
import { addHeat, fight, heroPower, npcsAt, relocate, remember } from './combat';
import { clamp, spawnGroup, type Candidate } from './candidate';
import { scoutSaves, sneakBonus } from './extras';
import { train } from './skills';
import { dragonReadiness } from './pursuit';
import { Rng } from './rng';
import { BASE_MIN_PER_BEAT } from './clock';
import { moveNpc } from './population';
import { routeTo } from './plans';
import { influenceOf } from './factions';
import { isShut } from './shutdown';
import { GANGS } from './content/archetypes';
import { dangerOf } from './grade';
import { DRAGON_MODELS, flightModel, reachPerBeat, runsDown, hasTrait, type DragonModel } from './dragonmodels';

const alive = (n: Npc | undefined): n is Npc => !!n && n.alive;

const flightFoes = (w: World): Npc[] => (w.flight?.ids ?? []).map((id) => w.npcs[id]).filter(alive);

/** Dragons that aren't Apollo don't stay put. They fly over, and she gets a few beats to decide who she is. */
export function ambientDragons(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const f = w.flight;

  if (f) {
    tendFlight(c, f);
    return;
  }

  if (loc.id === 'overpass' || w.beat < 12) return;
  if (loc.outdoors) {
    if (!w.flags.hera_seen && rng.chance(0.004)) {
      w.flags.hera_seen = true;
      spawnFlight(c, 'hera', 1);
    } else if (rng.chance(0.022 + (w.counters.skywatch === w.beat - 1 ? 0.1 + 0.01 * h.hack : 0))) {
      spawnFlight(c, 'artemis', rng.weighted([1, 2, 3], (n) => (n === 3 ? 0.2 : 0.4)));
    }
  }
  // The newer models draw from a stream of their own, so the luck of everything above (and after) is the same as ever.
  // `quiet_skies` keeps them home, for a test that follows a night to see something else.
  if (!w.flight && !w.flags.quiet_skies) spawnNewModels({ ...c, rng: new Rng(`${w.seed}:dragons:${w.beat}`) }, loc);
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

/** Roving dragons are drawn to what they're for: heat, gangs, money, deliveries. */
function spawnNewModels(c: Ctx, loc: Location): void {
  const { w, rng } = c;
  const h = w.hero;
  const heat = w.heat.atlas ?? 0;
  // Hunters want heat, wherever she is.
  if (heat >= 3 && !loc.dungeon && rng.chance(Math.min(0.05, 0.004 * heat))) return spawnFlight(c, 'artemis2', heat >= 8 ? 2 : 1);
  if (!loc.outdoors) return;
  const act = gangActivity(w, loc);
  if (act >= 0.3) {
    // Once a place has been raided, or the city has had a few raids, the next one is the Mk. IV.
    const worse = (w.counters[`ares_raids:${loc.id}`] ?? 0) >= 1 || (w.counters.ares_raids ?? 0) >= 3;
    if (worse ? rng.chance(0.03 * act) : rng.chance(0.012 * act)) return spawnFlight(c, worse ? 'ares4' : 'ares2', 1);
  }
  // It can smell money, and the further in it flies, the more it takes.
  if (rng.chance(0.003 + Math.min(0.004, h.cash / 50000))) {
    const d = dangerOf(loc);
    return spawnFlight(c, d < 18 ? 'demeter' : d < 30 ? 'demeter2' : d < 45 ? 'demeter3' : 'demeter4', 1);
  }
  if (rng.chance(0.003)) return spawnFlight(c, 'hermes', rng.chance(0.3) ? 2 : 1);
  if (rng.chance(0.0012)) return spawnFlight(c, 'hermes3', 1);
}

const FLIGHT_BEATS: Record<string, number> = { hera: 9, artemis: 7, artemis2: 8, hermes: 6, hermes3: 5, demeter: 8, demeter2: 8, demeter3: 8, demeter4: 8, ares2: 5 };

export function spawnFlight(c: Ctx, model: string, count: number): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const m = DRAGON_MODELS[model]!;
  const dragons = spawnGroup(c, model, count);
  const f: Flight = {
    kind: m.family,
    model,
    ids: dragons.map((d) => d.id),
    locationId: loc.id,
    until: w.beat + (FLIGHT_BEATS[model] ?? 7),
    hidden: false,
    noticed: false,
    born: w.beat,
    clock: w.clock,
  };
  if (m.family === 'hermes' && m.traits.includes('swift')) f.cargo = rng.pick(CARGO);
  if (m.family === 'ares') {
    if (m.traits.includes('screams')) {
      f.phase = 'scream';
      f.arrives = w.beat + 2 + rng.int(0, 1);
      f.until = f.arrives + 5;
    } else {
      f.phase = 'raid';
    }
  }
  w.flight = f;
  const warned = scoutSaves(c);
  // A warning keeps her out of sight, unless she is out hunting and ready for it: then it is a head start.
  const hunting = w.mind.goals.find((g) => g.kind === 'dragon');
  if (warned && !(hunting && dragonReadiness(w, hunting) >= 0.5)) f.hidden = true;
  c.emit('dragon_flight', 'mixed', { variant: m.family, mark: m.mark, model, count, warned, place: loc.name, first: !w.flags[`${m.family}_seen_before`], ...(f.cargo ? { cargo: f.cargo } : {}), ...(f.phase === 'scream' ? { screams: true } : {}) });
  w.flags[`${m.family}_seen_before`] = true;
  w.flags.dragon_known = true;
}

// ===================================================================== a flight, beat by beat

function noticeChance(w: World, f: Flight): number {
  const sneak = sneakBonus(w);
  switch (f.model ?? f.kind) {
    case 'hermes3': return 0;
    case 'hermes': return Math.max(0.02, 0.05 - sneak * 0.5);
    case 'artemis2': return clamp(0.3 + 0.03 * (w.heat.atlas ?? 0) - sneak * 0.25, 0.12, 0.6);
    case 'demeter': case 'demeter2': case 'demeter3': case 'demeter4': return Math.max(0.05, 0.18 - sneak * 0.5);
    default: return Math.max(0.03, (f.kind === 'hera' ? 0.2 : 0.12) - sneak * 0.5);
  }
}

function tendFlight(c: Ctx, f: Flight): void {
  const { w, rng } = c;
  const h = w.hero;
  const m = flightModel(f);

  if (h.locationId !== f.locationId) {
    // A Demeter she walks away from has not been paid.
    if (f.phase === 'demand') {
      // Walking away is refusing with extra steps: it shoots her in the back, and the arrears stand.
      const hit = m.mark * c.rng.int(4, 9);
      h.hp = Math.max(1, h.hp - hit);
      addHeat(w, 'atlas', 1);
      w.counters.tithe_debt = Math.min(3000, (w.counters.tithe_debt ?? 0) + (f.demand ?? 0));
      c.emit('tithe_evade', 'bad', { mark: m.mark, owed: w.counters.tithe_debt, hit });
      finish(c, f, true);
      return;
    }
    if (m.traits.includes('tracks') && w.beat <= f.until) {
      pursue(c, f, m);
      return;
    }
    // An Ares goes on with its raid whether she is there to see it or not; getting out of the way is the whole idea.
    if (f.kind === 'ares' && w.beat <= f.until) {
      if (f.phase === 'scream' && w.beat >= (f.arrives ?? 0)) f.phase = 'raid';
      return;
    }
    finish(c, f, true);
    return;
  }
  if (w.beat > f.until) {
    if (f.phase === 'demand') refuse(c, 'silence');
    else finish(c, f, false);
    return;
  }

  f.clock = w.clock;
  switch (f.phase) {
    case 'scream':
      if (w.beat >= (f.arrives ?? 0)) {
        f.phase = 'raid';
        c.emit('ares_arrive', 'bad', { mark: m.mark, standing: !!f.stand });
        if (f.stand && !f.hidden) accuseHero(c, f);
      }
      return;
    case 'raid':
      raidBeat(c, f, m);
      return;
    case 'demand':
      return;
    default: {
      const p = noticeChance(w, f);
      if (!f.hidden && !f.noticed && p > 0 && rng.chance(p)) spotted(c);
    }
  }
}

/** It has lost her, and goes after her at its own pace: speed against hers, over however long she gave it. */
function pursue(c: Ctx, f: Flight, m: DragonModel): void {
  const { w } = c;
  const h = w.hero;
  const elapsed = Math.max(1, (w.clock - (f.clock ?? w.clock)) / BASE_MIN_PER_BEAT);
  f.clock = w.clock;
  f.reach = (f.reach ?? 0) + reachPerBeat(w, m.speed) * elapsed;
  for (let guard = 0; f.reach >= 1 && f.locationId !== h.locationId && guard < 12; guard++) {
    const r = routeTo(w, f.locationId, h.locationId);
    if (!r) {
      finish(c, f, true);
      return;
    }
    f.reach -= 1;
    placeFlight(w, f, r.next);
  }
  if (f.locationId !== h.locationId) return;
  // It has found her again.
  f.reach = 0;
  f.hidden = false;
  f.noticed = false;
  f.until = Math.min(f.until + 2, (f.born ?? w.beat) + 14);
  c.emit('dragon_follow', 'bad', { variant: f.kind, mark: m.mark, count: f.ids.length });
}

function placeFlight(w: World, f: Flight, to: Id): void {
  f.locationId = to;
  for (const id of f.ids) {
    const n = w.npcs[id];
    if (n) moveNpc(w, n, to);
  }
}

/** The flight is over: it moves on, or she has. */
function finish(c: Ctx, f: Flight, left: boolean): void {
  const { w } = c;
  const m = flightModel(f);
  if (f.kind === 'ares') settleRaid(c, f);
  for (const id of f.ids) if (w.npcs[id]) w.npcs[id]!.alive = false;
  const away = w.hero.locationId !== f.locationId;
  if (f.kind === 'ares' && away) {
    // Nothing to see from indoors, except that it's over.
    if (f.sheltered && !w.locations[w.hero.locationId]?.outdoors) c.emit('ares_all_clear', 'good', { mark: m.mark });
  } else {
    c.emit('dragon_pass', 'mixed', { variant: f.kind, mark: m.mark, hidden: f.hidden, left, count: f.ids.length });
  }
  w.flight = null;
}

function spotted(c: Ctx): void {
  const { w } = c;
  const f = w.flight!;
  const m = flightModel(f);
  if (hasTrait(f.model, 'swift')) return;
  f.noticed = true;
  c.emit('dragon_notice', 'bad', { variant: f.kind, mark: m.mark, count: f.ids.length });
  if (f.kind === 'demeter') beginDemand(c);
  else if (f.kind === 'hermes') courierFine(c);
  else engage(c);
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
  fight(c, foes, { cause: cause ?? CAUSE[f.model ?? f.kind] ?? 'a dragon', joiners: false });
  c.w.flight = null;
}

// ===================================================================== the courier

/** A Hermes that spots her was looking for somebody who isn't in. */
function courierFine(c: Ctx): void {
  const { w, rng } = c;
  const f = w.flight!;
  const fine = Math.min(w.hero.cash, rng.int(10, 40));
  w.hero.cash -= fine;
  c.emit('courier_fine', 'bad', { fine });
  finish(c, f, false);
}

// ===================================================================== the tithe

/** It is always winter. The summer distribution is announced at every encounter and has never once taken place. */
export const demeterSeason = (_w: World): 'summer' | 'winter' => 'winter';

function beginDemand(c: Ctx): void {
  const { w } = c;
  const f = w.flight!;
  const m = flightModel(f);
  const owed = w.counters.tithe_debt ?? 0;
  const amount = Math.round(Math.max(TITHE_FLOOR[m.mark] ?? 40, w.hero.cash * (TITHE_RATE[m.mark] ?? 0.25)) + owed);
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
  finish(c, f, false);
}

/** Saying no, or saying nothing, is a threat to public security. */
function refuse(c: Ctx, how: 'refuse' | 'silence' | 'haggle'): void {
  const { w } = c;
  const f = w.flight!;
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
  const hits = Math.min(crowd.length, rng.int(1, m.mark >= 4 ? 3 : 2));
  const gangs = Object.values(GANGS);
  for (let i = 0; i < hits; i++) {
    const n = crowd.splice(rng.int(0, crowd.length - 1), 1)[0]!;
    // Passers-by are gone for good; people who matter wake up later with a headache and a record.
    const fate = n.ephemeral ? 'dead' : 'down';
    if (fate === 'dead') {
      n.alive = false;
      n.hp = 0;
    } else {
      n.downUntil = w.beat + 30;
    }
    remember(n, 'was accused of gang membership by an Ares dragon');
    c.emit('ares_accuse', 'mixed', { variant: 'victim', npc: n.name, gang: rng.pick(gangs), fate, mark: m.mark });
  }
  if (f.hidden) return;
  const p = (m.mark >= 4 ? 0.4 : 0.22) + (hits ? 0 : 0.3) - sneakBonus(w) * 0.5;
  if (rng.chance(clamp(p, 0.05, 0.85))) accuseHero(c, f);
}

function accuseHero(c: Ctx, f: Flight): void {
  const m = flightModel(f);
  c.emit('ares_accuse', 'bad', { variant: 'hero', gang: c.rng.pick(Object.values(GANGS)), mark: m.mark });
  // The raid happened whether or not she walks away from the fight: the place is a little less gang for it, and the next dragon is worse.
  settleRaid(c, f);
  engage(c);
}

/** A raid leaves the place a little less of a gang's. Enough of them and the next thing to arrive is worse. */
function settleRaid(c: Ctx, f: Flight): void {
  const { w } = c;
  const loc = w.locations[f.locationId];
  if (!loc || f.phase === 'scream') return;
  w.counters[`ares_raids:${loc.id}`] = (w.counters[`ares_raids:${loc.id}`] ?? 0) + 1;
  w.counters.ares_raids = (w.counters.ares_raids ?? 0) + 1;
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

/** What she can do while dragons are overhead. A clueless Blackbird engages; a competent one reads the odds. */
export function dragonCandidates(w: World): Candidate[] {
  const f = w.flight;
  const h = w.hero;
  const loc0 = w.locations[h.locationId]!;
  // Hunting them means looking up: dragons patrol, and an eye on the sky finds the patrol sooner.
  if (!f && loc0.outdoors && loc0.id !== 'overpass' && w.mind.goals.some((g) => g.kind === 'dragon' && g.mode !== 'apollo')) {
    return [{
      key: 'scan_skies', drives: {}, bonus: -0.2,
      run: (c) => {
        c.w.counters.skywatch = c.w.beat;
        c.emit('scan_skies', 'mixed', { place: loc0.name, first: !c.w.flags.skywatched });
        c.w.flags.skywatched = true;
      },
    }];
  }
  if (!f || f.locationId !== h.locationId) return [];
  if (f.phase === 'demand') return demandCandidates(w, f);
  if (f.hidden || f.noticed) return [];
  const foes = flightFoes(w);
  if (!foes.length) return [];
  const m = flightModel(f);
  const swift = m.traits.includes('swift');
  const grim = f.kind === 'hera' || f.model === 'ares4';
  const hera = f.kind === 'hera';
  const hunter = m.traits.includes('tracks');
  const total = foes.reduce((a, n) => a + n.power, 0);
  // A hurt hero is a weaker hero. Competent ones notice.
  const ratio = total / (heroPower(w) * clamp(h.hp / h.maxHp, 0.3, 1));
  const risk = Math.min(4, clamp(ratio - 0.6, 0, 9) * 1.5);
  const out: Candidate[] = [];

  // An Ares that hasn't got here yet: the only questions are where she'll be when it does, and whether she's going to meet it.
  if (f.phase === 'scream') {
    out.push({
      key: 'shelter_scream', drives: {}, smart: 2.4, bonus: ratio > 1 ? 0.9 : 0,
      run: (c) => {
        const inside = shelterFrom(c.w, c.w.locations[c.w.hero.locationId]!);
        f.sheltered = true;
        if (inside) {
          relocate(c.w, inside.id);
          c.emit('ares_shelter', 'good', { variant: 'door', place: inside.name });
        } else {
          f.hidden = true;
          c.emit('ares_shelter', 'good', { variant: 'cover' });
        }
      },
    });
    out.push({
      key: 'stand_ground', drives: { bravery: 1.0, pride: 0.8, quest: 0.7 }, bonus: 0.1, risk,
      run: (c) => {
        f.stand = true;
        c.emit('ares_stand', 'mixed', {});
      },
    });
    return out;
  }

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
          finish(c, f, true);
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
        ww.flight!.hidden = true;
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
  return out;
}
