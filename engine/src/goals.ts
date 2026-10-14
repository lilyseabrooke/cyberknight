import type { Candidate } from './candidate';
import { clamp } from './candidate';
import type { Ctx, Goal, GoalKind, Id, Npc, Ware, World, GameEvent } from './types';
import { armBest, edge, rating } from './weapons';
import { wielded } from './arms';
import type { EventData } from './events';
import type { Trait } from './personality';
import { heroPower, here } from './combat';
import { flameOf } from './traits';
import { buyGear, supplyUrge } from './supply';
import { heatUrge } from './laylow';
import { dragonReadiness, pursuing, pursuitBias, pursuitTargets, pursuitTick } from './pursuit';
import { getImplant } from './extras';
import { MAX_IMPLANTS } from './content/implants';
import {
  MAX_DEPTH, capacity, childrenOf, cool, cooling, depth, focusFactor, goalById, hasGoal, isHeld, isLeaf, priority, subjectOf, topLevel,
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
  'laser_tag', 'billboard', 'engage_flight', 'challenge_dragon', 'steal_puppy', 'rob_paint_shop', 'threaten_clerk', 'armwrestle',
]);
/** Things that look good to a girl who is watching. */
const IMPRESSIVE = new Set(['karaoke', 'dj_set', 'gig', 'busk', 'serenade', 'jam', 'beatbox', 'billboard', 'graffiti', 'laser_tag', 'darts', 'pool', 'parkour', 'mix_molotov', 'tend_bar', 'dancefloor', 'buy_round', 'engage_flight', 'challenge_dragon']);
const LOOT = new Set(['safe', 'vault', 'crates', 'till']);

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
  ...extra,
});

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
      // Small change is a grind. A proper score is a plan.
      if (!isLeaf(w, g) || short < 120 || hpFrac(w) < 0.6 || hasGoal(w, 'heist')) return;
      const sites = knownSites(w).filter((s) => !cooling(w, `heist:${s.loc}`));
      if (!sites.length) return;
      const best = [...sites].sort((a, b) => b.value / (2 + distTo(w, b.loc)) - a.value / (2 + distTo(w, a.loc)))[0]!;
      if (rng.chance(0.05 * heistAppetite(w) * (1 + short / 300))) {
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
      const { w } = c;
      if (!isLeaf(w, g)) return;
      const foe = foeOf(w, g);
      const cur = armBest(w.hero, foe);
      const rate = (x: Ware) => (x.item ? rating(x.item, foe) : x.power);
      const known = Object.values(w.mind.wares).filter((x) => x.kind === 'weapon' && !isSold(w, x.id) && rate(x) > cur + 0.5);
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
      if (g.struck && n.downUntil > w.beat) return { done: g.mode === 'kill' ? 'settled' : 'beat_up' };
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
    label: (_w, g) => `get famous (${g.amount ?? 0} fame)`,
    check: (w, g) => (w.hero.fame >= (g.amount ?? 0) ? { done: 'famous' } : null),
    plan() {},
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
        if (fam === 'pool_date' || fam === 'serve_dish') return 2.2;
      }
      if (fam === 'dancefloor') return 1.8;
      if (IMPRESSIVE.has(fam)) return 1.2;
      return 0;
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
};

const earnPull = (e: number): number => 1.2 * Math.log1p(e / 25);

/** How much of a thief she is, 0.1..1.5. Honest girls don't plan robberies. */
function heistAppetite(w: World): number {
  const t = traits(w);
  return clamp(0.4 + 0.9 * ((t.thrill - 0.5) * 0.5 + (t.greed - 0.5) * 0.5 - (t.honesty - 0.5) * 0.9) * 2, 0.1, 1.5);
}

/** The next-best thing: cheaper than `ware` by `ratio`, same sort of thing. */
function alternative(w: World, ware: { id: string; kind: string; price: number }, ratio = 0.9) {
  return Object.values(w.mind.wares)
    .filter((x) => x.id !== ware.id && x.kind === ware.kind && !isSold(w, x.id) && !owns(w, x) && x.price <= ware.price * ratio && appeal(w, x) > 0)
    .sort((a, b) => appeal(w, b) - appeal(w, a))[0];
}

// ===================================================================== lifecycle

interface Spec {
  kind: GoalKind;
  parent?: number | null;
  npc?: Id;
  ware?: string;
  loc?: Id;
  amount?: number;
  mode?: string;
  why: string;
  desire: number;
  /** Which line of the log introduces it. */
  variant: string;
  extra?: EventData;
}

/** Take on a new goal, if she has room (or if it beats the weakest thing she's already juggling). */
function adopt(c: Ctx, s: Spec): Goal | null {
  const { w, rng } = c;
  const m = w.mind;
  const parent = goalById(w, s.parent ?? null);
  const subject = s.npc ?? s.ware ?? s.loc ?? '';
  const same = m.goals.find((g) => g.kind === s.kind && g.parent === (parent?.id ?? null) && (s.kind === 'cash' || subjectOf(g) === subject));
  if (same) {
    same.desire = Math.max(same.desire, s.desire);
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
      const weakest = [...top].sort((a, b) => priority(w, a) - priority(w, b))[0]!;
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
    revisions: 0, lastFocus: 0,
  };
  g.metric = KINDS[g.kind].metric(w, g);
  m.goals.push(g);
  c.emit('goal_new', 'mixed', goalData(w, g, { variant: s.variant, ...s.extra }));
  return g;
}

const label = (w: World, s: Spec): string =>
  KINDS[s.kind].label(w, { ...s, id: 0, parent: null, frustration: 0, born: 0, lastProgress: 0, metric: 0, delayUntil: 0, setbacks: 0, revisions: 0, lastFocus: 0 });

function startHeist(c: Ctx, site: Site, parent: Goal | null, desire: number, why: string, variant: string): Goal | null {
  const { w } = c;
  const g = adopt(c, { kind: 'heist', parent: parent?.id ?? null, loc: site.loc, mode: 'approach', why, desire, variant, extra: { place: site.label, short: parent ? Math.max(0, (parent.amount ?? 0) - w.hero.cash) : 0 } });
  if (g && g.heat0 === undefined) {
    g.heat0 = totalHeat(w);
    g.amount = Math.round(wealth(w.hero));
  }
  return g;
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
  c.emit(how === 'done' ? 'goal_done' : 'goal_drop', outcome, goalData(w, g, { variant, ...extra, ...(g.kind === 'heist' && how === 'done' ? { haul: Math.round(wealth(w.hero) - (g.amount ?? 0)) } : {}) }));
  const gone = new Set([g.id, ...descendants(w, g).map((x) => x.id)]);
  m.goals = m.goals.filter((x) => !gone.has(x.id));
  if (m.focus !== null && gone.has(m.focus)) m.focus = null;
  cool(w, `${g.kind}:${subjectOf(g)}`, how === 'done' ? 220 : variant === 'overloaded' ? 40 : 90);
  if (g.kind === 'heist' && how === 'drop') cool(w, `heist:${g.loc}`, 120);
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
    if (g.kind === 'weapon' && parent.kind === 'kill') cool(w, `prep:${parent.npc}`, 120);
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
  adopt(c, {
    kind: 'buy', ware: x.id, why: x.kind === 'implant' ? 'chrome is a lifestyle' : 'she deserves nice things',
    desire: clamp((0.35 + 0.25 * wanted.a) * feasible, 0.25, 0.9), variant: 'want_item',
    extra: { item: x.name, price: cost, cash: w.hero.cash, short, shop: w.locations[x.loc]?.name ?? 'the shop', implant: x.kind === 'implant' },
  });
}

function formGoals(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const t = traits(w);

  // A girl across the room.
  for (const n of here(w)) {
    if (!n.tags.includes('romanceable') || n.hostile || hasGoal(w, 'romance', n.id) || cooling(w, `romance:${n.id}`)) continue;
    if ((h.satiety ?? 0) > 0.35 || (w.counters[`moves_${n.id}`] ?? 0) > 0 || (w.counters[`kisses_${n.id}`] ?? 0) >= 2) continue;
    const p = 0.02 + 0.22 * Math.max(0, t.impress - 0.5 + 0.7 * (t.romantic - 0.5)) + (n.affinity >= 10 ? 0.04 : 0);
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

  formIdle(c);

  // Because it's there.
  if (hpFrac(w) >= 0.6 && !hasGoal(w, 'heist') && rng.chance(0.0025 * heistAppetite(w))) {
    const sites = knownSites(w).filter((s) => !cooling(w, `heist:${s.loc}`));
    if (sites.length) startHeist(c, rng.pick(sites), null, 0.4 + 0.3 * t.thrill, 'because it is there', 'heist_idea');
  }
}

/**
 * Nothing on her mind. She's a cyberknight with three things she's actually about: getting famous, getting rich,
 * and putting cyberdragons in the ground. She picks one.
 */
function formIdle(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const t = traits(w);
  if (topLevel(w).length) return;
  if (w.beat > 3 && !rng.chance(0.5)) return;
  const opts = [
    { k: 'fame' as const, wt: 0.5 + 1.6 * (t.fame - 0.5) + 0.6 * (t.vanity - 0.5) + 0.5 * (t.artistry - 0.5) + 0.4 * (t.impress - 0.5) },
    { k: 'cash' as const, wt: 0.6 + 1.5 * (t.greed - 0.5) + (h.cash < 150 ? 0.6 : 0) },
    { k: 'dragon' as const, wt: 0.35 + 1.4 * (t.courage - 0.5) + 0.9 * (t.justice - 0.5) + 0.6 * (t.thrill - 0.5) },
  ].filter((o) => !hasGoal(w, o.k)).map((o) => ({ ...o, wt: Math.max(0.05, o.wt) }));
  if (!opts.length) return;
  const pick = rng.weighted(opts, (o) => o.wt).k;
  if (pick === 'fame') {
    const amount = Math.floor(h.fame) + rng.int(4, 8) + Math.floor(h.fame * 0.15);
    adopt(c, { kind: 'fame', amount, why: t.vanity > 0.6 ? 'she has the face for it' : 'the city should know her name', desire: clamp(0.45 + 0.4 * t.fame, 0.3, 0.9), variant: 'idle_fame', extra: { amount } });
  } else if (pick === 'cash') {
    const amount = Math.round(h.cash + rng.int(150, 350) + 0.2 * h.cash);
    adopt(c, { kind: 'cash', amount, why: h.cash < 150 ? 'being broke is embarrassing' : 'a hero needs a cushion', desire: clamp(0.4 + 0.45 * t.greed, 0.3, 0.9), variant: 'rich' });
  } else {
    adopt(c, { kind: 'dragon', amount: (w.counters.dragon_kills ?? 0) + 1, mode: 'flight', why: 'somebody has to', desire: clamp(0.45 + 0.4 * Math.max(t.courage, t.justice), 0.3, 0.9), variant: 'idle_dragon' });
  }
}

/** Somebody looks at her wrong. Whether that becomes anything depends on who she is. */
export function ambientMind(c: Ctx): void {
  const { w, rng } = c;
  const t = traits(w);
  if (!rng.chance(0.03)) return;
  const crowd = here(w).filter((n) => !n.hostile && !n.tags.includes('boss') && !n.tags.includes('dragon') && n.archetype !== 'puppy' && !n.tags.includes('robot') && !n.tags.includes('romanceable'));
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
function prune(c: Ctx): void {
  const { w } = c;
  for (;;) {
    const top = topLevel(w);
    if (top.length <= capacity(w)) return;
    const weakest = [...top].sort((a, b) => priority(w, a) - priority(w, b))[0]!;
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
  // What's here counts too: she doesn't walk out of a place that has what she wants for one that has a bit more.
  for (const k of Object.keys(m.hops)) m.hops[k] = m.hops[k]! - 0.9 * stay;
}

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
    if (!keeper || !keeper.alive || keeper.hostile || keeper.locationId !== h.locationId || keeper.downUntil > w.beat || h.cash < cost) continue;
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
    const note = g.kind === 'heist' ? g.mode : g.kind === 'kill' ? (g.mode === 'beat_up' ? 'just a beating' : undefined) : g.delayUntil > w.beat ? g.delayWhy : undefined;
    out.push({ id: g.id, label: goalLabel(w, g), why: g.why, depth: d, status, priority: Math.round(priority(w, g) * 100) / 100, frustration: Math.round(g.frustration * 100) / 100, note });
    for (const k of childrenOf(w, g).sort((a, b) => priority(w, b) - priority(w, a))) walk(k, d + 1);
  };
  for (const g of [...topLevel(w)].sort((a, b) => priority(w, b) - priority(w, a))) walk(g, 0);
  return out;
}
