import { Rng } from './rng';
import type { Location } from './types';
import { Draft, pt } from './layoutkit';
import { streetLayout } from './streets';
import type { Layout } from './layout';
import type { Pos } from './grid';

/**
 * A made layout for each sort of place, in the way `clubLayout` is one for a club: the counter where the shopkeeper stands, the
 * shelving that hides you, the beds, the racks, the server stacks. Each builder draws on a `Draft` (see layoutkit.ts) and
 * says where the staff stand (`behindBar`: the staff side of the counter, `deck`: a post of their own), where the customers wait
 * (`stools`, `seats`), where the room is open (`floor`) and which way each looks.
 *
 * A room that has none here (a lair's cavern, a pit) is an ordinary room (see `plainLayout` in layout.ts).
 */

const row = (x0: number, x1: number, y: number): Pos[] => {
  const out: Pos[] = [];
  for (let x = x0; x <= x1; x++) out.push(pt(x, y));
  return out;
};
const col = (x: number, y0: number, y1: number): Pos[] => {
  const out: Pos[] = [];
  for (let y = y0; y <= y1; y++) out.push(pt(x, y));
  return out;
};

/** A bar: the counter down the west side with the stools in front and the bartender behind, tables, a pool table and a jukebox. */
function barRoom(loc: Location, rng: Rng): Layout {
  const W = rng.int(10, 12);
  const H = rng.int(8, 9);
  const d = new Draft(W, H, rng);
  d.bar = 'west';
  const rows = col(2, 2, H - 4);
  const stools = col(3, 2, H - 4);
  const behind = col(1, 2, H - 4);
  d.fixture('bar', 'bar', 'the bar', rows, { use: stools });
  d.fixture('shelf', 'bottles', 'the back bar', col(0, 2, H - 4), { decor: true });
  d.zone('behindBar', behind);
  d.zone('stools', stools);
  d.faces.behindBar = 2;
  d.faces.stools = 6;
  const tables: Pos[] = [];
  const seats: Pos[] = [];
  for (const [i, p] of [pt(W - 4, 2), pt(W - 4, H - 4), pt(W - 6, 4)].entries()) {
    d.fixture('table', `table${i}`, 'a table', [p], { decor: true });
    tables.push(p);
    seats.push(pt(p.x - 1, p.y), pt(p.x + 1, p.y));
  }
  d.zone('seats', seats);
  d.faces.seats = 6;
  d.fixture('table', 'pool', 'the pool table', [pt(d.cx + 1, 3), pt(d.cx + 2, 3)], { decor: true });
  d.fixture('machine', 'jukebox', 'the jukebox', [pt(W - 1, d.cy)], { large: true });
  d.lit(stools.concat(behind), 2);
  d.lit(seats, 0);
  return d.finish(loc, 'bar', { front: pt(d.cx, H - 1), slots: [pt(W - 1, 1), pt(W - 1, H - 2), pt(0, 0), pt(0, H - 1), pt(d.cx, 0)], base: 1 });
}

/** A shop, or a pawn shop (which adds a cage and a safe): shelving in aisles, a counter by the door with the keeper behind it. */
function shopRoom(loc: Location, rng: Rng, pawn: boolean): Layout {
  const W = rng.int(9, 11);
  const H = pawn ? rng.int(8, 9) : rng.int(7, 8);
  const d = new Draft(W, H, rng);
  const counter = row(W - 4, W - 1, H - 3);
  const pocket = row(W - 4, W - 1, H - 2).concat(row(W - 4, W - 1, H - 1));
  d.fixture('counter', 'counter', pawn ? 'the pawn counter' : 'the counter', counter, { use: row(W - 4, W - 2, H - 4) });
  d.zone('behindBar', pocket);
  d.zone('stools', row(W - 4, W - 2, H - 4));
  d.faces.behindBar = 0;
  d.faces.stools = 4;
  const aisles = [2, 5, 8].filter((x) => x <= W - 3);
  for (const [i, x] of aisles.entries()) d.fixture('shelf', `shelves${i}`, pawn ? 'a rack of tagged goods' : 'a shelf unit', col(x, 1, H - 5), { large: true });
  d.fixture('shelf', 'wall_stock', 'the wall stock', row(1, W - 2, 0), { decor: true });
  if (pawn) {
    // A cage over the counter, a locked back room with the safe in it, and glass cases on the floor.
    d.wall(pt(W - 4, 0), pt(W - 4, 3), [pt(W - 4, 2)]);
    d.wall(pt(W - 4, 3), pt(W - 1, 3));
    d.rect(W - 3, 0, W - 1, 2, 'floor');
    d.fixture('safe', 'safe', 'the safe', [pt(W - 1, 0)], { large: true });
    d.fixture('table', 'cases', 'a glass case', [pt(3, H - 3), pt(4, H - 3)], { decor: true });
    d.zone('deck', [pt(W - 2, 1), pt(W - 3, 1)]);
    d.faces.deck = 6;
  }
  d.lit(counter.concat(pocket), 2);
  const darkCorner = rng.chance(0.5) ? pt(1, 1) : pt(1, 2);
  d.lit([darkCorner], 0);
  return d.finish(loc, pawn ? 'pawn' : 'shop', { front: pt(1, H - 1), slots: [pt(0, H - 3), pt(W - 6, 0)], base: 2 });
}

/** A clinic: exam rooms off the back, a reception desk, a waiting area with benches. */
function clinicRoom(loc: Location, rng: Rng): Layout {
  const W = rng.int(9, 11);
  const H = 9;
  const d = new Draft(W, H, rng);
  const mid = d.cx;
  const gaps = [pt(Math.floor(mid / 2), 4), pt(mid + 1 + Math.floor((W - mid - 1) / 2), 4)];
  d.wall(pt(0, 4), pt(W - 1, 4), gaps);
  d.wall(pt(mid, 0), pt(mid, 3));
  const exam = (x0: number, x1: number, i: number) => {
    d.fixture('bed', `bed${i}`, 'an exam bed', [pt(x0 + 1, 1), pt(x0 + 2, 1)], { decor: true });
    d.fixture('shelf', `cabinet${i}`, 'a medicine cabinet', [pt(x1 - 1, 0)], { large: true });
  };
  exam(0, mid - 1, 0);
  exam(mid + 1, W - 1, 1);
  const desk = row(0, 3, 6);
  const behind = row(0, 3, 5);
  d.fixture('counter', 'desk', 'the reception desk', desk, { use: row(0, 3, 7) });
  d.zone('behindBar', behind);
  d.zone('stools', row(0, 3, 7));
  d.faces.behindBar = 4;
  d.faces.stools = 0;
  const benches = col(W - 1, 6, H - 3);
  d.fixture('bench', 'benches', 'the waiting benches', benches, { decor: true });
  d.zone('seats', col(W - 2, 6, H - 3));
  d.faces.seats = 6;
  const rooms: Pos[] = [];
  for (let y = 0; y <= 3; y++) for (let x = 0; x < W; x++) if (x !== mid) rooms.push(pt(x, y));
  d.zone('deck', rooms);
  d.faces.deck = 4;
  d.lit(rooms, 2);
  d.lit(col(W - 2, 6, H - 3), 1);
  return d.finish(loc, 'clinic', { front: pt(d.cx, H - 1), slots: [pt(W - 1, 5)], base: 2 });
}

/** A gym: a desk by the door, a rack of weights along the back, lockers down one wall and a sparring ring in the middle. */
function gymRoom(loc: Location, rng: Rng): Layout {
  const W = rng.int(11, 12);
  const H = rng.int(8, 9);
  const d = new Draft(W, H, rng);
  const desk = row(3, 5, H - 3);
  const behind = row(3, 5, H - 2).concat(row(3, 5, H - 1));
  d.fixture('counter', 'desk', 'the front desk', desk, { use: row(3, 5, H - 4) });
  d.zone('behindBar', behind);
  d.zone('stools', row(3, 5, H - 4));
  d.faces.behindBar = 0;
  d.faces.stools = 4;
  for (let x = 2, i = 0; x <= W - 4; x += 4, i++) d.fixture('rack', `rack${i}`, 'a weights rack', [pt(x, 1), pt(x + 1, 1)], { large: true });
  d.fixture('bench', 'benches', 'the benches', row(2, 3, 3), { decor: true });
  d.fixture('locker', 'lockers', 'the lockers', col(0, 2, 5), { large: true });
  const rx = W - 6;
  const ringTiles = row(rx, rx + 3, 3).concat(row(rx, rx + 3, 6), col(rx, 4, 5), col(rx + 3, 4, 5));
  d.fixture('ring', 'ring', 'the ring', ringTiles.filter((p) => !(p.x === rx && p.y === 5)), { decor: true, use: [pt(rx + 1, 4), pt(rx + 2, 5)] });
  const inside = [pt(rx + 1, 4), pt(rx + 2, 4), pt(rx + 1, 5), pt(rx + 2, 5)];
  d.zone('stage', inside);
  d.faces.stage = 2;
  d.zone('seats', row(2, 3, 4));
  d.lit(inside, 2);
  d.lit(behind.concat(row(3, 5, H - 4)), 2);
  return d.finish(loc, 'gym', { front: pt(1, H - 1), slots: [pt(W - 1, 1), pt(W - 1, H - 2)], base: 2 });
}

/** A gym's other rooms. */
function gymSideRoom(loc: Location, rng: Rng, room: string): Layout | null {
  if (room === 'pit') {
    const W = 11;
    const H = 9;
    const d = new Draft(W, H, rng);
    const ring = row(3, 7, 2).concat(row(3, 7, 6), col(3, 3, 5), col(7, 3, 5));
    d.fixture('ring', 'cage', 'the cage', ring.filter((p) => !(p.x === 5 && p.y === 6)), { decor: true, use: [pt(5, 7)] });
    const inside = [pt(4, 3), pt(5, 3), pt(6, 3), pt(4, 4), pt(5, 4), pt(6, 4), pt(4, 5), pt(5, 5), pt(6, 5)];
    d.zone('stage', inside);
    d.faces.stage = 4;
    d.fixture('bench', 'stands', 'the stands', col(0, 1, H - 2).concat(col(W - 1, 1, H - 2)), { decor: true });
    d.zone('seats', col(1, 1, H - 2).concat(col(W - 2, 1, H - 2)));
    d.faces.seats = 2;
    d.lit(inside, 2);
    d.lit(col(1, 1, H - 2).concat(col(W - 2, 1, H - 2)), 0);
    return d.finish(loc, 'pit', { front: pt(5, H - 1), slots: [pt(0, 0), pt(W - 1, 0)], base: 1 });
  }
  if (room === 'locker') {
    const W = 9;
    const H = 7;
    const d = new Draft(W, H, rng);
    for (const x of [1, 4, 7].filter((v) => v < W - 1)) d.fixture('locker', `lockers${x}`, 'a bank of lockers', col(x, 1, 3), { large: true });
    d.fixture('bench', 'bench', 'the bench', row(2, 6, 5), { decor: true });
    d.lit(row(0, W - 1, 0), 2);
    return d.finish(loc, 'locker', { front: pt(d.cx, H - 1), slots: [pt(0, H - 2)], base: 1 });
  }
  if (room === 'office') {
    const W = 7;
    const H = 6;
    const d = new Draft(W, H, rng);
    d.fixture('desk', 'desk', 'the desk', row(2, 4, 1), { decor: true });
    d.zone('deck', row(2, 4, 0));
    d.faces.deck = 4;
    d.fixture('safe', 'safe', 'the safe', [pt(W - 1, 0)], { large: true });
    d.fixture('shelf', 'files', 'the filing cabinets', col(0, 1, 3), { large: true });
    return d.finish(loc, 'office', { front: pt(d.cx, H - 1), slots: [], base: 2 });
  }
  return null;
}

/** A flat: a bedroom walled off at the back, a sofa and a table, a kitchenette along one wall. */
function homeRoom(loc: Location, rng: Rng): Layout {
  const W = rng.int(7, 8);
  const H = rng.int(6, 7);
  const d = new Draft(W, H, rng);
  d.wall(pt(3, 0), pt(3, 2));
  d.wall(pt(0, 3), pt(3, 3), [pt(2, 3)]);
  d.fixture('bed', 'bed', 'the bed', [pt(1, 0), pt(1, 1)], { decor: true });
  d.fixture('locker', 'wardrobe', 'the wardrobe', [pt(0, 1), pt(0, 2)], { large: true });
  d.fixture('counter', 'kitchen', 'the kitchenette', col(W - 1, 1, 3), { use: col(W - 2, 1, 3) });
  d.fixture('machine', 'fridge', 'the fridge', [pt(W - 1, 0)], { large: true });
  d.fixture('sofa', 'sofa', 'the sofa', [pt(4, H - 3), pt(5, H - 3)], { decor: true });
  d.fixture('table', 'table', 'a low table', [pt(W - 3, 2)], { decor: true });
  d.zone('seats', [pt(4, H - 4), pt(5, H - 4)]);
  d.faces.seats = 4;
  d.lit(row(0, 2, 0).concat(row(0, 2, 1), row(0, 2, 2)), 0);
  return d.finish(loc, 'home', { front: pt(d.cx, H - 1), slots: [], base: 1 });
}

/** An office floor: a lobby with reception and a guard, desks in rows, a server room walled off in the back corner. */
function corpRoom(loc: Location, rng: Rng): Layout {
  const W = rng.int(11, 12);
  const H = rng.int(9, 10);
  const d = new Draft(W, H, rng);
  const desk = row(2, 6, H - 4);
  const behind = row(2, 6, H - 5);
  d.fixture('counter', 'reception', 'the reception desk', desk, { use: row(2, 6, H - 3) });
  d.zone('behindBar', behind);
  d.zone('stools', row(2, 6, H - 3));
  d.faces.behindBar = 4;
  d.faces.stools = 0;
  d.wall(pt(W - 4, 0), pt(W - 4, 3), [pt(W - 4, 2)]);
  d.wall(pt(W - 4, 3), pt(W - 1, 3));
  d.rect(W - 3, 0, W - 1, 2, 'floor');
  for (const x of [W - 3, W - 1]) d.fixture('server', `rack${x}`, 'a server rack', col(x, 0, 1), { large: true });
  d.zone('deck', [pt(W - 2, 1), pt(W - 2, 2)]);
  d.faces.deck = 4;
  for (const [i, p] of [pt(1, 1), pt(4, 1), pt(1, 4), pt(4, 4)].entries()) d.fixture('desk', `desk${i}`, 'a workstation', [p, pt(p.x + 1, p.y)], { decor: true });
  d.fixture('shelf', 'plants', 'a row of planters', col(W - 1, 5, 7), { decor: true });
  d.lit(behind.concat(row(2, 6, H - 3)), 2);
  d.lit(col(W - 2, 0, 2), 0);
  return d.finish(loc, 'corp', { front: pt(W - 3, H - 1), slots: [pt(0, H - 2), pt(0, 1)], base: 2 });
}

/** A dungeon room is furnished by what it is: so many of these, so many of those, spread about with room to walk round. */
const FURNISHING: Record<string, { w: [number, number]; h: [number, number]; base: 0 | 1 | 2; items: [string, string, string, number, number, number, boolean, boolean?][] }> = {
  // [kind, id, label, w, h, count, large, along]
  gate: { w: [9, 10], h: [7, 7], base: 2, items: [['counter', 'booth', 'the guard booth', 2, 2, 1, true], ['desk', 'barrier', 'a barrier', 3, 1, 1, false], ['crate', 'crates', 'a stack of crates', 1, 1, 3, false]] },
  barracks: { w: [10, 11], h: [8, 8], base: 1, items: [['bunk', 'bunks', 'a bunk', 2, 1, 5, false], ['locker', 'lockers', 'a locker bank', 1, 3, 2, true, true], ['table', 'table', 'a mess table', 2, 1, 1, false]] },
  garage: { w: [11, 12], h: [8, 8], base: 1, items: [['vehicle', 'cars', 'a parked vehicle', 3, 2, 2, true], ['rack', 'tools', 'a tool rack', 2, 1, 2, true, true], ['crate', 'drums', 'a drum of fuel', 1, 1, 3, false]] },
  armory: { w: [8, 9], h: [7, 7], base: 2, items: [['rack', 'racks', 'a weapon rack', 1, 3, 3, true, true], ['crate', 'crates', 'an ammo crate', 1, 1, 3, false], ['table', 'bench', 'a workbench', 2, 1, 1, false]] },
  core: { w: [10, 11], h: [8, 8], base: 1, items: [['server', 'stacks', 'a server stack', 1, 3, 4, true], ['console', 'console', 'a maintenance console', 2, 1, 1, false]] },
  command: { w: [10, 11], h: [8, 8], base: 2, items: [['console', 'consoles', 'a console bank', 3, 1, 2, false, true], ['table', 'table', 'the map table', 3, 2, 1, false], ['screen', 'screens', 'a wall of screens', 3, 1, 1, false, true]] },
  door: { w: [8, 8], h: [6, 6], base: 2, items: [['crate', 'crates', 'a stack of crates', 1, 1, 2, false], ['table', 'bench', 'a bench', 2, 1, 1, false]] },
  hangout: { w: [10, 11], h: [8, 8], base: 1, items: [['sofa', 'sofas', 'a couch', 2, 1, 3, false], ['table', 'table', 'a table', 2, 1, 1, false], ['machine', 'cabinet', 'an arcade cabinet', 1, 1, 1, true, true]] },
  bunks: { w: [9, 10], h: [7, 7], base: 0, items: [['bunk', 'bunks', 'a bunk', 2, 1, 5, false], ['locker', 'footlockers', 'a footlocker', 1, 1, 3, false, true]] },
  workshop: { w: [10, 11], h: [8, 8], base: 1, items: [['vehicle', 'chassis', 'a stripped chassis', 3, 2, 1, true], ['rack', 'benches', 'a tool wall', 3, 1, 2, true, true], ['crate', 'parts', 'a crate of parts', 1, 1, 3, false]] },
  stash: { w: [7, 8], h: [6, 6], base: 0, items: [['crate', 'stacks', 'a stack of crates', 1, 2, 4, true], ['safe', 'safe', 'a safe', 1, 1, 1, true, true]] },
  den: { w: [9, 10], h: [7, 7], base: 2, items: [['desk', 'desk', 'a heavy desk', 3, 1, 1, false], ['sofa', 'sofa', 'a couch', 2, 1, 1, false], ['locker', 'trophies', 'a trophy case', 1, 2, 1, true, true]] },
  backroom: { w: [7, 8], h: [6, 6], base: 0, items: [['crate', 'kegs', 'a keg', 1, 1, 4, true], ['table', 'table', 'a card table', 2, 1, 1, false]] },
  cellar: { w: [10, 12], h: [5, 5], base: 0, items: [['crate', 'barrels', 'a barrel', 1, 1, 4, true], ['rack', 'racks', 'a wine rack', 2, 1, 1, true, true]] },
  vip: { w: [8, 9], h: [7, 7], base: 0, items: [['sofa', 'sofas', 'a lounge sofa', 3, 1, 3, false], ['table', 'table', 'a glass table', 1, 1, 2, false], ['counter', 'minibar', 'the minibar', 3, 1, 1, false, true]] },
};

function furnished(loc: Location, rng: Rng, role: string): Layout | null {
  const f = FURNISHING[role];
  if (!f) return null;
  const W = rng.int(...f.w);
  const H = rng.int(...f.h);
  const d = new Draft(W, H, rng);
  for (const [kind, id, label, fw, fh, n, large, along] of f.items) d.scatter(kind as never, id, label, fw, fh, n, { large, along: !!along });
  return d.finish(loc, role, { front: pt(d.cx, H - 1), slots: [pt(0, 0), pt(W - 1, 0), pt(d.cx, 0), pt(W - 1, H - 1), pt(0, H - 1)], base: f.base });
}

/** A boss's hall: the desk on a dais at the back, a ring of pillars, a long carpet down the middle. */
function bossRoom(loc: Location, rng: Rng): Layout {
  const W = rng.int(11, 12);
  const H = rng.int(9, 10);
  const d = new Draft(W, H, rng);
  d.fixture('desk', 'desk', 'the boss\'s desk', row(d.cx - 2, d.cx + 2, 2), { decor: true, use: row(d.cx - 2, d.cx + 2, 3) });
  d.zone('deck', row(d.cx - 2, d.cx + 2, 1));
  d.faces.deck = 4;
  for (const [i, p] of [pt(3, 4), pt(W - 4, 4), pt(3, H - 4), pt(W - 4, H - 4)].entries()) d.fixture('pillar', `pillar${i}`, 'a pillar', [p], { large: true });
  d.fixture('shelf', 'wall_screens', 'a wall of monitors', row(1, W - 2, 0), { decor: true });
  d.lit(row(d.cx - 2, d.cx + 2, 1).concat(row(d.cx - 2, d.cx + 2, 3)), 2);
  return d.finish(loc, 'boss', { front: pt(d.cx, H - 1), slots: [pt(0, d.cy), pt(W - 1, d.cy)], base: 1 });
}

/** A maintenance tunnel: a long thin run with pipes overhead, junction boxes to hide behind and a dark middle. */
function tunnelRoom(loc: Location, rng: Rng): Layout {
  const W = rng.int(11, 13);
  const H = 5;
  const d = new Draft(W, H, rng);
  d.fixture('pipe', 'pipes', 'the overhead pipes', row(1, W - 2, 0), { decor: true });
  d.scatter('machine', 'boxes', 'a junction box', 1, 2, 2, { large: true });
  d.scatter('crate', 'junk', 'a heap of junk', 1, 1, 2, { decor: true });
  d.lit(row(0, W - 1, 2).filter((p) => p.x % 4 === 0), 2);
  return d.finish(loc, 'tunnel', { front: pt(0, d.cy), slots: [pt(W - 1, d.cy)], base: 0, flip: false });
}

/** A made layout for this place, or null if it takes an ordinary room. */
export function madeLayout(loc: Location, role: string, seed: string, world?: { locations: Record<string, Location> }): Layout | null {
  if (loc.kind === 'street') return world ? streetLayout(world, loc, seed) : null;
  const rng = new Rng(`made:${seed}:${loc.id}`);
  if (loc.dungeon) return furnished(loc, rng, role);
  if (loc.gymRoom) return gymSideRoom(loc, rng, loc.gymRoom.room) ?? null;
  if (loc.pawnRoom) return furnished(loc, rng, 'stash');
  const sub = furnished(loc, rng, loc.gen?.role ?? '');
  if (sub) return sub;
  switch (loc.kind) {
    case 'bar': return barRoom(loc, rng);
    case 'shop': return shopRoom(loc, rng, false);
    case 'pawn': return shopRoom(loc, rng, true);
    case 'chop': return shopRoom(loc, rng, false);
    case 'hub': return shopRoom(loc, rng, false);
    case 'realty': return shopRoom(loc, rng, false);
    case 'clinic': return clinicRoom(loc, rng);
    case 'gym': return gymRoom(loc, rng);
    case 'home': return homeRoom(loc, rng);
    case 'corp': return corpRoom(loc, rng);
    case 'boss': return bossRoom(loc, rng);
    case 'tunnel': return tunnelRoom(loc, rng);
    default: return null;
  }
}
