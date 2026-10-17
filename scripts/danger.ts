/**
 * The danger field, as a table: street count and danger by depth, for one seed, with the gate open or shut.
 * Usage: npm run danger -- [seed] [open|shut] [streets]
 */
import { createWorld } from '../engine/src/world';
import { relocate } from '../engine/src/combat';
import { START_DEPTH } from '../engine/src/grade';

const seed = process.argv[2] ?? 'danger';
const open = (process.argv[3] ?? 'open') === 'open';
const limit = Number(process.argv[4] ?? 900);

const w = createWorld({ seed });
if (open) w.legacy.gate = 'open';
const queue = ['street_main'];
const seen = new Set<string>();
let streets = 0;
while (queue.length && streets < limit) {
  const id = queue.shift()!;
  if (seen.has(id)) continue;
  seen.add(id);
  const loc = w.locations[id];
  if (!loc) continue;
  if (loc.gen) relocate(w, id);
  if (loc.gen?.role === 'street') streets++;
  for (const e of loc.exits) if (w.locations[e.to]?.gen?.role === 'street') queue.push(e.to);
}

const byDepth = new Map<number, number[]>();
for (const l of Object.values(w.locations)) if (l.gen?.role === 'street') byDepth.set(l.gen.depth, [...(byDepth.get(l.gen.depth) ?? []), l.gen.danger ?? 0]);
console.log(`seed ${seed}, gate ${open ? 'open' : 'shut'}, ${streets} streets (starting district is ${START_DEPTH} deep)`);
console.log('depth  streets   min  mean   max');
for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
  const xs = byDepth.get(d)!;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`${String(d).padStart(5)}  ${String(xs.length).padStart(7)}  ${Math.min(...xs).toFixed(0).padStart(4)}  ${mean.toFixed(1).padStart(4)}  ${Math.max(...xs).toFixed(0).padStart(4)}${d === START_DEPTH ? '   <- cordon' : ''}`);
}
