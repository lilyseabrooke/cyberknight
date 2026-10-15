import { Rng } from './rng';
import { rollNpcName, spawnNpc } from './content/archetypes';
import { clamp, type Candidate } from './candidate';
import { fight, here, remember } from './combat';
import { synergy, train } from './skills';
import { AWAY, addNpc, moveNpc } from './population';
import { ageGap, isFairGame } from './people';
import { ensureDeep } from './deepen';
import { materialize } from './ties';
import type { Ctx, Feelings, Heart, Id, Npc, Partner, Stage, World } from './types';

/**
 * Who Blackbird is something with, and what they each think that is.
 *
 * Both sides keep their own record. `Npc.bond` is how *they* feel about *her*; `Mind.bonds` is how
 * *she* feels about *them*. Nothing makes the two agree: she can think it was a fling while
 * they've started saying "my girlfriend", or the other way round. Hers resets with each new body;
 * theirs doesn't, so a lover from a past run can greet a stranger.
 *
 * Everyone Blackbird considers fair game (people.ts) is a possible romance, whatever their
 * situation. Some have a partner. That makes it less likely to work, never impossible, and it
 * isn't what stops her. What stops her is nothing: she's relentless.
 */

const MIN_DAY = 1440;
const traits = (w: World) => w.hero.personality.traits;
const RANK: Record<Stage, number> = { interest: 0, fling: 1, seeing: 2, together: 3, ex: -1 };

// ===================================================================== how someone is wired

/** Their love life, rolled the first time it matters and stable from then on. */
export function heartOf(w: World, n: Npc): Heart {
  if (n.heart) return n.heart;
  const rng = new Rng(`heart:${w.worldSeed}:${n.id}:${n.name}`);
  const heart: Heart = { loyal: 0.1 + 0.85 * rng.next(), content: rng.next(), spark: rng.next(), clingy: rng.next(), exes: [] };
  const taken = n.age < 25 ? 0.18 : n.age < 40 ? 0.38 : 0.45;
  if (!n.flags.includes('single') && rng.chance(taken)) {
    const r = rng.next();
    const gender = n.gender === 'woman' ? (r < 0.6 ? 'man' : r < 0.96 ? 'woman' : 'nonbinary') : r < 0.5 ? 'woman' : r < 0.95 ? 'man' : 'nonbinary';
    const years = rng.int(1, Math.max(1, Math.min(25, n.age - 19)));
    const married = years >= 4 && rng.chance(0.6);
    const kind: Partner['kind'] = gender === 'man' ? (married ? 'husband' : 'boyfriend') : gender === 'woman' ? (married ? 'wife' : 'girlfriend') : 'partner';
    heart.partner = { name: rollNpcName(rng, 'person').split(' ')[0]!, kind, years };
  }
  n.heart = heart;
  return heart;
}

export const partnerOf = (n: Npc): Partner | undefined => n.heart?.partner;

/** How much a partner (and the years between them) get in the way. Negative or zero; added to odds. */
export function romanceMod(w: World, n: Npc): number {
  const h = heartOf(w, n);
  let m = 0;
  if (h.partner) m -= 0.5 * h.loyal * (0.35 + 0.65 * h.content);
  m -= Math.min(0.25, Math.max(0, ageGap(n) - 12) * 0.012);
  const theirs = n.bond;
  if (theirs) {
    if (theirs.stage === 'ex') m -= theirs.ended?.how === 'was_left' ? 0.2 : 0.05;
    else m += 0.1 * RANK[theirs.stage];
  }
  m += (h.spark - 0.5) * 0.2;
  return m;
}

/** Her conscience, such as it is: knowing someone's taken weighs on some of her more than others. Added to a candidate's score. */
export function scruples(w: World, n: Npc): number {
  const hers = w.mind.bonds?.[n.id];
  if (!hers?.knowsPartner || !partnerOf(n)) return 0;
  const t = traits(w);
  const conscience = clamp(0.5 * (t.honesty - 0.5) + 0.4 * (t.kindness - 0.5) - 0.35 * (t.mischief - 0.5) - 0.2 * (t.thrill - 0.5), 0, 0.5);
  return -3 * conscience;
}

// ===================================================================== the two ledgers

const blank = (w: World, stage: Stage): Feelings => ({ stage, ardor: 0, since: w.clock, seen: w.clock, checked: w.clock, nights: 0 });

export const hersFor = (w: World, n: Npc): Feelings | undefined => w.mind.bonds?.[n.id];

/** Both records, made if they don't exist yet. */
export function ensureBond(w: World, n: Npc, stage: Stage = 'interest'): { hers: Feelings; theirs: Feelings } {
  w.mind.bonds ??= {};
  const hers = (w.mind.bonds[n.id] ??= blank(w, stage));
  const theirs = (n.bond ??= blank(w, stage));
  return { hers, theirs };
}

function setStage(w: World, f: Feelings, stage: Stage): void {
  if (f.stage === stage) return;
  f.stage = stage;
  f.since = w.clock;
  if (stage !== 'ex') delete f.ended;
}

function endIt(w: World, f: Feelings, how: NonNullable<Feelings['ended']>['how']): void {
  setStage(w, f, 'ex');
  f.ended = { how, at: w.clock };
}

type Contact = 'flirt' | 'kiss' | 'date' | 'night';
const THEIRS: Record<Contact, number> = { flirt: 6, kiss: 12, date: 10, night: 22 };
const HERS: Record<Contact, number> = { flirt: 5, kiss: 10, date: 8, night: 18 };

/**
 * Something happened between them. Feelings move on both sides, by their own rules: they fall
 * for a good night according to how clingy they are, she by how romantic she is, which isn't often.
 */
export function bondEvent(c: Ctx, n: Npc, kind: Contact): void {
  const { w, rng } = c;
  ensureDeep(w, n);
  const heart = heartOf(w, n);
  const { hers, theirs } = ensureBond(w, n);
  const t = traits(w);
  hers.seen = theirs.seen = hers.checked = theirs.checked = w.clock;
  theirs.ardor = clamp(theirs.ardor + THEIRS[kind] * (0.5 + heart.spark), 0, 100);
  hers.ardor = clamp(hers.ardor + HERS[kind] * (0.6 + 0.8 * t.romantic), 0, 100);
  if (kind === 'night') {
    hers.nights++;
    theirs.nights++;
  }
  const cheating = !!heart.partner;

  // Theirs.
  if (theirs.stage === 'ex') {
    if (kind === 'night') setStage(w, theirs, heart.clingy > 0.6 && !cheating ? 'seeing' : 'fling');
  } else if (kind === 'night' || kind === 'date') {
    if (theirs.stage === 'interest') setStage(w, theirs, 'fling');
    if (theirs.stage === 'fling' && (theirs.nights >= 3 || (theirs.nights >= 2 && heart.clingy > 0.35) || (theirs.nights >= 1 && heart.clingy > 0.7))) setStage(w, theirs, 'seeing');
    if (theirs.stage === 'seeing' && !cheating && theirs.nights >= 4 && heart.clingy > 0.5 && theirs.ardor > 50) setStage(w, theirs, 'together');
  }
  // Hers.
  if (hers.stage === 'ex') {
    if (kind === 'night') setStage(w, hers, t.romantic > 0.6 ? 'seeing' : 'fling');
  } else if (kind === 'night' || kind === 'date') {
    if (hers.stage === 'interest') setStage(w, hers, 'fling');
    if (hers.stage === 'fling' && (hers.nights >= 5 || (hers.nights >= 3 && t.romantic > 0.55) || (hers.nights >= 2 && t.romantic > 0.85))) setStage(w, hers, 'seeing');
    if (hers.stage === 'seeing' && hers.nights >= 6 && t.romantic > 0.7) setStage(w, hers, 'together');
  }

  // Finding out: the ring, the photo, the mention; and after a night, the whole story.
  if (heart.partner && !hers.knowsPartner && (kind === 'night' || rng.chance(0.3))) {
    hers.knowsPartner = true;
    c.emit('taken', 'mixed', { variant: kind === 'night' ? 'after' : rng.pick(['ring', 'mention', 'photo']), npc: n.name, partner: heart.partner.name, kind: heart.partner.kind });
  }
  // Somebody will hear about it.
  if (heart.partner && kind === 'night' && rng.chance(0.3)) c.w.counters[`confront:${n.id}`] ??= w.beat + rng.int(6, 30);
}

// ===================================================================== odds

/** Their side of the odds of leaving a partner for her. */
export function leaveOdds(w: World, n: Npc): number {
  const h = heartOf(w, n);
  if (!h.partner) return 1;
  const hero = w.hero;
  const p = 0.02 + 0.22 * (1 - h.loyal) + 0.18 * (1 - h.content) + 0.1 * h.spark + clamp(n.affinity, -40, 60) / 500 + hero.charm * 0.005 + 0.03 * synergy(hero, ['romance', 'stat:charm']) - Math.min(0.2, Math.max(0, ageGap(n) - 12) * 0.01);
  return clamp(p, 0.02, 0.65);
}

// ===================================================================== things she does about it

function poach(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const heart = heartOf(w, n);
  const partner = heart.partner;
  if (!partner) return;
  train(c, 'romance', 2);
  const { hers, theirs } = ensureBond(w, n);
  hers.ardor = clamp(hers.ardor + 4, 0, 100);
  const base = { npc: n.name, partner: partner.name, kind: partner.kind };
  const them = partner.id ? w.npcs[partner.id] : undefined;
  const witness = them && them.alive && them.locationId === h.locationId && !them.hostile ? them : undefined;

  if (rng.chance(leaveOdds(w, n))) {
    heart.exes.push(partner.name);
    delete heart.partner;
    n.affinity += 15;
    remember(n, `left ${partner.name} for Blackbird`);
    theirs.ardor = clamp(theirs.ardor + 25, 0, 100);
    if (theirs.stage === 'ex' || theirs.stage === 'interest') setStage(w, theirs, heart.clingy > 0.55 ? 'seeing' : 'fling');
    if (hers.stage === 'interest') setStage(w, hers, 'fling');
    hers.knowsPartner = false;
    c.emit('poach', 'good', { ...base, variant: 'win' });
    if (witness) {
      witness.affinity -= 60;
      witness.hostile = rng.chance(0.6);
      if (witness.hostile) fight(c, [witness], { cause: `${n.name} leaving ${partner.name}`, assault: false, joiners: false });
    } else if (rng.chance(0.4)) {
      c.w.counters[`confront:${n.id}`] ??= w.beat + rng.int(10, 40);
    }
    return;
  }
  n.affinity -= 10;
  if (witness && rng.chance(0.6)) {
    c.emit('poach', 'bad', { ...base, variant: 'caught' });
    witness.hostile = true;
    fight(c, [witness], { cause: `trying it on with ${n.name}`, assault: false, joiners: false });
    return;
  }
  if (rng.chance(0.25)) {
    h.hp -= 2;
    c.emit('poach', 'bad', { ...base, variant: 'slap' });
  } else {
    c.emit('poach', 'bad', { ...base, variant: 'lose' });
  }
  if (rng.chance(0.3)) c.w.counters[`confront:${n.id}`] ??= w.beat + rng.int(6, 30);
}

function reconcile(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const heart = heartOf(w, n);
  const { hers, theirs } = ensureBond(w, n);
  train(c, 'romance', 1);
  const theirEnd = theirs.ended?.how;
  const residue = theirs.stage === 'ex' ? theirs.ardor / 100 : 0.5;
  const p = clamp(0.1 + 0.5 * residue + n.affinity / 250 + (theirEnd === 'was_left' ? -0.1 : theirEnd === 'chose_partner' ? 0.05 : 0.1) + romanceMod(w, n) * 0.5, 0.05, 0.8);
  if (rng.chance(p)) {
    setStage(w, theirs, heart.clingy > 0.5 ? 'seeing' : 'fling');
    setStage(w, hers, traits(w).romantic > 0.55 ? 'seeing' : 'fling');
    theirs.ardor = clamp(theirs.ardor + 20, 0, 100);
    hers.ardor = clamp(hers.ardor + 20, 0, 100);
    hers.seen = theirs.seen = hers.checked = theirs.checked = w.clock;
    n.affinity += 12;
    remember(n, 'got back together with Blackbird');
    c.emit('reconcile', 'good', { variant: 'win', npc: n.name });
  } else {
    n.affinity -= 6;
    theirs.ardor = clamp(theirs.ardor - 8, 0, 100);
    c.emit('reconcile', 'bad', { variant: 'lose', npc: n.name });
  }
}

function breakUp(c: Ctx, n: Npc): void {
  const { w } = c;
  const { hers, theirs } = ensureBond(w, n);
  endIt(w, hers, 'left');
  if (theirs.stage !== 'ex' && theirs.stage !== 'interest') {
    endIt(w, theirs, 'was_left');
    n.affinity -= 25;
    remember(n, 'was dumped by Blackbird');
  }
  c.emit('breakup', 'mixed', { variant: 'blackbird', npc: n.name, stage: theirs.stage });
}

// ===================================================================== what she might do

export function bondCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  for (const n of here(w)) {
    if (!isFairGame(n) || n.hostile) continue;
    const hers = hersFor(w, n);
    const theirs = n.bond;
    const heart = n.heart;
    // The relentless option: she knows she's taken, and tries anyway.
    if (hers?.knowsPartner && heart?.partner) {
      out.push({
        key: `poach:${n.id}`, drives: { lust: 1.2, pride: 0.6, bravery: 0.2 }, bonus: 0.4 + Math.min(n.affinity, 50) / 120 + scruples(w, n),
        risk: 0.4 + (heart.partner.id && w.npcs[heart.partner.id]?.locationId === w.hero.locationId ? 0.9 : 0),
        run: (c) => poach(c, n),
      });
    }
    // Getting back with someone.
    if (hers?.stage === 'ex' && (hers.ardor >= 15 || (theirs?.stage === 'ex' && theirs.ardor >= 30))) {
      out.push({
        key: `reconcile:${n.id}`, drives: { lust: 0.9, pride: 0.3 }, bonus: hers.ardor / 70 + (theirs?.ardor ?? 0) / 200 - (hers.ended?.how === 'left' ? 0.4 : 0),
        run: (c) => reconcile(c, n),
      });
    }
    // Ending it, when it's gone cold.
    if (hers && RANK[hers.stage] >= 2 && hers.ardor < 30) {
      out.push({ key: `break_up:${n.id}`, drives: {}, bonus: 1.4 - hers.ardor / 25, run: (c) => breakUp(c, n) });
    }
  }
  return out;
}

// ===================================================================== what time and company do

/**
 * Once a beat, for whoever she's with: absence cools people, a cold stretch ends things, and the
 * two of them find out they've been calling it different names. Time is the world's clock, applied
 * on meeting rather than simulated while they were apart.
 */
export function bondTick(c: Ctx): void {
  const { w } = c;
  for (const n of here(w)) {
    if (!isFairGame(n) || n.hostile) continue;
    const theirs = n.bond;
    const hers = hersFor(w, n);
    if (!theirs && !hers) {
      recall(c, n);
      continue;
    }
    for (const f of [theirs, hers]) if (f) cool(w, f, f === theirs ? n.heart?.clingy ?? 0.5 : traits(w).romantic);
    if (theirs && theirs.stage !== 'ex' && theirs.stage !== 'interest' && RANK[theirs.stage] >= 2 && theirs.ardor < 12 && w.clock - theirs.seen > MIN_DAY) {
      endIt(w, theirs, 'drifted');
      if (hers && hers.stage !== 'ex') endIt(w, hers, 'was_left');
      remember(n, 'drifted apart from Blackbird');
      c.emit('breakup', 'bad', { variant: 'drift', npc: n.name });
    }
    if (hers && RANK[hers.stage] >= 2 && hers.ardor < 5 && w.clock - hers.seen > MIN_DAY) {
      breakUp(c, n);
    }
    if (hers && theirs) {
      hers.seen = theirs.seen = w.clock;
      noticeMismatch(c, n, hers, theirs);
    } else if (!hers && theirs) {
      recall(c, n);
    }
  }
}

/** Absence cools. Applied when they're next in the same room. */
function cool(w: World, f: Feelings, grip: number): void {
  const away = w.clock - f.checked;
  f.checked = w.clock;
  if (away < 30) return;
  f.ardor = clamp(f.ardor - (away / MIN_DAY) * (7 - 5 * grip), 0, 100);
}

/** She thinks it's a fling; they think it's a relationship. Or the other way round. Said out loud once. */
function noticeMismatch(c: Ctx, n: Npc, hers: Feelings, theirs: Feelings): void {
  if (hers.stage === 'ex' || theirs.stage === 'ex' || hers.stage === 'interest' || theirs.stage === 'interest') return;
  const gap = RANK[theirs.stage] - RANK[hers.stage];
  if (gap === 0 || hers.noticed === theirs.stage) return;
  hers.noticed = theirs.stage;
  c.emit('dtr', 'mixed', { variant: gap > 0 ? 'they_more' : 'she_more', npc: n.name, theirStage: theirs.stage, herStage: hers.stage });
  if (gap > 0) n.affinity -= 3;
}

/** A lover from before she was rebuilt, greeting someone who doesn't remember them. Once. */
function recall(c: Ctx, n: Npc): void {
  const { w } = c;
  const theirs = n.bond;
  if (!theirs || theirs.stage === 'interest' || w.flags[`recalled:${n.id}`]) return;
  w.flags[`recalled:${n.id}`] = true;
  c.emit('recall', 'mixed', { variant: theirs.stage === 'ex' ? 'ex' : 'lover', npc: n.name, nights: theirs.nights });
}

// ===================================================================== somebody turns up

/** Per beat: a partner who has heard something arrives. */
export function partnerArrives(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  for (const key of Object.keys(w.counters)) {
    if (!key.startsWith('confront:')) continue;
    const id = key.slice('confront:'.length);
    const due = w.counters[key]!;
    const n = w.npcs[id];
    if (!n || !n.alive || !n.heart?.partner) { delete w.counters[key]; continue; }
    if (w.beat < due) continue;
    if (n.locationId !== h.locationId || n.hostile) {
      if (w.beat > due + 40) delete w.counters[key];
      continue;
    }
    delete w.counters[key];
    const p = n.heart.partner;
    const partner = bringPartner(c, n, p);
    const base = { npc: n.name, partner: p.name, kind: p.kind };
    const { theirs, hers } = ensureBond(w, n);
    const roll = rng.next();
    if (roll < 0.5) {
      c.emit('partner_arrives', 'bad', { ...base, variant: 'fight' });
      partner.hostile = true;
      partner.affinity -= 60;
      fight(c, [partner], { cause: `${p.name} finding out about ${n.name}`, assault: false, joiners: false });
    } else if (roll < 0.5 + 0.5 * (n.heart.loyal * (0.4 + 0.6 * n.heart.content))) {
      c.emit('partner_arrives', 'bad', { ...base, variant: 'chose' });
      if (theirs.stage !== 'ex') endIt(w, theirs, 'chose_partner');
      hers.ardor = clamp(hers.ardor - 10, 0, 100);
      moveNpc(w, n, n.home && w.locations[n.home] ? n.home : AWAY);
      moveNpc(w, partner, AWAY);
    } else {
      c.emit('partner_arrives', 'mixed', { ...base, variant: 'dumped' });
      n.heart.exes.push(p.name);
      delete n.heart.partner;
      theirs.ardor = clamp(theirs.ardor + 15, 0, 100);
      moveNpc(w, partner, AWAY);
    }
    return;
  }
}

/** The person on the other end of someone's partnership, made real and put in the room. */
function bringPartner(c: Ctx, n: Npc, p: Partner): Npc {
  const { w } = c;
  const existing = p.id ? w.npcs[p.id] : undefined;
  if (existing) {
    moveNpc(w, existing, w.hero.locationId);
    return existing;
  }
  const id = `partner_of_${n.id}`;
  const stub = w.stubs[`stub:${id}`];
  if (stub) {
    const person = materialize(w, stub.id, w.hero.locationId)!;
    person.memories.push(`is with ${n.name}`);
    p.id = id;
    return person;
  }
  const gender = p.kind === 'husband' || p.kind === 'boyfriend' ? 'man' : p.kind === 'wife' || p.kind === 'girlfriend' ? 'woman' : 'nonbinary';
  const person = spawnNpc(new Rng(`partner:${w.worldSeed}:${id}`), id, 'patron', w.hero.locationId, { name: p.name, gender, age: Math.max(18, n.age + new Rng(`pa:${id}`).int(-6, 6)) });
  person.memories.push(`is with ${n.name}`);
  addNpc(w, person);
  p.id = id;
  return person;
}

/** Everybody in the room who has a claim on someone else in it, for the jealousy rule. */
export const lovedHere = (w: World, except: Id): Npc[] =>
  here(w).filter((r) => r.id !== except && isFairGame(r) && !r.hostile && (!!r.bond && r.bond.stage !== 'ex' && r.bond.stage !== 'interest' && r.bond.ardor >= 15));
