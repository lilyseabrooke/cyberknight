/**
 * Render music clips to WAV in headless Chromium and check them (docs/MUSIC_PLAN.md §20). Not part of `npm test`: it needs a
 * browser. On a fresh machine, run `npx playwright install chromium` once.
 *
 *   npm run music:render                 # every preset into out/music/
 *   npm run music:render -- sweep dread  # just these
 *   npm run music:render -- --out=dir
 *   npm run music:render -- groove --stems   # also render each bus alone, and report the balance
 *
 * Each clip is checked for clipping, DC and loudness; the sweep is also rendered as stems to check the sub stays a clean, click-free
 * low tone and the bass stays out of its band. Any failed check makes the script exit non-zero.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import type { RenderResult, RenderSpec } from '../music/synth/offline';
import type { BusId } from '../music/score/types';
import { bandShare, clipped, db, envelope, maxStep, mean, peak, rms, wav } from '../music/tools/analysis';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const base = { seed: 7, bpm: 120, key: 4 };
const groove = { intensity: 0.45, danger: 0.15, heat: 0.1 };

/** The clips. Axis values are targets at a bar; in between they interpolate. */
const PRESETS: Record<string, { about: string; spec: RenderSpec }> = {
  sweep: {
    about: 'aggression 0 -> 1 over 28 bars, then 4 bars held: clean and locked to distorted and syncopated',
    spec: { ...base, bars: 32, keyframes: [{ bar: 0, axes: { intensity: 0, danger: 0, heat: 0 } }, { bar: 27, axes: { intensity: 1, danger: 1, heat: 0.4 } }] },
  },
  locked: {
    about: 'everything at 0: a quiet street',
    spec: { ...base, bars: 8, keyframes: [{ bar: 0, axes: { intensity: 0, danger: 0, heat: 0 } }] },
  },
  aggressive: {
    about: 'aggression at 1: a fight',
    spec: { ...base, bars: 8, keyframes: [{ bar: 0, axes: { intensity: 1, danger: 1, heat: 0.4 } }] },
  },
  dread: {
    about: 'danger 1, intensity 0: something is up there (half-time kick)',
    spec: { ...base, bars: 8, keyframes: [{ bar: 0, axes: { intensity: 0, danger: 1, heat: 0 } }] },
  },
  chase: {
    about: 'heat 1, intensity 0.7: a chase (ghost kicks, busy bass, gated pad)',
    spec: { ...base, bars: 8, keyframes: [{ bar: 0, axes: { intensity: 0.7, danger: 0.2, heat: 1 } }] },
  },
  groove: {
    about: 'a middling night on i-VI-III-VII: the whole 8-bar loop twice, with its turnaround',
    spec: { ...base, bars: 16, keyframes: [{ bar: 0, axes: groove }] },
  },
  tense: {
    about: 'i-♭VI-♭II-i with danger up: Phrygian, pedal, drone and a thin pad',
    spec: { ...base, bars: 16, progression: { bank: 'tense', index: 1 }, keyframes: [{ bar: 0, axes: { intensity: 0.3, danger: 0.85, heat: 0 } }] },
  },
  peak: {
    about: 'i-VII-VI-V (harmonic V) at full tilt',
    spec: { ...base, bars: 16, progression: { bank: 'peak', index: 1 }, keyframes: [{ bar: 0, axes: { intensity: 0.9, danger: 0.3, heat: 0.3 } }] },
  },
  'stabs-lock': {
    about: 'stabs locked to the bass accents',
    spec: { ...base, bars: 8, stabFeel: 'lock', keyframes: [{ bar: 0, axes: { intensity: 0.65, danger: 0.2, heat: 0 } }] },
  },
  'stabs-answer': {
    about: 'stabs answering in the bass gaps',
    spec: { ...base, bars: 8, stabFeel: 'answer', keyframes: [{ bar: 0, axes: { intensity: 0.65, danger: 0.2, heat: 0 } }] },
  },
};

interface Check {
  name: string;
  value: string;
  ok: boolean;
}

const decode = (r: RenderResult): Float32Array => {
  const bytes = Buffer.from(r.pcm, 'base64');
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  return Float32Array.from(pcm, (v) => v / 32767);
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outArg = args.find((a) => a.startsWith('--out='));
  const out = resolve(outArg ? outArg.slice(6) : join(root, 'out', 'music'));
  const stems = args.includes('--stems');
  const names = args.filter((a) => !a.startsWith('--'));
  const chosen = names.length ? names : Object.keys(PRESETS);
  for (const n of chosen) if (!PRESETS[n]) throw new Error(`no preset "${n}" (have: ${Object.keys(PRESETS).join(', ')})`);
  mkdirSync(out, { recursive: true });

  const bundle = await build({ entryPoints: [join(root, 'music/synth/offline.ts')], bundle: true, write: false, format: 'iife', target: 'es2022' });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>render</title>');
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  const render = (spec: RenderSpec): Promise<RenderResult> =>
    page.evaluate((s) => (globalThis as unknown as { renderMusic: (s: RenderSpec) => Promise<RenderResult> }).renderMusic(s), spec);

  let failed = 0;
  for (const name of chosen) {
    const { about, spec } = PRESETS[name]!;
    const result = await render(spec);
    const x = decode(result);
    const sr = result.sampleRate;
    const file = join(out, `${name}.wav`);
    writeFileSync(file, wav(Int16Array.from(x, (v) => Math.round(v * 32767)), sr));

    const checks: Check[] = [
      { name: 'clipped samples', value: String(clipped(x)), ok: clipped(x) === 0 },
      { name: 'peak', value: `${db(peak(x)).toFixed(1)} dBFS`, ok: peak(x) < 0.999 },
      { name: 'loudness (RMS)', value: `${db(rms(x)).toFixed(1)} dBFS`, ok: db(rms(x)) > -22 && db(rms(x)) < -11 },
      { name: 'DC offset', value: mean(x).toFixed(4), ok: Math.abs(mean(x)) < 0.005 },
      // Peak-to-RMS. A held sine sub keeps this music's RMS high, so ~8-9 dB is healthy here; a mix squashed by the limiter
      // reads 4-6 dB.
      { name: 'crest factor', value: `${(db(peak(x)) - db(rms(x))).toFixed(1)} dB`, ok: db(peak(x)) - db(rms(x)) > 7 },
    ];

    // The score's side of it: stabs where they should be, and a pad that moves by small steps.
    const stabbed = result.bars.filter((b) => b.stabOnsets > 0);
    if (spec.stabFeel === 'lock') {
      const off = stabbed.reduce((n, b) => n + b.stabOnsets - b.stabsOnBass, 0);
      checks.push({ name: 'stabs: onsets off the bass (locked)', value: String(off), ok: off === 0 && stabbed.length > 0 });
    }
    if (spec.stabFeel === 'answer') {
      const on = stabbed.reduce((n, b) => n + b.stabsOnBass, 0);
      checks.push({ name: 'stabs: onsets on the bass (answering)', value: String(on), ok: on === 0 && stabbed.length > 0 });
    }
    const moves: number[] = [];
    for (let i = 1; i < result.bars.length; i++) {
      const a = result.bars[i - 1]!.pad;
      const b = result.bars[i]!.pad;
      if (a.length && a.length === b.length) moves.push(b.reduce((s, n, k) => s + Math.abs(n - a[k]!), 0) / b.length);
    }
    if (moves.length) {
      const avg = moves.reduce((x, y) => x + y, 0) / moves.length;
      checks.push({ name: 'pad: average move per voice per bar', value: `${avg.toFixed(2)} semitones (worst ${Math.max(...moves).toFixed(2)})`, ok: avg <= 3 });
    }

    if (name === 'sweep') {
      const sub = decode(await render({ ...spec, solo: ['sub'] }));
      const bass = decode(await render({ ...spec, solo: ['bass'] }));
      const subHigh = bandShare(sub, sr, 200, 20000);
      const bassLow = bandShare(bass, sr, 20, 80);
      checks.push(
        { name: 'sub: energy above 200 Hz', value: `${subHigh.toFixed(1)} dB`, ok: subHigh < -30 },
        { name: 'sub: largest sample step (clicks)', value: maxStep(sub).toFixed(4), ok: maxStep(sub) < 0.06 },
        { name: 'bass: energy below 80 Hz (the sub band)', value: `${bassLow.toFixed(1)} dB`, ok: bassLow < -18 },
      );
      checks.push({ name: 'balance: bass stem vs sub stem', value: `${(db(rms(bass)) - db(rms(sub))).toFixed(1)} dB`, ok: true });
      writeFileSync(join(out, 'sweep-sub.wav'), wav(Int16Array.from(sub, (v) => Math.round(v * 32767)), sr));
      writeFileSync(join(out, 'sweep-bass.wav'), wav(Int16Array.from(bass, (v) => Math.round(v * 32767)), sr));
    }

    if (stems) {
      const buses: BusId[] = ['sub', 'bass', 'drums', 'beds', 'music'];
      const levels: string[] = [];
      for (const bus of buses) {
        const y = decode(await render({ ...spec, solo: [bus] }));
        writeFileSync(join(out, `${name}-${bus}.wav`), wav(Int16Array.from(y, (v) => Math.round(v * 32767)), sr));
        levels.push(`${bus} ${db(rms(y)).toFixed(1)}`);
      }
      checks.push({ name: 'stems (RMS dBFS)', value: levels.join('  '), ok: true });
    }

    console.log(`\n${name}.wav  (${spec.bars} bars, ${(x.length / sr).toFixed(1)} s)  ${about}`);
    for (const c of checks) {
      console.log(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(40)} ${c.value}`);
      if (!c.ok) failed++;
    }
    // A bar-by-bar readout: what the score did, and how loud each bar came out.
    const loud = envelope(x, sr, 240 / (spec.bpm ?? 120));
    const every = Math.max(1, Math.floor(result.bars.length / 8));
    for (const b of result.bars.filter((_, i) => i % every === 0)) {
      const m = b.macros;
      console.log(
        `    bar ${String(b.index).padStart(2)}  aggr ${m.aggression!.toFixed(2)}  sync ${m.syncopation!.toFixed(2)}  dark ${m.darkness!.toFixed(2)}  ` +
          `kick ${b.kick.padEnd(5)}  bass ${String(b.bassNotes).padStart(2)} (${b.offKick} off)  ${b.chords.padEnd(8)} ${b.mode.slice(0, 4)}` +
          `${b.pedal ? ' pedal' : ''}${b.drone ? ' drone' : ''}  stabs ${b.stabs.padEnd(6)}  ${loud[b.index]?.toFixed(1)} dB`,
      );
    }
  }
  await browser.close();
  console.log(`\nwrote ${chosen.length} clip(s) to ${out}`);
  if (failed) {
    console.error(`${failed} check(s) failed`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
