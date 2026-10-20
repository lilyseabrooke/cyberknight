# Location spec: Luthier (and provenance)

**Status:** IMPLEMENTED (see "What was built"). Numbers are starting points, not tuned (CLAUDE.md, "feel over balance").

## 0. Decided

- **Concept** (from the guitar-track location proposals, approved): where guitars are made, mended, armoured, wired and found
  again. It brings two cross-cutting mechanics: **provenance** (an instrument remembers what it has done) and **her guitars from
  past lives resurfacing** in the city. The **repair ticket** is a stash that works across lives.
- **Shape:** a **lot** on the shared music-venue machinery.

## 1. How the three principles shape it

| Principle | In practice |
|---|---|
| Maximalism | 9 variants × 12 shells × sizes, conditions, tiers × 0-3 of 31 traits × 14 situations × 8 wild cards; 31 features; 9 bench jobs |
| Unbalanced | a storied guitar adds up to three levels to every guitar check in the game; buying back a legend's guitar with eleven lines of story is lopsided and wonderful; the luthier who made a previous Blackbird's guitar gives back twelve skill steps in an afternoon |
| Multidimensional | 48 rows over 30+ skills, plus the bench, which is money, tinkering and time |

## 2. Provenance (`provenance.ts`)

- **Deeds.** Every great night goes on the guitar she played it with (the one in her hands, or her best): out-played a dragon,
  called down the lightning, started a riot, led a march, tore down the cordon, went out on a district's screens, stole a crowd from
  Muse, took Muse's stage, a comeback, won a bout at a cutting room, a private function, a duet with LUMINA, a secret show, number
  one, blew up a Muse contract, ALL CHANNELS. The tap (`provenanceTap`) sits beside the song-moment tap in `run.ts`, so any event
  can be a deed by adding a line to `DEEDS`.
- **What a story does.** A level for every three lines (up to three), through `instrumentBonus`, so it reaches every guitar check;
  at five lines and again at ten, +1 signature (crowds forgive her more), and the name gains "storied". Twelve lines at most.
- **Lost guitars.** At the end of every night (`endRun`), whatever instruments she carried go into `legacy.lostGuitars` (24 at
  most), stories and all, marked as hers and from which night. They come back: in a luthier's window, as the guitar that came in a
  carrier bag, out of the guitar graveyard, and out of Muse's evidence room (`confiscated` now prefers a real one of hers).

## 3. The luthier (`content/luthiers.ts`, `luthier.ts`)

- **Variants (9):** a master luthier, a Rust Choir welder, a Titanware instrument bay, a Muse-certified tech, a tonewood dealer, a
  recluse who builds one perfect guitar a year, a repair shop, an amp and pickup shop, a secondhand dealer.
- **The bench** (`luthbench:<job>`): leave a guitar for a setup (+1 tone), pickups (+1 volume), armouring (+1 hardened), a city jack
  (+1 jacked), a tuned body (+1 resonance), a sustainer (+1 feedback), a restoration of one of her own old ones (+1 tier, signature,
  tone), safekeeping, or commission a new one (tier from the luthier and her guitar skill). One day to three; the "slow hands" trait
  doubles it, "same day" quarters it. The guitar goes into `legacy.tickets`: **not on her, so it waits through a death**, and any later
  Blackbird can collect it (`collect:<id>`) once it's ready. `luthierUrge` pulls her back to a ready ticket.
- **Buy back** (`buyback:<id>`): one of her old guitars in the window tonight (the same one all night; likelier at a secondhand
  dealer, with the lost-and-found trait, or when one "came in this morning"), at 1.5 × value + 40 per line of story.
- **Graft** (`graft:<donor>:<trait>`): the best trait of a spare guitar into the one she plays; the donor is spent either way.
- **The masterpiece** (the recluse): bought for a fortune, or earned by playing it right (one try).

## 4. Rows (`content/luthierafford.ts`, `content/luthierevents.ts`)

48 rows: trying the wall, reading the tags (a tip), the test amp through the window, tuning a twelve-string by ear for a bet, her own
photo on the wall of famous clients, the locked vintage case; helping at the bench, sanding a neck, carving a pick, the parts drawers
(components), strings (a buff), **forging a provenance** (a fake line of story, aged with tea); tea and stories, the workshop cat,
teaching the apprentice, matching a customer to a guitar, flirting across the bench, haggling one off the wall; the back room, swapped
price tags, a brick through the window, the case that is not for a guitar; a touring band's emergency, unloading wood, an estate
auction, hiding her guitar from Clearance (or losing it to them, into the lost list), hand tools in a power cut, the sale rack,
minding the shop, building a cigar-box guitar at an open workshop, tracking a burglar, the Choir's rush order, a signing queue, the
string shortage, one of hers in a carrier bag; the luthier who made hers, the singing board, the guitar graveyard, her guitar's twin,
the robot luthier, LUMINA's stage guitar (a love note in the case), the first guitar in Neo; welding a plate on, the Titanware rig,
spoofing the Muse scanner, picking the wood by ear, a nap in the drying room, the haunted amp.

## What was built

As above. Types: `InstrumentFx.story/hers/life`, `Legacy.lostGuitars`, `Legacy.tickets` (`Ticket`). Hooks: `run.ts` (the tap),
`universe.ts` (`loseGuitars` in `endRun`), `instruments.ts` (`instrumentBonus` reads the story), `musehqkit.ts` (the evidence room).
Tests: `luthier.test.ts` (and the shared venue suite).

Open: pawn shops' instrument exchanges and fan clubs' shrine walls could stock lost guitars too (the fan club does, see
`fanclub.md`); a guitar's story could be read aloud by a crowd that recognises it.
