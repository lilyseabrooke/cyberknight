import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, personalityFrom, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { spawnFlight, spotted, dragonCandidates } from './dragons';
import { dragonSong, dragonSongCandidate, dragonSongOdds } from './dragonsong';
import { makeItem } from './content/items';
import { always, never } from './testkit';
import type { Ctx, Flight } from './types';

const setup = (seed: string): { w: World; c: Ctx; events: GameEvent[] } => {
  const w = createWorld({ seed, competence: 0.9, personality: personalityFrom({}) });
  w.hero.locationId = 'street_main';
  w.hero.maxHp = w.hero.hp = 400;
  const events: GameEvent[] = [];
  const c = { w, rng: new Rng(seed), emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } as Ctx;
  return { w, c, events };
};
/** A dragon with her, holding still (as dragons2.test does). */
const withHer = (w: World, c: Ctx, model: string): Flight => {
  const f = spawnFlight(c, model, 1, { at: w.hero.locationId })!;
  if (f.roam) {
    f.roam.nextAt = Infinity;
    f.roam.met = true;
    f.roam.heroAt = w.hero.locationId;
  }
  w.flight = f;
  return f;
};
const withRng = (c: Ctx, rng: Rng): Ctx => ({ ...c, rng });
const texts = (events: GameEvent[]) => events.filter((e) => e.type === 'dragon_song').every((e) => hasTemplate(e));

describe('the odds', () => {
  it('no gates, just her guitar against its grade: a Mk. III courier is much harder than a Mk. I; a beginner under Hera has no chance', () => {
    const { w, c } = setup('odds');
    w.hero.skills.guitar = 800;
    const mk1 = dragonSongOdds(w, withHer(w, c, 'hermes'));
    const mk3 = dragonSongOdds(w, withHer(w, c, 'hermes3'));
    expect(mk1).toBeGreaterThan(mk3 + 0.3);
    w.hero.skills.guitar = 2;
    expect(dragonSongOdds(w, withHer(w, c, 'hera'))).toBeLessThanOrEqual(0.05);
  });

  it('takes a guitar, and one go per dragon', () => {
    const { w, c, events } = setup('once');
    const f = withHer(w, c, 'artemis');
    expect(dragonSongCandidate(w, f)).toBeNull();
    w.hero.inventory.push(makeItem('vintage_guitar'));
    expect(dragonCandidates(w).map((x) => x.key)).toContain('dragon_song:artemis');
    dragonSong(withRng(c, always()), f);
    expect(dragonSongCandidate(w, f)).toBeNull();
    expect(texts(events)).toBe(true);
  });
});

describe('each family', () => {
  it('an Artemis loses her, or finds her', () => {
    const a = setup('artemis');
    const fa = withHer(a.w, a.c, 'artemis');
    dragonSong(withRng(a.c, always()), fa);
    expect(fa.hidden).toBe(true);
    const b = setup('artemis2');
    const fb = withHer(b.w, b.c, 'artemis');
    dragonSong(withRng(b.c, never()), fb);
    expect(b.events.some((e) => e.type === 'dragon_notice' || e.type === 'fight_start')).toBe(true);
    expect(texts(a.events) && texts(b.events)).toBe(true);
  });

  it('a Demeter announces her show instead of the tithe and moves on; a flop is a refusal', () => {
    const a = setup('demeter');
    const fa = withHer(a.w, a.c, 'demeter');
    spotted(a.c);
    expect(fa.phase).toBe('demand');
    const heat = a.w.heat.atlas ?? 0;
    dragonSong(withRng(a.c, always()), fa);
    expect(fa.phase).toBeUndefined();
    expect(a.w.heat.atlas).toBeGreaterThan(heat);
    const b = setup('demeter2');
    const fb = withHer(b.w, b.c, 'demeter');
    spotted(b.c);
    dragonSong(withRng(b.c, never()), fb);
    expect(b.events.some((e) => e.type === 'tithe_refuse')).toBe(true);
  });

  it('an Ares fed a power riff takes its violence somewhere else', () => {
    const a = setup('ares');
    const f = withHer(a.w, a.c, 'ares2');
    dragonSong(withRng(a.c, always()), f);
    expect(f.roam!.stage).toBe('leave');
    expect(texts(a.events)).toBe(true);
  });

  it('a courier that thinks she is the address lands, and can be caught', () => {
    const a = setup('hermes');
    const f = withHer(a.w, a.c, 'hermes3');
    dragonSong(withRng(a.c, always()), f);
    expect(a.events.some((e) => e.type === 'fight_start')).toBe(true);
  });

  it('Hera: played to well enough, it leaves; played to badly, it vaporizes her', () => {
    const a = setup('hera');
    const f = withHer(a.w, a.c, 'hera');
    dragonSong(withRng(a.c, always()), f);
    expect(a.w.flights.includes(f)).toBe(false);
    const b = setup('hera2');
    b.w.hero.maxHp = b.w.hero.hp = 90;
    const g = withHer(b.w, b.c, 'hera');
    dragonSong(withRng(b.c, never()), g);
    expect(b.events.some((e) => e.type === 'fight_start')).toBe(true);
    expect(texts(a.events) && texts(b.events)).toBe(true);
  });
});
