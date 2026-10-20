import type { Candidate } from './candidate';
import type { Ctx, Location, World } from './types';
import { addHeat, here, remember as remind } from './combat';
import { isClosed } from './hours';
import { odds, synergy, train } from './skills';
import { hatedGame, memoryOf } from './games';
import { learnCreator } from './creators';

/**
 * Records offices: where the city keeps its paperwork, and so where it keeps the name and the address of whoever made any
 * given game. A property office has a registry in its back room; a records floor in a tower (Atlas's, and the only part of
 * Atlas she has ever been glad of) has everything else. She can take a copy of the file she wants if she is quiet and quick,
 * and what she wants is the file for a game she has made up her mind about: the one she hates most, or the one a Calling is
 * about. A bad try bars her from that office and puts a mark against her name.
 */

export const isRecordsOffice = (l: Location | undefined): l is Location => !!l && (l.kind === 'realty' || (l.gen?.role === 'corp' && l.gen.rank !== undefined && /records floor$/.test(l.name)));
const isFloor = (l: Location): boolean => l.kind !== 'realty';

/** The game whose maker she most wants the file on, and has not got an address for. */
export function wantedGame(w: World): { id: string; title: string; like: number } | undefined {
  const cal = w.mind.calling;
  const pinned = cal?.id === 'creator' && cal.target?.game ? memoryOf(w, cal.target.game) : undefined;
  if (pinned && !pinned.located) return { id: cal!.target!.game!, title: pinned.title, like: pinned.like };
  const hated = hatedGame(w, -0.2);
  if (hated && !hated.located) return { id: hated.id, title: hated.title, like: hated.like };
  const any = Object.entries(w.mind.games ?? {}).filter(([, g]) => !g.located && g.plays >= 3).sort((a, b) => Math.abs(b[1].like) - Math.abs(a[1].like))[0];
  return any ? { id: any[0], title: any[1].title, like: any[1].like } : undefined;
}

const WIN_OFFICE = [
  'The property office at {place} keeps a registry in the back, between the deeds and a tin of biscuits. While {npc} is in the front arguing about a postcode, Blackbird takes a copy of the file for "{title}". It is warm from the copier.',
  'A drawer marked MISC at {place} turns out to be the whole city\'s business register. "{title}" is in it, under D for Designer. She photographs the page and puts the drawer back crooked, which is the standard.',
];
const LOSE_OFFICE = [
  '{npc} at {place} finds Blackbird in the registry with a drawer open and a phone in her hand. There is a long look. She is shown the door, and a card for the NPD, and the door again.',
  'The registry at {place} has an alarm on the drawer. It is a very small alarm, with a very large voice. Blackbird is outside before it has finished the first word.',
];
const WIN_FLOOR = [
  'The records floor at {place} is a long grey room of cabinets that hum. Blackbird walks in with a lanyard that is almost the right colour, finds "{title}" under a licensing heading, and walks out with a page. Nobody looks up. Nobody ever looks up.',
  'At {place}, Atlas keeps a copy of everything. Blackbird takes a copy of the copy of "{title}" and enjoys, for a moment, the idea of Atlas being useful to her.',
];
const LOSE_FLOOR = [
  'The cabinets at {place} are wired to the lanyard reader, and Blackbird\'s lanyard is a drawing. The floor goes red. A voice says "Records Wellness Check!" and she goes down the stairs three at a time with a stripe of heat across her back.',
  'A records clerk at {place} looks at her pass, then at her, then at the pass. The clerk is very calm. A button gets pressed. She leaves, at speed, with nothing but a paper cut.',
];

export function recordsCandidates(w: World): Candidate[] {
  const loc = w.locations[w.hero.locationId];
  if (!isRecordsOffice(loc) || isClosed(w, loc.id) || w.counters[`recordsban:${loc.id}`]) return [];
  const game = wantedGame(w);
  if (!game) return [];
  return [{
    key: 'records:steal',
    drives: { curiosity: 0.5, bravery: 0.2, greed: 0.1 },
    bonus: 0.04 + 0.25 * Math.abs(game.like),
    risk: 0.5,
    intent: { text: `Blackbird looks at the filing cabinets at ${loc.name} the way other people look at a menu.` },
    run: (c) => stealRecords(c, loc, game),
  }];
}

function stealRecords(c: Ctx, loc: Location, game: { id: string; title: string }): void {
  const { w, rng } = c;
  const floor = isFloor(loc);
  const p = odds(floor ? 0.22 : 0.34, 0.06, synergy(w.hero, ['stat:int', ['sneak', 0.6], ['tinkering', 0.4]]), 0.05, 0.88);
  const npc = here(w).find((n) => n.alive && !n.hostile && (n.tags.some((t) => ['clerk', 'staff'].includes(t)) || n.archetype === 'realtor'));
  const tok = { place: loc.name, title: game.title, npc: npc?.name ?? 'the clerk' };
  const fmt = (s: string): string => s.replace(/\{(\w+)\}/g, (m, k: string) => String((tok as Record<string, string>)[k] ?? m));
  train(c, 'sneak', 1);
  if (rng.chance(p)) {
    c.emit('records', 'good', {
      variant: floor ? 'floor.win' : 'office.win', text: fmt(rng.pick(floor ? WIN_FLOOR : WIN_OFFICE)),
      thought: rng.pick(['There is always a drawer.', 'Paperwork. The most dangerous thing in Neo.', 'They never do count the copies.']),
    });
    train(c, 'tinkering', 1);
    learnCreator(c, game.id, 'records');
    return;
  }
  c.emit('records', 'bad', { variant: floor ? 'floor.lose' : 'office.lose', text: fmt(rng.pick(floor ? LOSE_FLOOR : LOSE_OFFICE)) });
  w.counters[`recordsban:${loc.id}`] = 1;
  addHeat(w, floor ? 'atlas' : 'npd', floor ? 2 : 1);
  if (npc && !floor) {
    npc.affinity -= 6;
    remind(npc, 'caught Blackbird in the registry');
  }
}
