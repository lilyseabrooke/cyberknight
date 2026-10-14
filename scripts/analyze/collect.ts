import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deathBucket } from './stats';

/**
 * Plays nights of Blackbird and boils each one down to a flat record of numbers. The engine is imported from `root`, which
 * is how the same harness can measure another checkout (see analyze.ts --vs). Anything the engine at that checkout does not
 * have simply counts as zero.
 */

export interface Night {
  beats: number;
  ending: string;
  early: number;
  death: string;
  goalsDone: number;
  goalsDropped: number;
  noGoalBeats: number;
  goBeats: number;
  flips: number;
  fame: number;
  level: number;
  kills: number;
  dragonKills: number;
  cash: number;
  weaponRating: number;
  heatEvents: number;
  ambushOfficers: number;
  ambushDrones: number;
  kisses: number;
  moves: number;
  bountyPaid: number;
  passions: number;
  crowdTired: number;
  layLow: number;
  hustleCash: number;
  done: Record<string, number>;
  dropped: Record<string, number>;
  hustles: Record<string, number>;
  pursuit: Record<string, number>;
}

export const HUSTLES = ['odd_jobs', 'security_shift', 'courier_run', 'bodyguard_gig', 'burgle_home', 'protection_racket', 'scam_mark', 'sell_fake_goods', 'cold_read', 'odd_request', 'panhandle'];

const bump = (m: Record<string, number>, k: string, by = 1) => {
  m[k] = (m[k] ?? 0) + by;
};

export async function collect(root: string, competence: number, nights: number, seedPrefix: string, onNight?: (i: number) => void): Promise<Night[]> {
  const engine = await import(pathToFileURL(path.join(root, 'engine/src/index.ts')).href);
  let rating: (it: unknown) => number = (it) => (it as { power: number }).power;
  try {
    const mod = await import(pathToFileURL(path.join(root, 'engine/src/weapons.ts')).href);
    rating = (it) => mod.rating(it);
  } catch {
    /* an older checkout: plain weapon power */
  }
  const out: Night[] = [];
  for (let i = 0; i < nights; i++) {
    const { world: w, events: first } = engine.createRun({ seed: `${seedPrefix}-${competence}-${i}`, competence });
    const n: Night = {
      beats: 0, ending: '', early: 0, death: '', goalsDone: 0, goalsDropped: 0, noGoalBeats: 0, goBeats: 0, flips: 0, fame: 0, level: 0, kills: 0,
      dragonKills: 0, cash: 0, weaponRating: 0, heatEvents: 0, ambushOfficers: 0, ambushDrones: 0, kisses: 0, moves: 0, bountyPaid: 0, passions: 0,
      crowdTired: 0, layLow: 0, hustleCash: 0, done: {}, dropped: {}, hustles: {}, pursuit: {},
    };
    const gos: string[] = [];
    const eat = (events: { type: string; outcome: string; data: Record<string, unknown> }[]) => {
      for (const e of events) {
        const d = e.data;
        switch (e.type) {
          case 'goal_done': bump(n.done, String(d.kind)); n.goalsDone++; break;
          case 'goal_drop': bump(n.dropped, `${d.kind}:${d.variant}`); n.goalsDropped++; break;
          case 'go': gos.push(String(d.toId)); n.goBeats++; break;
          case 'heat_up': if (d.variant === 'npd') n.heatEvents++; break;
          case 'ambush': if (d.variant === 'npd') n.ambushOfficers++; else if (d.variant === 'npd_drone') n.ambushDrones++; break;
          case 'make_move': if (d.variant === 'afterglow') n.moves++; break;
          case 'bounty_paid': n.bountyPaid++; break;
          case 'passion': n.passions++; break;
          case 'crowd_tired': n.crowdTired++; break;
          case 'lay_low': n.layLow++; break;
          case 'pursuit': bump(n.pursuit, String(d.variant)); break;
          default:
            if (HUSTLES.includes(e.type)) {
              bump(n.hustles, e.type);
              if (e.outcome === 'good') n.hustleCash += Number(d.amount) || 0;
            }
        }
      }
    };
    const allEvents: { type: string; data: Record<string, unknown> }[] = [];
    eat(first);
    allEvents.push(...first);
    while (!w.over && w.beat < 600) {
      const ev = engine.step(w);
      eat(ev);
      for (const e of ev) if (e.type === 'death') allEvents.push(e);
      if (!w.mind.goals.some((g: { parent: number | null }) => g.parent === null)) n.noGoalBeats++;
    }
    for (let k = 2; k < gos.length; k++) if (gos[k] === gos[k - 2]) n.flips++;
    n.beats = w.beat;
    n.ending = String(w.ending ?? 'cap');
    n.early = w.ending === 'dead' && w.beat < 20 ? 1 : 0;
    const death = allEvents.find((e) => e.type === 'death');
    n.death = death ? deathBucket(String(death.data.cause)) : '';
    n.fame = w.hero.fame;
    n.level = w.stats.maxLevel;
    n.kills = w.stats.kills;
    n.dragonKills = w.counters.dragon_kills ?? 0;
    n.cash = w.hero.cash;
    try {
      n.weaponRating = rating(w.hero.weapon);
    } catch {
      n.weaponRating = w.hero.weapon.power;
    }
    n.kisses = Object.keys(w.counters).filter((k) => k.startsWith('kisses_')).reduce((a, k) => a + (w.counters[k] ?? 0), 0);
    out.push(n);
    onNight?.(i);
  }
  return out;
}
