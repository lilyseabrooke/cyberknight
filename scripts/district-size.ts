/** How big is the starting district? Explores every reachable place on a few seeds and counts. Usage: npm run district-size */
import { createWorld } from '../engine/src/world';
import { relocate } from '../engine/src/combat';
import type { World } from '../engine/src/types';

function exploreAll(w: World): void {
  const seen = new Set<string>();
  const queue = ['street_main'];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const loc = w.locations[id];
    if (!loc) continue;
    if (loc.gen) relocate(w, id);
    for (const e of loc.exits) queue.push(e.to);
  }
}

const sizes: number[] = [];
const dangers: number[] = [];
for (let s = 0; s < 12; s++) {
  const w = createWorld({ seed: `size${s}` });
  const hand = Object.values(w.locations).filter((l) => !l.gen).length;
  exploreAll(w);
  const all = Object.values(w.locations);
  sizes.push(all.length);
  const streets = all.filter((l) => l.gen?.role === 'street');
  dangers.push(streets.reduce((a, l) => a + (l.gen!.danger ?? 0), 0) / Math.max(1, streets.length));
  console.log(`seed ${s}: ${all.length} locations (${hand} hand-built), ${streets.length} streets, mean street danger ${dangers.at(-1)!.toFixed(1)}, max ${Math.max(...streets.map((l) => l.gen!.danger ?? 0)).toFixed(1)}`);
}
console.log(`mean size ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(0)}`);
