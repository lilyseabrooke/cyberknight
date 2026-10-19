import { describe, expect, it } from 'vitest';
import { bandShare, clipped, maxStep } from './analysis';

const SR = 44100;
const sine = (hz: number, sec: number, amp = 0.5): Float32Array => Float32Array.from({ length: SR * sec }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

describe('render checks', () => {
  it('sees a low sine as all low band, and a saw as not', () => {
    expect(bandShare(sine(55, 1), SR, 20, 200)).toBeGreaterThan(-0.1);
    const saw = Float32Array.from({ length: SR }, (_, i) => (((55 * i) / SR) % 1) * 2 - 1);
    expect(bandShare(saw, SR, 200, 20000)).toBeGreaterThan(-12);
  });

  it('finds a click in an otherwise smooth sine', () => {
    const x = sine(55, 1);
    expect(maxStep(x)).toBeLessThan(0.01);
    x[20000] = 0.9;
    expect(maxStep(x)).toBeGreaterThan(0.3);
  });

  it('counts clipped samples', () => {
    expect(clipped(sine(100, 1, 0.9))).toBe(0);
    expect(clipped(sine(100, 1, 1.2))).toBeGreaterThan(0);
  });
});
