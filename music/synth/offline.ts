/**
 * Offline rendering: the same graph and conductor as live playback, driven through an OfflineAudioContext. The render script
 * (scripts/music-render.ts) bundles this file, loads it into headless Chromium and calls `renderMusic`.
 */
import { Conductor } from '../score/conductor';
import type { BankId } from '../score/harmony';
import type { StabFeel } from '../score/roles/stabs';
import type { BusId, RoleId } from '../score/types';
import { Graph } from './graph';

/** Axis targets and macro overrides at a bar; values in between are interpolated bar by bar. */
export interface Keyframe {
  bar: number;
  axes?: Record<string, number>;
  overrides?: Record<string, number>;
}

export interface RenderSpec {
  bars: number;
  seed: number;
  bpm?: number;
  key?: number;
  progression?: { bank: BankId; index: number };
  /** Pin the stabs' feel instead of letting syncopation choose. */
  stabFeel?: StabFeel;
  keyframes: Keyframe[];
  solo?: BusId[];
  mute?: RoleId[];
  sampleRate?: number;
  /** Let the axes slew as they would live. Off by default, so a render follows its keyframes exactly. */
  slew?: boolean;
}

export interface RenderResult {
  sampleRate: number;
  /** Mono 16-bit PCM, base64. */
  pcm: string;
  /** Per bar: the macros it was rendered with and its notes, for the report. */
  bars: {
    index: number;
    macros: Record<string, number>;
    kick: string;
    bassNotes: number;
    offKick: number;
    chords: string;
    mode: string;
    pedal: boolean;
    stabs: string;
    drone: boolean;
    /** Stab onsets that land on a bass onset, and stab onsets in all. */
    stabsOnBass: number;
    stabOnsets: number;
    pad: number[];
  }[];
}

function at(keyframes: Keyframe[], bar: number, field: 'axes' | 'overrides'): Record<string, number> {
  const out: Record<string, number> = {};
  const ids = new Set(keyframes.flatMap((k) => Object.keys(k[field] ?? {})));
  for (const id of ids) {
    const pts = keyframes.filter((k) => k[field]?.[id] !== undefined).sort((a, b) => a.bar - b.bar);
    const after = pts.find((k) => k.bar >= bar) ?? pts[pts.length - 1]!;
    const before = [...pts].reverse().find((k) => k.bar <= bar) ?? pts[0]!;
    const v0 = before[field]![id]!;
    const v1 = after[field]![id]!;
    out[id] = after.bar === before.bar ? v0 : v0 + ((v1 - v0) * (bar - before.bar)) / (after.bar - before.bar);
  }
  return out;
}

export async function renderMusic(spec: RenderSpec): Promise<RenderResult> {
  const sampleRate = spec.sampleRate ?? 44100;
  const bpm = spec.bpm ?? 120;
  const seconds = (spec.bars * 240) / bpm + 3.5;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const graph = new Graph(ctx);
  graph.mixer.solo(spec.solo ?? null);
  const conductor = new Conductor({ seed: spec.seed, bpm, key: spec.key, progression: spec.progression });
  for (const r of spec.mute ?? []) conductor.muted.add(r);
  if (spec.stabFeel) conductor.stabs.forced = spec.stabFeel;

  const bars: RenderResult['bars'] = [];
  let t = 0.05;
  for (let i = 0; i < spec.bars; i++) {
    for (const [id, v] of Object.entries(at(spec.keyframes, i, 'axes'))) conductor.axes.setTarget(id, v);
    if (!spec.slew) conductor.axes.snap();
    for (const k of Object.keys(conductor.overrides)) delete conductor.overrides[k];
    Object.assign(conductor.overrides, at(spec.keyframes, i, 'overrides'));
    const bar = conductor.renderBar();
    const bass = bar.notes.filter((n) => n.role === 'bass');
    const bassOnsets = new Set(bass.map((n) => n.t));
    const stabOnsets = [...new Set(bar.notes.filter((n) => n.role === 'stabs').map((n) => n.t))];
    bars.push({
      index: bar.index,
      macros: { ...bar.macros },
      kick: conductor.last.kick,
      bassNotes: bass.length,
      offKick: bass.filter((n) => n.t % 4 !== 0).length,
      chords: bar.harmony.segments.map((s) => s.chord.label).join(' '),
      mode: bar.harmony.mode,
      pedal: bar.harmony.pedal,
      stabs: conductor.last.stabs,
      drone: conductor.last.drone,
      stabsOnBass: stabOnsets.filter((t) => bassOnsets.has(t)).length,
      stabOnsets: stabOnsets.length,
      pad: bar.notes.filter((n) => n.role === 'pad' && n.t === 0).map((n) => n.note!),
    });
    t += graph.schedule(bar, t);
  }
  graph.release(t);

  const buffer = await ctx.startRendering();
  const data = buffer.getChannelData(0);
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(data[i]! * 32767)));
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { sampleRate, pcm: btoa(bin), bars };
}

(globalThis as { renderMusic?: typeof renderMusic }).renderMusic = renderMusic;
