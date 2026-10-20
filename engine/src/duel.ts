import type { Ctx, Hero, Npc } from './types';
import { skillLevel } from './skills';
import { SKILLS, type SkillId } from './content/skills';
import { bestTrait, instrumentBonus } from './instruments';

/**
 * A musical duel: a few rounds of moves in front of a crowd that leans one way or the other. Built for the cutting room
 * (cutting.ts), and written to be used anywhere two people want to find out who is better in public (a gang's gate, a
 * Muse stage, a street corner).
 *
 * Each round she picks a move, the other side picks one, both roll their grade plus the move, and matchups push it around:
 * a slow burn takes the wind out of a shred, stealing a lick turns their best moment against them, a call-and-response wins
 * a crowd that came to sing. The winner of a round moves the crowd one step (two for a rout). Three steps either way and
 * it's over; otherwise after five rounds whoever has the crowd wins, and a dead heat goes to the louder player.
 *
 * Grades are on the skill scale (0-100), like everything else. Nothing is balanced: a heckle that lands is brutal, a killed
 * amp is a disqualification or a win, and a legend with fresh hands is in for a long night.
 */

export interface MoveDef {
  label: string;
  /** What she plays it with, weighted. The first is the main one. */
  parts: [string, number][];
  /** How wide the roll is (a shred can go either way). */
  spread: number;
  /** A flat edge, before matchups. */
  edge: number;
  /** Which skills this move is a move *in* (a guitar duel uses guitar moves). */
  for: string[];
  /** One line for the round, with {foe} and {foemove}. */
  win: string[];
  lose: string[];
}

export const MOVES: Record<string, MoveDef> = {
  riff: { label: 'a riff', parts: [['guitar', 1], ['music', 0.3]], spread: 12, edge: 0, for: ['guitar'],
    win: ['Blackbird answers {foe}\'s {foemove} with a riff that sits right in the pocket. The front row nods in time.', 'A plain, perfect riff from Blackbird. {foe} has nothing to say to it.'],
    lose: ['Blackbird plays a riff. It is fine. {foe}\'s {foemove} is better than fine.', 'Blackbird\'s riff is solid and forgettable, and {foe}\'s {foemove} is not.'] },
  shred: { label: 'a shred', parts: [['guitar', 1], ['stat:reflex', 0.5]], spread: 24, edge: 3, for: ['guitar'],
    win: ['Blackbird shreds. Fingers everywhere, notes in the hundreds, a sound like a swarm of angry chrome. The crowd forgets {foe} exists.', 'Blackbird goes up the neck and does not come down for twenty seconds. When she does, the crowd is hers.'],
    lose: ['Blackbird goes for a shred and gets lost three frets in. {foe} waits, politely, then plays {foemove}.', 'Too many notes from Blackbird, and most of them wrong. {foe} wins the round on taste.'] },
  slow_burn: { label: 'a slow burn', parts: [['guitar', 0.8], ['vocals', 0.4], ['stat:charm', 0.4]], spread: 10, edge: 0, for: ['guitar', 'vocals'],
    win: ['Blackbird slows it right down. Three notes, a long bend, a silence. Somebody at the back says "oh". The round is hers.', 'A slow burn from Blackbird: half a melody and a lot of feeling. {foe}\'s {foemove} sounds frantic after it.'],
    lose: ['Blackbird slows it down, and the crowd uses the gap to go to the bar.', 'The slow burn never catches. {foe}\'s {foemove} lights the room instead.'] },
  steal_lick: { label: 'a stolen lick', parts: [['guitar', 0.7], ['perception', 0.5], ['analyze', 0.3]], spread: 14, edge: -2, for: ['guitar', 'vocals', 'djing', 'beatbox'],
    win: ['Blackbird plays {foe}\'s own {foemove} back, better, and with a wink. The crowd howls.', 'Blackbird takes {foe}\'s lick, turns it inside out and hands it back. {foe} looks at {their} own hands.'],
    lose: ['Blackbird tries to steal {foe}\'s lick and drops it on the floor. {foe} picks it up and plays it properly.'] },
  call_response: { label: 'a call-and-response', parts: [['vocals', 0.7], ['speaking', 0.4], ['stat:charm', 0.5]], spread: 12, edge: 0, for: ['guitar', 'vocals', 'beatbox'],
    win: ['Blackbird calls, and the whole room answers. {foe} is drowned out by {their} own crowd.', 'A call-and-response from Blackbird: one line, two hundred voices back. The round is not close.'],
    lose: ['Blackbird calls, and three people answer, one of them sarcastically.', 'Blackbird calls. {foe}\'s crowd answers {foe}.'] },
  heckle: { label: 'a heckle', parts: [['intimidation', 0.6], ['speaking', 0.6], ['stat:charm', 0.3]], spread: 14, edge: -4, for: ['guitar', 'vocals', 'djing', 'beatbox'],
    win: ['Between notes, Blackbird says something about {foe}\'s haircut into the microphone. It is short and devastating. {foe} plays the next round looking at the floor.', 'Blackbird heckles {foe} mid-{foemove}. The crowd laughs. {foe} loses {their} place and does not find it again.'],
    lose: ['Blackbird heckles {foe}. {foe} heckles back, better, and the crowd turns on her.', 'The heckle lands on nobody. {foe} plays straight through it.'] },
  kill_amp: { label: 'a pulled plug', parts: [['sleight', 0.8], ['tinkering', 0.5], ['stat:reflex', 0.3]], spread: 14, edge: 0, for: ['guitar', 'djing'],
    win: ['Mid-round, {foe}\'s amp dies with a pop and a smell of hot dust. Somebody, possibly Blackbird, stepped on a cable. The round is hers by default.'],
    lose: ['Blackbird reaches for {foe}\'s cable with her foot, in full view of the front row. Booing.'] },
  floor: { label: 'a floor-filler', parts: [['dancing', 0.7], ['djing', 0.5], ['stat:charm', 0.3]], spread: 14, edge: 0, for: ['djing', 'beatbox', 'guitar'],
    win: ['Blackbird gets off the stage and into the crowd and the floor moves with her. {foe} is playing to an empty space.'],
    lose: ['Blackbird gets down into the crowd. The crowd steps back to give her room. Too much room.'] },
  drop: { label: 'a drop', parts: [['djing', 1], ['music', 0.4]], spread: 18, edge: 2, for: ['djing'],
    win: ['Blackbird builds it, holds it, holds it, and drops it. The floor jumps as one animal.'],
    lose: ['Blackbird holds the build a beat too long. By the time it drops, the floor has gone to the bar.'] },
  beat: { label: 'a beat', parts: [['beatbox', 1], ['vocals', 0.3]], spread: 14, edge: 0, for: ['beatbox'],
    win: ['Kick, snare, hi-hat and a bassline, all from Blackbird\'s mouth, at once. {foe} applauds before {they} remember{s} not to.'],
    lose: ['Blackbird\'s beat comes apart in the middle and becomes a cough.'] },
  hymn: { label: 'a hymn', parts: [['vocals', 1], ['music', 0.4]], spread: 10, edge: 0, for: ['vocals'],
    win: ['Blackbird sings something old and slow and enormous, and the room goes very still.'],
    lose: ['Blackbird goes for the big note in the hymn and finds a smaller one.'] },
};

/** How one move fares against another: a slow burn takes the wind out of a shred, and so on. Absent is even. */
export const MATCH: Record<string, Record<string, number>> = {
  slow_burn: { shred: 9, drop: 6, heckle: -4 },
  shred: { riff: 6, hymn: 4, slow_burn: -9 },
  riff: { heckle: 5, floor: 4, shred: -6 },
  steal_lick: { shred: 10, riff: 6, drop: 6, beat: 6, slow_burn: -5 },
  call_response: { hymn: 8, beat: 4, steal_lick: 4, shred: -3 },
  heckle: { slow_burn: 6, hymn: 6, call_response: -6 },
  floor: { slow_burn: 6, hymn: 6, riff: -4 },
  drop: { riff: 5, beat: 5, floor: -3 },
  beat: { riff: 3, floor: 3, steal_lick: -6 },
  hymn: { heckle: 5, drop: 4, call_response: -8 },
  kill_amp: {},
};

/** The moves a style prefers, for a foe: a Rust Choir caller sings, a shredder shreds. */
export const STYLES: Record<string, { label: string; moves: Record<string, number> }> = {
  shredder: { label: 'a shredder', moves: { shred: 4, riff: 2, steal_lick: 1 } },
  bluesman: { label: 'a blues player', moves: { slow_burn: 4, riff: 2, call_response: 1 } },
  choir: { label: 'a call-and-response caller', moves: { call_response: 4, hymn: 2, heckle: 1 } },
  raver: { label: 'a floor-filler', moves: { drop: 3, floor: 3, beat: 1 } },
  hymnist: { label: 'a hymn singer', moves: { hymn: 4, call_response: 2, slow_burn: 1 } },
  heckler: { label: 'a heckler', moves: { heckle: 3, riff: 2, shred: 1 } },
  beatboxer: { label: 'a beatboxer', moves: { beat: 4, steal_lick: 1, floor: 1 } },
  machine: { label: 'a machine', moves: { shred: 3, steal_lick: 3, riff: 1 } },
};

export interface DuelFoe {
  name: string;
  /** On the skill scale. */
  grade: number;
  style: string;
  npc?: Npc;
}

export interface DuelOpts {
  /** The skill it is a duel of: guitar, vocals, djing, beatbox. */
  skill: string;
  /** The event the rounds are told under. */
  event: string;
  /** How far the crowd has to lean to call it, and how many rounds at most. */
  lean?: number;
  rounds?: number;
  /** Something about the room that helps her (a home crowd) or the foe (theirs), in grade points. */
  edge?: number;
  /** A move the room favours (a hymn at a chapel), worth this much to whoever plays it. */
  favour?: [string, number];
  /** Extra tokens for the lines. */
  tok?: Record<string, string | number>;
}

export interface DuelResult {
  won: boolean;
  /** Rounds she lost. */
  lost: number;
  /** How far the crowd leant at the end (positive is hers). */
  lean: number;
  rounds: number;
  /** She was caught pulling a plug. */
  disqualified?: boolean;
  /** The moves she played, in order. */
  moves: string[];
}

const label = (id: string): string => MOVES[id]?.label ?? id;

/** How good she is at a move, on the skill scale: her parts, weighted, plus the instrument where it helps. */
export function movePower(h: Hero, move: string, skill: string): number {
  const m = MOVES[move];
  if (!m) return 0;
  let sum = 0;
  let wt = 0;
  for (const [p, k] of m.parts) {
    const v = p.startsWith('stat:') ? Math.min(10, Math.max(0, (h as unknown as Record<string, number>)[p.slice(5)] ?? 0)) * 6 : skillLevel(h, p as SkillId);
    sum += v * k;
    wt += k;
  }
  const main = skill in SKILLS ? skillLevel(h, skill as SkillId) : 0;
  // Every move is mostly the duel's own skill: a heckle from a great guitarist is still a great guitarist heckling.
  // The golden plectrum (a cutting room's prize) has never played a wrong note.
  const pick = h.inventory.some((i) => i.id === 'golden_plectrum') ? 4 : 0;
  return 0.55 * main + 0.45 * (sum / wt) + instrumentBonus(h, skill) + 2 * bestTrait(h, skill, 'volume') + m.edge + pick;
}

/** The moves open to her in a duel of this skill. */
export const movesFor = (skill: string): string[] => Object.keys(MOVES).filter((k) => MOVES[k]!.for.includes(skill));

/** What she plays this round: the best she has against what they tend to play, unless her head is elsewhere. */
export function pickMove(c: Ctx, skill: string, foe: DuelFoe, last?: string): string {
  const { w, rng } = c;
  const h = w.hero;
  const opts = movesFor(skill);
  const style = STYLES[foe.style]?.moves ?? {};
  const total = Object.values(style).reduce((s, x) => s + x, 0) || 1;
  const value = (m: string): number => {
    let ev = movePower(h, m, skill);
    for (const [fm, wt] of Object.entries(style)) ev += (MATCH[m]?.[fm] ?? 0) * (wt / total);
    // The same trick twice is less of a trick.
    if (m === last) ev -= 4;
    return ev;
  };
  // A sharp Blackbird plays the matchup; a careless one plays what she likes.
  if (rng.chance(0.3 + 0.6 * h.competence)) return opts.reduce((a, b) => (value(b) > value(a) ? b : a));
  const p = h.personality.weights;
  return rng.weighted(opts, (m) => 1 + (m === 'shred' ? p.pride : m === 'kill_amp' ? p.bravery * 0.5 : m === 'steal_lick' ? p.curiosity : m === 'slow_burn' ? p.lust : m === 'heckle' ? p.bravery : 0.5));
}

function foeMove(c: Ctx, foe: DuelFoe, skill: string): string {
  const style = STYLES[foe.style]?.moves ?? { riff: 1 };
  const ok = Object.keys(style).filter((m) => MOVES[m]?.for.includes(skill));
  return ok.length ? c.rng.weighted(ok, (m) => style[m]!) : c.rng.pick(movesFor(skill));
}

/** Fight it out. Tells every round under `opts.event`; returns who won. Nothing else changes: the caller pays out. */
export function runDuel(c: Ctx, foe: DuelFoe, opts: DuelOpts): DuelResult {
  const { w, rng } = c;
  const h = w.hero;
  const need = opts.lean ?? 3;
  const max = opts.rounds ?? 5;
  let lean = 0;
  let rounds = 0;
  let theirMalus = 0;
  let ourMalus = 0;
  let last: string | undefined;
  let lost = 0;
  const moves: string[] = [];
  const pron: Record<string, string> = foe.npc ? { npc: foe.name } : {};
  while (rounds < max && Math.abs(lean) < need) {
    rounds++;
    const mine = pickMove(c, opts.skill, foe, last);
    const theirs = foeMove(c, foe, opts.skill);
    moves.push(mine);
    last = mine;
    const tok = { foe: foe.name, foemove: label(theirs), round: rounds, ...(foe.npc ? {} : { nobody: 1 }), ...(opts.tok ?? {}) };
    // A pulled plug is not a performance: it either works or it is the end.
    if (mine === 'kill_amp') {
      const p = Math.max(0.05, Math.min(0.8, 0.2 + movePower(h, 'kill_amp', opts.skill) / 120));
      if (rng.chance(p)) {
        lean += 2;
        c.emit(opts.event, 'good', { variant: 'duel.round', text: fill(rng.pick(MOVES.kill_amp!.win), tok), ...pron });
        continue;
      }
      c.emit(opts.event, 'bad', { variant: 'duel.dq', text: fill(rng.pick(MOVES.kill_amp!.lose), tok) + ' The judge points at the door. Disqualified.', ...pron });
      return { won: false, lost: lost + 1, lean: -need, rounds, disqualified: true, moves };
    }
    const fav = (m: string): number => (opts.favour && opts.favour[0] === m ? opts.favour[1] : 0);
    const us = movePower(h, mine, opts.skill) + rng.int(-MOVES[mine]!.spread, MOVES[mine]!.spread) + (MATCH[mine]?.[theirs] ?? 0) + fav(mine) + (opts.edge ?? 0) - ourMalus;
    const them = foe.grade + rng.int(-MOVES[theirs]!.spread, MOVES[theirs]!.spread) + (MATCH[theirs]?.[mine] ?? 0) + fav(theirs) - theirMalus;
    theirMalus = 0;
    ourMalus = 0;
    const diff = us - them;
    if (diff >= 0) {
      lean += diff > 15 ? 2 : 1;
      if (mine === 'heckle') theirMalus = 10;
      c.emit(opts.event, 'good', { variant: 'duel.round', text: `Round ${rounds}: ${fill(rng.pick(MOVES[mine]!.win), tok)}`, ...pron });
    } else {
      lean -= diff < -15 ? 2 : 1;
      lost++;
      if (mine === 'heckle') ourMalus = 5;
      c.emit(opts.event, 'bad', { variant: 'duel.round', text: `Round ${rounds}: ${fill(rng.pick(MOVES[mine]!.lose), tok)}`, ...pron });
    }
  }
  // A dead heat goes to whoever is louder.
  const won = lean > 0 || (lean === 0 && bestTrait(h, opts.skill, 'volume') > 0);
  return { won, lost, lean, rounds, moves };
}

const NEUTRAL: Record<string, string> = { they: 'they', They: 'They', their: 'their', Their: 'Their', them: 'them', s: '', es: '' };
/** The foe's tokens; with nobody by name to hang pronouns on (`tok.nobody`), plain "they". */
const fill = (s: string, tok: Record<string, string | number>): string =>
  s.replace(/\{(foe|foemove|round)\}/g, (_m, k: string) => String(tok[k] ?? '')).replace(/\{(they|They|their|Their|them|s|es)\}/g, (m, k: string) => (tok.nobody ? NEUTRAL[k]! : m));
