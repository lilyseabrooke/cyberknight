import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { always, never, scenario, type Scenario } from './testkit';
import { genInstrument, instrumentsOf } from './instruments';
import { askToJoin, bandCandidates, bandmates, bandTick, carry, lockupJam, residencyNight, SPONSOR_LEVEL } from './band';
import { bandBonus, newCompanion } from './companions';
import { skillValue } from './skills';
import { moveNpc, npcsAt } from './population';
import { playBooking } from './bookings';
import { block, streetOf } from './renown';
import { render } from './text';
import { HOMES } from './content/realty';
import { JOBS } from './content/stations';
import type { GameEvent } from './events';
import type { Npc, World } from './types';

const clean = (evs: GameEvent[], w: World): string[] =>
  evs.flatMap((ev) => render(ev, { rng: new Rng('r'), personality: w.hero.personality, realName: 'Brenda Pilchard' }).map((l) => l.text)).filter((t) => /\{|\}|undefined|NaN/.test(t));

/** Her, a guitar, and a musician in the room with her. */
function withMusician(seed = 'band'): { sc: Scenario; n: Npc } {
  const sc = scenario({ seed });
  const w = sc.w;
  if (!instrumentsOf(w.hero).length) w.hero.inventory.push(genInstrument(new Rng('bg'), 3));
  w.hero.skills.guitar = 3000;
  const n = Object.values(w.npcs).find((x) => x.alive && !x.hostile && !x.ephemeral && !x.tags.includes('owner') && !x.tags.includes('robot') && x.faction !== 'muse')!;
  moveNpc(w, n, w.hero.locationId);
  n.tags = [...n.tags.filter((t) => t !== 'stranger' && t !== 'dragon'), 'musician'];
  w.hero.companions = [];
  return { sc, n };
}

describe('the band', () => {
  it('a musician can be asked to join, once a night, and joins as a bandmate who makes her better', () => {
    const { sc, n } = withMusician();
    const w = sc.w;
    expect(bandCandidates(w).some((c) => c.key === `join_band:${n.id}`)).toBe(true);
    const before = skillValue(w.hero, 'guitar');
    const evs = sc.run((c) => askToJoin(c, n), always());
    expect(bandmates(w).length).toBe(1);
    expect(w.legacy.bandName).toBeTruthy();
    expect(skillValue(w.hero, 'guitar')).toBeGreaterThan(before);
    expect(bandBonus(w.hero, 'fighting')).toBe(0);
    expect(npcsAt(w, w.hero.locationId)).not.toContain(n);
    expect(clean(evs, w)).toEqual([]);
    expect(bandCandidates(w).some((c) => c.key === `join_band:${n.id}`)).toBe(false);
  });

  it('a no is a no for the night', () => {
    const { sc, n } = withMusician('band-no');
    const evs = sc.run((c) => askToJoin(c, n), never());
    expect(bandmates(sc.w).length).toBe(0);
    expect(sc.saw('band', 'no')).toBe(true);
    expect(clean(evs, sc.w)).toEqual([]);
    expect(bandCandidates(sc.w).some((c) => c.key === `join_band:${n.id}`)).toBe(false);
  });

  it('the bonus is capped, whatever the band', () => {
    const h = { companions: [1, 2, 3, 4, 5].map((i) => ({ ...newCompanion('musician', `M${i}`), level: 80 })) };
    expect(bandBonus(h, 'guitar')).toBe(4);
  });

  it('bands break up, for a reason', () => {
    const { sc } = withMusician('band-split');
    const w = sc.w;
    w.hero.companions = [newCompanion('musician', 'Dee'), newCompanion('musician', 'Rolo')];
    const evs = sc.run((c) => bandTick(c), always());
    expect(bandmates(w).length).toBe(0);
    expect(evs.filter((e) => e.type === 'band' && e.data.variant === 'left').length).toBe(2);
    expect(clean(evs, w)).toEqual([]);
    // Once a night.
    w.hero.companions = [newCompanion('musician', 'Dee')];
    sc.run((c) => bandTick(c), always());
    expect(bandmates(w).length).toBe(1);
  });
});

describe('the lockup', () => {
  it('is a home with room for a band, and bandmates can rehearse there for money', () => {
    expect(HOMES.lockup.berths).toBeGreaterThanOrEqual(4);
    expect(JOBS.rehearse!.needs).toContain('play');
  });

  it('jamming there trains her and the band', () => {
    const { sc } = withMusician('band-lockup');
    const w = sc.w;
    const a = newCompanion('musician', 'Dee');
    w.hero.companions = [a];
    const deed = { id: 'x#0', kind: 'lockup' as const, name: 'unit 4, Gasworks Arches', home: w.hero.locationId, quality: 0.7, price: 600, district: 'industrial' as const, run: 0 };
    (w.legacy.deeds ??= []).push(deed);
    expect(bandCandidates(w).some((c) => c.key.startsWith('band_jam:'))).toBe(true);
    const g = w.hero.skills.guitar ?? 0;
    const evs = sc.run((c) => lockupJam(c, deed));
    expect(w.hero.skills.guitar ?? 0).toBeGreaterThan(g);
    expect(a.xp ?? 0).toBeGreaterThan(0);
    expect(clean(evs, w)).toEqual([]);
    expect(bandCandidates(w).some((c) => c.key.startsWith('band_jam:'))).toBe(false);
  });
});

describe('sound that carries', () => {
  it('a loud set puts fans on the next streets', () => {
    const sc = scenario({ seed: 'carry' });
    const w = sc.w;
    const loc = w.locations[w.hero.locationId]!;
    const near = [...block(w, loc)].filter((id) => id !== streetOf(w, loc).id);
    expect(near.length).toBeGreaterThan(0);
    const before = near.reduce((s, id) => s + (w.locations[id]!.fans ?? 0), 0);
    sc.run((c) => carry(c, 5, 2, false), never());
    expect(near.reduce((s, id) => s + (w.locations[id]!.fans ?? 0), 0)).toBeGreaterThan(before);
  });

  it('late at night, somebody calls it in', () => {
    const sc = scenario({ seed: 'carry-late' });
    const w = sc.w;
    const street = streetOf(w, w.locations[w.hero.locationId]!);
    if (street.gen) street.gen.district = 'tenement';
    w.clock = Math.floor(w.clock / 1440) * 1440 + 1440 + 2 * 60;
    const heat = w.heat.npd ?? 0;
    const evs = sc.run((c) => carry(c, 5, 2, false), always());
    expect(sc.saw('band', 'noise')).toBe(true);
    expect(w.heat.npd ?? 0).toBeGreaterThan(heat);
    expect(clean(evs, w)).toEqual([]);
  });
});

describe('residencies and sponsors', () => {
  it('three good nights at a stage make a residency, which books itself every night and ends on a flop', () => {
    const sc = scenario({ seed: 'residency' });
    const w = sc.w;
    w.hero.skills.guitar = 90000;
    const loc = 'neon_pharaoh';
    for (let i = 0; i < 3; i++) {
      const b = { id: `b${i}`, loc, night: w.legacy.runs, skill: 'guitar', kind: 'gig' as const, pay: 100 };
      (w.legacy.bookings ??= []).push(b);
      sc.run((c) => playBooking(c, b), always());
      w.legacy.bookings = [];
    }
    expect(w.legacy.residency?.loc).toBe(loc);
    expect(sc.saw('band', 'residency')).toBe(true);
    const night = residencyNight(w)!;
    expect(night.residency).toBe(true);
    expect(night.pay).toBe(120);
    sc.run((c) => playBooking(c, night), never());
    expect(w.legacy.residency).toBeUndefined();
    expect(clean(sc.events, w)).toEqual([]);
  });

  it('a real name gets a sponsor, with gear and a stipend, and three flops lose it', () => {
    const sc = scenario({ seed: 'sponsor' });
    const w = sc.w;
    w.legacy.repute = { guitar: SPONSOR_LEVEL + 20 };
    const guitars = instrumentsOf(w.hero).length;
    sc.run((c) => bandTick(c), always());
    expect(w.legacy.sponsor).toBeTruthy();
    expect(instrumentsOf(w.hero).length).toBe(guitars + 1);
    w.counters.band_checked = 0;
    const cash = w.hero.cash;
    sc.run((c) => bandTick(c), never());
    expect(w.hero.cash).toBe(cash + w.legacy.sponsor!.stipend);
    for (let i = 0; i < 3; i++) {
      const b = { id: `f${i}`, loc: 'neon_pharaoh', night: w.legacy.runs, skill: 'guitar', kind: 'gig' as const, pay: 100 };
      sc.run((c) => playBooking(c, b), never());
    }
    expect(w.legacy.sponsor).toBeUndefined();
    expect(sc.saw('band', 'dropped')).toBe(true);
    expect(clean(sc.events, w)).toEqual([]);
  });
});
