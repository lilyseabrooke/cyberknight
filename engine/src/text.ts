import type { Rng } from './rng';
import type { GameEvent, EventData } from './events';
import { GANGS } from './content/archetypes';

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
  club_greenroom: "The Neon Pharaoh's green room: a couch with a history, a cooler of warm beer, and a vintage guitar on a stand like a relic.",
  chem_mart: 'Lucky Seven Chem-Mart: fluorescent lights, a rack of med packs behind glass, and a pharmacist who has seen worse than whatever you are about to describe.',
  gun_shop: 'Bullets & Bagels: a long counter of guns, a short counter of bagels, and a sign that reads NO REFUNDS ON FIREARMS OR REGRETS.',
  club_backlot: 'The lot behind the Neon Pharaoh: milk crates, a boombox, and a few street kids with serious faces.',
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
  'chat:snub': e((d) => [`${d.npc} turns away mid-sentence. Blackbird is still smiling when she realizes.`, `${d.npc} mutters "not now" and finds something very interesting to do with their hands.`, `Blackbird asks ${d.npc} how their night is going. "Over," ${d.npc} says.`], ["Playing hard to get. I respect it."]),

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
    (d) => [`Blackbird and ${d.npc} find a dark corner. The camera, discreetly, finds the ceiling.`, `${d.npc} takes Blackbird by the collar. The next ten minutes are not a matter of public record.`, `Neon, bass, and ${d.npc}'s hand in Blackbird's hair. The report cuts to the weather.`, `${d.npc} pulls Blackbird in by the jacket. It goes on for a while. The jukebox plays something suitable.`],
    ['Dragon? What dragon.', 'Neo is a city of second chances. This is my third. Fourth?'],
  ),
  'kiss:rejected': e((d) => [`Blackbird leans in. ${d.npc} leans out. A lot of time passes in that gap.`], ["She was just checking me for a fever."]),
  'jealous:fight': e((d) => [`Across the bar, ${d.npc} has been watching. She puts down her drink very slowly. "That was ${d.npc2}?"`, `${d.npc} saw the whole thing. She walks over with the calm of someone who has already decided.`], ["Okay, I can explain. It's... a long story. Mostly short."]),
  'jealous:sulk': e((d) => [`${d.npc} sees. Her expression closes up like a vault door. She does not say a word.`], ["Wow, okay. That's... hm."]),

  // ------------------------------------------------------------------ theft
  'pickpocket:cash': e((d) => [`Blackbird's fingers dip into ${d.npc}'s pocket and come back with ${d.amount} neodollars. Nobody notices.`, `A bump, an apology, and ${d.amount} neodollars have changed owners.`], ["I didn't take it. I borrowed it permanently."]),
  'pickpocket:item': e((d) => [d.better ? `Blackbird lifts ${d.item} off ${d.npc} so smoothly the guy keeps talking. It's a step up from what she was carrying.` : `Blackbird lifts ${d.item} off ${d.npc}. Whether it's useful is a different question.`], ['Upgrade acquired. Thank you for your service.', "They'll never know. Until they check."]),
  'pickpocket:nothing': e((d) => [`${d.npc}'s pockets contain a lint ball and, deep down, regret.`], ['Rude. The least they could do is carry something.']),
  'pickpocket:caught': e((d) => [`A hand closes around Blackbird's wrist. ${d.npc} looks down at her. Then at the hand in their pocket. Then at her.`, `${d.npc} spins around and catches Blackbird's arm, elbow-deep in their jacket. "Looking for something?"`, `"I felt that," says ${d.npc}, in the tone of a man who has felt that before.`], ["It's a handshake. A very personal handshake."]),
  'threaten:cough': e((d) => [`Blackbird has a quiet word with ${d.npc}. ${d.npc} coughs up ${d.amount} neodollars and does not make eye contact.`, `Blackbird cracks her knuckles at ${d.npc}. ${d.amount} neodollars materialize, unprompted.`, `"Nice wallet," Blackbird tells ${d.npc}. It becomes hers. ${d.amount} neodollars richer.`, `${d.npc} looks at Blackbird, at her hands, at the exit. ${d.amount} neodollars leave their pocket and go to a better home.`], ['Intimidation. A heroic skill, if you squint.']),
  'threaten:laugh': e((d) => [`${d.npc} laughs. Then stops laughing. Things get physical.`, `${d.npc} is not intimidated. ${d.npc} is, in fact, delighted. The fight is on.`, `Blackbird's threat lands about as well as a sandwich in a vault. ${d.npc} swings.`], ["Not sure that's how that was supposed to go."]),

  // ------------------------------------------------------------------ fun & games
  'arm_wrestle:win': e((d) => [`Blackbird slams ${d.npc}'s hand into the table. The table cracks. ${d.amount} neodollars change hands.`], ['Guns? What guns. The real weapon is my bicep.']),
  'arm_wrestle:lose': e((d) => [`${d.npc} puts Blackbird's arm down like closing a door. She pays up ${d.amount} neodollars.`], ['Warm-up. That was a warm-up.']),
  'hack:backlash': e((d) => [`Blackbird jacks into ${d.npc}'s implants. Their firewall bites back. She gets a faceful of feedback and a small taste of burned toast.`, `${d.npc}'s ICE is better than expected. Blackbird's connection snaps with a sound like a rubber band made of regret.`, `Blackbird pokes at ${d.npc}'s implants. They poke back, harder. A faint smell of ozone.`], ['They had a good firewall. Annoying.']),
  'hack:reboot': e((d) => [`Blackbird slices ${d.npc}'s routines open. The unit goes dark, then pops out a data shard like a gum ball.`], ["Jacked in, no problem. Bit of firewall went down easy.", 'Machines love me.']),
  'hack:siphon': e((d) => [d.traced ? `Blackbird skims ${d.amount} neodollars out of ${d.npc}'s accounts. A corporate tripwire pings somewhere. A very quiet somewhere.` : `Blackbird skims ${d.amount} neodollars out of ${d.npc}'s accounts. Their face never changes.`], ['Jacked in, no problem. Bit of firewall went down easy, cleaned the bastards out for all they\'re worth.', "Easy money. Cybercrime is just math."]),
  'hack:prank': e((d) => [`Blackbird wiggles into ${d.npc}'s wiring and makes their prosthetic hand slap them. Twice. Nobody knows why.`], ['I regret nothing.']),
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
  'crime_seen:none': e((d) => [`Nobody saw it. ${d.place} keeps its secrets, which is the only thing it does well.`], ['Perfect crime. Not that it was a crime.']),
  'crime_seen:camera': e((d) => [d.drone ? `${d.drone} turns its lens toward the commotion and does not look away. Somebody is going to watch this later.` : `A camera in the corner pans around and locks on. Its red light blinks in a way that feels personal. ${d.cams} on this side of ${d.place} alone.`], ["I'm sure it's a flattering angle."]),
  'crime_seen:people': e((d) => [`${d.witnesses} ${Number(d.witnesses) === 1 ? 'person sees' : 'people see'} Blackbird go for ${d.victim}. ${d.gun ? 'The gunshots are the kind of detail people remember.' : 'There are no cameras, but there are phones.'}`], ["They're just admiring the technique."]),
  'crime_seen:both': e((d) => [`Blackbird goes for ${d.victim} in full view: ${d.witnesses} witness${Number(d.witnesses) === 1 ? '' : 'es'} and a camera that has not blinked since. ${d.gun ? 'The gunshots help no one.' : ''}`], ['Good lighting, at least. This will cut together nicely.']),
  'bystander:intervene': e((d) => [`${d.npc} (${d.role}) steps in front of ${d.victim}. "That is enough." It is not enough. It is just beginning.`, `${d.npc} drops what they are holding and comes for Blackbird. Official business, apparently.`], ['Aw. Another fan who wants to meet me.']),
  'bystander:join': e((d) => [`${d.npc} (${d.gang || d.role}) has known ${d.victim} for years. They roll up their sleeves.`, `${d.npc} does not like seeing ${d.victim} get hit. They pick up the nearest heavy thing.`], ['More the merrier. Technically.']),
  'bystander:call_cops': e((d) => [`${d.npc} holds up a handset and says three words into it: "Neo Protective Division." The line crackles. Nobody has ever been this fast.`, `${d.npc} has the NPD on the line before the second punch lands.`], ['Snitches get stitches. Eventually.']),
  'bystander:flee': e((d) => [`${d.npc} takes one look and heads for the door. They are not going to be around to testify. They are going to be around, later.`, `${d.npc} drops behind the nearest surface and does not come back up for a while.`], ['Smart. I would run too. If I were them.']),
  'bystander:film': e((d) => [`${d.npc} has their phone up already. The clip of Blackbird and ${d.victim} is posted before the fight is finished.`], ["Camera loves me. I'll sign it later."]),
  'bystander:cheer': e((d) => [`${d.npc} whoops. Somebody is clearly in her corner. ${d.victim} had it coming, apparently.`, `${d.npc} raises a glass. A small crowd forms. A very small crowd.`], ['Fans. I have fans. Remember the name.']),
  'bystander:shun': e((d) => [`${d.npc} watches Blackbird hit ${d.victim} and quietly rearranges their opinion of her. It does not go well for her.`], ["They're just jealous."]),
  'bystander:crowd': e((d) => [`${d.count} more ${Number(d.count) === 1 ? 'person has' : 'people have'} an opinion about this. All of them are taking notes.`], ['A tough crowd. They will come around.']),
  'heat_up:npd': e((d) => [d.source === 'bodies' ? `The bodies change the paperwork. Police heat is ${d.level}.` : `Someone files a report. Police heat +${d.gain}, now ${d.level}.`, d.source === 'bodies' ? `A dead body in front of witnesses is a different sort of file. Police heat ${d.level}.` : `The NPD logs Blackbird's name against the incident. Heat: ${d.level}.`], ['They are going to write me a ticket. A big one.']),
  'heat_up:atlas': e((d) => [d.source === 'bodies' ? `Atlas security finds the bodies. Atlas heat is ${d.level}.` : `Somebody at Atlas pulls the footage. Atlas heat +${d.gain}, now ${d.level}.`], ['Corporate footage. They love me up there.']),


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
  'challenge:5': e((d) => [`Blackbird takes ${d.npc} (${d.role})'s drink, sips it, and sets it back down wrong on purpose.`], ["Subtle. Let's see if they notice."]),
  'challenge:6': e((d) => [`Blackbird looks ${d.npc} (${d.role}) up and down, sniffs, and says "Corpo?" It does not matter that they are not.`], ['Never wrong.']),
  fight_start: e(
    (d) =>
      d.dragon === 'hera'
        ? ['Hera Mk. V turns. It takes a while, because it is the size of a district. Every light on its underbelly settles on Blackbird.']
        : d.dragon === 'artemis'
          ? [Number(d.count) === 1 ? `${d.foes} drops from the sky in a controlled fall, wings snapping open a few feet above the street. Blackbird levels her ${d.weapon}.` : `${d.count} Artemis Mk. I dragons peel off in formation and drop on Blackbird: ${d.foes}. They have clearly done this before.`]
      : d.boss
        ? [`${d.foes} unfolds from the dark. Plasma vents spool up. Ads on the underside of its wings read PROTECTING NEO, ONE CITIZEN AT A TIME.`]
        : d.count === 1
          ? [`Blackbird squares up with ${d.foe} (${d.foeRole}), ${d.weapon} in hand.`, `${d.foe} (${d.foeRole}) vs. Blackbird. Her ${d.weapon} against whatever they have.`]
          : [`${d.count} on one: ${d.foes}. Blackbird grips ${d.weapon}.`, `${d.foes}. They\'re all looking at her. She decides that\'s the best possible start.`],
    (d) => (d.dragon === 'hera' ? ["Oh. That's... that's a big one.", 'Okay. New plan. Same plan, but with feelings.'] : d.dragon === 'artemis' ? ['Dragon hunting! Finally!', "A real dragon. A small one, but I'll take it."] : d.boss ? ["This is it. The big one. I've been training for this. By drinking."] : ['Let\'s dance.', "I've fought worse. Slightly.", 'Okay, who wants to be famous?', 'Plan: hit them until they stop. Great plan.', 'This is basically a vacation.']),
  ),
  'fight_end:win': e(
    (d) => {
      if (d.dragon === 'artemis') {
        const spoils = [Number(d.cash) > 0 ? `${d.cash} neodollars` : '', d.loot ? String(d.loot) : ''].filter(Boolean).join(' and ');
        return [
          `${Number(d.killed) > 1 ? `${d.killed} Artemis dragons come` : 'The Artemis comes'} down in ${d.rounds} rounds, ${Number(d.taken) > 0 ? `${d.taken} damage taken` : 'not a scratch'}. Blackbird stands on the wreckage like it's a podium.${spoils ? ` Salvage: ${spoils}.` : ''}`,
          `A tidy kill: ${d.rounds} rounds and the Artemis is a pile of hot plating. ${Number(d.taken) > 0 ? `Blackbird's out ${d.taken} HP.` : 'Blackbird is entirely unharmed.'}${spoils ? ` ${spoils}.` : ''}`,
        ];
      }
      const spoils = [Number(d.cash) > 0 ? `${d.cash} neodollars` : '', d.loot ? String(d.loot) : ''].filter(Boolean).join(' and ');
      const cost = Number(d.taken) > 0 ? `${d.taken} damage taken` : 'not a scratch';
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
      d.dragon === 'hera'
        ? ['Hera Mk. V does not so much attack Blackbird as happen to her. There is a flash, and then there is a smoking silhouette, and then there is a dragon continuing on its way.', 'The Hera does not break stride. Blackbird is a shadow on the pavement, and then not even that.']
        : d.dragon === 'artemis'
          ? [`The Artemis pack takes Blackbird apart in round ${d.rounds}, working in tidy formation. One of them is, somehow, still polite about it.`, `Round ${d.rounds}. ${d.killer || 'The Artemis'} lands on what's left of the cover and checks the street for further complaints.`]
      : d.boss
        ? [`The Apollo Mk. II turns Blackbird into a smoking silhouette on the Kowloon Overpass. Round ${d.rounds}.`, `Forty tons of Atlas steel and one tire iron. Round ${d.rounds}.`]
        : [`Blackbird goes down in round ${d.rounds}. ${d.killer || 'Something'} stands over her.`, `Round ${d.rounds}. It was not the heroic last stand she had imagined.`],
    (d) => (d.dragon === 'hera' ? ['...Huh.', 'I regret nothing. Mostly the part where I looked up.'] : d.dragon === 'artemis' ? ['There were THREE of them. That was just unfair.', 'Should have gone for the one on the left.'] : ['Okay, that one might actually hurt.', 'This is fine.']),
  ),
  brawl_joins: e((d) => [`${d.npcs} ${Number(d.count) > 1 ? 'jump' : 'jumps'} in. Because why not.`, `Somebody shouts "BRAWL!" and ${d.npcs} ${Number(d.count) > 1 ? 'are' : 'is'} suddenly involved.`], ['More the merrier.', "Don't worry, I take all comers."]),
  'injury:broken_leg': e(() => ['A leg gives out with a sound like a snapped pipe. Blackbird has a broken leg.'], ["It's just a leg. I have another one."]),
  'injury:cracked_ribs': e(() => ['Cracked ribs. Every breath now is a negotiation.'], ["Breathing's overrated."]),
  'injury:fried_optics': e(() => ['Her left optic sparks and fizzles. Half of Neo goes monochrome.'], ["Fashionable. Retro even."]),
  'injury:concussion': e(() => ['A hard hit to the head. Her vision wobbles. Her thoughts, if possible, wobble faster.'], ['I see two exits. Which one is real?']),
  level_up: e((d) => [`Blackbird reaches level ${d.level}. Her ${d.stat} ticks up. The upgrade is not visible. It feels visible.`, `Level ${d.level}. Something in her chrome clicks. Her ${d.stat} improves.`], ["I'm leveling up. This is how it begins.", 'More power. Same sass.']),
  equip: e(
    (d) => [d.slot === 'weapon' ? `Blackbird trades up from ${d.old} to ${d.item}${d.unstable ? '. It is humming at a frequency that makes her teeth itch' : ''}.` : `Blackbird straps on ${d.item}. Tough.`],
    (d) => [d.unstable ? 'What could possibly go wrong?' : 'Upgrade. Finally.'],
  ),
  monitored_death: e((d) => [`${d.npc} was wearing about half a mil in monitoring implants. His last heartbeat pinged ${d.groups} separate groups, all of them looking at Blackbird now.`], ["It's fine. I'm only sweating a little."]),
  dragon_confront: e((d) => [`Blackbird strides onto the Kowloon Overpass and points whatever she is holding at the sky. The Apollo Mk. II, ${d.npc}, descends.`], ['Today is the day. I can feel it.']),
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
  'companion_joins:kids': e(() => ["The Backlot Kids fall in behind Blackbird like ducklings with a very bad influence. They're hers now. They have opinions about her fashion."], ['Look at that. I have a gang. A gang of children. Wholesome.']),
  companion_joins: e((d) => [`${d.name} joins Blackbird's side (${d.kind}).`], ['The team is growing.']),
  companion_leaves: e((d) => [`${d.name} wanders off. Loyalty, it turns out, expires if you don't check on it.`, `${d.name} has had enough of Blackbird's schedule and goes elsewhere.`], ['They were holding me back anyway.']),
  companion_lost: e((d) => [`${d.name} takes one hit too many and goes still. Blackbird holds what's left for a moment. She is not crying.`, `${d.name} is gone. The fight took them.`], ["It's the smoke. It's definitely the smoke."]),
  'ally_assist:puppy': e((d) => [`${d.name} launches itself at ${d.foe}'s ankle with a bite rated for diamond.`, `${d.name} the robot puppy trips ${d.foe} at the perfect moment.`], ['Good boy. Best boy.']),
  'ally_assist:drone': e((d) => [`${d.name} swoops in and zaps ${d.foe}. A little speaker chirps "CUSTOMER SATISFACTION: HIGH".`, `${d.name} flies a surveillance pass and also opens fire.`], ['My drone. Mine.']),
  'ally_assist:kids': e((d) => [`The kids pelt ${d.foe} with bricks and rhythmic abuse.`, `A hail of bricks and a sick beat from the Backlot Kids hits ${d.foe}.`], ['I taught them everything they know. Which was a lot.']),
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
  'dj_set:blocked': e((d) => [`${d.npc} blocks the booth with his body. "You touched the decks last time." He is not going to let it go.`], ['A man holds a grudge like a vinyl collection.']),
  'beatbox:jam': e((d) => [`Blackbird drops a beat for ${d.npc} and the other street kids. Within a minute they're trading rhymes. A friendship forms, and a questionable record deal.`, `Blackbird and ${d.npc} trade beats under a flickering sign. The kids lose it. Respect, earned.`], ["I'm good with children. Or at least, with beats."]),
  'beatbox:laughed': e((d) => [`Blackbird beatboxes for ${d.npc}. The result is closer to a leaking tire than a drum. ${d.npc} laughs until they have to sit down.`], ["It's a very difficult genre."]),
  'beatbox:robbed': e((d) => [`While Blackbird is mid-beatbox, ${d.npc} lifts ${d.amount} neodollars from her pocket. Nobody stops the music.`], ['Great crowd work. Terrible for my wallet.']),
  'talk_down:win': e((d) => [`As ${d.npc} reaches for her collar, Blackbird opens with a beatbox solo. Against all odds it is... good. ${d.npc} nods. The other guards nod. She is let go with a "don't do that again".`], ['I will NEVER do that again. Probably. It worked so well.']),
  'talk_down:fail': e((d) => [`Blackbird tries to beatbox her way out. ${d.npc} listens to the whole thing with no expression. "Done?" he asks. She is not done. It happens anyway.`], ['That always works in my head.']),
  'jack:drone': e((d) => [`Blackbird jacks into ${d.npc}'s core, scrubs its Atlas loyalty and gives it a nickname. It bobs in the air, now hers. A new friend, with weapons.`], ['A drone. A friend. A flying camera with a grudge. Tell me that is not heroism.']),
  'jack:scrapper': e((d) => [`Blackbird rewrites ${d.npc}'s priority list. It puts down its wrench, looks at her, and walks over to stand behind her like a very tall dog.`], ['It likes me. It likes ME.']),
  'jack:fail': e((d) => [`Blackbird tries to jack ${d.npc}. The core pushes back. Her skull rings. ${d.npc} turns toward her, optic spinning.`], ['Some drones are just not friendly.']),
  'recruit:juno': e((d) => [`${d.npc} closes her laptop and slides out of the booth. "Fine. You've got a hacker. Don't make me regret it." Blackbird does her best not to.`], ["She's coming with me. On purpose."]),
  'pigeon:befriend': e((d) => [`Blackbird offers noodles to the pigeon on the roof. It takes them, eyes her, and decides. ${d.name} lands on her shoulder like a tiny, judgmental feathered knight.`], ['A pigeon is a good friend. They know everything.']),
  'pigeon:snub': e((d) => [`The pigeon on the roof eats the noodles, looks Blackbird up and down, and flies off with a hint of disdain.`], ['Cold. But fair.']),
  buy_noodles: e((d) => [`${d.npc} hands over a bowl of mystery-meat noodles for 5 neodollars. Blackbird does not ask what the meat is a mystery of.`], ['Food is just fuel. Mysterious fuel.']),
  eat_noodles: e(() => ['Blackbird eats the noodles. Whatever was in them, it worked. Mostly.'], ['Heroes need carbs. And possibly an exorcist.']),
  settle_tab: e((d) => [Number(d.left) > 0 ? `Blackbird pays ${d.amount} neodollars toward her tab at the Halo. She still owes ${d.left}. ${d.npc} nods.` : `Blackbird settles her tab in full: ${d.amount} neodollars. ${d.npc} looks faintly disappointed to be getting paid.`], ['Responsible. I just surprised myself.']),
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
  'collector:paid': e((d) => [`${d.npc} materializes next to Blackbird with the quiet menace of a man holding a clipboard. She pays ${d.amount} neodollars. The tab is closed.`], ['The tab. Gone. Like it never happened.']),
  'collector:threat': e((d) => [`${d.npc} pins Blackbird to the bar and tells her what a ${d.amount}-neodollar tab looks like from his side. He is not talking about forgiveness.`], ["We can work this out like adults. By which I mean, I'll hit him."]),
  'laser_tag:champion': e((d) => [`Blackbird wins her third arena match. The NEON KNIGHTS present her with a blinking vest and a trophy made of bottle caps. She is, officially, a champion of something. ${d.amount} neodollars prize money.`], ['A champion. Of laser tag. In a basement. Frame this.']),
  defib: e(() => ["Blackbird's heart stops. Her emergency defibrillator doesn't. A blue jolt and she's up, gasping, a little bit dead and a lot annoyed."], ['Okay. That was. Hm. Okay. Don\'t do that again.']),
  'recognition:charmed': e((d) => [d.mood === 'cold' ? `${d.npc} sees Blackbird and turns away. Whatever charm was there, it has aged poorly.` : `${d.npc} lights up. "Oh, it's you. You were charming." Blackbird is, at this point, very charming.`], ['People remember me. Mostly the good bits.']),
  'recognition:kissed': e((d) => [`${d.npc} waves at Blackbird with a small, knowing smile. Last time is still on their mind. And on the jukebox.`], ["What can I say? I leave an impression."]),
  'recognition:beaten': e((d) => [`${d.npc} sees Blackbird and touches the sore spot where she hit them. "You," they say. That's all.`], ["They have my respect. A little."]),
  'recognition:shakedown': e((d) => [`${d.npc} sees Blackbird and clutches their wallet, visibly, with both hands.`], ['No hard feelings. A little hard feelings.']),
  'recognition:puppy': e((d) => [`${d.npc} sees Blackbird and does a slow, deliberate head-count. They are looking for a robot puppy. They don't find it. They find her.`], ['Sprocket is in a good place. With me. Which is a good place.']),
  'recognition:till': e((d) => [`${d.npc} sees Blackbird and very slowly locks the till.`], ['What a suspicious individual.']),
  'recognition:cheater': e((d) => [`${d.npc} sees Blackbird and her expression freezes. "Oh, it's you." She does not say anything else. She says it very loud.`], ['I explained myself. It was a good explanation.']),
  'recognition:killer': e((d) => [`${d.npc} sees Blackbird and moves, very casually, six feet away. "No trouble," ${d.npc} says. Nobody has asked.`], ['They know. They KNOW.']),
  'recognition:skylight': e((d) => [`${d.npc} sees Blackbird and points up at an imaginary skylight. "Hey, did you fall through that?" Several people laugh.`], ["It was an entrance. A dramatic entrance."]),
  'recognition:pickpocket': e((d) => [`${d.npc} sees Blackbird and casually checks every pocket they have.`], ['Cautious. That is how you stay alive in this city.']),
  'recognition:generic': e((d) => [`${d.npc} gives Blackbird a nod that says "I remember you".`], ['Neo remembers.']),

  // ====================================================== the dragon family
  'dragon_flight:artemis': e(
    (d) => {
      const lead = Number(d.count) === 1
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
  'dragon_notice:artemis': e((d) => [Number(d.count) === 1 ? 'The Artemis tilts, one wing dipping, scanner locking onto Blackbird with a soft electronic chirp. "PRELIMINARY CITATION ISSUED."' : 'A scanner locks onto Blackbird. Then another. The Artemis pack tilts as one. "CITIZEN: YOU ARE BEING EXAMINED."'], ['They noticed me. That is the first thing that has gone right all day.']),
  'dragon_notice:hera': e(() => ['A single huge eye in the Hera Mk. V\'s underbelly opens, and turns, very slowly, and finds her. A voice the size of a building says: "CITIZEN."'], ['Oh no. Oh, a very specific no.']),
  'dragon_engage:artemis': e((d) => [Number(d.count) === 1 ? 'Blackbird steps into the middle of the street, plants her feet, and tells the Artemis it\'s time for the best day of its life.' : 'Blackbird steps into the street and points at the Artemis pack. "Which of you wants to go first?" They do not need to choose.'], ['Dragon slayer. DRAGON. SLAYER.']),
  'dragon_engage:hera': e(() => ['Blackbird steps into the middle of the street, plants her feet, and points her weapon at a Hera Mk. V. It is not an even match. It is not, technically, a match.'], ["I've killed bigger. Probably. I've forgotten when."]),
  'dragon_hide:ok': e((d) => [d.kind === 'hera' ? 'Blackbird flattens herself into a doorway, behind a bin, under a tarp. The Hera passes over the top of her like a tide.' : 'Blackbird ducks behind a dumpster and holds her breath. The Artemis patrol glides over, scanner sweeping, and does not stop.'], ['Cover! Excellent cover. I am a cover professional.']),
  'dragon_hide:fail': e((d) => [d.kind === 'hera' ? 'Blackbird dives behind a bin. The bin is small, and Blackbird, as it turns out, is not.' : 'Blackbird dives behind a dumpster. A scanner pings. A knee is sticking out.'], ['I was fully hidden. They are just very good at their jobs.']),
  'dragon_gawk:artemis': e(() => ['Blackbird just stands there, mouth open, watching an Artemis patrol draw an arc across the city. Its wings leave faint afterimages.'], ['Beautiful. Terrifying. Beautiful again.']),
  'dragon_gawk:hera': e(() => ['Blackbird stands in the middle of the street, head tilted back, looking up at a Hera Mk. V. It fills the entire sky. She takes a step back, and another, without taking her eyes off it.'], ['I feel very small. This is a new feeling.']),
  'dragon_film:artemis': e((d) => [`Blackbird holds up her phone and films the Artemis patrol as it passes. The clip is posted before they are out of sight. Fame: ${Math.floor(Number(d.fame))}.`], ['This is going to do numbers.']),
  'dragon_film:hera': e((d) => [`Blackbird zooms in on a Hera Mk. V and films the whole sky. The clip is the most-watched thing in Neo for the next ten minutes. Fame: ${Math.floor(Number(d.fame))}. A very large eye turns.`], ['Content. Pure content. Worth it.']),

  // ====================================================== layered skills, hobbies, and things to throw
  throw: e(
    (d) => {
      const foe = String(d.foe);
      switch (d.variant) {
        case 'pool_cue':
          return [d.cop ? `As ${foe} reaches for the cuffs, Blackbird snatches a pool cue off her belt and hurls it. ${d.skilled ? 'A shot she has made a thousand times. It lands exactly where she wanted' : 'It hits ' + foe + ' in the knee'} for ${d.dmg} damage.` : `Blackbird flings a pool cue at ${foe}. ${d.skilled ? 'She has put that shot in the corner pocket a hundred times. ' : ''}It connects for ${d.dmg} damage.`, `A pool cue sails across the room and finds ${foe}. ${d.dmg} damage. ${d.skilled ? 'All those hours at the table were for something.' : 'Mostly dumb luck.'}`];
        case 'cocktail_molotov':
          return [`Blackbird hurls a Molotov Mule. It does not so much break as bloom. ${foe} and everyone near them is on fire: ${d.dmg} damage and a smell like a rave in a refinery.`, `The cocktail leaves her hand, ignites, and lands on ${foe}. Burn damage: ${d.dmg}. Presentation: excellent.`];
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
  'darts:stray': e((d) => [`A dart goes wide and lands in ${d.npc}'s drink. ${d.npc} stands up slowly. ${d.amount} neodollars gone, and so is their patience.`], ['That is definitely their fault.']),
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
  'busk:stolen': e(() => ['A couple of kids on a scooter swoop by and grab the guitar out of her hands. By the time she turns around, so are they. She is left with a hat.'], ['Honestly, I respect the hustle.']),
  'cook:good': e((d) => [`Blackbird takes over the stove and plates a noodle special that makes ${d.npc} stop what they're doing. It is, honestly, good. She sets it aside, glowing.`], ["I'm a chef. A hero and a chef. What can't I do?"]),
  'cook:meh': e(() => ['Blackbird makes noodles. They are noodles. She takes them with a flourish.'], ['Gourmet, if you squint.']),
  'cook:fire': e((d) => [`Blackbird sets the stove to "ambitious" and the kitchen briefly becomes a candle. ${d.npc} comes in carrying a fire extinguisher and a grudge.`], ['Flambé. It is called flambé.']),
  'cook:kicked_out': e((d) => [`Blackbird strides into the kitchen and picks up a pan. ${d.npc} picks up a larger pan. "You're banned."`], ["It's a very big pan."]),
  eat_dish: e(() => ['Blackbird eats her own noodle special. It is shockingly good. A warm, confident energy rises through her.'], ["I'm either a chef or the food is magic. Either way."]),
  'serve_dish:swoon': e((d) => [`Blackbird slides a plated noodle special in front of ${d.npc}. ${d.npc} takes a bite, closes her eyes, and says nothing for a good ten seconds. Then: "Who ARE you?"`], ['The way to a girl\'s heart is through her stomach. And my knife work.']),
  'serve_dish:polite': e((d) => [`Blackbird presents ${d.npc} with a plated noodle special. ${d.npc} eats it, smiles, and says it is "interesting." Everyone knows what that means.`], ['She loved it. Probably. It was interesting, which is a compliment.']),
  'tend_bar:pro': e((d) => [`Blackbird vaults the bar, steals a shaker, and pours like she was born there. ${d.npc} watches, impressed, then amused. Tips: ${d.amount} neodollars.`], ['Bartender: the second oldest profession, and I am great at it.']),
  'tend_bar:lucky': e((d) => [`Blackbird jumps behind the bar and wings it. Somehow, a drink comes out that people want. Tips: ${d.amount} neodollars. ${d.npc} is concerned.`], ["Naming it 'The Blackbird.' Don't ask about the ingredients."]),
  'tend_bar:spill': e(() => ['Blackbird tries a flourish with a shaker. The shaker disagrees. Several people are now wearing a Synthahol Sunrise.'], ['Free dry-clean tip: don\'t.']),
  'tend_bar:complaint': e((d) => [`${d.npc} sips the drink Blackbird handed them, stares, and puts it down very carefully. "What is in this."`], ["It's a recipe. It's called 'a surprise.'"]),
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
  tag_owner: e((d) => [`${d.npc} catches Blackbird mid-piece at ${d.place}. He does not look like a man who is going to critique the composition.`, `"Is that SPRAY PAINT," asks ${d.npc}, in the voice of someone who already knows. It is.`], ["It's called a commission. They'll understand when it's done."]),
  'vandal:scene': e((d) => [Number(d.count) === 1 ? 'A patrol officer rounds the corner, sees the wall, sees the can, and sees Blackbird. "Citizen. Step away from the art."' : 'Two NPD officers appear on either side of the wall. "Itinerant vandal," says one, to the other, like a diagnosis.'], ['Critics.', 'Nobody respects a work in progress.']),
  'vandal:escaped': e((d) => [`Blackbird vaults a fence, rounds a bin, and is gone before the cuffs come out. The NPD can fine a wall, but not a rumor. She ends up at ${d.to}, a little out of breath.`], ['Art is a contact sport.', "They'll never catch me. Not while I'm quick."]),
  'vandal:fined': e((d) => [`The officer writes a ticket: ${d.amount} neodollars for "unlicensed expression". Blackbird pays, and for a moment feels like an artist who has arrived.`], ["A fine is the first review. It's the best one."]),
  'vandal:cant_pay': e(() => ['The officer writes out a ticket for more than Blackbird has. "Then we do this the other way." The other way involves cuffs and shouting.'], ["I thought art was supposed to be free."]),
  gang_hunt: e((d) => [d.turf ? `${d.count} ${GANGS[String(d.gang)] ?? d.gang} members step out of the shadows at ${d.place}, their own turf. "You the one painting our wall?"` : `${d.count} ${GANGS[String(d.gang)] ?? d.gang} members find Blackbird at ${d.place}. Somebody described her face to them, and drew her bird.`], ['Honestly, I just wanted a canvas.', 'Fans! Of a kind.']),
  'mural:proud': e((d) => [`Blackbird passes her own work at ${d.place}: ${d.pieces} piece${Number(d.pieces) === 1 ? '' : 's'} up, a little faded, a little smug. Somebody has added a mustache. She respects it.`, `Her bird is still on the wall at ${d.place}. A kid is looking up at it. She does not say anything. She stands a little taller.`], ['My work, in the wild. Look at it.', 'Still there. Still gorgeous.']),
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
  if (d.kind !== undefined) keys.push(`${e_.type}:${d.kind}`);
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
