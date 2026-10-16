/**
 * Roll some random districts and look at them.
 *   npm run districts -- [seed] [count] [archetype]
 */
import { Rng } from '../engine/src/rng';
import { AXES, generateDistricts } from '../engine/src/districtgen';

const seed = process.argv[2] ?? 'districts';
const count = Number(process.argv[3] ?? 8);
const lean = process.argv[4];

const bar = (x: number) => '█'.repeat(Math.round(x * 10)).padEnd(10, '·');
for (const d of generateDistricts(new Rng(seed), count, { lean })) {
  console.log(`\n${d.name.toUpperCase()} — ${d.description}  (${d.mix})`);
  console.log(`  ${d.blurb}`);
  console.log(`  ${d.blend.slice(0, 3).map((e) => `${e.id} ${Math.round(e.weight * 100)}%`).join(' · ')}`);
  console.log('  ' + AXES.map((k) => `${k.slice(0, 4)} ${bar(d.vector[k])}`).join('  '));
  console.log(`  security ${d.security}  crowded ${d.crowded}  clinics ${d.clinicChance}  danger ${d.danger}  richness ${d.richness}`);
}
