/**
 * The engine emits structured events; a separate text layer renders them as prose.
 * See docs/TONE.md for the two voices.
 */
export type EventType =
  | 'depart'
  | 'hunt'
  | 'drink'
  | 'flirt'
  | 'brawl'
  | 'hack'
  | 'patch_up'
  | 'dragon_fight'
  | 'death';

export type Outcome = 'good' | 'bad' | 'mixed';

export interface GameEvent {
  beat: number;
  type: EventType;
  outcome: Outcome;
  /** Free-form details the text layer can use (amounts, target names, etc.). */
  data: Record<string, string | number | boolean>;
}
