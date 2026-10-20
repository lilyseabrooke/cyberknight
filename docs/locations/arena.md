# Location spec: Arena

**Status:** IMPLEMENTED (see "What was built"). Numbers are starting points, not tuned (CLAUDE.md, "feel over balance").

## 0. Decided

- **Concept** (from the guitar-track location proposals, approved): the biggest rooms in Neo, and a show day run like an operation in
  clock time. Every hour of the day is a phase that opens different doors; getting in early pays off later.
- **Shape:** a **lot** on the shared music-venue machinery; rare (about one street in eighty in the busy districts).

## 1. How the three principles shape it

| Principle | In practice |
|---|---|
| Maximalism | 8 variants (stadium, dome, amphitheatre, velodrome, airship hangar, the Muse Arena, the Atlas Safety Dome, a quarry stage) × 12 shells × sizes (never small) × 0-3 of 25 traits × 12 bills × 7 phases × 8 wild cards; 23 features |
| Unbalanced | stealing an encore is +8 fame base and 30 fans; walking into a crowd holding a vigil for her is +10; hiring the whole arena and headlining it can pay thousands, or be four hundred people in a room for forty thousand |
| Multidimensional | 49 rows over 25+ skills, from carrying flight cases to the medical bay, the noodle wok, the lighting desk and a monster truck |

## 2. A show day (`content/arenas.ts`)

- **The bill** (today's situation, a new one each day): LUMINA live, a Muse act, an Atlas safety rally, a laser-league final, monster
  trucks, a prize fight, an indie festival, a dark night, the live talent final (with Pride from the Atlas board handing out the
  trophy), a Muse–Atlas gala, a charity concert, a memorabilia auction.
- **The phase** (`arenaPhase`, added to the situation's tags; a pure function of the clock): load-in 14:00-17:00, soundcheck to
  19:00, doors to 20:30, the show to 23:00, the encore to midnight, load-out to 02:30, and the dead hours between. The shared venue
  code supports this through `VenueTables.phase` / `phaseTags`, and per-kind size weights (`sizes`).
- **Getting in** (`counters['arena_in:<id>']`, for the night): carrying cases with the crew at load-in, a crew laminate, backing the
  truck in, helping the sound engineer, a steward at the side gate, a tout's real ticket, tea in the security office, or the crew
  recognising her old poster. Inside opens the rider, the lighting desk, the dressing rooms, the encore stage, the jumbotron feed and
  the pyro board.

## 3. What happens when

- **Load-in:** carry cases, a crew pass, back in the truck, the rider. **Soundcheck:** play it to forty thousand empty seats (a lot of
  guitar XP), walk the bowl (a buff), fix the hum, climb the rigging. **Doors:** busk the queue, the side-gate steward, a tout, sell
  bootlegs down the queue. **The show:** crowd-surf, run the lights for a song, the medical bay, the noodle wok, dressing-room gossip.
  **Encore:** walk on for the encore herself, her guitar on the jumbotron feed out to the block, count in the pyro finale. **Load-out:**
  a shift, the after-party, lost property. **Dark nights and dead hours:** the empty stage by the work light, **hire the arena** (its
  `keep.hire` price) and **headline it** (fame and fans by the thousand if her fans come).
- **Bills:** a chart war from the car park on a LUMINA night, starting the wrong song at an Atlas rally (the CEO's face talking over
  forty thousand people singing), betting the final, a monster truck, the undercard of a prize fight, the festival fringe, winning
  the talent final and refusing Pride's trophy on live TV, bidding on her own old guitar at auction.
- **Wild cards:** her poster from a show a previous Blackbird headlined, a cursed stage, a Hera on the roof (play it off), a double
  booking, a crowd holding a vigil for her, the CEO of Atlas in a box, the open stage after the headliner, LUMINA alone on the stage.
- **Elsewhere:** arenas she has visited can book her like a club (`bookings.ts`), at arena prestige (2.2); an open roof counts as
  "somewhere high" for the storm solo (`myth.ts`).

## What was built

As above. Code: `content/arenas.ts`, `content/arenaafford.ts`, `content/arenaevents.ts`, `arena.ts`; the phase and size hooks in
`content/venues.ts`; arenas in `bookings.ts`'s stages and `myth.ts`'s `high`. Tests: `arena.test.ts` (and the shared suite, judging the
menu on a concert night at show time).

Open: the march leaving from an arena's encore; the board members in the corporate boxes as people she can meet.
