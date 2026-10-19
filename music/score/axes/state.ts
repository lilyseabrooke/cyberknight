/**
 * Axis targets and current values. Targets jump (a slider, later the bridge); current values slew toward them, rising fast and
 * falling slow, so a fight snaps the music up and the comedown takes a while. `Gate` adds hysteresis wherever a value switches
 * something on or off.
 */
import type { AxisRegistry, AxisValues } from './registry';

export class AxisState {
  private readonly target: Record<string, number> = {};
  private readonly current: Record<string, number> = {};

  constructor(private readonly registry: AxisRegistry) {
    for (const d of registry.defs) {
      this.target[d.id] = d.initial;
      this.current[d.id] = d.initial;
    }
  }

  setTarget(id: string, value: number): void {
    if (!this.registry.has(id)) throw new Error(`unknown axis "${id}"`);
    this.target[id] = Math.min(1, Math.max(0, value));
  }

  /** Jump straight to the targets, e.g. after a skip, or when MusicLab wants no slew. */
  snap(): void {
    for (const id of Object.keys(this.target)) this.current[id] = this.target[id]!;
  }

  /** Move every axis toward its target by `bars` worth of slew. */
  advance(bars: number): void {
    for (const d of this.registry.defs) {
      const cur = this.current[d.id]!;
      const tgt = this.target[d.id]!;
      const span = tgt > cur ? d.rise : d.fall;
      const step = span <= 0 ? Infinity : bars / span;
      this.current[d.id] = tgt > cur ? Math.min(tgt, cur + step) : Math.max(tgt, cur - step);
    }
  }

  values(): AxisValues {
    return { ...this.current };
  }

  targets(): AxisValues {
    return { ...this.target };
  }
}

/** An on/off switch with a dead zone, so a value hovering at a threshold doesn't flicker it. */
export class Gate {
  on: boolean;

  constructor(
    private readonly threshold: number,
    private readonly hysteresis: number,
    initial = false,
  ) {
    this.on = initial;
  }

  update(value: number): boolean {
    if (this.on && value < this.threshold - this.hysteresis) this.on = false;
    else if (!this.on && value > this.threshold + this.hysteresis) this.on = true;
    return this.on;
  }
}
