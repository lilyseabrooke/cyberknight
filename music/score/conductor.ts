/**
 * The conductor: generates bar N+1 while bar N plays (docs/MUSIC_PLAN.md §4.1). Phase 2 plays one progression as a fixed 8-bar loop
 * with the full rhythm section and the beds. Form (sections, material, the planner) replaces the fixed loop in phase 3.
 */
import { AXIS_REGISTRY, type AxisRegistry } from './axes/registry';
import { evaluateMacros, type MacroValues } from './axes/macros';
import { AxisState, Gate } from './axes/state';
import { BANKS, HarmonyState, LOOP_BARS, type BankId } from './harmony';
import { evaluateMods } from './mods';
import { PATCHES } from './patches';
import { newRiff, renderBass, type Riff } from './roles/bass';
import { PadPart, padRhythmFor, renderDrone } from './roles/beds';
import { DrumPart, newKit } from './roles/drums';
import { KickChooser, renderKick, renderSub, type KickFeel } from './roles/rhythm';
import { StabPart } from './roles/stabs';
import type { Bar, NoteEvent, ParamEvent, PatchedRole, RoleId } from './types';
import { hash } from './rng';

export interface ConductorOptions {
  seed: number;
  bpm?: number;
  /** Pitch class of the key's root, 0 = C. E (4) by default: heavy and low. */
  key?: number;
  progression?: { bank: BankId; index: number };
  registry?: AxisRegistry;
}

export class Conductor {
  readonly axes: AxisState;
  bpm: number;
  key: number;
  seed: number;
  riff: Riff;
  readonly harmony: HarmonyState;
  readonly pad: PadPart;
  readonly stabs = new StabPart();
  readonly drums: DrumPart;
  /** Macro values pinned by hand (MusicLab), overriding what the axes say. */
  readonly overrides: Record<string, number> = {};
  readonly muted = new Set<RoleId>();
  private readonly kicks = new KickChooser();
  private readonly stabsOn = new Gate(0.45, 0.04);
  private readonly droneOn = new Gate(0.6, 0.04);
  private next = 0;
  /** What the last bar was played with, for readouts. */
  last: { macros: MacroValues; kick: KickFeel; stabs: string; drone: boolean } = { macros: {}, kick: 'four', stabs: 'off', drone: false };

  constructor(opts: ConductorOptions) {
    this.axes = new AxisState(opts.registry ?? AXIS_REGISTRY);
    this.bpm = opts.bpm ?? 120;
    this.key = opts.key ?? 4;
    this.seed = opts.seed;
    this.riff = newRiff(opts.seed);
    const p = opts.progression ?? { bank: 'rest', index: 0 };
    this.harmony = new HarmonyState(BANKS[p.bank][p.index]!.chords);
    this.pad = new PadPart(padRhythmFor(hash(opts.seed, 0x9ad)));
    this.drums = new DrumPart(newKit(hash(opts.seed, 0xd2)));
  }

  setProgression(bank: BankId, index: number): void {
    this.harmony.chords = BANKS[bank][index]!.chords;
  }

  /** A new riff, kit and pad articulation: new material on the same harmony. */
  reseed(seed: number): void {
    this.seed = seed;
    this.riff = newRiff(seed);
    this.pad.rhythm = padRhythmFor(hash(seed, 0x9ad));
    this.drums.kit = newKit(hash(seed, 0xd2));
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
    const harmony = this.harmony.bar(index, this.key, macros);
    const turnaround = index % LOOP_BARS === LOOP_BARS - 1;
    const kick = this.kicks.choose(macros);
    const on = (r: RoleId): boolean => !this.muted.has(r);

    // Every part is rendered every bar, muted or not, so its state (voice leading, gates) runs on and unmuting is seamless.
    const bass = renderBass(this.riff, macros, index, harmony);
    const stabsOn = this.stabsOn.update(macros.density ?? 0);
    const stabs = this.stabs.render(harmony, macros, on('bass') ? bass : []);
    const droneOn = this.droneOn.update(macros.darkness ?? 0);
    const pad = this.pad.render(harmony, macros);
    const drums = this.drums.render(macros, index, kick, turnaround);

    const notes: NoteEvent[] = [
      ...renderKick(kick, this.key),
      ...renderSub(harmony),
      ...bass,
      ...pad,
      ...(stabsOn ? stabs : []),
      ...(droneOn ? renderDrone(harmony) : []),
      ...drums,
    ].filter((n) => on(n.role));
    this.last = { macros, kick, stabs: stabsOn ? this.stabs.feel : 'off', drone: droneOn };

    const params: ParamEvent[] = [];
    const ctx = { macros, axes: this.axes.values(), traits: {} };
    for (const [role, patch] of Object.entries(PATCHES) as [PatchedRole, (typeof PATCHES)[PatchedRole]][]) {
      for (const [path, value] of Object.entries(evaluateMods(patch, ctx))) params.push({ role, path, value });
    }

    // The trance gate opens on the beds as the drive comes up.
    const drive = macros.drive ?? 0;
    const bedGate = drive > 0.6 ? Math.min(0.75, (drive - 0.6) * 2) : 0;

    return {
      index,
      bpm: this.bpm,
      notes,
      params,
      kicks: notes.filter((n) => n.role === 'kick' && n.vel > 0.8).map((n) => n.t),
      macros,
      bedGate,
      harmony,
    };
  }
}
