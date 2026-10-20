import { Rng } from './rng';
import type { Ctx, Location, Npc, World } from './types';
import { addHeat, fight, heroPower, maybeInjure } from './combat';
import { clamp, spawnGroup } from './candidate';
import { BARKS, TRAPS, barkOf, rollHazards } from './content/hazards';
import { skillLevel, train, skillRoot } from './skills';
import { renameNpc } from './population';

/**
 * Guard dogs and traps. A home that is well secured keeps better ones (content/hazards.ts). She meets them on the way
 * in, before she gets to the take: a dog might hear her or might not, a trap she might spot and might disarm, and
 * whatever she can't deal with is a fight or a hit she walks out with, if she walks out.
 */

/** Everything the home keeps for her to deal with. True if she's through and can get on with it; false if she's out (or worse). */
export function meetHazards(c: Ctx, home: Location): boolean {
  const { w } = c;
  home.hazards ??= rollHazards(new Rng(`hazards:${w.worldSeed}:${home.id}`), home.security);
  const kept = home.hazards;
  if (kept.dogs && !kept.dogs.cleared && !meetDogs(c, home, kept.dogs)) return false;
  if (w.over) return false;
  if (kept.trap && !kept.trap.spent && !meetTrap(c, home, kept.trap)) return false;
  return !w.over;
}

function meetDogs(c: Ctx, home: Location, dogs: NonNullable<Location['hazards']>['dogs'] & object): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const bark = barkOf(dogs.model);
  const rank = BARKS.indexOf(bark);
  const data = { place: home.name, model: `BARK-${bark.model}`, count: dogs.count };
  // They are machines that listen for a living; the better ones hear a great deal.
  const heard = clamp(0.33 + 0.1 * rank - skillRoot(h, 'sneak') * 0.05, 0.1, 0.95);
  if (!rng.chance(heard)) {
    c.emit('home_hazard', 'good', { variant: 'dogs_slip', ...data });
    dogs.cleared = true; // they never woke; they won't now
    return true;
  }
  // Does she stand a chance? A hero with any sense looks at what is coming and goes home.
  if (bark.power * dogs.count > heroPower(w) * 1.4 && rng.chance(0.35 + 0.55 * h.competence)) {
    c.emit('home_hazard', 'mixed', { variant: 'dogs_retreat', ...data });
    return false;
  }
  const pack = spawnGroup(c, 'guard_dog', dogs.count);
  for (const d of pack) setStats(w, d, `BARK-${bark.model}`, bark.hp, bark.power, 1 + rank * 2);
  c.emit('home_hazard', 'bad', { variant: 'dogs', ...data });
  const res = fight(c, pack, { cause: `${dogs.count > 1 ? 'guard dogs' : 'a guard dog'} at ${home.name}`, joiners: false });
  if (w.over || res !== 'win') return false;
  dogs.cleared = true;
  return true;
}

function setStats(w: World, n: Npc, name: string, hp: number, power: number, level: number): void {
  renameNpc(w, n, name); // the name index has to follow

  n.hp = n.maxHp = hp;
  n.power = power;
  n.level = level;
}

function meetTrap(c: Ctx, home: Location, trap: NonNullable<Location['hazards']>['trap'] & object): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const def = TRAPS[trap.kind]!;
  const data = { place: home.name, trap: trap.kind };
  const spot = clamp(0.33 + skillRoot(h, 'sneak') * 0.05 + h.int * 0.03 + h.competence * 0.1, 0.1, 0.9);
  if (rng.chance(spot)) {
    // A turret is a computer: it is her hacking that talks it down, not her lockpicks.
    const skill = trap.kind === 'sentry_turret' ? h.int * 0.08 : 0.025 + skillRoot(h, 'lockpicking') * 0.04 + h.int * 0.02;
    if (rng.chance(clamp(def.disarm + skill, 0.1, 0.9))) {
      c.emit('home_hazard', 'good', { variant: 'trap_disarmed', ...data });
      train(c, trap.kind === 'sentry_turret' ? 'tinkering' : 'lockpicking', 2);
      trap.spent = true;
      return true;
    }
    c.emit('home_hazard', 'bad', { variant: 'trap_failed', ...data });
  } else {
    c.emit('home_hazard', 'bad', { variant: 'trap_sprung', ...data });
  }
  trap.spent = true;
  return spring(c, home, trap.kind);
}

/** It goes off. True if she's still in a state to carry on. */
function spring(c: Ctx, home: Location, kind: string): boolean {
  const { w, rng } = c;
  const h = w.hero;
  const def = TRAPS[kind]!;
  if (kind === 'sentry_turret') {
    const [turret] = spawnGroup(c, 'sentry_turret', 1);
    const big = home.security >= 5;
    setStats(w, turret!, 'SENTRY-9', big ? 100 : 60, big ? 24 : 16, big ? 8 : 5);
    const res = fight(c, [turret!], { cause: `a sentry turret at ${home.name}`, joiners: false });
    return !w.over && res === 'win';
  }
  const dmg = rng.int(def.damage![0], def.damage![1]);
  h.hp -= dmg;
  maybeInjure(c, dmg, 0.5);
  if (kind === 'grenade_string') addHeat(w, 'npd', 1); // that was loud
  c.emit('home_hazard', 'bad', { variant: 'trap_hit', place: home.name, trap: kind, damage: dmg });
  // Gas puts her out for the night's worth of this job: she wakes on the landing with the take untouched and a headache.
  if (kind === 'gas_vent') return false;
  return h.hp > 0;
}
