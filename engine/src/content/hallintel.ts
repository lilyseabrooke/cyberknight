import type { Affordance } from '../affordances';
import { addHeat, remember as remind } from '../combat';
import { banned, cabAt, find, playable, say, type Cab, type HallView } from '../hallkit';
import { baseTitle, gameId, memoryOf, remember } from '../games';
import { knowsCreator, knowsWhere, learnCreator, type Route } from '../creators';
import { overrideChance } from '../override';
import { knowsTechnique, type LearnableId } from '../techniques';
import { odds, synergy, train } from '../skills';
import type { Ctx, World } from '../types';
import { GENRES } from './halls';
import { row } from './hallrow';

/**
 * Who made the game on this cabinet? Every game has a creator, and there are four ways to find out from a cabinet: be
 * number one on it (play, in hallkit.ts, rolls the credits), ask the pros, dig through the credits and the forums, or
 * open the build with an Override. (A fifth, taking it out of a records office, is records.ts.) What she learns, and what
 * becomes of it, is creators.ts; the Calling that makes this the point of her life is `creator` in content/callings.ts.
 */

const CABS = Object.values(GENRES).map((g) => g.feature);
const OVERRIDES: LearnableId[] = ['door_lock', 'lights_out', 'power_cut', 'alarm_spoof'];

/** The game on this cabinet, and what she already knows about its maker. */
function target(w: World, v: HallView, f: string | undefined): { cab: Cab; gid: string } | undefined {
  const cab = f ? cabAt(w, v, f) : undefined;
  return cab ? { cab, gid: gameId(cab.title) } : undefined;
}

/** How much she wants to know: a game she hates or loves makes her curious about whoever made it. */
function itch(w: World, gid: string): number {
  const g = memoryOf(w, gid);
  return g ? 0.05 + 0.25 * Math.max(0, -g.like) + 0.1 * Math.max(0, g.like) + 0.02 * Math.min(10, g.plays) : 0.03;
}

/** Make sure she has a memory of the game she is asking about (she may never have played it), then run the route. */
function ask(c: Ctx, v: HallView, f: string, route: Route, p: number, win: string[], lose: string[], winThought: string[], after?: (ok: boolean, cab: Cab) => void): void {
  const { w, rng } = c;
  const t = target(w, v, f);
  if (!t) return;
  const { cab, gid } = t;
  remember(w, gid, baseTitle(cab.title), cab.genre, cab.legal);
  const tok = { hall: v.main.name, title: baseTitle(cab.title), npc: find(v, 'champion', rng)?.name ?? find(v, 'streamer', rng)?.name ?? find(v, 'hustler', rng)?.name ?? 'a regular' };
  const ok = rng.chance(Math.max(0.04, Math.min(0.92, p)));
  say(c, `${route}.${ok ? 'win' : 'lose'}`, ok ? 'good' : 'bad', ok ? win : lose, ok ? winThought : undefined, tok, { place: v.main.name });
  if (ok) learnCreator(c, gid, route);
  after?.(ok, cab);
}

const open = (w: World, v: HallView): boolean => !banned(w, v.main);
const unknown = (w: World, v: HallView, f: string | undefined): boolean => {
  const t = target(w, v, f);
  return !!t && !(knowsCreator(w, t.gid) && knowsWhere(w, t.gid));
};
const pro = (v: HallView): boolean => !!(find(v, 'champion') || find(v, 'streamer') || find(v, 'hustler'));

export const INTEL: Affordance<HallView>[] = [
  row({
    id: 'ask-the-pros', where: { feature: CABS }, each: true, pace: 'session',
    needs: ['skill:streetwise', 'skill:persuasion', 'skill:gaming', 'stat:charm', 'drive:curiosity'],
    sees: 'A row of people who have played this cabinet for more hours than they have slept, and who will talk about it to anyone who buys the next round of tokens.',
    stakes: 'A round of tokens, an evening, and a name. It is only a name: nobody on the circuit knows where the person who made it lives.', consequence: 'She knows who made the game.',
    drives: { curiosity: 0.5, pride: 0.1 }, bonus: 0.0,
    appeal: (w, v, f) => (f && target(w, v, f) && !knowsCreator(w, target(w, v, f)!.gid) ? itch(w, target(w, v, f)!.gid) : -1),
    intent: ['Blackbird wants to know who is responsible for this machine, and she is going to ask the people who have suffered most.'],
    ok: (w, v, f) => open(w, v) && pro(v) && !!f && !!target(w, v, f) && !knowsCreator(w, target(w, v, f)!.gid) && w.hero.cash >= 6,
    run: (c, v, f) => {
      const w = c.w;
      w.hero.cash -= 6;
      const p = odds(0.4, 0.06, synergy(w.hero, ['streetwise', ['stat:charm', 0.6], ['persuasion', 0.5]]), 0.05, 0.9);
      train(c, 'streetwise', 1);
      ask(c, v, f!, 'pros', p,
        ['Blackbird buys {npc} a round of tokens and asks about "{title}". They tell her everything: the frame data, the one cheap trick, the name of the person who made it. They say the name like a curse.', 'At {hall}, a champion, a streamer and a man who has not been to the toilet since Tuesday explain who is to blame for "{title}". They agree on a name. It is the first thing they have agreed on all year.'],
        ['Blackbird asks about "{title}". {npc} says the person who made it is "a legend" and then, with some heat, "a coward". Nobody can say which. She buys a second round to be sure, and learns the frame data and nothing else.', 'Everyone at {hall} has a theory about who made "{title}". None of them matches. One of them is, she is fairly sure, a joke.'],
        ['Always ask the people who lose the most. They know the name.', 'Six tokens. A name. I have paid more for less.']);
    },
  }),
  row({
    id: 'dig-credits', where: { feature: CABS }, each: true, pace: 'session',
    needs: ['skill:analyze', 'skill:perception', 'skill:tracking', 'skill:streetwise', 'stat:int', 'drive:curiosity'],
    sees: 'A cabinet that was made by a person: a title screen with the credits cropped off, a forum thread eleven years old and a lot of people who have asked and been ignored.',
    stakes: 'An evening in somebody else\'s receipts. If it works she gets the name; if she has the name already she gets the address.', consequence: 'She knows who made the game, and then where.',
    drives: { curiosity: 0.6, quest: 0.3 }, bonus: 0.0,
    appeal: (w, v, f) => (f && target(w, v, f) && !knowsWhere(w, target(w, v, f)!.gid) ? itch(w, target(w, v, f)!.gid) * 0.8 : -1),
    intent: ['Blackbird opens the back of the internet and goes looking for the person who wrote this.'],
    ok: (w, v, f) => open(w, v) && !!f && !!target(w, v, f) && !knowsWhere(w, target(w, v, f)!.gid),
    run: (c, v, f) => {
      const w = c.w;
      const p = odds(0.3, 0.06, synergy(w.hero, ['analyze', ['stat:int', 0.6], ['perception', 0.4], ['tracking', 0.3]]), 0.05, 0.9);
      train(c, 'analyze', 1);
      ask(c, v, f!, 'intel', p,
        ['An evening on the terminal at {hall}: the credits of "{title}", a forum thread from before the Fall and a stranger\'s cache of patch notes. By midnight she has it.', 'Blackbird pieces "{title}" together from three bad scans and a stranger\'s grudge. The last page of the manual has a name on it, a very small one.'],
        ['Four hours of forums about "{title}" and every thread ends in an argument about the same patch. She gets a lot of opinions and not one name.', 'The credits of "{title}" were cropped off in a re-release. The original is on a server that no longer exists. Blackbird learns this the long way.'],
        ['Nobody reads the manual. That is where they hide.', 'Paper trails are the best trails.']);
    },
  }),
  row({
    id: 'override-cabinet', where: { feature: CABS }, each: true, pace: 'session',
    needs: ['skill:tinkering', 'skill:gaming', 'stat:int', 'drive:curiosity', 'drive:bravery'],
    sees: 'A cabinet whose service port is a door, and a building-bus Override that knows how to open it.',
    stakes: 'The build\'s own files: name and address of whoever made it. A bad try locks the board and puts a mark on her.', consequence: 'She knows who made the game and where they are. Needs an Override.',
    drives: { curiosity: 0.6, bravery: 0.2, pride: 0.2 }, bonus: 0.0, risk: 0.4,
    appeal: (w, v, f) => (f && target(w, v, f) && !knowsWhere(w, target(w, v, f)!.gid) ? itch(w, target(w, v, f)!.gid) * 0.9 : -1),
    intent: ['Blackbird looks at a service port and decides it is a door.'],
    ok: (w, v, f) => open(w, v) && !!f && playable(cabAt(w, v, f)) && OVERRIDES.some((id) => knowsTechnique(w.hero, id)) && !knowsWhere(w, gameId(cabAt(w, v, f)!.title)),
    run: (c, v, f) => {
      const w = c.w;
      const known = OVERRIDES.filter((id) => knowsTechnique(w.hero, id));
      // The more she knows, and the bigger it is, the likelier: a Power Cut is the key that fits.
      const p = overrideChance(w, 0.15) + (known.includes('power_cut') ? 0.25 : 0) + 0.08 * (known.length - 1);
      train(c, 'tinkering', 1.5);
      ask(c, v, f!, 'override', p,
        ['Blackbird puts an Override through the service port of "{title}". The screen flickers, offers her a menu with no manual, and then the whole build scrolls past: the code, the comments, the last commit, signed.', 'A lights-out, a door-lock and a long breath, and "{title}" opens like a book. She reads the build\'s own files, standing up, with a hand on the glass.'],
        ['The Override goes in, and "{title}" goes dark. For one second the screen shows a skull, and then a LUMINA, and then a cheerful message about unauthorised access. A mark is on her.', 'The cabinet fights back. The service port locks, the board reboots and Blackbird is looking at the attract screen of a game she can no longer open.'],
        ['I opened it up. It had nothing to hide. People never do.', 'A machine with a back door is a machine that wants to tell you everything.'],
        (ok) => {
          if (ok) return;
          addHeat(w, v.main.faction ?? null, 1);
          const o = find(v, 'owner');
          if (o) {
            o.affinity -= 4;
            remind(o, 'caught Blackbird breaking into a cabinet\'s service port');
          }
        });
    },
  }),
];
