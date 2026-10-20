import type { Booking, Ctx, Id, Item, Recording, World } from './types';
import type { Candidate } from './candidate';
import { register } from './affordances';
import { acquire, addHeat, fight, gainXp, here } from './combat';
import { makeItem } from './content/items';
import { STUDIO, studioRate } from './content/studios';
import { SKILLS, type SkillId } from './content/skills';
import { odds, skillLevel, synergy, train } from './skills';
import { hasInstrument, instrumentBonus } from './instruments';
import { MIN_PER_DAY } from './clock';
import { songbook } from './songs';
import { audience, block, expectation, streetOf } from './renown';
import { bookedTonight } from './bookings';
import { fameFrom } from './stage';
import { banned, find, rowCandidates, say, venueAt, type VenueView } from './venuekit';
import { STUDIO_ROWS } from './content/studioafford';
import { STUDIO_EVENTS } from './content/studioevents';

register('studio', [...STUDIO_ROWS, ...STUDIO_EVENTS]);

/**
 * Recording studios, as a system. Her hands reset with every body; a take on tape does not. So a studio is where a good night
 * is kept, and a past life can still be put on:
 *
 *   record      a take at the grade she plays now (plus the room, the engineer, the console), into `legacy.records`
 *   ghost take  a session player plays it for her, at their grade, under her name. They want credit eventually
 *   dub         a cassette of one of her masters, to carry (the gear resets; the master doesn't)
 *   press       copies into the world. Copies earn royalties, into `legacy.account`, every day, dead or alive
 *   relisten    her own past-life master, of a grade above her hands: her ears remember what her fingers don't (skill XP)
 *   mime        a dubbed cassette over the PA, anywhere with a crowd: the crowd judges the tape, not her. Caught is a scandal
 *   bury        (an Atlas hold-music studio) her song hidden in the dragons' broadcast loop: they play it, and are slower to notice her
 *
 * The rows (content/studioafford.ts, studioevents.ts) are everything else a studio is good for. Nothing here is balanced:
 * royalties from a famous past life can fund the lab on their own, and that is fine.
 */

export const RECORDABLE = ['guitar', 'vocals', 'djing', 'beatbox'] as const;
const label = (skill: string): string => SKILLS[skill as SkillId]?.label ?? skill;

export const records = (w: World): Recording[] => (w.legacy.records ??= []);
export const recordById = (w: World, id: string): Recording | undefined => w.legacy.records?.find((r) => r.id === id);

/** What a session here costs her: two hours at the house rate. */
export const sessionCost = (v: VenueView): number => 2 * studioRate(v.info) * (v.sit?.def.price ?? 1);

/** Can she play this here? A guitar take needs a guitar: hers, or one off the house rack. */
export function canPlay(w: World, v: VenueView, skill: string): boolean {
  if (skill === 'guitar') return hasInstrument(w.hero) || v.features.includes('guitar_rack');
  if (skill === 'djing') return v.features.includes('mixing_desk') || v.features.includes('tape_machine');
  return true;
}

/** How good the take comes out: her hands, plus the room. */
export function takeGrade(c: Ctx, v: VenueView, skill: string): number {
  const { w, rng } = c;
  const h = w.hero;
  let g = skillLevel(h, skill as SkillId) + instrumentBonus(h, skill) + 1.5 * v.info.tier;
  if (find(v, 'tag:engineer')) g += 2;
  if (v.info.traits.includes('legendary_console')) g += 4;
  if (v.info.traits.includes('analog_only')) g += 1;
  if (skill === 'vocals' && v.features.includes('echo_chamber')) g += 2;
  if (skill === 'vocals' && v.info.wild === 'golden_mic') g += 8;
  if (v.info.wild === 'haunted') g += 6;
  g += rng.int(-4, 4);
  if (v.info.wild === 'one_take') g *= rng.chance(0.5) ? 1.15 : 0.6;
  if (v.info.wild === 'time_loop') {
    const best = records(w).filter((r) => r.skill === skill).reduce((m, r) => Math.max(m, r.grade), 0);
    if (best) g = best;
  }
  return Math.max(1, Math.min(100, Math.round(g)));
}

const ADJ = ['Neon', 'Borrowed', 'Last', 'Second', 'Broken', 'Electric', 'Quiet', 'Cheap', 'Burning', 'Unlicensed', 'Midnight', 'Stolen'];
const NOUN = ['Hours', 'Static', 'Signal', 'Halo', 'Chorus', 'Rain', 'Overpass', 'Riot', 'Wires', 'Lights', 'Heart', 'Feedback'];

/** A title: a song from the book she hasn't put on tape yet, or one the engineer makes up for the label. */
function titleFor(c: Ctx, skill: string): string {
  const done = new Set(records(c.w).map((r) => r.title));
  const fresh = songbook(c.w).filter((s) => !done.has(s.title));
  if (fresh.length && skill !== 'beatbox') return fresh[fresh.length - 1]!.title;
  return `${c.rng.pick(ADJ)} ${c.rng.pick(NOUN)}`;
}

function labelFor(w: World, v: VenueView): string {
  if (v.info.variant === 'muse' || v.info.wild === 'free_studio') return 'muse';
  if (v.info.variant === 'van' || v.info.traits.includes('bootleg_ring')) return 'pirate';
  return 'indie';
}

const newId = (w: World): string => `rec${w.legacy.runs}.${w.beat}.${records(w).length}`;

/** Put a take on tape. Silent apart from the line it tells. */
export function recordTake(c: Ctx, v: VenueView, skill: string): Recording | null {
  const { w } = c;
  const h = w.hero;
  const cost = Math.round(sessionCost(v));
  if (h.cash < cost) {
    say(c, v, 'record.broke', 'bad', ['Blackbird does not have the {pay}nd for two hours in {venue}.'], ['Studios are a scam. A beautiful scam.'], { pay: cost });
    return null;
  }
  h.cash -= cost;
  const grade = takeGrade(c, v, skill);
  const lab = labelFor(w, v);
  const rec: Recording = { id: newId(w), title: titleFor(c, skill), skill, grade, run: w.legacy.runs, studio: v.main.name, label: lab, copies: lab === 'muse' ? 500 : 0 };
  records(w).push(rec);
  train(c, skill as SkillId, 2);
  train(c, 'music', 1);
  gainXp(c, 5);
  const engineer = find(v, 'tag:engineer') ?? find(v, 'owner');
  const tok = { pay: cost, title: rec.title, grade, skill: label(skill), npc: engineer?.name ?? 'the engineer' };
  const was = expectation(w, skill);
  say(c, v, 'record', 'good', [
    'Two hours in {venue}, {pay}nd, and one take {npc} does not ask her to do again: "{title}", {skill}, grade {grade} on the tape. It will be grade {grade} long after her hands are not.',
    'Blackbird records "{title}" at {venue}. {npc} rides the faders, says nothing for four minutes, then plays it back twice. Grade {grade}. It is on tape now, for good.',
    'The red light goes on at {venue}. "{title}", {skill}, one take and a half. {npc} labels the reel in marker: GRADE {grade}. KEEP.',
  ], lab === 'muse'
    ? ['Muse owns it. I own the feeling. That has to count for something.', 'Five hundred copies by Tuesday. Of which I see a fifth. Of a fifth.']
    : grade < was - 3
      ? ['It is fine. It is not what they remember. Nothing is.', 'Grade ' + grade + '. The old me would laugh. The old me is not here.']
      : ['That is going to outlive me. Several times.', 'I sound incredible. The tape agrees.'], tok, { title: rec.title, grade });
  return rec;
}

/** What the house session player charges to be her, for a take. */
export const ghostFee = (v: VenueView): number => Math.round(sessionCost(v) + 3 * Number(v.info.keep?.ghost ?? 30));
export const ghostGrade = (v: VenueView): number => Number(v.info.keep?.ghost ?? 30);

/** A session player plays it, under her name. */
export function ghostTake(c: Ctx, v: VenueView, skill: string): Recording | null {
  const { w } = c;
  const h = w.hero;
  const fee = ghostFee(v);
  if (h.cash < fee) return null;
  h.cash -= fee;
  const who = find(v, 'tag:session');
  const ghost = who?.name ?? c.rng.pick(['Dora Fretwell', 'Mack Six-Strings', 'Lou Tremolo', 'Ines Capo']);
  const rec: Recording = { id: newId(w), title: titleFor(c, skill), skill, grade: ghostGrade(v), run: w.legacy.runs, studio: v.main.name, label: 'ghost', copies: 0, ghost };
  records(w).push(rec);
  if (who) who.affinity += 4;
  say(c, v, 'ghost', 'mixed', [
    'Blackbird pays {ghost} {pay}nd and sits on the couch while {ghost} plays "{title}" as her, note for note, better than she could. Grade {grade}, under her name. {ghost} does not sign anything. Yet.',
    '{ghost} takes {pay}nd, a guitar and a look at an old live tape of hers, and plays "{title}" as Blackbird used to. Grade {grade}. It is her record now. Mostly.',
  ], ['Technically I was in the room. That is a credit.', 'Everyone does it. Nobody says. I will not say.'], { ghost, pay: fee, title: rec.title, grade: rec.grade }, { title: rec.title });
  return rec;
}

/** A cassette of one of her masters, to carry. */
export const dubCost = (v: VenueView): number => Math.max(5, Math.round(studioRate(v.info) / 2));

export function dubOf(rec: Recording): Item {
  const it = makeItem('master_tape');
  it.name = `cassette dub of "${rec.title}" (${label(rec.skill)}, grade ${rec.grade})`;
  it.tags.push(`rec:${rec.id}`);
  return it;
}

export const dubbed = (w: World): Recording[] => {
  const ids = new Set(w.hero.inventory.flatMap((i) => i.tags.filter((t) => t.startsWith('rec:')).map((t) => t.slice(4))));
  return records(w).filter((r) => ids.has(r.id));
};

export function dubTape(c: Ctx, v: VenueView, rec: Recording): void {
  const h = c.w.hero;
  const cost = dubCost(v);
  if (h.cash < cost) return;
  h.cash -= cost;
  acquire(c, dubOf(rec));
  say(c, v, 'dub', 'good', [
    '{npc} spools "{title}" off the master onto a cassette for {pay}nd, writes GRADE {grade} on the spine and hands it over without comment.',
    'A cassette dub of "{title}", warm from the machine, {pay}nd. It is a past Blackbird in a plastic case.',
  ], ['Pocket-sized me. The good one.', 'If anyone asks, that is a live recording. Of me. Live.'], { pay: cost, title: rec.title, grade: rec.grade, npc: (find(v, 'tag:engineer') ?? find(v, 'owner'))?.name ?? 'the engineer' });
}

/** Copies, into the world. */
export const pressCost = (v: VenueView): number => Math.round((v.info.variant === 'plant' ? 40 : 90) * (v.sit?.def.price ?? 1));
export const pressRun = (v: VenueView): number => (v.info.variant === 'plant' ? 500 : 200);

export function pressRecord(c: Ctx, v: VenueView, rec: Recording): void {
  const { w } = c;
  const h = w.hero;
  const cost = pressCost(v);
  if (h.cash < cost || rec.label === 'muse') return;
  h.cash -= cost;
  const n = pressRun(v);
  rec.copies += n;
  // Off the books, it's contraband: a box comes back to her too.
  const bootleg = rec.label === 'pirate' || (!!w.legacy.muse?.lettered && !w.legacy.muse.signed);
  if (bootleg) acquire(c, makeItem('bootleg_tapes'));
  say(c, v, 'press', 'good', [
    '{pay}nd and the press at {venue} thumps out {n} copies of "{title}". They will be in shops by morning, and in the bins by Christmas, and in somebody\'s heart in between.',
    '{n} copies of "{title}" come off the line at {venue}, warm and smelling of plastic. {pay}nd. Every one of them pays her a little, forever.',
  ], bootleg ? ['Contraband. Mine. The best kind.', 'Muse will hate this. That is a feature.'] : ['Royalties. The money that comes when you are not looking.', 'I am a product now. A good one.'], { pay: cost, n, title: rec.title });
}

/** Her own master from a past life, above her hands: what she can learn back from it. */
export const relistenable = (w: World, rec: Recording): boolean =>
  rec.run < w.legacy.runs && rec.label !== 'ghost' && rec.label !== 'jingle' && rec.grade > skillLevel(w.hero, rec.skill as SkillId) + 2 && !w.counters[`relisten:${rec.id}`];

export function relisten(c: Ctx, v: VenueView, rec: Recording): void {
  const { w } = c;
  const gap = rec.grade - skillLevel(w.hero, rec.skill as SkillId);
  w.counters[`relisten:${rec.id}`] = 1;
  const xp = Math.round(4 + gap * 0.6);
  train(c, rec.skill as SkillId, xp);
  gainXp(c, 3);
  say(c, v, 'relisten', 'good', [
    'Blackbird sits in {venue} with the headphones on and plays "{title}", a take from a body she does not have any more. Grade {grade}. Her hands do not remember it. Her ears do, and by the third listen her fingers are moving.',
    'The master of "{title}" goes on the machine at {venue}. An older Blackbird plays it, grade {grade}, and this one learns it back off her, one bar at a time.',
  ], ['She was good. I am her. Therefore.', 'It is like being taught by a better twin who is also me. Rude, but useful.'], { title: rec.title, grade: rec.grade });
}

/** Her song, in the dragons' loop. */
export const buried = (w: World): boolean => (w.legacy.buriedUntil ?? -1) >= w.legacy.runs;

export function burySong(c: Ctx, v: VenueView): void {
  const { w, rng } = c;
  const h = w.hero;
  const song = songbook(w)[songbook(w).length - 1];
  const p = odds(0.15, 0.06, synergy(h, ['guitar', ['tinkering', 0.6], ['sneak', 0.4]])) + (v.sit?.def.tags.includes('broadcast') ? 0.15 : 0);
  const tok = { title: song?.title ?? 'her song' };
  if (rng.chance(p)) {
    w.legacy.buriedUntil = w.legacy.runs + 3 + (v.sit?.def.tags.includes('broadcast') ? 2 : 0);
    fameFrom(c, 3, 'dragon_song');
    addHeat(w, 'atlas', 1);
    train(c, 'guitar', 3);
    train(c, 'tinkering', 2);
    gainXp(c, 12);
    say(c, v, 'bury.win', 'good', [
      'While the voice artist is on a tea break, Blackbird slips "{title}" under the lockdown chime on next month\'s broadcast reel at {venue}, at a level only a dragon would notice. Every dragon in the district will be humming it by the weekend.',
      'Blackbird threads "{title}" into the dragon broadcast loop at {venue}, eight bars under the safety announcement. The reel is signed off by three supervisors. None of them listen to the end.',
    ], ['Every dragon in Neo is about to hum my song. Mine.', 'Wrath is going to hear this and not know why he likes it.'], tok);
  } else {
    addHeat(w, 'atlas', 3);
    say(c, v, 'bury.lose', 'bad', [
      'Blackbird is halfway into the broadcast rack at {venue} when a supervisor plays the reel back and hears a guitar where the chime should be. The alarm is a softer version of the chime.',
      'The reel at {venue} jams on "{title}" and plays it, loud, through the whole building. Every head in the corridor turns.',
    ], ['That was a test broadcast. Of my reflexes.', 'Atlas has heard my song now. They should be grateful.'], tok);
    const guards = here(w).filter((n) => n.alive && !n.hostile && (n.faction === 'atlas' || n.tags.includes('guard')));
    if (guards.length) fight(c, guards.slice(0, 3), { cause: 'a song in the dragon broadcast', assault: true });
  }
}

// ===================================================================== royalties, and the ghost who wants credit

/** What a record earns in a day. Muse keeps four fifths of what it owns. */
export function dailyRoyalty(w: World, r: Recording): number {
  const fame = 1 + Math.min(4, (w.legacy.fame ?? w.hero.fame ?? 0) / 200);
  const base = (r.copies / 100) * (1 + r.grade / 25) * fame;
  return r.label === 'muse' ? base * 0.2 : base;
}

/**
 * Pay the royalties in, for every day of world time since the last payment (nights apart included), and now and then let a
 * ghost player go public. Into `legacy.account`, like a drop.
 */
export function royaltiesTick(c: Ctx): void {
  const { w, rng } = c;
  const at = w.legacy.royaltyAt ?? w.clock;
  const days = Math.floor((w.clock - at) / MIN_PER_DAY);
  if (w.legacy.royaltyAt === undefined) w.legacy.royaltyAt = w.clock;
  if (days <= 0 || !w.legacy.records?.length) return;
  w.legacy.royaltyAt = at + days * MIN_PER_DAY;
  let paid = 0;
  for (const r of records(w)) paid += dailyRoyalty(w, r) * Math.min(days, 30);
  paid = Math.round(paid);
  if (paid > 0) {
    w.legacy.account += paid;
    c.emit('studio', 'good', { variant: 'royalties', text: `A royalty statement comes through: ${paid}nd for ${days === 1 ? 'a day' : `${days} days`} of people playing her records, paid into the lab account.`, thought: paid > 100 ? 'Money for nothing. The best kind of money.' : 'It is not much. It is mine.' });
  }
  for (const r of records(w)) {
    if (r.label !== 'ghost' || r.exposed || !r.copies) continue;
    if (!rng.chance(Math.min(0.6, 0.03 * days))) continue;
    r.exposed = true;
    exposeGhost(c, r);
  }
}

function exposeGhost(c: Ctx, r: Recording): void {
  const { w } = c;
  const h = w.hero;
  const lost = Math.round(Math.min(h.fame, 0.1 * h.fame + 3) * 10) / 10;
  h.fame -= lost;
  const rep = (w.legacy.repute ??= {});
  if (rep[r.skill]) rep[r.skill]! *= 0.88;
  c.emit('studio', 'bad', {
    variant: 'ghost_out',
    text: `${r.ghost} goes public: it was ${r.ghost} on "${r.title}", every note. The interview is everywhere by lunch, and Blackbird is down ${lost} fame.`,
    thought: 'I was in the room. I was on the couch. That is creative direction.',
  });
}

// ===================================================================== the backing track

/** The act family for miming to a tape of this skill (stage.ts ACT_SKILL). */
export const mimeAct = (skill: string): string => `mime_${skill}`;

/** Somewhere a tape can go over the PA: a crowd, a stage, or tonight's booking. */
function mimeStage(w: World): { booking?: Booking; crowd: number } | null {
  const loc = w.locations[w.hero.locationId]!;
  const booking = bookedTonight(w, loc.id);
  if (booking) return { booking, crowd: audience(w, loc) };
  if (!['bar', 'club', 'street', 'arena', 'fanclub'].includes(loc.kind)) return null;
  const crowd = audience(w, loc);
  return crowd >= 3 ? { crowd } : null;
}

/** Miming candidates: a dub she carries of a take better than her hands, wherever there is a crowd to fool. */
export function mimeCandidates(w: World): Candidate[] {
  const stage = mimeStage(w);
  if (!stage) return [];
  const h = w.hero;
  const out: Candidate[] = [];
  for (const r of dubbed(w)) {
    if (stage.booking && stage.booking.skill !== r.skill) continue;
    const gap = r.grade - skillLevel(h, r.skill as SkillId);
    if (gap < 3) continue;
    out.push({
      key: `${mimeAct(r.skill)}:${r.id}`,
      drives: { pride: 0.6, greed: 0.4, bravery: 0.3 },
      bonus: Math.min(0.6, 0.15 + gap / 60) + (stage.booking ? 0.4 : 0),
      risk: 0.25,
      intent: { text: `Blackbird slips a cassette into the PA and picks up her ${r.skill === 'guitar' ? 'guitar' : 'microphone'} like she means it.` },
      run: (c) => mime(c, r),
    });
  }
  return out;
}

/** The odds she is caught: a sharp crowd, a big one, and her own sleight of hand and a DJ's touch. */
export function caughtOdds(w: World, crowd: number): number {
  const h = w.hero;
  return Math.max(0.04, Math.min(0.85, 0.22 + crowd / 50 - 0.004 * skillLevel(h, 'sleight') - 0.004 * skillLevel(h, 'djing') - 0.002 * skillLevel(h, 'grifting')));
}

export function mime(c: Ctx, r: Recording): void {
  const { w, rng } = c;
  const h = w.hero;
  const stage = mimeStage(w);
  if (!stage) return;
  const loc = w.locations[h.locationId]!;
  const act = mimeAct(r.skill);
  const b = stage.booking;
  if (rng.chance(caughtOdds(w, stage.crowd))) {
    scandal(c, r, act);
    if (b) {
      b.played = true;
      const host = b.host ? w.npcs[b.host] : undefined;
      if (host?.alive) host.affinity -= 20;
    }
    return;
  }
  const tips = Math.round(rng.int(10, 40) * (1 + r.grade / 30));
  fameFrom(c, 2 + r.grade / 15, act);
  if (b) {
    b.played = true;
    h.cash += b.pay;
    const host = b.host ? w.npcs[b.host] : undefined;
    if (host?.alive) host.affinity += 8;
  } else h.cash += tips;
  train(c, 'sleight', 1);
  c.emit(act, 'good', {
    variant: 'mimed', mimed: r.grade, place: loc.name,
    text: b
      ? `Blackbird plays her booking at ${loc.name} to a cassette of "${r.title}", grade ${r.grade}, and mimes it so well that she half believes it herself. ${b.pay}nd, and a standing ovation for a woman who is not, strictly, playing.`
      : `"${r.title}" goes out over the PA at ${loc.name}, grade ${r.grade}, and Blackbird mimes along with total conviction. The crowd hears the Blackbird they remember. ${tips}nd in the hat.`,
    thought: rng.pick(['Technically that was me. A previous me. Still counts.', 'Nobody noticed. I am a genius of the form.', 'I was very moving. The tape was also good.']),
  });
}

/** Caught. A scandal is a fame event of the wrong kind. */
function scandal(c: Ctx, r: Recording, act: string): void {
  const { w } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const lost = Math.round(Math.min(h.fame, 0.12 * h.fame + 3) * 10) / 10;
  h.fame -= lost;
  const rep = (w.legacy.repute ??= {});
  if (rep[r.skill]) rep[r.skill]! *= 0.85;
  const near = block(w, loc);
  let gone = 0;
  for (const other of Object.values(w.locations)) {
    if (!other.fans || !near.has(streetOf(w, other).id)) continue;
    gone += other.fans * 0.25;
    other.fans *= 0.75;
  }
  w.counters.mime_scandals = (w.counters.mime_scandals ?? 0) + 1;
  c.emit(act, 'bad', {
    variant: 'caught', scandal: true, place: loc.name,
    text: `The cassette of "${r.title}" sticks at ${loc.name}. The chorus loops. Blackbird keeps strumming for three seconds too long. The crowd sees it, the crowd films it, and by the morning everyone knows: ${lost} fame and ${Math.round(gone)} fans, gone.`,
    thought: c.rng.pick(['That was performance art. About tape.', 'Everybody mimes. I just got the bad cassette.', 'I will call it a commentary on authenticity. It will catch on.']),
  });
}

// ===================================================================== candidates

/** The studio's own business, as candidates: take, ghost, dub, press, relisten, bury. */
function dealCandidates(w: World, v: VenueView): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const cost = sessionCost(v);
  for (const skill of RECORDABLE) {
    const lvl = skillLevel(h, skill);
    if (lvl < 3 || !canPlay(w, v, skill) || h.cash < cost) continue;
    // A good take is worth keeping; she wants one most when her hands are close to their best this life.
    const mine = records(w).filter((r) => r.skill === skill && r.run === w.legacy.runs).length;
    out.push({
      key: `record:${skill}`,
      drives: { pride: 0.7, curiosity: 0.4, greed: 0.2 },
      bonus: 0.25 + lvl / 120 - 0.25 * mine,
      intent: { text: `Blackbird books two hours in ${v.main.name} to put her ${label(skill)} on tape.` },
      run: (c) => {
        const now = venueAt(c.w, 'studio') ?? v;
        recordTake(c, now, skill);
      },
    });
  }
  // The ghost: somebody better than her hands, under her name.
  if (find(v, 'tag:session') && h.cash >= ghostFee(v)) {
    for (const skill of ['guitar', 'vocals'] as const) {
      if (ghostGrade(v) <= skillLevel(h, skill) + 5 || expectation(w, skill) < 8) continue;
      out.push({
        key: `ghost_take:${skill}`,
        drives: { pride: 0.5, greed: 0.3, curiosity: 0.2 },
        bonus: 0.15 + (expectation(w, skill) - skillLevel(h, skill)) / 80,
        risk: 0.1,
        intent: { text: `Blackbird looks at the session player on the couch at ${v.main.name} and does some arithmetic.` },
        run: (c) => ghostTake(c, venueAt(c.w, 'studio') ?? v, skill),
      });
    }
  }
  const best = [...records(w)].sort((a, b) => b.grade - a.grade);
  const have = new Set(dubbed(w).map((r) => r.id));
  for (const r of best.filter((x) => !have.has(x.id) && x.grade > skillLevel(h, x.skill as SkillId) + 3).slice(0, 2)) {
    if (h.cash < dubCost(v) || !(v.features.includes('tape_machine') || v.features.includes('mixing_desk') || v.features.includes('pressing_line'))) continue;
    out.push({ key: `dub:${r.id}`, drives: { pride: 0.3, greed: 0.3, curiosity: 0.2 }, bonus: 0.2, intent: { text: `Blackbird asks for a cassette of "${r.title}".` }, run: (c) => dubTape(c, venueAt(c.w, 'studio') ?? v, r) });
  }
  for (const r of best.filter((x) => x.label !== 'muse').slice(0, 2)) {
    if (h.cash < pressCost(v) * 1.5 || !(v.features.includes('pressing_line') || v.features.includes('tape_machine'))) continue;
    out.push({ key: `press:${r.id}`, drives: { greed: 0.6, pride: 0.4 }, bonus: 0.1 + (r.copies < 200 ? 0.2 : 0), intent: { text: `Blackbird asks what a run of "${r.title}" would cost.` }, run: (c) => pressRecord(c, venueAt(c.w, 'studio') ?? v, r) });
  }
  if (v.features.includes('tape_machine') || v.features.includes('mixing_desk')) {
    for (const r of records(w).filter((x) => relistenable(w, x)).slice(0, 2)) {
      out.push({ key: `relisten:${r.id}`, drives: { curiosity: 0.6, pride: 0.4 }, bonus: 0.35 + (r.grade - skillLevel(h, r.skill as SkillId)) / 80, intent: { text: `Blackbird asks the engineer to find a master of hers from before.` }, run: (c) => relisten(c, venueAt(c.w, 'studio') ?? v, r) });
    }
  }
  if (v.info.variant === 'holdmusic' && v.features.includes('broadcast_rack') && songbook(w).length && (hasInstrument(h) || v.features.includes('guitar_rack')) && !buried(w)) {
    out.push({ key: 'bury_song', drives: { bravery: 0.6, curiosity: 0.4, pride: 0.5 }, bonus: 0.35, risk: 0.45, intent: { text: `Blackbird looks at the dragon broadcast rack at ${v.main.name} the way other people look at a cake.` }, run: (c) => burySong(c, venueAt(c.w, 'studio') ?? v) });
  }
  return out;
}

export function studioCandidates(w: World): Candidate[] {
  const v = venueAt(w, 'studio');
  if (!v || banned(w, v.main)) return [];
  return [...dealCandidates(w, v), ...rowCandidates(w, v)];
}

/** A pull toward a studio: a past-life master waiting to be learned back, or hands at their best and nothing on tape yet. */
export function studioUrge(w: World, to: Id): { bonus: number; smart: number } {
  const v = venueAt(w, 'studio', to);
  if (!v || w.hero.locationId === to || banned(w, v.main)) return { bonus: 0, smart: 0 };
  const relearn = records(w).some((r) => relistenable(w, r)) && (v.features.includes('tape_machine') || v.features.includes('mixing_desk'));
  const take = RECORDABLE.some((s) => skillLevel(w.hero, s) >= 15 && !records(w).some((r) => r.skill === s && r.run === w.legacy.runs)) && w.hero.cash >= sessionCost(v);
  return { bonus: (relearn ? 0.45 : 0) + (take ? 0.2 : 0), smart: relearn ? 0.3 : 0 };
}

export { STUDIO };
