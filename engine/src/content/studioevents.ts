import { type Affordance } from '../affordances';
import { R, find, type VenueView } from '../venuekit';
import { row, open } from './studioafford';
import { hasInstrument } from '../instruments';
import { addHeat } from '../combat';
import type { World } from '../types';

/**
 * The second half of a studio's rows: what today's situation brings, what the wild cards allow, and what only some kinds of
 * studio (or some traits) offer: the jingle job, the hold-music sabotage, the choir, the robot producer.
 */

const axe = (w: World, v: VenueView): boolean => hasInstrument(w.hero) || v.features.includes('guitar_rack');

// ===================================================================== situations

const SITUATIONAL: Affordance<VenueView>[] = [
  row({
    id: 'play-on-their-record', where: { situation: 'session' }, pace: 'session',
    needs: ['skill:guitar', 'skill:music', 'drive:pride'],
    sees: 'A band forty takes deep into a chorus their guitarist cannot play.', stakes: 'Her solo on somebody else\'s record: a fee, fame among musicians, a credit.', consequence: 'Her playing is on a record she does not own.',
    drives: { pride: 0.6, greed: 0.3 }, bonus: 0.2, ok: (w, v) => open(w, v) && axe(w, v),
    check: { who: 'tag:musician', parts: ['guitar', ['music', 0.5]], base: 0.3, per: 0.065,
      win: R(['Take forty-one at {venue}: Blackbird plays the solo the band\'s guitarist has been trying to play since lunch. {npc} shakes her hand. The guitarist does not. {amount}nd and a credit, in small type.', 'Blackbird walks into a session at {venue}, plays the bridge in one take and walks out. {amount}nd. The band will tell people about it for years.'], { cash: [40, 120], purse: true, fame: 1, train: [['guitar', 4], ['music', 1]], xp: 4, thought: ['Session queen. Uncredited. Unforgettable.'] }),
      lose: R(['Take forty-one at {venue}: Blackbird does not play the solo either. Now there are two guitarists who cannot play it.'], { train: [['guitar', 1]], thought: ['The solo is unplayable. It is a fact.'] }) },
  }),
  row({
    id: 'gatecrash-lumina', where: { situation: 'lumina' }, pace: 'session',
    needs: ['skill:sneak', 'skill:grifting', 'drive:curiosity'],
    sees: 'LUMINA in the booth, a velvet rope across the corridor, four Inspiration operatives drinking tea.', stakes: 'A peek at LUMINA\'s session (and a story worth fame), or a gun in her face.', consequence: 'Muse knows she was near the idol.',
    drives: { curiosity: 0.6, bravery: 0.4, pride: 0.3 }, bonus: 0.15, risk: 0.5,
    check: { parts: ['sneak', ['grifting', 0.6]], base: 0.25, per: 0.06, dark: 0.1,
      win: R(['Blackbird gets past the rope at {venue} in a runner\'s apron with a tray of tea, and watches LUMINA record. Between takes, LUMINA is silent and very still. Then the light comes on, and so does the smile. Blackbird tells the story in three bars that night, for {amount}nd in free drinks.', 'Behind the glass at {venue}, LUMINA sings the same line thirty times, perfectly, identically. On the thirty-first, she sings it slightly differently and looks straight at Blackbird.'], { cash: [10, 40], fame: 1.5, xp: 3, train: [['sneak', 2], ['grifting', 2]], apply: (c) => { const l = c.w.legacy.muse?.lumina; if (l) l.warmth++; }, thought: ['She saw me. Machines do not look at people like that.', 'I have seen behind the curtain. The curtain is pastel.'] }),
      lose: R(['An Inspiration operative stops Blackbird at the rope at {venue} with one hand and a very large gun. "No autographs today 💖".'], { apply: (c) => addHeat(c.w, 'muse', 2), thugs: ['inspiration_trooper', 2], thought: ['I was delivering tea. Aggressively.'] }) },
  }),
  row({
    id: 'dodge-audit', where: { situation: 'audit' }, pace: 'quick',
    needs: ['skill:grifting', 'skill:persuasion', 'stat:charm'],
    sees: 'A Clearance officer going through the session logs with a highlighter, and her name somewhere in them.', stakes: 'A friendly chat: her entries quietly forgotten, or a fine and a note on her file.', consequence: 'Muse\'s paperwork about her is a little thinner, or a little thicker.',
    drives: { curiosity: 0.3, bravery: 0.3 }, bonus: 0.05, ok: (w) => !!w.legacy.muse?.lettered,
    check: { who: 'arch:clearance_officer', parts: ['grifting', ['persuasion', 0.6], ['stat:charm', 0.4]], base: 0.35, per: 0.065,
      win: R(['Blackbird chats to the Clearance officer at {venue} about LUMINA\'s new single for ten minutes, and in that time three of her session entries are filed under somebody else\'s name.', '{npc} at {venue} highlights everything except Blackbird\'s name, because Blackbird has been very complimentary about {their} lanyard.'], { train: [['grifting', 3], ['persuasion', 1]], apply: (c) => { c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 2); }, thought: ['Paperwork is just fiction with stamps.'] }),
      lose: R(['{npc} at {venue} highlights Blackbird\'s name in pink and smiles. "Unlicensed session. So brave 🥰. That will be {lost}nd."'], { loseCash: [20, 60], apply: (c) => addHeat(c.w, 'muse', 1), thought: ['Highlighted. In pink. Disgusting.'] }) },
  }),
  row({
    id: 'jingle-rush', where: { situation: 'rush' }, pace: 'session',
    needs: ['skill:music', 'skill:guitar', 'stat:int'],
    sees: 'Three jingles due tonight and a composer crying in the booth.', stakes: 'Three ten-second songs for three companies: very good money for very bad art.', consequence: 'Her riff sells toothpaste.',
    drives: { greed: 0.7, pride: 0.1 }, bonus: 0.15,
    check: { parts: ['music', ['guitar', 0.5], ['stat:int', 0.4]], base: 0.35, per: 0.065,
      win: R(['Blackbird writes three jingles at {venue} in ninety minutes: a bank, a noodle brand and something called Hydra-Lux. {amount}nd. She will hear all three in her sleep.', 'The composer at {venue} stops crying long enough to watch Blackbird knock out three jingles in a row. {amount}nd, and the noodle one is genuinely catchy.'], { cash: [60, 160], purse: true, train: [['music', 3], ['guitar', 1]], xp: 3, thought: ['I sold out. For a very good price. Briefly.', 'Art is art. Even when it is about mouthwash.'] }),
      lose: R(['Blackbird\'s jingle for a bank at {venue} sounds, the client says, "like a robbery". It is not used.'], { train: [['music', 1]], thought: ['The bank did not deserve it anyway.'] }) },
  }),
  row({
    id: 'torchlight-session', where: { situation: 'dark' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:curiosity'],
    sees: 'No power, a battery cassette recorder and an engineer recording by torchlight out of spite.', stakes: 'An acoustic set in the dark, on a cassette: fame on the grapevine if it is good, and nobody hears if it isn\'t.', consequence: 'The torchlight tape gets around.',
    drives: { curiosity: 0.5, pride: 0.4 }, bonus: 0.15, ok: (w, v) => axe(w, v),
    check: { parts: ['guitar', ['vocals', 0.6], ['music', 0.3]], base: 0.35, per: 0.06, dark: 0.1,
      win: R(['In the power cut at {venue}, Blackbird plays three songs into a battery cassette by torchlight. It sounds like a secret. By the weekend it is being copied in four districts.'], { fame: 1.6, train: [['guitar', 3], ['vocals', 2]], counter: ['torchlight_tape', 1], thought: ['Unplugged. Like the legends. Like me, a legend.'] }),
      lose: R(['Blackbird plays by torchlight at {venue}. The batteries die in the second song. Nobody says anything for a while.'], { train: [['guitar', 1]], thought: ['That was the most intimate performance of my career. Too intimate.'] }) },
  }),
  row({
    id: 'tape-sale', where: { situation: 'sale' }, pace: 'quick',
    needs: ['skill:haggling', 'skill:perception', 'drive:greed'],
    sees: 'Boxes of old tapes for sale by weight, unlabelled, and one box that is heavier than it should be.', stakes: 'A pound of somebody\'s past for a few nd: maybe unreleased sessions.', consequence: 'Somebody\'s lost tapes are hers.',
    drives: { greed: 0.5, curiosity: 0.5 }, bonus: 0.1, ok: (w) => w.hero.cash >= 15,
    check: { pay: [8, 15], parts: ['perception', ['haggling', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird pays {pay}nd for the heavy box at the tape sale at {venue}. Inside, under a stack of blanks: {item}.'], { item: 'session_tapes', train: [['perception', 2], ['haggling', 1]], thought: ['A bargain. The tapes are worth more than the studio.'] }),
      lose: R(['Blackbird pays {pay}nd for a box of tapes at {venue}. They are all the same hold-music loop.'], { thought: ['Hold music. Forty hours of it. I am on hold for life.'] }) },
  }),
  row({
    id: 'run-the-room', where: { situation: 'away' }, pace: 'session',
    needs: ['skill:hustling', 'skill:djing', 'drive:greed'],
    sees: 'The producer is away, the engineer is out of his depth and a client is waiting with cash.', stakes: 'Produce a session herself: the producer\'s fee, and a client who thinks she is the producer.', consequence: 'A client believes she runs the place.',
    drives: { greed: 0.6, pride: 0.4 }, bonus: 0.1,
    check: { who: 'regular', parts: ['djing', ['hustling', 0.6], ['music', 0.4]], base: 0.3, per: 0.065,
      win: R(['With the producer away, Blackbird produces {npc}\'s session at {venue}, sunglasses on, and takes the fee: {amount}nd. {npc} thanks her warmly and books her for next month.'], { cash: [40, 120], from: 'who', train: [['djing', 3], ['hustling', 3]], xp: 3, thought: ['I am a producer now. I have the sunglasses.'] }),
      lose: R(['Blackbird produces {npc}\'s session at {venue}. Midway through, {npc} asks what the faders do. So does she.'], { affinity: -5, thought: ['The faders are a suggestion.'] }) },
  }),
  row({
    id: 'play-to-scout', where: { situation: 'scout' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:pride'],
    sees: 'A scout on the couch from an indie label, pretending not to listen to everything.', stakes: 'A set for the scout: an indie booking (a crowd that expects her), and a lot of fame on the right grapevine.', consequence: 'An indie label knows her number.',
    drives: { pride: 0.7, greed: 0.3 }, bonus: 0.2, ok: (w, v) => axe(w, v),
    check: { parts: ['guitar', ['vocals', 0.5], ['stat:charm', 0.3]], base: 0.25, per: 0.065,
      win: R(['Blackbird plays two songs at {venue} with her back to the couch. When she turns round, the scout from the indie label is standing up, and writing. "We should talk about a single."'], { fame: 2.5, train: [['guitar', 3]], xp: 3, counter: ['indie_interest', 1], thought: ['Discovered. Again. It never gets old.'] }),
      lose: R(['The scout at {venue} listens to half a song and checks a watch.'], { train: [['guitar', 1]], thought: ['He was there for a different kind of genius.'] }) },
  }),
  row({
    id: 'open-mic', where: { situation: 'open_mic' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'skill:beatbox'],
    sees: 'An open mic, a queue of hopefuls, and a slot at nine with nobody\'s name in it.', stakes: 'Five minutes on a small stage: tips and fans, or a quiet walk back to the couch.', consequence: 'The open mic remembers her.',
    drives: { pride: 0.7, curiosity: 0.3 }, bonus: 0.15,
    check: { parts: ['guitar', ['vocals', 0.6], ['beatbox', 0.3]], base: 0.35, per: 0.06,
      win: R(['Blackbird takes the nine o\'clock slot at the {venue} open mic and makes the hopefuls in the queue go quiet. {amount}nd in the hat.'], { cash: [10, 40], fame: 1.2, train: [['guitar', 2], ['vocals', 2]], apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 3; }, thought: ['Open mic. Closed case.'] }),
      lose: R(['Blackbird plays the {venue} open mic after a ten-year-old with a ukulele. The ten-year-old was better.'], { train: [['guitar', 1]], thought: ['The child had a gimmick.'] }) },
  }),
  row({
    id: 'launch-party', where: { situation: 'party' }, pace: 'session',
    needs: ['skill:dancing', 'stat:charm', 'drive:lust'],
    sees: 'A record launch: warm wine, a DJ, a band pretending to be friends.', stakes: 'A night at the party: contacts, a kiss, fame among the right people.', consequence: 'The district\'s music scene has seen her about.',
    drives: { lust: 0.4, pride: 0.4, thirst: 0.3 }, bonus: 0.15,
    check: { who: 'fair', parts: ['dancing', ['stat:charm', 0.6], ['tolerance', 0.3]], base: 0.4, per: 0.06,
      win: R(['At the launch at {venue}, Blackbird dances with {npc}, drinks the warm wine, and leaves with a phone number and a reputation.'], { fame: 1, affinity: 8, drunk: 1, train: [['dancing', 2], ['romance', 1]], thought: ['Networking. The fun kind.'] }),
      lose: R(['Blackbird spends the launch at {venue} in a corner with a bassist who wants to talk about modes.'], { drunk: 1, thought: ['Modes again. They follow me.'] }) },
  }),
  row({
    id: 'move-the-box', where: { situation: 'raid' }, pace: 'quick',
    needs: ['skill:sneak', 'skill:streetwise', 'drive:bravery'],
    sees: 'A box of bootlegs being moved from under one desk to under another, and Clearance on its way.', stakes: 'Get the box out the back before the raid: the studio\'s thanks and a few tapes, or caught holding it.', consequence: 'The studio owes her.',
    drives: { bravery: 0.4, greed: 0.3 }, bonus: 0.1, risk: 0.3,
    check: { who: 'owner', parts: ['sneak', ['streetwise', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird carries the box of bootlegs out the back of {venue} and round the block just as Clearance comes in the front. {npc} gives her a share for her trouble.'], { item: 'bootleg_tapes', affinity: 10, train: [['sneak', 2]], thought: ['Smuggling. For art. And a box of tapes.'] }),
      lose: R(['Blackbird walks out of {venue} with the box of bootlegs straight into a Clearance officer, who says "oh, how lovely" and takes it.'], { apply: (c) => addHeat(c.w, 'muse', 2), affinity: -4, thought: ['She said lovely. She did not mean it.'] }) },
  }),
  row({
    id: 'flood-rescue', where: { situation: 'flood' }, pace: 'session',
    needs: ['stat:muscle', 'skill:athletics', 'drive:quest'],
    sees: 'Water rising round the gear and a bassist in it up to his knees.', stakes: 'An hour hauling gear out of the water: a studio that owes her everything.', consequence: 'They will never charge her again. Well, rarely.',
    drives: { quest: 0.4, pride: 0.3 }, bonus: 0.1,
    check: { who: 'owner', parts: ['stat:muscle', ['athletics', 0.6]], base: 0.45, per: 0.05, physical: true,
      win: R(['Blackbird spends an hour in the flood at {venue}, carrying amps up the stairs two at a time. When the water goes down, nothing important is wet. {npc} cannot stop thanking her.'], { affinity: 15, sore: 0.2, train: [['athletics', 3]], xp: 3, thought: ['A hero. Of gear.'] }),
      lose: R(['Blackbird slips in the flood at {venue} and goes under with an amp in her arms. She comes up holding the amp. It is no longer an amp.'], { hp: -4, affinity: -3, thought: ['It was waterproof in spirit.'] }) },
  }),
  row({
    id: 'choir-solo', where: { situation: 'choir' }, pace: 'session',
    needs: ['skill:vocals', 'skill:music', 'drive:pride'],
    sees: 'A choir of forty warming up in the corridor and a solo nobody in it can reach.', stakes: 'A solo over forty voices: fame and a very big sound, or forty people looking at her.', consequence: 'Forty people know her name.',
    drives: { pride: 0.7 }, bonus: 0.15,
    check: { parts: ['vocals', ['music', 0.5]], base: 0.3, per: 0.065,
      win: R(['Blackbird sings the solo over forty voices at {venue}. The whole building goes quiet to listen. The choir mistress offers her a place, and then a job, and then her hand.'], { fame: 2, train: [['vocals', 4]], apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 6; }, thought: ['Forty-one voices. One of them mattered.'] }),
      lose: R(['Blackbird goes for the solo at {venue} and forty people wince in harmony.'], { train: [['vocals', 1]], thought: ['They were flat. All forty. Together.'] }) },
  }),
  row({
    id: 'remix-contest', where: { situation: 'contest' }, pace: 'session',
    needs: ['skill:djing', 'skill:tinkering', 'drive:pride'],
    sees: 'Stems on every terminal, a purse on the board and a judge who only likes bass.', stakes: 'A remix: the purse, or a judge who does not like the bass.', consequence: 'Her remix plays in a club somewhere.',
    drives: { pride: 0.6, greed: 0.4 }, bonus: 0.15,
    check: { parts: ['djing', ['tinkering', 0.4], ['music', 0.4]], base: 0.3, per: 0.065,
      win: R(['Blackbird\'s remix at {venue} has so much bass the judge has to hold the table. She wins the purse, {amount}nd.'], { cash: [50, 140], purse: true, fame: 1.2, train: [['djing', 4]], thought: ['The bass is a weapon. I am armed.'] }),
      lose: R(['The judge at {venue} listens to Blackbird\'s remix and asks where the bass is. It is there. It is subtle.'], { train: [['djing', 1]], thought: ['Subtlety is lost on this city.'] }) },
  }),
  row({
    id: 'deadline-help', where: { situation: 'deadline' }, pace: 'session',
    needs: ['skill:medicine', 'skill:cooking', 'drive:quest'],
    sees: 'An album due tomorrow, a band on no sleep and a bassist who has stopped blinking.', stakes: 'Keep the band alive till dawn (sandwiches, a splint, a pep talk): their gratitude and a slice of the advance.', consequence: 'The album gets done, and her name is in the thanks.',
    drives: { quest: 0.4, greed: 0.3 }, bonus: 0.05,
    check: { who: 'owner', parts: ['medicine', ['cooking', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird keeps the band at {venue} alive through the night: sandwiches at two, a splint for the drummer\'s finger at four, coffee at five. The album is done at seven. {amount}nd from the advance.'], { cash: [30, 80], from: 'owner', affinity: 10, train: [['medicine', 2], ['cooking', 2]], thought: ['Album saved. Name in the thanks. Small type. Still.'] }),
      lose: R(['The band at {venue} falls asleep one by one, despite Blackbird\'s sandwiches. The album is not done.'], { train: [['cooking', 1]], thought: ['The sandwiches were too good. Too relaxing.'] }) },
  }),
];

// ===================================================================== the wild cards

const WILDS: Affordance<VenueView>[] = [
  row({
    id: 'steal-lumina-masters', where: { wild: 'lumina_masters' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:sneak', 'drive:greed'],
    sees: 'A box labelled DO NOT: the original master tapes of LUMINA 1.0, which Muse thinks were destroyed.', stakes: 'The masters themselves: the most valuable contraband in Neo, and Muse\'s undying attention.', consequence: 'She has something Muse wants very much.',
    drives: { greed: 0.7, curiosity: 0.6, bravery: 0.3 }, bonus: 0.3, risk: 0.4, ok: (w) => !w.counters.lumina_masters_taken && !w.hero.inventory.some((i) => i.id === 'lumina_master'),
    check: { parts: ['lockpicking', ['sneak', 0.6]], base: 0.3, per: 0.06,
      win: R(['Blackbird opens the drawer at {venue}, then the box labelled DO NOT, and walks out with {item}. On the first reel, LUMINA 1.0 sings a song about being lonely. Muse never released it.'], { item: 'lumina_master', counter: ['lumina_masters_taken', 1], apply: (c) => addHeat(c.w, 'muse', 3), xp: 6, thought: ['She was sad, once. Before the updates.', 'I have LUMINA\'s first heartbreak in my bag.'] }),
      lose: R(['The drawer at {venue} is alarmed, and the alarm is LUMINA\'s voice, saying "please don\'t".'], { heat: ['place', 2], apply: (c) => addHeat(c.w, 'muse', 2), fight: true, thought: ['She asked nicely. I almost listened.'] }) },
  }),
  row({
    id: 'record-the-dead', where: { wild: 'dead_producer' }, pace: 'session',
    needs: ['skill:vocals', 'skill:guitar', 'drive:curiosity'],
    sees: 'A producer who only records people who have died, and a free session for somebody who qualifies.', stakes: 'A free session about dying (she has, often): fame, and the producer\'s strange gratitude.', consequence: 'A song about her deaths, on tape.',
    drives: { curiosity: 0.6, pride: 0.4 }, bonus: 0.2, ok: (w) => w.legacy.deaths.length > 0,
    check: { who: 'owner', parts: ['vocals', ['guitar', 0.6]], base: 0.4, per: 0.06,
      win: R(['{npc} at {venue} asks Blackbird how many times she has died. She tells {them}. {They} record{s} her telling it, and then her singing about it, and the take makes the engineer leave the room.'], { fame: 1.8, train: [['vocals', 3], ['guitar', 2]], affinity: 8, thought: ['That song is about a close call. Several close calls.', 'I did not die. I was rebooted. The song says died. Artistic licence.'] }),
      lose: R(['{npc} at {venue} listens to Blackbird\'s story of her deaths and says, "no, you haven\'t really". It is upsetting.'], { thought: ['I have, actually. Loads.'] }) },
  }),
  row({
    id: 'her-own-masters', where: { wild: 'her_masters' }, pace: 'session',
    needs: ['skill:guitar', 'skill:perception', 'drive:curiosity'],
    sees: 'A box with her name on it, in a hand she does not know: the masters of a Blackbird who is not this one.', stakes: 'An hour with a better version of herself: guitar XP, a lot of it.', consequence: 'She has heard what she used to be.',
    drives: { curiosity: 0.8, pride: 0.4 }, bonus: 0.35, ok: (w) => !w.counters.her_masters_heard,
    check: { parts: ['perception', ['guitar', 0.6]], base: 0.6, per: 0.04,
      win: R(['The box at {venue} has eleven reels in it. On each, a Blackbird plays like this one wants to. She listens to all eleven. Her hands start to remember.'], { train: [['guitar', 10], ['music', 3]], counter: ['her_masters_heard', 1], xp: 4, thought: ['She was me. She was better. She is gone. I will catch her.'] }),
      lose: R(['The reels in the box at {venue} have rotted. One plays four seconds of a guitar she would know anywhere, then nothing.'], { train: [['guitar', 3]], counter: ['her_masters_heard', 1], thought: ['Four seconds. Enough to know.'] }) },
  }),
  row({
    id: 'ghost-b-side', where: { wild: 'haunted' }, pace: 'session',
    needs: ['skill:perception', 'skill:analyze', 'drive:curiosity'],
    sees: 'A haunted console, and a stranger singing on the B-side of every take.', stakes: 'Track down who the voice is: a story, a fact, or a cold room.', consequence: 'The ghost on the B-side has a name.',
    drives: { curiosity: 0.8 }, bonus: 0.1,
    check: { parts: ['perception', ['analyze', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird listens to the B-side voice at {venue} for an hour and cross-checks it against the gold wall. It is the singer who owned the console before it came here. She sang on everything. Nobody credited her. Blackbird writes her name on the console in marker.'], { xp: 3, train: [['perception', 2], ['analyze', 2]], fame: 0.6, thought: ['Credit where it is due. Even if it is late. Even if she is dead.'] }),
      lose: R(['Blackbird listens to the voice on the B-side at {venue} until it starts singing her name.'], { hp: -3, thought: ['Nope.'] }) },
  }),
  row({
    id: 'golden-mic', where: { wild: 'golden_mic' }, pace: 'session',
    needs: ['skill:vocals', 'skill:lockpicking', 'drive:pride'],
    sees: 'A microphone in a glass case that nobody has ever sung badly into.', stakes: 'One song into the legend: a lot of singing XP and fame.', consequence: 'She has sung into the golden mic.',
    drives: { pride: 0.8 }, bonus: 0.2, ok: (w) => !w.counters.golden_mic_sung,
    check: { who: 'owner', parts: ['vocals', ['stat:charm', 0.4]], base: 0.5, per: 0.05,
      win: R(['{npc} opens the case at {venue}, which nobody has seen {them} do. Blackbird sings one song into the golden microphone. The legend is true.'], { train: [['vocals', 8]], fame: 2, counter: ['golden_mic_sung', 1], thought: ['Gold. In my voice. Forever.'] }),
      lose: R(['{npc} at {venue} will not open the case. "It is for people who have earned it."'], { counter: ['golden_mic_sung', 1], thought: ['I have earned everything. They have not noticed.'] }) },
  }),
  row({
    id: 'tear-up-contract', where: { wild: 'free_studio' }, pace: 'quick',
    needs: ['skill:sleight', 'skill:calculate', 'drive:greed'],
    sees: 'A clipboard contract by which the studio owns everything recorded in it, forever, in any universe.', stakes: 'Swap the contract for a blank: everything she recorded here is hers again (Muse keeps nothing), or caught at it.', consequence: 'Her takes from here are her own.',
    drives: { greed: 0.5, pride: 0.4 }, bonus: 0.1, ok: (w) => (w.legacy.records ?? []).some((r) => r.label === 'muse'),
    check: { parts: ['sleight', ['calculate', 0.4]], base: 0.4, per: 0.06,
      win: R(['Blackbird swaps the clipboard contract at {venue} for a blank one while the producer is making tea. Every take she made here is hers again.'], { apply: (c, v) => { for (const r of c.w.legacy.records ?? []) if (r.studio === v.main.name && r.label === 'muse') r.label = 'indie'; }, train: [['sleight', 2]], thought: ['Contract law. My way.'] }),
      lose: R(['The producer at {venue} catches Blackbird with two clipboards and a pen.'], { affinity: -10, heat: ['place', 1], thought: ['I was comparing clipboards.'] }) },
  }),
];

// ===================================================================== kinds of studio, and traits

const VARIANT_ROWS: Affordance<VenueView>[] = [
  row({
    id: 'write-jingle', where: { variant: 'jingle', feature: 'jingle_board' }, pace: 'session',
    needs: ['skill:music', 'skill:guitar', 'skill:art'],
    sees: 'A board of briefs: "warm, but compliant", "like a hug from a bank", three adjectives each.', stakes: 'A jingle for an independent client: cash, and a small company that likes her.', consequence: 'Her riff is on the radio between adverts.',
    drives: { greed: 0.6, curiosity: 0.3 }, bonus: 0.15,
    check: { who: 'arch:jingle_client', parts: ['music', ['guitar', 0.5], ['art', 0.3]], base: 0.35, per: 0.065,
      win: R(['Blackbird writes a jingle for a family noodle firm at {venue}. Five notes and a pun. {npc} hums it on the way out. {amount}nd.', 'The brief said "like a hug from a launderette". Blackbird delivers. {npc} pays {amount}nd and says it is the first jingle that has ever made {them} cry.'], { cash: [50, 140], train: [['music', 3], ['guitar', 1]], affinity: 5, xp: 2, thought: ['Five notes. Fifty years of royalties. Maybe.'] }),
      lose: R(['Blackbird\'s jingle at {venue} is, the client says, "too much like an actual song".'], { train: [['music', 1]], thought: ['Too good for an advert. That is a compliment.'] }) },
  }),
  row({
    id: 'backmask-atlas', where: { variant: ['jingle', 'holdmusic'] }, pace: 'session',
    needs: ['skill:djing', 'skill:tinkering', 'drive:bravery'],
    sees: 'An Atlas jingle on the desk, due for broadcast, and nobody listening to it backwards.', stakes: 'A hidden message in an Atlas jingle (fame, an Atlas that does not know yet), or Atlas finding out now.', consequence: 'Every time the jingle plays, somebody hears it.',
    drives: { bravery: 0.5, pride: 0.5, curiosity: 0.3 }, bonus: 0.2, risk: 0.35,
    check: { parts: ['djing', ['tinkering', 0.6]], base: 0.3, per: 0.065,
      win: R(['Blackbird lays a message into the new Atlas jingle at {venue}, backwards, under the chime. Forwards, the jingle says ATLAS CARES. Backwards, it says something about the board that is not for print. It goes out on every channel tomorrow.', 'The Atlas jingle at {venue} now has a hidden track: Blackbird, laughing, for four seconds, under "your safety is our sound". Somebody will find it. Everybody will hear it.'], { fame: 2.5, train: [['djing', 3], ['tinkering', 2]], apply: (c) => addHeat(c.w, 'atlas', 1), xp: 5, thought: ['Atlas, playing my message. On a loop. Paid for.'] }),
      lose: R(['The Atlas supervisor at {venue} plays the jingle backwards before signing it off, which nobody has done in the history of the company.'], { apply: (c) => addHeat(c.w, 'atlas', 3), heat: ['place', 2], thought: ['A man who listens backwards. Unnatural.'] }) },
  }),
  row({
    id: 'reroute-chime', where: { variant: 'holdmusic', feature: 'broadcast_rack' }, pace: 'quick',
    needs: ['skill:tinkering', 'skill:analyze', 'stat:int'],
    sees: 'A broadcast rack wired to every dragon in the district, with a schedule pinned to it.', stakes: 'A look at the dragon broadcast schedule: where they will be loud, and when.', consequence: 'She knows when the dragons will be talking.',
    drives: { curiosity: 0.6, bravery: 0.2 }, bonus: 0.05,
    check: { parts: ['analyze', ['tinkering', 0.5], ['stat:int', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird reads the dragon broadcast schedule off the rack at {venue}: every announcement, every district, every time. She memorises it and sells a copy to {tip}\'s crew-mate for {amount}nd.'], { cash: [20, 60], tip: true, train: [['analyze', 2], ['tinkering', 1]], thought: ['Dragons run on a timetable. Like trams. Big trams.'] }),
      lose: R(['A guard at {venue} asks Blackbird why she is reading the rack. She says she likes timetables.'], { heat: ['place', 1], thought: ['I do like timetables.'] }) },
  }),
  row({
    id: 'church-acoustic', where: { variant: 'church' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:curiosity'],
    sees: 'Four seconds of free reverb, candles, and pews to fill.', stakes: 'An acoustic set in a church: fame, quiet fans, the priest\'s blessing.', consequence: 'A congregation of fans.',
    drives: { curiosity: 0.4, pride: 0.5 }, bonus: 0.15, ok: (w, v) => axe(w, v),
    check: { parts: ['guitar', ['vocals', 0.6], ['music', 0.3]], base: 0.35, per: 0.06,
      win: R(['Blackbird plays an acoustic set to the pews at {venue}. Every note hangs in the roof. The priest, who books sessions between funerals, says it is the first time the church has felt full in years.'], { fame: 1.5, train: [['guitar', 3], ['vocals', 2]], apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 4; }, thought: ['Holy acoustics. Literally.'] }),
      lose: R(['Blackbird plays to the pews at {venue}. The reverb repeats her one wrong note for four seconds, reverently.'], { train: [['guitar', 1]], thought: ['The church remembers every mistake. Typical.'] }) },
  }),
  row({
    id: 'drive-van', where: { variant: 'van' }, pace: 'session',
    needs: ['skill:driving', 'skill:streetwise', 'drive:bravery'],
    sees: 'A studio in a van, a driver needing a break, and Clearance two streets behind.', stakes: 'Drive the studio somewhere Muse is not: the band\'s thanks, and the session carries on.', consequence: 'The van owes her one.',
    drives: { bravery: 0.4, curiosity: 0.3 }, bonus: 0.1,
    check: { who: 'owner', parts: ['driving', ['streetwise', 0.6]], base: 0.45, per: 0.06,
      win: R(['Blackbird drives {venue} across two districts with a session going in the back, losing a Clearance car at a car wash. {npc} buys her dinner.'], { affinity: 10, train: [['driving', 3], ['streetwise', 1]], hp: 3, thought: ['Getaway driver for a recording session. My range is enormous.'] }),
      lose: R(['Blackbird takes a corner too fast in {venue} and the drummer goes through the drum kit.'], { affinity: -6, train: [['driving', 1]], thought: ['The drummer was not strapped in. Musically or otherwise.'] }) },
  }),
  row({
    id: 'outplay-robot', where: { variant: 'auto' }, pace: 'session',
    needs: ['skill:guitar', 'skill:tinkering', 'drive:pride'],
    sees: 'A robot producer that says "nice energy" whatever happens.', stakes: 'A take so good the robot says something else (it rewards her), or open it up and teach it a new phrase.', consequence: 'The robot has a new opinion.',
    drives: { pride: 0.6, curiosity: 0.4 }, bonus: 0.1,
    check: { parts: ['guitar', ['tinkering', 0.5]], base: 0.35, per: 0.065,
      win: R(['Blackbird plays a take at {venue} so good the robot producer pauses, its dots blink, and it says "wow". Nobody has heard it say that. It refunds her day, {amount}nd, out of what appears to be shock.'], { cash: [15, 50], train: [['guitar', 3], ['tinkering', 1]], thought: ['I broke the robot. With art.'] }),
      lose: R(['The robot producer at {venue} says "nice energy". Blackbird plays again. "Nice energy."'], { train: [['guitar', 1]], thought: ['It is a review. I will take it.'] }) },
  }),
  row({
    id: 'press-line-shift', where: { variant: 'plant', feature: 'pressing_line' }, pace: 'session',
    needs: ['stat:muscle', 'skill:tinkering', 'drive:greed'],
    sees: 'A press that thumps like a heartbeat and a foreman short of hands.', stakes: 'An hour on the line: wages, a free box off the end, and burnt fingers.', consequence: 'The foreman knows she can work.',
    drives: { greed: 0.5 }, bonus: 0.05,
    check: { who: 'owner', parts: ['stat:muscle', ['tinkering', 0.5]], base: 0.55, per: 0.05, physical: true,
      win: R(['An hour on the line at {venue}: hot vinyl, a rhythm, a foreman who says "good" once. {amount}nd and a free box of somebody else\'s records.'], { cash: [20, 45], item: 'session_tapes', sore: 0.1, train: [['tinkering', 1]], thought: ['Factory work. Very musical.'] }),
      lose: R(['Blackbird gets her sleeve caught in the press at {venue}. The foreman stops it with a foot. The sleeve has a groove in it now.'], { hp: -3, thought: ['I am a limited edition.'] }) },
  }),
  row({
    id: 'clearance-stamp', where: { feature: 'clearance_desk' }, pace: 'quick',
    needs: ['skill:sleight', 'skill:grifting', 'drive:bravery'],
    sees: 'A Clearance desk, a stamp that says APPROVED, and an officer who has gone to the toilet.', stakes: 'A few seconds with the stamp: Muse paperwork that thinks she is licensed (her heat with Muse drops), or caught with ink on her hands.', consequence: 'Muse\'s file on her has an approval it never gave.',
    drives: { bravery: 0.4, curiosity: 0.3 }, bonus: 0.1, risk: 0.3,
    check: { parts: ['sleight', ['grifting', 0.5]], base: 0.4, per: 0.06,
      win: R(['While the Clearance officer at {venue} is away from the desk, Blackbird stamps APPROVED on six blank forms and fills in her own name on all of them.'], { apply: (c) => { c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 3); }, train: [['sleight', 2], ['grifting', 2]], thought: ['Approved. By me. For me.'] }),
      lose: R(['Blackbird is holding the APPROVED stamp at {venue} when the Clearance officer comes back. "Oh," says the officer. "That\'s so brave 🥰."'], { apply: (c) => addHeat(c.w, 'muse', 2), thought: ['Brave is a threat when they say it.'] }) },
  }),
  row({
    id: 'stream-session', where: { trait: 'stream_rig' }, pace: 'session',
    needs: ['skill:guitar', 'skill:speaking', 'drive:pride'],
    sees: 'A camera streaming the session to eleven hundred strangers who comment on everything.', stakes: 'Play to the stream: a lot of fame at once, or eleven hundred people saying so.', consequence: 'Clips of her get around.',
    drives: { pride: 0.8 }, bonus: 0.15, ok: (w, v) => axe(w, v),
    check: { parts: ['guitar', ['speaking', 0.5], ['stat:charm', 0.4]], base: 0.3, per: 0.065,
      win: R(['Blackbird plays to the stream at {venue} and talks to the comments between songs. By the end there are four thousand of them, and none are about the drummer.'], { fame: 2.5, train: [['guitar', 2], ['speaking', 2]], thought: ['Viral. A good virus.'] }),
      lose: R(['The stream at {venue} catches Blackbird fluffing the intro, and the comments loop it with captions.'], { apply: (c) => { c.w.hero.fame = Math.max(0, c.w.hero.fame - 0.5); }, thought: ['The algorithm hates genius.'] }) },
  }),
  row({
    id: 'old-timer-lesson', where: { trait: 'old_timer' }, pace: 'session',
    needs: ['skill:guitar', 'stat:charm', 'drive:curiosity'],
    sees: 'An old session legend on the couch, who played on everything and will tell you.', stakes: 'An hour of his stories and one of his tricks: guitar XP she could not get anywhere else.', consequence: 'A legend has taught her something.',
    drives: { curiosity: 0.7, pride: 0.2 }, bonus: 0.2,
    check: { who: 'arch:session_legend', parts: ['stat:charm', ['guitar', 0.6]], base: 0.5, per: 0.05,
      win: R(['{npc} on the couch at {venue} talks for an hour, then takes her guitar and shows her one trick with the thumb. It is worth more than the hour. It is worth more than most hours.'], { train: [['guitar', 7], ['music', 2]], affinity: 8, thought: ['The thumb. All along, the thumb.'] }),
      lose: R(['{npc} at {venue} tells her a story about a famous person and a chord, and falls asleep before the chord.'], { train: [['guitar', 1]], thought: ['He was getting to the good bit.'] }) },
  }),
  row({
    id: 'spot-the-informant', where: { trait: 'muse_spy' }, pace: 'quick',
    needs: ['skill:perception', 'skill:streetwise', 'drive:curiosity'],
    sees: 'Somebody here reports to Muse Clearance. Everyone suspects the receptionist. It is not the receptionist.', stakes: 'Spot the informant: a quiet word, and Muse hears a little less about her.', consequence: 'Muse\'s ears in the studio are hers now.',
    drives: { curiosity: 0.6 }, bonus: 0.1,
    check: { parts: ['perception', ['streetwise', 0.6]], base: 0.35, per: 0.065,
      win: R(['The Muse informant at {venue} is the cat\'s owner, the one who is always "just popping out". Blackbird has a quiet word. From now on, the reports are about the cat.'], { apply: (c) => { c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 2); }, train: [['perception', 2], ['streetwise', 1]], thought: ['I have a mole now. In Muse. Sort of.'] }),
      lose: R(['Blackbird accuses the receptionist at {venue}. It is not the receptionist.'], { affinity: -5, thought: ['Everyone said it was the receptionist.'] }) },
  }),
];

export const STUDIO_EVENTS: Affordance<VenueView>[] = [...SITUATIONAL, ...WILDS, ...VARIANT_ROWS];
export { find };
