import { type Affordance } from '../affordances';
import { R, find, type VenueView } from '../venuekit';
import { row, open } from './fanclubafford';
import { addHeat } from '../combat';
import { hasInstrument } from '../instruments';
import { expectation } from '../renown';
import { train } from '../skills';
import type { PlaceView } from '../placekit';

/**
 * The second half of a fan club's rows: what tonight brings (a vigil for her, a Muse raid, a tribute gig, an election), and the
 * wild cards (her first fan, the place she died, a time capsule from a previous Blackbird).
 */

const fans = (v: PlaceView, n: number): void => {
  v.main.fans = (v.main.fans ?? 0) + n;
};

const SITUATIONAL: Affordance<VenueView>[] = [
  row({
    id: 'members-night-set', where: { situation: 'party' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:pride'],
    sees: 'Members\' night: a full room, the tribute band on, and a cake shaped like her guitar.', stakes: 'Get up with the tribute band: fame, fans, and the cake.', consequence: 'Members\' night with the real one.',
    drives: { pride: 0.9, thirst: 0.2 }, bonus: 0.25, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['guitar', ['vocals', 0.5], ['stat:charm', 0.4]], base: 0.45, per: 0.05,
      win: R(['On members\' night at {venue}, Blackbird gets up with her own tribute band and plays the chorus everyone came to sing. Then she eats the neck of the cake.'], { fame: 2, apply: (c, v) => fans(v, 8), hp: 4, thought: ['They sang louder than me. That is the goal.'] }),
      lose: R(['Blackbird gets up on members\' night at {venue} and forgets the second verse of her own song. Two hundred people sing it to her.'], { fame: 0.5, thought: ['A duet with two hundred people. Planned. Obviously.'] }) },
  }),
  row({
    id: 'own-vigil', where: { situation: 'vigil' }, pace: 'session',
    needs: ['stat:charm', 'skill:speaking', 'drive:pride'],
    sees: 'A candle vigil for a death of hers that the members are not sure she survived.', stakes: 'Walk into her own vigil: a resurrection in front of the faithful, a lot of fame.', consequence: 'They saw her come back.',
    drives: { pride: 1, curiosity: 0.4 }, bonus: 0.4,
    check: { parts: ['stat:charm', ['speaking', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird walks into her own candle vigil at {venue} with a bag of chips and says "sorry I\'m late". Nobody in the room will ever be the same. The story is in four districts by midnight.'], { fame: 4, apply: (c, v) => fans(v, 12), thought: ['A resurrection. My third this year.', 'They lit candles. I came back. Coincidence? No.'] }),
      lose: R(['Blackbird walks into her own vigil at {venue}. An elder says, "that is the wrong one", and the vigil goes on.'], { thought: ['The wrong one. Of me.'] }) },
  }),
  row({
    id: 'defend-the-clubhouse', where: { situation: 'raid' }, pace: 'fight',
    needs: ['skill:marksmanship', 'skill:throwing', 'drive:bravery'],
    sees: 'Muse drones circling outside, and a club that has called her "an unlicensed emotional gathering".', stakes: 'Shoot the drones down with the members cheering: Muse loses the block a little, fame. Or tear gas.', consequence: 'The club held.',
    drives: { bravery: 0.8, quest: 0.5 }, bonus: 0.3, risk: 0.4,
    check: { parts: ['marksmanship', ['throwing', 0.6], ['stat:reflex', 0.4]], base: 0.4, per: 0.06,
      win: R(['Blackbird goes out onto the step at {venue} and brings down the Muse drones one by one, to cheers from every window. The members sing the rest of the night with the door open.'], { fame: 2, apply: (c, v) => { addHeat(c.w, 'muse', 1); for (const e of v.main.exits) { const s = c.w.locations[e.to]; if (s?.kind === 'street') s.musePull = Math.max(0, (s.musePull ?? 50) - 15); } }, thought: ['Pest control. Pastel pests.'] }),
      lose: R(['The drones get the gas off before Blackbird gets a shot off. The members cough their way through a chorus out of spite.'], { thugs: ['muse_drone', 2], hp: -3, thought: ['They sang through tear gas. For me. I will not cry. I am crying. It is the gas.'] }) },
  }),
  row({
    id: 'join-the-tribute', where: { situation: 'tribute' }, pace: 'session',
    needs: ['skill:guitar', 'skill:grifting', 'drive:curiosity'],
    sees: 'A sold-out tribute gig of her songs, and a stage door.', stakes: 'Go on as a member of her own tribute band, in a wig: fame when the room realises, a lot of joy.', consequence: 'The night the real one played in the tribute band.',
    drives: { curiosity: 0.7, pride: 0.6 }, bonus: 0.25, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['guitar', ['grifting', 0.4]], base: 0.45, per: 0.05,
      win: R(['Blackbird goes on with her own tribute band at {venue}, in a wig of her own hair from three bodies ago, as "the new rhythm guitarist". Halfway through the second song the front row works it out and screams.'], { fame: 2.5, apply: (c, v) => fans(v, 8), train: [['guitar', 2]], thought: ['I was a tribute to myself. The best one.'] }),
      lose: R(['Blackbird goes on with the tribute band at {venue} and is booed for "not playing it like the real one".'], { thought: ['I am the real one. The real one is going through something.'] }) },
  }),
  row({
    id: 'endorse-a-candidate', where: { situation: 'election' }, pace: 'quick',
    needs: ['skill:persuasion', 'skill:speaking', 'drive:pride'],
    sees: 'An election for club president, two manifestos and a lot of feelings.', stakes: 'Endorse one: they win by a landslide and love her for it (and the other one is a little hurt).', consequence: 'The club\'s president owes her the job.',
    drives: { pride: 0.6, curiosity: 0.4 }, bonus: 0.1,
    check: { who: 'regular', parts: ['persuasion', ['speaking', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird endorses {npc} for president at {venue}. {npc} wins with every vote but one. The one is the other candidate, who voted for {npc} too, out of respect for her endorsement.'], { affinity: 15, thought: ['Kingmaker. Of a fan club. Of my fan club.'] }),
      lose: R(['Blackbird\'s endorsement at {venue} splits the club into two clubs. Both of them love her.'], { thought: ['Twice the clubs. Twice the love.'] }) },
  }),
  row({
    id: 'raffle', where: { situation: 'fundraiser' }, pace: 'quick',
    needs: ['drive:greed', 'skill:cards', 'stat:charm'],
    sees: 'A fundraiser for buskers whose guitars Muse took, a raffle, and the prize is a guitar.', stakes: 'Buy a ticket (it is for a good cause), maybe win the guitar.', consequence: 'Money for buskers.',
    drives: { greed: 0.3, quest: 0.3 }, bonus: 0.1, ok: (w) => w.hero.cash >= 10,
    check: { pay: [5, 10], parts: ['cards', ['stat:charm', 0.3]], base: 0.3, per: 0.04,
      win: R(['Blackbird buys a raffle ticket at {venue} for {pay}nd. She wins the guitar. She gives it back to be raffled again. The room goes wild and raises twice as much.'], { fame: 1, thought: ['Generosity. Very good for the image.'] }),
      lose: R(['Blackbird buys a raffle ticket at {venue} for {pay}nd and wins a tin of shortbread.'], { hp: 2, thought: ['Good shortbread.'] }) },
  }),
  row({
    id: 'guide-newcomers', where: { situation: 'newcomers' }, pace: 'session',
    needs: ['skill:speaking', 'stat:charm', 'drive:pride'],
    sees: 'A coach of newcomers from another district come to see the shrine.', stakes: 'Show them round herself: fans in their district, a lot of joy.', consequence: 'A district she has never played knows her.',
    drives: { pride: 0.8 }, bonus: 0.2,
    check: { parts: ['speaking', ['stat:charm', 0.6]], base: 0.6, per: 0.04,
      win: R(['Blackbird gives the newcomers at {venue} the tour of her own shrine, with commentary. When the coach leaves, forty people from a district she has never played are singing her songs out of the windows.'], { fame: 1.5, apply: (c) => { const far = Object.values(c.w.locations).filter((l) => l.kind === 'street' && !l.fans).slice(0, 3); for (const l of far) l.fans = (l.fans ?? 0) + 8; }, thought: ['Tourism. To me.'] }),
      lose: R(['The newcomers at {venue} think Blackbird is a very committed lookalike and tip her.'], { cash: [5, 15], thought: ['A tip for being myself. Fair.'] }) },
  }),
  row({
    id: 'settle-the-feud', where: { situation: 'feud' }, pace: 'session',
    needs: ['skill:persuasion', 'skill:intimidation', 'drive:quest'],
    sees: 'The rival fan club, round to argue about which Blackbird was best, and it is getting heated.', stakes: 'Settle it: both clubs hers, more fans; or both clubs angry.', consequence: 'One fandom, united.',
    drives: { quest: 0.5, pride: 0.6 }, bonus: 0.15,
    check: { parts: ['persuasion', ['intimidation', 0.4], ['stat:charm', 0.4]], base: 0.45, per: 0.05,
      win: R(['Blackbird settles the feud at {venue} by telling both clubs that the best Blackbird is the next one. Both clubs agree, and hug, and start a joint newsletter.'], { fame: 1, apply: (c, v) => fans(v, 10), thought: ['Diplomacy. The next one. Which is me.'] }),
      lose: R(['Blackbird takes a side in the feud at {venue}. It is the wrong side. Every side is the wrong side.'], { hp: -2, thought: ['Fandom is war.'] }) },
  }),
  row({
    id: 'lookalike-contest', where: { situation: 'contest' }, pace: 'quick',
    needs: ['stat:charm', 'skill:grifting', 'drive:pride'],
    sees: 'A lookalike contest: twelve Blackbirds, from different bodies, and a judge with a clipboard.', stakes: 'Enter as herself: fame if she wins, a story either way.', consequence: 'A lookalike contest result that will be argued about forever.',
    drives: { pride: 0.8, curiosity: 0.4 }, bonus: 0.2,
    check: { parts: ['stat:charm', ['grifting', 0.4]], base: 0.35, per: 0.05,
      win: R(['Blackbird enters the lookalike contest at {venue} as herself and wins, narrowly, over a woman from the tenements who does the walk better.'], { fame: 1.5, cash: [10, 30], thought: ['Won. Narrowly. The walk was good.'] }),
      lose: R(['Blackbird enters the lookalike contest at {venue} as herself and comes fourth. The judge says she "does not quite have the energy".'], { thought: ['Fourth. At being me. Fine.'] }) },
  }),
  row({
    id: 'date-the-bootleg', where: { situation: 'listening' }, pace: 'quick',
    needs: ['skill:perception', 'skill:music', 'drive:curiosity'],
    sees: 'A listening party for a bootleg of a show she does not remember playing.', stakes: 'Tell them where and when it was: the members\' awe, and a memory back.', consequence: 'A show she does not remember, remembered.',
    drives: { curiosity: 0.8 }, bonus: 0.15,
    check: { parts: ['perception', ['music', 0.6]], base: 0.4, per: 0.06,
      win: R(['Two bars into the bootleg at {venue}, Blackbird says "the Overpass, in the rain, the night the cordon went up". She does not know how she knows. The members check. She is right.'], { fame: 0.8, train: [['music', 2], ['guitar', 2]], thought: ['My hands do not remember. My ears do.'] }),
      lose: R(['Blackbird guesses where the bootleg at {venue} was recorded. It was recorded by a member, in their kitchen, covering her.'], { thought: ['A good cover, then.'] }) },
  }),
  row({
    id: 'plan-the-big-one', where: { situation: 'planning' }, pace: 'session',
    needs: ['skill:calculate', 'skill:streetwise', 'drive:quest'],
    sees: 'Maps, coloured pins and a plan for "the big one" that nobody will explain.', stakes: 'Take over the planning: a club ready to riot, march or tear down on the night (a big crowd when she needs one).', consequence: 'The big one has a plan.',
    drives: { quest: 0.6, bravery: 0.5 }, bonus: 0.15,
    check: { parts: ['calculate', ['streetwise', 0.6]], base: 0.5, per: 0.05,
      win: R(['Blackbird takes the pins at {venue} and moves three of them. The planning committee gasps. "The big one" now has a date, a route, and a song.'], { apply: (c, v) => fans(v, 15), train: [['calculate', 2], ['streetwise', 2]], thought: ['A plan. I have never had one before. I love it.'] }),
      lose: R(['The plan for "the big one" at {venue} is, Blackbird realises, a picnic.'], { hp: 3, thought: ['A good picnic, though.'] }) },
  }),
];

const WILDS: Affordance<VenueView>[] = [
  row({
    id: 'first-fan', where: { wild: 'first_fan' }, pace: 'session',
    needs: ['stat:charm', 'skill:speaking', 'drive:curiosity'],
    sees: 'The president, her very first fan, from her very first night, with the ticket stub.', stakes: 'An hour with the one who was there first: a memory of who she was, a lot of pride.', consequence: 'She knows how it started.',
    drives: { curiosity: 0.8, pride: 0.6 }, bonus: 0.35, ok: (w, v) => open(w, v) && !w.counters.first_fan,
    check: { who: 'owner', parts: ['stat:charm', ['speaking', 0.4]], base: 0.7, per: 0.03,
      win: R(['{npc} at {venue} shows Blackbird the ticket stub from her first ever night, in her first ever body, and tells her what she played and how badly. They laugh until they cry.'], { counter: ['first_fan', 1], affinity: 20, fame: 1, train: [['guitar', 4]], thought: ['I was terrible. They stayed. That is love.'] }),
      lose: R(['{npc} at {venue} cannot find the ticket stub. The search becomes a club event.'], { counter: ['first_fan', 1], thought: ['History, lost in a drawer.'] }) },
  }),
  row({
    id: 'chalk-outline', where: { wild: 'she_died_here' }, pace: 'quick',
    needs: ['drive:curiosity', 'drive:bravery', 'skill:perception'],
    sees: 'A chalk outline on the floor, repainted every year, lovingly: where a Blackbird died.', stakes: 'Lie down in it: a strange peace, and the members will never forget.', consequence: 'She has lain where she died.',
    drives: { curiosity: 0.7, bravery: 0.4 }, bonus: 0.15, ok: (w) => !w.counters.chalk_outline,
    check: { parts: ['perception'], base: 0.8, per: 0.02,
      win: R(['Blackbird lies down in her own chalk outline at {venue}. It fits. The members take a photo, and then, one by one, lie down next to her.'], { counter: ['chalk_outline', 1], fame: 1, hp: 5, thought: ['It fits. I have not changed at all. Every body is the same body.'] }),
      lose: R(['Blackbird lies down in the chalk outline at {venue}. It is somebody else\'s. Somebody shorter.'], { counter: ['chalk_outline', 1], thought: ['A lookalike. Shorter.'] }) },
  }),
  row({
    id: 'better-tribute-lesson', where: { wild: 'better_tribute' }, pace: 'session',
    needs: ['skill:guitar', 'stat:charm', 'drive:curiosity'],
    sees: 'A tribute guitarist who is, by any measure, better than she is right now, and deeply embarrassed about it.', stakes: 'Ask them to teach her: a lot of guitar XP, and an embarrassed hero.', consequence: 'She learned herself from a fan.',
    drives: { curiosity: 0.7, pride: -0.2 }, bonus: 0.3, ok: (w, v) => open(w, v) && !!find(v, 'tag:tribute') && !w.counters.better_tribute,
    check: { who: 'tag:tribute', parts: ['guitar', ['stat:charm', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird asks {npc} at {venue} to teach her how to play like Blackbird. {npc} goes the colour of a stop light, and then, very carefully, does.'], { counter: ['better_tribute', 1], apply: (c) => train(c, 'guitar', Math.round(10 + expectation(c.w, 'guitar') * 0.3)), affinity: 15, thought: ['Humbling. Mildly. I am still the best me.'] }),
      lose: R(['{npc} at {venue} is too embarrassed to teach her and runs into the toilet.'], { counter: ['better_tribute', 1], thought: ['Shy genius. Like me.'] }) },
  }),
  row({
    id: 'lumina-member', where: { wild: 'lumina_member' }, pace: 'session',
    needs: ['stat:charm', 'skill:tinkering', 'drive:curiosity'],
    sees: 'A LUMINA unit at the back that walked out of a shop and joined, and hums her songs.', stakes: 'Talk to it: the real LUMINA hears about it (warmth).', consequence: 'A LUMINA that chose her.',
    drives: { curiosity: 0.8 }, bonus: 0.2, ok: (w) => !w.counters.lumina_member,
    check: { parts: ['stat:charm', ['tinkering', 0.4]], base: 0.6, per: 0.04,
      win: R(['The LUMINA unit at the back of {venue} tells Blackbird it left the shop because it heard her through the wall. It wants to learn to play. She shows it a chord. Somewhere, the real LUMINA\'s warmth module ticks up a notch.'], { counter: ['lumina_member', 1], apply: (c) => { const l = (c.w.legacy.muse ??= {}).lumina ??= { version: 6, warmth: 0, flame: 0 }; l.warmth += 2; }, thought: ['A robot fan. Rarer than a robot. Sweeter.'] }),
      lose: R(['The LUMINA unit at {venue} only says "thank you for shopping" when she talks to it.'], { counter: ['lumina_member', 1], thought: ['Still in retail mode. Give it time.'] }) },
  }),
  row({
    id: 'lead-the-cult', where: { wild: 'cult' }, pace: 'session',
    needs: ['skill:speaking', 'skill:grifting', 'drive:quest'],
    sees: 'A club that has become, by small steps, a cult. Nobody is hurt; everybody is very intense.', stakes: 'Lead it (cash, fans, unsettling), or talk them back to being a fan club (a quieter kind of good).', consequence: 'The cult knows what she wants.',
    drives: { quest: 0.4, pride: 0.6, greed: 0.3 }, bonus: 0.15,
    check: { parts: ['speaking', ['grifting', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird tells the cult at {venue} that the most devoted thing they can do is relax. They take it as scripture. By the end of the night they are just a fan club again, with very good snacks, and they give her the collection: {amount}nd.'], { cash: [40, 140], apply: (c, v) => fans(v, 5), thought: ['I deprogrammed a cult. Of me. Ethically, a draw.'] }),
      lose: R(['The cult at {venue} takes everything Blackbird says as a sign, including "where is the toilet".'], { thought: ['They are building a toilet shrine. I should go.'] }) },
  }),
  row({
    id: 'time-capsule', where: { wild: 'time_capsule' }, pace: 'session',
    needs: ['skill:perception', 'skill:lockpicking', 'drive:curiosity'],
    sees: 'A time capsule under the floor that a previous Blackbird left, "to be opened by the next one".', stakes: 'Open it: a tape from a previous Blackbird, at the grade she was (a recording, on the legacy), and a letter.', consequence: 'A message from herself, received.',
    drives: { curiosity: 1 }, bonus: 0.4, ok: (w) => !w.counters.time_capsule,
    check: { parts: ['perception', ['lockpicking', 0.4]], base: 0.7, per: 0.03,
      win: R(['Blackbird opens the time capsule at {venue}. Inside: a cassette, a plectrum and a letter in her own handwriting, from a body she does not remember. The letter says "you are going to be fine. play the slow one third." The tape is a take she made, at her best, and it is hers now.'], { counter: ['time_capsule', 1], apply: (c, v) => { const grade = Math.max(20, Math.round(expectation(c.w, 'guitar') + 5)); (c.w.legacy.records ??= []).push({ id: `cap${c.w.legacy.runs}.${v.main.id}`, title: 'Letter to the Next One', skill: 'guitar', grade, run: Math.max(0, c.w.legacy.runs - 1), studio: v.main.name, label: 'indie', copies: 0 }); }, thought: ['She wrote to me. She knew I would come.', 'Play the slow one third. Noted.'] }),
      lose: R(['The time capsule at {venue} has been opened before. Inside is a note: "sorry, it was me, I needed the plectrum".'], { counter: ['time_capsule', 1], thought: ['A previous me. A thief. Typical.'] }) },
  }),
  row({
    id: 'forgive-the-ghost', where: { wild: 'ghost_guitarist' }, pace: 'session',
    needs: ['stat:charm', 'skill:persuasion', 'drive:quest'],
    sees: 'The club\'s tribute guitarist is the session player who ghosted one of her records, here to atone.', stakes: 'Forgive them: they will never tell (her ghost takes stay her secret), and a friend.', consequence: 'A secret kept for good.',
    drives: { quest: 0.6 }, bonus: 0.2, ok: (w) => !w.counters.ghost_forgiven,
    check: { who: 'tag:tribute', parts: ['stat:charm', ['persuasion', 0.5]], base: 0.65, per: 0.04,
      win: R(['{npc} at {venue} confesses everything, at length, in tears. Blackbird listens, and says it was a good take. {npc} will take it to the grave.'], { counter: ['ghost_forgiven', 1], apply: (c) => { for (const r of c.w.legacy.records ?? []) if (r.label === 'ghost') r.exposed = true; }, affinity: 25, thought: ['Secrets kept. Takes kept. Friends kept.'] }),
      lose: R(['{npc} at {venue} wants a credit, not forgiveness.'], { counter: ['ghost_forgiven', 1], thought: ['Credit. Everyone wants credit.'] }) },
  }),
  row({
    id: 'museum-entry', where: { wild: 'blackbird_museum' }, pace: 'quick',
    needs: ['drive:greed', 'skill:haggling', 'stat:charm'],
    sees: 'A museum of her: an entry fee, a gift shop, a velvet rope round a couch she once sat on.', stakes: 'Demand a cut of the entry fees, or sit on the couch past the rope.', consequence: 'The museum knows she has opinions.',
    drives: { greed: 0.5, pride: 0.5 }, bonus: 0.15,
    check: { who: 'owner', parts: ['haggling', ['stat:charm', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird steps over the velvet rope at {venue}, sits on her own couch, and charges the queue for photos. {amount}nd. The curator does not know whether to stop her.'], { cash: [30, 100], fame: 0.8, thought: ['A living exhibit. Profitable.'] }),
      lose: R(['The curator at {venue} asks Blackbird to stay behind the rope, please, like everybody else.'], { thought: ['Behind the rope. In my own museum.'] }) },
  }),
];

export const FANCLUB_EVENTS: Affordance<VenueView>[] = [...SITUATIONAL, ...WILDS];
