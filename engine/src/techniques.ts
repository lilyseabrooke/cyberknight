import type { Item } from './types';
import type { Pos } from './grid';
import { dist, terrainAt } from './grid';
import type { Sim, Unit } from './tactics';
import { doctrineTechniques } from './doctrine';

/**
 * Everything a unit can do with its action, as data plus two small functions. Adding a way to fight is adding an entry
 * to `techniquesFor`: say who has it, how far it reaches, what it is worth from where they stand (`value`, in the same
 * units as every other technique, so the AI can compare a shove with a shot) and what it does (`run`).
 *
 * Positional moves that aren't attacks (walking, sprinting, leaping) live in the planner in tactics.ts.
 */
export interface Technique {
  id: string;
  targets: 'enemy' | 'self';
  /** Min and max distance to the target, in tiles. */
  range: [number, number];
  los: boolean;
  /** Worth of doing it from `from` to `t`; null if it can't be done from there. */
  value(s: Sim, u: Unit, from: Pos, t: Unit | null): number | null;
  run(s: Sim, u: Unit, t: Unit | null): void;
}

const frac = (dmg: number, hp: number): number => Math.min(1, dmg / Math.max(1, hp));

/** How attractive a hit of this size is: mostly how much of the target it takes, plus a premium for finishing it. */
export const strikeValue = (p: number, exp: number, hp: number): number => 18 * frac(p * exp, hp) + (exp >= hp * 0.9 ? 7 * p : 0);

const personOnly = (t: Unit): boolean => !!t.npc && !t.npc.tags.some((x) => ['robot', 'dragon', 'boss'].includes(x));

// ------------------------------------------------------------------ the basic attack

function attack(s: Sim, u: Unit): Technique {
  if (u.kind === 'hero') {
    const weapon = s.wield;
    return {
      id: 'attack',
      targets: 'enemy',
      range: u.reach,
      los: u.reach[1] > 1,
      value(s2, me, from, t) {
        const p = s2.heroHitChance(t!, from, weapon);
        let v = strikeValue(p, s2.heroExpected(t!, weapon, 1), t!.ref.hp);
        if (t!.fleeing) v += 3; // run them down
        if (s2.flanked(me, t!, from)) v += 1.5;
        return v;
      },
      run(s2, me, t) {
        s2.heroStrike(t!, { mult: 1 });
      },
    };
  }
  return {
    id: 'attack',
    targets: 'enemy',
    range: u.reach,
    los: u.reach[1] > 1,
    value(s2, me, from, t) {
      if (me.reach[1] <= 1 && t!.aboard && s2.sheltered(t!)) return null; // they have to get the door open first
      const p = s2.hitChance(me, t!, from);
      // Foes are after the hero. Her little friends are a distraction, and a hit on one is judged against her health, not theirs.
      if (t!.kind === 'hero') return strikeValue(p, s2.avgDamage(me, t!), t!.ref.hp) * 1.25;
      return strikeValue(p, s2.avgDamage(me, t!), Math.max(t!.ref.hp, s2.hero.ref.hp * 0.7)) * 0.5;
    },
    run(s2, me, t) {
      s2.unitStrike(me, t!);
    },
  };
}

// ------------------------------------------------------------------ hero techniques

function throwing(s: Sim): Technique[] {
  if (s.threw || !s.throwOk) return [];
  const h = s.w.hero;
  const items = h.inventory.filter((i) => i.tags.includes('throwable'));
  if (!items.length) return [];
  const item: Item = items.find((i) => i.tags.includes('fire')) ?? items.find((i) => i.id === 'switchblade') ?? items.find((i) => i.tags.includes('cue')) ?? items[0]!;
  const dmgOf = () => s.hooks.throwDamage(s.w, item);
  return [
    {
      id: 'throw',
      targets: 'enemy',
      range: [2, 4],
      los: true,
      value(s2, me, from, t) {
        const p = s2.heroHitChance(t!, from, item, true);
        return strikeValue(p, dmgOf() * 0.95, t!.ref.hp) * 0.95 + 1.5;
      },
      run(s2, me, t) {
        s2.heroThrow(t!, item);
      },
    },
  ];
}

function ambush(s: Sim): Technique[] {
  const w = s.wield;
  if (!w.tags.includes('melee') || w.id === 'fists') return [];
  return [
    {
      id: 'ambush',
      targets: 'enemy',
      range: [1, 1],
      los: false,
      value(s2, me, from, t) {
        if (t!.alert) return null;
        const exp = s2.heroExpected(t!, w, s2.ambushMult(), true);
        return strikeValue(1, exp, t!.ref.hp) + 4;
      },
      run(s2, me, t) {
        s2.heroAmbush(t!);
      },
    },
  ];
}

function flurry(s: Sim): Technique[] {
  const h = s.w.hero;
  if (!h.implants.includes('mantis_blades') || s.hero.cd.flurry) return [];
  return [
    {
      id: 'flurry',
      targets: 'enemy',
      range: [1, 1],
      los: false,
      value(s2, me, from, t) {
        const p = s2.heroHitChance(t!, from, s2.wield);
        return strikeValue(p, s2.heroExpected(t!, s2.wield, 1.15), t!.ref.hp) + 1;
      },
      run(s2, me, t) {
        me.cd.flurry = 2;
        s2.heroFlurry(t!);
      },
    },
  ];
}

function shove(s: Sim): Technique[] {
  if (s.hero.cd.shove) return [];
  return [
    {
      id: 'shove',
      targets: 'enemy',
      range: [1, 1],
      los: false,
      value(s2, me, from, t) {
        if (!t!.npc || t!.npc.tags.some((x) => ['boss', 'dragon'].includes(x))) return null;
        const o = s2.shoveOutcome(me, t!);
        if (!o) return null;
        const p = s2.shoveChance(t!);
        const hp = t!.ref.hp;
        if (o.kind === 'out') return 13 * p;
        if (o.kind === 'hazard') return (6 + 10 * frac(o.dmg, hp)) * p;
        if (o.kind === 'slam') return (4 + 10 * frac(o.dmg, hp)) * p;
        return 0.4 * p; // a shove into open floor mostly wastes the turn
      },
      run(s2, me, t) {
        me.cd.shove = 3;
        s2.heroShove(t!);
      },
    },
  ];
}

function hack(s: Sim, u: Unit): Technique[] {
  const isHero = u.kind === 'hero';
  if (u.cd.hack) return [];
  if (isHero && s.w.hero.hack < 2) return [];
  if (!isHero && !u.assist?.disable) return [];
  return [
    {
      id: 'hack',
      targets: 'enemy',
      range: [2, 6],
      los: false,
      value(s2, me, from, t) {
        if (!t!.npc || t!.npc.tags.some((x) => x === 'boss' || x === 'dragon')) return null;
        // Blackbird's own hacking needs something with chrome in it; a hacker friend can jam anybody's gun.
        if (isHero && !t!.npc.tags.some((x) => x === 'robot' || x === 'augmented')) return null;
        if (t!.stunned || t!.disabled) return null;
        const p = s2.hackChance(me, t!);
        const threat = frac(s2.avgDamage(t!, s2.hero), s2.hero.ref.hp);
        return (5 + 14 * threat) * p;
      },
      run(s2, me, t) {
        me.cd.hack = isHero ? 3 : 2;
        s2.doHack(me, t!);
      },
    },
  ];
}

function intimidate(s: Sim): Technique[] {
  if (s.hero.cd.intimidate) return [];
  return [
    {
      id: 'intimidate',
      targets: 'enemy',
      range: [1, 3],
      los: true,
      value(s2, me, from, t) {
        if (!t!.npc || !personOnly(t!) || t!.npc.tags.some((x) => x === 'cop' || x === 'security') || t!.fleeing) return null;
        const p = s2.scareChance(t!);
        if (p < 0.08) return null;
        const threat = frac(s2.avgDamage(t!, s2.hero), s2.hero.ref.hp);
        return (4 + 14 * threat) * p;
      },
      run(s2, me, t) {
        me.cd.intimidate = 4;
        s2.doIntimidate(t!);
      },
    },
  ];
}

function overwatch(s: Sim): Technique[] {
  const w = s.wield;
  if (!w.tags.includes('gun')) return [];
  return [
    {
      id: 'overwatch',
      targets: 'self',
      range: [0, 0],
      los: false,
      value(s2, me, from) {
        // Worth it when somebody is about to walk into the line of fire and there's nothing to shoot yet.
        const [, far] = me.reach;
        const coming = s2.enemiesOf(me).filter((e) => !e.fleeing && dist(from, e) > far && dist(from, e) <= far + e.speed + 1);
        return coming.length ? 5.5 : null;
      },
      run(s2, me) {
        s2.setWatch(me);
      },
    },
  ];
}

// ------------------------------------------------------------------ cars

/** Climb into her own car from beside it: the best cover there is while the doors hold. */
function getIn(s: Sim): Technique[] {
  const mine = s.ownCar();
  if (!mine || s.hero.aboard || mine.doors !== 'shut' || mine.car.hp / mine.car.maxHp <= 0.25) return [];
  return [
    {
      id: 'get_in',
      targets: 'self',
      range: [0, 0],
      los: false,
      value(s2, me, from) {
        if (!s2.carBeside(from)) return null;
        const foes = s2.enemiesOf(me);
        const shooters = foes.filter((e) => e.reach[1] > 1).length / Math.max(1, foes.length);
        const ratio = me.ref.hp / me.ref.maxHp;
        // Worth it when she is hurt and what is coming is guns; a melee crowd just opens the door.
        return 0.8 + 7 * (1 - ratio) * shooters + (s2.wield.tags.includes('gun') ? 1 : 0);
      },
      run(s2) {
        s2.board(s2.ownCar()!);
      },
    },
  ];
}

/** Put her foot down and leave the fight in her own car. */
function driveOff(s: Sim): Technique[] {
  const mine = s.ownCar();
  if (!mine || mine.car.hp <= 0) return [];
  return [
    {
      id: 'drive_off',
      targets: 'self',
      range: [0, 0],
      los: false,
      value(s2, me, from) {
        if (!s2.carOf(me) && !s2.carBeside(from)) return null;
        const ratio = me.ref.hp / me.ref.maxHp;
        const threat = s2.enemiesOf(me).reduce((a, e) => a + frac(s2.avgDamage(e, me), me.ref.hp), 0);
        if (ratio < 0.5) return 6 + 20 * (0.5 - ratio);
        return threat > 0.6 ? 4 * threat : null;
      },
      run(s2) {
        s2.driveOff(s2.ownCar()!);
      },
    },
  ];
}

/** From inside the car: run somebody down in a straight line with a clear road to them. */
function runDown(s: Sim): Technique[] {
  const mine = s.ownCar();
  if (!mine || s.hero.cd.run_down || !s.hero.aboard || mine.car.hp / mine.car.maxHp <= 0.4) return [];
  return [
    {
      id: 'run_down',
      targets: 'enemy',
      range: [2, 5],
      los: true,
      value(s2, me, from, t) {
        const dx = t!.x - from.x;
        const dy = t!.y - from.y;
        if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
        const n = Math.max(Math.abs(dx), Math.abs(dy));
        for (let i = 1; i < n; i++) {
          const x = from.x + Math.sign(dx) * i;
          const y = from.y + Math.sign(dy) * i;
          if (terrainAt(s2.grid, x, y) !== 'floor' || s2.occupant({ x, y })) return null;
        }
        if (t!.npc?.tags.some((x) => x === 'boss' || x === 'dragon')) return null;
        return 3 + 12 * frac(s2.hero.ref.hp > 0 ? 40 + s2.w.hero.muscle * 3 : 0, t!.ref.hp);
      },
      run(s2, me, t) {
        me.cd.run_down = 3;
        s2.runDown(t!);
      },
    },
  ];
}

/** A foe with no gun and a strong arm: if the target is in a shut car, get the door open. */
function forceDoor(): Technique {
  return {
    id: 'force_door',
    targets: 'enemy',
    range: [1, 1],
    los: false,
    value(s2, me, from, t) {
      if (me.reach[1] > 1 || !t!.aboard || !s2.sheltered(t!)) return null;
      return 9 + (t!.kind === 'hero' ? 4 : 0);
    },
    run(s2, me, t) {
      s2.forceDoor(me, s2.carOf(t!)!);
    },
  };
}

// ------------------------------------------------------------------ leaving

function leave(): Technique {
  return {
    id: 'leave',
    targets: 'self',
    range: [0, 0],
    los: false,
    value(s2, me, from) {
      return me.fleeing && terrainAt(s2.grid, from.x, from.y) === 'exit' ? 100 : null;
    },
    run(s2, me) {
      s2.leave(me);
    },
  };
}

// ------------------------------------------------------------------ allies

function allyAttack(u: Unit): Technique {
  const base = u.assist?.dmg ?? Math.max(2, Math.round(u.power * 1.2));
  return {
    id: 'attack',
    targets: 'enemy',
    range: u.reach,
    los: u.reach[1] > 1,
    value(s2, me, from, t) {
      const p = s2.hitChance(me, t!, from);
      return strikeValue(p, base * 0.55, t!.ref.hp) * 0.9;
    },
    run(s2, me, t) {
      s2.allyStrike(me, t!, base);
    },
  };
}

// ------------------------------------------------------------------ the registry

export function techniquesFor(s: Sim, u: Unit): Technique[] {
  if (u.kind === 'hero') return [attack(s, u), ...throwing(s), ...ambush(s), ...flurry(s), ...shove(s), ...hack(s, u), ...intimidate(s), ...overwatch(s), ...getIn(s), ...driveOff(s), ...runDown(s), ...doctrineTechniques(s), leave()];
  if (u.kind === 'ally') return [allyAttack(u), ...hack(s, u)];
  return [attack(s, u), forceDoor(), leave()];
}
