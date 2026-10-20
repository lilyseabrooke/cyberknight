import type { Ctx, Flight, World } from './types';
import type { Candidate } from './candidate';
import { addHeat } from './combat';
import { skillValue, train } from './skills';
import { fameFrom } from './stage';
import { bestTrait, hasInstrument } from './instruments';
import { flightModel } from './dragonmodels';
import { concluded, engage, finish, refuse, spotted, takeOff } from './dragons';

/**
 * Out-playing dragons. Every dragon broadcasts something cheerful and wrong (Atlas licenses it from Muse), and every family
 * has one thing a guitar can do about it. No level gates: anyone with a guitar can try anything, and the odds are her guitar
 * against the dragon's grade (`dragonSongOdds`), so a Hermes Mk. I is a party trick, a Mk. III is a real feat, and a
 * beginner who plugs in under a Hera Mk. V is vaporized.
 *
 * | family    | the play | if it lands | if it doesn't |
 * |---|---|---|---|
 * | artemis   | a decoy riff that spoofs its scanner | it loses her | it finds her |
 * | hermes    | its own delivery chime | it lands, thinking she's the address: catchable, even a Mk. III | it's off |
 * | demeter   | play over its harvest jingle | it announces her show instead of the tithe, and moves on | a refusal |
 * | ares      | a power riff to feed its appetite for violence | sated, it moves on somewhere else | it takes it personally |
 * | apollo    | CINDERJAW's old lockdown signal, played back at it | it drifts on | it remembers her |
 * | hera      | play to it | it lingers to listen, and goes | it vaporizes her |
 *
 * Once per flight. It lands as a performance: fame and renown for guitar, and everybody filmed it.
 */

/** Her guitar against its grade: about even when she's as good as it is dangerous, and a trait or two in her hands helps. */
export function dragonSongOdds(w: World, f: Flight): number {
  const h = w.hero;
  const grade = Math.max(...f.ids.map((id) => w.npcs[id]?.level ?? 1));
  const gear = bestTrait(h, 'guitar', 'volume') + bestTrait(h, 'guitar', 'jacked') + (bestTrait(h, 'guitar', 'resonance') && hasDragonResonance(w) ? 2 : 0);
  return Math.max(0.02, Math.min(0.9, 0.45 + 0.03 * (skillValue(h, 'guitar') - grade) + 0.04 * gear));
}

const hasDragonResonance = (w: World): boolean =>
  [...w.hero.inventory, ...(w.hero.weapon ? [w.hero.weapon] : [])].some((i) => i.inst?.resonance && i.inst.resonates === 'dragon');

export function dragonSongCandidate(w: World, f: Flight): Candidate | null {
  if (!hasInstrument(w.hero) || f.hidden || w.counters[`dragonsong:${f.ids[0]}`]) return null;
  // A demand is on the table for a Demeter; the others have to be in her face and not yet onto her.
  if (f.kind === 'demeter' ? f.phase !== 'demand' : f.noticed) return null;
  if (f.kind === 'hermes' && f.phase) return null;
  const grim = f.kind === 'hera';
  return {
    // The more of a guitarist she is, the more it appeals (a Hera's risk keeps all but the reckless honest).
    key: `dragon_song:${f.kind}`, drives: { pride: 0.9, bravery: 0.4, curiosity: 0.4 },
    bonus: 0.3 + 0.8 * Math.min(1, skillValue(w.hero, 'guitar') / 30) + (f.kind === 'demeter' ? 0.3 : 0), risk: grim ? 3 : 0.8,
    intent: { kind: f.kind, mark: flightModel(f).mark }, run: (c) => dragonSong(c, f),
  };
}

export function dragonSong(c: Ctx, f: Flight): boolean {
  const { w, rng } = c;
  const m = flightModel(f);
  w.counters[`dragonsong:${f.ids[0]}`] = 1;
  w.flight = f;
  const data = { variant: f.kind, mark: m.mark, cargo: f.cargo ?? '', place: w.locations[w.hero.locationId]!.name };
  if (!rng.chance(dragonSongOdds(w, f))) {
    train(c, 'guitar', 1);
    c.emit('dragon_song', 'bad', { ...data, variant: `${f.kind}_fail` });
    switch (f.kind) {
      case 'demeter': refuse(c, 'refuse'); break;
      case 'hermes': if (f.roam) takeOff(c, f, m); break;
      case 'hera': engage(c, 'playing guitar at a Hera Mk. V'); break;
      default: spotted(c);
    }
    return false;
  }
  const gain = fameFrom(c, 2 + m.mark, 'dragon_song');
  train(c, 'guitar', 2 + m.mark);
  c.emit('dragon_song', 'good', { ...data, fame: Math.round(gain * 10) / 10 });
  switch (f.kind) {
    case 'artemis': f.hidden = true; break;
    case 'hermes': engage(c, 'a courier that thought she was the address'); break;
    case 'demeter': addHeat(w, 'atlas', 2); concluded(c, f); break;
    case 'ares': case 'apollo': addHeat(w, 'atlas', 1); if (f.roam) takeOff(c, f, m); break;
    case 'hera': finish(c, f, false); break;
  }
  return true;
}

