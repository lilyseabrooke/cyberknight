# Spec: the band, the lockup, and what carries

**Status:** IMPLEMENTED (see "What was built"). Numbers are starting points, not tuned (CLAUDE.md, "feel over balance").

## 0. Decided

- **Concept** (from the guitar-track location proposals, approved): the cross-cutting pieces that tie the music venues together. A
  band she builds out of the musicians she meets; a rehearsal lockup to keep them in; a loud set that reaches past the walls; a
  stage that wants her every night; a sponsor who isn't Muse.
- **Shape:** not a venue. A companion kind, a home kind, a station job and a nightly tick, all in `band.ts`.

## 1. The band

- **Joining** (`join_band:<npc>`): any non-hostile person tagged `musician` (session players, cutting-room challengers and champions,
  tribute guitarists, clients at a studio; never the stranger, a robot, an owner or Muse) can be asked, once a night each. Her
  guitar, charm and rapport and how well known she is, against their level and how they feel about her. They join as a `musician`
  companion (abilities `play`, `charm`; learns `distract` at 10 and `scout` at 25), at a level that reflects who they were: a session
  legend joins good. At most three bandmates, inside the usual three companions.
- **What they're worth** (`companions.ts` `bandBonus`, added in `skillValue`): each bandmate with her adds 1 + level/25 to guitar,
  singing, DJing and beatboxing, four at most. In a fight they swing a bass (assist 6).
- **The name** (`legacy.bandName`): named the night the first one joins; a 15% chance of a new name after a private booking, a duet
  or an arena-sized night with two or more of them.
- **Breaking up** (`bandTick`, once a night): 8% each (half if loyal, double if not), always with a reason: creative differences,
  a Muse act with dental, a noodle stall of their own, the van.

## 2. The lockup

- A third home kind (`content/realty.ts`): a **rehearsal lockup** under the railway arches. Cheap (400-1400 before the district), a
  poor bed (0.6-0.74), four berths. Commonest in the industrial district and the slums, almost never in the corporate one.
- **The `rehearse` job** (`content/stations.ts`): a bandmate posted at any home rehearses for 3.5nd an hour and extra experience.
- **Jamming there** (`band_jam:<home>`, every three hours): everyone with her and everyone posted there plays. Guitar XP of
  2 + 1.5 per player, experience and loyalty for each of them.

## 3. Sound that carries

`stage.ts` `fameFrom` calls `band.ts` `carry` after every music act: the streets on her block (not her own) gain fans worth
12% of the fame per point of the instrument's volume, plus 15% on an arena-sized stage. Between 23:00 and 06:00, outside the nightlife
district, a loud instrument (volume 1+) has a 6% per point chance of a noise complaint on that street, once a night: half a point of NPD
heat.

## 4. Residencies

Three good bookings at the same stage (not secret shows or duets) and it offers her a **residency**: a slot every night for seven
nights at 1.2x the last fee (`legacy.residency`). `tickBookings` books it each night (`residencyNight`), so the usual booking goal, fee
and missed-night costs apply. One flop and it is over.

## 5. Sponsors

Once she is known for something (`expectation` 30+) and not signed to Muse, a 25% chance a night that an independent brand (an amp
maker, a pedal company, an energy drink, an indie label) sponsors her: a tier 3+ instrument with their name on it, and 30 + 2x her
name in neodollars every night. Every flop at a booking counts against it and every hit takes one off; three and they drop her. So
does signing with Muse.

## Imbalances (left in on purpose)

- Three good bandmates add four levels to every music skill, on top of a storied guitar: a mid-game Blackbird with a band plays like a
  late-game one.
- A sponsor's stipend is paid whatever she does that night, and the gear alone is often the best guitar she has had.
- Sound that carries feeds fan clubs (45 fans round a block): a loud guitar in a busy district opens them quickly.

## What was built

Code: `band.ts` (joining, the lockup jam, `bandTick`, `carry`, residencies, sponsors, candidates), `companions.ts` (`musician`,
`bandBonus`), `skills.ts` (the bonus in `skillValue`), `content/realty.ts` (`lockup`), `content/stations.ts` (`rehearse`), hooks in
`stage.ts`, `bookings.ts`, `run.ts` and `interactions.ts`, and text (`band` and its intents) in `text.ts`. Tests: `band.test.ts`.

Open: bandmates on stage at a booking (an act of their own, not just a bonus); a band van; a tour (a string of residencies across
districts); the tribute band and her real band meeting.
