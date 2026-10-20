import type { Booking, Ctx, Deed, Npc, World } from './types';
import type { Candidate } from './candidate';
import { addCompanion, newCompanion, removeCompanion, slotsFree, gainCompanionXp } from './companions';
import { acquire, addHeat, here } from './combat';
import { moveNpc } from './population';
import { odds, skillLevel, synergy, train } from './skills';
import { block, expectation, streetOf } from './renown';
import { deedsOf } from './deeds';
import { crewOf } from './crew';
import { genInstrument, hasInstrument } from './instruments';
import { hourOf } from './clock';
import { BOOKABLE } from './bookings';
import type { Rng } from './rng';

/**
 * The band, and the things that come with being one.
 *
 *   the band        musicians she meets (session players, challengers at a cutting room, a tribute guitarist, anybody with a
 *                   `musician` tag) can join her as companions. Each one with her adds a level and a bit to every music skill
 *                   (companions.ts `bandBonus`), and posted at a home they rehearse for money (the `rehearse` job). Bands
 *                   break up: once a night each bandmate may leave, and always for a reason
 *   the name        the band gets one the night the first of them joins, and a new one after a big enough night
 *   the lockup      a rehearsal lockup (content/realty.ts) has room for four of them, and jamming there with her band is
 *                   the best practice in the city
 *   sound carries   a loud set reaches the next streets (stage.ts `fameFrom` calls `carry`): fans there too, and, late at
 *                   night somewhere people sleep, a noise complaint
 *   residencies     three good nights at the same stage and it offers her a slot every night for a week
 *   sponsors        once she's a real name, and not Muse's, an independent brand sends gear and a stipend; three flops
 *                   (or a Muse contract) and they are gone
 */

const BAND_MAX = 3;
const LEAVE_CHANCE = 0.08;
const RESIDENCY_HITS = 3;
const RESIDENCY_NIGHTS = 7;
/** How well known she has to be (`expectation`) before a sponsor calls. */
export const SPONSOR_LEVEL = 30;
const SPONSOR_FLOPS = 3;

export const bandmates = (w: World) => w.hero.companions.filter((a) => a.kind === 'musician');

/** Anyone who'd join a band: they play, and they aren't the devil, Muse, a robot or the owner. */
const joinable = (n: Npc): boolean =>
  n.alive && !n.hostile && !n.ephemeral && n.tags.includes('musician') && !n.tags.some((t) => ['robot', 'stranger', 'owner', 'muse', 'dragon'].includes(t)) && n.faction !== 'muse';

// ===================================================================== the name

const FIRST = ['Neon', 'Static', 'Velvet', 'Rust', 'Chrome', 'Midnight', 'Feral', 'Paper', 'Black', 'Electric', 'Broken', 'Holy', 'Atlas-Free', 'Ninth', 'Glass', 'Drowned'];
const SECOND = ['Ravens', 'Wires', 'Saints', 'Heat', 'Engine', 'Pigeons', 'Choir', 'Arches', 'Noodle Bar', 'Cathedral', 'Dogs', 'Weather', 'Overpass', 'Alibi', 'Riot', 'Lanterns'];

export function bandName(rng: Rng): string {
  const a = rng.pick(FIRST);
  const b = rng.pick(SECOND);
  return rng.chance(0.3) ? `Blackbird and the ${a} ${b}` : rng.chance(0.5) ? `the ${a} ${b}` : `${a} ${b}`;
}

function rename(c: Ctx, why: string): void {
  const { w, rng } = c;
  const old = w.legacy.bandName;
  let name = bandName(rng);
  for (let i = 0; i < 4 && name === old; i++) name = bandName(rng);
  w.legacy.bandName = name;
  c.emit('band', 'good', {
    variant: old ? 'renamed' : 'named', name,
    text: old ? `After ${why}, ${old} is not a big enough name any more. By morning the band is ${name}, and somebody has already sprayed it on a wall.` : `The band needs a name. Several bad ones are shouted. The one that sticks is ${name}.`,
    thought: old ? 'New name. Same noise. Louder.' : `${name}. Yes. Put it on a T-shirt.`,
  });
}

// ===================================================================== joining

/** She asks a musician to join. Her playing, her charm and her name against how good they are. */
export function askToJoin(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  w.counters[`bandask:${n.id}`] = 1;
  const syn = synergy(h, ['guitar', ['stat:charm', 0.6], ['rapport', 0.4]]);
  const name = Math.min(4, expectation(w, 'guitar') / 10);
  const p = odds(0.15, 0.06, syn + name - 0.4 * n.level + n.affinity / 25);
  train(c, 'rapport', 1);
  if (!slotsFree(w) || !rng.chance(p)) {
    n.affinity += 2;
    c.emit('band', 'mixed', {
      variant: 'no', npc: n.name,
      text: rng.pick([
        `${n.name} hears her out, then says they've got a thing with a covers band on Thursdays. It sounds made up. It probably is.`,
        `${n.name} laughs, then sees she means it, then says "ask me again when you can play the bridge."`,
        `${n.name} says no, kindly, and writes their number on her hand "for when you're famous."`,
      ]),
      thought: 'Their loss. Their huge, specific loss.',
    });
    return;
  }
  moveNpc(w, n, '_companion');
  const comp = newCompanion('musician', n.name, { npcId: n.id, home: n.locationId, loyalty: 55 + Math.max(0, Math.min(30, n.affinity / 2)) });
  // A session legend or a house champion is good already.
  comp.level = Math.max(1, Math.round(n.level * 3));
  comp.xp = 0;
  addCompanion(c, comp, 'band', true);
  c.emit('band', 'good', {
    variant: 'joined', npc: n.name,
    text: rng.pick([
      `${n.name} looks at her, at her guitar, at the door. "Fine. But I'm not playing anything in D." They're in the band.`,
      `${n.name} says yes before she has finished asking, which is either a very good sign or a very bad one. They're in the band.`,
      `${n.name} shakes on it, then plays her a bass line on the edge of the table that she will hear in her sleep. They're in the band.`,
    ]),
    thought: 'A band. An actual band. With a second person in it.',
  });
  if (!w.legacy.bandName) rename(c, 'the first rehearsal');
}

// ===================================================================== the lockup

const lockupHere = (w: World): Deed | undefined => deedsOf(w).find((d) => d.kind === 'lockup' && d.home === w.hero.locationId);

/** Jamming at her lockup: everyone posted there and everyone with her. The best practice there is. */
export function lockupJam(c: Ctx, d: Deed): void {
  const { w, rng } = c;
  const players = [...bandmates(w), ...crewOf(d).map((s) => s.comp).filter((a) => a.kind === 'musician')];
  w.counters[`lockup_jam:${d.home}`] = w.clock;
  const n = players.length;
  train(c, 'guitar', 2 + 1.5 * n);
  train(c, 'music', 1 + 0.5 * n);
  for (const a of players) {
    gainCompanionXp(c, a, 5 + 2 * n);
    a.loyalty = Math.min(100, a.loyalty + 3);
  }
  c.emit('band', 'good', {
    variant: 'jam', count: n,
    text: n
      ? rng.pick([
          `The roller door comes down and ${w.legacy.bandName ?? 'the band'} plays the same eight bars for two hours until they're right. Then they play them faster.`,
          `${n === 1 ? 'Two of them' : `${n + 1} of them`} in a concrete box, a train going over, and a song that wasn't there at the start of the night and is now.`,
          `A jam at the lockup turns into an argument turns into the best chorus Blackbird has ever written. Nobody remembers who said it first.`,
        ])
      : `Blackbird plays to the egg boxes at her lockup on her own for an hour. The egg boxes are a good audience. A band would be better.`,
    thought: n ? 'Again. From the top. Louder.' : 'Note to self: get a band.',
  });
}

// ===================================================================== a night ends, a night starts

const REASONS = [
  'creative differences, which turn out to be about who gets the good chair',
  'a better offer from a Muse act, with dental',
  'a noodle stall of their own, finally',
  'a girlfriend in the outer districts and a promise to be home by midnight',
  'a cutting-room grudge they need to settle on their own',
  'the van, which they say is theirs and is not',
  'a solo project, which is the same songs with fewer people',
  'a religious experience at an arena, which they will not discuss',
];

/** Once a night: bandmates drift, sponsors pay or walk, residencies run out. */
export function bandTick(c: Ctx): void {
  const { w, rng } = c;
  if (w.counters.band_checked) return;
  w.counters.band_checked = 1;
  for (const a of bandmates(w)) {
    if (!rng.chance(LEAVE_CHANCE * (a.loyalty >= 70 ? 0.5 : a.loyalty < 30 ? 2 : 1))) continue;
    const why = rng.pick(REASONS);
    removeCompanion(c, a, 'left');
    c.emit('band', 'bad', { variant: 'left', npc: a.name, text: `${a.name} is leaving the band. The reason given is ${why}.`, thought: rng.pick(['Fine. Fine! More solos for me.', 'Bands break up. That is how you know they were bands.']) });
  }
  const res = w.legacy.residency;
  if (res && res.until < w.legacy.runs) {
    delete w.legacy.residency;
    c.emit('band', 'mixed', { variant: 'residency_over', place: w.locations[res.loc]?.name ?? 'somewhere', text: `The residency at ${w.locations[res.loc]?.name ?? 'the club'} is over. The posters come down. Somebody keeps one.`, thought: 'A week of being the house band. I could get used to it.' });
  }
  sponsorTick(c);
}

// ===================================================================== sound that carries

/**
 * A loud set goes past the walls: the streets next door hear it too, and some of them become fans. Late at night, outside the
 * nightlife districts, somebody calls it in. Called by `fameFrom` with what the set was worth and how loud it was.
 */
export function carry(c: Ctx, gain: number, loud: number, big: boolean): void {
  const { w, rng } = c;
  const spill = gain * (0.12 * loud + (big ? 0.15 : 0));
  if (spill < 0.05) return;
  const loc = w.locations[w.hero.locationId];
  if (!loc) return;
  const street = streetOf(w, loc);
  const near = [...block(w, loc)].filter((id) => id !== street.id);
  for (const id of near) {
    const s = w.locations[id];
    if (s) s.fans = (s.fans ?? 0) + spill / Math.max(1, near.length) * 2;
  }
  const hr = hourOf(w.clock);
  const late = hr >= 23 || hr < 6;
  if (loud >= 1 && late && street.gen?.district !== 'nightlife' && w.counters[`noise:${street.id}`] === undefined && rng.chance(0.06 * loud)) {
    w.counters[`noise:${street.id}`] = 1;
    addHeat(w, 'npd', 0.5);
    c.emit('band', 'mixed', {
      variant: 'noise', place: street.name,
      text: rng.pick([
        `Three streets away a man in a dressing gown opens a window, listens to Blackbird's solo for a whole minute, and then calls the NPD about it.`,
        `The sound carries all the way down ${street.name} and round the corner, and somewhere a noise complaint is filed with real feeling.`,
      ]),
      thought: 'A noise complaint. A review, basically.',
    });
  }
}

// ===================================================================== residencies

/** A booking went well or didn't: count it towards a residency, and tell the sponsor. Called by bookings.ts `playBooking`. */
export function afterBooking(c: Ctx, b: Booking, hit: boolean): void {
  const { w } = c;
  const loc = w.locations[b.loc];
  const sp = w.legacy.sponsor;
  if (sp) sp.flops = hit ? Math.max(0, sp.flops - 1) : sp.flops + 1;
  if (sp && sp.flops >= SPONSOR_FLOPS) {
    delete w.legacy.sponsor;
    c.emit('band', 'bad', { variant: 'dropped', name: sp.name, text: `${sp.name} sends a short message about "brand alignment" and stops the stipend. They would like the jacket back.`, thought: 'Keep the jacket. Keep it? I am keeping the jacket.' });
  }
  if (!loc) return;
  if (b.residency) {
    if (!hit && w.legacy.residency?.loc === b.loc) {
      delete w.legacy.residency;
      c.emit('band', 'bad', { variant: 'residency_fired', place: loc.name, text: `After that, ${loc.name} would like its Thursdays back. And its Fridays. The residency is over.`, thought: 'One bad night. One!' });
    }
    return;
  }
  if (!hit || b.kind === 'secret' || b.kind === 'duet') return;
  const hits = (w.legacy.residencyHits ??= {});
  hits[b.loc] = (hits[b.loc] ?? 0) + 1;
  if (hits[b.loc]! >= RESIDENCY_HITS && !w.legacy.residency) {
    hits[b.loc] = 0;
    const pay = Math.round(b.pay * 1.2);
    w.legacy.residency = { loc: b.loc, skill: b.skill, pay, until: w.legacy.runs + RESIDENCY_NIGHTS };
    c.emit('band', 'good', {
      variant: 'residency', place: loc.name, amount: pay,
      text: `${loc.name} offers her a residency: every night for a week, ${pay}nd a night, her name on the board outside in letters that do not come off in the rain.`,
      thought: 'The house band. Me. Every night.',
    });
  }
}

/** Tonight's residency night, if she has a residency and nothing else booked there. Called from bookings.ts `tickBookings`. */
export function residencyNight(w: World): Booking | null {
  const r = w.legacy.residency;
  if (!r || r.until < w.legacy.runs || !w.locations[r.loc] || w.locations[r.loc]!.sealed) return null;
  if (w.legacy.bookings?.some((b) => b.loc === r.loc && b.night === w.legacy.runs)) return null;
  return { id: `res${w.legacy.runs}.${r.loc}`, loc: r.loc, night: w.legacy.runs, skill: r.skill, kind: 'gig', pay: r.pay, residency: true };
}

// ===================================================================== sponsors

const SPONSORS = ['Static Bloom Amplification', 'Nine Lives Pedals', 'Kowloon Cable Co.', 'Hellmouth Picks', 'Neon Gutter Strings', 'Overpass Records (Independent)', 'Hot Tin Roof Energy Drink', 'the Arches Brewing Collective'];

function bestKnown(w: World): number {
  return Math.max(...BOOKABLE.map((s) => expectation(w, s)));
}

function sponsorTick(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const sp = w.legacy.sponsor;
  if (sp && w.legacy.muse?.signed) {
    delete w.legacy.sponsor;
    c.emit('band', 'bad', { variant: 'dropped', name: sp.name, text: `${sp.name} hears she has signed with Muse and drops her by the end of the morning, in a statement that uses the word "authenticity" four times.`, thought: 'Fair.' });
    return;
  }
  if (sp) {
    h.cash += sp.stipend;
    c.emit('band', 'good', { variant: 'stipend', name: sp.name, amount: sp.stipend, text: `${sp.name} pays her stipend in: ${sp.stipend}nd, and a note asking her to be photographed holding the product.`, thought: 'Money for being me. Finally.' });
    return;
  }
  if (w.legacy.muse?.signed || bestKnown(w) < SPONSOR_LEVEL || !rng.chance(0.25)) return;
  const name = rng.pick(SPONSORS);
  const stipend = Math.round(30 + 2 * bestKnown(w));
  w.legacy.sponsor = { name, stipend, since: w.legacy.runs, flops: 0 };
  const gear = genInstrument(rng, 3 + Math.floor(bestKnown(w) / 25));
  gear.name = `${name.replace(/^the /, '')} signature ${gear.name}`;
  acquire(c, gear);
  c.emit('band', 'good', {
    variant: 'sponsor', name, amount: stipend, item: gear.name,
    text: `${name} wants her. Not Muse: a small loud company with a warehouse and a dog. They send a ${gear.name}, a jacket with their name on it and a stipend of ${stipend}nd a night, for as long as she keeps playing like that.`,
    thought: 'A sponsor that is not a megacorp. I did not know they still made those.',
  });
}

// ===================================================================== candidates

export function bandCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  if (hasInstrument(h) && bandmates(w).length < BAND_MAX && slotsFree(w)) {
    for (const n of here(w).filter((x) => joinable(x) && !w.counters[`bandask:${x.id}`])) {
      out.push({
        key: `join_band:${n.id}`, drives: { pride: 0.5, curiosity: 0.4, lust: 0.1 }, bonus: 0.15 + 0.1 * (BAND_MAX - bandmates(w).length) + skillLevel(h, 'guitar') / 200,
        intent: { text: `Blackbird watches ${n.name} play, then walks over and asks if they want to be in a band.` },
        run: (c) => askToJoin(c, n),
      });
      break;
    }
  }
  const d = lockupHere(w);
  if (d && hasInstrument(h) && w.clock - (w.counters[`lockup_jam:${d.home}`] ?? -1e9) >= 180) {
    const n = bandmates(w).length + crewOf(d).filter((s) => s.comp.kind === 'musician').length;
    out.push({ key: `band_jam:${d.home}`, drives: { pride: 0.4, curiosity: 0.5 }, bonus: 0.2 + 0.12 * n, intent: { text: `Blackbird pulls the roller door down at her lockup and plugs in.` }, run: (c) => lockupJam(c, d) });
  }
  return out;
}

/** After a booking that brought the house down with three of them on stage, the band might want a bigger name. */
export function bigNight(c: Ctx, why: string): void {
  if (bandmates(c.w).length >= 2 && c.rng.chance(0.15)) rename(c, why);
}
