import type { Booking, Ctx, Location, Npc, World } from './types';
import type { Candidate } from './candidate';
import { gainXp, here } from './combat';
import { npcsAt } from './population';
import { odds, synergy, train } from './skills';
import { SKILLS, type SkillId } from './content/skills';
import { expectation, streetOf } from './renown';
import { fameFrom, prestige } from './stage';
import { startBookingGoal } from './goals';
import { museAtBooking } from './muse';
import { makeItem } from './content/items';
import { startShow } from './musescene';
import { afterBooking, bigNight, residencyNight } from './band';

/**
 * Bookings: a night somebody wants her to play somewhere.
 *
 * They come to her once she's famous for a performing skill (`legacy.renown`), and they live on the legacy, so they
 * wait for her through a death: a fresh Blackbird can wake up in the lab with a club date tonight and three chords.
 *
 * - A **gig** is a stage at a bar or club. It pays, and it's a crowd that came for the name.
 * - A **private** booking is the entertainment: a room behind a bouncer, a lock or a guard, a VIP floor, a corp suite.
 *   On the night the door opens for her, and once the set's over she's inside, past the door, with the run of the place.
 *
 * Missing one costs fans where she was meant to play, a little fame, and whoever booked her is not pleased.
 */

/** The skills she can be booked for. */
export const BOOKABLE = ['guitar', 'vocals', 'djing', 'beatbox'] as const;
/** The act family for a booked set of this skill (see ACT_SKILL). */
export const bookedAct = (skill: string): string => `booked_${skill}`;

const MAX_OPEN = 3;
/** The level a crowd has to expect of her before bars and clubs book her: a real player, near the top of the starting district. */
export const GIG_LEVEL = 12;
/** And before somebody wants her for a private function: a professional, the kind of name that gets past a cordon. */
export const PRIVATE_LEVEL = 25;
/** The underground books lower: a scene wants somebody Muse is cross with more than somebody famous. */
export const SECRET_LEVEL = 8;

const open = (w: World): Booking[] => (w.legacy.bookings ??= []);

/** Tonight's booking at this place, if she has one she hasn't played yet. */
export const bookedTonight = (w: World, loc: string): Booking | undefined =>
  w.legacy.bookings?.find((b) => b.loc === loc && b.night === w.legacy.runs && !b.played);

/** Any booking at this place she still has to play (tonight's or a later one). */
export const bookingAt = (w: World, loc: string): Booking | undefined => w.legacy.bookings?.find((b) => b.loc === loc && b.night >= w.legacy.runs);

/** The skill she's best known for, among the ones people book. */
function bestKnown(w: World): string | null {
  let best: string | null = null;
  for (const s of BOOKABLE) if (expectation(w, s) > (best ? expectation(w, best) : 0)) best = s;
  return best;
}

const DUNGEONISH = new Set(['outpost', 'hideout', 'chamber', 'spot']);

/** Somewhere she couldn't walk into: behind a gated door, or a private floor. Never a dungeon (those are raided, not played). */
export function privateRooms(w: World): Location[] {
  const out = new Map<string, Location>();
  for (const loc of Object.values(w.locations)) {
    for (const e of loc.exits) {
      const to = w.locations[e.to];
      if (to && (e.gate === 'bouncer' || e.gate === 'locked' || e.gate === 'guarded')) out.set(to.id, to);
    }
    if (loc.gen && ['vip', 'corp', 'backroom'].includes(loc.gen.role)) out.set(loc.id, loc);
  }
  return [...out.values()].filter((l) => !l.dungeon && !w.dungeons[l.id] && !DUNGEONISH.has(l.gen?.role ?? '') && !l.sealed);
}

/** Somewhere a secret show could happen: a cellar, a back unit, the Halo's basement. Never a dungeon. */
export function undergroundRooms(w: World): Location[] {
  return Object.values(w.locations).filter((l) => (l.id === 'halo_arcade' || (l.gen && ['cellar', 'unit'].includes(l.gen.role))) && !l.dungeon && !w.dungeons[l.id] && !l.sealed);
}

/** Bars and clubs she's been to. */
// (An arena she has been to can book her too, and pays like one: see stage.ts `prestige`.)
const stages = (w: World): Location[] => Object.values(w.locations).filter((l) => (l.kind === 'bar' || l.kind === 'club' || l.kind === 'arena') && l.visits > 0 && !l.sealed);

const hostAt = (w: World, loc: Location): Npc | undefined => {
  const there = npcsAt(w, loc.id).filter((n) => n.alive && !n.hostile && !n.ephemeral);
  return there.find((n) => n.tags.includes('owner')) ?? there.sort((a, b) => b.level - a.level)[0];
};

function when(w: World, night: number): string {
  const d = night - w.legacy.runs;
  return d === 0 ? 'tonight' : d === 1 ? 'tomorrow night' : `in ${d} nights`;
}

/** Someone wants her to play. */
export function offerBooking(c: Ctx, skill: string, kind: Booking['kind']): Booking | null {
  const { w, rng } = c;
  const places = kind === 'private' ? privateRooms(w) : kind === 'secret' ? undergroundRooms(w) : stages(w);
  const taken = new Set(open(w).map((b) => b.loc));
  const free = places.filter((l) => !taken.has(l.id));
  if (!free.length) return null;
  const loc = kind === 'gig' ? rng.weighted(free, (l) => prestige(l)) : rng.pick(free);
  const exp = expectation(w, skill);
  const night = w.legacy.runs + (rng.chance(0.4) ? 0 : rng.int(1, 3));
  const host = hostAt(w, loc);
  const fee = kind === 'duet' ? 300 + 20 * exp : kind === 'private' ? 80 + 15 * exp + rng.int(0, 40) : kind === 'secret' ? 15 + 3 * exp + rng.int(0, 15) : (20 + 5 * exp) * prestige(loc) + rng.int(0, 20);
  const pay = Math.round(fee * (w.legacy.muse?.signed ? 1.5 : 1));
  const b: Booking = { id: `bk${w.legacy.runs}.${w.beat}.${loc.id}`, loc: loc.id, night, skill, kind, pay, ...(host ? { host: host.id } : {}) };
  open(w).push(b);
  c.emit('booking', 'good', {
    variant: `offer_${kind}`, place: loc.name, when: when(w, night), amount: pay, skill: SKILLS[skill as SkillId]?.label ?? skill, npc: host?.name ?? '',
  });
  return b;
}

/** Once a beat: bookings missed, tonight's remembered, new ones offered. */
export function tickBookings(c: Ctx): void {
  const { w, rng } = c;
  const list = w.legacy.bookings;
  if (list?.length) {
    const night = w.legacy.runs;
    for (const b of [...list]) {
      if (b.night >= night) continue;
      if (!b.played) missed(c, b);
      list.splice(list.indexOf(b), 1);
    }
    for (const b of list) {
      if (b.night !== night || b.played) continue;
      const key = `booking_seen_${b.id}`;
      if (!w.counters[key]) {
        w.counters[key] = 1;
        c.emit('booking', 'mixed', { variant: 'tonight', place: w.locations[b.loc]?.name ?? 'somewhere', skill: SKILLS[b.skill as SkillId]?.label ?? b.skill, amount: b.pay, level: Math.round(expectation(w, b.skill)) });
      }
      // The duet: LUMINA is there for it.
      if (b.kind === 'duet' && !w.mind.museShow && w.locations[b.loc]) startShow(c, w.locations[b.loc]!, true);
      if ((w.beat % 10 === 0 || w.counters[key] === 1) && !w.mind.goals.some((g) => g.kind === 'booking' && g.loc === b.loc)) {
        w.counters[key] = 2;
        startBookingGoal(c, b, w.locations[b.loc]?.name ?? 'somewhere');
      }
    }
  }
  // A residency: tonight's slot, every night until it runs out (band.ts).
  const res = residencyNight(w);
  if (res) {
    open(w).push(res);
    c.emit('booking', 'mixed', { variant: 'tonight', place: w.locations[res.loc]?.name ?? 'somewhere', skill: SKILLS[res.skill as SkillId]?.label ?? res.skill, amount: res.pay, level: Math.round(expectation(w, res.skill)) });
  }
  // New offers, once she's somebody. Nothing is drawn for a nobody, so nights without renown play as they always did.
  const skill = bestKnown(w);
  if (!skill) return;
  const exp = expectation(w, skill);
  // Once Muse has noticed her (and she hasn't signed), there's a scene: secret shows, for less of a name.
  const scene = !!w.legacy.muse?.lettered && !w.legacy.muse.signed;
  if (exp < (scene ? SECRET_LEVEL : GIG_LEVEL) || (list?.filter((b) => !b.played).length ?? 0) >= MAX_OPEN) return;
  // Signed to Muse, the bookings come to her: more of them, and better paid.
  const muse = w.legacy.muse?.signed ? 2 : 1;
  if (!rng.chance(0.003 * muse * Math.min(4, exp / GIG_LEVEL))) return;
  // Signed, page thirty: a night on stage with LUMINA.
  const duet = !!w.legacy.muse?.signed && !w.legacy.muse.lumina?.free && exp >= GIG_LEVEL && !list?.some((b) => b.kind === 'duet') && rng.chance(0.3);
  const kind = duet ? 'duet' : exp < GIG_LEVEL || (scene && rng.chance(0.4)) ? 'secret' : exp >= PRIVATE_LEVEL && rng.chance(0.4) ? 'private' : 'gig';
  offerBooking(c, skill, kind);
}

function missed(c: Ctx, b: Booking): void {
  const { w } = c;
  const loc = w.locations[b.loc];
  if (loc?.fans) loc.fans *= 0.6;
  const cost = Math.min(w.hero.fame, 2 + 0.3 * expectation(w, b.skill));
  w.hero.fame -= cost;
  const host = b.host ? w.npcs[b.host] : undefined;
  if (host?.alive) host.affinity -= 15;
  c.emit('booking', 'bad', { variant: 'missed', place: loc?.name ?? 'somewhere', fame: Math.round(cost * 10) / 10, npc: host?.alive ? host.name : '' });
}

export function bookingCandidates(w: World): Candidate[] {
  const b = bookedTonight(w, w.hero.locationId);
  if (!b) return [];
  return [{ key: `${bookedAct(b.skill)}:${b.id}`, drives: { pride: 1.0, greed: 0.5, curiosity: 0.2 }, bonus: 0.8, risk: 0.1, intent: {}, run: (c) => playBooking(c, b) }];
}

/** The set itself. */
export function playBooking(c: Ctx, b: Booking): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[b.loc]!;
  const act = bookedAct(b.skill);
  const host = b.host ? w.npcs[b.host] : undefined;
  b.played = true;
  const p = odds(0.15, 0.065, synergy(h, [b.skill as SkillId, ['music', 0.6], ['stat:charm', 0.4]]));
  const data = { place: loc.name, npc: host?.alive ? host.name : '', street: streetOf(w, loc).name };
  if (rng.chance(p)) {
    h.cash += b.pay;
    fameFrom(c, b.kind === 'private' ? 2.5 : 3.5, act);
    train(c, b.skill as SkillId, 3);
    train(c, 'music', 1);
    gainXp(c, 10);
    if (host?.alive) host.affinity += 10;
    for (const n of here(w)) if (!n.hostile && n !== host) n.affinity += 3;
    if (b.kind === 'secret') {
      // The scene: fewer people, but they're the ones who tell everyone. And somebody was recording.
      loc.fans = (loc.fans ?? 0) + 5;
      h.inventory.push(makeItem('bootleg_tapes'));
    }
    // Sharing a stage warms LUMINA to her.
    if (b.kind === 'duet' && w.legacy.muse?.lumina) w.legacy.muse.lumina.warmth++;
    c.emit(act, 'good', { ...data, variant: `${b.kind}_hit`, amount: b.pay });
    if (b.kind !== 'secret') museAtBooking(c);
    afterBooking(c, b, true);
    if (b.kind === 'private' || b.kind === 'duet' || prestige(loc) >= 2) bigNight(c, `the night at ${loc.name}`);
  } else {
    // The deposit, and not a neodollar more.
    const paid = Math.round(b.pay * 0.25);
    h.cash += paid;
    train(c, b.skill as SkillId, 1);
    if (host?.alive) host.affinity -= 10;
    c.emit(act, 'bad', { ...data, variant: `${b.kind}_flop`, amount: paid });
    if (b.kind !== 'secret') museAtBooking(c);
    afterBooking(c, b, false);
  }
}
