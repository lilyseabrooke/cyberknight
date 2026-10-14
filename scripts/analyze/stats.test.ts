import { describe, expect, it } from 'vitest';
import { compare, deathBucket, fmt, median, pct, summarize } from './stats';

describe('summaries', () => {
  it('mean and standard error', () => {
    const s = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.n).toBe(8);
    expect(s.se).toBeCloseTo(Math.sqrt(32 / 7 / 8), 6);
    expect(summarize([])).toEqual({ n: 0, mean: 0, se: 0 });
    expect(summarize([3])).toEqual({ n: 1, mean: 3, se: 0 });
  });

  it('median', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('is it real?', () => {
  const noisy = (mean: number) => ({ n: 100, mean, se: 5 });
  it('calls a swing inside the noise "same"', () => {
    expect(compare(noisy(100), noisy(108)).verdict).toBe('same');
    expect(compare(noisy(100), noisy(92)).verdict).toBe('same');
  });
  it('calls a swing outside the noise up or down', () => {
    expect(compare(noisy(100), noisy(130)).verdict).toBe('up');
    expect(compare(noisy(100), noisy(60)).verdict).toBe('down');
    expect(compare(noisy(100), noisy(130)).delta).toBe(30);
  });
  it('handles zero noise', () => {
    expect(compare({ n: 5, mean: 1, se: 0 }, { n: 5, mean: 1, se: 0 }).verdict).toBe('same');
    expect(compare({ n: 5, mean: 1, se: 0 }, { n: 5, mean: 2, se: 0 }).verdict).toBe('up');
  });
});

describe('formatting and buckets', () => {
  it('formats', () => {
    expect(pct(0.256)).toBe('26%');
    expect(fmt(3.14159, 2)).toBe('3.14');
    expect(fmt(12345.6)).toBe('12,346');
    expect(fmt(NaN)).toBe('-');
  });
  it('buckets death causes', () => {
    expect(deathBucket('an NPD ambush')).toBe('police');
    expect(deathBucket('an NPD drone sweep')).toBe('police');
    expect(deathBucket('a Hera Mk. V')).toBe('dragons');
    expect(deathBucket('an Atlas retrieval team')).toBe('corp security');
    expect(deathBucket('jealousy over Vesper')).toBe('romance & grudges');
    expect(deathBucket('a mugging')).toBe('gangs & muggers');
    expect(deathBucket('misadventure')).toBe('misadventure');
    expect(deathBucket('something strange')).toBe('other');
  });
});
