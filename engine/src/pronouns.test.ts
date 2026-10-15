import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createWorld } from './world';
import { step } from './run';
import { render, type RenderCtx } from './text';
import { PRONOUN_TOKENS, pronounToken, pronounsFor } from './pronouns';
import { allNpcs, npcNamed, addNpc } from './population';
import { spawnNpc } from './content/archetypes';
import { personalityFrom } from './personality';
import { Rng } from './rng';
import type { GameEvent } from './types';

const ctx = (): RenderCtx => ({ rng: new Rng('p'), personality: personalityFrom({}), realName: 'Gary-Ann Fosdyke' });
const say = (ev: GameEvent): string => render(ev, ctx()).map((l) => l.text).join(' | ');

describe('pronoun tokens', () => {
  it('give each gender its own words and agreement', () => {
    expect([pronounToken('they', 'woman'), pronounToken('them', 'woman'), pronounToken('their', 'woman'), pronounToken('is', 'woman'), pronounToken('s', 'woman')]).toEqual(['she', 'her', 'her', 'is', 's']);
    expect([pronounToken('they', 'man'), pronounToken('them', 'man'), pronounToken('their', 'man'), pronounToken('themself', 'man'), pronounToken('has', 'man')]).toEqual(['he', 'him', 'his', 'himself', 'has']);
    expect([pronounToken('they', 'nonbinary'), pronounToken('their', 'nonbinary'), pronounToken('is', 'nonbinary'), pronounToken('s', 'nonbinary'), pronounToken('doesnt', 'nonbinary')]).toEqual(['they', 'their', 'are', '', "don't"]);
    expect([pronounToken('they', 'none'), pronounToken('their', 'none'), pronounToken('was', 'none')]).toEqual(['it', 'its', 'was']);
  });

  it('capitalise when asked, and default to the plural they when nobody is known', () => {
    expect(pronounToken('They', 'woman')).toBe('She');
    expect(pronounToken('Their', 'man')).toBe('His');
    expect(pronounToken('They', undefined)).toBe('They');
    expect(pronounToken('is', undefined)).toBe('are');
    expect(pronounToken('they', 'robot')).toBe('they');
    expect(pronounToken('nonsense', 'man')).toBeUndefined();
    expect(pronounsFor('woman').them).toBe('her');
  });
});

describe('in the text', () => {
  const ev = (type: string, data: GameEvent['data']): GameEvent => ({ beat: 1, type, outcome: 'good', data });

  it('uses the right words for the right person', () => {
    expect(say(ev('fridge:caught', { variant: 'caught', npc: 'Bao', npc_g: 'man' }))).toMatch(/He picks up a cleaver/);
    expect(say(ev('fridge:caught', { variant: 'caught', npc: 'Bao', npc_g: 'woman' }))).toMatch(/She picks up a cleaver/);
    expect(say(ev('fridge:caught', { variant: 'caught', npc: 'Bao', npc_g: 'nonbinary' }))).toMatch(/They pick up a cleaver/);
    expect(say(ev('fridge:caught', { variant: 'caught', npc: 'Bao' }))).toMatch(/They pick up a cleaver/);
  });

  it('can name a different person in the event', () => {
    const line = say(ev('chat:rumor_bounty', { variant: 'rumor_bounty', npc: 'Skeeter', npc_g: 'man', target: 'Rook Vance', target_g: 'woman', role: 'hacker', amount: 120, place: 'the Halo' }));
    expect(line).toMatch(/paper out on her/);
  });

  it('never leaves a token showing, in any rendered night', () => {
    const bad: string[] = [];
    for (const seed of ['tok-a', 'tok-b', 'tok-c']) {
      const w = createWorld({ seed, personality: personalityFrom({ impress: 0.8, romantic: 0.7, temper: 0.7 }) });
      for (let b = 0; b < 300 && !w.over; b++) for (const e of step(w)) for (const l of render(e, ctx())) if (/[{}]/.test(l.text)) bad.push(`${e.type}:${e.data.variant} → ${l.text}`);
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it('only uses tokens that exist (no typos waiting to happen)', () => {
    const src = readFileSync(new URL('./text.ts', import.meta.url), 'utf8');
    const unknown = new Set<string>();
    for (const m of src.matchAll(/(?<![$\w])\{(\w+)(?::(\w+))?\}/g)) if (!PRONOUN_TOKENS.has(m[1]!) && !['hero', 'real', 'short'].includes(m[1]!)) unknown.add(m[0]);
    expect([...unknown]).toEqual([]);
  });
});

describe('events know who they are about', () => {
  it('carry the gender of the person named, as it really is', () => {
    let tagged = 0;
    for (const seed of ['g1', 'g2', 'g3']) {
      const w = createWorld({ seed });
      for (let b = 0; b < 250 && !w.over; b++) {
        for (const e of step(w)) {
          const g = e.data.npc_g;
          if (g === undefined) continue;
          tagged++;
          const matches = allNpcs(w).filter((n) => n.name === e.data.npc);
          expect(matches.some((n) => n.gender === g), `${e.type}: ${e.data.npc}`).toBe(true);
        }
      }
    }
    expect(tagged).toBeGreaterThan(20);
  }, 120_000);

  it('find a person by name, preferring the one in the room', () => {
    const w = createWorld({ seed: 'names' });
    const twin = spawnNpc(new Rng('t'), 'twin', 'patron', 'street_main', { name: 'Tiny', gender: 'woman' });
    addNpc(w, twin);
    expect(npcNamed(w, 'Tiny')!.id).toBe('tiny'); // the bouncer, in the bar with her
    w.hero.locationId = 'street_main';
    expect(npcNamed(w, 'Tiny')!.id).toBe('twin');
    expect(npcNamed(w, 'Nobody At All')).toBeUndefined();
  });
});
