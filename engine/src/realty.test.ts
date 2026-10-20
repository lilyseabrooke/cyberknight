import { describe, expect, it } from 'vitest';
import { always, scenario } from './testkit';
import { boardOf, forSale, realtyCandidates, realtyPull, buyHome } from './realty';
import { homeDeed, ownedHomes } from './deeds';
import { restCandidates, errands } from './rest';
import { beginRun, endRun, newUniverse } from './universe';
import { sleepOf, debtOf, DEBT_PIVOT } from './needs';
import { expand } from './mapgen';
import { populate } from './roster';
import type { District, Location, World } from './types';

/** Find an office by growing the map outward from the start until one turns up (or the given district's does). */
function findOffice(w: World, district?: District): Location | null {
  w.legacy.gate = 'open'; // the cordon holds the city in; lift it so the map can grow
  for (let round = 0; round < 40; round++) {
    const found = Object.values(w.locations).find((l) => l.kind === 'realty' && (!district || l.gen?.district === district));
    if (found) return found;
    const edge = Object.values(w.locations).filter((l) => l.gen && !l.gen.expanded && l.outdoors).slice(0, 12);
    if (!edge.length) return null;
    for (const l of edge) expand(w, l);
  }
  return null;
}

const world = (seed: string) => scenario({ seed }).w;

function inOffice(seed: string, district?: District) {
  const s = scenario({ seed });
  const office = findOffice(s.w, district);
  expect(office, 'an office turned up').toBeTruthy();
  s.w.hero.locationId = office!.id;
  populate(s.w, office!);
  s.w.clock = Math.floor(s.w.clock / 1440) * 1440 + 13 * 60; // in business hours
  return { s, office: office! };
}

describe('property offices', () => {
  it('turn up on the streets, with an agent and a board', () => {
    const { s, office } = inOffice('realty-1');
    expect(office.gen!.role).toBe('realty');
    expect(s.w.npcs && Object.values(s.w.npcs).some((n) => n.archetype === 'realtor' && n.locationId === office.id)).toBe(true);
    const board = boardOf(s.w, office);
    expect(board.length).toBeGreaterThanOrEqual(2);
    expect(boardOf(s.w, office)).toEqual(board); // pure
  });

  it('list what the district says: cheap pods down the hill, townhouses up the hill', () => {
    const kinds = (d: District) => {
      const w = world(`realty-d-${d}`);
      const out: string[] = [];
      for (let i = 0; i < 40; i++) {
        const office = { id: `o${i}`, gen: { district: d, depth: 1 } } as Location;
        out.push(...boardOf(w, office).map((l) => l.kind));
      }
      return out;
    };
    const share = (xs: string[], k: string) => xs.filter((x) => x === k).length / xs.length;
    const slum = kinds('slum');
    expect(share(slum, 'pod') + share(slum, 'lockup')).toBeGreaterThan(0.9);
    expect(share(slum, 'lockup')).toBeGreaterThan(0.05);
    expect(share(kinds('corporate'), 'townhouse')).toBeGreaterThan(0.6);
  });

  it('sell a home: it costs cash, goes on her deeds, and becomes a place she can walk into', () => {
    const { s, office } = inOffice('realty-2');
    const listing = forSale(s.w, office)[0]!;
    s.w.hero.cash = 0;
    expect(realtyCandidates(s.w).some((c) => c.key.startsWith('realtybuy'))).toBe(false);
    s.w.hero.cash = 100000;
    const buy = realtyCandidates(s.w).find((c) => c.key === 'realtybuy:0')!;
    expect(buy).toBeTruthy();
    s.do('realtybuy:0', always());
    expect(s.w.hero.cash).toBeLessThan(100000);
    const [deed] = ownedHomes(s.w);
    expect(deed!.id).toBe(listing.id);
    const home = s.w.locations[deed!.home]!;
    expect(home.kind).toBe('home');
    expect(homeDeed(s.w, home)).toBe(deed);
    // Someone else's board no longer lists it, and it cannot be bought twice.
    expect(forSale(s.w, office).some((l) => l.id === listing.id)).toBe(false);
  });

  it('give her a free bed at home, as good as the home is', () => {
    const { s, office } = inOffice('realty-3');
    s.w.hero.cash = 100000;
    s.do('realtybuy:0', always());
    const deed = ownedHomes(s.w)[0]!;
    s.w.hero.locationId = deed.home;
    s.w.hero.sleep = 20;
    s.w.hero.hunger = 90;
    s.w.hero.cash = 0;
    s.w.hero.sleepDebt = 6;
    expect(restCandidates(s.w).map((c) => c.key)).toContain('sleep_home');
    s.do('sleep_home', always());
    expect(s.w.hero.cash).toBe(0);
    expect(sleepOf(s.w.hero)).toBeGreaterThan(90);
    // A bed over the pivot clears debt and one under it adds some: the quality of the home is which, and how much.
    if (deed.quality > DEBT_PIVOT) expect(debtOf(s.w.hero)).toBeLessThan(6);
    else expect(debtOf(s.w.hero)).toBeGreaterThan(6);
  });

  it('are where she heads for a bed when she is broke', () => {
    const { s, office } = inOffice('realty-4');
    s.w.hero.cash = 100000;
    s.do('realtybuy:0', always());
    const deed = ownedHomes(s.w)[0]!;
    s.w.hero.locationId = office.id;
    s.w.hero.cash = 0;
    s.w.hero.sleep = 10;
    expect(errands(s.w).bed?.loc).toBe(deed.home);
  });

  it('carry over between deaths, and can be as many as she can pay for', () => {
    const { s, office } = inOffice('realty-5');
    const { w } = s;
    w.hero.cash = 1e6;
    const agent = Object.values(w.npcs).find((n) => n.archetype === 'realtor' && n.locationId === office.id)!;
    for (const l of forSale(w, office)) s.run((c) => buyHome(c, office, agent, l));
    const n = ownedHomes(w).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(new Set(ownedHomes(w).map((d) => d.home)).size).toBe(n);
    w.over = true;
    w.ending = 'dead';
    const u = endRun(w);
    const w2 = beginRun(u);
    expect(ownedHomes(w2)).toHaveLength(n);
    for (const d of ownedHomes(w2)) expect(w2.locations[d.home]).toBeDefined();
  });

  it('pull her toward an office when she has the money for something in it', () => {
    const { s, office } = inOffice('realty-6');
    const street = s.w.locations[office.gen!.parent]!;
    s.w.hero.locationId = street.id;
    s.w.hero.cash = 0;
    expect(realtyPull(s.w, office.id).bonus).toBe(0);
    s.w.hero.cash = 100000;
    expect(realtyPull(s.w, office.id).bonus).toBeGreaterThan(0);
  });
});
