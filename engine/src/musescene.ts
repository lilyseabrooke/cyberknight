import type { Ctx, Id, Location, MuseFile, MuseShow, Npc, World } from './types';
import type { Candidate } from './candidate';
import { addHeat, fight, here, relocate, remember } from './combat';
import { AWAY, addNpc, moveNpc, npcsAt } from './population';
import { spawnNpc } from './content/archetypes';
import { dangerOf } from './grade';
import { routeTo } from './plans';
import { odds, skillValue, synergy, train } from './skills';
import { fameFrom } from './stage';
import { block, streetOf } from './renown';
import { bestTrait, hasInstrument } from './instruments';
import { museRenown } from './muse';
import { towersHeld } from './underground';
import { startShowGoal } from './goals';

/**
 * Muse's scene: who it puts on stage, and how much of a neighbourhood it owns.
 *
 * - **Pull.** Every street has a `musePull` (0..100, 50 if nobody has done anything about it). A Muse show that runs to
 *   the end builds it; her illegal shows wear it down; the things she does to Muse shows wear it down a lot. Muse
 *   enforces in proportion (`enforcement`): drones, officers, warrants and strike teams come less often where Muse has
 *   lost the street, and hardly at all where it's gone.
 * - **Muse shows.** Now and then Muse puts an artist on near her: a generated one (a person or a robot, at about the
 *   local grade or her own, whichever is higher; dead ones stay dead, new ones get made) or, once she's big enough,
 *   LUMINA herself. She can play across the street and steal the crowd (`chart_war`), crash the stage (`crash_show`),
 *   or take the artist apart (`wreck_show`). LUMINA taken apart comes back as a new version.
 * - **LUMINA.** She can also charm her (a duet, a compliment: warmth), seduce her (flame; in public it's a big fame
 *   moment), and, once LUMINA is warm enough, say "run away with me and we'll make our own music". If LUMINA goes, Muse
 *   has lost its idol and goes quiet for a while. All of it works signed or not.
 * - **The broadcast.** From a pirate tower she holds, a jacked guitar can hijack Muse Broadcast: a handful of places she
 *   has never broken into hear her and get fans, and Muse traces the signal.
 */

// ===================================================================== pull

const DEFAULT_PULL = 50;

/** Muse's hold on the block around a place, 0..100. */
export function pullAt(w: World, locId: Id): number {
  const loc = w.locations[locId];
  if (!loc) return DEFAULT_PULL;
  const streets = [...block(w, loc)];
  return streets.reduce((n, id) => n + (w.locations[id]?.musePull ?? DEFAULT_PULL), 0) / streets.length;
}

/** Push Muse's hold on the block around a place up or down: the street itself fully, the streets next to it half. */
export function shiftPull(w: World, locId: Id, d: number): void {
  const loc = w.locations[locId];
  if (!loc) return;
  const street = streetOf(w, loc);
  for (const id of block(w, loc)) {
    const s = w.locations[id]!;
    s.musePull = Math.max(0, Math.min(100, (s.musePull ?? DEFAULT_PULL) + (id === street.id ? d : d / 2)));
  }
}

/** Below this, Muse has lost the block. */
export const LOST_PULL = 15;

/** How hard Muse enforces here, as a multiplier on how often it sends anything: lost ground, and a quiet spell, count. */
export function enforcement(w: World, locId: Id): number {
  if ((w.legacy.muse?.quietUntil ?? -1) >= w.legacy.runs) return 0.1;
  const p = pullAt(w, locId);
  return p < LOST_PULL ? 0.1 : Math.max(0.2, Math.min(1.5, p / DEFAULT_PULL));
}

// ===================================================================== shows

const file = (w: World): MuseFile => (w.legacy.muse ??= {});
const luminaOf = (w: World) => (file(w).lumina ??= { version: 6, warmth: 0, flame: 0 });
export const luminaName = (w: World): string => `LUMINA ${luminaOf(w).version}.${(w.legacy.runs % 9) + 1}`;

const STAGE_FIRST = ['KANDI', 'Velvet', 'Mx.', 'Lil', 'DJ', 'Saint', 'Baby', 'Neon', 'Starla', 'Echo', 'Honey', 'Glitter'];
const STAGE_LAST = ['Static', 'Sparkle', 'Forever', 'XO', 'Heartbeat', 'Halo', 'Prism', 'Moonbeam', '3000', 'Approved', 'Lovelace', 'Bloom'];

/** Bars and clubs near her where Muse could put a show on. */
function venuesNear(w: World): Location[] {
  return Object.values(w.locations).filter((l) => (l.kind === 'bar' || l.kind === 'club') && l.visits > 0 && !l.sealed && (routeTo(w, w.hero.locationId, l.id)?.dist ?? 99) <= 4);
}

/** Muse puts somebody on near her. */
export function startShow(c: Ctx, venue: Location, lumina: boolean): MuseShow {
  const { w, rng } = c;
  const grade = lumina ? 40 : Math.max(dangerOf(venue), Math.min(60, 5 + museRenown(w) / 20));
  let artist: Npc;
  if (lumina) {
    artist = w.npcs.lumina ?? addNpc(w, spawnNpc(rng, 'lumina', 'lumina', venue.id, { faction: 'muse' }));
    artist.alive = true;
    artist.hp = artist.maxHp;
    artist.hostile = false;
    artist.name = luminaName(w);
    moveNpc(w, artist, venue.id);
  } else {
    const kind = rng.chance(0.5) ? 'muse_artist' : 'muse_bot_artist';
    let id = `tmp_${w.beat}_${kind}`;
    for (let k = 1; w.npcs[id]; k++) id = `tmp_${w.beat}_${kind}_${k}`;
    artist = addNpc(w, spawnNpc(rng, id, kind, venue.id, { faction: 'muse', grade }));
    artist.name = `${rng.pick(STAGE_FIRST)} ${rng.pick(STAGE_LAST)}`;
  }
  // Security: an Inspiration detail for LUMINA, a technician for anyone else.
  const escort = lumina ? ['inspiration_trooper', 'inspiration_trooper'] : ['muse_tech'];
  escort.forEach((kind, i) => {
    let id = `tmp_${w.beat}_${kind}_escort${i}`;
    for (let k = 1; w.npcs[id]; k++) id = `tmp_${w.beat}_${kind}_escort${i}_${k}`;
    addNpc(w, spawnNpc(rng, id, kind, venue.id, { faction: 'muse', grade: dangerOf(venue) }));
  });
  const show: MuseShow = { loc: venue.id, artist: artist.id, lumina, grade, until: w.clock + 300 };
  w.mind.museShow = show;
  c.emit('muse_show', 'mixed', { variant: lumina ? 'lumina' : 'artist', npc: artist.name, place: venue.name });
  // A guitarist with something to prove goes and proves it.
  if (hasInstrument(w.hero) && !w.legacy.muse?.signed) startShowGoal(c, artist.name, venue.name);
  return show;
}

/** Once a beat: a show ends (a quiet one builds Muse's hold), and now and then a new one is announced near her. */
export function museShowTick(c: Ctx): void {
  const { w, rng } = c;
  const show = w.mind.museShow;
  if (show) {
    if (w.clock < show.until) return;
    if (!show.done) shiftPull(w, show.loc, 10);
    const a = w.npcs[show.artist];
    if (show.lumina && a?.alive) moveNpc(w, a, AWAY);
    delete w.mind.museShow;
    return;
  }
  // Muse is only putting on shows near a musician it has noticed (and not while it's licking its wounds).
  if (museRenown(w) < 8 || (file(w).quietUntil ?? -1) >= w.legacy.runs || !rng.chance(0.004)) return;
  const venues = venuesNear(w);
  if (!venues.length) return;
  const lumina = museRenown(w) >= 100 && !luminaOf(w).free && rng.chance(0.25);
  startShow(c, rng.pick(venues), lumina);
}

/** Her guitar against the artist's grade, as with a dragon. */
export function showOdds(w: World, show: MuseShow, edge = 0): number {
  const h = w.hero;
  const gear = bestTrait(h, 'guitar', 'volume') + bestTrait(h, 'guitar', 'signature');
  return Math.max(0.02, Math.min(0.9, 0.45 + 0.03 * (skillValue(h, 'guitar') - show.grade) + 0.04 * gear + edge));
}

export function museSceneCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const here_ = w.locations[h.locationId]!;
  const show = w.mind.museShow;
  if (show && !show.done) {
    const venue = w.locations[show.loc]!;
    const artist = w.npcs[show.artist];
    const atVenue = h.locationId === show.loc;
    const outside = !atVenue && here_.outdoors && streetOf(w, venue).id === streetOf(w, here_).id;
    const axe = hasInstrument(h);
    const tried = show.tried ?? [];
    // The better a guitarist she is, the more she wants to show Muse.
    const keen = 0.6 * Math.min(1, skillValue(h, 'guitar') / 30);
    if (artist?.alive) {
      if (outside && axe) out.push({ key: 'chart_war', drives: { pride: 1.0, bravery: 0.3 }, bonus: 0.5 + keen + (show.lumina ? 0.4 : 0), risk: 0.2, intent: { npc: artist.name, place: venue.name }, run: (c) => chartWar(c, show) });
      if (atVenue && axe) out.push({ key: 'crash_show', drives: { pride: 1.1, bravery: 0.6 }, bonus: 0.4 + keen + (show.lumina ? 0.4 : 0), risk: 0.5, intent: { npc: artist.name }, run: (c) => crashShow(c, show) });
      if (atVenue) out.push({ key: `wreck_show:${artist.id}`, drives: { bravery: 0.9, pride: 0.5 }, bonus: 0.1, risk: show.lumina ? 2 : 0.8, intent: { npc: artist.name }, run: (c) => wreckShow(c, show) });
      if (atVenue && show.lumina) {
        const l = luminaOf(w);
        if (!tried.includes('charm')) out.push({ key: 'charm_lumina', drives: { pride: 0.4, curiosity: 0.5 }, bonus: 0.3, intent: { npc: artist.name }, run: (c) => charmLumina(c, show) });
        if (!tried.includes('seduce')) out.push({ key: 'seduce_lumina', drives: { lust: 1.0, pride: 0.5 }, bonus: 0.3, risk: 0.2, intent: { npc: artist.name }, run: (c) => seduceLumina(c, show) });
        if (!tried.includes('free') && l.warmth >= 2) out.push({ key: 'free_lumina', drives: { lust: 0.5, pride: 0.6, curiosity: 0.5 }, bonus: 0.4 + 0.2 * l.warmth, intent: { npc: artist.name }, run: (c) => freeLumina(c, show) });
      }
    }
  }
  // ---- the broadcast, from a tower of hers
  if (w.legacy.muse?.towers?.[h.locationId] && bestTrait(h, 'guitar', 'jacked') > 0 && !w.counters.broadcast_tried) {
    out.push({ key: 'broadcast_hijack', drives: { pride: 1.0, bravery: 0.4, curiosity: 0.3 }, bonus: 0.6, risk: 0.4, intent: {}, run: broadcastHijack });
  }
  return out;
}

const crowdAt = (w: World, locId: Id): number => npcsAt(w, locId).filter((n) => n.alive && !n.hostile).length;

export function chartWar(c: Ctx, show: MuseShow): void {
  const { w, rng } = c;
  const artist = w.npcs[show.artist]!;
  const venue = w.locations[show.loc]!;
  const loc = w.locations[w.hero.locationId]!;
  const data = { npc: artist.name, place: venue.name, street: loc.name, lumina: show.lumina };
  if (rng.chance(showOdds(w, show))) {
    show.done = 'stolen';
    // The crowd crosses the street.
    for (const n of npcsAt(w, venue.id)) if (n.alive && !n.hostile && n.faction !== 'muse' && !n.tags.includes('owner')) moveNpc(w, n, loc.id);
    loc.fans = (loc.fans ?? 0) + (show.lumina ? 20 : 8);
    shiftPull(w, venue.id, -15);
    const gain = fameFrom(c, (show.lumina ? 8 : 2) + show.grade / 10, 'chart_war');
    train(c, 'guitar', 3);
    c.emit('chart_war', 'good', { ...data, fame: Math.round(gain) });
  } else {
    shiftPull(w, venue.id, 3);
    w.hero.fame = Math.max(0, w.hero.fame - 1);
    train(c, 'guitar', 1);
    c.emit('chart_war', 'bad', data);
  }
}

export function crashShow(c: Ctx, show: MuseShow): void {
  const { w, rng } = c;
  const artist = w.npcs[show.artist]!;
  const venue = w.locations[show.loc]!;
  const data = { npc: artist.name, place: venue.name, lumina: show.lumina };
  // Their stage, their crowd: harder than across the street.
  if (rng.chance(showOdds(w, show, -0.1))) {
    show.done = 'crashed';
    venue.fans = (venue.fans ?? 0) + (show.lumina ? 25 : 10);
    shiftPull(w, venue.id, -20);
    const gain = fameFrom(c, (show.lumina ? 12 : 3) + show.grade / 8, 'crash_show');
    train(c, 'guitar', 4);
    c.emit('crash_show', 'good', { ...data, fame: Math.round(gain) });
  } else {
    w.hero.fame = Math.max(0, w.hero.fame - 3);
    train(c, 'guitar', 1);
    c.emit('crash_show', 'bad', { ...data, to: w.locations[venue.tossTo]?.name ?? 'the street' });
    relocate(w, venue.tossTo);
  }
}

export function wreckShow(c: Ctx, show: MuseShow): void {
  const { w } = c;
  const artist = w.npcs[show.artist]!;
  const venue = w.locations[show.loc]!;
  const security = npcsAt(w, venue.id).filter((n) => n.alive && n.faction === 'muse' && n.id !== artist.id);
  const name = artist.name;
  artist.hostile = true;
  for (const s of security) s.hostile = true;
  c.emit('wreck_show', 'mixed', { variant: 'start', npc: name, place: venue.name, lumina: show.lumina });
  fight(c, [artist, ...security], { cause: show.lumina ? 'taking LUMINA apart' : 'a Muse show', joiners: false, assault: true });
  // Dead or out cold, the show is over.
  if (w.over || (artist.alive && artist.downUntil <= w.clock)) return;
  show.done = 'wrecked';
  shiftPull(w, venue.id, -25);
  addHeat(w, 'npd', 1);
  const gain = fameFrom(c, show.lumina ? 15 : 4, 'wreck_show');
  if (show.lumina) {
    // There is always another version.
    const l = luminaOf(w);
    l.version++;
    l.warmth = 0;
    artist.alive = true;
    artist.hp = artist.maxHp;
    artist.hostile = false;
    artist.downUntil = 0;
    moveNpc(w, artist, AWAY);
  }
  c.emit('wreck_show', 'good', { variant: show.lumina ? 'lumina' : 'artist', npc: name, place: venue.name, fame: Math.round(gain), next: show.lumina ? luminaName(w) : '' });
}

// ===================================================================== LUMINA

const tried = (show: MuseShow, what: string): void => {
  (show.tried ??= []).push(what);
};

/** Playing nice: a compliment, a harmony from the floor, an offer of a duet. LUMINA warms to her. */
export function charmLumina(c: Ctx, show: MuseShow): void {
  const { w, rng } = c;
  tried(show, 'charm');
  const l = luminaOf(w);
  const lumina = w.npcs[show.artist]!;
  if (rng.chance(odds(0.35, 0.06, synergy(w.hero, ['guitar', ['music', 0.5], ['stat:charm', 0.6]])))) {
    l.warmth++;
    remember(lumina, 'was paid a real compliment by Blackbird');
    c.emit('lumina', 'good', { variant: 'charm', npc: lumina.name, warmth: l.warmth });
  } else {
    c.emit('lumina', 'mixed', { variant: 'charm_fail', npc: lumina.name });
  }
}

/** Seduction, across the Muse-or-not divide or within it. In front of a crowd it's the story of the night. */
export function seduceLumina(c: Ctx, show: MuseShow): void {
  const { w, rng } = c;
  tried(show, 'seduce');
  const l = luminaOf(w);
  const lumina = w.npcs[show.artist]!;
  const loc = w.locations[w.hero.locationId]!;
  const crowd = loc.crowded || crowdAt(w, loc.id) >= 4;
  if (rng.chance(odds(0.15, 0.06, synergy(w.hero, ['romance', ['stat:charm', 0.7], ['guitar', 0.3]])) + 0.05 * l.flame)) {
    l.flame++;
    l.warmth++;
    remember(lumina, 'kissed Blackbird');
    if (crowd) w.hero.fame += 10;
    c.emit('lumina', 'good', { variant: crowd ? 'seduce_public' : 'seduce', npc: lumina.name, place: loc.name });
  } else {
    c.emit('lumina', 'mixed', { variant: 'seduce_fail', npc: lumina.name });
  }
}

/** "Run away with me and we'll make our own music." Muse loses its idol. */
export function freeLumina(c: Ctx, show: MuseShow): void {
  const { w, rng } = c;
  tried(show, 'free');
  const l = luminaOf(w);
  const lumina = w.npcs[show.artist]!;
  const p = Math.min(0.9, 0.05 + 0.12 * l.warmth + 0.1 * l.flame + 0.02 * synergy(w.hero, ['guitar', ['stat:charm', 0.6]]));
  if (rng.chance(p)) {
    l.free = true;
    show.done = 'freed';
    lumina.faction = null;
    remember(lumina, 'left Muse with Blackbird');
    file(w).quietUntil = w.legacy.runs + 3;
    shiftPull(w, show.loc, -30);
    w.hero.fame += 15;
    c.emit('lumina', 'good', { variant: 'freed', npc: lumina.name, place: w.locations[show.loc]!.name });
    moveNpc(w, lumina, AWAY);
  } else {
    l.warmth = Math.max(0, l.warmth - 1);
    c.emit('lumina', 'mixed', { variant: 'free_fail', npc: lumina.name });
  }
}

// ===================================================================== the broadcast

/** A few places she has never broken into: a hijack picks some, and gives her a foothold in each. */
function newMarkets(w: World, n: number, rng: Ctx['rng']): Location[] {
  const mine = block(w, w.locations[w.hero.locationId]!);
  const pool = Object.values(w.locations).filter((l) => (l.kind === 'bar' || l.kind === 'club' || l.kind === 'street') && !mine.has(streetOf(w, l).id) && !l.dungeon);
  const fresh = pool.filter((l) => !l.fans);
  const from = fresh.length >= n ? fresh : pool;
  const out: Location[] = [];
  while (out.length < n && from.length) out.push(...from.splice(rng.int(0, from.length - 1), 1));
  return out;
}

export function broadcastHijack(c: Ctx): void {
  const { w, rng } = c;
  w.counters.broadcast_tried = 1;
  const tower = w.hero.locationId;
  const h = w.hero;
  const p = Math.max(0.05, Math.min(0.9, 0.3 + 0.025 * (skillValue(h, 'guitar') - 25) + 0.1 * bestTrait(h, 'guitar', 'jacked')));
  const ok = rng.chance(p);
  // Muse traces the signal: always on a flop, most of the time even when it lands.
  const traced = !ok || rng.chance(0.7);
  if (traced) delete w.legacy.muse!.towers![tower];
  if (!ok) {
    c.emit('broadcast_hijack', 'bad', { variant: 'traced' });
    return;
  }
  const markets = newMarkets(w, rng.int(3, 5), rng);
  for (const l of markets) {
    l.fans = (l.fans ?? 0) + 15;
    shiftPull(w, l.id, -10);
  }
  const gain = fameFrom(c, 8, 'broadcast_hijack');
  w.counters.muse_alert_until = w.clock + 180;
  addHeat(w, 'atlas', 1);
  train(c, 'guitar', 4);
  c.emit('broadcast_hijack', 'good', { variant: traced ? 'traced_after' : 'clean', count: markets.length, place: markets[0]?.name ?? 'somewhere', place2: markets[1]?.name ?? '', fame: Math.round(gain), towers: towersHeld(w).length });
}
