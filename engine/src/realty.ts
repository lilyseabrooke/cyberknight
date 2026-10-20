import type { Candidate } from './candidate';
import { rollListings, HOMES, type Listing } from './content/realty';
import { Rng } from './rng';
import { addHome, streetOf } from './mapgen';
import { here } from './combat';
import { isClosed } from './hours';
import { price as haggle } from './supply';
import { deedsOf, isSold } from './deeds';
import type { Ctx, Location, Npc, World } from './types';

/**
 * Property offices. A lot on a street, with an agent behind the desk and a board of homes for sale: the district decides what
 * is on it (pod apartments in megablock towers where the rent is low, townhouses in gated districts where it is not) and what
 * the district charges. She can browse the board, and she can buy: the home is made on the street the office stands on, the deed
 * goes in `legacy.deeds`, and it is hers through every death. Every office has its own board, so exploring is how you find homes.
 */

export const isOffice = (l: Location | undefined): l is Location => l?.kind === 'realty' && !!l.gen;

/** The board: everything the office lists, sold or not. Pure in the office and the world. */
export function boardOf(w: World, office: Location): Listing[] {
  const g = office.gen;
  if (!g) return [];
  return rollListings(new Rng(`realty:${w.worldSeed}:${office.id}`), office.id, g.district, g.depth);
}

/** What is still for sale. */
export const forSale = (w: World, office: Location): Listing[] => boardOf(w, office).filter((l) => !isSold(w, l.id));

/** What the agent wants for it from her. */
export const askingPrice = (w: World, l: Listing): number => haggle(w.hero, l.price);

const agentOf = (w: World, office: Location): Npc | undefined =>
  here(w).find((n) => n.archetype === 'realtor' && n.alive && !n.hostile && n.downUntil <= w.clock && n.locationId === office.id);

const blurbFor = (l: Listing, rng: Rng): string => rng.pick(HOMES[l.kind].blurbs).replace('{name}', l.name.charAt(0).toUpperCase() + l.name.slice(1));

/** Buy one. The home is made on the office's street. */
export function buyHome(c: Ctx, office: Location, agent: Npc, l: Listing): void {
  const { w } = c;
  const h = w.hero;
  const cost = askingPrice(w, l);
  if (isSold(w, l.id) || h.cash < cost) return;
  const t = HOMES[l.kind];
  const street = w.locations[streetOf(w, office)]!;
  const label = `her ${t.noun} (${l.name})`;
  const home = addHome(w, street, l.id, {
    name: `her ${t.noun}, ${l.name}`, label, security: l.security, cameras: t.cameras, blurb: blurbFor(l, new Rng(`homeblurb:${w.worldSeed}:${l.id}`)),
  });
  h.cash -= cost;
  agent.cash += cost;
  w.legacy.deeds = [...deedsOf(w), { id: l.id, kind: l.kind, name: home.name, home: home.id, quality: l.quality, price: cost, district: office.gen!.district, run: w.legacy.runs }];
  c.emit('realty_buy', 'good', { variant: l.kind, place: office.name, npc: agent.name, role: agent.role, home: home.name, building: l.building, price: cost, quality: Math.round(l.quality * 100), district: office.gen!.district, owned: deedsOf(w).length });
}

function look(c: Ctx, office: Location, agent: Npc): void {
  const rows = forSale(c.w, office);
  const cheapest = rows.reduce((a, l) => Math.min(a, askingPrice(c.w, l)), Infinity);
  const dearest = rows.reduce((a, l) => Math.max(a, askingPrice(c.w, l)), 0);
  c.emit('realty_view', 'mixed', { place: office.name, npc: agent.name, role: agent.role, count: rows.length, pods: rows.filter((l) => l.kind === 'pod').length, townhouses: rows.filter((l) => l.kind === 'townhouse').length, lockups: rows.filter((l) => l.kind === 'lockup').length, cheapest, dearest, district: office.gen!.district });
}

/** What she can do in a property office: have a look at the board, and buy something off it. */
export function realtyCandidates(w: World): Candidate[] {
  const office = w.locations[w.hero.locationId];
  if (!isOffice(office) || isClosed(w, office.id)) return [];
  const agent = agentOf(w, office);
  if (!agent) return [];
  const h = w.hero;
  const owned = deedsOf(w).length;
  const rows = forSale(w, office);
  if (!rows.length) return [];
  const out: Candidate[] = [{ key: 'realtyview:board', drives: { curiosity: 0.3 }, bonus: -0.3, run: (c) => look(c, office, agent) }];
  rows.forEach((l, i) => {
    const cost = askingPrice(w, l);
    // Money in the pocket dies with her; a deed doesn't. Someone with a roof already wants a second one less.
    if (h.cash < cost) return;
    out.push({
      key: `realtybuy:${i}`, drives: { greed: 0.3, pride: 0.4 },
      bonus: 0.9 + (l.quality - 0.72) * 2.5 - 0.5 * Math.min(owned, 3) - (0.6 * cost) / Math.max(cost, h.cash), smart: 0.6,
      run: (c) => buyHome(c, office, agent, l),
    });
  });
  return out;
}

/** The pull of the next room, when it is a property office with something she could buy and the money to buy it. */
export function realtyPull(w: World, dest: string): { bonus: number; smart: number } {
  const none = { bonus: 0, smart: 0 };
  const office = w.locations[dest];
  if (!isOffice(office) || dest === w.hero.locationId || isClosed(w, dest)) return none;
  const cheapest = forSale(w, office).reduce((a, l) => Math.min(a, askingPrice(w, l)), Infinity);
  if (w.hero.cash < cheapest) return none;
  return { bonus: Math.max(0.1, 0.8 - 0.25 * deedsOf(w).length), smart: 0.5 };
}
