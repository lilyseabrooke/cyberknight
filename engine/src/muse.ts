import type { Ctx, MuseFile, Npc, World } from './types';
import type { GameEvent } from './events';
import { addHeat, fight } from './combat';
import { addNpc, moveNpc, npcsAt } from './population';
import { spawnNpc } from './content/archetypes';
import { dangerOf } from './grade';
import { SKILLS, type SkillId } from './content/skills';
import { audience } from './renown';
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
  if (m?.refused) return museRenown(w) >= MUSE_STRIKE ? 'hunted' : 'refused';
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
  // A secret show is secret: Muse doesn't hear about it.
  if (w.legacy.bookings?.some((b) => b.kind === 'secret' && b.loc === loc.id && b.night === w.legacy.runs)) return;
  const m = file(w);
  if (m.signed) return;
  const r = museRenown(w);
  if (r < MUSE_DRONES) return;
  if (r >= MUSE_LETTER && !m.lettered) {
    m.lettered = true;
    c.emit('muse', 'mixed', { variant: 'letter', place: loc.name });
    return;
  }
  // The smallest thing Muse sends, and the first: a drone or two to gas the crowd.
  if (rng.chance(r < MUSE_LETTER ? 0.25 : 0.15)) {
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
    if (r >= MUSE_STRIKE && rng.chance(0.3)) {
      inspirationStrike(c, 'set');
      return;
    }
    if (rng.chance(0.3)) {
      addHeat(w, 'npd', 2);
      c.emit('muse', 'bad', { variant: 'warrant', place: loc.name });
    }
    return;
  }
  if (!rng.chance(0.15)) return;
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
  for (let i = 0; i < size; i++) {
    const kind = i === 0 && r >= MUSE_STRIKE * 2 ? 'inspiration_lead' : 'inspiration_trooper';
    let id = `tmp_${w.beat}_${kind}_${i}`;
    for (let k = 1; w.npcs[id]; k++) id = `tmp_${w.beat}_${kind}_${i}_${k}`;
    const n = addNpc(w, spawnNpc(rng, id, kind, loc.id, { faction: 'muse', grade }));
    n.hostile = true;
    team.push(n);
  }
  c.emit('inspiration', 'bad', { variant: at, place: loc.name, count: team.length, npc: team[0]!.name, lead: team[0]!.archetype === 'inspiration_lead' });
  fight(c, team, { cause: 'an Inspiration strike', joiners: false });
}

/** After a booked set: when she's too big to ignore, Muse read the poster too. */
export function museAtBooking(c: Ctx): void {
  const { w, rng } = c;
  if (museStanding(w) === 'hunted' && rng.chance(0.3)) inspirationStrike(c, 'booking');
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

/**
 * UNAUTHORIZED ENTERTAINMENT DETECTED. A drone or two gas the place: the crowd scatters (and won't be keen on that spot for a
 * while), Blackbird gets a lungful, and then the drones are hers to deal with.
 */
export function museDrones(c: Ctx, skill: string): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const out = w.locations[loc.tossTo] ? loc.tossTo : loc.exits.find((e) => !e.gate && w.locations[e.to])?.to;
  let scattered = 0;
  if (out && out !== loc.id) {
    for (const n of npcsAt(w, loc.id)) {
      if (!n.alive || n.hostile || n.tags.includes('owner') || n.tags.includes('robot') || h.companions.some((a) => a.npcId === n.id)) continue;
      moveNpc(w, n, out);
      scattered++;
    }
  }
  const f = (loc.fatigue ??= {});
  f[skill] = (f[skill] ?? 0) + 0.5;
  h.hp = Math.max(1, h.hp - 3);
  h.buffs.push({ id: 'tear_gas', until: w.beat + 8, power: -2 });
  const count = museRenown(w) >= MUSE_LETTER && rng.chance(0.5) ? 2 : 1;
  const drones: Npc[] = [];
  for (let i = 0; i < count; i++) {
    let id = `tmp_${w.beat}_muse_drone_${i}`;
    for (let k = 1; w.npcs[id]; k++) id = `tmp_${w.beat}_muse_drone_${i}_${k}`;
    const d = addNpc(w, spawnNpc(rng, id, 'muse_drone', loc.id, { faction: 'muse' }));
    d.hostile = true;
    drones.push(d);
  }
  c.emit('muse', 'bad', { variant: 'drones', place: loc.name, count, scattered, to: out ? w.locations[out]!.name : '' });
  fight(c, drones, { cause: 'a Muse noise-abatement drone', joiners: false });
}
