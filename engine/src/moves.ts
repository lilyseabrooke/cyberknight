import type { Ctx, Exit } from './types';
import { addHeat, arrive, clamp, fight, here, npcsAt, remember, spawnGroup } from './candidate';
import { hasInjury, gainXp } from './combat';

/** Resolve walking through an exit, including bouncers, locks, guards and jumps. */
export function moveThrough(c: Ctx, exit: Exit): void {
  const { w, rng } = c;
  const h = w.hero;
  const dest = w.locations[exit.to]!;
  const dark = !!w.flags.blackout;
  let to = exit.to;

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
      if (h.cash >= 40 && rng.chance(0.5)) {
        h.cash -= 40;
        arrive(c, to, 'paid');
      } else if (dark || rng.chance(0.2 + h.charm * 0.06)) {
        arrive(c, to, 'charmed');
      } else if (guards[0] && rng.chance(0.3 + (h.personality.weights.pride - 0.5) * 0.3)) {
        c.emit('gate', 'bad', { variant: 'bounced_mouthy', npc: guards[0].name });
        fight(c, [guards[0]], { cause: 'mouthing off at the door', joiners: false });
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
      const pick = 0.12 + h.hack * 0.06 + h.reflex * 0.04;
      if (rng.chance(pick)) {
        arrive(c, to, 'picked');
      } else if (rng.chance(0.4 + h.muscle * 0.03)) {
        for (const n of here(w)) if (n.faction === 'halo') n.affinity -= 6;
        addHeat(w, 'halo', 1);
        arrive(c, to, 'kicked');
        const tiny = w.npcs.tiny;
        if (tiny?.alive && tiny.locationId === 'halo_floor' && rng.chance(0.45)) {
          c.emit('gate', 'bad', { variant: 'tiny_heard', npc: tiny.name });
          tiny.locationId = h.locationId;
          fight(c, [tiny], { cause: 'breaking the backroom door', joiners: true });
        }
      } else {
        c.emit('gate', 'bad', { variant: 'jammed', hp: 0 });
        h.hp -= 3;
      }
      return;
    }

    case 'guarded': {
      const p = clamp(0.5 + h.reflex * 0.04 - dest.security * 0.05 + (dark ? 0.2 : 0), 0.1, 0.9);
      if (rng.chance(p)) {
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
      const p = clamp(0.45 + h.reflex * 0.04 - h.drunk * 0.05, 0.1, 0.9);
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

export { spawnGroup };
export type { Ctx };
