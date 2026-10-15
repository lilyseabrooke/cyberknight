import { it } from 'vitest';

/**
 * For Monte Carlo tests: each plays dozens to hundreds of whole games to show that something rare happens, or that one
 * kind of hero does better than another. Those ~30 tests are about 97% of the suite's run time, so plain `npm test`
 * skips them; `npm run test:full` (vitest --mode full) runs everything, as should CI and anything touching the sim's balance.
 */
export const slow = import.meta.env.MODE === 'full' ? it : it.skip;
