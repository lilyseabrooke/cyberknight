import type { Ctx, Id, Npc, World } from './types';

/**
 * Dying. Somebody who is hurt past saving does not drop dead on the spot: they go down and, after a while, die. How long is
 * a matter of how badly they are hurt (`severity`, 0..1): the worse, the sooner. Nobody can do anything about it yet, but
 * `stabilize` is what a medic (a skill she doesn't have yet) will call: it takes them off the clock and leaves them
 * unconscious, as if they'd only been knocked out.
 *
 * Time is the world clock in minutes, which outlasts a night, so a night that ends with someone dying still ends them.
 */

/** The longest and shortest a dying person lasts, in world minutes. */
export const DYING_MAX = 120;
export const DYING_MIN = 10;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** How long somebody hurt this badly has. */
export const timeToDie = (severity: number): number => Math.round(DYING_MAX - (DYING_MAX - DYING_MIN) * clamp01(severity));

export const isDying = (n: Npc): boolean => !!n.dying;

/** Put somebody on the clock. They are down, and not coming up. */
export function startDying(w: World, n: Npc, severity: number): void {
  if (!n.alive || n.dying) return;
  n.dying = { dieAt: w.clock + timeToDie(severity), severity: clamp01(severity) };
  n.downUntil = w.beat + 100000;
  if (!w.dying.includes(n.id)) w.dying.push(n.id);
}

/** Take somebody off the clock. They are unconscious for a while and then they are up. Returns whether they were dying. */
export function stabilize(w: World, n: Npc, unconsciousBeats = 60): boolean {
  if (!n.dying) return false;
  delete n.dying;
  w.dying = w.dying.filter((id) => id !== n.id);
  n.hp = Math.max(1, Math.round(n.maxHp * 0.1));
  n.downUntil = w.beat + unconsciousBeats;
  return true;
}

/** Someone's time is up. */
export function die(_w: World, n: Npc): void {
  delete n.dying;
  n.alive = false;
  n.hp = 0;
}

/** The clock runs on the dying. If she is there when someone's time comes, she sees it. */
export function tickDying(c: Ctx): void {
  const { w } = c;
  if (!w.dying.length) return;
  const keep: Id[] = [];
  for (const id of w.dying) {
    const n = w.npcs[id];
    if (!n || !n.alive || !n.dying) continue;
    if (w.clock < n.dying.dieAt) {
      keep.push(id);
      continue;
    }
    const here = n.locationId === w.hero.locationId;
    die(w, n);
    if (here) c.emit('dying_dies', 'bad', { npc: n.name, place: w.locations[n.locationId]?.name ?? 'here' });
  }
  w.dying = keep;
}
