import type { Ctx, Id, Item, Ticket, World } from './types';
import type { Candidate } from './candidate';
import { register } from './affordances';
import { acquire } from './combat';
import { JOBS, LUTHIER } from './content/luthiers';
import { skillLevel, odds, synergy, train } from './skills';
import { armed, genInstrument, instOf, instrumentsOf, type InstTrait } from './instruments';
import { addDeed, oneOfHers, playing, reclaim, storyLine } from './provenance';
import { banned, find, rowCandidates, say, venueAt, type VenueView } from './venuekit';
import { LUTHIER_ROWS } from './content/luthierafford';
import { LUTHIER_EVENTS } from './content/luthierevents';

register('luthier', [...LUTHIER_ROWS, ...LUTHIER_EVENTS]);

/**
 * Luthiers, as a system. A luthier is where a guitar becomes more than it was, and where her guitars from other lives turn up:
 *
 *   the bench      leave a guitar for a job (a setup, pickups, armour, a city jack, a tuned body, a sustainer, a restoration of
 *                  one of her old ones, or just safekeeping), or commission a new one. A guitar on the bench is **not on her**,
 *                  so it waits through a death: a ticket (`legacy.tickets`) she can collect in any later life, once it's ready
 *   graft          move a trait from one guitar to another, here and now (the donor is spent)
 *   buy back       one of her own old guitars (provenance.ts), story and all, in the window tonight
 *   the masterpiece (a recluse) this year's one perfect guitar: bought for a fortune, or earned by playing it right
 *
 * Everything else is rows (content/luthierafford.ts, luthierevents.ts).
 */

/** Which jobs a kind of luthier does. */
export const JOBS_BY: Record<string, string[]> = {
  master: ['setup', 'resonate', 'restore', 'store', 'commission'],
  welder: ['harden', 'loud', 'feedback', 'store'],
  titanware: ['jack', 'loud', 'feedback'],
  muse_tech: ['setup', 'jack', 'loud'],
  tonewood: ['resonate', 'commission', 'store'],
  recluse: ['restore', 'setup'],
  repair: ['setup', 'restore', 'store', 'loud'],
  amp_tech: ['loud', 'feedback', 'jack'],
  secondhand: ['store', 'setup'],
};

const TRAIT_OF: Record<string, InstTrait> = { setup: 'tone', loud: 'volume', harden: 'hardened', jack: 'jacked', resonate: 'resonance', feedback: 'feedback' };

export const jobsAt = (v: VenueView): string[] => (JOBS_BY[v.info.variant] ?? ['setup', 'store']).filter((j) => JOBS[j]);

/** What a job costs here. */
export function jobPrice(v: VenueView, job: string): number {
  const base = JOBS[job]?.price ?? 50;
  const rate = Number(v.info.keep?.rate ?? 1);
  const traits = v.info.traits.reduce((m, t) => m * (LUTHIER.traits[t]?.price ?? 1), 1);
  return Math.max(5, Math.round(base * rate * (v.v.price ?? 1) * traits * (v.sit?.def.price ?? 1)));
}

/** How long a job takes here, in world minutes. */
export function jobMinutes(v: VenueView, job: string): number {
  const m = JOBS[job]?.minutes ?? 1440;
  return Math.round(m * (v.info.traits.includes('slow') ? 2 : v.info.traits.includes('fast') ? 0.25 : 1));
}

/** Can this job do anything for this guitar? */
export function jobHelps(it: Item, job: string): boolean {
  const inst = instOf(it);
  if (!inst || !it.inst) return job === 'store';
  if (job === 'store' || job === 'commission') return true;
  if (job === 'restore') return !!inst.hers && (inst.tier < 9 || inst.signature < 3);
  const t = TRAIT_OF[job];
  return !!t && inst[t] < 3;
}

export const tickets = (w: World): Ticket[] => (w.legacy.tickets ??= []);
export const ticketsAt = (w: World, loc: Id): Ticket[] => tickets(w).filter((t) => t.loc === loc);
export const ready = (w: World, t: Ticket): boolean => t.ready <= w.clock;

function remove(h: World['hero'], it: Item): void {
  const i = h.inventory.indexOf(it);
  if (i >= 0) h.inventory.splice(i, 1);
  if (h.weapon === it) h.weapon = h.inventory.find((x) => x.kind === 'weapon') ?? { id: 'fists', name: 'bare fists', kind: 'weapon', power: 1, value: 0, tags: ['melee'] };
}

/** Leave a guitar on the bench (or commission one). */
export function leave(c: Ctx, v: VenueView, job: string, it?: Item): Ticket | null {
  const { w } = c;
  const h = w.hero;
  const price = jobPrice(v, job);
  if (h.cash < price) return null;
  let item: Item;
  if (job === 'commission') {
    const tier = Math.min(9, v.info.tier + 2 + Math.floor(skillLevel(h, 'guitar') / 25) + (v.info.variant === 'tonewood' ? 1 : 0));
    item = genInstrument(c.rng.fork(`commission:${v.main.id}:${w.legacy.runs}:${w.beat}`), tier);
    addDeed(item, `built for her at ${v.main.name}`);
  } else {
    if (!it) return null;
    remove(h, it);
    item = it;
  }
  h.cash -= price;
  const t: Ticket = { id: `tk${w.legacy.runs}.${w.beat}.${tickets(w).length}`, loc: v.main.id, item, job, ready: w.clock + jobMinutes(v, job) };
  tickets(w).push(t);
  const who = find(v, 'owner');
  const days = Math.max(0, Math.round((t.ready - w.clock) / 1440));
  say(c, v, `bench.${job}`, 'good', job === 'commission' ? [
    '{npc} measures Blackbird\'s hands at {venue}, twice, writes nothing down, takes {pay}nd and says "three days". A ticket goes in her pocket. Whoever she is in three days can collect it.',
    'Blackbird commissions a guitar at {venue}. {npc} picks the wood while she watches, taps it, nods, and gives her a ticket and a date.',
  ] : job === 'store' ? [
    'Blackbird leaves her {item} on the rack at {venue} for {pay}nd, with a paper ticket on the headstock. It is safe there, safer than with her.',
  ] : [
    'Blackbird leaves her {item} at {venue} for {job}, {pay}nd. {npc} writes a ticket: ready in {days}. It is not on her now, which means it will still be there whatever happens to her.',
    '{npc} takes the {item}, turns it over, and says "{job}. {days}." {pay}nd. A ticket goes in Blackbird\'s pocket.',
  ], ['A guitar on a bench is a guitar that survives me.', 'It will be better when I see it again. So will I, probably.'], { pay: price, item: item.name, job: JOBS[job]?.label ?? job, days: days === 0 ? 'no time at all' : days === 1 ? 'a day' : `${days} days`, npc: who?.name ?? 'the luthier' }, { job });
  return t;
}

/** Collect a ticket: the job done. */
export function collect(c: Ctx, v: VenueView, t: Ticket): void {
  const { w } = c;
  if (!ready(w, t)) return;
  const list = tickets(w);
  list.splice(list.indexOf(t), 1);
  let it = t.item;
  const inst = it.inst;
  if (inst) {
    const tr = TRAIT_OF[t.job];
    if (tr) inst[tr] = Math.min(3, inst[tr] + 1);
    if (t.job === 'resonate' && !inst.resonates) inst.resonates = c.rng.chance(0.5) ? 'dragon' : 'robot';
    if (t.job === 'restore') {
      inst.tier = Math.min(9, inst.tier + 1);
      inst.signature = Math.min(3, inst.signature + 1);
      inst.tone = Math.min(3, inst.tone + 1);
    }
    if (t.job !== 'store' && t.job !== 'commission') addDeed(it, `${t.job === 'restore' ? 'restored' : 'worked on'} at ${v.main.name}`);
    it = armed(it);
  }
  acquire(c, it);
  const lives = inst?.life !== undefined && inst.life < w.legacy.runs;
  say(c, v, 'collect', 'good', [
    lives ? 'Blackbird hands a ticket across the counter at {venue} that a previous Blackbird left there. {npc} brings out the {item}. It has waited for her, through a death, on a rack.' : 'Blackbird collects her {item} from {venue}. {npc} plays one chord on it before handing it over, to show off.',
    'The ticket at {venue} matches. {npc} brings out the {item}, finished, and stands back to watch her play it.',
  ], ['It feels right. It feels mine.', 'Better than I left it. Like a good friend.'], { item: it.name, npc: find(v, 'owner')?.name ?? 'the luthier' }, { job: t.job });
}

/** Her own old guitar, in the window tonight, at a price that knows what it is. */
export function inWindow(w: World, v: VenueView): Item | undefined {
  const chance = v.info.variant === 'secondhand' || v.info.traits.includes('lost_and_found') || v.sit?.def.tags.includes('hers') ? 0.9 : 0.45;
  const seed = `${v.main.id}:${w.legacy.runs}`;
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  if ((x % 100) / 100 >= chance) return undefined;
  return oneOfHers(w, seed);
}

export const buybackPrice = (it: Item): number => Math.round(it.value * 1.5 + 40 * (it.inst?.story?.length ?? 0));

export function buyBack(c: Ctx, v: VenueView, it: Item): void {
  const { w } = c;
  const price = buybackPrice(it);
  if (w.hero.cash < price) return;
  w.hero.cash -= price;
  reclaim(w, it);
  addDeed(it, `bought back at ${v.main.name}`);
  acquire(c, it);
  say(c, v, 'buyback', 'good', [
    'In the window at {venue} is her {item}. She knows it at once, from across the street, the way you know your own handwriting. {pay}nd. The tag tells its story: {story}.',
    '{npc} takes the {item} off the wall at {venue} and hands it to Blackbird without a word. The tag says: {story}. {pay}nd, and it is hers again.',
  ], ['Hello, old friend. I do not remember you. My hands do.', 'I bought my own legend back. Cheap, considering.'], { item: it.name, pay: price, story: storyLine(it), npc: find(v, 'owner')?.name ?? 'the dealer' });
}

/** Move a trait from one guitar to another. The donor does not survive it. */
export function graft(c: Ctx, v: VenueView, donor: Item, target: Item, trait: InstTrait): void {
  const { w, rng } = c;
  const d = instOf(donor);
  const t = target.inst;
  if (!d || !t) return;
  const p = odds(0.3, 0.07, synergy(w.hero, ['tinkering', ['guitar', 0.4], ['stat:int', 0.4]])) + (v.info.wild === 'cursed' ? 0.2 : 0);
  remove(w.hero, donor);
  if (rng.chance(p)) {
    t[trait] = Math.max(t[trait], Math.min(3, d[trait]));
    if (trait === 'resonance' && !t.resonates) t.resonates = d.resonates ?? 'robot';
    addDeed(target, `took the ${trait} of another guitar at ${v.main.name}`);
    const fixed = armed(target);
    if (fixed !== target) {
      const h = w.hero;
      const i = h.inventory.indexOf(target);
      if (i >= 0) h.inventory[i] = fixed;
      if (h.weapon === target) h.weapon = fixed;
    }
    train(c, 'tinkering', 4);
    say(c, v, 'graft.win', 'good', ['Blackbird takes the {trait} out of her {donor} at {venue}, part by part, and puts it into her {target}. The {donor} is a shell now. The {target} has never sounded like this.'], ['Surgery. Successful. The donor is at peace.'], { trait, donor: donor.name, target: target.name });
  } else {
    train(c, 'tinkering', 2);
    if (v.info.wild === 'cursed') w.hero.hp = Math.max(1, w.hero.hp - 6);
    say(c, v, 'graft.lose', 'bad', ['Blackbird opens up her {donor} at {venue} to take its {trait} and finds out, too late, that it does not come out in one piece. The {donor} is firewood. The {target} is as it was.'], ['RIP. It died for science.'], { trait, donor: donor.name, target: target.name });
  }
}

/** The recluse's guitar of the year. */
export const masterpiecePrice = (v: VenueView): number => Math.round(2400 * (v.v.price ?? 1) / 2);

export function takeMasterpiece(c: Ctx, v: VenueView, how: 'buy' | 'earn'): void {
  const { w, rng } = c;
  if (!v.info.keep?.masterpiece) return;
  const price = masterpiecePrice(v);
  if (how === 'buy') {
    if (w.hero.cash < price) return;
    w.hero.cash -= price;
  } else {
    const p = odds(0.05, 0.07, synergy(w.hero, ['guitar', ['music', 0.6]]));
    if (!rng.chance(p)) {
      train(c, 'guitar', 3);
      say(c, v, 'masterpiece.no', 'bad', ['The recluse at {venue} lets Blackbird play this year\'s guitar for exactly one song. At the end, they take it back gently and put it on the stand. "Not yet," they say.'], ['Not yet means yes later. Probably.'], {});
      w.counters[`masterpiece_tried:${v.main.id}`] = 1;
      return;
    }
  }
  const it = genInstrument(rng.fork(`masterpiece:${v.main.id}`), Number(v.info.keep.mtier ?? 9));
  if (it.inst) {
    it.inst.signature = Math.max(2, it.inst.signature);
    it.inst.tone = 3;
  }
  it.name = `this year's guitar from ${v.main.name}, a ${it.name}`;
  addDeed(it, how === 'buy' ? `bought from the recluse at ${v.main.name}, for a fortune` : `given to her by the recluse at ${v.main.name}, who heard her play it`);
  v.info.keep = { ...v.info.keep, masterpiece: 0 };
  acquire(c, it);
  say(c, v, `masterpiece.${how}`, 'good', how === 'buy'
    ? ['Blackbird pays {pay}nd for this year\'s guitar at {venue}. The recluse counts it twice, puts it in a drawer, and does not watch her leave with it.']
    : ['Blackbird plays this year\'s guitar at {venue}, one song, and when she stops the recluse is crying, quietly, into a rag. "Take it," they say. "It was always for you."'],
  ['There is one of these a year. It is mine.', 'It plays itself. I just hold it.'], { pay: price });
}

// ===================================================================== candidates

function dealCandidates(w: World, v: VenueView): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const main = playing(h);
  const re = (c: Ctx) => venueAt(c.w, 'luthier') ?? v;
  for (const job of jobsAt(v)) {
    const price = jobPrice(v, job);
    if (h.cash < price) continue;
    if (job === 'commission') {
      out.push({ key: `luthbench:commission`, drives: { pride: 0.5, greed: 0.3, curiosity: 0.4 }, bonus: 0.1 + skillLevel(h, 'guitar') / 120, intent: { text: `Blackbird asks what a guitar built for her own hands would cost at ${v.main.name}.` }, run: (c) => void leave(c, re(c), job) });
      continue;
    }
    if (job === 'store') {
      const spare = instrumentsOf(h).filter((i) => i !== main && i.inst)[0];
      if (spare) out.push({ key: `luthbench:store:${spare.id}`, drives: { greed: 0.3, curiosity: 0.2 }, bonus: 0.05, intent: { text: `Blackbird thinks about leaving her spare guitar somewhere safe.` }, run: (c) => void leave(c, re(c), job, spare) });
      continue;
    }
    if (!main || !jobHelps(main, job)) continue;
    out.push({ key: `luthbench:${job}:${main.id}`, drives: { pride: 0.4, curiosity: 0.4, greed: 0.1 }, bonus: 0.15 + skillLevel(h, 'guitar') / 150 + (job === 'restore' ? 0.3 : 0), intent: { text: `Blackbird puts her ${main.name} on the counter at ${v.main.name} and asks about ${JOBS[job]!.label}.` }, run: (c) => void leave(c, re(c), job, main) });
  }
  for (const t of ticketsAt(w, v.main.id).filter((x) => ready(w, x))) {
    out.push({ key: `collect:${t.id}`, drives: { greed: 0.6, pride: 0.4 }, bonus: 0.9, intent: { text: `Blackbird puts a ticket on the counter at ${v.main.name}.` }, run: (c) => collect(c, re(c), t) });
  }
  const old = inWindow(w, v);
  if (old && h.cash >= buybackPrice(old)) {
    out.push({ key: `buyback:${old.id}`, drives: { pride: 0.8, greed: 0.3, curiosity: 0.5 }, bonus: 0.5 + (old.inst?.story?.length ?? 0) / 20, intent: { text: `Blackbird stops dead in front of the window at ${v.main.name}.` }, run: (c) => buyBack(c, re(c), old) });
  }
  // A graft: the best trait of a spare, into the guitar she plays.
  const spares = instrumentsOf(h).filter((i) => i !== main && instOf(i));
  if (main?.inst && spares.length && v.features.includes('workbench')) {
    let best: { donor: Item; trait: InstTrait; gain: number } | undefined;
    for (const d of spares) for (const t of ['tone', 'volume', 'jacked', 'hardened', 'resonance', 'feedback', 'signature'] as InstTrait[]) {
      const gain = (instOf(d)![t] ?? 0) - main.inst[t];
      if (gain > 0 && (!best || gain > best.gain)) best = { donor: d, trait: t, gain };
    }
    if (best) out.push({ key: `graft:${best.donor.id}:${best.trait}`, drives: { curiosity: 0.6, greed: 0.3 }, bonus: 0.1 + 0.1 * best.gain, risk: 0.2, intent: { text: `Blackbird borrows a screwdriver at ${v.main.name} and looks hard at her two guitars.` }, run: (c) => graft(c, re(c), best!.donor, main, best!.trait) });
  }
  if (v.info.keep?.masterpiece) {
    if (h.cash >= masterpiecePrice(v)) out.push({ key: 'masterpiece:buy', drives: { greed: 0.4, pride: 0.8 }, bonus: 0.3, intent: { text: `Blackbird looks at the guitar in the window of ${v.main.name} and then at her money.` }, run: (c) => takeMasterpiece(c, re(c), 'buy') });
    if (!w.counters[`masterpiece_tried:${v.main.id}`] && skillLevel(h, 'guitar') >= 20) out.push({ key: 'masterpiece:earn', drives: { pride: 0.9, curiosity: 0.5 }, bonus: 0.3 + skillLevel(h, 'guitar') / 100, intent: { text: `Blackbird asks the recluse at ${v.main.name} if she can play it. Just once.` }, run: (c) => takeMasterpiece(c, re(c), 'earn') });
  }
  return out;
}

export function luthierCandidates(w: World): Candidate[] {
  const v = venueAt(w, 'luthier');
  if (!v || banned(w, v.main)) return [];
  return [...dealCandidates(w, v), ...rowCandidates(w, v)];
}

/** A pull toward a luthier: a ticket waiting there (from this life or another), or a guitar that wants work. */
export function luthierUrge(w: World, to: Id): { bonus: number; smart: number } {
  const v = venueAt(w, 'luthier', to);
  if (!v || w.hero.locationId === to || banned(w, v.main)) return { bonus: 0, smart: 0 };
  const waiting = ticketsAt(w, to).some((t) => ready(w, t)) ? 0.7 : 0;
  const main = playing(w.hero);
  const work = main && skillLevel(w.hero, 'guitar') >= 10 && jobsAt(v).some((j) => jobHelps(main, j) && w.hero.cash >= jobPrice(v, j)) ? 0.15 : 0;
  return { bonus: waiting + work, smart: waiting ? 0.4 : 0 };
}

export { LUTHIER };
