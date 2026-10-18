import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { expand } from './mapgen';
import { roadClass, type RoadClass } from './roads';
import { CLASS_OF, STREET_TYPES, streetTypeOf, typeFromName } from './streettypes';
import { splitWorld, upgradeUniverse } from './universe';
import type { Location } from './types';

/** How a street was classed before it had a type of its own: by the last word of its name. */
const BY_NAME: Record<string, RoadClass> = {
  alley: 'alley', passage: 'alley',
  walk: 'pedestrian', arcade: 'pedestrian', plaza: 'pedestrian', concourse: 'pedestrian', bazaar: 'pedestrian', market: 'pedestrian',
  lane: 'small', row: 'small', terrace: 'small', run: 'small', way: 'small', yard: 'small',
  street: 'street', avenue: 'street', boulevard: 'street', freightway: 'street', wharf: 'street',
};
const oldClass = (name: string, made: boolean): RoadClass => BY_NAME[name.split(/[\s,]+/).filter(Boolean).pop()?.toLowerCase() ?? ''] ?? (made ? 'street' : 'small');

describe('street types', () => {
  it('every type has a class for cars, and the type a name gives is classed as the name always was', () => {
    for (const t of STREET_TYPES) expect(CLASS_OF[t]).toBeDefined();
    const words = [...Object.keys(BY_NAME), 'roof', 'Pharaoh', 'nothing', ''];
    for (const word of words) {
      for (const made of [true, false]) {
        const name = `Some ${word}`;
        expect(CLASS_OF[typeFromName(name, made)], `${name} (${made ? 'made' : 'hand-built'})`).toBe(word === 'roof' ? 'small' : oldClass(name, made));
      }
    }
  });

  it('a street keeps the type it was born with, whatever it is called afterwards', () => {
    const w = createWorld({ seed: 'x', worldSeed: 'types', competence: 0.5 });
    const loc = w.locations.halo_alley!;
    expect(loc.street).toBe('alley');
    expect(roadClass(loc)).toBe('alley');
    loc.name = 'Strand Street';
    expect(streetTypeOf(loc)).toBe('alley');
    expect(roadClass(loc)).toBe('alley');
  });

  it('every street, hand-built or grown, has one, the same as its name gave it and a class the same as before', () => {
    const w = createWorld({ seed: 'x', worldSeed: 'grown types', competence: 0.5 });
    let edge: Location[] = ['street_main', 'club_backlot', 'halo_alley'].flatMap((id) => w.locations[id]!.exits.map((e) => w.locations[e.to]!).filter((l) => l.gen));
    for (let ring = 0; ring < 3; ring++) {
      const next: Location[] = [];
      for (const l of edge) {
        expand(w, l);
        for (const e of l.exits) if (w.locations[e.to]?.gen?.parent === l.id && w.locations[e.to]!.gen!.role === 'street') next.push(w.locations[e.to]!);
      }
      edge = next;
    }
    let streets = 0;
    const kinds = new Set<string>();
    for (const loc of Object.values(w.locations)) {
      if (loc.kind !== 'street') {
        expect(loc.street, loc.name).toBeUndefined();
        continue;
      }
      streets++;
      expect(loc.street, loc.name).toBeDefined();
      kinds.add(loc.street!);
      expect(loc.street).toBe(loc.road === 'highway' ? 'highway' : typeFromName(loc.name, !!loc.gen));
      expect(roadClass(loc), loc.name).toBe(loc.road ?? (loc.street === 'roof' ? 'small' : oldClass(loc.name, !!loc.gen)));
    }
    expect(streets).toBeGreaterThan(15);
    expect(kinds.size).toBeGreaterThan(5);
  });

  it('an older save, made before streets had types, is given them when it is brought forward', () => {
    const u = splitWorld(createWorld({ seed: 'x', worldSeed: 'old save', competence: 0.5 })).universe;
    const before = Object.fromEntries(Object.values(u.locations).filter((l) => l.kind === 'street').map((l) => [l.id, l.street]));
    for (const l of Object.values(u.locations)) delete l.street;
    upgradeUniverse(u);
    for (const l of Object.values(u.locations)) if (l.kind === 'street') expect(l.street, l.id).toBe(before[l.id]);
  });
});
