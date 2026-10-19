/**
 * The conductor: generates bar N+1 while bar N plays (docs/MUSIC_PLAN.md §4.1). Phase 1 drives the floor only: kick, sub and the
 * character bass over a fixed root or a test loop of roots. Harmony, form and songs replace the root loop in later phases.
 */
import { AXIS_REGISTRY, type AxisRegistry } from './axes/registry';
import { evaluateMacros, type MacroValues } from './axes/macros';
import { AxisState } from './axes/state';
import { evaluateMods } from './mods';
import { PATCHES } from './patches';
import { newRiff, renderBass, type Riff } from './roles/bass';
import { KickChooser, renderKick, renderSub, type KickFeel } from './roles/rhythm';
import { foldInto } from './theory';
import type { Bar, NoteEvent, ParamEvent, RoleId } from './types';

export interface ConductorOptions {
  seed: number;
  bpm?: number;
  /** Pitch class of the key's root, 0 = C. E (4) by default: heavy and low. */
  key?: number;
  /** Semitone offsets from the key, one per bar, looped. A test progression until harmony exists. */
  roots?: number[];
  registry?: AxisRegistry;
}

/** i-VI-III-VII in natural minor: enough movement to hear the bass follow the root. */
export const TEST_PROGRESSION = [0, 8, 3, 10];

export class Conductor {
  readonly axes: AxisState;
  bpm: number;
  key: number;
  roots: number[];
  riff: Riff;
  /** Macro values pinned by hand (MusicLab), overriding what the axes say. */
  readonly overrides: Record<string, number> = {};
  readonly muted = new Set<RoleId>();
  private readonly kicks = new KickChooser();
  private next = 0;
  /** What the last bar was played with, for readouts. */
  last: { macros: MacroValues; kick: KickFeel } = { macros: {}, kick: 'four' };

  constructor(opts: ConductorOptions) {
    this.axes = new AxisState(opts.registry ?? AXIS_REGISTRY);
    this.bpm = opts.bpm ?? 120;
    this.key = opts.key ?? 4;
    this.roots = opts.roots ?? [0];
    this.riff = newRiff(opts.seed);
  }

  /** The bar that will be rendered next. */
  get barIndex(): number {
    return this.next;
  }

  macros(): MacroValues {
    return { ...evaluateMacros(this.axes.values()), ...this.overrides };
  }

  renderBar(): Bar {
    const index = this.next++;
    this.axes.advance(1);
    const macros = this.macros();
    const offset = this.roots[index % this.roots.length] ?? 0;
    // The key's root in the bass register (E2-D#3); the sub and kick fold it lower themselves.
    const root = foldInto(40 + ((this.key - 4 + 12) % 12) + offset, 40, 51);

    const kick = this.kicks.choose(macros);
    this.last = { macros, kick };
    const notes: NoteEvent[] = [];
    if (!this.muted.has('kick')) notes.push(...renderKick(kick, root));
    if (!this.muted.has('sub')) notes.push(...renderSub(root));
    if (!this.muted.has('bass')) notes.push(...renderBass(this.riff, macros, index, root));

    const params: ParamEvent[] = [];
    const ctx = { macros, axes: this.axes.values(), traits: {} };
    for (const [role, patch] of Object.entries(PATCHES) as [RoleId, (typeof PATCHES)[keyof typeof PATCHES]][]) {
      for (const [path, value] of Object.entries(evaluateMods(patch, ctx))) params.push({ role, path, value });
    }

    return {
      index,
      bpm: this.bpm,
      notes,
      params,
      kicks: this.muted.has('kick') ? [] : notes.filter((n) => n.role === 'kick' && n.vel > 0.8).map((n) => n.t),
      macros,
    };
  }
}
