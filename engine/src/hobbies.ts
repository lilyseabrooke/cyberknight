import type { Ctx, Hero, Npc, World } from './types';
import { hasInstrument } from './instruments';
import { acquire, addHeat, fight, gainXp, here, remember } from './combat';
import { clamp, revealExit, type Candidate } from './candidate';
import { makeAmmoBox, makeItem } from './content/items';
import { AMMO_IDS } from './content/ammo';
import { tierFor } from './content/fishing';
import { streetTypeOf } from './streettypes';
import { odds, skillLevel, synergy, train } from './skills';
import { hasKind } from './companions';
import { kindle } from './romance';
import { bondEvent } from './bonds';
import { isFairGame } from './people';
import { fameFrom, tipScale } from './stage';
import { feed } from './rest';
import { hungerOf } from './needs';
import { hungerUrge } from './urges';
import { FOOD } from './content/lodging';

/**
 * Every skill formula in one place: baseline luck + a bonus per point of synergy, where synergy is the weighted
 * geometric mean of the skills and stats involved (zero in any factor and the skill part is zero).
 */
export const ODDS = {
  pool: (h: Hero) => odds(0.28, 0.065, synergy(h, ['pool', ['stat:reflex', 0.5]])),
  poolDate: (h: Hero, n: Npc) => odds(0.2, 0.06, synergy(h, ['pool', 'romance', ['stat:charm', 0.5]])) + n.affinity / 300,
  darts: (h: Hero) => odds(0.3, 0.065, synergy(h, ['throwing', ['stat:reflex', 0.5]])),
  jam: (h: Hero) => odds(0.15, 0.07, synergy(h, ['guitar', ['music', 0.6], ['stat:charm', 0.3]])),
  gig: (h: Hero) => odds(0.2, 0.065, synergy(h, ['guitar', ['music', 0.6], ['vocals', 0.3], ['stat:charm', 0.4]])),
  stealGuitar: (h: Hero) => odds(0.25, 0.06, synergy(h, ['sleight', ['stat:reflex', 0.5]])),
  busk: (h: Hero) => odds(0.22, 0.065, synergy(h, ['guitar', ['vocals', 0.3], ['stat:charm', 0.5]])),
  cook: (h: Hero) => odds(0.3, 0.065, synergy(h, ['cooking', ['tinkering', 0.4]])),
  serve: (h: Hero) => odds(0.3, 0.06, synergy(h, ['cooking', 'romance'])),
  tend: (h: Hero) => odds(0.3, 0.06, synergy(h, ['mixology', ['tolerance', 0.5]])),
  molotov: (h: Hero) => odds(0.3, 0.06, synergy(h, ['mixology', ['tinkering', 0.7]])),
  art: (h: Hero) => odds(0.42, 0.06, synergy(h, ['art', ['stat:reflex', 0.5]])),
  ask: (h: Hero) => odds(0.3, 0.065, synergy(h, ['streetwise', ['stat:charm', 0.5]])),
  trick: (h: Hero) => odds(0.3, 0.06, synergy(h, ['rapport', ['tinkering', 0.4]])),
  fish: (h: Hero) => odds(0.45, 0.012, synergy(h, ['fishing', ['stat:int', 0.3]])),
  parkour: (h: Hero) => odds(0.35, 0.055, synergy(h, ['athletics', ['stat:reflex', 0.5]])),
};

const alive = (n: Npc | undefined): n is Npc => !!n && n.alive;

/** Is there water to fish in: the canal behind the club, or the edge of a wharf. */
export function waterHere(w: World): boolean {
  const loc = w.locations[w.hero.locationId]!;
  return w.features.canal?.locationId === loc.id || (loc.kind === 'street' && streetTypeOf(loc) === 'wharf');
}

/** All the places-to-be-good-at-something. */
export function hobbyCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = here(w);
  const feat = (k: string) => w.features[k]?.locationId === h.locationId;
  const owns = (tag: string) => h.inventory.find((i) => i.tags.includes(tag));

  // ---- pool as seduction, and borrowing a cue
  if (feat('pool')) {
    for (const n of crowd.filter((x) => isFairGame(x) && !x.hostile)) {
      out.push({ key: `pool_date:${n.id}`, drives: { lust: 0.9, pride: 0.6 }, bonus: 0.1, intent: { npc: n.name }, run: (c) => poolDate(c, n) });
    }
    if (!owns('cue')) {
      out.push({ key: 'grab_cue', drives: { greed: 0.3, curiosity: 0.3, bravery: 0.2 }, intent: {}, run: grabCue });
    }
  }
  // ---- darts
  if (feat('darts') && h.cash >= 10) {
    out.push({ key: 'darts', drives: { pride: 0.7, greed: 0.4, bravery: 0.15 }, risk: 0.2, intent: {}, run: darts });
  }
  // ---- the green room: guitar
  if (feat('guitar')) {
    const band = crowd.filter((n) => n.tags.includes('band'));
    out.push({ key: 'jam', drives: { pride: 0.8, curiosity: 0.5, lust: 0.15 }, bonus: skillLevel(h, 'guitar') * 0.03, risk: band.length ? 0.4 : 0, run: jam });
    if (!hasInstrument(h)) {
      out.push({ key: 'steal_guitar', drives: { greed: 0.9, curiosity: 0.4, pride: 0.3 }, risk: band.length ? 1.0 : 0.2, run: stealGuitar });
    }
    if (band.length && band.every((b) => b.affinity >= 14) && skillLevel(h, 'guitar') >= 1) {
      out.push({ key: 'gig', drives: { pride: 1.1, greed: 0.5, curiosity: 0.3 }, bonus: 0.4, run: gig });
    }
  }
  // ---- busking, anywhere outdoors, if she owns a guitar
  if (hasInstrument(h) && loc.outdoors && !['overpass', 'halo_roof'].includes(loc.id)) {
    out.push({ key: 'busk', drives: { pride: 0.7, greed: 0.5, curiosity: 0.3 }, risk: 0.2, run: busk });
  }
  // ---- fishing, anywhere there is water, if she has found something to fish with
  if (owns('rod') && waterHere(w)) {
    out.push({ key: 'fish', drives: { curiosity: 0.5, greed: 0.3, thirst: 0.1 }, bonus: 0.1 + skillLevel(h, 'fishing') * 0.03, risk: 0.1, intent: {}, run: fish });
  }
  // ---- the kitchen
  if (feat('stove')) {
    const bao = w.npcs.bao;
    const barred = !!bao && bao.alive && bao.locationId === h.locationId && bao.affinity < -10;
    out.push({ key: 'cook', drives: { curiosity: 0.55, pride: 0.5, thirst: 0.1 }, risk: barred ? 1.8 : 0.3, run: cook });
  }
  const dish = owns('dish');
  if (dish && (h.hp < h.maxHp * 0.85 || hungerOf(h) <= 70)) {
    out.push({ key: 'eat_dish', drives: {}, smart: 0.8, bonus: (1 - h.hp / h.maxHp) * 1.2 + 1.2 * hungerUrge(h), run: eatDish });
  }
  if (dish) {
    for (const n of crowd.filter((x) => isFairGame(x) && !x.hostile)) {
      out.push({ key: `serve_dish:${n.id}`, drives: { lust: 0.8, pride: 0.5 }, bonus: 0.2, run: (c) => serveDish(c, n) });
    }
  }
  // ---- behind the bar
  if (feat('taps')) {
    out.push({ key: 'tend_bar', drives: { thirst: 0.6, pride: 0.5, greed: 0.3, curiosity: 0.3 }, risk: 0.3, intent: {}, run: tendBar });
    if (h.cash >= 10) out.push({ key: 'mix_molotov', drives: { curiosity: 0.6, bravery: 0.4, pride: 0.3 }, risk: 0.2, run: mixMolotov });
  }
  // ---- graffiti
  // ---- parkour
  if (feat('parkour')) {
    out.push({ key: 'parkour', drives: { pride: 0.6, bravery: 0.5, curiosity: 0.4 }, risk: 0.5, run: parkour });
  }
  // ---- asking around
  if (crowd.length >= 3 && h.cash >= 10) {
    out.push({ key: 'ask_around', drives: { curiosity: 0.6, greed: 0.3 }, run: askAround });
  }
  // ---- teaching allies tricks
  for (const a of h.companions) {
    const taught = a.abilities.filter((x) => ['fetch', 'guard', 'sing'].includes(x));
    if (a.loyalty >= 30 && taught.length < 3 && w.beat - (w.counters[`trick_${a.id}`] ?? -99) > 30) {
      out.push({
        key: `teach_trick:${a.id}`, drives: { curiosity: 0.25, pride: 0.1 }, bonus: skillLevel(h, 'rapport') >= 1 ? 0.1 : 0,
        run: (c) => teachTrick(c, a.id),
      });
    }
  }
  void hasKind;
  return out;
}

// ============================================================================ resolvers

function poolDate(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const bet = Math.min(h.cash, rng.int(10, 30));
  const p = clamp(ODDS.poolDate(h, n), 0.05, 0.9);
  const skilled = skillLevel(h, 'pool') >= 3;
  kindle(h, 0.05);
  if (rng.chance(p)) {
    n.affinity += 22;
    remember(n, 'lost at pool to Blackbird and liked it');
    train(c, 'pool', 3);
    train(c, 'romance', 2);
    c.emit('pool_date', 'good', { variant: skilled ? 'win_skilled' : 'win', npc: n.name });
    bondEvent(c, n, 'date');
  } else if (rng.chance(0.5)) {
    h.cash -= bet;
    n.affinity += 8;
    train(c, 'pool', 1);
    train(c, 'romance', 1);
    c.emit('pool_date', 'mixed', { variant: 'outplayed', npc: n.name, amount: bet });
  } else {
    n.affinity -= 4;
    train(c, 'pool', 1);
    c.emit('pool_date', 'bad', { variant: 'scratch', npc: n.name });
  }
}

function grabCue(c: Ctx): void {
  const { w } = c;
  w.hero.inventory.push(makeItem('pool_cue'));
  const dutch = here(w).find((n) => n.tags.includes('owner'));
  if (dutch) {
    dutch.affinity -= 5;
    addHeat(w, 'halo', 1);
  }
  c.emit('grab_cue', 'mixed', { npc: dutch?.name ?? 'the owner' });
}

function darts(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const bet = Math.min(h.cash, rng.int(10, 30) + Math.floor(skillLevel(h, 'throwing') * 3));
  if (rng.chance(ODDS.darts(h))) {
    h.cash += bet;
    train(c, 'throwing', 2);
    c.emit('darts', 'good', { variant: 'win', amount: bet });
  } else {
    h.cash -= bet;
    train(c, 'throwing', 1);
    const patron = here(w).find((n) => n.tags.includes('rowdy') && !n.hostile);
    if (patron && rng.chance(0.12)) {
      patron.affinity -= 12;
      c.emit('darts', 'bad', { variant: 'stray', npc: patron.name, amount: bet });
      fight(c, [patron], { cause: 'a stray dart' });
    } else {
      c.emit('darts', 'bad', { variant: 'lose', amount: bet });
    }
  }
}

function jam(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const band = here(w).filter((n) => n.tags.includes('band'));
  if (band.some((b) => b.affinity < -10)) {
    c.emit('jam', 'bad', { variant: 'thrown_out', npc: band[0]!.name });
    fight(c, band, { cause: "crashing the band's room", joiners: false });
    return;
  }
  if (rng.chance(ODDS.jam(h))) {
    for (const b of band) b.affinity += 14;
    fameFrom(c, 1, 'jam');
    train(c, 'guitar', 3);
    gainXp(c, 5);
    c.emit('jam', 'good', { variant: band.length ? 'band' : 'solo', npc: band[0]?.name ?? '', level: skillLevel(h, 'guitar') });
  } else if (band.length && rng.chance(0.18)) {
    for (const b of band) b.affinity -= 20;
    train(c, 'guitar', 1);
    c.emit('jam', 'bad', { variant: 'smash', npc: band[0]!.name });
    fight(c, band, { cause: 'breaking a vintage guitar', joiners: false });
  } else {
    for (const b of band) b.affinity -= 2;
    train(c, 'guitar', 1);
    c.emit('jam', 'mixed', { variant: 'meh', npc: band[0]?.name ?? '' });
  }
}

function gig(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const band = here(w).filter((n) => n.tags.includes('band'));
  if (rng.chance(ODDS.gig(h))) {
    const tips = Math.round(rng.int(80, 220) * tipScale(w, 'gig'));
    h.cash += tips;
    fameFrom(c, 3, 'gig');
    for (const b of band) b.affinity += 8;
    train(c, 'guitar', 3);
    train(c, 'vocals', 1);
    gainXp(c, 12);
    c.emit('gig', 'good', { variant: 'killer', amount: tips, npc: band[0]!.name });
  } else {
    h.hp -= 4;
    train(c, 'guitar', 1);
    c.emit('gig', 'bad', { variant: 'flop', npc: band[0]!.name });
  }
}

function stealGuitar(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const band = here(w).filter((n) => n.tags.includes('band'));
  if (rng.chance(ODDS.stealGuitar(h) * (band.length ? 0.7 : 1))) {
    for (const b of band) {
      b.affinity -= 30;
      remember(b, 'saw Blackbird make off with the guitar');
    }
    addHeat(w, 'club', 1);
    train(c, 'sleight', 2);
    h.inventory.push(makeItem('vintage_guitar'));
    c.emit('steal_guitar', 'good', { variant: band.length ? 'band' : 'alone' });
  } else {
    train(c, 'sleight', 1);
    c.emit('steal_guitar', 'bad', { variant: 'caught', npc: band[0]?.name ?? 'someone' });
    if (band.length) fight(c, band, { cause: 'stealing the band\'s guitar', joiners: false });
  }
}

function busk(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const roll = rng.next();
  if (roll < ODDS.busk(h)) {
    const tips = Math.round(rng.int(15, 70) * tipScale(w, 'busk'));
    h.cash += tips;
    fameFrom(c, 1, 'busk');
    for (const k of here(w)) if (k.archetype === 'street_kid') k.affinity += 10;
    train(c, 'guitar', 2);
    train(c, 'vocals', 1);
    c.emit('busk', 'good', { variant: 'tips', amount: tips });
  } else if (rng.chance(0.1)) {
    const i = h.inventory.findIndex((x) => x.tags.includes('instrument'));
    if (i >= 0) h.inventory.splice(i, 1);
    c.emit('busk', 'bad', { variant: 'stolen' });
  } else if (rng.chance(0.25)) {
    addHeat(w, 'npd', 1);
    train(c, 'guitar', 1);
    c.emit('busk', 'bad', { variant: 'complaint' });
  } else {
    train(c, 'guitar', 1);
    c.emit('busk', 'mixed', { variant: 'ignored' });
  }
}

function cook(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const bao = w.npcs.bao;
  const baoHere = alive(bao) && bao.locationId === h.locationId;
  if (baoHere && bao.affinity < -10) {
    c.emit('cook', 'bad', { variant: 'kicked_out', npc: bao.name });
    fight(c, [bao], { cause: 'cooking in a kitchen she was banned from', joiners: false });
    return;
  }
  const p = ODDS.cook(h);
  if (rng.chance(p)) {
    h.inventory.push(makeItem('dish_good'));
    if (baoHere) bao.affinity += 8;
    train(c, 'cooking', 3);
    c.emit('cook', 'good', { variant: 'good', npc: bao?.name ?? 'the chef', level: skillLevel(h, 'cooking') });
  } else if (rng.chance(0.55)) {
    h.inventory.push(makeItem('noodles'));
    train(c, 'cooking', 1);
    c.emit('cook', 'mixed', { variant: 'meh' });
  } else {
    h.hp -= 8;
    addHeat(w, 'halo', 1);
    train(c, 'cooking', 1);
    if (baoHere) bao.affinity -= 10;
    c.emit('cook', 'bad', { variant: 'fire', npc: bao?.name ?? 'the chef' });
    if (baoHere && rng.chance(0.4)) fight(c, [bao], { cause: 'setting fire to the kitchen', joiners: false });
  }
}

function eatDish(c: Ctx): void {
  const h = c.w.hero;
  const i = h.inventory.findIndex((x) => x.tags.includes('dish'));
  if (i >= 0) h.inventory.splice(i, 1);
  h.buffs = h.buffs.filter((b) => b.id !== 'fed');
  h.buffs.push({ id: 'fed', until: c.w.beat + 25, power: 2 });
  feed(c.w, FOOD.dish.gain);
  c.emit('eat_dish', 'good', {});
}

function serveDish(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const i = h.inventory.findIndex((x) => x.tags.includes('dish'));
  if (i >= 0) h.inventory.splice(i, 1);
  kindle(h, 0.04);
  if (rng.chance(ODDS.serve(h))) {
    n.affinity += 20;
    remember(n, 'was cooked for by Blackbird');
    train(c, 'romance', 1);
    train(c, 'cooking', 1);
    c.emit('serve_dish', 'good', { variant: 'swoon', npc: n.name });
    bondEvent(c, n, 'date');
  } else {
    n.affinity += 3;
    c.emit('serve_dish', 'mixed', { variant: 'polite', npc: n.name });
  }
}

function tendBar(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const nyx = w.npcs.nyx;
  const nyxHere = alive(nyx) && nyx.locationId === h.locationId;
  const lvl = skillLevel(h, 'mixology');
  if (rng.chance(ODDS.tend(h))) {
    const tips = rng.int(30, 100);
    h.cash += tips;
    for (const n of here(w)) if (!n.hostile) n.affinity += 3;
    if (nyxHere) nyx.affinity += lvl >= 3 ? 6 : -5;
    if (synergyHigh(h)) h.fame += 1;
    train(c, 'mixology', 2);
    train(c, 'tolerance', 1);
    c.emit('tend_bar', 'good', { variant: lvl >= 3 ? 'pro' : 'lucky', amount: tips, npc: nyx?.name ?? 'the bartender' });
  } else {
    h.drunk += 1;
    train(c, 'mixology', 1);
    for (const n of here(w)) if (!n.hostile) n.affinity -= 2;
    const rowdy = here(w).find((n) => n.tags.includes('rowdy') && !n.hostile);
    c.emit('tend_bar', 'bad', { variant: 'spill' });
    if (rowdy && rng.chance(0.25)) {
      rowdy.affinity -= 15;
      c.emit('tend_bar', 'bad', { variant: 'complaint', npc: rowdy.name });
      fight(c, [rowdy], { cause: 'a very bad cocktail' });
    }
  }
}

const synergyHigh = (h: Hero): boolean => skillLevel(h, 'mixology') >= 5;

function mixMolotov(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  h.cash -= Math.min(h.cash, 10);
  if (rng.chance(ODDS.molotov(h))) {
    const n = skillLevel(h, 'mixology') >= 4 ? 2 : 1;
    for (let i = 0; i < n; i++) h.inventory.push(makeItem('cocktail_molotov'));
    train(c, 'mixology', 2);
    train(c, 'tinkering', 1);
    c.emit('mix', 'good', { variant: 'good', count: n });
  } else {
    h.hp -= 8;
    train(c, 'mixology', 1);
    c.emit('mix', 'bad', { variant: 'fail' });
  }
}

function parkour(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  if (rng.chance(ODDS.parkour(h))) {
    h.fame += 1;
    train(c, 'athletics', 3);
    if (rng.chance(0.45)) {
      const it = makeItem(rng.pick(['credchip', 'gold_tooth', 'memory_shard', 'mom_photo']));
      acquire(c, it);
      c.emit('parkour', 'good', { variant: 'loot', item: it.name });
    } else {
      c.emit('parkour', 'good', { variant: 'clean' });
    }
  } else {
    h.hp -= 10;
    train(c, 'athletics', 1);
    if (rng.chance(0.25) && !h.injuries.includes('broken_leg')) {
      h.injuries.push('broken_leg');
      c.emit('injury', 'bad', { injury: 'broken_leg' });
    }
    c.emit('parkour', 'bad', { variant: 'fall' });
  }
}

/** Someone nearby sees a woman with a drone winch on a stick, and has a face about it. */
function fish(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const lvl = skillLevel(h, 'fishing');
  const gawker = rng.pick([...here(w).filter((n) => alive(n) && !n.hostile), undefined])?.name ?? '';
  train(c, 'fishing', 2);
  if (!rng.chance(ODDS.fish(h))) {
    const rod = h.inventory.find((i) => i.tags.includes('rod'));
    if (rod && rng.chance(Math.max(0.02, 0.1 - lvl * 0.002))) {
      h.inventory.splice(h.inventory.indexOf(rod), 1);
      c.emit('fish', 'bad', { variant: 'snap', npc: gawker });
    } else if (rng.chance(0.12)) {
      h.hp -= 4;
      c.emit('fish', 'bad', { variant: 'splash', npc: gawker });
    } else {
      c.emit('fish', 'mixed', { variant: 'nothing', npc: gawker });
    }
    return;
  }
  train(c, 'fishing', 2);
  const tier = tierFor(rng.next() + Math.min(0.8, lvl * 0.008), lvl);
  const id = rng.pick(tier.items);
  const it = id === 'ammo' ? makeAmmoBox(rng.pick(AMMO_IDS), rng.int(tier.rounds[0], tier.rounds[1])) : makeItem(id);
  if (tier.variant === 'prize') gainXp(c, 4);
  if (tier.variant === 'legend') gainXp(c, 10);
  c.emit('fish', tier.variant === 'junk' ? 'mixed' : 'good', { variant: id === 'ammo' ? 'ammo' : tier.variant, item: it.name, npc: gawker });
  acquire(c, it);
}

function askAround(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  h.cash -= Math.min(h.cash, 10);
  if (rng.chance(ODDS.ask(h))) {
    train(c, 'streetwise', 2);
    const marks = here(w).filter((n) => n.loadout.some((i) => i.kind !== 'armor') && !n.flags.includes('marked'));
    const hidden = [
      w.locations.halo_alley!.exits.some((e) => e.hidden) ? 'hatch' : '',
      w.locations.neon_pharaoh!.exits.some((e) => e.hidden) ? 'staffdoor' : '',
    ].filter(Boolean);
    const options = [...(marks.length ? ['mark'] : []), ...hidden, ...(w.flags.dragon_known ? [] : ['dragon'])];
    const pick = options.length ? rng.pick(options) : 'gossip';
    if (pick === 'mark') {
      const m = rng.pick(marks);
      m.flags.push('marked');
      const it = m.loadout.find((i) => i.kind !== 'armor')!;
      c.emit('ask_around', 'good', { variant: 'mark', npc: m.name, item: it.name });
    } else if (pick === 'hatch' || pick === 'staffdoor') {
      revealExit(w, pick === 'hatch' ? 'halo_alley' : 'neon_pharaoh', 'club_maintenance');
      c.emit('ask_around', 'good', { variant: pick });
    } else if (pick === 'dragon') {
      w.flags.dragon_known = true;
      c.emit('ask_around', 'good', { variant: 'dragon' });
    } else {
      c.emit('ask_around', 'mixed', { variant: 'gossip' });
    }
  } else {
    train(c, 'streetwise', 1);
    c.emit('ask_around', 'bad', { variant: 'nothing' });
  }
}

function teachTrick(c: Ctx, id: string): void {
  const { w, rng } = c;
  const h = w.hero;
  const a = h.companions.find((x) => x.id === id);
  if (!a) return;
  w.counters[`trick_${a.id}`] = w.beat;
  const options = ['fetch', 'guard', 'sing'].filter((t) => !a.abilities.includes(t));
  if (!options.length) return;
  if (rng.chance(ODDS.trick(h))) {
    const trick = rng.pick(options);
    a.abilities.push(trick);
    a.loyalty = Math.min(100, a.loyalty + 10);
    train(c, 'rapport', 2);
    c.emit('trick', 'good', { variant: 'good', name: a.name, kind: a.kind, trick });
  } else {
    h.hp -= 3;
    train(c, 'rapport', 1);
    c.emit('trick', 'bad', { variant: 'fail', name: a.name, kind: a.kind });
  }
}
