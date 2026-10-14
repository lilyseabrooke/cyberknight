import type { Candidate } from './candidate';
import type { Ctx, Id, Npc, World } from './types';
import { clamp } from './candidate';
import { fight, heroPower, npcsAt, relocate, remember } from './combat';
import { sneakBonus } from './extras';
import { hasBounty, knowsBounty } from './bounty';
import { hasGoal } from './mind';
import { isHunted } from './pursuit';
import { skillLevel } from './skills';
import { workingCameras } from './witness';

/**
 * Blackbird knows the police are a thing. She doesn't like to start a fight where it can be
 * seen. If she really wants someone, she tries to get them alone: talk them outside, or tail
 * them until they go somewhere quiet. Or she works out whether she can drop everybody in the
 * room before anyone can make a call. Nobody saw it, nobody calls it in.
 *
 * Everything here is judgement, not rules: witness.ts still decides what actually happens.
 */

const isPerson = (n: Npc): boolean => !n.tags.includes('robot') && !n.tags.includes('dragon') && !n.tags.includes('boss') && n.archetype !== 'puppy';

export interface Exposure {
  /** Possible witnesses (not counting the target). */
  people: Npc[];
  /** Chance somebody (or some camera) sees an attack here. */
  p: number;
  cams: number;
  drones: number;
}

/** How likely an attack at `locId` on `targets` is to be seen. Mirrors witness.ts. */
export function exposure(w: World, locId: Id, targets: Npc[]): Exposure {
  const h = w.hero;
  const around = npcsAt(w, locId).filter((n) => !targets.includes(n) && !h.companions.some((a) => a.npcId === n.id) && n.archetype !== 'puppy' && !n.hostile);
  const people = around.filter(isPerson);
  const drones = around.filter((n) => n.tags.includes('robot') && !n.tags.includes('dragon')).length;
  const cams = workingCameras(w, locId);
  const noticeP = clamp(0.8 - sneakBonus(w), 0.25, 0.97);
  const clear = Math.pow(1 - noticeP, Math.min(6, people.length));
  return { people, p: cams > 0 || drones > 0 ? 1 : 1 - clear, cams, drones };
}

/** How wary she is of the law. Competence and a cool head raise it; a hothead or a daredevil lowers it. Never zero. */
export function caution(w: World): number {
  const h = w.hero;
  const t = h.personality.traits;
  return clamp(0.8 + 0.6 * h.competence - 0.5 * (t.reckless - 0.5) - 0.3 * (t.impulsive - 0.5) - 0.3 * (t.temper - 0.5), 0.55, 1.5);
}

const police = (w: World): boolean => w.locations[w.hero.locationId]?.kind !== 'corp';

/** What the police would make of an attack on this person, as a share of the usual: wanted people are cheap to hit. */
export const lawShare = (w: World, target: Npc): number => (police(w) && knowsBounty(w, target.id) && hasBounty(target) ? 0.2 : 1);

/** A reluctance, subtracted from the score of picking a fight (or a pocket) in view of people. */
export function discretion(w: World, cand: Candidate): number {
  const [fam, id] = cand.key.split(':') as [string, string | undefined];
  if (fam !== 'challenge' && fam !== 'threaten' && fam !== 'pickpocket') return 0;
  const target = id ? w.npcs[id] : undefined;
  if (!target) return 0;
  const e = exposure(w, w.hero.locationId, [target]);
  // Pickpocketing only turns into a fight if she's caught.
  const scale = fam === 'pickpocket' ? 0.35 : 1;
  return 6 * e.p * lawShare(w, target) * caution(w) * scale;
}

// ------------------------------------------------------------------ taking out the whole room

/** Chance she can put down the target and everyone who'd see it before anyone gets a call out. 0 if she can't. */
export function sweepOdds(w: World, target: Npc): { odds: number; room: Npc[] } {
  const h = w.hero;
  const e = exposure(w, h.locationId, [target]);
  const room = [target, ...e.people];
  if (e.cams > 0 || e.drones > 0 || room.length < 2 || room.length > 5) return { odds: 0, room };
  if (room.some((n) => n.tags.includes('cop') || n.tags.includes('security') || n.tags.includes('owner'))) return { odds: 0, room };
  const hpFrac = h.hp / h.maxHp;
  if (hpFrac < 0.7) return { odds: 0, room };
  const power = room.reduce((a, n) => a + n.power, 0);
  const ratio = power / Math.max(1, heroPower(w) * hpFrac);
  return { odds: clamp(1.25 - ratio * 0.95 - room.length * 0.06, 0, 0.95), room };
}

/** She wants this one: a goal says so, or he has paper out on him, or there's bad blood. */
function wanted(w: World, n: Npc): boolean {
  return hasGoal(w, 'kill', n.id) || (hasBounty(n) && knowsBounty(w, n.id)) || n.affinity <= -25;
}

const mobile = (n: Npc): boolean => !n.tags.some((t) => ['staff', 'owner', 'security', 'fixer', 'doc', 'boss', 'robot', 'rumor'].includes(t));

/** Quietest place next door: low exposure, nothing weird about it. */
export function quietSpot(w: World, from: Id, target: Npc): { id: Id; p: number } | null {
  let best: { id: Id; p: number } | null = null;
  for (const e of w.locations[from]?.exits ?? []) {
    const dest = w.locations[e.to];
    if (!dest || e.hidden || e.gate || dest.kind === 'boss' || dest.kind === 'corp' || e.to === 'overpass') continue;
    const x = exposure(w, e.to, [target]);
    if (!best || x.p < best.p) best = { id: e.to, p: x.p };
  }
  return best;
}

export function discretionCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  for (const n of npcsAt(w, h.locationId)) {
    if (n.hostile || !isPerson(n) || !wanted(w, n)) continue;
    const here = exposure(w, h.locationId, [n]);

    // Everybody in the room, before anyone can pick up a phone.
    const { odds, room } = sweepOdds(w, n);
    if (odds >= 0.3) {
      out.push({
        key: `sweep:${n.id}`, drives: { bravery: 1.0, pride: 0.8 }, bonus: odds * 0.8 + (n.affinity < -10 ? 0.4 : 0),
        risk: (1 - odds) * 2.5,
        run: (c) => {
          c.emit('sweep', 'mixed', { npc: n.name, count: room.length - 1, odds: Math.round(odds * 100) });
          fight(c, room, { cause: `clearing the room to get at ${n.name}`, joiners: false, assault: true });
        },
      });
    }

    // Needs it quieter than this. Only worth the bother if people are watching.
    if (here.p < 0.35 || !(hasGoal(w, 'kill', n.id) || isHunted(w, n.id))) continue;
    const spot = quietSpot(w, h.locationId, n);
    if (!spot || spot.p > here.p - 0.15) continue;
    if (n.affinity > -35 && !n.tags.includes('staff') && !n.tags.includes('owner') && !n.tags.includes('security')) {
      out.push({
        key: `lure:${n.id}`, drives: { curiosity: 0.2, pride: 0.2 }, bonus: 0.3,
        run: (c) => lure(c, n, spot.id),
      });
    }
    if (mobile(n)) {
      out.push({
        key: `tail:${n.id}`, drives: { curiosity: 0.2 }, bonus: 0.2,
        run: (c) => tail(c, n, spot.id),
      });
    }
  }
  return out;
}

function lure(c: Ctx, n: Npc, to: Id): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.3 + h.charm * 0.03 + skillLevel(h, 'streetwise') * 0.02 + n.affinity / 150, 0.1, 0.8);
  const from = w.locations[h.locationId]!.name;
  if (!rng.chance(p)) {
    n.affinity -= 4;
    c.emit('lure', 'bad', { variant: 'fail', npc: n.name, place: from });
    return;
  }
  const dest = w.locations[to]!;
  relocate(w, to);
  n.locationId = to;
  remember(n, 'followed Blackbird somewhere quiet');
  c.emit('lure', 'mixed', { variant: 'ok', npc: n.name, place: dest.name, from });
}

function tail(c: Ctx, n: Npc, to: Id): void {
  const { w, rng } = c;
  const h = w.hero;
  const from = w.locations[h.locationId]!.name;
  // Lurking is slow. Sooner or later they wander off on their own.
  if (!rng.chance(0.4 + h.competence * 0.2)) {
    c.emit('tail', 'mixed', { variant: 'wait', npc: n.name, place: from });
    return;
  }
  const dest = w.locations[to]!;
  relocate(w, to);
  n.locationId = to;
  c.emit('tail', 'mixed', { variant: 'follow', npc: n.name, place: dest.name, from });
}
