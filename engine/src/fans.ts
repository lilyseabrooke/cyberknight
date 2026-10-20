import type { Ctx, Id, Npc, World } from './types';
import type { Candidate } from './candidate';
import { addHeat, here } from './combat';
import { routeTo } from './plans';
import { block, famed, streetOf } from './renown';
import { slip } from './stealth';
import { spawnGroup } from './candidate';
import { synergy } from './skills';
import { missionGrapevine } from './missions';
import { crowdData, moveCrowd, type Moved } from './crowd';

/**
 * Fans as a resource. Fans are counted on the places she won them (`Location.fans`); what matters to her is how many
 * there are around where she's standing: her block (the street and the streets next to it) and the places off them.
 *
 * - **Cover:** a neighbourhood that loves her is easy to vanish into (`fanCover`, read by stealth's `coverAt`). The
 *   flip side: once she's properly famous, a neighbourhood with no fans of hers is full of people who recognise her.
 * - **A couch:** somewhere to lie low, anywhere she has enough fans, once a night per block.
 * - **The grapevine:** fans tell her things: where the person she's after was last seen, a hideout off a street she
 *   hasn't walked.
 * - **The flash mob:** she calls them out, and it's an influence on a crowd (crowd.ts). Some of her fans turn up as people
 *   in the street, keen on her (they go back into the crowd when the night ends); then she asks the whole crowd in earshot for something (have her back, look the other
 *   way, deal with somebody, or whatever she fancies), and each of them weighs it as they would a one-to-one ask, with
 *   her guitar (and charm) for a voice and the occasion for an edge. The willing take it on as their own goal. Around
 *   that, for a while the place is a crowd chanting her name: cover for anything, a wall the police won't push through.
 *   Once a night per block, it costs some fans (they are fickle), and an unlawful assembly is heat. Scaled up, it's how a
 *   cordon comes down.
 */

/** Fans around a place: on her block's streets and the places directly off them. Cheap: a walk of a few dozen rooms. */
export function localFans(w: World, locId: Id): number {
  const loc = w.locations[locId];
  if (!loc) return 0;
  let n = 0;
  const seen = new Set<Id>();
  for (const sid of block(w, loc)) {
    const street = w.locations[sid];
    if (!street) continue;
    for (const id of [sid, ...street.exits.map((e) => e.to)]) {
      if (seen.has(id)) continue;
      seen.add(id);
      n += w.locations[id]?.fans ?? 0;
    }
  }
  if (!seen.has(locId)) n += loc.fans ?? 0;
  return n;
}

/** Fans enough to hide among, to sleep on a couch of, to hear from, to call out. */
export const FANS_FOR_COVER = 10;
export const FANS_FOR_COUCH = 15;
export const FANS_FOR_TIPS = 20;
export const FANS_FOR_MOB = 30;

/** How long a flash mob fills the street: world minutes. */
const MOB_MINUTES = 40;

/** A flash mob is filling this place right now. */
export const mobHere = (w: World, locId: Id): boolean => (w.counters[`mob_until:${locId}`] ?? -1) > w.clock;

/** Extra cover from the people around her: fans to hide among, a flash mob to vanish into. */
export function fanCover(w: World, locId: Id): number {
  if (mobHere(w, locId)) return 0.6;
  const fans = localFans(w, locId);
  return fans >= FANS_FOR_COVER ? Math.min(0.3, fans / 100) : 0;
}

/** How much harder she is to miss: famous, somewhere nobody is on her side. 1 is not at all. */
export function recognisable(w: World): number {
  if (localFans(w, w.hero.locationId) >= FANS_FOR_COVER) return 1;
  return 1 + 0.3 * famed(w.hero.fame, 80, 400);
}

/** A flash mob holds the police back: they won't wade into a few hundred people filming them. */
export const mobShields = (w: World): boolean => mobHere(w, w.hero.locationId);

const blockKey = (w: World, locId: Id): string => streetOf(w, w.locations[locId]!).id;

// ===================================================================== the couch

export function fanCouchCandidate(w: World, urge: number): Candidate | null {
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  if (!loc.outdoors || urge <= 0) return null;
  const key = `couch:${blockKey(w, loc.id)}`;
  if (w.counters[key] || localFans(w, loc.id) < FANS_FOR_COUCH) return null;
  return {
    key: 'lay_low:fan', drives: {}, bonus: 0.6 * urge, smart: 0.6 * urge,
    run: (c) => {
      w.counters[key] = 1;
      let dropped = 0;
      for (const f of ['npd', 'atlas'] as const) {
        const before = w.heat[f] ?? 0;
        w.heat[f] = Math.max(0, before - 2);
        dropped += before - w.heat[f]!;
      }
      if (h.drunk > 0) h.drunk--;
      c.emit('lay_low', dropped ? 'good' : 'mixed', { variant: 'fan', dropped: dropped > 0, level: w.heat.npd ?? 0, place: loc.name });
    },
  };
}

// ===================================================================== the grapevine

/** Once a beat, in a neighbourhood with fans: now and then one of them has something for her. */
export function grapevineTick(c: Ctx): void {
  const { w, rng } = c;
  const fans = localFans(w, w.hero.locationId);
  if (fans < FANS_FOR_TIPS || !rng.chance(Math.min(0.04, fans / 2500))) return;
  // Somebody she's after: where they were seen.
  const wanted = w.mind.goals
    .map((g) => (g.kind === 'kill' || g.kind === 'romance' ? g.npc : g.pursuit?.npc))
    .map((id) => (id ? w.npcs[id] : undefined))
    .filter((n): n is Npc => !!n && n.alive && w.mind.lastSeen[n.id] !== n.locationId && !!w.locations[n.locationId]);
  if (wanted.length) {
    const n = rng.pick(wanted);
    w.mind.lastSeen[n.id] = n.locationId;
    c.emit('grapevine', 'good', { variant: 'sighting', npc: n.name, place: w.locations[n.locationId]!.name });
    return;
  }
  // Somebody she ought to meet, and a story that comes with them.
  if (missionGrapevine(c)) return;
  // A door she doesn't know about yet.
  const leads = Object.values(w.locations).filter((l) => l.dungeon === l.id && l.gen && (w.locations[l.gen.parent]?.visits ?? 1) === 0);
  let best: { street: Id; name: string; dist: number } | null = null;
  for (const l of leads) {
    const r = routeTo(w, w.hero.locationId, l.gen!.parent);
    if (r && (!best || r.dist < best.dist)) best = { street: l.gen!.parent, name: w.locations[l.gen!.parent]!.name, dist: r.dist };
  }
  if (best) {
    // She hasn't walked it, but she knows what's on it now.
    w.locations[best.street]!.visits = 1;
    c.emit('grapevine', 'good', { variant: 'lead', place: best.name });
  }
}

// ===================================================================== the flash mob

export function flashMobCandidate(w: World, urge: number): Candidate | null {
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const key = `mob:${blockKey(w, loc.id)}`;
  if (w.counters[key] || mobHere(w, loc.id)) return null;
  const fans = localFans(w, loc.id);
  if (fans < FANS_FOR_MOB) return null;
  // A reason to call them: the police are coming, people here are onto her, or she has business here or next door.
  const onto = here(w).some((n) => n.hostile);
  const business = w.mind.goals.some((g) => g.loc === loc.id || loc.exits.some((e) => e.to === g.loc));
  const why = Math.max(urge * 0.6, onto ? 1.2 : 0, business ? 1 : 0);
  if (why <= 0) return null;
  return {
    key: 'flash_mob', drives: { pride: 0.6, curiosity: 0.2 }, bonus: why, risk: 0.2, intent: { place: loc.name },
    run: (c) => flashMob(c, fans),
  };
}

/** Kinds of people who turn up when she calls. */
const FAN_KINDS = ['patron', 'dancer', 'street_kid', 'drifter'];

/** Her voice to a flash mob is her guitar: she plays them the thing they came for, and asks. (A speech's voice is speaking.) */
const pull = (w: World): number => synergy(w.hero, ['guitar', ['stat:charm', 0.6]]);

/** Some of the fans she calls turn up as people on the street, and they're keen. The rest are the crowd around them. */
function fansArrive(c: Ctx, fans: number): Npc[] {
  const { w, rng } = c;
  const n = Math.max(2, Math.min(10, Math.round(Math.sqrt(fans))));
  const out: Npc[] = [];
  for (let i = 0; i < n; i++) {
    const [fan] = spawnGroup(c, FAN_KINDS[i % FAN_KINDS.length]!, 1);
    if (!fan) continue;
    fan.hostile = false;
    fan.affinity = Math.max(fan.affinity, 30 + rng.int(0, 25));
    if (!fan.tags.includes('fan')) fan.tags.push('fan');
    out.push(fan);
  }
  return out;
}

export function flashMob(c: Ctx, fans = localFans(c.w, c.w.hero.locationId)): Moved | null {
  const { w } = c;
  const loc = w.locations[w.hero.locationId]!;
  w.counters[`mob:${blockKey(w, loc.id)}`] = 1;
  w.counters[`mob_until:${loc.id}`] = w.clock + MOB_MINUTES;
  const turnout = Math.round(fans * 0.6);
  fansArrive(c, fans);
  // They are fickle: being called out costs some of them.
  for (const sid of block(w, loc)) {
    const street = w.locations[sid];
    if (!street) continue;
    for (const id of [sid, ...street.exits.map((e) => e.to)]) {
      const l = w.locations[id];
      if (l?.fans) l.fans *= 0.9;
    }
  }
  addHeat(w, 'npd', 1);
  const lost = slip(c);
  // Then she asks them for something. A crowd that came because she called is a keen one.
  const moved = moveCrowd(c, { depth: 1, stretch: 1.5, edge: 0.1 + Math.min(0.2, fans / 400), voice: pull(w), memory: 'answered Blackbird\'s call to a flash mob' });
  c.emit('flash_mob', 'good', { variant: moved?.count ? 'moved' : 'turnout', place: loc.name, amount: turnout, lost, ...crowdData(moved) });
  return moved;
}
