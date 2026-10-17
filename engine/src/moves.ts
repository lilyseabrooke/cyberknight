import type { Ctx, Exit } from './types';
import { addHeat, arrive, clamp, fight, here, npcsAt, remember, spawnGroup } from './candidate';
import { hasInjury, gainXp } from './combat';
import { sneakBonus, tryTalkDown } from './extras';
import { hasImplantFlag, skillLevel, synergy, train } from './skills';
import { moveNpc } from './population';
import { cross } from './shortcut';

/** Resolve walking through an exit, including bouncers, locks, guards and jumps. */
export function moveThrough(c: Ctx, exit: Exit): void {
  const { w, rng } = c;
  const h = w.hero;
  const dest = w.locations[exit.to]!;
  const dark = !!w.flags.blackout;
  let to = exit.to;

  // Not a door: a way across the hex grid (a fence, a wall, a barricade, a duct, a building to run through).
  if (exit.via) {
    crossLink(c, exit);
    return;
  }

  if (exit.misroute && rng.chance(0.4)) {
    to = exit.misroute;
    arrive(c, to, 'misroute', { intended: dest.name });
    return;
  }

  switch (exit.gate) {
    case null:
      arrive(c, to, 'walk');
      return;

    case 'bouncer': {
      const guards = npcsAt(w, 'neon_pharaoh').filter((n) => n.tags.includes('security'));
      if (h.fame >= 5 && rng.chance(0.8)) {
        arrive(c, to, 'recognized');
      } else if (h.cash >= 40 && rng.chance(0.5)) {
        h.cash -= 40;
        arrive(c, to, 'paid');
      } else if (dark || rng.chance(0.2 + h.charm * 0.06)) {
        arrive(c, to, 'charmed');
      } else if (guards[0] && rng.chance(0.3 + (h.personality.weights.pride - 0.5) * 0.3)) {
        c.emit('gate', 'bad', { variant: 'bounced_mouthy', npc: guards[0].name });
        if (!tryTalkDown(c, [guards[0]])) fight(c, [guards[0]], { cause: 'mouthing off at the door', joiners: false, assault: true });
      } else {
        c.emit('gate', 'bad', { variant: 'turned_away', npc: guards[0]?.name ?? 'the bouncer' });
      }
      return;
    }

    case 'locked': {
      const madame = w.npcs.madame;
      if (madame?.alive && madame.affinity >= 15) {
        arrive(c, to, 'invited', { npc: madame.name });
        return;
      }
      const pick = 0.1 + h.hack * 0.03 + h.reflex * 0.02 + 0.055 * synergy(h, ['lockpicking', ['tinkering', 0.5], ['stat:reflex', 0.5]]);
      train(c, 'lockpicking', 1);
      if (rng.chance(pick)) {
        arrive(c, to, 'picked');
      } else if (rng.chance(0.4 + h.muscle * 0.03)) {
        for (const n of here(w)) if (n.faction === 'halo') n.affinity -= 6;
        addHeat(w, 'halo', 1);
        arrive(c, to, 'kicked');
        const tiny = w.npcs.tiny;
        if (tiny?.alive && tiny.locationId === 'halo_floor' && rng.chance(0.45)) {
          c.emit('gate', 'bad', { variant: 'tiny_heard', npc: tiny.name });
          moveNpc(w, tiny, h.locationId);
          fight(c, [tiny], { cause: 'breaking the backroom door', joiners: true });
        }
      } else {
        c.emit('gate', 'bad', { variant: 'jammed', hp: 0 });
        h.hp -= 3;
      }
      return;
    }

    case 'guarded': {
      const p = clamp(0.5 + h.reflex * 0.04 - dest.security * 0.05 + sneakBonus(w), 0.1, 0.9);
      if (rng.chance(p)) {
        train(c, 'sneak', 2);
        arrive(c, to, 'slipped', { place: dest.name });
        return;
      }
      const guards = [...npcsAt(w, dest.id), ...npcsAt(w, h.locationId)].filter((n) => n.tags.includes('security') && n.alive);
      c.emit('gate', 'bad', { variant: 'spotted', place: dest.name });
      addHeat(w, 'atlas', 2);
      if (guards.length) {
        const res = fight(c, guards.slice(0, 3), { cause: 'trespassing', joiners: false });
        if (res === 'win' && !w.over) arrive(c, to, 'fought_through');
      }
      return;
    }

    case 'jump': {
      const p = clamp(0.35 + h.reflex * 0.03 + 0.04 * synergy(h, ['athletics', ['stat:reflex', 0.5]]) + (hasImplantFlag(h, 'springs') ? 0.2 : 0) - h.drunk * 0.05, 0.1, 0.92);
      train(c, 'athletics', 1);
      if (rng.chance(p)) {
        arrive(c, to, 'stuck_landing');
        gainXp(c, 8);
      } else {
        h.hp -= 15;
        if (!hasInjury(w, 'broken_leg')) {
          h.injuries.push('broken_leg');
          c.emit('injury', 'bad', { injury: 'broken_leg' });
        }
        arrive(c, to, 'crashed');
        addHeat(w, 'club', 1);
        const guards = npcsAt(w, to).filter((n) => n.tags.includes('security'));
        if (guards.length && !w.over) {
          for (const g of guards) remember(g, 'saw Blackbird crash through the skylight');
          fight(c, guards.slice(0, 2), { cause: 'crashing the party', joiners: false });
        }
      }
      return;
    }
  }
}

/** Walk, vault, climb, crawl or break through to the neighbour. Most of the time she gets there. */
function crossLink(c: Ctx, exit: Exit): void {
  const { w } = c;
  const h = w.hero;
  const via = exit.via!;
  if (via === 'open') {
    arrive(c, exit.to, 'cutthrough');
    return;
  }
  const mode = h.vehicle ? (h.vehicle.body === 'bike' ? 'bike' : 'car') : 'foot';
  const r = cross(c, { mode, hero: true, car: h.vehicle ?? null, pace: h.vehicle?.pace ?? 4 }, { from: h.locationId, to: exit.to, via, ...(exit.over ? { over: exit.over } : {}), cost: 1 });
  const failed = /(_failed|_stuck|_spotted|_crash)$/.test(r.told) && !r.told.startsWith('through');
  if (failed) {
    // Stuck on this side of it; the cost is what it cost her.
    c.emit('go', 'bad', { variant: r.told, to: w.locations[exit.to]!.name, toId: exit.to, from: w.locations[h.locationId]!.name, first: false, hurt: r.hurt });
    return;
  }
  arrive(c, exit.to, r.told, { hurt: r.hurt });
}

export { spawnGroup };
export type { Ctx };
