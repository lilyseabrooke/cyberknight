/**
 * A generated reverb impulse response: decaying noise that darkens as it fades, like a big concrete room. No IR files
 * (docs/MUSIC_PLAN.md §17).
 */
export function impulse(ctx: BaseAudioContext, seconds = 2.8, decay = 3.2, channels = 1): AudioBuffer {
  const len = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    let x = 0x1b873593 + c * 7919;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      const white = (x >>> 0) / 2147483648 - 1;
      const k = i / len;
      // A one-pole lowpass whose cutoff falls through the tail: the highs die first.
      const a = 0.85 - 0.75 * k;
      lp = a * white + (1 - a) * lp;
      // A short pre-delay, then an exponential decay.
      d[i] = i < ctx.sampleRate * 0.012 ? 0 : lp * Math.exp(-decay * k * 3) * 0.6;
    }
  }
  return buf;
}
