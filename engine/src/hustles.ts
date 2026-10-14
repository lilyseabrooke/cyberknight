import type { Ctx, Hero, Npc, World } from './types';
import { acquire, addHeat, fight, gainXp, here, remember } from './combat';
import { clamp, levelRisk, spawnGroup, type Candidate } from './candidate';
import { makeItem } from './content/items';
import { skillLevel, synergy, train } from './skills';

/** The hustle-specific skill formulas. These layer the new skills (grifting, hustling) as a
 * straight additive bonus on top of the original stat-driven baseline, rather than wrapping
 * everything in `synergy()` — a brand-new skill starts at 0, and synergy's "any zero factor
 * zeroes the whole thing" rule would otherwise silently kill the stat-driven baseline these
 * actions already had before she's trained the new skill at all. */
const HODDS = {
  panhandle: (h: Hero) => 0.45 + h.charm * 0.02 + skillLevel(h, 'grifting') * 0.03,
  coldRead: (h: Hero) => 0.3 + h.charm * 0.03 + skillLevel(h, 'streetwise') * 0.03 + skillLevel(h, 'grifting') * 0.03,
  scamMark: (h: Hero) => 0.3 + skillLevel(h, 'cards') * 0.05 + skillLevel(h, 'sleight') * 0.03 + skillLevel(h, 'grifting') * 0.04,
  sellFakeGoods: (h: Hero) => 0.4 + h.charm * 0.02 + skillLevel(h, 'haggling') * 0.04 + skillLevel(h, 'grifting') * 0.03,
  oddJobs: (h: Hero) => 0.78 + skillLevel(h, 'athletics') * 0.02 + skillLevel(h, 'hustling') * 0.02,
  securityShift: (h: Hero) => 0.55 + h.muscle * 0.02 + skillLevel(h, 'intimidation') * 0.03 + skillLevel(h, 'hustling') * 0.02,
  courierRun: (h: Hero) => 0.6 + skillLevel(h, 'streetwise') * 0.03 + skillLevel(h, 'hustling') * 0.02,
};


const talkable = (n: Npc): boolean => !n.hostile && !n.tags.includes('boss') && !n.tags.includes('dragon') && n.archetype !== 'puppy';

/** Per-NPC hustles are tempting but one-at-a-time: this is a cooldown gate so the whole crowd
 * doesn't all become fresh marks for every scam at once, the same way `teach_trick` throttles itself. */
const ready = (w: World, tag: string, id: string, window: number): boolean => w.beat - (w.counters[`${tag}_${id}`] ?? -9999) > window;
const mark = (c: Ctx, tag: string, id: string): void => {
  c.w.counters[`${tag}_${id}`] = c.w.beat;
};

/** Every odd job, hustle, and bad idea Blackbird can pick up on a street corner — thinned out with
 * cooldowns so these are occasional opportunities, not a standing buffet next to everything else to do. */
export function hustleCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = here(w).filter(talkable);

  // ---- panhandling: the last resort, the first instinct of a hero who is flat broke
  if (loc.outdoors && h.cash < 40) {
    const desperate = clamp((40 - h.cash) / 40, 0, 1);
    out.push({ key: 'panhandle', drives: { greed: 0.25 }, bonus: desperate * 0.5, risk: 0.1, run: panhandle });
  }

  // ---- odd jobs for the staff: hauling kegs, bussing tables, nothing heroic about it
  for (const n of crowd.filter((x) => x.tags.includes('staff') && x.affinity >= -10 && ready(w, 'odd_jobs', x.id, 18))) {
    out.push({ key: `odd_jobs:${n.id}`, drives: { greed: 0.25, pride: 0.1 }, risk: 0.1, run: (c) => oddJobs(c, n) });
  }

  // ---- working the door: a night of standing security for somebody else's club
  const guards = crowd.filter((n) => n.tags.includes('security'));
  if (loc.id === 'neon_pharaoh' && guards.length && guards.every((g) => g.affinity >= -5) && ready(w, 'security_shift', 'x', 40)) {
    out.push({ key: 'security_shift', drives: { greed: 0.35, pride: 0.2, bravery: 0.2 }, risk: 0.5, run: securityShift });
  }

  // ---- a quick courier run for whoever's connected enough to have packages
  for (const n of crowd.filter((x) => (x.tags.includes('fixer') || x.tags.includes('dealer')) && ready(w, 'courier_run', x.id, 35))) {
    out.push({ key: `courier_run:${n.id}`, drives: { greed: 0.3, curiosity: 0.2 }, risk: 0.3, run: (c) => courierRun(c, n) });
  }

  // ---- bodyguard gig: somebody's willing to pay to not walk home alone
  for (const n of crowd.filter((x) => (x.tags.includes('romanceable') || x.archetype === 'patron') && ready(w, 'bodyguard_gig', x.id, 70))) {
    out.push({ key: `bodyguard_gig:${n.id}`, drives: { greed: 0.3, bravery: 0.3, pride: 0.2 }, risk: 0.6, run: (c) => bodyguardGig(c, n) });
  }

  // ---- questionable: waiting for someone to be distracted, then robbing their place blind
  // (not the fixer: Madame Zero is a story contact, not a mark)
  for (const n of crowd.filter((x) => !x.tags.includes('kid') && !x.tags.includes('robot') && !x.tags.includes('fixer') && ready(w, 'burgle_home', x.id, 140))) {
    out.push({
      key: `burgle_home:${n.id}`, drives: { greed: 0.55, curiosity: 0.2 }, risk: 1.2 + levelRisk(w, n),
      run: (c) => burgleHome(c, n),
    });
  }

  // ---- shady: protection money from anyone running a till
  for (const n of crowd.filter((x) => (x.tags.includes('shopkeeper') || x.tags.includes('owner')) && ready(w, 'protection_racket', x.id, 90))) {
    out.push({
      key: `protection_racket:${n.id}`, drives: { greed: 0.4, bravery: 0.3 }, risk: 0.6 + levelRisk(w, n),
      run: (c) => protectionRacket(c, n),
    });
  }

  // ---- shady: three-card monte on anyone standing still long enough
  if (h.cash >= 10) {
    for (const n of crowd.filter((x) => (x.tags.includes('rowdy') || x.archetype === 'patron') && ready(w, 'scam_mark', x.id, 60))) {
      out.push({ key: `scam_mark:${n.id}`, drives: { greed: 0.35, curiosity: 0.1 }, risk: 0.3, run: (c) => scamMark(c, n) });
    }
  }

  // ---- shady: selling bunk stims and fake implants to anyone gullible enough
  for (const n of crowd.filter((x) => x.cash > 0 && !x.tags.includes('kid') && !x.tags.includes('fixer') && ready(w, 'sell_fake_goods', x.id, 60))) {
    out.push({ key: `sell_fake_goods:${n.id}`, drives: { greed: 0.3, curiosity: 0.1 }, risk: 0.4, run: (c) => sellFakeGoods(c, n) });
  }

  // ---- shady but mostly harmless: cold-reading a mark's fortune for tip money
  for (const n of crowd.filter((x) => !x.tags.includes('robot') && !x.tags.includes('fixer') && ready(w, 'cold_read', x.id, 55))) {
    out.push({ key: `cold_read:${n.id}`, drives: { greed: 0.2, curiosity: 0.2 }, run: (c) => coldRead(c, n) });
  }

  // ---- random favors: NPCs occasionally have a weird little job for her
  for (const n of crowd.filter((x) => !x.tags.includes('robot') && !x.tags.includes('fixer') && x.affinity >= -5 && ready(w, 'odd_request', x.id, 70))) {
    out.push({ key: `odd_request:${n.id}`, drives: { curiosity: 0.3, greed: 0.15 }, bonus: 0.1, risk: 0.2, run: (c) => oddRequest(c, n) });
  }

  // ---- minor combat: hunting down Atlas's small patrol drones, out of spite and for parts
  for (const n of here(w).filter((x) => x.tags.includes('robot') && x.tags.includes('patrol') && x.faction === 'atlas')) {
    out.push({
      key: `hunt_drone:${n.id}`, drives: { bravery: 0.7, pride: 0.4, quest: 0.1 }, risk: 0.4 + levelRisk(w, n),
      run: (c) => huntDrone(c, n),
    });
  }

  return out;
}

// =============================================================== resolvers

function panhandle(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(HODDS.panhandle(h) - (h.fame >= 3 ? 0.1 : 0), 0.1, 0.8);
  if (rng.chance(0.07)) {
    const cash = rng.int(20, 60);
    h.cash += cash;
    train(c, 'grifting', 2);
    const it = rng.chance(0.4) ? makeItem(rng.pick(['neural_gum', 'mom_photo'])) : null;
    if (it) acquire(c, it);
    c.emit('panhandle', 'good', { variant: 'stranger', amount: cash, item: it?.name ?? '' });
  } else if (rng.chance(p)) {
    const cash = rng.int(3, 15);
    h.cash += cash;
    train(c, 'grifting', 1);
    c.emit('panhandle', 'good', { variant: 'sympathy', amount: cash });
  } else if (rng.chance(0.3)) {
    h.hp -= rng.int(0, 3);
    c.emit('panhandle', 'bad', { variant: 'mocked' });
  } else {
    c.emit('panhandle', 'mixed', { variant: 'ignored' });
  }
}

function oddJobs(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'odd_jobs', n.id);
  const chore = rng.pick(['kegs', 'tables', 'dishes', 'crates']);
  if (rng.chance(clamp(HODDS.oddJobs(h), 0.5, 0.95))) {
    const pay = rng.int(10, 30);
    h.cash += pay;
    n.affinity += 4;
    train(c, 'hustling', 2);
    train(c, 'athletics', 1);
    c.emit('odd_jobs', 'good', { variant: chore, chore, amount: pay, npc: n.name });
  } else {
    h.hp -= rng.int(2, 6);
    n.affinity -= 1;
    c.emit('odd_jobs', 'bad', { variant: `${chore}_mishap`, chore, npc: n.name });
  }
}

function securityShift(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'security_shift', 'x');
  const p = clamp(HODDS.securityShift(h), 0.2, 0.9);
  train(c, 'hustling', 2);
  train(c, 'intimidation', 1);
  if (rng.chance(p)) {
    const pay = rng.int(40, 100);
    h.cash += pay;
    h.fame += 1;
    for (const g of here(w)) if (g.tags.includes('security')) g.affinity += 3;
    c.emit('security_shift', 'good', { variant: 'quiet', amount: pay });
  } else {
    const trouble = here(w).find((n) => n.tags.includes('rowdy') && !n.hostile);
    if (trouble) {
      c.emit('security_shift', 'bad', { variant: 'brawl', npc: trouble.name });
      fight(c, [trouble], { cause: 'working the door and picking the wrong fight', joiners: false });
    } else {
      h.hp -= rng.int(4, 10);
      c.emit('security_shift', 'bad', { variant: 'rough' });
    }
  }
}

function courierRun(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'courier_run', n.id);
  const p = clamp(HODDS.courierRun(h) - (n.tags.includes('dealer') ? 0.1 : 0), 0.2, 0.9);
  if (rng.chance(p)) {
    const pay = rng.int(30, 90);
    h.cash += pay;
    n.affinity += 3;
    train(c, 'hustling', 2);
    train(c, 'streetwise', 1);
    c.emit('courier_run', 'good', { variant: 'clean', amount: pay, npc: n.name });
  } else {
    addHeat(w, 'npd', 1);
    c.emit('courier_run', 'bad', { variant: 'hot', npc: n.name });
  }
}

function bodyguardGig(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'bodyguard_gig', n.id);
  train(c, 'hustling', 2);
  const ambushChance = clamp(0.4 - skillLevel(h, 'hustling') * 0.025, 0.15, 0.4);
  if (rng.chance(ambushChance)) {
    const muggers = spawnGroup(c, 'mugger', rng.int(1, 2));
    c.emit('bodyguard_gig', 'mixed', { variant: 'ambush', npc: n.name });
    const res = muggers.length ? fight(c, muggers, { cause: `protecting ${n.name} from an ambush`, joiners: false }) : 'win';
    if (w.over) return;
    if (res === 'win') {
      const pay = rng.int(50, 140);
      h.cash += pay;
      n.affinity += 15;
      remember(n, 'was kept safe by Blackbird on the walk home');
      c.emit('bodyguard_gig', 'good', { variant: 'saved', amount: pay, npc: n.name });
    }
  } else {
    const pay = rng.int(40, 120);
    h.cash += pay;
    n.affinity += 10;
    c.emit('bodyguard_gig', 'good', { variant: 'safe', amount: pay, npc: n.name });
  }
}

function burgleHome(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'burgle_home', n.id);
  const p = clamp(0.35 + skillLevel(h, 'lockpicking') * 0.05 + skillLevel(h, 'sneak') * 0.04 - n.level * 0.03, 0.05, 0.85);
  train(c, 'lockpicking', 2);
  if (rng.chance(p)) {
    const cash = rng.int(80, 220);
    h.cash += cash;
    train(c, 'sneak', 2);
    let item = '';
    if (rng.chance(0.4)) {
      const it = makeItem(rng.pick(['memory_shard', 'fake_id', 'credchip', 'walkman']));
      item = it.name;
      acquire(c, it);
    }
    c.emit('burgle_home', 'good', { variant: 'clean', amount: cash, item, npc: n.name });
  } else {
    n.affinity -= 50;
    remember(n, 'came home early and caught Blackbird mid-burglary');
    addHeat(w, 'npd', 2);
    c.emit('burgle_home', 'bad', { variant: 'caught', npc: n.name });
    fight(c, [n], { cause: `getting caught burgling ${n.name}'s place`, assault: true });
  }
}

function protectionRacket(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'protection_racket', n.id);
  const p = clamp(0.3 + h.muscle * 0.03 + skillLevel(h, 'intimidation') * 0.05 - n.level * 0.04, 0.1, 0.85);
  train(c, 'intimidation', 2);
  if (rng.chance(p)) {
    const cut = rng.int(20, 60);
    h.cash += cut;
    n.affinity -= 15;
    addHeat(w, 'npd', 1);
    remember(n, 'pays Blackbird protection money, resentfully');
    c.emit('protection_racket', 'good', { variant: 'pays', amount: cut, npc: n.name });
  } else {
    c.emit('protection_racket', 'bad', { variant: 'refuses', npc: n.name });
    fight(c, [n], { cause: `shaking down ${n.name} for protection money`, assault: true });
  }
}

function scamMark(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'scam_mark', n.id);
  const stake = Math.min(h.cash, rng.int(10, 30));
  const p = clamp(HODDS.scamMark(h), 0.1, 0.85);
  train(c, 'grifting', 2);
  train(c, 'cards', 1);
  if (rng.chance(p)) {
    const take = stake + rng.int(5, 30);
    h.cash += take;
    c.emit('scam_mark', 'good', { variant: 'win', amount: take, npc: n.name });
  } else {
    n.affinity -= 25;
    c.emit('scam_mark', 'bad', { variant: 'caught', npc: n.name });
    if (rng.chance(0.5)) fight(c, [n], { cause: `getting caught running a card scam on ${n.name}`, assault: true });
  }
}

function sellFakeGoods(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'sell_fake_goods', n.id);
  const p = clamp(HODDS.sellFakeGoods(h) - (n.tags.includes('dealer') ? 0.2 : 0), 0.1, 0.85);
  train(c, 'grifting', 2);
  train(c, 'haggling', 1);
  if (rng.chance(p)) {
    const take = Math.min(n.cash, rng.int(15, 50));
    n.cash -= take;
    h.cash += take;
    c.emit('sell_fake_goods', 'good', { variant: 'sold', amount: take, npc: n.name });
  } else {
    n.affinity -= 20;
    c.emit('sell_fake_goods', 'bad', { variant: 'tested', npc: n.name });
    if (rng.chance(0.3)) fight(c, [n], { cause: `getting caught selling ${n.name} bunk goods`, assault: true });
  }
}

function coldRead(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'cold_read', n.id);
  const p = clamp(HODDS.coldRead(h), 0.1, 0.85);
  train(c, 'grifting', 1);
  if (rng.chance(p)) {
    const tip = rng.int(10, 35);
    h.cash += tip;
    n.affinity += 5;
    c.emit('cold_read', 'good', { variant: 'spooked', amount: tip, npc: n.name });
  } else {
    n.affinity -= 5;
    c.emit('cold_read', 'bad', { variant: 'skeptic', npc: n.name });
  }
}

const FAVORS = ['fetch_item', 'deliver_message', 'scare_someone', 'watch_my_stuff', 'walk_me_home'] as const;

function oddRequest(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  mark(c, 'odd_request', n.id);
  const favor = rng.pick(FAVORS);
  const skill = favor === 'scare_someone' ? 'intimidation' : favor === 'walk_me_home' ? 'athletics' : 'streetwise';
  const p = clamp(0.4 + skillLevel(h, skill) * 0.04 + skillLevel(h, 'hustling') * 0.02 + synergy(h, ['streetwise', ['stat:charm', 0.3]]) * 0.02, 0.15, 0.88);
  train(c, skill, 1);
  train(c, 'hustling', 1);
  if (rng.chance(p)) {
    const pay = rng.int(20, 70);
    h.cash += pay;
    n.affinity += 12;
    gainXp(c, 5);
    remember(n, `got Blackbird to ${favor.replace('_', ' ')}`);
    c.emit('odd_request', 'good', { variant: favor, amount: pay, npc: n.name });
  } else {
    n.affinity -= 8;
    c.emit('odd_request', 'bad', { variant: favor, npc: n.name });
  }
}

function huntDrone(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  c.emit('hunt_drone', 'mixed', { npc: n.name });
  const res = fight(c, [n], { cause: 'hunting down an Atlas patrol drone', assault: true });
  if (w.over || res !== 'win') return;
  const drop = rng.int(1, 3);
  w.heat.atlas = Math.max(0, (w.heat.atlas ?? 0) - drop);
  if (rng.chance(0.5)) acquire(c, makeItem('drone_core'));
  c.emit('hunt_drone', 'good', { variant: 'scrapped', npc: n.name, drop });
}
