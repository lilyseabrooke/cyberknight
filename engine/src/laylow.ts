import { patrolPullsUp } from './driveby';
import { policeChase } from './chase';
import type { Ctx, Id, Npc, World } from './types';
import { addHeat, fight, here, remember } from './combat';
import { clamp, spawnGroup, type Candidate } from './candidate';
import { skillLevel, train } from './skills';
import { isBadGuy } from './traits';
import { routeTo } from './plans';
import { scoutSaves } from './extras';
import { actionMinutes } from './clock';
import { talkDown } from './speaking';

/**
 * Heat, and what she does about it. Low heat only sends drones, which a competent hero can swat;
 * the officers come when it gets serious. Whatever the level, the sensible answer is the same:
 * get out of sight and let it blow over. She can also grease a palm, ask a fixer to lose a report,
 * or pin it on someone else. None of it has a cooldown. Bribes get dearer the more she buys, the
 * fixer wants cash, and there are only so many people to frame.
 */

// ===================================================================== how hot

/** The heat she's worried about: the police, or Atlas at a slight discount. */
export const heatLevel = (w: World): number => Math.max(w.heat.npd ?? 0, (w.heat.atlas ?? 0) * 0.8);

/**
 * How badly she wants to get out of the spotlight. Climbs with heat (1 -> 0.6, 3 -> 2.4, 5 -> 5.3, 8 -> 10),
 * is shrugged off by the reckless and by the drunk, who think nobody is looking.
 */
export function heatUrge(w: World): number {
  const h = w.hero;
  const L = heatLevel(w);
  if (L <= 0) return 0;
  const t = h.personality.traits;
  const cool = clamp(1 - 0.9 * (t.reckless - 0.5) - 0.5 * (t.thrill - 0.5), 0.4, 1.5);
  const sober = 1 - 0.5 * clamp(h.drunk / 5, 0, 1);
  return 0.6 * Math.pow(L, 1.35) * cool * sober;
}

// ===================================================================== somewhere to hide

/** Out of the way, indoors, and not somewhere the staff will throw her out of. */
const HIDEOUTS = new Set<Id>(['halo_restroom', 'halo_arcade', 'club_maintenance']);
export const isHideout = (w: World, id: Id): boolean => HIDEOUTS.has(id) || w.locations[id]?.kind === 'home';

/** Steps from `from` to the nearest hideout (0 if she's in one), or a big number if nothing is reachable. */
export function hideoutDist(w: World, from: Id): number {
  if (isHideout(w, from)) return 0;
  let best = 9;
  for (const id of HIDEOUTS) {
    if (!w.locations[id]) continue;
    const r = routeTo(w, from, id);
    if (r && r.dist < best) best = r.dist;
  }
  return best;
}

const CRIMES = new Set([
  'challenge', 'sweep', 'threaten', 'join_brawl', 'pickpocket', 'graffiti', 'rob_till', 'till', 'safe', 'vault', 'crates', 'steal_guitar',
  'steal_puppy', 'shoplift_paint', 'rob_paint_shop', 'threaten_clerk', 'billboard', 'mix_molotov', 'engage_flight', 'challenge_dragon', 'refuse_tithe', 'stand_ground',
  'hijack', 'make_move', 'karaoke', 'dj_set', 'gig', 'busk', 'laser_tag', 'raid_loot', 'raid_ambush',
  'reel_in', 'rod_lift', 'rod_bait',
]);

/** Added to every candidate's score. Pulls her towards cover, keeps her there, and off the crime. */
export function heatBias(w: World, cand: { key: string }): number {
  const u = heatUrge(w);
  if (u <= 0.2) return 0;
  const [fam, id] = cand.key.split(':') as [string, string | undefined];
  if (fam === 'go' && id) {
    const here0 = hideoutDist(w, w.hero.locationId);
    const there = hideoutDist(w, id);
    if (here0 === 0) return there > 0 ? -0.35 * u : 0;
    return 0.45 * u * (here0 - there);
  }
  if (CRIMES.has(fam)) return -0.3 * u;
  return 0;
}

/**
 * The Rusty Halo remembers. While its heat is up (she's robbed it, hit its people, kicked down its doors) she gives the
 * main room a wide berth, and if she's in it she'd rather be anywhere else. Heat fades on its own; see `upkeep`.
 */
export function haloShun(w: World, cand: { key: string }): number {
  const heat = w.heat.halo ?? 0;
  if (heat < 4 || !cand.key.startsWith('go:')) return 0;
  const over = Math.min(4, heat - 3);
  if (cand.key === 'go:halo_floor') return -0.9 * over;
  return w.hero.locationId === 'halo_floor' ? 0.6 * over : 0;
}

// ===================================================================== the police response

/**
 * Called when she's out in the open. Low heat is drones (stun nets; annoying). Officers need real
 * heat, and a sergeant needs a lot. Indoors she's out of reach.
 */
export function npdResponse(c: Ctx): boolean {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId]!;
  const npd = w.heat.npd ?? 0;
  if (!loc.outdoors || npd < 1) return false;
  const officers = npd >= 4;
  if (!rng.chance(officers ? 0.09 + npd * 0.03 : 0.05 + npd * 0.04)) return false;
  if (scoutSaves(c)) return true;
  const squad = officers ? spawnGroup(c, 'npd_officer', npd >= 6 ? 3 : 2) : spawnGroup(c, 'npd_drone', npd >= 3 ? 2 : 1);
  if (npd >= 8) squad.push(...spawnGroup(c, 'npd_sergeant', 1));
  if (officers && npd < 8 && rng.chance(0.5)) squad.push(...spawnGroup(c, 'npd_drone', 1));
  // In a car, the police come after her in theirs.
  if (officers && w.hero.vehicle && w.hero.vehicle.hp > 0 && rng.chance(0.7)) {
    policeChase(c, 'ambush', squad);
    return true;
  }
  // On foot on a street, a patrol car may be what pulls up.
  if (officers && patrolPullsUp(c, squad)) return true;
  c.emit('ambush', 'bad', { variant: officers ? 'npd' : 'npd_drone', count: squad.length, heat: npd });
  if (!talkDown(c, squad)) fight(c, squad, { cause: officers ? 'an NPD ambush' : 'an NPD drone sweep', joiners: false });
  return true;
}

// ===================================================================== what she can do about it

const bribesMade = (w: World): number => w.counters.bribes ?? 0;
/** Cops learn her rate: every payoff makes the next one dearer. */
const bribeCost = (w: World, npd: number): number => Math.round((30 + 28 * npd) * (1 + 0.3 * bribesMade(w)));
const fixCost = (w: World, npd: number): number => Math.round((70 + 45 * npd) * (1 + 0.15 * bribesMade(w)));

const FRAMEABLE = (n: Npc): boolean =>
  n.alive && !n.hostile && n.downUntil <= 0 && !n.tags.some((t) => ['cop', 'robot', 'dragon', 'boss', 'security'].includes(t)) && n.archetype !== 'puppy' && !n.id.startsWith('tmp_');

export function laylowCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const u = heatUrge(w);
  if (u <= 0) return out;
  const loc = w.locations[h.locationId]!;
  const npd = w.heat.npd ?? 0;
  const crowd = here(w);

  // Lie low. The safe approach: do nothing, somewhere nobody is looking.
  if (isHideout(w, loc.id) && !crowd.some((n) => n.tags.includes('cop') && n.hostile)) {
    out.push({
      key: 'lay_low:here', drives: {}, bonus: 0.5 * u, smart: 0.5 * u,
      run: (c) => {
        const { rng } = c;
        const p = clamp(0.4 + skillLevel(h, 'sneak') * 0.04 + (w.flags.blackout ? 0.2 : 0), 0.3, 0.85);
        let dropped = '';
        // Heat cools with the time she spends out of sight: a chance per hour of the world clock the lying low takes.
        const hours = Math.max(1, Math.round(actionMinutes('lay_low') / 60));
        for (let i = 0; i < hours; i++) {
          for (const f of ['npd', 'atlas'] as const) {
            if ((w.heat[f] ?? 0) > 0 && rng.chance(p)) {
              w.heat[f] = w.heat[f]! - 1;
              dropped = dropped || f;
            }
          }
        }
        if (h.drunk > 0 && rng.chance(0.25)) h.drunk--;
        train(c, 'sneak', 1);
        c.emit('lay_low', dropped ? 'good' : 'mixed', {
          variant: loc.kind === 'home' ? 'home' : loc.id === 'club_maintenance' ? 'crawlspace' : loc.id === 'halo_arcade' ? 'arcade' : 'restroom',
          dropped: !!dropped,
          level: w.heat.npd ?? 0,
        });
      },
    });
  }

  // Buy a cop. Only on the street where one can be found; dearer each time; and she won't hand over the whole stash.
  if (npd >= 2 && ['street_main', 'halo_alley'].includes(loc.id)) {
    const cost = bribeCost(w, npd);
    if (h.cash >= cost) {
      const affordable = cost <= h.cash * 0.6 ? 1 : 0.4;
      out.push({
        key: 'bribe_cop:street', drives: {}, bonus: 0.55 * u * affordable, smart: 0.3 * u * affordable, risk: 0.5,
        run: (c) => bribeCop(c, cost),
      });
    }
  }

  // Ask Madame Zero to make a report disappear.
  const madame = w.npcs.madame;
  if (npd >= 2 && madame?.alive && madame.locationId === h.locationId && !madame.hostile && madame.downUntil <= 0) {
    const cost = fixCost(w, npd);
    if (h.cash >= cost) {
      const affordable = cost <= h.cash * 0.7 ? 1 : 0.4;
      out.push({
        key: 'fix_record:madame', drives: {}, bonus: 0.5 * u * affordable, smart: 0.4 * u * affordable,
        run: (c) => {
          const { rng } = c;
          h.cash -= cost;
          w.counters.bribes = bribesMade(w) + 1;
          const drop = rng.int(3, 5);
          w.heat.npd = Math.max(0, npd - drop);
          madame.affinity += 2;
          train(c, 'streetwise', 2);
          c.emit('fix_record', 'good', { variant: 'fix', npc: madame.name, cost, drop, level: w.heat.npd });
        },
      });
    }
  }

  // Pin it on somebody else. Prefers someone who has it coming, and gets through the supply of people she can do it to.
  if (npd >= 2) {
    for (const n of crowd.filter(FRAMEABLE)) {
      const bad = isBadGuy(n) || !!n.bounty;
      const friend = n.affinity >= 15;
      out.push({
        key: `frame:${n.id}`, drives: {}, bonus: 0.25 * u + (bad ? 0.5 : 0) - (friend ? 1.2 : 0), smart: 0.15 * u, risk: 0.3,
        run: (c) => frame(c, n, bad),
      });
    }
  }
  return out;
}

function bribeCop(c: Ctx, cost: number): void {
  const { w, rng } = c;
  const h = w.hero;
  const npd = w.heat.npd ?? 0;
  const p = clamp(0.4 + h.charm * 0.012 + skillLevel(h, 'grifting') * 0.04 + skillLevel(h, 'streetwise') * 0.03 + skillLevel(h, 'haggling') * 0.02 - h.drunk * 0.02, 0.15, 0.88);
  if (rng.chance(p)) {
    h.cash -= cost;
    w.counters.bribes = bribesMade(w) + 1;
    const drop = rng.int(2, 3);
    w.heat.npd = Math.max(0, npd - drop);
    train(c, 'grifting', 2);
    train(c, 'streetwise', 1);
    c.emit('bribe_cop', 'good', { variant: 'paid', cost, drop, level: w.heat.npd });
    return;
  }
  // Wrong cop. Bribery is a crime, and he's not corrupt, only expensive.
  addHeat(w, 'npd', 1);
  train(c, 'grifting', 1);
  if (rng.chance(0.3)) {
    const [cop] = spawnGroup(c, 'npd_officer', 1);
    c.emit('bribe_cop', 'bad', { variant: 'refused_fight', cost });
    fight(c, [cop!], { cause: 'a bribe gone wrong', joiners: false });
  } else {
    c.emit('bribe_cop', 'bad', { variant: 'refused', cost });
  }
}

function frame(c: Ctx, n: Npc, bad: boolean): void {
  const { w, rng } = c;
  const h = w.hero;
  const framed = w.counters.frames ?? 0;
  const p = clamp(0.22 + skillLevel(h, 'grifting') * 0.05 + skillLevel(h, 'sleight') * 0.03 + h.int * 0.012 - framed * 0.08 - h.drunk * 0.03, 0.1, 0.85);
  remember(n, 'was fingered by Blackbird for something they did not do');
  if (rng.chance(p)) {
    w.counters.frames = framed + 1;
    const drop = bad ? rng.int(1, 3) : rng.int(1, 2);
    w.heat.npd = Math.max(0, (w.heat.npd ?? 0) - drop);
    n.downUntil = w.clock + 210;
    n.affinity -= 30;
    train(c, 'grifting', 3);
    train(c, 'sleight', 1);
    c.emit('frame', 'good', { variant: bad ? 'deserved' : 'innocent', npc: n.name, role: n.role, drop, level: w.heat.npd });
    return;
  }
  addHeat(w, 'npd', 1);
  n.affinity -= 25;
  train(c, 'grifting', 1);
  if (rng.chance(0.35)) {
    c.emit('frame', 'bad', { variant: 'fight', npc: n.name });
    fight(c, [n], { cause: 'a frame-up that went sideways', joiners: false });
  } else {
    c.emit('frame', 'bad', { variant: 'botched', npc: n.name });
  }
}
