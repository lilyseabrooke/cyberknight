import { VIA } from './hexmap';
import type { Ctx, Npc, World } from './types';
import { acquire, addHeat, fight, gainXp, hasInjury, heroPower, here, maybeInjure, remember } from './combat';
import { makeItem } from './content/items';
import { clamp, levelRisk, revealExit, spawnGroup, dutchHere, type Candidate } from './candidate';
import { moveThrough } from './moves';
import { addCompanion, newCompanion, slotsFree } from './companions';
import { featureCandidates } from './features';
import { bankPull, dropCandidates } from './bank';
import { extraCandidates } from './extras';
import { dragonCandidates } from './dragons';
import { hasAlly } from './companions';
import { odds, skillLevel, synergy, train } from './skills';
import { hobbyCandidates } from './hobbies';
import { rodCandidates } from './rodwork';
import { buyStim, supplyCandidates, supplyUrge } from './supply';
import { needsUrge, restCandidates } from './rest';
import { STIM_IDS } from './content/stims';
import { DOC_FEE } from './content/shops';
import { graffitiCandidates } from './graffiti';
import { gymCandidates } from './gym';
import { pawnCandidates } from './pawn';
import { realtyCandidates, realtyPull } from './realty';
import { benchUrge, chopCandidates } from './chop';
import { partsUrge, scavengeCandidates } from './scavenge';
import { vehicleCandidates } from './vehicles';
import { getawayCandidates } from './getaway';
import { goalCandidates } from './goals';
import { dungeonCandidates, entranceRisk } from './dungeons';
import { discretionCandidates } from './discretion';
import { hustleCandidates } from './hustles';
import { knowsBounty, tippable } from './bounty';
import { healUrge } from './urges';
import { laylowCandidates } from './laylow';
import { stageCandidates } from './stage';
import { famed } from './renown';
import { bookingCandidates } from './bookings';
import { axeCandidates } from './axeplay';
import { flashMobCandidate } from './fans';
import { teardownCandidate } from './cordon';
import { undergroundCandidates } from './underground';
import { heatUrge } from './laylow';
import { jealousy, kindle, kissBonus, kissesWith, romanceCandidates } from './romance';
import { bondCandidates, bondEvent, romanceMod, scruples } from './bonds';
import { knowledgeCandidates, shareFact } from './knowledge';
import { questCandidates } from './quests';
import { influenceCandidates } from './influence';
import { isFairGame } from './people';
import { isBadGuy } from './traits';
import { isClosed } from './hours';
import { moveNpc } from './population';
import { cooling } from './mind';
import { atLeast, awareness, bucketOf, coverAt, enterStealth, isSneaking, npcPerception, stealthCandidates } from './stealth';
import { spatialStir } from './placeboard';
import { analyze, perceived, perceivedRatio, ratio, readQuality, skillOf, statsOf } from './npcstats';

const DRINKS = [
  'a Molotov Mule', 'a Synthahol Sunrise', 'a Liquid Chrome shooter', 'a Neutron Star Sour', 'three fingers of something blue',
  'a Fall of Saigon-9', 'an Atlas Special (it is mostly regret)', 'a pint of whatever is glowing',
];

/**
 * Is this somebody worth a fight? Fighting is how she makes her living, so she goes for people who carry something,
 * people who have it coming, and people she hasn't flattened already. A regular who has been knocked down before
 * pays less every time (and the fun goes out of it), so the barstaff stop being her favourite punchbag.
 */
export function fightWorth(w: World, n: Npc): number {
  const purse = Math.min(0.8, 0.35 * Math.log1p(n.cash / 30)) + (n.loadout.length ? 0.15 : 0);
  const defeats = n.memories.filter((m) => m === 'was beaten by Blackbird').length;
  const baddie = isBadGuy(n) ? 0.35 : 0;
  // Not worth the trouble: nothing in their pockets, nobody who'd cheer.
  const staff = n.tags.includes('doc') || n.tags.includes('staff') ? 0.5 : 0;
  return purse + baddie - 0.7 * defeats - staff - (heroPower(w) > n.power * 3 ? 0.4 : 0);
}

const alive = (n: Npc | undefined): n is Npc => !!n && n.alive;
const talkable = (n: Npc): boolean => !n.hostile && !n.tags.includes('boss') && !n.tags.includes('dragon') && n.archetype !== 'puppy';

/** Everything Blackbird could do right now, from everything in reach. */
export function gather(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const crowd = here(w);

  // ------------------------------------------------------------------ people
  for (const n of crowd) {
    if (n.archetype === 'puppy') {
      out.push({
        key: `pet:${n.id}`, drives: { lust: 0.15, curiosity: 0.35 },
        run: (c) => {
          n.affinity += 10;
          train(c, 'rapport', 1);
          c.emit('pet_puppy', 'good', { npc: n.name });
        },
      });
      if (slotsFree(w)) {
        out.push({
          key: `steal_puppy:${n.id}`, drives: { greed: 0.4, curiosity: 0.7, pride: 0.3 }, risk: 1.2,
          run: (c) => stealPuppy(c, n),
        });
      }
      continue;
    }
    if (!talkable(n)) continue;

    out.push({ key: `chat:${n.id}`, drives: { curiosity: 0.5, lust: 0.05 }, run: (c) => chat(c, n) });
    out.push(...influenceCandidates(w, n));

    if (isFairGame(n)) {
      out.push({ key: `flirt:${n.id}`, drives: { lust: 1.0, curiosity: 0.1 }, bonus: scruples(w, n), intent: { npc: n.name }, run: (c) => flirt(c, n) });
      if (n.affinity >= 12 || (h.drunk >= 2 && n.affinity >= 0)) {
        out.push({ key: `kiss:${n.id}`, drives: { lust: 1.5 }, bonus: kissBonus(w, n) + scruples(w, n), run: (c) => kiss(c, n) });
      }
    }
    // The street doc is the only one who puts her back together for pocket change. She doesn't bite the hand that patches her.
    const spare = n.tags.includes('doc') && n.affinity > -20;
    // She can only lift from someone who hasn't noticed her: while sneaking, that is someone Unaware or Suspicious; otherwise it takes cover to slip into stealth first.
    const liftable = isSneaking(w) ? !atLeast(bucketOf(w, n), 'alert') : coverAt(w, h.locationId) >= 0.25;
    if (!spare && liftable && !n.tags.includes('robot') && (n.cash > 0 || n.loadout.length)) {
      out.push({
        key: `pickpocket:${n.id}`, drives: { greed: 0.95, curiosity: 0.2 }, risk: 0.6 + levelRisk(w, n) + clamp((perceivedRatio(w, n, 'reflex') + perceivedRatio(w, n, 'int') / 2 - 1.5) * 0.5, 0, 1), intent: { npc: n.name },
        run: (c) => pickpocket(c, n),
      });
    }
    if (!spare) {
      // Paper on somebody she knows about is a payday, and the police won't mind.
      const paper = n.bounty && knowsBounty(w, n.id) ? Math.min(1.2, n.bounty.amount / 250) : 0;
      out.push({
        key: `challenge:${n.id}`, drives: { bravery: 1.0, pride: 0.8, greed: paper ? 0.6 : 0 }, bonus: (n.affinity < -10 ? 0.4 : 0) + paper + fightWorth(w, n),
        risk: 0.4 + levelRisk(w, n) + (n.power > heroPower(w) * 1.5 ? 1 : 0) + clamp((perceivedRatio(w, n, 'muscle') - 1) * 0.5, 0, 0.8),
        run: (c) => {
          c.emit('challenge', 'mixed', { npc: n.name, role: n.role, variant: String(c.rng.int(1, 6)) });
          fight(c, [n], { cause: `picking a fight with ${n.name}`, assault: true });
        },
      });
      out.push({
        key: `threaten:${n.id}`, drives: { bravery: 0.5, pride: 0.6, greed: 0.6 }, risk: 0.5 + levelRisk(w, n) + clamp((perceivedRatio(w, n, 'muscle') - 1) * 0.8, 0, 1.2), intent: { npc: n.name },
        run: (c) => threaten(c, n),
      });
    }
    if (n.tags.includes('strong')) {
      out.push({ key: `armwrestle:${n.id}`, drives: { pride: 0.9, bravery: 0.2 }, risk: 0.1 + clamp((perceived(w, n, 'muscle') - h.muscle) * 0.1, 0, 1.5), intent: { npc: n.name }, run: (c) => armWrestle(c, n) });
    }
    if ((n.tags.includes('augmented') || n.tags.includes('robot')) && !n.flags.includes('hacked')) {
      out.push({
        key: `hack:${n.id}`, drives: { curiosity: 0.75, greed: 0.5 }, risk: 0.3 + levelRisk(w, n) * 0.7 + clamp((perceived(w, n, 'int') - h.int) * 0.1, 0, 1.5), intent: { npc: n.name },
        run: (c) => hackNpc(c, n),
      });
    }
    if (talkable(n) && readQuality(w, n) < 0.7 && !cooling(w, `analyze:${n.id}`)) {
      out.push({ key: `analyze:${n.id}`, drives: { curiosity: 0.45, pride: 0.1 }, smart: 0.3, risk: 0.05, intent: { npc: n.name }, run: (c) => analyze(c, n) });
    }
    if (n.tags.includes('fixer')) {
      if (!w.flags.job_taken) {
        out.push({ key: `ask_work:${n.id}`, drives: { quest: 1.0, greed: 0.3 }, bonus: 0.2, run: (c) => askWork(c, n) });
      }
      const sellable = h.inventory.filter((i) => (i.kind === 'loot' || i.kind === 'weapon' || i.kind === 'armor' || i.kind === 'gadget') && !i.tags.includes('instrument') && !i.tags.includes('quest') && !i.tags.includes('key'));
      if (sellable.length) {
        out.push({
          key: 'fence', drives: { greed: 1.0 }, bonus: sellable.length * 0.1,
          run: (c) => fence(c, n),
        });
      }
    }
    if (n.tags.includes('doc') && h.cash >= DOC_FEE[0] && (h.hp < h.maxHp * 0.85 || h.injuries.length)) {
      out.push({
        key: 'get_patched', drives: { curiosity: 0.15 }, smart: 1.3,
        bonus: 1.8 * healUrge(h) + h.injuries.length * 0.8, run: (c) => getPatched(c, n),
      });
    }
    if (n.tags.includes('dealer') && h.cash >= 20) {
      out.push({ key: 'buy_stims', drives: { curiosity: 0.55, thirst: 0.3, bravery: 0.2 }, risk: 0.2, run: (c) => buyStims(c, n) });
    }
  }

  // ------------------------------------------------------------- the bar itself
  const bartender = ['nyx', 'dutch'].map((id) => w.npcs[id]).find((n) => alive(n) && n!.locationId === loc.id);
  if (bartender && (h.cash >= 8 || (h.tab < 100 && bartender.affinity > -15))) {
    out.push({
      key: 'order_drink', drives: { thirst: 1.0, pride: 0.1 }, bonus: -h.drunk * 0.12, risk: Math.max(0, h.drunk - 2) * 0.3,
      run: (c) => orderDrink(c, bartender),
    });
  }
  if ((loc.kind === 'bar' || loc.kind === 'club') && h.cash >= 30 && crowd.length > 3) {
    out.push({ key: 'buy_round', drives: { thirst: 0.4, pride: 0.7, lust: 0.2 }, risk: 0.2, run: buyRound });
  }
  if (w.brawlUntil > w.beat && loc.id === 'halo_floor') {
    out.push({ key: 'join_brawl', drives: { bravery: 1.1, pride: 0.6 }, bonus: 0.4, risk: 0.9, run: joinBrawl });
  }

  // ------------------------------------------------------------- the dragon
  const dragon = w.npcs.dragon;
  const dragonPower = (dragon?.power ?? 0) * (w.flags.dragon_weak ? 0.65 : 1);
  // A prepared hero knows when it's time.
  const ready = !!w.flags.dragon_weak && heroPower(w) >= dragonPower * 0.75 && h.hp >= h.maxHp * 0.8;
  if (loc.id === 'overpass' && alive(dragon)) {
    out.push({
      key: 'challenge_dragon', drives: { quest: 1.5, bravery: 0.6, pride: 0.6 }, bonus: 0.3, smart: ready ? 2.2 : 0,
      risk: 3 + clamp(dragonPower / heroPower(w) - 1, 0, 3),
      run: (c) => {
        c.emit('dragon_confront', 'mixed', { npc: dragon.name });
        fight(c, [dragon], { cause: 'the dragon' });
      },
    });
  }

  // ------------------------------------------------------------------ objects
  out.push(...featureCandidates(w));
  out.push(...dropCandidates(w));
  out.push(...extraCandidates(w));
  out.push(...dragonCandidates(w));
  out.push(...hobbyCandidates(w));
  out.push(...rodCandidates(w));
  out.push(...graffitiCandidates(w));
  out.push(...romanceCandidates(w));
  out.push(...bondCandidates(w));
  out.push(...knowledgeCandidates(w));
  out.push(...questCandidates(w));
  out.push(...laylowCandidates(w));
  out.push(...stageCandidates(w));
  out.push(...bookingCandidates(w));
  out.push(...axeCandidates(w));
  const mob = flashMobCandidate(w, heatUrge(w));
  if (mob) out.push(mob);
  const teardown = teardownCandidate(w);
  if (teardown) out.push(teardown);
  out.push(...undergroundCandidates(w));
  out.push(...goalCandidates(w));
  out.push(...dungeonCandidates(w));
  out.push(...discretionCandidates(w));
  out.push(...stealthCandidates(w));
  out.push(...hustleCandidates(w));
  out.push(...gymCandidates(w));
  out.push(...vehicleCandidates(w));
  out.push(...getawayCandidates(w));
  out.push(...pawnCandidates(w));
  out.push(...realtyCandidates(w));
  out.push(...chopCandidates(w));
  out.push(...scavengeCandidates(w));

  // --------------------------------------------------------------- herself
  // Healing is not free: a med pack from her pockets, or a street doc. See supply.ts.
  out.push(...supplyCandidates(w));
  // Food and a bed: the meters run down with the clock, and the city sells the cure.
  out.push(...restCandidates(w));
  if (h.drunk >= 3) {
    out.push({
      key: 'sober_up', drives: {}, smart: 0.9, bonus: 0.1,
      run: (c) => {
        h.drunk = Math.max(0, h.drunk - 3);
        c.emit('sober_up', 'mixed', {});
      },
    });
  }
  // ------------------------------------------------------------------- exits
  for (const e of loc.exits) {
    if (e.hidden) continue;
    if (e.to === 'overpass' && !w.flags.dragon_known) continue;
    if (isClosed(w, e.to)) continue; // locked up, or taped off by the police
    const dest = w.locations[e.to]!;
    const toDragon = e.to === 'overpass';
    const dragonRisk = toDragon && alive(dragon) ? clamp(dragonPower / heroPower(w) - 0.6, 0, 4) : 0;
    // A dragon working a street, or the next one over, is a reason to be somewhere else.
    let lurking = 0;
    for (const fl of w.flights) {
      if (fl.roam?.stage !== 'stay') continue;
      const worst = fl.model === 'ares4' ? 4 : fl.kind === 'ares' ? 2.5 : fl.kind === 'hermes' ? 0.4 : 1.5;
      if (fl.locationId === e.to) lurking = Math.max(lurking, worst);
      else if (dest.exits.some((x) => x.to === fl.locationId)) lurking = Math.max(lurking, worst * 0.35);
    }
    const supply = supplyUrge(w, e.to);
    const need = needsUrge(w, e.to);
    const bench = benchUrge(w, e.to);
    const scrap = partsUrge(w, e.to);
    const urge = { bonus: supply.bonus + need.bonus + bench.bonus + scrap.bonus, smart: supply.smart + need.smart + bench.smart + scrap.smart };
    const bank = bankPull(w, e.to);
    const homes = realtyPull(w, e.to);
    const pull = { bonus: bank.bonus + homes.bonus, smart: bank.smart + homes.smart };
    out.push({
      key: `go:${e.to}`,
      drives: { curiosity: 0.45, ...(toDragon ? { quest: 1.2 } : {}) },
      bonus: (dest.visits === 0 ? 0.35 : 0) + (dest.kind === 'corp' ? 0.1 : 0) + (dest.kind === 'lair' && dest.dungeon === dest.id ? 0.2 : 0) + urge.bonus + pull.bonus,
      smart: (toDragon && ready ? 2.4 : 0) + urge.smart + pull.smart,
      risk: dragonRisk * 1.4 + lurking + (e.gate === 'guarded' ? 0.9 : 0) + (e.gate === 'jump' ? 0.8 : 0) + entranceRisk(w, dest),
      run: (c) => moveThrough(c, e),
    });
  }
  // ------------------------------------------------------------------- across the hex grid
  // Not doors: over the fence, along the ducts, through the building next door. On wheels she can only take the ways a vehicle can.
  for (const e of loc.links ?? []) {
    if (e.hidden || isClosed(w, e.to) || !w.locations[e.to]) continue;
    const mode = h.vehicle ? (h.vehicle.body === 'bike' ? 'bike' : 'car') : 'foot';
    if (!Number.isFinite(VIA[e.via ?? 'open'][mode]) || (h.vehicle && e.via !== 'open' && e.via !== 'ramp')) continue;
    const dest = w.locations[e.to]!;
    const hard = e.via === 'wall' ? 0.6 : e.via === 'fence' || e.via === 'barricade' || e.via === 'duct' ? 0.35 : e.via === 'through' ? 0.2 : 0.1;
    out.push({
      key: `go:${e.to}`,
      drives: { curiosity: 0.35, bravery: e.via && e.via !== 'open' ? 0.25 : 0 },
      bonus: (dest.visits === 0 ? 0.3 : 0) + supplyUrge(w, e.to).bonus + needsUrge(w, e.to).bonus,
      smart: supplyUrge(w, e.to).smart + needsUrge(w, e.to).smart,
      risk: hard + entranceRisk(w, dest),
      run: (c) => moveThrough(c, e),
    });
  }
  // A highway is a road and nothing else: no one to talk to, nothing to buy, nowhere to loiter. She goes on, or she drives.
  if (loc.road === 'highway') return out.filter((x) => HIGHWAY_OK.has(x.key.split(':')[0]!));
  return out;
}

const HIGHWAY_OK = new Set(['go', 'drive', 'getin', 'usekey', 'hijack']);

// =============================================================== resolvers

function chat(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  if (isFairGame(n)) kindle(w.hero, 0.02);
  const options: string[] = [];
  if (!w.flags.dragon_known) options.push('dragon');
  if (w.locations.halo_alley!.exits.some((e) => e.hidden)) options.push('hatch');
  if (w.locations.neon_pharaoh!.exits.some((e) => e.hidden)) options.push('staffdoor');
  const talky = n.tags.includes('rumor') || n.tags.includes('dealer') || n.tags.includes('fixer');
  const tips = tippable(w, n.id);
  if (tips.length && talky) options.push('bounty', 'bounty'); // twice as likely: it's what they're paid in gossip for
  train(c, 'streetwise', 1);
  if (n.archetype === 'scientist' && !w.flags.dragon_weak && rng.chance(0.45)) {
    w.flags.dragon_weak = true;
    w.flags.dragon_known = true;
    n.affinity += 5;
    c.emit('intel', 'good', { variant: 'scientist', npc: n.name });
    return;
  }
  if (n.affinity < -10 || rng.chance(0.12)) {
    n.affinity -= 3;
    c.emit('chat', 'bad', { variant: 'snub', npc: n.name });
  } else if (options.length && rng.chance((talky ? 0.8 : 0.3) + 0.03 * skillLevel(w.hero, 'streetwise'))) {
    const what = rng.pick(options);
    n.affinity += 3;
    if (what === 'bounty') {
      const wanted = rng.pick(tips);
      (w.mind.bounties ??= {})[wanted.id] = 'tip';
      w.mind.lastSeen[wanted.id] = w.mind.lastSeen[wanted.id] ?? wanted.locationId;
      n.affinity += 3;
      c.emit('chat', 'good', { variant: 'rumor_bounty', npc: n.name, target: wanted.name, role: wanted.role, amount: wanted.bounty!.amount, place: w.locations[w.mind.lastSeen[wanted.id] ?? wanted.locationId]?.name ?? 'around' });
      return;
    }
    if (what === 'dragon') w.flags.dragon_known = true;
    if (what === 'hatch') revealExit(w, 'halo_alley', 'club_maintenance');
    if (what === 'staffdoor') revealExit(w, 'neon_pharaoh', 'club_maintenance');
    c.emit('chat', 'good', { variant: `rumor_${what}`, npc: n.name });
  } else if (!shareFact(c, n)) {
    n.affinity += 3;
    c.emit('chat', 'mixed', { variant: 'tall_tale', npc: n.name, role: n.role });
  }
}

function flirt(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const p = clamp(0.28 + h.charm * 0.025 + 0.045 * synergy(h, ['romance', 'stat:charm']) + (hasAlly(w, 'charm') ? 0.08 : 0) + n.affinity / 200 + Math.min(h.drunk, 2) * 0.03 - Math.max(0, h.drunk - 3) * 0.08 + romanceMod(w, n) - 0.1 * (ratio(n, 'charm') - 1), 0.03, 0.9);
  train(c, 'romance', 1);
  kindle(h, 0.05);
  if (rng.chance(p)) {
    n.affinity += 16;
    train(c, 'romance', 1);
    remember(n, 'was charmed by Blackbird');
    const number = n.affinity >= 28 && rng.chance(0.4);
    c.emit('flirt', 'good', { variant: number ? 'number' : 'smooth', npc: n.name });
    bondEvent(c, n, 'flirt');
  } else if (rng.chance(0.3)) {
    n.affinity -= 8;
    h.hp -= 2;
    c.emit('flirt', 'bad', { variant: 'slapped', npc: n.name });
    if (h.personality.traits.temper > 0.75 && rng.chance(0.5)) fight(c, [n], { cause: `losing it at ${n.name}`, assault: true });
  } else {
    n.affinity -= 4;
    c.emit('flirt', 'bad', { variant: 'cringe', npc: n.name });
  }
}

function kiss(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  kindle(w.hero, 0.07);
  if (!rng.chance(clamp(0.78 + romanceMod(w, n) * 0.8, 0.1, 0.95))) {
    n.affinity -= 6;
    c.emit('kiss', 'bad', { variant: 'rejected', npc: n.name });
    return;
  }
  n.affinity += 20;
  train(c, 'romance', 2);
  w.flags[`kissed:${n.id}`] = true;
  w.counters[`kisses_${n.id}`] = kissesWith(w, n.id) + 1;
  remember(n, 'kissed Blackbird');
  c.emit('kiss', 'good', { variant: 'kiss', npc: n.name, times: kissesWith(w, n.id) });
  bondEvent(c, n, 'kiss');
  jealousy(c, n);
}

function pickpocket(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  if (!h.stealth) enterStealth(c);
  // Too many eyes, or theirs are on her: she lets it go.
  if (atLeast(bucketOf(w, n), 'alert')) {
    c.emit('pickpocket', 'mixed', { variant: 'abort', npc: n.name });
    return;
  }
  const wary = bucketOf(w, n) === 'suspicious';
  const p = clamp(0.3 + h.reflex * 0.02 + 0.045 * synergy(h, ['sleight', ['stat:reflex', 0.5]]) + (n.flags.includes('marked') ? 0.15 : 0) - n.level * 0.02 - 0.035 * npcPerception(n) - (wary ? 0.15 : 0) - h.drunk * 0.02, 0.08, 0.88);
  train(c, 'sleight', 1);
  if (!rng.chance(p)) {
    awareness(w, n).v = 1;
    awareness(w, n).fix = true;
    n.affinity -= 30;
    remember(n, 'caught Blackbird\'s hand in their pocket');
    c.emit('pickpocket', 'bad', { variant: 'caught', npc: n.name });
    fight(c, [n], { cause: `getting caught robbing ${n.name}`, assault: true });
    return;
  }
  // The mark feels something, and whoever is looking might too.
  awareness(w, n).v += 0.12;
  spatialStir(c, 0.05, [n]);
  const items = n.loadout.filter((i) => i.kind !== 'armor' || !h.armor);
  if (items.length && rng.chance(0.55)) {
    const it = rng.pick(items);
    n.loadout.splice(n.loadout.indexOf(it), 1);
    c.emit('pickpocket', 'good', { variant: 'item', npc: n.name, item: it.name, better: it.kind === 'weapon' && it.power > h.weapon.power });
    acquire(c, it);
  } else if (n.cash > 0) {
    const take = Math.max(1, Math.round(n.cash * (0.4 + rng.next() * 0.5)));
    n.cash -= take;
    h.cash += take;
    c.emit('pickpocket', 'good', { variant: 'cash', npc: n.name, amount: take });
  } else {
    c.emit('pickpocket', 'mixed', { variant: 'nothing', npc: n.name });
  }
}

function threaten(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const st = statsOf(n);
  const p = clamp(0.22 + h.muscle * 0.02 + 0.05 * synergy(h, ['intimidation', ['stat:muscle', 0.5]]) + h.level * 0.03 - n.level * 0.03 - 0.03 * (st.muscle + st.int / 2), 0.05, 0.88);
  train(c, 'intimidation', 1);
  if (rng.chance(p)) {
    const take = Math.round(n.cash * 0.8);
    n.cash -= take;
    h.cash += take;
    n.affinity -= 25;
    remember(n, 'was shaken down by Blackbird');
    c.emit('threaten', 'good', { variant: 'cough', npc: n.name, amount: take });
  } else {
    c.emit('threaten', 'bad', { variant: 'laugh', npc: n.name });
    fight(c, [n], { cause: `threatening ${n.name}`, assault: true });
  }
}

function armWrestle(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const st = statsOf(n);
  const p = clamp(0.45 + (h.muscle - st.muscle) * 0.07 + (h.level - n.level) * 0.02 + (skillLevel(h, 'athletics') - skillOf(n, 'athletics')) * 0.01 - h.drunk * 0.02, 0.05, 0.9);
  if (rng.chance(p)) {
    const prize = rng.int(10, 40);
    h.cash += prize;
    n.affinity += 10;
    gainXp(c, 6);
    c.emit('arm_wrestle', 'good', { variant: 'win', npc: n.name, amount: prize });
  } else {
    const lost = Math.min(h.cash, rng.int(10, 30));
    h.cash -= lost;
    n.affinity += 3;
    c.emit('arm_wrestle', 'bad', { variant: 'lose', npc: n.name, amount: lost });
  }
}

function hackNpc(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  n.flags.push('hacked');
  const p = clamp(0.3 + h.int * 0.06 + (hasAlly(w, 'hack') ? 0.08 : 0) + skillLevel(h, 'tinkering') * 0.02 - statsOf(n).int * 0.05, 0.05, 0.85);
  const corp = n.tags.includes('monitored') || n.tags.includes('corp');
  if (!rng.chance(p)) {
    h.hp -= 8;
    if (rng.chance(0.3) && !h.injuries.includes('fried_optics')) {
      h.injuries.push('fried_optics');
      c.emit('injury', 'bad', { injury: 'fried_optics' });
    }
    c.emit('hack', 'bad', { variant: 'backlash', npc: n.name });
    return;
  }
  if (corp) addHeat(w, 'atlas', 2);
  if (n.tags.includes('robot')) {
    const shard = n.loadout.find((i) => i.kind === 'loot');
    if (shard) {
      n.loadout.splice(n.loadout.indexOf(shard), 1);
      acquire(c, shard);
    }
    n.hostile = false;
    gainXp(c, 10 + n.level * 2);
    c.emit('hack', 'good', { variant: 'reboot', npc: n.name });
  } else if (n.cash > 0 && rng.chance(0.6)) {
    const take = Math.round(n.cash * 0.6);
    n.cash -= take;
    h.cash += take;
    c.emit('hack', 'good', { variant: 'siphon', npc: n.name, amount: take, traced: corp });
  } else {
    n.affinity -= 6;
    c.emit('hack', 'mixed', { variant: 'prank', npc: n.name });
  }
}

function askWork(c: Ctx, n: Npc): void {
  const { w } = c;
  w.flags.job_taken = true;
  w.flags.dragon_known = true;
  n.affinity += 5;
  revealExit(w, 'halo_alley', 'club_maintenance');
  revealExit(w, 'neon_pharaoh', 'club_maintenance');
  c.emit('ask_work', 'good', { npc: n.name });
}

function fence(c: Ctx, n: Npc): void {
  const h = c.w.hero;
  const sellable = (i: { kind: string; tags: string[] }) => ['loot', 'weapon', 'armor', 'gadget'].includes(i.kind) && !i.tags.includes('instrument') && !i.tags.includes('quest');
  // Keep the best melee weapon: a gun with no rounds in it still needs a backup.
  const backup = h.inventory.filter((i) => i.kind === 'weapon' && i.tags.includes('melee')).sort((a, b) => b.power - a.power)[0];
  const loot = h.inventory.filter((i) => sellable(i) && i !== backup);
  const cut = 1 + skillLevel(h, 'haggling') * 0.04;
  const total = Math.round(loot.reduce((a, i) => a + i.value * (i.kind === 'loot' ? 0.7 : 0.4) * cut, 0));
  h.inventory = h.inventory.filter((i) => !sellable(i) || i === backup);
  train(c, 'haggling', 2);
  h.cash += total;
  n.affinity += 6;
  c.emit('fence', 'good', { npc: n.name, amount: total, count: loot.length });
}

/** The street doc: cheaper than a med pack, and she walks out at full health. Sometimes with extras. */
function getPatched(c: Ctx, n: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const cost = Math.min(h.cash, rng.int(DOC_FEE[0], DOC_FEE[1]));
  h.cash -= cost;
  h.hp = h.maxHp;
  if (rng.chance(0.2)) {
    const stats = ['muscle', 'reflex', 'int', 'charm'] as const;
    const up = rng.pick(stats);
    const down = rng.pick(stats.filter((s) => s !== up));
    h[up] += 2;
    h[down] = Math.max(1, h[down] - 1);
    c.emit('get_patched', 'mixed', { variant: 'botched', npc: n.name, up, down, cost });
  } else {
    const cured = h.injuries.splice(0, 2);
    n.affinity += 4;
    c.emit('get_patched', 'good', { variant: 'fixed', npc: n.name, cost, cured: cured[0] ?? '' });
  }
}

/** The dealer sells cheaper stims, cut with whatever was nearby. Some batches are bad. */
function buyStims(c: Ctx, n: Npc): void {
  const { rng } = c;
  const id = rng.pick(STIM_IDS);
  const cost = Math.max(1, Math.min(c.w.hero.cash, rng.int(18, 28)));
  buyStim(c, n, id, cost, true);
}

function stealPuppy(c: Ctx, pup: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const dutch = dutchHere(w);
  const p = clamp(0.4 + h.int * 0.05 + h.charm * 0.03 - (dutch ? 0.15 : 0), 0.1, 0.85);
  if (!rng.chance(p)) {
    h.hp -= 6;
    pup.affinity -= 10;
    c.emit('steal_puppy', 'bad', { variant: 'bitten', npc: pup.name });
    return;
  }
  moveNpc(w, pup, '_companion');
  addCompanion(c, newCompanion('puppy', pup.name, { npcId: pup.id, home: 'halo_floor', loyalty: 45 }), 'stolen', true);
  if (dutch) {
    dutch.affinity -= 40;
    remember(dutch, 'Blackbird stole Sprocket');
  }
  w.flags.puppy_stolen = true;
  c.emit('steal_puppy', 'good', { variant: 'success', npc: pup.name, owner: dutch?.name ?? 'Dutch' });
  if (dutch && rng.chance(0.4)) {
    dutch.hostile = true;
    c.emit('steal_puppy', 'bad', { variant: 'noticed', npc: dutch.name });
    fight(c, [dutch], { cause: 'stealing Sprocket' });
  }
}

function orderDrink(c: Ctx, bartender: Npc): void {
  const { w, rng } = c;
  const h = w.hero;
  const drink = rng.pick(DRINKS);
  const price = rng.int(8, 22);
  const byFriend = bartender.affinity >= 15 && rng.chance(0.5);
  const byFame = !byFriend && h.fame >= 20 && rng.chance(0.35 * famed(h.fame, 20, 100));
  const free = byFriend || byFame;
  const onTab = !free && h.cash < price;
  const cost = free ? 0 : onTab ? 0 : price;
  h.cash -= cost;
  if (onTab) h.tab += price;
  h.drunk += 1;
  bartender.affinity += 2;
  train(c, 'tolerance', 1);
  c.emit('order_drink', 'mixed', { variant: free ? (byFame ? 'fame' : 'free') : onTab ? 'tab' : 'paid', drink, cost: onTab ? price : cost, npc: bartender.name, drunk: h.drunk, tab: h.tab });
}

function buyRound(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const cost = Math.min(h.cash, rng.int(30, 70));
  h.cash -= cost;
  h.drunk += 1;
  for (const n of here(w)) if (talkable(n)) n.affinity += 6;
  c.emit('buy_round', 'good', { cost });
}

function joinBrawl(c: Ctx): void {
  const { w } = c;
  const [g1, g2] = w.situation.warringGangs;
  const gangers = here(w).filter((n) => n.tags.includes('ganger') && (n.faction === g1 || n.faction === g2));
  if (!gangers.length) return;
  w.brawlUntil = 0;
  const side = gangers.filter((n) => n.faction === (gangers[0]!.faction));
  const hurt = [...side, ...gangers.filter((n) => !side.includes(n)).slice(0, 1)];
  c.emit('join_brawl', 'mixed', { foes: hurt.map((n) => n.name).join(' and ') });
  fight(c, hurt, { cause: 'jumping into the gang war', assault: true });
}

export { spawnGroup, maybeInjure, hasInjury, makeItem };
