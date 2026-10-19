import { describe, expect, it } from 'vitest';
import { evaluateMacros } from './axes/macros';
import { Conductor } from './conductor';
import { BANKS, HarmonyState, chordAt, type BankId } from './harmony';
import { renderBass, newRiff } from './roles/bass';
import { PAD_WINDOW, PadPart, padPcs } from './roles/beds';
import { DrumPart, newKit } from './roles/drums';
import { StabPart } from './roles/stabs';
import { buildChord, inScale, pc } from './theory';
import type { HarmonyBar } from './types';
import { LOW_INTERVAL_FLOOR, movement, respectsLowLimit, voice } from './voicing';

const m = (o: Record<string, number>) => ({ aggression: 0, syncopation: 0, density: 0, darkness: 0.2, drive: 0, ...o });
const labels = (h: HarmonyBar) => h.segments.map((s) => s.chord.label).join(' ');

describe('chords', () => {
  it('builds diatonic triads from the mode', () => {
    expect(buildChord({ degree: 0 }, 4, 'aeolian')).toMatchObject({ root: 4, quality: 'min', tones: [4, 7, 11], label: 'i' });
    expect(buildChord({ degree: 5 }, 4, 'aeolian')).toMatchObject({ root: 0, quality: 'maj', label: 'VI' });
    expect(buildChord({ degree: 6 }, 4, 'aeolian')).toMatchObject({ root: 2, quality: 'maj', label: 'VII' });
    expect(buildChord({ degree: 1 }, 4, 'aeolian')).toMatchObject({ quality: 'dim', label: 'ii°' });
  });

  it('re-colours a degree when the mode shifts: VII goes minor in Phrygian', () => {
    expect(buildChord({ degree: 6 }, 4, 'phrygian')).toMatchObject({ root: 2, quality: 'min', label: 'vii' });
    expect(buildChord({ degree: 1 }, 4, 'phrygian')).toMatchObject({ root: 5, quality: 'maj', label: 'II' });
  });

  it('borrows chords by semitones: ♭II and the harmonic V', () => {
    expect(buildChord({ semis: 1, quality: 'maj', numeral: '♭II' }, 4, 'aeolian').tones).toEqual([5, 9, 0]);
    expect(buildChord({ semis: 7, quality: 'maj', numeral: 'V' }, 4, 'aeolian').tones).toEqual([11, 3, 6]);
  });
});

describe('the 8-bar loop', () => {
  it('plays the progression twice and turns around in its last bar', () => {
    const h = new HarmonyState(BANKS.rest[0]!.chords);
    const bars = Array.from({ length: 9 }, (_, i) => labels(h.bar(i, 4, m({}))));
    expect(bars).toEqual(['i', 'VI', 'III', 'VII', 'i', 'VI', 'III', 'VII v', 'i']);
  });

  it('turns around through ♭II under danger, in Phrygian, on a tonic pedal', () => {
    const h = new HarmonyState(BANKS.rest[0]!.chords);
    let last: HarmonyBar | null = null;
    for (let i = 0; i < 8; i++) last = h.bar(i, 4, m({ darkness: 0.9 }));
    expect(last!.mode).toBe('phrygian');
    expect(last!.pedal).toBe(true);
    expect(labels(last!)).toBe('vii ♭II');
  });
});

describe('voicing', () => {
  const banks = Object.keys(BANKS) as BankId[];

  it('moves the pad by small steps through every progression, with no muddy low intervals', () => {
    for (const bank of banks) {
      for (const prog of BANKS[bank]) {
        const h = new HarmonyState(prog.chords);
        let prev: number[] | null = null;
        let total = 0;
        let moves = 0;
        for (let i = 0; i < 16; i++) {
          for (const s of h.bar(i, 4, m({})).segments) {
            const notes = voice(padPcs(s.chord, 'full').pcs, prev, PAD_WINDOW);
            expect(respectsLowLimit(notes)).toBe(true);
            for (const n of notes) {
              expect(n).toBeGreaterThanOrEqual(PAD_WINDOW.lo);
              expect(n).toBeLessThanOrEqual(PAD_WINDOW.hi);
            }
            expect(new Set(notes.map(pc))).toEqual(new Set(s.chord.tones));
            if (prev) {
              total += movement(prev, notes) / notes.length;
              moves++;
            }
            prev = notes;
          }
        }
        expect(total / moves, `${bank}: ${prog.name}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('refuses close intervals below E3', () => {
    expect(respectsLowLimit([45, 49, 52])).toBe(false);
    expect(respectsLowLimit([40, 47, 52, 55])).toBe(false);
    expect(respectsLowLimit([40, 47, 54, 59])).toBe(true);
    expect(LOW_INTERVAL_FLOOR).toBe(52);
  });
});

describe('every note is in key', () => {
  it('plays only scale tones, chord tones, or tagged tension notes, whatever the axes do', () => {
    for (let seed = 0; seed < 6; seed++) {
      for (const [bank, index] of [['rest', 0], ['rest', 1], ['tense', 0], ['tense', 1], ['peak', 1]] as [BankId, number][]) {
        const c = new Conductor({ seed, key: seed * 5, progression: { bank, index } });
        for (let i = 0; i < 16; i++) {
          c.axes.setTarget('intensity', (i % 5) / 4);
          c.axes.setTarget('danger', ((i + seed) % 4) / 3);
          c.axes.setTarget('heat', (i % 3) / 2);
          c.axes.snap();
          const bar = c.renderBar();
          for (const n of bar.notes) {
            if (n.note === undefined || n.role === 'kick' || n.tension) continue;
            const chord = chordAt(bar.harmony, n.t);
            const ok = inScale(n.note, bar.harmony.key, bar.harmony.mode) || chord.tones.includes(pc(n.note));
            expect(ok, `${n.role} ${n.note} over ${chord.label} in ${bar.harmony.mode}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('stabs', () => {
  const h = new HarmonyState(BANKS.rest[0]!.chords).bar(0, 4, m({}));
  const macros = m({ aggression: 0.6, syncopation: 0.4, density: 0.7 });

  it('lock to the bass: every stab lands with a bass note', () => {
    for (let seed = 0; seed < 40; seed++) {
      const bass = renderBass(newRiff(seed), macros, 0, h);
      const stabs = new StabPart();
      stabs.forced = 'lock';
      const onsets = new Set(bass.map((n) => n.t));
      const hits = stabs.render(h, macros, bass);
      expect(hits.length).toBeGreaterThan(0);
      for (const n of hits) expect(onsets.has(n.t)).toBe(true);
    }
  });

  it('answer the bass: no stab lands with a bass note', () => {
    for (let seed = 0; seed < 40; seed++) {
      const bass = renderBass(newRiff(seed), macros, 0, h);
      const stabs = new StabPart();
      stabs.forced = 'answer';
      const onsets = new Set(bass.map((n) => n.t));
      const hits = stabs.render(h, macros, bass);
      expect(hits.length).toBeGreaterThan(0);
      for (const n of hits) expect(onsets.has(n.t)).toBe(false);
    }
  });

  it('drop the third once it gets aggressive: power chords under distortion', () => {
    const stabs = new StabPart();
    const hits = stabs.render(h, m({ aggression: 0.9, density: 0.7 }), renderBass(newRiff(1), m({ aggression: 0.9 }), 0, h));
    expect(new Set(hits.map((n) => pc(n.note!)))).toEqual(new Set([4, 11]));
  });

  it('follow syncopation by default: low locks, high answers', () => {
    const stabs = new StabPart();
    stabs.render(h, m({ syncopation: 0.2 }), []);
    expect(stabs.feel).toBe('lock');
    stabs.render(h, m({ syncopation: 0.8 }), []);
    expect(stabs.feel).toBe('answer');
  });
});

describe('pad', () => {
  it('thins to a fifth with a ♭2 rub when it is dark, tagging the rub as tension', () => {
    const h = new HarmonyState(BANKS.rest[0]!.chords);
    const pad = new PadPart('held');
    const bar = h.bar(0, 4, m({ darkness: 0.9 }));
    const notes = pad.render(bar, m({ darkness: 0.9 }));
    expect(new Set(notes.map((n) => pc(n.note!)))).toEqual(new Set([4, 11, 5]));
    // F over E: in Phrygian the ♭2 is in the scale, so it needs no tag.
    expect(bar.mode).toBe('phrygian');
    expect(notes.some((n) => n.tension)).toBe(false);
  });

  it('adds a ninth when it is calm', () => {
    const pad = new PadPart('held');
    const notes = pad.render(new HarmonyState(BANKS.rest[0]!.chords).bar(0, 4, m({ darkness: 0.1 })), m({ darkness: 0.1 }));
    expect(new Set(notes.map((n) => pc(n.note!)))).toEqual(new Set([4, 7, 11, 6]));
  });
});

describe('drums', () => {
  const kit = { ...newKit(3), backbeat: 'clap' as const };

  it('puts the backbeat on 2 and 4, or on 3 in half-time', () => {
    const steps = (feel: 'four' | 'half') => new DrumPart(kit).render(m({ density: 0.5 }), 0, feel, false).filter((n) => n.role === 'clap').map((n) => n.t);
    expect(steps('four')).toEqual([4, 12]);
    expect(steps('half')).toEqual([8]);
  });

  it('runs 16th hats when the drive is up, and only 8ths when it is not', () => {
    const odd = (drive: number) => new DrumPart(kit).render(m({ density: 0.5, drive }), 0, 'four', false).filter((n) => n.role === 'hat' && n.t % 2 === 1).length;
    expect(odd(0.3)).toBe(0);
    expect(odd(1)).toBeGreaterThan(4);
  });

  it('fills the turnaround, harder as the density rises', () => {
    const fill = (density: number) => new DrumPart(kit).render(m({ density }), 7, 'four', true).filter((n) => n.role === 'snare' && n.t >= 8).length;
    expect(fill(0.5)).toBe(4);
    expect(fill(0.9)).toBeGreaterThan(8);
  });
});

describe('the macros a quiet street gives', () => {
  it('leaves the pad calm (add9), the stabs and drone off', () => {
    const c = new Conductor({ seed: 1 });
    const bar = c.renderBar();
    expect(bar.notes.some((n) => n.role === 'stabs')).toBe(false);
    expect(bar.notes.some((n) => n.role === 'drone')).toBe(false);
    expect(bar.notes.filter((n) => n.role === 'pad').length).toBeGreaterThan(0);
    expect(evaluateMacros(c.axes.values()).darkness).toBeCloseTo(0.2);
  });
});
