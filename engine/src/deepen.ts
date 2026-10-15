import { computeCharacter } from './character';
import { rollFacts } from './facts';
import { link, makeStub, rollTies } from './ties';
import { heartOf } from './bonds';
import { isFairGame } from './people';
import { Rng } from './rng';
import type { Npc, World } from './types';

/**
 * Most people are just somebody she saw. When one starts to matter (she talks to them for real,
 * flirts, fights them, asks after them, someone she knows is their friend) they get filled in:
 * a character, some facts, a few ties. Everything is worked out from who they are, so it comes
 * out the same whenever, and in whatever order, it happens.
 *
 * Throwaway fighters (cops, muggers and the like who exist for a scene), machines and animals
 * are never filled in.
 */

export const canDeepen = (n: Npc): boolean =>
  !n.id.startsWith('tmp_') && n.gender !== 'none' && n.archetype !== 'puppy' && !n.tags.some((t) => ['robot', 'pet', 'dragon', 'boss'].includes(t)) && (!n.post || n.tags.includes('commander')); // a dungeon's rank and file stay faceless

export function ensureDeep(w: World, n: Npc): void {
  if (n.depth === 'deep' || !canDeepen(n)) return;
  n.depth = 'deep';
  n.character = computeCharacter(w.worldSeed, n);
  rollTies(w, n);
  n.facts = rollFacts(w, n);
  // A partner is somebody too: a name that can turn up in the world later.
  if (isFairGame(n)) {
    const partner = heartOf(w, n).partner;
    if (partner && !w.stubs[`stub:partner_of_${n.id}`] && !w.npcs[`partner_of_${n.id}`]) {
      const gender = partner.kind === 'husband' || partner.kind === 'boyfriend' ? 'man' : partner.kind === 'wife' || partner.kind === 'girlfriend' ? 'woman' : 'nonbinary';
      const rng = new Rng(`partner-age:${w.worldSeed}:${n.id}`);
      makeStub(w, { id: `stub:partner_of_${n.id}`, name: partner.name, gender, age: Math.max(18, n.age + rng.int(-6, 6)), archetype: 'patron', faction: null }, '');
      link(w, n.id, `stub:partner_of_${n.id}`, 'partner', rng.int(55, 95), rng.int(55, 95));
    }
  }
}
