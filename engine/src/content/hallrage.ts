import type { Affordance } from '../affordances';
import { banned, furious, rageSmash, type HallView, type RageTexts } from '../hallkit';
import { GENRES } from './halls';
import { row } from './hallrow';
import { gameId, memoryOf } from '../games';

/**
 * Losing it. She has just lost at a game she has come to hate, and the cabinet is right there: the want to take it apart is
 * strong, stronger with a short temper, and it is the one thing a cabinet cannot take back. (The cold, deliberate version, for
 * a cabinet she has not lost to, is `smash-cabinet` in hallcrime.ts.) What it does is `rageSmash` in hallkit.ts.
 */

const CABS = Object.values(GENRES).map((g) => g.feature);

export const RAGE_TEXT: RageTexts = {
  muse: [
    'The cabinet says "What a brave try, friend!" and Blackbird kicks it in the screen. It says it again, through a crack, in a smaller voice. She kicks it until "{title}" stops being a game and starts being a pile, and a heart-shaped light goes out at last over the coin slot.',
    'Blackbird looks at the score on "{title}", looks at the cheerful face on the attract screen and picks up a stool. The face stays cheerful through the first two swings. After the third, it says nothing at all, which is the most honest it has ever been.',
    '"Better luck next time!" says "{title}", and Blackbird takes the stick off its hinges and uses it to remove the rest. The Joy tickets come out of the slot in a long, confused tongue. She does not collect them. She is not that sort of person right now.',
  ],
  boot: [
    'Blackbird loses to "{title}" one more time, says a single word, and puts a boot through the case. The cracked board inside makes a sound like a cat being introduced to a fan. Nobody at {hall} even turns round; it is that sort of cabinet.',
    '"{title}" has beaten her again, in six languages and one skull. She answers in one language with a pipe. The cabinet does not go quietly, but it does go, over the course of about eleven seconds, in order of expense.',
    'The board on "{title}" has been mocking her for an hour. Blackbird finds the tool that the owner keeps by the wall for exactly this and applies it with a precision that would have impressed the people who made it, if she had not just destroyed them.',
  ],
  hand: [
    'She meets a corner of the case on the way through. Her knuckles object. She decides not to hear them.',
    'Blackbird tears something on the back of her hand on a bracket she did not see. There is blood. There is also, she notes, a lot less of the machine.',
  ],
  thrown: [
    '{npc} appears at her elbow at {hall} with the kind of face that does not argue. The pavement outside is quiet, and has no cabinets in it.',
    '{npc} walks Blackbird out of {hall} by the back of the jacket, past the crowd, past the sticker that says FUN IS A RESPONSIBILITY, and puts her on the street with something like sympathy.',
  ],
  thought: [
    'Therapeutic.',
    'I feel like a new woman. A newer one, at least.',
    'It had that coming. It had been coming for weeks.',
    'Closure, with a stool.',
    'See? A game is only as good as its worst loser. I am the worst loser. I won.',
    'Note to self: this works.',
  ],
};

export const RAGE: Affordance<HallView>[] = [
  row({
    id: 'smash-in-a-rage', where: { feature: CABS }, each: true, pace: 'quick',
    needs: ['drive:pride', 'drive:bravery', 'stat:muscle', 'skill:melee'],
    sees: 'A cabinet that has just beaten her at a game she has come to hate, in public, for the last time.',
    stakes: 'The cabinet, scrapped for days. A cut hand, maybe; the owner\'s good opinion, certainly; a shoulder from the bouncer if it was licensed.', consequence: 'The game is gone, and so is most of what she held against it.',
    drives: { pride: 0.7, bravery: 0.3 }, bonus: 0.2, risk: 0.4,
    // A short temper is the whole difference, and the longer the losing streak, the nearer the edge.
    appeal: (w, v, f) => {
      const cab = furious(w, v, f);
      if (!cab) return -1;
      const mem = memoryOf(w, gameId(cab.title));
      return 1.4 + 3 * w.hero.personality.traits.temper + 0.25 * Math.min(5, mem?.streak ?? 0);
    },
    intent: ['Blackbird has lost to that cabinet for the last time. She knows it. The cabinet knows it. The stool she is holding knows it.'],
    ok: (w, v, f) => !banned(w, v.main) && !!furious(w, v, f),
    run: (c, v, f) => rageSmash(c, v, f!, RAGE_TEXT),
  }),
];
