import type { Booking, Ctx, MuseFile, Npc, World } from './types';
import type { Candidate } from './candidate';
import { fight, remember } from './combat';
import { AWAY, addNpc, moveNpc } from './population';
import { spawnNpc } from './content/archetypes';
import { dangerOf } from './grade';
import { odds, synergy, train } from './skills';
import { fameFrom } from './stage';
import { museRenown, strikeGrade } from './muse';
import { shiftPull } from './musescene';

/**
 * The contract, both ways, and the woman Muse sends when it's personal.
 *
 * - **The duet** (page thirty): signed, Muse books her for a night with LUMINA (a `duet` booking, which waits for her
 *   through a death like any booking). Played straight, it pays like nothing else. Or she can **detonate it**: play her
 *   own song instead, live on every Muse channel. That's the biggest fame moment there is, and a breach.
 * - **Breaches**: detonating the duet, running off with LUMINA, or spoiling a Muse show while signed. Muse's lawyers
 *   take a fine, the contract is void, and she's back to having said no. A public breach (`detonated`) means she's hunted
 *   whatever her renown.
 * - **ENCORE**: once she's hunted and very famous, one Inspiration commander takes a personal interest. ENCORE leads the
 *   strikes, turns up to watch her sets, and comes back twice with new chrome before she's gone for good. Blackbird can
 *   fight her or seduce her; a commander with feelings calls off a strike now and then.
 */

const file = (w: World): MuseFile => (w.legacy.muse ??= {});

// ===================================================================== breaches

export type Breach = 'detonate' | 'lumina' | 'show';

/** Signed, and she's broken it. Lawyers, a fine, and the contract is void; done in public, Muse hunts her regardless. */
export function breach(c: Ctx, how: Breach): void {
  const { w } = c;
  const m = file(w);
  if (!m.signed) return;
  const fine = Math.min(w.hero.cash, 200 + Math.round(2 * museRenown(w)));
  w.hero.cash -= fine;
  m.signed = false;
  m.refused = (m.refused ?? 0) + 1;
  m.offered = w.legacy.runs;
  m.detonated = true;
  // Muse pulls her songs from rotation, and her bookings with Muse go with them.
  w.legacy.bookings = (w.legacy.bookings ?? []).filter((b) => b.kind !== 'duet');
  c.emit('muse', 'bad', { variant: `breach_${how}`, amount: fine });
}

// ===================================================================== the duet

/** Tonight's duet, if she's at it and hasn't played it. */
const duetHere = (w: World): Booking | undefined =>
  w.legacy.bookings?.find((b) => b.kind === 'duet' && b.loc === w.hero.locationId && b.night === w.legacy.runs && !b.played);

export function contractCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const duet = duetHere(w);
  if (duet && file(w).signed) {
    out.push({ key: 'detonate_contract', drives: { pride: 0.9, bravery: 0.6, curiosity: 0.3 }, bonus: 0.2 + 0.4 * (w.hero.personality.traits.mischief - 0.5) + 0.4 * (w.hero.personality.traits.artistry - 0.5), risk: 0.6, intent: {}, run: (c) => detonate(c, duet) });
  }
  // ---- ENCORE, watching
  const enc = w.npcs.encore;
  if (enc?.alive && !enc.hostile && enc.locationId === w.hero.locationId) {
    out.push({ key: 'seduce_encore', drives: { lust: 1.0, pride: 0.5, bravery: 0.3 }, bonus: 0.3, risk: 0.5, intent: { npc: enc.name }, run: seduceEncore });
    out.push({ key: 'challenge_encore', drives: { bravery: 1.0, pride: 0.7 }, bonus: 0.2, risk: 1.5, intent: { npc: enc.name }, run: (c) => fightEncore(c, [enc]) });
  }
  return out;
}

/** The night of the duet: she plays her own song instead of LUMINA's, live on every Muse channel. */
export function detonate(c: Ctx, duet: Booking): void {
  const { w, rng } = c;
  duet.played = true;
  const loc = w.locations[duet.loc]!;
  const show = w.mind.museShow;
  if (show && show.loc === loc.id) show.done = 'crashed';
  const great = rng.chance(odds(0.2, 0.065, synergy(w.hero, ['guitar', ['music', 0.5], ['stat:charm', 0.4]])));
  const gain = fameFrom(c, great ? 25 : 10, 'detonate_contract');
  loc.fans = (loc.fans ?? 0) + (great ? 40 : 15);
  shiftPull(w, loc.id, -30);
  train(c, 'guitar', 4);
  c.emit('detonate_contract', great ? 'good' : 'mixed', { variant: great ? 'great' : 'rough', place: loc.name, fame: Math.round(gain) });
  breach(c, 'detonate');
}

// ===================================================================== ENCORE

/** ENCORE takes a personal interest once she's hunted and very famous, and until she's beaten for the third time. */
export const ENCORE_RENOWN = 450;
export const encoreActive = (w: World): boolean => {
  const m = w.legacy.muse;
  return !!m?.refused && !m.signed && !m.encore?.gone && (museRenown(w) >= ENCORE_RENOWN || (!!m.detonated && museRenown(w) >= ENCORE_RENOWN / 2));
};

/** ENCORE herself, brought to where Blackbird is (made the first time she's needed; one of her, ever). */
export function summonEncore(c: Ctx, hostile: boolean): Npc {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId]!;
  const grade = strikeGrade(w, dangerOf(loc)) + 8;
  let enc = w.npcs.encore;
  if (!enc) {
    enc = addNpc(w, spawnNpc(rng, 'encore', 'encore', loc.id, { faction: 'muse', grade, gender: 'woman' }));
    enc.name = 'ENCORE';
  }
  (file(w).encore ??= { beaten: 0, flame: 0 });
  enc.alive = true;
  enc.hp = enc.maxHp;
  enc.downUntil = 0;
  enc.hostile = hostile;
  moveNpc(w, enc, loc.id);
  return enc;
}

/** After any fight with her in it: she doesn't stay down until the third time. */
export function settleEncore(c: Ctx): void {
  const { w } = c;
  const enc = w.npcs.encore;
  const rec = w.legacy.muse?.encore;
  if (!enc || !rec || rec.gone) return;
  const beaten = !enc.alive || enc.downUntil > w.clock;
  if (beaten) {
    rec.beaten++;
    if (rec.beaten >= 3) {
      rec.gone = true;
      c.emit('encore', 'good', { variant: 'gone', npc: enc.name });
      return;
    }
    enc.alive = true;
    enc.hp = enc.maxHp;
    enc.downUntil = 0;
    remember(enc, 'was beaten by Blackbird, and is coming back');
    c.emit('encore', 'mixed', { variant: 'retreat', npc: enc.name, times: rec.beaten });
  }
  enc.hostile = false;
  moveNpc(w, enc, AWAY);
}

export function fightEncore(c: Ctx, team: Npc[]): void {
  for (const n of team) n.hostile = true;
  fight(c, team, { cause: 'ENCORE', joiners: false });
  settleEncore(c);
}

/** ENCORE turns up to watch her set: not tonight's strike, just a look. Blackbird can make something of it. */
export function encoreWatches(c: Ctx): void {
  const enc = summonEncore(c, false);
  c.emit('encore', 'mixed', { variant: 'watching', npc: enc.name, place: c.w.locations[c.w.hero.locationId]!.name });
}

/** A commander with feelings: no strikes for the rest of the night after a good evening with her. */
export const encoreTruce = (w: World): boolean => w.counters.encore_truce === w.legacy.runs;

export function seduceEncore(c: Ctx): void {
  const { w, rng } = c;
  const enc = w.npcs.encore!;
  const rec = (file(w).encore ??= { beaten: 0, flame: 0 });
  const loc = w.locations[w.hero.locationId]!;
  if (rng.chance(odds(0.15, 0.06, synergy(w.hero, ['romance', ['stat:charm', 0.7]])) + 0.06 * rec.flame)) {
    rec.flame++;
    w.counters.encore_truce = w.legacy.runs;
    remember(enc, 'kissed Blackbird and called off the team');
    if (loc.crowded) w.hero.fame += 6;
    c.emit('encore', 'good', { variant: 'seduced', npc: enc.name, place: loc.name, flame: rec.flame });
    enc.hostile = false;
    moveNpc(w, enc, AWAY);
  } else {
    c.emit('encore', 'bad', { variant: 'seduce_fail', npc: enc.name });
    fightEncore(c, [enc]);
  }
}
