import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { beginRun, endRun, newUniverse } from './universe';
import { declareSong, loveSongsAbout, noteMoment, serenadeSong, songAfterSet, songCandidates, songsTick, writeSong } from './songs';
import { makeItem } from './content/items';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { always, never } from './testkit';
import type { Npc } from './types';

const ctxOf = (w: World, rng: Rng = new Rng('s')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

function withGuitar(seed: string): World {
  const w = createWorld({ seed });
  w.hero.inventory.push(makeItem('vintage_guitar'));
  w.hero.locationId = 'halo_floor';
  return w;
}

function crush(w: World, id = 'crush'): Npc {
  return addNpc(w, spawnNpc(new Rng(id), id, 'patron', 'halo_floor', {}));
}

describe('moments', () => {
  it('what happens to her goes on her mind; what does not matter, does not', () => {
    const w = withGuitar('moments');
    noteMoment(w, 'go', 'mixed', { variant: 'walk' });
    expect(w.mind.moments ?? []).toHaveLength(0);
    noteMoment(w, 'make_move', 'good', { variant: 'private', npc: 'Someone' });
    noteMoment(w, 'muse_recovery', 'good', { variant: 'clean' });
    expect(w.mind.moments!.map((m) => m.kind)).toEqual(['love', 'muse']);
  });

  it('a death becomes a cover story, never a confession: a close call, a rumour, a lookalike', () => {
    const w = withGuitar('cover');
    w.legacy.deaths.push({ run: w.legacy.runs - 1, clock: 0, locationId: 'street_main', killers: [], witnesses: [] });
    const { c } = ctxOf(w);
    songsTick(c);
    songsTick(c);
    const covers = (w.mind.moments ?? []).filter((m) => m.kind === 'cover');
    expect(covers).toHaveLength(1);
    for (const t of covers[0]!.titles) expect(t.toLowerCase()).not.toMatch(/\b(died|death of|resurrect|backup|clone|printed)\b/);
  });
});

describe('writing', () => {
  it('somewhere quiet, with a guitar and something on her mind, she writes it up; the songbook outlives her', () => {
    const u = newUniverse('book');
    const w = beginRun(u);
    w.hero.inventory.push(makeItem('vintage_guitar'));
    noteMoment(w, 'victory', 'good', {});
    expect(songCandidates(w).map((x) => x.key)).toContain('write_song');
    const { c, events } = ctxOf(w, always());
    const song = writeSong(c)!;
    expect(song.title).toMatch(/Overpass|CINDERJAW/);
    expect(w.mind.moments).toHaveLength(0);
    expect(hasTemplate(events.find((e) => e.type === 'song_written')!)).toBe(true);
    w.ending = 'dead';
    w.over = true;
    const next = beginRun(endRun(w));
    expect(next.legacy.songs!.map((s) => s.title)).toContain(song.title);
  });

  it('she never writes the same title twice: the second one is a sequel', () => {
    const w = withGuitar('sequel');
    for (let i = 0; i < 4; i++) {
      noteMoment(w, 'victory', 'good', {});
      writeSong(ctxOf(w, always()).c);
    }
    const titles = w.legacy.songs!.map((x) => x.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.some((t) => t.includes('(Part II)'))).toBe(true);
  });

  it('a song that will not come stays on her mind for another try', () => {
    const w = withGuitar('scrap');
    noteMoment(w, 'banned', 'bad', { npc: 'Tiny' });
    const { c, events } = ctxOf(w, never());
    expect(writeSong(c)).toBeNull();
    expect(w.mind.moments).toHaveLength(1);
    expect(hasTemplate(events[0]!)).toBe(true);
  });

  it('after a set that goes over, the log sometimes names the song', () => {
    const w = withGuitar('played');
    w.legacy.songs = [{ id: 's', title: 'Gravity Is a Cop', kind: 'scrape', quality: 3, run: 1 }];
    const { c, events } = ctxOf(w, always());
    songAfterSet(c, 'busk', [{ beat: 0, type: 'busk', outcome: 'good', data: {} }]);
    const e = events.find((x) => x.type === 'song_played')!;
    expect(e.data.title).toBe('Gravity Is a Cop');
    expect(hasTemplate(e)).toBe(true);
  });
});

describe('love songs', () => {
  it('a kiss can become a love song about that person', () => {
    const w = withGuitar('lovesong');
    const n = crush(w);
    noteMoment(w, 'make_move', 'good', { variant: 'private', npc: n.name });
    writeSong(ctxOf(w, always()).c);
    expect(loveSongsAbout(w, n.id)).toHaveLength(1);
  });

  it('sung to them, it is a serenade with a real upside; once a night', () => {
    const w = withGuitar('serenade');
    const n = crush(w);
    const song = { id: 'l', title: `${n.name}, Under the Neon`, kind: 'love' as const, about: n.id, quality: 5, run: 1 };
    w.legacy.songs = [song];
    expect(songCandidates(w).map((x) => x.key)).toContain(`serenade_song:${n.id}`);
    const before = n.affinity;
    const { c, events } = ctxOf(w, always());
    serenadeSong(c, n, song);
    expect(n.affinity).toBeGreaterThanOrEqual(before + 14);
    expect(hasTemplate(events.find((e) => e.type === 'serenade_song')!)).toBe(true);
    expect(songCandidates(w).map((x) => x.key)).not.toContain(`serenade_song:${n.id}`);
  });

  it('played in public, it is a declaration: a showy one is thrilled, a private one mortified, and a partner takes it badly', () => {
    const w = withGuitar('declare');
    const n = addNpc(w, spawnNpc(new Rng('away'), 'away', 'patron', 'street_main', {}));
    const partner = addNpc(w, spawnNpc(new Rng('p'), 'p', 'patron', 'street_main', {}));
    n.heart = { ...(n.heart ?? {}), partner: { name: partner.name, kind: 'partner', years: 3, id: partner.id } } as never;
    const song = { id: 'd', title: `${n.name} (Slow One)`, kind: 'love' as const, about: n.id, quality: 5, run: 1 };
    w.legacy.songs = [song];
    const pBefore = partner.affinity;
    const { c, events } = ctxOf(w);
    declareSong(c, n, song);
    expect(partner.affinity).toBeLessThan(pBefore);
    const e = events.find((x) => x.type === 'declare_song')!;
    expect(['swoon', 'mortified']).toContain(e.data.variant);
    expect(hasTemplate(e)).toBe(true);
  });
});
