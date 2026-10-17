import { CAR_LIFE_MIN } from './clock';
import type { Hero, Item, ParkedVehicle, Vehicle } from './types';

/**
 * The cars themselves: what each make is, how much punishment it takes, and what happens when it has taken too much.
 * Nothing here knows about the world, so the fight board, the chase and the street can all use it. See docs/VEHICLE_COMBAT.md.
 */

/** What a car is before anyone has dented it. */
export interface Make {
  name: string;
  kind: Vehicle['kind'];
  /** Reach multiplier for driving across the city. */
  speed: number;
  /** Top speed on the fight-board scale: tiles a round. */
  pace: number;
  maxHp: number;
  /** Flat cut from gunfire. Not from rams or fire. Armor makes a car tough, and a bigger bang when it goes. */
  armor: number;
  /** Everyone aboard, counting Blackbird. */
  seats: number;
  mounted?: Vehicle['mounted'];
  /** Default 'car'. */
  body?: Body;
}

export type Body = Vehicle['body'];

/** A bike: quick, thin, one or two to a seat, nothing to hide behind. */
const b = (kind: Make['kind'], name: string, o: Partial<Make> = {}): Make =>
  m(kind, name, { body: 'bike', speed: kind === 'police' ? 1.6 : kind === 'atlas' ? 1.7 : 1.4, pace: 11, maxHp: 30, armor: 0, seats: 2, ...(kind === 'police' ? { mounted: 'ram' as const } : {}), ...o });

/** Every car and bike goes a quarter faster than it used to, to leave room for it to be dangerous to drive flat out. */
export const SPEED_BOOST = 1.25;

const m = (kind: Make['kind'], name: string, o: Partial<Make> = {}): Make => {
  const r = base(kind, name, o);
  return { ...r, pace: Math.round(r.pace * SPEED_BOOST), speed: Math.round(r.speed * SPEED_BOOST * 100) / 100 };
};

const base = (kind: Make['kind'], name: string, o: Partial<Make> = {}): Make => ({
  name,
  kind,
  speed: kind === 'police' ? 1.5 : kind === 'atlas' ? 1.3 : 1,
  pace: kind === 'police' ? 11 : kind === 'atlas' ? 10 : 8,
  maxHp: kind === 'police' ? 140 : kind === 'atlas' ? 120 : 60,
  armor: kind === 'police' ? 3 : kind === 'atlas' ? 2 : 0,
  seats: 4,
  ...(kind === 'police' ? { mounted: 'ram' as const } : {}),
  ...o,
});

/** Seats: 4 for most, 6 for larger ones, 8 for a few. */
export const MAKES: Record<Vehicle['kind'], Make[]> = {
  civilian: [
    m('civilian', 'a dented hatchback with a cracked neon underglow'),
    m('civilian', 'a rust-colored delivery van', { seats: 6, maxHp: 80, pace: 7 }),
    m('civilian', 'a hover-sedan that smells of pine and regret', { pace: 9 }),
    m('civilian', 'a three-wheeled noodle cart with an engine', { maxHp: 40, pace: 6, speed: 0.9 }),
    m('civilian', 'a salvaged taxi with the meter still running', { seats: 6, maxHp: 70 }),
    m('civilian', 'a sun-faded coupe with a dragon sticker on the bumper', { pace: 10, maxHp: 50 }),
    m('civilian', 'a church-group minibus held together with prayer and zip ties', { seats: 8, maxHp: 90, pace: 6, speed: 0.9 }),
    // (bikes come after the cars, so the cars keep their places in the list)
    b('civilian', 'a rattling delivery scooter', { pace: 9, maxHp: 20 }),
    b('civilian', 'a battered commuter bike'),
    b('civilian', 'a street-tuned crotch-rocket with a neon spoiler', { pace: 13, maxHp: 25, seats: 1 }),
    b('civilian', 'a ganger\'s chopper with a skull on the tank', { pace: 12, maxHp: 40, armor: 1 }),
  ],
  police: [
    m('police', 'an NPD patrol cruiser, lights dark'),
    m('police', 'an NPD interceptor with the engine ticking', { pace: 12 }),
    m('police', 'an unmarked NPD sedan that fools nobody', { armor: 2, maxHp: 120 }),
    m('police', 'an NPD riot van with a cage in the back', { seats: 8, armor: 5, maxHp: 200, pace: 8, speed: 1.2 }),
    b('police', 'an NPD patrol cycle', { pace: 13, maxHp: 40, armor: 1, seats: 1 }),
  ],
  atlas: [
    m('atlas', 'an Atlas security SUV, white and humming', { mounted: 'gun' }),
    m('atlas', 'an Atlas executive hover-limo with the seat still warm', { seats: 6, armor: 4, maxHp: 150 }),
    m('atlas', 'an Atlas fleet van, barcode on every panel', { seats: 8, armor: 3, maxHp: 160, pace: 8 }),
    b('atlas', 'an Atlas courier bike, white and humming', { pace: 14, maxHp: 35, armor: 1, seats: 1 }),
  ],
};

export const ALL_MAKES: Make[] = [...MAKES.civilian, ...MAKES.police, ...MAKES.atlas];

/** The makes of this kind and body. */
export const makesOf = (kind: Vehicle['kind'], body: Body): Make[] => MAKES[kind].filter((x) => (x.body ?? 'car') === body);

/** A new car off the lot (or off the kerb). */
export const vehicleOf = (mk: Make, id?: string): Vehicle => ({
  id: id ?? `make:${mk.name}`,
  body: mk.body ?? 'car',
  kind: mk.kind,
  name: mk.name,
  speed: mk.speed,
  pace: mk.pace,
  hp: mk.maxHp,
  maxHp: mk.maxHp,
  armor: mk.armor,
  seats: mk.seats,
  riders: [],
  ...(mk.mounted ? { mounted: mk.mounted } : {}),
});

/** A car from an older save (or a test) with some of this missing: fill it in from its make, or its kind. */
export function normalize(v: Vehicle): Vehicle {
  if (v.id !== undefined && v.body !== undefined && v.maxHp !== undefined && v.hp !== undefined && v.riders && v.seats !== undefined) return v;
  const mk = ALL_MAKES.find((x) => x.name === v.name) ?? m(v.kind, v.name);
  const fresh = vehicleOf(mk);
  v.id ??= fresh.id;
  v.body ??= fresh.body;
  v.pace ??= fresh.pace;
  v.maxHp ??= fresh.maxHp;
  v.hp ??= v.maxHp;
  v.armor ??= fresh.armor;
  v.seats ??= fresh.seats;
  v.riders ??= [];
  if (v.mounted === undefined && fresh.mounted) v.mounted = fresh.mounted;
  return v;
}

/** The same car, parked. */
export const parkIt = (v: Vehicle, at: string, until: number): ParkedVehicle => ({ ...v, riders: [], at, until });

export type CarState = 'sound' | 'scuffed' | 'battered' | 'smoking' | 'wrecked';

export function stateOf(v: Pick<Vehicle, 'hp' | 'maxHp'>): CarState {
  const f = v.hp / v.maxHp;
  return v.hp <= 0 ? 'wrecked' : f > 0.75 ? 'sound' : f > 0.5 ? 'scuffed' : f > 0.25 ? 'battered' : 'smoking';
}

/** How hurt it is as a share of what it was, which is also how much of its speed it keeps. */
export const condition = (v: Pick<Vehicle, 'hp' | 'maxHp'>): number => Math.max(0, v.hp / v.maxHp);
export const paceOf = (v: Vehicle): number => v.pace * (0.5 + 0.5 * condition(v));

/** What a bang does to everybody inside, flat: a level 1 Blackbird (90 hp) is dead, a level 2 (about 103) is left with a few. */
export const CAR_BLAST = 100;
/** More armor, more car to blow up: a risk for sitting in a good one. */
export const CAR_BLAST_PER_ARMOR = 25;
export const CAR_BLAST_OUTSIDE = 40;
export const CAR_BLAST_OUTSIDE_PER_ARMOR = 10;
/** A bike going up is a smaller bang: it is a tank of fuel under one person, not a box round four. */
export const BIKE_BLAST = 35;
export const BIKE_BLAST_PER_ARMOR = 10;
export const BIKE_BLAST_OUTSIDE = 15;
type Blasty = Pick<Vehicle, 'armor'> & { body?: Body };
export const blastInside = (v: Blasty): number => (v.body === 'bike' ? BIKE_BLAST + BIKE_BLAST_PER_ARMOR * v.armor : CAR_BLAST + CAR_BLAST_PER_ARMOR * v.armor);
export const blastOutside = (v: Blasty): number => (v.body === 'bike' ? BIKE_BLAST_OUTSIDE : CAR_BLAST_OUTSIDE + CAR_BLAST_OUTSIDE_PER_ARMOR * v.armor);

/** A share of gunfire that gets past the car to whoever is sitting in it. */
export const SPILL = 0.3;

export interface Hit {
  /** What the car actually took. */
  taken: number;
  from: CarState;
  to: CarState;
  wrecked: boolean;
}

/** Damage a car. Guns lose `armor` off every hit; rams, fire and falling don't. Returns what happened; telling it is up to the caller. */
export function hitCar(v: Pick<Vehicle, 'hp' | 'maxHp' | 'armor'>, dmg: number, how: 'gun' | 'ram' | 'fire' = 'gun'): Hit {
  const from = stateOf(v);
  if (v.hp <= 0) return { taken: 0, from, to: from, wrecked: false };
  const taken = Math.max(how === 'gun' ? 1 : 0, Math.round(dmg - (how === 'gun' ? v.armor : 0)));
  v.hp = Math.max(0, v.hp - taken);
  return { taken, from, to: stateOf(v), wrecked: v.hp <= 0 };
}

// ===================================================================== keys

/** The key to a car, as an item. Whoever was driving it (or was with it) carries one. */
export const carKey = (car: Pick<Vehicle, 'id' | 'name'>, gang = false): Item => ({
  id: 'car_key',
  name: `the key to ${car.name}`,
  kind: 'loot',
  power: 0,
  value: 12,
  tags: ['key'],
  carId: car.id,
  ...(gang ? { ownerGang: true } : {}),
});

/** Her key to this car, if she has one. */
export const keyTo = (h: Pick<Hero, 'inventory'>, carId: string): Item | undefined => h.inventory.find((i) => i.tags.includes('key') && i.carId === carId);

/**
 * How long a car she leaves on a street stays hers. With its key a civilian car lasts three times as long: nobody is hunting for
 * it and it is not hot. A police or Atlas car is hunted whatever she carries, and a gang's car is somebody's to take back.
 */
export function lifeOf(v: Pick<Vehicle, 'id' | 'kind'> & { body?: Body }, key: Item | undefined): number {
  const base = CAR_LIFE_MIN[v.kind] * (v.body === 'bike' ? BIKE_LIFE : 1);
  return key && v.kind === 'civilian' && !key.ownerGang ? base * KEY_LIFE : base;
}

export const KEY_LIFE = 3;
/** Bikes walk off. */
export const BIKE_LIFE = 0.75;
