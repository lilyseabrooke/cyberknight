/**
 * The music's randomness. It never touches the sim's `w.rng`; it hashes its own inputs, so any decision can be re-derived from
 * (seed, what, where) without carrying a stream around. That is what lets a riff stay the same riff while the axes move it.
 */

/** murmur3's finalizer: every input bit reaches every output bit. */
function fmix(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A 32-bit hash of a seed and some integers. The seed and each part are fully mixed before they meet, so neighbouring seeds (1, 2,
 * 3...) give unrelated results.
 */
export function hash(seed: number, ...parts: number[]): number {
  let h = fmix((seed >>> 0) ^ 0x9e3779b9);
  for (const p of parts) h = fmix(h ^ fmix(((p >>> 0) + 0x7f4a7c15) >>> 0));
  return h;
}

/** A uniform number in [0, 1) from a seed and some integers. */
export const unit = (seed: number, ...parts: number[]): number => hash(seed, ...parts) / 4294967296;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
