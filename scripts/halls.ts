/**
 * Roll some random arcades and look at them.
 *   npm run halls -- [seed] [count] [variant] [district]
 *   npm run halls -- demo 8
 */
import { Rng } from '../engine/src/rng';
import { CONDITIONS } from '../engine/src/content/gyms';
import { HALL_CHANCE, SHELLS, SIZES, TRAITS, VARIANTS, WILD, cabinetOf, isCab, playPrice } from '../engine/src/content/halls';
import { describeHall } from '../engine/src/hall';
import type { District } from '../engine/src/types';

const seed = process.argv[2] ?? 'halls';
const count = Number(process.argv[3] ?? 6);
const lean = process.argv[4];
const district = (process.argv[5] ?? 'nightlife') as District;
if (!(district in HALL_CHANCE)) throw new Error(`no such district: ${district}`);

let shown = 0;
for (let i = 0; shown < count && i < count * 200; i++) {
  const p = rollHallFor(`${seed}:${i}`);
  if (lean && p.info.variant !== lean) continue;
  shown++;
  const h = p.info;
  const v = VARIANTS[h.variant]!;
  console.log(`\n${p.name.toUpperCase()}  (${v.label}, ${SIZES[h.size]!.label}, ${CONDITIONS[h.condition]!.label}, tier ${h.tier}; ${playPrice(h, 'muse')}nd a Muse play, ${playPrice(h, 'bootleg')}nd a bootleg; security ${p.security})`);
  console.log(`  in ${SHELLS[h.shell]!.label}${h.traits.length ? ` · ${h.traits.map((t) => TRAITS[t]!.label).join(' · ')}` : ''}${h.wild ? ` · WILD: ${WILD[h.wild]!.label}` : ''}`);
  console.log(`  ${p.blurb.replace('{name}', p.name)}`);
  const cabs = h.features.filter((f) => isCab(f.split(':')[1]!)).map((f) => cabinetOf(seed, { id: `x${i}` }, h, f)!).filter(Boolean);
  console.log(`  cabinets: ${cabs.map((c) => `${c.title} [${c.legal === 'muse' ? 'Muse' : 'bootleg'}]`).join(', ')}`);
  const d = describeHall(h);
  console.log(`  features: ${h.features.length}   rooms: ${h.rooms.join(', ') || 'none'}   rows on the floor: ${d.floor?.length ?? 0}`);
}

function rollHallFor(key: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return rollHall(new Rng(key), district, 3);
}
import { rollHall } from '../engine/src/content/halls';
