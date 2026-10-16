# Location spec: Pawn Shop / Hock Den

**Status:** DRAFT (becomes IMPLEMENTED when "What was built" is filled in). Everything is **PROPOSED** unless it is in
"Decided". Numbers are starting points; they are not tuned (principle 2).

## 0. Decided

- **Concept:** a pawn shop (author-approved after the review pitch).
- **No tickets.** The author ruled out the loan-and-ticket mechanism as overdone. Instead: she can **hock** an item, and
  it **stays on the shelf for a while** with her name on it; she can try to **buy it back** while it is there. There is
  no ticket book, no due date to track and no new hero state: the shop's shelf *is* the state (§8).
- **Shape:** a **lot** (a full place on a street, with rooms), the default for the protocol.
- **Frequency:** about one per twelve streets.

## 1. How the three principles shape this spec

| Principle | In practice |
|---|---|
| Maximalism | A pawn shop is rolled from independent axes: 10 variants × 12 shells × 5 sizes × 5 conditions × 5 tiers × ~40 traits × ~18 situations × 8 wild cards, plus 11 room kinds and ~45 features. Two shops rarely match. |
| Unbalanced | The wild cards break rules on purpose (a broker who is always right, an item that comes back, a sting, a fire sale, a bottomless till). Prices and hold times are untuned. Nothing is clamped for fairness; the limits are the world's: the broker's till is finite, the shelf is finite, an item bought is gone. |
| Multidimensional | Every skill, stat and drive has at least one row here (the coverage test). Rows have soft requirements and read the *same* odds machinery as the gym. Nothing says "thief" or "fighter". |

## 2. Concept

Neo sells everything as a subscription, including your own stuff. The pawn shop is where a thing becomes a number and the
number becomes a Tuesday. Blackbird hocks a thing, the broker writes a figure on a tag and puts it in the window, and it
sits there looking at her. For a thief it is a fence and a heist target; for a tinkerer it is a bin of "untested"
miracles; for a hustler it is the best haggling in the city; for a flirt it is a counter with an audience; for a
musician it is a wall of other people's guitars; for a hacker it is the serial-number scanner. Every shop is also a
museum of other people's worst week, and punches up: the brokers are fair and the *scanners* are not. Atlas is
wallpaper: an "Asset Wellness Partner" sticker, a mandatory serial scanner that reports to a very cheerful database. In
the franchise variant Atlas is the operator, and the place she can never join.

## 3. Placement

- **Role / kind:** `GenRole 'pawn'` and `'pawnroom'`; `Location.kind 'pawn'` for both. Rooms get rosters by role.
- **Own random streams:** `pawnchance:${worldSeed}:${streetId}` for whether a street has one, `pawn:${worldSeed}:${id}` for
  the roll, `pawnstock:${worldSeed}:${id}:${day}` for stock. The slot is added **after the gym's**, after everything else
  on the street, so **no existing map changes** and `LOTS` is untouched.
- **Chance a street has one (`PAWN_CHANCE`):** market 0.10 · nightlife 0.06 · tenement 0.10 · industrial 0.05 · corporate
  0.02 · slum 0.12 (about 1 in 12).
- **Variant weights by district** (`PAWN_VARIANT`; 0 = never, absent = 1): market loves classic, jeweller, collectibles,
  consignment; nightlife loves instruments and chrome; tenement and slum love classic, hardware and the van; industrial
  loves hardware, chrome and arms; corporate loves the Atlas franchise and consignment.
- **Security, crowd, faction:** security from variant + shell + condition + traits; faction `v:<id>` (a venue faction),
  so killing the owner shuts the shop (like the Halo and the gym).

## 4. A shop is a point in a space

Rolled once, from the shop's own stream, and stored on `Location.pawn`. Axes are independent: incoherent shops are the
good ones.

- **Variant** (what it mostly is; each has 14 names, 4 blurbs, 2 Atlas wall lines, an offer fraction, a daily rate, a
  hold time and a stock table): **classic** hock shop · **jeweller** (watches, rings, loupes) · **instruments**
  exchange · **hardware** (tools and kit) · **chrome** (implant "buy-backs", tech) · **arms** (the licensed weapons
  locker) · **collectibles** (memorabilia, relics, props) · **Atlas "Safe-T Asset Partner"** franchise · **consignment**
  boutique · **stall** (a van; the shop that moves).
- **Shell (12):** a shuttered bank branch · a laundromat's back half · a shipping container · a tram ticket office · an
  old betting shop · a church crypt · a car-park ground floor · a tenement shopfront · a decommissioned Atlas kiosk · an old
  cinema box office · a ferry-terminal kiosk · a market stall under a railway arch.
- **Size** (closet, small, medium, large, sprawl): feature slots and rooms. **Condition** (derelict .. immaculate): security,
  graffiti. **Tier 1-5:** how good the appraiser is, how rich the stock and the till are, what the broker will pay.
  Tier is independent of everything else.
- **Traits (0-3 of ~40):** *ownership* a fence's front · a retired fighter · Atlas · a very old family · a trust · squatted ·
  an influencer; *tone* a parrot appraises · hygienic · "as is, as was" · silent · themed · sponsored; *access* cash only ·
  no cameras · members only · open all night · store credit only · a tab; *scene* where a famous thing was hocked · being
  sold · a feud with the shop across the road · an Atlas inspection regular · a gang's drop · a cult of collectors; *kit*
  an appraisal bench · a robot clerk · a live-stream rig · a huge safe · a vault · a pigeon coop · a mirror showroom · an
  amp; *quirks* a broker who remembers everything · labels in a dead language · prices in a minted-nowhere currency · a
  pet · a "no returns" tattoo. They may contradict.
- **Situation (0-1, a pure function of the clock, ~18):** a forfeit sale · an Atlas serial sweep · a rival's hot goods in the
  back · a celebrity's guitar in the window · a gang collecting a debt · the vault flooded · a "buy nothing" week · a
  wedding-ring rush · a heist being cased · a power cut · a lost dog · a funeral clear-out · a stock-take · an auction night ·
  a raid rumoured · a new broker on trial · a shipment in · a tourist coach.
- **Wild cards (about 1 in 12, 8):** the always-right broker · the item that keeps coming back · the sting · the famous
  vault · the counterfeit shop that beats the real thing · the fire sale that never ends · the bottomless till · every
  display is a trap.

## 5. Rooms and features

- **Rooms (11)**, each optional and with its own chance by variant/size/shell: **office** (guarded; ledger, safe) ·
  **vault** (locked, often hidden; the high-value shelf) · **workshop** (repair bench) · **showroom** (display cases,
  mirrors) · **parlour** (a back-room card table) · **loading bay** (hot goods in and out) · **cellar** · **roof** ·
  **vent crawlspace** · **back alley** · **cage** (the grilled weapons/chrome cage).
- **Features (~45)** are the objects rows hang off, each in a room: counter, window display, display case, jewellery
  case, instrument wall, tool wall, weapons cage, chrome shelf, curio shelf, bargain bin, scale, appraisal bench, ledger,
  safe, vault door, grille, CCTV console, serial scanner, notice board, appraising parrot, shop cat, vending machine,
  card table, jukebox, try-on mirror, practice amp, tip jar, repair bench, scrap bin, junk pile, hatch, skylight, vent
  grille, side door, loading door, bin fire, mannequin, antique clock, stuffed thing, trophy wall, a rail of formal wear,
  umbrella stand, returns box, door bell, and a few more.

## 6. People

Archetypes cast by room and variant: **pawn_broker** (the owner; killing the owner shuts the shop), **pawn_clerk**,
**pawn_appraiser** (the eye; trainer-equivalent for odds), **pawn_tinker** (workshop), **pawn_guard** (grille, armed),
**pawn_regular** (the crowd, ephemeral: people turning things in or looking), **pawn_fence** (loading bay and parlour; a
crook with paper, 55% have a bounty), a **robot clerk** when the trait says so (reuses `sparring_bot`-style robot
archetype `pawn_bot`), plus reused `atlas_rep`, `ganger`, `cop`, `street_kid` (adults, TONE.md). Visitors that
situations bring: gang collector, inspector, a celebrity's assistant, an auctioneer. Names via the person generator;
pronouns by token.

## 7. Affordances: what each capability sees

The row schema is `affordances.ts`'s (`id, place:'pawn', where, needs, sees, stakes, consequence, drives, run`). Rows with
real state use the pawn kit's stateful actions: **hock**, **buy back**, **buy**, **sell outright**, **lift from a lot**,
**swap**, **vault haul**. Every other row is a data-described check (`runCheck`). Target 70+ rows across `pawnafford.ts`
(money, craft, the crowd), `pawncrime.ts` (stealth and the dark side) and `pawnevents.ts` (situations, wild cards,
variant-only).

| Capability (open set) | Sees | Does |
|---|---|---|
| **greed, haggling, streetwise** | the counter, the offer, the gap between offer and "real" price | Hock an item, haggle the offer up, redeem it, buy a lot cheap |
| **hustling, cards, grifting** | the back-room table, the swap, the "lost ticket" story | Run a shift at the till; play cards in the parlour; swap a fake for a real lot; con a mark in the queue |
| **sleight, lockpicking, sneak** | the display case, the vault, the loading bay | Lift from a lot; crack the vault; slip in the bay; tail the broker to the fence |
| **hack** | the serial scanner, the ledger terminal, the CCTV console | Wipe a serial; erase the hock log; open the partner portal |
| **tinkering, scavenging, art** | the bargain bin, the repair bench, the empty window | Fix goods for pay; pick the bin; paint the shopfront or forge provenance |
| **music, guitar, vocals, djing, beatbox** | the instrument wall, the practice amp, the jukebox | Test an instrument and busk; a lunchtime set; a battle in the back |
| **romance, dancing, charm** | the try-on mirror, the counter audience, a ring rush | Flirt over the jewellery case; a mirror-and-music moment; charm a better offer |
| **intimidation, melee, muscle, bravery (drive)** | the broker, the loading door, a debt-collector | Lean on the broker for a better rate; a scrap with a collector; wrestle a heavy item |
| **mixology, cooking, tolerance, medicine** | the vending machine, a noodle stall out front, a dubious bottle, the "as is" bin | Work the stall; test the dubious bottle; treat a regular |
| **rapport** | the parrot, the shop cat, a caged thing in the window | Befriend; the cat leads to a stash; the parrot gives a price |
| **cards, pool, throwing, marksmanship** | the card table, the dartboard, the cage | Win a game for goods; dart a rival's poster; test a pistol (not loaded) |
| **dancing, athletics, reflex** | the ring rush, the roof, the skylight | Dash a rush; haul a heavy item; reflex-catch a falling thing |
| **curiosity, quest (drive)** | the item with a past, the locked vault, a situation | Find out where it came from; find the vault's secret; take the heist |
| **pride, lust, thirst (drive)** | the champion's belt on the wall, the jewellery case, the vending machine | Reclaim her stuff; admire; a drink |
| **implants, items, kill goal** | the chrome shelf, instruments as keys, the broker's rival | A buy-back; an item as a bribe; murder the owner (shuts the shop) |
| *(your next capability goes here)* | | |

**Wild cards** (one row or modifier each): the broker who is always right (offers are the true value and buy-backs cost
double); the cursed item that keeps coming back; the sting (every hocked item is scanned; Atlas heat jumps); the vault
of one famous person's things; the counterfeit shop (stock is fake sometimes); the fire sale (house stock at 30%); the
bottomless till (broker pays 1.5x and never runs out); every display is a trap (harsher failures).

## 8. Systems

- **The shelf is the state.** `Location.shelf: PawnLot[]` on the shop. A lot is an item plus how it got there: *hers*
  (`hers: true`, with `paid`, the cash she took, and the day it was hocked) or the house's own stock. No hero state, no
  ticket book, nothing to migrate: an old save has no shelf and loads as none.
- **Hock.** She picks an item (not her equipped gear, not her best melee backup) and takes a cash offer: a fraction of
  its value (variant, tier, traits, today's situation, her haggling and the appraiser) capped by what the broker's till
  holds (finite, and it goes down as the broker pays). The item goes on the shelf as hers.
- **Buy back.** While it is **held** (a few days; variant and traits move it) she can redeem it for what she was paid
  plus interest that grows each day. After the hold it is **forfeit**: still on the shelf, now for a retail price (a
  markup on the item's value), for a short grace. Then it **sells on** and is gone. All of this is a pure function of
  the day, resolved when the shelf is next looked at, so it cannot desync.
- **Buy.** Any lot on the shelf can be bought, with a haggling check; the house restocks a little each day from the
  variant's table, so stock turns over, and the finite shelf is the limit.
- **Hot goods.** Gang, corporate and dragon items are "hot": some brokers refuse, some report her (heat), some pay
  double. A **lifted** lot is hot to this shop forever.
- **What limits it:** the till, the shelf, the day, the broker's memory (affinity), the serial scanner, the cameras.
- **Quest and equipped items are safe:** the equipped weapon and armor are never hocked; neither is an item tagged
  `key` or `trophy` in a way a goal needs.

## 9. Setting texture and hard rules

- **Texture:** fee ✓ (a loan "arrangement fee", store credit) · brand ✓ · Atlas presence ✓ (the scanner, the franchise) ·
  specific number ✓.
- **Hard rules:** (1) Blackbird opposes Atlas; the franchise is her natural enemy, not a place she could join. (2) Nothing
  grim: the sting is a nuisance, the pit of despair is not a thing; things go on shelves, not people. (3) Punch up: jokes
  land on the scanners, the franchise, the "as is" signs and the brokers' ledgers, never on the poor who have to hock.
  The customers are never the butt. (4) Invented brands only; every name is grepped. (5) The broker and the clerks have
  agency and can refuse her. (6) Adult, not explicit.

## 10. Engine touchpoints

| File | Change |
|---|---|
| `types.ts` | `GenRole` + `Location['kind']` gain `pawn`, `pawnroom`; `Location.pawn?: PawnInfo`, `pawnRoom?`, `shelf?: PawnLot[]` |
| `content/pawns.ts` (new) | variants, shells, traits, situations, wild, rooms, features, `rollPawn`, `pawnRoster`, stock tables |
| `placekit.ts` (new) | the generic parts lifted out of `gymkit.ts` (`fmt`, `say`, `Result`, `Check`, `applyResult`, `runCheck`, `find`); `gymkit.ts` now uses it |
| `pawnkit.ts` (new) | the view, the shelf, hock / buy back / buy / sell / lift / swap / haul, `tickPawns` |
| `content/pawnafford.ts`, `pawncrime.ts`, `pawnevents.ts` (new) | the rows |
| `pawn.ts` (new) | candidates and `describePawn` |
| `mapgen.ts` | `PAWN_CHANCE`, the `pawnchance:` stream and the slot after the gym's, `sketch`, `expand` case, BLURB/KIND/nameFor |
| `content/archetypes.ts`, `content/items.ts`, `roster.ts` | people and goods; ROSTERS row |
| `combat.ts`, `shutdown.ts`, `stage.ts`, `clock.ts`, `run.ts`, `text.ts`, `grid.ts`, `interactions.ts`, `bounty.ts` | hooks as the protocol lists |
| `scripts/pawns.ts`, `scripts/coverage.ts`, `package.json` | `npm run pawns`; coverage includes pawn |

## 11. Tests

`pawn.test.ts`, after `gym.test.ts`: determinism; tables only name things that exist; a wide space; district shaping;
existing maps unchanged (the pawn slot is after all the others, gym's included); people are cast; every row's `where`
names real things; coverage test (every capability served); situations are a pure function of the clock; a forced run of
every row; and the place-specific rules: hocking pays and puts the item on the shelf as hers; buying it back costs more
the longer she waits; a forfeit lot is dearer; an expired lot is gone; the till is finite; equipped gear is never
hocked; the owner dead shuts the shop; an old save with no shelf loads.

## 12. Coverage

Run `npm run coverage` after building; list thin spots in "What was built".

## 13. Open items

1. **Whether the Atlas franchise can ever be shut down by a single act** (PROPOSED: only by killing its manager, like
   any owner).
2. **Hocking a quest item** (PROPOSED: tagged items are refused with a line, not hidden).
3. **Pawn rows at other places** (a back-street fence, the Halo) via the same kit: not in v1.
