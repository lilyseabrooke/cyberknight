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
}
