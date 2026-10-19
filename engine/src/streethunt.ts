import type { Ctx, Npc } from './types';
import { dist, passable, type Pos } from './grid';
import { fight, relocate } from './combat';
import { onFoot, runChase } from './chase';
import { enterStealth, lose } from './stealth';
import { placeOf, syncPlace } from './placeboard';
import { addTire } from './tracking';
import { prowlRoom, type ProwlOpts } from './prowl';

/**
 * They are looking for her and don't know where she is: Alert, no fix. It plays on the street's own board, her sneaking for a way
 * off it while they search. If she gets out, they are left looking at an empty street; if one of them spots her it is a chase when
 * she's got room to run, or a fight when she hasn't.
 */
export function streetHunt(c: Ctx, crew: Npc[], cause: string, opts: { keepSpot?: boolean } = {}): 'evaded' | 'chased' | 'fought' | 'stalled' {
  const { w } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  if (!placeOf(w, loc)) {
    fight(c, crew, { cause, joiners: false });
    return 'fought';
  }
  enterStealth(c);
  for (const n of crew) lose(w, n);
  const p = placeOf(w, loc)!;
  syncPlace(w, p);
  // She is at her work somewhere along the street, not standing in a doorway.
  if (!opts.keepSpot) {
    const g = p.layout.grid;
    const ways = p.layout.doors.filter((d) => !d.via).map((d) => d.at);
    const spots: Pos[] = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const q = { x, y };
      if (!passable(g, x, y) || Object.values(p.board.ents).some((e) => e.x === x && e.y === y)) continue;
      if (ways.every((a) => dist(a, q) >= 6)) spots.push(q);
    }
    if (spots.length) p.board.hero = { ...spots[c.rng.int(0, spots.length - 1)]! };
  }
  const o: ProwlOpts = { goal: 'leave', hunt: true, track: true, describe: (f) => (f.length === 1 ? 'one of them' : `${f.length} of them`) };
  const out = prowlRoom(c, null as never, loc, crew, o);
  addTire(w, 1);
  if (w.over) return 'fought';
  if (out === 'evaded') {
    if (o.left) relocate(w, o.left);
    return 'evaded';
  }
  if (out !== 'detected') return 'stalled';
  const live = crew.filter((n) => n.alive);
  const gap = Math.min(...live.map((n) => dist(p.board.ents[n.id] ?? p.board.hero, p.board.hero)));
  if (live.length && gap >= 4 && h.hp > 0) {
    const result = runChase(c, { mode: 'pursued', cause, foes: live.map((n) => onFoot(n, gap / 2.2)) });
    if (w.over) return 'chased';
    if (result === 'caught' || result === 'bailed' || result === 'wrecked') {
      const left = live.filter((n) => n.alive);
      if (left.length && h.hp > 0) fight(c, left, { cause, joiners: false });
    }
    return 'chased';
  }
  if (live.length && h.hp > 0) fight(c, live, { cause, joiners: false });
  return 'fought';
}
