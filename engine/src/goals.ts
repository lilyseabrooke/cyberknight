import { enterStealth, exitStealth } from './stealth';
import type { Candidate } from './candidate';
import { clamp } from './candidate';
import type { AskOption, Calling, Ctx, DungeonKind, Goal, GoalKind, GoalSpec, Id, Location, Npc, Ware, World, GameEvent } from './types';
import { armBest, edge, rating } from './weapons';
import { ACT_SKILL } from './stage';
import { SPOTLIGHT_LINE, type Want } from './content/callings';
import { callingAfter, callingTargets, callingTick, spotlightFervor } from './callings';
import { SKILL_LABELS, skillLevel } from './skills';
import { dayOf } from './clock';
import { PLENTY_PARTS, knownBenches, lowOnParts, partsLeads } from './scavenge';
import { RECIPES, billText, canAfford, totalParts, type Bill, type Recipe } from './content/parts';
import { ITEMS, makeItem } from './content/items';
import { tinkerLevel } from './bench';
import { medPacks, wielded } from './arms';
import type { EventData } from './events';
import type { Trait } from './personality';
import { heroPower, here } from './combat';
import { flameOf } from './traits';
import { isFairGame } from './people';
import { buyGear, supplyUrge } from './supply';
import { heatUrge } from './laylow';
import { isClosed } from './hours';
import { dragonReadiness, pursuing, pursuitBias, pursuitTargets, pursuitTick } from './pursuit';
import { getImplant } from './extras';
import { possessive } from './mapgen';
import { dangerOf } from './grade';
import { estimatePressure, garrisonAlive, isEntrance, knownDungeons, pressure, raidPlan, tolerance, typicalPressure, type Lead } from './dungeons';
import { appraise, giverPlace, livePending, objectiveRoom, questReady } from './quests';
import { MAX_IMPLANTS } from './content/implants';
import { maybeAsk, waiting, type Proposal } from './advice';
import {
  MAX_DEPTH, capacity, childrenOf, cool, coolFor, cooling, depth, focusFactor, goalById, hasGoal, interest, isHeld, isLeaf, priority, subjectOf, topLevel,
} from './mind';
import {
  SPEND, SITES, appeal, expectedEarn, fenceValue, isSafeSpot, isSold, keeperOf, knownSites, learnEarning, owns, routeTo, safeSpot, shopStock,
  siteAt, totalHeat, wareCost, wealth, FAME_ACTS, FAME_FAMILIES, expectedFame, learnFame, type Site,
} from './plans';

/**
 * Blackbird's goals. She picks things she wants, works out what stands in the way, and lets the
 * wanting bend her choices without ever fully taking them over (it is still softmax, and she is
 * still easily distracted).
 *
 * How it plugs into the utility AI (see run.ts):
 *   mindTick   before she chooses: notice things, finish / give up / delay / rework goals, form
 *              new ones, and work out which goals are steering her this beat.
 *   goalBias   added to every candidate's score while she chooses (see `score` in run.ts).
 *   mindAfter  after she acts: learn what that earned, notice progress and setbacks.
 *
 * Goals nest. Only the innermost open goals steer her; the ones above them wait on them:
 *   flatline Skeeter -> find a better weapon -> buy the thermal katana -> raise 1,260
 *     -> rob the Helix vault (approach, loot, escape).
 */

type Verdict = { done: string } | { drop: string };

interface Kind {
  /** Desire lost per beat. */
  decay: number;
  /** Traits that make her hold on to this kind of goal. */
  stick: Trait[];
  /** Beats without progress before she starts getting frustrated. */
  patience: number;
  label(w: World, g: Goal): string;
  check(w: World, g: Goal): Verdict | null;
  plan(c: Ctx, g: Goal): void;
  /** Rework what she's after instead of quitting. Returns true if she did. */
  revise?(c: Ctx, g: Goal): boolean;
  /** Higher is nearer. Used to notice progress. */
  metric(w: World, g: Goal): number;
  /** Places this goal wants her to be, and how badly. */
  targets(w: World, g: Goal): { loc: Id; value: number }[];
  /** How much this goal wants `family` (aimed at `id`) right now. Raw strength; scaled by how hard the goal is steering. */
  bias(w: World, g: Goal, family: string, id: string | undefined): number;
}

// ===================================================================== helpers

const traits = (w: World) => w.hero.personality.traits;
const npcName = (w: World, id: string | undefined): string => (id && w.npcs[id]?.name) || 'someone';
const wareOf = (w: World, g: Goal) => (g.ware ? w.mind.wares[g.ware] : undefined);
const distTo = (w: World, to: Id): number => routeTo(w, w.hero.locationId, to)?.dist ?? 12;
const money = (n: number): string => Math.round(n).toLocaleString('en-US');
const hpFrac = (w: World): number => w.hero.hp / w.hero.maxHp;
/** Who a weapon goal is meant for, if anyone in particular. */
const foeOf = (w: World, g: Goal): Npc | undefined => (g.npc ? w.npcs[g.npc] : undefined);

/** Loud things. A hero trying to be quiet does not do these. */
const NOISY = new Set([
  'challenge', 'sweep', 'threaten', 'join_brawl', 'pickpocket', 'graffiti', 'karaoke', 'dj_set', 'gig', 'busk', 'serenade', 'jam', 'beatbox',
  'laser_tag', 'billboard', 'engage_flight', 'challenge_dragon', 'refuse_tithe', 'stand_ground', 'steal_puppy', 'rob_paint_shop', 'threaten_clerk', 'armwrestle', 'hijack',
]);
/** Things that look good to a girl who is watching. */
const IMPRESSIVE = new Set(['karaoke', 'dj_set', 'gig', 'busk', 'serenade', 'jam', 'beatbox', 'billboard', 'graffiti', 'laser_tag', 'darts', 'pool', 'parkour', 'mix_molotov', 'tend_bar', 'dancefloor', 'buy_round', 'engage_flight', 'challenge_dragon']);
const LOOT = new Set(['safe', 'vault', 'crates', 'till']);

// ---- crafting a weapon (the other way to get a better one than buying it)

const recipeOf = (g: Goal): Recipe | undefined => RECIPES.find((r) => r.item === g.ware);
const missingParts = (w: World, r: Recipe): Bill => Object.fromEntries(Object.entries(r.parts).map(([id, n]) => [id, Math.max(0, n - (w.hero.parts?.[id] ?? 0))]).filter(([, n]) => (n as number) > 0));

/** Weapons she could build, as things stand: she has the skill for it and knows a bench that is good enough. */
function craftable(w: World, foe: Npc | undefined, cur: number): { r: Recipe; rate: number }[] {
  const lvl = tinkerLevel(w.hero);
  const best = Math.max(0, ...knownBenches(w).map((b) => b.tier));
  return RECIPES.filter((r) => ITEMS[r.item]?.kind === 'weapon' && r.skill <= lvl && r.tier <= best)
    .map((r) => ({ r, rate: rating(makeItem(r.item), foe) }))
    .filter((x) => x.rate > cur + 0.5);
}

export function goalLabel(w: World, g: Goal): string {
  return KINDS[g.kind].label(w, g);
}

const goalData = (w: World, g: Goal, extra: EventData = {}): EventData => ({
  goal: goalLabel(w, g),
  kind: g.kind,
  why: g.why,
  nested: g.parent !== null,
  ...(g.npc ? { npc: npcName(w, g.npc) } : {}),
  ...(g.ware && w.mind.wares[g.ware] ? { item: w.mind.wares[g.ware]!.name } : {}),
  ...(g.loc && siteAt(g.loc) ? { place: siteAt(g.loc)!.label } : {}),
  ...((g.kind === 'raid' || g.kind === 'explore' || g.kind === 'scavenge') && g.loc && w.locations[g.loc] ? { place: w.locations[g.loc]!.name } : {}),
  ...(g.kind === 'quest' ? questData(w, g) : {}),
  ...extra,
});


/** What the log needs to tell a job: who wants it, what it is, where, and the pay. */
function questData(w: World, g: Goal): EventData {
  const q = g.npc ? w.npcs[g.npc]?.quest : undefined;
  if (!q) return {};
  return {
    place: w.locations[q.site]?.name ?? 'somewhere', what: q.what, qkind: q.kind, reward: q.reward, style: g.mode ?? 'approach',
    ...(q.kind === 'flatline' ? { target: q.what, target_g: q.targetGender ?? 'nonbinary' } : {}),
  };
}

/** The job, as she'd put it to herself. */
function questLabel(w: World, g: Goal): string {
  const giver = g.npc ? w.npcs[g.npc] : undefined;
  const q = giver?.quest;
  const name = giver?.name ?? 'someone';
  if (!q) return `do a job for ${name}`;
  if (g.mode === 'return') return `report back to ${name}`;
  return q.kind === 'flatline' ? `flatline ${q.what} for ${name}` : q.kind === 'retrieve' ? `get ${q.what} for ${name}` : `get into ${q.what} for ${name}`;
}

/** Quiet or loud, once she's through the door. A place she can't take on loud is one she sneaks through; otherwise it's her nature. */
function questStyle(c: Ctx, d: { kind: DungeonKind; tier: number }, kind: string, p: number): 'sneak' | 'clear' {
  const { w, rng } = c;
  const t = traits(w);
  if (p > tolerance(w)) return 'sneak';
  const loud = clamp(0.3 + 0.4 * (t.thrill - 0.5) + 0.4 * (t.courage - 0.5) + 0.3 * (t.temper - 0.5) + 0.3 * (t.justice - 0.5) + (kind === 'flatline' ? 0.1 : kind === 'hack' ? -0.15 : 0), 0.05, 0.85);
  return rng.chance(loud) ? 'clear' : 'sneak';
}

// ===================================================================== kinds

const KINDS: Record<GoalKind, Kind> = {
  // ------------------------------------------------------------------ buy
  buy: {
    decay: 0.003, stick: ['greed'], patience: 80,
    label: (w, g) => `buy ${wareOf(w, g)?.name ?? 'it'}`,
    check(w, g) {
      const ware = wareOf(w, g);
      if (!ware) return { drop: 'moot' };
      if (owns(w, ware)) return g.struck ? { done: 'bought' } : { drop: 'got_better' };
      if (ware.kind === 'implant' && w.hero.implants.length >= MAX_IMPLANTS) return { drop: 'impossible' };
      return null;
    },
    plan(c, g) {
      const { w, rng } = c;
      const ware = wareOf(w, g)!;
      const cost = wareCost(w, ware);
      const short = cost - w.hero.cash;
      // Somebody else gets there first. It happens to people who save up for a long time.
      if (short > 0 && w.beat - g.born > 50 && !isSold(w, ware.id) && rng.chance(0.012)) w.flags[`sold:${ware.id}`] = true;
      if (isSold(w, ware.id)) {
        const alt = alternative(w, ware);
        if (alt) {
          const from = ware.name;
          g.ware = alt.id;
          g.metric = KINDS.buy.metric(w, g);
          w.mind.tally.revised++;
          c.emit('goal_revise', 'mixed', goalData(w, g, { variant: 'sold_out', old: from, item: alt.name }));
        } else {
          end(c, g, 'drop', 'sold_out', { item: ware.name });
        }
        return;
      }
      const keeper = keeperOf(w, ware);
      if (!keeper?.alive) return end(c, g, 'drop', 'closed', { item: ware.name });
      const kid = childrenOf(w, g).find((k) => k.kind === 'cash');
      if (short > 0) {
        if (kid) kid.amount = cost;
        else adopt(c, { kind: 'cash', parent: g.id, amount: cost, why: `to buy ${ware.name}`, desire: g.desire * 0.95, variant: 'short', extra: { item: ware.name, short, price: cost, cash: w.hero.cash } });
      }
    },
    revise(c, g) {
      const { w } = c;
      const ware = wareOf(w, g)!;
      const alt = alternative(w, ware, 0.6);
      if (!alt) return false;
      const from = ware.name;
      g.ware = alt.id;
      g.metric = KINDS.buy.metric(w, g);
      w.mind.tally.revised++;
      for (const k of childrenOf(w, g)) k.frustration = 0;
      c.emit('goal_revise', 'mixed', goalData(w, g, { variant: 'cheaper', old: from, item: alt.name }));
      return true;
    },
    metric(w, g) {
      const ware = wareOf(w, g);
      if (!ware) return 0;
      const short = wareCost(w, ware) - w.hero.cash;
      return short > 0 ? -short - 12 : -distTo(w, ware.loc);
    },
    targets(w, g) {
      const ware = wareOf(w, g);
      if (!ware || wareCost(w, ware) > w.hero.cash) return [];
      return [{ loc: ware.loc, value: 3.6 }];
    },
    bias: (_w, g, fam, id) => (fam === 'buy_ware' && id === g.ware ? 6 : 0),
  },

  // ------------------------------------------------------------------ cash
  cash: {
    decay: 0.0025, stick: ['greed'], patience: 50,
    label: (_w, g) => (g.parent !== null ? `scrape together ${money(g.amount ?? 0)} neodollars` : `get rich (${money(g.amount ?? 0)} neodollars)`),
    check: (w, g) => (w.hero.cash >= (g.amount ?? 0) ? { done: 'raised' } : null),
    plan(c, g) {
      const { w, rng } = c;
      const h = w.hero;
      const short = (g.amount ?? 0) - h.cash;
      // Not many places to earn that she knows about? Go and find some.
      exploreFor(c, g, 0.012, () => knownSites(w).length + knownDungeons(w).length, 'there has to be money somewhere she has not looked', 'explore_cash');
      // Small change is a grind. A proper score is a plan. (Unless the lab said to keep it steady, or she's waiting to hear.)
      if (!isLeaf(w, g) || short < 120 || hpFrac(w) < 0.6 || hasGoal(w, 'heist') || hasGoal(w, 'raid') || waiting(w) || cooling(w, 'bigscore')) return;
      // Somebody's building full of gear is a quicker way to money than most.
      if (rng.chance(0.03 * raidAppetite(w) * (1 + short / 300))) {
        const lead = pickLead(c);
        if (lead) {
          if (maybeAsk(c, 'earn', () => earnAsk(w, g, { lead }))) return;
          return void startRaidGoal(c, lead, g, g.desire * 0.95, 'there is money in other people\'s buildings', 'raid_cash');
        }
      }
      const best = bestSite(w);
      if (!best) return;
      if (rng.chance(0.05 * heistAppetite(w) * (1 + short / 300))) {
        if (maybeAsk(c, 'earn', () => earnAsk(w, g, { site: best }))) return;
        startHeist(c, best, g, g.desire * 0.95, 'the quick way to money', 'heist');
      }
    },
    metric: (w) => w.hero.cash + 0.5 * fenceValue(w.hero),
    targets(w, g) {
      const chosen = pursuitTargets(w, g);
      if (chosen) return chosen;
      const spots = new Map<Id, number>();
      const add = (loc: Id | undefined, v: number) => {
        if (loc && v > 0) spots.set(loc, Math.max(spots.get(loc) ?? 0, v));
      };
      for (const f of Object.values(w.features)) {
        const loc = w.locations[f.locationId];
        if (!loc || loc.visits === 0 || loc.kind === 'corp' || loc.kind === 'boss') continue;
        add(f.locationId, earnPull(expectedEarn(w, f.kind)));
      }
      const fv = fenceValue(w.hero);
      if (fv >= 15 && w.npcs.madame?.alive) add(w.npcs.madame.locationId, earnPull(fv) * 1.25);
      const marks = new Map<Id, number>();
      for (const n of Object.values(w.npcs)) {
        if (!n.alive || n.hostile || n.tags.includes('robot') || n.cash < 20 || n.id.startsWith('tmp_')) continue;
        marks.set(n.locationId, (marks.get(n.locationId) ?? 0) + Math.min(n.cash, 120) * 0.55);
      }
      for (const [loc, e] of marks) if ((w.locations[loc]?.visits ?? 0) > 0 && !['corp', 'boss'].includes(w.locations[loc]!.kind)) add(loc, earnPull(Math.min(100, e)) * 0.7);
      return [...spots].map(([loc, value]) => ({ loc, value }));
    },
    bias(w, g, fam, id) {
      const e = expectedEarn(w, fam, id);
      // While she has a particular score in mind, other ways of making money are only opportunism.
      const generic = e <= 0 ? 0 : 1.8 * Math.log1p(e / 25) * (fam === 'fence' ? 1.3 : 1) * (pursuing(g) ? 0.35 : 1);
      return generic + pursuitBias(w, g, fam, id);
    },
  },

  // ------------------------------------------------------------------ weapon
  weapon: {
    decay: 0.003, stick: ['courage'], patience: 70,
    label: (w, g) => (g.npc && w.npcs[g.npc] ? `find something that works on ${w.npcs[g.npc]!.name}` : 'find a better weapon'),
    check(w, g) {
      return armBest(w.hero, foeOf(w, g)) >= (g.amount ?? 99) ? { done: 'armed' } : null;
    },
    plan(c, g) {
      const { w, rng } = c;
      if (!isLeaf(w, g)) return;
      const foe = foeOf(w, g);
      const cur = armBest(w.hero, foe);
      const rate = (x: Ware) => (x.item ? rating(x.item, foe) : x.power);
      const known = Object.values(w.mind.wares).filter((x) => x.kind === 'weapon' && !isSold(w, x.id) && rate(x) > cur + 0.5);
      // Or build one. Buying or building, she doesn't do both: whichever she started, she sees through.
      const kids = childrenOf(w, g);
      if (kids.some((k) => k.kind === 'craft')) return;
      if (!kids.some((k) => k.kind === 'buy')) {
        const can = craftable(w, foe, cur);
        if (can.length) {
          const t = traits(w);
          const cheapest = known.length ? Math.min(...known.map((x) => wareCost(w, x))) : Infinity;
          const broke = cheapest > w.hero.cash ? 0.25 : 0;
          const p = !known.length ? 1 : clamp(0.25 + 0.5 * (t.techy - 0.5) + 0.04 * tinkerLevel(w.hero) + broke, 0.1, 0.9);
          if (rng.chance(p)) {
            let pickR = can.filter((x) => x.rate >= (g.amount ?? 99)).sort((a, b) => Object.values(a.r.parts).reduce((s2, n) => s2 + n, 0) - Object.values(b.r.parts).reduce((s2, n) => s2 + n, 0))[0];
            if (!pickR) {
              pickR = [...can].sort((a, b) => b.rate - a.rate)[0]!;
              g.amount = pickR.rate;
              w.mind.tally.revised++;
              c.emit('goal_revise', 'mixed', goalData(w, g, { variant: 'lower_sights', item: ITEMS[pickR.r.item]!.name }));
            }
            adopt(c, { kind: 'craft', parent: g.id, ware: pickR.r.item, why: g.why, desire: g.desire, variant: 'want_craft', extra: { item: ITEMS[pickR.r.item]!.name, parts: billText(pickR.r.parts) } });
            return;
          }
        }
      }
      if (!known.length) {
        // She has stood in the shop and nothing in it beats what she's got. The shelf turns over; give it time, or take one off somebody.
        if (Object.values(w.mind.wares).some((x) => x.kind === 'weapon') && w.beat - g.born > 160) end(c, g, 'drop', 'nothing_better');
        return;
      }
      let pick = known.filter((x) => rate(x) >= (g.amount ?? 99)).sort((a, b) => a.price - b.price)[0];
      if (!pick) {
        pick = [...known].sort((a, b) => rate(b) - rate(a))[0]!;
        g.amount = rate(pick);
        w.mind.tally.revised++;
        c.emit('goal_revise', 'mixed', goalData(w, g, { variant: 'lower_sights', item: pick.name }));
      }
      adopt(c, { kind: 'buy', parent: g.id, ware: pick.id, why: g.why, desire: g.desire, variant: 'want_item', extra: { item: pick.name, price: wareCost(w, pick), cash: w.hero.cash, shop: w.locations[pick.loc]?.name ?? 'the shop', short: Math.max(0, wareCost(w, pick) - w.hero.cash) } });
    },
    metric: (w, g) => armBest(w.hero, foeOf(w, g)) * 10 + (Object.values(w.mind.wares).some((x) => x.kind === 'weapon') ? 1 : 0),
    targets(w) {
      // If she hasn't seen what the gun shop has, that's where to look.
      if (Object.values(w.mind.wares).some((x) => x.kind === 'weapon')) return [];
      return [{ loc: 'gun_shop', value: 2.4 }];
    },
    bias(w, g, fam, id) {
      // Or take one off somebody who has it.
      const n = id ? w.npcs[id] : undefined;
      if (!n || (fam !== 'pickpocket' && fam !== 'challenge')) return 0;
      const foe = foeOf(w, g);
      const have = armBest(w.hero, foe);
      const better = n.loadout.some((i) => i.kind === 'weapon' && rating(i, foe) >= have + 3);
      return better ? (fam === 'pickpocket' ? 2.2 : 1.0) : 0;
    },
  },

  // ------------------------------------------------------------------ kill
  kill: {
    decay: 0.0028, stick: ['grudge', 'temper'], patience: 60,
    label: (w, g) => (g.mode === 'beat_up' ? `teach ${npcName(w, g.npc)} a lesson` : `flatline ${npcName(w, g.npc)}`),
    check(w, g) {
      const n = g.npc ? w.npcs[g.npc] : undefined;
      if (!n) return { drop: 'moot' };
      if (!n.alive) return g.struck ? { done: 'kill' } : { drop: 'someone_else' };
      // Kills don't stick in a bar: they get knocked out and carried home. Close enough, says her pride.
      if (g.struck && n.downUntil > w.clock) return { done: g.mode === 'kill' ? 'settled' : 'beat_up' };
      return null;
    },
    plan(c, g) {
      const { w, rng } = c;
      const h = w.hero;
      const n = w.npcs[g.npc!]!;
      if (!isLeaf(w, g)) return;
      if (hpFrac(w) < 0.5) {
        delay(c, g, 40, 'hurt');
        return;
      }
      // Is he stronger than she is? A sharper hero asks before she swings. Anyone asks after the first beating.
      const noise = (((g.id * 37) % 21) - 10) / 10 * (1 - h.competence) * 0.35;
      const est = n.power * (1 + noise);
      const need = est - heroPower(w) * edge(wielded(h, [n]), n);
      const foresight = 0.08 + 0.5 * h.competence + (g.setbacks > 0 ? 0.5 : 0);
      // Having just sized him up and not liked it, she is far more inclined to go and get ready.
      const sized = g.pursuit?.verdict === 'prep';
      if (((need > 0 && rng.chance(foresight)) || (sized && need > -3 && rng.chance(0.5))) && !cooling(w, `prep:${n.id}`)) {
        const amount = Math.min(30, armBest(h, n) + Math.max(2, Math.ceil(need) + 1));
        if (amount > armBest(h, n)) {
          adopt(c, { kind: 'weapon', parent: g.id, npc: n.id, amount, why: `${n.name} hits harder than she does`, desire: g.desire, variant: 'prep', extra: { npc: n.name } });
        }
      }
    },
    revise(c, g) {
      if (g.mode !== 'kill') return false;
      g.mode = 'beat_up';
      g.desire = Math.min(g.desire, 0.8) * 0.9;
      c.w.mind.tally.revised++;
      c.emit('goal_revise', 'mixed', goalData(c.w, g, { variant: 'settle', npc: npcName(c.w, g.npc) }));
      return true;
    },
    metric(w, g) {
      const n = g.npc ? w.npcs[g.npc] : undefined;
      if (!n) return 0;
      const loc = w.mind.lastSeen[n.id];
      return -(loc ? distTo(w, loc) : 12) + (1 - n.hp / n.maxHp) * 6 + (g.struck ? 2 : 0);
    },
    targets: (w, g) => pursuitTargets(w, g) ?? [],
    bias: (w, g, fam, id) => pursuitBias(w, g, fam, id),
  },

  // ------------------------------------------------------------------ fame
  fame: {
    decay: 0.0028, stick: ['fame', 'vanity'], patience: 60,
    label: (_w, g) => (g.mode && SPOTLIGHT_LINE[g.mode] ? SPOTLIGHT_LINE[g.mode]! : `get famous (${g.amount ?? 0} fame)`),
    check: (w, g) => (w.hero.fame >= (g.amount ?? 0) ? { done: 'famous' } : null),
    plan(c, g) {
      const { w } = c;
      // An audience she has not met yet. Only a little helpful: fame is mostly about doing the act.
      exploreFor(c, g, 0.004, () => FAME_ACTS.filter((a) => a.venue(w)).length, 'a new crowd is a fresh crowd', 'explore_fame');
    },
    metric: (w) => w.hero.fame,
    targets(w, g) {
      const chosen = pursuitTargets(w, g);
      if (chosen) return chosen;
      const spots = new Map<Id, number>();
      for (const a of FAME_ACTS) {
        const loc = a.venue(w);
        if (loc) spots.set(loc, Math.max(spots.get(loc) ?? 0, Math.min(3, 1.2 * Math.log1p(expectedFame(w, a.fam) / 0.6))));
      }
      return [...spots].map(([loc, value]) => ({ loc, value }));
    },
    bias: (w, g, fam, id) => pursuitBias(w, g, fam, id),
  },

  // ------------------------------------------------------------------ dragons
  dragon: {
    decay: 0.0022, stick: ['courage', 'justice'], patience: 90,
    label: (_w, g) => (g.mode === 'apollo' ? 'slay the Apollo' : 'hunt cyberdragons'),
    check(w, g) {
      if (w.npcs.dragon && !w.npcs.dragon.alive) return { done: 'apollo' };
      if ((w.counters.dragon_kills ?? 0) >= (g.amount ?? 99)) return { done: 'slain' };
      return null;
    },
    plan(c, g) {
      const { w, rng } = c;
      const h = w.hero;
      if (!isLeaf(w, g)) return;
      if (hpFrac(w) < 0.5) {
        delay(c, g, 40, 'hurt');
        return;
      }
      // Dragons nest in places she has not been yet.
      exploreFor(c, g, 0.01, () => (w.counters.dragon_kills ?? 0) + knownDungeons(w).length, 'dragons do not wait in the places she already knows', 'explore_dragon');
      // Not ready for what she's after? A sharper head goes and gets something that works on dragons.
      const apollo = w.npcs.dragon;
      const ready = dragonReadiness(w, g);
      if (ready < 0.5 && apollo && !cooling(w, 'prep:dragon') && rng.chance(0.02 + 0.08 * h.competence)) {
        const have = armBest(h, apollo);
        adopt(c, { kind: 'weapon', parent: g.id, npc: apollo.id, amount: Math.min(32, have + 3), why: 'dragons do not care for tire irons', desire: g.desire, variant: 'prep', extra: { npc: 'Dragon plating' } });
        cool(w, 'prep:dragon', 60);
      }
    },
    metric: (w, g) => (w.counters.dragon_kills ?? 0) * 10 + dragonReadiness(w, g) * 5,
    targets: (w, g) => pursuitTargets(w, g) ?? [],
    bias: (w, g, fam, id) => pursuitBias(w, g, fam, id),
  },

  // ------------------------------------------------------------------ romance
  romance: {
    decay: 0.004, stick: ['romantic', 'impress'], patience: 90,
    label: (w, g) => `impress ${npcName(w, g.npc)}`,
    check(w, g) {
      const n = g.npc ? w.npcs[g.npc] : undefined;
      if (!n || !n.alive) return { drop: 'gone' };
      if (w.flags[`kissed:${n.id}`]) return { done: 'kiss' };
      if (n.affinity >= 40) return { done: 'smitten' };
      if (n.affinity <= -25) return { drop: 'cold' };
      const flame = flameOf(w);
      if (flame && flame.id !== n.id && traits(w).romantic > 0.65) return { drop: 'devoted' };
      return null;
    },
    plan() {},
    metric(w, g) {
      const n = g.npc ? w.npcs[g.npc] : undefined;
      const loc = n && w.mind.lastSeen[n.id];
      return (n?.affinity ?? 0) - (loc ? distTo(w, loc) * 2 : 20);
    },
    targets(w, g) {
      const loc = g.npc && w.mind.lastSeen[g.npc];
      return loc ? [{ loc, value: 1.9 }] : [];
    },
    bias(w, g, fam, id) {
      if (!here(w).some((n) => n.id === g.npc)) return 0;
      if (id === g.npc) {
        if (fam === 'kiss') return 3.6;
        if (fam === 'make_move') return 3.4;
        if (fam === 'flirt') return 3.0;
        if (fam === 'poach' || fam === 'reconcile') return 2.8;
        if (fam === 'pool_date' || fam === 'serve_dish') return 2.2;
      }
      if (fam === 'dancefloor') return 1.8;
      if (IMPRESSIVE.has(fam)) return 1.2;
      return 0;
    },
  },

  // ------------------------------------------------------------------ burgle
  // The trip is ordinary travel: the goal wants her at their door, the usual route-hopping takes her there, and the
  // engine reacts to whatever the streets do on the way. The job itself is the `burgle_home` hustle, offered at the door.
  burgle: {
    decay: 0.002, stick: ['greed', 'thrill'], patience: 40,
    label: (w, g) => `burgle ${possessive(npcName(w, g.npc))} place`,
    check(w, g) {
      const n = g.npc ? w.npcs[g.npc] : undefined;
      if (!n || !n.alive || !g.loc || !w.locations[g.loc]) return { drop: 'gone' };
      if (n.flags.includes('burgled')) return { done: 'burgled' };
      return null;
    },
    plan(c, g) {
      if (c.w.hero.locationId !== g.loc && hpFrac(c.w) < 0.5) delay(c, g, 40, 'hurt');
    },
    metric: (w, g) => 0 - distTo(w, g.loc!), // 0 - 0, not -0: a negative zero would not survive a save
    targets: (_w, g) => [{ loc: g.loc!, value: 3.2 }],
    bias(_w, g, fam, id) {
      if (fam === 'burgle_home') return id === g.npc ? 5 : 0;
      return NOISY.has(fam) ? -2.2 : 0;
    },
  },

  // ------------------------------------------------------------------ heist
  heist: {
    decay: 0.003, stick: ['thrill', 'greed'], patience: 45,
    label: (_w, g) => `rob ${siteAt(g.loc!)?.label ?? 'a place'}`,
    check(w, g) {
      const site = siteAt(g.loc!);
      if (!site || (site.feature === 'vault' && w.flags.vault_robbed && !g.looted)) return { drop: 'moot' };
      if (g.mode === 'escape' && w.hero.locationId !== g.loc && isSafeSpot(w, w.hero.locationId)) {
        if (g.looted) return { done: g.blown ? 'messy' : 'clean' };
        return { drop: 'aborted' };
      }
      return null;
    },
    plan(c, g) {
      const { w } = c;
      const h = w.hero;
      const site = siteAt(g.loc!)!;
      if (g.mode === 'approach' && h.locationId === g.loc) {
        g.mode = 'loot';
        g.lastProgress = w.beat;
        c.emit('goal_note', 'mixed', goalData(w, g, { variant: 'inside', place: site.label }));
      }
      if (g.mode === 'loot' && g.looted) {
        g.mode = 'escape';
        g.lastProgress = w.beat;
        c.emit('goal_note', 'good', goalData(w, g, { variant: 'haul', place: site.label }));
      }
      if (g.mode === 'approach' && hpFrac(w) < 0.5) delay(c, g, 40, 'hurt');
    },
    metric(w, g) {
      if (g.mode === 'escape') return 10 - (safeSpot(w, w.hero.locationId)?.dist ?? 6);
      if (g.mode === 'loot') return 1;
      return -distTo(w, g.loc!);
    },
    targets(w, g) {
      if (g.mode === 'approach') return [{ loc: g.loc!, value: 3.2 }];
      if (g.mode === 'escape') {
        const s = safeSpot(w, w.hero.locationId);
        return s ? [{ loc: s.loc, value: 3.6 }] : [];
      }
      return [];
    },
    bias(w, g, fam) {
      const site = siteAt(g.loc!);
      if (g.mode === 'loot') {
        if (fam === site?.feature) return 5;
        if (fam === 'go') return -1.2;
        return NOISY.has(fam) ? -2.2 : 0;
      }
      if (g.mode === 'escape') return LOOT.has(fam) ? -3 : NOISY.has(fam) ? -2 : 0;
      return NOISY.has(fam) ? -2.2 : 0;
    },
  },
  // ------------------------------------------------------------------ raid
  // An outpost or a hideout (dungeons.ts). She walks to the door, then works through the building room by room, taking
  // what she can: fights the people she thinks she can beat, opens what's lying about, walks past the rest. She leaves when
  // there is nothing left (it's cleared out, which makes the place a lot less interesting) or when everything that's
  // left looks like more than she can handle in the state she's in.
  raid: {
    decay: 0.0025, stick: ['thrill', 'greed'], patience: 70,
    label: (w, g) => `raid ${w.locations[g.loc!]?.name ?? 'a facility'}`,
    check(w, g) {
      const entrance = w.locations[g.loc!];
      if (!entrance) return { drop: 'gone' };
      if (w.locations[w.hero.locationId]?.dungeon === g.loc) return null;
      // She's out of the building.
      if (g.mode === 'out') return { done: 'cleared' };
      if (g.mode === 'retreat') return wealth(w.hero) - (g.amount ?? 0) >= 60 ? { done: 'spoils' } : { drop: 'outmatched' };
      const d = w.dungeons[g.loc!];
      // Somebody (or she, on the way out) has emptied it already.
      if (d && raidPlan(w, d).empty) return g.mode === 'approach' ? { drop: 'moot' } : { done: 'cleared' };
      return null;
    },
    plan(c, g) {
      const { w } = c;
      const h = w.hero;
      const entrance = w.locations[g.loc!];
      if (!entrance?.gen) return;
      const d = w.dungeons[g.loc!];
      const inside = w.locations[h.locationId]?.dungeon === g.loc;
      if (g.mode === 'approach') {
        if (inside) {
          g.mode = 'raid';
          g.lastProgress = w.beat;
          c.emit('goal_note', 'mixed', goalData(w, g, { variant: 'raid_in', dungeon: d?.kind ?? entrance.gen.role }));
          return;
        }
        if (hpFrac(w) < 0.5) return delay(c, g, 40, 'hurt');
        // A look at the place from the street, and a sharper head thinks twice.
        if (distTo(w, g.loc!) <= 2) {
          const p = d ? typicalPressure(w, d) : estimatePressure(w, entrance.gen.role as DungeonKind, entrance.gen.tier ?? 1, dangerOf(entrance));
          if (p > tolerance(w) * 1.15) end(c, g, 'drop', 'outmatched', { inside: false });
        }
        return;
      }
      if (!d || g.mode !== 'raid') return;
      if (!inside && hpFrac(w) < 0.5) return delay(c, g, 40, 'hurt');
      const rp = raidPlan(w, d);
      if (rp.empty) {
        g.mode = 'out';
        g.lastProgress = w.beat;
        c.emit('goal_note', 'good', goalData(w, g, { variant: 'raid_clear', dungeon: d.kind }));
        return;
      }
      const meds = medPacks(h).length > 0;
      const worn = hpFrac(w) < 0.22 + 0.25 * h.competence && !meds;
      if ((rp.blocked && !(meds && hpFrac(w) < 0.7)) || worn) {
        g.mode = 'retreat';
        g.lastProgress = w.beat;
        c.emit('goal_note', 'bad', goalData(w, g, { variant: 'raid_out', dungeon: d.kind, hurt: hpFrac(w) < 0.5 }));
      }
    },
    metric(w, g) {
      const entrance = w.locations[g.loc!];
      const d = w.dungeons[g.loc!];
      if (g.mode === 'out' || g.mode === 'retreat') return -distTo(w, entrance?.tossTo ?? g.loc!);
      if (!d || g.mode === 'approach') return -distTo(w, g.loc!);
      const visited = d.rooms.filter((r) => (w.locations[r.id]?.visits ?? 0) > 0).length;
      const taken = d.rooms.filter((r) => r.cache?.taken).length;
      const dead = d.garrison.filter((id) => !w.npcs[id]?.alive).length;
      return visited * 3 + taken * 10 + dead * 2;
    },
    targets(w, g) {
      const entrance = w.locations[g.loc!];
      const d = w.dungeons[g.loc!];
      if (g.mode === 'out' || g.mode === 'retreat') return entrance ? [{ loc: entrance.tossTo, value: 3.8 }] : [];
      if (g.mode === 'approach' || !d) return [{ loc: g.loc!, value: 3.2 }];
      return raidPlan(w, d).targets;
    },
    bias(w, g, fam, id) {
      if (g.mode === 'out' || g.mode === 'retreat') {
        if (fam === 'raid_loot') return g.mode === 'out' ? 0 : -3;
        if (fam === 'raid_ambush') return -4;
        return fam === 'use_med_pack' ? 1.2 : 0;
      }
      if (g.mode !== 'raid') return 0;
      if (fam === 'raid_loot') return 4.5;
      if (fam === 'use_med_pack') return hpFrac(w) < 0.7 ? 1.4 : 0;
      if (fam === 'raid_ambush') {
        // She picks the fights she thinks she can win.
        const d = w.dungeons[g.loc!];
        const foes = d && id ? garrisonAlive(w, d).filter((n) => n.locationId === id) : [];
        return clamp(2.6 * (1 - pressure(w, foes) / tolerance(w)), -2.5, 2.6);
      }
      return 0;
    },
  },
  // ------------------------------------------------------------------ explore
  // Somewhere she has never set foot. The trip is ordinary travel (the goal just wants her at the door); it ends the
  // moment she is through it. Mostly a step on the way to something else: new streets turn up doors worth kicking in,
  // new rooms turn up work, and new places turn up an audience.
  explore: {
    decay: 0.004, stick: ['curiosity', 'thrill'], patience: 40,
    label: (w, g) => `see what is at ${w.locations[g.loc!]?.name ?? 'the end of the street'}`,
    check(w, g) {
      const loc = g.loc ? w.locations[g.loc] : undefined;
      if (!loc) return { drop: 'moot' };
      if (loc.visits > 0) return { done: 'explored' };
      if (!routeTo(w, w.hero.locationId, loc.id)) return { drop: 'moot' };
      return null;
    },
    plan(c, g) {
      if (c.w.hero.locationId !== g.loc && hpFrac(c.w) < 0.5) delay(c, g, 40, 'hurt');
    },
    metric: (w, g) => 0 - distTo(w, g.loc!), // 0 - 0, not -0: a negative zero would not survive a save
    targets: (_w, g) => [{ loc: g.loc!, value: 2.8 }],
    bias: () => 0,
  },
  // ------------------------------------------------------------------ craft
  // Build a weapon at a bench (bench.ts). If she hasn't the parts, getting them is a step of its own: a trip to somewhere that
  // has them lying about (the scavenge goal below). Once she has them, she wants to be at a bench she knows, and the way in is
  // whichever she fancies.
  craft: {
    decay: 0.003, stick: ['techy', 'greed'], patience: 90,
    label: (_w, g) => `build ${ITEMS[g.ware ?? '']?.name ?? 'something'}`,
    check(w, g) {
      const r = recipeOf(g);
      if (!r) return { drop: 'moot' };
      const h = w.hero;
      if ([h.weapon, ...h.inventory].some((i) => i.id === r.item && i.tags.includes('homemade'))) return { done: 'built' };
      if (r.skill > tinkerLevel(h)) return { drop: 'impossible' };
      if (!knownBenches(w).some((b) => b.tier >= r.tier)) return { drop: 'nowhere' };
      return null;
    },
    plan(c, g) {
      const { w, rng } = c;
      const r = recipeOf(g);
      if (!r) return;
      const short = missingParts(w, r);
      const kid = childrenOf(w, g).find((k) => k.kind === 'scavenge');
      if (Object.keys(short).length === 0) return;
      if (kid || hpFrac(w) < 0.5) return;
      const leads = partsLeads(w).filter((l) => !hasGoal(w, 'scavenge', l.id) && !cooling(w, `scavenge:${l.id}`));
      if (leads.length) {
        const l = rng.weighted(leads, (x) => x.rich / (2 + distTo(w, x.id)));
        adopt(c, { kind: 'scavenge', parent: g.id, loc: l.id, why: `to build ${ITEMS[r.item]!.name}`, desire: g.desire * 0.95, variant: 'for_craft', extra: { place: w.locations[l.id]!.name, item: ITEMS[r.item]!.name, parts: billText(short) } });
      } else {
        exploreFor(c, g, 0.02, () => 0, 'she needs parts and does not know where they are lying', 'explore_parts');
      }
    },
    metric(w, g) {
      const r = recipeOf(g);
      if (!r) return 0;
      const miss = Object.values(missingParts(w, r)).reduce((s2, n) => s2 + n, 0);
      if (miss > 0) return -miss * 4 - 20;
      const near = Math.min(12, ...knownBenches(w).filter((b) => b.tier >= r.tier).map((b) => distTo(w, b.id)));
      return -near;
    },
    targets(w, g) {
      const r = recipeOf(g);
      if (!r || !canAfford(w.hero.parts, r.parts)) return [];
      return knownBenches(w).filter((b) => b.tier >= r.tier).map((b) => ({ loc: b.id, value: 3.4 }));
    },
    bias(w, g, fam, id) {
      const r = recipeOf(g);
      if (!r || !canAfford(w.hero.parts, r.parts)) return 0;
      if (fam === 'benchcraft' && id === r.item) return 6;
      // Getting through the door is a means to the bench.
      if (fam === 'chopin') return 1.2;
      return 0;
    },
  },
  // ------------------------------------------------------------------ scavenge
  // Low on parts. A scrap camp, a drone boneyard, a stripped car with nobody minding it: free for the taking (scavenge.ts). The
  // trip is ordinary travel; the goal ends when she has been through the place, or has all she needs, or somebody takes it over.
  scavenge: {
    decay: 0.0016, stick: ['greed', 'techy'], patience: 70,
    label: (w, g) => `strip ${w.locations[g.loc!]?.name ?? 'somewhere'} for parts`,
    check(w, g) {
      const loc = g.loc ? w.locations[g.loc] : undefined;
      if (!loc) return { drop: 'moot' };
      const last = w.counters[`scav:${loc.id}`];
      if (last !== undefined && dayOf(w.clock) - last <= 0) return { done: 'scavenged' };
      const parent = goalById(w, g.parent);
      const want = parent?.kind === 'craft' ? recipeOf(parent) : undefined;
      if (want && canAfford(w.hero.parts, want.parts)) return { done: 'stocked' };
      if (totalParts(w.hero.parts) >= PLENTY_PARTS) return { drop: 'moot' };
      const d = w.dungeons[loc.id];
      if (d && garrisonAlive(w, d).length && w.hero.locationId !== loc.id) return { drop: 'moot' };
      if (!routeTo(w, w.hero.locationId, loc.id)) return { drop: 'moot' };
      return null;
    },
    plan(c, g) {
      if (c.w.hero.locationId !== g.loc && hpFrac(c.w) < 0.5) delay(c, g, 40, 'hurt');
    },
    metric: (w, g) => -distTo(w, g.loc!),
    targets: (_w, g) => [{ loc: g.loc!, value: 2.8 }],
    bias: () => 0,
  },
  // ------------------------------------------------------------------ quest
  // A job for somebody (quests.ts). The trip there is ordinary travel; inside, she goes about it quietly or loudly: sneaking
  // straight for the room that matters, or clearing the place out on the way. Once the job is done she wants to find whoever
  // asked, wherever they have got to.
  quest: {
    decay: 0.0016, stick: ['loyalty', 'greed', 'courage'], patience: 120,
    label: (w, g) => questLabel(w, g),
    check(w, g) {
      const giver = g.npc ? w.npcs[g.npc] : undefined;
      const q = giver?.quest;
      if (!giver || !giver.alive || !q || q.site !== g.loc) return { drop: 'gone' };
      if (q.state === 'done') return { done: 'quest' };
      if (q.state === 'failed') return { drop: 'quest_failed' };
      return null;
    },
    plan(c, g) {
      const { w } = c;
      const h = w.hero;
      const giver = w.npcs[g.npc!]!;
      const q = giver.quest!;
      const entrance = w.locations[g.loc!];
      if (!entrance?.gen) return;
      const d = w.dungeons[g.loc!];
      const inside = w.locations[h.locationId]?.dungeon === g.loc;
      // It's done. Now to say so.
      if (g.mode !== 'return' && questReady(w, giver)) {
        q.state = 'ready';
        g.mode = 'return';
        g.lastProgress = w.beat;
        c.emit('goal_note', 'good', goalData(w, g, { variant: 'quest_ready' }));
        return;
      }
      if (g.mode === 'return') return;
      const pressureNow = (): number => (d ? typicalPressure(w, d) : estimatePressure(w, entrance.gen!.role as DungeonKind, entrance.gen!.tier ?? 1, dangerOf(entrance)));
      if (!inside) {
        // Out of the building and hurt: patch up first, then back to it.
        if (g.mode === 'retreat') {
          g.mode = 'approach';
          return delay(c, g, 40, 'hurt');
        }
        g.mode = 'approach';
        if (hpFrac(w) < 0.5) return delay(c, g, 40, 'hurt');
        // A look at the place from the street, and a sharper head thinks twice.
        if (distTo(w, g.loc!) <= 2 && pressureNow() > tolerance(w) * 1.5) end(c, g, 'drop', 'outmatched', { inside: false });
        return;
      }
      if (!d) return;
      if (g.mode === 'approach' || g.mode === 'retreat' || g.mode === undefined) {
        g.mode = questStyle(c, d, q.kind, pressureNow());
        if (g.mode === 'sneak') enterStealth(c); // quiet means quiet
        g.lastProgress = w.beat;
        if (!g.entered) c.emit('goal_note', 'mixed', goalData(w, g, { variant: 'quest_in', dungeon: d.kind }));
        g.entered = true;
        return;
      }
      // Quiet, and it has gone loud: no point being shy now.
      if (g.mode === 'sneak' && d.alert >= 2) {
        g.mode = 'clear';
        exitStealth(c, 'noisy');
        c.emit('goal_note', 'bad', goalData(w, g, { variant: 'quest_blown', dungeon: d.kind }));
        return;
      }
      const meds = medPacks(h).length > 0;
      if (hpFrac(w) < 0.22 + 0.25 * h.competence && !meds) {
        g.mode = 'retreat';
        g.lastProgress = w.beat;
        c.emit('goal_note', 'bad', goalData(w, g, { variant: 'quest_retreat', dungeon: d.kind }));
      }
    },
    metric(w, g) {
      const giver = g.npc ? w.npcs[g.npc] : undefined;
      const entrance = w.locations[g.loc!];
      if (g.mode === 'return') return 40 - (giver ? distTo(w, giverPlace(w, giver)) : 12);
      if (g.mode === 'retreat') return -distTo(w, entrance?.tossTo ?? g.loc!);
      const d = w.dungeons[g.loc!];
      if (!d || g.mode === 'approach') return -distTo(w, g.loc!);
      const visited = d.rooms.filter((r) => (w.locations[r.id]?.visits ?? 0) > 0).length;
      const dead = d.garrison.filter((id) => !w.npcs[id]?.alive).length;
      return 5 + visited * 2 + dead;
    },
    targets(w, g) {
      const giver = g.npc ? w.npcs[g.npc] : undefined;
      const q = giver?.quest;
      if (!giver || !q) return [];
      if (g.mode === 'return') return [{ loc: giverPlace(w, giver), value: 3.8 }];
      const entrance = w.locations[g.loc!];
      if (g.mode === 'retreat') return entrance ? [{ loc: entrance.tossTo, value: 3.8 }] : [];
      const d = w.dungeons[g.loc!];
      if (!d || g.mode === 'approach') return [{ loc: g.loc!, value: 3.4 }];
      const room = objectiveRoom(w, q);
      const out = room ? [{ loc: room, value: 3.6 }] : [];
      if (g.mode === 'clear') for (const t of raidPlan(w, d).targets) if (t.loc !== room) out.push(t);
      return out;
    },
    bias(w, g, fam, id) {
      const giver = g.npc ? w.npcs[g.npc] : undefined;
      const q = giver?.quest;
      if (!giver || !q) return 0;
      if (g.mode === 'return') {
        if (fam === 'turn_in_quest') return id === g.npc ? 7 : 0;
        return fam === 'raid_ambush' ? -3 : NOISY.has(fam) ? -1.5 : 0;
      }
      if (g.mode === 'retreat') {
        if (fam === 'raid_loot') return -3;
        if (fam === 'raid_ambush') return -4;
        return fam === 'use_med_pack' ? 1.2 : 0;
      }
      if (g.mode === 'approach') return NOISY.has(fam) ? -1 : 0;
      const room = objectiveRoom(w, q);
      if (fam === 'quest_take' || fam === 'quest_hack') return id === room ? 6.5 : 0;
      if (fam === 'use_med_pack') return hpFrac(w) < 0.7 ? 1.4 : 0;
      if (fam === 'raid_ambush') {
        // The one she came for is worth a fight, however she's going about it.
        if (q.kind === 'flatline' && id === room) return 5.5;
        if (g.mode === 'sneak') return -3.5;
        const d = w.dungeons[g.loc!];
        const foes = d && id ? garrisonAlive(w, d).filter((n) => n.locationId === id) : [];
        return clamp(2.6 * (1 - pressure(w, foes) / tolerance(w)), -2.5, 2.6);
      }
      if (fam === 'raid_loot') return g.mode === 'clear' ? 3 : 0.5;
      return g.mode === 'sneak' && NOISY.has(fam) ? -2.2 : 0;
    },
  },
};

/** Places she has never been that she could walk to: streets and rooms, not other people's homes, dungeons or corp floors. */
function unexplored(w: World): Location[] {
  return Object.values(w.locations).filter((l) => l.visits === 0 && !l.dungeon && !['home', 'corp', 'boss', 'lair'].includes(l.kind) && !isClosed(w, l.id) && !hasGoal(w, 'explore', l.id));
}

/** A new place worth the walk: the nearer the better, streets (which turn up doors) a bit better still. */
function pickUnexplored(c: Ctx): Location | undefined {
  const near = unexplored(c.w)
    .map((l) => ({ l, d: routeTo(c.w, c.w.hero.locationId, l.id)?.dist }))
    .filter((e): e is { l: Location; d: number } => e.d !== undefined && e.d <= 10);
  return near.length ? c.rng.weighted(near, (e) => (e.l.kind === 'street' ? 1.5 : 1) / (2 + e.d)).l : undefined;
}

/**
 * Exploring as a step toward something bigger. `rate` is the per-beat chance when she knows nothing useful; the thinner what
 * she knows (`known`: how many leads she has), the likelier she is to go and look. Cools off after each trip.
 */
function exploreFor(c: Ctx, parent: Goal, rate: number, known: () => number, why: string, variant: string): void {
  const { w, rng } = c;
  if (!isLeaf(w, parent) || hpFrac(w) < 0.6 || cooling(w, 'explore_step') || !rng.chance(rate)) return;
  const thin = 1 / (1 + known());
  if (!rng.chance(0.25 + 0.75 * thin)) return;
  const l = pickUnexplored(c);
  if (!l) return;
  cool(w, 'explore_step', 80);
  adopt(c, { kind: 'explore', parent: parent.id, loc: l.id, why, desire: parent.desire * 0.9, variant, extra: { place: l.name } });
}

/** She sets out to rob somebody's home. The goal does the walking; see `burgle` above. */
export function startBurglary(c: Ctx, n: Npc, home: Location, extra: EventData = {}): Goal | null {
  const g = adopt(c, { kind: 'burgle', loc: home.id, npc: n.id, why: 'she knows where the money sleeps', desire: 0.7, variant: 'burgle', extra: { npc: n.name, home: home.name, ...extra } });
  if (!g) cool(c.w, `burgle:${n.id}`, 40);
  return g;
}

/** Is she already on her way to this one (or has she just been told no)? */
export const burglaryPending = (w: World, npcId: Id): boolean => hasGoal(w, 'burgle', npcId) || cooling(w, `burgle:${npcId}`);

const earnPull = (e: number): number => 1.2 * Math.log1p(e / 25);

/** How much of a thief she is, 0.1..1.5. Honest girls don't plan robberies. */
function heistAppetite(w: World): number {
  const t = traits(w);
  return clamp(0.4 + 0.9 * ((t.thrill - 0.5) * 0.5 + (t.greed - 0.5) * 0.5 - (t.honesty - 0.5) * 0.9) * 2, 0.1, 1.5);
}

/** How much of a raider she is, 0.2..1.8. The cautious and the content leave other people's buildings alone. */
function raidAppetite(w: World): number {
  const t = traits(w);
  return clamp(0.7 + 1.6 * ((t.thrill - 0.5) * 0.3 + (t.greed - 0.5) * 0.3 + (t.courage - 0.5) * 0.25 + (t.justice - 0.5) * 0.15), 0.2, 1.8);
}

const raidWhy = (kind: DungeonKind): string => (kind === 'outpost' ? 'Atlas has it coming' : kind === 'spot' ? 'it is right there and it looks like money' : 'somebody ought to clear that place out');

/** A place she has seen the door of and fancies her chances in, picked by what's in it and how far off it is. */
function pickLead(c: Ctx): Lead | undefined {
  const { w, rng } = c;
  const leads = knownDungeons(w).filter((l) => !cooling(w, `raid:${l.entrance.id}`) && !hasGoal(w, 'raid', l.entrance.id));
  return leads.length ? rng.weighted(leads, (l) => l.appeal / (2 + distTo(w, l.entrance.id))) : undefined;
}

const raidSpec = (w: World, lead: Lead, parent: Goal | null, desire: number, why: string, variant: string): Spec => ({
  kind: 'raid', parent: parent?.id ?? null, loc: lead.entrance.id, mode: 'approach', why, desire, variant,
  extra: { place: lead.entrance.name, dungeon: lead.kind, tier: lead.tier, short: parent ? Math.max(0, (parent.amount ?? 0) - w.hero.cash) : 0 },
});

function startRaidGoal(c: Ctx, lead: Lead, parent: Goal | null, desire: number, why: string, variant: string): Goal | null {
  return adoptSpec(c, raidSpec(c.w, lead, parent, desire, why, variant));
}

/** Take on a goal from its plain-data spec, and set up what a heist or a raid keeps track of. Also how a goal is adopted once the lab has answered. */
export function adoptSpec(c: Ctx, s: Spec): Goal | null {
  const g = adopt(c, s);
  if (g?.kind === 'raid' && g.amount === undefined) g.amount = Math.round(wealth(c.w.hero));
  if (g?.kind === 'heist' && g.heat0 === undefined) {
    g.heat0 = totalHeat(c.w);
    g.amount = Math.round(wealth(c.w.hero));
  }
  return g;
}

/** She has walked into a dungeon, however she came to be there, and from here on she's raiding it. */
export function startRaid(c: Ctx, d: { id: Id; name: string; kind: string; tier: number }, variant: string): void {
  const { w } = c;
  const have = w.mind.goals.find((g) => g.kind === 'raid' && g.loc === d.id);
  if (have) {
    if (have.mode === 'approach') have.mode = 'raid';
    return;
  }
  // A job that brought her here goes about the place its own way.
  if (w.mind.goals.some((g) => g.kind === 'quest' && g.loc === d.id)) return;
  if (cooling(w, `raid:${d.id}`) || hpFrac(w) < 0.4) return;
  const g = adopt(c, { kind: 'raid', loc: d.id, mode: 'raid', why: 'she is already in the door', desire: 0.7, variant, extra: { place: d.name, dungeon: d.kind, tier: d.tier } });
  if (g) g.amount = Math.round(wealth(w.hero));
}

/** The next-best thing: cheaper than `ware` by `ratio`, same sort of thing. */
function alternative(w: World, ware: { id: string; kind: string; price: number }, ratio = 0.9) {
  return Object.values(w.mind.wares)
    .filter((x) => x.id !== ware.id && x.kind === ware.kind && !isSold(w, x.id) && !owns(w, x) && x.price <= ware.price * ratio && appeal(w, x) > 0)
    .sort((a, b) => appeal(w, b) - appeal(w, a))[0];
}

// ===================================================================== asking the lab

const richness = (l: Lead): string => (l.appeal >= 1.2 ? 'rich pickings' : l.appeal >= 0.6 ? 'a decent take' : 'slim pickings');
const doorHint = (l: Lead): string => `tier ${l.tier}, ${richness(l)}`;

/** A door she could kick in: clear it out, or leave it. `lean` is what she does if the lab says nothing. */
function raidAsk(lead: Lead, spec: Spec, lean: 'clear' | 'leave', near: boolean): Proposal {
  const place = lead.entrance.name;
  const question = lead.kind === 'outpost' ? `There's an Atlas outpost at ${place}. Clear it out?` : lead.kind === 'hideout' ? `There's a ganger hideout at ${place}. Clear it out?` : `${place} looks like money. Worth a look?`;
  return {
    question, lean,
    options: [
      { id: 'clear', label: lead.kind === 'spot' ? `Go through ${place}` : `Clear out ${place}`, hint: doorHint(lead), spec },
      { id: 'leave', label: 'Leave it', hint: 'not worth the trouble', cool: { [`raid:${lead.entrance.id}`]: 360 } },
    ],
    data: { place, dungeon: lead.kind, tier: lead.tier, near },
  };
}

/** Something in a window she can't pay for yet: save for it, or forget it. She has usually made up her mind already. */
function wantAsk(x: Ware, spec: Spec, cost: number, cash: number, shop: string): Proposal {
  const short = Math.max(0, cost - cash);
  return {
    question: `The ${x.name} is ${money(cost)} and I'm ${money(short)} short. Save up for it?`, lean: 'save',
    options: [
      { id: 'save', label: `Save up for the ${x.name}`, hint: `${money(short)} to find`, spec },
      { id: 'skip', label: 'Forget it', hint: 'walk away from the glass', cool: { [`buy:${x.id}`]: 450 } },
    ],
    data: { item: x.name, price: cost, cash, short, shop, implant: x.kind === 'implant' },
  };
}

/** The best door she knows of, by what's in it over how far off it is. No dice, so asking about one doesn't change which she'd pick. */
function bestLead(w: World): Lead | undefined {
  return knownDungeons(w)
    .filter((l) => !cooling(w, `raid:${l.entrance.id}`) && !hasGoal(w, 'raid', l.entrance.id))
    .sort((a, b) => b.appeal / (2 + distTo(w, b.entrance.id)) - a.appeal / (2 + distTo(w, a.entrance.id)))[0];
}

function bestSite(w: World): Site | undefined {
  return knownSites(w)
    .filter((s) => !cooling(w, `heist:${s.loc}`))
    .sort((a, b) => b.value / (2 + distTo(w, b.loc)) - a.value / (2 + distTo(w, a.loc)))[0];
}

/** Still short, and she's about to go for a big score. The lab can point her at a different one, or at the steady grind. */
function earnAsk(w: World, g: Goal, pick: { lead?: Lead; site?: Site }): Proposal {
  const short = Math.max(0, (g.amount ?? 0) - w.hero.cash);
  const lead = pick.lead ?? bestLead(w);
  const site = pick.site ?? bestSite(w);
  const options: AskOption[] = [];
  if (lead) options.push({ id: 'raid', label: `Raid ${lead.entrance.name}`, hint: doorHint(lead), spec: raidSpec(w, lead, g, g.desire * 0.95, "there is money in other people's buildings", 'raid_cash') });
  if (site) options.push({ id: 'heist', label: `Rob ${site.label}`, hint: 'quiet, if she manages it', spec: heistSpec(w, site, g, g.desire * 0.95, 'the quick way to money', 'heist') });
  options.push({ id: 'steady', label: 'Odd jobs and bounties', hint: 'slow, and nobody shoots at her', cool: { bigscore: 450 } });
  const place = lead ? lead.entrance.name : site?.label ?? 'somewhere';
  return {
    question: lead && site ? `I'm ${money(short)} short. Raid ${lead.entrance.name}, rob ${site.label}, or work the street?` : `I'm ${money(short)} short. Go big at ${place}, or work the street?`,
    options, lean: pick.lead ? 'raid' : 'heist', about: g.id, data: { short, place },
  };
}

// ===================================================================== lifecycle

type Spec = GoalSpec;

/** Take on a new goal, if she has room (or if it beats the weakest thing she's already juggling). */
/** She takes on someone's score as her own. */
export function adoptContract(c: Ctx, targetId: string, mode: 'kill' | 'beat_up', why: string, desire: number): Goal | null {
  const t = c.w.npcs[targetId];
  if (!t) return null;
  return adopt(c, { kind: 'kill', npc: targetId, mode, why, desire, variant: 'contract', extra: { npc: t.name } });
}

/** She takes a job on as a goal, if she has room for it. */
export function startQuestGoal(c: Ctx, giver: Npc, desire: number, variant: string): Goal | null {
  const q = giver.quest;
  if (!q) return null;
  return adopt(c, { kind: 'quest', npc: giver.id, loc: q.site, mode: 'approach', why: `${giver.name} is paying ${money(q.reward)}`, desire, variant, extra: { reward: q.reward } });
}

function adopt(c: Ctx, s: Spec): Goal | null {
  const { w, rng } = c;
  const m = w.mind;
  const parent = goalById(w, s.parent ?? null);
  const subject = s.npc ?? s.ware ?? s.loc ?? '';
  const same = m.goals.find((g) => g.kind === s.kind && g.parent === (parent?.id ?? null) && (s.kind === 'cash' || subjectOf(g) === subject));
  if (same) {
    same.desire = Math.max(same.desire, s.desire);
    if (s.calling) same.calling = true;
    return same;
  }
  // She doesn't want the same thing twice. If a wish for it is already floating around loose, that wish becomes the step.
  const wish = s.kind === 'buy' ? m.goals.find((g) => g.kind === 'buy' && g.ware === s.ware) : undefined;
  if (wish && parent) {
    if (wish.parent === null && !descendants(w, wish).includes(parent)) wish.parent = parent.id;
    wish.desire = Math.max(wish.desire, s.desire);
    return wish;
  }
  if (parent) {
    if (depth(w, parent) + 1 >= MAX_DEPTH) return null;
  } else {
    if (cooling(w, `${s.kind}:${subject || s.amount}`)) return null;
    const top = topLevel(w);
    if (top.length >= capacity(w)) {
      const weakest = weakestOf(w, top);
      if (s.desire < priority(w, weakest) + 0.12) {
        if (rng.chance(0.2)) c.emit('goal_pass', 'mixed', { variant: 'full', goal: label(w, s), count: top.length });
        return null;
      }
      end(c, weakest, 'drop', 'overloaded', { replacement: label(w, s) });
    }
  }
  const g: Goal = {
    id: m.nextId++, kind: s.kind, parent: parent?.id ?? null, npc: s.npc, ware: s.ware, loc: s.loc, amount: s.amount, mode: s.mode,
    why: s.why, desire: clamp(s.desire, 0.1, 1), frustration: 0, born: w.beat, lastProgress: w.beat, metric: 0, delayUntil: 0, setbacks: 0,
    revisions: 0, lastFocus: 0, ...(s.calling ? { calling: true } : {}),
  };
  g.metric = KINDS[g.kind].metric(w, g);
  m.goals.push(g);
  // A job she'd been keeping in mind is a goal now.
  if (g.kind === 'quest' && m.quests) m.quests = m.quests.filter((id) => id !== g.npc);
  c.emit('goal_new', 'mixed', goalData(w, g, { variant: s.variant, ...s.extra }));
  return g;
}

const label = (w: World, s: Spec): string =>
  KINDS[s.kind].label(w, { ...s, id: 0, parent: null, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });

const heistSpec = (w: World, site: Site, parent: Goal | null, desire: number, why: string, variant: string): Spec => ({
  kind: 'heist', parent: parent?.id ?? null, loc: site.loc, mode: 'approach', why, desire, variant,
  extra: { place: site.label, short: parent ? Math.max(0, (parent.amount ?? 0) - w.hero.cash) : 0 },
});

function startHeist(c: Ctx, site: Site, parent: Goal | null, desire: number, why: string, variant: string): Goal | null {
  return adoptSpec(c, heistSpec(c.w, site, parent, desire, why, variant));
}

function descendants(w: World, g: Goal): Goal[] {
  const out: Goal[] = [];
  for (const k of childrenOf(w, g)) out.push(k, ...descendants(w, k));
  return out;
}

/** A goal ends: finished, or given up on. Everything that was only in service of it goes with it. */
function end(c: Ctx, g: Goal, how: 'done' | 'drop', variant: string, extra: EventData = {}): void {
  const { w } = c;
  const m = w.mind;
  const outcome = how === 'done' ? 'good' : variant === 'frustrated' || variant === 'cold' ? 'bad' : 'mixed';
  c.emit(how === 'done' ? 'goal_done' : 'goal_drop', outcome, goalData(w, g, { variant, ...extra, ...((g.kind === 'heist' || g.kind === 'raid') && how === 'done' ? { haul: Math.round(wealth(w.hero) - (g.amount ?? 0)) } : {}) }));
  const gone = new Set([g.id, ...descendants(w, g).map((x) => x.id)]);
  m.goals = m.goals.filter((x) => !gone.has(x.id));
  if (m.focus !== null && gone.has(m.focus)) m.focus = null;
  coolFor(w, `${g.kind}:${subjectOf(g)}`, how === 'done' ? 660 : variant === 'overloaded' ? 120 : 270);
  // She still has the job, even if she's put it down for now. (And a place that looked like too much from the street still does.)
  if (g.kind === 'quest' && variant === 'outmatched') coolFor(w, `quest:${subjectOf(g)}`, 720);
  if (g.kind === 'quest' && how === 'drop' && g.npc && w.npcs[g.npc]?.quest && !['gone', 'quest_failed'].includes(variant) && !(m.quests ??= []).includes(g.npc)) m.quests.push(g.npc);
  if (g.kind === 'heist' && how === 'drop') coolFor(w, `heist:${g.loc}`, 360);
  if (g.kind === 'raid' && how === 'drop') coolFor(w, `raid:${g.loc}`, variant === 'outmatched' ? 480 : 360);
  if (how === 'done') m.tally.done++;
  else m.tally.dropped++;
  const parent = goalById(w, g.parent);
  if (!parent) return;
  if (how === 'done') {
    parent.lastProgress = w.beat;
    parent.frustration = Math.max(0, parent.frustration - 0.15);
    parent.desire = Math.min(1, parent.desire + 0.05);
  } else {
    parent.frustration = Math.min(1, parent.frustration + 0.25);
    parent.setbacks++;
    if (g.kind === 'weapon' && parent.kind === 'kill') coolFor(w, `prep:${parent.npc}`, 360);
  }
}

/** Put it off. Not the same as giving up: she'll be back. */
function delay(c: Ctx, g: Goal, beats: number, why: string): void {
  const { w } = c;
  g.delayUntil = w.beat + beats;
  g.delayWhy = why;
  w.mind.tally.delayed++;
  c.emit('goal_delay', 'mixed', goalData(w, g, { variant: why }));
}

function review(c: Ctx, g: Goal): void {
  const { w } = c;
  const kind = KINDS[g.kind];
  // Hurt goals wait for her to heal, not just for time to pass.
  if (g.delayUntil && g.delayWhy === 'hurt' && w.beat >= g.delayUntil && hpFrac(w) < 0.5) g.delayUntil = w.beat + 20;
  if (g.delayUntil && (w.beat >= g.delayUntil || (g.delayWhy === 'hurt' && hpFrac(w) >= 0.75))) {
    g.delayUntil = 0;
    g.lastProgress = w.beat;
    c.emit('goal_wake', 'mixed', goalData(w, g, { variant: g.delayWhy ?? 'later' }));
  }
  const verdict = kind.check(w, g);
  if (verdict) {
    if ('done' in verdict) end(c, g, 'done', verdict.done);
    else end(c, g, 'drop', verdict.drop);
    return;
  }
  if (g.delayUntil > w.beat) return;
  kind.plan(c, g);
  if (!w.mind.goals.includes(g) || g.delayUntil > w.beat) return;
  if (isLeaf(w, g)) pursuitTick(c, g);

  // Getting bored, getting frustrated.
  const t = traits(w);
  const leaf = isLeaf(w, g);
  const top = topLevel(w).length;
  const stress = Math.max(0, top / capacity(w) - 0.6);
  const hold = kind.stick.reduce((a, k) => a + t[k], 0) / kind.stick.length;
  const persistence = clamp(1.6 - 1.2 * hold, 0.4, 1.6);
  if (g.parent === null) g.desire -= kind.decay * persistence * (1 + stress) * (1 + 0.5 * (t.impulsive - 0.5)) * (leaf ? 1 : 0.5);
  if (leaf && w.beat - g.lastProgress > kind.patience) g.frustration = Math.min(1, g.frustration + 0.012 * persistence * (1 + stress));
  if (g.parent === null && g.desire < 0.1) return end(c, g, 'drop', 'bored');
  if (g.frustration >= 0.6 && g.revisions < 2 && kind.revise?.(c, g)) {
    g.revisions++;
    g.frustration = 0.2;
    g.lastProgress = w.beat;
    return;
  }
  if (g.frustration >= 0.9) end(c, g, 'drop', 'frustrated');
}

// ===================================================================== noticing and wanting

function observe(c: Ctx): void {
  const { w } = c;
  const m = w.mind;
  for (const n of here(w)) m.lastSeen[n.id] = w.hero.locationId;
  const fresh = [];
  for (const ware of shopStock(w)) {
    const prev = m.wares[ware.id];
    if (!prev || w.beat - prev.seen > 40) fresh.push(ware);
    m.wares[ware.id] = ware;
  }
  // Something in the window catches her eye.
  const wanted = fresh
    .filter((x) => !owns(w, x) && !hasGoal(w, 'buy', x.id) && !cooling(w, `buy:${x.id}`))
    .map((x) => ({ x, a: appeal(w, x) }))
    .filter((e) => e.a >= 0.9)
    .sort((a, b) => b.a - a.a)[0];
  if (!wanted || !c.rng.chance(clamp((wanted.a - 0.6) * 0.8, 0.1, 0.95))) return;
  const { x } = wanted;
  const cost = wareCost(w, x);
  const short = Math.max(0, cost - w.hero.cash);
  // A sharper head thinks twice about a thing she can't come near.
  const feasible = 1 - w.hero.competence * 0.5 * Math.min(1, short / 1500);
  const shop = w.locations[x.loc]?.name ?? 'the shop';
  const spec: Spec = {
    kind: 'buy', ware: x.id, why: x.kind === 'implant' ? 'chrome is a lifestyle' : 'she deserves nice things',
    desire: clamp((0.35 + 0.25 * wanted.a) * feasible, 0.25, 0.9), variant: 'want_item',
    extra: { item: x.name, price: cost, cash: w.hero.cash, short, shop, implant: x.kind === 'implant' },
  };
  // Not something she can just walk up and buy: that's worth asking about.
  if (short > 0 && maybeAsk(c, 'want', () => wantAsk(x, spec, cost, w.hero.cash, shop))) return;
  adopt(c, spec);
}

/**
 * A job she said yes to and hasn't got round to. Now and then, when she has room for a new goal, she thinks about it again:
 * whichever she likes the look of best is the one she considers, and whether it becomes a goal depends on how it looks to her now.
 */
export function recallJobs(c: Ctx): void {
  const { w, rng } = c;
  if (hpFrac(w) < 0.6 || waiting(w) || cooling(w, 'quest_think')) return;
  const jobs = livePending(w);
  if (!jobs.length) return;
  // Money she is owed comes first, and she doesn't wait for room.
  const owed = jobs.filter((n) => questReady(w, n));
  if (owed.length && rng.chance(0.2)) {
    cool(w, 'quest_think', 25);
    const pick = rng.pick(owed);
    startQuestGoal(c, pick, Math.max(0.7, appraise(w, pick, pick.quest!).desire), 'quest_collect');
    return;
  }
  if (topLevel(w).length >= capacity(w) || !rng.chance(0.03)) return;
  cool(w, 'quest_think', 25);
  const pick = rng.weighted(jobs, (n) => Math.max(0.05, appraise(w, n, n.quest!).score + 0.6));
  const a = appraise(w, pick, pick.quest!);
  if (rng.chance(clamp(0.35 + 0.6 * a.score, 0.15, 0.9))) startQuestGoal(c, pick, a.desire, 'quest_resume');
}

function formGoals(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const t = traits(w);

  // A girl across the room.
  for (const n of here(w)) {
    if (!isFairGame(n) || n.hostile || hasGoal(w, 'romance', n.id) || cooling(w, `romance:${n.id}`)) continue;
    if ((h.satiety ?? 0) > 0.35 || (w.counters[`moves_${n.id}`] ?? 0) > 0 || (w.counters[`kisses_${n.id}`] ?? 0) >= 2) continue;
    // Crushes are the exception, not the routine: she is mostly out for loot, money and levels.
    const p = 0.004 + 0.05 * Math.max(0, t.impress - 0.5 + 0.7 * (t.romantic - 0.5)) + (n.affinity >= 10 ? 0.01 : 0);
    if (rng.chance(p)) {
      adopt(c, { kind: 'romance', npc: n.id, why: 'she is exactly her type', desire: clamp(0.3 + 0.5 * Math.max(t.romantic, t.impress) - 0.1, 0.25, 0.8), variant: 'crush', extra: { npc: n.name } });
    }
  }

  // A grudge that won't go away.
  if (rng.chance(0.004 + 0.02 * Math.max(0, t.grudge - 0.4))) {
    const foe = Object.values(w.npcs).find((n) => n.alive && !n.hostile && !n.id.startsWith('tmp_') && n.affinity <= -35 && !hasGoal(w, 'kill', n.id) && !cooling(w, `kill:${n.id}`));
    if (foe) {
      adopt(c, { kind: 'kill', npc: foe.id, mode: t.temper > 0.55 ? 'kill' : 'beat_up', why: 'old business', desire: 0.45 + 0.4 * t.grudge, variant: 'grudge', extra: { npc: foe.name } });
    }
  }

  // Broke, and bothered about it.
  if (h.cash < 25 && !hasGoal(w, 'cash') && rng.chance(0.01 + 0.03 * Math.max(0, t.greed - 0.4))) {
    adopt(c, { kind: 'cash', amount: h.cash + 120 + rng.int(0, 180), why: 'being broke is embarrassing', desire: 0.35 + 0.4 * t.greed, variant: 'rich' });
  }

  recallJobs(c);

  formIdle(c);

  // Low on parts: somewhere with a heap of them lying about, and nobody minding it.
  if (lowOnParts(w) && hpFrac(w) >= 0.6 && !hasGoal(w, 'scavenge') && !cooling(w, 'scav_idea') && rng.chance(0.012 + 0.03 * Math.max(0, t.techy - 0.3) + 0.01 * Math.max(0, t.greed - 0.5))) {
    const leads = partsLeads(w).filter((l) => !hasGoal(w, 'scavenge', l.id));
    cool(w, 'scav_idea', 100);
    if (leads.length) {
      const l = rng.weighted(leads, (x) => x.rich / (2 + distTo(w, x.id)));
      const name = w.locations[l.id]!.name;
      adopt(c, { kind: 'scavenge', loc: l.id, why: 'she is nearly out of parts, and some places have them lying about', desire: clamp(0.5 + 0.3 * (t.techy - 0.5), 0.4, 0.85), variant: 'parts', extra: { place: name } });
    }
  }

  // Restless: the more worn out the room she is standing in, the likelier she is to go and look for another.
  if (hpFrac(w) >= 0.6 && !hasGoal(w, 'explore') && !cooling(w, 'explore_idea')) {
    const bored = 1 - interest(w, h.locationId);
    if (rng.chance(0.0004 + 0.012 * bored * bored * (0.5 + t.curiosity))) {
      const l = pickUnexplored(c);
      if (l) adopt(c, { kind: 'explore', loc: l.id, why: bored > 0.5 ? 'she has seen enough of this place' : 'there is more city out there', desire: clamp(0.3 + 0.35 * bored + 0.25 * (t.curiosity - 0.5), 0.2, 0.8), variant: 'explore_idea', extra: { place: l.name, bored: bored > 0.5 } });
      else cool(w, 'explore_idea', 60);
    }
  }

  // Because it's there.
  if (hpFrac(w) >= 0.6 && !hasGoal(w, 'heist') && !cooling(w, 'bigscore') && rng.chance(0.0025 * heistAppetite(w))) {
    const sites = knownSites(w).filter((s) => !cooling(w, `heist:${s.loc}`));
    if (sites.length) startHeist(c, rng.pick(sites), null, 0.4 + 0.3 * t.thrill, 'because it is there', 'heist_idea');
  }

  // A door with an Atlas stencil on it, or a gang's colors, and a lot of people inside who have never met her.
  if (hpFrac(w) >= 0.7 && !hasGoal(w, 'raid') && !waiting(w) && !cooling(w, 'bigscore') && rng.chance(0.004 * raidAppetite(w))) {
    const lead = pickLead(c);
    if (lead) {
      const spec = raidSpec(w, lead, null, 0.45 + 0.3 * t.thrill, raidWhy(lead.kind), 'raid_idea');
      if (!maybeAsk(c, 'door', () => raidAsk(lead, spec, 'clear', lead.entrance.gen?.parent === h.locationId))) adoptSpec(c, spec);
    }
  }

  // The door is right there. She might ask whether it's worth it, with nothing else on her mind.
  if (hpFrac(w) >= 0.7 && !hasGoal(w, 'raid') && !waiting(w) && !cooling(w, 'advice') && !cooling(w, 'bigscore')) {
    const lead = knownDungeons(w).find((l) => l.entrance.gen?.parent === h.locationId && !cooling(w, `raid:${l.entrance.id}`) && !cooling(w, `door:${l.entrance.id}`));
    if (lead && rng.chance(0.08 * raidAppetite(w))) {
      cool(w, `door:${lead.entrance.id}`, 30);
      maybeAsk(c, 'door', () => raidAsk(lead, raidSpec(w, lead, null, 0.45 + 0.3 * t.thrill, raidWhy(lead.kind), 'raid_idea'), rng.chance(clamp(0.3 + 0.45 * raidAppetite(w), 0.3, 0.9)) ? 'clear' : 'leave', true));
    }
  }
}

/**
 * Nothing on her mind. She's a cyberknight: mostly about getting rich, clearing out buildings for loot, and putting
 * cyberdragons in the ground, with getting famous a rare fourth. She picks one.
 */
function formIdle(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const t = traits(w);
  if (topLevel(w).length || waiting(w)) return;
  if (w.beat > 3 && !rng.chance(0.5)) return;
  type Pick = 'fame' | 'cash' | 'dragon' | 'raid' | 'quest';
  const jobs = livePending(w);
  const opts = [
    // Fame is a sideline now; a performance Calling can still pull her toward it.
    { k: 'fame' as Pick, wt: 0.12 + 1.2 * spotlightFervor(w) + 0.5 * (t.fame - 0.5) + 0.2 * (t.vanity - 0.5) + 0.2 * (t.artistry - 0.5) },
    { k: 'cash' as Pick, wt: 0.9 + 1.5 * (t.greed - 0.5) + (h.cash < 150 ? 0.6 : 0) },
    { k: 'dragon' as Pick, wt: 0.5 + 1.4 * (t.courage - 0.5) + 0.9 * (t.justice - 0.5) + 0.6 * (t.thrill - 0.5) },
    { k: 'raid' as Pick, wt: knownDungeons(w).length ? 0.9 * raidAppetite(w) : 0 },
    // A job she has already said yes to is the obvious thing to do with an empty head.
    { k: 'quest' as Pick, wt: jobs.length ? 1.4 : 0 },
  ].filter((o) => !hasGoal(w, o.k) && ((o.k !== 'raid' && o.k !== 'quest') || o.wt > 0)).map((o) => ({ ...o, wt: Math.max(0.05, o.wt) }));
  if (!opts.length) return;
  const pick = rng.weighted(opts, (o) => o.wt).k;
  const specOf = (k: Pick): Spec | null => {
    if (k === 'fame') {
      const amount = Math.floor(h.fame) + rng.int(4, 8) + Math.floor(h.fame * 0.15);
      return { kind: 'fame', amount, why: t.vanity > 0.6 ? 'she has the face for it' : 'the city should know her name', desire: clamp(0.45 + 0.4 * t.fame, 0.3, 0.9), variant: 'idle_fame', extra: { amount } };
    }
    if (k === 'cash') {
      const amount = Math.round(h.cash + rng.int(150, 350) + 0.2 * h.cash);
      return { kind: 'cash', amount, why: h.cash < 150 ? 'being broke is embarrassing' : 'a hero needs a cushion', desire: clamp(0.4 + 0.45 * t.greed, 0.3, 0.9), variant: 'rich' };
    }
    if (k === 'quest') {
      const best = [...jobs].sort((a, b) => appraise(w, b, b.quest!).score - appraise(w, a, a.quest!).score)[0];
      if (!best) return null;
      const q = best.quest!;
      return { kind: 'quest', npc: best.id, loc: q.site, mode: 'approach', why: `${best.name} is paying ${money(q.reward)}`, desire: appraise(w, best, q).desire, variant: 'quest_resume', extra: { reward: q.reward } };
    }
    if (k === 'raid') {
      const lead = pickLead(c);
      return lead ? raidSpec(w, lead, null, clamp(0.45 + 0.35 * t.thrill, 0.3, 0.85), raidWhy(lead.kind), 'idle_raid') : null;
    }
    return { kind: 'dragon', amount: (w.counters.dragon_kills ?? 0) + 1, mode: 'flight', why: 'somebody has to', desire: clamp(0.45 + 0.4 * Math.max(t.courage, t.justice), 0.3, 0.9), variant: 'idle_dragon' };
  };
  const spec = specOf(pick);
  if (!spec) return;
  // Nothing to do and several ideas: she might ask which.
  const asked = maybeAsk(c, 'idle', () => {
    const options: AskOption[] = [];
    for (const o of opts) {
      const sp = o.k === pick ? spec : specOf(o.k);
      if (!sp) continue;
      options.push(
        o.k === 'fame' ? { id: 'fame', label: 'Get famous', hint: `${sp.amount} fame`, spec: sp }
        : o.k === 'cash' ? { id: 'cash', label: 'Get rich', hint: `${money(sp.amount ?? 0)} neodollars`, spec: sp }
        : o.k === 'dragon' ? { id: 'dragon', label: 'Hunt a dragon', hint: 'big, and made of Atlas', spec: sp }
        : o.k === 'quest' ? { id: 'quest', label: `Do the job for ${npcName(w, sp.npc)}`, hint: `${money(Number(sp.extra?.reward ?? 0))} neodollars`, spec: sp }
        : { id: 'raid', label: `Clear out ${sp.extra?.place ?? 'a building'}`, hint: `tier ${sp.extra?.tier ?? 1}`, spec: sp },
      );
    }
    return { question: 'Nothing on my plate. What should I do with myself?', options, lean: pick };
  });
  if (!asked) adoptSpec(c, spec);
}

/**
 * She sets herself something to do about her Calling. Real goals of the usual kinds, made harder to drop; the Calling
 * itself is not a goal. Returns what she took on, if anything.
 */
export function adoptWant(c: Ctx, want: Want, cal: Calling): Goal | null {
  const { w, rng } = c;
  const h = w.hero;
  const t = traits(w);
  const base = { why: want.why, variant: 'calling', calling: true as const };
  const desire = clamp(0.6 + 0.3 * cal.fervor, 0.5, 0.95);
  switch (want.kind) {
    case 'kill': {
      const foes = Object.values(w.npcs).filter((n) => n.alive && !n.id.startsWith('tmp_') && want.pick(n, w) && !hasGoal(w, 'kill', n.id) && !cooling(w, `kill:${n.id}`));
      if (!foes.length) return null;
      const foe = rng.weighted(foes, (n) => 1 / (2 + distTo(w, w.mind.lastSeen[n.id] ?? n.locationId)));
      return adoptSpec(c, { ...base, kind: 'kill', npc: foe.id, mode: want.mode ?? (rng.chance(0.75) ? 'kill' : 'beat_up'), desire, extra: { npc: foe.name } });
    }
    case 'dragon':
      return hasGoal(w, 'dragon') ? null : adoptSpec(c, { ...base, kind: 'dragon', amount: (w.counters.dragon_kills ?? 0) + 1, mode: 'flight', desire });
    case 'raid': {
      const lead = hasGoal(w, 'raid') ? undefined : pickLead(c);
      return lead ? adoptSpec(c, { ...raidSpec(w, lead, null, desire, want.why, 'calling'), calling: true }) : null;
    }
    case 'heist': {
      const sites = hasGoal(w, 'heist') ? [] : knownSites(w).filter((s) => !cooling(w, `heist:${s.loc}`));
      return sites.length ? adoptSpec(c, { ...heistSpec(w, rng.pick(sites), null, desire, want.why, 'calling'), calling: true }) : null;
    }
    case 'fame': {
      const amount = Math.floor(h.fame) + rng.int(8, 14);
      const existing = w.mind.goals.find((g) => g.kind === 'fame');
      if (existing) {
        existing.mode = want.skill;
        existing.amount = Math.max(existing.amount ?? 0, amount);
        existing.desire = Math.max(existing.desire, desire);
        existing.calling = true;
        existing.pursuit = undefined;
        return existing;
      }
      return adoptSpec(c, { ...base, kind: 'fame', amount, mode: want.skill, desire });
    }
    case 'romance': {
      const girls = here(w).filter((n) => isFairGame(n) && !n.hostile && !hasGoal(w, 'romance', n.id) && !cooling(w, `romance:${n.id}`));
      if (!girls.length) return null;
      const n = rng.pick(girls);
      return adoptSpec(c, { ...base, kind: 'romance', npc: n.id, desire: clamp(desire - 0.1 + 0.1 * t.romantic, 0.4, 0.9), extra: { npc: n.name } });
    }
    case 'explore': {
      const l = hasGoal(w, 'explore') ? undefined : pickUnexplored(c);
      return l ? adoptSpec(c, { ...base, kind: 'explore', loc: l.id, desire: desire - 0.1, extra: { place: l.name } }) : null;
    }
  }
}

/** Somebody looks at her wrong. Whether that becomes anything depends on who she is. */
export function ambientMind(c: Ctx): void {
  const { w, rng } = c;
  const t = traits(w);
  if (!rng.chance(0.03)) return;
  const crowd = here(w).filter((n) => !n.hostile && !n.tags.includes('boss') && !n.tags.includes('dragon') && n.archetype !== 'puppy' && !n.tags.includes('robot') && !isFairGame(n));
  if (!crowd.length) return;
  const n = rng.pick(crowd);
  n.affinity -= 12;
  n.memories.push('looked at Blackbird wrong');
  if (n.memories.length > 12) n.memories.shift();
  w.mind.lastSeen[n.id] = w.hero.locationId;
  const vengeful = clamp(0.25 + 1.0 * (t.grudge - 0.5) + 0.7 * (t.temper - 0.5) - 0.5 * (t.kindness - 0.5), 0.03, 0.95);
  const takes = rng.chance(vengeful) && !hasGoal(w, 'kill', n.id) && !cooling(w, `kill:${n.id}`);
  c.emit('slight', takes ? 'bad' : 'mixed', { npc: n.name, role: n.role, taken: takes });
  if (takes) {
    adopt(c, { kind: 'kill', npc: n.id, mode: rng.chance(0.35 + t.temper * 0.5) ? 'kill' : 'beat_up', why: 'he looked at her wrong', desire: 0.5 + 0.4 * vengeful, variant: 'slight', extra: { npc: n.name } });
  }
}

/** Too many goals: shed the weakest. */
/** The goal she'd let go of first. What she is doing for her Calling goes last. */
function weakestOf(w: World, top: Goal[]): Goal {
  const pool = top.some((g) => !g.calling) ? top.filter((g) => !g.calling) : top;
  return [...pool].sort((a, b) => priority(w, a) - priority(w, b))[0]!;
}

function prune(c: Ctx): void {
  const { w } = c;
  for (;;) {
    const top = topLevel(w);
    if (top.length <= capacity(w)) return;
    const weakest = weakestOf(w, top);
    end(c, weakest, 'drop', 'overloaded', {});
  }
}

// ===================================================================== steering

/** Work out which goals are steering her this beat, and where they want her to go. */
function steer(w: World): void {
  const m = w.mind;
  const leaves = m.goals
    .filter((g) => isLeaf(w, g) && !isHeld(w, g))
    .map((g) => ({ g, p: priority(w, g) + (g.id === m.focus ? 0.08 : 0) }))
    .sort((a, b) => b.p - a.p);
  const f = focusFactor(w);
  m.drive = leaves.map(({ g }, i) => ({ id: g.id, weight: priority(w, g) * f * (i === 0 ? 1 : i === 1 ? 0.85 : 0.65) }));
  m.hops = {};
  m.focus = leaves[0]?.g.id ?? null;
  let stay = 0;
  // Only her top goals pull her across town; the rest wait for her to run into an opening.
  for (const [i, { g }] of leaves.slice(0, 2).entries()) {
    const pull = (i === 0 ? 1 : 0.35) * priority(w, g) * f * 1.5;
    for (const t of KINDS[g.kind].targets(w, g)) {
      const r = routeTo(w, w.hero.locationId, t.loc);
      if (r && r.dist === 0) stay += pull * t.value;
      if (!r || r.dist === 0) continue;
      m.hops[r.next] = (m.hops[r.next] ?? 0) + (pull * t.value) / (1 + 0.25 * (r.dist - 1));
    }
  }
  // A Calling pulls too, a little behind her best goal.
  for (const t of callingTargets(w)) {
    const r = routeTo(w, w.hero.locationId, t.loc);
    const pull = 0.6 * f * 1.5 * t.value;
    if (r && r.dist === 0) stay += pull;
    if (!r || r.dist === 0) continue;
    m.hops[r.next] = (m.hops[r.next] ?? 0) + pull / (1 + 0.25 * (r.dist - 1));
  }
  // What's here counts too: she doesn't walk out of a place that has what she wants for one that has a bit more.
  for (const k of Object.keys(m.hops)) m.hops[k] = m.hops[k]! - 0.9 * stay;
}

/**
 * A door that looks worth going through tugs at anyone who wants money, and at anyone who wants
 * fame about a third as hard. The lead's appeal already says whether the place is worth the trouble
 * and whether she fancies her chances, so a hopeless one pulls nothing.
 */
const WANT_LURE = { cash: 1, fame: 0.35 } as const;
export function dungeonLure(w: World, dest: Id): number {
  const loc = w.locations[dest];
  if (!loc || !isEntrance(loc) || w.locations[w.hero.locationId]?.dungeon) return 0;
  const lead = knownDungeons(w).find((l) => l.entrance.id === dest);
  if (!lead || cooling(w, `raid:${dest}`) || cooling(w, 'bigscore')) return 0;
  // Kicking in doors is what she's for: fit and fearless, she is drawn to a door she fancies her chances against even with nothing in particular on her mind.
  const t = w.hero.personality.traits;
  let want = hpFrac(w) >= 0.6 ? clamp(0.45 + 0.5 * (t.courage - 0.5) + 0.3 * (t.thrill - 0.5), 0.1, 0.8) : 0;
  for (const g of w.mind.goals) {
    if (g.kind !== 'cash' && g.kind !== 'fame') continue;
    if (isHeld(w, g)) continue;
    want = Math.max(want, priority(w, g) * WANT_LURE[g.kind]);
  }
  return want * dungeonPull(lead) * 1.5;
}

/** How hard a dungeon door tugs, 0..2.5, before anyone's wants are factored in. */
const dungeonPull = (l: Lead): number => Math.min(2.5, 1.2 * Math.log1p(l.appeal * 4));

/** Everything she has decided to want, for one candidate. Added to its score. */
export function goalBias(w: World, cand: { key: string }): number {
  const m = w.mind;
  if (!m.goals.length) return 0;
  const [fam, id] = cand.key.split(':') as [string, string | undefined];
  let s = 0;
  // A route hop doesn't override an errand: while she's standing where a pressing need can be met (ammo, a med pack, the doc), she finishes it first.
  if (fam === 'go' && id) {
    const pull = m.hops[id] ?? 0;
    // Errands come first, and nothing drags her across town while the police are looking for her.
    s += (pull * (errandHere(w) ? 0.2 : 1)) / (1 + 0.3 * heatUrge(w));
    s += dungeonLure(w, id) / (1 + 0.3 * heatUrge(w));
  }
  for (const d of m.drive) {
    const g = goalById(w, d.id);
    if (g) s += KINDS[g.kind].bias(w, g, fam, id) * d.weight;
  }
  // Saving up. Drinks and gadgets come out of the same pocket.
  if (SPEND.has(fam)) {
    const saving = Math.max(0, ...m.goals.filter((g) => (g.kind === 'cash' || g.kind === 'buy') && !isHeld(w, g)).map((g) => priority(w, g)));
    s -= saving * focusFactor(w) * 2.5;
  }
  return s;
}

/** Is she somewhere that satisfies something she badly needs right now? */
function errandHere(w: World): boolean {
  const u = supplyUrge(w, w.hero.locationId);
  return u.bonus > 0.3 || u.smart > 0.3;
}

/** Things only a goal makes possible: buying the exact thing she came for. */
export function goalCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  for (const g of w.mind.goals) {
    if (g.kind !== 'buy') continue;
    const ware = wareOf(w, g);
    if (!ware || h.locationId !== ware.loc || isSold(w, ware.id) || owns(w, ware)) continue;
    const keeper = keeperOf(w, ware);
    const cost = wareCost(w, ware);
    if (!keeper || !keeper.alive || keeper.hostile || keeper.locationId !== h.locationId || keeper.downUntil > w.clock || h.cash < cost) continue;
    out.push({
      key: `buy_ware:${ware.id}`, drives: {}, bonus: 0.5,
      run: (c) => {
        g.struck = true;
        if (ware.kind === 'implant') {
          const before = h.implants.length;
          getImplant(c, keeper, ware.id);
          if (h.implants.length === before) g.struck = false;
        } else {
          buyGear(c, keeper, ware.id, cost);
        }
      },
    });
  }
  return out;
}

// ===================================================================== per-beat hooks

export function mindTick(c: Ctx): void {
  const { w } = c;
  const m = w.mind;
  observe(c);
  // Children first, so a subgoal that has just finished is seen by the goal waiting on it.
  for (const g of [...m.goals].sort((a, b) => depth(w, b) - depth(w, a))) {
    if (m.goals.includes(g)) review(c, g);
  }
  callingTick(c);
  formGoals(c);
  prune(c);
  steer(w);
}

export interface Before {
  wealth: number;
  hp: number;
  heat: number;
  fame: number;
}

export const mindBefore = (w: World): Before => ({ wealth: wealth(w.hero), hp: w.hero.hp, heat: totalHeat(w), fame: w.hero.fame });

/** She's acted. What did that earn her, and did it get her anywhere? */
export function mindAfter(c: Ctx, pick: Candidate | null, before: Before, events: GameEvent[]): void {
  const { w, rng } = c;
  const m = w.mind;
  const h = w.hero;
  const [fam, id] = (pick?.key ?? '').split(':') as [string, string | undefined];
  if (pick && fam !== 'go' && fam) learnEarning(w, fam, wealth(h) - before.wealth);
  if (pick && FAME_FAMILIES.has(fam)) {
    learnFame(w, fam, h.fame - before.fame);
    for (const g of m.goals) if (g.kind === 'fame' && g.pursuit?.act === fam) g.pursuit.arrived = undefined;
  }

  callingAfter(c, pick, h.fame - before.fame, events, before.hp);
  const lost = events.some((e) => e.type === 'fight_end' && e.data.variant !== 'win');
  const looted = events.some((e) => LOOT.has(e.type) && e.outcome === 'good');
  // She remembers who has beaten her.
  if (lost && id && (fam === 'challenge' || fam === 'sweep')) w.counters[`lost_to_${id}`] = (w.counters[`lost_to_${id}`] ?? 0) + 1;
  for (const g of m.goals) {
    const swung = g.kind === 'kill' && (fam === 'challenge' || fam === 'sweep') && id === g.npc;
    if (swung) g.struck = true;
    if (swung && lost) {
      g.setbacks++;
      g.frustration = Math.min(1, g.frustration + 0.2);
      if (!g.delayUntil && isLeaf(w, g)) delay(c, g, 30, 'licking_wounds');
    }
    if (g.kind === 'heist' && looted && g.mode === 'loot') g.looted = true;
    if (g.kind === 'heist' && g.mode !== 'escape' && !g.blown) {
      // Quiet is the whole point. The take itself makes noise; anything else that does is a problem.
      const site = siteAt(g.loc!);
      const attempt = fam === site?.feature;
      if ((attempt && !looted) || (!attempt && totalHeat(w) - before.heat >= 2)) {
        g.blown = true;
        const bail = !g.looted && rng.chance(0.25 + 0.7 * h.competence);
        c.emit('goal_note', 'bad', goalData(w, g, { variant: bail ? 'bail' : 'blown', place: site?.label ?? 'the place' }));
        if (bail) g.mode = 'escape';
      }
    }
  }

  // Impressing someone is not only flirting: doing something impressive while she watches counts.
  for (const g of m.goals) {
    if (g.kind !== 'romance' || !IMPRESSIVE.has(fam) || !here(w).some((n) => n.id === g.npc)) continue;
    if (!events.some((e) => e.outcome === 'good') || !rng.chance(0.7)) continue;
    const n = w.npcs[g.npc!]!;
    n.affinity += 5;
    c.emit('impressed', 'good', { npc: n.name, family: fam, affinity: n.affinity });
  }

  // Progress, or not.
  const drivers = new Set(m.drive.map((d) => d.id));
  for (const g of m.goals) {
    if (isHeld(w, g)) continue;
    const now = KINDS[g.kind].metric(w, g);
    const eps = g.kind === 'cash' ? 1 : 0.01;
    if (now > g.metric + eps) {
      const drifted = drivers.has(g.id) && w.beat - g.lastFocus > 14 && g.lastFocus > 0;
      g.metric = now;
      g.lastProgress = w.beat;
      g.frustration = Math.max(0, g.frustration - 0.08);
      if (g.parent === null) g.desire = Math.min(1, g.desire + 0.012);
      if (drifted) c.emit('goal_resume', 'mixed', goalData(w, g, { variant: g.kind }));
      if (drivers.has(g.id)) g.lastFocus = w.beat;
    }
  }
}

// ===================================================================== for display

export interface GoalView {
  id: number;
  label: string;
  why: string;
  depth: number;
  /** focus: steering her hardest. active: steering her a bit. waiting: on its subgoals. held: put off. */
  status: 'focus' | 'active' | 'waiting' | 'held';
  priority: number;
  frustration: number;
  note?: string;
}

/** Her goals as a tree, strongest first, for the status panel and tools. */
export function goalViews(w: World): GoalView[] {
  const m = w.mind;
  const out: GoalView[] = [];
  const walk = (g: Goal, d: number) => {
    const status = isHeld(w, g) ? 'held' : !isLeaf(w, g) ? 'waiting' : g.id === m.focus ? 'focus' : 'active';
    const note = g.kind === 'heist' || g.kind === 'raid' || g.kind === 'quest' ? g.mode : g.kind === 'kill' ? (g.mode === 'beat_up' ? 'just a beating' : undefined) : g.delayUntil > w.beat ? g.delayWhy : undefined;
    out.push({ id: g.id, label: goalLabel(w, g), why: g.why, depth: d, status, priority: Math.round(priority(w, g) * 100) / 100, frustration: Math.round(g.frustration * 100) / 100, note });
    for (const k of childrenOf(w, g).sort((a, b) => priority(w, b) - priority(w, a))) walk(k, d + 1);
  };
  for (const g of [...topLevel(w)].sort((a, b) => priority(w, b) - priority(w, a))) walk(g, 0);
  return out;
}
