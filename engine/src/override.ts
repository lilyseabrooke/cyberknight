import type { Ctx, World } from './types';
import { clamp } from './candidate';
import { skillLevel, train } from './skills';
import { workingCameras } from './witness';

/**
 * Overrides are the other kind of hacking: where a Hack (see `techniques.ts`) goes after quick, mobile systems
 * (robots, drones, cars, the chrome in people), an Override goes after big, fixed ones: buildings, infrastructure,
 * the camera mesh, the billboard. They're mostly for outside a fight.
 */
export function overrideChance(w: World, base: number, perInt = 0.06, perTinker = 0.03): number {
  const h = w.hero;
  return clamp(base + h.int * perInt + skillLevel(h, 'tinkering') * perTinker, 0.1, 0.9);
}

/** Beats a downed camera stays down. */
export const CAMERA_DOWNTIME = 20;

/** Blackout: shut down one of the cameras here, so what she does next doesn't get reported. True if one went down. */
export function blackout(c: Ctx): boolean {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId]!;
  if (!workingCameras(w, loc.id)) return false;
  if (!rng.chance(overrideChance(w, 0.35))) {
    c.emit('camera_blackout', 'bad', { variant: 'fail', place: loc.name });
    return false;
  }
  const down = loc.camsDown && w.beat < loc.camsDown.until ? loc.camsDown.n : 0;
  loc.camsDown = { n: down + 1, until: w.beat + CAMERA_DOWNTIME };
  train(c, 'tinkering', 1);
  c.emit('camera_blackout', 'good', { variant: 'success', place: loc.name, left: workingCameras(w, loc.id) });
  return true;
}
