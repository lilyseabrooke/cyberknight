/**
 * Hex geometry, in axial coordinates (pointy-top, so every cell has six neighbours). The city's outdoor places stand on a hex grid;
 * see hexmap.ts for how they get there.
 */

export interface Hex {
  q: number;
  r: number;
}

/** The six neighbours, clockwise from east. */
export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const keyOf = (h: Hex): string => `${h.q},${h.r}`;
export const same = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;
export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });
export const step = (a: Hex, dir: number, n = 1): Hex => ({ q: a.q + DIRS[((dir % 6) + 6) % 6]!.q * n, r: a.r + DIRS[((dir % 6) + 6) % 6]!.r * n });
export const neighbors = (a: Hex): Hex[] => DIRS.map((d) => add(a, d));

/** Steps between two cells. */
export function dist(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Which of the six directions leads from `a` to the adjacent `b`, or -1 if they are not adjacent. */
export function dirTo(a: Hex, b: Hex): number {
  return DIRS.findIndex((d) => a.q + d.q === b.q && a.r + d.r === b.r);
}

/** The direction that points most nearly from `a` toward `b`. */
export function headingTo(a: Hex, b: Hex): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 6; i++) {
    const d = dist(step(a, i), b);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Every cell exactly `n` steps away. */
export function ring(center: Hex, n: number): Hex[] {
  if (n === 0) return [center];
  const out: Hex[] = [];
  let h = step(center, 4, n); // start at the south-west corner and walk round
  for (let side = 0; side < 6; side++) {
    for (let i = 0; i < n; i++) {
      out.push(h);
      h = step(h, side);
    }
  }
  return out;
}
