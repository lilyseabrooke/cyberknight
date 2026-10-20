/**
 * Real-run probe for the music venues: how many autonomous runs found one, walked in, and what they did there.
 *   npx tsx scripts/probe-venues.ts [runs]
 */
import { runToEnd } from '../engine/src/run';

const n = Number(process.argv[2] ?? 40);
const kinds = ['studio', 'cutting', 'luthier', 'musehq', 'arena', 'fanclub'];
const seen: Record<string, number> = {};
const entered: Record<string, number> = {};
const did: Record<string, number> = {};
for (let i = 0; i < n; i++) {
  const { world, events } = runToEnd({ seed: `probe-${i}`, competence: [0.1, 0.5, 0.9][i % 3] });
  for (const k of kinds) {
    const locs = Object.values(world.locations).filter((l) => l.venue?.kind === k);
    if (locs.length) seen[k] = (seen[k] ?? 0) + 1;
    if (locs.some((l) => l.visits > 0)) entered[k] = (entered[k] ?? 0) + 1;
  }
  const acts = new Set<string>();
  for (const e of events) {
    if (kinds.includes(e.type) || /^mime_|^(record|ghost_take|dub|press|relisten|bury_song|duel|cut_|repair|fanclub)/.test(e.type)) acts.add(`${e.type}:${String(e.data.variant ?? '').split('.')[0]}`);
  }
  for (const a of acts) did[a] = (did[a] ?? 0) + 1;
}
console.log(`${n} runs`);
for (const k of kinds) console.log(`${k.padEnd(8)} in reach ${seen[k] ?? 0}, walked in ${entered[k] ?? 0}`);
for (const [a, c] of Object.entries(did).sort((x, y) => y[1] - x[1])) console.log(`  ${a}: ${c}`);
