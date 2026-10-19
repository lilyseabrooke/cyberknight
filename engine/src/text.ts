import type { Rng } from './rng';
import type { GameEvent, EventData } from './events';
import { GANGS } from './content/archetypes';
import { TRAITS, type Personality, type Trait } from './personality';
import { pronounToken } from './pronouns';

export interface TextLine {
  /** `report` = neutral field report. `thought` = Blackbird's own cocky inner voice. */
  voice: 'report' | 'thought';
  text: string;
}

export interface RenderCtx {
  rng: Rng;
  /** Her personality vector, for trait-specific thoughts. */
  personality: Personality;
  realName: string;
}

type Lines = string[] | ((d: EventData) => string[]);
interface Entry {
  r: Lines;
  t?: Lines;
}
const e = (r: Lines, t?: Lines): Entry => ({ r, t });
/** Lines for an errand's outcome, told with a lead-in when she isn't there to see it. */
const errand = (key: string, say: (d: EventData) => string[]): Record<string, Entry> => ({
  [`errand:${key}`]: e((d) => say(d).map((l) => (d.seen ? l : `Across Neo, at ${d.place}: ${l}`)), key.endsWith('_ok') ? ['Delegation works. Look at me.'] : ['I will pretend that was the plan.']),
});


const $ = (n: unknown): string => Number(n).toLocaleString('en-US');
/** An act of fame, as a phrase. */
const ACTS: Record<string, string> = { karaoke: 'a karaoke number', dj_set: 'a DJ set', gig: 'a gig with the band', billboard: 'hijacking a billboard', graffiti: 'a big piece of graffiti', busk: 'busking', parkour: 'some rooftop parkour', sing_busk: 'singing on the street', crash_gig: 'crashing somebody else\'s gig', guitar_duel: 'a guitar duel', backlot_set: 'a set for the kids behind the club', beat_battle: 'a beat battle', jam: 'a jam with the band', stump_speech: 'a speech on a soapbox' };
const act = (a: unknown): string => ACTS[String(a)] ?? String(a);
/** Lower-case the first letter, so a button's label can sit in the middle of a sentence. */
const lc = (s: unknown): string => String(s).charAt(0).toLowerCase() + String(s).slice(1);
/** Start a sentence with whatever it is. */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** Its callsign, read off its flank. */
const named = (d: EventData): string => (d.name ? ` Stencilled on its flank: ${d.name}.` : '');
/** How long ago, in nights. */
const ago = (n: unknown): string => (Number(n) <= 0 ? 'earlier tonight' : Number(n) === 1 ? 'last night' : `${n} nights ago`);
/** Which way something that just went through went. */
const heads = (d: EventData): string => (d.heading ? ` It went toward ${d.heading}.` : '');
/** How a road class reads in a sentence about something going wrong on it. */
const ROADS: Record<string, string> = { highway: 'The highway', street: 'The street', small: 'A tight little street', pedestrian: 'A pedestrian way full of people', alley: 'An alley' };
const roman = (n: unknown): string => ['', 'I', 'II', 'III', 'IV', 'V'][Number(n)] ?? String(n);

/** The second batch of dragons in a fight (docs/DRAGONS_PLAN.md): how they open it, how it goes, keyed by archetype. */
type Say = (d: EventData) => string[];
const DEMETERS = ['demeter', 'demeter2', 'demeter3', 'demeter4'];
const forAll = <F>(keys: string[], say: F): Record<string, F> => Object.fromEntries(keys.map((k) => [k, say]));
const DRAGON_OPEN: Record<string, Say> = {
  hermes: (d) => [`${d.foes} lands badly, drops its clipboard, and puts up what it believes to be its guard.`],
  hermes3: (d) => [`${d.foes} is, unbelievably, standing still. It looks at Blackbird the way you look at a very slow customer.`],
  ...forAll(DEMETERS, (d) => [`${d.foe} unfolds its baskets and lowers a gun barrel through the weave. "PUBLIC SECURITY INCIDENT," it announces. "THIS IS FOR THE HARVEST."`]),
  artemis2: (d) => [`${d.foes} comes down in a tight, practiced spiral and settles on a rooftop with a clear line to Blackbird. It has been waiting a while. It says so.`],
  ares2: (d) => [`${d.foe} hits the street front-first, loudspeaker blaring. "YOU ARE UNDER ARREST. YOU ARE ALSO UNDER THE DRAGON."`],
  ares4: (d) => [`${d.foes} does not so much arrive as stop being elsewhere. The air in the street leans away from it. "BLACKBIRD. YOU ARE IDENTIFIED. YOU ARE ACCUSED. YOU ARE OUTSIDE."`],
};
const DRAGON_WIN: Record<string, (d: EventData, spoils: string) => string[]> = {
  hermes: (d, sp) => [`The Hermes comes down in ${d.rounds} rounds, scattering undeliverable parcels across the road. Nobody is home to sign for any of them.${sp}`],
  hermes3: (d, sp) => [`Impossibly, the Hermes Mk. III is on the ground in ${d.rounds} rounds, white plating folded like paper. Blackbird looks at what it was carrying for some time.${sp}`],
  ...forAll(DEMETERS, (d, sp) => [`The Demeter comes down in ${d.rounds} rounds, baskets bursting. Every coin it ever collected goes rolling down the gutter, and the whole street suddenly has somewhere to be.${sp}`, `${d.rounds} rounds, and the harvest is over. The jingle plays on for a few seconds more, and then it, too, is paid in full.${sp}`]),
  artemis2: (d, sp) => [`The Artemis Mk. II comes down in ${d.rounds} rounds, still tracking her to the end. Its optics are looking right at her when they go out.${sp}`],
  ares2: (d, sp) => [`The Ares Mk. II goes down in ${d.rounds} rounds with its loudspeaker stuck on "CITIZEN" in a loop. Nobody on the block has ever been so glad to hear a word.${sp}`],
  ares4: (d, sp) => [`Against every expectation, including the dragon's, the Ares Mk. IV hits the street in ${d.rounds} rounds. The scream winds down like a siren in a tunnel. For a moment the whole district listens to nothing.${sp}`],
};
const DRAGON_DEAD: Record<string, Say> = {
  hermes: (d) => [`The Hermes takes Blackbird down in round ${d.rounds}, then, after a pause, tries to get her to sign for it.`],
  hermes3: (d) => [`Round ${d.rounds}. The Hermes Mk. III files a complaint about the delay.`],
  ...forAll(DEMETERS, (d) => [`The Demeter closes its baskets on Blackbird in round ${d.rounds}. It enters her under "non-contributor" and moves on to the next street.`, `Round ${d.rounds}. "THE HARVEST IS IN," the Demeter announces, and it very much is.`]),
  artemis2: (d) => [`The Artemis Mk. II finishes Blackbird in round ${d.rounds}, without hurry, the way you finish a task you've been assigned for a while.`],
  ares2: (d) => [`Round ${d.rounds}. The Ares Mk. II reads Blackbird her rights over what is left of her, and then, with a kind of grim thoroughness, her gang affiliations.`],
  ares4: (d) => [`Round ${d.rounds}. The Ares Mk. IV leaves a pale mark on the pavement and an announcement that the district has been secured. All the shutters stay down.`],
};

/** How a thing she's found out about someone reaches her. `core` is the news, written about `d.npc`. */
function learnLine(d: EventData, core: string): string {
  switch (d.via) {
    case 'saw': return `Blackbird picks it up from the details. ${core}.`;
    case 'overheard': return `Blackbird catches it in passing. ${core}.`;
    case 'paid': return `It costs Blackbird a little, and ${d.source ?? d.npc} talks. ${core}.`;
    case 'tip': return `${d.source} leans in and gossips. ${core}.`;
    default: return `It comes out in conversation. ${core}.`;
  }
}

export const BLURBS: Record<string, string> = {
  halo_floor: 'The Rusty Halo: synth-whiskey, neon halos that flicker in Morse code, and a jukebox that has opinions.',
  halo_restroom: 'The bathroom. The stall door says OPEN 24H. Someone has a surgical tray on the sink.',
  halo_kitchen: 'The kitchen smells like frying oil and bad decisions. Six hands are working on one order of noodles.',
  halo_arcade: 'The basement arcade. A laser-tag arena glows in the dark. A league banner reads NEON KNIGHTS: 0 WINS.',
  halo_backroom: 'The backroom: poker table, cigar smoke, and a wall safe that wants to be loved.',
  halo_roof: 'The Halo roof. Wind, rust, and the whole megacity laid out like a circuit board.',
  club_greenroom: "The Neon Pharaoh's green room: a couch with a history, a cooler of warm beer, and a vintage guitar on a stand like a relic.",
  chem_mart: 'Lucky Seven Chem-Mart: fluorescent lights, a rack of med packs behind glass, and a pharmacist who has seen worse than whatever you are about to describe.',
  gun_shop: 'Bullets & Bagels: a long counter of guns, a short counter of bagels, and a sign that reads NO REFUNDS ON FIREARMS OR REGRETS.',
  club_backlot: 'The lot behind the Neon Pharaoh: milk crates, a boombox, and a few street kids with serious faces.',
  home_stacks: 'The Stacks, unit 4C: one room, one window, one plant that is a good deal healthier than it looks, and a bed that will have to do.',
  home_hab: 'A capsule hab in the Honeycomb: a bed the size of a coffin, three monitors, a tangle of cables, and a very faint smell of burnt dust.',
  home_penthouse: 'A corporate penthouse: floor-to-ceiling glass, nothing on the walls, and a view of the dragon patrols that costs more per month than the whole of Blackbird\'s neighborhood.',
  halo_alley: 'The alley behind the Halo. Steam vents, puddles with colors, and a dumpster that has seen things.',
  street_main: 'Strand Street. Rain, neon, ads for things that should not be advertised.',
  neon_pharaoh: 'The Neon Pharaoh: gold-plated hologram sphinxes, bass you can feel in your implants, a velvet rope guarded by sunglasses.',
  club_maintenance: 'A maintenance crawlspace: pipes, cables, and the distant sound of someone else being very wrong about the lease.',
  helix_dock: 'Helix Biotech loading dock. Everything is matte-black and has a barcode.',
  helix_lobby: 'The Helix lobby: white marble, a fountain, and a logo that looks at you.',
  helix_lab: 'Helix Research Wing. Glass cages. Something in one of them is humming a tune.',
  overpass: 'The Kowloon Overpass. The air tastes like ozone. Up above, a shape blots out the neon.',
};

/** What she says to herself about each Calling, in her own voice. */
const CALLING_VOWS: Record<string, string> = {
  vocals: 'They will hear me from the other side of the Wall.',
  guitar: 'My hands know. They have always known.',
  djing: 'Every floor in Neo. One at a time. In order.',
  beatbox: 'The city will never be the same again. I will make sure of it with my mouth.',
  art: 'Every wall in this city is a canvas that has not met me yet.',
  cops: 'One. Then another. I am not going to stop counting.',
  gang: 'They have a name. I am going to be the reason they stop having one.',
  avenge: 'I will carry that name until I can put it on someone else.',
  dragon: 'Big. Loud. Atlas-stencilled. Mine.',
  guardian: 'Not on my streets. Not tonight, not any night.',
  atlas: 'Eight of them. One of me. That is not a problem, that is a schedule.',
  score: 'The kind of job they write songs about. After they finish the paperwork.',
  ghost: 'No witnesses. No traces. Not even a vibe.',
  kit: 'Best chrome, best iron. The rest is footnotes.',
  net: 'There is nothing in this city that cannot be jacked.',
  one: 'Somewhere out there is the person this was all for.',
  heartbreaker: 'Every one of them will remember my name. Some of them will say it out loud.',
  puppies: 'No stray left behind. Not one.',
  strongest: 'Nobody in this city is allowed to be stronger than me. I will check each of them personally.',
  roof: 'Nobody gets to catch me, ever. That is not a boast, it is a plan.',
  road: 'Anything with wheels. As fast as it will go and then some.',
  table: 'Every table in Neo owes me money. They just do not know it yet.',
  drink: 'Every bar. Every last one. In order.',
  banned: 'A list of every bar that has thrown me out. I want it longer.',
  explore: 'Every street, every alley, every rooftop. Then the sewers. Then the other sewers.',
  cook: 'Noodles. Real ones. The kind that make people cry in the good way.',
};

const T: Record<string, Entry> = {
  depart: e(
    (d) => [
      `Night falls on Neo. Blackbird pushes through the doors of ${d.place}.`,
      `Another night, another neighborhood the city forgot to fix. Blackbird walks into ${d.place}.`,
    ],
    ['Dragons, damsels, and a whole city that needs saving. Easy.', "Neo, I'm back. Try to keep up."],
  ),

  // ---------------------------------------------------------------- movement
  'hijack:ok': e(
    (d) => [
      d.kind === 'police' ? `Blackbird pops the door of ${d.car} and is behind the wheel before the dash has finished booting. It is, strictly, the NPD's.` : d.kind === 'atlas' ? `Blackbird has ${d.car} open and running in under a minute. Atlas fleet vehicles come with trackers. She knows. She drives it anyway.` : `Blackbird slips into ${d.car}, shorts two wires, and the engine coughs awake. Ownership has been renegotiated.`,
      d.seen ? 'Somebody was looking. Somebody is always looking.' : 'Nobody watching. The street holds its breath, then goes back to its business.',
    ],
    ['Borrowing. Indefinitely.', 'Never leave your keys in a city that has me in it.'],
  ),
  'hijack:fail': e((d) => [`${d.car}'s alarm shrieks the second Blackbird touches the handle. Every head on the street turns. She leaves it where it is.`, `The ignition on ${d.car} bites back with a jolt and a siren. Blackbird withdraws with as much dignity as she can find.`], ['That car had a better lock than I deserved to meet.']),
  'drive:along': e((d) => [`Blackbird takes ${d.car} down ${d.hops} streets${d.highway ? ', most of them on the highway,' : ''} at ${Number(d.speed) > 85 ? 'a speed that would make a lawyer wince' : Number(d.speed) < 50 ? 'a careful crawl' : 'speed'} and pulls up at ${d.to}.`, `${d.hops} streets slide past the windows. ${d.to}.`], ['Faster than walking. Louder, too.', 'Drive, she said. So I did.']),
  'drive:across': e((d) => [`Blackbird takes ${d.car} out of ${d.from} and across the district line, ${d.hops} streets in what feels like a long blink. ${d.to}.`, `The neon changes colour somewhere around the third street. Blackbird pulls ${d.car} up at ${d.to}, in a different part of the city.`], ['A whole other district, and my tank is full of somebody else\'s gas.', 'Neo is smaller from a car.']),
  'vehicle:keyed': e(
    (d) => [d.kind === 'police' ? `The key from the officer's pocket turns in ${d.car} like it was made for it, which it was. Blackbird is behind the wheel of an NPD car with nobody to say otherwise.` : d.kind === 'atlas' ? `The key opens ${d.car} with a polite chirp. Blackbird gets in. The seat adjusts itself to her, which is unnerving.` : `The key slides into ${d.car} and turns. No wire, no alarm, no hurry. Blackbird gets in and shuts the door behind her like she owns it. She does now.`],
    ['Keys. Underrated.', 'Look at that. A door that opens when I ask.'],
  ),
  'hijack:ok:bike': e(
    (d) => [
      d.kind === 'police' ? `Blackbird swings a leg over ${d.car} and has it running before anyone remembers it is theirs.` : d.kind === 'atlas' ? `${d.car} wakes with a polite chirp and a tracker light. Blackbird is on it and gone before the chirp ends.` : `Blackbird bridges the ignition on ${d.car} with her thumbnail and a prayer. It coughs, catches, and is hers.`,
      d.seen ? 'Somebody saw. Somebody always sees.' : 'Nobody was looking. The street holds its breath, then lets it out.',
    ],
    ['No doors. No locks worth the name. Freedom.', 'Bikes are practically a suggestion.'],
  ),
  'hijack:fail:bike': e((d) => [`${d.car} shrieks the moment Blackbird touches the bars. Heads turn. She walks away from it, quickly, with her hands where people can see them.`], ['A bike with a good alarm is a rare and personal insult.']),
  'vehicle:keyed:bike': e((d) => [`The key turns, ${d.car} coughs awake, and Blackbird swings a leg over it like she has done it a thousand times. Nobody sees a thing, because there is nothing to see.`], ['Keys. I will never take them for granted again. (I will, but not tonight.)']),
  'vehicle:back:bike': e((d) => [`${d.car} is where Blackbird left it, on ${d.place}, with a pigeon on the seat. She shoos the pigeon.`], ['Mine. Do not touch.']),
  'vehicle:left:bike': e((d) => [`Blackbird kicks the stand down on ${d.car} outside ${d.place}. It is still hers. For now.`], ['Parked. Illegally. With a flourish.']),
  'vehicle:gone:bike': e((d) => [`Where Blackbird left ${d.car} on ${d.place} there is a stand-shaped scratch on the pavement and a smell of petrol. It walked.`], ['Bikes: they leave.']),
  'vehicle:riders:bike': e((d) => [d.left ? `There is room for one behind her, and ${d.riders || 'nobody'} takes it. ${d.left} will have to find another way.` : `${d.riders} climb${String(d.riders).includes(' and ') ? '' : 's'} on behind. Blackbird tells them where to put their hands.`], ['Hold on.']),
  'drive:along:bike': e((d) => [`Blackbird takes ${d.car} down ${d.hops} streets with the wind in her teeth, and stops at ${d.to}.`, `${d.hops} streets go by in a smear. ${d.to}.`], ['Faster than walking. Louder than anything.']),
  'drive:across:bike': e((d) => [`Blackbird threads ${d.car} out of ${d.from}, through whatever gaps there are, and across the district line. ${d.to}, ${d.hops} streets later, with bugs in her teeth.`, `The neon changes colour and Blackbird does not slow down. ${d.to}.`], ['I could do this all night. I am doing this all night.']),
  'car_drive_off:bike': e((d) => [`Blackbird is on ${d.car} before anybody can stop her, and the fight is a noise in the mirror.`], ['Two wheels. No regrets.']),
  'car_run_down:bike': e((d) => [`${d.foe} looks up in time to see the headlamp of ${d.car}, and not in time to do anything about it.`], ['Move.']),
  'car_wreck:bike': e(
    (d) => [d.hero ? `${d.car} goes out from under Blackbird in a ball of fire and a lot of sparks. She hits the road rolling. The bike keeps going without her, then stops, then burns.` : d.count ? `${d.car} goes up with ${d.inside} on it. The road is on fire for a moment.` : `${d.car} goes up with a crump and a smell of petrol. Nobody was on it.`],
    ['Bikes: faster than cars, and so, so much less forgiving.'],
  ),
  'car_hit:scuffed:bike': e((d) => [d.mine ? `${d.car} takes a hit and a mirror goes spinning away down the road.` : `${d.car} loses a mirror and a little pride.`]),
  'car_hit:battered:bike': e((d) => [d.mine ? `${d.car} is bent now: a fork out of true, a handlebar that wants to go left.` : `${d.car} is badly bent.`], ['It is handling like a shopping trolley.']),
  'car_hit:smoking:bike': e((d) => [d.mine ? `${d.car} is trailing smoke and smells like a bad decision. Something is going to let go very soon.` : `${d.car} is smoking; its rider thinks about it.`], ['Off. Off. Get off.']),
  'chase_round:floor_it:bike': e((d) => [`${cap(String(d.scene))}. Blackbird opens ${d.car} up. ${d.band === 'far' ? 'The gap widens' : `They are ${d.band}`}, and the engine screams${Number(d.hurt) ? ' like it is complaining' : ''}.`]),
  'chase_round:use_prop:foot': e((d) => [`Blackbird does not slow down. She puts a hand out as she goes by and the street takes care of the rest.`]),
  'chase_round:use_prop': e((d) => [`Blackbird does something to the street on her way past.`]),
  'chase_round:hack_cam:foot': e((d) => [`Blackbird keeps running and works her Override with one hand.`]),
  'chase_round:hack_cam': e((d) => [`Blackbird works her Override on the street's cameras as she goes.`]),
  'chase_cam': e((d) => d.variant === 'hacked' ? [`Blackbird sticks an Override into the pole camera that has been following her down the street. It looks away. ${cap(String(d.foe))} loses the feed, and her.`, `One flicker, and the camera that had her is looking at a wall. The control room hasn't noticed yet.`] : [`Blackbird reaches for the camera and the camera reaches back: a trace. ${cap(String(d.foe))} knows exactly where she is now.`], ['Smile. You are on fifty cameras.']),
  'chase_prop': e((d) => d.ok
    ? (d.variant === 'bins' ? [`Blackbird kicks a row of bins over behind her. They roll across the street, and ${d.foe} hits them at a run.`] : d.variant === 'crates' ? [`Blackbird hauls a stack of crates over in the middle of the road. It all comes down in ${d.foe}'s face.`] : d.variant === 'stall' ? [`Blackbird yanks the awning of a stall down behind her. Cloth and poles and screaming stallholder, right across the way.`] : d.variant === 'parked_car' ? [`Blackbird's Override finds a parked car's drive, and it pulls out across the street with its hazards on, driverless. ${cap(String(d.foe))} has to go round.`] : d.variant === 'barrier' ? [`A road barrier goes up across the street behind her at the touch of an Override. ${cap(String(d.foe))} meets it.`] : d.variant === 'turret' ? [`A sentry turret on a pole wakes up at her Override and finds a target that is not her.`, `Blackbird tells a turret who is the enemy. It agrees.`] : d.variant === 'signal' ? [`Every light on the junction goes green at once, and then red. The cross traffic does what cross traffic does.`] : d.variant === 'lamp' ? [`Blackbird kills a streetlamp with one shot of her boot and a spark. The street goes dark around her.`] : [`Blackbird wrenches a valve and a vent goes off in a wall of steam behind her. ${cap(String(d.foe))} runs into it.`])
    : d.machine ? [`Blackbird's Override finds ${d.label} and it does not take. ${cap(String(d.foe))} is a step closer.`] : [`Blackbird goes for ${d.label} and it does not go the way she planned: it stays up, and ${d.foe} is a step closer.`], ['Street furniture is on my side.', 'Public works. I fund them, in a way.']),
  'chase_round:swerve:bike': e((d) => [`Blackbird throws the bike one way and her weight the other. Whatever was coming her way hits the road.`]),
  'chase_round:lane_split': e((d) => [`Between a van and a wall with a hand's width either side, Blackbird goes through the middle of the traffic like it was a door. ${d.foe} cannot follow, and has to find another gap.`], ['Cars have to stay in their lanes. I have a lane the width of a handlebar.']),
  'chase_round:ram:bike': e((d) => [`Blackbird puts ${d.car} into ${d.foe} on purpose. This is a bad idea, in the way that a very small thing hitting a very large thing is a bad idea.`], ['Ow.']),
  'chase_round:bail:bike': e((d) => [`Blackbird kicks off the bike and is rolling before it has stopped moving.`]),
  'chase_round:shoot:bike': e((d) => [String(d.events).includes('shot') ? `One hand on the bars, one on the gun: Blackbird puts shots into ${d.foe} from the saddle. Some of them even find it.` : `Blackbird fires over her shoulder at ${d.foe} and hits something that was not ${d.foe}.`], ['Do not try this at home. Do not try this anywhere.']),
  'chase_end:bailed:bike': e((d) => [`Blackbird comes off in a skid and a lot of road. ${d.car} goes on for a while without her, then lies down. (Down ${d.taken}.)`], ['Get up. Get up. Get up.']),
  'chase_end:wrecked:bike': e((d) => [`${d.car} is gone, and Blackbird has been thrown a very long way from it.`], ['I am so sorry about that bike.']),
  'tactic:ride_by': e((d) => [`Blackbird comes through at speed and hits ${d.foe} on the way past with ${d.weapon}${Number(d.dmg) ? ` for ${d.dmg}` : ', and misses'}. By the time anyone turns round she is gone.`, `A ride-by: in, ${d.foe}, out.`], ['Hit and run. Mostly run.', 'Never stand still.']),
  'accident:scrape': e(
    (d) => [`${cap(String(d.scene))} takes a bite out of ${d.car} at ${d.speed}% of everything it has: a wall, a bin, a very surprised parked car. Paint and pride, nothing worse.`, `${d.car} meets a corner it was not expecting${Number(d.speed) > 80 ? ', flat out' : ''}. A long scrape, a lot of noise, and a wing mirror in a gutter.`],
    ['That was not my fault. That was the road.', 'Ease off. Ease off. Ease off.'],
  ),
  'accident:collision': e(
    (d) => [`${d.road === 'pedestrian' ? 'A crowd, a kiosk and a stall full of noodles' : d.road === 'alley' ? 'A skip' : d.road === 'highway' ? 'A barrier' : 'A delivery van'} comes out of nowhere and ${d.car} does not stop in time. A proper crash: glass, a bent frame, and a long silence afterwards.`, `Blackbird takes ${ROADS[String(d.road)]?.toLowerCase() ?? 'the road'} too fast, and it ends against something solid.`],
    ['Brakes. Brakes are a thing, apparently.'],
  ),
  'accident:chase': e((d) => [`Blackbird clips something, and somebody who saw is already talking into a phone. ${d.car} is hurt, and sirens are coming from every direction at once.`], ['Of course there is a cop. There is always a cop. There is a cop for everything.']),
  'accident:thrown': e((d) => [`${d.car} goes out from under Blackbird at ${d.speed}% and she goes over the front of it. Sky, road, sky, road. (Down ${d.fall}.) The ${d.body === 'bike' ? 'bike' : 'car'} slides on without her and comes to rest against a wall, still running.`], ['I would like to file a complaint with gravity.']),
  'accident:wreck': e((d) => [`That is the end of ${d.car}.`]),
  'accident:thrown:bike': e((d) => [`The front wheel of ${d.car} finds something at ${d.speed}% and the rest of the bike goes on without her. Blackbird skates a very long way down ${ROADS[String(d.road)]?.toLowerCase() ?? 'the road'} on her coat. (Down ${d.fall}.)`], ['Gravel. So much gravel. In places.']),
  'accident:scrape:bike': e((d) => [`${d.car} lays a footpeg on ${ROADS[String(d.road)]?.toLowerCase() ?? 'the road'} and shows sparks, and Blackbird saves it by about the width of a tyre. A mirror is gone. So is a little of her composure.`], ['I meant to do that. I did not mean to do that.']),
  'accident:collision:bike': e((d) => [`${d.car} goes into ${d.road === 'pedestrian' ? 'a noodle stall' : 'the back of a van'} at ${d.speed}% and Blackbird goes into whatever is next. It is going to hurt for a week.`], ['Helmets. People keep saying helmets.']),
  'foe_flees:drove': e((d) => [`${d.foe} breaks away, gets into ${d.car} and is gone before anybody can do anything about it.`, `${d.foe} (${d.role}) has the key in {their:foe} hand and the engine running before Blackbird has turned round.`], ['They had a key. Of course they had a key.', 'Cars. Cars are cheating.']),
  'getaway': e((d) => [`${d.car} takes the corner at the end of ${d.place} on two wheels and is gone, with ${d.foe} behind the wheel.`, `Taillights, and the sound of ${d.car} getting smaller. ${d.foe} has got away.`], ['I can still see the taillights. For about four more seconds.', 'Not yet, then.']),
  'getaway:bike': e((d) => [`${d.foe} kicks ${d.car} into life and is gone down ${d.place} before the engine has finished catching.`, `A bark of two-stroke, and ${d.foe} is a sound and then not even that.`], ['A bike. They always have a bike.']),
  'vehicle_attack:npd': e((d) => [`${d.car} noses onto ${d.place} and stops across Blackbird's path. ${Number(d.count) > 1 ? `${d.count} officers` : 'An officer'} get out with their hands near their holsters. ${d.foe} says her name like it is on a form.`], ['A patrol. Of course.', 'They are not here to ask for directions.']),
  'vehicle_attack:gang': e((d) => [`${d.car} comes round the corner on ${d.place} far too fast, windows down, ${d.count} of ${d.foe}'s crew hanging out of it.${d.dmg ? ` The first pass costs Blackbird ${d.dmg} HP.` : ' The first pass goes wide.'}`], ['Drive-by. Classic.', 'Somebody is going to be embarrassed about this later.']),
  'vehicle_attack:gang:bike': e((d) => [`A ${d.car} howls down ${d.place} with ${d.foe} riding it, one hand on the bars and one holding a gun.${d.dmg ? ` Blackbird takes ${d.dmg} HP on the pass.` : ' The shots go wide.'}`], ['One rider. Confident.']),
  'attack_choice:stand': e((d) => [Number(d.count) > 1 ? `Blackbird plants her feet. ${d.count} of them, and a car behind them for cover. Fine.` : `Blackbird plants her feet. One of them. Fine.`], ['Come on, then.', 'I am not running from a car.']),
  'attack_choice:run': e((d) => [d.on === 'wheels' ? `Blackbird floors it. They turn the car round.` : `Blackbird runs. The engine behind her turns over, and ${d.foe} is not on foot.`], ['Bad idea. Running is always a bad idea. I am doing it anyway.', 'Alleys. I need an alley.']),
  'give_chase:start': e((d) => [d.running ? `Blackbird puts ${d.hers} after ${d.foe}, who is on foot and has a head start and an idea of the alleys.` : `Blackbird takes ${d.hers} after ${d.foe}, who is in ${d.car} and already a street ahead.`], ['Hold on to something.']),
  'give_chase:start:bike': e((d) => [`Blackbird swings onto ${d.hers} and goes after ${d.foe} in ${d.car}.`], ['Get them.']),
  'give_chase:foot': e((d) => [d.running ? `Blackbird goes after ${d.foe} on foot. ${d.foe} is already moving.` : `Blackbird runs after ${d.car}, which has ${d.foe} in it and has no intention of waiting.`, d.running ? `A foot chase, then. ${d.foe} runs, and Blackbird runs after.` : `Blackbird gives chase on foot. ${d.car} is a car.`], ['I regret nothing. I will be out of breath in a moment.']),
  'give_chase:foot_lost': e((d) => [`Blackbird runs until the taillights of ${d.car} are a rumour, and then a little longer, and then stops with her hands on her knees. ${d.foe} is gone.`], ['Legs. They were always going to be the problem.', 'I need a faster everything.']),
  'give_chase:foot_caught': e((d) => [`Somehow, impossibly, Blackbird is level with ${d.car} and has a hand on the door.`], ['I do not know how I did that. Nobody does.']),
  'give_chase:lost': e((d) => [`${d.foe} gets clean away. The road goes on without either of them.`], ['I will find them. I know where they live. Probably.']),
  'give_chase:cornered': e((d) => [`There is nowhere left for ${d.foe} to go.`], ['End of the road.']),
  'getaway:foot': e((d) => [`${d.foe} bolts down ${d.place} and round the corner, and is gone into the streets.`, `${d.foe} (${d.role}) runs. Blackbird can still hear the feet for a moment.`], ['Running. It always comes to running.']),
  'chase_start:foot': e((d) => [d.mode === 'pursuer' ? `Blackbird sets off after ${d.foes}, on foot, on ${d.place}.` : `${d.foes} come after Blackbird, and she runs.`], ['Run.']),
  'chase_round:floor_it:foot': e((d) => [`${cap(String(d.scene))}. Blackbird puts her head down and sprints. ${d.band === 'far' ? 'The gap opens' : `They are ${d.band}`}${Number(d.hurt) ? ', but it costs her' : ''}.`]),
  'chase_round:swerve:foot': e((d) => [`Blackbird jinks left, then right, through whatever is in the way. Whatever was coming her way misses.`]),
  'chase_round:lose_them:foot': e((d) => (String(d.events).includes('hide:found') ? [`Blackbird throws herself into a dark corner off the line and goes still. It is not dark enough: one of them turns his head as he passes, and stops.`, `She ducks behind the nearest cover and holds her breath. Somebody looks straight at her.`] : String(d.events).includes('lost:cover') ? [`Blackbird is off the line and down in the dark before they round the corner, and she does not move. They run straight past, close enough to touch, and on down the street after somebody who is not there.`, `A dark gap, a held breath. The footsteps come, and slow, and go on past. Whoever they are chasing is further down the street now, in their heads.`] : String(d.events).includes('over:stuck') ? [`Blackbird gets one hand on the top of it and her boot caught in the wire. By the time she is free they are right behind her.`, `The way over is not as easy as it looked from the other side. They catch up while she is still on it.`] : String(d.events).includes('lost:over') ? [`A fence, a crawl space, a wall: whatever is in the way, Blackbird goes over, through or under it and is on the other side before they have worked out how.`, `Blackbird takes the obstacle in one go and drops down into the next street. Nobody follows.`] : String(d.events).includes('lost:door') ? [`A door, a shoulder against it, and Blackbird is inside with it shut behind her before anyone has turned the corner.`, `Blackbird goes in through the first door that gives and leans on it, breathing, while the footsteps go past.`] : String(d.events).includes('lost:mouth') ? [`A gap between two buildings, and Blackbird is gone into it. The alley swallows her, and the street goes on without her.`, `Blackbird cuts into an alley the width of her shoulders and does not stop until the noise is behind her.`] : String(d.events).includes('lost:up') ? [`Blackbird takes ${String(d.events).includes('lost:up') ? 'the way up' : ''} two rungs at a time and is on the roofs, flat against the tar, as they pass beneath.`, `Up, and over, and down on her stomach behind a parapet. They run straight past.`] : [`A doorway, a stall, a laundry line and a hole in a fence. ${String(d.events).includes('lost') ? 'Blackbird comes out the other side alone.' : 'They are still back there.'}`]), ['The city is bigger than they are.']),
  'chase_round:shoot:foot': e((d) => [String(d.events).includes('shot') ? `Blackbird stops, turns and puts shots into ${d.foe}, then runs again. Some of them find it.` : `Blackbird fires over her shoulder at ${d.foe} and hits a shutter.`], ['Never run with a loaded gun. I do it constantly.']),
  'chase_round:grab': e((d) => [String(d.events).includes('grab_failed') ? `Blackbird goes for a vehicle at the kerb and the vehicle goes for her instead: an alarm, a shout, a lost second.` : `A vehicle at the kerb, and no time to ask: Blackbird is on it and moving.`], ['Borrowed. Again.']),
  'chase_round:dismount': e((d) => [`${cap(String(d.scene))} is no place for ${d.car}. Blackbird bails out of it and goes on after ${d.foe} on foot.`]),
  'chase_round:shortcut': e((d) => [`Blackbird stops following ${d.foe} and starts anticipating them.`, `The map in Blackbird's head has ${d.foe}'s route on it, and a quicker one of her own.`], ['Nobody runs in a straight line. They run to somewhere.']),
  'chase_block:ahead': e((d) => [`Ahead, two cruisers slewed nose to tail across ${d.place}, lights going, and a gap you could not get a bicycle through.`, `Somebody has beaten Blackbird to the end of ${d.place}. Blue and red light, and a line of vehicles where the road ought to be.`], ['They knew which way I would go. That is the annoying thing about being predictable.']),
  'chase_block:through': e((d) => (d.body === 'foot' ? [`Blackbird goes over the bonnet of one, round the door of the other and out the far side before anyone has found the safety catch.`] : [`There is a gap, narrower than the car, and Blackbird puts ${d.car} through it with the paint going on both sides.`]), ['Do not do that. I will do it again.']),
  'chase_block:stopped': e((d) => (d.body === 'foot' ? [`Blackbird hits the cordon and a hand takes hold of her collar. The chase has stopped at ${d.place}, and she has not.`] : [`${d.car} meets the cruisers at speed with nowhere to go. Metal screams, and everything behind catches up in one go.`]), ['It was a very good roadblock.']),
  'chase_police:her': e((d) => d.force === 'atlas' ? [`Atlas security turns up at ${d.place} at a run, takes one look at the situation, and picks a side: the one that is not Blackbird's.`] : [`A patrol skids in at ${d.place}. The officers look at the chase, look at her, and the one with the file on her makes up their minds. They fall in with the pursuit.`, `Sirens, and then boots. The NPD have arrived at ${d.place} and they know exactly whom they want.`], ['Of course they do.']),
  'chase_police:foes': e((d) => d.kind === 'crook' ? [`The NPD turn up at ${d.place} and see ${d.foe} and ${d.foe === 'them' ? 'their friends' : 'what is with them'} for what they are. Officers go after them, shouting, and Blackbird is, for the moment, not the problem.`] : [`A patrol arrives at ${d.place}, sizes up who is chasing whom, and steps in front of the pursuit.`], ['Taxes well spent.']),
  'chase_police:all': e((d) => [`The ${d.force === 'atlas' ? 'security detail' : 'patrol'} gets out at ${d.place}, assesses the situation for roughly a second, and opens fire on everybody who is running.`, `Nobody gave the order, and nobody needed to. The law arrives at ${d.place} shooting.`], ['Sir, we are the good guys, sir.']),
  'chase_police:ignore': e((d) => [`A patrol rolls up at ${d.place}, watches the chase go by with the faces of people who have just clocked off, and does nothing at all.`], ['Typical.']),
  'chase_bystander:scatter': e((d) => [`${cap(String(d.who))} sees what is coming down the street and gets out of the way, fast.`, `The ${d.role} flattens into a doorway as they go by.`]),
  'chase_bystander:point': e((d) => [`${cap(String(d.who))} points down the street after her without being asked. "That way!"`, `Somebody steps out and tells ${d.foe} exactly which way she went. Some people are just helpful.`], ['Thanks, neighbour.']),
  'chase_bystander:trip': e((d) => [`${cap(String(d.who))} sticks a foot out as she goes by. She loses a step. She remembers the face.`, `Somebody who has not forgotten her gets in the way, "by accident".`], ['Noted.']),
  'chase_bystander:help': e((d) => [`${cap(String(d.who))} "accidentally" drags a cart across the street just as ${d.foe} comes round the corner.`, `${cap(String(d.who))} gives ${d.foe} directions to somewhere that is nowhere near where she went.`], ['Fans! Of a kind.']),
  'chase_bystander:film': e((d) => [`${cap(String(d.who))} holds up a phone and films the lot. Somewhere, a feed gets a very good five minutes.`], ['Subscribe.']),
  'chase_bystander:call': e((d) => [`${cap(String(d.who))} is already on the line to the NPD: shouting, a street name, something is going on out here.`, `${cap(String(d.who))} takes one look and reaches for the emergency button. They have no idea who is in the wrong, only that somebody is.`], ['That is going to cost me.']),
  'chase_crowd:weave': e((d) => [`${cap(String(d.who))} is standing right in the line. Blackbird bends round them without breaking stride.`, `A ${d.role} in the way; she goes round, close enough to smell them.`]),
  'chase_crowd:clear': e((d) => [`${cap(String(d.who))} takes one look at Blackbird, grins, and steps aside like a doorman: "Go on, love."`, `The ${d.role} in her way flattens against a wall with a little bow. She is through before the bow is finished.`], ['Charm: the only stat that opens doors.']),
  'chase_crowd:ranks': e((d) => [`The people who let her by close up again behind her, a slow, friendly, entirely accidental wall in front of ${d.who}.`, `${cap(String(d.who))} runs into a street that has suddenly remembered it has things to do and nowhere to be.`], ['Nobody can stop being polite.']),
  'chase_crowd:shove': e((d) => [`Nowhere to go round ${d.who}, so Blackbird goes through: a shoulder, a shout, and they are against the wall behind her.`, `${cap(String(d.who))} gets a shoulder in the chest and a few words they won't forget. She doesn't look back.`], ['Sorry! Not sorry!']),
  'chase_track': e((d) => d.hero
    ? (d.variant === 'hot' ? [`Blackbird loses sight of ${d.foe} and knows where they went anyway: a wet footprint, a swinging door, a dog that stopped barking. She is practically on them.`] : d.variant === 'warm' ? [`${cap(String(d.foe))} is out of sight, but not out of mind: the trail goes this way, and she goes with it.`] : [`She has lost ${d.foe}, but there are scuffs on the ground that say which way they went. She follows, a long way behind.`])
    : (d.variant === 'hot' ? [`${cap(String(d.foe))} lose sight of Blackbird and do not care: they can read the street for where she went, and they are on her trail like it was lit.`] : d.variant === 'warm' ? [`${cap(String(d.foe))} cannot see her any more, but they can read where she went. They keep coming.`] : [`${cap(String(d.foe))} lose her, and stand a moment reading the ground. She went that way, more or less. They set off after her.`]), ['Footprints in the rain. Footprints in the rain.', 'Never run in the wet.']),
  'chase_search:found': e((d) => [`${d.foe} gets to where Blackbird was last seen, stops, and looks down the street. There she is.`, `${d.foe} reaches the spot, scans the street, and finds her. The chase is back on.`], ['Not far enough.']),
  'chase_search:onward': e((d) => [`${d.foe} gets to the last place they saw her and finds nobody. She didn't stop here, ${d.count === 1 ? 'they decide' : 'they decide between them'}: she's still running. They go on down the street after her.`, `Nobody at the spot where they lost her. ${d.foe} bet on her still running, and goes on.`]),
  'chase_search:fan': e((d) => [`${d.foe} reaches the spot where they lost her and stops. Nobody could run that fast, ${d.count === 1 ? 'they think' : 'they agree'}: she is hiding somewhere close. ${d.count === 1 ? 'They begin' : 'They fan out and begin'} to search the street.`, `The street is empty. ${d.foe} decides she went to ground, and starts going through the doorways and corners.`], ['It is a decent theory. It is also wrong.']),
  'chase_search:split': e((d) => [`They lose her. ${d.foe} thinks she went to ground and starts searching the street; ${d.other} bets that she kept running and goes on after her.`], ['Divide and be divided.']),
  'chase_cut:cut_off': e((d) =>
    d.hero
      ? [`Blackbird works out where ${d.foe} is going: ${d.place}, and nowhere else. She ${cutVia(d, 'goes round by the back streets')} and is there first. ${d.foe} runs straight into her.`]
      : [`${d.foe} works out where Blackbird is going and ${cutVia(d, 'takes the back streets')} to be waiting at ${d.place}. She runs straight into them.`],
    ['Predictable. I am so predictable.', 'It was a good guess.'],
  ),
  'chase_cut:late': e((d) =>
    d.hero
      ? [`Blackbird guesses right: ${d.place}. She ${cutVia(d, 'goes round by the back streets')}, and arrives to find ${d.foe} has already gone past.`]
      : [`${d.foe} guesses right and ${cutVia(d, 'goes round by the back streets')}, a moment too late. Blackbird is already past.`],
    ['Close. So close.', 'The tail lights, again.'],
  ),
  'chase_cut:wrong': e((d) =>
    d.hero
      ? [`Blackbird is sure ${d.foe} is making for ${d.place}. She ${cutVia(d, 'goes round by the back streets')} and finds an empty road. They went somewhere else entirely.`]
      : [`${d.foe} is sure Blackbird is making for ${d.place}, and ${cutVia(d, 'goes round by the back streets')}. She is not.`],
    ['I was so sure.', 'A wrong guess is an expensive thing.']),
  'vehicle:catches_up': e((d) => [`${d.car} comes round the corner, ${d.riders} leaning out of it, and pulls up beside Blackbird.`, `${d.car} has been behind them the whole way. ${d.riders} bring it in at the kerb by ${d.place}, a little out of breath.`], ['Good. I would have hated to walk.']),
  'chase_mount:hero_stands': e((d) => [`Blackbird's lungs have had enough. She puts a hand on a wall, turns round, and lets ${d.foe} come to her.`, `Too long, too far. Blackbird stops running, and turns, and the chase is over.`], ['If you are going to catch me, catch me.', 'My legs have filed a complaint.']),
  'chase_mount:foe_stands': e((d) => [`${d.foe} looks at the road ahead, and at what is behind, and stops running. ${d.car ? `${d.car} slews to a halt at the kerb.` : 'They turn around.'}`, `Nowhere left to go, or no more wish to. ${d.foe} stops, and turns, and the chase is over.`], ['Good. I was getting tired of the back of their head.']),
  'chase_round:board': e((d) => [d.car === 'on foot' ? `${cap(String(d.scene))}. Blackbird gets a hand on ${d.foe}'s vehicle, then a foot, and then she is on it.` : `${d.car} comes level with ${d.foe} and Blackbird goes over the gap, off the one and onto the other. ${d.car} drifts away behind.`], ['Do not look down. Do not look down.', 'Nobody has ever done this on purpose.']),
  'chase_round:strike': e((d) => [String(d.events).includes('struck') ? `Blackbird is within reach of ${d.foe} and does not waste it. The blow lands.` : `Blackbird swings at ${d.foe} and the runner ducks. Barely.`], ['Close enough to hit. That is all I wanted.']),
  'chase_round:hijack_door': e((d) => [String(d.events).includes('inside') ? `Blackbird works the door lock with one hand, hanging on with the other. It clicks. She is in.` : `Blackbird goes at the door handle and the lock holds, and the road goes by very fast under her boots.`], ['Locks are easier at five kilometres an hour.']),
  'chase_round:break_door': e((d) => [String(d.events).includes('inside') ? `Blackbird puts the door in, hinge and all, and drops into the seat behind it.` : `Blackbird goes at the door with everything she has. It gives a little. It will give more.`], ['Open. Sesame.']),
  'chase_round:attack_driver': e((d) => [String(d.events).includes('driver_hit') ? `Blackbird goes through the glass at whoever is driving.${String(d.events).includes('coasts') ? ' Nobody is steering now, and the vehicle rolls to a stop with her on it.' : ' They feel it.'}` : `Blackbird goes for the driver through the door, and finds door.`], ['The easiest way to stop a car is to remove the person in it.']),
  'chase_round:jump_off': e((d) => [`That is enough of that. Blackbird lets go of ${d.foe}'s vehicle and hits the road.`], ['Not my best idea.']),
  'chase_mount:thrown': e((d) => [`${d.car} goes out from under Blackbird and leaves her in the road. She picks herself up and keeps going, on foot.`, `Down and skidding, and then up: ${d.car} is a wreck behind her and she is running.`], ['Not done yet.']),
  'chase_mount:bail': e((d) => [`Blackbird kicks free of ${d.car} and hits the road running.`]),
  'chase_mount:door': e((d) => [`The door of ${d.car} is torn off its hinges. Blackbird rolls out the other side and runs.`]),
  'chase_mount:wrecked': e((d) => [`${d.car} goes up behind her, and Blackbird, blackened and ringing, is still on her feet. She goes on on foot.`], ['I am so, so hard to kill.']),
  'chase_mount:dismount': e((d) => [`Blackbird leaves ${d.car} at the kerb and goes on after ${d.foe} on foot.`]),
  'chase_mount:dismount_alley': e((d) => [`${d.foe} goes into ${d.place}, which is an alley, which is no road for ${d.car}. Blackbird is out of it and after them on foot.`, `An alley. Of course. Blackbird leaves ${d.car} and follows ${d.foe} in on foot.`], ['They always go where the car cannot.']),
  'chase_mount:foe_out': e((d) => [`${d.foe} dumps ${d.car} at the mouth of the alley and comes after Blackbird on foot.`], ['Fine. I like a foot chase.']),
  'chase_mount:remount': e((d) => [`${d.car} is right there, and it is hers. Blackbird is on it before the next breath.`]),
  'chase_mount:key': e((d) => [`The key in her pocket opens ${d.car} without a fuss. Blackbird is in and moving.`]),
  'accident:bump:foot': e(
    (d) => [d.law && d.hurt ? `Blackbird goes straight into ${d.who}, ${d.role}, and puts them on the ground. This will be remembered.` : d.angry ? `Blackbird goes into ${d.who} at full tilt in ${d.scene}. ${d.who} says something very short and starts to run too.` : `Blackbird clips ${d.who} in ${d.scene} and keeps going. A very rude word follows her.`],
    ['Excuse me. EXCUSE ME.', 'People. Everywhere. People.'],
  ),
  'accident:struck:foot': e((d) => [`Blackbird steps off the kerb in ${d.scene} and a car clips her. (Down ${d.dmg}.) She stays on her feet, just.`], ['Look both ways. I did not look either way.']),
  'accident:struck_down:foot': e((d) => [`A car hits Blackbird in ${d.scene} and she goes down across the bonnet, and then the road. (Down ${d.dmg}.) The chase gets away from her while she gets up.`], ['That is going to be a bruise with a number plate in it.']),
  'chase_end:escaped:foot': e((d) => [d.mode === 'pursued' ? `Blackbird runs until the shouting stops. She is alone on a street she has never seen.` : `They are gone round a corner and she is gone round another.`], ['Leg day.']),
  'chase_end:lost:foot': e((d) => [`${d.foe} is round a corner, and then round the next, and then not anywhere. Blackbird stops with her hands on her knees.`], ['They had better legs. Or more reason.']),
  'chase_end:caught:foot': e((d) => [d.mode === 'pursuer' ? `Blackbird gets a hand on ${d.foe}, who has run out of street.` : `A hand lands on Blackbird's collar. She has run out of street.`], ['End of the line.']),
  'chase_end:wrecked:foot': e((d) => [`That is the end of Blackbird's run.`], ['It was a good run.']),
  'chase_end:bailed:foot': e((d) => [`Blackbird goes down and does not get up fast enough.`], ['Get up. Get up. Get up.']),
  'chase_end:won:foot': e((d) => [`There is nobody left to run from.`], ['That is how it is done.']),
  'vehicle:riders': e(
    (d) => [d.left ? `Blackbird counts seats. ${d.riders ? `${d.riders} pile${String(d.riders).includes(' and ') ? '' : 's'} in` : 'Nobody fits'}; ${d.left} will have to find another way.` : `${d.riders} climb${String(d.riders).includes(' and ') ? '' : 's'} into ${d.car} with Blackbird. Every seat has an opinion.`],
    ['A full car is a loud car.', 'Seatbelts are mandatory. Nobody has told the seatbelts.'],
  ),
  'companion_waits': e((d) => [`${d.name} watches the car pull away from ${d.place} and settles in to wait.`], ['Loyalty: a person standing on a kerb.']),
  'companion_rejoins': e((d) => [`${d.name} is exactly where Blackbird left {them}, on ${d.place}. Not one step to the left.`], ['Told you I would be back. Look, I am back.']),
  'car_hit:scuffed': e((d) => [d.mine ? `${d.car} takes a hit and comes away with a scrape the shape of a bad idea.` : `${d.car} picks up a few dents. It is still plenty of car.`]),
  'car_hit:battered': e((d) => [d.mine ? `${d.car} is battered now: panels hanging, a headlight out, an engine note she does not like.` : `${d.car} is battered, one door held on by hope.`], ['That noise should not be that noise.']),
  'car_hit:smoking': e((d) => [d.mine ? `${d.car} is smoking. Something under the bonnet is on fire in a small, hopeful way. It is going to go up, and soon.` : `${d.car} starts to smoke. Everybody near it is suddenly interested in being elsewhere.`], ['Get out. Get out now. Get out of the car.']),
  'car_hit': e((d) => [`${d.car} takes a hit.`]),
  'car_wreck': e(
    (d) => [
      d.hero
        ? `${d.car} goes up with ${d.inside} in it. The blast takes the doors, the windows and a good part of the street. Blackbird is on the ground, ringing, burning, and in no way supposed to be alive.`
        : d.count
          ? `${d.car} goes up in a ball of fire with ${d.inside} still inside it. The street is very quiet afterwards.`
          : `${d.car} goes up with a crump that rattles the windows. Nobody was in it.`,
      d.beside && !d.hero ? 'Whoever was standing close takes it on the chin.' : 'What is left is a black shell that will be there for a long time.',
    ],
    ['Cars burn better than people. I can confirm.', 'Note to self: do not sit in the thing that is on fire.'],
  ),
  'car_door:forced': e((d) => [`${d.foe} gets {their} fingers into the door of ${d.car} and peels it open like a tin. ${d.who} is dragged out into the street.`, `The door of ${d.car} gives with a shriek of metal. ${d.who} is out, and the car is just a car again.`], ['Seat belts: not for this.']),
  'car_door:dent': e((d) => [`${d.foe} hauls at the door of ${d.car}. It dents, and holds.`], ['Hold, hold, hold.']),
  'car_drive_off': e((d) => [`Blackbird throws herself into ${d.car} and puts her foot down. The fight is a rumour in the mirror before it has finished.`, `The engine of ${d.car} catches on the first turn, which is the first good luck all night. Blackbird is gone.`], ['Cars: a very good way to be somewhere else.']),
  'car_run_down': e((d) => [`Blackbird puts ${d.car} through the gap and ${d.foe} through the air. Nobody is more surprised than ${d.foe}.`, `${d.foe} looks up just in time to see ${d.car} arrive.`], ['Pedestrians. Why do they always stand there.']),
  'fight_end:drove_off': e((d) => [`Blackbird leaves the street at speed. By the time anyone looks, ${d.to} is the only place she has ever been.`], ['I was never there.']),
  'ambush:npd_chase': e((d) => [`Sirens behind her. ${d.count} officers in cruisers have decided that the car Blackbird is in is theirs, or hers, or evidence. Heat: ${d.heat}.`], ['They sent cars. I have a car. This is going to be fun.']),
  'chase_start': e(
    (d) => [d.mode === 'pursuer' ? `Blackbird goes after ${d.foes} in ${d.car}, ${d.wings ? 'tracking it through the gaps between the buildings' : 'on the same road'}.` : `${d.foes} fall in behind ${d.car}. It is a chase.`],
    ['Floor it.'],
  ),
  'chase_round:floor_it': e((d) => [`${cap(String(d.scene))}. Blackbird puts ${d.car} flat to the boards. ${d.band === 'far' ? 'The gap opens' : `They are ${d.band}`}${Number(d.hurt) ? `, but ${d.car} complains about it (${d.state})` : ''}.`]),
  'chase_round:swerve': e((d) => [`Blackbird throws ${d.car} left, then right. Whatever was coming her way hits something else.`]),
  'chase_round:lose_them': e((d) => (String(d.events).includes('lost:door') ? [`Blackbird swings the car in against a kerb, is out and through a door before the engine has stopped ticking, and the sirens go on past.`] : String(d.events).includes('lost:mouth') ? [`A turn too tight for anything with a light bar on it, and Blackbird is into an alley. The sirens go the wrong way.`] : [`A gap between two stalls, a left through somebody's yard, a right into an alley with a chicken in it. ${String(d.events).includes('lost') ? 'Behind her, the sirens go the wrong way.' : 'They are still back there.'}`])),
  'chase_round:shoot': e((d) => [String(d.events).includes('shot') ? `Blackbird leans out of ${d.car} and puts shots into ${d.foe}. Some of them even find it.` : `Blackbird leans out and fires at ${d.foe}, and hits a wall. A good wall.`], ['Aim at the big thing. It is the big thing.']),
  'chase_round:ram': e((d) => [`Blackbird puts ${d.car} sideways into ${d.foe}. Metal screams. Both cars are the worse for it.`], ['Insurance. Hah.']),
  'chase_round:bail': e((d) => [`${d.car} is a bomb and Blackbird knows it. She goes out of the door.`]),
  'chase_end:escaped': e((d) => [d.mode === 'pursued' ? `The sirens thin out and stop. Blackbird takes ${d.car} a few streets on and lets it idle, and the city closes up behind her. (${d.rounds} rounds.)` : `It gets away from her, but she gets away from it, which is nearly the same.`], ['I am the weather. I am the wind.']),
  'chase_end:lost': e((d) => [`The gap is too wide. ${d.foe} is a dot, and then not even that. The road is empty.`], ['I will get it next time. I will get it.']),
  'chase_end:caught': e((d) => [d.mode === 'pursuer' ? `${d.car} is on ${d.foe}'s tail, close enough to see the rivets, and that is that. They are in range.` : `It ends in the street, nose to nose, with nowhere left to go.`], ['End of the road. Time to be useful.']),
  'chase_end:wrecked': e((d) => [`${d.car} is gone, and Blackbird with it, for a while. The road has had the last word.`], ['I am so very, very sorry about that car.']),
  'chase_end:bailed': e((d) => [`Blackbird hits the road rolling and comes up with a mouthful of tarmac. ${d.car} carries on without her and meets the end of the street. (Down ${d.taken}.)`], ['It is a fall. Everything is a fall, eventually.']),
  'chase_end:won': e((d) => [`The last of them are a pile of smoking metal behind her. ${d.car} has a few new scars and Blackbird has a few new opinions.`], ['That is how it is done.']),
  'vehicle:left': e((d) => [`Blackbird leaves ${d.car} at the kerb outside ${d.place}. It is still hers. For now.`], ['Parked. Illegally. On principle.']),
  'vehicle:back': e((d) => [`${d.car} is right where Blackbird left it, on ${d.place}. The door opens for her without any wire at all.`], ['My car. Mine. Do not touch.', 'Nobody has stolen it from me yet. Give it time.']),
  'vehicle:gone': e((d) => [d.kind === 'police' ? `The spot on ${d.place} where Blackbird left ${d.car} is empty. The NPD came for their own.` : d.kind === 'atlas' ? `${d.car} is gone from ${d.place}. Atlas recovered it, tracker first.` : `Where Blackbird left ${d.car} on ${d.place} there is a rectangle of cleaner street. A tow drone, a thief, or a very efficient scrapper.`], ['It was a good car. It was somebody else\'s first.', 'Easy come, easy go. Mostly go.']),
  'go:walk': e((d) => [`Blackbird heads for ${d.to}.`, `Off to ${d.to}.`, `Blackbird takes the long way to ${d.to}.`], ['Onward.', "Destiny's that way. Probably."]),
  'go:cutthrough': e((d) => [`A gap between the buildings, and Blackbird is through it and into ${d.to}.`, `Blackbird cuts through to ${d.to}.`]),
  'go:vault': e((d) => [`Blackbird takes the chain-link fence in one go and drops into ${d.to}.`, `One hand on the top rail, one over the wire, and Blackbird is in ${d.to}.`], ['Fences are suggestions.']),
  'go:vault_failed': e((d) => [`Blackbird goes at the fence badly and comes off it badly. ${d.to} is still on the other side.${Number(d.hurt) ? ` It cost her ${d.hurt} HP.` : ''}`], ['Rungs. I should have used the rungs.']),
  'go:smash_fence': e((d) => [`The fence loses an argument with the front of the vehicle, and Blackbird is in ${d.to}.`]),
  'go:climb': e((d) => [`Blackbird goes up the wall on fingertips and ambition, and down the far side into ${d.to}.`], ["There's a joke about walls. I don't have time for it."]),
  'go:climb_failed': e((d) => [`Blackbird gets halfway up the wall and then the wall gets rid of her.${Number(d.hurt) ? ` That is ${d.hurt} HP.` : ''} ${d.to} remains on the other side.`], ['Up is hard.']),
  'go:breach': e((d) => [`Blackbird takes the barricade apart one piece at a time and steps through into ${d.to}.`], ['Somebody built this to keep people out. I am people.']),
  'go:breach_failed': e((d) => [`The barricade is more barricade than Blackbird is shoulder.${Number(d.hurt) ? ` It costs her ${d.hurt} HP.` : ''}`]),
  'go:ram_barricade': e((d) => [`The barricade goes everywhere at once, and Blackbird comes out the other side in ${d.to}.`], ['Insurance. Hah.']),
  'go:barricade_crash': e((d) => [`Blackbird hits the barricade at speed and the barricade wins.${Number(d.hurt) ? ` That is ${d.hurt} HP.` : ''}`]),
  'go:crawl': e((d) => [`A vent grille, a long dark crawl with a draught and a rat, and Blackbird drops out into ${d.to}.`], ['Dust. So much dust.']),
  'go:crawl_stuck': e((d) => [`The duct narrows. Blackbird does not, and spends a while wedged in the dark before backing out the way she came.`]),
  'go:through': e((d) => [`Blackbird goes straight through the building and out the other side into ${d.to}. Somebody calls after her. She is gone.`], ['A shortcut is just a road with fewer rules.']),
  'go:through_spotted': e((d) => [`Blackbird cuts through where she has no business being, and is seen doing it. She is out the far side in ${d.to}, with company coming.`]),
  'go:jump': e((d) => [`A ramp, a wall of speed and a gap where the roofs are, and Blackbird is airborne over the buildings and down in ${d.to}.`], ['Physics: optional.']),
  'go:jump_failed': e((d) => [`Blackbird misjudges the ramp and the ramp lets her know it.${Number(d.hurt) ? ` That is ${d.hurt} HP.` : ''}`]),
  'go:stairs': e((d) => [`Up the ramp, over the roof, down the other side: Blackbird is in ${d.to}.`]),
  'go:paid': e((d) => [`Forty neodollars to the bouncer, and the velvet rope opens. Blackbird is inside ${d.to}.`], ['Worth it. I think.']),
  'go:charmed': e(
    (d) => [`Blackbird talks her way into ${d.to}. The bouncer looks as surprised as anyone.`],
    ["Charm, baby. It's a weapon too.", 'The look worked. The look always works.'],
  ),
  'go:picked': e(() => ['The lock gives in under her fingers. Maybe the door was open the whole time.'], ["Locks fear me."]),
  'go:kicked': e(() => ['The door loses an argument with Blackbird\'s boot.'], ['Knock knock.']),
  'go:invited': e((d) => [`${d.npc} nods her through. "Don't touch anything." Blackbird touches several things in the first minute.`], ['Connections.']),
  'go:slipped': e((d) => [`Blackbird slips into ${d.place} unseen. Nobody looks up. This is, honestly, the stealthiest thing she has ever done.`], ['Silent as a ghost. A fashionable ghost.', "Nobody's seen me. Nobody ever sees me coming."]),
  'go:fought_through': e((d) => [`Blackbird steps over what is left of the guards and into ${d.to}.`], ["I'll let the next guys know I was here."]),
  'go:stuck_landing': e((d) => [`Blackbird leaps the gap, rolls, and lands in ${d.to} in a crouch. A pigeon applauds.`], ["Flawless. I'd give it a ten."]),
  'go:crashed': e((d) => [`Blackbird misses the ledge and goes through the skylight into ${d.to}. Glass everywhere. The music stops.`], ['Entrance acquired.', 'That was the plan. The glass is also part of the plan.']),
  'go:misroute': e(
    (d) => [`Blackbird takes a wrong turn in the ductwork. This is not ${d.intended}. This is somewhere with biometric scanners and the Helix logo, ${d.to}.`],
    ['Turns out "left" is relative in vents.', "It's fine. This is definitely where I meant to go."],
  ),

  'gate:bounced_mouthy': e((d) => [`Blackbird tells ${d.npc} what she thinks of velvet ropes. {They} think{s} about it, then pick{s} her up by the collar.`], ["I was just getting started."]),
  'gate:turned_away': e((d) => [`${d.npc} shakes {their} head. Not tonight. Not in those boots.`, `"Name's not on the list." ${d.npc} is unmoved. Blackbird stays outside.`], ["{Their} loss. Seriously."]),
  'gate:tiny_heard': e((d) => [`The crash reaches the bar. ${d.npc} arrives in the doorway, blocking the light.`], ['Oh. {They} {has} hands like cinder blocks.']),
  'gate:jammed': e(() => ['The lock holds. Blackbird\'s thumb does not. She spends a moment with her hand under her armpit.'], ["Locks are overrated."]),
  'gate:spotted': e((d) => [`A klaxon. A spotlight. A voice says "INTRUDER" with the cheerful tone of a customer-service bot. ${d.place} is awake.`], ['They always say that. Very rude.']),

  // ------------------------------------------------------------------ talk
  'chat:rumor_dragon': e((d) => [`${d.npc} leans in. "Atlas's dragon runs patrol up on the Kowloon Overpass. Nobody comes back. Nobody." Blackbird nods like she's heard worse.`], ["Dragon. Overpass. I'm a hero, I have the bio for this."]),
  'chat:rumor_hatch': e((d) => [`${d.npc} lowers {their} voice: there's a maintenance hatch behind the Halo's dumpster that goes somewhere nobody's supposed to.`], ['Secrets. My favorite flavor.']),
  'chat:rumor_staffdoor': e((d) => [`${d.npc} mentions the Neon Pharaoh has a staff door nobody watches properly. "Goes under half the block."`], ['Noted. I will absolutely do something with that.']),
  'chat:tall_tale': e(
    (d) => [
      `${d.npc} tells a story about the time {they} punched a cyber-shark. Blackbird listens with her whole face.`,
      `${d.npc} spends ten minutes explaining a conspiracy involving pigeons, Atlas, and a vending machine. Blackbird nods through all of it.`,
      `${d.npc} wants to talk about {their} ex. At length. Blackbird stays for the free refill.`,
    ],
    ['Nobody tells a story like a local. Good listener, me.', 'I have no idea what {they} said but I agree.'],
  ),
  'chat:rumor_bounty': e((d) => [`${d.npc} glances around, then murmurs that ${d.target} (${d.role}) has ${$(d.amount)} neodollars of NPD paper out on {them:target}, quietly. Last seen at ${d.place}.`], ['Wanted. Quietly. The best kind of target is one the cops will thank me for.']),
  'chat:snub': e((d) => [`${d.npc} turns away mid-sentence. Blackbird is still smiling when she realizes.`, `${d.npc} mutters "not now" and finds something very interesting to do with {their} hands.`, `Blackbird asks ${d.npc} how {their} night is going. "Over," ${d.npc} says.`], ["Playing hard to get. I respect it."]),

  pet_puppy: e((d) => [`Blackbird scratches ${d.npc} behind the sensor ear. The puppy's tail motor whirs happily.`, `${d.npc} rolls over. Blackbird has never felt so seen.`], ["Best bot in the building. Look at {their} little optics."]),
  'steal_puppy:success': e(
    (d) => [`Blackbird scoops ${d.npc} into her jacket and walks out of the conversation. The puppy licks her chin with a very small laser.`, `One quick patch of the collar ID later, ${d.npc} is hers. ${d.owner} is going to have thoughts about this.`],
    ['Finders keepers. Dog, this is the start of something beautiful.'],
  ),
  'steal_puppy:bitten': e((d) => [`${d.npc} clamps down on her hand with a bite force rated for diamond. Blackbird lets go.`], ["{They} {is} just playing. Aggressively."]),
  'steal_puppy:noticed': e((d) => [`"SPROCKET," says ${d.npc}, in a voice like a mountain falling over. {They} {is} looking directly at Blackbird.`], ['This is a misunderstanding. A short, loud one.']),

  // ------------------------------------------------------------------ romance
  'flirt:smooth': e(
    (d) => [`Blackbird leans on the bar and says something to ${d.npc} that gets a laugh and an eyebrow.`, `${d.npc} is smiling. Blackbird does not know what she said but she'll say it again.`],
    ["I'm good. Like, genuinely good at this.", 'Smooth. Chrome-plated smooth.'],
  ),
  'flirt:number': e((d) => [`${d.npc} writes a number on Blackbird's wrist in glowing ink. The ink is warm.`], ['Dragon. Damsel. Number. A great night.']),
  'flirt:cringe': e(
    (d) => [`Blackbird opens with a pickup line involving firmware. ${d.npc} stares at her for a long moment.`, `Blackbird winks at ${d.npc}. It reads as a facial malfunction.`],
    ["The line was a classic. {They}'ll appreciate it later.", "It's the lighting."],
  ),
  'flirt:slapped': e((d) => [`${d.npc} slaps Blackbird so hard her implants recalibrate. Wounded pride, minor.`], ['Worth it. I think I felt a spark.']),
  'kiss:kiss': e(
    (d) => Number(d.times) >= 3 ? [`Blackbird and ${d.npc} are, at this point, just making out. It is an extended session. Somebody nearby has started a very discreet timer.`, `Kiss number ${d.times} with ${d.npc}. They are both ahead of where this was going, and neither seems to mind.`] : [`Blackbird and ${d.npc} find a dark corner. The camera, discreetly, finds the ceiling.`, `${d.npc} takes Blackbird by the collar. The next ten minutes are not a matter of public record.`, `Neon, bass, and ${d.npc}'s hand in Blackbird's hair. The report cuts to the weather.`, `${d.npc} pulls Blackbird in by the jacket. It goes on for a while. The jukebox plays something suitable.`],
    ['Dragon? What dragon.', 'Neo is a city of second chances. This is my third. Fourth?'],
  ),
  'kiss:rejected': e((d) => [`Blackbird leans in. ${d.npc} leans out. A lot of time passes in that gap.`], ["{They} {was} just checking me for a fever."]),
  'jealous:fight': e((d) => [`Across the bar, ${d.npc} has been watching. She puts down her drink very slowly. "That was ${d.npc2}?"`, `${d.npc} saw the whole thing. She walks over with the calm of someone who has already decided.`], ["Okay, I can explain. It's... a long story. Mostly short."]),
  'jealous:sulk': e((d) => [`${d.npc} sees. Her expression closes up like a vault door. She does not say a word.`], ["Wow, okay. That's... hm."]),

  // ------------------------------------------------------------------ theft
  'pickpocket:cash': e((d) => [`Blackbird's fingers dip into ${d.npc}'s pocket and come back with ${d.amount} neodollars. Nobody notices.`, `A bump, an apology, and ${d.amount} neodollars have changed owners.`], ["I didn't take it. I borrowed it permanently."]),
  'pickpocket:item': e((d) => [d.better ? `Blackbird lifts ${d.item} off ${d.npc} so smoothly {they} keep{s} talking. It's a step up from what she was carrying.` : `Blackbird lifts ${d.item} off ${d.npc}. Whether it's useful is a different question.`], ['Upgrade acquired. Thank you for your service.', "{They}'ll never know. Until {they} check{s}."]),
  'pickpocket:nothing': e((d) => [`${d.npc}'s pockets contain a lint ball and, deep down, regret.`], ['Rude. The least {they} could do is carry something.']),
  'pickpocket:abort': e((d) => [`Blackbird eyes ${d.npc}'s pocket, and ${d.npc} eyes her right back. Not today.`, `${d.npc} is paying far too much attention to be robbed. She finds something else to look at.`], ['A good thief knows when the mark is a good citizen.']),
  prowl_police: e((d) => d.variant === 'nobody' ? [`Nobody comes. The call went in, and the call went in a drawer.`, `Whoever was called is not on their way.`] : [`${d.count === 1 ? 'An officer arrives' : 'Officers arrive'} at the body, torches up, looking for whoever did it.`, `The ${d.force === 'atlas' ? 'security detail' : 'NPD'} gets there: ${d.count} of them, reading the scene.`], ['Late, but not that late.']),
  prowl_witness: e((d) => {
    const v = String(d.variant);
    const who = String(d.npc);
    const victim = String(d.victim);
    if (v === 'flee') return [`${cap(who)} sees ${victim} go down and Blackbird standing over them, and runs.`, `${cap(who)} makes a small noise, drops what they were holding, and is gone.`];
    if (v === 'call_cops') return [`${cap(who)} saw it, and their hand is already going to the emergency button.`, `${cap(who)} backs away with a phone out. The NPD will be told, in a very shaky voice.`];
    if (v === 'film') return [`${cap(who)} holds up a phone. ${cap(victim)} going down is going to be somebody's feed.`];
    if (v === 'intervene' || v === 'join') return [`${cap(who)} saw what she did to ${victim} and comes for her.`, `${cap(who)} has decided that was not on, and moves in.`];
    if (v === 'shun') return [`${cap(who)} saw it, and looks at Blackbird like something on a shoe.`];
    if (v === 'cheer') return [`${cap(who)} saw it, and approves, quietly, with a very small nod.`];
    if (v === 'crowd') return [`${d.ran ? `${d.ran} more of them run` : ''}${d.ran && d.hid ? ', and ' : ''}${d.hid ? `${d.hid} get down behind whatever is nearest and stay there` : ''}.`.replace(/^./, (m) => m.toUpperCase())];
    if (v === 'found_call') return [`${cap(who)} finds ${victim} on the floor, backs away with a phone out, and tells the NPD where. Then they leave.`, `${cap(who)} calls it in: a body, here. They do not wait to explain.`];
    if (v === 'found_run') return [`${cap(who)} trips over ${victim}, understands, and runs for it.`, `${cap(who)} finds ${victim} on the floor and does not stay to ask.`];
    return [`${cap(who)} finds ${victim} on the floor and screams. Everybody who is still looking for trouble now knows where it is.`];
  }, ['A witness is a person with a mouth.']),
  prowl_track: e((d) => d.variant === 'hot' ? [`${d.npc} stops, crouches, and puts a finger on a scuff in the grime. Then looks up, straight at where she is not quite hiding.`, `${d.npc} reads the street like a page, and the page says she is right here.`] : d.variant === 'warm' ? [`${d.npc} finds a mark on the ground and a place it points to. Close.`, `${d.npc} cocks their head, sure she is somewhere around here, and heads that way.`] : [`${d.npc} finds a mark on the ground that says she went this way, more or less, and turns that way.`], ['Footprints. Always the footprints.']),
  prowl_start: e((d) => d.variant === 'hunt' ? [`${cap(String(d.place))}: ${d.foes} spread out, looking. They don't know where she is. Blackbird keeps low and looks for a way off the street.`] : [`${cap(String(d.place))}: ${d.foes}, ${d.lit ? 'in good light' : 'in poor light'}, and none of them has looked her way yet. Blackbird stays by the door and watches how they move.`, `Blackbird eases into ${d.place}. ${d.foes}. She counts the places to stand where nobody is looking.`], ['Do not sneeze. Do not sneeze.', 'Small steps. Big patience.']),
  prowl_wait: e((d) => (d.variant === 'patrol' ? [`Blackbird holds still while ${d.npc} walks the length of the room, and lets the footsteps go past.`, `${d.npc} does a slow lap. Blackbird is a very dedicated shadow until it is over.`] : d.variant === 'search' ? [`${d.npc} is still searching. Blackbird stays where she is and breathes through her teeth.`] : [`${d.npc} turns this way and that. Blackbird does not move until ${d.npc} is looking at something else.`, `Blackbird waits for ${d.npc} to turn away. It takes longer than she would like.`]), ['Patience. Mine, specifically.']),
  prowl_takedown: e((d) => (d.variant === 'fail' ? [d.from === 'front' ? `Blackbird goes for ${d.npc} from the front, which was a bold plan. ${d.npc} sees her at the last second.` : `Blackbird goes for ${d.npc} and ${d.npc} twists out of it. That was not meant to happen.`, `${d.npc} gets a hand up in time. The room has a new, loud problem in it.`] : d.variant === 'kill' ? [d.from === 'behind' ? `Blackbird comes up behind ${d.npc}, and ${d.npc} stops mid-thought. She lowers the body down quietly.` : `Blackbird takes ${d.npc} from the ${d.from} before ${d.npc} can make a sound. It does not take long.`, `A hand, a blade, a very short silence. ${d.npc} will not be raising any alarms.`] : [d.from === 'behind' ? `Blackbird slides in behind ${d.npc} and puts them to sleep with a squeeze. They sag, and she eases them down.` : `Blackbird takes ${d.npc} from the ${d.from}, quick and clean. ${d.npc} is out before they know about it.`, `${d.npc} goes down soundlessly. Somebody, somewhere, will find them in the morning.`]), (d) => [d.variant === 'fail' ? 'Plan B. I have a plan B. It is called loud.' : 'One down. That is the whole trick.']),
  prowl_body: e((d) => (d.variant === 'hidden' ? [`Blackbird drags ${d.npc} behind a crate, out of everyone's line of sight.`, `${d.npc} gets tucked into a dark corner, where a person of average habits will not look.`] : [`${d.finder} finds ${d.npc} on the floor and stops dead. Then ${d.finder} starts looking around, very carefully.`, `${d.finder} trips over ${d.npc}. This is not good for anyone, mostly ${d.finder}.`]), (d) => [d.variant === 'hidden' ? 'Housekeeping.' : 'And that is why you hide the bodies.']),
  prowl_distract: e((d) => (d.variant === 'ok' ? [Number(d.count) ? `Blackbird gets into ${d.label} from across the room and sets it off. ${d.count === 1 ? 'Somebody turns' : `${d.count} of them turn`} toward the noise, and she's got a clear path.` : `Blackbird sets off ${d.label}. Nobody is close enough to care, which is also information.`, `${cap(String(d.label))} goes off like it has been waiting its whole life to. Heads go toward it.`] : [`Blackbird tries to get into ${d.label}. It beeps at her, loudly, and then thinks better of it.`, `${cap(String(d.label))} refuses her. It makes a small, offended noise.`]), (d) => [d.variant === 'ok' ? 'Look at that, over there. Not at me.' : 'Rude machine.']),
  prowl_flee: e((d) => [`${d.npc} sees Blackbird, doesn't wait to find out why, and bolts for ${d.to}.`, `${d.npc} is out of there, heading for ${d.to} at a run.`], ['Good instincts.']),
  prowl_end: e((d) => (d.variant === 'evaded' ? [`Blackbird slips off toward ${d.to}, and ${d.count === 1 ? 'the one behind her is' : 'the ones behind her are'} still looking at an empty street.`] : d.variant === 'cleared' ? [`The last of them goes down. ${cap(String(d.place))} is quiet, and nobody outside knows she was ever there.`, `${cap(String(d.place))} is hers: nobody awake, nobody called in.`] : d.variant === 'detected' ? [`That is it: somebody has her, and ${d.place} turns into a fight.`] : [`She can't find a way through without being seen, so Blackbird stays put in ${d.place}, unseen, with ${d.count === 1 ? 'one of them' : `${d.count} of them`} still about.`, `The room stays as it is: ${d.count} of them, none the wiser.`]), (d) => [d.variant === 'cleared' ? 'That was nice. Do it again.' : d.variant === 'detected' ? 'I did say there was a plan B.' : 'Not the worst result.']),
  place_spot: e((d) => {
    const fight: Record<string, string[]> = {
      door: [`Blackbird has not even finished coming through ${d.label}. Everyone inside is exactly where they were.`, `It starts in the doorway: Blackbird still half in the street, the whole room in front of her.`],
      back_door: [`Blackbird is by ${d.label}, with a way out right behind her.`],
      bar: [`Blackbird is at the bar when it starts, a glass in front of her and the bartender close enough to hear.`, `It kicks off at the bar, with stools, bottles and a long counter between her and the room.`],
      counter: [`Blackbird is at ${d.label} when it starts, the person behind it close enough to hear.`, `It starts at ${d.label}, with a hand-width of laminate between her and everyone.`],
      deck: [`Blackbird is up by the DJ booth, with the speakers right at her back.`],
      booth: [`Blackbird is tucked into a booth, the table between her and everything else.`],
      floor: [`Blackbird is out on the floor, in the thick of the crowd.`, `It starts on the dance floor, in the dark between strobes.`],
      cover: [`Blackbird is standing by ${d.label}.`],
      near: [`Blackbird is right beside ${d.label}.`],
    };
    const walk: Record<string, string[]> = {
      door: [`Blackbird drifts back towards ${d.label}.`],
      back_door: [`Blackbird works her way over to ${d.label}.`],
      bar: [`Blackbird makes her way over to the bar.`, `Blackbird cuts across the room to the bar.`],
      counter: [`Blackbird goes over to ${d.label}.`],
      deck: [`Blackbird threads through the crowd to the DJ booth.`],
      booth: [`Blackbird slides into a booth.`],
      floor: [`Blackbird pushes out onto the dance floor.`],
      cover: [`Blackbird crosses to ${d.label}.`],
      near: [`Blackbird weaves across the room to ${d.label}.`],
    };
    return (d.variant === 'walk' ? walk : fight)[String(d.spot)] ?? [`Blackbird is somewhere in ${d.place}.`];
  }),
  'stealth:enter': e((d) => (Number(d.watching) === 0 ? [`Blackbird shrinks into the background at ${d.place}. Nobody is looking, so it is very easy.`] : Number(d.left) === 0 ? [`Blackbird slips out of sight at ${d.place}. Every eye in the room drifts off. There is a lot to hide behind.`] : Number(d.dropped) > 0 ? [`Blackbird tries to melt into ${d.place}. ${d.dropped} of ${d.watching} lose her; ${d.left} still have her in sight.`] : [`Blackbird goes quiet at ${d.place}, but there is ${d.cover === 'none' ? 'nothing' : 'not enough'} to hide behind. Everyone who was watching still is.`]), ['Shh. Even to myself.', 'Invisible. Mostly.']),
  'stealth:exit': e((d) => [`Blackbird stops creeping about at ${d.place}. She is just a person in a room now, and everyone in it knows it.`], ['Hello. Yes. Me.']),
  'stealth:blown': e((d) => [`Whatever she was doing, it was not quiet. Blackbird is no longer sneaking at ${d.place}; everyone has her in sight.`], ['That was not stealthy. That was a lot of other things.']),
  'stealth_notice:suspicious': e((d) => [`${d.npc} frowns at the room. Something is off, and ${d.npc} cannot say what.`, `${d.npc} stops, listens, and looks around. Not at her. Yet.`], ['Not yet. Hold still.']),
  'stealth_notice:alert': e((d) => [`${d.npc} knows someone is in here. ${d.npc} just does not know where.`, `${d.npc}'s hand goes to a weapon. They are looking, hard, in all the wrong directions.`], ['They know. They do not know where. That is a different problem.']),
  'stealth_notice:aware': e((d) => [`${d.npc} turns and looks straight at Blackbird.`, `${d.npc} has her. There is no more mistaking where she is.`], ['Well. That is that.']),
  'stealth_notice:camera': e((d) => [`The camera at ${d.place} swivels, finds her, and locks on.`], ['It was a nice camera, too.']),
  'call_for_help:shout': e((d) => [`${d.npc} shouts for help. ${Number(d.count) ? `${d.count} nearby hear it.` : 'Nobody is close enough to hear.'}`, `"Over here!" ${d.npc} bellows at ${d.place}. ${Number(d.count) ? 'Heads turn.' : 'The room does not care.'}`], ['Rude. Loud, too.']),
  'call_for_help:comm': e((d) => [`${d.npc} thumbs a communicator and says something short. Across ${d.count} people's earpieces, a small tone sounds.`, `${d.npc} calls it in. ${d.count} of ${d.npc}'s own are on alert now.`], ['That is the sound of a radio ruining my evening.']),
  'call_for_help:optics': e((d) => [`${d.npc}'s eyes flicker, and ${d.count} other people see Blackbird through them, from ${d.npc}'s angle, in full colour.`, `${d.npc} streams what ${d.npc} is seeing to every one of ${d.npc}'s own. Everybody knows exactly where she is.`], ['Streaming me? I did not consent to that.']),
  hush: e((d) => (d.variant === 'silenced' ? [`Blackbird slips into ${d.npc}'s link and finds the wire for every way ${d.npc} has to call out. All of them go dead. ${d.npc} opens a mouth and nothing comes out.`] : d.variant === 'ok' ? [`Blackbird jams ${d.npc}'s communicator with a ping of static. ${d.npc} can still shout, but only to whoever is in earshot.`] : d.variant === 'late' ? [`Blackbird hushes ${d.npc}'s link, which is a fine idea five minutes ago. The call has already gone out.`] : [`Blackbird pokes at ${d.npc}'s link and it pokes back. ${d.npc} stares at the wrong spot in the room, frowning.`]), (d) => [d.variant === 'fail' ? 'Oh. It noticed me.' : 'Shh.']),
  'tactic:climb': e((d) => (d.hero ? [`Blackbird takes the wall in three moves, boots on brick, and is up before anyone has thought about it.`, `Blackbird goes up the drainpipe like it owes her money.`] : [`${d.foe} hauls up the wall, swearing the whole way.`, `${d.foe} goes up the fence in a scramble of limbs.`]), ['Parkour. Or just panic with a plan.']),
  'tactic:climb_fail': e((d) => (d.foe === 'Blackbird' ? [`Blackbird's hand slips and she slides back down the wall.`, `The pipe comes away from the brick, and so does Blackbird.`] : [`${d.foe} gets halfway up the wall, thinks better of it, and slides back down.`, `${d.foe} loses a grip and drops to the ground in a heap.`]), ['Gravity: still undefeated.']),
  'tactic:fall': e((d) => [`${d.foe} drops ${d.levels} levels and lands badly.`, `${d.foe} goes off the edge and meets the street.`], ['It is not the fall. It is the stopping.']),
  prowl_climb: e((d) => [`Blackbird's grip slips on the wall and she scrabbles for it, loudly. Everyone nearby hears.`, `A loose board gives under Blackbird's boot with a crack. She holds very still.`], ['Quiet, quiet, quiet. Not quiet.']),
  'tactic:hush': e((d) => (d.deep ? [`Blackbird kills every line ${d.foe} has to the outside: link, comm and even the voice. ${d.foe} stands there, mouth open, a silent alarm with no alarm.`] : [`Blackbird jams ${d.foe}'s comm link. The call-out does not go through. ${d.foe} can still yell, which ${d.foe} may or may not take up.`]), ['Quiet, you.']),
  'pickpocket:caught': e((d) => [`A hand closes around Blackbird's wrist. ${d.npc} looks down at her. Then at the hand in {their} pocket. Then at her.`, `${d.npc} spins around and catches Blackbird's arm, elbow-deep in {their} jacket. "Looking for something?"`, `"I felt that," says ${d.npc}, in the tone of someone who has felt that before.`], ["It's a handshake. A very personal handshake."]),
  'threaten:cough': e((d) => [`Blackbird has a quiet word with ${d.npc}. ${d.npc} coughs up ${d.amount} neodollars and does not make eye contact.`, `Blackbird cracks her knuckles at ${d.npc}. ${d.amount} neodollars materialize, unprompted.`, `"Nice wallet," Blackbird tells ${d.npc}. It becomes hers. ${d.amount} neodollars richer.`, `${d.npc} looks at Blackbird, at her hands, at the exit. ${d.amount} neodollars leave {their} pocket and go to a better home.`], ['Intimidation. A heroic skill, if you squint.']),
  'threaten:laugh': e((d) => [`${d.npc} laughs. Then stops laughing. Things get physical.`, `${d.npc} is not intimidated. ${d.npc} is, in fact, delighted. The fight is on.`, `Blackbird's threat lands about as well as a sandwich in a vault. ${d.npc} swings.`], ["Not sure that's how that was supposed to go."]),

  // ------------------------------------------------------------------ fun & games
  'arm_wrestle:win': e((d) => [`Blackbird slams ${d.npc}'s hand into the table. The table cracks. ${d.amount} neodollars change hands.`], ['Guns? What guns. The real weapon is my bicep.']),
  'arm_wrestle:lose': e((d) => [`${d.npc} puts Blackbird's arm down like closing a door. She pays up ${d.amount} neodollars.`], ['Warm-up. That was a warm-up.']),
  'hack:backlash': e((d) => [`Blackbird jacks into ${d.npc}'s implants. {Their} firewall bites back. She gets a faceful of feedback and a small taste of burned toast.`, `${d.npc}'s ICE is better than expected. Blackbird's connection snaps with a sound like a rubber band made of regret.`, `Blackbird pokes at ${d.npc}'s implants. {They} poke{s} back, harder. A faint smell of ozone.`], ['{They} had a good firewall. Annoying.']),
  'hack:reboot': e((d) => [`Blackbird slices ${d.npc}'s routines open. The unit goes dark, then pops out a data shard like a gum ball.`], ["Jacked in, no problem. Bit of firewall went down easy.", 'Machines love me.']),
  'hack:siphon': e((d) => [d.traced ? `Blackbird skims ${d.amount} neodollars out of ${d.npc}'s accounts. A corporate tripwire pings somewhere. A very quiet somewhere.` : `Blackbird skims ${d.amount} neodollars out of ${d.npc}'s accounts. {Their} face never changes.`], ['Jacked in, no problem. Bit of firewall went down easy, cleaned the bastards out for all they\'re worth.', "Easy money. Cybercrime is just math."]),
  'hack:prank': e((d) => [`Blackbird wiggles into ${d.npc}'s wiring and makes {their} prosthetic hand slap {them}. Twice. Nobody knows why.`], ['I regret nothing.']),
  ask_work: e((d) => [`${d.npc} slides a glowing card across the table: a dragon on the Kowloon Overpass, Atlas security up the street, and a maintenance hatch behind the Halo that goes places. "Don't die." Blackbird takes it as a compliment.`], ['A job! Look at that. Destiny in a glowing business card.']),
  fence: e((d) => [`${d.npc} appraises ${d.count} item${d.count === 1 ? '' : 's'} like a vulture at a buffet. ${d.amount} neodollars, cash, no questions.`], ['Neo economy, baby. Garbage in, money out.']),
  'get_patched:fixed': e((d) => [`${d.npc} patches Blackbird up on a bathroom sink for ${d.cost} neodollars. Full health, no receipt. The wounds close with a hiss.`, `${d.cost} neodollars and ${d.npc} puts her back together like a cheap lamp. She walks out at full strength.`], ['Doc is a genius. Do not look at the tools.', 'Cheaper than a med pack and twice as thorough.']),
  'get_patched:botched': e((d) => [`${d.npc} patches Blackbird up, then adds "a little extra". She walks out at full health. A new ${d.up}-boosting implant is in there. The ${d.down} is a bit off now. ${d.cost} neodollars.`], ["Free upgrade! I think."]),
  'order_drink:paid': e((d) => [`Blackbird orders ${d.drink} from ${d.npc} for ${d.cost} neodollars. It goes down in one. She orders another look.`, `${d.drink}. ${d.cost} neodollars. The bar-top is sticky and the evening is young.`], ['Liquid courage. Courage, at a discount.', 'One more and then I get serious.']),
  'order_drink:free': e((d) => [`${d.npc} slides Blackbird ${d.drink} on the house, along with a look that costs more than the drink.`], ['Perks of being a legend.']),
  buy_round: e((d) => [`Blackbird slaps down ${d.cost} neodollars and announces a round for the house. The bar roars. Several people think she is a billionaire.`], ["I'm the hero of this bar. The bar just doesn't know it yet."]),
  'karaoke:ovation': e((d) => [`Blackbird takes the stage and belts ${d.song}. The bar is dead silent, then on its feet. ${d.amount} neodollars in the tip jar.`, `Blackbird grabs the mic for ${d.song}. By the second chorus the whole bar is singing. The jukebox sulks. ${d.amount} neodollars in the jar.`, `${d.song}, performed by Blackbird, with feeling and no shame. A man in the back is openly crying. ${d.amount} neodollars.`, `Blackbird hits the high note of ${d.song} and, for one second, every glass in the bar rings. ${d.amount} neodollars in tips.`], ["That's right. Hero AND diva."]),
  'karaoke:boos': e(() => ['Blackbird mounts the karaoke stage and sings. The crowd boos. Something that was once a beer bottle hits her shoulder.', 'Blackbird takes the mic and opens with a note that does not exist. A bar full of strangers unite against her.', 'Halfway through her song the jukebox plays over her, out of spite. Blackbird keeps going. The crowd throws a bar stool.'], ["The sound system's busted. That wasn't how it sounded in my head."]),
  'karaoke:brawl': e((d) => [`Blackbird\'s performance is interrupted by ${d.npc}, who says a thing about her singing. A glass flies.`], ['Critics. Every one of them is a coward.']),
  'pool:win': e((d) => [`Blackbird takes ${d.npc}'s ${d.amount} neodollars off the pool table with a lazy bank shot.`], ['Pool is geometry. I am great at geometry.']),
  'pool:lose': e((d) => [`${d.npc} sinks the eight ball. Blackbird is out ${d.amount} neodollars.`], ['I let {them} win. For morale.']),
  'pool:accuse': e((d) => [`Blackbird calls ${d.npc} a hustler. ${d.npc} picks up the cue.`], ['{They} did hustle me. Probably.']),
  'mirror:swagger': e(() => ['Blackbird gives herself a pep talk in the cracked mirror. She is a hero. She is a legend. She is worth ten of her enemies. Her reflection agrees.'], ["Looking good. Dangerous. Doomed? Not today."]),
  'mirror:punch': e(() => ['Blackbird tells her reflection she is the greatest hero in Neo and, overcome, punches it. The mirror wins.'], ['Seven years of bad luck, tops.']),
  'fridge:snack': e(() => ['The walk-in fridge: leftover noodles, a suspicious pie, something labeled DO NOT. Blackbird eats the pie.'], ['Heroes need fuel.']),
  'fridge:poison': e(() => ['The pie was the DO NOT. Blackbird spends a while thinking about her choices.'], ["It wasn't the pie. It was the other thing."]),
  'fridge:caught': e((d) => [`${d.npc} finds Blackbird with her head in the fridge. {They} pick{s} up a cleaver and a slightly worse mood.`], ["I'm doing an inspection."]),
  'laser_tag:win': e((d) => [`In the basement arena, Blackbird tags nine players and a surprised referee. Prize: ${d.amount} neodollars.`], ['Reflexes, aim, and total lack of dignity. A hero trifecta.']),
  'laser_tag:lose': e(() => ['Blackbird is out in twelve seconds. A nineteen-year-old with a rifle is the MVP.'], ['It was a warm-up round. The punk was lucky.']),
  'laser_tag:cheat': e(() => ['Blackbird rewrites her vest to count hits twice. The arena flags it. She is ejected with a lifetime ban from the NEON KNIGHTS league.'], ['Legendary. They will name a rule after me.']),
  'safe:success': e((d) => [`The wall safe clicks open: ${d.amount} neodollars and ${d.item}. A burglar alarm somewhere is considering waking up.`], ['Locks, safes, vaults. The universe wants me to have things.']),
  'safe:alarm': e(() => ['The safe screams. A siren, a red light, a recorded voice that says "THIEF" in a friendly tone.'], ['Technically I wasn\'t done yet.']),
  'skyline:dragon': e(() => ['From the roof, Blackbird spots it: a massive shape cruising the Kowloon Overpass, running lights tracing the lines of wings. An Apollo Mk. II cyberdragon. Atlas\'s favorite pet.'], ['There. The big one. I can take it.', "Forty tons of Atlas steel. I'll need a bigger sword. Or a smaller dragon."]),
  'skyline:wobble': e(() => ['Blackbird leans over the roof edge for a better look and nearly leaves it for good. A pigeon is concerned.'], ["I'm fine. It's the building that's tilting."]),
  'skyline:vista': e(() => ['Blackbird stands on the roof and surveys Neo: arcologies, billboards, a thousand lit windows of people not doing what she does.'], ['A hero\'s view. Someday this city will thank me.']),
  'dumpster:loot': e((d) => [d.sniff ? `Sprocket sniffs out a buried treasure: ${d.item}. Blackbird takes credit.` : `Elbow-deep in the dumpster, Blackbird finds ${d.item}. A rare win.`], ['Treasure. In trash. That\'s Neo poetry.']),
  'dumpster:gear': e((d) => [`Under a pile of refuse, Blackbird digs up ${d.item}. Still works. Mostly.`], ['Trash to treasure. The hero\'s journey.']),
  'dumpster:junk': e((d) => [`Blackbird rummages the dumpster and surfaces with ${d.item}. She pockets it anyway.`, `Dumpster haul: ${d.item}. Value: unknowable.`], ['Someone might want it. Someday.', 'It\'s sentimental. Somehow.']),
  'dumpster:rats': e(() => ['The dumpster lid flips open and a swarm of cyber-rats pours out. Their eyes glow a very specific red.'], ['Aw. A welcoming committee.']),
  'dumpster:hatch': e(() => ['Behind the dumpster, Blackbird finds a rusty hatch marked MAINTENANCE — NO ADMITTANCE. It is not locked.'], ['Do not enter. That, historically, is my cue.']),
  'dumpster:vagrant': e(() => ['A dumpster-dweller in a Neo PD jacket shoves a med pack at her and a muttered threat about Wednesdays.'], ['Wise old man energy. Sort of.']),
  'dumpster:nothing': e(() => ['The dumpster contains garbage. Actual garbage. Blackbird is a little hurt about it.'], ["A true hero knows when she's been had."]),
  'vending:snack': e(() => ['Blackbird kicks the vending machine. It drops something shaped like a candy bar. It is edible. It was edible.'], ['Hero fuel.']),
  'vending:jackpot': e((d) => [`The vending machine coughs up ${d.amount} neodollars in coins. Blackbird looks around, then keeps them.`], ["The machine owed me."]),
  'vending:zap': e(() => ['The vending machine zaps Blackbird for her insolence.'], ["That's not a vending machine. That's a trap."]),
  'vending:alarm': e(() => ['The vending machine wails. A drone looks over. A patrol car, somewhere, adds a note to a file.'], ['Hardly my fault. I was gentle. Mostly.']),
  'dance:wow': e((d) => [`Blackbird hits the dance floor and the crowd opens up. ${d.npc} dances with her. Neon rains.`], ['Look at me go. The dragon will have to wait.']),
  'dance:trip': e((d) => [`Blackbird trips over her own feet on the dance floor and takes out ${d.npc}'s drink, ${d.npc}'s dignity, and a pillar.`], ["That was choreography. Look it up."]),
  'fuse_panel:blackout': e(() => ['Blackbird pulls a lever. The lights in the building go dark. Somewhere above, glass shatters and the bass dies mid-beat.'], ['Dark is my favorite mood.']),
  'fuse_panel:zap': e(() => ['The fuse panel zaps Blackbird with the voltage of a thousand regrets.'], ["Nobody labels these things."]),
  'fuse_panel:map': e(() => ['Taped inside the panel: a hand-drawn map to the Helix Biotech loading dock, and a note that says DO NOT.'], ['I am obviously going to do the note.']),
  'crates:loot': e((d) => [`Blackbird pries open a Helix crate and finds ${d.item}. Not for her. Hers now.`], ['Corporate swag.']),
  'crates:alarm': e(() => ['The crate beeps. It was a trap. The crate is also a speaker. It says "HELLO, INTRUDER."'], ['Crates have feelings now.']),
  'vault:success': e((d) => [d.creds ? `Atlas executive credentials swipe, and the Helix vault door opens. Inside: ${d.item}. The vault does not ask any questions.` : `Blackbird cracks the vault with a mix of hacking, prayer, and a tire iron. Inside: ${d.item}. It is humming.`], ['I am so great at this. What does it do? Who cares.']),
  'vault:alarm': e(() => ['The vault locks Blackbird in with a polite chime. Then the klaxons. Then the lab-bot.'], ['It was bound to happen.']),

  // ------------------------------------------------------------------ scrap, sabotage, and the gig board
  'scrap_pile:good': e(
    (d) => {
      if (d.variant === 'rare') return [`Buried under the junk: ${d.item}. Someone threw away a small fortune and didn't notice.`];
      if (d.variant === 'find') return [`Blackbird digs ${d.item} out of the scrap heap. Rust, but usable rust.`];
      return [`Blackbird sorts the scrap pile into "metal," "not metal," and "do not touch," and walks off with ${d.amount} neodollars of the first kind.`];
    },
    ['One woman\'s trash.', 'Recycling, basically. I\'m an environmentalist.'],
  ),
  'scrap_pile:bad': e(() => ['A jagged edge in the scrap pile finds Blackbird\'s palm before she finds anything in it.'], ['Tetanus is a state of mind.']),
  'scrap_pile:mixed': e(() => ['The scrap pile is, on closer inspection, just scrap.'], ["It's metaphorical. Somehow."]),

  'relay:good': e((d) => [`Blackbird pries the housing off the Atlas relay and feeds it a very bad afternoon. Somewhere, a surveillance map goes dark for a block. Atlas heat down ${d.drop}.${d.item ? ` A ${d.item} falls out the bottom.` : ''}`], ['Fewer eyes on me. More eyes for me.']),
  'relay:bad': e(() => ['The relay was wired to notice exactly this. Lights flash. Something clanks awake nearby.'], ['In my defense, it started it.']),

  'job_board:good': e(
    (d) => {
      if (d.variant === 'flyers') return [`Blackbird plasters half a block with flyers for a gig she does not understand. ${d.amount} neodollars, paid in cash, no questions.`];
      if (d.variant === 'rumor_job') return [`Someone on the board wants gossip, specifically. Blackbird supplies it, some of it even true. ${d.amount} neodollars.`];
      if (d.variant === 'skiptrace') return [`The flyer wanted a name found; Blackbird finds the name, and persuades the name to come quietly. ${d.amount} neodollars, bounty-hunter rates.`];
      return [`Another day, another flyer off the board. ${d.amount} neodollars richer.`];
    },
    ['Gig economy. I am the gig.', 'Neo pays in cash and bad decisions. I take both.'],
  ),
  'job_board:bad': e(
    (d) => (d.variant === 'skiptrace_fail'
      ? ['The skip on the flyer does not want to be found, and definitely does not want to come quietly.']
      : ['The "light pest control" job on the flyer was undersold. Considerably.']),
    ['The fine print was, in fact, the whole point.'],
  ),

  // ------------------------------------------------------------------ odd jobs, gigs, and hustles
  'panhandle:good': e(
    (d) => (d.variant === 'stranger'
      ? [`A stranger presses ${d.amount} neodollars into Blackbird's hand${d.item ? ` and, oddly, ${d.item}` : ''}, and keeps walking before she can say anything heroic about it.`]
      : [`Blackbird sits on the curb with a cup and a sad expression. Neo, briefly, has a heart: ${d.amount} neodollars.`]),
    ['Dignity is overrated. Cash is cash.', "I'm not pathetic. I'm resourceful with my face."],
  ),
  'panhandle:bad': e(() => ['Someone drops a coin in Blackbird\'s cup from a height clearly meant to be insulting.'], ["I've been hit by worse than spare change. Barely."]),
  'panhandle:mixed': e(() => ['Neo walks past Blackbird\'s cup like it is part of the sidewalk.'], ['A hero, invisible. Great system.']),

  'odd_jobs:good': e((d) => [`Blackbird spends an hour on ${d.chore} for ${d.npc}, like a regular person with a regular job. ${d.amount} neodollars for her trouble.`], ['Honest work. Weird feeling.', 'This is what the other heroes do, right? Chores?']),
  'odd_jobs:bad': e((d) => [`The ${d.chore} fight back. ${d.npc} is unimpressed.`], ["That's a workplace injury. I'm suing somebody."]),

  'security_shift:good': e((d) => [`Blackbird works the Neon Pharaoh's door for the night: mirrored shades, a bad attitude, and ${d.amount} neodollars by closing.`], ['Nobody gets past me. Nobody important, anyway.']),
  'security_shift:bad': e((d) => (d.npc ? [`${d.npc} tries to get past Blackbird the hard way. It does not go the way ${d.npc} planned.`] : ['The night shift is long, loud, and entirely uncompensated for the bruises.'])),

  'courier_run:good': e((d) => [`${d.npc} hands Blackbird a sealed package and an address. She delivers it without opening it, mostly. ${d.amount} neodollars.`], ['Discretion. My middle name. Allegedly.']),
  'courier_run:bad': e((d) => [`Whatever ${d.npc} had Blackbird carrying, somebody official was looking for it. She drops it and walks fast.`], ["I'm sure it was legal. Mostly."]),

  'bodyguard_gig:ambush': e((d) => [`Blackbird is three steps into walking ${d.npc} home when somebody steps out of the dark with a plan.`], ['This is why I charge extra.']),
  'bodyguard_gig:good': e(
    (d) => (d.variant === 'saved'
      ? [`${d.npc} makes it home, rattled but intact. ${d.amount} neodollars, and a look that says {they}'ll call again.`]
      : [`Blackbird walks ${d.npc} all the way home, uneventfully, which is apparently worth ${d.amount} neodollars.`]),
    ['A hero who moonlights. Shocking nobody.'],
  ),

  'home_scan': e((d) => [`The address scanner flickers behind Blackbird's eye and, unasked, hands over where ${d.npc} (${d.role}) sleeps: a street, a block, a door.`, `A line of tiny text unfurls across ${d.npc}'s shoulder: a home address. Blackbird did not ask. The scanner never does.`], ['Everyone has a front door. Now I know where yours is.', 'That is not a thing I was supposed to know. Filed.']),

  // Guard dogs and traps at a home.
  'home_hazard:dogs_slip': e((d) => [Number(d.count) > 1 ? `Something hums behind the door of ${d.place}: ${d.count} ${d.model}s, curled up on the rug with their eyes dark. Blackbird goes past them on the toes of her boots, counting each breath she isn't taking.` : `A ${d.model} lies across the hallway of ${d.place}, eyes dark, fans ticking over. Blackbird steps over it like a sleeping toddler and does not look down.`], ['Good boy. Great boy. Stay asleep.']),
  'home_hazard:dogs_retreat': e((d) => [Number(d.count) > 1 ? `The ${d.model}s in ${d.place} lift their heads together. Blackbird takes one look at the jaws, and the second look at her tire iron, and backs out the way she came.` : `The ${d.model} in ${d.place} lifts its head and finds her with a small red light. Blackbird does the maths on her tire iron against its jaws, and backs out very, very slowly.`], ['No. Absolutely not. I have a policy about things that bite back.']),
  'home_hazard:dogs': e((d) => [Number(d.count) > 1 ? `${d.count} ${d.model}s come up off the floor of ${d.place} in one smooth motion, jaws opening, and the quiet part of the job is officially over.` : `The ${d.model} in ${d.place} does not bark. It simply stands up, and keeps standing up, and then it is running.`], ['I was told they were more of a deterrent.']),
  'home_hazard:trap_disarmed': e((d) => [
    d.trap === 'grenade_string' ? `A glint across the doorway of ${d.place}: a fishing line and, at the end of it, a grenade with its pin half out. Blackbird spends a very long minute making it a grenade that is not a problem.`
    : d.trap === 'shock_mat' ? `The mat inside ${d.place} has a wire coming out of the back of it, and the wire goes to a car battery. Blackbird steps around it, and also around the battery.`
    : d.trap === 'gas_vent' ? `A faint chemical smell in ${d.place}, and a vent that is too new for the rest of the room. Blackbird tapes it shut and holds her breath for the rest.`
    : `The ceiling of ${d.place} has a small red eye in it. Blackbird, with a glove and a lot of patience, tells it she is the landlord. It believes her.`,
  ], ['A very small number of problems are solved by being sneakier than a thing that has no brain.', 'Booby traps are just a lock with an opinion.']),
  'home_hazard:trap_failed': e((d) => [
    d.trap === 'grenade_string' ? `Blackbird sees the grenade on a string, and the fishing line, and the pin, and reaches for the one and not the other.`
    : d.trap === 'shock_mat' ? `Blackbird sees the wired mat and thinks she has it, right up until her boot touches it.`
    : d.trap === 'gas_vent' ? `Blackbird finds the vent and works on it a little too long.`
    : `Blackbird sees the sentry turret and makes her case to it. The case does not go well.`,
  ], ['That was the bit where it was supposed to work.']),
  'home_hazard:trap_sprung': e((d) => [
    d.trap === 'grenade_string' ? `Blackbird walks into a fishing line in the dark. Somewhere behind her a pin makes the smallest possible sound.`
    : d.trap === 'shock_mat' ? `The mat inside ${d.place} was not a mat. It was a car battery with a hat on.`
    : d.trap === 'gas_vent' ? `A hiss from the ceiling of ${d.place}, and a smell like pear drops.`
    : `A panel opens in the ceiling of ${d.place}. A red dot finds Blackbird's forehead and stays.`,
  ], ["I looked at that room. I didn't see anything. That's the problem with traps."]),
  'home_hazard:trap_hit': e((d) => [
    d.trap === 'grenade_string' ? `The grenade goes off with a flat, apologetic bang. Blackbird takes ${d.damage} damage and a great deal of plaster. The whole block heard it.`
    : d.trap === 'shock_mat' ? `The shock takes Blackbird up through the boots and out through her teeth: ${d.damage} damage, and a smell of hot copper.`
    : `Blackbird goes down in a sweet, pear-scented fog. She wakes on the landing outside ${d.place} with ${d.damage} damage, a headache, and her dignity somewhere else.`,
  ], ['Ow. In every sense.', 'Nobody warned me about the booby-trapped bit.']),

  'burgle_flat:busy': e((d) => [`Blackbird presses an ear to ${d.place}. Voices, a television, somebody frying something. She straightens up, nods to nobody, and moves on down the landing.`], ['Occupied. I have standards. Low ones, but standards.']),
  'burgle_flat:clean': e((d) => [d.listened ? `Blackbird listens at ${d.place}, hears nothing, and is inside in under a minute. ${d.amount} neodollars${d.item ? ` and ${d.item}` : ''} from the places people keep things.` : `Blackbird picks the lock on ${d.place} without being sure anyone is out. Lucky: ${d.amount} neodollars${d.item ? ` and ${d.item}` : ''}, and nobody home.`], ['People leave their whole lives in unlocked drawers. Rude, really.']),
  'burgle_flat:caught': e((d) => [`Blackbird eases into ${d.place} and finds ${d.npc} in the kitchen, mid-sandwich. Nobody says anything for a very long second.`], ['I thought you were out. The shoes by the door were a decoy.']),
  'burgle_flat:noise': e((d) => [`The lock at ${d.place} fights back, loudly. Somewhere down the landing a door opens a crack. Blackbird leaves with nothing and a neighbour's full attention.`], ['Quiet job. That was the plan. The plan had a lock in it.']),
  'burgle_home:good': e((d) => [`While ${d.npc} is otherwise occupied, Blackbird lets herself into ${d.place} and helps herself: ${d.amount} neodollars${d.item ? ` and ${d.item}` : ''}. She locks the door behind her. Mostly out of habit.`], ['{They} {was}n\'t using it. Probably.']),
  'burgle_home:bad': e((d) => [`The key turns in the lock of ${d.place}. ${d.npc} is home early, and Blackbird is standing in {their} living room holding something that is not hers.`], ["I was just admiring the decor. With my hands."]),

  'protection_racket:good': e((d) => [`Blackbird explains, calmly, that bad things happen to places without her protection. ${d.npc} pays ${d.amount} neodollars for a problem Blackbird invented.`], ['A classic business model. Mine now.']),
  'protection_racket:bad': e((d) => [`${d.npc} has heard this pitch before, from someone scarier. Blackbird is asked, loudly, to leave.`], ["Tough market. I'll rebrand."]),

  'scam_mark:good': e((d) => [`Three cards, one bent corner, and ${d.npc} never had a chance. ${d.amount} neodollars.`], ['Hand-eye coordination, but for crime.']),
  'scam_mark:bad': e((d) => [`${d.npc} counts the cards back and realizes, slowly, how this works. Blackbird realizes it at the same time.`], ['Everyone\'s a critic.']),

  'sell_fake_goods:good': e((d) => [`Blackbird sells ${d.npc} a stim that is mostly food coloring and confidence. ${d.amount} neodollars, and a very convincing pitch.`], ['Placebo effect is real. I am basically a doctor.']),
  'sell_fake_goods:bad': e((d) => [`${d.npc} tries the goods on the spot. The goods do nothing. ${d.npc} notices.`], ['Quality control. Who has time.']),

  'cold_read:good': e((d) => [`Blackbird tells ${d.npc} {their} future involves a tall, dark stranger and some financial trouble. ${d.npc}, delighted, tips ${d.amount} neodollars.`], ["I'm a hero AND a mystic. Multitalented."]),
  'cold_read:bad': e((d) => [`${d.npc} points out that "you will face a challenge soon" describes literally everyone, always.`], ['Tough to please, this one.']),

  'odd_request:fetch_item': e((d) => [d.amount ? `${d.npc} needed something fetched. Blackbird fetched it, no drama. ${d.amount} neodollars.` : `Whatever ${d.npc} wanted fetched, it was gone, guarded, or both. Blackbird comes back empty-handed.`], ['Errand hero. Has a nice ring to it.']),
  'odd_request:deliver_message': e((d) => [d.amount ? `Blackbird delivers ${d.npc}'s message, verbatim, to someone who did not want to hear it. ${d.amount} neodollars for the privilege.` : `The message does not land the way ${d.npc} hoped. Neither does the reply.`], ["I'm basically a courier with opinions."]),
  'odd_request:scare_someone': e((d) => [d.amount ? `Blackbird scares somebody off on ${d.npc}'s behalf, nothing permanent, just enough that they get it. ${d.amount} neodollars.` : `Blackbird tries to look scary on ${d.npc}'s behalf. The target looks unconvinced.`], ['Freelance intimidation. Growth industry.']),
  'odd_request:watch_my_stuff': e((d) => [d.amount ? `Blackbird watches ${d.npc}'s bag for a while, no questions asked, and gets ${d.amount} neodollars for her discretion.` : `${d.npc}'s bag gets lighter on Blackbird's watch. ${d.npc} notices immediately.`], ['Unofficial luggage. Fine.']),
  'odd_request:walk_me_home': e((d) => [d.amount ? `Blackbird walks ${d.npc} home, chatting the whole way. ${d.amount} neodollars for company that happens to hit hard.` : `Blackbird gets distracted halfway through walking ${d.npc} home. ${d.npc} notices.`], ['Easiest job in Neo.']),
  odd_request: e((d) => [`${d.npc} has a small, strange favor to ask.`], ['Everyone needs something. I\'m available.']),

  'hunt_drone': e((d) => [`Blackbird clocks an Atlas patrol drone, ${d.npc}, running its route like it owns the block. It does not, yet, know about her.`], ['One less set of eyes for Atlas. One more trophy for me.']),
  'hunt_drone:good': e((d) => [`${d.npc} comes down in pieces. Blackbird pockets what's salvageable and Atlas's local surveillance gets a little blinder, heat down ${d.drop}.`], ['Vigilante justice. Also, free parts.']),

  use_med_pack: e(
    (d) => {
      const left = d.left ? `${d.left} kit${d.left === 1 ? '' : 's'} left.` : 'That was the last one.';
      return [
        d.cured ? `A ${d.item} goes in. The ${String(d.cured).replace('_', ' ')} gets set and sealed, and ${d.heal} HP come back. ${left}` : `A ${d.item} goes in with a hiss. ${d.heal} HP come back. ${left}`,
        `Blackbird cracks a ${d.item} and presses it to the worst of it. ${d.heal} points of her return. ${left}`,
      ];
    },
    ['Medical science. Paid for in advance.', 'Good as new. Better, if you do not look at the label.'],
  ),
  sober_up: e(() => ['Blackbird sticks her head in a bucket of ice water. The room stops spinning, but only as an experiment.'], ["I'm perfectly sober. Everyone else is blurry."]),
  'use_stim:boost': e(
    (d) => [
      d.stat === 'power' ? `Blackbird slaps a ${d.item} into her neck. The universe snaps to focus. +${d.amount} power for ${d.duration} beats.` : `Blackbird chugs a ${d.item}. +${d.amount} ${d.stat}, for about ${d.duration} beats. The edges of the world sharpen.`,
    ],
    ["Everything's a nail. I'm a hammer.", 'I can see the sound. This is fine.'],
  ),
  'use_stim:overdose': e(
    (d) => [d.mixed ? `Blackbird adds a ${d.item} to the two things already in her bloodstream. Her heart files a formal complaint. The floor starts to move.` : `The ${d.item} was cut with something. Blackbird sees colors that do not exist. The floor starts to move.`],
    ["I'm not stumbling. The room is.", 'Hello, floor. You look different today.'],
  ),
  'stim_fade:clean': e((d) => [`The ${d.item} wears off. Everything goes back to its normal, dull shape.`], ['Back to baseline. Boring.']),
  'stim_fade:crash': e((d) => [`The ${d.item} wears off and takes something with it. Blackbird's limbs feel like wet laundry.`], ["I'm fine. I'm resting my eyes. With my whole body."]),
  buy_med_pack: e(
    (d) => [`${d.npc} rings up a ${d.item} for ${d.cost} neodollars. "Don't get stabbed," says the receipt. ${d.packs} kit${d.packs === 1 ? '' : 's'} in the pockets now.`, `A ${d.item}, ${d.cost} neodollars, and a lecture about expiry dates. ${d.packs} on hand.`],
    ['Insurance, but in a box.', 'Pricey. Cheaper than dying.'],
  ),
  buy_ammo: e(
    (d) => [`${d.npc} slides over ${d.rounds} ${d.ammo} for ${d.cost} neodollars. Blackbird now has ${d.total}.`, `${d.cost} neodollars buys ${d.rounds} ${d.ammo}. Math is on her side for roughly one fight.`],
    ['Bullets are just a loan against future problems.', 'Locked and loaded. Well, loaded.'],
  ),
  'buy_gear:weapon': e(
    (d) => [`${d.npc} lays a ${d.item} on the counter. ${d.cost} neodollars. ${d.gun ? `It comes with ${d.starter}, because ${d.npc} is not a monster.` : 'The bagels are free with purchase. They are not good.'}`],
    ["Now THAT is a hero's weapon.", "Pretty. Dangerous. Like me."],
  ),
  'buy_gear:armor': e(
    (d) => [`${d.npc} hands over ${d.item} for ${d.cost} neodollars. "Stops most things," ${d.npc} says. "Not all." Blackbird chooses to hear only the first part.`],
    ['Style and survival. Rare combo.'],
  ),
  'buy_stim:shop': e(
    (d) => [`${d.npc} sells Blackbird a ${d.item} for ${d.cost} neodollars. Sealed, labeled, and legal in at least some districts.`],
    ['Tomorrow-me can deal with the side effects.'],
  ),
  'buy_stims:deal': e(
    (d) => [`${d.npc} slides a ${d.item} into Blackbird's palm for ${d.cost} neodollars. It is not labeled. It is not sealed. It is, strictly speaking, cheap.`],
    ['A bargain. What could be in it?'],
  ),
  out_of_ammo: e(
    (d) => [
      d.bare ? `Click. The ${d.weapon} is out of ${d.ammo}. Blackbird has nothing else to swing. She uses her fists.` : `Click. The ${d.weapon} is out of ${d.ammo}. Blackbird switches to the ${d.fallback} and carries on, a little less glamorously.`,
      d.bare ? `The ${d.weapon} coughs and gives up. Out of ${d.ammo}. Fists it is.` : `Out of ${d.ammo}. Blackbird flips the ${d.weapon} around like a club and wields the ${d.fallback} instead.`,
    ],
    ['It was a warning shot. For me.', "That was MY last round? I counted differently."],
  ),
  'revenant:saw': e(
    (d) => [`${d.npc} stops mid-sentence. The last time Blackbird was in this room, ${d.npc} watched her die in it. ${d.npc} is now looking at her the way you look at a fridge that has started talking.`],
    ['Backups: still weird, apparently.', 'I can explain. I would rather not.'],
  ),
  'revenant:heard': e(
    (d) => [`${d.npc} has heard Blackbird is dead, and is now watching her walk in. ${d.npc} decides, after some visible effort, that it would be rude to bring it up.`],
    ['Reports of my death were accurate. We are not getting into it.'],
  ),
  'taken:ring': e((d) => [`${d.npc} reaches for her drink and Blackbird clocks the ring. A ${d.kind}, ${d.partner}, she mentions, in a tone that suggests this is supposed to end the conversation.`], ['A ring is a suggestion. A loud one. Still a suggestion.']),
  'taken:mention': e((d) => [`${d.npc} lets slip that ${d.partner} would hate this song. ${d.partner} is her ${d.kind}. The conversation has acquired a third person.`], ['Third person. Not in the room. Manageable.']),
  'taken:photo': e((d) => [`${d.npc}'s phone lights up with a photo of ${d.partner}: her ${d.kind}. She turns it face down on the bar, a little too slowly.`], ['She turned it face down. That is a sign. Of what, unclear. A sign.']),
  'taken:after': e((d) => [`Afterwards, ${d.npc} mentions ${d.partner}. Her ${d.kind}. She says it to the ceiling.`, `${d.npc} gets a message, reads it, and says ${d.partner}'s name like a diagnosis. Her ${d.kind}. News to Blackbird.`], ['Details. I was in the moment.', 'That is a lot of information to get after, rather than before.']),
  'poach:win': e((d) => [`Blackbird makes the case. ${d.npc} listens, looks at her drink, looks at her. "${d.partner} isn't going to like this." She doesn't sound like she minds. By closing she has left her ${d.kind}.`, `It takes eleven minutes. ${d.npc} walks out on ${d.partner} in a text message and a shrug. Blackbird tells herself it was the speech.`], ['It was the speech. The speech was good.', 'Eleven minutes. A personal best.']),
  'poach:lose': e((d) => [`Blackbird suggests ${d.npc} reconsider her ${d.kind}. ${d.npc} does not reconsider. ${d.npc} explains, kindly and at length, why not.`, `"I'm flattered," says ${d.npc}, "and I'm with ${d.partner}." Blackbird files it under 'opening position'.`], ['Opening position. Everyone starts somewhere.', 'She said flattered. Flattered is a door left open.']),
  'poach:slap': e((d) => [`${d.npc} does not take the suggestion about ${d.partner} well. There is a slap, and it is excellent.`], ["Strong follow-through. I respect it."]),
  'poach:caught': e((d) => [`Blackbird is halfway through the case against ${d.partner} when ${d.partner} turns out to be standing right there, with a drink and the full details.`], ['Timing has never been my thing. Wait. Timing is entirely my thing.']),
  'reconcile:win': e((d) => [`Blackbird and ${d.npc} have the conversation they've both been having in their heads for days. It ends the way these conversations end: back together, nobody quite sure who gave in.`], ["Second time's the charm. Statistically."]),
  'reconcile:lose': e((d) => [`Blackbird asks ${d.npc} for another go. ${d.npc} looks at her for a long moment and says no in a way that is almost gentle.`], ['Almost gentle. That is basically yes in the long run.']),
  'breakup:blackbird': e((d) => [`Blackbird ends it with ${d.npc}. It's brief and not as gracefully handled as she'd hoped. ${d.npc} takes it ${d.stage === 'ex' ? 'like someone who saw it coming' : 'like someone who thought they were in a relationship'}.`, `"It's not you," Blackbird tells ${d.npc}, in what she feels is a good line. ${d.npc}'s expression says it was, in fact, at least partly her.`], ["Clean break. Mostly clean. Clean-ish.", 'Honest, kind, brief. Two out of three.']),
  'breakup:drift': e((d) => [`${d.npc} walks over, says it's been weeks, says she's not doing this anymore, and leaves, mid-sentence, with a dignity Blackbird could not manage if she tried.`], ['Weeks? It was, what, weeks? Time is weird.']),
  'breakup:caught': e((d) => [`${d.npc} saw. ${d.npc} does not make a scene. She just says the single word "okay" and walks out, and it is the worst thing that has happened to Blackbird all week.`, `${d.npc}'s face does something complicated, and then it's over, and she's gone. Blackbird was, according to the witnesses, kissing ${d.npc2} at the time.`], ["That was bad. That was objectively bad. Is it still a relationship if she's not at the bar?"]),
  'dtr:they_more': e((d) => [`${d.npc} introduces Blackbird to a friend as her ${d.theirStage === 'together' ? 'girlfriend' : 'person she is seeing'}. Blackbird is also in the conversation. She is learning this at the same time as the friend.`, `"So, us," says ${d.npc}, in a tone that suggests there's a conversation about to happen. Blackbird had considered it more of a recurring event.`], ['That is a word. They used a word. I was not consulted on the word.', 'Us. A strong word for a Tuesday.']),
  'dtr:she_more': e((d) => [`Blackbird is calling ${d.npc} 'my person' in her head. ${d.npc} is calling Blackbird 'a thing that has been happening'. Neither has said it out loud, and both feel they've been very clear.`], ["It's going great. I can tell by how I feel about it."]),
  'recall:lover': e((d) => [`${d.npc} lights up and says her name like it means something. They have, by ${d.npc}'s count, ${d.nights} nights of history. Blackbird has no idea who this is.`, `"Where have you BEEN?" says ${d.npc}, delighted, and kisses her. Blackbird kisses back on principle and spends the rest of the encounter reconstructing the situation.`], ["The backup doesn't have this one. The backup is clearly missing things.", 'She seems nice. I probably liked her.']),
  'recall:ex': e((d) => [`${d.npc} sees Blackbird and stops dead. A long, loaded look. Whatever happened between them, ${d.npc} remembers all of it, and Blackbird doesn't remember any.`], ['Cold. She is being cold. I must have been excellent.']),
  'partner_arrives:fight': e((d) => [`${d.partner} walks in, takes one look at ${d.npc}, and one look at Blackbird, and puts it together faster than Blackbird would have liked.`, `${d.npc}'s ${d.kind}, ${d.partner}, has heard. ${d.partner} would like a word. The word is a punch.`], ['A jealous partner. I respect the commitment. I will be taking it as a compliment.']),
  'partner_arrives:chose': e((d) => [`${d.partner} turns up at the worst possible moment. ${d.npc} looks at ${d.partner}, then at Blackbird, and goes home with her ${d.kind}. There is no fight. It would almost be easier if there were.`], ['That went well for someone, probably.']),
  'partner_arrives:dumped': e((d) => [`${d.partner} arrives to a very unpleasant scene, which ${d.npc} ends by telling ${d.partner}, in front of everyone, that it's over. ${d.partner} leaves. The bar applauds, slowly.`], ['I did not plan that. I would like credit for it anyway.']),
  'learn:ex_member': e((d) => [learnLine(d, `${d.npc} used to run with ${d.faction}`)], ['Everybody was somebody once.', 'Ex-gang. Good to know who not to bring to a party.']),
  'learn:owes': e((d) => [learnLine(d, `${d.npc} owes ${d.amount} neodollars to ${d.to}`)], ['Owing money: the great equaliser.', 'A person in debt is a person with a price. Not that I would.']),
  'learn:veteran': e((d) => [learnLine(d, `${d.npc} saw ${d.of}, and {they} still {doesnt} like loud noises`)], ['Quiet respect. Mostly because {they} could hit me.', 'The scars have a story. I want the story.']),
  'learn:lost_someone': e((d) => [learnLine(d, `${d.npc} lost ${d.about}, {their} ${d.rel}, and {doesnt} talk about it`)], ['That is a lot to carry around.', 'I should say something. I will say something later.']),
  'learn:arrested_once': e((d) => [learnLine(d, `${d.npc} was arrested once, for ${d.for}`)], ['Everyone has a record. Mine is just more exciting.', 'Useful. Possibly very useful.']),
  'learn:was_somebody': e((d) => [learnLine(d, `${d.npc} used to be ${d.as}`)], ['A has-been. I can respect a has-been.', 'Fame fades. Mine will not, but still.']),
  'learn:wants_money': e((d) => [learnLine(d, `${d.npc} badly needs about ${d.amount} neodollars`)], ['Desperate people make the best business partners.', 'Everyone needs money. Most are polite about it.']),
  'learn:wants_revenge': e((d) => [learnLine(d, d.mode === 'kill' ? `${d.npc} wants ${d.about} gone for good, over ${d.beef}, and would pay ${d.reward} neodollars to see it done` : `${d.npc} wants ${d.about} taught a lesson, over ${d.beef}, and would pay ${d.reward} neodollars for it`)], ['A job. A paid job. A paid job with a grudge in it.', 'Somebody is going to want a hero for this.']),
  'learn:wants_out': e((d) => [learnLine(d, `${d.npc} wants out of ${d.faction}, quietly`)], ['A person who wants out. That is a person who owes me a favour. Eventually.']),
  'learn:wants_to_find': e((d) => [learnLine(d, `${d.npc} is looking for ${d.about}, {their} ${d.rel}`)], ['A mystery. I love a mystery.', 'People go missing in Neo all the time. Some of them on purpose.']),
  'learn:wants_peace': e((d) => [learnLine(d, `${d.npc} just wants a quiet life`)], ['Quiet. In this city. Bold of {them}.', "Cute. I'll try not to ruin it."]),
  'ask:nothing': e((d) => [`${d.npc} looks Blackbird over, then at {their} own hands, and says there is nothing worth selling. Not tonight.`], ['A refund would be nice. Nothing to refund. Fine.']),
  'contract:accept': e((d) => [`${d.npc} wants ${d.target} ${d.mode === 'kill' ? 'gone' : 'taught a lesson'}. Blackbird takes the job: ${d.amount} neodollars when it is done.`], ['A client. I have a client.', 'Honest work. Technically.']),
  'contract:paid': e((d) => [`${d.npc} pays the ${d.amount} neodollars, counting every note. ${d.target} is ${d.dead ? 'no longer a problem' : 'sorted'}, and ${d.npc} looks lighter for it.`], ['That is how it is done.', 'Satisfied customer. Put it on the wall.']),
  'contract:void': e((d) => [`${d.target} is dealt with, but ${d.npc} is not around to pay for it. Blackbird does the math. It is annoying math.`], ['Free work. I will not be doing that again.']),
  'goal_new:contract': e((d) => [`Blackbird has taken a job on ${d.npc}. New objective: ${d.goal}.`], ['I am a professional now.', 'The paperwork is a handshake. The target is {them}.']),
  'avenger': e((d) => [`${d.npc} steps out of the crowd. "You're the one who did ${d.about}." {They} {is} not here to talk.`, `${d.npc} has been looking for Blackbird since ${d.about}. {They} found her.`], ['I forgot to be afraid. I do that.', 'Revenge. How flattering. How sudden.']),
  'recognition:heard_killed': e((d) => [`${d.npc} has ${d.mem}. {They} {has} not forgotten, and {they} {is} not smiling.`], ['Word gets around. Great for the brand.']),
  'recognition:heard_hurt': e((d) => [`${d.npc} has ${d.mem}. {They} look{s} at Blackbird for a long moment.`], ['I am a legend. Some people take that personally.']),
  'recognition:heard_helped': e((d) => [`${d.npc} has ${d.mem}, and says so, warmly.`], ['See? Heroics. Pay attention.']),
  'bounty_scan:posted': e((d) => [`Blackbird's optics flag ${d.npc} (${d.role}): an NPD bounty, ${$(d.amount)} neodollars, posted where anyone who bothers to look can read it.`], ['Free money, walking around. Do they know?']),
  'bounty_scan:scanner': e((d) => [`The bounty-grade scanner pings on ${d.npc} (${d.role}). Somebody paid good money to hide ${$(d.amount)} neodollars of NPD paper. Not good enough.`], ['Everybody has a price. Some have a bounty.']),
  'bounty_hit': e((d) => [`${d.victim} has a warrant out, so the NPD has nothing to add to ${Number(d.witnesses) ? 'what the witnesses saw' : 'the night'}. No police heat.`], ['Technically, I am assisting law enforcement.']),
  'bounty_paid': e((d) => [d.dead ? `The NPD pays out ${$(d.amount)} neodollars for ${d.npc}, no questions about the condition.` : `The NPD pays out ${$(d.amount)} neodollars for ${d.npc}, delivered, dented, and mostly intact.`], ['Honest work. Sort of.']),
  'sweep': e((d) => [`Blackbird counts the room: ${d.npc} and ${d.count} witness${Number(d.count) === 1 ? '' : 'es'}, and nobody near a phone yet. About ${d.odds}% she can drop all of them first. She likes her odds.`], ['Nobody calls the cops if nobody is left to call them.']),
  'lure:ok': e((d) => [`Blackbird leans in and tells ${d.npc} there's something worth seeing out at ${d.place}. ${d.npc} follows her out of ${d.from}, curious and unarmed in every way that matters.`], ['Out of sight, out of the police report.']),
  'lure:fail': e((d) => [`Blackbird tries to coax ${d.npc} out of ${d.place}. ${d.npc} stays exactly where they are and looks at her a little too long.`], ["They didn't buy it. They bought a drink."]),
  'tail:follow': e((d) => [`${d.npc} finally drifts out of ${d.from} toward ${d.place}. Blackbird gives it a count of ten and follows, hood up.`], ['Patience. Quiet. Patience.']),
  'tail:wait': e((d) => [`Blackbird nurses a drink and watches ${d.npc} across ${d.place}, waiting for them to be alone. They are not alone.`], ['I am a very patient predator.']),
  'crime_seen:none': e((d) => [`Nobody saw it. ${d.place} keeps its secrets, which is the only thing it does well.`], ['Perfect crime. Not that it was a crime.']),
  'crime_seen:camera': e((d) => [d.drone ? `${d.drone} turns its lens toward the commotion and does not look away. Somebody is going to watch this later.` : `A camera in the corner pans around and locks on. Its red light blinks in a way that feels personal. ${d.cams} on this side of ${d.place} alone.`], ["I'm sure it's a flattering angle."]),
  'crime_seen:people': e((d) => [`${d.witnesses} ${Number(d.witnesses) === 1 ? 'person sees' : 'people see'} Blackbird go for ${d.victim}. ${d.gun ? 'The gunshots are the kind of detail people remember.' : 'There are no cameras, but there are phones.'}`], ["They're just admiring the technique."]),
  'crime_seen:both': e((d) => [`Blackbird goes for ${d.victim} in full view: ${d.witnesses} witness${Number(d.witnesses) === 1 ? '' : 'es'} and a camera that has not blinked since. ${d.gun ? 'The gunshots help no one.' : ''}`], ['Good lighting, at least. This will cut together nicely.']),
  'bystander:intervene': e((d) => [`${d.npc} (${d.role}) steps in front of ${d.victim}. "That is enough." It is not enough. It is just beginning.`, `${d.npc} drops what {they} {is} holding and comes for Blackbird. Official business, apparently.`], ['Aw. Another fan who wants to meet me.']),
  'bystander:join': e((d) => [`${d.npc} (${d.gang || d.role}) has known ${d.victim} for years. {They} roll{s} up {their} sleeves.`, `${d.npc} does not like seeing ${d.victim} get hit. {They} pick{s} up the nearest heavy thing.`], ['More the merrier. Technically.']),
  'bystander:call_cops': e((d) => [`${d.npc} holds up a handset and says three words into it: "Neo Protective Division." The line crackles. Nobody has ever been this fast.`, `${d.npc} has the NPD on the line before the second punch lands.`], ['Snitches get stitches. Eventually.']),
  'bystander:flee': e((d) => [`${d.npc} takes one look and heads for the door. {They} {is} not going to be around to testify. {They} {is} going to be around, later.`, `${d.npc} drops behind the nearest surface and does not come back up for a while.`], ['Smart. I would run too. If I were {them}.']),
  'bystander:film': e((d) => [`${d.npc} has {their} phone up already. The clip of Blackbird and ${d.victim} is posted before the fight is finished.`], ["Camera loves me. I'll sign it later."]),
  'bystander:cheer': e((d) => [`${d.npc} whoops. Somebody is clearly in her corner. ${d.victim} had it coming, apparently.`, `${d.npc} raises a glass. A small crowd forms. A very small crowd.`], ['Fans. I have fans. Remember the name.']),
  'bystander:shun': e((d) => [`${d.npc} watches Blackbird hit ${d.victim} and quietly rearranges {their} opinion of her. It does not go well for her.`], ["{They} {is} just jealous."]),
  'bystander:crowd': e((d) => [`${d.count} more ${Number(d.count) === 1 ? 'person has' : 'people have'} an opinion about this. All of them are taking notes.`], ['A tough crowd. They will come around.']),
  'heat_up:npd': e((d) => [d.source === 'crash' ? `Somebody calls in the crash, and what Blackbird was driving. Police heat +${d.gain}, now ${d.level}.` : d.source === 'hijack' ? `A stolen-vehicle report goes out with Blackbird's description on it. Police heat +${d.gain}, now ${d.level}.` : d.source === 'bodies' ? `The bodies change the paperwork. Police heat is ${d.level}.` : `Someone files a report. Police heat +${d.gain}, now ${d.level}.`, d.source === 'bodies' ? `A dead body in front of witnesses is a different sort of file. Police heat ${d.level}.` : `The NPD logs Blackbird's name against the incident. Heat: ${d.level}.`], ['They are going to write me a ticket. A big one.']),
  'heat_up:atlas': e((d) => [d.source === 'hijack' ? `The Atlas fleet tracker pings a new, unauthorized driver. Atlas heat +${d.gain}, now ${d.level}.` : d.source === 'bodies' ? `Atlas security finds the bodies. Atlas heat is ${d.level}.` : `Somebody at Atlas pulls the footage. Atlas heat +${d.gain}, now ${d.level}.`], ['Corporate footage. They love me up there.']),


  // ------------------------------------------------------------------ combat
  challenge: e(
    (d) => [
      `Blackbird tells ${d.npc} (${d.role}) {their} jacket is ugly. This was the right thing to say, if she wanted a fight.`,
      `Blackbird sidles up to ${d.npc} (${d.role}) and says "You look like you wanna lose."`,
      `Blackbird bumps ${d.npc} on purpose. Twice.`,
      `"I'm Blackbird," Blackbird tells ${d.npc} (${d.role}). "I'll be your hero tonight. Hit me."`,
    ],
    ['Always wanted to see what {they} {does} with {their} hands.', "It's a personality test. For {them}."],
  ),
  'challenge:1': e((d) => [`Blackbird tells ${d.npc} (${d.role}) {their} jacket is ugly. This was the right thing to say, if she wanted a fight.`]),
  'challenge:2': e((d) => [`Blackbird sidles up to ${d.npc} (${d.role}) and says "You look like you wanna lose."`], ['Rule one: always open with confidence.']),
  'challenge:3': e((d) => [`Blackbird bumps ${d.npc} (${d.role}) on purpose. Twice.`]),
  'challenge:4': e((d) => [`"I'm Blackbird," Blackbird tells ${d.npc} (${d.role}). "I'll be your hero tonight. Hit me."`], ['Great line.']),
  'challenge:5': e((d) => [`Blackbird takes ${d.npc} (${d.role})'s drink, sips it, and sets it back down wrong on purpose.`], ["Subtle. Let's see if {they} notice{s}."]),
  'challenge:6': e((d) => [`Blackbird looks ${d.npc} (${d.role}) up and down, sniffs, and says "Corpo?" It does not matter that {they} {is} not.`], ['Never wrong.']),
  // ---- what she's setting out to do. These open a group; the result is told underneath.
  'intent:analyze': e((d) => [`Blackbird looks ${d.npc} over: shoulders, hands, how they hold a cup.`, `Blackbird squints at ${d.npc} the way a mechanic squints at an engine.`]),
  'intent:armwrestle': e((d) => [`Blackbird slaps an elbow on the table and challenges ${d.npc} to arm wrestle.`, `"${d.npc}. Arm wrestle. Loser pays." Blackbird rolls up a sleeve.`]),
  'intent:pickpocket': e((d) => [`Blackbird drifts toward ${d.npc}, hands loose and innocent.`, `Blackbird eyes ${d.npc}'s pockets with professional interest.`]),
  'intent:hack': e((d) => [`Blackbird gets a good look at ${d.npc}'s chrome and starts to wonder what is in it.`, `Blackbird decides ${d.npc} is running outdated firmware. Somebody should do something about that.`]),
  'intent:threaten': e((d) => [`Blackbird decides ${d.npc} looks like {they:npc} {has:npc} money, and that {they:npc} would be happier without it.`, `Blackbird steps into ${d.npc}'s space. Politely, at first.`]),
  // ---- influence (influence.ts): she gets somebody to want something
  'influence:persuasion_ok': e((d) => [`Blackbird lays it out for ${d.npc}: calmly, with examples. By the end, ${d.npc} is the one who thinks ${d.deed} was {their} idea.`, `Blackbird makes the case. ${d.npc} nods slowly, then faster. ${cap(String(d.deed))}, then. Obviously.`], ['Reasonable people are so easy to work with.']),
  'influence:persuasion_no': e((d) => [`Blackbird makes the case for ${d.deed}. ${d.npc} listens to all of it and is unmoved by every word.`, `${d.npc} hears Blackbird out. "No," ${d.npc} says, pleasantly, as if that finished the discussion. It does.`], ['Good argument. Wrong audience.']),
  'influence:intimidation_ok': e((d) => [`Blackbird does not raise her voice. She just stands where ${d.npc} cannot stop looking at her, and asks ${d.npc} ${d.ask}. ${cap(String(d.deed))} becomes ${d.npc}'s idea very quickly.`, `${d.npc} is told what is going to happen. ${d.npc} agrees. ${d.npc} will remember how that felt.`], ['Fear works. It also keeps.']),
  'influence:intimidation_no': e((d) => [`Blackbird leans on ${d.npc} about ${d.deed}. ${d.npc} leans right back.`, `${d.npc} looks Blackbird up and down, and does not blink. The threat lands somewhere else.`], ['That was supposed to be scarier.']),
  'influence:romance_ok': e((d) => [`Blackbird lets a compliment sit, then asks ${d.npc} ${d.ask}, as a favor, with a smile. ${d.npc} could not think of a reason to say no.`, `A hand on an arm, a look held a beat too long. ${d.npc} is suddenly very keen on ${d.deed}.`], ['I would feel bad. I do not.']),
  'influence:romance_no': e((d) => [`Blackbird tries the look, then the ask. ${d.npc} enjoys the look and declines the ask.`, `${d.npc} laughs, warmly, and shakes {their} head. Whatever that was, it was not enough for ${d.deed}.`], ['The charm works. The favor part, less.']),
  'influence:grifting_ok': e((d) => [`Blackbird tells ${d.npc} a story. It has a sick relative in it, and a deadline, and a very good reason for ${d.deed}. ${d.npc} is in tears by the end.`, `The pitch is seamless: a name dropped, a panic, a favor owed. ${d.npc} has taken on ${d.deed} before the story has quite finished.`], ['Nothing she said was true. All of it worked.']),
  'influence:grifting_no': e((d) => [`Blackbird's story about ${d.deed} has a hole in it. ${d.npc} finds the hole and puts a finger in it.`, `${d.npc} listens, then asks one question. Blackbird does not have an answer to it.`], ['The details. Always the details.']),
  'influence_pay': e(
    (d) => (d.amount ? (d.method === 'intimidation' ? [`${d.npc} counts out ${d.amount} neodollars with {their} eyes on the floor and presses them into Blackbird's hand.`] : d.method === 'grifting' ? [`${d.npc} hands over ${d.amount} neodollars and thanks Blackbird for the opportunity.`] : [`${d.npc} presses ${d.amount} neodollars into Blackbird's hand, glowing with the pleasure of having decided that for {themself}.`]) : [`${d.npc} reaches for {their} pockets and finds them empty. A look of real distress follows.`]),
    ['Money: the easiest way to say thank you.'],
  ),
  'influence_depart': e((d) => [`${d.npc} sets off to find ${d.target}, with the look of someone doing exactly what they want to do.`, `${d.npc} cracks {their} neck, nods to Blackbird and leaves. ${d.target} is going to have a bad night.`], ['Delegation. Look at me, delegating.']),
  'influence_arrive': e((d) => [`${d.npc} finds ${d.target} right here.`], []),
  // ---- errands (errands.ts): what they do once she has put it in their head. `far` marks the ones she isn't there for.
  ...errand('go_after_brawl_ok', (d) => [`${d.npc} finds ${d.target} and wades straight in. It is short. ${d.target} is on the floor.`, `${d.npc} squares up to ${d.target}, and ${d.target} ends the exchange horizontal.`]),
  ...errand('go_after_brawl_no', (d) => [`${d.npc} goes at ${d.target} and gets the worst of it. ${d.target} is still standing when it ends.`]),
  ...errand('go_after_ambush_ok', (d) => [`${d.target} never sees ${d.npc} coming. By the time ${d.target} turns round it is over.`, `${d.npc} waits out of sight, steps out behind ${d.target} and does it properly.`]),
  ...errand('go_after_ambush_no', (d) => [`${d.npc} lines up the ambush and ${d.target} turns at exactly the wrong moment. It becomes a different sort of fight.`]),
  ...errand('kiss_smooth_ok', (d) => [`${d.npc} drifts up to ${d.target}, says something low, and gets the kiss {they} came for. ${d.target} looks pleasantly stunned.`, `A look, a line, a laugh. ${d.npc} kisses ${d.target} and ${d.target} kisses back.`]),
  ...errand('kiss_smooth_no', (d) => [`${d.npc} tries a line on ${d.target}. ${d.target} gives {them} a small, kind smile, and the line goes nowhere.`]),
  ...errand('kiss_steal_ok', (d) => [d.slapped ? `${d.npc} grabs ${d.target} and kisses {them:target}. ${d.target} slaps ${d.npc} across the face afterwards. It was, on balance, worth it.` : `${d.npc} swoops in and kisses ${d.target} before either of them can think. ${d.target} does not object.`]),
  ...errand('kiss_steal_no', (d) => [`${d.npc} lunges at ${d.target}, who steps aside. ${d.npc} kisses the air, and then the wall, near enough.`]),
  ...errand('kiss_ask_ok', (d) => [`"Can I kiss you?" ${d.npc} asks ${d.target}, earnestly. ${d.target} considers it, and says yes.`]),
  ...errand('kiss_ask_no', (d) => [`"Can I kiss you?" ${d.npc} asks ${d.target}. "No," says ${d.target}, kindly. ${d.npc} nods and takes it like an adult.`]),
  ...errand('steal_car_hotwire_ok', (d) => [`${d.npc} has the panel off ${d.car} in under a minute. The engine coughs, catches, and ${d.npc} is gone. It ${d.by === 'brought' ? `pulls up where Blackbird is: ${d.dest}` : `sits waiting at ${d.dest}`}.`]),
  ...errand('steal_car_hotwire_no', (d) => [`${d.npc} crouches by ${d.car} and strips the wrong wire. The alarm starts and ${d.npc} walks away briskly, as if it were not {their} alarm.`]),
  ...errand('steal_car_smash_ok', (d) => [`${d.npc} puts a brick through the window of ${d.car} and is behind the wheel before the glass has landed. The car ${d.by === 'brought' ? `turns up where Blackbird is: ${d.dest}` : `waits at ${d.dest}`}.`]),
  ...errand('steal_car_smash_no', (d) => [`${d.npc} takes a swing at ${d.car}. The window holds. ${d.npc}'s hand does not.`]),
  ...errand('steal_car_lurk_ok', (d) => [`${d.npc} hangs about near ${d.car} until nobody is looking, then gets in like it was always {their} car. It ${d.by === 'brought' ? `rolls up beside Blackbird: ${d.dest}` : `waits at ${d.dest}`}.`]),
  ...errand('steal_car_lurk_no', (d) => [`${d.npc} loiters near ${d.car} for what feels like an hour. Someone notices the loitering. ${d.npc} leaves.`]),
  ...errand('take_deck_ask_ok', (d) => [`${d.npc} asks nicely and gets the decks. ${d.good ? 'The room likes what it hears.' : 'The room is not sure what it is hearing.'}`]),
  ...errand('take_deck_ask_no', (d) => [`${d.npc} asks for the decks. The DJ looks at ${d.npc} the way you look at a request for the safe code.`]),
  ...errand('take_deck_elbow_ok', (d) => [`${d.npc} moves ${d.dj || 'the DJ'} off the decks with a shoulder and a look. ${d.good ? 'The set is, annoyingly, great.' : 'The set is bad, and everyone can tell.'}`]),
  ...errand('take_deck_elbow_no', (d) => [`${d.npc} shoulders up to the decks and gets shoved right back. ${d.dj ? `${d.dj} does not move.` : 'The booth does not budge.'}`]),
  ...errand('take_deck_usb_ok', (d) => [`${d.npc} swaps the drive during a transition. Nobody notices until the room is hearing ${d.npc}'s playlist. ${d.good ? 'It is excellent.' : 'It is not excellent.'}`]),
  ...errand('take_deck_usb_no', (d) => [`${d.npc} plugs in a drive at the wrong moment and ${d.dj || 'the DJ'} notices a dead second of air in the middle of the set.`]),
  ...errand('buy_round_cash_ok', (d) => [`${d.npc} slaps ${d.amount} neodollars on the bar and buys the room a round, with a toast. The crowd raises its glass to someone named Blackbird.`]),
  ...errand('buy_round_cash_no', (d) => [`${d.npc} goes to buy the room a round, pats {their} pockets, and finds nothing in them.`]),
  ...errand('buy_round_tab_ok', (d) => [`${d.npc} orders for the whole room and puts it on a tab that does not exist. The bartender doesn't check. The room toasts Blackbird.`]),
  ...errand('buy_round_tab_no', (d) => [`${d.npc} tries to put a round for the room on a tab. The bartender knows the tabs. ${d.npc} leaves without the round.`]),
  ...errand('tag_wall_tag_ok', (d) => [`${d.npc} drops a quick tag on the wall by ${d.place} and is gone before it has finished dripping.`]),
  ...errand('tag_wall_tag_no', (d) => [`${d.npc} shakes the can. The can is empty. ${d.npc} looks at the wall as if it were to blame.`]),
  ...errand('tag_wall_piece_ok', (d) => [`${d.npc} spends a long minute on a proper piece. It is better than anyone expected, ${d.npc} included.`]),
  ...errand('tag_wall_piece_no', (d) => [`${d.npc} starts an ambitious piece on the wall by ${d.place}, and then the lines go wrong and it turns into a drip.`]),
  ...errand('karaoke_sing_ok', (d) => [`${d.npc} takes the karaoke mic and sings with feeling. The room claps, mostly.`]),
  ...errand('karaoke_sing_no', (d) => [`${d.npc} takes the mic and finds the key about a third of the way through the chorus. It is not the song's key.`]),
  ...errand('karaoke_belt_ok', (d) => [`${d.npc} takes the mic, closes {their} eyes and belts it. The whole bar goes quiet and then loud.`]),
  ...errand('karaoke_belt_no', (d) => [`${d.npc} goes for the big note. The big note goes for ${d.npc}. Somebody is pouring a drink in sympathy.`]),
  'errand_balk': e((d) => [`${d.seen ? '' : 'Elsewhere, '}${d.npc} thinks about what Blackbird asked for a while, and decides it was a stupid idea after all.`, `${d.seen ? '' : 'Elsewhere, '}${d.npc} has second thoughts at the door and goes home.`]),
  'errand_giveup': e((d) => [`${d.seen ? '' : 'Elsewhere, '}${d.npc} has had enough of that errand and quits it.`, `${d.seen ? '' : 'Elsewhere, '}${d.npc} gives up on Blackbird's errand. Some things are not worth a third try.`]),
  'influence_backup': e((d) => [`${d.npc} falls in beside Blackbird before ${d.foe} has finished squaring up.`, `${d.npc} cracks {their} knuckles and takes the other side of ${d.foe}.`], ['Nobody fights alone who has a friend with a grudge.']),
  'influence_end:wise': e((d) => [`${d.npc} goes very quiet, then very still. It has come back to {them}, all of it: the story, the hole in it, who told it.`, `Somewhere in the middle of ${d.npc}'s day, the story stops adding up. ${d.npc} looks up. Looks for Blackbird.`], ['Right. Time to be somewhere else.']),
  'intent:flirt': e((d) => [`Blackbird sidles over to ${d.npc}.`, `Blackbird picks a line and heads for ${d.npc}.`]),
  'intent:influence': e((d) => (d.method === 'intimidation' ? [`Blackbird steps up close to ${d.npc} and lowers her voice.`] : d.method === 'romance' ? [`Blackbird turns on the charm for ${d.npc}, and has a favor in mind.`] : d.method === 'grifting' ? [`Blackbird slides up to ${d.npc} with a story she has just made up.`] : [`Blackbird takes ${d.npc} aside to make a case.`])),
  'intent:pool_date': e((d) => [`Blackbird sees ${d.npc} at the pool table and racks the balls.`, `Blackbird takes a cue off the wall and nods ${d.npc} over to the pool table.`]),
  'intent:grab_cue': e(() => ['Blackbird eyes the house pool cues on the wall.', 'Blackbird has been looking at the cues on the wall for a while. They look like they want to be somewhere.']),
  'intent:darts': e(() => ['Blackbird puts money on the dartboard and picks up the darts.', 'Blackbird steps up to the oche and takes a dart.']),
  'intent:tend_bar': e(() => ['Blackbird eyes the empty stretch behind the bar.', 'Nobody asked Blackbird to work the taps. She vaults the bar anyway.']),
  'intent:panhandle': e(() => ['Blackbird finds a bit of sidewalk and sets her cup down.', 'Blackbird gets low on cash and flat on pride, and takes up a spot on the pavement.']),
  'intent:scam_mark': e((d) => [`Blackbird decides ${d.npc} is a mark and goes to work.`, `Blackbird sizes up ${d.npc} with a friendly smile and an unfriendly plan.`]),
  'intent:sell_fake_goods': e((d) => [`Blackbird opens her jacket for ${d.npc}. Inside: a very good deal.`, `Blackbird tells ${d.npc} she knows a guy. She is the guy.`]),
  'intent:sing_busk': e(() => ['Blackbird finds a corner, drops her hat, and clears her throat.', 'Blackbird takes a breath on the corner. The city is about to get a song.']),
  'intent:stump_speech': e(() => ['Blackbird finds a crate, climbs it, and clears her throat at the whole street.', 'Blackbird steps up onto something sturdy-ish. A speech is coming. Nobody asked.']),
  'intent:rally_allies': e(() => ['Blackbird gathers her crew and straightens her jacket. A speech is coming.', 'Blackbird taps her chest, then the air, then her crew. This is going to be a Moment.']),
  'intent:mirror_speech': e(() => ['Blackbird squares up to the mirror and sets her jaw. She has a few words to say to the nation.', 'Blackbird clears her throat at her reflection. The reflection looks ready.']),
  'intent:serenade_girl': e((d) => [`Blackbird takes a breath and turns toward ${d.npc}. A song is coming.`, `Blackbird decides ${d.npc} needs a song. Possibly written by Blackbird. Possibly right now.`]),
  'intent:beat_battle': e((d) => [`Blackbird squares up to ${d.npc} for a beatbox battle.`, `${d.npc} throws down a beat. Blackbird answers.`]),
  'intent:camera_blackout': e(() => ['Blackbird counts the cameras and decides one of them is going to have a nap.', 'Blackbird looks up at a camera and starts to plan its evening off.']),
  'intent:billboard': e(() => ['Blackbird eyes the billboard. It is begging for an update.', 'Blackbird has a feeling about that billboard. It is a feeling with a USB port.']),
  'intent:till': e(() => ['Blackbird slides toward the till, looking at the ceiling.', 'Blackbird takes an interest in the till.']),
  'intent:karaoke': e(() => ['Blackbird takes the mic.', 'Blackbird has added her name to the karaoke list, above everyone else.']),
  // ---- gyms: the affordance rows carry their own prose (content/gym*.ts); one entry reads it back
  gym: e((d) => [String(d.text)], (d) => (d.thought ? [String(d.thought)] : [])),
  'intent:gym': e((d) => [String(d.text)]),
  'intent:gymquick': e((d) => [String(d.text)]),
  'intent:gymfight': e((d) => [String(d.text)]),
  // ---- pawn shops: same shape (content/pawn*.ts)
  pawn: e((d) => [String(d.text)], (d) => (d.thought ? [String(d.thought)] : [])),
  'intent:pawn': e((d) => [String(d.text)]),
  'intent:pawnquick': e((d) => [String(d.text)]),
  'intent:pawnfight': e((d) => [String(d.text)]),
  'intent:pawndeal': e((d) => [String(d.text)]),
  'intent:pool': e(() => ['Blackbird racks the balls for a game with money on it.', 'Blackbird puts cash on the rail and chalks a cue.']),
  // ---- a round of a fight, as it went
  'fight_round:quiet': e((d) => [`Round ${d.round}. Nobody lands anything. ${d.left} still standing.`, `Round ${d.round}: feints, footwork, a chair that goes nowhere. ${d.left} still standing.`]),
  'fight_round:clean': e((d) => [`Round ${d.round}. Blackbird puts ${d.dealt} into ${d.to} and takes nothing back.`, `Round ${d.round}: ${d.dealt} on ${d.to}. Not a scratch on Blackbird.`]),
  'fight_round:trade': e((d) => [`Round ${d.round}. ${d.dealt} to ${d.to}, ${d.taken} back from ${d.by || 'somewhere'}. (HP ${d.hpPct}%)`, `Round ${d.round}: Blackbird deals ${d.dealt} and eats ${d.taken}. (HP ${d.hpPct}%)`]),
  'fight_round:hurt': e((d) => [`Round ${d.round}. ${d.by ? `${d.by} lands ${d.taken}` : `Blackbird takes ${d.taken}`} and she has nothing to show for it. (HP ${d.hpPct}%)`, `Round ${d.round}: Blackbird connects with nothing. ${d.taken} comes back${d.by ? ` from ${d.by}` : ''}. (HP ${d.hpPct}%)`]),
  'fight_round:down': e((d) => [`Round ${d.round}. ${d.down} ${Number(d.downCount) > 1 ? 'are' : 'is'} done.${Number(d.taken) > 0 ? ` Blackbird is out ${d.taken}. (HP ${d.hpPct}%)` : ''}${Number(d.left) > 0 ? ` ${d.left} left.` : ''}`, `Round ${d.round}: ${d.down} ${Number(d.downCount) > 1 ? 'go' : 'goes'} down.${Number(d.left) > 0 ? ` ${d.left} to go.` : ''}`]),
  fight_start: e(
    (d) =>
      DRAGON_OPEN[String(d.dragon)] ? DRAGON_OPEN[String(d.dragon)]!(d) : d.dragon === 'hera'
        ? ['Hera Mk. V turns. It takes a while, because it is the size of a district. Every light on its underbelly settles on Blackbird.']
        : d.dragon === 'artemis'
          ? [Number(d.count) === 1 ? `${d.foes} drops from the sky in a controlled fall, wings snapping open a few feet above the street. Blackbird levels her ${d.weapon}.` : `${d.count} Artemis Mk. I dragons peel off in formation and drop on Blackbird: ${d.foes}. They have clearly done this before.`]
      : d.boss
        ? [`${d.foes} unfolds from the dark. Plasma vents spool up. Ads on the underside of its wings read PROTECTING NEO, ONE CITIZEN AT A TIME.`]
        : d.count === 1
          ? [`Blackbird squares up with ${d.foe} (${d.foeRole}), ${d.weapon} in hand.`, `${d.foe} (${d.foeRole}) vs. Blackbird. Her ${d.weapon} against whatever {they:foe} {has:foe}.`]
          : [`${d.count} on one: ${d.foes}. Blackbird grips ${d.weapon}.`, `${d.foes}. They\'re all looking at her. She decides that\'s the best possible start.`],
    (d) => (d.dragon === 'hera' ? ["Oh. That's... that's a big one.", 'Okay. New plan. Same plan, but with feelings.'] : d.dragon === 'artemis' ? ['Dragon hunting! Finally!', "A real dragon. A small one, but I'll take it."] : d.boss ? ["This is it. The big one. I've been training for this. By drinking."] : ['Let\'s dance.', "I've fought worse. Slightly.", 'Okay, who wants to be famous?', 'Plan: hit them until they stop. Great plan.', 'This is basically a vacation.']),
  ),
  'fight_end:win': e(
    (d) => {
      const win = DRAGON_WIN[String(d.dragon)];
      if (win) return win(d, [Number(d.cash) > 0 ? `${d.cash} neodollars` : '', d.loot ? String(d.loot) : ''].filter(Boolean).map((x, i, a) => (i === 0 ? ` Salvage: ${x}` : x)).join(' and ') + (Number(d.cash) > 0 || d.loot ? '.' : ''));
      if (d.dragon === 'artemis') {
        const spoils = [Number(d.cash) > 0 ? `${d.cash} neodollars` : '', d.loot ? String(d.loot) : ''].filter(Boolean).join(' and ');
        return [
          `${Number(d.killed) > 1 ? `${d.killed} Artemis dragons come` : 'The Artemis comes'} down in ${d.rounds} rounds, ${Number(d.taken) > 0 ? `${d.taken} damage taken` : 'not a scratch'}. Blackbird stands on the wreckage like it's a podium.${spoils ? ` Salvage: ${spoils}.` : ''}`,
          `A tidy kill: ${d.rounds} rounds and the Artemis is a pile of hot plating. ${Number(d.taken) > 0 ? `Blackbird's out ${d.taken} HP.` : 'Blackbird is entirely unharmed.'}${spoils ? ` ${spoils}.` : ''}`,
        ];
      }
      const spoils = [Number(d.cash) > 0 ? `${d.cash} neodollars` : '', d.loot ? String(d.loot) : ''].filter(Boolean).join(' and ');
      const cost = (Number(d.taken) > 0 ? `${d.taken} damage taken` : 'not a scratch') + (Number(d.fled) > 0 ? `, ${d.fled} got away` : '');
      return [
        `${Number(d.killed) > 1 ? `${d.killed} down` : 'One down'} in ${d.rounds} rounds: ${cost}.${spoils ? ` Spoils: ${spoils}.` : ''}`,
        `Blackbird wins. ${d.rounds} rounds, ${cost}.${spoils ? ` She helps herself to ${spoils}.` : ''}${d.puppy ? ' Sprocket barks a victory bark.' : ''}`,
        `It ends the way it was always going to. Blackbird is standing. (${d.rounds} rounds, ${cost}.)${spoils ? ` ${spoils}, now hers.` : ''}`,
      ];
    },
    (d) => d.dragon === 'artemis' ? ['I killed a dragon. A real dragon! The small kind, but still.', "That's DRAGON-SLAYER on the business card, now.", 'Mount that scale over the bar.'] : ['Easy. I barely warmed up.', 'Another one for the highlight reel.', 'Hero: 1. Idiots: a lot.', 'Somebody write this down.', 'And that, folks, is how it is done.', "They'll tell stories about this. I'll tell them. Loudly."],
  ),
  'fight_end:flee': e(
    (d) => [`Blackbird takes ${d.taken} damage and decides discretion is the better part of valor. She bolts for ${d.to}.`, `Blackbird retreats to ${d.to}. Tactically.`],
    ['Strategic withdrawal. They\'ll thank me later.', 'I was never running. I was just very quickly elsewhere.'],
  ),
  'fight_end:tossed': e(
    (d) => [`${String(d.foes).split(',')[0]} picks Blackbird up like laundry and puts her outside in ${d.to}. She is still holding her ${d.weapon}.`, `The fight ends with Blackbird airborne. She lands in ${d.to}.`],
    ['I was done anyway.', 'Great exit. 10/10.'],
  ),
  'fight_end:arrested': e(
    (d) => [`Handcuffs. A holding cell. A very patient desk sergeant. Blackbird gets out ${d.fine} neodollars lighter, after a stern talking-to.`],
    ["The fine's a tax on greatness."],
  ),
  'fight_end:dead': e(
    (d) =>
      DRAGON_DEAD[String(d.dragon)] ? DRAGON_DEAD[String(d.dragon)]!(d) : d.dragon === 'hera'
        ? ['Hera Mk. V does not so much attack Blackbird as happen to her. There is a flash, and then there is a smoking silhouette, and then there is a dragon continuing on its way.', 'The Hera does not break stride. Blackbird is a shadow on the pavement, and then not even that.']
        : d.dragon === 'artemis'
          ? [`The Artemis pack takes Blackbird apart in round ${d.rounds}, working in tidy formation. One of them is, somehow, still polite about it.`, `Round ${d.rounds}. ${d.killer || 'The Artemis'} lands on what's left of the cover and checks the street for further complaints.`]
      : d.boss
        ? [`The Apollo Mk. II turns Blackbird into a smoking silhouette on the Kowloon Overpass. Round ${d.rounds}.`, `Forty tons of Atlas steel and one tire iron. Round ${d.rounds}.`]
        : [`Blackbird goes down in round ${d.rounds}. ${d.killer || 'Something'} stands over her.`, `Round ${d.rounds}. It was not the heroic last stand she had imagined.`],
    (d) => (d.dragon === 'hera' ? ['...Huh.', 'I regret nothing. Mostly the part where I looked up.'] : d.dragon === 'artemis' ? ['There were THREE of them. That was just unfair.', 'Should have gone for the one on the left.'] : ['Okay, that one might actually hurt.', 'This is fine.']),
  ),
  brawl_joins: e((d) => [`${d.npcs} ${Number(d.count) > 1 ? 'jump' : 'jumps'} in. Because why not.`, `Somebody shouts "BRAWL!" and ${d.npcs} ${Number(d.count) > 1 ? 'are' : 'is'} suddenly involved.`], ['More the merrier.', "Don't worry, I take all comers."]),
  // ---- the fight on the floor: what happens on the board (tactics.ts)
  'tactic:ambush': e(
    (d) => [
      `${d.foe} never sees it coming. The ${d.weapon} goes in from behind: ${d.dmg} damage.${d.kill ? ' That is the whole fight for them.' : ''}`,
      `Blackbird slides along the wall, comes up on ${d.foe}'s blind side, and gives {them:foe} the ${d.weapon}. ${d.dmg} damage, delivered politely.`,
    ],
    ['Rule one: hit them before they stand up straight.', 'Stealth is just patience with a knife.'],
  ),
  'tactic:flurry': e((d) => [`Mantis blades out. ${d.foe} gets a quick flurry of very small cuts.`], ['Retract is more of a suggestion.']),
  'tactic:slam': e((d) => [`Blackbird shoves ${d.foe} into the nearest solid object. ${d.dmg} damage and a ringing sound.`, `${d.foe} meets a wall at speed. ${d.dmg} damage.`], ['Furniture is a weapon if you believe in it.']),
  'tactic:hazard_shove': e((d) => [`Blackbird puts ${d.foe} into the live wire on the floor. ${d.dmg} damage and a smell.`, `A shove, a spark, ${d.foe} twitching. ${d.dmg} damage.`], ['I read the room. The room had a hazard.']),
  'tactic:hazard': e((d) => (d.hero ? [`${d.who} finds the hazard on the floor the hard way.`] : [`${d.who} steps on the hazard in the floor and finds out what it is.`]), ['Watch your step. Mine, I mean. I did that on purpose.']),
  'tactic:optic_reset': e((d) => [`Blackbird sends a burst down ${d.foe}'s optic feed. ${d.foe} claws at the air in front of the eyes, seeing nothing but a very bright test pattern.`, `${d.foe}'s lenses reboot into pure static. ${d.foe} swings at where the room used to be.`], ['Have you tried turning your eyes off and on again?']),
  'tactic:gun_jam': e((d) => [`Blackbird pings ${d.foe}'s weapon. The safety flips itself on and the trigger goes soft.`, `${d.foe}'s gun locks up with a cheerful little error tone.`], ['Please insert a different problem.']),
  'tactic:limb_lock': e((d) => [d.arm ? `Blackbird freezes ${d.foe}'s chrome arm mid-gesture. It hangs there like a coat rack.` : `Blackbird locks ${d.foe}'s leg actuators. ${d.foe} lurches, a statue learning to walk.`], ['Have you tried not moving?']),
  'tactic:pain_spike': e((d) => [`Blackbird fires a pain spike down ${d.foe}'s neural link. ${d.foe} makes a sound like a modem dying.`, `A burst of feedback hits ${d.foe} where the chrome meets the nerves. ${d.foe} staggers.`], ['Nothing personal. Okay, a little personal.']),
  'tactic:rewrite': e((d) => [`Blackbird rewrites ${d.foe}'s orders in three keystrokes. It turns, looks around, and picks a new enemy.`, `${d.foe} blinks twice and changes sides. Its new motto is, evidently, "whatever she says".`], ['Hello, new friend. Say hello to the old ones.']),
  'tactic:hot_wire': e(() => ['Blackbird reaches into the getaway car from across the room. Its engine coughs, thinks, and decides not to.', 'The key still works. The car does not. Blackbird would like to apologize to nobody.'], ['Cars love me. Cars just do not always show it.']),
  'tactic:overclock': e((d) => [`Blackbird pushes ${d.ally}'s clock speed past the number on the sticker. It starts to hum like a kettle.`], ["It'll be fine. It'll be hot, but fine."]),
  'tactic:door_lock': e(() => ['Every door in the building thunks shut at once. Nobody is leaving. Nobody is arriving.', 'Blackbird seals the doors with a gesture and a smile. The room has become a very small world.'], ['Stay for dessert.']),
  'tactic:lights_out': e(() => ['The lights go out. Everyone in the room becomes extremely sure about where they are not.', 'Darkness drops. Muzzle flashes light the room for half a second at a time and miss.'], ['Close your eyes. It is easier.']),
  'tactic:turret_takeover': e((d) => [`${d.foe} swivels slowly, thinks about it, and starts shooting whoever is nearest. Its new employer is Blackbird.`], ['Good boy. Good, terrifying boy.']),
  'tactic:hack': e((d) => [d.robot ? `Blackbird pings ${d.foe}'s controller from across the room. It locks up and starts playing a jingle.` : `Blackbird jacks ${d.foe}'s chrome from across the room. ${d.foe} stops mid-swing, confused about its own hand.`], ['Behind every great hero is a firewall I just walked through.']),
  'tactic:intimidate': e(
    (d) => [`Blackbird gives ${d.foe} The Look. ${d.foe} remembers a prior engagement elsewhere.`, `${d.foe} meets her eye, counts the odds, and starts looking for a door.`],
    ['It is called presence.', 'Never underestimate a good squint.'],
  ),
  'tactic:overwatch': e((d) => [`Blackbird sets up behind cover and waits. ${d.foe} steps into the open; the ${d.weapon} does the talking.`], ['Patience. I have it. In short bursts.']),
  'tactic:leap': e(() => ['Hydraulic calves, one hop, and Blackbird is across the room before anyone reacts.'], ['Landing was not included. I planned that.']),
  'tactic:retreat': e((d) => [`Blackbird is at ${d.hpPct}% and doing the math. She starts backing towards the exit.`, `Blackbird breaks off and heads for the door, tactically.`], ['Strategic repositioning. Toward the exit. Quickly.']),
  'foe_flees:ran': e((d) => [`${d.foe} loses interest in the fight and goes out the door at speed.`, `${d.foe} (${d.role}) decides {they:foe} {has:foe} somewhere else to be.`], ['Yeah. Run.']),
  'foe_flees:scared': e((d) => [`${d.foe} takes one look at Blackbird and bolts for the nearest exit.`], ['{They:foe} always know{s:foe}.']),
  'foe_flees:thrown_out': e((d) => [`Blackbird shoves ${d.foe} through the door and onto the pavement.`, `${d.foe} leaves the fight through the exit, not entirely of {their:foe} own choosing.`], ['Out. Door is that way.']),
  'reinforce:law': e((d) => [`Boots in the doorway: ${d.npcs} ${Number(d.count) > 1 ? 'arrive' : 'arrives'}, on the other side.`, `${d.npcs} ${Number(d.count) > 1 ? 'push' : 'pushes'} through the door with badge-shaped intentions.`], ['Oh good. More company.']),
  'reinforce:backup': e((d) => [`${d.npcs} ${Number(d.count) > 1 ? 'hear' : 'hears'} the noise and ${Number(d.count) > 1 ? 'come' : 'comes'} in swinging.`, `Friends of the other side: ${d.npcs} ${Number(d.count) > 1 ? 'show' : 'shows'} up late.`], ['Fine. The more, the faster the story gets told.']),
  'ally_down': e((d) => [`${d.name} goes down in the middle of the floor and does not get back up.`], ['That was a good one. They were a good one.']),
  'injury:broken_leg': e(() => ['A leg gives out with a sound like a snapped pipe. Blackbird has a broken leg.'], ["It's just a leg. I have another one."]),
  'injury:cracked_ribs': e(() => ['Cracked ribs. Every breath now is a negotiation.'], ["Breathing's overrated."]),
  'injury:fried_optics': e(() => ['Her left optic sparks and fizzles. Half of Neo goes monochrome.'], ["Fashionable. Retro even."]),
  'injury:concussion': e(() => ['A hard hit to the head. Her vision wobbles. Her thoughts, if possible, wobble faster.'], ['I see two exits. Which one is real?']),
  level_up: e((d) => [`Blackbird reaches level ${d.level}. Her ${d.stat} ticks up. The upgrade is not visible. It feels visible.`, `Level ${d.level}. Something in her chrome clicks. Her ${d.stat} improves.`], ["I'm leveling up. This is how it begins.", 'More power. Same sass.']),
  equip: e(
    (d) => [d.slot === 'weapon' ? `Blackbird trades up from ${d.old} to ${d.item}${d.unstable ? '. It is humming at a frequency that makes her teeth itch' : ''}.` : `Blackbird straps on ${d.item}. Tough.`],
    (d) => [d.unstable ? 'What could possibly go wrong?' : 'Upgrade. Finally.'],
  ),
  monitored_death: e((d) => [`${d.npc} was wearing about half a mil in monitoring implants. {Their} last heartbeat pinged ${d.groups} separate groups, all of them looking at Blackbird now.`], ["It's fine. I'm only sweating a little."]),
  dragon_confront: e((d) => [`Blackbird strides onto the Kowloon Overpass and points whatever she is holding at the sky. The Apollo Mk. II, ${d.npc}, descends.`], ['Today is the day. I can feel it.']),
  dragon_notices: e((d) => [`Overhead, ${d.npc} banks and swings its head toward Blackbird. A speaker clears its throat: "CITIZEN, YOU ARE IN VIOLATION OF CONTENTMENT."`], ["Hi. Nice wings."]),
  'rob_till:success': e((d) => [`Blackbird empties the register for ${d.amount} neodollars while the bartender's back is turned. It takes a coordinated effort and a decoy napkin.`], ['It\'s not stealing. It\'s redistribution.']),
  'rob_till:caught': e((d) => [`${d.npc}'s hand lands on Blackbird's shoulder. "That's the till." {They} {is} very calm. It is worse.`], ["Just counting it for {them}."]),
  blackout: e((d) => [`Blackbird's memory skips. When it resumes, she is in ${d.place} with fewer neodollars (${d.lost} fewer) and a lot more feelings.`, `Blackbird wakes up, somehow, in ${d.place}. Missing: ${d.lost} neodollars.`], ["Time moves strangely, in bars.", "Last thing I remember is a really good song."]),
  'ambush:npd': e((d) => [`Sirens. Three patrol drones drop out of the dark and an NPD squad (${d.count} officers) fans out. Blackbird's heat is ${d.heat}. "Don't move," says the lead officer, in a voice that suggests the lead officer would prefer she did.`], ['They always show up for the good stuff.']),
  'ambush:npd_drone': e((d) => [Number(d.count) > 1 ? `Two NPD patrol drones peel off a streetlight and fall in behind Blackbird, red lamps blinking. "You are in violation of several things," one chirps. Heat: ${d.heat}.` : `An NPD patrol drone drops out of the neon haze, stun-net launcher whirring. "You are wanted for questioning," it says. Heat: ${d.heat}.`], ['Just drones. Heat that low gets you the budget version.', 'They sent a hovering parking meter. I am insulted. A little.']),
  'lay_low:restroom': e((d) => [d.dropped ? `Blackbird sits on the lid of a stall door that says OPEN 24H, feet up, and listens to the sirens go by. Slowly, they stop looking. Heat: ${d.level}.` : `Blackbird hides in the restroom, counting tiles. The sirens are still out there. So is the heat (${d.level}).`], ['Nobody has ever found anybody in a bathroom stall. That is the Neo way.', 'Patience. The best weapon is no one knowing where you are.']),
  'lay_low:arcade': e((d) => [d.dropped ? `Blackbird disappears into the Halo's basement arcade, plays three rounds of a game from the last century, and lets the heat cool. Heat: ${d.level}.` : `Blackbird hunkers down in the basement arcade, feeding quarters to a machine she does not like. Heat: ${d.level}.`], ['I am simply a gamer. A gamer who is not wanted.', 'High score, low profile.']),
  'lay_low:crawlspace': e((d) => [d.dropped ? `Blackbird folds herself into the maintenance crawlspace among the pipes and the pigeons, and waits for the city to forget her. Heat: ${d.level}.` : `Blackbird waits in the dark of the crawlspace. Something drips. The heat does not (${d.level}).`], ['Glamorous? No. Effective? Slightly.']),
  'lay_low:home': e((d) => [d.dropped ? `Blackbird stays in, curtains drawn, and lets the storm blow over. Heat: ${d.level}.` : `Blackbird lies low at the place, watching the street through a gap in the blinds. Heat: ${d.level}.`], ['Home sweet hideout.']),
  'bribe_cop:paid': e((d) => [`A beat cop on the corner gets a folded envelope: ${$(d.cost)} neodollars. The report on the officer's tablet develops a typo. Heat: ${d.level}.`, `${$(d.cost)} neodollars change hands behind a news kiosk. The officer remembers seeing nothing. Heat: ${d.level}.`], ['Justice has a rate card.', 'The system works. For people with cash.']),
  'bribe_cop:refused': e((d) => [`Blackbird waves ${$(d.cost)} neodollars at an NPD patrol officer. "Is that a bribe?" the officer asks, very loudly. It is no longer a bribe, it is a situation.`], ['Wrong cop. Right idea.', 'Everyone has a price. The officer had a different one.']),
  'bribe_cop:refused_fight': e((d) => [`The envelope hits the pavement and so does the officer's temper. "You're under arrest," the officer says, drawing.`], ["I got the wrong honest man. The one honest man in Neo."]),
  'fix_record:fix': e((d) => [`${d.npc} takes ${$(d.cost)} neodollars, taps two keys, and a chunk of Blackbird's rap sheet goes where files go to die. Heat: ${d.level}.`], ['Madame Zero is worth every neodollar and a few more.']),
  'frame:deserved': e((d) => [`An anonymous tip, a dropped credchip in ${d.npc}'s pocket, and the sirens find a new favorite. The ${d.role} is hauled off, protesting. Heat: ${d.level}.`], ['Karma, with a little help.', '{They} had it coming. Ish. {They} had something coming.']),
  'frame:innocent': e((d) => [`The NPD gets an excellent tip about ${d.npc} (${d.role}), who did nothing. {They} {is} led away. The heat comes down to ${d.level}.`], ['I feel bad for about a second and a half.', 'Sorry, friend. It was you or me.']),
  'frame:botched': e((d) => [`Blackbird tries to pin it on ${d.npc}. ${d.npc} notices. Loudly. Heat goes up by one.`], ['It was a good frame. In theory.']),
  'frame:fight': e((d) => [`Blackbird tries to plant evidence on ${d.npc} and gets caught with her hand in {their} coat. It escalates.`], ['That is what I get for being a crook with ambition.']),
  'pursuit:bounty_pick': e((d) => [`Still ${$(d.short)} short. Blackbird thinks it over and settles on paper: ${d.npc} (${d.role}) is worth ${$(d.amount)} neodollars to the NPD, last seen at ${d.place}. She likes her chances (${d.odds}%).`, `${$(d.short)} neodollars short, and ${d.npc} (${d.role}) has ${$(d.amount)} on {their} head. Blackbird goes looking: ${d.place}, last she heard.`], ['Money with a face on it. My favorite kind.', 'A bounty is just a job where the boss is the police.']),
  'pursuit:jobs_pick': e((d) => [`Cash is tight. Blackbird decides honest work will do: ${d.npc} (${d.role}) at ${d.place} always has something that needs lifting.`, `No paper worth chasing. Blackbird heads for ${d.place}; ${d.npc} probably needs a hand with something heavy.`], ['Hard work. Disgusting. But it pays.', 'Honest labor. In this economy.']),
  'pursuit:ask_pick': e((d) => [`Blackbird has no leads and no cash. She goes to ${d.npc} (${d.role}) at ${d.place} to ask who in this city is worth money.`], ['Information is the first loot.']),
  'pursuit:sizeup_take': e((d) => [d.goal === 'cash' ? `Blackbird finds ${d.npc} (${d.role}) and sizes {them} up: ${d.odds}% odds, and a payday if she's right. She cracks her knuckles.` : `There {they} {is}: ${d.npc} (${d.role}). Blackbird sizes {them} up. ${d.odds}% by her count. Good enough.`], ['I like these odds. I like most odds.', 'Nobody ever talked themselves out of a fight like this.']),
  'pursuit:sizeup_lure': e((d) => [`Blackbird spots ${d.npc} (${d.role}), but there are too many eyes in here. She wants a quieter room.`], ["Not here. Someone's watching.", 'You do not do this in front of people. Unless you are a poet.']),
  'pursuit:sizeup_prep': e((d) => [d.goal === 'cash' ? `Blackbird looks over ${d.npc} (${d.role}) and the maths is bad: ${d.odds}%. Not today.` : `Blackbird gets a good look at ${d.npc} (${d.role}) and does not like it: ${d.odds}%. She is going to need more than a good attitude.`], ["{They} {is} bigger than I remembered. Everything is.", 'Strategic retreat. Not a retreat. A strategy.']),
  'pursuit:sizeup_wait': e((d) => [`${d.npc} is right there, and Blackbird is not in fighting shape. She bides her time.`], ['Patience. Plus a little bleeding.']),
  'pursuit:pass': e((d) => [`Blackbird crosses ${d.npc} off the list. There will be other bounties, and she likes being alive.`], ['Live to hunt another day.']),
  'pursuit:lost_trail': e((d) => [`${d.npc} isn't where Blackbird last saw {them}. The trail has gone cold.`], ['Typical. Nobody stays where you left them.']),
  'weapon_proc:crit': e((d) => [`The ${d.weapon} finds a gap in ${d.foe}'s guard. Critical hit.`, `A perfect strike: the ${d.weapon} goes exactly where it shouldn't, on ${d.foe}.`], ['Lucky? No. Practiced. Okay, a little lucky.']),
  'weapon_proc:stun': e((d) => [`${d.foe} reels, stunned. The ${d.weapon} does that.`], ['Nobody likes being tased. Not even a professional.']),
  'weapon_proc:burn': e((d) => [`${d.foe} catches fire. The ${d.weapon} is, as advertised, incendiary.`], ['And the crowd goes: ow.']),
  'weapon_proc:bleed': e((d) => [`The ${d.weapon} opens ${d.foe} up. It keeps bleeding after the fight moves on.`, `${d.foe} looks down at the red and the red looks back.`], ['They get to leave, but not cleanly.']),
  'weapon_proc:slow': e((d) => [`${d.foe} goes down on one leg and loses a step.`, `A good hit to the leg. ${d.foe} is not running anywhere fast.`], ['Hobbling is a lifestyle choice.']),
  'weapon_proc:disarm': e((d) => [`The ${d.weapon} takes ${d.foe}'s weapon out of their hand. They look at the hand. The hand looks back.`], ['Rude to hold that. Ruder to lose it.']),
  'weapon_proc:cripple': e((d) => [d.limb === 'leg' ? `The ${d.weapon} breaks ${d.foe}'s leg with a noise like a dropped bag of pencils.` : d.limb === 'arm' ? `${d.foe}'s arm folds the wrong way. The ${d.weapon} did that.` : `${d.foe} takes one in the ribs and suddenly breathing is a negotiation.`], ['That sound was not a good sound. For them.']),
  'weapon_proc:pin': e((d) => [`${d.foe} is pinned down and stays where they are. Every move would be a bad one.`, `A shot at the ground in front of ${d.foe}. They stop. They think about it.`], ['Stay. Good. Stay.']),
  'weapon_proc:knock': e((d) => [`${d.foe} gets thrown back by the ${d.weapon}, with feeling.`, `The ${d.weapon} sends ${d.foe} backwards a good distance.`], ['A free flight. They did not book it.']),
  'weapon_proc:ko': e((d) => [`The ${d.weapon} meets ${d.foe}'s skull while they were still stunned. Lights out.`], ['Skullcracker is a nice name for it. Ugly noise, though.']),
  'weapon_proc:execute': e((d) => [`A single shot from across the room and ${d.foe} is done. Nobody saw where it came from.`], ['One shot. One kill. I did say I would.']),
  'weapon_proc:blast': e((d) => [`The shot goes off like a small bomb and the people next to ${d.foe} feel it.`, `Boom. ${d.foe} and company get the blast.`], ['I regret nothing. I regret some ringing.']),
  'weapon_proc:double': e((d) => [`Two shots, one trigger pull's worth of attention. ${d.foe} gets both.`], ['Double tap. Always double tap.']),
  'weapon_proc:ricochet': e((d) => [`The shot bounces and finds ${d.foe}, who was not the target and now is.`], ['Trick shot. Do not ask me to do it again.']),
  'weapon_proc:through': e((d) => [`The shot goes through one foe and into ${d.foe}.`], ['Two for one. A fair price.']),
  'weapon_proc:deflect': e((d) => [`Blackbird swats ${d.foe}'s shot out of the air with the ${d.weapon}. The shooter looks personally offended.`], ['Bullet. Meet blade.']),
  'weapon_proc:riposte': e((d) => [`${d.foe} swings and misses; the ${d.weapon} comes back across their ribs before they have finished.`], ['You missed. I did not.']),
  'weapon_proc:cow': e((d) => [`${d.foe} takes one look at Blackbird and loses their nerve.`], ['Walk in like you own the room. Works every time.']),
  'weapon_proc:lunge': e((d) => [`Blackbird crosses the floor in one move and the ${d.weapon} is in ${d.foe} before they register it.`], ['The distance is a suggestion.']),
  'weapon_proc:whirl': e((d) => [`Blackbird spins with the ${d.weapon} out and everyone nearby feels it.`], ['Everybody. All at once. Efficient.']),
  'weapon_proc:bulldoze': e((d) => [`Blackbird goes through ${d.foe} like they were a door.`], ['Detours are for people with time.']),
  'weapon_proc:aftershock': e((d) => [`The ${d.weapon} hits ${d.foe}, and the people next to ${d.foe} get the second half.`], ['A swing with a lot of follow-through.']),
  'weapon_proc:slam': e((d) => [`The ${d.weapon} comes down on ${d.foe} like a dropped piano.`], ['Pile driver. Not a subtle name.']),
  'weapon_proc:fan': e((d) => [`Blackbird fans the hammer. ${d.foe} gets two for one.`], ['Fast hands. Faster than my judgment.']),
  'weapon_proc:whip': e((d) => [`Blackbird hits ${d.foe} with the wrong end of the ${d.weapon}. It still counts.`], ['The other end is also a weapon.']),
  'weapon_proc:suppress': e((d) => [`Blackbird pours fire at ${d.foe} until ${d.foe} stops aiming and starts ducking.`], ['They are not hitting anything while they are on the floor.']),
  'weapon_proc:spray': e((d) => [`The ${d.weapon} sweeps the room and several people find out about it.`], ['Spray, and then hope for the best.']),
  'weapon_proc:barrage': e((d) => [`Blackbird puts everything the ${d.weapon} has into ${d.foe} and the ground around them.`], ['That was the whole magazine, in the best way.']),
  'weapon_proc:mark': e((d) => [`Blackbird marks ${d.foe}. Every shot after this one is going to know exactly where to go.`], ['A dot on the forehead. It is a good dot.']),
  'last_gasp': e(() => ['The blow should have been the end of it. Blackbird is still standing on one hit point and a sense of humor.', 'It lands, and she stays up. One hit point. She will take it.'], ['Okay. Okay. Nobody say anything.']),
  'weapon_swap': e((d) => [`Against ${d.foe}, Blackbird switches to the ${d.weapon}.`, `The ${d.weapon} suits ${d.foe} better. Blackbird swaps.`], ['Right tool, right job.']),
  'scan_skies': e((d) => d.first ? [`Blackbird steps out into the open at ${d.place} and looks up. Up there, on a schedule, are the things she wants to kill. She waits.`] : [`Blackbird watches the sky over ${d.place}, hands on hips, like a very patient lightning rod.`, `Another long look at the clouds over ${d.place}. No wings yet.`, `Blackbird squints at the skyline over ${d.place} until her eyes water. Somewhere up there, a patrol is running late.`, `Blackbird lingers over ${d.place}, listening for the tell-tale hum of very expensive wings.`], ['Come on, you overpriced lizards.', 'Dragons: always late, always expensive.']),
  'pursuit:perform_pick': e((d) => [`Blackbird wants a bigger name. The best bet, by her read: ${act(d.act)}. She heads for ${d.place}.`, `Fame is ${d.fame} and climbing, or it will be. Plan: ${act(d.act)} at ${d.place}.`], ['Nobody ever got famous by staying home.', 'The people need me. They just do not know it yet.']),
  'pursuit:perform_blocked': e((d) => [`The stage is there, but ${act(d.act)} is not happening tonight. Blackbird shrugs and looks for another way to be adored.`], ['Their loss. Honestly.']),
  'pursuit:dragon_apollo': e((d) => [`Blackbird has done the maths and likes it. She is done with the small stuff: ${d.npc} is next.`], ['The big one. At last. Mom would be so confused.']),
  'pursuit:dragon_sizeup_take': e((d) => [d.count ? `The sky fills with wings: ${d.npc}. Blackbird reads the odds (${d.odds}%) and decides it is a good day.` : `Blackbird looks up at ${d.npc} and does the maths: ${d.odds}%. She lets herself smile.`], ['Hello, big lizard. I am your replacement.']),
  'pursuit:dragon_sizeup_prep': e((d) => [d.count ? `Dragons overhead (${d.npc}). The odds are ${d.odds}%, which Blackbird respects in the way you respect a cliff.` : `${d.npc} looms. ${d.odds}%. She will need a lot more than a good attitude.`], ['Not yet. But soon. Maybe.']),
  'pursuit:dragon_sizeup_wait': e((d) => [`There is a dragon, and Blackbird is bleeding. She decides the dragon can wait. The dragon is not told this.`], ['Patience. And a bandage.']),
  'goal_new:idle_fame': e((d) => [`Nothing on her mind, and plenty of time to fill. Blackbird decides, for no good reason, to get famous (${d.amount} fame, for starters).`, `Blackbird wakes up to herself and sets a goal: the whole city knowing her name, or at least ${d.amount} fame's worth.`], ['I should be a star. I would be so good at being a star.']),
  'goal_new:idle_dragon': e(() => [`Blackbird looks up at the dragons that patrol Neo and makes a decision. She is going to put one in the ground.`, `The sky belongs to Atlas. Blackbird would like it back. She starts hunting cyberdragons.`], ['I mean, someone has to. Why not the one with the tire iron?']),
  'goal_done:famous': e(() => [`Blackbird has her fame, or enough of it. People recognize her in line for noodles. She tolerates it with enormous dignity.`], ['They know my name. Now to make them say it properly.']),
  'goal_done:slain': e(() => [`A dragon is down. Atlas will bill her for the wing. Blackbird will frame the scale.`], ['One for the wall.']),
  'goal_done:apollo': e(() => [`The Apollo is dead. Blackbird stands in the ruins of a forty-ton security product and thinks about breakfast.`], ['Nobody believes me. That is the best part.']),
  'sing_busk:tips': e((d) => [`Blackbird plants herself on the sidewalk and sings, no instrument, no net. A crowd finds her. ${d.amount} neodollars land in the hat.`, `A street corner, a song, a hat. By the last chorus there are ${d.amount} neodollars in it and three people filming.`], ['Voice of an angel. A mildly criminal angel.', 'I should have done this years ago.']),
  'sing_busk:complaint': e(() => ['Blackbird is mid-chorus when someone decides this is a noise violation. A patrol notes her name.'], ['Art is always a crime somewhere.']),
  'sing_busk:heckled': e(() => ['Blackbird sings. A man across the street sings back, louder and worse. Someone throws a noodle.'], ['Everyone is a critic. Everyone is also a noodle thrower.']),
  'sing_busk:ignored': e(() => ['Blackbird sings her heart out on the corner. Nobody stops. A pigeon looks on with something like pity.'], ['Tough crowd. Tougher pigeon.']),
  'stump_speech:rousing': e((d) => [Number(d.level) >= 8 ? 'Blackbird climbs a crate and the street turns to look. She says four sentences, one of them about the rent, and a surprising number of people clap.' : 'Blackbird stands on a crate and says some things about Neo. Heads turn. A few people nod, startled to find they agree.', 'From a crate on the sidewalk Blackbird tells the street what it deserves. A small crowd forms, and somebody films it. Her name travels a block further than she does.'], ['Give me a bigger crate.', 'They listened. They actually listened.']),
  'stump_speech:crowd': e((d) => [`Blackbird climbs a crate and gives the street a speech about ${Number(d.level) >= 8 ? 'exactly what it is missing' : 'how things could be'}. ${Number(d.count) > 1 ? `${d.count} of the people listening` : d.who} decide(s) on the spot to go and start ${d.deed}.`.replace('decide(s)', Number(d.count) > 1 ? 'decide' : 'decides'), `From a crate on the sidewalk Blackbird tells the street what it is capable of. ${d.who}${Number(d.count) > 2 ? ' and the rest' : ''} hear it. By the end of it they are already on their way, ${d.deed}.`], ['Give them an idea and they will walk into walls for it.', 'I did not even have to ask twice.']),
  'billboard_speech:crowd': e((d) => [`The billboard is hers, so Blackbird uses it: a full minute of her voice and her face over Strand Street, telling Neo what it is capable of. ${d.count} of the people looking up do not just clap. They go off ${d.deed}, together, with a look in their eyes.`, `Blackbird does not just hijack the billboard, she addresses the city from it, and the street answers. ${d.who}${Number(d.count) > 2 ? ' and a whole crowd' : ''} spill off the kerb, already ${d.deed}.`], ['One speech. A crowd that wants what I want.', 'Atlas built the biggest megaphone in Neo. I borrowed it.']),
  'stump_speech:complaint': e(() => ['Blackbird is mid-sentence on a crate when a drone drifts down: "UNLICENSED ASSEMBLY." A patrol notes her name.'], ['A rally needs a permit. A revolution does not.']),
  'stump_speech:heckled': e(() => ['Blackbird makes her point about the city. A man across the street makes his point about her mother. Something wet hits her shoulder.'], ['Every great orator started with a heckler. Mine just also threw a noodle.']),
  'stump_speech:ignored': e(() => ['Blackbird addresses the street. The street keeps walking. A vendor gives her a thumbs up, but he is also selling something.'], ['Tough crowd. Saving the good stuff.']),
  'rally:great': e((d) => [Number(d.count) > 1 ? `Blackbird speaks, and ${d.names} stop what they are doing to listen. By the end they are on their feet, fists up, ready to take on Neo itself.` : `Blackbird speaks to ${d.name}, and it is the best speech of her life. ${d.name} is on their feet, burning to go.`, `It is one of those speeches. Blackbird does not even remember the words. ${d.names} will, and they are not tired anymore.`], ['I should be doing this for a living.', 'Did I just do that? I just did that.']),
  'rally:good': e((d) => [`Blackbird gives ${d.names} a proper speech about why they are here and who they are. They straighten up. Somebody says "hell yeah", quietly.`, `A few well-aimed words from Blackbird, and ${d.names} look like they could take on a building.`], ['Morale: handled.', 'That is how you do it.']),
  'rally:flat': e((d) => [`Blackbird gives ${d.names} a speech. There is a long pause at the end. ${d.name} says "...nice".`], ['The second half was stronger.']),
  'rally:flop': e((d) => [`Blackbird loses the thread of her own speech in front of ${d.names}. The words "and also" are used eleven times. Nobody is inspired.`], ['I do not want to talk about it.', 'Let us never bring that up again.']),
  'mirror_speech:rough': e(() => ['Blackbird gives the mirror a speech about destiny and the working poor. She loses her place twice, and starts over twice. The mirror keeps listening.', 'Blackbird rehearses a speech to her reflection. Her hands do not know where to go. By the third take, they do.'], ['I was born for this. Eventually.', 'Natural orator. Very natural.']),
  'talk_speech:win': e((d) => [Number(d.count) > 1 ? `Blackbird raises both hands and starts talking before anyone swings: who they work for, who pays them, who will be sorry. ${d.npc} lowers a weapon. The others slowly do the same, and they leave.${Number(d.heat) ? ' The word goes round that she is not worth the trouble.' : ''}` : `Blackbird holds up a hand and talks, calmly, about all the ways this could go. ${d.npc} listens, thinks it over, and leaves.${Number(d.heat) ? ' The word goes round that she is not worth the trouble.' : ''}`], ['I talked my way out of it. The hard way.', 'Words. They work, sometimes.']),
  'talk_speech:great': e((d) => [`Blackbird plants her feet and talks, and something happens: ${d.npc} stops, and so does everyone behind ${d.npc}. It is the speech of her life, delivered to people who came to hurt her. They go quiet, then go.${Number(d.heat) ? ' By morning, there is a rumour that she is one to leave alone.' : ''}`], ['They came to kill me and left as fans. Close enough.', 'Put it on a poster.']),
  'talk_speech:fail': e((d) => [`Blackbird starts to talk ${d.npc} down. ${d.npc} listens for one sentence, then backhands her mid-clause. So much for rhetoric.`, `"Gentlemen, if I could just —" ${d.npc} is not a gentleman. A fist ends the sentence.`], ['The first line was strong. The second needed work.', 'In my defence, it was a risky opening.']),
  'billboard_speech:speech': e((d) => [`The billboard is hers, so Blackbird uses it: a full minute of her voice and her face over Strand Street, telling Neo exactly what it is and what it could be. People stop in the road. Somebody starts clapping, and it spreads.`, `Blackbird does not just hijack the billboard, she addresses the city from it. Strand Street is silent and then, slowly, it is not.`], ['Sixty seconds. Forty thousand views.', 'I do not need a stage. I need a signal.']),
  'billboard_speech:flop': e(() => ['Blackbird opens with "People of Neo" and runs completely out of things to say. Five seconds of dead air sit above Strand Street. Atlas cuts her off to advertise noodles.'], ['I had notes. I left them somewhere.', 'Quiet. The city is shocked into silence by that, I guess.']),
  'mirror_speech:doubt': e(() => ['Blackbird starts another speech to the mirror and hears it: the \'um\', the cracked pause, the hand that does not know what to do. She stares at her reflection, and the reflection stares back, not impressed. She lies awake over it.', 'Blackbird delivers the speech again. Third time through, she can hear every flaw in it. So can the mirror. Her eyes are heavy and her chest is not.'], ['I am not good at this. I am TERRIBLE at this.', 'Everybody heard that. Everybody. Even the toilet.']),
  'mirror_speech:orator': e(() => ['Blackbird addresses the cracked mirror like it is a stadium. She pauses at exactly the right place. Her reflection is moved.', 'Blackbird delivers a speech to her reflection that could end a war, or at least a very long meeting. She holds the pause. The mirror weeps, cracks notwithstanding.'], ['Say what you like, I am a great orator.', 'Who talks like that? A person with a gift.', 'The world would be better if it just did what I said, eloquently.']),
  'crash_gig:stole_the_show': e((d) => [`Blackbird strolls on stage during ${d.npc}'s set, takes the mic out of a hand that was not ready, and owns the room. ${d.amount} neodollars come flying. ${d.npc} is, after a second, delighted.`], ['Excuse me, I am the headliner now.', 'Technically that was crashing. Spiritually it was destiny.']),
  'crash_gig:tossed': e((d) => [`Blackbird jumps on stage, grabs the mic, and is on the floor of ${d.to} within the verse. ${d.npc} did not appreciate the collaboration.`], ['Critics. They will want my autograph in a decade.']),
  'crash_gig:flop': e((d) => [`Blackbird hops onstage mid-song with a big idea that does not survive contact with the audience. ${d.npc} lets her finish. Barely.`], ['Okay. That was a lot of confidence.']),
  'serenade_girl:swoon': e((d) => [`Blackbird sings softly, only for ${d.npc}, in a crowded room that goes quiet. ${d.npc} does not look away.`, `A slow song, a long look. ${d.npc} is, by every measure, undone.`], ['It is the voice. It is always the voice.', 'Music: a weapon of last resort, deployed first.']),
  'serenade_girl:cringe': e((d) => [`Blackbird serenades ${d.npc}. It is, politely, a lot. ${d.npc} looks for the exit.`], ['She loved it. She is just very quiet about it.']),
  'guitar_duel:won': e((d) => [`Blackbird and ${d.npc} trade licks, each one nastier than the last. In the final bar, hers is the one the room remembers.`], ['I do not so much play as win.']),
  'guitar_duel:lost': e((d) => [`Blackbird takes on ${d.npc} on guitar and learns exactly how much she has left to learn.`], ['{They} had a better guitar. Probably. Definitely.']),
  'backlot_set:rave': e((d) => [`Behind the Pharaoh, Blackbird borrows a speaker and cranks a set for the lot full of punks. They dance like it is the last night in Neo. ${d.amount} neodollars, mostly in coins.`], ['The best crowd in the city: young, broke, and furious about it.']),
  'backlot_set:dead_speaker': e(() => ['Blackbird drops the bass behind the club. The speaker coughs, shudders, and dies. The kids give a polite round of applause for the attempt.'], ['The speaker is not a professional. I am. Allegedly.']),
  'beat_battle:won': e((d) => [`Blackbird and ${d.npc} go head to head with only mouths. Hers is the faster mouth. The whole bar shouts the verdict.`], ['Kick, snare, victory.']),
  'beat_battle:lost': e((d) => [`${d.npc} out-beats Blackbird so thoroughly she loses her place. The bar offers condolences.`], ['It was a good loss. Very musical.']),
  'crowd_tired': e((d) => [`${d.place} has heard a lot of Blackbird lately. The applause is polite, and a few people have gone to refill their drinks.`, `The regulars at ${d.place} clap the way people clap for a delayed train. Time to find a new stage.`], ['They are tired of me. How is that possible.', 'A good performer knows when to leave the building.']),
  // Callings: what she has decided to do with her life.
  'calling:spark': e(
    (d) => [
      `Something clicks. ${cap(String(d.why))}, and for one long second the whole city holds still. Blackbird knows what she is for. She is going to ${d.line}.`,
      `Then it happened: ${lc(d.why)}. That was all it took. Blackbird's life now has a direction, and the direction is: ${d.line}.`,
      `Blackbird stands very still, then says it out loud to nobody. She is going to ${d.line}. She does not say it as a joke.`,
    ],
    (d) => [CALLING_VOWS[String(d.id)] ?? 'This is the one.', 'I was born for this. Possibly just now, but still.', 'Funny how the whole thing turns on one moment.'],
  ),
  'calling:wound': e(
    (d) => [
      `${cap(String(d.why))}. Blackbird does not cry, she does not shout, she does not do anything at all for a while. Then she decides: she is going to ${d.line}.`,
      `Blackbird goes very quiet. Something has been taken, and she has done the arithmetic. From here on she is going to ${d.line}.`,
      `It is not a plan yet. It is a direction. Blackbird is going to ${d.line}, and nothing between here and there is going to be allowed to matter.`,
      ...(d.cause === 'brush' ? [`That was too close. Blackbird sits with her back to a wall and her heart in her throat and works out what that was for. ${cap(String(d.why))}. She is going to ${d.line}.`, `${cap(String(d.why))}. Whatever happens next, Blackbird has decided it will happen to someone else. She is going to ${d.line}.`] : []),
    ],
    (d) => [CALLING_VOWS[String(d.id)] ?? 'No more waiting.', 'This is not grief. This is a schedule.', 'I will carry this until I put it down. Or until it puts me down.'],
  ),
  'calling:whim': e(
    (d) => [
      `Blackbird wakes up certain. No reason, no event, nothing at all: ${d.line}. That is what she is going to do with her life.`,
      `Out of nowhere, in the middle of a perfectly ordinary night, Blackbird knows. She is going to ${d.line}. She has no idea where it came from.`,
      `Blackbird stops mid-stride and decides her whole life. ${cap(String(d.line))}. Just like that.`,
    ],
    (d) => [CALLING_VOWS[String(d.id)] ?? 'It was just there.', 'No signs. No portents. Just: yes.', 'I would explain, but it is obvious.'],
  ),
  'calling:sequel': e(
    (d) => [
      `That was never the end of it. ${cap(String(d.why))}, Blackbird sets herself something bigger: ${d.line}.`,
      `A finished dream is only a better view of the next one. Blackbird is going to ${d.line}.`,
    ],
    (d) => [CALLING_VOWS[String(d.id)] ?? 'Now it starts.', 'Smaller dreams were a warm-up.'],
  ),
  'calling_beat:q1': e((d) => [`A quarter of the way to it: Blackbird is going to ${d.line}. (${d.count} so far, out of ${d.goal}.) She considers this the warm-up.`], ['A start. A very good start.', 'Warm. I am just getting warm.']),
  'calling_beat:q2': e((d) => [`Halfway. ${d.count} down, ${d.goal} to go, and Blackbird has begun to talk about it in the past tense. She is going to ${d.line}.`], ['Halfway is a place you only stand once.', 'If I stop now it was all for nothing, so I will not stop now.']),
  'calling_beat:q3': e((d) => [`Three quarters of the way to it. ${d.count} of ${d.goal}. Blackbird can see the end of it from here, and the end of it can see her.`], ['Almost. Almost, almost.', 'I can smell it.']),
  'calling_waver': e((d) => [`It has been a while since anything came of it, and Blackbird notices she has stopped saying it out loud. She is going to ${d.line}. Probably.`, `Some nights the thing she is for feels further off than others. Blackbird is meant to ${d.line}. Tonight it feels a little like homework.`], ['Rest. Just resting.', 'The calling is patient. I am patient. We are patient.']),
  'calling_crisis': e((d) => [`Blackbird tries to remember why she was going to ${d.line}, and cannot. It is gone. She stands in the neon with a hole where it was.`, `Quietly, without any ceremony, she stops. She was going to ${d.line}. She does not know any more who she was doing it for.`], ['Well. That was a whole thing.', 'There will be another one. There is always another one.']),
  'calling_done': e(
    (d) => [
      `It is done. Blackbird ${d.line}. It took ${$(d.beats)} beats and everything she had, and she stands there for a long time not knowing what to do with her hands.`,
      `${cap(String(d.line))}: done. The city goes on exactly as before, except in all the places where it does not.`,
    ],
    ['I did it. I actually did it.', 'Write it on something. Not a small something.'],
  ),
  'goal_new:calling': e((d) => [`Blackbird works out what her life needs next. New objective: ${d.goal}. (${cap(String(d.why))}.)`, `For the Calling, a step: ${d.goal}. ${cap(String(d.why))}.`], ['One thing at a time. This one.', 'It is a long road. I brought snacks.']),
  'advice_ask:calling': e(
    (d) => [`Blackbird stops dead in the street and taps her earpiece. "Lab. I think I know what I'm for. I'm going to ${d.line}. You with me?"`, `"Lab," says Blackbird, in the voice of a woman who has just seen God. "I'm going to ${d.line}. Say yes."`],
    ['It is a big decision. I like having it witnessed.', 'I am asking out of respect. The answer is yes.'],
  ),
  'advice_taken:calling': e(
    (d) => (d.pick === 'no'
      ? [`The lab says not that one. Blackbird looks at the thing she was for a moment ago, and puts it down. Gently. For now.`]
      : [`The lab says yes. Blackbird does not even pretend to have been unsure.`, `"Go for it," says the lab. Blackbird takes a breath that she has been saving her whole life.`]),
    ['Good. That settles it. That was never in doubt.', 'A staff member who believes in me. Rare.'],
  ),
  'ambush:atlas': e((d) => [`Black vans, matte-black armor, no insignia but the Atlas logo stitched on every sleeve. A Helix retrieval team (${d.count}) steps out of the dark.`], ['A real hero has real enemies. Welcome to my fan club.']),
  banned: e((d) => [`${d.npc} blocks the door of ${d.place ?? 'the Rusty Halo'}. "You're banned." Blackbird\'s name has been on the wall since Tuesday.`], ["Banned? I've never even been..."]),
  security_closes_in: e((d) => [`${d.npc} and the rest of Neon Pharaoh security close in around Blackbird, tapping stunners against their palms.`], ["I can hear them coming. Flattering."]),
  raid: e((d) => [`NPD cruisers screech to a halt outside ${d.place ?? 'the Rusty Halo'}. A crackdown on ${d.crackdown} is on, and the cops want someone to be guilty of it.`], ["Surprise inspection? I love surprises."]),
  raid_fine: e((d) => [`The cops write a ticket for ${d.fine} neodollars and leave. Nobody asks what it was for.`], ['Tax on greatness. Again.']),
  mugging: e((d) => [`A shadow detaches from the wall. ${d.count === 1 ? 'A mugger steps' : 'Two muggers step'} out into the neon, knives out. "Your money or your life." Blackbird considers this a negotiation.`], ["They picked the wrong hero."]),
  'drone:spots': e((d) => [`${d.npc} locks on to Blackbird, red optic whirring. "UNAUTHORIZED GREATNESS DETECTED."`], ['Oh good. XP.']),
  'drone:scan': e((d) => [`${d.npc} sweeps a scanner over Blackbird, beeps, and notes the incident for her file. Her file is getting long.`], ["I'm sure it's a flattering file."]),
  stray_bottle: e((d) => [`The gang brawl across the room sends a bottle spinning into Blackbird's shoulder: ${d.hit} damage.`], ['Not even in the fight yet. That is some range.']),
  gang_brawl: e((d) => [`Across the bar, ${GANGS[String(d.g1)] ?? d.g1} and ${GANGS[String(d.g2)] ?? d.g2} look at each other too long. Chairs start flying. The gang war has reached the Halo.`], ["That looks fun. Let me see how I can help."]),
  brawl_over: e(() => ['The brawl burns itself out. A bartender sweeps up something that used to be a tooth.'], ['Missed it. Next time.']),
  join_brawl: e((d) => [`Blackbird vaults the bar and joins the gang war uninvited, on whichever side hits her first: ${d.foes}.`], ['Fashionable entrance.']),


  // ====================================================== deepening: allies, skills, fame, tab, chrome
  weather: e(
    (d) => {
      const w = String(d.variant);
      if (d.opening) {
        return w === 'acid_rain' ? ['Tonight in Neo: acid rain. The umbrellas have umbrellas.']
          : w === 'neon_fog' ? ['Tonight in Neo: neon fog so thick the streetlights are just rumors.']
          : ['Tonight in Neo: a heatwave. The whole city smells like warm circuitry.'];
      }
      if (w === 'acid_rain') return [Number(d.hit) ? `The acid rain finds a gap in her jacket. ${d.hit} damage, a little sizzle.` : 'Acid rain keeps falling. Somewhere, a gutter hisses.'];
      if (w === 'neon_fog') return ['The neon fog rolls in, turning every sign into a halo. Nobody can see anything beyond ten feet. Good for sneaking.'];
      return ['The heat is oppressive. The ads on the buildings are visibly sweating.'];
    },
    (d) => (d.opening ? ['Perfect weather for heroics.', 'Rain? Fog? Heat? I can work with all of it.'] : []),
  ),
  skill_up: e((d) => [d.title ? `Blackbird's ${d.skill} reaches level ${d.level}. Verdict: ${d.title}.` : `Blackbird's ${d.skill} reaches level ${d.level}.`, `${d.skill}: level ${d.level}.${d.title ? ` ("${d.title}")` : ''} Practice, apparently, works.`], ["I'm a natural. A natural who practices a lot.", 'Look at me, getting better at things.']),
  'companion_joins:kids': e(() => ["The Backlot Kids fall in behind Blackbird like a bad decision with a following. They're hers now. They have opinions about her fashion."], ['Look at that. I have a gang. A gang of punks. Wholesome-ish.']),
  companion_joins: e((d) => [`${d.name} joins Blackbird's side (${d.kind}).`], ['The team is growing.']),
  companion_leaves: e((d) => [`${d.name} wanders off. Loyalty, it turns out, expires if you don't check on it.`, `${d.name} has had enough of Blackbird's schedule and goes elsewhere.`], ['They were holding me back anyway.']),
  companion_lost: e((d) => [`${d.name} takes one hit too many and goes still. Blackbird holds what's left for a moment. She is not crying.`, `${d.name} is gone. The fight took them.`], ["It's the smoke. It's definitely the smoke."]),
  'ally_assist:puppy': e((d) => [`${d.name} launches itself at ${d.foe}'s ankle with a bite rated for diamond.`, `${d.name} the robot puppy trips ${d.foe} at the perfect moment.`], ['Good boy. Best boy.']),
  'ally_assist:drone': e((d) => [`${d.name} swoops in and zaps ${d.foe}. A little speaker chirps "CUSTOMER SATISFACTION: HIGH".`, `${d.name} flies a surveillance pass and also opens fire.`], ['My drone. Mine.']),
  'ally_assist:kids': e((d) => [`The Backlot punks pelt ${d.foe} with bricks and rhythmic abuse.`, `A hail of bricks and a sick beat from the Backlot punks hits ${d.foe}.`], ['I taught them everything they know. Which was a lot.']),
  'ally_assist:pigeon': e((d) => [`${d.name} dive-bombs ${d.foe}'s face. The attack is unsanitary, and effective.`], ['Nature is a weapon.']),
  'ally_assist:scrapper': e((d) => [`${d.name} steps in front of Blackbird and takes the hit with a sound like a dropped dumpster.`], ['Tank buddy. Perfect.']),
  'ally_assist:hacker': e((d) => [`${d.name} jacks ${d.foe}'s weapon from across the room. It jams and starts playing music.`], ["Behind every great hero is a hacker. Who is paid less."]),
  'ally_assist:courier': e((d) => [`${d.name} throws a scalding coffee at ${d.foe}. The delivery was on time.`], ["Fast. Accurate. Probably unionized."]),
  'antic:puppy': e((d) => [`${d.name} digs through a pile of nothing and comes back with ${d.item}. Tail motor whirring.`], ['Good dog. Great dog. Dog of the year.']),
  'antic:drone': e((d) => [`${d.name} hovers over Blackbird and starts playing a thirty-second loop of elevator music at full volume. It's Atlas's favorite song.`], ['I love that it has taste.']),
  'antic:kids': e((d) => [`A few of the kids vanish into the crowd and return with ${d.amount} neodollars and a kind of pride. Blackbird decides not to ask.`], ["They'll go far. Preferably out of the city."]),
  'antic:pigeon': e((d) => [`${d.name} drops something shiny at Blackbird's feet. It's ${d.amount} neodollars. The pigeon looks smug.`], ['A pigeon is paying me. This is the high point.']),
  'antic:scrapper': e((d) => [`${d.name} wanders over to a vending machine, rewires it, and pays Blackbird ${d.amount} neodollars in coins.`], ['Efficiency.']),
  'antic:hacker': e((d) => [`${d.name} siphons ${d.amount} neodollars from a stranger's account, then orders a pizza to the stranger's house as an apology.`], ['Criminal, kind, and beautiful.']),
  'antic:courier': e((d) => [`${d.name} finishes a side-delivery and hands Blackbird ${d.amount} neodollars. "Cut's yours. Don't tell my boss."`], ["I love working with professionals."]),
  scout_warning: e((d) => [`${d.name} (${d.kind}) tugs at Blackbird's sleeve a moment before the trouble arrives. She takes a quiet side route. Nobody notices.`, `A warning from ${d.name}: trouble ahead. Blackbird slips away from it.`], ['I knew that. I totally knew that.']),
  scout_find: e((d) => [`${d.name} leads Blackbird to a hidden way into ${d.to}. Nobody had told her that was there.`], ['Good eye. Better than mine. Do not tell anyone.']),
  'dj_set:killer': e((d) => [`Blackbird slides behind the decks and drops a set so good the room forgets to hate her. Tips: ${d.amount} neodollars. DJ Kilobyte does a slow clap.`, `The Neon Pharaoh loses its mind. Blackbird has the crowd. The crowd has her. Tips: ${d.amount} neodollars.`], ["I was born for this. The stage. The adoration. The not-dying."]),
  'dj_set:b2b': e((d) => [`Blackbird and ${d.npc} go back-to-back. The bass shakes dust off the ceiling. The crowd chants her name. Tips: ${d.amount} neodollars.`], ['Two legends, one booth. This is the one for the history books.']),
  'dj_set:flop': e(() => ['Blackbird takes the decks and the beat falls apart in a way that makes an entire room wince in sync. A drink hits the booth. Another hits her.'], ["It's avant-garde. They'll get it in ten years."]),
  'dj_set:wrong_file': e(() => ["Blackbird queues up her set. It's the NPD tip line hold music, at maximum volume, for four minutes. Three districts' worth of car alarms respond."], ["That wasn't my playlist. That was somebody else's. Somebody evil."]),
  'dj_set:blocked': e((d) => [`${d.npc} blocks the booth with {their} body. "You touched the decks last time." {They} {is} not going to let it go.`], ['Some people hold a grudge like a vinyl collection.']),
  'beatbox:jam': e((d) => [`Blackbird drops a beat for ${d.npc} and the other street punks. Within a minute they're trading rhymes. A friendship forms, and a questionable record deal.`, `Blackbird and ${d.npc} trade beats under a flickering sign. The punks lose it. Respect, earned.`], ["I'm good with a crowd. Or at least, with beats."]),
  'beatbox:laughed': e((d) => [`Blackbird beatboxes for ${d.npc}. The result is closer to a leaking tire than a drum. ${d.npc} laughs until {they} {has} to sit down.`], ["It's a very difficult genre."]),
  'beatbox:robbed': e((d) => [`While Blackbird is mid-beatbox, ${d.npc} lifts ${d.amount} neodollars from her pocket. Nobody stops the music.`], ['Great crowd work. Terrible for my wallet.']),
  'talk_down:win': e((d) => [`As ${d.npc} reaches for her collar, Blackbird opens with a beatbox solo. Against all odds it is... good. ${d.npc} nods. The other guards nod. She is let go with a "don't do that again".`], ['I will NEVER do that again. Probably. It worked so well.']),
  'talk_down:fail': e((d) => [`Blackbird tries to beatbox her way out. ${d.npc} listens to the whole thing with no expression. "Done?" {they} ask{s}. She is not done. It happens anyway.`], ['That always works in my head.']),
  'jack:drone': e((d) => [`Blackbird jacks into ${d.npc}'s core, scrubs its Atlas loyalty and gives it a nickname. It bobs in the air, now hers. A new friend, with weapons.`], ['A drone. A friend. A flying camera with a grudge. Tell me that is not heroism.']),
  'jack:scrapper': e((d) => [`Blackbird rewrites ${d.npc}'s priority list. It puts down its wrench, looks at her, and walks over to stand behind her like a very tall dog.`], ['It likes me. It likes ME.']),
  'jack:fail': e((d) => [`Blackbird tries to jack ${d.npc}. The core pushes back. Her skull rings. ${d.npc} turns toward her, optic spinning.`], ['Some drones are just not friendly.']),
  'recruit:juno': e((d) => [`${d.npc} closes her laptop and slides out of the booth. "Fine. You've got a hacker. Don't make me regret it." Blackbird does her best not to.`], ["She's coming with me. On purpose."]),
  'pigeon:befriend': e((d) => [`Blackbird offers noodles to the pigeon on the roof. It takes them, eyes her, and decides. ${d.name} lands on her shoulder like a tiny, judgmental feathered knight.`], ['A pigeon is a good friend. They know everything.']),
  'pigeon:snub': e((d) => [`The pigeon on the roof eats the noodles, looks Blackbird up and down, and flies off with a hint of disdain.`], ['Cold. But fair.']),
  buy_noodles: e((d) => [`${d.npc} hands over a bowl of mystery-meat noodles for 5 neodollars. Blackbird does not ask what the meat is a mystery of.`], ['Food is just fuel. Mysterious fuel.']),
  eat_noodles: e(() => ['Blackbird eats the noodles. Whatever was in them, it worked. Mostly.'], ['Heroes need carbs. And possibly an exorcist.']),
  settle_tab: e((d) => [Number(d.left) > 0 ? `Blackbird pays ${d.amount} neodollars toward her tab at the Halo. She still owes ${d.left}. ${d.npc} nods.` : `Blackbird settles her tab in full: ${d.amount} neodollars. ${d.npc} looks faintly disappointed to be getting paid.`], ['Responsible. I just surprised myself.']),
  analyze: e((d) => d.variant === 'clear' ? [`Blackbird reads ${d.npc} like a spec sheet. It is mostly ${d.stat}.`, `One look at ${d.npc} and the numbers line up: heavy on ${d.stat}.`] : d.variant === 'hunch' ? [`Blackbird gets a hunch about ${d.npc}. Probably ${d.stat}. Probably.`] : [`Blackbird looks ${d.npc} over and learns nothing. A bit of everything, maybe. A balanced person is hard to read.`], (d) => [d.variant === 'blank' ? 'Annoyingly well-rounded.' : 'Everyone has a type. Even you.']),
  camera_blackout: e((d) => d.variant === 'success' ? [`Blackbird gets into the camera mesh at ${d.place} and puts a lens to sleep. Its red light dies like a bored firefly.`, `One quick override and a camera at ${d.place} goes dark. The feed shows a very convincing empty hallway.`] : [`Blackbird pokes at the camera mesh at ${d.place}. It pokes back with a loud, accusatory beep.`, `The cameras at ${d.place} reboot in her face. Nothing is down, but something now knows her name.`], (d) => [d.variant === 'success' ? 'Smile. Oh wait, you cannot. You are off.' : 'Technically, it was never my fault.']),
  power_cut: e((d) => d.variant === 'success' ? [`Blackbird finds the grid junction for ${d.place} and pulls it. Every light in the neighborhood goes out, and every camera with it.`] : [`Blackbird reaches for the grid at ${d.place} and gets a spark in the teeth. The lights stay on, annoyingly.`], (d) => [d.variant === 'success' ? 'Now we can talk.' : 'Technically it was a very small shock.']),
  alarm_spoof: e((d) => d.variant === 'success' ? ['Blackbird sends three patrol cars to a laundromat on the other side of the city. The laundromat is, understandably, concerned.', 'A very convincing false alarm lights up across town. The heat on Blackbird drops a little.'] : ['Blackbird tries to spoof an alarm and gets a very polite call back asking for her badge number.'], (d) => [d.variant === 'success' ? 'Sorry, laundromat.' : 'I will try the other number.']),
  billboard: e((d) => [d.variant === 'success' ? "Blackbird hijacks the Atlas billboard. For ninety seconds, the sign over Strand Street shows her face, tilted heroically, above the words YOUR HERO. Neo watches." : "Blackbird tries to hack the billboard. It fights back with a four-second burst of Atlas jingles and a jolt through her gloves."], (d) => [d.variant === 'success' ? "That's my best angle. They got it right." : 'It only works if you commit.']),
  'implant:install': e((d) => [`${d.npc} installs ${/^[aeiou]/i.test(String(d.implant)) ? 'an' : 'a'} ${d.implant} for ${d.cost} neodollars. "${d.pitch}" The catch, noted in small print: ${d.catch}`], ['Chrome is forever. Or until it breaks.']),
  'implant:poor': e((d) => [`${d.npc} pitches a ${d.implant}, ${d.cost} neodollars. Blackbird does not have that. ${d.npc} offers a pamphlet. She takes the pamphlet.`], ["I'll be back. With money. Eventually."]),
  'implant:reject': e((d) => [`Blackbird's body rejects the ${d.implant}. She wakes up on the sink with a concussion and a half refund.`], ["I'm sure it's just a minor allergy."]),
  'rescue:intervene': e((d) => [`Blackbird sees ${d.npc} cornered and does what a hero does: moves in without a plan.`], ['A damsel. In distress. Is this a dream?']),
  'rescue:thanks': e((d) => [`${d.npc} is safe. She presses ${d.amount} neodollars on Blackbird${d.item ? ' and hands her ' + d.item : ''}. "I owe you." Blackbird has never heard that sentence before.`], ['This is the heroics part. THIS is what I came for.']),
  'rescue:thanks_joins': e((d) => [`${d.npc} brushes herself off, hands Blackbird ${d.amount} neodollars${d.item ? ' and ' + d.item : ''}, and decides to stick around. "I know every back alley in Neo. You're going to need me."`], ["A sidekick. Finally. Someone to explain my jokes to."]),
  'rescue:failed': e((d) => [`The rescue falls apart. ${d.npc} slips away in the chaos, muttering something not at all grateful.`], ["She'll thank me later. In spirit."]),
  'damsel:scene': e((d) => [`In a nearby alley mouth, two muggers have cornered a ${d.role}, ${d.npc}. "Don't," she's saying. They are absolutely going to.`], ['Is that... a call to adventure?']),
  'damsel:self_rescue': e((d) => [`${d.npc} swings her bag, kicks one mugger in the knee, and walks away without a glance back. The street has moved on.`], ["She didn't even need me. That's fine. I'm not hurt."]),
  'intel:madame': e((d) => [`${d.npc} takes 150 neodollars and tells Blackbird CINDERJAW's secret: its customer-service routine can be interrupted, throwing off its targeting. "Say 'speak to a manager.' Don't ask."`], ['Intel! A hero with intel. I feel prepared.']),
  'intel:terminal': e(() => ["Blackbird cracks a Helix terminal and finds a maintenance file for CINDERJAW. There's a backdoor: its targeting stutters if you interrupt its customer-service greeting. She reads it twice."], ['It all comes down to whether the dragon hates a bad review.']),
  'intel:terminal_fail': e(() => ["The Helix terminal locks Blackbird out with a very polite warning. Atlas's interest in her goes up a notch. She gets a mild shock for her trouble."], ["Some computers have no sense of humor."]),
  'intel:scientist': e((d) => [`${d.npc}, desperate for a friendly face, rambles: "...and you can't tell the dragon, but if you interrupt its greeting, the targeting loops." Blackbird nods and pretends this was an interview.`], ['Free intel. Gifts from the nerds.']),
  'poker:win': e((d) => [`Blackbird sits in on a game in the backroom and walks out ${d.amount} neodollars up. Nobody can explain how.`], ['I have a good poker face. Mostly because I forget to make any other.']),
  'poker:cheat_win': e((d) => [`Blackbird peeks at the deck through a borrowed implant and rakes in ${d.amount} neodollars. The dealer's eyebrow twitches.`], ['Cheating is just aggressive math.']),
  'poker:lose': e((d) => [`Blackbird goes all-in on a pair of twos. The room goes silent. She loses ${d.amount} neodollars.`], ['I was bluffing. At myself.']),
  'poker:caught': e((d) => [`${d.npc} flips a card out of Blackbird's sleeve with two fingers. "Cheating at my table." The room clears.`], ['That was a gift. For my sleeve.']),
  'serenade:viral': e((d) => [`Blackbird stands on the Overpass and beatboxes at a forty-ton cyberdragon. Someone records it. It's the most-viewed clip in Neo for about nine seconds. The dragon does not appreciate the artistry.`], ['Music soothes the savage beast. Or it should.', 'The beast has opinions about my flow.']),
  pet_ally: e((d) => [`Blackbird takes a moment for ${d.name}. ${d.kind === 'pigeon' ? 'The pigeon allows one finger of contact.' : 'It does wonders for morale.'}`], ["Best team in Neo. Smallest, probably."]),
  repair_ally: e((d) => [`Blackbird patches up ${d.name} for ${d.cost} neodollars of tape, wire and swearing. It works. Mostly.`], ["I'm basically a doctor. A doctor of tape."]),
  'order_drink:tab': e((d) => [`Blackbird orders ${d.drink}. She is a little short, so ${d.npc} puts it on her tab, now at ${d.tab} neodollars.`], ["It's fine. I'm good for it. Future me is rich."]),
  'order_drink:fame': e((d) => [`${d.npc} slides Blackbird ${d.drink} without being asked. "On the house, hero." Word gets around.`], ['That is what fame tastes like.']),
  'go:recognized': e((d) => [`The bouncer takes one look at Blackbird and lifts the rope without a word. People whisper as she walks in. She hears her name, mostly spelled right.`], ['Fame. This is what it is for.']),
  fan: e(
    (d) => [
      [`A fan stops Blackbird and asks for a selfie. She poses. The fan hands her ${d.amount} neodollars "for the legend".`],
      [`Somebody in the crowd shouts "BLACKBIRD!" and gets a fistbump. They press ${d.amount} neodollars into her hand, whispering "dragon".`],
      [`A teenager has Blackbird's face tattooed on their forearm. They want an autograph. She signs it. They tip ${d.amount} neodollars.`],
      [`Someone has written a ballad about Blackbird. It's... a ballad. They sing it. They get ${d.amount} neodollars for the courage.`],
    ][Number(d.variant) - 1] ?? [`A fan gives Blackbird ${d.amount} neodollars.`],
    ["I'm an icon. Ask anyone. Ask these people.", 'This is all part of the plan.'],
  ),
  ad: e(
    (d) =>
      d.variant === 'blocked'
        ? ['An Atlas ad flickers to life overhead. Blackbird\'s ad-blocker silences it before it can speak. A little sign flashes: "THIS CONTENT NOT AVAILABLE TO PEOPLE WITH TASTE".']
        : [
            ['A billboard: ATLAS PROTECTION — YOUR SAFETY IS OUR PROPERTY.'],
            ['A drone drifts by, projecting: ATLAS: FEAR LESS (ON A SUBSCRIPTION).'],
            ['A floating ad: "HAVE YOU BEEN DRAGON-ED? ASK YOUR LAWYER ABOUT NOTHING."'],
            ['The side of a building: ATLAS: ORDER IS A GROWTH INDUSTRY.'],
            ['A talking ad on the corner: "THAT FEELING IN YOUR CHEST? THAT\'S COMPLIANCE."'],
            ['An ad on the wet pavement: "DRAGON-SAFE™ NEIGHBORHOODS: NOW 20% LESS DRAGON-Y."'],
            ['A holo-sign: "BECAUSE THE WORLD NEEDS PROTECTING. FROM YOU."'],
            ['An ad in the rain: "ATLAS CARES. (THIS MESSAGE IS MANDATORY.)"'],
          ][Number(d.variant) - 1] ?? ['An Atlas ad blares something about contentment.'],
    ['Propaganda. Cute.', "I'd take that more seriously if it wasn't so well-lit."],
  ),
  'collector:paid': e((d) => [`${d.npc} materializes next to Blackbird with the quiet menace of someone holding a clipboard. She pays ${d.amount} neodollars. The tab is closed.`], ['The tab. Gone. Like it never happened.']),
  'collector:threat': e((d) => [`${d.npc} pins Blackbird to the bar and tells her what a ${d.amount}-neodollar tab looks like from {their} side. {They} {is} not talking about forgiveness.`], ["We can work this out like adults. By which I mean, I'll hit {them}."]),
  'laser_tag:champion': e((d) => [`Blackbird wins her third arena match. The NEON KNIGHTS present her with a blinking vest and a trophy made of bottle caps. She is, officially, a champion of something. ${d.amount} neodollars prize money.`], ['A champion. Of laser tag. In a basement. Frame this.']),
  defib: e(() => ["Blackbird's heart stops. Her emergency defibrillator doesn't. A blue jolt and she's up, gasping, a little bit dead and a lot annoyed."], ['Okay. That was. Hm. Okay. Don\'t do that again.']),
  'recognition:charmed': e((d) => [d.mood === 'cold' ? `${d.npc} sees Blackbird and turns away. Whatever charm was there, it has aged poorly.` : `${d.npc} lights up. "Oh, it's you. You were charming." Blackbird is, at this point, very charming.`], ['People remember me. Mostly the good bits.']),
  'recognition:kissed': e((d) => [`${d.npc} waves at Blackbird with a small, knowing smile. Last time is still on {their} mind. And on the jukebox.`], ["What can I say? I leave an impression."]),
  'recognition:beaten': e((d) => [`${d.npc} sees Blackbird and touches the sore spot where she hit {them}. "You," {they} say{s}. That's all.`], ["{They} {has} my respect. A little."]),
  'recognition:shakedown': e((d) => [`${d.npc} sees Blackbird and clutches {their} wallet, visibly, with both hands.`], ['No hard feelings. A little hard feelings.']),
  'recognition:puppy': e((d) => [`${d.npc} sees Blackbird and does a slow, deliberate head-count. {They} {is} looking for a robot puppy. {They} {doesnt} find it. {They} find{s} her.`], ['Sprocket is in a good place. With me. Which is a good place.']),
  'recognition:till': e((d) => [`${d.npc} sees Blackbird and very slowly locks the till.`], ['What a suspicious individual.']),
  'recognition:cheater': e((d) => [`${d.npc} sees Blackbird and her expression freezes. "Oh, it's you." She does not say anything else. She says it very loud.`], ['I explained myself. It was a good explanation.']),
  'recognition:killer': e((d) => [`${d.npc} sees Blackbird and moves, very casually, six feet away. "No trouble," ${d.npc} says. Nobody has asked.`], ['{They} know{s}. {They} really do know.']),
  'recognition:skylight': e((d) => [`${d.npc} sees Blackbird and points up at an imaginary skylight. "Hey, did you fall through that?" Several people laugh.`], ["It was an entrance. A dramatic entrance."]),
  'recognition:pickpocket': e((d) => [`${d.npc} sees Blackbird and casually checks every pocket {they} {has}.`], ['Cautious. That is how you stay alive in this city.']),
  'recognition:generic': e((d) => [`${d.npc} gives Blackbird a nod that says "I remember you".`], ['Neo remembers.']),

  // ====================================================== the dragon family
  'dragon_flight:artemis': e(
    (d) => {
      const lead = Number(d.mark) === 2
        ? Number(d.count) === 1
          ? `An Artemis Mk. II slides in over ${d.place} flying slow circles, optics tilted down. It isn't patrolling. It is looking for someone in particular.`
          : `Two Artemis Mk. II dragons take up stations over ${d.place} and begin, methodically, to quarter the district. They are not here for the district.`
        : Number(d.count) === 1
        ? `An Artemis Mk. I banks low over ${d.place}, red scanner sweeping the district. One patrol dragon, built for speed. Alone, for now.`
        : Number(d.count) === 2
          ? `Two Artemis Mk. I dragons slide in over ${d.place} wingtip to wingtip, searchlights crossing like scissors.`
          : `Three Artemis Mk. I dragons arrive over ${d.place} in a formation clearly designed to be a lot.`;
      return [d.warned ? `${lead} Blackbird was warned in time. She's already in the shadows.` : lead];
    },
    (d) => (Number(d.count) === 1 ? ['One? One I can do.', 'A solo dragon. Someone is feeling overconfident. Possibly me.'] : ["That's more than one. Math is my enemy tonight.", 'The thing about dragons is the plural.']),
  ),
  'dragon_flight:hera': e(
    (d) => [d.warned ? `The sky over ${d.place} goes dark. A Hera Mk. V drifts overhead, big as a city block, and Blackbird has already ducked out of its line of sight.` : `The sky over ${d.place} goes dark. A Hera Mk. V drifts in from the east, big as a city block, every car alarm in the district going off in apology. The street goes quiet in a way streets are not supposed to.`],
    ['Okay. That is not the same kind of dragon.', 'That one has weather.'],
  ),
  'dragon_pass:artemis': e(
    (d) => [d.hidden ? 'The Artemis patrol sweeps past without a glance. Blackbird exhales. Nobody saw her. This is, by her own standards, a flawless performance.' : d.left ? 'Behind Blackbird, the Artemis patrol disappears over the rooftops, shining searchlights at somebody else.' : 'The Artemis patrol finds nothing worth the trouble and moves on. Blackbird is a little offended.'],
    (d) => (d.hidden ? ['Stealth, baby.', 'I disappear like a professional.'] : ['They did not even look. Rude.']),
  ),
  'dragon_pass:hera': e(
    (d) => [d.hidden ? 'The Hera Mk. V passes overhead and the street breathes again. Blackbird stays in the doorway for an extra full minute, just to be sure.' : d.left ? 'Behind Blackbird, the Hera Mk. V drifts on across the skyline and out of sight. She does not look back. She is walking faster than she was.' : 'The Hera Mk. V drifts on, without once looking down. Blackbird does not know whether to be relieved or insulted.'],
    (d) => (d.hidden || d.left ? ['I was never worried. My hands were shaking for other reasons.', "That's the day I learned what fear looks like in the sky."] : ['It did not even notice me. Honestly, I should be thankful.']),
  ),
  'dragon_notice:artemis': e((d) => [Number(d.mark) === 2 ? 'The Artemis Mk. II stops circling. Every optic it owns swings and settles on Blackbird. "SUBJECT LOCATED. WE WERE JUST ABOUT TO LOOK FOR YOU."' : Number(d.count) === 1 ? 'The Artemis tilts, one wing dipping, scanner locking onto Blackbird with a soft electronic chirp. "PRELIMINARY CITATION ISSUED."' : 'A scanner locks onto Blackbird. Then another. The Artemis pack tilts as one. "CITIZEN: YOU ARE BEING EXAMINED."'], ['They noticed me. That is the first thing that has gone right all day.']),
  'dragon_notice:hera': e(() => ['A single huge eye in the Hera Mk. V\'s underbelly opens, and turns, very slowly, and finds her. A voice the size of a building says: "CITIZEN."'], ['Oh no. Oh, a very specific no.']),
  'dragon_engage:artemis': e((d) => [Number(d.count) === 1 ? 'Blackbird steps into the middle of the street, plants her feet, and tells the Artemis it\'s time for the best day of its life.' : 'Blackbird steps into the street and points at the Artemis pack. "Which of you wants to go first?" They do not need to choose.'], ['Dragon slayer. DRAGON. SLAYER.']),
  'dragon_engage:hera': e(() => ['Blackbird steps into the middle of the street, plants her feet, and points her weapon at a Hera Mk. V. It is not an even match. It is not, technically, a match.'], ["I've killed bigger. Probably. I've forgotten when."]),
  'dragon_hide:ok': e((d) => [d.kind === 'demeter' ? 'Blackbird ducks into a doorway and keeps her wallet shut. The Demeter drifts by, baskets swinging, collecting from nobody.' : d.kind === 'ares' ? 'Blackbird drops flat behind a rain barrel as the Ares sweeps overhead, loudspeaker working the street.' : d.kind === 'hermes' ? 'Blackbird pulls her hood down and becomes an address that does not exist. The Hermes goes on looking.' : d.kind === 'hera' ? 'Blackbird flattens herself into a doorway, behind a bin, under a tarp. The Hera passes over the top of her like a tide.' : 'Blackbird ducks behind a dumpster and holds her breath. The Artemis patrol glides over, scanner sweeping, and does not stop.'], ['Cover! Excellent cover. I am a cover professional.']),
  'dragon_hide:fail': e((d) => [d.kind === 'demeter' ? 'Blackbird ducks into a doorway. A basket swings round and taps her, gently, on the shoulder.' : d.kind === 'ares' ? 'Blackbird drops behind a rain barrel. The Ares swings its loudspeaker straight at the barrel.' : d.kind === 'hermes' ? 'Blackbird ducks behind a bin. The Hermes has a very good manifest and it lists the bin.' : d.kind === 'hera' ? 'Blackbird dives behind a bin. The bin is small, and Blackbird, as it turns out, is not.' : 'Blackbird dives behind a dumpster. A scanner pings. A knee is sticking out.'], ['I was fully hidden. They are just very good at their jobs.']),
  'dragon_gawk:artemis': e(() => ['Blackbird just stands there, mouth open, watching an Artemis patrol draw an arc across the city. Its wings leave faint afterimages.'], ['Beautiful. Terrifying. Beautiful again.']),
  'dragon_gawk:hera': e(() => ['Blackbird stands in the middle of the street, head tilted back, looking up at a Hera Mk. V. It fills the entire sky. She takes a step back, and another, without taking her eyes off it.'], ['I feel very small. This is a new feeling.']),
  'dragon_film:artemis': e((d) => [`Blackbird holds up her phone and films the Artemis patrol as it passes. The clip is posted before they are out of sight. Fame: ${Math.floor(Number(d.fame))}.`], ['This is going to do numbers.']),
  'dragon_flight:hermes': e(
    (d) => {
      const lead = Number(d.mark) === 3
        ? `${d.place} goes briefly very white. A Hermes Mk. III crosses it at a speed that makes the street's shadows jump, a cradle under its belly holding ${d.cargo}.`
        : Number(d.count) === 1
          ? `A Hermes Mk. I courier skims in over ${d.place}, a clipboard strapped to its chest and no hands to hold it. It is looking for an address.`
          : `Two Hermes Mk. I couriers swing in over ${d.place}, comparing manifests in clipped radio chirps.`;
      return [d.warned ? `${lead} Blackbird was warned in time, and has already stepped out of sight.` : lead];
    },
    (d) => (Number(d.mark) === 3 ? ['What is it carrying? Never mind. What is it CARRYING?', 'That is the fastest thing I have ever seen.'] : ['Small. Quick. Probably has a package.']),
  ),
  'dragon_flight:demeter': e(
    (d) => {
      const lead = `A Demeter Mk. ${roman(d.mark)} drifts over ${d.place}, baskets swinging, a speaker on its chest playing a harvest-festival jingle. "SUMMER DISTRIBUTION IS NOW ARRIVING IN YOUR DISTRICT."`;
      return [d.warned ? `${lead} Blackbird was warned in time, and is already behind a door.` : lead];
    },
    ['Summer distribution. In a district. Sure.', 'I have not seen one single thing distributed.'],
  ),
  'dragon_flight:ares': e(
    (d) => {
      const lead = d.screams
        ? `A sound arrives over ${d.place} before anything else does: a long, flat, rising scream from somewhere above the rooftops, and then a second, closer. Every shutter on the street starts coming down. An Ares Mk. IV is inbound. If Blackbird means to be indoors, now is when.`
        : `An Ares Mk. II settles over ${d.place}, a wedge of armor with a loudspeaker for a face. "CITIZENS: A GANG-RELATED INCIDENT HAS BEEN REPORTED. YOU ARE ALL PART OF IT."`;
      return [d.warned ? `${lead} Blackbird was warned in time and is out of its line of sight.` : lead];
    },
    (d) => (d.screams ? ['That is the sound of a bad idea arriving.', 'Okay. Inside. Inside is a good place to be.'] : ['Everyone? EVERYONE? That is a lot of gang.']),
  ),
  // ---- a dragon about the district: it comes into the street, is heard from the next one over, takes off
  'dragon_close:hermes': e(
    (d) => [d.passing ? (Number(d.mark) === 3 ? `Something white goes over ${d.place} so fast the sound arrives after it. A Hermes Mk. III. Whatever it was carrying, it was gone before anyone could see.${heads(d)}` : `A Hermes courier skims over ${d.place}, reads a few door numbers, and is gone.${heads(d)}`) : Number(d.mark) === 3 ? `A Hermes Mk. III drops into ${d.place}, cargo cradle swinging, ${d.cargo} clamped underneath. It does not stay.${named(d)}` : `A Hermes courier drops into ${d.place}, clipboard flapping, looking for a door number.${named(d)}`],
    (d) => (Number(d.mark) === 3 ? ['It is RIGHT THERE.', 'Think of the money.'] : ['A courier. Not in a hurry, for once.']),
  ),
  'dragon_close:demeter': e(
    (d) => [d.passing ? `The jingle of a Demeter Mk. ${roman(d.mark)} swells over ${d.place} and recedes.${heads(d)}` : `A Demeter Mk. ${roman(d.mark)} turns into ${d.place} at a deliberate walking pace, baskets swinging, a speaker playing its harvest jingle. It is looking at everyone, one at a time.${named(d)}${d.hidden ? ' Blackbird has already stepped out of sight.' : ''}`],
    ['Everyone is suddenly very interested in their shoes.', 'Methodical. I hate methodical.'],
  ),
  'dragon_close:ares': e(
    (d) => [d.passing ? `An Ares Mk. ${roman(d.mark)} tears across ${d.place} in a shower of sparks, loudspeaker still reading out its list, and is gone.${heads(d)}` : `An Ares Mk. ${roman(d.mark)} crashes into ${d.place}, taking a lamp post with it. "EVERYONE HERE IS A SUSPECT," it announces. "THIS IS A COURTESY."${named(d)}${d.hidden ? ' Blackbird has already found a shadow.' : ''}`],
    ['Reckless. That one is reckless.', 'It does not even look where it is going.'],
  ),
  'dragon_close:artemis': e(
    (d) => [d.passing ? `An Artemis cuts across ${d.place} on a diagonal, scanner flickering, and is on to the next street.${heads(d)}` : Number(d.mark) === 2 ? `An Artemis Mk. II drops into ${d.place} and does not take its optics off Blackbird.${named(d)}${d.hidden ? ' She had already got under cover.' : ''}` : `An Artemis sweeps into ${d.place}, red scanner raking the street from end to end.${named(d)}${d.hidden ? ' Blackbird had got out of sight in time.' : ''}`],
    (d) => (Number(d.mark) === 2 ? ['It is not looking at the street. It is looking at me.'] : ['A sweep. Stay still.']),
  ),
  'dragon_close': e((d) => [`A dragon comes into ${d.place}.${named(d)}`], ['Here we go.']),
  // ---- one she has seen before
  'dragon_recognized': e(
    (d) => [`Blackbird knows that callsign: ${d.name}. She saw it ${ago(d.nights)}${d.place ? `, over ${d.place}` : ''}${Number(d.seen) > 1 ? `, and ${Number(d.seen)} times before that` : ''}.${Number(d.fought) > 0 ? ' They have history.' : ''}`],
    (d) => (Number(d.fought) > 0 ? ['You. Again. We never did finish that.', 'Oh good. It remembers me too.'] : d.variant === 'demeter' ? ['It wants more money. It always wants more money.'] : d.variant === 'hermes' ? ['Still delivering. Still not home.'] : d.variant === 'ares' ? ['Still crashing around the place. Some things you can rely on.'] : ['I know that one. It knows I know that one.']),
  ),
  // ---- a dragon that has made a place its own
  'dragon_territory:claim': e(
    (d) => [d.family === 'demeter' ? `The Demeter sits down heavily in the middle of ${d.place}, baskets fanned. This is its street now, and it is watching the doors.` : d.family === 'ares' ? `The Ares plants itself in ${d.place} and keeps its loudspeaker trained on the junction. It has claimed the place.` : d.family === 'hermes' ? `The Hermes settles on a lamp post over ${d.place} and will not be moved. It has decided this is its street.` : `The Artemis comes to rest over ${d.place} and folds its wings. It has picked this place, and it is watching who comes in.`],
    ['It has made this place its own. Great. I am in its place.'],
  ),
  'dragon_territory:attack': e(
    (d) => [d.family === 'demeter' ? 'The Demeter does not bother to ask. "THIS STREET IS UNDER MY PROTECTION," it announces, and the barrel swings round.' : d.family === 'ares' ? 'The Ares has no list for this one. It just opens up on whoever walked into its street.' : `The ${d.family === 'hermes' ? 'Hermes' : 'Artemis'} will not have anyone on its street. It opens up without a word.`],
    ['It does not even want to talk!', 'Should not have walked in.'],
  ),
  'dragon_territory': e(() => ['The dragon has made this place its own.'], ['Not good.']),
  dying_dies: e((d) => [`${d.npc} stops moving. Nobody got there in time.`], ['That did not have to happen.']),
  'dragon_near:hermes': e(() => ['A thin whine passes over the next street along, somebody\'s package getting delivered at speed.'], ['Courier. Somewhere close.']),
  'dragon_near:demeter': e(() => ['From the next street over comes a tinny harvest-festival jingle, and under it, very quietly, the sound of people deciding not to have any money.'], ['That jingle. It is the next street over.', 'Time to be inside.']),
  'dragon_near:ares': e(() => ['Somewhere close, a loudspeaker begins to read out a list of names, and something very heavy lands on something that does not take it well.'], ['Ares. Next street. Let it keep going.']),
  'dragon_near:artemis': e((d) => [Number(d.mark) === 2 ? 'A thermal-optics whine from the next street over: an Artemis Mk. II, coming this way, as if it knew.' : 'A red scanner glow sweeps across the rooftops of the next street over.'], ['A patrol, close. Do not be on the street.']),
  'dragon_near': e(() => ['Something with wings is working the next street over.'], ['Close.']),
  'dragon_depart:hermes': e((d) => [Number(d.mark) === 3 ? 'The Hermes Mk. III is already a white thread over the rooftops, and then not even that.' : 'The Hermes tilts, finds its altitude, and is a dot over the rooftops before it has finished the thought.'], ['Gone. Good for it.']),
  'dragon_depart:demeter': e((d) => [d.here ? 'The Demeter finishes its round, lifts clear of the street, and takes the jingle with it. "THE HARVEST IS IN," it says to no one in particular.' : 'The jingle rises and fades. The Demeter lifts clear of the district, its baskets heavier than when it came.'], ['That is it for now. Until next time.']),
  'dragon_depart:ares': e((d) => [d.here ? 'The Ares, bored, finally unfolds its wings and goes straight up, shedding debris. "PEACE HAS BEEN RESTORED," it says, to a street it just broke.' : 'The Ares goes up over the rooftops, trailing its loudspeaker. "PEACE HAS BEEN RESTORED." It is the loudest thing in the district.'], ['Finally. It got bored.']),
  'dragon_depart:artemis': e((d) => [d.here ? 'The Artemis finishes its sweep and climbs out of the street in a long banked turn.' : 'The Artemis finishes its sweep and takes off over the rooftops.'], ['And they are off.']),
  'dragon_depart': e(() => ['The dragon takes off.'], ['Gone.']),
  dragon_duck: e((d) => [`Blackbird takes a quick look at the sky and goes through the nearest door, ${d.place}. Outside, something heavy goes by.`], ['Not today. Inside.']),
  'dragon_pass:hermes': e(
    (d) => [d.hidden ? 'The Hermes circles twice, finds no one to sign, and goes on its way. Blackbird comes out of her doorway looking like she has never been so good at anything.' : 'The Hermes gives up on the address and zips off with its clipboard clutched to its chest.'],
    ['Delivery failed. Mine, too, probably.'],
  ),
  'dragon_pass:demeter': e(
    (d) => [d.hidden ? 'The Demeter drifts past, baskets swinging, and does not look down. "NEXT YEAR\'S HARVEST IS SECURE," it tells nobody.' : 'The Demeter lifts off and moves on to the next street, baskets heavier than before. The jingle fades.'],
    ['It will be back. It is always back.'],
  ),
  'dragon_pass:ares': e(
    (d) => [d.left ? 'Behind her, the screaming stops. The Ares moves on to another district and, one by one, the shutters begin to go back up.' : d.hidden ? 'The Ares finishes its sweep and lifts away, reading a closing statement to an empty street. Blackbird stays under cover a long, long minute.' : 'The Ares finishes its sweep and lifts away, reading a closing statement to a street that has just been through something. "PEACE HAS BEEN RESTORED."'],
    ['Peace. Right.'],
  ),
  'dragon_notice:hermes': e(() => ['The Hermes banks, scanner chirping. "PARCEL FOR... YOU? NO. NO, SORRY. YOU WERE NOT IN."'], ['I was right here!']),
  'dragon_notice:demeter': e((d) => [`The Demeter's baskets stop swinging. A speaker clears its throat. "CITIZEN: YOU HAVE BEEN IDENTIFIED AS A CONTRIBUTOR. THIS IS A ${Number(d.mark) >= 3 ? 'SERIOUS ' : ''}OPPORTUNITY."`], ['That sounds like a bill.']),
  'dragon_notice:ares': e(() => ['The Ares swings its whole head round, loudspeaker first. "THAT ONE. YES. YOU."'], ['Why do I always get picked.']),
  'dragon_engage:hermes': e(() => ['Blackbird steps into the street and waves the Hermes down like a taxi. It lands, offended.'], ['A courier. I could do a courier.']),
  'dragon_engage:demeter': e(() => ['Blackbird walks straight at the Demeter and tells it to come and get it.'], ['Collect this.']),
  'dragon_engage:ares': e(() => ['Blackbird steps out into the road in front of the Ares and offers it a better accusation.'], ['Come on. Say it.']),
  'dragon_gawk:hermes': e(
    (d) => [Number(d.mark) === 3 ? `Blackbird watches a Hermes Mk. III cross the sky in a single clean line. Clamped under its belly: ${d.cargo}. She cannot stop thinking about it.` : 'Blackbird watches a Hermes courier hunt for a house number, circle twice, and begin again.'],
    (d) => (Number(d.mark) === 3 ? ['Whatever is in that cradle, I want it.', 'Think of what that is worth.'] : ['An honest day of work. In the sky.']),
  ),
  'dragon_gawk:demeter': e((d) => [`Blackbird watches a Demeter Mk. ${roman(d.mark)} work the street, baskets swinging, the festival jingle playing over the sound of a lot of people quietly not making eye contact.`], ['Everyone is very busy all of a sudden.']),
  'dragon_gawk:ares': e((d) => [`Blackbird watches an Ares Mk. ${roman(d.mark)} wheel over the street, loudspeaker running through accusations in alphabetical order.`], ['Alphabetical. Somebody put work into that.']),
  'dragon_film:hermes': e((d) => [Number(d.mark) === 3 ? `Blackbird gets a quarter-second of a Hermes Mk. III on her phone: a white streak, and under it, very clearly, ${d.cargo}. Fame: ${Math.floor(Number(d.fame))}.` : `Blackbird films a Hermes courier circling a rooftop looking for a door. Fame: ${Math.floor(Number(d.fame))}.`], ['Frame by frame, that is a heist waiting to happen.']),
  'dragon_film:demeter': e((d) => [`Blackbird films a Demeter Mk. ${roman(d.mark)} working the street. The jingle is on the audio, which makes it worse. Fame: ${Math.floor(Number(d.fame))}.`], ['Content. And a little bit of evidence.']),
  'dragon_film:ares': e((d) => [`Blackbird films an Ares Mk. ${roman(d.mark)} through a window. The clip goes up with the caption "DO NOT GO OUTSIDE." Fame: ${Math.floor(Number(d.fame))}.`], ['This is going to do numbers. Behind a locked door.']),
  'dragon_follow:artemis': e((d) => [Number(d.count) === 1 ? 'The Artemis Mk. II comes in over the rooftops behind Blackbird, exactly where she is. It never lost her. "WE HAVE NOT FINISHED."' : 'The Artemis Mk. II pair come in over the rooftops, one from each side, exactly where she is. They never lost her. "WE HAVE NOT FINISHED."'], ['How? HOW? I changed streets!']),
  'dragon_follow': e(() => ['The dragon finds Blackbird again.'], ['Of course it did.']),
  'dragon_chase:caught': e((d) => [`Blackbird sprints after the Hermes Mk. III and, against everything physics has to say about it, closes on it. It turns, offended, ${d.cargo} and all.`], ['I. Am. Faster. Than. A. Dragon.']),
  'dragon_chase:lost': e((d) => [`Blackbird runs after the Hermes Mk. III for four streets. By the end it is a white dot over the river. She stops, hands on knees. It was carrying ${d.cargo}.`, `Blackbird gives the Hermes Mk. III everything she has, and it does not even seem to notice. By the second block it is somewhere else entirely. ${cap(String(d.cargo))}, gone.`], ['If I had a bike. If I had ANYTHING with wheels.', 'One day I am going to catch that thing.']),
  courier_fine: e((d) => [`The Hermes tuts, prints a slip, and fines Blackbird ${d.fine} neodollars for failing to be home to receive a package that was not hers.`], ['A fine. For a parcel. That is not mine.']),
  'tithe_demand': e(
    (d) => [`The Demeter lowers itself to rooftop height. "SUMMER DISTRIBUTION HAS BEEN POSTPONED, DUE TO INSUFFICIENT PRODUCTIVITY. YOURS. THE WINTER TITHE IS ${$(d.amount)} NEODOLLARS."${Number(d.owed) > 0 ? ` It adds that this includes ${$(d.owed)} in arrears.` : ''} A basket swings open toward her.`],
    ['Insufficient productivity. Me. Sure.', 'That is a lot of money for a Tuesday.'],
  ),
  'tithe_pay:full': e((d) => [`Blackbird pays the Demeter ${$(d.amount)} neodollars into its basket. "YOUR CONTRIBUTION HAS BEEN NOTED," it says, "AND IT HAS BEEN NOTED THAT IT WAS LATE."`], ['Public safety. It sure costs a lot.']),
  'tithe_pay:short': e((d) => [`Blackbird turns out her pockets: ${$(d.amount)} neodollars, all of it. "THE REMAINING ${$(d.owed)} WILL BE CARRIED FORWARD," says the Demeter. "INTEREST APPLIES TO YOUR DISAPPOINTING PERFORMANCE."`], ['Carried forward. That has a sound to it.']),
  'tithe_pay:broke': e((d) => [`Blackbird has nothing. The Demeter studies her for a moment. "NON-CONTRIBUTOR," it says, and a small, specific shock goes through her (${d.hit} damage). "THE ${$(d.owed)} WILL BE CARRIED FORWARD."`], ['I would give it something if I had it.']),
  'tithe_haggle:win': e((d) => [`"Look," Blackbird says, "it has been a hard winter." The Demeter considers this and agrees. "THE TITHE IS REVISED TO ${$(d.amount)}. WINTER IS HARD. IT IS ALSO YOUR FAULT."`], ['I am a negotiator. A fine and noble negotiator.']),
  'tithe_haggle:fail': e(() => ['Blackbird tries a smile and a number. The Demeter plays the number back at her, slowly. "THAT," it says, "IS A THREAT TO PUBLIC SECURITY."'], ['It did not like my number.']),
  'tithe_refuse:refuse': e(() => ['"No," Blackbird says. The Demeter\'s baskets close with a clang. "REFUSAL IS A THREAT TO PUBLIC SECURITY," it announces, pleased to have the paperwork in order. A barrel swings toward her.'], ['Not one coin! Not one!']),
  'tithe_refuse:silence': e(() => ['Blackbird says nothing, which she believes is a position. "SILENCE IS NON-COMPLIANCE," says the Demeter, and the barrel comes round.'], ['I was thinking! Thinking is not a crime!']),
  'tithe_refuse:haggle': e(() => ['The Demeter\'s baskets close with a clang. Haggling, it explains, is how it all begins.'], ['I only asked.']),
  tithe_evade: e((d) => [`Blackbird walks away from the Demeter mid-sentence. It fires a single parting round into her back (${d.hit} damage). "YOUR ARREARS HAVE BEEN UPDATED," it calls after her, pleasantly. They stand at ${$(d.owed)}.`], ['Out of sight, out of debt. Right? Ow.']),
  ares_arrive: e((d) => [`The scream stops. Something very large lands where it was coming from. An Ares Mk. ${roman(d.mark)}. "THIS DISTRICT HAS BEEN IDENTIFIED AS GANG-ADJACENT. REMAIN WHERE YOU ARE."${d.standing ? ' Blackbird, who has been standing in the road for some time, remains where she is.' : ''}`], ['It is here. It is HERE.']),
  'ares_accuse:victim': e((d) => [`"${String(d.npc).toUpperCase()}: MEMBER OF THE ${String(d.gang).toUpperCase()}." ${d.npc} protests that the name means nothing to them. The Ares ${d.fate === 'dying' || d.fate === 'dead' ? 'does not hear this, and that is the end of that: they are on the ground and not getting up' : 'takes this as a confession, and that is the end of the evening'}.`], ['That poor guy just came out for noodles.']),
  'ares_accuse:hero': e((d) => [`"CITIZEN: YOU ARE A KNOWN ASSOCIATE OF THE ${String(d.gang).toUpperCase()}." Blackbird says she has never met them. "CONSORTING WITH THEM IS NO DEFENSE," says the Ares.`], ['I have not met them! I have not even HEARD of them!']),
  'ares_shelter:door': e((d) => [`Blackbird goes through the nearest door at a dead run, ${d.place}, and the shutter slams down behind her. Outside, the scream drops into something lower and more personal.`], ['Inside. Staying inside. Excellent plan.']),
  'ares_shelter:cover': e(() => ['There is no door close enough. Blackbird flattens herself into the angle of a loading bay as the scream comes down.'], ['Please be invisible. Please be invisible.']),
  ares_stand: e(() => ['Blackbird plants her feet in the middle of the street while every shutter on the block slams down around her. Somewhere above the rooftops, the scream gets louder.'], ['Come on, then. I dare you.']),
  ares_all_clear: e(() => ['The screaming stops. After a while the shutters begin to go back up. Somewhere in the next room, someone turns the radio back on.'], ['That was a lot of nothing happening to me. I love it.']),

  'dragon_film:hera': e((d) => [`Blackbird zooms in on a Hera Mk. V and films the whole sky. The clip is the most-watched thing in Neo for the next ten minutes. Fame: ${Math.floor(Number(d.fame))}. A very large eye turns.`], ['Content. Pure content. Worth it.']),

  // ====================================================== layered skills, hobbies, and things to throw
  throw: e(
    (d) => {
      const foe = String(d.foe);
      switch (d.variant) {
        case 'pool_cue':
          return [d.cop ? `As ${foe} reaches for the cuffs, Blackbird snatches a pool cue off {their:foe} belt and hurls it. ${d.skilled ? 'A shot she has made a thousand times. It lands exactly where she wanted' : 'It hits ' + foe + ' in the knee'} for ${d.dmg} damage.` : `Blackbird flings a pool cue at ${foe}. ${d.skilled ? 'She has put that shot in the corner pocket a hundred times. ' : ''}It connects for ${d.dmg} damage.`, `A pool cue sails across the room and finds ${foe}. ${d.dmg} damage. ${d.skilled ? 'All those hours at the table were for something.' : 'Mostly dumb luck.'}`];
        case 'cocktail_molotov':
          return [`Blackbird hurls a Molotov Mule. It does not so much break as bloom. ${foe} and everyone near {them:foe} is on fire: ${d.dmg} damage and a smell like a rave in a refinery.`, `The cocktail leaves her hand, ignites, and lands on ${foe}. Burn damage: ${d.dmg}. Presentation: excellent.`];
        case 'switchblade':
          return [`A chrome switchblade spins through the air and into ${foe}: ${d.dmg} damage. She was aiming for something else.`];
        case 'cleaver':
          return [`Blackbird hurls a cleaver end over end. It lands in ${foe}: ${d.dmg} damage. Somewhere, a chef weeps.`];
        default:
          return [`Blackbird lobs a broken bottle at ${foe}. ${d.dmg} damage and a good deal of glitter.`];
      }
    },
    (d) => (d.variant === 'pool_cue' && d.skilled ? ['Eight ball, corner pocket. Cop edition.', "That's what all those hours were for."] : d.variant === 'cocktail_molotov' ? ['I call it the Blackbird Special.', 'Drink responsibly. Throw irresponsibly.'] : ['Throwing things: a hero skill.', 'Always keep something to throw.']),
  ),
  grab_cue: e((d) => [`Blackbird takes a house pool cue off the wall and slips it under her jacket. ${d.npc} is busy. It's the owner's cue now it's hers.`], ["It's not stealing. It's pre-owned."]),
  'pool_date:win': e((d) => [`Blackbird racks the balls and challenges ${d.npc} to a game. She wins. ${d.npc} lets her win, or doesn't. Either way, it ends with a smile and a hand on a hip.`], ['Pool: romance with extra geometry.']),
  'pool_date:win_skilled': e((d) => [`Blackbird breaks, runs the table, and banks the eight ball with a look straight at ${d.npc}. It is the most seductive thing a cue has ever done. ${d.npc} is no longer thinking about pool.`], ["I didn't even call the shot. I called her.", 'Every hour I spent at that table. Every. Hour.']),
  'pool_date:outplayed': e((d) => [`${d.npc} runs the table in four minutes flat and holds out a hand. Blackbird pays up ${d.amount} neodollars. ${d.npc} is, if anything, charmed by how little she minded.`], ['She is amazing. I am also broke. Both facts are fine.']),
  'pool_date:scratch': e((d) => [`Blackbird sinks the cue ball on the break. ${d.npc} has a very polite look about it.`], ["It's a style. The scratch."]),
  'darts:win': e((d) => [`Blackbird throws a dart without looking, and then another. The board is happy. ${d.amount} neodollars from the pot.`], ['I wasn\'t even aiming. Which is how you aim.']),
  'darts:lose': e((d) => [`Blackbird throws three darts. One lands in the board, one in the wall, one in the ceiling. ${d.amount} neodollars gone.`, `A dart sticks in a coat rack. Another in someone's hat. Neither in the board. ${d.amount} neodollars to the house.`, `Blackbird's throwing arm is fine. Her aim has stepped out. ${d.amount} neodollars gone.`], ['The board moved. Everyone saw it.']),
  'darts:stray': e((d) => [`A dart goes wide and lands in ${d.npc}'s drink. ${d.npc} stands up slowly. ${d.amount} neodollars gone, and so is {their} patience.`], ['That is definitely their fault.']),
  'jam:band': e((d) => [`Blackbird invites herself into the green room, picks up the guitar and starts to play. The band gives her a look, then a nod, then a drummer. Within a verse they're all in. Level ${d.level} guitar, with feeling.`], ['Look at that. I have a band.', 'Is this what destiny sounds like?']),
  'jam:solo': e((d) => [`The green room is empty. Blackbird takes the guitar off its stand and plays to the couch. The couch has no notes. Level ${d.level} guitar.`], ['The acoustics are fantastic.']),
  'jam:meh': e(() => ['Blackbird picks up the guitar and plays what she hopes is a song. Somebody groans in the hallway. Someone else pretends to take a call.', 'Blackbird plucks at the guitar. It sounds like a very polite cat being strangled by a ukulele.'], ["It's lo-fi."]),
  'jam:smash': e((d) => [`Blackbird gets carried away, swings the guitar over her head, and there is a very expensive sound. ${d.npc} and the rest of the band turn around.`], ['It was a rock-and-roll moment. They get it.']),
  'jam:thrown_out': e((d) => [`${d.npc} blocks the door of the green room. "You're not welcome." Blackbird walks in anyway.`], ['The artists will understand.']),
  'gig:killer': e((d) => [`${d.npc} nods at Blackbird: "You're on." She steps onto the Neon Pharaoh's stage in front of a full house and plays like it's the last song on earth. ${d.amount} neodollars in the tip jar, and a roar.`], ["Rock and roll. I'm a rock and roll legend. Say it again."]),
  'gig:flop': e((d) => [`Blackbird steps onto the stage with the band. The first chord is not a chord. The second is not either. ${d.npc} stares at the floor. Someone throws a drink.`], ['The sound guy was out to get me.']),
  'steal_guitar:alone': e(() => ['The green room is empty. Blackbird takes the guitar off its stand, wraps it in her jacket, and strolls out like she is on her way to a concert. Which she is.'], ['I have a guitar now. This is a normal thing to have.']),
  'steal_guitar:band': e(() => ['While the band argues about a setlist, Blackbird lifts the guitar and slips out. By the time anyone notices the stand is empty, so is she.'], ['I took it. In front of them. Genius.']),
  'steal_guitar:caught': e((d) => [`Blackbird has the guitar halfway out the door when ${d.npc} says, quite calmly, "that's mine." Things escalate.`], ["It's a joint custody situation."]),
  'busk:tips': e((d) => [`Blackbird sets up on the curb, hat out, and plays. A small crowd forms. They tip ${d.amount} neodollars and a few of them even sing along.`, `On a corner, with a stolen guitar and nothing to lose, Blackbird plays something that sounds almost like a hit. ${d.amount} neodollars in the case.`], ['I could do this full time.']),
  'busk:ignored': e(() => ['Blackbird plays for ten minutes. Nobody stops. A pigeon looks at her, then looks away, deeply embarrassed.'], ['They just don\'t get it yet.']),
  'busk:complaint': e(() => ['Blackbird is mid-solo when a window slams open: "NOISE COMPLAINT, I\'M CALLING THE NPD." Four minutes later a drone arrives to confirm.'], ['Critics.']),
  'busk:stolen': e(() => ['A couple of punks on a scooter swoop by and grab the guitar out of her hands. By the time she turns around, so are they. She is left with a hat.'], ['Honestly, I respect the hustle.']),
  'cook:good': e((d) => [`Blackbird takes over the stove and plates a noodle special that makes ${d.npc} stop what {they} {is} doing. It is, honestly, good. She sets it aside, glowing.`], ["I'm a chef. A hero and a chef. What can't I do?"]),
  'cook:meh': e(() => ['Blackbird makes noodles. They are noodles. She takes them with a flourish.'], ['Gourmet, if you squint.']),
  'cook:fire': e((d) => [`Blackbird sets the stove to "ambitious" and the kitchen briefly becomes a candle. ${d.npc} comes in carrying a fire extinguisher and a grudge.`], ['Flambé. It is called flambé.']),
  'cook:kicked_out': e((d) => [`Blackbird strides into the kitchen and picks up a pan. ${d.npc} picks up a larger pan. "You're banned."`], ["It's a very big pan."]),
  eat_dish: e(() => ['Blackbird eats her own noodle special. It is shockingly good. A warm, confident energy rises through her.'], ["I'm either a chef or the food is magic. Either way."]),
  'serve_dish:swoon': e((d) => [`Blackbird slides a plated noodle special in front of ${d.npc}. ${d.npc} takes a bite, closes her eyes, and says nothing for a good ten seconds. Then: "Who ARE you?"`], ['The way to a girl\'s heart is through her stomach. And my knife work.']),
  'serve_dish:polite': e((d) => [`Blackbird presents ${d.npc} with a plated noodle special. ${d.npc} eats it, smiles, and says it is "interesting." Everyone knows what that means.`], ['She loved it. Probably. It was interesting, which is a compliment.']),
  'tend_bar:pro': e((d) => [`Blackbird vaults the bar, steals a shaker, and pours like she was born there. ${d.npc} watches, impressed, then amused. Tips: ${d.amount} neodollars.`], ['Bartender: the second oldest profession, and I am great at it.']),
  'tend_bar:lucky': e((d) => [`Blackbird jumps behind the bar and wings it. Somehow, a drink comes out that people want. Tips: ${d.amount} neodollars. ${d.npc} is concerned.`], ["Naming it 'The Blackbird.' Don't ask about the ingredients."]),
  'tend_bar:spill': e(() => ['Blackbird tries a flourish with a shaker. The shaker disagrees. Several people are now wearing a Synthahol Sunrise.'], ['Free dry-clean tip: don\'t.']),
  'tend_bar:complaint': e((d) => [`${d.npc} sips the drink Blackbird handed {them}, stares, and puts it down very carefully. "What is in this."`], ["It's a recipe. It's called 'a surprise.'"]),
  'mix:good': e((d) => [Number(d.count) > 1 ? 'Blackbird pours two Molotov Mules (the cocktail, mostly), jams rags in the tops, and tucks them into her jacket. She feels like an artist.' : 'Blackbird mixes a Molotov Mule (the cocktail, mostly), corks it with a rag, and tucks it into her jacket. It is both a drink and a threat.'], ['Cocktails: the original weapon.']),
  'mix:fail': e(() => ['Blackbird mixes a Molotov Mule with too much of the wrong thing. It makes a noise like a kettle and a small eyebrow-shaped flame.'], ['The recipe called for a LITTLE flame.']),
  'parkour:clean': e(() => ['Blackbird takes the rooftops at a run: over a vent, off a ledge, across a four-foot gap that looks wider from below. She lands on the next roof in a roll and a flourish. No one saw it. She does it again.'], ['I am a bird. I am a cat. I am gravity\'s problem.']),
  'parkour:loot': e((d) => [`Blackbird runs the rooftops and, at the end of a gap she definitely cleared, finds ${d.item} sitting in a puddle. A reward for a gamble.`], ['Parkour pays. In weird ways.']),
  'parkour:fall': e(() => ['Blackbird takes a rooftop gap at full speed and finds, halfway across, that it is wider than she hoped. The next thing she knows is a fire escape.'], ["I meant to go down. Just not like that."]),
  'ask_around:mark': e((d) => [`Blackbird buys a few drinks' worth of gossip. The word is that ${d.npc} is carrying ${d.item}, and keeps it somewhere easy.`], ['A tip! Free, mostly.']),
  'ask_around:hatch': e(() => ['A tip, for ten neodollars: there is a maintenance hatch behind the Halo dumpster that goes under half the block.'], ['Gossip pays. Slowly.']),
  'ask_around:staffdoor': e(() => ["A tip, for ten neodollars: the Neon Pharaoh has a staff door nobody guards. 'Goes everywhere,' says the stranger."], ['Streetwise: my favorite wise.']),
  'ask_around:dragon': e(() => ["A tip, for ten neodollars: Atlas keeps a dragon on the Kowloon Overpass. 'Nobody comes back,' says the stranger. 'Gossip says it's got a manager.'"], ['The manager is the weak point. In every corp.']),
  'ask_around:gossip': e(() => ['Ten neodollars buys a lot of rumors, none of them useful. Somebody\'s cousin has a theory about the moon.'], ['I am a very well-informed person now.']),
  'ask_around:nothing': e(() => ['Blackbird asks around, and around, and around. Nobody knows anything or will say it. Ten neodollars gone.'], ['The street has secrets. It keeps them.']),
  'trick:good': e(
    (d) => {
      const t = String(d.trick);
      const nm = String(d.name);
      const k = String(d.kind);
      const how = t === 'fetch' ? 'to bring back whatever shiny thing it finds' : t === 'guard' ? 'to stand between Blackbird and incoming damage' : 'to hum a little tune that keeps everyone calm';
      return [k === 'pigeon' ? `Blackbird spends an afternoon teaching ${nm} ${how}. The pigeon looks bored and then, quietly, does it.` : k === 'puppy' ? `Blackbird teaches ${nm} ${how}. The puppy's LED ear lights up. It is, by any measure, a very good boy.` : `Blackbird spends some time teaching ${nm} ${how}. It takes. ${nm} seems pleased.`];
    },
    ['I teach tricks. I am a trainer now.', 'Look at that. Skill transfer.'],
  ),
  'trick:fail': e((d) => [`Blackbird tries to teach ${d.name} a trick. ${d.name} responds with enthusiastic incomprehension and a small bite.`], ['They just need more time. And possibly a snack.']),

  // ====================================================== graffiti, the paint shop, and the consequences
  'graffiti:mural': e(
    (d) => [`Blackbird takes a can of paint to a bare wall at ${d.place} and does not stop until it says BLACKBIRD WAS HERE, in the shape of a bird, a sword and a heart. A passerby takes a photo. (+${d.fame} fame)`, `A fresh wall at ${d.place}, a can of paint, and nothing to lose. By the end it is a mural of Blackbird fighting a dragon, drawn by Blackbird. Her best work yet. (+${d.fame} fame)`],
    ["I've found my medium. It's bricks.", 'The city is my canvas. The city did not agree. I painted anyway.'],
  ),
  'graffiti:another': e(
    (d) => [`Blackbird adds another piece to the wall at ${d.place}: a second bird, this one with sunglasses. (+${d.fame} fame, ${d.pieces} pieces up here)`, `A new piece at ${d.place}, next to the old one. It has a dragon in it, losing. (+${d.fame} fame)`],
    ['A series. Collectors love a series.', 'My early work and my later work, in conversation.'],
  ),
  'graffiti:crowded': e(
    (d) => [`The wall at ${d.place} is getting crowded: ${d.pieces} Blackbirds and counting. The new one barely fits. Neo has seen this already. (+${d.fame} fame)`, `Blackbird squeezes another piece into ${d.place}, between a mural and a stencil of her own face. The neighbors are getting a little tired of it. (+${d.fame} fame)`],
    ['Saturation is just success with a worse name.', "People are starting to say 'again?' It's a compliment."],
  ),
  'graffiti:overpaint': e(
    (d) => [`There is no room left at ${d.place}. Blackbird paints over her own earlier work to make space. Nobody notices. Nobody cares. (+${d.fame} fame, ${d.pieces} pieces and falling)`, `${d.place} has more Blackbird on it than wall. She paints another anyway. (+${d.fame} fame)`],
    ['My old stuff was better. The new stuff is bigger.', 'You can only paint a wall so many times, but I am going to find out where that is.'],
  ),
  'graffiti:over_tag': e(
    (d) => [`Blackbird paints over a ${GANGS[String(d.gang)] ?? d.gang} tag at ${d.place} with a much better piece. Across the district, a gang finds out. (+${d.fame} fame)`, `At ${d.place}, ${GANGS[String(d.gang)] ?? d.gang} turf, Blackbird slaps a heroic bird on the gang's name. It is the best-looking act of war on the block. (+${d.fame} fame)`],
    ['Constructive criticism, in paint.', "It's improved the neighborhood. The neighborhood will object."],
  ),
  'graffiti:rude': e(
    (d) => [`Blackbird intends to paint a heroic eagle at ${d.place}. It comes out as a shape that is, by any reading, rude. She tries to cover it. It gets worse.`, `The wall at ${d.place} gets a very confident piece of work that looks like a bird, a dog and something she has decided not to name.`],
    ["It's an eagle. I'd stand by that in court.", "Art is subjective. Mostly it's subjective to me."],
  ),
  'graffiti:drone': e((d) => [`A surveillance drone drifts past Blackbird's piece at ${d.place}, takes a picture, and files it under 'vandalism: 6/10, great composition.'`], ['A review! From a drone! This is it.']),
  spray_empty: e(() => ['The can gives a last, exhausted hiss. Blackbird shakes it. Taps it. Holds it upside down. Nothing. She keeps the can anyway, out of respect.'], ["It's the thought that counts. And the pigment."]),
  tag_owner: e((d) => [`${d.npc} catches Blackbird mid-piece at ${d.place}. {They} {does} not look like someone who is going to critique the composition.`, `"Is that SPRAY PAINT," asks ${d.npc}, in the voice of someone who already knows. It is.`], ["It's called a commission. They'll understand when it's done."]),
  'vandal:scene': e((d) => [Number(d.count) === 1 ? 'A patrol officer rounds the corner, sees the wall, sees the can, and sees Blackbird. "Citizen. Step away from the art."' : 'Two NPD officers appear on either side of the wall. "Itinerant vandal," says one, to the other, like a diagnosis.'], ['Critics.', 'Nobody respects a work in progress.']),
  'vandal:escaped': e((d) => [`Blackbird vaults a fence, rounds a bin, and is gone before the cuffs come out. The NPD can fine a wall, but not a rumor. She ends up at ${d.to}, a little out of breath.`], ['Art is a contact sport.', "They'll never catch me. Not while I'm quick."]),
  'vandal:fined': e((d) => [`The officer writes a ticket: ${d.amount} neodollars for "unlicensed expression". Blackbird pays, and for a moment feels like an artist who has arrived.`], ["A fine is the first review. It's the best one."]),
  'vandal:cant_pay': e(() => ['The officer writes out a ticket for more than Blackbird has. "Then we do this the other way." The other way involves cuffs and shouting.'], ["I thought art was supposed to be free."]),
  gang_hunt: e((d) => [d.turf ? `${d.count} ${GANGS[String(d.gang)] ?? d.gang} members step out of the shadows at ${d.place}, their own turf. "You the one painting our wall?"` : `${d.count} ${GANGS[String(d.gang)] ?? d.gang} members find Blackbird at ${d.place}. Somebody described her face to them, and drew her bird.`], ['Honestly, I just wanted a canvas.', 'Fans! Of a kind.']),
  'mural:proud': e((d) => [`Blackbird passes her own work at ${d.place}: ${d.pieces} piece${Number(d.pieces) === 1 ? '' : 's'} up, a little faded, a little smug. Somebody has added a mustache. She respects it.`, `Her bird is still on the wall at ${d.place}. A punk is looking up at it. She does not say anything. She stands a little taller.`], ['My work, in the wild. Look at it.', 'Still there. Still gorgeous.']),
  'mural:gallery': e((d) => [`${d.place} has become, unofficially, a Blackbird gallery: ${d.pieces} pieces and a few pigeons looking at them like critics.`], ['A retrospective. Of me. On a wall.']),
  'mural:buffed': e((d) => [`Blackbird finds her piece at ${d.place} painted over with a ${GANGS[String(d.gang)] ?? d.gang} tag. They even used her colors. It looks better, honestly. She does not say that. (${d.pieces} left)`], ["It's collaborative. It's a conversation. It is deeply rude."]),
  'paint_shop:buy': e((d) => [`Blackbird buys a can of spray paint at Spray & Pray for ${d.cost} neodollars. ${d.npc} bags it like it's a loaded weapon, which in the right hands it is.`], ['Tools of the trade.']),
  'paint_shop:flirt_win': e((d) => [`Blackbird leans on the counter and talks to ${d.npc} about colors for a very long time. ${d.npc} slides ${d.count} cans across the counter on the house, along with a phone number written on one.`], ['Art supplies and a girl. This is the dream.', 'I am an artist. It is practically a sub-species of charming.']),
  'paint_shop:flirt_fail': e((d) => [`Blackbird opens with "I'm sorry, are you a color wheel? Because I think I'm going through a phase." ${d.npc} stares at her, and then at the register, and then at her.`], ['The paint fumes got to me. They got to everyone.']),
  'paint_shop:threat_win': e((d) => [`Blackbird has a quiet word with ${d.npc}. ${d.npc} loads ${d.count} cans into a bag with shaking hands and does not make eye contact. The NPD will hear of this.`], ['Intimidation. A heroic skill, if you squint, with paint on it.']),
  'paint_shop:threat_fail': e((d) => [`Blackbird demands paint from ${d.npc}. ${d.npc} pulls out a spray can of her own and shows, in a clean arc across the counter, that she knows how to use it.`], ['The shop owner is armed with art supplies. That is also a weapon, apparently.']),
  'paint_shop:rob_start': e((d) => [`Blackbird vaults the counter of Spray & Pray and tells ${d.npc} she is "borrowing the stock." ${d.npc} reaches for the box cutter.`], ['Heroes take what they need. It is all in the code.']),
  'paint_shop:rob_win': e((d) => [`${d.npc} is out cold on the floor behind the counter. Blackbird loads ${d.count} cans into a bag, pockets the till and leaves the shop looking like a very confused rainbow.`], ["Restocked. Don't ask what the shop looks like."]),
  'paint_shop:lift_win': e((d) => [`While the clerk is busy with a customer, Blackbird slips ${d.count} can${Number(d.count) === 1 ? '' : 's'} into her jacket and walks out like it is the most natural thing in the world.`], ['A can in the jacket is worth two on the shelf.']),
  'paint_shop:lift_caught': e((d) => [`${d.npc} catches Blackbird with a can in each sleeve. "You rattle when you walk." Things escalate.`], ['That rattle was a feature.']),
  'paint_shop:unattended': e((d) => [`The counter at Spray & Pray is empty: no clerk, no one around. Blackbird helps herself to ${d.count} cans and leaves the money nowhere, with feeling.`], ['It is an honesty-box, spiritually.']),
  'dumpster:paint': e(() => ["Under a pile of takeout bags, Blackbird finds a spray can. It's mostly empty. It still has a little life in it, like her."], ['One tag. Maybe two. Let us make them count.']),

  // ------------------------------------------------------------------ goals
  // New ideas. `goal` is a verb phrase ("buy the thermal katana", "flatline Skeeter").
  'goal_new:want_item': e(
    (d) => [
      d.implant
        ? `On the doc's tray at ${d.shop}: the ${d.item}. ${$(d.price)} neodollars. Blackbird has ${$(d.cash)}. ${Number(d.short) > 0 ? `She is ${$(d.short)} short.` : 'She can afford it. It is a rare and unsettling feeling.'}`
        : `Behind the glass at ${d.shop}: the ${d.item}. ${$(d.price)} neodollars. Blackbird has ${$(d.cash)}. ${Number(d.short) > 0 ? `She is ${$(d.short)} short.` : 'She can afford it. It is a rare and unsettling feeling.'}`,
      `Blackbird stops dead at the ${d.item}. The price tag says ${$(d.price)}. Her wallet says ${$(d.cash)}. She has decided to listen to neither.`,
    ],
    ['That one. I want that one. Destiny wants that one.', 'It was made for me. Someone just forgot to tell the price tag.', "I'm not window shopping. I'm window *acquiring*."],
  ),
  'goal_new:short': e(
    (d) => [`The ${d.item} costs ${$(d.price)}. Blackbird has ${$(d.cash)}. A new plan forms, and it is all about the word "more": ${$(d.short)} neodollars more.`, `Blackbird does the math on the ${d.item}. The math is rude. She needs ${$(d.short)} more, and she starts thinking about where money lives.`],
    ['Money. Right. The boring part of being a hero.', "I just need to find {short} neodollars lying around. Neo is full of lying-around."],
  ),
  'goal_new:grudge': e((d) => [`Blackbird has not forgotten ${d.npc}. She starts a list. ${d.npc} is the list. New objective: ${d.goal}.`], ['Some people, you just never let go.', 'I have a long memory and a short list.']),
  'goal_new:slight': e(
    (d) => [`${d.npc} is going to pay for that. Blackbird has decided. New objective: ${d.goal}.`, `Blackbird files ${d.npc}'s face under "Later". The folder is labeled ${String(d.goal).toUpperCase()}.`],
    ['{They} looked at me. Like *that*. In *my* city.', 'Unforgivable. Memorable. Both of those, and also fixable.'],
  ),
  'goal_new:crush': e(
    (d) => [`Blackbird has noticed ${d.npc}. She has decided ${d.npc} is going to notice her back. New objective: ${d.goal}.`, `Something about ${d.npc} lodges in Blackbird like a good song. She starts to plan.`],
    ['A plan. For a girl. I have been training for this.', "She's going to be so impressed. She just doesn't know it yet."],
  ),
  'goal_new:prep': e((d) => [`${d.npc} hits harder than Blackbird does. This is, to her credit, the first time she has noticed. New step: ${d.goal}.`, `Blackbird sizes up ${d.npc}, then her tire iron, then ${d.npc} again. A plan appears in the margins: ${d.goal}.`], ['Tactics. Look at me, doing tactics.', 'First, a better weapon. Then, the thing I was going to do anyway.']),
  'goal_new:rich': e((d) => [`Blackbird checks her wallet. Blackbird checks it again. New objective: ${d.goal}.`], ['Rich. Soon. In a tasteful, flashy way.', 'Money is just score. I am going to win at score.']),
  'goal_new:dragon': e((d) => [`The dragon is a lot of dragon. Blackbird has a tire iron. She makes a plan: ${d.goal}.`], ["Big dragon. Small tire iron. Let's fix one of those."]),
  'goal_new:heist': e(
    (d) => [`${d.place} has what Blackbird needs${Number(d.short) > 0 ? ` (${$(d.short)} neodollars' worth, give or take)` : ''}. New objective: ${d.goal}. Quietly, if she can manage the word.`, `Blackbird looks at ${d.place} the way a locksmith looks at a promise. Plan: ${d.goal}.`],
    ["In, out, nobody the wiser. It's a plan with all the best qualities.", 'Crime is just fast work. For fast people. Like me.'],
  ),
  'goal_new:burgle': e(
    (d) => [d.fresh ? `Blackbird has ${d.npc}'s address, but not the way there. She works it out: ${d.street}, a few blocks off, then up to ${d.home}. New objective: ${d.goal}.` : `Blackbird knows where ${d.npc} sleeps, and that it is unattended often enough. New objective: ${d.goal}.`],
    ['Somewhere out there is a door with my name on it. Not literally.', 'I know the way. I know the lock. I know the neighbours are loud.'],
  ),
  'goal_new:heist_idea': e((d) => [`Blackbird stares at ${d.place} for a long time. Nobody looks at a safe like that and walks away. New objective: ${d.goal}.`], ["It's there. I'm here. That's basically an invitation."]),
  // ------------------------------------------------------------------ asking the lab
  // She asks the lab tech (you) at a fork; you have a few beats before she decides herself. `label` is the option she ended up with.
  'advice_ask:want': e(
    (d) => [
      `Blackbird stops at the ${d.item}: ${$(d.price)}, and she has ${$(d.cash)}. She taps her earpiece. "Lab. Hypothetically. Should I save up for it?"`,
      `The ${d.item} is ${$(d.short)} out of reach. Blackbird patches in the lab. "Quick question. Is this the one?"`,
    ],
    ["I'm not asking. I'm informing, with a question mark.", 'Consulting. Very senior of me.'],
  ),
  'advice_ask:earn': e(
    (d) => [
      `Blackbird is ${$(d.short)} short, and the options are not all the same size. She taps her earpiece. "Lab. Big score or honest work. Go."`,
      `${$(d.short)} neodollars short. Blackbird opens a line to the lab. "Say I wanted to get it fast. Would I do it the loud way or the boring way?"`,
    ],
    ['They love being asked. It is good for them.', 'Two plans. One of them is mine.'],
  ),
  'advice_ask:door': e(
    (d) => [
      d.near
        ? d.dungeon === 'outpost' ? `There's an Atlas outpost at ${d.place}, and Blackbird is standing in front of it. She taps her earpiece. "Lab. Outpost. Clear it out?"`
        : d.dungeon === 'hideout' ? `There's a ganger hideout at ${d.place}, and Blackbird is standing in front of it. She taps her earpiece. "Lab. Hideout. Should I clear it out?"`
        : `Blackbird is looking at ${d.place}. It looks like money. She taps her earpiece. "Lab. Worth a look?"`
        : `Blackbird has been thinking about ${d.place}. She patches in the lab. "Hypothetically. Should I kick that in?"`,
    ],
    ['I know the answer. It is yes. I am being polite.', 'Door. Me. Quick vote.'],
  ),
  'advice_ask:idle': e(
    () => ['Nothing on her mind. Blackbird taps her earpiece. "Lab. I am bored. Give me a goal."', 'Blackbird has run out of ideas, a rare event. She calls the lab. "What should I do with myself?"'],
    ['Delegating. Leaders do that.', 'I could pick. But then what would you do all night?'],
  ),
  'advice_taken:want': e(
    (d) => (d.pick === 'skip'
      ? [`The lab says forget the ${d.item}. Blackbird says "fine" in the voice of someone who is not fine, and leaves the glass alone.`]
      : [`The lab says save up. Blackbird says she was already going to.`, `"Save up," says the lab. Blackbird writes it down as her own idea.`]),
    ['Good call. Mine, mostly.', 'I have excellent staff.'],
  ),
  'advice_taken:door': e(
    (d) => (d.pick === 'leave'
      ? [`The lab says leave it. Blackbird looks at ${d.place} for a long moment, then at the sky, then walks away from it. She is allowed to.`]
      : [`The lab says kick it in. Blackbird has been waiting her whole life for someone to say that.`, `"Clear it out," says the lab. Blackbird cracks her knuckles one at a time.`]),
    ['Smart. I was about to say that.', 'Finally, a staff member who gets it.'],
  ),
  'advice_taken:earn': e(
    (d) => [`The lab says: "${d.label}." Blackbird nods like it was her idea.`, `"${d.label}," says the lab. Blackbird says she was just about to say that.`],
    ['Good call. Mine, mostly.', 'I have excellent staff.'],
  ),
  'advice_taken:idle': e(
    (d) => [`The lab says: "${d.label}." Blackbird takes this as a vote of confidence in her.`, `"${d.label}," says the lab. Blackbird writes it on her hand.`],
    ['I knew you would pick that one.', 'Orders. I love orders. Mine, but still.'],
  ),
  'advice_lapsed': e(
    (d) => [`Nobody picks up. Blackbird decides for herself: ${lc(d.label)}.`, `The lab is silent. Blackbird shrugs and goes with her gut: ${lc(d.label)}.`, `Dead air from the lab. Blackbird takes that as a yes to whatever she was thinking. ${cap(lc(d.label))}.`],
    ['Dead air. Fine. I do my best work solo.', 'The lab is asleep. Typical.', 'I asked. That counts.'],
  ),
  'goal_pass:full': e((d) => [`Blackbird has ${d.count} plans on the go and a new one is waving at her. She has enough on her plate. ("To ${d.goal}", it says.) She lets it wave.`], ["I'm a busy woman. Very busy. Don't look at my schedule."]),

  // Finished.
  'goal_done:bought': e((d) => [`The ${d.item} is hers. Blackbird counts the receipt out loud, twice, and feels it in her soul.`, `Blackbird walks out with the ${d.item}. The receipt is the saddest part of the transaction.`], ['Worth every neodollar. I will say that until it is true.', 'Mine. Finally. It was meant to be.']),
  'goal_done:raised': e((d) => [d.nested ? 'Blackbird counts the money and there it is: all of it. One obstacle down.' : `Blackbird counts her cash. ${d.goal}: done. She feels, for a moment, like a person with a bank.`], ['Money. Got it. Now to spend it unwisely.', "That's the boring part done."]),
  'goal_done:armed': e(() => ['Blackbird hefts her new piece and nods. A better weapon, at last. Somewhere in Neo, a grudge sharpens.'], ['That is what I call an upgrade.', 'Now we are talking.']),
  'goal_done:kill': e((d) => [`${d.npc} is no longer a problem. Blackbird files it under "resolved".`, `${d.npc} will not be looking at anyone wrong again. Blackbird feels a lightness she cannot account for.`], ['{They} looked at me wrong. Past tense.', 'Closure. Not a lot of it. Enough.']),
  'goal_done:beat_up': e((d) => [`${d.npc} has been taught a lesson. Blackbird is a thorough teacher.`], ['Let that be a lesson. You were the lesson.']),
  'goal_done:settled': e((d) => [`The plan was to flatline ${d.npc}. The venue had rules about that. ${d.npc} is unconscious, which Blackbird decides will do.`], ["{They} {is} out cold. It's basically the same. It is, in a legal sense, completely different."]),
  'goal_done:kiss': e((d) => [`${d.npc} kisses back. Blackbird takes this as proof the plan was sound.`], ['Mission accomplished. The mission was me.', 'The plan worked. Never doubted it.']),
  'goal_done:smitten': e((d) => [`${d.npc} is, by every measurable sign, impressed. Blackbird counts it as a win and keeps the receipts.`], ["She's into it. She's into me. I know what I'm doing."]),
  'goal_done:burgled': e((d) => [`${d.npc}'s place is done. Blackbird is out the door and walking, with the unhurried gait of someone who owns the pavement.`], ['Another door that was only ever a suggestion.']),
  'goal_done:clean': e((d) => [`Nobody notices a thing. Blackbird strolls out of ${d.place} into the street like a woman remembering an appointment. The take: ${$(d.haul)} neodollars' worth.`], ['Perfect. Silent. Practically a ghost with taste.', 'Do not tell anyone how easy that was. They will want to try.']),
  'goal_done:messy': e((d) => [`Blackbird gets away with ${d.place}. Technically. The trail behind her is mostly sirens. The take: ${$(d.haul)} neodollars' worth.`], ['Fine. It got loud. Loud is a vibe.', 'Perfectly clean. In my heart.']),

  // Given up.
  'goal_drop:bored': e((d) => [`Somewhere along the way, Blackbird stops caring about the plan to ${d.goal}. Nobody notices. Least of all her.`, `The plan to ${d.goal} quietly leaves Blackbird's head, like a guest who was never really invited.`], ['It was a phase.', 'I have grown. Mostly in other directions.']),
  'goal_drop:frustrated': e((d) => [`Blackbird has had it with the plan to ${d.goal}. She drops it, loudly, in a way a few people overhear.`], ["Forget it. Forget the whole thing. I didn't want it anyway.", 'This is a bad plan. It was always a bad plan. I was always secretly aware.']),
  'goal_drop:overloaded': e((d) => [d.replacement ? `Blackbird has too much going on. To make room for a plan to ${d.replacement}, she lets go of the plan to ${d.goal}.` : `Blackbird has too many plans and not enough hands. The plan to ${d.goal} goes overboard.`], ['I only have so much hero to go around.', 'Prioritizing. This is what leadership looks like.']),
  'goal_drop:moot': e((d) => [`The plan to ${d.goal} no longer makes sense. Blackbird shrugs and lets it go.`], ['Plans change. Mine change fast.']),
  'goal_drop:impossible': e((d) => [`There is no way to ${d.goal} anymore. Blackbird accepts it with grace and a muffled swear.`], ["Not meant to be. Probably. Ask me later."]),
  'goal_drop:closed': e((d) => [`Nobody is left to sell the ${d.item}. The shop is closed, whatever the sign says. Blackbird gives up on it.`], ["Counter's empty. Dreams, too."]),
  'goal_drop:got_better': e((d) => [`Blackbird comes by something as good as the ${d.item} some other way. The plan to ${d.goal} folds like a lawn chair.`], ["Turns out I didn't need to pay for it. Ha."]),
  'goal_drop:someone_else': e((d) => [`Somebody else got to ${d.npc} first. Blackbird is not sure how to feel about that. She is, mostly, offended.`], ['My target. My plan. Somebody else did the work.']),
  'goal_drop:cold': e((d) => [`${d.npc} makes it clear, with words and one gesture, that the plan to ${d.goal} is not happening. Blackbird takes it like a champ. A damp, sulking champ.`], ["She doesn't know what she's missing.", "It's fine. I'm fine. I'm doing great."]),
  'goal_drop:gone': e((d) => [`${d.npc} is gone. The plan to ${d.goal} goes with {them}.`], ['That is not how that was supposed to go.']),
  'goal_drop:devoted': e((d) => [`Blackbird has someone now. The plan to ${d.goal} no longer feels right. She lets it go, somewhat guiltily.`], ["I'm taken. That's the rule. I just made the rule."]),
  'goal_drop:sold_out': e((d) => [`The ${d.item} is gone. Somebody else bought it. Blackbird stares at the empty spot on the shelf for a long, sad time.`], ['Some girl is wearing my future right now.']),
  'goal_drop:nothing_better': e(() => ["Blackbird has looked at everything on offer and none of it beats what she's holding. She decides her old weapon was fine, and always had been."], ['Look at that. The tire iron is a classic.']),
  'goal_drop:aborted': e((d) => [`Blackbird slips out of ${d.place}, empty-handed and hoping nobody noticed. The plan to ${d.goal} is off, for now.`], ['A tactical retreat. Retreats are tactical by definition.', "We'll do it properly next time. Which is the plan."]),

  // Reworked.
  'goal_revise:sold_out': e((d) => [`The ${d.old} is gone: sold to somebody who isn't Blackbird. She sets her sights on the ${d.item} instead.`], ['Fine. This one. I always liked this one more.']),
  'goal_revise:cheaper': e((d) => [`The ${d.old} is not happening. Blackbird lowers her sights, a little, to the ${d.item}. Her pride takes it on the chin.`], ['Honestly this one fits my aesthetic better.', "Dream big. Buy medium."]),
  'goal_revise:lower_sights': e((d) => [`Nothing in the shop quite does what she wanted. The ${d.item} will do. Blackbird recalibrates the plan.`], ['Close enough. Hero-adjacent.']),
  'goal_revise:settle': e((d) => [`Blackbird looks at the plan to flatline ${d.npc} and rounds it down. A good beating, maybe. Something educational.`], ["It's about the lesson. Not about the body. This time."]),

  // On hold.
  'goal_delay:hurt': e((d) => [`Blackbird is in no state to ${d.goal}. She puts it on hold until she stops leaking.`], ['Later. I have a whole life.']),
  'goal_delay:licking_wounds': e((d) => [`That did not go well. The plan to ${d.goal} will have to wait while Blackbird finds a wall to lean on.`], ['A setback is just a comeback with a bad start.', 'Round one: noted. Round two: pending.']),
  'goal_wake:hurt': e((d) => [`Blackbird is feeling better. The plan to ${d.goal} is back on.`], ['Back in business.']),
  'goal_wake:licking_wounds': e((d) => [`Blackbird has had time to think. The plan to ${d.goal} is, annoyingly, still a good one.`], ['Round two.']),
  'goal_wake:later': e((d) => [`Blackbird remembers the plan to ${d.goal}. Time to get back to it.`], ['Right. That thing.']),
  'goal_resume:buy': e((d) => [`Blackbird remembers the ${d.item}. The thought comes back like a song she was half-humming.`], ['Right. The thing I want. Still want it.']),
  'goal_resume:cash': e(() => ["Blackbird remembers she is saving up. She puts the thing she was about to spend money on back in her pocket. Mostly."], ['Money. Right. Focus.']),
  'goal_resume:kill': e((d) => [`${d.npc} drifts back into Blackbird's head. She had not forgotten, exactly. She had just been busy.`], ['Still on the list. Still at the top.']),
  'goal_resume:romance': e((d) => [`Blackbird thinks of ${d.npc} and tidies her hair for no reason.`], ['Where was I. Right. Impressing someone.']),
  'goal_resume:weapon': e(() => ['Blackbird looks down at her weapon, sighs, and remembers she was going to do something about that.'], ['A better weapon. I was getting to it.']),
  'goal_resume:fame': e(() => ['Blackbird catches her reflection in a window and remembers she is meant to be famous. She stands up straighter.'], ['Right. The adoring public. They are waiting.']),
  'goal_resume:dragon': e(() => ['Blackbird glances at the sky and remembers the dragons. They have not forgotten her. They do not know her. But they have not forgotten her.'], ['Back to the hunt.']),
  'goal_resume:explore': e((d) => [`Blackbird looks down the street toward ${d.place ?? 'the unknown'} and remembers she meant to go and see.`], ['Right. The map has a blank spot. Rude.']),
  'goal_resume:burgle': e((d) => [`Blackbird glances toward ${d.npc}'s street and remembers the plan.`], ["The door's still there. I'm still going to open it."]),
  'goal_resume:heist': e((d) => [`Blackbird glances toward ${d.place} and remembers the plan.`], ["The job's still there. I'm still going to do it."]),

  // Mid-heist.
  'goal_note:inside': e((d) => [`Blackbird is inside ${d.place}. Nobody has looked up. She tries to look like she belongs, and mostly pulls it off.`], ['Smooth. Silent. Incredibly well-dressed for a burglar.']),
  'goal_note:haul': e((d) => [`Blackbird has what she came for from ${d.place}. Now to leave without telling anyone.`], ['Easy. Even I am surprised how easy.', "Don't run. Walk like it's yours."]),
  'goal_note:blown': e((d) => [`Something goes wrong at ${d.place}: a camera, a sound, a heat signature. The quiet part of the plan is over. Blackbird presses on anyway.`], ['Plan B is just plan A, louder.', "Nobody saw anything. Nobody saw anything yet."]),
  'goal_note:bail': e((d) => [`Something goes wrong at ${d.place}. Blackbird, for once, looks at the situation and decides to leave while she can.`], ['Strategic withdrawal. A thing I invented just now.', 'I could stay, but I have a feeling about it. The feeling is "run".']),
  // ====================================================== exploring
  'goal_new:explore_idea': e(
    (d) => [d.bored ? `Blackbird has looked at the same four walls for long enough. Somewhere out there is ${d.place}, and she has never been. New objective: ${d.goal}.` : `There is a whole city out there and Blackbird has seen a corner of it. ${cap(String(d.place))} is next. New objective: ${d.goal}.`],
    ['I am not lost. I am sampling.', 'You cannot hit anything you have not found yet.'],
  ),
  'goal_new:explore_cash': e((d) => [`Nothing around here is paying. Blackbird has not tried ${d.place} yet, and it has to be good for something. New step: ${d.goal}.`], ['Money does not grow on streets I know. Time to meet some new streets.']),
  'goal_new:explore_dragon': e((d) => [`The dragons are not going to wait in the places Blackbird has already looked. She heads for ${d.place}. New step: ${d.goal}.`], ['Dragons have to nest somewhere. Somewhere I have not been.']),
  'goal_new:explore_fame': e((d) => [`A new crowd is a fresh crowd. Blackbird has never played ${d.place}. New step: ${d.goal}.`], ['They do not know me there yet. That is the best kind of audience.']),
  'goal_done:explored': e((d) => [d.nested ? `Blackbird has now seen ${d.place}. One more corner of the city is on her map.` : `Blackbird has seen ${d.place} now. It is a place. She files it and moves on.`], ['Mapped. Mostly. In my head.', 'New place. Noted.']),
  // ====================================================== dungeons: outposts and hideouts
  'goal_new:raid_idea': e(
    (d) => [d.dungeon === 'spot' ? `${cap(String(d.place))} is small, close and a little bit unattended. Blackbird has the look of a woman doing a very quick sum. New objective: ${d.goal}.` : d.dungeon === 'outpost' ? `Blackbird walks past ${d.place} for the third time and begins to see it as a building full of other people's property. New objective: ${d.goal}.` : `Somebody ought to clear out ${d.place}. Blackbird has just worked out that she is somebody. New objective: ${d.goal}.`],
    (d) => [d.dungeon === 'spot' ? 'Small job. Fast job. The best sort of job to be good at.' : d.dungeon === 'outpost' ? 'Atlas keeps its stuff in boxes. Boxes can be opened.' : 'Gangs are just landlords with worse manners.', 'It has a door. I have a tire iron. This is how every great story starts.'],
  ),
  'goal_new:idle_raid': e(
    (d) => [d.dungeon === 'spot' ? `Nothing on her mind, and ${d.place} three doors down, minding its own small business. Blackbird takes the hint. New objective: ${d.goal}.` : d.dungeon === 'outpost' ? `Nothing on her mind, and ${d.place} sitting there with its lights on. Blackbird takes the hint. New objective: ${d.goal}.` : `Blackbird has been looking at ${d.place} the way a dog looks at a gate. New objective: ${d.goal}.`],
    ['I do my best work when I am bored and nobody is stopping me.', 'A hero needs a project. This one has a roof.'],
  ),
  'goal_new:raid_cash': e(
    (d) => [`Blackbird needs ${Number(d.short) > 0 ? `${$(d.short)} neodollars` : 'cash'}, and ${d.place} is, by any fair reading, full of it. New objective: ${d.goal}.`],
    ['Why earn money when you can take it off people who have too much of it, and a gun?', 'A budget is just a heist with paperwork.'],
  ),
  'shut_down:owner': e(
    (d) => [d.inside ? `With ${d.npc} on the floor there is nobody to run ${d.place}. The staff stop pretending, the punters start for the exits, and someone with a key and a grudge shows Blackbird to the pavement. The shutters come down behind her.` : `Word gets round: ${d.place} has shut. With ${d.npc} out of the picture, nobody is pouring and nobody is paying, and the lights go off.`],
    ['I closed a bar. Forty years of history, and I did it before dinner.', 'In my defence, it was not a very good bar.'],
  ),
  'shut_down:owner_dead': e(
    (d) => [d.inside ? `${d.npc} is not getting up. Nobody in ${d.place} says so out loud. The staff drift out with their coats, the punters follow, and someone with a key shows Blackbird to the pavement. The shutters come down and stay down.` : `${d.place} has shut, and it is not the usual kind of shut. ${d.npc} is dead, the staff have gone to look for other work, and somebody has put a lock the size of a fist on the shutters.`],
    ['That is going to be a long night for the neighbourhood.', 'It was always going to come to this. Not me. Him. Probably.'],
  ),
  'shut_down:gym': e(
    (d) => [d.inside ? `With ${d.npc} on the mat there is nobody to run ${d.place}. The coaches stop pretending, the regulars drift for the doors, and someone with a key and a towel shows Blackbird out. The shutters come down behind her.` : `Word gets round that ${d.npc} has been put down at ${d.place}. The gym shuts for a few days. The bags swing a bit, then stop.`],
    ['I closed a gym. Rest day, everyone. You are welcome.', 'A day off. For the whole district. That is leadership.'],
  ),
  'shut_down:gym_dead': e(
    (d) => [d.inside ? `${d.npc} is not getting up. Nobody in ${d.place} says so out loud. The regulars lay their gloves on the bench, the coaches switch off the lights and someone with a key shows Blackbird to the pavement. The shutters come down and stay down.` : `${d.place} has shut, for good, in the sense that matters. ${d.npc} will not be back, and nobody has the keys.`],
    ['That is going to be a long night for the neighbourhood.', 'It was always going to come to this. Not me. Him. Probably.'],
  ),
  'shut_down:pawn': e(
    (d) => [d.inside ? `With ${d.npc} on the floor there is nobody to price anything at ${d.place}. The grille comes down, the clerks put the cat in a box and someone with a very large key shows Blackbird out.` : `Word gets round that ${d.npc} has been put down at ${d.place}. The shop shuts for a few days. The window goes dark, and every tag in it looks a little more like a tombstone.`],
    ['I closed a pawn shop. Everyone gets their stuff back. Eventually. Possibly.', 'A pawn shop, shuttered. That is a lot of other people\'s things in a very small dark.'],
  ),
  'shut_down:pawn_dead': e(
    (d) => [d.inside ? `${d.npc} is not getting up. Nobody in ${d.place} says so out loud. The clerks lay a cloth over the counter, someone turns the sign and a very quiet person with a key shows Blackbird to the pavement. The grille comes down and stays down.` : `${d.place} has shut, for good, in the sense that matters. ${d.npc} will not be back, the ledger is under a lock and every tag in the window is waiting for somebody who is not coming.`],
    ['That is going to be a long night for the neighbourhood.', 'It was always going to come to this. Not me. Him. Probably.'],
  ),
  'shut_down:clinic': e(
    (d) => [d.inside ? `With ${d.npc} out cold and nobody else qualified to hold a scalpel, ${d.place} locks up. The guards herd Blackbird to the door and the shutters come down on her heels.` : `${d.place} has shut. With ${d.npc} on the floor there is nobody left to hold the scalpel, and the guards have locked the door from the inside.`],
    ['Okay. Hitting the doctor. Sub-optimal. Noted.', 'Where do people go when the clinic is closed? Other clinics. Probably.'],
  ),
  'shut_down:muscle': e(
    (d) => [d.inside ? `${d.place} does the sums on ${d.npc} being flat on the floor again and decides it is not worth it. The lights go up, the shutters come down, and Blackbird is walked out.` : `${d.place} has decided it is cheaper to close than to keep replacing the muscle. The shutters are down.`],
    ['They could have just hired somebody. I would have knocked him down too.', 'Two bouncers, one bar, and a very reasonable amount of regret.'],
  ),
  'house_decides:hire': e(
    (d) => [`With ${d.npc} out cold, whoever runs ${d.place} is already on the phone, looking for someone to stand at the door.`],
    ['Fine. Hire another one. I need the exercise.', 'They will want references. I will want a longer weapon.'],
  ),
  'house_decides:hired': e(
    (d) => [`A new face is at the door of ${d.place}: ${d.npc}, arms folded, looking at Blackbird in the way a person looks at the reason they got the job.`],
    ['New guy. He is going to hate me.', 'I give him a fortnight. Maybe a night.'],
  ),
  'shut_down:called': e(
    (d) => [`${d.npc} is on the floor of ${d.place}, and the first thing anyone in the shop does is reach for a phone.`],
    ['Cops in five. Four, if they like the look of the day.', 'Right. Nobody saw anything. Nobody.'],
  ),
  'shut_down:police': e(
    (d) => [d.inside ? `The police arrive at ${d.place} and take one look at ${d.npc}. Blackbird is shown out, and tape goes across the door behind her.` : `The police have been to ${d.place}. There is tape across the door and a notice about an incident.`],
    ['Closed pending inquiries. I love it when they use big words.', 'That is a lot of tape for one clerk.'],
  ),
  'goal_new:wandered_in': e(
    (d) => [d.dungeon === 'spot' ? `Blackbird is at ${d.place} before she has properly decided to be. She decides, retroactively. New objective: ${d.goal}.` : d.dungeon === 'outpost' ? `Blackbird is inside ${d.place}. Nobody invited her, which is, she has decided, a plan. New objective: ${d.goal}.` : `Blackbird is through the door of ${d.place} before she has properly decided to be. She decides, retroactively. New objective: ${d.goal}.`],
    ["I meant to do that. All of that. Even the door.", 'Look at me, already inside. Planning is for people who are not me.'],
  ),
  'goal_note:raid_in': e(
    (d) => [d.dungeon === 'spot' ? 'Blackbird steps up to the spot and takes a good look at the room. It is a small room. She is a big problem.' : d.dungeon === 'outpost' ? 'Blackbird slips through the gate and stands in a corridor that smells of floor wax and machine oil. Somewhere deeper in, something ticks.' : 'Blackbird steps inside. The bass is coming up through the floor, and so, from the sound of it, is a great deal of company.'],
    (d) => [d.dungeon === 'spot' ? 'One room. A few people. A bag. I have done harder sums.' : 'Right. Rooms. People. Things in the rooms. I can work with that.', d.dungeon === 'spot' ? "Cool. I'll take the whole spot." : "Cool. I'll take the whole building."],
  ),
  'goal_note:raid_clear': e(
    (d) => [d.dungeon === 'spot' ? 'Nobody is left standing and nothing is left lying about. Blackbird dusts off her hands and goes looking for the next little thing.' : d.dungeon === 'outpost' ? 'The last of the garrison is scrap, and the last of the racks has been opened. Blackbird has the place to herself and nothing left to take. She starts for the door.' : 'There is nobody left in the building to hit, and nothing left on the shelves. Blackbird walks out through the quiet like a woman who has just redecorated.'],
    ['Cleaned out. Top to bottom. I should charge for that.', 'Nobody stays down like the people I put down.'],
  ),
  'goal_note:raid_out': e(
    (d) => [d.hurt ? 'Blackbird looks at what is left of the place, then at what is left of herself, and does the sums. She backs towards the door.' : d.dungeon === 'spot' ? 'What is left of the spot is more than she bargained for. Blackbird decides, with great dignity, that it was never about the money.' : d.dungeon === 'outpost' ? 'What is left of the outpost is behind doors she has no business opening. Blackbird decides that this is, on reflection, enough. She heads for the exit.' : 'What is left of the hideout is a lot of people she cannot take. Blackbird has a sudden clear memory of an appointment elsewhere.'],
    ["Not today. I'm choosing not today.", 'I could stay. I have a feeling about it. The feeling is "no".'],
  ),
  'goal_done:cleared': e(
    (d) => [`${d.place} is finished. Blackbird steps out into the street with the unhurried air of someone who has cleaned out a ${d.dungeon === 'spot' ? 'neat little operation' : d.dungeon === 'outpost' ? 'corporate facility' : 'crew'} and is not going to talk about it. The take: ${$(d.haul)} neodollars' worth.`],
    ['Nobody is going to want to go back in there. Least of all me.', 'Another building. Another name for the list.'],
  ),
  'goal_done:spoils': e(
    (d) => [`Blackbird leaves ${d.place} with what she could carry and the good sense not to push it. The take: ${$(d.haul)} neodollars' worth. The rest can wait for a better day.`],
    ['A partial win is a win with room to grow.', 'Came for the loot. Got the loot. Left the rest. Respectable.'],
  ),
  'goal_drop:outmatched': e(
    (d) => [d.inside === false ? `Blackbird looks at ${d.place} from the street, at what the place is for and who is in it, and decides that this is a job for somebody else, on a different day. The plan to ${d.goal} is off.` : `Blackbird is out of ${d.place} with nothing to show for it but the story. The plan to ${d.goal} is, for now, a bad idea.`],
    ["I didn't run. I repositioned. At speed.", 'It will still be there. I will be better. Both of those things are true.'],
  ),
  'goal_resume:raid': e((d) => [`Blackbird glances toward ${d.place} and remembers the plan.`], ['Right. The building. It is still full of stuff.']),

  'dungeon_alarm:seen': e(
    (d) => [d.kind === 'spot' ? (d.crew === 'atlas' ? `${cap(String(d.place))}: ${d.scene} A status light goes red. ${cap(String(d.foes))} turn as one to look at Blackbird.` : d.crew === 'npd' ? `${cap(String(d.place))}: ${d.scene} Hands drop to belts. ${cap(String(d.foes))} have seen her.` : `${cap(String(d.place))}: ${d.scene} That stops when ${d.foes} look up and see Blackbird.`) : d.kind === 'outpost' ? `${cap(String(d.place))}: the lights go red and everything in the room turns as one to look at Blackbird. ${cap(String(d.foes))}. An alarm starts somewhere, politely.` : `${cap(String(d.place))}: the music cuts out. ${cap(String(d.foes))} ${Number(d.count) > 1 ? 'look' : 'looks'} up from what ${Number(d.count) > 1 ? 'they were' : 'they were'} doing, and then at the door.`],
    ['I like to make an entrance. Occasionally the entrance makes me.', 'They noticed. They notice everything about me. It is a gift.'],
  ),
  'dungeon_alarm:lingered': e(
    (d) => [d.kind === 'spot' ? `Blackbird has been loitering at ${d.place} for a beat longer than a customer would. ${cap(String(d.foes))} ${Number(d.count) > 1 ? 'have' : 'has'} noticed.` : d.kind === 'outpost' ? `Blackbird has been standing in ${d.place} for a little too long. A routine scan finishes, and the scan finds her. ${cap(String(d.foes))}.` : `Blackbird dawdles in ${d.place} a beat too long, and the room notices her the way a room notices a smell. ${cap(String(d.foes))}.`],
    ['I was about to move. I was about to move right now.', 'They are very observant. Fine. I was done being subtle.'],
  ),
  'dungeon_alarm:tripped': e(
    (d) => [d.kind === 'spot' ? `That was louder than it should have been. At ${d.place}, ${d.foes} turn round.` : d.kind === 'outpost' ? `The noise is loud and the room is not empty. ${cap(String(d.foes))}, already moving.` : `That was louder than it should have been. In ${d.place}, ${d.foes} turn round.`],
    ["That was not me. That was the lock. I'd like that noted."],
  ),
  'dungeon_ambush:ambush': e(
    (d) => [d.kind === 'spot' ? `${cap(String(d.place))}: ${d.scene} ${cap(String(d.foes))} ${Number(d.count) > 1 ? 'have' : 'has'} not noticed Blackbird. That is about to be ${Number(d.count) > 1 ? 'their' : 'its'} whole afternoon.` : d.kind === 'outpost' ? `In ${d.place}, ${d.foes} ${Number(d.count) > 1 ? 'have' : 'has'} not noticed Blackbird. This is about to be ${Number(d.count) > 1 ? 'their' : 'its'} problem.` : `In ${d.place}, ${d.foes} ${Number(d.count) > 1 ? 'are' : 'is'} looking the other way. Blackbird takes the invitation.`],
    ['Never turn your back on a hero. It is rule number one. I wrote it.', 'The best kind of fight is the one where they are not ready for it.'],
  ),
  'dungeon_wave': e(
    (d) => [d.kind === 'spot' ? `More of them, from round the corner: ${d.foes}. It was a small place. It was apparently a popular one.` : d.kind === 'outpost' ? `More of them, from deeper in ${d.place}: ${d.foes}. In step, looking at her.` : `There are more. From the back of ${d.place}: ${d.foes}. None of them look like they have anywhere better to be.`],
    ["Is there a limit? There's a limit. Where's the limit?", 'You love to see it. I do not love to see it.'],
  ),
  'dungeon_unseen': e(
    (d) => [d.kind === 'spot' ? `${cap(String(d.place))}: ${d.scene} Nobody has looked round. Blackbird takes up a position and watches ${d.foes}.` : d.kind === 'outpost' ? `${cap(String(d.place))}: ${d.foes}, going about the business of a building. Nobody looks round. Blackbird takes up a position behind something large.` : `${cap(String(d.place))}: ${d.foes}, deep in an argument about nothing. Nobody has looked at the door. Blackbird stays small.`],
    ['I am a shadow. I am a very good-looking shadow.', 'Nobody has seen me. Nobody ever sees me coming. It is my favorite thing about me.'],
  ),
  'dungeon_quiet': e(
    (d) => [`${cap(String(d.place))}: ${d.scene} Nobody to stop her.`],
    ['Free money. Free-ish money. Money that has not met me yet.', 'I did not see a sign saying DO NOT. Therefore: no sign.'],
  ),
  'dungeon_pulled_back': e(
    (d) => [`Blackbird thinks better of ${d.place} and backs out the way she came, quietly and with some dignity.`],
    ['A tactical reconsideration. I will be back. I will be later.'],
  ),
  'dungeon_cleared': e(
    (d) => [d.kind === 'spot' ? (d.quiet ? `Blackbird takes the last of what was at ${d.site}. Nobody was ever here to stop her, which is the best sort of crime scene.` : d.crew === 'atlas' ? `Nothing at ${d.site} is moving. Atlas will send someone, eventually, to ask who did this, and then to bill her for it.` : d.crew === 'npd' ? `${cap(String(d.site))} is quiet. Somewhere on the force somebody is about to have a very bad day, and so, shortly, is Blackbird.` : d.crew === 'gang' ? `${cap(String(d.site))} is quiet. The crew will be back with new faces and a new bag within a few nights.` : `${cap(String(d.site))} is quiet. Whoever was using it will be back, and they will have a grievance.`) : d.kind === 'outpost' ? `Silence in ${d.site}. The last drone ticks twice, falls over and does not tick again. Nothing in the building is looking for Blackbird any more. Atlas will want to talk about this. Probably in a couple of days.` : `Nobody is left standing in ${d.site}. The speakers are still playing, to no one. Whatever the crew had, it is Blackbird's. They will find somebody new to move in within a few nights.`],
    ['Cleared. Look at that. Look at all of it.', 'Another one. Add it to the wall. I have a wall now.'],
  ),
  'dungeon_loot:cash': e((d) => [`${cap(String(d.what))} in ${d.place} gives up ${$(d.amount)} neodollars.${d.watched ? ' Right in front of people, too.' : ''}`], ['A tidy sum. Tidier in my pocket.']),
  'dungeon_loot:stash': e((d) => [`${cap(String(d.what))} in ${d.place}: ${$(d.amount)} neodollars${d.item ? ` and ${d.item}` : ''}. The previous owners are never going to find out where it went.`], ['Finders keepers. Crews, weepers.']),
  'dungeon_loot:arms': e((d) => [`${cap(String(d.what))} in ${d.place} has something Blackbird wants: ${d.item}.`], ['Free gear. The best kind. The best kind of free.']),
  'dungeon_loot:armor': e((d) => [`${cap(String(d.what))} in ${d.place} yields ${d.item}. It is, annoyingly, her size.`], ['Armor. For the hero. Of course.']),
  'dungeon_loot:supplies': e((d) => [`${cap(String(d.what))} in ${d.place} is full of first aid and the odd box of ammunition: ${d.item}.`], ['The responsible side of crime. Medical supplies.']),
  'dungeon_loot:data': e((d) => [`${cap(String(d.what))} in ${d.place} hum, flicker and give up ${d.item}. Somebody's life work, and a little bit of Atlas.`], ["Firmware. Credentials. Whatever. It's shiny."]),
  'dungeon_loot:vault': e((d) => [`${cap(String(d.what))} in ${d.place} opens with a sound like a very expensive sigh: ${$(d.amount)} neodollars${d.item ? ` and ${d.item}` : ''}.`], ['Now we are talking. Now we are really talking.', 'Open sesame. Open sesame. Open, you absolute thing.']),
  'dungeon_loot:jammed': e((d) => [`${cap(String(d.what))} in ${d.place} fights back. Something jams, something sparks and Blackbird takes her hands out of the works with a small hiss.`], ['It is not locked. It is just shy.']),
  'dungeon_loot:ruined': e((d) => [`Blackbird breaks ${d.what} in ${d.place} for the second time, and this time whatever was inside it is in pieces.`], ['If I cannot have it, nobody can. That includes me.']),
  slight: e(
    (d) => [d.taken ? `${d.npc} (${d.role}) looks at Blackbird wrong. Just once. The way you look at a thing you intend to step on. She notices. Oh, she notices.` : `${d.npc} (${d.role}) gives Blackbird a look that is at least a little bit rude. She lets it go. This time.`],
    (d) => [d.taken ? 'Did you see that? Did you see that look? Nobody else saw that look.' : 'I am above this. I am a bigger person. I am a bigger person, and I am noting it.'],
  ),
  impressed: e((d) => [`${d.npc} watches Blackbird do her thing. ${d.npc} is, against her better judgment, a little impressed.`, `Out of the corner of her eye, ${d.npc} is looking. Blackbird makes it look effortless. It is not.`], ['Yes. Watch. Take notes.', 'Nailed it. Subtly. In a way that is not at all subtle.']),

  // ====================================================== making a move
  'make_move:declined': e((d) => [`Blackbird says something low and meaningful to ${d.npc}. ${d.npc} smiles, pats her on the cheek, and says "not tonight." Blackbird nods like she meant to ask something else.`, `Blackbird suggests that she and ${d.npc} take this somewhere more private. "Cute," says ${d.npc}, and goes back to their drink.`], ['Playing hard to get. I love a challenge.', 'Nothing a good night and a little denial cannot fix.']),
  'make_move:slap': e((d) => [`Blackbird makes her move. ${d.npc} slaps her, without malice, with precision, and with a sound the whole bar hears.`], ['Is that a yes? That felt like a "maybe".']),
  'make_move:private': e(
    (d) => {
      const spot = String(d.spot);
      const forb = d.tier === 'forbidden';
      const who = String(d.npc);
      const lead =
        spot.includes('bathroom') || spot.includes('stall') ? `Blackbird and ${who} slip into the bathroom stall. The door says SANITARY-ISH. The lock is more of an idea.`
        : spot.includes('fridge') ? `Blackbird and ${who} find the walk-in fridge. It is cold in there. They are, briefly, not.`
        : spot.includes('couch') ? `Blackbird steers ${who} into the backroom, onto a couch that has seen better, and worse, and a poker night.`
        : spot.includes('green room') ? `Blackbird and ${who} find the band's green room. The door has a sign on it. They put it on the outside.`
        : spot.includes('crawlspace') ? `Blackbird and ${who} climb into the maintenance crawlspace, where the pipes hum a tune that is not remotely romantic and nobody cares.`
        : spot.includes('VIP') ? `Blackbird and ${who} slide into a dark VIP booth. The velvet is, mostly, a suggestion. The camera, discreetly, finds the ceiling.`
        : spot.includes('alley') ? `Blackbird and ${who} duck into the alley behind the Halo. Neon, steam, and a very large dumpster make for excellent chaperones.`
        : `Blackbird and ${who} find ${spot}. Neither is thinking about the view.`;
      return [forb ? `${lead} They should not be in here. This is part of the appeal.` : lead, d.wasted ? `${lead} Neither of them is entirely sure where "here" is, which is helpful.` : lead];
    },
    ["I'm a professional. At everything.", 'The hero gets a little downtime. It is in the contract. I wrote the contract.', 'This is a very good plan. I made it up eleven seconds ago.'],
  ),
  'make_move:public': e(
    (d) => [d.outdoors ? `Blackbird and ${d.npc} decide that a street is a place, and places are for this. Strand Street has seen worse. Probably.` : `Blackbird and ${d.npc} decide that a bar is basically a bedroom with bad lighting. They do not leave ${d.place}. Nobody has asked them to. Yet.`, d.wasted ? `Neither of them is quite sober enough to find the door. They improvise right where they are, in front of ${d.place}.` : `Blackbird and ${d.npc} do not so much "find a room" as "become the room." Several patrons suddenly find their drinks very interesting.`],
    ['Privacy is a bourgeois concept.', 'Everyone loves a show. I am an excellent show.', 'The camera in the corner is going to need a little time to think about this.'],
  ),
  'make_move:public_tossed': e((d) => [`${d.npc} hauls both of them out by the collar, mid-sentence. "THIS IS A BAR," {they} say{s}, in the voice of someone whose bar has never been used for this. ${d.partner} is laughing. Blackbird is very nearly dignified.`], ['{They} did not even ask. {They} just tossed us. How rude. How fair.']),
  'make_move:public_cheer': e((d) => [`The crowd, to its enormous credit, claps. Someone starts a chant. ${d.npc} takes a bow, and so does Blackbird. It does wonders for the legend.`], ["That's how a hero spends her evening. In front of an audience."]),
  'make_move:invite': e((d) => [`"Come back to mine," says ${d.npc}, in a tone that does not leave room for a counter-offer. They leave ${d.place} together, ${d.npc} leading the way to ${d.home}.`, `${d.npc} takes Blackbird by the hand and walks her out of ${d.place}. "It is not far," ${d.npc} says. It is, in fact, a bit far. They go anyway.`], ["Her place. I'm going to her place. I'm going to see the inside of a real person's life.", 'What could possibly happen on a dark street in Neo?']),
  'make_move:jumped': e((d) => [Number(d.count) === 1 ? `A mugger steps out of the neon halfway down the block. ${d.npc} says something unkind and bolts. Blackbird, who has been interrupted, is, understandably, in a mood.` : `Two muggers step out of the dark halfway down the block. ${d.npc} takes one look and bolts. Blackbird, interrupted, rolls up her sleeves.`], ['Of all the nights.', 'You picked the wrong time. Statistically, you picked the worst possible time.']),
  'make_move:jump_won': e((d) => [`Blackbird dusts herself off. ${d.npc} comes back around the corner, a little ashamed, a lot impressed. "You're the real thing," ${d.npc} says. They go the rest of the way hand in hand.`], ['See? Heroes are good for the neighborhood.']),
  'make_move:jump_ruined': e((d) => [`By the time Blackbird picks herself up, ${d.npc} is long gone and so is the mood. The night has taken a different turn.`], ['It would have been a good one.']),
  'make_move:caught_staff': e((d) => [`The door opens. ${d.npc} (${d.role}) takes in the situation, and ${d.partner}, and Blackbird, in that order. "Not in ${d.spot}," ${d.npc} says, with a restraint that is almost frightening.`], ["I can explain. I will not explain.", 'He is staring. Everyone is staring. This is fine.']),
  'make_move:caught_band': e((d) => [`The door swings open and a bandmate (${d.npc}) walks in on them. "Oh, come on," ${d.npc} says. "Not on the amp." The rest of the band can be heard laughing in the hallway.`], ['They write songs about this. Possibly this one.']),
  'make_move:caught_guard': e((d) => [`A flashlight hits them from the doorway. ${d.npc}, Neon Pharaoh security, clears {their} throat. "This is a staff area." The way {they} say{s} "staff" is quite pointed.`], ['I am staff. I am the staff of life.']),
  'make_move:caught_police': e((d) => [`A flashlight, a badge, and a very tired NPD officer. "Public indecency, citizens," the officer says, in the voice of a man reading it off a list for the ninth time this week.`], ['Is it public if I only have the one audience member?']),
  'make_move:caught_robot': e((d) => [`The maintenance bot, ${d.npc}, rolls around the corner, aims its one working eye at the situation, and emits a long, mournful beep. It is not clear whether this is a complaint.`], ['I am being judged by a vacuum cleaner.']),
  'make_move:caught_drone': e(() => ['A surveillance drone drifts past the window, takes a long look, and files it under "behavior: noted." The shutter sound is the least subtle thing about it.'], ['If that goes in my record, the record is going to have a lot of chapters.']),
  'make_move:fined': e((d) => [`The officer writes out a ticket for ${d.amount} neodollars for "unlicensed affection". Blackbird pays it, with a certain amount of pride.`], ['Tax on greatness. Third time this week. Different greatness.']),
  'make_move:afterglow': e(
    (d) => {
      const who = String(d.npc);
      if (d.flavor === 'interrupted') return [`What was left of the evening with ${who} is better than none. They part with a nod, a grin, and a little less than they hoped for. Satisfaction: partial.`, `${who} fixes their jacket. "Another time." Blackbird is, at best, three-quarters satisfied.`];
      if (d.flavor === 'wallet') return [`Blackbird wakes up, or comes around, or whatever it is, to find ${who} gone and ${d.lost} neodollars with them. It was, on balance, worth it.`, `${who} is a very good time and a very good pickpocket. ${d.lost} neodollars, gone with the dawn.`];
      if (d.flavor === 'number') return [`Afterwards, ${who} writes a number on her wrist in glowing ink. "Call me," ${who} says. "Don't do the thing where you don't." It is, by any measure, a promising development.`, `${who} walks Blackbird to the door. "That was... unexpectedly great." Blackbird, for a moment, forgets about dragons.`];
      if (d.where === 'home') return [`The camera, discreetly, finds the plant on the windowsill. Hours later, ${who} makes breakfast, and Blackbird is, for the first time all night, entirely at peace. ${d.spot}, it turns out, is a very good place to be a hero.`, `Dawn finds Blackbird in ${d.spot}, looking at the ceiling with a smile that goes all the way down. ${who} is making coffee. It is, quite possibly, the best night of her life.`];
      if (d.where === 'public') return [`Afterwards, ${who} straightens their clothes and the room slowly resumes its life. Blackbird is, as far as she is concerned, a new person. Sated.`];
      return [`The camera, discreetly, finds the ceiling. Some time later, Blackbird and ${who} emerge, flushed, mussed and extremely pleased with each other. She is, in every sense, sated.`, `Blackbird comes out of ${d.spot} with a grin that could cut glass. ${who} follows, a few steps behind, straightening her collar.`];
    },
    (d) => (d.flavor === 'interrupted' ? ['Rain check. A heroic rain check.', 'The universe has a sense of humor and it is aimed squarely at me.'] : d.flavor === 'wallet' ? ['Cheap at the price. I think.', "She took my money. I took the rest of the night. We're even."] : ['Okay. Okay. Wow. Okay.', 'I could save the whole city right now. After a nap.', "That's the stuff. That's what I was fighting for. Probably."]),
  ),
  // ---------------------------------------------------------------- property offices (realty.ts)
  realty_buy: e(
    (d) => d.variant === 'townhouse'
      ? [`${cap(String(d.npc))} walks Blackbird through the paperwork at ${d.place} with the gentle pace of someone who has done this for people with more money. ${$(d.price)}nd, and ${d.home} on ${d.building} is hers: gate, stairs, the lot. Deeds owned: ${d.owned}.`, `Blackbird signs for ${d.home}. ${cap(String(d.npc))} says "welcome to the neighbourhood" in a voice that suggests the neighbourhood has not been consulted. ${$(d.price)}nd. It is hers.`]
      : [`${cap(String(d.npc))} slides a tablet across the desk at ${d.place}. Blackbird thumbs it. ${$(d.price)}nd, and ${d.home} is hers: a lock with her name on it, in ${d.building}. Deeds owned: ${d.owned}.`, `${$(d.price)}nd to ${d.place}, and ${d.home} goes on Blackbird's name. The key is a card the size of a stamp. She holds it like a medal.`],
    (d) => (d.variant === 'townhouse' ? ['I own a lawn. I own a lawn.', 'The gate knows me now. The gate!'] : ['Mine. Three metres by two. Mine.', 'A door. With a lock. That only I can open. Probably.']),
  ),
  realty_view: e(
    (d) => [`${cap(String(d.npc))} turns the screen at ${d.place} toward Blackbird: ${d.count} home${d.count === 1 ? '' : 's'} on the board, ${$(d.cheapest)}nd to ${$(d.dearest)}nd. ${d.pods ? `${d.pods} pod apartment${d.pods === 1 ? '' : 's'}` : ''}${d.pods && d.townhouses ? ' and ' : ''}${d.townhouses ? `${d.townhouses} townhouse${d.townhouses === 1 ? '' : 's'}` : ''}. "A very good time to buy," ${d.npc} says, as if it has ever not been.`],
    ['Prices like a typo. In the wrong direction.', 'Somebody lives in each of these. Eventually.'],
  ),
  // ---------------------------------------------------------------- the bank
  deposit: e(
    (d) => {
      const tail = `${$(d.net)} neodollars go into her account${Number(d.fee) ? ` after a ${d.pct}% cut of ${$(d.fee)}` : ' with no cut at all'}. Balance: ${$(d.balance)}.`;
      switch (d.variant) {
        case 'alley': return [`Blackbird slides a loose brick out of the alley wall and feeds it the cash, one folded bill at a time. ${tail}`];
        case 'street': return [`The Ironvault ATM blinks twice and agrees to take her money, a state of affairs the screen's crack makes dubious. ${tail}`];
        case 'club': return [`The coat-check attendant slides an envelope under the glass and doesn't make eye contact. ${tail}`];
        case 'backlot': return [`A street kid opens the false bottom of a milk crate, counts, and writes a number on the wall. ${tail}`];
        case 'kitchen': return [`Behind the walk-in freezer there is a panel, and behind the panel there is a drop point. Bao pretends not to see. ${tail}`];
        case 'tunnel': return [`Blackbird thumbs a lockbox open in the crawlspace, between a fuse bank and something that hums. ${tail}`];
        case 'roof': return [`The pigeon coop has a lockbox in it, and the pigeon has an opinion about it. ${tail}`];
        default: return [`Blackbird feeds the pharmacy's night-deposit slot like it owes her money. ${tail}`];
      }
    },
    (d) => [
      Number(d.left) >= 20 ? 'Money you can\'t spend is money that can\'t die with you. Smart. I hate it.' : 'Pockets: nearly empty. Account: not. Weird feeling.',
      'The lab guy can have it. I\'ll be back for it. In a new body.',
      Number(d.fee) > 30 ? 'A cut that big is basically a mugging with paperwork.' : 'Cheap insurance. Not that I\'m going to need it.',
    ],
  ),
  death: e(
    (d) => [`Blackbird is dead. Level ${d.level}. ${d.place}. Cause: ${d.cause}. Killed by ${d.killer}.`, `Blackbird flatlines in ${d.place}. Level ${d.level}. The report will say "${d.cause}".`],
    ['Huh. Okay. That was unexpected.', "Tell my fans I'll be back. Tell the cops I wasn't here."],
  ),
  victory: e(() => ['CINDERJAW comes down in a spiral of fire and flapping ads. The Kowloon Overpass falls silent. Somewhere, an Atlas stock price flickers, and out along the district edge the lockdown cordons go dark, one by one.'], ['Dragon: slain. The district is open. Neo has been waiting, and I do not think it is going to be this polite.']),
  closing: e((d) => [`${cap(String(d.place))} is closing. The lights come up, the music stops, and somebody with a broom and no patience shows Blackbird to the pavement.`, `Last orders came and went. ${cap(String(d.place))} wants to be empty, and Blackbird is, technically, a person.`], ['Closing time. You do not have to go home, but you cannot stay here.']),
  dawn: e((d) => [`Dawn breaks over Neo. Blackbird, somehow still alive, squints at it from ${d.place}. Day ${d.day}. The night ran out before she did, so she carries on.`, `The sky over ${d.place} goes grey, then pink, then an ad. Blackbird is still here. Day ${d.day} begins.`], ['Still not dead. Keep going.', "Sun's up. I'm told that's bad for people like me."]),
  // ---------------------------------------------------------------- jobs (quests.ts)
  'quest:offer': e(
    (d) => {
      const job =
        d.qkind === 'flatline' ? `${d.target} has to go, and ${d.target} is at ${d.place}`
        : d.qkind === 'retrieve' ? `${d.what} is in ${d.place}, and wants fetching`
        : `${d.what} is behind a door at ${d.place}, and somebody has to get into it`;
      const want =
        d.want === 'wants_money' ? `${d.npc} is short, and says so`
        : d.want === 'wants_out' ? `${d.npc} wants out, and knows it will take someone else's hands`
        : d.want === 'wants_to_find' ? `${d.npc} is looking for ${d.rel ? `a ${d.rel}` : 'someone'}, and this is the way to it`
        : `${d.npc} wants some peace, and this is what peace costs`;
      return [
        `${want}. ${cap(job)}. The pay is ${$(d.reward)} neodollars, and ${d.npc} draws the way on a napkin: a few streets past anything Blackbird has bothered to look at.`,
        `${d.npc} has a job. ${cap(job)}. ${cap(want)}. ${$(d.reward)} neodollars on delivery. The napkin has a route on it, and the route has street names in it that Blackbird does not know yet.`,
      ];
    },
    ['A job. A real one. With a napkin.', 'People always know exactly where the thing is. Never how to get it.', 'I have never once been handed a napkin I did not later regret.'],
  ),
  'quest:accept': e(
    (d) => [
      d.why === 'liking' ? `${d.npc} has been decent to Blackbird, and Blackbird, for reasons she will deny, takes the job.` : `${$(d.reward)} neodollars is ${$(d.reward)} neodollars. Blackbird says yes before ${d.npc} finishes the sentence.`,
      `Blackbird takes the job. ${d.npc} looks relieved, and a little afraid of what ${d.npc} has just set in motion.`,
    ],
    ['Consider it handled.', 'It is only a job. I have done the thing before. Something like it.', 'Say no more. Actually say the amount again.'],
  ),
  'quest:decline': e(
    (d) =>
      d.why === 'work' ? [`Blackbird hears ${d.npc} out, looks at how far it is and what it will take, and says no. ${d.npc} says that is fair. ${d.npc} does not mean it.`]
      : d.why === 'liking' ? [`Blackbird has no reason to do ${d.npc} any favors, and says as much, in fewer words. The napkin goes back in ${d.npc}'s pocket.`]
      : [`${$(d.reward)} neodollars does not clear the bar. Blackbird tells ${d.npc} it is not worth her evening. ${d.npc} tries a higher number, in {their} head, and does not say it.`],
    ['Not for that.', 'I have standards. They are low, but I have them.', 'A hero has to pick her fights. This one picked itself and I disagreed.'],
  ),
  'quest:later': e(
    (d) => [`The job for ${d.npc} goes on the list, behind everything Blackbird was already doing. She will get to it.`, `Blackbird tucks the napkin in her jacket. ${cap(String(d.place))} will keep. Probably.`],
    ['Soon. Ish. In a heroic sense.', "It's on the list. The list is long. I love the list."],
  ),
  'quest:retrieved': e(
    (d) => [`${cap(String(d.what))} is in Blackbird's jacket. ${d.watched ? 'The room did not notice. She is almost offended.' : 'Nobody even knew it was missing.'} Now to bring it back to ${d.npc}.`],
    ['Fetched. Good girl. Good dog. I contain multitudes.', 'That is the whole job. Now the part where I have to walk home with it.'],
  ),
  'quest:fumbled': e(
    (d) => [`Blackbird gets a grip on ${d.what} and does not get all of it. Something clatters. It is not the sort of clatter she can pretend was a pipe.`],
    ["That was a practice grab. Everyone gets one."],
  ),
  'quest:ruined': e(
    (d) => [`${cap(String(d.what))} comes apart in Blackbird's hands, in a way that matters. The job is over for tonight. ${d.npc} is not going to be pleased.`],
    ['It was like that when I found it. It was in much better condition when I found it.'],
  ),
  'quest:hacked': e(
    (d) => [`The firewall goes down easy. Blackbird is into ${d.what}, ${d.watched ? 'with the room none the wiser and its eyes on the wrong thing' : 'in the quiet'}, and does what ${d.npc} asked. It takes a moment. It takes a moment that feels, from inside, like an hour.`],
    ['In. Out. Barely sweating. Jackpot, in the sense that it is a job well done.', 'Jacked in, no problem. Seriously, no problem.'],
  ),
  'quest:jammed': e(
    (d) => [`${cap(String(d.what))} bites back: a wall of black ICE, a lockout timer and a lot of red. Blackbird backs out of it, thumbs aching.`],
    ['It is a very rude system. No manners at all.', 'Again. Nobody remembers the first attempt. Mostly me.'],
  ),
  'quest:locked': e(
    (d) => [`${cap(String(d.what))} purges itself, and everything in it, with an ugly little flourish. The way in is gone for tonight. ${d.npc} will have been hoping for better.`],
    ['Scorched earth. Mine, I think. Maybe theirs. Hard to tell.'],
  ),
  'quest:paid': e(
    (d) => [
      d.qkind === 'flatline' ? `Blackbird tells ${d.npc} that ${d.target} is no longer a concern. ${d.npc} has to sit down. Then ${d.npc} pays the ${$(d.reward)} neodollars, counting out every note.`
      : d.qkind === 'retrieve' ? `${d.npc} takes ${d.what}, turns it over twice and holds it against {their} chest. ${$(d.reward)} neodollars changes hands. It is the most honest transaction Blackbird has had all week.`
      : `Blackbird tells ${d.npc} that ${d.what} is sorted. ${d.npc} checks, twice, then pays out ${$(d.reward)} neodollars with a look of pure, unhealthy gratitude.`,
    ],
    ['That is how a job ends. The money, then the weird silence.', 'Satisfied customer. I am a professional now.', 'I could get used to being thanked. Briefly. Then it would get weird.'],
  ),
  'quest:lost': e(
    (d) => [`${d.npc} asks for ${d.what}, and Blackbird has to explain that she does not have it any more. ${d.npc} does not take it well. The job is back on.`],
    ['It was right here. I had it. I distinctly remember having it.'],
  ),
  'quest:void': e(
    (d) => [`Whatever ${d.npc} wanted, ${d.npc} is not around to pay for it. Blackbird does the math. It is annoying math.`],
    ['Free work. I will not be doing that again.'],
  ),
  'goal_new:quest_now': e(
    (d) => [`Blackbird sets out on the job for ${d.npc} straight away. New objective: ${d.goal}.`, `No time like the present. Blackbird heads for ${d.place}. New objective: ${d.goal}.`],
    ['I am a professional now. A fast one.', 'Pay first, ask later. Wait. Wrong way round.'],
  ),
  'goal_new:quest_resume': e(
    (d) => [`Blackbird remembers the job for ${d.npc}, folded up in her jacket. She decides tonight is the night. New objective: ${d.goal}.`, `The job for ${d.npc} comes back to her, as these things do. New objective: ${d.goal}.`],
    ['That napkin. Yes. The napkin.', "Time to be a professional again."],
  ),
  'goal_new:quest_collect': e(
    (d) => [`Blackbird remembers that ${d.npc} owes her ${$(d.reward)} neodollars for a job she has already done. She sets off to collect. New objective: ${d.goal}.`],
    ['Money owed is money I am not holding. That is a crime.', 'Invoice time. In person.'],
  ),
  'goal_resume:quest': e((d) => [`Blackbird thinks of the job for ${d.npc}, and the ${$(d.reward)} that goes with it.`], ['The money is not going to earn itself. It is going to be earned by me.']),
  'goal_note:quest_in': e(
    (d) => [
      d.style === 'clear' ? `Blackbird is through the door of ${d.place}, and she has no plans to be quiet about it. ${d.qkind === 'flatline' ? `${cap(String(d.target))} is in there somewhere, and so is everyone else.` : 'Everyone in here is in the way.'}`
      : `Blackbird eases into ${d.place} and keeps her head low. Whatever she came for is deeper in, and so are the people who would rather she did not.`,
    ],
    ['Subtle is a skill. I have decided to have it.', 'Loud, quiet. Pick one, I did.', 'In. Easy. And then the rest of the thing.'],
  ),
  'goal_note:quest_blown': e(
    (d) => [`The quiet part of the job is over: somebody in ${d.place} has raised the alarm. Blackbird stops creeping and starts kicking.`],
    ['Plan B. Plan B is Plan A with a worse mood.', 'Fine. If everyone is awake, everyone is a witness. Or a target.'],
  ),
  'goal_note:quest_retreat': e(
    (d) => [`Blackbird has taken more of ${d.place} than she can carry. She backs out the way she came in, bleeding in a measured, professional way.`],
    ['Tactical retreat. A thing a pro does. Often.', 'I will come back. With a better plan. And possibly a sandwich.'],
  ),
  'goal_note:quest_ready': e(
    (d) =>
      d.qkind === 'flatline' ? [`${cap(String(d.target))} is no longer a problem. The job is done, and the only part left is telling ${d.npc}, wherever ${d.npc} has got to.`]
      : d.qkind === 'retrieve' ? [`Blackbird has ${d.what}. The only part left is putting it into ${d.npc}'s hands, wherever ${d.npc} has got to.`]
      : [`${cap(String(d.what))} has done as it was told. All that is left is saying so to ${d.npc}, wherever ${d.npc} has got to.`],
    ['Half of the money is in the doing. The other half is in the telling.', 'Now the walk home. The long, rich walk home.'],
  ),
  'goal_done:quest': e(
    (d) => [`The job for ${d.npc} is closed. Blackbird has the ${$(d.reward)}, and ${d.npc} has the look of someone who owes her one.`, `${cap(String(d.npc))} is square with Blackbird. The job is closed, and so is the book.`],
    ['Done. Paid. Next.', 'One for the portfolio. Not that I have a portfolio. Yet.'],
  ),
  'goal_drop:quest_failed': e(
    (d) => [`The job for ${d.npc} is spoiled for tonight. Blackbird shrugs it off and leaves it for another night. The pay is still on the table, which is something.`],
    ['A bad night for work. There will be others.', 'Not my fault. Systems fail. Things break. I was nearby.'],
  ),

  // ---- sleep and hunger (rest.ts)
  'sleep:pod': e(
    (d) => [`Blackbird feeds ${d.cost}nd into ${d.name} and folds herself into a capsule the size of a filing drawer. The lid hums shut. ${d.hours} hours.`, `${cap(String(d.name))}: ${d.cost}nd, a drawer in a wall and a lid that seals with a sigh. Blackbird goes in feet first.`],
    ['It is a coffin with Wi-Fi. I love it.', 'Claustrophobia is just a feeling. I do not have feelings before noon.'],
  ),
  'sleep:hostel': e(
    (d) => [`A bunk in ${d.name}: ${d.cost}nd, a thin blanket and a dozen strangers breathing out of sync. Blackbird sleeps with one boot on and her wallet in her fist.`, `${cap(String(d.name))} sells Blackbird a bunk for ${d.cost}nd. The mattress has a history. She lies down on top of it.`],
    ['If anyone touches my wallet I will wake up. Probably.', 'Roommates. Cozy. Suspicious. Cozy.'],
  ),
  'sleep:hotel': e(
    (d) => [`${cap(String(d.name))} gives Blackbird a room, a door that locks itself and a bed with more pillows than she has opinions. ${d.cost}nd. She is out before the lights finish dimming.`, `${d.cost}nd buys Blackbird a room at ${d.name}: clean sheets, blackout glass, a lock that logs everyone who touches it. She does not touch the minibar. Much.`],
    ['This is what winning feels like.', 'So this is what the corpos have been hiding from us.'],
  ),
  'sleep:home': e(
    (d) => Number(d.quality) >= 95
      ? [`Blackbird lets herself into ${d.name}. The door logs her, the lights go down on their own, and the bed takes her weight like it has been waiting. Nothing to pay. ${d.hours} hours.`, `${cap(String(d.name))}: the gate, the stairs, the good mattress. Blackbird is asleep before she has finished taking her boots off.`]
      : [`Blackbird lets herself into ${d.name} and the lock beeps its approval. A real mattress, a door that is hers, and nobody's elbow in her ribs. ${d.hours} hours.`, `${cap(String(d.name))} is small and it is hers. Blackbird drops her gear by the door and her face into the pillow.`],
    ['Free. Mine. Mine and free.', 'There is no place like a home you hold the deed to.'],
  ),
  'sleep:street': e(
    (d) => [`Blackbird picks a patch of ${d.place}, drags her jacket over her face and lies down on the pavement. The city goes on around her.`, `No bed she can afford, so ${d.place} will have to do. Blackbird lies down on the concrete with her hand on her pocket.`],
    ['Nobody sleeps on the street on purpose. Which is why nobody will look.', 'Home sweet pavement.'],
  ),
  'sleep:rough': e(
    (d) => [`Blackbird finds a corner of ${d.place} where nobody ought to look, curls around her gear and closes her eyes.`, `A quiet corner in ${d.place}, a wall to put her back to and a jacket for a pillow. Blackbird lets go of the night.`],
    ['A professional picks the spot with the fewest witnesses. This is that spot. Probably.', 'Best bed in the city, and nobody else knows.'],
  ),
  'sleep:faint': e(
    (d) => [`Blackbird's body makes the call without consulting her. She sits down in ${d.place} for a second. She does not get up.`, `Somewhere behind Blackbird's eyes, a fuse goes. She drops where she stands, in ${d.place}, and is gone.`],
    ['I closed my eyes. For tactical reasons.', "I wasn't asleep. I was thinking, horizontally."],
  ),

  'wake:rested': e(
    (d) => [Number(d.quality) >= 80 ? `Blackbird wakes after ${d.hours} hours feeling almost like a person. Sleep: ${d.sleep}.` : `Blackbird wakes after ${d.hours} hours, stiff, sore and not convinced that counted. Sleep: ${d.sleep}.`],
    ['Slept like the dead. Not literally.', 'Who needs sleep? I clearly do.'],
  ),
  'wake:hunger': e(
    (d) => [`Blackbird's stomach wakes her after ${d.hours} hours, loudly and with feeling. Sleep: ${d.sleep}.`],
    ['Even my organs have opinions.', 'Breakfast. Now. Possibly of a person.'],
  ),
  'wake:woken': e(
    (d) => [`Blackbird is awake. The night's rest was cut to ${d.hours} hours. Sleep: ${d.sleep}.`],
    ['I was resting my eyes.', 'It is fine. I do not need the other half of the night.'],
  ),
  'wake:jail': e(
    (d) => [`Blackbird is let out of a holding cell onto ${d.to}, ${d.hours} hours and ${d.fine}nd lighter. The bunk was a bench with ambitions. Sleep: ${d.sleep}.`],
    ['Free bed. Expensive free bed.', 'I have slept in worse. I have not been charged for it.'],
  ),
  'wake:captured': e(
    (d) => [`Atlas puts Blackbird down on ${d.to} like a parcel nobody signed for. ${d.hours} hours gone, ${d.fine}nd gone, and whatever they gave her to sleep still in her blood. Sleep: ${d.sleep}.`],
    ['Never. Telling. Anyone.', 'They were very polite about it. That is the worst part.'],
  ),

  'eat:stall': e(
    (d) => [`Blackbird buys something on a stick from ${d.cook} for ${d.cost}nd. It is hot, salty and structurally unsound. Hunger +${d.gain}.`, `${cap(String(d.cook))} hands Blackbird a paper bowl for ${d.cost}nd. She eats standing up, the way the street likes it. Hunger +${d.gain}.`],
    ['Did not ask what it was. Did not need to.', 'Eight nd. Best meal I have had in at least a day.'],
  ),
  'eat:bagel': e(
    (d) => [`Blackbird picks up a bagel at ${d.cook}, between the rifles. ${d.cost}nd. Hunger +${d.gain}.`],
    ['Best bagel I have ever had near a rocket launcher.', 'The gunsmith does the bagels himself. I have never asked why.'],
  ),
  'eat:plate': e(
    (d) => [`${cap(String(d.cook))} slides Blackbird a plate of something brown and warm for ${d.cost}nd. Hunger +${d.gain}.`],
    ['Proper food. With a fork.', 'Warm. Brown. Mine.'],
  ),
  'eat:scraps': e(
    (d) => [`Broke and hungry, Blackbird goes through the bins at ${d.place} and comes up with something that was probably food. Hunger +${d.gain}.`],
    ['Dumpster diving is a lifestyle. Mine, tonight.', 'I have eaten worse. Not much worse.'],
  ),
  'eat:scraps_sick': e(
    (d) => [`Blackbird eats something from a bin at ${d.place}. It fights back. She keeps about half of it down. Hunger +${d.gain}, and a very bad hour.`],
    ['That was not food. That was a dare.', 'Note to self: the green bit was not seasoning.'],
  ),

  'rest_incident:robbed_bed': e(
    (d) => [`Somebody's hand finds Blackbird's pockets in the dark at ${d.place}. She sleeps through all of it. ${d.lost}nd is gone by morning.`],
    ['The wallet was right there. In my hand. I think I gave it to them.', 'A hostel. Of course.'],
  ),
  'rest_incident:robbed': e(
    (d) => [`${cap(String(d.who))} sees a girl asleep on the ground and an unguarded pocket, and does the arithmetic. ${d.lost}nd leaves with them. Blackbird does not stir.`],
    ['They took what they could carry. I respect the work ethic.', 'I would have given them the change. Probably.'],
  ),
  'rest_incident:kind': e(
    (d) => [`${cap(String(d.who))} stops, looks at Blackbird, and lays a jacket over her. Then they walk on without a word.`, `${cap(String(d.who))} leaves a bottle of water by Blackbird's head and, quietly, goes.`],
    ['The city is not entirely terrible. Do not tell anyone I said that.', 'A stranger gave me a jacket. I am going to cry about it later.'],
  ),
  'rest_incident:shaken': e(
    (d) => [`${cap(String(d.who))} wakes Blackbird with a boot-toe and a speech about loitering. She is moved along.`],
    ['I was not loitering. I was asleep. Different thing.', 'Rude.'],
  ),
  'rest_incident:thief_scared': e(
    (d) => [`A hand slides toward Blackbird's pocket. She is awake before it arrives. ${cap(String(d.who))} discovers urgent business elsewhere.`],
    ['One eye open. Always one eye open.', 'Nice try. I am a light sleeper.'],
  ),
  'rest_incident:caught_thief': e(
    () => ["Blackbird wakes with a stranger's hand in her jacket. She does not take it well."],
    ['Wrong pocket.', 'Come here.'],
  ),
  'rest_incident:reported': e(
    (d) => [`${cap(String(d.who))} takes one look at the girl asleep on the ground and reaches for a phone. Sleeping rough is illegal in Neo, and the NPD take it very seriously.`],
    ['Squealer.', 'I was not sleeping rough. I was sleeping outside. Legally distinct.'],
  ),
  'rest_incident:cop': e(
    (d) => [`A boot nudges Blackbird's ribs. ${cap(String(d.who))}, ${d.role}, and a badge. "Sleeping rough is a crime, citizen."`],
    ['Technically I am resting my eyes in a public place.', 'Of all the places for a cop to be at 4 a.m. Why.'],
  ),
  'rest_incident:arrested': e(
    (d) => [`${cap(String(d.by))} puts Blackbird in the back of a van. Fine: ${d.fine}nd. The NPD have a policy on sleeping rough, and the policy is a cell.`],
    ['Free bed. Expensive free bed.', 'You are welcome, taxpayers.'],
  ),
  'rest_incident:captured': e(
    (d) => [`Blackbird wakes in zip-ties in the back of an Atlas van. They take ${d.fine}nd for "processing". Nobody says processing what.`],
    ['That is a very small van for this many problems.'],
  ),
  'rest_incident:attacked_npd': e(
    (d) => [`Boots. Blackbird wakes to ${d.count} NPD officers standing over her, and ${d.foe} has already swung. She is not at her best.`],
    ['I am awake! I am so awake!', 'Bad time. Bad, bad time.'],
  ),
  'rest_incident:attacked_atlas': e(
    (d) => [`A flash of white and a retrieval team standing on the shoulders of the night. ${cap(String(d.foe))} and company have found Blackbird asleep, and they are not here to talk.`],
    ['Atlas. Of course. They never miss a nap.'],
  ),
  'rest_incident:attacked_gang': e(
    (d) => [`Blackbird wakes to ${d.count} faces she does not like, and ${d.foe} already has a hand on her jacket.`],
    ['This was not in the pamphlet for sleeping in a hideout.'],
  ),
  'rest_incident:faint': e(
    (d) => [`Blackbird's knees stop taking instructions in ${d.place}. The floor comes up to meet her.`, `The world tips a few degrees in ${d.place}, and Blackbird goes with it.`],
    ['I am fine. I am just looking at the floor, very closely.', 'Nobody saw that. It was a dramatic kneel.'],
  ),
  'rest_incident:dumped': e(
    (d) => [`The staff at ${d.place} are not paid to let girls sleep on the floor. They carry Blackbird out and set her down at ${d.to}.`],
    ['A poor review. One star. For the floor.'],
  ),

  'need:hunger_hungry': e(
    (d) => [`Blackbird's stomach files a polite complaint. Hunger: ${d.level}.`, `Something in Blackbird's middle is making a noise like a drone with a grudge. Hunger: ${d.level}.`],
    ['I have been meaning to eat. I have been meaning to for a while.', 'A snack is a strategic decision.'],
  ),
  'need:hunger_famished': e(
    (d) => [`Blackbird's hands have begun to shake a little. She is famished. Hunger: ${d.level}. Everything she does is a bit harder.`],
    ['Eat. Eat soon. Eat everything.', 'This is fine. This is the diet.'],
  ),
  'need:hunger_starving': e(
    (d) => [`Blackbird is starving. Everything smells like food, including the things that are not food. Hunger: ${d.level}.`],
    ['I could eat a dragon. A small one.', 'Is that a dumpster, or is that lunch.'],
  ),
  'need:hunger_wasting': e(
    (d) => [`The edges of the world have gone soft. Blackbird is wasting away. Hunger: ${d.level}. She will not last much longer without a meal.`],
    ['Not like this. Not by hunger. I have a reputation.', 'Okay. Okay. Food. Now.'],
  ),
  'need:sleep_tired': e(
    (d) => [`Blackbird yawns, and then yawns at the yawn. Sleep: ${d.level}.`],
    ['I am not tired. I am conserving energy.', 'Five more minutes. Of everything.'],
  ),
  'need:sleep_exhausted': e(
    (d) => [`Her eyelids are filing a grievance. Sleep: ${d.level}. Blackbird is slower, and she knows it.`],
    ['A bed would be a good idea. Somebody should have one.', 'Sleep is just a rumor spread by people with jobs.'],
  ),
  'need:sleep_spent': e(
    (d) => [`Blackbird is running on spite. Sleep: ${d.level}. Any minute now, her body takes the decision out of her hands.`],
    ['I am awake. I am extremely awake. Why is the floor so close.', 'Do not blink. Do not blink. Do not blink.'],
  ),
  'sleep_debt:up': e(
    (d) => [`The bed did not do the job. Blackbird carries it with her: sleep debt ${d.stacks}. Only a good bed will clear it.`, `Something in Blackbird's neck has decided that last night was not sleep. Sleep debt ${d.stacks}, and it does not fade on its own.`],
    ['I am fine. I am only a little bit made of gravel.', 'I will catch up on it later. Everyone says that.'],
  ),
  'sleep_debt:down': e(
    (d) => [d.stacks ? `A proper bed helps. Blackbird sheds some of the weight she has been carrying. Sleep debt ${d.stacks}.` : 'A proper bed, finally. The last of the sleep debt goes out of Blackbird like a held breath.'],
    ['Oh, THAT is what it is supposed to feel like.', 'Do not tell the pods I said this.'],
  ),
  'death:starved': e(
    (d) => [`Blackbird is dead. Level ${d.level}. ${d.place}. Cause: starvation. She just kept putting it off.`, `Blackbird flatlines in ${d.place}, level ${d.level}. The report says "starvation", which is the worst thing it could say about a girl with money in her pocket.`],
    ['I was going to eat. I had a plan.', "Apparently 'later' was a bad plan."],
  ),
};

/** Thoughts that surface when a trait is turned up high (>= QUIRK_AT), keyed by event type. */
const QUIRK: Partial<Record<Trait, Record<string, string[]>>> = {
  curiosity: {
    dumpster: ['Ooh, what\'s THIS?', 'I wonder what it does when I lick it.'],
    go: ['What\'s over there? Is it shiny?', 'Is that a door? I like doors.'],
    hack: ['I\'ll just press everything.', 'Wait, which one is the on button?'],
    fuse_panel: ['I\'ll just press the red one. Red means good.'],
  },
  temper: {
    challenge: ['Nobody looks at me like that.', '{They} looked at me. That is a violation.'],
    fight_start: ["I don't care how big {they:foe} {is:foe}.", 'Hit me first. I dare you.'],
    pickpocket: ["Oh, you caught me? Good. Let's fight."],
    flirt: ["No? NO? Say that to my face. Again."],
  },
  romantic: {
    flirt: ["This is it. I can feel it. This is The One.", 'Her eyes are like twin neon moons.'],
    kiss: ['I think I\'m in love.', 'Marry me, I think.'],
    chat: ['They have the nicest voice.'],
    dance: ['Dance with me forever. Or until the music ends.'],
  },
  impress: {
    flirt: ['Watch this. Girls love a hero.', 'Is she looking? She is looking. Act natural. Act heroic.'],
    kiss: ['Add one to the list. A short, dignified list.'],
    dance: ['Every eye in the room. Mine especially.'],
    buy_round: ['Drinks for everyone! Especially her. Is she watching?'],
  },
  drink: {
    order_drink: ["Just the one. Or four.", "It's medicinal."],
    karaoke: ["I've had exactly the right amount for this."],
    buy_round: ['To me!', 'Everyone drink. That is an order from a hero.'],
  },
  gamble: {
    pool: ['Double or nothing. Triple. Whatever.', "I never lose. I just run out of money."],
    safe: ['Feeling lucky. Always feeling lucky.'],
    rob_till: ["Let's see what the house has."],
    karaoke: ['Ten neodollars says I hit the high note.'],
    poker: ['All in. I have a feeling. The feeling is wrong, but it is a big feeling.'],
  },
  fame: {
    dj_set: ['They will remember this. They will have to.', 'Somebody is filming. Somebody had better be filming.'],
    gig: ['Put my name on the poster. Larger.'],
    busk: ['Every pedestrian is a future fan.'],
    karaoke: ['Autograph line forms on the left.'],
    graffiti: ['A signature is just a tiny billboard.'],
    mirror: ['The face of a legend. Hello, legend.'],
  },
  justice: {
    challenge: ['Somebody has to. Might as well be the hero.', 'This one has it coming. Probably. Almost certainly.'],
    fight_start: ['Justice has a left hook.', 'For the city. And also for me.'],
    rescue: ['Hold on. The cavalry is here. It is me. I am the cavalry.'],
  },
  kindness: {
    pet_puppy: ['Who is a good robot. You are. Yes.'],
    chat: ['Everyone is carrying something. Even the guys who are carrying guns.'],
  },
  mischief: {
    dumpster: ['What is the worst that could happen. Do not answer that.'],
    hack: ['Let us see what this does to the lights.'],
    fuse_panel: ['It says DO NOT. So, you know. Do.'],
  },
  grudge: {
    challenge: ['I remember you. I remember everything.'],
    recognition: ['Oh, I remember you too.'],
  },
  thrill: {
    parkour: ['Gravity is more of a suggestion.'],
    join_brawl: ['Finally. Something with a pulse.'],
  },
  appetite: {
    eat_noodles: ['Second dinner. First dinner was a lie.'],
    cook: ['I will taste it as I go. All of it.'],
  },
  vanity: {
    mirror: ['Hello, gorgeous. Yes, you. Yes, me.'],
    flirt: ['Honestly, who could say no to this?'],
  },
  techy: {
    hack: ['Ooh. Firmware. Talk dirty to me in assembly.'],
    terminal: ['A real terminal. Look at that bloated, glorious thing.'],
  },
  animal: {
    pet_puppy: ['Best boy. Best robot boy. Best boy.'],
    feed_pigeon: ['Hello, tiny dinosaur. Have a crumb.'],
  },
};

/** How far above unremarkable a trait has to be before it colours her thoughts. */
const QUIRK_AT = 0.7;


/** What a cut across took, in a clause: she `climbs a wall`, they `put the vehicle through a fence`. */
const CUT_VIA: Record<string, [string, string]> = {
  vault: ['vaults a fence', 'vault a fence'],
  vault_failed: ['goes at a fence and gets tangled in it', 'get tangled in a fence'],
  smash_fence: ['puts the vehicle through a fence', 'put the vehicle through a fence'],
  climb: ['goes up and over a wall', 'go up and over a wall'],
  climb_failed: ['falls off a wall', 'fall off a wall'],
  breach: ['shoulders through a barricade', 'shoulder through a barricade'],
  breach_failed: ['gets stuck in a barricade', 'get stuck in a barricade'],
  ram_barricade: ['goes through a barricade at speed', 'go through a barricade at speed'],
  barricade_crash: ['hits a barricade and goes down', 'hit a barricade and go down'],
  crawl: ['crawls through ductwork', 'crawl through ductwork'],
  crawl_stuck: ['gets stuck in ductwork', 'get stuck in ductwork'],
  through: ['runs straight through a building', 'run straight through a building'],
  through_spotted: ['is seen cutting through a building', 'are seen cutting through a building'],
  jump: ['launches off a ramp and over the roofs', 'launch off a ramp and over the roofs'],
  jump_failed: ['misjudges a ramp', 'misjudge a ramp'],
  stairs: ['takes the stairs', 'take the stairs'],
};
const cutVia = (d: EventData, plain: string): string => {
  const codes = String(d.obstacles ?? '').split(',').filter((x) => CUT_VIA[x]);
  if (!codes.length) return plain;
  const list = codes.map((x) => CUT_VIA[x]![0]);
  return list.length === 1 ? list[0]! : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]!}`;
};

const FALLBACK_KEYS = (e_: GameEvent): string[] => {
  const d = e_.data;
  const keys: string[] = [];
  // A bike has its own lines where it differs from a car: `type:variant:bike`, else `type:bike`.
  if (d.body === 'bike' || d.body === 'foot') keys.push(...(d.variant !== undefined ? [`${e_.type}:${d.variant}:${d.body}`] : []), `${e_.type}:${d.body}`);
  if (d.variant !== undefined) keys.push(`${e_.type}:${d.variant}`);
  if (d.injury !== undefined) keys.push(`${e_.type}:${d.injury}`);
  if (d.kind !== undefined) keys.push(`${e_.type}:${d.kind}`);
  keys.push(`${e_.type}:${e_.outcome}`, e_.type);
  return keys;
};

/** The thought from her most pronounced trait that has something to say about this event. */
function quirkFor(ev: GameEvent, p: Personality): string[] | undefined {
  let best: string[] | undefined;
  let bestVal = QUIRK_AT;
  for (const t of TRAITS) {
    const v = p.traits[t];
    if (v < bestVal) continue;
    const q = QUIRK[t]?.[ev.type] ?? QUIRK[t]?.[`${ev.type}_${ev.data.variant}`];
    if (q) {
      best = q;
      bestVal = v;
    }
  }
  return best;
}

function lines(l: Lines | undefined, d: EventData): string[] {
  if (!l) return [];
  return typeof l === 'function' ? l(d) : l;
}

function interp(s: string, d: EventData, extra: Record<string, string>): string {
  return s.replace(/\{(\w+)(?::(\w+))?\}/g, (whole, k: string, who: string | undefined) => {
    if (extra[k] !== undefined) return extra[k];
    if (d[k] !== undefined) return String(d[k]);
    // {they}, {their:victim}, {is}: pronouns and agreement for a person in the event (default: `npc`)
    return pronounToken(k, d[`${who ?? 'npc'}_g`]) ?? whole;
  });
}

/** Turn one engine event into one or two lines of prose. */
export function render(ev: GameEvent, ctx: RenderCtx): TextLine[] {
  let entry: Entry | undefined;
  for (const k of FALLBACK_KEYS(ev)) {
    if (T[k]) {
      entry = T[k];
      break;
    }
  }
  const out: TextLine[] = [];
  if (!entry) {
    out.push({ voice: 'report', text: `[${ev.type}${ev.data.variant ? ':' + ev.data.variant : ''}]` });
    return out;
  }
  const extra = { hero: 'Blackbird', real: ctx.realName };
  const rs = lines(entry.r, ev.data);
  if (rs.length) out.push({ voice: 'report', text: interp(ctx.rng.pick(rs), ev.data, extra) });
  if ((ev.type === 'go' || ev.type === 'drive') && ev.data.first === true && typeof ev.data.blurb === 'string') {
    out.push({ voice: 'report', text: ev.data.blurb }); // a place the city made up as she got there, or one that changed hands
  } else if (ev.type === 'go' && ev.data.first === true && typeof ev.data.toId === 'string' && BLURBS[ev.data.toId]) {
    out.push({ voice: 'report', text: BLURBS[ev.data.toId]! });
  }
  const alwaysThought = ['death', 'victory', 'level_up', 'depart', 'fight_end', 'dragon_confront'].includes(ev.type);
  const quirk = quirkFor(ev, ctx.personality);
  const ts = lines(entry.t, ev.data);
  if (quirk && ctx.rng.chance(0.4)) {
    out.push({ voice: 'thought', text: interp(ctx.rng.pick(quirk), ev.data, extra) });
  } else if (ts.length && (alwaysThought || ctx.rng.chance(0.65))) {
    out.push({ voice: 'thought', text: interp(ctx.rng.pick(ts), ev.data, extra) });
  }
  return out;
}

export function hasTemplate(ev: GameEvent): boolean {
  return FALLBACK_KEYS(ev).some((k) => !!T[k]);
}
