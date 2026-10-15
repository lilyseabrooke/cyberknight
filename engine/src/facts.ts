import { Rng } from './rng';
import { GANGS } from './content/archetypes';
import { traitOf } from './character';
import { tiesFrom, makeStub } from './ties';
import { rollNpcName } from './content/archetypes';
import { everyoneAt } from './population';
import type { Fact, FactKind, Id, Npc, Vis, World } from './types';

/**
 * What's true about a person that Blackbird doesn't know yet: where they've been, and what they
 * want. Rolled when someone starts to matter (deepen.ts), written down as typed data, not prose,
 * and shown only when she finds it out (knowledge.ts). A fact can also be a hook: a person who
 * wants someone dead will pay her to do it; one who owes money is touchable.
 */

export const WANTS: readonly FactKind[] = ['wants_money', 'wants_revenge', 'wants_out', 'wants_to_find', 'wants_peace'];
export const isWant = (k: FactKind): boolean => WANTS.includes(k);

/** How a fact tends to show: on sight, said in passing, told if asked, or kept close. */
const VISIBILITY: Record<FactKind, [Vis, number][]> = {
  ex_member: [['visible', 6], ['asked', 4]],
  owes: [['secret', 5], ['asked', 5]],
  veteran: [['visible', 5], ['asked', 5]],
  lost_someone: [['asked', 8], ['secret', 2]],
  arrested_once: [['secret', 8], ['asked', 2]],
  was_somebody: [['asked', 7], ['overheard', 3]],
  wants_money: [['overheard', 6], ['asked', 4]],
  wants_revenge: [['asked', 5], ['secret', 5]],
  wants_out: [['secret', 1]],
  wants_to_find: [['asked', 7], ['overheard', 3]],
  wants_peace: [['asked', 1]],
};

const GANGISH = ['ganger', 'mugger', 'dealer', 'bouncer', 'cop', 'npd_officer', 'club_security'];
const CREDITORS = ['a fixer in the Stacks', 'Madame Zero', 'a loan shark with a clipboard', 'an Atlas collections office', 'a cousin who counts every neodollar'];
const WARS = ['the Fall', 'the corporate wars', 'a dragon cull', 'a long tour of the Kowloon sector'];
const BEEFS = ['a rigged card game', 'a stolen deck', 'a burned-down stall', 'something said about their mother', 'a debt that was paid twice'];
const ARRESTS = ['unlicensed cyberware', 'a rooftop incident', 'something involving a drone and a wedding', 'unpaid parking, which escalated'];
const FAMES = ['a stadium DJ', 'a prizefighter', 'a one-hit wonder', 'a corpo vice-president', 'a brief, regretted influencer'];
const MISSING = ['sister', 'brother', 'old friend', 'former partner', 'kid cousin'];

const pickVis = (rng: Rng, kind: FactKind): Vis => rng.weighted(VISIBILITY[kind], ([, wt]) => wt)[0];

/** Hand-written facts for the named cast. They replace the roll. */
export const AUTHORED_FACTS: Record<Id, Fact[]> = {
  dutch: [{ id: 'veteran', kind: 'veteran', vis: 'visible', data: { of: 'the Fall' } }, { id: 'wants_peace', kind: 'wants_peace', vis: 'asked', data: {} }],
  skeeter: [{ id: 'owes', kind: 'owes', vis: 'asked', data: { amount: 150, to: 'Madame Zero' } }],
  doc: [{ id: 'arrested_once', kind: 'arrested_once', vis: 'secret', data: { for: 'unlicensed cyberware' } }],
  ray: [{ id: 'was_somebody', kind: 'was_somebody', vis: 'asked', data: { as: 'a radio engineer people trusted' } }],
  madame: [{ id: 'wants_out', kind: 'wants_out', vis: 'secret', data: { faction: 'the Stacks' } }],
};

/**
 * Roll a person's facts: none to two, weighted by who they are. Deterministic. Revenge needs
 * someone to take it on, so it's only offered where there is one.
 */
export function rollFacts(w: World, n: Npc): Fact[] {
  const authored = AUTHORED_FACTS[n.id];
  if (authored) return authored.map((f) => ({ ...f, data: { ...f.data } }));
  const rng = new Rng(`facts:${w.worldSeed}:${n.id}:${n.name}`);
  const count = rng.weighted([0, 1, 2], (k) => [0.25, 0.45, 0.3][k]!);
  const out: Fact[] = [];
  const gangish = GANGISH.includes(n.archetype);
  const grudge = traitOf(w, n, 'grudge');
  const greed = traitOf(w, n, 'greed');
  const rivals = tiesFrom(w, n.id).filter((t) => t.kind === 'rival' && w.npcs[t.to]?.alive).map((t) => t.to);
  const peers = everyoneAt(w, n.locationId).filter((p) => p.id !== n.id && p.alive && p.gender !== 'none' && p.faction !== n.faction && !p.tags.includes('boss') && !p.id.startsWith('tmp_'));
  const target = rivals.length ? w.npcs[rng.pick(rivals)] : peers.length ? rng.pick(peers) : undefined;
  const weights: [FactKind, number][] = [
    ['ex_member', gangish ? 2 : 0.6],
    ['owes', n.archetype === 'dealer' ? 3 : n.archetype === 'patron' ? 2 : 1],
    ['veteran', n.age >= 35 ? 2 : 0.2],
    ['lost_someone', n.age >= 28 ? 1.5 : 0.5],
    ['arrested_once', 1],
    ['was_somebody', ['dj', 'dancer', 'bandmate'].includes(n.archetype) ? 3 : 0.5],
    ['wants_money', 1 + 3 * greed],
    ['wants_revenge', target ? 0.4 + 3 * grudge : 0],
    ['wants_out', gangish || n.faction === 'atlas' ? 1.5 : 0.2],
    ['wants_to_find', 1],
    ['wants_peace', n.age >= 40 ? 2 : 0.1],
  ];
  for (let i = 0; i < count; i++) {
    const free = weights.filter(([k]) => !out.some((f) => f.kind === k));
    const kind = rng.weighted(free, ([, wt]) => wt)[0];
    const fact: Fact = { id: kind, kind, vis: pickVis(rng, kind), data: {} };
    switch (kind) {
      case 'ex_member': {
        const others = Object.keys(GANGS).filter((g) => g !== n.faction);
        fact.data.faction = GANGS[rng.pick(others)]!;
        break;
      }
      case 'owes': fact.data = { amount: rng.int(40, 400), to: rng.pick(CREDITORS) }; break;
      case 'veteran': fact.data.of = rng.pick(WARS); break;
      case 'arrested_once': fact.data.for = rng.pick(ARRESTS); break;
      case 'was_somebody': fact.data.as = rng.pick(FAMES); break;
      case 'wants_money': fact.data.amount = rng.int(80, 600); break;
      case 'wants_out': fact.data.faction = n.faction ? (GANGS[n.faction] ?? n.faction) : 'this life'; break;
      case 'wants_peace': break;
      case 'lost_someone':
      case 'wants_to_find': {
        const rel = rng.pick(MISSING);
        const first = rollNpcName(rng, 'person').split(' ')[0]!;
        const surname = n.name.split(' ').slice(1).join(' ');
        const stub = makeStub(w, { name: `${first}${surname && rel !== 'old friend' && rel !== 'former partner' ? ' ' + surname : ''}`, gender: rng.chance(0.5) ? 'woman' : 'man', age: Math.max(18, n.age + rng.int(-10, 10)), archetype: 'drifter', faction: null }, `${kind}_${n.id}`);
        fact.about = stub.id;
        fact.data.rel = rel;
        break;
      }
      case 'wants_revenge': {
        fact.about = target!.id;
        fact.data = { reward: Math.round((60 + rng.int(0, 120) + target!.level * 25) / 5) * 5, mode: traitOf(w, n, 'temper') > 0.6 ? 'kill' : 'beat_up', beef: rng.pick(BEEFS) };
        break;
      }
    }
    out.push(fact);
  }
  return out;
}
