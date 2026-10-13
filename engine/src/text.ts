import type { Rng } from './rng.js';
import type { GameEvent, EventData } from './events.js';
import { GANGS } from './content/archetypes.js';

export interface TextLine {
  /** `report` = neutral field report. `thought` = Blackbird's own cocky inner voice. */
  voice: 'report' | 'thought';
  text: string;
}

export interface RenderCtx {
  rng: Rng;
  /** Personality archetype id, for quirk-specific thoughts. */
  archetype: string;
  realName: string;
}

type Lines = string[] | ((d: EventData) => string[]);
interface Entry {
  r: Lines;
  t?: Lines;
}
const e = (r: Lines, t?: Lines): Entry => ({ r, t });

export const BLURBS: Record<string, string> = {
  halo_floor: 'The Rusty Halo: synth-whiskey, neon halos that flicker in Morse code, and a jukebox that has opinions.',
  halo_restroom: 'The bathroom. The stall door says OPEN 24H. Someone has a surgical tray on the sink.',
  halo_kitchen: 'The kitchen smells like frying oil and bad decisions. Six hands are working on one order of noodles.',
  halo_arcade: 'The basement arcade. A laser-tag arena glows in the dark. A league banner reads NEON KNIGHTS: 0 WINS.',
  halo_backroom: 'The backroom: poker table, cigar smoke, and a wall safe that wants to be loved.',
  halo_roof: 'The Halo roof. Wind, rust, and the whole megacity laid out like a circuit board.',
  halo_alley: 'The alley behind the Halo. Steam vents, puddles with colors, and a dumpster that has seen things.',
  street_main: 'Strand Street. Rain, neon, ads for things that should not be advertised.',
  neon_pharaoh: 'The Neon Pharaoh: gold-plated hologram sphinxes, bass you can feel in your implants, a velvet rope guarded by sunglasses.',
  club_maintenance: 'A maintenance crawlspace: pipes, cables, and the distant sound of someone else being very wrong about the lease.',
  helix_dock: 'Helix Biotech loading dock. Everything is matte-black and has a barcode.',
  helix_lobby: 'The Helix lobby: white marble, a fountain, and a logo that looks at you.',
  helix_lab: 'Helix Research Wing. Glass cages. Something in one of them is humming a tune.',
  overpass: 'The Kowloon Overpass. The air tastes like ozone. Up above, a shape blots out the neon.',
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
  'go:walk': e((d) => [`Blackbird heads for ${d.to}.`, `Off to ${d.to}.`, `Blackbird takes the long way to ${d.to}.`], ['Onward.', "Destiny's that way. Probably."]),
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

  'gate:bounced_mouthy': e((d) => [`Blackbird tells ${d.npc} what she thinks of velvet ropes. He thinks about it, then picks her up by the collar.`], ["I was just getting started."]),
  'gate:turned_away': e((d) => [`${d.npc} shakes his head. Not tonight. Not in those boots.`, `"Name's not on the list." ${d.npc} is unmoved. Blackbird stays outside.`], ["Their loss. Seriously."]),
  'gate:tiny_heard': e((d) => [`The crash reaches the bar. ${d.npc} arrives in the doorway, blocking the light.`], ['Oh. He has hands like cinder blocks.']),
  'gate:jammed': e(() => ['The lock holds. Blackbird\'s thumb does not. She spends a moment with her hand under her armpit.'], ["Locks are overrated."]),
  'gate:spotted': e((d) => [`A klaxon. A spotlight. A voice says "INTRUDER" with the cheerful tone of a customer-service bot. ${d.place} is awake.`], ['They always say that. Very rude.']),

  // ------------------------------------------------------------------ talk
  'chat:rumor_dragon': e((d) => [`${d.npc} leans in. "Atlas's dragon runs patrol up on the Kowloon Overpass. Nobody comes back. Nobody." Blackbird nods like she's heard worse.`], ["Dragon. Overpass. I'm a hero, I have the bio for this."]),
  'chat:rumor_hatch': e((d) => [`${d.npc} lowers their voice: there's a maintenance hatch behind the Halo's dumpster that goes somewhere nobody's supposed to.`], ['Secrets. My favorite flavor.']),
  'chat:rumor_staffdoor': e((d) => [`${d.npc} mentions the Neon Pharaoh has a staff door nobody watches properly. "Goes under half the block."`], ['Noted. I will absolutely do something with that.']),
  'chat:tall_tale': e(
    (d) => [
      `${d.npc} tells a story about the time they punched a cyber-shark. Blackbird listens with her whole face.`,
      `${d.npc} spends ten minutes explaining a conspiracy involving pigeons, Atlas, and a vending machine. Blackbird nods through all of it.`,
      `${d.npc} wants to talk about their ex. At length. Blackbird stays for the free refill.`,
    ],
    ['Nobody tells a story like a local. Good listener, me.', 'I have no idea what they said but I agree.'],
  ),
  'chat:snub': e((d) => [`${d.npc} turns away mid-sentence. Blackbird is still smiling when she realizes.`], ["Playing hard to get. I respect it."]),

  pet_puppy: e((d) => [`Blackbird scratches ${d.npc} behind the sensor ear. The puppy's tail motor whirs happily.`, `${d.npc} rolls over. Blackbird has never felt so seen.`], ["Best bot in the building. Look at his little optics."]),
  'steal_puppy:success': e(
    (d) => [`Blackbird scoops ${d.npc} into her jacket and walks out of the conversation. The puppy licks her chin with a very small laser.`, `One quick patch of the collar ID later, ${d.npc} is hers. ${d.owner} is going to have thoughts about this.`],
    ['Finders keepers. Dog, this is the start of something beautiful.'],
  ),
  'steal_puppy:bitten': e((d) => [`${d.npc} clamps down on her hand with a bite force rated for diamond. Blackbird lets go.`], ["He's just playing. Aggressively."]),
  'steal_puppy:noticed': e((d) => [`"SPROCKET," says ${d.npc}, in a voice like a mountain falling over. He is looking directly at Blackbird.`], ['This is a misunderstanding. A short, loud one.']),

  // ------------------------------------------------------------------ romance
  'flirt:smooth': e(
    (d) => [`Blackbird leans on the bar and says something to ${d.npc} that gets a laugh and an eyebrow.`, `${d.npc} is smiling. Blackbird does not know what she said but she'll say it again.`],
    ["I'm good. Like, genuinely good at this.", 'Smooth. Chrome-plated smooth.'],
  ),
  'flirt:number': e((d) => [`${d.npc} writes a number on Blackbird's wrist in glowing ink. The ink is warm.`], ['Dragon. Damsel. Number. A great night.']),
  'flirt:cringe': e(
    (d) => [`Blackbird opens with a pickup line involving firmware. ${d.npc} stares at her for a long moment.`, `Blackbird winks at ${d.npc}. It reads as a facial malfunction.`],
    ["The line was a classic. They'll appreciate it later.", "It's the lighting."],
  ),
  'flirt:slapped': e((d) => [`${d.npc} slaps Blackbird so hard her implants recalibrate. Wounded pride, minor.`], ['Worth it. I think I felt a spark.']),
  'kiss:kiss': e(
    (d) => [`Blackbird and ${d.npc} find a dark corner. The camera, discreetly, finds the ceiling.`, `${d.npc} pulls Blackbird in by the jacket. It goes on for a while. The jukebox plays something suitable.`],
    ['Dragon? What dragon.', 'Neo is a city of second chances. This is my third. Fourth?'],
  ),
  'kiss:rejected': e((d) => [`Blackbird leans in. ${d.npc} leans out. A lot of time passes in that gap.`], ["She was just checking me for a fever."]),
  'jealous:fight': e((d) => [`Across the bar, ${d.npc} has been watching. She puts down her drink very slowly. "That was ${d.npc2}?"`, `${d.npc} saw the whole thing. She walks over with the calm of someone who has already decided.`], ["Okay, I can explain. It's... a long story. Mostly short."]),
  'jealous:sulk': e((d) => [`${d.npc} sees. Her expression closes up like a vault door. She does not say a word.`], ["Wow, okay. That's... hm."]),

  // ------------------------------------------------------------------ theft
  'pickpocket:cash': e((d) => [`Blackbird's fingers dip into ${d.npc}'s pocket and come back with ${d.amount} neodollars. Nobody notices.`, `A bump, an apology, and ${d.amount} neodollars have changed owners.`], ["I didn't take it. I borrowed it permanently."]),
  'pickpocket:item': e((d) => [d.better ? `Blackbird lifts ${d.item} off ${d.npc} so smoothly the guy keeps talking. It's a step up from what she was carrying.` : `Blackbird lifts ${d.item} off ${d.npc}. Whether it's useful is a different question.`], ['Upgrade acquired. Thank you for your service.', "They'll never know. Until they check."]),
  'pickpocket:nothing': e((d) => [`${d.npc}'s pockets contain a lint ball and, deep down, regret.`], ['Rude. The least they could do is carry something.']),
  'pickpocket:caught': e((d) => [`A hand closes around Blackbird's wrist. ${d.npc} looks down at her. Then at the hand in their pocket. Then at her.`], ["It's a handshake. A very personal handshake."]),
  'threaten:cough': e((d) => [`Blackbird has a quiet word with ${d.npc}. ${d.npc} coughs up ${d.amount} neodollars and does not make eye contact.`], ['Intimidation. A heroic skill, if you squint.']),
  'threaten:laugh': e((d) => [`${d.npc} laughs. Then stops laughing. Things get physical.`], ["Not sure that's how that was supposed to go."]),

  // ------------------------------------------------------------------ fun & games
  'arm_wrestle:win': e((d) => [`Blackbird slams ${d.npc}'s hand into the table. The table cracks. ${d.amount} neodollars change hands.`], ['Guns? What guns. The real weapon is my bicep.']),
  'arm_wrestle:lose': e((d) => [`${d.npc} puts Blackbird's arm down like closing a door. She pays up ${d.amount} neodollars.`], ['Warm-up. That was a warm-up.']),
  'hack:backlash': e((d) => [`Blackbird jacks into ${d.npc}'s implants. Their firewall bites back. She gets a faceful of feedback and a small taste of burned toast.`], ['They had a good firewall. Annoying.']),
  'hack:reboot': e((d) => [`Blackbird slices ${d.npc}'s routines open. The unit goes dark, then pops out a data shard like a gum ball.`], ["Jacked in, no problem. Bit of firewall went down easy.", 'Machines love me.']),
  'hack:siphon': e((d) => [d.traced ? `Blackbird skims ${d.amount} neodollars out of ${d.npc}'s accounts. A corporate tripwire pings somewhere. A very quiet somewhere.` : `Blackbird skims ${d.amount} neodollars out of ${d.npc}'s accounts. Their face never changes.`], ['Jacked in, no problem. Bit of firewall went down easy, cleaned the bastards out for all they\'re worth.', "Easy money. Cybercrime is just math."]),
  'hack:prank': e((d) => [`Blackbird wiggles into ${d.npc}'s wiring and makes their prosthetic hand slap them. Twice. Nobody knows why.`], ['I regret nothing.']),
  ask_work: e((d) => [`${d.npc} slides a glowing card across the table: a dragon on the Kowloon Overpass, Atlas security up the street, and a maintenance hatch behind the Halo that goes places. "Don't die." Blackbird takes it as a compliment.`], ['A job! Look at that. Destiny in a glowing business card.']),
  fence: e((d) => [`${d.npc} appraises ${d.count} item${d.count === 1 ? '' : 's'} like a vulture at a buffet. ${d.amount} neodollars, cash, no questions.`], ['Neo economy, baby. Garbage in, money out.']),
  'get_patched:fixed': e((d) => [`${d.npc} patches Blackbird up on a bathroom sink for ${d.cost} neodollars. The wound closes with a hiss.`], ['Doc is a genius. Do not look at the tools.']),
  'get_patched:botched': e((d) => [`${d.npc} patches Blackbird up, then adds "a little extra". A new ${d.up}-boosting implant is in there. The ${d.down} is a bit off now. ${d.cost} neodollars.`], ["Free upgrade! I think."]),
  'buy_stims:boost': e((d) => [`${d.npc} slides a stim into Blackbird's palm for ${d.cost} neodollars. Her pupils go wide. The world gets sharp.`], ['Everything is so clear. Why was it ever blurry?']),
  'buy_stims:overdose': e((d) => [`${d.npc}'s stim hits like a truck. Blackbird sees colors that do not exist. The floor starts to move.`], ["I'm not stumbling. The room is."]),
  'order_drink:paid': e((d) => [`Blackbird orders ${d.drink} from ${d.npc} for ${d.cost} neodollars. It goes down in one. She orders another look.`, `${d.drink}. ${d.cost} neodollars. The bar-top is sticky and the evening is young.`], ['Liquid courage. Courage, at a discount.', 'One more and then I get serious.']),
  'order_drink:free': e((d) => [`${d.npc} slides Blackbird ${d.drink} on the house, along with a look that costs more than the drink.`], ['Perks of being a legend.']),
  buy_round: e((d) => [`Blackbird slaps down ${d.cost} neodollars and announces a round for the house. The bar roars. Several people think she is a billionaire.`], ["I'm the hero of this bar. The bar just doesn't know it yet."]),
  'karaoke:ovation': e((d) => [`Blackbird takes the stage and belts ${d.song}. The bar is dead silent, then on its feet. ${d.amount} neodollars in the tip jar.`], ["That's right. Hero AND diva."]),
  'karaoke:boos': e(() => ['Blackbird mounts the karaoke stage and sings. The crowd boos. Something that was once a beer bottle hits her shoulder.'], ["The sound system's busted. That wasn't how it sounded in my head."]),
  'karaoke:brawl': e((d) => [`Blackbird\'s performance is interrupted by ${d.npc}, who says a thing about her singing. A glass flies.`], ['Critics. Every one of them is a coward.']),
  'pool:win': e((d) => [`Blackbird takes ${d.npc}'s ${d.amount} neodollars off the pool table with a lazy bank shot.`], ['Pool is geometry. I am great at geometry.']),
  'pool:lose': e((d) => [`${d.npc} sinks the eight ball. Blackbird is out ${d.amount} neodollars.`], ['I let them win. For morale.']),
  'pool:accuse': e((d) => [`Blackbird calls ${d.npc} a hustler. ${d.npc} picks up the cue.`], ['They did hustle me. Probably.']),
  'mirror:swagger': e(() => ['Blackbird gives herself a pep talk in the cracked mirror. She is a hero. She is a legend. She is worth ten of her enemies. Her reflection agrees.'], ["Looking good. Dangerous. Doomed? Not today."]),
  'mirror:punch': e(() => ['Blackbird tells her reflection she is the greatest hero in Neo and, overcome, punches it. The mirror wins.'], ['Seven years of bad luck, tops.']),
  'fridge:snack': e(() => ['The walk-in fridge: leftover noodles, a suspicious pie, something labeled DO NOT. Blackbird eats the pie.'], ['Heroes need fuel.']),
  'fridge:poison': e(() => ['The pie was the DO NOT. Blackbird spends a while thinking about her choices.'], ["It wasn't the pie. It was the other thing."]),
  'fridge:caught': e((d) => [`${d.npc} finds Blackbird with her head in the fridge. He picks up a cleaver and a slightly worse mood.`], ["I'm doing an inspection."]),
  'laser_tag:win': e((d) => [`In the basement arena, Blackbird tags nine players and a surprised referee. Prize: ${d.amount} neodollars.`], ['Reflexes, aim, and total lack of dignity. A hero trifecta.']),
  'laser_tag:lose': e(() => ['Blackbird is out in twelve seconds. A ten-year-old with a rifle is the MVP.'], ['It was a warm-up round. The kid was lucky.']),
  'laser_tag:cheat': e(() => ['Blackbird rewrites her vest to count hits twice. The arena flags it. She is ejected with a lifetime ban from the NEON KNIGHTS league.'], ['Legendary. They will name a rule after me.']),
  'safe:success': e((d) => [`The wall safe clicks open: ${d.amount} neodollars and ${d.item}. A burglar alarm somewhere is considering waking up.`], ['Locks, safes, vaults. The universe wants me to have things.']),
  'safe:alarm': e(() => ['The safe screams. A siren, a red light, a recorded voice that says "THIEF" in a friendly tone.'], ['Technically I wasn\'t done yet.']),
  'skyline:dragon': e(() => ['From the roof, Blackbird spots it: a massive shape cruising the Kowloon Overpass, running lights tracing the lines of wings. A cyberdragon. Atlas\'s favorite pet.'], ['There. The big one. I can take it.', "Forty tons of Atlas steel. I'll need a bigger sword. Or a smaller dragon."]),
  'skyline:wobble': e(() => ['Blackbird leans over the roof edge for a better look and nearly leaves it for good. A pigeon is concerned.'], ["I'm fine. It's the building that's tilting."]),
  'skyline:vista': e(() => ['Blackbird stands on the roof and surveys Neo: arcologies, billboards, a thousand lit windows of people not doing what she does.'], ['A hero\'s view. Someday this city will thank me.']),
  'dumpster:loot': e((d) => [d.sniff ? `Sprocket sniffs out a buried treasure: ${d.item}. Blackbird takes credit.` : `Elbow-deep in the dumpster, Blackbird finds ${d.item}. A rare win.`], ['Treasure. In trash. That\'s Neo poetry.']),
  'dumpster:gear': e((d) => [`Under a pile of refuse, Blackbird digs up ${d.item}. Still works. Mostly.`], ['Trash to treasure. The hero\'s journey.']),
  'dumpster:junk': e((d) => [`Blackbird rummages the dumpster and surfaces with ${d.item}. She pockets it anyway.`, `Dumpster haul: ${d.item}. Value: unknowable.`], ['Someone might want it. Someday.', 'It\'s sentimental. Somehow.']),
  'dumpster:rats': e(() => ['The dumpster lid flips open and a swarm of cyber-rats pours out. Their eyes glow a very specific red.'], ['Aw. A welcoming committee.']),
  'dumpster:hatch': e(() => ['Behind the dumpster, Blackbird finds a rusty hatch marked MAINTENANCE — NO ADMITTANCE. It is not locked.'], ['Do not enter. That, historically, is my cue.']),
  'dumpster:vagrant': e(() => ['A dumpster-dweller in a Neo PD jacket shoves a field medkit at her and a muttered threat about Wednesdays.'], ['Wise old man energy. Sort of.']),
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

  bandage: e(() => ['Blackbird wraps a strip of duct tape around the worst of it. The bleeding says thank you.'], ["Duct tape. Half the world's problems, solved."]),
  use_medkit: e((d) => [d.cured ? `A field medkit goes in. The ${String(d.cured).replace('_', ' ')} gets set and sealed. Blackbird exhales.` : 'A field medkit goes in. Blackbird feels a lot less like a casualty.'], ['Medical science.']),
  sober_up: e(() => ['Blackbird sticks her head in a bucket of ice water. The room stops spinning, but only as an experiment.'], ["I'm perfectly sober. Everyone else is blurry."]),
  use_stim: e(() => ['Blackbird slaps a stim into her neck. The universe snaps to focus.'], ['Everything\'s a nail. I\'m a hammer.']),

  // ------------------------------------------------------------------ combat
  challenge: e(
    (d) => [
      `Blackbird tells ${d.npc} (${d.role}) their jacket is ugly. This was the right thing to say, if she wanted a fight.`,
      `Blackbird sidles up to ${d.npc} (${d.role}) and says "You look like you wanna lose."`,
      `Blackbird bumps ${d.npc} on purpose. Twice.`,
      `"I'm Blackbird," Blackbird tells ${d.npc} (${d.role}). "I'll be your hero tonight. Hit me."`,
    ],
    ['Always wanted to see what this guy does with his hands.', "It's a personality test. For him."],
  ),
  'challenge:1': e((d) => [`Blackbird tells ${d.npc} (${d.role}) their jacket is ugly. This was the right thing to say, if she wanted a fight.`]),
  'challenge:2': e((d) => [`Blackbird sidles up to ${d.npc} (${d.role}) and says "You look like you wanna lose."`], ['Rule one: always open with confidence.']),
  'challenge:3': e((d) => [`Blackbird bumps ${d.npc} (${d.role}) on purpose. Twice.`]),
  'challenge:4': e((d) => [`"I'm Blackbird," Blackbird tells ${d.npc} (${d.role}). "I'll be your hero tonight. Hit me."`], ['Great line.']),
  fight_start: e(
    (d) =>
      d.boss
        ? [`${d.foes} unfolds from the dark. Plasma vents spool up. Ads on the underside of its wings read PROTECTING NEO, ONE CITIZEN AT A TIME.`]
        : d.count === 1
          ? [`Blackbird squares up with ${d.foe} (${d.foeRole}), ${d.weapon} in hand.`, `${d.foe} (${d.foeRole}) vs. Blackbird. Her ${d.weapon} against whatever they have.`]
          : [`${d.count} on one: ${d.foes}. Blackbird grips ${d.weapon}.`, `${d.foes}. They\'re all looking at her. She decides that\'s the best possible start.`],
    (d) => (d.boss ? ["This is it. The big one. I've been training for this. By drinking."] : ['Let\'s dance.', "I've fought worse. Slightly."]),
  ),
  'fight_end:win': e(
    (d) => [
      `${d.killed ? `${d.killed} down` : 'They fold'} after ${d.rounds} rounds. Blackbird loses ${d.taken} HP and finds ${d.cash} neodollars.${d.loot ? ` Loot: ${d.loot}.` : ''}`,
      `Blackbird wins. ${d.rounds} rounds, ${d.taken} damage taken, ${d.cash} neodollars gained.${d.puppy ? ' Sprocket barks a victory bark.' : ''}`,
      `It ends the way it was always going to. Blackbird is standing. (${d.rounds} rounds, ${d.taken} damage.)`,
    ],
    ['Easy. I barely warmed up.', 'Another one for the highlight reel.', 'Hero: 1. Idiots: a lot.'],
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
      d.boss
        ? [`The dragon turns Blackbird into a smoking silhouette on the Kowloon Overpass. Round ${d.rounds}.`, `Forty tons of Atlas steel and one tire iron. Round ${d.rounds}.`]
        : [`Blackbird goes down in round ${d.rounds}. ${d.killer || 'Something'} stands over her.`, `Round ${d.rounds}. It was not the heroic last stand she had imagined.`],
    ['Okay, that one might actually hurt.', 'This is fine.'],
  ),
  brawl_joins: e((d) => [`${d.npcs} ${Number(d.count) > 1 ? 'jump' : 'jumps'} in. Because why not.`, `Somebody shouts "BRAWL!" and ${d.npcs} ${Number(d.count) > 1 ? 'are' : 'is'} suddenly involved.`], ['More the merrier.', "Don't worry, I take all comers."]),
  'injury:broken_leg': e(() => ['A leg gives out with a sound like a snapped pipe. Blackbird has a broken leg.'], ["It's just a leg. I have another one."]),
  'injury:cracked_ribs': e(() => ['Cracked ribs. Every breath now is a negotiation.'], ["Breathing's overrated."]),
  'injury:fried_optics': e(() => ['Her left optic sparks and fizzles. Half of Neo goes monochrome.'], ["Fashionable. Retro even."]),
  'injury:concussion': e(() => ['A hard hit to the head. Her vision wobbles. Her thoughts, if possible, wobble faster.'], ['I see two exits. Which one is real?']),
  level_up: e((d) => [`Blackbird reaches level ${d.level}. Her ${d.stat} ticks up. The upgrade is not visible. It feels visible.`, `Level ${d.level}. Something in her chrome clicks. Her ${d.stat} improves.`], ["I'm leveling up. This is how it begins.", 'More power. Same sass.']),
  equip: e(
    (d) => [d.slot === 'weapon' ? `Blackbird swaps ${d.old} for ${d.item}${d.unstable ? '. It is humming at a frequency that makes her teeth itch' : ''}.` : `Blackbird straps on ${d.item}. Tough.`],
    (d) => [d.unstable ? 'What could possibly go wrong?' : 'Upgrade. Finally.'],
  ),
  monitored_death: e((d) => [`${d.npc} was wearing about half a mil in monitoring implants. His last heartbeat pinged ${d.groups} separate groups, all of them looking at Blackbird now.`], ["It's fine. I'm only sweating a little."]),
  dragon_confront: e((d) => [`Blackbird strides onto the Kowloon Overpass and points whatever she is holding at the sky. ${d.npc} descends.`], ['Today is the day. I can feel it.']),
  dragon_notices: e((d) => [`Overhead, ${d.npc} banks and swings its head toward Blackbird. A speaker clears its throat: "CITIZEN, YOU ARE IN VIOLATION OF CONTENTMENT."`], ["Hi. Nice wings."]),
  'rob_till:success': e((d) => [`Blackbird empties the register for ${d.amount} neodollars while the bartender's back is turned. It takes a coordinated effort and a decoy napkin.`], ['It\'s not stealing. It\'s redistribution.']),
  'rob_till:caught': e((d) => [`${d.npc}'s hand lands on Blackbird's shoulder. "That's the till." He is very calm. It is worse.`], ["Just counting it for him."]),
  blackout: e((d) => [`Blackbird's memory skips. When it resumes, she is in ${d.place} with fewer neodollars (${d.lost} fewer) and a lot more feelings.`, `Blackbird wakes up, somehow, in ${d.place}. Missing: ${d.lost} neodollars.`], ["Time moves strangely, in bars.", "Last thing I remember is a really good song."]),
  'ambush:npd': e((d) => [`Sirens. Three patrol drones drop out of the dark and an NPD squad (${d.count} officers) fans out. Blackbird's heat is ${d.heat}. "Don't move," says the lead officer, in a voice that suggests he'd prefer she did.`], ['They always show up for the good stuff.']),
  'ambush:atlas': e((d) => [`Black vans, matte-black armor, no insignia but the Atlas logo stitched on every sleeve. A Helix retrieval team (${d.count}) steps out of the dark.`], ['A real hero has real enemies. Welcome to my fan club.']),
  banned: e((d) => [`${d.npc} blocks the door of the Rusty Halo. "You're banned." Blackbird\'s name has been on the wall since Tuesday.`], ["Banned? I've never even been..."]),
  security_closes_in: e((d) => [`${d.npc} and the rest of Neon Pharaoh security close in around Blackbird, tapping stunners against their palms.`], ["I can hear them coming. Flattering."]),
  raid: e((d) => [`NPD cruisers screech to a halt outside the Rusty Halo. A crackdown on ${d.crackdown} is on, and the cops want someone to be guilty of it.`], ["Surprise inspection? I love surprises."]),
  raid_fine: e((d) => [`The cops write a ticket for ${d.fine} neodollars and leave. Nobody asks what it was for.`], ['Tax on greatness. Again.']),
  mugging: e((d) => [`A shadow detaches from the wall. ${d.count === 1 ? 'A mugger steps' : 'Two muggers step'} out into the neon, knives out. "Your money or your life." Blackbird considers this a negotiation.`], ["They picked the wrong hero."]),
  'drone:spots': e((d) => [`${d.npc} locks on to Blackbird, red optic whirring. "UNAUTHORIZED GREATNESS DETECTED."`], ['Oh good. XP.']),
  'drone:scan': e((d) => [`${d.npc} sweeps a scanner over Blackbird, beeps, and notes the incident for her file. Her file is getting long.`], ["I'm sure it's a flattering file."]),
  stray_bottle: e((d) => [`The gang brawl across the room sends a bottle spinning into Blackbird's shoulder: ${d.hit} damage.`], ['Not even in the fight yet. That is some range.']),
  gang_brawl: e((d) => [`Across the bar, ${GANGS[String(d.g1)] ?? d.g1} and ${GANGS[String(d.g2)] ?? d.g2} look at each other too long. Chairs start flying. The gang war has reached the Halo.`], ["That looks fun. Let me see how I can help."]),
  brawl_over: e(() => ['The brawl burns itself out. A bartender sweeps up something that used to be a tooth.'], ['Missed it. Next time.']),
  join_brawl: e((d) => [`Blackbird vaults the bar and joins the gang war uninvited, on whichever side hits her first: ${d.foes}.`], ['Fashionable entrance.']),
  companion_lost: e((d) => [`${d.npc} takes one hit too many and powers down mid-bark. Blackbird holds the little chrome body for a moment. She is not crying.`], ["It's the smoke. It's definitely the smoke."]),
  death: e(
    (d) => [`Blackbird is dead. Level ${d.level}. ${d.place}. Cause: ${d.cause}. Killed by ${d.killer}.`, `Blackbird flatlines in ${d.place}. Level ${d.level}. The report will say "${d.cause}".`],
    ['Huh. Okay. That was unexpected.', "Tell my fans I'll be back. Tell the cops I wasn't here."],
  ),
  victory: e(() => ['CINDERJAW comes down in a spiral of fire and flapping ads. The Kowloon Overpass falls silent. Somewhere, an Atlas stock price flickers.'], ['Dragon: slain. Honestly, I expected it to be harder.']),
  dawn: e((d) => [`Dawn over Neo. Blackbird, somehow still alive, slumps in ${d.place}. The night ran out before she did.`], ['Next time I\'ll start earlier.']),
};

const QUIRK: Record<string, Record<string, string[]>> = {
  ditz: {
    dumpster: ['Ooh, what\'s THIS?', 'I wonder what it does when I lick it.'],
    go: ['What\'s over there? Is it shiny?', 'Is that a door? I like doors.'],
    hack: ['I\'ll just press everything.', 'Wait, which one is the on button?'],
    fuse_panel: ['I\'ll just press the red one. Red means good.'],
  },
  hothead: {
    challenge: ['Nobody looks at me like that.', 'He looked at me. That is a violation.'],
    fight_start: ["I don't care how big he is.", 'Hit me first. I dare you.'],
    pickpocket: ["Oh, you caught me? Good. Let's fight."],
  },
  romantic: {
    flirt: ["This is it. I can feel it. This is The One.", 'Her eyes are like twin neon moons.'],
    kiss: ['I think I\'m in love.', 'Marry me, I think.'],
    chat: ['They have the nicest voice.'],
    dance: ['Dance with me forever. Or until the music ends.'],
  },
  lush: {
    order_drink: ["Just the one. Or four.", "It's medicinal."],
    karaoke: ["I've had exactly the right amount for this."],
    buy_round: ['To me!', 'Everyone drink. That is an order from a hero.'],
  },
  gambler: {
    pool: ['Double or nothing. Triple. Whatever.', "I never lose. I just run out of money."],
    safe: ['Feeling lucky. Always feeling lucky.'],
    rob_till: ["Let's see what the house has."],
    karaoke: ['Ten neodollars says I hit the high note.'],
  },
};

const FALLBACK_KEYS = (e_: GameEvent): string[] => {
  const d = e_.data;
  const keys: string[] = [];
  if (d.variant !== undefined) keys.push(`${e_.type}:${d.variant}`);
  if (d.injury !== undefined) keys.push(`${e_.type}:${d.injury}`);
  keys.push(`${e_.type}:${e_.outcome}`, e_.type);
  return keys;
};

function lines(l: Lines | undefined, d: EventData): string[] {
  if (!l) return [];
  return typeof l === 'function' ? l(d) : l;
}

function interp(s: string, d: EventData, extra: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (extra[k] ?? (d[k] !== undefined ? String(d[k]) : `{${k}}`)));
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
  if (ev.type === 'go' && ev.data.first === true && typeof ev.data.toId === 'string' && BLURBS[ev.data.toId]) {
    out.push({ voice: 'report', text: BLURBS[ev.data.toId]! });
  }
  const alwaysThought = ['death', 'victory', 'level_up', 'depart', 'fight_end', 'dragon_confront'].includes(ev.type);
  const quirk = QUIRK[ctx.archetype]?.[ev.type] ?? QUIRK[ctx.archetype]?.[`${ev.type}_${ev.data.variant}`];
  const ts = lines(entry.t, ev.data);
  if (quirk && ctx.rng.chance(0.4)) {
    out.push({ voice: 'thought', text: ctx.rng.pick(quirk) });
  } else if (ts.length && (alwaysThought || ctx.rng.chance(0.65))) {
    out.push({ voice: 'thought', text: interp(ctx.rng.pick(ts), ev.data, extra) });
  }
  return out;
}

export function hasTemplate(ev: GameEvent): boolean {
  return FALLBACK_KEYS(ev).some((k) => !!T[k]);
}
