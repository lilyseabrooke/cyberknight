/**
 * Modulation routes: how a patch says the music bends it (docs/MUSIC_PLAN.md §6.3). Pure, so the synth only ever receives
 * numbers, and validation can check every route against the patch and the registries.
 */
import type { AxisRegistry, AxisValues } from './axes/registry';
import type { MacroValues } from './axes/macros';
import type { ModRoute, ModSource, Patch } from './types';

/** The parameters a patch exposes to mod routes. A route to anything else is a mistake. */
export function paramPaths(p: Patch): string[] {
  const out = ['level'];
  p.osc.forEach((o, i) => {
    out.push(`osc.${i}.level`, `osc.${i}.detune`);
    if (o.fm) out.push(`osc.${i}.fm`);
  });
  (p.lfo ?? []).forEach((_, i) => out.push(`lfo.${i}.depth`));
  if (p.formant) out.push('formant.vowel', 'formant.mix');
  if (p.comb) out.push('comb.feedback', 'comb.mix');
  if (p.parallel) out.push('parallel.drive', 'parallel.mix');
  if (p.filter) out.push('filter.cutoff', 'filter.q', 'filter.env');
  if (p.env.filterDecay !== undefined) out.push('env.filterDecay');
  if (p.drive) out.push('drive.amount', 'drive.crush');
  if (p.glide !== undefined) out.push('glide');
  if (p.accent !== undefined) out.push('accent');
  return out;
}

/** A patch's own value for a path, before any route. */
export function baseValue(p: Patch, path: string): number {
  const [head, a, b] = path.split('.');
  switch (head) {
    case 'level':
      return p.level;
    case 'osc': {
      const o = p.osc[Number(a)];
      if (!o) break;
      if (b === 'fm') {
        if (!o.fm) break;
        return o.fm.index;
      }
      return b === 'level' ? o.level : o.detune;
    }
    case 'lfo': {
      const l = p.lfo?.[Number(a)];
      if (!l) break;
      return l.depth;
    }
    case 'formant':
      if (!p.formant) break;
      return a === 'vowel' ? p.formant.vowel : p.formant.mix;
    case 'comb':
      if (!p.comb) break;
      return a === 'feedback' ? p.comb.feedback : p.comb.mix;
    case 'parallel':
      if (!p.parallel) break;
      return a === 'drive' ? p.parallel.drive : p.parallel.mix;
    case 'filter':
      if (!p.filter) break;
      return a === 'cutoff' ? p.filter.cutoff : a === 'q' ? p.filter.q : p.filter.env;
    case 'env':
      return p.env.filterDecay ?? 0;
    case 'drive':
      if (!p.drive) break;
      return a === 'amount' ? p.drive.amount : p.drive.crush;
    case 'glide':
      return p.glide ?? 0;
    case 'accent':
      return p.accent ?? 0;
  }
  throw new Error(`patch "${p.id}" has no parameter "${path}"`);
}

export interface ModContext {
  macros: MacroValues;
  axes: AxisValues;
  traits: Readonly<Record<string, number>>;
}

export function sourceValue(src: ModSource, ctx: ModContext): number {
  const i = src.indexOf(':');
  const kind = src.slice(0, i);
  const id = src.slice(i + 1);
  const table = kind === 'macro' ? ctx.macros : kind === 'axis' ? ctx.axes : ctx.traits;
  return table[id] ?? 0;
}

export function shape(route: ModRoute, x: number): number {
  const [w0, w1] = route.window ?? [0, 1];
  const t = Math.min(1, Math.max(0, (x - w0) / (w1 - w0)));
  const [lo, hi] = route.range;
  switch (route.curve ?? 'lin') {
    case 'exp':
      return lo * (hi / lo) ** t;
    case 'scurve': {
      const s = t * t * (3 - 2 * t);
      return lo + (hi - lo) * s;
    }
    default:
      return lo + (hi - lo) * t;
  }
}

/** The value of every routed parameter. When several routes hit one parameter, the last wins: keep it to one per parameter. */
export function evaluateMods(p: Patch, ctx: ModContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of p.mods) out[r.dst] = shape(r, sourceValue(r.src, ctx));
  return out;
}

/** Every route must name a real parameter of its patch and a known source. */
export function validatePatch(p: Patch, known: { axes: AxisRegistry; macros: readonly string[]; traits: readonly string[] }): string[] {
  const problems: string[] = [];
  const paths = new Set(paramPaths(p));
  const dsts = new Set<string>();
  for (const r of p.mods) {
    if (!paths.has(r.dst)) problems.push(`${p.id}: no parameter "${r.dst}"`);
    if (dsts.has(r.dst)) problems.push(`${p.id}: two routes into "${r.dst}"`);
    dsts.add(r.dst);
    const i = r.src.indexOf(':');
    const kind = r.src.slice(0, i);
    const id = r.src.slice(i + 1);
    const ok = kind === 'macro' ? known.macros.includes(id) : kind === 'axis' ? known.axes.has(id) : kind === 'trait' ? known.traits.includes(id) : false;
    if (!ok) problems.push(`${p.id}: unknown source "${r.src}"`);
    if (r.window && !(r.window[1] > r.window[0])) problems.push(`${p.id}: route into "${r.dst}" has an empty window`);
    if (r.curve === 'exp' && (r.range[0] <= 0 || r.range[1] <= 0)) problems.push(`${p.id}: exp route into "${r.dst}" needs a positive range`);
  }
  return problems;
}
