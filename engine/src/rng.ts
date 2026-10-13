/** Seeded, deterministic RNG (mulberry32). Never use Math.random in the engine. */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  }

  /** Serializable position in the stream, so a run can be saved and resumed exactly. */
  get position(): number {
    return this.state;
  }

  static fromPosition(state: number): Rng {
    const r = new Rng(0);
    r.state = state >>> 0;
    return r;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    const total = items.reduce((a, t) => a + Math.max(0, weight(t)), 0);
    let roll = this.next() * total;
    for (const t of items) {
      roll -= Math.max(0, weight(t));
      if (roll <= 0) return t;
    }
    return items[items.length - 1]!;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Independent child stream, so adding RNG calls in one system doesn't reshuffle another. */
  fork(label: string): Rng {
    return new Rng(hashString(`${this.state}:${label}`));
  }
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
