import type { Affordance } from '../affordances';
import { runCheck, type HallView } from '../hallkit';
import type { Check, Result } from '../placekit';

/**
 * The two helpers every arcade row file uses: `row` turns a description into a registered affordance (a row with a `check`
 * is run as data; a row with a `run` does its own thing), and `R` writes a result. Tokens in prose: {hall} {npc} {owner}
 * {pay} {amount} {lost} {item} {tip}; for a cabinet row also {title} {cab} {genre} {score} {topBy} {licence}.
 */
type RowIn = Omit<Affordance<HallView>, 'place' | 'run'> & { check?: Check; run?: Affordance<HallView>['run'] };
export const row = (a: RowIn): Affordance<HallView> => ({ ...a, place: 'hall', run: a.run ?? ((c, v) => runCheck(c, v, a.id, a.check!)) });
export const R = (text: string[], o: Partial<Result> = {}): Result => ({ text, ...o });
