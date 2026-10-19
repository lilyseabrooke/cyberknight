import { describe, expect, it } from 'vitest';
import { AXES, AXIS_REGISTRY, createAxisRegistry } from './axes/registry';
import { MACROS, evaluateMacros, validateMacros } from './axes/macros';
import { AxisState, Gate } from './axes/state';
import { Conductor } from './conductor';
import { evaluateMods, validatePatch } from './mods';
import { PATCHES } from './patches';
import { KICK_STEPS, newRiff, renderBass } from './roles/bass';
import { SUB_HI, SUB_LO, buildChord } from './theory';
import type { HarmonyBar, Patch } from './types';

const MACRO_IDS = MACROS.map((m) => m.id);
/** One bar of E minor, held. */
const E_MINOR: HarmonyBar = { key: 4, mode: 'aeolian', segments: [{ from: 0, to: 16, chord: buildChord({ degree: 0 }, 4, 'aeolian') }], pedal: false, tension: [] };
const macrosAt = (aggression: number, syncopation = aggression) => ({ aggression, syncopation, density: aggression, darkness: 0.3, drive: 0 });

describe('determinism', () => {
  it('renders identical bars from the same seed and axis trajectory', () => {
    const run = () => {
      const c = new Conductor({ seed: 1234 });
      const bars = [];
      for (let i = 0; i < 24; i++) {
        c.axes.setTarget('intensity', i / 24);
        c.axes.setTarget('danger', (i % 7) / 7);
        bars.push(c.renderBar());
      }
      return bars;
    };
    expect(run()).toEqual(run());
  });

  it('gives different seeds different riffs', () => {
    const a = renderBass(newRiff(1), macrosAt(0.8), 0, E_MINOR);
    const b = renderBass(newRiff(2), macrosAt(0.8), 0, E_MINOR);
    expect(a).not.toEqual(b);
  });
});

describe('character bass', () => {
  it('is locked at aggression 0: every note is the root, on a locked step', () => {
    const locked = new Set([...KICK_STEPS, 2, 6, 10, 14]);
    for (let seed = 0; seed < 50; seed++) {
      for (let bar = 0; bar < 2; bar++) {
        const notes = renderBass(newRiff(seed), macrosAt(0, 0), bar, E_MINOR);
        expect(notes.length).toBeGreaterThanOrEqual(4);
        expect(notes.length).toBeLessThanOrEqual(8);
        for (const n of notes) {
          expect(n.note).toBe(40);
          expect(locked.has(n.t)).toBe(true);
          expect(n.slide).toBeFalsy();
        }
      }
    }
  });

  it('is syncopated at aggression 1: most notes are off the kick', () => {
    let off = 0;
    let total = 0;
    for (let seed = 0; seed < 50; seed++) {
      for (let bar = 0; bar < 2; bar++) {
        const notes = renderBass(newRiff(seed), macrosAt(1), bar, E_MINOR);
        total += notes.length;
        off += notes.filter((n) => !KICK_STEPS.includes(n.t)).length;
      }
    }
    expect(off / total).toBeGreaterThan(0.6);
    expect(total / 100).toBeGreaterThanOrEqual(9);
  });

  it('keeps the same riff as aggression moves: notes come and go at stable places', () => {
    const riff = newRiff(77);
    const lo = new Set(renderBass(riff, macrosAt(0.4), 0, E_MINOR).map((n) => n.t));
    const hi = new Set(renderBass(riff, macrosAt(0.6), 0, E_MINOR).map((n) => n.t));
    const shared = [...lo].filter((t) => hi.has(t)).length;
    expect(shared / Math.min(lo.size, hi.size)).toBeGreaterThan(0.6);
  });

  it('never lets a note run past the bar or overlap the next one', () => {
    for (let seed = 0; seed < 30; seed++) {
      const notes = renderBass(newRiff(seed), macrosAt(seed / 30), 1, E_MINOR);
      notes.forEach((n, i) => {
        const next = notes[i + 1];
        expect(n.t + n.dur).toBeLessThanOrEqual(next ? next.t : 16);
      });
    }
  });
});

describe('sub', () => {
  it('stays in E1-E2 whatever the root does', () => {
    for (let key = 0; key < 12; key++) {
      const c = new Conductor({ seed: key, key });
      for (let i = 0; i < 16; i++) {
        if (i === 8) c.setProgression('tense', 1);
        for (const n of c.renderBar().notes.filter((x) => x.role === 'sub')) {
          expect(n.note).toBeGreaterThanOrEqual(SUB_LO);
          expect(n.note).toBeLessThanOrEqual(SUB_HI);
        }
      }
    }
  });
});

describe('axes', () => {
  it('rises fast and falls slow', () => {
    const s = new AxisState(AXIS_REGISTRY);
    s.setTarget('intensity', 1);
    s.advance(0.25);
    expect(s.values().intensity).toBe(1);
    s.setTarget('intensity', 0);
    s.advance(1);
    expect(s.values().intensity).toBeCloseTo(1 - 1 / 8);
  });

  it('gates with hysteresis instead of flickering at a threshold', () => {
    const g = new Gate(0.5, 0.05);
    const seen = [0.52, 0.49, 0.53, 0.48, 0.56, 0.47, 0.51, 0.44].map((v) => g.update(v));
    expect(seen).toEqual([false, false, false, false, true, true, true, false]);
  });

  it('starts at aggression 0, so a quiet street is clean and locked', () => {
    expect(evaluateMacros(new AxisState(AXIS_REGISTRY).values()).aggression).toBe(0);
  });
});

describe('data validation', () => {
  it('macros only weight registered axes', () => {
    expect(validateMacros(AXIS_REGISTRY)).toEqual([]);
    expect(validateMacros(AXIS_REGISTRY, [{ id: 'x', weights: { intensty: 1 } }])).toHaveLength(1);
  });

  it('every patch route names a real parameter and a known source', () => {
    for (const p of Object.values(PATCHES)) expect(validatePatch(p, { axes: AXIS_REGISTRY, macros: MACRO_IDS, traits: [] })).toEqual([]);
    const bad: Patch = { ...PATCHES.bass, mods: [{ src: 'macro:agression', dst: 'filter.cuttoff', range: [1, 2] }] };
    expect(validatePatch(bad, { axes: AXIS_REGISTRY, macros: MACRO_IDS, traits: [] })).toHaveLength(2);
  });
});

describe('extensibility', () => {
  it('a new axis registered only here can drive a patch parameter, with no other file changed', () => {
    const registry = createAxisRegistry([...AXES, { id: 'fixture', label: 'Fixture', kind: 'continuous', rise: 1, fall: 1, initial: 0 }]);
    const patch: Patch = { ...PATCHES.bass, mods: [{ src: 'axis:fixture', dst: 'filter.cutoff', range: [200, 800] }] };
    expect(validatePatch(patch, { axes: registry, macros: MACRO_IDS, traits: [] })).toEqual([]);

    const state = new AxisState(registry);
    state.setTarget('fixture', 0.5);
    state.snap();
    const values = evaluateMods(patch, { macros: evaluateMacros(state.values()), axes: state.values(), traits: {} });
    expect(values['filter.cutoff']).toBe(500);
    // Registered but unweighted: it changes no macro.
    expect(evaluateMacros(state.values())).toEqual(evaluateMacros(new AxisState(AXIS_REGISTRY).values()));
  });
});
