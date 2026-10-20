/**
 * Which capabilities does each kind of place have something for?
 *   npm run coverage
 * Reads the live skill, stat and drive lists and the affordance registry. Gaps are listed for filling; nothing is rejected.
 */
import { coverage } from '../engine/src/affordances';
import { FEATURES } from '../engine/src/content/gyms';
import { FEATURES as PAWN_FEATURES } from '../engine/src/content/pawns';
import { FEATURES as HUB_FEATURES } from '../engine/src/content/hubs';
import '../engine/src/gym';
import '../engine/src/hub';
import '../engine/src/pawn';

const { rows, places: ps } = coverage({ gym: Object.keys(FEATURES), pawn: Object.keys(PAWN_FEATURES), hub: Object.keys(HUB_FEATURES) });
const w = Math.max(...rows.map((r) => r.capability.length)) + 2;
console.log(''.padEnd(w) + ps.map((p) => p.padStart(6)).join(''));
for (const r of rows) console.log(r.capability.padEnd(w) + ps.map((p) => (r.counts[p] ? String(r.counts[p]) : '-').padStart(6)).join(''));
for (const p of ps) {
  const gaps = rows.filter((r) => !r.counts[p]).map((r) => r.capability);
  console.log(`\nNothing at ${p} for: ${gaps.length ? gaps.join(', ') : '(everything is covered)'}`);
}
