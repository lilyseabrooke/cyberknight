import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario } from './testkit';
import { LUTHIER, JOBS } from './content/luthiers';
import { makeItem } from './content/items';
import { genInstrument, instrumentBonus, instrumentsOf } from './instruments';
import { venueSuite, inVenue } from './venuetestkit';
import { venueAt } from './venuekit';
import { buyBack, buybackPrice, collect, graft, inWindow, jobsAt, JOBS_BY, leave, luthierCandidates, luthierUrge, takeMasterpiece, ticketsAt } from './luthier';
import { addDeed, loseGuitars, playing, provenanceTap, resurface, storyBonus } from './provenance';
import { endRun, beginRun } from './universe';
import { relocate } from './combat';
import { makeCtx } from './run';
import type { World } from './types';

const prime = (w: World): void => {
  w.hero.skills.guitar = 2500;
  if (!instrumentsOf(w.hero).length) w.hero.inventory.push(genInstrument(new Rng('prime'), 3));
  w.legacy.lostGuitars = [genInstrument(new Rng('lost'), 4)];
  w.legacy.lostGuitars[0]!.inst!.hers = true;
};

venueSuite(LUTHIER, { prime, deals: /^(luthbench|collect|buyback|graft|masterpiece)/, shaped: ['industrial', 'welder', 'corporate'] });

describe('provenance', () => {
  it('a great night goes on the guitar she played it with, and a storied guitar plays better', () => {
    const sc = scenario({ seed: 'prov' });
    const w = sc.w;
    const g = genInstrument(new Rng('p1'), 2);
    w.hero.inventory.push(g);
    const before = instrumentBonus(w.hero, 'guitar');
    for (const t of ['dragon_song', 'storm_solo', 'riot', 'march', 'cordon_teardown', 'chart_war']) provenanceTap(w, t, 'good', { place: 'the Overpass' });
    expect(g.inst!.story!.length).toBe(6);
    expect(storyBonus(g)).toBe(2);
    expect(instrumentBonus(w.hero, 'guitar')).toBeGreaterThan(before);
    expect(g.inst!.signature).toBeGreaterThanOrEqual(1);
    expect(g.name).toMatch(/^storied /);
    // Nothing for an ordinary night, and never the same line twice.
    provenanceTap(w, 'dragon_song', 'good', {});
    provenanceTap(w, 'sing_busk', 'good', {});
    expect(g.inst!.story!.length).toBe(6);
    expect(addDeed(makeItem('excalibur'), 'x')).toBe(false);
  });

  it('her guitars go back to the city at the end of a night, and come back', () => {
    const sc = scenario({ seed: 'lost' });
    const w = sc.w;
    const g = genInstrument(new Rng('p2'), 4);
    w.hero.inventory.push(g);
    loseGuitars(w, true);
    expect(w.legacy.lostGuitars!.length).toBe(1);
    expect(w.legacy.lostGuitars![0]!.inst!.hers).toBe(true);
    expect(w.legacy.lostGuitars![0]!.inst!.story!.some((s) => /died/.test(s))).toBe(true);
    const back = resurface(w, new Rng('r'));
    expect(back?.name).toBe(g.name);
    expect(w.legacy.lostGuitars!.length).toBe(0);
  });

  it('the end of a real night sends them back to the city', () => {
    const sc = scenario({ seed: 'endrun' });
    const w = sc.w;
    w.hero.inventory.push(genInstrument(new Rng('p3'), 4));
    const u = endRun(w);
    expect(u.legacy.lostGuitars?.length).toBeGreaterThan(0);
    const next = beginRun(u, { seed: 'next' });
    expect(next.legacy.lostGuitars?.length).toBeGreaterThan(0);
  });
});

describe('the bench', () => {
  const at = (want?: (l: import('./types').Location) => boolean) => {
    const sc = inVenue('luthier', { want });
    prime(sc.w);
    return { sc, w: sc.w, v: venueAt(sc.w, 'luthier')! };
  };

  it('every kind of luthier offers jobs that exist', () => {
    for (const [k, jobs] of Object.entries(JOBS_BY)) {
      expect(LUTHIER.variants[k], k).toBeTruthy();
      for (const j of jobs) expect(JOBS[j], j).toBeTruthy();
    }
  });

  it('a guitar left on the bench is not on her, waits through a death, and comes back improved', () => {
    const { sc, w, v } = at((l) => JOBS_BY[l.venue!.variant]!.some((j) => ['setup', 'loud', 'harden', 'jack', 'resonate', 'feedback'].includes(j)));
    const job = jobsAt(v).find((j) => ['setup', 'loud', 'harden', 'jack', 'resonate', 'feedback'].includes(j))!;
    const g = playing(w.hero)!;
    for (const k of ['tone', 'volume', 'hardened', 'jacked', 'resonance', 'feedback'] as const) g.inst![k] = 0;
    const t = leave(sc.ctx(), v, job, g)!;
    expect(t).toBeTruthy();
    expect(instrumentsOf(w.hero)).not.toContain(g);
    // A death later...
    const u = endRun(w);
    expect(u.legacy.tickets!.some((x) => x.id === t.id)).toBe(true);
    const w2 = beginRun(u, { seed: 'later' });
    w2.clock = t.ready + 1;
    relocate(w2, v.main.id);
    expect(luthierCandidates(w2).some((c) => c.key === `collect:${t.id}`)).toBe(true);
    collect(makeCtx(w2, new Rng('c2'), []), venueAt(w2, 'luthier')!, w2.legacy.tickets!.find((x) => x.id === t.id)!);
    expect(ticketsAt(w2, v.main.id).some((x) => x.id === t.id)).toBe(false);
  });

  it('a commission is a new guitar, ready in days', () => {
    const { sc, w, v } = at((l) => JOBS_BY[l.venue!.variant]!.includes('commission'));
    const t = leave(sc.ctx(), v, 'commission')!;
    expect(t.item.inst).toBeTruthy();
    expect(t.ready).toBeGreaterThan(w.clock);
    w.clock = t.ready;
    const n = instrumentsOf(w.hero).length;
    collect(sc.ctx(), venueAt(w, 'luthier')!, t);
    expect(instrumentsOf(w.hero).length).toBe(n + 1);
  });

  it('her own old guitar can be in the window, and buying it back takes it off the city\'s list', () => {
    const { sc, w } = at((l) => l.venue!.variant === 'secondhand' || l.venue!.traits.includes('lost_and_found'));
    const v = venueAt(w, 'luthier')!;
    w.legacy.runs = 0;
    let old = inWindow(w, v);
    for (let r = 1; !old && r < 30; r++) {
      w.legacy.runs = r;
      old = inWindow(w, v);
    }
    expect(old).toBeTruthy();
    w.hero.cash = buybackPrice(old!) + 10;
    buyBack(sc.ctx(), v, old!);
    expect(w.hero.inventory).toContain(old);
    expect(w.legacy.lostGuitars!.includes(old!)).toBe(false);
  });

  it('a graft moves a trait and spends the donor', () => {
    const { sc, w, v } = at();
    const a = genInstrument(new Rng('ga'), 2);
    const b = genInstrument(new Rng('gb'), 2);
    a.inst!.volume = 0;
    b.inst!.volume = 3;
    w.hero.inventory = [a, b];
    graft(sc.ctx(always()), v, b, a, 'volume');
    expect(a.inst!.volume).toBe(3);
    expect(w.hero.inventory).not.toContain(b);
  });

  it('the recluse\'s guitar of the year can be bought, once', () => {
    const { sc, w } = at((l) => l.venue!.variant === 'recluse');
    const v = venueAt(w, 'luthier')!;
    w.hero.cash = 99999;
    takeMasterpiece(sc.ctx(), v, 'buy');
    expect(w.hero.inventory.some((i) => /this year's guitar/.test(i.name))).toBe(true);
    expect(Number(v.info.keep!.masterpiece)).toBe(0);
    takeMasterpiece(sc.ctx(never()), v, 'earn');
    expect(w.hero.inventory.filter((i) => /this year's guitar/.test(i.name)).length).toBe(1);
  });

  it('pulls her back to a ticket that is ready', () => {
    const { sc, w, v } = at();
    const t = leave(sc.ctx(), v, jobsAt(v)[0]!, playing(w.hero)) ?? leave(sc.ctx(), v, 'store', playing(w.hero));
    if (!t) return;
    w.clock = t.ready + 1;
    relocate(w, v.main.gen!.parent);
    expect(luthierUrge(w, v.main.id).bonus).toBeGreaterThan(0.5);
  });
});
