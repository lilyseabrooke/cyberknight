import type { Ctx, Npc, World } from './types';
import { GANGS } from './content/archetypes';
import { addHeat, npcsAt, remember } from './combat';
import { sneakBonus } from './extras';
import { clamp } from './candidate';
import { hasBounty } from './bounty';
import { isFairGame } from './people';
import { nerve, traitOf } from './character';
import { regard } from './ties';

/**
 * Consequences for hitting people. If anyone sees it (a person, a drone, a security camera) the
 * police hear about it, and everyone who saw has an opinion. Most of the opinions are bad.
 * Nobody saw? Then it didn't happen. Heat only follows being seen.
 */

export type Reaction = 'intervene' | 'join' | 'call_cops' | 'flee' | 'film' | 'cheer' | 'shun';

export interface Witnessing {
  /** Bystanders who jump in on the victims' side. */
  joiners: Npc[];
  /** Whether anything or anyone saw it. */
  seen: boolean;
  /** Which faction took the heat (the police, or Atlas on its own premises). */
  heatFaction: string;
  /** Everyone she hit has NPD paper out on them, so the police have nothing to add. */
  warranted: boolean;
}

const isPerson = (n: Npc): boolean => !n.tags.includes('robot') && !n.tags.includes('dragon') && !n.tags.includes('boss') && n.archetype !== 'puppy';

/** Working cameras here. A blackout takes them down with everything else; an Override takes down a few. */
export const workingCameras = (w: World, locId: string): number => {
  if (w.flags.blackout) return 0;
  const loc = w.locations[locId];
  if (!loc) return 0;
  const off = loc.camsDown && w.beat < loc.camsDown.until ? loc.camsDown.n : 0;
  return Math.max(0, loc.cameras - off);
};

/** What a bystander does when they watch Blackbird start something. */
export function reactionWeights(w: World, n: Npc, victim: Npc): Record<Reaction, number> {
  const rw: Record<Reaction, number> = { intervene: 0, join: 0, call_cops: 2, flee: 3, film: 1, cheer: 0.5, shun: 2 };
  const tags = n.tags;
  const crooked = tags.includes('dealer') || tags.includes('fixer') || tags.includes('doc') || tags.includes('hacker');
  if (tags.includes('cop')) return { ...rw, intervene: 100 };
  if (tags.includes('security') || tags.includes('owner') || (tags.includes('staff') && tags.includes('strong'))) {
    rw.intervene = n.affinity < 30 ? 5 : 1;
    rw.flee = 0.5;
  }
  if (n.faction && n.faction === victim.faction && !tags.includes('staff')) {
    rw.join = 5;
    rw.call_cops = 0;
  }
  if (tags.includes('ganger') && n.faction !== victim.faction) {
    rw.cheer += 3; // a rival's loss is entertainment
    rw.call_cops = 0;
  }
  if (tags.includes('kid')) {
    rw.film = 4;
    rw.call_cops = 0.5;
  }
  if (tags.includes('rowdy')) {
    rw.cheer += 2.5;
    rw.join += n.affinity < -5 ? 1.5 : 0.5;
    rw.flee = 1;
  }
  if (crooked) {
    rw.call_cops = 0;
    rw.flee += 2;
  }
  if (n.affinity >= 15) {
    rw.cheer += 3;
    rw.shun = 0.5;
    rw.call_cops *= 0.5;
  } else if (n.affinity <= -15) {
    rw.call_cops += 3;
    rw.shun += 1;
  }
  if (isFairGame(n) && n.affinity >= 10) rw.cheer += 2;
  rw.cheer += Math.min(2, w.hero.fame * 0.15);
  // Who they are: the brave step up and the timid run; the kind don't enjoy it; friends of the victim wade in, rivals are delighted.
  const nv = nerve(w, n);
  rw.flee *= clamp(1.7 - 1.4 * nv, 0.3, 1.7);
  if (rw.intervene > 0) rw.intervene *= 0.5 + nv;
  if (rw.join > 0) rw.join *= 0.5 + nv;
  const kindness = traitOf(w, n, 'kindness');
  rw.cheer *= clamp(1.4 - 0.8 * kindness, 0.5, 1.4);
  rw.shun *= 0.7 + 0.6 * kindness;
  const feel = regard(w, n.id, victim.id);
  if (feel >= 30) {
    rw.join += 4 * (feel / 100) * (0.5 + nv);
    rw.call_cops += 1;
    rw.flee *= 0.5;
    rw.cheer = 0;
  } else if (feel <= -30) {
    rw.cheer += 3;
  }
  return rw;
}

export function pickReaction(c: Ctx, n: Npc, victim: Npc): Reaction {
  const rw = reactionWeights(c.w, n, victim);
  return c.rng.weighted(Object.keys(rw) as Reaction[], (r) => rw[r]);
}

/**
 * Called at the start of a fight she started. Works out who saw, applies heat, lets the crowd
 * react, and returns anyone who piles in against her. `gun` means shots will be fired: louder.
 */
export function witnessAssault(c: Ctx, foes: Npc[], opts: { noise: number }): Witnessing {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const victims = foes.filter(isPerson);
  const heatFaction = loc.kind === 'corp' ? 'atlas' : 'npd';
  // A bounty is the NPD's; it doesn't cover Atlas's own premises.
  const warranted = heatFaction === 'npd' && victims.length > 0 && victims.every(hasBounty);
  const none: Witnessing = { joiners: [], seen: false, heatFaction, warranted };
  if (!victims.length) return none;
  const victim = victims[0]!;

  // Who is here to see it
  const cams = workingCameras(w, loc.id);
  const bystanders = npcsAt(w, loc.id).filter(
    (n) => !foes.includes(n) && !h.companions.some((a) => a.npcId === n.id) && n.archetype !== 'puppy' && !n.hostile,
  );
  const drones = bystanders.filter((n) => n.tags.includes('robot') && !n.tags.includes('dragon'));
  const loud = opts.noise >= 0.6;
  const noticeP = clamp(0.8 - sneakBonus(w) + (opts.noise - 0.5) * 0.3, 0.2, 0.97);
  const seenBy = bystanders.filter((n) => isPerson(n) && rng.chance(noticeP)).slice(0, 6);
  const camSees = cams > 0;
  const droneSees = drones.length > 0;

  if (!camSees && !seenBy.length && !droneSees) {
    c.emit('crime_seen', 'good', { variant: 'none', place: loc.name });
    return none;
  }

  w.counters.crimes_seen = (w.counters.crimes_seen ?? 0) + 1;
  const variant = (camSees || droneSees) && seenBy.length ? 'both' : camSees || droneSees ? 'camera' : 'people';
  c.emit('crime_seen', 'bad', {
    variant,
    place: loc.name,
    cams,
    witnesses: seenBy.length,
    drone: droneSees ? drones[0]!.name : '',
    victim: victim.name,
    gun: loud,
  });

  // Reactions
  const joiners: Npc[] = [];
  let calls = 0;
  let copSaw = false;
  let logged = 0;
  for (const n of seenBy) {
    const reaction = pickReaction(c, n, victim);
    let lineVariant: string = reaction;
    switch (reaction) {
      case 'intervene':
      case 'join':
        if (joiners.length >= 3) {
          lineVariant = 'shun';
          n.affinity -= 10;
          break;
        }
        n.hostile = true;
        n.affinity -= 20;
        joiners.push(n);
        if (n.tags.includes('cop')) copSaw = true;
        break;
      case 'call_cops':
        if (calls < 2) calls++;
        n.affinity -= 10;
        break;
      case 'flee':
        n.downUntil = w.beat + rng.int(6, 14);
        n.affinity -= 4;
        break;
      case 'film': {
        h.fame += 1;
        n.affinity -= 2;
        if (rng.chance(0.4)) calls++;
        break;
      }
      case 'cheer':
        h.fame += 1;
        n.affinity += 6;
        break;
      case 'shun':
        n.affinity -= 12;
        break;
    }
    remember(n, `saw Blackbird attack ${victim.name}`);
    // The victim's crew hears about it, wherever they are.
    if (reaction !== 'cheer' && n.faction && n.faction === victim.faction) addHeat(w, n.faction, 1);
    if (logged < 3) {
      logged++;
      c.emit('bystander', reaction === 'cheer' || reaction === 'film' ? 'mixed' : 'bad', {
        variant: lineVariant,
        npc: n.name,
        role: n.role,
        victim: victim.name,
        gang: n.faction && GANGS[n.faction] ? GANGS[n.faction]! : '',
      });
    }
  }
  if (seenBy.length > logged) c.emit('bystander', 'mixed', { variant: 'crowd', count: seenBy.length - logged });

  // Heat. Gunfire is loud, crowds and cameras make it stick, a cop in the room makes it official.
  const fromWitnesses = seenBy.length ? 1 + (seenBy.length >= 3 ? 1 : 0) : 0;
  const fromCameras = camSees || droneSees ? 1 + (cams >= 3 ? 1 : 0) : 0;
  const gain = Math.min(4, Math.max(fromWitnesses, fromCameras) + (loud ? 1 : 0) + (copSaw ? 1 : 0) + calls);
  if (warranted) {
    // Wanted people are the police's problem, not hers. Everyone else still saw what they saw.
    c.emit('bounty_hit', 'good', { victim: victim.name, amount: victim.bounty!.amount, witnesses: seenBy.length });
  } else {
    addHeat(w, heatFaction, gain);
  }
  // A drone or a corporate camera answers to Atlas, wherever it hangs.
  if (heatFaction !== 'atlas' && droneSees) addHeat(w, 'atlas', 1);
  if (!warranted) {
    c.emit('heat_up', 'bad', {
      variant: heatFaction,
      gain,
      level: w.heat[heatFaction] ?? 0,
      source: camSees && seenBy.length ? 'both' : camSees || droneSees ? 'camera' : 'people',
      calls,
    });
  }
  return { joiners, seen: true, heatFaction, warranted };
}
