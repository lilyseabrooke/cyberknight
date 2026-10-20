import type { Ctx, Id, World } from './types';
import type { Candidate } from './candidate';
import { fight, here } from './combat';
import { addNpc } from './population';
import { spawnNpc } from './content/archetypes';
import { dangerOf } from './grade';
import { Rng } from './rng';
import { odds, synergy, train } from './skills';
import { fameFrom } from './stage';
import { bestTrait } from './instruments';
import { museStanding } from './muse';

/**
 * The underground. Her music is illegal (Muse says so), and once Muse has noticed her a scene grows around it:
 *
 * - **Secret shows** (bookings.ts, kind `secret`): a cellar, a back unit, the Halo's basement. They book lower than a club,
 *   pay less, and Muse never hears about them. They win fans who tell everyone, and somebody was recording.
 * - **Bootleg tapes**: contraband. She hands boxes out where there's a crowd (fans and renown where they land), or sells
 *   them to a fence. Muse Clearance confiscates them before anything else.
 * - **Pirate towers**: Muse Broadcast relay masts on some streets, guarded by Muse technicians (or, once she's too big to
 *   ignore, an Inspiration team). She takes one by winning the fight and rewiring it (tinkering; a jacked guitar
 *   helps). Each night a tower she holds plays her to its neighbourhood (fans there grow), and each night Muse may take it
 *   back. A tower inside the cordon is somewhere she can reach the whole district from (cordon.ts).
 */

/** Does this street have a Muse relay mast on it? A tenth of the generated streets do; fixed by the world, not the night. */
export const hasMast = (w: World, id: Id): boolean => {
  const loc = w.locations[id];
  return !!loc && loc.kind === 'street' && !!loc.gen && new Rng(`mast:${w.worldSeed}:${id}`).chance(0.1);
};

export const towersHeld = (w: World): Id[] => Object.keys(w.legacy.muse?.towers ?? {}).filter((id) => w.locations[id]);

/** Muse has noticed her and she hasn't signed: the underground is hers to use. */
const outlaw = (w: World): boolean => !!w.legacy.muse?.lettered && !w.legacy.muse.signed;

export function undergroundCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  // ---- hand out bootlegs where there's a crowd
  const tapes = h.inventory.find((i) => i.tags.includes('contraband') && i.tags.includes('record'));
  if (tapes && (loc.crowded || here(w).filter((n) => n.alive && !n.hostile).length >= 3)) {
    out.push({ key: 'hand_out_tapes', drives: { pride: 0.6, curiosity: 0.3 }, bonus: 0.2, risk: 0.1, intent: { place: loc.name }, run: (c) => handOutTapes(c) });
  }
  // ---- take a relay mast for pirate radio
  if (outlaw(w) && hasMast(w, loc.id) && !w.legacy.muse?.towers?.[loc.id] && !w.counters[`tower_tried:${loc.id}`]) {
    const hunted = museStanding(w) === 'hunted' || museStanding(w) === 'refused';
    out.push({ key: `take_tower:${loc.id}`, drives: { bravery: 0.6, curiosity: 0.4, pride: 0.4 }, bonus: 0.3 + (hunted ? 0.5 : 0), risk: 0.5, intent: { place: loc.name }, run: (c) => takeTower(c, loc.id) });
  }
  return out;
}

export function handOutTapes(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  const i = h.inventory.findIndex((x) => x.tags.includes('contraband') && x.tags.includes('record'));
  if (i < 0) return;
  h.inventory.splice(i, 1);
  const loc = w.locations[h.locationId]!;
  loc.fans = (loc.fans ?? 0) + 8;
  const gain = fameFrom(c, 1, 'hand_out_tapes');
  c.emit('hand_out_tapes', 'good', { place: loc.name, fame: Math.round(gain * 10) / 10 });
}

/** The mast's guards: technicians, or an Inspiration team once she's too big to ignore. */
function towerGuards(c: Ctx, at: Id) {
  const { w, rng } = c;
  const kind = museStanding(w) === 'hunted' ? 'inspiration_trooper' : 'muse_tech';
  const grade = dangerOf(w.locations[at]);
  return [0, 1].map((i) => {
    let id = `tmp_${w.beat}_${kind}_${i}`;
    for (let k = 1; w.npcs[id]; k++) id = `tmp_${w.beat}_${kind}_${i}_${k}`;
    const n = addNpc(w, spawnNpc(rng, id, kind, at, { faction: 'muse', grade }));
    n.hostile = true;
    return n;
  });
}

export function takeTower(c: Ctx, at: Id): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[at]!;
  w.counters[`tower_tried:${at}`] = 1;
  const guards = towerGuards(c, at);
  c.emit('take_tower', 'mixed', { variant: 'guarded', place: loc.name, count: guards.length, npc: guards[0]!.name });
  const res = fight(c, guards, { cause: 'a Muse relay mast', joiners: false });
  if (res !== 'win' || w.over) return;
  const p = odds(0.3, 0.06, synergy(h, ['tinkering', ['stat:int', 0.5]])) + 0.15 * bestTrait(h, 'guitar', 'jacked');
  train(c, 'tinkering', 2);
  if (rng.chance(p)) {
    ((w.legacy.muse ??= {}).towers ??= {})[at] = w.legacy.runs;
    loc.fans = (loc.fans ?? 0) + 10;
    c.emit('take_tower', 'good', { variant: 'taken', place: loc.name });
  } else {
    c.emit('take_tower', 'bad', { variant: 'rewire', place: loc.name });
  }
}

/** Once a night: every tower she holds plays her to its neighbourhood, and Muse tries to take them back. */
export function towersTick(c: Ctx): void {
  const { w, rng } = c;
  const held = towersHeld(w);
  if (!held.length || w.counters.towers_aired) return;
  w.counters.towers_aired = 1;
  const standing = museStanding(w);
  const retake = standing === 'hunted' ? 0.3 : standing === 'refused' ? 0.2 : standing === 'signed' ? 1 : 0.1;
  const lost: string[] = [];
  for (const id of held) {
    const loc = w.locations[id]!;
    if (rng.chance(retake)) {
      delete w.legacy.muse!.towers![id];
      lost.push(loc.name);
      continue;
    }
    loc.fans = (loc.fans ?? 0) + 6;
  }
  const kept = held.length - lost.length;
  if (kept) c.emit('pirate_radio', 'good', { variant: 'air', count: kept });
  for (const name of lost) c.emit('pirate_radio', 'bad', { variant: 'lost', place: name });
}
