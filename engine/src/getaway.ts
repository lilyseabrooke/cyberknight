import type { Candidate } from './candidate';
import type { Ctx, Id, Location, Npc, World } from './types';
import { AWAY, moveNpc } from './population';
import { fight } from './combat';
import { paceOf } from './cars';
import { runChase, type Chaser } from './chase';
import { runsDown } from './dragonmodels';
import { hasGoal } from './mind';
import { isHunted } from './pursuit';
import { hasBounty, knowsBounty } from './bounty';
import { parkedVehicle } from './roads';
import { boardParty, ownedHere } from './vehicles';
import { train } from './skills';

/**
 * Getting away in a car, and going after somebody who has. A foe who has the key to a car close by and thinks it is about to die takes
 * the car and goes (tactics.ts); this is what comes after. They are gone down the road, and for a beat or two she can go after them:
 * in her own car if she has one (a proper chase, with her as the pursuer), or on her own legs (`runsDown`, in dragonmodels.ts, which is
 * the one place her own speed plugs in when it gets better). Catching one is a fight with nowhere left to run; losing one means
 * they are away for a while and have opinions.
 */

/** How many beats after somebody drives off she can still go after them. */
export const GETAWAY_BEATS = 2;

/** The people who got away by car at the end of a fight, and the cars they took. Called by `fight`. */
export function registerGetaways(c: Ctx, loc: Location, list: { npc: Npc; carId: string }[]): void {
  const { w } = c;
  w.getaways = (w.getaways ?? []).filter((g) => w.beat - g.beat <= GETAWAY_BEATS);
  for (const { npc, carId } of list) {
    const stray = w.strays?.[loc.id];
    const parked = parkedVehicle(w, loc);
    const car = stray?.id === carId ? stray : parked?.id === carId ? parked : undefined;
    if (!car) continue;
    // The car is theirs now, and gone from the street.
    w.flags[`stolen:${loc.id}`] = true;
    if (w.strays?.[loc.id]) delete w.strays[loc.id];
    moveNpc(w, npc, AWAY);
    w.getaways.push({ npcId: npc.id, vehicle: { ...car, riders: [] }, from: loc.id, beat: w.beat });
    c.emit('getaway', 'mixed', { foe: npc.name, role: npc.role, car: car.name, body: car.body, kind: car.kind, place: loc.name });
  }
}

/** Does she want them dead: a kill goal, a hunt, or a job. These are the ones she most wants to catch. */
export function wantedDead(w: World, n: Npc): boolean {
  return hasGoal(w, 'kill', n.id) || isHunted(w, n.id) || Object.values(w.npcs).some((g) => g.quest?.state === 'open' && g.quest.kind === 'flatline' && g.quest.target === n.id);
}

export function getawayCandidates(w: World): Candidate[] {
  const h = w.hero;
  const out: Candidate[] = [];
  for (const g of w.getaways ?? []) {
    const n = w.npcs[g.npcId];
    if (!n || !n.alive || g.from !== h.locationId || w.beat - g.beat > GETAWAY_BEATS) continue;
    const loc = w.locations[h.locationId]!;
    const wheels = !!h.vehicle || !!ownedHere(w, loc);
    // On foot she has only her legs: for now that does not get anybody anywhere, but it is the same question the day it does.
    const viable = wheels || runsDown(w, paceOf(g.vehicle));
    const want = wantedDead(w, n);
    const paper = hasBounty(n) && knowsBounty(w, n.id) ? Math.min(1.2, n.bounty.amount / 250) : 0;
    out.push({
      key: `pursue:${n.id}`,
      drives: { bravery: 0.8, pride: 0.6, greed: paper ? 0.5 : 0.1, quest: want ? 1.0 : 0 },
      bonus: 0.3 + (want ? 1.6 : 0) + paper + (viable ? 0.4 : -1.2),
      smart: want && viable ? 1.0 : 0,
      risk: 0.5,
      run: (c) => pursue(c, g.npcId),
    });
  }
  return out;
}

function pursue(c: Ctx, npcId: Id): void {
  const { w } = c;
  const h = w.hero;
  const g = (w.getaways ?? []).find((x) => x.npcId === npcId);
  const n = w.npcs[npcId];
  if (!g || !n) return;
  w.getaways = w.getaways!.filter((x) => x !== g);
  const loc = w.locations[h.locationId]!;
  const car = g.vehicle;
  // Her own car, if it is close by, is the way to do it.
  const mine = !h.vehicle ? ownedHere(w, loc) : undefined;
  if (mine) {
    const { at: _at, until: _until, ...own } = mine;
    h.vehicle = { ...own, riders: [] };
    h.parked = (h.parked ?? []).filter((p) => p !== mine);
    c.emit('vehicle', 'good', { variant: 'back', car: mine.name, body: mine.body, place: loc.name });
    boardParty(c, h.vehicle, loc);
  }
  c.emit('give_chase', 'mixed', { variant: h.vehicle ? 'start' : 'foot', foe: n.name, car: car.name, body: h.vehicle?.body ?? 'car', hers: h.vehicle?.name ?? '' });

  let caught = false;
  if (h.vehicle && h.vehicle.hp > 0) {
    const chaser: Chaser = { name: n.name, crew: [n], car: { id: car.id, body: car.body, kind: car.kind, name: car.name, hp: car.hp, maxHp: car.maxHp, armor: car.armor }, pace: paceOf(car), gap: 6, alive: true };
    const result = runChase(c, { mode: 'pursuer', cause: `going after ${n.name}`, foes: [chaser] });
    if (w.over) return;
    caught = result === 'caught';
    if (!caught && result !== 'won') c.emit('give_chase', 'bad', { variant: 'lost', foe: n.name });
  } else {
    // On her own two feet.
    train(c, 'athletics', 1);
    caught = runsDown(w, paceOf(car));
    w.clock += 3;
    c.emit('give_chase', caught ? 'good' : 'bad', { variant: caught ? 'foot_caught' : 'foot_lost', foe: n.name, car: car.name });
  }
  if (caught && !w.over) corner(c, n);
}

/** They are run down, with nowhere left to go: a fight, and one they can't drive away from. */
function corner(c: Ctx, n: Npc): void {
  const { w } = c;
  const h = w.hero;
  moveNpc(w, n, h.locationId);
  n.hostile = true;
  n.downUntil = 0;
  n.flags.push('cornered');
  c.emit('give_chase', 'good', { variant: 'cornered', foe: n.name });
  fight(c, [n], { cause: `running down ${n.name}`, joiners: false });
  n.flags = n.flags.filter((f) => f !== 'cornered');
}

