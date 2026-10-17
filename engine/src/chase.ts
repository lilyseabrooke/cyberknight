import type { Ctx, Npc, Vehicle } from './types';
import { ALL_MAKES, MAKES, SPILL, blastInside, carKey, hitCar, makesOf, normalize, stateOf, vehicleOf } from './cars';
import { fight, heroPower, kill, maybeInjure, relocate } from './combat';
import { spawnGroup, clamp } from './candidate';
import { heroSpeed } from './dragonmodels';
import { nested } from './events';
import { roadsFrom } from './roads';
import { KINDS, removeCompanion } from './companions';
import { skillValue, train } from './skills';
import { hasImplantFlag } from './skills';

/**
 * A chase: a fight at speed. There is no board, only how far apart everybody is, what the road is like, and what each side
 * does about it this round. Police cruisers and dragons are the ones after her (or the ones she is after). The car she is in
 * takes the hits first and a share gets through to her; when it is done it goes up, and everyone in it with it.
 * See docs/VEHICLE_COMBAT.md.
 */

export type Band = 'far' | 'near' | 'close' | 'locked';
export type Stretch = 'open' | 'traffic' | 'tight' | 'bridge';
export type ChaseResult = 'caught' | 'escaped' | 'lost' | 'wrecked' | 'bailed' | 'won';

export const bandOf = (gap: number): Band => (gap <= 0.5 ? 'locked' : gap <= 2.5 ? 'close' : gap <= 6 ? 'near' : 'far');

export interface Chaser {
  name: string;
  /** The people in it (or the dragon itself). */
  crew: Npc[];
  /** A car, if it is in one. A dragon has wings instead. */
  car?: { id: string; body?: Vehicle['body']; kind: Vehicle['kind']; name: string; hp: number; maxHp: number; armor: number };
  pace: number;
  /** Tiles between it and her. */
  gap: number;
  alive: boolean;
}

export interface ChaseOpts {
  /** `pursued`: they are after her and she wants away. `pursuer`: she is after something that is running. */
  mode: 'pursued' | 'pursuer';
  cause: string;
  foes: Chaser[];
  maxRounds?: number;
}

const STRETCHES: Stretch[] = ['open', 'open', 'traffic', 'tight', 'bridge'];
const ESCAPE_GAP = 14;

const power = (ch: Chaser): number => ch.crew.reduce((a, n) => a + n.power, 0);
const wings = (ch: Chaser): boolean => !ch.car;

/** Run the chase and tell it. The caller deals with what comes of it (a fight when she is caught, a dragon that gets away). */
export function runChase(c: Ctx, o: ChaseOpts): ChaseResult {
  const { w, rng } = c;
  const h = w.hero;
  let result: ChaseResult | null = null;
  const maxRounds = o.maxRounds ?? 8;
  const place = w.locations[h.locationId]!.name;
  const car = h.vehicle ? normalize(h.vehicle) : null;
  if (!car) return o.mode === 'pursuer' ? 'lost' : 'caught';
  let rounds = 0;

  nested(c, 'chase_start', 'mixed', { cause: o.cause, mode: o.mode, car: car.name, foes: o.foes.map((f) => f.name).join(', '), count: o.foes.length, place, wings: o.foes.some(wings) }, () => {
    for (let round = 1; round <= maxRounds && !result; round++) {
      rounds = round;
      const live = o.foes.filter((f) => f.alive);
      if (!live.length) {
        result = 'won';
        break;
      }
      const stretch = rng.pick(STRETCHES);
      const skill = skillValue(h, 'driving') * 0.5 + h.reflex * 0.3;
      const hero = heroSpeed(w);
      const nearest = () => live.reduce((a, f) => (f.gap < a.gap ? f : a));
      const lead = nearest();
      const band = bandOf(lead.gap);
      const armedBack = h.weapon.tags.includes('gun') || h.companions.some((a) => a.hp > 0 && KINDS[a.kind]?.assist.dmg && car.riders.includes(a.id));
      const hpRatio = h.hp / h.maxHp;
      const carRatio = car.hp / car.maxHp;
      const bike = car.body === 'bike';
      const squeeze = stretch === 'tight' || stretch === 'traffic';

      // What she does this round.
      const scores: Record<string, number> = o.mode === 'pursuer'
        ? { floor_it: 6, shoot: armedBack && (band === 'near' || band === 'close') ? 4.5 : 0, swerve: 0.5 }
        : {
            floor_it: 3 + (band === 'close' || band === 'locked' ? 3 : 0),
            swerve: 1.5 + (band !== 'far' ? 2 : 0),
            // A bike fits where a car does not: it can stay out of reach without ending the chase.
            ...(bike ? { lane_split: squeeze && band !== 'far' ? 5.5 : 0 } : {}),
            lose_them: squeeze && lead.gap >= 3 ? 6.5 : 0,
            shoot: armedBack && (band === 'near' || band === 'close') ? 4 : 0,
            // A bike against anything bigger gets the worst of a ram.
            ram: (band === 'close' || band === 'locked') && lead.car ? (bike && lead.car.body !== 'bike' ? 0.2 : 3 + car.armor * 0.4) : 0,
            bail: carRatio <= 0.25 || (hpRatio < 0.3 && carRatio < 0.5) || (bike && hpRatio < 0.4) ? 3 + 10 * (0.25 - Math.min(carRatio, 0.25)) : 0,
          };
      if (carRatio <= 0.25) scores.bail = (scores.bail ?? 0) + 3 + h.competence * 4; // smoking: it is about to go
      const slack = (1 - h.competence) * 4;
      const action = Object.keys(scores).map((k) => ({ k, s: scores[k]! + rng.next() * (1 + slack) })).sort((a, b) => b.s - a.s)[0]!.k;
      const told: string[] = [];
      let hurt = 0;

      // The road moves everybody: the faster closes on the slower, skill matters when it is tight, and speed when it is open.
      for (const f of live) {
        const edge = ((f.pace - hero) * 0.5) * (stretch === 'open' ? 1.3 : stretch === 'bridge' ? 1 : 0.6);
        const sk = squeeze ? skill * 0.12 + (bike ? 1 : 0) : 0;
        const drift = o.mode === 'pursuer' ? edge - sk : -edge + sk;
        f.gap = Math.max(0, f.gap + drift + (rng.next() - 0.5) * 1.5);
      }
      if (action === 'floor_it') {
        const push = 1.5 + skill * 0.25;
        for (const f of live) f.gap = Math.max(0, f.gap + (o.mode === 'pursuer' ? -push : push));
        hitCar(car, car.maxHp * 0.02, 'fire'); // redlining
        told.push('floor');
      }

      // What she does to them.
      if (action === 'lane_split') {
        const t = nearest();
        t.gap += 1.5 + skill * 0.2;
        told.push('split');
      } else if (action === 'shoot') {
        const t = nearest();
        const dmg = Math.round((heroPower(w) * 0.3 + riderShots(h, car)) * (0.6 + rng.next() * 0.8));
        if (rng.chance(0.6 - (t.gap > 3 ? 0.1 : 0))) {
          dmgChaser(c, t, dmg, told);
          told.push(`shot:${t.name}`);
        } else told.push('miss');
        train(c, 'marksmanship', 1);
      } else if (action === 'ram') {
        const t = nearest();
        const rel = (hero + t.pace) * 0.9 + car.armor;
        if (t.car) {
          const hit = hitCar(t.car, rel * (bike && t.car.body !== 'bike' ? 0.3 : 0.9), 'ram');
          if (hit.wrecked) wreckChaser(c, t, told);
        }
        const mine = hitCar(car, rel * (bike ? 1.2 : 0.5), 'ram');
        hurt += mine.taken;
        train(c, 'driving', 1);
        told.push('ram');
      } else if (action === 'lose_them' && rng.chance(clamp(0.4 + skill * 0.05 - (stretch === 'tight' ? 0 : 0.1) + (bike ? 0.15 : 0), 0.15, 0.9))) {
        result = 'escaped';
        told.push('lost');
      } else if (action === 'bail') {
        result = 'bailed';
        told.push('bail');
      }

      // What they do to her.
      if (!result) {
        for (const f of o.foes.filter((x) => x.alive)) {
          const b = bandOf(f.gap);
          const hit = (action === 'swerve' || action === 'lane_split' ? 0.3 : 0.55) + (stretch === 'open' ? 0.05 : 0);
          if (wings(f) && b === 'locked') {
            // At the door.
            const p = clamp(0.3 + power(f) * 0.002 - car.armor * 0.06, 0.1, 0.7);
            if (rng.chance(p)) {
              result = 'bailed';
              told.push('door');
              break;
            }
            hurt += hitCar(car, power(f) * 0.15, 'ram').taken;
          } else if (b === 'near' || b === 'close' || b === 'locked') {
            if (rng.chance(hit)) {
              const dmg = Math.round(power(f) * (wings(f) ? 0.3 : 0.5) * (0.6 + rng.next() * 0.8));
              // In a car the car takes it and a share gets through; on a bike it is split between her and the bike.
              const r = hitCar(car, bike ? dmg * 0.5 : dmg, 'gun');
              hurt += r.taken;
              h.hp -= Math.round(bike ? dmg * 0.5 : r.taken * SPILL);
              told.push(`hit:${f.name}`);
            }
          }
          if (!wings(f) && (b === 'close' || b === 'locked') && rng.chance(0.4)) {
            const rel = (f.pace + hero) * 0.7;
            hurt += hitCar(car, rel, 'ram').taken;
            if (f.car) {
              const x = hitCar(f.car, rel * 0.5, 'ram');
              if (x.wrecked) wreckChaser(c, f, told);
            }
            told.push('rammed');
            // A car that hits a bike can throw her off it.
            if (bike && f.car?.body !== 'bike' && rng.chance(0.35)) {
              result = 'bailed';
              told.push('thrown');
              break;
            }
          }
        }
      }

      if (!result && car.hp <= 0) result = 'wrecked';
      else if (!result && o.mode === 'pursued' && live.every((f) => f.gap >= ESCAPE_GAP)) result = 'escaped';
      else if (!result && o.mode === 'pursuer' && live.every((f) => f.gap >= ESCAPE_GAP)) result = 'lost';
      else if (!result && o.mode === 'pursuer' && live.some((f) => bandOf(f.gap) === 'locked') && action !== 'shoot') result = 'caught';
      else if (!result && o.mode === 'pursued' && live.some((f) => bandOf(f.gap) === 'locked') && round >= maxRounds - 1 && rng.chance(0.5)) result = 'caught';

      c.emit('chase_round', hurt > 0 ? 'bad' : action === 'floor_it' || action === 'lose_them' ? 'good' : 'mixed', {
        variant: action,
        body: car.body,
        round,
        stretch,
        band: bandOf(nearest().gap),
        gap: Math.round(nearest().gap),
        car: car.name,
        state: stateOf(car),
        hurt,
        foe: o.foes.filter((f) => f.alive)[0]?.name ?? 'them',
        events: told.join(','),
      });
      if (car.hp / car.maxHp <= 0.25 && car.hp > 0 && round < maxRounds && !result) c.emit('car_hit', 'bad', { variant: 'smoking', car: car.name, body: car.body, mine: true });
    }
    if (!result) result = o.mode === 'pursuer' ? 'lost' : o.foes.some((f) => f.alive && f.gap < 3) ? 'caught' : 'escaped';
    if (result === 'wrecked' || car.hp <= 0) result = 'wrecked';
    finish(c, o, result, car, rounds);
  });
  return result ?? 'lost';
}

/** What a rider with a gun adds to hers. */
function riderShots(h: Ctx['w']['hero'], car: Vehicle): number {
  let d = 0;
  for (const a of h.companions) if (a.hp > 0 && car.riders.includes(a.id)) d += (KINDS[a.kind]?.assist.dmg ?? 0) * 0.4;
  return d;
}

function dmgChaser(c: Ctx, t: Chaser, dmg: number, told: string[]): void {
  if (t.car) {
    const hit = hitCar(t.car, dmg, 'gun');
    if (hit.wrecked) wreckChaser(c, t, told);
  } else {
    // A dragon takes it on the hide; it never drops out of a chase, only out of the sky when she gets it into a fight.
    for (const n of t.crew) n.hp = Math.max(1, n.hp - dmg);
  }
}

/** Their car goes up with them in it. */
function wreckChaser(c: Ctx, t: Chaser, told: string[]): void {
  t.alive = false;
  if (t.car) t.car.hp = 0;
  told.push(`wreck:${t.name}`);
  c.emit('car_wreck', 'good', { car: t.car?.name ?? t.name, kind: t.car?.kind ?? 'police', body: t.car?.body ?? 'car', inside: t.crew.map((n) => n.name).join(' and '), hero: false, count: t.crew.length, mine: false });
  for (const n of t.crew) if (n.alive) kill(c, c.w, n, 'a car going up');
}

/** The end of it: what happened to the car, to her, and to where she is. */
function finish(c: Ctx, o: ChaseOpts, result: ChaseResult, car: Vehicle, rounds: number): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = h.locationId;
  w.clock += rounds;
  let taken = 0;
  if (result === 'wrecked') {
    // Up it goes, with her in it, and everyone with her.
    taken = wreckHeroCar(c, car);
    if (dead(c)) {
      c.emit('chase_end', 'bad', { variant: result, mode: o.mode, taken, car: car.name, rounds });
      c.emit('death', 'bad', { killer: 'a burning car', place: w.locations[loc]!.name, cause: o.cause, level: h.level });
      return;
    }
  } else if (result === 'bailed') {
    // Out of the car at speed, and the car is lost to whoever was after her.
    const fall = Math.round(heroSpeed(w) * (car.body === 'bike' ? 0.7 : 1.2));
    taken = fall;
    h.hp -= fall;
    maybeInjure(c, fall);
    delete h.vehicle;
    // A bike goes down where she left it, and is hers to come back for.
    if (car.body === 'bike' && car.hp > 0 && !w.strays?.[loc]) (w.strays ??= {})[loc] = { ...car, riders: [] };
    train(c, 'athletics', 2);
  } else if (result === 'escaped') {
    // Out of sight: a few streets on.
    const far = roadsFrom(w, loc, 4).filter((r) => r.hops >= 3);
    if (far.length) for (const id of rng.pick(far).path) relocate(w, id);
    if (o.foes.some((f) => f.car?.kind === 'police' || f.crew.some((n) => n.tags.includes('cop')))) w.heat.npd = Math.max(0, (w.heat.npd ?? 0) - 2);
    train(c, 'driving', 2);
  } else if (result === 'won') train(c, 'driving', 2);
  // A cruiser still running when it ends is left where it stopped: hers for the taking, and its driver has the key.
  if (result === 'caught' || result === 'bailed' || result === 'wrecked') {
    const left = o.foes.find((f) => f.alive && f.car && f.car.hp > 0);
    const mk = left?.car && ALL_MAKES.find((m) => m.name === left.car!.name);
    if (left?.car && mk && !w.strays?.[loc] && !w.flags[`stolen:${loc}`]) (w.strays ??= {})[loc] = { ...vehicleOf(mk, left.car.id), hp: left.car.hp };
  }
  for (const a of [...h.companions]) if (a.hp <= 0) removeCompanion(c, a, 'lost');
  c.emit('chase_end', result === 'escaped' || result === 'won' ? 'good' : result === 'lost' ? 'mixed' : 'bad', { variant: result, mode: o.mode, taken, car: car.name, body: car.body, rounds, foe: o.foes[0]?.name ?? 'them', state: stateOf(car) });
}

// =============================================================== the police

/** Cops in cruisers, two to a car, as chasers. */
export function pursuers(cops: Npc[], rng?: { chance(p: number): boolean }): Chaser[] {
  const out: Chaser[] = [];
  let i = 0;
  let k = 0;
  while (i < cops.length) {
    // One in three comes alone, on a bike: the one that can keep up.
    const alone = !!rng && rng.chance(0.3);
    const crew = cops.slice(i, i + (alone ? 1 : 2));
    i += crew.length;
    const bike = alone || crew.length === 1 && cops.length % 2 === 1 && i >= cops.length && !!rng && rng.chance(0.5);
    const mk = bike ? makesOf('police', 'bike')[0]! : MAKES.police[k % 2]!;
    k++;
    const id = `chase:${crew[0]!.id}`;
    // Whoever is driving has the key to it.
    crew[0]!.loadout.push(carKey({ id, name: mk.name }, crew[0]!.tags.includes('ganger')));
    out.push({ name: `${bike ? 'an NPD patrol cycle' : 'an NPD cruiser'} (${crew.map((n) => n.name).join(' and ')})`, crew, car: { id, body: mk.body ?? 'car', kind: 'police', name: mk.name, hp: mk.maxHp, maxHp: mk.maxHp, armor: mk.armor }, pace: mk.pace, gap: 3 + out.length, alive: true });
  }
  return out;
}

/** Two officers to a car. (The old name.) */
export const cruisers = (cops: Npc[]): Chaser[] => pursuers(cops);

/**
 * The police come after her in cars. If they catch her it ends in the street, with the cops; if she gets away the heat drops;
 * if she wrecks them, they are down and the police take that personally.
 */
export function policeChase(c: Ctx, why: 'hijack' | 'ambush' | 'drive_off' | 'crash', cops?: Npc[]): ChaseResult | null {
  const { w } = c;
  const h = w.hero;
  if (!h.vehicle || h.vehicle.hp <= 0) return null;
  const npd = w.heat.npd ?? 0;
  const squad = cops ?? spawnGroup(c, 'npd_officer', npd >= 6 ? 4 : 2);
  const foes = pursuers(squad.filter((n) => n.alive), c.rng);
  if (!foes.length) return null;
  c.emit('ambush', 'bad', { variant: 'npd_chase', count: squad.length, heat: npd, why });
  const result = runChase(c, { mode: 'pursued', cause: 'an NPD pursuit', foes });
  if (w.over) return result;
  if (result === 'caught' || result === 'bailed' || result === 'wrecked') {
    const left = squad.filter((n) => n.alive);
    if (left.length && h.hp > 0) fight(c, left, { cause: 'the end of a police chase', joiners: false });
  } else if (result === 'won') {
    // Cruisers in pieces. The police take that personally.
    w.heat.npd = Math.min(10, (w.heat.npd ?? 0) + 2);
  }
  return result;
}

/** She has been after a dragon in a car: can she get her bumper to it? */
export function dragonChase(c: Ctx, foe: Npc, speed: number, cause: string): ChaseResult {
  return runChase(c, { mode: 'pursuer', cause, foes: [{ name: foe.name, crew: [foe], pace: speed, gap: 8, alive: true }] });
}

// =============================================================== the end of her own car

/**
 * Her car goes up with her in it and everyone with her. A bike throws her as well, a fall on top of the bang. Returns what it did
 * to her; the caller tells it and sees whether she is dead (`dead`).
 */
export function wreckHeroCar(c: Ctx, car: Vehicle): number {
  const { w } = c;
  const h = w.hero;
  const loc = h.locationId;
  const blast = blastInside(car) + (car.body === 'bike' ? Math.round(car.pace * 0.8) : 0);
  h.hp -= blast;
  maybeInjure(c, blast, car.body === 'bike' ? 0.5 : 1);
  const riders = h.companions.filter((a) => car.riders.includes(a.id));
  for (const a of riders) a.hp = 0;
  delete h.vehicle;
  w.flags[`wreck:${loc}`] = true;
  w.flags[`stolen:${loc}`] = true;
  c.emit('car_wreck', 'bad', { car: car.name, kind: car.kind, body: car.body, inside: ['Blackbird', ...riders.map((a) => a.name)].join(' and '), hero: true, count: 1 + riders.length, mine: true });
  if (car.kind === 'police') w.heat.npd = Math.min(10, (w.heat.npd ?? 0) + 2);
  else if (car.kind === 'atlas') w.heat.atlas = Math.min(10, (w.heat.atlas ?? 0) + 2);
  for (const a of [...h.companions]) if (a.hp <= 0) removeCompanion(c, a, 'lost');
  return blast;
}

/** She is dead, and nothing is going to bring her back (the defibrillator is for the generic path to handle). Marks the run over. */
export function dead(c: Ctx): boolean {
  const { w } = c;
  const h = w.hero;
  if (h.hp > 0 || (hasImplantFlag(h, 'defib') && !w.flags.defib_used)) return false;
  w.over = true;
  w.ending = 'dead';
  return true;
}
