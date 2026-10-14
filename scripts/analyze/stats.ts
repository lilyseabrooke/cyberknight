/** Small, dependency-free statistics for the analysis harness. Pure, so it can be tested. */

export interface Summary {
  n: number;
  mean: number;
  /** Standard error of the mean. */
  se: number;
}

export function summarize(xs: number[]): Summary {
  const n = xs.length;
  if (!n) return { n: 0, mean: 0, se: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean, se: 0 };
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { n, mean, se: Math.sqrt(variance / n) };
}

export const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export type Verdict = 'up' | 'down' | 'same';

/**
 * Is the difference between two runs of the same experiment bigger than the noise? Two standard errors of the difference
 * is a rough 95% bar: with a hundred nights a side, most small swings are not real, and this says so.
 */
export function compare(base: Summary, now: Summary): { delta: number; verdict: Verdict; z: number } {
  const delta = now.mean - base.mean;
  const se = Math.sqrt(base.se ** 2 + now.se ** 2);
  if (!se) return { delta, verdict: delta === 0 ? 'same' : delta > 0 ? 'up' : 'down', z: 0 };
  const z = delta / se;
  return { delta, z, verdict: Math.abs(z) < 2 ? 'same' : delta > 0 ? 'up' : 'down' };
}

/** A death cause, as one of a few buckets. */
export function deathBucket(cause: string): string {
  const c = cause.toLowerCase();
  if (/dragon|hera|artemis|apollo/.test(c)) return 'dragons';
  if (/npd|police|drone sweep|raid|arrest|bribe|officer/.test(c)) return 'police';
  if (/atlas|helix|vault|heist|trespass|retrieval|guard/.test(c)) return 'corp security';
  if (/jealous|move|romance|slight|losing it/.test(c)) return 'romance & grudges';
  if (/mugg|gang/.test(c)) return 'gangs & muggers';
  if (/picking a fight|challeng|threaten|rescuing|shaking down|frame|bribe/.test(c)) return 'fights she picked';
  if (/misadventure/.test(c)) return 'misadventure';
  return 'other';
}

export const pct = (x: number, digits = 0): string => `${(100 * x).toFixed(digits)}%`;

export function fmt(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '-';
  if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString('en-US');
  return x.toFixed(digits);
}
