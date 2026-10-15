import { Rng } from './rng';
import { rollGovernmentName, rollPersonality } from './personality';
import { genShelf } from './weapons';
import { newMind } from './mind';
import { ensureBounties } from './bounty';
import { CRACKDOWNS, createWorld, makeHero, type RunOptions } from './world';
import { nextEvening } from './clock';
import { AWAY, allNpcs, everyoneAt, moveNpc, removeNpc } from './population';
import { settleAt } from './movement';
import { populate } from './roster';
import { seedFrontier } from './mapgen';
import { tickDungeons } from './dungeons';
import { remember } from './combat';
import { tiesFrom } from './ties';
import { DROPS } from './content/drops';
import { applyUpgrades, settleAccount } from './lab';
import type { DeathRecord, Id, Npc, World } from './types';

/**
 * The world and the run, as two things.
 *
 * A **universe** is what outlives Blackbird: the places, the people and what they remember, the
 * factions, the clock, and a ledger of what has happened (`legacy`). A **run** is one night in
 * one body: her stats and goals, the heat she's drawn, what she's carrying, tonight's weather.
 *
 * In memory the engine still works on a single `World` that is the two stuck together, so nothing
 * inside a night knows or cares. The split happens at the edges: `beginRun` builds a World out of
 * a Universe, `endRun` tidies up and hands the Universe back, and `store.ts` saves both.
 * The types below are derived from `World`, so adding a field to World without deciding which side
 * it belongs on is a compile error rather than a bug in somebody's save file.
 */

export const UNIVERSE_VERSION = 4;

/**
 * Bring a universe saved by an older version forward. Version 2 added the lab (an account and
 * upgrades on the legacy) and the drop points (features). Version 3 added the generated map: the
 * hand-built district gets its edges opened onto the rest of Neo; everything else is as it was. Version 4 added the
 * dungeons (outposts and hideouts), which are made the first time anyone walks into one: older saves just have none yet.
 */
export function upgradeUniverse(u: Universe): Universe {
  const l = u.legacy;
  l.account ??= 0;
  l.upgrades ??= {};
  l.spent ??= 0;
  u.dungeons ??= {};
  for (const [kind, d] of Object.entries(DROPS)) {
    if (!u.features[kind] && u.locations[d.at]) u.features[kind] = { id: kind, name: d.name, kind, locationId: d.at, uses: 0, flags: [] };
  }
  seedFrontier(u);
  u.version = UNIVERSE_VERSION;
  return u;
}

/** The World fields that persist across runs. Everything else is per-run. */
type Persistent = 'worldSeed' | 'legacy' | 'clock' | 'npcs' | 'ties' | 'stubs' | 'factions' | 'locations' | 'features' | 'dungeons';

export type Universe = Pick<World, Persistent> & { version: number };
export type RunState = Omit<World, Persistent>;

/** Take a World apart. The halves share their contents with the World; nothing is copied. */
export function splitWorld(w: World): { universe: Universe; run: RunState } {
  const { worldSeed, legacy, clock, npcs, ties, stubs, factions, locations, features, dungeons, ...run } = w;
  return { universe: { version: UNIVERSE_VERSION, worldSeed, legacy, clock, npcs, ties, stubs, factions, locations, features, dungeons }, run };
}

export function joinWorld(universe: Universe, run: RunState): World {
  const { version: _version, ...persistent } = universe;
  return { ...persistent, ...run };
}

export const extractUniverse = (w: World): Universe => splitWorld(w).universe;

/**
 * A world nobody has played in yet: the hand-built district and its people. (Everywhere else is
 * generated as it's found.) The first `beginRun` is run 1.
 */
export function newUniverse(worldSeed: string): Universe {
  const w = createWorld({ seed: worldSeed, worldSeed });
  w.legacy.runs = 0;
  return extractUniverse(w);
}

// ====================================================================== ending a run

/** Anyone who might remember: a bystander who never mattered can be forgotten, someone she dealt with can't. */
const memorable = (n: Npc): boolean => n.memories.length > 0 || n.affinity !== 0 || !!n.bounty || !!n.knows;

/** Word of a death spreads: the people there saw it, and the crews of whoever did it hear. */
function recordDeath(w: World): void {
  const loc = w.hero.locationId;
  const there = everyoneAt(w, loc).filter((n) => n.alive);
  const killers = [...new Set(there.filter((n) => n.hostile && n.faction).map((n) => n.faction!))];
  const record: DeathRecord = { run: w.legacy.runs, clock: w.clock, locationId: loc, killers, witnesses: there.map((n) => n.id) };
  w.legacy.deaths.push(record);
  for (const n of there) {
    n.knows = { ...n.knows, died: record.run, saw: true };
    remember(n, 'saw Blackbird die');
  }
  // Word travels along who loves whom.
  for (const wit of there) {
    for (const t of tiesFrom(w, wit.id)) {
      const m = w.npcs[t.to];
      if (!m || !m.alive || m.knows?.died === record.run || !['kin', 'friend', 'partner', 'crew'].includes(t.kind)) continue;
      if (new Rng(`word:${w.worldSeed}:${record.run}:${m.id}`).chance(0.65)) m.knows = { ...m.knows, died: record.run };
    }
  }
  for (const n of allNpcs(w)) {
    if (!n.alive || n.knows?.died === record.run || !n.faction || !killers.includes(n.faction)) continue;
    if (new Rng(`rumour:${w.worldSeed}:${record.run}:${n.id}`).chance(0.5)) n.knows = { ...n.knows, died: record.run };
  }
}

/**
 * Wrap a night up. Records a death if there was one, lets go of the people who only existed to
 * be fought, and sends anyone she was keeping with her back where they came from.
 * Returns the universe; the World should be thrown away after this.
 */
export function endRun(w: World): Universe {
  if (w.ending === 'dead') recordDeath(w);
  settleAccount(w);
  const companions = new Map(w.hero.companions.filter((c) => c.npcId).map((c) => [c.npcId!, c.home]));
  for (const n of allNpcs(w)) {
    if (n.id.startsWith('tmp_') && !memorable(n)) {
      removeNpc(w, n.id);
    } else if (n.locationId.startsWith('_') && n.locationId !== AWAY) {
      // Travelling with her, or gone for the night: they go home, or if they never had one, are free to turn up somewhere new.
      const home = n.home ?? companions.get(n.id);
      moveNpc(w, n, home && w.locations[home] ? home : AWAY);
    }
  }
  return extractUniverse(w);
}

// ====================================================================== beginning one

/** The two gangs at each other's throats: whichever pair stands lowest. */
export function warringGangs(w: Pick<World, 'factions'>): [Id, Id] {
  const gangs = Object.values(w.factions).filter((f) => f.kind === 'gang' && f.id !== 'ganger');
  let best: [Id, Id] = [gangs[0]?.id ?? 'vipers', gangs[1]?.id ?? 'sixers'];
  let low = Infinity;
  for (const a of gangs) for (const b of gangs) {
    if (a.id >= b.id) continue;
    const r = a.relations[b.id] ?? b.relations[a.id] ?? 0;
    if (r < low) { low = r; best = [a.id, b.id]; }
  }
  return best;
}

/** What the morning after looks like to the people and places Blackbird left behind. */
function wakeTheWorld(u: Universe): void {
  for (const n of Object.values(u.npcs)) {
    if (!n.alive) continue;
    n.hp = n.maxHp;
    n.hostile = false;
    n.downUntil = 0; // measured in beats, and the beats start over
    // People without a routine of their own go back to where they live.
    if (!n.haunts && !n.routine && n.home && n.home !== n.locationId && u.locations[n.home]) moveNpc(u, n, n.home);
  }
  for (const l of Object.values(u.locations)) {
    l.visits = 0;
    delete l.doings;
    delete l.fatigue;
    delete l.wary;
    l.graffiti = 0; // TODO: pieces should outlast the run once their effects are per-piece rather than a count
  }
  for (const f of Object.values(u.features)) {
    f.uses = 0;
    f.flags = [];
  }
  ensureBounties(u.npcs);
  tickDungeons(u); // the noise dies down, and anywhere that has been empty long enough fills up again
}

export interface BeginOptions extends Partial<Omit<RunOptions, 'worldSeed'>> {
  /** Defaults to one derived from the world's seed and how many runs there have been. */
  seed?: string;
}

/**
 * Start the next night in this world. Takes the universe over (its people and places are used
 * in place, not copied); use the returned World, then `endRun` it.
 */
export function beginRun(u: Universe, opts: BeginOptions = {}): World {
  if (u.version !== UNIVERSE_VERSION) throw new Error(`universe is version ${u.version}, expected ${UNIVERSE_VERSION}`);
  const runNo = u.legacy.runs + 1;
  u.legacy.runs = runNo;
  const seed = opts.seed ?? `${u.worldSeed}#${runNo}`;
  u.clock = nextEvening(u.clock);
  wakeTheWorld(u);

  const rng = new Rng(`run-start:${u.worldSeed}:${runNo}`);
  const personality = opts.personality ?? u.legacy.personality ?? rollPersonality(rng.fork('personality'));
  const realName = opts.realName ?? u.legacy.realName ?? rollGovernmentName(rng.fork('name'));
  u.legacy.personality = personality;
  u.legacy.realName = realName;

  const hero = makeHero(personality, realName, opts.competence);
  // The body comes off the printer with whatever the lab has paid for.
  applyUpgrades(hero, u.legacy);
  if (!u.locations[hero.locationId]) hero.locationId = Object.keys(u.locations)[0]!;
  const run: RunState = {
    seed,
    beat: 0,
    rngPosition: new Rng(`run:${seed}`).position,
    hero,
    mind: newMind(),
    heat: { npd: 0, atlas: 0, halo: 0, club: 0 },
    arsenal: Object.fromEntries(genShelf(new Rng(`arsenal:${seed}`), hero.weapon).map((it) => [it.id, it])),
    situation: { warringGangs: warringGangs(u), crackdown: rng.pick(CRACKDOWNS), weather: rng.pick(['acid_rain', 'neon_fog', 'heatwave'] as const) },
    flags: {},
    counters: { paint_stock: 8, start_cash: hero.cash },
    damsel: null,
    flight: null,
    recent: [],
    brawlUntil: 0,
    blackoutUntil: 0,
    stats: { kills: 0, fights: 0, maxLevel: 1, deposited: 0, fees: 0 },
    over: false,
    ending: null,
  };
  const w = joinWorld(u, run);
  const start = w.locations[hero.locationId]!;
  start.visits = 1;
  // Wherever she wakes up, the people who keep hours there have had time to come and go.
  settleAt(w, start.id, w.clock);
  populate(w, start);
  return w;
}
