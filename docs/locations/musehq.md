# Location spec: Muse buildings (Muse Tower and friends)

**Status:** IMPLEMENTED (see "What was built"). Numbers are starting points, not tuned (CLAUDE.md, "feel over balance").

## 0. Decided

- **Concept** (from the guitar-track location proposals, approved): Muse's answer to an Atlas outpost, a building to get *up*. It
  turns Muse's attention into something in a room she can steal, edit or burn (**the file**), and gives the deferred **wedge** (10c in
  `GUITAR_PLAN.md`) a place to happen.
- **Shape:** a **lot** on the shared music-venue machinery; the floors are rungs of **clearance**, not child rooms.

## 1. How the three principles shape it

| Principle | In practice |
|---|---|
| Maximalism | 8 variants × 12 shells × sizes, conditions, tiers × 0-3 of 26 traits × 14 situations (a new one daily) × 8 wild cards; 30 features over four rungs |
| Unbalanced | deleting her file resets Muse's whole ladder on her; a forged contract makes Muse believe she is signed (no strike teams, twice the bookings); ALL CHANNELS is a citywide broadcast; the wedge keeps Atlas off her for nights |
| Multidimensional | 61 rows over 24 skills; the climb alone takes charm, persuasion, grifting, sneaking, athletics, reflex, tinkering, hijacking, lockpicking, art, sleight or speaking (and her fans) |

## 2. Concept

A pastel building with a heart on top that beats in time with LUMINA, an open lobby, and everything else by lanyard. Muse is warm
in every sentence and armed in every stairwell: the security apologises before every takedown. Atlas is a co-branded safety screen in
the lobby, an insurance plaque on the vault, one floor the lifts skip, and Gluttony's people measuring the furniture.

## 3. The clearance ladder (`musehqkit.ts`, `CLEARANCE` in `content/musehqs.ts`)

| Rung | Floors | Features |
|---|---|---|
| 0 | the lobby | reception, fountain, LUMINA hologram, merchandise floor, turnstiles, tour desk, fan wall, coffee bar |
| 1 | staff | canteen, open-plan, press room, focus-group room, service lift, cleaning cupboard, wellness pods, smoking terrace, mailroom, rehearsal hall |
| 2 | secure | records room (her file), evidence room, contracts room, LUMINA's bay, master vault, server room, security hub, legal floor |
| 3 | executive | executive suite, broadcast control, helipad, board room |

Her rung (`counters['museclear:<id>']`, for the night) is the highest of: what she has climbed to, a Muse lanyard (1), a forged
badge or Inspiration armour (2), a Muse contract (2); a fire drill, a walkout or a power cut adds one. Ways up: talk past reception,
peel off the tour, vault or hack the turnstiles, a cleaner's uniform and the master-key trolley (2), the service lift (one more),
a forged badge, a lifted lanyard, her fans flooding the lobby (2), the server room's access list (3), a friendly executive (3), an
empty building (3). Caught on the wrong floor: back to the lobby, Muse heat, often an Inspiration team, and a one-in-four ban.

## 4. What is upstairs

| Row | What it does |
|---|---|
| **delete the file** | Muse forgets she refused, broke a contract or was ever lettered; quiet for two nights; pull loosened round the block |
| **forge the file** | a contract she wrote: Muse believes she is signed (`muse.forged`) |
| **read the file** | who reports on her; Muse heat down |
| **reclaim a guitar** | one of hers, confiscated "for safekeeping" in a previous life (a signature guitar), once per building |
| **free artists** | eleven contracts shredded: fame, pull loosened |
| **her own contract** | shredded: out of the contract with no breach |
| **LUMINA** | patch her (warmth +2), jailbreak her (free; Muse quiet three nights), bump her version by hand |
| **the vault** | a royalty float; or her own masters back (her Muse-label records pay her in full) |
| **server room** | write herself onto the executive list |
| **security hub** | every Inspiration team in the district sent to a laundromat; Muse heat to 0 |
| **legal floor** | a hole in her warrant: police heat to 0 |
| **the wedge** | leave Gluttony's takeover plan on Muse's desk (`legacy.atlasBusyUntil`: Atlas retrieval teams far rarer for three nights, Atlas heat wiped); or doctor the books Atlas is buying (Muse quiet five nights, pull down across the city, Atlas furious) |
| **ALL CHANNELS** | once: fans in 6-10 places she has never been, pull loosened, +12 fame base, a chance it charts |
| **helipad, board room, safe** | a joyride (all heat to 0), Muse's plans for her, petty cash |

Wild cards: a room of every version of her (XP in her best skill), LUMINA awake and asking for her, Atlas M&A's man inside (sell
him a napkin of numbers), the yearly public open mic on every channel, her own old guitar in a case, a friendly executive, a haunted
floor, ENCORE's office. Situations: a LUMINA update, a press conference, signing day, a fire drill, an Atlas audit, a blackout, a
lockdown, a launch party, a walkout, a big tour, an executive visit, a live broadcast, an Inspiration drill, a confiscation sweep.

## What was built

Code: `content/musehqs.ts` (tables, `CLEARANCE`), `musehqkit.ts` (the ladder, `caught`, `loosen`, `confiscated`),
`content/musehqafford.ts` (the climb, the lobby and staff floors, outside), `content/musehqevents.ts` (secure and executive floors,
wild cards, situations), `musehq.ts`; `legacy.atlasBusyUntil` read in `run.ts`'s Atlas retrieval-team roll; `MuseFile.forged`.
Tests: `musehq.test.ts` (plus the shared `venuetestkit.ts`).

Differences from the pitch: the floors are rungs of clearance on one location rather than child rooms (the hub's single-floor shape,
so it rides the shared machinery). The confiscated guitars are rolled now; once instruments carry their history (the luthier), the
evidence room hands back real ones.

Open: Muse's executives and LUMINA as bosses in a fight on the top floor; a forged contract that Muse eventually audits; board hooks
(Gluttony at his own table).
