import type { Ctx, Npc, World } from './types';
import { Rng } from './rng';
import { clamp } from './candidate';
import { cool } from './mind';
import { synergy, train } from './skills';
import type { SkillId } from './skills';

/**
 * Stats and skills for everyone else. A person's stats are rolled once from their level, tags and archetype, the first
 * time anybody asks (so older saves and hand-written people get them too), and some people are lopsided: a
 * hulk is nearly all muscle, a drifter is a bit of everything. Skills aren't stored: they settle around the person's
 * level and wobble from there, the same way every time (`skillOf`).
 *
 * Blackbird can't see any of it. Analyze (a skill under Intelligence) gives her a noisy read of the shares, and the
 * more lopsided the target, the clearer it comes out. She decides with what she has read; the dice use the truth.
 */
export const STAT_KEYS = ['muscle', 'reflex', 'int', 'charm'] as const;
export type NpcStat = (typeof STAT_KEYS)[number];
export type Stats = Record<NpcStat, number>;

/** Total stat points for somebody of this level; she starts at 11 on level 1. */
export const statTotal = (level: number): number => 8 + 1.6 * level;

const BIAS_TAG: Record<string, Partial<Stats>> = {
  strong: { muscle: 2.4 },
  augmented: { int: 1.6, reflex: 1.3 },
  robot: { int: 2, reflex: 1.5, charm: 0.3 },
  boss: { muscle: 1.3, int: 1.3 },
  staff: { charm: 1.3 },
};
const BIAS_ARCH: Record<string, Partial<Stats>> = {
  hacker: { int: 3 },
  bartender: { charm: 1.8 },
  bouncer: { muscle: 1.8 },
  ganger: { muscle: 1.4, reflex: 1.2 },
  mugger: { reflex: 1.6 },
  scrapper: { muscle: 1.3, int: 1.2 },
  fixer: { charm: 1.5, int: 1.4 },
  doc: { int: 1.8 },
  drone: { reflex: 2 },
};

const gauss = (rng: Rng): number => rng.next() + rng.next() + rng.next() - 1.5;

function roll(n: Npc): Stats {
  const rng = new Rng(`stats:${n.id}`);
  const spread = 0.3 + rng.next() * 1.5;
  const raw = {} as Stats;
  for (const k of STAT_KEYS) {
    const bias = (BIAS_ARCH[n.archetype]?.[k] ?? 1) * n.tags.reduce((a, t) => a * (BIAS_TAG[t]?.[k] ?? 1), 1);
    raw[k] = bias * Math.exp(spread * gauss(rng) * 1.6);
  }
  const sum = STAT_KEYS.reduce((a, k) => a + raw[k], 0);
  const total = statTotal(n.level);
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = Math.max(1, Math.round((raw[k] / sum) * total));
  return out;
}

export const statsOf = (n: Npc): Stats => (n.stats ??= roll(n));

/** A skill level near theirs: always the same wobble for the same person and skill. */
export function skillOf(n: Npc, id: SkillId): number {
  const r = new Rng(`skill:${n.id}:${id}`).next();
  return Math.max(0, Math.round(n.level * (0.6 + 0.8 * r)));
}

/** 0 for an even spread, 1 for everything in one stat. */
export function lopsided(s: Stats): number {
  const total = STAT_KEYS.reduce((a, k) => a + s[k], 0);
  const top = Math.max(...STAT_KEYS.map((k) => s[k])) / total;
  return clamp((top - 0.25) / 0.75, 0, 1);
}

/** What she thinks one of their stats is: the truth if she has read them, otherwise an average person of that level. */
export function perceived(w: World, n: Npc, stat: NpcStat): number {
  const r = w.mind.reads?.[n.id];
  const share = r ? r.shares[stat] : 0.25;
  return share * statTotal(n.level);
}

/** Size somebody up. Learns something only if the read comes out clear enough to mean anything. */
export function analyze(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const truth = statsOf(n);
  const total = STAT_KEYS.reduce((a, k) => a + truth[k], 0);
  const q = clamp(0.1 + 0.07 * synergy(h, ['analyze', ['stat:int', 0.7]]) + 0.55 * lopsided(truth) - 0.01 * Math.max(0, n.level - h.level), 0, 0.95);
  train(c, 'analyze', 1);
  cool(w, `analyze:${n.id}`, 40);
  if (q < 0.2) {
    c.emit('analyze', 'mixed', { variant: 'blank', npc: n.name });
    return;
  }
  const seen = {} as Stats;
  let sum = 0;
  for (const k of STAT_KEYS) {
    seen[k] = Math.max(0.01, truth[k] / total + gauss(rng) * (1 - q) * 0.5);
    sum += seen[k];
  }
  const old = (w.mind.reads ??= {})[n.id];
  const shares = {} as Stats;
  for (const k of STAT_KEYS) {
    const fresh = seen[k] / sum;
    shares[k] = old ? (old.shares[k] * old.quality + fresh * q) / (old.quality + q) : fresh;
  }
  const quality = old ? 1 - (1 - old.quality) * (1 - q) : q;
  w.mind.reads[n.id] = { shares, quality };
  const top = STAT_KEYS.reduce((a, k) => (shares[k] > shares[a] ? k : a), STAT_KEYS[0]);
  c.emit('analyze', 'good', { variant: quality >= 0.55 ? 'clear' : 'hunch', npc: n.name, stat: top === 'int' ? 'intelligence' : top });
}

export const readQuality = (w: World, n: Npc): number => w.mind.reads?.[n.id]?.quality ?? 0;
