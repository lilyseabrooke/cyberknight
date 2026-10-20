# Guitar: what it opens up

Status: **in progress.** The first seven steps of the build order are built (see "As built"); the rest is plan.
Feel over balance: every number here is a first guess, to be felt out (or never tuned at all).

## As built

| Piece | Where |
|---|---|
| Fame carries over (`legacy.fame`); renown per performing skill (`legacy.renown`, fed by `fameFrom`); fans on the places she won them (`Location.fans`) | `renown.ts`, `stage.ts`, `universe.ts` |
| Expectation on the skill scale (`legacy.repute`): the grade Neo has seen her play at, creeping towards her level with each good set in front of people, never lowered by a good set, eased by letdowns and time; sharp letdowns (fame, renown, fans; a big room empties the block), "underwhelm", slumps and comebacks, judged after every music act in `mindAfter` | `renown.ts` `judgeSet`, `goals.ts` |
| Bookings on the legacy: gigs at bars and clubs she knows, private functions behind gated doors; the `booking` goal; the door waves her through; the booked set (`booked_<skill>` acts); missed bookings cost fans, fame and the host's goodwill | `bookings.ts`, `moves.ts`, `goals.ts` |
| Muse's first rungs: the Clearance letter, Clearance officers (fines, a guitar taken "for safekeeping"), the A&R scout and the sign-or-refuse choice (by personality), the contract outliving her, the warrant after a refusal; signed, Muse books her twice as often at half again the fee | `muse.ts` |
| Fame fades on the in-game clock; fame perks (bouncers, free drinks, fan tips, cheering witnesses, intimidation, call-ins) ramp in at steeper numbers | `renown.ts` `fadeFame` / `famed`, `moves.ts`, `interactions.ts`, `extras.ts`, `witness.ts`, `tactics.ts`, `callins.ts` |
| Instruments rolled like weapons: nine classes (acoustic to chainsaw), a tier, traits (`tone`, `volume`, `signature`, `jacked`, `hardened`, `resonance`, `feedback`); tone adds skill levels, volume earns more per set and widens the crowd, signature softens letdowns, a hardened guitar is a weapon (resonance and feedback in its swing), a jacked one turns a billboard hijack into a set | `instruments.ts`, `skills.ts`, `stage.ts`, `renown.ts`, `extras.ts` |
| Where guitars come from: instrument exchanges (and a little elsewhere) stock rolled guitars and guitar cases; she buys the ones that are a step up; signing with Muse comes with a wired Muse guitar | `content/pawns.ts`, `pawnkit.ts`, `muse.ts` |
| Doors: `draw_out` (a loud set on the street pulls a place's guards outside, best when she has business in there); the guitar case (at a private booking, a fight she starts is an ambush) | `axeplay.ts`, `combat.ts` |
| Fans as a resource, counted around her block: cover in a neighbourhood that loves her (and sticking out, famous, where nobody does); a fan's couch to lie low on, once a night per block; the grapevine (where her target was seen, a hideout off a street she hasn't walked); the flash mob, an influence on a crowd: some of her fans turn up as people, then everyone in earshot weighs what she asks of them (her guitar and charm for a voice, the turnout for an edge), the keenest six take it on as their own goal and the rest follow and lend them their numbers; around it, 12 beats of heavy cover that also holds back NPD responses; costs a tenth of the local fans and a point of heat; once a night per block | `fans.ts`, `crowd.ts`, `stealth.ts`, `laylow.ts` |
| The cordon teardown: with 150+ fans inside the cordon, a guitar, and the Overpass PA or a billboard, she plays the anthem (a guitar roll, helped by spare fans, volume and a jacked guitar; once a night). If it lands, the cordon comes off for good (`liftCordon`) and CINDERJAW lifts off as a persistent roaming dragon (the Apollo family) that only comes back while she's past where the cordon was; if not, nothing comes down and a fifth of the district's fans walk. A fame goal pulls her to it | `cordon.ts`, `dragonmodels.ts` (`CINDERJAW_MODEL`), `dragons.ts`, `plans.ts` |
| Muse noise-abatement drones, the first thing Muse sends: from a performing renown of 8 (before the letter), now and then after a show that drew a crowd, one or two pastel drones announce UNAUTHORIZED ENTERTAINMENT DETECTED, tear-gas the place (the crowd scatters and the spot goes cold for that skill; she coughs, -2 power for a few beats) and then she has to deal with them; they keep coming at every rung short of signing | `muse.ts`, `content/archetypes.ts` |
| Inspiration teams: once she has refused Muse and her renown passes 150, strike squads (a Muse faction; operatives and team leads in pastel armour with heart-decal SMGs, glitter rifles and glitter grenades) hit her after public sets and at bookings, bigger and better the bigger she is; if they kill her, Muse posts a tribute next night | `muse.ts`, `content/archetypes.ts`, `content/items.ts`, `factions.ts` |
| The underground, once Muse has noticed her and she hasn't signed: secret shows (a booking kind in cellars, back units and the Halo basement; books from an expected grade of 8, pays less, Muse never hears about it, wins extra fans and a box of bootleg tapes); bootleg tapes (contraband: hand them out in a crowd for fans, sell them, or lose them to Clearance first); pirate towers (Muse relay masts on a tenth of generated streets, guarded by technicians or an Inspiration team; win and rewire one with tinkering, a jacked guitar helps; each night it plays her to its neighbourhood and Muse may take it back; one inside the cordon is a teardown stage) | `bookings.ts`, `underground.ts`, `muse.ts`, `cordon.ts` |
| Tests | `renown.test.ts`, `bookings.test.ts`, `muse.test.ts`, `instruments.test.ts`, `fans.test.ts`, `crowd.test.ts`, `cordon.test.ts`, `underground.test.ts` |

Not yet: the named Inspiration commander, LUMINA, breaking a Muse contract, resonance against dragons (step 9), and everything from
step 8 of the build order on.

## The idea

Combat is valuable because of what it opens: a fight gets her into a hideout, a bounty pays, a dead CINDERJAW opens the
cordon. Guitar should work the same way. **Being good at guitar opens doors**, and the doors lead to the same places
combat and stealth do (money, access, allies, the end of the cordon, a shot at a board member), by a different road.

The game never asks her to play a guitar. But a good player keeps finding opportunities only a good player gets: she's
booked as the entertainment at a party she could never break into, a gang lets her in because she won the call-and-response,
a dragon goes quiet because she found its frequency, a board member puts their own hand out to give her a prize on live
TV. No storyline holds these together. They're entries in a catalogue, gated by skill, fame, place and circumstance,
the way fights are gated by grade and danger.

## Canon: fame survives death, skill doesn't

(The author's call.) Blackbird is rebuilt from a cached copy of herself. To Neo, nothing happened: it's the same
Blackbird, with the same name, the same fans, the same bookings, the same songs on the jukebox. But the body is new,
and **her hands don't remember**. She knows every song she ever wrote. She can't play most of them any more.

So the long game splits in two:

| Carries over (Neo's memory of her) | Resets (her body) |
|---|---|
| fame, fans, superfans, fan clubs per district | guitar skill (and every skill) |
| songs she wrote and recordings she made; who's covering them | the gear she was carrying |
| bookings, residencies, deals, sponsorships, a record contract: all still waiting for her | |
| the band (see "The band" below: it changes members all the time anyway) | |
| reputations: who loves her music, who she dissed, who's suing | |
| Muse's attention (see "Muse" below): a file, a warrant, a strike team that knows her face | |
| a Muse contract, if she signed one: the new body is still signed | |
| royalties (paid into `legacy.account`) | |

This is the most interesting thing in the plan, because it makes **expectation** a mechanic:

- **Fame opens doors; skill decides whether she walks through them.** Fame is the long ladder (it grows across many
  lives). Skill is the short one (it rebuilds each life). The biggest opportunities need both, so a famous Blackbird with
  fresh hands is constantly invited to things she can't yet pull off.
- **Disappointment, and it bites.** Every set is judged against what the crowd expects, which is set by her fame. A
  legend who plays like a beginner **loses fans sharply** (a bad set in front of a big crowd can cost a district) and
  gets reviews ("Blackbird has lost it, again"); a legend who plays like a legend gets the full payout. Early in a life
  she mostly disappoints people, and it costs her. That's the joke, and Blackbird doesn't see it ("They're stunned. You
  can tell they're stunned."). It's also the reason to rebuild the skill rather than coast on the name.
- **Bookings wait for her.** The residency, the festival slot, the gala gig are all still on the calendar after a
  death. So a fresh Blackbird wakes up in the lab with a stadium date on Thursday and three chords. Showing up is a
  choice; so is not showing up (that costs fans too, and the promoter's goodwill).
- **Ways around it,** each a little opportunity of its own:
  - *Unplugged:* an "intimate acoustic set" lowers expectations. Fans call it brave.
  - *The backing track:* DJing or tinkering fakes the hard parts. Getting caught is a scandal (and a fame event).
  - *The ghost guitarist:* a hired player behind the curtain. They want credit eventually.
  - *The experimental phase:* after a few flops in a row the city reframes them. Her new direction is "challenging".
    A reviewer calls it genius. She agrees.
  - *The comeback:* once her skill catches up with her fame, the first real set after a slump pays a comeback bonus:
    fans who left return, and the press can't stop writing about it.
- **Fame is not a ratchet.** Disappointment drains it, and so does time: fame (and renown with it) halves over about
  20 in-game days if she does nothing to keep it up, nights apart included (`fadeFame`). The songs never go away.
- **Fame's perks take real work.** A night earns 5 to 15 fame, and the perks ramp in well above that: a bouncer starts
  recognising her at 25 and almost always does by 120; free drinks from 20 to 100; fans tipping her in the street from 20.
  Booking offers start once a crowd expects a grade-12 player (a real player, near the top of the starting district),
  private functions at grade 25 (a professional, the kind of name that gets past a cordon).

This applies to fame in general, not just guitar (singing, DJing, graffiti, parkour all feed `fame`). Engine-wise,
fame and fans move from `hero` to `legacy`, plus a per-run "expectation" read from them.

---

## Muse: who's in the way

(The author's call; the setting entry is in `docs/setting/factions.md`.) **Muse** is Neo's entertainment conglomerate.
It runs every TV channel, makes all the music, and decides what music is allowed to be played, which turns out to be
Muse's. It is not Atlas, and it is not Atlas's. Blackbird can hate it, fight it, or sign with it.

Non-Muse music is technically illegal in several overlapping ways (licensing, broadcast, "unlicensed public emotion").
Nobody enforces it against a busker. It only matters once someone gets big enough to be noticed, and then Muse does one
of three things: **signs them, has them arrested, or sends an Inspiration team**. Inspiration teams are strike squads
with military-grade weapons and the sweetest branding in the city.

**The joke to play up:** Muse talks like the warmest influencer alive, and acts like a private army. "We light up your
world with music 🥰" in the same breath as a strike team unloading on a guitarist outside a laundromat, followed by a
heartfelt tribute post ("We're heartbroken to say goodbye to such a unique voice 💔 Stream LUMINA's tribute single
now"). As with Atlas, nobody at Muse notices the contradiction. (Hard rule 2 still holds: the violence is lethal and
deadpan, never gory, and the joke is Muse, never the musician.)

**Muse's attention is a ladder that climbs with her fame**, and because fame survives death, so does Muse's interest.
A freshly rebuilt Blackbird with three chords may still have a strike team that knows her face.

| Her fame | What Muse does |
|---|---|
| nobody | nothing; she's a busker |
| barely anyone | noise-abatement drones: UNAUTHORIZED ENTERTAINMENT DETECTED, and tear gas for the crowd |
| a local name | a **Muse Clearance** letter, glittery and menacing ("We noticed you're making music! That's so brave 🥰 Unfortunately..."). Clearance officers turn up at gigs: fines for the venue, a guitar confiscated "for safekeeping". Venues get nervous about booking her |
| trending | a **Muse A&R scout** with a contract and a pen that's already uncapped |
| she said no | the legal route: Muse files, the NPD serves (a warrant at a gig, a cop who apologises because he likes the second album). Muse Broadcast runs a segment about her "troubling sound" |
| too big to ignore | **Inspiration teams** at her gigs, at her bookings, outside her couch. Scales with fame like dungeon garrisons scale with danger. Pastel tactical armour, rifles with heart decals, a jingle before they breach |
| a legend | a named **Inspiration commander** with a callsign who has taken a personal interest (the Artemis Mk. II of the music business), and then Muse's own executives and idol, as bosses |

**LUMINA**: Muse's synthetic pop idol, on every channel, in every shop, in version numbers ("LUMINA 6.2:
now with more feelings"). She is the face Muse puts on everything, and eventually something Blackbird can duet with,
out-sell, out-play, or take apart on live TV.

**Muse and Atlas**: separate companies with a cosy partnership. Atlas's public announcements, dragon
broadcasts and hold music are licensed from Muse; Muse's channels carry Atlas's safety ads; Atlas's Gluttony has been
circling Muse for years, and Muse knows it. Two megacorps who need each other and don't trust each other are a wedge
Blackbird can drive.

---

## The opportunity catalogue

Each entry: what opens it (**skill**, **fame**, a place, an item, a moment), and what it gets her. Grades follow
`docs/PROGRESSION.md`; "guitar 25" means the grade, and checks in high-danger districts subtract the place's grade as
usual. Everything is soft: a lower-skilled Blackbird can try anything, and usually something funny happens.

### 1. Getting in (access)

The music version of picking a lock.

- **The entertainment** (guitar 8+ or fame): she's booked to play somewhere she couldn't get into: a corp penthouse
  party, a gang leader's birthday, a precinct retirement do, a dungeon's officers' mess, eventually an Atlas gala or a
  Muse premiere. She walks in the front door with a guitar case. What's in the case is her business (rule of cool:
  **the guitar case full of guns** is an item, and a classic). Once inside, the place is a heist, a hit or a theft site
  with her already past the door.
- **Draw them out** (guitar 5+, an instrument with volume): a set in the street outside a hideout pulls some of the
  garrison out to watch, or to complain. Fewer guards inside; some of the ones outside become fans.
- **Backstage** (fame): every venue's green room connects to a loading dock, an office and a safe. Famous people are
  waved through.
- **Gang doors:** the Rust Choir lets in anyone who wins a call-and-response at the gate; Neon Marrow raves let in
  whoever keeps the floor moving; Saint Sixers let in a good hymn. A win means a hideout she can enter without fighting
  (and a gang that might hire her).

### 2. The cordon comes down

**Rule: every way past the cordon removes it for good** (`legacy.gate = 'open'`). Nothing lets her slip through or
holds it open for a night. Killing CINDERJAW is one way. Guitar's way:

- **The teardown** (fans in the starting district, enough fame to call them, an anthem to coordinate them): she incites
  a flash mob at **every cordon exit at once**. On the drop of the chorus, thousands of fans physically tear the
  barriers down, simultaneously, with their hands, crowbars and one borrowed forklift. A lockdown can't hold a district
  that has decided it isn't locked down. **CINDERJAW, with nothing left to guard, leaves**: it lifts off the Overpass,
  the Overpass is just an overpass again, and CINDERJAW **roams Neo past the cordon** from then on (alive, unemployed
  and in a mood), a dragon she can meet again on the far side.
- What it takes: a big enough fan base inside the district (so it's a mid-to-late district goal, built over lives as
  fame carries over), a song people know the words to, and a way to reach them all at once (a broadcast, a pirate
  station, a billboard hijack, or a gig on the Overpass itself with the volume all the way up). A disappointing set
  on the night means half the exits stay up, and the crowd goes home. She can try again when she's earned them back.

### 3. Leverage (bending people)

- **Serenade** (guitar plus romance): already exists in miniature. Higher grades turn it into real leverage: a love song
  for a person changes how they feel about her, and a love song *about* a person, played in public, changes how
  everyone else sees them (good or bad, depending on the song).
- **The diss track** (guitar 10+, a song about someone): ruins a reputation. A corrupt sergeant becomes a district joke
  and gets transferred; a gang boss loses face and their crew splits; a shopkeeper's prices drop out of embarrassment.
  Also the surest way to make someone come looking for her, which is useful when she wants a fight on her terms
  (bounty marks flushed out by a song).
- **The jingle** (fame): a company pays well for a jingle. An independent company becomes an ally. An Atlas front
  becomes a sabotage opportunity: the jingle has a hidden message, or she plays it backwards at the launch.
- **The superfan inside:** past about fame 30, some generated NPCs in institutions are fans (a desk sergeant, a Helix
  lab tech, a dragon technician, an Atlas middle manager, a Muse Clearance officer who keeps her bootlegs in a drawer).
  A superfan can be asked one favour: a door left open, a file leaked, a patrol re-routed. Signing something for them
  helps.
- **The song as blackmail:** "It'd be a shame if this one charted." A threatened song works like a threat, aimed at
  someone's career instead of their kneecaps.

### 4. Allies and crowds

- **Fans as cover:** in a district where she has fans, a crowd hides her (pursuers lose her in a sea of people
  chanting her name). A big enough fan base makes her *harder* to hide everywhere else: she can't buy noodles without
  a selfie line.
- **A couch in every district:** fans offer somewhere to lay low (`laylow.ts`).
- **The grapevine:** fans tell her things (`knowledge.ts`): where the dragon went, which cop is bent, where the
  Inspiration team is staging, which green room has the good guitar.
- **The flash mob** (fame, a phone, a reason): she calls her fans to a place. A heist distraction, a human wall in
  front of an NPD response, a crowd swarming an Atlas showroom, a few hundred people standing between a Demeter and a
  street. (Scaled all the way up, it's the cordon teardown.)
- **The band:** bandmates are companions who also fight (a drummer is someone who hits things for a living). The band
  survives her deaths, since it's Neo's, not her body's, but it **churns constantly**: creative differences, a
  bassist poached by Muse, a drummer who leaves to open a noodle stall, a new keyboardist nobody remembers hiring. The
  band name changes after every big win.
- **Gangs that adopt her:** the Rust Choir after a won battle of the bands; the street kids who follow her from gig to
  gig and start acting as lookouts.
- **The riot** (fame, guitar 30+, an anthem, an Atlas or Muse building in sight): the right song at the right moment
  and a district boils over. Atlas presence drops for a while, heat rises everywhere, a few shops she liked get looted,
  and she is extremely proud of herself.

### 5. Obstacles removed

- **Dragons, out-played:** the `resonance` trait (or a very high music skill) finds a dragon's frequency. An Artemis
  can be shaken out of the sky; a Demeter's broadcast can be hijacked so it announces her gig instead of the winter
  tithe; a Hermes courier can be lured by a song it mistakes for its delivery chime.
- **Curfews and crackdowns:** a street festival with her name on it makes a curfew unenforceable for a night.
- **The noise ordinance** (Sloth's): a famous enough Blackbird generates so many complaints the NPD's forms system jams,
  and nobody can file anything (including arrests) for a while.
- **Gear for free:** sponsorships. A guitar company sends her a guitar; an amp company, an amp; a stim company, something
  she shouldn't take before a show. (Independent sponsors only. Muse sponsors come with a contract.)

### 6. Money

Tips, then gig fees, then a residency (steady money from one venue, which then cares whether she shows up), merch
(including a counterfeit market she didn't authorise and secretly loves), a record deal (an advance and a clause she
didn't read), and **royalties, which keep paying after she dies** into `legacy.account`. A long-dead rock star funds
the lab. Lopsided, and fine. Unlicensed records are contraband, so they also sell to fences (see below).

### 7. Muse: sign, dodge, or burn it down

Muse is an obstacle, but like everything in this plan it's also a set of doors.

- **Sign with Muse.** A real option (Muse isn't Atlas). The upside is enormous: money, airtime on every channel (fame
  in every district at once), legal gigs, Muse gear, no more strike teams, and invitations to Muse events where Atlas
  executives mingle. The catch: Muse owns her songs, writes her setlists, books a LUMINA duet, and an unapproved song
  is a breach of contract (which reverts her to "too big to ignore", with lawyers). **The contract survives her death**:
  a rebuilt Blackbird is still signed, still owes LUMINA a duet, and now has to play it with fresh hands. She can play it straight and enjoy
  it, or sign as a long con and **detonate it live**: the night of the broadcast, she plays her own song to the whole
  city.
- **The underground.** Because her music is illegal, a scene grows around it: secret gigs behind a laundromat
  (speakeasy rules, a password, a lookout), **contraband records** that fences buy and fans smuggle, and **pirate radio
  towers** to take and hold (the music equivalent of a dungeon: guarded, worth a lot, and Muse wants it back). Each
  tower she holds spreads her songs in its district and lets her reach fans there at once.
- **Inspiration teams as loot.** They're combat encounters with good gear: military weapons with heart decals,
  pastel armour, glitter grenades (they are grenades). A Blackbird who keeps beating them is well armed and very
  sparkly.
- **Hijack Muse Broadcast.** A Muse transmitter, Override or a `jacked` guitar, and one song: every screen in Neo plays
  her for three and a half minutes. Huge fame, a furious Muse, and a city that now knows the words (useful for the
  teardown, the riot and the board).
- **The wedge.** Muse and Atlas need and distrust each other. She can leak Gluttony's takeover file to Muse, or hand
  Muse's books to Gluttony, and watch two megacorps eat into each other.
- **LUMINA.** Out-sell her (a chart war run on fan numbers), out-play her live (a duel on Muse's own stage), or take
  her apart (she's a machine: no moral weight, very marketable wreckage). Or, at the silliest end, convince her to go
  independent.

### 8. A shot at the board

Per `board.md`, no board member has a required path, and they can be met in any order. Music is one of the roads to
**getting in the room**, and sometimes one of the ways to **win**. Each sin has a weakness music can reach.

| Member | How music gets her in the room | How music might beat them |
|---|---|---|
| **Pride** (Public Image) | Atlas sponsors Muse's flagship talent show, and Pride is the celebrity judge. Win it (or LUMINA's duet slot) and Pride hands over the trophy, in person, on stage, on live TV | humiliation: a song about Pride goes viral, and Pride's billboard face can't stop displaying it. A brand that can't stop playing a diss track of itself is finished |
| **Sloth** (Police Liaison) | the noise ordinance appeal is heard in person, eventually | the complaint storm: so many forms that Sloth has to personally get up |
| **Greed** (Premiums) | Greed wants to insure her hands. The policy interview is in Greed's office | a benefit concert that pays every fan's Atlas deductible, live: the premiums business collapses in one night |
| **Lust** (Government Relations) | the entertainment at a councillors' gala Lust is working | a love song so good the councillor defects mid-courtship, and Lust is, for once, not wanted |
| **Envy** (Surveillance) | Envy is a secret superfan with a full file on her, and invites her to a private session | a fan base so big every surveillance feed in the city shows only her; Envy's whole department becomes a fan account |
| **Gluttony** (M&A) | Gluttony is trying to swallow Muse. She's the leverage either side wants: dinner at Gluttony's table, with her as the after-dinner act | she makes the deal go through and the meal disagrees with Gluttony; or kills it in public and leaves Gluttony hungry, which for Gluttony is fatal to the brand |
| **Wrath** (the dragon program) | the dragons' broadcasts are licensed from Muse, and a signed (or famous enough) Blackbird is asked to record the next one, at the dragon program's own studio | a song that de-syncs a dragon squadron, live; the dragons start playing her instead |
| **The CEO** | the act at a Muse–Atlas gala the CEO attends; or a hijacked broadcast on every screen in the city, which is the one thing the CEO always watches | the whole city singing against Atlas, live: the crowd the CEO once wanted to lead as a cyberknight. Maybe she remembers who she was. Maybe it just gets Blackbird close enough to swing. Both count |

None of these is the way. All are hooks that the freeform rules already allow.

### 9. Myth tier (fame and skill both very high)

Deliberately absurd, uncapped, each one a story the player will tell:

- A rooftop solo in an acid storm so loud the lightning picks the right building.
- Out-playing a Hera Mk. V's broadcast so hard it lands to listen.
- A stadium encore that turns into a march on Atlas HQ, with her at the front, still playing.
- A song so big Muse's clearance system approves it by accident, and every Atlas dragon in the city plays it.
- A citywide tribute night in which every bar in Neo plays her songs at once, Muse's channels included, and the NPD
  quietly takes the night off.

---

## What it takes (the machinery, briefly)

The opportunities need a little machinery underneath. Kept short on purpose; each is a means, not the point.

- **Skill to 100,** with titles up the ladder and training from crowds by relative grade (like fight XP).
- **Instruments** rolled like weapons (class, tier, traits). Traits that open doors: `volume` (draws crowds and guards),
  `jacked` (plugs into PA towers, billboards, a dragon's speaker; with Override), `resonance` (vs robots, vs dragons),
  `hardened` (survives being swung), and the guitar case that holds more than a guitar.
- **Songs** written from what happened this run (the log already knows): diss tracks, love songs, anthems. Songs and
  recordings live in `legacy`.
- **Crowds** with a grade from `gen.danger` and a type (punks, ravers, corpos, Rust Choir, cops at a noise complaint),
  and **expectation** from fame. A set compares how she plays to both.
- **Fans** by district, with named superfans, in `legacy`. Disappointment drains them sharply.
- **Bookings:** an invitation is a small object (where, when, what they expect) that makes an opportunity appear,
  and that survives death. Missing one costs fans and the venue's goodwill.
- **Muse's attention:** a number in `legacy` read from fame (and refusals, and broadcasts hijacked), which decides
  what Muse sends. Inspiration teams spawn like garrisons; a new faction in `factions.ts`, at odds with independent
  venues and the underground.

## Suggested build order

1. **Fame, fans and bookings in `legacy`**, plus expectation and sharp disappointment. Small change, big effect on
   every fame act that already exists.
2. **The entertainment:** bookings at places she couldn't otherwise enter, and the guitar case.
3. **Muse, the first rungs:** Clearance letters and officers, the A&R scout, the "sign" choice.
4. **Instruments** with door-opening traits.
5. **Fans as a resource:** cover, couches, grapevine, then flash mobs.
6. **The cordon teardown.**
7. **Inspiration teams,** then the underground (secret gigs, contraband records, pirate towers).
8. **Songs:** diss tracks and love songs as leverage.
9. **Dragons out-played** (resonance, the Demeter hijack).
10. **LUMINA, the broadcast hijack, the wedge, and board hooks,** one at a time.
11. **Myth tier,** whenever one sounds fun.

## Open questions for the author

- Muse Clearance, Muse Broadcast, Muse A&R and the Muse–Atlas partnership: keep, rename, or veto?
