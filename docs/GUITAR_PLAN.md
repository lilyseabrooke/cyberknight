# Guitar: what it opens up

Status: **plan, nothing built.** Feel over balance: every number here is a first guess, to be felt out (or never tuned
at all). Names marked PROPOSED are drafts for the author to veto, as in `docs/setting/`.

## The idea

Combat is valuable because of what it opens: a fight gets her into a hideout, a bounty pays, a dead CINDERJAW opens the
cordon. Guitar should work the same way. **Being good at guitar opens doors**, and the doors lead to the same places
combat and stealth do (money, access, allies, a gap in the cordon, a shot at a board member), by a different road.

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
| bookings, residencies, deals, sponsorships, a record contract | the band's patience, if she flakes on them (see below) |
| reputations: who loves her music, who she dissed, who's suing | |
| royalties (paid into `legacy.account`) | |

This is the most interesting thing in the plan, because it makes **expectation** a mechanic:

- **Fame opens doors; skill decides whether she walks through them.** Fame is the long ladder (it grows across many
  lives). Skill is the short one (it rebuilds each life). The biggest opportunities need both, so a famous Blackbird with
  fresh hands is constantly invited to things she can't yet pull off.
- **Disappointment.** Every set is judged against what the crowd expects, which is set by her fame. A legend who plays
  like a beginner loses fans and gets reviews ("Blackbird has lost it, again"); a legend who plays like a legend gets
  the full payout. Early in a life she mostly disappoints people. That's the joke, and Blackbird doesn't see it ("They're
  stunned. You can tell they're stunned.").
- **Ways around it,** each a little opportunity of its own:
  - *Unplugged:* an "intimate acoustic set" lowers expectations. Fans call it brave.
  - *The backing track:* DJing or tinkering fakes the hard parts. Getting caught is a scandal (and a fame event).
  - *The ghost guitarist:* a hired player behind the curtain. They want credit eventually.
  - *The experimental phase:* after a few flops in a row the city reframes them. Her new direction is "challenging".
    A reviewer calls it genius. She agrees.
  - *The comeback:* once her skill catches up with her fame, the first real set after a slump pays a comeback bonus:
    fans who left return, and the press can't stop writing about it.
- **Fame decays a little** when she disappoints, so it isn't a pure ratchet, but the songs never go away.

This applies to fame in general, not just guitar (singing, DJing, graffiti, parkour all feed `fame`). Engine-wise,
fame and fans move from `hero` to `legacy`, plus a per-run "expectation" read from them.

---

## The opportunity catalogue

Each entry: what opens it (**skill**, **fame**, a place, an item, a moment), and what it gets her. Grades follow
`docs/PROGRESSION.md`; "guitar 25" means the grade, and checks in high-danger districts subtract the place's grade as
usual. Everything is soft: a lower-skilled Blackbird can try anything, and usually something funny happens.

### 1. Getting in (access)

The music version of picking a lock.

- **The entertainment** (guitar 8+ or fame): she's booked to play somewhere she couldn't get into: a corp penthouse
  party, a gang leader's birthday, a precinct retirement do, a dungeon's officers' mess, eventually an Atlas gala. She
  walks in the front door with a guitar case. What's in the case is her business (rule of cool: **the guitar case full of
  guns** is an item, and a classic). Once inside, the place is a heist, a hit or a theft site with her already past the
  door.
- **Draw them out** (guitar 5+, an instrument with volume): a set in the street outside a hideout pulls some of the
  garrison out to watch, or to complain. Fewer guards inside; some of the ones outside become fans.
- **Backstage** (fame): every venue's green room connects to a loading dock, an office and a safe. Famous people are
  waved through.
- **Gang doors:** the Rust Choir lets in anyone who wins a call-and-response at the gate; Neon Marrow raves let in
  whoever keeps the floor moving; Saint Sixers let in a good hymn. A win means a hideout she can enter without fighting
  (and a gang that might hire her).
- **The cordon, the polite way** (fame, before CINDERJAW is dead): the Atlas cordon guards are bored, and one of them has
  her song as a ringtone. A famous Blackbird can talk or sign her way through a checkpoint for a night ("a tour date").
  It doesn't open the gate for good; it's a peek past it.
- **The cordon, the loud way** (guitar 40ish, a `jacked` or very loud instrument, the Overpass): **she plays the
  cordon down.** CINDERJAW's control signal holds the lockdown, and a sustained set into the Overpass PA drowns it out.
  The cordon drops as if CINDERJAW were dead (`legacy.gate = 'open'`), and CINDERJAW is still up there, furious and
  out of a job. Fighting it afterwards is optional.

### 2. Leverage (bending people)

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
  lab tech, a dragon technician, an Atlas middle manager). A superfan can be asked one favour: a door left open, a file
  leaked, a patrol re-routed. Signing something for them helps.
- **The song as blackmail:** "It'd be a shame if this one charted." A threatened song works like a threat, aimed at
  someone's career instead of their kneecaps.

### 3. Allies and crowds

- **Fans as cover:** in a district where she has fans, a crowd hides her (pursuers lose her in a sea of people
  chanting her name). A big enough fan base makes her *harder* to hide everywhere else: she can't buy noodles without
  a selfie line.
- **A couch in every district:** fans offer somewhere to lay low (`laylow.ts`).
- **The grapevine:** fans tell her things (`knowledge.ts`): where the dragon went, which cop is bent, which green room
  has the good guitar.
- **The flash mob** (fame, a phone, a reason): she calls her fans to a place. A heist distraction, a human wall in
  front of an NPD response, a crowd swarming an Atlas showroom, a few hundred people standing between a Demeter and a
  street.
- **The band:** bandmates are companions who also fight (a drummer is someone who hits things for a living).
- **Gangs that adopt her:** the Rust Choir after a won battle of the bands; the street kids who follow her from gig to
  gig and start acting as lookouts.
- **The riot** (fame, guitar 30+, an anthem, an Atlas building in sight): the right song at the right moment and a
  district boils over. Atlas presence drops for a while, heat rises everywhere, a few shops she liked get looted, and
  she is extremely proud of herself.

### 4. Obstacles removed

- **Dragons, out-played:** the `resonance` trait (or a very high music skill) finds a dragon's frequency. An Artemis
  can be shaken out of the sky; a Demeter's broadcast can be hijacked so it announces her gig instead of the winter
  tithe; a Hermes courier can be lured by a song it mistakes for its delivery chime.
- **Apollo "CHORUS"** (PROPOSED: Apollo is the god of music, and Atlas would lean into that): a public-address dragon that
  plays Atlas Harmony over a district at 140 dB. It can be shot down. Or out-played, in a duel the whole district hears.
- **Curfews and crackdowns:** a street festival with her name on it makes a curfew unenforceable for a night.
- **The noise ordinance** (Sloth's): a famous enough Blackbird generates so many complaints the NPD's forms system jams,
  and nobody can file anything (including arrests) for a while.
- **Gear for free:** sponsorships. A guitar company sends her a guitar; an amp company, an amp; a stim company, something
  she shouldn't take before a show.

### 5. Money

Tips, then gig fees, then a residency (steady money from one venue, which then cares whether she shows up), merch
(including a counterfeit market she didn't authorise and secretly loves), a record deal (an advance and a clause she
didn't read), and **royalties, which keep paying after she dies** into `legacy.account`. A long-dead rock star funds
the lab. Lopsided, and fine.

### 6. A shot at the board

Per `board.md`, no board member has a required path, and they can be met in any order. Music is one of the roads to
**getting in the room**, and sometimes one of the ways to **win**. Each sin has a weakness music can reach.

| Member | How music gets her in the room | How music might beat them |
|---|---|---|
| **Pride** (Public Image) | Atlas's synthetic idol ANGEL//SAFE (PROPOSED) headlines the Atlas Safety Showcase; outsell or out-play her and Pride presents the award, in person, on stage, on live TV | humiliation: a song about Pride goes viral, and Pride's billboard face can't stop displaying it. A brand that can't stop playing a diss track of itself is finished |
| **Sloth** (Police Liaison) | the noise ordinance appeal is heard in person, eventually | the complaint storm: so many forms that Sloth has to personally get up |
| **Greed** (Premiums) | Greed wants to insure her hands. The policy interview is in Greed's office | a benefit concert that pays every fan's Atlas deductible, live: the premiums business collapses in one night |
| **Lust** (Government Relations) | the entertainment at a councillors' gala Lust is working | a love song so good the councillor defects mid-courtship, and Lust is, for once, not wanted |
| **Envy** (Surveillance) | Envy is a secret superfan with a full file on her, and invites her to a private session | a fan base so big every surveillance feed in the city shows only her; Envy's whole department becomes a fan account |
| **Gluttony** (M&A) | Gluttony tries to acquire her label: a meeting over dinner, with her as the after-dinner act | she poisons the deal (figuratively); or an acquisition so indigestible (a punk label) it gives the company heartburn |
| **Wrath** (the dragon program) | CHORUS's handlers want her to record the next Atlas Harmony | a song that de-syncs a dragon squadron, live; the dragons start playing her instead |
| **The CEO** | the CEO was a cyberknight once, and (PROPOSED) was in a band. Blackbird has the bootleg | playing her old anthem at her. Maybe she remembers who she was. Maybe it just gets Blackbird close enough to swing. Both count |

None of these is the way. All are hooks that the freeform rules already allow.

### 7. Myth tier (fame and skill both very high)

Deliberately absurd, uncapped, each one a story the player will tell:

- A rooftop solo in an acid storm so loud the lightning picks the right building.
- Out-playing a Hera Mk. V's broadcast so hard it lands to listen.
- A stadium encore that turns into a march on Atlas HQ, with her at the front, still playing.
- A song that charts so high Atlas's SafeSound service approves it by accident, and every dragon in the city plays it.
- A citywide tribute night in which every bar in Neo plays her songs at once, and the NPD quietly takes the night off.

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
- **Fans** by district, with named superfans, in `legacy`.
- **Bookings:** an invitation is a small object (where, when, what they expect) that makes an opportunity appear,
  and that survives death. Missing one costs fans and the venue's goodwill.

## Suggested build order

1. **Fame and fans in `legacy`**, plus expectation and disappointment. Small change, big effect on every fame act
   that already exists.
2. **The entertainment:** bookings at places she couldn't otherwise enter, and the guitar case. The clearest example of
   guitar opening a door.
3. **Instruments** with door-opening traits.
4. **Playing the cordon down.**
5. **Fans as a resource:** cover, couches, grapevine, then flash mobs.
6. **Songs:** diss tracks and love songs as leverage.
7. **Dragons out-played** (resonance, the Demeter hijack, CHORUS).
8. **Board hooks,** one member at a time, as each board member is built.
9. **Myth tier,** whenever one sounds fun.

## Open questions for the author

- How fast should disappointment cost fans? Gently (it's mostly comedy) or sharply (a reason to rebuild skill)?
- Should old bookings wait for her after a death ("she's back, the residency's back"), or lapse after a while?
- ANGEL//SAFE, CHORUS, and the CEO having been in a band: keep, rename, or veto?
- Does the band (bandmates as companions) survive her death too? They'd notice she's worse.
