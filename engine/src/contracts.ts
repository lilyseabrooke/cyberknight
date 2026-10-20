import { remember } from './combat';
import type { Ctx, Npc } from './types';

/**
 * Settling scores for other people. Someone who wants someone hurt will pay Blackbird to do it
 * (see knowledge.ts for how she takes the job); this is the other end: when she beats the target,
 * the client pays, if the client is still around to.
 */
export function settleContracts(c: Ctx, beaten: Npc[]): void {
  const { w } = c;
  const open = w.mind.contracts;
  if (!open?.length) return;
  for (const k of [...open]) {
    const target = beaten.find((b) => b.id === k.target);
    if (!target || (target.alive && target.downUntil <= w.clock)) continue;
    open.splice(open.indexOf(k), 1);
    const client = w.npcs[k.client];
    if (!client || !client.alive) {
      c.emit('contract', 'mixed', { variant: 'void', npc: client?.name ?? 'The client', target: target.name });
      continue;
    }
    w.hero.cash += k.reward;
    client.affinity += 20;
    client.cash = Math.max(0, client.cash - k.reward);
    client.facts = (client.facts ?? []).filter((f) => f.kind !== 'wants_revenge');
    remember(client, 'had Blackbird settle a score');
    c.emit('contract', 'good', { variant: 'paid', npc: client.name, target: target.name, target_g: target.gender, amount: k.reward, dead: !target.alive });
  }
}
