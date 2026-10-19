/**
 * The conductor: generates bar N+1 while bar N plays (docs/MUSIC_PLAN.md §4.1). Phase 2 plays one progression as a fixed 8-bar loop
 * with the full rhythm section and the beds. Form (sections, material, the planner) replaces the fixed loop in phase 3.
 */
import { AXIS_REGISTRY, type AxisRegistry } from './axes/registry';
import { evaluateMacros, type MacroValues } from './axes/macros';
import { AxisState, Gate } from './axes/state';
import { BANKS, HarmonyState, LOOP_BARS, type BankId } from './harmony';
import { evaluateMods } from './mods';
import { BASS_SOUNDS, PATCHES, type BassSound } from './patches';
import { BassPart, newBass, shapeRange, type BassBar, type BassStyle } from './roles/bass';
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
  readonly bass: BassPart;
  /** Pinned by hand (MusicLab, renders); otherwise the seed's. */
  bassStyle: BassStyle | null = null;
  bassSound: BassSound | null = null;
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
  last: { macros: MacroValues; kick: KickFeel; stabs: string; drone: boolean; bass: string } = { macros: {}, kick: 'four', stabs: 'off', drone: false, bass: '' };

  constructor(opts: ConductorOptions) {
    this.axes = new AxisState(opts.registry ?? AXIS_REGISTRY);
    this.bpm = opts.bpm ?? 120;
    this.key = opts.key ?? 4;
    this.seed = opts.seed;
    this.bass = new BassPart(newBass(opts.seed));
    const p = opts.progression ?? { bank: 'rest', index: 0 };
    this.harmony = new HarmonyState(BANKS[p.bank][p.index]!.chords);
    this.pad = new PadPart(padRhythmFor(hash(opts.seed, 0x9ad)));
    this.drums = new DrumPart(newKit(hash(opts.seed, 0xd2)));
  }

  setProgression(bank: BankId, index: number): void {
    this.harmony.chords = BANKS[bank][index]!.chords;
  }

  /** A new bassline, kit and pad articulation: new material on the same harmony. */
  reseed(seed: number): void {
    this.seed = seed;
    this.bass.material = newBass(seed, this.bassStyle ?? undefined, this.bassSound ?? undefined);
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

  /** Pin the bass to a style (keeping the seed's other choices), or let the seed choose again. */
  setBassStyle(style: BassStyle | null): void {
    if (style === this.bassStyle) return;
    this.bassStyle = style;
    this.bass.material = newBass(this.seed, style ?? undefined, this.bassSound ?? undefined);
  }

  /** Pin the bass to a sound, or let its style pick from its pair again. */
  setBassSound(sound: BassSound | null): void {
    if (sound === this.bassSound) return;
    this.bassSound = sound;
    this.bass.material = newBass(this.seed, this.bassStyle ?? undefined, sound ?? undefined);
  }

  renderBar(): Bar {
    const index = this.next++;
    this.axes.advance(1);
    const macros = this.macros();
    const harmony = this.harmony.bar(index, this.key, macros);
    const turnaround = index % LOOP_BARS === LOOP_BARS - 1;
    const kick = this.kicks.choose(macros);
    const on = (r: RoleId): boolean => !this.muted.has(r);

    const ctx = { macros, axes: this.axes.values(), traits: {} };
    const bassPatch = BASS_SOUNDS[this.bass.material.sound];
    const patchOf = (r: PatchedRole) => (r === 'bass' ? bassPatch : PATCHES[r]);
    const modded = Object.fromEntries((Object.keys(PATCHES) as PatchedRole[]).map((r) => [r, evaluateMods(patchOf(r), ctx)])) as Record<PatchedRole, Record<string, number>>;

    // Every part is rendered every bar, muted or not, so its state (voice leading, gates) runs on and unmuting is seamless.
    const bassBar: BassBar = this.bass.render(harmony, macros, index, modded.bass['filter.cutoff'] ?? bassPatch.filter?.cutoff ?? 300);
    const bass = bassBar.notes;
    const stabsOn = this.stabsOn.update(macros.density ?? 0);
    const stabs = this.stabs.render(harmony, macros, on('bass') ? bass : []);
    const droneOn = this.droneOn.update(macros.darkness ?? 0);
    const pad = this.pad.render(harmony, macros);
    const drums = this.drums.render(macros, index, kick, turnaround);

    const notes: NoteEvent[] = [
      ...renderKick(kick, this.key),
      ...renderSub(harmony, shapeRange(bassBar.shape), bassBar.attack),
      ...bass,
      ...pad,
      ...(stabsOn ? stabs : []),
      ...(droneOn ? renderDrone(harmony) : []),
      ...drums,
    ].filter((n) => on(n.role));
    this.last = { macros, kick, stabs: stabsOn ? this.stabs.feel : 'off', drone: droneOn, bass: `${this.bass.material.style} · ${this.bass.material.sound} · ${bassBar.shape}` };

    // The patches' mod-route values at the bar line, except where a part draws its own contour through the bar.
    const params: ParamEvent[] = [...bassBar.params];
    const contoured = new Set(bassBar.params.map((p) => p.path));
    for (const role of Object.keys(modded) as PatchedRole[]) {
      for (const [path, value] of Object.entries(modded[role])) if (!(role === 'bass' && contoured.has(path))) params.push({ role, path, value });
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
      patches: { bass: bassPatch.id },
    };
  }
}
