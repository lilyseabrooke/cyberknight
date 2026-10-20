import type { MissionDef } from '../../missionkit';
import { SAFEKEEPING } from './safekeeping';

/** Every mission there is, by id. A new one is a file in this folder and a line here; see docs/missions/TEMPLATE.md. */
export const MISSIONS: Record<string, MissionDef> = {
  [SAFEKEEPING.id]: SAFEKEEPING,
};
