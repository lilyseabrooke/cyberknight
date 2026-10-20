# Location spec: Fan Club

**Status:** IMPLEMENTED (see "What was built"). Numbers are starting points, not tuned (CLAUDE.md, "feel over balance").

## 0. Decided

- **Concept** (from the guitar-track location proposals, approved): the only place **her fame builds** rather than the map. When enough
  of her fans live round a block they open a club, and it stays: made from Neo's memory of her, it outlives every body. It gives a
  home to the plan's superfans (`GUITAR_PLAN.md` §3, "the superfan inside"), the tribute act, the counterfeit merch, the shrine of
  her deaths spun as close calls, and her past-life guitars.
- **Shape:** an **emergent lot** on the shared music-venue machinery: never rolled with a street (`chance` 0, not in `VENUE_ORDER`),
  put on a street on purpose (`addVenue`, in a slot of its own, `EMERGENT_SLOT` 900).

## 1. How the three principles shape it

| Principle | In practice |
|---|---|
| Maximalism | 9 variants (laundromat, a room over a bar, a stairwell shrine, a garage, the back of a noodle bar, a rooftop, a record shop's back room, a community hall, a member's flat) × 12 shells × sizes, conditions, tiers × 0-3 of 25 traits × 12 situations (nightly) × 8 wild cards; 25 features |
| Unbalanced | a superfan's favour wipes a whole heat, or smuggles one of her real guitars out of Clearance; the tribute guitarist can play her bookings for her; a time capsule hands her a past life's recording |
| Multidimensional | 42 rows over 25+ skills, plus the favours, the tribute and the shrine |

## 2. How a club opens (`fanclub.ts`)

Once a night (`fanclubTick`, in the upkeep), every street with at least **45 fans** round its block (`localFans`) and no club on its block
or the next opens one (ten in the city at most). It is told as an event ("Her fans round Strand Street have opened a fan club..."). If
the city is keeping any of her old guitars, the club starts with one on its shrine wall.

## 3. What a club does

| Action | What it does |
|---|---|
| **favour** (`favour:<npc>`) | each superfan has a job (`SUPERFAN_JOBS`, the same every time she looks) and does one favour a night: a desk sergeant loses her file (police heat 0), a Helix tech brings a med kit, a dragon technician tunes the nearest dragon's ears to her song (the buried-song effect for the night), an Atlas middle manager shreds her paperwork (Atlas heat 0), a Clearance officer smuggles one of her confiscated guitars home in a coat, a Muse receptionist gets her a lanyard, a journalist writes a five-star review (fame), a bouncer puts her on every guest list on the street, a night-bus driver knows where somebody got off (a tip), a gang lieutenant calls the gangs off (gang heat 0), a luthier's apprentice sets up her guitars (+1 tone), a DJ plays her at peak time (fame) |
| **tribute jam** | her tribute band's guitarist plays her songs the way Neo remembers them; she learns them back (`3 + 0.5 × gap` guitar XP, once a night) |
| **tribute duel** | the duel engine against the Blackbird Neo remembers (her guitar expectation + 2), with a home-crowd edge |
| **stand-in** | tonight's guitar booking elsewhere, played by the tribute guitarist in her jacket: half the fee, no letdown; 15% they're spotted (a fame scandal) |
| **shrine** | a guitar off the shrine wall that the members swear was hers (it is: `resurface`), if she can talk them out of it |

A club round her block makes the myth acts (the riot, the march, the storm, down with the police, the teardown) 5% likelier
(`mythOdds`).

## 4. People

The president (the owner; starts warm), superfans (their jobs), members (ephemeral, warm), the tribute guitarist (always, with the
tribute-band trait or a stage); a Clearance spy, off-duty cops or gang members by trait.

## 5. Rows (`content/fanclubafford.ts`, `content/fanclubevents.ts`)

42 rows: reading her own shrine (her deaths as close calls), lighting a candle, signing her own membership book (member number one),
the members' couch (lie low: heat down, health back), curating the photo wall, the setlist archive, the bootleg library (guitar XP
by how far she has fallen), adding a verse to the lyric wall, a surprise set on the tribute stage, a cut of the counterfeit merch,
designing a shirt, a column in THE NEST, the petition (Muse loosened on the block), a request on the pirate station, the dragon log,
free noodles; a speech to the members, flirting with a fan, the selfie line, the president's spreadsheet, the subs tin, spinning a
death, fan mail, mustering the club (an hour of crowd cover on the block); members' night, walking into her own vigil, defending the
clubhouse from Muse drones, joining her own tribute band in a wig, an election, the raffle, guiding newcomers (fans in districts she
has never played), the rival club's feud, a lookalike contest she comes fourth in, dating a bootleg by ear, planning "the big one"; her
first fan's ticket stub, lying in her own chalk outline, the better tribute's lesson, a LUMINA unit that joined, deprogramming a cult of
herself, a time capsule from a previous Blackbird (a recording at her old grade), forgiving the ghost guitarist (her ghost takes stay
secret), her museum.

## What was built

As above. Code: `content/fanclubs.ts`, `content/fanclubafford.ts`, `content/fanclubevents.ts`, `fanclub.ts`; `addVenue` and
`EMERGENT_SLOT` in `mapgen.ts`; `fanclubTick` in `run.ts`; `clubNear` in `myth.ts`. Tests: `fanclub.test.ts` (the shared suite runs on
a club opened in a test city).

Open: Muse raids as an event rather than a situation; superfans in the institutions themselves (a sergeant at the precinct desk who
already knows her) rather than only at the club; a club that closes when its block's fans drain away.
