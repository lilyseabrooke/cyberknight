/** Measurements for rendered audio: what the render script checks before a clip goes to the author. Pure, node-side. */

export const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-12));

export function peak(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]!));
  return m;
}

export function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

export function mean(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]!;
  return s / Math.max(1, x.length);
}

/** Samples at or past full scale. */
export function clipped(x: Float32Array, at = 0.999): number {
  let n = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) >= at) n++;
  return n;
}

/** The largest jump between neighbouring samples: on a clean low sine, anything big is a click. */
export function maxStep(x: Float32Array): number {
  let m = 0;
  for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i]! - x[i - 1]!));
  return m;
}

/** In-place radix-2 FFT. `re` and `im` must have a power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2]!;
        const ai = im[i + k + len / 2]!;
        const tr = ar * wr - ai * wi;
        const ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k]! - tr;
        im[i + k + len / 2] = im[i + k]! - ti;
        re[i + k] = re[i + k]! + tr;
        im[i + k] = im[i + k]! + ti;
      }
    }
  }
}

/**
 * The share of a signal's energy in [lo, hi) Hz, averaged over Hann-windowed frames, in dB (0 = all of it). How the sub is shown
 * to be a clean low tone, and the bass to stay out of the sub's band.
 */
export function bandShare(x: Float32Array, sampleRate: number, lo: number, hi: number, frame = 8192): number {
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  let band = 0;
  let total = 0;
  for (let start = 0; start + frame <= x.length; start += frame / 2) {
    for (let i = 0; i < frame; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));
      re[i] = x[start + i]! * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < frame / 2; k++) {
      const e = re[k]! * re[k]! + im[k]! * im[k]!;
      const f = (k * sampleRate) / frame;
      total += e;
      if (f >= lo && f < hi) band += e;
    }
  }
  return 10 * Math.log10(Math.max(band, 1e-20) / Math.max(total, 1e-20));
}

/** RMS per window, in dB: a loudness curve. */
export function envelope(x: Float32Array, sampleRate: number, windowSec: number): number[] {
  const w = Math.max(1, Math.round(windowSec * sampleRate));
  const out: number[] = [];
  for (let i = 0; i + w <= x.length; i += w) out.push(db(rms(x, i, i + w)));
  return out;
}

/** A 16-bit PCM WAV. `pcm` is interleaved when `channels` is 2. */
export function wav(pcm: Int16Array, sampleRate: number, channels = 1): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2 * channels, 28);
  h.writeUInt16LE(2 * channels, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

export interface Stereo {
  left: Float32Array;
  right: Float32Array;
}

/** Mid (what a mono speaker plays) and side (what only stereo adds). */
export function midSide({ left, right }: Stereo): { mid: Float32Array; side: Float32Array } {
  const mid = new Float32Array(left.length);
  const side = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mid[i] = (left[i]! + right[i]!) / 2;
    side[i] = (left[i]! - right[i]!) / 2;
  }
  return { mid, side };
}

/** Energy in [lo, hi) Hz (Hann-windowed frames), as a raw sum, so two signals' bands can be compared. */
export function bandEnergy(x: Float32Array, sampleRate: number, lo: number, hi: number, frame = 8192): number {
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  let band = 0;
  for (let start = 0; start + frame <= x.length; start += frame / 2) {
    for (let i = 0; i < frame; i++) {
      re[i] = x[start + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < frame / 2; k++) {
      const f = (k * sampleRate) / frame;
      if (f >= lo && f < hi) band += re[k]! * re[k]! + im[k]! * im[k]!;
    }
  }
  return band;
}

/** How much quieter the low band is in the side than in the mid, in dB: very negative means the low end is mono. */
export function lowEndSide(st: Stereo, sampleRate: number, hi = 150): number {
  const { mid, side } = midSide(st);
  return 10 * Math.log10(Math.max(bandEnergy(side, sampleRate, 20, hi), 1e-20) / Math.max(bandEnergy(mid, sampleRate, 20, hi), 1e-20));
}

/** Width: side level against mid level, in dB. Around -20 to -8 is a healthy spread; near 0 is phasey. */
export function width(st: Stereo): number {
  const { mid, side } = midSide(st);
  return db(rms(side)) - db(rms(mid));
}

/** How much level a mono fold-down loses against the stereo signal, in dB (0 = nothing cancels). */
export function monoLoss(st: Stereo): number {
  const { mid } = midSide(st);
  let s = 0;
  for (let i = 0; i < st.left.length; i++) s += (st.left[i]! ** 2 + st.right[i]! ** 2) / 2;
  return db(rms(mid)) - db(Math.sqrt(s / Math.max(1, st.left.length)));
}
