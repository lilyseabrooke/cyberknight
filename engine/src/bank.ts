import type { Candidate } from './candidate';
import { clamp } from './candidate';
import { DROPS, isDrop } from './content/drops';
import { dropCut, perk } from './lab';
import type { Ctx, Feature, World } from './types';

/**
 * Drop points. Money in her pocket dies with her; money in the account doesn't. So a Blackbird
 * with any sense and a decent pile heads for one, hands most of it over, takes the cut on the chin,
 * and carries on with a float for drinks. A Blackbird without any sense carries it into a dragon.
 *
 * Whether she thinks of it is the usual sort of wanting: the pile, her competence and the lab's
 * `bank` upgrades push the pull; her float and the cut push back.
 */

/** What she keeps back for drinks, patching and bad ideas. */
export const FLOAT = 20;

/** The least she'll bother with. Keener on banking (lab upgrades) means a smaller pile will do. */
export const minimumPile = (w: World): number => Math.max(FLOAT + 15, 70 - 12 * perk(w.legacy, 'bank'));

/**
 * What she'd deposit right now. Zero if it isn't worth the walk. The purse she woke up with doesn't
 * count toward the pile: she's not paying a cut to put her own pocket money in a box.
 */
export const worthDepositing = (w: World): number => {
  const pile = Math.max(minimumPile(w), (w.counters.start_cash ?? 0) + 40);
  return w.hero.cash >= pile ? w.hero.cash - FLOAT : 0;
};

/** How badly she wants to bank what she's carrying, from nothing to well over a good fight. */
export function bankUrge(w: World): number {
  const amount = worthDepositing(w);
  if (!amount) return 0;
  return clamp(Math.log2(amount / 30) * 0.28, 0, 1.2) + 0.3 * perk(w.legacy, 'bank');
}

/** The cut at a particular drop point, as a percentage. */
export const cutAt = (w: World, kind: string): number => (DROPS[kind]?.free ? 0 : dropCut(w.legacy, DROPS[kind]?.cut ?? 0));

export function dropCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const amount = worthDepositing(w);
  if (!amount) return out;
  for (const f of Object.values(w.features)) {
    if (f.locationId !== w.hero.locationId || !isDrop(f.kind)) continue;
    // A cheaper cut is a nicer reason to walk in.
    const bonus = bankUrge(w) - (cutAt(w, f.kind) - 20) * 0.01;
    out.push({ key: f.kind, drives: { greed: 0.4 }, bonus, smart: 1.0, run: (c) => deposit(c, f) });
  }
  return out;
}

/**
 * The pull of the next room, when it has a drop point and she has a pile. Added to the exit
 * candidates, like the shops are.
 */
export function bankPull(w: World, dest: string): { bonus: number; smart: number } {
  const none = { bonus: 0, smart: 0 };
  if (!worthDepositing(w)) return none;
  const here = w.hero.locationId;
  if (here === dest) return none;
  const hasDrop = Object.values(w.features).some((f) => f.locationId === dest && isDrop(f.kind));
  if (!hasDrop) return none;
  // She won't walk to a second one when she's standing at one: nothing to bank anymore, so this is moot then.
  return { bonus: bankUrge(w) * 0.5, smart: 0.6 };
}

/** Put the money in. Everything above the float, less the cut. */
export function deposit(c: Ctx, f: Feature): void {
  const { w } = c;
  const h = w.hero;
  const amount = Math.max(0, h.cash - FLOAT);
  const pct = cutAt(w, f.kind);
  const fee = Math.ceil((amount * pct) / 100);
  const net = amount - fee;
  h.cash -= amount;
  w.legacy.account += net;
  w.stats.deposited += net;
  w.stats.fees += fee;
  f.uses++;
  c.emit('deposit', 'good', { variant: f.kind.replace('drop_', ''), amount, fee, net, pct, balance: w.legacy.account, left: h.cash });
}
