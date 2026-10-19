import { describe, expect, it } from 'vitest';
import { bandShare, clipped, lowEndSide, maxStep, monoLoss, width } from './analysis';

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

describe('stereo checks', () => {
  const n = SR;
  const tone = (hz: number) => Float32Array.from({ length: n }, (_, i) => 0.4 * Math.sin((2 * Math.PI * hz * i) / SR));

  it('reads a centred signal as mono: no side, no loss', () => {
    const x = tone(60);
    const st = { left: x, right: x.slice() };
    expect(lowEndSide(st, SR)).toBeLessThan(-100);
    expect(monoLoss(st)).toBeCloseTo(0, 5);
  });

  it('sees low end that is out of phase between the ears, and the loss it causes', () => {
    const x = tone(60);
    const st = { left: x, right: x.map((v) => -v) };
    expect(lowEndSide(st, SR)).toBeGreaterThan(30);
    expect(monoLoss(st)).toBeLessThan(-40);
  });

  it('measures width from the side level', () => {
    const l = tone(1000);
    const r = tone(1000).map((v, i) => v * (i % 2 ? 1 : 0.6));
    expect(width({ left: l, right: r })).toBeGreaterThan(-30);
  });
});
