import type { Ctx, MuseFile, World } from './types';
import type { GameEvent } from './events';
import { addHeat } from './combat';
import { SKILLS, type SkillId } from './content/skills';
import { audience } from './renown';
import { INST_CLASSES, genInstrument } from './instruments';

/**
 * Muse: Neo's entertainment conglomerate. Every channel, all the music, and the say over what music is allowed (Muse's).
 * See docs/setting/factions.md.
 *
 * Non-Muse music is technically illegal, and nobody cares about a busker. Muse only notices once someone is big enough,
 * and its attention climbs with her renown as a performer (`legacy.renown`), which outlives her, so Muse's file on her
 * does too (`legacy.muse`):
 *
 * - **a local name**: the Muse Clearance letter, then Clearance officers turning up at her sets (fines; a guitar taken
 *   "for safekeeping").
 * - **trending**: the Muse A&R scout and a contract. She signs or she doesn't, by her nature. Muse isn't Atlas: signing
 *   is allowed, pays, and makes the officers go away. The contract survives her death.
 * - **she said no**: the legal route. Muse files, the NPD serves, at her gigs.
 *
 * Inspiration teams (the strike squads) are the next rung up and aren't built yet.
 */

const PERFORMING = ['guitar', 'vocals', 'djing', 'beatbox'];
/** Renown at which Muse writes. */
export const MUSE_LETTER = 15;
/** Renown at which Muse sends a scout. */
export const MUSE_SCOUT = 60;

/** How much of a performer Neo thinks she is, across every performing skill. */
export const museRenown = (w: World): number => PERFORMING.reduce((n, s) => n + (w.legacy.renown?.[s] ?? 0), 0);

const file = (w: World): MuseFile => (w.legacy.muse ??= {});

/** Muse's view of her, as a word. */
export function museStanding(w: World): 'nobody' | 'local' | 'trending' | 'refused' | 'signed' {
  const m = w.legacy.muse;
  if (m?.signed) return 'signed';
  if (m?.refused) return 'refused';
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
  if (m.signed) return;
  const r = museRenown(w);
  if (r < MUSE_LETTER) return;
  if (!m.lettered) {
    m.lettered = true;
    c.emit('muse', 'mixed', { variant: 'letter', place: loc.name });
    return;
  }
  const again = m.refused && m.offered !== undefined && w.legacy.runs - m.offered >= 2 && rng.chance(0.15);
  if (r >= MUSE_SCOUT && (m.offered === undefined || again)) {
    scout(c, r);
    return;
  }
  if (m.refused) {
    if (rng.chance(0.3)) {
      addHeat(w, 'npd', 2);
      c.emit('muse', 'bad', { variant: 'warrant', place: loc.name });
    }
    return;
  }
  if (!rng.chance(0.15)) return;
  const h = w.hero;
  const axe = h.inventory.findIndex((i) => i.tags.includes('instrument'));
  if (axe >= 0 && rng.chance(0.5)) {
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
