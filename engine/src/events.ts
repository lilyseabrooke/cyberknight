/**
 * The engine emits structured events; a separate text layer renders them as prose.
 * See docs/TONE.md for the two voices.
 *
 * `type` is the interaction/happening ("kiss", "fight_end"), `data.variant` selects
 * which specific thing happened, and `outcome` is the overall valence for the player.
 */
export type Outcome = 'good' | 'bad' | 'mixed';

export type EventData = Record<string, string | number | boolean>;

export interface GameEvent {
  beat: number;
  type: string;
  outcome: Outcome;
  data: EventData;
  /** Set on an event that opens a group (see `nested`); unique within its beat. */
  id?: string;
  /** The group this event belongs to: the `id` of the event that opened it. Absent at the top level. */
  in?: string;
}

/**
 * Tell a story with a beginning and a middle: `type` introduces it, and whatever `fn` emits belongs to it.
 * The log shows the group indented under its opening line, and plays it back one line at a time.
 */
export function nested(
  c: { emit(type: string, outcome: Outcome, data?: EventData): void; nest?(type: string, outcome: Outcome, data: EventData, fn: () => void): void },
  type: string,
  outcome: Outcome,
  data: EventData,
  fn: () => void,
): void {
  if (c.nest) c.nest(type, outcome, data, fn);
  else {
    c.emit(type, outcome, data);
    fn();
  }
}

/** How deep each event sits (0 = top level), for events from one step in the order they were emitted. */
export function depths(events: readonly GameEvent[]): number[] {
  const at = new Map<string, number>();
  return events.map((e) => {
    const d = e.in === undefined ? 0 : (at.get(e.in) ?? 0) + 1;
    if (e.id !== undefined) at.set(e.id, d);
    return d;
  });
}
