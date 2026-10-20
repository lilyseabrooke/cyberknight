import type { Ctx, World } from './types';
import { clamp } from './candidate';
import { skillLevel, train, skillRoot } from './skills';
import { workingCameras } from './witness';

/**
 * Overrides are the other kind of hacking: where a Hack (see `techniques.ts`) goes after quick, mobile systems
 * (robots, drones, cars, the chrome in people), an Override goes after big, fixed ones: buildings, infrastructure,
 * the camera mesh, the billboard. They're mostly for outside a fight.
 */
export function overrideChance(w: World, base: number, perInt = 0.06, perTinker = 0.03): number {
  const h = w.hero;
  return clamp(base + h.int * perInt + skillRoot(h, 'tinkering') * perTinker, 0.1, 0.9);
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

/**
 * Take one particular camera: the one that is looking at her. Where `blackout` takes the first of the cameras here, this takes the one that matters.
 * Returns whether it went down.
 */
export function hackCamera(c: Ctx, camId: string): boolean {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId]!;
  if (!rng.chance(overrideChance(w, 0.4))) {
    c.emit('camera_blackout', 'bad', { variant: 'fail', place: loc.name });
    return false;
  }
  const had = loc.camHacked && w.beat < loc.camHacked.until ? loc.camHacked.ids : [];
  loc.camHacked = { ids: [...had, camId], until: w.beat + CAMERA_DOWNTIME };
  train(c, 'tinkering', 1);
  c.emit('camera_blackout', 'good', { variant: 'success', place: loc.name, left: workingCameras(w, loc.id) });
  return true;
}

/** Power Cut (learned): the whole grid goes down for a while, and every camera with it. */
export function powerCut(c: Ctx): boolean {
  const { w, rng } = c;
  const loc = w.locations[w.hero.locationId]!;
  if (!rng.chance(overrideChance(w, 0.2))) {
    c.emit('power_cut', 'bad', { variant: 'fail', place: loc.name });
    return false;
  }
  w.blackoutUntil = Math.max(w.blackoutUntil, w.beat + 12);
  w.flags.blackout = true;
  train(c, 'tinkering', 2);
  c.emit('power_cut', 'good', { variant: 'success', place: loc.name });
  return true;
}

/** Alarm Spoof (learned): patrols get sent to the wrong address. Takes some heat off. */
export function alarmSpoof(c: Ctx): boolean {
  const { w, rng } = c;
  if (!rng.chance(overrideChance(w, 0.25))) {
    c.emit('alarm_spoof', 'bad', { variant: 'fail' });
    return false;
  }
  for (const f of ['npd', 'atlas']) w.heat[f] = Math.max(0, (w.heat[f] ?? 0) - 2);
  train(c, 'tinkering', 1);
  c.emit('alarm_spoof', 'good', { variant: 'success' });
  return true;
}
