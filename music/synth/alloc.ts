/**
 * Which pool voice plays which note. Pure (no Web Audio), so it is tested in node. For a chord starting at one time:
 *   1. a note already sounding and ending right now ties onto its voice (a held common tone keeps ringing);
 *   2. the rest go to voices that have gone quiet, the longest-quiet first;
 *   3. failing that, a voice still in its release tail, the earliest-ending first;
 *   4. failing that, the oldest note is stolen.
 */

export interface SlotState {
  note: number | null;
  /** When its current note ends (or ended). */
  endsAt: number;
  /** When its release tail has died away. */
  quietAt: number;
  startedAt: number;
}

export interface Assignment {
  /** Index into the notes passed in. */
  index: number;
  slot: number;
  tie: boolean;
}

const EPS = 1e-4;

export function allocate(slots: readonly SlotState[], notes: readonly number[], t: number): Assignment[] {
  const taken = new Set<number>();
  const out: Assignment[] = [];
  const rest: number[] = [];
  notes.forEach((note, index) => {
    const i = slots.findIndex((s, k) => !taken.has(k) && s.note === note && Math.abs(s.endsAt - t) < EPS);
    if (i >= 0) {
      taken.add(i);
      out.push({ index, slot: i, tie: true });
    } else rest.push(index);
  });
  for (const index of rest) {
    const free = slots.map((s, k) => ({ s, k })).filter(({ k }) => !taken.has(k));
    const quiet = free.filter(({ s }) => s.quietAt <= t + EPS).sort((a, b) => a.s.quietAt - b.s.quietAt);
    const releasing = free.filter(({ s }) => s.endsAt <= t + EPS).sort((a, b) => a.s.endsAt - b.s.endsAt);
    const oldest = [...free].sort((a, b) => a.s.startedAt - b.s.startedAt);
    const pick = quiet[0] ?? releasing[0] ?? oldest[0];
    if (!pick) break;
    taken.add(pick.k);
    out.push({ index, slot: pick.k, tie: false });
  }
  return out;
}
