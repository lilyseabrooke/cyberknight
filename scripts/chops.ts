/**
 * Roll some random chop shops and look at them.
 *   npm run chops -- [seed] [count] [district]
 */
import { Rng } from '../engine/src/rng';
import { BENCHES, CHOP_CHANCE, DOORS, SHELLS, TRAITS, rollChop } from '../engine/src/content/chops';
import { describeChop } from '../engine/src/chop';
import type { District } from '../engine/src/types';

const seed = process.argv[2] ?? 'chops';
const count = Number(process.argv[3] ?? 6);
const district = (process.argv[4] ?? 'industrial') as District;
if (!(district in CHOP_CHANCE)) throw new Error(`no such district: ${district}`);

for (let i = 0; i < count; i++) {
  const p = rollChop(new Rng(`${seed}:${i}`), district, 3);
  const c = p.info;
  console.log(`\n${p.name.toUpperCase()}  (bench tier ${c.tier}, ${c.fee}nd a day, ${DOORS[c.door]!.label} on the door, security ${p.security})`);
  console.log(`  in ${SHELLS[c.shell]!.label}${c.traits.length ? ` · ${c.traits.map((t) => TRAITS[t]!.line.split('.')[0]).join(' · ')}` : ''}`);
  console.log(`  ${p.blurb}`);
  console.log(`  bench: ${BENCHES[c.tier]}`);
  console.log(`  ways in: ${describeChop(c).join(', ')}`);
}
