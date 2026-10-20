import { Rng } from './rng';
import type { Ctx, Location, Npc, World } from './types';
import { MAKES, carKey, makesOf, paceOf, vehicleOf, type Make } from './cars';
import { fight, heroPower, maybeInjure } from './combat';
import { spawnGroup, clamp } from './candidate';
import { dead, pursuers, runChase, type Chaser } from './chase';
import { roadClass } from './roads';
import { scoutSaves } from './extras';
import { talkDown } from './speaking';

/**
 * Being attacked by a vehicle: an NPD patrol car pulling up on her, or a ganger drive-by. They arrive in a car (or on a bike), and she
 * has to decide whether to stand and fight or run. Standing is an ordinary fight with their car on the street behind them (cover for them,
 * and a way out if one of them is in a bad way: the driver has the key). Running is a chase: **on foot, with them tailing her in the
 * vehicle**, or in her own if she has one. See docs/VEHICLE_COMBAT.md.
 */

export type Attacker = 'npd' | 'gang';

/** A street a car can come down. */
export const drivable = (loc: Pick<Location, 'kind' | 'name' | 'road' | 'gen' | 'street'>): boolean => loc.kind === 'street' && roadClass(loc) !== 'alley';

/**
 * How likely a gang's car is to come round the corner on her this beat. Their own turf, and the more they have against her, the likelier;
 * the poor districts at night a little even when it is nobody's. Never in a building, an alley or on a highway.
 */
export function driveByChance(w: World, loc: Location): number {
  if (!loc.outdoors || !drivable(loc) || loc.road === 'highway') return 0;
  if (loc.territory && w.factions[loc.territory]?.kind === 'gang') return 0.012 + 0.006 * Math.min(5, w.heat[loc.territory] ?? 0);
  const d = loc.gen?.district;
  return d === 'slum' || d === 'tenement' || d === 'industrial' ? 0.003 : 0;
}

/** Roll for it. Its own stream, so a beat in which nothing comes changes nothing else. Returns whether something did. */
export function driveByRoll(c: Ctx): boolean {
  const { w } = c;
  const loc = w.locations[w.hero.locationId]!;
  const p = driveByChance(w, loc);
  if (!p || w.beat < 12) return false;
  if (!new Rng(`driveby:${w.seed}:${w.beat}`).chance(p)) return false;
  if (scoutSaves(c)) return true;
  const small = new Rng(`driveby-crew:${w.seed}:${w.beat}`);
  const bike = small.chance(0.3);
  const crew = spawnGroup(c, 'ganger', bike ? 1 : small.int(2, 3), loc.territory ?? undefined);
  vehicleAttack(c, 'gang', crew);
  return true;
}

/** A police car pulls up on her. Called by the ordinary police response when she is on foot on a street a car can come down. */
export function patrolPullsUp(c: Ctx, officers: Npc[]): boolean {
  const { w } = c;
  const loc = w.locations[w.hero.locationId]!;
  if (w.hero.vehicle || !drivable(loc) || !new Rng(`patrol:${w.seed}:${w.beat}`).chance(0.45)) return false;
  const cops = officers.filter((n) => n.tags.includes('cop'));
  if (!cops.length) return false;
  vehicleAttack(c, 'npd', cops);
  return true;
}

/** Fight or run? She takes the measure of them and of herself. */
export function standsAndFights(c: Ctx, crew: Npc[]): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const ratio = crew.reduce((a, n) => a + n.power, 0) / (heroPower(w) * clamp(h.hp / h.maxHp, 0.3, 1));
  const t = h.personality.traits;
  // Outgunned, hurt, and level-headed: run. Brave, proud, or on top of them: stand.
  const run = clamp(0.2 + 0.45 * (ratio - 0.7) + (h.hp / h.maxHp < 0.5 ? 0.25 : 0) + 0.25 * (h.competence - 0.5) - 0.35 * (t.courage - 0.5) - 0.2 * (t.reckless - 0.5), 0.05, 0.9);
  return !rng.chance(run);
}

/** Their vehicle: a car, or now and then a bike. */
function ride(who: Attacker, crew: Npc[], rng: Rng): Make {
  const bike = crew.length === 1 && who === 'gang';
  if (who === 'npd') return MAKES.police[rng.int(0, 1)]!;
  return bike ? makesOf('civilian', 'bike').find((m) => m.name.includes('chopper'))! : MAKES.civilian[rng.int(0, 1)]!;
}

/**
 * The attack. They come at her, and it is her choice what happens next: fight them where they stopped, or run, and then it is a chase,
 * with her on foot (or in her own vehicle) and them behind her in theirs.
 */
export function vehicleAttack(c: Ctx, who: Attacker, crew: Npc[]): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const mk = ride(who, crew, new Rng(`ride:${w.seed}:${w.beat}`));
  const car = vehicleOf(mk, `attack:${crew[0]!.id}`);
  // Whoever is driving has the key. (A gang's car is a gang's: it won't keep.)
  crew[0]!.loadout.push(carKey(car, who === 'gang'));
  for (const n of crew) n.hostile = true;

  // A drive-by starts with a drive-by: they go past shooting.
  let dmg = 0;
  if (who === 'gang') {
    for (const n of crew) {
      if (rng.chance(0.5)) dmg += Math.max(0, Math.round(n.power * 0.35 * (0.6 + rng.next() * 0.8)) - (h.armor?.power ?? 0));
    }
    h.hp -= dmg;
    if (dmg) maybeInjure(c, dmg, 0.3);
  }
  c.emit('vehicle_attack', 'bad', { variant: who, car: car.name, body: car.body, kind: car.kind, count: crew.length, place: loc.name, dmg, foe: crew[0]!.name, on: h.vehicle ? 'wheels' : 'foot' });
  if (dead(c)) {
    c.emit('death', 'bad', { killer: crew[0]!.name, place: loc.name, cause: who === 'npd' ? 'a police patrol' : 'a drive-by', level: h.level });
    return;
  }

  if (standsAndFights(c, crew)) {
    c.emit('attack_choice', 'mixed', { variant: 'stand', foe: crew[0]!.name, count: crew.length });
    // Their car stops where they got out of it, and it is cover for them and a way out.
    if (!w.strays?.[loc.id]) (w.strays ??= {})[loc.id] = { ...car, riders: [] };
    if (!talkDown(c, crew)) fight(c, crew, { cause: who === 'npd' ? 'a police patrol' : 'a drive-by', joiners: false });
    return;
  }
  c.emit('attack_choice', 'mixed', { variant: 'run', foe: crew[0]!.name, count: crew.length, on: h.vehicle ? 'wheels' : 'foot' });
  chaseHer(c, who, crew, car);
}

/** She runs and they follow, in their vehicle. The chase is the same one as ever; what she is on decides how it goes. */
function chaseHer(c: Ctx, who: Attacker, crew: Npc[], car: ReturnType<typeof vehicleOf>): void {
  const { w } = c;
  const h = w.hero;
  const foes: Chaser[] =
    who === 'npd'
      ? pursuers(crew, c.rng)
      : [{ name: `${car.name} (${crew.map((n) => n.name).join(' and ')})`, crew, car: { id: car.id, body: car.body, kind: car.kind, name: car.name, hp: car.hp, maxHp: car.maxHp, armor: car.armor }, pace: paceOf(car), gap: 2.5, alive: true }];
  const result = runChase(c, { mode: 'pursued', cause: who === 'npd' ? 'a police patrol' : 'a drive-by', foes });
  if (w.over) return;
  if (result === 'caught' || result === 'bailed' || result === 'wrecked') {
    const left = crew.filter((n) => n.alive);
    if (left.length && h.hp > 0) fight(c, left, { cause: who === 'npd' ? 'a police patrol' : 'a drive-by', joiners: false });
  } else if (result === 'won' && who === 'npd') {
    w.heat.npd = Math.min(10, (w.heat.npd ?? 0) + 2);
  }
}
