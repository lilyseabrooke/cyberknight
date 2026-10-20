import { here, fight, remember } from './combat';
import { clamp, levelRisk, type Candidate } from './candidate';
import { skillLevel, train, feel } from './skills';
import { ensureDeep } from './deepen';
import { traitOf } from './character';
import { neighboursOf, nameOf } from './ties';
import { adoptContract } from './goals';
import type { Ctx, Fact, Id, Npc, World } from './types';

/**
 * What Blackbird knows about people, and how she finds out. Everything about a person (facts,
 * ties, character) exists whether or not she's learned it; this is the layer between: she sees
 * a scar, hears a tale in passing, gets told if she asks the right person, or pays for it. The
 * text only ever says what she has learned. `Mind.known` is hers and goes with her body.
 */

export type Via = 'saw' | 'asked' | 'overheard' | 'paid' | 'tip';

export const knows = (w: World, id: Id, factId: string): boolean => !!w.mind.known?.[id]?.includes(factId);
export const unknownFacts = (w: World, n: Npc): Fact[] => (n.facts ?? []).filter((f) => !knows(w, n.id, f.id));

export function aboutName(w: World, f: Fact): { about?: string; about_g?: string } {
  if (!f.about) return {};
  const n = w.npcs[f.about];
  const s = w.stubs[f.about];
  return { about: nameOf(w, f.about), about_g: n?.gender ?? s?.gender ?? 'nonbinary' };
}

/** She finds something out. Says so. */
export function learn(c: Ctx, n: Npc, f: Fact, via: Via, source?: Npc): void {
  const { w } = c;
  ((w.mind.known ??= {})[n.id] ??= []).push(f.id);
  const d: Record<string, string | number | boolean> = { variant: f.kind, via, npc: n.name, ...aboutName(w, f) };
  for (const [k, v] of Object.entries(f.data)) d[k] = v;
  if (source) {
    d.source = source.name;
    d.source_g = source.gender;
  }
  c.emit('learn', f.kind.startsWith('wants') ? 'mixed' : 'good', d);
}

/**
 * Chatting can turn up something: the person tells her about themselves, or about someone they
 * know. Talkative, fond people say more. Returns true if anything was said.
 */
export function shareFact(c: Ctx, n: Npc): boolean {
  const { w, rng } = c;
  ensureDeep(w, n);
  const p = clamp(0.12 + 0.5 * traitOf(w, n, 'sociable') + n.affinity / 250 + 0.02 * feel(skillLevel(w.hero, 'streetwise')), 0.05, 0.85);
  if (!rng.chance(p)) return false;
  const own = unknownFacts(w, n).filter((f) => f.vis !== 'secret' || (n.affinity >= 40 && rng.chance(0.4)));
  if (own.length) {
    n.affinity += 2;
    learn(c, n, own[0]!, 'asked');
    return true;
  }
  // Failing that, gossip: something about someone they know.
  const gossip: { person: Npc; fact: Fact }[] = [];
  for (const { person } of neighboursOf(w, n.id)) {
    if (!person || !person.alive) continue;
    ensureDeep(w, person);
    for (const f of unknownFacts(w, person)) if (f.vis !== 'secret') gossip.push({ person, fact: f });
  }
  if (!gossip.length || !rng.chance(0.6 + 0.3 * (1 - traitOf(w, n, 'loyalty')))) return false;
  const g = rng.pick(gossip);
  learn(c, g.person, g.fact, 'tip', n);
  return true;
}

/** Per beat: what shows on the surface of the people around her, and what's said within earshot. */
export function noticeTick(c: Ctx): void {
  const { w, rng } = c;
  if (w.hero.injuries.includes('fried_optics') && rng.chance(0.5)) return;
  const room = here(w).filter((n) => !n.hostile && n.depth === 'deep');
  if (!room.length) return;
  for (const n of room) {
    const seen = unknownFacts(w, n).filter((f) => f.vis === 'visible');
    if (seen.length && rng.chance(0.12)) return learn(c, n, seen[0]!, 'saw');
  }
  if (room.length >= 2 && rng.chance(0.05)) {
    const n = rng.pick(room);
    const talk = unknownFacts(w, n).filter((f) => f.vis === 'overheard');
    if (talk.length) learn(c, n, talk[0]!, 'overheard');
  }
}

// ===================================================================== buying it, and taking the job

function buyInfo(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  ensureDeep(w, n);
  const price = 25 + Math.round(70 * traitOf(w, n, 'greed'));
  train(c, 'streetwise', 1);
  const pool: { person: Npc; fact: Fact }[] = [];
  const people = [n, ...neighboursOf(w, n.id).map((x) => x.person).filter((p): p is Npc => !!p && p.alive)];
  for (const person of people) {
    ensureDeep(w, person);
    for (const f of unknownFacts(w, person)) pool.push({ person, fact: f });
  }
  if (!pool.length) {
    c.emit('ask', 'bad', { variant: 'nothing', npc: n.name });
    return;
  }
  h.cash -= price;
  n.cash += price;
  n.affinity += 2;
  const pick = rng.pick(pool);
  learn(c, pick.person, pick.fact, 'paid', pick.person === n ? undefined : n);
}

function takeContract(c: Ctx, client: Npc, f: Fact): void {
  const { w } = c;
  const target = w.npcs[f.about ?? ''];
  if (!target || !target.alive) return;
  const mode = f.data.mode === 'kill' ? 'kill' : 'beat_up';
  (w.mind.contracts ??= []).push({ client: client.id, target: target.id, reward: Number(f.data.reward ?? 100), mode, taken: w.beat });
  client.affinity += 5;
  remember(client, 'hired Blackbird to settle a score');
  c.emit('contract', 'mixed', { variant: 'accept', npc: client.name, target: target.name, target_g: target.gender, amount: Number(f.data.reward ?? 100), mode });
  ensureDeep(w, target);
  adoptContract(c, target.id, mode, `${client.name} is paying for it`, 0.6);
}

export function knowledgeCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  for (const n of here(w)) {
    if (n.hostile || n.gender === 'none' || n.tags.includes('robot') || n.archetype === 'puppy') continue;
    if ((n.tags.includes('rumor') || n.tags.includes('dealer') || n.tags.includes('fixer')) && h.cash >= 25 + Math.round(70 * traitOf(w, n, 'greed'))) {
      out.push({ key: `buy_info:${n.id}`, drives: { curiosity: 0.6 }, bonus: -0.1, run: (c) => buyInfo(c, n) });
    }
    const f = (n.facts ?? []).find((x) => x.kind === 'wants_revenge' && knows(w, n.id, x.id));
    const target = f?.about ? w.npcs[f.about] : undefined;
    if (f && target?.alive && n.affinity >= 0 && !w.mind.contracts?.some((k) => k.client === n.id)) {
      const reward = Number(f.data.reward ?? 100);
      out.push({
        key: `take_contract:${n.id}`, drives: { greed: 0.7, bravery: 0.4, pride: 0.3 }, bonus: reward / 250 + n.affinity / 200,
        risk: 0.3 + levelRisk(w, target), run: (c) => takeContract(c, n, f),
      });
    }
  }
  return out;
}

// ===================================================================== grudges

/** World minutes between hearing and coming for her. */
const AVENGER_WAIT = 240;

/** Someone who loved the one she hurt finds her. */
export function avengerTick(c: Ctx): void {
  const { w, rng } = c;
  for (const n of here(w)) {
    if (!n.flags.includes('avenger') || n.hostile || !n.alive) continue;
    // They've had time to stew: not in the same breath as the fight (that's what joining in is for), but later, when she's easy to find.
    const [aboutId, , at] = n.heard?.at(-1) ?? [];
    if (at === undefined || w.clock - at < AVENGER_WAIT) continue;
    if (!rng.chance(0.1)) continue;
    n.flags = n.flags.filter((x) => x !== 'avenger');
    const about = (aboutId && (w.npcs[aboutId]?.name ?? w.stubs[aboutId]?.name)) || 'someone';
    c.emit('avenger', 'bad', { npc: n.name, about });
    n.hostile = true;
    fight(c, [n], { cause: `avenging ${about}`, assault: false, joiners: false });
    return;
  }
}
