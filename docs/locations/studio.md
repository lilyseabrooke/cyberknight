# Location spec: Recording Studio

**Status:** IMPLEMENTED (see "What was built"). Numbers are starting points, not tuned (CLAUDE.md, "feel over balance").

## 0. Decided

- **Concept** (from the guitar-track location proposals, approved by the author as "they all look great"): the place where a take
  outlives the hands that played it. Recordings live on the legacy; royalties pay after she dies; the backing track and the ghost
  guitarist from `GUITAR_PLAN.md` ("ways around it") become real; a dragon-broadcast studio is the Wrath board hook.
- **Shape:** a **lot**, one floor with features (like the hub), built on the shared music-venue machinery (`content/venues.ts`,
  `venuekit.ts`) that the other five music venues use too.

## 1. How the three principles shape it

| Principle | In practice |
|---|---|
| Maximalism | 9 variants × 12 shells × 5 sizes × 5 conditions × 5 tiers × 0-3 of 32 traits × 16 situations × 8 wild cards; 30 features |
| Unbalanced | royalties from a famous past life can fund the lab on their own; a haunted console adds 6 grades to every take; the golden mic adds 8 to singing; relistening to an old master is a lot of skill XP |
| Multidimensional | 65 rows over 31 skills, the four stats and all seven drives; thin spots: pool, throwing, shooting, tracking, hijacking, cards, fishing |

## 2. Concept

Neo's music is Muse's, so a studio is a room where somebody is breaking the law with good acoustics, or a Muse room where they are
not. It is where Blackbird gets something no other place gives her: **a version of herself that does not reset.** Her hands start
again with every body; the tape doesn't. A legend with fresh hands can put on a cassette of the legend. Atlas is wallpaper (a
safety sticker on the control-room glass), except in the hold-music studio, where Atlas is the client and the dragons' broadcasts
are made.

## 3. Placement

`GenRole`/`Location.kind` `'studio'`, `Location.venue` (`VenueInfo`, shared by all music venues). Own streams
`studiochance:<worldSeed>:<street>` and `studio:<worldSeed>:<id>`, in its own slot after the hacker hub's (the venue kinds are
rolled in `VENUE_ORDER`, appended only), so no existing map changes. Chance: nightlife 0.07, industrial 0.05, market/tenement/
corporate 0.04, slum 0.03. Venue faction `v:<id>`; killing the producer shuts it. Hours 11:00-05:00 (the hold-music studio keeps
office hours).

## 4. The axes (`content/studios.ts`)

- **Variants (9):** independent studio, basement four-track, Muse-licensed studio (records go legal; Muse keeps four fifths),
  pressing plant (cheap, big runs), jingle factory, Atlas hold-music studio (the dragon broadcast), a church with good acoustics,
  a pirate studio in a van, a robot auto-studio.
- **Shells (12):** converted church, old cinema, shipping container, flooded basement, laundromat back room, tram depot, rooftop
  greenhouse, bank vault, over a karaoke den, car-park level, warehouse, former Atlas call centre.
- **Traits (32):** legendary console, producer's ego, analog only, red-light rule, Muse Verified, gang-owned, a famous producer,
  session players on call, a bootleg ring, a studio cat, a platinum wall with her old disc on it, a Muse informant, an old session
  legend on the couch, union tea breaks...
- **Situations (16, a pure function of the clock):** a band in session, LUMINA recording, a Clearance audit, a jingle rush, a power
  cut, a tape sale, the producer away, a label scout, open-mic night, a deadline, a record launch, a bootleg raid rumoured, a flood,
  a choir booked, dragon broadcast week, a remix contest.
- **Wild cards (8):** a haunted console (takes come out better, a stranger sings on the B-side), LUMINA 1.0's master tapes, a
  producer who only records the dead (free), one take only, **her own old masters**, a free studio that owns everything, the golden
  microphone, every take is the same take.
- **Keep:** the house session player's grade and the hourly rate, rolled once.

## 5. The system (`studio.ts`)

| Action | What it does |
|---|---|
| **record** (`record:<skill>`) | Two hours at the house rate. A take of guitar, singing, DJing or beatboxing at her level + instrument tone + 1.5 × tier + the engineer, the console, the room, the wild card. Into `legacy.records` for good. Titled after an unrecorded song in her songbook when there is one |
| **ghost take** (`ghost_take:<skill>`) | The session player plays it as her, at their grade. Every day it has copies out, there is a chance (3% a day) the ghost goes public: fame and repute down |
| **dub** (`dub:<id>`) | A cassette of a master (`master_tape`, tagged `rec:<id>`). Gear resets with the body; the master doesn't, so a new body can always dub another |
| **press** (`press:<id>`) | 200 copies (500 at a pressing plant). Off the books it's contraband and a box of bootleg tapes comes back too |
| **relisten** (`relisten:<id>`) | Her own past-life master, of a grade above her hands: `4 + 0.6 × gap` skill XP, once per recording per night. "Her ears remember what her fingers don't" |
| **royalties** | Every day of world time (nights apart included, up to 30 at once): `copies/100 × (1 + grade/25) × fame factor` per record, into `legacy.account`. Muse keeps 80% of a Muse record |
| **mime** (`mime_<skill>:<id>`) | With a dub of a take at least 3 grades above her hands, at a bar, club, street, arena or fan club with a crowd of 3+, or at tonight's booking for that skill: the tape goes over the PA. `judgeSet` judges the tape's grade, not hers. Caught (`0.22 + crowd/50`, less with sleight, DJing and grifting): a scandal, fame and repute down, a quarter of the block's fans gone |
| **bury** (`bury_song`) | At an Atlas hold-music studio with a broadcast rack and a song in the book: her song under the lockdown chime for 3 nights (5 in broadcast week). Dragons are slower to notice her, as when her song charts. Fail: Atlas heat and a fight |

`studioUrge` pulls her toward a studio with a past-life master to learn back from, or when her hands are good and nothing is on tape
this night.

## 6. People (`content/musicpeople.ts`)

Producer (owner) or a robot producer, engineer, runner, session players, a session legend (trait), clients, studio security, Muse
Clearance officers at Muse rooms, Atlas troopers at the hold-music studio, a brand manager at the jingle factory.

## 7. Rows (`content/studioafford.ts`, `content/studioevents.ts`)

65 rows. A sample: jam in the live room, rescue a mix, splice a tape, sing a guide vocal, beatbox a drum track, retune the house rack,
fix the named amp, the echo chamber, a nap in the isolation booth; couch gossip, coffee, flirting with the producer, the runner,
autographs, the gold wall, crate digging, the notice board, the tip jar, the cat, the balcony; haggling, reading the contract,
pep-talking a band, leaning on the producer, selling bootlegs; the tape vault, the mic locker, a gold record off the wall, the back
door, looping the camera, pockets, a scrap; playing on a band's record, gatecrashing LUMINA's session, dodging an audit, a jingle
rush, a torchlight session, a tape sale, running the room, playing to a scout, open mic, a launch party, moving the bootleg box,
a flood, a choir solo, a remix contest, keeping a band alive till dawn; stealing LUMINA 1.0's masters, recording with the producer
of the dead, her own old masters, the B-side ghost, the golden mic, tearing up the free studio's contract; writing a jingle,
backmasking an Atlas jingle, reading the dragon broadcast schedule, an acoustic set in the church, driving the van, out-playing the
robot producer, a shift on the press, stealing the Clearance stamp, playing to the stream, the session legend's lesson, finding
the Muse informant.

## 8. Engine touchpoints

`types.ts` (`VenueKind`, `VenueInfo`, `Location.venue`, `Recording`, `Legacy.records/royaltyAt/buriedUntil`), `content/venues.ts`,
`content/venuetables.ts`, `venuekit.ts`, `venues.ts`, `content/studios.ts`, `content/studioafford.ts`, `content/studioevents.ts`,
`content/musicpeople.ts`, `studio.ts`; hooks in `mapgen.ts`, `roster.ts`, `content/archetypes.ts`, `content/items.ts`, `grid.ts`,
`hexmap.ts`, `layouts.ts`, `hours.ts`, `stage.ts` (prestige, `mime_*` in `ACT_SKILL`), `renown.ts` (`judgeSet` reads a mimed grade
and skips a scandal), `clock.ts`, `run.ts` (`royaltiesTick`, aggressive families), `shutdown.ts` (`venue`, `venue_dead`),
`dragons.ts` (a buried song), `interactions.ts`, `text.ts`. Tools: `npm run venues -- studio demo 8`, `npm run coverage`.

## 9. Hard rules

(1) Atlas is the client of one variant and the butt of the backmask; she never works for it. (2) Nothing grim: the ghost on the
B-side is a credit owed, not a horror. (3) Punch up: the jokes are Muse's contracts, the producer's ego, the jingle briefs.
(4) Invented brands only (Volt Riot, Hydra-Lux). (5) Session players and producers have their own goals and can say no.
(6) Adult, not explicit.

## What was built

As above. Differences from the pitch: the "Atlas hold-music studio" and "jingle factory" are variants of the studio rather than
places of their own; ghost exposure is a daily chance in the royalty tick rather than an NPC who comes looking (open).

Real runs (40 autonomous runs, three competence levels): a studio was in reach in 13, she walked into one in 2 and haggled and
chatted; nobody recorded in 40 runs (recording needs a performing skill of 3+ and the cash, and early nights rarely have both).
Watch: whether recording shows up in longer careers.

Open: a ghost who turns up in person for credit; a label deal (an advance, a clause) from the indie scout; records carrying fans to
districts she has never played (a pressing as a broadcast).
