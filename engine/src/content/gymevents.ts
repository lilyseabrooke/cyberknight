import { register, type Affordance } from '../affordances';
import { fight, gainXp } from '../combat';
import { addSore, banned, find, ladderFighters, say, type GymView } from '../gymkit';
import { skillLevel, train } from '../skills';
import { fameFrom } from '../stage';
import { SKILLS } from './skills';
import { R, row } from './gymafford';

/**
 * What is happening here today (situations, content/gyms.ts), the wild cards (one gym in twelve), and the things only
 * certain kinds of gym offer. Situations are a pure function of the clock, so these rows switch on and off as days
 * pass without any state to save.
 */

// ===================================================================== a purse fight

function purseFight(c: Parameters<Affordance<GymView>['run']>[0], v: GymView, id: string, o: { fee: number; mult: number; win: string[]; lose: string[]; thought: string[] }): void {
  const { w } = c;
  const h = w.hero;
  const foe = find(v, 'sparrer') ?? ladderFighters(w, v.main)[0] ?? find(v, 'regular');
  if (!foe) return;
  h.cash -= o.fee;
  const tok: Record<string, string | number> = { gym: v.main.name, npc: foe.name, fee: o.fee };
  const res = fight(c, [foe], { cause: 'a bout at the gym', joiners: false });
  addSore(h, 0.1);
  if (res === 'win') {
    const purse = Math.round(40 * v.info.tier * o.mult * (v.sit?.def.purse ?? 1));
    h.cash += purse;
    tok.amount = purse;
    fameFrom(c, 1.5 * (v.sit?.def.fame ?? 1), 'gym');
    train(c, 'melee', 1.5);
    foe.affinity -= 3;
    say(c, `${id}.win`, 'good', o.win, o.thought, tok, { place: v.main.name, npc: foe.name });
  } else if (res === 'tossed' || res === 'flee') {
    say(c, `${id}.lose`, 'bad', o.lose, undefined, tok, { place: v.main.name, npc: foe.name });
  }
}

const canFight = (w: Parameters<NonNullable<Affordance<GymView>['ok']>>[0], v: GymView, fee: number): boolean => w.hero.cash >= fee && w.hero.hp >= w.hero.maxHp * 0.5 && !banned(w, v.main) && !!(find(v, 'sparrer') ?? find(v, 'regular'));

// ===================================================================== situations

export const SITUATIONAL: Affordance<GymView>[] = [
  row({
    id: 'enter-tournament', where: { situation: 'tournament', room: 'floor' }, pace: 'fight',
    needs: ['skill:melee', 'stat:muscle', 'drive:pride', 'drive:greed', 'drive:quest'],
    sees: 'Banners, a purse on the wall and a bracket with her name missing from it.', stakes: 'An entry fee; a bout for a purse and a lot of fame.', consequence: 'A rival who won\'t forget; a name on the wall.',
    drives: { pride: 1.2, greed: 0.8, quest: 0.6, bravery: 0.5 }, bonus: 0.3, risk: 0.8, intent: ['Blackbird reads the tournament bracket and finds a slot where her name should go.'],
    ok: (w, v) => canFight(w, v, 15 * v.info.tier),
    run: (c, v) => purseFight(c, v, 'tournament', { fee: 15 * v.info.tier, mult: 1, win: ['{gym} tournament: Blackbird goes to the final bracket and beats {npc}, to a crowd that has money riding on {them}. Purse: {amount}nd. The banner has her name on it by morning, spelled correctly.'], lose: ['Blackbird goes out in the early rounds at {gym} to {npc}. The entry fee, {fee}nd, stays in the till.'], thought: ['Champion. Check the spelling.'] }),
  }),
  row({
    id: 'accept-challenge', where: { situation: 'challenge', room: 'floor' }, pace: 'fight',
    needs: ['skill:melee', 'drive:pride', 'drive:quest'],
    sees: 'A challenge from the gym across town, pinned up, circled in red.', stakes: 'A bout for pride and a purse; a rival\'s attention.', consequence: 'The rival gym knows her name.',
    drives: { pride: 1.1, quest: 0.7, bravery: 0.4 }, bonus: 0.3, risk: 0.7, intent: ['Blackbird reads the challenge note and signs under it with a flourish.'],
    ok: (w, v) => canFight(w, v, 0),
    run: (c, v) => purseFight(c, v, 'challenge', { fee: 0, mult: 1.5, win: ['Blackbird answers the challenge at {gym} and beats {npc} in front of a crowd that came to see the other side lose. Purse: {amount}nd. Cheering and a slap on the back.'], lose: ['{npc} takes the challenge at {gym}, and takes Blackbird with it. The crowd was on the other side.'], thought: ['Their gym is worse. Their coach is worse. Their name is worse.'] }),
  }),
  row({
    id: 'face-down-collectors', where: { situation: 'collector', room: 'floor' }, pace: 'fight',
    needs: ['skill:intimidation', 'skill:melee', 'stat:charm', 'drive:bravery', 'drive:quest'],
    sees: 'Two people in matching jackets standing too close to the owner.', stakes: 'The owner\'s gratitude and a cut; a brawl with a crew.', consequence: 'The crew\'s turf will remember her.',
    drives: { bravery: 0.9, pride: 0.6, quest: 0.4 }, bonus: 0.15, risk: 0.9, intent: ['Blackbird sees two jackets and a gym owner doing quiet arithmetic.'],
    ok: (w, v) => !banned(w, v.main) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['intimidation', ['melee', 0.5], ['stat:charm', 0.4]], base: 0.3, per: 0.07,
      win: R(['Blackbird has a word with the two jackets at {gym}. The word is "leave". They leave. {owner} presses {amount}nd into her hand and does not say thank you, which is how she knows.'], { cash: [40, 140], from: 'owner', fame: 1, affinity: 20, heat: ['turf', 1], train: [['intimidation', 2]], xp: 5, thought: ['I am the toughest person in a room with a very high bar for toughness.'] }),
      lose: R(['The two jackets at {gym} are not impressed. They are, as it turns out, four.'], { thugs: ['ganger', 2], heat: ['turf', 1] }) },
  }),
  row({
    id: 'charm-inspector', where: { situation: 'inspector', room: 'floor' }, pace: 'session',
    needs: ['stat:charm', 'skill:haggling', 'stat:int', 'skill:grifting', 'drive:greed'],
    sees: 'An Atlas inspector with a tablet and an unhurried smile.', stakes: 'A glowing review or a quiet fine; Atlas\'s attention.', consequence: 'Atlas now has an opinion of her.',
    drives: { pride: 0.5, greed: 0.5, curiosity: 0.4 }, bonus: 0.05, risk: 0.5, intent: ['Blackbird sees an Atlas inspector going down a row of machines, nodding.'],
    check: { parts: [['stat:charm', 1], ['haggling', 0.5], ['grifting', 0.4]], base: 0.3, per: 0.07,
      win: R(['Blackbird chats up the Atlas inspector at {gym} until the tablet says "COMMENDABLE". The inspector tips her {amount}nd out of "discretionary reassurance funds".'], { cash: [20, 80], fame: 0.5, train: [['haggling', 1]], xp: 3, thought: ['Safe-T Certified. By me. Personally.'] }),
      lose: R(['The inspector at {gym} makes a note. The note has her name in it, spelled correctly, which is worse.'], { heat: ['atlas', 1] }) },
  }),
  row({
    id: 'find-trainer', where: { situation: 'missing_trainer', room: 'floor' }, pace: 'session',
    needs: ['skill:streetwise', 'drive:curiosity', 'drive:quest', 'skill:sneak'],
    sees: 'A whistle on its hook and a coach who has not turned up for three days.', stakes: 'A lead; the owner\'s thanks.', consequence: 'The coach is found, or not.',
    drives: { curiosity: 0.9, quest: 0.9 }, bonus: 0.2, intent: ['Blackbird notices a whistle on a hook and an absence that has gone on a bit.'],
    ok: (w, v) => !!find(v, 'owner') && !banned(w, v.main),
    check: { who: 'owner', parts: ['streetwise', ['sneak', 0.4], ['stat:charm', 0.4]], base: 0.3, per: 0.07,
      win: R(['Blackbird finds the missing coach of {gym} three streets away, in a very unlikely bar, with a good excuse. {owner} pays her {amount}nd and hugs her, quickly and unsteadily.'], { cash: [50, 140], from: 'owner', affinity: 15, train: [['streetwise', 2]], xp: 6 }),
      lose: R(['Blackbird asks around about the missing coach of {gym}. Everyone has an opinion. None of them have the coach.'], { train: [['streetwise', 1]] }) },
  }),
  row({
    id: 'steal-the-shot', where: { situation: 'filming', room: 'floor' }, pace: 'session',
    needs: ['stat:charm', 'skill:athletics', 'skill:dancing', 'drive:pride', 'goal:fame'],
    sees: 'A film crew, a ring light and a very tanned person doing push-ups at a lens.', stakes: 'A big slice of the camera; a security guard.', consequence: 'Her face is in somebody else\'s video.',
    drives: { pride: 1.5 }, bonus: 0.2, intent: ['Blackbird sees a camera, a crew and a gap in the shot that is exactly her size.'],
    check: { parts: [['stat:charm', 1], ['athletics', 0.5], ['dancing', 0.3]], base: 0.35, per: 0.06,
      win: R(['Blackbird walks into the shot at {gym}, does one perfect rep and walks out. The crew keeps the take. The influencer is livid and keeps the take.'], { fame: 2.5, train: [['athletics', 1]], xp: 5, thought: ['Right place. Right angle. Right me.'] }),
      lose: R(['Blackbird gets into the shot at {gym}, and out of it, very fast, with a security guard\'s hand on her collar. A takedown, but a flattering one.'], { fame: 0.3, affinity: -4 }) },
  }),
  row({
    id: 'sweep-the-mess', where: { situation: ['break_in', 'aftermath'], room: 'floor' }, pace: 'session',
    needs: ['skill:scavenging', 'skill:sleight', 'skill:tinkering', 'drive:greed'],
    sees: 'Glass, tape, overturned benches and things nobody has claimed yet.', stakes: 'Salvage and a few neodollars for the sweeping; a cut hand.', consequence: '—',
    drives: { greed: 0.6, curiosity: 0.3 }, bonus: 0.1, intent: ['Blackbird sees a floor covered in everyone else\'s bad night.'],
    check: { who: 'owner', parts: ['scavenging', ['sleight', 0.3]], base: 0.45, per: 0.06,
      win: R(['Blackbird sweeps up at {gym} and keeps what falls out of the debris: {amount}nd and {item}. {owner} pays her for the sweeping, not noticing the other half.'], { cash: [15, 60], from: 'owner', item: 'scrap_metal', train: [['scavenging', 2]], affinity: 4, xp: 3 }),
      lose: R(['A shard of glass at {gym} finds her palm. It is a small, fair cut.'], { hp: -3 }) },
  }),
  row({
    id: 'audition', where: { situation: 'scouts', room: 'floor' }, pace: 'fight',
    needs: ['skill:athletics', 'skill:melee', 'stat:charm', 'drive:pride', 'goal:fame'],
    sees: 'Scouts with clipboards pretending to stretch.', stakes: 'A signing bonus and a lot of fame; being passed over.', consequence: 'Someone is watching.',
    drives: { pride: 1.4, greed: 0.5, quest: 0.4 }, bonus: 0.25, intent: ['Blackbird sees a scout in the corner pretending to stretch.'],
    check: { parts: ['athletics', ['melee', 0.7], ['stat:charm', 0.5]], base: 0.3, per: 0.06, physical: true,
      win: R(['Blackbird gives the scout at {gym} something to write down. A signing bonus of {amount}nd appears in an envelope. She is, apparently, "one to watch".'], { cash: [40, 130], fame: 3, train: [['athletics', 1], ['melee', 1]], xp: 6, thought: ['One to watch. One to adore.'] }),
      lose: R(['The scout at {gym} watches Blackbird for ten minutes, writes one word and puts the clipboard away. The word was "enthusiasm".'], { fame: 0.2 }) },
  }),
  row({
    id: 'dark-work', where: { situation: 'dark' }, pace: 'session',
    needs: ['skill:sneak', 'skill:lockpicking', 'skill:sleight', 'drive:greed'],
    sees: 'No lights, no cameras and a gym full of people who are not looking.', stakes: 'A lot of unseen pocket; a trip over a dumbbell.', consequence: 'The power comes back eventually.',
    drives: { greed: 1.2, curiosity: 0.3 }, bonus: 0.15, risk: 0.5, intent: ['The lights go out at {gym}. Blackbird does not sit still.'],
    ok: notBannedWhere,
    check: { parts: ['sneak', ['lockpicking', 0.5], ['sleight', 0.5]], base: 0.55, per: 0.06,
      win: R(['The power cut at {gym} is the best thing that has happened to Blackbird all week. {amount}nd by the time the emergency lights come back on.'], { cash: [40, 190], train: [['sneak', 2], ['sleight', 1]], xp: 5 }),
      lose: R(['In the dark at {gym}, Blackbird trips over a dumbbell the size of a small dog.'], { hp: -4, hurt: 0.2 }) },
  }),
  row({
    id: 'join-heist-plan', where: { situation: 'heist', room: ['sauna', 'locker', 'floor'] }, pace: 'session',
    needs: ['skill:streetwise', 'drive:curiosity', 'drive:greed', 'drive:quest'],
    sees: 'A group whispering over a drawing of the building across the street.', stakes: 'A lead on a job; or a threat to forget what she heard.', consequence: 'The crew knows her face.',
    drives: { curiosity: 0.8, greed: 0.6, quest: 0.5 }, bonus: 0.1, risk: 0.4, intent: ['Blackbird sees a group huddled over a drawing of the building across the street.'],
    check: { who: 'regular', parts: ['streetwise', ['stat:charm', 0.4]], base: 0.3, per: 0.07,
      win: R(['Blackbird offers an opinion on the drawing at {gym}. It is, to her surprise, correct. They give her a name, {tip}, and {amount}nd as a retainer.'], { cash: [20, 90], tip: true, train: [['streetwise', 2]], xp: 4 }),
      lose: R(['The group at {gym} stops whispering. One of them stands up. "Forget it," they say. It is not a request.'], { thugs: ['ganger', 1], affinity: -5 }) },
  }),
  row({
    id: 'return-dog', where: { situation: 'lost_dog', room: 'floor' }, pace: 'quick',
    needs: ['skill:rapport', 'drive:curiosity'],
    sees: 'A small dog under the bench press, and a poster promising a reward.', stakes: 'A reward; a nip.', consequence: 'A grateful stranger.',
    drives: { curiosity: 0.4 }, bonus: 0.15, intent: ['Blackbird sees a lost-dog poster and, under the bench, the lost dog.'],
    check: { who: 'owner', parts: ['rapport', ['stat:charm', 0.3]], base: 0.5, per: 0.07,
      win: R(['Blackbird talks the dog out from under the bench at {gym} with a protein bar and an expression of total sincerity. The reward is {amount}nd and a lot of licking.'], { cash: [25, 70], from: 'owner', affinity: 8, train: [['rapport', 2]], xp: 3 }),
      lose: R(['The dog at {gym} does not want to be found. It bites, mildly, as a political statement.'], { hp: -2 }) },
  }),
  row({
    id: 'pay-respects', where: { situation: 'funeral', room: 'floor' }, pace: 'quick',
    needs: ['drive:quest', 'stat:charm'],
    sees: 'A photo on the desk and every glove laid out in a row.', stakes: 'Nothing but time and a little grace.', consequence: 'The gym remembers she came.',
    drives: { quest: 0.1 }, bonus: 0.05, intent: ['Blackbird sees the photo on the desk, and the gloves laid out in a row.'],
    run: (c, v) => {
      for (const n of v.people) if (n.alive && !n.hostile && (n.tags.includes('staff') || n.tags.includes('regular') || n.archetype === 'gym_sparrer')) n.affinity += 6;
      gainXp(c, 2);
      say(c, 'respects', 'good', ['Blackbird stands at the desk at {gym} for a minute and says nothing. It is the right amount. The regulars notice.'], ['I do this sort of thing very well. I should do it more.'], { gym: v.main.name });
    },
  }),
  row({
    id: 'fix-boiler', where: { situation: 'cold', room: 'floor' }, pace: 'session',
    needs: ['skill:tinkering', 'drive:greed', 'drive:curiosity'],
    sees: 'A cold gym, a boiler cupboard and an owner who has run out of plumbers.', stakes: 'A fee; a mild scalding.', consequence: 'The owner owes her one.',
    drives: { greed: 0.5, curiosity: 0.4 }, bonus: 0.15, intent: ['Blackbird hears the owner say "the boiler" to a spanner.'],
    check: { who: 'owner', parts: ['tinkering'], base: 0.3, per: 0.08,
      win: R(['Blackbird kicks the boiler at {gym}, then reseats a valve, then kicks it again. Heat. {owner} pays {amount}nd, in cash, with a tear.'], { cash: [40, 100], from: 'owner', affinity: 12, train: [['tinkering', 3]], xp: 5 }),
      lose: R(['The boiler at {gym} releases a cloud of steam in her face. It is, technically, a result.'], { hp: -3 }) },
  }),
  row({
    id: 'party-crash', where: { situation: 'party', room: 'floor' }, pace: 'session',
    needs: ['stat:charm', 'skill:dancing', 'skill:djing', 'drive:lust', 'drive:thirst'],
    sees: 'A wedding on the sparring floor: a ring for a dance floor and a cake on the scales.', stakes: 'Free food, a dance and a good time; a family feud.', consequence: 'A couple will remember her, kindly.',
    drives: { thirst: 0.5, lust: 0.4, pride: 0.4 }, bonus: 0.15, intent: ['Blackbird sees a wedding on a gym floor and a cake on the scales.'],
    check: { who: 'fair', parts: [['stat:charm', 1], ['dancing', 0.7]], base: 0.4, per: 0.06,
      win: R(['Blackbird dances at the wedding in {gym}, and the groom\'s uncle, and the groom, and the cake. She leaves with a slice of it and an invitation to the next.'], { hp: 8, fame: 0.8, train: [['dancing', 2]], affinity: 8, xp: 4 }),
      lose: R(['Blackbird\'s toast at the wedding in {gym} is a lot longer than anyone wanted. The groom is fond of her. His mother is not.'], { affinity: -4 }) },
  }),
  row({
    id: 'listen-in', where: { situation: 'gossip' }, pace: 'quick',
    needs: ['skill:streetwise', 'drive:curiosity'],
    sees: 'Everyone is whispering. Nobody will say what about.', stakes: 'A name, a lead, an invitation to the wrong party.', consequence: '—',
    drives: { curiosity: 0.9 }, bonus: 0.15, intent: ['Blackbird hears the whispering at {gym} and drifts towards it.'],
    check: { who: 'regular', parts: ['streetwise', ['stat:charm', 0.3], ['sneak', 0.3]], base: 0.4, per: 0.07,
      win: R(['Blackbird picks up the whispering at {gym}, and the whispering comes with a name: {tip}. She nods as though she knew.'], { tip: true, train: [['streetwise', 1]], xp: 2 }),
      lose: R(['The whispering at {gym} stops when Blackbird gets within three feet. It resumes at four.'], {}) },
  }),
];

function notBannedWhere(w: Parameters<NonNullable<Affordance<GymView>['ok']>>[0], v: GymView): boolean {
  return !banned(w, v.main);
}

// ===================================================================== the wild ones

export const WILDCARDS: Affordance<GymView>[] = [
  row({
    id: 'legendary-coach', where: { wild: 'legendary_coach', room: 'floor' }, pace: 'session',
    needs: ['drive:pride', 'drive:greed', 'drive:quest', 'stat:muscle'],
    sees: 'A coach who is said to teach in a night what takes others a year. The fee is enormous.', stakes: '150-400nd; a huge jump in a skill, and a body to match.', consequence: 'The coach talks about her.',
    drives: { pride: 1.0, quest: 0.9, greed: -0.2 }, bonus: 0.3, intent: ['Blackbird hears about the coach whom people lower their voices to talk about.'],
    ok: (w) => w.hero.cash >= 150 && soreOk(w),
    run: (c, v) => {
      const { w, rng } = c;
      const h = w.hero;
      const fee = Math.min(h.cash, rng.int(150, 400));
      h.cash -= fee;
      const skill = rng.pick(v.v.trains);
      const label = SKILLS[skill as keyof typeof SKILLS]?.label ?? skill;
      train(c, skill as keyof typeof SKILLS, 12);
      addSore(h, 0.4);
      gainXp(c, 12);
      say(c, 'legend', 'good', ['The coach at {gym} watches Blackbird for ninety seconds, says four words and, for the next four hours, ruins her. {pay}nd. {skill} goes up by more than she can count.'], ['That is it. That is what they mean by a master.'], { gym: v.main.name, pay: fee, skill: label });
    },
  }),
  row({
    id: 'cursed-rig', where: { wild: 'cursed_rig', room: 'floor' }, pace: 'session',
    needs: ['stat:muscle', 'drive:bravery', 'drive:curiosity', 'skill:athletics'],
    sees: 'One rig in the corner is roped off. People say it is the best in the district. People say other things, too.', stakes: 'A huge gain for a terrible night.', consequence: 'You will remember it.',
    drives: { bravery: 0.9, curiosity: 0.9, pride: 0.4 }, bonus: 0.2, risk: 0.9, intent: ['Blackbird looks at the rope around the rig, and the rig looks at the rope.'],
    run: (c, v) => {
      const { w, rng } = c;
      const h = w.hero;
      const skill = rng.pick(v.v.trains);
      train(c, skill as keyof typeof SKILLS, 10);
      addSore(h, 0.5);
      h.hp = Math.max(1, h.hp - 18);
      if (rng.chance(0.5)) h.injuries.length < 3 && h.injuries.push(rng.pick(['broken_leg', 'cracked_ribs', 'concussion'] as const));
      say(c, 'cursed', 'mixed', ['Blackbird ducks the rope and uses the cursed rig at {gym}. It is the best session of her life. The rig adds something to the experience that she is going to feel for a while.'], ['Worth it. Mostly. Ask me tomorrow.'], { gym: v.main.name });
    },
  }),
  row({
    id: 'atlas-promo', where: { wild: 'atlas_promo', room: 'floor' }, pace: 'quick',
    needs: ['drive:greed', 'skill:haggling'],
    sees: 'A banner: THE FIRST FIFTY MEMBERS GET LIFETIME REASSURANCE. There are fifty-one in the queue.', stakes: 'A free gift; Atlas notices her name on a list.', consequence: 'Atlas has her details forever.',
    drives: { greed: 0.9 }, bonus: 0.1, intent: ['Blackbird reads a banner that says LIFETIME REASSURANCE and the word FREE underneath it.'],
    ok: (w, v) => !w.counters[`promo:${v.main.id}`],
    check: { parts: ['haggling'], base: 0.8, per: 0, lo: 0.8, hi: 0.8,
      win: R(['Blackbird is the fiftieth member of {gym} and receives a lifetime of reassurance, a pair of hand wraps and a terms-of-service she will never read.'], { item: 'boxing_wraps', passDays: 3650, heat: ['atlas', 1], counter: ['promo-claimed', 1], xp: 2 }),
      lose: R(['The queue at {gym} closes at forty-nine. Blackbird is fifty. The banner is still up.'], {}) },
  }),
  row({
    id: 'battle-royale', where: { wild: 'battle_royale', room: 'pit' }, pace: 'fight',
    needs: ['skill:melee', 'stat:muscle', 'drive:greed', 'drive:bravery', 'drive:pride'],
    sees: 'A pit that never closes, and a purse that grows every night nobody wins it.', stakes: 'A fat purse for a brawl with the whole roster; a lot of bruises.', consequence: 'The pit remembers.',
    drives: { greed: 1.2, bravery: 0.9, pride: 0.8 }, bonus: 0.25, risk: 1.2, intent: ['Blackbird reads the purse on the pit wall and does the maths.'],
    ok: (w, v) => ladderFighters(w, v.main).length >= 2 && w.hero.hp >= w.hero.maxHp * 0.7 && w.hero.cash >= 30 && !banned(w, v.main),
    run: (c, v) => {
      const { w, rng } = c;
      const h = w.hero;
      h.cash -= 30;
      const foes = ladderFighters(w, v.main).slice(0, 3);
      const res = fight(c, foes, { cause: 'the all-night brawl', joiners: false });
      addSore(h, 0.25);
      if (res === 'win') {
        const purse = rng.int(150, 500);
        h.cash += purse;
        fameFrom(c, 3, 'gym');
        say(c, 'royale.win', 'good', ['Blackbird is the last one standing in the pit at {gym}. The purse is {amount}nd, which has been growing for a week. The pit boss counts it out in coins.'], ['Everybody knocked down. Me, standing. Do the maths.'], { gym: v.main.name, amount: purse });
      }
    },
  }),
  row({
    id: 'secret-society', where: { wild: 'secret_society', room: 'floor' }, pace: 'session',
    needs: ['skill:melee', 'skill:sneak', 'drive:curiosity', 'drive:pride', 'item:society_card'],
    sees: 'The best sparrer here gets a card with no name on it, and a number.', stakes: 'An invitation; a very polite refusal.', consequence: 'Some people know her number.',
    drives: { curiosity: 0.9, pride: 0.8 }, bonus: 0.2, intent: ['Blackbird notices someone slipping a plain card to the best sparrer in the room.'],
    ok: (w) => skillLevel(w.hero, 'melee') >= 4 && !w.hero.inventory.some((i) => i.id === 'society_card'),
    check: { who: 'sparrer', parts: ['melee', ['stat:charm', 0.3]], base: 0.4, per: 0.07,
      win: R(['After the last bout at {gym}, a plain card is pressed into Blackbird\'s hand. It has a number on it and a time. No name. She keeps it.'], { item: 'society_card', fame: 0.5, train: [['melee', 2]], xp: 4 }),
      lose: R(['A polite stranger at {gym} tells Blackbird she is "not yet". The way {they} say{s} it makes it clear that "yet" is a verb.'], {}) },
  }),
  row({
    id: 'ghost-lesson', where: { wild: 'ghost', room: 'floor' }, pace: 'session',
    needs: ['skill:rapport', 'skill:sneak', 'drive:curiosity', 'drive:bravery'],
    sees: 'The mats creak when nobody is on them. The students call it Sensei, to be safe.', stakes: 'A lesson from a very old master; a chill.', consequence: '—',
    drives: { curiosity: 1.0, bravery: 0.4 }, bonus: 0.2, risk: 0.3, intent: ['The mats at the far end creak. Nobody is standing on them.'],
    check: { parts: [['rapport', 0.8], ['sneak', 0.6], ['stat:reflex', 0.3]], base: 0.35, per: 0.07,
      win: R(['Blackbird stands on the creaking mat at {gym} and, for forty minutes, is corrected by nobody at all. She learns three things she can use and one she hopes she never does.'], { train: [['sneak', 5], ['melee', 3]], xp: 6, sore: 0.1, thought: ['A ghost taught me. I am so talented that the dead teach me.'] }),
      lose: R(['The mat at {gym} goes very cold. Blackbird leaves, with great dignity, via the nearest window-shaped opening.'], { hp: -2 }) },
  }),
  row({
    id: 'tip-off-fighter', where: { wild: 'rigged_tournament', room: ['floor', 'pit'] }, pace: 'session',
    needs: ['skill:streetwise', 'skill:cards', 'skill:intimidation', 'drive:greed', 'drive:curiosity'],
    sees: 'A bracket where every bout is fixed. Everyone knows. Nobody has told the new fighters.', stakes: 'A killing on the book if she bets right; a fight if she asks the wrong person.', consequence: 'The book is wary of her.',
    drives: { greed: 1.0, curiosity: 0.7 }, bonus: 0.15, risk: 0.4, intent: ['Blackbird looks at the bracket and the odds beside it, and sees how they were chosen.'],
    ok: (w) => w.hero.cash >= 20,
    check: { who: 'staff', parts: ['streetwise', ['cards', 0.5], ['intimidation', 0.3]], base: 0.3, per: 0.07, pay: 20,
      win: R(['Blackbird works out which fighter goes down at {gym} and bets the other way. {amount}nd off a bookmaker who looks as though he has been told something.'], { cash: [50, 180], train: [['streetwise', 2]], warn: ['rig', 0.3], xp: 4 }),
      lose: R(['Blackbird asks the wrong person at {gym} about the bracket. The wrong person has friends.'], { thugs: ['ganger', 1], warn: ['rig', 0.3] }) },
  }),
];

const soreOk = (w: Parameters<NonNullable<Affordance<GymView>['ok']>>[0]): boolean => (w.hero.sore ?? 0) < 0.7;

// ===================================================================== things only some kinds of gym have

export const VARIANT_ROWS: Affordance<GymView>[] = [
  row({
    id: 'ring-the-bell', where: { variant: 'climb', feature: 'climbing_wall' }, pace: 'session',
    needs: ['skill:athletics', 'skill:sneak', 'stat:reflex', 'drive:pride', 'drive:bravery'],
    sees: 'A route to the top, and a bell for people who reach it.', stakes: 'A bell, and a view; a fall.', consequence: 'Her name goes on the wall of climbers.',
    drives: { pride: 0.9, bravery: 0.7 }, bonus: 0.15, risk: 0.5, intent: ['Blackbird looks at the bell at the top of the wall. The bell looks small.'],
    check: { parts: ['athletics', ['sneak', 0.4], ['stat:reflex', 0.5]], base: 0.3, per: 0.07, physical: true,
      win: R(['Blackbird goes up the Grade 9 at {gym} in fourteen minutes, rings the bell once, and lets it echo. The wall has a new name on it.'], { fame: 1, train: [['athletics', 2], ['sneak', 1]], xp: 5, thought: ['The view from the top is worse than I expected. I like being up here anyway.'] }),
      lose: R(['Blackbird falls from the Grade 9 at {gym}, into the crash mat, which is the size of a car and still manages to hit her.'], { hp: -5, hurt: 0.25 }) },
  }),
  row({
    id: 'meditate', where: { variant: ['wellness', 'dojo'], feature: ['yoga_mats', 'mats'] }, pace: 'session',
    needs: ['skill:tolerance', 'skill:medicine', 'skill:rapport', 'drive:curiosity'],
    sees: 'A mat, a bell and a promise of nothing for an hour.', stakes: 'A calmer body; the app says something unsettling.', consequence: '—',
    drives: { curiosity: 0.3, thirst: 0.2 }, bonus: 0.0, intent: ['Blackbird sees a mat, and the word "breathe" in a font that wants her to.'],
    ok: (w) => (w.hero.sore ?? 0) > 0.15 || w.hero.drunk > 0 || w.hero.hp < w.hero.maxHp,
    check: { parts: ['tolerance', ['medicine', 0.5]], base: 0.7, per: 0.03,
      win: R(['An hour of guided meditation at {gym}. Blackbird achieves a state she describes as "mostly quiet", which the app calls Level 2. Soreness drops.'], { sore: -0.35, hp: 6, thought: ['Inner peace. Outer weather. I am a mountain.'] }),
      lose: R(['The meditation app at {gym} says "I can hear you thinking" in the quiet. Blackbird opens her eyes. Nobody else heard it.'], { heat: ['atlas', 0] }) },
  }),
  row({
    id: 'wellness-score', where: { variant: 'atlasfit', feature: 'member_terminal' }, pace: 'quick',
    needs: ['stat:int', 'skill:streetwise', 'skill:grifting', 'drive:greed'],
    sees: 'A Wellness Score that unlocks coupons when it climbs.', stakes: 'Atlas reward credits; Atlas\'s attention.', consequence: 'Atlas now has her data.',
    drives: { greed: 0.6, curiosity: 0.2 }, bonus: 0.1, intent: ['Blackbird sees her Wellness Score on a screen: 61. It is a number, and she hates it.'],
    check: { parts: [['stat:int', 1], ['grifting', 0.4]], base: 0.4, per: 0.07,
      win: R(['Blackbird gets her Wellness Score at {gym} to 99 by walking in a very small circle. The reward is {amount}nd in credits and a drink voucher.'], { cash: [15, 60], train: [['grifting', 1]], xp: 3 }),
      lose: R(['Blackbird\'s Wellness Score at {gym} drops to 40 on account of "irregular optimism".'], { heat: ['atlas', 1] }) },
  }),
  row({
    id: 'coach-the-newbies', where: { variant: 'youth', room: 'floor' }, pace: 'session',
    needs: ['skill:streetwise', 'skill:melee', 'stat:charm', 'skill:rapport', 'drive:pride'],
    sees: 'A room of young punks who need someone to show them the basics.', stakes: 'Respect; a little fame; a thank-you in jam sandwiches.', consequence: 'A few of them would take a bullet for her. Perhaps.',
    drives: { pride: 0.8, quest: 0.3 }, bonus: 0.1, intent: ['Blackbird sees a handful of young punks, hitting a bag the wrong way.'],
    check: { who: 'regular', parts: [['melee', 0.6], ['stat:charm', 0.8], ['streetwise', 0.4]], base: 0.5, per: 0.05,
      win: R(['Blackbird shows a handful of newbies at {gym} how to stand, how to swing and when to stop. It sticks. She gets {amount}nd from the tea fund and a heap of gratitude.'], { cash: [0, 25], fame: 0.8, affinity: 10, train: [['streetwise', 1], ['rapport', 1]], xp: 4, thought: ['A mentor. A legend. A coach, like, sort of.'] }),
      lose: R(['The newbies at {gym} laugh at Blackbird\'s stance. She finds she is laughing too, in the end.'], { affinity: 2 }) },
  }),
  row({
    id: 'bench-the-machine', where: { variant: 'chrome', feature: 'rigs' }, pace: 'session',
    needs: ['stat:muscle', 'drive:pride', 'implant:any'],
    sees: 'A man in the corner benching a vending machine, and a crowd that wants someone else to try.', stakes: 'Fame; a tendon.', consequence: 'A legendary spot on the board.',
    drives: { pride: 1.1, bravery: 0.4 }, bonus: 0.1, risk: 0.5, intent: ['Blackbird sees a vending machine on a bar. It is somebody else\'s attempt.'],
    check: { parts: [['stat:muscle', 1], ['athletics', 0.6]], base: 0.2, per: 0.07, physical: true,
      win: R(['Blackbird benches a vending machine at {gym} twice. It is mostly empty. The crowd treats this as a technicality.'], { fame: 1.5, train: [['athletics', 2]], xp: 5, sore: 0.15 }),
      lose: R(['The vending machine at {gym} disagrees. Blackbird is under it for a short, vivid moment.'], { hp: -6, hurt: 0.4, sore: 0.2 }) },
  }),
  row({
    id: 'kata-demo', where: { variant: 'dojo', feature: 'mats' }, pace: 'session',
    needs: ['skill:melee', 'skill:sneak', 'stat:charm', 'drive:pride'],
    sees: 'A sensei who is looking for a volunteer to be slightly corrected in public.', stakes: 'A little fame and the sensei\'s respect; a humble pie.', consequence: '—',
    drives: { pride: 0.9, curiosity: 0.2 }, bonus: 0.1, intent: ['Blackbird sees the sensei look for a volunteer. The sensei looks at her.'],
    check: { who: 'trainer', parts: ['melee', ['sneak', 0.5], ['stat:charm', 0.3]], base: 0.3, per: 0.07,
      win: R(['Blackbird performs the first form at {gym} in front of the class. {npc} says "acceptable", which is the highest praise the school allows. Fame and a belt in a colour she is not allowed to name.'], { fame: 1, affinity: 8, train: [['melee', 2], ['sneak', 1]], xp: 4 }),
      lose: R(['{npc} corrects her form at {gym} eleven times, in public, politely. The class remembers every one.'], { affinity: 2, train: [['melee', 1]] }) },
  }),
];

register('gym', [...SITUATIONAL, ...WILDCARDS, ...VARIANT_ROWS]);
