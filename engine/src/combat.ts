import type { Ctx, Hero, Injury, Item, Npc, World } from './types';
import { IMPLANTS } from './content/implants';
import { KINDS, removeCompanion } from './companions';
import { skillLevel, skillValue, train } from './skills';
import { basePower, fightTraining, hpPerLevel, levelCost } from './grade';
import { perk } from './lab';
import { addAmmo, wielded } from './arms';
import { fxOf, rating } from './weapons';
import { Sim, highlights, type Arrival, type Hooks, type LogEntry, type RoundRecord } from './tactics';
import { nested } from './events';
import { witnessAssault } from './witness';
import { collectBounties } from './bounty';
import { npcsAt } from './population';
import { pinAt, settleAt } from './movement';
import { populate } from './roster';
import { expand, liftCordon } from './mapgen';
import { ensureDeep } from './deepen';
import { spreadDeed } from './ties';
import { settleContracts } from './contracts';
import { ensureDungeon } from './dungeons';
import { afterTakedown, downFor, isShut } from './shutdown';
import { dropFlights, modelOf } from './dragonmodels';
import { markKilled } from './dragonlog';

export { npcsAt };

export const here = (w: World): Npc[] => npcsAt(w, w.hero.locationId);

export const weaponStyle = (tags: string[]): 'marksmanship' | 'melee' | null => (tags.includes('gun') ? 'marksmanship' : tags.includes('melee') ? 'melee' : null);

/** Thrown-item damage: mostly her regular stats; a cue also gets her pool skill. Cocktails burn. */
export function throwDamage(w: World, item: Item): number {
  const h = w.hero;
  const cue = item.tags.includes('cue') ? skillValue(h, 'pool') * 1.5 : 0;
  return Math.round(h.muscle + h.level * 1.5 + skillValue(h, 'throwing') * 2 + cue + item.power);
}

/** Move the hero. Scrambling through a hidden door reveals it, in both directions. */
export function relocate(w: World, to: string): void {
  const h = w.hero;
  // A shut door stays shut however she came to be at it: thrown, fleeing, or lost.
  for (let i = 0; i < 6 && isShut(w, to); i++) to = w.locations[to]?.tossTo ?? 'street_main';
  const from = h.locationId;
  // Whoever she's looking at stays where she left them for a while; where she's headed catches up on the time she's been away.
  pinAt(w, from, w.clock);
  h.previousLocationId = from;
  h.locationId = to;
  const dest = w.locations[to];
  if (dest) {
    dest.visits++;
    expand(w, dest); // the city grows to meet her; see mapgen.ts
    if (dest.dungeon) ensureDungeon(w, dest); // and so does the inside of a dungeon; see dungeons.ts
    settleAt(w, to, w.clock);
    populate(w, dest);
  }
  for (const e of w.locations[from]?.exits ?? []) if (e.to === to) e.hidden = false;
  for (const e of dest?.exits ?? []) if (e.to === from) e.hidden = false;
}

export const hasInjury = (w: World, i: Injury): boolean => w.hero.injuries.includes(i);

export function addHeat(w: World, faction: string | null, n: number): void {
  if (!faction) return;
  w.heat[faction] = Math.min(10, (w.heat[faction] ?? 0) + n);
}

export function remember(npc: Npc, what: string): void {
  npc.memories.push(what);
  if (npc.memories.length > 12) npc.memories.shift();
}

/** `allies: false` leaves her companions out: in a fight they are on the board as people of their own. */
export function heroPower(w: World, weapon: Item = wielded(w.hero), allies = true): number {
  const h = w.hero;
  let p = basePower(h.level) + h.muscle + weapon.power;
  const style = weaponStyle(weapon.tags);
  if (style) p += skillValue(h, style) * 0.6;
  for (const b of h.buffs) if (b.until > w.beat) p += b.power;
  if (allies) for (const a of h.companions) if (a.hp > 0) p += a.power;
  for (const i of h.implants) p += IMPLANTS[i]?.power ?? 0;
  if (w.situation.weather === 'heatwave' && w.locations[h.locationId]?.outdoors) p -= 2;
  p -= Math.max(0, h.drunk - skillLevel(h, 'tolerance') * 0.4) * 1.2;
  p -= h.needsFx?.power ?? 0; // an empty stomach and no sleep
  let mult = 1;
  if (hasInjury(w, 'broken_leg')) mult *= 0.75;
  if (hasInjury(w, 'cracked_ribs')) mult *= 0.85;
  if (hasInjury(w, 'concussion')) mult *= 0.85;
  if (hasInjury(w, 'fried_optics')) mult *= 0.9;
  mult *= 1 - 0.25 * (h.sore ?? 0); // a body worked over by the gym (see gym.ts)
  return Math.max(1, p * mult);
}

/** Equip an item if it's better; otherwise stash it. Emits an `equip` event. */
export function acquire(c: Ctx, item: Item): void {
  const h = c.w.hero;
  // Ammo goes straight into the pool; the box itself is just cardboard.
  if (item.rounds && item.ammoType) {
    addAmmo(h, item.ammoType, item.rounds);
    return;
  }
  if ((item.kind === 'weapon' || item.kind === 'gadget') && rating(item) > rating(h.weapon) * 1.03) {
    const old = h.weapon;
    h.weapon = item;
    h.inventory.push(old); // keep the old one: when the good gun runs dry, the tire iron still works
    c.emit('equip', 'good', { item: item.name, old: old.name, slot: 'weapon', unstable: !!item.unstable });
  } else if (item.kind === 'armor' && item.power > (h.armor?.power ?? 0)) {
    const old = h.armor;
    h.armor = item;
    if (old) h.inventory.push(old);
    c.emit('equip', 'good', { item: item.name, old: old?.name ?? 'nothing', slot: 'armor', unstable: false });
  } else {
    h.inventory.push(item);
  }
}

export function gainXp(c: Ctx, amount: number): void {
  const h = c.w.hero;
  h.xp += Math.round(amount * (1 + perk(c.w.legacy, 'xp') / 100));
  while (h.xp >= levelCost(h.level)) {
    h.xp -= levelCost(h.level);
    h.level++;
    h.maxHp += hpPerLevel(h.level); // a bigger tank, not a refill: healing costs a med pack or a street doc
    const stat = (['muscle', 'reflex', 'charm', 'hack'] as const)[h.level % 4]!;
    h[stat]++;
    c.w.stats.maxLevel = Math.max(c.w.stats.maxLevel, h.level);
    c.emit('level_up', 'good', { level: h.level, stat });
  }
}

/**
 * The people a bar's rules protect her from killing: its owner and its regular door muscle. A beating is all the house
 * allows, unless she has set her mind on the real thing (a kill goal, not a lesson) and is swinging at exactly him.
 */
const marked = (w: World, f: Npc): boolean =>
  (f.tags.includes('owner') || f.tags.includes('pit') || (!!f.authored && f.role === 'bouncer')) && w.mind.goals.some((g) => g.kind === 'kill' && g.mode === 'kill' && g.npc === f.id);

export function isLethal(foes: Npc[], w: World): boolean {
  if (foes.length && foes.every((f) => f.tags.includes('nonlethal'))) return false;
  if (foes.some((f) => marked(w, f))) return true;
  if (foes.some((f) => f.tags.some((t) => ['robot', 'cop', 'corp', 'boss'].includes(t)) && !f.tags.includes('nonlethal'))) return true;
  const kind = w.locations[w.hero.locationId]?.kind;
  return !(kind === 'bar' || kind === 'club' || kind === 'shop' || kind === 'home' || kind === 'gym' || kind === 'pawn');
}

export function maybeInjure(c: Ctx, hit: number, chance = 0.4): void {
  const h = c.w.hero;
  if (hit < h.maxHp * 0.18 || !c.rng.chance(chance * (1 + (h.sore ?? 0)))) return;
  const options = (['broken_leg', 'cracked_ribs', 'fried_optics', 'concussion'] as const).filter((i) => !h.injuries.includes(i));
  if (!options.length) return;
  const injury = c.rng.pick(options);
  h.injuries.push(injury);
  c.emit('injury', 'bad', { injury });
}

export function kill(c: Ctx, w: World, npc: Npc, by: string): void {
  npc.alive = false;
  npc.hp = 0;
  w.stats.kills++;
  for (const other of npcsAt(w, npc.locationId)) {
    if (other.faction && other.faction === npc.faction) {
      other.affinity -= 25;
      remember(other, `saw Blackbird kill ${npc.name}`);
    } else if (other.id !== npc.id) {
      other.affinity -= 3;
    }
  }
  if (npc.tags.includes('cop')) addHeat(w, 'npd', 4);
  if (npc.tags.includes('corp')) addHeat(w, 'atlas', 2);
  if (npc.faction === 'halo') addHeat(w, 'halo', 3);
  if (npc.faction === 'club') addHeat(w, 'club', 2);
  if (npc.tags.includes('monitored')) {
    addHeat(w, 'atlas', 3);
    addHeat(w, 'npd', 1);
    c.emit('monitored_death', 'bad', { npc: npc.name, groups: c.rng.int(3, 9), by });
  }
}

export type FightResult = 'win' | 'flee' | 'tossed' | 'arrested' | 'dead';

export interface FightOpts {
  cause: string;
  joiners?: boolean;
  /** She started this one, on people who weren't already trying to hurt her. Anyone who sees it will have opinions. */
  assault?: boolean;
  /** She gets the jump on them (they weren't ready), but nobody outside is watching, so there's no heat and no crowd. */
  ambush?: boolean;
}

/** Crowd members who might pile in on the other side, and how likely each is to. */
function crowdJoiners(c: Ctx, foes: Npc[]): Npc[] {
  const { w, rng } = c;
  const h = w.hero;
  const joined: Npc[] = [];
  for (const n of npcsAt(w, h.locationId)) {
    if (foes.includes(n) || h.companions.some((a) => a.npcId === n.id) || joined.length >= 3) continue;
    const p = n.tags.includes('owner') ? 0.5 : n.tags.includes('rowdy') && n.affinity < 25 ? 0.22 : 0;
    if (p && rng.chance(p)) joined.push(n);
  }
  return joined;
}

const HOOKS: Hooks = { heroPower, kill, maybeInjure, hasInjury, throwDamage };

/**
 * The big one. Sets the stage (who is here, who turns up late, who saw), plays the fight out on a small grid
 * (tactics.ts), then settles up: injuries, loot, heat, XP, where she wakes up.
 */
export function fight(c: Ctx, foesIn: Npc[], o: FightOpts): FightResult {
  const { w } = c;
  const h = w.hero;
  const foes = foesIn.filter((f) => f.alive);
  if (!foes.length) return 'win';
  // The fight is one story: it opens with the squaring-up, and everything after (who saw, how each round went, the end) is told inside it.
  let result: FightResult = 'win';
  nested(
    c,
    'fight_start',
    'mixed',
    {
      foes: foes.map((f) => f.name).join(', '),
      count: foes.length,
      cause: o.cause,
      foe: foes[0]!.name,
      foeRole: foes[0]!.role,
      weapon: wielded(h).name,
      boss: foes.some((f) => f.tags.includes('boss')),
      dragon: foes.find((f) => f.tags.includes('dragon'))?.archetype ?? '',
      hpPct: Math.round((h.hp / h.maxHp) * 100),
      power: Math.round(heroPower(w)),
      level: h.level,
    },
    () => {
      result = playFight(c, foes, o);
    },
  );
  return result;
}

function playFight(c: Ctx, foes: Npc[], o: FightOpts): FightResult {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  w.stats.fights++;
  // Whoever she fights starts to matter: they get a character, and people who care about them.
  for (const f of foes) ensureDeep(w, f);

  // Bystanders pile in, but they come through the doors a few rounds later rather than standing around from the start.
  const arrivals: Arrival[] = [];
  if (o.joiners !== false && loc.crowded) {
    for (const n of crowdJoiners(c, foes)) arrivals.push({ npc: n, round: rng.int(2, 4), why: 'joiner' });
  }
  // Hitting people in front of people (or cameras) has consequences.
  let seen = false;
  let heatFaction = 'npd';
  let warranted = false;
  if (o.assault) {
    const wit = witnessAssault(c, foes, { noise: fxOf(wielded(h, foes)).noise });
    seen = wit.seen;
    heatFaction = wit.heatFaction;
    warranted = wit.warranted;
    for (const j of wit.joiners) arrivals.push({ npc: j, round: rng.int(2, 5), why: j.tags.includes('cop') || j.tags.includes('security') ? 'law' : 'joiner' });
  }
  // A clinic's automation takes a dim view of violence on the premises.
  if (loc.kind === 'clinic' && foes.some((f) => !f.tags.includes('guard'))) {
    for (const g of npcsAt(w, loc.id)) {
      if (g.tags.includes('guard') && !foes.includes(g) && !arrivals.some((a) => a.npc === g)) arrivals.push({ npc: g, round: 1, why: 'law' });
    }
  }
  for (const f of foes) f.hostile = true;
  const lethal = isLethal([...foes, ...arrivals.map((a) => a.npc)], w);
  const startHp = h.hp;
  const names = foes.map((f) => f.name).join(', ');

  const factions = new Set(foes.map((f) => f.faction).filter((f): f is string => !!f));
  const backup = () =>
    npcsAt(w, loc.id).filter(
      (n) =>
        !foes.includes(n) &&
        !arrivals.some((a) => a.npc === n) &&
        !h.companions.some((a) => a.npcId === n.id) &&
        !!n.faction &&
        factions.has(n.faction) &&
        n.archetype !== 'puppy' &&
        n.tags.some((t) => ['rowdy', 'ganger', 'security', 'cop', 'strong'].includes(t)) &&
        !n.tags.some((t) => ['kid', 'pet', 'robot', 'dragon'].includes(t)),
    );
  const maxRounds = (foes.some((f) => f.tags.includes('boss')) ? 26 : 14) + 2;
  const sim = new Sim(c, HOOKS, { foes, arrivals, lethal, assault: !!o.assault || !!o.ambush, maxRounds, backup });
  const res = sim.run();
  let result: FightResult = res.result;
  const wield = res.wield;
  const { backfires, crits, ammoSpent } = res.stats;
  const rounds = res.rounds;

  // Whoever never got there wasn't part of it after all; whoever did, was.
  for (const a of arrivals) if (!res.arrived.includes(a.npc)) a.npc.hostile = false;
  for (const n of res.arrived) {
    n.hostile = true;
    if (n.tags.includes('cop')) addHeat(w, 'npd', 1);
  }
  foes.push(...res.arrived);
  // The ones who ran are gone for a while and have opinions.
  for (const f of foes) {
    if (!res.fled.has(f.id)) continue;
    f.hostile = false;
    f.downUntil = w.beat + downFor(f, rng, true);
    f.affinity -= 20;
    remember(f, 'fled from Blackbird');
  }
  tellRounds(c, res.log, res.roundLog);

  const gone = (f: Npc) => res.fled.has(f.id);
  const standing = () => foes.filter((f) => f.alive && !res.down.has(f.id) && !gone(f));
  const survivors = standing();
  const killed = foes.filter((f) => !f.alive || res.down.has(f.id));
  const base = {
    foes: names,
    count: foes.length,
    killed: killed.length,
    fled: res.fled.size,
    rounds,
    taken: Math.max(0, startHp - h.hp),
    weapon: wield.name,
    ammoSpent,
    backfires,
    crits,
    allies: h.companions.filter((a) => a.hp > 0).map((a) => a.name).join(' and '),
    allyKind: h.companions.find((a) => a.hp > 0)?.kind ?? '',
    boss: foes.some((f) => f.tags.includes('boss')),
    dragon: foes.find((f) => f.tags.includes('dragon'))?.archetype ?? '',
    killer: survivors[0]?.name ?? '',
    place: loc.name,
  };

  if (result === 'win') {
    let xp = 0;
    let cash = 0;
    const found: string[] = [];
    for (const f of foes) {
      const defeats = f.memories.filter((m) => m === 'was beaten by Blackbird').length;
      const over = Math.max(0, h.level - f.level);
      const worth = ((f.level * 10) / (1 + defeats)) * Math.max(0.1, 1 - over * 0.15);
      if (gone(f)) {
        xp += worth * 0.5; // they ran; she gets no loot and half the glory
        continue;
      }
      xp += worth;
      cash += f.cash;
      f.cash = 0;
      if (f.alive) {
        // non-lethal: knocked out, not dead. They'll remember.
        f.hp = Math.max(1, Math.round(f.maxHp * 0.5));
        f.hostile = false;
        f.downUntil = w.beat + downFor(f, rng, false);
        f.affinity -= 40;
        remember(f, 'was beaten by Blackbird');
        // Beaten is beaten: she goes through the pockets of anyone who can't stop her.
        f.loadout = f.loadout.filter((it) => {
          if (it.kind === 'weapon' || !rng.chance(0.6)) return true; // they keep the means to hold a grudge
          acquire(c, it);
          found.push(it.name);
          return false;
        });
      } else {
        for (const it of f.loadout.splice(0)) {
          acquire(c, it);
          found.push(it.name);
        }
      }
    }
    h.cash += cash;
    afterTakedown(c, foes.filter((f) => !gone(f) && (!f.alive || f.downUntil > w.beat)));
    collectBounties(c, foes.filter((f) => !gone(f)));
    // The people who care about them hear; and whoever hired her pays.
    for (const f of foes) {
      if (gone(f)) continue;
      if (!f.alive) spreadDeed(c, f, 'killed');
      else if (f.downUntil > w.beat) spreadDeed(c, f, 'hurt');
    }
    settleContracts(c, foes.filter((f) => !gone(f)));
    h.hp = Math.max(h.hp, 1);
    c.emit('fight_end', 'good', { ...base, variant: 'win', cash, xp: Math.round(xp), loot: found.slice(0, 3).join(', ') });
    gainXp(c, xp);
    // CINDERJAW keeps the district shut. With it down the cordon comes off, for this night and every one after; the night goes on.
    if (foes.some((f) => f.archetype === 'apollo') && w.legacy.gate !== 'open') {
      liftCordon(w);
      c.emit('victory', 'good', {});
    }
  } else if (result === 'flee') {
    for (const f of foes) f.hostile = false;
    relocate(w, loc.fleeTo);
    c.emit('fight_end', 'mixed', { ...base, variant: 'flee', to: w.locations[loc.fleeTo]!.name });
    if (foes.some((f) => f.tags.includes('security')) && lethal) addHeat(w, foes[0]!.faction, 1);
  } else if (result === 'tossed') {
    for (const f of foes) f.hostile = false;
    h.hp = Math.max(h.hp, Math.round(h.maxHp * 0.1));
    relocate(w, loc.tossTo);
    c.emit('fight_end', 'bad', { ...base, variant: 'tossed', to: w.locations[loc.tossTo]!.name });
  } else if (result === 'arrested') {
    for (const f of foes) f.hostile = false;
    h.hp = Math.max(h.hp, 10);
    const fine = Math.round(h.cash * 0.6);
    h.cash -= fine;
    relocate(w, 'street_main');
    w.heat.npd = Math.max(0, (w.heat.npd ?? 0) - 3);
    c.emit('fight_end', 'bad', { ...base, variant: 'arrested', fine });
  } else {
    w.over = true;
    w.ending = 'dead';
    c.emit('fight_end', 'bad', { ...base, variant: 'dead' });
    c.emit('death', 'bad', { killer: survivors[0]?.name ?? 'something', place: loc.name, cause: o.cause, level: h.level });
  }

  // Bodies on the floor in front of witnesses turn assault into something the police take personally.
  if (seen && !warranted && !w.over) {
    const bodies = foes.filter((f) => !f.alive).length;
    if (bodies) {
      const gain = Math.min(3, bodies);
      addHeat(w, heatFaction, gain);
      c.emit('heat_up', 'bad', { variant: heatFaction, gain, level: w.heat[heatFaction] ?? 0, source: 'bodies', calls: 0 });
    }
  }

  for (const f of foes) f.flags = f.flags.filter((x) => x !== 'disabled');
  const style = weaponStyle(wield.tags);
  // What a fight teaches depends on who she was fighting: nothing from the trivial, the most from people a little ahead of her.
  const foeGrade = foes.length ? foes.reduce((a, f) => a + f.level, 0) / foes.length : 0;
  if (style && !w.over) train(c, style, fightTraining(1 + Math.min(3, foes.length), skillValue(h, style), foeGrade));
  if (result === 'flee' && !w.over) train(c, 'athletics', 2);
  if (result === 'win' && foes.length >= 3) h.fame += 1;
  if (result === 'win') {
    const dragons = foes.filter((f) => f.tags.includes('dragon') && !f.tags.includes('boss')).length;
    if (dragons) w.counters.dragon_kills = (w.counters.dragon_kills ?? 0) + dragons;
    const scalps = foes.filter((f) => f.tags.includes('artemis')).length;
    if (scalps) {
      h.fame += 4 * scalps;
      w.counters.artemis_kills = (w.counters.artemis_kills ?? 0) + scalps;
    }
    // The rest of the family are worth more the higher the mark.
    for (const f of foes) {
      const m = modelOf(f.archetype);
      if (m && !f.tags.includes('artemis') && f.tags.includes('dragon')) h.fame += 3 * m.mark;
    }
    // The ones that don't come back.
    for (const f of foes) if (f.tags.includes('dragon') && !f.alive) markKilled(w, f);
  }
  if (w.flight && foes.some((f) => w.flight!.ids.includes(f.id))) dropFlights(w, w.flight.ids);
  if (result === 'win' && foes.some((f) => f.tags.includes('boss'))) h.fame += 10;
  // Allies took their own knocks on the board. Those who went down are lost; the rest share the loyalty.
  if (!w.over) {
    for (const a of [...h.companions]) {
      if (a.hp <= 0) {
        removeCompanion(c, a, 'lost');
        continue;
      }
      if (result === 'win') a.loyalty = Math.min(100, a.loyalty + 3);
      else a.loyalty -= 4;
    }
  }
  return result;
}

/** The most moments we'll single out in one fight, on top of a line for each round. */
const MOMENTS = 8;

/**
 * Play the fight back round by round: the moments that stood out in each, then what the round came to.
 * (The sim has already run; this is only the telling.)
 */
function tellRounds(c: Ctx, log: LogEntry[], rounds: RoundRecord[]): void {
  const told = new Set(highlights(log, MOMENTS));
  const moments = log.filter((e) => told.has(e));
  for (const r of rounds) {
    for (const e of moments.filter((m) => m.round === r.round)) c.emit(e.type, e.outcome, { ...e.data, round: r.round });
    const quiet = !r.dealt && !r.taken && !r.down.length;
    c.emit('fight_round', r.taken > r.dealt ? 'bad' : r.dealt ? 'good' : 'mixed', {
      round: r.round,
      dealt: r.dealt,
      to: r.to,
      taken: r.taken,
      by: r.by,
      down: r.down.join(', '),
      downCount: r.down.length,
      left: r.foesLeft,
      hpPct: r.hpPct,
      variant: r.down.length ? 'down' : quiet ? 'quiet' : r.dealt && r.taken ? 'trade' : r.dealt ? 'clean' : 'hurt',
    });
  }
}
