import type { Ctx, Flight, Id, World } from './types';
import type { Candidate } from './candidate';
import { addHeat } from './combat';
import { liftCordon } from './mapgen';
import { START_DEPTH } from './grade';
import { AWAY, moveNpc } from './population';
import { Rng } from './rng';
import { odds, synergy, train } from './skills';
import { fameFrom } from './stage';
import { fansWhere } from './renown';
import { bestTrait, hasInstrument } from './instruments';
import { rollTemper } from './dragonmodels';

/**
 * The cordon, torn down. Every way past the starting district's lockdown removes it for good (`liftCordon`); killing
 * CINDERJAW is one. This is guitar's: with enough fans in the district, a guitar and a way to reach them all at once
 * (the Overpass's own PA, or a hijacked billboard), she plays the anthem and on the drop of the chorus her fans tear the
 * barriers down at every exit at once. A lockdown can't hold a district that has decided it isn't locked down.
 *
 * CINDERJAW, with nothing left to guard, leaves: it lifts off the Overpass and roams Neo past where the cordon was, a
 * persistent dragon (`Flight.persist`) she can meet again on the far side. Killing it later is still a kill.
 *
 * A set that doesn't land brings nothing down: the crowd goes home, and some of them stop being fans. She can try again,
 * on another night, once she's earned them back.
 */

/** The hand-built district and the streets of the starting district that grew round it. */
export const inStartDistrict = (w: Pick<World, 'locations'>, id: Id): boolean => {
  const loc = w.locations[id];
  return !!loc && (!loc.gen || loc.gen.depth <= START_DEPTH);
};

/** Her fans inside the cordon. */
export const districtFans = (w: World): number => fansWhere(w, (l) => !l.gen || l.gen.depth <= START_DEPTH);

/** Fans it takes: enough people at every exit to pull a barrier down. */
export const TEARDOWN_FANS = 150;

/** Where she can reach them all at once: the Overpass's PA, a billboard, or a pirate tower of hers inside the cordon. */
export function teardownStage(w: World, id: Id): boolean {
  return id === 'overpass' || Object.values(w.features).some((f) => f.kind === 'billboard' && f.locationId === id) || (!!w.legacy.muse?.towers?.[id] && inStartDistrict(w, id));
}

/** The places she'd play it from, if she knows them. */
export function teardownVenue(w: World): Id | null {
  if (!teardownReady(w)) return null;
  const billboard = Object.values(w.features).find((f) => f.kind === 'billboard' && (w.locations[f.locationId]?.visits ?? 0) > 0);
  return billboard?.locationId ?? ((w.locations.overpass?.visits ?? 0) > 0 ? 'overpass' : null);
}

/** Everything but the place: the cordon is up, the fans are there, she has a guitar, and she hasn't tried tonight. */
export const teardownReady = (w: World): boolean =>
  w.legacy.gate !== 'open' && !w.counters.teardown_tried && hasInstrument(w.hero) && districtFans(w) >= TEARDOWN_FANS;

export function teardownCandidate(w: World): Candidate | null {
  if (!teardownReady(w) || !teardownStage(w, w.hero.locationId)) return null;
  return { key: 'cordon_teardown', drives: { pride: 1.0, bravery: 0.5, curiosity: 0.3 }, bonus: 1.4, risk: 0.3, intent: { place: w.locations[w.hero.locationId]!.name }, run: teardown };
}

export function teardownOdds(w: World): number {
  const h = w.hero;
  const fans = districtFans(w);
  return odds(0.15, 0.06, synergy(h, ['guitar', ['music', 0.5], ['stat:charm', 0.5]]))
    + Math.min(0.25, (fans - TEARDOWN_FANS) / 600) + 0.08 * bestTrait(h, 'guitar', 'volume') + 0.08 * bestTrait(h, 'guitar', 'jacked');
}

export function teardown(c: Ctx): void {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId]!;
  w.counters.teardown_tried = 1;
  const fans = districtFans(w);
  const exits = Object.values(w.locations).filter((l) => l.gen?.cordon).length;
  if (rng.chance(Math.min(0.95, teardownOdds(w)))) {
    liftCordon(w);
    // They were there. They'll be telling people for the rest of their lives.
    for (const l of Object.values(w.locations)) if (l.fans && inStartDistrict(w, l.id)) l.fans *= 1.1;
    const gain = fameFrom(c, 10, 'cordon_teardown');
    addHeat(w, 'atlas', 3);
    train(c, 'guitar', 6);
    c.emit('cordon_teardown', 'good', { place: loc.name, amount: Math.round(fans), exits, fame: Math.round(gain) });
    cinderjawLeaves(c);
  } else {
    for (const l of Object.values(w.locations)) if (l.fans && inStartDistrict(w, l.id)) l.fans *= 0.8;
    train(c, 'guitar', 2);
    c.emit('cordon_teardown', 'bad', { place: loc.name, amount: Math.round(fans), exits });
  }
}

/** Nothing left to guard: CINDERJAW takes off, and from now on it roams Neo past where the cordon was. */
export function cinderjawLeaves(c: Ctx): void {
  const { w } = c;
  const cj = w.npcs.dragon;
  if (!cj?.alive || w.flights.some((f) => f.ids.includes(cj.id))) return;
  const f: Flight = {
    kind: 'apollo', ids: [cj.id], locationId: cj.locationId, until: w.beat + 100000, hidden: false, noticed: false, born: w.beat, clock: w.clock, persist: true,
    temper: rollTemper(new Rng(`temper:${w.worldSeed}:${cj.id}`), 'apollo'),
    roam: { stage: 'away', district: [], entry: cj.locationId, nextAt: w.clock, until: w.clock, visited: [], goals: [], lastHit: w.clock, raided: [], away: 0, returnAt: w.clock + 240, tended: w.clock },
  };
  moveNpc(w, cj, AWAY);
  w.flights.push(f);
  c.emit('cinderjaw_leaves', 'mixed', { npc: cj.name });
}
