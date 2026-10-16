import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { ARCHETYPES, AXES, blendOf, districtWeights, generateDistrict, generateDistricts, rollVector } from './districtgen';

const sample = (n: number, seed = 'dg', o = {}) => generateDistricts(new Rng(seed), n, o);

describe('district generator', () => {
  it('is deterministic per seed, and different between seeds', () => {
    expect(sample(20, 'a')).toEqual(sample(20, 'a'));
    expect(sample(20, 'a')).not.toEqual(sample(20, 'b'));
  });

  it('keeps every axis in 0..1 and every blend a proper share-out', () => {
    for (const d of sample(300)) {
      for (const k of AXES) expect(d.vector[k]).toBeGreaterThanOrEqual(0), expect(d.vector[k]).toBeLessThanOrEqual(1);
      expect(d.blend.reduce((s, e) => s + e.weight, 0)).toBeCloseTo(1, 6);
      expect(d.blend[0]!.id).toBe(d.dominant);
      expect(Object.values(districtWeights(d.blend)).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
      expect(d.name).toBeTruthy();
      expect(d.blurb).toBeTruthy();
    }
  });

  it('is a spectrum, not six boxes: plenty of districts sit between archetypes', () => {
    const ds = sample(400);
    expect(ds.filter((d) => d.secondary).length).toBeGreaterThan(ds.length * 0.25);
    expect(ds.filter((d) => d.purity > 0.9).length).toBeLessThan(ds.length * 0.5);
    // And the whole range turns up.
    const seen = new Set(ds.map((d) => d.dominant));
    for (const a of ARCHETYPES) expect(seen.has(a.id)).toBe(true);
  });

  it('a district leaning on an archetype looks like it', () => {
    for (const a of ARCHETYPES) {
      const ds = sample(60, `lean-${a.id}`, { lean: a.id });
      const hits = ds.filter((d) => d.dominant === a.id || d.secondary === a.id).length;
      expect(hits).toBeGreaterThan(ds.length * 0.6);
    }
  });

  it('a snapped-to anchor blends mostly to itself', () => {
    for (const a of ARCHETYPES) expect(blendOf(a.at)[0]!.id).toBe(a.id);
  });

  it('neighbours shade into each other', () => {
    const home = generateDistrict(new Rng('home'), { lean: 'corporate' });
    let near = 0, far = 0;
    for (let i = 0; i < 100; i++) {
      const next = rollVector(new Rng(`n${i}`), { near: home.vector });
      const free = rollVector(new Rng(`n${i}`));
      for (const k of AXES) { near += Math.abs(next[k] - home.vector[k]); far += Math.abs(free[k] - home.vector[k]); }
    }
    expect(near).toBeLessThan(far);
  });

  it('reads gameplay off the vector: policed places are more secure, rough ones more dangerous', () => {
    const policed = sample(100, 'p', { lean: 'enclave', hybrid: 0 });
    const rough = sample(100, 'r', { lean: 'slum', hybrid: 0 });
    const avg = (ds: typeof policed, f: (d: (typeof policed)[number]) => number) => ds.reduce((s, d) => s + f(d), 0) / ds.length;
    expect(avg(policed, (d) => d.security)).toBeGreaterThan(avg(rough, (d) => d.security));
    expect(avg(rough, (d) => d.danger)).toBeGreaterThan(avg(policed, (d) => d.danger));
    expect(avg(policed, (d) => d.richness)).toBeGreaterThan(avg(rough, (d) => d.richness));
  });

  it('rewording never moves a district: the point comes before the prose', () => {
    const a = new Rng('same'), b = new Rng('same');
    expect(rollVector(a)).toEqual(generateDistrict(b).vector);
  });
});
