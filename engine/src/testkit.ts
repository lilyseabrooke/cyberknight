import { expect, it } from 'vitest';
import { Rng } from './rng';
import { makeCtx, perform, runToEnd, step } from './run';
import { gather } from './interactions';
import { camerasSeeHer, placeOf, syncPlace } from './placeboard';
import { passable } from './grid';
import { createWorld, type RunOptions } from './world';
import type { Ctx, GameEvent, Id, World } from './types';
import type { Personality } from './personality';

/**
 * How to test that something happens.
 *
 * 1. Default: build the situation directly with `scenario()` and make the thing happen. It takes milliseconds, it
 *    fails for a reason, and it tests exactly one thing. Put the hero where the event lives, give her what it needs, and
 *    rig the dice (`always` / `never` / `rolls(...)`) to walk each branch.
 * 2. Only when the claim is about the whole simulation ("this turns up in real nights", "heroes with X do better than
 *    Y", "nothing ever leaves an invalid state") play whole nights, with `search()` or a loop of `runToEnd`, and mark the
 *    test `slow`.
 */

/**
 * Monte Carlo tests: each plays dozens to hundreds of whole games, which is ~97% of the suite's run time. Plain
 * `npm test` skips them; `npm run test:full` (vitest --mode full) runs everything, as should CI and anything that
 * touches the sim's balance.
 */
export const slow = import.meta.env.MODE === 'full' ? it : it.skip;

// ------------------------------------------------------------------------------------------------ rigged dice

/** An Rng that replays a fixed script of rolls in [0,1), repeating the last. 0 passes every `chance`, 0.999 fails them. */
export class RiggedRng extends Rng {
  private i = 0;
  constructor(private readonly script: readonly number[]) {
    super(0);
  }
  override next(): number {
    return this.script[Math.min(this.i++, this.script.length - 1)]!;
  }
}

/** Every `rng.chance(p)` succeeds (p > 0), `int` gives its minimum, `pick` the first item. */
export const always = (): Rng => new RiggedRng([0]);
/** Every `rng.chance(p)` fails (p < 1), `int` gives its maximum, `pick` the last item. */
export const never = (): Rng => new RiggedRng([0.999999]);
/** Exact rolls, in the order the code asks for them; the last one repeats. */
export const rolls = (...values: number[]): Rng => new RiggedRng(values);

// ------------------------------------------------------------------------------------------------ scenarios

export type ScenarioOptions = {
  seed?: string;
  /** Where Blackbird is. Default: wherever she starts. */
  at?: Id;
  competence?: number;
  personality?: Personality;
  /** Strip her starting kit, so a test gives her only what it needs. */
  bare?: boolean;
  /** Anything else: place NPCs, set cash and heat, hand her items. Runs once the world is built and she is in place. */
  setup?: (w: World) => void;
};

export type Scenario = {
  w: World;
  /** Everything emitted so far, by `run`/`do`. `step` returns its own events and adds them here too. */
  events: GameEvent[];
  /** A context over this world; `rng` defaults to a fresh seeded stream. */
  ctx(rng?: Rng): Ctx;
  /** Run any engine function against the world. Returns the events it emitted. */
  run(fn: (c: Ctx) => void, rng?: Rng): GameEvent[];
  /** Run the candidate action with this key (as `gather` offers it) and return its events. Fails if it isn't on offer. */
  do(key: string, rng?: Rng): GameEvent[];
  /** The keys of everything on offer right now. */
  offers(): string[];
  /** Advance the real loop by n beats (or until the night ends). */
  step(n?: number): GameEvent[];
  /** Has this event turned up so far? `variant` is optional. */
  saw(type: string, variant?: string): boolean;
};

export function scenario(opts: ScenarioOptions = {}): Scenario {
  const w = createWorld({ seed: opts.seed ?? 'scn', competence: opts.competence ?? 0.5, personality: opts.personality });
  if (opts.at) w.hero.locationId = opts.at;
  if (opts.bare) w.hero.inventory = [];
  opts.setup?.(w);
  const events: GameEvent[] = [];
  let n = 0;
  const ctx = (rng: Rng = new Rng(`${w.seed ?? 'scn'}:${n++}`)): Ctx => makeCtx(w, rng, events);
  const mark = () => events.length;
  const s: Scenario = {
    w,
    events,
    ctx,
    run(fn, rng) {
      const from = mark();
      fn(ctx(rng));
      return events.slice(from);
    },
    do(key, rng) {
      const cand = gather(w).find((x) => x.key === key);
      expect(cand, `"${key}" is not on offer here; on offer: ${s.offers().join(', ')}`).toBeDefined();
      return s.run((c) => perform(c, cand!), rng);
    },
    offers: () => gather(w).map((x) => x.key),
    step(beats = 1) {
      const out: GameEvent[] = [];
      for (let i = 0; i < beats && !w.over; i++) out.push(...step(w));
      events.push(...out);
      return out;
    },
    saw: (type, variant) => events.some((e) => e.type === type && (variant === undefined || e.data.variant === variant)),
  };
  return s;
}

// ------------------------------------------------------------------------------------------------ the general search

/** `type` or `type:variant`, the way tests name events. */
export const eventKey = (e: GameEvent): string => e.type + (e.data.variant ? ':' + e.data.variant : '');

export type SearchOptions = {
  /** Event keys (`type` or `type:variant`) that must all turn up. */
  want: readonly string[];
  /** Seeds are `${prefix}-${i}`. */
  prefix: string;
  /** Give up after this many nights. */
  max: number;
  competence?: number | ((i: number) => number);
  personality?: (i: number) => Personality | undefined;
  /** Match on `type` alone too, so `want: ['vandal']` is satisfied by any variant. */
  anyVariant?: boolean;
};

/**
 * The general search loop: play whole nights until every wanted event has turned up (or `max`). Returns what's still
 * missing, so `expect(r.missing).toEqual([])` names exactly what never came. Slow; reach for `scenario()` first.
 */
export function search(o: SearchOptions): { seen: Set<string>; missing: string[]; nights: number; worlds: World[] } {
  const seen = new Set<string>();
  const worlds: World[] = [];
  const missing = () => o.want.filter((k) => !seen.has(k));
  let i = 0;
  for (; i < o.max && missing().length; i++) {
    const competence = typeof o.competence === 'function' ? o.competence(i) : (o.competence ?? 0.3);
    const { events, world } = runToEnd({ seed: `${o.prefix}-${i}`, competence, personality: o.personality?.(i) });
    worlds.push(world);
    for (const e of events) {
      seen.add(eventKey(e));
      if (o.anyVariant) seen.add(e.type);
    }
  }
  return { seen, missing: missing(), nights: i, worlds };
}

// ------------------------------------------------------------------------------------------------ where people stand

/** Put her where a working camera has her, if there is one. (A camera only sees the stretch it is turned on, and where she starts on a long street may not be it.) */
export function inCameraView(w: World): void {
  const p = placeOf(w);
  if (!p) return;
  syncPlace(w, p);
  const g = p.layout.grid;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!passable(g, x, y)) continue;
      p.board.hero = { x, y };
      if (camerasSeeHer(w)) return;
    }
  }
}

/** Stand somebody right beside her, in the open, so there is no question of whether they can see. */
export function besideHer(w: World, id: Id): void {
  const p = placeOf(w);
  if (!p) return;
  syncPlace(w, p);
  const e = p.board.ents[id];
  if (!e) return;
  const h = p.board.hero;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as const) {
    const q = { x: h.x + dx, y: h.y + dy };
    if (passable(p.layout.grid, q.x, q.y) && !Object.values(p.board.ents).some((o) => o !== e && o.x === q.x && o.y === q.y)) {
      e.x = q.x;
      e.y = q.y;
      e.facing = (dx > 0 ? 6 : dx < 0 ? 2 : dy > 0 ? 0 : 4) as number;
      return;
    }
  }
}
