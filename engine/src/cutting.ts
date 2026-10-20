import type { Ctx, Id, Item, Npc, World } from './types';
import type { Candidate } from './candidate';
import { register } from './affordances';
import { acquire, addHeat, gainXp } from './combat';
import { CUTTING, RULES, cuttingFee } from './content/cuttings';
import { FISTS, makeItem } from './content/items';
import { SKILLS, type SkillId } from './content/skills';
import { skillLevel, train } from './skills';
import { genInstrument, instOf, instrumentsOf } from './instruments';
import { expectation } from './renown';
import { fameFrom } from './stage';
import { runDuel, type DuelFoe, type DuelResult } from './duel';
import { museStanding, scout } from './muse';
import { banned, find, rowCandidates, say, venueAt, type VenueView } from './venuekit';
import { CUTTING_ROWS } from './content/cuttingafford';
import { CUTTING_EVENTS } from './content/cuttingevents';

register('cutting', [...CUTTING_ROWS, ...CUTTING_EVENTS]);

/**
 * Cutting rooms, as a system. A cutting room is where she proves it, in rounds, in front of people (the duel engine is
 * duel.ts). Everything she does here is a duel of some kind:
 *
 *   open bout     a challenger off the chalkboard: the entry fee, a purse, fame
 *   the champion  the house champion (grade and style rolled with the place): win and the title is hers, on the place, for good,
 *                 until somebody takes it off her
 *   defend        holding the title, a challenger comes for it. Lose and it's theirs
 *   wager         guitars on the line: win a rolled guitar off the wall, lose her best one
 *   the gate      at a gang's yard, an answer to the caller's call. Enough wins at a gang's rooms and the gang adopts her
 *                 (`legacy.adopted`): its people start out warm, everywhere
 *   royale        (a wild card) eight on one stage, last one playing wins everything
 *   crossroads    (a wild card) the stranger plays her for her hands
 *
 * A bout is a performance like any other (`cut_<skill>` acts are in ACT_SKILL), so a legend with fresh hands who loses one in
 * front of her old crowd is judged for it, sharply.
 */

export const cutAct = (skill: string): string => `cut_${skill}`;
const label = (skill: string): string => SKILLS[skill as SkillId]?.label ?? skill;

/** The skill a bout here is in. */
export const skillAt = (v: VenueView): string => RULES[v.info.variant]?.skill ?? 'guitar';

/** A hash of an id, for grades that are the same every time she looks. */
const hash = (s: string): number => {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x;
};

/** The house champion as a foe. A wild card can make it somebody she knows. */
export function champion(w: World, v: VenueView): DuelFoe {
  const npc = find(v, 'tag:champion');
  const skill = skillAt(v);
  let grade = Number(v.info.keep?.champ ?? 30);
  if (v.info.wild === 'her_rival' || v.info.wild === 'tribute_champ') grade = Math.max(grade, Math.round(expectation(w, skill)) + (v.info.wild === 'tribute_champ' ? 3 : 6));
  return { name: npc?.name ?? 'the champion', grade, style: String(v.info.keep?.style ?? 'shredder'), ...(npc ? { npc } : {}) };
}

/** A challenger off the board: about half as good as the champion, give or take, and the same every time. */
export function challenger(v: VenueView, n: Npc): DuelFoe {
  const champ = Number(v.info.keep?.champ ?? 30);
  const rules = RULES[v.info.variant];
  const styles = rules?.styles ?? ['shredder'];
  return { name: n.name, grade: Math.round(champ * 0.45 + (hash(n.id) % 22)), style: styles[hash(n.id) % styles.length]!, npc: n };
}

/** She holds the title here. */
export const holder = (v: VenueView): boolean => v.info.keep?.holder === 'her';

/** What the room adds: a home crowd that knows her, a room that loves a move, a judge with a view. */
function edgeOf(w: World, v: VenueView): number {
  let e = 0;
  if (v.info.wild === 'silent_duel') e -= 4; // the amps are off; volume buys nothing (it is in movePower, so take it back roughly)
  if (v.info.wild === 'lumina_judge') e += w.legacy.muse?.signed ? 5 : museStanding(w) === 'refused' || museStanding(w) === 'hunted' ? -5 : 0;
  if (v.info.traits.includes('heckler_row')) e -= 2;
  if ((v.main.fans ?? 0) >= 10) e += 3;
  if (holder(v)) e += 2;
  return e;
}

function duel(c: Ctx, v: VenueView, foe: DuelFoe, o: { lean?: number; rounds?: number } = {}): DuelResult {
  const r = runDuel(c, foe, { skill: skillAt(v), event: 'cutting', edge: edgeOf(c.w, v), ...(RULES[v.info.variant]?.favour ? { favour: RULES[v.info.variant]!.favour! } : {}), ...o });
  // A cursed room takes a little blood for every round she drops.
  if (v.info.wild === 'cursed' && r.lost) c.w.hero.hp = Math.max(1, c.w.hero.hp - 3 * r.lost);
  return r;
}

/** Tell the end of a bout under its act family, so the night judges it like a set. */
function verdict(c: Ctx, v: VenueView, r: DuelResult, text: string, thought: string, fame: number): void {
  const act = cutAct(skillAt(v));
  if (r.won) fameFrom(c, fame * (v.sit?.def.fame ?? 1), act);
  train(c, skillAt(v) as SkillId, r.won ? 4 : 2);
  train(c, 'music', 1);
  gainXp(c, r.won ? 8 : 3);
  c.emit(act, r.won ? 'good' : 'bad', { variant: r.won ? 'won' : r.disqualified ? 'dq' : 'lost', place: v.main.name, text, thought });
}

function pay(c: Ctx, v: VenueView): number | null {
  const fee = Math.round(cuttingFee(v.info) * (v.sit?.def.price ?? 1));
  if (c.w.hero.cash < fee) return null;
  c.w.hero.cash -= fee;
  return fee;
}

/** A gang's room counts toward its adopting her. */
function gangWin(c: Ctx, v: VenueView): void {
  const gang = RULES[v.info.variant]?.gang;
  if (!gang) return;
  const w = c.w;
  const wins = (w.legacy.gangWins ??= {});
  wins[gang] = (wins[gang] ?? 0) + 1;
  w.heat[gang] = 0;
  for (const n of v.people) if (n.faction === gang) n.affinity += 10;
  if (wins[gang]! >= 3 && !w.legacy.adopted?.includes(gang)) {
    (w.legacy.adopted ??= []).push(gang);
    const name = w.factions[gang]?.name ?? gang;
    for (const n of Object.values(w.npcs)) if (n.alive && n.faction === gang) n.affinity += 25;
    say(c, v, 'adopted', 'good', [
      `Three wins at ${name} rooms, and that is enough. Somebody hands Blackbird a jacket with the colours on it. "You\'re ours now," says the caller. "Try not to embarrass us." From tonight, ${name} are glad to see her, everywhere.`,
      `${name} adopt Blackbird, in a ceremony that is mostly shouting and partly a song about her that they have clearly been working on. Every one of them will know her face.`,
    ], ['A family. A loud, violent family. I love them.', 'I am in a gang now. A musical gang. Technically a choir.'], {});
  }
}

/** An open bout against a challenger off the board. */
export function openBout(c: Ctx, v: VenueView, n: Npc): void {
  const fee = pay(c, v);
  if (fee === null) return;
  const foe = challenger(v, n);
  const r = duel(c, v, foe);
  const purse = Math.round((fee * 3 + 15) * (v.sit?.def.purse ?? 1));
  if (r.won) {
    c.w.hero.cash += purse;
    n.affinity -= 2;
    gangWin(c, v);
    verdict(c, v, r, `Blackbird takes the bout against ${foe.name} at ${v.main.name}, ${label(skillAt(v))}, in ${r.rounds} rounds. The host raises her arm and pays out the purse: ${purse}nd.`, 'They will put my name on the board. In chalk. For now.', 2);
  } else {
    n.affinity += 3;
    verdict(c, v, r, r.disqualified ? `Blackbird is thrown off the stage at ${v.main.name} for pulling a plug. The ${fee}nd entry stays in the tin.` : `${foe.name} takes the bout against Blackbird at ${v.main.name} in ${r.rounds} rounds. The crowd is very nice about it, which is worse. The ${fee}nd entry is gone.`, 'I was warming up. Everyone has a warm-up.', 0);
  }
}

/** For the title. */
export function champBout(c: Ctx, v: VenueView): void {
  const fee = pay(c, v);
  if (fee === null) return;
  const foe = champion(c.w, v);
  const r = duel(c, v, foe, { lean: 4, rounds: 7 });
  const purse = Math.round((fee * 8 + 60) * (v.sit?.def.purse ?? 1));
  const info = v.info;
  if (r.won) {
    c.w.hero.cash += purse;
    info.keep = { ...(info.keep ?? {}), holder: 'her', heldNight: c.w.legacy.runs, record: Number(info.keep?.champ ?? 30) };
    v.main.fans = (v.main.fans ?? 0) + 6;
    if (foe.npc) foe.npc.affinity -= 8;
    gangWin(c, v);
    if (info.wild === 'golden_pick' && !c.w.hero.inventory.some((i) => i.id === 'golden_plectrum')) acquire(c, makeItem('golden_plectrum'));
    verdict(c, v, r, `Blackbird beats ${foe.name}, the house champion of ${v.main.name}, in ${r.rounds} rounds. The host rings the bell until it cracks. The purse is ${purse}nd, the title is hers, and somebody is already painting her name on the wall.`, 'Champion. Of a room. Of the room. Same thing.', 6);
    // A Muse scout in the room, and a name worth signing.
    if (find(v, 'arch:muse_scout') && !c.w.legacy.muse?.signed && c.w.legacy.muse?.offered !== c.w.legacy.runs && museStanding(c.w) !== 'nobody') scout(c);
  } else {
    if (foe.npc) foe.npc.affinity += 4;
    verdict(c, v, r, r.disqualified ? `Blackbird is caught pulling the champion\'s plug at ${v.main.name}. She is carried out by the bouncer and the champion, together.` : `${foe.name} keeps the title at ${v.main.name}, in ${r.rounds} rounds. It was close. It was not that close.`, 'Next time. There is always a next time. I have several.', 0);
  }
}

/** Holding the title: somebody wants it. */
export function defendTitle(c: Ctx, v: VenueView, n: Npc): void {
  const foe = { ...challenger(v, n), grade: Math.round(Number(v.info.keep?.record ?? v.info.keep?.champ ?? 30) * (0.8 + (hash(`${n.id}:${c.w.legacy.runs}`) % 40) / 100)) };
  const r = duel(c, v, foe, { lean: 4, rounds: 7 });
  c.w.counters[`defended:${v.main.id}`] = 1;
  const info = v.info;
  if (r.won) {
    c.w.hero.cash += 40 + 10 * info.tier;
    v.main.fans = (v.main.fans ?? 0) + 3;
    verdict(c, v, r, `${foe.name} comes for Blackbird\'s title at ${v.main.name} and goes home without it. The house pays the champion ${40 + 10 * info.tier}nd for the show.`, 'Still champion. Always champion. Mostly.', 3);
  } else {
    info.keep = { ...(info.keep ?? {}), holder: n.id, champ: foe.grade };
    delete info.keep.heldNight;
    verdict(c, v, r, `${foe.name} takes the title off Blackbird at ${v.main.name}. The host rings the bell for somebody else. Her name stays on the wall, under a new one.`, 'I let them have it. For the narrative.', 0);
  }
}

/** Guitars on the line: hers against one off the wall. */
export function wagerBout(c: Ctx, v: VenueView, n: Npc): void {
  const h = c.w.hero;
  const mine = bestInstrument(h);
  if (!mine) return;
  const foe = challenger(v, n);
  const r = duel(c, v, { ...foe, grade: foe.grade + 6 });
  if (r.won) {
    const prize = genInstrument(c.rng.fork(`wager:${n.id}`), Math.min(9, v.info.tier + 2));
    acquire(c, prize);
    verdict(c, v, r, `Blackbird wins ${foe.name}\'s guitar at ${v.main.name}, off the wall behind the bar where the losers\' hang: ${prize.name}. ${foe.name} hands it over with both hands, like a flag.`, 'A trophy that plays. The best kind.', 3);
  } else {
    dropItem(h, mine);
    v.info.keep = { ...(v.info.keep ?? {}), wall: Number(v.info.keep?.wall ?? 0) + 1 };
    verdict(c, v, r, `Blackbird loses her ${mine.name} to ${foe.name} at ${v.main.name}. It goes up on the wall behind the bar with the others. Somebody hangs a little label on it with the date.`, 'It was a loan. To the wall. I will be back for it.', 0);
  }
}

/** The caller at a gang's gate. */
export function answerGate(c: Ctx, v: VenueView): void {
  const gang = RULES[v.info.variant]?.gang ?? 'choir';
  const caller = find(v, 'tag:champion') ?? find(v, 'owner');
  const foe: DuelFoe = { name: caller?.name ?? 'the caller', grade: Math.round(Number(v.info.keep?.champ ?? 30) * 0.7), style: 'choir', ...(caller ? { npc: caller } : {}) };
  const r = runDuel(c, foe, { skill: skillAt(v), event: 'cutting', lean: 2, rounds: 3, favour: ['call_response', 10] });
  c.w.counters[`gate:${v.main.id}`] = 1;
  if (r.won) {
    gangWin(c, v);
    verdict(c, v, r, `The caller at the gate of ${v.main.name} sings a line, and Blackbird answers it, and the whole yard answers her. The gate swings open. ${c.w.factions[gang]?.name ?? 'The gang'} are glad to see her.`, 'I gave the right answer. I always give the right answer.', 2);
  } else {
    addHeat(c.w, gang, 1);
    verdict(c, v, r, `The caller at the gate of ${v.main.name} sings a line. Blackbird\'s answer is wrong in a way the whole yard can hear. The gate stays shut and somebody throws a spanner.`, 'It was a trick question. The gate was rigged.', 0);
  }
}

/** Eight on one stage. */
export function royale(c: Ctx, v: VenueView): void {
  const fee = pay(c, v);
  if (fee === null) return;
  const champ = Number(v.info.keep?.champ ?? 30);
  let alive = true;
  let beaten = 0;
  for (let i = 0; i < 4 && alive; i++) {
    const r = duel(c, v, { name: c.rng.pick(['a shredder in a cape', 'a twelve-year-old prodigy (she is thirty)', 'a man with a keytar', 'a duo who count as one', 'a robot in a wig', 'the bassist from somewhere famous']), grade: Math.round(champ * (0.5 + 0.15 * i)), style: c.rng.pick(['shredder', 'heckler', 'bluesman', 'machine']) }, { lean: 1, rounds: 3 });
    if (r.won) beaten++;
    else alive = false;
  }
  const r: DuelResult = { won: alive, lost: alive ? 0 : 1, lean: alive ? 4 : -1, rounds: beaten + (alive ? 0 : 1), moves: [] };
  if (alive) {
    const purse = Math.round((fee * 20 + 200) * (v.sit?.def.purse ?? 1));
    c.w.hero.cash += purse;
    v.main.fans = (v.main.fans ?? 0) + 10;
    verdict(c, v, r, `Eight players on one stage at ${v.main.name}, and at the end only Blackbird is still playing. The crowd carries her to the bar. ${purse}nd.`, 'Last one standing. The only one, in fact.', 8);
  } else verdict(c, v, r, `Blackbird outlasts ${beaten} of the eight on the stage at ${v.main.name} before somebody louder ends her night.`, `${beaten} of them. That is a lot of them.`, 0);
}

/** The stranger at the crossroads plays her for her hands. */
export function crossroads(c: Ctx, v: VenueView): void {
  const w = c.w;
  const npc = find(v, 'arch:crossroads_stranger');
  const skill = skillAt(v);
  const r = runDuel(c, { name: npc?.name ?? 'the stranger', grade: 55 + v.info.tier * 3, style: 'bluesman', ...(npc ? { npc } : {}) }, { skill, event: 'cutting', lean: 3, rounds: 5 });
  w.counters.crossroads = 1;
  if (r.won) {
    train(c, skill as SkillId, 120);
    verdict(c, v, r, `Blackbird beats the stranger at ${v.main.name}. The stranger laughs, takes her hand, and when they let go her fingers know things they did not know a minute ago.`, 'I won something I do not understand. It is in my hands now. Literally.', 5);
  } else {
    verdict(c, v, r, `The stranger beats Blackbird at ${v.main.name}, smiles, and takes her hand. When they let go, her fingers have forgotten everything. Everything.`, 'They took my hands. I have my hands. They took what was in them.', 0);
    w.hero.skills[skill as SkillId] = 0;
  }
}

function bestInstrument(h: World['hero']): Item | undefined {
  return [...instrumentsOf(h)].sort((a, b) => (instOf(b)?.tier ?? 0) - (instOf(a)?.tier ?? 0))[0];
}

function dropItem(h: World['hero'], it: Item): void {
  if (h.weapon === it) h.weapon = { ...FISTS };
  const i = h.inventory.indexOf(it);
  if (i >= 0) h.inventory.splice(i, 1);
}

// ===================================================================== candidates

function dealCandidates(w: World, v: VenueView): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const skill = skillAt(v);
  const act = cutAct(skill);
  const lvl = skillLevel(h, skill as SkillId);
  const fee = Math.round(cuttingFee(v.info) * (v.sit?.def.price ?? 1));
  // A guitar duel needs a guitar.
  if (skill === 'guitar' && !instrumentsOf(h).length) return out;
  const pride = 0.2 + lvl / 80;
  if (h.cash >= fee) {
    for (const n of v.people.filter((x) => x.alive && !x.hostile && x.tags.includes('challenger')).slice(0, 2)) {
      out.push({ key: `${act}:open:${n.id}`, drives: { pride: 0.9, greed: 0.3, bravery: 0.3 }, bonus: pride, risk: 0.15, intent: { text: `Blackbird puts her name on the chalkboard at ${v.main.name}, against ${n.name}.` }, run: (c) => openBout(c, venueAt(c.w, 'cutting') ?? v, n) });
    }
    if (!holder(v) && (find(v, 'tag:champion') || v.sit?.def.tags.includes('open_title'))) {
      const champ = champion(w, v);
      out.push({ key: `${act}:champ`, drives: { pride: 1.1, greed: 0.4, bravery: 0.5 }, bonus: pride + (lvl >= champ.grade - 5 ? 0.3 : -0.1), risk: 0.3, intent: { text: `Blackbird rings the bell at ${v.main.name} and points at the champion.` }, run: (c) => champBout(c, venueAt(c.w, 'cutting') ?? v) });
    }
    if (v.info.wild === 'battle_royale') out.push({ key: `${act}:royale`, drives: { pride: 1, bravery: 0.6, greed: 0.5 }, bonus: pride + 0.2, risk: 0.3, intent: { text: `Blackbird climbs onto the stage at ${v.main.name} with seven other people who all think they are going to win.` }, run: (c) => royale(c, venueAt(c.w, 'cutting') ?? v) });
  }
  if (holder(v) && !w.counters[`defended:${v.main.id}`]) {
    const n = v.people.find((x) => x.alive && !x.hostile && x.tags.includes('challenger'));
    if (n) out.push({ key: `${act}:defend:${n.id}`, drives: { pride: 1.2, bravery: 0.4 }, bonus: 0.6, risk: 0.2, intent: { text: `${n.name} rings the bell at ${v.main.name} and points at Blackbird. The champion stands up.` }, run: (c) => defendTitle(c, venueAt(c.w, 'cutting') ?? v, n) });
  }
  if ((v.info.traits.includes('wager_guitars') || v.features.includes('names_wall')) && instrumentsOf(h).length) {
    const n = v.people.find((x) => x.alive && !x.hostile && x.tags.includes('challenger'));
    if (n) out.push({ key: `${act}:wager:${n.id}`, drives: { greed: 0.7, pride: 0.6, bravery: 0.5 }, bonus: 0.05 + lvl / 120, risk: 0.35, intent: { text: `Blackbird holds up her guitar at ${v.main.name}. ${n.name} holds up theirs. The room goes quiet.` }, run: (c) => wagerBout(c, venueAt(c.w, 'cutting') ?? v, n) });
  }
  if (v.features.includes('gate_caller') && !w.counters[`gate:${v.main.id}`]) {
    out.push({ key: `${act}:gate`, drives: { curiosity: 0.6, pride: 0.6 }, bonus: 0.35, intent: { text: `The caller at the gate of ${v.main.name} sings a line at Blackbird, and waits.` }, run: (c) => answerGate(c, venueAt(c.w, 'cutting') ?? v) });
  }
  if (v.info.wild === 'devil' && !w.counters.crossroads && find(v, 'arch:crossroads_stranger')) {
    out.push({ key: `${act}:crossroads`, drives: { curiosity: 0.8, pride: 0.8, bravery: 0.7 }, bonus: 0.2, risk: 0.6, intent: { text: `The stranger at the end of the bar at ${v.main.name} opens a very old, very clean guitar case, and smiles.` }, run: (c) => crossroads(c, venueAt(c.w, 'cutting') ?? v) });
  }
  return out;
}

export function cuttingCandidates(w: World): Candidate[] {
  const v = venueAt(w, 'cutting');
  if (!v || banned(w, v.main)) return [];
  return [...dealCandidates(w, v), ...rowCandidates(w, v)];
}

/** A pull toward a cutting room: a title to defend, or hands good enough to want a fight. */
export function cuttingUrge(w: World, to: Id): { bonus: number; smart: number } {
  const v = venueAt(w, 'cutting', to);
  if (!v || w.hero.locationId === to || banned(w, v.main)) return { bonus: 0, smart: 0 };
  const skill = skillAt(v);
  if (skill === 'guitar' && !instrumentsOf(w.hero).length) return { bonus: 0, smart: 0 };
  const lvl = skillLevel(w.hero, skill as SkillId);
  const defend = holder(v) && !w.counters[`defended:${v.main.id}`] ? 0.4 : 0;
  const itch = lvl >= 12 ? Math.min(0.4, lvl / 100) * (0.5 + w.hero.personality.weights.pride) : 0;
  return { bonus: defend + itch, smart: 0 };
}

export { CUTTING };
