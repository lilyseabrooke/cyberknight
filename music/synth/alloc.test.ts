import { describe, expect, it } from 'vitest';
import { allocate, type SlotState } from './alloc';

const slot = (note: number | null, endsAt: number, quietAt: number, startedAt = 0): SlotState => ({ note, endsAt, quietAt, startedAt });

describe('voice allocation', () => {
  it('ties a held common tone onto its voice, and gives the moving notes fresh voices', () => {
    const slots = [slot(52, 2, 4), slot(55, 2, 4), slot(59, 2, 4), slot(null, -1, -1), slot(null, -1, -1)];
    const plan = allocate(slots, [52, 57, 60], 2);
    expect(plan.find((a) => a.index === 0)).toEqual({ index: 0, slot: 0, tie: true });
    const moved = plan.filter((a) => !a.tie).map((a) => a.slot);
    expect(moved.sort()).toEqual([3, 4]);
  });

  it('takes a voice in its release tail before stealing a sounding one', () => {
    const slots = [slot(52, 10, 12, 1), slot(55, 1, 3, 0)];
    expect(allocate(slots, [60], 2)).toEqual([{ index: 0, slot: 1, tie: false }]);
  });

  it('steals the oldest note when every voice is busy', () => {
    const slots = [slot(52, 10, 12, 5), slot(55, 10, 12, 1), slot(59, 10, 12, 3)];
    expect(allocate(slots, [60], 2)).toEqual([{ index: 0, slot: 1, tie: false }]);
  });

  it('never gives two notes of a chord the same voice', () => {
    const slots = [slot(null, -1, -1), slot(null, -1, -1), slot(null, -1, -1)];
    const plan = allocate(slots, [48, 52, 55], 0);
    expect(new Set(plan.map((a) => a.slot)).size).toBe(3);
  });
});
