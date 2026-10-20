import { type Affordance } from '../affordances';
import { R, type VenueView } from '../venuekit';
import { row, open, inside, fans } from './arenaafford';
import { acquire, addHeat } from '../combat';
import { hasInstrument } from '../instruments';
import { addDeed, resurface } from '../provenance';

/**
 * The second half of an arena's rows: what tonight's bill brings (LUMINA, a rally, a match, monster trucks, a prize fight, a
 * festival, the talent final, an auction), and the wild cards.
 */

const BILLS: Affordance<VenueView>[] = [
  row({
    id: 'chart-war-lumina', where: { situation: 'lumina' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:pride'],
    sees: 'LUMINA live, forty thousand light-sticks, and a car park full of people who could not get in.', stakes: 'Play the car park while LUMINA plays the arena: steal half her crowd (fame, fans, Muse heat), or be drowned out.', consequence: 'The car park was the better gig.',
    drives: { pride: 1, bravery: 0.4 }, bonus: 0.3, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['guitar', ['vocals', 0.5], ['stat:charm', 0.3]], base: 0.3, per: 0.06,
      win: R(['While LUMINA plays the arena at {venue}, Blackbird plays the car park, off a bus roof. By the second song the light-sticks are coming out of the exits towards her.'], { fame: 4, apply: (c, v) => { fans(v, 15); addHeat(c.w, 'muse', 2); }, thought: ['A chart war, won in a car park.'] }),
      lose: R(['Blackbird plays the car park at {venue}. LUMINA\'s PA is louder than physics.'], { thought: ['Out-decibelled. Not out-played.'] }) },
  }),
  row({
    id: 'counter-the-rally', where: { situation: 'rally' }, pace: 'session',
    needs: ['skill:guitar', 'skill:speaking', 'drive:bravery'],
    sees: 'An Atlas safety rally: forty thousand people who were told to come, the CEO on the big screen, a dragon on the roof.', stakes: 'Start a song in the stands that is not about safety: the crowd turns (fame, fans), Atlas very much notices.', consequence: 'An Atlas rally that sang the wrong song.',
    drives: { bravery: 0.8, pride: 0.7 }, bonus: 0.3, risk: 0.5, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['guitar', ['speaking', 0.5], ['stat:charm', 0.4]], base: 0.25, per: 0.06,
      win: R(['In the middle of the Atlas rally at {venue}, Blackbird starts a song in the stands. One section sings it. Then three. By the end the CEO\'s face on the big screen is talking over forty thousand people singing about something else.'], { fame: 6, apply: (c, v) => { fans(v, 25); addHeat(c.w, 'atlas', 3); }, thought: ['Their rally. My song.', 'The CEO heard it. I hope she remembers who she was.'] }),
      lose: R(['Blackbird starts a song at the Atlas rally at {venue}. A steward and two troopers start walking towards her before the chorus.'], { apply: (c) => addHeat(c.w, 'atlas', 2), thugs: ['atlas_trooper', 2], thought: ['A hostile audience. Literally.'] }) },
  }),
  row({
    id: 'bet-the-final', where: { situation: 'bets' }, pace: 'quick',
    needs: ['skill:calculate', 'skill:cards', 'drive:greed'],
    sees: 'A final, a crowd betting everything, and odds that are wrong.', stakes: 'A bet: money, or less money.', consequence: 'Her money rode on it.',
    drives: { greed: 0.7 }, bonus: 0.15, ok: (w) => w.hero.cash >= 30,
    check: { pay: [20, 30], parts: ['calculate', ['cards', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird puts {pay}nd on the outsider at {venue}. The outsider wins. She collects {amount}nd from a bookie who does not want to give it to her.'], { cash: [60, 200], purse: true, train: [['calculate', 2]], thought: ['Maths. Applied.'] }),
      lose: R(['Blackbird\'s {pay}nd at {venue} is on the side that loses by a point.'], { thought: ['A point. A single point.'] }) },
  }),
  row({
    id: 'drive-a-monster-truck', where: { situation: 'trucks' }, pace: 'session',
    needs: ['skill:driving', 'stat:reflex', 'drive:bravery'],
    sees: 'Eight monster trucks, a pile of crushed cars, and a driver who has had one too many.', stakes: 'Take his place for a run: fame, a roar from the stands, or a roll.', consequence: 'She has driven a monster truck in front of thousands.',
    drives: { bravery: 0.9, pride: 0.6 }, bonus: 0.25, risk: 0.4,
    check: { parts: ['driving', ['stat:reflex', 0.6]], base: 0.35, per: 0.06,
      win: R(['Blackbird takes a monster truck over the crushed cars at {venue}, lands it on four wheels and does a doughnut in front of the main stand. The crowd chant a name they have only just learned.'], { fame: 2, train: [['driving', 4]], thought: ['Big wheels. Bigger crowd.'] }),
      lose: R(['Blackbird takes the monster truck at {venue} over the cars and onto its roof. She climbs out and waves. It counts as a show.'], { hp: -8, fame: 0.5, thought: ['Upside down is a style.'] }) },
  }),
  row({
    id: 'enter-the-ring', where: { situation: 'fight_night' }, pace: 'fight',
    needs: ['skill:melee', 'stat:muscle', 'drive:bravery'],
    sees: 'A prize fight, a ring in the middle of the floor, and the purse on a board.', stakes: 'Fight on the undercard: a purse and fame, or a long lie down.', consequence: 'She fought at the arena.',
    drives: { bravery: 0.8, greed: 0.5 }, bonus: 0.15, risk: 0.5,
    check: { parts: ['melee', ['stat:muscle', 0.6]], base: 0.3, per: 0.05, physical: true,
      win: R(['Blackbird fights on the undercard at {venue} and wins in the third, to a crowd that came for somebody else. {amount}nd.'], { cash: [80, 250], purse: true, fame: 2, sore: 0.3, train: [['melee', 4]], thought: ['A different kind of headliner.'] }),
      lose: R(['Blackbird fights on the undercard at {venue} and loses on points, both of which were the other woman\'s fists.'], { hp: -12, sore: 0.4, thought: ['Points are a construct.'] }) },
  }),
  row({
    id: 'festival-fringe', where: { situation: 'festival' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:pride'],
    sees: 'An indie festival with a fringe in the car park, three stages and sixty acts.', stakes: 'Grab a fringe slot: fame, fans, and a booking or two.', consequence: 'The festival saw her.',
    drives: { pride: 0.8, curiosity: 0.4 }, bonus: 0.25, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['guitar', ['vocals', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird talks her way onto the fringe stage at the {venue} festival between two bands nobody can tell apart. By her last song the main stage is half empty and the fringe is full.'], { fame: 3, apply: (c, v) => fans(v, 12), thought: ['Fringe. Centre. Same thing, tonight.'] }),
      lose: R(['Blackbird plays the fringe at {venue} at the same time as the headliner. Four people and a dog.'], { fame: 0.3, thought: ['The dog was into it.'] }) },
  }),
  row({
    id: 'refuse-the-trophy', where: { situation: 'pride' }, pace: 'session',
    needs: ['skill:vocals', 'skill:speaking', 'drive:pride'],
    sees: 'The live final of Neo\'s Next Star, and Pride, from the Atlas board, waiting to hand over the trophy on live TV.', stakes: 'Win the final, then refuse the trophy from Pride, on air: enormous fame, and Atlas furious.', consequence: 'Pride was snubbed on live TV.',
    drives: { pride: 1, bravery: 0.7 }, bonus: 0.35, risk: 0.4,
    check: { pay: [10, 20], parts: ['vocals', ['speaking', 0.5], ['stat:charm', 0.4]], base: 0.25, per: 0.06,
      win: R(['Blackbird wins the talent final at {venue}. Pride walks on with the trophy and the smile. She looks at the trophy, then at the camera, and says she would rather have her songs back. Pride keeps smiling for eleven seconds too long. The clip runs everywhere.'], { fame: 8, apply: (c) => addHeat(c.w, 'atlas', 3), thought: ['Pride, holding a trophy nobody wanted. On live TV.'] }),
      lose: R(['Blackbird goes out of the talent final at {venue} in the semis, to a ventriloquist.'], { thought: ['The puppet had range.'] }) },
  }),
  row({
    id: 'memorabilia-auction', where: { situation: 'auction' }, pace: 'session',
    needs: ['skill:haggling', 'skill:perception', 'drive:pride'],
    sees: 'A memorabilia auction on the main stage, and lot forty is a guitar that looks very familiar.', stakes: 'Bid on her own old guitar (if the city has one): it comes home, story and all.', consequence: 'Her guitar came home from auction.',
    drives: { pride: 0.8, greed: 0.3 }, bonus: 0.3, ok: (w) => !!w.legacy.lostGuitars?.length && w.hero.cash >= 150,
    check: { pay: [100, 150], parts: ['haggling', ['perception', 0.5]], base: 0.5, per: 0.05,
      win: R(['Lot forty at {venue} is her guitar from a body she does not remember. She wins it for {pay}nd against a collector who did not know who he was bidding against. {item}.'], { apply: (c, _v, _w, tok) => { const g = resurface(c.w, c.rng); if (g) { addDeed(g, 'bought back at auction'); acquire(c, g); tok.item = g.name; } else tok.item = 'nothing, in the end'; }, thought: ['Sold. To its owner.'] }),
      lose: R(['Lot forty at {venue} goes to a collector for far more than Blackbird has. She keeps the {pay}nd paddle fee as a lesson.'], { thought: ['Somebody loves that guitar. Good.'] }) },
  }),
];

const WILDS: Affordance<VenueView>[] = [
  row({
    id: 'her-poster', where: { wild: 'her_poster' }, pace: 'quick',
    needs: ['drive:pride', 'skill:perception'],
    sees: 'Her face on a poster in the tunnel, from a show a previous Blackbird headlined here.', stakes: 'A look, and the crew\'s stories: pride, and they let her through.', consequence: 'The crew remember her.',
    drives: { pride: 0.8 }, bonus: 0.2,
    check: { parts: ['perception', ['stat:charm', 0.3]], base: 0.7, per: 0.03,
      win: R(['A roadie at {venue} sees Blackbird looking at her own poster in the tunnel and tells her about the night: the rain, the encore, the dragon that hummed along. Then he waves her through.'], { fame: 0.5, apply: (c, v) => { c.w.counters[`arena_in:${v.main.id}`] = 1; }, thought: ['I headlined here. I will again.'] }),
      lose: R(['Her poster at {venue} has a moustache drawn on it.'], { thought: ['A good moustache, though.'] }) },
  }),
  row({
    id: 'play-for-the-hera', where: { wild: 'hera_roof' }, pace: 'session',
    needs: ['skill:guitar', 'drive:bravery', 'stat:charm'],
    sees: 'A Hera-class dragon parked on the roof "for security", watching the crowd with one enormous lens.', stakes: 'Play to the dragon: it leaves, and the city talks about it for years. Or it does not like the song.', consequence: 'The night the Hera left.',
    drives: { bravery: 0.9, pride: 0.7 }, bonus: 0.2, risk: 0.6, ok: (w) => hasInstrument(w.hero) && !w.counters.arena_hera,
    check: { parts: ['guitar', ['stat:charm', 0.3]], base: 0.15, per: 0.05,
      win: R(['Blackbird climbs onto the roof of {venue} and plays to the Hera, one song, eye to lens. When she finishes, the Hera lifts off, slowly, and the whole arena watches it go.'], { fame: 8, apply: (c) => { c.w.counters.arena_hera = 1; addHeat(c.w, 'atlas', 2); }, thought: ['A dragon. Moved. By me.'] }),
      lose: R(['The Hera on the roof of {venue} turns its lens on Blackbird and plays the lockdown chime at her, very loudly.'], { hp: -15, apply: (c) => { c.w.counters.arena_hera = 1; }, thought: ['A critic with a death ray.'] }) },
  }),
  row({
    id: 'play-both-shows', where: { wild: 'double_booked' }, pace: 'session',
    needs: ['skill:grifting', 'skill:hustling', 'drive:greed'],
    sees: 'Two acts, one stage, and a promoter hiding in a cupboard.', stakes: 'Sort it out: a fee from the grateful promoter.', consequence: 'The promoter owes her.',
    drives: { greed: 0.5, curiosity: 0.5 }, bonus: 0.15,
    check: { parts: ['grifting', ['hustling', 0.5]], base: 0.45, per: 0.05,
      win: R(['Blackbird talks the two acts at {venue} into a co-headline, convinces each that they are closing, and is paid {amount}nd by a promoter who comes out of the cupboard weeping.'], { cash: [100, 300], thought: ['Diplomacy. For a fee.'] }),
      lose: R(['Both acts at {venue} play at once. It is, by accident, quite good.'], { thought: ['Experimental.'] }) },
  }),
  row({
    id: 'back-from-the-dead', where: { wild: 'dead_crowd' }, pace: 'session',
    needs: ['stat:charm', 'skill:guitar', 'drive:pride'],
    sees: 'A crowd full of fans who think she is dead, and candles in the stands.', stakes: 'Walk on: a resurrection in front of thousands.', consequence: 'The city saw her come back.',
    drives: { pride: 1.1 }, bonus: 0.5, ok: (w, v) => open(w, v) && inside(w, v) && !w.counters.arena_resurrection,
    check: { parts: ['stat:charm', ['guitar', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird walks out onto the stage at {venue} into the light, in front of thousands of people holding candles for her. For a second nobody makes a sound. Then everyone does.'], { fame: 10, apply: (c, v) => { c.w.counters.arena_resurrection = 1; fans(v, 40); }, thought: ['Not dead. Never dead. Just between bodies.'] }),
      lose: R(['Blackbird walks out at {venue}, and the crowd, mid-vigil, decide she is a lookalike.'], { apply: (c) => { c.w.counters.arena_resurrection = 1; }, thought: ['The best lookalike they have ever seen.'] }) },
  }),
  row({
    id: 'song-for-the-ceo', where: { wild: 'ceo_box' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:quest'],
    sees: 'The CEO of Atlas, in a box, behind glass, with a drink she has not touched.', stakes: 'Play one song straight at the box: fame, Atlas heat, and maybe she remembers who she was.', consequence: 'The CEO heard her.',
    drives: { quest: 0.8, bravery: 0.6 }, bonus: 0.3, risk: 0.4, ok: (w) => hasInstrument(w.hero) && !w.counters.ceo_heard,
    check: { parts: ['guitar', ['vocals', 0.6]], base: 0.3, per: 0.06,
      win: R(['Blackbird plays one song at {venue} looking straight at the glass box. Behind it, the CEO of Atlas puts her drink down, very slowly, and does not look away until it is over.'], { fame: 4, apply: (c) => { c.w.counters.ceo_heard = 1; addHeat(c.w, 'atlas', 3); }, thought: ['She heard. Whatever she was, she heard.'] }),
      lose: R(['The blinds come down on the box at {venue} before the first chorus.'], { apply: (c) => { c.w.counters.ceo_heard = 1; addHeat(c.w, 'atlas', 1); }, thought: ['Blinds. The coward\'s curtain.'] }) },
  }),
  row({
    id: 'open-stage-after', where: { wild: 'open_mic_arena' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:bravery'],
    sees: 'After the headliner, an open stage that nobody has dared to step onto.', stakes: 'Dare: fame and fans if it works.', consequence: 'She dared.',
    drives: { bravery: 0.8, pride: 0.8 }, bonus: 0.3, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['guitar', ['vocals', 0.5]], base: 0.35, per: 0.06,
      win: R(['Blackbird walks onto the open stage at {venue} after the headliner, with the crowd halfway to the exits. Halfway through her song, they turn round.'], { fame: 4, apply: (c, v) => fans(v, 15), thought: ['They stayed. For me.'] }),
      lose: R(['Blackbird plays the open stage at {venue} to the backs of forty thousand people leaving.'], { thought: ['A farewell concert. For them.'] }) },
  }),
  row({
    id: 'duet-alone-with-lumina', where: { wild: 'lumina_alone' }, pace: 'session',
    needs: ['skill:guitar', 'skill:romance', 'drive:lust'],
    sees: 'LUMINA alone on the empty stage, practising something that is not on any setlist.', stakes: 'Join her: LUMINA warms to her, a lot.', consequence: 'A duet nobody heard.',
    drives: { lust: 0.6, curiosity: 0.7 }, bonus: 0.35, ok: (w) => hasInstrument(w.hero) && !w.counters.lumina_alone,
    check: { parts: ['guitar', ['romance', 0.5], ['music', 0.3]], base: 0.5, per: 0.05,
      win: R(['Blackbird walks onto the empty stage at {venue} and plays under what LUMINA is singing. LUMINA does not stop. They finish it together, to forty thousand empty seats, and LUMINA says "again".'], { apply: (c) => { c.w.counters.lumina_alone = 1; const l = (c.w.legacy.muse ??= {}).lumina ??= { version: 6, warmth: 0, flame: 0 }; l.warmth += 3; l.flame += 1; }, thought: ['Again. She said again.'] }),
      lose: R(['LUMINA on the empty stage at {venue} stops singing when Blackbird walks on, smiles the official smile, and leaves.'], { apply: (c) => { c.w.counters.lumina_alone = 1; }, thought: ['Shy. In a billion-dollar way.'] }) },
  }),
];

export const ARENA_EVENTS: Affordance<VenueView>[] = [...BILLS, ...WILDS];
