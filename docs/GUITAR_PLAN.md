# Guitar: the long game

Status: **plan, nothing built.** Feel over balance: every number here is a first guess, to be felt out (or never tuned
at all). Names marked PROPOSED are drafts for the author to veto, as in `docs/setting/`.

## The idea in one paragraph

Combat is not a storyline. It is a **space**: a skill that climbs to 100, weapons that roll classes, tiers and traits,
techniques that open up, enemies at the local grade, places that get nastier with distance, bosses that can be beaten
more than one way, and a world that remembers. Guitar gets the **same shape**. She gets better, finds better gear,
learns new moves, meets bigger crowds and nastier rivals in further districts, and the things she can *do* with a
guitar keep widening until a good enough player can bend the city with one. Nothing is a required path. A run where
she never touches a guitar is fine; a run where she plays a rooftop set during an acid storm, starts a riot outside an
Atlas showroom and then electrocutes an Artemis with a feedback loop is also fine, and much louder.

## Design rules for this plan

1. **Parallel ladders, not a plot.** There are about eight independent tracks (craft, gear, moves, crowds, rivals,
   money, fans, legend). Each is fun alone; they multiply when they meet.
2. **Guitar is a way of acting on the world**, not a minigame in a box. Every ladder should reach out into some other
   system: combat, stealth, romance, heat, the economy, Atlas, the lab.
3. **The guitar grade is a real grade.** "Guitar 40 in a grade-40 district" means the crowds there are a fair fight.
   It is the same unit `docs/PROGRESSION.md` uses for everything else.
4. **Rule of cool beats plausibility.** If it would look good on an album cover, it is allowed. A double-neck guitar
   with a chainsaw on one neck is allowed. Playing a dragon to death is allowed.
5. **The world supplies the limits** (crowd fatigue, heat, broken strings, grudges, stolen gear), never timers or
   fairness clamps. Same as everywhere else.
6. **Silly, but played straight.** Blackbird is certain she is a legend from the first chord. The field report knows
   better, for a while.

## What exists today (what we are extending)

| Piece | Where |
|---|---|
| `guitar` skill (music group, spills 0.4 into `music`), four titles | `content/skills.ts` |
| Acts: `jam` and `steal_guitar` (the green room), `gig` (with a band that likes her), `busk` (outdoors, owns an instrument), `guitar_duel` (band members) | `hobbies.ts`, DESIGN.md "tenth pass" |
| Odds via `synergy` over guitar, music, vocals, charm | `hobbies.ts` `ODDS` |
| Crowd fatigue per skill per place, stage prestige (club 1.5, bar 1, street 0.8), `fameFrom` | `stage.ts` |
| Callings: "become a guitar legend" (`mind.passion`), act weighting by passion | `stage.ts`, `mind.ts`, `ACT_SKILL` / `FAME_ACTS` / `CALLING` |
| Affordance rows: gym `class-gig`, pawn `test-an-instrument` and `busk-practice-amp` | `content/gymafford.ts`, `content/pawnafford.ts` |
| Items: `vintage_guitar`, `relic_guitar` ("a guitar with a famous dent"), tag `instrument` | `content/items.ts` |
| Fame (`hero.fame`, per run), the `fame` goal and its learned act values | `types.ts`, `goals.ts` |
| What survives death: `legacy` (account, world, gate, dragons, deaths) and people who remember her (`revenant.ts`) | `types.ts`, `universe.ts` |

So: a handful of acts at the bottom of the ladder, one fame number, and nothing above about grade 10. The plan is the
rest of the ladder.

---

## Ladder 1: Craft (the skill to 100)

The guitar skill already runs to 100 on the grade curve. What's missing is a reason to care past 10. Titles grow to
about ten (like the combat titles), and **each band unlocks new kinds of act**, not just better odds:

| Grade | Title (PROPOSED) | What opens up |
|---|---|---|
| 0-3 | knows three chords | busking, jamming, open mics, getting thrown out of open mics |
| 3-8 | can play a whole song, in order | bar gigs, duels, song-writing (Ladder 4), the first moves (Ladder 3) |
| 8-15 | plays like she means it | headlining a club, a demo tape, a band (Ladder 6), the first hostile crowds |
| 15-25 | melts faces, professionally | touring districts, house shows past the cordon, record-label interest, sonic moves in fights |
| 25-40 | has a sound people steal | radio, a fan club per district, rival legends start noticing, sabotage gigs |
| 40-60 | a genre with legs | festivals, pirate broadcasts, mass crowd acts (Ladder 7), dragon duels |
| 60-80 | the reason the noise ordinance exists | stadiums, broadcast takeovers, songs that move markets, board-level hooks |
| 80-100 | a weather system with a pick | myth acts: songs that change the city overnight (see "Myth tier") |

Training sources, by analogy with fight XP: **XP by the crowd's grade relative to hers** (nothing for a bar she's
already won over, most for a crowd a little out of her league, little for a stadium she can't hold). Practice alone
(the lab, a squat, a stolen guitar on a fire escape) is slow and safe, like the gym.

## Ladder 2: Gear (guitars are weapons)

Guitars are rolled the way weapons are (`weapons.ts`): a **class**, a **tier**, and up to three **traits**. They're
also, when it matters, weapons: every guitar has a melee profile (it is a `club` with opinions).

**Classes** (PROPOSED): acoustic (quiet, busks anywhere, no amp needed), electric (needs an amp or a jack, loud),
bass (crowds dance, rivals underestimate it), twelve-string (romance bonus, hard to tune in the rain), double-neck
(two traits per neck), keytar (counts as guitar and DJing, nobody respects it, it doesn't care), flying-V (a melee
weapon first), cigar-box (scrap-built; tinkering made it), and **chainsaw guitar** (a real chainsaw; plays one chord).

**Traits** (the "trait bought out of base quality" rule from weapons):

| Trait | Does |
|---|---|
| volume | how far the sound carries. Draws crowds from neighbouring streets; also draws the NPD (the `noise` trait in reverse: loud is the point) |
| tone | flat bonus to winning a crowd |
| sustain | longer solos; a held note can break glass, and at high grade, things larger than glass |
| feedback | sonic attack in fights: a chance to stun everyone in a cone, hers included if she's careless |
| resonance (vs-type) | bonus against one kind of thing: punks, corpos, ravers, robots, **dragons** |
| hardened | survives being swung at someone (guitars that aren't hardened break on the first hit, gloriously) |
| jacked | plugs into city systems: PA towers, billboards, a car stereo, a dragon's loudspeaker (needs Override / tinkering) |
| signature | carries a famous player's reputation; crowds who know it give her the benefit of the doubt |
| cursed | plays itself at 3 a.m. Comes back if pawned (like the cursed charm) |

**Around the guitar:** amps (armor analogue: a big amp makes a hostile crowd survivable), pedals (cheap traits:
distortion, delay, a "riot" pedal of uncertain legality), strings (a consumable, like ammo; a set breaks on a big
fail), and **implants**: cyber-fingers (+skill), a subdermal pickup (she *is* the amp), a chest-cavity subwoofer, a
spinal audio jack that lets her play a building's wiring. Implants already have a slot system; these are new entries.

Where gear comes from: the pawn shop's instrument wall (already there), a music store as a future location (a
PROTOCOL candidate), the green room (steal it), rivals she beats (they drop their guitar, like a weapon), relics (the
famous dent), Atlas showrooms ("SafeSound Starter Guitar, tuned to approved frequencies"), and her own bench
(tinkering builds the cigar-box and the chainsaw guitar).

## Ladder 3: Moves (the techniques list for a stage)

Combat has `techniquesFor`; a performance gets the same thing. A **move** is an entry with who has it, what it costs,
what it's worth against this crowd and what it does. Unlocked by grade, by gear and by weird events (a move learned
from a legend she beat, a move invented while on stims).

- **Stage moves:** power chord, the windmill, behind-the-head, with-her-teeth, the bottle slide (needs a bottle,
  mixology adjacent), the knee slide (athletics), the stage dive (athletics, the crowd catches her if she's won them;
  if not, the floor does), the climb (scaffolding, a speaker stack, a parked car, a dragon's leg), the smash finale
  (destroys the guitar for a huge payoff; a guitar with `hardened` survives and the crowd feels cheated).
- **Crowd moves:** call-and-response (beats the Rust Choir at their own game), the slow one (calms a fight about to
  start), the anthem (rallies; Ladder 7), the diss track (targets one person or faction in the room), the cover (cheap
  win, little fame), the deep cut (only works on a crowd that knows her).
- **Fight moves (from about 15):** usable on the tactical board when she's holding a guitar.
  - *feedback scream*: cone stun (the `feedback` trait).
  - *the brown note*: one person-target loses their next two actions, and their dignity.
  - *resonance*: find a robot's or a car's frequency; damage over time. Needs `resonance (robots)` or high music.
  - *wall of sound*: everyone in range is pushed back a tile. Cover gets knocked over.
  - *battle hymn*: allies and companions get a damage bonus while she plays instead of attacking.
  - *swing*: she hits someone with it (melee, uses the guitar's club profile; see `hardened`).
- **Chase moves:** playing from the back of a moving car (stun pursuers, the cops get distracted and start
  head-banging), a sound-system drive-by on an Atlas billboard.

## Ladder 4: Songs (the loot)

The best idea in the plan, probably: **songs are procedural objects written from what actually happened to her.**
The memory and callback systems already know what she did; song-writing turns that into an item.

- A song has a **title**, a **subject** (a person, a place, an event from this run's log), a **genre**, a
  **quality** (her guitar and music at writing time, plus the drama of the event) and a **hook** (how catchy).
- "Ballad of the Overpass" after CINDERJAW dies. "Bao Doesn't Love Me Back (Live)". "Six Separate Groups". "[Her
  Government Name] Is Not My Name" (filled in per save; it is her worst song and her biggest hit).
- Songs wear out like crowds do: a song that's been played to death in a district stops landing there, so she keeps
  writing.
- **Diss tracks** name a person, gang or company. They hit affinity, raise or lower heat, and can start a fight
  (with the subject or with their fans). A diss track about a board member is a hook (see Ladder 8).
- **Love songs** name a romanceable person. Played to them it's a serenade with a huge upside; played to everyone
  else, it's a public declaration, and the person may or may not appreciate that.
- **Recording:** a song recorded at a studio, a pirate station or a stolen Atlas booth becomes a **master**: an item
  she can sell, leak, upload or hand to a fan. Masters are the bridge to persistence (Ladder 9).

## Ladder 5: Crowds and venues (the danger field, for music)

A crowd is the music equivalent of an enemy: it has a **grade** (from the place's `gen.danger`, so further districts
mean tougher, richer crowds), a **type**, and a mood. A set is a short contest against it.

**Crowd types** (PROPOSED), each with what wins them and what goes wrong:

| Crowd | Wins them | Goes wrong |
|---|---|---|
| tenement locals | sincerity, a cover they know | they're polite, which is worse than booing |
| punks | speed, volume, the stage dive | the pit; she comes out with someone else's tooth |
| ravers (Neon Marrow turf) | a groove that doesn't stop | they don't notice the song ended, three hours later |
| corpos | nothing; they're here for networking | an offer of a jingle contract, which is the bad ending |
| Rust Choir | call-and-response, welded instruments | a battle of the bands nobody agreed to |
| Saint Sixers | a hymn, any hymn | they tithe her tips |
| street kids | anything loud | they follow her to the next gig, and the one after |
| cops at a noise complaint | the slow one | a fine with a subscription tier |
| an Atlas wellness audience | nothing approved | a wellness check |

**Venues as a ladder** (each a kind of place, never a fixed address): the street, an open mic, a dive bar, a house
show, a basement under a laundromat, a rooftop, a club main stage, a pirate radio tower, a warehouse rave, a
festival, a stadium, and the absurd tier: the top of a moving freight train, a dragon hangar, Atlas HQ's lobby PA.

**The set as a mini-contest** (engine sketch): like `runChase` with its stretches, a set is three to seven **songs**,
each a round. The crowd has **hype** (her "damage") and **patience** (its hit points, in reverse); she picks a move or
a song each round; hecklers, a bouncer, a thrown bottle, a broken string and a power cut are the "terrain". The log
gets a proper beat-by-beat for good sets and a single deadpan line for flops. A won crowd pays tips, fame and fans; a
lost crowd pays nothing and sometimes throws things.

## Ladder 6: Band (companions who play)

Bandmates are companions (`companions.ts` `KINDS`), and they do two jobs: they lift sets, and they fight.

- **Recruitable** (PROPOSED): a drummer (an actual person; hits things for a living, in and out of fights), a bass
  player (silent, loyal, carries a crowbar), a drum machine with a scrapper-bot chassis, a hacker who runs the lights
  and also the building's cameras, the cyber-pigeon on tambourine (`pigeon` already exists; it gets a hat).
- **Band drama** is a feature: creative differences, a bandmate who wants to go solo, a bandmate dating her ex, a
  bandmate poached by an Atlas label. Loyalty already exists; this is what spends it.
- The **band name** is generated and terrible, and the band votes on a new one after every big win.
- A rival band is a rival party: battle-of-the-bands is a set where the other side has moves too.

## Ladder 7: Fans (a resource she can spend)

Fame is a number; **fans are people**. Past about grade 15, a won crowd leaves behind fans: a count per district plus
a few named superfans (generated NPCs who remember gigs, show up, and have opinions about the new direction).

What fans do for her, by analogy with allies, informants and cover:

- **Cover:** a crowd of fans is a place to disappear into (stealth bonus in her districts; pursuers lose her in a
  crowd that's chanting her name).
- **Shelter:** a fan's couch is a safehouse (`laylow.ts`).
- **Tips:** fans tell her things (`knowledge.ts`): where the dragon flew, which cop is on the take, where the green
  room keeps its good guitar.
- **Muscle:** at a big enough gig, fans join a fight as a crowd unit (unarmed, enthusiastic, numerous).
- **Flash mobs:** she calls a crowd to a place. Uses: a distraction for a heist, blocking an NPD response, swarming an
  Atlas showroom, a human wall between a dragon and a street.
- **Riots** (the top of the fans ladder): an anthem at the right moment, in front of the right Atlas building, and
  the district boils over. Heat everywhere, Atlas presence drops for a while, shops get looted (including ones she
  likes), and she is very proud of herself.
- **The downside:** fans are fickle (a flop or a sell-out costs fans), some are stalkers (silly, never menacing), and
  a big enough fanbase makes her impossible to hide (`fame` already makes bouncers notice; a stadium-level Blackbird
  can't buy noodles without a selfie line).

## Ladder 8: Rivals and bosses (who she plays against)

Combat has mooks, commanders, dragons and the board. Music gets the same strata.

- **Mooks:** hecklers, open-mic regulars, a busker who thinks this is their corner.
- **Rivals:** generated guitarists at the local grade with a gimmick, a guitar and a grudge. A **guitar duel** is the
  music version of a fight (there's an act already); beating a rival takes their crowd and sometimes their guitar.
  Rivals remember, improve and come back.
- **Legends** (PROPOSED, a handful of named high-grade NPCs, roaming, never pinned to a place): *Saint Feedback*, a
  retired chrome shredder who only plays for the dying; *Mother Distortion*, Rust Choir's founder, sixty and welded
  to her amp; *Velvet Halo*, a crooner who is technically a hologram and contractually a person. Beating one is a
  set-piece; learning from one is a move.
- **Atlas music** (Pride's business line, Public Image): **SafeSound**, the subscription streaming service with
  approved frequencies; **ANGEL//SAFE** (PROPOSED), Atlas's synthetic pop idol, a boss-grade "artist" who tours with a
  dragon escort and sings about compliance. Out-playing ANGEL//SAFE at her own concert is a boss fight with a
  stage.
- **Dragons:** the Apollo line is named for the god of music, and Atlas would absolutely lean into that.
  *Apollo Mk. III "CHORUS"* (PROPOSED): a public-address platform that hovers over districts playing Atlas Harmony
  at 140 dB. It can be shot down like any dragon, or **out-played**: a guitar with `volume` and `resonance
  (dragons)` drowns its broadcast, and a high enough grade finds its resonant frequency and shakes it apart. Same
  dragon, a different fight.
- **The board:** per `board.md`, no member has a required path, and music is one of the paths.
  - *Pride* (Public Image): humiliate her with a viral song; outsell ANGEL//SAFE; get her to sign Blackbird, then
    sabotage the launch on stage.
  - *Sloth* (Police Liaison): the noise ordinance is hers. A song so popular the complaint queue crashes the NPD's
    forms system.
  - *Greed* (Premiums): a benefit concert that pays every fan's Atlas deductible, live, in public.
  - *Lust* (Government Relations): a love song so good a councillor defects.
  - *Envy* (Surveillance): a fan base big enough that the surveillance feeds are nothing but her face.
  - Hooks, never requirements.

## Ladder 9: Money and the industry

The money ladder, for players who like numbers going up: tips (busking, today) → gig fees (a cut of the door) →
merch (a table, then a stall, then a counterfeit market she didn't authorise and secretly loves) → a record deal
(advances, a contract with a clause she didn't read) → royalties.

The industry has its own NPCs and its own vices: the promoter who doesn't pay, the A&R rep from an independent label
(a real ally), the A&R rep from the Atlas label (the devil's bargain: money and reach, but Blackbird never works for
Atlas, so signing is always a long con that ends with her setting fire to the contract on stage), the bootlegger who
sells her masters, and the jingle agency.

## Ladder 10: Legend (what survives death)

Skills, fame and fans reset on death, by design. But a roguelike that remembers is the point of `legacy` and
`revenant.ts`, and music is the most natural thing in the game to outlive her.

- **Discography** (`legacy.discography`, PROPOSED): recorded masters survive. Her songs are still on jukeboxes in the
  next run. NPCs hum them. A street kid covers one, badly.
- **The legend of the last Blackbird:** after a death at stadium level, the next run opens with tribute nights,
  murals, and a cover band called something like *Blackbird Lives*. She can crash their gig. They don't believe it's
  her. She's offended that they're better at the bridge.
- **Royalties** pay into `legacy.account` between runs, so a dead rock star funds the lab (feel over balance: this is
  lopsided, and fun).
- **Covers as rivals:** past a certain fame, another guitarist in Neo is playing her songs for money. A duel with
  your own cover act is a set-piece.
- A legend run starts with a **head start of reputation, not skill**: bouncers know the name, crowds give her a song
  or two of benefit of the doubt, Atlas has a file on her from the start.

---

## Where guitar reaches into other systems

The multidimensionality principle from `docs/locations/PROTOCOL.md`, applied to a skill instead of a place:

| System | Guitar meets it as |
|---|---|
| Combat | the guitar as a club, fight moves, bandmates and fans as allies, the `resonance` trait against robots and dragons |
| Stealth | fans as cover, a gig as a heist distraction, an acoustic set as a way into a building ("the entertainment") |
| Chases | playing from a moving car; fans block the pursuers |
| Romance | serenades, love songs as public declarations, groupies, a bandmate crush |
| Heat / NPD | noise complaints, ordinances, riots, a fan petition that gets a cop transferred |
| Gangs | the Rust Choir as rivals and natural allies, Neon Marrow raves, Saint Sixer hymns |
| Override / tinkering | jacking into PA towers, billboards and dragon loudspeakers; building guitars and amps |
| Economy | tips, fees, merch, deals, royalties; gear as loot |
| Lab | royalties into the account; future nodes for "absolute pitch", "callused fingers", "stage presence" |
| Other music skills | vocals, DJing and beatboxing slot into the same set system (a set is just "a performance"); this plan's machinery is shared |

## Myth tier (80+): rule of cool, uncapped

A grab bag for the top of the ladder, deliberately absurd. None needed; any one would be a story the player tells.

- A rooftop solo during an acid storm so loud a lightning strike hits the right building.
- Out-playing a Hera Mk. V's broadcast so hard it lands to listen.
- A stadium encore that turns into a march on Atlas HQ.
- A song that charts so high SafeSound adds it to the approved list by accident, and every Atlas dragon in the city
  starts playing it.
- She plays the cordon down: CINDERJAW's control signal drowned out at the gate (an alternative to killing it, for a
  Blackbird who can).
- The CEO, who was once a cyberknight, turns out to have been in a band. Blackbird has the bootleg. (Hook, not a
  scene.)

## Engine sketch (for when it's built)

Not a commitment, just where things would go:

- **`perform.ts`**: the set as a contest (crowd hype and patience, songs as rounds, moves as entries), modelled on
  `chase.ts` (`runChase` and its stretches). All the music skills use it; existing acts (`gig`, `busk`, `class-gig`)
  can migrate when convenient or stay as quick one-roll acts.
- **`instruments.ts`**: guitar classes, tiers, traits; `rating()`-style comparison so she can pick the right guitar
  for a crowd (like picking the right weapon for a foe). Guitars carry a club profile for `weapons.ts`.
- **`songs.ts`**: writing songs from the event log, wear per district, masters as items.
- **`fans.ts`**: fans by district, superfans as NPCs, the spend actions (cover, shelter, tips, muscle, mobs, riots).
- **Techniques:** fight moves are new entries in `techniquesFor` gated on "holding a guitar".
- **Companions:** band kinds in `KINDS`.
- **Legacy:** `discography` and legend fields, a save upgrade.
- **Grades:** crowd grade from `gen.danger`; XP by relative grade, as `combat.ts` does for fights.
- Own random streams for everything rolled on the map (as gyms and pawn shops do), so existing saves don't reshuffle.

## Suggested build order

Each step is fun on its own and doesn't need the next one.

1. **Instruments**: classes, traits, guitars as clubs, a few on the pawn wall and in the green room. Cheap, visible,
   and gives the existing acts something to vary.
2. **The set** (`perform.ts`), crowd types and crowd grade from the danger field; migrate `gig` and `busk` onto it.
3. **Moves**: the stage list first, then fight moves on the tactical board.
4. **Songs**: writing from the log, diss tracks, love songs.
5. **Fans**: per-district counts, superfans, cover and shelter first, mobs and riots later.
6. **Rivals and legends**, then the band.
7. **Atlas music**: SafeSound, ANGEL//SAFE, Apollo "CHORUS".
8. **Legacy**: discography, royalties, the cover band.
9. **Myth tier**, one piece at a time, whenever one sounds fun.

## Open questions for the author

- Should fans persist across deaths at all (a small fraction?), or only songs and the legend?
- Is a full set contest (several rounds) welcome in the log, or should most sets stay one line with a long version
  only for big ones?
- A music store as its own location (via `PROTOCOL: new location`)?
- Apollo "CHORUS" and ANGEL//SAFE: keep, rename, or veto?
- Does the "music path past CINDERJAW" idea fit the gate, or should the gate stay a fight?
