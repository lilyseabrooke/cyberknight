import type { Ctx, Id, Npc, NpcGoal, Vehicle, World } from './types';
import type { EventData } from './events';
import type { Trait } from './personality';
import { clamp } from './candidate';
import { traitOf } from './character';
import { addHeat, remember } from './combat';
import { heartOf } from './bonds';
import { moveNpc, npcsAt, AWAY } from './population';
import { opposed, ratio, statsOf } from './npcstats';
import { routeTo } from './plans';
import { parkedVehicle, isPerson } from './roads';
import { regard, tie } from './ties';

/**
 * Errands: what somebody does with a goal Blackbird has given them.
 *
 * They don't follow a script. Each beat the carrier works out where the thing is to be done and gets there; once they are
 * there they look at the ways they could go about it, weigh them (how likely, by their own stats and skills; how much each
 * suits their character; how bad it is if it goes wrong, for someone of their nerve) and pick one the way she picks what to
 * do: softmax, so the sensible way is likely but not certain. Then they roll. A way that fails costs them a little and they
 * try again, maybe differently; enough failures and they give up. Someone who doesn't like the whole idea may just refuse.
 *
 * Nothing here needs her to be watching. Away from her they get on with it all the same and only the outcome is told; in
 * the room, every attempt is.
 */

export type Say = EventData;

export interface Approach {
  id: string;
  /** Their own chance of pulling it off. */
  odds(w: World, n: Npc, g: NpcGoal): number;
  /** Traits that make this the way they'd rather go about it (a high trait counts for it if positive, against if negative). */
  fit: Partial<Record<Trait, number>>;
  /** 0..1: how bad it is if it goes wrong. */
  risk: number;
  /** What comes of it. Returns anything the telling needs. */
  play(c: Ctx, n: Npc, g: NpcGoal, ok: boolean): Say;
}

interface Errand {
  /** Where it is done; null if it can't be done any more. */
  where(w: World, n: Npc, g: NpcGoal): Id | null;
  approaches(w: World, n: Npc, g: NpcGoal): Approach[];
}

export const ERRAND_KINDS = new Set(['go_after', 'kiss', 'steal_car', 'take_deck', 'buy_round', 'tag_wall', 'karaoke']);

// ===================================================================== helpers

const FAR = new Set<Id>([AWAY, '_gone']);
const reachable = (w: World, id: Id | undefined): id is Id => !!id && !FAR.has(id) && !!w.locations[id];
const targetOf = (w: World, g: NpcGoal): Npc | undefined => (g.target ? w.npcs[g.target] : undefined);
const placeName = (w: World, id: Id): string => w.locations[id]?.name ?? 'somewhere';
const T = (w: World, n: Npc, t: Trait): number => traitOf(w, n, t);
const odd = (p: number): number => clamp(p, 0.05, 0.92);

/** Breadth-first from a place over the exits anybody could use, to the first one that fits. */
export function nearest(w: World, from: Id, fits: (id: Id) => boolean, depth = 5): Id | null {
  const seen = new Set<Id>([from]);
  let ring: Id[] = [from];
  for (let d = 0; d <= depth && ring.length; d++) {
    for (const id of ring) if (fits(id)) return id;
    const next: Id[] = [];
    for (const id of ring) {
      for (const e of w.locations[id]?.exits ?? []) {
        if (e.hidden || seen.has(e.to) || !w.locations[e.to]) continue;
        seen.add(e.to);
        next.push(e.to);
      }
    }
    ring = next;
  }
  return null;
}

/** A street within reach of here with a car on it that nobody has taken. */
export const carStreet = (w: World, from: Id): Id | null => nearest(w, from, (id) => w.locations[id]!.kind === 'street' && !!parkedVehicle(w, w.locations[id]!), 4);

/** A bar or club within reach. */
export const barNear = (w: World, from: Id): Id | null => nearest(w, from, (id) => ['bar', 'club'].includes(w.locations[id]!.kind));

/** A scrap between two people she is not in. */
export function scuffle(c: Ctx, a: Npc, b: Npc, edge = 1): { winner: Npc; loser: Npc } {
  const { w, rng } = c;
  const pa = a.power * edge * (0.7 + 0.6 * rng.next());
  const pb = b.power * (0.7 + 0.6 * rng.next());
  const [winner, loser] = pa >= pb ? [a, b] : [b, a];
  loser.hp = Math.max(1, loser.hp - Math.round(loser.maxHp * (0.3 + 0.3 * rng.next())));
  loser.downUntil = w.beat + rng.int(25, 60);
  winner.hp = Math.max(1, winner.hp - Math.round(winner.maxHp * 0.15 * rng.next()));
  return { winner, loser };
}

export function drop(w: World, n: Npc, g: NpcGoal): void {
  n.goals = (n.goals ?? []).filter((x) => x !== g);
  if (!n.goals.length) {
    delete n.goals;
    w.influenced = (w.influenced ?? []).filter((id) => id !== n.id);
  }
}

/** It's over, one way or another. A person who was conned may work out that they were. */
export function finish(c: Ctx, n: Npc, g: NpcGoal, how: 'done' | 'lapsed' | 'moot'): void {
  const { w, rng } = c;
  drop(w, n, g);
  if (how === 'moot' || !g.conned) return;
  if (rng.chance(clamp(0.2 + 0.35 * (ratio(n, 'int') - 1) + 0.3 * (T(w, n, 'curiosity') - 0.5), 0.05, 0.8))) {
    n.affinity -= 15;
    remember(n, 'was conned by Blackbird');
    if (n.locationId === w.hero.locationId) c.emit('influence_end', 'bad', { variant: 'wise', npc: n.name, method: g.method, kind: g.kind });
  }
}

/** Who is about, apart from the carrier. */
const bystanders = (w: World, loc: Id, n: Npc): Npc[] => npcsAt(w, loc).filter((x) => x.id !== n.id && x.alive && !x.hostile && isPerson(x.tags, x.archetype));
const crowd = (w: World, n: Npc): Npc[] => bystanders(w, n.locationId, n);
/** She was there for it, and so it is hers. */
const herDoing = (w: World, n: Npc): boolean => n.locationId === w.hero.locationId;

function heat(c: Ctx, n: Npc, gain: number, source: string): void {
  const { w } = c;
  if (!herDoing(w, n)) return;
  addHeat(w, 'npd', gain);
  c.emit('heat_up', 'bad', { variant: 'npd', gain, level: w.heat.npd ?? 0, source, calls: 0 });
}

// ===================================================================== the errands

const GO_AFTER: Errand = {
  where: (w, _n, g) => (targetOf(w, g)?.alive ? targetOf(w, g)!.locationId : null),
  approaches: (w, n, g) => {
    const t = targetOf(w, g)!;
    const fight = (c: Ctx, edge: number): Say => {
      const { w } = c;
      const { winner, loser } = scuffle(c, n, t, edge);
      const won = winner === n;
      if (won) {
        t.affinity -= 8;
        for (const goal of w.mind.goals) if (goal.kind === 'kill' && goal.npc === t.id) goal.struck = true;
        remember(t, 'was set on by someone Blackbird sent');
      } else n.affinity -= 2;
      return { won, loser: loser.name };
    };
    return [
      { id: 'brawl', odds: (w2, a) => odd(0.45 + 0.03 * (a.power - t.power) + 0.02 * (statsOf(a).muscle - statsOf(t).muscle)), fit: { temper: 0.6, courage: 0.5, kindness: -0.4 }, risk: 0.6, play: (c, _n, _g, ok) => ({ ...fight(c, ok ? 1.5 : 0.6), won: ok }) },
      { id: 'ambush', odds: (w2, a) => odd(0.4 + 0.05 * opposed(a, ['sneak', ['stat:reflex', 0.6]]) - 0.04 * opposed(t, [['stat:reflex', 1]])), fit: { courage: -0.1, mischief: 0.4, honesty: -0.4, grudge: 0.4 }, risk: 0.3, play: (c, _n, _g, ok) => ({ ...fight(c, ok ? 2.2 : 0.5), won: ok }) },
    ];
  },
};

const KISS: Errand = {
  where: (w, _n, g) => (targetOf(w, g)?.alive ? targetOf(w, g)!.locationId : null),
  approaches: (w, n, g) => {
    const t = targetOf(w, g)!;
    const fond = clamp(regard(w, t.id, n.id), -50, 80) / 200;
    const heart = heartOf(w, t);
    const taken = heart.partner ? 0.3 * heart.loyal : 0;
    const afterwards = (c: Ctx, ok: boolean, slapChance: number): Say => {
      const { rng } = c;
      const slapped = ok ? rng.chance(slapChance) : false;
      if (ok) {
        remember(t, `was kissed by ${n.name}`);
        tie(c.w, t.id, n.id, 'friend', regard(c.w, t.id, n.id) + (slapped ? -5 : 12));
      } else remember(n, `was turned down by ${t.name}`);
      if (!ok || slapped) n.affinity -= 2;
      return { slapped };
    };
    return [
      { id: 'smooth', odds: (w2, a) => odd(0.28 + 0.05 * opposed(a, ['romance', ['stat:charm', 0.6]]) + fond - 0.08 * (ratio(t, 'charm') - 1) - taken), fit: { sociable: 0.6, courage: 0.2 }, risk: 0.2, play: (c, _a, _g, ok) => afterwards(c, ok, 0) },
      { id: 'steal', odds: (w2, a) => odd(0.5 + 0.03 * (statsOf(a).reflex - statsOf(t).reflex)), fit: { courage: 0.7, mischief: 0.5, kindness: -0.3 }, risk: 0.5, play: (c, _a, _g, ok) => afterwards(c, ok, clamp(0.15 + 0.5 * T(c.w, t, 'temper') - fond, 0.05, 0.8)) },
      { id: 'ask', odds: (w2, a) => odd(0.22 + fond * 2 - taken), fit: { kindness: 0.3, sociable: 0.2, courage: -0.2 }, risk: 0.05, play: (c, _a, _g, ok) => afterwards(c, ok, 0) },
    ];
  },
};

const STEAL_CAR: Errand = {
  where: (w, n, g) => {
    if (g.loc && w.locations[g.loc] && parkedVehicle(w, w.locations[g.loc]!)) return g.loc;
    return (g.loc = carStreet(w, n.locationId) ?? undefined) ?? null;
  },
  approaches: (w, n, g) => {
    const loc = w.locations[g.loc!]!;
    const car = parkedVehicle(w, loc)!;
    const hard = (car.kind === 'civilian' ? 0 : 0.12) - (car.body === 'bike' ? 0.08 : 0);
    const watched = (): boolean => bystanders(w, loc.id, n).length > 0;
    /** The car is theirs; it turns up wherever she is, if that is a street, or else stays put for her to find. */
    const take = (c: Ctx): Say => {
      const { w } = c;
      w.flags[`stolen:${loc.id}`] = true;
      const dest = w.locations[w.hero.locationId]?.kind === 'street' ? w.hero.locationId : loc.id;
      const strays = (w.strays ??= {});
      if (w.strays[loc.id]) delete w.strays[loc.id];
      strays[dest] = car as Vehicle;
      return { car: car.name, dest: placeName(w, dest), by: dest === loc.id ? 'left' : 'brought' };
    };
    return [
      {
        id: 'hotwire', odds: (_w, a) => odd(0.22 + 0.05 * opposed(a, ['hijack', ['stat:reflex', 0.5], ['lockpicking', 0.3]]) - hard), fit: { honesty: -0.5, curiosity: 0.3, courage: 0.2 }, risk: 0.35,
        play: (c, _a, _g, ok) => (ok ? take(c) : (heat(c, n, 1, 'hijack'), { car: car.name })),
      },
      {
        id: 'smash', odds: (_w, a) => odd(0.4 + 0.025 * statsOf(a).muscle - hard), fit: { temper: 0.6, courage: 0.4, mischief: 0.3 }, risk: 0.6,
        play: (c, _a, _g, ok) => {
          n.hp = Math.max(1, n.hp - Math.round(n.maxHp * 0.08));
          if (watched() || !ok) heat(c, n, 1, 'hijack');
          return ok ? take(c) : { car: car.name };
        },
      },
      { id: 'lurk', odds: (_w, a) => odd(0.32 + 0.03 * opposed(a, ['perception', ['sleight', 0.5]]) - hard - (watched() ? 0.1 : 0)), fit: { curiosity: 0.5, courage: -0.3, honesty: -0.2 }, risk: 0.15, play: (c, _a, _g, ok) => (ok ? take(c) : { car: car.name }) },
    ];
  },
};

const TAKE_DECK: Errand = {
  where: (w) => (reachable(w, w.features.dj_booth?.locationId) ? w.features.dj_booth!.locationId : null),
  approaches: (w, n) => {
    const booth = w.features.dj_booth!;
    const dj = w.npcs.kilobyte;
    const there = !!dj && dj.alive && dj.locationId === booth.locationId && dj.id !== n.id;
    const set = (c: Ctx, usurped: boolean): Say => {
      const { w, rng } = c;
      const q = clamp(0.3 + 0.06 * opposed(n, ['djing', ['music', 0.6]]), 0.1, 0.9);
      const good = rng.chance(q);
      for (const x of bystanders(w, booth.locationId, n)) x.affinity += good ? 3 : -2;
      if (usurped && dj) dj.affinity -= 4;
      booth.flags.push(`held:${n.id}`);
      booth.uses++;
      return { good, dj: usurped && dj ? dj.name : '' };
    };
    return [
      { id: 'ask', odds: (w2, a) => odd(0.3 + 0.04 * opposed(a, [['stat:charm', 1]]) - (there ? 0.1 : 0)), fit: { sociable: 0.5, kindness: 0.2 }, risk: 0.1, play: (c, _a, _g, ok) => (ok ? set(c, false) : { dj: '' }) },
      {
        id: 'elbow', odds: (w2, a) => odd(0.35 + 0.04 * opposed(a, ['intimidation', ['stat:muscle', 0.5]]) - (there ? 0.1 * (ratio(dj!, 'muscle') - 1) : -0.2)), fit: { temper: 0.5, courage: 0.6, kindness: -0.4 }, risk: 0.5,
        play: (c, _a, _g, ok) => {
          if (!ok && there) scuffle(c, n, dj!, 0.8);
          return ok ? set(c, true) : { dj: there ? dj!.name : '' };
        },
      },
      { id: 'usb', odds: (w2, a) => odd(0.3 + 0.05 * opposed(a, ['sleight', ['tinkering', 0.5]])), fit: { mischief: 0.7, honesty: -0.4 }, risk: 0.25, play: (c, _a, _g, ok) => (ok ? set(c, true) : { dj: there ? dj!.name : '' }) },
    ];
  },
};

const BUY_ROUND: Errand = {
  where: (w, n, g) => (g.loc && w.locations[g.loc] ? g.loc : (g.loc = barNear(w, n.locationId) ?? undefined) ?? null),
  approaches: (w, n, g) => {
    const people = (): Npc[] => bystanders(w, g.loc!, n);
    const toast = (amount: number): Say => {
      for (const x of people()) x.affinity += 2;
      return { amount, crowd: people().length };
    };
    return [
      {
        id: 'cash', odds: () => (n.cash >= 20 ? 0.95 : 0.1), fit: { greed: -0.9, sociable: 0.6, kindness: 0.3 }, risk: 0.05,
        play: (c, _a, _g, ok) => {
          if (!ok) return {};
          const amount = Math.min(n.cash, Math.max(15, Math.round(Math.min(n.cash * 0.5, 12 * people().length + 20))));
          n.cash -= amount;
          return toast(amount);
        },
      },
      {
        id: 'tab', odds: () => odd(0.35 + 0.1 * opposed(n, ['grifting', ['stat:charm', 0.5]])), fit: { honesty: -0.7, mischief: 0.5, greed: 0.3 }, risk: 0.3,
        play: (c, _a, _g, ok) => {
          if (!ok) {
            n.affinity -= 2;
            return {};
          }
          return toast(0);
        },
      },
    ];
  },
};

const TAG_WALL: Errand = {
  where: (w, n, g) => (g.loc && w.locations[g.loc] ? g.loc : w.locations[n.locationId] ? (g.loc = n.locationId) : null),
  approaches: (w, n, g) => {
    const loc = w.locations[g.loc!]!;
    const paint = (c: Ctx, pieces: number, ok: boolean): Say => {
      if (ok) loc.graffiti += pieces;
      else if (bystanders(c.w, loc.id, n).length) heat(c, n, 1, 'graffiti');
      return {};
    };
    return [
      { id: 'tag', odds: (w2, a) => odd(0.55 + 0.04 * opposed(a, ['art', ['stat:reflex', 0.4]])), fit: { mischief: 0.6, curiosity: 0.2 }, risk: 0.2, play: (c, _a, _g, ok) => paint(c, 1, ok) },
      { id: 'piece', odds: (w2, a) => odd(0.3 + 0.06 * opposed(a, ['art', ['stat:charm', 0.3]])), fit: { mischief: 0.4, curiosity: 0.4, courage: 0.3 }, risk: 0.4, play: (c, _a, _g, ok) => paint(c, 2, ok) },
    ];
  },
};

const KARAOKE: Errand = {
  where: (w) => (reachable(w, w.features.karaoke?.locationId) ? w.features.karaoke!.locationId : null),
  approaches: (w, n) => {
    const loc = w.features.karaoke!.locationId;
    const crowdMood = (c: Ctx, d: number): Say => {
      for (const x of bystanders(c.w, loc, n)) x.affinity += d;
      return { crowd: bystanders(c.w, loc, n).length };
    };
    return [
      {
        id: 'sing', odds: (w2, a) => odd(0.4 + 0.05 * opposed(a, ['vocals', ['stat:charm', 0.4]])), fit: { sociable: 0.5, courage: 0.3 }, risk: 0.15,
        play: (c, _a, _g, ok) => {
          if (ok) n.cash += c.rng.int(5, 25);
          return crowdMood(c, ok ? 2 : -1);
        },
      },
      {
        id: 'belt', odds: (w2, a) => odd(0.22 + 0.06 * opposed(a, ['vocals', ['stat:charm', 0.4]])), fit: { sociable: 0.4, courage: 0.7, mischief: 0.4 }, risk: 0.45,
        play: (c, _a, _g, ok) => {
          if (ok) n.cash += c.rng.int(15, 50);
          return crowdMood(c, ok ? 4 : -3);
        },
      },
    ];
  },
};

const ERRANDS: Record<string, Errand> = { go_after: GO_AFTER, kiss: KISS, steal_car: STEAL_CAR, take_deck: TAKE_DECK, buy_round: BUY_ROUND, tag_wall: TAG_WALL, karaoke: KARAOKE };

// ===================================================================== doing it

/** How they rate a way of going about it. */
function appeal(w: World, n: Npc, g: NpcGoal, a: Approach): number {
  let fit = 0;
  for (const [t, wt] of Object.entries(a.fit) as [Trait, number][]) fit += wt * (T(w, n, t) - 0.5) * 2;
  const nerve = 0.4 + 0.8 * T(w, n, 'courage') - 0.5 * (T(w, n, 'temper') - 0.5);
  return 2.4 * a.odds(w, n, g) + 0.5 * fit - a.risk * (1.6 - nerve) - 0.25 * (g.tries ?? 0) * a.risk;
}

/** One beat of an errand. */
export function runErrand(c: Ctx, n: Npc, g: NpcGoal, align: number): void {
  const { w, rng } = c;
  const hero = w.hero.locationId;
  const spec = ERRANDS[g.kind]!;
  const dest = spec.where(w, n, g);
  if (!dest) {
    finish(c, n, g, 'moot');
    return;
  }
  const near = n.locationId === hero;
  const t = targetOf(w, g);
  const deed = { npc: n.name, kind: g.kind, method: g.method, ...(t ? { target: t.name } : {}) };

  // Getting there.
  if (n.locationId !== dest) {
    const route = routeTo(w, n.locationId, dest);
    if (!g.sent) {
      g.sent = true;
      if (near) c.emit('influence_depart', 'good', { ...deed, place: placeName(w, dest) });
    }
    if (rng.chance(clamp(0.9 / Math.max(1, route?.dist ?? 4), 0.12, 0.7))) {
      moveNpc(w, n, dest);
      if (dest === hero) c.emit('influence_arrive', 'mixed', { ...deed, place: placeName(w, dest) });
    }
    return;
  }
  if ((g.wait ?? 0) > w.beat) return;

  // Weighing it up: the ways they could go about it, and not bothering.
  const ways = spec.approaches(w, n, g);
  const scored = ways.map((a) => ({ a, s: appeal(w, n, g, a) }));
  const balk = { a: null as Approach | null, s: 0.6 * Math.max(0, -align) * 3 + 0.5 * (g.tries ?? 0) - 0.9 };
  const options = [...scored, balk];
  const top = Math.max(...options.map((o) => o.s));
  const pick = rng.weighted(options, (o) => Math.exp((o.s - top) / 0.45));
  const seen = herDoing(w, n);
  const place = placeName(w, dest);
  if (!pick.a) {
    c.emit('errand_balk', 'mixed', { ...deed, place, variant: g.kind, seen });
    finish(c, n, g, 'lapsed');
    return;
  }
  const a = pick.a;
  const ok = rng.chance(a.odds(w, n, g));
  const extra = a.play(c, n, g, ok);
  if (ok || seen) c.emit('errand', ok ? 'good' : 'bad', { ...deed, ...extra, variant: `${g.kind}_${a.id}_${ok ? 'ok' : 'no'}`, place, seen });
  if (ok) {
    finish(c, n, g, 'done');
    return;
  }
  g.tries = (g.tries ?? 0) + 1;
  g.wait = w.beat + rng.int(2, 4);
  if (g.tries >= 3 || n.hp < n.maxHp * 0.4 || n.downUntil > w.beat) {
    c.emit('errand_giveup', 'bad', { ...deed, place, seen, variant: g.kind });
    finish(c, n, g, 'lapsed');
  }
}
