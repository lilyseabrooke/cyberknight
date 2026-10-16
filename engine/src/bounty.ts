import type { Ctx, Id, Npc, World } from './types';
import type { Rng } from './rng';
import { hasImplantFlag } from './skills';
import { here } from './combat';

/**
 * NPD bounties. Some people in Neo already have paper out on them, and the police don't mind
 * (much) when somebody else collects. Hitting a bountied target generates no police heat; the
 * witnesses still freak out and every other kind of heat still applies.
 *
 * Blackbird only knows what she has learned. Most bounties are posted where her optics can read
 * them. Some are hidden: she needs a bounty-grade scanner, or a tip from someone who talks.
 */

/** Who tends to have paper on them: archetype -> chance, and how often it's the hidden kind. */
const WANTED: Record<string, { chance: number; hidden: number }> = {
  ganger: { chance: 0.45, hidden: 0.35 },
  dealer: { chance: 0.6, hidden: 0.6 },
  hacker: { chance: 0.5, hidden: 0.8 },
  scrapper: { chance: 0.4, hidden: 0.5 },
  patron: { chance: 0.12, hidden: 0.5 },
  // The pit: most of them have paper, and she can only collect it by killing one, which the pit does not forgive (see gymkit.ts).
  pit_fighter: { chance: 0.7, hidden: 0.5 },
  // The back of a pawn shop: a fence has paper more often than not.
  pawn_fence: { chance: 0.55, hidden: 0.6 },
};

export const hasBounty = (n: Npc | undefined): n is Npc & { bounty: { amount: number; hidden: boolean } } => !!n && n.alive && !!n.bounty;

/** Does Blackbird know this person is wanted? */
export const knowsBounty = (w: World, id: Id): boolean => !!w.mind.bounties?.[id];

/** Hands out the paper when a night begins. Deterministic per seed, and on its own stream so nothing else shifts. */
export function assignBounties(npcs: Record<Id, Npc>, rng: Rng): void {
  const list = Object.values(npcs);
  for (const n of list) {
    const spec = WANTED[n.archetype];
    if (!spec || !rng.chance(spec.chance)) continue;
    n.bounty = { amount: (n.level * 35 + rng.int(40, 160)) | 0, hidden: rng.chance(spec.hidden) };
  }
  ensureBounties(npcs);
}

/** Every night has at least one posted and one hidden bounty, or the system is just a rumour. Tops up whatever is missing. */
export function ensureBounties(npcs: Record<Id, Npc>): void {
  const list = Object.values(npcs).filter((n) => n.alive);
  const wanted = list.filter((n) => n.bounty);
  const spot = (hidden: boolean, prefer: string[]) => {
    if (wanted.some((n) => n.bounty!.hidden === hidden)) return;
    const pool = list.filter((n) => prefer.includes(n.archetype) && !n.bounty);
    const pick = pool[0] ?? wanted.find((n) => n.bounty!.hidden !== hidden);
    if (!pick) return;
    if (!pick.bounty) pick.bounty = { amount: pick.level * 35 + 90, hidden };
    else pick.bounty.hidden = hidden;
    wanted.push(pick);
  };
  spot(false, ['ganger']);
  spot(true, ['dealer', 'hacker']);
}

/** Someone with a bounty she'd be able to learn about from a tip. */
export const tippable = (w: World, except: Id): Npc[] =>
  Object.values(w.npcs).filter((n) => n.id !== except && hasBounty(n) && n.bounty!.hidden && !knowsBounty(w, n.id) && !n.id.startsWith('tmp_'));

/** Her optics read what's posted. Busted optics read nothing. A bounty-grade scanner reads what isn't. */
export function scanBounties(c: Ctx): void {
  const { w } = c;
  const h = w.hero;
  if (h.injuries.includes('fried_optics')) return;
  const scanner = hasImplantFlag(h, 'bounty_scan');
  const known = (w.mind.bounties ??= {});
  for (const n of here(w)) {
    if (!hasBounty(n) || known[n.id] || n.hostile) continue;
    if (n.bounty.hidden && !scanner) continue;
    known[n.id] = n.bounty.hidden ? 'scanner' : 'scan';
    c.emit('bounty_scan', 'good', { variant: n.bounty.hidden ? 'scanner' : 'posted', npc: n.name, role: n.role, amount: n.bounty.amount });
  }
}

/** Collected on a win: the NPD pays on delivery, however delivered. */
export function collectBounties(c: Ctx, foes: Npc[]): number {
  let total = 0;
  for (const f of foes) {
    if (!f.bounty) continue;
    if (f.tags.includes('pit') && f.alive) continue; // beaten in the pit is not delivered
    total += f.bounty.amount;
    c.emit('bounty_paid', 'good', { npc: f.name, amount: f.bounty.amount, dead: !f.alive });
    delete f.bounty;
  }
  c.w.hero.cash += total;
  return total;
}
