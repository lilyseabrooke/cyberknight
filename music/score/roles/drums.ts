/**
 * Hats, backbeat and percussion (docs/MUSIC_PLAN.md §7.3). The kit's figures are material: chosen once from a seed, then thickened or
 * thinned by the macros through threshold sampling, the same way the bass riff is. Fills land on the loop's turnaround bar.
 */
import type { MacroValues } from '../axes/macros';
import { Gate } from '../axes/state';
import { unit } from '../rng';
import type { NoteEvent, RoleId } from '../types';
import type { KickFeel } from './rhythm';

export interface Kit {
  seed: number;
  backbeat: 'clap' | 'snare' | 'both';
  /** Steps the percussion figure plays on, and which sound (0 clank, 1 rim). */
  perc: { t: number; variant: number }[];
}

const PERC_STEPS = [3, 6, 7, 10, 11, 13, 14, 15];

export function newKit(seed: number): Kit {
  const u = unit(seed, 0xb4c);
  const perc = PERC_STEPS.filter((t) => unit(seed, 0x9e2c, t) < 0.4)
    .slice(0, 4)
    .map((t) => ({ t, variant: unit(seed, 0x9e2d, t) < 0.5 ? 0 : 1 }));
  return { seed, backbeat: u < 0.45 ? 'clap' : u < 0.75 ? 'snare' : 'both', perc: perc.length ? perc : [{ t: 7, variant: 0 }, { t: 14, variant: 1 }] };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export class DrumPart {
  private readonly hats = new Gate(0.1, 0.03);
  private readonly opens = new Gate(0.45, 0.04);
  private readonly backbeat = new Gate(0.3, 0.04);
  private readonly perc = new Gate(0.6, 0.04);

  constructor(public kit: Kit) {}

  render(m: MacroValues, bar: number, kick: KickFeel, turnaround: boolean): NoteEvent[] {
    const dens = m.density ?? 0;
    const drive = m.drive ?? 0;
    const aggr = m.aggression ?? 0;
    const busy = Math.max(dens, drive);
    const seed = this.kit.seed;
    const out: NoteEvent[] = [];
    // Humanized velocity: a different small wobble each bar, the same every time this bar is rendered.
    const hit = (role: RoleId, t: number, vel: number, variant?: number): void => {
      const v = clamp01(vel * (1 + 0.2 * (unit(seed, 0x7e1, bar, Math.round(t * 2), role.length) - 0.5)));
      const n: NoteEvent = { t, role, vel: v, dur: 1 };
      if (variant !== undefined) n.variant = variant;
      out.push(n);
    };

    if (this.hats.update(busy)) {
      const open = this.opens.update(busy);
      const sixteenths = clamp01((drive - 0.45) / 0.35);
      for (let t = 0; t < 16; t++) {
        if (t % 2 === 0) {
          const offbeat = t % 4 === 2;
          if (offbeat && open) hit('openhat', t, 0.55);
          else hit('hat', t, offbeat ? 0.6 : 0.42);
        } else if (unit(seed, 0x16e, t) < sixteenths) hit('hat', t, 0.34);
      }
    }

    if (this.backbeat.update(dens)) {
      const steps = kick === 'half' ? [8] : [4, 12];
      for (const t of steps) {
        if (this.kit.backbeat !== 'snare') hit('clap', t, 0.85);
        if (this.kit.backbeat !== 'clap') hit('snare', t, 0.8);
      }
      // Ghost snares once it gets rough.
      if (aggr > 0.55) for (const t of [7, 9, 15]) if (unit(seed, 0x6057, t) < (aggr - 0.55) * 1.6) hit('snare', t, 0.24);
    }

    if (this.perc.update(dens)) for (const p of this.kit.perc) hit('perc', p.t, 0.5, p.variant);

    // The turnaround's fill, graded by how much is going on: a hat flam, a snare roll, or a full roll with 32nds.
    if (turnaround && dens > 0.15) {
      if (dens < 0.4) {
        hit('hat', 14.5, 0.4);
        hit('hat', 15.5, 0.5);
      } else if (dens < 0.75) {
        for (const [i, t] of [12, 13, 14, 15].entries()) hit('snare', t, 0.4 + 0.13 * i);
      } else {
        for (let t = 8; t < 16; t++) hit('snare', t, 0.35 + 0.06 * (t - 8));
        hit('snare', 14.5, 0.7);
        hit('snare', 15.5, 0.8);
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }
}
