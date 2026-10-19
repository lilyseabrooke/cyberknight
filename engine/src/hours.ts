import { hourOf, minuteOfDay } from './clock';
import { isShut } from './shutdown';
import type { Id, Location, World } from './types';

/**
 * When places are open and how full they are, by the time of day. Both are plain functions of the world clock.
 *
 * `Location.hours` is [open, close] in hours of the day; a close earlier than the open runs past midnight ([20, 6] is eight in
 * the evening to six in the morning). A place with no hours is always open. Only the kinds in `DEFAULT_HOURS` have any (clinics and the streets never close; neither do homes, lairs or corporate floors, which are shut by other means) unless
 * the place sets its own.
 */
export type Hours = [open: number, close: number];

export const DEFAULT_HOURS: Partial<Record<Location['kind'], Hours>> = {
  club: [20, 6],
  bar: [16, 5],
  shop: [11, 3],
  pawn: [11, 3],
  realty: [9, 21],
  gym: [5, 1],
};

/** The hours a place keeps: its own, else its building's main room, else what its kind keeps. */
export function hoursOf(w: Pick<World, 'locations'>, loc: Location): Hours | undefined {
  if (loc.hours) return loc.hours;
  const main = loc.gymRoom?.main ?? loc.pawnRoom?.main;
  const owner = main ? w.locations[main] : undefined;
  return owner?.hours ?? DEFAULT_HOURS[(owner ?? loc).kind];
}

export function openAt(w: Pick<World, 'locations'>, loc: Location, clock: number): boolean {
  const h = hoursOf(w, loc);
  if (!h) return true;
  const [open, close] = h;
  const m = minuteOfDay(clock) / 60;
  if (open === close) return true;
  return open < close ? m >= open && m < close : m >= open || m < close;
}

/** Locked up or taped off, or outside its hours: nobody goes in, and nobody who works there is about. */
export const isClosed = (w: World, id: Id): boolean => {
  const loc = w.locations[id];
  return isShut(w, id) || (!!loc && !openAt(w, loc, w.clock));
};

/** How full a place is at each hour from midnight, 0 to 1. A place without a curve is always as full as it gets. */
const CROWD: Partial<Record<Location['kind'], number[]>> = {
  //        0    1    2    3    4    5    6    7    8    9    10   11   12   13   14   15   16   17   18   19   20   21   22   23
  club: [1.0, 0.9, 0.7, 0.4, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.15, 0.35, 0.55, 0.8, 1.0],
  street: [0.6, 0.5, 0.4, 0.3, 0.25, 0.3, 0.5, 0.8, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.9, 0.75],
  clinic: [0.9, 0.9, 0.8, 0.7, 0.6, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95],
  bar: [0.7, 0.45, 0.3, 0.2, 0.1, 0.1, 0.1, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5, 0.45, 0.35, 0.35, 0.45, 0.65, 0.85, 1.0, 1.0, 1.0, 1.0, 0.9],
};

export function crowdAt(w: Pick<World, 'locations'>, loc: Location, clock: number): number {
  const main = loc.gymRoom?.main ?? loc.pawnRoom?.main;
  const kind = (main ? w.locations[main]?.kind : undefined) ?? loc.kind;
  return CROWD[kind]?.[hourOf(clock)] ?? 1;
}
