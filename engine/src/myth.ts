import type { Ctx, Dungeon, Id, Location, World } from './types';
import { spawnGroup, type Candidate } from './candidate';
import { fight } from './combat';
import { npcsAt } from './population';
import { routeTo } from './plans';
import { skillValue, train } from './skills';
import { block, streetOf } from './renown';
import { localFans } from './fans';
import { bestTrait, hasInstrument } from './instruments';
import { checkCleared, ensureDungeon, garrisonAlive, isEntrance } from './dungeons';
import { shiftPull } from './musescene';
import { songbook } from './songs';
import { fameFrom } from './stage';

/**
 * The myth tier: the things people tell each other about for years. Each is a guitar roll against a very high bar
 * (`mythOdds`, about even at a grade of 70) in the right circumstances, and none is gated: a beginner can try, and
 * fail, usually expensively. They repeat whenever the circumstances line up, each time for less (`legacy.legends`), and
 * each one changes the city for a while, not just her fame:
 *
 * - **The storm solo** (acid rain, somewhere high): the lightning picks the right building. A blackout, and the nearest
 *   Atlas outpost's machines are fried.
 * - **The riot** (a lot of fans, Atlas nearby): the block boils over for the night. Atlas and the police stay out, Atlas
 *   heat is wiped, and the shops on the block are looted, including ones she likes.
 * - **The march** (the night of a riot, an Atlas outpost in reach): she leads the crowd there, still playing, and it falls.
 * - **It charts** (a broadcast hijack while she's enormous): Muse's clearance system approves her song by accident, and
 *   every dragon's loudspeaker plays it for a few nights.
 * - **Down with the police** (fans, and the police on her): the streets around go to anarchy for a couple of days. No
 *   police, no police heat for her there, more gangers and muggings. (Anarchy will be fleshed out later.)
 */

/** Her guitar against the myth bar. */
export const MYTH_GRADE = 70;
export function mythOdds(w: World, edge = 0): number {
  const h = w.hero;
  return Math.max(0.02, Math.min(0.85, 0.45 + 0.03 * (skillValue(h, 'guitar') - MYTH_GRADE) + 0.04 * bestTrait(h, 'guitar', 'volume') + edge));
}

/** What a repeat is worth: the first time is a legend, the fifth is a Tuesday. */
export const encoreWorth = (w: World, kind: string): number => 0.6 ** (w.legacy.legends?.[kind] ?? 0);
function legend(w: World, kind: string): void {
  const l = (w.legacy.legends ??= {});
  l[kind] = (l[kind] ?? 0) + 1;
}

// ===================================================================== states on the map

const streetIs = (w: World, locId: Id, key: 'riotUntil' | 'anarchyUntil'): boolean => {
  const loc = w.locations[locId];
  return !!loc && (streetOf(w, loc)[key] ?? -1) > w.clock;
};
export const riotAt = (w: World, locId: Id): boolean => streetIs(w, locId, 'riotUntil');
export const anarchyAt = (w: World, locId: Id): boolean => streetIs(w, locId, 'anarchyUntil');
/** No police here right now: a riot or anarchy. */
export const lawless = (w: World, locId: Id): boolean => riotAt(w, locId) || anarchyAt(w, locId);

/** Streets within two hops: what "a district" means for anarchy until districts exist as things. */
function streetsAround(w: World, loc: Location, hops = 2): Location[] {
  const start = streetOf(w, loc);
  const seen = new Set([start.id]);
  let ring = [start];
  for (let d = 0; d < hops; d++) {
    const next: Location[] = [];
    for (const s of ring) for (const e of s.exits) {
      const to = w.locations[e.to];
      if (to?.kind === 'street' && !seen.has(to.id)) { seen.add(to.id); next.push(to); }
    }
    ring = next;
  }
  return [...seen].map((id) => w.locations[id]!);
}

/** The nearest Atlas outpost she could reach, and its garrison. */
function nearestOutpost(w: World, within = 6): { loc: Location; dist: number } | null {
  let best: { loc: Location; dist: number } | null = null;
  for (const loc of Object.values(w.locations)) {
    if (!isEntrance(loc) || loc.gen?.role !== 'outpost') continue;
    const d = w.dungeons[loc.id];
    if (d && d.clearedRun !== null) continue;
    const r = routeTo(w, w.hero.locationId, loc.id);
    if (r && r.dist <= within && (!best || r.dist < best.dist)) best = { loc, dist: r.dist };
  }
  return best;
}

// ===================================================================== candidates

const high = (w: World, loc: Location): boolean => loc.outdoors && (loc.id === 'overpass' || /roof/i.test(loc.id + loc.name) || !!w.legacy.muse?.towers?.[loc.id]);
const atlasNear = (w: World, loc: Location): boolean => (w.heat.atlas ?? 0) >= 3 || !!nearestOutpost(w, 2);

export function mythCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  if (!hasInstrument(h) || !loc.outdoors) return out;
  const fans = localFans(w, loc.id);
  const keen = 0.5 * Math.min(1, skillValue(h, 'guitar') / 50);
  if (w.situation.weather === 'acid_rain' && high(w, loc) && !w.counters.myth_storm) {
    out.push({ key: 'storm_solo', drives: { pride: 1.0, bravery: 0.6 }, bonus: 0.2 + keen, risk: 1.0, intent: { place: loc.name }, run: stormSolo });
  }
  if (fans >= 60 && atlasNear(w, loc) && !w.counters.myth_riot && !riotAt(w, loc.id)) {
    out.push({ key: 'riot', drives: { pride: 0.8, bravery: 0.8, quest: 0.6 }, bonus: 0.2 + keen, risk: 0.8, intent: { place: loc.name }, run: riot });
  }
  const outpost = w.counters.myth_riot_won ? nearestOutpost(w, 4) : null;
  if (outpost && !w.counters.myth_march) {
    out.push({ key: 'march', drives: { bravery: 1.0, quest: 0.8, pride: 0.6 }, bonus: 0.5 + keen, risk: 0.6, intent: { place: outpost.loc.name }, run: (c) => march(c, outpost.loc) });
  }
  const npd = w.heat.npd ?? 0;
  if (fans >= 40 && (npd >= 4 || npcsAt(w, loc.id).some((n) => n.alive && n.tags.includes('cop'))) && !w.counters.myth_anarchy && !anarchyAt(w, loc.id)) {
    out.push({ key: 'down_with_police', drives: { bravery: 0.8, pride: 0.7, quest: 0.5 }, bonus: 0.2 + keen + 0.1 * npd, risk: 0.8, intent: { place: loc.name }, run: downWithPolice });
  }
  return out;
}

// ===================================================================== the acts

export function stormSolo(c: Ctx): void {
  const { w, rng } = c;
  w.counters.myth_storm = 1;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  if (!rng.chance(mythOdds(w))) {
    // A metal guitar, on a roof, in an acid storm.
    h.hp = Math.max(1, h.hp - Math.round(h.maxHp * 0.3));
    train(c, 'guitar', 2);
    c.emit('storm_solo', 'bad', { place: loc.name });
    return;
  }
  const worth = encoreWorth(w, 'storm');
  legend(w, 'storm');
  w.blackoutUntil = Math.max(w.blackoutUntil, w.beat + 30);
  const outpost = nearestOutpost(w, 8);
  let fried = 0;
  if (outpost) {
    const d = ensureDungeon(w, outpost.loc);
    if (d) for (const n of garrisonAlive(w, d)) if (n.tags.includes('robot')) { n.alive = false; fried++; }
    if (d) checkCleared(c, d as Dungeon);
  }
  const gain = fameFrom(c, 20 * worth, 'storm_solo');
  train(c, 'guitar', 6);
  c.emit('storm_solo', 'good', { place: loc.name, target: outpost?.loc.name ?? '', fried, fame: Math.round(gain) });
}

export function riot(c: Ctx): void {
  const { w, rng } = c;
  w.counters.myth_riot = 1;
  const loc = w.locations[w.hero.locationId]!;
  const fans = localFans(w, loc.id);
  const p = mythOdds(w, Math.min(0.2, (fans - 60) / 400));
  if (!rng.chance(p)) {
    w.heat.npd = Math.min(10, (w.heat.npd ?? 0) + 2);
    for (const id of block(w, loc)) { const s = w.locations[id]!; if (s.fans) s.fans *= 0.85; }
    c.emit('riot', 'bad', { place: loc.name });
    return;
  }
  const worth = encoreWorth(w, 'riot');
  legend(w, 'riot');
  w.counters.myth_riot_won = 1;
  const until = w.clock + 360;
  const looted: string[] = [];
  for (const id of block(w, loc)) {
    const s = w.locations[id]!;
    s.riotUntil = until;
    // The shops on the block, and the places off it, get looted: hers included.
    for (const e of s.exits) {
      const shop = w.locations[e.to];
      if (!shop || !(shop.kind === 'shop' || shop.kind === 'pawn')) continue;
      shop.lootedRun = w.legacy.runs;
      if (shop.shelf) shop.shelf = shop.shelf.filter((l, i) => l.hers || i % 2 === 0);
      for (const n of npcsAt(w, shop.id)) if (n.alive && (n.tags.includes('owner') || n.tags.includes('staff'))) { n.cash = Math.round(n.cash * 0.3); n.affinity -= 10; }
      looted.push(shop.name);
    }
  }
  if (looted.some((n) => /spray/i.test(n))) w.counters.paint_stock = 0;
  w.heat.atlas = 0;
  shiftPull(w, loc.id, -20);
  const gain = fameFrom(c, 15 * worth, 'riot');
  train(c, 'guitar', 5);
  c.emit('riot', 'good', { place: loc.name, looted: looted.length, shop: looted[0] ?? '', fame: Math.round(gain) });
}

export function march(c: Ctx, target: Location): void {
  const { w, rng } = c;
  w.counters.myth_march = 1;
  const d = ensureDungeon(w, target);
  if (!d || !rng.chance(mythOdds(w, 0.1))) {
    // The gate holds, the rubber bullets fly, and the crowd decides whose fault it is.
    w.heat.atlas = Math.min(10, (w.heat.atlas ?? 0) + 3);
    const here = w.locations[w.hero.locationId]!;
    const fans = localFans(w, here.id);
    for (const id of block(w, here)) { const s = w.locations[id]!; if (s.fans) s.fans *= 0.7; }
    const mob = spawnGroup(c, 'turned_fan', Math.min(8, 3 + Math.floor(fans / 40)));
    for (const n of mob) n.hostile = true;
    c.emit('march', 'bad', { place: target.name, count: mob.length });
    fight(c, mob, { cause: 'a march gone wrong', joiners: false });
    return;
  }
  const worth = encoreWorth(w, 'march');
  legend(w, 'march');
  const routed = garrisonAlive(w, d).length;
  for (const n of garrisonAlive(w, d)) n.alive = false;
  checkCleared(c, d);
  const gain = fameFrom(c, 25 * worth, 'march');
  train(c, 'guitar', 6);
  c.emit('march', 'good', { place: target.name, count: routed, fame: Math.round(gain) });
}

export function downWithPolice(c: Ctx): void {
  const { w, rng } = c;
  w.counters.myth_anarchy = 1;
  const loc = w.locations[w.hero.locationId]!;
  if (!rng.chance(mythOdds(w, Math.min(0.15, (localFans(w, loc.id) - 40) / 400)))) {
    w.heat.npd = Math.min(10, (w.heat.npd ?? 0) + 2);
    c.emit('down_with_police', 'bad', { place: loc.name });
    return;
  }
  const worth = encoreWorth(w, 'anarchy');
  legend(w, 'anarchy');
  const streets = streetsAround(w, loc);
  for (const s of streets) s.anarchyUntil = w.clock + 2 * 24 * 60;
  w.heat.npd = 0;
  const gain = fameFrom(c, 15 * worth, 'down_with_police');
  train(c, 'guitar', 5);
  c.emit('down_with_police', 'good', { place: loc.name, count: streets.length, fame: Math.round(gain) });
}

/** A broadcast that lands while she's enormous can chart: Muse's clearance approves her song by accident. */
export const CHART_RENOWN = 600;
export function maybeCharts(c: Ctx, renown: number): void {
  const { w, rng } = c;
  const book = songbook(w);
  if (renown < CHART_RENOWN || book.length < 8 || (w.legacy.muse?.chartsUntil ?? -1) >= w.legacy.runs) return;
  if (!rng.chance(mythOdds(w))) return;
  const worth = encoreWorth(w, 'charts');
  legend(w, 'charts');
  const m = (w.legacy.muse ??= {});
  m.chartsUntil = w.legacy.runs + 3;
  for (const l of Object.values(w.locations)) if (l.kind === 'street' && l.musePull !== undefined) l.musePull = Math.max(0, l.musePull - 10);
  const song = rng.pick(book);
  const gain = fameFrom(c, 30 * worth, 'charts');
  c.emit('charts', 'good', { title: song.title, fame: Math.round(gain) });
}

/** Her song is on every dragon's loudspeaker: they're slower to notice her. */
export const charting = (w: World): boolean => (w.legacy.muse?.chartsUntil ?? -1) >= w.legacy.runs;
