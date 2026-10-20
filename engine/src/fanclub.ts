import type { Booking, Ctx, Id, Location, Npc, World } from './types';
import type { Candidate } from './candidate';
import { register } from './affordances';
import { acquire, addHeat, gainXp } from './combat';
import { FANCLUB, SUPERFAN_JOBS } from './content/fanclubs';
import { makeItem } from './content/items';
import { skillLevel, odds, synergy, train } from './skills';
import { block, expectation, streetOf } from './renown';
import { localFans } from './fans';
import { addVenue } from './mapgen';
import { fameFrom } from './stage';
import { runDuel } from './duel';
import { hasInstrument } from './instruments';
import { addDeed, resurface } from './provenance';
import { banned, find, rowCandidates, say, venueAt, type VenueView } from './venuekit';
import { FANCLUB_ROWS } from './content/fanclubafford';
import { FANCLUB_EVENTS } from './content/fanclubevents';

register('fanclub', [...FANCLUB_ROWS, ...FANCLUB_EVENTS]);

/**
 * Fan clubs, as a system. The only music venue nobody rolls: her fans open them.
 *
 *   opening        once a night, any street with enough of her fans round its block (and no club near) gets one, in a slot of
 *                  its own (`addVenue`), on the map for good. It is Neo's memory of her, so it outlives every body
 *   superfans      named fans with jobs in places that matter (a desk sergeant, a Helix tech, a dragon technician, a Clearance
 *                  officer...), each good for one favour a night: a file lost, a med kit, a dragon's ears tuned to her, a guitar
 *                  smuggled home in a coat
 *   the tribute    her tribute band's guitarist plays her songs as the Blackbird Neo remembers, better than her hands can now.
 *                  Jam with them (she learns her own riffs back), duel them, or send them to tonight's booking in her place
 *   the shrine     a wall of guitars fans found, some of them really hers (provenance.ts): ask for one back
 *
 * A club round her block is also a headquarters: the myth acts (the riot, the march, the teardown) are a little likelier there.
 */

/** Fans round a block before they open a club. */
export const FANCLUB_FANS = 45;
const MAX_CLUBS = 10;

export const clubs = (w: World): Location[] => Object.values(w.locations).filter((l) => l.venue?.kind === 'fanclub');

/** Is there a club on or next to this street already? */
function clubNearby(w: World, street: Location): boolean {
  for (const sid of block(w, street)) for (const e of w.locations[sid]?.exits ?? []) if (w.locations[e.to]?.venue?.kind === 'fanclub') return true;
  return false;
}

/** Once a night: wherever her fans are thick enough on the ground, they open a club. */
export function fanclubTick(c: Ctx): void {
  const { w } = c;
  if (w.counters.fanclub_checked) return;
  w.counters.fanclub_checked = 1;
  const have = clubs(w).length;
  if (have >= MAX_CLUBS) return;
  const seen = new Set<Id>();
  let opened = 0;
  for (const loc of Object.values(w.locations)) {
    if (!loc.fans || have + opened >= MAX_CLUBS) continue;
    const street = streetOf(w, loc);
    if (seen.has(street.id) || street.kind !== 'street' || !street.gen || street.road === 'highway' || street.sealed) continue;
    seen.add(street.id);
    if (localFans(w, street.id) < FANCLUB_FANS || clubNearby(w, street)) continue;
    const club = addVenue(w, street, 'fanclub');
    opened++;
    if (w.legacy.lostGuitars?.length && club.venue) club.venue.keep = { ...(club.venue.keep ?? {}), shrine: 1 };
    c.emit('fanclub', 'good', {
      variant: 'opened', place: club.name, street: street.name,
      text: `Her fans round ${street.name} have opened a fan club: ${club.name}. There is a shrine, a membership book and a kettle, and the first item on the agenda is her.`,
      thought: 'A club. For me. They should have asked. I would have said yes.',
    });
  }
}

/** A superfan's job: the same every time she looks. */
export function jobOf(n: Npc): string {
  const ids = Object.keys(SUPERFAN_JOBS);
  let x = 0;
  for (let i = 0; i < n.id.length; i++) x = (x * 31 + n.id.charCodeAt(i)) >>> 0;
  return ids[x % ids.length]!;
}

/** One favour, from a superfan who has wanted to do her one for years. */
export function askFavour(c: Ctx, v: VenueView, n: Npc): void {
  const { w } = c;
  const job = jobOf(n);
  const def = SUPERFAN_JOBS[job]!;
  w.counters[`favour:${n.id}`] = 1;
  n.affinity += 5;
  const tok: Record<string, string | number> = { npc: n.name, job: def.label, favour: def.favour };
  switch (job) {
    case 'desk_sergeant': w.heat.npd = 0; break;
    case 'helix_tech': acquire(c, makeItem('med_pack')); break;
    case 'dragon_tech': w.legacy.buriedUntil = Math.max(w.legacy.buriedUntil ?? -1, w.legacy.runs); break;
    case 'atlas_manager': w.heat.atlas = 0; break;
    case 'clearance': {
      const g = resurface(w, c.rng);
      w.heat.muse = 0;
      if (g) {
        addDeed(g, 'smuggled out of Clearance in a superfan\'s coat');
        acquire(c, g);
        tok.favour = `brings her ${g.name}, smuggled out of Clearance in a coat`;
      }
      break;
    }
    case 'receptionist': acquire(c, makeItem('muse_lanyard')); break;
    case 'journalist': fameFrom(c, 5, 'fanclub'); break;
    case 'bouncer': for (const id of block(w, v.main)) for (const e of w.locations[id]?.exits ?? []) w.counters[`waved:${e.to}`] = 1; break;
    case 'bus_driver': {
      const t = Object.values(w.npcs).filter((x) => x.alive && w.mind.bounties?.[x.id] === undefined && x.tags.includes('wanted'))[0];
      if (t) (w.mind.bounties ??= {})[t.id] = 'tip';
      break;
    }
    case 'gang_lieutenant': for (const g of ['vipers', 'sixers', 'marrow', 'choir', 'ganger']) w.heat[g] = 0; break;
    case 'luthier': for (const it of w.hero.inventory) if (it.inst) it.inst.tone = Math.min(3, it.inst.tone + 1); break;
    case 'dj': fameFrom(c, 3, 'fanclub'); break;
  }
  say(c, v, `favour.${job}`, 'good', [
    '{npc} at {venue} turns out to be {job}, and has been waiting years to be useful to her. {npc} {favour}, and will not hear a word of thanks.',
    'Blackbird asks {npc}, who is {job}, for one thing. {npc} {favour} before she has finished the sentence.',
  ], ['A fan in the right place is worth a hundred in the crowd.', 'I have people everywhere. Lovely, devoted people.'], tok, { job });
}

/** The tribute guitarist as a foe: the Blackbird Neo remembers. */
const tributeGrade = (w: World): number => Math.max(15, Math.round(expectation(w, 'guitar') + 2));

/** Jam with her own tribute band: she learns her own riffs back off them. */
export function tributeJam(c: Ctx, v: VenueView): void {
  const { w } = c;
  w.counters[`tribute_jam:${v.main.id}`] = 1;
  const gap = Math.max(0, tributeGrade(w) - skillLevel(w.hero, 'guitar'));
  train(c, 'guitar', Math.round(3 + gap * 0.5));
  gainXp(c, 3);
  const who = find(v, 'tag:tribute');
  say(c, v, 'tribute.jam', 'good', [
    '{npc} from the tribute band plays Blackbird her own song at {venue}, the way she used to play it, and then slowly, so she can follow. By the end she is playing it back, nearly as well as her own tribute act.',
    'An hour with her tribute band at {venue}. {npc} shows her the riff she wrote three bodies ago, and the trick with the thumb she has forgotten. The members watch in total silence.',
  ], ['Taught by a fan to be me. I will take it.', 'They know me better than I do. That is what fans are for.'], { npc: who?.name ?? 'the tribute guitarist' });
}

/** Duel her own tribute act. */
export function tributeDuel(c: Ctx, v: VenueView): void {
  const { w } = c;
  w.counters[`tribute_duel:${v.main.id}`] = 1;
  const who = find(v, 'tag:tribute');
  const r = runDuel(c, { name: who?.name ?? 'the tribute guitarist', grade: tributeGrade(w), style: 'shredder', ...(who ? { npc: who } : {}) }, { skill: 'guitar', event: 'fanclub', edge: 4 });
  train(c, 'guitar', r.won ? 4 : 2);
  if (r.won) {
    fameFrom(c, 4, 'fanclub');
    v.main.fans = (v.main.fans ?? 0) + 8;
    say(c, v, 'tribute.won', 'good', ['Blackbird beats her own tribute act at {venue}, in front of the whole club, playing her own songs. The tribute guitarist bows, takes off the wig, and asks for her autograph.'], ['I am the best version of me. Confirmed.'], {});
  } else {
    w.hero.fame = Math.max(0, w.hero.fame - 2);
    say(c, v, 'tribute.lost', 'mixed', ['Her own tribute act beats Blackbird at {venue}, playing her own songs. The club does not know where to look. The tribute guitarist apologises for a long time.'], ['Beaten by me. Technically a win.'], {});
  }
}

/** Tonight's booking somewhere else, and nobody would know the difference... */
export function bookingElsewhere(w: World, here: Id): Booking | undefined {
  return w.legacy.bookings?.find((b) => b.night === w.legacy.runs && !b.played && b.loc !== here && b.skill === 'guitar');
}

/** Send the tribute guitarist to play her booking. */
export function sendTribute(c: Ctx, v: VenueView, b: Booking): void {
  const { w, rng } = c;
  b.played = true;
  const loc = w.locations[b.loc];
  const half = Math.round(b.pay / 2);
  w.hero.cash += half;
  const who = find(v, 'tag:tribute');
  if (rng.chance(0.15)) {
    const lost = Math.round(Math.min(w.hero.fame, 0.08 * w.hero.fame + 2) * 10) / 10;
    w.hero.fame -= lost;
    say(c, v, 'standin.caught', 'bad', ['Halfway through her set at {place}, somebody notices that Blackbird\'s wig has slipped. It is {npc}, from the tribute band. The clip is everywhere by morning, and Blackbird is down {lost} fame, and up {pay}nd.'], ['It was a creative collaboration.'], { place: loc?.name ?? 'the venue', npc: who?.name ?? 'the tribute guitarist', lost, pay: half });
    return;
  }
  say(c, v, 'standin', 'good', ['{npc} from the tribute band puts on the jacket and plays Blackbird\'s booking at {place}, as Blackbird. Nobody notices. The review is the best she has had in a year. They split the {all}nd down the middle.'], ['A body double. For my art. Iconic.', 'I was there in spirit. And in wig.'], { place: loc?.name ?? 'the venue', npc: who?.name ?? 'the tribute guitarist', all: b.pay });
}

/** A guitar off the shrine wall that the members swear was hers. */
export function shrineGuitar(c: Ctx, v: VenueView): void {
  const { w, rng } = c;
  const devotion = Number(v.info.keep?.devotion ?? 50);
  const p = odds(0.25, 0.06, synergy(w.hero, ['stat:charm', ['persuasion', 0.6], ['speaking', 0.3]])) - (devotion - 50) / 200;
  w.counters[`shrine_asked:${v.main.id}`] = 1;
  if (rng.chance(Math.max(0.05, p))) {
    const g = resurface(w, rng);
    if (!g) return;
    addDeed(g, `kept on the shrine wall at ${v.main.name}`);
    acquire(c, g);
    v.info.keep = { ...(v.info.keep ?? {}), shrine: 0 };
    say(c, v, 'shrine.win', 'good', ['The members at {venue} take the guitar down off the shrine wall, very carefully, and give it to her, which is the first time anything has come off the shrine. It is hers. Her hands know: {item}.'], ['They kept it for me. Through everything.'], { item: g.name });
  } else {
    say(c, v, 'shrine.lose', 'mixed', ['The members at {venue} will not take the guitar off the shrine wall, even for her. "It belongs to all of us," says the president, kindly, firmly.'], ['A shrine is a shrine. Even to me.'], {});
  }
}

// ===================================================================== candidates

function dealCandidates(w: World, v: VenueView): Candidate[] {
  const out: Candidate[] = [];
  const re = (c: Ctx) => venueAt(c.w, 'fanclub') ?? v;
  for (const n of v.people.filter((x) => x.alive && !x.hostile && x.archetype === 'superfan' && !w.counters[`favour:${x.id}`])) {
    const def = SUPERFAN_JOBS[jobOf(n)]!;
    out.push({ key: `favour:${n.id}`, drives: { greed: 0.4, curiosity: 0.4, pride: 0.3 }, bonus: 0.35, intent: { text: `Blackbird learns that ${n.name} at ${v.main.name} is ${def.label}, and has an idea.` }, run: (c) => askFavour(c, re(c), n) });
  }
  const tribute = find(v, 'tag:tribute');
  if (tribute && hasInstrument(w.hero)) {
    if (!w.counters[`tribute_jam:${v.main.id}`]) out.push({ key: 'tribute:jam', drives: { curiosity: 0.6, pride: 0.3 }, bonus: 0.2 + Math.max(0, expectation(w, 'guitar') - skillLevel(w.hero, 'guitar')) / 60, intent: { text: `Blackbird picks up a guitar at ${v.main.name} and nods at her own tribute band.` }, run: (c) => tributeJam(c, re(c)) });
    if (!w.counters[`tribute_duel:${v.main.id}`]) out.push({ key: 'tribute:duel', drives: { pride: 1, bravery: 0.4 }, bonus: 0.2, risk: 0.2, intent: { text: `Blackbird challenges her own tribute act at ${v.main.name}. The room goes very quiet.` }, run: (c) => tributeDuel(c, re(c)) });
    const b = bookingElsewhere(w, v.main.id);
    if (b) out.push({ key: `tribute:standin:${b.id}`, drives: { greed: 0.5, curiosity: 0.4 }, bonus: 0.15 + Math.max(0, expectation(w, 'guitar') - skillLevel(w.hero, 'guitar')) / 50, risk: 0.15, intent: { text: `Blackbird looks at her tribute guitarist at ${v.main.name}, then at the time, then at her own jacket.` }, run: (c) => sendTribute(c, re(c), b) });
  }
  if (v.info.keep?.shrine && w.legacy.lostGuitars?.length && !w.counters[`shrine_asked:${v.main.id}`]) {
    out.push({ key: 'shrine:guitar', drives: { pride: 0.7, greed: 0.3 }, bonus: 0.35, intent: { text: `Blackbird looks at the guitars on the shrine wall at ${v.main.name}, and one of them looks back.` }, run: (c) => shrineGuitar(c, re(c)) });
  }
  return out;
}

export function fanclubCandidates(w: World): Candidate[] {
  const v = venueAt(w, 'fanclub');
  if (!v || banned(w, v.main)) return [];
  return [...dealCandidates(w, v), ...rowCandidates(w, v)];
}

/** A pull toward a fan club she knows of: they are always glad to see her, and a superfan has a favour waiting. */
export function fanclubUrge(w: World, to: Id): { bonus: number; smart: number } {
  const v = venueAt(w, 'fanclub', to);
  if (!v || w.hero.locationId === to || banned(w, v.main)) return { bonus: 0, smart: 0 };
  const heat = Math.min(0.3, ((w.heat.npd ?? 0) + (w.heat.muse ?? 0) + (w.heat.atlas ?? 0)) * 0.04);
  return { bonus: 0.15 + heat + w.hero.personality.weights.pride * 0.1, smart: heat };
}

/** For the forced-run tests: every favour a superfan can do. */
export const FAVOURS = Object.keys(SUPERFAN_JOBS);
export { FANCLUB, addHeat };
