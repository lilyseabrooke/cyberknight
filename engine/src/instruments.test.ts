import { describe, expect, it } from 'vitest';
import { Rng, hasTemplate, type GameEvent, type World } from './index';
import { createWorld } from './world';
import { INST_CLASSES, armed, bestTrait, genInstrument, hasInstrument, instOf } from './instruments';
import { skillValue } from './skills';
import { fameFrom } from './stage';
import { judgeSet } from './renown';
import { axeCandidates, drawOut } from './axeplay';
import { fight } from './combat';
import { scout } from './muse';
import { personalityFrom } from './personality';
import { spawnNpc } from './content/archetypes';
import { addNpc, moveNpc, npcsAt } from './population';
import { makeItem } from './content/items';
import { always } from './testkit';
import type { InstrumentFx, Item } from './types';
import { rollPawn } from './content/pawns';
import { ensureShelf, usefulness } from './pawnkit';

const ctxOf = (w: World, rng: Rng = new Rng('i')) => {
  const events: GameEvent[] = [];
  return { events, c: { w, rng, emit: (type: string, outcome: any, data: any = {}) => events.push({ beat: w.beat, type, outcome, data }) } };
};

/** A guitar with exactly these traits. */
function guitar(traits: Partial<InstrumentFx>, cls = 'electric'): Item {
  const it = genInstrument(new Rng('g'), 0, cls);
  it.inst = { cls, tier: 2, tone: 0, volume: 0, signature: 0, jacked: 0, hardened: 0, resonance: 0, feedback: 0, ...traits };
  return armed({ ...it, kind: 'loot', power: 0, fx: undefined, tags: ['instrument', 'guitar'] });
}

describe('rolled instruments', () => {
  it('a class, a tier and traits; the same seed rolls the same guitar; better tiers roll more', () => {
    const a = genInstrument(new Rng('same'), 4);
    const b = genInstrument(new Rng('same'), 4);
    expect(a).toEqual(b);
    expect(a.tags).toContain('instrument');
    expect(INST_CLASSES[a.inst!.cls]).toBeDefined();
    const sum = (it: Item) => (['volume', 'signature', 'jacked', 'hardened', 'resonance', 'feedback', 'tone'] as const).reduce((n, k) => n + it.inst![k], 0);
    let low = 0, high = 0;
    for (let i = 0; i < 40; i++) {
      low += sum(genInstrument(new Rng(`l${i}`), 0));
      high += sum(genInstrument(new Rng(`h${i}`), 8));
    }
    expect(high).toBeGreaterThan(low);
  });

  it('a hardened guitar is a weapon too; a chainsaw guitar always is; resonance and feedback show up in the swing', () => {
    expect(guitar({}).kind).toBe('loot');
    const club = guitar({ hardened: 1, resonance: 2, resonates: 'robot', feedback: 2 });
    expect(club.kind).toBe('weapon');
    expect(club.fx!.vs.robot).toBeGreaterThan(1);
    expect(club.fx!.stun).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) {
      const saw = genInstrument(new Rng(`saw${i}`), 3, 'chainsaw');
      expect(saw.kind).toBe('weapon');
      expect(saw.fx!.cls).toBe('blade');
    }
  });

  it('the classic guitars read as instruments; a horn is not a guitar', () => {
    expect(instOf(makeItem('vintage_guitar'))!.tone).toBe(2);
    expect(instOf(makeItem('relic_guitar'))!.signature).toBe(3);
    expect(instOf(makeItem('brass_horn'))).toBeUndefined();
  });
});

describe('what the traits do', () => {
  it('tone adds levels to her guitar, carried or in her hands; a keytar also helps her DJ', () => {
    const w = createWorld({ seed: 'tone' });
    const base = skillValue(w.hero, 'guitar');
    w.hero.inventory.push(guitar({ tone: 2 }));
    expect(skillValue(w.hero, 'guitar')).toBe(base + 2);
    expect(skillValue(w.hero, 'djing')).toBe(skillValue(createWorld({ seed: 'tone' }).hero, 'djing'));
    const swung = guitar({ tone: 3, hardened: 1 });
    w.hero.weapon = swung;
    expect(skillValue(w.hero, 'guitar')).toBe(base + 3);
    expect(hasInstrument(w.hero)).toBe(true);
    w.hero.inventory.push(guitar({ tone: 1 }, 'keytar'));
    expect(bestTrait(w.hero, 'djing', 'tone')).toBe(1);
  });

  it('a loud guitar earns more from the same set', () => {
    const quiet = createWorld({ seed: 'vol' });
    quiet.hero.locationId = 'halo_floor';
    const loud = createWorld({ seed: 'vol' });
    loud.hero.locationId = 'halo_floor';
    loud.hero.inventory.push(guitar({ volume: 3 }));
    expect(fameFrom(ctxOf(loud).c, 2, 'gig')).toBeGreaterThan(fameFrom(ctxOf(quiet).c, 2, 'gig'));
  });

  it('a famous player\'s guitar buys the benefit of the doubt', () => {
    const set = (sig: number) => {
      const w = createWorld({ seed: 'sig' });
      w.hero.locationId = 'halo_floor';
      w.hero.fame = 200;
      w.legacy.repute = { guitar: 8 };
      if (sig) w.hero.inventory.push(guitar({ signature: sig }));
      const { c, events } = ctxOf(w);
      judgeSet(c, 'busk', 'guitar', [{ beat: 0, type: 'busk', outcome: 'bad', data: {} }]);
      return events.some((e) => e.type === 'letdown');
    };
    expect(set(0)).toBe(true);
    expect(set(3)).toBe(false);
  });
});

describe('doors a guitar opens', () => {
  it('loud enough, she can draw the guards out of a place onto the street', () => {
    const w = createWorld({ seed: 'drawout' });
    w.hero.locationId = 'street_main';
    for (const n of npcsAt(w, 'neon_pharaoh')) moveNpc(w, n, '_gone');
    for (let i = 0; i < 3; i++) addNpc(w, spawnNpc(new Rng(`sec${i}`), `sec${i}`, 'club_security', 'neon_pharaoh', {}));
    expect(axeCandidates(w)).toHaveLength(0);
    w.hero.inventory.push(guitar({ volume: 2 }));
    expect(axeCandidates(w).map((x) => x.key)).toContain('draw_out:neon_pharaoh');
    const { c, events } = ctxOf(w, always());
    drawOut(c, 'neon_pharaoh');
    expect(npcsAt(w, 'neon_pharaoh').filter((n) => n.tags.includes('security'))).toHaveLength(0);
    expect(npcsAt(w, 'street_main').filter((n) => n.tags.includes('security')).length).toBe(3);
    const e = events.find((x) => x.type === 'draw_out')!;
    expect(hasTemplate(e)).toBe(true);
  });

  it('at a private booking, the guitar case means she starts it first', () => {
    const w = createWorld({ seed: 'case' });
    w.hero.locationId = 'halo_backroom';
    w.hero.inventory.push(makeItem('guitar_case'));
    w.legacy.bookings = [{ id: 'b', loc: 'halo_backroom', night: w.legacy.runs, skill: 'guitar', kind: 'private', pay: 100, played: true }];
    const mark = spawnNpc(new Rng('mark'), 'mark', 'drifter', 'halo_backroom', {});
    addNpc(w, mark);
    const { c, events } = ctxOf(w);
    fight(c, [mark], { cause: 'test', assault: true, joiners: false });
    const e = events.find((x) => x.type === 'guitar_case')!;
    expect(e).toBeDefined();
    expect(hasTemplate(e)).toBe(true);
  });

  it('signing with Muse comes with a wired Muse guitar', () => {
    const w = createWorld({ seed: 'muse-axe', personality: personalityFrom({ greed: 1, fame: 1, vanity: 1, artistry: 0, justice: 0, mischief: 0 }) });
    expect(scout(ctxOf(w, new Rng('s')).c, 100)).toBe(true);
    const axe = w.hero.inventory.find((i) => i.inst);
    expect(axe!.inst!.jacked).toBeGreaterThanOrEqual(1);
  });
});

describe('where guitars come from', () => {
  it('an instrument exchange stocks rolled guitars, and they stay on the shelf', () => {
    let found = 0;
    for (let i = 0; i < 60 && !found; i++) {
      const r = rollPawn(new Rng(`inst:${i}`), 'nightlife', 3);
      if (r.info.variant !== 'instruments') continue;
      const w = createWorld({ seed: `shop${i}` });
      const main = w.locations.street_main!;
      main.pawn = r.info;
      ensureShelf(w, main);
      ensureShelf(w, main);
      found = main.shelf!.filter((l) => l.item.inst).length;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('a guitarist wants a better guitar; a plain step down is worth nothing to her', () => {
    const w = createWorld({ seed: 'want' });
    w.hero.inventory.push(guitar({ tone: 2 }));
    expect(usefulness(w.hero, guitar({ tone: 3, volume: 2 }))).toBeGreaterThan(0);
    expect(usefulness(w.hero, guitar({ tone: 1 }))).toBe(0);
  });
});
