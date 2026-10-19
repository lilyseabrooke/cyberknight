/**
 * Macros: what voices and planners read instead of raw axes, so one change to the mapping re-voices everything at once
 * (docs/MUSIC_PLAN.md §5.2). Each is a weighted sum over axis ids, clamped to 0..1, with an optional shaping term. An axis a
 * macro doesn't list contributes nothing, so a newly registered axis is silent until it is given weights.
 */
import type { AxisRegistry, AxisValues } from './registry';

export interface MacroDef {
  id: string;
  weights: Readonly<Record<string, number>>;
  bias?: number;
  /** Added to the weighted sum, before clamping. For the few non-linear terms. */
  extra?: (axes: AxisValues) => number;
}

const ax = (axes: AxisValues, id: string): number => axes[id] ?? 0;

export const MACROS: readonly MacroDef[] = [
  { id: 'aggression', weights: { intensity: 0.55, danger: 0.35, heat: 0.25 } },
  {
    id: 'syncopation',
    weights: { intensity: 0.6, heat: 0.5 },
    // Dread is sparse: danger without action pulls the rhythm back.
    extra: (a) => -0.2 * ax(a, 'danger') * (1 - ax(a, 'intensity')),
  },
  { id: 'density', weights: { intensity: 0.8, heat: 0.3 } },
  { id: 'darkness', weights: { danger: 0.8, intensity: -0.2 }, bias: 0.2 },
  { id: 'drive', weights: { heat: 0.7, intensity: 0.4 } },
];

export type MacroValues = Readonly<Record<string, number>>;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function evaluateMacros(axes: AxisValues, macros: readonly MacroDef[] = MACROS): MacroValues {
  const out: Record<string, number> = {};
  for (const m of macros) {
    let v = m.bias ?? 0;
    for (const [id, w] of Object.entries(m.weights)) v += w * ax(axes, id);
    if (m.extra) v += m.extra(axes);
    out[m.id] = clamp01(v);
  }
  return out;
}

/** Every axis id a macro table refers to must be registered: a typo would otherwise be a silent zero. */
export function validateMacros(registry: AxisRegistry, macros: readonly MacroDef[] = MACROS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const m of macros) {
    if (seen.has(m.id)) problems.push(`macro "${m.id}" is defined twice`);
    seen.add(m.id);
    for (const id of Object.keys(m.weights)) if (!registry.has(id)) problems.push(`macro "${m.id}" weights unknown axis "${id}"`);
  }
  return problems;
}
