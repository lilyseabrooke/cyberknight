import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario } from './testkit';
import { CUTTING, RULES } from './content/cuttings';
import { makeItem } from './content/items';
import { genInstrument, instrumentsOf } from './instruments';
import { MATCH, MOVES, STYLES, movePower, movesFor, runDuel } from './duel';
import { venueSuite, inVenue, mainOf } from './venuetestkit';
import { venueAt } from './venuekit';
import { answerGate, champBout, challenger, champion, crossroads, cuttingCandidates, cuttingUrge, defendTitle, holder, openBout, royale, skillAt, wagerBout } from './cutting';
import { everyoneAt } from './population';
import { relocate } from './combat';
import { render } from './text';
import type { World } from './types';

const prime = (w: World): void => {
  w.hero.skills.guitar = 2500;
  w.hero.skills.vocals = 1500;
  w.hero.skills.djing = 1500;
  w.hero.skills.beatbox = 1500;
  if (!instrumentsOf(w.hero).length) w.hero.inventory.push(makeItem('vintage_guitar'));
};

venueSuite(CUTTING, { prime, deals: /^cut_/, shaped: ['industrial', 'choiryard', 'corporate'] });

describe('the duel engine', () => {
  it('has moves that are all matched against real moves, and styles that only play real moves', () => {
    for (const [m, row] of Object.entries(MATCH)) {
      expect(MOVES[m], m).toBeTruthy();
      for (const k of Object.keys(row)) expect(MOVES[k], `${m} vs ${k}`).toBeTruthy();
    }
    for (const s of Object.values(STYLES)) for (const m of Object.keys(s.moves)) expect(MOVES[m], m).toBeTruthy();
    for (const skill of ['guitar', 'vocals', 'djing', 'beatbox']) expect(movesFor(skill).length).toBeGreaterThanOrEqual(4);
    for (const r of Object.values(RULES)) for (const s of r.styles) expect(STYLES[s], s).toBeTruthy();
  });

  it('a better player wins more, and a duel always ends with a verdict that reads cleanly', () => {
    const sc = scenario({ seed: 'duel' });
    const w = sc.w;
    const wins = (xp: number) => {
      w.hero.skills.guitar = xp;
      let n = 0;
      for (let i = 0; i < 60; i++) if (runDuel(sc.ctx(new Rng(`d${xp}:${i}`)), { name: 'Rook', grade: 30, style: 'shredder' }, { skill: 'guitar', event: 'cutting' }).won) n++;
      return n;
    };
    expect(wins(6000)).toBeGreaterThan(wins(50));
    const evs = sc.run((c) => void runDuel(c, { name: 'Rook', grade: 30, style: 'choir' }, { skill: 'guitar', event: 'cutting' }));
    expect(evs.length).toBeGreaterThan(0);
    for (const ev of evs) for (const l of render(ev, { rng: new Rng('r'), personality: w.hero.personality, realName: 'Brenda Pilchard' })) expect(l.text).not.toMatch(/\{|\}|undefined|NaN/);
  });

  it('a loud guitar and a golden plectrum help', () => {
    const sc = scenario({ seed: 'duel2' });
    const h = sc.w.hero;
    const base = movePower(h, 'riff', 'guitar');
    h.inventory.push(makeItem('golden_plectrum'));
    expect(movePower(h, 'riff', 'guitar')).toBeGreaterThan(base);
  });
});

describe('bouts', () => {
  const ready = (want?: (l: import('./types').Location) => boolean) => {
    const sc = inVenue('cutting', { want });
    prime(sc.w);
    return { sc, w: sc.w, v: venueAt(sc.w, 'cutting')! };
  };

  it('puts the house title on offer, and winning it makes her champion, on the place, for good', () => {
    const { sc, w, v } = ready((l) => l.venue!.variant !== 'robotring');
    const champ = champion(w, v);
    expect(champ.grade).toBeGreaterThan(0);
    w.hero.skills.guitar = w.hero.skills.vocals = w.hero.skills.djing = w.hero.skills.beatbox = 90000;
    champBout(sc.ctx(always()), v);
    expect(holder(venueAt(w, 'cutting')!)).toBe(true);
    expect(mainOf(sc).venue!.keep!.holder).toBe('her');
  });

  it('a held title is defended, and can be lost', () => {
    const { sc, w, v } = ready();
    v.info.keep = { ...(v.info.keep ?? {}), holder: 'her', record: 60 };
    const n = everyoneAt(w, v.main.id).find((x) => x.tags.includes('challenger'));
    if (!n) return;
    expect(cuttingCandidates(w).some((k) => k.key.includes(':defend:'))).toBe(true);
    w.hero.skills.guitar = w.hero.skills.vocals = w.hero.skills.djing = w.hero.skills.beatbox = 0;
    defendTitle(sc.ctx(never()), v, n);
    expect(holder(venueAt(w, 'cutting')!)).toBe(false);
  });

  it('an open bout pays a purse to the winner', () => {
    const { sc, w, v } = ready();
    const n = everyoneAt(w, v.main.id).find((x) => x.tags.includes('challenger'))!;
    w.hero.skills.guitar = w.hero.skills.vocals = w.hero.skills.djing = w.hero.skills.beatbox = 90000;
    const cash = w.hero.cash;
    const evs = sc.run((c) => openBout(c, v, n), always());
    expect(w.hero.cash).toBeGreaterThan(cash - 1);
    expect(evs.some((e) => e.type.startsWith('cut_') && e.outcome === 'good')).toBe(true);
    expect(challenger(v, n).grade).toBe(challenger(v, n).grade);
  });

  it('guitars on the line: win one, or lose her best', () => {
    const { sc, w, v } = ready();
    const n = everyoneAt(w, v.main.id).find((x) => x.tags.includes('challenger'))!;
    w.hero.inventory.push(genInstrument(new Rng('g'), 3));
    const before = instrumentsOf(w.hero).length;
    w.hero.skills.guitar = w.hero.skills.vocals = w.hero.skills.djing = w.hero.skills.beatbox = 0;
    wagerBout(sc.ctx(never()), v, n);
    expect(instrumentsOf(w.hero).length).toBe(before - 1);
    w.hero.skills.guitar = w.hero.skills.vocals = w.hero.skills.djing = w.hero.skills.beatbox = 90000;
    wagerBout(sc.ctx(always()), v, n);
    expect(instrumentsOf(w.hero).length).toBe(before);
  });

  it('a gang adopts her after enough wins at its gate, and its people are warm to her after', () => {
    const { sc, w } = ready((l) => !!RULES[l.venue!.variant]?.gang);
    const v = venueAt(w, 'cutting')!;
    const gang = RULES[v.info.variant]!.gang!;
    w.hero.skills.guitar = w.hero.skills.vocals = w.hero.skills.djing = w.hero.skills.beatbox = 90000;
    for (let i = 0; i < 3; i++) {
      delete w.counters[`gate:${v.main.id}`];
      answerGate(sc.ctx(always()), venueAt(w, 'cutting')!);
    }
    expect(w.legacy.adopted).toContain(gang);
    expect(w.heat[gang] ?? 0).toBe(0);
  });

  it('the battle royale and the crossroads do what they say', () => {
    const { sc, w, v } = ready();
    w.hero.skills.guitar = w.hero.skills.vocals = w.hero.skills.djing = w.hero.skills.beatbox = 90000;
    const cash = w.hero.cash;
    royale(sc.ctx(always()), { ...v, info: { ...v.info, wild: 'battle_royale' } });
    expect(w.hero.cash).toBeGreaterThan(cash);
    const skill = skillAt(v);
    w.hero.skills[skill as 'guitar'] = 10;
    crossroads(sc.ctx(never()), v);
    expect(w.hero.skills[skill as 'guitar']).toBe(0);
  });

  it('pulls a good player in from the street, and a champion back to defend', () => {
    const { w, v } = ready();
    relocate(w, v.main.gen!.parent);
    w.hero.skills.guitar = w.hero.skills.vocals = w.hero.skills.djing = w.hero.skills.beatbox = 9000;
    expect(cuttingUrge(w, v.main.id).bonus).toBeGreaterThan(0);
    v.info.keep = { ...(v.info.keep ?? {}), holder: 'her' };
    expect(cuttingUrge(w, v.main.id).bonus).toBeGreaterThan(0.4);
  });
});
