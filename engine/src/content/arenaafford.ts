import { type Affordance } from '../affordances';
import { R, banned, rowFor, type VenueView } from '../venuekit';
import { addHeat } from '../combat';
import { hasInstrument } from '../instruments';
import type { World } from '../types';
import type { PlaceView } from '../placekit';

/**
 * An arena's rows, phase by phase of a show day (content/arenas.ts `arenaPhase`): load-in, soundcheck, doors, the show, the encore,
 * load-out, and the dead hours between. Getting in with the crew early opens the backstage rows later. The bills, the wild cards and
 * the dark nights are in arenaevents.ts.
 *
 * Tokens: {venue} {npc} {owner} {pay} {amount} {item} {tip} {lost}; pronouns for {npc} use {they}/{their}.
 */

export const row = rowFor('arena');
export const open = (w: World, v: VenueView): boolean => !banned(w, v.main);
export const vv = (v: PlaceView): VenueView => v as VenueView;
/** She is backstage tonight (in with the crew at load-in, a laminate, a friendly steward). */
export const inside = (w: World, v: VenueView): boolean => !!w.counters[`arena_in:${v.main.id}`];
export const getIn = (c: { w: World }, v: PlaceView): void => {
  c.w.counters[`arena_in:${v.main.id}`] = 1;
};
export const fans = (v: PlaceView, n: number): void => {
  v.main.fans = (v.main.fans ?? 0) + n;
};

const LOAD_IN: Affordance<VenueView>[] = [
  row({
    id: 'carry-cases', where: { situation: 'load_in', feature: ['loading_dock', 'main_stage'] }, pace: 'session',
    needs: ['stat:muscle', 'skill:athletics', 'drive:bravery'],
    sees: 'Trucks at the dock, flight cases everywhere, and a crew one pair of arms short.', stakes: 'An hour carrying cases: a crew lanyard (backstage tonight), and a sore back.', consequence: 'The crew think she is one of them.',
    drives: { bravery: 0.4, curiosity: 0.4 }, bonus: 0.3,
    check: { who: 'tag:roadie', parts: ['stat:muscle', ['athletics', 0.5]], base: 0.55, per: 0.05, physical: true,
      win: R(['Blackbird carries flight cases at {venue} with the crew for an hour. By six she has a lanyard, a radio and a nickname.'], { sore: 0.15, apply: (c, v) => getIn(c, v), train: [['athletics', 2]], thought: ['Crew. The real stars.'] }),
      lose: R(['The case Blackbird picks up at {venue} is the drum riser. It wins.'], { hp: -4, sore: 0.2, thought: ['That riser had it coming.'] }) },
  }),
  row({
    id: 'crew-pass', where: { situation: ['load_in', 'soundcheck'] }, pace: 'quick',
    needs: ['skill:grifting', 'stat:charm', 'drive:curiosity'],
    sees: 'A crew chief with a clipboard and a box of laminates.', stakes: 'Talk her way onto the crew list: backstage for the night.', consequence: 'Her name is on the crew list.',
    drives: { curiosity: 0.5, bravery: 0.3 }, bonus: 0.25, ok: (w, v) => open(w, v) && !inside(w, v),
    check: { who: 'tag:roadie', parts: ['grifting', ['stat:charm', 0.6]], base: 0.45, per: 0.06,
      win: R(['Blackbird tells the crew chief at {venue} she is the new guitar tech from the agency. The crew chief has never heard of the agency, and hands her a laminate anyway.'], { apply: (c, v) => getIn(c, v), train: [['grifting', 2]], thought: ['A laminate. The most powerful object in music.'] }),
      lose: R(['The crew chief at {venue} asks which agency. Blackbird says "the agency". It does not work.'], { thought: ['THE agency. Very exclusive.'] }) },
  }),
  row({
    id: 'drive-the-truck', where: { situation: 'load_in', feature: 'loading_dock' }, pace: 'session',
    needs: ['skill:driving', 'stat:reflex', 'drive:pride'],
    sees: 'A forty-tonne truck that will not back into the dock, and a driver who has given up.', stakes: 'Back it in first time: the crew\'s respect, and a lanyard.', consequence: 'The crew owe her.',
    drives: { bravery: 0.4, pride: 0.5 }, bonus: 0.15,
    check: { parts: ['driving', ['stat:reflex', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird backs forty tonnes of stage into the dock at {venue} in one go. The crew applaud, which crews never do.'], { apply: (c, v) => getIn(c, v), train: [['driving', 3]], thought: ['I can park anything.'] }),
      lose: R(['Blackbird backs the truck at {venue} into a bollard, which produces a strongly worded memo.'], { thought: ['The bollard was in the wrong place.'] }) },
  }),
  row({
    id: 'raid-the-rider', where: { feature: 'green_room' }, pace: 'quick',
    needs: ['skill:tolerance', 'skill:sneak', 'drive:thirst'],
    sees: 'A green room rider: a bowl of only the green sweets, champagne, and a live swan.', stakes: 'Help herself: health back, a little drunk.', consequence: 'A star\'s rider, eaten.',
    drives: { thirst: 0.7 }, bonus: 0.15, ok: (w, v) => open(w, v) && inside(w, v),
    check: { parts: ['sneak', ['tolerance', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird eats a star\'s rider in the green room at {venue}: the green sweets, half the champagne and a cracker that cost more than her guitar. The swan watches.'], { hp: 12, drunk: 2, thought: ['I am the star tonight. Spiritually.'] }),
      lose: R(['The swan in the green room at {venue} is not decorative.'], { hp: -4, thought: ['A swan, defending a rider.'] }) },
  }),
];

const SOUNDCHECK: Affordance<VenueView>[] = [
  row({
    id: 'play-the-soundcheck', where: { situation: 'soundcheck', feature: 'main_stage' }, pace: 'session',
    needs: ['skill:guitar', 'skill:music', 'drive:pride'],
    sees: 'A stage forty metres wide, the PA on, and nobody on the mic.', stakes: 'Play the soundcheck to forty thousand empty seats: a lot of guitar XP.', consequence: 'She has played this stage.',
    drives: { pride: 0.9, curiosity: 0.5 }, bonus: 0.35, ok: (w, v) => open(w, v) && hasInstrument(w.hero),
    check: { parts: ['guitar', ['music', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird plays the soundcheck at {venue} to forty thousand empty seats with the full PA. The crew stop working to listen. The engineer leaves the faders where she left them.'], { train: [['guitar', 6], ['music', 2]], fame: 0.6, thought: ['Forty thousand seats. One day they will be full. Of me.'] }),
      lose: R(['Blackbird plays the soundcheck at {venue}. The engineer mutes her after eight bars: "thanks, great, next".'], { train: [['guitar', 2]], thought: ['A professional mute. Not personal.'] }) },
  }),
  row({
    id: 'walk-the-bowl', where: { situation: ['soundcheck', 'between', 'load_in'] }, pace: 'quick',
    needs: ['skill:perception', 'skill:analyze', 'drive:curiosity'],
    sees: 'An empty arena, every row and every echo, before the crowd fills it.', stakes: 'A walk round the bowl: a feel for the room (a small buff tonight).', consequence: 'She knows the room.',
    drives: { curiosity: 0.6 }, bonus: 0.15,
    check: { parts: ['perception', ['analyze', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird walks the empty bowl of {venue}, clapping once in each section to hear it come back. By the end she knows where the room is warm.'], { buff: { id: 'knows_the_room', power: 2, beats: 40 }, train: [['perception', 2]], thought: ['Every room has a sweet spot. I found it.'] }),
      lose: R(['Blackbird gets lost in the stands of {venue} and is found by a steward an hour later.'], { thought: ['The stands are a maze. A big maze.'] }) },
  }),
  row({
    id: 'help-the-engineer', where: { situation: 'soundcheck', feature: ['production_booth', 'main_stage'] }, pace: 'session',
    needs: ['skill:djing', 'skill:tinkering', 'stat:int'],
    sees: 'A sound engineer fighting a hum in the PA, and a show in three hours.', stakes: 'Find the hum: a fee and the engineer\'s friendship.', consequence: 'The engineer owes her.',
    drives: { curiosity: 0.5, greed: 0.3 }, bonus: 0.1,
    check: { parts: ['djing', ['tinkering', 0.6]], base: 0.45, per: 0.06,
      win: R(['Blackbird finds the hum at {venue}: a cable under the stage, chewed by something. The engineer pays her {amount}nd and gives her a laminate.'], { cash: [30, 80], apply: (c, v) => getIn(c, v), train: [['djing', 2], ['tinkering', 2]], thought: ['A hum. Defeated.'] }),
      lose: R(['Blackbird swaps the wrong cable at {venue}, and the hum becomes a howl.'], { thought: ['The hum has friends.'] }) },
  }),
  row({
    id: 'climb-the-rigging', where: { feature: ['catwalk', 'rigging', 'gantry'] }, pace: 'quick',
    needs: ['skill:athletics', 'stat:reflex', 'drive:bravery'],
    sees: 'A catwalk forty metres up, with a view of everything.', stakes: 'A climb for the view: courage, and a story.', consequence: 'She has seen the arena from the top.',
    drives: { bravery: 0.6, curiosity: 0.5 }, bonus: 0.05, risk: 0.3,
    check: { parts: ['athletics', ['stat:reflex', 0.5]], base: 0.5, per: 0.05, physical: true,
      win: R(['Blackbird climbs the rigging at {venue} and sits on the catwalk with her legs dangling, forty metres up. From here the stage is a postage stamp.'], { xp: 2, train: [['athletics', 2]], thought: ['Up here, everyone is small. Even LUMINA.'] }),
      lose: R(['Blackbird gets halfway up the rigging at {venue} and remembers she does not like heights.'], { hp: -2, thought: ['Heights are overrated.'] }) },
  }),
];

const DOORS: Affordance<VenueView>[] = [
  row({
    id: 'busk-the-queue', where: { situation: 'doors' }, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:greed'],
    sees: 'A queue round the block, bored, with an hour to wait.', stakes: 'Busk the queue: tips, fans, and a support slot nobody booked.', consequence: 'The queue sang before the show did.',
    drives: { greed: 0.5, pride: 0.6 }, bonus: 0.25, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['guitar', ['vocals', 0.5], ['stat:charm', 0.3]], base: 0.45, per: 0.05,
      win: R(['Blackbird busks the queue at {venue}, all the way down the block. By the time the doors open, the queue knows her chorus. {amount}nd in the case.'], { cash: [25, 90], fame: 1.2, apply: (c, v) => fans(v, 6), train: [['guitar', 2]], thought: ['The real opening act.'] }),
      lose: R(['Blackbird busks the queue at {venue}. The queue is queueing for LUMINA, and lets her know.'], { thought: ['Wrong crowd. Right talent.'] }) },
  }),
  row({
    id: 'charm-a-steward', where: { situation: ['doors', 'show'], feature: ['turnstiles', 'stands'] }, pace: 'quick',
    needs: ['stat:charm', 'skill:persuasion', 'drive:curiosity'],
    sees: 'A steward at the side gate with his back to the stage, which is the saddest job in music.', stakes: 'A friendly word: the side gate, and backstage.', consequence: 'A steward is on her side.',
    drives: { curiosity: 0.5 }, bonus: 0.2, ok: (w, v) => open(w, v) && !inside(w, v),
    check: { who: 'tag:steward', parts: ['stat:charm', ['persuasion', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird asks {npc} at {venue} what the best show he never saw was. He tells her for ten minutes, and then opens the side gate.'], { apply: (c, v) => getIn(c, v), affinity: 6, thought: ['Everyone wants to be asked.'] }),
      lose: R(['{npc} at {venue} has heard every line. "Ticket?"'], { thought: ['He was immune to me. Rare.'] }) },
  }),
  row({
    id: 'buy-from-a-tout', where: { feature: 'tout_corner' }, pace: 'quick',
    needs: ['skill:haggling', 'skill:streetwise', 'drive:greed'],
    sees: 'Touts in good coats whispering "tickets" like a prayer.', stakes: 'Haggle a ticket that might be real.', consequence: 'She is in, or out of pocket.',
    drives: { greed: 0.4, curiosity: 0.3 }, bonus: 0.1, ok: (w, v) => open(w, v) && !inside(w, v) && w.hero.cash >= 30,
    check: { pay: [15, 30], who: 'tag:tout', parts: ['haggling', ['streetwise', 0.6]], base: 0.5, per: 0.05,
      win: R(['Blackbird talks a tout at {venue} down to {pay}nd for a ticket. It is real, which surprises them both.'], { apply: (c, v) => getIn(c, v), train: [['haggling', 2]], thought: ['A bargain. And a seat.'] }),
      lose: R(['The ticket Blackbird buys outside {venue} for {pay}nd is for a show last Tuesday.'], { thought: ['A souvenir.'] }) },
  }),
  row({
    id: 'sell-tapes-in-the-queue', where: { situation: 'doors' }, pace: 'session',
    needs: ['skill:hustling', 'skill:streetwise', 'drive:greed'],
    sees: 'Forty thousand people with money and nothing to listen to while they wait.', stakes: 'A box of bootlegs, sold down the queue: cash and fans.', consequence: 'Her tapes are in forty thousand pockets. Well, forty.',
    drives: { greed: 0.6 }, bonus: 0.15, ok: (w) => w.hero.inventory.some((i) => i.id === 'bootleg_tapes'),
    check: { parts: ['hustling', ['streetwise', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird sells a box of her own bootlegs down the queue at {venue}. {amount}nd and a dozen people humming her song at the turnstiles.'], { cash: [40, 120], apply: (c, v) => { const i = c.w.hero.inventory.findIndex((x) => x.id === 'bootleg_tapes'); if (i >= 0) c.w.hero.inventory.splice(i, 1); fans(v, 5); }, thought: ['Distribution. Grassroots.'] }),
      lose: R(['A Clearance officer in the queue at {venue} buys a tape, listens, and smiles at Blackbird in a way she does not like.'], { apply: (c) => addHeat(c.w, 'muse', 1), thought: ['A customer. Of sorts.'] }) },
  }),
];

const SHOW: Affordance<VenueView>[] = [
  row({
    id: 'crowd-surf', where: { situation: ['show', 'encore'], feature: 'stands' }, pace: 'quick',
    needs: ['skill:athletics', 'stat:charm', 'drive:pride'],
    sees: 'Forty thousand hands in the air.', stakes: 'A ride across the crowd: fame, joy, and a lost shoe.', consequence: 'Somebody filmed it.',
    drives: { pride: 0.6, bravery: 0.4 }, bonus: 0.1,
    check: { parts: ['athletics', ['stat:charm', 0.4]], base: 0.55, per: 0.05,
      win: R(['Blackbird goes up onto the crowd at {venue} and is carried from the front to the mixing desk and back. Somebody on the big screen points the camera at her.'], { fame: 1, thought: ['They held me up. All of them.'] }),
      lose: R(['The crowd at {venue} drops Blackbird, gently, onto a man eating a hot dog.'], { hp: -2, thought: ['Soft landing. Mustard.'] }) },
  }),
  row({
    id: 'take-the-lights', where: { situation: ['show', 'encore'], feature: 'production_booth' }, pace: 'session',
    needs: ['skill:djing', 'skill:tinkering', 'drive:pride'],
    sees: 'The production booth: the desk, the lights, the cues, and an operator who needs the toilet.', stakes: 'Run the lights for one song: a show that looks like her, and fame.', consequence: 'The headliner never looked better.',
    drives: { pride: 0.5, curiosity: 0.5 }, bonus: 0.15, ok: (w, v) => open(w, v) && inside(w, v),
    check: { parts: ['djing', ['tinkering', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird covers the lighting desk at {venue} for one song. The rig does things it has never done. The headliner thanks "whoever is on the lights" from the stage.'], { fame: 1, train: [['djing', 3]], thought: ['I lit forty thousand people. With my thumbs.'] }),
      lose: R(['Blackbird covers the lighting desk at {venue} and turns everything blue for a sad song that was meant to be red.'], { thought: ['A bold choice. Mine.'] }) },
  }),
  row({
    id: 'medical-bay-shift', where: { feature: 'medical_bay' }, pace: 'session',
    needs: ['skill:medicine', 'stat:int', 'drive:quest'],
    sees: 'A medical bay of nosebleeds, sprains and one person who fainted at the key change.', stakes: 'An hour helping the medic: grateful patients, fans, a fee.', consequence: 'People she patched up remember her.',
    drives: { quest: 0.6 }, bonus: 0.1,
    check: { parts: ['medicine', ['stat:int', 0.4]], base: 0.55, per: 0.05,
      win: R(['Blackbird helps in the medical bay at {venue} for an hour: three sprains, a nosebleed and a fainter who wakes up, sees who is holding the ice pack, and faints again. {amount}nd.'], { cash: [15, 40], apply: (c, v) => fans(v, 3), train: [['medicine', 3]], thought: ['Doctor Blackbird. The bedside manner is a guitar.'] }),
      lose: R(['Blackbird helps in the medical bay at {venue} and puts a plaster on the wrong knee.'], { thought: ['Both knees deserved care.'] }) },
  }),
  row({
    id: 'food-stall-shift', where: { feature: 'food_stalls' }, pace: 'session',
    needs: ['skill:cooking', 'skill:hustling', 'drive:greed'],
    sees: 'A noodle stall with a queue of four hundred and one person cooking.', stakes: 'An hour on the wok: wages, food, and a stall that loves her.', consequence: 'Fed and paid.',
    drives: { greed: 0.4, thirst: 0.3 }, bonus: 0.05,
    check: { parts: ['cooking', ['hustling', 0.4]], base: 0.55, per: 0.05,
      win: R(['Blackbird works the wok at a stall in {venue} through the support act. Four hundred bowls, {amount}nd and a bowl for herself.'], { cash: [20, 60], hp: 6, train: [['cooking', 3]], thought: ['A backstage pass to noodles.'] }),
      lose: R(['Blackbird burns a wok of noodles at {venue} so badly the smoke alarm joins the headliner.'], { thought: ['Smoke. For atmosphere.'] }) },
  }),
  row({
    id: 'dressing-room-gossip', where: { feature: 'dressing_rooms' }, pace: 'quick',
    needs: ['skill:streetwise', 'stat:charm', 'drive:curiosity'],
    sees: 'A corridor of dressing rooms with stars on the doors and something going on behind each.', stakes: 'Ten minutes in the corridor: who is fighting, who is leaving Muse, a tip.', consequence: 'She knows the gossip.',
    drives: { curiosity: 0.7 }, bonus: 0.1, ok: (w, v) => open(w, v) && inside(w, v),
    check: { parts: ['streetwise', ['stat:charm', 0.5]], base: 0.55, per: 0.05,
      win: R(['In the dressing-room corridor at {venue}, Blackbird learns that the support act is leaving Muse, the bassist is leaving the band, and {tip} owes the promoter money.'], { tip: true, thought: ['Corridors hear everything.'] }),
      lose: R(['The dressing-room corridor at {venue} is all closed doors and one very loud argument about a hat.'], { thought: ['The hat was the problem, clearly.'] }) },
  }),
];

const ENCORE: Affordance<VenueView>[] = [
  row({
    id: 'steal-the-encore', where: { situation: 'encore', feature: 'main_stage' }, pace: 'session',
    needs: ['skill:guitar', 'stat:charm', 'drive:pride'],
    sees: 'The headliner gone off for the encore, the crowd chanting, and a guitar on a stand by the mic.', stakes: 'Walk on for the encore herself: the biggest fame of her life, or forty thousand people booing.', consequence: 'Forty thousand people know her name, one way or another.',
    drives: { pride: 1.2, bravery: 0.6 }, bonus: 0.5, risk: 0.4, ok: (w, v) => open(w, v) && inside(w, v) && hasInstrument(w.hero),
    check: { parts: ['guitar', ['stat:charm', 0.5], ['music', 0.3]], base: 0.3, per: 0.06,
      win: R(['The headliner at {venue} goes off for the encore, and Blackbird walks on instead. Two seconds of silence. Then she plays, and forty thousand people decide, together, that this was always the plan.'], { fame: 8, apply: (c, v) => { fans(v, 30); addHeat(c.w, 'muse', 2); }, train: [['guitar', 5]], xp: 15, thought: ['The encore was mine. It was always going to be mine.'] }),
      lose: R(['Blackbird walks on for the encore at {venue}. The crowd were expecting somebody else, and say so, for some time.'], { apply: (c) => { c.w.hero.fame = Math.max(0, c.w.hero.fame - 3); }, thought: ['A tough room. Forty thousand tough rooms.'] }) },
  }),
  row({
    id: 'jumbotron-feed', where: { situation: ['show', 'encore'], feature: 'jumbotron' }, pace: 'session',
    needs: ['skill:guitar', 'skill:hijack', 'drive:pride'],
    sees: 'A screen the size of a building, wired to a feed that goes out to the whole block.', stakes: 'Plug a jacked guitar into the feed: her face on the big screen and on every screen round the block (fans, fame, Muse heat).', consequence: 'The block saw her.',
    drives: { pride: 0.9, bravery: 0.4 }, bonus: 0.3, risk: 0.3, ok: (w, v) => open(w, v) && inside(w, v) && hasInstrument(w.hero),
    check: { parts: ['guitar', ['hijack', 0.6]], base: 0.3, per: 0.06,
      win: R(['Blackbird gets her guitar onto the jumbotron feed at {venue} for one chorus. Her face, a building high, playing a song Muse never approved, out to every screen on the block.'], { fame: 4, apply: (c, v) => { for (const e of vv(v).main.exits) { const s = c.w.locations[e.to]; if (s) s.fans = (s.fans ?? 0) + 8; } addHeat(c.w, 'muse', 2); }, train: [['guitar', 2]], thought: ['A building-sized me.'] }),
      lose: R(['The jumbotron at {venue} shows Blackbird\'s face for half a second, confused, and then a LUMINA advert.'], { apply: (c) => addHeat(c.w, 'muse', 1), thought: ['Half a second. Iconic, briefly.'] }) },
  }),
  row({
    id: 'pyro-finale', where: { situation: 'encore', feature: 'pyro_rig' }, pace: 'quick',
    needs: ['skill:tinkering', 'stat:int', 'drive:bravery'],
    sees: 'The pyro board, fifty charges, and a technician who has lost count.', stakes: 'Help count them in for the finale: the best finale the room has seen, or a singed eyebrow.', consequence: 'A finale for the ages.',
    drives: { bravery: 0.5, curiosity: 0.5 }, bonus: 0.1, ok: (w, v) => open(w, v) && inside(w, v),
    check: { parts: ['tinkering', ['stat:int', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird counts the pyro in with the technician at {venue}. The finale goes off on the beat, all fifty, and the crowd makes a sound like weather.'], { fame: 1.5, train: [['tinkering', 2]], thought: ['Fire, on time. My kind of art.'] }),
      lose: R(['The pyro at {venue} goes off a bar early, during the quiet bit.'], { hp: -2, thought: ['It was a dramatic choice.'] }) },
  }),
];

const LOAD_OUT: Affordance<VenueView>[] = [
  row({
    id: 'load-out-shift', where: { situation: 'load_out', feature: 'loading_dock' }, pace: 'session',
    needs: ['stat:muscle', 'skill:athletics', 'drive:greed'],
    sees: 'Forty tonnes of stage to put back in trucks before the curfew.', stakes: 'Wages, a sore back, and the crew\'s respect.', consequence: 'The crew would hire her again.',
    drives: { greed: 0.5 }, bonus: 0.05,
    check: { who: 'tag:roadie', parts: ['stat:muscle', ['athletics', 0.5]], base: 0.6, per: 0.04, physical: true,
      win: R(['Blackbird loads out with the crew at {venue} until three. {amount}nd in an envelope, and an invitation to the next tour.'], { cash: [30, 80], sore: 0.2, train: [['athletics', 2]], thought: ['Honest work. Heavy work.'] }),
      lose: R(['Blackbird drops a lighting truss at {venue}. The crew chief looks at her for a long time.'], { sore: 0.1, thought: ['Gravity. Undefeated.'] }) },
  }),
  row({
    id: 'after-party', where: { situation: ['load_out', 'encore'], feature: ['green_room', 'dressing_rooms'] }, pace: 'session',
    needs: ['skill:romance', 'skill:tolerance', 'drive:lust'],
    sees: 'An after-party in the green room: the headliner, the crew, and somebody\'s ex.', stakes: 'A night of it: a kiss, a connection, a hangover.', consequence: 'She was at the after-party.',
    drives: { lust: 0.5, thirst: 0.5 }, bonus: 0.15, ok: (w, v) => open(w, v) && inside(w, v),
    check: { who: 'fair', parts: ['romance', ['tolerance', 0.5], ['stat:charm', 0.4]], base: 0.45, per: 0.05,
      win: R(['At the after-party at {venue}, Blackbird ends up on a flight case with {npc}, sharing the last of the champagne and a secret about the headliner.'], { affinity: 12, drunk: 2, fame: 0.5, thought: ['A good night. A famous night.'] }),
      lose: R(['The after-party at {venue} ends at the exact moment Blackbird arrives.'], { drunk: 1, thought: ['I am the after-after-party.'] }) },
  }),
  row({
    id: 'lost-property', where: { situation: ['load_out', 'between'], feature: ['stands', 'car_park'] }, pace: 'session',
    needs: ['skill:scavenging', 'skill:perception', 'drive:greed'],
    sees: 'Forty thousand people\'s worth of things dropped under the seats.', stakes: 'An hour with a torch: cash, a light-stick, sometimes a guitar.', consequence: 'Somebody\'s lost thing is hers.',
    drives: { greed: 0.5, curiosity: 0.3 }, bonus: 0.1,
    check: { parts: ['scavenging', ['perception', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird walks the empty stands at {venue} with a torch and comes away with {amount}nd in dropped coins, a shoe, and a setlist signed by somebody famous.'], { cash: [15, 60], train: [['scavenging', 2]], thought: ['Treasure. Under seat F23.'] }),
      lose: R(['The stands at {venue} have been swept. All she finds is a light-stick that is still on.'], { thought: ['A light in the dark. Poetic.'] }) },
  }),
];

const QUIET: Affordance<VenueView>[] = [
  row({
    id: 'empty-stage', where: { situation: ['between', 'dark_night', 'empty'], feature: 'main_stage' }, pace: 'session',
    needs: ['skill:guitar', 'skill:music', 'drive:curiosity'],
    sees: 'An empty stage, a single work light, and forty thousand seats in the dark.', stakes: 'An hour alone on the biggest stage in the district: a lot of guitar XP, and a feeling.', consequence: 'She has stood where the stars stand.',
    drives: { curiosity: 0.6, pride: 0.5 }, bonus: 0.25, ok: (w, v) => open(w, v) && hasInstrument(w.hero),
    check: { parts: ['guitar', ['music', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird plays alone on the empty stage at {venue}, by the work light, to forty thousand empty seats. The echo comes back from the top tier a second later, like an answer.'], { train: [['guitar', 6], ['music', 2]], xp: 3, thought: ['The room was listening. Rooms do.'] }),
      lose: R(['A security guard at {venue} lets her play one song on the empty stage, then switches off the work light.'], { train: [['guitar', 2]], thought: ['A one-song residency.'] }) },
  }),
  row({
    id: 'hire-the-arena', where: { situation: ['dark_night', 'empty'] }, pace: 'deal',
    needs: ['skill:hustling', 'skill:calculate', 'drive:pride'],
    sees: 'A dark night, an empty arena, and a manager who would rent it to anyone with the money.', stakes: 'Hire the whole arena for her own show tonight (a fortune): then headline it, and hope her fans come.', consequence: 'Her name on the arena\'s board.',
    drives: { pride: 1, greed: 0.2 }, bonus: 0.2, ok: (w, v) => open(w, v) && !w.counters[`arena_hired:${v.main.id}`] && w.hero.cash >= Number(v.info.keep?.hire ?? 2000),
    check: { who: 'owner', parts: ['hustling', ['calculate', 0.5]], base: 0.7, per: 0.03,
      win: R(['Blackbird hires {venue} for the night. The manager counts the money twice and puts her name on the board out front in letters a metre high.'], { apply: (c, v) => { const vi = vv(v); c.w.hero.cash -= Number(vi.info.keep?.hire ?? 2000); c.w.counters[`arena_hired:${vi.main.id}`] = 1; getIn(c, v); }, thought: ['My arena. My night. My money, gone.'] }),
      lose: R(['The manager at {venue} looks at the money, then at Blackbird, and says there is a curfew.'], { thought: ['A curfew on genius.'] }) },
  }),
  row({
    id: 'headline-own-show', where: {}, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:pride'],
    sees: 'Her own arena, hired for the night, and the doors about to open.', stakes: 'Headline it: fame and fans by the thousand if her fans come; an empty room if they do not.', consequence: 'The night she headlined an arena.',
    drives: { pride: 1.2 }, bonus: 0.6, ok: (w, v) => open(w, v) && !!w.counters[`arena_hired:${v.main.id}`] && !w.counters[`arena_headlined:${v.main.id}`] && hasInstrument(w.hero),
    check: { parts: ['guitar', ['vocals', 0.5], ['stat:charm', 0.4]], base: 0.3, per: 0.06,
      win: R(['The doors open at {venue}, and they come: her fans, from every district, until the stands are full. Blackbird walks out to a noise she will hear for the rest of her lives. {amount}nd on the door.'], { cash: [800, 3000], fame: 10, apply: (c, v) => { c.w.counters[`arena_headlined:${v.main.id}`] = 1; fans(v, 40); }, xp: 20, thought: ['Full. Every seat. Every one of them.'] }),
      lose: R(['Blackbird headlines {venue} to four hundred people in a room for forty thousand. They are very loud. It is very echoey.'], { cash: [50, 200], apply: (c, v) => { c.w.counters[`arena_headlined:${v.main.id}`] = 1; fans(v, 5); }, thought: ['Intimate. An intimate arena show.'] }) },
  }),
];

const ANY_HOUR: Affordance<VenueView>[] = [
  row({
    id: 'work-the-merch', where: { feature: 'merch_stand' }, pace: 'session',
    needs: ['skill:hustling', 'skill:haggling', 'drive:greed'],
    sees: 'A merch stand doing more business than most banks, and one person on the till.', stakes: 'An hour on the till: wages, and a T-shirt.', consequence: 'Paid.',
    drives: { greed: 0.5 }, bonus: 0.1,
    check: { parts: ['hustling', ['haggling', 0.5]], base: 0.6, per: 0.04,
      win: R(['Blackbird works the merch stand at {venue} for an hour and sells more tour shirts than the band has fans. {amount}nd.'], { cash: [25, 70], train: [['hustling', 2]], thought: ['Retail, at scale.'] }),
      lose: R(['Blackbird gives the wrong change at the merch stand of {venue} to a man who notices.'], { thought: ['Maths. Under pressure.'] }) },
  }),
  row({
    id: 'roadie-stories', where: { feature: ['loading_dock', 'main_stage', 'rigging'] }, pace: 'quick',
    needs: ['skill:streetwise', 'stat:charm', 'drive:curiosity'],
    sees: 'A roadie on a flight case, on a break, with forty years of stories.', stakes: 'Ten minutes of stories: a tip, and a friend on the crew.', consequence: 'A roadie likes her.',
    drives: { curiosity: 0.6 }, bonus: 0.15,
    check: { who: 'tag:roadie', parts: ['streetwise', ['stat:charm', 0.5]], base: 0.6, per: 0.04,
      win: R(['{npc} at {venue} tells Blackbird about every star who ever played here, which ones were kind to the crew, and about {tip}.'], { tip: true, affinity: 6, thought: ['Roadies know where all the bodies are buried. Figuratively.'] }),
      lose: R(['{npc} at {venue} is on a break, and the break is sacred.'], { thought: ['Fair.'] }) },
  }),
  row({
    id: 'tunnel-walk', where: { feature: ['tunnel', 'main_stage'] }, pace: 'quick',
    needs: ['drive:pride', 'stat:charm'],
    sees: 'The tunnel the stars walk out of, and a mark on the floor at the end.', stakes: 'Walk it, alone, to the mark: a little pride, a little practice.', consequence: 'She has walked the walk.',
    drives: { pride: 0.7 }, bonus: 0.1,
    check: { parts: ['stat:charm'], base: 0.75, per: 0.03,
      win: R(['Blackbird walks the tunnel at {venue} to the mark at the end, alone, and raises an arm to forty thousand empty seats. A cleaner in the top tier waves back.'], { buff: { id: 'walk_on', power: 1, beats: 30 }, thought: ['Rehearsal. For the real thing.'] }),
      lose: R(['Blackbird walks the tunnel at {venue} and trips on a cable at the mark.'], { thought: ['A pratfall. Classic showbiz.'] }) },
  }),
  row({
    id: 'nap-under-the-stage', where: { feature: 'under_stage' }, pace: 'session',
    needs: ['skill:sneak', 'drive:thirst', 'stat:muscle'],
    sees: 'The space under the stage: lifts, cables, and a crew member asleep on a pile of drapes.', stakes: 'A few hours on the drapes: health back, nobody looking.', consequence: 'Rested.',
    drives: { thirst: 0.4 }, bonus: 0.05, ok: (w) => w.hero.hp < w.hero.maxHp * 0.8,
    check: { parts: ['sneak', ['stat:muscle', 0.3]], base: 0.65, per: 0.04,
      win: R(['Blackbird sleeps on the drapes under the stage at {venue} for two hours while the show thunders overhead.'], { hp: 14, thought: ['A lullaby, at a hundred and ten decibels.'] }),
      lose: R(['Blackbird is asleep under the stage at {venue} when the lift comes down.'], { hp: 3, thought: ['The lift had a schedule. I did not.'] }) },
  }),
  row({
    id: 'security-office-tea', where: { feature: 'security_office' }, pace: 'quick',
    needs: ['stat:charm', 'skill:persuasion', 'drive:curiosity'],
    sees: 'A security office with every camera, every radio and a kettle.', stakes: 'A cup of tea with security: a friend in the office, and a laminate.', consequence: 'Security like her.',
    drives: { curiosity: 0.5 }, bonus: 0.1, ok: (w, v) => open(w, v) && !inside(w, v),
    check: { who: 'tag:steward', parts: ['stat:charm', ['persuasion', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird has a cup of tea in the security office at {venue} with {npc}, who turns out to be a fan, and leaves with a laminate "in case".'], { apply: (c, v) => getIn(c, v), affinity: 6, thought: ['Tea. The universal pass.'] }),
      lose: R(['{npc} at {venue} gives her tea and a firm escort to the exit.'], { thought: ['Polite. Firm. Fair.'] }) },
  }),
  row({
    id: 'jumbotron-cameo', where: { feature: 'jumbotron' }, pace: 'quick',
    needs: ['skill:dancing', 'stat:charm', 'drive:pride'],
    sees: 'A camera crew picking faces out of the crowd for the big screen.', stakes: 'Get picked: her face, a building high, for five seconds of fame.', consequence: 'Forty thousand people saw her dance.',
    drives: { pride: 0.7 }, bonus: 0.1,
    check: { parts: ['dancing', ['stat:charm', 0.5]], base: 0.45, per: 0.05,
      win: R(['The camera at {venue} finds Blackbird dancing in the stands and puts her on the big screen. Somebody recognises her. The whole section starts chanting.'], { fame: 1.2, apply: (c, v) => fans(v, 4), train: [['dancing', 2]], thought: ['Five seconds. All I need.'] }),
      lose: R(['The camera at {venue} finds the man next to Blackbird instead, who dances better.'], { thought: ['He had moves. I have presence.'] }) },
  }),
  row({
    id: 'scalp-the-car-park', where: { feature: ['car_park', 'tout_corner'] }, pace: 'session',
    needs: ['skill:hustling', 'skill:grifting', 'drive:greed'],
    sees: 'A car park the size of a district, full of buses, touts and people without tickets.', stakes: 'An hour working the car park: cash, and the touts\' attention.', consequence: 'The touts know her face.',
    drives: { greed: 0.6 }, bonus: 0.1,
    check: { parts: ['hustling', ['grifting', 0.5]], base: 0.45, per: 0.05,
      win: R(['Blackbird works the car park at {venue} for an hour, finding spare tickets for people who need them and taking a fee for the finding. {amount}nd.'], { cash: [30, 100], train: [['hustling', 2]], thought: ['A service. With a markup.'] }),
      lose: R(['The touts at {venue} have a union, and the union has a word with Blackbird.'], { hp: -3, thought: ['Organised labour. Respect.'] }) },
  }),
  row({
    id: 'climb-the-stands', where: { feature: 'stands' }, pace: 'quick',
    needs: ['skill:athletics', 'drive:curiosity', 'stat:muscle'],
    sees: 'The stands, rising into the dark, with a view of the whole district from the top tier.', stakes: 'A climb to the top row: a view, and the knowledge of the room.', consequence: 'She has seen it from the gods.',
    drives: { curiosity: 0.5 }, bonus: 0.05,
    check: { parts: ['athletics', ['stat:muscle', 0.4]], base: 0.7, per: 0.03, physical: true,
      win: R(['Blackbird climbs to the very top row of {venue}. From up here the stage is a postage stamp and the city is all lights.'], { sore: 0.05, xp: 1, thought: ['The cheap seats. The best view.'] }),
      lose: R(['Blackbird gets two-thirds of the way up the stands at {venue} and sits down for a while.'], { sore: 0.1, thought: ['A rest stop. Planned.'] }) },
  }),
];

export const ARENA_ROWS: Affordance<VenueView>[] = [...LOAD_IN, ...SOUNDCHECK, ...DOORS, ...SHOW, ...ENCORE, ...LOAD_OUT, ...QUIET, ...ANY_HOUR];
