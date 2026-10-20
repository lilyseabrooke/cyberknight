import type { Ctx, MuseFile, Npc, World } from './types';
import type { GameEvent } from './events';
import { addHeat, fight } from './combat';
import { addNpc, moveNpc, npcsAt } from './population';
import { spawnNpc } from './content/archetypes';
import { dangerOf } from './grade';
import { SKILLS, type SkillId } from './content/skills';
import { addRenown, audience } from './renown';
import { enforcement, shiftPull } from './musescene';
import { encoreActive, encoreTruce, encoreWatches, settleEncore, summonEncore } from './musecontract';
import { odds, synergy, train } from './skills';
import { INST_CLASSES, genInstrument } from './instruments';

/**
 * Muse: Neo's entertainment conglomerate. Every channel, all the music, and the say over what music is allowed (Muse's).
 * See docs/setting/factions.md.
 *
 * Non-Muse music is technically illegal, and nobody cares about a busker for long. Muse notices once someone is big enough,
 * and its attention climbs with her renown as a performer (`legacy.renown`), which outlives her, so Muse's file on her
 * does too (`legacy.muse`):
 *
 * - **barely anyone**: noise-abatement drones. One or two turn up after a show that drew a crowd, announce
 *   UNAUTHORIZED ENTERTAINMENT DETECTED and tear-gas the crowd away. They keep coming at every rung below signing.
 * - **a local name**: the Muse Clearance letter, then Clearance officers turning up at her sets (fines; a guitar taken
 *   "for safekeeping").
 * - **trending**: the Muse A&R scout and a contract. She signs or she doesn't, by her nature. Muse isn't Atlas: signing
 *   is allowed, pays, and makes the officers go away. The contract survives her death.
 * - **she said no**: the legal route. Muse files, the NPD serves, at her gigs.
 * - **too big to ignore** (said no, and still growing): Inspiration teams. Strike squads in pastel tactical armour with
 *   heart decals on the guns, at her sets and her bookings, bigger and better the bigger she is. They play the jingle
 *   before they breach. If they get her, Muse posts a heartfelt tribute and a link to the tribute single.
 */

const PERFORMING = ['guitar', 'vocals', 'djing', 'beatbox'];
/** Renown at which Muse's noise-abatement drones start breaking up her shows: earlier than anything else Muse does. */
export const MUSE_DRONES = 8;
/** Renown at which Muse writes. */
export const MUSE_LETTER = 15;
/** Renown at which Muse sends a scout. */
export const MUSE_SCOUT = 60;
/** Renown at which a Blackbird who said no is too big to ignore: Inspiration teams. */
export const MUSE_STRIKE = 150;

/** How much of a performer Neo thinks she is, across every performing skill. */
export const museRenown = (w: World): number => PERFORMING.reduce((n, s) => n + (w.legacy.renown?.[s] ?? 0), 0);

const file = (w: World): MuseFile => (w.legacy.muse ??= {});

/** Muse's view of her, as a word. */
export function museStanding(w: World): 'nobody' | 'local' | 'trending' | 'refused' | 'hunted' | 'signed' {
  const m = w.legacy.muse;
  if (m?.signed) return 'signed';
  if (m?.refused) return museRenown(w) >= MUSE_STRIKE || m.detonated ? 'hunted' : 'refused';
  const r = museRenown(w);
  return r >= MUSE_SCOUT ? 'trending' : r >= MUSE_LETTER ? 'local' : 'nobody';
}

/** After a performing act that went over in front of people: does Muse notice? */
export function museAfterSet(c: Ctx, act: string, skill: string, events: GameEvent[]): void {
  const { w, rng } = c;
  if (SKILLS[skill as SkillId]?.group !== 'music') return;
  if (!events.some((e) => e.type === act && e.outcome === 'good')) return;
  const loc = w.locations[w.hero.locationId]!;
  if (!audience(w, loc)) return;
  const m = file(w);
  // A secret show is secret: Muse doesn't hear about it, but the street does, and Muse's hold there slips.
  if (w.legacy.bookings?.some((b) => b.kind === 'secret' && b.loc === loc.id && b.night === w.legacy.runs)) {
    if (!m.signed) shiftPull(w, loc.id, -4);
    return;
  }
  // Signed, her shows are Muse's shows.
  if (m.signed) {
    shiftPull(w, loc.id, 1);
    return;
  }
  const r = museRenown(w);
  if (r < MUSE_DRONES) return;
  shiftPull(w, loc.id, -2);
  // Where Muse has lost the street, it hardly bothers; where it owns it, it's keen.
  const e = enforcement(w, loc.id);
  if (r >= MUSE_LETTER && !m.lettered) {
    m.lettered = true;
    c.emit('muse', 'mixed', { variant: 'letter', place: loc.name });
    return;
  }
  // The smallest thing Muse sends, and the first: a drone or two to gas the crowd.
  if (rng.chance((r < MUSE_LETTER ? 0.25 : 0.15) * e)) {
    museDrones(c, skill);
    return;
  }
  if (r < MUSE_LETTER) return;
  const again = m.refused && m.offered !== undefined && w.legacy.runs - m.offered >= 2 && rng.chance(0.15);
  if (r >= MUSE_SCOUT && (m.offered === undefined || again)) {
    scout(c, r);
    return;
  }
  if (m.refused) {
    // A hijacked broadcast has Muse looking for her.
    const alert = (w.counters.muse_alert_until ?? -1) > w.clock ? 2 : 1;
    const hunted = r >= MUSE_STRIKE || !!m.detonated;
    // A commander with feelings calls some of it off.
    const soft = 1 / (1 + 0.5 * (m.encore?.flame ?? 0));
    if (hunted && !encoreTruce(w) && rng.chance(0.3 * e * alert * soft)) {
      inspirationStrike(c, 'set');
      return;
    }
    if (encoreActive(w) && !encoreTruce(w) && rng.chance(0.2 * e)) {
      encoreWatches(c);
      return;
    }
    if (rng.chance(0.3 * e)) {
      addHeat(w, 'npd', 2);
      c.emit('muse', 'bad', { variant: 'warrant', place: loc.name });
    }
    return;
  }
  if (!rng.chance(0.15 * e)) return;
  const h = w.hero;
  // Contraband first: unlicensed recordings are the worst kind of music.
  const tapes = h.inventory.findIndex((i) => i.tags.includes('contraband'));
  const axe = tapes >= 0 ? tapes : h.inventory.findIndex((i) => i.tags.includes('instrument'));
  if (axe >= 0 && rng.chance(tapes >= 0 ? 0.8 : 0.5)) {
    const [item] = h.inventory.splice(axe, 1);
    c.emit('muse', 'bad', { variant: 'confiscate', place: loc.name, item: item!.name });
  } else {
    const fine = Math.min(h.cash, 20 + Math.round(r / 2));
    h.cash -= fine;
    c.emit('muse', 'bad', { variant: 'fine', place: loc.name, amount: fine });
  }
}

/** The A&R scout, with a contract and a pen that's already uncapped. She signs or she doesn't. */
export function scout(c: Ctx, r: number = museRenown(c.w)): boolean {
  const { w, rng } = c;
  const m = file(w);
  const t = w.hero.personality.traits;
  m.offered = w.legacy.runs;
  const p = 0.35 + 0.45 * (t.greed - 0.5) + 0.3 * (t.fame - 0.5) + 0.2 * (t.vanity - 0.5) - 0.35 * (t.artistry - 0.5) - 0.3 * (t.justice - 0.5) - 0.2 * (t.mischief - 0.5);
  const advance = Math.min(2000, 150 + Math.round(r * 2));
  if (rng.chance(Math.max(0.05, Math.min(0.9, p)))) {
    m.signed = true;
    w.hero.cash += advance;
    w.hero.fame += 8;
    // The welcome pack: a Muse guitar, wired for broadcast, in an approved pastel.
    const axe = genInstrument(rng.fork('muse-guitar'), 4, 'electric');
    axe.inst!.jacked = Math.max(1, axe.inst!.jacked);
    axe.name = `Muse SafeSound signature ${INST_CLASSES.electric!.nouns[0]} (pastel, approved)`;
    w.hero.inventory.push(axe);
    c.emit('muse', 'good', { variant: 'signed', amount: advance });
    return true;
  }
  m.refused = (m.refused ?? 0) + 1;
  c.emit('muse', 'mixed', { variant: 'refused', amount: advance });
  return false;
}

// ===================================================================== Inspiration

/** How good the team is: as dangerous as the street, and more so the bigger she has got. */
export const strikeGrade = (w: World, here: number): number => Math.max(here, Math.min(70, 8 + (museRenown(w) - MUSE_STRIKE) / 15));

/** An Inspiration team arrives, plays the jingle, and opens fire. `at` is what found her: a set she played, or a booking. */
export function inspirationStrike(c: Ctx, at: 'set' | 'booking'): void {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId]!;
  const r = museRenown(w);
  const grade = strikeGrade(w, dangerOf(loc));
  const size = Math.min(5, 2 + Math.floor((r - MUSE_STRIKE) / 150));
  const team: Npc[] = [];
  // When it's personal, ENCORE leads it herself.
  const encore = encoreActive(w);
  if (encore) team.push(summonEncore(c, true));
  for (let i = team.length; i < size; i++) {
    const kind = i === 0 && r >= MUSE_STRIKE * 2 ? 'inspiration_lead' : 'inspiration_trooper';
    let id = `tmp_${w.beat}_${kind}_${i}`;
    for (let k = 1; w.npcs[id]; k++) id = `tmp_${w.beat}_${kind}_${i}_${k}`;
    const n = addNpc(w, spawnNpc(rng, id, kind, loc.id, { faction: 'muse', grade }));
    n.hostile = true;
    team.push(n);
  }
  c.emit('inspiration', 'bad', { variant: at, place: loc.name, count: team.length, npc: team[0]!.name, lead: team[0]!.archetype === 'inspiration_lead', encore });
  fight(c, team, { cause: 'an Inspiration strike', joiners: false });
  if (encore) settleEncore(c);
}

/** After a booked set: when she's too big to ignore, Muse read the poster too. */
export function museAtBooking(c: Ctx): void {
  const { w, rng } = c;
  if (museStanding(w) === 'hunted' && !encoreTruce(w) && rng.chance(0.3 * enforcement(w, w.hero.locationId))) inspirationStrike(c, 'booking');
}

/** Once a night: if Inspiration got her last time, Muse has posted about it. */
export function museTick(c: Ctx): void {
  const { w } = c;
  const m = w.legacy.muse;
  if (!m || w.counters.muse_tribute_checked) return;
  w.counters.muse_tribute_checked = 1;
  const last = w.legacy.deaths[w.legacy.deaths.length - 1];
  if (!last || !last.killers.includes('muse') || m.tributeFor === last.run) return;
  m.tributeFor = last.run;
  c.emit('muse', 'mixed', { variant: 'tribute' });
}

// ===================================================================== drones

/** Her chance to knock one drone out of the air before it fires: a shot, a thrown bottle, a well-aimed guitar. */
export function swatOdds(h: Ctx['w']['hero']): number {
  const aim = Math.max(synergy(h, ['marksmanship', ['stat:reflex', 0.5]]), synergy(h, ['throwing', ['stat:reflex', 0.5]]), 0.7 * synergy(h, ['melee', ['stat:reflex', 0.5]]));
  return Math.max(0.1, Math.min(0.85, 0.2 + 0.06 * aim + (h.weapon?.tags.includes('gun') ? 0.1 : 0)));
}

/** Her chance to pick the show back up afterwards, and make it the night people talk about. Harder through tear gas. */
export const recoveryOdds = (h: Ctx['w']['hero'], skill: string, gassed: boolean): number =>
  odds(0.15, 0.06, synergy(h, [skill as SkillId, ['music', 0.5], ['stat:charm', 0.4]])) - (gassed ? 0.15 : 0);

/**
 * UNAUTHORIZED ENTERTAINMENT DETECTED. A drone or two come in over the crowd, and the scene plays in three beats:
 *
 * 1. She gets a shot at them before they fire (`swatOdds`, per drone).
 * 2. Any still up gas the place: the crowd scatters (and won't be keen on that spot for a while), she gets a lungful, and
 *    then the drones left are hers to deal with.
 * 3. If she's still standing with the drones down, she can pick the show back up (`recoveryOdds`): the crowd comes back,
 *    and the night she shot a Muse drone out of the sky mid-song is the one they remember: fame, renown and fans, more of
 *    it the harder it was.
 */
export function museDrones(c: Ctx, skill: string): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const count = museRenown(w) >= MUSE_LETTER && rng.chance(0.5) ? 2 : 1;
  const drones: Npc[] = [];
  for (let i = 0; i < count; i++) {
    let id = `tmp_${w.beat}_muse_drone_${i}`;
    for (let k = 1; w.npcs[id]; k++) id = `tmp_${w.beat}_muse_drone_${i}_${k}`;
    const d = addNpc(w, spawnNpc(rng, id, 'muse_drone', loc.id, { faction: 'muse' }));
    d.hostile = true;
    drones.push(d);
  }
  c.emit('muse', 'bad', { variant: 'drones', place: loc.name, count });

  // 1. A shot at them before they fire.
  const p = swatOdds(h);
  let downed = 0;
  for (const d of drones) {
    if (!rng.chance(p)) continue;
    d.alive = false;
    d.hp = 0;
    downed++;
  }
  const left = drones.filter((d) => d.alive);
  if (downed) c.emit('muse_drones', 'good', { variant: left.length ? 'one' : 'all', place: loc.name, count: downed, left: left.length });

  // 2. Whatever is still up gasses the place, and then she has to deal with it.
  const scattered: Npc[] = [];
  if (left.length) {
    const out = w.locations[loc.tossTo] ? loc.tossTo : loc.exits.find((e) => !e.gate && w.locations[e.to])?.to;
    if (out && out !== loc.id) {
      for (const n of npcsAt(w, loc.id)) {
        if (!n.alive || n.hostile || n.tags.includes('owner') || n.tags.includes('robot') || h.companions.some((a) => a.npcId === n.id)) continue;
        moveNpc(w, n, out);
        scattered.push(n);
      }
    }
    const f = (loc.fatigue ??= {});
    f[skill] = (f[skill] ?? 0) + 0.5;
    h.hp = Math.max(1, h.hp - 3);
    h.buffs.push({ id: 'tear_gas', until: w.beat + 8, power: -2 });
    c.emit('muse_drones', 'bad', { variant: 'gas', place: loc.name, count: left.length, scattered: scattered.length, to: out ? w.locations[out]!.name : '' });
    const res = fight(c, left, { cause: 'a Muse noise-abatement drone', joiners: false });
    if (res !== 'win' || w.over || h.locationId !== loc.id) return;
  }

  // 3. The recovery.
  const gassed = left.length > 0;
  if (rng.chance(recoveryOdds(h, skill, gassed))) {
    for (const n of scattered) if (n.alive && !n.hostile) moveNpc(w, n, loc.id);
    if (gassed && loc.fatigue?.[skill]) loc.fatigue[skill] = Math.max(0, loc.fatigue[skill]! - 0.5);
    const gain = (gassed ? 3 : 2) + downed;
    h.fame += gain;
    addRenown(w, skill, gain);
    loc.fans = (loc.fans ?? 0) + (gassed ? 6 : 4) + 2 * downed;
    train(c, skill as SkillId, 2);
    c.emit('muse_recovery', 'good', { variant: gassed ? 'gassed' : 'clean', place: loc.name, back: scattered.length, fame: gain, skill: SKILLS[skill as SkillId]?.label ?? skill });
  } else {
    c.emit('muse_recovery', 'mixed', { variant: 'lost', place: loc.name });
  }
}
