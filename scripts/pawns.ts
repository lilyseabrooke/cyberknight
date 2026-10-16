/**
 * Roll some random pawn shops and look at them.
 *   npm run pawns -- [seed] [count] [variant] [district]
 */
import { Rng } from '../engine/src/rng';
import { CONDITIONS } from '../engine/src/content/gyms';
import { PAWN_CHANCE, SHELLS, SIZES, TRAITS, VARIANTS, WILD, offerFraction, rollPawn } from '../engine/src/content/pawns';
import { describePawn } from '../engine/src/pawn';
import type { District } from '../engine/src/types';

const seed = process.argv[2] ?? 'pawns';
const count = Number(process.argv[3] ?? 6);
const lean = process.argv[4];
const district = (process.argv[5] ?? 'market') as District;
if (!(district in PAWN_CHANCE)) throw new Error(`no such district: ${district}`);

let shown = 0;
for (let i = 0; shown < count && i < count * 200; i++) {
  const p = rollPawn(new Rng(`${seed}:${i}`), district, 3);
  if (lean && p.info.variant !== lean) continue;
  shown++;
  const i_ = p.info;
  const v = VARIANTS[i_.variant]!;
  console.log(`\n${p.name.toUpperCase()}  (${v.label}, ${SIZES[i_.size]!.label}, ${CONDITIONS[i_.condition]!.label}, tier ${i_.tier}; pays ${Math.round(offerFraction(i_) * 100)}% of worth, ${Math.round(v.rate * 100)}%/day to buy back; security ${p.security})`);
  console.log(`  in ${SHELLS[i_.shell]!.label}${i_.traits.length ? ` · ${i_.traits.map((t) => TRAITS[t]!.label).join(' · ')}` : ''}${i_.wild ? ` · WILD: ${WILD[i_.wild]!.label}` : ''}`);
  console.log(`  ${p.blurb}`);
  console.log(`  rooms: ${i_.rooms.join(', ') || '(none)'}   features: ${i_.features.length}`);
  const rows = describePawn(i_);
  console.log('  ' + Object.entries(rows).map(([room, ids]) => `${room}: ${ids.length}`).join('   '));
}
