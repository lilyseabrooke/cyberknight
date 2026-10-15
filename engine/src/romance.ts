import type { Ctx, Hero, Npc, World } from './types';
import { addHeat, fight, here, relocate, remember } from './combat';
import { clamp, spawnGroup, type Candidate } from './candidate';
import { synergy, train } from './skills';
import { moveNpc } from './population';
import { bondEvent, lovedHere, romanceMod, scruples, ensureBond } from './bonds';
import { isFairGame } from './people';

/**
 * Romance with consequences. Kissing leads to making a move; a move that lands leaves her sated for a while
 * (her appetite returns slowly, and faster in amorous company, and to a different tune for different
 * personalities); where it happens is a decision with risks; and sometimes the other person takes her home.
 */

// ===================================================================== satiety

export const satietyOf = (h: Hero): number => h.satiety ?? 0;
const traits = (h: Hero) => h.personality.traits;

/** How fast her appetite returns each beat. About 220 beats from full at an unremarkable 0.5 on everything. */
export function satietyDecay(h: Hero): number {
  const t = traits(h);
  const k = 1 + 1.4 * (t.impress - 0.5) + 0.8 * (t.thrill - 0.5) + 0.7 * (t.drink - 0.5) + 0.6 * (t.mischief - 0.5) - 1.0 * (t.romantic - 0.5);
  return 0.0045 * clamp(k, 0.4, 2.6);
}

export function tickSatiety(h: Hero): void {
  if (satietyOf(h) > 0) h.satiety = Math.max(0, satietyOf(h) - satietyDecay(h));
}

/** Amorous company stirs her up: flirting, kissing and chatting up girls burn through satiety faster. */
export function kindle(h: Hero, amount: number): void {
  if (satietyOf(h) <= 0) return;
  h.satiety = Math.max(0, satietyOf(h) - amount * (1 + (traits(h).impress - 0.5)));
}

export function gainSatiety(h: Hero, amount: number): void {
  h.satiety = Math.min(1, satietyOf(h) + amount);
}

const SATIETY_WEIGHT: Record<string, number> = { poach: 1.2, reconcile: 1, flirt: 1, kiss: 1.25, make_move: 1.6, pool_date: 0.9, serve_dish: 0.7, seduce_clerk: 0.9, dance: 0.4 };

/** A sated Blackbird doesn't want to chase anyone, with anyone. */
export function satietyBias(w: World, cand: { key: string }): number {
  const k = SATIETY_WEIGHT[cand.key.split(':')[0]!];
  const s = satietyOf(w.hero);
  if (!k || s <= 0) return 0;
  return -3.2 * k * s * (1 - 0.5 * (traits(w.hero).impress - 0.5));
}

// ===================================================================== per-person bookkeeping

export const kissesWith = (w: World, id: string): number => w.counters[`kisses_${id}`] ?? 0;
export const movesWith = (w: World, id: string): number => w.counters[`moves_${id}`] ?? 0;

/** How much she wants to kiss this one *again*. Affection counts, but only so far, and the fourth kiss in a row is a stretch. */
export const kissBonus = (w: World, n: Npc): number => Math.min(n.affinity, 50) / 100 - 0.5 * kissesWith(w, n.id);

/** The Sims rule: somebody saw that, and they had feelings about it. */
export function jealousy(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const rival = lovedHere(w, n.id)[0] ?? here(w).find((r) => r.id !== n.id && isFairGame(r) && !r.hostile && (w.flags[`kissed:${r.id}`] || r.affinity >= 15));
  if (!rival) return;
  rival.affinity -= 30;
  remember(rival, 'watched Blackbird kiss someone else');
  // If they were something to each other, this is the end of it, usually.
  if (rival.bond && (rival.bond.stage === 'seeing' || rival.bond.stage === 'together')) {
    rival.bond.ardor = Math.max(0, rival.bond.ardor - 25);
    if (rng.chance(0.6)) {
      const { hers } = ensureBond(w, rival);
      rival.bond.stage = 'ex';
      rival.bond.since = w.clock;
      rival.bond.ended = { how: 'was_left', at: w.clock };
      if (hers.stage !== 'ex') { hers.stage = 'ex'; hers.since = w.clock; hers.ended = { how: 'was_left', at: w.clock }; }
      c.emit('breakup', 'bad', { variant: 'caught', npc: rival.name, npc2: n.name });
    }
  }
  const fights = rival.tags.includes('jealous') ? 0.9 : 0.4;
  const brawl = rng.chance(fights);
  c.emit('jealous', 'bad', { variant: brawl ? 'fight' : 'sulk', npc: rival.name, npc2: n.name });
  if (brawl) fight(c, [rival], { cause: `jealousy over ${n.name}`, assault: true });
}

// ===================================================================== where things happen

interface Spot {
  to: string;
  tier: 'tolerated' | 'forbidden';
  label: string;
  weight: number;
}

const SPOTS: Record<string, Spot[]> = {
  halo_floor: [
    { to: 'halo_restroom', tier: 'tolerated', label: 'the bathroom stall', weight: 5 },
    { to: 'halo_kitchen', tier: 'forbidden', label: 'the walk-in fridge', weight: 2 },
    { to: 'halo_backroom', tier: 'forbidden', label: 'the backroom couch', weight: 2 },
  ],
  neon_pharaoh: [
    { to: 'club_greenroom', tier: 'forbidden', label: "the band's green room", weight: 3 },
    { to: 'club_maintenance', tier: 'forbidden', label: 'the maintenance crawlspace', weight: 2 },
    { to: 'neon_pharaoh', tier: 'tolerated', label: 'a dark VIP booth', weight: 3 },
  ],
  street_main: [{ to: 'halo_alley', tier: 'tolerated', label: 'the alley behind the Halo', weight: 1 }],
};
const FORBIDDEN_PLACES = new Set(['halo_kitchen', 'halo_backroom', 'club_greenroom', 'club_maintenance', 'helix_dock', 'helix_lobby', 'helix_lab']);

export function spotsFor(w: World, locId: string): Spot[] {
  const listed = (SPOTS[locId] ?? []).filter((s) => w.locations[s.to]);
  if (listed.length) return listed;
  const loc = w.locations[locId]!;
  return [{ to: locId, tier: FORBIDDEN_PLACES.has(locId) ? 'forbidden' : 'tolerated', label: loc.outdoors ? 'a dark corner' : loc.id === 'halo_restroom' ? 'a stall' : 'a quiet corner', weight: 1 }];
}

export function homeFor(n: Npc): string {
  if (n.tags.includes('corp') || n.archetype === 'heir' || n.archetype === 'corpo') return 'home_penthouse';
  if (n.archetype === 'hacker' || n.tags.includes('augmented') && n.archetype === 'scrapper') return 'home_hab';
  return 'home_stacks';
}

const present = (n: Npc | undefined, locId: string, w: World): n is Npc => !!n && n.alive && n.locationId === locId && n.downUntil <= w.beat;

/** Who'd mind, here. */
function catcherAt(c: Ctx, spot: Spot): { npc?: Npc; kind: 'staff' | 'band' | 'guard' | 'police' | 'robot' | 'drone'; faction: string | null } {
  const { w } = c;
  const id = spot.to;
  const pick = (...ids: string[]) => ids.map((x) => w.npcs[x]).find((n) => present(n, id, w));
  if (id === 'halo_kitchen') { const n = pick('bao', 'dutch'); if (n) return { npc: n, kind: 'staff', faction: 'halo' }; }
  if (id === 'halo_backroom') { const n = pick('madame', 'tiny', 'dutch'); if (n) return { npc: n, kind: 'staff', faction: n.faction }; }
  if (id === 'halo_floor' || id === 'halo_restroom') { const n = pick('dutch', 'tiny'); if (n) return { npc: n, kind: 'staff', faction: 'halo' }; }
  if (id === 'club_greenroom') { const n = Object.values(w.npcs).find((x) => x.tags.includes('band') && present(x, id, w)); if (n) return { npc: n, kind: 'band', faction: 'club' }; }
  if (id === 'neon_pharaoh' || id === 'club_greenroom' || id === 'club_maintenance') { const g = Object.values(w.npcs).find((x) => x.tags.includes('security') && x.faction === 'club' && x.alive && x.downUntil <= w.beat); if (g) return { npc: g, kind: 'guard', faction: 'club' }; }
  if (id === 'club_maintenance') { const n = pick('scrapper'); if (n) return { npc: n, kind: 'robot', faction: null }; }
  if (w.locations[id]!.outdoors) return { npc: spawnGroup(c, 'npd_officer', 1)[0], kind: 'police', faction: 'npd' };
  return { kind: 'drone', faction: 'atlas' };
}

export function caughtChance(w: World, spot: Spot): number {
  const loc = w.locations[spot.to]!;
  let p = spot.tier === 'forbidden' ? 0.36 : 0.09;
  if (loc.cameras && !w.flags.blackout) p += 0.14;
  if (loc.outdoors) p += 0.08;
  return clamp(p, 0, 0.7);
}

// ===================================================================== the candidates

export function romanceCandidates(w: World): Candidate[] {
  const h = w.hero;
  const out: Candidate[] = [];
  for (const n of here(w)) {
    if (!isFairGame(n) || n.hostile) continue;
    const kisses = kissesWith(w, n.id);
    const eager = h.drunk >= 3 && n.affinity >= 10;
    if ((kisses >= 1 && n.affinity >= 20) || eager) {
      out.push({
        key: `make_move:${n.id}`,
        drives: { lust: 1.6, pride: 0.2 },
        bonus: 0.35 * Math.min(kisses, 3) + n.affinity / 150 - 0.8 * movesWith(w, n.id) + scruples(w, n),
        risk: 0.2,
        run: (c) => makeMove(c, n),
      });
    }
  }
  return out;
}

// ===================================================================== making a move

function makeMove(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const t = traits(h);
  const origin = h.locationId;
  const originName = w.locations[origin]!.name;
  kindle(h, 0.05);
  train(c, 'romance', 1);
  w.counters[`asks_${n.id}`] = (w.counters[`asks_${n.id}`] ?? 0) + 1;

  const kisses = kissesWith(w, n.id);
  const prior = movesWith(w, n.id);
  const p = clamp(0.22 + n.affinity / 150 + h.charm * 0.03 + 0.045 * synergy(h, ['romance', 'stat:charm']) + 0.04 * Math.min(h.drunk, 3) + (kisses >= 2 ? 0.1 : 0) - (prior ? 0.3 : 0) + romanceMod(w, n), 0.02, 0.9);
  if (!rng.chance(p)) {
    n.affinity -= 8;
    if (rng.chance(0.25)) {
      h.hp -= 2;
      c.emit('make_move', 'bad', { variant: 'slap', npc: n.name });
    } else {
      c.emit('make_move', 'bad', { variant: 'declined', npc: n.name });
    }
    return;
  }

  // Leaving together in front of whoever else she's been charming.
  jealousy(c, n);
  if (w.over || h.locationId !== origin || n.hostile) return;

  const wild = clamp(((t.thrill + t.mischief + t.impulsive + t.reckless) / 4 - 0.5) * 1.6 + 0.07 * h.drunk + 0.1 * (t.drink - 0.5), 0, 0.9);
  const wasted = h.drunk >= 3;
  let venue: 'public' | 'home' | 'private';
  if (rng.chance(wild * 0.55)) venue = 'public';
  else if (n.affinity >= 30 && rng.chance(0.22 + (n.cash > 120 ? 0.2 : 0))) venue = 'home';
  else venue = 'private';

  if (venue === 'public') return publicly(c, n, originName, wasted);
  if (venue === 'home') return atTheirPlace(c, n, origin, originName);

  const spot = rng.weighted(spotsFor(w, origin), (s) => s.weight);
  c.emit('make_move', 'good', { variant: 'private', npc: n.name, spot: spot.label, tier: spot.tier, place: originName, wasted });
  if (spot.to !== origin) {
    relocate(w, spot.to);
    moveNpc(w, n, spot.to);
  }
  let factor = 1;
  if (rng.chance(caughtChance(w, spot))) factor = caught(c, n, spot);
  if (!w.over) afterglow(c, n, 'private', factor, spot.label);
  if (n.alive && n.locationId !== 'home_stacks' && !n.locationId.startsWith('home_')) moveNpc(w, n, origin); // they drift back to the party
}

function publicly(c: Ctx, n: Npc, place: string, wasted: boolean): void {
  const { w, rng } = c;
  const h = w.hero;
  const t = traits(h);
  const loc = w.locations[h.locationId]!;
  c.emit('make_move', 'mixed', { variant: 'public', npc: n.name, place, outdoors: loc.outdoors, wasted });
  if (loc.kind === 'bar' || loc.kind === 'club') {
    // Whoever runs the place is not going to be thrilled.
    const owner = ((): Npc | undefined => (loc.kind === 'bar' ? w.npcs.dutch : Object.values(w.npcs).find((x) => x.tags.includes('security') && x.faction === 'club')))();
    if (present(owner, h.locationId, w)) {
      owner.affinity -= 10;
      addHeat(w, loc.kind === 'bar' ? 'halo' : 'club', 2);
      if (rng.chance(0.6)) {
        c.emit('make_move', 'bad', { variant: 'public_tossed', npc: owner.name, partner: n.name });
        afterglow(c, n, 'public', 0.9, 'the middle of the room');
        relocate(w, loc.tossTo);
        return;
      }
    }
  } else if (loc.outdoors) {
    addHeat(w, 'npd', 1);
  }
  if (t.fame > 0.6 || t.vanity > 0.6) {
    h.fame += 1;
    c.emit('make_move', 'good', { variant: 'public_cheer', npc: n.name });
  }
  afterglow(c, n, 'public', 0.9, 'the middle of the room');
}

/** Interrupted. Returns how much of the evening was left. */
function caught(c: Ctx, n: Npc, spot: Spot): number {
  const { w, rng } = c;
  const h = w.hero;
  const t = traits(h);
  const { npc, kind, faction } = catcherAt(c, spot);
  c.emit('make_move', 'bad', { variant: `caught_${kind}`, npc: npc?.name ?? 'someone', role: npc?.role ?? '', spot: spot.label, partner: n.name });
  if (npc) npc.affinity -= 15;
  if (faction) addHeat(w, faction, 1);
  if (kind === 'police') {
    const fine = Math.min(h.cash, rng.int(20, 60));
    h.cash -= fine;
    if (npc) npc.alive = false; // moves on
    c.emit('make_move', 'bad', { variant: 'fined', amount: fine });
  } else if (kind === 'robot' || kind === 'staff' || kind === 'band' || kind === 'guard') {
    const swing = npc && rng.chance(0.2 + 0.3 * Math.max(0, t.temper - 0.5) + (h.drunk >= 3 ? 0.15 : 0));
    if (npc && swing) fight(c, [npc], { cause: `getting caught in ${spot.label}`, assault: false });
    else if (kind !== 'robot') relocate(w, w.locations[h.locationId]!.tossTo);
  }
  return kind === 'drone' ? 0.7 : 0.4;
}

function atTheirPlace(c: Ctx, n: Npc, origin: string, originName: string): void {
  const { w, rng } = c;
  const h = w.hero;
  const home = homeFor(n);
  const homeLoc = w.locations[home];
  if (!homeLoc) return;
  c.emit('make_move', 'good', { variant: 'invite', npc: n.name, home: homeLoc.name, place: originName });
  const jumpOdds = clamp(0.22 + (w.situation.weather === 'acid_rain' ? 0.03 : 0) + ((w.heat.npd ?? 0) >= 3 ? 0.05 : 0) + (h.drunk >= 3 ? 0.08 : 0), 0.1, 0.5);
  if (rng.chance(jumpOdds)) {
    const crew = spawnGroup(c, 'mugger', rng.int(1, 2));
    c.emit('make_move', 'bad', { variant: 'jumped', npc: n.name, count: crew.length });
    const res = fight(c, crew, { cause: `a jumping on the way to ${n.name}'s place`, joiners: false });
    if (w.over) return;
    if (res !== 'win') {
      c.emit('make_move', 'bad', { variant: 'jump_ruined', npc: n.name });
      return;
    }
    c.emit('make_move', 'mixed', { variant: 'jump_won', npc: n.name });
  }
  relocate(w, home);
  moveNpc(w, n, home);
  afterglow(c, n, 'home', 1, homeLoc.name);
}

function afterglow(c: Ctx, n: Npc, where: 'private' | 'public' | 'home', factor: number, spot: string): void {
  const { w, rng } = c;
  const h = w.hero;
  const gain = (0.75 + (n.affinity >= 40 ? 0.15 : 0)) * factor;
  gainSatiety(h, gain);
  n.affinity += factor >= 0.9 ? 18 : 6;
  w.counters[`moves_${n.id}`] = movesWith(w, n.id) + 1;
  w.flags[`kissed:${n.id}`] = true;
  remember(n, factor >= 0.9 ? 'spent a night with Blackbird' : 'was interrupted with Blackbird');
  train(c, 'romance', factor >= 0.9 ? 3 : 1);
  h.drunk = Math.max(0, h.drunk - 1);
  const shady = ['hacker', 'dealer', 'ganger', 'patron', 'mugger'].includes(n.archetype);
  let flavor: 'warm' | 'number' | 'wallet' | 'interrupted' = factor < 0.9 ? 'interrupted' : 'warm';
  let lost = 0;
  if (flavor === 'warm' && shady && rng.chance(0.12)) {
    lost = Math.min(h.cash, Math.max(5, Math.round(h.cash * (0.1 + rng.next() * 0.2))));
    h.cash -= lost;
    flavor = 'wallet';
  } else if (flavor === 'warm' && n.affinity >= 35 && rng.chance(0.45)) {
    flavor = 'number';
  }
  c.emit('make_move', factor >= 0.9 ? 'good' : 'mixed', { variant: 'afterglow', npc: n.name, where, flavor, spot, lost, sated: Math.round(satietyOf(h) * 100) });
  bondEvent(c, n, factor >= 0.9 ? 'night' : 'date');
}
