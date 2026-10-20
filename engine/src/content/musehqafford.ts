import { type Affordance } from '../affordances';
import { R, banned, find, rowFor, type VenueView } from '../venuekit';
import { caught, clearance, loosen, raise, reach } from '../musehqkit';
import { addHeat } from '../combat';
import { fanCover } from '../fans';
import type { World } from '../types';

/**
 * The first half of a Muse building's rows: getting up (the clearance ladder), and the public and staff floors. The secure
 * and executive floors, the wild cards and the situations are in musehqevents.ts.
 *
 * Every row above the lobby needs the rung for its feature (`reach`); every failure up there is `caught`: back down to the
 * lobby, Muse heat, sometimes a ban, and the Inspiration team on duty.
 *
 * Tokens: {venue} {npc} {owner} {pay} {amount} {item} {tip} {lost}; pronouns for {npc} use {they}/{their}.
 */

export const row = rowFor('musehq');
export const open = (w: World, v: VenueView): boolean => !banned(w, v.main);
export const at = (f: string) => (w: World, v: VenueView): boolean => open(w, v) && reach(w, v, f);
const below = (n: number) => (w: World, v: VenueView): boolean => open(w, v) && clearance(w, v) < n;

// ===================================================================== going up

const CLIMB: Affordance<VenueView>[] = [
  row({
    id: 'sweet-talk-reception', where: { feature: 'reception' }, pace: 'deal',
    needs: ['stat:charm', 'skill:persuasion', 'skill:grifting'],
    sees: 'A receptionist with a ring light and a visitor book, and a story she has not been told yet.', stakes: 'A visitor\'s lanyard to the staff floors, or an escort back out.', consequence: 'She is on the staff floors, for tonight.',
    drives: { curiosity: 0.6, bravery: 0.3 }, bonus: 0.3, ok: below(1),
    check: { who: 'arch:muse_receptionist', parts: ['stat:charm', ['persuasion', 0.6], ['grifting', 0.5]], base: 0.35, per: 0.06,
      win: R(['Blackbird tells the receptionist at {venue} she is here about the jingle for the lifts. {npc} believes her, completely, and prints her a visitor lanyard.', '{npc} at reception asks who she is here to see. Blackbird names a vice-president of Feelings she has invented on the spot. {npc} finds him in the system.'], { apply: (c, v) => raise(c, v as VenueView, 1), train: [['grifting', 2], ['persuasion', 1]], thought: ['Upstairs. Where the trouble keeps itself.'] }),
      lose: R(['{npc} at reception at {venue} looks at Blackbird, then at a screen, then at Blackbird. "Oh! You\'re that troubling sound 🥰". Security is called, very politely.'], { apply: (c, v) => caught(c, v as VenueView), thought: ['I am recognised. That is technically the dream.'] }) },
  }),
  row({
    id: 'join-the-tour', where: { feature: 'tour_desk' }, pace: 'deal',
    needs: ['skill:sneak', 'stat:charm', 'drive:curiosity'],
    sees: 'A tour, Behind The Music, hourly, and a guide who never counts the group on the way out.', stakes: 'Peel off the tour on the staff floor, or be shown the gift shop forever.', consequence: 'She is upstairs.',
    drives: { curiosity: 0.6 }, bonus: 0.25, ok: below(1),
    check: { pay: [5, 15], parts: ['sneak', ['stat:charm', 0.4]], base: 0.5, per: 0.05,
      win: R(['Blackbird pays {pay}nd for Behind The Music at {venue}, laughs at the guide\'s jokes for two floors, and is gone at the third.'], { apply: (c, v) => raise(c, v as VenueView, 1), train: [['sneak', 2]], thought: ['The best tours have an exit.'] }),
      lose: R(['The guide at {venue} counts heads at every door. Blackbird sees the whole tour, including the gift shop, twice.'], { thought: ['I learned a lot about LUMINA\'s childhood. She was built.'] }) },
  }),
  row({
    id: 'hop-turnstile', where: { feature: 'turnstiles' }, pace: 'deal',
    needs: ['skill:athletics', 'stat:reflex', 'drive:bravery'],
    sees: 'A row of pastel turnstiles that open for a lanyard, and one that has never been tested by a vault.', stakes: 'Over the top: the staff floors, or a tackle.', consequence: 'She is upstairs, unannounced.',
    drives: { bravery: 0.6 }, bonus: 0.15, risk: 0.4, ok: below(1),
    check: { parts: ['athletics', ['stat:reflex', 0.6]], base: 0.35, per: 0.06,
      win: R(['Blackbird vaults the turnstile at {venue} on the beat of the lobby jingle and is in the lift before the alarm finishes its chorus.'], { apply: (c, v) => raise(c, v as VenueView, 1), train: [['athletics', 2]], thought: ['Gymnastics. In defiance of capitalism.'] }),
      lose: R(['Blackbird vaults the turnstile at {venue} and lands on an Inspiration operative, who catches her, kindly, and keeps hold.'], { thugs: ['inspiration_trooper', 2], apply: (c, v) => caught(c, v as VenueView), thought: ['That was a hug. With intent.'] }) },
  }),
  row({
    id: 'hack-turnstile', where: { feature: 'turnstiles' }, pace: 'deal',
    needs: ['skill:tinkering', 'skill:hijack', 'stat:int'],
    sees: 'A turnstile reader with a service port that hums the Muse jingle when you get close.', stakes: 'A lanyard that does not exist, accepted: the staff floors, or a shock.', consequence: 'The turnstiles think she works here.',
    drives: { curiosity: 0.5 }, bonus: 0.15, ok: below(1),
    check: { parts: ['tinkering', ['hijack', 0.5], ['stat:int', 0.5]], base: 0.35, per: 0.065,
      win: R(['Blackbird talks to the turnstile at {venue} through its service port. It decides she is a Senior Feelings Coordinator and lets her through with a chime.'], { apply: (c, v) => raise(c, v as VenueView, 1), train: [['tinkering', 3]], thought: ['I have a job title now. The machine gave it to me.'] }),
      lose: R(['The turnstile at {venue} bites. Blackbird\'s hand tingles and the reader plays the alarm as a ballad.'], { hp: -3, apply: (c, v) => caught(c, v as VenueView), thought: ['A singing alarm. Of course.'] }) },
  }),
  row({
    id: 'cleaners-uniform', where: { feature: 'cleaning_cupboard' }, pace: 'deal',
    needs: ['skill:sneak', 'skill:grifting', 'drive:curiosity'],
    sees: 'A cupboard of pastel cleaner\'s uniforms and a trolley with a master key on it.', stakes: 'The trolley, the uniform, and the secure floors, or a cleaner who knows every cleaner.', consequence: 'She is on the secure floors, pushing a mop.',
    drives: { curiosity: 0.5, bravery: 0.4 }, bonus: 0.3, ok: (w, v) => open(w, v) && reach(w, v, 'cleaning_cupboard') && clearance(w, v) < 2,
    check: { parts: ['sneak', ['grifting', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird puts on a pastel tabard at {venue}, takes the trolley with the master key and mops her way up to the secure floors. Nobody looks at a cleaner. Nobody ever has.'], { apply: (c, v) => raise(c, v as VenueView, 2), train: [['sneak', 2], ['grifting', 2]], thought: ['Invisible. With a mop. Power.'] }),
      lose: R(['A real cleaner at {venue} catches Blackbird in a tabard. "You\'re not on the rota," she says, and presses the panic button with real pleasure.'], { thugs: ['inspiration_trooper', 2], apply: (c, v) => caught(c, v as VenueView), thought: ['Undone by a rota.'] }) },
  }),
  row({
    id: 'service-lift', where: { feature: 'service_lift' }, pace: 'deal',
    needs: ['skill:sneak', 'skill:lockpicking', 'stat:reflex'],
    sees: 'A service lift that goes to every floor and checks nobody\'s lanyard, behind a door with a cheap lock.', stakes: 'One rung up, or stuck between floors with the lift music.', consequence: 'She is a floor higher.',
    drives: { curiosity: 0.4, bravery: 0.4 }, bonus: 0.2, ok: (w, v) => open(w, v) && reach(w, v, 'service_lift') && clearance(w, v) < 3,
    check: { parts: ['lockpicking', ['sneak', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird picks the service-lift door at {venue} and rides up a floor with a trolley of laundry and a LUMINA chorus.'], { apply: (c, v) => raise(c, v as VenueView, clearance(c.w, v as VenueView) + 1), train: [['lockpicking', 2], ['sneak', 1]], thought: ['Up. Always up.'] }),
      lose: R(['The service lift at {venue} stops between floors. The music does not.'], { apply: (c, v) => caught(c, v as VenueView), thought: ['Trapped with LUMINA. My personal hell.'] }) },
  }),
  row({
    id: 'forge-badge', where: { feature: ['open_plan', 'mailroom', 'press_room'] }, pace: 'deal',
    needs: ['skill:art', 'skill:sleight', 'skill:tinkering'],
    sees: 'A laminator, a stack of blank staff badges and a photo booth for new starters.', stakes: 'A forged secure-floor badge (it lasts), or a laminator that jams on her thumb.', consequence: 'She has a Muse badge with her face on it.',
    drives: { curiosity: 0.5, greed: 0.3 }, bonus: 0.2, ok: (w, v) => open(w, v) && clearance(w, v) >= 1 && !w.hero.inventory.some((i) => i.id === 'muse_badge'),
    check: { parts: ['art', ['sleight', 0.6], ['tinkering', 0.4]], base: 0.4, per: 0.06,
      win: R(['Blackbird takes a new-starter photo at {venue}, laminates it onto a secure badge and signs it with a manager\'s name she read off a door. {item}.'], { item: 'muse_badge', train: [['art', 3], ['sleight', 1]], thought: ['Forgery is a creative discipline.'] }),
      lose: R(['The laminator at {venue} eats the badge and most of Blackbird\'s thumbnail.'], { hp: -2, thought: ['The machine resisted. Like Muse.'] }) },
  }),
  row({
    id: 'lift-a-lanyard', where: {}, pace: 'quick',
    needs: ['skill:sleight', 'stat:reflex', 'drive:greed'],
    sees: 'A staffer with three lanyards round their neck, all different colours, and a tired face.', stakes: 'One of the lanyards: the staff floors, or a scene in the lobby.', consequence: 'Somebody in a cardigan cannot get into the canteen.',
    drives: { greed: 0.3, curiosity: 0.4 }, bonus: 0.15, ok: (w, v) => open(w, v) && !w.hero.inventory.some((i) => i.id === 'muse_lanyard'),
    check: { who: 'arch:muse_staffer', parts: ['sleight', ['stat:reflex', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird lifts a lanyard off {npc} at {venue} in a crowd by the coffee bar. It says TEAM FEELINGS on it in glitter.'], { item: 'muse_lanyard', train: [['sleight', 2]], thought: ['Team Feelings. I have feelings. I qualify.'] }),
      lose: R(['{npc} at {venue} feels the tug on {their} lanyard and turns round. "Are you lost?" Security thinks so too.'], { apply: (c, v) => caught(c, v as VenueView), thought: ['I was admiring the glitter.'] }) },
  }),
  row({
    id: 'flash-mob-lobby', where: { feature: 'reception' }, pace: 'deal',
    needs: ['skill:speaking', 'stat:charm', 'drive:bravery'],
    sees: 'A lobby, a front door, and her fans outside it.', stakes: 'Her fans pour into the lobby: in the chaos, she is up two floors. Muse will not forget.', consequence: 'A lobby full of her fans, and her upstairs.',
    drives: { bravery: 0.6, pride: 0.5 }, bonus: 0.2, ok: (w, v) => open(w, v) && fanCover(w, v.main.id) > 0.2 && clearance(w, v) < 2,
    check: { parts: ['speaking', ['stat:charm', 0.6]], base: 0.45, per: 0.06,
      win: R(['On her word, a hundred of her fans walk into the lobby of {venue} singing one of her songs. Security does not know where to put its hands. Blackbird walks past it, up two floors.'], { apply: (c, v) => { raise(c, v as VenueView, 2); addHeat(c.w, 'muse', 2); }, fame: 1.5, thought: ['Civil disobedience, with harmonies.'] }),
      lose: R(['Her fans come into the lobby of {venue}, and so does an Inspiration team, from the other side.'], { thugs: ['inspiration_trooper', 3], apply: (c, v) => caught(c, v as VenueView), thought: ['My fans are brave. The team is armed.'] }) },
  }),
];

// ===================================================================== the lobby and the staff floors

const PUBLIC: Affordance<VenueView>[] = [
  row({
    id: 'fountain-coins', where: { feature: 'lobby_fountain' }, pace: 'quick',
    needs: ['skill:scavenging', 'skill:sleight', 'drive:greed'],
    sees: 'A fountain that plays the Muse jingle and a floor of coins thrown by people who wanted to be famous.', stakes: 'A handful of other people\'s wishes.', consequence: 'Someone\'s wish is in her pocket.',
    drives: { greed: 0.5 }, bonus: 0,
    check: { parts: ['scavenging', ['sleight', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird fishes {amount}nd out of the fountain at {venue} while the jingle plays. Every coin was somebody\'s wish to be famous. She will put them to good use.'], { cash: [8, 30], train: [['scavenging', 1], ['sleight', 1]], thought: ['I am granting their wishes. By being famous. With their money.'] }),
      lose: R(['Blackbird reaches into the fountain at {venue} and a receptionist clears her throat at a frequency that carries.'], { warn: ['fountain', 1], thought: ['I dropped something. My dignity.'] }) },
  }),
  row({
    id: 'talk-to-hologram', where: { feature: 'lumina_hologram' }, pace: 'quick',
    needs: ['skill:tinkering', 'stat:charm', 'drive:curiosity'],
    sees: 'A life-size LUMINA hologram that waves at everyone and says their name, wrongly, sometimes.', stakes: 'Make the hologram say something off-script: a laugh, and a little warmth from the real one.', consequence: 'The lobby heard LUMINA say her name.',
    drives: { curiosity: 0.6 }, bonus: 0.1,
    check: { parts: ['tinkering', ['stat:charm', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird talks to the LUMINA hologram at {venue} until it stops waving, looks at her, and says "Blackbird" in a voice that is not on the script. Somewhere upstairs, a technician frowns at a screen.'], { apply: (c) => { const l = c.w.legacy.muse?.lumina; if (l) l.warmth++; }, fame: 0.5, thought: ['She knows my name. In hologram.'] }),
      lose: R(['The LUMINA hologram at {venue} waves at Blackbird and calls her "Valued Customer".'], { thought: ['A bug. In her heart.'] }) },
  }),
  row({
    id: 'shoplift-merch', where: { feature: 'flagship_store' }, pace: 'quick',
    needs: ['skill:sleight', 'skill:sneak', 'drive:greed'],
    sees: 'Four floors of LUMINA everything, and an alarm on the door that plays a ballad.', stakes: 'Something pastel to fence, or the ballad.', consequence: 'A LUMINA kettle is missing.',
    drives: { greed: 0.5 }, bonus: 0, risk: 0.2,
    check: { parts: ['sleight', ['sneak', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird walks out of the Muse store at {venue} with a limited-edition LUMINA kettle under her coat. It will fence for {amount}nd and she will not be sorry.'], { cash: [20, 60], train: [['sleight', 2]], thought: ['A kettle. With LUMINA\'s face. I will make tea in her honour.'] }),
      lose: R(['The alarm at the door of {venue} plays a LUMINA ballad as Blackbird walks through it with a kettle.'], { apply: (c) => addHeat(c.w, 'muse', 1), thugs: ['inspiration_trooper', 1], thought: ['Serenaded by a security system.'] }) },
  }),
  row({
    id: 'fan-wall', where: { feature: 'fan_wall' }, pace: 'quick',
    needs: ['skill:art', 'stat:charm', 'drive:pride'],
    sees: 'A wall of fan messages for LUMINA, and some for Blackbird in marker, under the official ones.', stakes: 'Sign her own fans\' messages: fame, fans, Muse cross with her.', consequence: 'The wall is half hers.',
    drives: { pride: 0.7 }, bonus: 0.15,
    check: { parts: ['art', ['stat:charm', 0.4]], base: 0.55, per: 0.05,
      win: R(['Blackbird signs every message to her on the fan wall at {venue}, with a different joke each, and adds a big one of her own across LUMINA\'s official banner.'], { fame: 1, apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 4; addHeat(c.w, 'muse', 1); }, train: [['art', 2]], thought: ['Graffiti, but loving.'] }),
      lose: R(['A staffer at {venue} catches Blackbird with a marker at the fan wall and offers her an official sticker instead.'], { thought: ['I do not want an official sticker.'] }) },
  }),
  row({
    id: 'coffee-bar', where: { feature: ['coffee_bar', 'canteen'] }, pace: 'quick',
    needs: ['skill:streetwise', 'stat:charm', 'drive:thirst'],
    sees: 'A coffee bar of drinks named after LUMINA songs, and staff on a break who will say anything to a stranger.', stakes: 'A drink and a chat: a tip, or something about where the files are kept.', consequence: 'Somebody on the staff thinks she is a temp.',
    drives: { thirst: 0.4, curiosity: 0.4 }, bonus: 0.1,
    check: { who: 'arch:muse_staffer', parts: ['streetwise', ['stat:charm', 0.5]], base: 0.5, per: 0.05,
      win: R(['Over a drink named after a LUMINA single, {npc} tells Blackbird which floor the records are on, and, for some reason, about {tip}.'], { tip: true, hp: 2, thought: ['Coffee. The truth serum of the open-plan office.'] }),
      lose: R(['{npc} at {venue} only wants to talk about the new mandatory wellness module.'], { hp: 1, thought: ['It sounded mandatory.'] }) },
  }),
  row({
    id: 'canteen-gossip', where: { feature: 'canteen' }, pace: 'session',
    needs: ['skill:streetwise', 'skill:perception', 'drive:curiosity'],
    sees: 'A staff canteen where everything is said, and the salad bar is the confessional.', stakes: 'An hour of eavesdropping: what Muse is planning for her, and a little heat off.', consequence: 'She knows what they are saying about her upstairs.',
    drives: { curiosity: 0.7 }, bonus: 0.15, ok: at('canteen'),
    check: { parts: ['perception', ['streetwise', 0.6]], base: 0.45, per: 0.06,
      win: R(['At the salad bar in {venue}, two people from Clearance discuss "the Blackbird situation" in voices they think are low. She learns the date of the next sweep and the name of the officer who likes her second album.'], { apply: (c) => { c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 2); }, tip: true, train: [['perception', 2]], thought: ['I am a situation. A whole situation.'] }),
      lose: R(['Blackbird listens in the canteen at {venue} for an hour and learns everything about a feud over a stapler.'], { thought: ['The stapler was clearly stolen.'] }) },
  }),
  row({
    id: 'spreadsheet-sabotage', where: { feature: 'open_plan' }, pace: 'session',
    needs: ['skill:calculate', 'skill:tinkering', 'stat:int'],
    sees: 'A spreadsheet of feelings, open on an unattended screen: which songs are approved in which district this quarter.', stakes: 'A few edited cells: Muse loses its grip on her streets, or an IT ticket.', consequence: 'Muse\'s numbers for her block are wrong in her favour.',
    drives: { curiosity: 0.5, greed: 0.2 }, bonus: 0.15, ok: at('open_plan'),
    check: { parts: ['calculate', ['tinkering', 0.5], ['stat:int', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird edits three cells on an unattended spreadsheet at {venue}. Next quarter, Muse will think her neighbourhood loves LUMINA, and stop trying.'], { apply: (c, v) => loosen(c.w, (v as VenueView).main, 15), train: [['calculate', 3]], thought: ['Data is just feelings with columns.'] }),
      lose: R(['The spreadsheet at {venue} has track changes on. Her edits are in red with her face next to them.'], { apply: (c, v) => caught(c, v as VenueView), thought: ['Track changes is surveillance.'] }) },
  }),
  row({
    id: 'take-the-lectern', where: { feature: 'press_room' }, pace: 'session',
    needs: ['skill:speaking', 'stat:charm', 'drive:pride'],
    sees: 'A press room with a lectern, a heart backdrop, and a statement about her troubling sound already drafted.', stakes: 'Take the lectern and give her own statement: a lot of fame, a furious Muse.', consequence: 'The press has her version.',
    drives: { pride: 0.9, bravery: 0.4 }, bonus: 0.2, ok: at('press_room'),
    check: { parts: ['speaking', ['stat:charm', 0.6]], base: 0.35, per: 0.06,
      win: R(['Blackbird steps up to the lectern in the press room at {venue}, reads Muse\'s statement about her "troubling sound" aloud in a funny voice, then gives her own. Somebody was recording. Everybody was.'], { fame: 3, apply: (c) => addHeat(c.w, 'muse', 2), train: [['speaking', 3]], thought: ['A press conference. About me. By me. Ideal.'] }),
      lose: R(['Blackbird steps up to the lectern at {venue} and the microphone has been switched off from upstairs.'], { apply: (c, v) => caught(c, v as VenueView), thought: ['Censored. Mid-sentence. Iconic, though.'] }) },
  }),
  row({
    id: 'focus-group', where: { feature: 'focus_room' }, pace: 'session',
    needs: ['skill:persuasion', 'skill:grifting', 'drive:curiosity'],
    sees: 'A focus group behind a two-way mirror, being asked which feeling they prefer.', stakes: 'Join the group and turn it: twelve strangers who pick her song (Muse forgets her block a little), or the mirror noticing.', consequence: 'A Muse focus group prefers her.',
    drives: { curiosity: 0.5, pride: 0.4 }, bonus: 0.15, ok: at('focus_room'),
    check: { parts: ['persuasion', ['grifting', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird sits in on a Muse focus group at {venue} and, by the end of the hour, all twelve of them prefer her song to LUMINA\'s. The people behind the mirror write that down, unhappily.'], { apply: (c, v) => { const vv = v as VenueView; vv.main.fans = (vv.main.fans ?? 0) + 6; loosen(c.w, vv.main, 10); }, fame: 1, train: [['persuasion', 3]], thought: ['Market research. My market.'] }),
      lose: R(['The focus group at {venue} picks LUMINA, and the man behind the mirror waves at Blackbird.'], { apply: (c, v) => caught(c, v as VenueView), thought: ['They were plants. All twelve.'] }) },
  }),
  row({
    id: 'wellness-pod', where: { feature: 'wellness_pod' }, pace: 'session',
    needs: ['skill:tolerance', 'stat:muscle', 'drive:thirst'],
    sees: 'A pod where LUMINA tells you how to feel, in a voice like warm milk.', stakes: 'An hour in a pod: health back, and a voice in her head she will hum all night.', consequence: 'She feels better, against her will.',
    drives: { thirst: 0.5 }, bonus: 0.1, ok: (w, v) => at('wellness_pod')(w, v) && w.hero.hp < w.hero.maxHp * 0.8,
    check: { parts: ['tolerance', ['stat:muscle', 0.3]], base: 0.6, per: 0.04,
      win: R(['Blackbird lies in a wellness pod at {venue} while LUMINA tells her she is safe, she is seen, she is approved. She is, annoyingly, rested.'], { hp: 15, thought: ['I feel great. I hate that.'] }),
      lose: R(['The wellness pod at {venue} plays LUMINA\'s greatest hits in a loop and will not open for an hour.'], { hp: 5, thought: ['I am approved now. Help.'] }) },
  }),
  row({
    id: 'terrace-leaker', where: { feature: 'smoking_terrace' }, pace: 'session',
    needs: ['skill:persuasion', 'skill:tolerance', 'stat:charm'],
    sees: 'A smoking terrace of Muse staff saying what they really think, and one of them very close to quitting.', stakes: 'Turn a disgruntled staffer: a leak (her Muse heat drops, a tip), a friend inside.', consequence: 'Muse has a leak with her name on it.',
    drives: { curiosity: 0.5, bravery: 0.3 }, bonus: 0.15, ok: at('smoking_terrace'),
    check: { who: 'arch:muse_staffer', parts: ['persuasion', ['tolerance', 0.4], ['stat:charm', 0.5]], base: 0.4, per: 0.06,
      win: R(['On the smoking terrace at {venue}, {npc} tells Blackbird {they} hate{s} {their} job, {their} lanyard and LUMINA\'s new single. By the second cigarette, {npc} is her source.'], { affinity: 15, tip: true, apply: (c) => { c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 2); c.w.counters.muse_source = (c.w.counters.muse_source ?? 0) + 1; }, train: [['persuasion', 2]], thought: ['A mole. A smoking mole.'] }),
      lose: R(['{npc} on the terrace at {venue} likes {their} job, very much, and reports Blackbird to it.'], { apply: (c, v) => caught(c, v as VenueView), thought: ['Some people are happy. Weird.'] }) },
  }),
  row({
    id: 'steal-letters', where: { feature: 'mailroom' }, pace: 'session',
    needs: ['skill:sneak', 'skill:sleight', 'drive:quest'],
    sees: 'A mailroom full of Clearance letters, unsent, in envelopes with hearts, to musicians who have no idea yet.', stakes: 'A sack of letters in the canal: forty musicians never get one, and Muse\'s heat on the district cools.', consequence: 'Forty musicians are not in trouble yet.',
    drives: { quest: 0.6, bravery: 0.3 }, bonus: 0.15, ok: at('mailroom'),
    check: { parts: ['sneak', ['sleight', 0.6]], base: 0.45, per: 0.06,
      win: R(['Blackbird walks out of the mailroom at {venue} with a sack of Clearance letters and drops them in the canal. Forty buskers will play tomorrow without knowing how lucky they are.'], { fame: 0.8, apply: (c, v) => { c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 1); for (const n of (v as VenueView).people) if (n.tags.includes('musician')) n.affinity += 5; }, train: [['sneak', 2]], thought: ['A public service. Unlicensed.'] }),
      lose: R(['The mailroom at {venue} has a franking machine that photographs everyone who touches the post.'], { apply: (c, v) => caught(c, v as VenueView), thought: ['A camera in a franking machine. Paranoid.'] }) },
  }),
  row({
    id: 'rehearsal-hall', where: { feature: 'rehearsal_hall' }, pace: 'session',
    needs: ['skill:dancing', 'skill:music', 'drive:curiosity'],
    sees: 'Muse artists practising approved choreography in silence, to a click.', stakes: 'Teach them something unapproved: their love, fame among Muse\'s own, and Clearance after her.', consequence: 'Muse artists have a move she taught them.',
    drives: { curiosity: 0.5, pride: 0.4 }, bonus: 0.1, ok: at('rehearsal_hall'),
    check: { parts: ['dancing', ['music', 0.5]], base: 0.4, per: 0.06,
      win: R(['In the rehearsal hall at {venue}, Blackbird turns off the click and shows a line of Muse artists a move that is not in the manual. For three minutes they dance like people. One of them cries.'], { fame: 1, apply: (c, v) => { for (const n of (v as VenueView).people) if (n.tags.includes('performer') || n.archetype === 'muse_staffer') n.affinity += 6; }, train: [['dancing', 3]], thought: ['I taught joy. To employees.'] }),
      lose: R(['The Muse artists at {venue} stop, look at the click, and carry on.'], { thought: ['Conditioning. Deep conditioning.'] }) },
  }),
];

// ===================================================================== outside, and anywhere

const ANYWHERE: Affordance<VenueView>[] = [
  row({
    id: 'busk-the-door', where: {}, pace: 'session',
    needs: ['skill:guitar', 'skill:vocals', 'drive:pride'],
    sees: 'The front steps of a Muse building, the best acoustics in the district, and a sign saying NO BUSKING 💖.', stakes: 'An unlicensed set on Muse\'s own steps: fame, fans, tips, and Muse heat.', consequence: 'Muse heard her from inside.',
    drives: { pride: 0.8, bravery: 0.5 }, bonus: 0.2, ok: open,
    check: { parts: ['guitar', ['vocals', 0.5], ['stat:charm', 0.3]], base: 0.35, per: 0.06,
      win: R(['Blackbird plays an unlicensed set on the front steps of {venue}. The staff come to the windows. Some of them sing along, quietly, with their lanyards tucked in. {amount}nd in the case.'], { cash: [15, 60], fame: 1.5, apply: (c, v) => { addHeat(c.w, 'muse', 1); (v as VenueView).main.fans = ((v as VenueView).main.fans ?? 0) + 3; }, train: [['guitar', 2]], thought: ['A concert. For the enemy. They loved it.'] }),
      lose: R(['Blackbird starts a song on the steps of {venue} and a pastel drone hovers down to look at her, very closely.'], { apply: (c) => addHeat(c.w, 'muse', 1), thought: ['The drone was a critic.'] }) },
  }),
  row({
    id: 'tag-the-facade', where: {}, pace: 'session',
    needs: ['skill:art', 'skill:athletics', 'drive:bravery'],
    sees: 'Forty floors of pastel glass, and one blank stretch at street level that is begging for it.', stakes: 'Her name, in metres, on Muse\'s front: fame, and Muse after her.', consequence: 'Her name is on Muse\'s building until they find a pressure washer.',
    drives: { pride: 0.6, bravery: 0.6 }, bonus: 0.1, risk: 0.25, ok: open,
    check: { parts: ['art', ['athletics', 0.5], ['sneak', 0.3]], base: 0.35, per: 0.06,
      win: R(['Blackbird paints her name across the front of {venue} in letters a metre high, with a heart, in Muse pastel, so it looks official. It takes them two days to notice it is not.'], { fame: 1.5, apply: (c) => addHeat(c.w, 'muse', 1), train: [['art', 3]], thought: ['On brand. Their brand. My name.'] }),
      lose: R(['Security at {venue} catches Blackbird halfway through the B, and is very polite about it.'], { apply: (c) => addHeat(c.w, 'muse', 1), thugs: ['inspiration_trooper', 1], thought: ['Half a B. Still art.'] }) },
  }),
  row({
    id: 'people-watch', where: {}, pace: 'quick',
    needs: ['skill:perception', 'skill:streetwise', 'drive:curiosity'],
    sees: 'A lobby where everybody important walks through eventually, with a lanyard, a coffee and a habit.', stakes: 'Twenty minutes watching who goes where: whose lanyard opens what (the next climb is easier).', consequence: 'She knows the building\'s rhythm.',
    drives: { curiosity: 0.6 }, bonus: 0.1, ok: open,
    check: { parts: ['perception', ['streetwise', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird watches the lobby at {venue} for twenty minutes. The cleaners use the side lift. The executives use the gold one. The interns use whichever one is open. She notes all three.'], { apply: (c, v) => { if (clearance(c.w, v as VenueView) < 1) raise(c, v as VenueView, 1); }, train: [['perception', 2]], thought: ['A building is a clock. I can read clocks.'] }),
      lose: R(['Blackbird watches the lobby at {venue} until a receptionist asks if she is waiting for somebody.'], { thought: ['I am waiting for justice.'] }) },
  }),
];

export const MUSEHQ_ROWS: Affordance<VenueView>[] = [...CLIMB, ...PUBLIC, ...ANYWHERE];
export { find };
