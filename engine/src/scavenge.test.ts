import { describe, expect, it } from 'vitest';
import { always, never, scenario } from './testkit';
import { addSpot, childId } from './mapgen';
import { relocate, kill } from './combat';
import { garrisonAlive } from './dungeons';
import { SPOTS, SPOT_KEYS, spotParts } from './content/spots';
import { PARTS } from './content/parts';
import { totalParts } from './content/parts';
import { render } from './text';
import { Rng } from './rng';

function spotAt(key: string, tier = 2) {
  const sc = scenario({ seed: `scav-${key}`, at: 'street_main' });
  const street = sc.w.locations[childId('street_main', 0)]!;
  const e = addSpot(sc.w, street, key, 60, tier);
  relocate(sc.w, e.id);
  sc.w.hero.parts = {};
  return { sc, w: sc.w, e };
}
const clear = (sc: ReturnType<typeof spotAt>) => sc.sc.run((c) => { for (const n of garrisonAlive(sc.w, sc.w.dungeons[sc.e.id]!)) kill(c, sc.w, n, 'test'); });

describe('parts to scavenge', () => {
  it('every spot has a table of parts that exist, and most have something to take', () => {
    let rich = 0;
    for (const k of SPOT_KEYS) {
      const p = spotParts(k);
      for (const id of Object.keys(p.weights)) expect(PARTS[id], `${k} ${id}`).toBeTruthy();
      if (p.rich > 0) rich++;
    }
    expect(rich / SPOT_KEYS.length).toBeGreaterThan(0.6);
    expect(SPOTS.chop_pop).toBeTruthy();
  });

  it('is free, once the people holding the place are gone: she leaves with parts and the spot is picked over for a few days', () => {
    const s = spotAt('scrapper_camp');
    expect(s.sc.offers().some((k) => k.startsWith('scavenge:'))).toBe(false);
    clear(s);
    const key = `scavenge:${s.e.id}`;
    const cash = s.w.hero.cash;
    const evs = s.sc.do(key, always());
    expect(totalParts(s.w.hero.parts)).toBeGreaterThan(2);
    expect(s.w.hero.cash).toBe(cash);
    const line = render(evs.find((e) => e.type === 'chop')!, { rng: new Rng('r'), personality: s.w.hero.personality, realName: 'B P' }).map((l) => l.text).join(' ');
    expect(line).not.toMatch(/\{|\}|undefined/);
    expect(s.sc.offers()).not.toContain(key);
    s.w.clock += 1440 * 4;
    expect(s.sc.offers()).toContain(key);
  });

  it('gets less on a bad day, and nothing from a place with nothing to strip', () => {
    const a = spotAt('scrapper_camp');
    clear(a);
    a.sc.do(`scavenge:${a.e.id}`, never());
    const bad = totalParts(a.w.hero.parts);
    const b = spotAt('scrapper_camp');
    clear(b);
    b.sc.do(`scavenge:${b.e.id}`, always());
    expect(bad).toBeGreaterThan(0);
    expect(bad).toBeLessThan(totalParts(b.w.hero.parts));
    const t = spotAt('turf_marker');
    clear(t);
    expect(t.sc.offers().some((k) => k.startsWith('scavenge:'))).toBe(false);
  });
});
