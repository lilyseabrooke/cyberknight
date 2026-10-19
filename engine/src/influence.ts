import type { Candidate } from './candidate';
import { Rng } from './rng';
import { clamp, levelRisk } from './candidate';
import type { Ctx, Id, InfluenceMethod, Npc, NpcGoal, NpcGoalKind, World } from './types';
import type { Trait } from './personality';
import { canDeepen, ensureDeep } from './deepen';
import { traitOf } from './character';
import { isFairGame } from './people';
import { fight, heroPower, here, remember } from './combat';
import { synergy, train, type Part } from './skills';
import { ratio, statsOf, type NpcStat } from './npcstats';
import { cool, cooling, priority } from './mind';

import { heartOf, romanceMod } from './bonds';
import { learn, unknownFacts } from './knowledge';
import { regard } from './ties';
import { ERRAND_KINDS, barNear, carStreet, finish, runErrand } from './errands';

/**
 * Influence. Blackbird can put a goal in somebody else's head: get them to pay her, look the other way, have her back,
 * go and deal with someone, tell her what they know. She goes about it with one of the four skills under Charm that make
 * people do things:
 *
 *   persuasion    it's a good idea
 *   intimidation  do it or else
 *   flirting      do it for me
 *   grifting      here is a story, and in it you want to do this
 *
 * Whether it takes depends on how big the ask is (`magnitude`), how much it goes against who they are (`conflict`, from
 * their character), how much they like her, and how well she plays that method on that person. If it takes, they carry
 * the goal for a while and it steers what they do (`influenceTick`, and hooks in stealth, witnessing and fights), and
 * how she got them there is remembered: frightened people hold a grudge, conned people may work it out.
 *
 * She wants things for her own reasons (a cash goal, a kill, a job that wants a quiet room), and those wishes are what
 * turn into attempts (`wishes`, `influenceCandidates`). Errands last a night, no longer.
 */

export const METHODS: readonly InfluenceMethod[] = ['persuasion', 'intimidation', 'romance', 'grifting'];

interface MethodDef {
  /** Her side of the roll. */
  parts: Part[];
  /** The stat of theirs that pushes back. */
  resist: NpcStat;
  /** Who is easier to work this way: trait -> weight (a high trait helps if positive). */
  lean: Partial<Record<Trait, number>>;
}

const METHOD: Record<InfluenceMethod, MethodDef> = {
  persuasion: { parts: ['persuasion', ['stat:charm', 0.6]], resist: 'int', lean: { sociable: 0.2, kindness: 0.12, grudge: -0.1 } },
  intimidation: { parts: ['intimidation', ['stat:muscle', 0.5]], resist: 'muscle', lean: { courage: -0.45, temper: -0.15, loyalty: -0.05 } },
  romance: { parts: ['romance', ['stat:charm', 0.6]], resist: 'charm', lean: { sociable: 0.1, loyalty: -0.1 } },
  grifting: { parts: ['grifting', ['stat:charm', 0.5]], resist: 'int', lean: { greed: 0.25, curiosity: -0.1, honesty: 0.05 } },
};

interface GoalDef {
  /** Beats it lasts. */
  ttl: number;
  /** What it takes to want this: a high trait that has a positive weight makes them keener, a negative one makes them warier. */
  nature: Partial<Record<Trait, number>>;
}

const GOALS: Record<NpcGoalKind, GoalDef> = {
  give_cash: { ttl: 8, nature: { greed: -1, kindness: 0.5, loyalty: 0.2 } },
  cover: { ttl: 70, nature: { honesty: -0.7, mischief: 0.8, courage: 0.2, loyalty: -0.3 } },
  back_me_up: { ttl: 90, nature: { courage: 1, loyalty: 0.4, temper: 0.3, kindness: 0.2 } },
  go_after: { ttl: 60, nature: { kindness: -1, temper: 0.7, grudge: 0.6, courage: 0.5, honesty: -0.2 } },
  spill: { ttl: 8, nature: { sociable: 1, loyalty: -0.8, honesty: 0.3, curiosity: 0.2 } },
  // The kind of thing she might ask just because she's Blackbird.
  kiss: { ttl: 70, nature: { sociable: 0.6, courage: 0.5, mischief: 0.4, loyalty: -0.4 } },
  steal_car: { ttl: 80, nature: { honesty: -1, mischief: 0.7, courage: 0.4, greed: 0.4 } },
  take_deck: { ttl: 80, nature: { courage: 0.5, sociable: 0.5, mischief: 0.3, temper: 0.2 } },
  buy_round: { ttl: 70, nature: { greed: -1, sociable: 0.7, kindness: 0.3 } },
  tag_wall: { ttl: 70, nature: { mischief: 1, honesty: -0.3, curiosity: 0.2 } },
  karaoke: { ttl: 70, nature: { sociable: 1, courage: 0.6, mischief: 0.3 } },
};

/** Something she'd like somebody to take on, and how big a thing it is to ask. */
export interface Wish {
  kind: NpcGoalKind;
  /** How badly she wants it, 0..1. */
  urge: number;
  /** 0..1: how much she is asking. */
  magnitude: number;
  target?: Id;
  amount?: number;
  loc?: Id;
}

const AUTHORITY = ['cop', 'security', 'owner', 'staff'];

const nameOf = (w: World, id: Id | undefined): string => (id && w.npcs[id]?.name) || 'someone';

// ===================================================================== reading

export const goalOf = (n: Npc, kind: NpcGoalKind): NpcGoal | undefined => n.goals?.find((g) => g.kind === kind);

/** Are they looking the other way for her? Witnesses who are cover don't call the law or step in; observers don't build awareness. */
export const covering = (w: World, n: Npc): boolean => !!n.goals?.some((g) => g.kind === 'cover' && w.beat < g.until);

/** Who here has her back right now. */
export function backers(w: World): Npc[] {
  const loc = w.hero.locationId;
  return (w.influenced ?? []).map((id) => w.npcs[id]).filter((n): n is Npc => !!n && n.alive && !n.hostile && n.downUntil <= w.beat && n.locationId === loc && !!n.goals?.some((g) => g.kind === 'back_me_up' && w.beat < g.until));
}

/** What they add to a fight she is in. */
export const backersPower = (w: World): number => (w.influenced?.length ? backers(w).reduce((a, n) => a + n.power * 0.6, 0) : 0);

/** −1..1: how much this goal sits with who they are. Negative is a conflict, positive is a fit. */
export function alignment(w: World, n: Npc, kind: NpcGoalKind): number {
  let sum = 0;
  let span = 0;
  for (const [t, wt] of Object.entries(GOALS[kind].nature) as [Trait, number][]) {
    sum += wt * (traitOf(w, n, t) - 0.5) * 2;
    span += Math.abs(wt);
  }
  return span ? clamp(sum / span, -1, 1) : 0;
}

/**
 * The chance she gets them to take it on by this method. All of it in the open: the size of the ask, the clash with their
 * character, how they feel about her, the skill she brings against what they bring back.
 */
export function influenceOdds(w: World, n: Npc, wish: Wish, method: InfluenceMethod): number {
  const h = w.hero;
  const m = METHOD[method];
  const align = alignment(w, n, wish.kind);
  let p = 0.62 + 0.05 * synergy(h, m.parts);
  // Liking helps; frightening someone doesn't need them to like her.
  p += (method === 'intimidation' ? 0.3 : 1) * (n.affinity / 180);
  p -= 0.55 * wish.magnitude;
  p -= 0.4 * Math.max(0, -align);
  p += 0.15 * Math.max(0, align);
  for (const [t, wt] of Object.entries(m.lean) as [Trait, number][]) p += wt * (traitOf(w, n, t) - 0.5);
  p -= 0.1 * (ratio(n, m.resist) - 1);
  if (method === 'intimidation') p += 0.02 * (h.muscle - statsOf(n).muscle) + 0.03 * (h.level - n.level);
  if (method === 'romance') p += romanceMod(w, n);
  return clamp(p, 0.03, 0.92);
}

// ===================================================================== what she wants

const factMagnitude = { visible: 0.1, overheard: 0.25, asked: 0.4, secret: 0.85 } as const;

/** What she'd like this person to do for her, given what she is up to. */
export function wishes(w: World, n: Npc): Wish[] {
  const h = w.hero;
  const out: Wish[] = [];
  const open = (kind: string) => w.mind.goals.filter((g) => g.kind === kind);

  // Money. Whoever has some, and a cash goal or an empty pocket to spend it on.
  const cashGoal = open('cash')[0];
  const need = cashGoal ? (cashGoal.amount ?? 0) - h.cash : 0;
  if (n.cash >= 25 && (need > 0 || h.cash < 40)) {
    const share = clamp(need > 0 ? need / n.cash : 0.3, 0.2, 0.85);
    out.push({ kind: 'give_cash', urge: need > 0 ? priority(w, cashGoal!) : 0.25, magnitude: share, amount: Math.max(10, Math.round(n.cash * share)) });
  }

  // A job that wants nobody raising the alarm.
  const quiet = [...open('heist'), ...open('burgle'), ...open('quest'), ...open('raid')][0];
  if (quiet) out.push({ kind: 'cover', urge: 0.45 * priority(w, quiet), magnitude: 0.25 + (n.tags.some((t) => AUTHORITY.includes(t)) ? 0.4 : 0) + (quiet.kind === 'heist' ? 0.15 : 0) });

  // A fight on the way.
  const fightGoal = [...open('kill'), ...open('dragon'), ...open('raid')][0];
  if (fightGoal && n.power >= 3) {
    const foe = fightGoal.npc ? w.npcs[fightGoal.npc] : undefined;
    const foePower = foe?.power ?? heroPower(w);
    out.push({ kind: 'back_me_up', urge: 0.7 * priority(w, fightGoal), magnitude: 0.3 + 0.5 * clamp(foePower / (n.power * 2 + heroPower(w) + 1), 0, 1) });
  }

  // Someone she'd like seen to.
  for (const g of open('kill')) {
    const t = g.npc ? w.npcs[g.npc] : undefined;
    if (!t?.alive || t.id === n.id || t.tags.includes('boss') || t.tags.includes('dragon') || t.downUntil > w.beat) continue;
    const ties = regard(w, n.id, t.id);
    out.push({
      kind: 'go_after', target: t.id, urge: priority(w, g),
      magnitude: clamp(0.5 + 0.35 * clamp(t.power / (n.power + 1) - 0.5, 0, 1) + (ties > 30 ? 0.3 : 0), 0, 1),
    });
    break;
  }

  // Something they know.
  if (n.depth === 'deep') {
    const f = unknownFacts(w, n)[0];
    if (f) out.push({ kind: 'spill', urge: 0.2 + 0.25 * traitOf(w, n, 'curiosity') + 0.2 * (h.personality.traits.curiosity - 0.5), magnitude: factMagnitude[f.vis] });
  }

  out.push(...whims(w, n));
  // One errand at a time.
  const busy = !!n.goals?.some((g) => ERRAND_KINDS.has(g.kind));
  return out.filter((x) => x.urge > 0.05 && !goalOf(n, x.kind) && !(busy && ERRAND_KINDS.has(x.kind)) && !cooling(w, `influence:${n.id}:${x.kind}`));
}

/**
 * Things she asks for because she is Blackbird. Nothing she needs: a mood, and whoever is standing there. A whim holds for a
 * stretch of the night (so it is still her idea when she gets round to it) and the more mischief in her, the more of them.
 */
function whims(w: World, n: Npc): Wish[] {
  const t = w.hero.personality.traits;
  const rng = new Rng(`whim:${w.worldSeed}:${n.id}:${Math.floor(w.beat / 40)}`);
  const mood = clamp(0.08 + 0.5 * t.mischief + 0.15 * t.thrill, 0.05, 0.6);
  if (!rng.chance(mood)) return [];
  const urge = 0.15 + 0.3 * t.mischief;
  const loc = w.locations[w.hero.locationId];
  const options: { w: number; make: () => Wish | null }[] = [
    {
      w: 0.4 + t.impress + t.romantic,
      make: () => {
        const pool = here(w).filter((x) => x.id !== n.id && x.alive && !x.hostile && x.archetype !== 'puppy' && !x.tags.some((g) => ['robot', 'dragon', 'boss', 'pet'].includes(g)) && x.gender !== 'none');
        if (!pool.length) return null;
        const target = rng.pick(pool);
        return { kind: 'kiss', urge, target: target.id, magnitude: 0.35 + (heartOf(w, target).partner ? 0.25 : 0) };
      },
    },
    { w: 0.3 + t.mischief + t.thrill, make: () => (carStreet(w, w.hero.locationId) ? { kind: 'steal_car', urge, magnitude: 0.75 } : null) },
    { w: 0.3 + t.fame + t.mischief, make: () => (w.features.dj_booth && w.locations[w.features.dj_booth.locationId] ? { kind: 'take_deck', urge, magnitude: 0.6 } : null) },
    { w: 0.3 + t.sociable + t.impress, make: () => (n.cash >= 40 && barNear(w, w.hero.locationId) ? { kind: 'buy_round', urge, magnitude: 0.35 + 0.3 * clamp(30 / n.cash, 0, 1) } : null) },
    { w: 0.2 + t.artistry + t.mischief, make: () => (loc && loc.kind !== 'home' ? { kind: 'tag_wall', urge, magnitude: 0.4, loc: loc.id } : null) },
    { w: 0.3 + t.fame + t.mischief, make: () => (w.features.karaoke && w.locations[w.features.karaoke.locationId] ? { kind: 'karaoke', urge, magnitude: 0.35 } : null) },
  ];
  const pick = rng.weighted(options, (o) => Math.max(0.05, o.w));
  const wish = pick.make();
  return wish ? [wish] : [];
}

/** What the ask sounds like, to her ("to hand over 120 neodollars") and as the thing they end up doing ("handing over 120 neodollars"). */
export function phrasing(w: World, wish: Wish): { ask: string; deed: string } {
  const who = nameOf(w, wish.target);
  switch (wish.kind) {
    case 'give_cash': return { ask: `to hand over ${wish.amount} neodollars`, deed: `handing over ${wish.amount} neodollars` };
    case 'cover': return { ask: 'to look the other way', deed: 'looking the other way' };
    case 'back_me_up': return { ask: 'to have her back', deed: 'having her back' };
    case 'go_after': return { ask: `to go and deal with ${who}`, deed: `dealing with ${who}` };
    case 'spill': return { ask: 'to talk', deed: 'talking' };
    case 'kiss': return { ask: `to go and kiss ${who}`, deed: `kissing ${who}` };
    case 'steal_car': return { ask: 'to go and steal a car', deed: 'stealing a car' };
    case 'take_deck': return { ask: 'to go and take over the DJ deck', deed: 'taking over the decks' };
    case 'buy_round': return { ask: 'to buy the room a round', deed: 'buying a round' };
    case 'tag_wall': return { ask: 'to go and tag a wall', deed: 'tagging a wall' };
    case 'karaoke': return { ask: 'to get up and sing karaoke', deed: 'getting up to sing' };
  }
}

// ===================================================================== trying

const MAX_ERRANDS = 4;

/** Everything she could try on this person right now. */
export function influenceCandidates(w: World, n: Npc): Candidate[] {
  if (!n.alive || n.hostile || !canDeepen(n) || (w.influenced?.length ?? 0) >= MAX_ERRANDS) return [];
  const h = w.hero;
  const out: Candidate[] = [];
  for (const wish of wishes(w, n)) {
    const words = phrasing(w, wish);
    for (const method of METHODS) {
      if (method === 'romance' && !isFairGame(n)) continue;
      // Leaning on somebody is not done quietly, or in front of a room she's trying to keep out of.
      if (method === 'intimidation' && h.stealth) continue;
      if (method === 'intimidation' && n.tags.includes('doc')) continue;
      const p = influenceOdds(w, n, wish, method);
      if (p < 0.12) continue;
      out.push({
        key: `influence:${n.id}:${wish.kind}:${method}`,
        drives: method === 'persuasion' ? { pride: 0.2, curiosity: 0.1 } : method === 'intimidation' ? { bravery: 0.4, pride: 0.4, greed: 0.2 } : method === 'romance' ? { lust: 0.6, pride: 0.1 } : { greed: 0.4, curiosity: 0.2, pride: 0.1 },
        bonus: 1.2 * wish.urge + 0.4 * (p - 0.4),
        smart: 0.3,
        risk: method === 'intimidation' ? 0.3 + levelRisk(w, n) : method === 'grifting' ? 0.2 : 0.05,
        intent: { npc: n.name, method, ask: words.ask },
        run: (c) => attempt(c, n, wish, method),
      });
    }
  }
  return out;
}

function addGoal(c: Ctx, n: Npc, wish: Wish, method: InfluenceMethod): NpcGoal {
  const { w } = c;
  const g: NpcGoal = {
    id: w.mind.nextId++, kind: wish.kind, method, born: w.beat, until: w.beat + GOALS[wish.kind].ttl,
    ...(wish.target ? { target: wish.target } : {}), ...(wish.amount !== undefined ? { amount: wish.amount } : {}), ...(wish.loc ? { loc: wish.loc } : {}),
    ...(method === 'intimidation' ? { coerced: true } : {}), ...(method === 'grifting' ? { conned: true } : {}),
  };
  (n.goals ??= []).push(g);
  const list = (w.influenced ??= []);
  if (!list.includes(n.id)) list.push(n.id);
  return g;
}

function attempt(c: Ctx, n: Npc, wish: Wish, method: InfluenceMethod): void {
  const { w, rng } = c;
  ensureDeep(w, n);
  const p = influenceOdds(w, n, wish, method);
  const words = phrasing(w, wish);
  const data = { npc: n.name, method, kind: wish.kind, ask: words.ask, deed: words.deed, ...(wish.target ? { target: nameOf(w, wish.target) } : {}) };
  const sk = method === 'romance' ? 'romance' : method;
  cool(w, `influence:${n.id}:${wish.kind}`, 35);
  if (rng.chance(p)) {
    train(c, sk, 2 + Math.round(2 * wish.magnitude));
    addGoal(c, n, wish, method);
    if (method === 'persuasion') n.affinity += 3;
    else if (method === 'romance') n.affinity += 4;
    else if (method === 'intimidation') {
      n.affinity -= 12;
      remember(n, 'was leaned on by Blackbird');
    } else remember(n, 'was talked into something by Blackbird');
    c.emit('influence', 'good', { ...data, variant: `${method}_ok` });
    return;
  }
  train(c, sk, 1);
  if (method === 'persuasion') n.affinity -= 1;
  else if (method === 'romance') n.affinity -= 2;
  else if (method === 'grifting') {
    n.affinity -= 10;
    remember(n, 'caught Blackbird lying');
  } else {
    n.affinity -= 8;
    remember(n, 'was threatened by Blackbird');
  }
  c.emit('influence', 'bad', { ...data, variant: `${method}_no` });
  // Frightening someone who won't be frightened: they may take it badly.
  if (method === 'intimidation' && rng.chance(0.15 + 0.35 * Math.max(0, traitOf(w, n, 'temper') + traitOf(w, n, 'courage') - 0.9))) {
    fight(c, [n], { cause: `leaning on ${n.name}`, assault: true });
  }
}

// ===================================================================== carrying it out

/** Once a beat: everyone carrying one of her errands gets on with it. */
export function influenceTick(c: Ctx): void {
  const { w } = c;
  if (!w.influenced?.length) return;
  const hero = w.hero.locationId;
  for (const id of [...w.influenced]) {
    const n = w.npcs[id];
    if (!n?.goals?.length) {
      w.influenced = w.influenced.filter((x) => x !== id);
      continue;
    }
    for (const g of [...n.goals]) {
      if (!n.alive || n.hostile) {
        finish(c, n, g, 'moot');
        continue;
      }
      if (w.beat >= g.until) {
        finish(c, n, g, 'lapsed');
        continue;
      }
      if (n.downUntil > w.beat) continue;
      const near = n.locationId === hero;
      if (g.kind === 'give_cash' && near) {
        const amount = Math.min(g.amount ?? 0, n.cash);
        n.cash -= amount;
        w.hero.cash += amount;
        c.emit('influence_pay', amount > 0 ? 'good' : 'mixed', { variant: g.method, npc: n.name, amount, method: g.method });
        finish(c, n, g, 'done');
      } else if (g.kind === 'spill' && near) {
        ensureDeep(w, n);
        const f = unknownFacts(w, n)[0];
        if (f) learn(c, n, f, 'asked');
        finish(c, n, g, f ? 'done' : 'moot');
      } else if (ERRAND_KINDS.has(g.kind)) {
        runErrand(c, n, g, alignment(w, n, g.kind));
      }
    }
  }
}

/** She is about to fight: whoever has her back is in it with her. */
export function backupJoins(c: Ctx, foes: Npc[]): void {
  const { w, rng } = c;
  for (const n of backers(w)) {
    if (foes.includes(n)) continue;
    const g = goalOf(n, 'back_me_up')!;
    n.hp = Math.max(1, n.hp - Math.round(n.maxHp * 0.2 * rng.next()));
    n.affinity += 2;
    c.emit('influence_backup', 'good', { npc: n.name, method: g.method, foe: foes[0]?.name ?? 'them' });
  }
}
