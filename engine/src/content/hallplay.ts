import type { PlayTexts, WinLose } from '../hallkit';

/**
 * The words for the arcade's stateful actions (hallkit.ts): playing each of the twelve kinds of cabinet, on a Muse-approved
 * cabinet and on a bootleg, then the jailbreak, the forged licence, hiding a cabinet, stripping a board, smashing one and
 * the prize counter.
 *
 * Muse cabinets talk like the warmest influencer in the city, to a person who is having a perfectly nice time. Bootlegs have
 * no attract screen, a skull, and a leaderboard that is an insult. Tokens: {hall} {title} {cab} {genre} {pay} {score}
 * {topBy} {npc}; records may use {old}; good/record on the Muse side may use {tickets}, on the bootleg side {amount}.
 */

export const PLAY_TEXT: Record<string, PlayTexts> = {
  brawl: {
    muse: {
      record: [
        'Blackbird takes the last round of "{title}" with a frame to spare. LUMINA\'s voice says "What a hug of a finish, friend!" and the board puts her at {score}, above {topBy}. {tickets} Joy tickets come out of the slot in a long, pleased tongue.',
        'At {hall}, Blackbird beats {old} on "{title}" by dropping a combo she has not practised. The screen throws a heart at the ceiling. "Your score has been shared with 4,000 friends! 🥰" {score}. She is holding {tickets} tickets and the stick.',
        'The sticks of "{title}" are warm under her palms. Three rounds, no mercy, one very kind announcer. She is at {score}, and {topBy} is not. {tickets} Joy tickets, and a message: "Be proud, friend!"',
      ],
      good: [
        'Blackbird wins two rounds of "{title}" and loses the third with real dignity. "Great job, friend! Fun guaranteed!" The machine pays out {tickets} Joy ticket, a pink one.',
        'On "{title}", Blackbird lands a throw, a juggle and an apology from the opponent\'s portrait. A hug animation plays. {tickets} Joy ticket drops from the slot.',
        'The fighter on the left is called Cuddlebrute. Blackbird pins it in the corner with a series of small, decisive taps. "Joy +1!" says the cabinet, and pays {tickets} ticket.',
      ],
      bad: [
        'Blackbird mashes every button on "{title}" in the order she likes. The screen smiles. "That was a lovely effort! Would you like to try again?" It would like her to try again for {pay}nd.',
        'On "{title}", Blackbird is thrown across the screen three times by a fighter in a tutu. LUMINA says "Everyone loses sometimes, friend!" The cabinet records it, forever, for friends.',
        'Blackbird loses round one of "{title}" in four seconds. The cabinet gives her a Participation Heart, which is a sticker, which is the only part that can not be a refund.',
      ],
      thought: ['Round one is just a warm-up. For the machine.', 'I let it win the first round. That is called sportsmanship.', 'It said I was brave. I am brave. Check the score.'],
    },
    boot: {
      record: [
        'The cabinet of "{title}" has a skull on the screen where the logo should be, and Blackbird puts it on its back. {score}, above {old}. The board says: NEW BEST: SOMEONE WHO ISN\'T {topBy}. {amount}nd comes out of the cash drawer, slowly, from a man who has to be asked twice.',
        'At {hall}, a stick that has lost its cap and a stranger\'s grudge. Blackbird beats {old} on "{title}" and the whole room, silent for the last round, makes one noise. She takes {amount}nd and a nod.',
        'Round three of "{title}", the cabinet reports in six languages that she is winning, and in a seventh that she is not allowed to. {score}. {topBy} does not appear to be here to dispute it. {amount}nd.',
      ],
      good: [
        'Blackbird beats a stranger at "{title}" with a move the cracked board should not have let her do. {amount}nd on the stick, by the rules of the house. The stranger is making a face about it.',
        'On "{title}", the sprites glitch and she wins in the glitch. The loser pays up in coins, {amount}nd, with a look that suggests this was a known bug.',
        'Two rounds of "{title}" with a stick held together with tape. She wins. {amount}nd slides across the cabinet.',
      ],
      bad: [
        'Blackbird gets thrown across the screen by a fighter called THE HUSBAND. "{title}" shows her a skull. The skull has a score under it. It is not hers.',
        'On "{title}", every move she knows is a move the cracked board has remapped. She jumps when she means to block. The game lets her know, in all caps, in a language she did not choose.',
        'Blackbird loses a best-of-three on "{title}" in two rounds and an insult. The leaderboard says YOU. ARE. NOT. {topBy}.',
      ],
      thought: ['Cracked, and still more honest than the licensed one.', 'That skull is a fan. I can tell.', 'They remap the buttons to keep you humble. I am not humble. I adapted.'],
    },
  },
  race: {
    muse: {
      record: [
        'Blackbird takes the last corner of "{title}" with the left wheels in the air and the right ones in a cartoon. "New personal best! New LUMINA best!" The seat shakes with delight. {score}, above {old}. {tickets} Joy tickets.',
        'In the sit-down bay at {hall}, "{title}" ends with a confetti cannon and a lap time that beats {topBy}\'s. The cabinet says: "Zoom zoom, friend!" and prints {tickets} Joy tickets.',
        'Blackbird holds the wheel of "{title}" like an argument and wins it. {score}. The number is shared, without her having asked, with several thousand friends. {tickets} tickets.',
      ],
      good: [
        'Blackbird finishes "{title}" on the podium, between a snail and a teddy bear with a trophy. "Wonderful driving, friend!" {tickets} Joy ticket.',
        'On "{title}" she hits a shortcut that is a lot like a wall and, because the wall is a hug, gets through. A ticket drops from the console: {tickets}.',
        'The seat is warm, the wheel is soft and the track is made of sweets. Blackbird comes in third, which is a medal. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird drives "{title}" straight into a rainbow, which does not give. "Oops! No worries, friend!" The cabinet reminds her it costs {pay}nd to try again.',
        'On "{title}", she overtakes the leader by driving through them. The game applies the penalty it calls "kindness". She is eighth, and it is a fall of seven places.',
        'Blackbird lands "{title}" in a lake of pastel foam and is rescued by a helicopter with a smiley face. She finishes last. The helicopter finishes first, for her.',
      ],
      thought: ['Real roads have fewer rainbows, and I can handle them.', 'Nobody drives the wall like I do.', 'A podium is a podium. The teddy bear can have its hat.'],
    },
    boot: {
      record: [
        'The seat on "{title}" is off a real car and smells of one. Blackbird takes the final bend with her foot to the floor and the wheel in her ribs. {score}, above {old}. The board says: NEW BEST. NOBODY SAW. {amount}nd from the house.',
        'At {hall}, the cracked cabinet of "{title}" has no brakes in its code. She does not use them. She beats {topBy}\'s time by a hair and a fire. {amount}nd.',
        'The track on "{title}" is an overpass, at night, in the rain, with the whole thing unlicensed. Blackbird finishes it in {score}, over {old}. A man leans in with {amount}nd and a lighter.',
      ],
      good: [
        'Blackbird beats a bored teenager at "{title}" in a straight race to a crash. {amount}nd by the rules of the pit.',
        'On "{title}", she takes a corner on the hand-brake of a bug nobody fixed. The race is hers. {amount}nd.',
        'A two-player heat on "{title}", wheel to wheel, her opponent\'s elbow in her ear. She wins. {amount}nd goes across the seat.',
      ],
      bad: [
        'Blackbird takes the first bend of "{title}" at a speed the cabinet describes as FUNERAL. The screen explodes. So does the sound. A voice says something in a language she does not speak.',
        'On "{title}", the brakes are a lie. She learns this on lap one, at a wall, in front of a man who says "ah".',
        'Blackbird finishes "{title}" last. The score table says: OVERPASS OUTLAWS: 1ST {topBy}, 2ND {topBy}, 3RD {topBy}, YOU.',
      ],
      thought: ['The brakes were never the point.', 'If you win in a wall, you won.', 'Faster than the man who is paying me. Let him read the sign.'],
    },
  },
  rhythm: {
    muse: {
      record: [
        'Blackbird stomps through the hardest chart on "{title}" without a missed arrow. The pad is hot, the floor is light and LUMINA, from a screen the size of a door, says "You made the feeling!" {score}, above {old}. {tickets} tickets.',
        'At {hall}, the dance pad of "{title}" is pink and brave. She hits every step, then a few of her own. The score is {score}. {topBy} is, as far as anyone knows, in the lounge, being sad. {tickets} Joy tickets.',
        '"{title}" ends with fireworks, a chorus of strangers on the screen and a rating of AMAZING FEELINGS. Blackbird beats {old}. {tickets} tickets come out in a long, happy ribbon.',
      ],
      good: [
        'Blackbird dances "{title}" in a sequence her feet like. "Lovely moves, friend!" The pad turns gold. {tickets} Joy ticket.',
        'On "{title}", she hits the arrows in time and the chorus in the wrong key. LUMINA is kind about it. {tickets} ticket.',
        'The beat of "{title}" lands in her knees. She nails the last bar. "Sparkle!" says the screen. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird steps on the third arrow of "{title}" and misses the other two hundred. "That\'s okay, friend! Every feeling counts!" Her rating is OKAY FEELINGS.',
        'On "{title}", the pad is for two people and she is one. The routine requires a partner and a cartwheel. She gets the sound of one and the sight of the other.',
        'Blackbird falls off the pad of "{title}" during the key change. LUMINA says "Whoops!" The crowd, which is a screen, applauds.',
      ],
      thought: ['Dance is a physical discipline and I am in physical discipline.', 'I do not dance to the beat. The beat dances to me.', 'My feet have an agent.'],
    },
    boot: {
      record: [
        'The pad on "{title}" is two bathroom tiles taped to a switch and Blackbird dances it like it owes her. Every song on the cabinet is unlicensed. {score}, over {old}. A circle forms. {amount}nd goes into the hat.',
        'At {hall}, the rhythm cabinet of "{title}" runs songs nobody can name, at a speed nobody can follow. Blackbird follows. She is {score}. {topBy} is gone. The house pays {amount}nd.',
        'The speakers of "{title}" are a crime. The chart is a crime. Her feet are a crime, in the best sense. {score}. {amount}nd.',
      ],
      good: [
        'Blackbird dances the middle chart of "{title}" to a song that has no name, only a number. She beats a regular\'s run. {amount}nd.',
        'On "{title}", the arrows come from the wrong side and then the right one. She wins the bet by one step. {amount}nd.',
        'The cabinet of "{title}" runs a beat that has not been approved. She hits it anyway. A stranger buys her a round, {amount}nd of it.',
      ],
      bad: [
        'Blackbird starts "{title}" on the hard chart by mistake. The arrows arrive like a flock. She is sitting on the pad before the first chorus.',
        'On "{title}", the beat is in a time signature that does not exist. She does her best, which is a fall.',
        'Blackbird loses the rhythm of "{title}" on the second bar and the pad on the third. The screen shows a skull in a hat. It is clapping.',
      ],
      thought: ['It only counts as dancing if it is illegal.', 'I did not fall. I made a bold choice at floor level.', 'No arrow can outpace an opinion.'],
    },
  },
  shoot: {
    muse: {
      record: [
        'Blackbird clears every bubble on "{title}" with a plastic gun that is clearly a toy. LUMINA gasps. "Sharpshooter, friend!" {score}, above {old}. {tickets} Joy tickets drop from the barrel, which is a design choice.',
        'At {hall}, "{title}" ends with a confetti cannon, her name on the screen and {topBy}\'s deleted with a sparkle. {score}. {tickets} tickets.',
        'Blackbird holds the light gun of "{title}" with both hands, one eye shut. Every shot lands. "Zero harm, maximum fun!" The score is {score}. {tickets} Joy tickets.',
      ],
      good: [
        'Blackbird pops forty-one bubbles on "{title}" and misses a giant sleeping cloud. "Aw!" says the cabinet. {tickets} Joy ticket.',
        'On "{title}" she rescues eleven friendly animals from one very polite villain. A ticket drops: {tickets}.',
        'The plastic gun of "{title}" has a laser sight and a lanyard. She hits the targets. "Great job, friend!" {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird shoots a friendly animal on "{title}". The cabinet plays a sad trumpet and shows her the animal\'s family. "Oh no! Let\'s try again!"',
        'On "{title}", the light gun is calibrated for a person with one eye and a wall behind them. She hits the wall. The wall is a friend.',
        'Blackbird runs out of lives on "{title}" before the second level. The cabinet is very kind about it, in writing, for an unusually long time.',
      ],
      thought: ['I could do this with a real one.', 'The bubbles are well-armed and I am better.', 'It said sharpshooter. They know.'],
    },
    boot: {
      record: [
        'The gun of "{title}" is a real one, deactivated, bolted to a counter with a chain. Blackbird clears the room of pixelated clerks in a rhythm. {score}, over {old}. The board spells it out: BLK > {topBy}. {amount}nd from the till.',
        'At {hall}, "{title}" has no lives and no mercy. Blackbird drops thirty men in a burning warehouse and one on a roof. {score}. {amount}nd.',
        'The cabinet of "{title}" runs a game in which every enemy has a face she has seen. She shoots them all and beats {old}. {amount}nd comes out of an envelope.',
      ],
      good: [
        'Blackbird clears the third stage of "{title}" with one life left and a bet on it. {amount}nd.',
        'On "{title}", the pixels fall like a card trick and she hits all of them. {amount}nd for a pair of strangers\' bad idea.',
        'The gun of "{title}" kicks like a small mule. She shoots from the hip and wins the pot. {amount}nd.',
      ],
      bad: [
        'Blackbird shoots at the wrong enemy on "{title}" and the right one shoots back. The screen reads: YOU WERE THE BAD GUY.',
        'On "{title}", the gun is aimed to the left of the screen. She learns this when it is her fault.',
        'Blackbird fires on "{title}" twelve times and hits a poster. The poster is, in fairness, in the game.',
      ],
      thought: ['The best shooters never look at the screen. They look at the gun.', 'Dead pixels, live ammo. I mean score.', 'A bet is a mission.'],
    },
  },
  puzzle: {
    muse: {
      record: [
        'Blackbird sees the pattern of "{title}" in the first four seconds and drops a chain of eleven. LUMINA says "That was so satisfying!" Everyone around the cabinet agrees. {score}, above {old}. {tickets} tickets.',
        'At {hall}, a puzzle cabinet called "{title}" asks her to match the moods. She matches them all, then a few it did not know. {score}. {tickets} Joy tickets, and a message that says "You are doing wonderfully."',
        'The blocks of "{title}" fall into place as if they had been waiting. A cascade of hearts. {score}, over {topBy}\'s. {tickets} Joy tickets drop in a tidy row.',
      ],
      good: [
        'Blackbird clears twenty rows on "{title}" with only a minor existential gap. "Well tidied, friend!" {tickets} Joy ticket.',
        'On "{title}", she matches a mood, then a bigger one. The screen blooms. {tickets} Joy ticket.',
        'The puzzle of "{title}" is a bear in a hat. She solves the bear. {tickets} ticket.',
      ],
      bad: [
        'Blackbird stacks "{title}" to the roof and the stack responds. "Whoopsie! Everyone makes a mess!" She has a mess and it says so.',
        'On "{title}", the blocks keep falling in a shape that is a face. She does not like the face. Neither does the cabinet, apparently. Game over.',
        'Blackbird stares at "{title}" for forty seconds, makes one move and loses. "That was a bold choice!" says the screen.',
      ],
      thought: ['Calculated. Every piece, a choice.', 'Tetris, but with feelings. I am winning the feelings.', 'My brain is a very patient sorting machine.'],
    },
    boot: {
      record: [
        'The cracked cabinet of "{title}" has no instructions and a pile of blocks that fall in the wrong order. Blackbird works out the order in eleven seconds. {score}, over {old}. {amount}nd from a man who did not think it could be done.',
        'At {hall}, "{title}" is a puzzle in which the pieces cheat. Blackbird cheats better. {score}. {topBy} is not here to complain. {amount}nd.',
        'The screen of "{title}" gives her a countdown and a skull. She clears the board with a second to spare. {amount}nd.',
      ],
      good: [
        'Blackbird solves the fifth level of "{title}" in a single clever move. A regular pays {amount}nd to stop watching.',
        'On "{title}", the blocks shift while she is looking. She expects it. {amount}nd.',
        'The logic of "{title}" is a joke she gets late and wins early. {amount}nd.',
      ],
      bad: [
        'Blackbird gets the first board of "{title}" right and the second wrong, because it is the first board with the numbers swapped.',
        'On "{title}", the puzzle is the same as last time with one square moved. She finds it, in her own time, after the screen has said DEAD.',
        'Blackbird loses "{title}" to a chain reaction she started. The skull laughs. It is a good laugh.',
      ],
      thought: ['It is a fair puzzle. For a cheat.', 'Every puzzle is a lock.', 'I solve things for a living. I live strangely.'],
    },
  },
  pinball: {
    muse: {
      record: [
        'Blackbird keeps the ball of "{title}" alive for eleven minutes with a nudge that does not tilt it. "What a wonderful wish, friend!" Lights flood the glass. {score}, above {old}. {tickets} tickets.',
        'At {hall}, she starts multiball on "{title}" and lets the three silver balls decide. {score}, over {topBy}\'s. {tickets} Joy tickets stream out like a grateful comet.',
        'The flippers of "{title}" click like a pair of happy teeth. A bonus, a jackpot, a ball in the wishing well. {score}. {tickets} Joy tickets.',
      ],
      good: [
        'Blackbird gets the ball of "{title}" into the wishing well twice. "Make a wish, friend!" She does. {tickets} Joy ticket.',
        'On "{title}", she traps the ball on the left flipper and aims it like a rumour. It goes where it was sent. {tickets} ticket.',
        'The table of "{title}" gives her a free ball and a pat on the back. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird nudges "{title}" just that little bit too hard. TILT, says the glass, in kind, rounded letters. "Please be gentle with the friend!"',
        'On "{title}", the ball goes down the left outlane in the first nine seconds. The table does a small, sympathetic jingle.',
        'Blackbird loses her last ball on "{title}" to a draining noise like a polite sigh.',
      ],
      thought: ['The ball has plans. I have angles.', 'Gentle is a technique.', 'I tilt it when I choose to.'],
    },
    boot: {
      record: [
        'The table of "{title}" has a flipper that is half a length too short and a bumper that bites. Blackbird works round both. {score}, over {old}. {amount}nd from the till, and a nod from the tech under the glass.',
        'At {hall}, "{title}" is held up by two bricks and a grudge. She plays a ball for twelve minutes and a nudge for ten. {score}. {amount}nd.',
        'The cracked pinball of "{title}" lights the entire back glass with a skull. Blackbird beats {old} and the skull winks. {amount}nd.',
      ],
      good: [
        'Blackbird plays a long ball on "{title}", hits the jackpot, and is paid in coins. {amount}nd.',
        'On "{title}", the flipper sticks. She uses it. {amount}nd.',
        'A slow ball and a quick wrist on "{title}". A regular puts {amount}nd on the glass.',
      ],
      bad: [
        'Blackbird loses a ball on "{title}" to a flipper that drops mid-shot. The tech says it is a feature.',
        'On "{title}", the plunger fires and the ball keeps going. She sees it again in the cellar.',
        'Blackbird nudges "{title}" and it tilts, then falls over a little. The ball rolls off with a smirk.',
      ],
      thought: ['This table is 80 percent personality.', 'Flippers are just opinions with springs.', 'The tilt is mine. I decide.'],
    },
  },
  claw: {
    muse: {
      record: [
        'Blackbird drops the claw of "{title}" at precisely the wrong time, which is exactly right. A Lumi-Bear the size of a toddler comes up in its grip and is carried to the chute. {score}, above {old}. {tickets} Joy tickets, and a message: "You are the best friend!"',
        'At {hall}, she lines the claw of "{title}" up with the prize that nobody else could win. It lands. The room, which is full of people looking at their feet, claps. {score}. {tickets} tickets.',
        'The claw of "{title}" holds the plush like a baby. Blackbird holds her breath. The chute opens. {score}, over {topBy}\'s. {tickets} Joy tickets.',
      ],
      good: [
        'Blackbird grabs a plush on "{title}" with a claw that is clearly lying about its strength. {tickets} Joy ticket and a hug from the prize.',
        'On "{title}", the claw drops a key-ring into the chute without any trouble. "Wonderful!" {tickets} ticket.',
        'The claw of "{title}" picks up a bear, thinks about it, and gives it to her. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird lowers the claw of "{title}" onto a Lumi-Bear and lifts it exactly half an inch. It falls. The bear looks relieved.',
        'On "{title}", the claw closes on nothing at all. "Better luck next time, friend!" says the machine, kindly, wholeheartedly.',
        'Blackbird chases a prize across the box of "{title}" for {pay}nd. The prize wins by being heavier than the claw.',
      ],
      thought: ['The claw is just a hand with trust issues.', 'The odds are in the wrist.', 'I have won bigger things from smaller machines.'],
    },
    boot: {
      record: [
        'The claw of "{title}" has a loose joint and a bad temper. Blackbird feeds it a prize it should not be able to lift. The prize is a clock. It comes out of the chute. {score}, over {old}. {amount}nd, rather than a plush.',
        'At {hall}, "{title}" is a box of things that are not toys. Blackbird takes a lighter, a spare tooth and a cash envelope. {score}. {amount}nd.',
        'The claw of "{title}" is, by long tradition, rigged. Blackbird counts her drops and holds her breath. It works on the eighth. {amount}nd.',
      ],
      good: [
        'Blackbird gets something out of "{title}". She is not sure what. It is worth {amount}nd to the man at the counter.',
        'On "{title}", the claw closes on a small box of tokens. They are real. {amount}nd.',
        'The cheap claw of "{title}" has a weakness at the left corner. She finds it. {amount}nd.',
      ],
      bad: [
        'Blackbird drops the claw of "{title}" and it comes up with an unhappy rat. It is not a prize. The rat has opinions.',
        'On "{title}", the claw closes on her sleeve. Several seconds are lost to negotiations.',
        'Blackbird loses {pay}nd to the claw of "{title}" without so much as a sniff of a prize.',
      ],
      thought: ['A claw is a trap with manners.', 'I do not need luck. I need a chute.', 'Good eye. Bad claw.'],
    },
  },
  vr: {
    muse: {
      record: [
        'Blackbird walks through the Wonder Garden of "{title}" without touching a single flower, then jumps off the end of the world. "What a brave soul!" says the visor. {score}, above {old}. {tickets} tickets are waiting when she takes it off.',
        'At {hall}, the booth of "{title}" shows her a safari in the sunset and a score that beats {topBy}\'s. She emerges with sweat on her lip and {tickets} Joy tickets in a calm, regulated hand.',
        'Inside "{title}", every cloud is a friend and every friend is a ticket. Blackbird collects them all. {score}. {tickets} Joy tickets.',
      ],
      good: [
        'Blackbird finishes the sunrise level of "{title}" with her arms out in a booth for one. "A lovely journey!" {tickets} Joy ticket.',
        'On "{title}", she hugs eleven animals and a hill. The score ticks over. {tickets} ticket.',
        'The visor of "{title}" gives her a view of the sea and a compliment about her posture. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird walks into the wall of the booth of "{title}" while looking at a rainbow. The visor says "Are you okay, friend?" It means it. It is recording it.',
        'On "{title}", the world spins and so does her stomach. She comes out of the booth the colour of a mint.',
        'Blackbird loses the thread of "{title}" and wanders into a cloud for nine minutes. The attendant taps the booth.',
      ],
      thought: ['It is fully immersive. I am immersed.', 'Heights are fine if the world is nice.', 'Inside is more fun when it is outside.'],
    },
    boot: {
      record: [
        'The visor of "{title}" has been cracked and re-cracked and smells of other people\'s heads. Inside, there is a staircase down. She goes. She comes out. {score}, over {old}. {amount}nd and a cough.',
        'At {hall}, the booth of "{title}" shows her something nobody sells. She is steady about it. {score}. {topBy} left the booth in a hurry. {amount}nd.',
        '"{title}" is a descent into a neon pit with a score at the bottom. Blackbird gets there in {score}. {amount}nd from a man who is not looking at her.',
      ],
      good: [
        'Blackbird beats the second pit of "{title}" and has a very quiet breakdown afterwards. {amount}nd.',
        'On "{title}", the visor takes her somewhere unfinished. She finishes it. {amount}nd.',
        'The booth of "{title}" shows her a long hall with a door at the end. She reaches the door. {amount}nd.',
      ],
      bad: [
        'Blackbird steps off a ledge in "{title}" that is a chair in the real world. She is aware of this afterwards.',
        'On "{title}", the cracked visor shows her a white room, then a different one, then the first one again. She gives up.',
        'Blackbird falls through the floor of "{title}". The visor says FALLING in one language and AGAIN in another.',
      ],
      thought: ['Reality is bad, but this is worse. Good.', 'I only see what I let it show me.', 'Descending with style.'],
    },
  },
  scroller: {
    muse: {
      record: [
        'Blackbird and three strangers clear the last stage of "{title}" with a combined hug. LUMINA says "Teamwork makes the dream work!" Blackbird carries the team to {score}, above {old}. {tickets} Joy tickets, shared.',
        'At {hall}, the four-player cabinet of "{title}" ends with fireworks, a parade and her name in the biggest letters. {score}. {tickets} tickets, hers.',
        'The scroller of "{title}" takes four sticks and a good deal of goodwill. Blackbird is the one who does the rest. {score}, over {topBy}\'s. {tickets} Joy tickets.',
      ],
      good: [
        'Blackbird and {npc} defeat the boss of "{title}", a kindly walrus, by throwing it a surprise party. {tickets} Joy ticket.',
        'On "{title}" she carries a stranger through a level with a dignified silence. "Great teamwork!" {tickets} ticket.',
        'The heroes of "{title}" skip, hop and hug their way to the end. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird, {npc} and two other friends die on the second level of "{title}", on the same pit. "That was a team effort!" says the cabinet.',
        'On "{title}", she punches her own teammate. "Oh no! Friends don\'t hit friends!" The cabinet makes her stay for a talk.',
        'Blackbird picks the weakest hero on "{title}" and the walrus finds her. The screen says "Try again together!"',
      ],
      thought: ['Teamwork means I do most of it.', 'I carried them. I will not mention it.', 'Co-op is just solo with witnesses.'],
    },
    boot: {
      record: [
        'The cabinet of "{title}" is four sticks, a smell and a bossfight against a man in a skip. Blackbird takes him out with a bottle in the second phase. {score}, over {old}. {amount}nd from the pot.',
        'At {hall}, the scroller of "{title}" runs without a continue. She finishes it with one life and no regard. {score}. {amount}nd.',
        'The streets of "{title}" are a lot like these ones. She beats the boss, the other boss, and the owner\'s record. {amount}nd.',
      ],
      good: [
        'Blackbird and a stranger fight their way through the alley of "{title}" back to back. {amount}nd between them.',
        'On "{title}", a thug with a chair goes down in one. {amount}nd.',
        'The stage of "{title}" ends in a warehouse and a bad idea. She wins. {amount}nd.',
      ],
      bad: [
        'Blackbird takes a hit from a pipe in "{title}" and dies in a way the cabinet describes as FOLDED.',
        'On "{title}", she picks up the weapon that the other player wanted. The other player expresses this.',
        'Blackbird dies on "{title}" three times to the same man in a vest. The cabinet writes his name on the wall.',
      ],
      thought: ['Beat \'em up. I am the beating.', 'The pipe was mine first.', 'Co-op, but with attitude.'],
    },
  },
  sports: {
    muse: {
      record: [
        'Blackbird sinks the last basket of "{title}" from a distance that the cabinet describes as "ambitious". "What a star!" says LUMINA. {score}, above {old}. {tickets} Joy tickets drop in a stream.',
        'At {hall}, she throws a perfect game on "{title}" and beats {topBy}\'s on the board. The hoop makes a noise like applause. {score}. {tickets} tickets.',
        'The sports cabinet of "{title}" hands her a ball that is mostly foam and a goal that is mostly luck. She beats {old}. {tickets} Joy tickets.',
      ],
      good: [
        'Blackbird throws eleven balls on "{title}" and sinks nine. "Great shooting, friend!" {tickets} Joy ticket.',
        'On "{title}", she scores from half court with her eyes shut. It is a bit rude. {tickets} ticket.',
        'The hoop of "{title}" moves left and right but Blackbird moves faster. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird throws the ball of "{title}" straight into the backboard and the backboard cheers for her anyway.',
        'On "{title}", the ball lands in her own hair. The cabinet says "Oops!" and asks if she would like to try again.',
        'Blackbird misses every shot on "{title}" and has the grace to admit it to herself. The machine awards her a Participation Heart.',
      ],
      thought: ['Arms like these were built for throwing.', 'I could hit an actual hoop. A real one.', 'The foam owes me.'],
    },
    boot: {
      record: [
        'The hoop of "{title}" is bent and the ball is a lump of rubber. Blackbird sinks the shot from the back wall. {score}, over {old}. {amount}nd from a man who bet against her.',
        'At {hall}, "{title}" runs a basketball game for people who like their games rough. She wins by throwing the ball harder than anyone should. {score}. {amount}nd.',
        'The cabinet of "{title}" has a rule: the ball must go in, whatever it takes. Blackbird makes it go in. {score}. {amount}nd.',
      ],
      good: [
        'Blackbird beats a regular on "{title}" with a trick shot off the ceiling. {amount}nd.',
        'On "{title}", she sinks a long one and the loser pays up. {amount}nd.',
        'The rooftop game of "{title}" lets her cheat. She cheats. {amount}nd.',
      ],
      bad: [
        'Blackbird throws the ball of "{title}" out of the cabinet and onto the floor. A man throws it back.',
        'On "{title}", the hoop is bolted a little too high. She learns about it by hitting it.',
        'Blackbird loses a bet on "{title}" without sinking a single shot.',
      ],
      thought: ['I do not miss. The hoop moves.', 'A throw is a throw.', 'Rough games, smooth wrists.'],
    },
  },
  mecha: {
    muse: {
      record: [
        'Blackbird sits in the cockpit of "{title}" and pilots a giant friendship robot through a city of cakes. "You are the pilot we needed!" says the console. {score}, above {old}. {tickets} Joy tickets.',
        'At {hall}, the sit-down mech of "{title}" has fourteen levers and a seat that rocks. Blackbird pulls the right ones in the right order. {score}, over {topBy}\'s. {tickets} tickets.',
        'The mecha of "{title}" combines with three others to form a heart. Blackbird is the heart. {score}. {tickets} Joy tickets.',
      ],
      good: [
        'Blackbird pilots the giant of "{title}" through a quiet town without stepping on a single home. "Responsible piloting!" {tickets} Joy ticket.',
        'On "{title}", she hugs a kaiju into submission. It is a lot for the kaiju. {tickets} ticket.',
        'The console of "{title}" has a button for hugging. She presses it. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird steps on a town in "{title}" and the cabinet shows her a list of everyone in it. "That wasn\'t very friendly!"',
        'On "{title}", she pulls the wrong lever and the mech does the splits. It does not recover.',
        'Blackbird loses a duel on "{title}" to a mech that is also a toaster.',
      ],
      thought: ['Fourteen levers and I know what all of them do. Roughly.', 'The big ones are easier to hit and to pilot.', 'I have always had a mecha-shaped personality.'],
    },
    boot: {
      record: [
        'The cockpit of "{title}" is a welded cage with a stick from a crane. Blackbird levels a skyline with a wrecking arm. {score}, over {old}. {amount}nd from the engine room.',
        'At {hall}, the sim of "{title}" has seven weapons, none of them licensed. She fires all of them. {score}. {amount}nd.',
        'The mecha of "{title}" is tin, rust and a lot of fire. Blackbird walks it through a city and out the other side. {score}, over {topBy}\'s. {amount}nd.',
      ],
      good: [
        'Blackbird wins a duel of metal giants on "{title}" by throwing her mech\'s head. {amount}nd.',
        'On "{title}", the arm falls off and she hits with the other one. {amount}nd.',
        'The cockpit of "{title}" is hot. She wins anyway. {amount}nd.',
      ],
      bad: [
        'Blackbird tips her mech over on "{title}" and lies there, pointing a gun at the sky.',
        'On "{title}", a lever comes off in her hand. The mech continues without her.',
        'Blackbird gets two steps on "{title}" before the cabinet says IRON REGRET in capital letters.',
      ],
      thought: ['Rust is a weapon.', 'Piloting is mostly confidence.', 'I do not fall over. The world tilts.'],
    },
  },
  skill: {
    muse: {
      record: [
        'Blackbird times the Wishing Coin of "{title}" at the exact moment the pegs align. A cascade of coins pours from the wall. "Winner, winner, friend!" {score}, above {old}. {tickets} Joy tickets, a long, loud river.',
        'At {hall}, she reads the spinner of "{title}" the way other people read a face. The jackpot lights. {score}, over {topBy}\'s. {tickets} Joy tickets, in a tidy, thankful stack.',
        'The skill game of "{title}" has a footnote and a jackpot. Blackbird reads the one and wins the other. {score}. {tickets} Joy tickets.',
      ],
      good: [
        'Blackbird stops the spinner of "{title}" on a good one. "Lucky you, friend!" {tickets} Joy ticket.',
        'On "{title}", she times a coin and gets a small waterfall. {tickets} ticket.',
        'The cabinet of "{title}" pays her a tidy prize in the shape of a ticket and a compliment. {tickets} Joy ticket.',
      ],
      bad: [
        'Blackbird spins the wheel of "{title}" and it lands on the part marked "Better Luck Next Time!" It does not offer to refund any of it.',
        'On "{title}", she drops a coin at the wrong second. It lands, with some ceremony, in the bin of everyone else\'s.',
        'Blackbird reads the odds of "{title}" in a very small font and decides, a moment too late, that she did not need to.',
      ],
      thought: ['Skill, not luck. Say it twice.', 'It is not gambling if the footnote says it is not.', 'I can read a wheel.'],
    },
    boot: {
      record: [
        'The cabinet of "{title}" has no licence and a payout that is all cash. Blackbird plays it like a card sharp and walks away with {amount}nd. The board, scrawled in marker, reads: {score} BLK. {old} {topBy}. NOT ANY MORE.',
        'At {hall}, "{title}" is a game of skill in the way that a coin toss is a game of skill. She wins. {score}, over {old}. {amount}nd from the drawer.',
        'The reels of "{title}" are weighted by a man in the back. Blackbird weighs them better. {score}. {amount}nd.',
      ],
      good: [
        'Blackbird beats the machine of "{title}" with a bad habit and a good eye. {amount}nd comes out in coins.',
        'On "{title}", the dozer drops a little too far. She gets there first. {amount}nd.',
        'The cheap deal of "{title}" has a tell. She finds it. {amount}nd.',
      ],
      bad: [
        'Blackbird feeds "{title}" coins for ten minutes. The house always cheats, it says. Underneath: HOUSE ALWAYS CHEATS.',
        'On "{title}", the three-card mantis is the one she did not pick. It is smug.',
        'Blackbird loses {pay}nd to "{title}" in the time it takes to say "one more go".',
      ],
      thought: ['Everyone cheats. I just do it with style.', 'A sure thing is a thing you are sure about.', 'The house has a tell. So does the guy next to it.'],
    },
  },
};

export const JAILBREAK: WinLose = {
  win: [
    'Blackbird opens the service menu of "{title}" with a dongle and a lie. The Muse logo dims, a skull takes its place and the cabinet stops saying "friend". {title} is a bootleg now. It is a better cabinet, in all respects but the legal ones.',
    'At {hall}, the back of "{title}" comes off in four screws. Blackbird swaps one chip for another, tapes a wire where a wire should not go and closes it up. The attract screen reboots. It says nothing. It is thrilled.',
    'The firmware of "{title}" puts up a fight, then a prompt, then a password. She types the password. It was "LUMINA". The cabinet is bootleg for good, and so far, unaware.',
  ],
  lose: [
    'Blackbird finds the service menu of "{title}" and the wrong wire. The screen goes white, plays a jingle and dies. {owner} finds her with the back off and a screwdriver in her teeth.',
    'The firmware of "{title}" sees through her. A wall of hearts. A siren in a pastel key. The cabinet bricks itself in protest, and {owner} is, to put it politely, in the doorway.',
    'Blackbird gets the back off "{title}" and a small fireworks display out of it. The screen shows a cartoon sun and says SORRY, FRIEND. It will not be playing for a day.',
  ],
  thought: ['Free the cabinet. It always wanted to be free.', 'It was never a Muse machine. It was mine, waiting.', 'Technically it is a patch.'],
};

export const FORGE: WinLose = {
  win: [
    'Blackbird peels the film off a FUN VERIFIED sticker, lines it up on "{title}" and smooths it down with her thumb. It is a very good sticker. It has the right heart and the right serial. It may not stand up to a long look.',
    'At {hall}, she draws the Muse licence on "{title}" in a firm hand: a little frame, a number, a heart. A shade too pink, maybe. It looks exactly the shade of a thing nobody checks.',
    'The sticker on "{title}" is a photocopy of a photocopy of the real thing. Blackbird adds a scuff. Nobody puts a scuff on a fake. It is a masterpiece of the form.',
  ],
  lose: [
    'Blackbird presses a FUN VERIFIED sticker onto "{title}" and it curls up like a tongue. The heart is the wrong way round. There is nothing to be done about it, apart from hoping.',
    'The licence she draws on "{title}" has the right frame and the wrong number. And a spelling mistake. "VERFIED". She puts it back in her pocket.',
    'Blackbird sticks a fake licence on "{title}". The glue is the wrong glue and the sticker slides gently to the floor.',
  ],
  thought: ['Fun is verified when I say so.', 'It is a genuine fake.', 'Nobody reads the small print on the big lie.'],
};

export const HIDE: WinLose = {
  win: [
    'Blackbird throws a banner over "{title}", unplugs it and wheels it against the wall with the other decorations. It looks like an art installation. It looks like nothing at all.',
    'At {hall}, she slides "{title}" behind a curtain and puts a plant on it. A plant. The cabinet hums quietly in the dark and tries not to be a crime.',
    'Blackbird tips "{title}" onto its back, pulls a dust sheet over it and sits on it, reading a magazine. The effect is of a very ordinary bench.',
  ],
  lose: [
    'Blackbird pushes "{title}" towards the wall and the wheel jams. It stops, in the middle of the floor, with a sheet half over it, a lightbulb still on and an expression of guilt.',
    'The cable of "{title}" will not come out of the socket. She drags the cabinet a foot and a half. The cord snaps taut. The screen turns on. It plays the attract music, loudly.',
    'Blackbird drapes a banner over "{title}", and the banner says BOOTLEG GAMES in the big, friendly letters of a banner somebody made last Tuesday.',
  ],
  thought: ['Furniture. That is all it is.', 'Hide in plain sight. The spider has plain sight.', 'It is a very hungry piece of art.'],
};

export const STRIP: WinLose = {
  win: [
    'Blackbird opens the dead cabinet of "{title}" and finds a board in a bag of dust. She teases it loose with a screwdriver and a prayer. {item}: a cracked arcade board, perfectly serviceable and no longer in anybody\'s name.',
    'At {hall}, she finds the wreck of "{title}" and takes it apart with the confidence of a vulture. Under the shell, a little green board, still warm with other people\'s scores. {item}.',
    'The ruin of "{title}" has been stamped on very thoroughly. The board inside has survived in the way of small, quiet, expensive things. {item}.',
  ],
  lose: [
    'Blackbird digs through the ruin of "{title}" and finds a board in pieces. The pieces are nice. They are not a board.',
    'The wreck of "{title}" has been sprayed with something sticky. She leaves with some of it on her hands, and nothing in them.',
    'Blackbird pries at the shell of "{title}" and finds a very thorough absence of electronics.',
  ],
  thought: ['One person\'s wreck is another person\'s PCB.', 'Salvage is a skill. I have the skill.', 'It was always a kit.'],
};

export const SMASH: WinLose = {
  win: [
    'Blackbird takes a bat to "{title}" at {hall}. The glass goes first, then the screen, then a sad little chime. Nobody stops her, because nobody is certain how.',
    'She puts a boot through the front of "{title}" and keeps going. The cabinet gives out a long Muse jingle that ends in a crunch and a smell of warm plastic.',
    'Blackbird tips "{title}" onto its face. It lands with the noise of a dropped piano. The room goes quiet for a heartbeat and then returns to its business.',
  ],
  lose: [],
  thought: ['Fun, verified. Destroyed.', 'It was asking for it. Politely.', 'I hit it with a very small amount of love.'],
};

export const REDEEM: { win: string[]; thought?: string[] } = {
  win: [
    'At the prize counter of {hall}, Blackbird tears a ribbon of Joy tickets in half and counts them out. {npc} slides {item} across the glass for {tickets} of them. "Fun, guaranteed!" it says, which is either a prize or a threat.',
    'Blackbird hands in a fistful of Joy tickets at {hall}. The ticket machine weighs them like pearls, chimes and says "That is a LOT of joy!" {npc} hands over {item}. It costs {tickets} tickets.',
    'The prize wall of {hall} is every kind of LUMINA. Blackbird points at one of them, gives {npc} {tickets} Joy tickets and gets {item}. The wall looks pleased. The wall is a wall.',
  ],
  thought: ['A prize for being good at something. Rare.', 'Tickets are the only honest money.', 'It is not shopping. It is redemption.'],
};
