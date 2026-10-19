/**
 * The music's randomness. It never touches the sim's `w.rng`; it hashes its own inputs, so any decision can be re-derived from
 * (seed, what, where) without carrying a stream around. That is what lets a riff stay the same riff while the axes move it.
 */

/** A 32-bit hash of a seed and some integers (murmur-style finalizer). */
export function hash(seed: number, ...parts: number[]): number {
  let h = seed >>> 0 || 0x9e3779b9;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** A uniform number in [0, 1) from a seed and some integers. */
export const unit = (seed: number, ...parts: number[]): number => hash(seed, ...parts) / 4294967296;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
