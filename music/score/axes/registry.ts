/**
 * The axes that exist. An axis is a row, not a field: everything that reads one names it by id, so a new axis is a new
 * definition plus some weights (docs/MUSIC_PLAN.md §5.3). How an axis reads the world (`read` and `target`) arrives with the
 * bridge in phase 7; until then axes are set by hand in MusicLab.
 */

export interface AxisDef {
  id: string;
  label: string;
  kind: 'continuous';
  /** Slew, in bars: how long a full 0 -> 1 rise and a 1 -> 0 fall take. Rises fast, falls slow. */
  rise: number;
  fall: number;
  initial: number;
}

export type AxisValues = Readonly<Record<string, number>>;

export interface AxisRegistry {
  readonly defs: readonly AxisDef[];
  has(id: string): boolean;
  get(id: string): AxisDef | undefined;
}

export function createAxisRegistry(defs: readonly AxisDef[]): AxisRegistry {
  const byId = new Map<string, AxisDef>();
  for (const d of defs) {
    if (byId.has(d.id)) throw new Error(`axis "${d.id}" is registered twice`);
    byId.set(d.id, d);
  }
  return { defs, has: (id) => byId.has(id), get: (id) => byId.get(id) };
}

export const AXES: readonly AxisDef[] = [
  { id: 'intensity', label: 'Intensity', kind: 'continuous', rise: 0.25, fall: 8, initial: 0 },
  { id: 'danger', label: 'Danger', kind: 'continuous', rise: 0.5, fall: 4, initial: 0 },
  { id: 'heat', label: 'Heat', kind: 'continuous', rise: 0.25, fall: 16, initial: 0 },
];

export const AXIS_REGISTRY = createAxisRegistry(AXES);
