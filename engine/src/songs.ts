import type { Ctx, Id, Moment, Npc, Song, SongKind, World } from './types';
import type { EventData, GameEvent, Outcome } from './events';
import type { Candidate } from './candidate';
import { here, remember } from './combat';
import { odds, synergy, train } from './skills';
import { kindle } from './romance';
import { bondEvent, partnerOf, romanceMod } from './bonds';
import { traitOf } from './character';
import { hasInstrument } from './instruments';
import { fameFrom } from './stage';

/**
 * Songs: a flavour layer, mostly. Things that happen to her (a kiss, a slap, a dragon, a Muse drone shot out of the sky
 * mid-chorus) go on her mind as moments (`noteMoment`, tapped from every event). Somewhere quiet, with a guitar, she can
 * write one up (`write_song`), and the song goes in her songbook, which outlives her. After that the titles turn up when
 * she plays.
 *
 * Two kinds of song do something. A **love song** about somebody can be sung to them (a serenade with a real upside) or
 * played in public (a declaration: the subject hears about it, and whether they're thrilled or mortified depends on who
 * they are; a partner of theirs takes it badly).
 *
 * **Her deaths** are material too, but she never admits to them: she doesn't want Atlas knowing about the lab. Every one
 * gets spun as a narrow escape, a rumour, or a lookalike who happened to be on that pavement.
 */

const MAX_MOMENTS = 12;
const MAX_SONGS = 60;

type Spec = { kind: SongKind; drama: number; titles: (d: EventData) => string[]; about?: (d: EventData, w: World) => Id | undefined };

const named = (w: World, name: unknown): Id | undefined => (typeof name === 'string' ? Object.values(w.npcs).find((n) => n.name === name)?.id : undefined);
const s = (v: unknown, or = 'Someone'): string => (typeof v === 'string' && v ? v : or);

/** Which events are worth a song, and what she'd call it. Keyed by `type:variant`, then `type:outcome`, then `type`. */
const MOMENTS: Record<string, Spec> = {
  // ---- love
  'make_move:private': { kind: 'love', drama: 3, titles: (d) => [`${s(d.npc)}, Under the Neon`, `Kissed ${s(d.npc)} and the Sky Fell In`, `${s(d.npc)} (Slow One)`], about: (d, w) => named(w, d.npc) },
  'make_move:invite': { kind: 'love', drama: 3, titles: (d) => [`Back to ${s(d.npc)}'s Place`, `${s(d.npc)} Said Yes`], about: (d, w) => named(w, d.npc) },
  'make_move:public_cheer': { kind: 'love', drama: 4, titles: (d) => [`The Whole Bar Cheered (${s(d.npc)})`, `${s(d.npc)}, In Front of Everyone`], about: (d, w) => named(w, d.npc) },
  'reconcile:win': { kind: 'love', drama: 3, titles: (d) => [`Second Verse (${s(d.npc)})`, `${s(d.npc)} Came Back`], about: (d, w) => named(w, d.npc) },
  // ---- heartbreak
  'make_move:declined': { kind: 'heartbreak', drama: 2, titles: (d) => [`${s(d.npc)} Doesn't Love Me Back`, `Not Tonight (${s(d.npc)})`] },
  'make_move:slap': { kind: 'heartbreak', drama: 3, titles: (d) => [`The Slap Heard Round the Block`, `${s(d.npc)}'s Left Hand`] },
  breakup: { kind: 'heartbreak', drama: 4, titles: (d) => [`Keys on the Counter`, `${s(d.npc)}, Leaving`, `Last Call for Us`] },
  // ---- triumphs
  victory: { kind: 'triumph', drama: 6, titles: () => ['Ballad of the Overpass', 'CINDERJAW Never Saw It Coming'] },
  'cordon_teardown:good': { kind: 'triumph', drama: 6, titles: () => ['Pull (The Cordon Song)', 'Every Exit at Once'] },
  'dragon_song:artemis': { kind: 'triumph', drama: 3, titles: () => ['Decoy', 'The Patrol Went Left'] },
  'dragon_song:hermes': { kind: 'triumph', drama: 3, titles: (d) => ['Sign Here', `Special Delivery (${s(d.cargo, 'Something Shiny')})`] },
  'dragon_song:demeter': { kind: 'triumph', drama: 4, titles: () => ['It\'s Always Winter (Not Tonight)', 'The Night I Sang Down a Demeter'] },
  'dragon_song:ares': { kind: 'triumph', drama: 4, titles: () => ['Power Riff for a Gang Buster', 'Fed It a Solo'] },
  'dragon_song:apollo': { kind: 'triumph', drama: 4, titles: () => ['Lockdown (Reprise)', 'Go On, Shoo'] },
  'dragon_song:hera': { kind: 'triumph', drama: 7, titles: () => ['The Sky Stopped to Listen', 'Hera Mk. V Has Taste'] },
  'dragon_film:good': { kind: 'triumph', drama: 2, titles: () => ['Content', 'Look Up (It Is Looking Down)'] },
  comeback: { kind: 'stage', drama: 4, titles: () => ['Never Left', 'Back (Like I Was Ever Gone)'] },
  'flash_mob:moved': { kind: 'stage', drama: 3, titles: () => ['Bring Everyone', 'Four Minutes After the Post'] },
  'calling:spark': { kind: 'life', drama: 3, titles: () => ['This Is What I\'m For', 'One Long Second'] },
  calling_done: { kind: 'life', drama: 5, titles: () => ['I Actually Did It', 'Write It on Something Big'] },
  // ---- scrapes
  banned: { kind: 'scrape', drama: 2, titles: (d) => [`${s(d.npc, 'Tiny')} Says I Can't Come In`, 'Name on the Wall'] },
  blackout: { kind: 'scrape', drama: 2, titles: () => ['Where Am I, Where Is My Money', 'Woke Up Somewhere Else'] },
  'injury:broken_leg': { kind: 'scrape', drama: 2, titles: () => ['Gravity Is a Cop', 'The Skylight Was Closed'] },
  'letdown:big': { kind: 'stage', drama: 2, titles: () => ['Experimental Phase', 'The Merch Table Gave Refunds'] },
  'booking:missed': { kind: 'stage', drama: 1, titles: () => ['Was That Tonight?', 'Somewhere Across Neo, a Stage'] },
  // ---- Muse
  'muse:confiscate': { kind: 'muse', drama: 2, titles: () => ['Give It Back (Nicely)', 'For Safekeeping'] },
  'muse:refused': { kind: 'muse', drama: 3, titles: () => ['Not For Sale (Rent Negotiable)', 'Put the Pen Down'] },
  'muse:signed': { kind: 'muse', drama: 3, titles: () => ['I Am Not Selling Out, I Am Buying In', 'Page Thirty'] },
  'muse_recovery:good': { kind: 'muse', drama: 4, titles: () => ['Unauthorized Entertainment', 'Shot It Out of the Sky Mid-Chorus'] },
  inspiration: { kind: 'muse', drama: 4, titles: () => ['Team Inspire', 'They Played the Jingle First'] },
  'take_tower:taken': { kind: 'muse', drama: 3, titles: () => ['Pirate Radio', 'Spliced'] },
  // ---- deaths, as she tells them
  'muse:tribute': { kind: 'cover', drama: 4, titles: () => ['Unique Voice (Not That One)', 'Rumours of My Death'] },
  revenant: { kind: 'cover', drama: 3, titles: () => ['Didn\'t You Die? (No.)', 'Must Have Been Someone Else', 'Flesh Wound'] },
};

const specFor = (type: string, outcome: Outcome, data: EventData): Spec | undefined =>
  (data.variant !== undefined ? MOMENTS[`${type}:${data.variant}`] : undefined) ?? MOMENTS[`${type}:${outcome}`] ?? MOMENTS[type];

/** Every event goes past here (run.ts `makeCtx`); the song-worthy ones go on her mind. Draws no dice. */
export function noteMoment(w: World, type: string, outcome: Outcome, data: EventData): void {
  const spec = specFor(type, outcome, data);
  if (!spec) return;
  const m = (w.mind.moments ??= []);
  const about = spec.about?.(data, w);
  m.push({ kind: spec.kind, titles: spec.titles(data), drama: spec.drama, beat: w.beat, ...(about ? { about } : {}) });
  if (m.length > MAX_MOMENTS) m.splice(0, m.length - MAX_MOMENTS);
}

/** The titles she gives a death she isn't admitting to. */
const COVER_TITLES = ['Rumours of My Death (Greatly Exaggerated)', 'Narrowly', 'That Was a Lookalike', 'Wasn\'t Me on the Pavement', 'Flesh Wound', 'Still Here (Never Left)', 'Close Call on {place}'];

/** Once a night: a death she hasn't spun yet becomes material. As a near miss, or a rumour, or somebody else. */
export function songsTick(c: Ctx): void {
  const { w, rng } = c;
  if (w.counters.cover_checked) return;
  w.counters.cover_checked = 1;
  const last = w.legacy.deaths[w.legacy.deaths.length - 1];
  const spun = (w.legacy.coverStories ??= []);
  if (!last || spun.includes(last.run)) return;
  spun.push(last.run);
  if (spun.length > 30) spun.shift();
  const place = w.locations[last.locationId]?.name ?? 'the corner';
  const pool = [...COVER_TITLES];
  const titles: string[] = [];
  for (let i = 0; i < 3; i++) titles.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!.replace('{place}', place));
  (w.mind.moments ??= []).push({ kind: 'cover', titles, drama: 4, beat: w.beat });
}

// ===================================================================== writing

const quiet = (w: World): boolean => !here(w).some((n) => n.hostile && n.alive);

const writeOdds = (w: World): number => odds(0.3, 0.06, synergy(w.hero, ['guitar', ['music', 0.6], ['stat:int', 0.3]]));

export const songbook = (w: World): Song[] => w.legacy.songs ?? [];
export const loveSongsAbout = (w: World, id: Id): Song[] => songbook(w).filter((x) => x.kind === 'love' && x.about === id);

export function songCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  if (!hasInstrument(h)) return out;
  const moments = w.mind.moments ?? [];
  if (moments.length && quiet(w) && w.clock - (w.counters.last_song ?? -9999) >= 60) {
    const best = Math.max(...moments.map((m) => m.drama));
    out.push({ key: 'write_song', drives: { pride: 0.4, curiosity: 0.4 }, bonus: 0.05 * best, risk: 0, intent: {}, run: writeSong });
  }
  // ---- love songs: to them, or about them in front of everyone
  for (const song of songbook(w).filter((x) => x.kind === 'love' && x.about)) {
    const n = w.npcs[song.about!];
    if (!n?.alive || n.hostile) continue;
    if (n.locationId === h.locationId && !w.counters[`serenaded:${n.id}`]) {
      out.push({ key: `serenade_song:${n.id}`, drives: { lust: 0.8, pride: 0.4 }, bonus: 0.3, risk: 0.15, intent: { npc: n.name }, run: (c) => serenadeSong(c, n, song) });
    }
    const loc = w.locations[h.locationId]!;
    if (n.locationId !== h.locationId && !w.counters[`declared:${n.id}`] && (loc.crowded || here(w).filter((x) => x.alive && !x.hostile).length >= 3)) {
      out.push({ key: `declare_song:${n.id}`, drives: { lust: 0.5, pride: 0.7 }, bonus: 0.1, risk: 0.3, intent: { npc: n.name }, run: (c) => declareSong(c, n, song) });
    }
  }
  return out;
}

/** She writes up the biggest thing on her mind (a romantic leans to love songs). */
export function writeSong(c: Ctx): Song | null {
  const { w, rng } = c;
  const h = w.hero;
  w.counters.last_song = w.clock;
  const moments = w.mind.moments ?? [];
  if (!moments.length) return null;
  const romantic = h.personality.traits.romantic;
  const m = rng.weighted(moments, (x) => x.drama * (x.kind === 'love' || x.kind === 'heartbreak' ? 0.6 + romantic : 1));
  if (!rng.chance(writeOdds(w))) {
    train(c, 'guitar', 1);
    c.emit('song_written', 'bad', { variant: 'scrapped' });
    return null;
  }
  moments.splice(moments.indexOf(m), 1);
  // She doesn't write the same song twice; if she must, it's a sequel.
  const used = new Set(songbook(w).map((x) => x.title));
  const fresh = m.titles.filter((t) => !used.has(t));
  const base = fresh.length ? rng.pick(fresh) : rng.pick(m.titles);
  let title = base;
  for (let n = 2; used.has(title); n++) title = `${base} (Part ${['', '', 'II', 'III', 'IV', 'V'][n] ?? n})`;
  const song: Song = { id: `song${w.legacy.runs}.${w.beat}`, title, kind: m.kind, quality: Math.floor(synergy(h, ['guitar'])), run: w.legacy.runs, ...(m.about ? { about: m.about } : {}) };
  const book = (w.legacy.songs ??= []);
  book.push(song);
  if (book.length > MAX_SONGS) book.shift();
  train(c, 'guitar', 2);
  train(c, 'music', 1);
  c.emit('song_written', 'good', { variant: m.kind, title: song.title, npc: m.about ? w.npcs[m.about]?.name ?? '' : '', count: book.length });
  return song;
}

/** After a set that went over: now and then the log names which of her songs it was. Flavour only. */
export function songAfterSet(c: Ctx, act: string, events: GameEvent[]): void {
  const { w, rng } = c;
  const book = songbook(w);
  if (!book.length || !events.some((e) => e.type === act && e.outcome === 'good') || !rng.chance(0.35)) return;
  const song = rng.pick(book);
  c.emit('song_played', 'good', { variant: song.kind, title: song.title, place: w.locations[w.hero.locationId]!.name, npc: song.about ? w.npcs[song.about]?.name ?? '' : '' });
}

// ===================================================================== love songs

export function serenadeSong(c: Ctx, n: Npc, song: Song): void {
  const { w, rng } = c;
  const h = w.hero;
  w.counters[`serenaded:${n.id}`] = 1;
  const p = Math.max(0.05, Math.min(0.92, odds(0.25, 0.065, synergy(h, ['guitar', ['music', 0.5], ['stat:charm', 0.5]])) + n.affinity / 300 + romanceMod(w, n) * 0.5));
  if (rng.chance(p)) {
    n.affinity += rng.int(14, 22);
    kindle(h, 0.04);
    remember(n, 'was sung a song Blackbird wrote about them');
    fameFrom(c, 0.5, 'serenade_song');
    train(c, 'guitar', 2);
    c.emit('serenade_song', 'good', { variant: 'swoon', npc: n.name, title: song.title });
    bondEvent(c, n, 'date');
  } else {
    n.affinity -= 4;
    train(c, 'guitar', 1);
    c.emit('serenade_song', 'bad', { variant: 'cringe', npc: n.name, title: song.title });
  }
}

/** Played in public, a love song is a declaration. Whoever it's about hears, and so does anyone who loves them. */
export function declareSong(c: Ctx, n: Npc, song: Song): void {
  const { w } = c;
  const h = w.hero;
  w.counters[`declared:${n.id}`] = 1;
  // A showy, sociable one is thrilled to be sung about in front of a bar; a private one is mortified.
  const taste = traitOf(w, n, 'sociable') + traitOf(w, n, 'vanity') - 1;
  const delta = Math.round(6 + 14 * taste);
  n.affinity += delta;
  remember(n, delta >= 0 ? 'heard Blackbird sang a love song about them, in public' : 'is mortified Blackbird sang about them in public');
  h.fame += 1;
  const partner = partnerOf(n);
  const jealous = partner?.id ? w.npcs[partner.id] : undefined;
  if (jealous?.alive) {
    jealous.affinity -= 12;
    remember(jealous, `heard Blackbird singing love songs about ${n.name}`);
  }
  train(c, 'guitar', 1);
  c.emit('declare_song', delta >= 0 ? 'good' : 'mixed', { variant: delta >= 0 ? 'swoon' : 'mortified', npc: n.name, title: song.title, place: w.locations[h.locationId]!.name, partner: jealous?.alive ? jealous.name : partner?.name ?? '' });
}
