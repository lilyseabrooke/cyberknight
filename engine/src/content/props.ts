/**
 * Things in a room that an Override can set off to draw people's attention: the board's distractions (see prowl.ts).
 * Each one makes a noise where it stands when she gets into it, and a few do something more. The rooms of the
 * dungeons each have a few; anywhere else is not set up yet.
 */
export type PropKind = 'speaker' | 'terminal' | 'vending' | 'jukebox' | 'screen' | 'fuse_box' | 'bins' | 'crates' | 'stall' | 'lamp' | 'vent';

export interface PropDef {
  label: string;
  /** How loud it is where it stands, 0..1. */
  noise: number;
  /** How many times it can be set off. */
  charges: number;
  /** The lights go out this far around it for a while. */
  darkens?: number;
  /** Pushed over, pulled down or set off in the way of whoever is behind her: how much ground it costs them (a chase). */
  slows?: number;
}

export const PROPS: Record<PropKind, PropDef> = {
  speaker: { label: 'a PA speaker', noise: 0.85, charges: 1 },
  terminal: { label: 'a terminal', noise: 0.35, charges: 2 },
  vending: { label: 'a vending machine', noise: 0.5, charges: 2 },
  jukebox: { label: 'a jukebox', noise: 0.8, charges: 1 },
  screen: { label: 'a wall screen', noise: 0.45, charges: 2 },
  fuse_box: { label: 'a fuse box', noise: 0.3, charges: 1, darkens: 3 },
  // The street's own: nothing to override, just things that can be put in somebody's way.
  bins: { label: 'a row of bins', noise: 0.3, charges: 2, slows: 1 },
  crates: { label: 'a stack of crates', noise: 0.4, charges: 1, slows: 1.6 },
  stall: { label: 'a stall awning', noise: 0.5, charges: 1, slows: 1.3 },
  lamp: { label: 'a streetlamp', noise: 0.15, charges: 1, darkens: 4 },
  vent: { label: 'a steam vent', noise: 0.3, charges: 2, darkens: 3, slows: 0.4 },
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
