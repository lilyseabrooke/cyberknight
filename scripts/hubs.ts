/**
 * Roll some random hacker hubs and look at them.
 *   npm run hubs -- [seed] [count] [variant] [district]
 *   npm run hubs -- demo 8
 */
import { Rng } from '../engine/src/rng';
import { CONDITIONS } from '../engine/src/content/gyms';
import { HUB_CHANCE, SHELLS, SIZES, TRAITS, VARIANTS, WILD, hourly, rollHub } from '../engine/src/content/hubs';
import { describeHub } from '../engine/src/hub';
import type { District } from '../engine/src/types';

const seed = process.argv[2] ?? 'hubs';
const count = Number(process.argv[3] ?? 6);
const lean = process.argv[4];
const district = (process.argv[5] ?? 'nightlife') as District;
if (!(district in HUB_CHANCE)) throw new Error(`no such district: ${district}`);

let shown = 0;
for (let i = 0; shown < count && i < count * 200; i++) {
  const p = rollHub(new Rng(`${seed}:${i}`), district, 3);
  if (lean && p.info.variant !== lean) continue;
  shown++;
  const h = p.info;
  const v = VARIANTS[h.variant]!;
  console.log(`\n${p.name.toUpperCase()}  (${v.label}, ${SIZES[h.size]!.label}, ${CONDITIONS[h.condition]!.label}, tier ${h.tier}; terminal ${hourly(h)}nd/h; security ${p.security})`);
  console.log(`  in ${SHELLS[h.shell]!.label}${h.traits.length ? ` · ${h.traits.map((t) => TRAITS[t]!.label).join(' · ')}` : ''}${h.wild ? ` · WILD: ${WILD[h.wild]!.label}` : ''}`);
  console.log(`  ${p.blurb}`);
  const d = describeHub(h);
  console.log(`  features: ${h.features.length}   rows: ${d.rows.length}`);
}
