import type { Companion, Ctx, Injury, Item, Location, Npc, ParkedVehicle, World } from './types';
import type { EventData, Outcome } from './events';
import { KINDS, allyPower, assistOf } from './companions';
import { foeArmor, fxOf, rating, vsMult } from './weapons';
import { loaded, spendAmmo, wielded } from './arms';
import { skillLevel, skillValue, train } from './skills';
import { addObjects, coverObject, dist, hasLos, idx, inCover, levelAt, makeGrid, nearestFree, objectAt, passable, pathTo, posOf, reach, same, stepOf, terrainAt, type BoardObject, type CarLike, type Grid, type Pos, type Reach } from './grid';
import { Rng } from './rng';
import { MAKES, SPILL, blastInside, blastOutside, hitCar, normalize, paceOf } from './cars';
import { parkedVehicle } from './roads';
import { techniquesFor, type Technique } from './techniques';
import { artsOf } from './lab';
import { dragonSpeed, hasTrait, legSpeed } from './dragonmodels';
import type { ArtBranch } from './content/doctrine';
import * as D from './doctrine';
import { perceived, ratio, statsOf } from './npcstats';
import { atLeast, bucketOf, callForHelp, channelNow, hush } from './stealth';
import type { Placed } from './placeboard';
import { cloneGrid } from './layout';

/**
 * A fight, played out on a small grid. Nobody watches it: the player gets a report of the interesting bits and the result.
 * Every unit (Blackbird, her allies, the other side, whoever turns up late) acts by the same rule: look at every tile
 * you can reach and everything you could do from there, score each (damage dealt, danger stood in, cover, where the
 * exits are) and take the best. Retreat means walking to an exit tile and stepping off the board; so does an enemy's.
 *
 * `fight()` in combat.ts sets the stage and settles the aftermath; this file is the middle.
 */

export type Team = 'hero' | 'foe';
export type UnitState = 'active' | 'down' | 'dead' | 'fled' | 'pending';
export type TacticalResult = 'win' | 'flee' | 'tossed' | 'arrested' | 'dead';

export interface Unit extends Pos {
  id: string;
  name: string;
  team: Team;
  kind: 'hero' | 'ally' | 'foe';
  /** The real thing: Hero, Npc or Companion. Damage lands on it directly. */
  ref: { hp: number; maxHp: number };
  npc?: Npc;
  comp?: Companion;
  state: UnitState;
  speed: number;
  flying: boolean;
  power: number;
  hit: number;
  /** Shortest and longest distance its basic attack reaches. */
  reach: [number, number];
  assist?: { dmg?: number; absorb?: number; disable?: boolean };
  caution: number;
  canFlee: boolean;
  /** Knows there's a fight on. Unaware enemies can be ambushed. */
  alert: boolean;
  stunned: boolean;
  disabled: boolean;
  burning: number;
  /** Rounds of bleeding left, and how many cuts are open. */
  bleedT: number;
  bleedN: number;
  /** Rounds left slowed, pinned in place, marked for her, suppressed, and rattled (acting late). */
  slow: number;
  pinned: number;
  marked: number;
  supp: number;
  /** Rounds left blind (Optic Reset): it can barely hit anything. */
  blind: number;
  /** Rounds left turned (Rewrite, Turret Takeover): it fights for the other side. */
  turned: number;
  /** Rounds left overclocked (Overclock): hits harder and moves faster. */
  over: number;
  stagger: number;
  /** Broken limbs, a fraction of armor stripped, a weapon taken, and whether it moved on its last turn. */
  leg: boolean;
  arm: boolean;
  ribs: boolean;
  shred: number;
  disarmed: boolean;
  moved: boolean;
  fleeing: boolean;
  scared: boolean;
  watching: boolean;
  interposed: boolean;
  /** The id of the car it is sitting in (see `BoardObject`). Shut doors make that the best cover there is. */
  aboard?: string;
  /** A foe with the key to a car on the board: its id. When it runs, it runs for that, not for a door. */
  carFlee?: string;
  cd: Record<string, number>;
}

export interface Hooks {
  heroPower(w: World, weapon: Item, allies: boolean): number;
  kill(c: Ctx, w: World, npc: Npc, by: string): void;
  maybeInjure(c: Ctx, hit: number, chance?: number): void;
  hasInjury(w: World, i: Injury): boolean;
  throwDamage(w: World, item: Item): number;
}

/** Somebody who turns up part-way through. */
export interface Arrival {
  npc: Npc;
  round: number;
  why: 'joiner' | 'law';
}

export interface SimOpts {
  foes: Npc[];
  arrivals: Arrival[];
  lethal: boolean;
  /** Blackbird started it on people who weren't looking for trouble. */
  assault: boolean;
  maxRounds: number;
  /** Same-faction friends of the other side who might wade in. */
  backup?: () => Npc[];
  /** The place has a layout and everyone has somewhere to be on it: fight there, from where they are. */
  board?: Placed;
}

export interface LogEntry {
  type: string;
  outcome: Outcome;
  data: EventData;
  weight: number;
  key: string;
  /** Which round it happened in. */
  round: number;
}

/** What one round of a fight came to, for telling it as it happened. */
export interface RoundRecord {
  round: number;
  /** Damage Blackbird herself dealt, and to whom (the one who took most of it). */
  dealt: number;
  to: string;
  /** What she lost this round (blows, backfires, fire), and who landed most of the blows. */
  taken: number;
  by: string;
  /** Who stopped being a problem this round. */
  down: string[];
  foesLeft: number;
  hpPct: number;
}

export interface SimResult {
  result: TacticalResult;
  /** The tile she left by, if she ran for it. */
  fledAt?: Pos;
  /** Where everyone was at the end, for the place's board. */
  ended: { hero: Pos; others: Record<string, Pos> };
  rounds: number;
  /** Knocked out, in a fight where nobody dies. */
  down: Set<string>;
  /** Left the board alive and on their own feet (or were thrown out). */
  fled: Set<string>;
  /** Who joined part-way through. */
  arrived: Npc[];
  wield: Item;
  stats: Sim['stats'];
  /** She got into her car and left. */
  droveOff: boolean;
  /** Foes who got away in a car, and which car (the key in their pocket). */
  getaways: { npc: Npc; carId: string }[];
  /** A police cruiser that was on the board is still in one piece (so it can follow). */
  cruiser: boolean;
  log: LogEntry[];
  /** One record per round, in order. */
  roundLog: RoundRecord[];
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** How far a weapon reaches: knives and fists a step, a whip two, guns by the kind of gun. */
export function weaponReach(it: Item): [number, number] {
  const fx = fxOf(it);
  if (it.tags.includes('gun')) return [1, ({ pistol: 5, smg: 5, shotgun: 3, rifle: 8, energy: 5 } as Record<string, number>)[fx.cls] ?? 5];
  return [1, fx.cls === 'whip' ? 2 : 1];
}

export interface FoeProfile {
  reach: [number, number];
  speed: number;
  flying: boolean;
  hit: number;
  caution: number;
  canFlee: boolean;
}

/** What an enemy does on the board, read off what they are and carry. */
export function foeProfile(n: Npc): FoeProfile {
  const t = n.tags;
  const arms = n.loadout.filter((i) => i.kind === 'weapon' || i.kind === 'gadget');
  const best = arms.sort((a, b) => rating(b) - rating(a))[0];
  let reach: [number, number] = best ? weaponReach(best) : [1, 1];
  let speed = 3;
  let flying = false;
  if (t.includes('kid')) speed = 4;
  if (t.includes('robot') && /drone/i.test(n.role)) {
    flying = true;
    speed = 4;
    if (reach[1] < 4) reach = [1, 4];
  }
  if (/scrapper|lab-bot|walker/i.test(n.role)) speed = 2;
  if (/guard dog/i.test(n.role)) speed = 5;
  if (/turret/i.test(n.role)) {
    // Bolted to the ceiling: it covers the room and goes nowhere.
    speed = 0;
    reach = [1, 6];
  }
  if (t.includes('dragon')) {
    flying = true;
    reach = [1, t.includes('boss') ? 7 : 6];
    speed = dragonSpeed(n.archetype);
  }
  const big = t.includes('boss') || t.includes('dragon');
  // A courier dragon with half its plating gone would sooner lose the delivery than the dragon.
  const canFlee = t.includes('skittish') || !t.some((x) => ['robot', 'dragon', 'boss', 'cop', 'security'].includes(x));
  // What they are made of shows: quick people are quicker and surer, clever ones more careful.
  const quick = ratio(n, 'reflex');
  if (!big && speed === 3 && quick >= 1.7) speed = 4;
  const hit = t.includes('hera') ? 1 : clamp(0.8 + 0.06 * (quick - 1), 0.65, 0.92);
  const care = big ? 1 : t.includes('cop') || t.includes('security') ? 3 : 4.5;
  return { reach, speed, flying, hit, caution: big ? care : care * (0.85 + 0.15 * ratio(n, 'int')), canFlee };
}

const ALLY_SHAPE: Record<string, { reach: [number, number]; speed: number; flying?: boolean }> = {
  puppy: { reach: [1, 1], speed: 4 },
  drone: { reach: [1, 4], speed: 4, flying: true },
  kids: { reach: [1, 3], speed: 4 },
  pigeon: { reach: [1, 1], speed: 5, flying: true },
  scrapper: { reach: [1, 1], speed: 2 },
  hacker: { reach: [1, 3], speed: 3 },
  courier: { reach: [1, 3], speed: 4 },
};

const hazardDmg = (u: Unit): number => Math.max(3, Math.round(u.ref.maxHp * 0.06));

interface Option {
  tile: Pos;
  mode: 'stay' | 'walk' | 'dash' | 'leap';
  r: Reach | null;
  tech: Technique | null;
  target: Unit | null;
  score: number;
}

interface TurnCtx {
  enemies: Unit[];
  caution: number;
  fleeing: boolean;
  /** Steps to the nearest free exit from each tile, when running. */
  exitDist: Map<number, number> | null;
  enemyDist: Map<number, number>;
  pos: Map<number, number>;
}

export class Sim {
  readonly c: Ctx;
  readonly w: World;
  readonly hooks: Hooks;
  readonly o: SimOpts;
  readonly grid: Grid;
  readonly units: Unit[] = [];
  hero!: Unit;
  wield: Item;
  round = 0;
  threw = false;
  readonly throwOk: boolean;
  readonly log: LogEntry[] = [];
  readonly roundLog: RoundRecord[] = [];
  private dealt = new Map<string, number>();
  private hitBy = new Map<string, number>();
  private felled: string[] = [];
  readonly down = new Set<string>();
  readonly fled = new Set<string>();
  readonly arrived: Npc[] = [];
  readonly stats = { ammoSpent: 0, backfires: 0, crits: 0, ambushes: 0, hacks: 0, scares: 0, shoves: 0, threw: 0, overwatch: 0, leaps: 0, flurries: 0, assists: 0 };
  /** Her combat routines (see `doctrine.ts`), and the branch of the weapon in her hand. */
  readonly arts: Record<string, number>;
  branch: ArtBranch | null;
  /** Foes she has put down this fight, free actions owed to her, whether she moved on her last turn, and a dodge that sets up her next strike. */
  kills = 0;
  bonus = 0;
  moved = false;
  mirage = false;
  /** Till which round the other side stays unaware of her. */
  hush = 0;
  overwatching = false;
  hitExtra = 0;
  private result: TacticalResult | null = null;
  /** A car went up with her in it: that is death whether or not the fight was meant to be lethal. */
  private blastKill = false;
  droveOff = false;
  fledAt: Pos | null = null;
  readonly getaways: { npc: Npc; carId: string }[] = [];
  /** A hit at the end of a ride-by: momentum. */
  private rideBonus = 0;
  private lastWield: string;
  private readonly procs = new Set<string>();
  private readonly queue: { unit: Unit; round: number; why: 'joiner' | 'law' | 'backup' }[] = [];
  /** Rounds the doors stay sealed (Door Lock) and the lights stay out (Lights Out). */
  sealed = 0;
  dark = 0;
  private foeTotal = 0;
  private pw = new Map<string, number>();
  private dmgCache = new Map<string, number>();
  private readonly firstAssist = new Set<string>();
  private readonly fleeAt: number;

  constructor(c: Ctx, hooks: Hooks, o: SimOpts) {
    this.c = c;
    this.w = c.w;
    this.hooks = hooks;
    this.o = o;
    const h = c.w.hero;
    const loc = c.w.locations[h.locationId]!;
    this.grid = o.board ? cloneGrid(o.board.layout.grid) : makeGrid(c.rng, loc.kind, loc.crowded);
    this.parkCars(loc);
    this.wield = wielded(h, o.foes);
    this.arts = artsOf(c.w.legacy);
    this.branch = D.branchOf(this.wield);
    this.lastWield = h.weapon.id;
    this.fleeAt = 0.1 + h.competence * 0.35;
    // She might lob something first. Cues, bottles, knives, and cocktails.
    this.throwOk = c.rng.chance(0.3 + (h.personality.weights.pride - 0.5) * 0.3 + skillValue(h, 'throwing') * 0.03);

    this.hero = this.heroUnit();
    this.units.push(this.hero);
    for (const a of h.companions) if (a.hp > 0) this.units.push(this.allyUnit(a));
    // Sneaking, whoever she picked a fight with is only ready for it if they already had a sense of her.
    for (const f of o.foes) this.units.push(this.foeUnit(f, !o.assault || (h.stealth === true && atLeast(bucketOf(c.w, f), 'alert'))));
    this.foeTotal = o.foes.length;
    for (const a of o.arrivals) this.queue.push({ unit: this.foeUnit(a.npc, true, 'pending'), round: a.round, why: a.why === 'law' ? 'law' : 'joiner' });
    this.place();
  }

  // ------------------------------------------------------------------ setup

  private heroUnit(): Unit {
    const h = this.w.hero;
    const speed = clamp(legSpeed(this.w) + Math.floor(D.art(this, 'footwork') / 2), 1, 7);
    return this.blank({ id: 'hero', name: 'Blackbird', team: 'hero', kind: 'hero', ref: h, speed, hit: 0.94, reach: weaponReach(this.wield), caution: 4, canFlee: true, alert: true });
  }

  private allyUnit(a: Companion): Unit {
    const shape = ALLY_SHAPE[a.kind] ?? { reach: [1, 1] as [number, number], speed: 3 };
    return this.blank({
      id: a.id,
      name: a.name,
      team: 'hero',
      kind: 'ally',
      ref: a,
      comp: a,
      speed: shape.speed,
      flying: !!shape.flying,
      power: allyPower(this.w, a),
      hit: 0.75,
      reach: shape.reach,
      assist: assistOf(a),
      caution: 3,
      canFlee: false,
      alert: true,
    });
  }

  private foeUnit(n: Npc, alert: boolean, state: UnitState = 'active'): Unit {
    const p = foeProfile(n);
    return this.blank({ id: n.id, name: n.name, team: 'foe', kind: 'foe', ref: n, npc: n, speed: p.speed, flying: p.flying, power: n.power, hit: p.hit, reach: p.reach, caution: p.caution, canFlee: p.canFlee, alert, state });
  }

  private blank(p: Partial<Unit> & Pick<Unit, 'id' | 'name' | 'team' | 'kind' | 'ref'>): Unit {
    return {
      x: 0,
      y: 0,
      state: 'active',
      speed: 3,
      flying: false,
      power: 0,
      hit: 0.8,
      reach: [1, 1],
      caution: 4,
      canFlee: false,
      alert: true,
      stunned: false,
      disabled: false,
      burning: 0,
      bleedT: 0,
      bleedN: 0,
      slow: 0,
      pinned: 0,
      marked: 0,
      supp: 0,
      blind: 0,
      turned: 0,
      over: 0,
      stagger: 0,
      leg: false,
      arm: false,
      ribs: false,
      shred: 0,
      disarmed: false,
      moved: false,
      fleeing: false,
      scared: false,
      watching: false,
      interposed: false,
      cd: {},
      ...p,
    };
  }

  occupant(p: Pos, except?: Unit): Unit | undefined {
    return this.units.find((u) => u.state === 'active' && u !== except && same(u, p));
  }

  /** Blackbird comes in by a door; the other side is across the room (or, if they jumped her, right on top of her). */
  private place(): void {
    const g = this.grid;
    const rng = this.c.rng;
    const placed: Unit[] = [];
    const taken = (p: Pos) => placed.some((u) => same(u, p));
    const put = (u: Unit, p: Pos) => {
      u.x = p.x;
      u.y = p.y;
      placed.push(u);
    };
    const bd = this.o.board;
    if (bd) {
      // She is where she was and so is everyone else.
      const spot = (p: Pos | undefined): Pos | null => (p && passable(g, p.x, p.y) && !taken(p) ? p : null);
      const start = spot(bd.board.hero) ?? nearestFree(g, rng, bd.board.hero, taken)[0] ?? g.exits[0]!;
      put(this.hero, start);
      for (const u of this.units) if (u.kind === 'ally') put(u, nearestFree(g, rng, start, taken, u.flying)[0] ?? start);
      for (const u of this.units) {
        if (u.kind !== 'foe') continue;
        const mine = spot(bd.board.ents[u.id]);
        put(u, mine ?? nearestFree(g, rng, bd.board.hero, taken, u.flying).find((p) => dist(p, start) >= 2) ?? nearestFree(g, rng, start, taken, u.flying)[0] ?? start);
      }
      return;
    }
    const entry = rng.pick(g.exits);
    // She is beside her own car if there is one.
    const mine = this.ownCar();
    const start = nearestFree(g, rng, mine ? mine.cells[0]! : entry, taken)[0] ?? entry;
    put(this.hero, start);
    for (const u of this.units) if (u.kind === 'ally') put(u, nearestFree(g, rng, start, taken, u.flying)[0] ?? start);
    const far = nearestFree(g, rng, start, taken)
      .map((p) => ({ p, d: dist(p, start) }))
      .sort((a, b) => (this.o.assault ? b.d - a.d : Math.abs(a.d - 3) - Math.abs(b.d - 3)));
    const anchor = far[0]?.p ?? start;
    for (const u of this.units) if (u.kind === 'foe') put(u, nearestFree(g, rng, anchor, taken, u.flying)[0] ?? anchor);
  }

  // ------------------------------------------------------------------ queries (used by techniques too)

  /** Which side a unit is fighting for right now: a turned foe fights for hers. */
  side(u: Unit): 'hero' | 'foe' | 'neutral' {
    return u.turned > 0 ? (u.team === 'foe' ? 'hero' : 'foe') : u.team;
  }

  enemiesOf(u: Unit): Unit[] {
    return this.units.filter((e) => e.state === 'active' && this.side(e) !== this.side(u));
  }

  private friendsOf(u: Unit): Unit[] {
    return this.units.filter((e) => e.state === 'active' && this.side(e) === this.side(u) && e !== u);
  }

  standingFoes(): Unit[] {
    return this.units.filter((u) => u.team === 'foe' && u.state === 'active' && !(u.turned > 0));
  }

  private lostFraction(): number {
    return this.foeTotal ? clamp(1 - this.standingFoes().length / this.foeTotal, 0, 1) : 0;
  }

  armorOf(t: Unit): number {
    return t.kind === 'hero' ? (this.w.hero.armor?.power ?? 0) + fxOf(this.wield).armor : 0;
  }

  /** Is someone else on the same side standing next to the target (so it's being pincered)? */
  flanked(att: Unit, tgt: Unit, from: Pos): boolean {
    if (dist(from, tgt) > 1) return false;
    return this.units.some((u) => u.state === 'active' && this.side(u) === this.side(att) && u !== att && dist(u, tgt) <= 1);
  }

  /** Higher ground: shooting down is easier than shooting up. */
  private heightEdge(from: Pos, tgt: Pos): number {
    return 0.06 * clamp(levelAt(this.grid, from.x, from.y) - levelAt(this.grid, tgt.x, tgt.y), -2, 2);
  }

  /** Who can haul themselves up a bad wall: people can, machines and animals cannot. */
  private climbs(u: Unit): boolean {
    return !u.flying && !u.npc?.tags.some((t) => t === 'robot' || t === 'dog' || t === 'drone');
  }

  /** A foe or an ally's chance to hit. */
  hitChance(att: Unit, tgt: Unit, from: Pos): number {
    if (att.npc?.tags.includes('hera')) return 1;
    let p = att.hit;
    if (att.reach[1] > 1) {
      if (inCover(this.grid, from, tgt)) p -= 0.25;
      if (this.sheltered(tgt)) p -= 0.25;
      p += this.heightEdge(from, tgt);
      const far = Math.ceil(att.reach[1] * 0.6);
      const d = dist(from, tgt);
      if (d > far) p -= 0.07 * (d - far);
    }
    if (this.flanked(att, tgt, from)) p += 0.08;
    p += D.foeHit(this, att, tgt, from);
    if (att.blind > 0) p -= 0.5;
    if (this.dark > 0 && att.reach[1] > 1) p -= 0.2;
    return clamp(p, 0.1, 0.97);
  }

  heroHitChance(t: Unit, from: Pos, weapon: Item, thrown = false): number {
    const h = this.w.hero;
    const gun = weapon.tags.includes('gun');
    const ranged = gun || thrown;
    let p = 0.98;
    if (thrown) p += skillValue(h, 'throwing') * 0.008;
    else if (gun) p += skillValue(h, 'marksmanship') * 0.008;
    else if (weapon.tags.includes('melee')) p += skillValue(h, 'melee') * 0.008;
    if (this.hooks.hasInjury(this.w, 'concussion')) p -= 0.05;
    if (ranged && this.hooks.hasInjury(this.w, 'fried_optics')) p -= 0.12;
    if (t.npc && t.kind === 'foe') p -= clamp(0.06 * (ratio(t.npc, 'reflex') - 1), -0.05, 0.15);
    if (this.dark > 0 && (gun || thrown)) p -= 0.2;
    const d = dist(from, t);
    if (ranged) {
      const max = thrown ? 4 : weaponReach(weapon)[1];
      if (inCover(this.grid, from, t)) p -= 0.25;
      p += this.heightEdge(from, t);
      const far = Math.ceil(max * 0.6);
      if (d > far) p -= 0.07 * (d - far);
      const cls = fxOf(weapon).cls;
      if (!thrown && cls === 'shotgun') p += d <= 2 ? 0.08 : d >= 4 ? -0.08 : 0;
      if (!thrown && cls === 'rifle' && d <= 1) p -= 0.1;
    }
    if (this.flanked(this.hero, t, from)) p += 0.08;
    if (!thrown) p += D.hitBonus(this, t, from, weapon);
    if (ranged && this.carOf(this.hero)?.body === 'bike') p -= 0.1; // one hand on the bars
    p += this.rideBonus;
    return clamp(p, 0.1, 0.99);
  }

  power(weapon: Item): number {
    let p = this.pw.get(weapon.id);
    if (p === undefined) {
      p = this.hooks.heroPower(this.w, weapon, false);
      this.pw.set(weapon.id, p);
    }
    return p;
  }

  heroExpected(t: Unit, weapon: Item, mult: number, ignoreArmor = false): number {
    const fx = fxOf(weapon);
    let d = this.power(weapon) * 0.75 * vsMult(fx, t.npc) * (1 + (fx.crit + D.critBonus(this, t)) * (fx.critMult - 1)) * D.dmgMult(this, t, this.hero);
    if (!ignoreArmor && t.npc) d -= D.soak(this, t, fx.pierce, false);
    return Math.max(1, d * mult);
  }

  /** What one attack from `att` does to `tgt` on average, when it lands. */
  avgDamage(att: Unit, tgt: Unit): number {
    const key = `${att.id}>${tgt.id}`;
    const hit = this.dmgCache.get(key);
    if (hit !== undefined) return hit;
    let d: number;
    if (att.kind === 'hero') d = this.heroExpected(tgt, this.wield, 1);
    else if (att.kind === 'ally') d = (att.assist?.dmg ?? Math.max(2, Math.round(att.power * 1.2))) * 0.55;
    else {
      let fp = att.power - (att.disabled ? 3 : 0);
      if (att.npc?.tags.includes('apollo') && this.w.flags.dragon_weak) fp *= 0.65;
      d = Math.max(1, fp * D.foePower(att) * 0.4 - this.armorOf(tgt));
      if (tgt.kind === 'ally') d *= 0.6;
    }
    this.dmgCache.set(key, d);
    return d;
  }

  // ------------------------------------------------------------------ the log

  note(type: string, outcome: Outcome, data: EventData, weight: number, key: string): void {
    this.log.push({ type, outcome, data, weight, key, round: this.round });
  }

  proc(kind: string, foe: Unit, extra: EventData = {}): void {
    if (this.procs.has(kind)) return;
    this.procs.add(kind);
    this.note('weapon_proc', 'good', { variant: kind, weapon: this.wield.name, foe: foe.name, ...extra }, 2.5, `proc:${kind}`);
  }

  // ------------------------------------------------------------------ damage and its consequences

  damage(att: Unit | null, tgt: Unit, amount: number): number {
    // Inside a car with the doors shut, gunfire hits the car first and only a share gets through to whoever is sitting in it.
    if (att && att.reach[1] > 1 && this.sheltered(tgt)) {
      const o = this.carOf(tgt)!;
      this.hitObject(o, amount, 'gun');
      if (tgt.state !== 'active') return 0;
      amount = Math.round(amount * SPILL);
    } else if (att && att.reach[1] > 1 && this.carOf(tgt)?.body === 'bike' && !this.carOf(tgt)!.wrecked) {
      // On a bike there is nothing to hide behind: the shot is split between her and the bike.
      this.hitObject(this.carOf(tgt)!, amount * 0.5, 'gun');
      if (tgt.state !== 'active') return 0;
      amount = Math.round(amount * 0.5);
    }
    let n = Math.max(0, Math.round(amount));
    if (tgt.kind === 'hero') n = D.taken(this, this.interpose(n));
    if (n > 0 && att) {
      if (tgt.kind === 'foe' && att.kind === 'hero') this.dealt.set(tgt.name, (this.dealt.get(tgt.name) ?? 0) + n);
      else if (tgt.kind === 'hero') this.hitBy.set(att.name, (this.hitBy.get(att.name) ?? 0) + n);
    }
    tgt.ref.hp -= n;
    tgt.alert = true;
    if (att?.kind === 'hero' && tgt.kind === 'foe') D.leech(this, n);
    if (tgt.ref.hp <= 0 && tgt.state === 'active') {
      this.defeat(tgt);
      if (att?.kind === 'hero' && tgt.kind === 'foe') D.onKill(this, tgt);
    }
    return n;
  }

  /** A guard ally steps in front: it takes half of what it soaks. */
  private interpose(n: number): number {
    if (n <= 1) return n;
    const guard = this.units.find((u) => u.kind === 'ally' && u.state === 'active' && !u.interposed && (u.assist?.absorb ?? 0) > 0 && dist(u, this.hero) <= 2);
    if (!guard) return n;
    guard.interposed = true;
    const soaked = Math.min(n - 1, Math.round((guard.assist!.absorb ?? 0) * 0.6));
    guard.ref.hp -= Math.round(soaked * 0.5);
    if (guard.ref.hp <= 0) this.defeat(guard);
    if (!this.firstAssist.has(guard.id)) {
      this.firstAssist.add(guard.id);
      this.note('ally_assist', 'good', { name: guard.name, kind: guard.comp!.kind, dmg: 0, absorb: guard.assist!.absorb ?? 0, foe: this.standingFoes()[0]?.name ?? 'them' }, 2, `assist:${guard.id}`);
    }
    return n - soaked;
  }

  private defeat(t: Unit): void {
    if (t.kind === 'hero') return;
    if (t.kind === 'ally') {
      // Out of the fight. Usually they come round with a dent; sometimes, when it's for keeps, they don't.
      if (!this.o.lethal || !this.c.rng.chance(0.4)) t.ref.hp = 1;
      t.state = 'down';
      this.note('ally_down', 'bad', { name: t.name, kind: t.comp!.kind, lost: t.ref.hp <= 0 }, 4, `down:${t.id}`);
      return;
    }
    this.felled.push(t.name);
    if (this.o.lethal) {
      this.hooks.kill(this.c, this.w, t.npc!, this.w.hero.weapon.name);
      t.state = 'dead';
    } else {
      t.state = 'down';
      this.down.add(t.id);
    }
  }

  panicIfCan(t: Unit): boolean {
    if (t.leg || t.pinned > 0 || (this.sealed > 0 && t.kind === 'foe')) return false;
    const free = this.exitMap(t);
    if (!free.size || !free.has(idx(this.grid, t))) return false;
    t.fleeing = true;
    return true;
  }

  // ------------------------------------------------------------------ strikes

  heroStrike(t: Unit, o: { mult: number; ignoreArmor?: boolean; sure?: boolean; bonus?: boolean; noAmmo?: boolean }): number {
    const h = this.w.hero;
    const wield = this.wield;
    const fx = fxOf(wield);
    if (!o.noAmmo) {
      const spent = spendAmmo(h, wield);
      this.stats.ammoSpent += spent - D.refund(this, spent);
    }
    const sure = o.sure || this.mirage;
    this.mirage = false;
    if (!sure && !this.c.rng.chance(this.heroHitChance(t, this.hero, wield))) {
      if (wield.tags.includes('gun')) this.coverShot(this.hero, t, this.heroExpected(t, wield, 1));
      return 0;
    }
    const wasStunned = t.stunned;
    const wasUnaware = !t.alert;
    const rng = this.c.rng;
    let dmg = Math.round(this.power(wield) * (0.45 + rng.next() * 0.6));
    if (wield.unstable) {
      if (rng.chance(0.22)) {
        h.hp -= Math.round(h.maxHp * (0.08 + rng.next() * 0.1));
        this.stats.backfires++;
        dmg = Math.round(dmg * 0.4);
      } else if (rng.chance(0.3)) {
        dmg *= 2;
        this.stats.crits++;
      }
    }
    // What the weapon does besides hit: edge against this sort of enemy, crits, and plating it gets through.
    dmg = Math.round(dmg * vsMult(fx, t.npc));
    const crit = rng.chance(fx.crit + D.critBonus(this, t));
    if (crit) {
      dmg = Math.round(dmg * fx.critMult);
      this.proc('crit', t);
    }
    if (!o.ignoreArmor && t.npc) dmg = Math.max(1, dmg - Math.round(D.soak(this, t, fx.pierce, crit)));
    dmg = Math.round(dmg * D.dmgMult(this, t, this.hero));
    if (this.flanked(this.hero, t, this.hero)) dmg = Math.round(dmg * 1.2);
    dmg = Math.max(1, Math.round(dmg * o.mult));
    const dealt = this.damage(this.hero, t, dmg);
    if (t.state === 'active') {
      if (rng.chance(fx.stun)) {
        t.stunned = true;
        this.proc('stun', t);
      }
      if (rng.chance(fx.burn)) {
        t.burning = 3;
        this.proc('burn', t);
      }
    }
    D.afterStrike(this, t, { dealt, crit, wasStunned, wasUnaware, bonus: !!o.bonus });
    return dealt;
  }

  unitStrike(att: Unit, tgt: Unit): void {
    const rng = this.c.rng;
    if (!rng.chance(this.hitChance(att, tgt, att))) {
      if (att.reach[1] > 1) this.coverShot(att, tgt, this.avgDamage(att, tgt));
      if (tgt.kind === 'hero') D.onFoeMiss(this, att);
      return;
    }
    if (tgt.kind === 'hero' && D.deflected(this, att)) return;
    let fp = (att.power - (att.disabled ? 3 : 0)) * D.foePower(att);
    if (att.npc && att.kind === 'foe') fp *= clamp(1 + 0.2 * (ratio(att.npc, 'muscle') - 1), 0.75, 1.5);
    if (att.npc?.tags.includes('apollo') && this.w.flags.dragon_weak) fp *= 0.65;
    let d = Math.max(1, Math.round(fp * (0.2 + rng.next() * 0.4)) - this.armorOf(tgt));
    if (tgt.kind === 'ally') d = Math.round(d * 0.6);
    const dealt = this.damage(att, tgt, d);
    if (tgt.kind === 'hero' && !D.shrugsOff(this)) this.hooks.maybeInjure(this.c, dealt);
  }

  allyStrike(me: Unit, t: Unit, base: number): void {
    const rng = this.c.rng;
    if (!rng.chance(this.hitChance(me, t, me))) return;
    let d = Math.round(base * (0.6 + rng.next() * 0.5) * 0.9 * (me.over > 0 ? 1.5 : 1));
    if (t.npc) d = Math.max(1, d - Math.round(foeArmor(t.npc) * 0.5));
    this.damage(me, t, d);
    if (!this.firstAssist.has(me.id)) {
      this.firstAssist.add(me.id);
      this.stats.assists++;
      this.note('ally_assist', 'good', { name: me.name, kind: me.comp!.kind, dmg: me.assist?.dmg ?? 0, absorb: 0, foe: t.name }, 2, `assist:${me.id}`);
    }
  }

  heroThrow(t: Unit, item: Item): void {
    const h = this.w.hero;
    const rng = this.c.rng;
    this.threw = true;
    this.stats.threw++;
    h.inventory.splice(h.inventory.indexOf(item), 1);
    train(this.c, 'throwing', 2);
    if (item.tags.includes('cue')) train(this.c, 'pool', 1);
    if (!rng.chance(this.heroHitChance(t, this.hero, item, true))) return;
    const dmg = Math.round(this.hooks.throwDamage(this.w, item) * (0.8 + rng.next() * 0.6));
    this.damage(this.hero, t, dmg);
    if (item.tags.includes('fire')) {
      if (t.state === 'active') t.burning = 3;
      for (const f of this.standingFoes()) if (f !== t && dist(f, t) <= 1) this.damage(this.hero, f, dmg * 0.4);
    }
    this.note('throw', 'good', { variant: item.id, foe: t.name, dmg, cop: !!t.npc?.tags.includes('cop'), skilled: item.tags.includes('cue') && skillLevel(h, 'pool') >= 3 }, 3, 'throw');
  }

  ambushMult(): number {
    return 1.8 + skillValue(this.w.hero, 'sneak') * 0.15;
  }

  heroAmbush(t: Unit): void {
    const dealt = this.heroStrike(t, { mult: this.ambushMult(), ignoreArmor: true, sure: true });
    this.stats.ambushes++;
    train(this.c, 'sneak', 2);
    this.note('tactic', 'good', { variant: 'ambush', foe: t.name, weapon: this.wield.name, dmg: dealt, kill: t.state !== 'active' }, 4, 'ambush');
  }

  heroFlurry(t: Unit): void {
    this.stats.flurries++;
    this.heroStrike(t, { mult: 0.6 });
    if (t.state === 'active') this.heroStrike(t, { mult: 0.6 });
    this.note('tactic', 'good', { variant: 'flurry', foe: t.name }, 3, 'flurry');
  }

  // ------------------------------------------------------------------ shoving, hacking, scaring

  /** What a unit can actually move this turn: slowed, pinned and broken-legged units cover less ground. */
  speedOf(u: Unit): number {
    if (u.pinned > 0) return 0;
    if (u.speed === 0) return 0;
    const riding = this.carOf(u)?.body === 'bike' ? 3 : 0; // a bike under her
    return Math.max(1, u.speed + riding + (u.over > 0 ? 1 : 0) - (u.slow > 0 ? 1 : 0) - (u.leg ? 2 : 0));
  }

  /** Throw a foe back up to `n` tiles away from `me`: into a wall or person for damage and a daze, through an exit to be rid of them, onto a hazard for more. */
  knockback(me: Unit, t: Unit, n: number, slam = 1): void {
    const h = this.w.hero;
    for (let i = 0; i < n && t.state === 'active'; i++) {
      const dest = { x: t.x + Math.sign(t.x - me.x), y: t.y + Math.sign(t.y - me.y) };
      if (same(dest, t)) return;
      const terrain = terrainAt(this.grid, dest.x, dest.y);
      if (terrain === null || terrain === 'wall' || terrain === 'void' || terrain === 'cover' || this.occupant(dest)) {
        this.damage(me, t, Math.max(1, Math.round((h.muscle * 1.2 + h.level) * slam)));
        if (t.state === 'active') {
          t.stunned = true;
          t.stagger = 2;
        }
        return;
      }
      if (terrain === 'exit') {
        this.eject(t, 'thrown_out');
        return;
      }
      t.x = dest.x;
      t.y = dest.y;
      if (terrain === 'hazard' && !t.flying) {
        this.damage(me, t, hazardDmg(t));
        if (t.state === 'active') t.stunned = true;
        return;
      }
    }
  }

  shoveOutcome(me: Unit, t: Unit): { kind: 'out' | 'hazard' | 'slam' | 'push'; dmg: number; dest: Pos } | null {
    const dest = { x: t.x + Math.sign(t.x - me.x), y: t.y + Math.sign(t.y - me.y) };
    if (same(dest, me)) return null;
    const h = this.w.hero;
    const slam = Math.round(h.muscle * 1.2 + h.level);
    const terrain = terrainAt(this.grid, dest.x, dest.y);
    if (terrain === null || terrain === 'wall' || terrain === 'void' || terrain === 'cover' || this.occupant(dest)) return { kind: 'slam', dmg: slam, dest };
    if (terrain === 'exit') return { kind: 'out', dmg: 0, dest };
    if (terrain === 'hazard' && !t.flying) return { kind: 'hazard', dmg: hazardDmg(t), dest };
    return { kind: 'push', dmg: 0, dest };
  }

  shoveChance(t: Unit): number {
    const h = this.w.hero;
    return clamp(0.55 + (h.muscle - (t.npc?.level ?? 1) * 0.5) * 0.05 - (t.npc?.tags.includes('strong') ? 0.1 : 0), 0.25, 0.9);
  }

  heroShove(t: Unit): void {
    const o = this.shoveOutcome(this.hero, t);
    if (!o || !this.c.rng.chance(this.shoveChance(t))) return;
    this.stats.shoves++;
    if (o.kind === 'slam') {
      this.damage(this.hero, t, o.dmg);
      if (t.state === 'active') t.stunned = true;
      this.note('tactic', 'good', { variant: 'slam', foe: t.name, dmg: o.dmg }, 3, `shove:${t.id}`);
    } else if (o.kind === 'out') {
      this.eject(t, 'thrown_out');
    } else {
      t.x = o.dest.x;
      t.y = o.dest.y;
      if (o.kind === 'hazard') {
        this.damage(this.hero, t, o.dmg);
        if (t.state === 'active') t.stunned = true;
        this.note('tactic', 'good', { variant: 'hazard_shove', foe: t.name, dmg: o.dmg }, 3.5, `shove:${t.id}`);
      }
    }
    train(this.c, 'athletics', 1);
  }

  /** What a target's Intelligence takes off a Hack: the real number, or (for deciding whether to try) what she has read of it. */
  private firewall(t: Unit, perceivedOnly: boolean): number {
    if (!t.npc) return 0;
    return 0.05 * (perceivedOnly ? perceived(this.w, t.npc, 'int') : statsOf(t.npc).int);
  }

  hackChance(me: Unit, t: Unit, perceivedOnly = false): number {
    if (me.kind !== 'hero') return 0.6;
    const h = this.w.hero;
    return clamp(0.35 + h.int * 0.07 + skillValue(h, 'tinkering') * 0.03 - this.firewall(t, perceivedOnly), 0.1, 0.9);
  }

  /** Whether anyone could come if they called. */
  get backupPossible(): boolean {
    return !!this.o.backup;
  }

  /** One of them calls for help. Whoever hears it and would come turns up in a round or two. */
  callBackup(u: Unit): void {
    const heard = callForHelp(this.c, u.npc!);
    u.cd.call = 99;
    const cap = u.npc && channelNow(this.w, u.npc) === 'shout' ? 1 : 2;
    const pals = (this.o.backup?.() ?? []).filter((n) => heard.includes(n) && !this.units.some((x) => x.id === n.id) && !this.queue.some((q) => q.unit.id === n.id));
    for (const pal of pals.slice(0, cap)) this.queue.push({ unit: this.foeUnit(pal, true, 'pending'), round: this.round + 1 + this.c.rng.int(0, 2), why: 'backup' });
  }

  /** Hush, a Hack: a burst down the comm link that leaves them unable to call out for a while. A very good one leaves them with nothing, not even a shout. */
  doHush(t: Unit): void {
    const p = this.hackChance(this.hero, t);
    const r = this.c.rng.next();
    if (r >= p) return;
    hush(this.w, t.npc!, r < p * 0.2);
    this.stats.hacks++;
    train(this.c, 'tinkering', 1);
    this.note('tactic', 'good', { variant: 'hush', foe: t.name, deep: r < p * 0.2 }, 3, `hush:${t.id}`);
  }

  doHack(me: Unit, t: Unit): void {
    if (!this.c.rng.chance(this.hackChance(me, t))) return;
    t.stunned = true;
    t.disabled = true;
    if (me.kind === 'hero') {
      this.stats.hacks++;
      const dmg = t.npc?.tags.includes('robot') ? Math.round(this.w.hero.int * 2.2) : 0;
      if (dmg) this.damage(me, t, dmg);
      train(this.c, 'tinkering', 1);
      this.note('tactic', 'good', { variant: 'hack', foe: t.name, robot: !!t.npc?.tags.includes('robot') }, 3, `hack:${t.id}`);
    } else {
      this.note('ally_assist', 'good', { name: me.name, kind: me.comp!.kind, dmg: 0, absorb: 0, foe: t.name }, 2, `assist:${me.id}`);
    }
  }

  /** Optic Reset, a Hack: a burst down the optic feed that leaves anything with chrome for eyes blind for a few rounds. */
  opticChance(t: Unit, perceivedOnly = false): number {
    const h = this.w.hero;
    return clamp(0.4 + h.int * 0.07 + skillValue(h, 'tinkering') * 0.02 - this.firewall(t, perceivedOnly), 0.1, 0.92);
  }

  doOpticReset(t: Unit): void {
    if (!this.c.rng.chance(this.opticChance(t))) return;
    t.blind = 2 + Math.ceil(this.w.hero.int / 3);
    this.stats.hacks++;
    train(this.c, 'tinkering', 1);
    this.note('tactic', 'good', { variant: 'optic_reset', foe: t.name }, 3, `optic:${t.id}`);
  }

  // ---- the learnable Hacks and Overrides: see techniques.ts

  /** Gun Jam: its weapon locks up for a few rounds. */
  doGunJam(t: Unit): void {
    if (!this.c.rng.chance(this.hackChance(this.hero, t))) return;
    t.disarmed = true;
    this.stats.hacks++;
    train(this.c, 'tinkering', 1);
    this.note('tactic', 'good', { variant: 'gun_jam', foe: t.name }, 3, `gunjam:${t.id}`);
  }

  /** Limb Lock: a chromed limb stops answering. Slows them and cuts what they hit for. */
  doLimbLock(t: Unit): void {
    if (!this.c.rng.chance(this.hackChance(this.hero, t))) return;
    const arm = this.c.rng.chance(0.5);
    if (arm) t.arm = true;
    else t.leg = true;
    t.slow = Math.max(t.slow, 3);
    this.stats.hacks++;
    train(this.c, 'tinkering', 1);
    this.note('tactic', 'good', { variant: 'limb_lock', foe: t.name, arm }, 3, `limb:${t.id}`);
  }

  painSpikeDamage(t: Unit): number {
    return Math.round(this.w.hero.int * 3 * (t.npc?.tags.includes('robot') ? 1.4 : 1));
  }

  /** Pain Spike: feedback straight into the nervous system. */
  doPainSpike(t: Unit): void {
    if (!this.c.rng.chance(this.hackChance(this.hero, t))) return;
    this.stats.hacks++;
    train(this.c, 'tinkering', 1);
    this.damage(this.hero, t, this.painSpikeDamage(t));
    if (t.state === 'active') t.stagger = 2;
    this.note('tactic', 'good', { variant: 'pain_spike', foe: t.name }, 3, `spike:${t.id}`);
  }

  /** Rewrite: a robot or drone fights for her for a few rounds. */
  doRewrite(t: Unit): void {
    if (!this.c.rng.chance(clamp(this.hackChance(this.hero, t) - 0.1, 0.05, 0.85))) return;
    t.turned = 3 + Math.floor(this.w.hero.int / 4);
    t.fleeing = false;
    this.stats.hacks++;
    train(this.c, 'tinkering', 2);
    this.note('tactic', 'good', { variant: 'rewrite', foe: t.name }, 4, `rewrite:${t.id}`);
  }

  /** Hot-Wire: the car a foe was running for won't start. */
  doHotWire(): void {
    let any = false;
    for (const f of this.standingFoes()) {
      const o = this.keyCar(f);
      if (!o) continue;
      any = true;
      f.carFlee = undefined;
      o.carId = undefined;
    }
    if (!any) return;
    this.stats.hacks++;
    train(this.c, 'tinkering', 1);
    this.note('tactic', 'good', { variant: 'hot_wire' }, 3, 'hotwire');
  }

  /** Overclock: a drone, hacker or robot ally runs hot for a few rounds. */
  doOverclock(a: Unit): void {
    a.over = 3 + Math.floor(this.w.hero.int / 4);
    this.stats.hacks++;
    this.note('tactic', 'good', { variant: 'overclock', ally: a.name }, 3, `over:${a.id}`);
  }

  /** Door Lock: nobody leaves and nobody arrives for a while. */
  doDoorLock(): void {
    this.sealed = 3 + Math.floor(this.w.hero.int / 4);
    train(this.c, 'tinkering', 1);
    this.note('tactic', 'good', { variant: 'door_lock' }, 3, 'doorlock');
  }

  /** Lights Out: guns and throws miss in the dark. */
  doLightsOut(): void {
    this.dark = 4;
    train(this.c, 'tinkering', 1);
    this.note('tactic', 'good', { variant: 'lights_out' }, 3, 'lightsout');
  }

  /** Turret Takeover: the building's own gun changes sides for good. */
  doTurretTakeover(t: Unit): void {
    if (!this.c.rng.chance(this.hackChance(this.hero, t))) return;
    t.turned = 99;
    this.stats.hacks++;
    train(this.c, 'tinkering', 2);
    this.note('tactic', 'good', { variant: 'turret_takeover', foe: t.name }, 4, `turret:${t.id}`);
  }

  scareChance(t: Unit): number {
    const h = this.w.hero;
    const lvl = t.npc?.level ?? 1;
    const hurt = t.ref.hp / t.ref.maxHp < 0.5 ? 0.2 : 0;
    return clamp(0.1 + skillValue(h, 'intimidation') * 0.06 + (h.level - lvl) * 0.05 + h.fame * 0.004 + hurt + this.lostFraction() * 0.2 - (t.npc ? 0.08 * (ratio(t.npc, 'muscle') - 1) + 0.04 * (ratio(t.npc, 'int') - 1) : 0), 0.02, 0.7);
  }

  doIntimidate(t: Unit): void {
    if (!this.c.rng.chance(this.scareChance(t))) return;
    if (!this.panicIfCan(t)) return;
    t.scared = true;
    this.stats.scares++;
    train(this.c, 'intimidation', 2);
    this.note('tactic', 'good', { variant: 'intimidate', foe: t.name }, 3.5, `scare:${t.id}`);
  }

  setWatch(me: Unit): void {
    me.watching = true;
  }

  /** Off the board alive: through an exit, or thrown out of one. */
  eject(t: Unit, how: 'thrown_out' | 'ran' | 'scared' | 'drove'): void {
    t.state = 'fled';
    if (t.npc) {
      this.fled.add(t.npc.id);
      this.note('foe_flees', how === 'drove' ? 'mixed' : 'good', { variant: how, foe: t.name, role: t.npc.role, ...(how === 'drove' ? { car: this.carOf2(t)?.name ?? 'a car' } : {}) }, how === 'thrown_out' ? 4.5 : how === 'drove' ? 5 : 3.5, `flee:${t.id}`);
    }
  }

  leave(me: Unit): void {
    if (me.kind === 'foe' && me.carFlee && this.keyCar(me)) {
      // Into the car it has the key to, and gone: the car goes with it.
      const o = this.keyCar(me)!;
      this.eject(me, 'drove');
      this.getaways.push({ npc: me.npc!, carId: o.carId! });
      for (const p of o.cells) this.grid.cells[idx(this.grid, p)] = 'floor';
      this.grid.objects = (this.grid.objects ?? []).filter((x) => x !== o);
    } else if (me.kind === 'foe') this.eject(me, me.scared ? 'scared' : 'ran');
    else {
      me.state = 'fled';
      if (me.kind === 'hero') this.fledAt = { x: me.x, y: me.y };
    }
  }

  /** The car (not hers, in one piece) a foe has the key to, if it is on the board. */
  /** Anybody still to come through the doors. */
  reinforcementsDue(): boolean {
    return this.queue.length > 0;
  }

  keyCar(u: Unit): BoardObject | undefined {
    const n = u.npc;
    if (u.kind !== 'foe' || !n || n.flags.includes('cornered')) return undefined;
    const keys = n.loadout.filter((i) => i.tags.includes('key') && i.carId);
    return this.grid.objects?.find((o) => !o.mine && !o.wrecked && o.car.hp > 0 && !!o.carId && keys.some((k) => k.carId === o.carId));
  }

  private carOf2(u: Unit): BoardObject | undefined {
    return u.carFlee ? this.grid.objects?.find((o) => o.id === u.carFlee) : undefined;
  }

  /** Is this tile right beside the car the foe is running for? */
  nearCar(u: Unit, from: Pos): boolean {
    const o = this.carOf2(u);
    return !!o && !o.wrecked && o.cells.some((p) => dist(p, from) <= 1);
  }

  // ------------------------------------------------------------------ cars

  /** Cars on a street: hers beside her, a parked one or two, a police cruiser if there are police, and the shell of anything that has blown up before. */
  private parkCars(loc: Location): void {
    if (loc.kind !== 'street') return;
    const w = this.w;
    const h = w.hero;
    const rng = new Rng(`cars:${w.seed}:${w.beat}:${loc.id}`);
    const specs: Parameters<typeof addObjects>[2] = [];
    const add = (id: string, name: string, kind: BoardObject['kind'], car: CarLike, seats: number, o: Partial<BoardObject> = {}) => {
      const body = o.body ?? 'car';
      specs.push({ id, name, kind, car, body, size: body === 'bike' ? 1 : seats >= 6 ? 3 : 2, mine: false, team: 'neutral', doors: body === 'bike' ? 'forced' : 'shut', dents: 0, burn: 0, wrecked: false, ...o });
    };
    if (h.vehicle) add('own', h.vehicle.name, h.vehicle.kind, normalize(h.vehicle), h.vehicle.seats, { mine: true, team: 'hero', ref: h.vehicle, body: h.vehicle.body });
    for (const p of h.parked ?? []) if (p.at === loc.id && p.until > w.clock) add(`own:${p.name}`, p.name, p.kind, normalize(p), p.seats, { mine: true, team: 'hero', ref: p, body: p.body });
    const parked = parkedVehicle(w, loc);
    const squad = this.o.foes.some((f) => f.tags.includes('cop'));
    // The squad car is the car the officers came in; whatever is left of a car on the street is hurt by what happens to it here.
    if (parked) add('parked', parked.name, parked.kind, w.strays?.[loc.id] === parked ? parked : { hp: parked.maxHp, maxHp: parked.maxHp, armor: parked.armor }, parked.seats, { body: parked.body, carId: parked.id, ...(parked.kind === 'police' && squad ? { team: 'foe' as const } : {}) });
    if (squad && parked?.kind !== 'police') {
      const mk = MAKES.police[0]!;
      add('cruiser', mk.name, 'police', { hp: mk.maxHp, maxHp: mk.maxHp, armor: mk.armor }, mk.seats, { team: 'foe' });
    }
    if (w.flags[`wreck:${loc.id}`]) add('wreck', 'the burnt-out shell of a car', 'civilian', { hp: 0, maxHp: 1, armor: 0 }, 4, { wrecked: true });
    addObjects(this.grid, rng, specs);
  }

  ownCar(): BoardObject | undefined {
    return this.grid.objects?.find((o) => o.mine && !o.wrecked);
  }

  carOf(u: Unit): BoardObject | undefined {
    return u.aboard ? this.grid.objects?.find((o) => o.id === u.aboard) : undefined;
  }

  /** Sitting in a car with its doors shut. */
  sheltered(u: Unit): boolean {
    const o = this.carOf(u);
    return !!o && o.doors === 'shut' && !o.wrecked;
  }

  /** The car she could climb into from here: hers, in one piece, one step away. */
  carBeside(from: Pos): BoardObject | undefined {
    const o = this.ownCar();
    return o && o.car.hp > 0 && o.cells.some((p) => dist(p, from) <= 1) ? o : undefined;
  }

  /** She (and whoever of her party fits) gets in. */
  board(o: BoardObject): void {
    const bike = o.body === 'bike';
    const room = (o.ref?.seats ?? (bike ? 2 : 4)) - 1;
    let used = 0;
    this.hero.aboard = o.id;
    this.hero.x = o.cells[0]!.x;
    this.hero.y = o.cells[0]!.y;
    for (const u of this.units) {
      if (u.kind !== 'ally' || u.state !== 'active') continue;
      if (bike && KINDS[u.comp!.kind]?.flies) continue; // it flies alongside
      const seats = KINDS[u.comp!.kind]?.seats ?? 1;
      if (used + seats > room) continue;
      used += seats;
      u.aboard = o.id;
      u.x = o.cells[0]!.x;
      u.y = o.cells[0]!.y;
    }
  }

  /** Put a unit on the nearest free tile to the car it was in. */
  unseat(u: Unit): void {
    const o = this.carOf(u);
    u.aboard = undefined;
    if (!o) return;
    const spot = nearestFree(this.grid, this.c.rng, o.cells[0]!, (p) => !!this.occupant(p, u), u.flying)[0];
    if (spot) {
      u.x = spot.x;
      u.y = spot.y;
    }
  }

  /** Damage a car. Telling it is for the log; what it takes persists on the real car. */
  hitObject(o: BoardObject, dmg: number, how: 'gun' | 'ram' | 'fire' = 'gun'): void {
    if (o.wrecked) return;
    const hit = hitCar(o.car, dmg, how);
    if (hit.taken <= 0) return;
    if (hit.wrecked) this.explode(o);
    else if (hit.to !== hit.from) this.note('car_hit', o.mine ? 'bad' : 'good', { variant: hit.to, car: o.name, mine: o.mine, body: o.body }, 2.5, `car:${o.id}:${hit.to}`);
  }

  /** A shot that missed whoever it was aimed at, into the car they were sheltering behind. */
  private coverShot(att: Unit, tgt: Unit, dmg: number): void {
    const o = coverObject(this.grid, att, tgt);
    if (o) this.hitObject(o, dmg * 0.8, 'gun');
  }

  /**
   * The bang. Everyone inside takes the same flat damage, bigger the better armoured the car was; everyone beside it takes
   * a smaller one. The car is gone from her garage and what is left is cover for good.
   */
  private explode(o: BoardObject): void {
    const w = this.w;
    const h = w.hero;
    o.wrecked = true;
    o.burn = 3;
    o.car.hp = 0;
    for (const p of o.cells) this.grid.cells[idx(this.grid, p)] = 'hazard';
    if (o.ref) {
      if (h.vehicle === o.ref) delete h.vehicle;
      else h.parked = (h.parked ?? []).filter((p) => p !== o.ref);
    }
    const loc = h.locationId;
    w.flags[`wreck:${loc}`] = true;
    w.flags[`stolen:${loc}`] = true;
    if (w.strays?.[loc]) delete w.strays[loc];
    if (o.kind === 'police' || o.team === 'foe') w.heat.npd = Math.min(10, (w.heat.npd ?? 0) + 2);
    else if (o.kind === 'atlas') w.heat.atlas = Math.min(10, (w.heat.atlas ?? 0) + 2);
    const inside = this.units.filter((u) => u.aboard === o.id && u.state === 'active');
    const beside = this.units.filter((u) => u.state === 'active' && !u.aboard && o.cells.some((p) => dist(p, u) <= 1));
    const names = inside.map((u) => u.name).join(' and ');
    const bike = o.body === 'bike';
    // A bike throws whoever was on it as well: a fall on top of the bang.
    const fall = bike ? Math.round((o.ref?.pace ?? 11) * 0.8) : 0;
    const hurt = (u: Unit, n: number) => {
      u.ref.hp -= n;
      u.burning = 3;
      u.alert = true;
      if (u.kind === 'hero') {
        this.hooks.maybeInjure(this.c, n, bike ? 0.5 : 1);
        if (u.ref.hp <= 0) this.blastKill = true;
      } else if (u.ref.hp <= 0) {
        u.state = 'dead';
        if (u.npc) this.hooks.kill(this.c, w, u.npc, 'a car going up');
      }
    };
    const out = [...inside];
    for (const u of inside) {
      u.aboard = undefined;
      hurt(u, blastInside({ armor: o.car.armor, body: o.body }) + fall);
      if (bike) u.stagger = Math.max(u.stagger, 2);
    }
    for (const u of beside) hurt(u, blastOutside({ armor: o.car.armor, body: o.body }));
    for (const u of out) if (u.state === 'active') this.unseat(u);
    this.note('car_wreck', inside.some((u) => u.kind === 'hero') ? 'bad' : 'good', { car: o.name, kind: o.kind, body: o.body, inside: names, hero: inside.some((u) => u.kind === 'hero'), count: inside.length, beside: beside.length, mine: o.mine }, 7, `wreck:${o.id}`);
  }

  /** A foe with strong arms and no gun gets a car open: everyone in it is out on the street and the car is no longer cover. */
  forceDoor(att: Unit, o: BoardObject): void {
    const rng = this.c.rng;
    const p = clamp(0.35 + att.power * 0.003 + o.dents * 0.2 - o.car.armor * 0.08 + (1 - o.car.hp / o.car.maxHp) * 0.2, 0.1, 0.85);
    if (!rng.chance(p)) {
      o.dents++;
      this.note('car_door', 'mixed', { variant: 'dent', foe: att.name, car: o.name }, 2.5, `door:${o.id}:${o.dents}`);
      return;
    }
    o.doors = 'forced';
    const out = this.units.filter((u) => u.aboard === o.id && u.state === 'active');
    for (const u of out) {
      this.unseat(u);
      u.stagger = Math.max(u.stagger, 1);
    }
    this.note('car_door', 'bad', { variant: 'forced', foe: att.name, car: o.name, who: out.map((u) => u.name).join(' and ') }, 5, `door:${o.id}`);
  }

  /** She gets in her car and goes. */
  driveOff(o: BoardObject): void {
    const h = this.w.hero;
    if (o.ref && h.vehicle !== o.ref) {
      // It was parked here: it's the one she is driving now.
      const { at: _at, until: _until, ...car } = o.ref as ParkedVehicle;
      h.parked = (h.parked ?? []).filter((p) => p !== o.ref);
      h.vehicle = { ...car, riders: [] };
      o.ref = h.vehicle;
      o.car = h.vehicle;
    }
    if (h.vehicle) h.vehicle.riders = this.units.filter((u) => u.kind === 'ally' && u.state === 'active').map((u) => u.comp!.id).slice(0, Math.max(0, h.vehicle.seats - 1));
    this.note('car_drive_off', 'mixed', { car: o.name, body: o.body, hpPct: Math.round((h.hp / h.maxHp) * 100) }, 5, 'driveoff');
    this.droveOff = true;
    this.hero.state = 'fled';
  }

  /** The bike goes where she went: its one cell moves, unless she ended somewhere a bike can't stand (a doorway, a fire), when she gets off and it stays. */
  private rideTo(o: BoardObject, u: Unit): void {
    const g = this.grid;
    if (terrainAt(g, u.x, u.y) !== 'floor') {
      u.aboard = undefined;
      return;
    }
    for (const p of o.cells) g.cells[idx(g, p)] = 'floor';
    o.cells = [{ x: u.x, y: u.y }];
    g.cells[idx(g, u)] = 'cover';
    for (const a of this.units) if (a !== u && a.aboard === o.id) {
      a.x = u.x;
      a.y = u.y;
    }
  }

  /** In, a hit, and out: a swing or a shot at the end of a run, with the speed behind it. */
  rideBy(t: Unit): void {
    this.rideBonus = 0.1;
    const dealt = this.heroStrike(t, { mult: 1.25 });
    this.rideBonus = 0;
    train(this.c, 'driving', 1);
    this.note('tactic', 'good', { variant: 'ride_by', foe: t.name, dmg: dealt, weapon: this.wield.name }, 3.5, `rideby:${this.round}`);
  }

  /** Her car knocks somebody down: speed and weight, and the car pays for it. */
  runDown(t: Unit): void {
    const o = this.carOf(this.hero);
    if (!o) return;
    const h = this.w.hero;
    const pace = paceOf(normalize(o.ref ?? { ...o.car, id: o.id, body: o.body, kind: o.kind, name: o.name, speed: 1, pace: o.body === 'bike' ? 11 : 8, seats: o.body === 'bike' ? 2 : 4, riders: [] }));
    const dmg = Math.round((pace * 3 + h.muscle + skillValue(h, 'driving') * 1.5) * (0.7 + this.c.rng.next() * 0.6));
    this.damage(this.hero, t, dmg);
    if (t.state === 'active') {
      t.stunned = true;
      t.stagger = 2;
    }
    train(this.c, 'driving', 1);
    this.note('car_run_down', 'good', { foe: t.name, car: o.name, body: o.body, dmg }, 4, `rundown:${t.id}`);
    this.hitObject(o, o.car.maxHp * (o.body === 'bike' ? 0.15 : 0.07), 'ram');
  }

  // ------------------------------------------------------------------ the round

  run(): SimResult {
    const rng = this.c.rng;
    while (!this.result && this.round < this.o.maxRounds) {
      this.round++;
      const hpBefore = this.w.hero.hp;
      this.dealt.clear();
      this.hitBy.clear();
      this.felled = [];
      this.beginRound();
      const order = this.units
        .filter((u) => u.state === 'active')
        .map((u) => ({ u, init: this.initiative(u) + rng.next() * 4 }))
        .sort((a, b) => b.init - a.init)
        .map((x) => x.u);
      for (const u of order) {
        if (this.result) break;
        this.turn(u);
        this.checkEnd();
      }
      this.closeRound(hpBefore);
      // Whoever she crept up on has noticed her by the second round.
      if ((this.round >= 2 && this.round >= this.hush) || !this.o.assault) for (const f of this.units) if (f.team === 'foe') f.alert = true;
    }
    const ended = { hero: { x: this.hero.x, y: this.hero.y }, others: {} as Record<string, Pos> };
    for (const u of this.units) if (u.kind === 'foe') ended.others[u.id] = { x: u.x, y: u.y };
    return {
      result: this.result ?? 'flee',
      ...(this.fledAt ? { fledAt: this.fledAt } : {}),
      ended,
      rounds: this.round,
      down: this.down,
      fled: this.fled,
      arrived: this.arrived,
      wield: this.wield,
      stats: this.stats,
      droveOff: this.droveOff,
      getaways: this.getaways,
      cruiser: !!this.grid.objects?.some((o) => o.team === 'foe' && !o.wrecked),
      log: this.log,
      roundLog: this.roundLog,
    };
  }

  private closeRound(hpBefore: number): void {
    const h = this.w.hero;
    const top = (m: Map<string, number>): [string, number] => [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const [to] = top(this.dealt);
    const [by] = top(this.hitBy);
    this.roundLog.push({
      round: this.round,
      dealt: [...this.dealt.values()].reduce((a, n) => a + n, 0),
      to,
      taken: Math.max(0, hpBefore - h.hp),
      by,
      down: [...this.felled],
      foesLeft: this.standingFoes().length,
      hpPct: Math.max(0, Math.round((h.hp / h.maxHp) * 100)),
    });
  }

  private initiative(u: Unit): number {
    const h = this.w.hero;
    if (u.kind === 'hero') return 2 + h.reflex * 0.8 + skillValue(h, 'athletics') * 0.3 + (this.round === 1 && this.o.assault ? 10 : 0) + D.initiativeBonus(this, u);
    if (u.kind === 'ally') return 3 + u.speed * 0.4;
    return 2 + (u.npc?.level ?? 1) * 0.3 + u.speed * 0.3 + D.initiativeBonus(this, u);
  }

  private beginRound(): void {
    const rng = this.c.rng;
    for (const u of this.units) u.interposed = false;
    for (const o of this.grid.objects ?? []) {
      if (o.wrecked && o.burn > 0 && --o.burn === 0) for (const p of o.cells) if (terrainAt(this.grid, p.x, p.y) === 'hazard') this.grid.cells[idx(this.grid, p)] = 'cover';
    }
    D.regen(this);
    // Late arrivals come through the doors.
    if (this.sealed > 0) this.sealed--;
    if (this.dark > 0) this.dark--;
    const now = this.sealed > 0 ? [] : this.queue.filter((q) => q.round <= this.round);
    const groups = new Map<string, Unit[]>();
    for (const q of now) {
      this.queue.splice(this.queue.indexOf(q), 1);
      if (this.arriveAt(q.unit)) {
        if (q.why === 'backup') {
          q.unit.npc!.hostile = true;
          q.unit.npc!.affinity -= 15;
        }
        this.units.push(q.unit);
        this.arrived.push(q.unit.npc!);
        this.foeTotal++;
        groups.set(q.why, [...(groups.get(q.why) ?? []), q.unit]);
      }
    }
    for (const [why, us] of groups) {
      const names = us.map((u) => u.name).join(' and ');
      const key = why === 'joiner' ? 'join' : `reinforce:${why}`;
      const prior = this.log.find((e) => e.key === key);
      if (prior) {
        prior.data.npcs = `${prior.data.npcs} and ${names}`;
        prior.data.count = Number(prior.data.count) + us.length;
      } else if (why === 'joiner') this.note('brawl_joins', 'bad', { npcs: names, count: us.length }, 4.5, key);
      else this.note('reinforce', 'bad', { variant: why, npcs: names, count: us.length }, 4.5, key);
    }
  }

  /** Put a newcomer on or beside a free door. */
  private arriveAt(u: Unit): boolean {
    const g = this.grid;
    const door = this.grid.exits.find((e) => !this.occupant(e));
    const spot = door ?? nearestFree(g, this.c.rng, this.c.rng.pick(g.exits), (p) => !!this.occupant(p))[0];
    if (!spot) return false;
    u.x = spot.x;
    u.y = spot.y;
    u.state = 'active';
    return true;
  }

  private turn(u: Unit): void {
    if (u.state !== 'active') return;
    this.pw.clear();
    this.dmgCache.clear();
    u.watching = false;
    for (const k of Object.keys(u.cd)) if (u.cd[k]! > 0) u.cd[k]!--;
    if (!D.tickStatus(this, u)) return;
    if (u.burning > 0) {
      u.burning--;
      this.damage(null, u, Math.max(2, Math.round((u.kind === 'foe' ? this.power(this.wield) : u.power) * 0.15)));
      if (u.state !== 'active') return;
    }
    if (u.stunned) {
      u.stunned = false;
      return;
    }
    if (u.kind === 'hero') this.heroUpkeep();
    if (u.kind === 'foe') this.foeMorale(u);
    const opt = this.plan(u);
    if (opt) this.execute(u, opt);
    if (u.kind === 'hero') {
      // Free actions: a kill that keeps her moving, or nothing left to lose.
      for (let extra = D.bonusActions(this); extra > 0 && u.state === 'active' && !this.result && this.standingFoes().length; extra--) {
        const more = this.plan(u);
        if (more) this.execute(u, more);
      }
    }
    if (u.state === 'active' && !u.flying && terrainAt(this.grid, u.x, u.y) === 'hazard') {
      this.damage(null, u, hazardDmg(u));
      this.note('tactic', u.kind === 'foe' ? 'good' : 'bad', { variant: 'hazard', who: u.name, hero: u.kind !== 'foe' }, 2.5, `hazard:${u.id}`);
    }
  }

  private heroUpkeep(): void {
    const h = this.w.hero;
    const living = this.standingFoes().map((f) => f.npc!);
    this.wield = wielded(h, living);
    this.hero.reach = weaponReach(this.wield);
    this.branch = D.branchOf(this.wield);
    D.presence(this);
    if (this.wield.id !== this.lastWield) {
      const foe = living[0]?.name ?? 'them';
      if (!loaded(h, h.weapon)) this.note('out_of_ammo', 'bad', { weapon: h.weapon.name, ammo: h.weapon.ammoType ?? 'ammo', fallback: this.wield.name, bare: this.wield.id === 'fists' }, 3, 'ammo');
      else if (this.wield.id !== h.weapon.id) this.note('weapon_swap', 'mixed', { weapon: this.wield.name, old: this.lastWield === 'fists' ? 'bare fists' : h.weapon.name, foe }, 1.5, 'swap');
      this.lastWield = this.wield.id;
    }
    // No point running from a fight she's about to finish.
    const finishing = this.standingFoes().every((f) => f.ref.hp <= this.heroExpected(f, this.wield, 1) * 1.25);
    if (finishing) this.hero.fleeing = false;
    if (!finishing && !this.hero.fleeing && !this.outpaced() && this.round >= 2 && h.hp / h.maxHp < this.fleeAt &&this.c.rng.chance(0.55 + h.reflex * 0.03 + skillValue(h, 'athletics') * 0.02 + D.art(this, 'escape_artist') / 100) && this.exitMap(this.hero).has(idx(this.grid, this.hero))) {
      this.hero.fleeing = true;
      this.note('tactic', 'mixed', { variant: 'retreat', hpPct: Math.round((h.hp / h.maxHp) * 100) }, 3, 'retreat');
    }
  }

  /** Something that stays on her heels: a relentless dragon that is faster than she is can't be run from. */
  private outpaced(): boolean {
    return this.standingFoes().some((f) => !!f.npc && hasTrait(f.npc.archetype, 'relentless') && f.speed > this.hero.speed);
  }

  private foeMorale(u: Unit): void {
    if (!u.canFlee || u.fleeing) return;
    const r = u.ref.hp / u.ref.maxHp;
    // With the key to a car close by, running is a real option, and the nearer she is to finishing it the likelier they are to take it:
    // those who think they are about to die go early.
    const ride = this.keyCar(u);
    u.carFlee = ride?.id;
    if (ride) {
      const dread = this.heroExpected(u, this.wield, 1) / Math.max(1, u.ref.hp);
      if (dread >= 0.45 && this.c.rng.chance(clamp(0.3 + 0.55 * (dread - 0.45) + 0.25 * (1 - r), 0.15, 0.95)) && this.panicIfCan(u)) return;
    }
    if (r < 0.28 + D.nervePenalty(this, u) && this.c.rng.chance(0.35 + 0.35 * this.lostFraction())) this.panicIfCan(u);
  }

  private checkEnd(): void {
    if (this.result) return;
    const h = this.w.hero;
    const rng = this.c.rng;
    if (!this.standingFoes().length) {
      this.result = 'win';
      // Whatever she had turned is stood down with the rest.
      for (const u of this.units) if (u.team === 'foe' && u.turned > 0 && u.state === 'active') {
        u.state = 'down';
        this.down.add(u.id);
      }
    }
    else if (this.hero.state === 'fled') this.result = 'flee';
    else if (h.hp <= 0 && (this.o.lethal || this.blastKill)) {
      if (this.w.hero.implants.some((i) => i === 'emergency_defib') && !this.w.flags.defib_used) {
        this.w.flags.defib_used = true;
        h.hp = Math.round(h.maxHp * 0.3);
        this.note('defib', 'mixed', {}, 5, 'defib');
        this.result = 'flee';
      } else {
        const foes = [...this.o.foes, ...this.arrived];
        this.result = foes.some((f) => f.tags.includes('cop')) && rng.chance(0.55) ? 'arrested' : 'dead';
      }
    } else if (!this.o.lethal && h.hp < h.maxHp * 0.2) this.result = 'tossed';
  }

  // ------------------------------------------------------------------ deciding what to do

  /** Steps to the nearest exit nobody is standing on, from every tile. */
  private exitMap(u: Unit): Map<number, number> {
    const g = this.grid;
    const best = new Map<number, number>();
    // A foe with a car to run to runs to the car.
    const ride = this.carOf2(u);
    if (ride && !ride.wrecked) {
      for (const p of ride.cells) {
        const r = reach(g, p, 40, () => false, u.flying, this.climbs(u), true);
        for (const [i, c] of r.cost) if (c < (best.get(i) ?? Infinity)) best.set(i, c);
      }
      return best;
    }
    for (const e of g.exits) {
      if (this.occupant(e, u)) continue;
      const r = reach(g, e, 40, () => false, u.flying, this.climbs(u), true);
      for (const [i, c] of r.cost) if (c < (best.get(i) ?? Infinity)) best.set(i, c);
    }
    return best;
  }

  private enemyDistMap(u: Unit, enemies: Unit[]): Map<number, number> {
    const best = new Map<number, number>();
    for (const e of enemies) {
      const r = reach(this.grid, e, 30, () => false, u.flying, this.climbs(e));
      for (const [i, c] of r.cost) if (c < (best.get(i) ?? Infinity)) best.set(i, c);
    }
    return best;
  }

  private danger(u: Unit, tile: Pos, enemies: Unit[]): number {
    let d = 0;
    for (const e of enemies) {
      if (e.stunned || e.fleeing) continue;
      const gap = dist(e, tile);
      if (gap > this.speedOf(e) + e.reach[1] + (e.flying ? 1 : 0)) continue;
      let p = e.npc?.tags.includes('hera') ? 1 : e.hit;
      if (e.reach[1] > 1 && inCover(this.grid, e, tile)) p -= 0.25;
      if (e.reach[1] > 1) p += this.heightEdge(e, tile);
      if (e.reach[1] > 1 && this.sheltered(u) && same(tile, u)) p -= 0.25;
      d += Math.min(1, this.avgDamage(e, u) / Math.max(1, u.ref.hp)) * Math.max(0.05, p);
    }
    return d;
  }

  private posScore(u: Unit, tile: Pos, k: TurnCtx): number {
    const key = idx(this.grid, tile);
    const cached = k.pos.get(key);
    if (cached !== undefined) return cached;
    let s = -this.danger(u, tile, k.enemies) * k.caution;
    if (k.fleeing && k.exitDist) {
      s -= (k.exitDist.get(key) ?? 60) * 6;
    } else {
      const path = k.enemyDist.get(key) ?? 40;
      const near = Math.min(...k.enemies.map((e) => dist(e, tile)));
      const [, max] = u.reach;
      if (max <= 1) s -= 0.7 * Math.max(0, path - 1);
      else {
        s -= 0.9 * Math.max(0, path - max);
        if (near <= 1) s -= 2.5;
      }
      if (u.kind === 'ally') {
        const gap = dist(tile, this.hero);
        s -= (u.assist?.absorb ? 1.5 : 0.6) * Math.max(0, gap - (u.assist?.absorb ? 1 : 3));
      }
    }
    if (!u.flying && terrainAt(this.grid, tile.x, tile.y) === 'hazard') s -= k.fleeing ? 4 : 14;
    // Those who shoot like the high ground.
    if (this.grid.level && u.reach[1] > 1 && !k.fleeing) {
      const mine = levelAt(this.grid, tile.x, tile.y);
      s += 0.7 * clamp(mine - Math.min(...k.enemies.map((e) => levelAt(this.grid, e.x, e.y))), -2, 2);
    }
    k.pos.set(key, s);
    return s;
  }

  private plan(u: Unit): Option | null {
    const g = this.grid;
    const rng = this.c.rng;
    const enemies = this.enemiesOf(u);
    if (!enemies.length) return null;
    let fleeing = u.fleeing;
    let exitDist: Map<number, number> | null = null;
    if (fleeing) {
      exitDist = this.exitMap(u);
      if (!exitDist.has(idx(g, u))) fleeing = false; // nowhere to run: fight
    }
    const ratio = u.ref.hp / u.ref.maxHp;
    const caution = u.kind === 'hero' ? 2.5 + 10 * Math.pow(1 - ratio, 1.5) + 3 * this.w.hero.competence : u.caution * (1 + (1 - ratio) * 2);
    const k: TurnCtx = { enemies, caution: fleeing ? 1 : caution, fleeing, exitDist, enemyDist: this.enemyDistMap(u, enemies), pos: new Map() };
    const techs = fleeing ? techniquesFor(this, u).filter((t) => t.id === 'leave') : techniquesFor(this, u);
    const blocked = (p: Pos) => enemies.some((e) => same(e, p));
    const speed = this.speedOf(u);
    const walk = reach(g, u, speed, blocked, u.flying, this.climbs(u));
    const sprint = reach(g, u, speed * 2, blocked, u.flying, this.climbs(u));

    const cands: { tile: Pos; mode: Option['mode']; r: Reach | null; cost: number }[] = [];
    for (const [i, c] of sprint.cost) {
      const tile = posOf(g, i);
      if (!same(tile, u) && this.occupant(tile, u)) continue;
      const walkCost = walk.cost.get(i);
      if (same(tile, u)) cands.push({ tile, mode: 'stay', r: null, cost: 0 });
      else if (walkCost !== undefined) cands.push({ tile, mode: 'walk', r: walk, cost: walkCost });
      else cands.push({ tile, mode: 'dash', r: sprint, cost: c });
    }
    if (u.kind === 'hero' && this.w.hero.implants.includes('hydraulic_calves') && !u.cd.leap) {
      for (let y = Math.max(0, u.y - 4); y <= Math.min(g.h - 1, u.y + 4); y++) {
        for (let x = Math.max(0, u.x - 4); x <= Math.min(g.w - 1, u.x + 4); x++) {
          const tile = { x, y };
          if (!passable(g, x, y, false) || this.occupant(tile, u) || cands.some((c) => same(c.tile, tile))) continue;
          cands.push({ tile, mode: 'leap', r: null, cost: 0 });
        }
      }
    }

    let best: Option | null = null;
    const consider = (o: Option) => {
      o.score += rng.next() * 0.4;
      if (!best || o.score > best.score) best = o;
    };
    for (const cand of cands) {
      const pos = this.posScore(u, cand.tile, k) - (cand.mode === 'walk' ? 0.12 * cand.cost : cand.mode === 'dash' ? 0.12 * cand.cost + 1.6 : cand.mode === 'leap' ? 1.2 : 0);
      consider({ tile: cand.tile, mode: cand.mode, r: cand.r, tech: null, target: null, score: pos });
      if (cand.mode === 'dash') continue;
      for (const tech of techs) {
        if (tech.targets === 'self') {
          const v = tech.value(this, u, cand.tile, null);
          if (v !== null) consider({ tile: cand.tile, mode: cand.mode, r: cand.r, tech, target: null, score: pos + v });
          continue;
        }
        for (const e of enemies) {
          const d = dist(cand.tile, e);
          if (d < tech.range[0] || d > tech.range[1]) continue;
          if (tech.los && !hasLos(g, cand.tile, e)) continue;
          const v = tech.value(this, u, cand.tile, e);
          if (v !== null) consider({ tile: cand.tile, mode: cand.mode, r: cand.r, tech, target: e, score: pos + v });
        }
      }
    }
    return best;
  }

  /** Hauling yourself up something that is not meant for it: athletics for her, how hard a foe is for them. */
  private climbRoll(u: Unit): boolean {
    const p = u.kind === 'hero' ? 0.55 + 0.05 * skillValue(this.w.hero, 'athletics') + 0.01 * this.w.hero.reflex : 0.5 + 0.02 * (u.npc?.level ?? 1);
    if (u.kind === 'hero') train(this.c, 'athletics', 1);
    return this.c.rng.chance(clamp(p, 0.2, 0.95));
  }

  private execute(u: Unit, o: Option): void {
    const rode = u.aboard ? this.carOf(u) : undefined;
    // She gets out when she walks off; on a bike she rides, and it goes where she goes.
    if (rode && o.mode !== 'stay' && (rode.body !== 'bike' || u.kind !== 'hero')) u.aboard = undefined;
    const sx = u.x;
    const sy = u.y;
    u.moved = o.mode !== 'stay';
    if (u.kind === 'hero') this.moved = u.moved;
    if (o.mode === 'leap') {
      u.x = o.tile.x;
      u.y = o.tile.y;
      u.cd.leap = 3;
      this.stats.leaps++;
      this.note('tactic', 'good', { variant: 'leap' }, 2, `leap:${this.round}`);
      this.triggerWatch(u);
    } else if (o.mode !== 'stay' && o.r) {
      for (const step of pathTo(this.grid, o.r, o.tile)) {
        if (u.state !== 'active') return;
        const how = stepOf(this.grid, u, step, this.climbs(u));
        if (how.check && !this.climbRoll(u)) {
          // Slipped. She stays where she was, and now and then comes down hard.
          this.note('tactic', u.kind === 'hero' ? 'bad' : 'good', { variant: 'climb_fail', foe: u.name }, 1.5, `climb_fail:${u.id}:${this.round}`);
          if (this.c.rng.chance(0.2)) this.damage(null, u, 2 + this.c.rng.int(0, 3));
          break;
        }
        if (how.check) this.note('tactic', 'good', { variant: 'climb', foe: u.name, hero: u.kind === 'hero' }, 1, `climb:${u.id}`);
        u.x = step.x;
        u.y = step.y;
        if (how.fall > 0) {
          this.damage(null, u, how.fall * (3 + this.c.rng.int(0, 3)));
          this.note('tactic', u.kind === 'hero' ? 'bad' : 'good', { variant: 'fall', foe: u.name, levels: how.fall + 1 }, 1.5, `fall:${u.id}:${this.round}`);
          if (u.state !== 'active') return;
        }
        this.triggerWatch(u);
      }
    }
    if (rode?.body === 'bike' && u.kind === 'hero' && u.aboard && (u.x !== sx || u.y !== sy)) this.rideTo(rode, u);
    if (u.state !== 'active' || !o.tech) return;
    const t = o.target;
    if (t) {
      const d = dist(u, t);
      if (t.state !== 'active' || d < o.tech.range[0] || d > o.tech.range[1] || (o.tech.los && !hasLos(this.grid, u, t))) return;
    }
    o.tech.run(this, u, t);
  }

  /** Blackbird on overwatch gets a free shot at the first enemy to step into her sights. */
  private triggerWatch(mover: Unit): void {
    const w = this.hero;
    if (!w.watching || w.state !== 'active' || mover.team === w.team || mover.state !== 'active') return;
    if (dist(w, mover) > w.reach[1] || (w.reach[1] > 1 && !hasLos(this.grid, w, mover))) return;
    w.watching = false;
    this.stats.overwatch++;
    this.overwatching = true;
    this.heroStrike(mover, { mult: 0.75 + D.art(this, 'hair_trigger') / 100 });
    this.overwatching = false;
    this.note('tactic', 'good', { variant: 'overwatch', foe: mover.name, weapon: this.wield.name }, 3, `watch:${this.round}`);
  }
}

/** The handful of moments worth telling, in the order they happened. */
export function highlights(log: LogEntry[], max = 5): LogEntry[] {
  const seen = new Set<string>();
  const unique = log.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)));
  const keep = new Set(
    unique
      .map((e, i) => ({ e, i }))
      .sort((a, b) => b.e.weight - a.e.weight || a.i - b.i)
      .slice(0, max)
      .map((x) => x.e),
  );
  return unique.filter((e) => keep.has(e));
}
