/**
 * Every combat routine, one at a time, against the same fights with and without it. Prints how much each changes the
 * damage she takes, how often she wins, and how often it showed up in the report. A routine that changes nothing is
 * a routine that is not wired up. Run: npx tsx scripts/doctrine-audit.ts [seeds]
 */
import { Rng, createWorld } from '../engine/src/index';
import { fight } from '../engine/src/combat';
import { spawnNpc } from '../engine/src/content/archetypes';
import { makeItem } from '../engine/src/content/items';
import { AMMO_IDS } from '../engine/src/content/ammo';
import { ARTS, DOCTRINE } from '../engine/src/content/doctrine';
import { NODES, NODE_IDS } from '../engine/src/content/tree';
import { addNpc } from '../engine/src/population';
import type { GameEvent } from '../engine/src/types';

const SEEDS = Number(process.argv[2] ?? 200);
const WEAPONS: Record<string, string> = { general: 'service_pistol', blades: 'thermal_katana', blunt: 'judgment', small: 'service_pistol', heavy: 'riot_shotgun', precision: 'rail_revolver' };

const withArts = (ids: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const n of NODE_IDS) if (NODES[n]!.fx.some((f) => 'art' in f && ids.includes(f.art))) out[n] = NODES[n]!.max;
  return out;
};

function duel(seed: string, ups: Record<string, number>, weapon: string, kind: string, n: number, hp = 150) {
  const w = createWorld({ seed, competence: 0.7 });
  w.legacy.upgrades = ups;
  const h = w.hero;
  h.level = 6; h.maxHp = 150; h.hp = hp; h.muscle = 6;
  h.weapon = makeItem(weapon); h.armor = makeItem('kevlar_duster');
  h.ammo = Object.fromEntries(AMMO_IDS.map((t) => [t, 500]));
  h.locationId = 'street_main'; h.implants = [];
  const rng = new Rng(`${seed}-rng`);
  const foes = Array.from({ length: n }, (_, k) => { const d = spawnNpc(rng, `d${k}`, kind, h.locationId); addNpc(w, d); return d; });
  const events: GameEvent[] = [];
  const result = fight({ w, rng, emit: (type, outcome, data = {}) => void events.push({ beat: w.beat, type, outcome, data }) }, foes, { cause: 'audit', joiners: false, assault: true });
  return { result, lost: hp - h.hp, kills: foes.filter((f) => !f.alive).length, events };
}

function measure(ups: Record<string, number>, weapon: string, kind: string, n: number, hp = 150) {
  let lost = 0, wins = 0, kills = 0, procs = 0;
  for (let i = 0; i < SEEDS; i++) {
    const r = duel(`aud-${i}`, ups, weapon, kind, n, hp);
    lost += r.lost; kills += r.kills;
    if (r.result === 'win') wins++;
    if (r.events.some((e) => e.type === 'weapon_proc' || e.type === 'last_gasp')) procs++;
  }
  return { lost: lost / SEEDS, win: wins / SEEDS, kills: kills / SEEDS, procs: procs / SEEDS };
}

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad('art', 24)}${pad('branch', 11)}${pad('lost', 8)}${pad('win%', 7)}${pad('kills', 7)}shown%`);
for (const b of DOCTRINE) {
  const weapon = WEAPONS[b.id]!;
  for (const kind of ['ganger']) {
    const base = measure({}, weapon, kind, 3);
    console.log(`${pad('(nothing)', 24)}${pad(b.id, 11)}${pad(base.lost.toFixed(1), 8)}${pad((base.win * 100).toFixed(0), 7)}${pad(base.kills.toFixed(2), 7)}${(base.procs * 100).toFixed(0)}`);
    for (const a of [b.base, ...b.lines.flatMap((l) => l.arts)]) {
      const m = measure(withArts([a.id]), weapon, kind, 3);
      const flag = Math.abs(m.lost - base.lost) < 0.05 && Math.abs(m.win - base.win) < 0.001 && m.procs === base.procs ? '   <-- no change' : '';
      console.log(`${pad(a.id, 24)}${pad(b.id, 11)}${pad(m.lost.toFixed(1), 8)}${pad((m.win * 100).toFixed(0), 7)}${pad(m.kills.toFixed(2), 7)}${(m.procs * 100).toFixed(0)}${flag}`);
    }
  }
}

// The routines that only matter in the right situation: re-run them where they could, and with what they need.
const SITUATIONAL: Record<string, { weapon?: string; kind?: string; hp?: number; with?: string[]; n?: number }> = {
  last_gasp: { hp: 40, kind: 'artemis', n: 3, weapon: 'zip_pistol' },
  adrenaline: { hp: 60, n: 4 }, berserker: { hp: 30, n: 4 }, escape_artist: { hp: 25, n: 4, kind: 'artemis' },
  fear_blood: { weapon: 'thermal_katana', with: ['open_veins'], n: 4 }, executioner: { weapon: 'thermal_katana', n: 4 },
  cutting_edge: { weapon: 'thermal_katana', with: ['keen_edge'], kind: 'helix_guard', n: 3 },
  skullcracker: { weapon: 'judgment', with: ['ringing_bell'], n: 4 }, stagger: { weapon: 'judgment', with: ['ringing_bell'], n: 4 },
  wrecking_ball: { weapon: 'judgment', with: ['ringing_bell', 'crippler'], kind: 'helix_guard', n: 3 },
  shock_knuckles: { weapon: 'arc_gauntlet', with: ['ringing_bell'], n: 4 }, static_punch: { weapon: 'arc_gauntlet', kind: 'drone', n: 3 },
  hot_cells: { weapon: 'stunner_mk3', n: 4 }, explosive_rounds: { weapon: 'riot_shotgun', with: ['battle_sense', 'gunslingers_luck'], n: 4 },
  eagle_eye: { weapon: 'rail_revolver', n: 3, kind: 'artemis' }, overwatch_master: { weapon: 'rail_revolver', n: 4 },
  counter_sense: { n: 3 }, flanking_instinct: { n: 3 },
};
console.log('\nSituational routines, re-run where they can matter:');
for (const [id, c] of Object.entries(SITUATIONAL)) {
  const weapon = c.weapon ?? WEAPONS[ARTS[id]!.branch]!;
  const kind = c.kind ?? 'ganger';
  const n = c.n ?? 3;
  const base = measure(withArts(c.with ?? []), weapon, kind, n, c.hp);
  const m = measure(withArts([id, ...(c.with ?? [])]), weapon, kind, n, c.hp);
  const same = Math.abs(m.lost - base.lost) < 0.05 && Math.abs(m.win - base.win) < 0.001 && Math.abs(m.kills - base.kills) < 0.001 && m.procs === base.procs;
  console.log(`${pad(id, 24)}lost ${base.lost.toFixed(1)} -> ${m.lost.toFixed(1)}   win ${(base.win * 100).toFixed(0)} -> ${(m.win * 100).toFixed(0)}   kills ${base.kills.toFixed(2)} -> ${m.kills.toFixed(2)}   shown ${(base.procs * 100).toFixed(0)} -> ${(m.procs * 100).toFixed(0)}${same ? '   <-- no change' : ''}`);
}
