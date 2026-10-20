/**
 * Roll some random music venues of one kind and look at them.
 *   npm run venues -- <kind> [seed] [count] [variant] [district]
 *   npm run venues -- studio demo 8
 */
import { Rng } from '../engine/src/rng';
import { CONDITIONS } from '../engine/src/content/gyms';
import { SIZES, rollVenue } from '../engine/src/content/venues';
import { VENUES } from '../engine/src/content/venuetables';
import { describeVenue } from '../engine/src/venuekit';
import '../engine/src/venues';
import type { District, VenueKind } from '../engine/src/types';

const kind = (process.argv[2] ?? 'studio') as VenueKind;
const t = VENUES[kind];
if (!t) throw new Error(`no such venue kind: ${kind} (try ${Object.keys(VENUES).join(', ')})`);
const seed = process.argv[3] ?? 'venues';
const count = Number(process.argv[4] ?? 6);
const lean = process.argv[5];
const district = (process.argv[6] ?? 'nightlife') as District;

let shown = 0;
for (let i = 0; shown < count && i < count * 200; i++) {
  const p = rollVenue(t, new Rng(`${seed}:${i}`), district, 3);
  if (lean && p.info.variant !== lean) continue;
  shown++;
  const h = p.info;
  console.log(`\n${p.name.toUpperCase()}  (${t.variants[h.variant]!.label}, ${SIZES[h.size]!.label}, ${CONDITIONS[h.condition]!.label}, tier ${h.tier}; security ${p.security})`);
  console.log(`  in ${t.shells[h.shell]!.label}${h.traits.length ? ` · ${h.traits.map((x) => t.traits[x]!.label).join(' · ')}` : ''}${h.wild ? ` · WILD: ${t.wild[h.wild]!.label}` : ''}`);
  console.log(`  ${p.blurb}`);
  console.log(`  features: ${h.features.join(', ')}   rows: ${describeVenue(h).length}`);
}
