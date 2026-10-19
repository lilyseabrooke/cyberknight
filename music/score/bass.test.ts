import { describe, expect, it } from 'vitest';
import { Conductor } from './conductor';
import { BASS_STYLES, BassPart, KICK_STEPS, barShape, contourAt, newBass, velocityAt, type BassMaterial, type BassStyle } from './roles/bass';
import { buildChord } from './theory';
import type { HarmonyBar, NoteEvent } from './types';

/** One bar of E minor, held. */
const E_MINOR: HarmonyBar = { key: 4, mode: 'aeolian', segments: [{ from: 0, to: 16, chord: buildChord({ degree: 0 }, 4, 'aeolian') }], pedal: false, tension: [] };
const macros = (a: number, o: Record<string, number> = {}) => ({ aggression: a, syncopation: a, density: Math.max(0.4, a), darkness: 0.3, drive: 0, ...o });
const render = (b: BassMaterial, m: Record<string, number>, bar: number) => new BassPart(b).render(E_MINOR, m, bar, 300);
const phrase = (style: BassStyle, seed: number, m: Record<string, number>): NoteEvent[][] => {
  const part = new BassPart(newBass(seed, style));
  return [0, 1, 2, 3].map((bar) => part.render(E_MINOR, m, bar, 300).notes);
};

describe('bass styles', () => {
  it('gives different pieces different basslines: every style turns up across seeds', () => {
    const seen = new Set<BassStyle>();
    for (let seed = 0; seed < 60; seed++) seen.add(newBass(seed).style);
    expect(seen).toEqual(new Set(BASS_STYLES));
  });

  it('holds: one long note per chord, swelling, sweeping and (when rough) wobbling, then dropping out', () => {
    for (let seed = 0; seed < 20; seed++) {
      const bars = phrase('hold', seed, macros(0.6, { drive: 0.5 }));
      const notes = bars.flat();
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.dur).toBeGreaterThanOrEqual(4);
        expect(n.shape?.sweep).toBeGreaterThan(1);
        expect(n.shape?.wobble?.period).toBe(2);
      }
      // Every hold shape has silence in it: a half bar at least, often a whole one.
      const sounding = bars.reduce((s, b) => s + b.reduce((x, n) => x + n.dur, 0), 0);
      expect(sounding).toBeLessThan(64);
    }
  });

  it('rolls: straight 8ths, on the root on every beat', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const notes of phrase('roll', seed, macros(0.5))) {
        for (const n of notes) {
          expect(n.t % 2).toBe(0);
          if (n.t % 4 === 0) expect(n.note).toBe(40);
        }
      }
    }
  });

  it('is locked at aggression 0 whatever the style: only roots, no slides, and pulses and riffs sit on locked steps', () => {
    const locked = new Set([...KICK_STEPS, 2, 6, 10, 14]);
    for (const style of BASS_STYLES) {
      for (let seed = 0; seed < 30; seed++) {
        for (const notes of phrase(style, seed, macros(0, { density: 0.5 }))) {
          for (const n of notes) {
            expect(n.note).toBe(40);
            expect(n.slide).toBeFalsy();
            if (style === 'pulse' || style === 'riff') expect(locked.has(n.t)).toBe(true);
          }
        }
      }
    }
  });

  it('only riffs get syncopated: at aggression 1 most riff notes are off the kick', () => {
    let off = 0;
    let total = 0;
    for (let seed = 0; seed < 50; seed++) {
      const notes = render(newBass(seed, 'riff'), macros(1), 0).notes;
      total += notes.length;
      off += notes.filter((n) => !KICK_STEPS.includes(n.t)).length;
    }
    expect(off / total).toBeGreaterThan(0.6);
  });

  it('keeps a riff the same riff as aggression moves', () => {
    const b = newBass(77, 'riff');
    const lo = new Set(render(b, macros(0.4), 0).notes.map((n) => n.t));
    const hi = new Set(render(b, macros(0.6), 0).notes.map((n) => n.t));
    const shared = [...lo].filter((t) => hi.has(t)).length;
    expect(shared / Math.min(lo.size, hi.size)).toBeGreaterThan(0.6);
  });

  it('never lets a note run past its bar or overlap the next one', () => {
    for (const style of BASS_STYLES) {
      for (let seed = 0; seed < 20; seed++) {
        for (const notes of phrase(style, seed, macros(seed / 20))) {
          notes.forEach((n, i) => {
            const next = notes[i + 1];
            expect(n.t + n.dur).toBeLessThanOrEqual((next ? next.t : 16) + 1e-9);
          });
        }
      }
    }
  });
});

describe('a heavier, stiller bass', () => {
  it('moves by small steps: holds, rolls and pulses barely leave the root', () => {
    for (const style of ['hold', 'roll', 'pulse'] as BassStyle[]) {
      let moves = 0;
      let total = 0;
      for (let seed = 0; seed < 30; seed++) {
        const notes = phrase(style, seed, macros(0.8, { darkness: 0.7 })).flat();
        for (let i = 1; i < notes.length; i++) {
          total += Math.abs(notes[i]!.note! - notes[i - 1]!.note!);
          moves++;
        }
      }
      expect(total / Math.max(1, moves), style).toBeLessThan(1.5);
    }
  });

  it('never leaps more than an octave, and only riffs leap at all', () => {
    for (const style of BASS_STYLES) {
      for (let seed = 0; seed < 30; seed++) {
        for (const n of phrase(style, seed, macros(1, { darkness: 0.8 })).flat()) {
          const iv = n.note! - 40;
          expect(iv).toBeGreaterThanOrEqual(-2);
          expect(iv).toBeLessThanOrEqual(12);
          if (style !== 'riff') expect(iv).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('silence', () => {
  it('sits out whole bars when it is quiet', () => {
    let silent = 0;
    for (let seed = 0; seed < 30; seed++) {
      const b = newBass(seed);
      for (let bar = 0; bar < 4; bar++) if (barShape(b, macros(0, { density: 0 }), bar) === 'rest') silent++;
    }
    expect(silent).toBeGreaterThan(30);
  });

  it('fills its gaps when it is busy', () => {
    let rests = 0;
    for (let seed = 0; seed < 30; seed++) {
      const b = newBass(seed, 'hold');
      for (let bar = 0; bar < 4; bar++) if (barShape(b, macros(1, { density: 1 }), bar) === 'rest') rests++;
    }
    let quiet = 0;
    for (let seed = 0; seed < 30; seed++) {
      const b = newBass(seed, 'hold');
      for (let bar = 0; bar < 4; bar++) if (barShape(b, macros(0, { density: 0.4 }), bar) === 'rest') quiet++;
    }
    expect(rests).toBeLessThan(quiet);
  });
});

describe('shaping over time', () => {
  it('follows its velocity curve across the phrase', () => {
    const b: BassMaterial = { ...newBass(5, 'roll'), phraseCurve: 'rise', barCurve: 'none', shape: ['full', 'full', 'full', 'full'] };
    const bars = [0, 1, 2, 3].map((bar) => render(b, macros(0.5), bar).notes);
    const avg = (ns: NoteEvent[]) => ns.reduce((s, n) => s + n.vel, 0) / ns.length;
    expect(avg(bars[3]!)).toBeGreaterThan(avg(bars[0]!) + 0.15);
    expect(velocityAt({ ...b, phraseCurve: 'fall' }, 1, 0)).toBeLessThan(velocityAt({ ...b, phraseCurve: 'fall' }, 0, 0));
  });

  it('pumps inside the beat', () => {
    const b: BassMaterial = { ...newBass(5, 'roll'), phraseCurve: 'flat', barCurve: 'pump' };
    expect(velocityAt(b, 0, 2)).toBeLessThan(velocityAt(b, 0, 0));
    expect(velocityAt(b, 0, 4)).toBe(velocityAt(b, 0, 0));
  });

  it('draws its cutoff contour through the bar, and the conductor uses it instead of the bar-line value', () => {
    const b: BassMaterial = { ...newBass(5, 'pulse'), contour: 'open' };
    const r = render(b, macros(0.5), 1);
    expect(r.params.map((p) => p.t)).toEqual([0, 4, 8, 12]);
    expect(r.params[3]!.value).toBeGreaterThan(r.params[0]!.value);
    expect(contourAt('close', 1)).toBeLessThan(contourAt('close', 0));

    const c = new Conductor({ seed: 5 });
    c.bass.material = b;
    const bar = c.renderBar();
    const cutoffs = bar.params.filter((p) => p.role === 'bass' && p.path === 'filter.cutoff');
    expect(cutoffs).toHaveLength(4);
  });
});

describe('the sub follows the bass', () => {
  it('drops out when the bass rests, plays only its half when it holds half a bar, and shares its swell', () => {
    const c = new Conductor({ seed: 3 });
    c.setBassStyle('hold');
    c.bass.material = { ...c.bass.material, shape: ['half', 'rest', 'full', 'tail'] };
    c.axes.setTarget('intensity', 0.5);
    c.axes.snap();
    const subs = [0, 1, 2, 3].map(() => c.renderBar().notes.filter((n) => n.role === 'sub'));
    expect(subs[0]!.reduce((s, n) => s + n.dur, 0)).toBe(8);
    expect(subs[1]).toEqual([]);
    expect(subs[2]!.reduce((s, n) => s + n.dur, 0)).toBe(16);
    expect(subs[3]!.map((n) => n.t)).toEqual([12]);
    expect(subs[0]![0]!.shape?.attack).toBeGreaterThan(0);
  });
});
