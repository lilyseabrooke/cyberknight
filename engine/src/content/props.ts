/**
 * Things in a room that an Override can set off to draw people's attention: the board's distractions (see prowl.ts).
 * Each one makes a noise where it stands when she gets into it, and a few do something more. The rooms of the
 * dungeons each have a few; anywhere else is not set up yet.
 */
export type PropKind = 'speaker' | 'terminal' | 'vending' | 'jukebox' | 'screen' | 'fuse_box';

export interface PropDef {
  label: string;
  /** How loud it is where it stands, 0..1. */
  noise: number;
  /** How many times it can be set off. */
  charges: number;
  /** The lights go out this far around it for a while. */
  darkens?: number;
}

export const PROPS: Record<PropKind, PropDef> = {
  speaker: { label: 'a PA speaker', noise: 0.85, charges: 1 },
  terminal: { label: 'a terminal', noise: 0.35, charges: 2 },
  vending: { label: 'a vending machine', noise: 0.5, charges: 2 },
  jukebox: { label: 'a jukebox', noise: 0.8, charges: 1 },
  screen: { label: 'a wall screen', noise: 0.45, charges: 2 },
  fuse_box: { label: 'a fuse box', noise: 0.3, charges: 1, darkens: 3 },
};

/** What each room of a dungeon keeps that she can get into. A room with none listed gets the dungeon's default. */
export const PROPS_BY_ROOM: Record<string, PropKind[]> = {
  gate: ['terminal'],
  hall: ['speaker'],
  barracks: ['vending', 'screen'],
  garage: ['fuse_box', 'terminal'],
  armory: ['terminal'],
  core: ['terminal', 'fuse_box'],
  command: ['screen', 'speaker'],
  door: ['jukebox'],
  hangout: ['jukebox', 'vending'],
  bunks: ['screen'],
  workshop: ['fuse_box', 'terminal'],
  stash: ['terminal'],
  pit: ['speaker'],
  den: ['screen', 'jukebox'],
  spot: ['screen'],
};
