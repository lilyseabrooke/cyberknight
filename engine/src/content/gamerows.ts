import { register, type Affordance } from '../affordances';
import { R as GR, row as gymRow } from './gymafford';
import { row as pawnRow, R as PR } from './pawnafford';
import { row as hubRow } from './hubafford';
import { R as HR, banned as hubBanned } from '../hubkit';
import { banned as pawnBanned, type PawnView } from '../pawnkit';
import { banned as gymBanned, type GymView } from '../gymkit';
import type { HubView } from '../hubkit';
import type { World } from '../types';

/**
 * Gaming at the places that were not built for it: the gym (reaction labs, esports bootcamps, VR sims), the pawn shop
 * (consoles, cartridges, a bootleg or two) and the hacker hub (speed-runs, ladders, a cabinet in the corner). Every check
 * leans on Gaming, which is how the shared runner knows to count the money it wins (see placekit.ts). Muse is the licensed
 * side of fun in Neo and appears here as a sticker or a voice; the bootlegs are whatever somebody made in a weekend.
 */

const gymOpen = (w: World, v: GymView): boolean => !gymBanned(w, v.main);
const pawnOpen = (w: World, v: PawnView): boolean => !pawnBanned(w, v.main);
const hubOpen = (w: World, v: HubView): boolean => !hubBanned(w, v.main);

// ===================================================================== the gym

export const GYM_GAMING: Affordance<GymView>[] = [
  gymRow({
    id: 'reaction-lab', where: { feature: ['robot_spotter', 'mats', 'scoreboard'] }, pace: 'quick',
    needs: ['skill:gaming', 'stat:reflex', 'skill:athletics', 'drive:pride'],
    sees: 'A panel of lights on a wall that goes off at random, and a scoreboard that is not kind about averages.', stakes: 'A few minutes of her day; sharper hands.', consequence: 'Her reflexes, and a number on a board.',
    drives: { pride: 0.5, curiosity: 0.2 }, bonus: 0.04, intent: ['Blackbird sees the light wall and takes it as a challenge from the building.'], ok: gymOpen,
    check: { parts: ['gaming', 'stat:reflex', ['athletics', 0.3]], base: 0.42, per: 0.06,
      win: GR(['{gym}: forty lights, forty slaps, no misses. The board gives her 212 milliseconds and a green number. {npc} looks up from a clipboard and writes something down.', 'Blackbird clears the reaction wall at {gym} with her left hand and a spare yawn. The panel plays a short fanfare that was clearly recorded by someone with a lot of feelings.'], { train: [['gaming', 2], ['athletics', 1]], xp: 3, fame: 0.3, thought: ['Two hundred and twelve. That is a number you put on a business card.', 'My hands are faster than my opinions.'] }),
      lose: GR(['The light wall at {gym} wins thirty-one to nine. It plays a tiny, gentle trombone.', 'Blackbird slaps the wrong light twice, and then the right one three times too late. The scoreboard does not say a word, which is its way.'], { train: [['gaming', 1]], xp: 1, thought: ['It was mostly the lights.'] }) },
  }),
  gymRow({
    id: 'esports-bootcamp', where: { feature: ['member_terminal', 'stream_rig', 'scoreboard'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:calculate', 'stat:int', 'drive:greed'],
    sees: 'A row of chairs with headrests, a banner for a bracket and a prize purse in a font that tries too hard.', stakes: '12nd for a seat; the purse if she places.', consequence: 'Her name in the bracket. The members remember who dropped a round.',
    drives: { greed: 0.5, pride: 0.4 }, bonus: 0.06, intent: ['Blackbird notices there is a purse, and that it is the same size as her opinion of herself.'], ok: (w, v) => gymOpen(w, v) && w.hero.cash >= 12,
    check: { pay: 12, parts: ['gaming', ['calculate', 0.5], ['stat:int', 0.4]], base: 0.328, per: 0.06,
      win: GR(['{gym} runs an esports bootcamp on Tuesdays: ten chairs, one banner, a coach who says "macro" a lot. Blackbird takes second. {amount}nd from the purse, and a bracket photo she is not looking at the camera in.', 'Blackbird plays four sets at {gym} on the members\' machines and takes the last one on a tactic nobody else saw coming, including her. {amount}nd.'], { cash: [25, 90], fame: 1, train: [['gaming', 4], ['calculate', 1]], xp: 5, thought: ['Macro. I understand macro now. It is when you win.', 'Second place is just first place with extra humility.'] }),
      lose: GR(['Blackbird is out in the first round at {gym}, to a person eating a protein bar one-handed. The coach says "good effort" in the voice used for a good effort.', 'The bootcamp at {gym} runs through her in two sets. She is told the learning is the prize. The prize is not the learning.'], { train: [['gaming', 1.5]], xp: 2, thought: ['Round one is a lot of pressure.'] }) },
  }),
  gymRow({
    id: 'vr-sparring-sim', where: { variant: ['chrome', 'atlasfit', 'studio', 'wellness'], room: 'floor' }, pace: 'session',
    needs: ['skill:gaming', 'skill:melee', 'stat:reflex', 'drive:bravery'],
    sees: 'A visor on a hook, a padded square on the floor and a sign that says THE OPPONENT IS NOT REAL. THE BRUISES ARE.', stakes: 'An hour in the visor; a bruise from furniture she forgot was there.', consequence: 'Her footwork, and a sore shin.',
    drives: { bravery: 0.4, curiosity: 0.3, pride: 0.2 }, bonus: 0.05, ok: gymOpen,
    check: { parts: ['gaming', ['melee', 0.7], ['stat:reflex', 0.4]], base: 0.379, per: 0.06, physical: true,
      win: GR(['{gym}: she puts the visor on and fights a sparring partner called IRON KEVIN in a simulation of a rooftop. Eleven rounds, nine wins, one broken lamp in the real room. {npc} says the form was good. The lamp was not.', 'Blackbird clears the sim ladder at {gym}. At the top, a cartoon medal. She is out of breath in two worlds.'], { train: [['gaming', 2], ['melee', 3]], xp: 4, sore: 0.1, thought: ['Iron Kevin never saw it coming. Iron Kevin is a gradient.', 'In there I am a legend. Out here, the lamp.'] }),
      lose: GR(['Blackbird loses to IRON KEVIN on the second rooftop and walks into a real pillar to celebrate. The visor apologises.', 'The sim at {gym} knocks her out of the ring in nine seconds. In the real room she knocks over a bench. Both count.'], { train: [['gaming', 1]], sore: 0.12, xp: 1, thought: ['That was the pillar. Not Kevin.'] }) },
  }),
  gymRow({
    id: 'stream-a-session', where: { feature: 'stream_rig' }, pace: 'session',
    needs: ['skill:gaming', 'stat:charm', 'skill:speaking', 'drive:pride'],
    sees: 'A ring light, a camera on a swivel and a chat that has opinions about her posture.', stakes: 'An hour of being watched; a few tips and a comments section.', consequence: 'Her face, said aloud by strangers.',
    drives: { pride: 0.6, curiosity: 0.2, greed: 0.2 }, bonus: 0.05, ok: gymOpen,
    check: { parts: ['gaming', ['stat:charm', 0.6], ['speaking', 0.4]], base: 0.421, per: 0.05,
      win: GR(['Blackbird streams a session from {gym}: a speed-run with commentary, four hundred viewers at the peak and a donation from someone called PLANK_LORD. {amount}nd, and a clip that will outlive her.', '{gym}: she explains the strategy to the camera as she executes it, which is the secret. Chat sends her {amount}nd, a heart and two requests to marry her cat. She has no cat.'], { cash: [8, 40], fame: 1.5, train: [['gaming', 2], ['speaking', 1]], xp: 3, thought: ['Four hundred people. They are all me, ranked.', 'Chat gets me. Chat is ten percent bots and ninety percent right.'] }),
      lose: GR(['The stream at {gym} lags at the exact moment she tries a thing. The clip is titled "oh no". It is a banner year for "oh no".', 'Blackbird loses a boss on camera and says something about its mother. Eleven viewers leave. One stays and sends her a tip for the language. It is a very small tip.'], { train: [['gaming', 1]], xp: 1, fame: -0.1, thought: ['Clip it. Delete it. Never again. Clip it again.'] }) },
  }),
  gymRow({
    id: 'coach-a-newcomers-hands', where: { room: 'floor' }, pace: 'session',
    needs: ['skill:gaming', 'skill:persuasion', 'skill:analyze', 'stat:charm'],
    sees: 'Somebody on a mat looking at their own hands as if they had been issued by mistake.', stakes: 'Twenty minutes; a tip, or a new friend.', consequence: 'A regular who owes her a good word.',
    drives: { pride: 0.3, curiosity: 0.3 }, bonus: 0.04, ok: (w, v) => gymOpen(w, v) && !!v.people.length,
    check: { who: 'regular', parts: ['gaming', ['persuasion', 0.5], ['analyze', 0.4]], base: 0.53, per: 0.05,
      win: GR(['At {gym}, {npc} cannot keep a rhythm on the hand-eye pad. Blackbird fixes their grip, their breathing and, eventually, their attitude. By the hour\'s end {they} {is} a competitor. {npc} slides {amount}nd across as thanks.', 'Blackbird coaches {npc} through the pad pattern at {gym}, one beat at a time. It sticks. {They} {are} faster than her by the end. She calls that teaching.'], { cash: [4, 20], from: 'who', affinity: 6, train: [['gaming', 2], ['persuasion', 1]], xp: 3, thought: ['I can teach. I can teach and also win. Mostly I can win.', 'Look at them go. They have my hands.'] }),
      lose: GR(['{npc} gets worse under Blackbird\'s coaching at {gym}, and then angrier. The lesson ends when {they} walk{s} off to the water cooler.', 'Blackbird explains the pad pattern at {gym} in too many words. {npc} nods and does it wrong, to be kind.'], { affinity: -1, train: [['gaming', 1]], xp: 1, thought: ['They will thank me later. At length.'] }) },
  }),
  gymRow({
    id: 'hand-eye-wall', where: { feature: ['dart_board', 'shooting_lane', 'climbing_wall'] }, pace: 'quick',
    needs: ['skill:gaming', 'skill:marksmanship', 'skill:throwing', 'drive:bravery'],
    sees: 'A target board with a bell on it and a light that goes on a half-second before the bell does.', stakes: 'A few coins; a hand that remembers it.', consequence: 'Her aim, and a tally on the wall.',
    drives: { pride: 0.4, bravery: 0.2 }, bonus: 0.03, ok: gymOpen,
    check: { parts: ['gaming', ['marksmanship', 0.6], ['throwing', 0.4]], base: 0.43, per: 0.05,
      win: GR(['{gym}: the bell goes off nine times in a row. A man with a clipboard in the corner counts it twice and finds that he agrees. She wins a drink coupon and a grunt.', 'Blackbird clears the hand-eye wall at {gym} without looking at it, which is the whole trick.'], { train: [['gaming', 1.5], ['marksmanship', 1]], xp: 2, fame: 0.2, thought: ['Look away at the last second. Always look away.'] }),
      lose: GR(['Three bells in thirty targets. The wall at {gym} does not mind. It never minds.', 'Blackbird hits the lamp over the target and misses the target. The lamp is the better shot.'], { train: [['gaming', 0.5]], xp: 1, thought: ['It moved. The wall moved.'] }) },
  }),
  gymRow({
    id: 'read-the-bracket', where: { situation: ['tournament', 'challenge', 'scouts'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:analyze', 'skill:calculate', 'drive:greed'],
    sees: 'A bracket on a whiteboard, a table of people who want to know who will win and a coach with a pen.', stakes: 'A small side bet; a reputation as someone who calls it.', consequence: 'The odds, which she is now part of.',
    drives: { greed: 0.5, curiosity: 0.3 }, bonus: 0.05, ok: (w, v) => gymOpen(w, v) && w.hero.cash >= 10,
    check: { pay: 10, parts: ['gaming', ['analyze', 0.6], ['calculate', 0.5]], base: 0.43, per: 0.05,
      win: GR(['{gym}: Blackbird reads the bracket from the way the players warm up and calls the final correctly, with a score. {amount}nd from a table of people who had given it six to one. The coach looks at her like she is a typo.', 'She calls three upsets at {gym} before lunch, and an extra one after. {amount}nd, and a small crowd that is trying to figure her out.'], { cash: [20, 80], train: [['gaming', 2], ['analyze', 1]], xp: 3, thought: ['Everybody has a tell. Mostly they stand like they know.'] }),
      lose: GR(['Blackbird calls the final at {gym} for the wrong finalist, and then explains why she was right anyway. The table is not interested in the explanation.', 'The bracket at {gym} goes the other way, with a long, awkward handshake.'], { train: [['gaming', 0.5]], xp: 1, thought: ['The bracket is wrong. The bracket will be sorry.'] }) },
  }),
];

// ===================================================================== the pawn shop

export const PAWN_GAMING: Affordance<PawnView>[] = [
  pawnRow({
    id: 'pawn-the-console', where: { feature: 'counter' }, pace: 'quick',
    needs: ['skill:gaming', 'skill:haggling', 'drive:greed', 'stat:charm'],
    sees: 'A counter, and under glass a row of consoles with price tags that rise the more they look like her childhood.', stakes: 'A console she does not need, for cash she does.', consequence: 'A tag in biro with a name on it.',
    drives: { greed: 0.5, pride: 0.2 }, bonus: 0.04, intent: ['Blackbird looks at a console she owns and decides it has been unfair to her.'], ok: pawnOpen,
    check: { who: 'owner', parts: ['gaming', ['haggling', 0.6], ['stat:charm', 0.3]], base: 0.425, per: 0.05,
      win: PR(['{shop}: the broker turns her console over twice and plugs it in. "Is it the good one?" She says it is the good one. "It is the good one." {amount}nd across the counter and a nod to the shelf where it will sit between a lamp and a lie.', 'Blackbird argues the value of her console at {shop} with the authority of someone who has won on it. {npc} agrees, a little. {amount}nd.'], { cash: [14, 60], from: 'owner', train: [['gaming', 1.5], ['haggling', 1.5]], xp: 3, thought: ['It was a good console. It will be a good memory.', 'Sentimental value, 6nd. Real value, the rest.'] }),
      lose: PR(['The broker at {shop} plugs it in, loads her save and reads the play time out loud. "Eleven hundred hours." The offer drops to a polite insult.', '{npc} says the console is "a hobbyist\'s item" and makes the face of someone refusing a free sandwich.'], { thought: ['Eleven hundred hours is an investment. In me.'], affinity: -1 }) },
  }),
  pawnRow({
    id: 'sell-the-cartridge', where: { feature: ['curio_shelf', 'display_case', 'window_display'], variant: ['collectibles', 'classic', 'jeweller', 'consignment', 'stall', 'hardware'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:haggling', 'skill:streetwise', 'drive:greed'],
    sees: 'A glass case of cartridges in plastic sleeves and a broker who is looking for something specific and pretending not to.', stakes: 'A cartridge she might not know the worth of.', consequence: 'The broker keeps a list of what she brings.',
    drives: { greed: 0.5, curiosity: 0.3 }, bonus: 0.04, ok: pawnOpen,
    check: { who: 'owner', parts: ['gaming', ['haggling', 0.6], ['streetwise', 0.3]], base: 0.43, per: 0.05,
      win: PR(['{shop}: she knows the cartridge in the case is a first-run Muse release with the original sticker, and says so. {npc} pays {amount}nd without arguing, then writes the name on a card in tiny letters under glass.', 'Blackbird spots a mislabelled Joy-era cartridge at {shop}, buys it for the broker\'s price and sells it to the man at the back for {amount}nd more. Everybody is happy and one of them is wrong.'], { cash: [18, 75], from: 'owner', train: [['gaming', 2], ['haggling', 1]], xp: 3, thought: ['A real one. Serial number and all. They should not leave these out.', 'Collectors are just gamblers with a shelf.'] }),
      lose: PR(['Blackbird sells a cartridge at {shop} for 12nd and finds out afterwards it was a first-run. {npc} nods the way people nod at a very small funeral.', 'The cartridge she brings to {shop} turns out to be a reproduction, and a bad one. The broker says "bless" and charges for the glass.'], { loseCash: [2, 10], train: [['gaming', 1]], thought: ['It was the sticker. The sticker lied.'] }) },
  }),
  pawnRow({
    id: 'bootleg-cartridge-flip', where: { room: ['bay', 'parlour', 'alley', 'cellar'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:streetwise', 'skill:haggling', 'drive:greed'],
    sees: 'A fence by the loading door with a shoebox of hand-labelled cartridges and the calm of someone who has never held a Muse licence.', stakes: 'A box of bootlegs, bought low and sold to somebody who loves a thing that is illegal.', consequence: 'The fence has a name for her. It is a good one.',
    drives: { greed: 0.6, bravery: 0.2 }, bonus: 0.05, ok: (w, v) => pawnOpen(w, v) && w.hero.cash >= 8,
    check: { who: 'fence', pay: 8, parts: ['gaming', ['streetwise', 0.6], ['haggling', 0.4]], base: 0.43, per: 0.05,
      win: PR(['The fence at {shop} sells her three cartridges with skulls on the label. She tries one in the back, picks the one that is good, and sells it at the front for {amount}nd to a man who has been looking for it for nine years.', 'Blackbird buys a shoebox of bootlegs at {shop} for 8nd and picks out the two that were made by someone with talent. {amount}nd on the counter, and a handshake from a person who is wearing gloves.'], { cash: [20, 90], from: 'owner', train: [['gaming', 2], ['streetwise', 1]], xp: 4, thought: ['There is always one good one in the box. It is why they put the box there.', 'Technically a crime. Technically a Tuesday.'] }),
      lose: PR(['All three cartridges from the fence at {shop} are the same game, and it is a calculator. {npc} laughs so hard {they} {has} to sit down.', 'Blackbird flips a bootleg cartridge at {shop} to a man who turns out to be from the licence office. He is very nice about it. He takes the cartridge.'], { loseCash: [2, 10], warn: ['flip', 1], train: [['gaming', 1]], thought: ['It was a calculator. A good calculator.'] }) },
  }),
  pawnRow({
    id: 'test-the-console', where: { feature: ['repair_bench', 'appraisal_bench'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:tinkering', 'stat:int', 'drive:curiosity'],
    sees: 'A bench with a console on it that has had a screwdriver put through the back and a tag that says UNTESTED, which is a dare.', stakes: 'An hour at the bench; a save file left by the last owner.', consequence: 'The shop knows she can bring things back from the dead.',
    drives: { curiosity: 0.6, greed: 0.2 }, bonus: 0.05, ok: pawnOpen,
    check: { who: 'tinker', parts: ['gaming', ['tinkering', 0.7], ['stat:int', 0.3]], base: 0.431, per: 0.06,
      win: PR(['{shop}: she opens the console, reseats one chip and gets a boot screen. Under the save menu there is a file called "do not delete" and a cracked board in the compartment. She deletes nothing and keeps the board.', 'The console on the bench at {shop} boots on the fourth try. The last owner saved at the last boss, with a note: "if you are reading this, finish it." She does, in eleven minutes, in a stranger\'s name.'], { item: 'cracked_board', train: [['gaming', 2], ['tinkering', 2]], xp: 4, thought: ['Somebody left their whole life in there. It is a good save.', 'Finish it. I will finish it.'] }),
      lose: PR(['The console at {shop} boots into a screen that says LUMINA IS SAD, on a loop. It does not stop being sad until she unplugs it.', 'Blackbird bricks the console on the bench at {shop}. The tinker pats her shoulder, in the way you pat a person at a very quiet wake.'], { hurt: 0.15, train: [['tinkering', 1]], xp: 1, thought: ['It was already sad. I made it a different sad.'] }) },
  }),
  pawnRow({
    id: 'argue-the-board', where: { feature: ['display_case', 'curio_shelf', 'counter'], variant: ['collectibles', 'chrome', 'classic', 'consignment'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:persuasion', 'skill:analyze', 'stat:charm'],
    sees: 'A cabinet board in a case with a price on it that is either a typo or a dream, and a broker who is wishing someone would argue.', stakes: 'A discount on something nobody can use.', consequence: 'The shop gets to feel clever.',
    drives: { greed: 0.4, curiosity: 0.3, pride: 0.2 }, bonus: 0.04, ok: (w, v) => pawnOpen(w, v) && w.hero.cash >= 10,
    check: { who: 'appraiser', parts: ['gaming', ['persuasion', 0.5], ['analyze', 0.4]], base: 0.38, per: 0.05,
      win: PR(['{shop}: she tells the appraiser that board is from the third production run, not the first, and shows the trace under the stamp. {npc} adjusts the tag by 40nd and does not look at her for a while.', 'Blackbird argues the price of a rare cabinet board at {shop} down to a number she can live with: {amount}nd off. The appraiser says "you know your boards" in the voice of someone updating a file.'], { cash: [10, 45], train: [['gaming', 2], ['persuasion', 1]], xp: 3, thought: ['Third run. Everyone thinks it is the first. Nobody checks the stamp.'] }),
      lose: PR(['The appraiser at {shop} holds up the board, taps the stamp and says "no". Then does it again, for effect.', 'Blackbird argues the price of the board at {shop} for forty minutes and ends up paying for the coffee.'], { loseCash: [1, 8], train: [['gaming', 1]], thought: ['I was right. It does not help.'] }) },
  }),
  pawnRow({
    id: 'trade-in-kiosk', where: { feature: ['serial_scanner', 'vending', 'counter'], variant: ['atlasasset', 'chrome', 'stall', 'consignment', 'instruments'] }, pace: 'quick',
    needs: ['skill:gaming', 'skill:calculate', 'drive:greed', 'skill:streetwise'],
    sees: 'A trade-in kiosk with a slot, a screen and a very sincere promise of a fair price, issued in a Muse-pink font.', stakes: 'A few minutes of arithmetic; a better rate than the counter if she plays the kiosk.', consequence: 'The kiosk keeps her dossier of bad decisions.',
    drives: { greed: 0.4, curiosity: 0.3 }, bonus: 0.03, ok: pawnOpen,
    check: { parts: ['gaming', ['calculate', 0.6], ['streetwise', 0.3]], base: 0.43, per: 0.05,
      win: PR(['The trade-in kiosk at {shop} offers 14nd for her cartridge. She feeds it the cartridge three times at three angles until the price becomes {amount}nd. "Fun guaranteed!" says the kiosk, and she believes it, a little.', 'Blackbird learns the kiosk\'s pricing loop at {shop} and games it for {amount}nd. The kiosk thanks her for helping it learn.'], { cash: [8, 40], train: [['gaming', 1.5], ['calculate', 1]], xp: 2, thought: ['The machine can be beaten by a machine in a hoodie.', 'Everything has a loop. Find the loop.'] }),
      lose: PR(['The kiosk at {shop} scans the cartridge, plays a sad little jingle and offers a coupon instead. The coupon is for a coupon.', 'Blackbird tries to game the trade-in kiosk at {shop} and gets flagged as "highly engaged". The kiosk wants to talk about it.'], { train: [['gaming', 0.5]], xp: 1, thought: ['Highly engaged. That is a compliment, if you squint.'] }) },
  }),
  pawnRow({
    id: 'demo-unit-challenge', where: { feature: ['window_display', 'try_on_mirror', 'bargain_bin', 'counter'] }, pace: 'quick',
    needs: ['skill:gaming', 'stat:reflex', 'drive:pride', 'drive:bravery'],
    sees: 'A demo console in the window with a handwritten sign: BEAT THE CLERK, GET 10nd. The clerk has been there since morning.', stakes: 'A round against the clerk; 10nd either way, on principle.', consequence: 'The clerk now has a thing about her.',
    drives: { pride: 0.5, bravery: 0.2, greed: 0.2 }, bonus: 0.05, ok: (w, v) => pawnOpen(w, v) && w.hero.cash >= 10,
    check: { who: 'clerk', pay: 10, parts: ['gaming', 'stat:reflex'], base: 0.368, per: 0.06,
      win: PR(['The clerk at {shop} has not been beaten in a week. Blackbird beats {npc} three rounds to one, and {npc} turns the sign face down. 10nd back, {amount}nd more from the till.', 'She takes the demo unit at {shop} in a round that ends with the clerk saying "oh come on" to a piece of plastic. {amount}nd.'], { cash: [10, 35], from: 'owner', train: [['gaming', 2.5]], xp: 3, fame: 0.4, affinity: 2, thought: ['A week. A week of nobody, and now somebody.', 'Hello, clerk. I am the new problem.'] }),
      lose: PR(['The clerk at {shop} beats her three to nil and does not smile, which is the most insulting form of victory.', 'Blackbird loses at the demo unit in {shop} to a clerk who has not blinked since Thursday. The sign says: BEAT THE CLERK. It does not say what then.'], { train: [['gaming', 1]], xp: 1, thought: ['Best of five. Best of seven. Best of whatever it takes.'] }) },
  }),
  pawnRow({
    id: 'save-file-scavenge', where: { feature: ['bargain_bin', 'junk_pile', 'scrap_bin'] }, pace: 'quick',
    needs: ['skill:gaming', 'skill:scavenging', 'skill:perception', 'drive:curiosity'],
    sees: 'A bin of controllers with no consoles, consoles with no controllers and one memory card in a sandwich bag.', stakes: 'A few minutes of rummaging; a save file belonging to a stranger.', consequence: 'Nothing, except that someone\'s whole summer is hers now.',
    drives: { curiosity: 0.5, greed: 0.2 }, bonus: 0.03, ok: pawnOpen,
    check: { parts: ['gaming', ['scavenging', 0.6], ['perception', 0.4]], base: 0.43, per: 0.05,
      win: PR(['{shop}: Blackbird goes through the bin and comes up with a memory card in a sandwich bag. She plugs it in at the counter. A stranger finished a game in 61 hours, and the end credits have a name she wants to meet.', 'In the bin at {shop} there is a joypad worn smooth in the exact shape of one thumb. She buys it for 3nd and sells it to a collector for {amount}nd.'], { cash: [8, 30], item: 'arcade_stick', train: [['gaming', 1], ['scavenging', 1]], xp: 2, thought: ['Somebody loved this thumb. Somebody gave it up. That is a story.'] }),
      lose: PR(['The bin at {shop} gives her a controller with a sticky button and a sandwich. She keeps neither.', 'Blackbird finds a memory card in the bin at {shop}. It is blank, or it has been wiped by someone with a deep need to move on.'], { train: [['scavenging', 0.5]], xp: 1, thought: ['Nothing in the bin tonight. The bin is having a quiet night.'] }) },
  }),
];

// ===================================================================== the hacker hub

export const HUB_GAMING: Affordance<HubView>[] = [
  hubRow({
    id: 'speedrun-the-course', where: { feature: ['terminal_row', 'rack', 'crt_wall'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:calculate', 'stat:int', 'drive:pride'],
    sees: 'A terminal with a course on it, a timer in the corner and a leaderboard of times that are physically unreasonable.', stakes: 'An hour of retries; a time on the board.', consequence: 'Her handle, in a column.',
    drives: { pride: 0.6, curiosity: 0.3 }, bonus: 0.05, ok: hubOpen,
    check: { parts: ['gaming', ['calculate', 0.6], ['stat:int', 0.4]], base: 0.379, per: 0.06,
      win: HR(['{hub}: she finds a skip in the second level that saves nine seconds and runs the course in 1:48.2. The board lights up with her handle and, below it, three strangers typing "what".', 'Blackbird runs the course at {hub} on her thirty-first attempt. Her time is the fourth best and the first that has no luck in it. The room claps with its keyboards.'], { cash: [4, 24], fame: 1, train: [['gaming', 3], ['calculate', 1]], xp: 4, thought: ['The skip. There is always a skip.', 'Thirty-one tries. Thirty-one is a number I will mention.'] }),
      lose: HR(['{hub}: her run ends on level two, six seconds from a record, when she hits the wrong key and a bug makes a face. She is told the bug is "a feature".', 'Blackbird restarts the course at {hub} eleven times. A man behind her says "again" every time in the same voice, and it is the kindest cruelty.'], { train: [['gaming', 1.5]], xp: 2, thought: ['Eleven attempts. Eleven is a warm-up.'] }) },
  }),
  hubRow({
    id: 'ctf-cabinet', where: { feature: ['ctf_board', 'arcade_cab', 'pinball'] }, pace: 'session',
    needs: ['skill:gaming', 'stat:int', 'skill:tinkering', 'drive:curiosity'],
    sees: 'A cabinet that is also a capture-the-flag server, a scoreboard that is also a leaderboard and a plaque that says no cheating, in a typeface designed for cheating.', stakes: 'A few coins; a flag, a prize and a small amount of respect.', consequence: 'The server remembers which flags she took.',
    drives: { curiosity: 0.5, pride: 0.4 }, bonus: 0.06, ok: (w, v) => hubOpen(w, v) && w.hero.cash >= 4,
    check: { pay: 4, parts: ['gaming', ['stat:int', 0.6], ['tinkering', 0.4]], base: 0.325, per: 0.06,
      win: HR(['{hub}: a cabinet with a flag hidden in the high-score screen. She finds it by playing badly in exactly the right way. {amount}nd from the purse, and a handle in the hall of fame with a skull next to it.', 'Blackbird takes three flags off the cabinet at {hub} before anyone has noticed there are flags. The operator pays out {amount}nd and asks how.'], { cash: [10, 55], fame: 1, train: [['gaming', 2.5], ['tinkering', 1]], xp: 4, thought: ['Play badly. On purpose. Everyone assumes you are trying.'] }),
      lose: HR(['The cabinet at {hub} eats her coin and replies in a language she is not meant to speak. There is a flag in there somewhere.', 'Blackbird plays the flag cabinet at {hub} for an hour and finds nothing. A regular says the flag is the one you did not look at. It is a very annoying sentence.'], { train: [['gaming', 1]], xp: 1, thought: ['I will find it. It will be where I did not look.'] }) },
  }),
  hubRow({
    id: 'leaderboard-dojo', where: { feature: ['scoreboard', 'hall_of_fame', 'forum_terminal'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:speaking', 'stat:charm', 'drive:pride'],
    sees: 'A board of handles, a room that knows what each one is worth and a steady murmur that stops when she asks about the top three.', stakes: 'An evening of challenges; a rank.', consequence: 'The room has a different name for her.',
    drives: { pride: 0.6, curiosity: 0.2 }, bonus: 0.05, ok: hubOpen,
    check: { who: 'regular', parts: ['gaming', ['stat:charm', 0.4], ['speaking', 0.4]], base: 0.373, per: 0.05,
      win: HR(['{hub}: Blackbird challenges the sixth-ranked handle at the dojo and wins the first set. {npc} says "again" so quietly the room turns to look. She takes the second too. The board moves, and the whole room breathes out.', 'At the board at {hub} she works her way up four places in a night, one calm dismantling at a time. {npc} buys her a drink and a lecture on respect.'], { fame: 1.2, affinity: 3, train: [['gaming', 3], ['speaking', 1]], xp: 4, cash: [3, 20], thought: ['Fourth. Fourth is a good place to hide from the first.', 'The board is a map. I am a cartographer.'] }),
      lose: HR(['{hub}: she loses the first set in six minutes and the second in four. {npc} says "good game" like a form of surrender.', 'Blackbird challenges a handle at the dojo and the handle turns out to be a team of four. Her loss is, in the circumstances, quite respectable.'], { affinity: -1, train: [['gaming', 1.5]], xp: 2, thought: ['Four players. One handle. Technically fair.'] }) },
  }),
  hubRow({
    id: 'ranked-ladder-thread', where: { feature: ['forum_terminal', 'notice_board', 'whiteboard'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:persuasion', 'skill:streetwise', 'stat:charm'],
    sees: 'A forum thread titled "BEST PLAYER IN THE CITY?" with eight hundred replies, none of them civil.', stakes: 'An hour of posting; a ladder spot and an enemy.', consequence: 'Strangers have opinions of her.',
    drives: { pride: 0.5, curiosity: 0.2 }, bonus: 0.04, ok: hubOpen,
    check: { parts: ['gaming', ['persuasion', 0.5], ['streetwise', 0.4]], base: 0.43, per: 0.05,
      win: HR(['{hub}: Blackbird posts one calm paragraph in the thread, with a clip, and moves from "who?" to a rank. By the morning eleven people have invited her to a scrim and one has asked to be her rival.', 'In the thread at {hub} she settles a four-year dispute about frame data with a single link. The room, which is all in the room, reads it.'], { fame: 1, train: [['gaming', 2], ['persuasion', 1]], xp: 3, thought: ['A calm paragraph. It works on people who have never seen one.', 'Nine-hundred replies. Mine is the one they quote.'] }),
      lose: HR(['The thread at {hub} spends two hours on her one badly-phrased reply. Someone has made a meme of her name. It is a good meme.', 'Blackbird\'s post in the ladder thread at {hub} is quoted, mocked and archived. She decides it was a very productive exchange.'], { fame: -0.1, train: [['gaming', 0.5]], xp: 1, thought: ['I am a classic now. A classic mistake.'] }) },
  }),
  hubRow({
    id: 'game-deprogram', where: { variant: ['arcade', 'den', 'cafe', 'lockers', 'garage'], room: 'floor' }, pace: 'session',
    needs: ['skill:gaming', 'skill:analyze', 'drive:curiosity', 'skill:perception'],
    sees: 'A corner with a console where somebody is quietly playing the same level for the sixth hour, just to feel something.', stakes: 'An evening; a very specific feeling.', consequence: 'A regular who understands her.',
    drives: { curiosity: 0.4, pride: 0.2 }, bonus: 0.03, ok: hubOpen,
    check: { who: 'regular', parts: ['gaming', ['analyze', 0.5], ['perception', 0.4]], base: 0.48, per: 0.05,
      win: HR(['{hub}: she sits down beside {npc} and plays the level with them for an hour, not winning, not trying to. By the end {they} {is} breathing normally. The Titanware brochure on the wall has gone a bit limp.', 'Blackbird and {npc} play co-op at {hub} until three. Nobody says anything about anything. A quiet kind of help, and a high score.'], { affinity: 5, train: [['gaming', 2], ['analyze', 1]], xp: 3, cash: [2, 14], thought: ['Sometimes the best help is not to help. Sometimes it is a second controller.'] }),
      lose: HR(['{hub}: she tries to talk {npc} through the level and gets "I know" four times in a row. The second controller stays on the floor.', 'Blackbird plays the corner console at {hub} and loses very badly, very fast. {npc} wordlessly hands over a drink and takes the controller back.'], { affinity: -1, train: [['gaming', 1]], xp: 1, thought: ['I was not wrong. I was early.'] }) },
  }),
  hubRow({
    id: 'tournament-thread', where: { situation: ['ctf', 'auction', 'surge', 'party'] }, pace: 'session',
    needs: ['skill:gaming', 'skill:speaking', 'skill:analyze', 'drive:greed'],
    sees: 'A bracket projected on a wall, forty people in the room and a signup sheet that has become an argument.', stakes: 'A signup fee; the purse and the room.', consequence: 'Her name in a bracket, which people screenshot.',
    drives: { greed: 0.5, pride: 0.4 }, bonus: 0.06, ok: (w, v) => hubOpen(w, v) && w.hero.cash >= 8,
    check: { pay: 8, parts: ['gaming', ['speaking', 0.3], ['analyze', 0.5]], base: 0.336, per: 0.06,
      win: HR(['{hub}: a bracket, forty players, and Blackbird takes it in the final on a combo the commentator describes as "sort of disgusting". {amount}nd from the purse, a plastic trophy and a Joy sticker someone insists on.', 'She wins the tournament at {hub} without ever once looking at the screen, which people will say about her for weeks. {amount}nd, and a gap in the room where the losers used to be.'], { cash: [30, 130], fame: 1.8, train: [['gaming', 4], ['analyze', 1]], xp: 5, thought: ['Sort of disgusting. I will put that on a mug.', 'The final is just the first round with more people watching.'] }),
      lose: HR(['She goes out in round two at {hub} to somebody who looks about nineteen and eats while playing, and takes it as a compliment to her opponent.', 'Blackbird loses in the semis at {hub} and spends the final explaining to a stranger what the winner did wrong. The stranger is the winner.'], { train: [['gaming', 1.5]], xp: 2, thought: ['Third. A bronze is just a gold that has been to therapy.'] }) },
  }),
  hubRow({
    id: 'cabinet-save-state', where: { feature: ['arcade_cab', 'pinball'] }, pace: 'quick',
    needs: ['skill:gaming', 'stat:reflex', 'skill:perception', 'drive:greed'],
    sees: 'A cabinet that has been running the same game since last Tuesday and a stack of coins on the ledge, left by whoever is on a break.', stakes: 'A few coins; somebody else\'s credits and a very tense extra life.', consequence: 'Nobody minds, unless they do.',
    drives: { greed: 0.4, pride: 0.3 }, bonus: 0.04, ok: hubOpen,
    check: { parts: ['gaming', 'stat:reflex', ['perception', 0.3]], base: 0.42, per: 0.06,
      win: HR(['{hub}: she picks up a half-finished run on the cabinet, a stranger\'s three lives and a boss at half health, and finishes it. The owner of the credits comes back, looks at the board and says "huh". {amount}nd in credits goes to her.', 'Blackbird takes over somebody\'s run on the {hub} cabinet and ends it on the last life. A handle appears on the board that is not hers and not theirs. They split the credits.'], { cash: [6, 30], train: [['gaming', 2], ['perception', 0.5]], xp: 3, thought: ['The best part of a game is the middle. The worst part is the person who left.'] }),
      lose: HR(['She takes the stranger\'s three lives at {hub} and spends them in forty seconds. The owner is not back yet. She leaves a note. It says SORRY. It is in capitals.', 'Blackbird loses the half-finished run on the cabinet at {hub} and has to say so to a person who has been waiting for their turn all night.'], { train: [['gaming', 1]], affinity: -1, xp: 1, thought: ['It was already losing. It was losing before I got there.'] }) },
  }),
];

// The gym registers its rows from its own affordance files, so this one adds them itself; the others are spread into their register calls.
register('gym', GYM_GAMING);
