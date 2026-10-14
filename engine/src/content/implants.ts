import type { SkillId } from './skills';

export interface ImplantDef {
  name: string;
  /** What the street doc says. */
  pitch: string;
  /** What actually happens. */
  catch: string;
  stats?: Partial<Record<'muscle' | 'reflex' | 'hack' | 'charm', number>>;
  skills?: Partial<Record<SkillId, number>>;
  power?: number;
  /** Special-case behaviour keyed on in code. */
  flag?: string;
  cost: number;
}

/** Black-market chrome. Every upgrade has a catch. */
export const IMPLANTS: Record<string, ImplantDef> = {
  third_thumb: { name: 'third thumb', pitch: 'Better grip, better hacking.', catch: 'Cannot be unseen. Handshakes are awkward.', stats: { hack: 2, charm: -1 }, cost: 90 },
  chrome_larynx: { name: 'chrome larynx', pitch: 'Perfect pitch. Perfect beats.', catch: 'It speaks in a voice that is not hers when startled.', stats: { charm: 1 }, skills: { music: 3 }, cost: 120 },
  neon_liver: { name: 'neon liver', pitch: 'Filters anything.', catch: 'Glows through her shirt.', skills: { tolerance: 4 }, cost: 100, flag: 'glow' },
  mantis_blades: { name: 'mantis blades', pitch: 'Retractable. Deadly.', catch: 'Retract is more of a suggestion.', stats: { charm: -1 }, power: 6, cost: 160 },
  subdermal_disco: { name: 'subdermal disco ball', pitch: 'The party is inside you.', catch: 'Makes her very hard to ignore. Including by guards.', stats: { charm: 2 }, skills: { sneak: -2 }, cost: 110 },
  dragon_eye: { name: 'dragon-spec optics', pitch: 'See everything. Even in the dark.', catch: 'Sees the future, but blinks at the wrong times.', stats: { reflex: 2 }, cost: 130 },
  hydraulic_calves: { name: 'hydraulic calves', pitch: 'Leap tall buildings.', catch: 'Landing was not included.', stats: { reflex: 1, muscle: 1 }, cost: 120, flag: 'springs' },
  sonic_ear: { name: 'sonic ear', pitch: 'Hears trouble coming.', catch: 'Also hears everything about everybody.', skills: { sneak: 2 }, cost: 100, flag: 'sonic_ear' },
  bounty_scanner: { name: 'bounty-grade scanner', pitch: 'Sees the paper on anyone. Even the ones who paid to hide it.', catch: 'Also sees how little most people are worth.', cost: 140, flag: 'bounty_scan' },
  ad_blocker: { name: 'Atlas ad-blocker', pitch: 'Mute the propaganda.', catch: 'Suppresses her own sense of irony, slightly.', stats: { hack: 1 }, cost: 60, flag: 'ad_blocker' },
  emergency_defib: { name: 'emergency defibrillator', pitch: 'Cheat death. Once.', catch: 'Once. Only once. Do not test it.', cost: 220, flag: 'defib' },
};

export const IMPLANT_IDS = Object.keys(IMPLANTS);
export const MAX_IMPLANTS = 4;
