import { here, remember } from './combat';
import type { Ctx } from './types';

/**
 * She died, and now she's back. Whoever saw it (or heard) is confused to see her; whoever didn't
 * thinks nothing happened. Each person reacts once, the first time they're in a room with her
 * after a run in which she died. See `recordDeath` in universe.ts for who knows.
 */
export function recognizeRevenant(c: Ctx): void {
  const { w } = c;
  const aware = here(w).filter((n) => !n.hostile && n.knows?.died !== undefined && !n.knows.reacted && n.knows.died < w.legacy.runs);
  if (!aware.length) return;
  // One person says something; the rest quietly update.
  const first = aware.find((n) => n.knows!.saw) ?? aware[0]!;
  for (const n of aware) {
    n.knows!.reacted = true;
    remember(n, n.knows!.saw ? 'watched Blackbird die, and then she came back' : 'heard Blackbird was dead, and then she walked in');
  }
  c.emit('revenant', 'mixed', { variant: first.knows!.saw ? 'saw' : 'heard', npc: first.name, role: first.role, others: aware.length - 1 });
}
